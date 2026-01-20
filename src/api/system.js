import { getBaseUrl } from '@/utils/config'

const handleResponse = async (response) => {
  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(errorText || response.statusText)
  }
  return response.json()
}

export const getServerInfo = async () => {
  const response = await fetch(`${getBaseUrl()}/sys/server_info`)
  return handleResponse(response)
}

export const scanLanServers = async () => {
  const response = await fetch(`${getBaseUrl()}/sys/scan_lan_servers`)
  return handleResponse(response)
}

export const joinCluster = async (targetUrl) => {
  const response = await fetch(`${getBaseUrl()}/sys/join_cluster`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ target_url: targetUrl })
  })
  return handleResponse(response)
}

export const updateConfig = async (data) => {
  const response = await fetch(`${getBaseUrl()}/sys/config`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
  })
  return handleResponse(response)
}