import request from '@/utils/request'

export const getFeishuCredentialsStatus = () =>
  request({ url: '/feishu/credentials/status', method: 'get' })

export const getFeishuConfig = (appId) =>
  request({ url: `/feishu/config/${appId}`, method: 'get' })

export const updateFeishuConfig = (appId, data) =>
  request({ url: `/feishu/config/${appId}`, method: 'put', data })

export const fetchFeishuCases = (appId) =>
  request({ url: `/feishu/fetch/${appId}`, method: 'post', timeout: 120000 })

export const parseFeishuUrl = (docUrl) =>
  request({ url: '/feishu/parse-url', method: 'post', data: { doc_url: docUrl } })

export const runFeishuRegression = (data) =>
  request({ url: '/feishu/run', method: 'post', data, timeout: 600000 })

export const getFeishuRun = (runId) =>
  request({ url: `/feishu/run/${runId}`, method: 'get' })

export const clarifyFeishuRun = (runId, data) =>
  request({
    url: `/feishu/run/${runId}/clarify`,
    method: 'post',
    data,
    timeout: 600000,
  })

export const getFeishuCasesCached = (appId, refresh = false) =>
  request({
    url: `/feishu/cases/${appId}`,
    method: 'get',
    params: { refresh: refresh ? 1 : 0 },
    timeout: refresh ? 120000 : 30000,
  })

export const listFeishuRuns = (appId, limit = 30) =>
  request({ url: `/feishu/runs/${appId}`, method: 'get', params: { limit } })
