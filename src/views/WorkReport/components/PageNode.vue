<template>
  <div class="page-node" :class="[data.type, { selected }]">
    <!-- 左侧输入连接点 -->
    <Handle type="target" position="left" class="io-handle handle-left" />
    
    <div class="node-content">
      <div class="node-header">
        <ElIcon class="node-icon" :size="14">
          <component :is="iconMap[data.type] || Document" />
        </ElIcon>
        <span class="node-title">{{ label }}</span>
      </div>
      <div class="node-desc" v-if="data.desc">{{ data.desc }}</div>
      
      <!-- 热区层 -->
      <div class="visual-wrapper" v-if="naturalSize.w && (data.interactions?.length || data.screenshot)">
        <!-- 图片层：让图片撑开高度，保证不被裁剪 -->
        <img v-if="data.screenshot" :src="data.screenshot" class="node-screenshot" draggable="false" />
        
        <!-- 热区覆盖层：绝对定位，与图片完全重合 -->
        <div class="hotspots-overlay">
          <div v-for="(comp, i) in data.interactions" :key="i"
               class="mini-hotspot" :title="comp.label"
               :style="getHotspotStyle(comp)"
          >
            <!-- 热区连接点 -->
            <Handle
                type="source"
                :id="`hotspot-${i}`"
                :position="Position.Right"
                class="hotspot-handle"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- 右侧输出连接点 -->
    <Handle type="source" position="right" class="io-handle handle-right" />
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import { Document, Cpu, Aim } from '@element-plus/icons-vue'
import { ElIcon } from 'element-plus'

const props = defineProps({
  id: String,
  label: String,
  data: {
    type: Object,
    default: () => ({ type: 'page', desc: '' })
  },
  selected: Boolean
})

const naturalSize = computed(() => props.data.naturalSize || { w: 375, h: 667 })

const getHotspotStyle = (comp) => {
  return {
    left: `${(comp.x / naturalSize.value.w) * 100}%`,
    top: `${(comp.y / naturalSize.value.h) * 100}%`,
    width: `${(comp.w / naturalSize.value.w) * 100}%`,
    height: `${(comp.h / naturalSize.value.h) * 100}%`,
  }
}

const iconMap = {
  page: Document,
  component: Cpu,
  case: Aim
}
</script>

<style scoped>
.page-node {
  position: relative;
  background: white;
  border: 1px solid #dcdfe6; /* Element UI Border Color */
  border-radius: 6px;
  width: 200px; /* 设定基准宽度 */
  padding: 0;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
  transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
  overflow: visible; /* 允许 Handle 超出 */
  transform-origin: center center;
}

/* 3. 鼠标悬停放大，且层级最高 */
.page-node:hover {
  transform: scale(1.5);
  z-index: 1000;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
  border-color: #409EFF;
}

.page-node.selected {
  border-color: #409EFF;
  box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.3);
}

/* 类型特定样式 */
.page-node.page .node-header { border-left: 3px solid #409EFF; }
.page-node.component .node-header { border-left: 3px solid #E6A23C; }
.page-node.case .node-header { border-left: 3px solid #67C23A; }

.node-content {
  display: flex;
  flex-direction: column;
}

.node-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: #f5f7fa;
  border-bottom: 1px solid #ebeef5;
  border-top-left-radius: 5px;
  border-top-right-radius: 5px;
}

.node-title {
  font-size: 13px;
  font-weight: 600;
  color: #303133;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.node-desc {
  padding: 4px 12px;
  font-size: 12px;
  color: #909399;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 4. 优化连接线优先级：让 Handle 更明显 */
.io-handle {
  width: 10px;
  height: 10px;
  background: #fff;
  border: 2px solid #909399;
  transition: all 0.2s;
  z-index: 10; /* 确保在节点上方 */
}
.io-handle:hover {
  background: #409EFF;
  border-color: #409EFF;
  transform: scale(1.2);
}

.visual-wrapper {
  position: relative;
  width: 100%;
  /* 1. 移除固定高度，让内容自适应 */
  background: #eef0f6;
  min-height: 40px;
}

.node-screenshot {
  display: block;
  width: 100%;
  height: auto; /* 2. 保持比例，不压扁 */
  pointer-events: none;
}

.hotspots-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none; /* 让鼠标事件穿透到 Handle */
}

.mini-hotspot {
  position: absolute;
  background: rgba(64, 158, 255, 0.2);
  border: 1px solid rgba(64, 158, 255, 0.6);
  pointer-events: auto; /* 恢复热区的交互 */
  transition: background 0.2s;
}
.mini-hotspot:hover {
  background: rgba(64, 158, 255, 0.4);
  z-index: 5;
}

.hotspot-handle {
  width: 8px;
  height: 8px;
  background: #E6A23C; /* 橙色区分热区连接点 */
  border: 1px solid #fff;
  right: -4px; /* 稍微突出一点 */
  z-index: 20; /* 确保连接点最优先显示 */
}
</style>