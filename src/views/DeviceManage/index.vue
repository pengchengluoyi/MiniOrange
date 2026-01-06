<script setup>
import { ref, onMounted, onUnmounted, reactive } from 'vue'
import managementWsService from '@/api/managementWebSocket'
import QRCode from 'qrcode'
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
import { Refresh, VideoPlay, Monitor, Plus } from '@element-plus/icons-vue'

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

// 添加设备弹窗
const addDeviceDialogVisible = ref(false)
const qrCodeUrl = ref('')
const serverAddress = ref('')
const isLocalhost = ref(false)

// 获取设备列表
const fetchList = () => {
  loading.value = true
  managementWsService.sendMessage('get_device_list')
  // 设置一个超时，以防万一收不到响应
  setTimeout(() => { loading.value = false }, 3000)
}

// 打开指令弹窗
const handleCommand = (row) => {
  currentDevice.value = row
  commandForm.command = ''
  commandForm.params = '{\n  \n}'
  dialogVisible.value = true
}

// 提交指令
const submitCommand = () => {
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

  managementWsService.sendMessage('send_command_to_device', {
    sn: currentDevice.value.sn,
    command: commandForm.command,
    params: params
  })

  ElMessage.info('指令已发送')
  dialogVisible.value = false
}

// 显示添加设备弹窗
const showAddDeviceDialog = async () => {
  const hostname = window.location.hostname
  const port = '10104' // 根据你的后端配置
  const address = `ws://${hostname}:${port}/ws`
  
  serverAddress.value = address
  isLocalhost.value = (hostname === 'localhost' || hostname === '127.0.0.1')

  try {
    // 使用 qrcode 库生成 DataURL
    qrCodeUrl.value = await QRCode.toDataURL(address, { width: 256 })
    addDeviceDialogVisible.value = true
  } catch (err) {
    ElMessage.error('生成二维码失败')
    console.error(err)
  }
}

// WebSocket 消息处理器
const handleDeviceListUpdate = (data) => {
  deviceList.value = Array.isArray(data) ? data : []
  loading.value = false
}

onMounted(() => {
  managementWsService.connect()
  managementWsService.addListener('device_list_update', handleDeviceListUpdate)
})

onUnmounted(() => {
  managementWsService.removeListener('device_list_update', handleDeviceListUpdate)
})
</script>

<template>
  <div class="device-manage-container">
    <div class="page-header">
      <div class="title-box">
        <el-icon class="page-icon"><Monitor /></el-icon>
        <h2>设备管理</h2>
      </div>
      <div class="header-actions">
        <el-button type="primary" :icon="Plus" @click="showAddDeviceDialog">添加设备</el-button>
        <el-button :icon="Refresh" circle @click="fetchList" :loading="loading" title="刷新列表" />
      </div>
    </div>

    <el-card class="table-card" shadow="never" v-loading="loading">
      <el-table :data="deviceList" style="width: 100%" height="100%">
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

    <!-- 添加设备弹窗 -->
    <el-dialog
      v-model="addDeviceDialogVisible"
      title="添加新设备"
      width="360px"
      center
    >
      <div class="qr-code-container">
        <p>请使用设备扫描下方二维码建立连接</p>
        <img v-if="qrCodeUrl" :src="qrCodeUrl" alt="QR Code" class="qr-code-img" />
        <div class="address-text">
          连接地址: <strong>{{ serverAddress }}</strong>
        </div>
        <el-alert v-if="isLocalhost" title="提示" type="warning" show-icon :closable="false">
          当前地址为本地地址，仅本机可访问。请使用局域网 IP 访问此页面，以便其他设备扫码连接。
        </el-alert>
      </div>
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

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
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

.qr-code-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  text-align: center;
}

.qr-code-container p {
  margin: 0;
  font-size: 14px;
  color: #606266;
}

.qr-code-img {
  width: 256px;
  height: 256px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
}

.address-text {
  font-size: 12px;
  color: #909399;
  word-break: break-all;
  background: #f8fafc;
  padding: 4px 8px;
  border-radius: 4px;
}
</style>