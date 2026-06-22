<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { getTestingKnowledge, saveTestingKnowledge, getFigmaSettings, saveFigmaSettings, testFigmaToken } from '@/api/settings'

const props = defineProps({
  embedded: { type: Boolean, default: false },
  /** 仅展示/维护该应用专属知识 */
  appId: { type: String, default: '' },
  appOnly: { type: Boolean, default: false },
  appName: { type: String, default: '' },
})

const CATEGORY_OPTIONS = ['业务逻辑', 'UI导航', '登录注册', 'Tab切换', '交互规范', '其他']

const loading = ref(false)
const saving = ref(false)
const allItems = ref([])
const figmaToken = ref('')
const figmaFileUrl = ref('')
const figmaConfigured = ref(false)
const testingFigma = ref(false)
const configDialogVisible = ref(false)
const editingRow = ref(null)

const normalizeRow = (x) => ({
  ...x,
  category: x.category || '其他',
  tagsText: (x.tags || []).join(', '),
  appIdsText: (x.app_ids || []).join(', '),
})

const globalItems = computed(() =>
  allItems.value.filter((r) => !String(r.appIdsText || '').trim() && !(r.app_ids || []).length),
)

const appItems = computed(() => {
  if (!props.appId) {
    return allItems.value.filter(
      (r) => String(r.appIdsText || '').trim() || (r.app_ids || []).length,
    )
  }
  return allItems.value.filter((r) => {
    const ids = (r.app_ids || []).length
      ? r.app_ids
      : String(r.appIdsText || '')
          .split(/[,，、\s]+/)
          .map((s) => s.trim())
          .filter(Boolean)
    return ids.includes(props.appId)
  })
})

const contentPreview = (text) => {
  const s = String(text || '').trim()
  if (!s) return '—'
  return s.length > 48 ? `${s.slice(0, 48)}…` : s
}

const load = async () => {
  loading.value = true
  try {
    const res = await getTestingKnowledge()
    allItems.value = (res?.data?.items || []).map(normalizeRow)
  } finally {
    loading.value = false
  }
}

const addGlobalRow = () => {
  const row = {
    id: '',
    title: '',
    content: '',
    category: '其他',
    tagsText: '',
    appIdsText: '',
    enabled: true,
  }
  allItems.value.unshift(row)
  openConfig(row)
}

const addAppRow = () => {
  if (!props.appId) return ElMessage.warning('缺少应用 ID')
  const row = {
    id: '',
    title: '',
    content: '',
    category: '其他',
    tagsText: '',
    appIdsText: props.appId,
    app_ids: [props.appId],
    enabled: true,
  }
  allItems.value.unshift(row)
  openConfig(row)
}

const removeRow = (row) => {
  const idx = allItems.value.indexOf(row)
  if (idx >= 0) allItems.value.splice(idx, 1)
}

const openConfig = (row) => {
  editingRow.value = row
  configDialogVisible.value = true
}

const buildPayload = () =>
  allItems.value.map((row) => ({
    id: row.id,
    title: row.title,
    content: row.content,
    category: row.category || '其他',
    tags: String(row.tagsText || '')
      .split(/[,，、]/)
      .map((s) => s.trim())
      .filter(Boolean),
    app_ids: String(row.appIdsText || '')
      .split(/[,，、\s]+/)
      .map((s) => s.trim())
      .filter(Boolean),
    enabled: row.enabled !== false,
  }))

const save = async () => {
  saving.value = true
  try {
    const res = await saveTestingKnowledge(buildPayload())
    allItems.value = (res?.data?.items || []).map(normalizeRow)
    ElMessage.success('知识库已保存')
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || '保存失败')
  } finally {
    saving.value = false
  }
}

const loadFigma = async () => {
  const res = await getFigmaSettings()
  figmaConfigured.value = !!res?.data?.configured
  figmaFileUrl.value = res?.data?.default_file_url || ''
}

const saveFigma = async () => {
  await saveFigmaSettings({
    access_token: figmaToken.value || undefined,
    default_file_url: figmaFileUrl.value,
    clear_token: false,
  })
  figmaToken.value = ''
  await loadFigma()
  ElMessage.success('Figma Token 已保存')
}

