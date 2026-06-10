<script setup>
import { computed } from 'vue'
import { caseFieldLines } from '@/utils/caseText'

const props = defineProps({
  row: { type: Object, default: () => ({}) },
  listKey: { type: String, default: '' },
  rawKey: { type: String, required: true },
  numbered: { type: Boolean, default: true },
})

const lines = computed(() =>
  caseFieldLines(props.row, { listKey: props.listKey, rawKey: props.rawKey }),
)
</script>

<template>
  <div v-if="lines.length" class="case-multiline-cell">
    <div v-for="(line, i) in lines" :key="i" class="case-multiline-line">
      <span v-if="numbered && lines.length > 1" class="case-line-no">{{ i + 1 }}.</span>
      <span class="case-line-text">{{ line }}</span>
    </div>
  </div>
  <span v-else class="case-multiline-empty">—</span>
</template>

<style scoped>
.case-multiline-cell {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 2px 0;
  white-space: normal;
  line-height: 1.5;
  font-size: 12px;
  color: #374151;
}
.case-multiline-line {
  display: flex;
  align-items: flex-start;
  gap: 4px;
  word-break: break-word;
}
.case-line-no {
  flex-shrink: 0;
  color: #9ca3af;
  font-variant-numeric: tabular-nums;
  min-width: 1.2em;
}
.case-line-text {
  flex: 1;
  min-width: 0;
}
.case-multiline-empty {
  color: #c0c4cc;
}
</style>
