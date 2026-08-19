/** 新建执行：只保留在线且有可用通道的设备 */

const ONLINE = new Set(['connected', 'online', 'available'])
const RFC4122 = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isChannelOnline(state) {
  return ONLINE.has(String(state || '').toLowerCase())
}

function iosTransportOf(device) {
  return String(device?.channels?.ios_transport || '').toLowerCase()
}

/**
 * @param {object} device listCaseRunnerDevices item
 * @returns {{ ok: boolean, channel: string, label: string }}
 */
export function deviceExecChannel(device) {
  const ch = device?.channels || {}
  const type = String(device?.device_type || device?.type || '').toLowerCase()
  const status = String(device?.status || '').toLowerCase()
  const iosTransport = iosTransportOf(device)

  if (isChannelOnline(ch.ios_state) || (status === 'online' && (type.includes('ios') || type.includes('iphone') || type.includes('ipad')))) {
    const via = iosTransport === 'wifi'
      ? 'ios/wifi'
      : iosTransport === 'usb'
        ? 'ios/usb'
        : iosTransport === 'simulator'
          ? 'ios/simulator'
          : 'ios'
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
  return (devices || [])
    .map((d) => {
      const sn = String(d.sn || '')
      const isSimulator = iosTransportOf(d) === 'simulator'
      // CoreDevice _remotepairing 也是 UUID，只放过 simctl 注册的模拟器
      if (RFC4122.test(sn.replace(/^ios-wifi-/i, '')) && !isSimulator) return null
      const meta = deviceExecChannel(d)
      return meta.ok ? { ...d, execChannel: meta.label } : null
    })
    .filter(Boolean)
}

import { shortTaskId } from '@/utils/testingTasks'

const GENERIC_MODEL = /^(ios|iphone|ipad|ios device|device|apple)$/i

function channelKindLabel(ch) {
  const s = String(ch || '').toLowerCase()
  if (s.includes('wifi')) return 'Wi‑Fi'
  if (s.includes('usb')) return 'USB'
  if (s.includes('simulator')) return '模拟器'
  if (s.includes('ios')) return 'iOS'
  if (s === 'adb') return 'Android'
  if (s.includes('claw')) return 'ClawNode'
  return s || '设备'
}

export function devicePrimaryName(device) {
  const sn = String(device?.sn || '').trim()
  const rawName = String(device?.name || device?.device_name || '').trim()
  if (rawName && rawName !== sn) return rawName
  const rawModel = String(device?.model || '').trim()
  if (rawModel && !GENERIC_MODEL.test(rawModel) && rawModel !== sn) return rawModel
  const iosName = String(device?.channels?.ios_name || '').trim()
  if (iosName && iosName !== sn) return iosName
  if (sn.startsWith('ios-wifi-')) {
    const tail = sn.slice('ios-wifi-'.length)
    if (tail && !/^[0-9a-f-]{20,}$/i.test(tail)) return tail
  }
  return shortTaskId(sn) || '未命名设备'
}

export function formatDeviceOption(device) {
  const ch = device.execChannel || deviceExecChannel(device).label || '?'
  const kind = channelKindLabel(ch)
  const name = devicePrimaryName(device)
  const busy = device.busy_task_id ? ` · 占用中 ${shortTaskId(device.busy_task_id)}` : ''
  return `${name} · ${kind}${busy}`
}

export function formatDeviceMeta(device) {
  const ch = device?.execChannel || deviceExecChannel(device).label || ''
  const sn = String(device?.sn || '').trim()
  return [ch, sn].filter(Boolean).join(' · ')
}
