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
import { getAppAutomationConfig } from '@/api/appAutomation'
import { reviewKnowledgeItem } from '@/api/settings'
import { generatedCasesFromProcess } from '@/utils/qaProcess'
import { envLabel } from '@/constants/envProfiles'
import { normalizeCaseRow } from '@/utils/caseText'
import { clipText, slicePage, TABLE_PAGE_SIZES } from '@/utils/tablePage'
import { isGapRow, isProductFailRow, isUnverifiableRow, summarizeTaskCoverage } from '@/utils/caseCatalog'
import {
  apiErrorDetail,
  applyTestingTaskEvent,
  coverageLabel,
  formatElapsed,
  formatTaskDevices,
  formatTaskWhen,
  runKindLabel,
  taskElapsedMs,
  taskPackageLabel,
  isMissingTaskEndpoint,
  isStepLimitCase,
  platformLabel,
  progressStatus,
  shortDeviceLabel,
  statusLabel,
  statusTagType,
  taskCoverage,
  taskPlatformOfSn,
  taskProgressPct,
  taskSns,
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
const casePage = ref(1)
const casePageSize = ref(10)
const knowPage = ref(1)
const knowPageSize = ref(10)
const reviewingDraft = ref(null)
const reviewOpen = computed({
  get: () => Boolean(reviewingDraft.value),
  set: (open) => {
    if (!open) reviewingDraft.value = null
  },
})
const hitlPending = ref(null)
const cancelling = ref(false)
const retrying = ref(false)
const catalog = ref([])
const processMeta = ref({ requirements: [], releases: [] })

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
  if (isEmptySpecVal(merged.platform)) {
    const fromUnit = String(c.device_platform || '').trim()
    const fromMap = taskPlatformOfSn(task.value, c.sn)
    const taskPlat = String(task.value?.platform || '').trim()
    merged.platform = fromUnit || fromMap || (taskPlat && taskPlat !== 'mixed' ? taskPlat : '')
  }
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
const pagedRailCases = computed(() => slicePage(railCases.value, casePage.value, casePageSize.value))

const isLive = computed(() => task.value?.status === 'running')
const failedCases = computed(() => (task.value?.cases || []).filter(isProductFailRow))
const unverifiableCases = computed(() => (task.value?.cases || []).filter(isUnverifiableRow))
const gapCases = computed(() => (task.value?.cases || []).filter(isGapRow))
const coverageStats = computed(() => summarizeTaskCoverage(task.value?.cases || []))
const skippedCases = computed(() =>
  (task.value?.cases || []).filter((c) => ['cancelled', 'skipped', 'pending'].includes(c.status) && task.value?.status !== 'running'),
)
const progressPct = computed(() => taskProgressPct(task.value))
const headStats = computed(() => {
  const cases = task.value?.cases || []
  return {
    total: Number(task.value?.total || cases.length || 0),
    passed: Number(task.value?.passed || 0),
    failed: Number(task.value?.failed || 0),
    blocked: Number(task.value?.blocked || 0),
    running: cases.filter((c) => c.status === 'running').length,
    pending: cases.filter((c) => isPendingStatus(c.status)).length,
  }
})
const caseRailOpen = ref(true)
const selectedCase = computed(() =>
  (task.value?.cases || []).find((c) => caseRunIdOf(c) === selectedCaseRunId.value) || null,
)
const showTimeline = computed(() => {
  const s = selectedCase.value?.status
  return Boolean(selectedCaseRunId.value && s && !['pending', 'cancelled', 'skipped'].includes(s))
})
const releaseTitle = computed(() => {
  const id = String(task.value?.releaseId || '')
  if (!id) return ''
  return processMeta.value.releases.find((r) => r.id === id)?.title || ''
})
const requirementTitle = computed(() => {
  const id = String(task.value?.requirementId || '')
  if (!id) return ''
  return processMeta.value.requirements.find((r) => r.id === id)?.title || ''
})
const taskFacts = computed(() => {
  const t = task.value
  if (!t) return []
  const elapsed = formatElapsed(taskElapsedMs(t))
  const pkg = taskPackageLabel(t)
  const model = [t.providerName, t.modelName].filter(Boolean).join(' · ')
  const rows = [
    { k: '应用', v: t.appName || '' },
    { k: '环境', v: t.envProfile ? envLabel(t.envProfile) : '' },
    { k: '测试应用版本', v: releaseTitle.value },
    { k: '需求', v: requirementTitle.value },
    { k: '来源', v: runKindLabel(t) },
    { k: '测试包', v: pkg },
    { k: '端', v: platformLabel(t.platform) },
    { k: '覆盖', v: taskSns(t).length > 1 ? coverageLabel(taskCoverage(t)) : '' },
    { k: '设备', v: formatTaskDevices(t) },
    { k: '模型', v: model },
    { k: '开始', v: formatTaskWhen(t.startedAt) },
    { k: '结束', v: formatTaskWhen(t.finishedAt) },
    { k: '耗时', v: elapsed },
    { k: '任务编号', v: t.taskId || '' },
  ]
  return rows.filter((row) => row.v && row.v !== '—')
})
const headChips = computed(() => taskFacts.value
  .filter((row) => ['应用', '环境', '测试应用版本', '端', '测试包', '模型', '耗时'].includes(row.k))
  .slice(0, 6))
const factGroups = computed(() => {
  const map = Object.fromEntries(taskFacts.value.map((row) => [row.k, row.v]))
  if (!map['测试应用版本']) map['测试应用版本'] = '未绑定'
  return [
    { title: '测试对象', keys: ['应用', '环境', '测试应用版本', '测试包', '端'] },
    { title: '执行', keys: ['来源', '需求', '设备', '覆盖', '模型', '任务编号'] },
    { title: '时间', keys: ['开始', '结束', '耗时'] },
  ].map((group) => ({
    ...group,
    rows: group.keys.map((k) => ({ k, v: map[k] })).filter((row) => row.v),
  })).filter((group) => group.rows.length)
})
const isFactMuted = (row) => row.v === '未绑定'
const isFactMono = (row) => ['任务编号', '测试包'].includes(row.k)
const isMatrix = computed(() => taskCoverage(task.value) === 'per_device' && taskSns(task.value).length > 1)
const deviceLanes = computed(() => {
  const sns = taskSns(task.value)
  const cases = task.value?.cases || []
  const runningTask = task.value?.status === 'running' || task.value?.status === 'queued'
  return sns.map((sn) => {
    const units = cases.filter((c) => c.sn === sn)
    const running = units.find((c) => c.status === 'running')
    const pendingOwn = units.filter((c) => c.status === 'pending').length
    const unclaimed = cases.filter((c) => c.status === 'pending' && !c.sn).length
    const doneUnits = units.filter((c) => !['pending', 'queued', 'running'].includes(String(c.status || '')))
    let label = '已完成'
    let laneState = 'done'
    if (!runningTask) {
      const failed = units.filter((c) => ['fail', 'blocked', 'declined'].includes(c.status)).length
      if (!units.length) {
        label = '未执行'
        laneState = 'idle'
      } else {
        label = failed ? `${failed} 失败` : '已完成'
        laneState = failed ? 'fail' : 'done'
      }
    } else if (running?.hitl) {
      label = '等待人工确认'
      laneState = 'hitl'
    } else if (running) {
      label = `${running.name || running.case_id} · 执行中`
      laneState = 'run'
    } else if (isMatrix.value && pendingOwn) {
      label = `排队 ${pendingOwn}`
      laneState = 'idle'
    } else if (!isMatrix.value && unclaimed) {
      label = '空闲，待领'
      laneState = 'idle'
    } else if (!units.length) {
      label = '未领到用例'
      laneState = 'idle'
    } else if (doneUnits.length) {
      const failed = doneUnits.filter((c) => ['fail', 'blocked', 'declined'].includes(c.status)).length
      label = failed ? `${failed} 失败` : '已完成'
      laneState = failed ? 'fail' : 'done'
    }
    return {
      sn,
      label,
      hitl: Boolean(running?.hitl),
      running: Boolean(running),
      laneState,
      platform: taskPlatformOfSn(task.value, sn),
    }
  })
})
const matrixCaseIds = computed(() => {
  const seen = []
  for (const c of task.value?.cases || []) {
    if (c.case_id && !seen.includes(c.case_id)) seen.push(c.case_id)
  }
  return seen
})
const unitAt = (caseId, sn) => (task.value?.cases || []).find((c) => c.case_id === caseId && c.sn === sn)
const matrixCellClass = (cell) => {
  const s = String(cell?.status || 'pending')
  if (cell?.hitl) return 'hitl'
  if (s === 'pass') return 'pass'
  if (['fail', 'declined'].includes(s)) return 'fail'
  if (s === 'running') return 'run'
  if (s === 'blocked') return 'hitl'
  return 'wait'
}
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
const pendingKnowledge = computed(() => {
  const seen = new Set()
  const out = []
  for (const row of taskProposals.value) {
    if (!row?.id || seen.has(row.id)) continue
    seen.add(row.id)
    out.push({ ...row, from: 'task', case_id: '' })
  }
  for (const c of task.value?.cases || []) {
    for (const row of c.knowledge_proposals || []) {
      if (!row?.id || seen.has(row.id)) continue
      if ((row.review_status || 'pending') !== 'pending') continue
      seen.add(row.id)
      out.push({ ...row, from: 'case', case_id: c.case_id })
    }
  }
  return out
})
const pagedKnowledge = computed(() => slicePage(pendingKnowledge.value, knowPage.value, knowPageSize.value))
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

const keepReviewedProposals = (prev, next) => {
  if (!next) return next
  const reviewed = new Map()
  const collect = (list) => {
    for (const p of list || []) {
      if (p?.id && ['approved', 'rejected'].includes(p.review_status)) {
        reviewed.set(p.id, p.review_status)
      }
    }
  }
  collect(prev?.knowledge_proposals)
  for (const c of prev?.cases || []) collect(c.knowledge_proposals)
  if (!reviewed.size) return next
  const apply = (list) => (list || []).map((p) => (
    reviewed.has(p?.id) ? { ...p, review_status: reviewed.get(p.id) } : p
  ))
  return {
    ...next,
    knowledge_proposals: apply(next.knowledge_proposals),
    cases: (next.cases || []).map((c) => ({ ...c, knowledge_proposals: apply(c.knowledge_proposals) })),
  }
}

const loadTask = async ({ silent = false } = {}) => {
  if (!props.taskId) return
  if (!silent) loading.value = true
  try {
    let next = await fetchTaskDetail(props.taskId, props.seed)
    if (next && (!next.cases || !next.cases.length) && props.seed?.cases?.length) {
      next = { ...next, cases: props.seed.cases }
    }
    task.value = keepReviewedProposals(task.value, next)

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
      sn: c.sn || taskSns(task.value)[0] || task.value?.sn,
      sns: c.sn ? [c.sn] : taskSns(task.value),
      coverage: c.sn && taskCoverage(task.value) === 'per_device' ? 'once' : taskCoverage(task.value),
      platform: taskPlatformOfSn(task.value, c.sn) || 'android',
      case_ids: [c.case_id],
      async_exec: true,
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

const markProposalStatus = (id, status) => {
  const apply = (list) => {
    const hit = (list || []).find((k) => k?.id === id)
    if (hit) hit.review_status = status
  }
  apply(task.value?.knowledge_proposals)
  for (const c of task.value?.cases || []) apply(c.knowledge_proposals)
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
      origin_task_id: props.taskId,
    })
    markProposalStatus(row.id, 'approved')
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
    await reviewKnowledgeItem(row.id, { action: 'reject', origin_task_id: props.taskId })
    markProposalStatus(row.id, 'rejected')
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
    if (task.value) {
      task.value = keepReviewedProposals(task.value, applyTestingTaskEvent(task.value, data))
    }
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
    const r = await getAppAutomationConfig(props.appId)
    const proc = r?.data?.automation?.qa_process || {}
    const reqs = proc.requirements || []
    processMeta.value = { requirements: reqs, releases: proc.releases || [] }
    catalog.value = generatedCasesFromProcess(reqs)
  } catch (_) {
    catalog.value = []
    processMeta.value = { requirements: [], releases: [] }
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

watch([caseTab, () => railCases.value.length, selectedCaseRunId], () => {
  const idx = railCases.value.findIndex((c) => caseRunIdOf(c) === selectedCaseRunId.value)
  casePage.value = idx >= 0 ? Math.floor(idx / casePageSize.value) + 1 : 1
})

watch(() => pendingKnowledge.value.length, () => {
  knowPage.value = 1
})

const caseRowClass = ({ row }) => (caseRunIdOf(row) === selectedCaseRunId.value ? 'is-current' : '')

const openReview = (row) => {
  reviewingDraft.value = { ...row }
}

const saveReview = async () => {
  if (!reviewingDraft.value) return
  await approveProposal(reviewingDraft.value)
  reviewingDraft.value = null
}
</script>

<template>
  <div class="pane" v-loading="loading">
    <template v-if="task">
      <div class="pane-head">
        <div class="pane-head-main">
          <div class="pane-head-info">
            <div class="pane-head-title-row">
              <el-tag :type="statusTagType(task.status, task)" effect="dark" round>{{ statusLabel(task.status, task) }}</el-tag>
              <span class="title" :title="taskTitle(task)">{{ taskTitle(task) }}</span>
              <el-tag v-if="taskSns(task).length > 1" size="small" effect="plain" round>{{ coverageLabel(taskCoverage(task)) }}</el-tag>
            </div>
            <div class="pane-head-stats">
              <span>全部 {{ headStats.total }}</span>
              <span class="ok">通过 {{ coverageStats.pass || headStats.passed }}</span>
              <span class="bad">校验不通过 {{ coverageStats.product_fail }}</span>
              <span v-if="coverageStats.prep_insufficient">准备不足 {{ coverageStats.prep_insufficient }}</span>
              <span v-if="coverageStats.step_unexecutable">步骤无法执行 {{ coverageStats.step_unexecutable }}</span>
              <span v-if="coverageStats.expect_unverifiable" class="warn">无法验证 {{ coverageStats.expect_unverifiable }}</span>
              <span v-if="coverageStats.engine_error">引擎故障 {{ coverageStats.engine_error }}</span>
              <span v-if="coverageStats.untestable">测不了 {{ coverageStats.untestable }}</span>
              <span v-if="headStats.blocked">阻塞 {{ headStats.blocked }}</span>
              <span v-if="headStats.running">运行中 {{ headStats.running }}</span>
              <span v-if="headStats.pending">等待 {{ headStats.pending }}</span>
              <span v-if="coverageStats.productPassRate != null && displayTaskStatus(task) !== 'cancelled'">产品通过率 {{ coverageStats.productPassRate }}%</span>
              <span v-if="taskSns(task).length">设备 {{ formatTaskDevices(task) }}</span>
            </div>
            <div v-if="headChips.length" class="pane-head-chips">
              <span v-for="chip in headChips" :key="chip.k" class="head-chip" :title="`${chip.k} ${chip.v}`">
                <em>{{ chip.k }}</em>{{ chip.v }}
              </span>
            </div>
          </div>
          <div class="pane-head-actions">
            <slot name="actions" />
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
            >{{ failedCases.length ? '重跑校验不通过' : '重跑失败用例' }}</el-button>
          </div>
        </div>
        <div class="pane-progress">
          <el-progress
            :percentage="progressPct"
            :stroke-width="8"
            :show-text="false"
            :status="progressStatus(task)"
          />
          <span class="pane-progress-pct">{{ progressPct }}%</span>
        </div>
        <div v-if="deviceLanes.length > 1" class="device-lanes">
          <div
            v-for="lane in deviceLanes"
            :key="lane.sn"
            class="device-lane"
            :class="lane.laneState || { hitl: lane.hitl, run: lane.running }"
          >
            <strong>{{ shortDeviceLabel(lane.sn) }}</strong>
            <span :title="[platformLabel(lane.platform), lane.label].filter(Boolean).join(' · ')">{{ [platformLabel(lane.platform), lane.label].filter(Boolean).join(' · ') }}</span>
          </div>
        </div>
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
        <button type="button" :class="{ active: view === 'info' }" @click="view = 'info'">任务详情</button>
        <button type="button" :class="{ active: view === 'summary' }" @click="view = 'summary'">总结报表</button>
        <button type="button" :class="{ active: view === 'knowledge' }" @click="view = 'knowledge'">
          待审核知识<template v-if="pendingKnowledge.length"> {{ pendingKnowledge.length }}</template>
        </button>
      </div>

      <template v-if="view === 'info'">
        <div class="info-page">
          <section v-for="group in factGroups" :key="group.title" class="info-group">
            <div class="info-kicker">{{ group.title }}</div>
            <dl class="info-facts">
              <div v-for="row in group.rows" :key="row.k">
                <dt>{{ row.k }}</dt>
                <dd :class="{ muted: isFactMuted(row), mono: isFactMono(row) }">{{ row.v }}</dd>
              </div>
            </dl>
          </section>
        </div>
      </template>

      <template v-else-if="view === 'summary'">
        <div class="metrics">
          <div class="metric"><div class="k">产品通过率</div><div class="v">{{ coverageStats.productPassRate == null ? '—' : `${coverageStats.productPassRate}%` }}</div></div>
          <div class="metric"><div class="k">通过</div><div class="v ok">{{ coverageStats.pass || 0 }}</div></div>
          <div class="metric"><div class="k">校验不通过</div><div class="v bad">{{ coverageStats.product_fail || 0 }}</div></div>
          <div class="metric"><div class="k">无法验证</div><div class="v warn">{{ coverageStats.expect_unverifiable || 0 }}</div></div>
          <div class="metric"><div class="k">执行期缺口</div><div class="v warn">{{ coverageStats.gaps || 0 }}</div></div>
        </div>
        <div class="fail-block">
          <h4>校验不通过</h4>
          <el-table :data="failedCases" border stripe size="small" empty-text="没有校验不通过的用例">
            <el-table-column prop="case_id" label="用例" width="100" />
            <el-table-column prop="name" label="名称" min-width="110" />
            <el-table-column label="设备" width="128">
              <template #default="{ row }">
                {{ [platformLabel(row.device_platform || taskPlatformOfSn(task, row.sn)), shortDeviceLabel(row.sn)].filter(Boolean).join(' · ') || '—' }}
              </template>
            </el-table-column>
            <el-table-column label="状态" width="108">
              <template #default="{ row }">
                <el-tag :type="statusTagType(row.status, row)" size="small">{{ statusLabel(row.status, row) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="摘要" min-width="200">
              <template #default="{ row }">
                <span class="fail-summary">{{ row.summary || '—' }}</span>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="140" fixed="right">
              <template #default="{ row }">
                <el-button link type="primary" @click="selectCase(row)">看时间线</el-button>
                <el-button link type="primary" :disabled="retrying" @click="retryOne(row)">重跑</el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
        <div v-if="unverifiableCases.length" class="fail-block">
          <h4>无法验证（未观察到该性质：不算通过，也不当产品红）</h4>
          <el-table :data="unverifiableCases" border stripe size="small">
            <el-table-column prop="case_id" label="用例" width="100" />
            <el-table-column prop="name" label="名称" min-width="110" />
            <el-table-column label="状态" width="108">
              <template #default="{ row }">
                <el-tag :type="statusTagType(row.status, row)" size="small">{{ statusLabel(row.status, row) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="摘要" min-width="200">
              <template #default="{ row }">
                <span class="fail-summary">{{ row.summary || '—' }}</span>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="100" fixed="right">
              <template #default="{ row }">
                <el-button link type="primary" @click="selectCase(row)">看时间线</el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
        <div v-if="gapCases.length" class="fail-block">
          <h4>执行期缺口（改用例，不要当产品红重跑）</h4>
          <el-table :data="gapCases" border stripe size="small">
            <el-table-column prop="case_id" label="用例" width="100" />
            <el-table-column prop="name" label="名称" min-width="110" />
            <el-table-column label="缺口" width="140">
              <template #default="{ row }">
                <el-tag :type="statusTagType(row.status, row)" size="small">{{ statusLabel(row.status, row) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="摘要" min-width="200">
              <template #default="{ row }">
                <span class="fail-summary">{{ row.summary || '—' }}</span>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="100" fixed="right">
              <template #default="{ row }">
                <el-button link type="primary" @click="selectCase(row)">看时间线</el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
        <div v-if="skippedCases.length" class="fail-block">
          <h4>未执行 / 已取消</h4>
          <el-table :data="skippedCases" border stripe size="small">
            <el-table-column prop="case_id" label="用例" width="100" />
            <el-table-column prop="name" label="名称" min-width="110" />
            <el-table-column label="状态" width="80">
              <template #default="{ row }">
                <el-tag :type="statusTagType(row.status)" size="small">{{ statusLabel(row.status) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="摘要" min-width="200">
              <template #default="{ row }">
                <span class="fail-summary">{{ row.summary || '—' }}</span>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </template>

      <template v-else-if="view === 'knowledge'">
        <div class="fail-block knowledge-tab">
          <h4>待审核知识</h4>
          <div class="table-wrap">
          <el-table
            :data="pagedKnowledge"
            border
            stripe
            size="small"
            empty-text="本任务没有待审核知识"
            height="100%"
          >
            <el-table-column label="标题" min-width="160" show-overflow-tooltip prop="title" />
            <el-table-column label="来源" width="100">
              <template #default="{ row }">{{ SOURCE_LABEL[row.source] || (row.from === 'case' ? '用例执行' : '任务汇总') }}</template>
            </el-table-column>
            <el-table-column label="用例" width="100" show-overflow-tooltip>
              <template #default="{ row }">{{ row.case_id || '—' }}</template>
            </el-table-column>
            <el-table-column label="提问" min-width="140">
              <template #default="{ row }">
                <span class="fail-summary">{{ clipText(row.question, 60) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="知识内容" min-width="200">
              <template #default="{ row }">
                <span class="fail-summary">{{ clipText(row.content, 80) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="160" fixed="right">
              <template #default="{ row }">
                <el-button link type="primary" :loading="reviewingId === row.id" @click="openReview(row)">审核</el-button>
                <el-button link type="danger" :loading="reviewingId === row.id" @click="rejectProposal(row)">驳回</el-button>
              </template>
            </el-table-column>
          </el-table>
          </div>
          <el-pagination
            class="table-pager"
            background
            layout="total, sizes, prev, pager, next"
            :total="pendingKnowledge.length"
            :page-sizes="TABLE_PAGE_SIZES"
            v-model:page-size="knowPageSize"
            v-model:current-page="knowPage"
          />
        </div>
      </template>

      <template v-else>
        <div v-if="isMatrix" class="matrix-wrap">
          <div class="matrix" :style="{ gridTemplateColumns: `88px repeat(${deviceLanes.length}, minmax(64px, 1fr))` }">
            <span class="matrix-h">用例</span>
            <span v-for="lane in deviceLanes" :key="lane.sn" class="matrix-h">{{ shortDeviceLabel(lane.sn) }}</span>
            <template v-for="cid in matrixCaseIds" :key="cid">
              <span class="matrix-case">{{ cid }}</span>
              <button
                v-for="lane in deviceLanes"
                :key="`${cid}-${lane.sn}`"
                type="button"
                class="matrix-cell"
                :class="[matrixCellClass(unitAt(cid, lane.sn)), { active: caseRunIdOf(unitAt(cid, lane.sn) || {}) === selectedCaseRunId }]"
                @click="unitAt(cid, lane.sn) && selectCase(unitAt(cid, lane.sn))"
              >{{
                unitAt(cid, lane.sn)?.status === 'pass' ? '过'
                  : ['fail', 'declined'].includes(unitAt(cid, lane.sn)?.status) ? '败'
                    : unitAt(cid, lane.sn)?.status === 'running' ? '跑'
                      : ''
              }}</button>
            </template>
          </div>
        </div>
        <div class="split" :class="{ 'case-rail-collapsed': !caseRailOpen }">
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
            <el-button text size="small" @click="caseRailOpen = false">收起列表</el-button>
          </div>
          <div class="table-wrap">
            <el-table
              :data="pagedRailCases"
              border
              stripe
              size="small"
              highlight-current-row
              :row-class-name="caseRowClass"
              empty-text="暂无用例"
              height="100%"
              @row-click="selectCase"
            >
              <el-table-column label="状态" width="72">
                <template #default="{ row }">
                  <el-tag
                    :type="statusTagType(row.status, row)"
                    size="small"
                    effect="light"
                    :class="{ 'tag-limit': isStepLimitCase(row) }"
                  >{{ statusLabel(row.status, row) }}</el-tag>
                </template>
              </el-table-column>
              <el-table-column prop="case_id" label="编号" width="88" show-overflow-tooltip />
              <el-table-column label="名称" min-width="108" show-overflow-tooltip>
                <template #default="{ row }">{{ row.name || row.summary || '—' }}</template>
              </el-table-column>
              <el-table-column label="设备" width="100" show-overflow-tooltip>
                <template #default="{ row }">{{ shortDeviceLabel(row.sn) || '—' }}</template>
              </el-table-column>
            </el-table>
          </div>
          <el-pagination
            class="table-pager compact"
            background
            small
            layout="total, prev, pager, next"
            :total="railCases.length"
            :page-size="casePageSize"
            v-model:current-page="casePage"
          />
        </div>
        <div class="timeline-pane">
          <div class="tl-toolbar">
            <el-button v-if="!caseRailOpen" size="small" @click="caseRailOpen = true">展开用例列表</el-button>
            <template v-if="selectedCase">
              <strong class="tl-title" :title="selectedCaseRunId">{{ selectedCase.case_id || selectedCaseRunId }}<template v-if="selectedCase.sn"> · {{ shortDeviceLabel(selectedCase.sn) }}</template></strong>
              <el-tag
                v-if="selectedCase.status"
                :type="statusTagType(selectedCase.status, selectedCase)"
                size="small"
                :class="{ 'tag-limit': isStepLimitCase(selectedCase) }"
              >{{ statusLabel(selectedCase.status, selectedCase) }}</el-tag>
              <span v-if="headerMeta?.elapsed && !headerMeta.live" class="muted">{{ formatElapsed(headerMeta.elapsed) }}</span>
              <span class="tl-toolbar-spacer" />
              <el-button size="small" text @click="copyRunId">复制编号</el-button>
              <el-button
                v-if="headerMeta && !headerMeta.live"
                size="small"
                text
                :type="['fail', 'failed', 'partial'].includes(selectedCase.status) ? 'info' : 'primary'"
                @click="promoteRun"
              >{{ ['fail', 'failed', 'partial'].includes(selectedCase.status) ? '仍提升为 Baseline' : '提升为 Baseline' }}</el-button>
            </template>
          </div>
          <template v-if="selectedCase">
            <div v-if="caseProposals.length" class="know-block compact">
              <h4>本条可沉淀的知识 <small>{{ caseProposals.length }}</small></h4>
              <article v-for="row in caseProposals" :key="row.id" class="know-card">
                <header>
                  <el-input v-model="row.title" size="small" class="know-title" placeholder="知识标题" />
                  <small>{{ SOURCE_LABEL[row.source] || '用例执行' }}</small>
                </header>
                <p v-if="row.question" class="know-q">{{ row.question }}</p>
                <el-input
                  v-model="row.content"
                  type="textarea"
                  class="know-body"
                  :autosize="{ minRows: 2, maxRows: 5 }"
                />
                <div class="know-actions">
                  <el-button link :loading="reviewingId === row.id" @click="rejectProposal(row)">跳过</el-button>
                  <el-button link type="primary" :loading="reviewingId === row.id" @click="approveProposal(row)">录入并通过</el-button>
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
              :case-coverage="selectedCase?.coverage || null"
            />
          </template>
          <el-empty v-else description="选择左侧用例查看详情" />
        </div>
      </div>
      </template>
    </template>
    <el-empty v-else-if="!loading" description="无法加载该任务" />
    <el-dialog
      v-model="reviewOpen"
      title="审核知识"
      width="560px"
      destroy-on-close
    >
      <el-form v-if="reviewingDraft" label-width="72px">
        <el-form-item label="标题">
          <el-input v-model="reviewingDraft.title" />
        </el-form-item>
        <el-form-item v-if="reviewingDraft.question" label="提问">
          <p class="know-q">{{ reviewingDraft.question }}</p>
        </el-form-item>
        <el-form-item label="内容">
          <el-input v-model="reviewingDraft.content" type="textarea" :rows="8" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="reviewingDraft = null">取消</el-button>
        <el-button type="primary" :loading="!!reviewingId" @click="saveReview">录入知识库</el-button>
      </template>
    </el-dialog>
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
  overflow: hidden;
}
.device-lanes {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 8px;
  margin-top: 10px;
}
.device-lane {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 10px;
  border: 1px solid #e3e8f0;
  border-radius: 10px;
  background: #f8fafc;
}
.device-lane strong { font-size: 12px; color: #111827; }
.device-lane span {
  font-size: 11px;
  color: #6b7280;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.matrix-wrap {
  flex-shrink: 0;
  overflow-x: auto;
  padding: 4px 2px 2px;
}
.matrix {
  display: grid;
  gap: 6px;
  min-width: 320px;
  align-items: center;
}
.matrix-h, .matrix-case { font-size: 11px; color: #6b7280; }
.matrix-h { font-weight: 650; color: #374151; }
.matrix-cell {
  height: 28px;
  border: none;
  border-radius: 6px;
  background: #e5e7eb;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
}
.matrix-cell.pass { background: #34d399; }
.matrix-cell.fail { background: #f87171; }
.matrix-cell.run { background: #6366f1; }
.matrix-cell.hitl { background: #f59e0b; }
.matrix-cell.wait { background: #e5e7eb; color: transparent; }
.matrix-cell.active { outline: 2px solid #111827; }
.pane-head {
  padding: 2px 2px 12px;
  border: none;
  border-radius: 0;
  background: transparent;
  border-bottom: 1px solid #eef2f7;
  flex-shrink: 0;
}
.pane-head-main {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}
.pane-head-info {
  min-width: 0;
  flex: 1;
}
.pane-head-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.pane-head-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
  font-size: 12px;
  color: #64748b;
}
.pane-head-stats > span {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  background: #f1f5f9;
  color: #475569;
  font-weight: 600;
}
.pane-head-stats .ok { background: #ecfdf5; color: #059669; }
.pane-head-stats .bad { background: #fef2f2; color: #dc2626; }
.pane-head-stats .warn { background: #fffbeb; color: #d97706; }
.pane-head-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}
.head-chip {
  display: inline-flex;
  align-items: baseline;
  gap: 5px;
  max-width: min(360px, 100%);
  min-height: 22px;
  padding: 2px 8px;
  border-radius: 8px;
  background: #f8fafc;
  border: 1px solid #e8edf4;
  color: #334155;
  font-size: 12px;
  line-height: 1.35;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.head-chip em {
  flex-shrink: 0;
  font-style: normal;
  font-size: 11px;
  font-weight: 700;
  color: #94a3b8;
}
.info-page {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  flex: 1;
  min-height: 0;
  overflow: auto;
  align-items: start;
}
.info-group {
  padding: 0;
  border: 1px solid #e3e8f0;
  border-radius: 14px;
  background: #fff;
  min-width: 0;
  overflow: hidden;
}
.info-kicker {
  color: #4f46e5;
  font-size: 12px;
  font-weight: 800;
  padding: 10px 14px;
  background: #f8fafc;
  border-bottom: 1px solid #eef2f7;
}
.info-facts {
  display: grid;
  gap: 0;
  margin: 0;
  padding: 4px 14px 10px;
}
.info-facts > div {
  display: grid;
  grid-template-columns: 88px minmax(0, 1fr);
  gap: 10px;
  align-items: start;
  padding: 9px 0;
  border-bottom: 1px solid #f1f5f9;
}
.info-facts > div:last-child {
  border-bottom: 0;
}
.info-facts dt {
  color: #94a3b8;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.02em;
  padding-top: 2px;
}
.info-facts dd {
  margin: 0;
  color: #111827;
  font-size: 13px;
  line-height: 1.45;
  overflow-wrap: anywhere;
}
.info-facts dd.muted { color: #94a3b8; }
@media (max-width: 1100px) {
  .info-page {
    grid-template-columns: 1fr;
  }
}
.pane-head-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  flex-shrink: 0;
}
@media (max-width: 1100px) {
  .pane-head-main {
    flex-direction: column;
    align-items: stretch;
  }
  .pane-head-actions {
    justify-content: flex-start;
  }
}
.pane-progress {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 8px;
}
.pane-progress :deep(.el-progress) {
  flex: 1;
  min-width: 0;
}
.pane-progress :deep(.el-progress-bar__outer) {
  overflow: hidden;
}
.pane-progress-pct {
  width: 40px;
  flex-shrink: 0;
  text-align: right;
  font-size: 12px;
  font-weight: 650;
  color: #4b5563;
}
.mono { font-family: ui-monospace, monospace; color: #111827; font-weight: 600; }
.title {
  color: #111827;
  font-weight: 800;
  font-size: 16px;
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.fail-summary {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  white-space: normal;
  word-break: break-word;
  line-height: 1.45;
  color: #4b5563;
}
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
  margin: 0 0 10px;
  padding: 10px 12px 8px;
  background: #fff;
  border: 1px solid #e3e8f0;
  border-radius: 12px;
  flex-shrink: 0;
  max-height: min(42vh, 420px);
  overflow: auto;
}
.know-block.compact { margin: 0 0 10px; }
.know-block h4 {
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 700;
}
.know-block h4 small {
  margin-left: 6px;
  color: #94a3b8;
  font-size: 12px;
  font-weight: 600;
}
.know-card {
  background: #f8fafc;
  border: 1px solid #e8edf4;
  border-radius: 10px;
  padding: 8px 10px 6px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.know-card + .know-card { margin-top: 8px; }
.know-card header {
  display: flex;
  align-items: center;
  gap: 8px;
}
.know-card header small {
  flex-shrink: 0;
  font-size: 11px;
  color: #94a3b8;
}
.know-q {
  margin: 0;
  font-size: 12px;
  color: #b45309;
  line-height: 1.4;
}
.know-title { flex: 1; min-width: 0; }
.know-title :deep(.el-input__wrapper) {
  box-shadow: none !important;
  background: transparent;
  padding-left: 0;
}
.know-title :deep(.el-input__inner) {
  font-weight: 700;
  font-size: 13px;
  color: #111827;
}
.know-body :deep(.el-textarea__inner) {
  box-shadow: none;
  background: #fff;
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 13px;
  line-height: 1.55;
  color: #334155;
}
.know-actions { display: flex; justify-content: flex-end; gap: 2px; }
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
.knowledge-tab {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.knowledge-tab h4 { flex-shrink: 0; margin: 0 0 8px; }
.knowledge-tab .table-wrap { min-height: 200px; }
.fail-block :deep(.el-table .cell) {
  white-space: normal;
  line-height: 1.45;
}
.fail-block :deep(.el-popper) {
  max-width: min(480px, 70vw);
  white-space: pre-wrap;
  word-break: break-word;
}
.split {
  flex: 1;
  min-height: 0;
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(340px, 400px) minmax(0, 1fr);
  gap: 12px;
  width: 100%;
}
.split.case-rail-collapsed {
  grid-template-columns: minmax(0, 1fr);
}
.split.case-rail-collapsed .case-list { display: none; }
.case-list-toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
  flex-shrink: 0;
}
.case-list-toolbar .case-tabs,
.case-list-toolbar .case-list-head { flex: 1; min-width: 0; }
.case-list {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  padding: 8px;
  border: 1px solid #e3e8f0;
  border-radius: 14px;
  background: #fff;
}
.table-wrap {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.table-pager {
  display: flex;
  justify-content: flex-end;
  padding: 8px 0 0;
  flex-shrink: 0;
}
.table-pager.compact { padding-top: 6px; }
.case-list :deep(.el-table .el-table__row) { cursor: pointer; }
.case-list :deep(.el-table .el-table__row.is-current) {
  background: #eef2ff !important;
}
.case-list-head {
  display: flex;
  justify-content: space-between;
  padding: 2px 4px;
  font-size: 12px;
  color: #6b7280;
}
.case-list-head strong { color: #111827; }
.case-tabs {
  display: flex;
  gap: 4px;
  padding: 4px;
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
.tag-limit {
  --el-tag-bg-color: #f5f3ff !important;
  --el-tag-border-color: #c4b5fd !important;
  --el-tag-text-color: #6d28d9 !important;
}
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
.tl-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 8px;
  flex-shrink: 0;
}
.tl-toolbar-spacer { flex: 1; min-width: 8px; }
.tl-title {
  font-size: 12px;
  font-weight: 600;
  font-family: ui-monospace, monospace;
  color: #111827;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tl { flex: 1; min-height: 0; width: 100%; overflow: auto; padding-top: 4px; }
@media (max-width: 1100px) {
  .split {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(200px, 32vh) minmax(0, 1fr);
  }
  .split.case-rail-collapsed { grid-template-rows: minmax(0, 1fr); }
  .metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>

<style>
.el-popper.is-dark {
  max-width: min(520px, 80vw);
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.5;
}
</style>
