<script setup>
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  ArrowLeft, VideoPlay, Files, Document, Cellphone, Refresh, Monitor, Connection, Clock, Key, Download,
} from '@element-plus/icons-vue'
import { getDeviceList, sendCommand, setDevicePassword } from '@/api/device'
import { getBaseUrl } from '@/utils/config'
import { wsGetDeviceList } from '@/api/wsAppGraph'
import { displayDeviceSn, formatDeviceType, isClawDevice } from '@/utils/deviceDisplay'
import { formatRelativeTime } from '@/utils/relativeTime'
import { dedupeDevicesForUi } from '@/utils/devices'
import { pullClawNodeLogsToClipboard, formatLogSize, unbindClawNode, uploadApkForClawInstall } from '@/api/clawnode'
import { notifyDeviceUnbound } from '@/utils/globalLanDiscovery'
import { removeKnownClawNode } from '@/utils/knownClawNodes'
import ScrcpyWindow from '@/views/WorkflowEditor/components/ScrcpyWindow.vue'
import './settings-ui.css'

const route = useRoute()
const router = useRouter()
const loading = ref(true)
const devices = ref([])
const commandForm = reactive({ command: '', params: '{\n  \n}' })
const sending = ref(false)
const passwordForm = reactive({ sn: '', password: '' })
const settingPassword = ref(false)
const scrcpyVisible = ref(false)
const pullingLogs = ref(false)
const logWindowMinutes = ref(5)
const logWindowOptions = [5, 15, 30, 60]
const relativeTimeTick = ref(0)
const upgrading = ref(false)
const apkForm = reactive({ url: '', fileName: '' })
const installingApk = ref(false)
const selectedApkFile = ref(null) // 本地文件（支持 Mac 上已挂载的 SMB 卷）
let relativeTimer = null

const routeSn = computed(() => decodeURIComponent(String(route.params.sn || '')))

const device = computed(() => {
  const key = routeSn.value
  return devices.value.find((d) => d.sn === key || displayDeviceSn(d) === key) || null
})

const displaySn = computed(() => (device.value ? displayDeviceSn(device.value) : routeSn.value))
const isAndroid = computed(() => formatDeviceType(device.value || {}).includes('android'))
const isClaw = computed(() => device.value && isClawDevice(device.value))
const isOnline = computed(() => device.value?.status === 'online')

const lastOnlineText = computed(() => {
  void relativeTimeTick.value
  return formatRelativeTime(device.value?.last_online)
})

const statItems = computed(() => {
  if (!device.value) return []
  return [
    { key: 'type', label: '类型', value: formatDeviceType(device.value), icon: Monitor },
    { key: 'role', label: '角色', value: device.value.role || '—', icon: Connection },
    { key: 'model', label: '型号', value: device.value.model || '—', icon: Cellphone },
    { key: 'ip', label: 'IP', value: device.value.ip || '—', icon: Connection },
    { key: 'version', label: 'ClawNode', value: device.value.app_version || '—', icon: Document },
    { key: 'last', label: '最后在线', value: lastOnlineText.value, icon: Clock },
  ]
})

const loadDevices = async () => {
  loading.value = true
  try {
    try {
      const res = await wsGetDeviceList()
      devices.value = dedupeDevicesForUi(Array.isArray(res) ? res : (res?.data || []))
    } catch {
      const res = await getDeviceList()
      const list = Array.isArray(res) ? res : (res?.data || [])
      devices.value = dedupeDevicesForUi(list)
    }
  } finally {
    loading.value = false
  }
}

const goBack = () => router.push({ name: 'SettingsRuntime', query: { tab: 'cluster' } })

const submitCommand = async () => {
  if (!device.value || !commandForm.command.trim()) {
    ElMessage.warning('请输入指令名称')
    return
  }
  let params = {}
  try {
    params = JSON.parse(commandForm.params)
  } catch {
    ElMessage.error('参数必须是合法的 JSON 格式')
    return
  }
  sending.value = true
  try {
    const cmdName = commandForm.command.trim()
    // 统一使用后端当前接受的 command + params 格式。
    // ClawNode 1.7.23+ 已与 server 使用同一套格式（command + params），
    // server 直接下发即可，无需特殊翻译。
    await sendCommand({ sn: device.value.sn, command: cmdName, params })
    ElMessage.success('指令已发送')
  } catch (e) {
    ElMessage.error(e?.message || '发送失败')
  } finally {
    sending.value = false
  }
}

