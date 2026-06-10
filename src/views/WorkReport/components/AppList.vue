<template>
  <div class="config-center">
    <header class="config-header">
      <div class="config-header-main">
        <h1>配置中心</h1>
        <p>项目、应用、环境与自动化能力统一管理</p>
      </div>
      <div class="config-header-actions">
        <el-button @click="router.push({ name: 'SettingsFeishu' })">设置</el-button>
        <el-button type="primary" @click="openCreateProjectDialog">新建项目</el-button>
      </div>
    </header>

    <div class="config-body">
      <section v-for="project in projects" :key="project.id" class="project-block">
        <div class="project-bar">
          <div class="project-bar-left">
            <span class="project-mark">{{ projectInitial(project.name) }}</span>
            <div>
              <h2 class="project-title">{{ project.name }}</h2>
              <span class="project-sub">{{ appCountLabel(project) }}</span>
            </div>
          </div>
          <div class="project-bar-actions">
            <el-button size="small" @click.stop="openCreateAppDialog(project)">添加应用</el-button>
            <el-button size="small" type="primary" plain @click.stop="openProjectEnv(project)">
              环境
            </el-button>
          </div>
        </div>

        <div v-if="!project.apps?.length" class="empty-row">暂无应用</div>

        <table v-else class="app-table">
          <thead>
            <tr>
              <th>应用名称</th>
              <th>平台</th>
              <th>自动化资产</th>
              <th>ID</th>
              <th class="col-actions">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="app in project.apps" :key="app.id" class="app-row">
              <td class="cell-name">
                <span class="app-name">{{ app.name }}</span>
              </td>
              <td>
                <span
                  v-for="tag in formatPlatformTags(app.platforms)"
                  :key="tag"
                  class="tag"
                >{{ tag }}</span>
              </td>
              <td class="cell-stats">
                <span class="stat-chip">图标 {{ app.automation_stats?.icon_targets ?? 0 }}</span>
                <span class="stat-chip">用例 {{ app.automation_stats?.feishu_cases ?? 0 }}</span>
                <span v-if="app.automation_stats?.has_feishu" class="stat-chip on">飞书</span>
              </td>
              <td class="cell-mono">{{ app.id?.slice(0, 8) }}</td>
              <td class="cell-actions">
                <el-button link type="primary" @click="enterAutomation(app, project)">自动化</el-button>
                <el-button link @click="enterApp(app)">任务中心</el-button>
                <el-button link @click="editCases(app)">用例编排</el-button>
              </td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>

    <CreateProjectDialog
      v-model="showProjectDialog"
      :submitting="creatingProject"
      @submit="handleCreateProject"
    />
    <CreateAppDialog
      v-model="showAppDialog"
      :project-name="currentProject?.name"
      :submitting="creatingApp"
      @submit="handleCreateApp"
    />
  </div>
</template>

<style scoped>
.config-center {
  max-width: 1280px;
  margin: 0 auto;
  padding: 28px 40px 48px;
  min-height: 100%;
}

.config-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  padding-bottom: 20px;
  margin-bottom: 24px;
  border-bottom: 1px solid #e5e7eb;
}

.config-header h1 {
  margin: 0;
  font-size: 26px;
  font-weight: 700;
  color: #111827;
}

.config-header p {
  margin: 6px 0 0;
  font-size: 13px;
  color: #6b7280;
}

.config-header-actions {
  display: flex;
  gap: 8px;
}

.config-body {
  display: flex;
  flex-direction: column;
  gap: 28px;
}

.project-block {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  overflow: hidden;
}

.project-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 18px;
  background: #f9fafb;
  border-bottom: 1px solid #e5e7eb;
}

.project-bar-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.project-mark {
  width: 36px;
  height: 36px;
  border-radius: 6px;
  background: #374151;
  color: #fff;
  font-size: 15px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}

.project-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #111827;
}

.project-sub {
  font-size: 12px;
  color: #9ca3af;
}

.project-bar-actions {
  display: flex;
  gap: 8px;
}

