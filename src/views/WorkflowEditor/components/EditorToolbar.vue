<template>
  <header class="editor-header">

    <!-- 左侧 -->
    <div class="header-section left">
      <WindowControls class="win-controls"/>
      <div class="divider"></div>
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

    <!-- 中间 -->
    <div class="header-section center">
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

    <!-- 右侧 -->
    <div class="header-section right">
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

        <button class="run-btn" :class="{ 'is-running': isRunning }" @click="$emit('run')" :disabled="isRunning">
          <svg v-if="!isRunning" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          <span v-if="!isRunning">运行</span>
          <div v-else class="running-state">
            <svg class="spinner" viewBox="0 0 50 50"><circle class="path" cx="25" cy="25" r="20" fill="none" stroke-width="5"></circle></svg>
            <span>运行中</span>
          </div>
        </button>
      </div>
    </div>
  </header>
</template>

<script setup>
import {computed} from 'vue'
import WindowControls from '@/components/WindowControls.vue'

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

const emit = defineEmits(['back', 'edit-info', 'toggle-selector', 'run', 'toggle-webpage', 'toggle-scrcpy', 'toggle-log', 'change-view'])

const saveStatusText = computed(() => props.isSaving ? '保存中...' : (props.isModified ? '未保存' : '已保存'))
const saveStatusClass = computed(() => props.isSaving ? 'status-saving' : (props.isModified ? 'status-modified' : 'status-saved'))
</script>

<style scoped>
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

/* 原有样式保持 */
.editor-header {
  height: 56px;
  background: white;
  border-bottom: 1px solid #eef2f6;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 8px;
  -webkit-app-region: drag;
  z-index: 100;
  position: relative;
}

.no-drag {
  -webkit-app-region: no-drag;
}

.header-section {
  display: flex;
  align-items: center;
  height: 100%;
}

.left {
  flex: 1;
  gap: 12px;
}

.center {
  flex: 0 0 auto;
}

.right {
  flex: 1;
  justify-content: flex-end;
  padding-right: 12px;
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

.divider {
  width: 1px;
  height: 20px;
  background: #e2e8f0;
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