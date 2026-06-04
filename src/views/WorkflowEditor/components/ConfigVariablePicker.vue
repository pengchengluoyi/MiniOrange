<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal-content">
      <h3>选择配置变量</h3>
      <p class="sub">来自项目环境（按运行所选 dev/test/pre/prod）与设备配置</p>
      <div class="var-list">
        <div
            v-for="v in options"
            :key="v.key"
            class="var-item"
            :class="{ recommended: isRecommended(v.key) }"
            @click="$emit('select', v.key)"
        >
          <span class="var-key">{{ wrap(v.key) }}</span>
          <span class="var-desc">
            {{ v.label }}
            <span v-if="isRecommended(v.key)" class="rec-tag">推荐</span>
          </span>
          <span class="var-group">{{ v.group }}</span>
        </div>
        <div v-if="options.length === 0" class="empty-vars">当前字段暂无预设，请手动输入</div>
      </div>
      <div class="modal-footer">
        <button class="link-btn" type="button" @click="$emit('pick-upstream')">改为选上游节点变量</button>
        <button class="cancel-btn" type="button" @click="$emit('close')">取消</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { getConfigVarsForField, wrapConfigVar, normalizePlatformKey } from '../constants/configVars'

const props = defineProps({
  fieldName: { type: String, default: '' },
  platform: { type: String, default: '' }
})
defineEmits(['select', 'close', 'pick-upstream'])

const wrap = (key) => wrapConfigVar(key)

const options = computed(() => getConfigVarsForField(props.fieldName, props.platform))

const isRecommended = (varKey) => {
  if (props.fieldName !== 'target_mobile') return false
  const p = normalizePlatformKey(props.platform)
  if (p === 'ios') return varKey === 'app.ios.bundle'
  if (p === 'android') return varKey === 'app.android.package'
  return false
}
</script>

<style scoped>
.modal-overlay {
  position: fixed; inset: 0; z-index: 120;
  background: rgba(15, 23, 42, 0.35);
  backdrop-filter: blur(3px);
  display: flex; align-items: center; justify-content: center;
}
.modal-content {
  width: 400px; max-width: calc(100vw - 32px);
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(20px);
  border-radius: 16px;
  padding: 20px 20px 16px;
  border: 1px solid rgba(255, 255, 255, 0.8);
  box-shadow: 0 20px 50px rgba(15, 23, 42, 0.15);
}
.modal-content h3 { margin: 0 0 6px; font-size: 16px; color: #1e293b; }
.sub { margin: 0 0 14px; font-size: 12px; color: #64748b; }
.var-list { max-height: 280px; overflow-y: auto; margin: 0 -4px; }
.var-item {
  display: grid;
  grid-template-columns: 1fr auto;
  grid-template-rows: auto auto;
  gap: 2px 8px;
  padding: 10px 12px;
  border-radius: 10px;
  cursor: pointer;
  transition: background 0.12s;
}
.var-item:hover { background: #eff6ff; }
.var-key {
  grid-column: 1 / -1;
  font-family: ui-monospace, Menlo, monospace;
  font-size: 12px;
  font-weight: 600;
  color: #059669;
}
.var-item.recommended { background: rgba(255, 247, 237, 0.6); }
.rec-tag {
  margin-left: 6px;
  font-size: 10px;
  font-weight: 700;
  color: #c2410c;
  background: rgba(255, 77, 0, 0.12);
  padding: 1px 6px;
  border-radius: 4px;
}
.var-desc { font-size: 13px; color: #334155; display: inline-flex; align-items: center; }
.var-group { font-size: 11px; color: #94a3b8; justify-self: end; align-self: center; }
.empty-vars { text-align: center; color: #94a3b8; font-size: 13px; padding: 24px 0; }
.modal-footer {
  display: flex; justify-content: space-between; align-items: center;
  margin-top: 16px; padding-top: 12px; border-top: 1px solid #f1f5f9;
}
.cancel-btn, .link-btn {
  border: none; background: transparent; cursor: pointer; font-size: 13px;
}
.cancel-btn {
  background: #f1f5f9; color: #475569;
  padding: 6px 14px; border-radius: 8px;
}
.link-btn { color: #2563eb; padding: 4px 0; }
.link-btn:hover { text-decoration: underline; }
</style>
