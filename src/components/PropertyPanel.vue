<template>
  <!-- 点击遮罩层(透明)用于关闭下拉框 -->
  <div v-if="activeSelectField" class="click-outside-overlay" @click="closeSelect"></div>

  <div class="property-panel" :class="{ show: show }">
    <!-- 1. 头部 -->
    <div class="panel-header">
      <div class="header-left">
        <div class="icon-box">
          <component :is="getIcon(nodeIcon)" class="panel-icon"/>
        </div>
        <span class="panel-title">{{ nodeTitle }}</span>
      </div>
      <button class="close-btn" @click="$emit('close')">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </div>

    <div class="panel-body" v-if="node">
      <!-- 2. 节点基础信息 -->
      <div class="header-info">ID: <span class="mono-font">{{ node.id }}</span></div>

      <div class="divider"></div>
      <div class="form-section">
        <div class="form-group">
          <label class="field-label">节点名称</label>
          <input v-model="node.label" class="panel-input" placeholder="输入节点名称..."/>
        </div>

        <div v-if="nodeDesc" class="description-box">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
               class="info-icon">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="16" x2="12" y2="12"></line>
            <line x1="12" y1="8" x2="12.01" y2="8"></line>
          </svg>
          <span>{{ nodeDesc }}</span>
        </div>
      </div>

      <div class="divider"></div>

      <!-- 3. IF 节点特殊配置 (Grid 布局优化版) -->
      <div v-if="isIfNode" class="condition-config">
        <div class="section-title">
          <span>逻辑分支配置</span>
          <span class="badge">{{ (node.data.conditions || []).length }}</span>
        </div>

        <div class="conditions-list">
          <div v-for="(cond, idx) in (node.data.conditions || [])" :key="idx" class="condition-card">
            <div class="cond-header">
              <span class="cond-tag">IF {{ idx + 1 }}</span>
              <button v-if="idx > 0" @click="removeCondition(idx)" class="remove-icon-btn" title="删除分支">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>

            <!-- Grid 布局：左值 | 操作符 | 右值 -->
            <div class="cond-grid">
              <!-- 左值 -->
              <div class="input-wrapper full-width">
                <input
                    :value="getVarDisplayName(cond.left)"
                    placeholder="选择变量"
                    readonly
                    @click="$emit('pick-var', `condition:${idx}:left`)"
                    class="panel-input var-input"
                    :class="{ 'has-val': cond.left }"
                />
                <button class="pick-btn" @click.stop="$emit('pick-var', `condition:${idx}:left`)">🎯</button>
              </div>

              <!-- 操作符 -->
              <div class="select-wrapper op-wrapper">
                <select v-model="cond.op" class="panel-select text-center">
                  <option value="=">=</option>
                  <option value="!=">!=</option>
                  <option value=">">&gt;</option>
                  <option value="<">&lt;</option>
                  <option value="contains">包含</option>
                </select>
              </div>

              <!-- 右值 (智能切换) -->
              <div class="input-wrapper full-width right-val-wrapper">
                <!-- Boolean Select -->
                <div v-if="getRightType(cond.left) === 'boolean'" class="select-wrapper">
                  <select v-model="cond.right" class="panel-select">
                    <option value="true">True</option>
                    <option value="false">False</option>
                  </select>
                </div>

                <!-- Number Input -->
                <input
                    v-else-if="['int', 'float', 'number'].includes(getRightType(cond.left))"
                    type="number"
                    v-model="cond.right"
                    placeholder="数值"
                    class="panel-input"
                />

                <!-- Text/Var Input -->
                <template v-else>
                  <input
                      v-model="cond.right"
                      placeholder="值"
                      class="panel-input"
                  />
                  <button class="pick-btn" @click="$emit('pick-var', `condition:${idx}:right`)">🎯</button>
                </template>
              </div>
            </div>
          </div>
        </div>

        <button class="action-btn add-btn" @click="addCondition">
          <span class="plus-icon">+</span> 添加条件分支
        </button>

        <div class="else-card">
          <div class="else-tag">ELSE</div>
          <span class="else-text">上述条件均不满足时执行</span>
        </div>
      </div>

      <!-- 4. 普通节点参数配置 (自定义 Select 版) -->
      <div v-else class="params-config">
        <template v-for="field in nodeInputs" :key="field.name">
          <div v-if="shouldShowTopLevelField(field)" class="form-group">
            <label class="field-label">
              {{ field.label || field.name }}
              <span class="field-tip" v-if="field.desc">{{ field.desc }}</span>
            </label>

            <!-- 4.1 列表类型 List -->
            <div v-if="field.type === 'list'" class="list-section">
              <div v-if="!node.data[field.name]?.length" class="empty-state">
                暂无配置数据
              </div>

              <div v-for="(item, idx) in (node.data[field.name] || [])" :key="idx" class="list-item">
                <div class="list-item-head">
                  <span class="index-badge">#{{ idx + 1 }}</span>
                  <button class="remove-icon-btn" @click="removeListItem(field.name, idx)">×</button>
                </div>

                <div class="list-item-content">
                  <div v-for="subField in (field.sub_inputs || [])" :key="subField.name" class="sub-field">
                    <template v-if="shouldShowSubField(subField, item)">
                      <span class="sub-label">{{ subField.desc || subField.name }}</span>

                      <!-- Sub-field: Select -->
                      <div v-if="subField.type === 'select'" class="custom-select-container">
                        <div
                            class="custom-select-trigger small"
                            :class="{ active: activeSelectField === `${field.name}-${idx}-${subField.name}` }"
                            @click="toggleSelect(`${field.name}-${idx}-${subField.name}`)"
                        >
                                  <span class="selected-text">
                                    {{ getSelectLabel(item[subField.name], subField.options) || '请选择' }}
                                  </span>
                          <svg class="select-arrow" width="10" height="10" viewBox="0 0 24 24" fill="none"
                               stroke="currentColor" stroke-width="2">
                            <polyline points="6 9 12 15 18 9"></polyline>
                          </svg>
                        </div>

                        <div v-if="activeSelectField === `${field.name}-${idx}-${subField.name}`"
                             class="custom-options-list">
                          <div
                              v-for="(opt, optIdx) in (subField.options || [])"
                              :key="optIdx"
                              class="custom-option"
                              :class="{ selected: isOptionSelected(opt, item[subField.name]) }"
                              @click="handleListSelect(item, subField.name, opt)"
                          >
                            {{ getOptionText(opt) }}
                            <span v-if="isOptionSelected(opt, item[subField.name])" class="check-mark">✓</span>
                          </div>
                        </div>
                      </div>

                      <!-- Sub-field: Input (str/int/text) -->
                      <div v-else class="input-wrapper">
                        <input v-if="!isVariable(item[subField.name])"
                               :type="['int', 'number'].includes(subField.type) ? 'number' : 'text'"
                               v-model="item[subField.name]"
                               :placeholder="subField.placeholder"
                               class="panel-input sub-input"/>
                        <div v-else class="var-tag">
                          <span class="var-icon">🔗</span>
                          <span class="var-text">{{ getVarDisplayName(item[subField.name]) }}</span>
                          <button @click="item[subField.name] = undefined" class="clear-var">×</button>
                        </div>
                        <button v-if="!isVariable(item[subField.name])"
                                class="pick-btn small"
                                @click="$emit('pick-var', `${field.name}[${idx}].${subField.name}`)">🎯
                        </button>
                      </div>
                    </template>
                  </div>
                </div>
              </div>

              <button class="action-btn secondary-btn" @click="addListItem(field)">
                + {{ field.add_text || '添加项' }}
              </button>
            </div>

            <!-- 4.2 常规类型 -->
            <div v-else>
              <!-- 变量锁定状态 -->
              <div v-if="isVariable(node.data[field.name])" class="var-tag big-var">
                <span class="var-icon">🔗</span>
                <span class="var-text">{{ getVarDisplayName(node.data[field.name]) }}</span>
                <button @click="node.data[field.name] = undefined" class="clear-var" title="清除变量">×</button>
              </div>

              <!-- 输入状态 -->
              <div v-else class="input-wrapper">

                <!-- 🔥 自定义 Select 组件 (修复 JSON 问题) -->
                <div v-if="field.type === 'select'" class="custom-select-container">
                  <div
                      class="custom-select-trigger"
                      :class="{ active: activeSelectField === field.name }"
                      @click="toggleSelect(field.name)"
                  >
                      <span class="selected-text">
                        {{ getSelectLabel(node.data[field.name], field.options) || '请选择' }}
                      </span>
                    <svg class="select-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none"
                         stroke="currentColor" stroke-width="2">
                      <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                  </div>

                  <div v-if="activeSelectField === field.name" class="custom-options-list">
                    <div
                        v-for="(opt, idx) in (field.options || [])"
                        :key="idx"
                        class="custom-option"
                        :class="{ selected: isOptionSelected(opt, node.data[field.name]) }"
                        @click="handleSelect(field.name, opt)"
                    >
                      {{ getOptionText(opt) }}
                      <span v-if="isOptionSelected(opt, node.data[field.name])" class="check-mark">✓</span>
                    </div>
                  </div>
                </div>

                <!-- Switch 开关 -->
                <div v-else-if="field.type === 'bool'" class="switch-row">
                  <label class="switch">
                    <input type="checkbox" v-model="node.data[field.name]">
                    <span class="slider"></span>
                  </label>
                  <span class="switch-text">
                      {{ node.data[field.name] ? (field.trueText || '已开启') : (field.falseText || '已关闭') }}
                    </span>
                </div>

                <!-- File Input -->
                <template v-else-if="field.type === 'file'">
                  <div class="input-wrapper">
                    <input type="text"
                           v-model="node.data[field.name]"
                           :placeholder="field.placeholder || '请选择文件...'"
                           class="panel-input" style="padding-right: 60px;"/>
                    <button class="pick-btn" style="right: 34px;" @click="handleFileSelect(field.name)" title="浏览本地文件">📂</button>
                    <button class="pick-btn" @click="$emit('pick-var', field.name)" title="选择变量">🎯</button>
                  </div>
                </template>

                <!-- Textarea -->
                <textarea v-else-if="field.type === 'text'"
                          v-model="node.data[field.name]"
                          :placeholder="field.placeholder"
                          class="panel-input panel-textarea" rows="3"></textarea>

                <!-- 普通 Input -->
                <input v-else
                       :type="['int', 'float', 'number'].includes(field.type) ? 'number' : 'text'"
                       v-model="node.data[field.name]"
                       :placeholder="field.placeholder || '输入值'"
                       class="panel-input"/>

                <!-- 变量 Picker -->
                <button v-if="field.type !== 'bool'" class="pick-btn" @click="$emit('pick-var', field.name)"
                        title="选择变量">🎯
                </button>
              </div>
            </div>
          </div>
        </template>
      </div>

    </div>
  </div>
