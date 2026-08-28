<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Promotion, Search } from '@element-plus/icons-vue'
import { chatAIRole, getLayerStack, listAIRoles, saveLayerStack, saveRolePrompt } from '@/api/settings'
import './settings-ui.css'

const STARTERS = {
  conductor: ['执行一条用例时每一步该调谁？', '需求刚贴进来下一步做什么？', 'Plan 模式失败了该调什么能力？'],
  'req-analyst': ['入口在哪一页？新增和维持的能力分别是什么？', '文档里的运营平台要怎么测？', '上传失败有没有兜底？'],
  'mindmap-writer': ['按入口和端铺一张测试脑图', '传图定制和创意定制怎么拆开？'],
  'case-writer': ['从我的进定制模版再写步骤', '图片上传失败怎么写成用例？'],
  'req-qa-bm': ['这条需求怎么验收？', '用例覆盖够不够？', '失败了该退回还是带风险验收？'],
  'version-qa-bm': ['这一版能不能发？', '回归范围怎么圈？', '哪些需求还不该纳入？'],
  'test-engineer': ['登录失败了下一步怎么查？', '按「我要发造物秀」筛一个测试账号', '没有截图时你怎么工作？'],
  'report-writer': ['根据这些结果写一份测试报告', '没有上一版本时发版报告怎么写？', '相对 1.0.0 新增和修改分别写什么？'],
  'doc-keeper': ['飞书 Wiki 我们能建哪些东西？', '测试完成后状态怎么回写？', '没有飞书插件时你输出什么？'],
  'im-qa-assistant': ['登录失败了，下令下一步怎么查', '这条需求接下来调谁、做什么', '下发一轮冒烟还缺什么'],
  'im-defect-assistant': ['提缺陷：登录页点登录没反应', '缺步骤时你会问什么？', '这是闲聊你会怎么拒绝？'],
}

const DEFAULT_STARTERS = ['用一句话介绍你自己。', '你的输入和输出是什么？', '按原协议给一个最小示例。']

const route = useRoute()
const router = useRouter()
const loading = ref(false)
const sending = ref(false)
const DEFAULT_SKILL_CATEGORIES = [
  { id: 'flow', label: '流程产出', desc: '读需求、写脑图和用例、出验收或发版草稿' },
  { id: 'device', label: '设备操作', desc: '真机上规划、点按、定位和断言' },
  { id: 'channel', label: '通道对话', desc: 'IM 里回答、下令、提缺陷，或问人' },
  { id: 'sync', label: '外部同步', desc: '写到 Wiki 等外部系统' },
  { id: 'prompt', label: '提示词辅件', desc: 'user 模板、厂商补丁、遗留与观察叠加' },
]

const SKILL_CATEGORY_FALLBACK = {
  'im.dialogue': 'channel',
  'im.defect': 'channel',
  'hitl-composer': 'channel',
  'goal-extract': 'device',
  'inspect-session': 'device',
  'agent-decide': 'device',
  'assert-vision': 'device',
  'plan-overview': 'device',
  'locate-vision': 'device',
  'single-step-replan': 'device',
  'persona-task': 'device',
  publish_wiki: 'sync',
  'legacy-im-dialogue': 'prompt',
  'explain-overlay': 'prompt',
  'volcengine-doubao-coord-append': 'prompt',
  'volcengine-doubao-json-append': 'prompt',
  'user-plan-overview': 'prompt',
  'user-single-step-replan': 'prompt',
  'user-locate-vision': 'prompt',
  'user-assert-vision': 'prompt',
  'user-hitl-composer': 'prompt',
  'user-persona-task': 'prompt',
  'user-goal-extract': 'prompt',
  'user-inspect-session': 'prompt',
  'user-agent-decide': 'prompt',
  'user-agent-restart': 'prompt',
  'user-ai-plan': 'prompt',
}

