import { classifyPrepLine, classifyStepLine, classifyExpectLine, codeLooksGap, gapTagOf } from './caseCatalog.js'
import {
  alignCaseStepExpected,
  normalizeCaseRow,
  splitPreconditionLines,
  splitStepOperations,
} from './caseText.js'

const LIVE = new Set(['thinking', 'checking', 'running', 'continue'])
const FAIL = new Set(['fail', 'failed', 'give_up', 'declined', 'blocked'])
const DONE = new Set(['done', 'pass', 'skipped', 'skip'])

export function isLiveEngineStep(s) {
  const st = String(s?.status || '')
  const rs = String(s?.result_status || '')
  if (LIVE.has(st) && !DONE.has(rs) && !FAIL.has(rs)) return true
  return false
}

export function isFailEngineStep(s) {
  return FAIL.has(String(s?.result_status || s?.status || ''))
}

function capOf(step) {
  return String(step?.cap || step?.action?.capability_id || '').toLowerCase()
}

function isObserveStep(text) {
  const t = String(text || '').trim()
  if (!t) return true
  if (/点击|点「|点选|输入|填写|滑动|上滑|下滑|打开应用|启动|长按|拖|按返回/.test(t)) return false
  return /^(查看|检查|观察|确认是否|确认一下|看一下|看看)/.test(t)
}

function engineKind(step) {
  const cap = capOf(step)
  const blob = `${cap} ${step?.summary || ''} ${step?.thought || ''}`
  if (/assert|checkpoint|assert_skip/.test(cap) || /断言失败|assert_visual|assert_goal|无法校验|无法验证/.test(blob)) return 'assert'
  if (/skip_out_of_order/.test(cap)) return 'assert'
  if (/skip_restart|clear_cache|check_logged|check_not_logged|check_sim|check_wechat|grant_perm|keep_permission|pick_account|bind_account|inspect_session|session_gate/.test(cap)) {
    return 'prep'
  }
  if (/recovery|overlay|dismiss_popup|close_popup/.test(cap)) return 'heal'
  if (/launch|open_app|close_app|kill_app/.test(cap)) return 'launch'
  return 'do'
}

function catalogIdFromCap(cap) {
  const c = String(cap || '').toLowerCase()
  if (/launch|open_app/.test(c)) return 'launch_app'
  if (/kill/.test(c)) return 'kill_app'
  if (/long_press|longpress/.test(c)) return 'long_press'
  if (/drag/.test(c)) return 'drag'
  if (/swipe|scroll/.test(c)) return 'swipe'
  if (/input|type|fill/.test(c)) return 'input_text'
  if (/key|back|home/.test(c)) return 'press_key'
  if (/wait|sleep/.test(c)) return 'wait_ms'
  if (/tap|click/.test(c)) return 'tap_element'
  if (/assert/.test(c)) return 'assert'
  return ''
}

function parseCpNums(step) {
  const bag = []
  const raw = [...(step?.checkpoint_ids || []), ...(step?.checkpoints_hit || [])]
  for (const x of raw) {
    const id = String(x?.id || x || '')
    const m = id.match(/cp(\d+)/i)
    if (m) bag.push(Number(m[1]))
  }
  return bag
}

function codeLooksFail(code) {
  const c = String(code || '')
  if (!c) return false
  if (/SKIPPED/.test(c) && !/\.FAIL/.test(c)) return false
  return /UNMET|\.FAIL|FAIL\./.test(c)
}

function codeLooksOk(code) {
  const c = String(code || '')
  return /PASS|\.OK|HEALED/.test(c)
}

function codeLooksSkip(code) {
  return /SKIPPED/.test(String(code || ''))
}

function makeTask({ id, kind, title, skip = false, code = '', catalogId = '', stepNum = 0, msg = '', gapTag = '' }) {
  return {
    id,
    kind,
    title,
    skip,
    code,
    catalogId,
    stepNum,
    msg,
    gapTag,
    cardNos: [],
    status: 'queued',
  }
}

