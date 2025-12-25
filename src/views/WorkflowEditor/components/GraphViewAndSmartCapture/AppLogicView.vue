<template>
  <div class="logic-view-container">

    <div v-if="!currentApp" class="app-list-view" key="list-view">
      <div class="list-header">
        <div class="header-left">
          <h2>应用图谱库</h2>
          <p>管理所有客户端页面的跳转逻辑与交互组件清单。</p>
        </div>
        <button class="create-btn" @click="openCreateModal">➕ 新建图谱</button>
      </div>

      <div v-if="appList.length === 0" class="empty-list-state">
        <div class="empty-icon">📂</div>
        <p>暂无应用数据</p>
        <button class="create-btn small" @click="openCreateModal">立即创建</button>
      </div>

      <div class="app-grid" v-else>
        <div v-for="app in appList" :key="app.id" class="app-card" @click="enterApp(app)">
          <div class="app-icon">{{ app.icon || '📱' }}</div>
          <div class="app-info">
            <div class="info-top"><h3>{{ app.name }}</h3></div>
            <p>{{ app.desc || '暂无描述' }}</p>
            <div class="app-meta"><span>ID: {{ app.id }}</span></div>
          </div>
        </div>
      </div>
    </div>

    <div v-else class="logic-canvas-wrapper" key="graph-view">
      <div class="canvas-toolbar">
        <div class="toolbar-left-group">
          <!-- 1. 返回按钮卡片 -->
          <div class="toolbar-card back-card" @click="exitApp">
            <span class="back-icon">◀</span>
            <span class="back-text">返回列表</span>
          </div>

          <!-- 2. 应用信息卡片 (名称 + 状态) -->
          <div class="toolbar-card info-card">
            <div class="app-name">{{ currentApp.name }}</div>
            <div class="save-status-container">
              <Transition name="fade" mode="out-in">
                <div v-if="saveStatus === 'saving'" key="saving" class="status-item saving">
                  <div class="mini-spinner"></div>
                  <span>正在保存...</span>
                </div>
                <div v-else-if="saveStatus === 'saved'" key="saved" class="status-item saved">
                  <span class="check-icon"></span>
                  <span>已保存 {{ lastSavedTime }}</span>
                </div>
                <div v-else-if="saveStatus === 'unsaved'" key="unsaved" class="status-item unsaved">
                  <span>⚠️ 未保存</span>
                </div>
              </Transition>
            </div>
          </div>
        </div>

        <div class="right">
          <button class="tool-btn" @click="handleAddPage">➕ 新建页面</button>
        </div>
      </div>

      <div class="canvas-area">
        <VueFlow
            v-if="graphKey"
            :key="graphKey"
            v-model:nodes="nodes"
            v-model:edges="edges"
            :node-types="nodeTypes"
            :default-edge-options="defaultEdgeOptions"
            :min-zoom="0.1"
            :max-zoom="4"
            @pane-ready="onPaneReady"
            @node-drag-stop="triggerAutoSave"
            @nodes-change="onNodesChange"
            @edges-change="onEdgesChange"
            @error="onGraphError"
            @connect="onConnect"
            @node-mouse-enter="onNodeMouseEnter"
            @node-mouse-leave="onNodeMouseLeave"
        >
          <Background pattern-color="#cbd5e1" :gap="20"/>

          <MiniMap
              v-if="isMapReady"
              pannable
              zoomable
              :node-color="() => '#cbd5e1'"
              class="logic-minimap"
          />
          <Controls
              v-if="isMapReady"
              class="logic-controls"
              :show-interactive="false"
          />

          <template #node-page="props">
            <PageNode v-bind="props" :graph-id="currentApp.id" @open-manager="openNodeManager"/>
          </template>
        </VueFlow>

        <div v-if="!isMapReady" class="loading-state">
          <div class="loading-spinner"></div>
          <div>正在初始化引擎...</div>
        </div>
      </div>
    </div>

    <Teleport to="body">
      <div v-if="showDetailEditor && currentApp" class="editor-portal-wrapper">
        <PageDetailEditor
            :node-data="editingNodeData"
            :graph-id="currentApp.id"
            :node-id="editingNodeId"
            @close="closeEditor"
            @save="handleEditorSave"
        />
      </div>
    </Teleport>

    <div v-if="showCreateModal" class="modal-overlay">
      <div class="modal-window">
        <h3>新建应用图谱</h3>
        <div class="form-item"><label>名称</label><input v-model="createForm.name"/></div>
        <div class="form-item"><label>描述</label><input v-model="createForm.desc"/></div>
        <div class="modal-footer">
          <button class="tool-btn" @click="showCreateModal = false">取消</button>
          <button class="create-btn" @click="confirmCreateApp">确定</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, markRaw, onMounted, nextTick, watch } from 'vue'
