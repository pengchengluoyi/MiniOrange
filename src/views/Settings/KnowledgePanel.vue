<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { getTestingKnowledge, upsertKnowledgeItem, deleteKnowledgeItem, reviewKnowledgeItem, autoReviewKnowledge } from '@/api/settings'
import { clipText, slicePage, TABLE_PAGE_SIZES } from '@/utils/tablePage'
import './settings-ui.css'

const props = defineProps({
  embedded: { type: Boolean, default: false },
  /** 仅展示/维护该应用专属知识 */
  appId: { type: String, default: '' },
  appOnly: { type: Boolean, default: false },
  appName: { type: String, default: '' },
  hideNav: { type: Boolean, default: false },
  reviewFilter: { type: String, default: '' },
})

const CATEGORY_OPTIONS = ['业务逻辑', 'UI导航', '登录注册', 'Tab切换', '交互规范', '其他']
const SOURCE_LABEL = { manual: '手动添加', case_run: '用例执行', task_run: '任务汇总' }
const REVIEW_LABEL = { pending: '待审核', approved: '已通过', rejected: '已驳回' }

const loading = ref(false)
const savingItem = ref(false)
const autoReviewing = ref(false)
const allItems = ref([])
const listFilter = ref(props.reviewFilter === 'all' ? 'all' : 'pending')
watch(() => props.reviewFilter, (v) => {
  if (v === 'pending' || v === 'all') listFilter.value = v
})
const configDialogVisible = ref(false)
const editingRow = ref(null) // draft
const editingTargetRow = ref(null) // edit 时引用原始行；create 时为 null

