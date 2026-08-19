<script setup>
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { listRobotIntegrations } from '@/api/settings'
import {
  getFeishuConfig,
  updateFeishuConfig,
  fetchFeishuCases,
  getFeishuCasesCached,
} from '@/api/feishuRegression'
import { getAppAutomationConfig, updateAppAutomationConfig } from '@/api/appAutomation'
import CaseMultilineCell from '@/components/CaseMultilineCell.vue'
import CaseAlignedFieldCell from '@/components/CaseAlignedFieldCell.vue'
import {
  filterCasesByModule,
  formatSyncedAt,
  groupCasesByModule,
  suiteCaseIds,
} from '@/utils/caseLibrary'

const props = defineProps({
  appId: { type: String, required: true },
  appName: { type: String, default: '应用' },
  projectId: { type: String, default: '' },
  projectName: { type: String, default: '' },
  embedded: { type: Boolean, default: true },
})

const router = useRouter()
const route = useRoute()
const activeTab = ref('cases')
const credConfigured = ref(false)
const loading = ref(false)
const fetching = ref(false)
const suiteSaving = ref(false)

const envProfiles = ['dev', 'test', 'pre', 'prod']
const configForm = ref({
  doc_url: '',
  spreadsheet_token: '',
  sheet_id: '',
  data_range: 'A1:O500',
  enabled: true,
  bot_id: '',
  env_profile: 'test',
})

const feishuBots = ref([])
const cases = ref([])
const casesSyncedAt = ref('')
const selectedCaseIds = ref([])
const suites = ref([])
const moduleKey = ref('')
const libraryQuery = ref('')
const caseTableRef = ref(null)

const moduleGroups = computed(() => groupCasesByModule(cases.value))

const visibleCases = computed(() => {
  let list = filterCasesByModule(cases.value, moduleKey.value)
  const q = libraryQuery.value.trim().toLowerCase()
  if (!q) return list
  return list.filter((c) => {
    const blob = `${c.case_id || ''} ${c.name || ''} ${c.platform || ''} ${c.module || ''}`
    return blob.toLowerCase().includes(q)
  })
})

const syncLabel = computed(() => formatSyncedAt(casesSyncedAt.value))

const iosOnlyCaseCount = computed(() =>
  cases.value.filter((c) => {
    const p = String(c.platform || '').toLowerCase()
    return p && !p.includes('双端') && (p.includes('ios') || p.includes('苹果'))
  }).length,
)

const loadConfig = async () => {
  const res = await getFeishuConfig(props.appId)
  const feishu = res?.data?.feishu || {}
  configForm.value = {
    doc_url: feishu.doc_url || '',
    spreadsheet_token: feishu.spreadsheet_token || '',
    sheet_id: feishu.sheet_id || '',
    data_range: feishu.data_range || 'A1:O500',
    enabled: feishu.enabled !== false,
    bot_id: feishu.bot_id || '',
    env_profile: feishu.env_profile || 'test',
  }
}

const loadCachedCases = async () => {
  try {
    const res = await getFeishuCasesCached(props.appId, false)
    const data = res?.data || {}
    if (data.cases?.length) {
      cases.value = data.cases
      casesSyncedAt.value = data.synced_at || data.cached_at || ''
    }
  } catch {
    /* ignore */
  }
}

const loadSuites = async () => {
  try {
    const res = await getAppAutomationConfig(props.appId)
    suites.value = res?.data?.automation?.suites || []
  } catch {
    suites.value = []
  }
}

const persistSuites = async (next) => {
  suiteSaving.value = true
  try {
    await updateAppAutomationConfig(props.appId, { suites: next })
    suites.value = next
    return true
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || '套件保存失败')
    return false
  } finally {
    suiteSaving.value = false
  }
}

const saveConfig = async () => {
  if (!configForm.value.bot_id) return ElMessage.warning('请选择飞书机器人')
  if (!configForm.value.doc_url?.trim()) return ElMessage.warning('请填写飞书表格链接')
  loading.value = true
  try {
    await updateFeishuConfig(props.appId, configForm.value)
    ElMessage.success('配置已保存')
    await loadConfig()
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || e?.message || '保存失败')
  } finally {
    loading.value = false
  }
}

