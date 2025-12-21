<template>
  <div class="node-selector">
    <div class="search-bar">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="search-icon"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
      <input
        type="text"
        v-model="searchQuery"
        placeholder="搜索节点、插件..."
      />
    </div>

    <div class="list">
      <div
        v-for="(items, category) in groupedSchema"
        :key="category"
        class="category-group"
      >
        <div class="category-title" :style="{ color: items[0].categoryColor }">
          <component
             :is="getIcon(items[0].categoryIcon || 'Folder')"
             :size="14"
             style="margin-right:6px; opacity: 0.8;"
          />
          <span class="category-name">{{ category }}</span>
        </div>

        <div class="item-grid">
          <div
            v-for="config in items"
            :key="config.code"
            class="item"
            @click="onSelect(config.code, config)"
          >
            <div
              class="icon-box"
              :style="{
                color: config.categoryColor,
                backgroundColor: hexToRgba(config.categoryColor, 0.1)
              }"
            >
              <component :is="getDisplayIcon(config)" :size="18" stroke-width="2" />
            </div>

            <div class="item-text">
              <span class="label">{{ config.name }}</span>
            </div>
          </div>
        </div>
      </div>

      <div v-if="Object.keys(groupedSchema).length === 0" class="empty-state">
        未找到结果
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { getIcon } from '../config/iconMap'

const props = defineProps({
  schema: { type: Object, default: () => ({}) }
})

const emit = defineEmits(['add-node'])
const searchQuery = ref('')

const hexToRgba = (hex, alpha = 0.1) => {
  if (!hex) return `rgba(100, 116, 139, ${alpha})`
  let c = hex.substring(1).split('')
  if (c.length === 3) c = [c[0], c[0], c[1], c[1], c[2], c[2]]
  c = '0x' + c.join('')
  return 'rgba(' + [(c >> 16) & 255, (c >> 8) & 255, c & 255].join(',') + `,${alpha})`
}

const getDisplayIcon = (config) => {
  const defaultIcons = ['default_icon', 'puzzle', 'default', '', 'code']
  if (defaultIcons.includes(config.icon) && config.categoryIcon) {
    return getIcon(config.categoryIcon)
  }
  return getIcon(config.icon)
}

const groupedSchema = computed(() => {
  const groups = {}
  const query = searchQuery.value.toLowerCase().trim()

  // 遍历新版 API 结构: { "public": { desc: {...}, details: {...} }, ... }
  for (const groupKey in props.schema) {
    const group = props.schema[groupKey]
    const desc = group.desc || {}
    const details = group.details || {}

    const categoryName = desc.category || '其他'
    const categoryColor = desc.color || '#64748b'
    const categoryIcon = desc.icon || 'Folder'

    for (const key in details) {
      const config = details[key]
      const code = config.address || `${groupKey}/${key}`

      // 过滤隐藏节点
      if (config.hide === true) continue
      if (code === 'public/trigger') continue

      const name = config.name || key
      const matchName = name.toLowerCase().includes(query)
      const matchCode = code.toLowerCase().includes(query)
      const matchCategory = categoryName.toLowerCase().includes(query)

      if (query && !matchName && !matchCode && !matchCategory) continue

      if (!groups[categoryName]) groups[categoryName] = []

      // 注入分类样式信息
      const safeConfig = {
        ...config,
        name,
        icon: config.icon || '', // 确保为空时触发 getDisplayIcon 的 fallback
        category: categoryName,
        categoryColor: categoryColor,
        categoryIcon: categoryIcon
      }
      groups[categoryName].push({ code, ...safeConfig })
    }
  }
  return groups
})

const onSelect = (code, config) => {
  emit('add-node', { code, ...config })
}
</script>

<style scoped>
/* 样式保持不变 */
.node-selector { width: 340px; background: white; border-radius: 12px; box-shadow: 0 12px 30px -8px rgba(0,0,0,0.15); overflow: hidden; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; border: 1px solid #e2e8f0; display: flex; flex-direction: column; max-height: 520px; }
.search-bar { padding: 12px 16px; border-bottom: 1px solid #f1f5f9; display: flex; align-items: center; gap: 10px; background: #fff; flex-shrink: 0; }
.search-icon { color: #cbd5e1; }
.search-bar input { width: 100%; border: none; outline: none; font-size: 14px; color: #334155; }
.search-bar input::placeholder { color: #cbd5e1; }
.list { overflow-y: auto; padding: 12px; flex: 1; }
.category-group { margin-bottom: 16px; }
.category-title { padding: 0 4px 8px 4px; font-size: 12px; font-weight: 600; opacity: 0.9; display: flex; align-items: center; }
.item-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.item { display: flex; align-items: center; gap: 10px; padding: 8px; border-radius: 8px; cursor: pointer; transition: all 0.2s ease; background: transparent; }
.item:hover { background: #f8fafc; transform: translateY(-1px); }
.icon-box { width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.item-text { flex: 1; overflow: hidden; }
.label { font-size: 13px; font-weight: 500; color: #334155; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block; }
.empty-state { padding: 30px; text-align: center; color: #94a3b8; font-size: 13px; }
</style>