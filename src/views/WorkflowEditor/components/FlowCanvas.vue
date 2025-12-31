<template>
  <div class="canvas-wrapper" ref="canvasWrapperRef" @mousemove="trackMouse">

    <!-- 1. 弹窗遮罩 -->
    <Teleport to="body">
      <transition name="fade">
        <!-- 🔥 永远居中：selector-overlay 使用 Flex 布局强制居中 -->
        <div v-if="showSelector" class="selector-overlay" @click.self="showSelector = false">
          <!-- 🔥 内层容器：不再接收任何位置样式，只保留 selectorStyle (现在它是空的) -->
          <div :style="selectorStyle" class="selector-content-wrapper">
            <NodeSelector :schema="dynamicSchema" @add-node="handleNodeSelection"/>
          </div>
        </div>
      </transition>
    </Teleport>

    <!-- 2. 拾取模式提示 -->
    <div v-if="isPickingMode" class="picking-banner">
      <span>🎯 请在画布中点击一个上游节点...</span>
      <button @click="cancelPickMode">取消选择</button>
    </div>

    <!-- 3. Vue Flow 核心 -->
    <VueFlow
        v-model="elements"
        :edge-types="edgeTypes"
        :is-valid-connection="checkConnection"
        :connection-radius="30"
        :default-edge-options="{
        type: 'custom',
        animated: false,
        style: { strokeWidth: 2, stroke: '#6366f1' },
        markerEnd: MarkerType.ArrowClosed,
        pathOptions: { curvature: 0.25 }
      }"
        :min-zoom="0.1"
        :max-zoom="2"
        :pan-on-scroll="interactionMode === 'touchpad'"
        :zoom-on-scroll="interactionMode === 'mouse'"
        :nodes-draggable="!isPickingMode && interactionMode === 'mouse'"
        :nodes-connectable="!isPickingMode"
        :elements-selectable="!isPickingMode"
        class="custom-flow"

        @nodeClick="onNodeClick"
        @paneClick="onPaneClick"
        @connect-start="onConnectStart"
        @connect="onConnect"
        @connect-end="onConnectEnd"

        @nodes-change="handleNodesChange"
        @edges-change="handleNodesChange"
    >
      <Background pattern-color="#aaa" :gap="20"/>

      <!-- 缩略图 -->
      <MiniMap
          :node-stroke-color="getMiniMapNodeColor"
          :node-color="getMiniMapNodeColor"
          pannable
          zoomable
          class="custom-minimap"
      />

      <template #node-custom="props">
        <CustomNode v-bind="props"/>
      </template>
      <template #node-if="props">
        <IfNode v-bind="props"/>
      </template>
      <template #node-group="props">
        <LoopGroupNode v-bind="props"/>
      </template>
    </VueFlow>

    <!-- 4. 悬浮工具栏 -->
    <div class="canvas-floating-controls">
      <div class="control-group">
        <button class="float-btn" :class="{ active: interactionMode === 'mouse' }" @click="interactionMode = 'mouse'"
                title="选择模式">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/>
          </svg>
        </button>
        <button class="float-btn" :class="{ active: interactionMode === 'touchpad' }"
                @click="interactionMode = 'touchpad'" title="抓手模式">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0"/>
            <path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2"/>
            <path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8"/>
            <path
                d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>
          </svg>
        </button>
      </div>
      <div class="control-group">
        <button class="float-btn" @click="layoutGraph('LR')" title="自动整理">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="7" height="7"/>
            <rect x="14" y="3" width="7" height="7"/>
            <rect x="14" y="14" width="7" height="7"/>
            <rect x="3" y="14" width="7" height="7"/>
          </svg>
        </button>
      </div>
      <div class="control-group">
        <button class="float-btn" @click="zoomOut">-</button>
        <span class="zoom-readout">{{ zoomPercentage }}%</span>
        <button class="float-btn" @click="zoomIn">+</button>
      </div>
    </div>

    <!-- 5. 日志面板 -->
    <transition name="slide-up">
      <LogPanel
          v-if="showLogPanel"
          v-model:search-query="searchQuery"
          :logs="logs"
          :filtered-logs="filteredLogs"
          :is-running="isRunning"
          @close="showLogPanel = false"
          @clear="clearLogs"
      />
    </transition>

    <!-- 6. 变量选择器 -->
    <VariablePicker
        v-if="showVarPicker"
        :picked-node="pickedNode"
        :vars="getNodeOutputVars(pickedNode)"
        :target-type="pickingFieldType"
        @select="confirmVariable"
        @close="showVarPicker = false"
    />

    <!-- 8. 可视化热区选择器 (CaseEditor) -->
    <Teleport to="body">
      <div v-if="showVisualPicker" class="visual-picker-overlay" @click.self="showVisualPicker = false">
        <div class="visual-picker-modal">
          <CaseEditor
              v-if="showVisualPicker"
              :node-data="pickedNode?.data || selectedNodeForPick?.data"
              :app-id="currentAppId"
              :is-picker="true"
              @pick="handleVisualPick"
              @close="showVisualPicker = false"
          />
        </div>
      </div>
    </Teleport>

    <!-- 7. 信息弹窗 -->
    <FlowInfoModal
        v-if="showInfoModal"
        v-model:flowName="flowName"
        v-model:flowDescription="flowDescription"
        :workflow-id="workflowId"
        @close="showInfoModal = false"
    />

  </div>
