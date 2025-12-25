import * as api from '@/api/workReport'

export function useGraphLogic() {
  const getGraphData = async (taskId) => {
    return await api.getTaskGraph(taskId)
  }

  const getCaseDetail = async (caseId) => {
    return await api.getCaseDetail(caseId)
  }

  return {
    getGraphData,
    getCaseDetail
  }
}