</template>

<script setup>
import {computed, ref} from 'vue'
import {getIcon} from '../config/iconMap'

const props = defineProps(['show', 'node', 'schema', 'allNodes'])
const emit = defineEmits(['close', 'pick-var'])

// --- 状态管理 ---
const activeSelectField = ref(null)

// 辅助函数：在嵌套的 schema 中查找节点定义
const findSchemaDef = (nodeCode) => {
  if (!props.schema || !nodeCode) return null
  //
  // // 1. 尝试直接获取 (兼容旧版扁平结构)
  // if (props.schema[nodeCode]) return props.schema[nodeCode]

  // 2. 遍历新版嵌套结构
  for (const groupKey in props.schema) {
    const group = props.schema[groupKey]
    const details = group.details || {}
    for (const key in details) {
      const item = details[key]
      if (item.address === nodeCode) {
        return item
      }
    }
  }
  return null
}

const nodeSchema = computed(() => {
  if (!props.node) return null
  return findSchemaDef(props.node.data.nodeCode) || {}
})

const nodeIcon = computed(() => props.node?.data.iconChar || 'puzzle')
const nodeTitle = computed(() => nodeSchema.value?.name || props.node?.label || '属性配置')
const nodeDesc = computed(() => nodeSchema.value?.desc || '')
const isIfNode = computed(() => props.node?.type === 'if')
const nodeInputs = computed(() => nodeSchema.value?.inputs || [])

