/** 与后端 case_precondition_service / coverage_codes 对齐的用例写作库。 */

export const PREP_CATALOG = [
  { kind: 'check_logged_in', label: '已登录', sample: '已登录', phase: 'after_launch' },
  { kind: 'check_not_logged_in', label: '游客 / 未登录', sample: '未登录', phase: 'after_launch' },
  { kind: 'clear_cache', label: '无缓存', sample: '无缓存', phase: 'before_launch' },
  { kind: 'check_sim', label: '已安装 SIM 卡', sample: '已安装 SIM 卡', phase: 'before_launch', note: '仅 Android' },
  { kind: 'check_wechat', label: '已安装微信', sample: '已安装微信', phase: 'before_launch' },
  { kind: 'check_no_wechat', label: '未安装微信', sample: '未安装微信', phase: 'before_launch' },
  { kind: 'check_android_device', label: 'Android 设备', sample: 'Android 设备执行', phase: 'before_launch' },
  { kind: 'check_ios_device', label: 'iOS 设备', sample: 'iOS 设备执行', phase: 'before_launch' },
  { kind: 'keep_permission_prompt', label: '保留权限询问', sample: '保留权限询问', phase: 'before_launch' },
]

const PREP_RULES = [
  { kind: 'clear_cache', re: /无缓存|清除缓存|清理缓存|清空缓存|清缓存|清除应用/ },
  { kind: 'check_sim', re: /sim卡|sim\s*卡|安装\s*sim|手机卡|电话卡/i },
  { kind: 'check_wechat', re: /安装.*微信|已装.*微信|有微信|装了微信|微信已安装/ },
  { kind: 'check_no_wechat', re: /未安装微信|没装微信|无微信/ },
  { kind: 'check_ios_device', re: /(ios|苹果机|iphone|ipad).*(设备|执行|手机)|(设备|执行|手机).*(ios|苹果机|iphone|ipad)/i },
  { kind: 'check_android_device', re: /(安卓|android).*(设备|执行|手机)|(设备|执行|手机).*(安卓|android)/i },
  { kind: 'check_logged_in', re: /已登录|登录状态|保持登录/ },
  { kind: 'check_not_logged_in', re: /未登录|游客|未登陆/ },
  { kind: 'keep_permission_prompt', re: /保留权限(询问|弹窗|框)?|不要(预)?授权|keep_permission/i },
]

const PREP_UNSUPPORTED = [
  { kind: 'web_config', code: 'PREP.UNSUPPORTED.web_config', re: /web\s*端|web后台|运营后台|管理后台|后台配置|查看后台|后台.*开关|悬浮球开关/i },
  { kind: 'remote_config', code: 'PREP.UNSUPPORTED.remote_config', re: /远程配置|远程开关|feature\s*flag|灰度开关/i },
  { kind: 'backend_data', code: 'PREP.UNSUPPORTED.backend_data', re: /已购|指定订单|造数|服务端数据|号池标签/ },
  { kind: 'sms_live', code: 'PREP.UNSUPPORTED.sms_live', re: /真短信|活短信|收到短信|短信验证码到达/ },
  { kind: 'external_channel', code: 'PREP.UNSUPPORTED.external_channel', re: /接电话|来电|推送必达/ },
  { kind: 'device_mock', code: 'PREP.UNSUPPORTED.device_mock', re: /地理围栏|模拟定位|时间旅行/ },
]

export function classifyPrepLine(text) {
  const t = String(text || '').trim()
  if (!t) return { kind: '', code: '', label: '', tone: 'info' }
  for (const rule of PREP_RULES) {
    if (rule.re.test(t)) {
      const meta = PREP_CATALOG.find((c) => c.kind === rule.kind)
      return { kind: rule.kind, code: `PREP.OK.${rule.kind}`, label: meta?.label || rule.kind, tone: 'success' }
    }
  }
  for (const rule of PREP_UNSUPPORTED) {
    if (rule.re.test(t)) {
      return { kind: rule.kind, code: rule.code, label: '无法执行', tone: 'warning' }
    }
  }
  return { kind: 'unknown', code: 'PREP.UNKNOWN', label: '无法识别', tone: 'warning' }
}

export const STEP_CAPS = [
  { id: 'launch_app', label: '打开应用', re: /打开应用|启动应用|打开\s*app/i },
  { id: 'kill_app', label: '杀进程', re: /杀进程|关闭应用|结束应用/ },
  { id: 'long_press', label: '长按', re: /长按/ },
  { id: 'drag', label: '拖拽', re: /拖到|拖拽/ },
  { id: 'swipe', label: '滑动', re: /上滑|下滑|左滑|右滑/ },
  { id: 'input_text', label: '输入', re: /输入|填写/ },
  { id: 'press_key', label: '系统键', re: /返回键|按返回|按\s*home|按 Home/i },
  { id: 'wait_ms', label: '等待', re: /等待/ },
  { id: 'tap_element', label: '点击', re: /点击|点「|打开「|点选/ },
]

