<template>
  <el-container class="editor-container three-column-layout" ref="editorContainerRef">
    <el-header v-if="isPicker" height="60px" class="editor-toolbar-wrapper">
      <div class="editor-toolbar-glass">
        <span class="label">请点击画面中的热区进行选择</span>
        <div class="toolbar-info" style="margin-left: auto">
          <el-button size="small" @click="$emit('close')">取消</el-button>
        </div>
      </div>
    </el-header>
    <el-header v-else height="60px" class="editor-toolbar-wrapper">
      <div class="editor-toolbar-glass">
        <el-button :icon="ArrowLeft" circle size="small" @click="$router.back()"/>

        <div class="toolbar-group">
          <span class="label">添加节点:</span>
          <el-button-group>
            <el-button type="primary" plain size="small" @click="addNode('page')">📄 页面</el-button>
            <el-button type="warning" plain size="small" @click="addNode('component')">🧩 组件</el-button>
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

    <el-container class="main-body">
      <!-- Left Column: SOP Navigation -->
      <el-aside width="280px" class="sop-sidebar" v-if="!isPicker">
        <div class="sidebar-header">
          <span class="title">SOPs</span>
          <el-button type="info" link size="small" @click="openGraphSettings" title="Global Variables">
            <el-icon><Setting /></el-icon>
          </el-button>
          <el-button type="primary" link size="small" @click="createNewSOP">
            <el-icon><Plus /></el-icon>
          </el-button>
        </div>
        
        <ElTabs v-model="activeSopTab" class="sop-tabs" stretch>
          <ElTabPane label="业务剧本" name="business">
            <el-scrollbar>
              <div class="sop-list">
                <div v-for="sop in businessSops" :key="sop.id"
                     class="sop-item business"
                     :class="{ active: selectedSopId === sop.id }"
                     @click="selectSOP(sop)">
                  <div class="sop-header">
                    <span class="sop-name">{{ sop.name }}</span>
                  </div>
                  <div class="sop-desc">{{ sop.desc || 'No description' }}</div>
                </div>
              </div>
            </el-scrollbar>
          </ElTabPane>
          <ElTabPane label="系统反射" name="system">
            <el-scrollbar>
              <div class="sop-list">
                <div v-for="sop in systemSops" :key="sop.id"
                     class="sop-item system"
                     :class="{ active: selectedSopId === sop.id }"
                     @click="selectSOP(sop)">
                  <div class="sop-header">
                    <span class="sop-name">{{ sop.name }}</span>
                    <el-tag size="small" type="danger" effect="dark">P{{ sop.priority }}</el-tag>
                  </div>
                  <div class="sop-desc">{{ sop.desc || 'No trigger defined' }}</div>
                </div>
              </div>
            </el-scrollbar>
          </ElTabPane>
        </ElTabs>
      </el-aside>

      <!-- Center Column: Canvas -->
      <el-main class="flow-wrapper">
      <div class="canvas-container">
        <VueFlow
            id="case-editor-canvas"
            v-if="isReady"
            v-model:nodes="nodes"
            v-model:edges="edges"
            :default-zoom="1.2"
            :min-zoom="0.2"
            :max-zoom="4"
            fit-view-on-init
            class="flow-canvas"
            :nodes-draggable="!isPicker"
            :nodes-connectable="!isPicker"
            @connect="onConnect"
            @pane-ready="onPaneReady"
            @nodes-selection-change="onSelectionChange"
            @node-click="onNodeClick"
            @node-double-click="onNodeDoubleClick"
            @pane-click="onPaneClick"
            @nodes-change="onNodesChange"
            @edges-change="onEdgesChange"
        >
          <!-- SOP Visual Grouping Layer -->
          <div v-if="selectedSopId"
               class="sop-group-bg"
               :class="[activeSopTab]"
               :style="sopBoundingBoxStyle">
            <span class="sop-group-label">{{ currentSopName }}</span>
          </div>

          <template #node-page="props">
            <PageNode v-bind="props" :is-picker="isPicker" @update-size="(s) => handleNodeSizeUpdate(props.id, s)"/>
          </template>
          <template #node-component="props">
            <PageNode v-bind="props" :is-picker="isPicker" @update-size="(s) => handleNodeSizeUpdate(props.id, s)"/>
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
              :graph-id="graphId"
              @close="clearSelection"
              @update="onNodeUpdate"
          />
        </div>
      </transition>
    </el-main>

      <!-- Right Column: Properties / SOP Editor -->
      <el-aside width="300px" class="props-sidebar" v-if="!isPicker && selectedSopId">
        <div class="sidebar-content">
          <div class="sidebar-header">
            <span class="title">SOP Configuration</span>
            <el-button type="danger" link size="small" @click="handleDeleteSOP">
              <el-icon><Delete /></el-icon>
            </el-button>
          </div>
          <el-scrollbar>
            <div class="form-wrapper">
              <div class="form-item">
                <div class="label">Name</div>
                <el-input v-model="currentSopForm.name" @change="handleUpdateSOP" />
              </div>
              <div class="form-item" v-if="activeSopTab === 'system'">
                <div class="label">Priority (Higher = First)</div>
                <el-input-number v-model="currentSopForm.priority" :min="0" :max="999" @change="handleUpdateSOP" />
              </div>
              <div class="form-item">
                <div class="label">Description</div>
                <el-input v-model="currentSopForm.desc" type="textarea" :rows="3" @change="handleUpdateSOP" />
              </div>
              
              <div class="form-item">
                <div class="label">Variables (JSON)</div>
                <!-- 暂时用文本域代替 KV 编辑器 -->
                <el-input 
                  v-model="currentSopForm.variablesStr" 
                  type="textarea" 
                  :rows="5" 
                  placeholder='{"key": "value"}'
                  @change="handleUpdateSOPVariables" 
                />
              </div>

              <div class="form-item">
                <div class="label">Associated Cases</div>
                <div v-if="getSopCases(selectedSopId).length === 0" class="empty-text">No cases linked</div>
                <div v-for="c in getSopCases(selectedSopId)" :key="c.id" class="case-list-item">
                  <div class="case-info">
                    <el-icon><Document /></el-icon>
                    <span class="case-label" :title="c.label">{{ c.label }}</span>
                  </div>
                  <el-button link type="primary" size="small" @click="editCase(c)">
                    <el-icon><Edit /></el-icon>
                  </el-button>
                </div>
              </div>

              <div class="form-item">
                <div class="label">Actions</div>
                <el-button type="primary" plain style="width: 100%" @click="addCaseToSOP">
                  <el-icon><Plus /></el-icon> 新增关联用例 (Workflow)
                </el-button>
              </div>
            </div>
          </el-scrollbar>
        </div>
      </el-aside>

    <!-- App Graph Global Settings Dialog -->
    <el-dialog v-model="showGraphSettings" title="App Graph Global Variables" width="500px">
      <div class="form-wrapper" style="padding: 0">
        <div class="form-item">
          <div class="label">Global Variables (JSON)</div>
          <el-input 
            v-model="graphVariablesStr" 
            type="textarea" 
            :rows="10" 
            placeholder='{"base_url": "...", "env": "test"}'
          />
        </div>
      </div>
      <template #footer>
        <el-button @click="showGraphSettings = false">Cancel</el-button>
        <el-button type="primary" @click="saveGraphSettings">Save</el-button>
      </template>
    </el-dialog>

    </el-container>
  </el-container>
