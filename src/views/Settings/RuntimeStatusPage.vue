<script setup>
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Monitor, Cpu, Connection, Refresh, VideoPlay, Files, Lock, Cellphone, Folder, Document, Back } from '@element-plus/icons-vue'
import { VueFlow, MarkerType, Handle, Position } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { addMessageListener, removeMessageListener, sendWsRequest } from '@/api/mWebSocket'
import { getNodeStatus } from '@/api/system'
import { getDeviceList, sendCommand, setDevicePassword } from '@/api/device'
import { getBaseUrl } from '@/utils/config'
import ScrcpyWindow from '@/views/WorkflowEditor/components/ScrcpyWindow.vue'

const loading = ref(false)
const runtime = ref(null)
const nodeStatus = ref(null)
const devices = ref([])
const lastUpdated = ref('')
const activeTab = ref('overview')
const dialogVisible = ref(false)
const currentDevice = ref(null)
const commandForm = reactive({
  command: '',
  params: '{\n  \n}',
})
const sending = ref(false)
const passwordDialogVisible = ref(false)
const passwordForm = reactive({
  sn: '',
  password: '',
})
const settingPassword = ref(false)
const scrcpyDialogVisible = ref(false)
const currentScrcpySn = ref('')
const transferDialogVisible = ref(false)
const activeTransferTab = ref('new')
const transferForm = reactive({
  source_sn: '',
  target_sn: '',
  file_path: '',
  save_path: '',
})
const transferList = ref([])
const startingTransfer = ref(false)
const browserVisible = ref(false)
const browserLoading = ref(false)
const browserFiles = ref([])
const browserPath = ref('/')
const browserContext = reactive({ sn: '', mode: 'source' })

const onlineDevices = computed(() => devices.value.filter((d) => d.status === 'online'))
const executorNodes = computed(() => devices.value.filter((d) => d.type === 'pc' || d.role === 'node'))
const mobileDevices = computed(() => devices.value.filter((d) => d.type !== 'pc'))
const serviceOnline = computed(() => !!nodeStatus.value || runtime.value?.endpoints?.some((item) => item.online))
const serverEndpoint = computed(() => {
  const onlineEndpoint = runtime.value?.endpoints?.find((item) => item.online)
  return onlineEndpoint?.url || getBaseUrl()
})
const serverRole = computed(() => nodeStatus.value?.role || 'unknown')
const serverSn = computed(() => nodeStatus.value?.sn || runtime.value?.electron?.pid || 'local')
const devicePool = computed(() => devices.value.filter((d) => !(d.type === 'pc' || d.role === 'node')))
const runtimeSummary = computed(() => {
  if (!lastUpdated.value) return '等待刷新'
  return `${onlineDevices.value.length} 台在线 · ${lastUpdated.value}`
})

const statusType = (ok) => (ok ? 'success' : 'danger')
const statusText = (ok) => (ok ? '在线' : '离线')
const shortId = (value) => {
  const text = String(value || '')
  return text.length > 18 ? `${text.slice(0, 10)}...${text.slice(-4)}` : text || '—'
}
const connectionMode = (row) => {
  const ip = String(row?.ip || '').trim()
  if (!ip) return '未知连接'
  if (ip.toUpperCase() === 'USB') return 'USB 直连'
  return '局域网 / Wi-Fi'
}
const executorConnectionLabel = (row) => {
  if (row?.status === 'online') return 'WebSocket 注册在线'
  return '历史注册，当前离线'
}
const deviceOwnerKey = (row) => {
  const keys = ['executor_sn', 'executorSn', 'owner_sn', 'ownerSn', 'node_sn', 'nodeSn', 'hub_sn', 'hubSn', 'parent_sn', 'parentSn']
  for (const key of keys) {
    if (row?.[key]) return String(row[key])
  }
  return ''
}
const hostGroups = computed(() => {
  const executors = executorNodes.value
  const primaryExecutor =
    executors.find((node) => node.sn === nodeStatus.value?.sn || node.sn === serverSn.value) ||
    executors[0] ||
    null

  const groups = executors.map((node, index) => ({
    id: node.sn || `executor-${index}`,
    title: node.sn === primaryExecutor?.sn ? '当前电脑 / Server 宿主机' : `电脑 / 服务器 ${index + 1}`,
    isServerHost: node.sn === primaryExecutor?.sn,
    executor: node,
    devices: [],
  }))

  if (!groups.length) {
    groups.push({
      id: 'server-host',
      title: '当前电脑 / Server 宿主机',
      isServerHost: true,
      executor: null,
      devices: [],
    })
  }

  for (const device of devicePool.value) {
    const owner = deviceOwnerKey(device)
    const matched = owner
      ? groups.find((group) => {
        const node = group.executor || {}
        return [node.sn, node.id, node.ip, node.model].filter(Boolean).some((value) => String(value) === owner)
      })
      : null
    const fallback = groups.find((group) => group.isServerHost) || groups[0]
    const targetGroup = matched || fallback
    targetGroup.devices.push({
      ...device,
      inferredOwner: !matched,
    })
  }

  return groups
})
const DEVICE_COLUMN_X = 660
const DEVICE_NODE_STEP = 150

