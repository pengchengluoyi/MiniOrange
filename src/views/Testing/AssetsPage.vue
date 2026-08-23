<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getProjectAccounts, pickProjectAccounts, saveProjectAccounts } from '@/api/workReport'
import '@/views/Settings/settings-ui.css'

defineOptions({ name: 'AssetsPage' })

const props = defineProps({
  projectId: { type: String, default: '' },
  projectName: { type: String, default: '' },
  hideNav: { type: Boolean, default: false },
  section: { type: String, default: '' },
})

const TABS = [
  { id: 'accounts', label: '测试账号', desc: '号池 · 标签 · 环境' },
  { id: 'trial', label: '效果测试', desc: '用场景句子试筛号' },
]
const KINDS = [
  { id: 'phone', label: '手机号' },
  { id: 'email', label: '邮箱' },
  { id: 'username', label: '用户名' },
  { id: 'mixed', label: '混合' },
]

const tab = ref(props.section === 'trial' ? 'trial' : 'accounts')
const pageTitle = computed(() => {
  if (!props.hideNav) return '资产'
  return tab.value === 'trial' ? '效果测试' : '测试账号'
})
const pageDesc = computed(() => {
  if (tab.value === 'trial') return '写下发时那句场景，看首选会落在哪个号。真正执行时测试工程师会先调同一条能力。'
  return '测试账号是号池。跑用例时由「筛测试账号」按场景挑号。这里只维护数据。'
})
watch(() => props.section, (s) => {
  if (s === 'trial' || s === 'accounts') tab.value = s
})
const loading = ref(false)
const saving = ref(false)
const picking = ref(false)
const accounts = ref([])
const environments = ref([])
const envFilter = ref('')
const trialEnv = ref('')
const prompt = ref('')
const ranked = ref([])
const dialogOpen = ref(false)
const editingId = ref('')
const form = ref(emptyForm())

function emptyForm(env = '') {
  return {
    name: '',
    env: env || (environments.value[0]?.key || 'test'),
    kind: 'mixed',
    phone: '',
    email: '',
    username: '',
    password: '',
    tags: [],
    note: '',
    locked: false,
  }
}

const envLabel = (key) => environments.value.find((e) => e.key === key)?.label || key || '未分环境'
const kindLabel = (id) => KINDS.find((k) => k.id === id)?.label || id
const identity = (row) => [row.phone, row.email, row.username].filter(Boolean).join(' / ') || '—'
const visibleRows = computed(() => {
  if (!envFilter.value) return accounts.value
  return accounts.value.filter((r) => r.env === envFilter.value)
})
const chosen = computed(() => ranked.value[0] || null)

const load = async () => {
  if (!props.projectId) return
  loading.value = true
  try {
    const res = await getProjectAccounts(props.projectId)
    accounts.value = res?.data?.accounts || []
    environments.value = res?.data?.environments || []
    if (envFilter.value && !environments.value.some((e) => e.key === envFilter.value)) envFilter.value = ''
  } catch (e) {
    ElMessage.error(e?.message || '加载测试账号失败')
  } finally {
    loading.value = false
  }
}