</template>

<script setup>
/* --- 以下完整保留你原始的所有业务逻辑 --- */
import {ref, onMounted, onUnmounted, watch, shallowRef, computed} from 'vue'
import {useRouter, useRoute, onBeforeRouteLeave} from 'vue-router'
import {VueFlow, useVueFlow} from '@vue-flow/core'
import {Background} from '@vue-flow/background'
import {Controls} from '@vue-flow/controls'
import {MiniMap} from '@vue-flow/minimap'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/controls/dist/style.css'
import '@vue-flow/minimap/dist/style.css'
import {ElButton, ElButtonGroup, ElTag, ElContainer, ElHeader, ElMain, ElIcon, ElMessage, ElAside, ElScrollbar, ElInput, ElInputNumber, ElEmpty, ElDialog, ElTabs, ElTabPane} from 'element-plus'
import {Delete, Refresh, ArrowLeft, Plus, Document, Edit, Setting} from '@element-plus/icons-vue'
import PageNode from './PageNode.vue'
import PageDetailEditor from './PageDetailEditor.vue'
import * as api from '../../../api/workReport'
import * as wsApi from '@/api/wsAppGraph'
import { fetchWorkflowDetailSimple, fetchWorkflowAdd } from '@/api/workflow'

const props = defineProps({
  nodeData: { type: Object, default: () => ({}) },
  isPicker: { type: Boolean, default: false },
  appId: { type: [String, Number], default: '' }
})
const emit = defineEmits(['pick', 'close'])

const isReady = ref(false)
const nodes = ref([])
const edges = ref([])
const activeSopTab = ref('business')
const workflowCache = ref({}) // 🔥 缓存 Workflow 详情 (id -> {id, name, desc})
const sops = ref([]) // SOP List
const selectedSopId = ref(null)
const currentSopForm = ref({ name: '', desc: '', variablesStr: '{}' })
const showGraphSettings = ref(false)
const graphVariablesStr = ref('{}')
const router = useRouter()
const route = useRoute()
const graphId = ref(null)
const saveStatus = ref('saved')
let autoSaveTimer = null
const flowInstance = shallowRef(null)
const editorContainerRef = ref(null)

