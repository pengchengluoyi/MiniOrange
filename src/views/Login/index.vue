<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { getServerInfo, getNodeStatus } from '@/api/system'
import QRCode from 'qrcode'
import { ElMessage, ElButton } from 'element-plus'

const router = useRouter()
const qrCodeUrl = ref('')
const hostname = ref('')
const loading = ref(false)
const isConnected = ref(true)

// 获取配网二维码
const fetchQrCode = async () => {
  console.log('[Login] fetchQrCode: 开始获取二维码...')
  loading.value = true
  isConnected.value = true
  try {// 只有当第一次获取时才显示 loading，避免轮询时界面闪烁
    if (!qrCodeUrl.value) loading.value = true
    console.log('[Login] fetchQrCode: 正在调用 getServerInfo()...')
    const res = await getServerInfo()
    console.log('[Login] fetchQrCode: getServerInfo 返回结果:', res)
    if (res.code === 200) {
      hostname.value = res.data.hostname
      // 渲染二维码
      qrCodeUrl.value = await QRCode.toDataURL(res.data.qr_payload, {
        width: 280,
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' }
      })
    } else {
      console.warn('[Login] fetchQrCode: 服务端返回非 200 状态', res)
      isConnected.value = false
    }
  } catch (e) {
    console.error('[Login] fetchQrCode: 调用异常!', e)
    console.error('⚠️ 如果看到 404 错误，说明 getServerInfo 仍在使用 HTTP。请检查 src/api/system.js 是否已改为 WebSocket。')
  } finally {
    loading.value = false
  }
}

// 新增：处理缓存清除与重置
const handleReset = () => {
  localStorage.removeItem('ws_token') // 清除 WebSocket Token
  localStorage.removeItem('token')    // 清除可能存在的其他 Token
  window.location.reload()            // 刷新页面以重新初始化连接
}

// 轮询或监听状态变化
let pollTimer = null
let qrRetryTimer = null // [新增] 二维码重试定时器
const checkStatus = async () => {
  if (!isConnected.value) return
  try {
    // console.log('[Login] checkStatus: 轮询节点状态...')
    const res = await getNodeStatus()
    // 🔥 核心商业逻辑：一旦检测到角色变成 node，说明手机扫码成功了
    if (res.code === 200 && res.data.role === 'node') {
      console.log('[Login] checkStatus: 检测到角色变更为 node，登录成功！')
      ElMessage.success('登录成功')
      router.replace('/')
    }
  } catch (e) {
    console.error('[Login] checkStatus: 轮询出错', e)
    // 忽略轮询错误
  }
}

onMounted(() => {
  fetchQrCode()
  // 每 2 秒检查一次是否被扫码
  // 如果 1 秒后还没有二维码，就每隔 1 秒试一次，直到成功拿到为止
  qrRetryTimer = setInterval(() => {
    if (!qrCodeUrl.value) {
      fetchQrCode()
    } else {
      clearInterval(qrRetryTimer) // 拿到二维码了，停止重试
      loading.value = false       // 确保 Loading 关闭
    }
  }, 1000)

  // 3. 状态检查轮询 (保持原样)
  pollTimer = setInterval(checkStatus, 2000)
})

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer)
})
</script>

<template>
  <div class="login-container">
    <div class="login-card">
      <div class="brand">
        <img src="@/assets/vue.svg" alt="Logo" class="logo" /> <h1>MiniOrange Desktop</h1>
      </div>

      <div class="qr-wrapper" v-loading="loading">
        <div v-if="!isConnected" class="disconnect-mask">
          <p>连接断开</p>
          <p class="sub-tip">若服务端已绑定且 Token 丢失，请手动删除后端 server_config.json 并重启</p>
          <el-button type="primary" size="small" @click="fetchQrCode">重试</el-button>
          <el-button link type="danger" size="small" @click="handleReset" style="margin-top: 8px;">清除缓存并刷新</el-button>
        </div>
        <img v-else-if="qrCodeUrl" :src="qrCodeUrl" class="qr-img" />
        <div v-else class="qr-placeholder">等待加载...</div>
      </div>

      <div class="guide">
        <h3>扫码登录</h3>
        <p>请使用 App 扫描二维码以绑定设备</p>
      </div>

      <div class="footer-info">
        Device: {{ hostname || 'Unknown' }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.login-container {
  height: 100vh;
  width: 100vw;
  background-color: #f0f2f5;
  background-image: radial-gradient(#e2e8f0 1px, transparent 1px);
  background-size: 20px 20px;
  display: flex;
  justify-content: center;
  align-items: center;
}

.login-card {
  background: white;
  width: 400px;
  padding: 40px;
  border-radius: 16px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.brand {
  margin-bottom: 24px;
}
.brand h1 {
  margin: 0;
  font-size: 24px;
  color: #1e293b;
  font-weight: 700;
}
.logo { width: 48px; height: 48px; margin-bottom: 8px; }

.qr-wrapper {
  margin-bottom: 24px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 10px;
  position: relative;
  min-height: 280px;
  min-width: 280px;
  display: flex;
  justify-content: center;
  align-items: center;
}
.qr-img { display: block; }

.disconnect-mask {
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(255, 255, 255, 0.9);
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  z-index: 10;
}
.disconnect-mask p { color: #f56c6c; margin-bottom: 10px; font-weight: 600; }
.disconnect-mask .sub-tip { font-size: 12px; color: #909399; font-weight: 400; margin-bottom: 16px; text-align: center; padding: 0 20px; }

.guide h3 { margin: 0 0 8px 0; color: #334155; }
.guide p { margin: 0; color: #64748b; font-size: 14px; }

.footer-info {
  margin-top: 32px;
  font-size: 12px;
  color: #94a3b8;
  font-family: monospace;
}
</style>