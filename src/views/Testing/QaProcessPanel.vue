<script setup>
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useQaProcess } from '@/composables/useQaProcess'
import QaScheduleBoard from '@/views/Testing/QaScheduleBoard.vue'
import QaFlowPipeline from '@/views/Testing/QaFlowPipeline.vue'
import { assistQaProcess } from '@/api/appAutomation'
import { suiteCaseIds } from '@/utils/caseLibrary'
import { slicePage, TABLE_PAGE_SIZES } from '@/utils/tablePage'
import {
  RUN_KINDS,
  applyCoverage,
  assistInputHash,
  bmWatchStatus,
  canAdvanceRel,
  canAdvanceReq,
  caseRequirementId,
  casesForRequirement,
  coverageStats,
  createRelease,
  createRequirement,
  createSlot,
  extractUnderstanding,
  emptyUnderstanding,
  formatShortTime,
  fromDateEnd,
  fromDateStart,
  formatShortDate,
  gateHint,
  gatePassed,
  isNextGate,
  goNoGoReport,
  latestArtifact,
  linkedCaseIds,
  matchCaseIds,
  nowIso,
  reqOptionLabel,
  reqSigned,
  runAssistJob,
  signOffReport,
  upsertArtifact,
  visibleArtifact,
} from '@/utils/qaProcess'
import {
  detailTabsFor,
  dispatchSteps,
  findStep,
  hasReached,
  kindAssistJob,
  kindTab,
  nextStep,
  previousStepOfKind,
  resolveWorkflow,
  trackSteps,
  understood,
  envLabel,
} from '@/utils/qaWorkflow'
import { envSummaries, filledEnvKeys, pipelineKeys } from '@/constants/envProfiles'
import { getProjectEnv } from '@/api/workReport'
import { shortTaskId, statusLabel, statusTagType, taskCountLabel, displayTaskStatus } from '@/utils/testingTasks'
import '@/views/Settings/settings-ui.css'

const props = defineProps({
  appId: { type: String, required: true },
  appName: { type: String, default: '' },
  projectId: { type: String, default: '' },
  cases: { type: Array, default: () => [] },
  tasks: { type: Array, default: () => [] },
  suites: { type: Array, default: () => [] },
  devices: { type: Array, default: () => [] },
  board: { type: String, default: 'rel' },
  selectedId: { type: String, default: '' },
})

const emit = defineEmits(['dispatch-run', 'open-task', 'go-tab', 'update:board', 'update:selectedId'])

const appIdRef = computed(() => props.appId)
const {
  requirements,
  releases,
  schedule,
  workflow,
  loading,
  saving,
  load,
  persist,
  persistSoon,
  upsertReq,
  removeReq,
  upsertRel,
  removeRel,
  upsertSlot,
  removeSlot,
  attachRun,
} = useQaProcess(appIdRef)

const envSnap = ref({ summaries: [], filledKeys: [], pipeline: [] })
const loadEnvSnap = async () => {
  if (!props.projectId) {
    envSnap.value = { summaries: [], filledKeys: [], pipeline: [] }
    return
  }
  try {
    const res = await getProjectEnv(props.projectId)
    const data = res?.data || res || {}
    const env = data.env || data
    envSnap.value = {
      summaries: envSummaries(env),
      filledKeys: filledEnvKeys(env),
      pipeline: pipelineKeys(env),
    }
  } catch {
    envSnap.value = { summaries: [], filledKeys: [], pipeline: [] }
  }
}
const envTitle = (key) => envSnap.value.summaries.find((s) => s.key === key)?.label || envLabel(key)
const envFilled = (key) => {
  const hit = envSnap.value.summaries.find((s) => s.key === key)
  if (!hit) return !envSnap.value.filledKeys.length
  return hit.filled
}
const ensureEnvReady = (env) => {
  if (!envSnap.value.filledKeys.length) return true
  if (envFilled(env)) return true
  ElMessage.warning(`${envTitle(env)}环境还没填渠道标识，先去「配置 → 环境配置」填好再下发`)
  return false
}

const board = computed({
  get: () => (props.board === 'req' || props.board === 'sch' ? props.board : 'rel'),
  set: (v) => emit('update:board', v),
})
const selectedId = computed({
  get: () => props.selectedId,
  set: (v) => emit('update:selectedId', v || ''),
})

const gateFilter = ref('all')
const page = ref(1)
const pageSize = ref(20)
const detailTab = ref(props.board === 'req' ? 'understand' : 'scope')
const assisting = ref(false)
let assistChain = Promise.resolve()
const createOpen = ref(false)
const creatingRel = ref(false)
const draft = reactive({
  title: '',
  external_id: '',
  source_url: '',
  source_text: '',
  requirement_ids: [],
  release_id: '',
  case_ids: [],
  test_start: '',
  test_end: '',
  review_at: '',
  online_at: '',
})
const scheduleBoard = ref(null)

const wf = computed(() => resolveWorkflow(workflow.value))
const reqSteps = computed(() => trackSteps(wf.value, 'req'))
const relSteps = computed(() => trackSteps(wf.value, 'rel'))
const reqDispatchSteps = computed(() => dispatchSteps(wf.value, 'req'))
const relDispatchSteps = computed(() => dispatchSteps(wf.value, 'rel'))
const reqDetailTabs = computed(() => detailTabsFor(wf.value, 'req'))
const relDetailTabs = computed(() => detailTabsFor(wf.value, 'rel'))
const reqStep = computed(() => findStep(wf.value, 'req', selectedReq.value?.gate))
const relStep = computed(() => findStep(wf.value, 'rel', selectedRel.value?.gate))
const reqKindIs = (...kinds) => kinds.includes(reqStep.value?.kind)
const relKindIs = (...kinds) => kinds.includes(relStep.value?.kind)
const reqCanEditCover = computed(() => reqKindIs('understand', 'cover'))
const relCanEditScope = computed(() => relKindIs('scope'))
const reqCanSign = computed(() => {
  if (reqKindIs('human_verdict')) return true
  const n = nextStep(wf.value, 'req', selectedReq.value?.gate)
  return reqKindIs('dispatch') && n?.kind === 'human_verdict'
})
const relCanVerdict = computed(() => {
  if (relKindIs('human_verdict')) return true
  const n = nextStep(wf.value, 'rel', selectedRel.value?.gate)
  return relKindIs('dispatch') && n?.kind === 'human_verdict'
})
const reqNext = computed(() => nextStep(wf.value, 'req', selectedReq.value?.gate))
const relNext = computed(() => nextStep(wf.value, 'rel', selectedRel.value?.gate))

const syncDetailTab = (track, gate) => {
  const step = findStep(wf.value, track, gate)
  detailTab.value = kindTab(step?.kind) || (track === 'rel' ? 'scope' : 'understand')
}

const dispatchLabel = (step) => `下发${RUN_KINDS[step.run]?.label || step.label}（${envTitle(step.env)}）`
const canDispatchReqStep = (step) => {
  const req = selectedReq.value
  if (!req || step?.kind !== 'dispatch' || reqKindIs('archive')) return false
  if (!understood(req, wf.value)) return false
  return hasReached(wf.value, 'req', req.gate, step.id)
}
const canDispatchRelStep = (step) => {
  const rel = selectedRel.value
  if (!rel || step?.kind !== 'dispatch' || relKindIs('archive')) return false
  return hasReached(wf.value, 'rel', rel.gate, step.id)
}

const watchStatus = computed(() => bmWatchStatus({
  requirements: requirements.value,
  releases: releases.value,
  tasks: props.tasks,
  workflow: wf.value,
}))

const selectedReq = computed(() => requirements.value.find((r) => r.id === selectedId.value) || null)
const selectedRel = computed(() => releases.value.find((r) => r.id === selectedId.value) || null)
const selected = computed(() => (board.value === 'rel' ? selectedRel.value : selectedReq.value))

const reqRows = computed(() => {
  let list = requirements.value
  if (gateFilter.value !== 'all') list = list.filter((r) => r.gate === gateFilter.value)
  return list
})
const relRows = computed(() => {
  let list = releases.value
  if (gateFilter.value !== 'all') list = list.filter((r) => r.gate === gateFilter.value)
  return list
})
const tableRows = computed(() => (board.value === 'rel' ? relRows.value : reqRows.value))
const pagedRows = computed(() => slicePage(tableRows.value, page.value, pageSize.value))

const reqStats = computed(() => (selectedReq.value ? coverageStats(selectedReq.value) : null))
const reqReport = computed(() => (selectedReq.value ? signOffReport(selectedReq.value, props.tasks) : null))
const relReport = computed(() => (selectedRel.value ? goNoGoReport(selectedRel.value, requirements.value, props.tasks, wf.value) : null))
const joinableReqs = computed(() => requirements.value)
const caseOptions = computed(() => (props.cases || []).map((c) => ({
  id: c.case_id,
  label: `${c.case_id} · ${c.name || c.title || ''}${c.requirement_id ? ` · ${c.requirement_id}` : ''}`,
})))
const exactCaseIds = computed(() => (
  selectedReq.value ? casesForRequirement(props.cases, selectedReq.value) : []
))

const compactCases = () => (props.cases || []).map((c) => ({
  case_id: c.case_id,
  name: c.name || c.title,
  module: c.module,
  requirement_id: caseRequirementId(c),
}))

const compactTasks = (entity) => {
  const ids = new Set((entity?.runs || []).map((r) => r.task_id).filter(Boolean))
  return (props.tasks || []).filter((t) => ids.has(t.taskId)).map((t) => ({
    taskId: t.taskId,
    status: t.status,
    failed: t.failed,
    blocked: t.blocked,
    passed: t.passed,
    cases: (t.cases || []).map((c) => ({
      case_id: c.case_id,
      name: c.name,
      status: c.status,
      error: c.error || c.summary || '',
      message: c.message || c.summary || '',
    })),
  }))
}

