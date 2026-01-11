<script setup>
import { ref, onMounted, reactive, computed } from 'vue'
import { ElMessage, ElCard, ElButton, ElTable, ElTableColumn, ElPagination, ElTag, ElIcon, ElEmpty, vLoading } from 'element-plus'
import { Refresh, Back, Check, VideoPlay, Aim, Mouse, Reading, Close, Connection } from '@element-plus/icons-vue'
import { getTimelineList, getTimelineDetail } from '@/api/timeline'

// ================== 列表页状态 ==================
const loading = ref(false)
const tableData = ref([])
const pagination = reactive({ page: 1, pageSize: 20, total: 0 })

// ================== 详情页状态 ==================
const showDetailDashboard = ref(false) // 控制是否显示详情页
const detailLoading = ref(false)
const detailList = ref([]) // 所有步骤
const currentRunId = ref('')
const activeStepIndex = ref(0) // 当前选中的步骤索引

// 当前选中的步骤数据
const currentStep = computed(() => {
  if (!detailList.value.length || activeStepIndex.value === -1) return null
  return detailList.value[activeStepIndex.value]
})

// 解析当前步骤的 Data (JSON字符串 -> 对象)
const currentStepData = computed(() => {
  if (!currentStep.value || !currentStep.value.data) return {}
  try {
    return typeof currentStep.value.data === 'string'
      ? JSON.parse(currentStep.value.data)
      : currentStep.value.data
  } catch (e) {
    return { raw: currentStep.value.data }
  }
})

// ================== API 方法 ==================
const fetchData = async () => {
  loading.value = true
  try {
    const res = await getTimelineList({ page: pagination.page, page_size: pagination.pageSize })
    if (res.code === 200) {
      tableData.value = res.data.list
      pagination.total = res.data.total
    }
  } catch (e) {
    ElMessage.error('获取列表失败: ' + e.message)
  } finally {
    loading.value = false
  }
}

// 进入详情视图
const handleDetail = async (row) => {
  currentRunId.value = row.run_id
  showDetailDashboard.value = true // 切换视图
  detailLoading.value = true
  detailList.value = []
  activeStepIndex.value = 0

  try {
    const res = await getTimelineDetail(row.run_id)
    if (res.code === 200) {
      detailList.value = res.data
      // 默认选中第一个
      if (detailList.value.length > 0) activeStepIndex.value = 0
    }
  } catch (e) {
    ElMessage.error('获取详情失败')
  } finally {
    detailLoading.value = false
  }
}

// 返回列表视图
const goBack = () => {
  showDetailDashboard.value = false
  detailList.value = []
}

// 辅助：获取图标
const getStepIcon = (type) => {
  const t = type?.toLowerCase() || ''
  if (t.includes('plan')) return Reading
  if (t.includes('locate')) return Aim
  if (t.includes('tap') || t.includes('click')) return Mouse
  return VideoPlay
}

// 辅助：格式化耗时 (模拟数据，如果后端有 duration 字段请替换)
const getDuration = (item) => {
  return item.duration ? `${item.duration}ms` : '0.5s' // 占位
}

onMounted(() => {
  fetchData()
})
</script>

<template>
  <div class="app-container">

    <transition name="el-fade-in-linear">
      <el-card v-if="!showDetailDashboard" shadow="never" class="main-card">
        <template #header>
          <div class="card-header">
            <span>时间线回放 / Timeline</span>
            <el-button circle :icon="Refresh" @click="fetchData" />
          </div>
        </template>

        <el-table :data="tableData" v-loading="loading" stripe style="width: 100%">
          <el-table-column prop="run_id" label="Run ID" min-width="180">
            <template #default="{ row }"><span class="mono-font">{{ row.run_id }}</span></template>
          </el-table-column>
          <el-table-column prop="start_time" label="开始时间" width="180" />
          <el-table-column label="操作" width="100" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" @click="handleDetail(row)">详情</el-button>
            </template>
          </el-table-column>
        </el-table>

        <div class="pagination-wrapper">
          <el-pagination
             background layout="total, prev, pager, next"
             :total="pagination.total"
             :page-size="pagination.pageSize"
             @current-change="(p) => { pagination.page = p; fetchData() }"
          />
        </div>
      </el-card>
    </transition>

    <div v-if="showDetailDashboard" class="dashboard-container" v-loading="detailLoading">
      <div class="dashboard-header">
        <div class="header-left">
          <el-button link :icon="Back" @click="goBack" class="back-btn">Back</el-button>
          <span class="run-title">Execution: {{ currentRunId }}</span>
        </div>
        <div class="header-right">
          <el-tag type="success" effect="dark">Finished</el-tag>
        </div>
      </div>

      <div class="dashboard-body">

        <div class="panel-left">
          <div class="panel-title">Execution Steps</div>
          <div class="steps-scroll-area">
            <div
              v-for="(step, index) in detailList"
              :key="index"
              class="step-item"
              :class="{ 'is-active': activeStepIndex === index }"
              @click="activeStepIndex = index"
            >
              <div class="step-status">
                <el-icon color="#67C23A" v-if="step.type !== 'error'"><Check /></el-icon>
                <el-icon color="#F56C6C" v-else><Close /></el-icon>
              </div>
              <div class="step-content">
                <div class="step-type">
                  <el-icon class="type-icon"><component :is="getStepIcon(step.type)" /></el-icon>
                  {{ step.type }}
                </div>
                </div>
              <div class="step-time">{{ getDuration(step) }}</div>
            </div>
          </div>
        </div>

        <div class="panel-center">
          <div class="filmstrip-bar">
            <div class="film-frame" v-for="i in 5" :key="i">
              <div class="frame-time">{{ i * 2 }}s</div>
              <div class="frame-img-placeholder"></div>
            </div>
          </div>

          <div class="canvas-area">
            <div class="device-mockup">
              <div class="device-header">19:03 <el-icon><Connection /></el-icon></div>
              <div class="screen-content">
                <el-empty description="No Screenshot" :image-size="100" />

                <div v-if="currentStepData.center || currentStepData.bbox" class="highlight-box" style="left: 50%; top: 40%;">
                  <div class="pointer-cursor"></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="panel-right">
          <div class="panel-title">Information</div>

          <div v-if="currentStep" class="info-content">

            <div class="info-block">
              <div class="label">Instruction / Type</div>
              <div class="value-text">{{ currentStep.type }}</div>
            </div>

            <div class="info-block">
              <div class="label">Data Detail</div>
              <div class="code-box">
                <pre>{{ JSON.stringify(currentStepData, null, 2) }}</pre>
              </div>
            </div>

            <div class="info-block">
              <div class="label">Meta</div>
              <div class="meta-grid">
                <div class="meta-item">
                  <span>Time</span>
                  <strong>{{ new Date(currentStep.timestamp).toLocaleTimeString() }}</strong>
                </div>
              </div>
            </div>
          </div>
          <el-empty v-else description="Select a step" />
        </div>

      </div>
    </div>
  </div>
