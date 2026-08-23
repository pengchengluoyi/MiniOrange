<script setup>
import PacksPanel from './PacksPanel.vue'
import './settings-ui.css'
</script>

<template>
  <div class="settings-panel packs-page wide-panel">
    <header class="settings-page-header">
      <div>
        <h2 class="settings-page-title">扩展包</h2>
        <p class="settings-page-desc">应用或团队的 YAML 能力包。和「插件」（外部系统）不是同一件事。</p>
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
