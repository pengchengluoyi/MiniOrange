import { ref } from 'vue'
import * as api from '@/api/workReport'

export function useReportData() {
  // 1. 项目列表数据
  const platforms = ref([])

  // 2. 任务列表数据
  const tasks = ref([])

  // 3. 脑图数据生成器
  const getGraphData = async (taskId) => {
    return await api.getTaskGraph(taskId)
  }

  // 4. 单个用例详情数据
  const getCaseDetail = async (caseId) => {
    return await api.getCaseDetail(caseId)
  }

  return {
    platforms,
    tasks,
    getGraphData,
    getCaseDetail
  }
}