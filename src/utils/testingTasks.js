/**
 * 测试任务 normalize（FE-P0-1）。
 * 新契约：GET /case-runner/tasks ；旧内存 run / traces 仅作兼容与 404 回退。
 */

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
    steps: raw.steps || [],
    expected: raw.expected || [],
    steps_raw: raw.steps_raw || '',
    expected_raw: raw.expected_raw || '',
    failure_category: raw.failure_category || '',
    failure_label: raw.failure_label || '',
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
  const status = normalizeTaskStatus(raw.status)
  const progress = raw.progress != null
    ? Number(raw.progress)
    : (total > 0 ? Math.round((completed / total) * 100) : (status === 'done' ? 100 : 0))
  const passRate = raw.pass_rate != null
    ? Number(raw.pass_rate)
    : (completed > 0 ? Math.round((passed / completed) * 100) : 0)
  const cases = Array.isArray(raw.cases) ? raw.cases.map((c) => normalizeCase(c, taskId)) : []
  return {
    taskId,
    appId: raw.app_id || raw.appId || '',
    appName: raw.app_name || raw.appName || '',
    runType: raw.run_type || raw.runType || 'manual',
    sn: raw.sn || '',
    platform: raw.platform || 'android',
    status,
    total,
    completed,
    passed,
    failed,
    blocked,
    declined,
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
    else if (status !== 'running' && status !== 'pending') task.failed += 1
    if (!task.sn && t.sn) task.sn = t.sn
    if (t.created_at && (!task.started_at || t.created_at < task.started_at)) task.started_at = t.created_at
  }
  return [...map.values()].map((raw) => {
    const task = normalizeTask(raw, { source: 'traces' })
    if (task.cases.some((c) => c.status === 'running')) task.status = 'running'
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
  if (data.progress != null) next.progress = Number(data.progress)
  if (data.current_case_id) next.currentCaseId = data.current_case_id
  if (data.error != null) next.error = data.error
  if (data.event === 'task_finished' && !data.status) {
    next.status = next.failed > 0 ? 'failed' : 'done'
  }
  if (data.event === 'cancelled') next.status = 'cancelled'
  if (data.case?.case_id) {
    const row = {
      ...normalizeCase(data.case, next.taskId),
      hitl: Boolean(data.case.hitl) || data.event === 'hitl',
    }
    const i = next.cases.findIndex((c) => c.case_id === row.case_id)
    if (i >= 0) next.cases[i] = { ...next.cases[i], ...row }
    else next.cases.push(row)
  }
  if (data.event === 'hitl' && data.case?.case_id) {
    const i = next.cases.findIndex((c) => c.case_id === data.case.case_id)
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
  return /步数耗尽|步数上限|max_steps/i.test(blob) || String(row.status || '') === 'partial'
}

export function statusTagType(s, row = null) {
  if (row && isStepLimitCase(row)) return 'warning'
  if (['pass', 'done', 'success'].includes(s)) return 'success'
  if (['fail', 'failed'].includes(s)) return 'danger'
  if (['blocked', 'partial', 'cancelled'].includes(s)) return 'warning'
  if (s === 'running') return 'primary'
  if (s === 'pending' || s === 'queued' || s === 'skipped') return 'info'
  return 'info'
}

export function statusLabel(s, row = null) {
  if (row && isStepLimitCase(row)) return '步数耗尽'
  return ({
    queued: '排队',
    running: '进行中',
    pending: '待执行',
    done: '已完成',
    failed: '失败',
    fail: '失败',
    pass: '通过',
    blocked: '等人',
    partial: '步数耗尽',
    declined: '拒绝',
    cancelled: '已取消',
    skipped: '跳过',
    manual: '手工',
    feishu: '飞书',
    schedule: '定时',
    budget_exhausted: '步数耗尽',
  })[s] || s || '未知'
}

export function runTypeLabel(t) {
  return statusLabel(t || 'manual')
}

/** 用例轨道：执行中/HITL → 等人 → 待执行 → 失败 → 通过 → 取消 */
export function sortCasesForRail(cases = []) {
  const rank = (c) => {
    const s = c.status
    if (c.hitl || s === 'running') return 0
    if (s === 'blocked') return 1
    if (s === 'pending') return 2
    if (['fail', 'declined', 'partial'].includes(s)) return 3
    if (s === 'pass') return 4
    if (s === 'cancelled' || s === 'skipped') return 5
    return 6
  }
  return [...cases].sort((a, b) => rank(a) - rank(b))
}

export function progressStatus(task) {
  if (!task) return undefined
  if (task.status === 'running' || task.status === 'queued') return undefined
  if (task.status === 'cancelled') return 'warning'
  if (task.status === 'failed' || task.failed > 0) return 'exception'
  if (task.progress === 100 || task.status === 'done') return 'success'
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
  if (typeof detail === 'string') message = detail
  if (detail && typeof detail === 'object') {
    busyTaskId = detail.busy_task_id || ''
    message = detail.message || message
  }
  return { isBusy: status === 409 || Boolean(busyTaskId), busyTaskId, message, status }
}
