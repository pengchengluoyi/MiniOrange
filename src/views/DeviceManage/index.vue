<script setup>
import {ref, onMounted, onUnmounted, reactive, computed} from 'vue'
import {initWebSocket, addMessageListener, removeMessageListener, sendWsRequest, getConnectedUrl} from '@/api/mWebSocket'
import {setDevicePassword, getDeviceList, sendCommand} from '@/api/device'
import {getServerInfo, scanLanServers as scanLanServersApi, joinCluster, updateConfig} from '@/api/system'
import QRCode from 'qrcode'
import ScrcpyWindow from '@/views/WorkflowEditor/components/ScrcpyWindow.vue'
import {getWsUrl, LOCAL_HOST} from '@/utils/config'
import {
  ElMessage,
  ElCard,
  ElTable,
  ElTableColumn,
  ElTag,
  ElButton,
  ElEmpty,
  ElDialog,
  ElForm,
  ElFormItem,
  ElInput,
  ElIcon,
  ElAlert,
  vLoading,
  ElTabs,
  ElTabPane,
  ElProgress,
  ElSelect,
  ElOption
} from 'element-plus'
import {
  Refresh,
  VideoPlay,
  Monitor,
  Plus,
  Lock,
  Connection,
  Files,
  Folder,
  Document,
  Back,
  Cellphone,
  Setting
} from '@element-plus/icons-vue'

const loading = ref(false)
const deviceList = ref([])

// 指令弹窗相关
const dialogVisible = ref(false)
const currentDevice = ref(null)
const commandForm = reactive({
  command: '',
  params: '{}'
})
const sending = ref(false)

// 添加设备弹窗
const addDeviceDialogVisible = ref(false)
const qrCodeUrl = ref('')
const serverAddress = ref('')
const isLocalhost = ref(false)
const activeAddDeviceTab = ref('mobile')
const isScanning = ref(false)
const scannedServers = ref([])
const targetClusterUrl = ref('')
const joinWarningVisible = ref(false)
const currentServerInfo = ref({ ip: 'Unknown', port: 'Unknown', hostname: 'Unknown', server_name: 'MiniOrange Master' })

// 网络配置相关
const networkDialogVisible = ref(false)
const networkForm = reactive({ external_url: '' })

// 密码设置弹窗
const passwordDialogVisible = ref(false)
const passwordForm = reactive({
  sn: '',
  password: ''
})
const settingPassword = ref(false)

// 投屏相关
const scrcpyDialogVisible = ref(false)
const currentScrcpySn = ref('')

// 文件传输相关
const transferDialogVisible = ref(false)
const activeTransferTab = ref('new')
const transferForm = reactive({
  source_sn: '',
  target_sn: '',
  file_path: '',
  save_path: ''
})
const transferList = ref([]) // 本地维护的传输列表
const startingTransfer = ref(false)

// 文件浏览器相关
const browserVisible = ref(false)
const browserLoading = ref(false)
const browserFiles = ref([])
const browserPath = ref('/')
const browserContext = reactive({sn: '', mode: 'source'}) // mode: source(选文件), target(选目录)

// 统一处理设备列表更新 (保留本地密码状态)
const handleDeviceListUpdate = (data) => {
  const list = Array.isArray(data) ? data : (data?.data || [])
  const newList = Array.isArray(list) ? list : []

  deviceList.value = newList.map(newItem => {
    const oldItem = deviceList.value.find(old => old.sn === newItem.sn)
    if ((newItem.password === undefined || newItem.password === null) && oldItem?.password) {
      return {...newItem, password: oldItem.password}
    }
    return newItem
  })
  loading.value = false
}

// 获取设备列表
const fetchList = async () => {
  loading.value = true
  try {
    const res = await getDeviceList()
    handleDeviceListUpdate(res)
  } catch (e) {
    console.error(e)
    loading.value = false
  }
}

// 打开指令弹窗
const handleCommand = (row) => {
  currentDevice.value = row
  commandForm.command = ''
  commandForm.params = '{\n  \n}'
  dialogVisible.value = true
}

// 提交指令
const submitCommand = () => {
  if (!commandForm.command) {
    ElMessage.warning('请输入指令名称')
    return
  }

  let params = {}
  try {
    params = JSON.parse(commandForm.params)
  } catch (e) {
    ElMessage.error('参数必须是合法的 JSON 格式')
    return
  }

  sendCommand({
    sn: currentDevice.value.sn,
    command: commandForm.command,
    params: params
  }).catch(e => ElMessage.error(e.message))

  ElMessage.info('指令已发送')
  dialogVisible.value = false
}

