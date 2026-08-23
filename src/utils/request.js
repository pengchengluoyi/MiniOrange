// src/utils/request.js
import axios from 'axios'
import { getBaseUrl, usesWebProxy } from '@/utils/config'
import { disconnectWebSocket } from '@/api/mWebSocket'

let determinedBaseUrl = null
let checkPromise = null

const checkUrl = async (url) => {
  try {
    const controller = new AbortController()
    const id = setTimeout(() => controller.abort(), 1200)
    const res = await fetch(`${url}/sys/server_info`, { method: 'GET', mode: 'cors', signal: controller.signal })
    clearTimeout(id)
    return res.ok
  } catch (e) {
    console.warn(`[API] Probe failed for ${url}:`, e)
    return false
  }
}

// 创建 axios 实例
const service = axios.create({
  // 动态获取 Base URL
  baseURL: getBaseUrl(),
  timeout: 60000 // 请求超时时间调整为 60s
})

// --- 请求拦截器 ---
service.interceptors.request.use(
  async config => {
    if (usesWebProxy()) {
      determinedBaseUrl = ''
    } else if (!determinedBaseUrl && !import.meta.env.VITE_API_URL) {
      if (!checkPromise) {
        checkPromise = (async () => {
          const candidates = [
            'http://127.0.0.1:10104',
            'http://localhost:10104',
            'https://127.0.0.1:10104',
            'https://localhost:10104',
            'http://miniorange.local:10104',
            'https://miniorange.local:10104',
          ]

          const hostname = window.location.hostname
          if (hostname && hostname !== 'localhost' && hostname !== '127.0.0.1') {
            candidates.push(`https://${hostname}:10104`)
            candidates.push(`http://${hostname}:10104`)
          }

          for (const url of candidates) {
            if (await checkUrl(url)) return url
          }
          return getBaseUrl()
        })()
      }
      determinedBaseUrl = await checkPromise
    }
    if (determinedBaseUrl) config.baseURL = determinedBaseUrl
    const token = localStorage.getItem('token')
    if (token) {
      config.headers = config.headers || {}
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  error => {
    return Promise.reject(error)
  }
)

// --- 响应拦截器 ---
service.interceptors.response.use(
  response => {
    const res = response.data
    return res
  },
  error => {
    console.error('请求错误:', error)
    const status = error?.response?.status
    const url = String(error?.config?.url || '')
    const skipAuth = /\/auth\/(login|register|send-code|status)/.test(url)
    if (status === 401 && !skipAuth) {
      try {
        localStorage.removeItem('token')
        localStorage.removeItem('ws_token')
      } catch (_) { /* ignore */ }
      disconnectWebSocket()
      if (typeof window !== 'undefined' && !String(window.location.hash || '').includes('/login')) {
        window.location.hash = '#/login'
      }
    }
    return Promise.reject(error)
  }
)

export const setGlobalBaseUrl = (url) => {
  determinedBaseUrl = url
}

export default service