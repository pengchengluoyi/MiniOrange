<template>
  <div class="saas-overlay" tabindex="0" @keydown.esc="$emit('close')">
    <div class="saas-window">
      <el-container class="h-full">
        <!-- 顶部工具栏 -->
        <el-header class="saas-header" :class="{ 'blocking-header': localData.is_blocking }">
          <div class="header-left">
            <el-tag effect="dark" type="info" class="id-badge">ID: {{ node.id ? node.id.slice(-4) : 'NA' }}</el-tag>
            <el-input
                v-model="localData.label"
                class="saas-input-title"
                placeholder="页面名称"
                @input="updateNode"
            >
              <template #prefix>
                <el-icon>
                  <Document/>
                </el-icon>
              </template>
            </el-input>
            <el-input
                v-model="localData.desc"
                class="saas-input-desc"
                placeholder="描述信息"
                @input="updateNode"
            >
            </el-input>
            <el-tag v-if="localData.is_blocking" type="danger" effect="dark" size="small">🛑 BLOCKING</el-tag>
          </div>

          <div class="header-center">
            <el-button-group class="canvas-tools">
              <el-button :icon="ZoomIn" @click="zoomIn" title="放大"/>
              <el-button :icon="ZoomOut" @click="zoomOut" title="缩小"/>
              <el-button :icon="FullScreen" @click="fitToScreen" title="适应屏幕"/>
            </el-button-group>
            <span class="zoom-label">{{ Math.round(scale * 100) }}%</span>
          </div>

          <div class="header-right">
            <input type="file" ref="fileInput" accept="image/*" style="display:none" @change="handleFileUpload"/>

            <el-button @click="handleSave" :icon="Check">完成</el-button>
            <el-button link class="btn-icon-close" @click="$emit('close')">
              <el-icon :size="20">
                <Close/>
              </el-icon>
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

              <!-- 🔥 7. 安全区域 (Safe Areas) 遮罩与拖拽线 -->
              <div class="safe-area-overlay top" :style="{ height: localData.ignored_top + 'px' }">
                <div class="safe-area-label">顶部忽略区域 ({{ localData.ignored_top }}px)</div>
                <div class="safe-area-handle" @mousedown.stop="startDragSafeLine('top', $event)"></div>
              </div>
              <div class="safe-area-overlay bottom" :style="{ height: localData.ignored_bottom + 'px' }">
                <div class="safe-area-label">底部忽略区域 ({{ localData.ignored_bottom }}px)</div>
                <div class="safe-area-handle" @mousedown.stop="startDragSafeLine('bottom', $event)"></div>
              </div>

              <!-- 🔥 预览模式提示条 -->
              <div v-if="previewImage" class="preview-banner">
                <span>正在预览骨架素材</span>
                <el-button link type="primary" size="small" @click="exitPreview">退出预览</el-button>
                <el-button link type="success" size="small" @click="setPreviewAsMain">设为页面主图</el-button>
              </div>
              <div class="transform-layer" :style="transformStyle">
                <div class="artboard" ref="imageRef" :style="imageWrapperStyle">
                  <img v-if="currentDisplayScreenshot" :src="currentDisplayScreenshot" class="base-img"
                       draggable="false" @load="onImgLoad"/>
                  <!-- 骨架蒙版层 -->
                  <!-- 🔥 5. 修复：预览具体图片时隐藏页面级骨架蒙版，避免干扰 -->
                  <img v-if="localData.skeletonMask && !previewImage" :src="getStateImageUrl(localData.skeletonMask)"
                       class="skeleton-mask" draggable="false"/>
                  <div v-else-if="!currentDisplayScreenshot" class="empty-artboard">
                    <el-empty description="暂无截图，请点击右上角上传"/>
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

                  <!-- 裁剪框 -->
                  <div v-if="isCropping && cropBox" class="crop-box" :style="cropBoxStyle">
                    <div class="crop-actions">
                      <el-button type="success" size="small" @click="confirmCrop">确认裁剪</el-button>
                      <el-button size="small" @click="cancelCrop">取消</el-button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- 底部提示 -->
            <div class="canvas-tip">
              <el-tag type="info" size="small" effect="light" round>
                <el-icon style="vertical-align: middle">
                  <InfoFilled/>
                </el-icon>
                按住 Command/Ctrl + 鼠标左键拖拽创建热区 | 空格 + 拖拽移动画布
              </el-tag>
            </div>
          </el-main>

          <!-- 右侧属性栏 -->
          <el-aside width="320px" class="props-sidebar">
            <div class="sidebar-header">
              <div v-if="selectedCompIndex === -1" class="header-row">
                <span class="title">页面配置</span>
                <el-tag size="small" type="info" round>{{ localData.interactions.length }}</el-tag>
              </div>
              <div v-else class="header-row">
                <el-button link :icon="ArrowLeft" @click="selectedCompIndex = -1">返回列表</el-button>
                <span class="title">组件配置</span>
              </div>
            </div>
            <el-scrollbar class="list-content">
              <!-- 列表模式 -->
              <div v-if="selectedCompIndex === -1">
                <ElTabs v-model="pageActiveTab" class="comp-tabs">
                  <ElTabPane label="组件清单" name="list">
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
                        <div class="comp-label-text">{{ comp.label || '未命名组件' }}</div>
                        <div class="comp-meta-text">X:{{ comp.x }} Y:{{ comp.y }}</div>
                      </div>
                      <el-button link type="danger" class="delete-btn" :icon="Delete" @click.stop="deleteComp(index)"/>
                    </div>
                  </ElTabPane>

                  <ElTabPane label="骨架与配置" name="config">
                    <div class="form-group">
                      <div class="form-label">页面截图 (Screenshot)</div>
                      <div class="main-screenshot-uploader" @click="triggerUpload">
                        <!-- 显示安全区域数值 -->
                        <div class="safe-area-info" v-if="localData.ignored_top || localData.ignored_bottom">
                          <el-tag size="small" type="warning">
                            忽略: Top {{ localData.ignored_top }}px / Bottom {{ localData.ignored_bottom }}px
                          </el-tag>
                        </div>
                        <div v-if="ocrLoading" class="uploader-loading">
                          <el-icon class="is-loading">
                            <Refresh/>
                          </el-icon>
                          <span>识别中...</span>
                        </div>
                        <template v-else>
                          <img v-if="localData.screenshot" :src="localData.screenshot" class="preview-img"/>
                          <div v-else class="upload-placeholder">
                            <el-icon class="upload-icon">
                              <Camera/>
                            </el-icon>
                            <span>点击上传截图 (自动OCR)</span>
                          </div>
                          <div v-if="localData.screenshot" class="reupload-overlay">
                            <el-icon>
                              <Camera/>
                            </el-icon>
                          </div>
                        </template>
                      </div>
                    </div>

                    <div class="form-group">
                      <div class="form-label">骨架训练 (Skeleton)</div>
                      <div class="skeleton-uploader">
                        <el-upload
                            action="#"
                            list-type="picture-card"
                            :auto-upload="false"
                            :on-change="handleSkeletonImgChange"
                            :file-list="skeletonFileList"
                            multiple
                        >
                          <!-- 🔥 自定义文件列表项：支持设为主图、预览、删除 -->
                          <template #file="{ file }">
                            <div class="skeleton-file-item">
                              <img class="el-upload-list__item-thumbnail" :src="file.url" alt=""/>
                              <span class="el-upload-list__item-actions">
                               <span class="action-btn" @click="handleViewSkeleton(file)" title="在画布预览/裁剪">
                                 <el-icon><View/></el-icon>
                               </span>
                               <span class="action-btn" @click="handleSetMainFromSkeleton(file)" title="设为页面主图">
                                 <el-icon><Picture/></el-icon>
                               </span>
                               <span class="action-btn delete" @click="handleRemoveSkeleton(file)">
                                 <el-icon><Delete/></el-icon>
                               </span>
                             </span>
                            </div>
                          </template>
                          <el-icon>
                            <Plus/>
                          </el-icon>
                        </el-upload>
                      </div>
                      <el-button type="primary" plain style="width: 100%; margin-top: 10px"
                                 :disabled="skeletonFileList.length < 2"
                                 @click="trainSkeleton">
                        生成骨架蒙版
                      </el-button>
                    </div>
                  </ElTabPane>
                </ElTabs>
              </div>


              <!-- 详情模式 -->
              <div v-else class="detail-view">
                <div class="comp-preview-large"
                     :style="getThumbStyle(localData.interactions[selectedCompIndex], 280, 100)"></div>
                <!-- 🔥 画布底图切换 (全局) -->
                <div class="form-group" style="margin-bottom: 12px; padding: 0 2px;">
                  <el-select v-model="currentCanvasSource" size="small" style="width: 100%"
                             @change="handleCanvasSourceChange" placeholder="切换画布底图">
                    <template #prefix>
                      <el-icon>
                        <Picture/>
                      </el-icon>
                    </template>
                    <el-option label="主截图 (Main Screenshot)" value="main"/>
                    <el-option v-for="(file, idx) in skeletonFileList" :key="idx" :label="file.name" :value="idx"/>
                  </el-select>
                </div>

                <ElTabs v-model="activeTab" class="comp-tabs">
                  <ElTabPane label="基础属性" name="props">
                    <div class="form-group">
                      <div class="form-label">组件名称</div>
                      <el-input v-model="localData.interactions[selectedCompIndex].label" @input="updateNode"/>
                    </div>
                    <div class="form-group">
                      <div class="form-label">坐标区域</div>
                      <div class="coord-inputs-grid">
                        <div class="coord-item"><span>X</span>
                          <el-input v-model.number="localData.interactions[selectedCompIndex].x" type="number"
                                    @input="updateNode"/>
                        </div>
                        <div class="coord-item"><span>Y</span>
                          <el-input v-model.number="localData.interactions[selectedCompIndex].y" type="number"
                                    @input="updateNode"/>
                        </div>
                        <div class="coord-item"><span>W</span>
                          <el-input v-model.number="localData.interactions[selectedCompIndex].w" type="number"
                                    @input="updateNode"/>
                        </div>
                        <div class="coord-item"><span>H</span>
                          <el-input v-model.number="localData.interactions[selectedCompIndex].h" type="number"
                                    @input="updateNode"/>
                        </div>
                      </div>
                    </div>
                    <div class="form-group" style="margin-top: 20px">
                      <el-button type="danger" plain style="width: 100%" @click="deleteComp(selectedCompIndex)">
                        删除此组件
                      </el-button>

                      <!-- 🔥 2.1 组件骨架训练 (新增) -->
                      <div class="form-group" style="margin-top: 20px">
                        <el-collapse>
                          <el-collapse-item title="组件骨架配置 (Skeleton)" name="1">
                            <div style="margin-bottom: 10px">
                              <el-button size="small" :icon="Picture" @click="openComponentImageSelector">
                                从页面样本选择 ({{ compSkeletonFileList.length }})
                              </el-button>
                            </div>
                            <!-- 🔥 3. 移除 el-upload，改为展示已选图片列表 -->
                            <div class="selected-samples-grid" v-if="compSkeletonFileList.length > 0">
                              <div v-for="(file, idx) in compSkeletonFileList" :key="idx" class="sample-thumb-item">
                                <img :src="file.url" class="sample-img"/>
                                <div class="sample-actions">
                                  <el-icon class="remove-icon" @click="handleRemoveCompSkeletonImage(idx)">
                                    <Delete/>
                                  </el-icon>
                                </div>
                              </div>
                            </div>
                            <div v-else class="empty-samples-text">
                              暂未选择样本，请点击上方按钮从页面截图库中选择

                            </div>
                            <div v-if="localData.interactions[selectedCompIndex].skeleton_config?.mask_url"
                                 class="skeleton-preview-mini">
                              <span class="label">已生成蒙版:</span>
                              <img
                                  :src="getStateImageUrl(localData.interactions[selectedCompIndex].skeleton_config.mask_url)"
                                  class="mini-mask"/>
                            </div>
                            <el-button type="primary" plain size="small" style="width: 100%; margin-top: 10px"
                                       :disabled="compSkeletonFileList.length < 1"
                                       @click="trainComponentSkeleton">
                              生成组件骨架
                            </el-button>
                          </el-collapse-item>
                        </el-collapse>
                      </div>
                    </div>
                  </ElTabPane>

                  <ElTabPane label="多态 (States)" name="states">
                    <div v-for="(state, sIdx) in localData.interactions[selectedCompIndex].states" :key="sIdx"
                         class="state-card"
                         :class="{ active: selectedStateIndex === sIdx }"
                         @click="selectedStateIndex = sIdx">
                      <div class="state-header">
                        <span class="state-idx">#{{ sIdx + 1 }}</span>
                        <el-select v-model="state.state_type" size="small" style="width: 100px" @change="updateNode">
                          <el-option v-for="opt in stateTypeOptions" :key="opt.value" :label="opt.label"
                                     :value="opt.value"/>
                        </el-select>
                        <el-button link type="danger" :icon="Delete" @click="removeState(sIdx)"/>
                      </div>
                      <div class="state-body">
                        <!-- 🔥 1. 修改交互：点击图片切换预览，不再触发上传 -->
                        <div class="state-img-uploader" @click="handleStateImageClick(state)">
                          <img v-if="state.image_url" :src="getStateImageUrl(state.image_url)"
                               class="state-img-preview"/>
                          <img v-else-if="state.skeleton_config?.mask_url"
                               :src="getStateImageUrl(state.skeleton_config.mask_url)"
                               class="state-img-preview skeleton-result"/>

                          <div v-else class="upload-placeholder">
                            <el-icon>
                              <Picture/>
                            </el-icon>
                            <span>无图片</span>
                          </div>
                        </div>
                        <div class="state-fields">
                          <el-button size="small" link type="primary" @click="startCrop(selectedCompIndex, sIdx)">✂️
                            从画布裁剪
                          </el-button>
                          <div class="state-coords-row">
                            <div class="coord-mini"><span>X</span>
                              <el-input v-model.number="state.x" size="small" @input="updateNode"/>
                            </div>
                            <div class="coord-mini"><span>Y</span>
                              <el-input v-model.number="state.y" size="small" @input="updateNode"/>
                            </div>
                            <div class="coord-mini"><span>W</span>
                              <el-input v-model.number="state.w" size="small" @input="updateNode"/>
                            </div>
                            <div class="coord-mini"><span>H</span>
                              <el-input v-model.number="state.h" size="small" @input="updateNode"/>
                            </div>
                          </div>
                          <el-input v-model="state.description" size="small" placeholder="描述 (可选)"
                                    @input="updateNode"/>
                          <el-input v-model="state.attributes" type="textarea" :rows="2" size="small"
                                    placeholder='{"color": "red"}' @input="updateNode"/>
                        </div>
                      </div>
                      <!-- 🔥 2.2 状态骨架训练 (新增) -->
                      <div class="state-skeleton-row">
                        <div class="skeleton-label">状态骨架:</div>
                        <div class="mini-uploader">
                          <el-button size="small" :icon="Picture" @click="openImageSelector(sIdx)">
                            选择样本 ({{ (stateSelectedImages[sIdx] || []).length }})
                          </el-button>
                          <el-button size="small" type="primary" link @click="trainStateSkeleton(sIdx)"
                                     :disabled="!(stateSelectedImages[sIdx] && stateSelectedImages[sIdx].length > 0)">训练
                          </el-button>
                        </div>
                      </div>
                    </div>
                    <el-button class="add-state-btn" @click="addState" :icon="Plus" style="width: 100%">添加状态
                    </el-button>
                  </ElTabPane>
                </ElTabs>
              </div>
            </el-scrollbar>
          </el-aside>
        </el-container>
        <!-- 🔥 图片选择弹窗 -->
        <el-dialog v-model="showImageSelector" title="选择训练样本" width="600px" append-to-body>
          <div class="img-selector-grid">
            <div v-for="(file, idx) in selectorCandidateList" :key="idx"
                 class="img-select-item"
                 :class="{ selected: tempSelectedImageNames.includes(file.name) }"
                 @click="toggleImageSelection(file.name)">
              <img :src="file.url" class="select-thumb"/>
              <div class="select-overlay">
                <el-icon v-if="tempSelectedImageNames.includes(file.name)">
                  <Check/>
                </el-icon>
              </div>
              <div class="img-name">{{ file.name }}</div>
            </div>
          </div>
          <template #footer>
            <el-button @click="showImageSelector = false">取消</el-button>
            <el-button type="primary" @click="confirmImageSelection">确定 ({{
                tempSelectedImageNames.length
              }})
            </el-button>
          </template>
        </el-dialog>
      </el-container>
    </div>
  </div>
