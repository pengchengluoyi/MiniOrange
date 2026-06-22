<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Setting, OfficeBuilding, Cpu, Key, Monitor, Calendar, Fold, Expand } from '@element-plus/icons-vue'
import { Minus, FullScreen, Close } from '@element-plus/icons-vue'
import { readAgentSessions } from '@/utils/agentSessions'
import { useSettingsAside } from '@/composables/useSettingsAside'
import './settings-ui.css'

const route = useRoute()
const router = useRouter()
const { collapsed, toggleAside } = useSettingsAside()
const isMac = ref(false)

onMounted(() => {
  isMac.value = /Mac|iPod|iPhone|iPad/.test(navigator.platform)
})

const sections = [
  { id: 'runtime', label: '运行状态', icon: Monitor, to: '/settings/runtime' },
  { id: 'schedule', label: '定时任务', icon: Calendar, to: '/settings/schedule' },
  { id: 'hub', label: '应用与环境', icon: OfficeBuilding, to: '/settings/hub' },
  { id: 'skills', label: 'Skills', icon: Cpu, to: '/settings/skills' },
  { id: 'keys', label: '密钥配置', icon: Key, to: '/settings/keys' },
]

const runtimeSubNav = [
  { id: 'overview', label: '运行概览', query: { view: 'overview' } },
  { id: 'topology', label: '多机方案', query: { view: 'topology' } },
]

const hubSubNav = [
  { id: 'projects', label: '项目与应用', query: { tab: 'projects' } },
  { id: 'knowledge', label: '知识库', query: { tab: 'knowledge' } },
]

const keysSubNav = [
  { id: 'model-keys', label: '大模型 Key', query: { tab: 'model-keys' } },
  { id: 'robots', label: '机器人', query: { tab: 'robots' } },
]

const appConfigSubNav = [
  { key: 'env', label: '执行环境' },
  { key: 'icons', label: '无字图标' },
  { key: 'logic', label: '应用逻辑' },
  { key: 'regression', label: '飞书回归' },
  { key: 'figma', label: '设计稿' },
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
  if (s.id === 'keys') {
    return route.path.startsWith('/settings/keys') || route.path.startsWith('/settings/ai') || route.path.startsWith('/settings/feishu')
  }
  return route.path === s.to || route.path.startsWith(s.to + '/')
}

const secondaryNav = computed(() => {
  if (route.name === 'SettingsAppConfig') {
    const appId = route.params.appId
    const appName = route.query.appName || '应用'
    return {
      kind: 'app',
      title: appName,
      back: { name: 'SettingsHub' },
      items: appConfigSubNav.map((item) => ({
        id: item.key,
        label: item.label,
        to: {
          name: 'SettingsAppConfig',
          params: { appId, section: item.key },
          query: route.query,
        },
      })),
    }
  }
  if (route.path.startsWith('/settings/runtime') && route.name !== 'SettingsDeviceDetail') {
    return { kind: 'simple', parent: 'runtime', items: runtimeSubNav }
  }
  if (route.path.startsWith('/settings/hub')) {
    return { kind: 'simple', parent: 'hub', items: hubSubNav }
  }
  if (route.path.startsWith('/settings/keys')) {
    return { kind: 'simple', parent: 'keys', items: keysSubNav }
  }
  return null
})

const isSubActive = (item) => {
  if (secondaryNav.value?.kind === 'app') {
    return route.params.section === item.id
  }
  if (secondaryNav.value?.parent === 'runtime') {
    const view = route.query.view || (route.query.tab === 'cluster' ? 'topology' : 'overview')
    return view === item.id
  }
  if (secondaryNav.value?.parent === 'hub') {
    const tab = route.query.tab === 'knowledge' ? 'knowledge' : 'projects'
    return tab === item.id
  }
  if (secondaryNav.value?.parent === 'keys') {
    const tab = route.query.tab === 'robots' ? 'robots' : 'model-keys'
    return tab === item.id
  }
  return false
}

