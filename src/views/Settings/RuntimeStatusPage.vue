<script setup>
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Monitor, Cpu, Connection, Refresh, VideoPlay, Files, Lock, Cellphone, Folder, Document, Back, List, Grid, ArrowRight } from '@element-plus/icons-vue'
import { VueFlow, MarkerType, Handle, Position } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { addMessageListener, removeMessageListener, sendWsRequest } from '@/api/mWebSocket'
import { wsGetDeviceList } from '@/api/wsAppGraph'
import { getNodeStatus } from '@/api/system'
import { getDeviceList, sendCommand, setDevicePassword } from '@/api/device'
import { getBaseUrl, savePairedGateway, getPairedGatewayDisplay } from '@/utils/config'
import { dedupeDevicesForUi, applyStableDeviceOrder, applyOnlineStatusGrace } from '@/utils/devices'
import { readKnownClawNodes, addKnownClawNode, removeKnownClawNode, pruneKnownClawNodes } from '@/utils/knownClawNodes'
import { displayDeviceSn, formatDeviceType } from '@/utils/deviceDisplay'
import { formatRelativeTime } from '@/utils/relativeTime'
import { pullClawNodeLogsToClipboard, formatLogSize, listClawNodeLogs, downloadClawNodeLogUrl, unbindClawNode } from '@/api/clawnode'
import {
  lanDiscoveryAttempted,
  discoveringNodes,
  visibleDiscoveredLanNodes,
  isNodeOnServer,
  canAdoptLanNode,
  pendingAdoptSns,
  requestAdoptNode,
  declineAdoptNode,
  notifyDeviceUnbound,
  applyServerDeviceList,
  adoptingNode,
} from '@/utils/globalLanDiscovery'
import { reconnectWebSocket } from '@/api/mWebSocket'
import ScrcpyWindow from '@/views/WorkflowEditor/components/ScrcpyWindow.vue'

const router = useRouter()
const route = useRoute()
const loading = ref(false)
const initialLoading = ref(true)
const runtime = ref(null)
const nodeStatus = ref(null)
const devices = ref([])
const lastUpdated = ref('')
const activeTab = ref('overview')
const clusterViewMode = ref('list')
const knownNodeSns = ref(readKnownClawNodes())
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

const discoveringGateways = ref(false)
const discoveredGateways = ref([])
const gatewayDialogVisible = ref(false)
const logWindowMinutes = ref(5)
const logsDialogVisible = ref(false)
const logFiles = ref([])
const loadingLogs = ref(false)
const selectedGateway = ref(null)
const pairingGateway = ref(false)
const pairedGatewayLabel = ref(getPairedGatewayDisplay())
const relativeTimeTick = ref(0)
let relativeTimer = null

const formatLastOnline = (value) => {
  void relativeTimeTick.value
  return formatRelativeTime(value)
}

const goToDeviceDetail = (row) => {
  const sn = row?.sn || displayDeviceSn(row)
  if (!sn || sn === '—') return
  router.push({ name: 'SettingsDeviceDetail', params: { sn: encodeURIComponent(sn) } })
}

const isMobileType = (device) => ['android', 'ios', 'mobile', 'android_direct'].includes(String(device?.type || '').toLowerCase())
const isExecutorNode = (device) => device?.type === 'pc' || (device?.role === 'node' && !isMobileType(device))

