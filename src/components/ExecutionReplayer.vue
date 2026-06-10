<script setup>
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { getBaseUrl } from '@/utils/config'
import { importIconFromLocate } from '@/api/appAutomation'
import { analyzeFailureKnowledge, appendAppKnowledge } from '@/api/settings'

const CATEGORY_OPTIONS = ['业务逻辑', 'UI导航', '登录注册', 'Tab切换', '交互规范', '其他']

const props = defineProps({
  appId: { type: String, default: '' },
  appName: { type: String, default: '' },
  fullscreen: { type: Boolean, default: false },
  trace: { type: Array, default: () => [] },
  stepResults: { type: Array, default: () => [] },
  caseName: { type: String, default: '' },
  command: { type: String, default: '' },
  stepsRaw: { type: String, default: '' },
  expectedRaw: { type: String, default: '' },
  stepLines: { type: Array, default: () => [] },
  expectedLines: { type: Array, default: () => [] },
  preconditionRaw: { type: String, default: '' },
  caseDurationMs: { type: Number, default: null },
  runDurationMs: { type: Number, default: null },
})

const router = useRouter()
const staticBase = getBaseUrl()
const flatSteps = ref([])
const activeIndex = ref(0)
const playing = ref(false)
const markStyle = ref('midscene')
const savingIcon = ref(false)
const analyzingFailure = ref(false)
const savingKnowledge = ref(false)
const failureAnalysis = ref(null)
const knowledgeDialogVisible = ref(false)
const knowledgeDraft = ref({
  title: '',
  category: '其他',
  tagsText: '',
  content: '',
  enabled: true,
})
let playTimer = null
let analyzeSeq = 0

const imgUrl = (path) => {
  if (!path) return ''
  if (path.startsWith('http')) return path
  return `${staticBase}${path}`
}

const pushNode = (out, node) => {
  out.push(node)
}

