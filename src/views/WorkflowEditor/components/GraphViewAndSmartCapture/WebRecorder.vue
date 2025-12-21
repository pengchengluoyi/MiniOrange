<template>
  <div class="recorder-container">
    <!-- 标签栏 -->
    <div class="tab-bar">
      <div
        v-for="tab in tabs"
        :key="tab.id"
        class="tab-item"
        :class="{ active: activeTabId === tab.id }"
        @click="switchTab(tab.id)"
      >
        <span class="tab-title">{{ tab.title || '新标签页' }}</span>
        <span v-if="tabs.length > 1" class="tab-close" @click.stop="closeTab(tab.id)">×</span>
      </div>
      <div class="tab-add" @click="addNewTab()">+</div>
    </div>

    <div v-if="showUrlInput" class="url-bar">
      <input v-model="inputUrl" class="url-input" placeholder="请输入网址 (如 https://www.baidu.com)..." @keyup.enter="loadInputUrl" />
      <button class="url-go-btn" @click="loadInputUrl" title="前往">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
      </button>
    </div>

    <div v-if="!currentTabUrl" class="empty-state">
      <div class="empty-content">
        <div class="icon-placeholder">🌐</div>
        <div class="text-placeholder">请输入网址启动智能分析</div>
      </div>
    </div>

    <div class="webview-fill-wrapper" :style="{ visibility: currentTabUrl ? 'visible' : 'hidden' }">
      <div v-for="tab in tabs" :key="tab.id" class="webview-instance" v-show="activeTabId === tab.id">
      <webview
        :ref="(el) => setWebviewRef(el, tab.id)"
        class="full-size-webview"
        disablewebsecurity
        @did-navigate="(e) => handleNavigate(e, tab.id)"
        @dom-ready="() => onDomReady(tab.id)"
        @did-fail-load="(e) => handleFailLoad(e, tab.id)"
        @page-title-updated="(e) => handleTitleUpdate(e, tab.id)"
      ></webview>
      </div>
    </div>

    <transition name="fade">
      <div v-if="currentTabLoading || isSnapshotting" class="status-overlay">
        <div class="loading-spinner"></div>
        <div class="loading-text">{{ currentTabStatusText }}</div>
      </div>
    </transition>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick } from 'vue'

const props = defineProps({
  initialUrl: String,
  showUrlInput: { type: Boolean, default: false }
})

// 多标签页状态管理
const tabs = ref([])
const activeTabId = ref('')
const webviewRefs = {} // 存储 DOM 引用

const inputUrl = ref('')
const isSnapshotting = ref(false)

// 计算属性
const activeTab = computed(() => tabs.value.find(t => t.id === activeTabId.value))
const currentTabUrl = computed(() => activeTab.value?.url || '')
const currentTabLoading = computed(() => activeTab.value?.isLoading || false)
const currentTabStatusText = computed(() => activeTab.value?.statusText || '')

const setWebviewRef = (el, id) => {
  if (el) {
    webviewRefs[id] = el
    // 手动绑定 new-window (防止重复绑定)
    if (!el._hasNewWindowListener) {
      el.addEventListener('new-window', handleNewWindow)
      el._hasNewWindowListener = true
    }
  } else {
    delete webviewRefs[id]
  }
}

onMounted(() => {
  // 初始化第一个标签页
  addNewTab(props.initialUrl)
})

const addNewTab = (url = '') => {
  const id = 'tab_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5)
  tabs.value.push({
    id,
    url: '',
    title: '新标签页',
    isLoading: false,
    statusText: '',
    isReady: false
  })
  activeTabId.value = id
  inputUrl.value = url // 切换到新标签页时，更新地址栏(清空或设置为新URL)
  
  if (url) {
    setTimeout(() => navigate(url), 100)
  }
}