</template>

<script setup>
import {ref, reactive, computed, onMounted, onUnmounted, nextTick, onBeforeUpdate, watch} from 'vue'
import {
  ElMessage,
  ElContainer,
  ElHeader,
  ElMain,
  ElAside,
  ElButton,
  ElButtonGroup,
  ElInput,
  ElTag,
  ElIcon,
  ElEmpty,
  ElScrollbar,
  ElTabs,
  ElTabPane,
  ElUpload,
  ElSelect,
  ElOption,
  ElSwitch,
  ElCollapse,
  ElCollapseItem,
  ElCheckbox
} from 'element-plus'
import {
  ZoomIn,
  ZoomOut,
  FullScreen,
  Camera,
  Check,
  Close,
  Delete,
  Document,
  InfoFilled,
  ArrowLeft,
  Plus,
  Upload,
  View,
  Picture
} from '@element-plus/icons-vue'
import * as api from '@/api/appGraph'
import {wsUploadFile, wsGetFile} from '@/api/mWebSocket'
import {wsTrainSkeleton} from '@/api/wsAppGraph'

const props = defineProps({node: Object, graphId: [String, Number]})
const emit = defineEmits(['close', 'update'])

const localData = reactive({
  label: '',
  desc: '',
  screenshot: '',
  screenshotPath: '',
  interactions: [],
  naturalW: 0,
  naturalH: 0,
  skeletonMask: '', // 骨架蒙版 URL
  is_blocking: false,
  skeletonImages: [], // 🔥 新增：用于存储训练用的图片列表
  ignored_top: 0, // 🔥 7. 顶部忽略高度
  ignored_bottom: 0 // 🔥 7. 底部忽略高度
})
const ocrLoading = ref(false)
const selectedCompIndex = ref(-1)
const activeTab = ref('props')
const pageActiveTab = ref('list')
const uploadContext = ref(null)
const skeletonFileList = ref([])
const showSkeletonMask = ref(true)
const currentCanvasSource = ref('main')
const compSkeletonFileList = ref([])
const selectedStateIndex = ref(-1) // 🔥 2. 追踪当前选中的状态索引
const stateSelectedImages = ref({}) // Map: stateIndex -> [imageName1, imageName2...]
const showImageSelector = ref(false)
const currentSelectorStateIndex = ref(-1)
const tempSelectedImageNames = ref([])
const selectorCandidateList = ref([])
const selectorMode = ref('state') // 'state' | 'component'


