<template>
  <div class="saas-overlay" tabindex="0" @keydown.esc="$emit('close')">
    <div class="saas-window">

      <div class="saas-header">
        <div class="header-left">
          <div class="id-badge">ID: {{ nodeId ? nodeId.slice(-4) : 'NA' }}</div>
          <input v-model="localData.label" class="saas-input-title" placeholder="页面名称" />
          <div class="mode-switcher">
            <button :class="{ active: viewMode === 'image' }" @click="viewMode = 'image'">📐 标注</button>
            <button :class="{ active: viewMode === 'web' }" @click="viewMode = 'web'">🌍 采集</button>
          </div>
        </div>

        <div class="header-center">
           <div v-if="viewMode === 'web'" class="url-bar">
             <input v-model="browserUrl" placeholder="输入网址 (https://...)" @keyup.enter="handleNavigate" />
             <button class="icon-btn" @click="handleNavigate">➔</button>
           </div>
           <div v-if="viewMode === 'image'" class="canvas-tools">
             <button class="tool-btn" @click="zoomIn">➕</button>
             <button class="tool-btn" @click="zoomOut">➖</button>
             <button class="tool-btn" @click="fitToScreen">⛶</button>
             <span class="zoom-label">{{ Math.round(scale * 100) }}%</span>
           </div>
        </div>

        <div class="header-right">
          <button v-if="viewMode === 'web'"
                  class="btn-primary"
                  @click="handleSnapshot"
                  :disabled="isSnapshotting || !browserUrl"
                  :class="{ disabled: !browserUrl }">
            {{ isSnapshotting ? '正在扫描...' : '⚡ 智能快照' }}
          </button>
          <button class="btn-secondary" @click="handleSave">💾 保存</button>
          <button class="btn-icon-close" @click="$emit('close')">×</button>
        </div>
      </div>

      <div class="saas-body">
        <div class="visual-container" ref="visualPanelRef" @wheel.prevent="handleWheel">

          <!-- 🔥 新增：组件详情悬浮卡片 (居中显示) -->
          <div v-if="selectedCompIndex !== -1 && localData.interactions[selectedCompIndex]" class="comp-detail-overlay">
            <div class="detail-header">
              <span class="detail-title">组件详情 #{{ selectedCompIndex + 1 }}</span>
              <button class="close-detail" @click="selectedCompIndex = -1">×</button>
            </div>
            <div class="detail-grid">
              <div class="d-label">XPath:</div>
              <div class="d-value code">{{ localData.interactions[selectedCompIndex].locators?.web?.xpath || '-' }}</div>
              
              <div class="d-label">ID:</div>
              <div class="d-value">{{ localData.interactions[selectedCompIndex].locators?.web?.id || '-' }}</div>
              
              <div class="d-label">Class:</div>
              <div class="d-value">{{ localData.interactions[selectedCompIndex].locators?.web?.className || '-' }}</div>
              
              <div class="d-label">Text:</div>
              <div class="d-value">{{ localData.interactions[selectedCompIndex].locators?.web?.text || '-' }}</div>
            </div>
          </div>

          <div v-show="viewMode === 'image'" class="canvas-wrapper"
               @mousedown.space="startPan"
               @mousedown.left="handleCanvasMouseDown"
               @mousemove="handleCanvasMouseMove"
               @mouseup="handleCanvasMouseUp">

             <div class="transform-layer" :style="transformStyle">

                <div class="artboard" ref="imageRef" :style="imageWrapperStyle">
                   <img v-if="localData.screenshot" :src="localData.screenshot" class="base-img" draggable="false" @load="onImgLoad" />
                   <div v-else class="empty-artboard"><p>暂无截图</p></div>

                   <div v-for="(comp, index) in localData.interactions" :key="index"
                        class="hotspot-box"
                        :class="{ selected: selectedCompIndex === index }"
                        :style="{
                          left: comp.x + 'px',
                          top: comp.y + 'px',
                          width: comp.w + 'px',
                          height: comp.h + 'px'
                        }"
                        @mousedown.stop="selectComp(index)">
                        <div class="label-tag">{{ index + 1 }}</div>
                   </div>

                   <div v-if="isDrawing && currentBox" class="drawing-box" :style="drawingBoxStyle"></div>
                </div>
             </div>
          </div>

          <div v-show="viewMode === 'web'" class="web-wrapper">
             <WebRecorder ref="webRecorderRef" :initial-url="localData.url" />
          </div>
        </div>

        <div class="props-sidebar">
           <div class="sidebar-header">
              <span class="title">组件清单</span>
              <span class="badge">{{ localData.interactions.length }}</span>
           </div>
           <div class="list-content">
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
                      <input v-model="comp.label" class="comp-name-edit" />
                      <div class="meta-row">
                         <span class="pill-tag purple">{{ comp.category }}</span>
                         <span class="pill-tag gray">{{ comp.sub_type }}</span>
                      </div>
                   </div>
                   <button class="delete-btn" @click.stop="deleteComp(index)">×</button>
              </div>
           </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, nextTick, onBeforeUpdate } from 'vue'
