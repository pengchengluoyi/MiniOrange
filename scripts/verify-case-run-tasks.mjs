import { splitStepOperations } from '../src/utils/caseText.js'
import { buildCaseRunGroups, isLiveEngineStep, taskStatusLabel } from '../src/utils/caseRunTasks.js'

const splitCases = [
  ['打开应用', ['打开应用']],
  ['打开应用，点击领取悬浮球', ['打开应用', '点击领取悬浮球']],
  ['点击「立即领取，限时」', ['点击「立即领取，限时」']],
  ['上滑浏览推荐流', ['上滑浏览推荐流']],
  ['上滑一屏，再上滑一屏', ['上滑一屏', '上滑一屏']],
  ['输入手机号然后点击获取验证码', ['输入手机号', '点击获取验证码']],
]

let failed = 0
for (const [input, want] of splitCases) {
  const got = splitStepOperations(input)
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    console.error('split fail', { input, got, want })
    failed += 1
  }
}

const skipped = buildCaseRunGroups({
  spec: {
    precondition: '1. 客户端版本 ≥ 1.3.0\n2. 当前已打开 App\n3. 已登录\n4. 后台开关为开',
    steps_raw: '1. 点击底部导航「首页」',
    expected_raw: '1. 进入首页',
    expected_by_step: { 1: '进入首页' },
  },
  coverage: {
    coverage_class: 'prep_insufficient',
    prep: [
      { seq: 1, text: '客户端版本 ≥ 1.3.0', code: 'PREP.UNKNOWN', msg: '前置未命中引擎库: 客户端版本' },
    ],
  },
  engineSteps: [],
  finished: false,
  live: false,
})
const p1 = skipped.find((g) => g.id === 'prep')?.tasks[0]
if (p1?.status !== 'gap' || !String(taskStatusLabel(p1)).includes('无法识别')) {
  console.error('prep unknown should be skipped gap', p1, taskStatusLabel(p1))
  failed += 1
}
if (skipped.find((g) => g.kind === 'step')?.status === 'blocked') {
  console.error('gaps must not block steps', skipped.find((g) => g.kind === 'step'))
  failed += 1
}

const live = buildCaseRunGroups({
  spec: {
    precondition: '1. 已登录\n2. 无缓存',
    steps_raw: '1. 打开应用，等待首页稳定\n2. 上滑浏览推荐流\n3. 点击领取悬浮球',
    expected_raw: '1. 首页可见领取悬浮球\n3. 出现领取弹窗',
    expected_by_step: { 1: '首页可见领取悬浮球', 3: '出现领取弹窗' },
  },
  engineSteps: [
    { step: 2, cap: 'skip_restart', status: 'skipped', result_status: 'skipped' },
    { step: 3, cap: 'wait', status: 'thinking' },
  ],
  finished: false,
  live: true,
})

const s1ops = live.find((g) => g.id === 's1')?.tasks.filter((t) => t.kind === 'do') || []
const s2ck = live.find((g) => g.id === 's2')?.tasks.find((t) => t.kind === 'check')
const s1ck = live.find((g) => g.id === 's1')?.tasks.find((t) => t.kind === 'check')
const running = live.flatMap((g) => g.tasks).filter((t) => t.status === 'run')

if (s1ops.length !== 2) {
  console.error('step1 ops', s1ops.map((t) => t.title))
  failed += 1
}
if (s2ck?.status !== 'skip' || s2ck?.title !== '不验') {
  console.error('step2 expect', s2ck)
  failed += 1
}
if (s1ck?.skip) {
  console.error('step1 should verify', s1ck)
  failed += 1
}
if (!running.length || !running.some((t) => t.title.includes('等待'))) {
  console.error('expected running wait op', running)
  failed += 1
}

const prep = live.find((g) => g.id === 'prep')
if (!prep?.tasks[0]?.cardNos.includes(2) && !prep?.tasks[1]?.cardNos.includes(2)) {
  console.error('skip_restart should hang on prep', prep)
  failed += 1
}

