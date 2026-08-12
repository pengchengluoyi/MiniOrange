<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  runCaseRunner,
  getCaseRunnerRun,
  listCaseRunnerRuns,
  listCaseRunnerTraces,
  getCaseRunnerTraceDetail,
  getCaseRunnerBaseline,
  promoteCaseRunnerBaseline,
  listCaseRunnerDevices,
} from '@/api/caseRunner'
import { getFeishuCasesCached } from '@/api/feishuRegression'
import { listAIProviders } from '@/api/settings'

const props = defineProps({
  appId: { type: String, required: true },
  appName: { type: String, default: '应用' },
  embedded: { type: Boolean, default: true },
})

// ============== state ==============

const activeTab = ref('run')

// 共享：设备列表 + provider 列表（运行 + Baseline 都要用）
const devices = ref([])
const devicesLoading = ref(false)
const providers = ref([])
const providersLoading = ref(false)

// 运行 tab
const cases = ref([])
const casesLoading = ref(false)
const selectedCaseIds = ref([])
const runForm = ref({
  sn: '',
  platform: 'android',
  use_persisted_baseline: true,
  use_cache: true,
  async_exec: true,
})
const submitting = ref(false)
const lastSubmittedRunId = ref('')

// 执行历史 tab
const runsInMemory = ref([])
const runsLoading = ref(false)
const focusedRun = ref(null)        // 选中的 run 详情（含 per-case 摘要）
const drawerVisible = ref(false)
let runPollTimer = null

// Trace tab
const traceFilter = ref({
  caseId: '',
  onlyPass: false,
})
const traceList = ref([])
const traceListLoading = ref(false)
const traceDetail = ref(null)
const traceDetailLoading = ref(false)
const expandedEventSeqs = ref(new Set())

// Baseline tab
const baselineForm = ref({
  caseId: '',
  sn: '',
  deviceSignature: '',
})
const baselineData = ref(null)
const baselineLoading = ref(false)

// ============== helpers ==============

const channelLabel = (state) => {
  switch (state) {
    case 'connected': return '已连'
    case 'online': return '在线'
    case 'available': return '可用'
    case 'unauthorized': return '未授权'
    case 'disconnected': return '断开'
    case 'offline': return '离线'
    case 'unavailable': return '不可用'
    case 'not_applicable': return '不适用'
    default: return state || '?'
  }
}

const channelTagType = (state) => {
  if (['connected', 'online', 'available'].includes(state)) return 'success'
  if (['unauthorized'].includes(state)) return 'warning'
  if (['disconnected', 'offline', 'unavailable'].includes(state)) return 'danger'
  return 'info'
}

const statusTagType = (s) => {
  if (s === 'pass') return 'success'
  if (s === 'fail') return 'danger'
  if (s === 'blocked') return 'warning'
  if (s === 'declined') return 'info'
  if (s === 'running') return 'primary'
  if (s === 'done') return 'success'
  if (s === 'failed') return 'danger'
  return 'info'
}

const fmtTs = (s) => {
  if (!s) return '—'
  return String(s).replace('T', ' ').slice(0, 19)
}

const caseExecutionProvider = computed(() => {
  const list = Array.isArray(providers.value) ? providers.value : []
  return list.find((p) => p.configured && p.enabled !== false && p.case_execution_use === true) || null
})

const caseExecutionModelLabel = computed(() => {
  const p = caseExecutionProvider.value
  if (!p) return '未配置（请到密钥配置 → 大模型 Key，开启「可用」并勾选「用例」）'
  const model = p.model || '默认模型'
  return `${p.name || p.id} · ${model}`
})

// ============== loaders ==============

const loadDevices = async () => {
  devicesLoading.value = true
  try {
    const res = await listCaseRunnerDevices(false)
    devices.value = res?.data?.items || []
  } catch (e) {
    console.warn('listCaseRunnerDevices failed', e)
  } finally {
    devicesLoading.value = false
  }
}