/** 操作步骤：Plan / Tap 同级；预期动作：Plan / Assert 同级 */
const buildFlatSteps = () => {
  const out = []

  const appendOperation = (op, ctx) => {
    if (!op) return
    const stepCtx = {
      ...ctx,
      plan_log: op.plan_log || [],
      thought_meta: op.thought_meta || {},
      knowledge_hints: op.knowledge_hints || [],
    }
    pushNode(out, {
      ...stepCtx,
      depth: 0,
      role: 'operation',
      type: 'section',
      title: `操作步骤 ${ctx.stepNo}`,
      subtitle: op.text || op.command,
      thought: op.thought,
      thought_meta: op.thought_meta || {},
      knowledge_hints: op.knowledge_hints || [],
      plan_log: op.plan_log || [],
      ok: op.ok,
      screenshot: op.screenshot || '',
      playable: !!op.screenshot,
    })

    const flat = op.flat_items && Array.isArray(op.flat_items) ? op.flat_items : null
    const plansByIndex = new Map()
    for (const p of op.plans || []) {
      plansByIndex.set(p.plan_index, p)
    }

    const emitPlan = (plan) => {
      const planShot = plan.screenshot || op.screenshot || ''
      pushNode(out, {
        ...stepCtx,
        depth: 1,
        role: 'plan',
        type: 'plan',
        planIndex: plan.plan_index,
        title: plan.title || `Plan - ${plan.summary}`,
        subtitle: plan.summary,
        kind: plan.kind,
        ok: plan.ok,
        thought: plan.detail || {},
        screenshot: planShot,
        screenshot_before: planShot,
        screenshot_after: planShot,
        playable: !!planShot,
      })
    }

    const emitAction = (planIndex, act) =>
      pushNode(out, {
        ...stepCtx,
        depth: 1,
        role: 'action',
        type: 'action',
        planIndex,
        title: act.title || act.summary,
        summary: act.summary,
        kind: act.kind,
        text: act.text,
        field_hint: act.field_hint || act.label,
        msg: act.msg,
        method: act.method,
        actionName: act.action_name,
        ok: act.ok,
        duration_ms: act.duration_ms,
        screenshot: act.screenshot_before || act.screenshot_after || op.screenshot || '',
        screenshot_before: act.screenshot_before || '',
        screenshot_after: act.screenshot_after || '',
        target_rect: act.target_rect || null,
        screen_size: act.screen_size || op.screen_size || null,
        x: act.x,
        y: act.y,
        gesture_id: act.gesture_id,
        gesture_index: act.gesture_index,
        target_label: act.target_label || '',
        page_context: act.page_context || null,
        suggest_icon_library: act.suggest_icon_library,
        icon_auto_learned: act.icon_auto_learned,
        playable: true,
      })

    if (flat) {
      // 按后端给的展平顺序渲染，同一级：Plan / Tap1 / Tap2...
      const actionsByPlan = new Map()
      for (const p of op.plans || []) {
        actionsByPlan.set(p.plan_index, p.actions || [])
      }
      const actionOrd = new Map()
      for (const item of flat) {
        const plan = plansByIndex.get(item.plan_index)
        if (!plan) continue
        if (item.type === 'plan') {
          emitPlan(plan)
        } else if (item.type === 'action') {
          const acts = actionsByPlan.get(item.plan_index) || []
          let act = null
          if (item.gesture_id) {
            act = acts.find((a) => a.gesture_id === item.gesture_id)
          }
          if (!act && item.gesture_index != null) {
            act = acts.find((a) => a.gesture_index === item.gesture_index)
          }
          if (!act) {
            const ord = actionOrd.get(item.plan_index) || 0
            act = acts[ord]
            actionOrd.set(item.plan_index, ord + 1)
          }
          if (act) emitAction(plan.plan_index, act)
        }
      }
    } else {
      // 兼容旧结构：仍然按照 Plan -> actions 嵌套，但 depth 统一为 1
      for (const plan of op.plans || []) {
        emitPlan(plan)
        for (const act of plan.actions || []) {
          emitAction(plan.plan_index, act)
        }
      }
    }

    // 兼容旧 trace：无 plans 时从 plan_log + execute_log 构建
    if (!(op.plans || []).length) {
      const plans = (op.plan_log || []).filter((e) => e.type === 'planned_step')
      const execLog = op.execute_log || []
      plans.forEach((ps, pi) => {
        pushNode(out, {
          ...ctx,
          depth: 1,
          role: 'plan',
          type: 'plan',
          title: `Plan - ${ps.summary}`,
          ok: true,
          playable: false,
        })
        const act = execLog.find((e) => e.index === ps.index) || execLog[pi]
        if (act) {
          pushNode(out, {
            ...ctx,
            depth: 1,
            role: 'action',
            type: 'action',
            title: `${act.action_name || (act.kind === 'click' ? 'Tap' : act.kind === 'input' ? 'Input' : act.kind)} - ${act.summary}`,
            ok: act.ok,
            duration_ms: act.duration_ms,
            screenshot: act.screenshot_before || act.screenshot_after || op.screenshot || '',
            target_rect: act.target_rect,
            screen_size: act.screen_size,
            target_label: act.target_label,
            msg: act.msg,
            method: act.method,
            suggest_icon_library: act.suggest_icon_library,
            icon_auto_learned: act.icon_auto_learned,
            playable: true,
          })
        }
      })
    }
  }

  const appendPageTrace = (pageCtx, pageRecovery, ctx, screenshot = '') => {
    const pageShot = screenshot || pageCtx?.screenshot || ''
    const label =
      pageCtx?.current_page_label || pageCtx?.label || pageCtx?.figma_best || ''
    if (label || pageCtx?.matched) {
      const src =
        pageCtx?.source === 'figma' || pageCtx?.method === 'figma_text'
          ? 'Figma'
          : pageCtx?.source === 'skeleton' || pageCtx?.method === 'skeleton'
            ? '图谱'
            : '识别'
      const score =
        pageCtx?.score != null && Number(pageCtx.score) > 0
          ? `${Math.round(Number(pageCtx.score) * 100)}%`
          : ''
      pushNode(out, {
        ...ctx,
        depth: 1,
        role: 'page_identify',
        type: 'page_context',
        title: `当前页 · ${label || '未知'}`,
        subtitle: pageCtx?.target_page?.label
          ? `目标：${pageCtx.target_page.label}`
          : score
            ? `${src} · ${score}`
            : src,
        msg: pageCtx?.matched ? '页面识别成功' : '页面识别（未达阈值）',
        ok: pageCtx?.matched !== false,
        screenshot: pageShot,
        page_context: pageCtx,
        playable: !!pageShot,
      })
    }
    const rec = pageRecovery
    if (!rec?.attempted && !(rec?.plan?.steps || []).length) return
    const recoveryShot =
      pageShot ||
      rec?.current_page_before?.screenshot ||
      rec?.current_page_after?.screenshot ||
      ''
    pushNode(out, {
      ...ctx,
      depth: 1,
      role: 'page_recovery',
      type: 'page_recovery',
      title: '页面路径恢复',
      subtitle: `${rec.plan?.from || rec.current_page_before?.label || '当前'} → ${rec.plan?.to || rec.target_page?.label || '目标'}`,
      msg: rec.reason || (rec.ok ? '恢复步骤已执行' : '恢复部分失败'),
      ok: rec.ok !== false,
      screenshot: recoveryShot,
      page_recovery: rec,
      playable: !!recoveryShot,
    })
    const navExec = rec.nav_results || []
    if (navExec.length) {
      for (const act of navExec) {
        const subGestures = act.gestures || []
        const rows = subGestures.length ? subGestures : [act]
        const planTitle = act.summary || '页面恢复'
        pushNode(out, {
          ...ctx,
          depth: 2,
          role: 'plan',
          type: 'plan',
          title: `Plan - ${planTitle}`,
          subtitle: planTitle,
          ok: act.ok !== false,
          screenshot: screenshot || '',
          playable: false,
        })
        for (const g of rows) {
          const gKind = g.kind || act.kind || 'click'
          const gMethod = g.method || act.method || ''
          const actionName = g.action_name || act.action_name || (gKind === 'click' ? 'Tap' : gKind)
          pushNode(out, {
            ...ctx,
            depth: 2,
            role: 'action',
            type: 'action',
            title: `${actionName} - ${g.summary || act.summary || '手势'}`,
            subtitle: [gMethod, g.source, g.phase].filter(Boolean).join(' · ') || '',
            msg: g.msg || act.msg,
            ok: g.ok !== false && act.ok !== false,
            duration_ms: g.duration_ms || act.duration_ms,
            screenshot: g.screenshot_before || g.screenshot_after || act.screenshot_after || act.screenshot_before || screenshot || '',
            screenshot_before: g.screenshot_before || act.screenshot_before || '',
            screenshot_after: g.screenshot_after || act.screenshot_after || '',
            method: gMethod,
            actionName,
            kind: gKind,
            target_label: g.label || act.target_label || '',
            target_rect: g.target_rect || act.target_rect || null,
            screen_size: g.screen_size || act.screen_size || null,
            x: g.x ?? act.x,
            y: g.y ?? act.y,
            playable: !!(g.screenshot_before || g.screenshot_after || act.screenshot_after || act.screenshot_before),
          })
        }
      }
    } else {
      for (const st of rec.plan?.steps || []) {
        pushNode(out, {
          ...ctx,
          depth: 2,
          role: 'page_recovery_step',
          type: 'page_recovery_step',
          title: st.summary || st.label || '导航',
          subtitle: st.label || '',
          ok: rec.ok !== false,
          screenshot: screenshot || '',
          playable: false,
        })
      }
    }
  }

  const appendExpected = (exp, ctx) => {
    if (!exp?.text) return
    const pageCtx = exp.page_context || {}
    const pageRecovery = exp.page_recovery || null
    pushNode(out, {
      ...ctx,
      depth: 0,
      role: 'expected_action',
      type: 'section',
      title: `预期动作 ${ctx.stepNo}`,
      subtitle: exp.text,
      thought: exp.thought,
      ok: exp.ok,
      screenshot: exp.screenshot || '',
      page_context: pageCtx,
      page_recovery: pageRecovery,
      playable: false,
    })

    appendPageTrace(pageCtx, pageRecovery, ctx, exp.screenshot || '')

    const plans = exp.plans || []
    for (const plan of plans) {
      pushNode(out, {
        ...ctx,
        depth: 1,
        role: 'plan',
        type: 'verify_plan',
        planIndex: plan.plan_index,
        title: plan.title || `Plan - ${plan.summary}`,
        subtitle: plan.verify_text || plan.summary,
        ok: plan.ok,
        screenshot: exp.screenshot || '',
        playable: false,
      })

      for (const chk of plan.checks || []) {
        pushNode(out, {
          ...ctx,
          depth: 1,
          role: 'verify',
          type: 'verify',
          title: chk.ok ? `Assert - ${chk.text}` : `Assert ✗ - ${chk.text}`,
          subtitle: chk.text,
          msg: chk.reason,
          ok: chk.ok,
          screenshot: exp.screenshot || '',
          screen_preview: exp.screen_preview,
          page_context: pageCtx,
          page_recovery: pageRecovery,
          playable: true,
        })
      }
    }

    if (!(exp.plans || []).length && (exp.checks || []).length) {
      pushNode(out, {
        ...ctx,
        depth: 1,
        role: 'plan',
        type: 'verify_plan',
        title: `Plan - 校验${exp.text}`,
        ok: exp.ok,
        playable: false,
      })
      for (const chk of exp.checks) {
        pushNode(out, {
          ...ctx,
          depth: 2,
          role: 'verify',
          type: 'verify',
          title: `Assert - ${chk.text}`,
          msg: chk.reason,
          ok: chk.ok,
          screenshot: exp.screenshot || '',
          page_context: pageCtx,
          page_recovery: pageRecovery,
          playable: true,
        })
      }
    }
  }

  const appendPrecondition = (block) => {
    const raw = props.preconditionRaw || block.subtitle || ''
    if (!raw && !(block.entries || []).length && !block.operation) return
    const preCtx = {
      stepNo: 0,
      stepIndex: -4,
      actionText: block.title || '前置条件',
      expectedText: '',
    }
    pushNode(out, {
      ...preCtx,
      depth: 0,
      role: 'precondition',
      type: 'section',
      title: block.title || '前置条件',
      subtitle: raw,
      thought: raw,
      ok: block.ok !== false,
      playable: false,
    })
    if (block.operation) {
      appendOperation(block.operation, preCtx)
    }
    for (const e of block.entries || []) {
      pushNode(out, {
        ...preCtx,
        depth: 1,
        role: 'action',
        type: 'action',
        title: `${e.skipped ? 'Skip' : e.ok === false ? 'Check ✗' : 'Check'} - ${e.text}`,
        subtitle: e.msg,
        msg: e.msg,
        method: e.kind,
        sim_state: e.sim_state || '',
        sim_operator: e.operator || '',
        sim_phone: e.phone_number || '',
        ok: e.ok !== false,
        playable: false,
      })
    }
  }

  const hasPreTrace = (props.trace || []).some((b) => b.phase === 'precondition')
  if (props.preconditionRaw && !hasPreTrace) {
    appendPrecondition({
      title: '前置条件',
      subtitle: props.preconditionRaw,
      ok: true,
      entries: props.preconditionRaw
        .split(/\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((text) => ({
          text: text.replace(/^\d+[.、．)\）]\s*/, ''),
          msg: '（本次执行为旧版记录，请重新跑用例以查看校验结果）',
          ok: true,
          skipped: true,
        })),
    })
  }

  const phaseRank = (phase) => {
    const order = {
      skill_pre: 10,
      foreground: 20,
      precondition: 25,
      startup_overlay: 35,
      system_permission: 40,
      case_step: 100,
    }
    return order[phase] ?? 50
  }
  const sortedTrace = [...(props.trace || [])].sort(
    (a, b) => phaseRank(a.phase) - phaseRank(b.phase),
  )

  for (const block of sortedTrace) {
    if (block.phase === 'precondition') {
      appendPrecondition(block)
      continue
    }
    if (block.phase === 'skill_pre' && (block.command || block.execute_log?.length)) {
      const skillCtx = {
        stepNo: 0,
        stepIndex: -5,
        actionText: '前置 Skills',
        expectedText: '',
      }
      pushNode(out, {
        ...skillCtx,
        depth: 0,
        role: 'skill_pre',
        type: 'section',
        title: block.title || '前置 Skills',
        subtitle: block.command || '',
        ok: block.ok !== false,
        playable: false,
      })
      if (block.operation) {
        appendOperation(block.operation, skillCtx)
      } else {
        const plans = (block.plan_log || []).filter((e) => e.type === 'planned_step')
        const execLog = block.execute_log || []
        plans.forEach((ps, pi) => {
          pushNode(out, {
            ...skillCtx,
            depth: 1,
            role: 'plan',
            type: 'plan',
            title: `Plan - ${ps.summary}`,
            ok: true,
            playable: false,
          })
          const act = execLog.find((e) => e.index === ps.index) || execLog[pi]
          if (act) {
            pushNode(out, {
              ...skillCtx,
              depth: 1,
              role: 'action',
              type: 'action',
              title: `${act.action_name || (act.kind === 'click' ? 'Tap' : act.kind === 'input' ? 'Input' : act.kind)} - ${act.summary}`,
              ok: act.ok,
              msg: act.msg,
              method: act.method,
              duration_ms: act.duration_ms,
              screenshot: act.screenshot_before || act.screenshot_after || '',
              playable: !!(act.screenshot_before || act.screenshot_after),
            })
          }
        })
      }
      continue
    }
    if (block.phase === 'system_permission') {
      const permCtx = {
        stepNo: 0,
        stepIndex: -2,
        actionText: '关闭系统权限弹层',
        expectedText: '',
      }
      if (block.operation) {
        appendOperation(block.operation, permCtx)
      } else {
        for (const e of block.execute_log || []) {
          const eKind = e.kind || 'click'
          const actionName = e.action_name || (eKind === 'click' ? 'Tap' : eKind)
          pushNode(out, {
            ...permCtx,
            depth: 1,
            role: 'action',
            type: 'action',
            title: `${actionName} - ${e.summary || e.kind}`,
            actionName,
            ok: e.ok,
            msg: e.msg,
            method: e.method,
            x: e.x,
            y: e.y,
            target_rect: e.target_rect,
            screen_size: e.screen_size,
            duration_ms: e.duration_ms,
            screenshot: e.screenshot_before || e.screenshot_after || '',
            screenshot_before: e.screenshot_before || '',
            screenshot_after: e.screenshot_after || '',
            playable: !!(e.screenshot_before || e.screenshot_after),
          })
        }
      }
      continue
    }
    if (block.phase === 'startup_overlay') {
      const startupCtx = {
        stepNo: 0,
        stepIndex: -1,
        actionText: '关闭启动弹层',
        expectedText: '',
      }
      if (block.operation) {
        const pc = block.page_recovery?.current_page_before || {}
        if (pc?.label || pc?.matched != null) {
          appendPageTrace(pc, null, startupCtx, pc?.screenshot || '')
        }
        appendOperation(block.operation, startupCtx)
      } else {
        const pc = block.page_recovery?.current_page_before || {}
        appendPageTrace(
          pc,
          block.page_recovery,
          startupCtx,
          pc?.screenshot || block.page_recovery?.current_page_after?.screenshot || '',
        )
      }
      if (!block.operation) {
        for (const e of block.execute_log || []) {
          const eKind = e.kind || 'click'
          const actionName = e.action_name || (eKind === 'click' ? 'Tap' : eKind)
          pushNode(out, {
            stepNo: 0,
            stepIndex: -1,
            depth: 1,
            role: 'action',
            type: 'action',
            title: `${actionName} - ${e.summary || e.kind}`,
            actionName,
            ok: e.ok,
            msg: e.msg,
            method: e.method,
            duration_ms: e.duration_ms,
            screenshot: e.screenshot_before || e.screenshot_after || '',
            screenshot_before: e.screenshot_before || '',
            screenshot_after: e.screenshot_after || '',
            playable: !!(e.screenshot_before || e.screenshot_after),
          })
        }
      }
      continue
    }
    if (block.phase !== 'case_step') continue
    const ctx = {
      stepNo: block.step_no,
      stepIndex: block.step_index,
      actionText: block.action_text,
      expectedText: block.expected_text,
    }
    const op = block.operation || block.action
    if (op?.page_recovery) {
      const pc =
        op.page_recovery.current_page_before || op.page_recovery.current_page_after || {}
      appendPageTrace(pc, op.page_recovery, ctx, op.screenshot || pc?.screenshot || '')
    }
    appendOperation(op, ctx)
    appendExpected(block.expected_action || block.expected, ctx)
  }

  // 旧格式兼容
  if (!out.length) {
    for (const block of props.trace || []) {
      if (block.execute_log?.length) {
        for (const e of block.execute_log) {
          pushNode(out, {
            depth: 0,
            role: 'action',
            type: 'action',
            title: e.summary,
            ok: e.ok,
            duration_ms: e.duration_ms,
            screenshot: e.screenshot_after || e.screenshot_before || '',
            target_rect: e.target_rect,
            screen_size: e.screen_size,
            playable: true,
          })
        }
      }
    }
  }

  if (!out.length && props.stepResults?.length) {
    props.stepResults.forEach((s) => {
      pushNode(out, {
        depth: 2,
        role: 'action',
        type: 'action',
        title: s.summary,
        ok: s.ok,
        duration_ms: s.duration_ms,
        screenshot: s.screenshot_before || s.screenshot_after || '',
        target_rect: s.target_rect,
        screen_size: s.screen_size,
        playable: true,
      })
    })
  }

  flatSteps.value = out
  const first = out.findIndex((s) => s.playable)
  activeIndex.value = first >= 0 ? first : 0
}