const loadCases = async (refresh = true) => {
  if (!configForm.value.bot_id) return ElMessage.warning('请先选择飞书机器人并保存配置')
  fetching.value = true
  try {
    const res = refresh
      ? await fetchFeishuCases(props.appId)
      : await getFeishuCasesCached(props.appId, true)
    const data = res?.data || {}
    cases.value = data.cases || []
    casesSyncedAt.value = data.cached_at || data.synced_at || new Date().toISOString()
    ElMessage.success(`已同步 ${cases.value.length} 条用例`)
    activeTab.value = 'cases'
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || e?.message || '读取飞书失败')
  } finally {
    fetching.value = false
  }
}

const loadBots = async () => {
  try {
    const res = await listRobotIntegrations()
    feishuBots.value = (res?.data?.bots || []).filter((b) => b.configured)
    credConfigured.value = feishuBots.value.length > 0
    if (!configForm.value.bot_id && feishuBots.value.length) {
      configForm.value.bot_id = feishuBots.value[0].id
    }
  } catch {
    feishuBots.value = []
    credConfigured.value = false
  }
}

const goTestingRun = (ids = [], suiteId = '') => {
  const query = {
    appName: props.appName || route.query.appName,
    projectName: props.projectName || route.query.projectName,
    projectId: props.projectId || route.query.projectId,
    tab: 'tasks',
    openRun: '1',
  }
  if (ids.length) query.caseIds = ids.join(',')
  if (suiteId) query.suite = suiteId
  Object.keys(query).forEach((k) => {
    if (query[k] === undefined || query[k] === '') delete query[k]
  })
  router.push({ name: 'TestingApp', params: { appId: props.appId }, query })
}

const openNewRun = () => {
  if (!cases.value.length) {
    ElMessage.warning('没有可执行的用例，请先同步')
    return
  }
  goTestingRun(selectedCaseIds.value)
}

const applySuite = async (suite) => {
  moduleKey.value = ''
  libraryQuery.value = ''
  selectedCaseIds.value = suiteCaseIds(suite, cases.value)
  if (suite?.case_ids?.length && !selectedCaseIds.value.length) {
    ElMessage.warning('该套件里的用例已不在当前表中，请重新保存套件')
    return
  }
  await nextTick()
  const table = caseTableRef.value
  if (!table) return
  table.clearSelection()
  const want = new Set(selectedCaseIds.value)
  for (const row of visibleCases.value) {
    if (want.has(row.case_id)) table.toggleRowSelection(row, true)
  }
}

const saveSuiteFromSelection = async () => {
  if (!selectedCaseIds.value.length) return ElMessage.warning('请先勾选用例')
  try {
    const { value } = await ElMessageBox.prompt('套件名称', '存为套件', {
      confirmButtonText: '保存',
      cancelButtonText: '取消',
      inputValue: moduleKey.value && moduleKey.value !== '未分类' ? `${moduleKey.value}回归` : '冒烟',
      inputPattern: /\S/,
      inputErrorMessage: '请填写名称',
    })
    const name = String(value || '').trim()
    const next = [...suites.value]
    const hit = next.findIndex((s) => s.name === name)
    const row = {
      id: hit >= 0 ? next[hit].id : '',
      name,
      case_ids: [...selectedCaseIds.value],
      updated_at: new Date().toISOString(),
    }
    if (hit >= 0) next[hit] = { ...next[hit], ...row }
    else next.push(row)
    if (await persistSuites(next)) ElMessage.success('套件已保存')
  } catch {
    /* cancel */
  }
}

const renameSuite = async (suite) => {
  try {
    const { value } = await ElMessageBox.prompt('套件名称', '重命名套件', {
      inputValue: suite.name,
      inputPattern: /\S/,
    })
    const name = String(value || '').trim()
    const next = suites.value.map((s) => (s.id === suite.id ? { ...s, name } : s))
    if (await persistSuites(next)) ElMessage.success('已重命名')
  } catch {
    /* cancel */
  }
}

