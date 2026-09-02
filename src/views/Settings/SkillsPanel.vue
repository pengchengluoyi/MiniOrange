<script setup>
import { ref, computed, onMounted } from 'vue'
import { Search } from '@element-plus/icons-vue'
import { getSkillsCatalog } from '@/api/settings'
import './settings-ui.css'

const loading = ref(false)
const activeLayer = ref('executor')
const keyword = ref('')
const expandedOp = ref(null)
const showTech = ref(false)

const serverData = ref({ groups: [] })
const executorData = ref({ components: [] })

const FEATURED = [
  { label: '点击', example: '点击「同意」', node: 'public/gesture' },
  { label: '输入', example: '点击密码输入框,输入：123456', node: '引擎直连' },
  { label: '打开应用', example: '打开 造物相机', node: 'public/window' },
  { label: '滑动', example: '上滑 / 下滑', node: 'public/gesture' },
  { label: '返回', example: '返回', node: '引擎直连' },
  { label: '清缓存', example: '前置：1. 应用无缓存', node: '引擎直连' },
]

const matchText = (parts) => {
  const q = keyword.value.trim().toLowerCase()
  if (!q) return true
  return parts.filter(Boolean).join(' ').toLowerCase().includes(q)
}

const flatExecutorOps = computed(() => {
  const rows = []
  for (const comp of executorData.value.components || []) {
    for (const op of comp.operations || []) {
      rows.push({
        ...op,
        compName: comp.name,
        nodeCode: comp.node_code,
        invokeType: comp.invoke_type,
        category: comp.category,
        platforms: op.platforms?.length ? op.platforms : (comp.platforms || []),
        risk: op.risk || comp.risk || '',
        key: `${comp.node_code || comp.name}:${op.id}`,
      })
    }
  }
  return rows
})

const filteredExecutorOps = computed(() => {
  return flatExecutorOps.value.filter((op) =>
    matchText([
      op.name,
      op.description,
      op.compName,
      op.nodeCode,
      op.invoke,
      ...(op.platforms || []),
      ...(op.examples || []),
      ...(op.triggers || []),
    ]),
  )
})

const filteredServerGroups = computed(() => {
  return (serverData.value.groups || [])
    .map((g) => ({
      ...g,
      items: (g.items || []).filter((item) =>
        matchText([g.title, item.name, item.description, ...(item.examples || [])]),
      ),
    }))
    .filter((g) => g.items.length > 0)
})

const nodeLabel = (op) => {
  if (op.nodeCode) return op.nodeCode
  if (op.invokeType === 'engine') return '引擎直连'
  if (op.invokeType === 'internal') return '内部'
  return '—'
}

const primaryExample = (op) => (op.examples && op.examples[0]) || (op.triggers && op.triggers[0]) || '—'

const platformLabel = (p) => {
  const labels = { android: 'Android', ios: 'iOS', mac: 'macOS', windows: 'Windows', web: 'Web' }
  return labels[p] || p
}

const toneClass = (op) => {
  if (op.invokeType === 'engine') return 'tone-engine'
  if (op.invokeType === 'internal') return 'tone-internal'
  if (op.category === '手势') return 'tone-gesture'
  if (op.category === '感知') return 'tone-sense'
  if (op.category === '应用生命周期') return 'tone-app'
  return 'tone-system'
}

const toggleOp = (key) => {
  expandedOp.value = expandedOp.value === key ? null : key
}