const savePassword = async () => {
  if (!device.value) return
  settingPassword.value = true
  try {
    const res = await setDevicePassword({ sn: device.value.sn, password: passwordForm.password })
    if (res?.code === 200) {
      ElMessage.success('密码已保存')
      device.value.password = passwordForm.password
    } else {
      ElMessage.error(res?.msg || '保存失败')
    }
  } catch (e) {
    ElMessage.error(e?.message || '保存失败')
  } finally {
    settingPassword.value = false
  }
}

const openTransfer = () => {
  router.push({ name: 'SettingsRuntime', query: { tab: 'cluster', transfer: device.value?.sn } })
}

const performReboot = async () => {
  if (!device.value || !isOnline.value) return
  sending.value = true
  try {
    // 兼容不同设备类型；ClawNode 侧由 server 翻译或通过 shell 执行
    await sendCommand({ sn: device.value.sn, command: 'reboot', params: {} })
    ElMessage.success('重启指令已发送')
  } catch (e) {
    ElMessage.error(e?.message || '重启失败')
  } finally {
    sending.value = false
  }
}

const pullLogs = async () => {
  if (!device.value || pullingLogs.value) return
  pullingLogs.value = true
  const loadingMsg = ElMessage.info({ message: '正在拉取日志，完成后将自动复制到剪贴板…', duration: 0, showClose: false })
  try {
    const result = await pullClawNodeLogsToClipboard(device.value.sn, { minutes: logWindowMinutes.value })
    loadingMsg.close()
    ElMessage.success(`日志已复制到剪贴板（${formatLogSize(result.size || result.contentLength)}）`)
  } catch (e) {
    loadingMsg.close()
    ElMessage.error(e?.message || '拉取日志失败')
  } finally {
    pullingLogs.value = false
  }
}

const upgradeToLatest = async () => {
  if (!device.value || upgrading.value) return
  if (!isOnline.value) {
    ElMessage.warning('设备不在线，无法升级')
    return
  }

  try {
    await ElMessageBox.confirm(
      `确定让设备 ${displaySn.value} 升级到 ClawNode 最新版本？\n将通过 server 下发 INSTALL_APK（设备后台下载，系统安装通常仍需在设备上点确认）。`,
      '一键升级到最新版',
      { type: 'warning', confirmButtonText: '立即升级', cancelButtonText: '取消' }
    )
  } catch {
    return
  }

  upgrading.value = true
  try {
    const res = await fetch('https://raw.githubusercontent.com/pengchengluoyi/ClawNode_app/main/latest.json', {
      cache: 'no-store',
    })
    if (!res.ok) throw new Error(`获取版本信息失败 (${res.status})`)
    const manifest = await res.json()
    const url = manifest?.download_url
    const fileName = manifest?.apk
    if (!url) throw new Error('latest.json 中未包含有效的 download_url')

    // ClawNode 与 server 已统一使用 { command, params } 格式，直接下发。
    await sendCommand({
      sn: device.value.sn,
      command: 'INSTALL_APK',
      params: {
        url,
        ...(fileName ? { file_name: fileName } : {}),
      },
    })
    ElMessage.success('升级指令已发送，设备正在后台下载最新 APK...')
  } catch (e) {
    ElMessage.error(e?.message || '发送升级指令失败')
  } finally {
    upgrading.value = false
  }
}

/**
 * 通过 server 下发 INSTALL_APK，支持安装任意 App（或指定版本）。
 *
 * 支持两种来源：
 * 1. 网络 URL（http/https）
 * 2. 本地文件（桌面端文件选择器，可选择 Mac 上通过 SMB 挂载的共享中的 APK）
 *
 * 对于 smb:// 直接输入的地址，会以 smb_path 形式下发，由 server 负责拉取后转为设备可下载的 HTTP URL。
 *
 * ClawNode 1.7.23+ 与 server 使用同一命令格式（command + params）。
 */