function makeGroup({ id, label, kind, stepNum = 0, tasks }) {
  return {
    id,
    label,
    kind,
    stepNum,
    tasks,
    status: 'queued',
    hint: '',
  }
}

function prepTextMatch(a, b) {
  const x = String(a || '').trim()
  const y = String(b || '').trim()
  if (!x || !y) return false
  if (x === y) return true
  const shorter = x.length <= y.length ? x : y
  const longer = x.length <= y.length ? y : x
  return longer.includes(shorter) && shorter.length / longer.length >= 0.45
}

function pickPrepRow(text, rows) {
  const i = rows.findIndex((r) => prepTextMatch(text, r.text))
  if (i >= 0) return rows.splice(i, 1)[0]
  return null
}

function stampPrepTask(text, row) {
  const guessed = classifyPrepLine(text)
  let code = row?.code || ''
  let msg = row?.msg || ''
  const inLib = guessed.kind && guessed.kind !== 'unknown' && !String(guessed.code || '').includes('UNSUPPORTED')
  if (inLib) {
    if (!code || /UNKNOWN/.test(code)) {
      code = ''
      msg = ''
    }
  } else if (String(guessed.code || '').includes('UNSUPPORTED')) {
    code = guessed.code
    msg = msg || `前置引擎无法执行（${guessed.kind}）`
  } else {
    code = code || guessed.code
    msg = msg || `前置未命中引擎库: ${text}`
  }
  const gapTag = row?.tag || gapTagOf(code, guessed.kind)
  return { code, msg, gapTag }
}

function emptyTree(spec, coverage) {
  const groups = []
  const prepLines = splitPreconditionLines(spec?.precondition || spec?.precondition_raw || '')
  const prepCov = Array.isArray(coverage?.prep) ? [...coverage.prep] : []
  if (prepLines.length || prepCov.length) {
    const lines = prepLines.length ? prepLines : prepCov.map((p) => p.text || p.kind)
    groups.push(makeGroup({
      id: 'prep',
      label: '前置',
      kind: 'prep',
      tasks: lines.map((text, i) => {
        const row = pickPrepRow(text, prepCov)
        const stamped = stampPrepTask(text, row)
        return makeTask({
          id: `p${i + 1}`,
          kind: 'prep',
          title: text,
          code: stamped.code,
          msg: stamped.msg,
          gapTag: stamped.gapTag,
          stepNum: 0,
        })
      }),
    }))
  }
  for (const pair of alignCaseStepExpected(spec)) {
    const ops = splitStepOperations(pair.step)
    const stepCov = (coverage?.steps || []).find((s) => Number(s.n) === pair.num)
    const expRows = (coverage?.expects || []).filter((e) => Number(e.n) === pair.num)
    const skipExpect = !pair.expected || (
      expRows.length > 0 && expRows.every((e) => /SKIPPED\.no_expect/.test(String(e?.code || '')))
    )
    const tasks = []
    const opTexts = ops.length ? ops : (pair.step ? [pair.step] : [])
    opTexts.forEach((text, i) => {
      if (isObserveStep(text)) return
      const stepCode = stepCov?.code || ''
      tasks.push(makeTask({
        id: `s${pair.num}-op${i + 1}`,
        kind: 'do',
        title: text,
        code: stepCode,
        catalogId: classifyStepLine(text).id,
        gapTag: gapTagOf(stepCode),
        stepNum: pair.num,
      }))
    })
    const expCode = expRows.map((e) => e.code).filter(Boolean).join('|')
      || (skipExpect ? 'EXPECT.SKIPPED.no_expect' : '')
    const expGuess = skipExpect ? { code: '', id: '' } : classifyExpectLine(pair.expected)
    const gapFromRows = expRows.map((e) => e.code).find((c) => codeLooksGap(c))
    const expGapCode = gapFromRows || (codeLooksGap(expGuess.code) ? expGuess.code : '')
    tasks.push(makeTask({
      id: `s${pair.num}-ck`,
      kind: 'check',
      title: skipExpect ? '不验' : pair.expected,
      skip: skipExpect,
      code: expCode,
      gapTag: skipExpect ? '' : gapTagOf(expGapCode || expCode, expGuess.id),
      stepNum: pair.num,
    }))
    groups.push(makeGroup({
      id: `s${pair.num}`,
      label: `步骤 ${pair.num}${pair.step ? ` · ${pair.step}` : ''}`,
      kind: 'step',
      stepNum: pair.num,
      tasks,
    }))
  }
  return groups
}

