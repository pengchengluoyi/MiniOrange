<script setup>
import SkillsPanel from './SkillsPanel.vue'
import './settings-ui.css'
</script>

<template>
  <div class="settings-panel skills-page wide-panel">
    <header class="settings-page-header">
      <div>
        <h2 class="settings-page-title">能力目录</h2>
        <p class="settings-page-desc">写用例时按点击、输入、打开应用来说。编排层会先租测试资源再备会话，不必手写内部名称。</p>
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
