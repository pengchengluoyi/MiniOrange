/**
 * 测试任务 normalize（FE-P0-1）。
 * 新契约：GET /case-runner/tasks ；旧内存 run / traces 仅作兼容与 404 回退。
 */

import { summarizeTaskCoverage } from '@/utils/caseCatalog'

export function batchIdFromCaseRunId(runId = '') {
  const s = String(runId || '')
  const i = s.indexOf('::')
  return i > 0 ? s.slice(0, i) : s
}

export function caseIdFromCaseRunId(runId = '') {
  const s = String(runId || '')
  const i = s.indexOf('::')
  return i > 0 ? s.slice(i + 2) : ''
}

export function shortTaskId(taskId = '') {
  const s = String(taskId || '')
  if (!s) return ''
  const bare = s.startsWith('cr-') ? s.slice(3) : s
  return bare.length > 8 ? bare.slice(0, 8) : bare
}

export function taskSns(task) {
  const list = Array.isArray(task?.sns) ? task.sns : []
  const out = []
  const seen = new Set()
  for (const item of list) {
    const sn = String(item || '').trim()
    if (sn && !seen.has(sn)) {
      seen.add(sn)
      out.push(sn)
    }
  }
  const one = String(task?.sn || '').trim()
  if (one && !seen.has(one)) out.unshift(one)
  return out
}

export function taskCoverage(task) {
  const c = String(task?.coverage || '').toLowerCase()
  return c === 'per_device' ? 'per_device' : 'once'
}

export function formatTaskDevices(task) {
  const sns = taskSns(task)
  if (!sns.length) return '未选设备'
  if (sns.length === 1) return shortDeviceLabel(sns[0])
  const plats = [...new Set(sns.map((sn) => taskPlatformOfSn(task, sn)).filter(Boolean))]
  if (plats.length > 1) return `${sns.length} 台 · Android + iOS`
  return `${shortDeviceLabel(sns[0])} +${sns.length - 1}`
}

export function coverageLabel(coverage) {
  return coverage === 'per_device' ? '全机' : '拆分'
}

export function runKindLabel(task) {
  const t = String(task?.runType || task?.kind || '').toLowerCase()
  if (t.includes('rel') || t.includes('release') || t.includes('version')) return '版本测试'
  if (t.includes('req') || t.includes('requirement')) return '需求测试'
  if (t === 'schedule') return '定时'
  if (!t || t === 'manual') return '手动'
  return t
}

export function formatTaskWhen(iso) {
  const s = String(iso || '').replace('T', ' ').replace(/Z$/, '').replace(/\.\d+$/, '')
  if (!s) return ''
  return s.length >= 16 ? s.slice(0, 16) : s
}

export function taskElapsedMs(task) {
  const a = Date.parse(String(task?.startedAt || '').replace(' ', 'T'))
  const b = Date.parse(String(task?.finishedAt || '').replace(' ', 'T'))
  if (Number.isFinite(a) && Number.isFinite(b) && b >= a) return b - a
  return 0
}

export function taskPackageLabel(task) {
  const pkgs = task?.packages_by_platform && typeof task.packages_by_platform === 'object'
    ? task.packages_by_platform
    : {}
  const android = String(pkgs.android || '').trim()
  const ios = String(pkgs.ios || '').trim()
  if (android && ios && android !== ios) return `Android ${android} · iOS ${ios}`
  return String(task?.package || android || ios || '').trim()
}

export function taskPlatformOfSn(task, sn = '') {
  const map = task?.platforms_by_sn
  const key = String(sn || '').trim()
  if (map && typeof map === 'object' && key && map[key]) {
    const v = String(map[key]).toLowerCase()
    if (v.includes('ios')) return 'ios'
    if (v.includes('web') || v.includes('browser') || v.includes('playwright')) return 'web'
    if (v.includes('android')) return 'android'
  }
  const p = String(task?.platform || '').toLowerCase()
  if (p.includes('ios')) return 'ios'
  if (p.includes('web') || p.includes('browser') || p.includes('playwright')) return 'web'
  if (p === 'mixed') return ''
  return p.includes('android') ? 'android' : (p || 'android')
}

