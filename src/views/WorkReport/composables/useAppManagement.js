import { ref } from 'vue'
import * as api from '@/api/workReport'

const platformOptions = [
  { label: 'Android', value: 'android' },
  { label: 'iOS', value: 'ios' },
  { label: 'Windows', value: 'windows' },
  { label: 'Mac', value: 'mac' },
  { label: 'Web', value: 'web' }
]

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