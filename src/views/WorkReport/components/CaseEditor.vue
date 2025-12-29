<template>
  <el-container class="editor-container">
    <el-header height="60px" class="editor-toolbar-wrapper">
      <div class="editor-toolbar-glass">
        <el-button :icon="ArrowLeft" circle size="small" @click="$router.back()"/>

        <div class="toolbar-group">
          <span class="label">添加节点:</span>
          <el-button-group>
            <el-button type="primary" plain size="small" @click="addNode('page')">📄 页面</el-button>
            <el-button type="warning" plain size="small" @click="addNode('component')">🧩 组件</el-button>
            <el-button type="success" plain size="small" @click="addNode('case')">🧪 用例</el-button>
          </el-button-group>
        </div>

        <div class="toolbar-group">
          <el-button type="danger" plain size="small" :icon="Delete" :disabled="selectedElements.length === 0"
                     @click="removeSelected">删除选中
          </el-button>
          <el-button type="info" plain size="small" :icon="Refresh" @click="fitView">重置视图</el-button>
        </div>

        <div class="toolbar-info">
          <span v-if="saveStatus === 'saving'" class="save-status saving">
            <el-icon class="is-loading"><Refresh/></el-icon> 保存中...
          </span>
          <span v-else-if="saveStatus === 'saved'" class="save-status saved">✔ 已保存</span>
          <span v-else-if="saveStatus === 'unsaved'" class="save-status unsaved">⚠️ 未保存</span>
          <el-tag type="info" size="small" effect="plain">提示: 选中节点后添加可自动连线</el-tag>
        </div>
      </div>
    </el-header>

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
            @pane-ready="onPaneReady"
            @nodes-selection-change="onSelectionChange"
            @node-click="onNodeClick"
            @node-double-click="onNodeDoubleClick"
            @pane-click="onPaneClick"
            @nodes-change="onNodesChange"
            @edges-change="onEdgesChange"
        >
          <template #node-page="props">
            <PageNode v-bind="props" @update-size="(s) => handleNodeSizeUpdate(props.id, s)"/>
          </template>
          <template #node-component="props">
            <PageNode v-bind="props" @update-size="(s) => handleNodeSizeUpdate(props.id, s)"/>
          </template>
          <template #node-case="props">
            <PageNode v-bind="props" @update-size="(s) => handleNodeSizeUpdate(props.id, s)"/>
          </template>

          <Background pattern-color="rgba(203, 213, 225, 0.4)" :gap="20"/>
          <Controls/>
          <MiniMap/>
        </VueFlow>
      </div>

      <transition name="fade">
        <div v-if="selectedNode" class="editor-overlay-wrapper" @click.self="clearSelection">
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
/* --- 以下完整保留你原始的所有业务逻辑 --- */
import {ref, onMounted, onUnmounted, watch} from 'vue'
import {useRouter, useRoute} from 'vue-router'
import {VueFlow, useVueFlow} from '@vue-flow/core'
import {Background} from '@vue-flow/background'
import {Controls} from '@vue-flow/controls'
import {MiniMap} from '@vue-flow/minimap'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/controls/dist/style.css'
import '@vue-flow/minimap/dist/style.css'
import {ElButton, ElButtonGroup, ElTag, ElContainer, ElHeader, ElMain, ElIcon, ElMessage} from 'element-plus'
import {Delete, Refresh, ArrowLeft} from '@element-plus/icons-vue'
import PageNode from './PageNode.vue'
import PageDetailEditor from './PageDetailEditor.vue'
import * as api from '../../../api/workReport'
import {fetchWorkflowAdd, fetchWorkflowDetailSimple} from '@/api/workflow'

const isReady = ref(false)
const nodes = ref([])
const edges = ref([])
const router = useRouter()
const route = useRoute()
const graphId = ref(null)
const saveStatus = ref('saved')
let autoSaveTimer = null
let flowInstance = null

const onPaneReady = (instance) => {
  flowInstance = instance
  instance.fitView()
}

