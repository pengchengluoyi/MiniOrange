<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { ElIcon, ElButton, ElInput, ElSelect, ElOption, ElTag, ElMessage } from 'element-plus'
import { Promotion, MagicStick, User, Monitor, Calendar, Clock, ChatDotRound, Grid, Setting } from '@element-plus/icons-vue'
import { copilotChat, copilotExecute } from '@/api/copilot'
import { initWebSocket } from '@/api/mWebSocket'
import { wsGetDeviceList } from '@/api/wsAppGraph'
import { getDeviceList } from '@/api/device'
import { copilotCommands } from '@/logic/CopilotCommands'

function normalizeDeviceList(res) {
  if (Array.isArray(res)) return res
  if (Array.isArray(res?.data)) return res.data
  if (Array.isArray(res?.data?.devices)) return res.data.devices
  if (Array.isArray(res?.devices)) return res.devices
  return []
}

function executionDevices(list) {
  const online = list.filter((d) => d.status === 'online')
  const mobile = online.filter((d) =>
    ['android', 'ios', 'mobile'].includes(String(d.type || '').toLowerCase()),
  )
  return mobile.length ? mobile : online
}

const router = useRouter()
const messages = ref([])
const inputValue = ref('')
const isLoading = ref(false)
const chatRef = ref(null)
const selectedSn = ref('')
const devices = ref([])
const devicesLoading = ref(false)
const stepLog = ref([])
let devicePollTimer = null

const showSlashMenu = ref(false)
const slashQuery = ref('')
const selectedSlashIndex = ref(0)

const navItems = [
  { name: 'Dialogue', label: '对话流', icon: ChatDotRound, path: '/dialogue' },
  { name: 'AppList', label: '应用', icon: Grid, path: '/report/apps' },
  { name: 'DeviceManage', label: '设备', icon: Monitor, path: '/device' },
  { name: 'Schedule', label: '定时', icon: Calendar, path: '/schedule' },
  { name: 'Timeline', label: '时间线', icon: Clock, path: '/timeline' },
]

const bottomNavItems = [
  { name: 'SettingsHub', label: '设置', icon: Setting, path: '/settings/hub' },
]

const filteredSlash = computed(() => {
  const q = slashQuery.value.toLowerCase()
  if (!q) return copilotCommands
  return copilotCommands.filter(
    (a) =>
      a.id.toLowerCase().includes(q) ||
      a.title.toLowerCase().includes(q) ||
      (a.keywords && a.keywords.some((k) => k.toLowerCase().includes(q))),
  )
})

const handleInput = (val) => {
  if (val.startsWith('/')) {
    showSlashMenu.value = true
    slashQuery.value = val.slice(1)
    selectedSlashIndex.value = 0
  } else {
    showSlashMenu.value = false
  }
}

const scrollBottom = () => {
  nextTick(() => {
    if (chatRef.value) chatRef.value.scrollTop = chatRef.value.scrollHeight
  })
}

const loadDevices = async () => {
  devicesLoading.value = true
  try {
    let list = []
    try {
      const res = await wsGetDeviceList()
      list = normalizeDeviceList(res)
    } catch (wsErr) {
      console.warn('WS device list failed, try HTTP', wsErr)
      initWebSocket()
      await new Promise((r) => setTimeout(r, 800))
      try {
        const res = await wsGetDeviceList()
        list = normalizeDeviceList(res)
      } catch {
        const httpRes = await getDeviceList()
        list = normalizeDeviceList(httpRes)
      }
    }
    devices.value = executionDevices(list)
    if (!selectedSn.value && devices.value.length >= 1) {
      const android = devices.value.find((d) => d.type === 'android')
      selectedSn.value = (android || devices.value[0]).sn
    }
    if (!devices.value.length) {
      ElMessage.info('暂无在线设备，请 USB 连接手机并在「设备」页确认在线')
    }
  } catch (e) {
    console.warn('load devices', e)
    ElMessage.warning('获取设备列表失败，请确认后端已启动且 WebSocket 已连接')
  } finally {
    devicesLoading.value = false
  }
}

const pushAi = (content, extra = {}) => {
  messages.value.push({ id: Date.now() + Math.random(), role: 'ai', content, ...extra })
  scrollBottom()
}

const pushUser = (content) => {
  messages.value.push({ id: Date.now(), role: 'user', content })
  scrollBottom()
}

