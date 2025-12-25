<template>
  <el-container class="editor-container">
    <!-- 顶部工具栏 -->
    <el-header height="50px" class="editor-toolbar">
      <el-button :icon="ArrowLeft" circle size="small" @click="$router.back()" style="margin-right: 12px" />
      <div class="toolbar-group">
        <span class="label">添加节点:</span>
        <el-button-group>
          <el-button type="primary" plain size="small" @click="addNode('page')">📄 页面</el-button>
          <el-button type="warning" plain size="small" @click="addNode('component')">🧩 组件</el-button>
          <el-button type="success" plain size="small" @click="addNode('case')">🧪 用例</el-button>
        </el-button-group>
      </div>
      <div class="toolbar-group">
        <el-button type="danger" plain size="small" icon="Delete" :disabled="selectedElements.length === 0" @click="removeSelected">删除选中</el-button>
        <el-button type="info" plain size="small" icon="Refresh" @click="fitView">重置视图</el-button>
      </div>
      <div class="toolbar-info">
        <span v-if="saveStatus === 'saving'" class="save-status saving">
          <el-icon class="is-loading"><Refresh /></el-icon> 保存中...
        </span>
        <span v-else-if="saveStatus === 'saved'" class="save-status saved">✔ 已保存</span>
        <span v-else-if="saveStatus === 'unsaved'" class="save-status unsaved">⚠️ 未保存</span>
        <el-tag type="info" size="small">提示: 选中节点后添加可自动连线</el-tag>
      </div>
    </el-header>

    <!-- 脑图画布 -->
    <el-main class="flow-wrapper">
      <div class="canvas-container">
      <VueFlow
        v-if="isReady"
        v-model:nodes="nodes"
        v-model:edges="edges"
        :default-zoom="1.2"
        :min-zoom="0.2"
        :max-zoom="4"
        fit-view-on-init
        class="flow-canvas"
        @connect="onConnect"
        @nodes-selection-change="onSelectionChange"
        @node-click="onNodeClick"
        @node-double-click="onNodeDoubleClick"
        @pane-click="onPaneClick"
        @nodes-change="onNodesChange"
        @edges-change="onEdgesChange"
      >
        <!-- 注册自定义节点 -->
        <template #node-page="props"><PageNode v-bind="props" /></template>
        <template #node-component="props"><PageNode v-bind="props" /></template>
        <template #node-case="props"><PageNode v-bind="props" /></template>

        <Background pattern-color="#cbd5e1" :gap="20" />
        <Controls />
        <MiniMap />
      </VueFlow>
      </div>

      <!-- 属性编辑器 (全屏覆盖模式) -->
      <transition name="fade">
        <div v-if="selectedNode" class="editor-overlay-wrapper">
          <PageDetailEditor
            :node="selectedNode"
            @close="clearSelection"
            @update="onNodeUpdate"
          />
        </div>
      </transition>
    </el-main>
  </el-container>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { VueFlow, useVueFlow } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { MiniMap } from '@vue-flow/minimap'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/controls/dist/style.css'
import '@vue-flow/minimap/dist/style.css'
import { ElButton, ElButtonGroup, ElTag, ElContainer, ElHeader, ElMain } from 'element-plus'
import { Delete, Refresh, ArrowLeft } from '@element-plus/icons-vue'
import PageNode from './PageNode.vue'
import PageDetailEditor from './PageDetailEditor.vue'
import * as api from '../../../api/workReport'

const { addEdges, removeNodes, removeEdges, fitView } = useVueFlow()
const isReady = ref(false)
const nodes = ref([])
const edges = ref([])
const router = useRouter()
const route = useRoute()
const graphId = ref(null)
const saveStatus = ref('saved')
let autoSaveTimer = null

onMounted(async () => {
  // 从 API 获取数据
  const id = route.params.id || route.query.id
  if (id) {
    try {
      // 如果有 ID，直接视为 GraphID 获取详情
      graphId.value = id
      const detailRes = await api.getAppGraphDetail(id)
      if (detailRes.code === 200) {
        nodes.value = detailRes.data.nodes || []
        edges.value = detailRes.data.edges || []
      }
    } catch (e) {
      console.error('Load graph failed:', e)
    }
  }

  // 延迟渲染，等待路由动画结束且容器宽高计算完成
  setTimeout(() => { 
    isReady.value = true 

    // 检查是否有上次访问的节点记录，如果有则聚焦
    const lastVisitedId = sessionStorage.getItem('last_visited_case_id')
    if (lastVisitedId) {
      sessionStorage.removeItem('last_visited_case_id')
      const targetNode = nodes.value.find(n => n.id === lastVisitedId)
      if (targetNode) {
        fitView({ nodes: [targetNode], padding: 0.2, duration: 800 })
      }
    }
  }, 400)
})