const catalog = ref({ product: [], skills: [], skill_categories: [], counts: {} })
const activeTab = ref('product')
const keyword = ref('')
const skillFilter = ref('all')
const selectedId = ref('conductor')
const explainMode = ref(true)
const draft = ref('')
const messages = ref([])
const chatEnd = ref(null)
const tokenStats = ref({ prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, turns: 0 })
const promptDraft = ref('')
const promptSaving = ref(false)
const skillSaving = ref(false)

const tabs = [
  { id: 'product', label: '角色', desc: '什么角色，绑了哪些技能' },
  { id: 'skills', label: '全部技能', desc: '按分类看技能清单' },
]

const allRoles = computed(() => catalog.value.product || [])
const allSkills = computed(() => catalog.value.skills || [])
const skillCategories = computed(() => (
  catalog.value.skill_categories?.length ? catalog.value.skill_categories : DEFAULT_SKILL_CATEGORIES
))

const skillCategoryOf = (row) => (
  row?.category || SKILL_CATEGORY_FALLBACK[row?.id] || (row?.intent === 'talk' ? 'channel' : row?.intent === 'act' ? 'device' : 'flow')
)

const matchSkill = (row, q) => {
  if (!q) return true
  const roles = (row.role_ids || []).map((id) => roleById(id)?.label || id)
  return [row.label, row.summary, row.category_label, skillCategoryOf(row), ...roles].join(' ').toLowerCase().includes(q)
}

const currentList = computed(() => {
  const q = keyword.value.trim().toLowerCase()
  if (!q) return allRoles.value
  return allRoles.value.filter((row) =>
    [row.label, row.summary, ...(row.used_in || []), ...(row.skill_ids || [])].join(' ').toLowerCase().includes(q),
  )
})

const skillGroups = computed(() => {
  const q = keyword.value.trim().toLowerCase()
  return skillCategories.value.map((cat) => {
    const rows = allSkills.value.filter((row) => (
      skillCategoryOf(row) === cat.id && matchSkill(row, q)
    ))
    return { ...cat, rows }
  }).filter((group) => group.rows.length)
})

const visibleSkillGroups = computed(() => (
  skillFilter.value === 'all'
    ? skillGroups.value
    : skillGroups.value.filter((group) => group.id === skillFilter.value)
))

const skillRowClass = ({ row }) => (row.id === selectedId.value ? 'is-current' : '')

const categoryFilters = computed(() => {
  const q = keyword.value.trim().toLowerCase()
  const matched = allSkills.value.filter((row) => matchSkill(row, q))
  return [
    { id: 'all', label: '全部', desc: '', count: matched.length },
    ...skillCategories.value.map((cat) => ({
      ...cat,
      count: matched.filter((row) => skillCategoryOf(row) === cat.id).length,
    })),
  ]
})

const skillById = (id) => allSkills.value.find((row) => row.id === id) || null
const roleById = (id) => allRoles.value.find((row) => row.id === id) || null
const boundSkills = (row) => (row?.skill_ids || []).map(skillById).filter(Boolean)
const skillRoles = (row) => (row?.role_ids || []).map(roleById).filter(Boolean)
const skillNames = (row) => boundSkills(row).map((s) => s.label).join(' · ') || '未绑定技能'
const tokenLabel = computed(() => {
  const s = tokenStats.value
  if (!s.turns) return '本轮对话还没有 token'
  return `本轮 入 ${s.prompt_tokens} / 出 ${s.completion_tokens} · 共 ${s.total_tokens}`
})

const selected = computed(() => {
  return allRoles.value.find((row) => row.id === selectedId.value) || currentList.value[0] || null
})
const selectedSkills = computed(() => boundSkills(selected.value))
const isSkillTab = computed(() => activeTab.value === 'skills')
const roleCount = computed(() => allRoles.value.length)
const headerPill = computed(() => (
  isSkillTab.value ? `${allSkills.value.length} 项技能` : `${roleCount.value} 个角色`
))

