/**
 * 全局局域网 ClawNode 发现（Electron 桌面端）。
 * 在 App 启动后每 5 秒扫描；弹窗队列全局唯一。
 */
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { getDeviceList } from '@/api/device'
import { wsGetDeviceList } from '@/api/wsAppGraph'
import { addMessageListener, removeMessageListener } from '@/api/mWebSocket'
import { adoptClawNode } from '@/api/clawnode'
import { addKnownClawNode, removeKnownClawNode } from '@/utils/knownClawNodes'
import { displayDeviceSn } from '@/utils/deviceDisplay'
import { dedupeDevicesForUi } from '@/utils/devices'

export const discoveredLanNodes = ref([])
export const lanDiscoveryAttempted = ref(false)
export const discoveringNodes = ref(false)
export const adoptPopupVisible = ref(false)
export const adoptCandidate = ref(null)
export const adoptCountdown = ref(10)
export const adoptingNode = ref(false)

/** 与 Server 同步的设备列表（发现状态判断的唯一依据，不含本地乐观条目） */
export const serverDevices = ref([])

const adoptPromptDismissed = ref(new Set())
const adoptPopupQueue = []
let adoptCountdownTimer = null
let adoptDismissTimer = null
let lanScanTimer = null
let wsListener = null
let started = false

const mergeDiscoveredLanNodes = (nodes) => {
  const map = new Map(discoveredLanNodes.value.map((item) => [item.sn, item]))
  for (const node of nodes) {
    const sn = String(node?.sn || '').trim()
    if (!sn) continue
    map.set(sn, { ...map.get(sn), ...node, sn })
  }
  discoveredLanNodes.value = [...map.values()].sort((a, b) => a.sn.localeCompare(b.sn))
}

export const findServerClawNode = (node) => {
  const sn = String(node?.sn || '').trim()
  if (!sn) return null
  return serverDevices.value.find((d) => d.sn === sn || displayDeviceSn(d) === sn) || null
}

export const isNodeOnServer = (node) => !!findServerClawNode(node)

export const visibleDiscoveredLanNodes = computed(() =>
  discoveredLanNodes.value.filter((node) => {
    const dev = findServerClawNode(node)
    return !(dev && dev.status === 'online')
  }),
)

export const lanNodeStatusLabel = (node) => {
  const dev = findServerClawNode(node)
  if (!dev) return '待添加'
  if (dev.status === 'online') return '已在线'
  return '连接中'
}

export const lanNodeTagType = (node) => {
  const dev = findServerClawNode(node)
  if (!dev) return 'warning'
  if (dev.status === 'online') return 'success'
  return 'info'
}

export const applyServerDeviceList = (data) => {
  const list = Array.isArray(data) ? data : (data?.data || data?.devices || [])
  serverDevices.value = Array.isArray(list) ? dedupeDevicesForUi(list) : []
}

export const fetchServerDevices = async () => {
  try {
    const res = await wsGetDeviceList()
    applyServerDeviceList(res)
    return
  } catch {
    /* fallback HTTP */
  }
  try {
    const res = await getDeviceList()
    applyServerDeviceList(res)
  } catch (e) {
    console.warn('[LanDiscovery] fetch devices failed', e)
  }
}

const clearAdoptTimers = () => {
  if (adoptCountdownTimer) clearInterval(adoptCountdownTimer)
  if (adoptDismissTimer) clearTimeout(adoptDismissTimer)
  adoptCountdownTimer = null
  adoptDismissTimer = null
}

const extractIpv4 = (value) => {
  const match = String(value || '').match(/(\d+\.\d+\.\d+\.\d+)/)
  return match?.[1] || ''
}

export const resolveGatewayHost = async (runtime) => {
  let rt = runtime
  if (!rt?.endpoints?.length && window.electronAPI?.getRuntimeStatus) {
    try {
      rt = await window.electronAPI.getRuntimeStatus()
    } catch {
      /* ignore */
    }
  }
  for (const ep of rt?.endpoints || []) {
    const ip = extractIpv4(ep.localIp || ep.wsUrl || ep.url)
    if (ip && ip !== '127.0.0.1') return ip
  }
  const pcNode = serverDevices.value.find(
    (d) => d.status === 'online' && (d.type === 'pc' || (d.role === 'node' && d.type !== 'android')),
  )
  const ip = extractIpv4(pcNode?.ip)
  if (ip) return ip
  return extractIpv4(rt?.endpoints?.find((e) => e.name === 'localhost')?.url) || '127.0.0.1'
}

export const confirmAdoptNode = async (node, runtime) => {
  const sn = String(node?.sn || '').trim()
  if (!sn) return
  adoptingNode.value = true
  try {
    const res = await adoptClawNode(sn, await resolveGatewayHost(runtime), {
      ip: node.host,
      model: node.model,
    })
    addKnownClawNode(sn)
    adoptPromptDismissed.value = new Set([...adoptPromptDismissed.value, sn])
    if (res?.data?.devices) {
      applyServerDeviceList(res.data.devices)
    } else {
      await fetchServerDevices()
    }
    const pending = res?.data?.pending
    ElMessage.success(
      pending ? `已添加 ${sn.slice(0, 14)}…，等待设备连接…` : `已添加设备 ${sn.slice(0, 14)}…`,
    )
    return true
  } catch (e) {
    ElMessage.error(e?.message || e?.msg || '添加设备失败')
    return false
  } finally {
    adoptingNode.value = false
  }
}

