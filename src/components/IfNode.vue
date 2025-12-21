<template>
  <div
    class="if-node-container"
    :class="{ selected: selected }"
  >
    <!-- 左侧输入点 -->
    <Handle
      id="left"
      type="target"
      position="left"
      class="handle-base handle-input"
    />

    <!-- 节点头部 -->
    <div class="node-header">
      <div class="icon-wrapper">
        <component :is="getIcon('Split')" class="node-icon" />
      </div>
      <span class="label">逻辑判断</span>
    </div>

    <!-- 节点内容区域 -->
    <div class="node-body">
      <!-- 条件分支列表 -->
      <div
        v-for="(cond, index) in conditions"
        :key="index"
        class="branch-row"
      >
        <div class="branch-meta">
          <span class="branch-tag">IF {{ index + 1 }}</span>
        </div>

        <div class="branch-condition" :title="formatCondition(cond)">
          <!-- 🔥 修复1: 显示 '节点名.变量名' -->
          <span class="code-var">{{ getVarName(cond.left) }}</span>

          <span class="code-op">{{ cond.op || '?' }}</span>

          <!-- 🔥 修复2: 完整显示右侧值，不隐藏 -->
          <span class="code-val">{{ cond.right || '空' }}</span>
        </div>

        <Handle
          :id="`branch-${index}`"
          type="source"
          position="right"
          class="handle-base handle-output"
        />
      </div>

      <!-- Else 分支 -->
      <div class="branch-row else-row">
        <div class="branch-meta">
          <span class="branch-tag tag-else">ELSE</span>
        </div>
        <div class="branch-condition">
          <span class="text-desc">不满足以上条件</span>
        </div>

        <Handle
          id="else"
          type="source"
          position="right"
          class="handle-base handle-output"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, onMounted } from 'vue'
import { Handle, useVueFlow } from '@vue-flow/core' // 🔥 引入 useVueFlow
import { getIcon } from '../config/iconMap'
import {scanComponentsApi} from '@/api/workflow'

const props = defineProps(['data', 'selected'])
const { findNode } = useVueFlow() // 🔥 获取查找节点方法
const schemaDef = ref(null)

onMounted(async () => {
  const nodeCode = props.data.nodeCode || 'cfs/mIf'
  try {
    const allSchema = await scanComponentsApi()
    schemaDef.value = allSchema[nodeCode]
  } catch (e) {
    console.warn('Schema load failed', e)
  }
})

// 颜色工具
const hexToRgba = (hex, alpha = 1) => {
  if (!hex) return `rgba(16, 185, 129, ${alpha})`
  let c = hex.substring(1).split('')
  if (c.length === 3) c = [c[0], c[0], c[1], c[1], c[2], c[2]]
  c = '0x' + c.join('')
  return `rgba(${(c >> 16) & 255}, ${(c >> 8) & 255}, ${c & 255}, ${alpha})`
}

// 样式变量
const themeColor = computed(() => schemaDef.value?.categoryColor || '#10b981')
const themeBgLight = computed(() => hexToRgba(themeColor.value, 0.08))
const themeBorderColor = computed(() => hexToRgba(themeColor.value, 0.3))

const conditions = computed(() => props.data.conditions || [])

const formatCondition = (cond) => {
  if (!cond.left) return '未配置'
  return `${getVarName(cond.left)} ${cond.op} ${cond.right}`
}

// 🔥 核心逻辑：将 {{id.key}} 解析为 Start.input
const getVarName = (str) => {
  if (!str) return '?'
  // 匹配 {{nodeId.key}} 格式
  const match = str.match(/^{{(.+?)\.(.+?)}}$/)
  if (match) {
    const nodeId = match[1]
    const varKey = match[2]
    // 查找节点获取 Label
    const targetNode = findNode(nodeId)
    const nodeLabel = targetNode ? targetNode.label : nodeId
    return `${nodeLabel}.${varKey}`
  }
  // 兼容旧格式或纯文本
  if (str.includes('.')) return str.split('.')[1].replace('}}', '')
  return str.replace(/{{|}}/g, '').trim()
}
</script>

<style scoped>
.if-node-container {
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  min-width: 240px;
  /* 🔥 修复2: 宽度自适应，由内容撑开 */
  width: fit-content;
  box-shadow: 0 4px 12px -2px rgba(0, 0, 0, 0.08);
  transition: all 0.2s ease;
  overflow: visible; /* 允许 Handle 显示在外部 */
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}

.if-node-container.selected {
  border-color: v-bind(themeColor);
  box-shadow: 0 0 0 3px v-bind(themeBgLight);
}

.node-header {
  background: linear-gradient(to right, v-bind(themeBgLight), transparent);
  border-bottom: 1px solid v-bind(themeBgLight);
  padding: 10px 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  border-top-left-radius: 10px;
  border-top-right-radius: 10px;
}

.icon-wrapper {
  display: flex; align-items: center; justify-content: center;
  width: 24px; height: 24px; background: white; border-radius: 6px;
  box-shadow: 0 1px 2px rgba(0,0,0,0.05); color: v-bind(themeColor);
}
.node-icon { width: 14px; height: 14px; }
.label { font-weight: 700; color: #334155; font-size: 13px; letter-spacing: 0.5px; }

.node-body { padding: 4px 0; }

.branch-row {
  position: relative; display: flex; align-items: center;
  padding: 8px 12px; border-bottom: 1px dashed #f1f5f9;
  height: 36px; transition: background 0.15s;
}
.branch-row:last-child { border-bottom: none; }
.branch-row:hover { background: #f8fafc; }

.branch-meta { width: 50px; flex-shrink: 0; }
.branch-tag {
  display: inline-block; font-size: 10px; padding: 2px 6px;
  border-radius: 4px; font-weight: 700;
  background: v-bind(themeBgLight); color: v-bind(themeColor);
  text-transform: uppercase;
}
.tag-else { background: #f1f5f9; color: #64748b; }

.branch-condition {
  flex: 1; display: flex; align-items: center; gap: 4px;
  font-family: 'Menlo', 'Monaco', 'Courier New', monospace;
  font-size: 11px; color: #475569;
  /* 🔥 移除 overflow hidden，允许内容撑开 */
  white-space: nowrap;
}

.code-var { color: #0f172a; font-weight: 500; }
.code-op { color: v-bind(themeColor); font-weight: bold; }
.code-val {
  background: #f1f5f9; padding: 1px 4px; border-radius: 3px; color: #475569;
  white-space: nowrap;
}

.text-desc { font-size: 11px; color: #94a3b8; font-style: italic; }

.handle-base {
  width: 10px; height: 10px; border: 2px solid white;
  background: v-bind(themeColor);
  box-shadow: 0 0 0 1px rgba(0,0,0,0.1);
  transition: transform 0.2s, box-shadow 0.2s;
  z-index: 10; position: absolute;
}
.handle-base:hover { transform: scale(1.3); box-shadow: 0 0 0 3px v-bind(themeBorderColor); }
.handle-input { left: -5px; border-radius: 50%; top: 50% !important; transform: translateY(-50%); }
.handle-output { right: -5px; border-radius: 50%; top: 50% !important; transform: translateY(-50%) !important; }
.branch-row:hover .handle-output { transform: translateY(-50%) scale(1.3) !important; background: v-bind(themeColor); }
</style>