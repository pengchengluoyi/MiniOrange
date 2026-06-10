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
  hubTab.value = route.query.tab === 'knowledge' ? 'knowledge' : 'projects'
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
  <div class="settings-panel hub-panel">
    <template v-if="hubTab === 'projects'">
      <h2>应用与环境</h2>
      <p class="desc">项目运行环境、应用自动化与知识库统一管理。</p>
    </template>

    <el-tabs v-model="hubTab" class="hub-tabs">
      <el-tab-pane label="项目与应用" name="projects">
        <div v-for="p in projects" :key="p.id" class="project-block" v-loading="loading">
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
      </el-tab-pane>

      <el-tab-pane label="知识库" name="knowledge">
        <KnowledgePanel embedded />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<style scoped>
.hub-panel { max-width: none; width: 100%; }
h2 { margin: 0 0 8px; font-size: 20px; font-weight: 700; }
.desc { color: #6b7280; font-size: 13px; margin: 0 0 16px; }
.hub-tabs :deep(.el-tabs__header) { margin-bottom: 16px; }
.project-block { margin-bottom: 28px; background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; }
.project-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.project-head h3 { margin: 0; font-size: 15px; font-weight: 600; }
.sub { font-size: 12px; color: #9ca3af; }
.tag { display: inline-block; margin-right: 4px; padding: 2px 6px; background: #f3f4f6; border-radius: 4px; font-size: 11px; }
</style>