// 🔥 预览相关
const previewImage = ref('') // 当前临时预览的图片 URL
const currentDisplayScreenshot = computed(() => previewImage.value || localData.screenshot)

// 🔥 新增：通用文件获取转 URL 方法
const getFileUrl = async (path) => {
  if (!path) return ''
  if (path.startsWith('data:') || path.startsWith('http')) return path

  try {
    const res = await wsGetFile(path)
    if (res.code === 200 && res.data) {
      const data = res.data
      if (data instanceof Blob) return URL.createObjectURL(data)
      if (data instanceof ArrayBuffer) return URL.createObjectURL(new Blob([data]))
      if (data.type === 'Buffer' && Array.isArray(data.data)) {
        return URL.createObjectURL(new Blob([new Uint8Array(data.data)]))
      }
      if (data.content && typeof data.content === 'string') {
        let rawStr = data.content
        if (!rawStr.startsWith('data:')) {
          let mime = 'image/png'
          if (path.endsWith('.jpg') || path.endsWith('.jpeg')) mime = 'image/jpeg'
          rawStr = `data:${mime};base64,${rawStr}`
        }
        return rawStr
      }
      if (typeof data === 'string') {
        return data.startsWith('data:') ? data : `data:image/png;base64,${data}`
      }
    }
  } catch (e) {
    console.error('Get file url failed', path, e)
  }
  return ''
}

const stateTypeOptions = [
  {label: 'Hover', value: 'hover'},
  {label: 'Pressed', value: 'pressed'},
  {label: 'Disabled', value: 'disabled'},
  {label: 'Checked', value: 'checked'},
  {label: 'Focused', value: 'focused'},
  {label: 'Custom', value: 'custom'}
]

// --- 截图预览逻辑 (移动到顶部以避免 ReferenceError) ---
const screenshotCache = ref({}) // path -> url

const loadOneScreenshot = async (path, retryCount = 0) => {
  if (!path) return
  if (screenshotCache.value[path]) return

  if (path.startsWith('data:') || path.startsWith('http')) {
    screenshotCache.value[path] = path
    return
  }

  const maxRetries = 3

  try {
    const res = await wsGetFile(path)
    console.log('Load screenshot result:', path, res)
    if (res.code === 200) {
      const data = res.data
      let url = ''
      if (data instanceof Blob) url = URL.createObjectURL(data)
      else if (data && typeof data === 'object' && data.content) {
        let rawStr = data.content
        if (!rawStr.startsWith('data:')) {
          let mime = 'image/png'
          if (data.name && (data.name.endsWith('.jpg') || data.name.endsWith('.jpeg'))) mime = 'image/jpeg'
          rawStr = `data:${mime};base64,${rawStr}`
        }
        url = rawStr
      } else if (typeof data === 'string') {
        url = data.startsWith('data:') ? data : `data:image/png;base64,${data}`
      }
      if (url) screenshotCache.value[path] = url
    } else if (retryCount < maxRetries) {
      // 🔥 失败重试逻辑
      console.log(`Load failed, retrying (${retryCount + 1}/${maxRetries})...`)
      setTimeout(() => loadOneScreenshot(path, retryCount + 1), 1000 * Math.pow(2, retryCount))
    }
  } catch (e) {
    // console.error('Failed to load screenshot in CustomNode', e)
  }
}


const fileInput = ref(null);
const imageRef = ref(null);
const visualPanelRef = ref(null)
const scale = ref(0.5)
const translate = ref({x: 40, y: 40})
const isPanning = ref(false);
const panStart = ref({x: 0, y: 0})
const isDrawing = ref(false);
const drawStart = ref({x: 0, y: 0});
const currentBox = ref(null)
const isCropping = ref(false);
const cropBox = ref(null);
const cropTargetState = ref(null)
const isDraggingSafeLine = ref(null) // 'top' | 'bottom'

// 列表滚动相关
const itemRefs = ref([])
const setItemRef = (el, index) => {
  if (el) itemRefs.value[index] = el
}
onBeforeUpdate(() => {
  itemRefs.value = []
})

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

const drawingBoxStyle = computed(() => currentBox.value ? {
  left: currentBox.value.x + 'px',
  top: currentBox.value.y + 'px',
  width: currentBox.value.w + 'px',
  height: currentBox.value.h + 'px'
} : {})

const cropBoxStyle = computed(() => cropBox.value ? {
  left: cropBox.value.x + 'px',
  top: cropBox.value.y + 'px',
  width: cropBox.value.w + 'px',
  height: cropBox.value.h + 'px'
} : {})

const triggerUpload = () => fileInput.value.click()

