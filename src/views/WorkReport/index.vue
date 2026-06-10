<template>
  <div class="admin-shell">
    <aside class="side-nav">
      <div class="nav-panel">
        <nav class="menu">
          <div class="item" :class="{ active: currentRoute === 'AppList' }" @click="$router.push({ name: 'AppList' })" title="应用管理"><el-icon><Grid /></el-icon></div>
          <div class="item" :class="{ active: currentRoute === 'DeviceManage' }" @click="$router.push({ name: 'DeviceManage' })" title="设备管理"><el-icon><Monitor /></el-icon></div>
          <div class="item" :class="{ active: currentRoute === 'Schedule' }" @click="$router.push({ name: 'Schedule' })" title="定时任务"><el-icon><Timer /></el-icon></div>
          <div class="item" :class="{ active: currentRoute === 'Timeline' }" @click="$router.push({ name: 'Timeline' })" title="时间线"><el-icon><DataLine /></el-icon></div>
        </nav>
      </div>
    </aside>

    <main class="content-view">
      <router-view v-slot="{ Component }">
        <transition name="fade-slide" mode="out-in">
          <component :is="Component" />
        </transition>
      </router-view>
    </main>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { ElIcon } from 'element-plus'
import { Grid, Monitor, Timer, DataLine } from '@element-plus/icons-vue'

import 'element-plus/dist/index.css'

const route = useRoute()
const currentRoute = computed(() => route.name)
</script>

<style scoped>
.admin-shell {
  height: 100vh;
  width: 100vw;
  background: #f3f4f6;
  display: flex;
  overflow: hidden;
}

.content-view {
  flex: 1;
  overflow: auto;
  background: #f3f4f6;
}

.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: opacity 0.2s ease;
}
.fade-slide-enter-from,
.fade-slide-leave-to {
  opacity: 0;
}

.side-nav {
  width: 72px;
  flex-shrink: 0;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 24px;
  background: #fff;
  border-right: 1px solid #e5e7eb;
}

.nav-panel {
  padding: 8px;
}

.menu {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.item {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  color: #6b7280;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.item:hover {
  background: #f3f4f6;
  color: #111827;
}

.item.active {
  background: #111827;
  color: #fff;
}
</style>