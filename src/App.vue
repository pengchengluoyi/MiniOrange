<template>
  <!-- 🔥 全局更新弹窗 -->
  <UpdatePrompt />
  <!-- 🔥 全局通用消息弹窗 -->
  <GlobalAlert />

  <!-- 1. 启动等待层 -->
  <div v-if="!isServerReady" class="startup-screen">
    <div class="startup-content">
      <div class="logo">MiniOrange</div>
      
      <!-- 动画加载圈 -->
      <div class="spinner">
        <div class="double-bounce1"></div>
        <div class="double-bounce2"></div>
      </div>

      <div class="status-text">
        <h2>{{ statusTitle }}</h2>
        <p>{{ statusDesc }}</p>
      </div>

      <!-- 如果等待太久，显示重试按钮 -->
      <button v-if="showRetryBtn" class="retry-btn" @click="retryConnection">
        连接超时，点击手动重试
      </button>
    </div>
  </div>

  <!-- 2. 应用主界面 -->
  <router-view v-else />
</template>

<script setup>
import { ref, onMounted } from 'vue'
import UpdatePrompt from './components/UpdatePrompt.vue'
import GlobalAlert from './components/GlobalAlert.vue'

const isServerReady = ref(false)
const showRetryBtn = ref(false)
const statusTitle = ref('正在启动引擎...')
const statusDesc = ref('正在唤醒 Python 服务端，请稍候...')
let retryCount = 0
const MAX_RETRIES = 30 // 30次 * 500ms = 15秒超时

// 检查服务端健康状态
const checkHealth = async () => {
  try {
    // 这里使用 fetch 而不是 axios，避免被拦截器拦截导致报错弹窗
    // 假设你的健康检查接口是 http://127.0.0.1:8000/
    const response = await fetch('http://127.0.0.1:8000/', { 
      method: 'GET',
      // 设置较短的超时，避免 fetch 自身卡住太久
      signal: AbortSignal.timeout(2000) 
    })

    if (response.ok) {
      // ✅ 连接成功！
      finishLoading()
    } else {
      throw new Error('Status not ok')
    }
  } catch (e) {
    handleError()
  }
}

const handleError = () => {
  retryCount++
  if (retryCount < MAX_RETRIES) {
    statusDesc.value = `服务正在初始化 (${retryCount}/${MAX_RETRIES})...`
    // 500ms 后重试
    setTimeout(checkHealth, 500)
  } else {
    statusTitle.value = '启动似乎遇到了困难'
    statusDesc.value = '服务端响应超时，请检查日志或手动重试。'
    showRetryBtn.value = true
  }
}

const finishLoading = () => {
  statusTitle.value = '准备就绪！'
  statusDesc.value = '即将进入系统...'
  // 给一个微小的延迟让用户看到“准备就绪”
  setTimeout(() => {
    isServerReady.value = true
  }, 500)
}

const retryConnection = () => {
  retryCount = 0
  showRetryBtn.value = false
  statusTitle.value = '正在重新连接...'
  checkHealth()
}

onMounted(() => {
  checkHealth()
})
</script>

<style scoped>
.startup-screen {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background-color: #f8fafc;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
}

.startup-content {
  text-align: center;
  padding: 40px;
  background: white;
  border-radius: 16px;
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
  width: 320px;
}

.logo {
  font-size: 24px;
  font-weight: bold;
  color: #4f46e5;
  margin-bottom: 30px;
}

.status-text h2 {
  font-size: 18px;
  color: #1e293b;
  margin: 20px 0 8px;
}

.status-text p {
  font-size: 13px;
  color: #64748b;
  margin: 0;
}

.retry-btn {
  margin-top: 24px;
  padding: 8px 16px;
  background-color: white;
  border: 1px solid #cbd5e1;
  color: #475569;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s;
}

.retry-btn:hover {
  border-color: #4f46e5;
  color: #4f46e5;
  background-color: #eef2ff;
}

/* 漂亮的加载动画 (Pulse) */
.spinner {
  width: 40px;
  height: 40px;
  position: relative;
  margin: 0 auto;
}

.double-bounce1, .double-bounce2 {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background-color: #4f46e5;
  opacity: 0.6;
  position: absolute;
  top: 0;
  left: 0;
  animation: sk-bounce 2.0s infinite ease-in-out;
}

.double-bounce2 {
  animation-delay: -1.0s;
}

@keyframes sk-bounce {
  0%, 100% { transform: scale(0.0) }
  50% { transform: scale(1.0) }
}
</style>