function pickDoTask(group, capId) {
  const ops = (group?.tasks || []).filter((t) => t.kind === 'do')
  if (!ops.length) return null
  const from = group._opI || 0
  if (capId) {
    const hit = ops.findIndex((o, i) => i >= from && o.catalogId === capId)
    if (hit >= 0) {
      group._opI = hit
      return ops[hit]
    }
  }
  const i = Math.min(from, ops.length - 1)
  group._opI = i
  return ops[i]
}

function isGapTask(t) {
  return Boolean(t?.gapTag) || codeLooksGap(t?.code)
}

function matchPrepTask(prep, step) {
  const tasks = prep?.tasks || []
  if (!tasks.length) return null
  const cap = capOf(step)
  const hit = (pred) => tasks.find(pred)
  if (/session_gate|inspect_session|check_logged|pick_account|bind_account/.test(cap)) {
    return hit((t) => /logged|session/.test(classifyPrepLine(t.title).kind) || /已登录|未登录|游客|登录/.test(t.title))
      || hit((t) => !isGapTask(t))
  }
  if (/skip_restart|launch_app|open_app|close_app|kill_app/.test(cap)) {
    return hit((t) => /已打开|打开.*app|打开应用/i.test(t.title))
      || hit((t) => !isGapTask(t))
  }
  if (/clear_cache/.test(cap)) {
    return hit((t) => classifyPrepLine(t.title).kind === 'clear_cache') || hit((t) => !isGapTask(t))
  }
  return hit((t) => !isGapTask(t)) || tasks[0]
}

function hangCheck(g, no) {
  const ck = g?.tasks.find((t) => t.kind === 'check')
  if (ck && !ck.skip) ck.cardNos.push(no)
  return ck
}

function opsHung(g) {
  const ops = (g?.tasks || []).filter((t) => t.kind === 'do')
  if (!ops.length) return true
  return ops.every((t) => (t.cardNos || []).length)
}

function isWaitCap(cap) {
  return /wait|sleep/.test(String(cap || ''))
}

function hangDoCard(task, no, cap) {
  if (!task) return 'check'
  task.cardNos.push(no)
  return /skip_repeat/.test(String(cap || '')) ? 'check' : 'do'
}

