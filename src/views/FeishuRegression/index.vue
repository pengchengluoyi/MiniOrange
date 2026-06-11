<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { listFeishuBots } from '@/api/settings'
import {
  getFeishuConfig,
  updateFeishuConfig,
  fetchFeishuCases,
  getFeishuCasesCached,
  runFeishuRegression,
  getFeishuRun,
  listFeishuRuns,
  clarifyFeishuRun,
} from '@/api/feishuRegression'
import { getDeviceList } from '@/api/device'
import { wsGetDeviceList } from '@/api/wsAppGraph'
import { initWebSocket } from '@/api/mWebSocket'
import { getBaseUrl } from '@/utils/config'
import CaseMultilineCell from '@/components/CaseMultilineCell.vue'
import CaseAlignedFieldCell from '@/components/CaseAlignedFieldCell.vue'
import ExecutionReplayer from '@/components/ExecutionReplayer.vue'

const staticBase = getBaseUrl()
const imgUrl = (path) => {
  if (!path) return ''
  if (path.startsWith('http')) return path
  return `${staticBase}${path}`
}

const route = useRoute()
const router = useRouter()
const appId = computed(() => route.params.appId)
const appName = computed(() => route.query.appName || '应用')

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
const selectedSn = ref('')

const lastRun = ref(null)
const runHistory = ref([])
const selectedCaseForLog = ref(null)
const expandedRunId = ref('')
const clarifyVisible = ref(false)
const clarifySubmitting = ref(false)
const clarifyForm = ref({ option_id: '', note: '' })

function normalizeDevices(res) {
  const list = Array.isArray(res) ? res : res?.data || res?.data?.devices || []
  return list.filter((d) => d.status === 'online')
}

const passCount = computed(() => lastRun.value?.passed ?? 0)
const failCount = computed(() => lastRun.value?.failed ?? 0)

const loadConfig = async () => {
  const res = await getFeishuConfig(appId.value)
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
    const res = await getFeishuCasesCached(appId.value, false)
    const data = res?.data || {}
    if (data.cases?.length) {
      cases.value = data.cases
      casesSyncedAt.value = data.synced_at || ''
      sheetMeta.value = { total: data.total, fromCache: data.from_cache }
      selectedCaseIds.value = cases.value.map((c) => c.case_id)
    }
  } catch {
    /* 无缓存时忽略 */
  }
}

const loadRunHistory = async () => {
  try {
    const res = await listFeishuRuns(appId.value)
    runHistory.value = res?.data?.runs || []
  } catch {
    runHistory.value = []
  }
}

const loadDevices = async () => {
  try {
    let list = []
    try {
      const res = await wsGetDeviceList()
      list = normalizeDevices(res)
    } catch {
      initWebSocket()
      const res = await getDeviceList()
      list = normalizeDevices(res)
    }
    devices.value =
      list.filter((d) => ['android', 'ios', 'mobile'].includes(String(d.type || '').toLowerCase())) || list
    if (!selectedSn.value && devices.value.length) {
      selectedSn.value = (devices.value.find((d) => d.type === 'android') || devices.value[0]).sn
    }
  } catch {
    devices.value = []
  }
}

const saveConfig = async () => {
  if (!configForm.value.bot_id) {
    ElMessage.warning('请选择飞书机器人')
    return
  }
  if (!configForm.value.doc_url?.trim()) {
    ElMessage.warning('请填写飞书表格链接')
    return
  }
  loading.value = true
  try {
    await updateFeishuConfig(appId.value, configForm.value)
    ElMessage.success('配置已保存')
    await loadConfig()
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || e?.message || '保存失败')
  } finally {
    loading.value = false
  }
}