import { VueFlow, MarkerType, addEdge } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { MiniMap } from '@vue-flow/minimap'
import { Controls } from '@vue-flow/controls'

// 🔥 1. 必须引入核心样式，否则 ResizeObserver 会因为无法获取节点尺寸而崩溃
import '@vue-flow/core/dist/style.css'
import '@vue-flow/minimap/dist/style.css'
import '@vue-flow/controls/dist/style.css'

import PageNode from './PageNode.vue'
import PageDetailEditor from './PageDetailEditor.vue'
import { fetchAppList, createAppGraph, getGraphDetail, syncGraphLayout, addEmptyNode } from '@/api/appGraph'

// 将 nodeTypes 定义在 setup 外面或作为非响应式常量，避免不必要的重新渲染
const nodeTypes = { page: markRaw(PageNode) }

// 🔥 全局状态 (分离 Nodes 和 Edges)
const currentApp = ref(null)
const appList = ref([])
const nodes = ref([])
const edges = ref([])

// 🔥 核心控制开关
const graphKey = ref(null)
const isMapReady = ref(false)
let flowInstance = null

const showDetailEditor = ref(false)
const editingNodeId = ref(null)
const editingNodeData = ref(null)
const showCreateModal = ref(false)
const createForm = reactive({ name: '', desc: '' })

// 🔥 自动保存相关状态
const saveStatus = ref('saved') // 'saved', 'saving', 'unsaved'
const lastSavedTime = ref('')
let autoSaveTimer = null

const defaultEdgeOptions = {
  type: 'default',
  markerEnd: MarkerType.ArrowClosed,
  // 🔥 调整：连接线变细 (1.5px)，颜色保持主题色
  style: { strokeWidth: 1.5, stroke: '#6366f1' },
  labelStyle: { fill: '#1e293b', fontWeight: 700, fontSize: 12, padding: 2 },
  zIndex: 2000
}

const loadList = async () => {
  try { const res = await fetchAppList(); if (res.code === 200) appList.value = res.data } catch (e) { console.error(e) }
}

// 🔥 进入应用逻辑：分离数据清洗
const enterApp = async (app) => {
  // 1. 销毁
  graphKey.value = null
  isMapReady.value = false
  nodes.value = []
  edges.value = []
  flowInstance = null
  currentApp.value = app

  await nextTick()

  try {
    const res = await getGraphDetail(app.id)
    if (res.code === 200) {
      // 深拷贝切断 Proxy 链，并防止 data 为 null 导致崩溃
      const rawData = res.data ? JSON.parse(JSON.stringify(res.data)) : { nodes: [], edges: [] }

      // 2. 清洗节点
      const safeNodes = (rawData.nodes || [])
        .filter(n => n && typeof n === 'object' && n.id)
        .map(n => ({
          id: String(n.id), // 强制 ID 为字符串
          type: n.type || 'page',
          position: { x: Number(n.position?.x) || 0, y: Number(n.position?.y) || 0 }, // 强制坐标为数字
          data: n.data || { label: '未命名', interactions: [] },
          // 移除可能引起内部状态冲突的字段
          selected: undefined,
          dragging: undefined
        }))

      // 3. 清洗边
      const nodeIds = new Set(safeNodes.map(n => n.id))
      const safeEdges = (rawData.edges || [])
        .filter(e => e && e.source && e.target)
        .map(e => ({
          id: String(e.id),
          source: String(e.source),
          target: String(e.target),
          sourceHandle: e.sourceHandle ? String(e.sourceHandle) : undefined,
          targetHandle: e.targetHandle ? String(e.targetHandle) : undefined,
          label: e.label,
          data: e.data
        }))
        .filter(e => nodeIds.has(e.source) && nodeIds.has(e.target))

      // 4. 分别赋值，避免 elements 混合解析错误
      nodes.value = safeNodes
      edges.value = safeEdges

      await nextTick()
      graphKey.value = `app-flow-${Date.now()}`
    } else {
      graphKey.value = `app-flow-${Date.now()}`
    }
  } catch (e) {
    console.error(e)
    graphKey.value = `app-flow-${Date.now()}`
  }

  // 🔥 安全兜底：如果 2秒内 onPaneReady 没触发（例如 VueFlow 初始化异常），强制结束 loading
  // 避免界面一直卡在 "正在初始化引擎..."
  setTimeout(() => {
    if (!isMapReady.value) {
      console.warn('Graph init timeout, forcing ready state')
      isMapReady.value = true
    }
  }, 2000)
}

