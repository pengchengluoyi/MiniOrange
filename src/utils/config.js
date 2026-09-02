// 全局配置文件，统一管理 IP 和端口

const DEFAULT_HOST = '127.0.0.1'
const DEFAULT_PORT = 10104
const REMOTE_HOST = 'miniorange.local'
const WEB_DEV_PORTS = new Set(['5173', '4173'])

export const isElectronRuntime = () => typeof window !== 'undefined' && !!window.electronAPI

export const usesWebProxy = () => {
  if (typeof window === 'undefined' || isElectronRuntime()) return false
  return WEB_DEV_PORTS.has(String(window.location.port || ''))
}

const probe = async (host, timeoutMs = 500) => {
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
    const response = await fetch(`http://${host}:${DEFAULT_PORT}/sys/server_info`, {
      method: 'GET',
      signal: controller.signal,
    })
    clearTimeout(timeoutId)
    if (response.ok || response.status === 404) return host
  } catch {
    // try next candidate
  }
  return null
}

export const getServiceHost = async () => {
  if (usesWebProxy()) return window.location.hostname || DEFAULT_HOST

  const local = await probe(DEFAULT_HOST, 400)
  if (local) {
    console.log(`[Config] Using local server ${local}.`)
    return local
  }

  const remote = await probe(REMOTE_HOST, 800)
  if (remote) {
    console.log(`[Config] Detected ${remote} is available.`)
    return remote
  }

  console.log(`[Config] Fallback to ${DEFAULT_HOST}.`)
  return DEFAULT_HOST
}

export const getBaseUrl = () => {
  if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL
  if (usesWebProxy()) return ''
  const cachedHost = localStorage.getItem('service_host') || DEFAULT_HOST
  return `http://${cachedHost}:${DEFAULT_PORT}`
}

export const getWsUrl = () => {
  if (usesWebProxy()) {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${proto}//${window.location.host}/ws`
  }
  const cachedHost = localStorage.getItem('service_host') || DEFAULT_HOST
  return `ws://${cachedHost}:${DEFAULT_PORT}/ws`
}

export const getPairedGatewayId = () => localStorage.getItem('paired_gateway_id') || ''
export const getPairedGatewayDisplay = () => localStorage.getItem('paired_gateway_display') || ''

export const savePairedGateway = ({ host, gatewayId, displayName }) => {
  if (host) localStorage.setItem('service_host', host)
  if (gatewayId) localStorage.setItem('paired_gateway_id', gatewayId)
  if (displayName) localStorage.setItem('paired_gateway_display', displayName)
}

export const clearPairedGateway = () => {
  localStorage.removeItem('paired_gateway_id')
  localStorage.removeItem('paired_gateway_display')
}

export const initServiceConfig = async () => {
  if (usesWebProxy()) return window.location.host
  const host = await getServiceHost()
  localStorage.setItem('service_host', host)
  return host
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** True only when the API actually answers. Unlike getServiceHost, this does not fall back to a dead host. */
export const pingServer = async (timeoutMs = 800) => {
  if (usesWebProxy()) {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
      const response = await fetch('/sys/server_info', {
        method: 'GET',
        signal: controller.signal,
      })
      clearTimeout(timeoutId)
      return response.ok || response.status === 404
    } catch {
      return false
    }
  }

  const cached = localStorage.getItem('service_host')
  const candidates = [...new Set([cached, DEFAULT_HOST, REMOTE_HOST].filter(Boolean))]
  for (const host of candidates) {
    const found = await probe(host, timeoutMs)
    if (found) {
      localStorage.setItem('service_host', found)
      return true
    }
  }
  return false
}

export const waitForServer = async ({ timeoutMs = 0, intervalMs = 600, isCancelled } = {}) => {
  const started = Date.now()
  while (!isCancelled?.()) {
    if (timeoutMs > 0 && Date.now() - started >= timeoutMs) return false
    if (await pingServer(800)) return true
    await sleep(intervalMs)
  }
  return false
}

export const SERVICE_PORT = DEFAULT_PORT
export const LOCAL_HOST = DEFAULT_HOST
export const MDNS_HOST = REMOTE_HOST