.app-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.app-table th {
  text-align: left;
  padding: 10px 18px;
  font-weight: 600;
  color: #6b7280;
  background: #fafafa;
  border-bottom: 1px solid #e5e7eb;
}

.app-table td {
  padding: 12px 18px;
  border-bottom: 1px solid #f3f4f6;
  vertical-align: middle;
}

.app-row:last-child td {
  border-bottom: none;
}

.app-row:hover {
  background: #f9fafb;
}

.cell-name .app-name {
  font-weight: 600;
  color: #111827;
}

.cell-mono {
  font-family: ui-monospace, monospace;
  font-size: 12px;
  color: #9ca3af;
}

.tag {
  display: inline-block;
  margin-right: 4px;
  padding: 2px 8px;
  border-radius: 4px;
  background: #f3f4f6;
  color: #4b5563;
  font-size: 11px;
  font-weight: 500;
}

.cell-stats {
  white-space: nowrap;
}
.stat-chip {
  display: inline-block;
  margin-right: 6px;
  padding: 2px 8px;
  border-radius: 4px;
  background: #f3f4f6;
  color: #4b5563;
  font-size: 11px;
}
.stat-chip.on {
  background: #ecfdf5;
  color: #047857;
}

.col-actions {
  width: 360px;
}

.cell-actions {
  white-space: nowrap;
}

.empty-row {
  padding: 32px;
  text-align: center;
  color: #9ca3af;
  font-size: 13px;
}
</style>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { getProjects, createProject, createAppInProject } from '../../../api/workReport'
import CreateAppDialog from './CreateAppDialog.vue'
import CreateProjectDialog from './CreateProjectDialog.vue'
import { formatPlatformTags } from '@/constants/appPlatforms'
import { ElMessage } from 'element-plus'

const projectInitial = (name) => {
  const s = String(name || 'P').trim()
  return s ? s.charAt(0).toUpperCase() : 'P'
}

const appCountLabel = (project) => {
  const n = project.apps?.length || 0
  return n ? `${n} 个应用` : '暂无应用'
}

const router = useRouter()
const projects = ref([])
const loading = ref(false)

const showProjectDialog = ref(false)
const showAppDialog = ref(false)
const creatingProject = ref(false)
const creatingApp = ref(false)
const currentProject = ref(null)

const fetchProjectsData = async () => {
  loading.value = true
  try {
    projects.value = await getProjects()
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  fetchProjectsData()
})

const openCreateProjectDialog = () => {
  showProjectDialog.value = true
}

const openCreateAppDialog = (project) => {
  currentProject.value = project
  showAppDialog.value = true
}

const enterApp = (app) => {
  router.push({
    path: '/report/tasks',
    query: { appId: app.id, appName: app.name },
  })
}

const editCases = (app) => {
  router.push(`/report/editor/${app.id}`)
}

const enterAutomation = (app, project) => {
  router.push({
    name: 'SettingsAppConfig',
    params: { appId: app.id, section: 'env' },
    query: {
      appName: app.name,
      projectName: project?.name || '',
      projectId: project?.id || app.project_id || '',
    },
  })
}

const openProjectEnv = (project) => {
  router.push({
    name: 'SettingsProjectEnv',
    params: { projectId: project.id },
    query: { name: project.name },
  })
}

const handleCreateProject = async (payload) => {
  creatingProject.value = true
  try {
    await createProject(payload)
    await fetchProjectsData()
    showProjectDialog.value = false
    ElMessage.success('项目已创建')
  } catch {
    ElMessage.error('创建项目失败')
  } finally {
    creatingProject.value = false
  }
}

const handleCreateApp = async (payload) => {
  if (!currentProject.value?.id) return
  creatingApp.value = true
  try {
    await createAppInProject(currentProject.value.id, payload)
    await fetchProjectsData()
    showAppDialog.value = false
    ElMessage.success('应用已创建')
  } catch {
    ElMessage.error('创建应用失败')
  } finally {
    creatingApp.value = false
  }
}
</script>