const persist = async (next) => {
  saving.value = true
  try {
    const res = await saveProjectAccounts(props.projectId, next)
    accounts.value = res?.data?.accounts || next
    ElMessage.success('已保存')
  } catch (e) {
    ElMessage.error(e?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

const openCreate = () => {
  editingId.value = ''
  form.value = emptyForm(envFilter.value)
  dialogOpen.value = true
}

const openEdit = (row) => {
  editingId.value = row.id
  form.value = {
    name: row.name || '',
    env: row.env || 'test',
    kind: row.kind || 'mixed',
    phone: row.phone || '',
    email: row.email || '',
    username: row.username || '',
    password: '',
    tags: [...(row.tags || [])],
    note: row.note || '',
    locked: Boolean(row.locked),
  }
  dialogOpen.value = true
}

const saveForm = async () => {
  if (!form.value.name.trim()) {
    ElMessage.warning('先写账号名称')
    return
  }
  if (!form.value.phone && !form.value.email && !form.value.username) {
    ElMessage.warning('至少填手机号、邮箱或用户名之一')
    return
  }
  const row = {
    id: editingId.value || undefined,
    ...form.value,
    name: form.value.name.trim(),
    tags: (form.value.tags || []).map((t) => String(t).trim()).filter(Boolean),
  }
  const next = editingId.value
    ? accounts.value.map((x) => (x.id === editingId.value ? { ...x, ...row } : x))
    : [...accounts.value, row]
  await persist(next)
  dialogOpen.value = false
}

const removeRow = async (row) => {
  try {
    await ElMessageBox.confirm(`删除「${row.name}」？`, '删除测试账号', { type: 'warning' })
  } catch {
    return
  }
  await persist(accounts.value.filter((x) => x.id !== row.id))
}

const toggleLock = async (row) => {
  await persist(accounts.value.map((x) => (x.id === row.id ? { ...x, locked: !x.locked } : x)))
}

const runTrial = async () => {
  if (!prompt.value.trim()) {
    ElMessage.warning('写一句场景，例如「我要发造物秀」')
    return
  }
  picking.value = true
  try {
    const res = await pickProjectAccounts(props.projectId, { prompt: prompt.value, env: trialEnv.value })
    ranked.value = res?.data?.accounts || []
    if (!ranked.value.length) ElMessage.info('这个场景下没有匹配到账号')
  } catch (e) {
    ElMessage.error(e?.message || '筛选失败')
  } finally {
    picking.value = false
  }
}

watch(() => props.projectId, () => {
  ranked.value = []
  load()
})
onMounted(load)
</script>

<template>
  <div class="settings-panel assets-page wide-panel" v-loading="loading">
    <header class="settings-page-header">
      <div>
        <h2 class="settings-page-title">{{ pageTitle }}</h2>
        <p class="settings-page-desc">{{ pageDesc }}</p>
      </div>
      <div class="settings-summary-pill">{{ projectName || '当前项目' }} · {{ accounts.length }} 个账号</div>
    </header>

    <div v-if="!hideNav" class="settings-tabbar">
      <button
        v-for="t in TABS"
        :key="t.id"
        type="button"
        class="settings-tab"
        :class="{ active: tab === t.id }"
        @click="tab = t.id"
      >
        <strong>{{ t.label }}</strong>
        <span>{{ t.desc }}</span>
      </button>
    </div>

    <template v-if="tab === 'accounts'">
      <section class="settings-card pick-card">
        <div class="pick-row">
          <el-select v-model="envFilter" placeholder="全部环境" clearable style="width: 140px">
            <el-option v-for="e in environments" :key="e.key" :label="e.label" :value="e.key" />
          </el-select>
          <el-button type="primary" @click="openCreate">新增账号</el-button>
        </div>
      </section>

      <section class="settings-table-card is-fill">
        <el-table :data="visibleRows" size="small" border stripe height="100%" row-key="id" empty-text="这个环境下还没有测试账号">
          <el-table-column label="名称" min-width="140" show-overflow-tooltip>
            <template #default="{ row }">
              <strong>{{ row.name }}</strong>
              <em v-if="row.locked" class="lock-tag">占用</em>
            </template>
          </el-table-column>
          <el-table-column label="环境" width="88">
            <template #default="{ row }">{{ envLabel(row.env) }}</template>
          </el-table-column>
          <el-table-column label="类型" width="80">
            <template #default="{ row }">{{ kindLabel(row.kind) }}</template>
          </el-table-column>
          <el-table-column label="手机号 / 邮箱 / 用户名" min-width="200" show-overflow-tooltip>
            <template #default="{ row }">{{ identity(row) }}</template>
          </el-table-column>
          <el-table-column label="标签" min-width="180">
            <template #default="{ row }">
              <span v-if="!(row.tags || []).length" class="muted">—</span>
              <el-tag v-for="t in row.tags || []" :key="t" size="small" class="tag-chip">{{ t }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="168" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" size="small" @click="openEdit(row)">编辑</el-button>
              <el-button link size="small" @click="toggleLock(row)">{{ row.locked ? '释放' : '占用' }}</el-button>
              <el-button link type="danger" size="small" @click="removeRow(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </section>
    </template>

    <template v-else>
      <section class="settings-card pick-card">
        <div class="pick-row">
          <el-select v-model="trialEnv" placeholder="不限环境" clearable style="width: 140px">
            <el-option v-for="e in environments" :key="e.key" :label="e.label" :value="e.key" />
          </el-select>
          <el-input
            v-model="prompt"
            placeholder="例如：我要发造物秀"
            @keyup.enter="runTrial"
          />
          <el-button type="primary" :loading="picking" @click="runTrial">试筛号</el-button>
        </div>
      </section>

      <section v-if="chosen" class="settings-card chosen-card">
        <div class="settings-kicker">首选</div>
        <h3>{{ chosen.name }}</h3>
        <p>{{ envLabel(chosen.env) }} · {{ kindLabel(chosen.kind) }} · {{ identity(chosen) }}</p>
        <p class="hit">{{ chosen.reason || '—' }} · 分 {{ chosen.score ?? 0 }}</p>
        <div class="tag-row">
          <el-tag v-for="t in chosen.tags || []" :key="t" size="small" class="tag-chip">{{ t }}</el-tag>
        </div>
      </section>

      <section class="settings-table-card is-fill">
        <el-table :data="ranked" size="small" border stripe height="100%" row-key="id" empty-text="还没有试过。写一句场景再点试筛号。">
          <el-table-column label="#" width="52">
            <template #default="{ $index }">{{ $index + 1 }}</template>
          </el-table-column>
          <el-table-column label="名称" min-width="140" show-overflow-tooltip>
            <template #default="{ row, $index }">
              <strong>{{ row.name }}</strong>
              <em v-if="$index === 0" class="lock-tag is-pick">首选</em>
              <em v-if="row.locked" class="lock-tag">占用</em>
            </template>
          </el-table-column>
          <el-table-column label="环境" width="88">
            <template #default="{ row }">{{ envLabel(row.env) }}</template>
          </el-table-column>
          <el-table-column label="账号" min-width="180" show-overflow-tooltip>
            <template #default="{ row }">{{ identity(row) }}</template>
          </el-table-column>
          <el-table-column label="分" width="64">
            <template #default="{ row }">{{ row.score ?? 0 }}</template>
          </el-table-column>
          <el-table-column label="为什么" min-width="200" show-overflow-tooltip>
            <template #default="{ row }">
              <span class="hit">{{ row.reason || '—' }}</span>
            </template>
          </el-table-column>
        </el-table>
      </section>
    </template>

    <el-dialog v-model="dialogOpen" :title="editingId ? '编辑测试账号' : '新增测试账号'" width="560px" class="mo-fit-dialog" align-center append-to-body>
      <el-form label-width="92px">
        <el-form-item label="名称">
          <el-input v-model="form.name" placeholder="例如：已领新人礼-安卓" />
        </el-form-item>
        <el-form-item label="环境">
          <el-select v-model="form.env" style="width: 100%">
            <el-option v-for="e in environments" :key="e.key" :label="e.label" :value="e.key" />
          </el-select>
        </el-form-item>
        <el-form-item label="类型">
          <el-select v-model="form.kind" style="width: 100%">
            <el-option v-for="k in KINDS" :key="k.id" :label="k.label" :value="k.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="手机号">
          <el-input v-model="form.phone" placeholder="可空" />
        </el-form-item>
        <el-form-item label="邮箱">
          <el-input v-model="form.email" placeholder="可空" />
        </el-form-item>
        <el-form-item label="用户名">
          <el-input v-model="form.username" placeholder="可空" />
        </el-form-item>
        <el-form-item label="密码">
          <el-input v-model="form.password" type="password" show-password placeholder="留空则保持原密码" />
        </el-form-item>
        <el-form-item label="标签">
          <el-select
            v-model="form.tags"
            multiple
            filterable
            allow-create
            default-first-option
            placeholder="例如：2024注册、已领取新人礼、造物秀白名单"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.note" type="textarea" :rows="2" placeholder="这个号现在处于什么业务状态" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogOpen = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveForm">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.assets-page {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.assets-page > .settings-page-header,
.assets-page > .settings-tabbar,
.pick-card,
.chosen-card {
  flex-shrink: 0;
}
.pick-card {
  margin-bottom: 8px;
}
.pick-row {
  display: flex;
  gap: 8px;
  align-items: center;
}
.chosen-card {
  margin-bottom: 8px;
}
.chosen-card h3 {
  margin: 4px 0 6px;
  font-size: 18px;
}
.chosen-card p {
  margin: 0 0 6px;
  color: #4b5563;
  font-size: 13px;
}
.tag-chip {
  margin: 0 4px 4px 0;
}
.lock-tag {
  margin-left: 6px;
  padding: 0 6px;
  border-radius: 999px;
  background: #fef3c7;
  color: #b45309;
  font-size: 11px;
  font-style: normal;
  font-weight: 700;
}
.lock-tag.is-pick {
  background: #e0e7ff;
  color: #3730a3;
}
.muted { color: #9ca3af; }
.hit { color: #4f46e5; font-weight: 650; }
</style>