const compactReqs = () => requirements.value.map((r) => ({
  id: r.id,
  title: r.title,
  gate: r.gate,
  signoff: r.signoff,
  case_ids: r.case_ids || [],
  understanding: {
    points: (r.understanding?.points || []).map((p) => ({
      id: p.id,
      text: p.text,
      case_ids: p.case_ids || [],
      waived: p.waived,
    })),
  },
}))

const reqAssistJob = computed(() => {
  if (detailTab.value === 'cases') return 'map_cases'
  if (detailTab.value === 'report') return 'draft_sign'
  return kindAssistJob(reqStep.value?.kind, 'req')
})
const relAssistJob = computed(() => {
  if (detailTab.value === 'scope') return 'pick_regression'
  if (detailTab.value === 'report') return 'draft_gate'
  return kindAssistJob(relStep.value?.kind, 'rel')
})

const reqMapHash = computed(() => (
  selectedReq.value
    ? assistInputHash({ job: 'map_cases', req: selectedReq.value, cases: props.cases, tasks: props.tasks })
    : ''
))
const reqSignHash = computed(() => (
  selectedReq.value
    ? assistInputHash({ job: 'draft_sign', req: selectedReq.value, cases: props.cases, tasks: props.tasks })
    : ''
))
const relPickHash = computed(() => (
  selectedRel.value
    ? assistInputHash({ job: 'pick_regression', rel: selectedRel.value, cases: props.cases, tasks: props.tasks, requirements: requirements.value })
    : ''
))
const relGateHash = computed(() => (
  selectedRel.value
    ? assistInputHash({ job: 'draft_gate', rel: selectedRel.value, cases: props.cases, tasks: props.tasks, requirements: requirements.value })
    : ''
))

const reqMapArt = computed(() => visibleArtifact(selectedReq.value, 'map_cases', reqMapHash.value))
const reqSignArt = computed(() => visibleArtifact(selectedReq.value, 'draft_sign', reqSignHash.value))
const relPickArt = computed(() => visibleArtifact(selectedRel.value, 'pick_regression', relPickHash.value))
const relGateArt = computed(() => visibleArtifact(selectedRel.value, 'draft_gate', relGateHash.value))
const reqAssistArt = computed(() => (reqAssistJob.value === 'map_cases' ? reqMapArt.value : reqSignArt.value))
const relAssistArt = computed(() => (relAssistJob.value === 'pick_regression' ? relPickArt.value : relGateArt.value))

const mapForPoint = (pointId) => (reqMapArt.value?.payload?.mappings || []).find((m) => m.point_id === pointId)
const gapForPoint = (pointId) => (reqMapArt.value?.payload?.gaps || []).find((g) => g.point_id === pointId)
const reqFailItems = computed(() => reqSignArt.value?.payload?.fails?.items || [])
const reqRerunIds = computed(() => reqSignArt.value?.payload?.fails?.rerun_ids || [])
const relFailItems = computed(() => relGateArt.value?.payload?.fails?.items || [])
const relRerunIds = computed(() => relGateArt.value?.payload?.fails?.rerun_ids || [])

const inventory = computed(() => {
  const reqs = requirements.value
  const cases = props.cases || []
  const withReqCol = cases.filter((c) => caseRequirementId(c)).length
  const linked = reqs.reduce((n, r) => n + linkedCaseIds(r).length, 0)
  return { reqs: reqs.length, cases: cases.length, withReqCol, linked }
})
const unsignedOnRel = (rel) => (rel?.requirement_ids || []).filter((id) => {
  const req = requirements.value.find((r) => r.id === id)
  return req && !reqSigned(req, wf.value)
}).length

const emptyText = computed(() => {
  if (board.value === 'rel') {
    return releases.value.length
      ? '没有符合筛选的版本单'
      : '先建版本、定开测日期，再把需求挂进来。没验收的需求可以挂上，但不能当成发版通过的依据。'
  }
  return requirements.value.length ? '没有符合筛选的需求单' : '需求可随时进单。贴正文或填编号对照飞书；功能测试仍按需求在测试环境跑。'
})

const pillStyle = computed(() => {
  if (watchStatus.value.id === 'blocked') return { background: '#fffbeb', color: '#b45309' }
  if (watchStatus.value.id === 'dispatching') return { background: '#eef2ff', color: '#4338ca' }
  return undefined
})

const taskOf = (taskId) => props.tasks.find((t) => t.taskId === taskId) || null

const caseName = (id) => {
  const hit = (props.cases || []).find((c) => c.case_id === id)
  return hit ? `${id} · ${hit.name || hit.title || ''}` : id
}

const setBoard = (next) => {
  board.value = next
  gateFilter.value = 'all'
  page.value = 1
  if (next === 'sch') selectedId.value = ''
  if (next === 'req' && selectedRel.value) selectedId.value = ''
  if (next === 'rel' && selectedReq.value) selectedId.value = ''
  if (next === 'req' || next === 'rel') {
    syncDetailTab(next, next === 'rel' ? selectedRel.value?.gate : selectedReq.value?.gate)
  }
}

const scheduleCurrent = async (kind) => {
  const seed = {
    kind,
    requirement_id: selectedReq.value?.id || '',
    release_id: selectedRel.value?.id || '',
  }
  board.value = 'sch'
  await nextTick()
  scheduleBoard.value?.openCreate(seed)
}

const selectRow = (row) => {
  if (!row?.id) return
  selectedId.value = row.id
  syncDetailTab(board.value === 'rel' ? 'rel' : 'req', row.gate)
}

const rowClass = ({ row }) => (row.id === selectedId.value ? 'is-current' : '')

const resetDraft = () => {
  draft.title = ''
  draft.external_id = ''
  draft.source_url = ''
  draft.source_text = ''
  draft.requirement_ids = []
  draft.release_id = ''
  draft.case_ids = []
  draft.test_start = ''
  draft.test_end = ''
  draft.review_at = ''
  draft.online_at = ''
}

const openCreate = () => {
  creatingRel.value = board.value === 'rel'
  resetDraft()
  createOpen.value = true
}

const submitCreate = async () => {
  if (creatingRel.value) {
    if (!draft.title.trim()) { ElMessage.warning('请填写版本名称'); return }
    const rel = createRelease({
      title: draft.title,
      requirement_ids: [...draft.requirement_ids],
      workflow: wf.value,
    })
    rel.plan = {
      test_start: fromDateStart(draft.test_start),
      test_end: fromDateEnd(draft.test_end || draft.test_start),
      online_at: fromDateStart(draft.online_at),
    }
    const caseSet = new Set()
    for (const id of rel.requirement_ids) {
      const req = requirements.value.find((r) => r.id === id)
      linkedCaseIds(req).forEach((cid) => caseSet.add(cid))
    }
    const smoke = (props.suites || []).find((s) => /冒烟|smoke/i.test(s.name || ''))
    if (smoke) suiteCaseIds(smoke, props.cases).forEach((cid) => caseSet.add(cid))
    rel.case_ids = [...caseSet]
    await upsertRel(rel)
    await addPlanSlots({ releaseId: rel.id })
    selectedId.value = rel.id
    createOpen.value = false
    ElMessage.success('版本已创建。需求可以后补。没验收的不能当成发版通过的依据。')
    return
  }
  if (!draft.title.trim()) { ElMessage.warning('请填写需求名称'); return }
  const req = createRequirement({
    title: draft.title,
    external_id: draft.external_id,
    source_url: draft.source_url,
    source_text: draft.source_text,
    workflow: wf.value,
  })
  req.plan = {
    test_start: '',
    test_end: '',
    review_at: '',
    online_at: '',
  }
  const exact = casesForRequirement(props.cases, req)
  const matched = matchCaseIds(req.understanding, props.cases, req)
  req.case_ids = [...new Set([...(draft.case_ids || []), ...exact, ...matched])]
  await upsertReq(req)
  if (draft.release_id) {
    const rel = releases.value.find((r) => r.id === draft.release_id)
    if (rel) {
      await upsertRel({
        ...rel,
        requirement_ids: [...new Set([...(rel.requirement_ids || []), req.id])],
      })
    }
  }
  board.value = 'req'
  selectedId.value = req.id
  createOpen.value = false
  const hung = draft.release_id && releases.value.some((r) => r.id === draft.release_id)
  ElMessage.success(
    draft.source_text.trim()
      ? (hung ? '已列出验收标准并挂到版本，请确认是否理解对' : '已列出验收标准，请确认是否理解对')
      : (hung ? '需求已挂到版本。评审通过前不能开功能测试。' : '需求已建好。可再挂到版本；评审通过前不能开功能测试。'),
  )
}

const addPlanSlots = async ({ requirementId = '', releaseId = '' }) => {
  const jobs = []
  if (draft.test_start) {
    jobs.push(upsertSlot(createSlot({
      kind: releaseId ? 'rel_test' : 'req_test',
      requirement_id: requirementId,
      release_id: releaseId,
      sns: [],
      start_at: fromDateStart(draft.test_start),
      end_at: fromDateEnd(draft.test_end || draft.test_start),
      title: draft.title,
    })))
  }
  if (draft.review_at && requirementId) {
    jobs.push(upsertSlot(createSlot({
      kind: 'req_review',
      requirement_id: requirementId,
      start_at: fromDateStart(draft.review_at),
      end_at: fromDateEnd(draft.review_at),
      title: draft.title,
    })))
  }
  if (draft.online_at) {
    jobs.push(upsertSlot(createSlot({
      kind: releaseId ? 'rel_online' : 'req_online',
      requirement_id: requirementId,
      release_id: releaseId,
      start_at: fromDateStart(draft.online_at),
      end_at: fromDateEnd(draft.online_at),
      title: draft.title,
    })))
  }
  if (jobs.length) await Promise.all(jobs)
}

