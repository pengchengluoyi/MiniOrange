<script setup>
import { computed, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import '@/views/Settings/settings-ui.css'
import QaFlowPipeline from '@/views/Testing/QaFlowPipeline.vue'
import QaEnvLinkMap from '@/views/Testing/QaEnvLinkMap.vue'
import {
  DISPATCH_RUNS,
  ENV_PROFILES,
  STEP_KINDS,
  cloneWorkflow,
  defaultWorkflow,
  envGapsForWorkflow,
  envLabel,
  kindMeta,
  leaveLabel,
  makeStep,
  validateWorkflow,
} from '@/utils/qaWorkflow'

const props = defineProps({
  workflow: { type: Object, default: null },
  requirements: { type: Array, default: () => [] },
  releases: { type: Array, default: () => [] },
  saving: { type: Boolean, default: false },
  envSummaries: { type: Array, default: () => [] },
})

const emit = defineEmits(['save', 'go-env'])

const envNameList = computed(() => (props.envSummaries || []).map((s) => ({ key: s.key, label: s.label })))
const pipelineEnvKeys = computed(() => {
  const list = props.envSummaries || []
  const pipe = list.filter((s) => s.inPipeline).map((s) => s.key)
  if (pipe.length) return pipe
  const filled = list.filter((s) => s.filled).map((s) => s.key)
  return filled.length ? filled : list.map((s) => s.key)
})
const envChoices = computed(() => {
  const list = props.envSummaries || []
  if (!list.length) {
    return ENV_PROFILES.map((key) => ({ key, label: envLabel(key), filled: true }))
  }
  return list.map((s) => ({
    key: s.key,
    label: s.filled ? s.label : `${s.label}（未填渠道）`,
    filled: s.filled,
  }))
})
const knownEnvKeys = computed(() => new Set(envChoices.value.map((e) => e.key)))
const envOf = (key) => (props.envSummaries || []).find((s) => s.key === key) || null

const draft = ref(cloneWorkflow(props.workflow || defaultWorkflow({
  envKeys: pipelineEnvKeys.value,
  environments: envNameList.value,
})))
const envGaps = computed(() => envGapsForWorkflow(draft.value, pipelineEnvKeys.value, envNameList.value))
const addKind = ref({ req: 'checkpoint', rel: 'checkpoint' })
const selectedId = ref({
  req: draft.value.tracks.req.steps[0]?.id || '',
  rel: draft.value.tracks.rel.steps[0]?.id || '',
})
const dirty = ref(false)

watch(() => props.workflow, (wf) => {
  if (dirty.value) return
  draft.value = cloneWorkflow(wf)
  selectedId.value = {
    req: selectedId.value.req && draft.value.tracks.req.steps.some((s) => s.id === selectedId.value.req)
      ? selectedId.value.req
      : (draft.value.tracks.req.steps[0]?.id || ''),
    rel: selectedId.value.rel && draft.value.tracks.rel.steps.some((s) => s.id === selectedId.value.rel)
      ? selectedId.value.rel
      : (draft.value.tracks.rel.steps[0]?.id || ''),
  }
}, { deep: true })

const runOptions = Object.entries(DISPATCH_RUNS).map(([id, meta]) => ({ id, label: meta.label }))

const selectedReqStep = computed(() => {
  const steps = draft.value.tracks.req.steps
  return steps.find((s) => s.id === selectedId.value.req) || steps[0] || null
})
const selectedRelStep = computed(() => {
  const steps = draft.value.tracks.rel.steps
  return steps.find((s) => s.id === selectedId.value.rel) || steps[0] || null
})
const selectedOf = (track) => (track === 'req' ? selectedReqStep.value : selectedRelStep.value)
const selectedIndex = (track) => draft.value.tracks[track].steps.findIndex((s) => s.id === selectedId.value[track])

const markDirty = () => { dirty.value = true }

const setTrackLabel = (track, value) => {
  draft.value.tracks[track].label = value
  markDirty()
}

const setStepField = (track, key, value) => {
  const idx = selectedIndex(track)
  const step = draft.value.tracks[track].steps[idx]
  if (!step) return
  step[key] = value
  if (key === 'kind') {
    if (value === 'dispatch') {
      const fallback = track === 'rel' ? 'release_regression' : 'req_test'
      if (!DISPATCH_RUNS[step.run]) step.run = fallback
      if (!knownEnvKeys.value.has(step.env)) step.env = DISPATCH_RUNS[step.run]?.defaultEnv || pipelineEnvKeys.value[0] || 'test'
      step.auto_advance = Boolean(step.auto_advance)
    } else {
      delete step.run
      delete step.env
      delete step.auto_advance
    }
  }
  if (key === 'run' && DISPATCH_RUNS[value] && !knownEnvKeys.value.has(step.env)) {
    step.env = knownEnvKeys.value.has(DISPATCH_RUNS[value].defaultEnv)
      ? DISPATCH_RUNS[value].defaultEnv
      : (pipelineEnvKeys.value[0] || 'test')
  }
  markDirty()
}

const moveStep = (track, dir) => {
  const steps = draft.value.tracks[track].steps
  const idx = selectedIndex(track)
  const j = idx + dir
  if (idx < 0 || j < 0 || j >= steps.length) return
  const copy = [...steps]
  const [row] = copy.splice(idx, 1)
  copy.splice(j, 0, row)
  draft.value.tracks[track].steps = copy
  markDirty()
}

const removeSelected = (track) => {
  const idx = selectedIndex(track)
  const step = draft.value.tracks[track].steps[idx]
  if (!step) return
  if (draft.value.tracks[track].steps.length <= 2) {
    ElMessage.warning('每条轨至少 2 个阶段')
    return
  }
  const next = draft.value.tracks[track].steps.filter((_, i) => i !== idx)
  draft.value.tracks[track].steps = next
  selectedId.value[track] = next[Math.max(0, idx - 1)]?.id || ''
  markDirty()
}

const addStep = (track) => {
  const kind = addKind.value[track]
  const step = makeStep(kind, { track })
  draft.value.tracks[track].steps = [...draft.value.tracks[track].steps, step]
  selectedId.value[track] = step.id
  markDirty()
}

const restoreDefault = async () => {
  try {
    await ElMessageBox.confirm(
      pipelineEnvKeys.value.length
        ? `按上线顺序（${pipelineEnvKeys.value.map((k) => envLabel(k, envNameList.value)).join(' → ')}）生成？需求测试会覆盖每一套环境；版本测试纳入需求并回归历史功能。未保存的改名和增删会丢掉。`
        : '还没配上线顺序，会按测试 → 预发 → 正式生成。未保存的改名和增删会丢掉。',
      '恢复默认模板',
      { type: 'warning' },
    )
  } catch { return }
  draft.value = defaultWorkflow({
    envKeys: pipelineEnvKeys.value,
    environments: envNameList.value,
  })
  selectedId.value = {
    req: draft.value.tracks.req.steps[0]?.id || '',
    rel: draft.value.tracks.rel.steps[0]?.id || '',
  }
  markDirty()
}

const save = async () => {
  const check = validateWorkflow(draft.value)
  if (!check.ok) {
    ElMessage.warning(check.errors[0] || '流程模板不合法')
    return
  }
  emit('save', cloneWorkflow(draft.value))
  dirty.value = false
}

const howText = (step, track) => {
  if (!step) return ''
  if (step.kind === 'human_verdict') {
    return track === 'rel'
      ? '发版评审：只能判定通过 / 带风险发版 / 不发版，不能自动走进下一步。'
      : '测试验收：只能判定通过 / 带风险 / 退回重测，不能自动走进下一步。'
  }
  if (step.kind === 'dispatch' && step.auto_advance) return `任务跑完后自动走进下一阶段（${DISPATCH_RUNS[step.run]?.label || step.run} · ${envOf(step.env)?.label || envLabel(step.env)}）。`
  if (step.kind === 'dispatch') return `点「进入下一步」才走。下发 ${DISPATCH_RUNS[step.run]?.label || step.run} 到${envOf(step.env)?.label || envLabel(step.env)}环境。`
  const how = leaveLabel(step, track)
  return how ? `离开本阶段：${how}。` : '终点，不再往下走。'
}
</script>

<template>
  <div class="qa-flow-editor">
    <div class="flow-toolbar-row">
      <p class="flow-lead">
        需求测试：每个需求按上线顺序覆盖全部环境。
        版本测试：纳入本版需求，再回归历史功能，确认能发版。
      </p>
      <div class="flow-toolbar">
        <button type="button" class="settings-action-pill" @click="emit('go-env')">
          去改环境<span class="settings-action-arrow">→</span>
        </button>
        <button type="button" class="settings-action-pill" @click="restoreDefault">
          按上线顺序生成默认阶段<span class="settings-action-arrow">↺</span>
        </button>
        <el-button size="small" type="primary" :loading="saving" :disabled="!dirty" @click="save">保存模板</el-button>
      </div>
    </div>
    <QaEnvLinkMap :workflow="draft" :env-summaries="envSummaries" />
    <p v-if="envGaps.length" class="hint warn-line">
      {{ envGaps.map((g) => g.hint).join('；') }}。可改阶段环境，或按上线顺序生成默认阶段。
    </p>

    <section v-for="track in ['req', 'rel']" :key="track" class="settings-card flow-track">
      <header class="flow-col-head">
        <el-input
          :model-value="draft.tracks[track].label"
          size="small"
          @update:model-value="(v) => setTrackLabel(track, v)"
        />
        <span class="muted">{{ draft.tracks[track].steps.length }} 个阶段</span>
        <span class="track-hint">{{ track === 'req' ? '覆盖上线顺序里的每一套环境' : '纳入本版需求，回归历史功能' }}</span>
      </header>

      <QaFlowPipeline
        mode="edit"
        :track="track"
        :steps="draft.tracks[track].steps"
        :selected-id="selectedId[track]"
        :env-summaries="envSummaries"
        @select="(s) => { selectedId[track] = s.id }"
      />

      <div v-if="selectedOf(track)" class="flow-inspector">
        <div class="flow-inspector-head">
          <strong>{{ selectedOf(track).label }}</strong>
          <span class="muted">{{ kindMeta(selectedOf(track).kind).label }}</span>
          <el-button size="small" text :disabled="selectedIndex(track) <= 0" @click="moveStep(track, -1)">左移</el-button>
          <el-button
            size="small"
            text
            :disabled="selectedIndex(track) === draft.tracks[track].steps.length - 1"
            @click="moveStep(track, 1)"
          >右移</el-button>
          <el-button
            size="small"
            text
            type="danger"
            :disabled="draft.tracks[track].steps.length <= 2"
            :title="draft.tracks[track].steps.length <= 2 ? '至少 2 个阶段' : '删除'"
            @click="removeSelected(track)"
          >删除阶段</el-button>
        </div>
        <p class="how">{{ howText(selectedOf(track), track) }}</p>
        <div class="flow-grid">
          <label>
            阶段名称
            <el-input
              :model-value="selectedOf(track).label"
              size="small"
              @update:model-value="(v) => setStepField(track, 'label', v)"
            />
          </label>
          <label>
            这一步做什么
            <el-select
              :model-value="selectedOf(track).kind"
              size="small"
              @update:model-value="(v) => setStepField(track, 'kind', v)"
            >
              <el-option v-for="k in STEP_KINDS" :key="k.id" :label="k.label" :value="k.id" />
            </el-select>
          </label>
        </div>
        <label class="flow-hint">
          提示
          <el-input
            :model-value="selectedOf(track).hint"
            size="small"
            placeholder="停在这步时给测试看的说明"
            @update:model-value="(v) => setStepField(track, 'hint', v)"
          />
        </label>
        <div v-if="selectedOf(track).kind === 'dispatch'" class="flow-dispatch">
          <label>
            环境
            <el-select
              :model-value="selectedOf(track).env"
              size="small"
              @update:model-value="(v) => setStepField(track, 'env', v)"
            >
              <el-option v-for="env in envChoices" :key="env.key" :label="env.label" :value="env.key" />
            </el-select>
            <span v-if="envOf(selectedOf(track).env)" class="muted env-note">
              <template v-if="envOf(selectedOf(track).env).filled">
                下发时用：{{ envOf(selectedOf(track).env).channelText || envOf(selectedOf(track).env).preview }}
              </template>
              <template v-else>「{{ envOf(selectedOf(track).env).label }}」还没填渠道，下发会拉不起应用。</template>
            </span>
          </label>
          <label>
            下发种类
            <el-select
              :model-value="selectedOf(track).run"
              size="small"
              @update:model-value="(v) => setStepField(track, 'run', v)"
            >
              <el-option v-for="r in runOptions" :key="r.id" :label="r.label" :value="r.id" />
            </el-select>
          </label>
          <el-checkbox
            :model-value="Boolean(selectedOf(track).auto_advance)"
            @update:model-value="(v) => setStepField(track, 'auto_advance', v)"
          >任务结束后走进下一阶段</el-checkbox>
        </div>
      </div>

      <div class="flow-add">
        <el-select v-model="addKind[track]" size="small">
          <el-option v-for="k in STEP_KINDS" :key="k.id" :label="k.label" :value="k.id" />
        </el-select>
        <el-button size="small" @click="addStep(track)">在末尾加阶段</el-button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.qa-flow-editor {
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.qa-flow-editor .settings-info-card p {
  margin: 6px 0 0;
  font-size: 13px;
  color: #374151;
  line-height: 1.5;
}
.flow-toolbar {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
.flow-toolbar-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 12px;
}
.flow-lead {
  margin: 0;
  flex: 1;
  min-width: 220px;
  font-size: 13px;
  color: #374151;
  line-height: 1.5;
}
.track-hint {
  margin-left: auto;
  font-size: 12px;
  color: #6b7280;
}
.flow-track {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.flow-col-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.flow-col-head :deep(.el-input) { width: 220px; }
.muted { color: #6b7280; font-size: 12px; }
.warn-line { color: #b45309 !important; }
.env-note { margin-top: 4px; font-weight: 400; }
.how {
  margin: 0;
  padding: 8px 10px;
  border-radius: 10px;
  background: #eef2ff;
  color: #4338ca;
  font-size: 12px;
  line-height: 1.5;
}
.flow-inspector {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  border: 1px solid #e3e8f0;
  border-radius: 12px;
  background: #f8fafc;
}
.flow-inspector-head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.flow-inspector-head strong { font-size: 13px; color: #111827; }
.flow-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 10px;
}
.flow-grid label,
.flow-hint,
.flow-dispatch label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: #374151;
}
.flow-dispatch {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  align-items: center;
}
.flow-dispatch :deep(.el-checkbox) { grid-column: 1 / -1; }
.flow-add {
  display: flex;
  gap: 8px;
  align-items: center;
}
.flow-add :deep(.el-select) { width: 180px; }
@media (max-width: 720px) {
  .flow-grid,
  .flow-dispatch { grid-template-columns: minmax(0, 1fr); }
}
</style>
