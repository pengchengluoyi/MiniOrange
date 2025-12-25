<template>
  <div class="work-report-layout">
    <!-- 顶部导航栏 -->
    <div class="layout-header">
      <div class="brand">
        <span class="icon">📊</span>
        <span class="text">MiniOrange Test Center</span>
      </div>
      <div class="user-info">
        <el-avatar :size="32" src="https://cube.elemecdn.com/0/88/03b0d39583f48206768a7534e55bcpng.png" />
      </div>
    </div>
    
    <!-- 路由出口 -->
    <div class="layout-content">
      <router-view v-slot="{ Component }">
        <transition name="fade" mode="out-in">
          <component :is="Component" />
        </transition>
      </router-view>
    </div>
  </div>
</template>

<script setup>
import { ElAvatar } from 'element-plus'
// 显式引入样式，解决 UI 错乱问题
import 'element-plus/dist/index.css'
</script>

<style scoped>
.work-report-layout {
  min-height: 100vh;
  background: #f8fafc;
  display: flex;
  flex-direction: column;
}

.layout-header {
  height: 60px;
  background: white;
  border-bottom: 1px solid #e2e8f0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.02);
  z-index: 100;
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 18px;
  font-weight: 600;
  color: #1e293b;
}

.layout-content {
  flex: 1;
  overflow: hidden;
  position: relative;
  display: flex;
  flex-direction: column;
}

/* 强制子页面容器填满剩余空间 */
:deep(.page-container),
:deep(.detail-container),
:deep(.case-result-container),
:deep(.editor-container) {
  flex: 1;
  height: 100%;
  overflow: auto;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>