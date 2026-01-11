const WS_URL = 'ws://127.0.0.1:10104/ws'
let ws = null
let connectPromise = null
const pendingRequests = new Map()

function connect() {
  if (ws && ws.readyState === WebSocket.OPEN) return Promise.resolve(ws)
  if (connectPromise) return connectPromise
  
  connectPromise = new Promise((resolve, reject) => {
    const socket = new WebSocket(WS_URL)
    
    socket.onopen = () => {
      ws = socket
      connectPromise = null
      resolve(ws)
    }
    
    socket.onmessage = (event) => {
      try {
        const response = JSON.parse(event.data)
        
        // 🔥 容错处理：如果后端返回的 req_id 为空 (例如 None)，且当前只有一个挂起的请求，则默认匹配该请求
        let targetReqId = response.req_id
        // 宽松模式：只要有挂起的请求，且响应没有 ID，就认领给最早的一个请求 (FIFO)
        if (!targetReqId && pendingRequests.size > 0) {
          targetReqId = pendingRequests.keys().next().value
          console.warn('[WS] 后端未返回 req_id (Backend Bug)，前端自动匹配到挂起的请求:', targetReqId)
        }

        // 根据 req_id 匹配并回调 Promise
        if (targetReqId && pendingRequests.has(targetReqId)) {
          const { resolve: reqResolve, reject: reqReject, timeout } = pendingRequests.get(targetReqId)
          clearTimeout(timeout) // 🔥 收到响应，清除超时定时器
          if (response.code === 200) {
            reqResolve(response)
          } else {
            reqReject(new Error(response.msg || 'Unknown Error'))
          }
          pendingRequests.delete(targetReqId)
        }
      } catch (e) {
        console.error('[WS] Parse error:', e)
      }
    }
    
    socket.onerror = (e) => {
      connectPromise = null
      reject(e)
    }

    socket.onclose = () => {
      ws = null
      connectPromise = null
      // 🔥 连接断开时，拒绝所有挂起的请求，防止页面一直 loading
      for (const [key, { reject, timeout }] of pendingRequests) {
        clearTimeout(timeout)
        reject(new Error('WebSocket connection closed'))
      }
      pendingRequests.clear()
    }
  })
  return connectPromise
}

export function getTimelineList(params) {
  return connect().then(socket => {
    return new Promise((resolve, reject) => {
      const req_id = Date.now().toString() + Math.random().toString(36).substr(2, 9)
      
      // 🔥 设置 10 秒超时，防止后端不回消息导致前端死等
      const timeout = setTimeout(() => {
        if (pendingRequests.has(req_id)) {
          pendingRequests.delete(req_id)
          reject(new Error('Request timeout (10s)'))
        }
      }, 10000)

      pendingRequests.set(req_id, { resolve, reject, timeout })
      
      // 发送请求，action 对应后端的 handle_get_timeline_list
      // 注意：这里假设后端通过 action 字段分发路由
      try {
        socket.send(JSON.stringify({
          action: 'get_timeline_list', 
          req_id, // 保持外层 req_id 用于日志追踪
          data: { // 🔥 核心修复：将业务参数包裹在 data 对象中，适配后端分发逻辑
            req_id,
            ...params
          }
        }))
      } catch (e) {
        clearTimeout(timeout)
        pendingRequests.delete(req_id)
        reject(e)
      }
    })
  })
}

export function getTimelineDetail(runId) {
  if (runId === undefined || runId === null || runId === '') {
    return Promise.reject(new Error('runId is required'))
  }

  return connect().then(socket => {
    return new Promise((resolve, reject) => {
      const req_id = Date.now().toString() + Math.random().toString(36).substr(2, 9)
      
      const timeout = setTimeout(() => {
        if (pendingRequests.has(req_id)) {
          pendingRequests.delete(req_id)
          reject(new Error('Request timeout (10s)'))
        }
      }, 10000)

      pendingRequests.set(req_id, { resolve, reject, timeout })
      
      try {
        socket.send(JSON.stringify({
          action: 'get_timeline', 
          req_id, // 保持外层 req_id
          data: { // 🔥 核心修复：包裹在 data 对象中
            req_id,
            run_id: String(runId)
          }
        }))
      } catch (e) {
        clearTimeout(timeout)
        pendingRequests.delete(req_id)
        reject(e)
      }
    })
  })
}