const loadProviders = async () => {
  providersLoading.value = true
  try {
    const res = await listAIProviders()
    providers.value = res?.data?.providers || []
  } catch (e) {
    console.warn('listAIProviders failed', e)
  } finally {
    providersLoading.value = false
  }
}

const loadCases = async () => {
  if (!props.appId) return
  casesLoading.value = true
  try {
    const res = await getFeishuCasesCached(props.appId, false)
    cases.value = res?.data?.cases || []
  } catch (e) {
    console.warn('getFeishuCasesCached failed', e)
    ElMessage.warning('未拉到用例，请先在「飞书回归」面板抓取一次表格')
  } finally {
    casesLoading.value = false
  }
}

const loadRunsInMemory = async () => {
  runsLoading.value = true
  try {
    const res = await listCaseRunnerRuns(30)
    runsInMemory.value = res?.data?.runs || []
  } finally {
    runsLoading.value = false
  }
}

const loadFocusedRun = async (runId) => {
  if (!runId) return
  try {
    const res = await getCaseRunnerRun(runId)
    focusedRun.value = res?.data || null
    drawerVisible.value = !!focusedRun.value
    if (focusedRun.value?.status === 'running') {
      schedulePoll(runId)
    } else {
      cancelPoll()
    }
  } catch (e) {
    ElMessage.error(`无法读取 run: ${e}`)
  }
}

const closeDrawer = () => {
  drawerVisible.value = false
  focusedRun.value = null
  cancelPoll()
}

const schedulePoll = (runId) => {
  cancelPoll()
  runPollTimer = setTimeout(() => loadFocusedRun(runId), 2500)
}
const cancelPoll = () => {
  if (runPollTimer) {
    clearTimeout(runPollTimer)
    runPollTimer = null
  }
}

const loadTraceList = async () => {
  traceListLoading.value = true
  try {
    const res = await listCaseRunnerTraces({
      caseId: traceFilter.value.caseId || undefined,
      onlyPass: traceFilter.value.onlyPass,
      limit: 30,
    })
    traceList.value = res?.data?.items || []
  } finally {
    traceListLoading.value = false
  }
}

const loadTraceDetail = async (runId) => {
  if (!runId) return
  traceDetailLoading.value = true
  expandedEventSeqs.value = new Set()
  try {
    const res = await getCaseRunnerTraceDetail(runId)
    traceDetail.value = res?.data || null
  } catch (e) {
    ElMessage.error(`无法读取 trace 详情: ${e}`)
  } finally {
    traceDetailLoading.value = false
  }
}

const loadBaseline = async () => {
  const cid = (baselineForm.value.caseId || '').trim()
  if (!cid) {
    ElMessage.warning('请先填 case_id')
    return
  }
  baselineLoading.value = true
  try {
    const res = await getCaseRunnerBaseline(cid, {
      sn: baselineForm.value.sn,
      deviceSignature: baselineForm.value.deviceSignature,
    })
    baselineData.value = res?.data || null
  } finally {
    baselineLoading.value = false
  }
}

// ============== actions ==============

const submitRun = async () => {
  if (!runForm.value.sn) {
    ElMessage.warning('请先选择设备')
    return
  }
  if (!selectedCaseIds.value.length) {
    ElMessage.warning('请至少选择一条用例')
    return
  }
  submitting.value = true
  try {
    const res = await runCaseRunner({
      app_id: props.appId,
      sn: runForm.value.sn,
      platform: runForm.value.platform,
      case_ids: selectedCaseIds.value,
      async_exec: runForm.value.async_exec,
      use_persisted_baseline: runForm.value.use_persisted_baseline,
      use_cache: runForm.value.use_cache,
    })
    const runId = res?.data?.run_id
    if (runId) {
      lastSubmittedRunId.value = runId
      ElMessage.success(`已启动 run ${runId}`)
      activeTab.value = 'runs'
      await loadRunsInMemory()
      await loadFocusedRun(runId)
    } else {
      ElMessage.error('启动失败：未拿到 run_id')
    }
  } catch (e) {
    ElMessage.error(`启动失败: ${e?.message || e}`)
  } finally {
    submitting.value = false
  }
}

