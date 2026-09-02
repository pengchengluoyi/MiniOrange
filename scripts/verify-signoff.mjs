import { buildSignoff, buildExecReport, STATE_UNOBSERVED, STATE_FAILED } from '../src/utils/caseCatalog.js'

let failed = 0
function check(cond, msg, extra) {
  if (!cond) {
    console.error(msg, extra ?? '')
    failed += 1
  }
}

const mixed = buildSignoff([
  {
    case_id: 'c1', status: 'pass', coverage_class: 'pass',
    coverage: { expects: [{ n: 1, text: '进入首页', code: 'EXPECT.PASS.page_nav' }] },
  },
  {
    case_id: 'c2', status: 'unverifiable', coverage_class: 'expect_unverifiable',
    coverage: {
      expects: [{ n: 1, text: '界面好看', code: 'EXPECT.UNVERIFIABLE.subjective' }],
      gaps: [{ col: 'expect', code: 'EXPECT.UNVERIFIABLE.subjective', text: '界面好看' }],
    },
  },
])
check(mixed.held === 1 && mixed.unobserved === 1, 'mix held+unobserved counts', mixed)
check(mixed.task_verdict === 'unobserved', 'mix is not green', mixed.task_verdict)
check(mixed.productPassRate === 100, 'pass rate only uses held+failed', mixed.productPassRate)
check(mixed.unknownByCol.expect >= 1, 'unknown expect column', mixed.unknownByCol)

const proxy = buildSignoff(
  [{
    case_id: 'c1', status: 'pass', coverage_class: 'pass',
    coverage: { expects: [{ n: 1, text: '进入首页', code: 'EXPECT.PASS.page_nav' }] },
    point_ids: ['tp1'],
  }],
  { points: [{ id: 'tp1', text: '首页展示领取悬浮球', case_ids: ['c1'] }] },
)
check(proxy.rows.length === 1, 'one point row', proxy.rows)
check(proxy.rows[0].state === STATE_UNOBSERVED, 'proxy page_nav does not light the ball', proxy.rows[0])
check(proxy.rows[0].reason === 'cant_see', 'proxy reason', proxy.rows[0])

const red = buildSignoff([{
  case_id: 'c1', status: 'fail', coverage_class: 'product_fail',
  coverage: { expects: [{ n: 1, text: '出现领取成功', code: 'EXPECT.FAIL.text_present' }] },
}])
check(red.failed === 1 && red.task_verdict === 'product_fail', 'product fail', red)
check(red.rows[0].state === STATE_FAILED, 'failed row', red.rows[0])

const pending = buildSignoff([{ case_id: 'c9', name: '未跑', status: 'pending', expected: ['出现领取球'] }])
check(pending.unobserved === 1 && pending.rows[0].reason === 'not_reached', 'pending not reached', pending.rows[0])

const shot = buildExecReport([
  {
    case_id: 'case-nr-app-003-ok', status: 'fail', coverage_class: 'product_fail',
    name: '上线前注册看不到球',
    summary: '底栏选中的是中间绿色加号',
    coverage: {
      prep: [
        { seq: 1, text: 'Web 后台已关悬浮球', code: 'PREP.UNKNOWN' },
        { seq: 2, text: '远程开关关着', code: 'PREP.UNKNOWN' },
      ],
      expects: [{ n: 1, text: '进入首页且首页选中', code: 'EXPECT.FAIL.page_nav' }],
    },
  },
  {
    case_id: 'case-nr-app-009-ok', status: 'fail', coverage_class: 'product_fail',
    name: '点球进商品页',
    summary: '首页右下角没有领取悬浮球',
    coverage: {
      prep: [
        { seq: 1, text: '运营已打开悬浮球', code: 'PREP.UNKNOWN' },
        { seq: 2, text: '号池标签未购', code: 'PREP.UNKNOWN' },
      ],
      expects: [
        { n: 1, text: '进入首页，右下角可见领取悬浮球', code: 'EXPECT.FAIL.meaning' },
        { n: 2, text: '页面发生跳转，无卡死', code: 'EXPECT.SKIPPED.step_not_done' },
        { n: 3, text: '落到商品页', code: 'EXPECT.SKIPPED.step_not_done' },
      ],
    },
  },
  {
    case_id: 'c-pass', status: 'pass', coverage_class: 'pass',
    coverage: { expects: [{ n: 1, text: '进入首页', code: 'EXPECT.PASS.page_nav' }] },
  },
  {
    case_id: 'c-cant', status: 'unverifiable', coverage_class: 'expect_unverifiable',
    coverage: { expects: [{ n: 1, text: '界面好看', code: 'EXPECT.UNVERIFIABLE.subjective' }] },
  },
])
check(shot.passedCount === 1, 'one pass', shot.passedCount)
check(shot.failedCount === 2, 'two product fails', shot.failedCount)
check(shot.cannotCount === 5, '4 prep unknown + 1 unverifiable', shot)
check(shot.pendingCount === 2, 'two not reached after red stop', shot.pending)
check(shot.passed[0].how.includes('到了这一页'), 'pass how', shot.passed[0])
check(shot.failed[0].how.includes('看图'), 'fail how', shot.failed[0])
check(shot.cannot.filter((r) => r.dir === '前置').length === 4, 'prep cannot dir', shot.cannot)
check(shot.cannot.some((r) => r.kind === 'UNVERIFIABLE' && r.dir === '预期'), 'expect cannot', shot.cannot)
check(shot.pending.every((r) => r.reason === 'not_reached'), 'pending reason', shot.pending)

if (failed) {
  console.error(`signoff verify failed: ${failed}`)
  process.exit(1)
}
console.log('ok')