const triggerStateUpload = (cIndex, sIndex) => {
  uploadContext.value = {type: 'state', compIndex: cIndex, stateIndex: sIndex}
  fileInput.value.value = ''
  fileInput.value.click()
}

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
        const path = (res.data && typeof res.data === 'object' && res.data.path) ? res.data.path : res.data

        if (uploadContext.value?.type === 'state') {
          const {compIndex, stateIndex} = uploadContext.value
          localData.interactions[compIndex].states[stateIndex].image_url = path
          // 🔥 修复：手动缓存图片，确保立即显示
          if (path && base64) screenshotCache.value[path] = base64
          updateNode()
        } else {
          localData.screenshotPath = path
          localData.screenshot = base64 // Use base64 for immediate display
          // 2. Perform OCR
          await performOCR(localData.screenshotPath)
        }
      } else {
        ElMessage.error(res.msg || '上传失败')
        ocrLoading.value = false
      }
    } catch (e) {
      console.error(e)
      ElMessage.error('上传出错')
      ocrLoading.value = false
    }
    uploadContext.value = null
  }
  reader.readAsDataURL(file)
}

const performOCR = async (imageUrl) => {
  ocrLoading.value = true
  try {
    const results = await api.ocrRecognition(imageUrl)
    if (!localData.interactions) localData.interactions = []

    results["data"]["ocr_result"].forEach(item => {
      // 将 OCR 的 box (4个点) 转换为 bounding box (x, y, w, h)
      const xs = item.coordinates.box.map(p => p[0])
      const ys = item.coordinates.box.map(p => p[1])
      // 🔥 6. 强制整数坐标
      const x = Math.round(Math.min(...xs))
      const y = Math.round(Math.min(...ys))
      const w = Math.round(Math.max(...xs) - x)
      const h = Math.round(Math.max(...ys) - y)

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
  if (props.node.data) props.node.data.is_blocking = localData.is_blocking
  props.node.data.screenshot = localData.screenshotPath || localData.screenshot
  props.node.data.interactions = localData.interactions
  props.node.data.naturalSize = {w: localData.naturalW, h: localData.naturalH}
  // 🔥 7. 保存安全区域配置
  if (!props.node.data.skeleton_config) props.node.data.skeleton_config = {}
  props.node.data.skeleton_config.ignored_areas = {top: localData.ignored_top, bottom: localData.ignored_bottom}

  // 🔥 关键修复：将骨架蒙版同步回节点数据
  if (!props.node.data.skeleton_config) props.node.data.skeleton_config = {}
  // 🔥 优先存储 filename，同时兼容 mask_url
  props.node.data.skeleton_config.filename = localData.skeletonMask
  props.node.data.skeleton_config.mask_url = localData.skeletonMask
  props.node.data.skeleton_config.images = localData.skeletonImages // 🔥 保存图片列表
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
    translate.value = {x: newTx, y: newTy}
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

const getThumbStyle = (comp, boxW = 48, boxH = 32) => {
  if (!localData.screenshot || !localData.naturalW || !comp.w || !comp.h) {
    return {display: 'none'}
  }
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

// 获取状态图片的 URL (优先从缓存取，支持 base64 预览)
const getStateImageUrl = (path) => {
  if (!path) return ''
  // 🔥 修复：如果缓存里没有，绝对不要返回原始 path，否则浏览器会去请求 localhost/static/...
  // 除非 path 本身就是 data: 或 http 开头
  return screenshotCache.value[path] || (path.startsWith('data:') || path.startsWith('http') ? path : '')
}

const selectComp = (index) => {
  selectedCompIndex.value = index
  nextTick(() => {
    const el = itemRefs.value[index]
    if (el) {
      // 🔥 修复：将 'center' 改为 'nearest'
      // nearest 会自动判断方向，且只滚动最近的滚动父级（即 el-scrollbar）
      // 注意：在详情模式下列表被隐藏，这里可能需要判断视图状态，但保持逻辑无害
      el.scrollIntoView({behavior: 'smooth', block: 'nearest'})
    }
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
  panStart.value = {x: e.clientX - translate.value.x, y: e.clientY - translate.value.y}
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

  // 🔥 7. 安全区域拖拽逻辑
  if (isDraggingSafeLine.value) {
    e.preventDefault()
    // 逻辑在 MouseMove 中处理，这里只是占位防止冲突
    return
  }
  // 3. 裁剪逻辑 (复用绘制交互)
  if (isCropping.value && e.button === 0) {
    e.preventDefault()
    isDrawing.value = true // 复用 isDrawing 状态来追踪鼠标移动
    drawStart.value = getRelativePos(e)
    cropBox.value = {...drawStart.value, w: 0, h: 0}
    return
  }

  // 2. 绘制逻辑：Command/Ctrl + 左键
  if (e.button === 0 && (e.metaKey || e.ctrlKey)) {
    e.preventDefault()
    isDrawing.value = true;
    selectedCompIndex.value = -1;
    drawStart.value = getRelativePos(e);
    currentBox.value = {...drawStart.value, w: 0, h: 0}
  }
}

const handleCanvasMouseMove = (e) => {
  if (isPanning.value) {
    translate.value.x = e.clientX - panStart.value.x;
    translate.value.y = e.clientY - panStart.value.y;
    return
  }
  // 🔥 7. 安全区域拖拽更新
  if (isDraggingSafeLine.value) {
    const pos = getRelativePos(e)
    const y = Math.max(0, Math.round(pos.y)) // 6. 整数

    if (isDraggingSafeLine.value === 'top') {
      localData.ignored_top = Math.min(y, localData.naturalH - localData.ignored_bottom - 10)
    } else {
      // Bottom 是从底部往上的距离
      const bottomY = localData.naturalH - y
      localData.ignored_bottom = Math.max(0, Math.min(bottomY, localData.naturalH - localData.ignored_top - 10))
    }
    return
  }

  if (!isDrawing.value) return;

  const pos = getRelativePos(e);
  const w = pos.x - drawStart.value.x;
  const h = pos.y - drawStart.value.y;

  if (isCropping.value) {
    cropBox.value = {
      x: Math.round(w > 0 ? drawStart.value.x : pos.x),
      y: Math.round(h > 0 ? drawStart.value.y : pos.y),
      w: Math.round(Math.abs(w)),
      h: Math.round(Math.abs(h))
    }
    return
  }

  currentBox.value = {
    x: Math.round(w > 0 ? drawStart.value.x : pos.x),
    y: Math.round(h > 0 ? drawStart.value.y : pos.y),
    w: Math.round(Math.abs(w)),
    h: Math.round(Math.abs(h))
  }
}

const handleCanvasMouseUp = () => {
  isPanning.value = false;
  isDrawing.value = false;
  if (isDraggingSafeLine.value) {
    isDraggingSafeLine.value = null
    updateNode() // 拖拽结束保存
    return
  }
  if (isCropping.value) {
    // 裁剪模式下，松开鼠标只停止绘制，等待用户确认
    return
  }

  if (currentBox.value && currentBox.value.w > 5 && currentBox.value.h > 5) {
    if (!localData.interactions) localData.interactions = []
    localData.interactions.push({label: 'New Area', ...currentBox.value});
    selectedCompIndex.value = localData.interactions.length - 1
    updateNode()
  }
  currentBox.value = null
}
const startDragSafeLine = (type, e) => {
  isDraggingSafeLine.value = type
  e.preventDefault()
}

const deleteComp = (i) => {
  localData.interactions.splice(i, 1);
  selectedCompIndex.value = -1
  updateNode()
}

const addState = () => {
  const comp = localData.interactions[selectedCompIndex.value]
  if (!comp.states) comp.states = []
  comp.states.push({
    state_type: 'custom',
    image_url: '',
    attributes: '{}',
    skeleton_config: {},
    description: '',
    x: comp.x,
    y: comp.y,
    w: comp.w,
    h: comp.h
  })
  updateNode()
}

const removeState = (sIndex) => {
  const comp = localData.interactions[selectedCompIndex.value]
  comp.states.splice(sIndex, 1)
  updateNode()
}

// --- 裁剪逻辑 ---
const startCrop = (cIndex, sIndex) => {
  isCropping.value = true
  cropTargetState.value = {cIndex, sIndex}
  // 默认选中当前组件区域
  const comp = localData.interactions[cIndex]
  const state = comp.states[sIndex]
  if (state.w && state.h) {
    cropBox.value = {x: state.x, y: state.y, w: state.w, h: state.h}
  } else {
    cropBox.value = {x: comp.x, y: comp.y, w: comp.w, h: comp.h}
  }
  ElMessage.info('请在画布上调整裁剪区域，然后点击确认')
}

const cancelCrop = () => {
  isCropping.value = false
  cropBox.value = null
  cropTargetState.value = null
}

const confirmCrop = () => {
  if (!cropBox.value || !currentDisplayScreenshot.value) return

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  const img = new Image()
  img.crossOrigin = "Anonymous"
  img.src = currentDisplayScreenshot.value
  img.onload = async () => {
    canvas.width = cropBox.value.w
    canvas.height = cropBox.value.h
    ctx.drawImage(img, cropBox.value.x, cropBox.value.y, cropBox.value.w, cropBox.value.h, 0, 0, cropBox.value.w, cropBox.value.h)

    const base64 = canvas.toDataURL('image/png')
    // 上传裁剪后的图片
    try {
      const res = await wsUploadFile(`crop_${Date.now()}.png`, base64)
      if (res.code === 200) {
        const path = (res.data && typeof res.data === 'object' && res.data.path) ? res.data.path : res.data
        const {cIndex, sIndex} = cropTargetState.value
        localData.interactions[cIndex].states[sIndex].image_url = path
        // 🔥 更新状态坐标为裁剪框坐标
        localData.interactions[cIndex].states[sIndex].x = cropBox.value.x
        localData.interactions[cIndex].states[sIndex].y = cropBox.value.y
        localData.interactions[cIndex].states[sIndex].w = cropBox.value.w
        localData.interactions[cIndex].states[sIndex].h = cropBox.value.h

        screenshotCache.value[path] = base64
        updateNode()
        ElMessage.success('裁剪并上传成功')
      }
    } catch (e) {
      ElMessage.error('上传裁剪图失败')
    }

    cancelCrop()
  }
}

// --- 骨架训练逻辑 ---
const handleSkeletonImgChange = (uploadFile, uploadFiles) => {
  skeletonFileList.value = uploadFiles
}

const handleRemoveSkeleton = (file) => {
  const idx = skeletonFileList.value.indexOf(file)
  if (idx > -1) skeletonFileList.value.splice(idx, 1)
}

// 🔥 预览骨架图片（不改变节点数据，仅改变画布显示）
const handleViewSkeleton = async (file) => {
  if (!file.url) {
    file.url = await getFileUrl(file.name)
  }
  previewImage.value = file.url
  // 切换到预览图时，自动适应屏幕
  nextTick(() => fitToScreen())
}

const exitPreview = () => {
  previewImage.value = ''
  nextTick(() => fitToScreen())
}

// 🔥 将骨架图片设为主图
const handleSetMainFromSkeleton = async (file) => {
  let url = file.url
  if (!url) url = await getFileUrl(file.name)

  // 如果是本地 Blob URL，尝试读取为 Base64 (为了保存)
  // 如果是远程 URL (http/static)，直接用
  if (url.startsWith('blob:')) {
    // 这里简化处理：如果是 blob，说明是刚上传的 File 对象，file.raw 存在
    if (file.raw) {
      const reader = new FileReader()
      reader.onload = (e) => {
        localData.screenshot = e.target.result
        localData.screenshotPath = '' // 清空 path，保存时会触发 base64 保存逻辑
        previewImage.value = '' // 退出预览模式
        updateNode()
      }
      reader.readAsDataURL(file.raw)
      return
    }
  }

  // 如果是远程文件或已有路径
  localData.screenshot = url
  localData.screenshotPath = file.name // 假设 name 是 path 或 filename
  previewImage.value = ''
  updateNode()
}

const setPreviewAsMain = () => {
  if (previewImage.value) {
    localData.screenshot = previewImage.value
    // 尝试从 skeletonFileList 中找到对应的 file 对象以获取 path
    const file = skeletonFileList.value.find(f => f.url === previewImage.value)
    if (file) {
      localData.screenshotPath = file.name
    }
    previewImage.value = ''
    updateNode()
  }
}

// 🔥 切换画布底图
const handleCanvasSourceChange = async (val) => {
  if (val === 'main') {
    previewImage.value = ''
  } else {
    const file = skeletonFileList.value[val]
    if (file) {
      if (!file.url) {
        file.url = await getFileUrl(file.name)
      }
      previewImage.value = file.url
    }
  }
  nextTick(() => fitToScreen())
}

// 监听 previewImage 变化同步下拉框状态
watch(previewImage, (newVal) => {
  if (!newVal) {
    currentCanvasSource.value = 'main'
  } else {
    const idx = skeletonFileList.value.findIndex(f => f.url === newVal)
    if (idx !== -1) currentCanvasSource.value = idx
  }
})

// 🔥 新增：切换 Tab 时加载骨架训练图片
const loadSkeletonImages = async () => {
  if (!skeletonFileList.value.length) return

  for (const file of skeletonFileList.value) {
    // 如果没有 URL 或者 URL 不是 blob/data (即不是本地预览也不是已加载的)，则请求
    if (!file.url || (!file.url.startsWith('blob:') && !file.url.startsWith('data:'))) {
      const url = await getFileUrl(file.name)
      if (url) file.url = url
    }
  }
}

watch(pageActiveTab, (val) => {
  if (val === 'config') loadSkeletonImages()
})
// 监听组件选择，加载对应的骨架文件列表
watch(selectedCompIndex, (newVal) => {
  if (newVal !== -1) {
    const comp = localData.interactions[newVal]
    const images = comp.skeleton_config?.images || []
    // 🔥 标记为 success 以便 uploadFilesList 知道无需重复上传
    compSkeletonFileList.value = images.map(name => ({name, url: '', status: 'success'}))
    stateSelectedImages.value = {}
    if (comp.states) {
      comp.states.forEach((s, i) => {
        const sImages = s.skeleton_config?.images || []
        stateSelectedImages.value[i] = sImages || []
      })
    }
  }
})

const trainSkeleton = async () => {
  if (skeletonFileList.value.length < 2) return

  // 1. 上传所有样本图片
  const uploadedNames = []
  for (const file of skeletonFileList.value) {
    const reader = new FileReader()
    const p = new Promise((resolve) => {
      reader.onload = async (e) => {
        console.log('Uploading skeleton sample:', file.name)
        const res = await wsUploadFile(file.name, e.target.result)
        if (res.code === 200) {
          const path = (res.data && typeof res.data === 'object' && res.data.path) ? res.data.path : res.data
          // 假设后端 train_skeleton 接收的是文件名列表
          const filename = path.split(/[/\\]/).pop()
          console.log('Uploaded success:', filename)
          resolve(filename)
        } else {
          console.error('Upload failed:', res)
          resolve(null)
        }
      }
    })
    reader.readAsDataURL(file.raw)
    const name = await p
    if (name) uploadedNames.push(name)
  }

  console.log('All samples uploaded, starting training with:', uploadedNames)

  // 2. 调用训练接口
  try {
    const res = await wsTrainSkeleton({
      graph_id: props.graphId,
      node_id: props.node.id,
      image_names: uploadedNames,
      threshold: 10
    })
    console.log('Train response:', res)
    if (res.code === 200 && res.data) {
      localData.skeletonImages = res.data.images || uploadedNames // 🔥 优先使用后端返回的 images 列表
      localData.skeletonMask = res.data.filename || res.data.url || res.data.path // 🔥 优先使用 filename
      // 🔥 关键修复：立即加载骨架图内容，以便在画布上显示
      await loadOneScreenshot(localData.skeletonMask)

      ElMessage.success('骨架生成成功')
      // 🔥 关键修复：生成后立即触发更新，确保 mask 被保存
      updateNode()
    } else {
      ElMessage.error(res.msg || '训练失败')
    }
  } catch (e) {
    console.error('Train request error:', e)
    ElMessage.error('训练请求异常')
  }
}
// 🔥 1. 实现点击状态图片切换画布预览
const handleStateImageClick = async (state) => {
  if (!state.image_url) {
    ElMessage.warning('该状态暂无图片')
    return
  }

  let url = getStateImageUrl(state.image_url)
  // 如果缓存中没有（非 http/data 开头），尝试加载
  if (!url) {
    await loadOneScreenshot(state.image_url)
    url = getStateImageUrl(state.image_url)
  }

  if (url) {
    previewImage.value = url
    ElMessage.success(`已切换预览: ${state.state_type}`)
    nextTick(() => fitToScreen())
  } else {
    ElMessage.error('无法加载图片')
  }
}
// --- 组件/状态骨架训练逻辑 ---
const handleRemoveCompSkeletonImage = (idx) => {
  compSkeletonFileList.value.splice(idx, 1)
}

const openComponentImageSelector = async () => {
  if (skeletonFileList.value.length === 0) {
    ElMessage.warning('页面骨架配置中暂无图片，请先在"骨架与配置"页签上传')
    return
  }
  // 加载缩略图
  for (const file of skeletonFileList.value) {
    if (!file.url) file.url = await getFileUrl(file.name)
  }

  selectorCandidateList.value = skeletonFileList.value
  selectorMode.value = 'component'
  // 预选已有的
  tempSelectedImageNames.value = compSkeletonFileList.value.map(f => f.name)
  showImageSelector.value = true
}

const openImageSelector = async (sIdx) => {
  if (compSkeletonFileList.value.length === 0) {
    ElMessage.warning('请先在"基础属性"页签的"组件骨架配置"中上传图片')
    return
  }

  // 加载缩略图以便预览
  for (const file of compSkeletonFileList.value) {
    if (!file.url) file.url = await getFileUrl(file.name)
  }

  selectorCandidateList.value = compSkeletonFileList.value
  selectorMode.value = 'state'
  currentSelectorStateIndex.value = sIdx
  tempSelectedImageNames.value = [...(stateSelectedImages.value[sIdx] || [])]
  showImageSelector.value = true
}

const toggleImageSelection = (name) => {
  const idx = tempSelectedImageNames.value.indexOf(name)
  if (idx > -1) tempSelectedImageNames.value.splice(idx, 1)
  else tempSelectedImageNames.value.push(name)
}

const confirmImageSelection = () => {
  if (selectorMode.value === 'state') {
    stateSelectedImages.value[currentSelectorStateIndex.value] = [...tempSelectedImageNames.value]
  } else {
    // Component Mode: 同步选择到 compSkeletonFileList
    const newFiles = []
    const currentNames = compSkeletonFileList.value.map(f => f.name)

    // 1. 保留已存在且仍被选中的
    compSkeletonFileList.value.forEach(f => {
      if (tempSelectedImageNames.value.includes(f.name)) {
        newFiles.push(f)
      }
    })

    // 2. 添加新选中的 (从 selectorCandidateList 中查找信息)
    tempSelectedImageNames.value.forEach(name => {
      if (!currentNames.includes(name)) {
        const candidate = selectorCandidateList.value.find(c => c.name === name)
        if (candidate) {
          newFiles.push({
            name: candidate.name,
            url: candidate.url,
            status: 'success', // 页面样本通常已上传
            uid: candidate.uid || Date.now() + Math.random()
          })
        }
      }
    })
    compSkeletonFileList.value = newFiles
  }
  showImageSelector.value = false
}

const uploadFilesList = async (fileList) => {
  const uploadedNames = []
  for (const file of fileList) {
    if (file.status === 'success' && file.name && !file.raw) {
      uploadedNames.push(file.name)
      continue
    }
    const reader = new FileReader()
    const p = new Promise((resolve) => {
      reader.onload = async (e) => {
        const res = await wsUploadFile(file.name, e.target.result)
        if (res.code === 200) {
          const path = (res.data && typeof res.data === 'object' && res.data.path) ? res.data.path : res.data
          const filename = path.split(/[/\\]/).pop()
          resolve(filename)
        } else {
          resolve(null)
        }
      }
    })
    reader.readAsDataURL(file.raw || file)
    const name = await p
    if (name) uploadedNames.push(name)
  }
  return uploadedNames
}
const trainComponentSkeleton = async () => {
  const comp = localData.interactions[selectedCompIndex.value]
  if (!comp) return
  const names = await uploadFilesList(compSkeletonFileList.value)

  const res = await wsTrainSkeleton({
    component_id: comp.uid || comp.id,
    image_names: names,
    threshold: 10
  })

  if (res.code === 200 && res.data) {
    comp.skeleton_config = {
      mask_url: res.data.filename || res.data.url || res.data.path,
      images: res.data.images || names
    }
    ElMessage.success('组件骨架生成成功')
    updateNode()
  } else {
    ElMessage.error(res.msg || '训练失败')
  }
}
const trainStateSkeleton = async (sIdx) => {
  const comp = localData.interactions[selectedCompIndex.value]
  const state = comp.states[sIdx]
  const names = stateSelectedImages.value[sIdx] || []
  if (names.length === 0) return

  // 🔥 确保选中的图片已上传 (针对刚添加到组件列表但未点击生成的图片)
  const filesToUpload = compSkeletonFileList.value.filter(f => names.includes(f.name))
  await uploadFilesList(filesToUpload)

  const res = await wsTrainSkeleton({
    component_id: comp.uid || comp.id,
    state_type: state.state_type,
    image_names: names,
    threshold: 10,
    ignored_areas: [localData.ignored_top, localData.ignored_bottom] // 🔥 7. 传递安全区域
  })

  if (res.code === 200 && res.data) {
    state.skeleton_config = {
      mask_url: res.data.filename || res.data.url || res.data.path,
      images: res.data.images || names
    };
    ElMessage.success(`状态 ${state.state_type} 骨架生成成功`)
    updateNode()
  } else {
    ElMessage.error(res.msg || '训练失败')
  }
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
// 如果在多态 Tab 且选中了某个状态，则移动状态的坐标
  let target = comp
  if (activeTab.value === 'states' && selectedStateIndex.value !== -1 && comp.states && comp.states[selectedStateIndex.value]) {
    target = comp.states[selectedStateIndex.value]
  }
  let handled = false
  if (e.key === 'ArrowUp') {
    target.y -= 1;
    handled = true
  } else if (e.key === 'ArrowDown') {
    target.y += 1;
    handled = true
  } else if (e.key === 'ArrowLeft') {
    target.x -= 1;
    handled = true
  } else if (e.key === 'ArrowRight') {
    target.x += 1;
    handled = true
  }

  if (handled) {
    e.preventDefault()
    updateNode()
  }
}

onMounted(async () => {
  if (props.node) {
    localData.label = props.node.label
    localData.desc = props.node.desc || props.node.data?.desc || ''

    // 初始化阻断状态
    localData.is_blocking = props.node.data?.is_blocking || false

    // 🔥 7. 加载安全区域配置
    const ignored = props.node.data?.skeleton_config?.ignored_areas || {}
    localData.ignored_top = ignored.top || 0
    localData.ignored_bottom = ignored.bottom || 0

    // 🔥 关键修复：加载已保存的骨架蒙版
    localData.skeletonMask = props.node.data?.skeleton_config?.filename || props.node.data?.skeleton_config?.mask_url || ''

    // 🔥 关键修复：如果存在骨架蒙版，加载其内容
    if (localData.skeletonMask) loadOneScreenshot(localData.skeletonMask)

    // 🔥 关键修复：回显已上传的训练图片
    const savedImages = props.node.data?.skeleton_config?.images || []
    localData.skeletonImages = savedImages
    skeletonFileList.value = savedImages.map(name => ({name: name, url: ''})) // URL 留空，切换 Tab 时懒加载


    // 🔥 修复：安全地获取截图路径字符串，防止因数据为对象而崩溃
    const screenshotData = props.node.data.screenshot
    let path = ''
    if (screenshotData && typeof screenshotData === 'object') {
      path = screenshotData.path || screenshotData.url || ''
    } else if (typeof screenshotData === 'string') {
      path = screenshotData
    }
    localData.screenshotPath = path

    // 🔥 修复：如果已经是 Base64 或 HTTP URL，直接显示，无需请求后端
    if (path && (String(path).startsWith('data:') || String(path).startsWith('http'))) {
      localData.screenshot = path
    }
    // 否则尝试通过 WebSocket 获取文件内容
    else if (path) {
      try {
        const res = await wsGetFile(path)
        if (res.code === 200) {
          // 🔥 修复：处理 raw base64，补全前缀
          const data = res.data
          if (data && typeof data === 'object') {
            // 处理二进制对象
            if (data instanceof Blob) localData.screenshot = URL.createObjectURL(data)
            else if (data instanceof ArrayBuffer) localData.screenshot = URL.createObjectURL(new Blob([data]))
            else if (data.type === 'Buffer' && Array.isArray(data.data)) {
              const u8 = new Uint8Array(data.data)
              localData.screenshot = URL.createObjectURL(new Blob([u8]))
            } else if (data.content && typeof data.content === 'string') {
              // 🔥 新增：处理 { name, content } 结构
              let rawStr = data.content
              if (!rawStr.startsWith('data:')) {
                let mime = 'image/png'
                if (data.name) {
                  const ext = data.name.split('.').pop().toLowerCase()
                  if (ext === 'jpg' || ext === 'jpeg') mime = 'image/jpeg'
                }
                rawStr = `data:${mime};base64,${rawStr}`
              }
              localData.screenshot = rawStr
            }
          } else if (typeof data === 'string') {
            if (data && !data.startsWith('data:')) {
              const ext = path.split('.').pop().toLowerCase()
              const mime = (ext === 'jpg' || ext === 'jpeg') ? 'image/jpeg' : 'image/png'
              localData.screenshot = `data:${mime};base64,${data}`
            } else {
              localData.screenshot = data
            }
          }
        }
      } catch (e) {
        console.error('Failed to load image via WS', e)
      }
    } else {
      localData.screenshot = path
    }

    localData.interactions = JSON.parse(JSON.stringify(props.node.data.interactions || [])).map(i => ({
      ...i,
      skeleton_config: i.skeleton_config || {},
      states: (i.states || []).map(s => ({
        ...s,
        skeleton_config: s.skeleton_config || {},
        x: s.x !== undefined ? s.x : i.x,
        y: s.y !== undefined ? s.y : i.y,
        w: s.w !== undefined ? s.w : i.w,
        h: s.h !== undefined ? s.h : i.h
      }))
    }))

    // 🔥 修复：预加载所有状态图片的缓存
    localData.interactions.forEach(comp => {
      if (comp.states) {
        comp.states.forEach(s => {
          if (s.image_url) loadOneScreenshot(s.image_url)
        })
      }
    })

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
  if (localData.screenshot && localData.screenshot.startsWith('blob:')) {
    URL.revokeObjectURL(localData.screenshot)
  }
})
</script>

<style scoped>
.saas-header.blocking-header {
  background: #fef2f2; /* 红色背景警示 */
  border-bottom-color: #fee2e2;
}

.saas-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding-top: 40px;
}

.saas-window {
  width: 95vw;
  height: 90vh;
  background: #fff;
  border-radius: 12px;
  overflow: hidden !important;;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.2);
  border: 1px solid #e2e8f0;
}

.h-full {
  height: 100%;
}

.saas-header {
  background: white;
  border-bottom: 1px solid #e2e8f0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
}

.header-left, .header-center, .header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-center {
  flex: 1;
  justify-content: center;
}

.saas-input-title {
  width: 200px;
}

:deep(.saas-input-title .el-input__wrapper) {
  box-shadow: none !important;
  background: transparent;
}

:deep(.saas-input-title .el-input__inner) {
  font-size: 16px;
  font-weight: 600;
  color: #1e293b;
}

.saas-input-desc {
  width: 180px;
  margin-left: 8px;
}

:deep(.saas-input-desc .el-input__wrapper) {
  box-shadow: none !important;
  background: transparent;
}

:deep(.saas-input-desc .el-input__inner) {
  font-size: 13px;
  color: #64748b;
}

.zoom-label {
  font-size: 12px;
  color: #64748b;
  margin-left: 4px;
  min-width: 40px;
  text-align: center;
}

.editor-body {
  overflow: hidden !important;
  height: calc(100% - 60px);
}

.visual-container {
  flex: 1;
  background: #e2e8f0;
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  padding: 0;
}

.canvas-wrapper {
  flex: 1;
  overflow: hidden;
  cursor: grab;
  position: relative;
}

.transform-layer {
  transform-origin: 0 0;
}

.artboard {
  position: relative;
  background: white;
}

.base-img {
  display: block;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.empty-artboard {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #94a3b8;
}

.hotspot-box {
  position: absolute;
  border: 1px solid #6366f1;
  background: rgba(99, 102, 241, 0.1);
  z-index: 10;
  cursor: pointer;
  box-sizing: border-box;
}

.hotspot-box.selected {
  border-color: #ef4444;
  background: rgba(239, 68, 68, 0.15);
  z-index: 20;
}

.label-tag {
  position: absolute;
  top: -22px;
  left: -2px;
  background: #6366f1;
  color: white;
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.drawing-box {
  position: absolute;
  border: 1px dashed #6366f1;
  background: rgba(99, 102, 241, 0.1);
  pointer-events: none;
  z-index: 30;
}

.props-sidebar {
  background: white;
  border-left: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
  z-index: 20;
  overflow: hidden;
}

.sidebar-header {
  height: 50px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  border-bottom: 1px solid #f1f5f9;
}

.header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.sidebar-header .title {
  font-size: 14px;
  font-weight: 600;
  color: #1e293b;
  margin-left: 4px;
}

.list-content {
  flex: 1;
  padding: 12px;
}

.comp-card {
  display: flex;
  align-items: center;
  padding: 10px;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  margin-bottom: 8px;
  cursor: pointer;
  position: relative;
  transition: all 0.2s;
}

.comp-card:hover {
  border-color: #6366f1;
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.08);
  transform: translateY(-1px);
}

.comp-card.active {
  border-color: #6366f1;
  background: #eff6ff;
}

.card-left {
  display: flex;
  align-items: center;
  margin-right: 10px;
}

.index-circle {
  width: 24px;
  height: 24px;
  background: #f1f5f9;
  color: #64748b;
  font-size: 11px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  margin-right: 8px;
  flex-shrink: 0;
}

.comp-thumbnail {
  background-color: #e2e8f0;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  background-repeat: no-repeat;
  flex-shrink: 0;
}

.comp-label-text {
  font-size: 13px;
  font-weight: 500;
  color: #334155;
  margin-bottom: 2px;
}

.comp-meta-text {
  font-size: 11px;
  color: #94a3b8;
  font-family: monospace;
}

.comp-card.active .index-circle {
  background: #6366f1;
  color: white;
}

:deep(.comp-name-edit .el-input__wrapper) {
  box-shadow: none;
  padding: 0;
}

.meta-row {
  display: flex;
  gap: 6px;
  margin-top: 4px;
}

.coord-inputs {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.coord-inputs-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.coord-item {
  display: flex;
  align-items: center;
  gap: 2px;
  font-size: 10px;
  color: #909399;
}

.coord-input {
  width: 42px;
}

:deep(.coord-input .el-input__inner) {
  padding: 0 2px;
  text-align: center;
  height: 20px;
  line-height: 20px;
  font-size: 11px;
}

:deep(.coord-input .el-input__wrapper) {
  padding: 0;
  min-height: 20px;
  box-shadow: none;
  background: #f8fafc;
}

.delete-btn {
  position: absolute;
  right: 8px;
  top: 8px;
  opacity: 0;
}

.comp-card:hover .delete-btn {
  opacity: 1;
}

.btn-icon-close {
  font-size: 20px;
  color: #94a3b8;
}

.canvas-tip {
  position: absolute;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 100;
  pointer-events: none;
}

.detail-view {
  padding: 0 4px;
}

.comp-preview-large {
  width: 100%;
  height: 100px;
  background-color: #f1f5f9;
  border-radius: 8px;
  margin-bottom: 16px;
  border: 1px solid #e2e8f0;
}

.form-group {
  margin-bottom: 16px;
}

.form-label {
  font-size: 12px;
  color: #64748b;
  margin-bottom: 6px;
  font-weight: 500;
}

.state-card {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 10px;
  margin-bottom: 10px;
}

.state-card.active {
  border-color: #6366f1;
  background: #eff6ff;
}

.state-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.state-idx {
  font-size: 12px;
  font-weight: 700;
  color: #94a3b8;
}

.state-body {
  display: flex;
  gap: 10px;
}

.state-img-uploader {
  width: 60px;
  height: 60px;
  border: 1px dashed #cbd5e1;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  background: white;
  overflow: hidden;
  flex-shrink: 0;
}

.state-img-uploader:hover {
  border-color: #6366f1;
  color: #6366f1;
}

.state-img-preview {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.upload-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  font-size: 10px;
  color: #94a3b8;
  gap: 2px;
}

.state-fields {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 8px;
}

.skeleton-uploader {
  border: 1px dashed #e2e8f0;
  padding: 10px;
  border-radius: 8px;
  background: #f8fafc;
}

/* 🔥 7. 安全区域样式 */
.safe-area-overlay {
  position: absolute;
  left: 0;
  width: 100%;
  background: rgba(255, 0, 0, 0.15);
  border-bottom: 1px dashed rgba(255, 0, 0, 0.5);
  pointer-events: none;
  z-index: 50;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.safe-area-overlay.top {
  top: 0;
  border-bottom: 2px solid rgba(255, 0, 0, 0.4);
}

.safe-area-overlay.bottom {
  bottom: 0;
  border-top: 2px solid rgba(255, 0, 0, 0.4);
  border-bottom: none;
  align-items: flex-start;
}

.safe-area-label {
  font-size: 10px;
  color: red;
  background: rgba(255, 255, 255, 0.8);
  padding: 0 4px;
  pointer-events: none;
}

.safe-area-handle {
  position: absolute;
  left: 0;
  width: 100%;
  height: 10px;
  cursor: ns-resize;
  pointer-events: auto;
}

.safe-area-overlay.top .safe-area-handle {
  bottom: -5px;
}

.safe-area-overlay.bottom .safe-area-handle {
  top: -5px;
}


/* 自定义骨架文件列表样式 */
.skeleton-file-item {
  width: 100%;
  height: 100%;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.skeleton-file-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.el-upload-list__item-actions {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  opacity: 0;
  transition: opacity 0.2s;
}

.skeleton-file-item:hover .el-upload-list__item-actions {
  opacity: 1;
}

.action-btn {
  color: white;
  cursor: pointer;
  font-size: 18px;
}

.action-btn:hover {
  color: #6366f1;
}

.action-btn.delete:hover {
  color: #ef4444;
}

.preview-banner {
  position: absolute;
  top: 10px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 100;
  background: rgba(0, 0, 0, 0.7);
  color: white;
  padding: 4px 12px;
  border-radius: 20px;
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
}

.main-screenshot-uploader {
  width: 100%;
  height: 160px;
  border: 1px dashed #cbd5e1;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  background: #f8fafc;
  overflow: hidden;
  position: relative;
  transition: all 0.2s;
}

.main-screenshot-uploader:hover {
  border-color: #6366f1;
}

.main-screenshot-uploader .preview-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: #e2e8f0;
}

.main-screenshot-uploader .upload-icon {
  font-size: 24px;
  margin-bottom: 8px;
}

.reupload-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.2s;
  color: white;
  font-size: 24px;
}

.main-screenshot-uploader:hover .reupload-overlay {
  opacity: 1;
}

.uploader-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  color: #6366f1;
  font-size: 13px;
}

.skeleton-mask {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  opacity: 0.6;
  mix-blend-mode: multiply;
}

.crop-box {
  position: absolute;
  border: 2px solid #10b981;
  background: rgba(16, 185, 129, 0.1);
  z-index: 50;
  cursor: move;
}

.crop-actions {
  position: absolute;
  bottom: -40px;
  left: 0;
  display: flex;
  gap: 8px;
  background: white;
  padding: 4px 8px;
  border-radius: 4px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.state-coords-row {
  display: flex;
  gap: 4px;
  margin-bottom: 4px;
}

.coord-mini {
  display: flex;
  align-items: center;
  gap: 2px;
  font-size: 10px;
  color: #909399;
  flex: 1;
}

.coord-mini span {
  min-width: 8px;
}

:deep(.coord-mini .el-input__inner) {
  padding: 0 2px;
  text-align: center;
  height: 20px;
  line-height: 20px;
  font-size: 10px;
}

:deep(.coord-mini .el-input__wrapper) {
  padding: 0;
  min-height: 20px;
  box-shadow: none;
  background: #fff;
  border: 1px solid #e2e8f0;
}

.skeleton-preview-mini {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  background: #f8fafc;
  padding: 4px;
  border-radius: 4px;
}

.skeleton-preview-mini .label {
  font-size: 11px;
  color: #64748b;
}

.mini-mask {
  width: 32px;
  height: 32px;
  object-fit: contain;
  border: 1px solid #e2e8f0;
  background: white;
}

.state-skeleton-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px dashed #e2e8f0;
}

.skeleton-label {
  font-size: 11px;
  color: #94a3b8;
}

.mini-uploader {
  display: flex;
  gap: 8px;
  align-items: center;
}

.img-selector-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  gap: 12px;
  max-height: 400px;
  overflow-y: auto;
  padding: 4px;
}

.img-select-item {
  position: relative;
  aspect-ratio: 1;
  border: 2px solid #e2e8f0;
  border-radius: 6px;
  cursor: pointer;
  overflow: hidden;
}

.img-select-item.selected {
  border-color: #6366f1;
}

.select-thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.select-overlay {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 20px;
  height: 20px;
  background: rgba(255, 255, 255, 0.8);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.2s;
}

.img-select-item.selected .select-overlay {
  opacity: 1;
  background: #6366f1;
  color: white;
}

.img-select-item:hover .select-overlay {
  opacity: 1;
}

.img-name {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: rgba(0, 0, 0, 0.6);
  color: white;
  font-size: 10px;
  padding: 2px 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 组件骨架样本列表 */
.selected-samples-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(60px, 1fr));
  gap: 8px;
  margin-top: 8px;
}

.sample-thumb-item {
  position: relative;
  aspect-ratio: 1;
  border-radius: 4px;
  overflow: hidden;
  border: 1px solid #e2e8f0;
}

.sample-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.sample-actions {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.2s;
}

.sample-thumb-item:hover .sample-actions {
  opacity: 1;
}

.remove-icon {
  color: white;
  cursor: pointer;
  font-size: 16px;
}

.remove-icon:hover {
  color: #ef4444;
}

.empty-samples-text {
  font-size: 11px;
  color: #94a3b8;
  text-align: center;
  padding: 10px;
  background: #f8fafc;
  border-radius: 4px;
  border: 1px dashed #e2e8f0;
}

.safe-area-info {
  position: absolute;
  top: 4px;
  right: 4px;
  z-index: 10;
}

</style>