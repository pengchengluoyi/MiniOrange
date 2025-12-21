<template>
  <div class="scrcpy-container">
    <!-- 顶部工具栏 -->
    <div class="scrcpy-header" :class="{ 'z-top': showDeviceList }">
      <div class="device-selector-group">
        <!-- 🔥 2. 优化 UI: 自定义设备选择下拉框 -->
        <div class="custom-select">
          <div class="select-trigger" :class="{ disabled: isStreaming || isConnecting }"
               @click="!isStreaming && !isConnecting && (showDeviceList = !showDeviceList)">
            <span class="selected-text">{{ selectedDeviceLabel }}</span>
            <span class="arrow">▼</span>
          </div>
          <transition name="fade">
            <div v-if="showDeviceList" class="select-options">
              <div v-for="device in deviceList" :key="device.id" class="select-option"
                   :class="{ selected: device.id === selectedDeviceId }" @click="selectDevice(device.id)">
                <div class="device-model">{{ device.model }}</div>
                <div class="device-id">{{ device.id }}</div>
              </div>
              <div v-if="deviceList.length === 0" class="select-option empty">未检测到设备</div>
            </div>
          </transition>
        </div>

        <button class="icon-btn" @click="refreshDevices" title="刷新设备列表" :disabled="isStreaming || isConnecting">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M23 4v6h-6"/>
            <path d="M1 20v-6h6"/>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
          </svg>
        </button>
      </div>

      <div class="control-actions">
        <button v-if="!isStreaming" class="action-btn start" @click="startStream" :disabled="!selectedDeviceId || isConnecting">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M5 3l14 9-14 9V3z"/>
          </svg>
          开始投屏
        </button>
        <button v-else class="action-btn stop" @click="stopStream">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="6" width="12" height="12"/>
          </svg>
          停止
        </button>
      </div>
    </div>

    <!-- 主体区域 -->
    <div class="scrcpy-body" :class="{ 'is-landscape': isLandscape }">
      <div class="scrcpy-sidebar" :class="{ 'z-top': showSettings, 'is-landscape': isLandscape }">
        <div class="sidebar-section">
          <div class="sidebar-label">导航键</div>
          <div class="nav-grid" :class="{ disabled: !isStreaming, 'is-landscape': isLandscape }">
            <button class="nav-btn" @click="sendKey(4)" title="返回 (Back)">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M15 18l-6-6 6-6"/>
              </svg>
            </button>
            <button class="nav-btn" @click="sendKey(3)" title="主页 (Home)">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
              </svg>
            </button>
            <button class="nav-btn" @click="sendKey(187)" title="多任务 (Recent)">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="6" y="6" width="12" height="12" rx="2"/>
              </svg>
            </button>
            <button class="nav-btn" @click="sendKey(26)" title="电源 (Power)">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18.36 6.64a9 9 0 1 1-12.73 0"></path>
                <line x1="12" y1="2" x2="12" y2="12"></line>
              </svg>
            </button>
          </div>
        </div>

        <!-- 🔥 4. 新增设置: 永不熄屏 -->
        <div class="sidebar-section">
          <div class="sidebar-label clickable" @click="showSettings = !showSettings" title="设置">
            <span class="toggle-icon" style="font-size: 18px;">⚙️</span>
          </div>
          <transition name="fade">
            <div v-if="showSettings" class="settings-popover">
              <div class="setting-item">
                <span>永不熄屏</span>
                <label class="switch">
                  <input type="checkbox" v-model="keepScreenOn">
                  <span class="slider round"></span>
                </label>
              </div>
              <div class="setting-item column">
                <span>解锁密码</span>
                <input type="password" v-model="unlockPassword" class="password-input" placeholder="输入锁屏密码"/>
              </div>
            </div>
          </transition>
        </div>

        <div class="sidebar-section">
          <div class="sidebar-label clickable" @click="showDebug = !showDebug">
            调试 <span class="toggle-icon">{{ showDebug ? '▼' : '▶' }}</span>
          </div>
          <div v-if="showDebug" class="debug-content">
            <p>状态: {{ connectionStatus }}</p>
            <p>包数: {{ packetCount }}</p>
          </div>
        </div>
      </div>

      <div class="phone-area">
        <div class="phone-frame">
          <div class="screen-wrapper">
            <canvas
                ref="canvas"
                v-show="isStreaming"
                width="360"
                height="640"
                class="phone-canvas"
                @pointerdown="onPointerDown"
                @contextmenu.prevent="sendKey(4)"
                @wheel.prevent="handleWheel"
                @dblclick.prevent
                @mousemove="handleDomMouseMove"
                @mouseleave="highlightRect = null"
            ></canvas>

            <!-- 🔥 1. 骨架屏 (Skeleton) -->
            <div v-if="!isStreaming" class="skeleton-screen">
              <div class="skeleton-content">
                <div class="skeleton-icon">📱</div>
                <div class="skeleton-text">{{ connectionStatus }}</div>
              </div>
            </div>

            <!-- 状态遮罩层 -->
            <div v-if="!isStreaming && !isLoading" class="status-mask">
              <div class="status-icon">📱</div>
              <p>请选择设备并开始投屏</p>
            </div>
            <div v-if="isLoading" class="status-mask loading" style="background: rgba(15, 23, 42, 0.9);">
              <div class="spinner"></div>
              <p>正在连接...</p>
            </div>

            <!-- 🔥 DOM 结构遮罩层 (Pointer Events None 保证不阻挡操作) -->
            <div class="dom-mask-layer" v-if="highlightRect">
              <div class="dom-highlight-box" :style="highlightRect"></div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 🔥 隐藏输入框，用于捕获键盘输入 (支持中文) -->
    <input
        ref="hiddenInput"
        class="hidden-input"
        @input="handleTextInput"
        @keydown="handleKeyDown"
    />

    <!-- 替换原生 alert 的提示框 -->
    <div v-if="toastMessage" class="toast-message" :class="toastType">
      {{ toastMessage }}
    </div>

    <!-- 全局点击遮罩，用于关闭下拉菜单 -->
    <div v-if="showDeviceList || showSettings" class="click-outside-mask" @click="closeDropdowns"></div>
  </div>
