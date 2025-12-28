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
        @pane-ready="onPaneReady"
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
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { VueFlow, useVueFlow } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { MiniMap } from '@vue-flow/minimap'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/controls/dist/style.css'
import '@vue-flow/minimap/dist/style.css'
import { ElButton, ElButtonGroup, ElTag, ElContainer, ElHeader, ElMain, ElIcon, ElMessage } from 'element-plus'
import { Delete, Refresh, ArrowLeft } from '@element-plus/icons-vue'
import PageNode from './PageNode.vue'
import PageDetailEditor from './PageDetailEditor.vue'
import * as api from '../../../api/workReport'
import { fetchWorkflowAdd, fetchWorkflowDetailSimple } from '@/api/workflow'

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
  // 初始适配视图
  instance.fitView()
}

const loadGraphData = async (retryCount = 0) => {
  // The route is /report/editor/:appId, so we get the ID from there.
  const id = route.params.appId;
  console.log('Loading Graph Data. ID:', id, 'Params:', route.params, 'Query:', route.query)

  if (id) {
    try {
      // 判断 id 是 AppID (UUID字符串) 还是 GraphID (数字)
      const isAppId = isNaN(Number(id))

      if (isAppId) {
        // 1. 如果是 AppID，先获取该应用下的图谱列表
        const listRes = await api.getAppGraphList(id)
        if (listRes.code === 200 && listRes.data?.length > 0) {
          graphId.value = listRes.data[0].id
        } else {
          // 2. 如果没有，创建一个默认图谱
          const createRes = await api.createAppGraph({ name: 'Default Graph', app_id: id })
          if (createRes.code === 200) graphId.value = createRes.data.id
        }
      } else {
        // 3. 如果是数字，直接视为 GraphID
        graphId.value = id
      }

      // 4. 获取图谱详情
      if (graphId.value) {
        const detailRes = await api.getAppGraphDetail(graphId.value)
        if (detailRes.code === 200) {
          // 🔥 数据清洗：确保格式正确，防止 VueFlow 渲染失败
          const rawNodes = detailRes.data.nodes || []
          const rawEdges = detailRes.data.edges || []

          nodes.value = rawNodes.map(n => ({
            id: String(n.id),
            type: n.type || 'page', // 确保有默认类型
            label: n.label || n.data?.label || '未命名', // 🔥 修复：确保 label 存在，否则 PageNode 无法显示标题
            position: { x: Number(n.position?.x) || 0, y: Number(n.position?.y) || 0 },
            data: {
              ...(n.data || {}),
              // 🔥 修复：扁平化 interactions 数据，防止 rect 嵌套导致热区位置计算错误 (NaN%)
              interactions: (n.data?.interactions || []).map(i => {
                if (i.rect) {
                  return { ...i, x: i.rect.x, y: i.rect.y, w: i.rect.w, h: i.rect.h }
                }
                return i
              }),
              desc: n.desc || n.data?.desc || '', // 🔥 修复：确保 desc 存在，用于显示详情
              type: n.type || 'page', // 🔥 确保 data.type 存在，用于 PageNode 样式判断
              workflow_id: n.workflow_id || n.data?.workflow_id // 🔥 关键修复：从顶层字段读取 workflow_id，防止刷新后丢失
            },
            // 清除可能导致冲突的内部状态
            selected: false,
            dragging: false
          }))

          // 🔥 补充：批量获取用例节点的最新详情 (Name, Desc)
          const caseNodes = nodes.value.filter(n => n.type === 'case' && n.data.workflow_id)
          if (caseNodes.length > 0) {
            // 不阻塞主渲染，异步更新
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

          edges.value = rawEdges.map(e => ({
            ...e,
            id: String(e.id)
          }))
        }
      }
    } catch (e) {
      // 🔥 增加重试机制，应对后端服务启动慢导致的连接失败
      if ((e.code === 'ECONNABORTED' || e.code === 'ERR_NETWORK' || e.message.includes('Network Error')) && retryCount < 3) {
        console.warn(`Backend not ready, retrying in 3 seconds... (Attempt ${retryCount + 1})`);
        setTimeout(() => loadGraphData(retryCount + 1), 3000);
      } else {
        console.error('Load graph failed:', e)
        ElMessage.error('加载图谱数据失败，请检查后端服务是否运行。')
      }
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
        flowInstance?.fitView({ nodes: [targetNode], padding: 0.2, duration: 800 })
      }
    }
  }, 400)
}

onMounted(() => {
  loadGraphData() // Initial call
})

