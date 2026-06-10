import request from '@/utils/request'

export const getAppAutomationConfig = (appId) =>
  request({ url: `/app-automation/config/${appId}`, method: 'get' })

export const updateAppAutomationConfig = (appId, data) =>
  request({ url: `/app-automation/config/${appId}`, method: 'put', data })

export const syncAppFigma = (appId, data) =>
  request({ url: `/app-automation/config/${appId}/figma/sync`, method: 'post', data, timeout: 90000 })

export const applyFigmaAppLogic = (appId, data) =>
  request({ url: `/app-automation/config/${appId}/figma/apply-logic`, method: 'post', data, timeout: 120000 })

export const getCachedFeishuCases = (appId, refresh = false) =>
  request({
    url: `/feishu/cases/${appId}`,
    method: 'get',
    params: { refresh: refresh ? 1 : 0 },
    timeout: refresh ? 120000 : 30000,
  })

export const listAppRegressionRuns = (appId, limit = 30) =>
  request({ url: `/feishu/runs/${appId}`, method: 'get', params: { limit } })

export const getRegressionRun = (runId) =>
  request({ url: `/feishu/run/${runId}`, method: 'get' })

export const listIconTargets = (appId, params = {}) =>
  request({
    url: `/app-automation/icon-targets/${appId}`,
    method: 'get',
    params,
  })

export const saveIconTarget = (appId, data) =>
  request({ url: `/app-automation/icon-targets/${appId}`, method: 'post', data })

export const seedLoginIconTemplates = (appId) =>
  request({ url: `/app-automation/icon-targets/${appId}/seed-login-templates`, method: 'post' })

export const seedLoginIconsFromFigma = (appId) =>
  request({ url: `/app-automation/icon-targets/${appId}/seed-from-figma`, method: 'post', timeout: 120000 })

export const importIconFromLocate = (appId, data) =>
  request({ url: `/app-automation/icon-targets/${appId}/from-locate`, method: 'post', data })

export const deleteIconTarget = (appId, targetId) =>
  request({ url: `/app-automation/icon-targets/${appId}/${targetId}`, method: 'delete' })

export const uploadIconImage = (appId, file) => {
  const fd = new FormData()
  fd.append('file', file)
  return request({
    url: `/app-automation/icon-targets/${appId}/upload`,
    method: 'post',
    data: fd,
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}

export const getGraphIconCandidates = (appId) =>
  request({ url: `/app-automation/icon-targets/${appId}/graph-candidates`, method: 'get' })

export const importGraphIcon = (appId, componentUid) =>
  request({
    url: `/app-automation/icon-targets/${appId}/import-graph`,
    method: 'post',
    data: { component_uid: componentUid },
  })