</template>

<script setup>
import {onMounted, ref, shallowRef, onUnmounted, reactive, markRaw, computed, watch} from "vue";
import {TinyH264Decoder} from "@yume-chan/scrcpy-decoder-tinyh264";
import {useScrcpy} from "../composables/useScrcpy";
import MWebSocket from '@/api/mWebSocket.js';

const canvas = ref(null);
const decoder = shallowRef(null); // 使用 shallowRef 避免 Vue 代理复杂对象
const decoderWriter = shallowRef(null); // 🔥 新增：用于向解码器写入数据
const selectedDeviceId = ref('');
const ws = shallowRef(null); // WebSocket 实例也不需要深度响应
const connectionStatus = ref('设备未连接');
const packetCount = ref(0);
const toastMessage = ref('');
const toastType = ref('info'); // 'info' | 'error'
const showDebug = ref(false);
const showDeviceList = ref(false); // 控制设备下拉框
const showSettings = ref(false); // 控制设置面板
const keepScreenOn = ref(localStorage.getItem('scrcpy_keep_screen_on') === 'true'); // 🔥 永不熄屏开关 (持久化)
const unlockPassword = ref(''); // 🔥 解锁密码
const isManualStop = ref(false); // 🔥 标记是否为手动停止
const isConnecting = ref(false); // 🔥 新增：标记是否正在连接中 (用于锁定UI)
const isUnlocking = ref(false); // 🔥 新增：标记是否正在执行解锁 (防止重复触发)
const waitingForKeyframe = ref(false); // 🔥 新增：是否正在等待关键帧（错误恢复模式）
let pendingBuffer = null; // 🔥 新增：H.264 数据流重组缓冲区
let decodingQueueSize = 0; // 🔥 新增：当前正在解码的帧数（用于背压控制）
let configBuffer = []; // 🔥 新增：SPS/PPS 缓冲，用于合并发送
let isMouseDown = false;
let keepAliveTimer = null; // 心跳定时器
const isLandscape = ref(false); // 🔥 是否为横屏/宽屏设备
let isFirstChunk = true; // 🔥 新增：标记是否为首个数据包 (用于跳过 Header)
const hiddenInput = ref(null); // 隐藏输入框引用

// 🔥 DOM 投屏相关
const domWs = shallowRef(null);
const domTree = shallowRef(null);
const highlightRect = ref(null);

// 使用 useScrcpy 逻辑
const {
  deviceList,
  refreshDevices,
  isLoading,
  isStreaming,
  startMirroring,
  stopMirroring,
  streamPort // 🔥 1. 直接在这里解构 streamPort，保持引用一致
} = useScrcpy();

// 计算属性：当前选中设备的显示文本
const selectedDeviceLabel = computed(() => {
  if (!selectedDeviceId.value) return '请选择设备';
  const device = deviceList.value.find(d => d.id === selectedDeviceId.value);
  return device ? `${device.model} (${device.id})` : selectedDeviceId.value;
});

// 监听永不熄屏开关
watch(keepScreenOn, (val) => {
  localStorage.setItem('scrcpy_keep_screen_on', val); // 保存状态
  if (val && isStreaming.value) {
    startKeepAlive();
  } else {
    stopKeepAlive();
  }
});

// 监听设备ID变化，加载对应的密码
watch(selectedDeviceId, (newId) => {
  if (newId) {
    unlockPassword.value = localStorage.getItem(`scrcpy_pwd_${newId}`) || '';
  }
});

// 监听密码变化，保存到 localStorage
watch(unlockPassword, (newPwd) => {
  if (selectedDeviceId.value) {
    localStorage.setItem(`scrcpy_pwd_${selectedDeviceId.value}`, newPwd);
  }
});

onMounted(async () => {
  await refreshDevices();
  // 🔥 3. 自动投屏：如果有设备，默认选中第一个并开始
  if (deviceList.value.length > 0 && !selectedDeviceId.value) {
    selectedDeviceId.value = deviceList.value[0].id;
    startStream(); // 自动开始
  }
  await initDecoder();

  // 🔥 监听 Canvas 尺寸变化，自动切换横竖屏布局
  if (canvas.value) {
    const resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        const {width, height} = entry.contentRect;
        isLandscape.value = width > height;
      }
    });
    resizeObserver.observe(canvas.value);
  }
});

const selectDevice = async (id) => {
  selectedDeviceId.value = id;
  showDeviceList.value = false;
  // 🔥 切换设备后立即重新开始投屏
  await startStream();
};

const closeDropdowns = () => {
  showDeviceList.value = false;
  showSettings.value = false;
};

// 显示提示消息的辅助函数
const showToast = (msg, type = 'info') => {
  toastMessage.value = msg;
  toastType.value = type;
  setTimeout(() => {
    toastMessage.value = '';
  }, 3000);
};

const initDecoder = async () => {
  try {
    console.log('开始初始化解码器...');

    // 创建解码器实例
    decoder.value = markRaw(new TinyH264Decoder({
      canvas: canvas.value
    }));
    decoderWriter.value = decoder.value.writable.getWriter(); // 🔥 获取写入流

    // 等待解码器就绪
    if (decoder.value.ready) {
      await decoder.value.ready;
      console.log('解码器就绪');
    }

    // 调试解码器对象
    console.log('解码器对象:', decoder.value);

    // 检查是否有可用的方法
    const methods = [];
    for (let prop in decoder.value) {
      if (typeof decoder.value[prop] === 'function') {
        methods.push(prop);
      }
    }
    console.log('解码器方法:', methods);

    // 尝试设置回调
    if (typeof decoder.value.onPicture === 'function') {
      decoder.value.onPicture = (picture) => {
        console.log('收到图片数据');
        connectionStatus.value = '正在解码';
      };
    }

    console.log('解码器初始化成功');
    connectionStatus.value = '解码器就绪';
  } catch (error) {
    console.error('解码器初始化失败:', error);
    connectionStatus.value = '解码器初始化失败';
  }
};