// 1. 完整的数据加载与重试逻辑
const loadGraphData = async (retryCount = 0) => {
  const id = route.params.appId;
  if (id) {
    try {
      const isAppId = isNaN(Number(id))
      if (isAppId) {
        const listRes = await api.getAppGraphList(id)
        if (listRes.code === 200 && listRes.data?.length > 0) {
          graphId.value = listRes.data[0].id
        } else {
          const createRes = await api.createAppGraph({name: 'Default Graph', app_id: id})
          if (createRes.code === 200) graphId.value = createRes.data.id
        }
      } else {
        graphId.value = id
      }

      if (graphId.value) {
        const detailRes = await api.getAppGraphDetail(graphId.value)
        if (detailRes.code === 200) {
          const rawNodes = detailRes.data.nodes || []
          const rawEdges = detailRes.data.edges || []// 在 loadGraphData 函数内修改 nodes.value 的映射部分
          nodes.value = rawNodes.map(n => {
            // 1. 兼容后端返回的 components 字段 (你在 save 时传的是这个)
            const rawComponents = n.components || n.data?.interactions || [];

            // 2. 还原 interactions 结构
            const processedInteractions = rawComponents.map(c => {
              if (c.rect) {
                return {...c, x: c.rect.x, y: c.rect.y, w: c.rect.w, h: c.rect.h};
              }
              return c;
            });

            return {
              id: String(n.id),
              type: n.type || 'page',
              label: n.label || n.data?.label || '未命名',
              position: {x: Number(n.position?.x) || 0, y: Number(n.position?.y) || 0},
              data: {
                ...(n.data || {}),
                // 🔥 核心修复：确保 naturalSize 从数据库还原回 data 中
                naturalSize: n.naturalSize || n.data?.naturalSize || {w: 375, h: 667},
                interactions: processedInteractions,
                desc: n.desc || n.data?.desc || '',
                type: n.type || 'page',
                workflow_id: n.workflow_id || n.data?.workflow_id,
                screenshot: n.screenshot || n.data?.screenshot
              },
              selected: false,
              dragging: false
            }
          })
          const caseNodes = nodes.value.filter(n => n.type === 'case' && n.data.workflow_id)
          if (caseNodes.length > 0) {
            Promise.all(caseNodes.map(async (node) => {
              try {
                const res = await fetchWorkflowDetailSimple(node.data.workflow_id)
                if (res.code === 200 && res.data) {
                  node.label = res.data.name
                  node.data.label = res.data.name
                  node.data.desc = res.data.desc || ''
                }
              } catch (e) {
                console.error('Fetch workflow detail failed', e)
              }
            }))
          }
          edges.value = rawEdges.map(e => ({...e, id: String(e.id)}))
        }
      }
    } catch (e) {
      if ((e.code === 'ECONNABORTED' || e.code === 'ERR_NETWORK') && retryCount < 3) {
        setTimeout(() => loadGraphData(retryCount + 1), 3000);
      } else {
        ElMessage.error('加载图谱数据失败')
      }
    }
  }
  setTimeout(() => {
    isReady.value = true
    const lastVisitedId = sessionStorage.getItem('last_visited_case_id')
    if (lastVisitedId) {
      sessionStorage.removeItem('last_visited_case_id')
      const targetNode = nodes.value.find(n => n.id === lastVisitedId)
      if (targetNode) flowInstance?.fitView({nodes: [targetNode], padding: 0.2, duration: 800})
    }
  }, 400)
}

onMounted(() => {
  loadGraphData()
})
watch(() => route.fullPath, () => {
  loadGraphData()
})