import WebRecorder from './WebRecorder.vue'
import { saveNodeDetail, uploadSnapshot, getImageUrl } from '@/api/appGraph'

const props = defineProps({ nodeData: Object, graphId: Number, nodeId: String })
const emit = defineEmits(['close', 'save'])

const localData = reactive({ label: '', url: '', screenshot: '', interactions: [], naturalW: 0, naturalH: 0 })
const browserUrl = ref('')
const viewMode = ref('image')
const isSnapshotting = ref(false)
const selectedCompIndex = ref(-1)

const webRecorderRef = ref(null); const imageRef = ref(null); const visualPanelRef = ref(null)
const scale = ref(0.5); // 默认缩小
const translate = ref({ x: 40, y: 40 })
const isPanning = ref(false); const panStart = ref({ x: 0, y: 0 })
const isDrawing = ref(false); const drawStart = ref({x:0, y:0}); const currentBox = ref(null)

// 🔥 列表滚动相关
const itemRefs = ref([])
const setItemRef = (el, index) => { if (el) itemRefs.value[index] = el }
onBeforeUpdate(() => { itemRefs.value = [] })

const transformStyle = computed(() => ({
    transform: `translate(${translate.value.x}px, ${translate.value.y}px) scale(${scale.value})`
}))

// 🔥 容器尺寸等于图片原始尺寸
const imageWrapperStyle = computed(() => ({
    width: (localData.naturalW || 1280) + 'px',
    height: (localData.naturalH || 800) + 'px',
    backgroundColor: '#fff',
    boxShadow: '0 8px 30px rgba(0,0,0,0.08)',
    position: 'relative'
}))

const drawingBoxStyle = computed(() => currentBox.value ? { left: currentBox.value.x+'px', top: currentBox.value.y+'px', width: currentBox.value.w+'px', height: currentBox.value.h+'px' } : {})

const focusComponent = (index) => {
  selectedCompIndex.value = index
  viewMode.value = 'image'
  const comp = localData.interactions[index]
  if (!comp || !visualPanelRef.value || !localData.naturalW) return

  const targetScale = 1.0
  scale.value = targetScale
  const viewW = visualPanelRef.value.clientWidth
  const viewH = visualPanelRef.value.clientHeight
  const cx = comp.x + comp.w / 2
  const cy = comp.y + comp.h / 2
  translate.value = { x: viewW / 2 - cx * targetScale, y: viewH / 2 - cy * targetScale }

  // 确保列表也滚动到中间 (双向同步)
  nextTick(() => {
      const el = itemRefs.value[index]
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  })
}

