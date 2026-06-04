<template>
  <div class="app-root">
    <!-- 🔥 Global TitleBar -->
    <TitleBar />
    
    <div class="content-area">
      <router-view />
    </div>

    <!-- 对话流页使用全屏界面，隐藏底部浮层 -->
    <CopilotWidget v-if="!isDialogueRoute" />
    
    <!-- Global Overlays -->
    <CommandPalette ref="commandPaletteRef" />
    <UpdatePrompt />
    <GlobalAlert />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import UpdatePrompt from './components/UpdatePrompt.vue'
import GlobalAlert from './components/GlobalAlert.vue'
import TitleBar from './components/Core/TitleBar.vue'
import CommandPalette from './components/Core/CommandPalette.vue'
import CopilotWidget from './components/Ai/CopilotWidget.vue'
import { initWebSocket } from '@/api/mWebSocket'

const route = useRoute()
const commandPaletteRef = ref(null)
const isDialogueRoute = computed(() => route.name === 'Dialogue')

const handleGlobalKeydown = (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault()
    commandPaletteRef.value?.open()
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleGlobalKeydown)

  // 启动时立即连接 WebSocket
  // 不需要 Token，后端会自动处理：
  // 1. 如果是 Server 模式，允许匿名连接
  // 2. 如果是 Node 模式，后端会鉴权，如果本地有缓存 Token 会自动带上
  initWebSocket()
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalKeydown)
})
</script>

<style scoped>
/* Scoped styles for App.vue components if any */
</style>

<style>
/* Global Layout Styles */
body {
  margin: 0;
  padding: 0;
  background: #f2f3f5; /* Neutral canvas background */
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  overflow: hidden;
}

.app-root {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
}

.content-area {
  width: 100%;
  height: 100%;
  padding-top: 50px; /* Space for TitleBar */
  box-sizing: border-box;
  position: relative;
  overflow: hidden;
}
</style>