const loadCases = async (refresh = true) => {
  if (!configForm.value.bot_id) {
    ElMessage.warning('请先选择飞书机器人并保存配置')
    return
  }
  fetching.value = true
  try {
    const res = refresh
      ? await fetchFeishuCases(appId.value)
      : await getFeishuCasesCached(appId.value, true)
    const data = res?.data || {}
    cases.value = data.cases || []
    casesSyncedAt.value = data.cached_at || data.synced_at || new Date().toISOString()
    const resolveNote = data.resolve_note || ''
    sheetMeta.value = { total: data.total || cases.value.length, note: resolveNote }
    selectedCaseIds.value = cases.value.map((c) => c.case_id)
    ElMessage.success(
      resolveNote
        ? `已同步 ${cases.value.length} 条用例到服务端（${resolveNote}）`
        : `已同步 ${cases.value.length} 条用例到服务端`,
    )
    activeTab.value = 'cases'
  } catch (e) {
    const detail = e?.response?.data?.detail || e?.data?.detail || e?.message || '读取飞书失败'
    ElMessage.error(typeof detail === 'string' ? detail : JSON.stringify(detail))
  } finally {
    fetching.value = false
  }
}

const runRegression = async (onlySelected = false) => {
  if (!selectedSn.value) {
    ElMessage.warning('请选择执行设备')
    return
  }
  if (!cases.value.length) {
    ElMessage.warning('请先读取飞书用例')
    return
  }
  const ids = onlySelected ? selectedCaseIds.value : null
  if (onlySelected && !ids?.length) {
    ElMessage.warning('请勾选要执行的用例')
    return
  }

  try {
    await ElMessageBox.confirm(
      `将按顺序执行 ${ids ? ids.length : cases.value.length} 条用例（当前应用保持前台）。是否继续？`,
      '飞书回归执行',
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
  try {
    const res = await runFeishuRegression({
      app_id: appId.value,
      sn: selectedSn.value,
      platform: 'android',
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
    handleRunResult(doc)
  } catch (e) {
    running.value = false
    ElMessage.error(e?.response?.data?.detail || e?.message || '执行失败')
  }
}

const openHistoryRun = async (runId) => {
  try {
    const res = await getFeishuRun(runId)
    lastRun.value = res?.data || null
    expandedRunId.value = runId
    if (lastRun.value?.cases?.length) {
      selectedCaseForLog.value = lastRun.value.cases[0]
    }
    activeTab.value = 'result'
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || '加载执行记录失败')
  }
}

const selectCaseLog = (row) => {
  selectedCaseForLog.value = row
}

let runPollTimer = null

const stopRunPoll = () => {
  if (runPollTimer) clearTimeout(runPollTimer)
  runPollTimer = null
}

const pollActiveRun = (runId) => {
  stopRunPoll()
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
      handleRunResult(lastRun.value)
    } catch {
      runPollTimer = setTimeout(tick, 4000)
    }
  }
  tick()
}

const clearRunState = () => {
  stopRunPoll()
  running.value = false
  lastRun.value = null
  selectedCaseForLog.value = null
  expandedRunId.value = ''
}

const statusTag = (status) => {
  const map = {
    pass: 'success',
    fail: 'danger',
    skip: 'info',
    running: 'warning',
    awaiting_clarification: 'warning',
  }
  return map[status] || 'info'
}

const pendingClarification = computed(() => lastRun.value?.pending_clarification || null)

const openClarifyDialog = () => {
  const pending = pendingClarification.value
  if (!pending) return
  clarifyForm.value = {
    option_id: pending.options?.[0]?.id || '',
    note: '',
  }
  clarifyVisible.value = true
}

const handleRunResult = (doc) => {
  if (!doc || doc.status === 'running') return
  lastRun.value = doc
  expandedRunId.value = doc?.run_id || ''
  if (doc?.cases?.length) {
    const paused = doc.cases.find((c) => c.status === 'awaiting_clarification')
    selectedCaseForLog.value = paused || doc.cases[doc.cases.length - 1]
  }
  if (doc?.status === 'awaiting_clarification') {
    ElMessage.warning('需要人工确认登录图标位置')
    openClarifyDialog()
    return
  }
  if (doc?.failed > 0) {
    ElMessage.warning(`完成：通过 ${doc.passed}，失败 ${doc.failed}`)
  } else {
    ElMessage.success(`全部通过（${doc?.passed || 0} 条）`)
  }
}

const submitClarification = async () => {
  const runId = lastRun.value?.run_id
  const pending = pendingClarification.value
  if (!runId || !pending) return
  if (!clarifyForm.value.option_id && !pending.options?.length) {
    ElMessage.warning('请选择图标或先在图标库标定坐标')
    return
  }
  clarifySubmitting.value = true
  try {
    const res = await clarifyFeishuRun(runId, {
      option_id: clarifyForm.value.option_id,
      note: clarifyForm.value.note || '',
    })
    clarifyVisible.value = false
    handleRunResult(res?.data || null)
    await loadRunHistory()
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || e?.message || '确认失败')
  } finally {
    clarifySubmitting.value = false
  }
}

