<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { getProjects } from '@/api/workReport'

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

const openEnv = (p) => {
  router.push({ name: 'SettingsProjectEnv', params: { projectId: p.id }, query: { name: p.name } })
}
</script>

<template>
  <div class="settings-panel">
    <h2>项目环境</h2>
    <p class="desc">管理各项目的 Android 包名、iOS Bundle、Web 地址（dev / test / pre / prod）。</p>
    <el-table v-loading="loading" :data="projects" border stripe>
      <el-table-column prop="name" label="项目" min-width="160" />
      <el-table-column label="应用数" width="100">
        <template #default="{ row }">{{ row.apps?.length || 0 }}</template>
      </el-table-column>
      <el-table-column label="操作" width="120">
        <template #default="{ row }">
          <el-button type="primary" link @click="openEnv(row)">环境配置</el-button>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<style scoped>
.settings-panel h2 { margin: 0 0 8px; font-size: 20px; font-weight: 700; }
.desc { color: #6b7280; font-size: 13px; margin: 0 0 20px; }
</style>