const STEP_UNSUPPORTED = [
  { id: 'av_call', re: /语音通话|视频通话/ },
  { id: 'camera_scene', re: /摄像头|扫二维码|对着/ },
  { id: 'gesture_complex', re: /双指|捏合|缩放/ },
  { id: 'external_app_pay', re: /微信支付|支付宝.*付|去微信.*付/ },
  { id: 'hardware_fx', re: /听声道|震动|闪光灯/ },
  { id: 'cross_surface', re: /同时.*后台|操作 web/i },
]

export function classifyStepLine(text) {
  const t = String(text || '').trim()
  if (!t) return { id: '', label: '', tone: 'info', code: '' }
  for (const rule of STEP_UNSUPPORTED) {
    if (rule.re.test(t)) return { id: rule.id, label: '无法执行', tone: 'warning', code: `STEP.UNSUPPORTED.${rule.id}` }
  }
  for (const rule of STEP_CAPS) {
    if (rule.re.test(t)) return { id: rule.id, label: rule.label, tone: 'success', code: 'STEP.OK' }
  }
  return { id: 'unknown', label: '无法识别', tone: 'warning', code: 'STEP.UNKNOWN' }
}

function splitExpectParts(text) {
  const t = String(text || '').trim()
  if (!t) return []
  const bits = t.split(/[。；;\n]+/).map((s) => s.replace(/^[，,\s]+|[，,\s]+$/g, '').trim()).filter(Boolean)
  if (bits.length <= 1 && t.includes('，')) return t.split('，').map((s) => s.trim()).filter(Boolean)
  return bits.length ? bits : [t]
}

function classifyExpectClaim(text) {
  const t = String(text || '').trim()
  if (!t) return { id: 'skip', label: '不验', tone: 'info', code: 'EXPECT.SKIPPED.no_expect', gap: true }
  const unverifiable = [
    ['animation', /动画|转场|跟手|粒子|入场动效|流畅/, '动画/转场'],
    ['av_haptic', /视频自动播|自动播放|声音|音效|震动|听筒/, '声画震动'],
    ['subjective', /好看|高级感|沉浸|符合设计|精致|美观/, '主观观感'],
    ['temporal', /连续多帧|无卡死|无闪退|不卡顿|跟手/, '连续多帧'],
    ['no_baseline', /(?<!显示为)\+1|从.+变/, '无基线对比'],
    ['pixel_perfect', /像素|对齐|字号|色值|4px|间距精确/, '像素级对齐'],
    ['tab_selected', /选中态|已选中|高亮选中/, '选中态/切页'],
    ['session_frame', /保持登录|仍在登录|登录态/, '首页登录态'],
  ]
  for (const [id, re, label] of unverifiable) {
    if (re.test(t)) return { id, label, tone: 'warning', code: `EXPECT.UNVERIFIABLE.${id}`, gap: true }
  }
  if (/功能正常|逻辑正确|无异常|与设计一致/.test(t)) {
    return { id: 'unknown', label: '无法识别', tone: 'warning', code: 'EXPECT.UNKNOWN', gap: true }
  }
  if (/不出现|不含|不可见|看不到|没有出现|未出现/.test(t)) {
    return { id: 'text_absent', label: '文本不出现', tone: 'success', code: 'EXPECT.PASS.text_absent', gap: false }
  }
  if (/出现|可见「|文案/.test(t)) {
    return { id: 'text_present', label: '文本', tone: 'success', code: 'EXPECT.PASS.text_present', gap: false }
  }
  if (/数量为|显示为\s*\d|积分为/.test(t)) {
    return { id: 'numeric', label: '数量', tone: 'success', code: 'EXPECT.PASS.numeric', gap: false }
  }
  if (/进入|切换到|到达|跳转|落地页/.test(t)) {
    return { id: 'page_nav', label: '到页', tone: 'success', code: 'EXPECT.PASS.page_nav', gap: false }
  }
  if (/登录态|保持登录|仍在登录|未弹出登录/.test(t)) {
    return { id: 'login_outcome', label: '登录结果', tone: 'success', code: 'EXPECT.PASS.login_outcome', gap: false }
  }
  if (/可见|存在/.test(t)) {
    return { id: 'node', label: '控件', tone: 'success', code: 'EXPECT.PASS.node', gap: false }
  }
  if (/悬浮球|弹窗|领取|商品页|对话页/.test(t)) {
    return { id: 'meaning', label: '含义', tone: 'success', code: 'EXPECT.PASS.meaning', gap: false }
  }
  return { id: 'unknown', label: '无法识别', tone: 'warning', code: 'EXPECT.UNKNOWN', gap: true }
}

