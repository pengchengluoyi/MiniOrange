<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Plus } from '@element-plus/icons-vue'
import {
  ElMessage,
  ElMessageBox,
  ElCard,
  ElButton,
  ElTable,
  ElTableColumn,
  ElTag,
  ElSwitch,
  ElDialog,
  ElForm,
  ElFormItem,
  ElInput,
  ElSelect,
  ElOption,
  vLoading
} from 'element-plus'
import { getScheduleList, createSchedule, updateSchedule, deleteSchedule, getScheduleHistory } from '@/api/schedule'
import { getDeviceList } from '@/api/device'
import { getProjects, getAppGraphList, getAppGraphDetail } from '@/api/workReport'

const router = useRouter()
const loading = ref(false)
const tableData = ref([])
const dialogVisible = ref(false)
const isEdit = ref(false)
const submitting = ref(false)
const formRef = ref(null)

// Options state
const deviceOptions = ref([])
const appOptions = ref([])
const flowOptions = ref([])
const flowLoading = ref(false)

// History state
const historyDialogVisible = ref(false)
const historyList = ref([])
const historyLoading = ref(false)

const formData = reactive({
  id: '',
  name: '',
  app_id: '',
  cron_expression: '',
  flow_id: '',
  target_sn: '',
  is_active: true,
  skip_nodes: []
})

const rules = {
  name: [{ required: true, message: '请输入任务名称', trigger: 'blur' }],
  cron_expression: [{ required: true, message: '请输入Cron表达式', trigger: 'blur' }],
  flow_id: [{ required: true, message: '请输入流程ID', trigger: 'blur' }]
}

const fetchData = async () => {
  loading.value = true
  try {
    const res = await getScheduleList()
    if (res.code === 200) {
      tableData.value = res.data.map(item => ({
        ...item,
        statusLoading: false
      }))
    }
  } catch (e) {
    console.error(e)
  } finally {
    loading.value = false
  }
}

const fetchDevices = async () => {
  try {
    const res = await getDeviceList()
    const list = Array.isArray(res) ? res : (res.data || [])
    if (res.code === 200 || Array.isArray(res)) {
      deviceOptions.value = list.map(d => ({
        label: `${d.sn} ${d.model ? `(${d.model})` : ''}`,
        value: d.sn,
        sn: d.sn,
        model: d.model,
        status: d.status
      }))
    }
  } catch (e) { console.error(e) }
}

const fetchApps = async () => {
  try {
    const res = await getProjects()
    // 兼容直接返回数组的情况
    const projects = Array.isArray(res) ? res : (res.data || [])
    const list = []
    projects.forEach(p => {
      if (p.apps) {
        p.apps.forEach(a => {
          list.push({
            label: `${p.name} / ${a.name}`,
            value: String(a.id),
            projectName: p.name,
            appName: a.name
          })
        })
      }
    })
    appOptions.value = list
  } catch (e) { console.error(e) }
}

const fetchFlows = async (appId) => {
  flowOptions.value = []
  if (!appId) return
  flowLoading.value = true
  try {
    const res = await getAppGraphList(appId)
    const graphs = Array.isArray(res) ? res : (res.data || [])
    if (graphs.length > 0) {
      const graphId = graphs[0].id
      const detail = await getAppGraphDetail(graphId)
      const detailData = detail.data || detail
      if (detailData && detailData.nodes) {
        flowOptions.value = detailData.nodes
          .filter(n => n.type === 'case' && n.data?.workflow_id)
          .map(n => ({
            label: `${n.label || n.data.label} (ID: ${n.data.workflow_id})`,
            value: String(n.data.workflow_id),
            caseName: n.label || n.data.label,
            workflowId: String(n.data.workflow_id)
          }))
      }
    }
  } catch (e) { console.error(e) }
  finally { flowLoading.value = false }
}

const handleCreate = () => {
  isEdit.value = false
  resetForm()
  dialogVisible.value = true
}

