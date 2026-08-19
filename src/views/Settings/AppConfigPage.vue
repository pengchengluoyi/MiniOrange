<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  getAppAutomationConfig,
  updateAppAutomationConfig,
  listIconTargets,
  saveIconTarget,
  deleteIconTarget,
  uploadIconImage,
  getGraphIconCandidates,
  importGraphIcon,
  syncAppFigma,
  applyFigmaAppLogic,
  seedLoginIconTemplates,
  seedLoginIconsFromFigma,
} from '@/api/appAutomation'
import { getBaseUrl } from '@/utils/config'
import { getDeviceList } from '@/api/device'
import { wsGetDeviceList } from '@/api/wsAppGraph'
import { initWebSocket } from '@/api/mWebSocket'
import { ENV_PROFILES } from '@/constants/envProfiles'
import FeishuRegressionPanel from './FeishuRegressionPanel.vue'
import CaseRunnerPanel from './CaseRunnerPanel.vue'
import ProjectEnvEditor from './ProjectEnvEditor.vue'
import KnowledgePanel from './KnowledgePanel.vue'
import { getFigmaSettings } from '@/api/settings'
import './settings-ui.css'

const props = defineProps({
  embedded: { type: Boolean, default: false },
  embedAppId: { type: String, default: '' },
  embedAppName: { type: String, default: '' },
  embedProjectId: { type: String, default: '' },
  embedProjectName: { type: String, default: '' },
  embedSection: { type: String, default: 'cases' },
  hideSections: { type: Array, default: () => [] },
})
const emit = defineEmits(['update:embedSection'])

const route = useRoute()
const router = useRouter()
const appId = computed(() => (props.embedded ? props.embedAppId : route.params.appId))
const section = computed(() => {
  if (props.embedded) return props.embedSection || 'cases'
  return route.params.section || 'env'
})
const appName = computed(() => (props.embedded ? props.embedAppName : route.query.appName) || '应用')
const projectName = computed(() => (props.embedded ? props.embedProjectName : route.query.projectName) || '')
const projectId = computed(() => String((props.embedded ? props.embedProjectId : route.query.projectId) || ''))
const envEditorRef = ref(null)

const tabs = computed(() => {
  const hidden = props.hideSections || []
  if (props.embedded) {
    return [
      { key: 'cases', label: '用例来源' },
      { key: 'env', label: '执行环境' },
      { key: 'icons', label: '无字图标' },
      { key: 'logic', label: '应用逻辑' },
      { key: 'figma', label: '设计稿' },
    ].filter((t) => !hidden.includes(t.key))
  }
  return [
    { key: 'env', label: '执行环境' },
    { key: 'icons', label: '无字图标' },
    { key: 'logic', label: '应用逻辑' },
    { key: 'regression', label: '回归' },
    { key: 'feishu-legacy', label: '飞书回归(旧)' },
    { key: 'figma', label: '设计稿' },
  ].filter((t) => !hidden.includes(t.key))
})

const figmaForm = ref({ file_url: '', file_key: '', last_sync_at: '', pages_summary: [], logic_applied_at: '' })
const figmaTokenConfigured = ref(false)

const loading = ref(false)
const saving = ref(false)
const envReady = ref(false)
const envDirty = ref(false)
const figmaApplying = ref(false)
const figmaSyncing = ref(false)
const packageName = ref('')
const envProfile = ref('test')
const executionEnvMode = ref('fixed')
const selectedDeviceSn = ref('*')
const devices = ref([])
const skillsDefault = ref({ pre: [], post: [] })
const skillsDevices = ref({})
const iconPage = ref(1)
const iconPageSize = ref(20)
const iconTotal = ref(0)
const iconKeyword = ref('')
const iconTargets = ref([])
const graphCandidates = ref([])
const showGraphImport = ref(false)
const staticBase = getBaseUrl()

const parseFigmaFileKeyFromUrl = (url = '') => {
  const m = String(url || '').match(/figma\.com\/(?:file|design)\/([a-zA-Z0-9]+)/i)
  return m ? m[1] : ''
}