const onSaveSlot = (slot) => upsertSlot(slot)
const onRemoveSlot = (id) => removeSlot(typeof id === 'string' ? id : id?.id)
const onOpenReq = (id) => {
  board.value = 'req'
  selectedId.value = id
  const req = requirements.value.find((r) => r.id === id)
  syncDetailTab('req', req?.gate)
}
const onOpenRel = (id) => {
  board.value = 'rel'
  selectedId.value = id
  const rel = releases.value.find((r) => r.id === id)
  syncDetailTab('rel', rel?.gate)
}

const patchReq = async (patch) => {
  if (!selectedReq.value) return
  await upsertReq({ ...selectedReq.value, ...patch })
}

const patchRel = async (patch) => {
  if (!selectedRel.value) return
  await upsertRel({ ...selectedRel.value, ...patch })
}

const runAssist = (job, kind, opts = {}) => {
  const next = assistChain.then(() => runAssistNow(job, kind, opts))
  assistChain = next.catch(() => {})
  return next
}

const runAssistNow = async (job, kind, { force = false } = {}) => {
  if (!job || (kind !== 'req' && kind !== 'rel')) return null
  const req = kind === 'req' ? selectedReq.value : null
  const rel = kind === 'rel' ? selectedRel.value : null
  const entity = req || rel
  if (!entity || !props.appId) return null
  const hash = assistInputHash({ job, req, rel, cases: props.cases, tasks: props.tasks, requirements: requirements.value })
  const cur = latestArtifact(entity, job)
  if (!force && cur?.input_hash === hash && ['draft', 'accepted'].includes(cur.status)) return cur
  assisting.value = true
  let art = null
  try {
    try {
      await persist()
      const res = await assistQaProcess(props.appId, {
        entity: kind,
        id: entity.id,
        job,
        requirement: req,
        release: rel,
        requirements: kind === 'rel' ? compactReqs() : undefined,
        cases: compactCases(),
        tasks: compactTasks(entity),
        suites: (props.suites || []).map((s) => ({ name: s.name, case_ids: s.case_ids || [] })),
      })
      art = res?.data?.artifact || null
    } catch (_) {
      art = null
    }
    if (!art) {
      art = runAssistJob(job, {
        req,
        rel,
        cases: props.cases,
        tasks: props.tasks,
        requirements: requirements.value,
        suites: props.suites,
        workflow: wf.value,
      })
    }
    art.input_hash = hash
    const list = upsertArtifact(entity.ai_artifacts, art)
    if (req) await patchReq({ ai_artifacts: list })
    else await patchRel({ ai_artifacts: list })
    return art
  } finally {
    assisting.value = false
  }
}

const acceptMap = async (pointId) => {
  const req = selectedReq.value
  const mapping = mapForPoint(pointId)
  if (!req || !mapping) return
  const point = (req.understanding?.points || []).find((p) => p.id === pointId)
  const ids = [...new Set([...(point?.case_ids || []), ...mapping.suggest.map((s) => s.case_id)])]
  await setPointCases(pointId, ids)
  await runAssist('map_cases', 'req', { force: true })
}

const acceptPassPack = async () => {
  const rel = selectedRel.value
  const ids = relPickArt.value?.payload?.pass_ids || []
  if (!rel || !ids.length) {
    ElMessage.warning('建议回归的用例是空的')
    return
  }
  await patchRel({ case_ids: [...new Set([...(rel.case_ids || []), ...ids])] })
    ElMessage.success(`已并入建议回归 ${ids.length} 条，未验收需求的用例没有自动带上`)
  await runAssist('pick_regression', 'rel', { force: true })
}

const dispatchWander = (kind) => {
  const ids = kind === 'req' ? reqRerunIds.value : relRerunIds.value
  if (!ids.length) {
    ElMessage.info('没有像走神的失败条')
    return
  }
  if (kind === 'req') {
    const req = selectedReq.value
    if (!req) return
    const step = reqDispatchSteps.value.find((s) => s.run === 'req_test')
    emit('dispatch-run', {
      caseIds: ids,
      kind: 'req_test',
      coverage: 'once',
      requirementId: req.id,
      envProfile: step?.env || 'test',
    })
    return
  }
  const rel = selectedRel.value
  if (!rel) return
  const step = relDispatchSteps.value.find((s) => s.run === 'release_regression')
  emit('dispatch-run', {
    caseIds: ids,
    kind: 'release_regression',
    coverage: 'once',
    releaseId: rel.id,
    envProfile: step?.env || 'pre',
  })
}

const attachDraft = (entity, kind, job) => {
  const ctx = kind === 'req'
    ? { req: entity, cases: props.cases, tasks: props.tasks, workflow: wf.value }
    : { rel: entity, cases: props.cases, tasks: props.tasks, requirements: requirements.value, suites: props.suites, workflow: wf.value }
  const art = runAssistJob(job, ctx)
  art.input_hash = assistInputHash({ job, ...ctx })
  return upsertArtifact(entity.ai_artifacts, art)
}

const reextract = async () => {
  const req = selectedReq.value
  if (!req) return
  const text = req.understanding?.source_excerpt || draft.source_text
  if (!String(text || '').trim()) {
    ElMessage.warning('没有需求正文。请在新建时粘贴，或先把验收标准手填完整')
    return
  }
  try {
    await ElMessageBox.confirm('将按当前正文重抽验收标准，已确认的评审会作废。', '需求有改动', { type: 'warning' })
  } catch { return }
  const understanding = extractUnderstanding(text, { title: req.title })
  const matched = matchCaseIds(understanding, props.cases, req)
  await patchReq({
    gate: findStep(wf.value, 'req', req.gate)?.kind === 'understand'
      ? req.gate
      : (trackSteps(wf.value, 'req').find((s) => s.kind === 'understand')?.id || req.gate),
    understanding: applyCoverage(understanding, matched.length ? matched : linkedCaseIds(req)),
    signoff: null,
  })
  ElMessage.success('验收标准已重抽，请再评审一次')
}

const confirmUnderstanding = async () => {
  const req = selectedReq.value
  if (!req) return
  const next = reqNext.value
  if (!next) return
  const check = canAdvanceReq(req, next.id, wf.value)
  if (!check.ok) { ElMessage.warning(check.reason); return }
  try {
    await ElMessageBox.confirm('确认验收标准没理解错？通过后才能去准备用例。', '结束评审', { type: 'warning' })
  } catch { return }
  const ac = (req.understanding?.ac || []).map((s) => String(s || '').trim()).filter(Boolean)
  let understanding = {
    ...req.understanding,
    confirmed: true,
    confirmed_at: nowIso(),
    ac,
  }
  if (!(understanding.points || []).length) {
    understanding = {
      ...understanding,
      points: ac.map((text, i) => ({
        id: `tp${i + 1}`,
        kind: i === 0 ? '正向' : '正向',
        text,
        case_ids: [],
        waived: false,
      })),
    }
  }
  await patchReq({
    gate: next.id,
    understanding,
  })
  syncDetailTab('req', next.id)
  ElMessage.success('评审通过')
  if (next.kind === 'cover' || kindAssistJob(next.kind, 'req') === 'map_cases') {
    await runAssist('map_cases', 'req')
  }
}

const refreshCoverage = async () => {
  const req = selectedReq.value
  if (!req) return
  const exact = casesForRequirement(props.cases, req)
  const matched = matchCaseIds(req.understanding, props.cases, req)
  const extra = linkedCaseIds(req)
  const ids = [...new Set([...exact, ...matched, ...extra])]
  await patchReq({
    understanding: applyCoverage(req.understanding, ids),
    case_ids: ids,
  })
  ElMessage.success(
    exact.length
      ? `飞书需求编号命中 ${exact.length} 条；测试点不会自动算覆盖，请分到点上`
      : (ids.length ? `已对照飞书，挂上 ${ids.length} 条（请分到测试点）` : '没有自动匹配到用例，请手选'),
  )
  await runAssist('map_cases', 'req', { force: true })
}

const setPointCases = async (pointId, ids) => {
  const req = selectedReq.value
  if (!req) return
  const points = (req.understanding?.points || []).map((p) => (
    p.id === pointId ? { ...p, case_ids: ids, waived: false } : p
  ))
  const all = [...new Set(points.flatMap((p) => p.case_ids || []))]
  await patchReq({
    understanding: { ...req.understanding, points },
    case_ids: all,
  })
}

const waivePoint = async (point) => {
  try {
    const { value } = await ElMessageBox.prompt('本版本不测的原因', '标记缺口', {
      inputPattern: /\S/,
      inputErrorMessage: '请填写原因',
    })
    const req = selectedReq.value
    const points = (req.understanding?.points || []).map((p) => (
      p.id === point.id ? { ...p, waived: true, waive_reason: String(value || '').trim() } : p
    ))
    await patchReq({ understanding: { ...req.understanding, points } })
  } catch { /* cancel */ }
}

const enterNextReq = async () => {
  const req = selectedReq.value
  const next = reqNext.value
  if (!req || !next) return
  const check = canAdvanceReq(req, next.id, wf.value)
  if (!check.ok) { ElMessage.warning(check.reason); return }
  await patchReq({ gate: next.id })
  syncDetailTab('req', next.id)
  const job = kindAssistJob(next.kind, 'req')
  if (job) await runAssist(job, 'req', { force: next.kind === 'human_verdict' })
}

