<template>
  <el-dialog
      :model-value="modelValue"
      width="720px"
      class="project-env-dialog"
      align-center
      destroy-on-close
      :show-close="true"
      @close="$emit('update:modelValue', false)"
  >
    <template #header>
      <div class="dialog-head">
        <div>
          <h2 class="dialog-title">运行环境</h2>
          <p class="dialog-desc">{{ displayProjectName }} · 包名与 URL 统一在此维护</p>
        </div>
      </div>
    </template>

    <div v-loading="loading" class="env-shell">
      <nav class="env-nav" aria-label="环境列表">
        <button
            v-for="p in ENV_PROFILES"
            :key="p.key"
            type="button"
            class="env-nav-item"
            :class="{ active: activeTab === p.key, 'is-default': defaultProfile === p.key }"
            @click="activeTab = p.key"
        >
          <span class="nav-label">{{ p.label }}</span>
          <span v-if="defaultProfile === p.key" class="nav-badge">默认</span>
          <span v-else-if="profileFilled(p.key)" class="nav-dot" title="已填写" />
        </button>
      </nav>

      <section class="env-panel">
        <div class="panel-toolbar">
          <span class="panel-title">正在编辑：{{ activeProfileLabel }}</span>
          <el-button
              v-if="defaultProfile !== activeTab"
              link
              type="primary"
              size="small"
              @click="defaultProfile = activeTab"
          >
            设为 Workflow 默认环境
          </el-button>
          <el-tag v-else size="small" type="success" effect="plain">Workflow 默认</el-tag>
        </div>

        <div class="field-list">
          <div v-for="f in PROFILE_FIELDS" :key="f.varKey" class="field-row">
            <div class="field-label">
              <span class="field-name">{{ f.label }}</span>
              <button type="button" class="var-chip" @click="copyKey(f.varKey)">{{ wrapVar(f.varKey) }}</button>
            </div>
            <el-input
                v-model="profiles[activeTab][f.modelPath[0]][f.modelPath[1]]"
                :placeholder="f.placeholder"
                clearable
                spellcheck="false"
            />
          </div>
        </div>

        <p class="panel-hint">
          Workflow 运行时可临时切换环境；节点占位符始终为
          <code v-pre>{{app.android.package}}</code> 等，由服务端按所选环境解析。
        </p>
      </section>
    </div>

    <template #footer>
      <div class="dialog-footer">
        <span class="footer-meta">四套环境一次保存</span>
        <div class="footer-actions">
          <el-button @click="$emit('update:modelValue', false)">取消</el-button>
          <el-button type="primary" :loading="saving" @click="handleSave">保存</el-button>
        </div>
      </div>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, reactive, watch, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { getProjectEnv, updateProjectEnv } from '@/api/workReport'
import { ENV_PROFILES, emptyPlatformEnv } from '@/constants/envProfiles'

const PROFILE_FIELDS = [
  {
    label: 'Android 包名',
    varKey: 'app.android.package',
    modelPath: ['android', 'package'],
    placeholder: 'com.example.app.dev',
  },
  {
    label: 'iOS Bundle',
    varKey: 'app.ios.bundle',
    modelPath: ['ios', 'bundle'],
    placeholder: 'com.example.app',
  },
  {
    label: 'Web 地址',
    varKey: 'app.web.base_url',
    modelPath: ['web', 'base_url'],
    placeholder: 'https://test.example.com',
  },
]

const props = defineProps({
  modelValue: Boolean,
  projectId: { type: String, default: '' },
  projectName: { type: String, default: '' },
})
const emit = defineEmits(['update:modelValue', 'saved'])

const loading = ref(false)
const saving = ref(false)
const loadedProjectName = ref('')
const defaultProfile = ref('test')
const activeTab = ref('test')

const profiles = reactive(
    Object.fromEntries(ENV_PROFILES.map((p) => [p.key, emptyPlatformEnv()]))
)

const displayProjectName = computed(
    () => props.projectName || loadedProjectName.value || '未命名项目'
)

const activeProfileLabel = computed(
    () => ENV_PROFILES.find((p) => p.key === activeTab.value)?.label || activeTab.value
)

const wrapVar = (key) => `{{${key}}}`

const profileFilled = (key) => {
  const snap = profiles[key]
  if (!snap) return false
  return Boolean(
      snap.android?.package?.trim() ||
      snap.ios?.bundle?.trim() ||
      snap.web?.base_url?.trim()
  )
}

const fillProfiles = (doc) => {
  const env = doc?.env || doc || {}
  defaultProfile.value = env.default_profile || 'test'
  activeTab.value = defaultProfile.value
  const incoming = env.profiles || {}
  for (const p of ENV_PROFILES) {
    const snap = incoming[p.key] || {}
    profiles[p.key].android.package = snap.android?.package || ''
    profiles[p.key].ios.bundle = snap.ios?.bundle || ''
    profiles[p.key].web.base_url = snap.web?.base_url || ''
  }
}