const starters = computed(() => STARTERS[selected.value?.id] || DEFAULT_STARTERS)
const promptDirty = computed(() => {
  if (!selected.value?.editable) return false
  return promptDraft.value.trim() !== String(selected.value.system_prompt || '').trim()
})

const calledLabel = (row) => {
  const v = row?.called || (row?.live ? 'wired' : 'sandbox')
  if (v === 'wired') return '流程里会调'
  if (v === 'gated') return '执行时会调'
  if (v === 'unused') return '未接入'
  if (v === 'sandbox') return '仅对话'
  return v
}

const calledClass = (row) => {
  const v = row?.called || ''
  if (v === 'unused') return 'is-observe'
  return 'is-live'
}

const syncQuery = () => {
  const raw = String(route.query.tab || '')
  activeTab.value = raw === 'skills' || raw === 'runtime' ? 'skills' : 'product'
  const role = String(route.query.role || '').trim()
  if (role) selectedId.value = role
}

const pushQuery = () => {
  const next = { tab: activeTab.value, role: selectedId.value }
  if (route.query.tab === next.tab && route.query.role === next.role) return
  router.replace({ path: '/settings/roles', query: next })
}

const resetTokens = () => {
  tokenStats.value = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, turns: 0 }
}

const selectSkill = (row) => {
  if (!row?.id) return
  selectedId.value = row.id
  skillFilter.value = skillCategoryOf(row)
  keyword.value = ''
  activeTab.value = 'skills'
  pushQuery()
}

const setSkillFilter = (id) => {
  skillFilter.value = id
}

const addUsage = (usage) => {
  const u = usage || {}
  tokenStats.value = {
    prompt_tokens: tokenStats.value.prompt_tokens + Number(u.prompt_tokens || 0),
    completion_tokens: tokenStats.value.completion_tokens + Number(u.completion_tokens || 0),
    total_tokens: tokenStats.value.total_tokens + Number(u.total_tokens || 0),
    turns: tokenStats.value.turns + 1,
  }
}

const selectRole = (row) => {
  if (!row?.id) return
  if (selectedId.value !== row.id || activeTab.value !== 'product') {
    selectedId.value = row.id
    messages.value = []
    draft.value = ''
    resetTokens()
  }
  activeTab.value = 'product'
  pushQuery()
}

const setTab = (id) => {
  activeTab.value = id
  keyword.value = ''
  if (id === 'skills') {
    skillFilter.value = 'all'
  } else if (allRoles.value.length && !allRoles.value.some((row) => row.id === selectedId.value)) {
    selectedId.value = allRoles.value[0].id
    messages.value = []
    resetTokens()
  }
  pushQuery()
}

const scrollChat = async () => {
  await nextTick()
  chatEnd.value?.scrollIntoView({ behavior: 'smooth', block: 'end' })
}

const send = async (text) => {
  const content = String(text || draft.value || '').trim()
  const role = selected.value
  if (!content || !role || sending.value) return
  draft.value = ''
  messages.value = [...messages.value, { role: 'user', content }]
  sending.value = true
  await scrollChat()
  try {
    const res = await chatAIRole({
      role_id: role.id,
      messages: messages.value.map((item) => ({ role: item.role, content: item.content })),
      explain_mode: explainMode.value,
    })
    const reply = res?.data?.reply || ''
    if (!reply) throw new Error(res?.msg || '模型没有返回内容')
    addUsage(res?.data?.usage)
    messages.value = [...messages.value, { role: 'assistant', content: reply }]
    await scrollChat()
  } catch (e) {
    const detail = e?.response?.data?.detail || e?.message || '对话失败'
    ElMessage.error(detail)
    messages.value = messages.value.slice(0, -1)
    draft.value = content
  } finally {
    sending.value = false
  }
}

