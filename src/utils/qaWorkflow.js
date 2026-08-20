/** 应用级 QA 流程模板：能力目录、默认预设、校验。步骤 id 稳定，label 可变。 */

import { DEFAULT_ENVIRONMENTS, envLabel } from '@/constants/envProfiles'

export const PRESET_ID = 'default-v1'

export const ENV_PROFILES = DEFAULT_ENVIRONMENTS.map((e) => e.key)
export { envLabel }

export const DISPATCH_RUNS = {
  req_admit: { label: '提测冒烟', defaultEnv: 'test' },
  req_test: { label: '功能测试', defaultEnv: 'test' },
  release_regression: { label: '预发回归', defaultEnv: 'pre' },
  release_smoke: { label: '生产冒烟', defaultEnv: 'prod' },
}

export const STEP_KINDS = [
  {
    id: 'understand',
    label: '需求评审',
    tab: 'understand',
    hint: '看需求，列出验收标准。确认理解没问题，再去准备用例。',
    assist: '',
  },
  {
    id: 'cover',
    label: '准备用例',
    tab: 'cases',
    hint: '每个测试点挂上飞书用例，或标明本版本不测。',
    assist: 'map_cases',
  },
  {
    id: 'scope',
    label: '圈定范围',
    tab: 'scope',
    hint: '定开测时间，确认本版本纳入哪些需求，并圈出历史功能回归用例。',
    assist: 'pick_regression',
  },
  {
    id: 'dispatch',
    label: '跑测试',
    tab: 'run',
    hint: '按本步的环境和种类发起自动化，每条用例跑一轮。',
    assist: '',
  },
  {
    id: 'human_verdict',
    label: '人工验收',
    tab: 'report',
    hint: '测试同学判定：通过、带风险、或退回。不能自动通过。',
    assist: '',
  },
  {
    id: 'archive',
    label: '结束',
    tab: 'report',
    hint: '本单结束，不再发起新的自动化。',
    assist: '',
  },
  {
    id: 'checkpoint',
    label: '人工确认',
    tab: 'checkpoint',
    hint: '只做人工确认，不跑自动化。',
    assist: '',
  },
]

export const STEP_KIND_IDS = new Set(STEP_KINDS.map((k) => k.id))

export function kindMeta(kind) {
  return STEP_KINDS.find((k) => k.id === kind) || STEP_KINDS[STEP_KINDS.length - 1]
}

/** 离开本步、走进下一步的方式。画在阶段图的连线上。 */
export function leaveLabel(step, track) {
  if (!step) return ''
  if (step.kind === 'understand') return '确认'
  if (step.kind === 'cover') return '用例备齐'
  if (step.kind === 'scope') return '确认'
  if (step.kind === 'human_verdict') return trackKey(track) === 'rel' ? '发版通过' : '验收通过'
  if (step.kind === 'checkpoint') return '完成'
  if (step.kind === 'archive') return ''
  if (step.kind === 'dispatch') return step.auto_advance ? '跑完进入' : '进入下一步'
  return '进入下一步'
}

export function kindTab(kind) {
  return kindMeta(kind).tab || ''
}

export function kindAssistJob(kind, track) {
  if (kind === 'cover') return 'map_cases'
  if (kind === 'scope') return 'pick_regression'
  if (kind === 'human_verdict') return track === 'rel' || track === 'release' ? 'draft_gate' : 'draft_sign'
  return ''
}

export function tabLabel(tab, track) {
  if (tab === 'understand') return '需求评审'
  if (tab === 'cases') return '用例'
  if (tab === 'scope') return '范围'
  if (tab === 'run') return '任务'
  if (tab === 'checkpoint') return '确认'
  if (tab === 'report') return track === 'rel' || track === 'release' ? '发版评审' : '测试验收'
  return tab
}

export function trackKey(kind) {
  return kind === 'release' || kind === 'rel' ? 'rel' : 'req'
}

