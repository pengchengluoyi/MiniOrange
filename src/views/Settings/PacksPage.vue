<script setup>
import PacksPanel from './PacksPanel.vue'
import './settings-ui.css'
</script>

<template>
  <div class="settings-panel packs-page wide-panel">
    <header class="settings-page-header">
      <div>
        <h2 class="settings-page-title">扩展包</h2>
        <p class="settings-page-desc">执行能力按前置、步骤、预期、通用由服务端下发。恢复 / 知识 / 判定仍是 YAML 扩展。</p>
      </div>
    </header>
    <PacksPanel />
  </div>
</template>

<style scoped>
.packs-page {
  max-width: none;
  width: 100%;
}
</style>
