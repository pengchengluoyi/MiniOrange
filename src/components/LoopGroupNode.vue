<template>
  <div class="loop-group-container">
    <Handle
      id="top"
      type="target"
      position="top"
      style="top: 0; left: 50%; transform: translate(-50%, -50%); width: 10px; height: 5px; opacity: 0; background: red;"
    />
    <Handle id="left" type="source" position="left" class="group-handle-side" />

    <div class="coze-header">
      <component :is="iconComponent" :size="14" />
      <span class="label">FOR循环</span>
    </div>

    <div class="group-content"></div>
  </div>
</template>

<script setup>
import { Handle } from '@vue-flow/core'
import { getIcon } from '../config/iconMap'

const iconComponent = getIcon('loop')
</script>

<style scoped>
.loop-group-container {
  width: 100%; height: 100%; min-width: 400px; min-height: 200px;
  background: rgba(238, 242, 255, 0.4);
  border: 2px dashed #818cf8;
  border-radius: 16px;
  position: relative;

  /* 🔥🔥 核心修复：禁止 transform 动画 */
  transition: width 0.2s, height 0.2s, border-color 0.2s;

  display: flex;
  flex-direction: column;
}

.coze-header {
  position: absolute;
  top: -16px;
  left: 16px;
  display: flex;
  align-items: center;
  gap: 6px;
  background: #4f46e5;
  padding: 4px 12px;
  border-radius: 20px;
  color: white;
  font-size: 12px;
  font-weight: 600;
  box-shadow: 0 4px 10px rgba(79, 70, 229, 0.3);
  z-index: 5;
}

.group-handle-side {
  width: 12px; height: 12px;
  background: #4f46e5; border: 2px solid white;
  box-shadow: 0 0 0 2px #c7d2fe;
  left: -6px;
}
</style>