// 显示添加设备弹窗
const showAddDeviceDialog = async () => {
  try {
    const res = await getServerInfo()
    if (res.code === 200) {
      const info = res.data

      // 🔥 适配 Tailscale/远程环境: 
      // 如果前端是通过自定义 IP (如 Tailscale IP) 连接的，强制修正二维码中的地址
      // 确保手机端扫描后能连接到正确的 IP，而不是服务端自己认为的局域网 IP
      const currentWsUrl = getConnectedUrl()
      if (currentWsUrl && (currentWsUrl.startsWith('ws://') || currentWsUrl.startsWith('wss://'))) {
        try {
          const wsUrlObj = new URL(currentWsUrl)
          const newHost = wsUrlObj.hostname
          const newPort = wsUrlObj.port

          // 🔥 修复：如果当前浏览器使用的是 localhost/127.0.0.1，但服务端返回了有效的局域网 IP (如 192.x, 10.x, 100.x)，
          // 则不要用 localhost 覆盖它，否则手机端扫码无法连接。
          const isLocal = newHost === '127.0.0.1' || newHost === 'localhost'
          let serverHasValidIp = false
          if (info.ip && info.ip !== '127.0.0.1' && info.ip !== 'localhost' && info.ip !== '0.0.0.0') {
            serverHasValidIp = true
          } else if (info.connect_url) {
            try {
              const sUrl = new URL(info.connect_url)
              if (sUrl.hostname !== '127.0.0.1' && sUrl.hostname !== 'localhost' && sUrl.hostname !== '0.0.0.0') {
                serverHasValidIp = true
              }
            } catch (e) {}
          }

          // 只有当 "当前不是 localhost" 或者 "服务端没给有效IP" 时，才进行覆盖
          if (!isLocal || !serverHasValidIp) {
            // 1. 修正 qr_payload (用于生成二维码)
            if (info.qr_payload) {
              try {
                // 尝试解析 JSON 格式 payload
                const payloadObj = JSON.parse(info.qr_payload)
                // 兼容不同的 payload 格式 (u 或 url)
                const urlKey = payloadObj.u ? 'u' : (payloadObj.url ? 'url' : null)

                if (urlKey) {
                  const u = new URL(payloadObj[urlKey])
                  u.hostname = newHost
                  if (newPort) u.port = newPort
                  payloadObj[urlKey] = u.toString()
                  info.qr_payload = JSON.stringify(payloadObj)
                }
              } catch (e) {
                // 非 JSON，可能是纯 URL 字符串
                if (typeof info.qr_payload === 'string' && info.qr_payload.startsWith('http')) {
                  const u = new URL(info.qr_payload)
                  u.hostname = newHost
                  if (newPort) u.port = newPort
                  info.qr_payload = u.toString()
                }
              }
            }

            // 2. 修正 connect_url (用于显示)
            if (info.connect_url) {
              const u = new URL(info.connect_url)
              u.hostname = newHost
              if (newPort) u.port = newPort
              info.connect_url = u.toString()
            }

            // 3. 更新界面显示的 IP
            info.ip = newHost
          }
        } catch (e) {
          console.warn('Failed to patch QR code with custom IP', e)
        }
      }

      currentServerInfo.value = info
      serverAddress.value = info.connect_url
      
      // 使用后端返回的 qr_payload 生成二维码 (包含 Token 和 URL)
      const payload = info.qr_payload || info.connect_url
      qrCodeUrl.value = await QRCode.toDataURL(payload, {width: 256})
      
      // 简单判断是否是 localhost
      isLocalhost.value = info.ip === '127.0.0.1' || info.ip === 'localhost'
    }
    activeAddDeviceTab.value = 'mobile'
    addDeviceDialogVisible.value = true
  } catch (err) {
    ElMessage.error('生成二维码失败')
    console.error(err)
  }
}

// 打开设置密码弹窗
const handleSetPassword = (row) => {
  passwordForm.sn = row.sn
  passwordForm.password = row.password || ''
  passwordDialogVisible.value = true
}

// 提交密码
const submitPassword = async () => {
  settingPassword.value = true
  try {
    const res = await setDevicePassword({...passwordForm})
    if (res.code === 200) {
      ElMessage.success('密码设置成功')
      passwordDialogVisible.value = false

      // 手动更新本地列表，确保UI即时刷新
      const target = deviceList.value.find(d => d.sn === passwordForm.sn)
      if (target) {
        target.password = passwordForm.password
      }
    } else {
      ElMessage.error(res.msg || '设置失败')
    }
  } catch (e) {
    console.error(e)
  } finally {
    settingPassword.value = false
  }
}