export function platformLabel(kind) {
  const k = String(kind || '').toLowerCase()
  if (k === 'ios') return 'iOS'
  if (k === 'android') return 'Android'
  if (k === 'web') return 'Web'
  if (k === 'mixed') return '混合端'
  return ''
}

export function shortDeviceLabel(sn = '') {
  const s = String(sn || '').trim()
  if (!s) return ''
  if (s.startsWith('claw-')) return s.length > 14 ? `${s.slice(0, 14)}…` : s
  if (/^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{16}$/.test(s)) return `${s.slice(0, 8)}-…${s.slice(-4)}`
  if (s.length > 12) return `${s.slice(0, 8)}…`
  return s
}

export function formatElapsed(ms) {
  const n = Number(ms) || 0
  if (n <= 0) return ''
  if (n < 1000) return `${n} 毫秒`
  const sec = Math.round(n / 1000)
  if (sec < 60) return `${sec} 秒`
  const m = Math.floor(sec / 60)
  const s = sec % 60
  if (m < 60) return s ? `${m} 分 ${s} 秒` : `${m} 分钟`
  const h = Math.floor(m / 60)
  const rm = m % 60
  return rm ? `${h} 小时 ${rm} 分` : `${h} 小时`
}

/** 已有结论的用例数（不含取消 / 跳过 / 未跑） */
export function taskJudgedCount(task) {
  const cases = task?.cases || []
  if (cases.length) {
    return cases.filter((c) => !['pending', 'queued', 'cancelled', 'skipped'].includes(c.status)).length
  }
  return (
    Number(task?.passed || 0)
    + Number(task?.failed || 0)
    + Number(task?.blocked || 0)
    + Number(task?.declined || 0)
    + Number(task?.untestable || 0)
  )
}

/** 列表展示用终态：已完成不再和失败抢红色 */
export function displayTaskStatus(task) {
  const s = String(task?.status || '')
  const failed = Number(task?.failed || 0)
  const passed = Number(task?.passed || 0)
  if (s === 'running' || s === 'queued') return s
  if (s === 'cancelled') return 'cancelled'
  const untestable = Number(task?.untestable || 0)
  if (failed === 0 && passed === 0 && Number(task?.expect_unverifiable || 0) > 0) return 'unverifiable'
  if (failed === 0 && passed === 0 && untestable > 0) return 'untestable'
  if (failed > 0 && passed > 0) return 'partial_fail'
  if (s === 'failed' || s === 'fail') return 'failed'
  if ((s === 'done' || s === 'pass' || s === 'success') && failed > 0) {
    return 'partial_fail'
  }
  if (s === 'done' || s === 'pass' || s === 'success') return 'done'
  return s || 'unknown'
}

export function taskProgressPct(task) {
  const total = Number(task?.total || 0)
  const vis = displayTaskStatus(task)
  if (vis === 'running' || vis === 'queued') {
    if (task?.progress != null) return Number(task.progress)
    return total > 0 ? Math.round((Number(task.completed || 0) / total) * 100) : 0
  }
  if (vis === 'cancelled') {
    if (!total) return 0
    return Math.round((taskJudgedCount(task) / total) * 100)
  }
  if (!total) return vis === 'done' ? 100 : 0
  const done = Number(task?.completed || 0)
  return Math.min(100, Math.round((done / total) * 100))
}

export function taskPassRate(task) {
  const cases = task?.cases || []
  if (cases.length) {
    const s = summarizeTaskCoverage(cases)
    if (s.productDenom) return s.productPassRate
    if (task?.pass_rate != null && task.pass_rate !== '') {
      const n = Number(task.pass_rate)
      if (!Number.isNaN(n)) return Math.round(n)
    }
    return null
  }
  const judged = Number(task?.passed || 0) + Number(task?.failed || 0)
  if (!judged) return null
  return Math.round((Number(task?.passed || 0) / judged) * 100)
}

export function taskCountLabel(task) {
  const total = Number(task?.total || 0)
  const vis = displayTaskStatus(task)
  const failed = Number(task?.failed || 0)
  if (vis === 'cancelled') {
    const judged = taskJudgedCount(task)
    return judged ? `${judged}/${total || judged} 已执行` : `0/${total || 0}`
  }
  const completed = Number(task?.completed || 0)
  const base = total ? `${completed}/${total}` : `${completed}`
  if (failed > 0) return `${base} · ${failed} 失败`
  return base
}

