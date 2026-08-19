<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Setting, Cpu, Key, Monitor, Calendar } from '@element-plus/icons-vue'
import { Minus, FullScreen, Close } from '@element-plus/icons-vue'
import { returnFromSettingsPath } from '@/utils/workMode'
import './settings-ui.css'

const route = useRoute()
const router = useRouter()
const isMac = ref(false)

onMounted(() => {
  isMac.value = /Mac|iPod|iPhone|iPad/.test(navigator.platform)
})

const sections = [
  { id: 'runtime', label: '运行状态', icon: Monitor, to: '/settings/runtime' },
  { id: 'schedule', label: '定时任务', icon: Calendar, to: '/settings/schedule' },
  { id: 'skills', label: 'Skills', icon: Cpu, to: '/settings/skills' },
  { id: 'packs', label: '扩展', icon: Cpu, to: '/settings/packs' },
  { id: 'keys', label: '密钥配置', icon: Key, to: '/settings/keys' },
  { id: 'system', label: '系统设置', icon: Setting, to: '/settings/system' },
]

const runtimeSubNav = [
  { id: 'overview', label: '运行概览', query: { view: 'overview' } },
  { id: 'topology', label: '多机方案', query: { view: 'topology' } },
]

const keysSubNav = [
  { id: 'model-keys', label: '大模型 Key', query: { tab: 'model-keys' } },
  { id: 'robots', label: '机器人', query: { tab: 'robots' } },
]

const appConfigSubNav = [
  { key: 'env', label: '执行环境' },
  { key: 'icons', label: '无字图标' },
  { key: 'logic', label: '应用逻辑' },
  { key: 'regression', label: '用例来源' },
  { key: 'figma', label: '设计稿' },
]

const isActive = (s) => {
  if (s.id === 'runtime') {
    return route.path.startsWith('/settings/runtime')
  }
  if (s.id === 'keys') {
    return route.path.startsWith('/settings/keys') || route.path.startsWith('/settings/ai') || route.path.startsWith('/settings/feishu')
  }
  if (s.id === 'system') {
    return route.path.startsWith('/settings/system')
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
      back: { name: 'TestingApp', params: { appId }, query: { ...route.query, tab: 'config' } },
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
  router.push(secondaryNav.value?.back || { name: 'TestingHome' })
}

const leaveSettings = () => {
  router.push(returnFromSettingsPath())
}

const handleMinimize = () => window.electronAPI?.minimize()
const handleMaximize = () => window.electronAPI?.maximize()
const handleClose = () => window.electronAPI?.close()
</script>

<template>
  <div class="settings-layout">
    <div class="settings-sidebar-col">
      <div class="aside-chrome">
        <div v-if="isMac" class="mac-traffic-zone" aria-hidden="true" />
      </div>

      <aside class="settings-aside">
        <div class="aside-head">
          <el-icon><Setting /></el-icon>
          <span>设置</span>
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
              <span>{{ s.label }}</span>
            </button>

            <div
              v-if="secondaryNav && secondaryNav.parent === s.id && isActive(s)"
              class="sub-nav"
            >
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
            </div>
          </template>

          <div v-if="secondaryNav?.kind === 'app'" class="sub-nav app-config-nav">
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
          </div>
        </nav>

        <el-button text class="back-apps" @click="leaveSettings">← 返回工作台</el-button>
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
}

.aside-chrome {
  height: var(--settings-chrome-h);
  flex-shrink: 0;
  display: flex;
  align-items: center;
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
