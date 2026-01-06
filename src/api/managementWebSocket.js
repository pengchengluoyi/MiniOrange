import { ElMessage } from 'element-plus'

// 动态获取 WebSocket URL
const getWsUrl = () => {
  return 'ws://127.0.0.1:10104/ws'
}

const SERVER_URL = getWsUrl()

class ManagementWebSocket {
  constructor() {
    this.ws = null
    this.listeners = new Map() // 事件名 -> 回调函数集合
    this.isConnected = false
    this.reconnectAttempts = 0
    this.reconnectInterval = 5000 // 5秒重连
    this.messageQueue = []
  }

  connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return
    }

    this.ws = new WebSocket(SERVER_URL)

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
        const eventType = message.type
        if (this.listeners.has(eventType)) {
          this.listeners.get(eventType).forEach(callback => callback(message.data, message.msg))
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