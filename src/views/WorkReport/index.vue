<template>
  <div class="light-liquid-shell">
    <div class="mouse-glow" :style="glowStyle"></div>
    <div class="liquid-bg">
      <div class="blob b1"></div>
      <div class="blob b2"></div>
    </div>

<!--    <aside class="side-nav">-->
<!--      <div class="nav-glass">-->
<!--        <nav class="menu">-->
<!--          <div class="item active"><el-icon><Grid /></el-icon></div>-->
<!--        </nav>-->
<!--      </div>-->
<!--    </aside>-->

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
/* 核心容器：深浅交替的底色，方便玻璃折射 */
.light-liquid-shell {
  height: 100vh; width: 100vw;
  background: #f0f2f5; /* 略带灰色的底色，能更好衬托白色玻璃 */
  display: flex; position: relative; overflow: hidden;
}

/* 增强鼠标跟随光晕 */
.mouse-glow {
  position: fixed; width: 600px; height: 600px; z-index: 1;
  pointer-events: none;
  background: radial-gradient(circle, rgba(255, 77, 0, 0.1) 0%, transparent 70%);
  filter: blur(50px);
}

/* 水波背景：核心在于 blur(100px) 和 mix-blend-mode */
.liquid-bg {
  position: absolute; inset: 0;
  filter: blur(100px); /* 极高模糊实现水乳交融感 */
  opacity: 0.7; z-index: 0;
}

.blob {
  position: absolute; border-radius: 50%;
  animation: move 25s infinite alternate ease-in-out;
}

/* 蓝紫色块 - 水的主色调 */
.b1 {
  width: 800px; height: 800px;
  background: linear-gradient(135deg, #dee7ff 0%, #94b9ff 100%);
  top: -10%; left: -10%;
}

/* 暖橙/粉色块 - 增加灵动感 */
.b2 {
  width: 700px; height: 700px;
  background: linear-gradient(135deg, #fff1f2 0%, #ffd0b5 100%);
  bottom: -5%; right: -5%;
  animation-delay: -7s;
}

/* 新增一个色块，让色彩更丰富 */
.b1::after {
  content: ''; position: absolute; width: 100%; height: 100%;
  background: radial-gradient(circle, #e0e7ff 0%, transparent 70%);
  animation: move 15s infinite alternate-reverse;
}

@keyframes move {
  0% { transform: translate(0, 0) scale(1); }
  50% { transform: translate(150px, 80px) scale(1.1); }
  100% { transform: translate(-50px, 120px) scale(0.9); }
}

.content-view { flex: 1; z-index: 10; position: relative; overflow: hidden; }

/* 页面切换动画 */
.fade-slide-enter-active, .fade-slide-leave-active { transition: all 0.4s ease; }
.fade-slide-enter-from { opacity: 0; transform: translateY(20px); filter: blur(10px); }
.fade-slide-leave-to { opacity: 0; transform: translateY(-20px); }
</style>