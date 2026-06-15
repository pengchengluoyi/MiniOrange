<script setup>
import SkillsPanel from './SkillsPanel.vue'
</script>

<template>
  <div class="settings-panel skills-page">
    <header class="settings-page-header">
      <div>
        <h2 class="settings-page-title">能力目录</h2>
        <p class="settings-page-desc">统一查看设备操作、编排服务和可提供给 Plan 的工具能力。</p>
      </div>
    </header>
    <SkillsPanel />
  </div>
</template>

<style scoped>
.skills-page {
  max-width: none;
  width: 100%;
}
</style>