const handleEdit = (row) => {
  isEdit.value = true
  Object.assign(formData, {
    id: row.id,
    name: row.name,
    app_id: row.app_id || '',
    cron_expression: row.cron_expression,
    flow_id: row.flow_id,
    target_sn: row.target_sn,
    is_active: row.is_active,
    skip_nodes: row.skip_nodes || []
  })
  // 加载关联的流程选项
  if (row.app_id) {
    fetchFlows(row.app_id)
  }
  dialogVisible.value = true
}

const handleDelete = (row) => {
  ElMessageBox.confirm('确认删除该定时任务吗?', '提示', {
    type: 'warning'
  }).then(async () => {
    try {
      const res = await deleteSchedule(row.id)
      if (res.code === 200) {
        ElMessage.success('删除成功')
        fetchData()
      }
    } catch (e) {}
  })
}

const handleStatusChange = async (row, val) => {
  row.statusLoading = true
  try {
    const res = await updateSchedule(row.id, { is_active: val })
    if (res.code === 200) {
      ElMessage.success(val ? '任务已启用' : '任务已停用')
    } else {
      row.is_active = !val // revert
    }
  } catch (e) {
    row.is_active = !val // revert
  } finally {
    row.statusLoading = false
  }
}

const handleHistory = async (row) => {
  historyDialogVisible.value = true
  historyLoading.value = true
  historyList.value = []
  try {
    const res = await getScheduleHistory(row.id)
    if (res.code === 200) {
      historyList.value = res.data
    }
  } finally {
    historyLoading.value = false
  }
}

const submitForm = async () => {
  if (!formRef.value) return
  await formRef.value.validate(async (valid) => {
    if (valid) {
      submitting.value = true
      try {
        const payload = {
          name: formData.name,
          app_id: formData.app_id || null,
          cron_expression: formData.cron_expression,
          flow_id: formData.flow_id,
          target_sn: formData.target_sn || null,
          is_active: formData.is_active,
          skip_nodes: formData.skip_nodes
        }
        
        let res
        if (isEdit.value) {
          res = await updateSchedule(formData.id, payload)
        } else {
          res = await createSchedule(payload)
        }

        if (res.code === 200) {
          ElMessage.success(isEdit.value ? '更新成功' : '创建成功')
          dialogVisible.value = false
          fetchData()
        }
      } catch (e) {
        console.error(e)
      } finally {
        submitting.value = false
      }
    }
  })
}

const resetForm = () => {
  formData.id = ''
  formData.name = ''
  formData.app_id = ''
  formData.cron_expression = ''
  formData.flow_id = ''
  formData.target_sn = ''
  formData.is_active = true
  formData.skip_nodes = []
  if (formRef.value) formRef.value.resetFields()
}

const handleAppChange = (val) => {
  formData.flow_id = ''
  fetchFlows(val)
}

onMounted(() => {
  fetchData()
  fetchDevices()
  fetchApps()
})
</script>