</template>

<script setup>
import {ref, computed, onMounted, onUnmounted, nextTick, markRaw, watch, defineAsyncComponent} from 'vue'
import {useRoute} from 'vue-router'
import {ElMessage} from 'element-plus'
import {VueFlow, useVueFlow, MarkerType} from '@vue-flow/core'
import {Background} from '@vue-flow/background'
import {MiniMap} from '@vue-flow/minimap'
import '@vue-flow/minimap/dist/style.css'

import CustomNode from '@/components/CustomNode.vue'
import IfNode from '@/components/IfNode.vue'
import LoopGroupNode from '@/components/LoopGroupNode.vue'
import CustomEdge from '@/components/CustomEdge.vue'
import NodeSelector from '@/components/NodeSelector.vue'
import ResultNode from '@/views/WorkflowEditor/components/ResultNode.vue'

import LogPanel from './LogPanel.vue'
import VariablePicker from './VariablePicker.vue'
import FlowInfoModal from './FlowInfoModal.vue'

import {scanComponentsApi, fetchWorkflowDetailSimple} from '@/api/workflow'
import {useGraphOperations} from '../composables/useGraphOperations'
import {useFlowPersistence} from '../composables/useFlowPersistence'
import {useFlowRun, resetNodeStatus} from '../composables/useFlowRun'
import {useKeyboardShortcuts} from '../composables/useKeyboardShortcuts'

// 动态引入 CaseEditor
const CaseEditor = defineAsyncComponent(() => import('@/views/WorkReport/components/CaseEditor.vue'))

const route = useRoute()

const props = defineProps({
  flowId: String,
  appId: String
})

const emit = defineEmits([
  'node-selected',
  'update:flowName',
  'update:isSaving',
  'update:isModified',
  'update:isRunning',
  'update:allNodes',
  'update:lastSavedTime'
])

// 修改 nodeTypes
const nodeTypes = {
  custom: markRaw(CustomNode),
  if: markRaw(IfNode),
  group: markRaw(LoopGroupNode),
  result: markRaw(ResultNode) // 注册新组件
}

const edgeTypes = {custom: markRaw(CustomEdge)}

const {
  addEdges, addNodes, removeNodes, project, findNode,
  updateNode, viewport, zoomIn, zoomOut, fitView,
  getNodes, getEdges, setNodes, setEdges,
  onConnect: vueFlowOnConnect,
  onConnectStart: vueFlowOnConnectStart,
  onConnectEnd: vueFlowOnConnectEnd,
  onNodeClick: vueFlowNodeClick,
  onPaneClick: vueFlowPaneClick
} = useVueFlow()

const isPickingMode = ref(false)
const showSelector = ref(false)
const selectorStyle = ref({})

const {
  pendingAction, checkConnection, layoutGraph, handleSplitEdge, handleNodeSelection: originalHandleNodeSelection
} = useGraphOperations(isPickingMode, showSelector, selectorStyle)