const normalizeRow = (x) => ({
  ...x,
  category: x.category || '其他',
  tagsText: (x.tags || []).join(', '),
  appIdsText: (x.app_ids || []).join(', '),
  source: x.source || 'manual',
  review_status: x.review_status || 'approved',
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

const sourcePool = computed(() => {
  if (props.appOnly) return appItems.value
  if (props.embedded) return globalItems.value
  return allItems.value
})
const visibleItems = computed(() => filterPool(sourcePool.value))
const page = ref(1)
const pageSize = ref(20)
const pagedItems = computed(() => slicePage(visibleItems.value, page.value, pageSize.value))
const showAppColumn = computed(() => !props.embedded)
const pageTitle = computed(() => {
  if (props.appOnly) return '应用知识库'
  if (props.embedded) return '全局知识库'
  return '知识库'
})
const pageDesc = computed(() => {
  if (props.appOnly) {
    return `${props.appName ? `${props.appName} · ` : ''}产品专家先对照图谱和需求给意见，知识审核员再机审。置信不足才留人工。`
  }
  if (props.embedded) return '产品专家提供应用事实，知识审核员机审。拿不准的留待审核。'
  return '机审先问产品专家（图谱/需求），再由知识审核员过或驳。高置信自动处理，其余留人工。需求/版本验收仍必须人点。'
})
const createLabel = computed(() => (props.embedded ? '新建' : '新建条目'))
const tableTitle = computed(() => (listFilter.value === 'pending' ? '待审核' : '已通过知识'))

function filterPool(list) {
  if (listFilter.value === 'pending') {
    return list.filter((r) => r.review_status === 'pending')
  }
  return list.filter((r) => r.review_status !== 'pending')
}
const pendingCount = computed(() => {
  const pool = props.appOnly ? appItems.value : (props.embedded ? globalItems.value : allItems.value)
  return pool.filter((r) => r.review_status === 'pending').length
})
const sourceLabel = (row) => SOURCE_LABEL[row?.source] || SOURCE_LABEL.manual
const reviewLabel = (row) => REVIEW_LABEL[row?.review_status] || REVIEW_LABEL.approved
const reviewMethodLabel = (row) => {
  if (row?.review_method === 'machine') {
    const n = Number(row.review_confidence)
    const bit = Number.isFinite(n) ? ` ${n}` : ''
    if (row.review_status === 'pending') return `机审留人${bit}`
    return `机审${bit}`
  }
  if (row?.review_method === 'human') return '人工'
  return '—'
}
const emptyText = computed(() => (
  listFilter.value === 'pending'
    ? '暂无待审核。跑完用例会生成草稿，机审高置信会自动过。'
    : '暂无已通过知识'
))
const metaEditable = computed(() => {
  if (!editingRow.value) return false
  if (!editingTargetRow.value) return true
  return editingRow.value.review_status === 'pending'
})

const contentPreview = (text) => clipText(text, 72)

const onCreate = () => {
  if (props.appOnly) addAppRow()
  else addGlobalRow()
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

const runAutoReview = async () => {
  if (autoReviewing.value || !pendingCount.value) return
  autoReviewing.value = true
  try {
    const res = await autoReviewKnowledge(props.appOnly ? props.appId : '')
    const data = res?.data || {}
    const approved = Number(data.approved || 0)
    const rejected = Number(data.rejected || 0)
    const held = Number(data.held || 0)
    const skipped = Number(data.skipped || 0)
    ElMessage.success(`机审完成：通过 ${approved} · 驳回 ${rejected} · 留人 ${held}${skipped ? ` · 未跑 ${skipped}` : ''}`)
    await load()
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || e?.message || '机审失败')
  } finally {
    autoReviewing.value = false
  }
}

const cloneRow = (row) => ({
  ...row,
  category: row.category || '其他',
  tagsText: row.tagsText || '',
  appIdsText: row.appIdsText || '',
  enabled: row.enabled !== false,
})

const openCreateDialog = (rowDraft) => {
  editingTargetRow.value = null
  editingRow.value = cloneRow(rowDraft)
  configDialogVisible.value = true
}

const addGlobalRow = () => {
  openCreateDialog({
    id: '',
    title: '',
    content: '',
    category: '其他',
    tagsText: '',
    appIdsText: '',
    enabled: true,
    source: 'manual',
    review_status: 'approved',
  })
}

const addAppRow = () => {
  if (!props.appId) return ElMessage.warning('缺少应用 ID')
  openCreateDialog({
    id: '',
    title: '',
    content: '',
    category: '其他',
    tagsText: '',
    appIdsText: props.appId,
    app_ids: [props.appId],
    enabled: true,
    source: 'manual',
    review_status: 'approved',
  })
}

const removeRow = async (row) => {
  if (row.id) {
    try {
      await deleteKnowledgeItem(row.id)
    } catch (e) {
      ElMessage.error(e?.response?.data?.detail || '删除失败')
      return
    }
  }
  const idx = allItems.value.indexOf(row)
  if (idx >= 0) allItems.value.splice(idx, 1)
}

const openConfig = (row) => {
  editingTargetRow.value = row
  editingRow.value = cloneRow(row)
  configDialogVisible.value = true
}

const cancelConfig = () => {
  configDialogVisible.value = false
  editingRow.value = null
  editingTargetRow.value = null
}

const saveConfig = async () => {
  if (!editingRow.value) return cancelConfig()
  if (!editingRow.value.title?.trim() || !editingRow.value.content?.trim()) {
    ElMessage.warning('「标题」和「知识内容」均不能为空')
    return
  }
  savingItem.value = true
  try {
    const payload = {
      id: editingRow.value.id || '',
      title: editingRow.value.title.trim(),
      content: editingRow.value.content.trim(),
      category: editingRow.value.category || '其他',
      tags: String(editingRow.value.tagsText || '').split(/[,，、]/).map(s => s.trim()).filter(Boolean),
      app_ids: String(editingRow.value.appIdsText || '').split(/[,，、\s]+/).map(s => s.trim()).filter(Boolean),
      enabled: editingRow.value.enabled !== false,
      source: editingRow.value.source || 'manual',
      review_status: editingRow.value.review_status || (editingRow.value.source === 'manual' ? 'approved' : 'pending'),
    }
    const res = await upsertKnowledgeItem(payload)
    const saved = normalizeRow(res?.data?.item || payload)
    if (editingTargetRow.value) {
      Object.assign(editingTargetRow.value, saved)
    } else {
      allItems.value.unshift(saved)
    }
    ElMessage.success('已保存')
    cancelConfig()
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || '保存失败')
  } finally {
    savingItem.value = false
  }
}

const persistEnabled = async (row) => {
  if (!row?.id || row.review_status === 'pending') return
  try {
    await upsertKnowledgeItem({
      id: row.id,
      title: row.title,
      content: row.content,
      category: row.category,
      tags: String(row.tagsText || '').split(/[,，、]/).map((s) => s.trim()).filter(Boolean),
      app_ids: String(row.appIdsText || '').split(/[,，、\s]+/).map((s) => s.trim()).filter(Boolean),
      enabled: row.enabled !== false,
      source: row.source || 'manual',
      review_status: row.review_status || 'approved',
    })
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || '更新失败')
    row.enabled = !row.enabled
  }
}