const load = async () => {
  loading.value = true
  try {
    const res = await getSkillsCatalog()
    const data = res?.data || {}
    serverData.value = data.server || { groups: [] }
    executorData.value = data.executor || { components: [] }
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="skills-panel" v-loading="loading">
    <div class="toolbar">
      <div class="settings-tabbar compact-tabbar">
        <button
          type="button"
          class="settings-tab"
          :class="{ active: activeLayer === 'executor' }"
          @click="activeLayer = 'executor'"
        >
          <strong>设备操作</strong>
          <span>点击、输入、打开应用</span>
        </button>
        <button
          type="button"
          class="settings-tab"
          :class="{ active: activeLayer === 'server' }"
          @click="activeLayer = 'server'"
        >
          <strong>编排服务</strong>
          <span>账号、登录、编排</span>
        </button>
      </div>
      <el-input
        v-model="keyword"
        clearable
        :prefix-icon="Search"
        placeholder="搜索…"
        class="search"
      />
      <label v-if="activeLayer === 'executor'" class="tech-toggle">
        <input v-model="showTech" type="checkbox" />
        技术细节
      </label>
    </div>

    <!-- 常用速查：仅执行器、无搜索时展示 -->
    <section v-if="activeLayer === 'executor' && !keyword.trim()" class="settings-info-card cheatsheet">
      <div class="settings-kicker">写用例时怎么说</div>
      <div class="cheat-grid">
        <div v-for="item in FEATURED" :key="item.label" class="cheat-item">
          <span class="cheat-label">{{ item.label }}</span>
          <code class="cheat-ex">{{ item.example }}</code>
        </div>
      </div>
    </section>

    <!-- 执行器：扁平列表 -->
    <template v-if="activeLayer === 'executor'">
      <div v-if="!filteredExecutorOps.length && !loading" class="empty">无匹配</div>

      <div v-if="filteredExecutorOps.length" class="settings-card op-card">
        <div class="op-list">
          <button
            v-for="op in filteredExecutorOps"
            :key="op.key"
            type="button"
            class="op-row"
            :class="[{ open: expandedOp === op.key, 'show-tech': showTech }, toneClass(op)]"
            @click="toggleOp(op.key)"
          >
            <div class="op-main">
              <span class="tone-dot"></span>
              <span class="op-name">{{ op.name }}</span>
              <code class="op-example">{{ primaryExample(op) }}</code>
              <span class="platforms">
                <span v-for="p in op.platforms" :key="p" class="platform-tag">{{ platformLabel(p) }}</span>
              </span>
              <span v-if="showTech" class="op-node">{{ nodeLabel(op) }}</span>
            </div>

            <div v-if="expandedOp === op.key" class="op-detail" @click.stop>
              <p v-if="op.description" class="detail-desc">{{ op.description }}</p>
              <p v-if="op.risk" class="risk-text">注意：{{ op.risk }}</p>
              <div v-if="op.examples?.length > 1" class="detail-ex">
                <span v-for="ex in op.examples" :key="ex" class="ex-tag">{{ ex }}</span>
              </div>
              <template v-if="showTech">
                <div v-if="op.params?.length" class="detail-params">
                  <span
                    v-for="p in op.params"
                    :key="p.name"
                    class="param-tag"
                  >{{ p.name }}<template v-if="p.example">={{ p.example }}</template></span>
                </div>
                <code v-if="op.invoke" class="detail-invoke">{{ op.invoke }}</code>
              </template>
            </div>
          </button>
        </div>
      </div>
    </template>

    <!-- Server：分组简洁列表 -->
    <template v-else>
      <p v-if="!keyword.trim()" class="server-hint">这些能力由执行批次和 Copilot 自动调用，写用例时不用管。</p>

      <div v-if="!filteredServerGroups.length && !loading" class="empty">无匹配</div>

      <section v-for="group in filteredServerGroups" :key="group.key" class="settings-card server-section">
        <h3 class="section-title">{{ group.title }}</h3>
        <div class="server-list">
          <div v-for="item in group.items" :key="item.id" class="server-row">
            <span class="server-name">{{ item.name }}</span>
            <span class="server-desc">{{ item.description }}</span>
            <div v-if="item.examples?.length" class="server-ex">
              <span v-for="ex in item.examples" :key="ex" class="ex-tag">{{ ex }}</span>
            </div>
            <code v-if="showTech && item.invoke" class="detail-invoke inline">{{ item.invoke }}</code>
          </div>
        </div>
      </section>

      <label class="tech-toggle bottom">
        <input v-model="showTech" type="checkbox" />
        显示调用入口
      </label>
    </template>
  </div>
</template>

<style scoped>
.skills-panel {
  min-height: 200px;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.compact-tabbar {
  margin-bottom: 0;
}

.compact-tabbar .settings-tab {
  min-width: 150px;
  padding-top: 10px;
  padding-bottom: 12px;
}

.search {
  width: 200px;
  margin-left: auto;
}

.tech-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--settings-muted, #9ca3af);
  cursor: pointer;
  user-select: none;
}

.tech-toggle.bottom {
  margin-top: 16px;
}

.tech-toggle input {
  accent-color: var(--settings-primary, var(--mo-primary, #6366f1));
}

.cheatsheet {
  margin-bottom: 16px;
}

.cheatsheet .settings-kicker {
  margin-bottom: 10px;
}

.cheat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 8px 20px;
}

.cheat-item {
  display: flex;
  align-items: baseline;
  gap: 10px;
  font-size: 13px;
}

.cheat-label {
  flex-shrink: 0;
  width: 56px;
  font-weight: 600;
  color: var(--settings-primary, var(--mo-primary, #4338ca));
}

.cheat-ex {
  font-size: 12px;
  color: #1f2937;
  background: rgba(255, 255, 255, 0.82);
  padding: 2px 8px;
  border-radius: 4px;
  border: 1px solid rgba(199, 210, 254, 0.7);
}

.op-card {
  padding: 0;
  overflow: hidden;
}

.op-list {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.op-row {
  display: block;
  width: 100%;
  padding: 0;
  border: none;
  background: #fff;
  border-left: 4px solid transparent;
  text-align: left;
  cursor: pointer;
  transition: background 0.1s;
}

.op-row + .op-row {
  border-top: 1px solid var(--settings-border, #e3e8f0);
}

.op-row:hover {
  background: var(--settings-soft, #fafafa);
}

.op-row.open {
  background: var(--mo-primary-soft, #f8fbff);
}

.op-main {
  display: grid;
  grid-template-columns: 10px 100px 1fr 190px;
  gap: 12px;
  align-items: center;
  padding: 11px 16px;
  font-size: 13px;
}

.op-row.show-tech .op-main {
  grid-template-columns: 10px 100px 1fr 190px 140px;
}

.tone-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--tone);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--tone) 14%, white);
}

.tone-app {
  --tone: #10b981;
  border-left-color: #10b981;
}

.tone-gesture {
  --tone: #f97316;
  border-left-color: #f97316;
}

.tone-engine {
  --tone: #8b5cf6;
  border-left-color: #8b5cf6;
}

.tone-sense {
  --tone: #0ea5e9;
  border-left-color: #0ea5e9;
}

.tone-internal {
  --tone: #64748b;
  border-left-color: #64748b;
}

.tone-system {
  --tone: #f59e0b;
  border-left-color: #f59e0b;
}

.op-name {
  font-weight: 600;
  color: #111827;
}

.op-example {
  color: #6b7280;
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.op-node {
  text-align: right;
  font-size: 11px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  color: var(--tone);
  font-weight: 700;
  background: color-mix(in srgb, var(--tone) 10%, white);
  border-radius: 999px;
  padding: 3px 8px;
}

.platforms {
  display: flex;
  justify-content: flex-end;
  gap: 4px;
  min-width: 0;
}

.platform-tag {
  font-size: 10px;
  font-weight: 700;
  color: #2563eb;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 999px;
  padding: 2px 6px;
  white-space: nowrap;
}

.op-detail {
  padding: 0 16px 12px 138px;
}

.detail-desc {
  margin: 0 0 8px;
  font-size: 12px;
  color: #9ca3af;
  line-height: 1.5;
}

.risk-text {
  margin: 0 0 8px;
  font-size: 12px;
  color: #b45309;
  line-height: 1.5;
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-radius: 6px;
  padding: 6px 8px;
}

.detail-ex {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}

.detail-params {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 6px;
}

.param-tag {
  font-size: 11px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  color: #7c3aed;
  background: #f5f3ff;
  padding: 2px 6px;
  border-radius: 4px;
}

.detail-invoke {
  display: block;
  font-size: 11px;
  color: #9ca3af;
  word-break: break-all;
  line-height: 1.4;
}

.detail-invoke.inline {
  display: inline-block;
  margin-top: 6px;
}

.ex-tag {
  font-size: 12px;
  color: #334155;
  background: #eff6ff;
  padding: 3px 8px;
  border-radius: 4px;
  border: 1px solid #dbeafe;
}

/* Server */
.server-hint {
  margin: 0 0 16px;
  font-size: 12px;
  color: #9ca3af;
}

.server-section {
  margin-bottom: 20px;
}

.section-title {
  margin: 0 0 8px;
  font-size: 12px;
  font-weight: 600;
  color: #9ca3af;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.server-list {
  border: none;
  border-radius: 0;
  overflow: hidden;
}

.server-row {
  padding: 12px 0;
  background: transparent;
  border-bottom: 1px solid var(--settings-border, #e0f2fe);
  font-size: 13px;
}

.server-row:last-child {
  border-bottom: none;
}

.server-row:last-child {
  border-bottom: none;
}

.server-name {
  font-weight: 600;
  color: #111827;
  margin-right: 8px;
}

.server-desc {
  color: #6b7280;
  font-size: 12px;
}

.server-ex {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
}

.empty {
  padding: 40px;
  text-align: center;
  color: #d1d5db;
  font-size: 13px;
}

@media (max-width: 640px) {
  .op-main {
    grid-template-columns: 1fr;
    gap: 4px;
  }
  .op-node {
    text-align: left;
  }
  .platforms {
    justify-content: flex-start;
  }
  .op-detail {
    padding-left: 16px;
  }
}
</style>
