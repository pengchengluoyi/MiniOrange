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
  '无法执行 · 查后台配置',
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
      { text: '后台领取悬浮球开关为开', code: 'PREP.UNSUPPORTED.web_config' },
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
if (split.find((g) => g.id === 's1')?.runLabel !== '校验中') {
  console.error('running check should show 校验中', split.find((g) => g.id === 's1'))
  failed += 1
}

const unverifiable = buildCaseRunGroups({
  spec: {
    steps_raw: '1. 点击底部导航栏「首页」',
    expected_raw: '1. 底部「首页」为选中态',
    expected_by_step: { 1: '底部「首页」为选中态' },
  },
  coverage: {
    coverage_class: 'expect_unverifiable',
    expects: [{ n: 1, text: '底部「首页」为选中态', code: 'EXPECT.UNVERIFIABLE.tab_selected' }],
  },
  engineSteps: [
    { step: 1, cap: 'tap_element', result_status: 'pass' },
    { step: 2, cap: 'assert_skip', summary: '无法验证：选中态/切页（底部「首页」为选中态）', result_status: 'skipped' },
  ],
  finished: true,
  live: false,
})
const uvDo = unverifiable.find((g) => g.id === 's1')?.tasks.find((t) => t.kind === 'do')
const uvCk = unverifiable.find((g) => g.id === 's1')?.tasks.find((t) => t.kind === 'check')
if (uvDo?.cardNos.includes(2)) {
  console.error('assert_skip must not hang on 操作', uvDo)
  failed += 1
}
if (!uvCk?.cardNos.includes(2)) {
  console.error('assert_skip should hang on 校验', uvCk)
  failed += 1
}
if (!String(taskStatusLabel(uvCk) || '').includes('无法验证')) {
  console.error('选中态 should show 无法验证', uvCk, taskStatusLabel(uvCk))
  failed += 1
}

const mixed = buildCaseRunGroups({
  spec: {
    steps_raw: '1. 点击底部导航栏「首页」',
    expected_raw: '1. 进入首页，底部「首页」为选中态',
    expected_by_step: { 1: '进入首页，底部「首页」为选中态' },
  },
  coverage: {
    coverage_class: 'expect_unverifiable',
    expects: [
      { n: 1, text: '进入首页', code: 'EXPECT.PASS.page_nav' },
      { n: 1, text: '底部「首页」为选中态', code: 'EXPECT.UNVERIFIABLE.tab_selected' },
    ],
  },
  engineSteps: [
    { step: 1, cap: 'tap_element', result_status: 'pass' },
    { step: 2, cap: 'assert_skip', summary: '部分无法验证', result_status: 'skipped' },
  ],
  finished: true,
  live: false,
})
const mxCk = mixed.find((g) => g.id === 's1')?.tasks.find((t) => t.kind === 'check')
if (mxCk?.status !== 'gap') {
  console.error('mixed expect must not look like 通过', mxCk)
  failed += 1
}
if (!String(taskStatusLabel(mxCk) || '').includes('无法验证')) {
  console.error('mixed expect should keep 选中态未观察', mxCk, taskStatusLabel(mxCk))
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
      { n: 1, text: '进入首页', code: 'EXPECT.FAIL.page_nav' },
      { n: 1, text: '底部「首页」为选中态', code: 'EXPECT.UNVERIFIABLE.tab_selected' },
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
  console.error('FAIL + UNVERIFIABLE must be 校验不通过, not 无法验证', mxFailCk)
  failed += 1
}
if (taskStatusLabel(mxFailCk) !== '校验不通过') {
  console.error('FAIL wins label', mxFailCk, taskStatusLabel(mxFailCk))
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

if (failed) {
  console.error(`failed ${failed}`)
  process.exit(1)
}
console.log('ok')
