<template>
  <div class="app-root">
    <!-- 🔥 Global TitleBar -->
    <TitleBar v-if="!hideGlobalTitlebar" />
    
    <div class="content-area" :class="{ 'is-settings': hideGlobalTitlebar }">
      <router-view />
    </div>

    <!-- 对话流页使用全屏界面，隐藏底部浮层 -->
    <CopilotWidget v-if="showCopilotWidget" />
    
    <!-- Global Overlays -->
    <CommandPalette ref="commandPaletteRef" />
    <UpdatePrompt />
    <GlobalAlert />
    <GlobalLanAdoptDialog />
    <GlobalHitlDialog />
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
import GlobalLanAdoptDialog from './components/GlobalLanAdoptDialog.vue'
import GlobalHitlDialog from './components/GlobalHitlDialog.vue'
import { bootstrapRealtime } from '@/utils/realtime'
import { reportOverlayOpen } from '@/composables/useOverlayState'
import { startGlobalLanDiscovery, stopGlobalLanDiscovery } from '@/utils/globalLanDiscovery'

const route = useRoute()
const commandPaletteRef = ref(null)
const isSettingsRoute = computed(() => route.path.startsWith('/settings'))
const isWorkShellRoute = computed(() => (
  route.name === 'Dialogue' ||
  route.meta?.workMode === 'agent' ||
  route.meta?.workMode === 'testing' ||
  route.path.startsWith('/testing')
))
const hideGlobalTitlebar = computed(() => (
  isSettingsRoute.value || isWorkShellRoute.value || route.name === 'Login'
))
const showCopilotWidget = computed(() => (
  route.name !== 'Dialogue' &&
  route.name !== 'Login' &&
  !route.path.startsWith('/testing') &&
  route.meta?.workMode !== 'testing' &&
  route.meta?.requiresAuth !== false &&
  !route.meta?.requiresGuest &&
  !reportOverlayOpen.value
))

const handleGlobalKeydown = (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault()
    commandPaletteRef.value?.open()
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleGlobalKeydown)

  bootstrapRealtime()
  startGlobalLanDiscovery()
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalKeydown)
  stopGlobalLanDiscovery()
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
  height: 100vh;
  padding-top: 50px;
  box-sizing: border-box;
  position: relative;
  overflow: hidden;
}

.content-area.is-settings {
  padding-top: 0;
}

.content-area.is-settings > * {
  height: 100%;
  min-height: 0;
}
</style>