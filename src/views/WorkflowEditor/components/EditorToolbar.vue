<template>
  <Teleport to="#titlebar-center-portal">
    <div class="workflow-toolbar-portal">
      <!-- Left Section -->
      <div class="portal-section left">
        <button class="nav-btn no-drag" :disabled="isModified || isSaving" @click="$emit('back')">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M19 12H5"/>
            <path d="M12 19l-7-7 7-7"/>
          </svg>
        </button>
        <div class="flow-meta no-drag" @click="$emit('edit-info')">
          <div class="meta-icon">⚡️</div>
          <div class="meta-content">
            <div class="flow-title">{{ flowName || '未命名流程' }}</div>
            <div class="flow-status">
              <span class="status-badge" :class="saveStatusClass">{{ saveStatusText }}</span>
              <!-- 🔥 显示保存时间 -->
              <span v-if="!isModified && !isSaving && lastSavedTime" class="save-time">
                {{ lastSavedTime }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Center Section -->
      <div class="portal-section center">
        <div class="tool-capsule no-drag">
        <div class="source-group">
          <button
              class="capsule-btn"
              :class="{ active: viewMode === 'canvas' && isWebRecorderOpen }"
              @click="$emit('change-view', 'canvas'); $emit('toggle-webpage')"
          >
            网页
          </button>
          <div class="v-line"></div>
          <button class="capsule-btn" :class="{ active: isScrcpyOpen }"
                   @click="$emit('toggle-scrcpy')">
            APP
          </button>
          <div class="v-line"></div>

          <button class="capsule-btn" :class="{ active: viewMode === 'canvas' && !isWebRecorderOpen }"
                  @click="$emit('change-view', 'canvas')">
            PC
          </button>
        </div>
        <div class="capsule-divider"></div>
        <button class="capsule-btn add-btn" @click="$emit('toggle-selector')">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
        </button>
        <div class="capsule-divider"></div>
        <button
            class="capsule-btn view-btn"
            :class="{ active: viewMode === 'app' }"
            @click="$emit('change-view', 'app')"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
               style="margin-right:4px">
            <rect x="3" y="3" width="7" height="7"/>
            <rect x="14" y="3" width="7" height="7"/>
            <rect x="14" y="14" width="7" height="7"/>
            <rect x="3" y="14" width="7" height="7"/>
          </svg>
          应用视图
        </button>
      </div>
      </div>

      <!-- Right Section -->
      <div class="portal-section right">
        <div class="action-area no-drag">

        <!-- 🔥 优化后的日志按钮 (次级按钮样式) -->
        <button class="secondary-btn" @click="$emit('toggle-log')" title="查看日志">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
               style="margin-top:1px">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
          </svg>
          <span>日志</span>
        </button>

        <!-- 停止按钮 (仅运行时显示) -->
        <button v-if="isRunning" class="stop-btn" @click="$emit('stop')" title="停止轮询/运行">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="6" width="12" height="12" rx="2"/>
          </svg>
          <span>停止</span>
        </button>

        <button class="run-btn" :class="{ 'is-running': isRunning }" @click="handleRunClick" :disabled="isRunning">
          <svg v-if="!isRunning" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          <span v-if="!isRunning">运行</span>
          <div v-else class="running-state">
            <svg class="spinner" viewBox="0 0 50 50"><circle class="path" cx="25" cy="25" r="20" fill="none" stroke-width="5"></circle></svg>
            <span>运行中</span>
          </div>
        </button>
      </div>
      </div>
    </div>
  </Teleport>

  <!-- 设备选择弹窗 -->
  <el-dialog v-model="deviceDialogVisible" title="运行 Workflow" width="640px" append-to-body>
    <div class="run-env-row">
      <span class="run-env-label">运行环境</span>
      <el-radio-group v-model="selectedEnvProfile" size="small">
        <el-radio-button v-for="p in ENV_PROFILES" :key="p.key" :value="p.key">{{ p.label }}</el-radio-button>
      </el-radio-group>
    </div>
    <div class="run-device-title">选择设备</div>
    <el-table :data="deviceList" v-loading="loadingDevices" @row-click="confirmSelection" highlight-current-row style="cursor: pointer">
      <el-table-column property="sn" label="SN" width="180" show-overflow-tooltip />
      <el-table-column property="model" label="型号" width="120" />
      <el-table-column property="status" label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="row.status === 'online' ? 'success' : 'info'">{{ row.status === 'online' ? '在线' : '离线' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="100" align="center">
        <template #default="{ row }">
          <el-button link type="primary" :disabled="row.status !== 'online'">选择</el-button>
        </template>
      </el-table-column>
      <template #empty>
        <el-empty description="暂无在线设备" :image-size="80" />
      </template>
    </el-table>
  </el-dialog>
</template>

<script setup>
import { computed, ref, onMounted, onUnmounted } from 'vue'
import managementWsService from '@/api/managementWebSocket'
import { ElDialog, ElTable, ElTableColumn, ElTag, ElButton, ElEmpty, ElMessage, ElRadioGroup, ElRadioButton, vLoading } from 'element-plus'
import { ENV_PROFILES, getStoredRunEnvProfile, setStoredRunEnvProfile } from '@/constants/envProfiles'

const props = defineProps({
  flowName: String,
  isSaving: Boolean,
  isModified: Boolean,
  isRunning: Boolean,
  isWebRecorderOpen: Boolean,
  isScrcpyOpen: Boolean,
  lastSavedTime: String, // 🔥 接收时间参数
  viewMode: String // 🔥🔥 新增：接收当前视图模式 ('canvas' | 'app')
})

const emit = defineEmits(['back', 'edit-info', 'toggle-selector', 'run', 'toggle-webpage', 'toggle-scrcpy', 'toggle-log', 'change-view', 'stop', 'openAppView'])

const saveStatusText = computed(() => props.isSaving ? '保存中...' : (props.isModified ? '未保存' : '已保存'))
const saveStatusClass = computed(() => props.isSaving ? 'status-saving' : (props.isModified ? 'status-modified' : 'status-saved'))

// --- 设备选择逻辑 ---
const deviceDialogVisible = ref(false)
const deviceList = ref([])
const loadingDevices = ref(false)
const selectedEnvProfile = ref(getStoredRunEnvProfile())

const handleDeviceListUpdate = (data) => {
  deviceList.value = Array.isArray(data) ? data : []
  loadingDevices.value = false
}

const handleRunClick = () => {
  if (props.isRunning) return
  deviceDialogVisible.value = true
  loadingDevices.value = true
  deviceList.value = []
  managementWsService.sendMessage('get_device_list')
  // 超时兜底
  setTimeout(() => { loadingDevices.value = false }, 2000)
}

const confirmSelection = (row) => {
  if (row.status !== 'online') {
    ElMessage.warning('设备离线，无法执行任务')
    return
  }
  if (!row.sn) {
    ElMessage.error('设备SN缺失，无法执行')
    return
  }
  setStoredRunEnvProfile(selectedEnvProfile.value)
  deviceDialogVisible.value = false
  console.log('Selected device SN:', row.sn, 'env:', selectedEnvProfile.value)
  emit('run', { sn: row.sn, envProfile: selectedEnvProfile.value })
}

onMounted(() => {
  managementWsService.connect()
  managementWsService.addListener('get_device_list', handleDeviceListUpdate)
})
onUnmounted(() => {
  managementWsService.removeListener('get_device_list', handleDeviceListUpdate)
})
</script>

<style scoped>
.run-env-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
  flex-wrap: wrap;
}

.run-env-label,
.run-device-title {
  font-size: 13px;
  font-weight: 600;
  color: #374151;
}

.run-device-title {
  margin-bottom: 8px;
}

.save-time {
  margin-left: 6px;
  color: #94a3b8;
  font-size: 11px;
  font-weight: 400;
}

/* 次级按钮样式 */
.secondary-btn {
  height: 34px;
  padding: 0 14px;
  background: white;
  border: 1px solid #e2e8f0;
  color: #475569;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: all 0.2s;
}

.secondary-btn:hover {
  background: #f8fafc;
  color: #0f172a;
  border-color: #cbd5e1;
}

.workflow-toolbar-portal {
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 12px;
}

.no-drag {
  -webkit-app-region: no-drag;
}

.portal-section {
  display: flex;
  align-items: center;
  gap: 12px;
}

.tool-capsule {
  display: flex;
  align-items: center;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 3px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.02);
}

.source-group {
  display: flex;
  align-items: center;
}

.capsule-btn {
  height: 32px;
  padding: 0 12px;
  border: none;
  background: transparent;
  font-size: 13px;
  font-weight: 500;
  color: #64748b;
  cursor: pointer;
  border-radius: 6px;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.capsule-btn:hover {
  background: rgba(0, 0, 0, 0.04);
  color: #1e293b;
}

.capsule-btn.active {
  background: white;
  color: #6366f1;
  font-weight: 600;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

.v-line {
  width: 1px;
  height: 14px;
  background: #cbd5e1;
  margin: 0 2px;
}

.capsule-divider {
  width: 1px;
  height: 20px;
  background: #cbd5e1;
  margin: 0 8px;
}

.add-btn {
  padding: 0 10px;
  color: #6366f1;
}

.add-btn:hover {
  background: #e0e7ff;
}

.action-area {
  display: flex;
  gap: 12px;
  align-items: center;
}

.stop-btn {
  height: 34px;
  padding: 0 16px;
  background: #fee2e2;
  color: #ef4444;
  border: 1px solid #fecaca;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  transition: all 0.2s;
}
.stop-btn:hover {
  background: #fecaca;
  border-color: #fca5a5;
}

.run-btn {
  height: 34px;
  padding: 0 16px;
  background: #10b981;
  color: white;
  border: none;
  border-radius: 8px;
  font-weight: 600;
  font-size: 13px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: all 0.2s;
}

.run-btn:hover:not(:disabled) {
  background: #059669;
  box-shadow: 0 2px 4px rgba(16, 185, 129, 0.2);
}

.run-btn.is-running {
  background: #e2e8f0;
  color: #64748b;
  cursor: default; /* 修复鼠标一直加载中的问题 */
  border: 1px solid #cbd5e1;
}

.running-state {
  display: flex;
  align-items: center;
  gap: 6px;
}

.spinner {
  animation: rotate 2s linear infinite;
  width: 14px;
  height: 14px;
}

.spinner .path {
  stroke: #64748b;
  stroke-linecap: round;
  animation: dash 1.5s ease-in-out infinite;
}

@keyframes rotate {
  100% { transform: rotate(360deg); }
}

@keyframes dash {
  0% { stroke-dasharray: 1, 150; stroke-dashoffset: 0; }
  50% { stroke-dasharray: 90, 150; stroke-dashoffset: -35; }
  100% { stroke-dasharray: 90, 150; stroke-dashoffset: -124; }
}

.nav-btn {
  background: transparent;
  border: none;
  color: #64748b;
  cursor: pointer;
  padding: 4px;
  border-radius: 6px;
}

.nav-btn:hover {
  background: #f1f5f9;
}

.flow-meta {
  display: flex;
  gap: 8px;
  align-items: center;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
}

.flow-meta:hover {
  background: #f8fafc;
}

.meta-icon {
  width: 30px;
  height: 30px;
  background: #e0e7ff;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.flow-title {
  font-weight: 600;
  font-size: 14px;
  color: #334155;
}

.status-badge {
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 4px;
  background: #f1f5f9;
  color: #94a3b8;
}

.status-saved {
  color: #10b981;
  background: #ecfdf5;
}

.status-modified {
  color: #f59e0b;
  background: #fffbeb;
}

.status-saving {
  color: #3b82f6;
  background: #eff6ff;
}
</style>