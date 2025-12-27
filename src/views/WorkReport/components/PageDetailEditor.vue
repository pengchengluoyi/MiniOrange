<template>
  <div class="saas-overlay" tabindex="0" @keydown.esc="$emit('close')">
    <div class="saas-window">
      <el-container class="h-full">
        <!-- 顶部工具栏 -->
        <el-header class="saas-header">
          <div class="header-left">
            <el-tag effect="dark" type="info" class="id-badge">ID: {{ node.id ? node.id.slice(-4) : 'NA' }}</el-tag>
            <el-input
                v-model="localData.label"
                class="saas-input-title"
                placeholder="页面名称"
                @input="updateNode"
            >
              <template #prefix>
                <el-icon><Document /></el-icon>
              </template>
            </el-input>
            <el-input
                v-model="localData.desc"
                class="saas-input-desc"
                placeholder="描述信息"
                @input="updateNode"
            >
            </el-input>
          </div>

          <div class="header-center">
            <el-button-group class="canvas-tools">
              <el-button :icon="ZoomIn" @click="zoomIn" title="放大" />
              <el-button :icon="ZoomOut" @click="zoomOut" title="缩小" />
              <el-button :icon="FullScreen" @click="fitToScreen" title="适应屏幕" />
            </el-button-group>
            <span class="zoom-label">{{ Math.round(scale * 100) }}%</span>
          </div>

          <div class="header-right">
            <input type="file" ref="fileInput" accept="image/*" style="display:none" @change="handleFileUpload" />

            <!-- 上传按钮：点击触发文件选择，选完自动 OCR -->
            <el-button type="primary" @click="triggerUpload" :loading="ocrLoading" :icon="Camera">
              {{ ocrLoading ? '识别中...' : '上传截图' }}
            </el-button>

            <el-button @click="handleSave" :icon="Check">完成</el-button>
            <el-button link class="btn-icon-close" @click="$emit('close')">
              <el-icon :size="20"><Close /></el-icon>
            </el-button>
          </div>
        </el-header>

        <el-container class="editor-body">
          <!-- 中间画布区域 -->
          <el-main class="visual-container" ref="visualPanelRef" @wheel.prevent="handleWheel">
            <div class="canvas-wrapper"
                 @dragstart.prevent
                 @mousedown="handleCanvasMouseDown"
                 @mousemove="handleCanvasMouseMove"
                 @mouseup="handleCanvasMouseUp">

              <div class="transform-layer" :style="transformStyle">
                <div class="artboard" ref="imageRef" :style="imageWrapperStyle">
                  <img v-if="localData.screenshot" :src="localData.screenshot" class="base-img" draggable="false" @load="onImgLoad" />

                  <div v-else class="empty-artboard">
                    <el-empty description="暂无截图，请点击右上角上传" />
                  </div>

                  <!-- 现有热区 -->
                  <div v-for="(comp, index) in localData.interactions" :key="index"
                       class="hotspot-box"
                       :class="{ selected: selectedCompIndex === index }"
                       :style="{
                          left: comp.x + 'px',
                          top: comp.y + 'px',
                          width: comp.w + 'px',
                          height: comp.h + 'px'
                        }"
                       @mousedown="handleHotspotMouseDown($event, index)">
                    <div class="label-tag">{{ index + 1 }}</div>
                  </div>

                  <!-- 正在绘制的热区 -->
                  <div v-if="isDrawing && currentBox" class="drawing-box" :style="drawingBoxStyle"></div>
                </div>
              </div>
            </div>

            <!-- 底部提示 -->
            <div class="canvas-tip">
              <el-tag type="info" size="small" effect="light" round>
                <el-icon style="vertical-align: middle"><InfoFilled /></el-icon>
                按住 Command/Ctrl + 鼠标左键拖拽创建热区 | 空格 + 拖拽移动画布
              </el-tag>
            </div>
          </el-main>

          <!-- 右侧属性栏 -->
          <el-aside width="320px" class="props-sidebar">
            <div class="sidebar-header">
              <span class="title">组件清单</span>
              <el-tag size="small" type="info" round>{{ localData.interactions.length }}</el-tag>
            </div>
            <el-scrollbar class="list-content">
              <div v-for="(comp, index) in localData.interactions" :key="index"
                   :ref="(el) => setItemRef(el, index)"
                   class="comp-card"
                   :class="{ active: selectedCompIndex === index }"
                   @click="focusComponent(index)">
                <div class="card-left">
                  <div class="index-circle">{{ index + 1 }}</div>
                  <div class="comp-thumbnail" :style="getThumbStyle(comp)"></div>
                </div>
                <div class="card-body">
                  <el-input v-model="comp.label" size="small" class="comp-name-edit" @input="updateNode" placeholder="组件名称" />
                  <div class="meta-row">
                    <div class="coord-inputs">
                      <div class="coord-item"><span>X</span><el-input v-model.number="comp.x" type="number" size="small" class="coord-input" @input="updateNode" /></div>
                      <div class="coord-item"><span>Y</span><el-input v-model.number="comp.y" type="number" size="small" class="coord-input" @input="updateNode" /></div>
                      <div class="coord-item"><span>W</span><el-input v-model.number="comp.w" type="number" size="small" class="coord-input" @input="updateNode" /></div>
                      <div class="coord-item"><span>H</span><el-input v-model.number="comp.h" type="number" size="small" class="coord-input" @input="updateNode" /></div>
                    </div>
                  </div>
                </div>
                <el-button link type="danger" class="delete-btn" :icon="Delete" @click.stop="deleteComp(index)" />
              </div>
            </el-scrollbar>
          </el-aside>
        </el-container>
      </el-container>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted, nextTick, onBeforeUpdate } from 'vue'