const onGraphError = (err) => {
  console.error('VueFlow Error:', err)
  isMapReady.value = true
}

// 🔥 自动保存逻辑
const triggerAutoSave = () => {
  saveStatus.value = 'saving' // 先显示正在保存，利用 debounce 延迟实际请求
  if (autoSaveTimer) clearTimeout(autoSaveTimer)
  
  autoSaveTimer = setTimeout(() => {
    handleSaveLayout()
  }, 1000) // 1秒防抖
}

// 监听节点/边变化 (删除等操作)
const onNodesChange = (changes) => {
  if (changes.some(c => c.type === 'remove' || c.type === 'add')) triggerAutoSave()
}
const onEdgesChange = (changes) => {
  if (changes.some(c => c.type === 'remove' || c.type === 'add')) triggerAutoSave()
}

// 🔥 核心修复：监听连线事件，否则拖拽连接无效
const onConnect = (params) => {
  edges.value = addEdge(params, edges.value)
  triggerAutoSave()
}

// 🔥 交互优化：鼠标悬停节点时，自动加粗连接线 (模拟放大效果)
const onNodeMouseEnter = ({ node }) => {
  edges.value = edges.value.map(e => {
    if (e.source === node.id || e.target === node.id) {
      // 高亮连接线：加粗 + 提升层级
      return { ...e, style: { ...e.style, strokeWidth: 4 }, zIndex: 2001, animated: true }
    }
    return e
  })
}

const onNodeMouseLeave = ({ node }) => {
  edges.value = edges.value.map(e => {
    if (e.source === node.id || e.target === node.id) {
      // 恢复默认：变细
      return { ...e, style: { ...e.style, strokeWidth: 1.5 }, zIndex: 2000, animated: false }
    }
    return e
  })
}

const onPaneReady = (instance) => {
  console.log('Graph Engine Ready')
  flowInstance = instance
  try {
    instance.fitView({ padding: 0.2 })
  } catch (e) { /* ignore fitView error */ }
  setTimeout(() => { isMapReady.value = true }, 500)
}

const exitApp = async () => {
  showDetailEditor.value = false
  isMapReady.value = false
  graphKey.value = null
  flowInstance = null
  await nextTick()
  nodes.value = []
  edges.value = []
  currentApp.value = null
  loadList()
}

// 这里的保存逻辑也要修改，因为不再使用 elements
const handleSaveLayout = async () => {
  if (!currentApp.value || !flowInstance) return
  saveStatus.value = 'saving'
  try {
    const obj = flowInstance.toObject()
    // toObject 仍然会返回 nodes 和 edges，可以直接用
    const saveNodes = obj.nodes.map(n => ({ id: n.id, position: n.position }))
    const saveEdges = obj.edges.map(e => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle, label: e.label, trigger: e.data?.trigger }))
    await syncGraphLayout({ graph_id: currentApp.value.id, nodes: saveNodes, edges: saveEdges })
    saveStatus.value = 'saved'
    lastSavedTime.value = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch (e) {
    console.error('保存布局失败:', e)
    saveStatus.value = 'unsaved'
  }
}

