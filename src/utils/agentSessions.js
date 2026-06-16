const STORAGE_KEY = 'miniorange_agent_sessions'

export const readAgentSessions = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch (e) {
    console.warn('read agent sessions failed', e)
    return []
  }
}

export const writeAgentSessions = (sessions) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions))
}

export const createAgentSession = () => {
  const now = new Date().toISOString()
  return {
    id: `agent-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    title: 'New Agent',
    createdAt: now,
    updatedAt: now,
    lastUserMessageAt: '',
    messages: [],
    deviceSn: '',
    planningEngine: 'local',
  }
}

export const upsertAgentSession = (session, options = {}) => {
  const sessions = readAgentSessions()
  const existing = sessions.find((item) => item.id === session.id)
  const shouldTouchUserTime = options.touchUserTime === true
  const fallbackUserTime = (() => {
    const lastUser = [...(session.messages || [])].reverse().find((item) => item.role === 'user')
    return lastUser ? (session.updatedAt || existing?.updatedAt || new Date().toISOString()) : ''
  })()
  const nextSession = {
    ...session,
    lastUserMessageAt: shouldTouchUserTime
      ? new Date().toISOString()
      : (session.lastUserMessageAt || existing?.lastUserMessageAt || fallbackUserTime),
    updatedAt: new Date().toISOString(),
  }
  const index = sessions.findIndex((item) => item.id === nextSession.id)
  if (index >= 0) {
    sessions.splice(index, 1, nextSession)
  } else {
    sessions.unshift(nextSession)
  }
  writeAgentSessions(sessions.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)))
  return nextSession
}

export const deleteAgentSession = (id) => {
  writeAgentSessions(readAgentSessions().filter((item) => item.id !== id))
}

export const titleFromMessages = (messages) => {
  const firstUserMessage = messages.find((item) => item.role === 'user')?.content || ''
  const clean = firstUserMessage.replace(/\s+/g, ' ').trim()
  if (!clean) return 'New Agent'
  return clean.length > 28 ? `${clean.slice(0, 28)}...` : clean
}
