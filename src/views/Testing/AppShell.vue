<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  runCaseRunner,
  listCaseRunnerDevices,
} from '@/api/caseRunner'
import { getFeishuCasesCached } from '@/api/feishuRegression'
import { getAppAutomationConfig, updateAppAutomationConfig } from '@/api/appAutomation'
import { listAIProviders } from '@/api/settings'
import { getProjects } from '@/api/workReport'
import WorkShell from '@/layouts/WorkShell.vue'
import TaskDetailPane from '@/views/Testing/TaskDetailPane.vue'
import AppConfigPage from '@/views/Settings/AppConfigPage.vue'
import KnowledgePanel from '@/views/Settings/KnowledgePanel.vue'
import FeishuRegressionPanel from '@/views/Settings/FeishuRegressionPanel.vue'
import { filterExecutableDevices, formatDeviceMeta, formatDeviceOption } from '@/utils/testingDevices'
import {
  casePlatformKind,
  devicePlatformKind,
  displayTaskStatus,
  filterTasks,
  parseBusyConflict,
  progressStatus,
  runTypeLabel,
  shortDeviceLabel,
  shortTaskId,
  sortTasksForList,
  statusLabel,
  statusTagType,
  taskCountLabel,
  taskProgressPct,
  taskTitle,
} from '@/utils/testingTasks'
import { fetchTaskDetail, fetchTasksForApp, useTestingTaskList } from '@/composables/useTestingTasks'
import { parseCaseIdQuery, suiteCaseIds } from '@/utils/caseLibrary'

const route = useRoute()
const router = useRouter()

const appId = computed(() => String(route.params.appId || ''))
const appName = computed(() => String(route.query.appName || '应用'))
const projectName = computed(() => String(route.query.projectName || ''))
const projectId = computed(() => String(route.query.projectId || ''))
const VALID_TABS = ['tasks', 'cases', 'knowledge', 'config']
const resolveTab = (t) => VALID_TABS.includes(t) ? t : 'tasks'
/** 本地 tab / task：点击立刻切面；再与路由对齐 */
const tab = ref(resolveTab(route.query.tab))
const selectedTaskId = ref(String(route.query.task || ''))
const configSection = computed(() => String(route.query.configSection || 'env'))

watch(
  () => route.query.tab,
  (t) => {
    tab.value = resolveTab(t)
  },
)
watch(
  () => route.query.task,
  (t) => {
    selectedTaskId.value = String(t || '')
  },
)

const loading = ref(false)
const { tasks, upsert } = useTestingTaskList(appId)
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
const suites = ref([])
const selectedSuiteId = ref('')

const selectedTask = computed(() => tasks.value.find((t) => t.taskId === selectedTaskId.value) || null)
const hasDetail = computed(() => !!selectedTaskId.value && tab.value === 'tasks')
const showTaskRail = computed(() => tab.value === 'tasks' && (!hasDetail.value || taskRailOpen.value))
const tabLabel = computed(() => ({ tasks: '任务', cases: '用例', knowledge: '知识', config: '配置' }[tab.value] || '任务'))

const currentProject = computed(() => projects.value.find((p) => p.id === projectId.value) || null)
const appsInProject = computed(() => currentProject.value?.apps || [])

const caseExecutionProvider = computed(() =>
  (providers.value || []).find((p) => p.configured && p.enabled !== false && p.case_execution_use === true) || null)
const caseExecutionModelLabel = computed(() => {
  const p = caseExecutionProvider.value
  return p ? `${p.name || p.id} · ${p.model || '默认模型'}` : '未配置（设置 → 密钥配置 → 大模型 Key）'
})
const selectedDevice = computed(() => devices.value.find((d) => d.sn === runForm.value.sn) || null)
const caseQuery = ref('')
const taskFilter = ref('all')
const taskDeviceFilter = ref('')
const taskWhen = ref('all')

const taskDeviceOptions = computed(() => {
  const set = new Set()
  for (const t of tasks.value) {
    if (t.sn) set.add(t.sn)
  }
  return [...set]
})

const visibleTasks = computed(() => sortTasksForList(filterTasks(tasks.value, {
  status: taskFilter.value,
  sn: taskDeviceFilter.value,
  when: taskWhen.value,
})))

