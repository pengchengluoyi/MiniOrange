<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  runCaseRunner,
  listCaseRunnerRuns,
  getCaseRunnerRun,
  listCaseRunnerTraces,
  listCaseRunnerDevices,
} from '@/api/caseRunner'
import { getFeishuCasesCached } from '@/api/feishuRegression'
import { listAIProviders } from '@/api/settings'
import { getProjects } from '@/api/workReport'
import WorkShell from '@/layouts/WorkShell.vue'
import TaskDetailPane from '@/views/Testing/TaskDetailPane.vue'
import AppConfigPage from '@/views/Settings/AppConfigPage.vue'
import { filterExecutableDevices, formatDeviceOption } from '@/utils/testingDevices'
import {
  groupTracesIntoTasks,
  mergeTaskLists,
  normalizeMemoryRun,
  progressStatus,
  shortTaskId,
  statusLabel,
  statusTagType,
} from '@/utils/testingTasks'

const route = useRoute()
const router = useRouter()

const appId = computed(() => String(route.params.appId || ''))
const appName = computed(() => String(route.query.appName || '应用'))
const projectName = computed(() => String(route.query.projectName || ''))
const projectId = computed(() => String(route.query.projectId || ''))
/** 本地 tab / task：点击立刻切面；再与路由对齐 */
const tab = ref(route.query.tab === 'config' ? 'config' : 'tasks')
const selectedTaskId = ref(String(route.query.task || ''))
const configSection = computed(() => String(route.query.configSection || 'env'))

watch(
  () => route.query.tab,
  (t) => {
    tab.value = t === 'config' ? 'config' : 'tasks'
  },
)
watch(
  () => route.query.task,
  (t) => {
    selectedTaskId.value = String(t || '')
  },
)

const loading = ref(false)
const tasks = ref([])
const pollTimer = ref(null)
const projects = ref([])
/** 详情打开时默认折叠中间任务栏；用户可临时展开换任务 */
const taskRailOpen = ref(false)

const devices = ref([])
const providers = ref([])
const cases = ref([])
const casesLoading = ref(false)
const newRunVisible = ref(false)
const submitting = ref(false)
const runForm = ref({ sn: '', platform: 'android', use_persisted_baseline: true, use_cache: true, async_exec: true })
const selectedCaseIds = ref([])

const selectedTask = computed(() => tasks.value.find((t) => t.taskId === selectedTaskId.value) || null)
const hasDetail = computed(() => !!selectedTaskId.value && tab.value === 'tasks')
const showTaskRail = computed(() => tab.value === 'tasks' && (!hasDetail.value || taskRailOpen.value))

const currentProject = computed(() => projects.value.find((p) => p.id === projectId.value) || null)
const appsInProject = computed(() => currentProject.value?.apps || [])

const caseExecutionProvider = computed(() =>
  (providers.value || []).find((p) => p.configured && p.enabled !== false && p.case_execution_use === true) || null)
const caseExecutionModelLabel = computed(() => {
  const p = caseExecutionProvider.value
  return p ? `${p.name || p.id} · ${p.model || '默认模型'}` : '未配置（设置 → 密钥配置 → 大模型 Key）'
})
const selectedDevice = computed(() => devices.value.find((d) => d.sn === runForm.value.sn) || null)

const baseQuery = () => ({
  appName: appName.value,
  projectName: projectName.value,
  projectId: projectId.value,
})

const replaceQuery = (patch) => {
  const next = { ...route.query, ...patch }
  Object.keys(next).forEach((k) => {
    if (next[k] === undefined || next[k] === null || next[k] === '') delete next[k]
  })
  return router.replace({ name: 'TestingApp', params: { appId: appId.value }, query: next })
}

const goTestingHome = () => router.push({ name: 'TestingHome' })

const clearTask = () => {
  taskRailOpen.value = false
  selectedTaskId.value = ''
  tab.value = 'tasks'
  replaceQuery({ ...baseQuery(), tab: 'tasks', task: undefined })
}