function assignEngineSteps(groups, engineSteps) {
  const prep = groups.find((g) => g.kind === 'prep')
  const stepGroups = groups.filter((g) => g.kind === 'step')
  let stepI = 0
  let inPrep = Boolean(prep?.tasks?.length)
  let lastDo = null
  let lastHang = 'prep'

  const firstOpLaunch = stepGroups[0]?.tasks?.some(
    (t) => t.kind === 'do' && t.catalogId === 'launch_app',
  )

  for (const step of engineSteps || []) {
    const no = Number(step?.step)
    if (!Number.isFinite(no) || no <= 0) continue
    const kind = engineKind(step)
    const cps = parseCpNums(step)
    const capId = catalogIdFromCap(capOf(step))
    const cap = capOf(step)
    const gCur = stepGroups[Math.min(stepI, Math.max(0, stepGroups.length - 1))]
    const waitOrThink = isWaitCap(cap) || (!cap && isLiveEngineStep(step))
    const toCheck = kind === 'assert'
      || (lastHang === 'check' && waitOrThink)
      || (lastHang !== 'prep' && opsHung(gCur) && waitOrThink)

    if (toCheck) {
      inPrep = false
      const nums = cps.length
        ? cps
        : [stepGroups[Math.min(stepI, Math.max(0, stepGroups.length - 1))]?.stepNum]
      let lastIdx = -1
      for (const n of nums) {
        const g = stepGroups.find((x) => x.stepNum === n) || stepGroups[stepI]
        hangCheck(g, no)
        lastIdx = Math.max(lastIdx, stepGroups.indexOf(g))
      }
      const rs = String(step?.result_status || '').toLowerCase()
      lastDo = null
      if (kind === 'assert' && lastIdx >= 0 && (rs === 'pass' || rs === 'done')) {
        stepI = Math.min(lastIdx + 1, stepGroups.length)
        const next = stepGroups[stepI]
        lastHang = !next || opsHung(next) ? 'check' : 'do'
      } else {
        lastHang = 'check'
      }
      continue
    }

    if (cps.length && kind !== 'assert') {
      inPrep = false
      const n = cps[0]
      const g = stepGroups.find((x) => x.stepNum === n) || stepGroups[Math.min(stepI, stepGroups.length - 1)]
      const ops = (g?.tasks || []).filter((t) => t.kind === 'do')
      if (!ops.length) {
        hangCheck(g, no)
        lastHang = 'check'
        continue
      }
      const task = pickDoTask(g, capId) || ops[0]
      lastHang = hangDoCard(task, no, cap)
      if (task) lastDo = task
      const idx = stepGroups.indexOf(g)
      if (idx >= 0) stepI = idx
      continue
    }

    const launchAsPrep = kind === 'launch' && inPrep && !firstOpLaunch
    if ((kind === 'prep' || launchAsPrep) && prep?.tasks?.length && inPrep) {
      const t = matchPrepTask(prep, step)
      if (t) t.cardNos.push(no)
      lastDo = null
      lastHang = 'prep'
      continue
    }

    inPrep = false
    if (!stepGroups.length) continue
    if (kind === 'heal' && lastDo) {
      lastDo.cardNos.push(no)
      continue
    }

    let g = stepGroups[Math.min(stepI, stepGroups.length - 1)]
    const ops = (g?.tasks || []).filter((t) => t.kind === 'do')
    if (!ops.length) {
      hangCheck(g, no)
      lastHang = 'check'
      continue
    }
    const curHas = Boolean(capId && ops.some((t) => t.catalogId === capId))
    if (capId && g && !curHas) {
      const later = stepGroups.slice(stepI + 1).find((sg) => (
        sg.tasks.some((t) => t.kind === 'do' && t.catalogId === capId)
      ))
      if (later) {
        stepI = stepGroups.indexOf(later)
        g = later
      }
    }
    const task = pickDoTask(g, capId) || lastDo
    if (task && task.kind === 'do') {
      lastHang = hangDoCard(task, no, cap)
      lastDo = task
    } else {
      hangCheck(g, no)
      lastHang = 'check'
    }
  }
}

function resolveCards(task, byNo) {
  return (task.cardNos || []).map((n) => byNo.get(n)).filter(Boolean)
}

function taskStatus(task, { finished, runningId, blocked, byNo }) {
  if (task.kind === 'check' && (task.skip || /SKIPPED\.no_expect/.test(task.code))) return 'skip'
  if (task.id === runningId) return 'run'
  const cards = resolveCards(task, byNo)
  if (cards.some(isLiveEngineStep)) return 'run'
  if (codeLooksFail(task.code) || cards.some(isFailEngineStep)) return 'fail'
  if (codeLooksGap(task.code) || task.gapTag) return 'gap'
  if (blocked && task.kind !== 'prep') return 'blocked'
  if (codeLooksOk(task.code) && (finished || cards.length)) return 'done'
  if (cards.length && cards.every((s) => DONE.has(String(s.result_status || s.status)) || isFailEngineStep(s))) {
    return cards.some(isFailEngineStep) ? 'fail' : 'done'
  }
  if (finished) {
    if (codeLooksSkip(task.code) && /no_expect/.test(task.code)) return 'skip'
    if (codeLooksSkip(task.code)) return 'blocked'
    if (cards.length) return cards.some(isFailEngineStep) ? 'fail' : 'done'
    if (task.kind === 'prep' && !task.code) return 'blocked'
    return 'blocked'
  }
  return 'queued'
}

