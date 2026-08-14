const KEY_AGENT = 'mo.work.lastAgent'
const KEY_TESTING = 'mo.work.lastTesting'
const KEY_RETURN = 'mo.work.returnFromSettings'

export function rememberAgentPath(fullPath) {
  if (fullPath) sessionStorage.setItem(KEY_AGENT, fullPath)
}

export function rememberTestingPath(fullPath) {
  if (fullPath) sessionStorage.setItem(KEY_TESTING, fullPath)
}

export function lastAgentPath() {
  return sessionStorage.getItem(KEY_AGENT) || '/dialogue'
}

export function lastTestingPath() {
  return sessionStorage.getItem(KEY_TESTING) || '/testing'
}

export function openSettingsRemembering(router, fromFullPath) {
  if (fromFullPath) sessionStorage.setItem(KEY_RETURN, fromFullPath)
  router.push({ name: 'SettingsRuntime', query: { view: 'overview' } })
}

export function returnFromSettingsPath() {
  return sessionStorage.getItem(KEY_RETURN) || lastAgentPath()
}

export function isTestingPath(path = '') {
  return String(path).startsWith('/testing')
}

export function isAgentPath(path = '') {
  return path === '/dialogue' || path.startsWith('/agents')
}