const setTab = async (next) => {
  // 先改本地状态 → 主区立刻切换（不等路由）
  tab.value = next === 'config' ? 'config' : 'tasks'
  selectedTaskId.value = ''
  taskRailOpen.value = false
  const q = {
    appName: appName.value || undefined,
    projectName: projectName.value || undefined,
    projectId: projectId.value || undefined,
  }
  if (next === 'config') {
    q.tab = 'config'
    q.configSection = String(route.query.configSection || configSection.value || 'env')
  } else {
    q.tab = 'tasks'
  }
  Object.keys(q).forEach((k) => {
    if (q[k] === undefined || q[k] === null || q[k] === '') delete q[k]
  })
  try {
    await router.replace({ name: 'TestingApp', params: { appId: appId.value }, query: q })
  } catch (_) { /* ignore dup nav */ }
  // 防止并发 replaceQuery 把旧 tab/task 写回
  tab.value = next === 'config' ? 'config' : 'tasks'
  selectedTaskId.value = ''
}

const setConfigSection = (key) => {
  tab.value = 'config'
  replaceQuery({ ...baseQuery(), tab: 'config', configSection: key, task: undefined })
}

const selectTask = (task) => {
  if (!task?.taskId) return
  taskRailOpen.value = false
  tab.value = 'tasks'
  selectedTaskId.value = task.taskId
  replaceQuery({ ...baseQuery(), tab: 'tasks', task: task.taskId, configSection: undefined })
}

const toggleTaskRail = () => {
  taskRailOpen.value = !taskRailOpen.value
}

const taskRowClass = (row) => {
  const s = row.status
  if (s === 'running') return 'is-running'
  if (s === 'failed' || (row.failed > 0 && s !== 'running')) return 'is-failed'
  if (s === 'done' || s === 'pass') return 'is-done'
  return ''
}

const openApp = (app, project) => {
  router.push({
    name: 'TestingApp',
    params: { appId: app.id },
    query: {
      appName: app.name,
      projectName: project?.name || projectName.value,
      projectId: project?.id || projectId.value,
      tab: tab.value === 'config' ? 'config' : 'tasks',
      configSection: tab.value === 'config' ? (configSection.value || 'env') : undefined,
    },
  })
}

const onProjectChange = (pid) => {
  const project = projects.value.find((p) => p.id === pid)
  if (!project) return
  const first = (project.apps || [])[0]
  if (!first) {
    ElMessage.warning('该项目下暂无应用')
    return
  }
  openApp(first, project)
}

const onAppChange = (aid) => {
  const app = appsInProject.value.find((a) => a.id === aid)
  if (!app) return
  openApp(app, currentProject.value || { id: projectId.value, name: projectName.value })
}

const loadProjects = async () => {
  try {
    const res = await getProjects()
    projects.value = Array.isArray(res) ? res : (res?.data || [])
    // 深链缺 projectId 时从应用反查
    if (!projectId.value && appId.value) {
      for (const p of projects.value) {
        const hit = (p.apps || []).find((a) => a.id === appId.value)
        if (hit) {
          // 只补 project 字段，勿回写整份旧 query（避免覆盖用户刚点的 任务/配置）
          replaceQuery({
            projectId: p.id,
            projectName: p.name,
            appName: route.query.appName || hit.name,
          })
          break
        }
      }
    }
  } catch (_) {
    projects.value = []
  }
}

const loadTasks = async () => {
  if (!appId.value) return
  loading.value = true
  try {
    const [runsRes, tracesRes] = await Promise.all([
      listCaseRunnerRuns(50).catch(() => null),
      listCaseRunnerTraces({ limit: 80 }).catch(() => null),
    ])
    const memory = (runsRes?.data?.runs || [])
      .map(normalizeMemoryRun)
      .filter((t) => t && t.appId === appId.value)

    // 仅纳入本 App 用例集合内的 traces；用例未加载/为空时不回退成「全量 traces」
    const caseIdSet = new Set((cases.value || []).map((c) => c.case_id).filter(Boolean))
    const traces = caseIdSet.size
      ? (tracesRes?.data?.items || []).filter((t) => caseIdSet.has(t.case_id))
      : []
    const fromTraces = groupTracesIntoTasks(traces, { appId: appId.value })
    tasks.value = mergeTaskLists(memory, fromTraces)
  } finally {
    loading.value = false
  }
}