const startStream = async () => {
  // 如果已经在串流，先停止清理
  if (isStreaming.value) {
    stopStream();
  }
  if (!selectedDeviceId.value) {
    showToast('请先选择设备', 'error');
    return;
  }
  // 🔥 修复: 每次启动流时重新初始化解码器，防止复用实例导致黑屏或上下文丢失
  if (decoder.value) {
    releaseDecoder();
  }
  isConnecting.value = true; // 🔥 锁定 UI
  await initDecoder();

  try {
    isManualStop.value = false; // 重置手动停止标记
    console.log('开始串流，设备ID:', selectedDeviceId.value);
    connectionStatus.value = `1. 连接设备 ${selectedDeviceId.value} 成功`;
    packetCount.value = 0;
    waitingForKeyframe.value = false; // 重置状态
    isFirstChunk = true; // 🔥 重置首包标记
    pendingBuffer = null;
    decodingQueueSize = 0;
    configBuffer = [];

    // 使用 useScrcpy 的 startMirroring
    connectionStatus.value = '2. 正在启动串流服务...';
    const device = deviceList.value.find(d => d.id === selectedDeviceId.value);

    // 🔥 启动 DOM 监听 WebSocket
    if (domWs.value) domWs.value.close();
    // 假设服务端运行在本地 8000 端口，实际请根据环境配置
    domWs.value = new MWebSocket('ws://localhost:8000/ws');
    domWs.value.on('open', () => {
      console.log('DOM WS Connected');
      domWs.value.send({ action: "dumpAndroidDom", devices_id: selectedDeviceId.value });
    });
    domWs.value.on('message', (msg) => {
      if (msg.type === 'android_dom' && msg.content) {
        parseDomXml(msg.content);
      }
      console.log(msg)
    });
    domWs.value.connect();

    await startMirroring(device);

    // 🔥 2. 移除这里重复调用的 useScrcpy()，直接使用顶部解构的 streamPort

    if (streamPort.value) {
      console.log('串流启动成功，端口:', streamPort.value);
      connectionStatus.value = `3. 串流启动成功 (端口: ${streamPort.value})`;
      // 立即连接，避免后端超时或缓冲区溢出
      connectWebSocket(streamPort.value);

      // 🔥 3. 自动唤醒屏幕 (解决投屏时屏幕不亮导致灰色的问题)
      // KEYCODE_WAKEUP = 224
      sendKey(224); // 立即发送一次

      // 如果开启了永不熄屏，启动心跳
      if (keepScreenOn.value) startKeepAlive();

      // 🔥 尝试自动解锁屏幕
      // 无论是否有密码，都尝试执行一次解锁流程（唤醒+上滑），防止黑屏
      setTimeout(performUnlock, 3000); // 等待画面稳定后执行
    } else {
      throw new Error('未获取到串流端口');
    }
  } catch (error) {
    console.error('启动串流失败:', error);
    connectionStatus.value = '串流启动失败';
    showToast(`启动失败: ${error.message}`, 'error');
  } finally {
    isConnecting.value = false; // 🔥 解锁 UI
  }
};

// 🔥 自动解锁逻辑
const performUnlock = async () => {
  if (isUnlocking.value || !isStreaming.value || !selectedDeviceId.value) return;
  isUnlocking.value = true;
  console.log('尝试自动解锁/唤醒...');

  // 1. 唤醒屏幕
  sendKey(224);
  await new Promise(r => setTimeout(r, 500));

  // 2. 上滑解锁 (模拟触摸)
  await swipeUp();
  await new Promise(r => setTimeout(r, 500));

  // 3. 输入密码并回车
  if (unlockPassword.value) {
    if (window.electronAPI && window.electronAPI.control) {
      window.electronAPI.control(selectedDeviceId.value, {type: 'text', text: unlockPassword.value});
      await new Promise(r => setTimeout(r, 300));
      sendKey(66); // KEYCODE_ENTER
    }
  }
  isUnlocking.value = false;
};

// 模拟上滑操作
const swipeUp = async () => {
  // 🔥 即使 Canvas 尚未渲染，也可以尝试使用默认分辨率发送滑动
  let w = 1080;
  let h = 2400;
  if (canvas.value && canvas.value.width > 0) {
    w = canvas.value.width;
    h = canvas.value.height;
  }

  const x = w / 2;

  // 从 80% 高度滑到 20% 高度
  // 🔥 直接使用 ADB Swipe，不依赖 sendRawTouch (避免坐标转换问题)
  if (window.electronAPI && window.electronAPI.control) {
    window.electronAPI.control(selectedDeviceId.value, {
      type: 'swipe', x, y: h * 0.8, endX: x, endY: h * 0.2, duration: 300
    });
  }
};

// 🔥 永不熄屏逻辑：定时发送 WAKEUP 键
const startKeepAlive = () => {
  stopKeepAlive();
  // 立即唤醒一次
  sendKey(224);
  // 🔥 调小轮训：每 2 秒发送一次唤醒指令 (防止黑屏)
  keepAliveTimer = setInterval(async () => {
    if (isStreaming.value) {
        sendKey(224);
        // 🔥 轮训检测锁屏状态
        if (!isUnlocking.value && window.electronAPI && window.electronAPI.invoke) {
          const output = await window.electronAPI.invoke('check-lock-screen', selectedDeviceId.value);
          // 正则匹配 m...Lockscreen...=true (忽略大小写)
          if (/m\w*Lockscreen\w*=true/i.test(output)) {
             console.log('检测到锁屏状态，执行解锁...');
             performUnlock();
          }
        }
    }
  }, 1500);
};

const stopKeepAlive = () => {
  if (keepAliveTimer) clearInterval(keepAliveTimer);
  keepAliveTimer = null;
};

