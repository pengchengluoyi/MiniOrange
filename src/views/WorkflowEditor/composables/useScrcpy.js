// useScrcpy.js - 完整修正代码

import { ref } from 'vue'

export function useScrcpy() {
  const isScrcpyOpen = ref(false)
  const isStreaming = ref(false)
  const currentDevice = ref(null)
  const deviceList = ref([])
  const isLoading = ref(false)

  // 用于存储启动流后返回的 WebSocket 端口
  const streamPort = ref(null)

  const toggleScrcpy = () => {
    isScrcpyOpen.value = !isScrcpyOpen.value
    // 只有在打开且没有串流时才刷新设备列表
    if (isScrcpyOpen.value && !isStreaming.value) {
      refreshDevices()
    }
  }

  // 映射到主进程的 'scan-devices'
  const refreshDevices = async () => {
    // 确保 Electron API 已就绪，并且使用正确的 API 名称
    if (!window.electronAPI || !window.electronAPI.scanDevices) {
        console.warn('Electron API (scanDevices) 未就绪')
        return
    }

    isLoading.value = true
    deviceList.value = []

    try {
      // 🚨 修正: 使用 scanDevices 替换 getAdbDevices
      const devices = await window.electronAPI.scanDevices()
      if (Array.isArray(devices)) {
        deviceList.value = devices
      }
    } catch (e) {
      console.error('刷新设备失败', e)
    } finally {
      isLoading.value = false
    }
  }

  // 映射到主进程的 'start-stream'
  // 返回 { success: true, port: 8889 }
  const startMirroring = async (device) => {
    if (!device) return
    if (!window.electronAPI || !window.electronAPI.startStream) {
        console.error('Electron API (startStream) 未就绪')
        return
    }

    isLoading.value = true

    try {
      // 🚨 修正: 使用 startStream 替换 startScrcpy，并捕获返回的端口
      const result = await window.electronAPI.startStream(device.id)

      if (result && result.success && result.port) {
        currentDevice.value = device
        streamPort.value = result.port // 存储 WebSocket 端口
        isStreaming.value = true
      } else {
        throw new Error('启动串流失败，主进程未返回端口信息。')
      }
    } catch (e) {
      console.error('投屏启动失败', e)
      isStreaming.value = false // 失败时重置状态
      streamPort.value = null
    } finally {
      isLoading.value = false
    }
  }

  // 映射到主进程的 'stop-stream'
  const stopMirroring = async () => {
    if (window.electronAPI && window.electronAPI.stopStream) {
        // 🚨 修正: 使用 stopStream 替换 stopScrcpy
        window.electronAPI.stopStream()
    } else {
        console.warn('Electron API (stopStream) 未就绪')
    }

    // 清理前端状态
    isStreaming.value = false
    currentDevice.value = null
    streamPort.value = null
    refreshDevices()
  }

  const closeScrcpy = () => {
    // 关闭窗口时，如果正在投屏，也应该停止投屏进程
    if (isStreaming.value) {
      stopMirroring()
    }
    isScrcpyOpen.value = false
  }

  return {
    isScrcpyOpen,
    isStreaming,
    currentDevice,
    deviceList,
    isLoading,
    streamPort, // 🔥 暴露 streamPort 给 ScrcpyWindow.vue 使用
    toggleScrcpy,
    refreshDevices,
    startMirroring,
    stopMirroring,
    closeScrcpy
  }
}