const installArbitraryApk = async () => {
  if (!device.value) return
  if (!isOnline.value) {
    ElMessage.warning('设备不在线')
    return
  }

  const hasLocalFile = !!selectedApkFile.value
  const hasUrl = !!apkForm.url.trim()

  if (!hasLocalFile && !hasUrl) {
    ElMessage.warning('请输入下载地址，或选择本地/SMB文件')
    return
  }

  installingApk.value = true
  try {
    let finalUrl = ''
    let finalFileName = apkForm.fileName.trim() || (selectedApkFile.value?.name || '')

    if (hasLocalFile) {
      // 本地文件（Mac 本地磁盘 或 已通过访达挂载的 SMB 共享里的文件）
      // 会先上传到当前连接的 MiniOrange Server，然后构造设备可 HTTP 下载的地址
      const { url, filename } = await uploadApkForClawInstall(selectedApkFile.value)
      finalUrl = url
      if (filename) finalFileName = filename
      if (!finalUrl) throw new Error('文件上传后未返回可下载地址')

      // 给用户更明确的提示：上传成功，但设备下载还需要后端能提供该 URL
      ElMessage.info({ message: '文件已上传到服务器，正在下发安装指令…', duration: 2500 })
    } else {
      const input = apkForm.url.trim()
      finalUrl = input
      // 直接支持输入 smb:// 路径（由 server 负责从 SMB 下载并提供 HTTP URL 给设备）
      if (input.startsWith('smb:') || input.startsWith('SMB:')) {
        // 使用 command + params 格式（后端当前可接受），由 server 检测 smb_path 后转换为节点 action
        await sendCommand({
          sn: device.value.sn,
          command: 'INSTALL_APK',
          params: {
            smb_path: input,
            ...(finalFileName ? { file_name: finalFileName } : {})
          }
        })
        ElMessage.success('已下发 SMB 安装指令，server 将从 SMB 获取 APK 后推送给设备')
        return
      }
    }

    // 标准 HTTP 下载路径（本地上传后或直接 URL）
    // 统一使用 command + params 格式，避免后端 /device/command 422
    await sendCommand({
      sn: device.value.sn,
      command: 'INSTALL_APK',
      params: {
        url: finalUrl,
        ...(finalFileName ? { file_name: finalFileName } : {}),
      },
    })

    if (hasLocalFile) {
      ElMessage.success({
        message: `安装指令已发送。设备将尝试从 ${finalUrl} 下载 APK`,
        duration: 6000
      })
      // 额外提示后端 serving 问题
      console.info('[ClawNode APK] 下发使用的下载地址：', finalUrl)
    } else {
      ElMessage.success('安装指令已发送，设备将自动下载并触发安装（可能需设备端确认）')
    }
  } catch (e) {
    const msg = e?.message || '发送安装指令失败'
    // 特别提示后端实现问题
    if (msg.includes('404') || msg.toLowerCase().includes('not found')) {
      ElMessage.error('上传接口不存在（404）。请先在服务端实现 POST /api/clawnode/apks 或确保 WebSocket upload 后的文件可通过 /api/clawnode/apks 下载。')
    } else {
      ElMessage.error(msg)
    }
  } finally {
    installingApk.value = false
  }
}

function pickLocalApk() {
  if (!device.value) return
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.apk,application/vnd.android.package-archive'
  input.onchange = (e) => {
    const file = e.target.files && e.target.files[0]
    if (file) {
      selectedApkFile.value = file
      apkForm.fileName = file.name
      // 清空 URL 模式，避免混淆
      apkForm.url = ''
    }
  }
  input.click()
}

function clearLocalApk() {
  selectedApkFile.value = null
  apkForm.fileName = ''
}

const handleUnbind = async () => {
  if (!device.value) return
  try {
    await ElMessageBox.confirm(`确定解绑设备 ${displaySn.value}？`, '解绑设备', { type: 'warning' })
    await unbindClawNode(device.value.sn)
    notifyDeviceUnbound(device.value.sn, displaySn.value)
    removeKnownClawNode(device.value.sn, displaySn.value)
    ElMessage.success('设备已解绑')
    goBack()
  } catch (e) {
    if (e !== 'cancel' && e?.message !== 'cancel') ElMessage.error(e?.message || '解绑失败')
  }
}