const approveRow = async (row, extra = {}) => {
  if (!row?.id) return
  savingItem.value = true
  try {
    const res = await reviewKnowledgeItem(row.id, {
      action: 'approve',
      title: extra.title ?? row.title,
      content: extra.content ?? row.content,
      category: extra.category ?? row.category,
        tags: String(extra.tagsText ?? row.tagsText ?? '').split(/[,，、]/).map((s) => s.trim()).filter(Boolean),
    })
    Object.assign(row, normalizeRow(res?.data?.item || { ...row, review_status: 'approved' }))
    ElMessage.success('已通过，可被执行匹配')
    if (editingTargetRow.value === row) cancelConfig()
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || '审核失败')
  } finally {
    savingItem.value = false
  }
}

const rejectRow = async (row) => {
  if (!row?.id) return
  savingItem.value = true
  try {
    await reviewKnowledgeItem(row.id, { action: 'reject' })
    const idx = allItems.value.indexOf(row)
    if (idx >= 0) allItems.value.splice(idx, 1)
    ElMessage.success('已驳回并删除')
    if (editingTargetRow.value === row) cancelConfig()
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || '驳回失败')
  } finally {
    savingItem.value = false
  }
}

const beforeDialogClose = (done) => {
  // 关闭/取消：丢弃 draft，不写入列表
  editingRow.value = null
  editingTargetRow.value = null
  done()
}

onMounted(async () => {
  await load()
})

watch([listFilter, () => visibleItems.value.length], () => {
  page.value = 1
})
</script>