const normalizeFigmaForm = () => {
  const url = (figmaForm.value.file_url || '').trim()
  let key = (figmaForm.value.file_key || '').trim()
  if (key.toLowerCase().startsWith('figd_')) {
    key = ''
  }
  const fromUrl = parseFigmaFileKeyFromUrl(url)
  if (fromUrl) {
    figmaForm.value.file_key = fromUrl
  } else if (key.toLowerCase().startsWith('figd_')) {
    figmaForm.value.file_key = ''
  }
}

const deviceSkillBlock = computed(() => {
  if (selectedDeviceSn.value === '*') return skillsDefault.value
  if (!skillsDevices.value[selectedDeviceSn.value]) {
    skillsDevices.value[selectedDeviceSn.value] = { pre: [], post: [] }
  }
  return skillsDevices.value[selectedDeviceSn.value]
})

const preLines = computed({
  get: () => (deviceSkillBlock.value.pre || []).join('\n'),
  set: (v) => {
    deviceSkillBlock.value.pre = String(v || '').split('\n').map((s) => s.trim()).filter(Boolean)
  },
})
const postLines = computed({
  get: () => (deviceSkillBlock.value.post || []).join('\n'),
  set: (v) => {
    deviceSkillBlock.value.post = String(v || '').split('\n').map((s) => s.trim()).filter(Boolean)
  },
})

const switchTab = (key) => {
  if (props.embedded) {
    emit('update:embedSection', key)
    return
  }
  router.replace({
    name: 'SettingsAppConfig',
    params: { appId: appId.value, section: key },
    query: route.query,
  })
}

const normalizeDevices = (res) => {
  const list = Array.isArray(res) ? res : res?.data || []
  return list.filter((d) => d.status === 'online')
}

const load = async () => {
  loading.value = true
  try {
    const res = await getAppAutomationConfig(appId.value)
    const data = res?.data || {}
    packageName.value = data.package || ''
    envProfile.value = data.env_profile || data.automation?.env_profile || 'test'
    const ex = data.automation?.execution_env || {}
    executionEnvMode.value = ex.mode || 'fixed'
    if (ex.profile) envProfile.value = ex.profile
    const auto = data.automation || {}
    skillsDefault.value = { pre: [...(auto.skills?.default?.pre || [])], post: [...(auto.skills?.default?.post || [])] }
    skillsDevices.value = { ...(auto.skills?.devices || {}) }
    const figma = data.automation?.figma || {}
    figmaForm.value = {
      file_url: figma.file_url || '',
      file_key: figma.file_key || '',
      last_sync_at: figma.last_sync_at || '',
      pages_summary: figma.pages_summary || [],
      logic_applied_at: figma.logic_applied_at || '',
    }
    normalizeFigmaForm()
    if (section.value === 'icons') await loadIconTargets()
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || e?.message || '加载失败')
  } finally {
    loading.value = false
    envDirty.value = false
    envReady.value = true
  }
}

const loadDevices = async () => {
  try {
    let list = []
    try {
      list = normalizeDevices(await wsGetDeviceList())
    } catch {
      initWebSocket()
      list = normalizeDevices(await getDeviceList())
    }
    devices.value = list
  } catch {
    devices.value = []
  }
}

const loadIconTargets = async () => {
  const res = await listIconTargets(appId.value, {
    page: iconPage.value,
    page_size: iconPageSize.value,
    keyword: iconKeyword.value,
  })
  const data = res?.data || {}
  iconTargets.value = data.items || []
  iconTotal.value = data.total || 0
}

const saveFigma = async () => {
  saving.value = true
  try {
    await updateAppAutomationConfig(appId.value, { figma: figmaForm.value })
    ElMessage.success('设计稿配置已保存')
    await load()
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || '保存失败')
  } finally {
    saving.value = false
  }
}

const openKnowledge = () => {
  router.push({ name: 'SettingsHub', query: { tab: 'knowledge', appId: appId.value } })
}

