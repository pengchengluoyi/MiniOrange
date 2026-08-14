<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  getCaseRunnerRun,
  getCaseRunnerTraceDetail,
  listCaseRunnerTraces,
  promoteCaseRunnerBaseline,
} from '@/api/caseRunner'
import { addMessageListener, removeMessageListener } from '@/api/mWebSocket'
import ExecutionTimeline from '@/components/ExecutionTimeline.vue'
import {
  batchIdFromCaseRunId,
  caseIdFromCaseRunId,
  normalizeMemoryRun,
  shortTaskId,
  sortCasesForRail,
  statusLabel,
  statusTagType,
} from '@/utils/testingTasks'

const props = defineProps({
  taskId: { type: String, required: true },
  appId: { type: String, default: '' },
  seed: { type: Object, default: null },
})

const loading = ref(false)
const task = ref(null)
const selectedCaseRunId = ref('')
const headerMeta = ref(null)
const pollTimer = ref(null)
const view = ref('cases')
const hitlPending = ref(null)

const isLive = computed(() => task.value?.status === 'running')
const failedCases = computed(() =>
  (task.value?.cases || []).filter((c) => ['fail', 'failed', 'blocked', 'declined', 'partial'].includes(c.status)),
)
const passRate = computed(() => task.value?.passRate ?? 0)
const orderedCases = computed(() => sortCasesForRail(task.value?.cases || []))
const hitlForThisTask = computed(() => {
  const h = hitlPending.value
  if (!h) return null
  const rid = String(h.run_id || '')
  if (!rid) return h
  if (rid === props.taskId || rid.startsWith(`${props.taskId}::`)) return h
  return null
})

const caseRunIdOf = (c) => c.report_run_id || (c.case_id ? `${props.taskId}::${c.case_id}` : '')

const pickDefaultCase = (cases) => {
  if (!cases?.length) return null
  return cases.find((c) => c.status === 'running')
    || cases.find((c) => c.status === 'blocked')
    || cases.find((c) => c.status === 'pending')
    || cases[0]
}

const loadHeader = async (caseRunId) => {
  headerMeta.value = null
  if (!caseRunId) return
  try {
    const r = await getCaseRunnerTraceDetail(caseRunId)
    const d = r?.data || {}
    const rc = d.run_context || {}
    headerMeta.value = {
      sn: d.sn || rc.sn || '',
      overall: d.overall_status || '',
      passed: d.passed,
      failed: d.failed,
      blocked: d.blocked,
      skipped: d.skipped,
      elapsed: d.elapsed_ms,
      goal: d.goal || d.case_name || '',
    }
  } catch (_) {
    headerMeta.value = { live: true }
  }
}

const selectCase = async (c) => {
  const id = caseRunIdOf(c)
  if (!id) return
  selectedCaseRunId.value = id
  view.value = 'cases'
  await loadHeader(id)
}

const buildFromTraces = async () => {
  const tr = await listCaseRunnerTraces({ limit: 100 })
  const items = (tr?.data?.items || []).filter((t) => batchIdFromCaseRunId(t.run_id) === props.taskId)
  const caseRows = items.map((t) => ({
    case_id: t.case_id || caseIdFromCaseRunId(t.run_id),
    name: t.case_name || t.case_id || '',
    status: t.status || t.overall_status || 'unknown',
    report_run_id: t.run_id,
    summary: t.summary || '',
    elapsed_ms: t.elapsed_ms,
    passed: t.passed,
    failed: t.failed,
    blocked: t.blocked,
    skipped: t.skipped,
  }))
  const passed = caseRows.filter((c) => c.status === 'pass').length
  const failed = caseRows.filter((c) => !['pass', 'running', 'pending'].includes(c.status)).length
  return {
    taskId: props.taskId,
    appId: props.appId,
    sn: items[0]?.sn || props.seed?.sn || '',
    status: caseRows.some((c) => c.status === 'running') ? 'running' : (failed ? 'failed' : 'done'),
    total: caseRows.length,
    completed: caseRows.filter((c) => !['pending', 'running'].includes(c.status)).length,
    passed,
    failed,
    blocked: 0,
    declined: 0,
    progress: caseRows.length ? Math.round((caseRows.filter((c) => !['pending', 'running'].includes(c.status)).length / caseRows.length) * 100) : 0,
    passRate: caseRows.length ? Math.round((passed / caseRows.length) * 100) : 0,
    startedAt: items[0]?.created_at || props.seed?.startedAt || '',
    finishedAt: '',
    error: '',
    cases: caseRows,
    source: 'traces',
  }
}

