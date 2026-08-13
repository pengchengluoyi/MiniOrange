<script setup>
/**
 * 统一执行时间线：实时(WS agent_step) 与 历史回放(/agent/steps 或 trace event_results) 同一组件。
 * agent 模式步骤含缩略图/思考/坐标；plan 模式(trace event_results)无截图，只显事件+结果——字段自适应。
 *
 * props:
 *   runId  选中的 run（形如 cr-xxx::app-001）
 *   live   是否订阅 WS 实时更新（运行中为 true）
 */
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { addMessageListener, removeMessageListener } from '@/api/mWebSocket'
import { getAgentSteps, getCaseRunnerTraceDetail } from '@/api/caseRunner'

const props = defineProps({
  runId: { type: String, default: '' },
  live: { type: Boolean, default: false },
})

const goal = ref('')
const checkpoints = ref([])
const steps = ref([])          // 归一化步骤：{step,thought,status,action,thumb,result_status,summary,elapsed,cap,executor}
const overall = ref('')
const finished = ref(false)
const finalSummary = ref('')
const failureLabel = ref('')
const scrollEl = ref(null)

function reset() {
  goal.value = ''; checkpoints.value = []; steps.value = []
  overall.value = ''; finished.value = false; finalSummary.value = ''; failureLabel.value = ''
}

function upsert(stepNo, patch) {
  let s = steps.value.find(x => x.step === stepNo)
  if (!s) { s = { step: stepNo }; steps.value.push(s); steps.value.sort((a, b) => a.step - b.step) }
  Object.assign(s, patch)
}

// agent_step 事件（实时/回放共用）
function applyAgentEvent(d) {
  if (!d) return
  if (d.phase === 'start') { goal.value = d.goal || goal.value; checkpoints.value = d.checkpoints || checkpoints.value }
  else if (d.phase === 'step') upsert(d.step, { thought: d.thought, status: d.status, action: d.action, thumb: d.thumb, cap: d.action?.capability_id })
  else if (d.phase === 'result') upsert(d.step, { result_status: d.result_status, summary: d.summary })
  else if (d.phase === 'done') { overall.value = d.overall || ''; finished.value = true; if (d.summary) finalSummary.value = d.summary; if (d.failure_label) failureLabel.value = d.failure_label }
}

// plan 模式 trace 的 event_results → 归一化
function applyPlanEvents(evs) {
  (evs || []).forEach((e, i) => {
    upsert(e.seq ?? i + 1, {
      cap: e.capability_id, executor: e.executor_used,
      result_status: e.status, status: e.status,
      summary: e.summary || e.error, elapsed: e.elapsed_ms,
      thought: e.ai_reasoning || '',
      action: e.plan_event ? { capability_id: e.capability_id, params: e.plan_event.params } : null,
    })
  })
}

async function backfill(runId) {
  if (!runId) return
  // 1) 优先 agent 步骤（含缩略图/思考）
  try {
    const res = await getAgentSteps(runId)
    const evs = res?.data?.events || []
    if (evs.length) { evs.forEach(applyAgentEvent); scrollBottom(); return }
  } catch (_) { /* 非 agent run / 未缓冲 */ }
  // 2) 回退 plan 模式 trace 明细
  try {
    const res = await getCaseRunnerTraceDetail(runId)
    const d = res?.data || {}
    goal.value = goal.value || d.case_id || runId
    overall.value = d.overall_status || ''
    finished.value = true
    const evs = d.event_results || d.events || []
    applyPlanEvents(Array.isArray(evs) ? evs : [])
    scrollBottom()
  } catch (_) { /* 无 trace */ }
}

const onWs = (res) => {
  if (!props.live || !res) return
  const type = res.type || res.action
  if (type !== 'agent_step') return
  const d = res.data || {}
  if (d.run_id !== props.runId) return
  applyAgentEvent(d)
  scrollBottom()
}

function scrollBottom() {
  nextTick(() => { if (scrollEl.value) scrollEl.value.scrollTop = scrollEl.value.scrollHeight })
}

