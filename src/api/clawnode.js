import { sendWsRequest } from '@/api/mWebSocket'
import request from '@/utils/request'
import { getBaseUrl } from '@/utils/config'

export const adoptClawNode = (sn, gatewayHost, extra = {}) => {
  return sendWsRequest('adopt_clawnode', {
    sn,
    host: gatewayHost,
    ip: extra.ip,
    model: extra.model,
    pair_port: extra.pair_port || 10105,
  })
}

export const fetchClawNodeLogs = (sn, { minutes = 5 } = {}) => {
  return sendWsRequest('fetch_clawnode_logs', { sn, minutes }, { timeout: 30000 }).catch((err) => {
    const raw = err?.msg || err?.message || '拉取日志失败'
    if (raw === 'device offline or not clawnode') {
      throw new Error('设备离线或未通过 ClawNode 连接')
    }
    throw new Error(raw)
  })
}

export const listClawNodeLogs = () => {
  return request({ url: '/api/clawnode/logs', method: 'get' })
}

export const downloadClawNodeLogUrl = (filename) => {
  return `${getBaseUrl()}/api/clawnode/logs/${encodeURIComponent(filename)}`
}

export const fetchLogFileContent = async (filename) => {
  const res = await fetch(downloadClawNodeLogUrl(filename))
  if (!res.ok) throw new Error(`读取日志失败 (${res.status})`)
  return res.text()
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const copyTextToClipboard = async (text) => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }
  throw new Error('当前环境不支持剪贴板写入')
}

/** 拉取设备日志并复制到剪贴板，等待设备 HTTP 上传完成 */
export const pullClawNodeLogsToClipboard = async (sn, { minutes = 5, timeoutMs = 90000, intervalMs = 1000 } = {}) => {
  const deviceSn = String(sn || '').trim()
  const startedAt = Date.now() / 1000 - 1
  await fetchClawNodeLogs(deviceSn, { minutes })

  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    await sleep(intervalMs)
    const res = await listClawNodeLogs()
    const items = res?.data || []
    const candidates = items.filter((item) => {
      const itemSn = String(item.sn || '').trim()
      return itemSn === deviceSn && Number(item.mtime || 0) >= startedAt
    })
    if (candidates.length > 0) {
      const latest = candidates.sort((a, b) => b.mtime - a.mtime)[0]
      const content = await fetchLogFileContent(latest.filename)
      await copyTextToClipboard(content)
      return { filename: latest.filename, size: latest.size, contentLength: content.length }
    }
  }
  throw new Error('等待设备上传日志超时，请稍后重试')
}

export const unbindClawNode = (sn) => {
  return sendWsRequest('unbind_clawnode', { sn })
}

export const formatLogSize = (bytes) => {
  if (!bytes) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
