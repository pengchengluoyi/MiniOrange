/** 设备 SN 展示：ClawNode 优先显示 claw-* */
export function displayDeviceSn(device) {
  const sn = String(device?.sn || '').trim()
  if (sn.startsWith('claw-')) return sn
  const alt = String(device?.claw_sn || device?.node_sn || '').trim()
  if (alt.startsWith('claw-')) return alt
  return sn || '—'
}

export function isClawDevice(device) {
  const sn = displayDeviceSn(device)
  return sn.startsWith('claw-')
}

/** 设备类型展示：android_direct 统一为 android */
export function formatDeviceType(device) {
  const type = String(device?.type || '').toLowerCase()
  if (type === 'android_direct') return 'android'
  return type || '—'
}
