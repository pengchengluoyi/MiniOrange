// 全局配置文件，统一管理 IP 和端口

// 默认配置
const DEFAULT_HOST = '127.0.0.1'
const DEFAULT_PORT = 10104
const REMOTE_HOST = 'miniorange.local'

// 动态检测当前使用的 Host
export const getServiceHost = async () => {
  const probe = async (host, timeoutMs = 500) => {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
      const response = await fetch(`http://${host}:${DEFAULT_PORT}/`, {
        method: 'HEAD',
        signal: controller.signal,
      })
      clearTimeout(timeoutId)
      if (response.ok || response.status === 404) return host
    } catch {
      // try next candidate
    }
    return null
  }

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

// 获取 HTTP Base URL
export const getBaseUrl = () => {
  // 这里我们使用一个简单的策略：
  // 如果当前页面是通过 miniorange.local 访问的，就用 miniorange.local
  // 否则默认用 127.0.0.1，或者通过异步检测（但异步检测不适合同步的 getBaseUrl 调用）
  
  // 更稳妥的方式是：在 App 启动时做一次检测，存入 localStorage 或全局状态
  // 这里为了兼容现有代码，我们先尝试从 localStorage 读取，如果没有则默认 127.0.0.1
  const cachedHost = localStorage.getItem('service_host') || DEFAULT_HOST
  return `http://${cachedHost}:${DEFAULT_PORT}`
}

// 获取 WebSocket URL
export const getWsUrl = () => {
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

// 初始化服务地址（在 main.js 或 App.vue 中调用）
export const initServiceConfig = async () => {
  const host = await getServiceHost()
  localStorage.setItem('service_host', host)
  return host
}

export const SERVICE_PORT = DEFAULT_PORT
export const LOCAL_HOST = DEFAULT_HOST
export const MDNS_HOST = REMOTE_HOST