export function classifyExpectLine(text) {
  const t = String(text || '').trim()
  if (!t) return { id: 'skip', label: '不验', tone: 'info', code: 'EXPECT.SKIPPED.no_expect' }
  const claims = splitExpectParts(t).map(classifyExpectClaim)
  const supported = claims.filter((c) => !c.gap)
  const skipped = claims.filter((c) => c.gap)
  if (!supported.length) {
    const one = skipped[0] || classifyExpectClaim(t)
    return { id: one.id, label: one.label === '无法识别' ? '无法识别' : '无法验证', tone: 'warning', code: one.code }
  }
  if (skipped.length) {
    return { id: supported[0].id, label: '部分无法验证', tone: 'warning', code: supported[0].code }
  }
  return { id: supported[0].id, label: supported[0].label, tone: 'success', code: supported[0].code }
}

export const GAP_KIND_LABEL = {
  web_config: '查后台配置',
  remote_config: '远程开关',
  backend_data: '造服务端数据',
  sms_live: '真短信',
  external_channel: '外部通道',
  device_mock: '设备模拟',
  sim_ios: 'iOS 无法读 SIM',
  av_call: '语音/视频通话',
  camera_scene: '摄像头场景',
  gesture_complex: '复杂手势',
  external_app_pay: '外部支付',
  hardware_fx: '听声道/震动/闪光',
  cross_surface: '跨端操作',
  animation: '动画/转场',
  av_haptic: '声画震动',
  subjective: '主观观感',
  temporal: '连续多帧',
  no_baseline: '无基线对比',
  pixel_perfect: '像素级对齐',
  tab_selected: '选中态/切页',
  session_frame: '首页登录态',
}

export function codeLooksGap(code) {
  const c = String(code || '')
  return /UNKNOWN|UNSUPPORTED|UNVERIFIABLE/.test(c)
}

export function gapTagOf(code, kind = '') {
  const c = String(code || '')
  if (!codeLooksGap(c)) return ''
  let tail = String(kind || '').trim()
  if (!tail) {
    const parts = c.split('.')
    tail = parts[parts.length - 1] || ''
  }
  if (['UNKNOWN', 'UNSUPPORTED', 'UNVERIFIABLE'].includes(tail)) tail = String(kind || '')
  const detail = GAP_KIND_LABEL[tail] || ''
  if (/UNKNOWN/.test(c)) return '无法识别 · 未命中引擎库'
  if (/UNVERIFIABLE/.test(c)) return detail ? `无法验证 · ${detail}` : '无法验证'
  return detail ? `无法执行 · ${detail}` : '无法执行'
}

export const COVERAGE_LABEL = {
  pass: '通过',
  product_fail: '校验不通过',
  prep_insufficient: '前置准备不足',
  step_unexecutable: '测试步骤无法执行',
  expect_unverifiable: '无法验证',
  untestable: '测不了',
  engine_error: '引擎故障',
}

export const COVERAGE_TONE = {
  pass: 'success',
  product_fail: 'danger',
  prep_insufficient: 'warning',
  step_unexecutable: 'warning',
  expect_unverifiable: 'warning',
  untestable: 'info',
  engine_error: 'warning',
}

export function coverageClassOf(row) {
  const cls = String(row?.coverage_class || '').trim()
  if (cls) return cls
  const st = String(row?.status || '')
  const fc = String(row?.failure_category || '')
  if (st === 'untestable' || fc === 'untestable') return 'untestable'
  if (st === 'unverifiable' || fc === 'expect_unverifiable') return 'expect_unverifiable'
  if (fc === 'prep_insufficient') return 'prep_insufficient'
  if (['execution_error', 'budget_exhausted', 'device_unhealthy'].includes(fc)) return 'engine_error'
  if (st === 'pass') return 'pass'
  if (['fail', 'failed'].includes(st)) return 'product_fail'
  if (st === 'blocked' || st === 'declined') return 'engine_error'
  return ''
}

export function isProductFailRow(row) {
  return coverageClassOf(row) === 'product_fail'
}

export function isUnverifiableRow(row) {
  return coverageClassOf(row) === 'expect_unverifiable'
}

export function isGapRow(row) {
  return ['prep_insufficient', 'step_unexecutable', 'untestable', 'engine_error'].includes(coverageClassOf(row))
}

export function summarizeTaskCoverage(cases = []) {
  const counts = {
    pass: 0,
    product_fail: 0,
    prep_insufficient: 0,
    step_unexecutable: 0,
    expect_unverifiable: 0,
    untestable: 0,
    engine_error: 0,
    other: 0,
  }
  for (const row of cases) {
    const st = String(row?.status || '')
    if (['pending', 'queued', 'running', 'cancelled', 'skipped'].includes(st)) continue
    const cls = coverageClassOf(row) || 'other'
    if (counts[cls] == null) counts.other += 1
    else counts[cls] += 1
  }
  const productDenom = counts.pass + counts.product_fail
  const productPassRate = productDenom ? Math.round((counts.pass / productDenom) * 100) : null
  const gaps = counts.prep_insufficient + counts.step_unexecutable + counts.engine_error
  return { ...counts, productDenom, productPassRate, gaps }
}
