<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { listRobotIntegrations } from '@/api/settings'
import {
  getFeishuConfig,
  updateFeishuConfig,
  fetchFeishuCases,
  getFeishuCasesCached,
  runFeishuRegression,
  getFeishuRun,
  listFeishuRuns,
} from '@/api/feishuRegression'
import { getDeviceList } from '@/api/device'
import { wsGetDeviceList } from '@/api/wsAppGraph'
import { initWebSocket } from '@/api/mWebSocket'
import { dedupeDevicesForUi } from '@/utils/devices'
import { displayDeviceSn, formatDeviceType } from '@/utils/deviceDisplay'
import ExecutionReplayer from '@/components/ExecutionReplayer.vue'
import RunSummaryPanel from '@/components/RunSummaryPanel.vue'
import CaseMultilineCell from '@/components/CaseMultilineCell.vue'
import CaseAlignedFieldCell from '@/components/CaseAlignedFieldCell.vue'
import { reportOverlayOpen } from '@/composables/useOverlayState'
import { titlebarOwner, claimTitlebar, releaseTitlebar } from '@/composables/useTitlebar'

const TITLEBAR_ID = 'feishu-report'

const props = defineProps({
  appId: { type: String, required: true },
  appName: { type: String, default: '应用' },
  embedded: { type: Boolean, default: true },
})

const router = useRouter()
const activeTab = ref('cases')
const credConfigured = ref(false)
const loading = ref(false)
const fetching = ref(false)
const running = ref(false)

const envProfiles = ['dev', 'test', 'pre', 'prod']
const configForm = ref({
  doc_url: '',
  spreadsheet_token: '',
  sheet_id: '',
  data_range: 'A1:O500',
  enabled: true,
  bot_id: '',
  env_profile: 'test',
})

const feishuBots = ref([])
const cases = ref([])
const casesSyncedAt = ref('')
const sheetMeta = ref({ total: 0 })
const selectedCaseIds = ref([])
const devices = ref([])
const devicePickerVisible = ref(false)
const devicePickerSn = ref('')
let devicePickerResolve = null

const lastRun = ref(null)
const runHistory = ref([])
const selectedCaseForLog = ref(null)
const expandedRunId = ref('')
const activeRunId = ref('')
/** list: 执行历史 | cases: 已执行用例 | playback: 回放 */
const resultView = ref('list')
let runPollTimer = null

function normalizeDevices(res) {
  const list = Array.isArray(res) ? res : res?.data || res?.devices || []
  return dedupeDevicesForUi(list)
}

const deviceLabel = (device) => {
  const model = device?.model || device?.name
  const sn = displayDeviceSn(device)
  const type = formatDeviceType(device)
  const status = device?.status === 'online' ? '在线' : '离线'
  return model ? `${model} · ${type} · ${status}` : `${sn} · ${type} · ${status}`
}

const inferPlatform = (device) => {
  const type = String(device?.type || '').toLowerCase()
  return type.includes('ios') ? 'ios' : 'android'
}

const pickableDevices = computed(() =>
  devices.value.filter((d) => String(d.type || '').toLowerCase() !== 'pc'),
)

const defaultPickerSn = () =>
  pickableDevices.value.find((d) => d.status === 'online')?.sn
  || pickableDevices.value[0]?.sn
  || ''

const loadConfig = async () => {
  const res = await getFeishuConfig(props.appId)
  const feishu = res?.data?.feishu || {}
  configForm.value = {
    doc_url: feishu.doc_url || '',
    spreadsheet_token: feishu.spreadsheet_token || '',
    sheet_id: feishu.sheet_id || '',
    data_range: feishu.data_range || 'A1:O500',
    enabled: feishu.enabled !== false,
    bot_id: feishu.bot_id || '',
    env_profile: feishu.env_profile || 'test',
  }
}