const filteredCases = computed(() => {
  const q = caseQuery.value.trim().toLowerCase()
  if (!q) return cases.value
  return (cases.value || []).filter((c) => {
    const blob = `${c.case_id || ''} ${c.name || c.title || ''} ${c.platform || ''}`
    return blob.toLowerCase().includes(q)
  })
})

const selectedDeviceKind = computed(() => (
  selectedDevice.value ? devicePlatformKind(selectedDevice.value) : ''
))

const platformConflictCases = computed(() => {
  if (!selectedDeviceKind.value || !selectedCaseIds.value.length) return []
  const want = selectedDeviceKind.value
  return (cases.value || []).filter((c) => {
    if (!selectedCaseIds.value.includes(c.case_id)) return false
    const kind = casePlatformKind(c)
    return kind !== 'any' && kind !== want
  })
})

const canStartRun = computed(() => (
  Boolean(runForm.value.sn)
  && selectedCaseIds.value.length > 0
  && !selectedDevice.value?.busy_task_id
  && !platformConflictCases.value.length
))

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
  const resolved = resolveTab(next)
  // 先改本地状态 → 主区立刻切换（不等路由）
  tab.value = resolved
  selectedTaskId.value = ''
  taskRailOpen.value = false
  const q = {
    appName: appName.value || undefined,
    projectName: projectName.value || undefined,
    projectId: projectId.value || undefined,
    tab: resolved,
  }
  if (resolved === 'config') {
    q.configSection = String(route.query.configSection || configSection.value || 'env')
  }
  Object.keys(q).forEach((k) => {
    if (q[k] === undefined || q[k] === null || q[k] === '') delete q[k]
  })
  try {
    await router.replace({ name: 'TestingApp', params: { appId: appId.value }, query: q })
  } catch (_) { /* ignore dup nav */ }
  // 防止并发 replaceQuery 把旧 tab/task 写回
  tab.value = resolved
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

const onOpenTask = async (id) => {
  await loadTasks()
  selectTask({ taskId: id })
}

const toggleTaskRail = () => {
  taskRailOpen.value = !taskRailOpen.value
}

