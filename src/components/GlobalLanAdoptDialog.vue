<script setup>
import { computed } from 'vue'
import {
  adoptPopupVisible,
  adoptCandidate,
  adoptCountdown,
  adoptingNode,
  dismissAdoptPopup,
} from '@/utils/globalLanDiscovery'

const shortSn = computed(() => {
  const sn = String(adoptCandidate.value?.sn || '')
  if (!sn) return '—'
  return sn.length <= 22 ? sn : `${sn.slice(0, 14)}…${sn.slice(-6)}`
})

const onDismiss = (confirmed) => dismissAdoptPopup(confirmed)
</script>

<template>
  <el-dialog
    v-model="adoptPopupVisible"
    title="发现新设备"
    width="380px"
    :close-on-click-modal="false"
    :show-close="false"
    destroy-on-close
    class="adopt-popup-dialog"
  >
    <div v-if="adoptCandidate" class="adopt-popup-body">
      <p class="adopt-popup-lead">是否添加到设备列表？</p>
      <div class="adopt-device-card">
        <span class="adopt-device-icon">📱</span>
        <div class="adopt-device-info">
          <div class="adopt-device-sn" :title="adoptCandidate.sn">{{ shortSn }}</div>
          <div class="adopt-device-sub">{{ adoptCandidate.model || 'Android Node' }} · {{ adoptCandidate.host }}</div>
        </div>
      </div>
      <p class="adopt-countdown">{{ adoptCountdown }} 秒后自动关闭</p>
    </div>
    <template #footer>
      <el-button @click="onDismiss(false)">暂不添加</el-button>
      <el-button type="primary" :loading="adoptingNode" @click="onDismiss(true)">确认添加</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.adopt-popup-body {
  padding: 0 2px;
}

.adopt-popup-lead {
  margin: 0 0 12px;
  font-size: 14px;
  color: #374151;
}

.adopt-device-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  background: #f8fafc;
  margin-bottom: 10px;
  min-width: 0;
}

.adopt-device-icon {
  font-size: 22px;
  flex-shrink: 0;
}

.adopt-device-info {
  min-width: 0;
  flex: 1;
}

.adopt-device-sn {
  font-size: 14px;
  font-weight: 600;
  color: #111827;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.adopt-device-sub {
  margin-top: 4px;
  font-size: 12px;
  color: #6b7280;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.adopt-countdown {
  margin: 0;
  font-size: 12px;
  color: #9ca3af;
  text-align: center;
}
</style>