const promoteTrace = async (runId) => {
  if (!runId) return
  try {
    const note = await ElMessageBox.prompt(
      `把 run ${runId} 提升为 baseline 的备注（可空）`,
      '手工 promote',
      { confirmButtonText: '确认 promote', cancelButtonText: '取消', inputValue: '' },
    )
    await promoteCaseRunnerBaseline({
      run_id: runId,
      blessed_by: 'manual',
      notes: note?.value || '',
    })
    ElMessage.success('已提升为 baseline')
    if (activeTab.value === 'baseline' && baselineForm.value.caseId) await loadBaseline()
    if (activeTab.value === 'trace') await loadTraceList()
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(`promote 失败: ${e?.message || e}`)
  }
}

const toggleEvent = (seq) => {
  const next = new Set(expandedEventSeqs.value)
  if (next.has(seq)) next.delete(seq); else next.add(seq)
  expandedEventSeqs.value = next
}

// ============== watchers / mounted ==============

watch(activeTab, (tab) => {
  if (tab === 'runs') loadRunsInMemory()
  if (tab === 'trace' && !traceList.value.length) loadTraceList()
})

const selectedDevice = computed(() =>
  devices.value.find((d) => d.sn === runForm.value.sn) || null,
)

onMounted(async () => {
  await Promise.all([loadDevices(), loadProviders(), loadCases()])
})
</script>

