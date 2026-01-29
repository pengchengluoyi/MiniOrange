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
    id: 'nav.apps',
    title: 'Go to App List / Dashboard',
    keywords: ['home', 'dashboard', 'apps', 'start', 'work report'],
    handler: (router) => router.push({ name: 'AppList' }),
  },
  {
    id: 'nav.devices',
    title: 'Go to Device Management',
    keywords: ['devices', 'manage', 'mobile', 'phone'],
    handler: (router) => router.push({ name: 'DeviceManage' }),
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