function groupStatus(group) {
  const sts = group.tasks.map((t) => t.status)
  const idle = (s) => s === 'skip' || s === 'gap' || s === 'blocked'
  if (sts.includes('run')) return 'run'
  if (sts.includes('fail')) return 'fail'
  if (sts.every((s) => idle(s))) return sts.includes('blocked') ? 'blocked' : (sts.includes('gap') ? 'gap' : 'skip')
  if (sts.every((s) => s === 'done' || idle(s))) return 'done'
  if (sts.every((s) => s === 'queued' || s === 'skip' || s === 'gap')) return 'queued'
  if (sts.includes('done') && sts.includes('queued')) return 'queued'
  return 'queued'
}

function groupHint(group) {
  if (group.kind === 'prep') {
    const n = group.tasks.length
    const d = group.tasks.filter((t) => t.status === 'done').length
    const bad = group.tasks.filter((t) => t.status === 'fail').length
    const gap = group.tasks.filter((t) => t.status === 'gap').length
    if (bad) return `${d}/${n} · ${bad} 条挡住开跑`
    if (gap) return `${d}/${n} · ${gap} 条无法执行`
    return `${d}/${n}`
  }
  const ops = group.tasks.filter((t) => t.kind === 'do')
  const ck = group.tasks.find((t) => t.kind === 'check')
  const doneOps = ops.filter((t) => t.status === 'done').length
  if (!ops.length) {
    if (group.status === 'blocked') return '未执行'
    if (ck?.status === 'skip') return '不验'
    if (ck?.status === 'gap') return ck.gapTag || '无法验证'
    if (ck?.status === 'run') return '校验中'
    if (ck?.status === 'done') return '已校验'
    if (ck?.status === 'fail') return '校验不通过'
    return ''
  }
  if (group.status === 'blocked') return '未执行'
  if (ck?.status === 'skip') return `${ops.length} 个操作 · 不验`
  if (ck?.status === 'gap') return `${ops.length} 个操作 · ${ck.gapTag || '无法验证'}`
  if (ck?.status === 'run') return `操作 ${doneOps}/${ops.length} · 校验中`
  if (group.status === 'run') return `操作 ${doneOps}/${ops.length} · 校验还没到`
  return `操作 ${doneOps}/${ops.length}${ck ? (ck.status === 'done' ? ' · 已校验' : '') : ''}`
}

function groupRunLabel(group) {
  if (group.status !== 'run') return TASK_STATUS_LABEL[group.status] || group.status
  if (group.kind === 'prep') return '执行中'
  const ck = group.tasks.find((t) => t.kind === 'check')
  if (ck?.status === 'run') return '校验中'
  if (group.tasks.some((t) => t.kind === 'do' && t.status === 'run')) return '操作中'
  return '执行中'
}

export function runningTaskId(groups, engineSteps, { finished, live } = {}) {
  const focus = [...(engineSteps || [])].reverse().find(isLiveEngineStep)
    || ((live && !finished) ? engineSteps?.[engineSteps.length - 1] : null)
  if (focus) {
    const no = Number(focus.step)
    for (const g of groups) {
      for (const t of g.tasks) {
        if (t.cardNos.includes(no)) return t.id
      }
    }
  }
  if (finished || !live) {
    let last = ''
    for (const g of groups) {
      for (const t of g.tasks) {
        if (t.status === 'fail') return t.id
        if (t.cardNos.length) last = t.id
      }
    }
    return last
  }
  for (const g of groups) {
    const hit = g.tasks.find((t) => t.status === 'run' || (t.status === 'queued' && !t.skip))
    if (hit) return hit.id
  }
  return ''
}