const executorNodes = computed(() => devices.value.filter((d) => isExecutorNode(d)))
const serviceOnline = computed(() => {
  if (runtime.value?.isLocalGateway) return true
  if (runtime.value?.embeddedServer?.running) return true
  if (nodeStatus.value?.connected || nodeStatus.value?.role === 'gateway' || nodeStatus.value?.role === 'node') return true
  return runtime.value?.endpoints?.some((item) => item.online) ?? false
})
const serverEndpoint = computed(() => {
  const onlineEndpoint = runtime.value?.endpoints?.find((item) => item.online)
  return onlineEndpoint?.url || getBaseUrl()
})
const serverRole = computed(() => {
  if (nodeStatus.value?.role && nodeStatus.value.role !== 'unknown') return nodeStatus.value.role
  if (runtime.value?.isLocalGateway || runtime.value?.embeddedServer?.running) return 'gateway'
  return 'unknown'
})
const serverSn = computed(() => nodeStatus.value?.sn || runtime.value?.electron?.pid || 'local')
const isLocalGateway = computed(() => {
  if (runtime.value?.isLocalGateway) return true
  if (runtime.value?.embeddedServer?.running) return true
  const localhost = runtime.value?.endpoints?.find((item) => item.name === 'localhost' || item.url?.includes('127.0.0.1'))
  return localhost?.online === true
})
const displayDevices = computed(() => devices.value)
const devicePool = computed(() => displayDevices.value.filter((d) => !isExecutorNode(d)))
const onlineDevices = computed(() => displayDevices.value.filter((d) => d.status === 'online'))
const mobileDevices = computed(() => displayDevices.value.filter((d) => isMobileType(d)))
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
const shortNodeSn = (sn) => {
  const text = String(sn || '').trim()
  if (!text) return '—'
  if (text.length <= 22) return text
  return `${text.slice(0, 14)}…${text.slice(-6)}`
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
          title: device.model || displayDeviceSn(device),
          status: device.status,
          online: device.status === 'online',
          hasSource: false,
          hasTarget: true,
          subtitle: connectionMode(device),
          meta: [device.type, device.ip || '无连接地址', displayDeviceSn(device)],
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
  const nextDevices = Array.isArray(list) ? dedupeDevicesForUi(list) : []
  const previous = devices.value

  const merged = nextDevices.map((item) => {
    const oldItem = previous.find((old) => old.sn === item.sn)
    if ((item.password === undefined || item.password === null) && oldItem?.password) {
      return { ...item, password: oldItem.password }
    }
    return item
  })

  const withGrace = applyOnlineStatusGrace(merged, previous)
  devices.value = applyStableDeviceOrder(withGrace, previous)
  knownNodeSns.value = pruneKnownClawNodes(devices.value)
  applyServerDeviceList(nextDevices)
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

const applyRouteQuery = () => {
  const view = route.query.view
  if (view === 'topology' || route.query.tab === 'cluster') activeTab.value = 'topology'
  else activeTab.value = 'overview'
  if (route.query.transfer) openTransferDialog(String(route.query.transfer))
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

  if (action === 'get_device_list') {
    applyDeviceList(data)
  } else if (action === 'device_list_update') {
    applyDeviceList(data?.devices || data)
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

const discoverGateways = async () => {
  discoveringGateways.value = true
  try {
    discoveredGateways.value = await window.electronAPI?.discoverGateways?.() || []
    selectedGateway.value = discoveredGateways.value[0] || null
    gatewayDialogVisible.value = true
    if (!discoveredGateways.value.length) {
      ElMessage.warning('未发现局域网网关，请确认 MiniOrangeServer 已启动')
    }
  } catch (e) {
    ElMessage.error(e?.message || '网关发现失败')
  } finally {
    discoveringGateways.value = false
  }
}

const handleAdoptLanNode = (node) => requestAdoptNode(node, runtime.value)

const handleDeclineLanNode = (node) => declineAdoptNode(node)

const handleFetchLogs = async (row) => {
  const sn = row?.sn || displayDeviceSn(row)
  try {
    const result = await pullClawNodeLogsToClipboard(sn, { minutes: logWindowMinutes.value })
    ElMessage.success(`近 ${logWindowMinutes.value} 分钟日志已复制（${formatLogSize(result.size || result.contentLength)}）`)
  } catch (e) {
    ElMessage.error(e?.message || e?.msg || '拉取日志失败')
  }
}

const openLogsDialog = async () => {
  logsDialogVisible.value = true
  loadingLogs.value = true
  try {
    const res = await listClawNodeLogs()
    logFiles.value = res?.data || []
  } catch (e) {
    logFiles.value = []
    ElMessage.error(e?.message || '加载日志列表失败')
  } finally {
    loadingLogs.value = false
  }
}

const resolveLogDeviceModel = (sn) => {
  const key = String(sn || '').trim()
  if (!key) return '—'
  const dev = devices.value.find((d) => d.sn === key || displayDeviceSn(d) === key)
  return dev?.model || key
}

const downloadLog = async (filename) => {
  try {
    const url = downloadClawNodeLogUrl(filename)
    const res = await fetch(url)
    if (!res.ok) throw new Error(`下载失败 (${res.status})`)
    const blob = await res.blob()
    const objectUrl = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = objectUrl
    anchor.download = filename
    anchor.style.display = 'none'
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(objectUrl)
  } catch (e) {
    ElMessage.error(e?.message || '下载失败')
  }
}

const formatLogTime = (mtime) => {
  if (!mtime) return '—'
  return new Date(mtime * 1000).toLocaleString()
}

const handleUnbindDevice = async (row) => {
  const sn = displayDeviceSn(row)
  try {
    await ElMessageBox.confirm(
      `确定从当前 Server 解绑设备 ${sn} 吗？解绑后需重新在桌面端添加配对。`,
      '解绑设备',
      { type: 'warning', confirmButtonText: '解绑', cancelButtonText: '取消' },
    )
    await unbindClawNode(sn)
    notifyDeviceUnbound(sn, row?.sn)
    knownNodeSns.value = removeKnownClawNode(sn, row?.sn)
    ElMessage.success('设备已解绑')
    await load({ silent: true })
  } catch (e) {
    if (e !== 'cancel' && e?.message !== 'cancel') {
      ElMessage.error(e?.message || '解绑失败')
    }
  }
}

const selectGatewayCandidate = (gateway) => {
  selectedGateway.value = gateway
}

const confirmPairGateway = async () => {
  const gateway = selectedGateway.value
  if (!gateway) {
    ElMessage.warning('请先选择一个网关')
    return
  }
  pairingGateway.value = true
  try {
    const token = localStorage.getItem('ws_token') || ''
    const result = await window.electronAPI?.pairGateway?.({
      host: gateway.host,
      wsUrl: gateway.wsUrl,
      httpUrl: gateway.httpUrl,
      gatewayId: gateway.instanceId,
      displayName: gateway.displayName,
    })
    if (!result?.success) {
      ElMessage.error('网关不可达，请检查网络或服务端状态')
      return
    }
    savePairedGateway({
      host: gateway.host,
      gatewayId: gateway.instanceId,
      displayName: gateway.displayName,
    })
    pairedGatewayLabel.value = gateway.displayName
    reconnectWebSocket(token)
    gatewayDialogVisible.value = false
    ElMessage.success(`已配对网关：${gateway.displayName}`)
    await load()
  } catch (e) {
    ElMessage.error(e?.message || '配对失败')
  } finally {
    pairingGateway.value = false
  }
}

const fetchDeviceList = async () => {
  try {
    const res = await wsGetDeviceList()
    applyDeviceList(res)
    return
  } catch (wsErr) {
    console.warn('[RuntimeStatus] WS device list failed, fallback HTTP', wsErr)
  }
  try {
    const res = await getDeviceList()
    applyDeviceList(res)
  } catch (httpErr) {
    console.warn('[RuntimeStatus] HTTP device list failed', httpErr)
  }
}

const load = async ({ silent = false } = {}) => {
  if (!silent) loading.value = true
  try {
    const [runtimeRes, nodeRes, deviceRes] = await Promise.allSettled([
      window.electronAPI?.getRuntimeStatus?.(),
      getNodeStatus(),
      fetchDeviceList(),
    ])
    runtime.value = runtimeRes.status === 'fulfilled' ? runtimeRes.value : null
    nodeStatus.value = nodeRes.status === 'fulfilled' ? nodeRes.value?.data : null
    lastUpdated.value = new Date().toLocaleTimeString()
  } catch (e) {
    ElMessage.error(e?.message || '状态刷新失败')
  } finally {
    loading.value = false
    initialLoading.value = false
  }
}

onMounted(() => {
  addMessageListener(handleWsMessage)
  load()
  applyRouteQuery()
  relativeTimer = setInterval(() => { relativeTimeTick.value += 1 }, 30000)
})

watch(() => route.query, applyRouteQuery)

onUnmounted(() => {
  removeMessageListener(handleWsMessage)
  if (relativeTimer) clearInterval(relativeTimer)
})
</script>

<template>
  <div class="settings-panel runtime-page wide-panel" v-loading="initialLoading">
    <header class="settings-toolbar runtime-toolbar">
      <span class="settings-summary-pill">{{ runtimeSummary }}</span>
      <div class="runtime-actions">
        <button type="button" class="settings-action-pill refresh-pill" style="--brand: #a855f7" @click="openLogsDialog">
          <el-icon><Document /></el-icon>
          <span>日志导出</span>
        </button>
        <button type="button" class="settings-action-pill refresh-pill" style="--brand: #22c55e" @click="openTransferDialog()">
          <el-icon><Files /></el-icon>
          <span>文件传输</span>
          <span class="settings-action-arrow">↗</span>
        </button>
        <button type="button" class="settings-action-pill refresh-pill" style="--brand: #0ea5e9" :disabled="loading" @click="load()">
          <el-icon><Refresh /></el-icon>
          <span>刷新状态</span>
          <span class="settings-action-arrow">↻</span>
        </button>
      </div>
    </header>

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
            <p>{{ serverEndpoint }} · role {{ serverRole }}</p>
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
          <h3>{{ isLocalGateway ? '本机 Gateway' : 'Gateway 发现与配对' }}</h3>
          <span v-if="isLocalGateway">当前电脑已运行 MiniOrange Server，局域网设备可通过 mDNS 发现本机。</span>
          <span v-else>发现与鉴权分离：先选择网关，再由 Token 建立 WebSocket 连接。</span>
        </div>
        <div class="discovery-actions">
          <el-button
            v-if="!isLocalGateway"
            type="primary"
            :loading="discoveringGateways"
            @click="discoverGateways"
          >
            发现网关
          </el-button>
          <span v-if="pairedGatewayLabel && !isLocalGateway" class="paired-pill">已配对：{{ pairedGatewayLabel }}</span>
          <span v-if="isLocalGateway && runtime?.endpoints?.[1]" class="paired-pill">
            mDNS：{{ runtime.endpoints[1].url }}
          </span>
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
    </template>

    <template v-else>
      <template v-if="clusterViewMode === 'list'">
        <section class="settings-table-card">
          <div class="section-head with-switch">
            <div>
              <h3>执行器与设备</h3>
              <span>Server 负责调度，执行器节点负责连接设备并执行动作。</span>
            </div>
            <div class="view-mode-switch">
              <el-tooltip content="列表视图" placement="top">
                <button type="button" class="view-mode-btn" :class="{ active: clusterViewMode === 'list' }" @click="clusterViewMode = 'list'">
                  <el-icon><List /></el-icon>
                </button>
              </el-tooltip>
              <el-tooltip content="拓扑画布" placement="top">
                <button type="button" class="view-mode-btn" :class="{ active: clusterViewMode === 'canvas' }" @click="clusterViewMode = 'canvas'">
                  <el-icon><Grid /></el-icon>
                </button>
              </el-tooltip>
            </div>
          </div>
          <el-table
            :data="displayDevices"
            empty-text="暂无已注册设备"
            class="runtime-table device-table-clickable"
            :row-class-name="({ row }) => (row.status === 'online' ? 'device-row-online' : 'device-row-offline')"
            @row-click="goToDeviceDetail"
          >
            <el-table-column label="ClawSN" min-width="200" show-overflow-tooltip>
              <template #default="{ row }">
                {{ displayDeviceSn(row) }}
              </template>
            </el-table-column>
            <el-table-column label="类型" width="100">
              <template #default="{ row }">{{ formatDeviceType(row) }}</template>
            </el-table-column>
            <el-table-column prop="role" label="角色" width="100" />
            <el-table-column prop="model" label="型号" min-width="140" show-overflow-tooltip />
            <el-table-column prop="ip" label="IP" width="140" />
            <el-table-column label="状态" width="90">
              <template #default="{ row }">
                <el-tag :type="row.status === 'online' ? 'success' : 'info'" size="small">{{ row.status }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="最后在线" width="120" show-overflow-tooltip>
              <template #default="{ row }">{{ formatLastOnline(row.last_online) }}</template>
            </el-table-column>
            <el-table-column label="" width="48" fixed="right">
              <template #default>
                <el-icon class="row-enter-icon"><ArrowRight /></el-icon>
              </template>
            </el-table-column>
          </el-table>
          <div class="device-table-footer">
            <span class="lan-scan-status">
              <span v-if="discoveringNodes" class="scanning-hint">正在扫描附近设备…</span>
              <span v-else class="scan-idle-hint">每 5 秒自动扫描局域网设备</span>
            </span>
          </div>

          <div v-if="lanDiscoveryAttempted" class="lan-discovery-panel">
            <h4 class="wifi-section-title">
              附近 ClawNode
              <span v-if="discoveringNodes" class="scanning-hint">扫描中…</span>
            </h4>

            <div v-if="!discoveringNodes && !visibleDiscoveredLanNodes.length" class="discovery-empty-inline">
              暂未发现待处理的 ClawNode。请确认手机与电脑在同一 WiFi/网段，且 ClawNode 已打开。
            </div>

            <div v-if="visibleDiscoveredLanNodes.length" class="lan-device-list">
              <div
                v-for="node in visibleDiscoveredLanNodes"
                :key="`lan-${node.sn}`"
                class="lan-device-row"
              >
                <span class="lan-device-icon">📱</span>
                <div class="lan-device-main">
                  <span class="lan-device-sn" :title="node.sn">{{ shortNodeSn(node.sn) }}</span>
                  <span class="lan-device-sub">{{ node.model || 'Android Node' }} · {{ node.host }}</span>
                </div>
                <div class="lan-device-actions">
                  <el-tag v-if="pendingAdoptSns.has(node.sn)" size="small" type="info">连接中</el-tag>
                  <el-button
                    v-if="canAdoptLanNode(node)"
                    size="small"
                    type="primary"
                    plain
                    :loading="adoptingNode"
                    @click="handleAdoptLanNode(node)"
                  >
                    添加
                  </el-button>
                  <el-button
                    v-if="canAdoptLanNode(node)"
                    size="small"
                    @click="handleDeclineLanNode(node)"
                  >
                    忽略
                  </el-button>
                </div>
              </div>
            </div>

            <p v-if="visibleDiscoveredLanNodes.length" class="discovery-hint">
              「连接中」表示已添加但未上线；在线后会自动从列表移除。
            </p>
          </div>
        </section>
      </template>

      <template v-else>
      <section class="settings-info-card topology-card">
        <span class="settings-kicker">当前状态图</span>
        <div class="section-head with-switch">
          <div>
            <h3>Server / 执行器 / 设备连接关系</h3>
            <span>按当前接口上报状态展示，后续可在执行器注册时补充明确的设备归属。</span>
          </div>
          <div class="view-mode-switch">
            <el-tooltip content="列表视图" placement="top">
              <button type="button" class="view-mode-btn" :class="{ active: clusterViewMode === 'list' }" @click="clusterViewMode = 'list'">
                <el-icon><List /></el-icon>
              </button>
            </el-tooltip>
            <el-tooltip content="拓扑画布" placement="top">
              <button type="button" class="view-mode-btn" :class="{ active: clusterViewMode === 'canvas' }" @click="clusterViewMode = 'canvas'">
                <el-icon><Grid /></el-icon>
              </button>
            </el-tooltip>
          </div>
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

    <el-dialog v-model="gatewayDialogVisible" title="发现网关" width="560px" destroy-on-close>
      <div v-if="!discoveredGateways.length" class="discovery-empty">未发现 `_miniorange-gw._tcp` 网关</div>
      <div v-else class="wifi-device-list">
        <button
          v-for="gw in discoveredGateways"
          :key="gw.instanceId"
          type="button"
          class="wifi-device-item"
          :class="{ active: selectedGateway?.instanceId === gw.instanceId }"
          @click="selectGatewayCandidate(gw)"
        >
          <span class="wifi-device-icon">📡</span>
          <span class="wifi-device-meta">
            <strong>{{ gw.displayName }}</strong>
            <small>{{ gw.wsUrl }}</small>
            <small v-if="gw.lanHost">{{ gw.lanHost }}</small>
          </span>
        </button>
      </div>
      <template #footer>
        <el-button @click="gatewayDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="pairingGateway" @click="confirmPairGateway">确认连接</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="logsDialogVisible" title="ClawNode 日志导出" width="720px" destroy-on-close>
      <div class="logs-toolbar">
        <span>已上传至 Server 的设备日志，可按文件名下载。</span>
        <el-button size="small" :loading="loadingLogs" @click="openLogsDialog">刷新</el-button>
      </div>
      <el-table v-loading="loadingLogs" :data="logFiles" empty-text="暂无日志文件" height="360px">
        <el-table-column prop="filename" label="文件名" min-width="240" show-overflow-tooltip />
        <el-table-column label="设备型号" width="180" show-overflow-tooltip>
          <template #default="{ row }">{{ resolveLogDeviceModel(row.sn) }}</template>
        </el-table-column>
        <el-table-column label="大小" width="100">
          <template #default="{ row }">{{ formatLogSize(row.size) }}</template>
        </el-table-column>
        <el-table-column label="上传时间" width="180">
          <template #default="{ row }">{{ formatLogTime(row.mtime) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="100" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="downloadLog(row.filename)">下载</el-button>
          </template>
        </el-table-column>
      </el-table>
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

.discovery-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.paired-pill {
  margin-left: auto;
  padding: 4px 10px;
  border-radius: 999px;
  background: #ecfdf5;
  color: #047857;
  font-size: 12px;
}

.wifi-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.wifi-section-title {
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 600;
  color: #374151;
}

.section-head.with-switch {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.section-head.with-switch > div:first-child {
  min-width: 0;
}

.cluster-toolbar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 12px;
}

.view-mode-switch {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 3px;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  background: #fff;
}

.view-mode-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: #6b7280;
  cursor: pointer;
}

.view-mode-btn.active {
  background: #eff6ff;
  color: #0284c7;
}

.view-mode-btn:hover {
  background: #f3f4f6;
}

:deep(.device-table-clickable .el-table__row.device-row-online) {
  background: #f0fdf4;
}

:deep(.device-table-clickable .el-table__row.device-row-online:hover) {
  background: #dcfce7;
}

:deep(.device-table-clickable .el-table__row.device-row-offline) {
  color: #6b7280;
}

:deep(.device-table-clickable .el-table__row) {
  cursor: pointer;
}

:deep(.device-table-clickable .el-table__row:hover) {
  background: #f8fafc;
}

.row-enter-icon {
  color: #9ca3af;
}

.device-table-footer {
  display: flex;
  justify-content: flex-start;
  padding-top: 14px;
  margin-top: 4px;
  border-top: 1px solid #f1f5f9;
}

.lan-scan-status {
  font-size: 13px;
  color: #64748b;
}

.scan-idle-hint {
  color: #94a3b8;
}

.lan-discovery-panel {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px dashed #e5e7eb;
  overflow: hidden;
}

.lan-device-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 280px;
  overflow-y: auto;
  overflow-x: hidden;
}

.lan-device-row {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  padding: 10px 12px;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  background: #fff;
  max-width: 100%;
  box-sizing: border-box;
}

.lan-device-icon {
  font-size: 18px;
  text-align: center;
}

.lan-device-main {
  min-width: 0;
  overflow: hidden;
}

.lan-device-sn {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: #111827;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lan-device-sub {
  display: block;
  margin-top: 2px;
  font-size: 12px;
  color: #6b7280;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lan-device-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.adopt-popup-body {
  padding: 0 2px;
}

.adopt-popup-lead {
  margin: 0 0 12px;
  font-size: 14px;
  color: #374151;
}

.adopt-device-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  background: #f8fafc;
  margin-bottom: 10px;
  min-width: 0;
}

.adopt-device-icon {
  font-size: 22px;
  flex-shrink: 0;
}

.adopt-device-info {
  min-width: 0;
  flex: 1;
}

.adopt-device-sn {
  font-size: 14px;
  font-weight: 600;
  color: #111827;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.adopt-device-sub {
  margin-top: 4px;
  font-size: 12px;
  color: #6b7280;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cluster-view-tabs {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 16px;
}

.cluster-view-tab {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  padding: 12px 14px;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  background: #fff;
  cursor: pointer;
}

.cluster-view-tab.active {
  border-color: #0ea5e9;
  box-shadow: inset 0 0 0 1px #0ea5e9;
}

.cluster-view-tab strong {
  font-size: 14px;
}

.cluster-view-tab span {
  font-size: 12px;
  color: #6b7280;
}

.adopt-popup-body p {
  margin: 0 0 12px;
  color: #374151;
}

.adopt-countdown {
  margin: 0;
  font-size: 12px;
  color: #9ca3af;
  text-align: center;
}

.lan-discovery-panel .wifi-section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 10px;
}

.scanning-hint {
  font-size: 12px;
  font-weight: 500;
  color: #0ea5e9;
}

.discovery-empty-inline {
  padding: 12px 14px;
  border-radius: 10px;
  background: #f8fafc;
  color: #64748b;
  font-size: 13px;
  line-height: 1.5;
}

.logs-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  gap: 12px;
  color: #6b7280;
  font-size: 13px;
}

.wifi-device-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 360px;
  overflow: auto;
}

.wifi-device-item {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 12px 14px;
  border: 1px solid #dbeafe;
  border-radius: 14px;
  background: #fff;
  text-align: left;
  cursor: pointer;
}

.wifi-device-item.active {
  border-color: #2563eb;
  box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.12);
}

.wifi-device-item.readonly {
  cursor: default;
}

.wifi-device-icon {
  font-size: 22px;
  width: 32px;
  text-align: center;
}

.wifi-device-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.wifi-device-meta strong {
  color: #111827;
  font-size: 14px;
}

.wifi-device-meta small {
  color: #6b7280;
  font-size: 12px;
  word-break: break-all;
}

.discovery-empty,
.discovery-hint {
  color: #6b7280;
  font-size: 13px;
}

.discovery-hint {
  margin-top: 12px;
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
