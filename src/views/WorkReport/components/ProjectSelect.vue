<template>
  <div class="page-container center-content">
    <div class="content-wrapper">
      <div class="header-section">
        <h1>选择测试项目</h1>
        <p>请选择需要进行测试的端（支持多选），系统将自动加载对应的测试用例库。</p>
      </div>

      <div class="cards-grid">
        <div 
          v-for="item in platforms" 
          :key="item.id"
          class="platform-card"
          :class="{ active: selectedIds.includes(item.id) }"
          @click="toggleSelect(item.id)"
        >
          <div class="card-icon">{{ item.icon }}</div>
          <h3>{{ item.name }}</h3>
          <p>{{ item.desc }}</p>
          <div class="checkbox-indicator">
            <span v-if="selectedIds.includes(item.id)">✓</span>
          </div>
        </div>
      </div>

      <div class="action-footer">
        <el-button type="primary" size="large" :disabled="selectedIds.length === 0" @click="handleNext">
          进入任务管理 ➔
        </el-button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useReportData } from '../composables/useReportData'
import { ElButton } from 'element-plus'

const router = useRouter()
const { platforms } = useReportData()
const selectedIds = ref([])

const toggleSelect = (id) => {
  const idx = selectedIds.value.indexOf(id)
  if (idx > -1) selectedIds.value.splice(idx, 1)
  else selectedIds.value.push(id)
}

const handleNext = () => {
  router.push('/report/tasks')
}
</script>

<style scoped>
.page-container {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f8fafc;
}

.content-wrapper { max-width: 900px; width: 100%; padding: 40px; }
.header-section { text-align: center; margin-bottom: 50px; }
.header-section h1 { font-size: 32px; color: #1e293b; margin-bottom: 10px; }
.header-section p { color: #64748b; font-size: 16px; }

.cards-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 24px;
  margin-bottom: 50px;
}

.platform-card {
  background: white;
  border: 2px solid #e2e8f0;
  border-radius: 16px;
  padding: 30px 20px;
  text-align: center;
  cursor: pointer;
  transition: all 0.3s ease;
  position: relative;
}

.platform-card:hover { transform: translateY(-5px); box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1); }
.platform-card.active { border-color: #6366f1; background: #eef2ff; }

.card-icon { font-size: 48px; margin-bottom: 20px; }
.platform-card h3 { margin: 0 0 10px 0; color: #1e293b; }
.platform-card p { color: #64748b; font-size: 13px; line-height: 1.5; margin: 0; }

.checkbox-indicator {
  position: absolute; top: 16px; right: 16px;
  width: 24px; height: 24px; border-radius: 50%;
  border: 2px solid #cbd5e1; display: flex; align-items: center; justify-content: center;
  color: white; font-size: 14px; font-weight: bold;
}
.platform-card.active .checkbox-indicator { background: #6366f1; border-color: #6366f1; }
.action-footer { display: flex; justify-content: center; }
</style>