export function taskTitle(task) {
  const cases = task?.cases || []
  const running = cases.filter((c) => c.status === 'running' || c.hitl)
  if (running.length === 1) return running[0].name || running[0].case_id || '执行中'
  if (running.length > 1) {
    const name = running[0].name || running[0].case_id || '用例'
    return `${name} 等 ${running.length} 条执行中`
  }
  const names = [...new Set(cases.map((c) => c.name || c.case_id).filter(Boolean))]
  if (names.length === 1) return names[0]
  const total = Number(task?.total || 0) || cases.length
  if (names.length) return `${names[0]} 等 ${total || names.length} 条`
  if (total) return `${total} 条用例`
  return shortTaskId(task?.taskId || task?.task_id) || '任务'
}

export function sortTasksForList(tasks = []) {
  const rank = (t) => {
    const s = displayTaskStatus(t)
    if (s === 'running' || s === 'queued' || s === 'blocked') return 0
    return 1
  }
  return [...tasks].sort((a, b) => {
    const d = rank(a) - rank(b)
    if (d) return d
    return String(b.startedAt || '').localeCompare(String(a.startedAt || ''))
  })
}

export function filterTasks(tasks = [], { status = 'all', sn = '', when = 'all' } = {}) {
  const now = Date.now()
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  const todayTs = startOfToday.getTime()
  const weekTs = todayTs - 6 * 24 * 60 * 60 * 1000
  return tasks.filter((t) => {
    const vis = displayTaskStatus(t)
    if (status && status !== 'all') {
      if (status === 'running' && vis !== 'running' && vis !== 'queued') return false
      if (status === 'failed' && vis !== 'failed') return false
      if (status === 'partial_fail' && vis !== 'partial_fail') return false
      if (status === 'cancelled' && vis !== 'cancelled') return false
      if (status === 'done' && vis !== 'done') return false
      if (status === 'blocked' && vis !== 'blocked') return false
    }
    if (sn && !taskSns(t).includes(sn)) return false
    if (when === 'today' || when === 'week') {
      const ts = Date.parse(t.startedAt || '') || 0
      if (!ts) return false
      if (when === 'today' && ts < todayTs) return false
      if (when === 'week' && ts < weekTs) return false
      if (ts > now + 60_000) return false
    }
    return true
  })
}

export function casePlatformKind(c) {
  const p = String(c?.platform || c?.client || c?.terminal || '').toLowerCase()
  const ios = p.includes('ios') || p.includes('苹果') || p.includes('iphone') || p.includes('ipad')
  const android = p.includes('android') || p.includes('安卓')
  const web = p.includes('web') || p.includes('h5') || p.includes('网页') || p.includes('后台') || p.includes('浏览器')
  if (p.includes('双') || p.includes('both') || (ios && android) || (web && (ios || android))) return 'any'
  if (ios) return 'ios'
  if (android) return 'android'
  if (web) return 'web'
  return 'any'
}

export function devicePlatformKind(device) {
  const blob = [
    device?.execChannel,
    device?.device_type,
    device?.type,
    device?.platform,
    device?.model,
    device?.sn,
  ].map((x) => String(x || '')).join(' ').toLowerCase()
  if (blob.includes('ios') || blob.includes('iphone') || blob.includes('ipad')) return 'ios'
  if (blob.includes('web') || blob.includes('playwright') || blob.includes('browser') || blob.includes('浏览器')) return 'web'
  return 'android'
}

export function normalizeTaskStatus(s) {
  const v = String(s || '').toLowerCase()
  if (v === 'fail') return 'failed'
  if (v === 'success' || v === 'pass') return 'done'
  return v || 'unknown'
}

export function normalizeCaseStatus(s) {
  const v = String(s || '').toLowerCase()
  if (v === 'failed') return 'fail'
  return v || 'unknown'
}

