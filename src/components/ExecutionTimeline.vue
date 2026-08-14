<script setup>
/**
 * 统一执行时间线：胶片轴（悬停放大 + 点击灯箱）+ 默认展开的步骤列表。
 */
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { addMessageListener, removeMessageListener } from '@/api/mWebSocket'
import { getAgentSteps, getCaseRunnerTraceDetail } from '@/api/caseRunner'
import { getBaseUrl } from '@/utils/config'
import { normalizeCaseRow } from '@/utils/caseText'
import CaseMultilineCell from '@/components/CaseMultilineCell.vue'
import CaseAlignedFieldCell from '@/components/CaseAlignedFieldCell.vue'

const props = defineProps({
  runId: { type: String, default: '' },
  live: { type: Boolean, default: false },
  caseSummary: { type: String, default: '' },
  caseGoal: { type: String, default: '' },
  caseSpec: { type: Object, default: null },
})

const goal = ref('')
const checkpoints = ref([])
const steps = ref([])
const overall = ref('')
const finished = ref(false)
const finalSummary = ref('')
const failureLabel = ref('')
const scrollEl = ref(null)
const filmEl = ref(null)
const activeStep = ref(null)
const hoverStep = ref(null)
const lightboxSrc = ref('')
const lightboxMeta = ref('')

function isValidThumb(t) {
  if (!t || typeof t !== 'string') return false
  const s = t.trim()
  if (s.startsWith('data:image/')) return s.length > 64
  if (s.startsWith('/static/')) return true
  if (s.startsWith('http://') || s.startsWith('https://')) return true
  if (s.startsWith('/9j/') || s.startsWith('iVBOR')) return s.length > 80
  if (s.startsWith('/') || /^[A-Za-z]:[\\/]/.test(s)) return false
  return false
}

function thumbSrc(t) {
  if (!isValidThumb(t)) return ''
  const s = t.trim()
  if (s.startsWith('data:')) return s
  if (s.startsWith('/static/')) return `${getBaseUrl()}${s}`
  if (s.startsWith('http://') || s.startsWith('https://')) return s
  if (s.startsWith('iVBOR')) return `data:image/png;base64,${s}`
  return `data:image/jpeg;base64,${s}`
}

function normalizeThumb(t) {
  return isValidThumb(t) ? t.trim() : undefined
}

function fmtDuration(ms) {
  const n = Number(ms) || 0
  if (n <= 0) return '0ms'
  if (n < 1000) return `${n}ms`
  if (n < 60000) return `${(n / 1000).toFixed(n < 10000 ? 1 : 0)}s`
  return `${Math.round(n / 1000)}s`
}

const failureCategory = ref('')

function reset() {
  goal.value = ''; checkpoints.value = []; steps.value = []
  overall.value = ''; finished.value = false; finalSummary.value = ''; failureLabel.value = ''
  failureCategory.value = ''
  activeStep.value = null
  hoverStep.value = null
  lightboxSrc.value = ''
}

function upsert(stepNo, patch) {
  let s = steps.value.find(x => x.step === stepNo)
  if (!s) { s = { step: stepNo }; steps.value.push(s); steps.value.sort((a, b) => a.step - b.step) }
  Object.assign(s, patch)
}

function applyAgentEvent(d) {
  if (!d) return
  if (d.phase === 'start') { goal.value = d.goal || goal.value; checkpoints.value = d.checkpoints || checkpoints.value }
  else if (d.phase === 'step') {
    upsert(d.step, {
      thought: d.thought,
      status: d.status,
      action: d.action,
      thumb: normalizeThumb(d.thumb),
      cap: d.action?.capability_id,
    })
    activeStep.value = d.step
  }
  else if (d.phase === 'result') {
    upsert(d.step, {
      result_status: d.result_status,
      summary: d.summary,
      elapsed: d.elapsed_ms || d.elapsed,
      ...(d.thumb ? { thumb: normalizeThumb(d.thumb) } : {}),
      ...(d.capability_id ? { cap: d.capability_id } : {}),
    })
  }
  else if (d.phase === 'done') {
    overall.value = d.overall || ''
    finished.value = true
    if (d.summary) finalSummary.value = d.summary
    if (d.failure_label) failureLabel.value = d.failure_label
    if (d.failure_category) failureCategory.value = d.failure_category
  }
}

