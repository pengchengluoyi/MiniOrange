<template>
  <div class="log-panel">
    <div class="log-header">
      <div class="log-title">
        <span>运行日志</span>
        <span v-if="isRunning" class="status-dot running"></span>
      </div>
      <!-- 搜索框 -->
      <div class="log-search-box">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
        <input
          :value="searchQuery"
          @input="$emit('update:searchQuery', $event.target.value)"
          placeholder="搜索日志..."
          class="log-search-input"
        />
      </div>
      <div class="log-actions">
        <button @click="$emit('clear')" class="log-action-btn">清除</button>
        <button @click="$emit('close')" class="log-action-btn close">×</button>
      </div>
    </div>

    <div class="log-body" ref="bodyRef">
      <div v-if="logs.length === 0" class="empty-log">
        {{ isRunning ? '等待日志输出...' : '暂无日志，点击“运行”开始测试' }}
      </div>
      <div v-else-if="filteredLogs.length === 0" class="empty-log">
        无搜索结果
      </div>
      <div

        v-for="(log, index) in filteredLogs"
        :key="index"
        class="log-line"
        :class="getLogClass(log)"
      >
        <span class="log-time" :title="log.created_at">
          [{{ formatTime(log.created_at || log.time) }}]
        </span>

        <span class="log-level-badge" :class="String(log.level || 'INFO').toLowerCase()">
          {{ log.level || 'INFO' }}
        </span>

        <span class="log-tag-badge" :title="log.tag || log.source">
          {{ log.tag || log.source || 'NULL' }}
        </span>
        <span class="log-text" @click="copyText(log.message || log.text)" title="点击复制">{{ log.message || log.text }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue'

const props = defineProps({
  logs: Array,
  filteredLogs: Array,
  isRunning: Boolean,
  searchQuery: String
})
const emit = defineEmits(['close', 'clear', 'update:searchQuery'])

// 暴露 DOM ref 给父组件或 Composable 使用（如果需要）
const bodyRef = ref(null)

const formatTime = (val) => {
  if (!val) return ''
  // 兼容旧格式或已经是时间字符串的情况
  if (typeof val === 'string' && val.length < 15 && val.includes(':')) return val

  try {
    const date = new Date(val)
    if (isNaN(date.getTime())) return val

    const h = date.getHours().toString().padStart(2, '0')
    const m = date.getMinutes().toString().padStart(2, '0')
    const s = date.getSeconds().toString().padStart(2, '0')
    const ms = date.getMilliseconds().toString().padStart(3, '0')
    return `${h}:${m}:${s}.${ms}`
  } catch (e) {
    return val
  }
}

const copyText = (text) => {
  if (!text) return
  navigator.clipboard.writeText(text).catch(err => {
    console.error('复制失败:', err)
  })
}

const getLogClass = (log) => {
  if (log.levelClass) return log.levelClass // 兼容旧版
  const level = String(log.level || 'INFO').toLowerCase()
  return `log-${level}`
}

const formatNodeId = (id) => (!id) ? 'NULL' : ((id.length > 6) ? id.slice(-6) : id)

// 也可以在组件内实现滚动
watch(() => props.logs.length, () => {
  nextTick(() => {
    if (bodyRef.value) bodyRef.value.scrollTop = bodyRef.value.scrollHeight
  })
})
</script>

<style scoped>
.log-panel { position: absolute; bottom: 0; left: 0; right: 0; height: 320px; background: #1e293b; border-top-right-radius: 12px; border-top-left-radius: 12px; z-index: 50; display: flex; flex-direction: column; box-shadow: 0 -4px 20px rgba(0,0,0,0.15); color: #f1f5f9; font-family: 'Menlo', 'Monaco', 'Courier New', monospace; }
.log-header { height: 44px; background: #0f172a; display: flex; align-items: center; justify-content: space-between; padding: 0 16px; border-top-right-radius: 12px; border-top-left-radius: 12px; border-bottom: 1px solid #334155; }
.log-title { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; color: #cbd5e1; white-space: nowrap; }
.status-dot { width: 8px; height: 8px; border-radius: 50%; background: #10b981; animation: pulse 1.5s infinite; }
@keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.4; } 100% { opacity: 1; } }
.log-search-box { flex: 1; max-width: 300px; margin: 0 16px; position: relative; display: flex; align-items: center; background: #1e293b; border-radius: 6px; padding: 4px 8px; border: 1px solid #334155; transition: border-color 0.2s; }
.log-search-box:focus-within { border-color: #6366f1; }
.log-search-input { background: transparent; border: none; color: #f1f5f9; font-size: 12px; margin-left: 6px; width: 100%; outline: none; }
.log-search-input::placeholder { color: #64748b; }
.log-actions { display: flex; gap: 12px; }
.log-action-btn { background: transparent; border: none; color: #94a3b8; cursor: pointer; font-size: 12px; padding: 4px 8px; border-radius: 4px; transition: background 0.2s; white-space: nowrap; }
.log-action-btn:hover { background: #334155; color: white; }
.log-action-btn.close { font-size: 16px; font-weight: bold; }
.log-body { flex: 1; overflow-y: auto; overflow-x: hidden; padding: 12px 16px; font-size: 12px; line-height: 1.6; }
.log-line { display: flex; gap: 8px; margin-bottom: 4px; border-bottom: 1px solid rgba(255,255,255,0.03); padding-bottom: 2px; align-items: flex-start; }
.log-time { color: #64748b; user-select: none; width: 110px; min-width: 110px; flex-shrink: 0; text-align: left; white-space: nowrap; }
.log-text { white-space: pre-wrap; word-break: break-all; flex: 1; overflow-wrap: break-word; user-select: none; cursor: pointer; transition: opacity 0.2s; }
.log-text:hover { opacity: 0.8; }
.log-text:active { opacity: 0.6; }
.log-line .log-text { color: #cbd5e1; }

/* 新增样式 */
.log-level-badge { font-size: 10px; padding: 0 4px; border-radius: 3px; text-transform: uppercase; font-weight: bold; width: 45px; min-width: 45px; text-align: center; height: 18px; line-height: 18px; flex-shrink: 0; }
.log-level-badge.info { background: rgba(45, 212, 191, 0.1); color: #2dd4bf; }
.log-level-badge.debug { background: rgba(148, 163, 184, 0.1); color: #94a3b8; }
.log-level-badge.warn { background: rgba(251, 191, 36, 0.1); color: #fbbf24; }
.log-level-badge.error { background: rgba(248, 113, 113, 0.1); color: #f87171; }

.log-tag-badge { font-size: 10px; color: #a78bfa; background: rgba(167, 139, 250, 0.1); padding: 0 4px; border-radius: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: 90px; min-width: 90px; text-align: center; height: 18px; line-height: 18px; flex-shrink: 0; }
.log-node-badge { font-size: 10px; color: #60a5fa; background: rgba(96, 165, 250, 0.1); padding: 0 4px; border-radius: 3px; white-space: nowrap; font-family: monospace; width: 70px; min-width: 70px; text-align: center; height: 18px; line-height: 18px; flex-shrink: 0; }

.log-line.log-info .log-text { color: #2dd4bf; }
.log-line.log-debug .log-text { color: #94a3b8; }
.log-line.log-warn .log-text { color: #fbbf24; }
.log-line.log-error .log-text { color: #f87171; font-weight: 600; }
.empty-log { color: #475569; text-align: center; margin-top: 40px; font-style: italic; }
</style>