const taskRowClass = (row) => {
  const s = displayTaskStatus(row)
  if (s === 'running' || s === 'queued') return 'is-running'
  if (s === 'failed') return 'is-failed'
  if (s === 'partial_fail') return 'is-partial'
  if (s === 'cancelled') return 'is-cancelled'
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
      tab: tab.value,
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
    const caseIds = (cases.value || []).map((c) => c.case_id).filter(Boolean)
    const { tasks: next } = await fetchTasksForApp(appId.value, { caseIds })
    tasks.value = next
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

const loadSuites = async () => {
  if (!appId.value) return
  try {
    const r = await getAppAutomationConfig(appId.value)
    suites.value = r?.data?.automation?.suites || []
  } catch (_) {
    suites.value = []
  }
}

const applySuiteId = (id) => {
  selectedSuiteId.value = id || ''
  if (!id) return
  if (id === '__all__') {
    selectedCaseIds.value = (cases.value || []).map((c) => c.case_id).filter(Boolean)
    return
  }
  const s = suites.value.find((x) => x.id === id)
  if (!s) return
  selectedCaseIds.value = suiteCaseIds(s, cases.value)
}

const saveSuiteFromRun = async () => {
  if (!selectedCaseIds.value.length) {
    ElMessage.warning('请先勾选用例')
    return
  }
  try {
    const { value } = await ElMessageBox.prompt('套件名称', '存为套件', {
      confirmButtonText: '保存',
      inputValue: '',
      inputPattern: /\S/,
      inputErrorMessage: '请填写名称',
    })
    const name = String(value || '').trim()
    const next = [...suites.value]
    const hit = next.findIndex((s) => s.name === name)
    const row = {
      id: hit >= 0 ? next[hit].id : '',
      name,
      case_ids: [...selectedCaseIds.value],
      updated_at: new Date().toISOString(),
    }
    if (hit >= 0) next[hit] = { ...next[hit], ...row }
    else next.push(row)
    await updateAppAutomationConfig(appId.value, { suites: next })
    await loadSuites()
    const match = suites.value.find((s) => s.name === name)
    if (match) selectedSuiteId.value = match.id
    ElMessage.success('套件已保存')
  } catch (_) { /* cancel */ }
}

const consumeOpenRun = async () => {
  if (String(route.query.openRun || '') !== '1') return
  const ids = parseCaseIdQuery(route.query.caseIds)
  const suiteId = String(route.query.suite || '')
  tab.value = 'tasks'
  await Promise.all([
    cases.value.length ? Promise.resolve() : loadCases(),
    loadDevices(),
    loadSuites(),
  ])
  selectedSuiteId.value = ''
  selectedCaseIds.value = []
  newRunVisible.value = true
  if (suiteId && suites.value.some((s) => s.id === suiteId)) applySuiteId(suiteId)
  else if (ids.length) selectedCaseIds.value = ids
  replaceQuery({
    ...baseQuery(),
    tab: 'tasks',
    openRun: undefined,
    caseIds: undefined,
    suite: undefined,
  })
}

const openNewRun = async () => {
  selectedSuiteId.value = ''
  selectedCaseIds.value = []
  newRunVisible.value = true
  await Promise.all([
    cases.value.length ? Promise.resolve() : loadCases(),
    loadDevices(),
    loadSuites(),
  ])
}

const selectAllVisibleCases = () => {
  const ids = (filteredCases.value || []).map((c) => c.case_id).filter(Boolean)
  selectedCaseIds.value = [...new Set(ids)]
  selectedSuiteId.value = ''
}

const clearSelectedCases = () => {
  selectedCaseIds.value = []
  selectedSuiteId.value = ''
}

const submitRun = async () => {
  if (!runForm.value.sn) { ElMessage.warning('请先选择在线设备'); return }
  if (!selectedCaseIds.value.length) { ElMessage.warning('请至少选择一条用例'); return }
  if (platformConflictCases.value.length) {
    ElMessage.warning('所选用例与当前设备平台不一致')
    return
  }
  const busyDev = devices.value.find((d) => d.sn === runForm.value.sn && d.busy_task_id)
  if (busyDev) {
    ElMessage.warning(`设备占用中（任务 ${shortTaskId(busyDev.busy_task_id)}）`)
    return
  }
  submitting.value = true
  try {
    const picked = devices.value.find((d) => d.sn === runForm.value.sn)
    const ch = String(picked?.execChannel || picked?.device_type || '').toLowerCase()
    const platform = ch.includes('ios') ? 'ios' : (runForm.value.platform || 'android')
    const res = await runCaseRunner({
      app_id: appId.value,
      sn: runForm.value.sn,
      platform,
      case_ids: selectedCaseIds.value,
      async_exec: runForm.value.async_exec,
      use_persisted_baseline: runForm.value.use_persisted_baseline,
      use_cache: runForm.value.use_cache,
      execution_mode: 'auto',
      run_type: 'manual',
    })
    const batch = res?.data?.run_id || res?.data?.task_id
    if (!batch) { ElMessage.error('启动失败：未拿到 run_id'); return }
    newRunVisible.value = false
    ElMessage.success('已启动任务')
    await loadTasks()
    tab.value = 'tasks'
    selectedTaskId.value = batch
    replaceQuery({ ...baseQuery(), tab: 'tasks', task: batch })
  } catch (e) {
    const busy = parseBusyConflict(e)
    if (busy.isBusy) {
      ElMessage.warning(busy.message || '设备正在执行其他任务')
      if (busy.busyTaskId) {
        newRunVisible.value = false
        tab.value = 'tasks'
        selectedTaskId.value = busy.busyTaskId
        replaceQuery({ ...baseQuery(), tab: 'tasks', task: busy.busyTaskId })
      }
      return
    }
    ElMessage.error(`启动失败: ${e?.response?.data?.detail || e?.message || e}`)
  } finally {
    submitting.value = false
  }
}

const refreshLive = async () => {
  const running = tasks.value.filter((t) => t.status === 'running' || t.status === 'queued')
  if (!running.length) return
  try {
    await Promise.all(running.map(async (t) => {
      const next = await fetchTaskDetail(t.taskId, t)
      if (next) upsert(next)
    }))
  } catch (_) {}
}

onMounted(async () => {
  // Redirect legacy ?tab=config&configSection=regression → ?tab=cases
  if (route.query.tab === 'config' && route.query.configSection === 'regression') {
    tab.value = 'cases'
    replaceQuery({ ...baseQuery(), tab: 'cases', configSection: undefined })
  }
  await Promise.all([loadCases(), loadProjects(), loadProviders(), loadSuites()])
  await loadTasks()
  await consumeOpenRun()
  pollTimer.value = setInterval(refreshLive, 20000)
})

onUnmounted(() => {
  if (pollTimer.value) clearInterval(pollTimer.value)
})

watch(appId, async () => {
  tasks.value = []
  selectedCaseIds.value = []
  taskRailOpen.value = false
  selectedTaskId.value = String(route.query.task || '')
  tab.value = resolveTab(route.query.tab)
  await loadCases()
  await loadSuites()
  await loadTasks()
})

watch(selectedTaskId, (id) => {
  if (id) taskRailOpen.value = false
})

watch(() => route.query.openRun, (v) => {
  if (String(v || '') === '1') consumeOpenRun()
})

watch(() => runForm.value.sn, (sn) => {
  const picked = devices.value.find((d) => d.sn === sn)
  if (!picked) return
  const ch = String(picked.execChannel || picked.device_type || '').toLowerCase()
  runForm.value.platform = ch.includes('ios') ? 'ios' : 'android'
})
</script>

<template>
  <WorkShell mode="testing">
    <template #sidebar>
      <div class="side-current">
        <strong>{{ appName }}</strong>
        <small>{{ projectName || '未命名项目' }}</small>
      </div>

      <nav class="side-actions" aria-label="应用快捷操作">
        <button
          type="button"
          class="side-action"
          :class="{ on: tab === 'tasks' }"
          @click.prevent.stop="setTab('tasks')"
        >
          <span class="side-action-icon">📋</span>
          任务
        </button>
        <button
          type="button"
          class="side-action"
          :class="{ on: tab === 'cases' }"
          @click.prevent.stop="setTab('cases')"
        >
          <span class="side-action-icon">📖</span>
          用例
        </button>
        <button
          type="button"
          class="side-action"
          :class="{ on: tab === 'knowledge' }"
          @click.prevent.stop="setTab('knowledge')"
        >
          <span class="side-action-icon">💡</span>
          知识
        </button>
        <button
          type="button"
          class="side-action"
          :class="{ on: tab === 'config' }"
          @click.prevent.stop="setTab('config')"
        >
          <span class="side-action-icon">⚙️</span>
          配置
        </button>
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
          <span class="page-title">{{ tabLabel }}</span>
        </nav>

        <div class="ws-actions">
          <template v-if="tab === 'tasks'">
            <el-button v-if="hasDetail" text @click="toggleTaskRail">
              {{ taskRailOpen ? '折叠任务列表' : '展开任务列表' }}
            </el-button>
            <el-button v-if="selectedTaskId" text @click="clearTask">收起详情</el-button>
            <el-button v-if="hasDetail && !showTaskRail" type="primary" @click="openNewRun">新建执行</el-button>
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
            <div class="rail-head-title">
              <strong>任务</strong>
              <span>{{ visibleTasks.length }}{{ visibleTasks.length !== tasks.length ? ` / ${tasks.length}` : '' }}</span>
            </div>
            <div class="rail-head-actions">
              <el-button text size="small" :loading="loading" @click="loadTasks">刷新</el-button>
              <el-button type="primary" size="small" @click="openNewRun">新建执行</el-button>
            </div>
          </div>
          <div class="rail-filters">
            <el-select v-model="taskFilter" size="small" class="filter-item">
              <el-option label="全部状态" value="all" />
              <el-option label="进行中" value="running" />
              <el-option label="部分失败" value="partial_fail" />
              <el-option label="失败" value="failed" />
              <el-option label="已取消" value="cancelled" />
              <el-option label="已通过" value="done" />
            </el-select>
            <el-select v-model="taskDeviceFilter" size="small" clearable placeholder="设备" class="filter-item">
              <el-option
                v-for="sn in taskDeviceOptions"
                :key="sn"
                :label="shortDeviceLabel(sn)"
                :value="sn"
              />
            </el-select>
            <el-select v-model="taskWhen" size="small" class="filter-item">
              <el-option label="全部时间" value="all" />
              <el-option label="今天" value="today" />
              <el-option label="近 7 天" value="week" />
            </el-select>
          </div>
          <button
            v-for="row in visibleTasks"
            :key="row.taskId"
            type="button"
            class="task-item"
            :class="[taskRowClass(row), { active: row.taskId === selectedTaskId, wide: !hasDetail }]"
            @click="selectTask(row)"
          >
            <div class="task-item-top">
              <el-tag :type="statusTagType(row.status, row)" size="small" effect="light" round>{{ statusLabel(row.status, row) }}</el-tag>
              <strong :title="row.taskId">{{ taskTitle(row) }}</strong>
              <span v-if="!hasDetail && row.taskId" class="task-id">{{ shortTaskId(row.taskId) }}</span>
              <span v-if="row.runType && row.runType !== 'manual'" class="run-type">{{ runTypeLabel(row.runType) }}</span>
            </div>
            <div class="task-item-prog">
              <el-progress
                class="mini-progress"
                :percentage="taskProgressPct(row)"
                :stroke-width="5"
                :show-text="false"
                :status="progressStatus(row)"
              />
              <span class="rate">{{ taskCountLabel(row) }}</span>
              <span v-if="row.sn" class="dev">{{ shortDeviceLabel(row.sn) }}</span>
              <span class="time">{{ (row.startedAt || '').replace('T', ' ').slice(5, 16) || '—' }}</span>
            </div>
            <div v-if="row.error && !hasDetail" class="task-err">{{ row.error }}</div>
          </button>
          <el-empty v-if="!visibleTasks.length && !loading" :description="tasks.length ? '没有符合筛选的任务' : '暂无任务'" :image-size="48" />
        </aside>

        <section v-if="hasDetail" class="detail-pane">
          <TaskDetailPane
            :key="selectedTaskId"
            :task-id="selectedTaskId"
            :app-id="appId"
            :seed="selectedTask"
            @open-task="onOpenTask"
          />
        </section>
      </div>

      <div v-else-if="tab === 'cases'" class="ws-config">
        <FeishuRegressionPanel
          :app-id="appId"
          :app-name="appName"
          :project-id="projectId"
          :project-name="projectName"
        />
      </div>

      <div v-else-if="tab === 'knowledge'" class="ws-config">
        <KnowledgePanel embedded app-only :app-id="appId" :app-name="appName" />
      </div>

      <div v-else class="ws-config">
        <AppConfigPage
          embedded
          :embed-app-id="appId"
          :embed-app-name="appName"
          :embed-project-id="projectId"
          :embed-project-name="projectName"
          :embed-section="configSection"
          :hide-sections="['regression', 'logic', 'cases', 'feishu-legacy']"
          @update:embed-section="setConfigSection"
        />
      </div>
    </div>

    <el-dialog v-model="newRunVisible" title="新建执行" width="560px" append-to-body class="new-run-dialog">
      <div class="form">
        <div class="field">
          <label>设备（仅在线可执行）</label>
          <el-select
            v-model="runForm.sn"
            placeholder="选择在线设备"
            style="width:100%"
            filterable
            teleported
            popper-class="device-select-popper"
          >
            <el-option
              v-for="d in devices"
              :key="d.sn"
              :label="formatDeviceOption(d)"
              :value="d.sn"
              :disabled="Boolean(d.busy_task_id)"
            >
              <div class="dev-opt">
                <span class="dev-name">{{ formatDeviceOption(d) }}</span>
                <small>{{ formatDeviceMeta(d) }}</small>
              </div>
            </el-option>
          </el-select>
          <div v-if="!devices.length" class="hint warn">暂无在线设备。请到运行状态确认 USB / Wi‑Fi / ClawNode 连接。</div>
          <div v-else-if="selectedDevice?.busy_task_id" class="hint warn">
            该设备占用中（任务 {{ shortTaskId(selectedDevice.busy_task_id) }}）。
          </div>
          <div v-else-if="selectedDevice" class="hint">{{ formatDeviceMeta(selectedDevice) }}</div>
        </div>
        <div class="field">
          <div class="hint model-hint">将使用：{{ caseExecutionModelLabel }}</div>
        </div>
        <div class="field">
          <label>套件</label>
          <div class="suite-pick">
            <el-select
              :model-value="selectedSuiteId"
              placeholder="先选套件，或下面手勾"
              clearable
              style="width:100%"
              @change="applySuiteId"
            >
              <el-option
                v-for="s in suites"
                :key="s.id"
                :label="`${s.name}（${suiteCaseIds(s, cases).length}）`"
                :value="s.id"
              />
            </el-select>
            <el-button size="small" text :disabled="!selectedCaseIds.length" @click="saveSuiteFromRun">存为套件</el-button>
          </div>
          <p v-if="!suites.length" class="hint">还没有套件。勾选用例后可保存为「冒烟 / 模块回归」。</p>
        </div>
        <div class="field">
          <div class="case-head">
            <label>用例（可多选）{{ selectedCaseIds.length ? ` · 已选 ${selectedCaseIds.length}` : '' }}</label>
            <span class="case-head-actions">
              <el-button size="small" text @click="selectAllVisibleCases">全选当前列表</el-button>
              <el-button size="small" text :disabled="!selectedCaseIds.length" @click="clearSelectedCases">清空</el-button>
            </span>
          </div>
          <el-input
            v-if="cases.length > 8"
            v-model="caseQuery"
            size="small"
            clearable
            placeholder="搜索编号或名称"
            class="case-search"
          />
          <div class="cases">
            <el-checkbox-group v-model="selectedCaseIds">
              <el-checkbox v-for="c in filteredCases" :key="c.case_id" :value="c.case_id" class="case">
                {{ c.case_id }} · {{ c.name || c.title || '' }}
                <small v-if="c.platform" class="case-plat">{{ c.platform }}</small>
              </el-checkbox>
            </el-checkbox-group>
            <el-empty v-if="!cases.length && !casesLoading" description="未拉到用例，请先在配置 → 用例来源中抓取" :image-size="50" />
            <p v-else-if="caseQuery && !filteredCases.length" class="hint">没有匹配的用例</p>
          </div>
        </div>
        <p v-if="platformConflictCases.length" class="hint warn">
          已选 {{ platformConflictCases.length }} 条用例与当前设备平台不符
          （设备 {{ selectedDeviceKind === 'ios' ? 'iOS' : 'Android' }}）：
          {{ platformConflictCases.map((c) => c.case_id).slice(0, 4).join('、') }}{{ platformConflictCases.length > 4 ? '…' : '' }}。
          请换设备或取消这些用例后再启动。
        </p>
        <div class="field opts">
          <el-checkbox v-model="runForm.use_persisted_baseline">沿用上次成功路径</el-checkbox>
          <el-checkbox v-model="runForm.use_cache">不重新拉飞书表格</el-checkbox>
        </div>
      </div>
      <template #footer>
        <el-button @click="newRunVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" :disabled="!canStartRun" @click="submitRun">启动</el-button>
      </template>
    </el-dialog>
  </WorkShell>
</template>

<style scoped>
.side-current {
  padding: 12px 10px 10px;
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
  padding: 8px 12px;
  text-align: left;
  font-size: 13px;
  font-weight: 600;
  color: #374151;
  cursor: pointer;
  pointer-events: auto;
  -webkit-app-region: no-drag;
  position: relative;
  z-index: 41;
  display: flex;
  align-items: center;
  gap: 7px;
}
.side-action-icon {
  font-size: 14px;
  line-height: 1;
  flex-shrink: 0;
}
.side-action:hover { background: #f1f5f9; }
.side-action.on {
  background: #eef2ff;
  color: #4f46e5;
  border-color: #c7d2fe;
}
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
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: stretch;
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
.page-title {
  margin-left: 8px;
  font-size: 14px;
  font-weight: 700;
  color: #111827;
}
.ws-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.ws-body {
  flex: 1;
  min-width: 0;
  min-height: 0;
  width: 100%;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 12px;
}
/* 选中任务后默认详情全宽；仅「展开任务列表」时并排窄轨 */
.ws-body.with-detail {
  grid-template-columns: minmax(0, 1fr);
}
.ws-body.with-detail.rail-open {
  grid-template-columns: 200px minmax(0, 1fr);
}
.task-rail {
  min-height: 0;
  min-width: 0;
  overflow: auto;
  padding: 8px;
  border: 1px solid #e3e8f0;
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.04);
  width: 100%;
  box-sizing: border-box;
}
.ws-body.with-detail.rail-open .task-rail {
  padding: 6px;
}
.ws-body.with-detail.rail-open .task-item {
  padding: 8px;
}
.ws-body.with-detail.rail-open .mini-progress {
  width: 48px;
}
.ws-body.with-detail.rail-open .time {
  display: none;
}
.rail-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding: 4px 6px 8px;
  color: #6b7280;
  font-size: 12px;
  flex-wrap: wrap;
}
.rail-head-title {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.rail-head-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}
.rail-head strong { color: #111827; font-size: 15px; }
.rail-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 0 6px 10px;
}
.rail-filters .filter-item { width: 112px; }
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
.task-item.is-partial { border-left-color: #f59e0b; background: #fffbeb; }
.task-item.is-done { border-left-color: #34d399; background: #fff; }
.task-item.is-cancelled { border-left-color: #fbbf24; background: #fffbeb; }
.run-type {
  font-size: 10px;
  color: #64748b;
  background: #f1f5f9;
  padding: 0 6px;
  border-radius: 999px;
}
.task-err {
  font-size: 11px;
  color: #b91c1c;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.task-item.is-running.active { background: #d1fae5; border-color: #6ee7b7; }
@keyframes task-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(52, 211, 153, 0.28); }
  50% { box-shadow: 0 0 0 5px rgba(52, 211, 153, 0.1); }
}
.task-item.wide {
  display: grid;
  grid-template-columns: minmax(160px, max-content) minmax(180px, 1fr) auto;
  align-items: center;
  column-gap: 16px;
  row-gap: 6px;
  width: 100%;
}
.task-item.wide .task-item-top {
  min-width: 0;
}
.task-item.wide .task-item-prog {
  min-width: 0;
  width: 100%;
}
.task-item.wide .task-err {
  grid-column: 1 / -1;
  white-space: normal;
}
.task-item.wide .mini-progress {
  flex: 1;
  width: auto;
  min-width: 80px;
  max-width: none;
}
.task-item-top {
  display: flex;
  justify-content: flex-start;
  gap: 8px;
  align-items: center;
  min-width: 0;
  flex-wrap: wrap;
}
.task-item-top strong {
  font-size: 13px;
  font-family: inherit;
  font-weight: 650;
  color: #111827;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.task-id {
  font-size: 11px;
  font-family: ui-monospace, monospace;
  color: #94a3b8;
  flex-shrink: 0;
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
.rate, .time, .dev {
  font-size: 11px;
  color: #94a3b8;
  white-space: nowrap;
}
.rate { color: #6b7280; font-weight: 600; }
.dev { color: #64748b; }
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
  min-width: 0;
  width: 100%;
  overflow: auto;
  border: 1px solid #e3e8f0;
  border-radius: 16px;
  background: #fff;
  padding: 12px 16px;
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.04);
  box-sizing: border-box;
}
.form { display: flex; flex-direction: column; gap: 14px; }
.field label { display: block; font-size: 13px; color: #374151; margin-bottom: 6px; font-weight: 500; }
.hint { font-size: 12px; color: #6b7280; }
.hint.warn { color: #b45309; }
.model-hint { margin-top: -4px; }
.case-search { margin-bottom: 8px; }
.case-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}
.case-head label { margin-bottom: 0; }
.case-head-actions { display: flex; gap: 4px; flex-shrink: 0; }
.case-plat { margin-left: 6px; color: #94a3b8; font-size: 11px; }
.cases { max-height: 240px; overflow-y: auto; border: 1px solid #eee; border-radius: 6px; padding: 8px; }
.case { display: block; margin: 0 0 6px; }
.opts { display: flex; gap: 16px; flex-wrap: wrap; }
.suite-pick { display: flex; align-items: center; gap: 8px; }
@media (max-width: 960px) {
  .ws-body.with-detail.rail-open { grid-template-columns: minmax(0, 1fr); }
  .task-item.wide {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>

<style>
.device-select-popper .dev-opt {
  display: flex;
  flex-direction: column;
  gap: 2px;
  line-height: 1.3;
  padding: 2px 0;
}
.device-select-popper .dev-name { font-size: 13px; color: #111827; }
.device-select-popper .dev-opt small { font-size: 11px; color: #94a3b8; }
</style>