// 打开文件传输弹窗
const openTransferDialog = (sourceSn = '') => {
  transferForm.source_sn = sourceSn
  transferForm.target_sn = ''
  transferForm.file_path = ''
  transferForm.save_path = '' // 留空则默认
  activeTransferTab.value = 'new'
  transferDialogVisible.value = true
}
// 打开文件浏览器
const openFileBrowser = (mode) => {
  const sn = mode === 'source' ? transferForm.source_sn : transferForm.target_sn
  if (!sn) {
    ElMessage.warning('请先选择设备')
    return
  }
  browserContext.sn = sn
  browserContext.mode = mode
  browserPath.value = '/' // 默认根目录
  browserFiles.value = []
  browserVisible.value = true
  fetchFileList(sn, '/')
}

const fetchFileList = (sn, path) => {
  browserLoading.value = true
  browserFiles.value = []
  // 发送请求，但不等待 Promise 结果（因为后端返回的 dir_list 消息不带 req_id，无法匹配 Promise）
  sendWsRequest('list_dir', {
    sn: sn,
    target_sn: sn,
    path: path
  }).catch(() => {
    // 忽略超时错误，数据通过 handleWsMessage 接收
  })
}

const handleBrowserItemClick = (item) => {
  if (item.is_dir) {
    // 进入目录
    // 简单处理路径拼接，实际应由后端规范化
    let newPath = browserPath.value.endsWith('/') || browserPath.value.endsWith('\\')
        ? browserPath.value + item.name
        : browserPath.value + '/' + item.name
    // 简单的 Windows 盘符处理 (如果当前是空或/)
    if (browserPath.value === '' && item.name.includes(':')) newPath = item.name + '/'

    browserPath.value = newPath
    fetchFileList(browserContext.sn, newPath)
  } else {
    // 如果是源模式，点击文件即选中
    if (browserContext.mode === 'source') {
      transferForm.file_path = (browserPath.value.endsWith('/') ? browserPath.value : browserPath.value + '/') + item.name
      browserVisible.value = false
    }
  }
}

const goUpDir = () => {
  // 简单回退逻辑
  const p = browserPath.value.replace(/[/\\]$/, '') // 去除尾部斜杠
  const lastSep = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'))
  if (lastSep <= 0) {
    browserPath.value = '/'
  } else {
    browserPath.value = p.substring(0, lastSep) || '/'
  }
  fetchFileList(browserContext.sn, browserPath.value)
}

const handlePathEnter = () => {
  if (!browserPath.value) return
  fetchFileList(browserContext.sn, browserPath.value)
}

const confirmSelection = () => {
  if (browserContext.mode === 'target') {
    transferForm.save_path = browserPath.value
    browserVisible.value = false
  }
}

// 开始传输
const startTransfer = async () => {
  if (!transferForm.source_sn || !transferForm.target_sn || !transferForm.file_path) {
    ElMessage.warning('请填写完整的传输信息')
    return
  }
  if (transferForm.source_sn === transferForm.target_sn) {
    ElMessage.warning('源设备和目标设备不能相同')
    return
  }

  startingTransfer.value = true
  try {
    // 构造一个临时的 transfer ID 用于前端展示 (实际 ID 由后端生成，这里主要用于 UI 占位)
    // 注意：为了准确匹配进度，理想情况是后端返回 ID。
    // 这里我们先发送指令，进度更新时会自动添加到列表（如果 ID 不匹配）。
    // 但为了 UX，我们先添加一个 "Pending" 状态的条目

    await sendCommand({
      sn: transferForm.source_sn,
      command: 'send_file',
      params: {
        target_sn: transferForm.target_sn,
        file_path: transferForm.file_path,
        save_path: transferForm.save_path || undefined
      }
    })

    ElMessage.success('传输指令已发送')
    activeTransferTab.value = 'list'

    // 添加到列表顶部
    const tempId = Date.now().toString()
    transferList.value.unshift({
      id: tempId, // 临时ID，收到进度后会更新或新增
      source: transferForm.source_sn,
      target: transferForm.target_sn,
      filename: transferForm.file_path.split(/[/\\]/).pop(),
      progress: 0,
      speed: 0,
      status: 'pending'
    })

  } catch (e) {
    ElMessage.error('发送失败: ' + e.message)
  } finally {
    startingTransfer.value = false
  }
}