onMounted(async () => {
  await loadDevices()
  if (device.value) {
    passwordForm.sn = device.value.sn
    passwordForm.password = device.value.password || ''
  }
  relativeTimer = setInterval(() => { relativeTimeTick.value += 1 }, 30000)
})

onUnmounted(() => {
  if (relativeTimer) clearInterval(relativeTimer)
})
</script>

<template>
  <div class="device-detail-page" v-loading="loading">
    <div v-if="!device && !loading" class="empty-state">
      <p>未找到设备 {{ routeSn }}</p>
      <el-button @click="goBack">返回列表</el-button>
    </div>

    <template v-else-if="device">
      <header class="device-hero">
        <button type="button" class="back-link" @click="goBack">
          <el-icon><ArrowLeft /></el-icon>
          返回设备列表
        </button>

        <div class="hero-body">
          <div class="hero-icon-wrap" :class="{ online: isOnline }">
            <el-icon><Cellphone /></el-icon>
          </div>
          <div class="hero-text">
            <div class="hero-title-row">
              <h1>{{ displaySn }}</h1>
              <span class="status-pill" :class="isOnline ? 'online' : 'offline'">
                {{ isOnline ? '在线' : '离线' }}
              </span>
            </div>
            <p class="hero-sub">{{ device.model || '未知型号' }} · {{ formatDeviceType(device) }} · {{ device.role || 'node' }}</p>
          </div>
          <el-button circle :icon="Refresh" @click="loadDevices" />
        </div>
      </header>

      <section class="stat-grid">
        <article v-for="item in statItems" :key="item.key" class="stat-card">
          <el-icon class="stat-icon"><component :is="item.icon" /></el-icon>
          <div>
            <span class="stat-label">{{ item.label }}</span>
            <strong class="stat-value">{{ item.value }}</strong>
          </div>
        </article>
      </section>

      <section class="panel password-panel">
        <div class="panel-head">
          <el-icon><Key /></el-icon>
          <div>
            <h3>锁屏密码</h3>
            <p>用于自动化解锁，仅保存在本地 Server</p>
          </div>
        </div>
        <div class="password-row">
          <el-input v-model="passwordForm.password" placeholder="未设置" show-password />
          <el-button type="primary" :loading="settingPassword" @click="savePassword">保存</el-button>
        </div>
      </section>

      <section class="panel">
        <div class="panel-head">
          <h3>快捷操作</h3>
        </div>
        <div class="action-grid">
          <button type="button" class="action-tile primary" :disabled="!isOnline" @click="performReboot">
            <el-icon><VideoPlay /></el-icon>
            <span>重启设备</span>
          </button>
          <button type="button" class="action-tile" :disabled="!isOnline" @click="openTransfer">
            <el-icon><Files /></el-icon>
            <span>传文件</span>
          </button>
          <button
            v-if="isClaw"
            type="button"
            class="action-tile"
            :disabled="!isOnline || pullingLogs"
            @click="pullLogs"
          >
            <el-icon><Document /></el-icon>
            <span>{{ pullingLogs ? '拉取中…' : `拉取近 ${logWindowMinutes} 分钟日志` }}</span>
          </button>
          <button
            v-if="isClaw"
            type="button"
            class="action-tile accent"
            :disabled="!isOnline || upgrading"
            @click="upgradeToLatest"
          >
            <el-icon><Download /></el-icon>
            <span>{{ upgrading ? '升级中…' : '升级到最新版本' }}</span>
          </button>
          <div v-if="isClaw" class="log-window-picker">
            <span>日志范围</span>
            <el-select v-model="logWindowMinutes" size="small" style="width: 120px">
              <el-option v-for="m in logWindowOptions" :key="m" :label="`最近 ${m} 分钟`" :value="m" />
            </el-select>
          </div>
          <button
            v-if="isAndroid"
            type="button"
            class="action-tile accent"
            :disabled="!isOnline"
            @click="scrcpyVisible = true"
          >
            <el-icon><Cellphone /></el-icon>
            <span>远程投屏</span>
          </button>
          <button v-if="isClaw" type="button" class="action-tile danger" @click="handleUnbind">
            <span>解绑设备</span>
          </button>
        </div>
      </section>

      <section class="panel command-panel">
        <div class="panel-head">
          <h3>下发指令</h3>
          <p>向设备发送自定义命令（ClawNode 设备支持 INSTALL_APK / SET_CLIPBOARD 等，与 server 使用同一格式）</p>
        </div>
        <el-form label-position="top" @submit.prevent>
          <el-form-item label="指令名称" required>
            <el-input v-model="commandForm.command" placeholder="例如: reboot（ClawNode 设备可直接用 INSTALL_APK / SET_CLIPBOARD 等）" />
          </el-form-item>
          <el-form-item label="参数 JSON">
            <el-input v-model="commandForm.params" type="textarea" :rows="6" class="code-input" />
          </el-form-item>
          <el-button type="primary" :loading="sending" :disabled="!isOnline" @click="submitCommand">
            发送指令
          </el-button>
        </el-form>

        <!-- ClawNode 通用能力：支持通过 server 下发 INSTALL_APK 安装任意 App（非仅 Claw 自升级）。
             精简放在“下发指令”区，不污染快捷操作。
             支持：
             - 直接 HTTP/HTTPS URL
             - 本地文件（推荐）：点击“选择文件”后可选取 Mac 本地或已通过访达挂载的 SMB 共享中的 APK
             - 直接输入 smb:// 路径（server 负责从 SMB 拉取后给设备 HTTP 下载地址）
        -->
        <el-divider v-if="isClaw" style="margin: 16px 0 12px" />
        <div v-if="isClaw" class="apk-helper">
          <div class="apk-helper-head">
            <span>安装应用（任意 APK）</span>
            <span class="hint">支持 URL / 本地文件 / SMB 挂载（上传后设备 HTTP 下载）</span>
          </div>

          <!-- URL / SMB 直接输入 -->
          <div class="apk-row" v-if="!selectedApkFile">
            <el-input
              v-model="apkForm.url"
              placeholder="https://.../app.apk   或   smb://服务器/路径/app.apk"
              :disabled="!isOnline"
            />
            <el-input
              v-model="apkForm.fileName"
              placeholder="可选文件名"
              style="width: 140px"
              :disabled="!isOnline"
            />
          </div>

          <!-- 本地/SMB 文件选择 + 操作按钮 -->
          <div class="apk-row" style="margin-top: 6px; flex-wrap: wrap; gap: 6px;">
            <el-button
              size="small"
              :disabled="!isOnline"
              @click="pickLocalApk"
            >
              选择本地 / SMB 文件
            </el-button>

            <template v-if="selectedApkFile">
              <span class="selected-file">
                {{ selectedApkFile.name }}
                <span class="file-size">({{ (selectedApkFile.size / 1024 / 1024).toFixed(1) }} MB)</span>
              </span>
              <el-button size="small" type="text" @click="clearLocalApk">清除</el-button>
            </template>

            <el-button
              type="primary"
              size="small"
              :loading="installingApk"
              :disabled="!isOnline || (!apkForm.url.trim() && !selectedApkFile)"
              @click="installArbitraryApk"
            >
              下发安装
            </el-button>
          </div>

          <div class="smb-hint">
            SMB 使用建议：在 Mac「访达」→「前往」→「连接服务器」输入 <code>smb://IP/共享名</code> 挂载后，点击「选择本地 / SMB 文件」即可直接挑选里面的 APK。<br>
            选择后会先上传到当前服务器，再让设备通过 HTTP 下载安装。<br>
            <strong>注意：</strong>如果上传后设备仍下载失败，说明后端尚未实现 <code>/api/clawnode/apks/&lt;文件名&gt;</code> 的下载服务。
          </div>
        </div>
      </section>
    </template>

    <el-dialog v-model="scrcpyVisible" title="远程投屏" width="460px" destroy-on-close :footer="null">
      <div class="scrcpy-frame">
        <ScrcpyWindow :target-device-id="device?.sn" />
      </div>
    </el-dialog>
  </div>
