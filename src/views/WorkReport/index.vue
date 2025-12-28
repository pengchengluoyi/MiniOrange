<template>
  <div class="light-liquid-shell">
    <div class="mouse-glow" :style="glowStyle"></div>
    <div class="liquid-bg">
      <div class="blob b1"></div>
      <div class="blob b2"></div>
    </div>

    <aside class="side-nav">
      <div class="nav-glass">
        <div class="logo">M</div>
        <nav class="menu">
          <div class="item active"><el-icon><Grid /></el-icon></div>
        </nav>
        <div class="footer">
          <el-avatar :size="32" src="https://cube.elemecdn.com/0/88/03b0d39583f48206768a7534e55bcpng.png" />
        </div>
      </div>
    </aside>

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
import { ref, onMounted, computed } from 'vue'
import { ElIcon, ElAvatar, ElDivider } from 'element-plus'
import { Grid, Menu, Monitor, Files, Setting } from '@element-plus/icons-vue'

import 'element-plus/theme-chalk/dark/css-vars.css'
import 'element-plus/dist/index.css'

const mouse = ref({ x: 0, y: 0 })
const glowStyle = computed(() => ({ transform: `translate(${mouse.value.x - 200}px, ${mouse.value.y - 200}px)` }))

onMounted(() => {
  window.addEventListener('mousemove', (e) => { mouse.value = { x: e.clientX, y: e.clientY } })
})
</script>

<style scoped>
.light-liquid-shell { height: 100vh; width: 100vw; background: #fdfdfd; display: flex; position: relative; overflow: hidden; }
.mouse-glow { position: fixed; width: 400px; height: 400px; z-index: 1; pointer-events: none; background: radial-gradient(circle, rgba(255, 77, 0, 0.05) 0%, transparent 70%); filter: blur(40px); }
.liquid-bg { position: absolute; inset: 0; filter: blur(80px) contrast(1.2); opacity: 0.5; z-index: 0; }
.blob { position: absolute; border-radius: 50%; animation: move 20s infinite alternate ease-in-out; }
.b1 { width: 600px; height: 600px; background: #e0e7ff; top: -10%; left: -10%; }
.b2 { width: 500px; height: 500px; background: #fff1f2; bottom: 5%; right: 5%; animation-delay: -5s; }
@keyframes move { from { transform: translate(0,0); } to { transform: translate(100px, 50px) scale(1.1); } }
.side-nav { width: 90px; z-index: 100; display: flex; align-items: center; justify-content: center; }
.nav-glass { height: 90%; width: 56px; background: rgba(255,255,255,0.4); backdrop-filter: blur(20px); border: 1px solid rgba(255,255,255,0.8); border-radius: 28px; display: flex; flex-direction: column; align-items: center; justify-content: space-between; padding: 25px 0; }
.logo { width: 36px; height: 36px; background: #ff4d00; border-radius: 12px; color: #fff; font-weight: 900; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(255, 77, 0, 0.2); }
.item { width: 40px; height: 40px; margin: 15px 0; display: flex; align-items: center; justify-content: center; color: #94a3b8; cursor: pointer; border-radius: 14px; transition: 0.3s; }
.item:hover, .item.active { background: #fff; color: #ff4d00; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
.content-view { flex: 1; z-index: 10; position: relative; overflow: hidden; }
.fade-slide-enter-active, .fade-slide-leave-active { transition: all 0.3s; }
.fade-slide-enter-from { opacity: 0; transform: translateY(10px); }
.fade-slide-leave-to { opacity: 0; transform: translateY(-10px); }
</style>