<template>
  <div class="schedule-container">
    <el-card shadow="never">
      <template #header>
        <div class="card-header">
          <span>定时任务管理</span>
          <el-button type="primary" :icon="Plus" @click="handleCreate">新建任务</el-button>
        </div>
      </template>

      <el-table :data="tableData" v-loading="loading" style="width: 100%">
        <el-table-column prop="name" label="任务名称" min-width="120" />
        <el-table-column prop="app_id" label="App ID" min-width="100" show-overflow-tooltip />
        <el-table-column prop="cron_expression" label="Cron 表达式" min-width="140">
          <template #default="{ row }">
            <el-tag type="info" effect="plain" class="mono-font">{{ row.cron_expression }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="flow_id" label="流程ID" min-width="100" show-overflow-tooltip />
        <el-table-column prop="target_sn" label="设备SN" min-width="120" show-overflow-tooltip>
          <template #default="{ row }">
            <span v-if="row.target_sn">{{ row.target_sn }}</span>
            <el-tag v-else type="info" size="small">任意设备</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="is_active" label="状态" width="100">
          <template #default="{ row }">
            <el-switch
              v-model="row.is_active"
              :loading="row.statusLoading"
              @change="(val) => handleStatusChange(row, val)"
            />
          </template>
        </el-table-column>
        <el-table-column prop="last_run_time" label="上次运行" min-width="160">
          <template #default="{ row }">
            {{ row.last_run_time || '-' }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="handleHistory(row)">历史</el-button>
            <el-button link type="primary" @click="handleEdit(row)">编辑</el-button>
            <el-button link type="danger" @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- Dialog -->
    <el-dialog
      v-model="dialogVisible"
      :title="isEdit ? '编辑任务' : '新建任务'"
      width="550px"
      @close="resetForm"
    >
      <el-form ref="formRef" :model="formData" :rules="rules" label-width="100px">
        <el-form-item label="任务名称" prop="name">
          <el-input v-model="formData.name" placeholder="请输入任务名称" />
        </el-form-item>
        <el-form-item label="App ID" prop="app_id">
          <el-select v-model="formData.app_id" placeholder="关联的应用 (可选)" clearable filterable style="width: 100%" @change="handleAppChange">
            <el-option v-for="item in appOptions" :key="item.value" :label="item.label" :value="item.value">
              <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                <span>{{ item.appName }}</span>
                <span style="color: var(--el-text-color-secondary); font-size: 13px;">{{ item.projectName }}</span>
              </div>
            </el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="Cron表达式" prop="cron_expression">
          <el-input v-model="formData.cron_expression" placeholder="分 时 日 月 周 (例如: 0 12 * * *)" />
          <div class="form-tip">格式: 分 时 日 月 周 (空格分隔)</div>
        </el-form-item>
        <el-form-item label="流程ID" prop="flow_id">
          <el-select v-model="formData.flow_id" placeholder="选择关联的测试用例" clearable filterable :loading="flowLoading" style="width: 100%">
            <el-option v-for="item in flowOptions" :key="item.value" :label="item.label" :value="item.value">
              <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                <span>{{ item.caseName }}</span>
                <span style="color: var(--el-text-color-secondary); font-size: 12px; font-family: monospace;">ID: {{ item.workflowId }}</span>
              </div>
            </el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="设备SN" prop="target_sn">
          <el-select v-model="formData.target_sn" placeholder="指定运行设备 (留空则不限制)" clearable style="width: 100%">
            <el-option v-for="item in deviceOptions" :key="item.value" :label="item.label" :value="item.value">
              <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                <div>
                  <span style="font-family: monospace;">{{ item.sn }}</span>
                  <span v-if="item.model" style="color: #909399; font-size: 12px; margin-left: 8px;">({{ item.model }})</span>
                </div>
                <el-tag :type="item.status === 'online' ? 'success' : 'info'" size="small" effect="light">{{ item.status === 'online' ? '在线' : '离线' }}</el-tag>
              </div>
            </el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="跳过节点" prop="skip_nodes">
           <el-select
              v-model="formData.skip_nodes"
              multiple
              filterable
              allow-create
              default-first-option
              :reserve-keyword="false"
              placeholder="输入节点ID并回车添加"
              style="width: 100%"
            >
            </el-select>
        </el-form-item>
        <el-form-item label="是否启用" prop="is_active">
          <el-switch v-model="formData.is_active" />
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="dialogVisible = false">取消</el-button>
          <el-button type="primary" :loading="submitting" @click="submitForm">确定</el-button>
        </span>
      </template>
    </el-dialog>

    <!-- History Dialog -->
    <el-dialog v-model="historyDialogVisible" title="执行历史" width="700px">
      <el-table :data="historyList" v-loading="historyLoading" height="400">
        <el-table-column prop="created_at" label="执行时间" width="180" />
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.status === 'success' ? 'success' : 'danger'">
              {{ row.status }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="details" label="详情" show-overflow-tooltip />
        <el-table-column prop="run_id" label="Run ID" width="120" show-overflow-tooltip>
          <template #default="{ row }">
            <el-button link type="primary" @click="router.push({ name: 'Timeline', query: { runId: row.run_id } })">{{ row.run_id }}</el-button>
          </template>
        </el-table-column>
      </el-table>
      <template #footer>
        <el-button @click="historyDialogVisible = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
  .schedule-container {
    padding: 20px;
    height: 100%;
    box-sizing: border-box;
  }
  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .form-tip {
    font-size: 12px;
    color: #909399;
    line-height: 1.4;
    margin-top: 4px;
  }
  .mono-font {
    font-family: monospace;
  }
</style>