export function normalizeCase(raw = {}, taskId = '') {
  const caseId = String(raw.case_id || caseIdFromCaseRunId(raw.report_run_id || raw.run_id) || '')
  const reportRunId = raw.report_run_id || (taskId && caseId ? `${taskId}::${caseId}` : (raw.run_id || ''))
  return {
    case_id: caseId,
    name: raw.name || raw.case_name || caseId,
    sn: raw.sn || '',
    status: normalizeCaseStatus(raw.status || raw.overall_status),
    report_run_id: reportRunId,
    summary: raw.summary || '',
    elapsed_ms: Number(raw.elapsed_ms || 0),
    started_at: raw.started_at || '',
    hitl: Boolean(raw.hitl),
    passed: raw.passed,
    failed: raw.failed,
    blocked: raw.blocked,
    skipped: raw.skipped,
    module: raw.module || '',
    precondition: raw.precondition || raw.precondition_raw || '',
    steps: Array.isArray(raw.steps) ? raw.steps : [],
    expected: Array.isArray(raw.expected) ? raw.expected : [],
    steps_raw: raw.steps_raw || (typeof raw.steps === 'string' ? raw.steps : ''),
    expected_raw: raw.expected_raw || (typeof raw.expected === 'string' ? raw.expected : ''),
    platform: raw.platform || '',
    device_platform: raw.device_platform || '',
    failure_category: raw.failure_category || '',
    failure_label: raw.failure_label || '',
    coverage_class: raw.coverage_class || '',
    coverage_label: raw.coverage_label || '',
    coverage: (raw.coverage && typeof raw.coverage === 'object') ? raw.coverage : null,
    expected_by_step: (raw.expected_by_step && typeof raw.expected_by_step === 'object') ? raw.expected_by_step : {},
    step_nums: Array.isArray(raw.step_nums) ? raw.step_nums : [],
    expected_nums: Array.isArray(raw.expected_nums) ? raw.expected_nums : [],
    knowledge_ids: Array.isArray(raw.knowledge_ids) ? raw.knowledge_ids : [],
    knowledge_proposals: Array.isArray(raw.knowledge_proposals) ? raw.knowledge_proposals : [],
  }
}

/** 任务 API / 内存 snapshot / 旧 run 文档 → 工作台任务行 */
export function normalizeTask(raw, { source = '' } = {}) {
  if (!raw || typeof raw !== 'object') return null
  const taskId = String(raw.task_id || raw.taskId || raw.run_id || '')
  if (!taskId) return null
  const total = Number(raw.total || 0)
  const completed = Number(raw.completed || 0)
  const passed = Number(raw.passed || 0)
  const failed = Number(raw.failed || 0)
  const blocked = Number(raw.blocked || 0)
  const declined = Number(raw.declined || 0)
  const untestable = Number(raw.untestable || 0)
  const status = normalizeTaskStatus(raw.status)
  const progress = raw.progress != null
    ? Number(raw.progress)
    : (total > 0 ? Math.round((completed / total) * 100) : (status === 'done' ? 100 : 0))
  const passRate = raw.pass_rate != null
    ? Number(raw.pass_rate)
    : (() => {
      const judged = Math.max(0, completed - untestable)
      return judged > 0 ? Math.round((passed / judged) * 100) : 0
    })()
  const cases = Array.isArray(raw.cases) ? raw.cases.map((c) => normalizeCase(c, taskId)) : []
  return {
    taskId,
    appId: raw.app_id || raw.appId || '',
    appName: raw.app_name || raw.appName || '',
    runType: raw.run_type || raw.runType || 'manual',
    sn: raw.sn || '',
    sns: Array.isArray(raw.sns) ? raw.sns.map((s) => String(s || '').trim()).filter(Boolean) : (raw.sn ? [String(raw.sn)] : []),
    coverage: String(raw.coverage || 'once').toLowerCase() === 'per_device' ? 'per_device' : 'once',
    platform: raw.platform || 'android',
    platforms_by_sn: (raw.platforms_by_sn && typeof raw.platforms_by_sn === 'object') ? raw.platforms_by_sn : {},
    packages_by_platform: (raw.packages_by_platform && typeof raw.packages_by_platform === 'object') ? raw.packages_by_platform : {},
    status,
    total,
    completed,
    passed,
    failed,
    blocked,
    declined,
    untestable,
    prep_insufficient: Number(raw.prep_insufficient || 0),
    step_unexecutable: Number(raw.step_unexecutable || 0),
    expect_unverifiable: Number(raw.expect_unverifiable || 0),
    engine_error: Number(raw.engine_error || 0),
    progress,
    passRate,
    startedAt: raw.started_at || raw.startedAt || '',
    finishedAt: raw.finished_at || raw.finishedAt || '',
    error: raw.error || '',
    providerName: raw.provider_name || '',
    modelName: raw.model_name || '',
    currentCaseId: raw.current_case_id || raw.currentCaseId || '',
    busy: Boolean(raw.busy),
    cases,
    source: source || raw.source || 'tasks-api',
    title: raw.title || '',
    role: raw.role || '',
    kind: raw.kind || '',
    envProfile: raw.env_profile || raw.envProfile || '',
    package: raw.package || '',
    requirementId: raw.requirement_id || raw.requirementId || '',
    releaseId: raw.release_id || raw.releaseId || '',
    slotId: raw.slot_id || raw.slotId || '',
    atlas_patch: raw.atlas_patch && typeof raw.atlas_patch === 'object' ? raw.atlas_patch : null,
    knowledge_ids: Array.isArray(raw.knowledge_ids) ? raw.knowledge_ids : [],
    knowledge_proposals: Array.isArray(raw.knowledge_proposals) ? raw.knowledge_proposals : [],
  }
}

