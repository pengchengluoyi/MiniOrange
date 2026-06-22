function normalizeModel(model) {
  if (!model) return ''
  const text = String(model).trim().toUpperCase()
  const match = text.match(/[A-Z0-9]{5,}/)
  return match ? match[0] : text
}

function isClawDirect(device) {
  const sn = String(device?.sn || '')
  return sn.startsWith('claw-') || String(device?.type || '').toLowerCase() === 'android_direct'
}

function isMobileDevice(device) {
  const type = String(device?.type || '').toLowerCase()
  return ['android', 'ios', 'mobile', 'android_direct'].includes(type)
}

/** 合并 USB hub 与 ClawNode WS 重复条目（客户端兜底，与服务端 dedupe 一致） */
export function dedupeDevicesForUi(list) {
  const devices = Array.isArray(list) ? list : []
  const clawsByModel = new Map()
  const clawsByIp = new Map()

  for (const device of devices) {
    if (!isClawDirect(device)) continue
    const modelKey = normalizeModel(device.model)
    if (modelKey) clawsByModel.set(modelKey, device)
    const ip = String(device.ip || '').trim()
    if (ip && ip.toUpperCase() !== 'USB') clawsByIp.set(ip, device)
  }

  const skipSns = new Set()
  for (const device of devices) {
    if (String(device.type || '').toLowerCase() !== 'android' || device.role !== 'hub') continue
    const modelKey = normalizeModel(device.model)
    const ip = String(device.ip || '').trim()
    if (modelKey && clawsByModel.has(modelKey)) skipSns.add(device.sn)
    else if (ip && clawsByIp.has(ip)) skipSns.add(device.sn)
  }

  const filtered = devices.filter((device) => !skipSns.has(device.sn))
  const byKey = new Map()
  for (const device of filtered) {
    const key = String(device.sn || '').startsWith('claw-')
      ? device.sn
      : (device.claw_sn || device.node_sn || device.sn || '')
    if (!key) {
      byKey.set(`__${Math.random()}`, device)
      continue
    }
    const prev = byKey.get(key)
    if (!prev) {
      byKey.set(key, device)
      continue
    }
    const score = (d) => {
      let s = 0
      if (d.status === 'online') s += 4
      if (String(d.sn || '').startsWith('claw-')) s += 2
      if (d.app_version) s += 1
      return s
    }
    byKey.set(key, score(device) >= score(prev) ? device : prev)
  }
  return [...byKey.values()]
}

function parseLastOnline(value) {
  if (!value) return 0
  const ts = new Date(String(value).replace(' ', 'T')).getTime()
  return Number.isNaN(ts) ? 0 : ts
}

/** 在线设备置顶，同组内按最后在线时间倒序 */
export function sortDevicesForDisplay(list) {
  return [...list].sort((a, b) => {
    const aOn = a.status === 'online' ? 1 : 0
    const bOn = b.status === 'online' ? 1 : 0
    if (aOn !== bOn) return bOn - aOn
    return parseLastOnline(b.last_online) - parseLastOnline(a.last_online)
  })
}

/** 对话/执行场景可选设备：在线移动设备，已去重 */
export function selectableExecutionDevices(list) {
  const deduped = dedupeDevicesForUi(list)
  return deduped.filter((device) => {
    if (device.status !== 'online') return false
    if (!isMobileDevice(device)) return false
    if (device.type === 'pc') return false
    if (device.role === 'node' && !isClawDirect(device)) return false
    return true
  })
}

export function pickDefaultDeviceSn(devices) {
  const direct = devices.find((d) => isClawDirect(d))
  if (direct) return direct.sn
  const android = devices.find((d) => String(d.type || '').toLowerCase().includes('android'))
  return (android || devices[0])?.sn || ''
}