// 格式化速度
const formatSpeed = (bytesPerSec) => {
  if (!bytesPerSec) return '0 B/s'
  if (bytesPerSec < 1024) return bytesPerSec + ' B/s'
  if (bytesPerSec < 1024 * 1024) return (bytesPerSec / 1024).toFixed(1) + ' KB/s'
  return (bytesPerSec / 1024 / 1024).toFixed(1) + ' MB/s'
}

// WebSocket 消息处理器
const handleWsMessage = (res) => {
  if (!res) return
  const {data} = res
  // 兼容后端可能返回 action 或 type (如 transfer_progress)
  const action = res.action || res.type

  if (action === 'get_device_list' || action === 'device_list_update') {
    handleDeviceListUpdate(data)
  } else if (action === 'transfer_progress') {
    // 更新传输进度
    const {transfer_id, progress, speed, status, source, target, filename} = data
    const existing = transferList.value.find(t => t.id === transfer_id)

    if (existing) {
      Object.assign(existing, {progress, speed, status})
    } else {
      // 尝试寻找一个 pending 状态的任务进行绑定 (因为前端发起的任务 ID 是临时的)
      // 简单的 FIFO 匹配：假设最早的 pending 任务对应当前收到的进度
      const pendingTask = transferList.value.find(t => t.status === 'pending')
      if (pendingTask) {
        pendingTask.id = transfer_id // 更新为真实 ID
        Object.assign(pendingTask, {progress, speed, status})
      } else {
        transferList.value.unshift({
          id: transfer_id,
          source,
          target,
          filename: filename || 'Unknown',
          progress,
          speed,
          status
        })
      }
    }
  } else if (action === 'dir_list') {
    // 处理文件列表返回
    browserFiles.value = data.files || []
    if (data.path) browserPath.value = data.path
    browserLoading.value = false
  }
}

const scanLanServers = async () => {
  isScanning.value = true
  scannedServers.value = []
  try {
    const res = await scanLanServersApi()
    if (res.code === 200) {
      scannedServers.value = res.data || []
      if (scannedServers.value.length === 0) {
        ElMessage.info('暂未发现局域网内的其他服务器，请手动输入')
      }
    }
  } catch (e) {
    ElMessage.error('扫描失败: ' + e.message)
  } finally {
    isScanning.value = false
  }
}

const handleJoinClick = (url) => {
  if (!url) {
    ElMessage.warning('请输入目标服务器地址')
    return
  }
  targetClusterUrl.value = url
  joinWarningVisible.value = true
}

const confirmJoinCluster = async () => {
  try {
    await joinCluster(targetClusterUrl.value)
    ElMessage.success('指令已发送，正在切换模式...')
    joinWarningVisible.value = false
    addDeviceDialogVisible.value = false
  } catch (e) {
    ElMessage.error('请求失败: ' + (e.message || '未知错误'))
  }
}

const handleScrcpy = (row) => {
  currentScrcpySn.value = row.sn
  scrcpyDialogVisible.value = true
}

const openNetworkSettings = () => {
  networkForm.external_url = currentServerInfo.value.external_url || ''
  networkDialogVisible.value = true
}

const saveNetworkSettings = async () => {
  try {
    await updateConfig({ external_url: networkForm.external_url })
    ElMessage.success('配置已保存')
    networkDialogVisible.value = false
    // 刷新服务器信息以更新二维码
    await showAddDeviceDialog()
  } catch (e) {
    ElMessage.error('保存失败: ' + e.message)
  }
}

onMounted(async () => {
  // 🔥 1. 先获取服务端信息拿到 Token
  try {
    const res = await getServerInfo()
    if (res.code === 200 && res.data?.token) {
      initWebSocket(res.data.token)
    } else {
      initWebSocket()
    }
  } catch (e) {
    initWebSocket()
  }

  addMessageListener(handleWsMessage)
  fetchList()
})

onUnmounted(() => {
  removeMessageListener(handleWsMessage)
})
</script>

