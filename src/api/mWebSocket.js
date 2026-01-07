import {ElMessage} from 'element-plus'
import { getWsUrl } from '@/utils/config'

let ws = null
let isConnected = false
const pendingRequests = new Map()
let reconnectTimer = null
const messageListeners = new Set() // 🔥 Listeners for push messages
let isInitializing = false

const checkUrl = async (url) => {
    try {
        const controller = new AbortController()
        const id = setTimeout(() => controller.abort(), 800)
        const httpUrl = url.replace('ws://', 'http://').replace('wss://', 'https://').replace('/ws', '/docs')
        await fetch(httpUrl, { method: 'HEAD', mode: 'no-cors', signal: controller.signal })
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
        if (!import.meta.env.VITE_WS_URL && url.includes('127.0.0.1') && !await checkUrl(url)) {
             const remote = url.replace('127.0.0.1', 'miniorange.local')
             if (await checkUrl(remote)) url = remote
        }
        
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
    } catch (e) {
        console.error('[WS] Init failed', e)
    } finally {
        isInitializing = false
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

            pendingRequests.set(req_id, {resolve, reject, timer})

            // 🔥 适配服务端协议：data 字段直接作为参数
            // 如果 data 是字符串（如 get_file 的 path），则包装成对象
            let payloadData = data
            if (typeof data !== 'object' || data === null) {
                payloadData = {value: data}
            }

            ws.send(JSON.stringify({
                action,
                req_id,
                data: payloadData
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
    // 🔥 修复：get_file 动作，服务端期望 data 中包含 path
    return sendWsRequest('get_file', {name: path})
}

export const wsWorkflowRun = (workflow_id, sn) => {
    return sendWsRequest('run_workflow', {flow_id: workflow_id, sn: sn})
}

export const addMessageListener = (fn) => messageListeners.add(fn)
export const removeMessageListener = (fn) => messageListeners.delete(fn)

export default {
    initWebSocket,
    sendWsRequest,
    wsUploadFile,
    wsGetFile,
    wsWorkflowRun,
    addMessageListener,
    removeMessageListener
}