<script setup>
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Setting, OfficeBuilding, Cpu, Key, Monitor, Calendar, Fold, Expand } from '@element-plus/icons-vue'
import { readAgentSessions } from '@/utils/agentSessions'
import './settings-ui.css'

const route = useRoute()
const router = useRouter()

const collapsed = ref(localStorage.getItem('settings-aside-collapsed') === '1')

const toggleAside = () => {
  collapsed.value = !collapsed.value
  localStorage.setItem('settings-aside-collapsed', collapsed.value ? '1' : '0')
}

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
  if (s.id === 'runtime') {
    return route.path.startsWith('/settings/runtime')
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

const asideTitle = computed(() => (collapsed.value ? '' : '设置'))
</script>

<template>
  <div class="settings-layout">
    <aside class="settings-aside" :class="{ collapsed }">
      <div class="aside-head">
        <el-icon><Setting /></el-icon>
        <span v-if="!collapsed">{{ asideTitle }}</span>
        <button type="button" class="aside-toggle" :title="collapsed ? '展开侧栏' : '收起侧栏'" @click="toggleAside">
          <el-icon><component :is="collapsed ? Expand : Fold" /></el-icon>
        </button>
      </div>
      <nav class="section-nav">
        <button
          v-for="s in sections"
          :key="s.id"
          type="button"
          class="section-btn"
          :class="{ active: isActive(s) }"
          :title="s.label"
          @click="go(s)"
        >
          <el-icon><component :is="s.icon" /></el-icon>
          <span v-if="!collapsed">{{ s.label }}</span>
        </button>
      </nav>
      <el-button v-if="!collapsed" text class="back-apps" @click="openLatestDialogue">← 返回对话记录</el-button>
      <el-button v-else text class="back-apps collapsed-back" title="返回对话记录" @click="openLatestDialogue">←</el-button>
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
  transition: width 0.2s ease;
}
.settings-aside.collapsed {
  width: 64px;
  padding-left: 8px;
  padding-right: 8px;
}

.aside-head {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 17px;
  font-weight: 700;
  padding: 0 4px 16px;
  position: relative;
}
.settings-aside.collapsed .aside-head {
  justify-content: center;
  padding-bottom: 12px;
}
.aside-toggle {
  margin-left: auto;
  border: none;
  background: transparent;
  cursor: pointer;
  color: #6b7280;
  padding: 4px;
  border-radius: 6px;
  display: flex;
  align-items: center;
}
.settings-aside.collapsed .aside-toggle {
  margin-left: 0;
}
.aside-toggle:hover {
  background: #f3f4f6;
  color: #111827;
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
.settings-aside.collapsed .section-btn {
  justify-content: center;
  padding: 10px 8px;
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
.collapsed-back {
  width: 100%;
  justify-content: center;
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
