<script setup>
import { computed } from 'vue'

const props = defineProps({
  run: { type: Object, default: null },
})

const report = computed(() => {
  if (props.run?.report?.summary) return props.run.report
  const cases = props.run?.cases || []
  const passed = cases.filter((c) => c.status === 'pass').length
  const failed = cases.filter((c) => c.status === 'fail').length
  const skipped = cases.filter((c) => c.status === 'skip').length
  const total = props.run?.total ?? cases.length
  return {
    headline: failed ? `${failed} 条用例失败` : skipped ? `${passed} 通过，${skipped} 条跳过` : '全部通过',
    level: failed ? 'error' : skipped ? 'warning' : 'success',
    summary: {
      total,
      passed: props.run?.passed ?? passed,
      failed: props.run?.failed ?? failed,
      skipped: props.run?.skipped ?? skipped,
      duration_ms: props.run?.duration_ms,
    },
    categories: {},
    issues: cases
      .filter((c) => c.status !== 'pass')
      .map((c) => ({
        case_id: c.case_id,
        name: c.name,
        status: c.status,
        msg: c.msg,
        category: c.status,
        category_label: c.status,
      })),
  }
})
const summary = computed(() => report.value.summary || {})
const categories = computed(() => report.value.categories || {})
const issues = computed(() => report.value.issues || [])
const drift = computed(() => props.run?.foreground_drift || report.value.foreground_drift || {})

const levelType = computed(() => {
  const lv = report.value.level || 'success'
  if (lv === 'error') return 'error'
  if (lv === 'warning') return 'warning'
  return 'success'
})

const categoryOrder = [
  'operation_fail',
  'expectation_fail',
  'precondition_skip',
  'platform_skip',
  'parse_error',
  'device_offline',
  'unknown_fail',
  'skipped',
  'passed',
]

const orderedCategories = computed(() => {
  const rows = []
  for (const key of categoryOrder) {
    const block = categories.value[key]
    if (block?.count) rows.push({ key, ...block })
  }
  return rows
})

function formatMs(ms) {
  const n = Number(ms)
  if (!n || n < 0) return '—'
  const s = Math.floor(n / 1000)
  const m = Math.floor(s / 60)
  const rem = s % 60
  return m > 0 ? `${m}分${rem}秒` : `${s}秒`
}
</script>

<template>
  <div v-if="run" class="run-summary">
    <el-alert
      :title="report.headline || `通过 ${summary.passed ?? 0}/${summary.total ?? 0}`"
      :type="levelType"
      :closable="false"
      show-icon
      class="summary-alert"
    >
      <template #default>
        <div class="summary-stats">
          <span>设备 {{ run.sn }}</span>
          <span>平台 {{ run.platform }}</span>
          <span>耗时 {{ formatMs(summary.duration_ms || run.duration_ms) }}</span>
          <span v-if="summary.skipped">跳过 {{ summary.skipped }}</span>
        </div>
        <p v-if="drift.message" class="drift-note">{{ drift.message }}</p>
      </template>
    </el-alert>

    <div v-if="orderedCategories.length" class="category-grid">
      <div v-for="cat in orderedCategories" :key="cat.key" class="category-card">
        <div class="category-head">
          <span class="category-label">{{ cat.label }}</span>
          <el-tag size="small" :type="cat.key === 'passed' ? 'success' : cat.key.includes('skip') ? 'info' : 'danger'">
            {{ cat.count }}
          </el-tag>
        </div>
        <ul v-if="cat.key !== 'passed'" class="category-list">
          <li v-for="item in cat.items" :key="`${item.case_id}-${item.category}`">
            <strong>{{ item.name || item.case_id }}</strong>
            <span v-if="item.msg" class="item-msg">{{ item.msg }}</span>
          </li>
        </ul>
      </div>
    </div>

    <el-empty v-else-if="!issues.length" description="暂无分类详情" />
  </div>
</template>

<style scoped>
.run-summary {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 12px;
}
.summary-alert :deep(.el-alert__content) {
  width: 100%;
}
.summary-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 4px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
.drift-note {
  margin: 8px 0 0;
  font-size: 13px;
  color: var(--el-text-color-regular);
}
.category-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 10px;
}
.category-card {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  padding: 10px 12px;
  background: var(--el-fill-color-blank);
}
.category-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}
.category-label {
  font-weight: 600;
  font-size: 13px;
}
.category-list {
  margin: 0;
  padding-left: 18px;
  font-size: 12px;
  color: var(--el-text-color-regular);
}
.category-list li {
  margin-bottom: 6px;
}
.item-msg {
  display: block;
  color: var(--el-text-color-secondary);
  margin-top: 2px;
}
</style>
