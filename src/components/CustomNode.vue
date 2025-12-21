<template>
  <div
    class="custom-node"
    :class="{ 'selected': selected, 'pick-disabled': data._pickDisabled }"
  >
    <!-- 左侧输入点 -->
    <Handle
      v-if="!isStartNode"
      id="left"
      type="target"
      position="left"
      class="handle-base handle-left"
      :style="{ background: themeColor }"
    />

    <!-- 头部 -->
    <div
      class="node-header"
      :style="{
        backgroundColor: hexToRgba(themeColor, 0.1),
        borderBottomColor: hexToRgba(themeColor, 0.2)
      }"
    >
      <component :is="finalIcon" class="node-icon" :style="{ color: themeColor }" />
      <span class="node-label">{{ label }}</span>
    </div>

    <div class="node-body">
      <div v-if="hasInputs" class="section inputs-section">
        <div class="section-title">参数 (Inputs)</div>
        <template v-for="field in inputFields" :key="field.name">
        <div v-if="shouldShowTopLevelField(field)" class="field-block">
          <div class="field-label-row">
            <span class="field-label">{{ field.label || field.name }}:</span>
          </div>

          <!-- 场景1: 变量引用 -->
          <div v-if="isVariable(data[field.name])" class="val-tag full-width">
            {{ getVarDisplayName(data[field.name]) }}
          </div>

          <!-- 🔥🔥 场景2: 列表/数组 (有数据时 - 多行展示) -->
          <div v-else-if="Array.isArray(data[field.name]) && data[field.name].length > 0" class="list-preview-box">
            <div v-for="(item, idx) in data[field.name].slice(0, 3)" :key="idx" class="list-item-preview">
              <span class="list-idx">{{ idx + 1 }}</span>
              <!-- 这里改为遍历数组，实现多行显示 -->
              <div class="list-content-col">
                <div v-for="(line, lineIdx) in formatListItem(item, field)" :key="lineIdx" class="list-line">
                  {{ line }}
                </div>
              </div>
            </div>
            <div v-if="data[field.name].length > 3" class="list-more">
              ... 还有 {{ data[field.name].length - 3 }} 项
            </div>
          </div>

          <!-- 🔥🔥 场景3: 普通文本/对象/空列表 (无数据时显示 - 空) -->
          <div v-else>
             <!-- 如果是空值，直接显示文字，不要外面的框 -->
             <span v-if="isEmptyListOrNull(data[field.name])" class="empty-text">
               - 空
             </span>

             <!-- 其他情况显示带框的文本 -->
             <div v-else class="val-text-wrapper">
               <span class="val-text" :title="formatTooltip(data[field.name])">
                 {{ formatValue(data[field.name]) }}
               </span>
             </div>
          </div>
        </div>
        </template>
      </div>

      <div v-if="hasInputs && hasOutputs" class="divider"></div>

      <div v-if="hasOutputs" class="section outputs-section">
        <div class="section-title">产出 (Outputs)</div>
        <div v-for="v in outputVars" :key="v.key" class="field-row">
          <span class="var-name">{{ v.key }}</span>
          <span class="var-type">{{ v.type }}</span>
        </div>
      </div>

      <div v-if="!hasInputs && !hasOutputs" class="empty-state">无需配置参数</div>
    </div>

    <!-- 右侧输出点 -->
    <Handle
      v-if="!isIfNode"
      id="right"
      type="source"
      position="right"
      class="handle-base handle-right"
      :style="{ background: themeColor }"
    />

    <!-- 循环节点底部点 -->
    <Handle
      v-if="isLoopNode"
      id="loop-source"
      type="source"
      position="bottom"
      class="handle-base handle-bottom"
      :style="{ background: themeColor }"
    />
  </div>
</template>

<script setup>
import { computed, ref, onMounted } from 'vue'
import { Handle, useVueFlow } from '@vue-flow/core'
import { getIcon } from '../config/iconMap'
import {scanComponentsApi} from '@/api/workflow'

const props = defineProps(['id', 'data', 'label', 'selected'])
const { findNode } = useVueFlow()
const schemaDef = ref(null)

onMounted(async () => {
  const allSchema = await scanComponentsApi()

  // 适配新版 API 结构: { "public": { desc: {...}, details: {...} }, ... }
  let found = null
  for (const groupKey in allSchema) {
    const group = allSchema[groupKey]
    const details = group.details || {}

    for (const key in details) {
      const item = details[key]
      if (item.address === props.data.nodeCode) {
        // 注入分类样式信息 (颜色/图标)
        found = { ...item, categoryColor: group.desc?.color, categoryIcon: group.desc?.icon }
        break
      }
    }
    if (found) break
  }
  schemaDef.value = found
})

const isStartNode = computed(() => props.data.nodeCode === 'public/trigger')
const isIfNode = computed(() => props.data.nodeCode === 'cfs/mIf' || props.data.nodeType === 'if')
const isLoopNode = computed(() => props.data.nodeCode === 'cfs/mFor' || props.label === 'FOR循环')