export const dismissAdoptPopup = async (confirmed = false) => {
  clearAdoptTimers()
  const node = adoptCandidate.value
  adoptPopupVisible.value = false
  adoptCandidate.value = null
  adoptCountdown.value = 10
  if (!confirmed && node?.sn) {
    adoptPromptDismissed.value = new Set([...adoptPromptDismissed.value, node.sn])
  }
  if (confirmed && node) {
    await confirmAdoptNode(node)
  }
  processAdoptPopupQueue()
}

const openAdoptPopup = (node) => {
  if (!node?.sn || isNodeOnServer(node)) return
  adoptCandidate.value = node
  adoptPopupVisible.value = true
  adoptCountdown.value = 10
  clearAdoptTimers()
  adoptCountdownTimer = setInterval(() => {
    adoptCountdown.value -= 1
    if (adoptCountdown.value <= 0 && adoptCountdownTimer) clearInterval(adoptCountdownTimer)
  }, 1000)
  adoptDismissTimer = setTimeout(() => dismissAdoptPopup(false), 10000)
}

const processAdoptPopupQueue = () => {
  if (adoptPopupVisible.value) return
  while (adoptPopupQueue.length) {
    const next = adoptPopupQueue.shift()
    if (!next?.sn || isNodeOnServer(next)) continue
    openAdoptPopup(next)
    return
  }
}

const enqueueAdoptPopup = (node) => {
  const sn = String(node?.sn || '').trim()
  if (!sn || isNodeOnServer(node)) return
  if (adoptPromptDismissed.value.has(sn)) return
  if (adoptPopupQueue.some((item) => item.sn === sn)) return
  if (adoptPopupVisible.value && adoptCandidate.value?.sn === sn) return
  adoptPopupQueue.push({ ...node, sn })
  processAdoptPopupQueue()
}

export const runLanScan = async () => {
  if (discoveringNodes.value || !window.electronAPI?.discoverLanNodes) return
  discoveringNodes.value = true
  lanDiscoveryAttempted.value = true
  try {
    const [lanNodes] = await Promise.all([
      window.electronAPI.discoverLanNodes(2000),
      fetchServerDevices(),
    ])
    mergeDiscoveredLanNodes(lanNodes || [])
    for (const node of lanNodes || []) {
      enqueueAdoptPopup(node)
    }
  } catch (e) {
    console.warn('[LanDiscovery] scan failed', e)
  } finally {
    discoveringNodes.value = false
  }
}

/** 解绑后：清除本地状态，允许再次弹窗/显示「待添加」 */
export const notifyDeviceUnbound = (...sns) => {
  const drop = new Set(sns.map((s) => String(s || '').trim()).filter(Boolean))
  if (!drop.size) return
  removeKnownClawNode(...drop)
  serverDevices.value = serverDevices.value.filter(
    (d) => !drop.has(d.sn) && !drop.has(displayDeviceSn(d)),
  )
  discoveredLanNodes.value = discoveredLanNodes.value.filter((n) => !drop.has(n.sn))
  adoptPromptDismissed.value = new Set(
    [...adoptPromptDismissed.value].filter((sn) => !drop.has(sn)),
  )
  for (let i = adoptPopupQueue.length - 1; i >= 0; i -= 1) {
    if (drop.has(adoptPopupQueue[i]?.sn)) adoptPopupQueue.splice(i, 1)
  }
  if (drop.has(adoptCandidate.value?.sn)) {
    clearAdoptTimers()
    adoptPopupVisible.value = false
    adoptCandidate.value = null
  }
}

const handleWsMessage = (res) => {
  if (!res) return
  const action = res.action || res.type
  const data = res.data || {}
  if (action === 'get_device_list' || action === 'device_list_update') {
    applyServerDeviceList(action === 'device_list_update' ? (data.devices || data) : data)
    if (action === 'device_list_update' && data.event === 'unbind' && data.sn) {
      notifyDeviceUnbound(data.sn)
    }
  }
}

export const startGlobalLanDiscovery = () => {
  if (started || !window.electronAPI?.discoverLanNodes) return
  started = true
  wsListener = handleWsMessage
  addMessageListener(wsListener)
  fetchServerDevices()
  runLanScan()
  lanScanTimer = setInterval(runLanScan, 5000)
}

export const stopGlobalLanDiscovery = () => {
  if (!started) return
  started = false
  if (lanScanTimer) {
    clearInterval(lanScanTimer)
    lanScanTimer = null
  }
  if (wsListener) {
    removeMessageListener(wsListener)
    wsListener = null
  }
  clearAdoptTimers()
  adoptPopupQueue.length = 0
}
