<template>
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
          设为默认执行环境
        </el-button>
        <el-tag v-else size="small" type="success" effect="plain">默认环境</el-tag>
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
        回归 / 飞书 / 对话流执行时，按应用所选的「执行环境 Profile」解析包名与 Web 地址。
        占位符仍为 <code v-pre>{{app.android.package}}</code> 等。
      </p>
    </section>
  </div>
</template>

<script setup>
import { ref, reactive, watch, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { getProjectEnv, updateProjectEnv } from '@/api/workReport'
import { ENV_PROFILES, emptyPlatformEnv } from '@/constants/envProfiles'

const PROFILE_FIELDS = [
  { label: 'Android 包名', varKey: 'app.android.package', modelPath: ['android', 'package'], placeholder: 'com.example.app.dev' },
  { label: 'iOS Bundle', varKey: 'app.ios.bundle', modelPath: ['ios', 'bundle'], placeholder: 'com.example.app' },
  { label: 'Web 地址', varKey: 'app.web.base_url', modelPath: ['web', 'base_url'], placeholder: 'https://test.example.com' },
]

const props = defineProps({
  projectId: { type: String, required: true },
})

const emit = defineEmits(['saved'])

const loading = ref(false)
const saving = ref(false)
const loadedProjectName = ref('')
const defaultProfile = ref('test')
const activeTab = ref('test')

const profiles = reactive(Object.fromEntries(ENV_PROFILES.map((p) => [p.key, emptyPlatformEnv()])))

const activeProfileLabel = computed(
  () => ENV_PROFILES.find((p) => p.key === activeTab.value)?.label || activeTab.value,
)

const wrapVar = (key) => `{{${key}}}`

const profileFilled = (key) => {
  const snap = profiles[key]
  if (!snap) return false
  return Boolean(snap.android?.package?.trim() || snap.ios?.bundle?.trim() || snap.web?.base_url?.trim())
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

const save = async () => {
  if (!props.projectId) return false
  saving.value = true
  try {
    const payload = buildPayload()
    await updateProjectEnv(props.projectId, payload)
    ElMessage.success('环境配置已保存')
    emit('saved', payload)
    return true
  } catch {
    ElMessage.error('保存失败')
    return false
  } finally {
    saving.value = false
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

watch(() => props.projectId, loadProject, { immediate: true })

defineExpose({ save, saving, loadedProjectName, loadProject })
</script>

<style scoped>
.env-shell {
  display: flex;
  gap: 0;
  min-height: 280px;
  width: 100%;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  overflow: hidden;
  background: #fafafa;
  box-sizing: border-box;
}
.env-nav {
  width: 168px;
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
  flex-wrap: wrap;
  gap: 6px;
  width: 100%;
  padding: 10px 12px;
  border: none;
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  text-align: left;
  font-size: 14px;
  color: #4b5563;
  box-sizing: border-box;
}
.env-nav-item:hover,
.env-nav-item.active {
  background: #fff;
  color: #111827;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}
.nav-label { flex: 1; min-width: 0; }
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
}
.env-panel {
  flex: 1;
  min-width: 0;
  padding: 16px 20px 20px;
  background: #fff;
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
  flex: 1;
}
.field-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.field-row {
  display: grid;
  grid-template-columns: minmax(168px, 220px) minmax(0, 1fr);
  gap: 12px 16px;
  align-items: center;
}
.field-label {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  min-width: 0;
}
.field-name {
  font-size: 13px;
  font-weight: 600;
  color: #111827;
}
.var-chip {
  border: none;
  background: #f3f4f6;
  font-size: 11px;
  font-family: ui-monospace, monospace;
  color: #6b7280;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.var-chip:hover { background: #eef2ff; color: #4f46e5; }
.field-row :deep(.el-input) {
  width: 100%;
}
.panel-hint {
  margin-top: 18px;
  margin-bottom: 0;
  font-size: 12px;
  color: #9ca3af;
  line-height: 1.6;
}
</style>