function applyPlanEvents(evs) {
  (evs || []).forEach((e, i) => {
    const thumb = normalizeThumb(e.thumb || e.screenshot_thumb || e.image_base64 || '')
    const elapsed = resolveElapsed(e)
    upsert(e.seq ?? i + 1, {
      cap: e.capability_id, executor: e.executor_used,
      result_status: e.status, status: e.status,
      summary: e.summary || e.error, elapsed,
      thought: e.ai_reasoning || '',
      thumb,
      action: e.plan_event ? { capability_id: e.capability_id, params: e.plan_event.params } : null,
    })
  })
}

function resolveElapsed(e) {
  const direct = Number(e?.elapsed_ms ?? e?.elapsed)
  if (Number.isFinite(direct) && direct > 0) return direct
  const a = Date.parse(e?.started_at || '')
  const b = Date.parse(e?.finished_at || '')
  if (Number.isFinite(a) && Number.isFinite(b) && b > a) return b - a
  return Number.isFinite(direct) ? Math.max(0, direct) : 0
}

/** 结论文案：报告摘要 > 失败步骤 summary > 任务用例 summary */
function hydrateVerdict(d = {}) {
  const rp = d.report_payload && typeof d.report_payload === 'object' ? d.report_payload : {}
  if (d.failure_label || rp.failure_label) failureLabel.value = d.failure_label || rp.failure_label || failureLabel.value
  failureCategory.value = String(d.failure_category || rp.failure_category || props.caseSpec?.failure_category || failureCategory.value || '')
  const failed = [...steps.value].reverse().find((s) =>
    ['fail', 'give_up', 'declined', 'blocked'].includes(String(s.result_status || s.status || '')),
  )
  const candidates = [
    rp.blocked_reason, rp.decline_reason, rp.summary, rp.final_summary,
    d.blocked_reason, failed?.summary, props.caseSummary, steps.value.at(-1)?.summary,
  ].map((x) => String(x || '').trim()).filter(Boolean)
  if (candidates.length) {
    finalSummary.value = candidates.reduce((a, b) => (b.length > a.length ? b : a))
  }
  if (!overall.value) overall.value = d.overall_status || ''
  if (!goal.value && props.caseGoal) goal.value = props.caseGoal
}

function fillMissingElapsed(caseElapsedMs) {
  const known = steps.value.reduce((n, s) => n + (Number(s.elapsed) > 0 ? Number(s.elapsed) : 0), 0)
  const zeros = steps.value.filter((s) => !(Number(s.elapsed) > 0))
  if (!zeros.length) return
  const budget = Math.max(0, (Number(caseElapsedMs) || 0) - known)
  if (budget <= 0) return
  // 优先把剩余时间给 assert / 最后一步；其余均分一小份
  const assertLike = zeros.filter((s) => /assert|done|goal/i.test(String(s.cap || s.action?.capability_id || '')))
  const targets = assertLike.length ? assertLike : [zeros[zeros.length - 1]]
  const each = Math.max(1, Math.round(budget / targets.length))
  targets.forEach((s) => { s.elapsed = each })
  // 其它 0ms 步骤给最小可见值，避免水瀑完全看不见
  zeros.forEach((s) => {
    if (!(Number(s.elapsed) > 0)) s.elapsed = 1
  })
}