// 键盘快捷键支持
const handleKeydown = (e) => {
  // 如果正在输入框中输入，则不触发快捷键
  if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return

  // 如果没有选中任何节点，不触发快捷键
  if (selectedElements.value.length === 0) return

  switch (e.code) {
    case 'Space':
      e.preventDefault()
      // 空格键打开编辑器
      selectedNode.value = selectedElements.value[0]
      break
    case 'Enter':
      e.preventDefault()
      addSiblingNode()
      break
    case 'Tab':
      e.preventDefault()
      if (e.shiftKey) {
        addParentNode()
      } else {
        addChildNode()
      }
      break
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})

const selectedElements = ref([])
const selectedNode = ref(null) // 控制编辑器显示

// 连线事件
const onConnect = (params) => {
  addEdges([params])
  triggerAutoSave()
}

// 选中事件
const onSelectionChange = (elements) => {
  selectedElements.value = elements.nodes || []
}

const onNodeClick = ({ node }) => {
  // 单击只选中，不打开弹窗
}

const onNodeDoubleClick = ({ node }) => {
  if (node.type === 'case') {
    // 记录当前节点ID，用于返回时定位
    sessionStorage.setItem('last_visited_case_id', node.id)

    // 如果是临时ID（以node-开头），则视为新建流程；否则视为已有流程（ID即为WorkflowID）
    if (node.id.toString().startsWith('node-')) {
      router.push({ name: 'Editor', query: {} })
    } else {
      router.push({ name: 'Editor', query: { id: node.id } })
    }
    return
  }
  selectedNode.value = node
}

const onPaneClick = () => {
  // 点击画布空白处，如果编辑器未打开，则不做处理（VueFlow会自动取消选中）
  // 如果编辑器打开了，因为有遮罩层，点击不到这里
}

const clearSelection = () => {
  selectedNode.value = null
}

// 自动保存逻辑
const triggerAutoSave = () => {
  saveStatus.value = 'saving'
  if (autoSaveTimer) clearTimeout(autoSaveTimer)
  autoSaveTimer = setTimeout(handleSaveLayout, 1000)
}

// 确保图谱已创建 (如果 graphId 不存在则创建)
const ensureGraphId = async () => {
  if (graphId.value) return graphId.value

  try {
    // 尝试从 query 获取 appId，如果没有则使用默认值
    const appId = route.query.appId || 'default_app'
    const createRes = await api.createAppGraph({ 
      name: 'New Workflow ' + new Date().toLocaleString(), 
      app_id: appId 
    })
    
    if (createRes.code === 200) {
      graphId.value = createRes.data.id
      // 更新路由参数，但不刷新页面
      router.replace({ query: { ...route.query, id: graphId.value } })
      return graphId.value
    }
  } catch (e) {
    console.error('Create graph failed', e)
  }
  return null
}

const handleSaveLayout = async () => {
  try {
    // 确保有 Graph ID
    if (!graphId.value) {
      const id = await ensureGraphId()
      if (!id) {
        saveStatus.value = 'unsaved'
        return
      }
    }

    const saveNodes = nodes.value.map(n => ({ id: n.id, position: n.position }))
    const saveEdges = edges.value.map(e => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle,
      label: e.label,
      trigger: e.data?.trigger
    }))

    await api.syncGraphLayout({
      graph_id: graphId.value,
      nodes: saveNodes,
      edges: saveEdges
    })
    saveStatus.value = 'saved'
  } catch (e) {
    console.error('Auto save failed', e)
    saveStatus.value = 'unsaved'
  }
}

const onNodesChange = (changes) => {
  if (changes.some(c => c.type === 'position' || c.type === 'remove' || c.type === 'add')) {
    triggerAutoSave()
  }
}

const onEdgesChange = (changes) => {
  if (changes.some(c => c.type === 'remove' || c.type === 'add')) {
    triggerAutoSave()
  }
}

const onNodeUpdate = async (updatedNode) => {
  // 保存节点详情（Label, Screenshot, Interactions）
  if (!graphId.value) return
  
  const payload = {
    graph_id: graphId.value,
    node_id: updatedNode.id,
    type: updatedNode.type || 'page',
    label: updatedNode.label,
    screenshot: updatedNode.data.screenshot,
    components: (updatedNode.data.interactions || []).map(c => ({ ...c, rect: { x: c.x, y: c.y, w: c.w, h: c.h } }))
  }
  
  await api.saveNodeDetail(payload)
  triggerAutoSave() // 同时触发一次布局保存以防万一
}

// 辅助函数：创建节点数据
const createNodeData = (type, position, label) => {
  const labelMap = { page: '新页面', component: '新组件', case: '新用例' }
  return {
    id: `node-${Date.now()}`,
    type,
    label: label || labelMap[type],
    position,
    data: {
      type,
      desc: '',
      ...(type === 'page' ? { naturalSize: { w: 375, h: 667 }, interactions: [] } : {})
    }
  }
}