import { ElMessage, ElContainer, ElHeader, ElMain, ElAside, ElButton, ElButtonGroup, ElInput, ElTag, ElIcon, ElEmpty, ElScrollbar } from 'element-plus'
import { ZoomIn, ZoomOut, FullScreen, Camera, Check, Close, Delete, Document, InfoFilled } from '@element-plus/icons-vue'
import * as api from '@/api/workReport'
import { wsUploadFile, wsGetFile } from '@/api/mWebSocket'

const props = defineProps({ node: Object })
const emit = defineEmits(['close', 'update'])

const localData = reactive({ label: '', desc: '', screenshot: '', screenshotPath: '', interactions: [], naturalW: 0, naturalH: 0 })
const ocrLoading = ref(false)
const selectedCompIndex = ref(-1)

const fileInput = ref(null); const imageRef = ref(null); const visualPanelRef = ref(null)
const scale = ref(0.5)
const translate = ref({ x: 40, y: 40 })
const isPanning = ref(false); const panStart = ref({ x: 0, y: 0 })
const isDrawing = ref(false); const drawStart = ref({x:0, y:0}); const currentBox = ref(null)

// 列表滚动相关
const itemRefs = ref([])
const setItemRef = (el, index) => { if (el) itemRefs.value[index] = el }
onBeforeUpdate(() => { itemRefs.value = [] })

const transformStyle = computed(() => ({
    transform: `translate(${translate.value.x}px, ${translate.value.y}px) scale(${scale.value})`
}))

const imageWrapperStyle = computed(() => ({
    width: (localData.naturalW || 1280) + 'px',
    height: (localData.naturalH || 800) + 'px',
    backgroundColor: '#fff',
    boxShadow: '0 8px 30px rgba(0,0,0,0.08)',
    position: 'relative'
}))

const drawingBoxStyle = computed(() => currentBox.value ? { left: currentBox.value.x+'px', top: currentBox.value.y+'px', width: currentBox.value.w+'px', height: currentBox.value.h+'px' } : {})

