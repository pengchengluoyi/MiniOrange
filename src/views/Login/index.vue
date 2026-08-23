<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Minus, FullScreen, Close } from '@element-plus/icons-vue'
import { getAuthStatus, loginAccount, registerAccount, sendAuthCode } from '@/api/auth'
import { persistRealtimeTokens, bootstrapRealtime } from '@/utils/realtime'
import { pullAgentSessions } from '@/utils/agentSessions'
import { useAppChrome } from '@/composables/useAppChrome'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const router = useRouter()
const method = ref('email')
const mode = ref('login')
const name = ref('')
const email = ref('')
const account = ref('')
const password = ref('')
const confirm = ref('')
const showPassword = ref(false)
const loading = ref(false)
const sendingCode = ref(false)
const code = ref('')
const cooldown = ref(0)
const serverOk = ref(true)
const needsSetup = ref(false)
const mailConfigured = ref(false)
const { isElectron, isMac, showMacTraffic, showWinControls, handleMinimize, handleMaximize, handleClose } = useAppChrome()

let cooldownTimer = null

const isAccount = computed(() => method.value === 'account')
const isRegister = computed(() => !isAccount.value && mode.value === 'register')
const needCode = computed(() => mailConfigured.value || !needsSetup.value)
const title = computed(() => {
  if (isRegister.value) return '邮箱注册'
  return isAccount.value ? '账号登录' : '邮箱登录'
})
const subtitle = computed(() => {
  if (isRegister.value) return '用工作邮箱创建账号，验证后进入工作台。'
  if (isAccount.value) return '内部账号密码登录。账号在设置 → 本机账号添加。'
  return '使用已注册的邮箱登录。'
})
const submitLabel = computed(() => {
  if (loading.value) return '请稍候…'
  return isRegister.value ? '注册并进入' : '登录'
})

const goHome = () => router.replace('/')

const persistSession = (data) => {
  persistRealtimeTokens(data || {})
}

const setMethod = (next) => {
  method.value = next
  if (next === 'account') mode.value = 'login'
  password.value = ''
  confirm.value = ''
  code.value = ''
}

const setMode = (next) => {
  mode.value = next
  password.value = ''
  confirm.value = ''
  code.value = ''
}

const startCooldown = (sec) => {
  cooldown.value = Math.max(0, Number(sec) || 0)
  if (cooldownTimer) clearInterval(cooldownTimer)
  if (!cooldown.value) return
  cooldownTimer = setInterval(() => {
    cooldown.value -= 1
    if (cooldown.value <= 0) {
      cooldown.value = 0
      clearInterval(cooldownTimer)
      cooldownTimer = null
    }
  }, 1000)
}

const loadStatus = async () => {
  try {
    const res = await getAuthStatus()
    const data = res?.data || {}
    serverOk.value = true
    needsSetup.value = !!data.needs_setup
    mailConfigured.value = !!data.mail_configured
    if (data.logged_in) {
      goHome()
      return
    }
  } catch (_) {
    serverOk.value = false
  }
}

const validate = () => {
  if (isAccount.value) {
    if (!account.value.trim()) return '请填写账号'
    if (!password.value) return '请填写密码'
    return ''
  }
  const em = email.value.trim()
  if (!EMAIL_RE.test(em)) return '请填写有效邮箱'
  if (password.value.length < 8) return '密码至少 8 位'
  if (isRegister.value) {
    if (name.value.trim().length > 32) return '名称最多 32 个字符'
    if (password.value !== confirm.value) return '两次密码不一致'
    if (needCode.value && !/^\d{6}$/.test(code.value.trim())) return '请填写邮箱里的 6 位验证码'
  }
  return ''
}

const sendCode = async () => {
  const em = email.value.trim()
  if (!EMAIL_RE.test(em)) {
    ElMessage.warning('请先填写有效邮箱')
    return
  }
  sendingCode.value = true
  try {
    const res = await sendAuthCode({ email: em, purpose: 'register' })
    startCooldown(res?.data?.resend_sec || 60)
    ElMessage.success('验证码已发送，请查收邮箱')
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || e?.message || '验证码没发出去')
  } finally {
    sendingCode.value = false
  }
}

const submit = async () => {
  const err = validate()
  if (err) {
    ElMessage.warning(err)
    return
  }
  loading.value = true
  try {
    if (isRegister.value) {
      const res = await registerAccount({
        email: email.value.trim(),
        password: password.value,
        name: name.value.trim(),
        code: code.value.trim(),
      })
      persistSession(res?.data || {})
      ElMessage.success('注册成功')
    } else if (isAccount.value) {
      const res = await loginAccount({ account: account.value.trim(), password: password.value })
      persistSession(res?.data || {})
      ElMessage.success('登录成功')
    } else {
      const res = await loginAccount({ email: email.value.trim(), password: password.value })
      persistSession(res?.data || {})
      ElMessage.success('登录成功')
    }
    await bootstrapRealtime()
    await pullAgentSessions()
    goHome()
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || e?.message || (isRegister.value ? '注册失败' : '登录失败'))
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadStatus()
})
onUnmounted(() => {
  if (cooldownTimer) clearInterval(cooldownTimer)
})
</script>