/** @deprecated 使用 normalizeTask */
export function normalizeMemoryRun(run) {
  if (!run?.run_id && !run?.task_id) return null
  return normalizeTask(run, { source: 'memory' })
}

export function groupTracesIntoTasks(traces = [], { appId = '' } = {}) {
  const map = new Map()
  for (const t of traces) {
    const runId = t.run_id || ''
    const batch = batchIdFromCaseRunId(runId)
    if (!batch) continue
    if (!map.has(batch)) {
      map.set(batch, {
        task_id: batch,
        app_id: appId,
        sn: t.sn || '',
        platform: t.platform || 'android',
        status: 'done',
        total: 0,
        completed: 0,
        passed: 0,
        failed: 0,
        blocked: 0,
        declined: 0,
        started_at: t.created_at || t.started_at || '',
        cases: [],
        source: 'traces',
      })
    }
    const task = map.get(batch)
    const caseId = t.case_id || caseIdFromCaseRunId(runId)
    const status = normalizeCaseStatus(t.status || t.overall_status)
    task.cases.push({
      case_id: caseId,
      name: t.case_name || caseId,
      status,
      report_run_id: runId,
      summary: t.summary || '',
      elapsed_ms: t.elapsed_ms,
      passed: t.passed,
      failed: t.failed,
      blocked: t.blocked,
      skipped: t.skipped,
    })
    task.total += 1
    task.completed += 1
    if (status === 'pass') task.passed += 1
    else if (status === 'blocked') task.blocked += 1
    else if (status === 'declined') task.declined += 1
    else if (status === 'untestable') task.untestable = Number(task.untestable || 0) + 1
    else if (status !== 'running' && status !== 'pending') task.failed += 1
    if (!task.sn && t.sn) task.sn = t.sn
    if (t.created_at && (!task.started_at || t.created_at < task.started_at)) task.started_at = t.created_at
  }
  return [...map.values()].map((raw) => {
    const task = normalizeTask(raw, { source: 'traces' })
    if (task.cases.some((c) => c.status === 'running')) task.status = 'running'
    else if (task.failed > 0 && task.passed > 0) task.status = 'done'
    else if (task.failed > 0) task.status = 'failed'
    else task.status = 'done'
    task.progress = task.total > 0 ? Math.round((task.completed / task.total) * 100) : 0
    task.passRate = task.completed > 0 ? Math.round((task.passed / task.completed) * 100) : 0
    return task
  })
}

export function mergeTaskLists(memoryTasks = [], traceTasks = []) {
  const map = new Map()
  for (const t of traceTasks) map.set(t.taskId, t)
  for (const t of memoryTasks) map.set(t.taskId, t)
  return [...map.values()].sort((a, b) =>
    String(b.startedAt || '').localeCompare(String(a.startedAt || '')),
  )
}