const smeared = buildCaseRunGroups({
  spec: {
    precondition: [
      '客户端版本 ≥1.3.0, 环境为测试服',
      '当前已打开造好物 App',
      '已登录账号：需求上线前注册、未购买新人礼',
      '后台领取悬浮球开关为开',
    ].map((t, i) => `${i + 1}. ${t}`).join('\n'),
    steps_raw: '1. 点击领取',
    expected_raw: '1. 出现弹窗',
    expected_by_step: { 1: '出现弹窗' },
  },
  coverage: {
    coverage_class: 'prep_insufficient',
    prep: [
      { text: '客户端版本 ≥1.3.0, 环境为测试服', code: 'PREP.UNKNOWN', msg: '前置未命中引擎库' },
      { text: '当前已打开造好物 App', code: 'PREP.UNKNOWN' },
      { text: '已登录账号：需求上线前注册、未购买新人礼', code: 'PREP.UNKNOWN' },
      { text: '后台领取悬浮球开关为开', code: 'PREP.UNKNOWN', msg: '前置未命中引擎库: 后台领取悬浮球开关为开' },
    ],
  },
  engineSteps: [],
  finished: true,
  live: false,
})
const prepLabels = (smeared.find((g) => g.id === 'prep')?.tasks || []).map((t) => taskStatusLabel(t))
if (JSON.stringify(prepLabels) !== JSON.stringify([
  '无法识别 · 未命中引擎库',
  '无法识别 · 未命中引擎库',
  '未执行',
  '由步骤验证',
])) {
  console.error('prep labels after gap skip', prepLabels)
  failed += 1
}

const gated = buildCaseRunGroups({
  spec: {
    precondition: [
      '客户端版本 ≥1.3.0, 环境为测试服',
      '当前已打开造好物 App',
      '已登录账号：需求上线前注册、未购买新人礼',
      '后台领取悬浮球开关为开',
    ].map((t, i) => `${i + 1}. ${t}`).join('\n'),
    steps_raw: '1. 点击底部导航栏「首页」',
    expected_raw: '1. 进入首页',
    expected_by_step: { 1: '进入首页' },
  },
  coverage: {
    coverage_class: 'prep_insufficient',
    prep: [
      { text: '客户端版本 ≥1.3.0, 环境为测试服', code: 'PREP.UNKNOWN' },
      { text: '当前已打开造好物 App', code: 'PREP.UNKNOWN' },
      { text: '已登录账号：需求上线前注册、未购买新人礼', code: 'PREP.UNMET.session' },
      { text: '后台领取悬浮球开关为开', code: 'PREP.OK.deferred' },
    ],
  },
  engineSteps: [
    { step: 1, cap: 'pick_account', result_status: 'pass' },
    { step: 2, cap: 'skip_restart', result_status: 'skipped' },
    { step: 3, cap: 'inspect_session', result_status: 'pass' },
    { step: 4, cap: 'session_gate', result_status: 'fail' },
  ],
  finished: true,
  live: false,
})
const gatedPrep = gated.find((g) => g.id === 'prep')?.tasks || []
const login = gatedPrep.find((t) => t.title.includes('已登录'))
const opened = gatedPrep.find((t) => t.title.includes('已打开'))
const home = gated.find((g) => g.id === 's1')?.tasks.find((t) => t.kind === 'do')
if (!login?.cardNos.includes(1) || !login?.cardNos.includes(4) || login.status !== 'fail') {
  console.error('session_gate should hang on 已登录', login)
  failed += 1
}
if (!opened?.cardNos.includes(2)) {
  console.error('skip_restart should hang on 已打开', opened)
  failed += 1
}
if (home?.cardNos?.length) {
  console.error('home tap should not eat prep cards', home)
  failed += 1
}
if (taskStatusLabel(login) !== '未就绪') {
  console.error('login fail label', taskStatusLabel(login))
  failed += 1
}