<template>
  <div class="case-runner-panel">
    <el-tabs v-model="activeTab" class="cr-tabs">
      <!-- ============== 运行 ============== -->
      <el-tab-pane label="运行" name="run">
        <el-card shadow="never" class="cr-card">
          <template #header>
            <div class="cr-card-head">
              <span>AI-led 回归 · {{ appName }}</span>
              <el-button size="small" @click="loadCases" :loading="casesLoading">刷新用例</el-button>
            </div>
          </template>

          <el-form label-width="100px" size="default" class="cr-form">
            <el-form-item label="设备 SN">
              <el-select
                v-model="runForm.sn"
                placeholder="选择在线设备"
                style="width: 460px"
                :loading="devicesLoading"
              >
                <el-option
                  v-for="d in devices"
                  :key="d.sn"
                  :value="d.sn"
                  :label="`${d.model || d.sn} · ${d.sn}`"
                >
                  <span style="float:left">{{ d.model || d.sn }}</span>
                  <span style="float:right; color: var(--el-text-color-secondary); font-size:12px">
                    <el-tag size="small" :type="channelTagType(d.channels?.adb_state)" effect="plain">
                      adb {{ channelLabel(d.channels?.adb_state) }}
                    </el-tag>
                    <el-tag size="small" :type="channelTagType(d.channels?.remote_state)" effect="plain" style="margin-left:4px">
                      remote {{ channelLabel(d.channels?.remote_state) }}
                    </el-tag>
                  </span>
                </el-option>
              </el-select>
              <el-button size="small" link @click="loadDevices">刷新</el-button>
              <div v-if="selectedDevice" class="cr-hint">
                {{ selectedDevice.model }} · {{ selectedDevice.os_version }} · {{ selectedDevice.resolution }}
              </div>
            </el-form-item>

            <el-form-item label="执行模型">
              <span :class="caseExecutionProvider ? 'cr-hint' : 'cr-error'">{{ caseExecutionModelLabel }}</span>
              <el-button size="small" link :loading="providersLoading" @click="loadProviders">刷新</el-button>
            </el-form-item>

            <el-form-item label="复用 baseline">
              <el-switch v-model="runForm.use_persisted_baseline" />
              <span class="cr-hint">关闭则忽略历史 baseline，全 AI 重新规划</span>
            </el-form-item>

            <el-form-item label="后台执行">
              <el-switch v-model="runForm.async_exec" />
              <span class="cr-hint">关闭则同步阻塞（仅调试用）</span>
            </el-form-item>

            <el-form-item :label="`用例（${selectedCaseIds.length}/${cases.length}）`">
              <div class="cr-case-picker">
                <div class="cr-case-toolbar">
                  <el-button size="small" @click="selectedCaseIds = cases.map(c => c.case_id)">全选</el-button>
                  <el-button size="small" @click="selectedCaseIds = []">清空</el-button>
                </div>
                <el-checkbox-group v-model="selectedCaseIds">
                  <div v-for="c in cases" :key="c.case_id" class="cr-case-row">
                    <el-checkbox :value="c.case_id">
                      <span class="mono">{{ c.case_id }}</span> ·
                      <span>{{ c.name || '(未命名)' }}</span>
                      <el-tag v-if="c.module" size="small" effect="plain" style="margin-left:6px">{{ c.module }}</el-tag>
                    </el-checkbox>
                  </div>
                </el-checkbox-group>
                <el-empty v-if="!cases.length && !casesLoading" description="未拉到用例，先到飞书面板抓一次" />
              </div>
            </el-form-item>

            <el-form-item>
              <el-button type="primary" :loading="submitting" @click="submitRun">开始 AI-led 执行</el-button>
              <el-button v-if="lastSubmittedRunId" @click="activeTab = 'runs'; loadFocusedRun(lastSubmittedRunId)">
                查看 {{ lastSubmittedRunId }} 进度
              </el-button>
            </el-form-item>
          </el-form>
        </el-card>
      </el-tab-pane>

      <!-- ============== 执行历史 ============== -->
      <el-tab-pane label="执行历史" name="runs">
        <el-card shadow="never" class="cr-card">
          <template #header>
            <div class="cr-card-head">
              <span>最近 in-flight runs（内存，重启进程清空）</span>
              <el-button size="small" @click="loadRunsInMemory" :loading="runsLoading">刷新</el-button>
            </div>
          </template>
          <el-table :data="runsInMemory" size="small" border @row-click="(row) => loadFocusedRun(row.run_id)">
            <el-table-column label="run_id" prop="run_id" width="180">
              <template #default="{ row }">
                <span class="mono">{{ row.run_id }}</span>
              </template>
            </el-table-column>
            <el-table-column label="状态" width="100">
              <template #default="{ row }">
                <el-tag :type="statusTagType(row.status)">{{ row.status }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="进度" width="120">
              <template #default="{ row }">
                {{ row.completed }}/{{ row.total }} (P{{ row.passed }} F{{ row.failed }} B{{ row.blocked }})
              </template>
            </el-table-column>
            <el-table-column label="sn" prop="sn" width="160" />
            <el-table-column label="模型" min-width="200">
              <template #default="{ row }">
                <span v-if="row.provider_name || row.model_name">
                  {{ row.provider_name || row.provider_id }} · {{ row.model_name || '默认' }}
                </span>
                <span v-else class="cr-hint">—</span>
              </template>
            </el-table-column>
            <el-table-column label="开始时间" prop="started_at" width="160">
              <template #default="{ row }">{{ fmtTs(row.started_at) }}</template>
            </el-table-column>
            <el-table-column label="结束时间" prop="finished_at" width="160">
              <template #default="{ row }">{{ fmtTs(row.finished_at) }}</template>
            </el-table-column>
          </el-table>
          <el-empty v-if="!runsInMemory.length && !runsLoading" description="还没有 in-flight run" />
        </el-card>

        <el-drawer v-model="drawerVisible" direction="rtl" size="60%" :with-header="false" :show-close="false" @close="cancelPoll">
          <div v-if="focusedRun" class="cr-run-detail">
            <div class="cr-card-head">
              <span><b>{{ focusedRun.run_id }}</b> · {{ focusedRun.app_name }}</span>
              <el-button size="small" @click="closeDrawer">关闭</el-button>
            </div>
            <el-descriptions :column="3" border size="small" class="cr-descriptions">
              <el-descriptions-item label="状态">
                <el-tag :type="statusTagType(focusedRun.status)">{{ focusedRun.status }}</el-tag>
              </el-descriptions-item>
              <el-descriptions-item label="sn">{{ focusedRun.sn }}</el-descriptions-item>
              <el-descriptions-item label="执行模型">
                {{ focusedRun.provider_name || focusedRun.provider_id || '—' }}
                <span v-if="focusedRun.model_name"> · {{ focusedRun.model_name }}</span>
              </el-descriptions-item>
              <el-descriptions-item label="adb 通道">
                <el-tag :type="channelTagType(focusedRun.connectivity?.channels?.adb?.state)" size="small">
                  {{ channelLabel(focusedRun.connectivity?.channels?.adb?.state) }}
                </el-tag>
              </el-descriptions-item>
              <el-descriptions-item label="remote 通道">
                <el-tag :type="channelTagType(focusedRun.connectivity?.channels?.remote?.state)" size="small">
                  {{ channelLabel(focusedRun.connectivity?.channels?.remote?.state) }}
                </el-tag>
              </el-descriptions-item>
              <el-descriptions-item label="设备指纹">
                <span class="mono">{{ focusedRun.connectivity?.device_signature || '—' }}</span>
              </el-descriptions-item>
              <el-descriptions-item label="错误" :span="3" v-if="focusedRun.error">
                <span class="cr-error">{{ focusedRun.error }}</span>
              </el-descriptions-item>
            </el-descriptions>

            <h4 class="cr-section-title">Cases ({{ focusedRun.completed }}/{{ focusedRun.total }})</h4>
            <el-table :data="focusedRun.cases || []" size="small" border>
              <el-table-column label="case_id" prop="case_id" width="120">
                <template #default="{ row }"><span class="mono">{{ row.case_id }}</span></template>
              </el-table-column>
              <el-table-column label="状态" width="90">
                <template #default="{ row }"><el-tag :type="statusTagType(row.status)">{{ row.status }}</el-tag></template>
              </el-table-column>
              <el-table-column label="P/F/B/S" width="110">
                <template #default="{ row }">
                  P{{ row.passed || 0 }} F{{ row.failed || 0 }} B{{ row.blocked || 0 }} S{{ row.skipped || 0 }}
                </template>
              </el-table-column>
              <el-table-column label="耗时(ms)" prop="elapsed_ms" width="100" />
              <el-table-column label="summary" prop="summary" />
              <el-table-column label="操作" width="160">
                <template #default="{ row }">
                  <el-button size="small" link @click="traceFilter.caseId = row.case_id; activeTab = 'trace'; loadTraceList(); loadTraceDetail(row.report_run_id)">看 Trace</el-button>
                  <el-button size="small" link type="warning" v-if="row.status === 'pass'" @click="promoteTrace(row.report_run_id)">promote</el-button>
                </template>
              </el-table-column>
            </el-table>
          </div>
        </el-drawer>
      </el-tab-pane>

      <!-- ============== Trace ============== -->
      <el-tab-pane label="Trace 时间轴" name="trace">
        <div class="cr-trace-wrap">
          <el-card shadow="never" class="cr-card cr-trace-list">
            <template #header>
              <div class="cr-card-head">
                <span>Trace 列表</span>
                <el-button size="small" @click="loadTraceList" :loading="traceListLoading">刷新</el-button>
              </div>
            </template>
            <el-form inline size="small" class="cr-trace-filter">
              <el-form-item label="case_id">
                <el-input v-model="traceFilter.caseId" placeholder="留空查全部" style="width: 160px" clearable />
              </el-form-item>
              <el-form-item label="仅 pass">
                <el-switch v-model="traceFilter.onlyPass" />
              </el-form-item>
              <el-form-item>
                <el-button size="small" type="primary" @click="loadTraceList">筛选</el-button>
              </el-form-item>
            </el-form>

            <el-table
              :data="traceList"
              size="small"
              border
              highlight-current-row
              @row-click="(row) => loadTraceDetail(row.run_id)"
              max-height="500"
            >
              <el-table-column label="run_id" prop="run_id" min-width="220">
                <template #default="{ row }">
                  <span class="mono">{{ row.run_id }}</span>
                  <el-tag v-if="row.is_baseline" size="small" type="success" effect="plain" style="margin-left:6px">baseline</el-tag>
                </template>
              </el-table-column>
              <el-table-column label="case" prop="case_id" width="100">
                <template #default="{ row }"><span class="mono">{{ row.case_id }}</span></template>
              </el-table-column>
              <el-table-column label="状态" width="80">
                <template #default="{ row }"><el-tag :type="statusTagType(row.overall_status)" size="small">{{ row.overall_status }}</el-tag></template>
              </el-table-column>
              <el-table-column label="event" prop="total_events" width="65" />
              <el-table-column label="开始" width="150">
                <template #default="{ row }">{{ fmtTs(row.started_at) }}</template>
              </el-table-column>
              <el-table-column label="操作" width="120">
                <template #default="{ row }">
                  <el-button size="small" link type="warning" v-if="!row.is_baseline && row.overall_status === 'pass'" @click.stop="promoteTrace(row.run_id)">promote</el-button>
                </template>
              </el-table-column>
            </el-table>
          </el-card>

          <el-card shadow="never" class="cr-card cr-trace-detail" v-loading="traceDetailLoading">
            <template #header>
              <div class="cr-card-head">
                <span v-if="traceDetail">
                  <b class="mono">{{ traceDetail.run_id }}</b>
                  <el-tag :type="statusTagType(traceDetail.overall_status)" size="small" style="margin-left:6px">{{ traceDetail.overall_status }}</el-tag>
                  <el-tag v-if="traceDetail.is_baseline" type="success" size="small" effect="plain" style="margin-left:4px">baseline</el-tag>
                </span>
                <span v-else>选中左侧 run 查看时间轴</span>
              </div>
            </template>

            <div v-if="traceDetail" class="cr-trace-timeline">
              <div
                v-for="ev in (traceDetail.event_results || [])"
                :key="ev.seq"
                class="cr-event"
                :class="{
                  'is-fail': ev.status === 'fail',
                  'is-blocked': ev.status === 'blocked',
                  'is-declined': ev.status === 'declined',
                  'is-skipped': ev.status === 'skipped',
                  'is-pass': ev.status === 'pass',
                  'is-expanded': expandedEventSeqs.has(ev.seq),
                }"
              >
                <div class="cr-event-bullet" :data-status="ev.status">{{ ev.seq }}</div>
                <div class="cr-event-body" @click="toggleEvent(ev.seq)">
                  <div class="cr-event-row">
                    <el-tag :type="statusTagType(ev.status)" size="small">{{ ev.status }}</el-tag>
                    <span class="mono">{{ ev.capability_id }}</span>
                    <span class="cr-event-executor">via {{ ev.executor_used || '?' }}</span>
                    <span class="cr-event-elapsed">{{ ev.elapsed_ms }}ms</span>
                    <span class="cr-event-summary">{{ ev.summary }}</span>
                  </div>
                  <div v-if="expandedEventSeqs.has(ev.seq)" class="cr-event-detail">
                    <div v-if="ev.ai_reasoning"><b>ai_reasoning</b><pre>{{ ev.ai_reasoning }}</pre></div>
                    <div v-if="ev.details && Object.keys(ev.details).length"><b>details</b><pre>{{ JSON.stringify(ev.details, null, 2) }}</pre></div>
                    <div v-if="ev.vlm_meta && Object.keys(ev.vlm_meta).length"><b>vlm_meta</b><pre>{{ JSON.stringify(ev.vlm_meta, null, 2) }}</pre></div>
                    <div v-if="ev.screenshot_path"><b>screenshot</b><div class="mono cr-hint">{{ ev.screenshot_path }}</div></div>
                  </div>
                </div>
              </div>
              <el-empty v-if="!traceDetail.event_results?.length" description="此 trace 没有事件" />
            </div>
          </el-card>
        </div>
      </el-tab-pane>

      <!-- ============== Baseline ============== -->
      <el-tab-pane label="Baseline" name="baseline">
        <el-card shadow="never" class="cr-card">
          <template #header>
            <div class="cr-card-head">
              <span>查询 baseline</span>
            </div>
          </template>
          <el-form inline size="small">
            <el-form-item label="case_id">
              <el-input v-model="baselineForm.caseId" style="width: 160px" placeholder="如 A-1234" />
            </el-form-item>
            <el-form-item label="设备指纹">
              <el-input v-model="baselineForm.deviceSignature" style="width: 240px" placeholder="留空则用 sn 反推" />
            </el-form-item>
            <el-form-item label="sn">
              <el-select v-model="baselineForm.sn" placeholder="可选" style="width: 200px" clearable>
                <el-option v-for="d in devices" :key="d.sn" :value="d.sn" :label="`${d.model || d.sn} · ${d.sn}`" />
              </el-select>
            </el-form-item>
            <el-form-item>
              <el-button type="primary" :loading="baselineLoading" @click="loadBaseline">查询</el-button>
            </el-form-item>
          </el-form>

          <el-empty v-if="!baselineData" description="输入 case_id 后点查询" />
          <template v-else-if="baselineData.exists">
            <el-descriptions :column="2" border size="small" class="cr-descriptions">
              <el-descriptions-item label="case_id"><span class="mono">{{ baselineData.case_id }}</span></el-descriptions-item>
              <el-descriptions-item label="device_signature"><span class="mono">{{ baselineData.device_signature || '—' }}</span></el-descriptions-item>
              <el-descriptions-item label="状态">
                <el-tag :type="statusTagType(baselineData.overview.overall_status)">{{ baselineData.overview.overall_status }}</el-tag>
              </el-descriptions-item>
              <el-descriptions-item label="事件数">{{ baselineData.overview.event_count }}</el-descriptions-item>
              <el-descriptions-item label="blessed_at" :span="2">{{ fmtTs(baselineData.overview.blessed_at) }}</el-descriptions-item>
              <el-descriptions-item label="上次 ai_reasoning" :span="2">
                <pre class="cr-block">{{ baselineData.overview.last_ai_reasoning || '—' }}</pre>
              </el-descriptions-item>
              <el-descriptions-item label="events brief" :span="2">
                <pre class="cr-block">{{ baselineData.overview.events_brief_text || '—' }}</pre>
              </el-descriptions-item>
              <el-descriptions-item label="注入 plan prompt 的原文" :span="2">
                <pre class="cr-block">{{ baselineData.overview.prompt_block || '—' }}</pre>
              </el-descriptions-item>
            </el-descriptions>
          </template>
          <el-alert v-else type="info" show-icon :closable="false">
            该 (case_id, device_signature) 还没有 baseline；跑一次 pass 之后会自动 bless。
          </el-alert>
        </el-card>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<style scoped>