const closeTab = (id) => {
  const idx = tabs.value.findIndex(t => t.id === id)
  if (idx === -1) return
  
  tabs.value.splice(idx, 1)
  delete webviewRefs[id]
  
  if (tabs.value.length === 0) {
    addNewTab()
  } else if (activeTabId.value === id) {
    activeTabId.value = tabs.value[tabs.value.length - 1].id
    inputUrl.value = activeTab.value?.url || ''
  }
}

const switchTab = (id) => {
  activeTabId.value = id
  const tab = tabs.value.find(t => t.id === id)
  if (tab) {
    inputUrl.value = tab.url
  }
}

const loadInputUrl = () => {
  if (inputUrl.value) {
    navigate(inputUrl.value)
  }
}

// 🔥 修复：更加健壮的导航逻辑
const navigate = (url) => {
  if (!url) return
  let u = url.trim()
  if (!u.startsWith('http')) u = 'https://' + u

  const tab = activeTab.value
  if (!tab) return

  tab.url = u
  inputUrl.value = u
  tab.isLoading = true
  tab.statusText = '正在连接...'

  nextTick(() => {
    const wv = webviewRefs[tab.id]
    if (wv) {
      if (tab.isReady && typeof wv.loadURL === 'function') {
        try {
          if (wv.isLoading()) {
             wv.stop()
          }
          wv.loadURL(u)
        } catch (e) {
          wv.src = u
        }
      } else {
        wv.src = u
      }
    }
  })
}

const handleNavigate = (e, tabId) => {
  const tab = tabs.value.find(t => t.id === tabId)
  if (tab && e.url) {
    tab.url = e.url
    if (activeTabId.value === tabId) {
      inputUrl.value = e.url
    }
  }
  if (tab) tab.isLoading = false
}

const handleFailLoad = (e, tabId) => {
  const tab = tabs.value.find(t => t.id === tabId)
  if (!tab) return
  // 忽略 -3 (ABORTED) 错误，通常是我们手动 stop 或者是页面重定向造成的
  if (e.errorCode !== -3) {
    tab.isLoading = false
    tab.statusText = '加载中断或失败'
  }
}

const handleTitleUpdate = (e, tabId) => {
  const tab = tabs.value.find(t => t.id === tabId)
  if (tab && e.title) {
    tab.title = e.title
  }
}

const handleNewWindow = (e) => {
  // 拦截 window.open 或 target="_blank"，强制在当前 webview 跳转
  e.preventDefault()
  console.log('[WebRecorder] 拦截到新窗口请求:', e.url)
  if (e.url) {
    // 🔥 多标签页模式：新建标签页打开
    addNewTab(e.url)
  }
}

// 🔥 核心：Webview 进程就绪回调
const onDomReady = (tabId) => {
  const tab = tabs.value.find(t => t.id === tabId)
  if (tab) {
    tab.isReady = true
    tab.isLoading = false
    
    const wv = webviewRefs[tabId]
    if (wv) {
      try {
        wv.insertCSS(`::-webkit-scrollbar { width: 0px; background: transparent; }`)
        injectHighlighter(wv)
        applyVirtualViewport(wv)
      } catch (e) { /* ignore */ }
    }
  }
}

// 🔥 辅助函数：获取 WebContents 实例 (兼容 Remote 模块)
const getWebContents = (wv) => {
  try {
    const electron = window.require ? window.require('electron') : null
    const remote = electron?.remote || (window.require ? window.require('@electron/remote') : null)
    if (remote && typeof wv.getWebContentsId === 'function') {
       return remote.webContents.fromId(wv.getWebContentsId())
    }
  } catch (e) { /* ignore */ }
  return null
}

// 🔥 核心：应用虚拟视口设置 (防止横向滚动条，保持虚拟宽度)
const applyVirtualViewport = async (wv) => {
  const wc = getWebContents(wv)
  if (!wc) return

  try {
    if (!wc.debugger.isAttached()) {
      wc.debugger.attach('1.3')
    }
    // 隐藏滚动条 & 强制使用桌面模式 (width: 0 表示跟随容器宽度)
    await wc.debugger.sendCommand('Emulation.setScrollbarsHidden', { hidden: true })
    await wc.debugger.sendCommand('Emulation.setDeviceMetricsOverride', {
      width: 0, height: 0, deviceScaleFactor: 0, mobile: false
    })
  } catch (e) { console.warn('Failed to apply virtual viewport:', e) }
}

