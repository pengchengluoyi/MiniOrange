<script setup>
import { ref, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getProjects } from '@/api/workReport'
import { formatPlatformTags } from '@/constants/appPlatforms'
import KnowledgePanel from './KnowledgePanel.vue'

const route = useRoute()
const router = useRouter()
const projects = ref([])
const loading = ref(false)
const hubTab = ref('projects')

const syncTabFromRoute = () => {
  const tab = route.query.tab
  if (tab === 'skills') {
    router.replace({ name: 'SettingsSkills' })
    return
  }
  hubTab.value = tab === 'knowledge' ? 'knowledge' : 'projects'
}

watch(() => route.query.tab, syncTabFromRoute)

watch(hubTab, (tab) => {
  const nextQuery = {}
  if (tab === 'knowledge') {
    nextQuery.tab = 'knowledge'
    if (route.query.appId) nextQuery.appId = route.query.appId
  }
  const same =
    (route.query.tab || '') === (nextQuery.tab || '') &&
    (route.query.appId || '') === (nextQuery.appId || '')
  if (same) return
  router.replace({ name: 'SettingsHub', query: nextQuery })
})

onMounted(async () => {
  syncTabFromRoute()
  loading.value = true
  try {
    projects.value = await getProjects()
  } finally {
    loading.value = false
  }
})

const openApp = (app, project) => {
  router.push({
    name: 'SettingsAppConfig',
    params: { appId: app.id, section: 'env' },
    query: { appName: app.name, projectName: project?.name || '', projectId: project?.id || '' },
  })
}
</script>

<template>
  <div class="settings-panel hub-panel" v-loading="loading">
    <header class="settings-page-header">
      <div>
        <h2 class="settings-page-title">应用与环境</h2>
        <p class="settings-page-desc">项目运行环境、应用自动化与知识库统一管理。</p>
      </div>
    </header>

    <div class="settings-tabbar">
      <button
        type="button"
        class="settings-tab"
        :class="{ active: hubTab === 'projects' }"
        @click="hubTab = 'projects'"
      >
        <strong>项目与应用</strong>
        <span>项目、应用和运行环境</span>
      </button>
      <button
        type="button"
        class="settings-tab"
        :class="{ active: hubTab === 'knowledge' }"
        @click="hubTab = 'knowledge'"
      >
        <strong>知识库</strong>
        <span>测试经验和失败知识</span>
      </button>
    </div>

    <template v-if="hubTab === 'projects'">
        <div v-for="p in projects" :key="p.id" class="settings-table-card project-block">
          <div class="project-head">
            <div>
              <h3>{{ p.name }}</h3>
              <span class="sub">{{ p.apps?.length || 0 }} 个应用</span>
            </div>
          </div>

          <el-table :data="p.apps || []" border size="small" empty-text="暂无应用">
            <el-table-column prop="name" label="应用" min-width="140" />
            <el-table-column label="平台" width="120">
              <template #default="{ row }">
                <span v-for="t in formatPlatformTags(row.platforms)" :key="t" class="tag">{{ t }}</span>
              </template>
            </el-table-column>
            <el-table-column label="资产" width="160">
              <template #default="{ row }">
                图标 {{ row.automation_stats?.icon_targets ?? 0 }} · 用例 {{ row.automation_stats?.feishu_cases ?? 0 }}
              </template>
            </el-table-column>
            <el-table-column label="操作" width="100">
              <template #default="{ row }">
                <el-button type="primary" link @click="openApp(row, p)">配置</el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
      <section v-if="!projects.length && !loading" class="settings-card empty-card">
        暂无项目与应用
      </section>
    </template>

    <KnowledgePanel v-else embedded />
  </div>
</template>

<style scoped>
.hub-panel { max-width: none; width: 100%; }
.project-block { margin-bottom: 24px; }
.empty-card { color: #9ca3af; font-size: 13px; text-align: center; }
.project-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.project-head h3 { margin: 0; font-size: 15px; font-weight: 600; }
.sub { font-size: 12px; color: #9ca3af; }
.tag { display: inline-block; margin-right: 4px; padding: 2px 6px; background: #f3f4f6; border-radius: 4px; font-size: 11px; }
</style>