// 添加节点 (工具栏按钮)
const addNode = async (type) => {
  let position = { x: 100 + Math.random() * 50, y: 100 + Math.random() * 50 }
  let parentNode = null

  if (selectedElements.value.length > 0) {
    // 取最后一个选中的节点作为父节点
    parentNode = selectedElements.value[selectedElements.value.length - 1]
    position = {
      x: parentNode.position.x + 250, // 向右偏移，符合从左到右的流向
      y: parentNode.position.y
    }
  }

  const newNode = createNodeData(type, position)

  // 🔥 核心修复：调用后端接口创建节点
  const gid = await ensureGraphId()
  if (gid) {
    await api.addEmptyNode({
      graph_id: gid,
      node_id: newNode.id,
      x: position.x,
      y: position.y
    })
  }

  nodes.value.push(newNode)

  // 如果有父节点，自动连线
  if (parentNode) {
    setTimeout(() => {
      addEdges([{
        id: `e-${parentNode.id}-${newNode.id}`,
        source: parentNode.id,
        target: newNode.id,
        type: 'smoothstep'
      }])
    }, 10)
    triggerAutoSave()
  }
}

// 添加子节点 (Tab)
const addChildNode = async () => {
  if (selectedElements.value.length === 0) return
  const parent = selectedElements.value[0]
  const newNode = createNodeData('page', { x: parent.position.x + 300, y: parent.position.y })
  
  // 🔥 核心修复：调用后端接口创建节点
  const gid = await ensureGraphId()
  if (gid) {
    await api.addEmptyNode({ graph_id: gid, node_id: newNode.id, x: newNode.position.x, y: newNode.position.y })
  }

  nodes.value.push(newNode)
  setTimeout(() => {
    addEdges([{ id: `e-${parent.id}-${newNode.id}`, source: parent.id, target: newNode.id, type: 'smoothstep' }])
  }, 10)
  triggerAutoSave()
}

// 添加父节点 (Shift + Tab)
const addParentNode = async () => {
  if (selectedElements.value.length === 0) return
  const child = selectedElements.value[0]
  const newNode = createNodeData('page', { x: child.position.x - 300, y: child.position.y })
  
  // 🔥 核心修复：调用后端接口创建节点
  const gid = await ensureGraphId()
  if (gid) {
    await api.addEmptyNode({ graph_id: gid, node_id: newNode.id, x: newNode.position.x, y: newNode.position.y })
  }

  nodes.value.push(newNode)
  setTimeout(() => {
    addEdges([{ id: `e-${newNode.id}-${child.id}`, source: newNode.id, target: child.id, type: 'smoothstep' }])
  }, 10)
  triggerAutoSave()
}

// 添加同级节点 (Enter)
const addSiblingNode = async () => {
  if (selectedElements.value.length === 0) return
  const current = selectedElements.value[0]
  // 简单处理：在下方添加
  const newNode = createNodeData('page', { x: current.position.x, y: current.position.y + 150 })
  
  // 🔥 核心修复：调用后端接口创建节点
  const gid = await ensureGraphId()
  if (gid) {
    await api.addEmptyNode({ graph_id: gid, node_id: newNode.id, x: newNode.position.x, y: newNode.position.y })
  }

  nodes.value.push(newNode)
  // 注意：同级节点通常意味着共享同一个父节点，这里简化为仅创建节点，若需自动连线需遍历 edges 查找父节点
  triggerAutoSave()
}

const removeSelected = () => {
  removeNodes(selectedElements.value)
  selectedElements.value = []
  triggerAutoSave()
}
</script>

<style scoped>
.editor-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  background: white;
}

.editor-toolbar {
  border-bottom: 1px solid #e2e8f0;
  padding: 0 20px;
  display: flex;
  align-items: center;
  gap: 20px;
  background: #fff;
}

.toolbar-group { display: flex; align-items: center; gap: 10px; }
.label { font-size: 14px; color: #606266; font-weight: 500; }
.toolbar-info { margin-left: auto; display: flex; align-items: center; gap: 12px; }

.save-status { font-size: 12px; display: flex; align-items: center; gap: 4px; }
.save-status.saving { color: #e6a23c; }
.save-status.saved { color: #67c23a; }
.save-status.unsaved { color: #f56c6c; }

.flow-wrapper {
  flex: 1;
  position: relative;
  background: #f8fafc;
  width: 100%;
  height: 100%;
  overflow: hidden;
  padding: 0;
}
.canvas-container {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  width: 100%;
}
.flow-canvas {
  position: absolute; top: 0; left: 0; width: 100% !important; height: 100% !important;
}

.editor-overlay-wrapper {
  position: absolute;
  inset: 0;
  z-index: 100;
}

.fade-enter-active, .fade-leave-active { transition: opacity 0.2s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>