const captureSnapshot = async () => {
  const wv = webviewRefs[activeTabId.value]
  if (!wv) return null

  isSnapshotting.value = true
  if (activeTab.value) activeTab.value.statusText = '正在扫描页面结构...'

  try {
    // 注入 JS 获取页面宽高
    const metrics = await wv.executeJavaScript(`
      (() => {
        const body = document.body;
        const html = document.documentElement;
        return {
          w: window.innerWidth,
          h: Math.max(body.scrollHeight, body.offsetHeight, html.clientHeight, html.scrollHeight, html.offsetHeight)
        };
      })()
    `)

    let imgData = null

    // 尝试使用 CDP (Chrome DevTools Protocol) 进行全网页截图
    // 这样可以解决 "capturePage" 只能截取可视区域的问题，导致长页面底部无法被拍到
    try {
      let wc = getWebContents(wv)

      if (!wc) throw new Error('无法获取 WebContents (需开启 Remote 模块)')

      // 确保 debugger attached
      if (!wc.debugger.isAttached()) {
        wc.debugger.attach('1.3')
      }

      // 🔥 关键修改：使用 Emulation 强制设置设备尺寸
      // 单纯使用 captureScreenshot 的 clip 参数在某些长页面上可能无法渲染底部内容（显示为空白）
      // 通过 Emulation.setDeviceMetricsOverride 我们可以欺骗浏览器渲染完整的长页面
      await wc.debugger.sendCommand('Emulation.setDeviceMetricsOverride', {
        width: Math.floor(metrics.w),
        height: Math.floor(metrics.h),
        deviceScaleFactor: 1,
        mobile: false
      })

      const { data } = await wc.debugger.sendCommand('Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: true
      })

      // 🔥 恢复虚拟视口设置 (而不是 detach，以保持后续浏览的无滚动条状态)
      await applyVirtualViewport(wv)
      imgData = 'data:image/png;base64,' + data
    } catch (cdpError) {
      console.warn('CDP Full Page Screenshot failed, falling back to viewport capture:', cdpError)
      // 降级方案：原有的可视区域截图
      const image = await wv.capturePage()
      // 🔥 关键修复：处理 Retina 屏幕导致的坐标错位问题
      // capturePage 返回的是物理像素 (如 2x)，而 DOM rect 是逻辑像素 (1x)
      // 我们强制将图片缩放到逻辑尺寸，确保坐标一一对应
      const resizedImage = image.resize({ width: Math.ceil(metrics.w) })
      imgData = resizedImage.toDataURL()
    }

    // 智能分析 DOM 结构
    const components = await wv.executeJavaScript(`
      (() => {
        const comps = [];
        function getXPath(el) { if(el.id) return '//*[@id="'+el.id+'"]'; return '/'; }

        // 采集交互元素：扩展了 textarea, select, contenteditable 以及常见交互属性
        // 增加了对 onclick, tabindex 等属性的检测，以覆盖更多 JS 驱动的组件
        const selector = 'input, button, a, select, textarea, [role="button"], [role="link"], [role="menuitem"], [contenteditable="true"], [tabindex], [onclick]';

        document.querySelectorAll(selector).forEach(el => {
           const r = el.getBoundingClientRect();
           // 过滤掉太小的或者不可见的元素
           if(r.width < 5 || r.height < 5) return;
           const style = window.getComputedStyle(el);
           if(style.visibility === 'hidden' || style.display === 'none' || style.opacity === '0') return;

           // 排除 tabindex="-1" 的非交互元素 (除非它是原生控件)
           if (el.getAttribute('tabindex') === '-1' && !['INPUT', 'BUTTON', 'A', 'TEXTAREA', 'SELECT'].includes(el.tagName)) return;

           let category = 'action';
           let subType = el.tagName.toLowerCase();

           // 智能分类
           if (el.tagName === 'INPUT') {
               // 区分输入框和按钮类型的 input
               if (['button', 'submit', 'reset', 'image'].includes(el.type)) category = 'action';
               else if (['checkbox', 'radio'].includes(el.type)) category = 'action'; 
               else category = 'input';
           } else if (el.tagName === 'TEXTAREA' || el.isContentEditable) {
               category = 'input';
               subType = 'textarea';
           } else if (el.tagName === 'SELECT') {
               category = 'input';
               subType = 'select';
           }

           // 提取标签文本
           let label = el.innerText || el.placeholder || el.name || el.value || el.getAttribute('aria-label') || el.title || '';
           label = label.slice(0, 30).replace(/\s+/g, ' ').trim();
           if (!label) label = subType;

           comps.push({
             label: label,
             category: category,
             sub_type: subType,
             // 🔥 坐标取整，防止小数导致的 1px 偏差
             rect: {
               x: Math.round(r.left + window.scrollX),
               y: Math.round(r.top + window.scrollY),
               w: Math.round(r.width),
               h: Math.round(r.height)
             },
             // 🔥 捕获更多元数据用于展示，存入 locators.web
             locators: {
               web: {
                 xpath: getXPath(el),
                 id: el.id || '',
                 className: el.className || '',
                 tagName: el.tagName || '',
                 text: (el.innerText || '').slice(0, 200)
               }
             }
           });
        });
        return comps;
      })()
    `)

    return {
      imgData,
      logicalW: metrics.w,
      logicalH: metrics.h,
      components,
      domData: {}
    }
  } catch(e) {
    console.error("Capture failed:", e)
    return null
  } finally {
    isSnapshotting.value = false
    // 兜底：确保截图结束后虚拟视口依然生效
    if (wv) {
      applyVirtualViewport(wv).catch(() => {})
    }
  }
}