const mergeStack = (rolesData, stack) => {
  const next = {
    ...(rolesData || {}),
    product: [...(rolesData?.product || [])],
    skills: [...(rolesData?.skills || [])],
    skill_categories: rolesData?.skill_categories || [],
  }
  const stackSkills = stack?.skills || []
  if (stackSkills.length) {
    const extra = Object.fromEntries((next.skills || []).map((row) => [row.id, row]))
    next.skills = stackSkills.map((row) => ({
      ...row,
      system_prompt: extra[row.id]?.system_prompt || row.system_prompt || '',
      prompt_role_id: extra[row.id]?.prompt_role_id || row.owner,
    }))
  }
  if (stack?.skill_categories?.length) next.skill_categories = stack.skill_categories
  const byRole = Object.fromEntries((stack?.roles || []).map((row) => [row.id, row.skill_ids || []]))
  next.product = next.product.map((row) => ({
    ...row,
    skill_ids: byRole[row.id] || row.skill_ids || [],
  }))
  return next
}

const load = async () => {
  loading.value = true
  try {
    const [rolesRes, stackRes] = await Promise.all([
      listAIRoles(),
      getLayerStack().catch(() => null),
    ])
    catalog.value = mergeStack(rolesRes?.data || { product: [], skills: [], skill_categories: [], counts: {} }, stackRes?.data)
    if (!isSkillTab.value && selectedId.value && !allRoles.value.some((row) => row.id === selectedId.value)) {
      selectedId.value = allRoles.value[0]?.id || ''
    }
    promptDraft.value = selected.value?.system_prompt || ''
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || '加载角色目录失败')
  } finally {
    loading.value = false
  }
}

const persistSkills = async (roleId, skillIds) => {
  if (!roleId || skillSaving.value) return
  skillSaving.value = true
  try {
    const role_skills = Object.fromEntries(
      allRoles.value.map((row) => [row.id, row.id === roleId ? skillIds : [...(row.skill_ids || [])]]),
    )
    await saveLayerStack({ role_skills })
    ElMessage.success('技能绑定已保存')
    await load()
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || e?.message || '保存技能失败')
  } finally {
    skillSaving.value = false
  }
}

const savePrompt = async () => {
  const role = selected.value
  if (!role?.editable || promptSaving.value) return
  const text = promptDraft.value.trim()
  if (!text) return ElMessage.warning('prompt 不能为空')
  promptSaving.value = true
  try {
    await saveRolePrompt(role.id, { system_prompt: text })
    ElMessage.success('prompt 已保存')
    await load()
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || e?.message || '保存失败')
  } finally {
    promptSaving.value = false
  }
}

const resetPrompt = async () => {
  const role = selected.value
  if (!role?.editable || promptSaving.value) return
  promptSaving.value = true
  try {
    await saveRolePrompt(role.id, { reset: true })
    ElMessage.success('已恢复默认 prompt')
    await load()
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || e?.message || '恢复失败')
  } finally {
    promptSaving.value = false
  }
}

watch(() => selected.value?.id, (id) => {
  if (!id) return
  promptDraft.value = selected.value?.system_prompt || ''
})

watch(() => route.query.tab, syncQuery)
watch(() => route.query.role, syncQuery)

onMounted(async () => {
  syncQuery()
  await load()
  pushQuery()
})
</script>

