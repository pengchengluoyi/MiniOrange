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
  const type = String(device?.device_type || device?.type || '').toLowerCase()
  const status = String(device?.status || '').toLowerCase()
  const iosTransport = String(ch.ios_transport || '').toLowerCase()

  if (isChannelOnline(ch.ios_state) || (status === 'online' && (type.includes('ios') || type.includes('iphone') || type.includes('ipad')))) {
    const via = iosTransport === 'wifi' ? 'ios/wifi' : (iosTransport === 'usb' ? 'ios/usb' : 'ios')
    return { ok: true, channel: 'ios', label: via }
  }
  if (isChannelOnline(ch.adb_state)) {
    return { ok: true, channel: 'adb', label: 'adb' }
  }
  if (isChannelOnline(ch.remote_state)) {
    return { ok: true, channel: 'clawnode', label: 'clawnode' }
  }
  return { ok: false, channel: '', label: '' }
}

export function filterExecutableDevices(devices = []) {
  const rfc4122 = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  return (devices || [])
    .map((d) => {
      const sn = String(d.sn || '')
      if (rfc4122.test(sn) || rfc4122.test(sn.replace(/^ios-wifi-/i, ''))) return null
      const meta = deviceExecChannel(d)
      return meta.ok ? { ...d, execChannel: meta.label } : null
    })
    .filter(Boolean)
}

import { shortTaskId } from '@/utils/testingTasks'

const GENERIC_MODEL = /^(ios|iphone|ipad|ios device|device|apple)$/i

export function formatDeviceOption(device) {
  const sn = String(device.sn || '').trim()
  const rawModel = String(device.model || '').trim()
  const model = rawModel && !GENERIC_MODEL.test(rawModel) && rawModel !== sn ? rawModel : ''
  const ch = device.execChannel || deviceExecChannel(device).label || '?'
  const busy = device.busy_task_id ? ` · 占用 ${shortTaskId(device.busy_task_id)}` : ''
  const id = sn || 'unknown'
  if (model) return `${model} · ${id} · ${ch}${busy}`
  return `${id} · ${ch}${busy}`
}
