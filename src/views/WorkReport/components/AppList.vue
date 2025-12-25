<template>
  <div class="page-container">
    <div class="page-header">
      <div class="left">
        <h2>项目与应用管理</h2>
        <p>管理测试项目及其包含的应用（支持多端覆盖）。</p>
      </div>
      <el-button type="primary" size="large" icon="Plus" @click="openCreateProjectDialog">新建项目</el-button>
    </div>

    <div class="cards-grid" v-loading="loading">
      <div 
        v-for="project in projects" 
        :key="project.id"
        class="project-card"
      >
        <div class="project-header">
          <div class="icon-wrapper">📂</div>
          <div class="project-info">
            <h3>{{ project.name }}</h3>
            <p>{{ project.description || '暂无描述' }}</p>
          </div>
          <el-button circle size="small" icon="Plus" @click.stop="openCreateAppDialog(project)" title="添加应用" />
        </div>
        
        <div class="apps-list">
          <div 
            v-for="app in project.apps" 
            :key="app.id" 
            class="app-item"
            @click="enterApp(app)"
          >
            <div class="app-main">
              <span class="app-name">{{ app.name }}</span>
              <div class="platform-icons">
                <span v-for="p in normalizePlatforms(app.platforms)" :key="p" class="platform-icon" :title="p">
                  {{ getPlatformIcon(p) }}
                </span>
              </div>
            </div>
            <div class="app-actions">
              <el-button link type="primary" size="small" @click.stop="enterApp(app)">任务</el-button>
              <el-button link type="info" size="small" @click.stop="editCases(app)">用例</el-button>
            </div>
          </div>
          
          <div v-if="project.apps.length === 0" class="empty-apps">
            暂无应用，请点击右上角添加
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

<style scoped>
.page-container { padding: 30px; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 40px; }
.page-header h2 { margin: 0; color: #1e293b; }
.page-header p { margin: 5px 0 0; color: #64748b; font-size: 14px; }

.cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 24px;
}

.project-card {
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  transition: all 0.3s ease;
}

.project-card:hover {
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
  transform: translateY(-2px);
}

.project-header {
  padding: 16px;
  background: #f8fafc;
  border-bottom: 1px solid #f1f5f9;
  display: flex;
  align-items: center;
  gap: 12px;
}

.icon-wrapper { font-size: 24px; }
.project-info { flex: 1; }
.project-info h3 { margin: 0; font-size: 16px; color: #1e293b; }
.project-info p { margin: 2px 0 0; font-size: 12px; color: #64748b; }

.apps-list { padding: 12px; display: flex; flex-direction: column; gap: 8px; }

.app-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px;
  border-radius: 8px;
  background: #fff;
  border: 1px solid #f1f5f9;
  cursor: pointer;
}
.app-item:hover { border-color: #6366f1; background: #f5f7ff; }

.app-main { display: flex; flex-direction: column; gap: 4px; }
.app-name { font-size: 14px; font-weight: 500; color: #334155; }
.platform-icons { font-size: 12px; display: flex; gap: 4px; }

.empty-apps { text-align: center; color: #94a3b8; font-size: 12px; padding: 20px 0; font-style: italic; }
</style>