const loadTask = async ({ silent = false } = {}) => {
  if (!props.taskId) return
  if (!silent) loading.value = true
  try {
    let next = null
    try {
      const r = await getCaseRunnerRun(props.taskId)
      next = normalizeMemoryRun(r?.data)
    } catch (_) {}
    if (!next) next = await buildFromTraces()
    if ((!next.cases || !next.cases.length) && props.seed?.cases?.length) {
      next = { ...next, cases: props.seed.cases }
    }
    task.value = next

    const stillValid = selectedCaseRunId.value
      && next.cases?.some((c) => caseRunIdOf(c) === selectedCaseRunId.value)
    if (!stillValid && next.cases?.length) {
      await selectCase(pickDefaultCase(next.cases))
    } else if (selectedCaseRunId.value) {
      await loadHeader(selectedCaseRunId.value)
    }
  } finally {
    if (!silent) loading.value = false
  }
}

const promoteRun = async () => {
  if (!selectedCaseRunId.value) return
  try {
    const note = await ElMessageBox.prompt(`把 ${selectedCaseRunId.value} 提升为 baseline 的备注（可空）`, '提升为 Baseline', {
      confirmButtonText: '确认',
      cancelButtonText: '取消',
      inputValue: '',
    })
    await promoteCaseRunnerBaseline({ run_id: selectedCaseRunId.value, blessed_by: 'manual', notes: note?.value || '' })
    ElMessage.success('已提升为 baseline')
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(`promote 失败: ${e?.message || e}`)
  }
}

const onHitlWs = (res) => {
  if (!res) return
  const type = res.type || res.action
  const data = res.data || {}
  if (type === 'hitl_request') {
    hitlPending.value = data
  } else if (type === 'hitl_revoke' || type === 'hitl_resolved') {
    if (hitlPending.value?.request_id === data.request_id) hitlPending.value = null
  }
}

const focusHitlCase = async () => {
  const h = hitlForThisTask.value
  if (!h) return
  const cid = h.case_id
  if (cid) {
    const row = (task.value?.cases || []).find((c) => c.case_id === cid)
    if (row) await selectCase(row)
  }
}

onMounted(async () => {
  addMessageListener(onHitlWs)
  await loadTask()
  pollTimer.value = setInterval(() => {
    if (task.value?.status === 'running') loadTask({ silent: true })
  }, 2500)
})

onUnmounted(() => {
  removeMessageListener(onHitlWs)
  if (pollTimer.value) clearInterval(pollTimer.value)
})

watch(
  () => props.taskId,
  () => {
    selectedCaseRunId.value = ''
    view.value = 'cases'
    hitlPending.value = null
    loadTask()
  },
)
</script>

