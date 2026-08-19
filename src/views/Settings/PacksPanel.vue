<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Plus, Refresh, Search } from '@element-plus/icons-vue'
import { listPackKinds, listPackRoots, listPacks, reloadPacks } from '@/api/packs'
import PackCreateDialog from './PackCreateDialog.vue'
import PackEntryDrawer from './PackEntryDrawer.vue'

// 四类扩展（kind）与后端 rPacks.KINDS 对应
const KIND_META = {
  capability: { label: '能力', desc: '能做什么动作' },
  recovery: { label: '恢复', desc: '系统/设备异常怎么处置' },
  knowledge: { label: '知识', desc: '这个应用的业务判据' },
  oracle: { label: '判定', desc: '能不能测、怎么判、多严' },
}
const PROVIDER_LABEL = {
  platform: '平台团队',
  device_team: '设备环境组',
  app_qa: '业务测试',
  learned: '自动学习',
  doc: '文档学习',
  third_party: '第三方',
}
const LIFECYCLE_LABEL = { draft: '待确认', review: '待评审', active: '生效中', deprecated: '已停用' }
// 四个根：优先级 app > team > builtin > learned（同 id 高者胜）
const ROOT_LABEL = { app: '应用私有', team: '团队共享', builtin: '仓库内置', learned: '自动学习' }

const route = useRoute()

const loading = ref(false)
const activeKind = ref('recovery')     // 恢复类是当前最有内容的一类，默认落在这里
const keyword = ref('')
const providerFilter = ref('')
const lifecycleFilter = ref('')
const rootFilter = ref('')
const useFixture = ref(false)          // 后端没数据时可切样例，方便前端联调

const kinds = ref([])
const items = ref([])
const notReady = ref({})
const health = ref({ error_count: 0, by_kind: {}, errors: [] })
const showErrors = ref(false)

const drawerOpen = ref(false)
const activeRow = ref(null)
const createOpen = ref(false)
const roots = ref([])

const kindTabs = computed(() => {
  const byKind = Object.fromEntries((kinds.value || []).map((k) => [k.kind, k]))
  return Object.entries(KIND_META).map(([kind, meta]) => ({
    kind,
    ...meta,
    count: byKind[kind]?.count ?? 0,
    ready: byKind[kind]?.ready ?? true,
    reason: byKind[kind]?.not_ready_reason || '',
  }))
})

const currentTab = computed(() => kindTabs.value.find((t) => t.kind === activeKind.value))

const providerOptions = computed(() => {
  const set = new Set(items.value.map((i) => i.provider).filter(Boolean))
  return [...set].map((p) => ({ value: p, label: PROVIDER_LABEL[p] || p }))
})

const fetchRoots = async () => {
  try {
    const res = await listPackRoots()
    roots.value = res?.data?.roots || []
  } catch (e) { /* 根信息拿不到不影响列表 */ }
}

const fetchKinds = async () => {
  try {
    const res = await listPackKinds()
    kinds.value = res?.data?.kinds || []
    health.value = res?.data?.health || health.value
  } catch (e) {
    ElMessage.error('读取扩展分类失败')
  }
}

const fetchItems = async () => {
  loading.value = true
  try {
    const params = { kind: activeKind.value }
    if (keyword.value.trim()) params.q = keyword.value.trim()
    if (providerFilter.value) params.provider = providerFilter.value
    if (lifecycleFilter.value) params.lifecycle = lifecycleFilter.value
    if (rootFilter.value) params.root = rootFilter.value
    if (useFixture.value) params.fixture = 1
    const res = await listPacks(params)
    const data = res?.data || {}
    // fixture 返回全部 kind 的样例，这里按当前 Tab 过滤
    items.value = useFixture.value
      ? (data.items || []).filter((i) => i.kind === activeKind.value)
      : (data.items || [])
    notReady.value = data.not_ready || {}
    if (data.health) health.value = data.health
  } catch (e) {
    ElMessage.error('读取扩展列表失败')
    items.value = []
  } finally {
    loading.value = false
  }
}

const switchKind = (kind) => {
  if (activeKind.value === kind) return
  activeKind.value = kind
  fetchItems()
}

const onReload = async () => {
  try {
    const res = await reloadPacks()
    health.value = res?.data?.health || health.value
    ElMessage.success('已重载 YAML')
    await Promise.all([fetchKinds(), fetchItems()])
  } catch (e) {
    ElMessage.error('重载失败')
  }
}

const openRow = (row) => {
  activeRow.value = row
  drawerOpen.value = true
}

const statusOf = (row) => {
  if (row.overridden_by) return { icon: '🚫', tip: `被 ${row.overridden_by} 覆盖，执行期不生效` }
  if (row.lifecycle === 'deprecated' || !row.enabled) return { icon: '🚫', tip: '已停用' }
  if (row.lifecycle === 'draft') return { icon: '⏸', tip: '待确认后才生效' }
  if (row.lifecycle === 'review') return { icon: '🧪', tip: '待评审' }
  return { icon: '✅', tip: '生效中' }
}

