// src/composables/useKeyboardShortcuts.js
import { onMounted, onUnmounted } from 'vue'

export function useKeyboardShortcuts(shortcuts = {}) {
  const handleKeydown = (e) => {
    // 检查是否按下了 Ctrl (Windows) 或 Command (Mac)
    const isCtrlOrCmd = e.ctrlKey || e.metaKey

    // 1. 保存 (Ctrl + S / Cmd + S)
    if (isCtrlOrCmd && e.key.toLowerCase() === 's') {
      e.preventDefault() // 阻止浏览器默认保存网页
      if (shortcuts.save) shortcuts.save()
    }

    // 2. 运行 (Ctrl + R / Cmd + Enter 也可以配置)
    if (isCtrlOrCmd && e.key.toLowerCase() === 'r') {
      e.preventDefault()
      if (shortcuts.run) shortcuts.run()
    }

    // 这里可以继续扩展，例如 Undo/Redo
  }

  onMounted(() => {
    window.addEventListener('keydown', handleKeydown)
  })

  onUnmounted(() => {
    window.removeEventListener('keydown', handleKeydown)
  })
}