const topologyFlowNodes = computed(() => {
  const nodes = []
  let y = 72

  hostGroups.value.forEach((group) => {
    const deviceCount = Math.max(group.devices.length, 1)
    const rowHeight = Math.max(300, deviceCount * DEVICE_NODE_STEP)
    const hostId = `host-${group.id}`

    nodes.push({
      id: hostId,
      type: 'runtime',
      position: { x: 120, y },
      data: group.executor
        ? {
          kind: 'host',
          title: group.title,
          status: group.isServerHost ? 'server' : 'executor',
          online: group.executor.status === 'online' || group.isServerHost,
          hasSource: true,
          hasTarget: false,
          sections: [
            ...(group.isServerHost
              ? [{
                label: 'Server 端',
                status: statusText(serviceOnline.value),
                online: serviceOnline.value,
                value: serverEndpoint.value,
                chips: [`role ${serverRole.value}`, `SN ${shortId(serverSn.value)}`],
              }]
              : []),
            {
              label: '执行器端',
              status: group.executor.status,
              online: group.executor.status === 'online',
              value: group.executor.model || shortId(group.executor.sn),
              chips: [executorConnectionLabel(group.executor), group.executor.ip || '无 IP'],
            },
          ],
        }
        : {
          kind: 'host',
          title: group.title,
          status: 'missing',
          online: false,
          hasSource: true,
          hasTarget: false,
          sections: [
            ...(group.isServerHost
              ? [{
                label: 'Server 端',
                status: statusText(serviceOnline.value),
                online: serviceOnline.value,
                value: serverEndpoint.value,
                chips: [`role ${serverRole.value}`, `SN ${shortId(serverSn.value)}`],
              }]
              : []),
            {
              label: '执行器端',
              status: 'missing',
              online: false,
              value: '尚未上报本机执行器节点',
              chips: ['等待注册'],
            },
          ],
        },
    })

    group.devices.forEach((device, deviceIndex) => {
      nodes.push({
        id: `device-${group.id}-${device.sn}`,
        type: 'runtime',
        position: { x: DEVICE_COLUMN_X, y: y + deviceIndex * DEVICE_NODE_STEP },
        data: {
          kind: 'device',
          title: device.model || shortId(device.sn),
          status: device.status,
          online: device.status === 'online',
          hasSource: false,
          hasTarget: true,
          subtitle: connectionMode(device),
          meta: [device.type, device.ip || '无连接地址', device.inferredOwner ? '待上报归属' : '明确归属'],
        },
      })
    })

    if (!group.devices.length) {
      nodes.push({
        id: `device-empty-${group.id}`,
        type: 'runtime',
        position: { x: DEVICE_COLUMN_X, y: y + 80 },
        data: {
          kind: 'device',
          title: '暂无归属设备',
          status: 'empty',
          online: false,
          hasSource: false,
          hasTarget: true,
          subtitle: '等待设备连接',
          meta: ['empty'],
        },
      })
    }

    y += rowHeight + 76
  })

  return nodes
})
const topologyFlowEdges = computed(() => {
  const edges = []

  hostGroups.value.forEach((group) => {
    const source = `host-${group.id}`

    group.devices.forEach((device) => {
      edges.push({
        id: `edge-${group.id}-${device.sn}`,
        source,
        target: `device-${group.id}-${device.sn}`,
        sourceHandle: 'source-right',
        targetHandle: 'target-left',
        type: 'smoothstep',
        style: { stroke: '#6366f1', strokeWidth: 2 },
        markerEnd: MarkerType.ArrowClosed,
      })
    })
  })

  return edges
})

const applyDeviceList = (data) => {
  const list = Array.isArray(data) ? data : (data?.data || [])
  const nextDevices = Array.isArray(list) ? list : []

  devices.value = nextDevices.map((item) => {
    const previous = devices.value.find((oldItem) => oldItem.sn === item.sn)
    if ((item.password === undefined || item.password === null) && previous?.password) {
      return { ...item, password: previous.password }
    }
    return item
  })
}

const handleCommand = (row) => {
  currentDevice.value = row
  commandForm.command = ''
  commandForm.params = '{\n  \n}'
  dialogVisible.value = true
}

const submitCommand = async () => {
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

  sending.value = true
  try {
    await sendCommand({
      sn: currentDevice.value.sn,
      command: commandForm.command,
      params,
    })
    ElMessage.success('指令已发送')
    dialogVisible.value = false
  } catch (e) {
    ElMessage.error(e?.message || '发送失败')
  } finally {
    sending.value = false
  }
}