const enterNextRel = async () => {
  const rel = selectedRel.value
  const next = relNext.value
  if (!rel || !next) return
  const check = canAdvanceRel(rel, next.id, wf.value)
  if (!check.ok) { ElMessage.warning(check.reason); return }
  await patchRel({ gate: next.id })
  syncDetailTab('rel', next.id)
  const job = kindAssistJob(next.kind, 'rel')
  if (job) await runAssist(job, 'rel', { force: next.kind === 'human_verdict' })
}

const signOff = async (verdict) => {
  const req = selectedReq.value
  if (!req) return
  const titles = { pass: '验收通过', risk: '带风险验收', reject: '退回重测' }
  try {
    await ElMessageBox.confirm(
      verdict === 'reject' ? '退回后回到功能测试，不能进版本回归。' : '验收后本需求可以进版本回归。必须测试同学点这一下。',
      titles[verdict],
      { type: 'warning' },
    )
  } catch { return }
  if (verdict === 'reject') {
    const back = previousStepOfKind(wf.value, 'req', req.gate, 'dispatch', 'req_test')
      || previousStepOfKind(wf.value, 'req', req.gate, 'dispatch')
      || reqStep.value
    await patchReq({ gate: back?.id || req.gate, signoff: null })
    syncDetailTab('req', back?.id || req.gate)
    return
  }
  const dest = reqKindIs('human_verdict') ? reqNext.value : (reqNext.value?.kind === 'human_verdict' ? nextStep(wf.value, 'req', reqNext.value.id) : reqNext.value)
  const archive = dest?.kind === 'archive' ? dest : trackSteps(wf.value, 'req').find((s) => s.kind === 'archive')
  await patchReq({
    gate: archive?.id || dest?.id || req.gate,
    signoff: { verdict, at: nowIso(), report: reqReport.value },
  })
  if (archive?.id) syncDetailTab('req', archive.id)
  ElMessage.success('已验收。挂进版本后，可以作为发版依据。')
}

const deleteReq = async (row) => {
  try {
    await ElMessageBox.confirm(`删除需求「${row.title}」？不会删飞书用例。`, '删除', { type: 'warning' })
  } catch { return }
  await removeReq(row.id)
  if (selectedId.value === row.id) selectedId.value = ''
}

const smokeIds = (req) => {
  const smoke = (props.suites || []).find((s) => /冒烟|smoke/i.test(s.name || ''))
  if (smoke) {
    const ids = suiteCaseIds(smoke, props.cases)
    if (ids.length) return ids
  }
  return linkedCaseIds(req).slice(0, 5)
}

const dispatchReqStep = (step) => {
  const req = selectedReq.value
  if (!req || !step) return
  if (!understood(req, wf.value)) {
    ElMessage.warning('需求还没评审完，不能开功能测试')
    return
  }
  const kind = step.run || 'req_test'
  const caseIds = kind === 'req_admit' ? smokeIds(req) : linkedCaseIds(req)
  if (!caseIds.length) {
    ElMessage.warning('没有可跑的用例。请先挂上飞书用例，或去用例库补表。')
    return
  }
  if (!ensureEnvReady(step.env || RUN_KINDS[kind]?.env || 'test')) return
  emit('dispatch-run', {
    caseIds,
    kind,
    coverage: RUN_KINDS[kind]?.coverage || 'once',
    requirementId: req.id,
    envProfile: step.env || RUN_KINDS[kind]?.env || 'test',
  })
}

const lockScope = async () => {
  if (!selectedRel.value) return
  const n = (selectedRel.value.requirement_ids || []).length
  if (!n) {
    try {
      await ElMessageBox.confirm('还没有挂需求。可以先定开测日期，需求后补。没在各环境测完的需求不能当成发版通过的依据。', '完成纳入需求')
    } catch { return }
  }
  await enterNextRel()
}

const confirmScope = async () => {
  if (!selectedRel.value) return
  if (!(selectedRel.value.case_ids || []).length) {
    ElMessage.warning('回归范围是空的')
    return
  }
  try {
    await ElMessageBox.confirm('锁定这批用例作为预发回归范围？之后下发不再默认改圈选。', '确认回归范围')
  } catch { return }
  await enterNextRel()
}

const completeCheckpoint = async (track) => {
  if (track === 'req') {
    await enterNextReq()
    ElMessage.success('检查点已完成')
    return
  }
  await enterNextRel()
  ElMessage.success('检查点已完成')
}

const verdictRel = async (verdict) => {
  const titles = { pass: '发版通过', risk: '带风险发版', block: '不发版' }
  try {
    await ElMessageBox.confirm(
      verdict === 'block' ? '判定不发版后停在发版评审，不下发生产冒烟。' : '发版必须测试同学判定。通过后可下发生产环境冒烟。',
      titles[verdict],
      { type: 'warning' },
    )
  } catch { return }
  if (verdict === 'block') {
    await patchRel({ verdict: { verdict, at: nowIso(), report: relReport.value } })
    return
  }
  let dest = relNext.value
  if (relKindIs('human_verdict')) dest = relNext.value
  else if (relNext.value?.kind === 'human_verdict') dest = nextStep(wf.value, 'rel', relNext.value.id)
  await patchRel({
    gate: dest?.id || selectedRel.value.gate,
    verdict: { verdict, at: nowIso(), report: relReport.value },
  })
  if (dest?.id) syncDetailTab('rel', dest.id)
  ElMessage.success(verdict === 'pass' ? '发版通过，可下发生产冒烟' : '带风险发版，仍可下发生产冒烟')
}

const closeRel = async () => {
  const rel = selectedRel.value
  const next = relNext.value
  if (!rel || !next) return
  const check = canAdvanceRel(rel, next.id, wf.value)
  if (!check.ok) { ElMessage.warning(check.reason); return }
  await patchRel({ gate: next.id })
  syncDetailTab('rel', next.id)
  ElMessage.success('版本单已关闭')
}

const onReqGateClick = async (g) => {
  const req = selectedReq.value
  if (!req) return
  const tab = kindTab(g.kind)
  if (tab) detailTab.value = tab
  if (g.id === req.gate || gatePassed('req', req.gate, g.id, wf.value)) return
  if (!isNextGate('req', req.gate, g.id, wf.value)) {
    ElMessage.warning('请按阶段一步一步走')
    return
  }
  const current = reqStep.value
  if (current?.kind === 'human_verdict') {
    ElMessage.info('测试验收必须在「测试验收」里由测试同学判定，不能自动通过')
    detailTab.value = 'report'
    return
  }
  if (current?.kind === 'understand') return confirmUnderstanding()
  if (current?.kind === 'cover') return enterNextReq()
  if (current?.kind === 'scope') {
    return g.kind === 'dispatch' ? confirmScope() : enterNextReq()
  }
  if (current?.kind === 'checkpoint') return completeCheckpoint('req')
  return enterNextReq()
}

const onRelGateClick = async (g) => {
  const rel = selectedRel.value
  if (!rel) return
  const tab = kindTab(g.kind)
  if (tab) detailTab.value = tab
  if (g.id === rel.gate || gatePassed('rel', rel.gate, g.id, wf.value)) return
  if (!isNextGate('rel', rel.gate, g.id, wf.value)) {
    ElMessage.warning('请按阶段一步一步走')
    return
  }
  const current = relStep.value
  if (current?.kind === 'human_verdict') {
    ElMessage.info('发版必须在「发版评审」里由测试同学判定，不能自动通过')
    detailTab.value = 'report'
    return
  }
  const check = canAdvanceRel(rel, g.id, wf.value)
  if (!check.ok) {
    ElMessage.warning(check.reason)
    if (g.kind === 'dispatch' && current?.kind === 'human_verdict') detailTab.value = 'report'
    return
  }
  if (current?.kind === 'scope') {
    return g.kind === 'dispatch' ? confirmScope() : lockScope()
  }
  if (current?.kind === 'checkpoint') return completeCheckpoint('rel')
  return enterNextRel()
}

const deleteRel = async (row) => {
  try {
    await ElMessageBox.confirm(`删除版本「${row.title}」？`, '删除', { type: 'warning' })
  } catch { return }
  await removeRel(row.id)
  if (selectedId.value === row.id) selectedId.value = ''
}

const dispatchRelStep = (step) => {
  const rel = selectedRel.value
  if (!rel || !step) return
  const kind = step.run || 'release_regression'
  const smoke = (props.suites || []).find((s) => /冒烟|smoke/i.test(s.name || ''))
  const ids = kind === 'release_smoke'
    ? (smoke ? suiteCaseIds(smoke, props.cases) : (rel.case_ids || []).slice(0, 5))
    : (rel.case_ids || [])
  if (!ids.length) {
    ElMessage.warning('回归范围是空的')
    return
  }
  if (!ensureEnvReady(step.env || RUN_KINDS[kind]?.env || 'pre')) return
  emit('dispatch-run', {
    caseIds: ids,
    kind,
    coverage: 'once',
    releaseId: rel.id,
    envProfile: step.env || RUN_KINDS[kind]?.env || 'pre',
  })
}

defineExpose({ attachRun })

const addAc = () => {
  const req = selectedReq.value
  if (!req) return
  if (!req.understanding) req.understanding = emptyUnderstanding()
  req.understanding.ac = [...(req.understanding.ac || []), '']
  persistSoon()
}

const setAc = (idx, value) => {
  const req = selectedReq.value
  if (!req) return
  if (!req.understanding) req.understanding = emptyUnderstanding()
  const ac = [...(req.understanding.ac || [])]
  ac[idx] = value
  req.understanding.ac = ac
  persistSoon()
}

