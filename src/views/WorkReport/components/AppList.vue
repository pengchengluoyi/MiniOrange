<template>
  <div class="app-dashboard-vertical">
    <header class="dashboard-header">
      <div class="title-meta" style="margin-left: 66px">
        <h1>项目与应用管理</h1>
        <p>Vertical Management System — v2.5</p>
      </div>
      <el-button class="create-btn-orange" style="margin-right: 66px" @click="openCreateProjectDialog">+ 新建项目集群</el-button>
    </header>

    <div class="vertical-scroll-view">
      <div v-for="project in projects" :key="project.id" class="project-section-island">
        <div class="island-toolbar">
          <div class="island-identity">
            <span class="island-badge">{{ projectInitial(project.name) }}</span>
            <div class="island-meta">
              <h3 class="island-name">{{ project.name }}</h3>
              <span class="island-stat">{{ appCountLabel(project) }}</span>
            </div>
          </div>

          <div class="island-actions">
            <button type="button" class="island-action" @click.stop="openCreateAppDialog(project)">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              添加应用
            </button>
            <button type="button" class="island-action island-action-primary" @click.stop="openProjectEnv(project)">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="3"/>
                <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
              </svg>
              环境配置
            </button>
          </div>
        </div>

        <div v-if="!project.apps?.length" class="island-empty">
          <p>暂无应用，点击「添加应用」开始</p>
        </div>

        <div v-else class="apps-vertical-grid">
          <div v-for="app in project.apps" :key="app.id" class="app-vertical-card">
            <div class="card-body" @click="enterApp(app)">
              <div class="info">
                <span class="name">{{ app.name }}</span>
                <span class="platform">ID: {{ app.id?.slice(0,8) }}</span>
                <div class="platform-tags">
                  <span v-for="tag in formatPlatformTags(app.platforms)" :key="tag" class="platform-tag">{{ tag }}</span>
                </div>
              </div>
              <div class="platform-indicator">{{ getPlatformIcon(collapsePlatforms(app.platforms)[0]) }}</div>
            </div>

            <div class="card-footer-actions">
              <div class="action-btn" @click.stop="enterApp(app)">任务中心</div>
              <div class="divider"></div>
              <div class="action-btn orange" @click.stop="editCases(app)">用例编排</div>
            </div>
          </div>
        </div>
      </div>
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

    <ProjectEnvSettings
        v-model="showEnvDialog"
        :project-id="envProjectId"
        :project-name="envProjectName"
    />
  </div>
</template>

<style scoped>
.app-dashboard-vertical {
  max-width: 1240px; margin: 0 auto; padding: 20px 40px;
  height: 100%; display: flex; flex-direction: column;
}

/* 顶部标题栏透明化 */
.dashboard-header {
  display: flex; justify-content: space-between; align-items: flex-end;
  margin-bottom: 40px; padding-bottom: 20px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
}
.dashboard-header h1 { font-size: 32px; color: #111827; font-weight: 800; margin: 0; }
.dashboard-header p { color: #6b7280; font-size: 12px; letter-spacing: 1px; }

.vertical-scroll-view { flex: 1; overflow-y: auto; padding-right: 15px; }

.project-section-island {
  margin-bottom: 36px;
}

/* 项目岛工具栏 */
.island-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 18px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.42);
  backdrop-filter: blur(20px) saturate(160%);
  -webkit-backdrop-filter: blur(20px) saturate(160%);
  border: 1px solid rgba(255, 255, 255, 0.55);
  box-shadow: 0 4px 20px rgba(31, 38, 135, 0.06);
}

.island-identity {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.island-badge {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
  color: #fff;
  font-size: 16px;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 6px 16px rgba(79, 70, 229, 0.22);
}

.island-meta {
  min-width: 0;
}

.island-name {
  margin: 0;
  font-size: 18px;
  font-weight: 750;
  color: #111827;
  letter-spacing: -0.02em;
  line-height: 1.25;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.island-stat {
  display: block;
  margin-top: 2px;
  font-size: 12px;
  color: #9ca3af;
  font-weight: 500;
}

.island-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.island-action {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 36px;
  padding: 0 14px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.65);
  background: rgba(255, 255, 255, 0.55);
  font-size: 13px;
  font-weight: 600;
  color: #374151;
  cursor: pointer;
  transition: all 0.18s ease;
  white-space: nowrap;
}

.island-action:hover {
  background: rgba(255, 255, 255, 0.85);
  border-color: rgba(0, 0, 0, 0.08);
  color: #111827;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
}

.island-action-primary {
  background: rgba(255, 247, 237, 0.9);
  border-color: rgba(255, 77, 0, 0.28);
  color: #c2410c;
}

.island-action-primary:hover {
  background: #ff4d00;
  border-color: #ff4d00;
  color: #fff;
  box-shadow: 0 6px 18px rgba(255, 77, 0, 0.28);
}

.island-empty {
  margin-top: 16px;
  padding: 28px;
  text-align: center;
  border-radius: 16px;
  border: 1px dashed rgba(0, 0, 0, 0.08);
  background: rgba(255, 255, 255, 0.2);
}

.island-empty p {
  margin: 0;
  font-size: 13px;
  color: #9ca3af;
}

/* 卡片容器网格 */
.apps-vertical-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 24px; margin-top: 16px;
}

