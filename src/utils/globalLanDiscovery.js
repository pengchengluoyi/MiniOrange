/**
 * 全局局域网 ClawNode 发现（Electron 桌面端）。
 * 在 App 启动后每 5 秒扫描；弹窗队列全局唯一。
 */
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { getDeviceList } from '@/api/device'
import { getRuntimeStatusHttp } from '@/api/system'
import { wsGetDeviceList } from '@/api/wsAppGraph'
import { addMessageListener, removeMessageListener } from '@/api/mWebSocket'
import { adoptClawNode } from '@/api/clawnode'
import { addKnownClawNode, removeKnownClawNode, readKnownClawNodes } from '@/utils/knownClawNodes'
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

/** 桌面端已 adopt、等待手机上线 */
export const pendingAdoptSns = ref(new Set())

/** 弹窗「暂不添加」：仅抑制 10s 快速弹窗，设备仍显示在附近列表 */
const popupSkippedSns = ref(new Set())
/** 附近列表「忽略」：从发现列表隐藏 */
const lanListIgnoredSns = ref(new Set())
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

/** 已在服务端或本地 adopt 过：不再弹窗/不再出现在附近列表 */
export const isNodeAlreadyRegistered = (node) => {
  const sn = String(node?.sn || '').trim()
  if (!sn) return false
  if (isNodeOnServer(node)) return true
  return readKnownClawNodes().includes(sn)
}

export const isDevicePairedOnPhone = (node) => {
  const raw = node?.paired ?? node?.txt?.paired
  if (raw === undefined || raw === null || raw === '') return true
  return raw === '1' || raw === 1 || raw === true
}

export const canAdoptLanNode = (node) => {
  const sn = String(node?.sn || '').trim()
  if (lanListIgnoredSns.value.has(sn)) return false
  if (pendingAdoptSns.value.has(sn)) return false
  if (adoptingNode.value && adoptCandidate.value?.sn === sn) return false
  if (isNodeAlreadyRegistered(node)) return false
  return !isDevicePairedOnPhone(node)
}

export const visibleDiscoveredLanNodes = computed(() =>
  discoveredLanNodes.value.filter((node) => {
    const sn = String(node?.sn || '').trim()
    if (lanListIgnoredSns.value.has(sn)) return false
    const dev = findServerClawNode(node)
    if (dev || readKnownClawNodes().includes(sn)) return false
    return true
  }),
)

export const lanNodeStatusLabel = (node) => {
  const sn = String(node?.sn || '').trim()
  const dev = findServerClawNode(node)
  if (dev?.status === 'online') return '已在线'
  if (pendingAdoptSns.value.has(sn)) return '连接中'
  if (!isDevicePairedOnPhone(node)) return '待添加'
  if (dev) return '连接中'
  return '待添加'
}

export const lanNodeTagType = (node) => {
  const sn = String(node?.sn || '').trim()
  const dev = findServerClawNode(node)
  if (dev?.status === 'online') return 'success'
  if (pendingAdoptSns.value.has(sn)) return 'info'
  if (!isDevicePairedOnPhone(node)) return 'warning'
  if (dev) return 'info'
  return 'warning'
}