// 新建节点也要推入 nodes 数组
const handleAddPage = async () => {
  if (!currentApp.value) return
  
  // 🔥 智能计算新节点位置：放在最右侧节点的右边，避免重叠
  let startX = 100
  let startY = 100
  
  if (nodes.value.length > 0) {
    // 找到最右侧的节点
    let maxX = -Infinity
    let refY = 100
    nodes.value.forEach(n => {
      if (n.position.x > maxX) {
        maxX = n.position.x
        refY = n.position.y
      }
    })
    startX = maxX + 300 // 间隔 300px
    startY = refY
  }

  const nid = `n-${Date.now()}-${Math.floor(Math.random() * 1000)}`
  await addEmptyNode(currentApp.value.id, nid, startX, startY)
  // 直接操作 nodes 数组
  const newNode = {
    id: nid,
    type: 'page',
    position: {x: startX, y: startY},
    data: { label:'新页面', interactions:[] }
  }
  // VueFlow 的 addNodes 工具函数更安全，或者直接 push
  if(flowInstance) {
      flowInstance.addNodes([newNode])
      // 🔥 聚焦到新节点，但限制最大缩放比例，防止贴得太近
      // 改用 setTimeout 确保 DOM 渲染完成且 VueFlow 内部已获取到节点尺寸
      setTimeout(() => {
        flowInstance.fitView({ 
          nodes: [nid], 
          padding: 0.5, // 留白多一点
          maxZoom: 1, // 保持 1:1 或更小，不放大
          duration: 800 
        })
      }, 100)
  } else {
      nodes.value.push(newNode)
  }
  triggerAutoSave()
}

const openNodeManager = (nodeId) => {
  let node = null
  if (flowInstance) {
      node = flowInstance.findNode(nodeId)
  } else {
      // 回退查找
      node = nodes.value.find(n => n.id === nodeId)
  }

  if (!node) return
  editingNodeId.value = nodeId
  editingNodeData.value = JSON.parse(JSON.stringify(node.data))
  showDetailEditor.value = true
}

const closeEditor = () => {
  showDetailEditor.value = false
  setTimeout(() => { editingNodeId.value = null; editingNodeData.value = null }, 300)
}

const handleEditorSave = (payload) => {
  // 1. 找到对应的 node
  const node = nodes.value.find(n => n.id === payload.node_id)
  if (node) {
    // 2. 更新数据，必须创建一个新对象触发响应式
    // 注意：payload.components 传回来的是带 rect 对象的，我们需要在这里把它转平，
    // 以便 PageNode 或者下一次打开 Editor 时能正确读取。
    const flatInteractions = payload.components.map(c => {
        const { rect, ...rest } = c // 解构移除 rect 对象，保持数据扁平
        return {
            ...rest,
            x: rect ? rect.x : c.x,
            y: rect ? rect.y : c.y,
            w: rect ? rect.w : c.w,
            h: rect ? rect.h : c.h
        }
    })

    node.data = {
        ...node.data,
        label: payload.label,
        screenshot: payload.screenshot,
        interactions: flatInteractions
    }
  }
  closeEditor()
}
const openCreateModal = () => { createForm.name = ''; createForm.desc = ''; showCreateModal.value = true }
const confirmCreateApp = async () => {
  if (!createForm.name) return alert('请输入名称')
  try { const res = await createAppGraph(createForm.name, createForm.desc); if (res.code === 200) { showCreateModal.value = false; loadList() } } catch (e) { alert(e.message) }
}

onMounted(loadList)
</script>

<style scoped>
/* 样式复用之前版本，这里为了简洁省略部分通用样式，请保留你现有的 style */
.logic-view-container {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #f8fafc;
}

.app-list-view {
  padding: 40px;
  flex: 1;
  overflow-y: auto;
}

.list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 30px;
}

.app-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 20px;
}

