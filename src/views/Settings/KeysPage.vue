<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import RobotIntegrationsPanel from './RobotIntegrationsPanel.vue'
import { listAIProviders, saveAIProvider, deleteAIProvider, saveAIUsage } from '@/api/settings'

const activeTab = ref('model-keys')
const route = useRoute()
const loading = ref(false)
const savingId = ref('')
const savingUsage = ref(false)
const defaultProvider = ref('openai')
const providers = ref([])
const forms = reactive({})
const usage = reactive({
  case_execution_enabled: false,
  case_execution_provider_id: '',
})

const providerColors = {
  openai: '#10b981',
  anthropic: '#f97316',
  google: '#4285f4',
  deepseek: '#6366f1',
  qwen: '#8b5cf6',
  umodelverse: '#0ea5e9',
  volcengine: '#ef4444',
}

const configuredCount = computed(() => providers.value.filter((p) => p.configured).length)
const configuredProviders = computed(() => providers.value.filter((p) => p.configured && p.enabled !== false))

const tabs = [
  { id: 'model-keys', label: '大模型 Key', desc: '配置模型供应商' },
  { id: 'robots', label: '机器人', desc: '文档读取与消息通知' },
]

const syncForms = () => {
  for (const p of providers.value) {
    forms[p.id] = {
      name: p.name || '',
      api_type: p.api_type || 'openai',
      api_key: '',
      base_url: p.base_url || '',
      model: p.model || '',
      model_options: p.model_options?.length ? p.model_options : [p.model].filter(Boolean),
      enabled: p.enabled !== false,
      clear_key: false,
      set_default: defaultProvider.value === p.id,
    }
  }
}

const load = async () => {
  loading.value = true
  try {
    const res = await listAIProviders()
    const data = res?.data || {}
    providers.value = data.providers || []
    defaultProvider.value = data.default_provider || 'openai'
    Object.assign(usage, data.usage || {})
    if (!usage.case_execution_provider_id) {
      usage.case_execution_provider_id = defaultProvider.value
    }
    syncForms()
  } finally {
    loading.value = false
  }
}

const saveUsage = async () => {
  if (usage.case_execution_enabled && !usage.case_execution_provider_id && configuredProviders.value.length) {
    usage.case_execution_provider_id = configuredProviders.value[0].id
  }
  savingUsage.value = true
  try {
    await saveAIUsage({ copilot_enabled: false, ...usage, mode: 'local_first' })
    ElMessage.success('已生效')
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || e?.message || '保存失败')
    await load()
  } finally {
    savingUsage.value = false
  }
}

const save = async (provider) => {
  const form = forms[provider.id]
  if (!form) return
  savingId.value = provider.id
  try {
    await saveAIProvider(provider.id, form)
    ElMessage.success('已保存')
    await load()
  } finally {
    savingId.value = ''
  }
}

const clearKey = async (provider) => {
  const form = forms[provider.id]
  if (!form) return
  form.api_key = ''
  form.clear_key = true
  await save(provider)
}

const removeCustom = async (provider) => {
  savingId.value = provider.id
  try {
    await deleteAIProvider(provider.id)
    ElMessage.success('已删除')
    await load()
  } finally {
    savingId.value = ''
  }
}

const isPreset = (id) => [
  'openai',
  'anthropic',
  'umodelverse',
  'google',
  'deepseek',
  'qwen',
  'volcengine',
].includes(id)

onMounted(() => {
  if (['model-keys', 'robots'].includes(route.query.tab)) {
    activeTab.value = route.query.tab
  } else if (route.query.tab === 'ai-usage') {
    activeTab.value = 'model-keys'
  }
  load()
})
</script>

