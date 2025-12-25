<template>
  <div class="detail-container">
    <!-- 顶部统计栏 -->
    <div class="stats-header">
      <div class="header-info">
        <el-button :icon="ArrowLeft" circle @click="goBack" style="margin-right: 15px" />
        <div>
          <h2>{{ currentTask?.name || '未知任务' }}</h2>
          <div class="meta">
            <span>ID: {{ currentTask?.id || route.params.id }}</span>
            <span class="divider">|</span>
            <span>耗时: 12m 30s</span>
          </div>
        </div>
      </div>
      <div class="stats-cards">
        <div class="stat-card">
          <div class="label">通过率</div>
          <div class="value green">{{ currentTask?.passRate || 0 }}%</div>
        </div>
        <div class="stat-card">
          <div class="label">已执行</div>
          <div class="value">{{ currentTask?.completed || 0 }}</div>
        </div>
      </div>
    </div>

    <!-- 脑图区域 -->
    <div class="mindmap-wrapper">
      <div class="map-toolbar">
        <span>🧠 测试链路追踪图谱</span>
        <div class="legend">
          <span class="dot pass"></span> 通过
          <span class="dot fail"></span> 失败
        </div>
      </div>
      
      <!-- 
        注意: class="flow-container" 强制设置了宽高 
        v-if 确保数据加载后再渲染，避免布局计算错误
      -->
      <VueFlow
        v-if="isReady && nodes.length > 0"
        v-model:nodes="nodes"
        v-model:edges="edges"
        :default-zoom="1.0"
        :min-zoom="0.2"
        :max-zoom="4"
        fit-view-on-init
        class="flow-container"
        @node-click="handleNodeClick"
      >
        <!-- 注册自定义节点 -->
        <template #node-result="props">
          <ResultNode v-bind="props" />
        </template>

        <Background pattern-color="#cbd5e1" :gap="20" />
        <Controls />
      </VueFlow>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { VueFlow } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/controls/dist/style.css'

// 引入拆分后的逻辑
import { useGraphLogic } from '../composables/useGraphLogic'
import { useTaskLogic } from '../composables/useTaskLogic'
import ResultNode from './ResultNode.vue'

// 引入 Element Plus 组件
import { ElButton } from 'element-plus'
import { ArrowLeft } from '@element-plus/icons-vue'

const router = useRouter()
const route = useRoute()
const { getGraphData } = useGraphLogic()
const { tasks } = useTaskLogic()

const currentTask = computed(() => tasks.value.find(t => t.id === route.params.id))

const nodes = ref([])
const edges = ref([])
const isReady = ref(false)

onMounted(async () => {
  // 模拟获取数据
  const data = await getGraphData(route.params.id || 'T-1001')
  
  // 处理节点数据，将测试用例节点转换为自定义类型 'result'
  data.nodes = data.nodes.map(node => {
    if (node.id.startsWith('c')) {
      return { ...node, type: 'result' } // 使用自定义组件 ResultNode
    }
    return node
  })

  nodes.value = data.nodes
  edges.value = data.edges
  
  // 延迟渲染，等待容器宽高计算完成，解决 Vue Flow 报错
  setTimeout(() => { isReady.value = true }, 400)
})

const goBack = () => {
  router.back()
}

const handleNodeClick = (event) => {
  // 点击用例节点(以 'c' 开头的ID)跳转到详情
  if (event.node.id && event.node.id.startsWith('c')) {
    router.push({
      name: 'CaseResult',
      params: { id: event.node.id }
    })
  }
}
</script>

<style scoped>
.detail-container { 
  height: 100%; 
  width: 100%;
  display: flex; 
  flex-direction: column; 
  overflow: hidden; /* 防止双重滚动条 */
}

.stats-header {
  height: 80px; 
  background: white; 
  border-bottom: 1px solid #e2e8f0;
  display: flex; 
  align-items: center; 
  justify-content: space-between; 
  padding: 0 30px;
  flex-shrink: 0; /* 防止头部被压缩 */
}

.header-info { display: flex; align-items: center; gap: 15px; }
.header-info h2 { margin: 0 0 4px 0; font-size: 18px; color: #1e293b; }
.meta { font-size: 12px; color: #64748b; display: flex; gap: 8px; align-items: center; }
.divider { color: #cbd5e1; }

.stats-cards { display: flex; gap: 20px; }
.stat-card { 
  background: #f8fafc; 
  padding: 8px 16px; 
  border-radius: 8px; 
  border: 1px solid #e2e8f0; 
  text-align: center; 
  min-width: 80px;
}
.stat-card .label { font-size: 11px; color: #64748b; text-transform: uppercase; margin-bottom: 2px; }
.stat-card .value { font-size: 18px; font-weight: 700; color: #1e293b; }
.stat-card .value.green { color: #10b981; }
.stat-card .value.red { color: #ef4444; }

.mindmap-wrapper { 
  flex: 1; 
  position: relative; 
  background: #f1f5f9; 
  width: 100%;
  height: 100%; /* 确保填满 flex 子项 */
  overflow: hidden;
  min-height: 0; /* 关键：防止 flex 子项高度塌陷 */
}

/* 强制 VueFlow 占满容器 */
.flow-container {
  position: absolute;
  top: 0;
  left: 0;
  width: 100% !important;
  height: 100% !important;
}

.map-toolbar {
  position: absolute; 
  top: 20px; 
  left: 20px; 
  z-index: 10;
  background: rgba(255, 255, 255, 0.9); 
  backdrop-filter: blur(4px);
  padding: 10px 16px; 
  border-radius: 8px; 
  border: 1px solid #e2e8f0;
  display: flex; 
  flex-direction: column; 
  gap: 8px; 
  font-size: 14px; 
  font-weight: 600; 
  color: #334155;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
}
.legend { display: flex; gap: 12px; font-size: 12px; font-weight: normal; color: #64748b; align-items: center; }
.dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
.dot.pass { background: #10b981; }
.dot.fail { background: #ef4444; }

:deep(.vue-flow__node) {
  font-size: 12px; 
  font-weight: 500; 
  border-radius: 6px;
  box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); 
  padding: 8px 12px; 
  text-align: center; 
  cursor: pointer;
  transition: transform 0.2s;
}

:deep(.vue-flow__node:hover) {
  transform: scale(1.05);
}
</style>