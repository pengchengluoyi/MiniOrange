<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { getClawnodeLogsDir, saveClawnodeLogsDir } from '@/api/settings'

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
  // 仅提示用户在服务器机器上查看，浏览器无法直接打开服务器路径
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
  <div class="system-settings">
    <div class="page-header">
      <h2>系统设置</h2>
      <p class="desc">配置服务端通用行为。修改后部分功能需重启或重新触发才生效。</p>
    </div>

    <el-card class="setting-card" shadow="never">
      <template #header>
        <div class="card-header">
          <span>ClawNode 日志存储目录</span>
          <el-tag size="small" type="info">服务端生效</el-tag>
        </div>
      </template>

      <div class="setting-row">
        <div class="label">
          当前配置路径
          <div class="hint">留空则使用默认位置（当前用户的 Downloads/ClawNodeLogs）</div>
        </div>
        <div class="value">
          <el-input
            v-model="form.path"
            placeholder="例如：/Users/xxx/Downloads/ClawNodeLogs 或 /data/logs/clawnode"
            :disabled="saving || loading"
            style="max-width: 520px;"
          />
          <div class="actions">
            <el-button size="small" @click="useDefault" :disabled="saving">使用默认（Downloads）</el-button>
            <el-button size="small" @click="openDir" :disabled="loading">查看当前生效目录</el-button>
            <el-button type="primary" size="small" @click="save" :loading="saving" :disabled="loading">
              保存
            </el-button>
          </div>
        </div>
      </div>

      <div class="current-info">
        <div><strong>生效目录：</strong> {{ data.effective || '（加载中...）' }}</div>
        <div v-if="data.configured" class="small">已配置值：{{ data.configured }}</div>
        <div class="small" style="color:#9ca3af; margin-top:4px;">
          说明：ClawNode 通过 /api/clawnode/logs 上传的设备日志会保存到此目录。建议放在有足够空间且方便备份的位置。
        </div>
      </div>
    </el-card>

    <el-alert
      title="注意"
      type="warning"
      :closable="false"
      style="margin-top: 12px;"
    >
      此路径是<strong>服务端所在机器</strong>上的路径。修改后，新上传的日志会写入新目录；历史日志仍保留在原位置。
    </el-alert>
  </div>
</template>

<style scoped>
.system-settings {
  padding: 12px 16px;
  max-width: 820px;
}
.page-header h2 {
  margin: 0 0 4px;
  font-size: 20px;
}
.page-header .desc {
  margin: 0 0 16px;
  color: #6b7280;
  font-size: 13px;
}
.setting-card {
  border: 1px solid #e5e7eb;
}
.card-header {
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
}
.setting-row {
  display: flex;
  gap: 16px;
  align-items: flex-start;
}
.setting-row .label {
  width: 140px;
  flex-shrink: 0;
  font-size: 13px;
  color: #374151;
  padding-top: 6px;
}
.setting-row .label .hint {
  font-size: 12px;
  color: #9ca3af;
  margin-top: 2px;
}
.setting-row .value {
  flex: 1;
}
.actions {
  margin-top: 8px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.current-info {
  margin-top: 12px;
  background: #f8fafc;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  padding: 10px 12px;
  font-size: 13px;
}
.current-info .small {
  font-size: 12px;
  color: #4b5563;
}
</style>