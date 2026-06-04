import { sendWsRequest } from '@/api/mWebSocket'

/** 对话规划：自然语言 → steps + navigate */
export function copilotChat({ text, sn, context } = {}) {
  return sendWsRequest('copilot/chat', { text, sn, context }, { timeout: 60000 })
}

/** 执行拆解后的步骤 */
export function copilotExecute({ steps, sn, platform = 'android' } = {}) {
  return sendWsRequest('copilot/execute', { steps, sn, platform }, { timeout: 120000 })
}