const runPlan = async (plan) => {
  if (plan.navigate?.name) {
    router.push({ name: plan.navigate.name })
    return
  }
  const steps = plan.steps || []
  if (!steps.length) return

  if (!selectedSn.value && steps.some((s) => ['click', 'swipe', 'open_app', 'close_app'].includes(s.kind))) {
    ElMessage.warning('请先选择在线设备')
    return
  }

  pushAi(`执行 ${steps.length} 个步骤…`, { isSteps: true })
  try {
    const execRes = await copilotExecute({
      steps,
      sn: selectedSn.value,
      platform: 'android',
    })
    const results = execRes?.data?.results || []
    stepLog.value = results
    const lines = results.map(
      (r, i) => `${r.ok ? '✓' : '✗'} ${r.summary || steps[i]?.summary}: ${r.msg || ''}`,
    )
    pushAi(lines.join('\n') || '执行完成')
    if (!execRes?.data?.ok) ElMessage.warning('部分步骤未成功')
  } catch (e) {
    pushAi(`执行失败: ${e?.message || e}`)
    ElMessage.error('执行失败')
  }
}

const sendMessage = async () => {
  const text = inputValue.value.trim()
  if (!text) return

  if (text.startsWith('/') && showSlashMenu.value && filteredSlash.value.length) {
    const action = filteredSlash.value[selectedSlashIndex.value]
    if (action.isPrompt) {
      inputValue.value = action.prompt
      showSlashMenu.value = false
      return
    }
    if (action.handler) {
      action.handler(router)
      inputValue.value = ''
      showSlashMenu.value = false
      pushUser(`/${action.id}`)
      return
    }
  }

  pushUser(text)
  inputValue.value = ''
  showSlashMenu.value = false
  isLoading.value = true

  try {
    const res = await copilotChat({ text, sn: selectedSn.value })
    const plan = res?.data || {}
    pushAi(plan.reply || '已处理')
    if (plan.auto_run !== false) {
      await runPlan(plan)
    }
  } catch (e) {
    pushAi(`规划失败: ${e?.message || e}`)
  } finally {
    isLoading.value = false
  }
}

const applySlash = (action) => {
  if (!action) return
  if (action.isPrompt) {
    inputValue.value = action.prompt
    showSlashMenu.value = false
    return
  }
  if (action.handler) {
    action.handler(router)
    inputValue.value = ''
    showSlashMenu.value = false
    pushUser(`/${action.id}`)
  }
}

const handleKeydown = (e) => {
  if (showSlashMenu.value) {
    const n = filteredSlash.value.length
    if (!n) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      selectedSlashIndex.value = (selectedSlashIndex.value + 1) % n
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      selectedSlashIndex.value = (selectedSlashIndex.value - 1 + n) % n
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const action = filteredSlash.value[selectedSlashIndex.value]
      if (action.isPrompt) {
        inputValue.value = action.prompt
        showSlashMenu.value = false
      } else if (action.handler) {
        action.handler(router)
        inputValue.value = ''
        showSlashMenu.value = false
      } else {
        sendMessage()
      }
    } else if (e.key === 'Escape') {
      showSlashMenu.value = false
    }
    return
  }
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    sendMessage()
  }
}

onMounted(async () => {
  await loadDevices()
  devicePollTimer = setInterval(loadDevices, 15000)
  pushAi(
    '你好，我是对话流执行助手。用自然语言描述操作（80% 会点击、20% 滑动），例如：\n' +
      '· 打开 com.xxx.app\n' +
      '· 点击 600,1200 或 点击「我的」\n' +
      '· 上滑\n' +
      '· 去应用列表\n' +
      '输入 / 查看快捷命令',
  )
})

onUnmounted(() => {
  if (devicePollTimer) clearInterval(devicePollTimer)
})
</script>