const connectWebSocket = (port) => {
  try {
    // 🔥 确保关闭旧连接
    if (ws.value) {
      ws.value.close();
    }

    ws.value = new WebSocket(`ws://localhost:${port}`);
    ws.value.binaryType = 'arraybuffer';

    ws.value.onopen = () => {
      console.log('✅ WebSocket 连接已建立');
      connectionStatus.value = 'WebSocket 已连接';
    };

    ws.value.onmessage = (event) => {
      packetCount.value++;

      if (packetCount.value <= 5) {
        console.log(`收到 WebSocket 数据包 ${packetCount.value}, 长度:`, event.data.byteLength);
      } else if (packetCount.value === 6) {
        console.log('继续接收数据包...');
      }

      if (decoderWriter.value && event.data instanceof ArrayBuffer) {
        try {
          let chunk = new Uint8Array(event.data);

          // 🔥 3. PICO/设备兼容性修复：跳过 Scrcpy 协议头 (Device Name + Meta)
          // Scrcpy Server 默认会发送 64字节设备名 + 12字节流信息
          // 如果不跳过，这些数据会被误认为是 H.264 数据，导致解码器崩溃或首帧损坏
          if (isFirstChunk) {
            let startIndex = -1;
            // 搜索 H.264 Start Code (00 00 00 01 或 00 00 01)
            for (let i = 0; i < chunk.length - 4; i++) {
              if (chunk[i] === 0 && chunk[i + 1] === 0 && chunk[i + 2] === 0 && chunk[i + 3] === 1) {
                startIndex = i;
                break;
              }
              if (chunk[i] === 0 && chunk[i + 1] === 0 && chunk[i + 2] === 1) {
                startIndex = i;
                break;
              }
            }

            if (startIndex > -1) {
              console.log(`[Decoder] 🔍 找到视频流起始位置: ${startIndex}, 跳过协议头`);
              chunk = chunk.subarray(startIndex);
              isFirstChunk = false;
            } else {
              console.log(`[Decoder] ⚠️ 首包未包含视频流 (Header: ${chunk.length} bytes), 跳过`);
              return; // 纯 Header 包，直接丢弃
            }
          }

          // 🔥 1. 数据流重组 (解决大帧被截断导致的绿屏/黑屏)
          if (pendingBuffer) {
            const newBuf = new Uint8Array(pendingBuffer.length + chunk.length);
            newBuf.set(pendingBuffer);
            newBuf.set(chunk, pendingBuffer.length);
            pendingBuffer = newBuf;
          } else {
            pendingBuffer = chunk;
          }

          // 🔥 2. 丢帧策略：如果缓冲区过大 (说明渲染严重滞后)，直接清空并等待关键帧
          if (pendingBuffer.length > 10 * 1024 * 1024) { // 10MB 阈值
            console.warn('⚠️ 缓冲区溢出，强制丢帧重置');
            pendingBuffer = null;
            waitingForKeyframe.value = true;
            return;
          }

          // 🔥 3. NALU 分割与处理
          let offset = 0;
          // 至少需要 4 字节才能判断 Start Code
          while (offset < pendingBuffer.length - 4) {
            // 寻找 Start Code (00 00 01 或 00 00 00 01)
            // 注意：我们只处理 offset 之后的 Start Code 作为当前 NALU 的结束
            // 当前 NALU 的开始是 offset

            let nextStartCode = -1;
            // 简单的 Start Code 搜索 (从 offset + 3 开始，因为 Start Code 至少 3 字节)
            for (let i = offset + 3; i < pendingBuffer.length - 3; i++) {
              if (pendingBuffer[i] === 0 && pendingBuffer[i + 1] === 0 && pendingBuffer[i + 2] === 1) {
                nextStartCode = i;
                break;
              }
            }

            if (nextStartCode !== -1) {
              // 提取完整 NALU
              const nalu = pendingBuffer.subarray(offset, nextStartCode);
              processNalu(nalu);
              offset = nextStartCode;
            } else {
              // 没有找到下一个 Start Code，说明剩下的数据不完整，或者就是最后一个 NALU
              // 这里我们假设剩下的数据可能是不完整的，保留在 buffer 中等待下一个包
              // 除非 buffer 已经很大了，或者我们确定这是流的末尾(WebSocket一般不保证)
              // 为了简单起见，我们只保留未处理的部分
              break;
            }
          }

          // 更新 buffer，保留未处理的尾部数据
          if (offset > 0) {
            pendingBuffer = pendingBuffer.subarray(offset);
          }

        } catch (decodeError) {
          console.error('解码失败:', decodeError);
        }
      }
    };

    ws.value.onerror = (error) => {
      console.error('WebSocket 错误:', error);
      connectionStatus.value = 'WebSocket 错误';
    };

    ws.value.onclose = (event) => {
      console.log('WebSocket 连接已关闭，代码:', event.code, '原因:', event.reason);
      connectionStatus.value = `WebSocket 已关闭 (代码: ${event.code})`;
      // 🔥 1. 修复：如果是手动停止 (isManualStop)，不弹错误提示
      if (!isManualStop.value && (event.code === 1005 || event.code === 1006)) {
        showToast('连接意外断开，请检查设备连接或重启投屏', 'error');
        // 🔥 异常断开时，也需要清理状态
        cleanupStreamState();
        // 🔥 2. 清空当前设备选择，避免 UI 显示还在连接
        selectedDeviceId.value = '';
      }
    };

  } catch (error) {
    console.error('连接 WebSocket 失败:', error);
    connectionStatus.value = 'WebSocket 连接失败';
  }
};

