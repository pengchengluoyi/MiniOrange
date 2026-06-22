/**
 * LAN mDNS discovery for MiniOrange gateways and ClawNode devices.
 */
const { Bonjour } = require('bonjour-service')

const GATEWAY_TYPE = 'miniorange-gw'
const LEGACY_HTTP_TYPE = 'http'
const NODE_TYPE = 'miniorange-node'
const COLLECT_MS = 3500

function browseServices(type, filterFn = () => true, collectMs = COLLECT_MS) {
  return new Promise((resolve) => {
    const bonjour = new Bonjour()
    const found = new Map()

    const upsert = (service) => {
      if (!filterFn(service)) return
      const host = service.addresses?.[0] || service.host
      if (!host) return
      const port = service.port || 10104
      const txt = service.txt || {}
      const path = txt.path || '/ws'
      const key = `${service.name}@${host}:${port}`
      found.set(key, {
        name: service.name,
        instanceId: service.name,
        displayName: txt.displayName || service.name,
        host,
        port,
        path,
        lanHost: txt.lanHost || null,
        role: txt.role || (type === NODE_TYPE ? 'node' : 'gateway'),
        transport: txt.transport || (type === NODE_TYPE ? 'node' : 'gateway'),
        httpUrl: `http://${host}:${port}`,
        wsUrl: `ws://${host}:${port}${path.startsWith('/') ? path : `/${path}`}`,
        txt,
      })
    }

    const browser = bonjour.find({ type, protocol: 'tcp' }, upsert)
    setTimeout(() => {
      browser.stop()
      bonjour.destroy()
      resolve([...found.values()])
    }, collectMs)
  })
}

async function discoverGateways(timeoutMs = COLLECT_MS) {
  const [gw, legacy] = await Promise.all([
    browseServices(GATEWAY_TYPE),
    browseServices(LEGACY_HTTP_TYPE, (s) => String(s.name || '').toLowerCase().startsWith('miniorange-')),
  ])
  const merged = new Map()
  ;[...gw, ...legacy].forEach((item) => merged.set(item.instanceId, item))
  return [...merged.values()].sort((a, b) => a.displayName.localeCompare(b.displayName))
}

async function discoverLanNodes(timeoutMs = COLLECT_MS) {
  const nodes = await browseServices(NODE_TYPE, () => true, timeoutMs)
  return nodes.map((n) => ({
    ...n,
    sn: n.txt?.sn || n.name.replace(/^clawnode-/, ''),
    model: n.txt?.model || 'Android Node',
    type: n.txt?.type || 'android_direct',
    paired: n.txt?.paired ?? '1',
  })).sort((a, b) => a.sn.localeCompare(b.sn))
}

module.exports = { discoverGateways, discoverLanNodes }