const loadCachedCases = async () => {
  try {
    const res = await getFeishuCasesCached(props.appId, false)
    const data = res?.data || {}
    if (data.cases?.length) {
      cases.value = data.cases
      casesSyncedAt.value = data.synced_at || ''
      sheetMeta.value = { total: data.total, fromCache: data.from_cache }
      selectedCaseIds.value = cases.value.map((c) => c.case_id)
    }
  } catch {
    /* ignore */
  }
}

const loadRunHistory = async () => {
  try {
    const res = await listFeishuRuns(props.appId)
    runHistory.value = res?.data?.runs || []
  } catch {
    runHistory.value = []
  }
}

const loadDevices = async () => {
  try {
    let list = []
    try {
      list = normalizeDevices(await wsGetDeviceList())
    } catch {
      initWebSocket()
      list = normalizeDevices(await getDeviceList())
    }
    devices.value = list
  } catch {
    devices.value = []
  }
}

const openDevicePicker = async () => {
  await loadDevices()
  if (!pickableDevices.value.some((d) => d.status === 'online')) {
    ElMessage.warning('暂无在线设备，请先在运行状态页确认设备已连接')
    return null
  }
  devicePickerSn.value = defaultPickerSn()
  devicePickerVisible.value = true
  return new Promise((resolve) => {
    devicePickerResolve = resolve
  })
}

const cancelDevicePicker = () => {
  devicePickerVisible.value = false
  devicePickerResolve?.(null)
  devicePickerResolve = null
}

const confirmDevicePicker = () => {
  const sn = devicePickerSn.value
  devicePickerVisible.value = false
  devicePickerResolve?.(sn || null)
  devicePickerResolve = null
}

const saveConfig = async () => {
  if (!configForm.value.bot_id) return ElMessage.warning('请选择飞书机器人')
  if (!configForm.value.doc_url?.trim()) return ElMessage.warning('请填写飞书表格链接')
  loading.value = true
  try {
    await updateFeishuConfig(props.appId, configForm.value)
    ElMessage.success('配置已保存')
    await loadConfig()
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || e?.message || '保存失败')
  } finally {
    loading.value = false
  }
}

const loadCases = async (refresh = true) => {
  if (!configForm.value.bot_id) return ElMessage.warning('请先选择飞书机器人并保存配置')
  fetching.value = true
  try {
    const res = refresh
      ? await fetchFeishuCases(props.appId)
      : await getFeishuCasesCached(props.appId, true)
    const data = res?.data || {}
    cases.value = data.cases || []
    casesSyncedAt.value = data.cached_at || data.synced_at || new Date().toISOString()
    sheetMeta.value = { total: data.total || cases.value.length, note: data.resolve_note || '' }
    selectedCaseIds.value = cases.value.map((c) => c.case_id)
    ElMessage.success(`已同步 ${cases.value.length} 条用例`)
    activeTab.value = 'cases'
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || e?.message || '读取飞书失败')
  } finally {
    fetching.value = false
  }
}

const stopRunPoll = () => {
  if (runPollTimer) clearTimeout(runPollTimer)
  runPollTimer = null
}

const runProgressText = computed(() => {
  const doc = lastRun.value
  if (!doc) return ''
  const done = Number(doc.passed || 0) + Number(doc.failed || 0) + Number(doc.skipped || 0)
  return `${done}/${doc.total || 0}`
})

const finishRunUi = (doc) => {
  if (!doc) return
  resultView.value = doc.cases?.length ? 'cases' : 'list'
  if (doc.status === 'awaiting_clarification') {
    ElMessage.warning('需要人工确认登录图标位置')
    return
  }
  if (doc.failed > 0) {
    ElMessage.warning(`完成：通过 ${doc.passed}，失败 ${doc.failed}`)
  } else if (doc.status !== 'running') {
    ElMessage.success(`全部通过（${doc.passed || 0} 条）`)
  }
}

