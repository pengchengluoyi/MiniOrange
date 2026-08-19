<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  cancelTestingTask,
  getCaseRunnerTraceDetail,
  promoteCaseRunnerBaseline,
  retryFailedTestingTask,
  runCaseRunner,
} from '@/api/caseRunner'
import { addMessageListener, removeMessageListener } from '@/api/mWebSocket'
import ExecutionTimeline from '@/components/ExecutionTimeline.vue'
import { fetchTaskDetail } from '@/composables/useTestingTasks'
import { getFeishuCasesCached } from '@/api/feishuRegression'
import { reviewKnowledgeItem } from '@/api/settings'
import { normalizeCaseRow } from '@/utils/caseText'
import {
  apiErrorDetail,
  applyTestingTaskEvent,
  formatElapsed,
  isMissingTaskEndpoint,
  isStepLimitCase,
  progressStatus,
  shortDeviceLabel,
  statusLabel,
  statusTagType,
  taskCountLabel,
  taskPassRate,
  taskProgressPct,
  taskTitle,
  displayTaskStatus,
} from '@/utils/testingTasks'

const props = defineProps({
  taskId: { type: String, required: true },
  appId: { type: String, default: '' },
  seed: { type: Object, default: null },
})
const emit = defineEmits(['open-task'])

const loading = ref(false)
const task = ref(null)
const selectedCaseRunId = ref('')
const headerMeta = ref(null)
const pollTimer = ref(null)
const view = ref('cases')
const hitlPending = ref(null)
const cancelling = ref(false)
const retrying = ref(false)
const catalog = ref([])

const caseRunIdOf = (c) => c.report_run_id || (c.case_id ? `${props.taskId}::${c.case_id}` : '')

const isEmptySpecVal = (v) => v == null || v === '' || (Array.isArray(v) && !v.length)

const mergeCaseSpec = (hit, c) => {
  const out = { ...(hit || {}), ...(c || {}) }
  const keys = [
    'module', 'name', 'case_name', 'title', 'platform', 'client', 'terminal',
    'precondition', 'precondition_raw',
    'steps', 'step_lines', 'steps_raw',
    'expected', 'expected_lines', 'expected_raw', 'expected_by_step', 'goal',
  ]
  for (const k of keys) {
    if (isEmptySpecVal(c?.[k]) && !isEmptySpecVal(hit?.[k])) out[k] = hit[k]
  }
  return out
}

const specOf = (c) => {
  if (!c) return {}
  const cid = String(c.case_id || '')
  const name = String(c.name || c.case_name || '')
  const list = catalog.value || []
  const hit = list.find((x) => String(x.case_id || '') === cid)
    || list.find((x) => name && String(x.name || x.case_name || x.title || '') === name)
  const merged = mergeCaseSpec(normalizeCaseRow(hit || {}), normalizeCaseRow(c))
  if (isEmptySpecVal(merged.platform) && task.value?.platform) merged.platform = task.value.platform
  return merged
}
const selectedSpec = computed(() => specOf(selectedCase.value))
const caseTab = ref('executed')
const isPendingStatus = (s) => ['pending', 'queued'].includes(String(s || ''))
const sourceCases = computed(() => task.value?.cases || [])
const pendingCases = computed(() => sourceCases.value.filter((c) => isPendingStatus(c.status)))
const executedCases = computed(() => sourceCases.value.filter((c) => !isPendingStatus(c.status)))
const showPendingTab = computed(() => pendingCases.value.length > 0)
const railCases = computed(() => (caseTab.value === 'pending' && showPendingTab.value ? pendingCases.value : executedCases.value))

