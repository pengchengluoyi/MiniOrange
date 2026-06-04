<template>
  <el-dialog
      :model-value="modelValue"
      width="480px"
      class="mo-glass-dialog"
      align-center
      destroy-on-close
      @close="$emit('update:modelValue', false)"
  >
    <template #header>
      <div class="mo-dialog-head">
        <div class="mo-dialog-badge prj">PRJ</div>
        <div>
          <h2 class="mo-dialog-title">新建项目集群</h2>
          <p class="mo-dialog-sub">业务线 / 产品族分组</p>
        </div>
      </div>
    </template>

    <div class="create-project-body">
      <label class="field-block">
        <span class="field-label">项目名称</span>
        <input v-model="localName" class="mo-glass-input" placeholder="例如：电商业务线" />
      </label>
      <label class="field-block">
        <span class="field-label">描述</span>
        <textarea
            v-model="localDesc"
            class="mo-glass-input mo-glass-textarea"
            placeholder="可选"
            rows="3"
        />
      </label>
    </div>

    <template #footer>
      <div class="mo-dialog-footer">
        <el-button round class="mo-btn-ghost" @click="$emit('update:modelValue', false)">取消</el-button>
        <el-button
            round
            type="primary"
            class="mo-btn-primary"
            :loading="submitting"
            :disabled="!localName.trim()"
            @click="handleSubmit"
        >
          创建
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, watch } from 'vue'
import { ElButton, ElDialog } from 'element-plus'

const props = defineProps({
  modelValue: Boolean,
  submitting: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue', 'submit'])

const localName = ref('')
const localDesc = ref('')

watch(
    () => props.modelValue,
    (open) => {
      if (open) {
        localName.value = ''
        localDesc.value = ''
      }
    }
)

const handleSubmit = () => {
  if (!localName.value.trim()) return
  emit('submit', {
    name: localName.value.trim(),
    description: localDesc.value.trim(),
  })
}
</script>

<style scoped>
.create-project-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.field-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.field-label {
  font-size: 13px;
  font-weight: 650;
  color: #374151;
}

.mo-glass-input {
  width: 100%;
  box-sizing: border-box;
  padding: 0 14px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.65);
  background: rgba(255, 255, 255, 0.55);
  font-size: 14px;
  color: #111827;
  outline: none;
}

.mo-glass-input:not(.mo-glass-textarea) {
  height: 44px;
}

.mo-glass-textarea {
  padding: 10px 14px;
  resize: vertical;
  min-height: 80px;
  font-family: inherit;
  line-height: 1.5;
}

.mo-glass-input:focus {
  border-color: rgba(255, 77, 0, 0.45);
  box-shadow: 0 0 0 3px rgba(255, 77, 0, 0.12);
}

.mo-dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

</style>

<style src="../styles/mo-glass-dialog.css"></style>