<template>
  <div class="settings-panel roles-page wide-panel" v-loading="loading">
    <header class="settings-page-header">
      <div>
        <h2 class="settings-page-title">角色</h2>
        <p class="settings-page-desc">角色是测试流转里的自动工人。每个角色绑定一组技能。</p>
      </div>
      <div class="settings-summary-pill">{{ headerPill }}</div>
    </header>

    <div class="settings-tabbar is-compact">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        type="button"
        class="settings-tab"
        :class="{ active: activeTab === tab.id }"
        @click="setTab(tab.id)"
      >
        <strong>{{ tab.label }}</strong>
        <span>{{ tab.desc }}</span>
      </button>
    </div>

    <section class="settings-info-card">
      <div class="settings-kicker">怎么用</div>
      <p v-if="isSkillTab">按分类看技能。点角色名回到「角色」页改绑定。</p>
      <p v-else>分析师理解任务后，调用某个角色上绑定的技能。改绑定后立刻保存。</p>
    </section>

    <div v-if="isSkillTab" class="skills-board">
      <div class="settings-toolbar">
        <el-input
          v-model="keyword"
          class="skill-search"
          clearable
          :prefix-icon="Search"
          placeholder="搜索技能、角色"
        />
        <button
          v-for="cat in categoryFilters"
          :key="cat.id"
          type="button"
          class="cat-filter"
          :class="{ active: skillFilter === cat.id }"
          @click="setSkillFilter(cat.id)"
        >
          {{ cat.label }} {{ cat.count }}
        </button>
      </div>

      <section v-if="!visibleSkillGroups.length" class="settings-info-card">
        <div class="settings-kicker">没有匹配的技能</div>
        <p>换个分类，或清空搜索。</p>
      </section>

      <section
        v-for="group in visibleSkillGroups"
        :key="group.id"
        class="settings-table-card"
      >
        <div class="skill-group-head">
          <div>
            <div class="settings-kicker">{{ group.label }}</div>
            <p>{{ group.desc }}</p>
          </div>
          <div class="settings-summary-pill">{{ group.rows.length }}</div>
        </div>
        <el-table
          :data="group.rows"
          size="small"
          border
          stripe
          highlight-current-row
          :row-class-name="skillRowClass"
        >
          <el-table-column label="技能" min-width="140">
            <template #default="{ row }">
              <strong>{{ row.label }}</strong>
            </template>
          </el-table-column>
          <el-table-column label="说明" min-width="220" show-overflow-tooltip>
            <template #default="{ row }">{{ row.summary || '—' }}</template>
          </el-table-column>
          <el-table-column label="绑定角色" min-width="200">
            <template #default="{ row }">
              <div class="skill-roles">
                <button
                  v-for="role in skillRoles(row)"
                  :key="role.id"
                  type="button"
                  class="cap-chip"
                  @click="selectRole(role)"
                >
                  {{ role.label }}
                </button>
                <span v-if="!skillRoles(row).length" class="empty-hint">未绑定</span>
              </div>
            </template>
          </el-table-column>
        </el-table>
      </section>
    </div>

    <div v-else class="roles-split">
      <aside class="settings-card roles-list">
        <el-input
          v-model="keyword"
          clearable
          :prefix-icon="Search"
          placeholder="搜索角色、技能"
        />
        <button
          v-for="row in currentList"
          :key="row.id"
          type="button"
          class="role-item"
          :class="{ active: selected?.id === row.id }"
          @click="selectRole(row)"
        >
          <div class="role-item-head">
            <strong>{{ row.label }}</strong>
            <span class="role-tag" :class="row.editable ? 'is-edit' : calledClass(row)">
              {{ (row.skill_ids || []).length }} 项技能
            </span>
          </div>
          <p>{{ skillNames(row) }}</p>
        </button>
        <p v-if="!currentList.length" class="empty-hint">没有匹配的角色</p>
      </aside>

      <section class="roles-detail" v-if="selected">
        <section class="settings-card role-meta">
          <div class="role-meta-head">
            <div>
              <div class="settings-kicker">{{ selected.group === 'abstract' ? '分析师' : '角色' }}</div>
              <h3>{{ selected.label }}</h3>
              <p>{{ selected.summary }}</p>
            </div>
            <span class="role-tag" :class="calledClass(selected)">
              {{ calledLabel(selected) }}
            </span>
          </div>
          <dl class="role-facts">
            <div>
              <dt>何时调用</dt>
              <dd>{{ (selected.triggers || []).join('；') || '设置页对话' }}</dd>
            </div>
            <div>
              <dt>绑定技能</dt>
              <dd>{{ selectedSkills.length ? selectedSkills.map((s) => s.label).join(' · ') : '未绑定' }}</dd>
            </div>
            <div>
              <dt>用途</dt>
              <dd>{{ (selected.used_in || []).join(' · ') || '—' }}</dd>
            </div>
          </dl>
          <div class="related">
            <span>绑定的技能</span>
            <button
              v-for="skill in selectedSkills"
              :key="skill.id"
              type="button"
              class="cap-chip"
              @click="selectSkill(skill)"
            >
              {{ skill.label }}
            </button>
            <span v-if="!selectedSkills.length" class="empty-hint">分析师只调度，或还没绑技能。</span>
            <el-select
              class="skill-picker"
              :model-value="selected.skill_ids || []"
              multiple
              collapse-tags
              collapse-tags-tooltip
              filterable
              :disabled="skillSaving"
              placeholder="添加或移除技能"
              @change="(ids) => persistSkills(selected.id, ids)"
            >
              <el-option v-for="skill in allSkills" :key="skill.id" :label="skill.label" :value="skill.id" />
            </el-select>
          </div>
          <div v-if="selected.editable" class="prompt-edit">
            <div class="prompt-edit-head">
              <div class="settings-kicker">{{ selected.prompt_custom ? '已改过的 prompt' : 'System prompt' }}</div>
              <p>改完保存后，这个角色的对话会用这份。</p>
            </div>
            <el-input
              v-model="promptDraft"
              type="textarea"
              :rows="12"
              placeholder="这个角色的 system prompt"
            />
            <div class="prompt-edit-actions">
              <button
                type="button"
                class="settings-action-pill"
                :disabled="promptSaving || !promptDirty"
                @click="savePrompt"
              >
                {{ promptSaving ? '保存中' : '保存 prompt' }}
                <span class="settings-action-arrow">→</span>
              </button>
              <button
                type="button"
                class="settings-action-pill"
                :disabled="promptSaving || !selected.prompt_custom"
                @click="resetPrompt"
              >
                恢复默认
                <span class="settings-action-arrow">→</span>
              </button>
            </div>
          </div>
          <details v-else-if="selected.system_prompt" class="prompt-box">
            <summary>查看 system prompt</summary>
            <pre>{{ selected.system_prompt }}</pre>
          </details>
        </section>

        <section class="settings-card chat-card">
          <div class="chat-toolbar">
            <div>
              <div class="settings-kicker">和这个角色对话</div>
              <p>{{ tokenLabel }}</p>
            </div>
            <label class="mode-toggle">
              <input v-model="explainMode" type="checkbox" />
              讲解模式
            </label>
          </div>

          <div class="chat-log">
            <div v-if="!messages.length" class="chat-empty">
              <p>还没有对话。选一句开场，或自己输入。</p>
              <div class="starter-row">
                <button
                  v-for="item in starters"
                  :key="item"
                  type="button"
                  class="settings-action-pill"
                  @click="send(item)"
                >
                  {{ item }}
                </button>
              </div>
            </div>
            <div v-for="(item, idx) in messages" :key="idx" class="bubble" :class="item.role">
              <span>{{ item.role === 'user' ? '你' : selected.label }}</span>
              <pre>{{ item.content }}</pre>
            </div>
            <div v-if="sending" class="bubble assistant pending">
              <span>{{ selected.label }}</span>
              <p>正在回复…</p>
            </div>
            <div ref="chatEnd" />
          </div>

          <div class="chat-composer">
            <el-input
              v-model="draft"
              type="textarea"
              :rows="2"
              resize="none"
              placeholder="用这个角色的身份提问…"
              @keydown.enter.exact.prevent="send()"
            />
            <button
              type="button"
              class="settings-action-pill send-pill"
              :disabled="sending || !draft.trim()"
              @click="send()"
            >
              发送
              <span class="settings-action-arrow">
                <el-icon><Promotion /></el-icon>
              </span>
            </button>
          </div>
        </section>
      </section>
    </div>
  </div>
