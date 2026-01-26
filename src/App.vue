<template>
  <!-- 🔥 全局更新弹窗 -->
  <UpdatePrompt />
  <!-- 🔥 全局通用消息弹窗 -->
  <GlobalAlert />
  
  <router-view />
</template>

<script setup>
import { onMounted } from 'vue'
import UpdatePrompt from './components/UpdatePrompt.vue'
import GlobalAlert from './components/GlobalAlert.vue'
import { initWebSocket } from '@/api/mWebSocket'

onMounted(() => {
  // 启动时立即连接 WebSocket
  // 不需要 Token，后端会自动处理：
  // 1. 如果是 Server 模式，允许匿名连接
  // 2. 如果是 Node 模式，后端会鉴权，如果本地有缓存 Token 会自动带上
  initWebSocket()
})
</script>

<style scoped>
</style>