import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'

import vue from '@vitejs/plugin-vue'
import electron from 'vite-plugin-electron'

export default defineConfig({
  // 🔥🔥🔥 核心修复：必须添加这一行，将打包路径改为相对路径
  base: './',

  plugins: [
    vue({
      template: {
        compilerOptions: {
          // 🔥 告诉 Vue：遇到 'webview' 标签时，忽略它，不要把它当作组件
          isCustomElement: (tag) => tag === 'webview'
        }
      }
    }),
    electron([
      {
        // 主进程入口
        entry: 'electron/main.js',
      },
      {
        // 预加载脚本入口
        entry: 'electron/preload.js',
        onstart(options) {
          options.reload()
        },
      },
    ]),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  // 🔥🔥 关键修复：排除解码器库，防止 Vite 破坏 Worker 文件路径
  optimizeDeps: {
    exclude: ['@yume-chan/scrcpy-decoder-tinyh264'],
    // 🔥 新增：强制预构建底层的 CommonJS 依赖，解决 "does not provide an export named default" 报错
    include: ['yuv-buffer', 'yuv-canvas']
  }
})