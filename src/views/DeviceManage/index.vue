<script setup>
import { ref, onMounted, onUnmounted, reactive } from 'vue'
import managementWsService from '@/api/managementWebSocket'
import { setDevicePassword, getDeviceList } from '@/api/device'
import QRCode from 'qrcode'
import { getWsUrl, LOCAL_HOST } from '@/utils/config'
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
  ElAlert,
  vLoading
} from 'element-plus'
import { Refresh, VideoPlay, Monitor, Plus, Lock } from '@element-plus/icons-vue'

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

// 密码设置弹窗
const passwordDialogVisible = ref(false)
const passwordForm = reactive({
  sn: '',
  password: ''
})
const settingPassword = ref(false)

// 获取设备列表
const fetchList = async () => {
  loading.value = true
  try {
    const res = await getDeviceList()
    handleDeviceListUpdate(res)
  } catch (e) {
    console.error(e)
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
  // 动态获取当前使用的 WS 地址
  const address = getWsUrl()
  
  serverAddress.value = address
  // 简单判断是否是 localhost
  isLocalhost.value = address.includes('localhost') || address.includes('127.0.0.1')

  try {
    // 使用 qrcode 库生成 DataURL
    qrCodeUrl.value = await QRCode.toDataURL(address, { width: 256 })
    addDeviceDialogVisible.value = true
  } catch (err) {
    ElMessage.error('生成二维码失败')
    console.error(err)
  }
}

// 打开设置密码弹窗
const handleSetPassword = (row) => {
  passwordForm.sn = row.sn
  passwordForm.password = row.password || ''
  passwordDialogVisible.value = true
}

// 提交密码
const submitPassword = async () => {
  settingPassword.value = true
  try {
    const res = await setDevicePassword({ ...passwordForm })
    if (res.code === 200) {
      ElMessage.success('密码设置成功')
      passwordDialogVisible.value = false
      
      // 手动更新本地列表，确保UI即时刷新
      const target = deviceList.value.find(d => d.sn === passwordForm.sn)
      if (target) {
        target.password = passwordForm.password
      }
    } else {
      ElMessage.error(res.msg || '设置失败')
    }
  } catch (e) {
    console.error(e)
  } finally {
    settingPassword.value = false
  }
}

// WebSocket 消息处理器
const handleDeviceListUpdate = (data) => {
  // 兼容直接返回数组或返回 { code: 200, data: [...] } 的情况
  const list = Array.isArray(data) ? data : (data?.data || [])
  const newList = Array.isArray(list) ? list : []

  // 🔥 防御性编程：如果 WebSocket 推送的数据中缺失 password 字段（可能是后端 WS handler 没更新），
  // 则尝试保留本地已有的密码，防止 UI 上密码消失。
  deviceList.value = newList.map(newItem => {
    const oldItem = deviceList.value.find(old => old.sn === newItem.sn)
    if ((newItem.password === undefined || newItem.password === null) && oldItem?.password) {
      return { ...newItem, password: oldItem.password }
    }
    return newItem
  })
  
  loading.value = false
}

onMounted(() => {
  managementWsService.connect()
  managementWsService.addListener('get_device_list', handleDeviceListUpdate)
  managementWsService.addListener('device_list_update', handleDeviceListUpdate)
  fetchList()
})

onUnmounted(() => {
  managementWsService.removeListener('get_device_list', handleDeviceListUpdate)
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
        <el-table-column prop="password" label="锁屏密码" width="160">
          <template #default="{ row }">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-family: monospace;">{{ row.password ? '******' : '未设置' }}</span>
              <el-button link type="primary" :icon="Lock" @click="handleSetPassword(row)" title="修改密码" />
            </div>
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

    <!-- 设置密码弹窗 -->
    <el-dialog
      v-model="passwordDialogVisible"
      title="设置锁屏密码"
      width="400px"
    >
      <el-form :model="passwordForm" label-width="80px" @submit.prevent>
        <el-form-item label="设备SN">
          <el-input v-model="passwordForm.sn" disabled />
        </el-form-item>
        <el-form-item label="密码">
          <el-input v-model="passwordForm.password" placeholder="请输入设备锁屏密码" clearable />
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="passwordDialogVisible = false">取消</el-button>
          <el-button type="primary" @click="submitPassword" :loading="settingPassword">
            保存
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