/* --- 核心玻璃卡片样式 --- */
.app-vertical-card {
  /* 半透明白 */
  background: rgba(255, 255, 255, 0.3) !important;
  /* 模糊背景 */
  backdrop-filter: blur(20px) saturate(160%);
  -webkit-backdrop-filter: blur(20px) saturate(160%);

  /* 玻璃边框：上方亮，下方暗，模拟光线折射 */
  border: 1px solid rgba(255, 255, 255, 0.5) !important;
  border-radius: 20px;
  overflow: hidden;
  transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  box-shadow: 0 8px 32px 0 rgba(31, 38, 135, 0.08);
}

.app-vertical-card:hover {
  transform: translateY(-8px);
  background: rgba(255, 255, 255, 0.45) !important;
  border-color: rgba(255, 77, 0, 0.4) !important;
  box-shadow: 0 15px 45px rgba(255, 77, 0, 0.12);
}

.card-body { padding: 24px; cursor: pointer; }
.card-body .name { font-size: 18px; font-weight: 700; color: #1f2937; margin-bottom: 4px; display: block; }
.card-body .platform { font-size: 12px; color: #9ca3af; font-family: 'JetBrains Mono', monospace; }
.platform-tags { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
.platform-tag {
  font-size: 10px; font-weight: 600; color: #6b7280;
  background: rgba(0,0,0,0.05); padding: 2px 8px; border-radius: 6px;
}

@media (max-width: 640px) {
  .island-toolbar {
    flex-direction: column;
    align-items: stretch;
  }

  .island-actions {
    justify-content: flex-end;
  }
}

/* 卡片操作栏：更通透的分割 */
.card-footer-actions {
  display: flex; height: 48px;
  background: rgba(255, 255, 255, 0.2);
  border-top: 1px solid rgba(255, 255, 255, 0.3);
}

.action-btn {
  flex: 1; display: flex; align-items: center; justify-content: center;
  font-size: 13px; font-weight: 600; color: #4b5563; cursor: pointer; transition: 0.2s;
}
.action-btn:hover { background: rgba(255, 255, 255, 0.4); color: #111827; }
.action-btn.orange { color: #ff4d00; }
.action-btn.orange:hover { background: rgba(255, 77, 0, 0.08); }

.divider { width: 1px; height: 100%; background: rgba(0, 0, 0, 0.05); }

/* 橙色按钮优化：保持鲜亮但增加发光感 */
.create-btn-orange {
  background: #ff4d00 !important; border: none !important; color: #fff !important;
  font-weight: 700 !important; border-radius: 12px !important;
  box-shadow: 0 4px 15px rgba(255, 77, 0, 0.3);
  transition: 0.3s;
}
.create-btn-orange:hover {
  transform: scale(1.05);
  box-shadow: 0 6px 20px rgba(255, 77, 0, 0.4);
}

</style>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { getProjects, createProject, createAppInProject } from '../../../api/workReport'
import ProjectEnvSettings from './ProjectEnvSettings.vue'
import CreateAppDialog from './CreateAppDialog.vue'
import CreateProjectDialog from './CreateProjectDialog.vue'
import { collapsePlatforms, formatPlatformTags, getPlatformIcon } from '@/constants/appPlatforms'
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
const showEnvDialog = ref(false)
const envProjectId = ref('')
const envProjectName = ref('')
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
    query: { appId: app.id, appName: app.name }
  })
}

const editCases = (app) => {
  router.push(`/report/editor/${app.id}`)
}

const openProjectEnv = (project) => {
  envProjectId.value = project.id
  envProjectName.value = project.name || ''
  showEnvDialog.value = true
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