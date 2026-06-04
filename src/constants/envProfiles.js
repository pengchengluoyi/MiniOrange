export const ENV_PROFILES = [
  { key: 'dev', label: '开发' },
  { key: 'test', label: '测试' },
  { key: 'pre', label: '预发' },
  { key: 'prod', label: '正式' },
]

export const RUN_ENV_STORAGE_KEY = 'mo_run_env_profile'

export function getStoredRunEnvProfile() {
  const v = localStorage.getItem(RUN_ENV_STORAGE_KEY)
  return ENV_PROFILES.some((p) => p.key === v) ? v : 'test'
}

export function setStoredRunEnvProfile(key) {
  if (ENV_PROFILES.some((p) => p.key === key)) {
    localStorage.setItem(RUN_ENV_STORAGE_KEY, key)
  }
}

export function emptyPlatformEnv() {
  return {
    android: { package: '' },
    ios: { bundle: '' },
    web: { base_url: '' },
  }
}
