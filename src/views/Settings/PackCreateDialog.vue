<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { createPack, listPackRoots } from '@/api/packs'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  kind: { type: String, default: 'recovery' },
  appId: { type: String, default: '' },
})
const emit = defineEmits(['update:modelValue', 'created'])

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const roots = ref([])
const form = ref({ root: 'team', pack_id: 'adhoc', id: '', owner: '', app_id: '' })
const saving = ref(false)

const writableRoots = computed(() => roots.value.filter((r) => r.writable))
const currentRoot = computed(() => roots.value.find((r) => r.root === form.value.root))

const load = async () => {
  try {
    const res = await listPackRoots({ app_id: props.appId || undefined })
    roots.value = res?.data?.roots || []
  } catch (e) {
    ElMessage.error('读取根列表失败')
  }
}

const submit = async () => {
  if (!form.value.id.trim()) {
    ElMessage.warning('先填条目 id')
    return
  }
  if (form.value.root === 'app' && !(form.value.app_id || props.appId)) {
    ElMessage.warning('应用私有根需要 app_id')
    return
  }
  saving.value = true
  try {
    const res = await createPack({
      kind: props.kind,
      root: form.value.root,
      app_id: form.value.app_id || props.appId || '',
      pack_id: form.value.pack_id.trim() || 'adhoc',
      id: form.value.id.trim(),
      owner: form.value.owner.trim(),
    })
    ElMessage.success('已创建，默认 draft —— 试跑验证后再启用')
    emit('created', res?.data?.item || null)
    visible.value = false
  } catch (e) {
    ElMessage.error(String(e?.response?.data?.detail || '创建失败').slice(0, 160))
  } finally {
    saving.value = false
  }
}

watch(() => props.modelValue, (open) => {
  if (open) {
    form.value = { root: 'team', pack_id: 'adhoc', id: '', owner: '', app_id: props.appId || '' }
    load()
  }
})

onMounted(load)
</script>

<template>
  <el-dialog v-model="visible" title="新建条目" width="560px">
    <el-form label-width="88px" class="pc-form">
      <el-form-item label="落在哪个根">
        <el-select v-model="form.root" class="pc-full">
          <el-option
            v-for="r in writableRoots" :key="r.root" :value="r.root"
            :label="`${r.label}（优先级 ${r.rank + 1}，现有 ${r.count} 条）`"
          />
        </el-select>
        <p v-if="currentRoot" class="pc-hint">{{ currentRoot.desc }}</p>
        <p class="pc-hint">优先级：应用私有 &gt; 团队共享 &gt; 仓库内置 &gt; 自动学习。同 id 高者胜。</p>
      </el-form-item>
      <el-form-item v-if="form.root === 'app'" label="应用 ID">
        <el-input v-model="form.app_id" placeholder="app_id" />
      </el-form-item>
      <el-form-item label="包名">
        <el-input v-model="form.pack_id" placeholder="adhoc（不存在会自动建 pack.yaml）" />
      </el-form-item>
      <el-form-item label="条目 id">
        <el-input v-model="form.id" placeholder="如 miui_usb_debug_dialog（同 kind 内唯一）" />
      </el-form-item>
      <el-form-item label="负责人">
        <el-input v-model="form.owner" placeholder="@你的名字（体检会检查这项）" />
      </el-form-item>
    </el-form>
    <el-alert type="info" :closable="false" show-icon
      title="会生成一份带注释的骨架，默认 lifecycle: draft"
      description="创建后在详情里编辑 YAML、用「试跑」在真机上验证，确认没问题再点「启用」。" />
    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="saving" @click="submit">创建</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.pc-form { margin-bottom: 8px; }
.pc-full { width: 100%; }
.pc-hint { margin: 4px 0 0; font-size: 12px; color: var(--el-text-color-secondary); line-height: 1.5; }
</style>