// 2. 完整的快捷键逻辑
const handleKeydown = (e) => {
  if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return
  if (selectedElements.value.length === 0) return
  switch (e.code) {
    case 'Space':
      e.preventDefault();
      selectedNode.value = selectedElements.value[0];
      break
    case 'Enter':
      e.preventDefault();
      addSiblingNode();
      break
    case 'Tab':
      e.preventDefault();
      e.shiftKey ? addParentNode() : addChildNode();
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
const selectedNode = ref(null)

const getSafeScreenshot = (val) => {
  if (val && typeof val === 'object') return val.path || val.url
  return typeof val === 'string' ? val : null
}

// 3. 完整的连线与 ParentNode 逻辑
const onConnect = async (params) => {
  flowInstance?.addEdges([params])
  const sourceNode = nodes.value.find(n => n.id === params.source)
  const targetNode = nodes.value.find(n => n.id === params.target)
  if (sourceNode && targetNode) {
    let parentId = null;
    let childNode = null
    const priority = {page: 3, component: 2, case: 1}
    const sLevel = priority[sourceNode.type] || 0
    const tLevel = priority[targetNode.type] || 0
    if (sLevel >= tLevel) {
      parentId = sourceNode.id;
      childNode = targetNode
    } else {
      parentId = targetNode.id;
      childNode = sourceNode
    }

    if (childNode && parentId) {
      childNode.parentNode = parentId
      const payload = {
        graph_id: graphId.value,
        node_id: childNode.id,
        type: childNode.type,
        label: childNode.label,
        desc: childNode.data.desc || '',
        parentNode: parentId,
        naturalSize: childNode.data.naturalSize || null,
        screenshot: getSafeScreenshot(childNode.data.screenshot),
        workflow_id: childNode.data.workflow_id ? String(childNode.data.workflow_id) : null,
        components: (childNode.data.interactions || []).map(c => ({...c, rect: {x: c.x, y: c.y, w: c.w, h: c.h}}))
      }
      try {
        await api.saveNodeDetail(payload)
      } catch (e) {
        console.error('Save parentNode failed', e)
      }
    }
  }
  triggerAutoSave()
}

const onSelectionChange = (elements) => {
  selectedElements.value = elements.nodes || []
}
const onNodeClick = () => {
}

// 4. 完整的双击跳转逻辑
const onNodeDoubleClick = ({node}) => {
  if (node.type === 'case') {
    sessionStorage.setItem('last_visited_case_id', node.id)
    const targetId = node.data?.workflow_id
    if (targetId) router.push({name: 'Editor', params: {id: targetId}})
    else if (node.id.toString().startsWith('node-')) {
      const appId = route.params.appId || route.query.appId
      router.push({name: 'Editor', query: {appId}})
    } else {
      router.push({name: 'Editor', params: {id: node.id}})
    }
    return
  }
  selectedNode.value = node
}

const onPaneClick = () => {
}
const clearSelection = () => {
  selectedNode.value = null
}

// 5. 完整的自动保存逻辑
const triggerAutoSave = () => {
  saveStatus.value = 'saving'
  if (autoSaveTimer) clearTimeout(autoSaveTimer)
  autoSaveTimer = setTimeout(handleSaveLayout, 1000)
}

const ensureGraphId = async () => {
  if (graphId.value) return graphId.value
  const appId = route.params.appId
  if (!appId) return null
  try {
    const createRes = await api.createAppGraph({name: 'New Workflow ' + new Date().toLocaleString(), app_id: appId})
    if (createRes.code === 200) {
      graphId.value = createRes.data.id
      router.replace({query: {...route.query, id: graphId.value}})
      return graphId.value
    }
  } catch (e) {
    console.error(e)
  }
  return null
}

const handleSaveLayout = async () => {
  try {
    if (!graphId.value) {
      if (!await ensureGraphId()) {
        saveStatus.value = 'unsaved';
        return
      }
    }
    const saveNodes = nodes.value.map(n => ({
      id: n.id,
      position: n.position,
      type: n.type,
      parentNode: n.parentNode,
      data: {...n.data, label: n.label || n.data.label}
    }))
    const saveEdges = edges.value.map(e => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle,
      label: e.label,
      trigger: e.data?.trigger
    }))
    await api.syncGraphLayout({graph_id: graphId.value, nodes: saveNodes, edges: saveEdges})
    saveStatus.value = 'saved'
  } catch (e) {
    saveStatus.value = 'unsaved'
  }
}

const onNodesChange = (changes) => {
  if (changes.some(c => c.type === 'position' || c.type === 'remove' || c.type === 'add')) triggerAutoSave()
}
const onEdgesChange = (changes) => {
  if (changes.some(c => c.type === 'remove' || c.type === 'add')) triggerAutoSave()
}

const onNodeUpdate = async (updatedNode) => {
  if (!graphId.value) return
  const payload = {
    graph_id: graphId.value,
    node_id: updatedNode.id,
    type: updatedNode.type || 'page',
    label: updatedNode.label,
    desc: updatedNode.data.desc || '',
    naturalSize: updatedNode.data.naturalSize,
    parentNode: updatedNode.parentNode || null,
    naturalSize: updatedNode.data.naturalSize || null,
    screenshot: getSafeScreenshot(updatedNode.data.screenshot),
    workflow_id: updatedNode.data.workflow_id ? String(updatedNode.data.workflow_id) : null,
    components: (updatedNode.data.interactions || []).map(c => ({...c, rect: {x: c.x, y: c.y, w: c.w, h: c.h}}))
  }
  try {
    await api.saveNodeDetail(payload);
    triggerAutoSave()
  } catch (error) {
    ElMessage.error('保存失败')
  }
}

const createNodeData = (type, position, label) => {
  const labelMap = {page: '新页面', component: '新组件', case: '新用例'}
  return {
    id: `node-${Date.now()}`,
    type, label: label || labelMap[type], position,
    data: {
      label: label || labelMap[type], type, desc: '', ...(type === 'page' ? {
        naturalSize: {w: 375, h: 667},
        interactions: []
      } : {}), ...(type === 'case' ? {workflow_id: null} : {})
    }
  }
}

