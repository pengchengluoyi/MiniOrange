/** 新建执行：只保留在线且有可用通道的设备 */

const ONLINE = new Set(['connected', 'online', 'available'])

function isChannelOnline(state) {
  return ONLINE.has(String(state || '').toLowerCase())
}

/**
 * @param {object} device listCaseRunnerDevices item
 * @returns {{ ok: boolean, channel: string, label: string }}
 */
export function deviceExecChannel(device) {
  const ch = device?.channels || {}
  const type = String(device?.device_type || '').toLowerCase()
  const status = String(device?.status || '').toLowerCase()

  if (isChannelOnline(ch.adb_state)) {
    return { ok: true, channel: 'adb', label: 'adb' }
  }
  if (isChannelOnline(ch.remote_state)) {
    return { ok: true, channel: 'clawnode', label: 'clawnode' }
  }
  // iOS：无 adb；在线且类型像 ios 时保留
  if (
    status === 'online' &&
    (type.includes('ios') || type.includes('iphone') || type.includes('ipad'))
  ) {
    return { ok: true, channel: 'ios', label: 'ios' }
  }
  return { ok: false, channel: '', label: '' }
}

export function filterExecutableDevices(devices = []) {
  return (devices || [])
    .map((d) => {
      const meta = deviceExecChannel(d)
      return meta.ok ? { ...d, execChannel: meta.label } : null
    })
    .filter(Boolean)
}

export function formatDeviceOption(device) {
  const model = device.model || device.sn || 'device'
  const ch = device.execChannel || deviceExecChannel(device).label || '?'
  return `${model} · ${ch}`
}