const syncFigmaPreview = async () => {
  if (!figmaForm.value.file_url?.trim()) return ElMessage.warning('请填写 Figma 文件链接')
  if (!figmaTokenConfigured.value) {
    ElMessage.warning('请先在「应用与环境 → 知识库」中配置 Figma Token')
    return
  }
  normalizeFigmaForm()
  figmaSyncing.value = true
  try {
    const res = await syncAppFigma(appId.value, {
      file_url: figmaForm.value.file_url,
      file_key: figmaForm.value.file_key,
    })
    const figma = res?.data?.figma || {}
    figmaForm.value = {
      file_url: figma.file_url || figmaForm.value.file_url,
      file_key: figma.file_key || figmaForm.value.file_key,
      last_sync_at: figma.last_sync_at || '',
      pages_summary: figma.pages_summary || [],
    }
    const pages = res?.data?.page_count ?? 0
    const icons = res?.data?.login_icons || {}
    const iconN = (icons.created || 0) + (icons.updated || 0)
    const extra = iconN > 0 ? `，并导入登录图标 ${iconN} 个` : ''
    ElMessage.success(`设计稿已同步（${pages} 个页面${extra}）`)
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || e?.message || '同步失败')
  } finally {
    figmaSyncing.value = false
  }
}

const applyFigmaLogic = async () => {
  if (!figmaForm.value.file_url?.trim()) return ElMessage.warning('请填写 Figma 文件链接')
  if (!figmaTokenConfigured.value) {
    ElMessage.warning('请先在「应用与环境 → 知识库」配置 Figma Token（普通账号即可，无需 Developer 应用）')
    return
  }
  normalizeFigmaForm()
  if (!figmaForm.value.file_key) {
    return ElMessage.warning('无法从链接解析 File Key，请检查 Figma 设计稿 URL')
  }
  figmaApplying.value = true
  try {
    const res = await applyFigmaAppLogic(appId.value, {
      file_url: figmaForm.value.file_url,
      file_key: figmaForm.value.file_key,
      write_knowledge: true,
      write_graph: true,
    })
    const data = res?.data || {}
    const figma = data.figma || {}
    figmaForm.value = {
      file_url: figma.file_url || figmaForm.value.file_url,
      file_key: figma.file_key || figmaForm.value.file_key,
      last_sync_at: figma.last_sync_at || '',
      pages_summary: figma.pages_summary || [],
      logic_applied_at: figma.logic_applied_at || '',
    }
    const icons = data.login_icons || {}
    const iconN = (icons.created || 0) + (icons.updated || 0)
    const iconPart = iconN > 0 ? `、登录图标 ${iconN} 个（${icons.frame_name || '登录页'}）` : ''
    ElMessage.success(
      `已从 Figma 学习：${data.pages || 0} 页 → 图谱 ${data.nodes_upserted || 0} 节点、知识库 ${data.knowledge_written || 0} 条${iconPart}`
    )
    if (section.value === 'icons') await loadIconTargets()
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || e?.message || '学习失败')
  } finally {
    figmaApplying.value = false
  }
}

const saveAutomation = async () => {
  saving.value = true
  try {
    await updateAppAutomationConfig(appId.value, {
      env_profile: envProfile.value,
      execution_env: { mode: executionEnvMode.value, profile: envProfile.value },
      skills: { default: skillsDefault.value, devices: skillsDevices.value },
    })
    ElMessage.success('已保存')
    envDirty.value = false
    await load()
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || '保存失败')
  } finally {
    saving.value = false
  }
}

const saveIconRow = async (row) => {
  if (!row.name?.trim()) return ElMessage.warning('请填写名称')
  await saveIconTarget(appId.value, row)
  ElMessage.success('已保存')
  await loadIconTargets()
}

const addIconTarget = () => {
  iconTargets.value.unshift({ id: '', name: '', x: 0, y: 0, w: 80, h: 80, image_url: '', note: '' })
}

const seedLoginIcons = async () => {
  try {
    const res = await seedLoginIconTemplates(appId.value)
    const d = res?.data || {}
    const n = (d.created || 0) + (d.updated || 0)
    ElMessage.success(res?.msg || (n > 0 ? `已导入 ${n} 个登录图标` : '登录图标已就绪'))
    await loadIconTargets()
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || e?.message || '初始化失败')
  }
}

const importLoginIconsFromFigma = async () => {
  try {
    const res = await seedLoginIconsFromFigma(appId.value)
    ElMessage.success(res?.msg || '已从 Figma 导入登录图标')
    await loadIconTargets()
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || e?.message || 'Figma 导入失败')
  }
}

const removeIconTarget = async (row) => {
  if (row.id) await deleteIconTarget(appId.value, row.id)
  await loadIconTargets()
}

