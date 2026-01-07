// 全局配置文件，统一管理 IP 和端口

// 默认配置
const DEFAULT_HOST = '127.0.0.1'
const DEFAULT_PORT = 10104
const REMOTE_HOST = 'miniorange.local'

// 动态检测当前使用的 Host
export const getServiceHost = async () => {
  // 优先检查 miniorange.local 是否可用
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 1000)
    
    // 尝试请求一个轻量级接口或根路径
    const response = await fetch(`http://${REMOTE_HOST}:${DEFAULT_PORT}/`, { 
      method: 'HEAD',
      signal: controller.signal 
    })
    
    clearTimeout(timeoutId)
    if (response.ok || response.status === 404) { // 只要能连通即可
      console.log(`[Config] Detected ${REMOTE_HOST} is available.`)
      return REMOTE_HOST
    }
  } catch (e) {
    // 忽略错误，降级到 localhost
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

// 初始化服务地址（在 main.js 或 App.vue 中调用）
export const initServiceConfig = async () => {
  const host = await getServiceHost()
  localStorage.setItem('service_host', host)
  return host
}

export const SERVICE_PORT = DEFAULT_PORT
export const LOCAL_HOST = DEFAULT_HOST
export const MDNS_HOST = REMOTE_HOST