const isLive = computed(() => task.value?.status === 'running')
const failedCases = computed(() =>
  (task.value?.cases || []).filter((c) => ['fail', 'blocked', 'declined', 'partial'].includes(c.status)),
)
const skippedCases = computed(() =>
  (task.value?.cases || []).filter((c) => ['cancelled', 'skipped', 'pending'].includes(c.status) && task.value?.status !== 'running'),
)
const passRate = computed(() => taskPassRate(task.value))
const caseRailOpen = ref(false)
const selectedCase = computed(() =>
  (task.value?.cases || []).find((c) => caseRunIdOf(c) === selectedCaseRunId.value) || null,
)
const showTimeline = computed(() => {
  const s = selectedCase.value?.status
  return Boolean(selectedCaseRunId.value && s && !['pending', 'cancelled', 'skipped'].includes(s))
})
const runningCaseName = computed(() => {
  const row = (task.value?.cases || []).find((c) => c.status === 'running')
  return row?.name || row?.case_id || task.value?.currentCaseId || ''
})
const caseProposals = computed(() =>
  (selectedCase.value?.knowledge_proposals || []).filter((k) => k && (k.review_status || 'pending') === 'pending'),
)
const taskProposals = computed(() =>
  (task.value?.knowledge_proposals || []).filter((k) => k && (k.review_status || 'pending') === 'pending'),
)
const reviewingId = ref('')
const SOURCE_LABEL = { manual: '手动添加', case_run: '用例执行', task_run: '任务汇总' }
const hitlForThisTask = computed(() => {
  const fromCases = (task.value?.cases || []).find((c) => c.hitl)
  if (fromCases) {
    return { case_id: fromCases.case_id, title: '等待人工确认', body: fromCases.summary }
  }
  const h = hitlPending.value
  if (!h) return null
  const rid = String(h.run_id || '')
  if (!rid) return h
  if (rid === props.taskId || rid.startsWith(`${props.taskId}::`)) return h
  return null
})

const pickDefaultCase = (cases) => {
  if (!cases?.length) return null
  return cases.find((c) => c.hitl)
    || cases.find((c) => c.status === 'running')
    || cases.find((c) => c.status === 'blocked')
    || cases.find((c) => ['fail', 'failed', 'partial', 'declined'].includes(c.status))
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
  if (isPendingStatus(c.status) && pendingCases.value.length) caseTab.value = 'pending'
  else caseTab.value = 'executed'
  await loadHeader(id)
}

