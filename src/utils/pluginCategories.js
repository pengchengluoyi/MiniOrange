export const PLUGIN_CATEGORIES = [
  { id: 'all', label: '全部', desc: '所有外部系统' },
  { id: 'docs', label: '文档', desc: 'Wiki 副本' },
  { id: 'im', label: 'IM', desc: '群通知、对话与提缺陷' },
  { id: 'defect', label: '缺陷', desc: '禅道等缺陷库' },
  { id: 'design', label: '设计', desc: '设计稿学习' },
]

export const PLUGIN_CATEGORY_HINT = {
  all: '先连凭证，再按项目绑定。同一平台可以出现在多个分类里，比如飞书既有文档也有 IM。',
  docs: '文档类插件负责 Wiki 副本。用例存在 MiniOrange，不从外部表格拉取。',
  im: 'IM 类插件负责失败告警、群里对话和提缺陷。飞书和微信可收消息，其它平台可先在设置页试对话。',
  defect: '缺陷类插件把 MiniOrange 缺陷单同步到禅道等缺陷库。默认要人确认才推出去。',
  design: '设计类插件用设计稿学习页面结构。Token 全局一份，文件按应用绑定。',
}

export function normalizePluginCat(cat) {
  const id = String(cat || 'all')
  return PLUGIN_CATEGORIES.some((c) => c.id === id) ? id : 'all'
}

export function pluginCategories(plugin) {
  const list = plugin?.categories
  if (Array.isArray(list) && list.length) return list
  return plugin?.kind ? [plugin.kind] : []
}

export function pluginInCategory(plugin, cat) {
  const id = normalizePluginCat(cat)
  if (id === 'all') return true
  return pluginCategories(plugin).includes(id)
}

export function capsForCategory(plugin, cat) {
  const caps = plugin?.capabilities || []
  const id = normalizePluginCat(cat)
  if (id === 'all') return caps
  return caps.filter((c) => {
    const cats = c.categories
    if (!Array.isArray(cats) || !cats.length) return true
    return cats.includes(id)
  })
}

export function defaultPluginTab(plugin, cat) {
  const id = normalizePluginCat(cat)
  const caps = capsForCategory(plugin, cat)
  if (id === 'im' && caps.some((c) => c.id === 'chat')) return 'chat'
  if (id === 'im' && caps.some((c) => c.id === 'notify')) return 'notify'
  if (id === 'docs' && caps.some((c) => c.id === 'cases')) return 'cases'
  if (caps.some((c) => c.id === 'connect')) return 'connect'
  return caps[0]?.id || 'connect'
}

export function categoryLabel(id) {
  return PLUGIN_CATEGORIES.find((c) => c.id === id)?.label || id
}