<template>
  <div class="login-page" :class="{ 'is-electron': isElectron, 'is-mac': isMac }">
    <header class="login-chrome">
      <div v-if="showMacTraffic" class="mac-traffic" aria-hidden="true" />
      <div class="chrome-brand">
        <img src="@/assets/vue.svg" alt="" />
        <strong>MiniOrange</strong>
      </div>
      <div class="chrome-spacer" />
      <div v-if="showWinControls" class="win-controls">
        <button type="button" class="control-btn" title="最小化" @click="handleMinimize">
          <el-icon><Minus /></el-icon>
        </button>
        <button type="button" class="control-btn" title="最大化" @click="handleMaximize">
          <el-icon><FullScreen /></el-icon>
        </button>
        <button type="button" class="control-btn is-close" title="关闭" @click="handleClose">
          <el-icon><Close /></el-icon>
        </button>
      </div>
    </header>

    <div class="login-body">
      <section class="login-brand">
        <h1>把测试工作收进一个工作台</h1>
        <p>需求、用例、执行和知识在同一条链路上。先登录，再进你的项目。</p>
        <ul>
          <li>需求测试和版本测试分开走</li>
          <li>知识入库先机审，拿不准再留给人</li>
          <li>邮箱可注册，内部账号也能登录</li>
        </ul>
      </section>

      <section class="login-panel">
        <div class="login-card">
          <header>
            <h2>{{ title }}</h2>
            <p>{{ subtitle }}</p>
          </header>

          <div v-if="!serverOk" class="server-off">
            <p>连不上服务</p>
            <button type="button" class="ghost" @click="loadStatus">重试</button>
          </div>

          <template v-else>
            <div class="method-switch" role="tablist" aria-label="登录方式">
              <button type="button" role="tab" :class="{ on: !isAccount }" @click="setMethod('email')">邮箱</button>
              <button type="button" role="tab" :class="{ on: isAccount }" @click="setMethod('account')">账号密码</button>
            </div>

            <form class="login-form" @submit.prevent="submit">
              <label v-if="isRegister">
                名称
                <input v-model="name" type="text" autocomplete="name" placeholder="怎么称呼你（可选）" />
              </label>
              <label v-if="!isAccount">
                邮箱
                <input v-model="email" type="email" autocomplete="email" placeholder="name@company.com" />
              </label>
              <label v-else>
                账号
                <input v-model="account" type="text" autocomplete="username" placeholder="内部账号" />
              </label>
              <label v-if="isRegister && needCode">
                验证码
                <span class="code-row">
                  <input v-model="code" type="text" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="6 位数字" />
                  <button type="button" class="code-btn" :disabled="sendingCode || cooldown > 0" @click="sendCode">
                    {{ sendingCode ? '发送中…' : (cooldown > 0 ? `${cooldown}s` : '发送验证码') }}
                  </button>
                </span>
              </label>
              <p v-if="isRegister && !mailConfigured && needsSetup" class="hint-inline">本机还没配发信。第一个邮箱账号可以直接创建；之后注册要验证邮箱。</p>
              <p v-else-if="isRegister && !mailConfigured" class="hint-inline">请先到设置 → 密钥配置 → 发信邮箱填 SMTP，才能发验证码。</p>
              <label>
                密码
                <span class="pass-row">
                  <input
                    v-model="password"
                    :type="showPassword ? 'text' : 'password'"
                    :autocomplete="isRegister ? 'new-password' : 'current-password'"
                    :placeholder="isAccount ? '输入密码' : '至少 8 位'"
                  />
                  <button type="button" class="eye" @click="showPassword = !showPassword">
                    {{ showPassword ? '隐藏' : '显示' }}
                  </button>
                </span>
              </label>
              <label v-if="isRegister">
                确认密码
                <input v-model="confirm" :type="showPassword ? 'text' : 'password'" autocomplete="new-password" placeholder="再输入一次" />
              </label>
              <button type="submit" class="submit" :disabled="loading">{{ submitLabel }}</button>
            </form>

            <p v-if="!isAccount" class="switch">
              <template v-if="isRegister">
                已有邮箱账号？
                <button type="button" @click="setMode('login')">去登录</button>
              </template>
              <template v-else>
                还没有账号？
                <button type="button" @click="setMode('register')">邮箱注册</button>
              </template>
            </p>
          </template>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: #f6f7fb;
}
.login-chrome {
  flex-shrink: 0;
  height: 52px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 16px;
  background: #111827;
  color: #fff;
  -webkit-app-region: drag;
  user-select: none;
}
.mac-traffic {
  width: 78px;
  height: 100%;
  flex-shrink: 0;
}
.chrome-brand {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.chrome-brand img { width: 22px; height: 22px; }
.chrome-brand strong { font-size: 14px; font-weight: 700; }
.chrome-spacer { flex: 1; }
.win-controls {
  display: flex;
  height: 100%;
  margin-right: -16px;
  -webkit-app-region: no-drag;
}
.control-btn {
  width: 46px;
  height: 52px;
  border: 0;
  background: transparent;
  color: #cbd5e1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.control-btn:hover { background: rgba(255, 255, 255, 0.08); color: #fff; }
.control-btn.is-close:hover { background: #e81123; color: #fff; }
.login-body {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(320px, 1fr) minmax(420px, 520px);
}
.login-brand {
  padding: 48px 64px;
  background:
    radial-gradient(circle at 20% 20%, rgba(99, 102, 241, 0.16), transparent 42%),
    linear-gradient(180deg, #111827 0%, #1e1b4b 100%);
  color: #e5e7eb;
  display: flex;
  flex-direction: column;
  justify-content: center;
  overflow: auto;
}
.login-brand h1 {
  margin: 0 0 14px;
  font-size: 36px;
  line-height: 1.2;
  color: #fff;
  font-weight: 700;
  max-width: 420px;
}
.login-brand p {
  margin: 0 0 28px;
  max-width: 400px;
  color: #c7d2fe;
  font-size: 15px;
  line-height: 1.6;
}
.login-brand ul {
  margin: 0;
  padding: 0;
  list-style: none;
  color: #e0e7ff;
  font-size: 14px;
}
.login-brand li {
  position: relative;
  padding: 7px 0 7px 18px;
}
.login-brand li::before {
  content: '';
  position: absolute;
  left: 0;
  top: 14px;
  width: 7px;
  height: 7px;
  border-radius: 99px;
  background: #818cf8;
}
.login-panel {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px;
  overflow: auto;
}
.login-card {
  width: 100%;
  max-width: 380px;
}
.login-card header h2 {
  margin: 0;
  font-size: 26px;
  color: #111827;
}
.login-card header p {
  margin: 8px 0 22px;
  color: #6b7280;
  font-size: 14px;
}
.method-switch {
  display: grid;
  grid-template-columns: 1fr 1fr;
  padding: 4px;
  margin-bottom: 20px;
  border-radius: 12px;
  background: #eef2ff;
}
.method-switch button {
  height: 36px;
  border: 0;
  background: transparent;
  border-radius: 10px;
  color: #6b7280;
  font-weight: 600;
  cursor: pointer;
}
.method-switch button.on {
  background: #fff;
  color: #4338ca;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06);
}
.login-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.login-form label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: #374151;
}
.login-form input {
  height: 42px;
  width: 100%;
  border: 1px solid #e3e8f0;
  border-radius: 10px;
  padding: 0 12px;
  font-size: 14px;
  color: #111827;
  background: #fff;
  box-sizing: border-box;
}
.login-form input:focus {
  outline: none;
  border-color: #6366f1;
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.12);
}
.code-row,
.pass-row {
  position: relative;
  display: block;
}
.code-row {
  display: flex;
  gap: 8px;
}
.code-row input { flex: 1; }
.code-btn {
  flex-shrink: 0;
  height: 42px;
  padding: 0 12px;
  border: 1px solid #c7d2fe;
  border-radius: 10px;
  background: #eef2ff;
  color: #4338ca;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}
.code-btn:disabled { opacity: 0.55; cursor: default; }
.hint-inline {
  margin: -4px 0 0;
  color: #6b7280;
  font-size: 12px;
  line-height: 1.5;
}
.pass-row input { padding-right: 52px; }
.eye {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  border: 0;
  background: transparent;
  color: #6b7280;
  font-size: 12px;
  cursor: pointer;
}
.submit {
  margin-top: 6px;
  height: 44px;
  border: 0;
  border-radius: 12px;
  background: #4f46e5;
  color: #fff;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
}
.submit:disabled { opacity: 0.6; cursor: default; }
.switch {
  margin: 18px 0 0;
  text-align: center;
  color: #6b7280;
  font-size: 13px;
}
.switch button {
  border: 0;
  background: transparent;
  color: #4f46e5;
  font-weight: 600;
  cursor: pointer;
}
.server-off {
  text-align: center;
  color: #b91c1c;
  font-size: 13px;
}
.ghost {
  margin-top: 8px;
  border: 1px solid #e3e8f0;
  background: #fff;
  border-radius: 999px;
  padding: 6px 14px;
  cursor: pointer;
}
@media (max-width: 860px) {
  .login-body { grid-template-columns: 1fr; }
  .login-brand { display: none; }
  .login-panel { padding: 24px 20px 32px; }
}
</style>