const elements = ref([])
const flowName = ref('未命名流程')
const flowDescription = ref('')
const dynamicSchema = ref({})
const interactionMode = ref('mouse')
const zoomPercentage = computed(() => Math.round(viewport.value.zoom * 100))

const showLogPanel = ref(false)
const showInfoModal = ref(false)

const showVarPicker = ref(false)
const showVisualPicker = ref(false)
const pickedNode = ref(null)
const pickingTargetField = ref('')
const selectedNodeForPick = ref(null)
const validUpstreamNodes = ref(new Set())
const currentAppId = ref(null)

const {
  performSave, isSaving, isModified, loadFlowFromId, setupAutoSave, lastSavedTime, workflowId
} = useFlowPersistence(getNodes, getEdges, setNodes, setEdges, flowName, flowDescription, dynamicSchema)

watch(isSaving, (val) => emit('update:isSaving', val))
watch(isModified, (val) => emit('update:isModified', val))
watch(flowName, (val) => emit('update:flowName', val))
watch(lastSavedTime, (val) => emit('update:lastSavedTime', val))


const {
  isRunning, logs, searchQuery, logBodyRef, filteredLogs,
  handleRunCase, stopRun, clearLogs,
  setupRunListeners, removeRunListeners
} = useFlowRun(performSave, workflowId, showLogPanel, elements)

watch(isRunning, (val) => emit('update:isRunning', val))

const handleNodesChange = () => {
  emit('update:allNodes', getNodes.value)
}

const toggleLogPanel = () => {
  showLogPanel.value = !showLogPanel.value
}

const getAllAncestors = (nodeId) => {
  const ancestors = new Set()
  const queue = [nodeId]
  const reverseMap = {}
  getEdges.value.forEach(e => {
    if (!reverseMap[e.target]) reverseMap[e.target] = []
    reverseMap[e.target].push(e.source)
  })
  while (queue.length) {
    const curr = queue.shift()
    const parents = reverseMap[curr] || []
    parents.forEach(p => {
      if (!ancestors.has(p)) {
        ancestors.add(p);
        queue.push(p)
      }
    })
  }
  return ancestors
}

// 辅助：获取字段类型
const getFieldType = (node, fieldKey) => {
  if (!node || !fieldKey) return 'any'
  // 1. 尝试直接获取
  let schema = dynamicSchema.value[node.data.nodeCode]

  // 2. 遍历分组查找
  if (!schema) {
    for (const group of Object.values(dynamicSchema.value)) {
      if (group.details) {
        const found = Object.values(group.details).find(def => def.address === node.data.nodeCode)
        if (found) {
          schema = found;
          break
        }
      }
    }
  }
  if (!schema) return 'any'

  // 3. 查找字段定义
  const simpleField = schema.inputs?.find(f => f.name === fieldKey)
  if (simpleField) return simpleField.type

  return 'any'
}

const startPickMode = async (node, fieldKey) => {
  if (!node) return
  selectedNodeForPick.value = node
  pickingTargetField.value = fieldKey

  // 🔥 优化：如果是热区选择，直接打开 AppGraph 选择器，不再需要先选节点
  const type = getFieldType(node, fieldKey)
  if (type === 'interaction_select') {
    // 如果有当前 AppID，直接打开可视化选择器
    let appId = currentAppId.value || route.query.appId || route.params.appId || props.appId

    // 🔥 关键修复：如果当前没有 appId 但有 flowId，尝试现场查询 (防止 onMounted 还没查完或者查失败)
    if (!appId && props.flowId) {
      try {
        const res = await fetchWorkflowDetailSimple(props.flowId)
        if (res.code === 200 && res.data) {
          // 兼容后端可能返回 app_id 或 appId
          appId = res.data.app_id || res.data.appId
          currentAppId.value = appId
        }
      } catch (e) {
        console.error('JIT fetch workflow detail failed', e)
      }
    }

    if (appId) {
      if (!currentAppId.value) currentAppId.value = appId
      await nextTick()
      showVisualPicker.value = true
    } else {
      ElMessage.warning('未找到关联的应用ID，无法打开热区选择器')
    }
    return
  }

  isPickingMode.value = true
  validUpstreamNodes.value = getAllAncestors(node.id)
  getNodes.value.forEach(n => {
    n.class = validUpstreamNodes.value.has(n.id) ? 'node-selectable' : 'node-disabled'
  })
}