</template>

<style scoped>
.device-detail-page {
  max-width: 960px;
}

.empty-state {
  padding: 80px 24px;
  text-align: center;
  color: #6b7280;
}

.log-window-picker {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  font-size: 13px;
  color: #64748b;
}

.device-hero {
  margin-bottom: 20px;
}

.back-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 16px;
  padding: 0;
  border: none;
  background: none;
  color: #64748b;
  font-size: 13px;
  cursor: pointer;
}

.back-link:hover {
  color: #334155;
}

.hero-body {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px 22px;
  border: 1px solid #e5e7eb;
  border-radius: 18px;
  background: #fff;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.04);
}

.hero-icon-wrap {
  display: grid;
  place-items: center;
  width: 56px;
  height: 56px;
  border-radius: 16px;
  background: #f1f5f9;
  color: #64748b;
  font-size: 26px;
  flex-shrink: 0;
}

.hero-icon-wrap.online {
  background: #ecfdf5;
  color: #059669;
}

.hero-text {
  flex: 1;
  min-width: 0;
}

.hero-title-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.hero-title-row h1 {
  margin: 0;
  font-size: 20px;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: #0f172a;
  word-break: break-all;
}

.hero-sub {
  margin: 6px 0 0;
  color: #64748b;
  font-size: 13px;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 0 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
}

