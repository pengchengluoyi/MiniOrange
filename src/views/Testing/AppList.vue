<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getProjects } from '@/api/workReport'
import { formatPlatformTags } from '@/constants/appPlatforms'
import { listCaseRunnerRuns, listTestingTaskSummary } from '@/api/caseRunner'
import { isMissingTaskEndpoint, normalizeTask, statusLabel, statusTagType, taskCountLabel } from '@/utils/testingTasks'
import WorkShell from '@/layouts/WorkShell.vue'

const route = useRoute()
const router = useRouter()
const loading = ref(false)
const projects = ref([])
const liveByApp = ref({})
const runningCountByApp = ref({})
const filterProjectId = ref('')

const filteredProjects = computed(() => {
  if (!filterProjectId.value) return projects.value
  return projects.value.filter((p) => p.id === filterProjectId.value)
})

const load = async () => {
  loading.value = true
  try {
    const res = await getProjects()
    projects.value = Array.isArray(res) ? res : (res?.data || [])
  } catch (_) {
    projects.value = []
  } finally {
    loading.value = false
  }
  liveByApp.value = {}
  runningCountByApp.value = {}
  const appIds = projects.value.flatMap((p) => (p.apps || []).map((a) => a.id)).filter(Boolean)
  try {
    const s = await listTestingTaskSummary(appIds)
    const rows = s?.data?.items || s?.data || []
    const list = Array.isArray(rows) ? rows : []
    if (list.length) {
      const live = {}
      const counts = {}
      for (const row of list) {
        const id = row.app_id || row.appId
        if (!id) continue
        counts[id] = Number(row.running_count || 0)
        if (row.latest || row.status) {
          live[id] = normalizeTask({
            task_id: row.latest_task_id || row.task_id || `app-${id}`,
            app_id: id,
            status: row.status || row.latest?.status,
            completed: row.completed ?? row.latest?.completed,
            total: row.total ?? row.latest?.total,
            started_at: row.started_at || row.latest?.started_at,
          })
        }
      }
      liveByApp.value = live
      runningCountByApp.value = counts
      return
    }
  } catch (e) {
    if (!isMissingTaskEndpoint(e)) console.warn('[testing] summary failed', e)
  }
  try {
    const r = await listCaseRunnerRuns(40)
    const runs = (r?.data?.runs || []).map((row) => normalizeTask(row, { source: 'memory' })).filter(Boolean)
    const map = {}
    const counts = {}
    for (const t of runs) {
      if (!t.appId) continue
      if (t.status === 'running') counts[t.appId] = (counts[t.appId] || 0) + 1
      if (!map[t.appId] || String(t.startedAt) > String(map[t.appId].startedAt || '')) {
        map[t.appId] = t
      }
    }
    liveByApp.value = map
    runningCountByApp.value = counts
  } catch (_) {
    liveByApp.value = {}
  }
}

const openApp = (app, project) => {
  router.push({
    name: 'TestingApp',
    params: { appId: app.id },
    query: {
      appName: app.name,
      projectName: project?.name || '',
      projectId: project?.id || '',
      tab: 'tasks',
    },
  })
}

const selectProject = (id) => {
  filterProjectId.value = filterProjectId.value === id ? '' : id
}

onMounted(load)
watch(() => route.fullPath, () => {
  if (route.name === 'TestingHome') load()
})
</script>

<template>
  <WorkShell mode="testing">
    <template #sidebar>
      <div class="side-label">项目</div>
      <button
        type="button"
        class="side-item"
        :class="{ active: !filterProjectId }"
        @click="filterProjectId = ''"
      >
        全部项目
      </button>
      <button
        v-for="p in projects"
        :key="p.id"
        type="button"
        class="side-item"
        :class="{ active: filterProjectId === p.id }"
        @click="selectProject(p.id)"
      >
        <strong>{{ p.name }}</strong>
        <small>{{ p.apps?.length || 0 }} 个应用</small>
      </button>
      <div v-if="!projects.length" class="side-empty">暂无项目</div>
    </template>

    <div class="testing-home" v-loading="loading">
      <header class="home-head">
        <div>
          <h2>测试</h2>
          <p>选择应用进入工作台；左侧可按项目筛选。</p>
        </div>
        <el-button text :loading="loading" @click="load">刷新</el-button>
      </header>

      <div v-for="p in filteredProjects" :key="p.id" class="project-block">
        <div class="project-head">
          <h3>{{ p.name }}</h3>
          <span class="sub">{{ p.apps?.length || 0 }} 个应用</span>
        </div>
        <div class="app-grid">
          <button
            v-for="app in (p.apps || [])"
            :key="app.id"
            type="button"
            class="app-card"
            @click="openApp(app, p)"
          >
            <strong>{{ app.name }}</strong>
            <span class="meta">
              <span v-for="t in formatPlatformTags(app.platforms)" :key="t" class="tag">{{ t }}</span>
            </span>
            <span class="recent" v-if="runningCountByApp[app.id]">
              <el-tag size="small" type="primary">运行中 {{ runningCountByApp[app.id] }}</el-tag>
            </span>
            <span class="recent" v-else-if="liveByApp[app.id]">
              <el-tag size="small" :type="statusTagType(liveByApp[app.id].status, liveByApp[app.id])">{{ statusLabel(liveByApp[app.id].status, liveByApp[app.id]) }}</el-tag>
              {{ taskCountLabel(liveByApp[app.id]) }}
            </span>
            <span class="recent muted" v-else>暂无最近任务</span>
          </button>
        </div>
      </div>

      <el-empty v-if="!filteredProjects.length && !loading" description="暂无项目/应用" />
    </div>
  </WorkShell>
</template>

<style scoped>
.side-label {
  padding: 4px 8px 6px;
  font-size: 11px;
  font-weight: 700;
  color: #94a3b8;
  letter-spacing: 0.02em;
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
  color: #374151;
  font-size: 13px;
}
.side-item strong { font-size: 13px; font-weight: 600; color: #111827; }
.side-item small { font-size: 11px; color: #94a3b8; }
.side-item:hover { background: #f1f5f9; }
.side-item.active { background: #eef2ff; color: #4f46e5; }
.side-item.active strong { color: #4f46e5; }
.side-empty { padding: 8px 10px; font-size: 12px; color: #94a3b8; }

.testing-home {
  height: 100%;
  overflow: auto;
  padding: 20px 24px 40px;
  box-sizing: border-box;
}
.home-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 20px;
}
.home-head h2 { margin: 0; font-size: 22px; color: #111827; }
.home-head p { margin: 6px 0 0; color: #6b7280; font-size: 13px; }
.project-block { margin-bottom: 22px; }
.project-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 10px;
}
.project-head h3 { margin: 0; font-size: 15px; color: #111827; }
.project-head .sub { font-size: 12px; color: #94a3b8; }
.app-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
}
.app-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  padding: 16px;
  border: 1px solid #e3e8f0;
  border-radius: 16px;
  background: #fff;
  text-align: left;
  cursor: pointer;
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.04);
}
.app-card:hover {
  border-color: #c7d2fe;
  background: #f8faff;
}
.app-card strong { font-size: 15px; color: #111827; }
.meta { display: flex; flex-wrap: wrap; gap: 4px; min-height: 20px; }
.tag {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 999px;
  background: #f3f4f6;
  color: #4b5563;
  font-size: 11px;
}
.recent {
  font-size: 12px;
  color: #6b7280;
  display: flex;
  align-items: center;
  gap: 6px;
}
.recent.muted { color: #94a3b8; }
</style>