const deleteSuite = async (suite) => {
  try {
    await ElMessageBox.confirm(`删除套件「${suite.name}」？用例本身不会删除。`, '删除套件', { type: 'warning' })
  } catch {
    return
  }
  const next = suites.value.filter((s) => s.id !== suite.id)
  if (await persistSuites(next)) ElMessage.success('已删除')
}

const init = async () => {
  await Promise.all([loadConfig(), loadBots(), loadCachedCases(), loadSuites()])
}

watch(() => props.appId, init)
onMounted(init)
</script>

<template>
  <div class="feishu-panel">
    <div class="settings-toolbar">
      <div class="toolbar-copy">
        <p v-if="syncLabel" class="sync-meta">{{ syncLabel }} · {{ cases.length }} 条</p>
        <p v-else class="sync-meta">尚未同步飞书表格</p>
        <p v-if="iosOnlyCaseCount" class="sync-meta ios-hint">
          含 {{ iosOnlyCaseCount }} 条 iOS 专用用例；选 Android 设备启动时会按前置条件跳过。
        </p>
      </div>
      <div class="toolbar-actions">
        <el-button size="small" :loading="fetching" @click="loadCases(true)">同步用例</el-button>
        <el-button size="small" :disabled="!selectedCaseIds.length" :loading="suiteSaving" @click="saveSuiteFromSelection">
          存为套件
        </el-button>
        <el-button type="primary" size="small" :disabled="!cases.length" @click="openNewRun">去新建执行</el-button>
      </div>
    </div>

    <el-alert v-if="!credConfigured" type="warning" show-icon :closable="false" class="cred-alert">
      <template #default>
        请先在
        <el-link type="primary" @click="router.push({ name: 'SettingsKeys', query: { tab: 'robots' } })">设置 → 密钥配置 → 机器人</el-link>
        中添加机器人。
      </template>
    </el-alert>

    <el-tabs v-model="activeTab" class="inner-tabs">
      <el-tab-pane label="同步源" name="config">
        <el-form label-width="120px" class="config-form">
          <el-form-item label="飞书机器人" required>
            <el-select v-model="configForm.bot_id" placeholder="选择机器人" style="width: 100%">
              <el-option v-for="b in feishuBots" :key="b.id" :label="b.name" :value="b.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="运行环境">
            <el-select v-model="configForm.env_profile" style="width: 160px">
              <el-option v-for="p in envProfiles" :key="p" :label="p" :value="p" />
            </el-select>
          </el-form-item>
          <el-form-item label="表格链接">
            <el-input v-model="configForm.doc_url" type="textarea" :rows="2" />
          </el-form-item>
          <el-form-item label="读取范围">
            <el-input v-model="configForm.data_range" />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" :loading="loading" @click="saveConfig">保存</el-button>
          </el-form-item>
        </el-form>
      </el-tab-pane>

      <el-tab-pane :label="`用例库 (${cases.length})`" name="cases">
        <div v-if="suites.length" class="suite-row">
          <span class="suite-kicker">套件</span>
          <button
            v-for="s in suites"
            :key="s.id"
            type="button"
            class="suite-chip"
            @click="applySuite(s)"
          >
            {{ s.name }}
            <small>{{ suiteCaseIds(s, cases).length }}</small>
          </button>
        </div>
        <p v-else class="suite-empty">勾选用例后点「存为套件」，下次新建执行可直接选用。</p>

        <div class="library">
          <aside class="module-tree" aria-label="模块">
            <button
              type="button"
              class="mod-item"
              :class="{ on: !moduleKey }"
              @click="moduleKey = ''"
            >
              <strong>全部模块</strong>
              <span>{{ cases.length }}</span>
            </button>
            <button
              v-for="[name, list] in moduleGroups"
              :key="name"
              type="button"
              class="mod-item"
              :class="{ on: moduleKey === name }"
              @click="moduleKey = name"
            >
              <strong>{{ name }}</strong>
              <span>{{ list.length }}</span>
            </button>
          </aside>

          <div class="library-main">
            <el-input
              v-model="libraryQuery"
              size="small"
              clearable
              placeholder="搜索编号、名称、端"
              class="lib-search"
            />
            <el-table
              ref="caseTableRef"
              :data="visibleCases"
              row-key="case_id"
              border
              stripe
              max-height="440"
              @selection-change="(rows) => (selectedCaseIds = rows.map((r) => r.case_id))"
            >
              <el-table-column type="selection" width="48" reserve-selection />
              <el-table-column prop="case_id" label="编号" width="108" />
              <el-table-column prop="platform" label="端" width="72" show-overflow-tooltip />
              <el-table-column prop="name" label="名称" min-width="120" show-overflow-tooltip />
              <el-table-column label="前置条件" min-width="140" class-name="col-multiline">
                <template #default="{ row }">
                  <CaseMultilineCell :row="row" raw-key="precondition" />
                </template>
              </el-table-column>
              <el-table-column label="测试步骤" min-width="180" class-name="col-multiline">
                <template #default="{ row }">
                  <CaseAlignedFieldCell :row="row" field="step" />
                </template>
              </el-table-column>
              <el-table-column label="预期效果" min-width="160" class-name="col-multiline">
                <template #default="{ row }">
                  <CaseAlignedFieldCell :row="row" field="expected" />
                </template>
              </el-table-column>
            </el-table>
          </div>
        </div>

        <div v-if="suites.length" class="suite-manage">
          <span class="suite-kicker">管理套件</span>
          <span v-for="s in suites" :key="`m-${s.id}`" class="suite-manage-item">
            {{ s.name }}
            <el-button link type="primary" size="small" @click="renameSuite(s)">重命名</el-button>
            <el-button link type="danger" size="small" @click="deleteSuite(s)">删除</el-button>
          </span>
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<style scoped>
.feishu-panel { margin-top: 8px; width: 100%; }
.toolbar-copy { min-width: 0; flex: 1; }
.toolbar-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.cred-alert { margin-bottom: 12px; }
.sync-meta { font-size: 12px; color: #6b7280; margin: 0 0 4px; }
.ios-hint { color: #b45309; }
.config-form { max-width: 720px; }
.suite-row, .suite-manage {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}
.suite-kicker {
  font-size: 11px;
  font-weight: 700;
  color: #94a3b8;
  letter-spacing: 0.04em;
}
.suite-empty { font-size: 12px; color: #94a3b8; margin: 0 0 12px; }
.suite-chip {
  border: 1px solid #e3e8f0;
  background: #fff;
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 12px;
  cursor: pointer;
  color: #374151;
}
.suite-chip small { margin-left: 6px; color: #94a3b8; }
.suite-chip:hover { border-color: #c7d2fe; background: #eef2ff; }
.suite-manage { margin-top: 12px; }
.suite-manage-item { font-size: 12px; color: #6b7280; }
.library {
  display: grid;
  grid-template-columns: 168px minmax(0, 1fr);
  gap: 12px;
  min-height: 280px;
}
.module-tree {
  border: 1px solid #e3e8f0;
  border-radius: 12px;
  background: #f8fafc;
  padding: 8px;
  min-height: 0;
  overflow: auto;
}
.mod-item {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  border: none;
  background: transparent;
  border-radius: 8px;
  padding: 8px 10px;
  cursor: pointer;
  text-align: left;
  color: #374151;
}
.mod-item strong { font-size: 13px; font-weight: 600; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mod-item span { font-size: 11px; color: #94a3b8; flex-shrink: 0; }
.mod-item:hover { background: #fff; }
.mod-item.on { background: #eef2ff; color: #4f46e5; }
.mod-item.on span { color: #6366f1; }
.library-main { min-width: 0; }
.lib-search { margin-bottom: 8px; max-width: 280px; }
@media (max-width: 860px) {
  .library { grid-template-columns: 1fr; }
}
</style>

<style>
.feishu-panel :deep(.el-table .col-multiline .cell) {
  white-space: normal;
  line-height: 1.5;
  align-items: flex-start;
}
</style>