const nr = buildCaseRunGroups({
  spec: {
    precondition: [
      '客户端版本 ≥1.3.0，环境为测试服',
      '当前已打开造好物 App',
      '已登录账号：需求上线前注册、未购买新人礼',
      '后台领取悬浮球开关为开',
    ].map((t, i) => `${i + 1}. ${t}`).join('\n'),
    steps_raw: '1. 点击底部导航栏「首页」。\n2. 查看首页右下角是否出现领取悬浮球。',
    expected_raw: '1. 进入首页，底部「首页」为选中态。\n2. 首页右下角不出现领取悬浮球。',
    expected_by_step: {
      1: '进入首页，底部「首页」为选中态。',
      2: '首页右下角不出现领取悬浮球。',
    },
  },
  engineSteps: [
    { step: 1, cap: 'pick_account', result_status: 'pass' },
    { step: 2, cap: 'close_app', result_status: 'pass' },
    { step: 3, cap: 'launch_app', result_status: 'pass' },
    { step: 4, cap: 'inspect_session', result_status: 'pass' },
    { step: 5, cap: 'assert_visual', checkpoint_ids: ['cp1'], result_status: 'fail' },
    { step: 6, cap: 'tap_element', checkpoint_ids: ['cp1'], result_status: 'pass' },
    { step: 18, cap: 'press_key', result_status: 'pass' },
  ],
  finished: false,
  live: true,
})
const nrPrep = nr.find((g) => g.id === 'prep')?.tasks || []
const nrOpened = nrPrep.find((t) => t.title.includes('已打开'))
const nrLogin = nrPrep.find((t) => t.title.includes('已登录'))
const nrHome = nr.find((g) => g.id === 's1')?.tasks.find((t) => t.kind === 'do')
const nrHomeCk = nr.find((g) => g.id === 's1')?.tasks.find((t) => t.kind === 'check')
const nrLook = nr.find((g) => g.id === 's2')?.tasks.find((t) => t.kind === 'do')
if (!nrOpened?.cardNos.includes(2) || !nrOpened?.cardNos.includes(3)) {
  console.error('close/launch should hang on 已打开', nrOpened)
  failed += 1
}
if (!nrLogin?.cardNos.includes(1) || !nrLogin?.cardNos.includes(4)) {
  console.error('account/session should hang on 已登录', nrLogin)
  failed += 1
}
if (nrHome?.cardNos?.includes(2) || nrHome?.cardNos?.includes(3)) {
  console.error('home tap should not eat bootstrap cards', nrHome)
  failed += 1
}
if (!nrHome?.cardNos.includes(6) || !nrHome?.cardNos.includes(18)) {
  console.error('tap/back should hang on 步骤1 操作', nrHome)
  failed += 1
}
if (nrHomeCk?.cardNos.includes(6)) {
  console.error('tap with cp1 is 操作 not 校验', nrHomeCk)
  failed += 1
}
if (!nrHomeCk?.cardNos.includes(5)) {
  console.error('assert_visual cp1 should hang on 步骤1 校验', nrHomeCk)
  failed += 1
}
if (nr.find((g) => g.id === 's2')?.tasks.some((t) => t.kind === 'do')) {
  console.error('observe-only 查看 must not create 操作', nr.find((g) => g.id === 's2'))
  failed += 1
}
if (nrLook?.cardNos?.includes(18) || nrLook?.cardNos?.includes(6)) {
  console.error('failed 步骤1 must not leak cards onto 步骤2', nrLook)
  failed += 1
}