const injectHighlighter = (wv) => {
  if (!wv) return

  // 注入高亮遮罩的 CSS
  wv.insertCSS(`
    #ab-inspector-mask {
      position: fixed;
      z-index: 2147483647;
      background: rgba(66, 133, 244, 0.2);
      border: 1px solid rgba(66, 133, 244, 0.6);
      pointer-events: none;
      transition: all 0.05s ease;
      display: none;
      box-sizing: border-box;
    }
    #ab-inspector-label {
      position: absolute;
      bottom: 100%;
      left: -1px;
      background: #4285f4;
      color: white;
      font-family: Consolas, monospace;
      font-size: 11px;
      padding: 2px 6px;
      border-radius: 2px 2px 0 0;
      white-space: nowrap;
      pointer-events: none;
      box-shadow: 0 -2px 4px rgba(0,0,0,0.1);
    }
  `)

  // 注入 JS 逻辑
  wv.executeJavaScript(`
    (() => {
      if (window.__ab_inspector_init) return;
      window.__ab_inspector_init = true;

      const mask = document.createElement('div');
      mask.id = 'ab-inspector-mask';
      const label = document.createElement('div');
      label.id = 'ab-inspector-label';
      mask.appendChild(label);
      document.documentElement.appendChild(mask);

      const updateMask = (el) => {
        if (!el || el === document.body || el === document.documentElement || el === mask) {
          mask.style.display = 'none';
          return;
        }
        const r = el.getBoundingClientRect();
        mask.style.display = 'block';
        mask.style.top = r.top + 'px';
        mask.style.left = r.left + 'px';
        mask.style.width = r.width + 'px';
        mask.style.height = r.height + 'px';
        
        let name = el.tagName.toLowerCase();
        if (el.id) name += '#' + el.id;
        else if (el.className && typeof el.className === 'string') {
           const cls = el.className.split(/\\s+/).filter(c => c).join('.');
           if (cls.length > 0 && cls.length < 20) name += '.' + cls;
        }
        label.textContent = \`\${name} (\${Math.round(r.width)}x\${Math.round(r.height)})\`;
      };

      document.addEventListener('mousemove', (e) => {
        const el = document.elementFromPoint(e.clientX, e.clientY);
        updateMask(el);
      }, { passive: true, capture: true });

      document.addEventListener('scroll', () => {
        mask.style.display = 'none';
      }, { passive: true, capture: true });
      
      document.addEventListener('mouseleave', () => {
         mask.style.display = 'none';
      });
    })();
  `)
}

