<template>
  <div class="app-page-node" :class="{ selected: selected }">
    <div class="node-header">
      <span class="status-dot"></span>
      <span class="title">{{ data.label || '未命名页面' }}</span>
      <button class="edit-btn" @click.stop="$emit('open-manager', id)">✏️</button>
    </div>

    <div class="image-container">
      <div v-if="data.screenshot" class="img-wrapper-centered" :style="imageWrapperStyle">
        <img :src="data.screenshot" class="page-screenshot" draggable="false" @load="onImgLoad" />

        <div class="hotspots-layer" v-if="naturalSize.w">
           <div v-for="(comp, i) in data.interactions" :key="i"
                class="mini-hotspot"
                :style="getHotspotStyle(comp)"
           >
             <!-- 🔥 新增：热区连接点，用于拖拽连接到其他页面 -->
             <Handle
                 type="source"
                 :id="`hotspot-${i}`"
                 :position="Position.Right"
                 class="hotspot-handle"
             />
           </div>
        </div>
      </div>

      <div v-else class="image-placeholder">
        <span class="icon">🖼️</span>
        <span>无截图</span>
      </div>

      <Handle type="target" :position="Position.Left" class="io-handle"/>
      <Handle type="source" :position="Position.Right" class="io-handle"/>
    </div>

    <div class="node-footer" v-if="data.interactions && data.interactions.length">
       <span>{{ data.interactions.length }} 个组件</span>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { Handle, Position } from '@vue-flow/core'

const props = defineProps({id: String, data: Object, selected: Boolean})
defineEmits(['open-manager'])

const naturalSize = ref({ w: 0, h: 0 })

const onImgLoad = (e) => {
  naturalSize.value = { w: e.target.naturalWidth, h: e.target.naturalHeight }
}

// 🔥 核心修复：计算图片容器的精确尺寸，使其在保持比例的情况下适应容器
// 这样热区才能准确对应到图片上
const imageWrapperStyle = computed(() => {
  if (!naturalSize.value.w) return { width: '100%', height: '100%', opacity: 0 }

  const containerW = 220 // 节点宽度
  const containerH = 120 // 图片区域高度
  const { w, h } = naturalSize.value

  // 计算 contain 的缩放比例
  const scale = Math.min(containerW / w, containerH / h)
  const finalW = w * scale
  const finalH = h * scale

  return {
    width: `${finalW}px`,
    height: `${finalH}px`,
    position: 'relative'
  }
})

const getHotspotStyle = (comp) => {
    if (!naturalSize.value.w) return { display: 'none' }
    return {
        left: (comp.x / naturalSize.value.w) * 100 + '%',
        top: (comp.y / naturalSize.value.h) * 100 + '%',
        width: (comp.w / naturalSize.value.w) * 100 + '%',
        height: (comp.h / naturalSize.value.h) * 100 + '%'
    }
}
</script>

<style scoped>
.app-page-node {
  width: 220px;
  background: white;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  overflow: hidden;
  transition: all 0.2s;
  transform-origin: center center;
}
/* 🔥 悬停放大，方便选中微小的热区连接点 */
.app-page-node:hover {
  transform: scale(1.5);
  z-index: 1000;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
}
.app-page-node.selected { border-color: #6366f1; box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.2); }
.node-header { padding: 8px 12px; border-bottom: 1px solid #f1f5f9; display: flex; align-items: center; justify-content: space-between; background: #fff; }
.status-dot { width: 6px; height: 6px; background: #10b981; border-radius: 50%; margin-right: 8px; }
.title { font-size: 12px; font-weight: 600; color: #334155; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.edit-btn { border: none; background: transparent; cursor: pointer; font-size: 12px; opacity: 0.5; }
.edit-btn:hover { opacity: 1; color: #6366f1; }

.image-container {
  width: 100%;
  height: 120px;
  background: #f8fafc;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  cursor: pointer;
}
.img-wrapper-centered { position: relative; /* 尺寸由 JS 动态计算 */ }

.page-screenshot {
  width: 100%;
  height: 100%;
  /* object-fit: contain;  不再需要，因为容器已经 resize 过了 */
  display: block;
}

/* 🔥 热区预览层 */
.hotspots-layer {
    position: absolute;
    inset: 0;
    pointer-events: none; /* 不挡点击 */
}
.mini-hotspot {
    position: absolute;
    background: rgba(99, 102, 241, 0.3); /* 调整为更清晰的蓝色半透明 */
    border: 1px solid rgba(99, 102, 241, 0.9);
    pointer-events: auto; /* 允许交互，以便拖拽 Handle */
}

/* 连接点样式：默认隐藏，hover时显示 */
.hotspot-handle {
    width: 8px;
    height: 8px;
    background: #6366f1;
    border: 1px solid #fff;
    right: 0px; /* 放在框内防止被 overflow:hidden 裁剪 */
    opacity: 0;
    transition: opacity 0.2s;
}
.mini-hotspot:hover .hotspot-handle { opacity: 1; }

.image-placeholder { display: flex; flex-direction: column; align-items: center; color: #cbd5e1; font-size: 12px; }
.image-placeholder .icon { font-size: 20px; margin-bottom: 4px; }
.io-handle { width: 8px; height: 8px; background: #94a3b8; }
.node-footer { padding: 4px 12px; background: #f8fafc; font-size: 10px; color: #64748b; border-top: 1px solid #f1f5f9; text-align: right; }
</style>