const handleSnapshot = async () => {
  if (!webRecorderRef.value) return
  isSnapshotting.value = true
  try {
    const res = await webRecorderRef.value.captureSnapshot()
    if (res && res.imgData) {
      const byteString = atob(res.imgData.split(',')[1])
      const mimeString = res.imgData.split(',')[0].split(':')[1].split(';')[0]
      const ab = new ArrayBuffer(byteString.length)
      const ia = new Uint8Array(ab)
      for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i)
      const blob = new Blob([ab], {type: mimeString})
      const upRes = await uploadSnapshot(blob)

      if (upRes.code === 200) {
          localData.screenshot = getImageUrl(upRes.url)
          // 直接使用扁平坐标
          localData.interactions = res.components.map(c => ({
             uid: null, label: c.label, category: c.category, sub_type: c.sub_type,
             x: c.rect.x, y: c.rect.y, w: c.rect.w, h: c.rect.h,
             rules: c.rules || {}, locators: c.locators || {}
          }))
          viewMode.value = 'image'
          nextTick(() => onImgLoad({target: {naturalWidth: res.logicalW, naturalHeight: res.logicalH}}))
      }
    }
  } catch(e) { console.error(e) }
  finally { isSnapshotting.value = false }
}

const handleSave = async () => {
  // 保存时打包成 rect
  try {
    const componentsPayload = localData.interactions.map(c => ({
        uid: c.uid || null, label: c.label, category: c.category, sub_type: c.sub_type,
        rect: { x: c.x, y: c.y, w: c.w, h: c.h },
        rules: c.rules, locators: c.locators
    }))
    const payload = {
        graph_id: props.graphId, node_id: props.nodeId, label: localData.label,
        screenshot: localData.screenshot, dom_tree: null, components: componentsPayload
    }
    await saveNodeDetail(payload)
    emit('save', payload)
    emit('close')
  } catch (error) {
    console.error('保存失败:', error)
    // 这里可以添加一个提示，例如 alert('保存失败') 或 message.error(...)
  }
}