</template>

<style scoped>
.roles-page {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.roles-page .settings-info-card p {
  margin: 8px 0 0;
  color: var(--settings-text);
  font-size: 13px;
  line-height: 1.65;
}

.roles-split {
  display: grid;
  grid-template-columns: minmax(220px, 300px) minmax(0, 1fr);
  gap: 16px;
  align-items: stretch;
  min-height: min(62vh, 640px);
}

.skills-board {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

.skill-search {
  width: 220px;
}

.cat-filter {
  min-height: 28px;
  padding: 0 12px;
  border: 1px solid var(--settings-border);
  border-radius: 999px;
  background: #fff;
  color: var(--settings-muted);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.cat-filter.active {
  border-color: color-mix(in srgb, var(--settings-primary) 45%, white);
  background: var(--settings-primary-soft);
  color: #4338ca;
}

.skill-group-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.skill-group-head p {
  margin: 6px 0 0;
  color: var(--settings-muted);
  font-size: 12px;
  line-height: 1.5;
}

.skill-roles {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

.skills-board :deep(.el-table .is-current > td) {
  background: var(--settings-primary-soft);
}

.playbook-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 460px), 1fr));
  gap: 16px;
  align-items: start;
}

.playbook-list h3 {
  margin: 4px 0 6px;
  font-size: 16px;
}