const pollActiveRun = (runId) => {
  stopRunPoll()
  activeRunId.value = runId
  const tick = async () => {
    try {
      const res = await getFeishuRun(runId)
      lastRun.value = res?.data || lastRun.value
      expandedRunId.value = runId
      await loadRunHistory()
      if (['running', 'awaiting_clarification'].includes(lastRun.value?.status)) {
        runPollTimer = setTimeout(tick, 2500)
        return
      }
      running.value = false
      activeRunId.value = ''
      finishRunUi(lastRun.value)
    } catch {
      runPollTimer = setTimeout(tick, 4000)
    }
  }
  tick()
}

const runRegression = async (onlySelected = false) => {
  if (!cases.value.length) return ElMessage.warning('请先同步飞书用例')
  const ids = onlySelected ? selectedCaseIds.value : null
  if (onlySelected && !ids?.length) return ElMessage.warning('请勾选要执行的用例')

  const sn = await openDevicePicker()
  if (!sn) return

  const device = devices.value.find((d) => d.sn === sn)
  if (!device || device.status !== 'online') {
    ElMessage.warning('所选设备不可用，请重新选择')
    return
  }

  try {
    await ElMessageBox.confirm(
      `将在 ${deviceLabel(device)} 上按顺序执行 ${ids ? ids.length : cases.value.length} 条用例。是否继续？`,
      '飞书回归',
      { type: 'warning' },
    )
  } catch {
    return
  }
  stopRunPoll()
  running.value = true
  lastRun.value = null
  selectedCaseForLog.value = null
  activeTab.value = 'result'
  resultView.value = 'cases'
  try {
    const res = await runFeishuRegression({
      app_id: props.appId,
      sn,
      platform: inferPlatform(device),
      case_ids: ids || undefined,
    })
    const doc = res?.data || null
    lastRun.value = doc
    expandedRunId.value = doc?.run_id || ''
    await loadRunHistory()
    if (doc?.status === 'running' && doc?.run_id) {
      ElMessage.info('回归任务已在后台执行，可在此查看进度')
      pollActiveRun(doc.run_id)
      return
    }
    running.value = false
    finishRunUi(doc)
  } catch (e) {
    running.value = false
    activeRunId.value = ''
    ElMessage.error(e?.response?.data?.detail || e?.message || '执行失败')
  }
}

const openHistoryRun = async (runId) => {
  try {
    const res = await getFeishuRun(runId)
    lastRun.value = res?.data || null
    expandedRunId.value = runId
    selectedCaseForLog.value = null
    resultView.value = 'cases'
    activeTab.value = 'result'
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || '加载失败')
  }
}

const selectCaseLog = (row) => {
  selectedCaseForLog.value = row
  resultView.value = 'playback'
}

const goBackInReport = () => {
  if (resultView.value === 'playback') {
    resultView.value = 'cases'
    selectedCaseForLog.value = null
    return
  }
  if (resultView.value === 'cases') {
    resultView.value = 'list'
    selectedCaseForLog.value = null
  }
}

const backLabel = computed(() => {
  if (resultView.value === 'playback') return '← 返回用例列表'
  if (resultView.value === 'cases') return '← 返回执行历史'
  return '← 返回'
})

const formatDuration = (ms) => {
  const n = Number(ms)
  if (!Number.isFinite(n) || n < 0) return ''
  if (n < 1000) return `${Math.round(n)}ms`
  const sec = n / 1000
  return sec >= 60 ? `${Math.floor(sec / 60)}m${Math.round(sec % 60)}s` : `${sec.toFixed(1)}s`
}

const statusTag = (status) => {
  const map = { pass: 'success', fail: 'danger', skip: 'info', running: 'warning' }
  return map[status] || 'info'
}

const iosOnlyCaseCount = computed(() =>
  cases.value.filter((c) => {
    const p = String(c.platform || '').toLowerCase()
    return p && !p.includes('双端') && (p.includes('ios') || p.includes('苹果'))
  }).length,
)

const loadBots = async () => {
  try {
    const res = await listRobotIntegrations()
    feishuBots.value = (res?.data?.bots || []).filter((b) => b.configured)
    credConfigured.value = feishuBots.value.length > 0
    if (!configForm.value.bot_id && feishuBots.value.length) {
      configForm.value.bot_id = feishuBots.value[0].id
    }
  } catch {
    feishuBots.value = []
    credConfigured.value = false
  }
}