// 🔥 处理单个 NAL Unit
const processNalu = (nalu) => {
  if (!nalu || nalu.length === 0) return;

  // 解析 NALU 类型
  let nalType = 0;
  // 00 00 01 X
  if (nalu[0] === 0 && nalu[1] === 0 && nalu[2] === 1) {
    nalType = nalu[3] & 0x1F;
  }
  // 00 00 00 01 X
  else if (nalu[0] === 0 && nalu[1] === 0 && nalu[2] === 0 && nalu[3] === 1) {
    nalType = nalu[4] & 0x1F;
  } else {
    // 不是有效的 NALU (可能是 Scrcpy 协议头)
    return;
  }

  const isKeyFrame = (nalType === 5 || nalType === 7 || nalType === 8); // IDR, SPS, PPS

  // 🔥 4. 丢帧逻辑 (解决快速滑动黑屏)
  // 如果正在等待关键帧，且当前不是关键帧，直接丢弃
  if (waitingForKeyframe.value && !isKeyFrame) {
    return;
  }

  // 如果解码队列过长 (渲染来不及)，且当前是 P 帧，主动丢弃并进入等待关键帧模式
  if (decodingQueueSize > 6 && !isKeyFrame) {
    console.warn(`⚠️ 渲染滞后 (Q:${decodingQueueSize})，丢弃 P 帧，等待关键帧`);
    waitingForKeyframe.value = true;
    return;
  }

  // 恢复正常
  if (waitingForKeyframe.value && isKeyFrame) {
    console.log('🔄 关键帧到达，恢复解码');
    waitingForKeyframe.value = false;
    connectionStatus.value = '恢复解码';
  }

  // 🔥 5. 关键修复：合并 SPS 和 PPS
  // WebCodecs/TinyH264Decoder 通常需要 SPS 和 PPS 在同一个 configuration chunk 中
  // 如果分开发送，可能会导致 "Invalid data" 错误
  if (nalType === 7 || nalType === 8) {
    configBuffer.push(new Uint8Array(nalu)); // 缓存配置帧 (复制一份)
    return;
  }

  // 如果是视频帧 (IDR/P)，且有缓存的配置，先发送配置
  if (configBuffer.length > 0) {
    const totalLen = configBuffer.reduce((sum, buf) => sum + buf.length, 0);
    const mergedConfig = new Uint8Array(totalLen);
    let offset = 0;
    for (const buf of configBuffer) {
      mergedConfig.set(buf, offset);
      offset += buf.length;
    }
    configBuffer = []; // 清空缓冲

    decoderWriter.value.write({type: 'configuration', data: mergedConfig})
        .catch(e => {
          console.error('❌ 写入配置失败:', e);
          waitingForKeyframe.value = true;
        });
  }

  decodingQueueSize++; // 入队计数
  decoderWriter.value.write({type: 'data', data: nalu})
      .then(() => {
        decodingQueueSize--; // 出队计数
        if (packetCount.value % 60 === 0) {
          console.log('📺 [Decoder] 成功写入视频帧');
        }
        connectionStatus.value = '4. 正在传输画面...';
      })
      .catch(e => {
        decodingQueueSize--;
        console.error(`❌ 写入视频帧失败:`, e);
        // 写入失败通常意味着解码器出错，必须重置等待关键帧
        waitingForKeyframe.value = true;
      });
};

// 🔥 解析 Android XML DOM
const parseDomXml = (xmlStr) => {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlStr, "text/xml");
    domTree.value = transformDomNode(doc.documentElement);
    console.log('DOM Tree Parsed:', domTree.value);
  } catch (e) {
    console.error('DOM Parse Error:', e);
  }
};

const transformDomNode = (xmlNode) => {
  if (xmlNode.nodeType !== 1) return null; // 只处理 Element 节点
  const bounds = xmlNode.getAttribute('bounds');
  let rect = null;
  if (bounds) {
    // 解析 bounds="[0,0][1080,2400]"
    const m = bounds.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
    if (m) {
      rect = {
        x: parseInt(m[1]),
        y: parseInt(m[2]),
        w: parseInt(m[3]) - parseInt(m[1]),
        h: parseInt(m[4]) - parseInt(m[2])
      };
    }
  }
  const node = { tagName: xmlNode.tagName, rect, children: [] };
  for (let i = 0; i < xmlNode.childNodes.length; i++) {
    const child = transformDomNode(xmlNode.childNodes[i]);
    if (child) node.children.push(child);
  }
  return node;
};

// 🔥 处理鼠标移动，高亮最小 DOM 元素
const handleDomMouseMove = (e) => {
  if (!domTree.value || !canvas.value) return;
  const rect = canvas.value.getBoundingClientRect();
  const scaleX = canvas.value.width / rect.width;
  const scaleY = canvas.value.height / rect.height;
  
  // 映射鼠标坐标到设备坐标
  const x = (e.clientX - rect.left) * scaleX;
  const y = (e.clientY - rect.top) * scaleY;

  const target = findSmallestNode(domTree.value, x, y);
  if (target && target.rect) {
    highlightRect.value = {
      left: (target.rect.x / scaleX) + 'px',
      top: (target.rect.y / scaleY) + 'px',
      width: (target.rect.w / scaleX) + 'px',
      height: (target.rect.h / scaleY) + 'px'
    };
  } else {
    highlightRect.value = null;
  }
};

const findSmallestNode = (node, x, y) => {
  if (!node) return null;

  // 1. 如果节点有 bounds，必须在范围内才继续查找
  if (node.rect) {
    if (x < node.rect.x || x > node.rect.x + node.rect.w ||
        y < node.rect.y || y > node.rect.y + node.rect.h) {
      return null;
    }
  }

  // 2. 优先查找子节点（递归）即使当前节点(如root)没有rect也要找子节点
  for (let i = node.children.length - 1; i >= 0; i--) {
    const childMatch = findSmallestNode(node.children[i], x, y);
    if (childMatch) return childMatch;
  }

  // 3. 如果子节点没匹配，且当前节点有 bounds，返回自己
  if (node.rect) {
    return node; // 没有子节点匹配，返回当前节点
  }
  return null;
};

// 备选渲染方案
const renderDebugInfo = (data) => {
  const ctx = canvas.value.getContext('2d');
  ctx.fillStyle = 'black';
  ctx.fillRect(0, 0, canvas.value.width, canvas.value.height);

  ctx.fillStyle = 'white';
  ctx.font = '16px Arial';
  ctx.fillText(`收到 H.264 数据包: ${packetCount.value}`, 10, 30);
  ctx.fillText(`数据长度: ${data.length} 字节`, 10, 60);
  ctx.fillText(`时间: ${new Date().toLocaleTimeString()}`, 10, 90);
  ctx.fillText(`状态: ${connectionStatus.value}`, 10, 120);
};

// 简单的节流函数，防止高频事件阻塞 IPC 通道
const throttle = (fn, delay) => {
  let last = 0;
  return (...args) => {
    const now = Date.now();
    if (now - last > delay) {
      last = now;
      fn(...args);
    }
  };
};

// 包装发送逻辑，仅对 'move' 事件节流
const throttledSendMove = throttle((e) => {
  sendTouchEvent('move', e);
}, 16);

