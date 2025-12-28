<template>
  <div class="app-dashboard-vertical">
    <header class="dashboard-header">
      <div class="title-meta">
        <h1>项目与应用管理</h1>
        <p>Vertical Management System — v2.5</p>
      </div>
      <el-button class="create-btn-orange" @click="openCreateProjectDialog">+ 新建项目集群</el-button>
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
  max-width: 1200px; /* 限制宽度，防止横向铺得太满 */
  margin: 0 auto; padding: 40px 20px;
  height: 100%; display: flex; flex-direction: column;
}

.dashboard-header {
  display: flex; justify-content: space-between; align-items: flex-end;
  margin-bottom: 40px; border-bottom: 2px solid #f3f4f6; padding-bottom: 20px;
}
.dashboard-header h1 { font-size: 32px; color: #111827; font-weight: 800; margin: 0; }
.dashboard-header p { color: #9ca3af; font-size: 11px; letter-spacing: 1px; margin-top: 5px; }

.vertical-scroll-view { flex: 1; overflow-y: auto; padding-right: 10px; }
.vertical-scroll-view::-webkit-scrollbar { width: 4px; }
.vertical-scroll-view::-webkit-scrollbar-thumb { background: #e5e7eb; border-radius: 4px; }

.project-section-island { margin-bottom: 40px; }
.island-head .label { font-size: 10px; color: #ff4d00; font-weight: 900; letter-spacing: 2px; }
.head-main { display: flex; justify-content: space-between; align-items: center; margin-top: 8px; }
.head-main h3 { font-size: 20px; color: #1f2937; margin: 0; }

.apps-vertical-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 20px; margin-top: 20px;
}

.app-vertical-card {
  background: #ffffff; border: 1px solid #e5e7eb;
  border-radius: 16px; overflow: hidden; transition: 0.3s;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
}
.app-vertical-card:hover { transform: translateY(-4px); border-color: #ff4d00; box-shadow: 0 10px 20px rgba(0,0,0,0.08); }

.card-body { padding: 20px; display: flex; justify-content: space-between; cursor: pointer; }
.card-body .name { font-size: 16px; font-weight: 700; color: #111827; display: block; }
.card-body .platform { font-size: 11px; color: #9ca3af; font-family: monospace; }

/* 清晰的操作按钮 */
.card-footer-actions {
  display: flex; height: 42px; background: #fafafa; border-top: 1px solid #f3f4f6;
}
.action-btn {
  flex: 1; display: flex; align-items: center; justify-content: center;
  font-size: 12px; font-weight: 600; color: #6b7280; cursor: pointer; transition: 0.2s;
}
.action-btn:hover { background: #f3f4f6; color: #111827; }
.action-btn.orange { color: #ff4d00; }
.action-btn.orange:hover { background: #fff7ed; }
.divider { width: 1px; height: 100%; background: #f3f4f6; }

.create-btn-orange {
  background: #ff4d00 !important; border: none !important; color: #fff !important;
  font-weight: 700 !important; border-radius: 8px !important;
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