const cancelPickMode = () => {
  isPickingMode.value = false
  showVarPicker.value = false
  showVisualPicker.value = false
  pickingTargetField.value = ''
  pickedNode.value = null
  selectedNodeForPick.value = null
  getNodes.value.forEach(n => n.class = '')
}

const confirmVariable = (varKey) => {
  if (!selectedNodeForPick.value || !pickedNode.value) return
  const variableStr = `{{${pickedNode.value.id}.${varKey}}}`
  const currentNode = findNode(selectedNodeForPick.value.id)
  if (currentNode) {
    if (pickingTargetField.value.startsWith('condition:')) {
      // 条件处理
    } else {
      const newData = {...currentNode.data}
      newData[pickingTargetField.value] = variableStr
      currentNode.data = newData
    }
  }
  cancelPickMode()
}

const handleVisualPick = (payload) => {
  const val = (typeof payload === 'object') ? (payload.id || payload.uid) : payload

  // 🔥 直接赋值，不依赖 confirmVariable (因为它需要 pickedNode)
  if (selectedNodeForPick.value) {
    const currentNode = findNode(selectedNodeForPick.value.id)
    if (currentNode) {
      const newData = {...currentNode.data}
      newData[pickingTargetField.value] = val
      currentNode.data = newData
    }
  }
  cancelPickMode()
}

const getNodeOutputVars = (node) => {
  if (!node) return []
  const s = dynamicSchema.value[node.data.nodeCode]
  return s?.outputVars || []
}

const pickingFieldType = computed(() => {
  if (!selectedNodeForPick.value || !pickingTargetField.value) return 'any'
  const node = selectedNodeForPick.value

  // 1. 尝试直接获取
  let schema = dynamicSchema.value[node.data.nodeCode]

  // 2. 如果没找到，尝试遍历分组结构查找 (修复 PropertyPanel 都能找到但这里找不到的问题)
  if (!schema) {
    for (const group of Object.values(dynamicSchema.value)) {
      if (group.details) {
        const found = Object.values(group.details).find(def => def.address === node.data.nodeCode)
        if (found) {
          schema = found;
          break
        }
      }
    }
  }

  if (!schema) return 'any'

  const fieldKey = pickingTargetField.value

  // 1. Simple field
  const simpleField = schema.inputs?.find(f => f.name === fieldKey)
  if (simpleField) return simpleField.type

  // 2. List subfield: listName[index].subName
  const listMatch = fieldKey.match(/^(.+)\[\d+\]\.(.+)$/)
  if (listMatch) {
    const listName = listMatch[1]
    const subName = listMatch[2]
    const listField = schema.inputs?.find(f => f.name === listName)
    if (listField?.sub_inputs) {
      const sub = listField.sub_inputs.find(s => s.name === subName)
      console.log('[FlowCanvas] Found list sub-field type:', sub?.type)
      return sub?.type
    }
  }

  return 'any'
})

// === 事件处理 ===
const onNodeClick = (e) => {
  if (isPickingMode.value) {
    if (validUpstreamNodes.value.has(e.node.id)) {
      pickedNode.value = e.node
      if (pickingFieldType.value === 'interaction_select') {
        showVisualPicker.value = true
      } else {
        showVarPicker.value = true
      }
    }
    return
  }
  emit('node-selected', e.node)
  showSelector.value = false
}

const onPaneClick = () => {
  if (isPickingMode.value) {
    cancelPickMode();
    return
  }
  emit('node-selected', null)
  showSelector.value = false
}

const handleNodeSelection = (item) => {
  originalHandleNodeSelection(item)
  handleNodesChange()
}

// 拖拽连线
const dragStartParams = ref(null)
const isConnectSuccess = ref(false)

const onConnectStart = (params) => {
  if (isPickingMode.value) return;
  isConnectSuccess.value = false;
  dragStartParams.value = {nodeId: params.nodeId, handleId: params.handleId}
}

const onConnect = (params) => {
  if (isPickingMode.value) return;
  isConnectSuccess.value = true;
  addEdges(params)
}