<template>
  <div class="dialogue-page">
    <aside class="side-nav">
      <div class="brand">MiniOrange</div>
      <button
        v-for="item in navItems"
        :key="item.name"
        type="button"
        class="nav-btn"
        :class="{ active: $route.name === item.name }"
        @click="router.push({ name: item.name })"
      >
        <el-icon><component :is="item.icon" /></el-icon>
        <span>{{ item.label }}</span>
      </button>
      <div class="nav-spacer" />
      <button
        v-for="item in bottomNavItems"
        :key="item.name"
        type="button"
        class="nav-btn nav-btn-bottom"
        :class="{ active: $route.name === item.name }"
        @click="router.push({ name: item.name })"
      >
        <el-icon><component :is="item.icon" /></el-icon>
        <span>{{ item.label }}</span>
      </button>
    </aside>

    <main class="main-panel">
      <header class="toolbar">
        <span class="title">对话流</span>
        <el-select
          v-model="selectedSn"
          placeholder="选择执行设备（Android 真机）"
          filterable
          clearable
          style="width: 320px"
          :loading="devicesLoading"
          @visible-change="(v) => v && loadDevices()"
        >
          <el-option
            v-for="d in devices"
            :key="d.sn"
            :label="`${d.sn} · ${d.type || 'device'}${d.model ? ' · ' + d.model : ''}`"
            :value="d.sn"
          />
        </el-select>
        <el-button link type="primary" :loading="devicesLoading" @click="loadDevices">刷新</el-button>
        <el-tag type="info" size="small">80% 点击 · 20% 滑动</el-tag>
      </header>

      <div class="chat-panel" ref="chatRef">
        <div v-for="msg in messages" :key="msg.id" class="msg-row" :class="msg.role">
          <div class="avatar">
            <el-icon v-if="msg.role === 'ai'"><MagicStick /></el-icon>
            <el-icon v-else><User /></el-icon>
          </div>
          <div class="bubble">{{ msg.content }}</div>
        </div>
        <div v-if="isLoading" class="msg-row ai">
          <div class="avatar"><el-icon class="is-loading"><MagicStick /></el-icon></div>
          <div class="bubble">规划中…</div>
        </div>
      </div>

      <div v-if="stepLog.length" class="step-log">
        <div v-for="(s, i) in stepLog" :key="i" class="step-line" :class="{ ok: s.ok }">
          {{ s.ok ? '✓' : '✗' }} {{ s.summary }} — {{ s.msg }}
        </div>
      </div>

      <div v-if="showSlashMenu" class="slash-menu">
        <div
          v-for="(action, index) in filteredSlash"
          :key="action.id"
          class="slash-item"
          :class="{ active: index === selectedSlashIndex }"
          @click="applySlash(action)"
        >
          <span>{{ action.title }}</span>
          <span class="slash-id">{{ action.id }}</span>
        </div>
      </div>

      <footer class="input-bar">
        <el-input
          v-model="inputValue"
          type="textarea"
          :autosize="{ minRows: 1, maxRows: 4 }"
          placeholder="描述要做的操作，或输入 / 命令…"
          resize="none"
          @input="handleInput"
          @keydown="handleKeydown"
        />
        <el-button type="primary" circle :icon="Promotion" :disabled="!inputValue" @click="sendMessage" />
      </footer>
    </main>
  </div>
</template>

<style scoped>
.dialogue-page {
  display: flex;
  height: 100%;
  background: #f0f2f5;
}

.side-nav {
  width: 200px;
  flex-shrink: 0;
  background: rgba(255, 255, 255, 0.85);
  border-right: 1px solid rgba(0, 0, 0, 0.06);
  padding: 16px 10px 20px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  height: 100%;
  box-sizing: border-box;
  overflow-y: auto;
}

.nav-spacer {
  flex: 1;
  min-height: 24px;
}

.nav-btn-bottom {
  margin-top: auto;
  border-top: 1px solid rgba(0, 0, 0, 0.06);
  padding-top: 12px;
}

.brand {
  font-weight: 700;
  font-size: 15px;
  padding: 8px 12px 16px;
  color: #4f46e5;
}

.nav-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border: none;
  border-radius: 10px;
  background: transparent;
  cursor: pointer;
  font-size: 14px;
  color: #374151;
  text-align: left;
}

.nav-btn:hover,
.nav-btn.active {
  background: #eef2ff;
  color: #4f46e5;
}

.main-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: 16px 24px 24px;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 12px;
}

.title {
  font-size: 20px;
  font-weight: 600;
}

.chat-panel {
  flex: 1;
  overflow-y: auto;
  background: rgba(255, 255, 255, 0.9);
  border-radius: 16px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.msg-row {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  font-size: 14px;
  line-height: 1.55;
  white-space: pre-wrap;
}

.msg-row.user {
  flex-direction: row-reverse;
}

.avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.msg-row.ai .avatar {
  background: #e0e7ff;
  color: #4f46e5;
}

.msg-row.user .avatar {
  background: #e5e7eb;
}

.bubble {
  max-width: 75%;
  padding: 10px 14px;
  border-radius: 14px;
}

.msg-row.user .bubble {
  background: #4f46e5;
  color: #fff;
}

.msg-row.ai .bubble {
  background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
}

.step-log {
  margin-top: 8px;
  padding: 10px 14px;
  background: #fff;
  border-radius: 10px;
  font-size: 12px;
  font-family: ui-monospace, monospace;
  max-height: 120px;
  overflow-y: auto;
}

.step-line.ok {
  color: #059669;
}

.step-line:not(.ok) {
  color: #dc2626;
}

.slash-menu {
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1);
  padding: 6px;
  margin-bottom: 8px;
  max-height: 220px;
  overflow-y: auto;
}

.slash-item {
  display: flex;
  justify-content: space-between;
  padding: 8px 12px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
}

.slash-item.active,
.slash-item:hover {
  background: #eff6ff;
  color: #4f46e5;
}

.slash-id {
  font-size: 12px;
  color: #9ca3af;
}

.input-bar {
  display: flex;
  gap: 10px;
  align-items: flex-end;
  margin-top: 12px;
  padding: 12px;
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06);
}

:deep(.el-textarea__inner) {
  box-shadow: none;
  border: none;
}
</style>