// 🔥 监听路由变化，解决组件复用时不重新加载的问题
watch(() => route.fullPath, () => {
  loadGraphData()
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

// 🔥 辅助函数：安全获取截图 URL (防止对象类型导致后端 422)
const getSafeScreenshot = (val) => {
  if (val && typeof val === 'object') return val.path || val.url
  if (typeof val === 'string') return val
  return null
}

// 连线事件
const onConnect = async (params) => {
  flowInstance?.addEdges([params])

  // 🔥 自动设置 parentNode 逻辑
  const sourceNode = nodes.value.find(n => n.id === params.source)
  const targetNode = nodes.value.find(n => n.id === params.target)

  if (sourceNode && targetNode) {
    let parentId = null
    let childNode = null

    // 优先级：Page > Component > Case
    const priority = { page: 3, component: 2, case: 1 }
    const sLevel = priority[sourceNode.type] || 0
    const tLevel = priority[targetNode.type] || 0

    if (sLevel === tLevel) {
      // 同级：Source 是 Parent (遵循 Source -> Target 关系)
      parentId = sourceNode.id
      childNode = targetNode
    } else if (sLevel > tLevel) {
      // Source 优先级高：Source 是 Parent
      parentId = sourceNode.id
      childNode = targetNode
    } else {
      // Target 优先级高：Target 是 Parent
      parentId = targetNode.id
      childNode = sourceNode
    }

    if (childNode && parentId) {
      childNode.parentNode = parentId
      // 立即调用接口保存 parentNode
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
        components: (childNode.data.interactions || []).map(c => ({ ...c, rect: { x: c.x, y: c.y, w: c.w, h: c.h } }))
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

    // 🔥 修复：优先使用 data.workflow_id，如果没有则回退到 node.id (兼容旧数据)
    const targetId = node.data?.workflow_id

    if (targetId) {
      // 🔥 修复：优先使用 params 跳转，匹配 /report/editor/:id 路由结构
      router.push({ name: 'Editor', params: { id: targetId } })
    } else if (node.id.toString().startsWith('node-')) {
      const appId = route.params.appId || route.query.appId
      router.push({ name: 'Editor', query: { appId } })
    } else {
      // 旧数据兼容：如果没有 workflow_id 且不是临时节点，假设 node.id 就是 workflowId
      router.push({ name: 'Editor', params: { id: node.id } })
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

  const appId = route.params.appId;
  if (!appId) {
    ElMessage.error('无法确定当前应用，无法创建图谱');
    return null;
  }
  try {
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

    const saveNodes = nodes.value.map(n => ({
      id: n.id,
      position: n.position,
      type: n.type,
      parentNode: n.parentNode,
      data: { ...n.data, label: n.label || n.data.label }
    }))
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
    desc: updatedNode.data.desc || '', // 🔥 保存描述信息
    parentNode: updatedNode.parentNode || null,
    naturalSize: updatedNode.data.naturalSize || null,
    screenshot: getSafeScreenshot(updatedNode.data.screenshot),
    workflow_id: updatedNode.data.workflow_id ? String(updatedNode.data.workflow_id) : null, // 🔥 保存关联的 workflow_id
    components: (updatedNode.data.interactions || []).map(c => ({ ...c, rect: { x: c.x, y: c.y, w: c.w, h: c.h } }))
  }

  try {
    await api.saveNodeDetail(payload)
    triggerAutoSave() // 同时触发一次布局保存以防万一
  } catch (error) {
    console.error('Save node detail failed:', error)
    ElMessage.error('保存节点详情失败')
  }
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
      label: label || labelMap[type],
      type,
      desc: '',

      ...(type === 'page' ? { naturalSize: { w: 375, h: 667 }, interactions: [] } : {}),
      ...(type === 'case' ? { workflow_id: null } : {}) // 🔥 初始化 workflow_id
    }
  }
}

// 辅助函数：如果是用例节点，自动创建关联的 Workflow
const initWorkflowIfCase = async (node) => {
  if (node.type === 'case') {
    // 🔥 修复：如果已经有 workflow_id，就不再创建
    if (node.data.workflow_id) {
      return
    }

    try {
      console.log('正在自动创建关联流程:', node.label)
      // 🔥 修复：后端要求 nodes 字段必须是字典(Object)，同时为了兼容 VueFlow 数据结构，我们需要包裹一层
      const content = {
        nodes: [{
          id: `public-trigger-${Date.now()}`,
          type: 'custom',
          position: { x: 100, y: 200 },
          data: { label: '开始', nodeCode: 'public/trigger', outputs: [] }
        }],
        edges: []
      }
      const res = await fetchWorkflowAdd(node.label, '自动创建的关联流程', content)
      console.log('创建流程返回:', res)
      if (res.code === 200) {
        // 兼容 res.data.id 或 res.data 直接为 ID 的情况
        const wfId = res.data?.id || (res.data && typeof res.data !== 'object' ? res.data : null) || res.id
        if (wfId) {
          node.data.workflow_id = wfId
        }
      }
    } catch (e) {
      console.error('Failed to create workflow for case node', e)
      ElMessage.warning('创建关联流程失败: ' + (e.message || '网络异常'))
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

  // 🔥 新增：如果是用例节点，自动创建 Workflow
  await initWorkflowIfCase(newNode)

  // 🔥 核心修复：调用后端接口创建节点
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
      // 🔥 立即保存节点详情，防止 addEmptyNode 丢失 type/label
      await api.saveNodeDetail({
        graph_id: gid,
        node_id: newNode.id,
        type: newNode.type,
        label: newNode.label,
        desc: newNode.data.desc || '',
        parentNode: null,
        naturalSize: newNode.data.naturalSize || null,
        screenshot: getSafeScreenshot(newNode.data.screenshot),
        workflow_id: newNode.data.workflow_id ? String(newNode.data.workflow_id) : null,
        components: []
      })
    }
    nodes.value.push(newNode)
  } catch (error) {
    console.error('Add node failed:', error)
    ElMessage.error('添加节点失败')
    return
  }

  // 如果有父节点，自动连线
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

// 添加子节点 (Tab)
const addChildNode = async () => {
  if (selectedElements.value.length === 0) return
  const parent = selectedElements.value[0]
  const type = parent.type || 'page'
  const newNode = createNodeData(type, { x: parent.position.x + 300, y: parent.position.y })

  // 🔥 新增：如果是用例节点，自动创建 Workflow
  await initWorkflowIfCase(newNode)

  // 🔥 核心修复：调用后端接口创建节点
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
      // 🔥 立即保存节点详情
      await api.saveNodeDetail({
        graph_id: gid,
        node_id: newNode.id,
        type: newNode.type,
        label: newNode.label,
        desc: newNode.data.desc || '',
        parentNode: null,
        naturalSize: newNode.data.naturalSize || null,
        screenshot: getSafeScreenshot(newNode.data.screenshot),
        workflow_id: newNode.data.workflow_id ? String(newNode.data.workflow_id) : null,
        components: []
      })
    }
    nodes.value.push(newNode)
  } catch (error) {
    console.error('Add child node failed:', error)
    ElMessage.error('添加子节点失败')
    return
  }

  setTimeout(() => {
    flowInstance?.addEdges([{ id: `e-${parent.id}-${newNode.id}`, source: parent.id, target: newNode.id, type: 'smoothstep' }])
  }, 10)
  triggerAutoSave()
}

// 添加父节点 (Shift + Tab)
const addParentNode = async () => {
  if (selectedElements.value.length === 0) return
  const child = selectedElements.value[0]
  const type = child.type || 'page'
  const newNode = createNodeData(type, { x: child.position.x - 300, y: child.position.y })

  // 🔥 新增：如果是用例节点，自动创建 Workflow
  await initWorkflowIfCase(newNode)

  // 🔥 核心修复：调用后端接口创建节点
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
      // 🔥 立即保存节点详情
      await api.saveNodeDetail({
        graph_id: gid,
        node_id: newNode.id,
        type: newNode.type,
        label: newNode.label,
        desc: newNode.data.desc || '',
        parentNode: null,
        naturalSize: newNode.data.naturalSize || null,
        screenshot: getSafeScreenshot(newNode.data.screenshot),
        workflow_id: newNode.data.workflow_id ? String(newNode.data.workflow_id) : null,
        components: []
      })
    }
    nodes.value.push(newNode)
  } catch (error) {
    console.error('Add parent node failed:', error)
    ElMessage.error('添加父节点失败')
    return
  }

  setTimeout(() => {
    flowInstance?.addEdges([{ id: `e-${newNode.id}-${child.id}`, source: newNode.id, target: child.id, type: 'smoothstep' }])
  }, 10)
  triggerAutoSave()
}

