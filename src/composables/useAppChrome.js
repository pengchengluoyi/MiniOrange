import { computed, onMounted, ref } from 'vue'

const isElectron = ref(typeof window !== 'undefined' && !!window.electronAPI)
const isMac = ref(false)

const detect = () => {
  isElectron.value = !!window.electronAPI
  isMac.value = /Mac|iPod|iPhone|iPad/.test(navigator.platform)
}

if (typeof window !== 'undefined') detect()

export function useAppChrome() {
  onMounted(detect)
  return {
    isElectron,
    isMac,
    showMacTraffic: computed(() => isElectron.value && isMac.value),
    showWinControls: computed(() => isElectron.value && !isMac.value),
    handleMinimize: () => window.electronAPI?.minimize(),
    handleMaximize: () => window.electronAPI?.maximize(),
    handleClose: () => window.electronAPI?.close(),
  }
}