async function backfill(runId) {
  if (!runId) return
  let usedAgent = false
  let caseElapsed = 0
  try {
    const res = await getAgentSteps(runId)
    const evs = res?.data?.events || []
    if (evs.length) {
      evs.forEach(applyAgentEvent)
      usedAgent = true
    }
  } catch (_) { /* noop */ }
  try {
    const res = await getCaseRunnerTraceDetail(runId)
    const d = res?.data || {}
    const rp = d.report_payload && typeof d.report_payload === 'object' ? d.report_payload : {}
    const plan = d.plan_payload && typeof d.plan_payload === 'object' ? d.plan_payload : {}
    goal.value = goal.value || d.goal || rp.goal || plan.goal || d.case_name || props.caseGoal || ''
    overall.value = d.overall_status || overall.value || ''
    finished.value = true
    caseElapsed = Number(d.elapsed_ms) || 0
    const evs = d.event_results || d.events || []
    if (!usedAgent) {
      applyPlanEvents(Array.isArray(evs) ? evs : [])
    } else {
      (evs || []).forEach((e, i) => {
        const stepNo = e.seq ?? i + 1
        const s = steps.value.find((x) => x.step === stepNo)
        const thumb = normalizeThumb(e.thumb || e.screenshot_thumb || '')
        const elapsed = resolveElapsed(e)
        if (!s) {
          upsert(stepNo, {
            cap: e.capability_id,
            executor: e.executor_used,
            result_status: e.status,
            status: e.status,
            summary: e.summary || e.error,
            elapsed,
            thumb: thumb || undefined,
          })
          return
        }
        if (thumb && !isValidThumb(s.thumb)) s.thumb = thumb
        if (elapsed > 0 && !(Number(s.elapsed) > 0)) s.elapsed = elapsed
        if (e.capability_id && (!s.cap || s.cap === 'done')) s.cap = e.capability_id
        if (e.executor_used && !s.executor) s.executor = e.executor_used
      })
    }
    fillMissingElapsed(caseElapsed)
    hydrateVerdict(d)
    if (!activeStep.value && steps.value.length) {
      const withThumb = [...steps.value].reverse().find((s) => isValidThumb(s.thumb))
      activeStep.value = (withThumb || steps.value[steps.value.length - 1]).step
    }
    if (props.live) scrollBottom()
    scrollFilmToActive()
  } catch (_) {
    fillMissingElapsed(caseElapsed)
    hydrateVerdict({})
    if (!activeStep.value && steps.value.length) activeStep.value = steps.value[steps.value.length - 1].step
    if (props.live) scrollBottom()
    scrollFilmToActive()
  }
}

const onWs = (res) => {
  if (!props.live || !res) return
  const type = res.type || res.action
  if (type !== 'agent_step') return
  const d = res.data || {}
  if (d.run_id !== props.runId) return
  applyAgentEvent(d)
  if (d.phase === 'step' || d.phase === 'result') scrollFilmToActive()
  if (d.phase === 'done') scrollBottom()
}

function scrollBottom() {
  nextTick(() => { if (scrollEl.value) scrollEl.value.scrollTop = scrollEl.value.scrollHeight })
}

function scrollFilmToActive() {
  nextTick(() => {
    const box = filmEl.value
    const el = box?.querySelector('.tl-node.active')
    if (!box || !el) return
    const left = el.offsetLeft - (box.clientWidth - el.offsetWidth) / 2
    box.scrollTo({ left: Math.max(0, left), behavior: 'smooth' })
  })
}

watch(() => props.runId, (id) => { reset(); backfill(id) })

const onKeydown = (e) => {
  if (e.key === 'Escape' && lightboxSrc.value) closeLightbox()
}

onMounted(() => {
  addMessageListener(onWs)
  window.addEventListener('keydown', onKeydown)
  if (props.runId) backfill(props.runId)
})
onUnmounted(() => {
  removeMessageListener(onWs)
  window.removeEventListener('keydown', onKeydown)
})

const isLimit = computed(() => {
  const cat = String(failureCategory.value || props.caseSpec?.failure_category || '').toLowerCase()
  if (cat === 'budget_exhausted') return true
  if (String(overall.value) === 'partial') return true
  return /步数耗尽|步数上限|max_steps/i.test(`${failureLabel.value} ${finalSummary.value} ${props.caseSummary || ''}`)
})

const spec = computed(() => normalizeCaseRow(props.caseSpec || {}))
const caseName = computed(() => spec.value.name || spec.value.case_name || spec.value.title || '')
const caseModule = computed(() => spec.value.module || '')
const casePlatform = computed(() => spec.value.platform || spec.value.client || spec.value.terminal || '')
const showCaseInfo = computed(() => true)

const statusText = (s) => {
  if (isLimit.value && (s === overall.value || s === 'partial')) return '步数耗尽'
  return ({
    continue: '决策', done: '完成', give_up: '放弃', ask_human: '请求人工',
    pass: '成功', fail: '失败', blocked: '阻塞', skipped: '跳过', declined: '拒绝',
    partial: '步数耗尽',
  })[s] || s || ''
}
const statusClass = (s) => {
  if (isLimit.value && (s === overall.value || s === 'partial')) return 'limit'
  if (['done', 'pass'].includes(s)) return 'ok'
  if (['give_up', 'fail', 'declined'].includes(s)) return 'bad'
  if (['ask_human', 'blocked', 'partial'].includes(s)) return 'warn'
  return ''
}
const fmtAction = (a) => {
  if (!a || !a.capability_id) return ''
  const p = a.params || {}
  const kv = Object.keys(p).map(k => `${k}=${p[k]}`).join(', ')
  return `${a.capability_id}(${kv})`
}