</template>

<style scoped>
/* 基础样式 */
.app-container {
  height: 100vh;
  background-color: #f0f2f5;
  display: flex;
  flex-direction: column;
}
.mono-font { font-family: 'Menlo', 'Monaco', monospace; color: #409EFF; }
.card-header { display: flex; justify-content: space-between; align-items: center; font-weight: bold; }
.pagination-wrapper { margin-top: 20px; display: flex; justify-content: flex-end; }

/* Dashboard 容器 */
.dashboard-container {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #fff;
}

/* 顶部 Header */
.dashboard-header {
  height: 50px;
  border-bottom: 1px solid #e0e0e0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  background: #fff;
}
.run-title { font-weight: 600; margin-left: 10px; font-size: 14px; }
.back-btn { font-size: 14px; }

/* 三栏布局主体 */
.dashboard-body {
  flex: 1;
  display: flex;
  overflow: hidden; /* 防止整个页面滚动 */
}

/* === 左侧面板 (Steps) === */
.panel-left {
  width: 300px;
  border-right: 1px solid #e0e0e0;
  display: flex;
  flex-direction: column;
  background: #fff;
}
.panel-title {
  padding: 15px;
  font-weight: 600;
  color: #333;
  border-bottom: 1px solid #f0f0f0;
  font-size: 14px;
}
.steps-scroll-area {
  flex: 1;
  overflow-y: auto;
}
.step-item {
  display: flex;
  align-items: center;
  padding: 12px 15px;
  cursor: pointer;
  border-bottom: 1px solid #f9f9f9;
  transition: all 0.2s;
}
.step-item:hover { background-color: #f5f7fa; }
.step-item.is-active {
  background-color: #ecf5ff;
  border-right: 3px solid #409EFF;
}
.step-status { margin-right: 10px; display: flex; align-items: center; }
.step-content { flex: 1; }
.step-type { font-size: 13px; font-weight: 500; display: flex; align-items: center; gap: 5px; }
.step-time { font-size: 12px; color: #999; }

/* === 中间面板 (Visual) === */
.panel-center {
  flex: 1;
  background: #f2f3f5;
  display: flex;
  flex-direction: column;
  position: relative;
}
.filmstrip-bar {
  height: 80px;
  background: #fff;
  border-bottom: 1px solid #e0e0e0;
  display: flex;
  align-items: center;
  overflow-x: auto;
  padding: 0 10px;
  gap: 10px;
}
.film-frame {
  flex-shrink: 0;
  width: 50px;
  text-align: center;
}
.frame-time { font-size: 10px; color: #999; margin-bottom: 4px; }
.frame-img-placeholder {
  width: 40px; height: 60px; background: #ddd; margin: 0 auto; border-radius: 2px;
}
.canvas-area {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 20px;
  overflow: hidden;
}
.device-mockup {
  width: 320px;
  height: 600px;
  background: #fff;
  border-radius: 20px;
  box-shadow: 0 10px 30px rgba(0,0,0,0.1);
  border: 8px solid #333;
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.device-header {
  height: 24px; background: #fff; font-size: 10px; display: flex; justify-content: space-between; padding: 0 10px; align-items: center;
}
.screen-content {
  flex: 1;
  position: relative;
  background: #fafafa;
  display: flex; align-items: center; justify-content: center;
}
/* 模拟点击的绿框 */
.highlight-box {
  position: absolute;
  width: 20px; height: 20px;
  border: 2px solid #67C23A;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  background: rgba(103, 194, 58, 0.2);
}

/* === 右侧面板 (Info) === */
.panel-right {
  width: 350px;
  border-left: 1px solid #e0e0e0;
  background: #fff;
  display: flex;
  flex-direction: column;
}
.info-content {
  padding: 20px;
  overflow-y: auto;
  flex: 1;
}
.info-block { margin-bottom: 25px; }
.info-block .label {
  font-size: 12px; color: #909399; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px;
}
.value-text { font-size: 14px; color: #333; line-height: 1.5; }
.code-box {
  background: #f6f8fa;
  padding: 10px;
  border-radius: 6px;
  border: 1px solid #eee;
}
.code-box pre {
  margin: 0;
  font-family: 'Menlo', monospace;
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-all;
  color: #444;
}
.meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.meta-item { display: flex; flex-direction: column; font-size: 12px; }
.meta-item strong { margin-top: 4px; font-size: 13px; color: #333; }
</style>