// --- IF 逻辑 ---
const addCondition = () => {
  if (!props.node.data.conditions) props.node.data.conditions = []
  props.node.data.conditions.push({left: '', op: '=', right: ''})
}
const removeCondition = (idx) => {
  props.node.data.conditions.splice(idx, 1)
}

// --- File Select ---
const handleFileSelect = async (fieldName) => {
  // 1. 尝试通过 IPC 调用原生文件选择框 (推荐，可获取完整路径)
  // 适配 preload.js 中暴露的 window.electronAPI
  const ipc = window.electronAPI
  
  if (ipc && ipc.invoke) {
    try {
      const path = await ipc.invoke('select-file')
      if (path) {
        props.node.data[fieldName] = path
      }
      return
    } catch (e) {
      console.error('IPC select-file 失败，回退到普通 Input:', e)
    }
  }

  // 2. 降级方案: HTML5 Input (在 contextIsolation:true 下只能拿到文件名)
  const input = document.createElement('input')
  input.type = 'file'
  input.value = ''
  input.onchange = (e) => {
    const file = e.target.files[0]
    if (file) {
      props.node.data[fieldName] = file.path || file.name
    }
  }
  input.click()
}

// --- List 逻辑 ---
const addListItem = (field) => {
  if (!props.node.data[field.name]) props.node.data[field.name] = []
  const newItem = {}
  if (field.sub_inputs) {
    field.sub_inputs.forEach(sub => {
      newItem[sub.name] = sub.defaultValue !== undefined ? sub.defaultValue : ""
    })
  }
  props.node.data[field.name].push(newItem)
}
const removeListItem = (fieldName, index) => {
  if (props.node.data[fieldName]) props.node.data[fieldName].splice(index, 1)
}