// 6. 完整的关联流程初始化逻辑
const initWorkflowIfCase = async (node) => {
  if (node.type === 'case' && !node.data.workflow_id) {
    try {
      const content = {
        nodes: [{
          id: `public-trigger-${Date.now()}`,
          type: 'custom',
          position: {x: 100, y: 200},
          data: {label: '开始', nodeCode: 'public/trigger', outputs: []}
        }], edges: []
      }
      const res = await fetchWorkflowAdd(node.label, '自动创建的关联流程', content)
      if (res.code === 200) {
        const wfId = res.data?.id || (res.data && typeof res.data !== 'object' ? res.data : null) || res.id
        if (wfId) node.data.workflow_id = wfId
      }
    } catch (e) {
      ElMessage.warning('创建关联流程失败')
    }
  }
}

// 7. 完整的节点添加系列方法
const addNode = async (type) => {
  let position = {x: 100 + Math.random() * 50, y: 100 + Math.random() * 50}
  let parentNode = null
  if (selectedElements.value.length > 0) {
    parentNode = selectedElements.value[selectedElements.value.length - 1]
    position = {x: parentNode.position.x + 250, y: parentNode.position.y}
  }
  const newNode = createNodeData(type, position)
  await initWorkflowIfCase(newNode)
  try {
    const gid = await ensureGraphId()
    if (gid) {
      await api.addEmptyNode({
        graph_id: gid,
        node_id: newNode.id,
        type: newNode.type,
        label: newNode.label,
        x: parseInt(position.x),
        y: parseInt(position.y)
      })
      await api.saveNodeDetail({
        graph_id: gid,
        node_id: newNode.id,
        type: newNode.type,
        label: newNode.label,
        desc: '',
        parentNode: null,
        naturalSize: newNode.data.naturalSize || null,
        screenshot: null,
        workflow_id: newNode.data.workflow_id ? String(newNode.data.workflow_id) : null,
        components: []
      })
    }
    nodes.value.push(newNode)
  } catch (error) {
    ElMessage.error('添加失败');
    return
  }

  if (parentNode) {
    setTimeout(() => {
      flowInstance?.addEdges([{
        id: `e-${parentNode.id}-${newNode.id}`,
        source: parentNode.id,
        target: newNode.id,
        type: 'smoothstep'
      }])
    }, 10)
    triggerAutoSave()
  }
}

const addChildNode = async () => {
  if (selectedElements.value.length === 0) return
  const parent = selectedElements.value[0]
  const newNode = createNodeData(parent.type || 'page', {x: parent.position.x + 300, y: parent.position.y})
  await initWorkflowIfCase(newNode)
  try {
    const gid = await ensureGraphId()
    if (gid) {
      await api.addEmptyNode({
        graph_id: gid,
        node_id: newNode.id,
        type: newNode.type,
        label: newNode.label,
        x: parseInt(newNode.position.x),
        y: parseInt(newNode.position.y)
      })
      await api.saveNodeDetail({
        graph_id: gid,
        node_id: newNode.id,
        type: newNode.type,
        label: newNode.label,
        desc: '',
        parentNode: null,
        naturalSize: newNode.data.naturalSize || null,
        screenshot: null,
        workflow_id: newNode.data.workflow_id ? String(newNode.data.workflow_id) : null,
        components: []
      })
    }
    nodes.value.push(newNode)
  } catch (error) {
    return
  }
  setTimeout(() => {
    flowInstance?.addEdges([{
      id: `e-${parent.id}-${newNode.id}`,
      source: parent.id,
      target: newNode.id,
      type: 'smoothstep'
    }])
  }, 10)
  triggerAutoSave()
}

const addParentNode = async () => {
  if (selectedElements.value.length === 0) return
  const child = selectedElements.value[0]
  const newNode = createNodeData(child.type || 'page', {x: child.position.x - 300, y: child.position.y})
  await initWorkflowIfCase(newNode)
  try {
    const gid = await ensureGraphId()
    if (gid) {
      await api.addEmptyNode({
        graph_id: gid,
        node_id: newNode.id,
        type: newNode.type,
        label: newNode.label,
        x: parseInt(newNode.position.x),
        y: parseInt(newNode.position.y)
      })
      await api.saveNodeDetail({
        graph_id: gid,
        node_id: newNode.id,
        type: newNode.type,
        label: newNode.label,
        desc: '',
        parentNode: null,
        naturalSize: newNode.data.naturalSize || null,
        screenshot: null,
        workflow_id: newNode.data.workflow_id ? String(newNode.data.workflow_id) : null,
        components: []
      })
    }
    nodes.value.push(newNode)
  } catch (error) {
    return
  }
  setTimeout(() => {
    flowInstance?.addEdges([{
      id: `e-${newNode.id}-${child.id}`,
      source: newNode.id,
      target: child.id,
      type: 'smoothstep'
    }])
  }, 10)
  triggerAutoSave()
}

