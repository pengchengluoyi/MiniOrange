<template>
  <div class="modal-overlay">
    <div class="modal-content compact">
      <h3>选择变量</h3>
      <div class="var-source-info">来自节点: {{ pickedNode?.label }}</div>
      <div class="var-list">
         <div v-for="v in vars" :key="v.key" class="var-item" @click="$emit('select', v.key)">
           <span class="var-key">{{ v.key }}</span>
           <span class="var-desc">{{ v.label }}</span>
           <span class="var-type">{{ v.type }}</span>
         </div>
         <div v-if="vars.length === 0" class="empty-vars">此节点无输出变量</div>
      </div>
      <div class="modal-footer"><button class="cancel-btn" @click="$emit('close')">返回</button></div>
    </div>
  </div>
</template>

<script setup>
defineProps(['pickedNode', 'vars'])
defineEmits(['select', 'close'])
</script>

<style scoped>
.modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; z-index: 100; backdrop-filter: blur(2px); }
.modal-content { background: white; padding: 24px; border-radius: 12px; width: 400px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1); border: 1px solid #e2e8f0; }
.modal-content.compact { width: 320px; padding: 16px; }
.modal-content h3 { margin: 0 0 16px 0; font-size: 16px; color: #1e293b; }
.modal-footer { display: flex; justify-content: flex-end; margin-top: 20px; }
.cancel-btn { background: #f1f5f9; color: #475569; border: 1px solid #e2e8f0; padding: 6px 16px; border-radius: 6px; font-size: 13px; cursor: pointer; font-weight: 500; }
.cancel-btn:hover { background: #e2e8f0; }
.var-list { max-height: 240px; overflow-y: auto; margin: -4px -8px; padding: 4px 8px; }
.var-source-info { font-size: 12px; color: #64748b; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #f1f5f9; }
.var-item { display: flex; align-items: center; gap: 8px; padding: 8px; border-radius: 6px; cursor: pointer; transition: background 0.1s; }
.var-item:hover { background: #eff6ff; }
.var-key { font-family: monospace; font-size: 12px; color: #059669; font-weight: 600; background: #ecfdf5; padding: 2px 4px; border-radius: 4px; }
.var-desc { font-size: 12px; color: #334155; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.empty-vars { font-size: 12px; color: #94a3b8; text-align: center; padding: 20px 0; font-style: italic; }
</style>