watch(() => props.runId, (id) => { reset(); backfill(id) })
onMounted(() => { addMessageListener(onWs); if (props.runId) backfill(props.runId) })
onUnmounted(() => removeMessageListener(onWs))

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
  const kv = Object.keys(p).filter(k => k !== 'text' || true).map(k => `${k}=${p[k]}`).join(', ')
  return `${a.capability_id}(${kv})`
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

    <div ref="scrollEl" class="et-timeline">
      <div v-if="!steps.length" class="et-empty">暂无步骤（运行中会实时出现，或该 run 无明细）</div>
      <div v-for="s in steps" :key="s.step" class="et-step">
        <div class="et-idx">#{{ s.step }}</div>
        <img v-if="s.thumb" :src="`data:image/jpeg;base64,${s.thumb}`" class="et-thumb" alt="" />
        <div class="et-body">
          <div class="et-head">
            <span class="et-cap">{{ s.cap || '' }}<span v-if="s.executor" class="et-via">via {{ s.executor }}</span></span>
            <span v-if="s.status" class="et-badge" :class="statusClass(s.status)">{{ statusText(s.status) }}</span>
            <span v-if="s.result_status && s.result_status !== s.status" class="et-badge" :class="statusClass(s.result_status)">{{ statusText(s.result_status) }}</span>
            <span v-if="s.elapsed" class="et-ms">{{ s.elapsed }}ms</span>
          </div>
          <div v-if="s.thought" class="et-thought">{{ s.thought }}</div>
          <div v-if="s.action" class="et-actline">▶ {{ fmtAction(s.action) }}</div>
          <div v-if="s.summary" class="et-summary">{{ s.summary }}</div>
        </div>
      </div>
      <div v-if="finished" class="et-final" :class="statusClass(overall)">
        执行结束：{{ statusText(overall) }}<span v-if="finalSummary"> — {{ finalSummary }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.et-wrap { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.et-goal { padding: 10px 12px; background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; margin-bottom: 10px; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.et-goal-label { font-size: 12px; color: #6b7280; }
.et-goal-text { font-size: 14px; font-weight: 600; color: #111827; }
.et-cp { font-size: 12px; background: #f3f4f6; color: #4b5563; padding: 1px 8px; border-radius: 10px; }
.et-timeline { flex: 1; overflow-y: auto; min-height: 0; }
.et-empty { color: #9ca3af; font-size: 13px; padding: 24px; text-align: center; }
.et-step { display: flex; gap: 10px; padding: 10px; background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; margin-bottom: 10px; }
.et-idx { font-size: 12px; color: #9ca3af; font-weight: 600; min-width: 26px; }
.et-thumb { width: 104px; border-radius: 6px; border: 1px solid #e5e7eb; align-self: flex-start; }
.et-body { flex: 1; min-width: 0; }
.et-head { display: flex; gap: 8px; align-items: center; margin-bottom: 4px; flex-wrap: wrap; }
.et-cap { font-size: 13px; font-weight: 600; color: #1f2937; font-family: ui-monospace, monospace; }
.et-via { color: #9ca3af; font-weight: 400; margin-left: 6px; font-size: 12px; }
.et-badge { font-size: 11px; padding: 1px 8px; border-radius: 10px; background: #e5e7eb; color: #4b5563; }
.et-badge.ok { background: #dcfce7; color: #166534; }
.et-badge.bad { background: #fee2e2; color: #991b1b; }
.et-badge.warn { background: #fef3c7; color: #92400e; }
.et-ms { font-size: 11px; color: #9ca3af; }
.et-thought { font-size: 13px; color: #374151; line-height: 1.6; white-space: pre-wrap; }
.et-actline { margin-top: 4px; font-size: 13px; color: #2563eb; font-family: ui-monospace, monospace; word-break: break-all; }
.et-summary { margin-top: 3px; font-size: 12px; color: #6b7280; }
.et-final { text-align: center; padding: 12px; border-radius: 8px; font-weight: 600; }
.et-final.ok { background: #dcfce7; color: #166534; }
.et-final.bad { background: #fee2e2; color: #991b1b; }
.et-final.warn { background: #fef3c7; color: #92400e; }
</style>