watch(() => [props.trace, props.stepResults], buildFlatSteps, { immediate: true, deep: true })

const timelineShots = computed(() =>
  flatSteps.value
    .filter((s) => s.playable && s.screenshot)
    .map((s, i) => ({ id: i, src: imgUrl(s.screenshot), title: s.title })),
)

const current = computed(() => flatSteps.value[activeIndex.value] || null)

const findStepAfterFallback = (step) => {
  if (!step?.stepNo) return ''
  const idx = flatSteps.value.findIndex((s) => s === step)
  if (idx < 0) return ''
  for (let j = idx + 1; j < flatSteps.value.length; j += 1) {
    const s = flatSteps.value[j]
    if (s.depth === 0 && s.stepNo !== step.stepNo) break
    const shot = s.screenshot || s.screenshot_before || ''
    if (shot && s.playable) return shot
  }
  const recoveryShot =
    step.page_recovery?.current_page_after?.screenshot
    || step.thought_meta?.page_after?.screenshot
    || ''
  return recoveryShot
}

const effectiveAfterScreenshot = computed(() => {
  const step = current.value
  if (!step) return ''
  const after = step.screenshot_after || ''
  if (!after) return findStepAfterFallback(step)
  return after
})

const currentScreenshot = computed(() => {
  const step = current.value
  if (!step) return ''
  // 对于动作节点，优先展示 before，右侧信息里仍然能看到 after
  if (step.role === 'action') {
    return imgUrl(step.screenshot_before || step.screenshot || step.screenshot_after || '')
  }
  return imgUrl(step.screenshot || '')
})

const screenFrameStyle = computed(() => {
  const size = current.value?.screen_size
  const base = { position: 'relative', margin: '0 auto' }
  if (!size?.w || !size?.h) {
    return props.fullscreen
      ? { ...base, height: '100%', maxHeight: '100%', maxWidth: '100%' }
      : { ...base, maxHeight: '420px', maxWidth: '100%' }
  }
  if (props.fullscreen) {
    return {
      ...base,
      height: '100%',
      maxHeight: '100%',
      maxWidth: '100%',
      width: 'auto',
      aspectRatio: `${size.w} / ${size.h}`,
    }
  }
  return {
    ...base,
    maxHeight: '420px',
    maxWidth: '100%',
    width: 'auto',
    aspectRatio: `${size.w} / ${size.h}`,
  }
})