// --- 变量解析 ---
const isVariable = (val) => typeof val === 'string' && val.startsWith('{{') && val.endsWith('}}')

const getVarDisplayName = (val) => {
  if (!val) return ''
  const match = val.match(/^{{(.+?)\.(.+?)}}$/)
  if (!match) return val
  const nodeId = match[1]
  const varKey = match[2]
  const targetNode = props.allNodes.find(n => n.id === nodeId)
  return targetNode ? `${targetNode.label}.${varKey}` : `${nodeId}.${varKey}`
}

const getRightType = (leftValue) => {
  if (!leftValue || typeof leftValue !== 'string') return 'string'
  const match = leftValue.match(/^{{(.+?)\.(.+?)}}$/)
  if (!match) return 'string'
  const nodeId = match[1]
  const varKey = match[2]
  const targetNode = props.allNodes.find(n => n.id === nodeId)
  if (!targetNode) return 'string'
  const schema = findSchemaDef(targetNode.data.nodeCode)
  if (!schema || !schema.outputVars) return 'string'
  const variableDef = schema.outputVars.find(v => v.key === varKey)
  return variableDef ? variableDef.type : 'string'
}

// --- Top-level Field Logic ---
const shouldShowTopLevelField = (field) => {
  // 1. Platform field always visible
  if (field.name === 'platform') return true

  // 2. If field has show_if
  if (field.show_if) {
    const currentPlatform = props.node.data.platform
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
  // 1. 平台字段本身永远显示 (防止死循环: 没显示就没法选，没选就没法显示)
  if (subField.name === 'platform') return true

  // 2. 获取当前生效的平台 (优先取行内 item.platform，其次取全局 node.data.platform)
  const currentPlatform = item.platform || props.node.data.platform

  // 3. 如果有 show_if 配置，检查是否匹配当前平台
  if (subField.show_if) {
    if (!currentPlatform) return false
    if (Array.isArray(subField.show_if)) {
      return subField.show_if.includes(currentPlatform)
    }
    return false
  }

  // 4. 没有 show_if 的字段
  // 兼容旧逻辑：如果 item 中存在 platform 字段(行内模式)且为空，则隐藏其他字段
  if (item && typeof item === 'object' && 'platform' in item && !item.platform) {
    return false
  }

  return true
}

// --- Select 下拉框逻辑 ---
const toggleSelect = (fieldName) => {
  activeSelectField.value = activeSelectField.value === fieldName ? null : fieldName
}

const closeSelect = () => {
  activeSelectField.value = null
}

const handleSelect = (fieldName, option) => {
  // 优先存储 value
  const val = (typeof option === 'object' && option.value !== undefined) ? option.value : option
  props.node.data[fieldName] = val
  closeSelect()
}

const handleListSelect = (item, fieldName, option) => {
  const val = (typeof option === 'object' && option.value !== undefined) ? option.value : option
  item[fieldName] = val
  closeSelect()
}

const getOptionText = (opt) => {
  if (typeof opt === 'object') {
    return opt.text || opt.label || opt.value
  }
  return opt
}

const getSelectLabel = (currentVal, options) => {
  if (!currentVal) return ''
  if (typeof currentVal === 'object') return currentVal.text || currentVal.label || currentVal.value
  if (options) {
    const found = options.find(opt => {
      if (typeof opt === 'object') return opt.value === currentVal || opt === currentVal
      return opt === currentVal
    })
    if (found) return getOptionText(found)
  }
  return currentVal
}

const isOptionSelected = (option, currentVal) => {
  if (!currentVal) return false
  if (typeof option === 'object' && typeof currentVal === 'object') {
    return option.value === currentVal.value
  }
  return option === currentVal
}
</script>

<style scoped>
/* 全局遮罩 */
.click-outside-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  z-index: 99;
  cursor: default;
}

