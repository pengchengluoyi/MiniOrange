import { ref } from 'vue'
import * as api from '@/api/workReport'

import { APP_PLATFORM_OPTIONS } from '@/constants/appPlatforms'

const platformOptions = APP_PLATFORM_OPTIONS

export function useAppManagement() {
  const apps = ref([])
  const loading = ref(false)

  const fetchApps = async () => {
    loading.value = true
    apps.value = await api.getApps()
    loading.value = false
  }

  const createApp = async (appData) => {
    const newApp = await api.createApp(appData)
    apps.value.push(newApp)
  }

  return { apps, loading, platformOptions, fetchApps, createApp }
}