export function taskIdForEngineStep(groups, stepNo) {
  const n = Number(stepNo)
  for (const g of groups) {
    for (const t of g.tasks) {
      if (t.cardNos.includes(n)) return t.id
    }
  }
  return ''
}

export function buildCaseRunGroups({ spec, coverage, engineSteps = [], finished = false, live = false } = {}) {
  const row = normalizeCaseRow(spec || {})
  const groups = emptyTree(row, coverage)
  if (!groups.length) return []
  assignEngineSteps(groups, engineSteps)
  const cls = String(coverage?.coverage_class || '')
  const blocked = (coverage?.prep || []).some((p) => codeLooksFail(p.code))
    || (engineSteps || []).some((s) => /session_gate/.test(capOf(s)) && isFailEngineStep(s))
  const settled = finished || (Boolean(cls) && (cls !== 'prep_insufficient' || blocked))
  const byNo = new Map((engineSteps || []).map((s) => [Number(s.step), s]))
  const runId = ''
  for (const g of groups) {
    for (const t of g.tasks) {
      t.status = taskStatus(t, { finished: settled, runningId: runId, blocked, byNo })
    }
  }
  const rid = runningTaskId(groups, engineSteps, { finished: settled, live: live && !settled })
  if (rid && live && !settled) {
    for (const g of groups) {
      for (const t of g.tasks) {
        if (t.id === rid && t.status === 'queued') t.status = 'run'
      }
    }
  }
  for (const g of groups) {
    g.status = groupStatus(g)
    g.hint = groupHint(g)
    g.runLabel = groupRunLabel(g)
  }
  return groups
}

export const TASK_STATUS_LABEL = {
  done: '通过',
  fail: '失败',
  skip: '不验',
  gap: '无法执行',
  blocked: '未执行',
  run: '执行中',
  queued: '未执行',
}

export function taskStatusLabel(task) {
  const c = String(task?.code || '')
  if (task?.status === 'run') {
    if (task.kind === 'check') return '校验中'
    if (task.kind === 'do') return '操作中'
    return '执行中'
  }
  if (task?.status === 'fail' && task.kind === 'check') return '校验不通过'
  if (task?.gapTag) return task.gapTag
  if (codeLooksGap(c)) return gapTagOf(c)
  if (/UNMET|PREP\.FAIL/.test(c)) return '未就绪'
  if (task?.status === 'gap' && task.kind === 'check') return '无法验证'
  if (task?.status === 'fail' && task.kind === 'prep') return '未就绪'
  if (task?.status === 'fail') return '失败'
  if (task?.skip || /SKIPPED\.no_expect/.test(c)) return '不验'
  if (task?.status === 'blocked' || task?.status === 'queued' || /SKIPPED/.test(c)) return '未执行'
  return TASK_STATUS_LABEL[task?.status] || task?.status || ''
}

export function emptyTaskHint(task) {
  const c = String(task?.code || '')
  if (task?.msg) return task.msg
  if (codeLooksGap(c) || task?.status === 'gap') {
    return task?.gapTag ? `${task.gapTag}，已跳过，不挡住开跑。` : '引擎做不到或认不出，已跳过，不挡住开跑。'
  }
  if (/UNMET|PREP\.FAIL/.test(c)) return '前置检查过了但没满足，所以停在这里。'
  if (task?.status === 'fail') return '没有动作卡片。检查阶段就结束了。'
  if (task?.skip) return '本步不生成预期号，没有断言卡片。'
  if (task?.status === 'blocked') return '前面的前置没过，本步没开始，所以没有卡片。'
  if (task?.status === 'queued') return '还没轮到，没有卡片。'
  if (task?.status === 'done') return '已满足，没有额外动作。'
  return '没有动作卡片。'
}