const BAR_PALETTE = [
  '#6366f1', '#06b6d4', '#a855f7', '#f59e0b', '#ec4899',
  '#14b8a6', '#3b82f6', '#e11d48', '#8b5cf6', '#0ea5e9',
]

function barColorFor(f, index) {
  const st = String(f.status || '')
  if (['fail', 'give_up', 'declined'].includes(st)) return '#f87171'
  if (['ask_human', 'blocked'].includes(st)) return '#fbbf24'
  const cap = String(f.cap || '').toLowerCase()
  if (cap.includes('assert') || cap.includes('goal')) return '#10b981'
  if (cap.includes('click') || cap.includes('tap')) return '#3b82f6'
  if (cap.includes('swipe') || cap.includes('scroll') || cap.includes('drag')) return '#06b6d4'
  if (cap.includes('type') || cap.includes('input') || cap.includes('text')) return '#a855f7'
  if (cap.includes('launch') || cap.includes('open') || cap.includes('start')) return '#6366f1'
  if (cap.includes('wait') || cap.includes('sleep')) return '#94a3b8'
  if (cap.includes('human')) return '#f59e0b'
  return BAR_PALETTE[index % BAR_PALETTE.length]
}

const filmFrames = computed(() => {
  let t = 0
  return steps.value.map((s) => {
    const elapsed = Math.max(0, Number(s.elapsed) || 0)
    const at = t
    t += elapsed
    return {
      step: s.step,
      thumb: s.thumb,
      at,
      elapsed,
      status: s.result_status || s.status,
      cap: s.cap || s.action?.capability_id || `#${s.step}`,
    }
  })
})
const totalMs = computed(() => {
  const sum = filmFrames.value.reduce((n, f) => n + (f.elapsed || 0), 0)
  return sum > 0 ? sum : 1
})
const nodeCols = computed(() => filmFrames.value.map((f, i) => ({
  ...f,
  color: barColorFor(f, i),
  hasThumb: isValidThumb(f.thumb),
})))

const waterfallBars = computed(() => {
  const total = totalMs.value
  return filmFrames.value.map((f, i) => {
    const rawW = total > 0 ? (f.elapsed / total) * 100 : 0
    return {
      ...f,
      leftPct: (f.at / total) * 100,
      widthPct: f.elapsed <= 0 ? 0.6 : Math.max(rawW, 0.8),
      color: barColorFor(f, i),
    }
  })
})

const axisMarks = computed(() => {
  const total = totalMs.value
  if (total <= 0) return [{ label: '0ms', pct: 0 }]
  const step = total > 120000 ? 30000 : total > 40000 ? 10000 : 5000
  const marks = []
  for (let ms = 0; ms <= total; ms += step) {
    marks.push({ label: ms >= 1000 ? `${Math.round(ms / 1000)}s` : `${ms}ms`, pct: (ms / total) * 100 })
  }
  if (marks[marks.length - 1]?.pct < 99) {
    marks.push({ label: total >= 1000 ? `${Math.round(total / 1000)}s` : `${total}ms`, pct: 100 })
  }
  return marks
})

const verdictText = computed(() => {
  const bits = [failureLabel.value, finalSummary.value, props.caseSummary].map((s) => String(s || '').trim()).filter(Boolean)
  return [...new Set(bits)].join(' · ')
})
const showVerdict = computed(() => finished.value || overall.value || verdictText.value)

