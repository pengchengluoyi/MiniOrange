// src/utils/request.js
import axios from 'axios'
import { getBaseUrl } from '@/utils/config'

let determinedBaseUrl = null
let checkPromise = null

const checkUrl = async (url) => {
  try {
    const controller = new AbortController()
    const id = setTimeout(() => controller.abort(), 800)
    await fetch(`${url}/docs`, { method: 'HEAD', mode: 'no-cors', signal: controller.signal })
    clearTimeout(id)
    return true
  } catch {
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
          const candidates = ['http://127.0.0.1:10104', 'http://miniorange.local:10104']
          for (const url of candidates) {
            if (await checkUrl(url)) return url
          }
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

export default service