<script setup>
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { getLayerStack, saveLayerStack } from '@/api/settings'
import './settings-ui.css'

const loading = ref(false)
const saving = ref(false)
const stack = ref({ drivers: [], skills: [], roles: [], triggers: [] })

const findBy = (layer, id) => (stack.value[layer] || []).find((row) => row.id === id) || null
const roleLabel = (id) => findBy('roles', id)?.label || '未指定角色'
const skillLabel = (id) => findBy('skills', id)?.label || '未指定技能'
const driverLabel = (id) => findBy('drivers', id)?.label || id

const allSkills = computed(() => stack.value.skills || [])

const apply = (data) => {
  if (data) stack.value = data
}

const load = async () => {
  loading.value = true
  try {
    const res = await getLayerStack()
    apply(res?.data)
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || e?.message || '加载编排失败')
  } finally {
    loading.value = false
  }
}

const persist = async (patch) => {
  if (saving.value) return
  saving.value = true
  try {
    const res = await saveLayerStack(patch)
    apply(res?.data)
    ElMessage.success('已保存，下次 IM 进线按这条走')
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || e?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

const roleSkillsMap = () => Object.fromEntries((stack.value.roles || []).map((row) => [row.id, [...(row.skill_ids || [])]]))
const skillDriversMap = () => Object.fromEntries((stack.value.skills || []).map((row) => [row.id, [...(row.driver_ids || [])]]))
const triggerRolesMap = () => Object.fromEntries((stack.value.triggers || []).map((row) => [row.id, { ...(row.roles || {}) }]))
const triggerSkillsMap = () => Object.fromEntries((stack.value.triggers || []).map((row) => [row.id, { ...(row.skills || {}) }]))

const setPathRole = (trigger, path, roleId) => {
  const trigger_roles = triggerRolesMap()
  trigger_roles[trigger.id] = { ...(trigger_roles[trigger.id] || {}), [path.intent]: roleId }
  const role_skills = roleSkillsMap()
  const owned = role_skills[roleId] || []
  let skillId = path.skill_id
  if (!owned.includes(skillId)) {
    skillId = owned[0] || skillId
    if (skillId && !owned.includes(skillId)) {
      role_skills[roleId] = [...owned, skillId]
    }
  }
  const trigger_skills = triggerSkillsMap()
  trigger_skills[trigger.id] = { ...(trigger_skills[trigger.id] || {}), [path.intent]: skillId }
  persist({ trigger_roles, trigger_skills, role_skills })
}

const setPathSkill = (trigger, path, skillId) => {
  const trigger_skills = triggerSkillsMap()
  trigger_skills[trigger.id] = { ...(trigger_skills[trigger.id] || {}), [path.intent]: skillId }
  const role_skills = roleSkillsMap()
  const roleId = path.role_id
  if (roleId && skillId && !(role_skills[roleId] || []).includes(skillId)) {
    role_skills[roleId] = [...(role_skills[roleId] || []), skillId]
  }
  persist({ trigger_skills, role_skills })
}

const togglePathDriver = (skillId, driverId) => {
  if (!skillId) return
  const skill_drivers = skillDriversMap()
  const cur = new Set(skill_drivers[skillId] || [])
  if (cur.has(driverId)) cur.delete(driverId)
  else cur.add(driverId)
  skill_drivers[skillId] = [...cur]
  persist({ skill_drivers })
}

const reset = async () => {
  if (saving.value) return
  saving.value = true
  try {
    const res = await saveLayerStack({ reset: true })
    apply(res?.data)
    ElMessage.success('已恢复默认')
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || e?.message || '恢复失败')
  } finally {
    saving.value = false
  }
}

const impactText = (path) => {
  const role = roleLabel(path.role_id)
  const skill = skillLabel(path.skill_id)
  const hands = (path.driver_ids || []).map(driverLabel)
  if (!path.role_id) return '还没指定谁来处理。'
  if (!path.skill_id) return `交给「${role}」，但还没指定做什么。`
  if (!hands.length) return `交给「${role}」做「${skill}」，只回文本或落库，不调外部系统。`
  return `交给「${role}」做「${skill}」，用手：${hands.join('、')}。`
}

const pathSentence = (path) => {
  const hands = (path.driver_ids || []).map(driverLabel)
  return [
    roleLabel(path.role_id),
    skillLabel(path.skill_id),
    hands.length ? hands.join('、') : '不调驱动',
  ].join(' → ')
}

onMounted(load)
</script>

<template>
  <div class="stack-paths" v-loading="loading">
    <article
      v-for="trigger in stack.triggers"
      :key="trigger.id"
      class="settings-card stack-entry"
    >
      <div class="stack-entry-head">
        <div>
          <div class="settings-kicker">入口</div>
          <h3>{{ trigger.label }}</h3>
          <p>{{ trigger.summary }}</p>
        </div>
        <span class="settings-summary-pill" :class="trigger.live ? '' : 'is-muted'">
          {{ trigger.live ? '已接通' : '还没接通' }}
        </span>
      </div>
      <p class="stack-effect">{{ trigger.effect }}</p>

      <div v-for="path in trigger.paths" :key="`${trigger.id}-${path.intent}`" class="stack-path">
        <div class="settings-kicker">{{ path.intent_label }}</div>

        <template v-if="trigger.live">
          <el-form label-position="top" class="settings-form-stack">
            <el-form-item label="交给谁">
              <el-select
                :model-value="path.role_id"
                placeholder="选择角色"
                style="width: 100%"
                :disabled="saving"
                @change="setPathRole(trigger, path, $event)"
              >
                <el-option
                  v-for="row in stack.roles"
                  :key="row.id"
                  :label="row.label"
                  :value="row.id"
                />
              </el-select>
            </el-form-item>
            <el-form-item label="去做哪件事">
              <el-select
                :model-value="path.skill_id"
                placeholder="选择技能"
                style="width: 100%"
                :disabled="saving || !path.role_id"
                @change="setPathSkill(trigger, path, $event)"
              >
                <el-option
                  v-for="row in allSkills"
                  :key="row.id"
                  :label="row.label"
                  :value="row.id"
                />
              </el-select>
            </el-form-item>
            <el-form-item label="用哪只手">
              <div class="stack-hands">
                <label v-for="row in stack.drivers" :key="row.id" class="stack-hand">
                  <el-checkbox
                    :model-value="(path.driver_ids || []).includes(row.id)"
                    :disabled="saving || !path.skill_id"
                    @change="togglePathDriver(path.skill_id, row.id)"
                  />
                  <span>{{ row.label }}</span>
                  <small>{{ row.ready ? row.hint : (row.hint || '未连接') }}</small>
                </label>
              </div>
            </el-form-item>
          </el-form>
          <p>{{ impactText(path) }}</p>
        </template>

        <p v-else>{{ pathSentence(path) }}</p>
      </div>
    </article>

    <button type="button" class="settings-action-pill" :disabled="saving" @click="reset">
      恢复默认
      <span class="settings-action-arrow">→</span>
    </button>
  </div>
</template>