const loadTask = async ({ silent = false } = {}) => {
  if (!props.taskId) return
  if (!silent) loading.value = true
  try {
    let next = await fetchTaskDetail(props.taskId, props.seed)
    if (next && (!next.cases || !next.cases.length) && props.seed?.cases?.length) {
      next = { ...next, cases: props.seed.cases }
    }
    task.value = next

    const stillValid = selectedCaseRunId.value
      && next?.cases?.some((c) => caseRunIdOf(c) === selectedCaseRunId.value)
    if (!stillValid && next?.cases?.length) {
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
  const failed = ['fail', 'failed', 'partial'].includes(selectedCase.value?.status)
  try {
    if (failed) {
      await ElMessageBox.confirm(
        '当前用例未通过。仍要用这次轨迹作为以后执行的对照路径吗？',
        '提升为 Baseline',
        { type: 'warning', confirmButtonText: '仍要提升', cancelButtonText: '取消' },
      )
    }
    const note = await ElMessageBox.prompt(`把 ${selectedCase.value?.case_id || selectedCaseRunId.value} 提升为 baseline 的备注（可空）`, '提升为 Baseline', {
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

const copyRunId = async () => {
  const id = selectedCaseRunId.value || props.taskId
  try {
    await navigator.clipboard.writeText(id)
    ElMessage.success('已复制编号')
  } catch {
    ElMessage.info(id)
  }
}

const copyTaskId = async () => {
  const id = props.taskId || task.value?.taskId
  if (!id) return
  try {
    await navigator.clipboard.writeText(id)
    ElMessage.success('已复制任务编号')
  } catch {
    ElMessage.info(id)
  }
}

const cancelTask = async () => {
  try {
    await ElMessageBox.confirm('将在当前用例边界停止，剩余待执行用例标为已取消。', '取消任务', { type: 'warning' })
  } catch (_) { return }
  cancelling.value = true
  try {
    await cancelTestingTask(props.taskId)
    ElMessage.success('已请求取消')
    await loadTask({ silent: true })
  } catch (e) {
    const status = e?.response?.status
    if (status === 405 || status === 501) ElMessage.warning('后端尚未提供取消接口')
    else ElMessage.error(`取消失败: ${apiErrorDetail(e)}`)
  } finally {
    cancelling.value = false
  }
}

const retryFailed = async () => {
  retrying.value = true
  try {
    const r = await retryFailedTestingTask(props.taskId)
    const nid = r?.data?.task_id || r?.data?.run_id
    if (nid) {
      ElMessage.success('已创建重跑任务')
      emit('open-task', nid)
    } else {
      ElMessage.success('已提交重跑')
      await loadTask({ silent: true })
    }
  } catch (e) {
    if (isMissingTaskEndpoint(e)) ElMessage.warning('后端尚未提供重跑接口')
    else ElMessage.error(`重跑失败: ${e?.message || e}`)
  } finally {
    retrying.value = false
  }
}

const retryOne = async (c) => {
  if (!c?.case_id) return
  retrying.value = true
  try {
    const r = await runCaseRunner({
      app_id: props.appId,
      sn: task.value?.sn,
      platform: task.value?.platform || 'android',
      case_ids: [c.case_id],
      async_exec: true,
      execution_mode: 'auto',
      run_type: 'manual',
    })
    const nid = r?.data?.run_id || r?.data?.task_id
    if (nid) emit('open-task', nid)
    else ElMessage.success('已提交单条重跑')
  } catch (e) {
    ElMessage.error(`重跑失败: ${e?.message || e}`)
  } finally {
    retrying.value = false
  }
}

const approveProposal = async (row) => {
  if (!row?.id) return
  reviewingId.value = row.id
  try {
    await reviewKnowledgeItem(row.id, {
      action: 'approve',
      title: row.title,
      content: row.content,
      category: row.category,
      tags: row.tags || [],
    })
    row.review_status = 'approved'
    ElMessage.success('已审核并加入知识库')
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || '审核失败')
  } finally {
    reviewingId.value = ''
  }
}

const rejectProposal = async (row) => {
  if (!row?.id) return
  reviewingId.value = row.id
  try {
    await reviewKnowledgeItem(row.id, { action: 'reject' })
    row.review_status = 'rejected'
    ElMessage.success('已驳回')
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || '驳回失败')
  } finally {
    reviewingId.value = ''
  }
}

const onWs = (res) => {
  if (!res) return
  const type = res.type || res.action
  const data = res.data || {}
  if (type === 'hitl_request') {
    hitlPending.value = data
  } else if (type === 'hitl_revoke' || type === 'hitl_resolved') {
    if (hitlPending.value?.request_id === data.request_id) hitlPending.value = null
    if (task.value && data.case_id) {
      task.value = applyTestingTaskEvent(task.value, {
        event: 'case_finished',
        case: { case_id: data.case_id, hitl: false },
      })
    }
  } else if (type === 'testing_task') {
    const tid = data.task_id
    if (tid && tid !== props.taskId) return
    if (task.value) task.value = applyTestingTaskEvent(task.value, data)
    if (data.event === 'case_running' && data.case) {
      const row = (task.value?.cases || []).find((c) => c.case_id === data.case.case_id)
      if (row) selectCase(row)
    }
    if (data.event === 'task_finished' || data.event === 'cancelled') {
      loadTask({ silent: true })
    }
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
  addMessageListener(onWs)
  await Promise.all([loadTask(), loadCatalog()])
  pollTimer.value = setInterval(() => {
    if (task.value?.status === 'running' || task.value?.status === 'queued') loadTask({ silent: true })
  }, 15000)
})

onUnmounted(() => {
  removeMessageListener(onWs)
  if (pollTimer.value) clearInterval(pollTimer.value)
})

watch(
  () => props.appId,
  () => { loadCatalog() },
)

const loadCatalog = async () => {
  if (!props.appId) return
  try {
    const r = await getFeishuCasesCached(props.appId, false)
    catalog.value = r?.data?.cases || []
  } catch (_) {
    catalog.value = []
  }
}

watch(
  () => props.taskId,
  () => {
    selectedCaseRunId.value = ''
    view.value = 'cases'
    hitlPending.value = null
    caseTab.value = 'executed'
    loadTask()
  },
)

watch(showPendingTab, (show) => {
  if (!show) caseTab.value = 'executed'
})

watch(selectedCase, (c) => {
  if (!c) return
  if (isPendingStatus(c.status) && showPendingTab.value) caseTab.value = 'pending'
  else if (!isPendingStatus(c.status)) caseTab.value = 'executed'
})
</script>

<template>
  <div class="pane" v-loading="loading">
    <template v-if="task">
      <div class="pane-head">
        <div class="pane-head-row">
          <el-tag :type="statusTagType(task.status, task)" effect="dark" round>{{ statusLabel(task.status, task) }}</el-tag>
          <span class="title" :title="task.taskId">{{ taskTitle(task) }}</span>
          <span v-if="task.sn" class="muted">设备 {{ shortDeviceLabel(task.sn) }}</span>
          <span>通过 {{ task.passed }} · 失败 {{ task.failed }}{{ task.blocked ? ` · 阻塞 ${task.blocked}` : '' }}</span>
          <span>{{ taskCountLabel(task) }}<template v-if="passRate != null && displayTaskStatus(task) !== 'cancelled'"> · 通过率 {{ passRate }}%</template></span>
          <el-button size="small" text @click="copyTaskId">复制任务编号</el-button>
          <el-button
            v-if="task.status === 'running' || task.status === 'queued'"
            size="small"
            type="warning"
            plain
            :loading="cancelling"
            @click="cancelTask"
          >取消任务</el-button>
          <el-button
            v-if="failedCases.length && task.status !== 'running'"
            size="small"
            plain
            :loading="retrying"
            @click="retryFailed"
          >重跑失败用例</el-button>
        </div>
        <el-progress
          :percentage="taskProgressPct(task)"
          :stroke-width="6"
          :status="progressStatus(task)"
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
          <div class="metric"><div class="k">通过率</div><div class="v">{{ passRate == null ? '—' : `${passRate}%` }}</div></div>
          <div class="metric"><div class="k">通过</div><div class="v ok">{{ task.passed || 0 }}</div></div>
          <div class="metric"><div class="k">失败</div><div class="v bad">{{ task.failed || 0 }}</div></div>
          <div class="metric"><div class="k">阻塞</div><div class="v warn">{{ task.blocked || 0 }}</div></div>
        </div>
        <div v-if="taskProposals.length" class="know-block">
          <h4>任务待审核知识</h4>
          <article v-for="row in taskProposals" :key="row.id" class="know-card">
            <header>
              <strong>{{ row.title }}</strong>
              <small>{{ SOURCE_LABEL[row.source] || '任务汇总' }}</small>
            </header>
            <p v-if="row.question" class="know-q">{{ row.question }}</p>
            <el-input v-model="row.content" type="textarea" :rows="4" />
            <div class="know-actions">
              <el-button size="small" :loading="reviewingId === row.id" @click="rejectProposal(row)">驳回</el-button>
              <el-button size="small" type="primary" :loading="reviewingId === row.id" @click="approveProposal(row)">录入知识库</el-button>
            </div>
          </article>
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
            <el-table-column label="操作" width="140">
              <template #default="{ row }">
                <el-button link type="primary" @click="selectCase(row)">看时间线</el-button>
                <el-button link type="primary" :disabled="retrying" @click="retryOne(row)">重跑</el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
        <div v-if="skippedCases.length" class="fail-block">
          <h4>未执行 / 已取消</h4>
          <el-table :data="skippedCases" size="small">
            <el-table-column prop="case_id" label="用例" width="120" />
            <el-table-column prop="name" label="名称" min-width="120" />
            <el-table-column label="状态" width="90">
              <template #default="{ row }">
                <el-tag :type="statusTagType(row.status)" size="small">{{ statusLabel(row.status) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="summary" label="摘要" min-width="160" show-overflow-tooltip />
          </el-table>
        </div>
      </template>

      <div v-else class="split" :class="{ 'case-rail-collapsed': !caseRailOpen }">
        <div class="case-list">
          <div class="case-list-toolbar">
            <div v-if="showPendingTab" class="case-tabs">
              <button
                type="button"
                :class="{ active: caseTab === 'pending' }"
                @click="caseTab = 'pending'"
              >待执行 {{ pendingCases.length }}</button>
              <button
                type="button"
                :class="{ active: caseTab === 'executed' }"
                @click="caseTab = 'executed'"
              >已执行 {{ executedCases.length }}</button>
            </div>
            <div v-else class="case-list-head">
              <strong>用例</strong>
              <span>{{ railCases.length }}</span>
            </div>
            <el-button text size="small" @click="caseRailOpen = false">收起</el-button>
          </div>
          <button
            v-for="c in railCases"
            :key="caseRunIdOf(c)"
            type="button"
            class="case-row"
            :class="[
              c.status,
              {
                active: caseRunIdOf(c) === selectedCaseRunId,
                hitl: c.hitl,
                limit: isStepLimitCase(c),
              },
            ]"
            @click="selectCase(c)"
          >
            <span class="case-top">
              <el-tag
                :type="statusTagType(c.status, c)"
                size="small"
                effect="light"
                :class="{ 'tag-limit': isStepLimitCase(c) }"
              >{{ statusLabel(c.status, c) }}</el-tag>
              <strong :title="c.case_id">{{ c.case_id }}</strong>
            </span>
            <span class="case-sub">{{ c.name || c.summary || caseRunIdOf(c) }}</span>
          </button>
          <el-empty
            v-if="!railCases.length"
            :description="caseTab === 'pending' ? '没有待执行用例' : (task.total === 0 ? '任务尚未开始' : '尚无已执行用例')"
            :image-size="48"
          />
        </div>
        <div class="timeline-pane">
          <button v-if="!caseRailOpen" type="button" class="case-rail-toggle" @click="caseRailOpen = true">展开用例</button>
          <template v-if="selectedCase">
            <div class="tl-head">
              <div class="tl-title" :title="selectedCaseRunId">{{ selectedCase.case_id || selectedCaseRunId }}</div>
              <div v-if="headerMeta && !headerMeta.live" class="tl-meta">
                <el-tag
                  v-if="headerMeta.overall"
                  :type="statusTagType(headerMeta.overall, selectedCase)"
                  size="small"
                  :class="{ 'tag-limit': isStepLimitCase(selectedCase) }"
                >{{ statusLabel(headerMeta.overall, selectedCase) }}</el-tag>
                <span v-if="headerMeta.elapsed">{{ formatElapsed(headerMeta.elapsed) }}</span>
                <el-button size="small" text @click="copyRunId">复制编号</el-button>
                <el-button
                  size="small"
                  text
                  :type="['fail', 'failed', 'partial'].includes(selectedCase.status) ? 'info' : 'primary'"
                  @click="promoteRun"
                >{{ ['fail', 'failed', 'partial'].includes(selectedCase.status) ? '仍提升为 Baseline' : '提升为 Baseline' }}</el-button>
              </div>
            </div>
            <div v-if="caseProposals.length" class="know-block compact">
              <h4>本条可沉淀的知识</h4>
              <article v-for="row in caseProposals" :key="row.id" class="know-card">
                <header>
                  <strong>{{ row.title }}</strong>
                  <small>{{ SOURCE_LABEL[row.source] || '用例执行' }}</small>
                </header>
                <p v-if="row.question" class="know-q">{{ row.question }}</p>
                <el-input v-model="row.title" size="small" class="know-title" />
                <el-input v-model="row.content" type="textarea" :rows="4" />
                <div class="know-actions">
                  <el-button size="small" :loading="reviewingId === row.id" @click="rejectProposal(row)">跳过</el-button>
                  <el-button size="small" type="primary" :loading="reviewingId === row.id" @click="approveProposal(row)">录入并审核通过</el-button>
                </div>
              </article>
            </div>
            <p v-if="selectedCase.status === 'pending'" class="pending-hint">
              {{ runningCaseName ? `排队中，当前正在跑 ${runningCaseName}` : '排队中，等待执行' }}
            </p>
            <p v-else-if="selectedCase.status === 'cancelled' || selectedCase.status === 'skipped'" class="pending-hint">
              {{ selectedCase.summary || '该用例未执行或已取消' }}
            </p>
            <ExecutionTimeline
              class="tl"
              :run-id="showTimeline ? selectedCaseRunId : ''"
              :live="isLive && selectedCase?.status === 'running'"
              :case-summary="selectedCase?.summary || ''"
              :case-goal="headerMeta?.goal || selectedCase?.name || ''"
              :case-spec="selectedSpec"
            />
          </template>
          <el-empty v-else description="选择左侧用例查看详情" />
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
.title { color: #111827; font-weight: 700; font-size: 13px; }
.muted { color: #6b7280; }
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
.know-block {
  margin: 12px 0;
  padding: 12px 14px;
  background: #f8fafc;
  border: 1px solid #e3e8f0;
  border-radius: 12px;
}
.know-block.compact { margin: 8px 0 12px; }
.know-block h4 {
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 700;
}
.know-card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.know-card + .know-card { margin-top: 8px; }
.know-card header {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.know-card header strong { font-size: 13px; }
.know-card header small { font-size: 11px; color: #9ca3af; }
.know-q { margin: 0; font-size: 12px; color: #b45309; }
.know-title { margin-top: 0; }
.know-actions { display: flex; justify-content: flex-end; gap: 8px; }
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
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(200px, 240px) minmax(0, 1fr);
  gap: 12px;
  width: 100%;
}
.split.case-rail-collapsed {
  grid-template-columns: minmax(0, 1fr);
}
.split.case-rail-collapsed .case-list { display: none; }
.case-rail-toggle {
  align-self: flex-start;
  border: 1px solid #e3e8f0;
  background: #fff;
  border-radius: 8px;
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 600;
  color: #4f46e5;
  cursor: pointer;
  margin-bottom: 8px;
}
.case-list-toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}
.case-list-toolbar .case-tabs,
.case-list-toolbar .case-list-head { flex: 1; min-width: 0; }
.case-list {
  overflow: auto;
  padding: 8px;
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
.case-tabs {
  display: flex;
  gap: 4px;
  padding: 4px;
  margin-bottom: 6px;
  border-radius: 10px;
  background: #f1f5f9;
}
.case-tabs button {
  flex: 1;
  border: none;
  background: transparent;
  padding: 6px 8px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  color: #64748b;
  cursor: pointer;
}
.case-tabs button.active {
  background: #fff;
  color: #4f46e5;
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.06);
}
.pending-hint {
  margin: 0 0 8px;
  font-size: 12px;
  color: #64748b;
  flex-shrink: 0;
}
.case-row {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 10px;
  border: 1px solid transparent;
  border-left: 3px solid transparent;
  border-radius: 10px;
  background: transparent;
  cursor: pointer;
  text-align: left;
  margin-bottom: 4px;
  box-sizing: border-box;
  overflow: hidden;
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
.case-row.hitl { background: #fffbeb; border-left-color: #f59e0b; }
.case-row.limit { border-left-color: #8b5cf6; }
.tag-limit {
  --el-tag-bg-color: #f5f3ff !important;
  --el-tag-border-color: #c4b5fd !important;
  --el-tag-text-color: #6d28d9 !important;
}
.case-row.cancelled,
.case-row.skipped { border-left-color: #cbd5e1; opacity: 0.85; }
@keyframes case-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(52, 211, 153, 0.25); }
  50% { box-shadow: 0 0 0 4px rgba(52, 211, 153, 0.12); }
}
.case-top {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-start;
  gap: 6px;
  align-items: center;
  min-width: 0;
}
.case-top strong {
  font-size: 12px;
  line-height: 1.35;
  color: #111827;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
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
  .split { grid-template-columns: minmax(0, 1fr); }
  .metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>
