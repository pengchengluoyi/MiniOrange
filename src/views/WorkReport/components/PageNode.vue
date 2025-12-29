<template>
  <div class="page-node" :class="[data.type, { selected }]">
    <Handle type="target" :position="Position.Left" class="io-handle handle-left"/>

    <div class="node-shell">
      <div class="node-content">
        <div class="node-header">
          <ElIcon class="node-icon" :size="14">
            <component :is="iconMap[data.type] || Document"/>
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
              <Handle type="source" :id="`hotspot-${i}`" :position="Position.Right" class="hotspot-handle"/>
            </div>
          </div>
        </div>
      </div>
    </div>

    <Handle type="source" :position="Position.Right" class="io-handle handle-right"/>
  </div>
</template>

<script setup>
import {computed, ref, watch, nextTick, onUnmounted} from 'vue'
import {Handle, Position, useVueFlow} from '@vue-flow/core'
import {Document, Cpu, Aim} from '@element-plus/icons-vue'
import {ElIcon} from 'element-plus'
import {wsGetFile} from '@/api/mWebSocket'

const props = defineProps({
  id: String,
  label: String,
  data: {type: Object, default: () => ({type: 'page', desc: '', interactions: []})},
  selected: Boolean
})

const emit = defineEmits(['update-size'])

const {updateNodeInternals} = useVueFlow()
const displayScreenshot = ref('')

const onImageLoaded = (event) => {
  const img = event.target;
  const realW = img.naturalWidth;
  const realH = img.naturalHeight;

  // 核心逻辑：如果库里没存尺寸，或者存的是默认的 375，立即纠正
  if (!props.data.naturalSize || props.data.naturalSize.w !== realW) {
    console.log(`[Node ${props.id}] 检测到真实尺寸: ${realW}x${realH}，正在上报...`)
    emit('update-size', { w: realW, h: realH });
  }

  nextTick(() => updateNodeInternals([props.id]));
}

// 辅助函数：将 DataURL 转换为 BlobURL
// 1. 提升性能：避免渲染进程反复解析巨大的 Base64 字符串
// 2. 规避错误：减少 Opaque Origin Check 失败的概率
const dataURLtoBlobURL = (dataurl) => {
  try {
    const arr = dataurl.split(',')
    const mime = arr[0].match(/:(.*?);/)[1]
    const bstr = atob(arr[1])
    let n = bstr.length
    const u8arr = new Uint8Array(n)
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n)
    }
    const blob = new Blob([u8arr], {type: mime})
    return URL.createObjectURL(blob)
  } catch (e) {
    console.warn('DataURL conversion failed', e)
    return dataurl // 转换失败则回退使用原字符串
  }
}

const loadScreenshot = async () => {
  // 清理旧的 BlobURL，防止内存泄漏
  if (displayScreenshot.value && displayScreenshot.value.startsWith('blob:')) {
    URL.revokeObjectURL(displayScreenshot.value)
  }

  // 🔥 1. 兼容处理：screenshot 可能是对象 { path: '...', url: '...' }
  let src = props.data.screenshot
  if (src && typeof src === 'object') {
    src = src.path || src.url || ''
  }

  if (!src) {
    displayScreenshot.value = ''
    nextTick(() => updateNodeInternals([props.id]))
    return
  }

  let finalSrc = src
  if (src.startsWith('data:image') || src.startsWith('http')) {
    if (src.startsWith('data:image')) finalSrc = dataURLtoBlobURL(src)
  } else {
    try {
      const res = await wsGetFile(src)
      if (res.code === 200 && res.data) {
        // 🔥 2. 修复：如果返回的是 raw base64 (不带 data: 前缀)，手动补全
        let dataUrl = res.data

        // 🔥 3. 增强：处理非字符串数据 (Blob, ArrayBuffer, BufferJSON)
        if (typeof dataUrl === 'object') {
          if (dataUrl instanceof Blob) {
            finalSrc = URL.createObjectURL(dataUrl)
          } else if (dataUrl instanceof ArrayBuffer) {
            finalSrc = URL.createObjectURL(new Blob([dataUrl]))
          } else if (dataUrl.type === 'Buffer' && Array.isArray(dataUrl.data)) {
            // 处理 Node.js Buffer 序列化后的 JSON
            const u8 = new Uint8Array(dataUrl.data)
            finalSrc = URL.createObjectURL(new Blob([u8]))
          } else if (dataUrl.content && typeof dataUrl.content === 'string') {
            // 🔥 新增：处理 { name, content } 结构
            let rawStr = dataUrl.content
            if (!rawStr.startsWith('data:')) {
              let mime = 'image/png'
              if (dataUrl.name) {
                const ext = dataUrl.name.split('.').pop().toLowerCase()
                if (ext === 'jpg' || ext === 'jpeg') mime = 'image/jpeg'
              }
              rawStr = `data:${mime};base64,${rawStr}`
            }
            finalSrc = dataURLtoBlobURL(rawStr)
          } else {
            console.warn('Unknown screenshot data object:', dataUrl)
            return
          }
        } else if (typeof dataUrl === 'string') {
          if (!dataUrl.startsWith('data:')) {
            const ext = src.split('.').pop().toLowerCase()
            const mime = (ext === 'jpg' || ext === 'jpeg') ? 'image/jpeg' : 'image/png'
            dataUrl = `data:${mime};base64,${dataUrl}`
          }
          // 统一转 BlobURL 以提升性能
          finalSrc = dataURLtoBlobURL(dataUrl)
        }
      }
    } catch (e) {
      console.error('Failed to load screenshot', e)
    }
  }

  displayScreenshot.value = finalSrc
}

watch(() => props.data.screenshot, loadScreenshot, {immediate: true})

onUnmounted(() => {
  if (displayScreenshot.value && displayScreenshot.value.startsWith('blob:')) {
    URL.revokeObjectURL(displayScreenshot.value)
  }
})

// 关键逻辑：确保 naturalSize 存在，否则百分比会计算错误导致偏移
const naturalSize = computed(() => {
  const size = props.data.naturalSize;
  if (size && size.w > 0) return size;
  return { w: 1920, h: 1080 }; // 默认给个大分母，防止红点跳出屏幕
})

const getHotspotStyle = (comp) => {
  // 这里的 x, y 必须是相对于截图左上角的原始像素坐标
  return {
    left: `${(comp.x / naturalSize.value.w) * 100}%`,
    top: `${(comp.y / naturalSize.value.h) * 100}%`,
    width: `${(comp.w / naturalSize.value.w) * 100}%`,
    height: `${(comp.h / naturalSize.value.h) * 100}%`,
  }
}

const iconMap = {page: Document, component: Cpu, case: Aim}
</script>

<style scoped>
.page-node {
  width: 220px;
  position: relative;
  background: transparent;
  overflow: visible;
}

.node-shell {
  background: rgba(255, 255, 255, 0.45) !important;
  backdrop-filter: blur(16px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.6);
  border-radius: 14px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.08);
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
}

.page-node:hover .node-shell {
  transform: translateY(-5px);
  box-shadow: 0 12px 40px rgba(255, 77, 0, 0.15);
}

.page-node.selected .node-shell {
  border: 2px solid #ff4d00;
}

.io-handle {
  width: 12px;
  height: 12px;
  background: #fff !important;
  border: 2px solid #94a3b8 !important;
  z-index: 100;
  transition: none !important;
}

.handle-left {
  left: -6px;
}

.handle-right {
  right: -6px;
}

.node-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: rgba(245, 247, 250, 0.3);
}

.node-title {
  font-size: 14px;
  font-weight: 700;
  color: #1f2937;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

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