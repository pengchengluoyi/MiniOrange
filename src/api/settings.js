import request from '@/utils/request'

export const listFeishuBots = () =>
  request({ url: '/settings/feishu/bots', method: 'get' })

export const createFeishuBot = (data) =>
  request({ url: '/settings/feishu/bots', method: 'post', data })

export const updateFeishuBot = (botId, data) =>
  request({ url: `/settings/feishu/bots/${botId}`, method: 'put', data })

export const deleteFeishuBot = (botId) =>
  request({ url: `/settings/feishu/bots/${botId}`, method: 'delete' })

/** @deprecated 兼容旧接口 */
export const getFeishuBotSettings = () =>
  request({ url: '/settings/feishu', method: 'get' })

export const getTestingKnowledge = () =>
  request({ url: '/settings/knowledge', method: 'get' })

export const saveTestingKnowledge = (items) =>
  request({ url: '/settings/knowledge', method: 'put', data: { items } })

export const analyzeFailureKnowledge = (data) =>
  request({ url: '/settings/knowledge/analyze-failure', method: 'post', data })

export const appendAppKnowledge = (appId, item) =>
  request({ url: '/settings/knowledge/append', method: 'post', data: { app_id: appId, item } })

export const listAppKnowledge = (appId) =>
  request({ url: `/settings/knowledge/app/${appId}`, method: 'get' })

export const getFigmaSettings = () =>
  request({ url: '/settings/figma', method: 'get' })

export const saveFigmaSettings = (data) =>
  request({ url: '/settings/figma', method: 'put', data })

export const testFigmaToken = (accessToken = '') =>
  request({ url: '/settings/figma/test', method: 'post', data: { access_token: accessToken } })