const goBack = () => router.push({ name: 'AppList' })
const goAutomation = () =>
  router.push({
    name: 'SettingsAppConfig',
    params: { appId: appId.value, section: 'env' },
    query: { appName: appName.value },
  })

const loadBots = async () => {
  try {
    const res = await listFeishuBots()
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

onMounted(async () => {
  await Promise.all([loadConfig(), loadDevices(), loadBots(), loadCachedCases(), loadRunHistory()])
})

onBeforeUnmount(clearRunState)
</script>

<template>
  <div class="feishu-regression">
    <header class="page-header">
      <div>
        <el-button text @click="goBack">← 配置中心</el-button>
        <h1>飞书用例回归</h1>
        <p>{{ appName }} · 用例存服务端 · 按应用环境执行 · 完整执行日志</p>
      </div>
      <div class="header-actions">
        <el-button @click="goAutomation">应用配置</el-button>
        <el-select v-model="selectedSn" placeholder="执行设备" style="width: 200px" size="small">
          <el-option v-for="d in devices" :key="d.sn" :label="`${d.name || d.sn} (${d.type})`" :value="d.sn" />
        </el-select>
        <el-button :loading="fetching" @click="loadCases(true)">同步飞书用例</el-button>
        <el-button type="primary" :loading="running" @click="runRegression(false)">顺序执行全部</el-button>
        <el-button type="warning" :loading="running" :disabled="!selectedCaseIds.length" @click="runRegression(true)">
          执行选中
        </el-button>
      </div>
    </header>

    <el-alert v-if="!credConfigured" type="warning" show-icon :closable="false" title="未配置飞书机器人" class="cred-alert">
      <template #default>
        请先在
        <el-link type="primary" @click="router.push({ name: 'SettingsFeishu' })">
          设置 → 飞书机器人
        </el-link>
        中添加机器人。
      </template>
    </el-alert>

    <el-tabs v-model="activeTab" class="main-tabs">
      <el-tab-pane label="飞书配置" name="config">
        <el-card shadow="never" class="panel-card">
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
              <span class="hint inline">与项目环境配置 Profile 关联，决定 Android 包名</span>
            </el-form-item>
            <el-form-item label="表格链接">
              <el-input v-model="configForm.doc_url" type="textarea" :rows="2" placeholder="飞书表格 URL" />
            </el-form-item>
            <el-form-item label="读取范围">
              <el-input v-model="configForm.data_range" placeholder="A1:O500" />
            </el-form-item>
            <el-form-item label="Sheet ID">
              <el-input v-model="configForm.sheet_id" placeholder="可留空自动解析" />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" :loading="loading" @click="saveConfig">保存关联</el-button>
            </el-form-item>
          </el-form>
        </el-card>
      </el-tab-pane>

      <el-tab-pane :label="`用例列表 (${cases.length})`" name="cases">
        <p v-if="casesSyncedAt" class="sync-meta">服务端缓存 · 同步于 {{ casesSyncedAt }}</p>
        <el-table
          :data="cases"
          border
          stripe
          max-height="480"
          @selection-change="(rows) => (selectedCaseIds = rows.map((r) => r.case_id))"
        >
          <el-table-column type="selection" width="48" />
          <el-table-column prop="case_id" label="编号" width="100" />
          <el-table-column prop="platform" label="端" width="72" show-overflow-tooltip />
          <el-table-column prop="module" label="模块" width="90" />
          <el-table-column prop="name" label="用例名称" min-width="140" show-overflow-tooltip />
          <el-table-column label="前置条件" min-width="160" class-name="col-multiline">
            <template #default="{ row }">
              <CaseMultilineCell :row="row" raw-key="precondition" />
            </template>
          </el-table-column>
          <el-table-column label="步骤" min-width="200" class-name="col-multiline">
            <template #default="{ row }">
              <CaseAlignedFieldCell :row="row" field="step" />
            </template>
          </el-table-column>
          <el-table-column label="预期" min-width="180" class-name="col-multiline">
            <template #default="{ row }">
              <CaseAlignedFieldCell :row="row" field="expected" />
            </template>
          </el-table-column>
        </el-table>
        <p v-if="!cases.length" class="empty-hint">点击「同步飞书用例」写入服务端</p>
      </el-tab-pane>

      <el-tab-pane label="执行结果" name="result">
        <div v-if="lastRun" class="run-summary">
          <el-tag type="success">通过 {{ passCount }}</el-tag>
          <el-tag type="danger" style="margin-left: 8px">失败 {{ failCount }}</el-tag>
          <el-tag
            v-if="lastRun.status === 'awaiting_clarification'"
            type="warning"
            style="margin-left: 8px"
          >
            等待人工确认
          </el-tag>
          <el-button
            v-if="lastRun.status === 'awaiting_clarification'"
            type="primary"
            size="small"
            style="margin-left: 12px"
            @click="openClarifyDialog"
          >
            回答确认问题
          </el-button>
          <span class="run-meta">
            {{ lastRun.package || '—' }} · 设备 {{ lastRun.sn }} · Profile {{ lastRun.env_profile }} ·
            {{ lastRun.finished_at || '进行中' }}
          </span>
        </div>

        <div v-if="runHistory.length" class="history-bar">
          <span class="history-label">历史执行：</span>
          <el-button
            v-for="r in runHistory.slice(0, 8)"
            :key="r.run_id"
            size="small"
            :type="expandedRunId === r.run_id ? 'primary' : 'default'"
            link
            @click="openHistoryRun(r.run_id)"
          >
            {{ r.started_at?.slice(0, 16) }} ({{ r.passed }}/{{ r.total }})
          </el-button>
        </div>

        <el-row v-if="lastRun?.cases?.length" :gutter="12" class="result-layout">
          <el-col :span="10">
            <el-table
              :data="lastRun.cases"
              border
              stripe
              highlight-current-row
              max-height="520"
              @row-click="selectCaseLog"
            >
              <el-table-column prop="case_id" label="编号" width="88" />
              <el-table-column prop="name" label="用例" min-width="100" show-overflow-tooltip />
              <el-table-column label="结果" width="72">
                <template #default="{ row }">
                  <el-tag :type="statusTag(row.status)" size="small">{{ row.status }}</el-tag>
                </template>
              </el-table-column>
            </el-table>
          </el-col>
          <el-col :span="14">
            <div v-if="selectedCaseForLog" class="replayer-wrap">
              <ExecutionReplayer
                :app-id="String(appId)"
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
            <el-empty v-else description="点击左侧用例查看执行回放" />
          </el-col>
        </el-row>
        <el-empty v-else description="执行后将展示 Midscene 风格的步骤拆解与动作日志（存服务端）" />
      </el-tab-pane>
    </el-tabs>

    <el-dialog
      v-model="clarifyVisible"
      title="执行确认"
      width="640px"
      :close-on-click-modal="false"
    >
      <template v-if="pendingClarification">
        <p class="clarify-question">{{ pendingClarification.question }}</p>
        <p v-if="pendingClarification.case_name" class="clarify-meta">
          用例：{{ pendingClarification.case_name }} · {{ pendingClarification.step_text }}
        </p>
        <img
          v-if="pendingClarification.screenshot"
          :src="imgUrl(pendingClarification.screenshot)"
          loading="lazy"
          decoding="async"
          class="clarify-shot"
          alt="当前屏幕"
        />
        <el-radio-group v-if="pendingClarification.options?.length" v-model="clarifyForm.option_id">
          <el-radio
            v-for="opt in pendingClarification.options"
            :key="opt.id"
            :value="opt.id"
            class="clarify-option"
          >
            {{ opt.label }}（中心约 {{ opt.center?.[0] }}, {{ opt.center?.[1] }}）
          </el-radio>
        </el-radio-group>
        <el-alert
          v-else
          type="info"
          :closable="false"
          show-icon
          title="未扫描到底部图标行，请根据截图在「应用配置 → 无字图标」中手动标定后重试。"
          style="margin: 12px 0"
        />
        <el-input
          v-model="clarifyForm.note"
          type="textarea"
          :rows="3"
          placeholder="补充说明（可选），将写入应用知识库供后续复用"
          style="margin-top: 12px"
        />
      </template>
      <template #footer>
        <el-button @click="clarifyVisible = false">稍后处理</el-button>
        <el-button
          type="primary"
          :loading="clarifySubmitting"
          :disabled="!pendingClarification?.options?.length && !clarifyForm.option_id"
          @click="submitClarification"
        >
          确认并继续执行
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.feishu-regression {
  max-width: 1320px;
  margin: 0 auto;
  padding: 24px 32px 48px;
  background: #f9fafb;
  min-height: 100%;
}
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 20px;
}
.page-header h1 {
  margin: 8px 0 4px;
  font-size: 24px;
  font-weight: 700;
  color: #111827;
}
.page-header p {
  margin: 0;
  color: #6b7280;
  font-size: 13px;
}
.header-actions {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
.panel-card {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}
.cred-alert {
  margin-bottom: 16px;
}
.hint,
.empty-hint {
  color: #6b7280;
  font-size: 13px;
  margin-top: 12px;
}
.hint.inline {
  margin-left: 12px;
  margin-top: 0;
}
.sync-meta {
  font-size: 12px;
  color: #9ca3af;
  margin-bottom: 8px;
}
.clarify-question {
  white-space: pre-wrap;
  line-height: 1.6;
  color: #374151;
  margin: 0 0 8px;
}
.clarify-meta {
  font-size: 12px;
  color: #6b7280;
  margin: 0 0 12px;
}
.clarify-shot {
  max-width: 100%;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  margin-bottom: 12px;
}
.clarify-option {
  display: block;
  margin: 8px 0;
}
.run-summary {
  margin-bottom: 12px;
}
.run-meta {
  margin-left: 12px;
  color: #9ca3af;
  font-size: 12px;
}
.history-bar {
  margin-bottom: 12px;
  font-size: 12px;
}
.history-label {
  color: #6b7280;
  margin-right: 8px;
}
.result-layout {
  margin-top: 8px;
}
.replayer-wrap {
  min-height: 520px;
  max-height: 72vh;
  overflow: hidden;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #0f172a;
}
.exec-log-panel {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 16px;
  max-height: 560px;
  overflow-y: auto;
}
.log-title {
  margin: 0 0 8px;
  font-size: 15px;
  font-weight: 600;
}
.log-command {
  font-size: 12px;
  color: #4b5563;
  margin-bottom: 16px;
  word-break: break-all;
}
.trace-block {
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid #f3f4f6;
}
.trace-head {
  margin-bottom: 8px;
}
.trace-phase {
  font-weight: 600;
  font-size: 13px;
  color: #111827;
}
.trace-cmd {
  display: block;
  font-size: 12px;
  color: #6b7280;
  margin-top: 4px;
}
.log-entry {
  font-size: 12px;
  line-height: 1.6;
  padding: 4px 0 4px 8px;
  border-left: 2px solid #e5e7eb;
  margin-left: 4px;
  margin-bottom: 4px;
}
.log-entry.plan {
  border-left-color: #93c5fd;
}
.log-entry.fail {
  border-left-color: #fca5a5;
}
.log-type {
  font-weight: 600;
  margin-right: 8px;
  color: #374151;
}
.log-msg {
  color: #6b7280;
  padding-left: 52px;
}
.muted {
  color: #9ca3af;
  margin-left: 6px;
}
code {
  font-size: 11px;
  background: #f3f4f6;
  padding: 1px 4px;
  border-radius: 3px;
}
.step-line {
  font-size: 12px;
  line-height: 1.5;
}
.empty-log {
  font-size: 12px;
  color: #9ca3af;
}
.log-shot {
  display: block;
  max-width: 220px;
  margin: 8px 0 8px 8px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
}
.timing {
  color: #2563eb;
  font-weight: 600;
  margin-left: 6px;
}
:deep(.el-table .col-multiline .cell) {
  white-space: normal;
  line-height: 1.5;
  align-items: flex-start;
}
</style>