export function applyTestingTaskEvent(task, data) {
  if (!task || !data) return task
  const next = { ...task, cases: [...(task.cases || [])] }
  if (data.status) next.status = normalizeTaskStatus(data.status)
  if (data.completed != null) next.completed = Number(data.completed)
  if (data.total != null) next.total = Number(data.total)
  if (data.passed != null) next.passed = Number(data.passed)
  if (data.failed != null) next.failed = Number(data.failed)
  if (data.blocked != null) next.blocked = Number(data.blocked)
  if (data.declined != null) next.declined = Number(data.declined)
  if (data.prep_insufficient != null) next.prep_insufficient = Number(data.prep_insufficient)
  if (data.step_unexecutable != null) next.step_unexecutable = Number(data.step_unexecutable)
  if (data.expect_unverifiable != null) next.expect_unverifiable = Number(data.expect_unverifiable)
  if (data.engine_error != null) next.engine_error = Number(data.engine_error)
  if (data.progress != null) next.progress = Number(data.progress)
  if (data.current_case_id) next.currentCaseId = data.current_case_id
  if (data.error != null) next.error = data.error
  if (Array.isArray(data.knowledge_proposals)) next.knowledge_proposals = data.knowledge_proposals
  if (Array.isArray(data.knowledge_ids)) next.knowledge_ids = data.knowledge_ids
  if (Array.isArray(data.sns) && data.sns.length) next.sns = data.sns
  if (data.coverage) next.coverage = data.coverage === 'per_device' ? 'per_device' : 'once'
  if (data.sn) next.sn = data.sn
  if (data.platform) next.platform = data.platform
  if (data.platforms_by_sn && typeof data.platforms_by_sn === 'object') next.platforms_by_sn = data.platforms_by_sn
  if (data.event === 'task_finished' && !data.status) {
    next.status = next.failed > 0 ? 'failed' : 'done'
  }
  if (data.event === 'cancelled') next.status = 'cancelled'
  if (data.case?.case_id) {
    const row = {
      ...normalizeCase(data.case, next.taskId),
      hitl: Boolean(data.case.hitl) || data.event === 'hitl',
    }
    const i = next.cases.findIndex((c) => {
      if (row.report_run_id && c.report_run_id === row.report_run_id) return true
      if (c.case_id !== row.case_id) return false
      if (row.sn) return c.sn === row.sn
      return true
    })
    if (i >= 0) next.cases[i] = { ...next.cases[i], ...row }
    else next.cases.push(row)
  }
  if (data.event === 'hitl' && data.case?.case_id) {
    const i = next.cases.findIndex((c) => {
      if (data.case.report_run_id && c.report_run_id === data.case.report_run_id) return true
      if (c.case_id !== data.case.case_id) return false
      if (data.case.sn) return c.sn === data.case.sn
      return true
    })
    if (i >= 0) next.cases[i] = { ...next.cases[i], hitl: true, status: next.cases[i].status || 'running' }
  }
  if (next.total > 0) next.progress = Math.round((next.completed / next.total) * 100)
  next.passRate = next.completed > 0 ? Math.round((next.passed / next.completed) * 100) : 0
  return next
}

export function isStepLimitCase(row = {}) {
  const cat = String(row.failure_category || '').toLowerCase()
  if (cat === 'budget_exhausted') return true
  const blob = `${row.failure_label || ''} ${row.summary || ''} ${row.status || ''}`
  return /执行超时|时间上限|分钟仍未完成|步数耗尽|步数上限|max_steps/i.test(blob)
    || String(row.status || '') === 'partial'
}

export function statusTagType(s, row = null) {
  if (row && isStepLimitCase(row)) return 'warning'
  const vis = row && (row.taskId || row.total != null) ? displayTaskStatus(row) : s
  const cls = row?.coverage_class
  if (cls === 'product_fail') return 'danger'
  if (cls === 'expect_unverifiable' || vis === 'unverifiable') return 'warning'
  if (['prep_insufficient', 'step_unexecutable', 'engine_error'].includes(cls)) return 'warning'
  if (cls === 'untestable') return 'info'
  if (['pass', 'done', 'success'].includes(vis)) return 'success'
  if (['fail', 'failed'].includes(vis)) return 'danger'
  if (vis === 'partial_fail') return 'warning'
  if (['blocked', 'partial', 'cancelled', 'untestable', 'unverifiable'].includes(vis)) return 'warning'
  if (vis === 'running') return 'primary'
  if (vis === 'pending' || vis === 'queued' || vis === 'skipped') return 'info'
  return 'info'
}