<template>
  <div class="pane" v-loading="loading">
    <template v-if="task">
      <div class="pane-head">
        <div class="pane-head-row">
          <el-tag :type="statusTagType(task.status)" effect="dark" round>{{ statusLabel(task.status) }}</el-tag>
          <span class="mono" :title="task.taskId">任务 {{ shortTaskId(task.taskId) }}</span>
          <span v-if="task.sn">设备 {{ task.sn }}</span>
          <span>P{{ task.passed }} F{{ task.failed }} B{{ task.blocked }}</span>
          <span>{{ task.completed }}/{{ task.total }} · 通过率 {{ passRate }}%</span>
        </div>
        <el-progress
          :percentage="task.progress"
          :stroke-width="6"
          :status="task.status === 'failed' || task.failed ? 'exception' : (task.progress === 100 ? 'success' : undefined)"
        />
        <p v-if="task.error" class="err">{{ task.error }}</p>
      </div>

      <div v-if="hitlForThisTask" class="hitl-banner">
        <div class="hitl-banner-text">
          <strong>等待人工确认</strong>
          <span>{{ hitlForThisTask.title || hitlForThisTask.body || 'Agent 已暂停，请在弹窗中回复后继续' }}</span>
          <small>不点选则该用例会卡住；确认后 Agent 将继续执行</small>
        </div>
        <el-button type="warning" size="small" @click="focusHitlCase">去处理</el-button>
      </div>

      <div class="seg">
        <button type="button" :class="{ active: view === 'cases' }" @click="view = 'cases'">用例与时间线</button>
        <button type="button" :class="{ active: view === 'summary' }" @click="view = 'summary'">总结报表</button>
      </div>

      <template v-if="view === 'summary'">
        <div class="metrics">
          <div class="metric"><div class="k">通过率</div><div class="v">{{ passRate }}%</div></div>
          <div class="metric"><div class="k">通过</div><div class="v ok">{{ task.passed || 0 }}</div></div>
          <div class="metric"><div class="k">失败</div><div class="v bad">{{ task.failed || 0 }}</div></div>
          <div class="metric"><div class="k">阻塞</div><div class="v warn">{{ task.blocked || 0 }}</div></div>
        </div>
        <div class="fail-block">
          <h4>失败 / 异常用例</h4>
          <el-table :data="failedCases" size="small" empty-text="暂无失败用例">
            <el-table-column prop="case_id" label="用例" width="120" />
            <el-table-column prop="name" label="名称" min-width="120" />
            <el-table-column label="状态" width="90">
              <template #default="{ row }">
                <el-tag :type="statusTagType(row.status)" size="small">{{ statusLabel(row.status) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="summary" label="摘要" min-width="160" show-overflow-tooltip />
            <el-table-column label="操作" width="90">
              <template #default="{ row }">
                <el-button link type="primary" @click="selectCase(row)">看时间线</el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </template>

      <div v-else class="split">
        <div class="case-list">
          <div class="case-list-head">
            <strong>用例</strong>
            <span>{{ orderedCases.length }}</span>
          </div>
          <button
            v-for="c in orderedCases"
            :key="caseRunIdOf(c)"
            type="button"
            class="case-row"
            :class="[
              c.status,
              { active: caseRunIdOf(c) === selectedCaseRunId },
            ]"
            @click="selectCase(c)"
          >
            <span class="case-top">
              <el-tag :type="statusTagType(c.status)" size="small" effect="light">{{ statusLabel(c.status) }}</el-tag>
              <strong>{{ c.case_id }}</strong>
            </span>
            <span class="case-sub">{{ c.name || c.summary || caseRunIdOf(c) }}</span>
          </button>
          <el-empty
            v-if="!orderedCases.length"
            :description="task.total === 0 ? '任务尚未开始' : '尚无用例'"
            :image-size="48"
          />
        </div>
        <div class="timeline-pane">
          <template v-if="selectedCaseRunId">
            <div class="tl-head">
              <div class="tl-title">{{ selectedCaseRunId }}</div>
              <div v-if="headerMeta && !headerMeta.live" class="tl-meta">
                <el-tag v-if="headerMeta.overall" :type="statusTagType(headerMeta.overall)" size="small">{{ headerMeta.overall }}</el-tag>
                <span v-if="headerMeta.elapsed">{{ headerMeta.elapsed }}ms</span>
                <el-button size="small" text type="primary" @click="promoteRun">提升为 Baseline</el-button>
              </div>
              <p v-if="headerMeta?.goal" class="goal">目标：{{ headerMeta.goal }}</p>
            </div>
            <ExecutionTimeline
              class="tl"
              :run-id="selectedCaseRunId"
              :live="isLive && selectedCaseRunId.startsWith(taskId + '::')"
            />
          </template>
          <el-empty v-else description="选择左侧用例查看时间线" />
        </div>
      </div>
    </template>
    <el-empty v-else-if="!loading" description="无法加载该任务" />
  </div>
</template>

<style scoped>
.pane {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  width: 100%;
  gap: 10px;
  box-sizing: border-box;
}
.pane-head {
  padding: 12px 14px;
  border: 1px solid #e3e8f0;
  border-radius: 14px;
  background: #fff;
  flex-shrink: 0;
}
.pane-head-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  font-size: 12px;
  color: #6b7280;
  margin-bottom: 8px;
}
.mono { font-family: ui-monospace, monospace; color: #111827; font-weight: 600; }
.err { color: #dc2626; font-size: 12px; margin: 8px 0 0; }
.hitl-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  border-radius: 12px;
  background: #fffbeb;
  border: 1px solid #fcd34d;
  flex-shrink: 0;
}
.hitl-banner-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.hitl-banner-text strong { font-size: 13px; color: #92400e; }
.hitl-banner-text span {
  font-size: 12px;
  color: #78350f;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.hitl-banner-text small { font-size: 11px; color: #a16207; }
.seg {
  display: inline-flex;
  gap: 4px;
  padding: 4px;
  border-radius: 12px;
  background: #eef2ff;
  width: fit-content;
  flex-shrink: 0;
}
.seg button {
  border: none;
  background: transparent;
  padding: 8px 12px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 600;
  color: #64748b;
  cursor: pointer;
}
.seg button.active {
  background: #fff;
  color: #4f46e5;
  box-shadow: 0 4px 12px rgba(15, 23, 42, 0.06);
}
.metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}
.metric {
  padding: 12px 14px;
  border-radius: 14px;
  border: 1px solid #e3e8f0;
  background: #fff;
}
.metric .k { font-size: 12px; color: #6b7280; }
.metric .v { margin-top: 4px; font-size: 24px; font-weight: 700; color: #111827; }
.metric .v.ok { color: #059669; }
.metric .v.bad { color: #dc2626; }
.metric .v.warn { color: #d97706; }
.fail-block {
  flex: 1;
  min-height: 0;
  padding: 12px 14px;
  border-radius: 14px;
  border: 1px solid #e3e8f0;
  background: #fff;
  overflow: auto;
}
.fail-block h4 { margin: 0 0 10px; font-size: 14px; }
.split {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 132px minmax(0, 1fr);
  gap: 10px;
  width: 100%;
}
.case-list {
  overflow: auto;
  padding: 6px;
  border: 1px solid #e3e8f0;
  border-radius: 14px;
  background: #fff;
  min-width: 0;
}
.case-list-head {
  display: flex;
  justify-content: space-between;
  padding: 6px 8px 8px;
  font-size: 12px;
  color: #6b7280;
}
.case-list-head strong { color: #111827; }
.case-row {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px;
  border: 1px solid transparent;
  border-left: 3px solid transparent;
  border-radius: 10px;
  background: transparent;
  cursor: pointer;
  text-align: left;
  margin-bottom: 4px;
}
.case-row:hover { background: #f3f4f6; }
.case-row.active { background: #eff6ff; border-color: #bfdbfe; }
.case-row.running {
  background: #ecfdf5;
  border-left-color: #34d399;
  animation: case-pulse 1.6s ease-in-out infinite;
}
.case-row.pending { border-left-color: #cbd5e1; }
.case-row.pass { border-left-color: #34d399; }
.case-row.fail,
.case-row.failed { border-left-color: #f87171; }
.case-row.blocked { border-left-color: #fbbf24; }
@keyframes case-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(52, 211, 153, 0.25); }
  50% { box-shadow: 0 0 0 4px rgba(52, 211, 153, 0.12); }
}
.case-top { display: flex; justify-content: flex-start; gap: 6px; align-items: center; }
.case-top strong { font-size: 13px; color: #111827; }
.case-sub { font-size: 11px; color: #9ca3af; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.timeline-pane {
  min-width: 0;
  min-height: 0;
  width: 100%;
  display: flex;
  flex-direction: column;
  padding: 12px;
  border: 1px solid #e3e8f0;
  border-radius: 14px;
  background: #f8fafc;
  overflow: hidden;
  box-sizing: border-box;
}
.tl-head { margin-bottom: 8px; flex-shrink: 0; }
.tl-title { font-size: 12px; font-weight: 600; font-family: ui-monospace, monospace; color: #111827; }
.tl-meta { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; font-size: 12px; color: #6b7280; margin-top: 4px; }
.goal { margin: 6px 0 0; font-size: 12px; color: #374151; }
.tl { flex: 1; min-height: 0; width: 100%; overflow: auto; padding-top: 4px; }
@media (max-width: 1100px) {
  .split { grid-template-columns: 1fr; }
  .metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>