const scopeText = (row) => {
  const s = row.scope || {}
  const bits = []
  if (s.app_ids?.length) bits.push(`应用 ${String(s.app_ids[0]).slice(0, 8)}`)
  else bits.push('全部应用')
  if (s.app_versions) bits.push(s.app_versions)
  if (s.platforms?.length) bits.push(s.platforms.join('/'))
  if (s.visible_to?.length === 1 && s.visible_to[0] === 'system') bits.push('仅系统层可见')
  return bits.join(' · ')
}

const statsText = (row) => {
  const h = Number(row.stats?.hit_count || 0)
  const r = Number(row.stats?.refuted_count || 0)
  if (!h && !r) return ''
  return `命中 ${h}${r ? ` / 推翻 ${r}` : ''}`
}

onMounted(async () => {
  // 支持从回放页「去规则页」带 ?q=<规则 id>&kind= 直接定位
  const q = String(route.query.q || '').trim()
  const kind = String(route.query.kind || '').trim()
  if (q) keyword.value = q
  if (kind && KIND_META[kind]) activeKind.value = kind
  await Promise.all([fetchKinds(), fetchRoots()])
  // 带 q 但没带 kind 时，跨四类找一遍，命中哪类就切到哪类
  if (q && !kind) {
    for (const k of ['recovery', 'knowledge', 'capability', 'oracle']) {
      const res = await listPacks({ kind: k, q })
      if ((res?.data?.items || []).length) { activeKind.value = k; break }
    }
  }
  await fetchItems()
})

const onCreated = async (item) => {
  await Promise.all([fetchItems(), fetchRoots(), fetchKinds()])
  if (item) openRow(item)     // 建完直接打开详情，方便接着编辑/试跑
}

// 当前 kind 是否支持新建（后端只允许 recovery 写入）
const canCreate = computed(() => activeKind.value === 'recovery' && !useFixture.value)
</script>

<template>
  <div class="packs-panel" v-loading="loading">
    <!-- 顶部：加载健康度。坏条目直接可展开看原因（复用后端 LoadError） -->
    <el-alert v-if="health.error_count" type="warning" :closable="false" show-icon class="pk-health">
      <template #title>
        <span>{{ health.error_count }} 个条目有问题</span>
        <el-button link type="primary" size="small" @click="showErrors = !showErrors">
          {{ showErrors ? '收起' : '查看' }}
        </el-button>
        <el-button link type="primary" size="small" :icon="Refresh" @click="onReload">重载</el-button>
      </template>
      <ul v-if="showErrors" class="pk-errors">
        <li v-for="(e, i) in health.errors" :key="i">
          <code>{{ e.file }}</code> <span class="pk-err-kind">{{ e.kind }}</span> {{ e.message }}
        </li>
      </ul>
    </el-alert>

    <div class="toolbar">
      <div class="settings-tabbar compact-tabbar">
        <button
          v-for="t in kindTabs"
          :key="t.kind"
          type="button"
          class="settings-tab"
          :class="{ active: activeKind === t.kind }"
          @click="switchKind(t.kind)"
        >
          <strong>{{ t.label }}<em v-if="t.count" class="pk-count">{{ t.count }}</em></strong>
          <span>{{ t.desc }}</span>
        </button>
      </div>

      <div class="pk-filters">
        <el-input
          v-model="keyword" class="search" clearable placeholder="搜 id / 标题 / 触发条件 / 负责人"
          :prefix-icon="Search" @keyup.enter="fetchItems" @clear="fetchItems"
        />
        <el-select v-model="providerFilter" placeholder="提供方" clearable class="pk-select"
                   @change="fetchItems">
          <el-option v-for="o in providerOptions" :key="o.value" :label="o.label" :value="o.value" />
        </el-select>
        <el-select v-model="lifecycleFilter" placeholder="状态" clearable class="pk-select"
                   @change="fetchItems">
          <el-option v-for="(label, v) in LIFECYCLE_LABEL" :key="v" :label="label" :value="v" />
        </el-select>
        <el-select v-model="rootFilter" placeholder="来源根" clearable class="pk-select"
                   @change="fetchItems">
          <el-option
            v-for="r in roots" :key="r.root" :value="r.root"
            :label="`${ROOT_LABEL[r.root] || r.root}（${r.count}）`"
          />
        </el-select>
        <el-button :icon="Search" @click="fetchItems">查询</el-button>
        <el-button v-if="canCreate" type="primary" :icon="Plus" @click="createOpen = true">
          新建
        </el-button>
        <el-checkbox v-model="useFixture" class="pk-fixture" @change="fetchItems">样例数据</el-checkbox>
      </div>
    </div>

    <!-- 尚未接入的 kind：说清原因，而不是给个空列表让人猜 -->
    <el-alert
      v-if="currentTab && !currentTab.ready && !useFixture"
      type="info" :closable="false" show-icon class="pk-notready"
      :title="`「${currentTab.label}」还未接入`"
      :description="currentTab.reason || notReady[activeKind] || ''"
    >
      <template #default>
        <p class="pk-notready-desc">{{ currentTab.reason || notReady[activeKind] }}</p>
        <p class="pk-notready-desc">可勾选右上「样例数据」预览这类条目将来长什么样。</p>
      </template>
    </el-alert>

    <div v-if="!items.length && !loading" class="empty">
      {{ keyword || providerFilter || lifecycleFilter ? '无匹配条目' : '暂无条目' }}
    </div>

    <div v-else class="pk-list">
      <div v-for="row in items" :key="row.uid" class="pk-row" @click="openRow(row)">
        <div class="pk-row-main">
          <span class="pk-status" :title="statusOf(row).tip">{{ statusOf(row).icon }}</span>
          <span class="pk-name">{{ row.title || row.id }}</span>
          <code class="pk-id">{{ row.id }}</code>
          <el-tag v-if="row.detail?.mode" size="small" effect="plain" class="pk-mode">
            {{ row.detail.mode === 'deterministic' ? '确定性' : '给模型提示' }}
          </el-tag>
          <el-tag v-if="row.detail?.pure_declarative" size="small" type="success" effect="plain">
            零 Python
          </el-tag>
          <el-tag v-if="row.detail?.status" size="small" effect="plain"
                  :type="row.detail.status === 'supported' ? 'success'
                    : (row.detail.status === 'partial' ? 'warning' : 'danger')">
            {{ row.detail.status }}
          </el-tag>
          <el-tag v-if="row.overridden_by" size="small" type="info" effect="plain"
                  :title="`被 ${row.overridden_by} 覆盖，执行期不生效`">
            已被覆盖
          </el-tag>
          <span class="pk-spacer" />
          <span v-if="statsText(row)" class="pk-stats">{{ statsText(row) }}</span>
        </div>
        <div class="pk-row-sub">
          <span class="pk-root">{{ ROOT_LABEL[row.root] || row.root }}</span>
          <span class="pk-provider">{{ PROVIDER_LABEL[row.provider] || row.provider }}</span>
          <span class="pk-owner" :class="{ missing: !row.owner }">{{ row.owner || '未指定负责人' }}</span>
          <span class="pk-scope">{{ scopeText(row) }}</span>
          <span v-if="row.when || row.summary" class="pk-when">{{ row.when || row.summary }}</span>
        </div>
      </div>
    </div>

    <PackCreateDialog v-model="createOpen" :kind="activeKind" @created="onCreated" />

    <PackEntryDrawer
      v-model="drawerOpen" :uid="activeRow?.uid || ''" :row="activeRow" :fixture="useFixture"
      @changed="fetchItems"
    />
  </div>