const onPaneReady = (instance) => {
  flowInstance.value = instance
  instance.fitView()
}

// --- SOP Logic ---
const createNewSOP = async () => {
  if (!graphId.value) return
  try {
    const type = activeSopTab.value === 'system' ? 'system' : 'business'
    const priority = type === 'system' ? 100 : 0
    const res = await wsApi.wsCreateSOP({
      graph_id: graphId.value,
      name: 'New SOP ' + (sops.value.length + 1),
      type: type,
      priority: priority,
      desc: 'Created via frontend',
      nodes: []
    })
    if (res.code === 200) {
      // Refresh or push to list
      // Assuming backend returns the created SOP object
      // For now, let's reload the graph to be safe or push if structure matches
      loadGraphData() 
    }
  } catch (e) {
    ElMessage.error('Failed to create SOP')
  }
}

const selectSOP = (sop) => {
  selectedSopId.value = sop.id
  // Init form
  currentSopForm.value = {
    name: sop.name,
    desc: sop.desc,
    priority: sop.priority || 0,
    variablesStr: JSON.stringify(sop.variables || {}, null, 2)
  }
}

const businessSops = computed(() => sops.value.filter(s => s.type !== 'system' && s.type !== 'interaction'))
const systemSops = computed(() => sops.value.filter(s => s.type === 'system' || s.type === 'interaction').sort((a, b) => (b.priority || 0) - (a.priority || 0)))
const currentSopName = computed(() => sops.value.find(s => s.id === selectedSopId.value)?.name || '')

const sopBoundingBoxStyle = computed(() => {
  const sop = sops.value.find(s => s.id === selectedSopId.value)
  if (!sop || !sop.nodes || sop.nodes.length === 0) return { display: 'none' }
  
  // 找到所有关联节点
  const relatedNodes = nodes.value.filter(n => sop.nodes.includes(n.id))
  if (relatedNodes.length === 0) return { display: 'none' }

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  relatedNodes.forEach(n => {
    const x = n.position.x
    const y = n.position.y
    const w = n.data?.naturalSize?.w || 375
    const h = n.data?.naturalSize?.h || 667
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x + w > maxX) maxX = x + w
    if (y + h > maxY) maxY = y + h
  })

  const padding = 60
  return {
    left: (minX - padding) + 'px',
    top: (minY - padding) + 'px',
    width: (maxX - minX + padding * 2) + 'px',
    height: (maxY - minY + padding * 2) + 'px'
  }
})

const getSopCases = (sopId) => {
  const sop = sops.value.find(s => s.id === sopId)
  if (!sop || !sop.workflows) return []
  // 从缓存中获取 Workflow 详情，如果没有则显示 ID
  return sop.workflows.map(wfItem => {
    const wfId = typeof wfItem === 'object' ? wfItem.id : wfItem
    return workflowCache.value[wfId] || { id: wfId, label: 'Loading...', desc: '' }
  })
}

const editCase = (node) => {
  const targetId = node.id
  const currentAppId = props.appId || route.params.appId || route.query.appId

  if (targetId) {
    router.push({
      name: 'Editor',
      params: { id: targetId },
      query: { appId: currentAppId }
    })
  } else {
    ElMessage.warning('未找到关联的工作流 ID')
  }
}

const addCaseToSOP = async () => {
  if (!selectedSopId.value) return
  
  // 1. 直接创建 Workflow
  let newWorkflowId = null
  const newName = 'New Case ' + new Date().toLocaleString()
  try {
    const initialContent = {
      nodes: [
        {
          id: `public-trigger-${Date.now()}`,
          type: 'custom',
          nodeCode: 'public/trigger',
          nodeType: 200,
          position: { x: 100, y: 200 },
          data: {
            label: '开始',
            nodeCode: 'public/trigger',
            nodeType: 200,
            platform: 'common'
          }
        }
      ],
      edges: []
    }
    const res = await fetchWorkflowAdd(newName, 'Created via SOP', initialContent)
    if (res.code === 200) {
      newWorkflowId = res.data?.id || (res.data && typeof res.data !== 'object' ? res.data : null) || res.id
      // 缓存新用例信息
      if (newWorkflowId) {
        workflowCache.value[newWorkflowId] = { id: newWorkflowId, label: res.data?.name || newName, desc: '' }
      }
    }
  } catch (e) {
    ElMessage.error('创建用例失败')
    return
  }
  
  if (!newWorkflowId) return

  // 2. 关联到当前 SOP
  const sop = sops.value.find(s => s.id === selectedSopId.value)
  if (sop) {
    // 后端返回的是对象列表，但更新时通常传 ID 列表，或者我们需要构造一个临时对象推入
    const newWorkflowsList = [...(sop.workflows || []).map(w => String(typeof w === 'object' ? w.id : w)), String(newWorkflowId)]
    try {
      await wsApi.wsUpdateSOP({
        sop_id: selectedSopId.value,
        workflows: newWorkflowsList
      })
      sop.workflows = newWorkflowsList
      ElMessage.success('已创建用例并关联到 SOP')
    } catch (e) {
      ElMessage.error('关联 SOP 失败')
    }
  }
}