const triggerUpload = () => fileInput.value.click()

const handleFileUpload = async (e) => {
  const file = e.target.files[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = async (evt) => {
    const base64 = evt.target.result
    ocrLoading.value = true
    try {
      // 1. Upload via WebSocket
      const res = await wsUploadFile(file.name, base64)
      if (res.code === 200) {
        // 🔥 修复：如果后端返回的是对象 {filename, path, url}，优先取 path (绝对路径)
        localData.screenshotPath = (res.data && typeof res.data === 'object' && res.data.path) ? res.data.path : res.data
        localData.screenshot = base64 // Use base64 for immediate display
        // 2. Perform OCR
        await performOCR(base64)
      } else {
        ElMessage.error(res.msg || '上传失败')
        ocrLoading.value = false
      }
    } catch (e) {
      console.error(e)
      ElMessage.error('上传出错')
      ocrLoading.value = false
    }
  }
  reader.readAsDataURL(file)
}

const performOCR = async (imageUrl) => {
  ocrLoading.value = true
  try {
    const results = await api.ocrRecognition(imageUrl)
    if (!localData.interactions) localData.interactions = []

    results.forEach(item => {
      // 将 OCR 的 box (4个点) 转换为 bounding box (x, y, w, h)
      const xs = item.coordinates.box.map(p => p[0])
      const ys = item.coordinates.box.map(p => p[1])
      const x = Math.min(...xs)
      const y = Math.min(...ys)
      const w = Math.max(...xs) - x
      const h = Math.max(...ys) - y

      localData.interactions.push({
        x, y, w, h,
        label: item.text
      })
    })
    updateNode()
    ElMessage.success(`识别成功，添加了 ${results.length} 个热区`)
  } catch (e) {
    console.error(e)
    ElMessage.error('OCR 识别失败')
  } finally {
    ocrLoading.value = false
  }
}

const handleSave = async () => {
  updateNode()
  emit('close')
}

const onImgLoad = (e) => {
  localData.naturalW = e.target.naturalWidth
  localData.naturalH = e.target.naturalHeight

  // 图片加载后，自动适应屏幕
  nextTick(() => {
    fitToScreen()
  })

  updateNode()
}

const updateNode = () => {
  // 同步回父组件
  props.node.label = localData.label
  props.node.desc = localData.desc
  if (props.node.data) props.node.data.desc = localData.desc
  props.node.data.screenshot = localData.screenshotPath || localData.screenshot
  props.node.data.interactions = localData.interactions
  props.node.data.naturalSize = { w: localData.naturalW, h: localData.naturalH }
  emit('update', props.node)
}

// 画布交互逻辑
const handleWheel = (e) => {
  if (e.ctrlKey || e.metaKey) {
    e.preventDefault()
    const zoomFactor = 0.1
    const direction = e.deltaY < 0 ? 1 : -1
    const newScale = Math.max(0.1, Math.min(5, scale.value + direction * zoomFactor))
    
    // 计算鼠标相对于容器的位置，实现以鼠标为中心的缩放
    const rect = visualPanelRef.value.$el.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top
    
    const tx = translate.value.x
    const ty = translate.value.y
    
    const newTx = mouseX - (mouseX - tx) * (newScale / scale.value)
    const newTy = mouseY - (mouseY - ty) * (newScale / scale.value)
    
    scale.value = newScale
    translate.value = { x: newTx, y: newTy }
  } else {
    translate.value.x -= e.deltaX;
    translate.value.y -= e.deltaY
  }
}

const getRelativePos = (e) => {
  const rect = imageRef.value.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) / scale.value,
    y: (e.clientY - rect.top) / scale.value
  }
}