<template>
  <div class="settings-panel keys-page wide-panel" v-loading="loading">
    <header class="settings-page-header">
      <div>
        <h2 class="settings-page-title">密钥配置</h2>
        <p class="settings-page-desc">统一管理大模型 Key、用例执行 AI 策略和平台机器人凭据。</p>
      </div>
      <div class="settings-summary-pill">{{ configuredCount }} 个模型已配置</div>
    </header>

    <div class="settings-tabbar">
      <button
        v-for="t in tabs"
        :key="t.id"
        type="button"
        class="settings-tab"
        :class="{ active: activeTab === t.id }"
        @click="activeTab = t.id"
      >
        <strong>{{ t.label }}</strong>
        <span>{{ t.desc }}</span>
      </button>
    </div>

    <section v-if="activeTab === 'model-keys'">
      <section class="settings-info-card case-ai-card">
        <div>
          <span class="settings-kicker">用例执行</span>
          <h3>用例执行使用大模型能力</h3>
          <p>开启后，飞书/回归步骤规划链路会使用这里选择的已配置模型；关闭时继续使用本地 Plan。</p>
        </div>
        <div class="case-ai-controls">
          <el-switch v-model="usage.case_execution_enabled" :loading="savingUsage" @change="saveUsage" />
          <el-select
            v-model="usage.case_execution_provider_id"
            placeholder="选择模型能力"
            :disabled="!usage.case_execution_enabled"
            style="width: 220px"
            @change="saveUsage"
          >
            <el-option
              v-for="p in configuredProviders"
              :key="p.id"
              :label="p.name || p.id"
              :value="p.id"
            />
          </el-select>
        </div>
      </section>

      <section class="settings-info-card notice">
        <strong>配置说明</strong>
        <span>Key 只保存在本地服务端配置里，页面只显示脱敏值。Gemini 使用原生接口，OpenAI/DeepSeek/通义走兼容接口。</span>
      </section>

      <div class="provider-grid">
        <article
          v-for="p in providers"
          :key="p.id"
          class="provider-card"
          :style="{ '--brand': providerColors[p.id] || '#64748b' }"
        >
          <div class="card-head">
            <div class="brand-mark">{{ (p.name || p.id).slice(0, 1) }}</div>
            <div>
              <h3>{{ p.name }}</h3>
              <p>{{ p.configured ? `已配置 ${p.api_key_masked}` : '未配置 API Key' }}</p>
            </div>
            <el-tag size="small" effect="plain">{{ p.api_type === 'anthropic' ? 'Messages API' : 'Chat API' }}</el-tag>
            <el-tag v-if="defaultProvider === p.id" size="small" type="success" effect="dark">默认</el-tag>
          </div>

          <el-form v-if="forms[p.id]" label-position="top" class="provider-form">
            <el-form-item label="API Key">
              <el-input
                v-model="forms[p.id].api_key"
                type="password"
                show-password
                placeholder="sk-... / API Key"
                autocomplete="off"
              />
            </el-form-item>
            <el-form-item label="Base URL">
              <el-input v-model="forms[p.id].base_url" />
            </el-form-item>
            <el-form-item label="默认模型">
              <el-select
                v-model="forms[p.id].model"
                placeholder="选择平台模型"
                filterable
                style="width: 100%"
              >
                <el-option
                  v-for="model in forms[p.id].model_options"
                  :key="model"
                  :label="model"
                  :value="model"
                />
              </el-select>
            </el-form-item>
            <div class="switch-row">
              <el-checkbox v-model="forms[p.id].enabled">启用</el-checkbox>
              <el-checkbox v-model="forms[p.id].set_default">设为默认</el-checkbox>
            </div>
            <div class="card-actions">
              <el-button type="primary" :loading="savingId === p.id" @click="save(p)">保存</el-button>
              <el-button v-if="p.configured" text type="warning" @click="clearKey(p)">清除 Key</el-button>
              <el-button v-if="!isPreset(p.id)" text type="danger" @click="removeCustom(p)">删除</el-button>
            </div>
          </el-form>
        </article>
      </div>
    </section>

    <RobotIntegrationsPanel v-else />
  </div>
</template>

<style scoped>
.keys-page {
  width: 100%;
}

.case-ai-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 14px;
}

.case-ai-card h3 {
  margin: 7px 0 6px;
  color: #111827;
  font-size: 17px;
}

.case-ai-card p {
  margin: 0;
  color: #64748b;
  font-size: 13px;
  line-height: 1.6;
}

.case-ai-controls {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.notice {
  display: flex;
  gap: 10px;
  align-items: center;
  margin-bottom: 18px;
  color: #1e40af;
  font-size: 13px;
}

.provider-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
}

.provider-card {
  position: relative;
  overflow: hidden;
  padding: 18px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 16px;
  box-shadow: 0 8px 22px rgba(15, 23, 42, 0.04);
}

.provider-card::before {
  content: '';
  position: absolute;
  inset: 0 0 auto;
  height: 4px;
  background: var(--brand);
}

.card-head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.brand-mark {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border-radius: 10px;
  background: color-mix(in srgb, var(--brand) 14%, white);
  color: var(--brand);
  font-weight: 800;
}

.card-head h3 {
  margin: 0 0 3px;
  font-size: 15px;
  color: #111827;
}

.card-head p {
  margin: 0;
  font-size: 12px;
  color: #9ca3af;
}

.card-head .el-tag {
  margin-left: auto;
}

.provider-form :deep(.el-form-item) {
  margin-bottom: 12px;
}

.switch-row,
.card-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.switch-row {
  margin: 4px 0 14px;
}
</style>