const handleUpdateSOP = async () => {
  if (!selectedSopId.value) return
  try {
    await wsApi.wsUpdateSOP({
      sop_id: selectedSopId.value,
      name: currentSopForm.value.name,
      desc: currentSopForm.value.desc,
      priority: currentSopForm.value.priority
    })
    // Update local list
    const sop = sops.value.find(s => s.id === selectedSopId.value)
    if (sop) {
      sop.name = currentSopForm.value.name
      sop.desc = currentSopForm.value.desc
      sop.priority = currentSopForm.value.priority
    }
  } catch (e) {
    ElMessage.error('Update failed')
  }
}

const handleUpdateSOPVariables = async () => {
  if (!selectedSopId.value) return
  try {
    const vars = JSON.parse(currentSopForm.value.variablesStr)
    await wsApi.wsUpdateSOP({
      sop_id: selectedSopId.value,
      variables: vars
    })
    const sop = sops.value.find(s => s.id === selectedSopId.value)
    if (sop) sop.variables = vars
  } catch (e) {
    ElMessage.error('Invalid JSON format')
  }
}

const handleDeleteSOP = async () => {
  if (!selectedSopId.value) return
  try {
    await wsApi.wsDeleteSOP(selectedSopId.value)
    sops.value = sops.value.filter(s => s.id !== selectedSopId.value)
    selectedSopId.value = null
    ElMessage.success('SOP deleted')
  } catch (e) {
    ElMessage.error('Delete failed')
  }
}

const openGraphSettings = () => {
  showGraphSettings.value = true
}

const saveGraphSettings = async () => {
  try {
    const vars = JSON.parse(graphVariablesStr.value)
    // Assuming wsUpdateAppGraph exists or we use a generic update
    // Since wsUpdateAppGraph is not in the provided wsAppGraph.js context, 
    // I will assume it needs to be added or I should use a generic request.
    // For now, I'll use a direct sendWsRequest call pattern if needed, or assume wsApi has it.
    // Let's assume we need to add it to wsAppGraph.js as well.
    await wsApi.wsUpdateAppGraph({ graph_id: graphId.value, variables: vars })
    ElMessage.success('Global variables updated')
    showGraphSettings.value = false
  } catch (e) {
    ElMessage.error('Failed to save settings: ' + e.message)
  }
}