const verifyFigmaToken = async () => {
  testingFigma.value = true
  try {
    const res = await testFigmaToken(figmaToken.value || '')
    const email = res?.data?.email || res?.data?.handle || ''
    ElMessage.success(email ? `Token 有效（${email}）` : 'Token 有效')
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || e?.message || 'Token 无效')
  } finally {
    testingFigma.value = false
  }
}

onMounted(async () => {
  await Promise.all([load(), loadFigma()])
})

defineExpose({ save, saving, saveFigma, figmaConfigured, figmaToken, figmaFileUrl })
</script>

<template>
  <div class="settings-panel knowledge-panel" :class="{ embedded }" v-loading="loading">
    <template v-if="embedded && appOnly">
      <div class="col-head">
        <h3>应用知识库</h3>
        <span v-if="appName" class="col-sub inline">{{ appName }}</span>
        <div class="col-actions">
          <el-button size="small" type="primary" @click="addAppRow">新建</el-button>
          <el-button size="small" type="primary" :loading="saving" @click="save">保存</el-button>
        </div>
      </div>
      <p class="desc compact">本应用专属规则；回放失败时可从此处补充纠错知识，规划执行时自动匹配。</p>
      <el-table :data="appItems" border size="small" class="col-table">
        <el-table-column label="分类" width="108">
          <template #default="{ row }">
            <el-select v-model="row.category" size="small" filterable allow-create>
              <el-option v-for="c in CATEGORY_OPTIONS" :key="c" :label="c" :value="c" />
            </el-select>
          </template>
        </el-table-column>
        <el-table-column label="标题" width="140">
          <template #default="{ row }"><el-input v-model="row.title" size="small" /></template>
        </el-table-column>
        <el-table-column label="标签" width="100">
          <template #default="{ row }">
            <el-input v-model="row.tagsText" size="small" placeholder="feed,详情" />
          </template>
        </el-table-column>
        <el-table-column label="知识内容" min-width="160">
          <template #default="{ row }">
            <span class="content-preview">{{ contentPreview(row.content) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="启用" width="56">
          <template #default="{ row }"><el-switch v-model="row.enabled" size="small" /></template>
        </el-table-column>
        <el-table-column label="操作" width="100" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="openConfig(row)">配置</el-button>
            <el-button link type="danger" size="small" @click="removeRow(row)">删</el-button>
          </template>
        </el-table-column>
      </el-table>
    </template>

    <template v-else-if="embedded">
      <div class="col-head">
        <h3>全局知识库</h3>
        <div class="col-actions">
          <el-button size="small" type="primary" @click="addGlobalRow">新建</el-button>
          <el-button size="small" type="primary" :loading="saving" @click="save">保存知识库</el-button>
        </div>
      </div>
      <p class="desc compact">维护全局规则，规划执行时按分类与关键词自动匹配。</p>
      <el-table :data="globalItems" border size="small" class="col-table">
        <el-table-column label="分类" width="108">
          <template #default="{ row }">
            <el-select v-model="row.category" size="small" filterable allow-create>
              <el-option v-for="c in CATEGORY_OPTIONS" :key="c" :label="c" :value="c" />
            </el-select>
          </template>
        </el-table-column>
        <el-table-column label="标题" width="120">
          <template #default="{ row }"><el-input v-model="row.title" size="small" /></template>
        </el-table-column>
        <el-table-column label="标签" width="100">
          <template #default="{ row }">
            <el-input v-model="row.tagsText" size="small" placeholder="登录,tab" />
          </template>
        </el-table-column>
        <el-table-column label="知识内容" min-width="140">
          <template #default="{ row }">
            <span class="content-preview">{{ contentPreview(row.content) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="启用" width="56">
          <template #default="{ row }"><el-switch v-model="row.enabled" size="small" /></template>
        </el-table-column>
        <el-table-column label="操作" width="100" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="openConfig(row)">配置</el-button>
            <el-button link type="danger" size="small" @click="removeRow(row)">删</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="figma-section">
        <h4>Figma Token（普通账号即可）</h4>
        <p class="desc compact">
          在 figma.com → 头像 → Settings → Security → Personal access tokens 生成 Token，
          勾选 <code>file_content:read</code>。不需要 Developer OAuth 应用；Token 所属账号需能打开设计稿。
        </p>
        <div class="figma-row">
          <el-input
            v-model="figmaToken"
            size="small"
            type="password"
            :placeholder="figmaConfigured ? 'Token 已配置，输入新值可覆盖' : 'figd_... Personal Access Token'"
            style="width: 240px"
          />
          <el-button size="small" :loading="testingFigma" @click="verifyFigmaToken">验证</el-button>
          <el-button size="small" type="primary" @click="saveFigma">保存 Token</el-button>
        </div>
      </div>
    </template>

    <template v-else>
      <div class="head-row">
        <div>
          <h2>知识库</h2>
          <p class="desc">规划与执行时按关键词匹配知识条目。</p>
        </div>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </div>
      <el-button size="small" @click="addGlobalRow">新建条目</el-button>
      <el-table :data="allItems" border size="small" style="margin-top: 12px">
        <el-table-column label="分类" width="120">
          <template #default="{ row }">
            <el-select v-model="row.category" size="small">
              <el-option v-for="c in CATEGORY_OPTIONS" :key="c" :label="c" :value="c" />
            </el-select>
          </template>
        </el-table-column>
        <el-table-column label="标题" width="140">
          <template #default="{ row }"><el-input v-model="row.title" size="small" /></template>
        </el-table-column>
        <el-table-column label="标签" width="120">
          <template #default="{ row }"><el-input v-model="row.tagsText" size="small" /></template>
        </el-table-column>
        <el-table-column label="限定应用" width="140">
          <template #default="{ row }"><el-input v-model="row.appIdsText" size="small" placeholder="留空=全局" /></template>
        </el-table-column>
        <el-table-column label="知识内容" min-width="200">
          <template #default="{ row }"><el-input v-model="row.content" type="textarea" :rows="2" /></template>
        </el-table-column>
        <el-table-column label="启用" width="64">
          <template #default="{ row }"><el-switch v-model="row.enabled" /></template>
        </el-table-column>
        <el-table-column label="操作" width="100">
          <template #default="{ row }">
            <el-button link type="danger" size="small" @click="removeRow(row)">删</el-button>
          </template>
        </el-table-column>
      </el-table>
    </template>

    <el-dialog v-model="configDialogVisible" title="知识配置" width="520px" destroy-on-close>
      <el-form v-if="editingRow" label-width="80px">
        <el-form-item label="分类">
          <el-select v-model="editingRow.category" filterable allow-create style="width: 100%">
            <el-option v-for="c in CATEGORY_OPTIONS" :key="c" :label="c" :value="c" />
          </el-select>
        </el-form-item>
        <el-form-item label="标题">
          <el-input v-model="editingRow.title" />
        </el-form-item>
        <el-form-item label="标签">
          <el-input v-model="editingRow.tagsText" placeholder="登录, tab, 我的" />
        </el-form-item>
        <el-form-item label="知识内容">
          <el-input v-model="editingRow.content" type="textarea" :rows="6" />
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="editingRow.enabled" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="configDialogVisible = false">关闭</el-button>
        <el-button type="primary" @click="configDialogVisible = false">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.knowledge-panel.embedded { padding: 0; }
.desc { margin: 0 0 12px; color: #6b7280; font-size: 13px; }
.desc.compact { margin-top: 0; }
.col-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}
.col-head h3 { margin: 0; font-size: 14px; font-weight: 600; flex: 1; }
.col-sub.inline { margin: 0; font-size: 12px; color: #9ca3af; flex: 1; }
.col-actions { display: flex; gap: 8px; flex-shrink: 0; }
.col-table { width: 100%; }
.content-preview { font-size: 12px; color: #6b7280; }
.figma-section {
  margin-top: 20px;
  padding: 12px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}
.figma-section h4 { margin: 0 0 4px; font-size: 13px; font-weight: 600; }
.figma-row { display: flex; align-items: center; gap: 8px; margin-top: 8px; flex-wrap: wrap; }
.head-row { display: flex; justify-content: space-between; margin-bottom: 12px; }
h2 { margin: 0 0 6px; font-size: 20px; font-weight: 700; }
</style>