const split = buildCaseRunGroups({
  spec: {
    steps_raw: '1. 点击底部导航栏「首页」\n2. 查看首页右下角是否出现领取悬浮球',
    expected_raw: '1. 进入首页\n2. 不出现领取悬浮球',
    expected_by_step: {
      1: '进入首页',
      2: '不出现领取悬浮球',
    },
  },
  engineSteps: [
    { step: 1, cap: 'tap_element', result_status: 'pass' },
    { step: 2, cap: 'skip_repeat_tap', result_status: 'skipped' },
    { step: 3, cap: '', status: 'thinking' },
    { step: 4, cap: 'assert_visual', result_status: 'fail' },
    { step: 5, cap: '', summary: '断言失败：首页未选中', result_status: 'fail' },
  ],
  finished: false,
  live: true,
})
const spDo = split.find((g) => g.id === 's1')?.tasks.find((t) => t.kind === 'do')
const spCk = split.find((g) => g.id === 's1')?.tasks.find((t) => t.kind === 'check')
const spLook = split.find((g) => g.id === 's2')?.tasks.find((t) => t.kind === 'do')
if (spLook) {
  console.error('查看 step must not have 操作', spLook)
  failed += 1
}
if (!spDo?.cardNos.includes(1) || !spDo?.cardNos.includes(2)) {
  console.error('tap/skip_repeat should hang on 操作', spDo)
  failed += 1
}
if (spDo?.cardNos.includes(3) || spDo?.cardNos.includes(4) || spDo?.cardNos.includes(5)) {
  console.error('assert/think must not hang on 操作', spDo)
  failed += 1
}
if (!spCk?.cardNos.includes(3) || !spCk?.cardNos.includes(4) || !spCk?.cardNos.includes(5)) {
  console.error('think/assert/断言失败 should hang on 校验', spCk)
  failed += 1
}
if (split.find((g) => g.id === 's1')?.runLabel !== '失败') {
  console.error('failed assert after think must show 失败, not keep 校验中', split.find((g) => g.id === 's1'))
  failed += 1
}

const checkingLive = buildCaseRunGroups({
  spec: {
    steps_raw: '1. 点击底部导航栏「首页」',
    expected_raw: '1. 进入首页',
    expected_by_step: { 1: '进入首页' },
  },
  engineSteps: [
    { step: 1, cap: 'tap_element', result_status: 'pass' },
    { step: 2, cap: 'skip_repeat_tap', result_status: 'skipped' },
    { step: 3, cap: '', status: 'thinking' },
  ],
  finished: false,
  live: true,
})
if (checkingLive.find((g) => g.id === 's1')?.runLabel !== '校验中') {
  console.error('in-flight think after tap should show 校验中', checkingLive.find((g) => g.id === 's1'))
  failed += 1
}

const selected = buildCaseRunGroups({
  spec: {
    steps_raw: '1. 点击底部导航栏「首页」',
    expected_raw: '1. 底部「首页」为选中态',
    expected_by_step: { 1: '底部「首页」为选中态' },
  },
  coverage: {
    coverage_class: 'pass',
    expects: [{ n: 1, text: '底部「首页」为选中态', code: 'EXPECT.PASS.tab_selected' }],
  },
  engineSteps: [
    { step: 1, cap: 'tap_element', result_status: 'pass' },
    { step: 2, cap: 'assert_visual', summary: '底部首页为选中', result_status: 'pass' },
  ],
  finished: true,
  live: false,
})
const selDo = selected.find((g) => g.id === 's1')?.tasks.find((t) => t.kind === 'do')
const selCk = selected.find((g) => g.id === 's1')?.tasks.find((t) => t.kind === 'check')
if (selDo?.cardNos.includes(2)) {
  console.error('assert_visual must not hang on 操作', selDo)
  failed += 1
}
if (!selCk?.cardNos.includes(2)) {
  console.error('assert_visual should hang on 校验', selCk)
  failed += 1
}
if (selCk?.status !== 'done' || String(selCk?.gapTag || '')) {
  console.error('选中态 should be a concrete check, not 无法验证', selCk, taskStatusLabel(selCk))
  failed += 1
}

const mixed = buildCaseRunGroups({
  spec: {
    steps_raw: '1. 点击底部导航栏「首页」',
    expected_raw: '1. 进入首页，底部「首页」为选中态',
    expected_by_step: { 1: '进入首页，底部「首页」为选中态' },
  },
  coverage: {
    coverage_class: 'pass',
    expects: [
      { n: 1, text: '进入首页，底部「首页」为选中态', code: 'EXPECT.PASS.page_nav' },
    ],
  },
  engineSteps: [
    { step: 1, cap: 'tap_element', result_status: 'pass' },
    { step: 2, cap: 'assert_visual', result_status: 'pass' },
  ],
  finished: true,
  live: false,
})
const mxCk = mixed.find((g) => g.id === 's1')?.tasks.find((t) => t.kind === 'check')
if (mxCk?.status !== 'done') {
  console.error('mixed expect is one event, not 无法验证', mxCk)
  failed += 1
}