const onIconUpload = async (row, { file }) => {
  const res = await uploadIconImage(appId.value, file)
  row.image_url = res?.data?.image_url || ''
  ElMessage.success('图片已上传')
}

const imgUrl = (path) => (!path ? '' : path.startsWith('http') ? path : `${staticBase}${path}`)

const openGraphImport = async () => {
  graphCandidates.value = (await getGraphIconCandidates(appId.value))?.data?.items || []
  showGraphImport.value = true
}

const onGraphRowClick = async (row) => {
  if (!row?.component_uid) return
  await importGraphIcon(appId.value, row.component_uid)
  showGraphImport.value = false
  await loadIconTargets()
}

const saveEnvTab = async () => {
  if (projectId.value && envEditorRef.value) {
    const ok = await envEditorRef.value.save({ quiet: true })
    if (!ok) return
  }
  await saveAutomation()
}

watch([executionEnvMode, envProfile], () => {
  if (envReady.value) envDirty.value = true
})

watch(section, (s) => {
  if (s === 'skills') {
    openKnowledge()
    return
  }
  if (s === 'icons') loadIconTargets()
})

watch(() => appId.value, load)

onMounted(async () => {
  try {
    const res = await getFigmaSettings()
    figmaTokenConfigured.value = !!res?.data?.configured
  } catch {
    figmaTokenConfigured.value = false
  }
  await Promise.all([load(), loadDevices()])
})
</script>

