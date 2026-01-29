/**
 * Mock API service for AI Copilot Chat
 */

export const getChatHistory = async () => {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve([
        { id: 1, role: 'ai', content: 'Hello! I am your Copilot. Type "/" to see available commands.' }
      ])
    }, 500)
  })
}

export const sendChatMessage = async ({ text }) => {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        id: Date.now(),
        role: 'ai',
        content: `I received: "${text}". (Mock Response)`
      })
    }, 1000)
  })
}