function newStepId() {
  return `step-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

function defaultHint(kind) {
  return kindMeta(kind).hint
}

export function makeStep(kind, extras = {}) {
  const meta = kindMeta(kind)
  const step = {
    id: extras.id || newStepId(),
    label: extras.label || meta.label,
    hint: extras.hint != null ? extras.hint : defaultHint(kind),
    kind: meta.id,
  }
  if (meta.id === 'dispatch') {
    const run = DISPATCH_RUNS[extras.run] ? extras.run : (extras.track === 'rel' ? 'release_regression' : 'req_test')
    step.run = run
    step.env = String(extras.env || '').trim() || DISPATCH_RUNS[run]?.defaultEnv || 'test'
    step.auto_advance = Boolean(extras.auto_advance)
  }
  return step
}

export function activeEnvKeys(envKeys) {
  const list = [...new Set((envKeys || []).map((k) => String(k || '').trim()).filter(Boolean))]
  return list.length ? list : [...ENV_PROFILES]
}

export function pickEnv(preferred, envKeys) {
  const active = activeEnvKeys(envKeys)
  if (active.includes(preferred)) return preferred
  return active[0] || preferred
}

function reqDefaultSteps(envKeys, environments) {
  const keys = activeEnvKeys(envKeys)
  const first = keys[0]
  const firstName = envLabel(first, environments)
  const steps = [
    makeStep('understand', { id: 'read', label: '需求评审', hint: '看需求，列出验收标准。确认理解没问题，再去准备用例。' }),
    makeStep('cover', { id: 'cases', label: '用例准备', hint: '每个测试点挂上飞书用例，或标明本版本不测。' }),
    makeStep('dispatch', {
      id: 'admit',
      label: `${firstName}冒烟`,
      hint: `开发提测后，先在${firstName}跑一轮冒烟。本需求还要按上线顺序覆盖后面每一套环境。`,
      run: 'req_admit',
      env: first,
      auto_advance: false,
    }),
    makeStep('dispatch', {
      id: 'test',
      label: `${firstName}功能测试`,
      hint: `按本需求的用例在${firstName}跑功能测试。`,
      run: 'req_test',
      env: first,
      auto_advance: true,
    }),
  ]
  keys.slice(1).forEach((key) => {
    const name = envLabel(key, environments)
    steps.push(makeStep('dispatch', {
      id: `req-${key}`,
      label: `${name}功能测试`,
      hint: `本需求在${name}再跑一遍。每个需求都要覆盖上线顺序里的全部环境。`,
      run: 'req_test',
      env: key,
      auto_advance: true,
    }))
  })
  steps.push(makeStep('human_verdict', { id: 'sign', label: '测试验收', hint: '对照验收标准和各环境跑测结果，由测试判定是否通过。' }))
  steps.push(makeStep('archive', { id: 'hand', label: '测试完成', hint: '本需求在各环境都测完，可以挂进版本。' }))
  return steps
}

function relDefaultSteps(envKeys, environments) {
  const keys = activeEnvKeys(envKeys)
  const last = keys[keys.length - 1]
  const preEnv = keys.length >= 3 ? keys[keys.length - 2] : keys[0]
  const preTitle = envLabel(preEnv, environments)
  const lastTitle = envLabel(last, environments)
  const steps = [
    makeStep('scope', {
      id: 'lock',
      label: '纳入需求',
      hint: '定开测日期，确认本版本要带上哪些需求。没在各环境测完的需求不能当发版依据。',
    }),
    makeStep('scope', {
      id: 'scope',
      label: '历史回归',
      hint: `圈定历史功能要在${preTitle}跑的飞书用例，确认老功能没被带坏。`,
    }),
    makeStep('dispatch', {
      id: 'pre',
      label: `${preTitle}回归`,
      hint: `跑本版纳入需求相关的回归，以及历史功能。失败看发版评审。`,
      run: 'release_regression',
      env: preEnv,
      auto_advance: true,
    }),
    makeStep('human_verdict', {
      id: 'gate',
      label: '发版评审',
      hint: '对照纳入需求和回归结果：可以发、带风险发、或不发。',
    }),
  ]
  if (last && last !== preEnv) {
    steps.push(makeStep('dispatch', {
      id: 'prod',
      label: `${lastTitle}冒烟`,
      hint: `发版后在${lastTitle}跑一小轮冒烟，确认线上还能用。`,
      run: 'release_smoke',
      env: last,
      auto_advance: false,
    }))
  }
  steps.push(makeStep('archive', { id: 'close', label: '已结束', hint: '本版本测试结束。' }))
  return steps
}

export function defaultWorkflow(opts = {}) {
  const keys = activeEnvKeys(opts.envKeys)
  const environments = opts.environments
  return {
    preset: PRESET_ID,
    tracks: {
      req: { label: '需求测试', steps: reqDefaultSteps(keys, environments) },
      rel: { label: '版本测试', steps: relDefaultSteps(keys, environments) },
    },
  }
}

export function envGapsForWorkflow(workflow, envKeys, environments) {
  const filled = (envKeys || []).map((k) => String(k || '').trim()).filter(Boolean)
  if (!filled.length) return []
  const wf = resolveWorkflow(workflow)
  const reqUsed = new Set(
    trackSteps(wf, 'req').filter((s) => s.kind === 'dispatch').map((s) => s.env),
  )
  const relHasDispatch = trackSteps(wf, 'rel').some((s) => s.kind === 'dispatch')
  const gaps = []
  for (const key of filled) {
    if (!reqUsed.has(key)) {
      gaps.push({ key, hint: `需求测试还没覆盖「${envLabel(key, environments)}」` })
    }
  }
  if (!relHasDispatch) {
    gaps.push({ key: filled[filled.length - 2] || filled[0], hint: '版本测试还没有历史回归阶段' })
  }
  return gaps
}

export const DEFAULT_WORKFLOW = defaultWorkflow()

const LEGACY_STEP_LABELS = {
  read: ['理解待确认'],
  cases: ['用例就绪'],
  admit: ['提测准入', '提测冒烟'],
  test: ['需求测试', '功能测试'],
  sign: ['待签收'],
  hand: ['已移交'],
  lock: ['范围锁定', '开测准备'],
  scope: ['回归确认', '回归范围'],
  gate: ['待准出'],
  prod: ['正式冒烟', '生产冒烟'],
  close: ['已关闭'],
}

const LEGACY_TRACK_LABELS = {
  req: ['需求 QA BM'],
  rel: ['版本 QA BM'],
}

function defaultCopy(id) {
  for (const key of ['req', 'rel']) {
    const hit = DEFAULT_WORKFLOW.tracks[key].steps.find((s) => s.id === id)
    if (hit) return hit
  }
  return null
}

function normalizeStep(raw, track) {
  const kind = STEP_KIND_IDS.has(raw?.kind) ? raw.kind : 'checkpoint'
  const id = String(raw?.id || '').trim()
  const fresh = defaultCopy(id)
  let label = String(raw?.label || fresh?.label || kindMeta(kind).label).trim() || kindMeta(kind).label
  let hint = String(raw?.hint || '').trim() || defaultHint(kind)
  if (fresh && LEGACY_STEP_LABELS[id]?.includes(label)) {
    label = fresh.label
    hint = fresh.hint
  }
  const step = {
    id,
    label,
    hint,
    kind,
  }
  if (kind === 'dispatch') {
    const fallbackRun = track === 'rel' ? 'release_regression' : 'req_test'
    const run = DISPATCH_RUNS[raw?.run] ? raw.run : fallbackRun
    step.run = run
    step.env = String(raw?.env || '').trim() || DISPATCH_RUNS[run]?.defaultEnv || 'test'
    step.auto_advance = Boolean(raw?.auto_advance)
  }
  return step
}

function normalizeTrack(raw, key) {
  const fallback = DEFAULT_WORKFLOW.tracks[key]
  const steps = Array.isArray(raw?.steps) ? raw.steps.map((s) => normalizeStep(s, key)).filter((s) => s.id) : []
  let label = String(raw?.label || fallback.label).trim() || fallback.label
  if (LEGACY_TRACK_LABELS[key]?.includes(label)) label = fallback.label
  return {
    label,
    steps: steps.length ? steps : fallback.steps.map((s) => ({ ...s })),
  }
}

export function cloneWorkflow(doc) {
  return JSON.parse(JSON.stringify(resolveWorkflow(doc)))
}

export function resolveWorkflow(doc) {
  if (!doc || typeof doc !== 'object') return defaultWorkflow()
  const reqOk = Array.isArray(doc.tracks?.req?.steps) && doc.tracks.req.steps.length
  const relOk = Array.isArray(doc.tracks?.rel?.steps) && doc.tracks.rel.steps.length
  if (!reqOk && !relOk) return defaultWorkflow()
  return {
    preset: String(doc.preset || PRESET_ID),
    tracks: {
      req: normalizeTrack(doc.tracks?.req, 'req'),
      rel: normalizeTrack(doc.tracks?.rel, 'rel'),
    },
  }
}

export function trackSteps(workflow, track) {
  const key = trackKey(track)
  return resolveWorkflow(workflow).tracks[key]?.steps || []
}

export function findStep(workflow, track, gateId) {
  const id = String(gateId || '')
  if (!id) return null
  return trackSteps(workflow, track).find((s) => s.id === id) || null
}

export function stepIndex(workflow, track, gateId) {
  return trackSteps(workflow, track).findIndex((s) => s.id === gateId)
}

export function firstGate(workflow, track) {
  return trackSteps(workflow, track)[0]?.id || (trackKey(track) === 'rel' ? 'lock' : 'read')
}

export function nextStep(workflow, track, gateId) {
  const steps = trackSteps(workflow, track)
  const i = steps.findIndex((s) => s.id === gateId)
  return i >= 0 ? (steps[i + 1] || null) : null
}

export function prevStep(workflow, track, gateId) {
  const steps = trackSteps(workflow, track)
  const i = steps.findIndex((s) => s.id === gateId)
  return i > 0 ? steps[i - 1] : null
}

export function previousStepOfKind(workflow, track, fromId, kind, run) {
  const steps = trackSteps(workflow, track)
  const i = steps.findIndex((s) => s.id === fromId)
  for (let j = i - 1; j >= 0; j -= 1) {
    if (steps[j].kind !== kind) continue
    if (run && steps[j].run !== run) continue
    return steps[j]
  }
  return i > 0 ? steps[i - 1] : null
}

export function hasReached(workflow, track, currentGate, targetId) {
  const a = stepIndex(workflow, track, currentGate)
  const b = stepIndex(workflow, track, targetId)
  return a >= 0 && b >= 0 && a >= b
}

export function hasPassed(workflow, track, currentGate, targetId) {
  const a = stepIndex(workflow, track, currentGate)
  const b = stepIndex(workflow, track, targetId)
  return a >= 0 && b >= 0 && b < a
}

export function isNextStep(workflow, track, currentGate, targetId) {
  return stepIndex(workflow, track, targetId) === stepIndex(workflow, track, currentGate) + 1
}

export function understood(req, workflow) {
  const steps = trackSteps(workflow, 'req')
  const ui = steps.findIndex((s) => s.kind === 'understand')
  if (ui < 0) return true
  if (req?.understanding?.confirmed) return true
  const ci = stepIndex(workflow, 'req', req?.gate)
  return ci > ui
}

export function reachedDispatch(entity, workflow, track, run) {
  const steps = trackSteps(workflow, track)
  const target = steps.find((s) => s.kind === 'dispatch' && s.run === run)
  if (!target) return false
  return hasReached(workflow, track, entity?.gate, target.id)
}

export function dispatchSteps(workflow, track) {
  return trackSteps(workflow, track).filter((s) => s.kind === 'dispatch')
}

export function envUsage(workflow, envKey) {
  if (!envKey) return []
  const wf = resolveWorkflow(workflow)
  const hits = []
  for (const track of ['req', 'rel']) {
    const trackLabel = wf.tracks?.[track]?.label || (track === 'req' ? '需求测试' : '版本测试')
    for (const step of trackSteps(wf, track)) {
      if (step.kind !== 'dispatch' || step.env !== envKey) continue
      hits.push({
        track,
        trackLabel,
        stepId: step.id,
        stepLabel: step.label,
      })
    }
  }
  return hits
}

export function envLinkRows(workflow, envSummaries) {
  return (envSummaries || []).map((s, i) => {
    const usage = envUsage(workflow, s.key)
    return {
      key: s.key,
      label: s.label,
      index: i + 1,
      filled: Boolean(s.filled),
      channelText: s.channelText || s.preview || '',
      usage,
      usageText: usage.length ? usage.map((u) => `${u.trackLabel}「${u.stepLabel}」`).join('、') : '',
    }
  })
}

export function detailTabsFor(workflow, track) {
  const seen = new Set()
  const tabs = []
  for (const step of trackSteps(workflow, track)) {
    const tab = kindTab(step.kind)
    if (!tab || seen.has(tab)) continue
    seen.add(tab)
    tabs.push({ id: tab, label: tabLabel(tab, track) })
  }
  return tabs
}

export function rebaseTickets(prevWorkflow, nextWorkflow, tickets = [], track) {
  const oldSteps = trackSteps(prevWorkflow, track)
  const newSteps = trackSteps(nextWorkflow, track)
  const newIds = new Set(newSteps.map((s) => s.id))
  const first = newSteps[0]?.id
  const oldIndex = new Map(oldSteps.map((s, i) => [s.id, i]))
  return (tickets || []).map((t) => {
    if (!t?.gate || newIds.has(t.gate)) return t
    const i = oldIndex.has(t.gate) ? oldIndex.get(t.gate) : -1
    if (i >= 0) {
      for (let j = i; j >= 0; j -= 1) {
        if (newIds.has(oldSteps[j].id)) return { ...t, gate: oldSteps[j].id }
      }
      for (let j = i + 1; j < oldSteps.length; j += 1) {
        if (newIds.has(oldSteps[j].id)) return { ...t, gate: oldSteps[j].id }
      }
    }
    return first ? { ...t, gate: first } : t
  })
}

export function validateWorkflow(doc) {
  const errors = []
  const wf = doc && typeof doc === 'object' ? doc : {}
  for (const key of ['req', 'rel']) {
    const label = wf.tracks?.[key]?.label || (key === 'req' ? '需求测试' : '版本测试')
    const steps = Array.isArray(wf.tracks?.[key]?.steps) ? wf.tracks[key].steps : []
    if (steps.length < 2) errors.push(`${label} 至少 2 个阶段`)
    const archives = steps.filter((s) => s.kind === 'archive')
    if (archives.length > 1) errors.push(`${label} 最多一个结束阶段`)
    const ids = new Set()
    steps.forEach((s, i) => {
      const id = String(s?.id || '').trim()
      if (!id) errors.push(`${label} 第 ${i + 1} 步缺少 id`)
      else if (ids.has(id)) errors.push(`${label} 步骤 id「${id}」重复`)
      else ids.add(id)
      if (!STEP_KIND_IDS.has(s?.kind)) errors.push(`${label}「${s?.label || id}」能力不在目录里`)
      if (s?.kind === 'human_verdict' && s?.auto_advance) {
        errors.push(`${label}「${s.label || id}」是人工验收，不能自动走进下一阶段`)
      }
      if (s?.kind === 'dispatch') {
        if (!DISPATCH_RUNS[s.run]) errors.push(`${label}「${s.label || id}」下发种类不合法`)
        if (!String(s.env || '').trim()) errors.push(`${label}「${s.label || id}」还没选环境`)
      }
    })
  }
  return { ok: !errors.length, errors }
}

export function kindTagType(kind) {
  return ({
    understand: 'warning',
    cover: 'warning',
    scope: 'warning',
    checkpoint: 'warning',
    human_verdict: 'success',
    archive: 'info',
  })[kind]
}
