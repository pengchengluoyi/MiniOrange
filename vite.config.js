import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'
import fs from 'node:fs'
import path from 'node:path'

import vue from '@vitejs/plugin-vue'
import electron from 'vite-plugin-electron'

const API_PROXY_TARGET = 'http://127.0.0.1:10104'
const API_HTTP_PREFIXES = [
  '/auth', '/device', '/sys', '/static', '/settings', '/app-automation', '/webhooks',
  '/feishu', '/project', '/task', '/workflow', '/workflow_run', '/ability',
  '/schedule', '/packs', '/api', '/hitl', '/case-runner', '/app_graph',
  '/logs', '/file', '/get_api', '/upload',
]

function apiProxy() {
  return {
    '/ws': { target: API_PROXY_TARGET, changeOrigin: true, ws: true },
    ...Object.fromEntries(API_HTTP_PREFIXES.map((prefix) => [prefix, { target: API_PROXY_TARGET, changeOrigin: true }])),
  }
}

function copyElectronDiscovery() {
  return {
    name: 'copy-electron-discovery',
    writeBundle(options) {
      const outDir = options.dir || 'dist-electron'
      fs.copyFileSync(
        path.resolve('electron/discovery.js'),
        path.join(outDir, 'discovery.js'),
      )
    },
  }
}

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
        vite: {
          plugins: [copyElectronDiscovery()],
        },
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
  server: {
    port: 5173,
    proxy: apiProxy(),
  },
  preview: {
    port: 4173,
    proxy: apiProxy(),
  },
  // 🔥🔥 关键修复：排除解码器库，防止 Vite 破坏 Worker 文件路径
  optimizeDeps: {
    exclude: ['@yume-chan/scrcpy-decoder-tinyh264'],
    // 🔥 新增：强制预构建底层的 CommonJS 依赖，解决 "does not provide an export named default" 报错
    include: ['yuv-buffer', 'yuv-canvas']
  }
})