const handleSetPassword = (row) => {
  passwordForm.sn = row.sn
  passwordForm.password = row.password || ''
  passwordDialogVisible.value = true
}

const submitPassword = async () => {
  settingPassword.value = true
  try {
    const res = await setDevicePassword({ ...passwordForm })
    if (res.code === 200) {
      ElMessage.success('密码设置成功')
      passwordDialogVisible.value = false
      const target = devices.value.find((item) => item.sn === passwordForm.sn)
      if (target) target.password = passwordForm.password
    } else {
      ElMessage.error(res.msg || '设置失败')
    }
  } catch (e) {
    ElMessage.error(e?.message || '设置失败')
  } finally {
    settingPassword.value = false
  }
}

const openTransferDialog = (sourceSn = '') => {
  transferForm.source_sn = sourceSn
  transferForm.target_sn = ''
  transferForm.file_path = ''
  transferForm.save_path = ''
  activeTransferTab.value = 'new'
  transferDialogVisible.value = true
}

const openFileBrowser = (mode) => {
  const sn = mode === 'source' ? transferForm.source_sn : transferForm.target_sn
  if (!sn) {
    ElMessage.warning('请先选择设备')
    return
  }
  browserContext.sn = sn
  browserContext.mode = mode
  browserPath.value = '/'
  browserFiles.value = []
  browserVisible.value = true
  fetchFileList(sn, '/')
}

const fetchFileList = (sn, path) => {
  browserLoading.value = true
  browserFiles.value = []
  sendWsRequest('list_dir', {
    sn,
    target_sn: sn,
    path,
  }).catch(() => {
    // dir_list 不一定带 req_id，文件列表通过 WebSocket 事件回填。
  })
}

const handleBrowserItemClick = (item) => {
  if (item.is_dir) {
    const nextPath = browserPath.value.endsWith('/') || browserPath.value.endsWith('\\')
      ? browserPath.value + item.name
      : `${browserPath.value}/${item.name}`
    browserPath.value = browserPath.value === '' && item.name.includes(':') ? `${item.name}/` : nextPath
    fetchFileList(browserContext.sn, browserPath.value)
    return
  }

  if (browserContext.mode === 'source') {
    transferForm.file_path = (browserPath.value.endsWith('/') ? browserPath.value : `${browserPath.value}/`) + item.name
    browserVisible.value = false
  }
}

const goUpDir = () => {
  const path = browserPath.value.replace(/[/\\]$/, '')
  const lastSep = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  browserPath.value = lastSep <= 0 ? '/' : path.substring(0, lastSep) || '/'
  fetchFileList(browserContext.sn, browserPath.value)
}

const handlePathEnter = () => {
  if (browserPath.value) fetchFileList(browserContext.sn, browserPath.value)
}

const confirmSelection = () => {
  if (browserContext.mode === 'target') {
    transferForm.save_path = browserPath.value
    browserVisible.value = false
  }
}

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
    await sendCommand({
      sn: transferForm.source_sn,
      command: 'send_file',
      params: {
        target_sn: transferForm.target_sn,
        file_path: transferForm.file_path,
        save_path: transferForm.save_path || undefined,
      },
    })

    const tempId = Date.now().toString()
    transferList.value.unshift({
      id: tempId,
      source: transferForm.source_sn,
      target: transferForm.target_sn,
      filename: transferForm.file_path.split(/[/\\]/).pop(),
      progress: 0,
      speed: 0,
      status: 'pending',
    })
    activeTransferTab.value = 'list'
    ElMessage.success('传输指令已发送')
  } catch (e) {
    ElMessage.error(`发送失败: ${e?.message || '未知错误'}`)
  } finally {
    startingTransfer.value = false
  }
}

