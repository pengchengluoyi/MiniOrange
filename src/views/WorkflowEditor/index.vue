<template>
  <div class="editor-layout" :class="{ 'is-resizing': isResizing }">
    <div class="liquid-bg">
      <div class="blob b1"></div>
      <div class="blob b2"></div>
      <div class="blob b3"></div>
    </div>
    <!-- 顶部导航 -->
    <EditorToolbar
        :flow-name="flowName"
        :is-saving="isSaving"
        :is-modified="isModified"
        :is-running="isRunning"
        :is-web-recorder-open="isRecordOpen"
        :is-scrcpy-open="isScrcpyOpen"
        :last-saved-time="lastSavedTime"
        :view-mode="viewMode"

        @back="goBack"
        @edit-info="handleEditInfo"
        @toggle-selector="handleToggleSelector"
        @toggle-webpage="handleToggleWebpage"
        @toggle-scrcpy="handleToggleScrcpy"
        @run="handleRun"
        @stop="handleStop"
        @toggle-log="handleToggleLog"
        @open-app-view="handleAppView"
        @change-view="handleViewChange"
    />

    <main class="main-body">
      <!-- 录制面板 -->
      <transition name="panel-slide">
        <div v-show="(isRecordOpen || isScrcpyOpen) && viewMode === 'canvas'" class="left-panel"
             :style="{ width: panelWidth + 'px' }">
          <div v-if="isResizing" class="resize-mask"></div>
          <WebRecorder v-if="isRecordOpen" :show-url-input="true"/>
          <ScrcpyWindow v-else-if="isScrcpyOpen"/>
        </div>
      </transition>
      <div v-show="(isRecordOpen || isScrcpyOpen) && viewMode === 'canvas'" class="layout-resizer"
           @mousedown="startResize">
        <div class="resizer-line"></div>
      </div>

      <!-- 画布核心组件 -->
      <div class="canvas-container">
        <FlowCanvas

            v-show="viewMode === 'canvas'"
            ref="flowCanvasRef"
            :flow-id="flowId"
            v-model:flowName="flowName"
            @update:isSaving="isSaving = $event"
            @update:isModified="isModified = $event"
            @update:isRunning="isRunning = $event"
            @update:allNodes="handleAllNodesUpdate"
            @update:lastSavedTime="lastSavedTime = $event"
            @node-selected="selectedNode = $event"
        />
        <AppLogicView
            v-if="viewMode === 'app'"
        />
      </div>

      <!-- 右侧属性面板 -->
      <div v-show="viewMode === 'canvas'" class="prop-panel-wrapper">
        <PropertyPanel
            :node="selectedNode"
            :all-nodes="localAllNodes"
            :show="!!selectedNode"
            :schema="dynamicSchema"
            @close="selectedNode = null"
            @pick-var="handlePickVar"
        />
      </div>
    </main>
  </div>
</template>

<script setup>
import {ref} from 'vue'
import {useRoute, useRouter} from 'vue-router'
import {scanComponentsApi} from '@/api/workflow'

import EditorToolbar from './components/EditorToolbar.vue'
import WebRecorder from './components/GraphViewAndSmartCapture/WebRecorder.vue'
import FlowCanvas from './components/FlowCanvas.vue'
import PropertyPanel from '@/components/PropertyPanel.vue'
import AppLogicView from './components/GraphViewAndSmartCapture/AppLogicView.vue' // 🔥 引入新组件
import ScrcpyWindow from './components/ScrcpyWindow.vue'
import {useRecord} from './composables/useRecord'

const route = useRoute()
const router = useRouter()
// 🔥 修复：优先从 params 获取 ID (匹配 /editor/:id)，其次从 query 获取
const flowId = route.params.id || route.query.id

const flowCanvasRef = ref(null)
const flowName = ref('')
const isSaving = ref(false)
const isModified = ref(false)
const isRunning = ref(false)
const lastSavedTime = ref('') // 🔥 状态：上次保存时间
const isScrcpyOpen = ref(false) // 🔥 Scrcpy 面板状态
const selectedNode = ref(null)
const dynamicSchema = ref({})
const localAllNodes = ref([])
const viewMode = ref('canvas') // 🔥 默认是 canvas

const appLogs = ref([]) // 🔥 用来给 AppView 显示日志的

const handleViewChange = (mode) => {
  viewMode.value = mode
}
const clearAppLogs = () => {
  appLogs.value = []
}

const handleAllNodesUpdate = (nodes) => {
  localAllNodes.value = nodes
}

// 录制与布局逻辑
const {isRecordOpen, toggleWebpage} = useRecord()
const panelWidth = ref(585)

// 🔥 互斥切换逻辑
const handleToggleWebpage = () => {
  if (!isRecordOpen.value) {
    isScrcpyOpen.value = false // 打开录制时关闭 Scrcpy
  }
  toggleWebpage()
}