const addPoint = () => {
  const req = selectedReq.value
  if (!req) return
  const points = [...(req.understanding?.points || [])]
  points.push({
    id: `tp${points.length + 1}-${Date.now().toString(36)}`,
    kind: '正向',
    text: '',
    case_ids: [],
    waived: false,
  })
  patchReq({ understanding: { ...req.understanding, points } })
}

const setPointText = (pointId, text) => {
  const req = selectedReq.value
  if (!req) return
  const points = (req.understanding?.points || []).map((p) => (p.id === pointId ? { ...p, text } : p))
  req.understanding.points = points
  persistSoon()
}

watch([gateFilter, board, () => tableRows.value.length], () => { page.value = 1 })

watch(board, () => {
  if (board.value === 'flow' || board.value === 'sch') return
  if (board.value === 'rel' && selectedRel.value) return
  if (board.value === 'req' && selectedReq.value) return
  selectedId.value = ''
})

watch(() => draft.external_id, (id) => {
  if (!createOpen.value || creatingRel.value) return
  const ext = String(id || '').trim()
  if (!ext) return
  const ids = casesForRequirement(props.cases, { external_id: ext })
  if (ids.length && !(draft.case_ids || []).length) draft.case_ids = ids
})

const TERMINAL_OK = new Set(['done', 'failed', 'partial_fail'])
const advancedRunKeys = new Set()
const maybeAdvanceFromTasks = () => {
  for (const req of requirements.value) {
    const step = findStep(wf.value, 'req', req.gate)
    if (step?.kind !== 'dispatch' || !step.auto_advance) continue
    const latest = [...(req.runs || [])].reverse().find((r) => r.kind === step.run)
    const task = latest && taskOf(latest.task_id)
    if (!task || !TERMINAL_OK.has(displayTaskStatus(task))) continue
    const nxt = nextStep(wf.value, 'req', step.id)
    if (!nxt) continue
    const key = `${req.id}:${latest.task_id}:${nxt.id}`
    if (advancedRunKeys.has(key)) continue
    advancedRunKeys.add(key)
    const job = kindAssistJob(nxt.kind, 'req')
    const arts = job ? attachDraft({ ...req, gate: nxt.id }, 'req', job) : req.ai_artifacts
    upsertReq({ ...req, gate: nxt.id, ai_artifacts: arts })
  }
  for (const rel of releases.value) {
    const step = findStep(wf.value, 'rel', rel.gate)
    if (step?.kind !== 'dispatch' || !step.auto_advance) continue
    const latest = [...(rel.runs || [])].reverse().find((r) => r.kind === step.run)
    const task = latest && taskOf(latest.task_id)
    if (!task || !TERMINAL_OK.has(displayTaskStatus(task))) continue
    const nxt = nextStep(wf.value, 'rel', step.id)
    if (!nxt) continue
    const key = `${rel.id}:${latest.task_id}:${nxt.id}`
    if (advancedRunKeys.has(key)) continue
    advancedRunKeys.add(key)
    const job = kindAssistJob(nxt.kind, 'rel')
    const arts = job ? attachDraft({ ...rel, gate: nxt.id }, 'rel', job) : rel.ai_artifacts
    upsertRel({ ...rel, gate: nxt.id, ai_artifacts: arts })
  }
}

watch(() => props.tasks, maybeAdvanceFromTasks, { deep: true })

watch([detailTab, selectedId, board], () => {
  if (board.value === 'req' && reqAssistJob.value) runAssist(reqAssistJob.value, 'req')
  if (board.value === 'rel' && relAssistJob.value) runAssist(relAssistJob.value, 'rel')
})

onMounted(async () => {
  await Promise.all([load(), loadEnvSnap()])
})
watch(() => props.appId, load)
watch(() => props.projectId, loadEnvSnap)
</script>