const formatSpeed = (bytesPerSec) => {
  if (!bytesPerSec) return '0 B/s'
  if (bytesPerSec < 1024) return `${bytesPerSec} B/s`
  if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`
  return `${(bytesPerSec / 1024 / 1024).toFixed(1)} MB/s`
}

const handleWsMessage = (res) => {
  if (!res) return
  const action = res.action || res.type
  const data = res.data || {}

  if (action === 'get_device_list' || action === 'device_list_update') {
    applyDeviceList(data)
  } else if (action === 'transfer_progress') {
    const { transfer_id, progress, speed, status, source, target, filename } = data
    const existing = transferList.value.find((item) => item.id === transfer_id)
    if (existing) {
      Object.assign(existing, { progress, speed, status })
      return
    }

    const pendingTask = transferList.value.find((item) => item.status === 'pending')
    if (pendingTask) {
      pendingTask.id = transfer_id
      Object.assign(pendingTask, { progress, speed, status })
      return
    }

    transferList.value.unshift({
      id: transfer_id,
      source,
      target,
      filename: filename || 'Unknown',
      progress,
      speed,
      status,
    })
  } else if (action === 'dir_list') {
    browserFiles.value = data.files || []
    if (data.path) browserPath.value = data.path
    browserLoading.value = false
  }
}

const handleScrcpy = (row) => {
  currentScrcpySn.value = row.sn
  scrcpyDialogVisible.value = true
}

const load = async () => {
  loading.value = true
  try {
    const [runtimeRes, nodeRes, deviceRes] = await Promise.allSettled([
      window.electronAPI?.getRuntimeStatus?.(),
      getNodeStatus(),
      getDeviceList(),
    ])
    runtime.value = runtimeRes.status === 'fulfilled' ? runtimeRes.value : null
    nodeStatus.value = nodeRes.status === 'fulfilled' ? nodeRes.value?.data : null
    applyDeviceList(deviceRes.status === 'fulfilled' ? deviceRes.value : [])
    lastUpdated.value = new Date().toLocaleTimeString()
  } catch (e) {
    ElMessage.error(e?.message || '状态刷新失败')
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  addMessageListener(handleWsMessage)
  load()
})

onUnmounted(() => {
  removeMessageListener(handleWsMessage)
})
</script>

<template>
  <div class="settings-panel runtime-page wide-panel" v-loading="loading">
    <header class="settings-page-header">
      <div>
        <h2 class="settings-page-title">运行状态</h2>
        <p class="settings-page-desc">检查 Electron、Server、执行器与多设备连接状态。</p>
      </div>
      <div class="runtime-actions">
        <span class="settings-summary-pill">{{ runtimeSummary }}</span>
        <button type="button" class="settings-action-pill refresh-pill" style="--brand: #22c55e" @click="openTransferDialog()">
          <el-icon><Files /></el-icon>
          <span>文件传输</span>
          <span class="settings-action-arrow">↗</span>
        </button>
        <button type="button" class="settings-action-pill refresh-pill" style="--brand: #0ea5e9" @click="load">
          <el-icon><Refresh /></el-icon>
          <span>刷新状态</span>
          <span class="settings-action-arrow">↻</span>
        </button>
      </div>
    </header>

    <div class="settings-tabbar">
      <button
        type="button"
        class="settings-tab"
        :class="{ active: activeTab === 'overview' }"
        @click="activeTab = 'overview'"
      >
        <strong>运行概览</strong>
        <span>服务、执行器和设备</span>
      </button>
      <button
        type="button"
        class="settings-tab"
        :class="{ active: activeTab === 'topology' }"
        @click="activeTab = 'topology'"
      >
        <strong>多机方案</strong>
        <span>主控、执行器和设备池</span>
      </button>
    </div>

    <template v-if="activeTab === 'overview'">
      <section class="status-grid">
        <article class="settings-card status-card online-card">
          <el-icon class="status-icon electron"><Monitor /></el-icon>
          <div>
            <div class="status-title-row">
              <h3>Electron 应用</h3>
              <el-tag :type="statusType(runtime?.electron?.online)" size="small">{{ statusText(runtime?.electron?.online) }}</el-tag>
            </div>
            <p>PID {{ runtime?.electron?.pid || '—' }} · v{{ runtime?.electron?.version || '—' }} · {{ runtime?.electron?.platform || '—' }}</p>
          </div>
        </article>

        <article class="settings-card status-card" :class="{ 'online-card': serviceOnline }">
          <el-icon class="status-icon server"><Cpu /></el-icon>
          <div>
            <div class="status-title-row">
              <h3>Server 服务</h3>
              <el-tag :type="statusType(serviceOnline)" size="small">{{ statusText(serviceOnline) }}</el-tag>
            </div>
            <p>{{ getBaseUrl() }} · role {{ nodeStatus?.role || 'unknown' }}</p>
          </div>
        </article>

        <article class="settings-card status-card" :class="{ 'online-card': onlineDevices.length }">
          <el-icon class="status-icon executor"><Connection /></el-icon>
          <div>
            <div class="status-title-row">
              <h3>执行器 / 设备</h3>
              <el-tag :type="onlineDevices.length ? 'success' : 'info'" size="small">{{ onlineDevices.length }} 在线</el-tag>
            </div>
            <p>{{ executorNodes.length }} 个执行器节点 · {{ mobileDevices.length }} 台移动设备</p>
          </div>
        </article>
      </section>

      <section class="settings-info-card service-card">
        <span class="settings-kicker">服务探测</span>
        <div class="section-head">
          <h3>Server 可达性</h3>
          <span>本地内置后端缺失时，只要任一 Server 在线就不应弹出缺失弹窗。</span>
        </div>
        <div class="endpoint-list">
          <div v-for="item in runtime?.endpoints || []" :key="item.url" class="endpoint-row">
            <div>
              <strong>{{ item.name }}</strong>
              <code>{{ item.url }}</code>
            </div>
            <el-tag :type="statusType(item.online)" size="small">{{ statusText(item.online) }}</el-tag>
          </div>
        </div>
      </section>

      <section class="settings-table-card">
        <div class="section-head">
          <h3>执行器与设备</h3>
          <span>Server 负责调度，执行器节点负责连接设备并执行动作。</span>
        </div>
        <el-table :data="devices" empty-text="暂无已注册设备" class="runtime-table">
          <el-table-column prop="sn" label="SN" min-width="180" show-overflow-tooltip />
          <el-table-column prop="type" label="类型" width="100" />
          <el-table-column prop="role" label="角色" width="100" />
          <el-table-column prop="model" label="型号" min-width="140" show-overflow-tooltip />
          <el-table-column prop="ip" label="IP" width="140" />
          <el-table-column label="状态" width="90">
            <template #default="{ row }">
              <el-tag :type="row.status === 'online' ? 'success' : 'info'" size="small">{{ row.status }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="锁屏密码" width="130">
            <template #default="{ row }">
              <div class="password-cell">
                <span>{{ row.password ? '******' : '未设置' }}</span>
                <el-button link type="primary" :icon="Lock" @click="handleSetPassword(row)" />
              </div>
            </template>
          </el-table-column>
          <el-table-column prop="last_online" label="最后在线" width="180" show-overflow-tooltip />
          <el-table-column label="操作" width="260" fixed="right">
            <template #default="{ row }">
              <div class="device-actions">
                <el-button link type="primary" :icon="VideoPlay" :disabled="row.status !== 'online'" @click="handleCommand(row)">
                  下发指令
                </el-button>
                <el-button v-if="row.status === 'online'" link type="success" :icon="Files" @click="openTransferDialog(row.sn)">
                  传文件
                </el-button>
                <el-button
                  v-if="row.status === 'online' && row.type === 'android'"
                  link
                  type="warning"
                  :icon="Cellphone"
                  @click="handleScrcpy(row)"
                >
                  投屏
                </el-button>
              </div>
            </template>
          </el-table-column>
        </el-table>
      </section>
    </template>

    <template v-else>
      <section class="settings-info-card topology-card">
        <span class="settings-kicker">当前状态图</span>
        <div class="section-head">
          <h3>Server / 执行器 / 设备连接关系</h3>
          <span>按当前接口上报状态展示，后续可在执行器注册时补充明确的设备归属。</span>
        </div>

        <div class="topology-canvas vueflow-canvas">
          <div class="canvas-toolbar">
            <span>Workflow 拓扑画布</span>
            <strong>{{ hostGroups.length }} 台宿主机 · {{ devicePool.length }} 台设备</strong>
          </div>

          <VueFlow
            :nodes="topologyFlowNodes"
            :edges="topologyFlowEdges"
            :fit-view-on-init="false"
            :default-viewport="{ x: 24, y: 20, zoom: 0.9 }"
            :min-zoom="0.5"
            :max-zoom="1.4"
            :nodes-draggable="false"
            :nodes-connectable="false"
            :elements-selectable="false"
            :zoom-on-scroll="true"
            :pan-on-scroll="true"
            class="runtime-vue-flow"
          >
            <Background pattern-color="#a8b5cf" :gap="20" />

            <template #node-runtime="{ data }">
              <div class="runtime-flow-node" :class="`runtime-flow-node-${data.kind}`">
                <Handle
                  v-if="data.hasTarget"
                  id="target-left"
                  type="target"
                  :position="Position.Left"
                  class="runtime-handle runtime-handle-target"
                />
                <Handle
                  v-if="data.hasSource"
                  id="source-right"
                  type="source"
                  :position="Position.Right"
                  class="runtime-handle runtime-handle-source"
                />
                <template v-if="data.kind === 'host'">
                  <div class="runtime-host-head">
                    <strong>{{ data.title }}</strong>
                    <el-tag :type="data.online ? 'success' : 'info'" size="small">{{ data.status }}</el-tag>
                  </div>
                  <div class="runtime-service-stack">
                    <div v-for="section in data.sections" :key="section.label" class="runtime-service-mini">
                      <div class="node-head">
                        <span class="node-dot" :class="{ online: section.online }"></span>
                        <strong>{{ section.label }}</strong>
                        <el-tag :type="section.online ? 'success' : 'info'" size="small">{{ section.status }}</el-tag>
                      </div>
                      <p>{{ section.value }}</p>
                      <div class="node-meta">
                        <span v-for="item in section.chips" :key="item">{{ item }}</span>
                      </div>
                    </div>
                  </div>
                </template>
                <template v-else>
                  <div class="node-head">
                    <span class="node-dot" :class="{ online: data.online }"></span>
                    <strong>{{ data.title }}</strong>
                    <el-tag :type="data.online ? 'success' : 'info'" size="small">{{ data.status }}</el-tag>
                  </div>
                  <p>{{ data.subtitle }}</p>
                  <div class="node-meta">
                    <span v-for="item in data.meta" :key="item">{{ item }}</span>
                  </div>
                </template>
              </div>
            </template>
          </VueFlow>
        </div>
      </section>

      <section class="settings-table-card topology-detail-card">
        <div class="section-head">
          <h3>连接方式说明</h3>
          <span>当前状态图如何理解，以及下一步多机调度需要补齐的数据。</span>
        </div>
        <div class="connection-notes">
          <div>
            <strong>Server 端是谁</strong>
            <p>以当前可达的 {{ serverEndpoint }} 为主控入口，角色来自 get_node_status。</p>
          </div>
          <div>
            <strong>执行器归属</strong>
            <p>pc / node 视为执行器节点，通过 WebSocket 注册到 Server；离线节点保留历史注册状态。</p>
          </div>
          <div>
            <strong>设备如何连接</strong>
            <p>USB 显示为 USB 直连，有 IP 的设备显示为局域网 / Wi-Fi；设备优先按 owner / executor 字段归属，没有字段时挂到当前主控宿主机。</p>
          </div>
        </div>
      </section>
    </template>

    <el-dialog v-model="dialogVisible" :title="`下发指令 - ${currentDevice?.sn}`" width="500px" destroy-on-close>
      <el-form :model="commandForm" label-width="80px" @submit.prevent>
        <el-form-item label="指令名称" required>
          <el-input v-model="commandForm.command" placeholder="例如: reboot, update_config" />
        </el-form-item>
        <el-form-item label="参数">
          <el-input v-model="commandForm.params" type="textarea" :rows="6" placeholder="请输入 JSON 格式参数" class="code-input" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitCommand" :loading="sending">发送</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="passwordDialogVisible" title="设置锁屏密码" width="400px">
      <el-form :model="passwordForm" label-width="80px" @submit.prevent>
        <el-form-item label="设备SN">
          <el-input v-model="passwordForm.sn" disabled />
        </el-form-item>
        <el-form-item label="密码">
          <el-input v-model="passwordForm.password" placeholder="请输入设备锁屏密码" clearable />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="passwordDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitPassword" :loading="settingPassword">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="transferDialogVisible" title="P2P 文件传输" width="650px" destroy-on-close>
      <el-tabs v-model="activeTransferTab" class="transfer-tabs">
        <el-tab-pane label="新建传输" name="new">
          <el-form :model="transferForm" label-width="100px" class="transfer-form">
            <div class="transfer-panel-grid">
              <div class="transfer-panel-card">
                <div class="transfer-panel-header">发送方 Source</div>
                <div class="transfer-panel-body">
                  <el-form-item label-width="0">
                    <el-select v-model="transferForm.source_sn" placeholder="选择发送设备" style="width: 100%">
                      <el-option
                        v-for="device in devices"
                        :key="device.sn"
                        :label="`${device.sn} (${device.model})`"
                        :value="device.sn"
                        :disabled="device.status !== 'online'"
                      >
                        <span>{{ device.model }} ({{ shortId(device.sn) }})</span>
                      </el-option>
                    </el-select>
                  </el-form-item>
                  <el-form-item label-width="0" class="compact-form-item">
                    <el-input v-model="transferForm.file_path" placeholder="选择文件...">
                      <template #append>
                        <el-button :icon="Folder" @click="openFileBrowser('source')" :disabled="!transferForm.source_sn" />
                      </template>
                    </el-input>
                  </el-form-item>
                </div>
              </div>

              <div class="transfer-panel-card">
                <div class="transfer-panel-header">接收方 Target</div>
                <div class="transfer-panel-body">
                  <el-form-item label-width="0">
                    <el-select v-model="transferForm.target_sn" placeholder="选择接收设备" style="width: 100%">
                      <el-option
                        v-for="device in devices"
                        :key="device.sn"
                        :label="`${device.sn} (${device.model})`"
                        :value="device.sn"
                        :disabled="device.status !== 'online' || device.sn === transferForm.source_sn"
                      >
                        <span>{{ device.model }} ({{ shortId(device.sn) }})</span>
                      </el-option>
                    </el-select>
                  </el-form-item>
                  <el-form-item label-width="0" class="compact-form-item">
                    <el-input v-model="transferForm.save_path" placeholder="保存目录 (默认)">
                      <template #append>
                        <el-button :icon="Folder" @click="openFileBrowser('target')" :disabled="!transferForm.target_sn" />
                      </template>
                    </el-input>
                  </el-form-item>
                </div>
              </div>
            </div>

            <el-form-item class="transfer-submit-row">
              <el-button type="primary" @click="startTransfer" :loading="startingTransfer">
                <el-icon><Connection /></el-icon>
                开始传输
              </el-button>
            </el-form-item>
          </el-form>
        </el-tab-pane>

        <el-tab-pane label="传输列表" name="list">
          <el-table :data="transferList" style="width: 100%" height="300px" empty-text="暂无传输任务">
            <el-table-column prop="filename" label="文件名" min-width="120" show-overflow-tooltip />
            <el-table-column label="方向" width="180">
              <template #default="{ row }">
                <div class="transfer-direction">
                  <el-tag size="small" type="info">{{ shortId(row.source) }}</el-tag>
                  <el-icon><Connection /></el-icon>
                  <el-tag size="small" type="success">{{ shortId(row.target) }}</el-tag>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="进度" min-width="180">
              <template #default="{ row }">
                <el-progress
                  :percentage="row.progress"
                  :status="row.status === 'completed' ? 'success' : (row.status === 'error' ? 'exception' : '')"
                  :stroke-width="6"
                />
                <div class="speed-text" v-if="row.status === 'transferring'">{{ formatSpeed(row.speed) }}</div>
              </template>
            </el-table-column>
            <el-table-column prop="status" label="状态" width="90" />
          </el-table>
        </el-tab-pane>
      </el-tabs>
    </el-dialog>

    <el-dialog v-model="browserVisible" :title="`浏览文件 - ${browserContext.sn}`" width="600px" append-to-body>
      <div class="browser-header">
        <el-button :icon="Back" circle size="small" @click="goUpDir" :disabled="!browserPath || browserPath === '/'" />
        <el-input v-model="browserPath" size="small" class="browser-path-input" @keyup.enter="handlePathEnter" placeholder="输入路径按回车跳转" />
        <el-button type="primary" size="small" v-if="browserContext.mode === 'target'" @click="confirmSelection">
          选择当前目录
        </el-button>
      </div>

      <div class="file-list" v-loading="browserLoading">
        <div v-if="browserFiles.length === 0 && !browserLoading" class="empty-folder">空文件夹</div>
        <div v-for="(item, index) in browserFiles" :key="index" class="file-item" @click="handleBrowserItemClick(item)">
          <el-icon class="file-icon" :size="20">
            <Folder v-if="item.is_dir" />
            <Document v-else />
          </el-icon>
          <span class="file-name">{{ item.name }}</span>
          <span class="file-size" v-if="!item.is_dir">{{ (item.size / 1024).toFixed(1) }} KB</span>
        </div>
      </div>
    </el-dialog>

    <el-dialog v-model="scrcpyDialogVisible" title="远程投屏" width="460px" destroy-on-close :footer="null" class="scrcpy-dialog">
      <div class="scrcpy-frame">
        <ScrcpyWindow :target-device-id="currentScrcpySn" />
      </div>
    </el-dialog>
  </div>
</template>

<style scoped>
.runtime-page {
  width: 100%;
}

.runtime-actions {
  display: flex;
  gap: 10px;
  align-items: center;
}

.refresh-pill {
  min-height: 30px;
}

.status-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
  margin-bottom: 16px;
}

.status-card {
  display: flex;
  gap: 14px;
  align-items: flex-start;
  min-height: 84px;
  position: relative;
  overflow: hidden;
}

.status-card::after {
  content: '';
  position: absolute;
  inset: auto 0 0;
  height: 3px;
  background: #e5e7eb;
}

.status-card.online-card::after {
  background: linear-gradient(90deg, #6366f1, #0ea5e9, #10b981);
}

.status-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.status-card h3 {
  margin: 0;
  font-size: 15px;
  color: #111827;
}

.status-card p {
  margin: 8px 0 0;
  color: #6b7280;
  font-size: 12px;
}

.status-icon {
  width: 36px;
  height: 36px;
  border-radius: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
}

.status-icon.electron { color: #6366f1; background: #eef2ff; }
.status-icon.server { color: #0ea5e9; background: #e0f2fe; }
.status-icon.executor { color: #10b981; background: #ecfdf5; }

.service-card {
  margin-bottom: 16px;
}

.section-head {
  margin: 6px 0 12px;
}

.section-head h3 {
  margin: 0 0 4px;
  color: #111827;
  font-size: 16px;
}

.section-head span {
  color: #6b7280;
  font-size: 13px;
}

.endpoint-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.endpoint-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border: 1px solid #dbeafe;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.72);
}

.endpoint-row strong {
  display: block;
  margin-bottom: 4px;
  color: #1f2937;
  font-size: 13px;
}

.endpoint-row code {
  color: #475569;
  font-size: 12px;
}

.runtime-table {
  margin-top: 4px;
}

.password-cell,
.device-actions,
.transfer-direction {
  display: flex;
  align-items: center;
  gap: 8px;
}

.password-cell span {
  color: #475569;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
}

.device-actions {
  flex-wrap: wrap;
  gap: 2px 8px;
}

.code-input :deep(.el-textarea__inner) {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
}

.transfer-form {
  margin-top: 14px;
}

.transfer-panel-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.transfer-panel-card {
  overflow: hidden;
  border: 1px solid #e0e7ff;
  border-radius: 14px;
  background: linear-gradient(180deg, #ffffff, #f8fafc);
}

.transfer-panel-header {
  padding: 10px 12px;
  border-bottom: 1px solid #edf2ff;
  color: #334155;
  font-size: 12px;
  font-weight: 800;
}

.transfer-panel-body {
  padding: 14px;
}

.compact-form-item {
  margin-bottom: 0;
}

.transfer-submit-row {
  margin: 18px 0 0;
}

.transfer-submit-row :deep(.el-form-item__content) {
  margin-left: 0 !important;
}

.transfer-submit-row .el-button {
  width: 100%;
  height: 40px;
  border-radius: 12px;
  font-weight: 800;
}

.speed-text {
  margin-top: 4px;
  color: #64748b;
  font-size: 11px;
}

.browser-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.browser-path-input {
  flex: 1;
}

.file-list {
  min-height: 320px;
  max-height: 420px;
  overflow: auto;
  border: 1px solid #edf2f7;
  border-radius: 12px;
  background: #fbfdff;
}

.file-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-bottom: 1px solid #edf2f7;
  cursor: pointer;
}

.file-item:hover {
  background: #eff6ff;
}

.file-icon {
  color: #64748b;
}

.file-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  color: #334155;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-size,
.empty-folder {
  color: #94a3b8;
  font-size: 12px;
}

.empty-folder {
  padding: 28px;
  text-align: center;
}

.scrcpy-frame {
  height: 720px;
  margin: -20px;
  overflow: hidden;
}

.topology-card {
  margin-top: 16px;
}

.topology-card h3 {
  margin: 0 0 4px;
  color: #111827;
  font-size: 18px;
}

.topology-canvas {
  position: relative;
  height: 720px;
  margin-top: 14px;
  overflow: hidden;
  border: 1px solid rgba(199, 210, 254, 0.86);
  border-radius: 18px;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.82), rgba(239, 246, 255, 0.72));
  user-select: none;
}

.canvas-toolbar {
  position: absolute;
  top: 12px;
  left: 12px;
  right: 12px;
  z-index: 6;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  border: 1px solid rgba(219, 234, 254, 0.9);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.78);
  backdrop-filter: blur(8px);
  color: #64748b;
  font-size: 12px;
  pointer-events: none;
}

.canvas-toolbar strong {
  color: #475569;
}

.runtime-vue-flow {
  width: 100%;
  height: 100%;
  background: transparent;
}

:deep(.runtime-vue-flow .vue-flow__pane),
:deep(.runtime-vue-flow .vue-flow__node),
:deep(.runtime-vue-flow .vue-flow__edge-text) {
  user-select: none;
}

:deep(.runtime-vue-flow .vue-flow__edge-path) {
  stroke-linecap: round;
}

.runtime-flow-node {
  position: relative;
  box-sizing: border-box;
  width: 300px;
  min-height: 96px;
  padding: 12px 14px;
  border: 1px solid #dbeafe;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 10px 22px rgba(15, 23, 42, 0.08);
}

.runtime-flow-node-host {
  width: 340px;
  padding: 12px;
  border-color: #bfdbfe;
  background: rgba(248, 250, 252, 0.96);
}

.runtime-flow-node-host::before {
  content: '';
  position: absolute;
  inset: 0 auto 0 0;
  width: 4px;
  border-radius: 12px 0 0 12px;
  background: linear-gradient(180deg, #60a5fa, #6366f1);
}

.runtime-flow-node-device {
  width: 300px;
  min-height: 116px;
  border-color: #c7d2fe;
}

.runtime-host-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
  padding-left: 4px;
}

.runtime-host-head strong {
  color: #111827;
  font-size: 14px;
}

.runtime-service-stack {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.runtime-service-mini {
  padding: 10px;
  border: 1px solid #e0e7ff;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.86);
}

.runtime-service-mini p {
  margin: 8px 0;
  color: #64748b;
  font-size: 12px;
  line-height: 1.45;
}

:deep(.runtime-handle) {
  width: 10px;
  height: 10px;
  border: 2px solid #fff;
  background: #6366f1;
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.16);
}

:deep(.runtime-handle-target) {
  left: -5px;
}

:deep(.runtime-handle-source) {
  right: -5px;
}

.topology-detail-card {
  margin-top: 16px;
}

.connection-notes {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.connection-notes div {
  padding: 12px;
  border-radius: 12px;
  background: #fbfdff;
  border: 1px solid #edf2f7;
}

.connection-notes strong {
  color: #1f2937;
  font-size: 13px;
}

.connection-notes p {
  margin: 8px 0 0;
  color: #64748b;
  font-size: 12px;
  line-height: 1.6;
}

</style>