defineExpose({ navigate, captureSnapshot })
</script>

<style scoped>
.recorder-container {
  width: 100%; height: 100%; position: relative; background: #fff; overflow: hidden; display: flex; flex-direction: column;
}

/* 标签栏样式 */
.tab-bar {
  display: flex; background: #f1f5f9; padding: 6px 6px 0 6px; gap: 4px; overflow-x: auto; flex-shrink: 0; border-bottom: 1px solid #e2e8f0; z-index: 10; position: relative;
}
.tab-item {
  padding: 6px 12px; background: #e2e8f0; border-radius: 6px 6px 0 0; font-size: 12px; color: #64748b; cursor: pointer; display: flex; align-items: center; gap: 8px; max-width: 160px; min-width: 80px; border: 1px solid transparent; border-bottom: none; transition: all 0.2s;
}
.tab-item:hover { background: #cbd5e1; }
.tab-item.active { background: #fff; color: #0f172a; font-weight: 500; border-color: #e2e8f0; position: relative; top: 1px; }
.tab-title { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tab-close { font-size: 14px; line-height: 1; opacity: 0.6; border-radius: 50%; width: 16px; height: 16px; display: flex; align-items: center; justify-content: center; }
.tab-close:hover { opacity: 1; background: #ef4444; color: white; }
.tab-add { padding: 4px 10px; cursor: pointer; font-weight: bold; color: #64748b; font-size: 16px; display: flex; align-items: center; }
.tab-add:hover { color: #0f172a; background: #e2e8f0; border-radius: 4px; }

.webview-fill-wrapper {
  position: relative;
  flex: 1;
  width: 100%;
  height: 0; /* 配合 flex: 1 占满剩余空间 */
  z-index: 1;
  background: white;
}

.webview-instance { width: 100%; height: 100%; display: flex; }

.full-size-webview {
  width: 100%;
  height: 100%;
  border: none;
  /* 确保 webview 能够响应鼠标事件 */
  display: flex;
}

.empty-state {
  position: absolute; inset: 0;
  display: flex; align-items: center; justify-content: center;
  background: #f8fafc; color: #94a3b8;
  z-index: 0;
}
.empty-content { text-align: center; }
.icon-placeholder { font-size: 48px; margin-bottom: 12px; opacity: 0.5; }
.text-placeholder { font-size: 14px; font-weight: 500; }

.status-overlay {
  position: absolute; inset: 0;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(4px);
  z-index: 50;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
}
.loading-spinner {
  width: 32px; height: 32px;
  border: 3px solid #e2e8f0;
  border-top-color: #6366f1;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
.loading-text { margin-top: 12px; color: #475569; font-size: 13px; font-weight: 500; }

@keyframes spin { to { transform: rotate(360deg); } }
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

/* 地址栏样式 */
.url-bar {
  display: flex; align-items: center; gap: 8px; padding: 8px 12px;
  background: #f8fafc; border-bottom: 1px solid #e2e8f0; z-index: 10; flex-shrink: 0; position: relative;
}
.url-input {
  flex: 1; padding: 6px 10px; border: 1px solid #cbd5e1; border-radius: 6px;
  font-size: 13px; color: #334155; outline: none; transition: border-color 0.2s;
}
.url-input:focus { border-color: #6366f1; }
.url-go-btn {
  display: flex; align-items: center; justify-content: center;
  width: 32px; height: 30px; background: #6366f1; color: white;
  border: none; border-radius: 6px; cursor: pointer; transition: background 0.2s;
}
.url-go-btn:hover { background: #4f46e5; }
</style>