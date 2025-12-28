<template>
  <div class="page-node" :class="[data.type, { selected }]">
    <Handle type="target" :position="Position.Left" class="io-handle handle-left" />

    <div class="node-shell">
      <div class="node-content">
        <div class="node-header">
          <ElIcon class="node-icon" :size="14">
            <component :is="iconMap[data.type] || Document" />
          </ElIcon>
          <span class="node-title">{{ label }}</span>
        </div>

        <div class="node-desc" v-if="data.desc">{{ data.desc }}</div>

        <div class="visual-wrapper" v-if="displayScreenshot">
          <img
            :src="displayScreenshot"
            class="node-screenshot"
            draggable="false"
            @load="onImageLoaded"
          />

          <div class="hotspots-overlay">
            <div v-for="(comp, i) in data.interactions" :key="i"
                 class="mini-hotspot" :style="getHotspotStyle(comp)">
              <Handle type="source" :id="`hotspot-${i}`" :position="Position.Right" class="hotspot-handle" />
            </div>
          </div>
        </div>
      </div>
    </div>

    <Handle type="source" :position="Position.Right" class="io-handle handle-right" />
  </div>
</template>

<script setup>
import { computed, ref, watch, nextTick } from 'vue'
import { Handle, Position, useVueFlow } from '@vue-flow/core'
import { Document, Cpu, Aim } from '@element-plus/icons-vue'
import { ElIcon } from 'element-plus'
import { wsGetFile } from '@/api/mWebSocket'

const props = defineProps({
  id: String,
  label: String,
  data: { type: Object, default: () => ({ type: 'page', desc: '', interactions: [] }) },
  selected: Boolean
})

const { updateNodeInternals } = useVueFlow()
const displayScreenshot = ref('')

const onImageLoaded = () => {
  nextTick(() => {
    updateNodeInternals([props.id])
  })
}

const loadScreenshot = async () => {
  const src = props.data.screenshot
  if (!src) {
    displayScreenshot.value = ''
    nextTick(() => updateNodeInternals([props.id]))
    return
  }
  if (src.startsWith('data:image') || src.startsWith('http')) {
    displayScreenshot.value = src
  } else {
    try {
      const res = await wsGetFile(src)
      if (res.code === 200) displayScreenshot.value = res.data
    } catch (e) { console.error('Failed to load screenshot', e) }
  }
}

watch(() => props.data.screenshot, loadScreenshot, { immediate: true })

// 关键逻辑：确保 naturalSize 存在，否则百分比会计算错误导致偏移
const naturalSize = computed(() => props.data.naturalSize || { w: 375, h: 667 })

const getHotspotStyle = (comp) => {
  // 这里的 x, y 必须是相对于截图左上角的原始像素坐标
  return {
    left: `${(comp.x / naturalSize.value.w) * 100}%`,
    top: `${(comp.y / naturalSize.value.h) * 100}%`,
    width: `${(comp.w / naturalSize.value.w) * 100}%`,
    height: `${(comp.h / naturalSize.value.h) * 100}%`,
  }
}

const iconMap = { page: Document, component: Cpu, case: Aim }
</script>

<style scoped>
.page-node { width: 220px; position: relative; background: transparent; overflow: visible; }

.node-shell {
  background: rgba(255, 255, 255, 0.45) !important;
  backdrop-filter: blur(16px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.6);
  border-radius: 14px; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.08);
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1); overflow: hidden;
}

.page-node:hover .node-shell {
  transform: translateY(-5px);
  box-shadow: 0 12px 40px rgba(255, 77, 0, 0.15);
}

.page-node.selected .node-shell { border: 2px solid #ff4d00; }

.io-handle {
  width: 12px; height: 12px; background: #fff !important;
  border: 2px solid #94a3b8 !important; z-index: 100;
  transition: none !important;
}
.handle-left { left: -6px; }
.handle-right { right: -6px; }

.node-header { display: flex; align-items: center; gap: 8px; padding: 10px 14px; background: rgba(245, 247, 250, 0.3); }
.node-title { font-size: 14px; font-weight: 700; color: #1f2937; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* 截图容器修复 */
.visual-wrapper {
  position: relative; /* 必须是 relative，作为热区的参考系 */
  background: #f1f5f9;
  line-height: 0;
  width: 100%;
}

.node-screenshot {
  width: 100%;
  height: auto;
  display: block;
  opacity: 0.95;
}

/* 核心修复：热区遮罩层 */
.hotspots-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none; /* 让点击穿透到图片，除非点击到具体热区 */
}

.mini-hotspot {
  position: absolute;
  background: rgba(255, 77, 0, 0.15);
  border: 1px solid rgba(255, 77, 0, 0.4);
  pointer-events: auto; /* 恢复热区的交互 */
}

.hotspot-handle {
  right: -4px;
  top: 50%;
  transform: translateY(-50%);
  width: 8px;
  height: 8px;
  background: #ff4d00 !important;
  border: 1px solid #fff !important;
}
</style>