const loadDevices = async () => {
  try {
    const r = await listCaseRunnerDevices(true)
    devices.value = filterExecutableDevices(r?.data?.items || [])
    if (runForm.value.sn && !devices.value.some((d) => d.sn === runForm.value.sn)) {
      runForm.value.sn = ''
    }
  } catch (_) {
    devices.value = []
  }
}
const loadProviders = async () => {
  try {
    const r = await listAIProviders()
    providers.value = r?.data?.providers || []
  } catch (_) {
    providers.value = []
  }
}
const loadCases = async () => {
  if (!appId.value) return
  casesLoading.value = true
  try {
    const r = await getFeishuCasesCached(appId.value, false)
    cases.value = r?.data?.cases || []
  } catch (_) {
    cases.value = []
  } finally {
    casesLoading.value = false
  }
}

const openNewRun = async () => {
  newRunVisible.value = true
  await Promise.all([
    cases.value.length ? Promise.resolve() : loadCases(),
    loadDevices(),
  ])
}

const submitRun = async () => {
  if (!runForm.value.sn) { ElMessage.warning('请先选择在线设备'); return }
  if (!selectedCaseIds.value.length) { ElMessage.warning('请至少选择一条用例'); return }
  submitting.value = true
  try {
    const res = await runCaseRunner({
      app_id: appId.value,
      sn: runForm.value.sn,
      platform: runForm.value.platform,
      case_ids: selectedCaseIds.value,
      async_exec: runForm.value.async_exec,
      use_persisted_baseline: runForm.value.use_persisted_baseline,
      use_cache: runForm.value.use_cache,
      execution_mode: 'auto',
    })
    const batch = res?.data?.run_id
    if (!batch) { ElMessage.error('启动失败：未拿到 run_id'); return }
    newRunVisible.value = false
    ElMessage.success('已启动任务')
    await loadTasks()
    tab.value = 'tasks'
    selectedTaskId.value = batch
    replaceQuery({ ...baseQuery(), tab: 'tasks', task: batch })
  } catch (e) {
    ElMessage.error(`启动失败: ${e?.message || e}`)
  } finally {
    submitting.value = false
  }
}

const refreshLive = async () => {
  const running = tasks.value.filter((t) => t.status === 'running' && t.source === 'memory')
  if (!running.length) return
  try {
    await Promise.all(running.map(async (t) => {
      const r = await getCaseRunnerRun(t.taskId)
      const next = normalizeMemoryRun(r?.data)
      if (!next) return
      const idx = tasks.value.findIndex((x) => x.taskId === t.taskId)
      if (idx >= 0) tasks.value[idx] = next
    }))
  } catch (_) {}
}

onMounted(async () => {
  await Promise.all([loadCases(), loadProjects(), loadProviders()])
  await loadTasks()
  pollTimer.value = setInterval(refreshLive, 4000)
})

onUnmounted(() => {
  if (pollTimer.value) clearInterval(pollTimer.value)
})

watch(appId, async () => {
  tasks.value = []
  selectedCaseIds.value = []
  taskRailOpen.value = false
  selectedTaskId.value = String(route.query.task || '')
  tab.value = route.query.tab === 'config' ? 'config' : 'tasks'
  await loadCases()
  await loadTasks()
})

watch(selectedTaskId, (id) => {
  if (id) taskRailOpen.value = false
})
</script>

