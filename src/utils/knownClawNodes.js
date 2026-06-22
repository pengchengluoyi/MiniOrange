const STORAGE_KEY = 'known_claw_nodes'

export function readKnownClawNodes() {
  try {
    const list = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    return Array.isArray(list) ? list.filter(Boolean) : []
  } catch {
    return []
  }
}

export function writeKnownClawNodes(list) {
  const next = [...new Set((list || []).filter(Boolean))]
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  return next
}

export function addKnownClawNode(sn) {
  const key = String(sn || '').trim()
  if (!key) return readKnownClawNodes()
  const next = readKnownClawNodes()
  if (!next.includes(key)) next.push(key)
  return writeKnownClawNodes(next)
}

export function removeKnownClawNode(...sns) {
  const drop = new Set(sns.map((s) => String(s || '').trim()).filter(Boolean))
  return writeKnownClawNodes(readKnownClawNodes().filter((sn) => !drop.has(sn)))
}

/** 仅保留仍在 Server 设备列表中的 claw-* SN */
export function pruneKnownClawNodes(devices) {
  const registered = new Set(
    (devices || [])
      .map((d) => String(d?.sn || '').trim())
      .filter((sn) => sn.startsWith('claw-')),
  )
  return writeKnownClawNodes(readKnownClawNodes().filter((sn) => registered.has(sn)))
}