const tapMarkMeta = computed(() => {
  const step = current.value
  const size = step?.screen_size
  if (!size?.w || !size?.h) return null
  let rect = step?.target_rect
  const xi = Number(step?.x)
  const yi = Number(step?.y)
  if (!rect && xi > 0 && yi > 0) {
    const half = 44
    rect = {
      left: Math.max(0, xi - half),
      top: Math.max(0, yi - half),
      width: half * 2,
      height: half * 2,
      center: [xi, yi],
    }
  }
  if (!rect) return null
  const center = rect.center || [
    rect.left + (rect.width || 0) / 2,
    rect.top + (rect.height || 0) / 2,
  ]
  return { rect, size, center }
})

const overlayStyle = computed(() => {
  const m = tapMarkMeta.value
  if (!m) return null
  const { rect, size } = m
  return {
    left: `${(rect.left / size.w) * 100}%`,
    top: `${(rect.top / size.h) * 100}%`,
    width: `${(rect.width / size.w) * 100}%`,
    height: `${(rect.height / size.h) * 100}%`,
  }
})

const cursorStyle = computed(() => {
  const m = tapMarkMeta.value
  if (!m?.center) return null
  const { center, size } = m
  return {
    left: `${(center[0] / size.w) * 100}%`,
    top: `${(center[1] / size.h) * 100}%`,
  }
})

/** 蒙层仅覆盖截图区域：四块遮罩围出高亮洞 */
const dimPanels = computed(() => {
  const o = overlayStyle.value
  if (!o || current.value?.role !== 'action') return null
  const l = parseFloat(o.left)
  const t = parseFloat(o.top)
  const w = parseFloat(o.width)
  const h = parseFloat(o.height)
  return {
    top: { top: '0', left: '0', right: '0', height: `${t}%` },
    bottom: { top: `${t + h}%`, left: '0', right: '0', bottom: '0' },
    left: { top: `${t}%`, left: '0', width: `${l}%`, height: `${h}%` },
    right: { top: `${t}%`, left: `${l + w}%`, right: '0', height: `${h}%` },
  }
})

const isIconLike = (label) => /^icon[_\-]?\w*$/i.test(String(label || '').trim())

const iconCandidate = computed(() => {
  const s = current.value
  if (!s?.target_rect || s.role !== 'action') return null
  const label = (s.target_label || s.summary || '').trim()
  if (!label) return null
  const rect = s.target_rect
  return {
    name: label,
    target_label: label,
    target_rect: rect,
    x: rect.left,
    y: rect.top,
    w: rect.width,
    h: rect.height,
    screenshot: s.screenshot || '',
    suggest: s.suggest_icon_library || isIconLike(label),
  }
})

const iconCandidates = computed(() => {
  const seen = new Set()
  const list = []
  for (const s of flatSteps.value) {
    if (s.role !== 'action' || !s.target_rect) continue
    const label = (s.target_label || s.summary || '').trim()
    if (!label || seen.has(label)) continue
    if (!s.suggest_icon_library && !isIconLike(label)) continue
    seen.add(label)
    list.push({
      name: label,
      target_label: label,
      target_rect: s.target_rect,
      x: s.target_rect.left,
      y: s.target_rect.top,
      w: s.target_rect.width,
      h: s.target_rect.height,
      screenshot: s.screenshot || '',
    })
  }
  return list
})

const saveToIconLibrary = async (candidate) => {
  if (!props.appId || !candidate) return
  savingIcon.value = true
  try {
    await importIconFromLocate(props.appId, candidate)
    ElMessage.success(`「${candidate.name}」已加入图标库，下次执行将优先 icon_target 匹配`)
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || e?.message || '入库失败')
  } finally {
    savingIcon.value = false
  }
}

const openIconSettings = () => {
  if (!props.appId) return
  router.push({
    name: 'SettingsAppConfig',
    params: { appId: props.appId, section: 'icons' },
  })
}

const formatPageSource = (ctx) => {
  if (!ctx) return ''
  if (ctx.source === 'keyword' || ctx.method === 'keyword') return '界面关键词'
  if (ctx.source === 'figma' || ctx.method === 'figma_text') return 'Figma 设计稿'
  if (ctx.source === 'skeleton' || ctx.method === 'skeleton') return '应用图谱'
  return ctx.method || '识别'
}

const formatOperationThought = (thought) => {
  return String(thought || '').trim()
}

const formatPlanDetail = (detail) => {
  if (!detail || typeof detail !== 'object') return []
  const skip = new Set(['data'])
  return Object.entries(detail)
    .filter(([k, v]) => !skip.has(k) && v != null && v !== '' && v !== false)
    .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
}

const planLogEntries = (node) => {
  const log = node?.plan_log || node?.thought_meta?.plan_log || []
  return Array.isArray(log) ? log : []
}

const knowledgeHintLines = (node) => {
  const hints = node?.knowledge_hints || node?.thought_meta?.knowledge_hints || []
  if (!Array.isArray(hints) || !hints.length) return []
  return hints
}

const formatPageScore = (ctx) => {
  const score = Number(ctx?.score)
  if (!Number.isFinite(score) || score <= 0) return ''
  return `${Math.round(score * 100)}%`
}

const formatDuration = (ms) => {
  const n = Number(ms)
  if (!Number.isFinite(n) || n < 0) return ''
  if (n < 1000) return `${Math.round(n)} ms`
  const sec = n / 1000
  return sec >= 60 ? `${Math.floor(sec / 60)}m ${(sec % 60).toFixed(0)}s` : `${sec.toFixed(1)} s`
}

const currentPageContext = computed(() => {
  const s = current.value
  const pageCtx = s?.page_context
  if (!pageCtx) return null
  const label = pageCtx.current_page_label || pageCtx.label || pageCtx.figma_best || '未知'
  const matched = pageCtx.matched === true
  const rankings = pageCtx.figma_rankings || pageCtx.rankings || []
  return {
    label,
    matched,
    source: formatPageSource(pageCtx),
    score: formatPageScore(pageCtx),
    target: pageCtx.target_page?.label || '',
    nodeId: pageCtx.node_id || '',
    method: pageCtx.method || '',
    figmaRankings: rankings.map((r) => ({
      label: r.label || r.name || '',
      score: formatPageScore({ score: r.score }),
      nodeId: r.node_id || '',
    })),
  }
})

const currentPageRecovery = computed(() => {
  const s = current.value
  const rec = s?.page_recovery
  if (!rec?.attempted && !rec?.plan?.steps?.length) return null
  const plan = rec.plan || {}
  return {
    attempted: !!rec.attempted,
    ok: rec.ok,
    from: plan.from || rec.current_page_before?.label || '',
    to: plan.to || rec.target_page?.label || '',
    steps: plan.steps || [],
    reason: rec.reason || '',
  }
})

const stepOperationFailed = (step) => {
  if (!step?.stepNo) return false
  const op = flatSteps.value.find((s) => s.stepNo === step.stepNo && s.role === 'operation')
  return op?.ok === false
}

/** 前置操作失败但断言仍标记通过（历史执行数据） */
const isAssertFalsePositive = computed(() => {
  const s = current.value
  if (!s || s.role !== 'verify' || s.ok !== true) return false
  return stepOperationFailed(s)
})

const effectiveStepOk = (step) => {
  if (!step) return true
  if (step.role === 'verify' && step.ok === true && stepOperationFailed(step)) return false
  return step.ok !== false
}

const isFailedStep = computed(() => {
  const s = current.value
  if (!s) return false
  if (!['action', 'verify', 'operation'].includes(s.role)) return false
  if (s.ok === false) return true
  return isAssertFalsePositive.value
})

const buildFailurePayload = (step) => {
  let assertInvalid = ''
  if (step.role === 'verify') {
    if (stepOperationFailed(step)) assertInvalid = 'operation_failed'
    else if (step.ok === false && /首页|feed|未进入/.test(step.msg || '')) assertInvalid = 'wrong_page'
    else if (step.ok === false) assertInvalid = 'verify_failed'
  }
  return {
    app_id: props.appId,
    case_name: props.caseName,
    command: props.command,
    step_text: props.stepsRaw,
    action_text: step.actionText || '',
    expected_text: step.subtitle || step.expectedText || props.expectedRaw || '',
    title: step.title || '',
    msg: step.msg || step.subtitle || '',
    method: step.method || '',
    role: step.role || 'action',
    ok: !effectiveStepOk(step),
    assert_invalid: assertInvalid,
  }
}

