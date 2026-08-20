<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { getProjects } from '@/api/workReport'
import { formatPlatformTags } from '@/constants/appPlatforms'

const router = useRouter()
const projects = ref([])
const loading = ref(false)

onMounted(async () => {
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
    query: {
      appName: app.name,
      projectName: project?.name || '',
      projectId: project?.id || '',
    },
  })
}
</script>

<template>
  <div class="settings-panel">
    <h2>应用配置</h2>
    <p class="desc">按应用配置环境、流程模板与设计稿。</p>

    <div v-for="p in projects" :key="p.id" class="project-block">
      <h3>{{ p.name }}</h3>
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
  </div>
</template>

<style scoped>
h2 { margin: 0 0 8px; font-size: 20px; font-weight: 700; }
.desc { color: #6b7280; font-size: 13px; margin: 0 0 20px; }
.project-block { margin-bottom: 28px; }
.project-block h3 { margin: 0 0 10px; font-size: 15px; font-weight: 600; }
.tag {
  display: inline-block;
  margin-right: 4px;
  padding: 2px 6px;
  background: #f3f4f6;
  border-radius: 4px;
  font-size: 11px;
}
</style>
