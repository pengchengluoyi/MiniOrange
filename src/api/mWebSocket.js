import { getWsUrl } from '@/utils/config'

let ws = null
let listeners = []
let pendingRequests = new Map()
let isConnected = false
let reconnectTimer = null
let currentToken = ''
let customBaseUrl = ''

export const setWsUrl = (url) => {
  customBaseUrl = url
}

export const initWebSocket = (token) => {
  if (token) {
    currentToken = token
    localStorage.setItem('ws_token', token)
  } else if (!currentToken) {
    currentToken = localStorage.getItem('ws_token') || ''
  }

  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return
  }

  const baseUrl = customBaseUrl || getWsUrl()
  // 🔥 关键修复：如果存在 Token，拼接到 URL 参数中
  const url = currentToken ? `${baseUrl}?token=${currentToken}` : baseUrl

  console.log('Connecting WS:', url)
  ws = new WebSocket(url)

  ws.onopen = () => {
    isConnected = true
    console.log('WebSocket Connected')
    if (reconnectTimer) {
      clearInterval(reconnectTimer)
      reconnectTimer = null
    }
  }

  ws.onmessage = (event) => {
    try {
      const res = JSON.parse(event.data)
      
      // Handle Request-Response
      if (res.req_id && pendingRequests.has(res.req_id)) {
        const { resolve, reject } = pendingRequests.get(res.req_id)
        if (res.code === 200) {
          resolve(res)
        } else {
          reject(res)
        }
        pendingRequests.delete(res.req_id)
      }

      // Broadcast to listeners
      listeners.forEach(listener => listener(res))

    } catch (e) {
      console.error('WS Message Error', e)
    }
  }

  ws.onclose = (e) => {
    isConnected = false
    console.log('WebSocket Closed', e.code, e.reason)
    if (!reconnectTimer) {
      reconnectTimer = setInterval(() => {
        initWebSocket()
      }, 3000)
    }
  }

  ws.onerror = (err) => {
    console.error('WebSocket Error', err)
    ws.close()
  }
}

export const addMessageListener = (callback) => {
  if (!listeners.includes(callback)) {
    listeners.push(callback)
  }
}

export const removeMessageListener = (callback) => {
  listeners = listeners.filter(l => l !== callback)
}

export const sendWsRequest = (action, data = {}) => {
  return new Promise((resolve, reject) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      reject(new Error('WebSocket not connected'))
      return
    }

    const req_id = Date.now().toString(36) + Math.random().toString(36).substr(2)
    
    const timer = setTimeout(() => {
      if (pendingRequests.has(req_id)) {
        pendingRequests.delete(req_id)
        reject(new Error('Request timeout'))
      }
    }, 10000)

    pendingRequests.set(req_id, { 
      resolve: (res) => { clearTimeout(timer); resolve(res) }, 
      reject: (err) => { clearTimeout(timer); reject(err) } 
    })

    ws.send(JSON.stringify({
      req_id,
      action,
      ...data
    }))
  })
}

export const wsGetFile = (path) => {
  return sendWsRequest('get_file', { "name": path })
}

export const wsUploadFile = (name, content) => {
  return sendWsRequest('upload', { name, content })
}

export const wsGetTimelineList = (params = {}) => {
  return sendWsRequest('get_timeline_list', params)
}

export const wsGetTimelineDetail = (id) => {
  return sendWsRequest('get_timeline_detail', { id })
}

export const getConnectedUrl = () => {
  return getWsUrl()
}

export default {
  setWsUrl,
  initWebSocket,
  addMessageListener,
  removeMessageListener,
  sendWsRequest,
  wsGetFile,
  wsUploadFile,
  wsGetTimelineList,
  wsGetTimelineDetail,
  getConnectedUrl
}