.case-runner-panel {
  padding: 8px 4px 16px;
}
.cr-tabs :deep(.el-tabs__nav-wrap)::after { background-color: transparent; }
.cr-card {
  margin-bottom: 16px;
}
.cr-card-head {
  display: flex; justify-content: space-between; align-items: center;
  font-weight: 500;
}
.cr-form { max-width: 920px; }
.cr-hint { color: var(--el-text-color-secondary); font-size: 12px; margin-left: 8px; }
.cr-case-picker {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 4px;
  padding: 8px 10px;
  max-height: 320px;
  overflow-y: auto;
  width: 100%;
  max-width: 640px;
}
.cr-case-toolbar { margin-bottom: 6px; display: flex; gap: 6px; }
.cr-case-row { padding: 2px 0; }
.mono { font-family: ui-monospace, SFMono-Regular, "JetBrains Mono", Menlo, Consolas, monospace; font-size: 12px; }
.cr-section-title { margin-top: 16px; }
.cr-descriptions { margin-top: 12px; }
.cr-block {
  white-space: pre-wrap;
  word-break: break-all;
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 12px;
  margin: 0;
  padding: 4px 6px;
  background: var(--el-fill-color-lighter);
  border-radius: 4px;
}
.cr-run-detail { padding: 14px 18px; }
.cr-error { color: var(--el-color-danger); font-family: monospace; word-break: break-all; }

