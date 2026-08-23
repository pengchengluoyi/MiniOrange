<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { getClawnodeLogsDir, saveClawnodeLogsDir } from '@/api/settings'
import './settings-ui.css'

const loading = ref(false)
const saving = ref(false)
const data = ref({
  configured: '',
  effective: '',
  default: '',
})

const form = ref({
  path: '',
})

async function load() {
  loading.value = true
  try {
    const res = await getClawnodeLogsDir()
    if (res?.code === 200 && res.data) {
      data.value = res.data
      form.value.path = res.data.configured || res.data.effective || ''
    }
  } catch (e) {
    ElMessage.error('加载系统设置失败')
  } finally {
    loading.value = false
  }
}

async function save() {
  saving.value = true
  try {
    const res = await saveClawnodeLogsDir(form.value.path)
    if (res?.code === 200) {
      ElMessage.success('已保存')
      await load()
    } else {
      ElMessage.error(res?.msg || '保存失败')
    }
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || '保存失败')
  } finally {
    saving.value = false
  }
}

function useDefault() {
  if (data.value.default) {
    form.value.path = data.value.default
    ElMessage.info('已填入默认 Downloads 路径，点击保存生效')
  }
}

function openDir() {
  ElMessage({
    message: `当前生效目录（在服务器上）：${data.value.effective || '（未配置，使用默认 Downloads）'}`,
    type: 'info',
    duration: 6000,
  })
}

onMounted(() => {
  load()
})
</script>

<template>
  <div class="settings-panel system-page wide-panel" v-loading="loading">
    <header class="settings-page-header">
      <div>
        <h2 class="settings-page-title">系统设置</h2>
        <p class="settings-page-desc">配置服务端通用行为。修改后部分功能需重启或重新触发才生效。</p>
      </div>
    </header>

    <section class="settings-card">
      <div class="settings-kicker">ClawNode 日志</div>
      <h3 class="system-card-title">日志存储目录</h3>
      <p class="settings-page-desc">留空则使用默认位置（当前用户的 Downloads/ClawNodeLogs）。路径在服务端机器上生效。</p>
      <label class="system-path-label">
        当前配置路径
        <input
          v-model="form.path"
          type="text"
          :disabled="saving || loading"
          placeholder="例如：/Users/xxx/Downloads/ClawNodeLogs"
        />
      </label>
      <div class="system-actions">
        <button type="button" class="settings-action-pill" :disabled="saving" @click="useDefault">
          使用默认
        </button>
        <button type="button" class="settings-action-pill" :disabled="loading" @click="openDir">
          查看生效目录
        </button>
        <button type="button" class="settings-action-pill" :disabled="loading" @click="save">
          {{ saving ? '保存中…' : '保存' }}
          <span class="settings-action-arrow">→</span>
        </button>
      </div>
      <div class="system-meta">
        <div><strong>生效目录：</strong>{{ data.effective || '（加载中…）' }}</div>
        <div v-if="data.configured">已配置值：{{ data.configured }}</div>
        <p>ClawNode 通过 /api/clawnode/logs 上传的设备日志会写到这里。建议放在有足够空间、方便备份的位置。</p>
      </div>
    </section>

    <section class="settings-info-card">
      <span class="settings-kicker">注意</span>
      <p>此路径是服务端所在机器上的路径。修改后，新上传的日志会写入新目录；历史日志仍保留在原位置。</p>
    </section>
  </div>
</template>

<style scoped>
.system-card-title {
  margin: 8px 0 4px;
  font-size: 16px;
  font-weight: 700;
  color: #111827;
}
.system-path-label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 14px 0 12px;
  font-size: 12px;
  font-weight: 600;
  color: #374151;
}
.system-path-label input {
  height: 40px;
  border: 1px solid #e3e8f0;
  border-radius: 10px;
  padding: 0 12px;
  font-size: 14px;
  color: #111827;
}
.system-path-label input:focus {
  outline: none;
  border-color: #6366f1;
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.12);
}
.system-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 14px;
}
.system-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
  color: #4b5563;
}
.system-meta p {
  margin: 6px 0 0;
  color: #9ca3af;
  font-size: 12px;
}
</style>
