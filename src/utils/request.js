// src/utils/request.js
import axios from 'axios'

// 创建 axios 实例
const service = axios.create({
  // 从环境变量获取 Base URL，方便开发/生产切换
  // 如果是本地 Python 服务，这里通常是 http://127.0.0.1:8000
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000',
  timeout: 5000 // 请求超时时间
})

// --- 请求拦截器 ---
service.interceptors.request.use(
  config => {
    // 在发送请求之前做些什么
    // 例如：如果后续需要鉴权，可以在这里统一加 Token
    // config.headers['Authorization'] = 'Bearer ' + getToken()
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

    // 这里可以根据你 Python 后端的返回格式做统一判断
    // 假设后端返回格式为 { code: 200, data: {...}, msg: '' }
    // 如果你后端直接返回数据，则直接 return res

    return res
  },
  error => {
    console.error('请求错误:', error) // for debug

    // 可以在这里结合 ElementPlus 或 AntDesign 的 Message 组件提示错误
    // ElMessage.error(error.message || '服务异常')

    return Promise.reject(error)
  }
)

export default service