/* Trace 时间轴 */
.cr-trace-wrap {
  display: grid;
  grid-template-columns: 1.05fr 1.6fr;
  gap: 14px;
  align-items: start;
}
.cr-trace-filter { margin-bottom: 8px; }
.cr-trace-detail { min-height: 400px; }
.cr-trace-timeline { position: relative; padding-left: 30px; }
.cr-trace-timeline::before {
  content: ""; position: absolute; left: 12px; top: 4px; bottom: 4px;
  width: 2px; background: var(--el-border-color-light);
}
.cr-event { position: relative; padding: 6px 0; }
.cr-event-bullet {
  position: absolute; left: -30px; top: 8px;
  width: 24px; height: 24px;
  border-radius: 50%;
  background: var(--el-fill-color);
  color: var(--el-text-color-primary);
  font-size: 11px; font-weight: 600;
  display: flex; align-items: center; justify-content: center;
  border: 2px solid var(--el-border-color);
}
.cr-event-bullet[data-status="pass"] { background: var(--el-color-success-light-9); border-color: var(--el-color-success); }
.cr-event-bullet[data-status="fail"] { background: var(--el-color-danger-light-9); border-color: var(--el-color-danger); }
.cr-event-bullet[data-status="blocked"] { background: var(--el-color-warning-light-9); border-color: var(--el-color-warning); }
.cr-event-bullet[data-status="skipped"] { background: var(--el-fill-color); border-color: var(--el-text-color-disabled); }
.cr-event-bullet[data-status="declined"] { background: var(--el-color-info-light-9); border-color: var(--el-color-info); }
.cr-event-body {
  cursor: pointer;
  padding: 6px 10px;
  border-radius: 4px;
  border: 1px solid var(--el-border-color-lighter);
  background: var(--el-bg-color);
  transition: border-color .15s, background .15s;
}
.cr-event-body:hover { border-color: var(--el-color-primary-light-5); }
.cr-event.is-fail .cr-event-body { border-left: 3px solid var(--el-color-danger); background: var(--el-color-danger-light-9); }
.cr-event.is-blocked .cr-event-body { border-left: 3px solid var(--el-color-warning); background: var(--el-color-warning-light-9); }
.cr-event.is-declined .cr-event-body { border-left: 3px solid var(--el-color-info); }
.cr-event.is-pass .cr-event-body { border-left: 3px solid var(--el-color-success-light-5); }
.cr-event-row {
  display: flex; align-items: center; gap: 8px;
  font-size: 13px;
}
.cr-event-executor { color: var(--el-text-color-secondary); font-size: 11px; }
.cr-event-elapsed { color: var(--el-text-color-secondary); font-size: 11px; margin-left: auto; }
.cr-event-summary { flex-basis: 100%; color: var(--el-text-color-regular); font-size: 12px; margin-top: 2px; word-break: break-all; }
.cr-event-detail {
  margin-top: 8px;
  padding-top: 6px;
  border-top: 1px dashed var(--el-border-color-lighter);
  font-size: 12px;
}
.cr-event-detail b { color: var(--el-text-color-secondary); display: inline-block; margin: 4px 0 2px; }
.cr-event-detail pre {
  background: var(--el-fill-color-lighter);
  padding: 6px 8px;
  border-radius: 3px;
  margin: 0;
  white-space: pre-wrap;
  word-break: break-all;
  font-size: 11.5px;
  max-height: 240px;
  overflow: auto;
}
</style>