<template>
  <WorkShell mode="testing">
    <template #sidebar>
      <div class="side-label">当前应用</div>
      <div class="side-current">
        <strong>{{ appName }}</strong>
        <small>{{ projectName || '未命名项目' }}</small>
      </div>

      <div class="side-label">快捷</div>
      <nav class="side-actions" aria-label="应用快捷操作">
        <button
          type="button"
          class="side-action"
          :class="{ on: tab === 'tasks' }"
          @click.prevent.stop="setTab('tasks')"
        >
          任务
        </button>
        <button
          type="button"
          class="side-action"
          :class="{ on: tab === 'config' }"
          @click.prevent.stop="setTab('config')"
        >
          配置
        </button>
        <button type="button" class="side-action accent" @click.prevent.stop="openNewRun">新建执行</button>
      </nav>
    </template>

    <div class="testing-workspace">
      <header class="ws-top">
        <nav class="crumbs" aria-label="面包屑">
          <button type="button" class="crumb link" @click="goTestingHome">全部应用</button>
          <span class="sep">/</span>
          <el-select
            class="crumb-select"
            :model-value="projectId"
            placeholder="项目"
            size="small"
            filterable
            style="width: 140px"
            @change="onProjectChange"
          >
            <el-option v-for="p in projects" :key="p.id" :label="p.name" :value="p.id" />
          </el-select>
          <span class="sep">/</span>
          <el-select
            class="crumb-select"
            :model-value="appId"
            placeholder="应用"
            size="small"
            filterable
            style="width: 160px"
            @change="onAppChange"
          >
            <el-option v-for="a in appsInProject" :key="a.id" :label="a.name" :value="a.id" />
          </el-select>
          <template v-if="selectedTaskId && tab === 'tasks'">
            <span class="sep">/</span>
            <span class="crumb muted mono" :title="selectedTaskId">任务 {{ shortTaskId(selectedTaskId) }}</span>
          </template>
        </nav>

        <div class="ws-actions">
          <template v-if="tab === 'tasks'">
            <el-button text :loading="loading" @click="loadTasks">刷新</el-button>
            <el-button v-if="hasDetail" text @click="toggleTaskRail">
              {{ taskRailOpen ? '折叠任务列表' : '展开任务列表' }}
            </el-button>
            <el-button v-if="selectedTaskId" text @click="clearTask">收起详情</el-button>
          </template>
        </div>
      </header>

      <div
        v-if="tab === 'tasks'"
        class="ws-body"
        :class="{ 'with-detail': hasDetail, 'rail-open': showTaskRail && hasDetail }"
        v-loading="loading"
      >
        <aside v-if="showTaskRail" class="task-rail">
          <div class="rail-head">
            <strong>任务</strong>
            <span>{{ tasks.length }}</span>
          </div>
          <button
            v-for="row in tasks"
            :key="row.taskId"
            type="button"
            class="task-item"
            :class="[taskRowClass(row), { active: row.taskId === selectedTaskId, wide: !hasDetail }]"
            @click="selectTask(row)"
          >
            <div class="task-item-top">
              <el-tag :type="statusTagType(row.status)" size="small" effect="light" round>{{ statusLabel(row.status) }}</el-tag>
              <strong :title="row.taskId">{{ shortTaskId(row.taskId) }}</strong>
            </div>
            <div class="task-item-prog">
              <el-progress
                class="mini-progress"
                :percentage="row.progress"
                :stroke-width="5"
                :show-text="false"
                :status="progressStatus(row)"
              />
              <span class="rate">{{ row.completed }}/{{ row.total }}</span>
              <span class="time">{{ (row.startedAt || '').replace('T', ' ').slice(5, 16) || '—' }}</span>
            </div>
          </button>
          <el-empty v-if="!tasks.length && !loading" description="暂无任务" :image-size="48" />
        </aside>

        <section v-if="hasDetail" class="detail-pane">
          <TaskDetailPane
            :key="selectedTaskId"
            :task-id="selectedTaskId"
            :app-id="appId"
            :seed="selectedTask"
          />
        </section>
      </div>

      <div v-else class="ws-config">
        <AppConfigPage
          embedded
          :embed-app-id="appId"
          :embed-app-name="appName"
          :embed-project-id="projectId"
          :embed-project-name="projectName"
          :embed-section="configSection"
          @update:embed-section="setConfigSection"
        />
      </div>
    </div>

    <el-dialog v-model="newRunVisible" title="新建执行" width="560px" append-to-body>
      <div class="form">
        <div class="field">
          <label>设备（仅在线可执行）</label>
          <el-select v-model="runForm.sn" placeholder="选择在线设备" style="width:100%" filterable>
            <el-option
              v-for="d in devices"
              :key="d.sn"
              :label="formatDeviceOption(d)"
              :value="d.sn"
            />
          </el-select>
          <div v-if="!devices.length" class="hint warn">暂无在线 adb / ios / clawnode 设备，请到运行状态确认连接。</div>
          <div v-else-if="selectedDevice" class="hint">通道 {{ selectedDevice.execChannel }} · {{ selectedDevice.sn }}</div>
        </div>
        <div class="field">
          <label>执行模型</label>
          <div class="hint">{{ caseExecutionModelLabel }}</div>
        </div>
        <div class="field">
          <label>用例（可多选）</label>
          <div class="cases">
            <el-checkbox-group v-model="selectedCaseIds">
              <el-checkbox v-for="c in cases" :key="c.case_id" :value="c.case_id" class="case">
                {{ c.case_id }} · {{ c.name || c.title || '' }}
              </el-checkbox>
            </el-checkbox-group>
            <el-empty v-if="!cases.length && !casesLoading" description="未拉到用例，请先在配置 → 用例来源中抓取" :image-size="50" />
          </div>
        </div>
        <div class="field opts">
          <el-checkbox v-model="runForm.use_persisted_baseline">用历史 baseline</el-checkbox>
          <el-checkbox v-model="runForm.use_cache">用缓存用例</el-checkbox>
        </div>
      </div>
      <template #footer>
        <el-button @click="newRunVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" :disabled="!devices.length" @click="submitRun">▶ 启动</el-button>
      </template>
    </el-dialog>
  </WorkShell>
