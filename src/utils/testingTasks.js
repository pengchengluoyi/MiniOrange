/**
 * 前端侧把现有 API 聚合成「任务」（不动 server）。
 * 优先内存 batch runs（含 app_id / progress）；再按 traces 的 cr-xxx::case 前缀拼装。
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

export function normalizeMemoryRun(run) {
  if (!run?.run_id) return null
  const total = Number(run.total || 0)
  const completed = Number(run.completed || 0)
  const passed = Number(run.passed || 0)
  const failed = Number(run.failed || 0)
  const blocked = Number(run.blocked || 0)
  const progress = total > 0 ? Math.round((completed / total) * 100) : (run.status === 'done' ? 100 : 0)
  const passRate = completed > 0 ? Math.round((passed / completed) * 100) : 0
  return {
    taskId: run.run_id,
    appId: run.app_id || '',
    appName: run.app_name || '',
    sn: run.sn || '',
    platform: run.platform || 'android',
    status: run.status || 'unknown',
    total,
    completed,
    passed,
    failed,
    blocked,
    declined: Number(run.declined || 0),
    progress,
    passRate,
    startedAt: run.started_at || '',
    finishedAt: run.finished_at || '',
    error: run.error || '',
    cases: Array.isArray(run.cases) ? run.cases : [],
    source: 'memory',
  }
}

export function groupTracesIntoTasks(traces = [], { appId = '' } = {}) {
  const map = new Map()
  for (const t of traces) {
    const runId = t.run_id || ''
    const batch = batchIdFromCaseRunId(runId)
    if (!batch) continue
    if (!map.has(batch)) {
      map.set(batch, {
        taskId: batch,
        appId,
        appName: '',
        sn: t.sn || '',
        platform: t.platform || 'android',
        status: 'done',
        total: 0,
        completed: 0,
        passed: 0,
        failed: 0,
        blocked: 0,
        declined: 0,
        progress: 100,
        passRate: 0,
        startedAt: t.created_at || t.started_at || '',
        finishedAt: '',
        error: '',
        cases: [],
        source: 'traces',
      })
    }
    const task = map.get(batch)
    const caseId = t.case_id || caseIdFromCaseRunId(runId)
    const status = t.status || t.overall_status || 'unknown'
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
    else if (status !== 'running') task.failed += 1
    if (!task.sn && t.sn) task.sn = t.sn
    if (t.created_at && (!task.startedAt || t.created_at < task.startedAt)) task.startedAt = t.created_at
  }
  for (const task of map.values()) {
    task.progress = task.total > 0 ? Math.round((task.completed / task.total) * 100) : 0
    task.passRate = task.completed > 0 ? Math.round((task.passed / task.completed) * 100) : 0
    if (task.cases.some((c) => c.status === 'running')) task.status = 'running'
    else if (task.failed > 0) task.status = 'failed'
    else if (task.passed === task.total && task.total > 0) task.status = 'done'
    else task.status = 'done'
  }
  return [...map.values()]
}

export function mergeTaskLists(memoryTasks = [], traceTasks = []) {
  const map = new Map()
  for (const t of traceTasks) map.set(t.taskId, t)
  for (const t of memoryTasks) map.set(t.taskId, t) // memory wins (has live progress)
  // 仅按开始时间倒排（进行中/失败不再置顶）
  return [...map.values()].sort((a, b) =>
    String(b.startedAt || '').localeCompare(String(a.startedAt || '')),
  )
}

export function statusTagType(s) {
  if (['pass', 'done', 'success'].includes(s)) return 'success'
  if (['fail', 'failed'].includes(s)) return 'danger'
  if (['blocked', 'partial'].includes(s)) return 'warning'
  if (s === 'running') return 'primary'
  if (s === 'pending') return 'info'
  return 'info'
}

export function statusLabel(s) {
  return ({
    running: '进行中',
    pending: '待执行',
    done: '已完成',
    failed: '失败',
    fail: '失败',
    pass: '通过',
    blocked: '等人',
    partial: '部分通过',
    declined: '拒绝',
  })[s] || s || '未知'
}

/** 用例轨道展示顺序：执行中 → 等人 → 待执行 → 已完成(失败优先于通过) */
export function sortCasesForRail(cases = []) {
  const rank = (s) => {
    if (s === 'running') return 0
    if (s === 'blocked') return 1
    if (s === 'pending') return 2
    if (['fail', 'failed', 'declined', 'partial'].includes(s)) return 3
    if (s === 'pass') return 4
    return 5
  }
  return [...cases].sort((a, b) => rank(a.status) - rank(b.status))
}

export function progressStatus(task) {
  if (!task) return undefined
  if (task.status === 'running') return undefined
  if (task.status === 'failed' || task.failed > 0) return 'exception'
  if (task.progress === 100 || task.status === 'done') return 'success'
  return undefined
}
