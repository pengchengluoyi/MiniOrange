<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { listPlugins } from '@/api/settings'
import {
  PLUGIN_CATEGORIES,
  PLUGIN_CATEGORY_HINT,
  capsForCategory,
  categoryLabel,
  defaultPluginTab,
  normalizePluginCat,
  pluginCategories,
  pluginInCategory,
} from '@/utils/pluginCategories'
import './settings-ui.css'

const route = useRoute()
const router = useRouter()
const loading = ref(false)
const plugins = ref([])
const cat = computed(() => normalizePluginCat(route.query.cat))

const visible = computed(() => plugins.value.filter((row) => pluginInCategory(row, cat.value)))
const readyCount = computed(() => visible.value.filter((p) => p.status === 'ready').length)
const hint = computed(() => PLUGIN_CATEGORY_HINT[cat.value] || PLUGIN_CATEGORY_HINT.all)

const statusLabel = (row) => {
  if (row.status === 'ready') return '已连接'
  if (row.status === 'off') return '已关闭'
  return '待连接'
}

const statusType = (row) => {
  if (row.status === 'ready') return 'success'
  if (row.status === 'off') return 'info'
  return 'warning'
}

const setCat = (id) => {
  const next = normalizePluginCat(id)
  router.replace({
    name: 'SettingsPlugins',
    query: next === 'all' ? {} : { cat: next },
  })
}

const openPlugin = (row) => {
  const current = cat.value
  router.push({
    name: 'SettingsPluginDetail',
    params: { pluginId: row.id },
    query: {
      ...(current !== 'all' ? { cat: current } : {}),
      tab: defaultPluginTab(row, current),
    },
  })
}

const load = async () => {
  loading.value = true
  try {
    const res = await listPlugins()
    plugins.value = res?.data?.plugins || []
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || e?.message || '加载插件失败')
  } finally {
    loading.value = false
  }
}

watch(() => route.query.cat, () => {
  if (route.name !== 'SettingsPlugins') return
  const next = normalizePluginCat(route.query.cat)
  if ((route.query.cat || 'all') !== next) setCat(next)
})

onMounted(load)
</script>

<template>
  <div class="settings-panel plugins-page wide-panel" v-loading="loading">
    <header class="settings-page-header">
      <div>
        <h2 class="settings-page-title">插件</h2>
        <p class="settings-page-desc">
          按能力分类接外部系统，不按平台切。文档、IM、缺陷、设计可以共用同一个平台，MiniOrange 里的需求、用例、缺陷、报告才是源。
        </p>
      </div>
      <div class="settings-summary-pill">{{ readyCount }} 个已连接</div>
    </header>

    <div class="settings-tabbar is-compact">
      <button
        v-for="item in PLUGIN_CATEGORIES"
        :key="item.id"
        type="button"
        class="settings-tab"
        :class="{ active: cat === item.id }"
        @click="setCat(item.id)"
      >
        <strong>{{ item.label }}</strong>
        <span>{{ item.desc }}</span>
      </button>
    </div>

    <section class="settings-info-card">
      <div class="settings-kicker">怎么用</div>
      <p>{{ hint }}</p>
    </section>

    <section v-if="!loading && !visible.length" class="settings-info-card">
      <div class="settings-kicker">这一类还没有插件</div>
      <p>换一个分类，或先去「全部」里看已经接上的系统。</p>
    </section>

    <div class="settings-plugin-grid">
      <article
        v-for="row in visible"
        :key="row.id"
        class="settings-plugin-card"
        :style="{ '--brand': row.color }"
        @click="openPlugin(row)"
      >
        <div class="plugin-head">
          <span class="plugin-dot" />
          <strong>{{ row.name }}</strong>
          <el-tag size="small" :type="statusType(row)">{{ statusLabel(row) }}</el-tag>
        </div>
        <p>{{ row.summary }}</p>
        <div class="settings-plugin-caps">
          <template v-if="cat === 'all'">
            <span v-for="id in pluginCategories(row)" :key="`cat-${id}`">{{ categoryLabel(id) }}</span>
          </template>
          <span v-for="cap in capsForCategory(row, cat)" :key="cap.id">{{ cap.label }}</span>
        </div>
        <button type="button" class="settings-action-pill" @click.stop="openPlugin(row)">
          配置
          <span class="settings-action-arrow">→</span>
        </button>
      </article>
    </div>
  </div>
</template>
