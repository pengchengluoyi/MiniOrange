<template>
  <div class="page-container">
    <div class="page-header">
      <div class="left">
        <div style="display: flex; align-items: center; gap: 10px;">
          <el-button :icon="ArrowLeft" circle @click="$router.push('/report/apps')" />
          <div>
            <h2>{{ appName ? `${appName} - ` : '' }}测试任务执行</h2>
            <p>管理并监控所有自动化测试任务的执行进度。</p>
          </div>
        </div>
      </div>
      <el-button type="primary" size="large" icon="Plus" @click="showCreateDialog = true">新建测试任务</el-button>
    </div>

    <div class="filter-bar">
      <el-radio-group v-model="filterType" size="large">
        <el-radio-button value="all">全部任务</el-radio-button>
        <el-radio-button value="regression">回归测试</el-radio-button>
        <el-radio-button value="smoke">冒烟测试</el-radio-button>
        <el-radio-button value="ui">UI 验收</el-radio-button>
      </el-radio-group>
      <div class="search-box">
        <el-input v-model="searchKey" placeholder="搜索任务名称..." :prefix-icon="Search" />
      </div>
    </div>

    <el-table :data="filteredTasks" v-loading="loading" style="width: 100%" :header-cell-style="{ background: '#f8fafc' }">
      <el-table-column prop="id" label="任务 ID" width="100" />
      <el-table-column prop="name" label="任务名称" min-width="200">
        <template #default="scope">
          <div class="task-name-cell">
            <span class="name">{{ scope.row.name }}</span>
            <el-tag size="small" effect="plain">{{ scope.row.type }}</el-tag>
          </div>
        </template>
      </el-table-column>
      
      <el-table-column label="执行进度" width="250">
        <template #default="scope">
          <div class="progress-cell">
            <el-progress 
              :percentage="scope.row.progress" 
              :status="scope.row.status === 'failed' ? 'exception' : (scope.row.progress === 100 ? 'success' : '')"
            />
            <span class="progress-text">通过率: {{ scope.row.passRate }}% ({{ scope.row.completed }}/{{ scope.row.total }})</span>
          </div>
        </template>
      </el-table-column>

      <el-table-column prop="status" label="状态" width="120">
        <template #default="scope">
          <el-tag :type="getStatusType(scope.row.status)" effect="dark" round>
            {{ getStatusLabel(scope.row.status) }}
          </el-tag>
        </template>
      </el-table-column>

      <el-table-column prop="startTime" label="开始时间" width="180" />
      
      <el-table-column label="操作" width="150" fixed="right">
        <template #default="scope">
          <el-button link type="primary" @click="$router.push(`/report/task/${scope.row.id}`)">查看详情</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 新建任务弹窗 -->
    <el-dialog v-model="showCreateDialog" title="新建测试任务" width="500px">
      <el-form :model="form" label-width="80px">
        <el-form-item label="任务名称">
          <el-input v-model="form.name" placeholder="例如：V3.0 回归测试" />
        </el-form-item>
        <el-form-item label="任务类型">
          <el-select v-model="form.type" placeholder="请选择类型" style="width: 100%">
            <el-option label="回归测试" value="regression" />
            <el-option label="冒烟测试" value="smoke" />
            <el-option label="UI 验收" value="ui" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateDialog = false">取消</el-button>
        <el-button type="primary" @click="handleCreate">确定创建</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, reactive, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useTaskLogic } from '../composables/useTaskLogic'
import { 
  ElButton, 
  ElRadioGroup, 
  ElRadioButton, 
  ElInput, 
  ElTable, 
  ElTableColumn, 
  ElTag, 
  ElProgress,
  ElDialog,
  ElForm,
  ElFormItem,
  ElSelect,
  ElOption,
  vLoading
} from 'element-plus'
import { Search } from '@element-plus/icons-vue'
import { ArrowLeft } from '@element-plus/icons-vue'

const route = useRoute()
const { tasks, loading, fetchTasks, createTask } = useTaskLogic()
const filterType = ref('all')
const searchKey = ref('')
const showCreateDialog = ref(false)
const appName = ref(route.query.appName || '')

const form = reactive({ name: '', type: 'regression' })

const filteredTasks = computed(() => {
  return tasks.value.filter(t => {
    const matchType = filterType.value === 'all' || t.type === filterType.value
    const matchSearch = t.name.toLowerCase().includes(searchKey.value.toLowerCase())
    return matchType && matchSearch
  })
})

onMounted(() => {
  fetchTasks({ appId: route.query.appId })
})

const handleCreate = async () => {
  if (!form.name) return
  await createTask({ ...form, appId: route.query.appId })
  showCreateDialog.value = false
  form.name = ''
  form.type = 'regression'
}

const getStatusType = (status) => ({ completed: 'success', failed: 'danger', running: 'primary', pending: 'info' }[status])
const getStatusLabel = (status) => ({ completed: '已完成', failed: '失败', running: '执行中', pending: '等待中' }[status])
</script>

<style scoped>
.page-container { padding: 30px; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; }
.page-header h2 { margin: 0; color: #1e293b; }
.page-header p { margin: 5px 0 0; color: #64748b; font-size: 14px; }
.filter-bar { display: flex; justify-content: space-between; margin-bottom: 20px; }
.task-name-cell { display: flex; flex-direction: column; gap: 4px; }
.task-name-cell .name { font-weight: 600; color: #334155; }
.progress-cell { display: flex; flex-direction: column; gap: 2px; }
.progress-text { font-size: 12px; color: #94a3b8; }
</style>