const getThumbStyle = (comp) => {
  if (!localData.screenshot || !localData.naturalW || !comp.w || !comp.h) {
      return { display: 'none' }
  }
  const boxW = 48
  const boxH = 32
  const scale = Math.min(boxW / comp.w, boxH / comp.h)

  const bgW = localData.naturalW * scale
  const bgH = localData.naturalH * scale
  const bgX = -comp.x * scale + (boxW - comp.w * scale) / 2
  const bgY = -comp.y * scale + (boxH - comp.h * scale) / 2

  return {
    backgroundImage: `url(${localData.screenshot})`,
    backgroundSize: `${bgW}px ${bgH}px`,
    backgroundPosition: `${bgX}px ${bgY}px`,
    width: `${boxW}px`,
    height: `${boxH}px`
  }
}

const selectComp = (index) => {
    selectedCompIndex.value = index
    nextTick(() => {
        const el = itemRefs.value[index]
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
}

const handleHotspotMouseDown = (e, index) => {
  // 如果按住 Command/Ctrl (绘制) 或 Space (平移)，则不阻止冒泡，允许触发画布的逻辑
  if (e.metaKey || e.ctrlKey || e.code === 'Space') {
    e.preventDefault()
    return
  }
  
  e.stopPropagation()
  selectComp(index)
}

const focusComponent = (index) => {
  selectedCompIndex.value = index
  const comp = localData.interactions[index]
  if (!comp || !visualPanelRef.value || !localData.naturalW) return

  // 聚焦时稍微放大一点
  const targetScale = Math.max(scale.value, 0.8)
  scale.value = targetScale

  const viewW = visualPanelRef.value.$el.clientWidth
  const viewH = visualPanelRef.value.$el.clientHeight

  const cx = comp.x + comp.w / 2
  const cy = comp.y + comp.h / 2

  translate.value = {
    x: viewW / 2 - cx * targetScale,
    y: viewH / 2 - cy * targetScale
  }
}

const startPan = (e) => {
  isPanning.value = true;
  panStart.value = { x: e.clientX - translate.value.x, y: e.clientY - translate.value.y }
}

const handleCanvasMouseDown = (e) => {
  // 1. 平移逻辑：中键 OR 空格+左键 OR (左键+无Command)
  // 这里实现了"左键直接拖拽画布"的需求，同时通过 if/else 解决了与 Command+左键 的冲突
  const isSpacePan = e.code === 'Space'
  const isMiddlePan = e.button === 1
  const isLeftPan = e.button === 0 && !e.metaKey && !e.ctrlKey

  if (isSpacePan || isMiddlePan || isLeftPan) {
    e.preventDefault() // 防止文字选中等默认行为
    if (isLeftPan) selectedCompIndex.value = -1 // 点击空白处取消选中
    startPan(e)
    return
  }

  // 2. 绘制逻辑：Command/Ctrl + 左键
  if (e.button === 0 && (e.metaKey || e.ctrlKey)) {
    e.preventDefault()
    isDrawing.value = true;
    selectedCompIndex.value = -1;
    drawStart.value = getRelativePos(e);
    currentBox.value = { ...drawStart.value, w:0, h:0 }
  }
}

const handleCanvasMouseMove = (e) => {
  if (isPanning.value) {
    translate.value.x = e.clientX - panStart.value.x;
    translate.value.y = e.clientY - panStart.value.y;
    return
  }
  if (!isDrawing.value) return;

  const pos = getRelativePos(e);
  const w = pos.x - drawStart.value.x;
  const h = pos.y - drawStart.value.y;

  currentBox.value = {
    x: w > 0 ? drawStart.value.x : pos.x,
    y: h > 0 ? drawStart.value.y : pos.y,
    w: Math.abs(w),
    h: Math.abs(h)
  }
}

const handleCanvasMouseUp = () => {
  isPanning.value = false;
  isDrawing.value = false;
  if (currentBox.value && currentBox.value.w > 5 && currentBox.value.h > 5) {
    if (!localData.interactions) localData.interactions = []
    localData.interactions.push({ label: 'New Area', ...currentBox.value });
    selectedCompIndex.value = localData.interactions.length - 1
    updateNode()
  }
  currentBox.value = null
}

const deleteComp = (i) => {
  localData.interactions.splice(i, 1);
  selectedCompIndex.value = -1
  updateNode()
}

const zoomIn = () => scale.value = Math.min(5, scale.value * 1.2)
const zoomOut = () => scale.value = Math.max(0.1, scale.value * 0.8)

const fitToScreen = () => {
  if (!localData.naturalW || !localData.naturalH || !visualPanelRef.value) return

  const containerEl = visualPanelRef.value.$el
  const containerW = containerEl.clientWidth
  const containerH = containerEl.clientHeight
  const padding = 40

  // 计算缩放比例：保证图片完整显示在容器内
  const scaleX = (containerW - padding) / localData.naturalW
  const scaleY = (containerH - padding) / localData.naturalH
  const newScale = Math.min(scaleX, scaleY, 1) // 不超过原图大小

  scale.value = newScale

  // 居中计算
  const scaledW = localData.naturalW * newScale
  const scaledH = localData.naturalH * newScale

  translate.value = {
    x: (containerW - scaledW) / 2,
    y: (containerH - scaledH) / 2
  }
}

const handleKeydown = (e) => {
  if (selectedCompIndex.value === -1) return
  if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return
  
  const comp = localData.interactions[selectedCompIndex.value]
  if (!comp) return

  let handled = false
  if (e.key === 'ArrowUp') { comp.y -= 1; handled = true }
  else if (e.key === 'ArrowDown') { comp.y += 1; handled = true }
  else if (e.key === 'ArrowLeft') { comp.x -= 1; handled = true }
  else if (e.key === 'ArrowRight') { comp.x += 1; handled = true }
  
  if (handled) {
    e.preventDefault()
    updateNode()
  }
}

onMounted(async () => {
  if (props.node) {
    localData.label = props.node.label
    localData.desc = props.node.desc || props.node.data?.desc || ''
    
    // 🔥 修复：安全地获取截图路径字符串，防止因数据为对象而崩溃
    const screenshotData = props.node.data.screenshot
    let path = ''
    if (screenshotData && typeof screenshotData === 'object') {
      path = screenshotData.path || screenshotData.url || ''
    } else if (typeof screenshotData === 'string') {
      path = screenshotData
    }
    localData.screenshotPath = path

    if (path && !path.startsWith('data:image') && !path.startsWith('http')) {
      try {
        const res = await wsGetFile(path)
        if (res.code === 200) {
          localData.screenshot = res.data // Assuming res.data contains the base64 content
        }
      } catch (e) {
        console.error('Failed to load image via WS', e)
      }
    } else {
      localData.screenshot = path
    }

    localData.interactions = JSON.parse(JSON.stringify(props.node.data.interactions || []))
    localData.naturalW = props.node.data.naturalSize?.w || 0
    localData.naturalH = props.node.data.naturalSize?.h || 0

    // 如果已有图片，尝试适应屏幕
    if (localData.naturalW) {
      nextTick(() => fitToScreen())
    }
  }
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<style scoped>
.saas-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 2000; display: flex; align-items: center; justify-content: center; padding-top: 40px; }
.saas-window { width: 95vw; height: 90vh; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 20px 50px rgba(0,0,0,0.2); border: 1px solid #e2e8f0; }
.h-full { height: 100%; }
.saas-header { background: white; border-bottom: 1px solid #e2e8f0; display: flex; align-items: center; justify-content: space-between; padding: 0 20px; }
.header-left, .header-center, .header-right { display: flex; align-items: center; gap: 12px; }
.header-center { flex: 1; justify-content: center; }
.saas-input-title { width: 200px; }
:deep(.saas-input-title .el-input__wrapper) { box-shadow: none !important; background: transparent; }
:deep(.saas-input-title .el-input__inner) { font-size: 16px; font-weight: 600; color: #1e293b; }

.saas-input-desc { width: 180px; margin-left: 8px; }
:deep(.saas-input-desc .el-input__wrapper) { box-shadow: none !important; background: transparent; }
:deep(.saas-input-desc .el-input__inner) { font-size: 13px; color: #64748b; }

.zoom-label { font-size: 12px; color: #64748b; margin-left: 4px; min-width: 40px; text-align: center; }
.editor-body { overflow: hidden; }
.visual-container { flex: 1; background: #e2e8f0; position: relative; overflow: hidden; display: flex; flex-direction: column; padding: 0; }
.canvas-wrapper { flex: 1; overflow: hidden; cursor: grab; position: relative; }
.transform-layer { transform-origin: 0 0; }
.artboard { position: relative; background: white; }
.base-img { display: block; width: 100%; height: 100%; pointer-events: none; }
.empty-artboard { height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #94a3b8; }
.hotspot-box { position: absolute; border: 1px solid #6366f1; background: rgba(99,102,241, 0.1); z-index: 10; cursor: pointer; box-sizing: border-box; }
.hotspot-box.selected { border-color: #ef4444; background: rgba(239,68,68, 0.15); z-index: 20; }
.label-tag { position: absolute; top: -22px; left: -2px; background: #6366f1; color: white; font-size: 11px; padding: 2px 6px; border-radius: 4px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
.drawing-box { position: absolute; border: 1px dashed #6366f1; background: rgba(99,102,241,0.1); pointer-events: none; z-index: 30; }
.props-sidebar { background: white; border-left: 1px solid #e2e8f0; display: flex; flex-direction: column; z-index: 20; }
.sidebar-header { height: 50px; display: flex; align-items: center; justify-content: space-between; padding: 0 20px; border-bottom: 1px solid #f1f5f9; }
.sidebar-header .title { font-size: 14px; font-weight: 600; color: #1e293b; }
.list-content { flex: 1; padding: 12px; }
.comp-card { display: flex; align-items: center; padding: 10px; background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 8px; cursor: pointer; position: relative; transition: all 0.2s; }
.comp-card:hover { border-color: #6366f1; box-shadow: 0 4px 12px rgba(99,102,241,0.08); transform: translateY(-1px); }
.comp-card.active { border-color: #6366f1; background: #eff6ff; }
.card-left { display: flex; align-items: center; margin-right: 10px; }
.index-circle { width: 24px; height: 24px; background: #f1f5f9; color: #64748b; font-size: 11px; display: flex; align-items: center; justify-content: center; border-radius: 6px; margin-right: 8px; flex-shrink: 0; }
.comp-thumbnail { background-color: #e2e8f0; border: 1px solid #cbd5e1; border-radius: 4px; background-repeat: no-repeat; flex-shrink: 0; }
.comp-card.active .index-circle { background: #6366f1; color: white; }
:deep(.comp-name-edit .el-input__wrapper) { box-shadow: none; padding: 0; }
.meta-row { display: flex; gap: 6px; margin-top: 4px; }
.coord-inputs { display: flex; gap: 6px; flex-wrap: wrap; }
.coord-item { display: flex; align-items: center; gap: 2px; font-size: 10px; color: #909399; }
.coord-input { width: 42px; }
:deep(.coord-input .el-input__inner) { padding: 0 2px; text-align: center; height: 20px; line-height: 20px; font-size: 11px; }
:deep(.coord-input .el-input__wrapper) { padding: 0; min-height: 20px; box-shadow: none; background: #f8fafc; }
.delete-btn { position: absolute; right: 8px; top: 8px; opacity: 0; }
.comp-card:hover .delete-btn { opacity: 1; }
.btn-icon-close { font-size: 20px; color: #94a3b8; }
.canvas-tip { position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%); z-index: 100; pointer-events: none; }
</style>