const themeColor = computed(() => schemaDef.value?.categoryColor || '#6366f1')

const hexToRgba = (hex, alpha = 0.1) => {
  if (!hex) return `rgba(99, 102, 241, ${alpha})`
  let c = hex.substring(1).split('')
  if (c.length === 3) c = [c[0], c[0], c[1], c[1], c[2], c[2]]
  c = '0x' + c.join('')
  return 'rgba(' + [(c >> 16) & 255, (c >> 8) & 255, c & 255].join(',') + `,${alpha})`
}

const finalIcon = computed(() => {
  const specificIconName = props.data.iconChar
  const categoryIconName = schemaDef.value?.categoryIcon
  const defaultIcons = ['default_icon', 'puzzle', 'default', '', 'code']
  if (defaultIcons.includes(specificIconName) && categoryIconName) {
    return getIcon(categoryIconName)
  }
  return getIcon(specificIconName)
})

const inputFields = computed(() => schemaDef.value?.inputs || [])
const outputVars = computed(() => schemaDef.value?.outputVars || [])
const hasInputs = computed(() => inputFields.value.length > 0)
const hasOutputs = computed(() => outputVars.value.length > 0)

const isVariable = (val) => typeof val === 'string' && /^{{(.+?)\.(.+?)}}$/.test(val)

const getVarDisplayName = (val) => {
  const match = val.match(/^{{(.+?)\.(.+?)}}$/)
  if (!match) return val
  const nodeId = match[1]
  const varKey = match[2]
  const node = findNode(nodeId)
  const nodeName = node ? node.label : nodeId
  return `${nodeName}.${varKey}`
}

// --- Top-level Field Logic ---
const shouldShowTopLevelField = (field) => {
  // 1. Platform field always visible
  if (field.name === 'platform') return true

  // 2. If field has show_if
  if (field.show_if) {
    const currentPlatform = props.data.platform
    if (!currentPlatform) return false
    if (Array.isArray(field.show_if)) {
      return field.show_if.includes(currentPlatform)
    }
    return false
  }
  return true
}

// --- List Sub-field Logic ---
const shouldShowSubField = (subField, item) => {
  if (subField.name === 'platform') return true
  const currentPlatform = item.platform || props.data.platform
  if (subField.show_if) {
    if (!currentPlatform) return false
    if (Array.isArray(subField.show_if)) {
      return subField.show_if.includes(currentPlatform)
    }
    return false
  }
  if (item && typeof item === 'object' && 'platform' in item && !item.platform) {
    return false
  }
  return true
}

// 判断是否为空列表或空值
const isEmptyListOrNull = (val) => {
  if (val === undefined || val === null || val === '') return true
  if (Array.isArray(val) && val.length === 0) return true
  if (typeof val === 'string' && (val === '[]' || val === '{}')) return true
  return false
}

// 🔥🔥 核心优化：返回字符串数组，以便在模板中分行渲染
const formatListItem = (item, field) => {
  if (typeof item === 'string') return [item]

  // 1. 优先使用 schema 定义的 sub_inputs
  if (field && field.sub_inputs && Array.isArray(field.sub_inputs)) {
      const lines = []
      field.sub_inputs.forEach(sub => {
          if (!shouldShowSubField(sub, item)) return
          const val = item[sub.name]
          if (val !== undefined && val !== null && String(val).trim() !== '') {
              let label = sub.name
              const shortMap = { 'id': 'ID', 'text': 'Text', 'xpath': 'XPath', 'css': 'CSS', 'className': 'Class', 'description': 'Desc', 'desc': 'Desc', 'resourceId': 'ID', 'platform': 'Plat' }
              if (shortMap[sub.name]) label = shortMap[sub.name]
              else if (sub.label) label = sub.label
              lines.push(`${label}: ${val}`)
          }
      })
      return lines.length > 0 ? lines : ['{ ... }']
  }

  if (typeof item === 'object' && item !== null) {
    const keysToCheck = [
      { key: 'resourceId', label: 'ID' },
      { key: 'text', label: 'Text' },
      { key: 'xpath', label: 'XPath' }, // 兼容旧版
      { key: 'XPATH', label: 'XPath' }, // 适配新版大写
      { key: 'className', label: 'Class' }, // 兼容旧版
      { key: 'classname', label: 'Class' }, // 适配新版小写
      { key: 'description', label: 'Desc' },
      { key: 'name', label: 'Name' },
      { key: 'label', label: 'Label' },
      { key: 'value', label: 'Val' }
    ]

    const lines = []
    keysToCheck.forEach(({ key, label }) => {
      if (item[key] && String(item[key]).trim() !== '') {
        lines.push(`${label}: ${item[key]}`)
      }
    })

    if (lines.length > 0) {
      return lines // 返回数组
    }
    return ['{ 空对象 }']
  }
  return [String(item)]
}

