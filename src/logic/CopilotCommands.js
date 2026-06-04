/**
 * 对话流 / 命令面板 可执行指令（含页面跳转与执行器动作提示）
 */
export const copilotCommands = [
  {
    id: 'nav.dialogue',
    title: '对话流（首页）',
    keywords: ['home', 'copilot', '对话', '助手'],
    handler: (router) => router.push({ name: 'Dialogue' }),
  },
  {
    id: 'nav.apps',
    title: '应用列表',
    keywords: ['apps', '应用', 'dashboard'],
    handler: (router) => router.push({ name: 'AppList' }),
  },
  {
    id: 'nav.devices',
    title: '设备管理',
    keywords: ['devices', '设备', '手机'],
    handler: (router) => router.push({ name: 'DeviceManage' }),
  },
  {
    id: 'nav.schedule',
    title: '定时任务',
    keywords: ['schedule', '定时'],
    handler: (router) => router.push({ name: 'Schedule' }),
  },
  {
    id: 'nav.timeline',
    title: '时间线',
    keywords: ['timeline', '时间线', '日志'],
    handler: (router) => router.push({ name: 'Timeline' }),
  },
  {
    id: 'exec.open_app',
    title: '打开应用（示例）',
    keywords: ['open', '启动', '打开'],
    prompt: '打开 造物相机',
    isPrompt: true,
  },
  {
    id: 'exec.close_app',
    title: '关闭应用（示例）',
    keywords: ['close', '关闭', '退出'],
    prompt: '关闭 造物',
    isPrompt: true,
  },
  {
    id: 'exec.multi',
    title: '多步操作（示例）',
    keywords: ['multi', '多步', '然后'],
    prompt: '打开 造物相机，点击我的，上滑',
    isPrompt: true,
  },
  {
    id: 'exec.click',
    title: '点击坐标（示例）',
    keywords: ['click', '点击', 'tap'],
    prompt: '点击 600, 1200',
    isPrompt: true,
  },
  {
    id: 'exec.swipe',
    title: '上滑（示例）',
    keywords: ['swipe', '滑', 'scroll'],
    prompt: '上滑',
    isPrompt: true,
  },
]