.status-pill.online {
  background: #dcfce7;
  color: #15803d;
}

.status-pill.offline {
  background: #f1f5f9;
  color: #64748b;
}

.stat-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}

.stat-card {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 16px;
  border: 1px solid #eef2f7;
  border-radius: 14px;
  background: #fff;
}

.stat-icon {
  color: #6366f1;
  font-size: 18px;
  margin-top: 2px;
}

.stat-label {
  display: block;
  font-size: 11px;
  color: #94a3b8;
  margin-bottom: 4px;
}

.stat-value {
  display: block;
  font-size: 14px;
  color: #0f172a;
  word-break: break-all;
}

.panel {
  padding: 18px 20px;
  margin-bottom: 14px;
  border: 1px solid #e5e7eb;
  border-radius: 16px;
  background: #fff;
}

.panel-head {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 14px;
}

.panel-head h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: #0f172a;
}

.panel-head p {
  margin: 4px 0 0;
  font-size: 12px;
  color: #94a3b8;
}

.password-row {
  display: flex;
  gap: 10px;
  max-width: 420px;
}

.action-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 10px;
}

.action-tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 88px;
  padding: 14px 10px;
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  background: #fafafa;
  color: #334155;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.12s ease, box-shadow 0.12s ease, border-color 0.12s ease;
}

.action-tile .el-icon {
  font-size: 22px;
}

.action-tile:hover:not(:disabled) {
  transform: translateY(-1px);
  border-color: #cbd5e1;
  box-shadow: 0 6px 16px rgba(15, 23, 42, 0.06);
}

.action-tile:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.action-tile.primary {
  background: #eff6ff;
  border-color: #bfdbfe;
  color: #1d4ed8;
}

.action-tile.accent {
  background: #fff7ed;
  border-color: #fed7aa;
  color: #c2410c;
}

.action-tile.danger {
  background: #fef2f2;
  border-color: #fecaca;
  color: #b91c1c;
}

.command-panel :deep(.el-form-item__label) {
  font-weight: 600;
  color: #475569;
}

.code-input :deep(textarea) {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 13px;
}

.scrcpy-frame {
  min-height: 360px;
}

/* 精简后的下发指令区内 APK 安装辅助（不增加快捷操作按钮） */
.apk-helper {
  margin-top: 4px;
}
.apk-helper-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 6px;
  font-size: 12px;
  color: #475569;
}
.apk-helper-head .hint {
  color: #94a3b8;
  font-size: 11px;
}
.apk-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.selected-file {
  font-size: 12px;
  color: #334155;
  background: #f1f5f9;
  padding: 2px 8px;
  border-radius: 6px;
  max-width: 260px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.selected-file .file-size {
  color: #64748b;
  margin-left: 4px;
}

.smb-hint {
  margin-top: 6px;
  font-size: 11px;
  color: #64748b;
  line-height: 1.4;
}
.smb-hint code {
  background: #f1f5f9;
  padding: 1px 4px;
  border-radius: 3px;
}

@media (max-width: 720px) {
  .stat-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