const mixedFail = buildCaseRunGroups({
  spec: {
    steps_raw: '1. 点击底部导航栏「首页」',
    expected_raw: '1. 进入首页，底部「首页」为选中态',
    expected_by_step: { 1: '进入首页，底部「首页」为选中态' },
  },
  coverage: {
    coverage_class: 'product_fail',
    expects: [
      { n: 1, text: '进入首页，底部「首页」为选中态', code: 'EXPECT.FAIL.page_nav' },
    ],
  },
  engineSteps: [
    { step: 1, cap: 'tap_element', result_status: 'pass' },
    { step: 2, cap: 'assert_visual', result_status: 'fail' },
  ],
  finished: true,
  live: false,
})
const mxFailCk = mixedFail.find((g) => g.id === 's1')?.tasks.find((t) => t.kind === 'check')
if (mxFailCk?.status !== 'fail') {
  console.error('FAIL must be 校验不通过', mxFailCk)
  failed += 1
}
if (taskStatusLabel(mxFailCk) !== '校验不通过') {
  console.error('FAIL wins label', mxFailCk, taskStatusLabel(mxFailCk))
  failed += 1
}

const noExpect = buildCaseRunGroups({
  spec: {
    steps_raw: '打开造好物并且登录账号',
    expected_raw: '',
    expected_by_step: { 1: '' },
  },
  coverage: {
    coverage_class: 'step_unexecutable',
    expects: [{ n: 1, text: '', code: 'EXPECT.SKIPPED.no_expect' }],
  },
  engineSteps: [
    { step: 1, cap: 'tap_element', result_status: 'pass' },
  ],
  finished: true,
  live: false,
})
const neCk = noExpect.find((g) => g.id === 's1')?.tasks.find((t) => t.kind === 'check')
if (neCk?.status !== 'gap' || !String(taskStatusLabel(neCk) || '').includes('无法执行')) {
  console.error('no-expect instruction should be 无法执行', neCk, taskStatusLabel(neCk))
  failed += 1
}

if (!isLiveEngineStep({ status: 'checking' })) {
  console.error('checking should be live')
  failed += 1
}
if (isLiveEngineStep({ status: 'checking', result_status: 'skipped' })) {
  console.error('checking + skipped must not stay live')
  failed += 1
}
if (isLiveEngineStep({ status: 'thinking', result_status: 'skipped' })) {
  console.error('thinking + skipped must not stay live')
  failed += 1
}
if (isLiveEngineStep({ status: 'thinking', result_status: 'blocked' })) {
  console.error('thinking + blocked must not stay live')
  failed += 1
}
if (isLiveEngineStep({ status: 'blocked' })) {
  console.error('blocked itself must not stay live')
  failed += 1
}
if (!isLiveEngineStep({ status: 'ask_human' })) {
  console.error('ask_human should stay live until a result lands')
  failed += 1
}
if (isLiveEngineStep({ status: 'thinking' }, { finished: true })) {
  console.error('finished case must not keep thinking live')
  failed += 1
}
if (isLiveEngineStep(
  { step: 19, status: 'thinking' },
  { siblings: [
    { step: 19, status: 'thinking' },
    { step: 20, cap: 'inspect_session', result_status: 'pass' },
    { step: 21, cap: 'session_gate', result_status: 'fail' },
  ] },
)) {
  console.error('earlier thinking must not stay live after later steps settled')
  failed += 1
}

