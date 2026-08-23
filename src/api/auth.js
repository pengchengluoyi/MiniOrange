import request from '@/utils/request'

export const getAuthStatus = () =>
  request({ url: '/auth/status', method: 'get' })

export const sendAuthCode = ({ email, purpose = 'register' }) =>
  request({ url: '/auth/send-code', method: 'post', data: { email, purpose } })

export const registerAccount = ({ email, password, name = '', code = '' }) =>
  request({ url: '/auth/register', method: 'post', data: { email, password, name, code } })

export const loginAccount = ({ account = '', email = '', password }) => {
  const ident = String(account || email || '').trim()
  const em = String(email || '').trim()
  return request({
    url: '/auth/login',
    method: 'post',
    data: {
      username: ident,
      email: em || ident,
      password,
    },
  })
}

export const logoutAccount = () =>
  request({ url: '/auth/logout', method: 'post' })

export const listAuthUsers = () =>
  request({ url: '/auth/users', method: 'get' })

export const createAuthUser = ({ username, password, name = '', email = '' }) =>
  request({ url: '/auth/users', method: 'post', data: { username, password, name, email } })

export const deleteAuthUser = (userId) =>
  request({ url: `/auth/users/${userId}`, method: 'delete' })

export const listAgentSessions = () =>
  request({ url: '/auth/agent-sessions', method: 'get' })

export const saveAgentSessions = (sessions) =>
  request({ url: '/auth/agent-sessions', method: 'put', data: { sessions } })
