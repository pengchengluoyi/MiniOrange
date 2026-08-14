<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Fold, Expand, Setting, SwitchButton } from '@element-plus/icons-vue'
import { getDeviceList } from '@/api/device'
import {
  lastAgentPath,
  lastTestingPath,
  openSettingsRemembering,
  rememberAgentPath,
  rememberTestingPath,
} from '@/utils/workMode'
import './work-shell.css'

const props = defineProps({
  mode: { type: String, required: true }, // 'agent' | 'testing'
})

const route = useRoute()
const router = useRouter()
const collapsed = ref(false)
const isMac = ref(false)
const accountMenuOpen = ref(false)
const deviceCount = ref(0)

onMounted(async () => {
  isMac.value = /Mac|iPod|iPhone|iPad/.test(navigator.platform)
  try {
    const r = await getDeviceList()
    const list = Array.isArray(r) ? r : (r?.data || r?.data?.devices || [])
    deviceCount.value = list.length || 0
  } catch (_) {
    deviceCount.value = 0
  }
})

watch(
  () => route.fullPath,
  (p) => {
    if (props.mode === 'testing') rememberTestingPath(p)
    if (props.mode === 'agent') rememberAgentPath(p)
  },
  { immediate: true },
)

const modeValue = computed(() => (props.mode === 'testing' ? 'testing' : 'agent'))

const setMode = (id) => {
  if (id === 'agent') router.push(lastAgentPath())
  else router.push(lastTestingPath().startsWith('/testing') ? lastTestingPath() : '/testing')
}

const toggleAside = () => {
  collapsed.value = !collapsed.value
}

const openSettings = () => openSettingsRemembering(router, route.fullPath)

const handleLogout = async () => {
  accountMenuOpen.value = false
  try {
    localStorage.removeItem('token')
  } catch (_) {}
  router.push({ name: 'Login' })
}
</script>

<template>
  <div class="work-shell">
    <div class="work-sidebar-col" :class="{ collapsed }">
      <div class="work-aside-chrome">
        <div v-if="isMac" class="work-mac-traffic" aria-hidden="true" />
        <button type="button" class="work-collapse-btn" :title="collapsed ? '展开侧栏' : '收起侧栏'" @click="toggleAside">
          <el-icon><component :is="collapsed ? Expand : Fold" /></el-icon>
        </button>
      </div>

      <aside v-show="!collapsed" class="work-aside">
        <div class="work-brand">MiniOrange</div>

        <div class="mode-switch" role="tablist" aria-label="工作面">
          <button
            type="button"
            role="tab"
            :aria-selected="modeValue === 'agent'"
            :class="{ on: modeValue === 'agent' }"
            @click="setMode('agent')"
          >
            Agent
          </button>
          <button
            type="button"
            role="tab"
            :aria-selected="modeValue === 'testing'"
            :class="{ on: modeValue === 'testing' }"
            @click="setMode('testing')"
          >
            测试
          </button>
        </div>

        <div class="work-aside-mid">
          <slot name="sidebar" />
        </div>

        <div class="work-side-footer-wrap">
          <div v-if="accountMenuOpen" class="work-account-popover">
            <button type="button" class="work-menu-item danger" @click="handleLogout">
              <el-icon><SwitchButton /></el-icon>
              <span>Log Out</span>
            </button>
          </div>
          <div class="work-side-footer">
            <button
              type="button"
              class="work-account-mini"
              :class="{ active: accountMenuOpen }"
              @click="accountMenuOpen = !accountMenuOpen"
            >
              <div>
                <strong>MiniOrange</strong>
                <span>{{ deviceCount }} 台设备</span>
              </div>
              <span class="work-account-status" :class="{ active: deviceCount }">{{ deviceCount ? 'Active' : 'Idle' }}</span>
            </button>
            <button type="button" class="work-settings-btn" title="设置" @click="openSettings">
              <el-icon><Setting /></el-icon>
            </button>
          </div>
        </div>
      </aside>
    </div>

    <main class="work-main">
      <slot />
    </main>
  </div>
</template>