const addSiblingNode = async () => {
  if (selectedElements.value.length === 0) return
  const current = selectedElements.value[0]
  const newNode = createNodeData(current.type || 'page', {x: current.position.x, y: current.position.y + 150})
  await initWorkflowIfCase(newNode)
  try {
    const gid = await ensureGraphId()
    if (gid) {
      await api.addEmptyNode({
        graph_id: gid,
        node_id: newNode.id,
        type: newNode.type,
        label: newNode.label,
        x: parseInt(newNode.position.x),
        y: parseInt(newNode.position.y)
      })
      await api.saveNodeDetail({
        graph_id: gid,
        node_id: newNode.id,
        type: newNode.type,
        label: newNode.label,
        desc: '',
        parentNode: null,
        naturalSize: newNode.data.naturalSize || null,
        screenshot: null,
        workflow_id: newNode.data.workflow_id ? String(newNode.data.workflow_id) : null,
        components: []
      })
    }
    nodes.value.push(newNode)
  } catch (error) {
    return
  }
  triggerAutoSave()
}

const removeSelected = () => {
  if (flowInstance) flowInstance.removeNodes(selectedElements.value)
  selectedElements.value = [];
  triggerAutoSave()
}

const fitView = () => flowInstance?.fitView()

const handleNodeSizeUpdate = (nodeId, size) => {
  const node = nodes.value.find(n => n.id === nodeId)
  if (node) {
    // 更新内存数据
    node.data.naturalSize = size
    // 立即触发一次保存，确保后端数据里有了 naturalSize
    // 这样下次刷新页面，loadGraphData 拿到的就是正确的尺寸了
    onNodeUpdate(node)
  }
}
</script>

<style scoped>
/* --- 全场景液态玻璃 UI 优化 --- */

.editor-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  background: transparent !important; /* 必须透明看到底层水波纹 */
}

/* 顶部工具栏：留出 88px 侧边间距，但通过容器 padding 实现，防止 Canvas 偏移 */
.editor-toolbar-wrapper {
  padding: 10px 20px 0 108px; /* 留出侧边栏位置 */
  background: transparent;
}

.editor-toolbar-glass {
  height: 100%;
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 0 24px;
  background: rgba(255, 255, 255, 0.45) !important;
  backdrop-filter: blur(20px) saturate(160%);
  border: 1px solid rgba(255, 255, 255, 0.5);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(31, 38, 135, 0.08);
}

.toolbar-group {
  display: flex;
  align-items: center;
  gap: 10px;
}

.label {
  font-size: 13px;
  color: #4b5563;
  font-weight: 700;
}

.toolbar-info {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 15px;
}

/* 画布通透感 */
.flow-wrapper {
  flex: 1;
  position: relative;
  background: transparent;
  width: 100%;
  height: 100%;
  overflow: hidden;
  padding: 0;
}

.canvas-container {
  position: absolute;
  inset: 0;
}

.flow-canvas {
  background: transparent !important;
}

/* 状态标签 */
.save-status {
  font-size: 12px;
  font-weight: 700;
  padding: 4px 12px;
  border-radius: 20px;
}

.save-status.saving {
  background: rgba(230, 162, 60, 0.1);
  color: #e6a23c;
}

.save-status.saved {
  background: rgba(103, 194, 58, 0.1);
  color: #67c23a;
}

.save-status.unsaved {
  background: rgba(245, 108, 108, 0.1);
  color: #f56c6c;
}

/* 详情编辑器全屏覆盖 */
.editor-overlay-wrapper {
  position: absolute;
  inset: 0;
  z-index: 2000;
  background: rgba(255, 255, 255, 0.2);
  backdrop-filter: blur(15px);
  display: flex;
  align-items: center;
  justify-content: center;
}

/* VueFlow 辅助控件毛玻璃化 */
:deep(.vue-flow__controls), :deep(.vue-flow__minimap) {
  background: rgba(255, 255, 255, 0.4) !important;
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.5) !important;
  border-radius: 8px !important;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
}

.fade-enter-active, .fade-leave-active {
  transition: all 0.3s ease;
}

.fade-enter-from, .fade-leave-to {
  opacity: 0;
  transform: scale(0.98);
}
</style>