</template>

<style scoped>
.side-label {
  padding: 10px 8px 4px;
  font-size: 11px;
  font-weight: 700;
  color: #94a3b8;
}
.side-current {
  padding: 6px 10px 10px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.side-current strong { font-size: 13px; color: #111827; }
.side-current small { font-size: 11px; color: #94a3b8; }
.side-actions {
  position: relative;
  z-index: 40;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 0 4px 8px;
  pointer-events: auto;
  -webkit-app-region: no-drag;
  flex-shrink: 0;
}
.side-action {
  width: 100%;
  border: 1px solid transparent;
  border-radius: 10px;
  background: transparent;
  padding: 9px 12px;
  text-align: left;
  font-size: 13px;
  font-weight: 600;
  color: #374151;
  cursor: pointer;
  pointer-events: auto;
  -webkit-app-region: no-drag;
  position: relative;
  z-index: 41;
}
.side-action:hover { background: #f1f5f9; }
.side-action.on {
  background: #eef2ff;
  color: #4f46e5;
  border-color: #c7d2fe;
}
.side-action.accent {
  margin-top: 2px;
  background: #4f46e5;
  color: #fff;
  border-color: #4f46e5;
  font-weight: 700;
}
.side-action.accent:hover { background: #4338ca; }
.side-item {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: 8px 10px;
  border: none;
  border-radius: 10px;
  background: transparent;
  cursor: pointer;
  text-align: left;
  font-size: 13px;
  color: #374151;
}
.side-item:hover { background: #f1f5f9; }
.side-item.active { background: #eef2ff; color: #4f46e5; }
.side-item.task .row {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 6px;
}
.side-item.task strong { font-family: ui-monospace, monospace; font-size: 12px; }
.side-item.task small { font-size: 11px; color: #94a3b8; }
.side-empty { padding: 8px 10px; font-size: 12px; color: #94a3b8; }

.testing-workspace {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 14px 18px 16px;
  box-sizing: border-box;
  overflow: hidden;
}
.ws-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 12px;
  flex-shrink: 0;
}
.crumbs {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  font-size: 13px;
}
.crumb {
  border: none;
  background: transparent;
  padding: 0;
  font-size: 13px;
  font-weight: 600;
}
.crumb.link { color: #4f46e5; cursor: pointer; }
.crumb.muted { color: #6b7280; cursor: default; }
.crumb.mono { font-family: ui-monospace, monospace; }
.sep { color: #cbd5e1; }
.ws-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.ws-body {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
}
/* 选中任务后默认详情全宽；仅「展开任务列表」时并排窄轨 */
.ws-body.with-detail {
  grid-template-columns: 1fr;
}
.ws-body.with-detail.rail-open {
  grid-template-columns: 156px 1fr;
}
.task-rail {
  min-height: 0;
  overflow: auto;
  padding: 8px;
  border: 1px solid #e3e8f0;
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.04);
  width: 100%;
  box-sizing: border-box;
}
.ws-body:not(.with-detail) .task-rail {
  max-width: 520px;
}
.ws-body.with-detail.rail-open .task-rail {
  padding: 6px;
}
.ws-body.with-detail.rail-open .task-item {
  padding: 8px;
}
.ws-body.with-detail.rail-open .mini-progress {
  width: 40px;
}
.ws-body.with-detail.rail-open .time {
  display: none;
}
.rail-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 6px 10px;
  color: #6b7280;
  font-size: 12px;
}
.rail-head strong { color: #111827; font-size: 13px; }
.task-item {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  border: 1px solid transparent;
  border-left: 3px solid transparent;
  border-radius: 12px;
  background: transparent;
  cursor: pointer;
  text-align: left;
  margin-bottom: 6px;
}
.task-item:hover { background: #f8fafc; }
.task-item.active {
  background: #eff6ff;
  border-color: #bfdbfe;
}
.task-item.is-running {
  background: #ecfdf5;
  border-left-color: #34d399;
  animation: task-pulse 1.6s ease-in-out infinite;
}
.task-item.is-failed { border-left-color: #f87171; background: #fef2f2; }
.task-item.is-done { border-left-color: #34d399; }
.task-item.is-running.active { background: #d1fae5; border-color: #6ee7b7; }
@keyframes task-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(52, 211, 153, 0.28); }
  50% { box-shadow: 0 0 0 5px rgba(52, 211, 153, 0.1); }
}
.task-item.wide {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: flex-start;
  gap: 14px;
  width: 100%;
}
.task-item.wide .task-item-top {
  flex: 0 1 auto;
}
.task-item.wide .task-item-prog {
  flex: 0 0 auto;
  margin-left: 0;
}
.task-item-top {
  display: flex;
  justify-content: flex-start;
  gap: 8px;
  align-items: center;
}
.task-item-top strong {
  font-size: 13px;
  font-family: ui-monospace, monospace;
  color: #111827;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
.task-item-prog {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.mini-progress {
  width: 80px;
  flex-shrink: 0;
}
.rate, .time {
  font-size: 11px;
  color: #94a3b8;
  white-space: nowrap;
}
.rate { color: #6b7280; font-weight: 600; }
.detail-pane {
  min-width: 0;
  min-height: 0;
  width: 100%;
  overflow: auto;
  padding: 12px;
  border: 1px solid #e3e8f0;
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.04);
  box-sizing: border-box;
}
.ws-config {
  flex: 1;
  min-height: 0;
  width: 100%;
  overflow: auto;
  border: 1px solid #e3e8f0;
  border-radius: 16px;
  background: #fff;
  padding: 12px 14px;
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.04);
  box-sizing: border-box;
}
.form { display: flex; flex-direction: column; gap: 14px; }
.field label { display: block; font-size: 13px; color: #374151; margin-bottom: 6px; font-weight: 500; }
.hint { font-size: 12px; color: #6b7280; }
.hint.warn { color: #b45309; }
.cases { max-height: 240px; overflow-y: auto; border: 1px solid #eee; border-radius: 6px; padding: 8px; }
.case { display: block; margin: 0 0 6px; }
.opts { display: flex; gap: 16px; }
@media (max-width: 960px) {
  .ws-body.with-detail.rail-open { grid-template-columns: 1fr; }
  .task-item.wide { flex-direction: column; align-items: stretch; }
}
</style>