const handleToggleScrcpy = () => {
  isScrcpyOpen.value = !isScrcpyOpen.value
  if (isScrcpyOpen.value) {
    if (isRecordOpen.value) toggleWebpage() // 打开 Scrcpy 时关闭录制
    viewMode.value = 'canvas' // 确保在画布模式
  }
}

const isResizing = ref(false)
let startX = 0, startWidth = 0

const goBack = () => router.back()

const handleRun = () => flowCanvasRef.value?.handleRunCase()
const handleStop = () => flowCanvasRef.value?.stopRun()
const handleToggleSelector = () => flowCanvasRef.value?.toggleSelector()
const handleEditInfo = () => flowCanvasRef.value?.openInfoModal()
const handleToggleLog = () => flowCanvasRef.value?.toggleLogPanel()

const handlePickVar = (fieldKey) => {
  if (selectedNode.value) {
    flowCanvasRef.value?.startPickMode(selectedNode.value, fieldKey)
  }
}
const handleAppView = () => console.log('App View TODO')

scanComponentsApi().then(res => dynamicSchema.value = res)

const startResize = (e) => {
  isResizing.value = true
  startX = e.clientX
  startWidth = panelWidth.value
  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
  document.body.style.userSelect = 'none'
  document.body.style.cursor = 'col-resize'
}
const onMouseMove = (e) => {
  if (!isResizing.value) return
  const dx = e.clientX - startX
  let newWidth = startWidth + dx
  if (newWidth < 350) newWidth = 350
  if (newWidth > window.innerWidth - 350) newWidth = window.innerWidth - 400
  panelWidth.value = newWidth
}
const onMouseUp = () => {
  isResizing.value = false
  document.removeEventListener('mousemove', onMouseMove)
  document.removeEventListener('mouseup', onMouseUp)
  document.body.style.userSelect = ''
  document.body.style.cursor = ''
}
</script>
<style scoped>
.editor-layout {
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #f2f4f7;
  overflow: hidden;
}
/* 1. 基础布局透明化 */
.editor-layout {
  width: 100vw; height: 100vh;
  display: flex; flex-direction: column;
  background: #f8fafc; /* 降底色，作为保底 */
  position: relative; overflow: hidden;
}

/* 2. 液态背景核心动画 */
.liquid-bg {
  position: absolute; inset: 0;
  filter: blur(80px); /* 模糊度适中，确保性能 */
  z-index: 0; opacity: 0.6;
}
.blob {
  position: absolute; border-radius: 50%;
  animation: move 20s infinite alternate ease-in-out;
}
.b1 { width: 600px; height: 600px; background: #dee7ff; top: -10%; left: -5%; }
.b2 { width: 500px; height: 500px; background: #fff1f2; bottom: -5%; right: 10%; animation-delay: -5s; }
.b3 { width: 450px; height: 450px; background: #f0fdf4; top: 40%; left: 30%; animation-delay: -10s; }

@keyframes move {
  0% { transform: translate(0, 0) scale(1); }
  100% { transform: translate(100px, 50px) scale(1.1); }
}

/* 3. 面板毛玻璃化 */
.left-panel {
  flex-shrink: 0;
  background: rgba(255, 255, 255, 0.4) !important; /* 透明度降低 */
  backdrop-filter: blur(20px) saturate(160%); /* 毛玻璃核心 */
  border-right: 1px solid rgba(255, 255, 255, 0.5);
  z-index: 10;
}

.main-body {
  flex: 1; display: flex;
  position: relative; z-index: 1; /* 确保在背景之上 */
}

.canvas-container {
  flex: 1; background: transparent !important;
}

/* 属性面板容器也要透明 */
.prop-panel-wrapper {
  background: transparent;
}

.main-body {
  flex: 1;
  display: flex;
  position: relative;
  overflow: hidden;
}

.left-panel {
  flex-shrink: 0;
  border-right: 1px solid #e2e8f0;
  background: white;
  z-index: 10;
  display: flex;
  flex-direction: column;
  position: relative;
}

.resize-mask {
  position: absolute;
  inset: 0;
  z-index: 999;
}

.layout-resizer {
  width: 10px;
  margin-left: -5px;
  z-index: 50;
  cursor: col-resize;
  position: relative;
  flex-shrink: 0;
}

.layout-resizer:hover .resizer-line, .editor-layout.is-resizing .layout-resizer .resizer-line {
  background: #6366f1;
  opacity: 1;
}

.resizer-line {
  width: 2px;
  height: 100%;
  margin: 0 auto;
  transition: background 0.2s;
}

.editor-layout.is-resizing .left-panel {
  transition: none !important;
}

.canvas-container {
  flex: 1;
  position: relative;
  min-width: 0;
}

.panel-slide-enter-active, .panel-slide-leave-active {
  transition: all 0.3s ease;
}

.panel-slide-enter-from, .panel-slide-leave-to {
  width: 0 !important;
  opacity: 0;
}
</style>