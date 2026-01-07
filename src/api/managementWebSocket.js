import { ElMessage } from 'element-plus'
import { getWsUrl } from '@/utils/config'

// 🔥 辅助函数：探测 URL 可用性
const checkUrl = async (url) => {
  try {
    const controller = new AbortController()
    const id = setTimeout(() => controller.abort(), 3000)
    let httpUrl = url.replace('ws://', 'http://').replace('wss://', 'https://')
    httpUrl = httpUrl.includes('/ws') ? httpUrl.replace('/ws', '/docs') : (httpUrl.endsWith('/') ? `${httpUrl}docs` : `${httpUrl}/docs`)
    await fetch(httpUrl, { method: 'GET', mode: 'no-cors', signal: controller.signal })
    clearTimeout(id)
    return true
  } catch {
    return false
  }
}

class ManagementWebSocket {
  constructor() {
    this.ws = null
    this.listeners = new Map() // 事件名 -> 回调函数集合
    this.isConnected = false
    this.reconnectAttempts = 0
    this.reconnectInterval = 5000 // 5秒重连
    this.messageQueue = []
    this.targetUrl = null // 🔥 缓存最终确定的 URL
  }

  // 🔥 允许外部设置 URL (例如 App.vue 探测完成后)
  setUrl(url) {
    this.targetUrl = url
  }

  async connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return
    }

    // 🔥 如果没有设置 URL，则尝试自动探测
    if (!this.targetUrl) {
      let url = getWsUrl()
      if (!import.meta.env.VITE_WS_URL && url.includes('127.0.0.1')) {
        if (!await checkUrl(url)) {
          console.log('[Mgmt-WS] Local 127.0.0.1 unreachable, probing miniorange.local...')
          const remote = url.replace('127.0.0.1', 'miniorange.local')
          if (await checkUrl(remote)) {
            url = remote
          }
        }
      }
      this.targetUrl = url
    }

    console.log('[Mgmt-WS] Connecting to:', this.targetUrl)
    this.ws = new WebSocket(this.targetUrl)

    this.ws.onopen = () => {
      console.log('[Mgmt-WS] Connected to server.')
      this.isConnected = true
      this.reconnectAttempts = 0
      // 连接成功后，发送队列中的消息并请求初始数据
      this.messageQueue.forEach(msg => this.ws.send(JSON.stringify(msg)))
      this.messageQueue = []
      this.sendMessage('get_device_list')
    }

    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data)
        // 🔥 适配服务端返回格式：action 作为事件类型
        const eventType = message.action
        if (this.listeners.has(eventType)) {
          this.listeners.get(eventType).forEach(callback => callback(message.data || message, message.msg))
        }
      } catch (e) {
        console.error('[Mgmt-WS] Error parsing message:', e)
      }
    }

    this.ws.onclose = () => {
      this.isConnected = false
      this.ws = null
      setTimeout(() => {
        this.reconnectAttempts++
        this.connect()
      }, this.reconnectInterval)
    }

    this.ws.onerror = (error) => {
      console.error('[Mgmt-WS] WebSocket error:', error)
    }
  }

  sendMessage(action, data = {}) {
    const payload = { action, data }
    if (!this.isConnected || !this.ws) {
      this.messageQueue.push(payload)
      return
    }
    this.ws.send(JSON.stringify(payload))
  }

  addListener(eventType, callback) {
    if (!this.listeners.has(eventType)) this.listeners.set(eventType, new Set())
    this.listeners.get(eventType).add(callback)
  }

  removeListener(eventType, callback) {
    if (this.listeners.has(eventType)) this.listeners.get(eventType).delete(callback)
  }
}

const managementWsService = new ManagementWebSocket()
export default managementWsService