// 🔥🔥 onConnectEnd：拖拽结束时 🔥🔥
const onConnectEnd = async (event) => {
  if (isPickingMode.value) return;
  if (isConnectSuccess.value) {
    dragStartParams.value = null;
    return
  }

  if (!dragStartParams.value) return

  const {nodeId: sourceId, handleId: sourceHandle} = dragStartParams.value

  const rawEvent = event.event || event;
  if (rawEvent.target?.closest?.('.vue-flow__handle')) {
    dragStartParams.value = null;
    return
  }

  let clientX, clientY;
  if (rawEvent.clientX) {
    clientX = rawEvent.clientX;
    clientY = rawEvent.clientY
  } else if (rawEvent.changedTouches?.[0]) {
    clientX = rawEvent.changedTouches[0].clientX;
    clientY = rawEvent.changedTouches[0].clientY
  }

  if (!clientX) return;
  const point = project({x: clientX, y: clientY});

  // 设置待处理的操作（这里记录了逻辑上的落点，但不会影响弹窗的位置）
  pendingAction.value = {
    type: 'replace-temp',
    sourceId: sourceId,
    sourceHandle: sourceHandle,
    position: point
  }

  const tempId = 'temp_draft_node_' + Date.now();
  addNodes([{id: tempId, type: 'default', position: point, style: {width: '1px', height: '1px', opacity: 0}, data: {}}])

  setTimeout(() => {
    if (findNode(tempId)) {
      addEdges([{
        id: 'temp_draft_edge',
        source: sourceId,
        sourceHandle: sourceHandle,
        target: tempId,
        targetHandle: 'left',
        type: 'custom',
        animated: false
      }]);

      // 🔥🔥 关键修改：强制清空 selectorStyle，让 CSS Flexbox 永远接管位置，实现永远居中 🔥🔥
      selectorStyle.value = {};

      showSelector.value = true
      pendingAction.value.tempNodeId = tempId
    }
  }, 10)

  dragStartParams.value = null
}

let mouseX = 0, mouseY = 0
const trackMouse = (e) => {
  mouseX = e.clientX;
  mouseY = e.clientY
}

const toggleSelector = () => {
  if (isPickingMode.value) return
  const cx = window.innerWidth / 2
  const cy = window.innerHeight / 2
  const point = project({x: cx, y: cy})
  pendingAction.value = {type: 'add-standalone', position: point}

  // 🔥🔥 关键修改：保持为空，由 CSS 控制居中
  selectorStyle.value = {}

  showSelector.value = !showSelector.value
}

const openInfoModal = () => showInfoModal.value = true

onMounted(async () => {
  dynamicSchema.value = await scanComponentsApi()
  if (props.flowId) {
    const loaded = await loadFlowFromId(props.flowId)
    if (loaded) {
      resetNodeStatus(elements);
      await nextTick();
      fitView({padding: 0.2});
      layoutGraph('LR')
    }
  } else {
    flowName.value = `flow_${Date.now()}`
    elements.value = [{
      id: `public-trigger-${Date.now()}`,
      type: 'custom',
      position: {x: 100, y: 200},
      data: {label: '开始-123', nodeCode: 'public/trigger', outputs: []}
    }]
  }

  // 🔥 优先从 URL 获取 appId (确保新建流程也能拿到)
  if (route.query.appId || route.params.appId) {
    currentAppId.value = route.query.appId || route.params.appId
  }

  // 🔥 获取当前流程所属的 AppID
  if (props.flowId) {
    try {
      const res = await fetchWorkflowDetailSimple(props.flowId)
      if (res.code === 200 && res.data) {
        currentAppId.value = res.data.app_id || res.data.appId
      }
    } catch (e) {
      console.error('Fetch workflow detail failed', e)
    }
  }

  window.addEventListener('split-edge', handleSplitEdge)
  setupRunListeners()
  useKeyboardShortcuts({save: performSave, run: handleRunCase})
  setTimeout(() => setupAutoSave(elements), 2000)
})

onUnmounted(() => {
  window.removeEventListener('split-edge', handleSplitEdge)
  removeRunListeners()
})

defineExpose({
  performSave,
  handleRunCase,
  stopRun,
  toggleSelector,
  openInfoModal,
  startPickMode,
  toggleLogPanel
})

