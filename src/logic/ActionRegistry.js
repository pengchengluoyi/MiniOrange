/**
 * A centralized registry for all actions in the application.
 * This is used by the Command Palette and can be used by other features like an AI Copilot.
 *
 * Structure:
 * {
 *   id: 'unique.action.id',
 *   title: 'User-facing title of the action',
 *   keywords: ['search', 'terms'],
 *   handler: (router) => { ... } // Function to execute the action
 * }
 */
export const actions = [
  {
    id: 'nav.dialogue',
    title: 'Go to Dialogue / Copilot',
    keywords: ['dialogue', 'copilot', '对话', '助手', 'home'],
    handler: (router) => router.push({ name: 'Dialogue' }),
  },
  {
    id: 'nav.apps',
    title: 'Go to Applications and Environment',
    keywords: ['home', 'dashboard', 'apps', 'start', 'work report'],
    handler: (router) => router.push({ name: 'SettingsHub' }),
  },
  {
    id: 'nav.runtime',
    title: 'Go to Runtime Status',
    keywords: ['devices', 'manage', 'mobile', 'phone', 'runtime', 'status'],
    handler: (router) => router.push({ name: 'SettingsRuntime' }),
  },
  {
    id: 'nav.schedule',
    title: 'Go to Schedule',
    keywords: ['tasks', 'cron', 'jobs', 'schedule', 'timer'],
    handler: (router) => router.push({ name: 'Schedule' }),
  },
  {
    id: 'nav.timeline',
    title: 'Go to Timeline',
    keywords: ['events', 'logs', 'history', 'timeline', 'data line'],
    handler: (router) => router.push({ name: 'Timeline' }),
  },
]