/* 容器 */
.property-panel {
  position: absolute;
  top: 0;
  right: -380px;
  width: 360px;
  height: 100%;
  background: white;
  border-left: 1px solid #e2e8f0;
  box-shadow: -8px 0 24px rgba(0, 0, 0, 0.08);
  transition: right 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
  display: flex;
  flex-direction: column;
  z-index: 100;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}

.property-panel.show {
  right: 0;
}

* {
  box-sizing: border-box;
}

/* 滚动条 */
.panel-body {
  padding: 20px;
  overflow-y: auto;
  flex: 1;
}

.panel-body::-webkit-scrollbar {
  width: 4px;
}

.panel-body::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 2px;
}

/* 头部 */
.panel-header {
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  border-bottom: 1px solid #f1f5f9;
  background: #fff;
  flex-shrink: 0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.icon-box {
  width: 32px;
  height: 32px;
  background: #f1f5f9;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #6366f1;
}

.panel-icon {
  width: 18px;
  height: 18px;
}

.panel-title {
  font-weight: 700;
  color: #1e293b;
  font-size: 15px;
}

.close-btn {
  border: none;
  background: transparent;
  color: #94a3b8;
  cursor: pointer;
  padding: 6px;
  border-radius: 4px;
}

.close-btn:hover {
  color: #ef4444;
  background: #fef2f2;
}

/* 基础样式 */
.form-group {
  margin-bottom: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.field-label {
  font-size: 13px;
  font-weight: 600;
  color: #334155;
}

.field-tip {
  font-weight: normal;
  color: #94a3b8;
  font-size: 12px;
  margin-left: 6px;
}

/* Radio Group */
.radio-group {
  display: flex;
  gap: 16px;
  margin-top: 4px;
}

.radio-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #334155;
  cursor: pointer;
}

.radio-label input {
  cursor: pointer;
  accent-color: #6366f1;
  margin: 0;
}

/* 🔥 修复3: 增加 padding-right 防止文字被图标遮挡 */
.panel-input {
  width: 100%;
  padding: 10px 12px;
  padding-right: 32px; /* 给图标留出空间 */
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  font-size: 13px;
  color: #334155;
  background: #fff;
  transition: all 0.2s;
}

.panel-input:focus {
  border-color: #6366f1;
  outline: none;
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
}

.panel-input::placeholder {
  color: #cbd5e1;
}

.panel-textarea {
  resize: vertical;
  min-height: 80px;
  font-family: inherit;
}

.description-box {
  background: #eff6ff;
  border: 1px solid #dbeafe;
  border-radius: 6px;
  padding: 10px;
  font-size: 12px;
  color: #1e40af;
  display: flex;
  gap: 8px;
  margin-top: 4px;
}

.info-icon {
  flex-shrink: 0;
  margin-top: 2px;
}

.divider {
  height: 1px;
  background: #f1f5f9;
  margin: 24px -20px;
}

/* --- IF 配置区 (Grid) --- */
.section-title {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  font-weight: 600;
  font-size: 13px;
  color: #334155;
}

.badge {
  background: #e0e7ff;
  color: #4338ca;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
}

.conditions-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.condition-card {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 10px;
  transition: all 0.2s;
}

.condition-card:hover {
  border-color: #cbd5e1;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.03);
  background: #fff;
}

.cond-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
}

.cond-tag {
  font-size: 11px;
  font-weight: 700;
  color: #6366f1;
  background: #eef2ff;
  padding: 2px 6px;
  border-radius: 4px;
}

.remove-icon-btn {
  border: none;
  background: transparent;
  color: #94a3b8;
  cursor: pointer;
  padding: 2px;
}

.remove-icon-btn:hover {
  color: #ef4444;
}

.cond-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) 60px minmax(0, 1fr);
  gap: 8px;
  align-items: center;
}

.text-center {
  text-align: center;
  text-align-last: center;
  padding-left: 4px;
  padding-right: 4px;
}

.var-input {
  background: #f1f5f9;
  color: #6366f1;
  cursor: pointer;
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
  padding-right: 32px;
}

.var-input.has-val {
  font-weight: 500;
  border-color: #c7d2fe;
}

.action-btn {
  width: 100%;
  border: 1px dashed #cbd5e1;
  background: white;
  padding: 10px;
  border-radius: 8px;
  color: #64748b;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  margin-top: 12px;
  transition: all 0.2s;
}

.action-btn:hover {
  border-color: #6366f1;
  color: #6366f1;
  background: #f8fafc;
}