const handleNavigate = () => { viewMode.value = 'web'; nextTick(() => { if(webRecorderRef.value) webRecorderRef.value.navigate(browserUrl.value) }) }
const onImgLoad = (e) => { localData.naturalW = e.target.naturalWidth; localData.naturalH = e.target.naturalHeight }
const handleWheel = (e) => { if (e.ctrlKey) scale.value = Math.max(0.1, scale.value - e.deltaY * 0.001); else { translate.value.x -= e.deltaX; translate.value.y -= e.deltaY } }
const getRelativePos = (e) => { const rect = imageRef.value.getBoundingClientRect(); return { x: (e.clientX - rect.left)/scale.value, y: (e.clientY - rect.top)/scale.value } }

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
    // 🔥 核心功能：点击热区，右侧列表自动滚动到中间
    nextTick(() => {
        const el = itemRefs.value[index]
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
}
const startPan = (e) => { isPanning.value = true; panStart.value = { x: e.clientX - translate.value.x, y: e.clientY - translate.value.y } }
const handleCanvasMouseDown = (e) => { if (isPanning.value) return; isDrawing.value = true; selectedCompIndex.value = -1; drawStart.value = getRelativePos(e); currentBox.value = { ...drawStart.value, w:0, h:0 } }
const handleCanvasMouseMove = (e) => { if (isPanning.value) { translate.value.x = e.clientX - panStart.value.x; translate.value.y = e.clientY - panStart.value.y; return } if (!isDrawing.value) return; const pos = getRelativePos(e); const w = pos.x - drawStart.value.x; const h = pos.y - drawStart.value.y; currentBox.value = { x: w>0?drawStart.value.x:pos.x, y: h>0?drawStart.value.y:pos.y, w:Math.abs(w), h:Math.abs(h) } }
const handleCanvasMouseUp = () => { isPanning.value = false; isDrawing.value = false; if (currentBox.value && currentBox.value.w > 5) { localData.interactions.push({ label: 'New Area', category: 'action', sub_type: 'click', ...currentBox.value }); selectedCompIndex.value = localData.interactions.length - 1 } currentBox.value = null }
const deleteComp = (i) => { localData.interactions.splice(i, 1); selectedCompIndex.value = -1 }
const zoomIn = () => scale.value = Math.min(5, scale.value * 1.2)
const zoomOut = () => scale.value = Math.max(0.1, scale.value * 0.8)
const fitToScreen = () => { if(localData.naturalW) scale.value = Math.min(1, (visualPanelRef.value?.clientWidth - 60)/localData.naturalW); translate.value = {x:30, y:30} }

onMounted(() => {
  if (props.nodeData) {
    localData.label = props.nodeData.label
    localData.screenshot = props.nodeData.screenshot
    localData.interactions = JSON.parse(JSON.stringify(props.nodeData.interactions || []))
    if (localData.url) browserUrl.value = localData.url
  }
})
</script>

<style scoped>
/* 样式保持不变，略去以节省空间，直接使用之前的 CSS */
.saas-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 2000; display: flex; align-items: center; justify-content: center; padding-top: 40px; }
.saas-window { width: 95vw; height: 90vh; background: #f8fafc; display: flex; flex-direction: column; border-radius: 12px; overflow: hidden; box-shadow: 0 20px 50px rgba(0,0,0,0.2); border: 1px solid #e2e8f0; }
.saas-header { height: 56px; background: white; border-bottom: 1px solid #e2e8f0; display: flex; align-items: center; justify-content: space-between; padding: 0 20px; flex-shrink: 0; }
.header-left, .header-center, .header-right { display: flex; align-items: center; gap: 12px; }
.header-center { flex: 1; justify-content: center; }
.id-badge { background: #e0e7ff; color: #4338ca; font-size: 11px; padding: 2px 6px; border-radius: 4px; font-weight: bold; }
.saas-input-title { font-size: 16px; font-weight: 600; color: #1e293b; border: none; outline: none; width: 200px; background: transparent; }
.mode-switcher { background: #f1f5f9; padding: 3px; border-radius: 8px; display: flex; }
.mode-switcher button { padding: 6px 16px; font-size: 13px; font-weight: 500; color: #64748b; border: none; background: transparent; cursor: pointer; border-radius: 6px; }
.mode-switcher button.active { background: #fff; color: #6366f1; box-shadow: 0 2px 4px rgba(0,0,0,0.05); }
.url-bar { background: #f1f5f9; border-radius: 8px; padding: 6px 12px; width: 400px; display: flex; align-items: center; border: 1px solid transparent; }
.url-bar:focus-within { border-color: #6366f1; background: #fff; }
.url-bar input { border: none; background: transparent; flex: 1; outline: none; font-size: 13px; }
.icon-btn { border: none; background: transparent; cursor: pointer; color: #64748b; }
.canvas-tools { display: flex; gap: 8px; align-items: center; background: #f1f5f9; padding: 4px; border-radius: 8px; }
.tool-btn { border: none; background: #fff; width: 28px; height: 28px; border-radius: 4px; cursor: pointer; font-size: 14px; color: #475569; display: flex; align-items: center; justify-content: center; }
.tool-btn:hover { color: #6366f1; }
.zoom-label { font-size: 12px; color: #64748b; margin-left: 4px; min-width: 40px; text-align: center; }
.saas-body { flex: 1; display: flex; overflow: hidden; position: relative; }
.visual-container { flex: 1; background: #e2e8f0; position: relative; overflow: hidden; display: flex; flex-direction: column; }
.canvas-wrapper { flex: 1; overflow: hidden; cursor: grab; position: relative; }
.web-wrapper { flex: 1; display: flex; height: 100%; width: 100%; }
.transform-layer { transform-origin: 0 0; }
.artboard { position: relative; background: white; }
.base-img { display: block; width: 100%; height: 100%; pointer-events: none; }
.empty-artboard { height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #94a3b8; }
.hotspot-box { position: absolute; border: 1px solid #6366f1; background: rgba(99,102,241, 0.1); z-index: 10; cursor: pointer; box-sizing: border-box; }
.hotspot-box.selected { border-color: #ef4444; background: rgba(239,68,68, 0.15); z-index: 20; }
.label-tag { position: absolute; top: -22px; left: -2px; background: #6366f1; color: white; font-size: 11px; padding: 2px 6px; border-radius: 4px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
.drawing-box { position: absolute; border: 1px dashed #6366f1; background: rgba(99,102,241,0.1); pointer-events: none; z-index: 30; }
.props-sidebar { width: 300px; background: white; border-left: 1px solid #e2e8f0; display: flex; flex-direction: column; z-index: 20; }
.sidebar-header { height: 50px; display: flex; align-items: center; justify-content: space-between; padding: 0 20px; border-bottom: 1px solid #f1f5f9; }
.sidebar-header .title { font-size: 14px; font-weight: 600; color: #1e293b; }
.badge { background: #f1f5f9; color: #64748b; padding: 2px 8px; border-radius: 12px; font-size: 11px; }
.list-content { flex: 1; overflow-y: auto; padding: 12px; }
.comp-card { display: flex; align-items: center; padding: 10px; background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 8px; cursor: pointer; position: relative; transition: all 0.2s; }
.comp-card:hover { border-color: #6366f1; box-shadow: 0 4px 12px rgba(99,102,241,0.08); transform: translateY(-1px); }
.comp-card.active { border-color: #6366f1; background: #eff6ff; }
.card-left { display: flex; align-items: center; margin-right: 10px; }
.index-circle { width: 24px; height: 24px; background: #f1f5f9; color: #64748b; font-size: 11px; display: flex; align-items: center; justify-content: center; border-radius: 6px; margin-right: 8px; flex-shrink: 0; }
.comp-thumbnail { background-color: #e2e8f0; border: 1px solid #cbd5e1; border-radius: 4px; background-repeat: no-repeat; flex-shrink: 0; }
.comp-card.active .index-circle { background: #6366f1; color: white; }
.comp-name-edit { width: 100%; border: none; background: transparent; font-size: 13px; font-weight: 500; outline: none; color: #1e293b; }
.meta-row { display: flex; gap: 6px; margin-top: 4px; }
.pill-tag { font-size: 10px; padding: 1px 6px; border-radius: 4px; text-transform: uppercase; font-weight: 600; }
.pill-tag.purple { background: #e0e7ff; color: #4338ca; }
.pill-tag.gray { background: #f1f5f9; color: #64748b; }
.delete-btn { position: absolute; right: 8px; top: 8px; border: none; background: transparent; color: #94a3b8; cursor: pointer; opacity: 0; }
.comp-card:hover .delete-btn { opacity: 1; }
.delete-btn:hover { color: #ef4444; }
.btn-primary { background: #6366f1; color: white; border: none; padding: 6px 16px; border-radius: 6px; font-size: 13px; cursor: pointer; }
.btn-primary.disabled { background: #cbd5e1; cursor: not-allowed; }
.btn-secondary { background: white; border: 1px solid #e2e8f0; color: #475569; padding: 6px 16px; border-radius: 6px; font-size: 13px; cursor: pointer; }
.btn-icon-close { background: transparent; border: none; font-size: 20px; color: #94a3b8; cursor: pointer; }

/* 🔥 详情悬浮卡片样式 */
.comp-detail-overlay {
  position: absolute;
  top: 20px; left: 50%; transform: translateX(-50%);
  width: 320px;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(8px);
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  box-shadow: 0 10px 25px rgba(0,0,0,0.15);
  z-index: 100;
  padding: 12px;
  font-size: 12px;
}
.detail-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; border-bottom: 1px solid #f1f5f9; padding-bottom: 6px; }
.detail-title { font-weight: 600; color: #334155; }
.close-detail { border: none; background: transparent; font-size: 16px; cursor: pointer; color: #94a3b8; }
.detail-grid { display: grid; grid-template-columns: 50px 1fr; gap: 6px; }
.d-label { color: #64748b; text-align: right; font-weight: 500; }
.d-value { color: #1e293b; word-break: break-all; max-height: 60px; overflow-y: auto; }
.d-value.code { font-family: monospace; background: #f1f5f9; padding: 2px 4px; border-radius: 4px; color: #475569; }
</style>