<template>
  <div class="device-manage-container">
    <div class="page-header">
      <div class="title-box">
        <el-icon class="page-icon">
          <Monitor/>
        </el-icon>
        <h2>设备管理</h2>
      </div>
      <div class="header-actions">
        <el-button type="success" plain :icon="Files" @click="openTransferDialog()">文件传输</el-button>
        <el-button type="primary" :icon="Plus" @click="showAddDeviceDialog">添加设备</el-button>
        <el-button :icon="Refresh" circle @click="fetchList" :loading="loading" title="刷新列表"/>
      </div>
    </div>

    <el-card class="table-card" shadow="never" v-loading="loading">
      <el-table :data="deviceList" style="width: 100%" height="100%">
        <el-table-column prop="sn" label="设备SN" min-width="180" show-overflow-tooltip/>
        <el-table-column prop="type" label="类型" width="120"/>
        <el-table-column prop="model" label="型号" width="120"/>
        <el-table-column prop="ip" label="IP地址" width="140"/>
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.status === 'online' ? 'success' : 'info'" effect="dark">
              {{ row.status === 'online' ? '在线' : '离线' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="password" label="锁屏密码" width="160">
          <template #default="{ row }">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-family: monospace;">{{ row.password ? '******' : '未设置' }}</span>
              <el-button link type="primary" :icon="Lock" @click="handleSetPassword(row)" title="修改密码"/>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="last_online" label="最后在线时间" min-width="180"/>
        <el-table-column label="操作" width="280" fixed="right">
          <template #default="{ row }">
            <el-button
                type="primary"
                link
                :icon="VideoPlay"
                @click="handleCommand(row)"
                :disabled="row.status !== 'online'"
            >
              下发指令
            </el-button>
            <el-button
                type="success"
                link
                :icon="Files"
                @click="openTransferDialog(row.sn)"
                v-if="row.status === 'online'"
            >
              传文件
            </el-button>
            <el-button
                type="warning"
                link
                :icon="Cellphone"
                @click="handleScrcpy(row)"
                v-if="row.status === 'online' && row.type === 'android'"
            >
              投屏
            </el-button>
          </template>
        </el-table-column>
        <template #empty>
          <el-empty description="暂无设备连接"/>
        </template>
      </el-table>
    </el-card>

    <!-- 下发指令弹窗 -->
    <el-dialog
        v-model="dialogVisible"
        :title="`下发指令 - ${currentDevice?.sn}`"
        width="500px"
        destroy-on-close
    >
      <el-form :model="commandForm" label-width="80px" @submit.prevent>
        <el-form-item label="指令名称" required>
          <el-input v-model="commandForm.command" placeholder="例如: reboot, update_config"/>
        </el-form-item>
        <el-form-item label="参数">
          <el-input
              v-model="commandForm.params"
              type="textarea"
              :rows="6"
              placeholder="请输入 JSON 格式参数"
              class="code-input"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="dialogVisible = false">取消</el-button>
          <el-button type="primary" @click="submitCommand" :loading="sending">
            发送
          </el-button>
        </span>
      </template>
    </el-dialog>

    <!-- 添加设备弹窗 -->
    <el-dialog
        v-model="addDeviceDialogVisible"
        title="连接与组网"
        width="500px"
        destroy-on-close
    >
      <el-tabs v-model="activeAddDeviceTab" stretch>
        <!-- A. 移动端连接模块 -->
        <el-tab-pane label="移动端连接" name="mobile">
          <div class="qr-code-container">
            <p class="guide-text">使用 MiniOrange App 扫描下方二维码，即可连接至本机。连接后，手机将作为移动控制端 (Client)，可查看设备投屏、执行 Workflow 任务或发送指令。</p>
            
            <img v-if="qrCodeUrl" :src="qrCodeUrl" alt="QR Code" class="qr-code-img"/>
            
            <div class="network-hint">
              <el-icon><Connection /></el-icon>
              <span>请确保手机与本机处于同一局域网 (Wi-Fi)</span>
            </div>
            <div class="server-info-tag">
              本机 IP: <strong>{{ currentServerInfo.ip }}</strong>
            </div>
            <div class="server-detail-text">
              服务器: {{ currentServerInfo.server_name }} | 端口: {{ currentServerInfo.port }}
            </div>

            <div style="margin-top: 8px;">
              <el-button link type="primary" size="small" @click="openNetworkSettings">
                <el-icon style="margin-right: 4px"><Setting /></el-icon> 配置外网/穿透地址
              </el-button>
            </div>

            <el-alert v-if="isLocalhost" title="本地网络提示" type="warning" show-icon :closable="false" style="margin-top: 10px">
              当前检测到 localhost 地址，外部设备可能无法连接。请确保使用局域网 IP。
            </el-alert>
          </div>
        </el-tab-pane>

        <!-- B. 集群组网模块 -->
        <el-tab-pane label="分布式集群" name="cluster">
          <div class="cluster-container">
            <div class="cluster-status-card">
              <el-tag type="success" effect="dark">Master Mode</el-tag>
              <p class="status-desc">当前本机作为 <strong>独立服务端 (Master)</strong> 运行。您可以扫描局域网内的其他服务器，将本机作为计算节点加入它们。</p>
            </div>

            <div class="scan-section">
              <el-button type="primary" plain :loading="isScanning" @click="scanLanServers" style="width: 100%">
                扫描局域网服务器
              </el-button>
            </div>

            <div class="server-list">
              <div v-for="srv in scannedServers" :key="srv.url" class="server-item">
                <div class="srv-info">
                  <div class="srv-name">{{ srv.name }}</div>
                  <div class="srv-ip">{{ srv.ip }}</div>
                </div>
                <el-button size="small" type="primary" @click="handleJoinClick(srv.url)">连接</el-button>
              </div>
              <div v-if="scannedServers.length === 0 && !isScanning" class="empty-scan">
                <el-empty description="未发现服务器" :image-size="60" />
              </div>
            </div>

            <div class="manual-join">
              <div class="divider"><span>或手动加入</span></div>
              <el-input v-model="targetClusterUrl" placeholder="输入主控地址 (ws://ip:port/ws/device)">
                <template #append>
                  <el-button @click="handleJoinClick(targetClusterUrl)">加入</el-button>
                </template>
              </el-input>
            </div>
          </div>
        </el-tab-pane>
      </el-tabs>
    </el-dialog>

    <!-- C. 连接确认弹窗 -->
    <el-dialog
      v-model="joinWarningVisible"
      title="⚠️ 模式切换警告"
      width="400px"
      center
    >
      <div class="warning-content">
        <p>您即将加入 <strong>{{ targetClusterUrl }}</strong> 的集群。</p>
        <p class="warning-highlight">⚠️ 警告：加入集群后，本机 Web 管理界面将关闭，并转为后台节点模式运行。是否继续？</p>
        <p class="warning-sub">如需恢复，请在主控端移除本节点，或重启本机程序。</p>
      </div>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="joinWarningVisible = false">取消</el-button>
          <el-button type="danger" @click="confirmJoinCluster">确认加入</el-button>
        </span>
      </template>
    </el-dialog>

    <!-- 投屏弹窗 -->
    <el-dialog
        v-model="scrcpyDialogVisible"
        title="远程投屏"
        width="460px"
        destroy-on-close
        :footer="null"
        style="margin-top: 5vh;"
    >
      <div style="height: 720px; overflow: hidden; margin: -20px;">
        <ScrcpyWindow :target-device-id="currentScrcpySn" />
      </div>
    </el-dialog>

    <!-- 设置密码弹窗 -->
    <el-dialog
        v-model="passwordDialogVisible"
        title="设置锁屏密码"
        width="400px"
    >
      <el-form :model="passwordForm" label-width="80px" @submit.prevent>
        <el-form-item label="设备SN">
          <el-input v-model="passwordForm.sn" disabled/>
        </el-form-item>
        <el-form-item label="密码">
          <el-input v-model="passwordForm.password" placeholder="请输入设备锁屏密码" clearable/>
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="passwordDialogVisible = false">取消</el-button>
          <el-button type="primary" @click="submitPassword" :loading="settingPassword">
            保存
          </el-button>
        </span>
      </template>
    </el-dialog>

    <!-- 文件传输弹窗 -->
    <el-dialog
        v-model="transferDialogVisible"
        title="P2P 文件传输"
        width="650px"
        destroy-on-close
    >
      <el-tabs v-model="activeTransferTab" class="transfer-tabs">
        <el-tab-pane label="新建传输" name="new">
          <el-form :model="transferForm" label-width="100px" style="margin-top: 20px">
            <div class="transfer-panel-grid">
              <!-- 发送方 -->
              <div class="panel-card">
                <div class="panel-header">发送方 (Source)</div>
                <div class="panel-body">
                  <el-form-item label-width="0">
                    <el-select v-model="transferForm.source_sn" placeholder="选择发送设备" style="width: 100%">
                      <el-option v-for="d in deviceList" :key="d.sn" :label="`${d.sn} (${d.model})`" :value="d.sn"
                                 :disabled="d.status !== 'online'">
                        <span>{{ d.model }} ({{ d.sn.slice(-4) }})</span>
                      </el-option>
                    </el-select>
                  </el-form-item>
                  <el-form-item label-width="0" style="margin-bottom: 0">
                    <el-input v-model="transferForm.file_path" placeholder="选择文件...">
                      <template #append>
                        <el-button :icon="Folder" @click="openFileBrowser('source')"
                                   :disabled="!transferForm.source_sn"/>
                      </template>
                    </el-input>
                  </el-form-item>
                </div>
              </div>

              <!-- 接收方 -->
              <div class="panel-card">
                <div class="panel-header">接收方 (Target)</div>
                <div class="panel-body">
                  <el-form-item label-width="0">
                    <el-select v-model="transferForm.target_sn" placeholder="选择接收设备" style="width: 100%">
                      <el-option v-for="d in deviceList" :key="d.sn" :label="`${d.sn} (${d.model})`" :value="d.sn"
                                 :disabled="d.status !== 'online' || d.sn === transferForm.source_sn">
                        <span>{{ d.model }} ({{ d.sn.slice(-4) }})</span>
                      </el-option>
                    </el-select>
                  </el-form-item>
                  <el-form-item label-width="0" style="margin-bottom: 0">
                    <el-input v-model="transferForm.save_path" placeholder="保存目录 (默认)">
                      <template #append>
                        <el-button :icon="Folder" @click="openFileBrowser('target')"
                                   :disabled="!transferForm.target_sn"/>
                      </template>
                    </el-input>
                  </el-form-item>
                </div>
              </div>
            </div>

            <el-form-item style="margin-top: 24px">
              <el-button type="primary" @click="startTransfer" :loading="startingTransfer"
                         style="width: 100%; height: 40px; font-size: 16px;">
                <el-icon style="margin-right: 8px">
                  <Connection/>
                </el-icon>
                开始传输
              </el-button>
            </el-form-item>
          </el-form>
        </el-tab-pane>

        <el-tab-pane label="传输列表" name="list">
          <el-table :data="transferList" style="width: 100%" height="300px">
            <el-table-column prop="filename" label="文件名" min-width="120" show-overflow-tooltip/>
            <el-table-column label="方向" width="180">
              <template #default="{ row }">
                <div class="transfer-direction">
                  <el-tag size="small" type="info">{{ row.source?.slice(-4) }}</el-tag>
                  <el-icon>
                    <Connection/>
                  </el-icon>
                  <el-tag size="small" type="success">{{ row.target?.slice(-4) }}</el-tag>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="进度" min-width="180">
              <template #default="{ row }">
                <div class="progress-cell">
                  <el-progress
                      :percentage="row.progress"
                      :status="row.status === 'completed' ? 'success' : (row.status === 'error' ? 'exception' : '')"
                      :stroke-width="6"
                  />
                  <div class="speed-text" v-if="row.status === 'transferring'">{{ formatSpeed(row.speed) }}</div>
                </div>
              </template>
            </el-table-column>
            <el-table-column prop="status" label="状态" width="80">
              <template #default="{ row }">
                <span v-if="row.status === 'pending'" style="color: #909399">等待</span>
                <span v-else-if="row.status === 'transferring'" style="color: #409EFF">传输中</span>
                <span v-else-if="row.status === 'completed'" style="color: #67C23A">完成</span>
                <span v-else style="color: #F56C6C">失败</span>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>
      </el-tabs>
    </el-dialog>
    <!-- 文件浏览器弹窗 -->
    <el-dialog
        v-model="browserVisible"
        :title="`浏览文件 - ${browserContext.sn}`"
        width="600px"
        append-to-body
    >
      <div class="browser-header">
        <el-button :icon="Back" circle size="small" @click="goUpDir" :disabled="!browserPath || browserPath === '/'"/>
        <el-input v-model="browserPath" size="small" style="flex: 1" @keyup.enter="handlePathEnter" placeholder="输入路径按回车跳转" />
        <el-button type="primary" size="small" v-if="browserContext.mode === 'target'" @click="confirmSelection">
          选择当前目录
        </el-button>
      </div>

      <div class="file-list" v-loading="browserLoading">
        <div v-if="browserFiles.length === 0 && !browserLoading" class="empty-folder">空文件夹</div>
        <div
            v-for="(item, index) in browserFiles"
            :key="index"
            class="file-item"
            @click="handleBrowserItemClick(item)"
        >
          <el-icon class="file-icon" :size="20">
            <Folder v-if="item.is_dir" style="color: #fbbf24"/>
            <Document v-else style="color: #94a3b8"/>
          </el-icon>
          <span class="file-name">{{ item.name }}</span>
          <span class="file-size" v-if="!item.is_dir">{{ (item.size / 1024).toFixed(1) }} KB</span>
        </div>
      </div>
    </el-dialog>

    <!-- 网络配置弹窗 -->
    <el-dialog v-model="networkDialogVisible" title="网络配置" width="450px" append-to-body>
      <el-form :model="networkForm" label-position="top">
        <el-form-item label="外部访问地址 (External URL)">
          <el-input v-model="networkForm.external_url" placeholder="例如: wss://my-frp.com:12345/ws" />
          <div style="font-size: 12px; color: #909399; margin-top: 4px; line-height: 1.4;">设置后，二维码将包含此地址，允许外网设备通过穿透服务连接。</div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="networkDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveNetworkSettings">保存</el-button>
      </template>
    </el-dialog>

  </div>
</template>

<style scoped>
/* 样式复用项目整体风格 */
.device-manage-container {
  padding: 20px;
  height: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  background-color: #f8fafc;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.title-box {
  display: flex;
  align-items: center;
  gap: 10px;
  color: #1e293b;
}

.page-icon {
  font-size: 24px;
  color: #6366f1;
}

.page-header h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
}

.table-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  overflow: hidden;
}