const loadFailureAnalysis = async (step) => {
  if (!props.appId || !step || !isFailedStep.value) {
    failureAnalysis.value = null
    return
  }
  const seq = ++analyzeSeq
  analyzingFailure.value = true
  try {
    const res = await analyzeFailureKnowledge(buildFailurePayload(step))
    if (seq !== analyzeSeq) return
    failureAnalysis.value = res?.data || null
  } catch {
    if (seq !== analyzeSeq) return
    failureAnalysis.value = null
  } finally {
    if (seq === analyzeSeq) analyzingFailure.value = false
  }
}

const openKnowledgeDialog = () => {
  const draft = failureAnalysis.value?.knowledge
  if (!draft) return
  knowledgeDraft.value = {
    title: draft.title || '',
    category: draft.category || '其他',
    tagsText: (draft.tags || []).join(', '),
    content: draft.content || '',
    enabled: draft.enabled !== false,
  }
  knowledgeDialogVisible.value = true
}

const saveFailureKnowledge = async () => {
  if (!props.appId) return
  const title = knowledgeDraft.value.title.trim()
  const content = knowledgeDraft.value.content.trim()
  if (!title || !content) {
    ElMessage.warning('请填写标题与知识内容')
    return
  }
  savingKnowledge.value = true
  try {
    await appendAppKnowledge(props.appId, {
      title,
      content,
      category: knowledgeDraft.value.category || '其他',
      tags: String(knowledgeDraft.value.tagsText || '')
        .split(/[,，、]/)
        .map((s) => s.trim())
        .filter(Boolean),
      enabled: knowledgeDraft.value.enabled !== false,
    })
    ElMessage.success('已写入应用知识库（设置 → 应用配置 → 应用逻辑），后续执行将自动匹配')
    knowledgeDialogVisible.value = false
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || e?.message || '保存失败')
  } finally {
    savingKnowledge.value = false
  }
}

const openAppKnowledge = () => {
  if (!props.appId) return
  router.push({
    name: 'SettingsAppConfig',
    params: { appId: props.appId, section: 'logic' },
    query: { appName: props.appName || '' },
  })
}

watch(
  () => [
    current.value?.title,
    current.value?.ok,
    current.value?.role,
    current.value?.stepNo,
    props.appId,
    flatSteps.value.length,
  ],
  () => {
    const step = current.value
    if (isFailedStep.value) loadFailureAnalysis(step)
    else failureAnalysis.value = null
  },
  { immediate: true },
)

const roleIcon = (s) => {
  if (!effectiveStepOk(s)) return '✗'
  if (s.role === 'operation') return '▸'
  if (s.role === 'expected_action') return '◎'
  if (s.role === 'page_identify') return '📍'
  if (s.role === 'page_recovery' || s.role === 'page_recovery_step') return '↩'
  if (s.role === 'plan') return 'P'
  if (s.role === 'verify') return s.ok === false ? '✗' : '✓'
  if (s.role === 'action') return '▶'
  return '·'
}

const firstPlayableChildIndex = (sectionIndex) => {
  const anchor = flatSteps.value[sectionIndex]
  if (!anchor) return sectionIndex
  if (anchor.role !== 'operation' && anchor.role !== 'expected_action') return sectionIndex
  const stepNo = anchor.stepNo
  for (let j = sectionIndex + 1; j < flatSteps.value.length; j += 1) {
    const s = flatSteps.value[j]
    if (s.depth === 0 && s.stepNo === stepNo) break
    if (s.depth === 0 && s.stepNo !== stepNo) break
    if (s.stepNo === stepNo && s.playable && (s.screenshot || s.screenshot_before)) return j
  }
  return sectionIndex
}

const selectStep = (i) => {
  const anchor = flatSteps.value[i]
  if (anchor?.role === 'operation' || anchor?.role === 'expected_action') {
    activeIndex.value = firstPlayableChildIndex(i)
  } else {
    activeIndex.value = i
  }
  stopPlay()
}

const stopPlay = () => {
  playing.value = false
  if (playTimer) clearInterval(playTimer)
  playTimer = null
}

const togglePlay = () => {
  if (playing.value) {
    stopPlay()
    return
  }
  playing.value = true
  playTimer = setInterval(() => {
    const idx = flatSteps.value.findIndex((s, i) => i > activeIndex.value && s.playable)
    if (idx < 0) {
      stopPlay()
      return
    }
    activeIndex.value = idx
  }, 1500)
}
</script>