const selectStep = (stepNo) => {
  activeStep.value = stepNo
  nextTick(() => {
    const el = scrollEl.value?.querySelector(`[data-step="${stepNo}"]`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    scrollFilmToActive()
  })
}

const openLightbox = (thumb, meta = '') => {
  const src = thumbSrc(thumb)
  if (!src) return
  lightboxSrc.value = src
  lightboxMeta.value = meta
}

const closeLightbox = () => {
  lightboxSrc.value = ''
  lightboxMeta.value = ''
}

const onFilmClick = (f, e) => {
  e.stopPropagation()
  selectStep(f.step)
}

const onNodeThumbClick = (f, e) => {
  e.stopPropagation()
  selectStep(f.step)
  if (f.hasThumb) openLightbox(f.thumb, `#${f.step} · ${f.cap} · ${fmtDuration(f.elapsed)}`)
}

const onStepThumbClick = (s, e) => {
  e.stopPropagation()
  selectStep(s.step)
  openLightbox(s.thumb, `#${s.step} · ${s.cap || ''} · ${fmtDuration(s.elapsed)}`)
}

defineExpose({ goal, overall, finished })
</script>

<template>
  <div class="et-wrap">
    <section v-if="showCaseInfo" class="et-case">
      <table class="case-spec-table">
        <thead>
          <tr>
            <th>端</th>
            <th>模块</th>
            <th>用例名称</th>
            <th>前置条件</th>
            <th>步骤</th>
            <th>预期</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>{{ casePlatform || '—' }}</td>
            <td>{{ caseModule || '—' }}</td>
            <td>{{ caseName || '—' }}</td>
            <td class="col-multi"><CaseMultilineCell :row="spec" raw-key="precondition" /></td>
            <td class="col-multi"><CaseAlignedFieldCell :row="spec" field="step" /></td>
            <td class="col-multi"><CaseAlignedFieldCell :row="spec" field="expected" /></td>
          </tr>
        </tbody>
      </table>
    </section>

    <div v-if="showVerdict" class="et-verdict" :class="isLimit ? 'limit' : statusClass(overall)">
      <div class="et-verdict-kicker">
        <span class="et-verdict-tag">{{ statusText(overall) || (finished ? '已结束' : '执行中') }}</span>
        <span v-if="isLimit" class="et-limit-pill">步数上限</span>
        <span v-if="totalMs > 0" class="et-verdict-ms">合计 {{ fmtDuration(totalMs) }}</span>
      </div>
      <p class="et-verdict-body">{{ verdictText || '本用例已结束，详见下方时间线。' }}</p>
    </div>

    <div v-if="runId || steps.length" class="film-block">
      <div class="film-head">
        <strong>时间线</strong>
        <span class="film-total">按执行顺序 · 条宽≈耗时 · 共 {{ nodeCols.length }} 步</span>
      </div>
      <div v-if="!steps.length" class="film-empty">暂无步骤时间线</div>
      <template v-else>
        <div class="film-axis" aria-hidden="true">
          <span
            v-for="m in axisMarks"
            :key="m.label + m.pct"
            class="film-axis-mark"
            :style="{ left: m.pct + '%' }"
          >{{ m.label }}</span>
        </div>
        <div class="film-waterfall">
          <button
            v-for="(b, i) in waterfallBars"
            :key="'wf-' + b.step"
            type="button"
            class="wf-seg"
            :class="{
              active: b.step === activeStep,
              bad: statusClass(b.status) === 'bad',
              limit: isLimit && i === waterfallBars.length - 1,
            }"
            :style="{ left: b.leftPct + '%', width: b.widthPct + '%', background: b.color }"
            :title="`#${b.step} ${b.cap} · ${fmtDuration(b.elapsed)}`"
            @click="selectStep(b.step)"
          >#{{ b.step }}</button>
        </div>
        <div ref="filmEl" class="tl-flow">
          <button
            v-for="(f, i) in nodeCols"
            :key="f.step"
            type="button"
            class="tl-node"
            :class="{
              active: f.step === activeStep,
              hover: f.step === hoverStep,
              bad: statusClass(f.status) === 'bad',
              limit: isLimit && i === nodeCols.length - 1,
            }"
            :title="`#${f.step} ${f.cap} · ${fmtDuration(f.elapsed)}`"
            @mouseenter="hoverStep = f.step"
            @mouseleave="hoverStep = null"
            @click="onFilmClick(f, $event)"
          >
            <div class="tl-shot" @click="onNodeThumbClick(f, $event)">
              <img v-if="f.hasThumb" :src="thumbSrc(f.thumb)" alt="" />
              <span v-else class="node-empty">无截图</span>
            </div>
            <div class="tl-meta">
              <span class="node-idx">#{{ f.step }}</span>
              <span class="node-cap" :title="f.cap">{{ f.cap }}</span>
              <span class="node-ms">{{ fmtDuration(f.elapsed) }}</span>
            </div>
          </button>
        </div>
      </template>
    </div>

    <section v-if="runId || steps.length" class="et-log-block">
      <div class="et-log-head">步骤明细</div>
      <div ref="scrollEl" class="et-timeline">
      <div v-if="!steps.length" class="et-empty">暂无步骤（运行中会实时出现，或该 run 无明细）</div>
      <div
        v-for="s in steps"
        :key="s.step"
        class="et-step"
        :class="{ active: s.step === activeStep }"
        :data-step="s.step"
        @click="selectStep(s.step)"
      >
        <div class="et-idx">#{{ s.step }}</div>
        <button
          v-if="isValidThumb(s.thumb)"
          type="button"
          class="et-thumb-btn"
          title="点击放大"
          @click="onStepThumbClick(s, $event)"
        >
          <img :src="thumbSrc(s.thumb)" class="et-thumb" alt="" />
        </button>
        <div v-else class="et-thumb placeholder" title="该步骤无可用截图">无截图</div>
        <div class="et-body">
          <div class="et-head">
            <span v-if="s.status" class="et-badge" :class="statusClass(s.status)">{{ statusText(s.status) }}</span>
            <span v-if="s.result_status && s.result_status !== s.status" class="et-badge" :class="statusClass(s.result_status)">{{ statusText(s.result_status) }}</span>
            <span class="et-cap">{{ s.cap || '' }}<span v-if="s.executor" class="et-via">via {{ s.executor }}</span></span>
            <span class="et-ms">{{ fmtDuration(s.elapsed) }}</span>
          </div>
          <div v-if="s.action" class="et-actline">
            <span class="et-act-label">动作</span>
            <code>{{ fmtAction(s.action) }}</code>
          </div>
          <div v-if="s.thought" class="et-thought">{{ s.thought }}</div>
          <div v-if="s.summary" class="et-summary">{{ s.summary }}</div>
        </div>
      </div>
    </div>
    </section>

    <Teleport to="body">
      <div v-if="lightboxSrc" class="et-lightbox" @click.self="closeLightbox">
        <button type="button" class="et-lightbox-close" aria-label="关闭" @click="closeLightbox">×</button>
        <img :src="lightboxSrc" alt="screenshot" class="et-lightbox-img" @click.stop />
        <p v-if="lightboxMeta" class="et-lightbox-meta">{{ lightboxMeta }}</p>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>


