<script setup>
import { computed, ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  listRobotIntegrations,
  createRobotIntegration,
  updateRobotIntegration,
  deleteRobotIntegration,
} from '@/api/settings'

const loading = ref(false)
const saving = ref(false)
const bots = ref([])

const dialogVisible = ref(false)
const editingId = ref('')
const selectedPlatform = ref('lark')
const form = ref({ name: '', credentials: {} })

const platforms = [
  {
    id: 'lark',
    name: '飞书',
    status: '已支持',
    color: '#2563eb',
    desc: '读取多维表格/电子表格，用于回归用例、报告通知和执行结果同步。',
    fields: [
      { key: 'app_id', label: 'App ID', placeholder: 'cli_xxxxxxxx', required: true },
      { key: 'app_secret', label: 'App Secret', placeholder: '应用凭证 Secret', required: true, secret: true },
    ],
    docs: [
      '进入飞书开放平台，创建企业自建应用。',
      '复制 App ID 和 App Secret 填入这里。',
      '按实际用途申请表格读取、消息发送等权限，并发布应用。',
    ],
  },
  {
    id: 'wecom',
    name: '企业微信',
    status: '已支持',
    color: '#10b981',
    desc: '适合接入群机器人 webhook，用于发送回归结果、失败告警和日报。',
    fields: [
      { key: 'webhook_url', label: 'Webhook', placeholder: 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=...', required: true, secret: true },
      { key: 'secret', label: '加签 Secret', placeholder: '可选，机器人安全设置里的 secret', secret: true },
    ],
    docs: [
      '企业微信群内添加群机器人，复制 webhook 地址。',
      '如需读取文档，需要企业微信自建应用的 corpId、agentId、secret。',
      '当前已支持保存 webhook；发送消息能力接入时会读取这里的配置。',
    ],
  },
  {
    id: 'dingtalk',
    name: '钉钉',
    status: '已支持',
    color: '#0ea5e9',
    desc: '适合发送测试通知、审批流提醒和群消息。',
    fields: [
      { key: 'webhook_url', label: 'Webhook', placeholder: 'https://oapi.dingtalk.com/robot/send?access_token=...', required: true, secret: true },
      { key: 'secret', label: '加签 Secret', placeholder: 'SEC...', secret: true },
    ],
    docs: [
      '钉钉群添加自定义机器人，启用加签更安全。',
      '复制 webhook 和 secret。',
      '当前已支持保存 webhook 与加签 secret。',
    ],
  },
  {
    id: 'slack',
    name: 'Slack',
    status: '已支持',
    color: '#8b5cf6',
    desc: '适合海外团队通知、频道消息和结果同步。',
    fields: [
      { key: 'webhook_url', label: 'Webhook URL', placeholder: 'https://hooks.slack.com/services/...', required: true, secret: true },
      { key: 'channel', label: 'Channel', placeholder: '#qa-report' },
      { key: 'bot_token', label: 'Bot Token', placeholder: 'xoxb-...', secret: true },
    ],
    docs: [
      '创建 Slack App 并启用 Incoming Webhooks。',
      '选择目标 channel，复制 webhook URL。',
      '当前已支持保存 webhook、channel 和 bot token。',
    ],
  },
]

const selectedPlatformMeta = computed(() => platforms.find((p) => p.id === selectedPlatform.value) || platforms[0])

const platformCount = (platform) => bots.value.filter((b) => b.platform === platform).length

const load = async () => {
  loading.value = true
  try {
    const res = await listRobotIntegrations()
    bots.value = res?.data?.bots || []
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || e?.message || '加载失败')
  } finally {
    loading.value = false
  }
}

const openCreate = (platform = 'lark') => {
  editingId.value = ''
  selectedPlatform.value = platform
  form.value = { name: '', credentials: {} }
  dialogVisible.value = true
}

const openEdit = (row) => {
  editingId.value = row.id
  selectedPlatform.value = row.platform || 'lark'
  form.value = {
    name: row.name,
    credentials: { ...(row.credentials || {}), app_id: row.app_id || row.credentials?.app_id || '' },
  }
  dialogVisible.value = true
}