// 🔥 新增：ADB Swipe 节流发送 (避免滚轮触发太快导致 ADB 进程堆积)
const throttledSwipe = throttle((deviceId, x, y, endX, endY, duration) => {
  if (window.electronAPI && window.electronAPI.control) {
    window.electronAPI.control(deviceId, {
      type: 'swipe', x, y, endX, endY, duration
    });
  }
}, 250); // 250ms 间隔，保证流畅度的同时防止卡顿

// 反向控制逻辑
const onPointerDown = (e) => {
  // 🔥 关键：防止浏览器默认的拖拽/选中行为（导致屏幕变灰的原因）
  e.preventDefault();

  isMouseDown = true;
  sendTouchEvent('down', e);

  // 🔥 聚焦隐藏输入框，激活键盘输入
  if (hiddenInput.value) hiddenInput.value.focus();

  // 🔥 改用 window 全局监听，比 setPointerCapture 更稳健，防止移出窗口后事件丢失
  window.addEventListener('pointermove', onWindowPointerMove);
  window.addEventListener('pointerup', onWindowPointerUp);
  window.addEventListener('pointercancel', onWindowPointerUp);
};

const onWindowPointerMove = (e) => {
  if (!isMouseDown) return;
  // 必须阻止默认行为，防止触发浏览器原生的拖拽/选中
  e.preventDefault();
  throttledSendMove(e);
};

const onWindowPointerUp = (e) => {
  if (isMouseDown) {
    e.preventDefault();
    isMouseDown = false;
    sendTouchEvent('up', e);
  }

  // 移除全局监听
  window.removeEventListener('pointermove', onWindowPointerMove);
  window.removeEventListener('pointerup', onWindowPointerUp);
  window.removeEventListener('pointercancel', onWindowPointerUp);
};

// 发送原始触摸指令
const sendRawTouch = (action, x, y) => {
  if (!canvas.value || !selectedDeviceId.value) return;
  // 调用 Electron API 发送控制指令
  if (window.electronAPI && window.electronAPI.control) {
    window.electronAPI.control(selectedDeviceId.value, {
      type: 'touch', action, x, y, width: canvas.value.width, height: canvas.value.height
    });
  }
};

const sendTouchEvent = (action, e) => {
  if (!canvas.value) return;
  const rect = canvas.value.getBoundingClientRect();
  // 计算缩放比例：视频实际分辨率 / Canvas显示大小
  const scaleX = canvas.value.width / rect.width;
  const scaleY = canvas.value.height / rect.height;

  let x = (e.clientX - rect.left) * scaleX;
  let y = (e.clientY - rect.top) * scaleY;

  // 🔥 限制坐标在屏幕范围内，防止越界
  x = Math.max(0, Math.min(x, canvas.value.width));
  y = Math.max(0, Math.min(y, canvas.value.height));

  sendRawTouch(action, x, y);
};

// 🔥 处理滚轮事件
const handleWheel = (e) => {
  if (!selectedDeviceId.value || !isStreaming.value || !canvas.value) return;

  // 🔥 1. 确保 Canvas 有效尺寸 (防止发送 0x0 导致服务端断开)
  if (!canvas.value.width || !canvas.value.height || canvas.value.width <= 0 || canvas.value.height <= 0) return;

  const rect = canvas.value.getBoundingClientRect();
  
  // 🔥 2. 计算缩放比例：视频实际分辨率 / Canvas显示大小
  const scaleX = canvas.value.width / rect.width;
  const scaleY = canvas.value.height / rect.height;

  // 🔥 3. 映射坐标到视频真实分辨率
  let x = (e.clientX - rect.left) * scaleX;
  let y = (e.clientY - rect.top) * scaleY;

  // 🔥 4. 边界限制
  x = Math.max(0, Math.min(x, canvas.value.width));
  y = Math.max(0, Math.min(y, canvas.value.height));

  // 🔥 5. 改用 ADB Swipe 模拟滚动 (解决 Scrcpy 协议崩溃问题)
  const deltaX = e.deltaX || 0;
  const deltaY = e.deltaY || 0;

  if (Math.abs(deltaX) < 10 && Math.abs(deltaY) < 10) return; // 忽略微小抖动

  const duration = 100; // 100ms 快速滑动

  // 判断主要滚动方向
  if (Math.abs(deltaX) > Math.abs(deltaY)) {
    // --- 水平滑动 ---
    const distance = canvas.value.width * 0.25; // 每次滑动屏幕宽度的 1/4
    // 滚轮向右 (deltaX > 0) -> 内容左移 -> 手指左滑 (x 减小)
    // 滚轮向左 (deltaX < 0) -> 内容右移 -> 手指右滑 (x 增加)
    let endX = x + (deltaX > 0 ? -distance : distance);
    // 限制 endX 在屏幕内
    endX = Math.max(0, Math.min(endX, canvas.value.width));
    throttledSwipe(selectedDeviceId.value, x, y, endX, y, duration);
  } else {
    // --- 垂直滑动 ---
    const distance = canvas.value.height * 0.25; // 每次滑动屏幕高度的 1/4
    // 滚轮向下 (deltaY > 0) -> 内容上移 -> 手指上滑 (y 减小)
    // 滚轮向上 (deltaY < 0) -> 内容下移 -> 手指下滑 (y 增加)
    let endY = y + (deltaY > 0 ? -distance : distance);
    // 限制 endY 在屏幕内
    endY = Math.max(0, Math.min(endY, canvas.value.height));
    throttledSwipe(selectedDeviceId.value, x, y, x, endY, duration);
  }
};

// 🔥 处理文本输入 (支持中文)
const handleTextInput = (e) => {
  const text = e.target.value;
  if (!text) return;

  if (window.electronAPI && window.electronAPI.control) {
    window.electronAPI.control(selectedDeviceId.value, {type: 'text', text});
  }
  // 清空输入框，准备下一次输入
  e.target.value = '';
};

// 🔥 处理特殊按键 (回车, 删除等)
const handleKeyDown = (e) => {
  let keycode = null;
  if (e.key === 'Enter') keycode = 66; // KEYCODE_ENTER
  if (e.key === 'Backspace') keycode = 67; // KEYCODE_DEL
  if (e.key === 'Escape') keycode = 4; // KEYCODE_BACK
  // 可以继续添加其他键...

  if (keycode) {
    e.preventDefault(); // 防止输入到 input 中
    sendKey(keycode);
  }
};