:deep(.el-card__body) {
  flex: 1;
  padding: 0;
  height: 100%;
}

.code-input {
  font-family: monospace;
}

.qr-code-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  text-align: center;
  padding: 10px 0;
}

.guide-text {
  margin: 0;
  font-size: 14px;
  color: #606266;
  line-height: 1.5;
  margin-bottom: 8px;
}

.qr-code-img {
  width: 200px;
  height: 200px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
}

.network-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #e6a23c;
  font-size: 12px;
}

.server-info-tag {
  background: #f0f9eb;
  color: #67c23a;
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 14px;
}

.server-detail-text {
  font-size: 12px;
  color: #909399;
}

/* Cluster Styles */
.cluster-container {
  padding: 10px 0;
}
.cluster-status-card {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 16px;
  text-align: center;
  margin-bottom: 20px;
}
.status-desc {
  margin: 10px 0 0 0;
  font-size: 13px;
  color: #606266;
  line-height: 1.5;
}
.scan-section { margin-bottom: 16px; }
.server-list {
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  height: 150px;
  overflow-y: auto;
  margin-bottom: 16px;
}
.server-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  border-bottom: 1px solid #f1f5f9;
}
.srv-name { font-weight: 600; font-size: 14px; color: #303133; }
.srv-ip { font-size: 12px; color: #909399; }
.empty-scan { padding: 20px 0; }

.manual-join .divider {
  display: flex;
  align-items: center;
  margin-bottom: 12px;
  color: #909399;
  font-size: 12px;
}
.manual-join .divider::before, .manual-join .divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: #e2e8f0;
}
.manual-join .divider span { padding: 0 10px; }

.warning-content {
  text-align: center;
}
.warning-highlight {
  color: #f56c6c;
  font-weight: 600;
  margin: 16px 0;
}
.warning-sub {
  font-size: 12px;
  color: #909399;
}

.transfer-direction {
  display: flex;
  align-items: center;
  gap: 5px;
  font-family: monospace;
}

.progress-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.speed-text {
  font-size: 10px;
  color: #909399;
  text-align: right;
}

.transfer-panel-grid {
 display: grid;
 grid-template-columns: 1fr 1fr;
 gap: 20px;
}
.panel-card {
 background: #f8fafc;
 border: 1px solid #e2e8f0;
 border-radius: 8px;
 padding: 16px;
}
.panel-header {
 font-weight: 600;
 color: #475569;
 margin-bottom: 12px;
 font-size: 13px;
}
.panel-body {
 display: flex;
 flex-direction: column;
 gap: 12px;
}
 
.browser-header { display: flex; gap: 8px; align-items: center; margin-bottom: 10px; }
.file-list { height: 300px; overflow-y: auto; border: 1px solid #e2e8f0; border-radius: 4px; background: white; }
.file-item { display: flex; align-items: center; padding: 8px 12px; cursor: pointer; border-bottom: 1px solid #f1f5f9; transition: background 0.2s; }
.file-item:hover { background: #f1f5f9; }
.file-icon { margin-right: 10px; }
.file-name { flex: 1; font-size: 13px; color: #334155; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.file-size { font-size: 12px; color: #94a3b8; margin-left: 10px; }
.empty-folder { text-align: center; color: #cbd5e1; padding: 20px; font-size: 13px; }
</style>