<script setup>
/**
 * 统一执行时间线：胶片轴（悬停放大 + 点击灯箱）+ 默认展开的步骤列表。
 */
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { addMessageListener, removeMessageListener } from '@/api/mWebSocket'
import { getAgentSteps, getCaseRunnerTraceDetail } from '@/api/caseRunner'
import { getBaseUrl } from '@/utils/config'

const props = defineProps({
  runId: { type: String, default: '' },
  live: { type: Boolean, default: false },
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

function reset() {
  goal.value = ''; checkpoints.value = []; steps.value = []
  overall.value = ''; finished.value = false; finalSummary.value = ''; failureLabel.value = ''
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
  else if (d.phase === 'done') { overall.value = d.overall || ''; finished.value = true; if (d.summary) finalSummary.value = d.summary; if (d.failure_label) failureLabel.value = d.failure_label }
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

/** 把用例总时长中未记账的部分摊给 0ms 步骤（尤其历史 assert_goal） */
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
    goal.value = goal.value || d.case_id || runId
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
    if (!activeStep.value && steps.value.length) {
      const withThumb = [...steps.value].reverse().find((s) => isValidThumb(s.thumb))
      activeStep.value = (withThumb || steps.value[steps.value.length - 1]).step
    }
    scrollBottom()
    scrollFilmToActive()
  } catch (_) {
    fillMissingElapsed(caseElapsed)
    if (usedAgent) {
      if (!activeStep.value && steps.value.length) activeStep.value = steps.value[steps.value.length - 1].step
      scrollBottom()
      scrollFilmToActive()
    }
  }
}

const onWs = (res) => {
  if (!props.live || !res) return
  const type = res.type || res.action
  if (type !== 'agent_step') return
  const d = res.data || {}
  if (d.run_id !== props.runId) return
  applyAgentEvent(d)
  scrollBottom()
  scrollFilmToActive()
}

function scrollBottom() {
  nextTick(() => { if (scrollEl.value) scrollEl.value.scrollTop = scrollEl.value.scrollHeight })
}

function scrollFilmToActive() {
  nextTick(() => {
    const el = filmEl.value?.querySelector('.film-frame.active')
    el?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
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

const statusText = (s) => ({
  continue: '决策', done: '完成', give_up: '放弃', ask_human: '请求人工',
  pass: '成功', fail: '失败', blocked: '阻塞', skipped: '跳过', declined: '拒绝',
}[s] || s || '')
const statusClass = (s) => {
  if (['done', 'pass'].includes(s)) return 'ok'
  if (['give_up', 'fail', 'declined'].includes(s)) return 'bad'
  if (['ask_human', 'blocked'].includes(s)) return 'warn'
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
const framesWithThumb = computed(() => filmFrames.value.filter((f) => isValidThumb(f.thumb)))

const waterfallBars = computed(() => {
  const total = totalMs.value
  return filmFrames.value.map((f, i) => {
    const rawW = total > 0 ? (f.elapsed / total) * 100 : 0
    const widthPct = f.elapsed <= 0 ? 0.4 : Math.max(rawW, 0.7)
    return {
      ...f,
      leftPct: (f.at / total) * 100,
      widthPct,
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

const selectStep = (stepNo) => {
  activeStep.value = stepNo
  nextTick(() => {
    const el = scrollEl.value?.querySelector(`[data-step="${stepNo}"]`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
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
  openLightbox(f.thumb, `#${f.step} · ${f.cap} · ${fmtDuration(f.elapsed)}`)
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
    <div v-if="goal" class="et-goal">
      <span class="et-goal-label">目标</span>
      <span class="et-goal-text">{{ goal }}</span>
      <span v-for="cp in checkpoints" :key="cp.id" class="et-cp">{{ cp.description }}</span>
    </div>

    <div class="film-block">
      <div class="film-head">
        <strong>时间轴</strong>
        <span v-if="totalMs > 0" class="film-total">合计 {{ fmtDuration(totalMs) }}</span>
      </div>
      <div v-if="!steps.length" class="film-empty">
        暂无步骤时间线
      </div>
      <template v-else>
        <div class="film-axis">
          <span v-for="(m, i) in axisMarks" :key="i" class="film-mark" :style="{ left: m.pct + '%' }">{{ m.label }}</span>
        </div>

        <!-- 水瀑：每个方法在公共时间轴上的耗时条（按能力类型分色） -->
        <div class="film-waterfall" role="img" :aria-label="`方法耗时水瀑，合计 ${fmtDuration(totalMs)}`">
          <button
            v-for="b in waterfallBars"
            :key="'w-' + b.step"
            type="button"
            class="wf-bar"
            :class="{ on: b.step === activeStep || b.step === hoverStep }"
            :style="{ left: b.leftPct + '%', width: b.widthPct + '%', background: b.color }"
            :title="`#${b.step} ${b.cap} · ${fmtDuration(b.elapsed)} · 起点 ${fmtDuration(b.at)}`"
            @mouseenter="hoverStep = b.step"
            @mouseleave="hoverStep = null"
            @click="selectStep(b.step)"
          >
            <span class="wf-label">#{{ b.step }}</span>
          </button>
        </div>

        <!-- 胶片：紧凑横滑，不再按时间绝对定位（避免大块空白） -->
        <div v-if="framesWithThumb.length" ref="filmEl" class="film-strip">
          <button
            v-for="f in framesWithThumb"
            :key="f.step"
            type="button"
            class="film-frame"
            :class="{ active: f.step === activeStep, hover: f.step === hoverStep }"
            :title="`#${f.step} · 耗时 ${fmtDuration(f.elapsed)} · 起点 ${fmtDuration(f.at)}`"
            @mouseenter="hoverStep = f.step"
            @mouseleave="hoverStep = null"
            @click="onFilmClick(f, $event)"
          >
            <img :src="thumbSrc(f.thumb)" alt="" />
            <span class="film-idx">#{{ f.step }}</span>
            <span class="film-ms">{{ fmtDuration(f.elapsed) }}</span>
          </button>
        </div>
        <div v-else class="film-empty soft">
          本用例暂无屏幕快照
          <small>历史任务若执行时未落库缩略图，需重新跑一轮才能看到画面</small>
        </div>
      </template>
    </div>

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
      <div v-if="finished" class="et-final" :class="statusClass(overall)">
        执行结束：{{ statusText(overall) }}<span v-if="finalSummary"> — {{ finalSummary }}</span>
      </div>
    </div>

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
.et-wrap { display: flex; flex-direction: column; height: 100%; min-height: 0; width: 100%; gap: 10px; box-sizing: border-box; }
.et-goal { padding: 10px 12px; background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; flex-shrink: 0; width: 100%; box-sizing: border-box; }
.et-goal-label { font-size: 12px; color: #6b7280; }
.et-goal-text { font-size: 14px; font-weight: 600; color: #111827; }
.et-cp { font-size: 12px; background: #f3f4f6; color: #4b5563; padding: 1px 8px; border-radius: 10px; }

.film-block {
  position: relative;
  flex-shrink: 0;
  width: 100%;
  padding: 10px 12px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  overflow: visible;
  box-sizing: border-box;
}
.film-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.film-head strong { font-size: 12px; color: #374151; }
.film-total { font-size: 11px; color: #94a3b8; }
.film-empty {
  font-size: 12px;
  color: #94a3b8;
  padding: 8px 0;
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.film-empty.soft { padding: 6px 0 2px; }
.film-empty small { font-size: 11px; color: #cbd5e1; }
.film-axis {
  position: relative;
  height: 16px;
  margin-bottom: 4px;
  border-bottom: 1px solid #e5e7eb;
}
.film-mark {
  position: absolute;
  top: 0;
  transform: translateX(-50%);
  font-size: 10px;
  color: #94a3b8;
  white-space: nowrap;
}
.film-waterfall {
  position: relative;
  height: 28px;
  margin: 0 0 8px;
  border-radius: 6px;
  background:
    repeating-linear-gradient(
      to right,
      transparent,
      transparent calc(10% - 1px),
      #f1f5f9 calc(10% - 1px),
      #f1f5f9 10%
    ),
    #f8fafc;
  border: 1px solid #eef2f7;
  overflow: hidden;
  width: 100%;
}
.wf-bar {
  position: absolute;
  top: 4px;
  bottom: 4px;
  min-width: 3px;
  padding: 0 2px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  transition: filter 0.12s ease, box-shadow 0.12s ease;
}
.wf-bar.on,
.wf-bar:hover {
  filter: brightness(1.08);
  box-shadow: 0 0 0 2px rgba(79, 70, 229, 0.35);
  z-index: 2;
}
.wf-label {
  font-size: 9px;
  font-weight: 700;
  color: #fff;
  text-shadow: 0 1px 1px rgba(0,0,0,0.25);
  pointer-events: none;
  overflow: hidden;
  white-space: nowrap;
}
.film-strip {
  display: flex;
  gap: 8px;
  align-items: flex-end;
  overflow-x: auto;
  overflow-y: hidden;
  padding: 10px 4px 6px;
  min-height: 0;
  width: 100%;
  box-sizing: border-box;
}
.film-frame {
  position: relative;
  flex: 0 0 auto;
  width: 52px;
  padding: 0;
  border: 2px solid #e5e7eb;
  border-radius: 8px;
  background: #f8fafc;
  cursor: zoom-in;
  overflow: visible;
  z-index: 1;
  transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
}
.film-frame img {
  display: block;
  width: 100%;
  height: 80px;
  object-fit: cover;
  border-radius: 6px;
}
.film-frame:hover,
.film-frame.hover {
  transform: scale(1.45);
  z-index: 6;
  border-color: #6366f1;
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.18);
}
.film-frame.active {
  border-color: #4f46e5;
  box-shadow: 0 0 0 2px rgba(79, 70, 229, 0.25);
  z-index: 3;
}
.film-frame.active:hover,
.film-frame.active.hover {
  z-index: 7;
}
.film-idx {
  position: absolute;
  left: 4px;
  bottom: 4px;
  font-size: 10px;
  font-weight: 700;
  color: #fff;
  background: rgba(15, 23, 42, 0.55);
  padding: 0 4px;
  border-radius: 4px;
  pointer-events: none;
}
.film-ms {
  position: absolute;
  right: 3px;
  top: 3px;
  font-size: 9px;
  font-weight: 700;
  color: #fff;
  background: rgba(79, 70, 229, 0.75);
  padding: 0 4px;
  border-radius: 4px;
  pointer-events: none;
}

.et-timeline { flex: 1; overflow-y: auto; min-height: 0; width: 100%; }
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
  transition: transform 0.15s ease;
}
.et-thumb-btn:hover { transform: scale(1.06); }
.et-thumb { width: 104px; border-radius: 6px; border: 1px solid #e5e7eb; display: block; object-fit: cover; }
.et-thumb.placeholder {
  width: 104px;
  height: 72px;
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
  max-width: min(92vw, 520px);
  max-height: min(82vh, 900px);
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
