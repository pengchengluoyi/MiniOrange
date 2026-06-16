<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Setting, OfficeBuilding, Cpu, Key, Monitor, Calendar } from '@element-plus/icons-vue'
import { readAgentSessions } from '@/utils/agentSessions'
import './settings-ui.css'

const route = useRoute()
const router = useRouter()

const sections = [
  { id: 'runtime', label: '运行状态', icon: Monitor, to: '/settings/runtime' },
  { id: 'schedule', label: '定时任务', icon: Calendar, to: '/settings/schedule' },
  { id: 'hub', label: '应用与环境', icon: OfficeBuilding, to: '/settings/hub' },
  { id: 'skills', label: 'Skills', icon: Cpu, to: '/settings/skills' },
  { id: 'keys', label: '密钥配置', icon: Key, to: '/settings/keys' },
]

const isActive = (s) => {
  if (s.id === 'hub') {
    return (
      route.path.startsWith('/settings/hub') ||
      route.path.startsWith('/settings/apps') ||
      route.path.startsWith('/settings/projects')
    )
  }
  return route.path === s.to || route.path.startsWith(s.to + '/')
}

const go = (s) => router.push(s.to)
const openLatestDialogue = () => {
  const latest = readAgentSessions()
    .filter((session) => (session.messages || []).some((item) => item.role === 'user' && String(item.content || '').trim()))
    .sort((a, b) => new Date(b.lastUserMessageAt || b.updatedAt) - new Date(a.lastUserMessageAt || a.updatedAt))[0]
  router.push(latest ? { name: 'Dialogue', query: { sessionId: latest.id } } : { name: 'Dialogue', query: { fresh: '1' } })
}
</script>

<template>
  <div class="settings-layout">
    <aside class="settings-aside">
      <div class="aside-head">
        <el-icon><Setting /></el-icon>
        <span>设置</span>
      </div>
      <nav class="section-nav">
        <button
          v-for="s in sections"
          :key="s.id"
          type="button"
          class="section-btn"
          :class="{ active: isActive(s) }"
          @click="go(s)"
        >
          <el-icon><component :is="s.icon" /></el-icon>
          {{ s.label }}
        </button>
      </nav>
      <el-button text class="back-apps" @click="openLatestDialogue">← 返回对话记录</el-button>
    </aside>

    <main class="settings-main">
      <router-view />
    </main>
  </div>
</template>

<style scoped>
.settings-layout {
  display: flex;
  height: 100%;
  min-height: 0;
  background: #f3f4f6;
}
.settings-aside {
  width: 200px;
  flex-shrink: 0;
  background: #fff;
  border-right: 1px solid #e5e7eb;
  padding: 20px 12px 24px;
  display: flex;
  flex-direction: column;
  height: 100%;
  box-sizing: border-box;
  overflow-y: auto;
}

.aside-head {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 17px;
  font-weight: 700;
  padding: 0 8px 16px;
}
.section-nav {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
}
.section-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border: none;
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  font-size: 14px;
  color: #374151;
  text-align: left;
}
.section-btn:hover,
.section-btn.active {
  background: #f3f4f6;
  color: #111827;
  font-weight: 600;
}
.back-apps {
  margin-top: 12px;
  font-size: 12px;
}
.settings-main {
  flex: 1;
  overflow-y: auto;
  padding: 24px 32px 48px;
}
.settings-main :deep(.settings-panel) {
  max-width: 1100px;
}
.settings-main :deep(.settings-panel.wide-panel) {
  max-width: none;
  width: 100%;
}
</style>