.else-card {
  margin-top: 16px;
  padding: 10px;
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 10px;
}

.else-tag {
  font-size: 11px;
  font-weight: 800;
  color: #b45309;
  background: #fcd34d;
  padding: 2px 6px;
  border-radius: 4px;
}

.else-text {
  font-size: 12px;
  color: #92400e;
}

/* --- 自定义 Select --- */
.custom-select-container {
  position: relative;
  width: 100%;
}

.custom-select-trigger {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #fff;
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  color: #334155;
  transition: all 0.2s;
}

.custom-select-trigger:hover {
  border-color: #cbd5e1;
  background: #f8fafc;
}

.custom-select-trigger.active {
  border-color: #6366f1;
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
}

.custom-select-trigger.small {
  padding: 6px 10px;
  font-size: 12px;
  height: 32px;
}

.select-arrow {
  color: #94a3b8;
  transition: transform 0.2s;
}

.custom-select-trigger.active .select-arrow {
  transform: rotate(180deg);
}

.custom-options-list {
  position: absolute;
  top: 100%;
  left: 0;
  width: 100%;
  margin-top: 6px;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
  z-index: 200;
  max-height: 240px;
  overflow-y: auto;
}

.custom-option {
  padding: 10px 12px;
  font-size: 13px;
  color: #334155;
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.custom-option:hover {
  background: #f1f5f9;
  color: #6366f1;
}

.custom-option.selected {
  background: #eef2ff;
  color: #4f46e5;
  font-weight: 500;
}

.check-mark {
  font-size: 12px;
  font-weight: bold;
}

/* 如果是 IF 里面的 select，保留原生样式但美化 */
.panel-select {
  width: 100%;
  appearance: none;
  padding: 9px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  font-size: 13px;
  background-color: #fff;
  cursor: pointer;
  background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e");
  background-repeat: no-repeat;
  background-position: right 8px center;
  background-size: 14px;
}

/* --- 通用工具 --- */
.input-wrapper {
  position: relative;
  width: 100%;
  display: flex;
  align-items: center;
}

.pick-btn {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  border: none;
  background: transparent;
  cursor: pointer;
  opacity: 0.5;
  font-size: 14px;
  z-index: 2;
}

.pick-btn:hover {
  opacity: 1;
}

.pick-btn.small {
  font-size: 12px;
  right: 6px;
}

.var-tag {
  display: flex;
  align-items: center;
  gap: 6px;
  background: #eef2ff;
  border: 1px solid #c7d2fe;
  padding: 8px 10px;
  border-radius: 6px;
  font-size: 13px;
  color: #4338ca;
  width: 100%;
  box-sizing: border-box;
}

.var-text {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: monospace;
}

.clear-var {
  border: none;
  background: transparent;
  color: #818cf8;
  cursor: pointer;
  font-size: 16px;
}

/* Switch */
.switch-row {
  display: flex;
  align-items: center;
  gap: 12px;
  height: 38px;
}

.switch {
  position: relative;
  width: 42px;
  height: 24px;
}

.switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: #cbd5e1;
  transition: .3s;
  border-radius: 24px;
}

.slider:before {
  position: absolute;
  content: "";
  height: 20px;
  width: 20px;
  left: 2px;
  bottom: 2px;
  background-color: white;
  transition: .3s;
  border-radius: 50%;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

input:checked + .slider {
  background-color: #6366f1;
}

input:checked + .slider:before {
  transform: translateX(18px);
}

.switch-text {
  font-size: 13px;
  color: #64748b;
}

/* List */
.list-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.empty-state {
  padding: 16px;
  text-align: center;
  color: #94a3b8;
  font-size: 12px;
  background: #f8fafc;
  border-radius: 6px;
  border: 1px dashed #e2e8f0;
}

.list-item {
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  overflow: hidden;
  background: #fff;
}

.list-item-head {
  background: #f8fafc;
  padding: 6px 10px;
  display: flex;
  justify-content: space-between;
  border-bottom: 1px solid #f1f5f9;
}

.index-badge {
  font-size: 11px;
  font-weight: 700;
  color: #64748b;
}

.list-item-content {
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.sub-label {
  font-size: 11px;
  color: #64748b;
  margin-bottom: 4px;
  display: block;
}

.secondary-btn {
  margin-top: 0;
  font-size: 12px;
  padding: 8px;
}

.header-info {
  font-size: 11px;
  color: #cbd5e1;
  text-align: center;
  margin-top: auto;
}

.mono-font {
  font-family: monospace;
}
</style>