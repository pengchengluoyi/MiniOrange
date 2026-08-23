<script setup>
import SkillsPanel from './SkillsPanel.vue'
import './settings-ui.css'
</script>

<template>
  <div class="settings-panel skills-page wide-panel">
    <header class="settings-page-header">
      <div>
        <h2 class="settings-page-title">能力目录</h2>
        <p class="settings-page-desc">执行器动作和编排能力的说明。外部系统在「插件」，YAML 包在「扩展包」。</p>
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
