<template>
  <div class="result-node" :class="data.status">
    <Handle type="target" position="left" class="handle" />
    <div class="node-content">
      <div class="status-icon">{{ getIcon(data.status) }}</div>
      <div class="info">
        <div class="label">{{ data.label || label }}</div>
        <div class="desc" v-if="data.desc">{{ data.desc }}</div>
      </div>
    </div>
    <Handle type="source" position="right" class="handle" />
  </div>
</template>

<script setup>
import { Handle } from '@vue-flow/core'

defineProps({
  label: String,
  data: {
    type: Object,
    default: () => ({ status: 'default' })
  }
})

const getIcon = (status) => {
  const map = {
    pass: '✔',
    fail: '✖',
    default: '●'
  }
  return map[status] || map.default
}
</script>

<style scoped>
.result-node {
  padding: 0;
  border-radius: 6px;
  background: white;
  border: 1px solid #dcdfe6;
  min-width: 180px;
  max-width: 240px;
  transition: all 0.2s;
  box-shadow: 0 2px 8px rgba(0,0,0,0.08);
  overflow: hidden;
}

.result-node.pass {
  border-color: #67c23a;
  box-shadow: 0 0 0 1px rgba(103, 194, 58, 0.2);
}

.result-node.fail {
  border-color: #f56c6c;
  box-shadow: 0 0 0 1px rgba(245, 108, 108, 0.2);
}

.node-content {
  display: flex;
  align-items: center;
  padding: 10px;
  gap: 10px;
}

.status-icon {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  background: #f4f4f5;
  color: #909399;
  flex-shrink: 0;
}

.pass .status-icon { background: #f0f9eb; color: #67c23a; }
.fail .status-icon { background: #fef0f0; color: #f56c6c; }

.info { display: flex; flex-direction: column; overflow: hidden; }
.label { font-size: 13px; font-weight: 600; color: #303133; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.desc { font-size: 12px; color: #909399; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.handle { width: 8px; height: 8px; background: #b1b3b8; }
</style>