// 发送按键指令 (Back, Home, Recent)
const sendKey = (keycode) => {
  if (!selectedDeviceId.value || !isStreaming.value) return;
  // 模拟按下和抬起
  if (window.electronAPI && window.electronAPI.control) {
    window.electronAPI.control(selectedDeviceId.value, {type: 'key', action: 'down', keycode});
    window.electronAPI.control(selectedDeviceId.value, {type: 'key', action: 'up', keycode});
  }
};

const stopStream = () => {
  isManualStop.value = true; // 🔥 标记为手动停止
  cleanupStreamState();
};

// 提取清理逻辑，供 stopStream 和 异常断开 使用
const cleanupStreamState = () => {
  if (ws.value) {
    ws.value.close();
    ws.value = null;
  }
  if (domWs.value) {
    domWs.value.close();
    domWs.value = null;
  }
  stopMirroring(); // 使用 useScrcpy 的停止逻辑
  stopKeepAlive(); // 停止心跳
  connectionStatus.value = '已停止';
  // 🔥 停止时释放解码器资源
  releaseDecoder();
}
const releaseDecoder = () => {
  if (decoderWriter.value) {
    try {
      decoderWriter.value.releaseLock();
    } catch (e) {
    }
    decoderWriter.value = null;
  }
  if (decoder.value) {
    try {
      if (typeof decoder.value.dispose === 'function') decoder.value.dispose();
      else if (typeof decoder.value.free === 'function') decoder.value.free();
    } catch (e) {
    }
    decoder.value = null;
  }
}
onUnmounted(() => {
  stopStream();
  if (decoderWriter.value) {
    decoderWriter.value.releaseLock();
    decoderWriter.value = null;
  }
  if (decoder.value) {
    // 兼容不同的销毁方法名 (dispose 是标准名)
    if (typeof decoder.value.dispose === 'function') decoder.value.dispose();
    else if (typeof decoder.value.free === 'function') decoder.value.free();
  }
  stopStream(); // stopStream 内部会调用 releaseDecoder
  window.removeEventListener('pointermove', onWindowPointerMove);
  window.removeEventListener('pointerup', onWindowPointerUp);
});
</script>

<style scoped>
/* 容器布局 */
.scrcpy-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #f8fafc;
  position: relative;
  overflow: hidden;
}

/* 顶部工具栏 */
.scrcpy-header {
  height: 56px;
  padding: 0 16px;
  background: white;
  border-bottom: 1px solid #e2e8f0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  z-index: 20; /* Ensure header stays on top */
}

/* 提升优先级，防止被遮挡 */
.scrcpy-header.z-top {
  z-index: 101;
}

.device-selector-group {
  display: flex;
  gap: 8px;
  align-items: center;
}

/* 自定义下拉框样式 */
.custom-select {
  position: relative;
  min-width: 200px;
}

.select-trigger {
  height: 32px;
  padding: 0 12px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background-color: #f8fafc;
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  font-size: 13px;
  color: #334155;
  transition: all 0.2s;
}

.select-trigger:hover:not(.disabled) {
  border-color: #cbd5e1;
  background-color: white;
}

.select-trigger.disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.select-options {
  position: absolute;
  top: 100%;
  left: 0;
  width: 100%;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  margin-top: 4px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  z-index: 50;
  max-height: 300px;
  overflow-y: auto;
}

.select-option {
  padding: 8px 12px;
  cursor: pointer;
}

.select-option:hover {
  background: #f1f5f9;
}

.select-option.selected {
  background: #e0e7ff;
  color: #4f46e5;
}

.select-option.empty {
  color: #94a3b8;
  text-align: center;
  padding: 12px;
  font-size: 12px;
}

.device-model {
  font-weight: 500;
  font-size: 13px;
}

.device-id {
  font-size: 11px;
  color: #94a3b8;
}

.icon-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #cbd5e1;
  background: white;
  border-radius: 6px;
  color: #64748b;
  cursor: pointer;
  transition: all 0.2s;
}

.icon-btn:hover:not(:disabled) {
  background: #f1f5f9;
  color: #0f172a;
}

.action-btn {
  height: 32px;
  padding: 0 16px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  border: none;
  transition: all 0.2s;
}

.action-btn.start {
  background: #10b981;
  color: white;
}

.action-btn.start:hover:not(:disabled) {
  background: #059669;
}

.action-btn.start:disabled {
  background: #94a3b8;
  cursor: not-allowed;
}

.action-btn.stop {
  background: #fee2e2;
  color: #ef4444;
  border: 1px solid #fecaca;
}

.action-btn.stop:hover {
  background: #fecaca;
}

/* 主体区域 */
.scrcpy-body {
  flex: 1;
  display: flex;
  flex-direction: row; /* 改为横向布局 */
  overflow: hidden;
  user-select: none; /* 全局禁止选中，防止拖拽变蓝 */
}

/* 横屏模式：改为垂直布局 */
.scrcpy-body.is-landscape {
  flex-direction: column;
}

.phone-area {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px; /* 🔥 增加内边距，防止阴影被裁剪 */
  background: #f1f5f9;
  overflow: hidden;
}

.phone-frame {
  /* 🔥 1. 拟物化手机边框样式 */
  background: #121212; /* 深色边框 */
  padding: 3px 3px; /* 边框厚度 */
  border-radius: 36px; /* 大圆角 */
  border: 4px solid #2d2d2d; /* 金属质感外框 */
  box-shadow: 0 0 0 1px #000, /* 内圈黑线 */ 0 25px 50px -12px rgba(0, 0, 0, 0.6); /* 深度投影 */
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  /* 🔥 2. 允许填满父容器，不再限制宽度 */
  width: auto;
  height: auto;
  max-width: 100%;
  max-height: 100%;
  box-sizing: border-box;
}

.screen-wrapper {
  position: relative;
  background: black;
  border-radius: 24px; /* 屏幕内圆角 */
  overflow: hidden;
  display: flex;
  /* 🔥 2. 填满 Frame */
  width: auto;
  height: auto;
  align-items: center;
  justify-content: center;
}

