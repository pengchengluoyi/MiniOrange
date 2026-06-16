import { sendWsRequest } from '@/api/mWebSocket'

/** 对话规划：自然语言 → steps + navigate */
export function copilotChat({ text, sn, context, planningMode = 'local', providerId = '' } = {}) {
  return sendWsRequest(
    'copilot/chat',
    { text, sn, context, planning_mode: planningMode, provider_id: providerId },
    { timeout: 60000 },
  )
}

/** 执行拆解后的步骤 */
export function copilotExecute({ steps, sn, platform = 'android', runId = '', captureScreenshots = true } = {}) {
  return sendWsRequest(
    'copilot/execute',
    { steps, sn, platform, run_id: runId, capture_screenshots: captureScreenshots },
    { timeout: 120000 },
  )
}
