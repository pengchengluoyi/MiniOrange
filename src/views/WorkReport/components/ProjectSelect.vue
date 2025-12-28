<template>
  <div class="page-container center-content">
    <div class="content-wrapper">
      <div class="header-section">
        <div class="glass-badge">STEP 01</div>
        <h1>选择测试平台</h1>
        <p>系统将根据您的选择自动加载对应的测试驱动与用例库</p>
      </div>

      <div class="cards-grid">
        <div
          v-for="item in platforms"
          :key="item.id"
          class="platform-card"
          :class="{ active: selectedIds.includes(item.id) }"
          @click="toggleSelect(item.id)"
        >
          <div class="card-glow"></div>
          <div class="card-icon">{{ item.icon }}</div>
          <h3>{{ item.name }}</h3>
          <p>{{ item.desc }}</p>
          <div class="checkbox-indicator">
            <el-icon v-if="selectedIds.includes(item.id)"><Check /></el-icon>
          </div>
        </div>
      </div>

      <div class="action-footer">
        <el-button class="glass-action-btn" :disabled="selectedIds.length === 0" @click="handleNext">
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
  background: transparent; /* 背景由 index.vue 的深色底提供 */
}

.content-wrapper { max-width: 1000px; width: 100%; padding: 40px; }

.header-section { text-align: center; margin-bottom: 60px; }
.glass-badge {
  display: inline-block;
  background: rgba(99, 102, 241, 0.2);
  color: #818cf8;
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: bold;
  margin-bottom: 16px;
  border: 1px solid rgba(99, 102, 241, 0.3);
}
.header-section h1 { font-size: 36px; color: #fff; margin-bottom: 15px; letter-spacing: 1px; }
.header-section p { color: rgba(255, 255, 255, 0.4); font-size: 16px; }

.cards-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 30px;
  margin-bottom: 60px;
}

.platform-card {
  background: rgba(255, 255, 255, 0.03);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 24px;
  padding: 40px 20px;
  text-align: center;
  cursor: pointer;
  transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  position: relative;
  overflow: hidden;
}

.platform-card:hover {
  transform: translateY(-10px);
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.2);
}

.platform-card.active {
  background: rgba(99, 102, 241, 0.1);
  border-color: #6366f1;
  box-shadow: 0 0 30px rgba(99, 102, 241, 0.3);
}

.card-glow {
  position: absolute; top: 0; left: 0; width: 100%; height: 100%;
  background: radial-gradient(circle at top right, rgba(99, 102, 241, 0.15), transparent 70%);
  pointer-events: none;
}

.card-icon { font-size: 56px; margin-bottom: 25px; filter: drop-shadow(0 0 10px rgba(255,255,255,0.2)); }
.platform-card h3 { color: #fff; margin-bottom: 12px; font-size: 20px; }
.platform-card p { color: rgba(255, 255, 255, 0.4); font-size: 14px; line-height: 1.6; }

.checkbox-indicator {
  position: absolute; top: 20px; right: 20px;
  width: 28px; height: 28px; border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.1); display: flex; align-items: center; justify-content: center;
  color: #fff; transition: all 0.3s;
}
.platform-card.active .checkbox-indicator { background: #6366f1; border-color: #6366f1; box-shadow: 0 0 15px #6366f1; }

.glass-action-btn {
  background: rgba(255, 255, 255, 0.1) !important;
  border: 1px solid rgba(255, 255, 255, 0.2) !important;
  color: #fff !important;
  border-radius: 100px !important;
  padding: 25px 50px !important;
  font-size: 18px !important;
  backdrop-filter: blur(10px);
  transition: all 0.3s;
}
.glass-action-btn:not(:disabled):hover {
  background: #6366f1 !important;
  box-shadow: 0 0 30px rgba(99, 102, 241, 0.5);
  transform: scale(1.05);
}
</style>