const go = (s) => {
  if (s.id === 'runtime') {
    router.push({ path: '/settings/runtime', query: { view: 'overview' } })
    return
  }
  if (s.id === 'hub') {
    router.push({ path: '/settings/hub' })
    return
  }
  if (s.id === 'keys') {
    router.push({ path: '/settings/keys', query: { tab: 'model-keys' } })
    return
  }
  router.push(s.to)
}

const goSub = (item) => {
  if (secondaryNav.value?.kind === 'app') {
    router.push(item.to)
    return
  }
  const parent = secondaryNav.value?.parent
  if (parent === 'runtime') {
    router.replace({ path: '/settings/runtime', query: { ...route.query, view: item.id, tab: undefined } })
    return
  }
  if (parent === 'hub') {
    const nextQuery = item.id === 'knowledge' ? { tab: 'knowledge' } : {}
    router.replace({ name: 'SettingsHub', query: nextQuery })
    return
  }
  if (parent === 'keys') {
    router.replace({ path: '/settings/keys', query: { tab: item.id } })
  }
}

const goAppBack = () => {
  router.push(secondaryNav.value?.back || { name: 'SettingsHub' })
}

const openLatestDialogue = () => {
  const latest = readAgentSessions()
    .filter((session) => (session.messages || []).some((item) => item.role === 'user' && String(item.content || '').trim()))
    .sort((a, b) => new Date(b.lastUserMessageAt || b.updatedAt) - new Date(a.lastUserMessageAt || a.updatedAt))[0]
  router.push(latest ? { name: 'Dialogue', query: { sessionId: latest.id } } : { name: 'Dialogue', query: { fresh: '1' } })
}

const handleMinimize = () => window.electronAPI?.minimize()
const handleMaximize = () => window.electronAPI?.maximize()
const handleClose = () => window.electronAPI?.close()
</script>

<template>
  <div class="settings-layout">
    <div class="settings-sidebar-col" :class="{ collapsed }">
      <div class="aside-chrome">
        <div v-if="isMac" class="mac-traffic-zone" aria-hidden="true" />
        <button
          type="button"
          class="aside-collapse-btn"
          :title="collapsed ? '展开侧栏' : '收起侧栏'"
          @click="toggleAside"
        >
          <el-icon><component :is="collapsed ? Expand : Fold" /></el-icon>
        </button>
      </div>

      <aside class="settings-aside">
        <div class="aside-head">
          <el-icon><Setting /></el-icon>
          <span v-if="!collapsed">设置</span>
        </div>

        <nav class="section-nav">
          <template v-for="s in sections" :key="s.id">
            <button
              type="button"
              class="section-btn"
              :class="{ active: isActive(s) }"
              :title="s.label"
              @click="go(s)"
            >
              <el-icon><component :is="s.icon" /></el-icon>
              <span v-if="!collapsed">{{ s.label }}</span>
            </button>

            <div
              v-if="!collapsed && secondaryNav && isActive(s) && (secondaryNav.parent === s.id || (secondaryNav.kind === 'app' && s.id === 'hub'))"
              class="sub-nav"
            >
              <template v-if="secondaryNav.kind === 'app' && s.id === 'hub'">
                <button type="button" class="sub-nav-back" @click="goAppBack">← {{ secondaryNav.title }}</button>
                <button
                  v-for="item in secondaryNav.items"
                  :key="item.id"
                  type="button"
                  class="sub-nav-btn"
                  :class="{ active: isSubActive(item) }"
                  @click="goSub(item)"
                >
                  {{ item.label }}
                </button>
              </template>
              <template v-else-if="secondaryNav.parent === s.id">
                <button
                  v-for="item in secondaryNav.items"
                  :key="item.id"
                  type="button"
                  class="sub-nav-btn"
                  :class="{ active: isSubActive(item) }"
                  @click="goSub(item)"
                >
                  {{ item.label }}
                </button>
              </template>
            </div>
          </template>
        </nav>

        <el-button v-if="!collapsed" text class="back-apps" @click="openLatestDialogue">← 返回对话记录</el-button>
        <el-button v-else text class="back-apps collapsed-back" title="返回对话记录" @click="openLatestDialogue">←</el-button>
      </aside>
    </div>

    <main class="settings-main">
      <div id="settings-overlay-portal" class="settings-overlay-portal" />
      <router-view />
    </main>

    <div v-if="!isMac" class="settings-win-controls">
      <div class="control-btn minimize" @click="handleMinimize">
        <el-icon><Minus /></el-icon>
      </div>
      <div class="control-btn maximize" @click="handleMaximize">
        <el-icon><FullScreen /></el-icon>
      </div>
      <div class="control-btn close" @click="handleClose">
        <el-icon><Close /></el-icon>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-layout {
  --settings-chrome-h: 52px;
  display: flex;
  height: 100%;
  min-height: 0;
  background: #f3f4f6;
  position: relative;
}