export const applyServerDeviceList = (data) => {
  const list = Array.isArray(data) ? data : (data?.data || data?.devices || [])
  serverDevices.value = Array.isArray(list) ? dedupeDevicesForUi(list) : []
  for (const d of serverDevices.value) {
    const sn = String(d?.sn || '').trim()
    if (sn.startsWith('claw-')) addKnownClawNode(sn)
  }
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

const pickNodeIpv4 = (node) => {
  const candidates = [node?.host, node?.txt?.host, ...(node?.addresses || [])]
  for (const item of candidates) {
    const ip = extractIpv4(item)
    if (ip) return ip
  }
  return ''
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
  if (!rt?.endpoints?.length) {
    try {
      rt = (await getRuntimeStatusHttp())?.data || rt
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
  if (!sn) return false
  if (pendingAdoptSns.value.has(sn)) return true
  adoptingNode.value = true
  try {
    const res = await adoptClawNode(sn, await resolveGatewayHost(runtime), {
      ip: pickNodeIpv4(node),
      model: node.model,
      pair_port: node.pair_port || node.txt?.pair_port || 10105,
    })
    addKnownClawNode(sn)
    pendingAdoptSns.value = new Set([...pendingAdoptSns.value, sn])
    popupSkippedSns.value = new Set([...popupSkippedSns.value, sn])
    if (res?.data?.devices) {
      applyServerDeviceList(res.data.devices)
    } else {
      await fetchServerDevices()
    }
    syncPendingAdopts()
    const pending = res?.data?.pending
    ElMessage.success(
      pending ? `已添加 ${sn.slice(0, 14)}…，等待设备连接…` : `已添加设备 ${sn.slice(0, 14)}…`,
    )
    return true
  } catch (e) {
    pendingAdoptSns.value = new Set([...pendingAdoptSns.value].filter((s) => s !== sn))
    ElMessage.error(e?.message || e?.msg || '添加设备失败')
    return false
  } finally {
    adoptingNode.value = false
  }
}

/** 弹窗 / 附近列表 统一的「确认添加」入口 */
export const requestAdoptNode = async (node, runtime = null) => {
  const sn = String(node?.sn || '').trim()
  if (!sn) return false
  if (pendingAdoptSns.value.has(sn)) return true
  closeAdoptPopupUi()
  return confirmAdoptNode(node, runtime)
}

/** 弹窗「暂不添加」：不再自动弹窗，但保留在附近列表 */
export const skipAdoptPopup = (node) => {
  const sn = String(node?.sn || '').trim()
  if (!sn) return
  popupSkippedSns.value = new Set([...popupSkippedSns.value, sn])
  for (let i = adoptPopupQueue.length - 1; i >= 0; i -= 1) {
    if (adoptPopupQueue[i]?.sn === sn) adoptPopupQueue.splice(i, 1)
  }
  if (adoptCandidate.value?.sn === sn) {
    closeAdoptPopupUi()
  }
}

/** 附近列表「忽略」：从列表隐藏且不再弹窗 */
export const declineAdoptNode = (node) => {
  const sn = String(node?.sn || '').trim()
  if (!sn) return
  lanListIgnoredSns.value = new Set([...lanListIgnoredSns.value, sn])
  skipAdoptPopup(node)
}

const closeAdoptPopupUi = () => {
  clearAdoptTimers()
  adoptPopupVisible.value = false
  adoptCandidate.value = null
  adoptCountdown.value = 10
}

export const dismissAdoptPopup = async (confirmed = false, runtime = null) => {
  const node = adoptCandidate.value
  closeAdoptPopupUi()
  if (node?.sn) {
    if (confirmed) await requestAdoptNode(node, runtime)
    else skipAdoptPopup(node)
  }
  processAdoptPopupQueue()
}

const openAdoptPopup = (node) => {
  if (!node?.sn || isNodeAlreadyRegistered(node)) return
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
    if (!next?.sn || isNodeAlreadyRegistered(next)) continue
    openAdoptPopup(next)
    return
  }
}

const enqueueAdoptPopup = (node) => {
  const sn = String(node?.sn || '').trim()
  if (!sn || isNodeAlreadyRegistered(node)) return
  if (popupSkippedSns.value.has(sn) || pendingAdoptSns.value.has(sn)) return
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
  pendingAdoptSns.value = new Set(
    [...pendingAdoptSns.value].filter((sn) => !drop.has(sn)),
  )
  serverDevices.value = serverDevices.value.filter(
    (d) => !drop.has(d.sn) && !drop.has(displayDeviceSn(d)),
  )
  discoveredLanNodes.value = discoveredLanNodes.value.filter((n) => !drop.has(n.sn))
  popupSkippedSns.value = new Set(
    [...popupSkippedSns.value].filter((sn) => !drop.has(sn)),
  )
  lanListIgnoredSns.value = new Set(
    [...lanListIgnoredSns.value].filter((sn) => !drop.has(sn)),
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

const syncPendingAdopts = () => {
  pendingAdoptSns.value = new Set(
    [...pendingAdoptSns.value].filter((sn) => {
      const dev = serverDevices.value.find((d) => d.sn === sn)
      return !dev
    }),
  )
}

const handleWsMessage = (res) => {
  if (!res) return
  const action = res.action || res.type
  const data = res.data || {}
  if (action === 'get_device_list' || action === 'device_list_update') {
    applyServerDeviceList(action === 'device_list_update' ? (data.devices || data) : data)
    syncPendingAdopts()
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