const init = async () => {
  await Promise.all([loadConfig(), loadDevices(), loadBots(), loadCachedCases(), loadRunHistory()])
}

watch(() => props.appId, init)

watch(resultView, (view) => {
  const open = view !== 'list'
  reportOverlayOpen.value = open
  document.body.style.overflow = open ? 'hidden' : ''
  nextTick(() => {
    if (open) claimTitlebar(TITLEBAR_ID)
    else releaseTitlebar(TITLEBAR_ID)
  })
}, { immediate: true })

watch(activeTab, (tab) => {
  if (tab !== 'result' && !running.value) resultView.value = 'list'
})

onMounted(init)
const clearRunState = () => {
  stopRunPoll()
  running.value = false
  activeRunId.value = ''
  lastRun.value = null
  selectedCaseForLog.value = null
  expandedRunId.value = ''
  resultView.value = 'list'
}

onUnmounted(() => {
  clearRunState()
  releaseTitlebar(TITLEBAR_ID)
  document.body.style.overflow = ''
  reportOverlayOpen.value = false
})
</script>

<template>
  <div class="feishu-panel">
    <div class="toolbar">
      <el-button size="small" :loading="fetching" @click="loadCases(true)">同步用例</el-button>
      <el-button size="small" type="primary" :loading="running" @click="runRegression(false)">执行全部</el-button>
      <el-button size="small" type="warning" :loading="running" :disabled="!selectedCaseIds.length" @click="runRegression(true)">
        执行选中
      </el-button>
      <span v-if="running" class="run-progress-hint">
        执行中 {{ runProgressText }}
        <el-button link type="primary" size="small" @click="activeTab = 'result'">查看报告</el-button>
      </span>
    </div>

    <el-alert v-if="!credConfigured" type="warning" show-icon :closable="false" class="cred-alert">
      <template #default>
        请先在
        <el-link type="primary" @click="router.push({ name: 'SettingsKeys', query: { tab: 'robots' } })">设置 → 密钥配置 → 机器人</el-link>
        中添加机器人。
      </template>
    </el-alert>

    <el-tabs v-model="activeTab" class="inner-tabs">
      <el-tab-pane label="飞书配置" name="config">
        <el-form label-width="120px" style="max-width: 720px">
          <el-form-item label="飞书机器人" required>
            <el-select v-model="configForm.bot_id" placeholder="选择机器人" style="width: 100%">
              <el-option v-for="b in feishuBots" :key="b.id" :label="b.name" :value="b.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="运行环境">
            <el-select v-model="configForm.env_profile" style="width: 160px">
              <el-option v-for="p in envProfiles" :key="p" :label="p" :value="p" />
            </el-select>
          </el-form-item>
          <el-form-item label="表格链接">
            <el-input v-model="configForm.doc_url" type="textarea" :rows="2" />
          </el-form-item>
          <el-form-item label="读取范围">
            <el-input v-model="configForm.data_range" />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" :loading="loading" @click="saveConfig">保存</el-button>
          </el-form-item>
        </el-form>
      </el-tab-pane>

      <el-tab-pane :label="`用例 (${cases.length})`" name="cases">
        <p v-if="casesSyncedAt" class="sync-meta">缓存于 {{ casesSyncedAt }}</p>
        <p v-if="iosOnlyCaseCount" class="sync-meta ios-hint">
          含 {{ iosOnlyCaseCount }} 条 iOS 专用用例；当前设备为 Android 时执行将按前置条件标记为 skip。
        </p>
        <el-table
          :data="cases"
          border
          stripe
          max-height="400"
          @selection-change="(rows) => (selectedCaseIds = rows.map((r) => r.case_id))"
        >
          <el-table-column type="selection" width="48" />
          <el-table-column prop="case_id" label="编号" width="88" />
          <el-table-column prop="platform" label="端" width="72" show-overflow-tooltip />
          <el-table-column prop="name" label="名称" min-width="120" show-overflow-tooltip />
          <el-table-column label="前置条件" min-width="160" class-name="col-multiline">
            <template #default="{ row }">
              <CaseMultilineCell :row="row" raw-key="precondition" />
            </template>
          </el-table-column>
          <el-table-column label="测试步骤" min-width="200" class-name="col-multiline">
            <template #default="{ row }">
              <CaseAlignedFieldCell :row="row" field="step" />
            </template>
          </el-table-column>
          <el-table-column label="预期效果" min-width="180" class-name="col-multiline">
            <template #default="{ row }">
              <CaseAlignedFieldCell :row="row" field="expected" />
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <el-tab-pane label="执行回放" name="result">
        <div v-show="resultView === 'list'" class="result-list-view">
          <p class="list-hint">点击某次执行记录，进入已执行用例列表，再选择用例查看回放。</p>
          <el-table
            v-if="runHistory.length"
            :data="runHistory"
            border
            stripe
            size="small"
            class="full-table"
            highlight-current-row
            :row-class-name="({ row }) => (expandedRunId === row.run_id ? 'is-current-run' : '')"
            @row-click="(row) => openHistoryRun(row.run_id)"
          >
            <el-table-column prop="started_at" label="执行时间" min-width="168">
              <template #default="{ row }">
                {{ row.started_at?.slice(0, 19).replace('T', ' ') }}
              </template>
            </el-table-column>
            <el-table-column label="通过/总数" width="108">
              <template #default="{ row }">
                <el-tag :type="row.failed ? 'danger' : 'success'" size="small">
                  {{ row.passed }}/{{ row.total }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="sn" label="设备" min-width="140" show-overflow-tooltip />
            <el-table-column prop="platform" label="平台" width="88" />
            <el-table-column label="状态" width="88">
              <template #default="{ row }">
                <el-tag
                  :type="row.status === 'running' ? 'warning' : row.failed ? 'danger' : 'success'"
                  size="small"
                >
                  {{ row.status === 'running' ? '执行中' : row.failed ? '有失败' : '全通过' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="" width="88" fixed="right">
              <template #default>
                <el-button link type="primary" size="small">查看</el-button>
              </template>
            </el-table-column>
          </el-table>
          <el-empty v-else description="执行后将在此展示历史记录" />
        </div>

        <Teleport to="body">
          <div v-if="resultView !== 'list'" class="report-fullpage">
            <header class="report-fullpage-header">
              <el-button text class="portal-back-btn" @click="goBackInReport">{{ backLabel }}</el-button>
              <div class="portal-title-block">
                <template v-if="resultView === 'playback' && selectedCaseForLog">
                  <span class="portal-title">{{ selectedCaseForLog.name }}</span>
                  <span class="portal-meta">
                    {{ selectedCaseForLog.case_id }} · {{ lastRun?.sn }} ·
                    {{ formatDuration(selectedCaseForLog.duration_ms) || lastRun?.finished_at?.slice(0, 16) }}
                  </span>
                </template>
                <template v-else-if="lastRun">
                  <span class="portal-title">已执行用例</span>
                  <span class="portal-meta">
                    {{ lastRun.started_at?.slice(0, 19).replace('T', ' ') }} · {{ lastRun.sn }} ·
                    总计 {{ formatDuration(lastRun.duration_ms) || '—' }} ·
                    已执行 {{ lastRun.executed ?? lastRun.cases?.length ?? 0 }}/{{ lastRun.total }} ·
                    通过 {{ lastRun.passed }}/{{ lastRun.total }}
                    <template v-if="lastRun.skipped"> · 跳过 {{ lastRun.skipped }}</template>
                  </span>
                </template>
              </div>
              <el-tag
                v-if="resultView === 'playback' && selectedCaseForLog"
                :type="statusTag(selectedCaseForLog.status)"
                size="small"
                class="portal-status"
              >
                {{ selectedCaseForLog.status }}
              </el-tag>
            </header>
            <div v-if="resultView === 'cases'" class="report-body report-body--cases">
              <RunSummaryPanel v-if="lastRun && !running" :run="lastRun" />
              <el-alert
                v-if="running"
                type="info"
                :closable="false"
                show-icon
                class="run-live-alert"
                :title="`正在执行回归测试 ${runProgressText}`"
                description="用例完成后会实时出现在下表；可点击左侧用例查看已完成的回放。"
              />
              <el-table
                v-if="lastRun?.cases?.length"
                :data="lastRun.cases"
                border
                stripe
                class="full-table case-table"
                @row-click="selectCaseLog"
              >
                <el-table-column prop="case_id" label="编号" width="96" />
                <el-table-column prop="name" label="用例" min-width="160" show-overflow-tooltip />
                <el-table-column label="测试步骤" min-width="220" class-name="col-multiline">
                  <template #default="{ row }">
                    <CaseAlignedFieldCell :row="row" field="step" />
                  </template>
                </el-table-column>
                <el-table-column label="预期效果" min-width="180" class-name="col-multiline">
                  <template #default="{ row }">
                    <CaseAlignedFieldCell :row="row" field="expected" />
                  </template>
                </el-table-column>
                <el-table-column label="结果" width="96">
                  <template #default="{ row }">
                    <el-tag :type="statusTag(row.status)" size="small">{{ row.status }}</el-tag>
                  </template>
                </el-table-column>
                <el-table-column label="耗时" width="88">
                  <template #default="{ row }">
                    {{ formatDuration(row.duration_ms) || '—' }}
                  </template>
                </el-table-column>
                <el-table-column label="" width="88" fixed="right">
                  <template #default>
                    <el-button link type="primary" size="small">回放</el-button>
                  </template>
                </el-table-column>
              </el-table>
              <el-empty v-else description="该次执行没有用例记录" />
            </div>

            <div v-else-if="resultView === 'playback' && selectedCaseForLog" class="report-body">
              <ExecutionReplayer
                fullscreen
                :app-id="appId"
                :app-name="appName"
                :trace="selectedCaseForLog.execution_trace || []"
                :step-results="selectedCaseForLog.step_results || []"
                :case-name="selectedCaseForLog.name"
                :command="selectedCaseForLog.command"
                :steps-raw="selectedCaseForLog.steps_raw"
                :expected-raw="selectedCaseForLog.expected_raw"
                :step-lines="selectedCaseForLog.step_lines || []"
                :expected-lines="selectedCaseForLog.expected_lines || []"
                :precondition-raw="selectedCaseForLog.precondition_raw || ''"
                :case-duration-ms="selectedCaseForLog.duration_ms"
                :run-duration-ms="lastRun?.duration_ms"
              />
            </div>
          </div>
        </Teleport>
      </el-tab-pane>
    </el-tabs>

    <Teleport to="#settings-overlay-portal">
      <div v-if="titlebarOwner === TITLEBAR_ID && resultView !== 'list'" class="report-titlebar-portal">
        <el-button text class="portal-back-btn" @click="goBackInReport">{{ backLabel }}</el-button>
        <div class="portal-title-block">
          <template v-if="resultView === 'playback' && selectedCaseForLog">
            <span class="portal-title">{{ selectedCaseForLog.name }}</span>
            <span class="portal-meta">
              {{ selectedCaseForLog.case_id }} · {{ lastRun?.sn }} ·
              {{ formatDuration(selectedCaseForLog.duration_ms) || lastRun?.finished_at?.slice(0, 16) }}
            </span>
          </template>
          <template v-else-if="lastRun">
            <span class="portal-title">已执行用例</span>
            <span class="portal-meta">
              {{ lastRun.started_at?.slice(0, 19).replace('T', ' ') }} · {{ lastRun.sn }} ·
              总计 {{ formatDuration(lastRun.duration_ms) || '—' }} ·
              已执行 {{ lastRun.executed ?? lastRun.cases?.length ?? 0 }}/{{ lastRun.total }} ·
              通过 {{ lastRun.passed }}/{{ lastRun.total }}
              <template v-if="lastRun.skipped"> · 跳过 {{ lastRun.skipped }}</template>
            </span>
          </template>
        </div>
        <el-tag
          v-if="resultView === 'playback' && selectedCaseForLog"
          :type="statusTag(selectedCaseForLog.status)"
          size="small"
          class="portal-status"
        >
          {{ selectedCaseForLog.status }}
        </el-tag>
      </div>
    </Teleport>

    <el-dialog v-model="devicePickerVisible" title="选择执行设备" width="520px" destroy-on-close @close="cancelDevicePicker">
      <p class="picker-hint">从运行状态设备列表中选择在线设备（含 ClawNode / USB Hub 等）。</p>
      <el-radio-group v-model="devicePickerSn" class="device-picker-list">
        <el-radio v-for="d in pickableDevices" :key="d.sn" :value="d.sn" :disabled="d.status !== 'online'" class="device-picker-item">
          {{ deviceLabel(d) }}
        </el-radio>
      </el-radio-group>
      <template #footer>
        <el-button @click="cancelDevicePicker">取消</el-button>
        <el-button type="primary" :disabled="!devicePickerSn" @click="confirmDevicePicker">确认</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.feishu-panel { margin-top: 8px; width: 100%; }
.run-progress-hint {
  font-size: 12px;
  color: #b45309;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.run-live-alert { margin-bottom: 10px; }
.toolbar { display: flex; gap: 8px; align-items: center; margin-bottom: 12px; flex-wrap: wrap; }
.picker-hint { margin: 0 0 12px; font-size: 13px; color: #6b7280; }
.device-picker-list { display: flex; flex-direction: column; align-items: flex-start; gap: 10px; width: 100%; }
.device-picker-item { width: 100%; margin-right: 0; white-space: normal; height: auto; }
.cred-alert { margin-bottom: 12px; }
.sync-meta { font-size: 12px; color: #9ca3af; margin-bottom: 8px; }
.ios-hint { color: #b45309; }
.result-list-view { width: 100%; }
.list-hint { margin: 0 0 12px; font-size: 13px; color: #6b7280; }
.full-table { width: 100%; }
.full-table :deep(.el-table__row) { cursor: pointer; }
.full-table :deep(.is-current-run) { background: #eff6ff !important; }
.case-table { width: 100%; }
</style>

<style>
.report-titlebar-portal {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  height: 100%;
  padding: 0 16px 0 8px;
  box-sizing: border-box;
}
.report-titlebar-portal .portal-back-btn {
  flex-shrink: 0;
  font-size: 13px;
  font-weight: 600;
  color: #374151;
  padding: 6px 10px;
}
.report-titlebar-portal .portal-title-block {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
  line-height: 1.25;
}
.report-titlebar-portal .portal-title {
  font-size: 14px;
  font-weight: 700;
  color: #111827;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.report-titlebar-portal .portal-meta {
  font-size: 11px;
  color: #9ca3af;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.report-titlebar-portal .portal-status {
  flex-shrink: 0;
  margin-left: auto;
}
.report-fullpage {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  flex-direction: column;
  background: #f3f4f6;
}
.report-fullpage-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 52px;
  padding: 0 16px 0 8px;
  border-bottom: 1px solid #e5e7eb;
  background: #fff;
  box-sizing: border-box;
}
.report-body {
  flex: 1;
  min-height: 0;
  height: 100%;
  padding: 8px 12px 10px;
  overflow: hidden;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
}
.report-body--cases {
  overflow: auto;
  padding: 16px 24px 24px;
}
.report-body .replayer {
  flex: 1;
  height: 100%;
  min-height: 0;
  border: none;
  padding: 8px;
}
:deep(.el-table .col-multiline .cell) {
  white-space: normal;
  line-height: 1.5;
  align-items: flex-start;
}
</style>
