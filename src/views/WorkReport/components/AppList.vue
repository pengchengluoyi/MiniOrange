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
        <div class="island-head">
          <div class="head-main">
            <h3>{{ project.name }}</h3>
            <el-button link class="add-sub-btn" icon="Plus" @click.stop="openCreateAppDialog(project)">添加应用</el-button>
          </div>
        </div>

        <div class="apps-vertical-grid">
          <div v-for="app in project.apps" :key="app.id" class="app-vertical-card">
            <div class="card-body" @click="enterApp(app)">
              <div class="info">
                <span class="name">{{ app.name }}</span>
                <span class="platform">ID: {{ app.id?.slice(0,8) }}</span>
              </div>
              <div class="platform-indicator">{{ getPlatformIcon(normalizePlatforms(app.platforms)[0]) }}</div>
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

    <!-- 创建项目弹窗 -->
    <el-dialog v-model="showProjectDialog" title="新建项目" width="500px">
      <el-form :model="projectForm" label-width="80px">
        <el-form-item label="项目名称">
          <el-input v-model="projectForm.name" placeholder="例如：电商业务线" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="projectForm.description" type="textarea" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showProjectDialog = false">取消</el-button>
        <el-button type="primary" @click="handleCreateProject">确定</el-button>
      </template>
    </el-dialog>

    <!-- 创建应用弹窗 -->
    <el-dialog v-model="showAppDialog" :title="`在 [${currentProject?.name}] 下创建应用`" width="500px">
      <el-form :model="appForm" label-width="80px">
        <el-form-item label="应用名称">
          <el-input v-model="appForm.name" placeholder="例如：买家端 App" />
        </el-form-item>
        <el-form-item label="覆盖端">
          <el-checkbox-group v-model="appForm.platforms">
            <el-checkbox v-for="opt in platformOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</el-checkbox>
          </el-checkbox-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAppDialog = false">取消</el-button>
        <el-button type="primary" @click="handleCreateApp">确定</el-button>
      </template>
    </el-dialog>
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

/* 卡片容器网格 */
.apps-vertical-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 24px; margin-top: 20px;
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

/* 覆盖 Element Plus 的弹窗，使其也具备玻璃感 */
:deep(.el-dialog) {
  background: rgba(255, 255, 255, 0.6) !important;
  backdrop-filter: blur(30px) !important;
  border-radius: 24px !important;
  border: 1px solid rgba(255, 255, 255, 0.6) !important;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.15) !important;
}
</style>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { getProjects, createProject, createAppInProject } from '../../../api/workReport'
import { ElButton, ElTag, ElDialog, ElForm, ElFormItem, ElInput, ElCheckboxGroup, ElCheckbox, vLoading } from 'element-plus'

const router = useRouter()
const projects = ref([])
const loading = ref(false)

const platformOptions = [
  { label: 'Windows', value: 'Windows' },
  { label: 'Mac', value: 'Mac' },
  { label: 'Android', value: 'Android' },
  { label: 'iOS', value: 'iOS' },
  { label: 'Web', value: 'Web' }
]

const showProjectDialog = ref(false)
const showAppDialog = ref(false)
const currentProject = ref(null)

const projectForm = reactive({ name: '', description: '' })
const appForm = reactive({
  name: '',
  platforms: []
})

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

const normalizePlatforms = (platforms) => {
  if (Array.isArray(platforms)) return platforms
  if (typeof platforms === 'string') return platforms.split(',').filter(Boolean)
  return []
}

const getPlatformIcon = (p) => {
  const map = { Windows: '🪟', Mac: '🍎', Android: '🤖', iOS: '🍏', Web: '🌐' }
  return map[p] || '📱'
}

const openCreateProjectDialog = () => {
  projectForm.name = ''
  projectForm.description = ''
  showProjectDialog.value = true
}

const openCreateAppDialog = (project) => {
  currentProject.value = project
  appForm.name = ''
  appForm.platforms = []
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

const handleCreateProject = async () => {
  if (!projectForm.name) return
  await createProject({ ...projectForm })
  await fetchProjectsData()
  showProjectDialog.value = false
}

const handleCreateApp = async () => {
  if (!appForm.name || appForm.platforms.length === 0) return
  await createAppInProject(currentProject.value.id, { ...appForm })
  await fetchProjectsData()
  showAppDialog.value = false
}
</script>