.playbook-list > .settings-card > p {
  margin: 0 0 12px;
  color: var(--settings-muted);
  font-size: 13px;
}

.play-steps {
  margin: 0;
  padding: 0;
  list-style: none;
}

.play-steps li {
  display: grid;
  grid-template-columns: 22px minmax(0, 1fr);
  gap: 4px 10px;
  margin: 0;
  padding: 8px 0;
  border-top: 1px solid var(--settings-border);
  font-size: 13px;
}

.play-steps li:first-child {
  border-top: 0;
  padding-top: 0;
}

.play-n {
  color: var(--settings-primary);
  font-size: 12px;
  font-weight: 800;
}

.play-copy {
  min-width: 0;
}

.play-steps small {
  grid-column: 2;
  color: var(--settings-muted);
  margin-top: 0;
  overflow-wrap: anywhere;
}

.roles-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px;
  max-height: min(70vh, 760px);
  overflow: auto;
}

.skill-picker {
  flex: 1 1 220px;
  min-width: 200px;
}

.roles-list :deep(.el-input) {
  margin-bottom: 4px;
}

.role-item {
  display: block;
  width: 100%;
  padding: 12px 12px 10px;
  border: 1px solid var(--settings-border);
  border-radius: 12px;
  background: var(--settings-soft);
  text-align: left;
  cursor: pointer;
}

.role-item p {
  margin: 6px 0 0;
  color: var(--settings-muted);
  font-size: 12px;
  line-height: 1.5;
}

.role-item.active {
  border-color: color-mix(in srgb, var(--settings-primary) 45%, white);
  background: var(--settings-primary-soft);
}

.role-item-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.role-item-head strong {
  font-size: 13px;
  font-weight: 750;
  color: var(--settings-text);
  overflow-wrap: anywhere;
}

.role-tag {
  flex-shrink: 0;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
}

.role-tag.is-live {
  background: #ecfdf5;
  color: #047857;
}

.role-tag.is-observe {
  background: #eef2ff;
  color: #4338ca;
}

.role-tag.is-edit {
  background: #fff7ed;
  color: #c2410c;
}

.prompt-edit {
  margin-top: 14px;
}

.prompt-edit-head p {
  margin: 6px 0 10px;
  color: var(--settings-muted);
  font-size: 12px;
  line-height: 1.55;
}

.prompt-edit :deep(.el-textarea__inner) {
  border-radius: 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  line-height: 1.55;
}

.prompt-edit-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

.prompt-edit-actions .settings-action-pill:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

.empty-hint {
  margin: 8px 4px;
  color: var(--settings-muted);
  font-size: 12px;
}

