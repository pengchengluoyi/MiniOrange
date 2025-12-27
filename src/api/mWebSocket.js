import { ElMessage } from 'element-plus'

// Default to local Python service port 10104
const WS_URL = import.meta.env.VITE_WS_URL || 'ws://127.0.0.1:10104/ws'

let ws = null
let isConnected = false
const pendingRequests = new Map()
let reconnectTimer = null
const messageListeners = new Set() // 🔥 Listeners for push messages

export const initWebSocket = () => {
  if (ws) return

  ws = new WebSocket(WS_URL)

  ws.onopen = () => {
    console.log('[WS] Connected')
    isConnected = true
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
  }

  ws.onclose = () => {
    console.log('[WS] Disconnected')
    isConnected = false
    ws = null
    // Auto reconnect
    reconnectTimer = setTimeout(() => {
      initWebSocket()
    }, 3000)
  }

  ws.onerror = (e) => {
    console.error('[WS] Error', e)
    isConnected = false
  }

  ws.onmessage = (e) => {
    try {
      const res = JSON.parse(e.data)
      
      // 🔥 Notify global listeners (e.g. for Scrcpy DOM updates)
      messageListeners.forEach(fn => fn(res))

      // Handle request-response by req_id
      if (res.req_id && pendingRequests.has(res.req_id)) {
        const { resolve, reject, timer } = pendingRequests.get(res.req_id)
        clearTimeout(timer)
        pendingRequests.delete(res.req_id)

        if (res.code === 200) {
          resolve(res)
        } else {
          reject(res)
        }
      }
    } catch (err) {
      console.error('[WS] Message parse error', err)
    }
  }
}

export const sendWsRequest = (action, data = {}) => {
  return new Promise((resolve, reject) => {
    // 🔥 Helper to execute send
    const executeSend = () => {
      const req_id = Date.now().toString(36) + Math.random().toString(36).substr(2)
      const timer = setTimeout(() => {
        if (pendingRequests.has(req_id)) {
          pendingRequests.delete(req_id)
          reject(new Error('Request timeout'))
        }
      }, 30000)

      pendingRequests.set(req_id, { resolve, reject, timer })

      ws.send(JSON.stringify({
        action,
        req_id,
        data
      }))
    }

    // 🔥 Check connection and wait if necessary
    if (ws && ws.readyState === WebSocket.OPEN) {
      executeSend()
    } else {
      // Try to init if not existing or closed
      if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
        initWebSocket()
      }
      
      // Wait for connection (max 3s)
      let checks = 0
      const interval = setInterval(() => {
        checks++
        if (ws && ws.readyState === WebSocket.OPEN) {
          clearInterval(interval)
          executeSend()
        } else if (checks > 30) {
          clearInterval(interval)
          reject(new Error('WebSocket not connected'))
        }
      }, 100)
    }
  })
}

export const wsUploadFile = (filename, content) => {
  return sendWsRequest('upload', { name: filename, content })
}

export const wsGetFile = (path) => {
  return sendWsRequest('get_file', { name: path })
}

export const addMessageListener = (fn) => messageListeners.add(fn)
export const removeMessageListener = (fn) => messageListeners.delete(fn)

export default {
  initWebSocket,
  sendWsRequest,
  wsUploadFile,
  wsGetFile,
  addMessageListener,
  removeMessageListener
}