<template>
  <div v-if="flatSteps.length" class="replayer" :class="{ 'replayer--fullscreen': fullscreen }">
    <aside class="replayer-left">
      <div class="replayer-head">
        Report
        <span v-if="caseDurationMs != null || runDurationMs != null" class="replayer-timing">
          <template v-if="caseDurationMs != null">本用例 {{ formatDuration(caseDurationMs) }}</template>
          <template v-if="caseDurationMs != null && runDurationMs != null"> · </template>
          <template v-if="runDurationMs != null">总计 {{ formatDuration(runDurationMs) }}</template>
        </span>
      </div>

      <div
        v-for="(s, i) in flatSteps"
        :key="i"
        class="step-item"
        :class="{
          active: i === activeIndex,
          fail: !effectiveStepOk(s),
          section: s.type === 'section',
          plan: s.role === 'plan',
          action: s.role === 'action',
          verify: s.role === 'verify',
          page_identify: s.role === 'page_identify',
          page_recovery: s.role === 'page_recovery' || s.role === 'page_recovery_step',
        }"
        :style="{ paddingLeft: `${10 + s.depth * 14}px` }"
        @click="selectStep(i)"
      >
        <span class="step-icon">{{ roleIcon(s) }}</span>
        <div class="step-body">
          <div class="step-title">{{ s.title }}</div>
          <div v-if="s.thought && s.type === 'section'" class="step-thought">
            {{ String(s.thought || '').length > 160 ? String(s.thought || '').slice(0, 160) + '…' : String(s.thought || '') }}
          </div>
          <div v-else-if="s.subtitle && s.depth === 0" class="step-sub">
            {{ String(s.subtitle || '').length > 120 ? String(s.subtitle || '').slice(0, 120) + '…' : String(s.subtitle || '') }}
          </div>
          <div v-if="s.msg && s.depth === 2" class="step-sub">
            {{ String(s.msg || '').length > 120 ? String(s.msg || '').slice(0, 120) + '…' : String(s.msg || '') }}
          </div>
          <div v-if="s.icon_auto_learned" class="step-tag auto">已自动入库</div>
        </div>
        <span v-if="s.duration_ms != null" class="step-time">{{ (s.duration_ms / 1000).toFixed(2) }}s</span>
      </div>
    </aside>

    <section class="replayer-center">
      <div v-if="timelineShots.length > 1" class="filmstrip">
        <button
          v-for="(t, ti) in timelineShots"
          :key="ti"
          type="button"
          class="film-thumb"
          :class="{ active: current?.screenshot && imgUrl(current.screenshot) === t.src }"
          @click="selectStep(flatSteps.findIndex((s) => s.screenshot && imgUrl(s.screenshot) === t.src))"
        >
          <img :src="t.src" alt="" />
        </button>
      </div>

      <div class="player-toolbar">
        <el-button size="small" @click="togglePlay">{{ playing ? '暂停' : 'Replay' }}</el-button>
        <span class="player-pos">{{ activeIndex + 1 }} / {{ flatSteps.length }}</span>
        <el-radio-group v-model="markStyle" size="small" class="mark-toggle">
          <el-radio-button label="midscene">Midscene</el-radio-button>
          <el-radio-button label="screenshot">截图标记</el-radio-button>
        </el-radio-group>
        <el-button
          v-if="appId && iconCandidate?.suggest && !current?.icon_auto_learned"
          size="small"
          type="warning"
          plain
          :loading="savingIcon"
          @click="saveToIconLibrary(iconCandidate)"
        >
          手动入库
        </el-button>
      </div>

      <div v-if="appId && iconCandidates.length" class="icon-hint-bar">
        <span>执行时会自动将 icon_* 等无字目标写入图标库；本页可入库 {{ iconCandidates.length }} 个</span>
        <el-button size="small" link type="primary" @click="openIconSettings">打开图标库</el-button>
      </div>

      <div class="screen-stage">
        <div v-if="current?.screenshot || current?.screenshot_before || current?.screenshot_after" class="screen-wrap">
          <div v-if="current?.role === 'action'" class="before-after-bar">
            <span>Before / After</span>
            <span class="hint-text">（左侧为步骤前，右侧为步骤后截图）</span>
          </div>
          <div
            v-if="current?.role === 'action' && current.screenshot_before && current.screenshot_after && current.screenshot_before !== current.screenshot_after"
            class="before-after-grid"
          >
            <div class="ba-cell">
              <div class="screen-frame" :style="screenFrameStyle">
                <img
                  :src="imgUrl(current.screenshot_before)"
                  class="screen-img-fit"
                  alt="before"
                />
                <div v-if="overlayStyle" class="mark-layer">
                  <template v-if="dimPanels">
                    <div class="dim-panel" :style="dimPanels.top" />
                    <div class="dim-panel" :style="dimPanels.bottom" />
                    <div class="dim-panel" :style="dimPanels.left" />
                    <div class="dim-panel" :style="dimPanels.right" />
                  </template>
                  <div class="target-box" :class="markStyle" :style="overlayStyle">
                    <span v-if="markStyle !== 'midscene'" class="target-tag">{{ current.target_label || current.title }}</span>
                  </div>
                  <div v-if="markStyle === 'midscene' && cursorStyle" class="midscene-cursor" :style="cursorStyle">
                    <svg viewBox="0 0 24 24" width="48" height="48">
                      <path d="M4 2l16 8-7 2-2 7z" fill="#f97316" stroke="#fff" stroke-width="1.5" />
                    </svg>
                  </div>
                  <svg
                    v-if="markStyle === 'screenshot' && cursorStyle"
                    class="target-arrow"
                    :style="cursorStyle"
                    viewBox="0 0 80 80"
                  >
                    <defs>
                      <marker id="arrowhead" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
                        <polygon points="0 0, 8 4, 0 8" fill="#ef4444" />
                      </marker>
                    </defs>
                    <line x1="72" y1="8" x2="12" y2="62" stroke="#ef4444" stroke-width="3" marker-end="url(#arrowhead)" />
                  </svg>
                </div>
              </div>
              <div class="ba-label">Before</div>
            </div>
            <div class="ba-cell">
              <div class="screen-frame" :style="screenFrameStyle">
                <img
                  :src="imgUrl(effectiveAfterScreenshot)"
                  class="screen-img-fit"
                  alt="after"
                />
              </div>
              <div class="ba-label">After</div>
            </div>
          </div>
          <template v-else-if="current?.role === 'action' && current.screenshot_before && current.screenshot_after && current.screenshot_before === current.screenshot_after">
            <div class="before-after-bar">
              <span class="hint-text">输入前后画面相同（可能输入过快或截图为动作结束后统一采集）</span>
            </div>
            <div class="screen-frame" :style="screenFrameStyle">
              <img :src="imgUrl(current.screenshot_after)" class="screen-img-fit" alt="screenshot" />
            </div>
          </template>
          <template v-else>
            <div class="screen-frame" :style="screenFrameStyle">
              <img :src="currentScreenshot" class="screen-img-fit" alt="screenshot" />
              <div v-if="overlayStyle && current.role === 'action'" class="mark-layer">
                <template v-if="dimPanels">
                  <div class="dim-panel" :style="dimPanels.top" />
                  <div class="dim-panel" :style="dimPanels.bottom" />
                  <div class="dim-panel" :style="dimPanels.left" />
                  <div class="dim-panel" :style="dimPanels.right" />
                </template>
                <div class="target-box" :class="markStyle" :style="overlayStyle">
                  <span v-if="markStyle !== 'midscene'" class="target-tag">{{ current.target_label || current.title }}</span>
                </div>
                <div v-if="markStyle === 'midscene' && cursorStyle" class="midscene-cursor" :style="cursorStyle">
                  <svg viewBox="0 0 24 24" width="48" height="48">
                    <path d="M4 2l16 8-7 2-2 7z" fill="#f97316" stroke="#fff" stroke-width="1.5" />
                  </svg>
                </div>
                <svg
                  v-if="markStyle === 'screenshot' && cursorStyle"
                  class="target-arrow"
                  :style="cursorStyle"
                  viewBox="0 0 80 80"
                >
                  <defs>
                    <marker id="arrowhead-single" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
                      <polygon points="0 0, 8 4, 0 8" fill="#ef4444" />
                    </marker>
                  </defs>
                  <line x1="72" y1="8" x2="12" y2="62" stroke="#ef4444" stroke-width="3" marker-end="url(#arrowhead-single)" />
                </svg>
              </div>
            </div>
          </template>

          <div v-if="current.role === 'verify'" class="verify-badge" :class="{ fail: !effectiveStepOk(current) }">
            {{ effectiveStepOk(current) ? 'Assert Pass' : 'Assert Failed' }}
          </div>
          <div v-if="isAssertFalsePositive" class="verify-warn">
            前置操作失败，该断言应判定为无效（历史数据可能误标为通过）
          </div>
        </div>
        <el-empty v-else description="该节点无截图" />
      </div>

      <p v-if="current" class="player-caption">
        <span class="cap-done">Done:</span> {{ current.title }}
        <template v-if="current.msg"> — {{ current.msg }}</template>
      </p>
    </section>

    <aside class="replayer-right">
      <h4>Information</h4>
      <template v-if="current">
        <div class="info-block">
          <div class="info-label">Param</div>
          <p v-if="current.actionText">{{ current.actionText }}</p>
          <p v-else-if="current.expectedText">{{ current.expectedText }}</p>
          <p v-else-if="command">{{ command }}</p>
        </div>
        <div v-if="current.thought || current.subtitle || knowledgeHintLines(current).length" class="info-block">
          <div class="info-label">
            {{ current.role === 'operation' ? '规划说明 · Thought' : current.role === 'plan' ? 'Plan · 步骤参数' : 'Output · Thought' }}
          </div>
          <p v-if="current.role === 'operation' || current.role === 'plan'">
            {{ formatOperationThought(current.subtitle || current.thought) }}
          </p>
          <p v-else>{{ current.thought || current.subtitle }}</p>
          <ul v-if="formatPlanDetail(current.thought).length" class="plan-detail-list">
            <li v-for="(line, di) in formatPlanDetail(current.thought)" :key="di">{{ line }}</li>
          </ul>
          <ul v-if="knowledgeHintLines(current).length" class="knowledge-hint-list">
            <li v-for="(hint, hi) in knowledgeHintLines(current)" :key="hi">📚 {{ hint }}</li>
          </ul>
          <div v-if="planLogEntries(current).length" class="plan-log-block">
            <div class="info-label sub">规划日志</div>
            <ul class="plan-log-list">
              <li v-for="(entry, li) in planLogEntries(current)" :key="li">
                <span class="log-type">{{ entry.type || 'entry' }}</span>
                {{ entry.summary || entry.text || entry.title || JSON.stringify(entry.detail || {}) }}
              </li>
            </ul>
          </div>
          <p v-if="current.role === 'operation' && current.thought_meta?.plan_reply" class="hint-text plan-reply">
            拆解：{{ current.thought_meta.plan_reply }}
          </p>
          <p v-if="current.role === 'operation'" class="hint-text">
            Thought 为当前步骤指令；知识库仅展示与本步相关的提示。
          </p>
        </div>
        <div v-if="current.role === 'action'" class="info-block">
          <div class="info-label">Output · {{ current.actionName || (current.kind === 'input' ? 'Input' : 'Tap') }}</div>
          <p v-if="current.kind === 'input' && current.text">text: {{ current.text }}</p>
          <p v-if="current.kind === 'input' && current.field_hint">field: {{ current.field_hint }}</p>
          <p v-if="current.target_label">目标：{{ current.target_label }}</p>
          <p v-if="current.x != null && current.y != null">坐标：({{ current.x }}, {{ current.y }})</p>
          <p v-if="current.target_rect">
            center: [{{ current.target_rect.center?.join(', ') }}]<br />
            left: {{ current.target_rect.left }}, top: {{ current.target_rect.top }},
            width: {{ current.target_rect.width }}, height: {{ current.target_rect.height }}
          </p>
          <p v-if="current.method">method: {{ current.method }}</p>
          <p v-if="current.sim_state">sim state: {{ current.sim_state }}</p>
          <p v-if="current.sim_operator">运营商: {{ current.sim_operator }}</p>
          <p v-if="current.method === 'check_sim' || current.sim_phone || current.msg?.includes('号码')">
            号码: {{ current.sim_phone || '系统未暴露本机号码' }}
          </p>
          <p v-if="current.duration_ms != null">duration: {{ current.duration_ms }} ms</p>
          <p v-if="current.msg">result: {{ current.msg }}</p>
        </div>
        <div
          v-if="(currentPageContext || current.page_context) && ['verify', 'expected_action', 'page_identify', 'page_recovery', 'page_recovery_step', 'action'].includes(current.role)"
          class="info-block page-context-block"
        >
          <div class="info-label">当前页面识别</div>
          <p>
            <span class="page-tag" :class="{ matched: currentPageContext.matched }">
              {{ currentPageContext.label }}
            </span>
            <span v-if="currentPageContext.score" class="page-meta">
              （{{ currentPageContext.source }} · {{ currentPageContext.score }}）
            </span>
            <span v-else-if="!currentPageContext.matched" class="page-meta">（未达识别阈值）</span>
          </p>
          <p v-if="currentPageContext.target">
            目标页：{{ currentPageContext.target }}
          </p>
          <p v-if="currentPageContext.nodeId" class="page-meta">
            Figma node: {{ currentPageContext.nodeId }}
          </p>
          <ul v-if="currentPageContext.figmaRankings?.length" class="figma-rank-list">
            <li v-for="(row, fi) in currentPageContext.figmaRankings" :key="fi">
              {{ fi + 1 }}. {{ row.label || '—' }}
              <span class="page-meta">{{ row.score }}</span>
              <span v-if="row.nodeId" class="page-meta"> · {{ row.nodeId }}</span>
            </li>
          </ul>
          <p v-if="currentPageContext.method === 'figma_text'" class="hint-text">
            基于 Figma 设计稿文案与当前屏 OCR 文本相似度匹配；可对照上方候选页精细化分析。
          </p>
        </div>
        <div v-if="currentPageRecovery" class="info-block page-recovery-block">
          <div class="info-label">页面路径恢复</div>
          <p v-if="currentPageRecovery.from || currentPageRecovery.to">
            {{ currentPageRecovery.from || '当前页' }} → {{ currentPageRecovery.to || '目标页' }}
            <span v-if="currentPageRecovery.attempted" class="recovery-status" :class="{ ok: currentPageRecovery.ok }">
              {{ currentPageRecovery.ok ? '已执行' : '部分失败' }}
            </span>
          </p>
          <p v-else-if="currentPageRecovery.reason">{{ currentPageRecovery.reason }}</p>
          <ul v-if="currentPageRecovery.steps?.length" class="recovery-steps">
            <li v-for="(st, ri) in currentPageRecovery.steps" :key="ri">{{ st.summary || st.label }}</li>
          </ul>
        </div>
        <div v-if="current.role === 'verify'" class="info-block">
          <div class="info-label">Output · Assert</div>
          <p>{{ current.subtitle }}</p>
          <p v-if="current.msg">{{ current.msg }}</p>
        </div>
        <div v-if="current.role === 'action' && current.icon_auto_learned" class="info-block">
          <div class="info-label">图标库</div>
          <p>执行时已自动入库「{{ current.target_label }}」，同次运行后续步骤会优先 icon_target 匹配。</p>
        </div>
        <div v-else-if="current.role === 'action' && iconCandidate?.suggest" class="info-block">
          <div class="info-label">图标库</div>
          <p>可手动补入库「{{ iconCandidate.name }}」（通常失败步骤不会自动入库）。</p>
          <el-button size="small" type="warning" plain :loading="savingIcon" @click="saveToIconLibrary(iconCandidate)">
            手动入库
          </el-button>
        </div>
        <div v-if="current.duration_ms != null" class="info-block">
          <div class="info-label">Meta</div>
          <p>duration: {{ current.duration_ms }} ms</p>
        </div>

        <div v-if="isFailedStep && appId" class="info-block failure-block">
          <div class="info-label">失败分析 · 纠错</div>
          <p v-if="analyzingFailure" class="failure-hint">正在分析失败原因…</p>
          <template v-else-if="failureAnalysis">
            <p class="failure-analysis">{{ failureAnalysis.analysis }}</p>
            <ul v-if="failureAnalysis.suggestions?.length" class="failure-suggestions">
              <li v-for="(tip, ti) in failureAnalysis.suggestions" :key="ti">{{ tip }}</li>
            </ul>
            <div class="failure-actions">
              <el-button size="small" type="primary" @click="openKnowledgeDialog">写入应用知识库</el-button>
              <el-button size="small" link type="primary" @click="openAppKnowledge">查看应用知识</el-button>
            </div>
          </template>
          <p v-else class="failure-hint">可手动补充本应用操作说明，供后续执行匹配。</p>
        </div>
      </template>
    </aside>

    <el-dialog
      v-model="knowledgeDialogVisible"
      title="写入应用知识库"
      width="520px"
      destroy-on-close
    >
      <p class="dialog-desc">
        将保存到「{{ appName || appId }}」专属知识库，规划与执行时会按关键词自动匹配。
      </p>
      <el-form label-width="72px">
        <el-form-item label="分类">
          <el-select v-model="knowledgeDraft.category" style="width: 100%">
            <el-option v-for="c in CATEGORY_OPTIONS" :key="c" :label="c" :value="c" />
          </el-select>
        </el-form-item>
        <el-form-item label="标题">
          <el-input v-model="knowledgeDraft.title" />
        </el-form-item>
        <el-form-item label="标签">
          <el-input v-model="knowledgeDraft.tagsText" placeholder="feed, 详情, 点击" />
        </el-form-item>
        <el-form-item label="知识内容">
          <el-input v-model="knowledgeDraft.content" type="textarea" :rows="10" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="knowledgeDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="savingKnowledge" @click="saveFailureKnowledge">保存</el-button>
      </template>
    </el-dialog>
  </div>
  <el-empty v-else description="暂无执行步骤（请重新执行用例以生成 Midscene 层级日志）" />
