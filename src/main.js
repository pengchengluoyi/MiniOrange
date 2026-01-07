// src/main.js
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router' // 🔥 新增：引入路由
import { initServiceConfig } from '@/utils/config' // 🔥 新增：引入配置初始化

// 🔥🔥🔥 Vue Flow 核心样式
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'

// 初始化服务配置
initServiceConfig().then((host) => {
  console.log(`[Main] Service initialized with host: ${host}`)
})

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router) // 🔥 新增：挂载路由
app.mount('#app')