const lateInspect = buildCaseRunGroups({
  spec: {
    precondition: '1. 已登录账号：需求上线前注册\n2. 当前已打开 App',
    steps_raw: '1. 打开App，进入Agent对话历史',
    expected_raw: '1. 进入对话历史',
    expected_by_step: { 1: '进入对话历史' },
  },
  engineSteps: [
    { step: 1, cap: 'skip_restart', result_status: 'skipped' },
    { step: 2, cap: 'tap_element', result_status: 'pass' },
    { step: 3, cap: 'inspect_session', result_status: 'pass' },
  ],
  finished: false,
  live: true,
})
const lateLogin = lateInspect.find((g) => g.id === 'prep')?.tasks.find((t) => t.title.includes('已登录'))
const lateDo = lateInspect.find((g) => g.id === 's1')?.tasks.find((t) => t.kind === 'do')
if (lateLogin?.cardNos.includes(3)) {
  console.error('late inspect_session must not jump back to 前置', lateLogin)
  failed += 1
}
if (!lateDo?.cardNos.includes(3)) {
  console.error('late inspect_session must hang on current 操作', lateDo)
  failed += 1
}

const reloginHitl = buildCaseRunGroups({
  spec: {
    precondition: '1. 已登录账号：需求上线后注册\n2. 当前已打开 App',
    steps_raw: '1. 点击底部导航栏「首页」',
    expected_raw: '1. 进入首页，右下角可见领取悬浮球',
    expected_by_step: { 1: '进入首页，右下角可见领取悬浮球' },
  },
  coverage: { coverage_class: 'prep_insufficient' },
  engineSteps: [
    { step: 1, cap: 'pick_account', result_status: 'pass' },
    { step: 4, cap: 'session_align', result_status: 'pass' },
    { step: 18, cap: 'tap_element', result_status: 'pass' },
    { step: 19, status: 'thinking' },
    { step: 20, cap: 'inspect_session', result_status: 'pass' },
    { step: 21, cap: 'session_gate', result_status: 'fail' },
  ],
  finished: true,
  live: false,
})
const rhPrep = reloginHitl.find((g) => g.id === 'prep')?.tasks.find((t) => t.title.includes('已登录'))
const rhDo = reloginHitl.find((g) => g.id === 's1')?.tasks.find((t) => t.kind === 'do')
if (!rhPrep?.cardNos.includes(1) || !rhPrep?.cardNos.includes(4)) {
  console.error('opening session_align stays on 前置', rhPrep)
  failed += 1
}
if (!rhPrep?.cardNos.includes(18) || !rhPrep?.cardNos.includes(20) || !rhPrep?.cardNos.includes(21)) {
  console.error('relogin taps/inspect/gate stay on 前置', rhPrep)
  failed += 1
}
if (rhDo?.cardNos.includes(18) || rhDo?.cardNos.includes(20) || rhDo?.cardNos.includes(21)) {
  console.error('session_align work must not hang on 步骤1', rhDo)
  failed += 1
}

const taggedLanes = buildCaseRunGroups({
  spec: {
    precondition: '1. 已登录账号\n2. 当前已打开 App',
    steps_raw: '1. 点击底部导航栏「首页」',
    expected_raw: '1. 进入首页',
    expected_by_step: { 1: '进入首页' },
  },
  engineSteps: [
    { step: 1, cap: 'pick_account', result_status: 'pass', lane: 'prep' },
    { step: 2, cap: 'tap_element', result_status: 'pass', lane: 'prep' },
    { step: 3, cap: 'input_text', result_status: 'pass', lane: 'prep' },
    { step: 4, cap: 'session_gate', result_status: 'pass', lane: 'prep' },
    { step: 5, cap: 'tap_element', result_status: 'pass', lane: 'step' },
    { step: 6, cap: 'assert_visual', result_status: 'pass', lane: 'expect' },
  ],
  finished: true,
  live: false,
})
const tlPrep = taggedLanes.find((g) => g.id === 'prep')?.tasks.find((t) => t.title.includes('已登录'))
const tlDo = taggedLanes.find((g) => g.id === 's1')?.tasks.find((t) => t.kind === 'do')
const tlCk = taggedLanes.find((g) => g.id === 's1')?.tasks.find((t) => t.kind === 'check')
if (!tlPrep?.cardNos.includes(2) || !tlPrep?.cardNos.includes(3) || !tlPrep?.cardNos.includes(4)) {
  console.error('tagged prep taps stay on 前置', tlPrep)
  failed += 1
}
if (!tlDo?.cardNos.includes(5) || tlDo?.cardNos.includes(2) || tlDo?.cardNos.includes(6)) {
  console.error('tagged step tap stays on 操作', tlDo)
  failed += 1
}
if (!tlCk?.cardNos.includes(6) || tlCk?.cardNos.includes(5)) {
  console.error('tagged assert stays on 预期', tlCk)
  failed += 1
}