export function statusLabel(s, row = null) {
  if (row && isStepLimitCase(row)) return '执行超时'
  if (row?.coverage_label) return row.coverage_label
  const cls = row?.coverage_class
  if (cls === 'prep_insufficient') return '前置不足'
  if (cls === 'step_unexecutable') return '步骤无法执行'
  if (cls === 'expect_unverifiable') return '无法验证'
  if (cls === 'product_fail') return '校验不通过'
  if (cls === 'engine_error') return '引擎故障'
  const vis = row && (row.taskId || row.total != null) ? displayTaskStatus(row) : s
  return ({
    queued: '排队',
    running: '进行中',
    pending: '待执行',
    done: '已通过',
    failed: '失败',
    fail: '失败',
    pass: '通过',
    blocked: '等人',
    partial: '执行超时',
    partial_fail: '部分失败',
    declined: '拒绝',
    cancelled: '已取消',
    skipped: '跳过',
    untestable: '测不了',
    unverifiable: '无法验证',
    manual: '手工',
    feishu: '飞书',
    schedule: '定时',
    budget_exhausted: '执行超时',
  })[vis] || vis || '未知'
}

export function runTypeLabel(t) {
  const key = String(t || 'manual')
  return ({
    manual: '手工',
    feishu: '飞书',
    schedule: '定时',
    req_admit: '提测冒烟',
    req_test: '功能测试',
    release_regression: '预发回归',
    release_smoke: '生产冒烟',
    copilot: '对话',
  })[key] || statusLabel(key)
}

/** 用例轨道：执行中/HITL → 等人 → 待执行 → 失败 → 通过 → 取消 */
export function sortCasesForRail(cases = []) {
  const rank = (c) => {
    const s = c.status
    if (c.hitl || s === 'running') return 0
    if (s === 'blocked') return 1
    if (s === 'pending') return 2
    if (['fail', 'declined', 'partial'].includes(s)) return 3
    if (s === 'unverifiable') return 3.2
    if (s === 'untestable') return 3.5
    if (s === 'pass') return 4
    if (s === 'cancelled' || s === 'skipped') return 5
    return 6
  }
  return [...cases].sort((a, b) => rank(a) - rank(b))
}

export function progressStatus(task) {
  if (!task) return undefined
  const vis = displayTaskStatus(task)
  if (vis === 'running' || vis === 'queued') return undefined
  if (vis === 'cancelled' || vis === 'partial_fail' || vis === 'unverifiable') return 'warning'
  if (vis === 'failed') return 'exception'
  if (vis === 'done') return 'success'
  return undefined
}

export function apiErrorDetail(err) {
  const d = err?.response?.data?.detail
  if (typeof d === 'string' && d.trim()) return d
  if (Array.isArray(d) && d[0]?.msg) return d.map((x) => x.msg).filter(Boolean).join('; ')
  if (d && typeof d === 'object' && (d.message || d.msg)) return d.message || d.msg
  return err?.message || String(err || '请求失败')
}

export function isMissingTaskEndpoint(err) {
  const s = err?.response?.status
  return s === 404 || s === 405 || s === 501
}

export function parseBusyConflict(err) {
  const status = err?.response?.status
  const detail = err?.response?.data?.detail
  let busyTaskId = ''
  let message = err?.message || '启动失败'
  let sn = ''
  let slotId = ''
  let reservedTitle = ''
  let reservedUntil = ''
  if (typeof detail === 'string') message = detail
  if (detail && typeof detail === 'object') {
    busyTaskId = detail.busy_task_id || ''
    message = detail.message || message
    sn = detail.sn || ''
    slotId = detail.slot_id || ''
    reservedTitle = detail.reserved_title || ''
    reservedUntil = detail.reserved_until || ''
  }
  const isReserved = status === 409 && (message === 'device reserved' || detail?.reason === 'schedule')
  const isBusy = status === 409 && !isReserved && (message === 'device busy' || Boolean(busyTaskId))
  return {
    isBusy,
    isReserved,
    busyTaskId,
    message,
    status,
    sn,
    slotId,
    reservedTitle,
    reservedUntil,
  }
}
