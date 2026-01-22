<template>
  <div class="scrcpy-window" v-loading="loading" element-loading-text="正在建立连接...">
    <div class="video-wrapper">
      <video ref="videoRef" autoplay muted class="scrcpy-video"></video>
    </div>
    <div class="status-bar" v-if="errorMsg">
      <el-alert :title="errorMsg" type="error" show-icon :closable="false" />
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import JMuxer from 'jmuxer'
import { getWsUrl } from '@/utils/config'
import { getServerInfo } from '@/api/system'

const props = defineProps({
  targetDeviceId: { type: String, required: true }
})

const videoRef = ref(null)
const loading = ref(true)
const errorMsg = ref('')
let ws = null
let jmuxer = null
const viewerSn = `viewer-${Date.now()}-${Math.floor(Math.random() * 1000)}`

const initPlayer = () => {
  if (!videoRef.value) return
  // 初始化 JMuxer H.264 解码器
  jmuxer = new JMuxer({
    node: videoRef.value,
    mode: 'video',
    flushingTime: 0, // 实时模式，尽可能低延迟
    fps: 30,
    debug: false,
    onError: (e) => {
      console.error('JMuxer error:', e)
      if (/MediaSource/.test(e.toString())) {
        errorMsg.value = '浏览器不支持 MSE 或 H.264 解码'
      }
    }
  })
}

const connect = async () => {
  try {
    // 1. 获取 Token (如果需要鉴权)
    const res = await getServerInfo()
    const token = res.data?.token || ''
    
    // 2. 建立独立的 WebSocket 连接用于传输视频流
    const wsUrl = getWsUrl() + (token ? `?token=${token}` : '')
    ws = new WebSocket(wsUrl)
    ws.binaryType = 'arraybuffer' // 关键：接收二进制数据

    ws.onopen = () => {
      loading.value = false
      // 发送开始投屏指令
      ws.send(JSON.stringify({
        action: 'start_stream',
        data: {
          device_sn: props.targetDeviceId,
          viewer_sn: viewerSn
        }
      }))
    }

    ws.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        handleBinaryData(event.data)
      }
    }

    ws.onerror = (e) => {
      console.error('Scrcpy WS Error:', e)
      errorMsg.value = '视频流连接断开'
      loading.value = false
    }

    ws.onclose = () => {
      console.log('Scrcpy WS Closed')
    }
  } catch (e) {
    errorMsg.value = '连接初始化失败: ' + e.message
    loading.value = false
  }
}

const handleBinaryData = (buffer) => {
  const view = new DataView(buffer)
  // 协议解析: 0xAA (Magic) | 0x02 (Type) | SN_Len | SN... | H264 Data...
  if (view.byteLength > 4 && view.getUint8(0) === 0xAA && view.getUint8(1) === 0x02) {
    const snLen = view.getUint8(2)
    // 校验 viewer_sn 是否匹配 (可选，防止串流)
    // const snBytes = new Uint8Array(buffer, 3, snLen)
    // const sn = new TextDecoder().decode(snBytes)
    
    const dataOffset = 3 + snLen
    const videoData = new Uint8Array(buffer, dataOffset)
    
    if (jmuxer && videoData.length > 0) {
      jmuxer.feed({ video: videoData })
    }
  }
}

onMounted(() => {
  initPlayer()
  connect()
})

onUnmounted(() => {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      action: 'stop_stream',
      data: {
        device_sn: props.targetDeviceId,
        viewer_sn: viewerSn
      }
    }))
    ws.close()
  }
  if (jmuxer) {
    jmuxer.destroy()
    jmuxer = null
  }
})
</script>

<style scoped>
.scrcpy-window {
  width: 100%;
  height: 100%;
  background: #000;
  display: flex;
  flex-direction: column;
  position: relative;
}

.video-wrapper {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.scrcpy-video {
  width: 100%;
  height: 100%;
  object-fit: contain; /* 保持比例 */
}

.status-bar {
  position: absolute;
  top: 10px;
  left: 10px;
  right: 10px;
  z-index: 10;
}
</style>