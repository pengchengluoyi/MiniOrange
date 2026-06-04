/**
 * 对话 API（对接服务端 copilot/chat + copilot/execute）
 */
import { copilotChat, copilotExecute } from '@/api/copilot'

export const getChatHistory = async () => {
  return [
    {
      id: 1,
      role: 'ai',
      content:
        '你好，我是对话流助手。描述你想做的操作（打开应用、点击、滑动、切换页面），我会拆解为可执行步骤。',
    },
  ]
}

export const sendChatMessage = async ({ text, sn } = {}) => {
  const res = await copilotChat({ text, sn })
  const plan = res?.data || {}
  return {
    id: Date.now(),
    role: 'ai',
    content: plan.reply || '已处理',
    plan,
  }
}

export { copilotExecute }
