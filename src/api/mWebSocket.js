import {ElMessage} from 'element-plus'
import { getWsUrl } from '@/utils/config'

let ws = null
let isConnected = false
const pendingRequests = new Map()
let reconnectTimer = null
const messageListeners = new Set() // 🔥 Listeners for push messages
let isInitializing = false
let currentConnectedUrl = '' // 🔥 保存实际连接成功的 URL

export const getConnectedUrl = () => currentConnectedUrl || getWsUrl()

const checkUrl = async (url, timeout = 3000) => {
    try {
        const controller = new AbortController()
        const id = setTimeout(() => controller.abort(), timeout) // 🔥 增加超时时间
        
        // 🔥 修复：构造探测 URL
        let httpUrl = url.replace('ws://', 'http://').replace('wss://', 'https://')
        // 确保探测的是 /docs 接口 (FastAPI 默认文档路径)，避免请求根路径 / 导致 404 或 405
        httpUrl = httpUrl.includes('/ws') ? httpUrl.replace('/ws', '/docs') : (httpUrl.endsWith('/') ? `${httpUrl}docs` : `${httpUrl}/docs`)

        await fetch(httpUrl, { method: 'GET', mode: 'no-cors', signal: controller.signal })
        clearTimeout(id)
        return true
    } catch {
        return false
    }
}

export const initWebSocket = async () => {
    if (ws || isInitializing) return
    isInitializing = true

    try {
        let url = getWsUrl()
        // 自动探测：如果默认是本地，尝试探测 miniorange.local
        // 🔥 增加 localhost 判断，并延长超时时间到 5s
        if (!import.meta.env.VITE_WS_URL && (url.includes('127.0.0.1') || url.includes('localhost')) && !await checkUrl(url)) {
             console.log('[WS] Local not reachable, probing miniorange.local...')
             const remote = url.replace(/127\.0\.0\.1|localhost/g, 'miniorange.local')
             if (await checkUrl(remote, 5000)) url = remote
        }
        
        currentConnectedUrl = url
        console.log('[WS] Connecting to:', url)
        ws = new WebSocket(url)

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

            // 🔥 Reject all pending requests on disconnect
            pendingRequests.forEach(({reject, timer}) => {
                clearTimeout(timer)
                reject(new Error('WebSocket disconnected'))
            })
            pendingRequests.clear()

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
                    const {resolve, reject, timer} = pendingRequests.get(res.req_id)
                    clearTimeout(timer)
                    pendingRequests.delete(res.req_id)

                    if (res.code === 200 || res.code === undefined) {
                        resolve(res)
                    } else {
                        reject(res)
                    }
                }
            } catch (err) {
                console.error('[WS] Message parse error', err)
            }
        }
    } catch (e) {
        console.error('[WS] Init failed', e)
    } finally {
        isInitializing = false
    }
}

export const sendWsRequest = (action, data = {}, rootLevel = false) => {
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

            pendingRequests.set(req_id, {resolve, reject, timer})

            // 🔥 适配服务端协议：data 字段直接作为参数
            // 如果 data 是字符串（如 get_file 的 path），则包装成对象
            let payloadData = data
            if (typeof data !== 'object' || data === null) {
                payloadData = {value: data}
            }

            const payload = {
                action,
                req_id
            }
            if (rootLevel) {
                Object.assign(payload, payloadData)
            } else {
                payload.data = payloadData
            }
            ws.send(JSON.stringify(payload))
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
                } else if (checks > 60) {
                    clearInterval(interval)
                    reject(new Error('WebSocket not connected'))
                }
            }, 100)
        }
    })
}

export const wsUploadFile = (filename, content) => {
    return sendWsRequest('upload', {name: filename, content: content})
}

export const wsGetFile = (path) => {
    // 🔥 修复：get_file 动作，服务端期望 data 中包含 name
    return sendWsRequest('get_file', {name: path})
}

export const wsWorkflowRun = (workflow_id, sn) => {
    return sendWsRequest('run_workflow', {flow_id: workflow_id, sn: sn})
}

export const wsGetTimelineList = (params) => {
    return sendWsRequest('get_timeline_list', params)
}

export const wsGetTimelineDetail = (runId) => {
    return sendWsRequest('get_timeline', { run_id: String(runId) })
}

export const addMessageListener = (fn) => messageListeners.add(fn)
export const removeMessageListener = (fn) => messageListeners.delete(fn)

export const send = (data) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(data))
    } else {
        console.warn('[WS] Not connected, cannot send message')
    }
}

export default {
    initWebSocket,
    sendWsRequest,
    wsUploadFile,
    wsGetFile,
    wsWorkflowRun,
    wsGetTimelineList,
    wsGetTimelineDetail,
    addMessageListener,
    removeMessageListener,
    send,
    getConnectedUrl
}