const nr009 = buildCaseRunGroups({
  spec: {
    steps_raw: '1. 点击底部导航栏「首页」。\n2. 点击首页领取悬浮球。\n3. 查看跳转后页面顶部标题和商品名称。',
    expected_by_step: {
      1: '进入首页，右下角可见领取悬浮球。',
      2: '页面发生跳转，无卡死、无闪退。',
      3: '落地页为 Q 版爱豆手办定制商品页，不是 Agent 对话页，也不是旧版新人礼领取页。',
    },
  },
  coverage: {
    coverage_class: 'product_fail',
    steps: [
      { n: 1, text: '点击底部导航栏「首页」。', code: 'STEP.OK' },
      { n: 2, text: '点击首页领取悬浮球。', code: 'STEP.SKIPPED.blocked' },
      { n: 3, text: '查看跳转后页面顶部标题和商品名称。', code: 'STEP.SKIPPED.blocked' },
    ],
    expects: [
      { n: 1, text: '进入首页', code: 'EXPECT.PASS.page_nav' },
      { n: 1, text: '右下角可见领取悬浮球', code: 'EXPECT.FAIL.node' },
      { n: 2, text: '页面发生跳转，无卡死、无闪退。', code: 'EXPECT.SKIPPED.step_not_done' },
      { n: 3, text: '落地页为 Q 版爱豆手办定制商品页', code: 'EXPECT.SKIPPED.step_not_done' },
    ],
  },
  engineSteps: [
    { step: 1, cap: 'pick_account', result_status: 'pass' },
    { step: 4, cap: 'tap_element', result_status: 'pass' },
    { step: 5, cap: 'assert_visual', result_status: 'pass' },
    { step: 6, cap: 'assert_visual', result_status: 'fail' },
  ],
  finished: true,
  live: false,
})
const n9s1 = nr009.find((g) => g.id === 's1')
const n9s2 = nr009.find((g) => g.id === 's2')
const n9s3 = nr009.find((g) => g.id === 's3')
const n9cks = (n9s1?.tasks || []).filter((t) => t.kind === 'check')
const n9s2ck = (n9s2?.tasks || []).find((t) => t.kind === 'check')
const n9s3ck = (n9s3?.tasks || []).find((t) => t.kind === 'check')
if (n9cks.length !== 2) {
  console.error('009 step1 should split into two checks', n9cks)
  failed += 1
}
if (n9cks[0]?.status !== 'done' || n9cks[1]?.status !== 'fail') {
  console.error('009 enter held, ball failed', n9cks)
  failed += 1
}
if (taskStatusLabel(n9cks[1]) !== '校验不通过') {
  console.error('009 ball label', taskStatusLabel(n9cks[1]))
  failed += 1
}
if (n9s2ck?.cardNos?.includes(5) || n9s2ck?.cardNos?.includes(6) || n9s3ck?.cardNos?.length) {
  console.error('009 later checks must not get assert cards', n9s2ck, n9s3ck)
  failed += 1
}
if (n9s2ck?.status !== 'blocked' || taskStatusLabel(n9s2ck) !== '未执行') {
  console.error('009 step2 check must stay 未执行', n9s2ck, taskStatusLabel(n9s2ck))
  failed += 1
}
if (n9s2?.status !== 'blocked' || n9s3?.status !== 'blocked') {
  console.error('009 later steps blocked', n9s2, n9s3)
  failed += 1
}