const submit = async () => {
  if (!form.value.name?.trim()) return ElMessage.warning('请填写机器人名称')
  const meta = selectedPlatformMeta.value
  for (const field of meta.fields || []) {
    if (field.required && !editingId.value && !form.value.credentials?.[field.key]?.trim()) {
      return ElMessage.warning(`请填写 ${field.label}`)
    }
  }
  saving.value = true
  try {
    const payload = {
      platform: selectedPlatform.value,
      name: form.value.name.trim(),
      credentials: { ...(form.value.credentials || {}) },
    }
    if (editingId.value) {
      await updateRobotIntegration(editingId.value, payload)
      ElMessage.success('已更新')
    } else {
      await createRobotIntegration(payload)
      ElMessage.success('已添加')
    }
    dialogVisible.value = false
    await load()
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || e?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

const platformName = (platform) => platforms.find((p) => p.id === platform)?.name || platform

const credentialSummary = (row) => {
  if (row.platform === 'lark') return row.app_id || '—'
  const masked = row.masked || {}
  return masked.webhook_url_masked || row.credentials?.channel || '—'
}

const remove = async (row) => {
  try {
    await ElMessageBox.confirm(`确定删除机器人「${row.name}」？`, '删除确认', { type: 'warning' })
    await deleteRobotIntegration(row.id)
    ElMessage.success('已删除')
    await load()
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(e?.response?.data?.detail || e?.message || '删除失败')
  }
}

onMounted(load)
</script>

<template>
  <div class="robot-panel">
    <div class="platform-grid">
      <article
        v-for="p in platforms"
        :key="p.id"
        class="platform-card"
        :style="{ '--brand': p.color }"
      >
        <div class="platform-head">
          <span class="platform-dot"></span>
          <strong>{{ p.name }}</strong>
          <el-tag size="small" type="success">{{ p.status }}</el-tag>
        </div>
        <div class="platform-count">{{ platformCount(p.id) }} 个已配置</div>
        <p>{{ p.desc }}</p>
        <button type="button" class="settings-action-pill platform-add" @click="openCreate(p.id)">
          <span>添加 {{ p.name }} 机器人</span>
          <span class="settings-action-arrow">→</span>
        </button>
        <details>
          <summary>如何配置</summary>
          <ol>
            <li v-for="item in p.docs" :key="item">{{ item }}</li>
          </ol>
        </details>
      </article>
    </div>

    <section class="table-card">
      <div class="table-title">
        <h3>已配置机器人</h3>
        <span>当前可用于用例读取与消息通知</span>
      </div>
      <el-table v-loading="loading" :data="bots" empty-text="暂无机器人，请先选择上方平台添加">
        <el-table-column label="平台" width="110">
          <template #default="{ row }">{{ platformName(row.platform) }}</template>
        </el-table-column>
        <el-table-column prop="name" label="名称" min-width="140" />
        <el-table-column label="关键凭据" min-width="220" show-overflow-tooltip>
          <template #default="{ row }">{{ credentialSummary(row) }}</template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag :type="row.configured ? 'success' : 'info'" size="small">
              {{ row.configured ? '就绪' : '未完成' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
            <el-button link type="danger" @click="remove(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </section>

    <el-dialog
      v-model="dialogVisible"
      :title="editingId ? '编辑机器人' : `添加 ${selectedPlatformMeta.name} 机器人`"
      width="480px"
      destroy-on-close
    >
      <el-form label-width="100px">
        <el-form-item label="名称" required>
          <el-input v-model="form.name" :placeholder="`如：${selectedPlatformMeta.name} 回归通知`" />
        </el-form-item>
        <el-form-item
          v-for="field in selectedPlatformMeta.fields"
          :key="field.key"
          :label="field.label"
          :required="field.required && !editingId"
        >
          <el-input
            v-model="form.credentials[field.key]"
            :type="field.secret ? 'password' : 'text'"
            :show-password="field.secret"
            :placeholder="editingId && field.secret ? '留空保持不变' : field.placeholder"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.robot-panel {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.table-card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 16px;
  padding: 18px;
}

.table-title h3 {
  margin: 0 0 4px;
  font-size: 16px;
  color: #111827;
}

.table-title span {
  margin: 0;
  color: #6b7280;
  font-size: 13px;
}

.platform-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 12px;
}

.platform-card {
  padding: 14px;
  border-radius: 14px;
  border: 1px solid color-mix(in srgb, var(--brand) 26%, #e5e7eb);
  background: #fff;
}

.platform-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.platform-head strong {
  color: #111827;
  font-size: 14px;
}

.platform-dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: var(--brand);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--brand) 14%, white);
}

.platform-card p {
  min-height: 38px;
  margin: 8px 0 10px;
  color: #6b7280;
  font-size: 12px;
  line-height: 1.55;
}

.platform-count {
  display: inline-flex;
  align-items: center;
  padding: 3px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--brand) 10%, white);
  color: var(--brand);
  font-size: 12px;
  font-weight: 700;
}

.platform-add {
  margin-bottom: 10px;
}

.platform-card details {
  font-size: 12px;
  color: #475569;
}

.platform-card summary {
  cursor: pointer;
  color: var(--brand);
  font-weight: 600;
}

.platform-card ol {
  margin: 8px 0 0;
  padding-left: 18px;
  line-height: 1.7;
}

.table-title {
  margin-bottom: 12px;
}
</style>