<template>
  <div class="settings-panel qa-process-panel" v-loading="loading">
    <header class="settings-page-header">
      <div>
        <h2 class="settings-page-title">测试流程</h2>
        <p class="settings-page-desc">
          本应用 {{ inventory.reqs }} 条需求 · 飞书用例 {{ inventory.cases }} 条（{{ inventory.withReqCol }} 条填了需求ID）· 已挂到需求 {{ inventory.linked }} 条。
          排期只标哪几天测哪个版本/需求；设备在下发任务时再选。测试验收和发版评审必须测试同学判定。
          阶段和跑测环境在「配置 → 流程模板」里改。
        </p>
      </div>
      <div class="settings-summary-pill" :style="pillStyle">{{ watchStatus.label }}</div>
    </header>

    <div class="settings-tabbar">
      <button type="button" class="settings-tab" :class="{ active: board === 'rel' }" @click="setBoard('rel')">
        <strong>{{ wf.tracks.rel.label }}</strong>
        <span>定开测日期 · 预发回归 · 发版评审</span>
      </button>
      <button type="button" class="settings-tab" :class="{ active: board === 'req' }" @click="setBoard('req')">
        <strong>{{ wf.tracks.req.label }}</strong>
        <span>评审需求 · 准备用例 · 提测 · 验收</span>
      </button>
      <button type="button" class="settings-tab" :class="{ active: board === 'sch' }" @click="setBoard('sch')">
        <strong>测试排期</strong>
        <span>版本开测 · 需求提审上线</span>
      </button>
    </div>

    <section v-if="board === 'rel'" class="settings-info-card qa-order-card">
      <div class="settings-kicker">版本测试</div>
      <p>先建版本、纳入本版需求，再圈历史功能回归。没在各环境测完的需求不能当成发版通过的依据。</p>
      <p>
        回归下发按流程阶段挂的环境，去「配置 → 环境配置」取渠道标识。
        <el-button link type="primary" size="small" @click="emit('go-tab', 'config:flow')">改流程模板</el-button>
        <el-button link type="primary" size="small" @click="emit('go-tab', 'config:env')">改环境配置</el-button>
      </p>
    </section>

    <section v-if="board === 'req'" class="settings-info-card qa-order-card">
      <div class="settings-kicker">需求测试</div>
      <p>
        每个需求按上线顺序在全部环境跑完（冒烟 + 功能测试），再挂进版本。
        <el-button link type="primary" size="small" @click="emit('go-tab', 'config:flow')">改流程模板</el-button>
        <el-button link type="primary" size="small" @click="emit('go-tab', 'config:env')">改环境配置</el-button>
      </p>
    </section>

    <QaScheduleBoard
      v-if="board === 'sch'"
      ref="scheduleBoard"
      :slots="schedule"
      :requirements="requirements"
      :releases="releases"
      :devices="devices"
      :cases="cases"
      :workflow="wf"
      @save="onSaveSlot"
      @remove="onRemoveSlot"
      @open-req="onOpenReq"
      @open-rel="onOpenRel"
      @dispatch-run="(seed) => emit('dispatch-run', seed)"
    />

    <div v-else class="qa-split" :class="{ 'has-detail': !!selected }">
      <section class="settings-table-card is-fill qa-list">
        <div class="col-head">
          <h3>{{ board === 'rel' ? '版本单' : '需求单' }}</h3>
          <div class="col-actions">
            <el-button size="small" :loading="loading" @click="load">刷新</el-button>
            <el-button size="small" type="primary" @click="openCreate">
              {{ board === 'rel' ? '新建版本' : '新建需求' }}
            </el-button>
          </div>
        </div>
        <div class="qa-seg gate-filters" role="tablist">
          <button type="button" :class="{ active: gateFilter === 'all' }" @click="gateFilter = 'all'">全部阶段</button>
          <button
            v-for="g in (board === 'rel' ? relSteps : reqSteps)"
            :key="g.id"
            type="button"
            :class="{ active: gateFilter === g.id }"
            @click="gateFilter = g.id"
          >{{ g.label }}</button>
        </div>
        <div class="table-wrap">
          <el-table
            :data="pagedRows"
            border
            stripe
            size="small"
            height="100%"
            highlight-current-row
            :row-class-name="rowClass"
            :empty-text="emptyText"
            @row-click="selectRow"
          >
            <el-table-column label="阶段" min-width="168">
              <template #default="{ row }">
                <QaFlowPipeline
                  mode="mini"
                  :track="board"
                  :steps="board === 'rel' ? relSteps : reqSteps"
                  :current-id="row.gate"
                />
              </template>
            </el-table-column>
            <el-table-column :label="board === 'rel' ? '版本' : '需求'" min-width="160" show-overflow-tooltip>
              <template #default="{ row }">
                <span class="task-name">{{ row.title }}</span>
              </template>
            </el-table-column>
            <el-table-column v-if="board === 'req'" label="编号" width="100" show-overflow-tooltip>
              <template #default="{ row }">{{ row.external_id || '—' }}</template>
            </el-table-column>
            <el-table-column v-if="board === 'req'" label="覆盖" width="88">
              <template #default="{ row }">
                {{ coverageStats(row).covered }}/{{ coverageStats(row).total || 0 }}
              </template>
            </el-table-column>
            <el-table-column v-else label="需求" width="88">
              <template #default="{ row }">
                {{ (row.requirement_ids || []).length }}
                <span v-if="unsignedOnRel(row)" class="muted"> · {{ unsignedOnRel(row) }}未验收</span>
              </template>
            </el-table-column>
            <el-table-column label="计划测试" width="108">
              <template #default="{ row }">{{ formatShortDate(row.plan?.test_start) }}</template>
            </el-table-column>
            <el-table-column label="更新" width="108">
              <template #default="{ row }">{{ formatShortTime(row.updated_at) }}</template>
            </el-table-column>
            <el-table-column label="操作" width="72" fixed="right">
              <template #default="{ row }">
                <el-button link type="primary" size="small" @click.stop="selectRow(row)">查看</el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
        <el-pagination
          class="settings-table-pager"
          background
          size="small"
          layout="total, sizes, prev, pager, next"
          :total="tableRows.length"
          :page-sizes="TABLE_PAGE_SIZES"
          v-model:page-size="pageSize"
          v-model:current-page="page"
        />
      </section>

      <section v-if="selectedReq && board === 'req'" class="settings-card qa-detail">
        <div class="detail-head">
          <div>
            <h3>{{ selectedReq.title }}</h3>
            <p class="muted">
              {{ selectedReq.external_id || '无外部编号' }}
              <template v-if="selectedReq.source_url"> · <a :href="selectedReq.source_url" target="_blank" rel="noreferrer">打开原文</a></template>
              <template v-if="saving"> · 保存中</template>
            </p>
          </div>
          <div class="head-actions">
            <el-button size="small" @click="scheduleCurrent('req_test')">排测试</el-button>
            <el-button size="small" text type="danger" @click="deleteReq(selectedReq)">删除</el-button>
          </div>
        </div>

        <QaFlowPipeline
          mode="ticket"
          track="req"
          :steps="reqSteps"
          :current-id="selectedReq.gate"
          :env-summaries="envSnap.summaries"
          @select="onReqGateClick"
        />
        <p class="gate-explain">{{ gateHint('req', selectedReq.gate, wf) }}</p>
        <div v-if="reqAssistJob" class="assist-bar" :class="{ 'is-stale': reqAssistArt?.status === 'stale' }">
          <span class="assist-suggest">{{ reqAssistArt?.suggest || '点「给建议」出草稿，采纳前不会改阶段或用例。' }}</span>
          <el-tag v-if="reqAssistArt?.status === 'stale'" size="small" type="warning">过期</el-tag>
          <el-button link type="primary" size="small" :loading="assisting" @click="runAssist(reqAssistJob, 'req', { force: true })">给建议</el-button>
        </div>

        <div class="qa-seg">
          <button
            v-for="tab in reqDetailTabs"
            :key="tab.id"
            type="button"
            :class="{ active: detailTab === tab.id }"
            @click="detailTab = tab.id"
          >{{ tab.label }}</button>
        </div>

        <div v-if="detailTab === 'understand'" class="detail-body">
          <p class="hint">根据需求正文列出验收标准和测试点，评审通过后才算读懂。文档一改就点「需求有改动」。</p>
          <div class="field">
            <label>验收标准</label>
            <div v-for="(line, idx) in (selectedReq.understanding?.ac || [])" :key="idx" class="ac-row">
              <el-input
                :model-value="line"
                size="small"
                placeholder="可判定的通过条件"
                :disabled="selectedReq.understanding?.confirmed && !reqKindIs('understand')"
                @update:model-value="(v) => setAc(idx, v)"
              />
            </div>
            <el-button v-if="reqKindIs('understand')" size="small" text @click="addAc">加一条</el-button>
          </div>
          <div class="field">
            <label>影响面</label>
            <p class="muted">
              {{ (selectedReq.understanding?.impact?.platforms || []).join(' / ') || '未识别端' }}
              <template v-if="selectedReq.understanding?.impact?.notes"> · {{ selectedReq.understanding.impact.notes }}</template>
            </p>
          </div>
          <div class="actions">
            <el-button size="small" @click="reextract">需求有改动</el-button>
            <el-button
              v-if="reqKindIs('understand')"
              size="small"
              type="primary"
              @click="confirmUnderstanding"
            >评审通过</el-button>
          </div>
        </div>

        <div v-else-if="detailTab === 'cases'" class="detail-body">
          <p class="hint">
            测试点要挂上飞书用例。系统不写用例步骤。缺口可去用例库补，或标记本版本不测。
            <el-button link type="primary" size="small" @click="emit('go-tab', 'cases')">打开用例库</el-button>
          </p>
          <p v-if="exactCaseIds.length" class="hint">
            飞书「需求ID」列命中 {{ exactCaseIds.length }} 条，已进本需求用例池；不会自动算测试点覆盖，请分到点上。
          </p>
          <div class="metrics compact">
            <div class="metric"><div class="k">测试点</div><div class="v">{{ reqStats?.total || 0 }}</div></div>
            <div class="metric"><div class="k">已覆盖</div><div class="v ok">{{ reqStats?.covered || 0 }}</div></div>
            <div class="metric"><div class="k">缺口</div><div class="v" :class="{ bad: reqStats?.gaps }">{{ reqStats?.gaps || 0 }}</div></div>
          </div>
          <el-table :data="selectedReq.understanding?.points || []" border stripe size="small" empty-text="先完成需求评审">
            <el-table-column label="类型" width="72" prop="kind" />
            <el-table-column label="测试点" min-width="160">
              <template #default="{ row }">
                <el-input
                  v-if="reqCanEditCover"
                  :model-value="row.text"
                  size="small"
                  @update:model-value="(v) => setPointText(row.id, v)"
                />
                <span v-else>{{ row.text }}</span>
              </template>
            </el-table-column>
            <el-table-column label="飞书用例" min-width="180">
              <template #default="{ row }">
                <el-select
                  :model-value="row.case_ids || []"
                  multiple
                  collapse-tags
                  collapse-tags-tooltip
                  filterable
                  size="small"
                  style="width: 100%"
                  :disabled="!reqCanEditCover"
                  @change="(ids) => setPointCases(row.id, ids)"
                >
                  <el-option v-for="c in caseOptions" :key="c.id" :label="c.label" :value="c.id" />
                </el-select>
                <span v-if="row.waived" class="muted">不测：{{ row.waive_reason }}</span>
              </template>
            </el-table-column>
            <el-table-column label="建议用例" min-width="160">
              <template #default="{ row }">
                <template v-if="mapForPoint(row.id)?.suggest?.length">
                  <span class="suggest-ids">{{ mapForPoint(row.id).suggest.map((s) => s.case_id).join('、') }}</span>
                  <el-button
                    v-if="reqCanEditCover"
                    link
                    type="primary"
                    size="small"
                    @click="acceptMap(row.id)"
                  >采纳</el-button>
                </template>
                <span v-else-if="gapForPoint(row.id)" class="hint warn">{{ gapForPoint(row.id).reason }}</span>
                <span v-else class="muted">—</span>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="108" fixed="right">
              <template #default="{ row }">
                <el-button
                  v-if="!row.waived && reqCanEditCover"
                  link
                  type="warning"
                  size="small"
                  @click="waivePoint(row)"
                >不测</el-button>
              </template>
            </el-table-column>
          </el-table>
          <div class="actions">
            <el-button size="small" @click="addPoint">加测试点</el-button>
            <el-button size="small" @click="refreshCoverage">对照飞书</el-button>
            <el-button size="small" :loading="assisting" @click="runAssist('map_cases', 'req', { force: true })">给建议</el-button>
            <el-button
              v-if="reqKindIs('cover')"
              size="small"
              type="primary"
              @click="enterNextReq"
            >进入下一步</el-button>
          </div>
        </div>

        <div v-else-if="detailTab === 'run'" class="detail-body">
          <p class="hint">下发走现有执行器。评审没过不能开功能测试。每条用例跑一轮。</p>
          <div class="actions">
            <el-button
              v-for="s in reqDispatchSteps"
              :key="s.id"
              size="small"
              :type="reqStep?.id === s.id ? 'primary' : undefined"
              :disabled="!canDispatchReqStep(s)"
              @click="dispatchReqStep(s)"
            >{{ dispatchLabel(s) }}</el-button>
            <el-button
              v-if="reqKindIs('dispatch') && reqNext && reqNext.kind !== 'archive'"
              size="small"
              :type="reqNext?.kind === 'human_verdict' ? 'primary' : undefined"
              @click="enterNextReq"
            >{{ reqNext?.kind === 'human_verdict' ? '提交验收' : `进入${reqNext?.label || '下一步'}` }}</el-button>
          </div>
          <el-table :data="selectedReq.runs || []" border stripe size="small" empty-text="还没有下发过">
            <el-table-column label="类型" width="100">
              <template #default="{ row }">{{ RUN_KINDS[row.kind]?.label || row.kind }}</template>
            </el-table-column>
            <el-table-column label="任务" width="108">
              <template #default="{ row }">
                <el-button link type="primary" size="small" @click="emit('open-task', row.task_id)">{{ shortTaskId(row.task_id) }}</el-button>
              </template>
            </el-table-column>
            <el-table-column label="状态" width="88">
              <template #default="{ row }">
                <el-tag v-if="taskOf(row.task_id)" size="small" :type="statusTagType(taskOf(row.task_id).status, taskOf(row.task_id))">
                  {{ statusLabel(taskOf(row.task_id).status, taskOf(row.task_id)) }}
                </el-tag>
                <span v-else class="muted">已下发</span>
              </template>
            </el-table-column>
            <el-table-column label="进度" min-width="120">
              <template #default="{ row }">{{ taskOf(row.task_id) ? taskCountLabel(taskOf(row.task_id)) : '—' }}</template>
            </el-table-column>
            <el-table-column label="时间" width="108">
              <template #default="{ row }">{{ formatShortTime(row.at) }}</template>
            </el-table-column>
          </el-table>
        </div>

        <div v-else-if="detailTab === 'checkpoint'" class="detail-body">
          <p class="hint">{{ reqStep?.hint || '这一步只做人工确认，不跑自动化。' }}</p>
          <div v-if="reqKindIs('checkpoint')" class="actions">
            <el-button size="small" type="primary" @click="completeCheckpoint('req')">完成，进入下一步</el-button>
          </div>
        </div>

        <div v-else class="detail-body">
          <p class="hint">对照验收标准给建议。通过还是不通过，必须测试同学判定。</p>
          <div class="metrics compact">
            <div class="metric"><div class="k">建议</div><div class="v">{{ reqReport?.suggest || '—' }}</div></div>
            <div class="metric"><div class="k">通过</div><div class="v ok">{{ reqReport?.passed || 0 }}</div></div>
            <div class="metric"><div class="k">失败</div><div class="v bad">{{ reqReport?.failed || 0 }}</div></div>
            <div class="metric"><div class="k">缺口</div><div class="v warn">{{ reqReport?.coverage?.gaps || 0 }}</div></div>
          </div>
          <ul class="ac-list">
            <li v-for="(a, i) in (reqReport?.ac || [])" :key="i">{{ a }}</li>
          </ul>
          <p v-if="reqReport?.latest_task_id" class="hint">
            依据任务
            <el-button link type="primary" size="small" @click="emit('open-task', reqReport.latest_task_id)">{{ shortTaskId(reqReport.latest_task_id) }}</el-button>
          </p>
          <div v-if="reqFailItems.length" class="field">
            <label>失败分类（草稿）</label>
            <el-table :data="reqFailItems" border stripe size="small">
              <el-table-column label="用例" width="120" prop="case_id" />
              <el-table-column label="分类" width="88" prop="kind" />
              <el-table-column label="标题" min-width="140" prop="title" show-overflow-tooltip />
            </el-table>
          </div>
          <div v-if="reqCanSign" class="actions">
            <el-button size="small" type="primary" @click="signOff('pass')">验收通过</el-button>
            <el-button size="small" @click="signOff('risk')">带风险验收</el-button>
            <el-button size="small" @click="signOff('reject')">退回重测</el-button>
            <el-button v-if="reqRerunIds.length" size="small" @click="dispatchWander('req')">重跑走神 {{ reqRerunIds.length }} 条</el-button>
          </div>
          <p v-else-if="selectedReq.signoff" class="muted">已{{ selectedReq.signoff.verdict === 'risk' ? '带风险验收' : '验收通过' }} · {{ formatShortTime(selectedReq.signoff.at) }}</p>
        </div>
      </section>

      <section v-else-if="selectedRel && board === 'rel'" class="settings-card qa-detail">
        <div class="detail-head">
          <div>
            <h3>{{ selectedRel.title }}</h3>
            <p class="muted">{{ (selectedRel.requirement_ids || []).length }} 条需求 · {{ (selectedRel.case_ids || []).length }} 条回归用例</p>
          </div>
          <div class="head-actions">
            <el-button size="small" @click="scheduleCurrent('rel_test')">排开测</el-button>
            <el-button size="small" text type="danger" @click="deleteRel(selectedRel)">删除</el-button>
          </div>
        </div>
        <QaFlowPipeline
          mode="ticket"
          track="rel"
          :steps="relSteps"
          :current-id="selectedRel.gate"
          :env-summaries="envSnap.summaries"
          @select="onRelGateClick"
        />
        <p class="gate-explain">{{ gateHint('rel', selectedRel.gate, wf) }}</p>
        <div v-if="relAssistJob" class="assist-bar" :class="{ 'is-stale': relAssistArt?.status === 'stale' }">
          <span class="assist-suggest">{{ relAssistArt?.suggest || '点「给建议」出草稿，采纳前不会改阶段或回归范围。' }}</span>
          <el-tag v-if="relAssistArt?.status === 'stale'" size="small" type="warning">过期</el-tag>
          <el-button link type="primary" size="small" :loading="assisting" @click="runAssist(relAssistJob, 'rel', { force: true })">给建议</el-button>
        </div>
        <div class="qa-seg">
          <button
            v-for="tab in relDetailTabs"
            :key="tab.id"
            type="button"
            :class="{ active: detailTab === tab.id }"
            @click="detailTab = tab.id"
          >{{ tab.label }}</button>
        </div>

        <div v-if="detailTab === 'scope'" class="detail-body">
          <p class="hint">只看已评审通过的验收摘要，不精读每篇需求。需求可以随时挂进来；没验收的默认不能当成发版通过的依据。</p>
          <div class="field">
            <label>本版本需求</label>
            <el-select
              :model-value="selectedRel.requirement_ids"
              multiple
              filterable
              collapse-tags
              style="width: 100%"
              :disabled="!relCanEditScope"
              @change="(ids) => patchRel({ requirement_ids: ids })"
            >
              <el-option
                v-for="r in joinableReqs"
                :key="r.id"
                :label="reqOptionLabel(r, wf)"
                :value="r.id"
              />
            </el-select>
          </div>
          <div class="field">
            <label>回归用例</label>
            <el-select
              :model-value="selectedRel.case_ids"
              multiple
              filterable
              collapse-tags
              collapse-tags-tooltip
              style="width: 100%"
              :disabled="!relCanEditScope"
              @change="(ids) => patchRel({ case_ids: ids })"
            >
              <el-option v-for="c in caseOptions" :key="c.id" :label="c.label" :value="c.id" />
            </el-select>
          </div>
          <p v-if="relPickArt?.payload" class="hint">
            建议回归 {{ (relPickArt.payload.pass_ids || []).length }} 条
            <template v-if="(relPickArt.payload.unsigned || []).length">
              · 未验收 {{ relPickArt.payload.unsigned.join('、') }} 的 {{ (relPickArt.payload.risk_ids || []).length }} 条不会自动圈入
            </template>
          </p>
          <div class="actions">
            <el-button
              v-if="relCanEditScope"
              size="small"
              :loading="assisting"
              @click="acceptPassPack"
            >采纳建议回归</el-button>
            <el-button v-if="relKindIs('scope') && relNext?.kind === 'scope'" size="small" type="primary" @click="lockScope">进入回归范围</el-button>
            <el-button v-if="relKindIs('scope') && relNext?.kind === 'dispatch'" size="small" type="primary" @click="confirmScope">确认回归范围</el-button>
            <el-button
              v-if="relKindIs('scope') && relNext && relNext.kind !== 'scope' && relNext.kind !== 'dispatch'"
              size="small"
              type="primary"
              @click="enterNextRel"
            >进入{{ relNext.label }}</el-button>
          </div>
        </div>

        <div v-else-if="detailTab === 'run'" class="detail-body">
          <p class="hint">按本步配置的环境和种类下发。每条用例跑一轮。生产冒烟套件要小，失败当线上问题处理。</p>
          <div class="actions">
            <el-button
              v-for="s in relDispatchSteps"
              :key="s.id"
              size="small"
              :type="relStep?.id === s.id ? 'primary' : undefined"
              :disabled="!canDispatchRelStep(s)"
              @click="dispatchRelStep(s)"
            >{{ dispatchLabel(s) }}</el-button>
            <el-button
              v-if="relKindIs('dispatch') && relNext && relNext.kind !== 'archive'"
              size="small"
              @click="enterNextRel"
            >{{ relNext?.kind === 'human_verdict' ? '回归结束，进入发版评审' : `进入${relNext?.label || '下一步'}` }}</el-button>
            <el-button v-if="relKindIs('dispatch') && relNext?.kind === 'archive'" size="small" @click="closeRel">关闭版本</el-button>
          </div>
          <el-table :data="selectedRel.runs || []" border stripe size="small" empty-text="还没有下发过">
            <el-table-column label="类型" width="110">
              <template #default="{ row }">{{ RUN_KINDS[row.kind]?.label || row.kind }}</template>
            </el-table-column>
            <el-table-column label="任务" width="108">
              <template #default="{ row }">
                <el-button link type="primary" size="small" @click="emit('open-task', row.task_id)">{{ shortTaskId(row.task_id) }}</el-button>
              </template>
            </el-table-column>
            <el-table-column label="状态" width="88">
              <template #default="{ row }">
                <el-tag v-if="taskOf(row.task_id)" size="small" :type="statusTagType(taskOf(row.task_id).status, taskOf(row.task_id))">
                  {{ statusLabel(taskOf(row.task_id).status, taskOf(row.task_id)) }}
                </el-tag>
                <span v-else class="muted">已下发</span>
              </template>
            </el-table-column>
            <el-table-column label="进度" min-width="120">
              <template #default="{ row }">{{ taskOf(row.task_id) ? taskCountLabel(taskOf(row.task_id)) : '—' }}</template>
            </el-table-column>
          </el-table>
        </div>

        <div v-else-if="detailTab === 'checkpoint'" class="detail-body">
          <p class="hint">{{ relStep?.hint || '这一步只做人工确认，不跑自动化。' }}</p>
          <div v-if="relKindIs('checkpoint')" class="actions">
            <el-button size="small" type="primary" @click="completeCheckpoint('rel')">完成，进入下一步</el-button>
          </div>
        </div>

        <div v-else class="detail-body">
          <div class="metrics compact">
            <div class="metric"><div class="k">建议</div><div class="v">{{ relReport?.suggest || '—' }}</div></div>
            <div class="metric"><div class="k">失败</div><div class="v bad">{{ relReport?.failed || 0 }}</div></div>
            <div class="metric"><div class="k">未验收</div><div class="v warn">{{ relReport?.unsigned?.length || 0 }}</div></div>
            <div class="metric"><div class="k">回归条数</div><div class="v">{{ relReport?.case_count || 0 }}</div></div>
          </div>
          <p class="muted">锁定需求：{{ (relReport?.locked || []).join('、') || '无' }}</p>
          <p v-if="relReport?.unsigned?.length" class="hint warn">已挂版本但未验收，不能当成发版通过的依据：{{ relReport.unsigned.join('、') }}</p>
          <div v-if="relFailItems.length" class="field">
            <label>失败分类（草稿）</label>
            <el-table :data="relFailItems" border stripe size="small">
              <el-table-column label="用例" width="120" prop="case_id" />
              <el-table-column label="分类" width="88" prop="kind" />
              <el-table-column label="标题" min-width="140" prop="title" show-overflow-tooltip />
            </el-table>
          </div>
          <div v-if="relCanVerdict" class="actions">
            <el-button size="small" type="primary" @click="verdictRel('pass')">发版通过</el-button>
            <el-button size="small" @click="verdictRel('risk')">带风险发版</el-button>
            <el-button size="small" @click="verdictRel('block')">不发版</el-button>
            <el-button v-if="relRerunIds.length" size="small" @click="dispatchWander('rel')">重跑走神 {{ relRerunIds.length }} 条</el-button>
          </div>
          <p v-else-if="selectedRel.verdict" class="muted">
            结论 {{ selectedRel.verdict.verdict }} · {{ formatShortTime(selectedRel.verdict.at) }}
          </p>
        </div>
      </section>
    </div>

    <el-dialog
      v-model="createOpen"
      :title="creatingRel ? '新建版本' : '新建需求'"
      width="560px"
      class="mo-fit-dialog"
      align-center
      append-to-body
      destroy-on-close
    >
      <el-form v-if="!creatingRel" class="qa-create-form" label-position="top">
        <el-form-item label="需求名称" required>
          <el-input v-model="draft.title" placeholder="例如：相册支持实况图" />
        </el-form-item>
        <el-form-item label="挂到版本">
          <el-select
            v-model="draft.release_id"
            clearable
            filterable
            placeholder="选本需求进哪个版本，可空"
          >
            <el-option v-for="r in releases" :key="r.id" :label="r.title" :value="r.id" />
          </el-select>
          <p v-if="!releases.length" class="hint">还没有版本。可先建需求，之后再挂。</p>
        </el-form-item>
        <el-form-item label="外部编号">
          <el-input v-model="draft.external_id" placeholder="飞书 / Jira ID，可空" />
        </el-form-item>
        <el-form-item label="原文链接">
          <el-input v-model="draft.source_url" placeholder="https://" />
        </el-form-item>
        <el-form-item label="需求正文">
          <el-input
            v-model="draft.source_text"
            type="textarea"
            :rows="3"
            placeholder="粘贴飞书 / Jira 描述。会列出验收标准、影响面、测试点。"
          />
        </el-form-item>
        <el-form-item label="飞书用例（可选）">
          <el-select v-model="draft.case_ids" multiple filterable collapse-tags collapse-tags-tooltip placeholder="可空；填编号后按需求 ID 自动勾">
            <el-option v-for="c in caseOptions" :key="c.id" :label="c.label" :value="c.id" />
          </el-select>
        </el-form-item>
      </el-form>
      <el-form v-else class="qa-create-form" label-position="top">
        <el-form-item label="版本名称" required>
          <el-input v-model="draft.title" placeholder="例如：1.4.0 预发" />
        </el-form-item>
        <p class="hint">先定开测日期即可。设备在下发任务时再选。没验收的需求不能当成发版通过的依据。</p>
        <el-form-item label="挂入需求">
          <el-select v-model="draft.requirement_ids" multiple filterable placeholder="可空，之后再挂">
            <el-option v-for="r in joinableReqs" :key="r.id" :label="reqOptionLabel(r, wf)" :value="r.id" />
          </el-select>
        </el-form-item>
        <div class="time-row">
          <el-form-item label="计划开测">
            <el-date-picker v-model="draft.test_start" type="date" value-format="YYYY-MM-DD" format="MM-DD" placeholder="开始测试" />
          </el-form-item>
          <el-form-item label="结束">
            <el-date-picker v-model="draft.test_end" type="date" value-format="YYYY-MM-DD" format="MM-DD" placeholder="开测结束" />
          </el-form-item>
        </div>
        <el-form-item label="上线">
          <el-date-picker v-model="draft.online_at" type="date" value-format="YYYY-MM-DD" format="MM-DD" placeholder="上线" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createOpen = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitCreate">
          {{ creatingRel ? '创建版本' : '创建需求' }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.qa-process-panel {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 0;
  box-sizing: border-box;
}
.qa-process-panel .settings-page-header,
.qa-process-panel .settings-tabbar,
.qa-process-panel .qa-order-card { flex-shrink: 0; }
.qa-order-card { margin: 0 0 12px; padding: 12px 14px; }
.qa-order-card p { margin: 4px 0 0; font-size: 13px; color: #374151; line-height: 1.5; }
.qa-process-panel .settings-page-header { margin-bottom: 8px; }
.qa-process-panel .settings-tabbar { margin-bottom: 12px; flex-wrap: wrap; }
.qa-process-panel :deep(.settings-tab) { min-width: 148px; padding: 10px 14px 12px; }
.qa-process-panel > :deep(.sch-board) {
  flex: 1;
  min-height: 0;
}
.qa-process-panel > :deep(.qa-flow-editor) {
  flex: 1;
  min-height: 0;
}
.qa-split {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr);
  gap: 12px;
  align-items: stretch;
  box-sizing: border-box;
}
.qa-split.has-detail {
  grid-template-columns: minmax(280px, 42%) minmax(0, 1fr);
}
.qa-process-panel .qa-list {
  min-height: 0;
  height: auto;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 12px 14px 14px;
  box-sizing: border-box;
}
.qa-list .gate-filters {
  max-width: none;
  width: 100%;
  margin-bottom: 8px;
  flex-shrink: 0;
  flex-wrap: wrap;
}
.table-wrap { flex: 1 1 0; min-height: 0; overflow: hidden; }
.qa-list :deep(.el-pagination) {
  margin: 0;
  flex-shrink: 0;
  width: 100%;
}
.qa-detail {
  min-height: 0;
  height: auto;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-sizing: border-box;
}
.col-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  flex-wrap: wrap;
  flex-shrink: 0;
}
.col-head h3 { margin: 0; font-size: 14px; font-weight: 600; flex: 1; color: #111827; }
.col-actions { display: flex; gap: 8px; flex-shrink: 0; flex-wrap: wrap; align-items: center; }
.gate-filters { display: flex; flex-wrap: wrap; gap: 6px; }
.time-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; width: 100%; }
.time-row :deep(.el-form-item) { margin-bottom: 0; }
.time-row :deep(.el-date-editor),
.qa-create-form :deep(.el-date-editor) {
  width: 100%;
  max-width: 100%;
}
.qa-create-form :deep(.el-form-item) { margin-bottom: 14px; }
.qa-create-form :deep(.el-form-item:last-child) { margin-bottom: 0; }
.qa-create-form :deep(.el-select) { width: 100%; }
.filter-item { width: 132px; }
.qa-list :deep(.el-table .el-table__row) { cursor: pointer; }
.qa-list :deep(.el-table .is-current) { background: #eef2ff !important; }
.task-name { font-weight: 600; color: #111827; }
.detail-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}
.detail-head h3 { margin: 0 0 4px; font-size: 16px; }
.head-actions { display: flex; gap: 8px; flex-shrink: 0; }
.muted { margin: 0; color: #6b7280; font-size: 12px; }
.hint { margin: 0 0 8px; font-size: 12px; color: #6b7280; line-height: 1.5; }
.hint.warn { color: #b45309; }
.gate-row { display: flex; flex-wrap: wrap; gap: 6px; }
.gate-explain { margin: 0; font-size: 12px; color: #6b7280; line-height: 1.5; }
.assist-bar {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  flex-wrap: wrap;
  padding: 8px 10px;
  border: 1px solid #e3e8f0;
  background: #f8fafc;
  border-radius: 12px;
  font-size: 12px;
  color: #374151;
  line-height: 1.5;
}
.assist-bar.is-stale { background: #fffbeb; border-color: #fde68a; }
.assist-suggest { flex: 1; min-width: 160px; }
.suggest-ids { font-size: 12px; color: #4338ca; }
.gate-chip {
  border: 1px solid #e3e8f0;
  background: #fff;
  color: #6b7280;
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
.gate-chip.done { color: #6b7280; background: #f8fafc; }
.gate-chip.next { border-color: #c7d2fe; color: #4338ca; background: #fff; }
.gate-chip.on {
  border-color: #c7d2fe;
  background: #eef2ff;
  color: #4338ca;
}
.qa-seg {
  display: inline-flex;
  gap: 4px;
  padding: 4px;
  border-radius: 12px;
  background: #eef2ff;
  width: fit-content;
  max-width: 100%;
}
.qa-seg.gate-filters {
  width: 100%;
}
.qa-seg button {
  border: none;
  background: transparent;
  padding: 6px 10px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 600;
  color: #64748b;
  cursor: pointer;
}
.qa-seg button.active {
  background: #fff;
  color: #4338ca;
}
.detail-body { display: flex; flex-direction: column; gap: 10px; min-height: 0; }
.field label { display: block; font-size: 12px; font-weight: 600; color: #374151; margin-bottom: 6px; }
.ac-row { margin-bottom: 6px; }
.actions { display: flex; flex-wrap: wrap; gap: 8px; }
.metrics.compact {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}
.metric {
  padding: 10px 12px;
  border: 1px solid #e3e8f0;
  border-radius: 12px;
}
.metric .k { font-size: 12px; color: #6b7280; }
.metric .v { margin-top: 2px; font-size: 18px; font-weight: 700; color: #111827; }
.metric .v.ok { color: #059669; }
.metric .v.bad { color: #dc2626; }
.metric .v.warn { color: #d97706; }
.ac-list { margin: 0; padding-left: 18px; color: #374151; font-size: 13px; }
@media (max-width: 960px) {
  .qa-split.has-detail { grid-template-columns: minmax(0, 1fr); }
}
</style>