const formatValue = (val) => {
  if (isEmptyListOrNull(val)) return '- 空' // 这里作为兜底，实际上模板里已经处理了
  if (typeof val === 'boolean') return val ? '✅' : '❌'
  if (Array.isArray(val)) return `[列表] ${val.length}项`
  if (typeof val === 'object') return '{对象}'

  if (typeof val === 'string' && (val.startsWith('[') || val.startsWith('{'))) {
    try {
        const parsed = JSON.parse(val)
        if (Array.isArray(parsed)) {
            if (parsed.length === 0) return '- 空'
            return `[列表] ${parsed.length}项`
        }
        if (typeof parsed === 'object') return '{对象}'
    } catch(e) {}
  }
  return val
}

const formatTooltip = (val) => {
  if (typeof val === 'object') return JSON.stringify(val, null, 2)
  return val
}
</script>

<style scoped>
.custom-node {
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  min-width: 240px;
  width: fit-content;
  max-width: 360px; /* 略微增加最大宽度 */
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
  position: relative;
  padding: 0;
  transition: box-shadow 0.2s, border-color 0.2s;
  overflow: visible;
}

.custom-node.selected {
  border-color: #6366f1;
  box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.2);
}

.custom-node.pick-disabled {
  opacity: 0.5;
  filter: grayscale(1);
}

.node-header {
  padding: 8px 12px;
  border-bottom: 1px solid;
  border-top-left-radius: 7px;
  border-top-right-radius: 7px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  color: #334155;
  font-size: 13px;
  white-space: nowrap;
}

.node-icon { width: 18px; height: 18px; flex-shrink: 0; }

.node-body {
  padding: 8px 12px;
  font-size: 12px;
  background: #fff;
  border-bottom-left-radius: 7px;
  border-bottom-right-radius: 7px;
  min-height: 24px;
}

.empty-state { color: #cbd5e1; font-size: 11px; text-align: center; padding: 4px 0; font-style: italic; }

.section-title {
  font-size: 10px;
  color: #94a3b8;
  margin-bottom: 6px;
  font-weight: 600;
  text-transform: uppercase;
}

.field-block { margin-bottom: 8px; }
.field-label-row { margin-bottom: 4px; }
.field-label { color: #64748b; font-weight: 500; }

/* 列表样式优化 */
.list-preview-box {
  background: #f8fafc;
  border: 1px solid #f1f5f9;
  border-radius: 6px;
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.list-item-preview {
  display: flex;
  align-items: flex-start; /* 🔥 顶部对齐，防止多行时序号跑偏 */
  gap: 8px;
  background: white;
  padding: 4px 6px;
  border-radius: 4px;
  border: 1px solid #e2e8f0;
  font-size: 11px;
}

.list-idx {
  background: #eff6ff;
  color: #6366f1;
  font-size: 9px;
  padding: 1px 5px;
  border-radius: 3px;
  font-weight: 700;
  min-width: 14px;
  text-align: center;
  border: 1px solid #dbeafe;
  margin-top: 2px; /* 微调序号位置 */
}

.list-content-col {
  display: flex;
  flex-direction: column;
  gap: 2px; /* 行间距 */
  flex: 1;
  min-width: 0;
}

.list-line {
  color: #334155;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-family: monospace;
  line-height: 1.4;
}

.list-more { font-size: 10px; color: #94a3b8; text-align: center; padding-top: 2px; }

/* 空值样式 */
.empty-text {
  color: #cbd5e1;
  font-size: 12px;
  font-style: italic;
  padding-left: 4px;
}

.val-tag {
  background: #e0e7ff;
  color: #4f46e5;
  padding: 2px 6px;
  border-radius: 4px;
  font-family: monospace;
  font-size: 11px;
  display: inline-block;
}
.full-width { width: 100%; box-sizing: border-box; }

.val-text-wrapper {
  background: #f8fafc;
  border: 1px solid #f1f5f9;
  border-radius: 4px;
  padding: 4px 6px;
}

.val-text {
  color: #1e293b;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: block;
}

.var-name { color: #059669; font-weight: 500; font-family: monospace; }
.var-type { background: #f1f5f9; color: #64748b; padding: 1px 4px; border-radius: 3px; font-size: 10px; transform: scale(0.9); }
.divider { height: 1px; background: #f1f5f9; margin: 8px -12px; }
.field-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; gap: 12px; }

.handle-base {
  width: 10px; height: 10px; border: 2px solid white;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  z-index: 10; transition: transform 0.2s; position: absolute;
}
.handle-base::after { content: ''; position: absolute; top: 50%; left: 50%; width: 30px; height: 30px; transform: translate(-50%, -50%); border-radius: 50%; background: transparent; cursor: crosshair; }
.handle-base:hover { transform: scale(1.3); box-shadow: 0 0 0 2px rgba(0,0,0,0.05); }

.handle-left { left: -6px !important; top: 50% !important; transform: translateY(-50%) !important; }
.handle-right { right: -6px !important; top: 50% !important; transform: translateY(-50%) !important; }
.handle-bottom { bottom: -6px !important; left: 50% !important; top: auto !important; transform: translateX(-50%) !important; }
</style>