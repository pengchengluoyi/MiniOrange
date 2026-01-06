<script setup>
import { ref, onMounted, reactive } from 'vue'
import { getDeviceList, sendCommand } from '@/api/device'
import { 
  ElMessage,
  ElCard,
  ElTable,
  ElTableColumn,
  ElTag,
  ElButton,
  ElEmpty,
  ElDialog,
  ElForm,
  ElFormItem,
  ElInput,
  ElIcon,
  vLoading
} from 'element-plus'
import { Refresh, VideoPlay, Monitor } from '@element-plus/icons-vue'

const loading = ref(false)
const deviceList = ref([])

// 指令弹窗相关
const dialogVisible = ref(false)
const currentDevice = ref(null)
const commandForm = reactive({
  command: '',
  params: '{}'
})
const sending = ref(false)

// 获取设备列表
const fetchList = async () => {
  loading.value = true
  try {
    const res = await getDeviceList()
    // 后端直接返回列表数组
    deviceList.value = Array.isArray(res) ? res : []
  } catch (e) {
    console.error(e)
    ElMessage.error('获取设备列表失败')
  } finally {
    loading.value = false
  }
}

// 打开指令弹窗
const handleCommand = (row) => {
  currentDevice.value = row
  commandForm.command = ''
  commandForm.params = '{\n  \n}'
  dialogVisible.value = true
}

// 提交指令
const submitCommand = async () => {
  if (!commandForm.command) {
    ElMessage.warning('请输入指令名称')
    return
  }
  
  let params = {}
  try {
    params = JSON.parse(commandForm.params)
  } catch (e) {
    ElMessage.error('参数必须是合法的 JSON 格式')
    return
  }

  sending.value = true
  try {
    const res = await sendCommand({
      sn: currentDevice.value.sn,
      command: commandForm.command,
      params: params
    })
    
    if (res.code === 200) {
      ElMessage.success(res.msg || '指令下发成功')
      dialogVisible.value = false
    } else {
      ElMessage.error(res.msg || '指令下发失败')
    }
  } catch (e) {
    ElMessage.error('请求异常')
  } finally {
    sending.value = false
  }
}

onMounted(() => {
  fetchList()
})
</script>

<template>
  <div class="device-manage-container">
    <div class="page-header">
      <div class="title-box">
        <el-icon class="page-icon"><Monitor /></el-icon>
        <h2>设备管理</h2>
      </div>
      <el-button :icon="Refresh" circle @click="fetchList" :loading="loading" title="刷新列表" />
    </div>

    <el-card class="table-card" shadow="never">
      <el-table :data="deviceList" v-loading="loading" style="width: 100%" height="100%">
        <el-table-column prop="sn" label="设备SN" min-width="180" show-overflow-tooltip />
        <el-table-column prop="type" label="类型" width="120" />
        <el-table-column prop="model" label="型号" width="120" />
        <el-table-column prop="ip" label="IP地址" width="140" />
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.status === 'online' ? 'success' : 'info'" effect="dark">
              {{ row.status === 'online' ? '在线' : '离线' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="last_online" label="最后在线时间" min-width="180" />
        <el-table-column label="操作" width="120" fixed="right">
          <template #default="{ row }">
            <el-button 
              type="primary" 
              link
              :icon="VideoPlay"
              @click="handleCommand(row)"
              :disabled="row.status !== 'online'"
            >
              下发指令
            </el-button>
          </template>
        </el-table-column>
        <template #empty>
          <el-empty description="暂无设备连接" />
        </template>
      </el-table>
    </el-card>

    <!-- 下发指令弹窗 -->
    <el-dialog
      v-model="dialogVisible"
      :title="`下发指令 - ${currentDevice?.sn}`"
      width="500px"
      destroy-on-close
    >
      <el-form :model="commandForm" label-width="80px" @submit.prevent>
        <el-form-item label="指令名称" required>
          <el-input v-model="commandForm.command" placeholder="例如: reboot, update_config" />
        </el-form-item>
        <el-form-item label="参数">
          <el-input 
            v-model="commandForm.params" 
            type="textarea" 
            :rows="6" 
            placeholder="请输入 JSON 格式参数" 
            class="code-input"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="dialogVisible = false">取消</el-button>
          <el-button type="primary" @click="submitCommand" :loading="sending">
            发送
          </el-button>
        </span>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
/* 样式复用项目整体风格 */
.device-manage-container {
  padding: 20px;
  height: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  background-color: #f8fafc;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.title-box {
  display: flex;
  align-items: center;
  gap: 10px;
  color: #1e293b;
}

.page-icon {
  font-size: 24px;
  color: #6366f1;
}

.page-header h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
}

.table-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  overflow: hidden;
}

:deep(.el-card__body) {
  flex: 1;
  padding: 0;
  height: 100%;
}

.code-input {
  font-family: monospace;
}
</style>