</template>

<style scoped>
.replayer {
  display: grid;
  grid-template-columns: 280px 1fr 260px;
  gap: 12px;
  min-height: 520px;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 12px;
}
.replayer--fullscreen {
  min-height: 0;
  height: 100%;
  grid-template-columns: minmax(240px, 22%) 1fr minmax(220px, 20%);
  border-radius: 0;
}
.replayer--fullscreen .replayer-left,
.replayer--fullscreen .replayer-right {
  max-height: none;
  height: 100%;
  overflow-y: auto;
}
.replayer--fullscreen .replayer-center {
  min-height: 0;
  height: 100%;
  overflow: hidden;
}
.replayer--fullscreen .filmstrip,
.replayer--fullscreen .player-toolbar,
.replayer--fullscreen .icon-hint-bar {
  flex-shrink: 0;
}
.replayer--fullscreen .screen-stage {
  flex: 1;
  min-height: 0;
  height: auto;
  overflow: hidden;
  align-items: center;
  justify-content: center;
  padding: 8px;
}
.replayer--fullscreen .screen-wrap {
  height: 100%;
  max-height: 100%;
  max-width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  overflow: hidden;
}
.replayer--fullscreen .before-after-bar {
  flex-shrink: 0;
  width: 100%;
}
.replayer--fullscreen .before-after-grid {
  flex: 1;
  min-height: 0;
  height: 100%;
  width: 100%;
  max-width: none;
  display: flex;
  gap: 8px;
  align-items: stretch;
  justify-content: center;
}
.replayer--fullscreen .ba-cell {
  flex: 1;
  min-width: 0;
  min-height: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.replayer--fullscreen .ba-cell .screen-frame {
  flex: 1;
  min-height: 0;
}
.replayer--fullscreen .screen-wrap > .screen-frame {
  flex: 1;
  min-height: 0;
}
.replayer--fullscreen .player-caption {
  flex-shrink: 0;
}
.replayer-left {
  overflow-y: auto;
  max-height: 560px;
  background: #fff;
  border-radius: 6px;
  border: 1px solid #e5e7eb;
  scrollbar-width: thin;
  scrollbar-color: rgba(0, 0, 0, 0.25) transparent;
}

.replayer-left::-webkit-scrollbar {
  width: 7px;
}
.replayer-left::-webkit-scrollbar-track {
  background: transparent;
}
.replayer-left::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.22);
  border-radius: 10px;
}
.replayer-head {
  padding: 10px 12px;
  font-weight: 700;
  border-bottom: 1px solid #f3f4f6;
  font-size: 14px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.replayer-timing {
  font-weight: 400;
  font-size: 11px;
  color: #6b7280;
}
.figma-rank-list {
  margin: 6px 0 0;
  padding-left: 18px;
  font-size: 12px;
  color: #374151;
}
.step-item {
  display: flex;
  gap: 6px;
  align-items: flex-start;
  padding: 6px 10px 6px 0;
  cursor: pointer;
  border-bottom: 1px solid #f9fafb;
  font-size: 12px;
}
.step-item.section {
  background: #f8fafc;
  font-weight: 600;
  padding-top: 10px;
  border-top: 1px solid #e5e7eb;
}
.step-item.plan { color: #374151; }
.step-item.action { color: #1e40af; }
.step-item.verify { color: #047857; }
.step-item.active { background: #eff6ff; }
.step-item.fail { background: #fef2f2; }
.step-icon {
  width: 16px;
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 700;
  color: #9ca3af;
  margin-top: 2px;
}
.step-body { flex: 1; min-width: 0; }
.step-title { font-weight: 500; line-height: 1.4; word-break: break-word; }
.step-thought {
  font-size: 11px;
  color: #6b7280;
  margin-top: 4px;
  font-style: italic;
}
.step-sub { font-size: 11px; color: #9ca3af; margin-top: 2px; }
.step-tag.auto {
  display: inline-block;
  margin-top: 4px;
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 4px;
  background: #fef3c7;
  color: #b45309;
}
.step-time {
  flex-shrink: 0;
  font-size: 11px;
  color: #9ca3af;
  font-variant-numeric: tabular-nums;
}
.replayer-center { display: flex; flex-direction: column; min-width: 0; }
.filmstrip {
  display: flex;
  gap: 4px;
  overflow-x: auto;
  padding: 4px 0 8px;
  margin-bottom: 4px;
}
.film-thumb {
  flex-shrink: 0;
  width: 40px;
  height: 72px;
  padding: 0;
  border: 2px solid transparent;
  border-radius: 4px;
  overflow: hidden;
  cursor: pointer;
  background: #111;
}
.film-thumb.active { border-color: #3b82f6; }
.film-thumb img { width: 100%; height: 100%; object-fit: contain; }
.player-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}
.player-pos { font-size: 12px; color: #6b7280; }
.mark-toggle { margin-left: auto; }
.screen-stage {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #111827;
  border-radius: 8px;
  min-height: 380px;
  padding: 12px;
}
.screen-wrap {
  position: relative;
  display: inline-block;
  max-height: 440px;
  max-width: 100%;
  overflow: visible;
  line-height: 0;
  border-radius: 4px;
}
.screen-wrap .screen-img {
  object-fit: contain;
}
.before-after-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 6px;
  font-size: 11px;
  color: #e5e7eb;
}
.plan-detail-list,
.knowledge-hint-list,
.plan-log-list {
  margin: 8px 0 0;
  padding-left: 18px;
  font-size: 12px;
  line-height: 1.5;
  color: #4b5563;
}
.plan-log-block .info-label.sub {
  margin-top: 10px;
  font-size: 11px;
}
.plan-log-list .log-type {
  display: inline-block;
  min-width: 72px;
  color: #6b7280;
  font-family: ui-monospace, monospace;
  font-size: 11px;
}
.before-after-bar .hint-text {
  opacity: 0.7;
}
.before-after-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
}
.ba-cell {
  position: relative;
  min-width: 0;
}
.screen-frame {
  position: relative;
  line-height: 0;
}
.screen-frame .screen-img-fit {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: contain;
  border-radius: 4px;
}
.screen-frame .mark-layer {
  position: absolute;
  inset: 0;
}
.ba-label {
  position: absolute;
  left: 6px;
  bottom: 6px;
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(15, 23, 42, 0.8);
  color: #e5e7eb;
}
.screen-img {
  max-height: 420px;
  max-width: 100%;
  display: block;
  border-radius: 4px;
}
.mark-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 2;
}
.dim-panel {
  position: absolute;
  background: rgba(0, 0, 0, 0.42);
}
.target-box {
  position: absolute;
  pointer-events: none;
  z-index: 3;
}
.target-box.midscene {
  border: 2px solid rgba(249, 115, 22, 0.85);
  border-radius: 8px;
  background: rgba(249, 115, 22, 0.06);
}
.target-box.screenshot {
  border: 3px solid #ef4444;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.02);
}
.icon-hint-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 12px;
  color: #6b7280;
  margin-bottom: 8px;
}
.target-tag {
  position: absolute;
  top: -22px;
  left: 0;
  background: #ef4444;
  color: #fff;
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
}
.midscene-cursor {
  position: absolute;
  width: 48px;
  height: 48px;
  margin: -8px 0 0 -8px;
  pointer-events: none;
  z-index: 4;
  filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.5));
}
.target-arrow {
  position: absolute;
  width: 80px;
  height: 80px;
  margin: -72px 0 0 24px;
  pointer-events: none;
  z-index: 3;
}
.verify-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  background: #10b981;
  color: #fff;
  font-size: 11px;
  padding: 4px 10px;
  border-radius: 6px;
  font-weight: 600;
  z-index: 5;
}
.verify-badge.fail { background: #ef4444; }
.verify-warn {
  margin-top: 8px;
  padding: 8px 10px;
  font-size: 12px;
  line-height: 1.5;
  color: #b45309;
  background: #fffbeb;
  border: 1px solid #fcd34d;
  border-radius: 6px;
}
.player-caption { margin: 8px 0 0; font-size: 12px; color: #4b5563; }
.cap-done { font-weight: 600; color: #111827; }
.replayer-right {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  padding: 12px;
  font-size: 12px;
  line-height: 1.6;
  overflow-y: auto;
}
.replayer-right h4 { margin: 0 0 12px; font-size: 14px; font-weight: 700; }
.info-block { margin-bottom: 14px; }
.info-label {
  font-size: 11px;
  font-weight: 700;
  color: #6b7280;
  margin-bottom: 4px;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.failure-block {
  padding: 10px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 6px;
}
.failure-analysis {
  margin: 0 0 8px;
  color: #991b1b;
  white-space: pre-line;
}
.failure-suggestions {
  margin: 0 0 10px;
  padding-left: 18px;
  color: #7f1d1d;
}
.failure-suggestions li { margin-bottom: 4px; }
.failure-hint { margin: 0; color: #9ca3af; }
.failure-actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.page-context-block {
  padding: 10px;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 6px;
}
.page-recovery-block {
  padding: 10px;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 6px;
}
.page-tag {
  font-weight: 600;
  color: #1d4ed8;
}
.page-tag.matched { color: #15803d; }
.page-meta { color: #6b7280; font-size: 12px; }
.recovery-steps {
  margin: 6px 0 0;
  padding-left: 18px;
  color: #166534;
}
.recovery-status {
  margin-left: 6px;
  font-size: 12px;
  color: #b45309;
}
.recovery-status.ok { color: #15803d; }
.dialog-desc { margin: 0 0 12px; font-size: 13px; color: #6b7280; }
</style>