// 添加同级节点 (Enter)
const addSiblingNode = async () => {
  if (selectedElements.value.length === 0) return
  const current = selectedElements.value[0]
  // 简单处理：在下方添加
  const type = current.type || 'page'
  const newNode = createNodeData(type, { x: current.position.x, y: current.position.y + 150 })

  // 🔥 新增：如果是用例节点，自动创建 Workflow
  await initWorkflowIfCase(newNode)

  // 🔥 核心修复：调用后端接口创建节点
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
      // 🔥 立即保存节点详情
      await api.saveNodeDetail({
        graph_id: gid,
        node_id: newNode.id,
        type: newNode.type,
        label: newNode.label,
        desc: newNode.data.desc || '',
        parentNode: null,
        naturalSize: newNode.data.naturalSize || null,
        screenshot: getSafeScreenshot(newNode.data.screenshot),
        workflow_id: newNode.data.workflow_id ? String(newNode.data.workflow_id) : null,
        components: []
      })
    }
    nodes.value.push(newNode)
  } catch (error) {
    console.error('Add sibling node failed:', error)
    ElMessage.error('添加同级节点失败')
    return
  }

  // 注意：同级节点通常意味着共享同一个父节点，这里简化为仅创建节点，若需自动连线需遍历 edges 查找父节点
  triggerAutoSave()
}

const removeSelected = () => {
  if (flowInstance) {
    flowInstance.removeNodes(selectedElements.value)
  }
  selectedElements.value = []
  triggerAutoSave()
}

const fitView = () => flowInstance?.fitView()
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