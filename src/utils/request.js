// src/utils/request.js
import axios from 'axios'
import { getBaseUrl } from '@/utils/config'

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
    // 如果已经确定了可用地址，直接使用
    if (determinedBaseUrl) {
      config.baseURL = determinedBaseUrl
      return config
    }

    // 如果没有配置环境变量，且还没探测过，则进行探测
    if (!import.meta.env.VITE_API_URL) {
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

          // 自动探测当前域名 (适配 miniorange-xxx.local 这种 mDNS 访问场景)
          const hostname = window.location.hostname
          if (hostname && hostname !== 'localhost' && hostname !== '127.0.0.1') {
            candidates.push(`https://${hostname}:10104`)
            candidates.push(`http://${hostname}:10104`)
          }

          for (const url of candidates) {
            console.log(`[API] Probing ${url}...`)
            if (await checkUrl(url)) {
                console.log(`[API] Found active server: ${url}`)
                return url
            }
          }
          console.warn('[API] No active server found, falling back to default.')
          return getBaseUrl() // 兜底
        })()
      }
      determinedBaseUrl = await checkPromise
      config.baseURL = determinedBaseUrl
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
    console.error('请求错误:', error) // for debug
    return Promise.reject(error)
  }
)

export const setGlobalBaseUrl = (url) => {
  determinedBaseUrl = url
}

export default service