<template>
  <div
    class="settings-panel app-config-panel"
    :class="{
      'wide-panel': true,
      embedded: embedded,
    }"
    v-loading="loading"
  >
    <div v-if="embedded" class="settings-tabbar embed-tabs">
      <button
        v-for="t in tabs"
        :key="t.key"
        type="button"
        class="settings-tab"
        :class="{ active: section === t.key }"
        @click="switchTab(t.key)"
      >
        <strong>{{ t.label }}</strong>
      </button>
    </div>
    <div v-show="section === 'env'" class="tab-body">
      <div class="settings-toolbar env-sticky" :class="{ dirty: envDirty || envEditorRef?.dirty }">
        <span v-if="envDirty || envEditorRef?.dirty" class="unsaved">有未保存的更改</span>
        <span v-else class="saved-hint">与服务器同步</span>
        <el-button type="primary" size="small" :loading="saving || envEditorRef?.saving" @click="saveEnvTab">保存</el-button>
      </div>
      <el-card shadow="never" class="card">
        <h3>执行时如何切换环境</h3>
        <el-form label-width="140px" class="config-form">
          <el-form-item label="环境策略">
            <el-radio-group v-model="executionEnvMode" class="env-radios">
              <el-radio value="fixed">固定 Profile（下方选择）</el-radio>
              <el-radio value="project_default">跟随项目默认环境</el-radio>
              <el-radio value="task_param">由任务/飞书参数指定</el-radio>
            </el-radio-group>
          </el-form-item>
          <el-form-item v-if="executionEnvMode === 'fixed'" label="执行 Profile">
            <el-select v-model="envProfile" class="config-select">
              <el-option v-for="p in ENV_PROFILES" :key="p.key" :label="p.label" :value="p.key" />
            </el-select>
          </el-form-item>
          <el-form-item label="当前包名">
            <span class="mono">{{ packageName || '未配置' }}</span>
          </el-form-item>
        </el-form>
        <p class="hint">飞书回归、Copilot 执行时会按此策略解析包名并拉起应用到前台。</p>
      </el-card>

      <el-card v-if="projectId" shadow="never" class="card env-config-card">
        <h3>项目环境配置</h3>
        <p class="hint">维护各 Profile 下的 Android 包名、iOS Bundle、Web 地址（原项目列表「环境配置」）。</p>
        <ProjectEnvEditor ref="envEditorRef" :project-id="projectId" @saved="load" />
      </el-card>
      <el-alert v-else type="info" show-icon :closable="false" class="env-missing">
        未关联项目 ID，请从测试工作台进入该应用后再编辑环境。
      </el-alert>
    </div>

    <div v-show="section === 'icons'" class="tab-body">
      <el-card shadow="never" class="card">
        <div class="card-head">
          <span>无字图标（{{ iconTotal }}）</span>
          <div class="actions">
            <el-input v-model="iconKeyword" size="small" placeholder="搜索" style="width: 120px" @keyup.enter="loadIconTargets" />
            <el-button size="small" @click="importLoginIconsFromFigma">从 Figma 导入</el-button>
            <el-button size="small" @click="seedLoginIcons">登录图标模板</el-button>
            <el-button size="small" @click="openGraphImport">图谱导入</el-button>
            <el-button size="small" @click="router.push(`/report/editor/${appId}`)">打开图谱</el-button>
            <el-button size="small" type="primary" @click="addIconTarget">新建</el-button>
          </div>
        </div>
        <p class="hint">
          执行成功的无字目标会自动入库成为图标；此处用于人工补录或从 Figma 图谱导入。
          「从 Figma 导入」会读取设计稿中登录/注册页底部图标（需已配置 Figma 链接与 Token）。
          「登录图标模板」在无 Figma 时写入占位条目；执行失败时仍可人工确认标定。
          「上传」仅用于上传一张裁剪好的小图，方便在图标库中预览，并不会触发重新学习。
        </p>
        <el-table :data="iconTargets" border size="small" class="icon-table">
          <el-table-column label="图" width="80">
            <template #default="{ row }">
              <div class="icon-thumb">
                <img v-if="row.image_url" :src="imgUrl(row.image_url)" class="thumb" />
                <el-upload
                  class="thumb-upload"
                  :show-file-list="false"
                  :http-request="(o) => onIconUpload(row, o)"
                >
                  <el-button link size="small">上传</el-button>
                </el-upload>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="名称" width="210">
            <template #default="{ row }">
              <el-input v-model="row.name" size="small" style="width: 180px" />
            </template>
          </el-table-column>
          <el-table-column label="区域" width="260">
            <template #default="{ row }">
              <el-input-number v-model="row.x" size="small" :min="0" controls-position="right" />
              <el-input-number v-model="row.y" size="small" :min="0" controls-position="right" />
              <el-input-number v-model="row.w" size="small" :min="0" controls-position="right" />
              <el-input-number v-model="row.h" size="small" :min="0" controls-position="right" />
            </template>
          </el-table-column>
          <el-table-column label="操作" width="120">
            <template #default="{ row }">
              <el-button link type="primary" @click="saveIconRow(row)">存</el-button>
              <el-button link type="danger" @click="removeIconTarget(row)">删</el-button>
            </template>
          </el-table-column>
        </el-table>
        <el-pagination
          v-if="iconTotal > iconPageSize"
          layout="prev, pager, next, total"
          :total="iconTotal"
          :page-size="iconPageSize"
          v-model:current-page="iconPage"
          @current-change="loadIconTargets"
        />
      </el-card>
    </div>

    <div v-show="section === 'logic'" class="tab-body logic-tab">
      <el-card shadow="never" class="card logic-graph-card">
        <h3>应用逻辑（图谱）</h3>
        <p class="hint">页面跳转、共享组件、骨架识别等在应用图谱中维护。</p>
        <el-button type="primary" @click="router.push(`/report/editor/${appId}`)">打开用例编排 / 应用图谱</el-button>
      </el-card>
      <KnowledgePanel embedded app-only :app-id="appId" :app-name="appName" />
    </div>

    <div v-show="section === 'regression'" class="tab-body">
      <CaseRunnerPanel :app-id="appId" :app-name="appName" embedded />
    </div>

    <div v-show="section === 'feishu-legacy' || section === 'cases'" class="tab-body">
      <FeishuRegressionPanel
        :app-id="appId"
        :app-name="appName"
        :project-id="projectId"
        :project-name="projectName"
        embedded
      />
    </div>

    <div v-show="section === 'figma'" class="tab-body">
      <el-card shadow="never" class="card">
        <h3>Figma 设计稿 · 应用逻辑学习</h3>
        <p class="hint">
          使用 Figma 设计稿学习页面结构与文案，无需上传真机截图训练骨架。
          只需普通 Figma 账号的 Personal Access Token（
          <el-link type="primary" @click="openKnowledge">知识库</el-link>
          中配置，勾选 file_content:read，不需要 Developer OAuth 应用）。
          <el-tag :type="figmaTokenConfigured ? 'success' : 'warning'" size="small" style="margin-left: 6px">
            {{ figmaTokenConfigured ? 'Token 已配置' : 'Token 未配置' }}
          </el-tag>
        </p>
        <el-form label-width="120px" class="config-form">
          <el-form-item label="文件链接">
            <el-input
              v-model="figmaForm.file_url"
              placeholder="https://www.figma.com/design/..."
              @blur="normalizeFigmaForm"
            />
          </el-form-item>
          <el-form-item label="File Key">
            <el-input
              v-model="figmaForm.file_key"
              placeholder="留空即可，从链接自动解析（勿填 figd_ Token）"
              readonly
            />
          </el-form-item>
          <el-form-item>
            <el-button
              type="primary"
              :loading="figmaApplying"
              :disabled="figmaSyncing"
              @click="applyFigmaLogic"
            >
              从 Figma 学习应用逻辑
            </el-button>
            <el-button
              plain
              :loading="figmaSyncing"
              :disabled="figmaApplying"
              @click="syncFigmaPreview"
            >
              仅同步预览
            </el-button>
            <el-button plain @click="saveFigma">保存链接</el-button>
          </el-form-item>
        </el-form>
        <ul v-if="figmaForm.pages_summary?.length" class="figma-summary">
          <li v-for="(line, i) in figmaForm.pages_summary" :key="i">{{ line }}</li>
        </ul>
        <p v-if="figmaForm.logic_applied_at" class="hint">逻辑已写入：{{ figmaForm.logic_applied_at }}</p>
        <p v-else-if="figmaForm.last_sync_at" class="hint">上次同步：{{ figmaForm.last_sync_at }}</p>
      </el-card>
    </div>

    <el-dialog v-model="showGraphImport" title="从图谱导入" width="520px">
      <el-table :data="graphCandidates" size="small" max-height="360" @row-click="onGraphRowClick">
        <el-table-column prop="label" label="组件" />
      </el-table>
    </el-dialog>
  </div>
