<template>
  <div class="case-result-container">
    <!-- 顶部导航 -->
    <div class="nav-header">
      <el-page-header @back="$router.back()">
        <template #content>
          <span class="text-large font-600 mr-3"> {{ caseData.name }} </span>
          <el-tag :type="caseData.status === 'pass' ? 'success' : 'danger'" effect="dark">
            {{ caseData.status === 'pass' ? 'Passed' : 'Failed' }}
          </el-tag>
        </template>
      </el-page-header>
    </div>

    <div class="content-body">
      <!-- 左侧：执行步骤时间线 -->
      <div class="left-panel">
        <el-card shadow="never" class="timeline-card">
          <template #header>
            <div class="card-header">
              <span>执行步骤回溯</span>
              <span class="duration">耗时: {{ caseData.duration }}</span>
            </div>
          </template>
          
          <el-timeline>
            <el-timeline-item
              v-for="(step, index) in caseData.steps"
              :key="index"
              :type="step.status === 'fail' ? 'danger' : 'success'"
              :color="step.status === 'fail' ? '#ef4444' : '#10b981'"
              :timestamp="step.time"
              placement="top"
            >
              <div class="step-card" :class="{ active: currentStep === index }" @click="currentStep = index">
                <h4>{{ step.title }}</h4>
                <p>{{ step.desc }}</p>
                <div v-if="step.status === 'fail'" class="error-msg">
                  {{ step.error }}
                </div>
              </div>
            </el-timeline-item>
          </el-timeline>
        </el-card>
      </div>

      <!-- 右侧：截图与详情 -->
      <div class="right-panel">
        <div class="screenshot-viewer">
          <div class="viewer-header">
            <span>步骤截图: {{ currentStepData?.title }}</span>
          </div>
          <div class="image-box">
            <el-image 
              v-if="currentStepData?.image"
              :src="currentStepData.image" 
              fit="contain"
              style="width: 100%; height: 100%;"
            />
            <div v-else class="no-image">暂无截图</div>
          </div>
        </div>

        <div class="logs-panel">
          <div class="log-title">系统日志</div>
          <div class="log-content">
            <div v-for="(log, i) in currentStepData?.logs" :key="i" class="log-line">
              <span class="time">[{{ log.time }}]</span>
              <span :class="log.type">{{ log.msg }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useGraphLogic } from '../composables/useGraphLogic'
import { ElPageHeader, ElTag, ElCard, ElTimeline, ElTimelineItem, ElImage } from 'element-plus'

const route = useRoute()
const { getCaseDetail } = useGraphLogic()
const caseData = ref({ steps: [] })
const currentStep = ref(0)

onMounted(async () => {
  caseData.value = await getCaseDetail(route.params.id)
  // 默认选中失败的那一步，如果没有则选中第一步
  const failIndex = caseData.value.steps?.findIndex(s => s.status === 'fail')
  if (failIndex !== -1) currentStep.value = failIndex
})

const currentStepData = computed(() => caseData.value.steps?.[currentStep.value])
</script>

<style scoped>
.case-result-container { height: 100%; display: flex; flex-direction: column; background: #f8fafc; }
.nav-header { background: white; padding: 16px 24px; border-bottom: 1px solid #e2e8f0; }
.content-body { flex: 1; display: flex; padding: 20px; gap: 20px; overflow: hidden; }
.left-panel { width: 350px; overflow-y: auto; }
.timeline-card { height: 100%; border-radius: 8px; border: none; display: flex; flex-direction: column; }
:deep(.el-card__body) { flex: 1; overflow-y: auto; }
.card-header { display: flex; justify-content: space-between; font-weight: 600; }
.duration { font-weight: normal; color: #64748b; font-size: 12px; }
.step-card { padding: 10px; border-radius: 6px; background: #f8fafc; border: 1px solid #e2e8f0; cursor: pointer; transition: all 0.2s; }
.step-card:hover { border-color: #cbd5e1; }
.step-card.active { border-color: #6366f1; background: #eef2ff; box-shadow: 0 2px 4px rgba(99,102,241,0.1); }
.step-card h4 { margin: 0 0 4px 0; font-size: 14px; color: #1e293b; }
.step-card p { margin: 0; font-size: 12px; color: #64748b; }
.error-msg { margin-top: 8px; font-size: 12px; color: #ef4444; background: #fee2e2; padding: 4px 8px; border-radius: 4px; }
.right-panel { flex: 1; display: flex; flex-direction: column; gap: 20px; overflow: hidden; }
.screenshot-viewer { flex: 2; background: white; border-radius: 8px; border: 1px solid #e2e8f0; display: flex; flex-direction: column; overflow: hidden; }
.viewer-header { padding: 10px 16px; border-bottom: 1px solid #f1f5f9; font-weight: 600; color: #334155; background: #f8fafc; }
.image-box { flex: 1; background: #0f172a; display: flex; align-items: center; justify-content: center; overflow: hidden; }
.no-image { color: #64748b; }
.logs-panel { flex: 1; background: #1e293b; border-radius: 8px; color: #e2e8f0; display: flex; flex-direction: column; overflow: hidden; font-family: monospace; font-size: 12px; }
.log-title { padding: 8px 16px; background: #0f172a; font-weight: 600; border-bottom: 1px solid #334155; }
.log-content { flex: 1; padding: 12px; overflow-y: auto; }
.log-line { margin-bottom: 4px; display: flex; gap: 10px; }
.log-line .time { color: #64748b; }
.log-line .info { color: #94a3b8; }
.log-line .error { color: #f87171; }
</style>