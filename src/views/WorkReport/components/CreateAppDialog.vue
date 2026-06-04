<template>
  <el-dialog
      :model-value="modelValue"
      width="520px"
      class="mo-glass-dialog create-app-dialog"
      align-center
      destroy-on-close
      :show-close="true"
      @close="$emit('update:modelValue', false)"
  >
    <template #header>
      <div class="mo-dialog-head">
        <div class="mo-dialog-badge">APP</div>
        <div>
          <h2 class="mo-dialog-title">新建应用</h2>
          <p class="mo-dialog-sub">所属项目 · {{ projectName || '—' }}</p>
        </div>
      </div>
    </template>

    <div class="create-app-body">
      <label class="field-block">
        <span class="field-label">应用名称</span>
        <input
            v-model="localName"
            class="mo-glass-input"
            placeholder="例如：买家端 App"
            maxlength="64"
        />
      </label>

      <div class="field-block" role="radiogroup" aria-label="覆盖端">
        <span class="field-label">覆盖端</span>
        <span class="field-hint">单选。双端 App 请选「移动端」，即同时支持 Android 与 iOS。</span>

        <div class="platform-grid">
          <button
              v-for="opt in platformOptions"
              :key="opt.value"
              type="button"
              role="radio"
              class="platform-tile"
              :class="{ selected: selectedPlatform === opt.value, featured: opt.featured }"
              :aria-checked="selectedPlatform === opt.value"
              @click="selectPlatform(opt.value)"
          >
            <span class="tile-radio" aria-hidden="true" />
            <span class="tile-icon">{{ opt.icon }}</span>
            <span class="tile-text">
              <span class="tile-label">{{ opt.label }}</span>
              <span class="tile-desc">{{ opt.desc }}</span>
            </span>
          </button>
        </div>

        <button type="button" class="more-link" @click="showAdvanced = !showAdvanced">
          <span>{{ showAdvanced ? '收起单端选项' : '仅需 Android 或 iOS？' }}</span>
          <svg
              class="more-chevron"
              :class="{ open: showAdvanced }"
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
          >
            <path d="M6 9l6 6 6-6"/>
          </svg>
        </button>

        <div v-show="showAdvanced" class="advanced-row" role="presentation">
          <button
              v-for="opt in advancedOptions"
              :key="opt.value"
              type="button"
              role="radio"
              class="advanced-chip"
              :class="{ selected: selectedPlatform === opt.value }"
              :aria-checked="selectedPlatform === opt.value"
              @click="selectPlatform(opt.value)"
          >
            <span>{{ opt.icon }}</span>
            {{ opt.label }}
          </button>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="mo-dialog-footer">
        <el-button round class="mo-btn-ghost" @click="$emit('update:modelValue', false)">取消</el-button>
        <el-button
            round
            type="primary"
            class="mo-btn-primary"
            :loading="submitting"
            :disabled="!canSubmit"
            @click="handleSubmit"
        >
          创建应用
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { ElButton, ElDialog } from 'element-plus'
import {
  APP_PLATFORM_OPTIONS,
  APP_PLATFORM_OPTIONS_ADVANCED,
  serializePlatformSelection,
} from '@/constants/appPlatforms'

const props = defineProps({
  modelValue: Boolean,
  projectName: { type: String, default: '' },
  submitting: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue', 'submit'])

const platformOptions = APP_PLATFORM_OPTIONS
const advancedOptions = APP_PLATFORM_OPTIONS_ADVANCED

const localName = ref('')
/** 覆盖端单选：Mobile | Web | Windows | Mac | Android | iOS */
const selectedPlatform = ref(null)
const showAdvanced = ref(false)

const canSubmit = computed(
    () => localName.value.trim().length > 0 && !!selectedPlatform.value
)

const selectPlatform = (value) => {
  selectedPlatform.value = value
  if (value === 'Android' || value === 'iOS') {
    showAdvanced.value = true
  }
}

watch(
    () => props.modelValue,
    (open) => {
      if (open) {
        localName.value = ''
        selectedPlatform.value = null
        showAdvanced.value = false
      }
    }
)

const handleSubmit = () => {
  if (!canSubmit.value) return
  emit('submit', {
    name: localName.value.trim(),
    platforms: serializePlatformSelection(selectedPlatform.value),
  })
}
</script>

<style scoped>
.create-app-body {
  display: flex;
  flex-direction: column;
  gap: 20px;
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

.field-hint {
  font-size: 12px;
  color: #9ca3af;
  margin-top: -4px;
}

.mo-glass-input {
  width: 100%;
  box-sizing: border-box;
  height: 44px;
  padding: 0 14px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.65);
  background: rgba(255, 255, 255, 0.55);
  font-size: 14px;
  color: #111827;
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.mo-glass-input::placeholder {
  color: #9ca3af;
}

.mo-glass-input:focus {
  border-color: rgba(255, 77, 0, 0.45);
  box-shadow: 0 0 0 3px rgba(255, 77, 0, 0.12);
  background: rgba(255, 255, 255, 0.75);
}

.platform-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-top: 4px;
}

.platform-tile {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 12px 12px 10px;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.55);
  background: rgba(255, 255, 255, 0.35);
  cursor: pointer;
  text-align: left;
  transition: all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.1);
  box-shadow: 0 4px 14px rgba(31, 38, 135, 0.05);
}

.platform-tile.featured {
  grid-column: 1 / -1;
  padding: 14px 16px;
}

.platform-tile:hover {
  background: rgba(255, 255, 255, 0.55);
  border-color: rgba(255, 77, 0, 0.25);
  transform: translateY(-1px);
}

.platform-tile.selected {
  background: rgba(255, 247, 237, 0.85);
  border-color: rgba(255, 77, 0, 0.55);
  box-shadow: 0 8px 24px rgba(255, 77, 0, 0.12);
}

.tile-radio {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 2px solid rgba(0, 0, 0, 0.15);
  background: rgba(255, 255, 255, 0.8);
  transition: all 0.15s;
}

.platform-tile.selected .tile-radio {
  border-color: #ff4d00;
  box-shadow: inset 0 0 0 4px #ff4d00;
}

.tile-icon {
  font-size: 22px;
  line-height: 1;
  flex-shrink: 0;
}

.platform-tile.featured .tile-icon {
  font-size: 26px;
}

.tile-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  padding-right: 26px;
}

.tile-label {
  font-size: 14px;
  font-weight: 650;
  color: #1f2937;
}

.tile-desc {
  font-size: 12px;
  color: #6b7280;
}

.more-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 10px;
  padding: 0;
  border: none;
  background: none;
  font-size: 12px;
  font-weight: 500;
  color: #6b7280;
  cursor: pointer;
}

.more-link:hover {
  color: #ff4d00;
}

.more-chevron {
  transition: transform 0.2s;
}

.more-chevron.open {
  transform: rotate(180deg);
}

.advanced-row {
  display: flex;
  gap: 8px;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px dashed rgba(0, 0, 0, 0.06);
}

.advanced-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.6);
  background: rgba(255, 255, 255, 0.4);
  font-size: 12px;
  font-weight: 600;
  color: #4b5563;
  cursor: pointer;
  transition: all 0.15s;
}

.advanced-chip:hover {
  border-color: rgba(255, 77, 0, 0.3);
  color: #111827;
}

.advanced-chip.selected {
  background: rgba(255, 77, 0, 0.1);
  border-color: rgba(255, 77, 0, 0.45);
  color: #c2410c;
}

.mo-dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
</style>

<style src="../styles/mo-glass-dialog.css"></style>