</template>

<style scoped>
.app-config-panel { padding-top: 0; width: 100%; box-sizing: border-box; }
.app-config-panel.embedded {
  padding: 0;
  max-width: none;
  width: 100%;
  height: 100%;
  overflow: auto;
  background: transparent;
}
.embed-tabs {
  margin-bottom: 12px;
  position: sticky;
  top: 0;
  z-index: 2;
  background: #fff;
  width: 100%;
}
.config-tabs :deep(.el-tabs__header) { margin-bottom: 12px; }
.tab-body { margin-top: 8px; width: 100%; }
.env-sticky {
  position: sticky;
  top: 0;
  z-index: 8;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  margin: -4px 0 12px;
  padding: 8px 0;
  background: #fff;
}
.env-sticky.dirty { background: #fffbeb; margin-left: -8px; margin-right: -8px; padding: 8px 12px; border-radius: 10px; }
.unsaved { font-size: 12px; font-weight: 650; color: #b45309; margin-right: auto; }
.saved-hint { font-size: 12px; color: #94a3b8; margin-right: auto; }
.env-config-card { margin-top: 0; }
.env-missing { margin-top: 12px; }
.card { border: 1px solid #e5e7eb; margin-bottom: 16px; width: 100%; box-sizing: border-box; }
.config-form {
  width: 100%;
  max-width: none;
}
.config-form :deep(.el-form-item__content) {
  flex: 1;
  min-width: 0;
}
.config-select {
  width: min(280px, 100%);
}
.env-radios {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 20px;
  width: 100%;
}
.env-radios :deep(.el-radio) {
  margin-right: 0;
  height: auto;
  white-space: normal;
  align-items: flex-start;
}
.logic-tab .logic-graph-card { margin-bottom: 20px; }
.card h3 { margin: 0 0 12px; font-size: 15px; }
.hint { color: #6b7280; font-size: 12px; }
.mono { font-family: ui-monospace, monospace; font-size: 13px; }
.card-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.actions { display: flex; gap: 8px; align-items: center; }
.thumb { width: 40px; height: 40px; object-fit: contain; }
.figma-summary { margin: 12px 0 0; padding-left: 20px; font-size: 12px; color: #4b5563; }
.icon-table :deep(.el-table__body-wrapper) { overflow-x: auto; }
.icon-thumb { display: flex; flex-direction: column; align-items: center; gap: 4px; }
.thumb-upload { font-size: 11px; }
</style>