.app-card {
  background: white;
  padding: 20px;
  border-radius: 12px;
  cursor: pointer;
  border: 1px solid #e2e8f0;
  transition: all 0.2s;
}

.app-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 10px 20px rgba(0, 0, 0, 0.05);
  border-color: #6366f1;
}

.app-icon {
  width: 48px;
  height: 48px;
  background: #e0e7ff;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
}

.app-info h3 {
  margin: 0;
  font-size: 16px;
  color: #1e293b;
}

.app-info p {
  margin: 4px 0 12px;
  font-size: 13px;
  color: #64748b;
  height: 40px;
  overflow: hidden;
}

.app-meta {
  font-size: 12px;
  color: #94a3b8;
  display: flex;
  gap: 10px;
}

.empty-list-state, .empty-graph-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #94a3b8;
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 16px;
}

.logic-canvas-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  height: 100%;
  position: relative;
}

.canvas-toolbar {
  height: 50px;
  background: white;
  border-bottom: 1px solid #e2e8f0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
}

.toolbar-left-group {
  display: flex;
  gap: 16px;
  align-items: center;
}

/* 🔥 工具栏卡片样式 */
.toolbar-card {
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 6px 12px;
  display: flex;
  align-items: center;
  box-shadow: 0 2px 4px rgba(0,0,0,0.05);
  transition: all 0.2s;
}

.back-card {
  cursor: pointer;
  color: #64748b;
  font-weight: 600;
  font-size: 13px;
}
.back-card:hover {
  border-color: #6366f1;
  color: #6366f1;
  box-shadow: 0 4px 6px rgba(99,102,241,0.1);
}
.back-icon { margin-right: 6px; font-size: 12px; }

.info-card {
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  min-width: 160px;
  padding: 4px 12px;
}

.app-name {
  font-size: 14px;
  font-weight: 700;
  color: #1e293b;
  line-height: 1.2;
}

.save-status-container {
  font-size: 11px; /* 比名字小 */
  margin-top: 2px;
  height: 16px; /* 占位高度防止抖动 */
  display: flex;
  align-items: center;
}

.status-item { display: flex; align-items: center; gap: 6px; }

.status-item.saving { color: #6366f1; }
.status-item.saved { color: #94a3b8; }
.status-item.unsaved { color: #f59e0b; }

.mini-spinner {
  width: 12px; height: 12px;
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.check-icon {
  display: inline-block;
  width: 6px; height: 10px;
  border: solid currentColor;
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
  margin-bottom: 2px;
}

.fade-enter-active, .fade-leave-active { transition: opacity 0.2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

.canvas-area {
  flex: 1;
  background: #f1f5f9;
  position: relative;
}

.create-btn {
  background: #6366f1;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 6px;
  cursor: pointer;
}

.tool-btn {
  background: white;
  border: 1px solid #cbd5e1;
  padding: 6px 12px;
  border-radius: 6px;
  cursor: pointer;
  margin-left: 10px;
  font-size: 12px;
}

.tool-btn.primary {
  background: #6366f1;
  color: white;
  border-color: #6366f1;
}

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.modal-window {
  background: white;
  width: 400px;
  padding: 24px;
  border-radius: 8px;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.2);
}

.modal-window h3 {
  margin-top: 0;
  margin-bottom: 20px;
}

.form-item {
  margin-bottom: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-item input {
  padding: 10px;
  border: 1px solid #e2e8f0;
  border-radius: 4px;
  outline: none;
}

.form-item input:focus {
  border-color: #6366f1;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 20px;
}

.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #94a3b8;
}

.loading-spinner {
  width: 30px;
  height: 30px;
  border: 3px solid #e2e8f0;
  border-top-color: #6366f1;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 10px;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* 🔥 强制提升连线层级，使其显示在节点上方 */
:deep(.vue-flow__edges) {
  z-index: 2000 !important;
  pointer-events: none;
}
:deep(.vue-flow__edge-path), :deep(.vue-flow__edge-textbg), :deep(.vue-flow__edge-text) {
  pointer-events: all;
  cursor: pointer;
}
</style>
AppLogicView.vue