.roles-detail {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
  min-height: 0;
}

.role-meta h3 {
  margin: 4px 0 6px;
  font-size: 18px;
  font-weight: 800;
}

.role-meta p {
  margin: 0;
  color: var(--settings-muted);
  font-size: 13px;
  line-height: 1.6;
}

.role-meta-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}

.role-facts {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin: 16px 0 0;
}

.role-facts dt {
  color: var(--settings-muted);
  font-size: 11px;
  font-weight: 700;
}

.role-facts dd {
  margin: 4px 0 0;
  color: var(--settings-text);
  font-size: 12px;
  line-height: 1.5;
  word-break: break-all;
}

.related {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-top: 14px;
}

.related > span {
  flex: 0 0 100%;
  color: var(--settings-muted);
  font-size: 12px;
  font-weight: 700;
}

.cap-chip {
  max-width: 100%;
  padding: 4px 10px;
  border: 1px solid color-mix(in srgb, var(--settings-primary) 22%, white);
  border-radius: 999px;
  background: var(--settings-primary-soft);
  color: #4338ca;
  font-size: 12px;
  font-weight: 650;
  line-height: 1.4;
  text-align: left;
  cursor: pointer;
}

.prompt-box {
  margin-top: 14px;
  padding: 10px 12px;
  border: 1px solid var(--settings-border);
  border-radius: 12px;
  background: #fbfdff;
}

.prompt-box summary {
  cursor: pointer;
  color: var(--settings-primary);
  font-size: 12px;
  font-weight: 750;
}

.prompt-box pre {
  margin: 10px 0 0;
  max-height: 280px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
  color: #1f2937;
  font-size: 12px;
  line-height: 1.55;
}

.chat-card {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 280px;
}

.chat-toolbar {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
  margin-bottom: 12px;
}

.chat-toolbar p {
  margin: 4px 0 0;
  color: var(--settings-muted);
  font-size: 12px;
}

.mode-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--settings-muted);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  user-select: none;
}

.mode-toggle input {
  accent-color: var(--settings-primary);
}

.chat-log {
  flex: 1;
  min-height: 180px;
  overflow: auto;
  padding: 12px;
  border: 1px solid var(--settings-border);
  border-radius: 12px;
  background: #f8fafc;
}

.chat-empty p {
  margin: 0 0 10px;
  color: var(--settings-muted);
  font-size: 13px;
}

.starter-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.bubble {
  margin-bottom: 12px;
}

.bubble span {
  display: block;
  margin-bottom: 4px;
  color: var(--settings-muted);
  font-size: 11px;
  font-weight: 700;
}

.bubble pre,
.bubble p {
  margin: 0;
  padding: 10px 12px;
  border-radius: 12px;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 13px;
  line-height: 1.6;
  font-family: inherit;
}

.bubble.user pre {
  background: #eef2ff;
  color: #312e81;
}

.bubble.assistant pre,
.bubble.assistant p {
  background: #fff;
  border: 1px solid var(--settings-border);
  color: var(--settings-text);
}

.bubble.pending p {
  color: var(--settings-muted);
}

.chat-composer {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  margin-top: 12px;
}

.chat-composer :deep(.el-textarea) {
  min-width: 0;
  flex: 1;
}

.chat-composer :deep(.el-textarea__inner) {
  border-radius: 12px;
}

.send-pill {
  flex-shrink: 0;
  min-height: 36px;
}

.send-pill:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

@media (min-width: 720px) {
  .play-steps li {
    grid-template-columns: 22px minmax(0, 1fr) auto;
    align-items: baseline;
  }

  .play-steps small {
    grid-column: auto;
    justify-self: end;
  }
}

@media (max-width: 960px) {
  .roles-split {
    grid-template-columns: 1fr;
    min-height: 0;
  }

  .roles-list {
    max-height: 280px;
  }

  .role-facts {
    grid-template-columns: 1fr;
  }
}
</style>