const getMiniMapNodeColor = (node) => {
  if (node.type === 'input') return '#6366f1'
  if (node.type === 'output') return '#10b981'
  return '#cbd5e1'
}
</script>

<style scoped>
.canvas-wrapper {
  width: 100%;
  height: 100%;
  position: relative;
  background: #f8fafc;
}

.custom-flow {
  width: 100%;
  height: 100%;
}

.canvas-floating-controls {
  position: absolute;
  left: 20px;
  bottom: 20px;
  z-index: 5;
  display: flex;
  gap: 12px;
}

.control-group {
  display: flex;
  align-items: center;
  background: white;
  border-radius: 8px;
  padding: 4px;
  border: 1px solid #e2e8f0;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

.float-btn {
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  border-radius: 6px;
  color: #64748b;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.float-btn:hover {
  background: #f1f5f9;
  color: #0f172a;
}

.float-btn.active {
  background: #e0e7ff;
  color: #6366f1;
}

.zoom-readout {
  font-size: 12px;
  font-weight: 600;
  color: #475569;
  min-width: 40px;
  text-align: center;
}

/* 缩略图样式 */
:deep(.vue-flow__minimap) {
  background: white;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
  bottom: 20px;
  right: 20px;
}

/*
   🔥🔥 核心 CSS 修改：强制 Flex 居中 🔥🔥
*/
.selector-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(0, 0, 0, 0.6);
  display: flex; /* 启用 Flexbox */
  justify-content: center; /* 水平居中 */
  align-items: center; /* 垂直居中 */
}

/*
   selector-content-wrapper 不再设置 position: absolute。
   当 selectorStyle 为空时，它就是 Flex 容器里的一个普通子元素，会被自动居中。
*/
.selector-content-wrapper {
  /* 无需额外样式 */
}

.picking-banner {
  position: absolute;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.8);
  color: white;
  padding: 8px 16px;
  border-radius: 20px;
  z-index: 50;
  display: flex;
  align-items: center;
  gap: 10px;
}

.picking-banner button {
  background: white;
  color: black;
  border: none;
  padding: 2px 10px;
  border-radius: 12px;
  cursor: pointer;
}

.slide-up-enter-active, .slide-up-leave-active {
  transition: transform 0.3s ease;
}

.slide-up-enter-from, .slide-up-leave-to {
  transform: translateY(100%);
}

.fade-enter-active, .fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from, .fade-leave-to {
  opacity: 0;
}

/* 1. 画布整体透明 */
.canvas-wrapper {
  width: 100%;
  height: 100%;
  position: relative;
  background: transparent !important; /* 必须透明看穿到底层 */
}

/* 2. 浮动控件组：水滴感 */
.control-group {
  display: flex;
  align-items: center;
  background: rgba(255, 255, 255, 0.4) !important;
  backdrop-filter: blur(12px);
  border-radius: 12px;
  padding: 6px;
  border: 1px solid rgba(255, 255, 255, 0.6);
  box-shadow: 0 8px 32px rgba(31, 38, 135, 0.07);
}

.float-btn {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.float-btn:hover {
  background: rgba(255, 255, 255, 0.6);
  transform: scale(1.1);
}

.float-btn.active {
  background: #6366f1 !important;
  color: white !important;
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4);
}

/* 3. 缩略图 MiniMap 玻璃化 */
:deep(.vue-flow__minimap) {
  background: rgba(255, 255, 255, 0.3) !important;
  backdrop-filter: blur(10px);
  border-radius: 16px !important;
  border: 1px solid rgba(255, 255, 255, 0.5) !important;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.05);
}

/* 4. 节点选择器弹窗遮罩 */
.selector-overlay {
  background: rgba(255, 255, 255, 0.2) !important; /* 不再是黑色遮罩 */
  backdrop-filter: blur(15px); /* 增强模糊感 */
}

/* 5. 拾取模式 Banner */
.picking-banner {
  background: rgba(99, 102, 241, 0.8) !important;
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.3);
}

.visual-picker-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(4px);
}

.visual-picker-modal {
  width: 90vw;
  height: 90vh;
  background: white;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
}
</style>