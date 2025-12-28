<template>
  <div v-if="data && data.runStatus && data.runStatus !== 'idle'" class="result-container">
    <div class="result-content" :class="`bg-${data.runStatus}`">
      <div class="result-header">
        <div class="status-left">
          <component :is="statusIcon" :class="['status-icon', { 'is-spinning': data.runStatus === 'running' }]" />
          <span class="status-text">{{ statusText }}</span>
          <span v-if="data.code" class="code-badge">Code: {{ data.code }}</span>
        </div>
        <div v-if="executionTime" class="time-tag">{{ executionTime }}ms</div>
      </div>
      <div v-if="data.runStatus === 'failure' && data.runMessage" class="error-detail">
        {{ data.runMessage }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { CheckCircle2, XCircle, Loader2, PlayCircle } from 'lucide-vue-next'

const props = defineProps({
  data: Object
})

const statusText = computed(() => {
  if (!props.data?.runStatus) return ''
  const map = { running: '执行中', success: '已通过', failure: '未通过' }
  return map[props.data.runStatus] || '等待中'
})

const statusIcon = computed(() => {
  if (!props.data?.runStatus) return PlayCircle
  switch (props.data.runStatus) {
    case 'running': return Loader2
    case 'success': return CheckCircle2
    case 'failure': return XCircle
    default: return PlayCircle
  }
})

const executionTime = computed(() => {
  // 🔥 使用可选链防止 undefined 报错
  const start = props.data?.timestamp?.start
  const dispatched = props.data?.timestamp?.dispatched
  if (start && dispatched) {
    return dispatched - start
  }
  return null
})
</script>

<style scoped>
.result-container { padding: 0 8px 8px 8px; margin-top: -4px; }
.result-content { border-radius: 6px; padding: 6px 8px; border: 1px solid transparent; font-size: 11px; }
.status-left { display: flex; align-items: center; gap: 6px; font-weight: 600; }
.status-icon { width: 14px; height: 14px; }
.code-badge { font-size: 9px; background: rgba(0,0,0,0.05); padding: 1px 4px; border-radius: 4px; margin-left: 4px; }
.bg-running { background: #eff6ff; color: #3b82f6; border-color: #dbeafe; }
.bg-success { background: #f0fdf4; color: #10b981; border-color: #dcfce7; }
.bg-failure { background: #fef2f2; color: #ef4444; border-color: #fee2e2; }
.time-tag { font-family: monospace; opacity: 0.7; font-size: 10px; }
.error-detail { margin-top: 4px; padding-top: 4px; border-top: 1px dashed rgba(239,68,68,0.2); word-break: break-all; line-height: 1.3; font-size: 10px; }
.is-spinning { animation: spin 1s linear infinite; }
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
</style>