// 1. 完整的数据加载与重试逻辑
const loadGraphData = async (retryCount = 0) => {
  // 🔥 拾取模式 (单节点预览)：只有 nodeData 没有 appId 时才使用单节点预览
  if (props.isPicker && props.nodeData && !props.appId && !route.params.appId) {
    const n = props.nodeData
    nodes.value = [{
      id: n.id || 'preview',
      type: 'page',
      position: {x: 0, y: 0},
      data: {
        ...n,
        interactions: n.interactions || []
      }
    }]
    isReady.value = true
    return
  }

  // 🔥 优先使用传入的 appId (拾取模式)，否则使用路由参数
  const id = props.appId || route.params.appId || route.query.appId;

  if (id) {
    try {
      const isAppId = isNaN(Number(id))
      if (isAppId) {
        const listRes = await wsApi.wsGetAppGraphList(id)
        if (listRes.code === 200 && listRes.data?.length > 0) {
          graphId.value = listRes.data[0].id
        } else {
          const createRes = await wsApi.wsCreateAppGraph({name: 'Default Graph', app_id: id})
          if (createRes.code === 200) graphId.value = createRes.data.id
        }
      } else {
        graphId.value = id
      }

      if (graphId.value) {
        const detailRes = await wsApi.wsGetAppGraphDetail(graphId.value)
        if (detailRes.code === 200) {
          const rawNodes = detailRes.data.nodes || []
          const rawEdges = detailRes.data.edges || []// 在 loadGraphData 函数内修改 nodes.value 的映射部分
          sops.value = detailRes.data.sops || [] // Load SOPs

          // Load Graph Variables
          const gVars = detailRes.data.variables || {}
          graphVariablesStr.value = JSON.stringify(gVars, null, 2)

          const allMappedNodes = rawNodes.map(n => {
            // 1. 兼容后端返回的 components 字段 (你在 save 时传的是这个)
            const rawComponents = n.components || n.data?.interactions || [];

            // 2. 还原 interactions 结构
            const processedInteractions = rawComponents.map((c, idx) => {
              const rect = c.rect || c
              
              // 🔥 修复：确保 ID 存在。如果后端数据缺失 ID，使用确定性算法生成临时 ID
              const effectiveId = c.id || c.uid || `gen-${n.id}-${idx}`
              const base = { ...c, id: effectiveId, uid: effectiveId }

              if (c.rect) {
                return {...base, x: Number(c.rect.x), y: Number(c.rect.y), w: Number(c.rect.w), h: Number(c.rect.h), states: c.states || []};
              }
              return {...base, x: Number(c.x), y: Number(c.y), w: Number(c.w), h: Number(c.h), states: c.states || []};
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
                is_blocking: n.is_blocking || n.data?.is_blocking || false, // 🔥 阻断属性
                workflow_id: n.workflow_id || n.data?.workflow_id,
                screenshot: n.screenshot || n.data?.screenshot,
                skeleton_config: n.skeleton_config || n.data?.skeleton_config || {},

              },
              selected: false,
              dragging: false
            }
          })

          // 🔥 过滤掉旧数据的 Case 节点，画布只显示页面和组件
          nodes.value = allMappedNodes.filter(n => n.type !== 'case')

          // 🔥 加载 SOP 关联的 Workflow 详情
          const allWorkflowIds = new Set()
          sops.value.forEach(s => {
            if (s.workflows && Array.isArray(s.workflows)) {
              s.workflows.forEach(w => {
                const id = typeof w === 'object' ? w.id : w
                allWorkflowIds.add(id)
              })
            }
          })
          
          if (allWorkflowIds.size > 0) {
            Promise.all(Array.from(allWorkflowIds).map(async (wfId) => {
              try {
                const res = await fetchWorkflowDetailSimple(wfId)
                if (res.code === 200 && res.data) {
                  workflowCache.value[wfId] = { id: wfId, label: res.data.name, desc: res.data.desc || '' }
                }
              } catch (e) {
                console.error('Fetch workflow detail failed', e)
              }
            }))
          }

          // 🔥 修复：过滤掉孤立的连线 (因为部分节点可能被隐藏)
          const validNodeIds = new Set(nodes.value.map(n => n.id))
          edges.value = rawEdges
              .filter(e => validNodeIds.has(String(e.source)) && validNodeIds.has(String(e.target)))
              .map(e => ({...e, id: String(e.id)}))
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
      if (targetNode) flowInstance.value?.fitView({nodes: [targetNode], padding: 0.2, duration: 800})
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
  Object.values(saveTimers).forEach(t => clearTimeout(t))
})

const selectedElements = ref([])
const selectedNode = ref(null)
const saveTimers = {}

const getSafeScreenshot = (val) => {
  if (val && typeof val === 'object') return val.path || val.url
  return typeof val === 'string' ? val : null
}

// 辅助：清洗路径
const cleanPath = (path) => {
  if (path && typeof path === 'string' && path.startsWith('/static/')) return path.replace('/static/', '')
  return path
}

// 3. 完整的连线与 ParentNode 逻辑
const onConnect = async (params) => {
  // 🔥 拾取模式下禁止连线操作
  if (props.isPicker) return

  flowInstance.value?.addEdges([params])
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
        screenshot: cleanPath(getSafeScreenshot(childNode.data.screenshot)),
        workflow_id: childNode.data.workflow_id ? String(childNode.data.workflow_id) : null,
        skeleton_config: childNode.data.skeleton_config || {},
        components: (childNode.data.interactions || []).map(c => ({
          ...c,
          uid: c.uid || c.id || null,
          rect: {x: c.x, y: c.y, w: c.w, h: c.h},
          skeleton_config: c.skeleton_config || {},
          states: (c.states || []).map(s => ({...s, skeleton_config: s.skeleton_config || {}}))
        }))
      }
      try {
        await wsApi.wsSaveNodeDetail(payload)
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
const onNodeClick = (e) => {
  // 🔥 拾取模式：计算点击位置是否命中热区
  if (props.isPicker) {
    const {node, event} = e
    
    // 1. 尝试使用 DOM 元素计算 (最准确，所见即所得)
    // 🔥 修复：使用 ref 获取当前容器，防止 document.querySelector 选中背景中其他编辑器的节点
    const container = editorContainerRef.value?.$el || editorContainerRef.value
    const nodeEl = container?.querySelector(`[data-id="${node.id}"]`)
    let checkX, checkY
    
    if (nodeEl) {
      // 🔥 修复：优先定位图片元素，排除节点头部/边框的影响 (Header 高度会导致 Y 轴偏移)
      const targetEl = nodeEl.querySelector('img') || nodeEl
      const rect = targetEl.getBoundingClientRect()

      // 计算点击在节点内的相对百分比位置
      const percentX = (event.clientX - rect.left) / rect.width
      const percentY = (event.clientY - rect.top) / rect.height
      
      // 映射到原始尺寸
      const naturalW = node.data.naturalSize?.w || rect.width
      const naturalH = node.data.naturalSize?.h || rect.height
      
      checkX = percentX * naturalW
      checkY = percentY * naturalH

      // 🔥 增加模糊匹配逻辑：如果未精准命中，尝试寻找最近的热区 (容错范围 20px)
      const scale = naturalW / rect.width
      const threshold = 20 * scale
      const interactions = node.data.interactions || []

      // 1. 精准命中
      let hit = interactions.find(i =>
          checkX >= i.x && checkX <= i.x + i.w &&
          checkY >= i.y && checkY <= i.y + i.h
      )

      // 2. 模糊命中 (寻找最近的)
      if (!hit) {
        let minDesc = Infinity
        let closest = null
        for (const i of interactions) {
          // 计算点到矩形的距离
          const dx = Math.max(i.x - checkX, 0, checkX - (i.x + i.w))
          const dy = Math.max(i.y - checkY, 0, checkY - (i.y + i.h))
          const dist = Math.sqrt(dx * dx + dy * dy)

          if (dist <= threshold && dist < minDesc) {
            minDesc = dist
            closest = i
          }
        }
        if (closest) hit = closest
      }

      if (hit) {
        // 🔥 携带上下文信息 (截图、尺寸)，以便接收方能显示缩略图
        const payload = {
          ...hit,
          __context: { screenshot: node.data.screenshot, naturalSize: node.data.naturalSize, sourceNodeId: node.id }
        }
        emit('pick', payload)
      } else {
        ElMessage.info('未点击到热区，请点击标记框选区域')
      }
      return
    } else {
      // 2. 降级方案：使用 Vue Flow 坐标投影
      if (!flowInstance.value) return
      const flowPos = flowInstance.value.project({x: event.clientX, y: event.clientY})
      const relX = flowPos.x - node.position.x
      const relY = flowPos.y - node.position.y

      const currentW = node.dimensions?.width || node.data.naturalSize?.w || 1
      const currentH = node.dimensions?.height || node.data.naturalSize?.h || 1
      const scaleX = (node.data.naturalSize?.w || currentW) / currentW
      const scaleY = (node.data.naturalSize?.h || currentH) / currentH
      
      checkX = relX * scaleX
      checkY = relY * scaleY

      const hit = (node.data.interactions || []).find(i =>
          checkX >= i.x && checkX <= i.x + i.w &&
          checkY >= i.y && checkY <= i.y + i.h
      )
      if (hit) {
        // 🔥 携带上下文信息 (截图、尺寸)，以便接收方能显示缩略图
        const payload = {
          ...hit,
          __context: { screenshot: node.data.screenshot, naturalSize: node.data.naturalSize }
        }
        emit('pick', payload)
      }
    }
    return
  }
}

// 4. 完整的双击跳转逻辑
const onNodeDoubleClick = (e) => {
  // 🔥 拾取模式：支持双击选中 (复用单击逻辑)
  if (props.isPicker) {
    onNodeClick(e)
    return
  }

  const {node} = e
  if (node.type === 'case') {
    sessionStorage.setItem('last_visited_case_id', node.id)
    const targetId = node.data?.workflow_id
    
    // 🔥 关键修复：跳转时携带当前 AppID，确保流程编辑器知道上下文
    const currentAppId = props.appId || route.params.appId || route.query.appId

    if (targetId) {
      router.push({name: 'Editor', params: {id: targetId}, query: {appId: currentAppId}})
    } else if (node.id.toString().startsWith('node-')) {
      router.push({name: 'Editor', query: {appId: currentAppId}})
    } else {
      router.push({name: 'Editor', params: {id: node.id}, query: {appId: currentAppId}})
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
  // 🔥 严重修复：拾取模式下绝对禁止触发自动保存，否则会覆盖掉被隐藏的节点(如用例节点)导致数据丢失
  if (props.isPicker) return

  saveStatus.value = 'saving'
  if (autoSaveTimer) clearTimeout(autoSaveTimer)
  autoSaveTimer = setTimeout(handleSaveLayout, 1000)
}

const ensureGraphId = async () => {
  if (graphId.value) return graphId.value
  const appId = route.params.appId
  if (!appId) return null
  try {
    const createRes = await wsApi.wsCreateAppGraph({name: 'New Workflow ' + new Date().toLocaleString(), app_id: appId})
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
  // 🔥 严重修复：拾取模式下禁止保存布局
  if (props.isPicker) return

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
    await wsApi.wsSyncGraphLayout({graph_id: graphId.value, nodes: saveNodes, edges: saveEdges})
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

const onNodeUpdate = (updatedNode) => {
  // 🔥 严重修复：拾取模式下禁止更新节点详情
  if (props.isPicker) return

  if (!graphId.value) return

  const nodeId = updatedNode.id
  if (saveTimers[nodeId]) clearTimeout(saveTimers[nodeId])

  saveTimers[nodeId] = setTimeout(async () => {
    const payload = {
      graph_id: graphId.value,
      node_id: updatedNode.id,
      type: updatedNode.type || 'page',
      label: updatedNode.label,
      desc: updatedNode.data.desc || '',
      is_blocking: updatedNode.data.is_blocking || false,
      parentNode: updatedNode.parentNode || null,
      naturalSize: updatedNode.data.naturalSize || null,
      screenshot: cleanPath(getSafeScreenshot(updatedNode.data.screenshot)),
      skeleton_config: updatedNode.data.skeleton_config || {},
      workflow_id: updatedNode.data.workflow_id ? String(updatedNode.data.workflow_id) : null,
      components: (updatedNode.data.interactions || []).map(c => ({
        ...c,
        uid: c.uid || c.id || null,
        rect: {x: c.x, y: c.y, w: c.w, h: c.h},
        skeleton_config: c.skeleton_config || {},
        states: (c.states || []).map(s => ({...s, skeleton_config: s.skeleton_config || {}}))
      }))
    }
    try {
      await wsApi.wsSaveNodeDetail(payload);
      triggerAutoSave()
    } catch (error) {
      ElMessage.error('保存失败')
    }
    delete saveTimers[nodeId]
  }, 1000)
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

// 7. 完整的节点添加系列方法
const addNode = async (type) => {
  let position = {x: 100 + Math.random() * 50, y: 100 + Math.random() * 50}
  let parentNode = null
  if (selectedElements.value.length > 0) {
    parentNode = selectedElements.value[selectedElements.value.length - 1]
    position = {x: parentNode.position.x + 250, y: parentNode.position.y}
  }
  const newNode = createNodeData(type, position)
  try {
    const gid = await ensureGraphId()
    if (gid) {
      await wsApi.wsAddEmptyNode({
        graph_id: gid,
        node_id: newNode.id,
        type: newNode.type,
        label: newNode.label,
        x: parseInt(position.x),
        y: parseInt(position.y)
      })
      await wsApi.wsSaveNodeDetail({
        graph_id: gid,
        node_id: newNode.id,
        type: newNode.type,
        label: newNode.label,
        desc: '',
        is_blocking: false,
        parentNode: null,
        naturalSize: newNode.data.naturalSize || null,
        screenshot: null,
        components: []
      })
    }
    nodes.value.push(newNode)
  } catch (error) {
    ElMessage.error('添加失败');
    return null
  }

  if (parentNode) {
    setTimeout(() => {
      flowInstance.value?.addEdges([{
        id: `e-${parentNode.id}-${newNode.id}`,
        source: parentNode.id,
        target: newNode.id,
        type: 'smoothstep'
      }])
    }, 10)
    triggerAutoSave()
  }
  return newNode
}

const addChildNode = async () => {
  if (selectedElements.value.length === 0) return
  const parent = selectedElements.value[0]
  const newNode = createNodeData(parent.type || 'page', {x: parent.position.x + 300, y: parent.position.y})
  try {
    const gid = await ensureGraphId()
    if (gid) {
      await wsApi.wsAddEmptyNode({
        graph_id: gid,
        node_id: newNode.id,
        type: newNode.type,
        label: newNode.label,
        x: parseInt(newNode.position.x),
        y: parseInt(newNode.position.y)
      })
      await wsApi.wsSaveNodeDetail({
        graph_id: gid,
        node_id: newNode.id,
        type: newNode.type,
        label: newNode.label,
        desc: '',
        parentNode: null,
        naturalSize: newNode.data.naturalSize || null,
        screenshot: null,
        components: []
      })
    }
    nodes.value.push(newNode)
  } catch (error) {
    return
  }
  setTimeout(() => {
    flowInstance.value?.addEdges([{
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
  try {
    const gid = await ensureGraphId()
    if (gid) {
      await wsApi.wsAddEmptyNode({
        graph_id: gid,
        node_id: newNode.id,
        type: newNode.type,
        label: newNode.label,
        x: parseInt(newNode.position.x),
        y: parseInt(newNode.position.y)
      })
      await wsApi.wsSaveNodeDetail({
        graph_id: gid,
        node_id: newNode.id,
        type: newNode.type,
        label: newNode.label,
        desc: '',
        parentNode: null,
        naturalSize: newNode.data.naturalSize || null,
        screenshot: null,
        components: []
      })
    }
    nodes.value.push(newNode)
  } catch (error) {
    return
  }
  setTimeout(() => {
    flowInstance.value?.addEdges([{
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
  try {
    const gid = await ensureGraphId()
    if (gid) {
      await wsApi.wsAddEmptyNode({
        graph_id: gid,
        node_id: newNode.id,
        type: newNode.type,
        label: newNode.label,
        x: parseInt(newNode.position.x),
        y: parseInt(newNode.position.y)
      })
      await wsApi.wsSaveNodeDetail({
        graph_id: gid,
        node_id: newNode.id,
        type: newNode.type,
        label: newNode.label,
        desc: '',
        parentNode: null,
        naturalSize: newNode.data.naturalSize || null,
        screenshot: null,
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
  if (flowInstance.value) flowInstance.value.removeNodes(selectedElements.value)
  selectedElements.value = [];
  triggerAutoSave()
}

const fitView = () => flowInstance.value?.fitView()

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
  height: 100%; /* 🔥 修复：改为 100% 适应父容器(弹窗)，防止撑满全屏 */
  width: 100%;
  background: transparent !important; /* 必须透明看到底层水波纹 */
}
.three-column-layout { flex-direction: column; }

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

.main-body {
  flex: 1;
  display: flex;
  overflow: hidden;
}

/* SOP Sidebar */
.sop-sidebar {
  background: rgba(255, 255, 255, 0.6);
  backdrop-filter: blur(10px);
  border-right: 1px solid rgba(255, 255, 255, 0.5);
  display: flex;
  flex-direction: column;
}
.sop-tabs { flex: 1; display: flex; flex-direction: column; }
:deep(.sop-tabs .el-tabs__content) { flex: 1; overflow: hidden; display: flex; flex-direction: column; }
:deep(.sop-tabs .el-tab-pane) { height: 100%; display: flex; flex-direction: column; }

.sidebar-header {
  padding: 15px;
  border-bottom: 1px solid rgba(0,0,0,0.05);
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: 600;
  color: #374151;
}
.sop-item {
  padding: 12px 15px;
  cursor: pointer;
  border-bottom: 1px solid rgba(0,0,0,0.03);
  transition: background 0.2s;
}
.sop-item:hover { background: rgba(0,0,0,0.02); }
.sop-item.active { background: rgba(99, 102, 241, 0.1); border-left: 3px solid #6366f1; }

/* 系统反射 SOP 样式 */
.sop-item.system.active { background: rgba(249, 115, 22, 0.1); border-left-color: #f97316; }

.sop-name { font-weight: 500; font-size: 14px; color: #1f2937; display: block; margin-bottom: 4px; }
.sop-desc { font-size: 12px; color: #9ca3af; }

/* Props Sidebar */
.props-sidebar {
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(10px);
  border-left: 1px solid rgba(255, 255, 255, 0.5);
  display: flex;
  flex-direction: column;
}
.sidebar-content { height: 100%; display: flex; flex-direction: column; }
.form-wrapper { padding: 20px; }
.form-item { margin-bottom: 20px; }
.form-item .label {
  font-size: 12px;
  font-weight: 600;
  color: #6b7280;
  margin-bottom: 6px;
  text-transform: uppercase;
}
.case-list-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px;
  background: #f8fafc;
  border-radius: 6px;
  margin-bottom: 6px;
  font-size: 13px;
  color: #334155;
}
.case-info {
  display: flex;
  align-items: center;
  gap: 6px;
  overflow: hidden;
  flex: 1;
}
.case-label {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.empty-text { font-size: 12px; color: #9ca3af; font-style: italic; }
.empty-sidebar {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
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

/* SOP Visual Grouping */
.sop-group-bg {
  position: absolute;
  z-index: -1;
  border: 2px dashed rgba(99, 102, 241, 0.3);
  background: rgba(99, 102, 241, 0.05);
  border-radius: 12px;
  pointer-events: none; /* Let clicks pass through to nodes */
  transition: all 0.3s ease;
}
.sop-group-bg.system {
  border-color: rgba(249, 115, 22, 0.5);
  background: rgba(249, 115, 22, 0.08);
  background-image: repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(249, 115, 22, 0.05) 10px, rgba(249, 115, 22, 0.05) 20px);
}
.sop-group-label {
  position: absolute; top: -24px; left: 0;
  background: inherit; color: #666; font-size: 12px; padding: 2px 8px; border-radius: 4px;
  font-weight: bold;
}
.sop-group-bg.active {
  border-color: #6366f1;
  background: rgba(99, 102, 241, 0.1);
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