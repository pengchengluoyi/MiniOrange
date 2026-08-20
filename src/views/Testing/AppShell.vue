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
import QaProcessPanel from '@/views/Testing/QaProcessPanel.vue'
import { filterExecutableDevices, formatDeviceMeta, formatDeviceTag } from '@/utils/testingDevices'
import {
  casePlatformKind,
  coverageLabel,
  devicePlatformKind,
  displayTaskStatus,
  filterTasks,
  formatTaskDevices,
  parseBusyConflict,
  progressStatus,
  runTypeLabel,
  shortDeviceLabel,
  shortTaskId,
  sortTasksForList,
  statusLabel,
  statusTagType,
  taskCountLabel,
  taskCoverage,
  taskProgressPct,
  taskSns,
  taskTitle,
} from '@/utils/testingTasks'
import { fetchTaskDetail, fetchTasksForApp, useTestingTaskList } from '@/composables/useTestingTasks'
import { envLabel } from '@/constants/envProfiles'
import { parseCaseIdQuery, suiteCaseIds } from '@/utils/caseLibrary'
import { slicePage, TABLE_PAGE_SIZES } from '@/utils/tablePage'
import '@/views/Settings/settings-ui.css'

const route = useRoute()
const router = useRouter()

const appId = computed(() => String(route.params.appId || ''))
const appName = computed(() => String(route.query.appName || '应用'))
const projectName = computed(() => String(route.query.projectName || ''))
const projectId = computed(() => String(route.query.projectId || ''))
const VALID_TABS = ['process', 'tasks', 'cases', 'knowledge', 'config']
const resolveTab = (t) => VALID_TABS.includes(t) ? t : 'tasks'
/** 本地 tab / task：点击立刻切面；再与路由对齐 */
const tab = ref(resolveTab(route.query.tab))
const selectedTaskId = ref(String(route.query.task || ''))
const configSection = computed(() => String(route.query.configSection || 'env'))
const resolveBoard = (b) => (b === 'req' || b === 'sch' ? b : 'rel')
const processBoard = ref(resolveBoard(route.query.board))
const processId = ref(String(route.query.pid || ''))
const processPanel = ref(null)
const runSeed = ref(null)

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
watch(
  () => route.query.pid,
  (id) => {
    processId.value = String(id || '')
  },
)
watch(
  () => route.query.board,
  (b) => {
    processBoard.value = resolveBoard(b)
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
const runForm = ref({ sns: [], coverage: 'once', platform: 'android', use_persisted_baseline: true, use_cache: true, async_exec: true })
const selectedCaseIds = ref([])
const suites = ref([])
const selectedSuiteId = ref('')

const selectedTask = computed(() => tasks.value.find((t) => t.taskId === selectedTaskId.value) || null)
const hasDetail = computed(() => !!selectedTaskId.value && tab.value === 'tasks')
const showTaskRail = computed(() => tab.value === 'tasks' && (!hasDetail.value || taskRailOpen.value))
const tabLabel = computed(() => ({ process: '流程', tasks: '任务', cases: '用例', knowledge: '知识', config: '配置' }[tab.value] || '任务'))
const runDialogTitle = computed(() => {
  const kind = runSeed.value?.kind
  if (kind === 'req_admit') return '下发提测冒烟'
  if (kind === 'req_test') return '下发功能测试'
  if (kind === 'release_regression') return '下发预发回归'
  if (kind === 'release_smoke') return '下发生产冒烟'
  return '新建执行'
})

const currentProject = computed(() => projects.value.find((p) => p.id === projectId.value) || null)
const appsInProject = computed(() => currentProject.value?.apps || [])

const caseExecutionProvider = computed(() =>
  (providers.value || []).find((p) => p.configured && p.enabled !== false && p.case_execution_use === true) || null)
const caseExecutionModelLabel = computed(() => {
  const p = caseExecutionProvider.value
  return p ? `${p.name || p.id} · ${p.model || '默认模型'}` : '未配置（设置 → 密钥配置 → 大模型 Key）'
})
const selectedDevices = computed(() =>
  (runForm.value.sns || []).map((sn) => devices.value.find((d) => d.sn === sn)).filter(Boolean),
)
const caseQuery = ref('')
const taskFilter = ref('all')
const taskDeviceFilter = ref('')
const taskWhen = ref('all')

const taskDeviceOptions = computed(() => {
  const set = new Set()
  for (const t of tasks.value) {
    for (const sn of taskSns(t)) set.add(sn)
  }
  return [...set]
})

const visibleTasks = computed(() => sortTasksForList(filterTasks(tasks.value, {
  status: taskFilter.value,
  sn: taskDeviceFilter.value,
  when: taskWhen.value,
})))
const taskPage = ref(1)
const taskPageSize = ref(20)
const pagedTasks = computed(() => slicePage(visibleTasks.value, taskPage.value, taskPageSize.value))
const runningTaskCount = computed(() =>
  tasks.value.filter((t) => ['running', 'queued'].includes(displayTaskStatus(t))).length,
)
const taskListPill = computed(() => {
  if (runningTaskCount.value) return `${runningTaskCount.value} 条进行中`
  return `${visibleTasks.value.length} 条任务`
})
const taskEmptyText = computed(() => (tasks.value.length ? '没有符合筛选的任务' : '暂无任务'))
const formatTaskTime = (row) => (row?.startedAt || '').replace('T', ' ').slice(5, 16) || '—'

const filteredCases = computed(() => {
  const q = caseQuery.value.trim().toLowerCase()
  if (!q) return cases.value
  return (cases.value || []).filter((c) => {
    const blob = `${c.case_id || ''} ${c.name || c.title || ''} ${c.platform || ''}`
    return blob.toLowerCase().includes(q)
  })
})

const selectedDeviceKinds = computed(() => {
  const set = new Set(selectedDevices.value.map((d) => devicePlatformKind(d)).filter(Boolean))
  return [...set]
})

const mixedSelectedPlatforms = computed(() => selectedDeviceKinds.value.length > 1)

const deviceOptionDisabled = (d) => {
  if (d.busy_task_id) return true
  if (!d.reserved_slot_id) return false
  return d.reserved_slot_id !== runSeed.value?.slotId
}

const reservedSelectedDevice = computed(() => selectedDevices.value.find((d) => (
  d.reserved_slot_id && d.reserved_slot_id !== runSeed.value?.slotId
)) || null)

const unitCount = computed(() => {
  const n = selectedCaseIds.value.length
  const m = runForm.value.sns.length
  if (!n || !m) return 0
  return runForm.value.coverage === 'per_device' && m > 1 ? n * m : n
})

const showCoveragePick = computed(() => runForm.value.sns.length >= 2)

const platformConflictCases = computed(() => {
  if (mixedSelectedPlatforms.value || selectedDeviceKinds.value.length !== 1) return []
  if (!selectedCaseIds.value.length) return []
  const want = selectedDeviceKinds.value[0]
  return (cases.value || []).filter((c) => {
    if (!selectedCaseIds.value.includes(c.case_id)) return false
    const kind = casePlatformKind(c)
    return kind !== 'any' && kind !== want
  })
})

const busySelectedDevice = computed(() => selectedDevices.value.find((d) => d.busy_task_id) || null)

const canStartRun = computed(() => (
  runForm.value.sns.length > 0
  && selectedCaseIds.value.length > 0
  && !busySelectedDevice.value
  && !reservedSelectedDevice.value
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

const onGoTab = (next) => {
  const raw = String(next || '')
  if (raw.startsWith('config')) {
    const section = raw.includes(':') ? raw.split(':')[1] : 'env'
    setConfigSection(section || 'env')
    return
  }
  setTab(raw)
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
  if (resolved === 'process') {
    q.board = processBoard.value
    q.pid = processId.value || undefined
    loadDevices()
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

const onProcessBoard = (v) => {
  processBoard.value = resolveBoard(v)
  replaceQuery({
    ...baseQuery(),
    tab: 'process',
    board: processBoard.value,
    pid: processId.value || undefined,
    task: undefined,
  })
}

const onProcessId = (id) => {
  processId.value = String(id || '')
  replaceQuery({
    ...baseQuery(),
    tab: 'process',
    board: processBoard.value,
    pid: processId.value || undefined,
    task: undefined,
  })
}

const onProcessDispatch = (seed) => {
  openNewRun(seed)
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
const taskTableRowClass = ({ row }) => {
  const bits = [taskRowClass(row)]
  if (row.taskId === selectedTaskId.value) bits.push('is-current')
  return bits.filter(Boolean).join(' ')
}

watch([taskFilter, taskDeviceFilter, taskWhen, () => visibleTasks.value.length], () => {
  taskPage.value = 1
})

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
    runForm.value.sns = (runForm.value.sns || []).filter((sn) => devices.value.some((d) => d.sn === sn))
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
  const sns = String(route.query.sns || '').split(',').filter(Boolean)
  selectedSuiteId.value = ''
  selectedCaseIds.value = []
  runSeed.value = ids.length || sns.length || route.query.kind
    ? {
        caseIds: ids,
        kind: String(route.query.kind || '') || undefined,
        slotId: String(route.query.slotId || '') || undefined,
        requirementId: String(route.query.requirementId || '') || undefined,
        releaseId: String(route.query.releaseId || '') || undefined,
        sns,
        envProfile: String(route.query.envProfile || '') || undefined,
      }
    : null
  newRunVisible.value = true
  if (suiteId && suites.value.some((s) => s.id === suiteId)) applySuiteId(suiteId)
  else if (ids.length) selectedCaseIds.value = ids
  if (sns.length) {
    const allowed = sns.filter((sn) => devices.value.some((d) => d.sn === sn))
    if (allowed.length) runForm.value.sns = allowed
  }
  replaceQuery({
    ...baseQuery(),
    tab: 'tasks',
    openRun: undefined,
    caseIds: undefined,
    suite: undefined,
    kind: undefined,
    slotId: undefined,
    requirementId: undefined,
    releaseId: undefined,
    sns: undefined,
    envProfile: undefined,
  })
}

const openNewRun = async (seed = null) => {
  const real = seed && Array.isArray(seed.caseIds) ? seed : null
  runSeed.value = real && real.caseIds.length ? real : null
  selectedSuiteId.value = ''
  selectedCaseIds.value = runSeed.value ? [...runSeed.value.caseIds] : []
  newRunVisible.value = true
  await Promise.all([
    cases.value.length ? Promise.resolve() : loadCases(),
    loadDevices(),
    loadSuites(),
  ])
  if (runSeed.value?.caseIds?.length) selectedCaseIds.value = [...runSeed.value.caseIds]
  if (runSeed.value?.sns?.length) {
    const allowed = runSeed.value.sns.filter((sn) => devices.value.some((d) => d.sn === sn))
    if (allowed.length) runForm.value.sns = allowed
  }
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
  if (!runForm.value.sns.length) { ElMessage.warning('请先选择在线设备'); return }
  if (!selectedCaseIds.value.length) { ElMessage.warning('请至少选择一条用例'); return }
  const busyDev = selectedDevices.value.find((d) => d.busy_task_id)
  if (busyDev) {
    ElMessage.warning(`设备占用中（任务 ${shortTaskId(busyDev.busy_task_id)}）`)
    return
  }
  const reservedDev = selectedDevices.value.find((d) => d.reserved_slot_id && d.reserved_slot_id !== runSeed.value?.slotId)
  if (reservedDev) {
    ElMessage.warning(`设备已被排期占用：${reservedDev.reserved_title || '其他窗口'} 至 ${String(reservedDev.reserved_until || '').replace('T', ' ').slice(5, 16)}`)
    return
  }
  submitting.value = true
  try {
    const kinds = selectedDeviceKinds.value
    const platform = kinds.length === 1
      ? kinds[0]
      : (kinds.length > 1 ? 'mixed' : (runForm.value.platform || 'android'))
    const coverage = runForm.value.sns.length > 1 ? runForm.value.coverage : 'once'
    const res = await runCaseRunner({
      app_id: appId.value,
      sn: runForm.value.sns[0],
      sns: runForm.value.sns,
      coverage,
      platform,
      case_ids: selectedCaseIds.value,
      async_exec: runForm.value.async_exec,
      use_persisted_baseline: runForm.value.use_persisted_baseline,
      use_cache: runForm.value.use_cache,
      execution_mode: 'auto',
      run_type: runSeed.value?.kind || 'manual',
      slot_id: runSeed.value?.slotId || '',
      requirement_id: runSeed.value?.requirementId || '',
      release_id: runSeed.value?.releaseId || '',
    })
    const batch = res?.data?.run_id || res?.data?.task_id
    if (!batch) { ElMessage.error('启动失败：未拿到 run_id'); return }
    newRunVisible.value = false
    if (runSeed.value && processPanel.value?.attachRun) {
      await processPanel.value.attachRun({
        requirementId: runSeed.value.requirementId,
        releaseId: runSeed.value.releaseId,
        kind: runSeed.value.kind,
        taskId: batch,
      })
      const seed = runSeed.value
      runSeed.value = null
      ElMessage.success('已下发，流程单已挂上该任务')
      await loadTasks()
      tab.value = 'process'
      if (seed.releaseId) {
        processBoard.value = 'rel'
        processId.value = seed.releaseId
      } else if (seed.requirementId) {
        processBoard.value = 'req'
        processId.value = seed.requirementId
      }
      replaceQuery({
        ...baseQuery(),
        tab: 'process',
        board: processBoard.value,
        pid: processId.value || undefined,
        task: undefined,
      })
      return
    }
    runSeed.value = null
    ElMessage.success('已启动任务')
    await loadTasks()
    tab.value = 'tasks'
    selectedTaskId.value = batch
    replaceQuery({ ...baseQuery(), tab: 'tasks', task: batch })
  } catch (e) {
    const busy = parseBusyConflict(e)
    if (busy.isReserved) {
      ElMessage.warning(`设备已被排期占用${busy.reservedTitle ? `：${busy.reservedTitle}` : ''}`)
      return
    }
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
  if (route.query.tab === 'config' && (route.query.configSection === 'regression' || route.query.configSection === 'icons')) {
    const nextTab = route.query.configSection === 'regression' ? 'cases' : 'config'
    tab.value = nextTab
    replaceQuery({ ...baseQuery(), tab: nextTab, configSection: nextTab === 'config' ? 'env' : undefined })
  }
  if (route.query.tab === 'process' && route.query.board === 'flow') {
    tab.value = 'config'
    processBoard.value = 'rel'
    replaceQuery({ ...baseQuery(), tab: 'config', configSection: 'flow', board: undefined })
  }
  await Promise.all([loadCases(), loadProjects(), loadProviders(), loadSuites(), loadDevices()])
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

watch(() => runForm.value.sns, (sns) => {
  if (!sns?.length) return
  if (sns.length < 2) runForm.value.coverage = 'once'
  const picked = devices.value.find((d) => d.sn === sns[0])
  if (!picked) return
  const ch = String(picked.execChannel || picked.device_type || '').toLowerCase()
  runForm.value.platform = ch.includes('ios') ? 'ios' : 'android'
}, { deep: true })

watch(newRunVisible, (open) => {
  if (!open && !submitting.value) runSeed.value = null
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
          :class="{ on: tab === 'process' }"
          @click.prevent.stop="setTab('process')"
        >
          <span class="side-action-icon">📌</span>
          流程
        </button>
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
          <template v-if="tab === 'tasks' && hasDetail">
            <el-button text @click="toggleTaskRail">
              {{ taskRailOpen ? '折叠任务列表' : '展开任务列表' }}
            </el-button>
            <el-button text @click="clearTask">收起详情</el-button>
            <el-button v-if="!showTaskRail" type="primary" @click="openNewRun">新建执行</el-button>
          </template>
        </div>
      </header>

      <div
        v-if="tab === 'tasks' && !hasDetail"
        class="ws-config fill"
        v-loading="loading"
      >
        <div class="settings-panel task-list-page">
          <header class="settings-page-header">
            <div>
              <h2 class="settings-page-title">任务列表</h2>
              <p class="settings-page-desc">按状态、设备、时间筛选执行记录，点击一行打开详情。</p>
            </div>
            <div
              class="settings-summary-pill"
              :style="runningTaskCount ? { background: '#ecfdf5', color: '#047857' } : undefined"
            >{{ taskListPill }}</div>
          </header>
          <section class="settings-table-card is-fill">
            <div class="col-head">
              <h3>全部任务</h3>
              <div class="col-actions">
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
                <el-button size="small" :loading="loading" @click="loadTasks">刷新</el-button>
                <el-button size="small" type="primary" @click="openNewRun">新建执行</el-button>
              </div>
            </div>
            <div class="table-wrap">
              <el-table
                :data="pagedTasks"
                border
                stripe
                size="small"
                height="100%"
                highlight-current-row
                :row-class-name="taskTableRowClass"
                :empty-text="taskEmptyText"
                @row-click="selectTask"
              >
                <el-table-column label="状态" width="96">
                  <template #default="{ row }">
                    <el-tag :type="statusTagType(row.status, row)" size="small" effect="light">{{ statusLabel(row.status, row) }}</el-tag>
                  </template>
                </el-table-column>
                <el-table-column label="任务" min-width="180" show-overflow-tooltip>
                  <template #default="{ row }">
                    <span class="task-name">{{ taskTitle(row) }}</span>
                    <span v-if="row.runType && row.runType !== 'manual'" class="run-type">{{ runTypeLabel(row.runType) }}</span>
                  </template>
                </el-table-column>
                <el-table-column label="编号" width="100" show-overflow-tooltip>
                  <template #default="{ row }">{{ shortTaskId(row.taskId) }}</template>
                </el-table-column>
                <el-table-column label="进度" width="160">
                  <template #default="{ row }">
                    <div class="task-prog-cell">
                      <el-progress
                        :percentage="taskProgressPct(row)"
                        :stroke-width="6"
                        :show-text="false"
                        :status="progressStatus(row)"
                      />
                      <span>{{ taskCountLabel(row) }}</span>
                    </div>
                  </template>
                </el-table-column>
                <el-table-column label="覆盖" width="72">
                  <template #default="{ row }">
                    {{ taskSns(row).length > 1 ? coverageLabel(taskCoverage(row)) : '—' }}
                  </template>
                </el-table-column>
                <el-table-column label="设备" width="140" show-overflow-tooltip>
                  <template #default="{ row }">{{ formatTaskDevices(row) || '—' }}</template>
                </el-table-column>
                <el-table-column label="时间" width="108">
                  <template #default="{ row }">{{ formatTaskTime(row) }}</template>
                </el-table-column>
                <el-table-column label="操作" width="72" fixed="right">
                  <template #default="{ row }">
                    <el-button link type="primary" size="small" @click.stop="selectTask(row)">查看</el-button>
                  </template>
                </el-table-column>
              </el-table>
            </div>
            <el-pagination
              class="settings-table-pager"
              background
              size="small"
              layout="total, sizes, prev, pager, next"
              :total="visibleTasks.length"
              :page-sizes="TABLE_PAGE_SIZES"
              v-model:page-size="taskPageSize"
              v-model:current-page="taskPage"
            />
          </section>
        </div>
      </div>

      <div
        v-else-if="tab === 'tasks'"
        class="ws-body with-detail"
        :class="{ 'rail-open': showTaskRail }"
        v-loading="loading"
      >
        <aside v-if="showTaskRail" class="task-rail">
          <div class="col-head compact">
            <h3>任务</h3>
            <div class="col-actions">
              <el-button text size="small" :loading="loading" @click="loadTasks">刷新</el-button>
              <el-button type="primary" size="small" @click="openNewRun">新建</el-button>
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
          <div class="table-wrap">
            <el-table
              :data="pagedTasks"
              border
              stripe
              size="small"
              height="100%"
              highlight-current-row
              :row-class-name="taskTableRowClass"
              :empty-text="taskEmptyText"
              @row-click="selectTask"
            >
              <el-table-column label="状态" width="80">
                <template #default="{ row }">
                  <el-tag :type="statusTagType(row.status, row)" size="small" effect="light">{{ statusLabel(row.status, row) }}</el-tag>
                </template>
              </el-table-column>
              <el-table-column label="任务" min-width="120" show-overflow-tooltip>
                <template #default="{ row }">{{ taskTitle(row) }}</template>
              </el-table-column>
            </el-table>
          </div>
          <el-pagination
            class="settings-table-pager compact"
            background
            size="small"
            layout="total, prev, pager, next"
            :total="visibleTasks.length"
            :page-size="taskPageSize"
            v-model:current-page="taskPage"
          />
        </aside>

        <section class="detail-pane">
          <TaskDetailPane
            :key="selectedTaskId"
            :task-id="selectedTaskId"
            :app-id="appId"
            :seed="selectedTask"
            @open-task="onOpenTask"
          />
        </section>
      </div>

      <div v-else-if="tab === 'process'" class="ws-config fill">
        <QaProcessPanel
          ref="processPanel"
          :app-id="appId"
          :app-name="appName"
          :cases="cases"
          :tasks="tasks"
          :suites="suites"
          :devices="devices"
          :project-id="projectId"
          :board="processBoard"
          :selected-id="processId"
          @update:board="onProcessBoard"
          @update:selected-id="onProcessId"
          @dispatch-run="onProcessDispatch"
          @open-task="onOpenTask"
          @go-tab="onGoTab"
        />
      </div>

      <div v-else-if="tab === 'cases'" class="ws-config fill">
        <FeishuRegressionPanel
          :app-id="appId"
          :app-name="appName"
          :project-id="projectId"
          :project-name="projectName"
        />
      </div>

      <div v-else-if="tab === 'knowledge'" class="ws-config fill">
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
          :hide-sections="['regression', 'logic', 'cases', 'feishu-legacy', 'icons']"
          @update:embed-section="setConfigSection"
        />
      </div>
    </div>

    <el-dialog v-model="newRunVisible" :title="runDialogTitle" width="640px" append-to-body class="new-run-dialog">
      <div class="form">
        <div class="field">
          <label>设备（可多选，仅在线可执行）</label>
          <el-select
            v-model="runForm.sns"
            multiple
            collapse-tags
            collapse-tags-tooltip
            placeholder="选择在线设备"
            style="width:100%"
            filterable
            teleported
            popper-class="device-select-popper"
          >
            <el-option
              v-for="d in devices"
              :key="d.sn"
              :label="formatDeviceTag(d)"
              :value="d.sn"
              :disabled="deviceOptionDisabled(d)"
            >
              <div class="dev-opt">
                <span class="dev-name">{{ formatDeviceTag(d) }}</span>
                <small>
                  {{ formatDeviceMeta(d) }}
                  <template v-if="d.busy_task_id"> · 占用中 {{ shortTaskId(d.busy_task_id) }}</template>
                  <template v-else-if="d.reserved_slot_id"> · 排期占用 {{ d.reserved_title || '其他窗口' }}</template>
                </small>
              </div>
            </el-option>
          </el-select>
          <div v-if="!devices.length" class="hint warn">暂无在线设备。请到运行状态确认 USB / Wi‑Fi / ClawNode 连接。</div>
          <div v-else-if="busySelectedDevice" class="hint warn">
            {{ formatDeviceTag(busySelectedDevice) }} 正在跑任务 {{ shortTaskId(busySelectedDevice.busy_task_id) }}，请换一台或等它结束。
          </div>
          <div v-else-if="reservedSelectedDevice" class="hint warn">
            {{ formatDeviceTag(reservedSelectedDevice) }} 当前被排期占用（{{ reservedSelectedDevice.reserved_title || '其他窗口' }}），请换一台或等窗口结束。
          </div>
          <div v-else-if="selectedDevices.length" class="hint">
            已选 {{ selectedDevices.length }} 台 · {{ selectedDevices.map((d) => formatDeviceMeta(d)).join('；') }}
            <template v-if="mixedSelectedPlatforms">。每台按项目环境里对应的包名 / Bundle 执行</template>
          </div>
        </div>
        <div v-if="showCoveragePick" class="field">
          <label>覆盖方式</label>
          <div class="coverage-pick">
            <button
              type="button"
              class="coverage-card"
              :class="{ on: runForm.coverage === 'once' }"
              @click="runForm.coverage = 'once'"
            >
              <strong>加速拆分</strong>
              <span>每条用例只跑一次，空闲设备接着领</span>
              <em>{{ selectedCaseIds.length ? `${selectedCaseIds.length} 次执行` : '先勾选用例' }}</em>
            </button>
            <button
              type="button"
              class="coverage-card"
              :class="{ on: runForm.coverage === 'per_device' }"
              @click="runForm.coverage = 'per_device'"
            >
              <strong>全机覆盖</strong>
              <span>每台设备都把这批用例跑完</span>
              <em>{{ selectedCaseIds.length ? `${(selectedCaseIds.length || 0) * runForm.sns.length} 次执行` : '先勾选用例' }}</em>
            </button>
          </div>
          <div class="hint">
            <template v-if="unitCount">将执行 {{ unitCount }} 次 · 占用 {{ runForm.sns.length }} 台直到任务结束</template>
            <template v-else>勾选用例后显示执行次数 · 已选 {{ runForm.sns.length }} 台</template>
          </div>
        </div>
        <div class="field">
          <div class="hint model-hint">将使用：{{ caseExecutionModelLabel }}</div>
          <div v-if="runSeed?.envProfile" class="hint">
            流程建议环境：{{ envLabel(runSeed.envProfile) }}
            · 请在运行状态确认当前包就是该环境。发版评审不能拿测试全绿代替。
          </div>
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
        <p v-if="platformConflictCases.length" class="hint">
          {{ platformConflictCases.length }} 条用例标注了另一平台，仍会在当前设备上执行。
          该端不支持的前置条件可能失败或跳过：
          {{ platformConflictCases.map((c) => c.case_id).slice(0, 4).join('、') }}{{ platformConflictCases.length > 4 ? '…' : '' }}
        </p>
        <div class="field opts">
          <el-checkbox v-model="runForm.use_persisted_baseline">沿用上次成功路径</el-checkbox>
          <el-checkbox v-model="runForm.use_cache">不重新拉飞书表格</el-checkbox>
        </div>
      </div>
      <template #footer>
        <el-button @click="newRunVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" :disabled="!canStartRun" @click="submitRun">
          {{ unitCount ? `开始 · ${unitCount} 次执行` : '启动' }}
        </el-button>
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
  grid-template-columns: minmax(300px, 340px) minmax(0, 1fr);
}
.task-list-page {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-sizing: border-box;
}
.task-list-page .settings-page-header { flex-shrink: 0; margin-bottom: 8px; }
.col-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  flex-wrap: wrap;
  flex-shrink: 0;
}
.col-head h3 { margin: 0; font-size: 14px; font-weight: 600; flex: 1; color: #111827; }
.col-head.compact { padding: 2px 2px 8px; margin-bottom: 0; }
.col-actions { display: flex; gap: 8px; flex-shrink: 0; flex-wrap: wrap; align-items: center; }
.filter-item { width: 118px; }
.table-wrap {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.task-list-page :deep(.el-table .el-table__row) { cursor: pointer; }
.task-list-page :deep(.el-table .is-running),
.task-rail :deep(.el-table .is-running) { background: #ecfdf5; }
.task-list-page :deep(.el-table .is-current),
.task-rail :deep(.el-table .is-current) { background: #eef2ff !important; }
.task-name { font-weight: 600; color: #111827; }
.task-prog-cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.task-prog-cell span { font-size: 11px; color: #6b7280; font-weight: 600; }
.task-rail {
  min-height: 0;
  min-width: 0;
  overflow: hidden;
  padding: 10px 12px;
  border: 1px solid #e3e8f0;
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.04);
  width: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
}
.task-rail :deep(.el-table .el-table__row) { cursor: pointer; }
.rail-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 0 0 8px;
  flex-shrink: 0;
}
.rail-filters .filter-item { width: 100px; }
.run-type {
  display: inline-flex;
  margin-left: 6px;
  font-size: 10px;
  color: #64748b;
  background: #f1f5f9;
  padding: 0 6px;
  border-radius: 999px;
  vertical-align: middle;
}
.settings-table-pager.compact { padding-top: 8px; }
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
.ws-config.fill {
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.ws-config.fill > * {
  flex: 1;
  min-height: 0;
  height: 100%;
}
.coverage-pick {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.coverage-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  text-align: left;
  padding: 10px 12px;
  border: 1px solid #e3e8f0;
  border-radius: 12px;
  background: #fff;
  cursor: pointer;
  color: #111827;
}
.coverage-card strong { font-size: 13px; }
.coverage-card span { font-size: 12px; color: #6b7280; line-height: 1.4; }
.coverage-card em { font-size: 12px; font-style: normal; font-weight: 650; color: #4f46e5; }
.coverage-card.on {
  border-color: #6366f1;
  background: #eef2ff;
}
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
