<template>
  <div class="admin-shell">
    <main class="content-view">
      <router-view v-slot="{ Component }">
        <transition name="fade-slide" mode="out-in">
          <component :is="Component" />
        </transition>
      </router-view>
    </main>
  </div>
</template>

<script setup>
import 'element-plus/dist/index.css'
</script>

<style scoped>
.admin-shell {
  height: 100vh;
  width: 100vw;
  background: #f3f4f6;
  display: flex;
  overflow: hidden;
}

.content-view {
  flex: 1;
  overflow: auto;
  background: #f3f4f6;
}

.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: opacity 0.2s ease;
}
.fade-slide-enter-from,
.fade-slide-leave-to {
  opacity: 0;
}

</style>