const buildPayload = () => {
  const out = {}
  for (const p of ENV_PROFILES) {
    out[p.key] = {
      android: { package: (profiles[p.key].android.package || '').trim() },
      ios: { bundle: (profiles[p.key].ios.bundle || '').trim() },
      web: { base_url: (profiles[p.key].web.base_url || '').trim() },
    }
  }
  return { default_profile: defaultProfile.value, profiles: out }
}

const loadProject = async () => {
  if (!props.projectId) return
  loading.value = true
  try {
    const res = await getProjectEnv(props.projectId)
    const data = res?.data || res || {}
    loadedProjectName.value = data.project_name || ''
    fillProfiles(data)
  } catch {
    ElMessage.error('加载项目环境失败')
  } finally {
    loading.value = false
  }
}

const copyKey = async (key) => {
  const text = wrapVar(key)
  try {
    await navigator.clipboard.writeText(text)
    ElMessage.success('已复制')
  } catch {
    ElMessage.info(text)
  }
}

watch(
    () => [props.modelValue, props.projectId],
    ([visible, projectId]) => {
      if (visible && projectId) loadProject()
    }
)

const handleSave = async () => {
  if (!props.projectId) {
    ElMessage.warning('缺少 projectId')
    return
  }
  saving.value = true
  try {
    const payload = buildPayload()
    await updateProjectEnv(props.projectId, payload)
    ElMessage.success('环境配置已保存')
    emit('saved', payload)
    emit('update:modelValue', false)
  } catch {
    ElMessage.error('保存失败')
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.dialog-head {
  padding-right: 8px;
}

.dialog-title {
  margin: 0;
  font-size: 17px;
  font-weight: 650;
  color: #111827;
  letter-spacing: -0.02em;
}

.dialog-desc {
  margin: 4px 0 0;
  font-size: 13px;
  color: #6b7280;
}

.env-shell {
  display: flex;
  gap: 0;
  min-height: 280px;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  overflow: hidden;
  background: #fafafa;
}

.env-nav {
  width: 132px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 8px;
  background: #f3f4f6;
  border-right: 1px solid #e5e7eb;
}

.env-nav-item {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 10px 12px;
  border: none;
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  text-align: left;
  font-size: 14px;
  font-weight: 500;
  color: #4b5563;
  transition: background 0.15s, color 0.15s;
}

.env-nav-item:hover {
  background: #fff;
  color: #111827;
}

.env-nav-item.active {
  background: #fff;
  color: #111827;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.env-nav-item.is-default .nav-label {
  font-weight: 600;
}

.nav-label {
  flex: 1;
}

.nav-badge {
  font-size: 10px;
  font-weight: 600;
  color: #059669;
  background: #ecfdf5;
  padding: 1px 6px;
  border-radius: 4px;
}

.nav-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #94a3b8;
  flex-shrink: 0;
}

.env-panel {
  flex: 1;
  padding: 16px 20px 12px;
  background: #fff;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.panel-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
}

.panel-title {
  font-size: 13px;
  font-weight: 600;
  color: #374151;
  flex: 1;
}

.field-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.field-row {
  display: grid;
  grid-template-columns: 148px 1fr;
  gap: 12px;
  align-items: center;
}

.field-label {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.field-name {
  font-size: 13px;
  font-weight: 600;
  color: #1f2937;
}

.var-chip {
  align-self: flex-start;
  padding: 0;
  border: none;
  background: none;
  font-size: 11px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  color: #6b7280;
  cursor: pointer;
  line-height: 1.3;
}

.var-chip:hover {
  color: #2563eb;
}

.panel-hint {
  margin: 16px 0 0;
  font-size: 12px;
  color: #9ca3af;
  line-height: 1.5;
}

.panel-hint code {
  font-size: 11px;
  color: #6b7280;
  background: #f3f4f6;
  padding: 1px 4px;
  border-radius: 4px;
}

.dialog-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.footer-meta {
  font-size: 12px;
  color: #9ca3af;
}

.footer-actions {
  display: flex;
  gap: 8px;
}

@media (max-width: 640px) {
  .env-shell {
    flex-direction: column;
  }

  .env-nav {
    width: 100%;
    flex-direction: row;
    flex-wrap: wrap;
    border-right: none;
    border-bottom: 1px solid #e5e7eb;
  }

  .field-row {
    grid-template-columns: 1fr;
    gap: 6px;
  }
}
</style>

<style>
.project-env-dialog.el-dialog {
  border-radius: 14px;
  overflow: hidden;
  background: #fff !important;
  box-shadow: 0 20px 50px rgba(15, 23, 42, 0.12) !important;
}

.project-env-dialog .el-dialog__header {
  margin: 0;
  padding: 20px 24px 12px;
  border-bottom: 1px solid #f3f4f6;
}

.project-env-dialog .el-dialog__body {
  padding: 16px 24px;
}

.project-env-dialog .el-dialog__footer {
  padding: 12px 24px 18px;
  border-top: 1px solid #f3f4f6;
}

.project-env-dialog .field-row .el-input__wrapper {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 13px;
}
</style>