.phone-canvas {
  /* 🔥 2. 使用 object-fit 保持比例同时填满容器 */
  width: auto;
  height: auto;
  max-height: calc(100vh - 180px); /* 🔥 动态计算最大高度 (屏幕高度 - 顶部栏 - 边距)，防止内容被裁剪 */
  max-width: 100%;
  object-fit: contain;
  display: block;
  cursor: pointer;
}

/* 🔥 1. 骨架屏样式 */
.skeleton-screen {
  position: absolute;
  width: 360px; /* 默认占位宽度 */
  height: 640px; /* 默认占位高度 */
  max-width: 100%;
  max-height: 100%;
  background: #1e293b;
  display: flex;
  align-items: center;
  justify-content: center;
  animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
  border-radius: 8px;
}

.skeleton-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  color: #475569;
}

.skeleton-icon {
  font-size: 48px;
  margin-bottom: 10px;
}

.skeleton-text {
  font-size: 14px;
  font-weight: 500;
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.7;
  }
}

.status-mask {
  position: absolute;
  inset: 0;
  background: #0f172a;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #94a3b8;
  font-size: 14px;
  z-index: 10;
}

.status-icon {
  font-size: 48px;
  margin-bottom: 16px;
  opacity: 0.5;
}

.spinner {
  width: 30px;
  height: 30px;
  border: 3px solid rgba(255, 255, 255, 0.1);
  border-top-color: #6366f1;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 16px;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* 左侧侧边栏 */
.scrcpy-sidebar {
  width: 48px; /* 变窄 */
  background: white;
  border-right: 1px solid #e2e8f0; /* 改为右边框 */
  border-left: none;
  display: flex;
  flex-direction: column;
  padding: 16px 0;
  align-items: center; /* 水平居中 */
  gap: 24px;
  z-index: 30;
  flex-shrink: 0;
}

/* 横屏模式：侧边栏在底部，横向排列 */
.scrcpy-sidebar.is-landscape {
  width: 100%;
  height: 48px;
  flex-direction: row;
  border-right: none;
  border-top: 1px solid #e2e8f0;
  padding: 0 16px;
  justify-content: center; /* 🔥 居中排列 */
  gap: 40px; /* 🔥 增加间距 */
}

/* 提升优先级，防止被遮挡 */
.scrcpy-sidebar.z-top {
  z-index: 101;
}

.sidebar-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: center;
  position: relative; /* 为 debug-content 定位 */
}

/* 横屏模式：Section 横向排列 */
.scrcpy-sidebar.is-landscape .sidebar-section {
  flex-direction: row;
}

.sidebar-label {
  font-size: 10px; /* 字体变小 */
  color: #94a3b8;
  font-weight: 600;
  text-align: center;
  transform: scale(0.9); /* 进一步缩小 */
}

.sidebar-label.clickable {
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 2px;
}

.sidebar-label.clickable:hover {
  color: #64748b;
}

/* 设置面板 */
.settings-popover {
  position: absolute;
  left: 100%;
  top: 0;
  width: 140px;
  margin-left: 10px;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  padding: 12px;
  z-index: 100;
}

.setting-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  color: #334155;
}

.setting-item.column {
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
}

/* 开关样式 */
.switch {
  position: relative;
  display: inline-block;
  width: 28px;
  height: 16px;
}

.switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: #cbd5e1;
  transition: .4s;
  border-radius: 16px;
}

.slider:before {
  position: absolute;
  content: "";
  height: 12px;
  width: 12px;
  left: 2px;
  bottom: 2px;
  background-color: white;
  transition: .4s;
  border-radius: 50%;
}

input:checked + .slider {
  background-color: #10b981;
}

input:checked + .slider:before {
  transform: translateX(12px);
}

.password-input {
  width: 100%;
  padding: 4px 8px;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  font-size: 12px;
  outline: none;
  box-sizing: border-box;
}

.nav-grid {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* 横屏模式：按钮横向排列 */
.nav-grid.is-landscape {
  flex-direction: row;
  gap: 20px; /* 🔥 增加按钮间距 */
}

.nav-grid.disabled {
  opacity: 0.3;
  pointer-events: none;
}

.nav-btn {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  color: #64748b;
  width: 32px; /* 按钮变小 */
  height: 32px;
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.nav-btn:hover {
  background: #f1f5f9;
  color: #0f172a;
  border-color: #cbd5e1;
}

.debug-content {
  font-size: 10px;
  color: #64748b;
  background: white;
  padding: 8px;
  border-radius: 6px;
  /* 改为悬浮菜单 */
  position: absolute;
  left: 100%;
  top: 0;
  width: 160px;
  margin-left: 10px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  border: 1px solid #e2e8f0;
  z-index: 100;
  box-sizing: border-box;
  word-break: break-all;
}

.debug-content p {
  margin: 4px 0;
}

.toast-message {
  position: absolute;
  top: 70px;
  left: 50%;
  transform: translateX(-50%);
  padding: 8px 12px;
  border-radius: 4px;
  font-size: 14px;
  animation: fadeIn 0.3s ease;
  z-index: 200;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.toast-message.error {
  background-color: #fee2e2;
  color: #ef4444;
  border: 1px solid #fecaca;
}

.toast-message.info {
  background-color: #e0e7ff;
  color: #4f46e5;
  border: 1px solid #c7d2fe;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(-5px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.click-outside-mask {
  position: fixed;
  inset: 0;
  z-index: 90; /* 提高遮罩层级，但低于 z-top (101) */
}

.fade-enter-active, .fade-leave-active {
  transition: opacity 0.2s;
}

.fade-enter-from, .fade-leave-to {
  opacity: 0;
}

.hidden-input {
  position: absolute;
  opacity: 0;
  top: -1000px;
  left: -1000px;
}

/* DOM 遮罩层样式 */
.dom-mask-layer {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none; /* 关键：让点击穿透遮罩层 */
  z-index: 20;
}

.dom-highlight-box {
  position: absolute;
  border: 2px solid rgba(66, 133, 244, 0.8);
  background: rgba(66, 133, 244, 0.2);
  pointer-events: none;
  transition: all 0.05s ease;
}
</style>