</template>

<style scoped>
.packs-panel { width: 100%; }
.pk-health { margin-bottom: 12px; }
.pk-errors { margin: 8px 0 0; padding-left: 18px; font-size: 12px; line-height: 1.7; }
.pk-err-kind { color: var(--el-text-color-secondary); margin: 0 4px; }

.toolbar { display: flex; flex-direction: column; gap: 10px; margin-bottom: 12px; }
.pk-count {
  margin-left: 4px; font-style: normal; font-size: 11px; padding: 0 5px;
  border-radius: 8px; background: var(--el-fill-color-dark); color: var(--el-text-color-regular);
}
.pk-filters { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.pk-filters .search { width: 260px; }
.pk-select { width: 130px; }
.pk-fixture { margin-left: auto; }

.pk-notready { margin-bottom: 12px; }
.pk-notready-desc { margin: 2px 0; font-size: 12px; line-height: 1.6; }

.empty { padding: 32px 0; text-align: center; color: var(--el-text-color-secondary); font-size: 13px; }

.pk-list { display: flex; flex-direction: column; }
.pk-row {
  padding: 10px 12px; border-bottom: 1px solid var(--el-border-color-lighter);
  cursor: pointer; transition: background .15s;
}
.pk-row:hover { background: var(--el-fill-color-light); }
.pk-row-main { display: flex; align-items: center; gap: 8px; }
.pk-status { font-size: 13px; }
.pk-name { font-size: 14px; font-weight: 500; }
.pk-id { font-size: 12px; color: var(--el-text-color-placeholder); }
.pk-spacer { flex: 1; }
.pk-stats { font-size: 12px; color: var(--el-text-color-secondary); }
.pk-row-sub {
  display: flex; align-items: center; gap: 10px; margin-top: 4px;
  font-size: 12px; color: var(--el-text-color-secondary); flex-wrap: wrap;
}
.pk-provider { padding: 0 6px; border-radius: 8px; background: var(--el-fill-color); }
.pk-root {
  padding: 0 6px; border-radius: 8px; background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
}
.pk-owner.missing { color: var(--el-color-warning); }
.pk-when {
  flex: 1; min-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  color: var(--el-text-color-placeholder);
}
</style>