const smear = buildCaseRunGroups({
  spec: {
    steps_raw: '1. 点击首页\n2. 点击悬浮球',
    expected_by_step: { 1: '进入首页', 2: '页面发生跳转' },
  },
  coverage: {
    coverage_class: 'product_fail',
    expects: [
      { n: 1, text: '进入首页', code: 'EXPECT.FAIL.page_nav' },
      { n: 2, text: '页面发生跳转', code: 'EXPECT.SKIPPED.step_not_done' },
    ],
  },
  engineSteps: [
    { step: 1, cap: 'tap_element', result_status: 'pass' },
    { step: 2, cap: 'assert_visual', checkpoint_ids: ['cp1', 'cp2'], result_status: 'fail' },
  ],
  finished: true,
})
const sm2 = smear.find((g) => g.id === 's2')?.tasks.find((t) => t.kind === 'check')
if (sm2?.cardNos?.includes(2)) {
  console.error('multi-cp fail must not hang on 步骤2', sm2)
  failed += 1
}
if (sm2?.status !== 'blocked' || taskStatusLabel(sm2) !== '未执行') {
  console.error('smeared fail card cannot paint 步骤2 校验不通过', sm2, taskStatusLabel(sm2))
  failed += 1
}

const envTree = buildCaseRunGroups({
  spec: {
    precondition: '1. 已登录\n2. 当前已打开 App',
    steps_raw: '1. 点击底部导航「首页」',
    expected_raw: '1. 进入首页',
    expected_by_step: { 1: '进入首页' },
  },
  envProfile: 'test',
  envLabel: '测试',
  platform: 'android',
  envAlign: {
    wanted: 'test',
    label: '测试',
    observed: 'unknown',
    matched: false,
    switched: false,
    unconfirmed: true,
    ok: true,
    reason: '登录页没有环境标识。未当作与本趟环境不一致。',
  },
  engineSteps: [
    { step: 1, cap: 'inspect_env', result_status: 'pass' },
    { step: 2, cap: 'env_align', result_status: 'pass' },
    { step: 3, cap: 'inspect_env', result_status: 'pass' },
    { step: 4, cap: 'inspect_session', result_status: 'pass' },
    { step: 5, cap: 'session_gate', result_status: 'pass' },
  ],
  finished: true,
  live: false,
})
const envRow = envTree.find((g) => g.id === 'prep')?.tasks.find((t) => t.id === 'p-env')
const loginRow = envTree.find((g) => g.id === 'prep')?.tasks.find((t) => /已登录/.test(t.title))
if (!envRow || envRow.title !== '切换到测试环境' || envRow.status !== 'done') {
  console.error('env prep row missing or not done', envRow)
  failed += 1
}
if (!envRow?.cardNos.includes(1) || !envRow?.cardNos.includes(2) || !envRow?.cardNos.includes(3)) {
  console.error('inspect_env/env_align should hang on p-env', envRow)
  failed += 1
}
if (loginRow?.cardNos?.some((n) => [1, 2, 3].includes(n))) {
  console.error('env cards must not hang on 已登录', loginRow)
  failed += 1
}
if (!loginRow?.cardNos.includes(4) || !loginRow?.cardNos.includes(5)) {
  console.error('session cards should still hang on 已登录', loginRow)
  failed += 1
}

const envWeb = buildCaseRunGroups({
  spec: { precondition: '1. 已登录', steps_raw: '1. 打开首页', expected_raw: '1. 进入首页', expected_by_step: { 1: '进入首页' } },
  envProfile: 'test',
  envLabel: '测试',
  platform: 'web',
  envAlign: { skipped: 'url_distinguishes', ok: true },
  finished: true,
})
if (envWeb.find((g) => g.id === 'prep')?.tasks.some((t) => t.id === 'p-env')) {
  console.error('web must not inject env switch row', envWeb.find((g) => g.id === 'prep'))
  failed += 1
}

if (failed) {
  console.error(`failed ${failed}`)
  process.exit(1)
}
console.log('ok')