.et-wrap { display: flex; flex-direction: column; height: 100%; min-height: 0; width: 100%; gap: 10px; box-sizing: border-box; overflow: hidden; }
.et-case {
  flex: 0 1 auto;
  min-height: 88px;
  max-height: 34%;
  width: 100%;
  box-sizing: border-box;
  overflow: auto;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  background: #fff;
}
.case-spec-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  font-size: 12px;
}
.case-spec-table th {
  background: #eefbe9;
  color: #111827;
  font-weight: 700;
  text-align: center;
  padding: 8px 10px;
  border: 1px solid #d1d5db;
  white-space: nowrap;
}
.case-spec-table td {
  background: #fff;
  color: #111827;
  vertical-align: top;
  padding: 8px 10px;
  border: 1px solid #d1d5db;
  word-break: break-word;
  line-height: 1.5;
}
.case-spec-table th:nth-child(1),
.case-spec-table td:nth-child(1) { width: 64px; text-align: center; }
.case-spec-table th:nth-child(2),
.case-spec-table td:nth-child(2) { width: 88px; }
.case-spec-table th:nth-child(3),
.case-spec-table td:nth-child(3) { width: 18%; }
.case-spec-table td.col-multi { min-width: 0; }
.et-verdict {
  flex-shrink: 0;
  width: 100%;
  box-sizing: border-box;
  padding: 12px 14px;
  border-radius: 10px;
  border: 1px solid #e5e7eb;
  background: #f8fafc;
}
.et-verdict.ok { background: #ecfdf5; border-color: #6ee7b7; }
.et-verdict.bad { background: #fef2f2; border-color: #fca5a5; }
.et-verdict.warn { background: #fffbeb; border-color: #fcd34d; }
.et-verdict.limit { background: #f5f3ff; border-color: #c4b5fd; }
.et-verdict-kicker {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
}
.et-verdict-tag {
  font-size: 13px;
  font-weight: 800;
  color: #111827;
}
.et-verdict.ok .et-verdict-tag { color: #047857; }
.et-verdict.bad .et-verdict-tag { color: #b91c1c; }
.et-verdict.warn .et-verdict-tag { color: #b45309; }
.et-verdict.limit .et-verdict-tag { color: #6d28d9; }
.et-limit-pill {
  font-size: 11px;
  font-weight: 700;
  color: #6d28d9;
  background: #ede9fe;
  padding: 1px 8px;
  border-radius: 999px;
}
.et-verdict-ms { font-size: 12px; color: #64748b; margin-left: auto; }
.et-verdict-body {
  margin: 0;
  font-size: 13px;
  line-height: 1.65;
  color: #374151;
  white-space: pre-wrap;
  word-break: break-word;
}
.et-goal {
  padding: 10px 12px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  display: flex;
  gap: 8px;
  align-items: flex-start;
  flex-shrink: 0;
  width: 100%;
  box-sizing: border-box;
}
.et-goal-label { font-size: 12px; color: #6b7280; flex-shrink: 0; padding-top: 2px; }
.et-goal-text { font-size: 13px; font-weight: 600; color: #111827; line-height: 1.5; min-width: 0; }

.film-block {
  position: relative;
  flex: 0 1 auto;
  min-height: 0;
  width: 100%;
  padding: 10px 12px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  overflow: auto;
  box-sizing: border-box;
}
.film-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.film-head strong { font-size: 12px; color: #374151; }
.film-total { font-size: 11px; color: #94a3b8; }
.film-empty {
  font-size: 12px;
  color: #94a3b8;
  padding: 8px 0;
  text-align: center;
}
.film-axis {
  position: relative;
  height: 16px;
  margin: 0 2px 4px;
}
.film-axis-mark {
  position: absolute;
  top: 0;
  transform: translateX(-50%);
  font-size: 10px;
  color: #94a3b8;
  white-space: nowrap;
}
.film-axis-mark:first-child { transform: translateX(0); }
.film-axis-mark:last-child { transform: translateX(-100%); }
.film-waterfall {
  position: relative;
  height: 28px;
  margin: 0 2px 10px;
  border-radius: 8px;
  background: #eef2ff;
  overflow: hidden;
}
.wf-seg {
  position: absolute;
  top: 4px;
  height: 20px;
  border: none;
  border-radius: 4px;
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  line-height: 20px;
  padding: 0 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
  box-sizing: border-box;
}
.wf-seg.active {
  box-shadow: 0 0 0 2px #111827;
  z-index: 1;
}
.wf-seg.bad { filter: saturate(1.1); }
.wf-seg.limit { outline: 1px solid #7c3aed; }
.tl-flow {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  overflow-x: auto;
  overflow-y: hidden;
  padding: 4px 2px 8px;
  width: 100%;
  scroll-behavior: smooth;
}
.tl-node {
  flex: 0 0 112px;
  width: 112px;
  min-width: 112px;
  max-width: 112px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  border: 2px solid #e5e7eb;
  border-radius: 10px;
  background: #f8fafc;
  cursor: pointer;
  text-align: left;
  box-sizing: border-box;
}
.tl-node:hover,
.tl-node.hover { border-color: #a5b4fc; }
.tl-node.active {
  border-color: #4f46e5;
  background: #eef2ff;
  box-shadow: 0 0 0 2px rgba(79, 70, 229, 0.18);
}
.tl-node.bad { border-color: #fca5a5; }
.tl-node.bad.active { border-color: #ef4444; background: #fef2f2; }
.tl-node.limit { border-color: #c4b5fd; }
.tl-node.limit.active { border-color: #7c3aed; background: #f5f3ff; }
.tl-shot {
  width: 96px;
  height: 171px;
  flex-shrink: 0;
  border-radius: 8px;
  overflow: hidden;
  background: #0f172a;
  cursor: zoom-in;
}
.tl-shot img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.tl-meta {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 4px;
  min-width: 0;
  min-height: 36px;
  flex-shrink: 0;
}
.node-idx { font-size: 11px; font-weight: 800; color: #4f46e5; flex-shrink: 0; }
.node-cap {
  font-size: 11px;
  color: #334155;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}
.node-ms {
  font-size: 10px;
  font-weight: 700;
  color: #64748b;
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}
.node-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  font-size: 11px;
  color: #94a3b8;
  cursor: default;
}

.et-log-block {
  flex: 1 1 240px;
  min-height: 240px;
  display: flex;
  flex-direction: column;
  min-width: 0;
  width: 100%;
  overflow: hidden;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  box-sizing: border-box;
}
.et-log-head {
  flex-shrink: 0;
  padding: 8px 12px;
  font-size: 12px;
  font-weight: 700;
  color: #374151;
  border-bottom: 1px solid #e5e7eb;
  background: #f8fafc;
}
.et-timeline {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  width: 100%;
  padding: 8px 10px;
  box-sizing: border-box;
}
.et-empty { color: #9ca3af; font-size: 13px; padding: 24px; text-align: center; }
.et-step {
  display: flex;
  gap: 10px;
  padding: 10px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  margin-bottom: 10px;
  cursor: pointer;
  width: 100%;
  box-sizing: border-box;
}
.et-step.active { border-color: #a5b4fc; box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.12); }
.et-idx { font-size: 12px; color: #9ca3af; font-weight: 600; min-width: 26px; }
.et-thumb-btn {
  padding: 0;
  border: none;
  background: transparent;
  cursor: zoom-in;
  align-self: flex-start;
  border-radius: 6px;
  overflow: hidden;
  width: 72px;
  flex-shrink: 0;
}
.et-thumb {
  width: 72px;
  aspect-ratio: 9 / 16;
  border-radius: 6px;
  border: 1px solid #e5e7eb;
  display: block;
  object-fit: contain;
  background: #0f172a;
}
.et-thumb.placeholder {
  width: 72px;
  aspect-ratio: 9 / 16;
  height: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  color: #94a3b8;
  background: #f8fafc;
  box-sizing: border-box;
}
.et-body { flex: 1; min-width: 0; }
.et-head { display: flex; gap: 8px; align-items: center; margin-bottom: 4px; flex-wrap: wrap; }
.et-cap { font-size: 13px; font-weight: 600; color: #1f2937; font-family: ui-monospace, monospace; }
.et-via { color: #9ca3af; font-weight: 400; margin-left: 6px; font-size: 12px; }
.et-badge { font-size: 11px; padding: 1px 8px; border-radius: 10px; background: #e5e7eb; color: #4b5563; flex-shrink: 0; }
.et-badge.ok { background: #dcfce7; color: #166534; }
.et-badge.bad { background: #fee2e2; color: #991b1b; }
.et-badge.warn { background: #fef3c7; color: #92400e; }
.et-badge.limit { background: #ede9fe; color: #6d28d9; }
.et-ms {
  font-size: 11px;
  font-weight: 600;
  color: #64748b;
  margin-left: auto;
  font-variant-numeric: tabular-nums;
  background: #f1f5f9;
  padding: 1px 8px;
  border-radius: 999px;
}
.et-actline {
  margin-top: 4px;
  font-size: 12px;
  color: #374151;
  display: flex;
  gap: 8px;
  align-items: baseline;
  flex-wrap: wrap;
}
.et-act-label {
  font-size: 11px;
  font-weight: 600;
  color: #64748b;
  background: #f1f5f9;
  padding: 1px 6px;
  border-radius: 4px;
  flex-shrink: 0;
}
.et-actline code {
  font-family: ui-monospace, monospace;
  color: #1d4ed8;
  word-break: break-all;
  font-size: 12px;
}
.et-thought { font-size: 13px; color: #374151; line-height: 1.6; white-space: pre-wrap; margin-top: 6px; }
.et-summary { margin-top: 3px; font-size: 12px; color: #6b7280; }
.et-final { text-align: center; padding: 12px; border-radius: 8px; font-weight: 600; }
.et-final.ok { background: #dcfce7; color: #166534; }
.et-final.bad { background: #fee2e2; color: #991b1b; }
.et-final.warn { background: #fef3c7; color: #92400e; }
</style>

<style>
/* lightbox 挂到 body，不能 scoped */
.et-lightbox {
  position: fixed;
  inset: 0;
  z-index: 4000;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 32px;
  background: rgba(15, 23, 42, 0.72);
  backdrop-filter: blur(6px);
  box-sizing: border-box;
}
.et-lightbox-close {
  position: absolute;
  top: 16px;
  right: 20px;
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
  font-size: 24px;
  line-height: 1;
  cursor: pointer;
}
.et-lightbox-close:hover { background: rgba(255, 255, 255, 0.28); }
.et-lightbox-img {
  max-width: min(92vw, 420px);
  max-height: min(82vh, 860px);
  width: auto;
  height: auto;
  object-fit: contain;
  border-radius: 12px;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.45);
  background: #0f172a;
}
.et-lightbox-meta {
  margin: 0;
  color: rgba(255, 255, 255, 0.85);
  font-size: 13px;
}
</style>