<template>
  <div class="settings-panel knowledge-panel" :class="{ embedded }" v-loading="loading">
    <header class="settings-page-header">
      <div>
        <h2 class="settings-page-title">{{ pageTitle }}</h2>
        <p class="settings-page-desc">{{ pageDesc }}</p>
      </div>
      <div class="settings-summary-pill" :style="pendingCount ? { background: '#fffbeb', color: '#b45309' } : undefined">
        {{ pendingCount ? `${pendingCount} 条待审核` : '暂无待审核' }}
      </div>
    </header>
    <div v-if="!hideNav" class="settings-tabbar">
      <button type="button" class="settings-tab" :class="{ active: listFilter === 'pending' }" @click="listFilter = 'pending'">
        <strong>待审核</strong>
        <span>自动生成，通过后才使用</span>
      </button>
      <button type="button" class="settings-tab" :class="{ active: listFilter === 'all' }" @click="listFilter = 'all'">
        <strong>已通过</strong>
        <span>可被执行匹配</span>
      </button>
    </div>
    <section class="settings-table-card is-fill">
      <div class="col-head">
        <h3>{{ tableTitle }}</h3>
        <div class="col-actions">
          <el-button
            v-if="listFilter === 'pending'"
            size="small"
            :loading="autoReviewing"
            :disabled="!pendingCount"
            @click="runAutoReview"
          >机审待审</el-button>
          <el-button size="small" type="primary" @click="onCreate">{{ createLabel }}</el-button>
        </div>
      </div>
      <div class="table-wrap">
        <el-table
          :data="pagedItems"
          border
          stripe
          size="small"
          class="col-table"
          height="100%"
          :empty-text="emptyText"
        >
          <el-table-column label="分类" width="100" prop="category" show-overflow-tooltip />
          <el-table-column label="标题" min-width="140" show-overflow-tooltip prop="title" />
          <el-table-column label="标签" width="110" show-overflow-tooltip>
            <template #default="{ row }">{{ row.tagsText || '—' }}</template>
          </el-table-column>
          <el-table-column label="来源" width="92" show-overflow-tooltip>
            <template #default="{ row }">{{ sourceLabel(row) }}</template>
          </el-table-column>
          <el-table-column label="审核" width="88">
            <template #default="{ row }">
              <el-tag size="small" :type="row.review_status === 'pending' ? 'warning' : 'success'">{{ reviewLabel(row) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="机审" width="108" show-overflow-tooltip>
            <template #default="{ row }">
              <span :title="row.review_reason || ''">{{ reviewMethodLabel(row) }}</span>
            </template>
          </el-table-column>
          <el-table-column v-if="showAppColumn" label="限定应用" width="140" show-overflow-tooltip>
            <template #default="{ row }">{{ row.appIdsText || '全局' }}</template>
          </el-table-column>
          <el-table-column label="知识内容" min-width="180">
            <template #default="{ row }">
              <span class="content-preview" :title="row.content">{{ contentPreview(row.content) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="启用" width="64">
            <template #default="{ row }">
              <el-switch
                v-model="row.enabled"
                size="small"
                :disabled="row.review_status === 'pending'"
                @change="persistEnabled(row)"
              />
            </template>
          </el-table-column>
          <el-table-column label="操作" width="148" fixed="right">
            <template #default="{ row }">
              <el-button v-if="row.review_status === 'pending'" link type="primary" size="small" @click="openConfig(row)">审核</el-button>
              <el-button v-else link type="primary" size="small" @click="openConfig(row)">查看</el-button>
              <el-button v-if="row.review_status === 'pending'" link type="danger" size="small" @click="rejectRow(row)">驳回</el-button>
              <el-button v-else link type="danger" size="small" @click="removeRow(row)">删</el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>
      <el-pagination
        class="settings-table-pager"
        background
        layout="total, sizes, prev, pager, next"
        :total="visibleItems.length"
        :page-sizes="TABLE_PAGE_SIZES"
        v-model:page-size="pageSize"
        v-model:current-page="page"
      />
    </section>

    <el-dialog
      v-model="configDialogVisible"
      :title="editingRow?.review_status === 'pending' ? '审核知识' : '知识配置'"
      width="520px"
      destroy-on-close
      :before-close="beforeDialogClose"
    >
      <el-form v-if="editingRow" label-width="80px">
        <el-form-item label="来源">
          <span>{{ sourceLabel(editingRow) }}</span>
        </el-form-item>
        <el-form-item v-if="editingRow.question" label="提问">
          <p class="desc compact">{{ editingRow.question }}</p>
        </el-form-item>
        <el-form-item v-if="editingRow.review_reason || editingRow.review_method" label="机审">
          <p class="desc compact">{{ reviewMethodLabel(editingRow) }}<template v-if="editingRow.review_reason"> · {{ editingRow.review_reason }}</template></p>
        </el-form-item>
        <el-form-item v-if="editingRow.expert_note" label="产品专家">
          <p class="desc compact">{{ editingRow.expert_note }}</p>
        </el-form-item>
        <el-form-item label="分类">
          <el-select v-if="metaEditable" v-model="editingRow.category" filterable allow-create style="width: 100%">
            <el-option v-for="c in CATEGORY_OPTIONS" :key="c" :label="c" :value="c" />
          </el-select>
          <span v-else>{{ editingRow.category || '其他' }}</span>
        </el-form-item>
        <el-form-item label="标题">
          <el-input v-if="metaEditable" v-model="editingRow.title" />
          <span v-else>{{ editingRow.title }}</span>
        </el-form-item>
        <el-form-item label="标签">
          <el-input v-if="metaEditable" v-model="editingRow.tagsText" placeholder="登录, tab, 我的" />
          <span v-else>{{ editingRow.tagsText || '—' }}</span>
        </el-form-item>
        <el-form-item label="知识内容">
          <el-input v-model="editingRow.content" type="textarea" :rows="6" />
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="editingRow.enabled" :disabled="editingRow.review_status === 'pending'" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="cancelConfig">取消</el-button>
        <template v-if="editingRow?.review_status === 'pending' && editingTargetRow">
          <el-button :loading="savingItem" @click="rejectRow(editingTargetRow)">驳回</el-button>
          <el-button type="primary" :loading="savingItem" @click="approveRow(editingTargetRow, editingRow)">审核通过</el-button>
        </template>
        <el-button v-else type="primary" :loading="savingItem" @click="saveConfig">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.knowledge-panel {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.knowledge-panel.embedded { padding: 0; }
.knowledge-panel.embedded .settings-page-header { margin-bottom: 8px; }
.knowledge-panel.embedded .settings-tabbar { margin-bottom: 12px; }
.knowledge-panel .settings-page-header,
.knowledge-panel .settings-tabbar { flex-shrink: 0; }
.desc { margin: 0 0 12px; color: #6b7280; font-size: 13px; }
.desc.compact { margin-top: 0; }
.col-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  flex-wrap: wrap;
  flex-shrink: 0;
}
.col-head h3 { margin: 0; font-size: 14px; font-weight: 600; flex: 1; }
.col-sub.inline { margin: 0; font-size: 12px; color: #9ca3af; flex: 1; }
.col-actions { display: flex; gap: 8px; flex-shrink: 0; }
.table-wrap {
  flex: 1;
  min-height: 280px;
  overflow: hidden;
}
.col-table { width: 100%; }
.content-preview {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-word;
  font-size: 12px;
  color: #6b7280;
  line-height: 1.45;
}
.head-row { display: flex; justify-content: space-between; margin-bottom: 12px; }
h2 { margin: 0 0 6px; font-size: 20px; font-weight: 700; }
</style>