.settings-sidebar-col {
  width: 220px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: #fff;
  border-right: 1px solid #e5e7eb;
  transition: width 0.2s ease;
}

.settings-sidebar-col.collapsed {
  width: 72px;
}

.aside-chrome {
  height: var(--settings-chrome-h);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 10px 0 0;
  border-bottom: 1px solid #e5e7eb;
  background: #fff;
  -webkit-app-region: drag;
  user-select: none;
}

.mac-traffic-zone {
  width: 68px;
  height: 100%;
  flex-shrink: 0;
}

.aside-collapse-btn {
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: #6b7280;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  -webkit-app-region: no-drag;
}

/* 折叠：交通灯占上行，折叠按钮在下方，避免与 ●●● 重叠 */
.settings-sidebar-col.collapsed .aside-chrome {
  flex-direction: column;
  justify-content: flex-start;
  align-items: center;
  gap: 2px;
  padding: 8px 0 4px;
}

.settings-sidebar-col.collapsed .mac-traffic-zone {
  width: 56px;
  height: 14px;
}

.aside-collapse-btn:hover {
  background: #f3f4f6;
  color: #111827;
}

.settings-aside {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px 10px 24px;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}

.aside-head {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 700;
  padding: 4px 8px 14px;
  color: #374151;
}

.settings-sidebar-col.collapsed .aside-head {
  justify-content: center;
  padding-bottom: 10px;
}

.section-nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
}

.section-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 10px;
  border: none;
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  font-size: 13px;
  color: #374151;
  text-align: left;
}

.settings-sidebar-col.collapsed .section-btn {
  justify-content: center;
  padding: 10px 6px;
}

.section-btn:hover,
.section-btn.active {
  background: #f3f4f6;
  color: #111827;
  font-weight: 600;
}

.sub-nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0 0 6px 12px;
  padding-left: 10px;
  border-left: 2px solid #e5e7eb;
}

.sub-nav-back {
  border: none;
  background: transparent;
  text-align: left;
  padding: 6px 8px;
  font-size: 12px;
  color: #6366f1;
  cursor: pointer;
  font-weight: 600;
}

.sub-nav-btn {
  border: none;
  background: transparent;
  text-align: left;
  padding: 7px 8px;
  border-radius: 6px;
  font-size: 12px;
  color: #6b7280;
  cursor: pointer;
}

.sub-nav-btn:hover,
.sub-nav-btn.active {
  background: #eef2ff;
  color: #4338ca;
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
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  padding: 16px 28px 48px;
  position: relative;
}

.settings-overlay-portal {
  position: sticky;
  top: 0;
  z-index: 20;
  min-height: 0;
}

.settings-overlay-portal:not(:empty) {
  z-index: 10001;
}

.settings-overlay-portal:empty {
  display: none;
}

.settings-win-controls {
  position: absolute;
  top: 0;
  right: 0;
  display: flex;
  height: var(--settings-chrome-h);
  z-index: 30;
  -webkit-app-region: no-drag;
}

.settings-main :deep(.settings-panel) {
  max-width: 1100px;
}

.settings-main :deep(.settings-panel.wide-panel) {
  max-width: none;
  width: 100%;
}

.control-btn {
  width: 46px;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.2s;
  color: #666;
}

.control-btn:hover {
  background: rgba(0, 0, 0, 0.05);
}

.control-btn.close:hover {
  background: #e81123;
  color: white;
}
</style>
