export const ENV_PROFILES = [
  { key: 'dev', label: '开发' },
  { key: 'test', label: '测试' },
  { key: 'pre', label: '预发' },
  { key: 'prod', label: '正式' },
]

export const ENV_KEYS = ENV_PROFILES.map((p) => p.key)

export const DEFAULT_CHANNELS = [
  { id: 'android', label: '安卓', field: 'package', placeholder: 'com.example.app' },
  { id: 'ios', label: 'iOS', field: 'bundle', placeholder: 'com.example.app' },
  { id: 'web', label: 'Web', field: 'base_url', placeholder: 'https://test.example.com' },
  { id: 'pc', label: 'PC', field: 'path', placeholder: '安装路径或启动命令' },
  { id: 'mac', label: 'Mac', field: 'bundle', placeholder: 'com.example.desktop' },
  { id: 'server', label: 'Server', field: 'base_url', placeholder: 'https://api.example.com' },
]

export const DEFAULT_ENVIRONMENTS = [
  { key: 'test', label: '测试' },
  { key: 'pre', label: '预发' },
  { key: 'prod', label: '正式' },
]

const KEY_RE = /[^a-z0-9_-]+/g

export function slugEnvKey(text, fallback = 'env') {
  const s = String(text || '').trim().toLowerCase().replace(KEY_RE, '').slice(0, 24)
  return s || fallback
}

export function emptyProfile(channels = DEFAULT_CHANNELS) {
  const out = {}
  for (const ch of channels) {
    out[ch.id] = { [ch.field || 'value']: '' }
  }
  return out
}

export function emptyPlatformEnv() {
  return emptyProfile(DEFAULT_CHANNELS.filter((c) => ['android', 'ios', 'web'].includes(c.id)))
}

function asEnvDoc(raw) {
  if (raw && (raw.profiles || raw.environments || raw.channels || raw.pipeline)) return raw
  return { profiles: raw && typeof raw === 'object' ? raw : {} }
}

function preferChannelMeta(raw) {
  const presetById = DEFAULT_CHANNELS.find((c) => c.id === slugEnvKey(raw?.id || raw?.key, ''))
  const presetByLabel = DEFAULT_CHANNELS.find((c) => (
    c.id === slugEnvKey(raw?.label, '') || c.label === String(raw?.label || '').trim()
  ))
  return presetById || presetByLabel || null
}

export function normalizeEnvDoc(raw) {
  const src = asEnvDoc(raw)
  const profilesIn = src.profiles && typeof src.profiles === 'object' ? src.profiles : {}

  const seenCh = new Set()
  let channels = []
  for (const row of (Array.isArray(src.channels) ? src.channels : [])) {
    const preset = preferChannelMeta(row)
    let id = slugEnvKey(row?.id || row?.key, '')
    if (preset) id = preset.id
    else if (!id) id = slugEnvKey(row?.label, '')
    if (!id || seenCh.has(id)) continue
    seenCh.add(id)
    channels.push({
      id,
      label: String(row?.label || preset?.label || id).trim() || id,
      field: slugEnvKey(row?.field || preset?.field || 'value', 'value'),
      placeholder: String(row?.placeholder || preset?.placeholder || '').trim(),
    })
    const last = channels[channels.length - 1]
    if (preset && (last.label === id || last.label === preset.id)) last.label = preset.label
    if (preset && last.field === 'value') last.field = preset.field
  }
  if (!channels.length) {
    const inferred = new Set()
    Object.values(profilesIn).forEach((snap) => {
      if (snap && typeof snap === 'object') {
        Object.keys(snap).forEach((k) => inferred.add(k))
      }
    })
    const want = inferred.size ? inferred : new Set(['android', 'ios', 'web'])
    channels = DEFAULT_CHANNELS.filter((c) => want.has(c.id)).map((c) => ({ ...c }))
    for (const id of want) {
      if (!channels.some((c) => c.id === id)) {
        channels.push({ id, label: id, field: 'value', placeholder: '' })
      }
    }
  }

  let environments = (Array.isArray(src.environments) ? src.environments : [])
    .map((e) => ({
      key: slugEnvKey(e?.key || e?.id || e?.label, ''),
      label: String(e?.label || '').trim() || slugEnvKey(e?.key, '环境'),
    }))
    .filter((e) => e.key)
  if (!environments.length) {
    const keys = Object.keys(profilesIn).length ? Object.keys(profilesIn) : ENV_KEYS
    environments = keys.map((key) => ({
      key,
      label: ENV_PROFILES.find((p) => p.key === key)?.label || key,
    }))
  }

  const envKeys = new Set(environments.map((e) => e.key))
  let pipeline = (Array.isArray(src.pipeline) ? src.pipeline : [])
    .map((k) => slugEnvKey(k, ''))
    .filter((k) => envKeys.has(k))
  if (!pipeline.length) {
    pipeline = ['test', 'pre', 'prod'].filter((k) => envKeys.has(k))
    if (!pipeline.length) pipeline = environments.map((e) => e.key)
  }

  let defaultProfile = slugEnvKey(src.default_profile || '', '')
  if (!envKeys.has(defaultProfile)) defaultProfile = pipeline[0] || environments[0]?.key || 'test'

  const profiles = {}
  for (const env of environments) {
    const snap = profilesIn[env.key] && typeof profilesIn[env.key] === 'object' ? profilesIn[env.key] : {}
    profiles[env.key] = emptyProfile(channels)
    for (const ch of channels) {
      const block = snap[ch.id] && typeof snap[ch.id] === 'object' ? snap[ch.id] : {}
      const val = block[ch.field] || block.value || block.package || block.bundle || block.base_url || block.path || ''
      profiles[env.key][ch.id][ch.field] = String(val || '').trim()
    }
  }

  return {
    default_profile: defaultProfile,
    environments,
    channels,
    pipeline,
    profiles,
  }
}

export function channelValue(snap, channelId, field) {
  const block = snap?.[channelId]
  if (!block || typeof block !== 'object') return ''
  return String(block[field] || block.value || block.package || block.bundle || block.base_url || block.path || '').trim()
}

export const MOBILE_CHANNEL_IDS = new Set(['android', 'ios'])

function mobileField(id) {
  return id === 'ios' ? 'bundle' : 'package'
}

/** 移动端未单独填写时，沿用其它环境 / 另一端已填的包名，不覆盖手动填写。 */
export function resolveChannelValue(profiles, envOrder, envKey, channelId, field) {
  const local = channelValue(profiles?.[envKey], channelId, field)
  if (local) return { value: local, fromKey: envKey, fromChannel: channelId, inherited: false }
  if (!MOBILE_CHANNEL_IDS.has(channelId)) {
    return { value: '', fromKey: '', fromChannel: '', inherited: false }
  }
  const keys = (Array.isArray(envOrder) && envOrder.length ? envOrder : Object.keys(profiles || {})).filter(Boolean)
  for (const key of keys) {
    const v = channelValue(profiles?.[key], channelId, field)
    if (v) return { value: v, fromKey: key, fromChannel: channelId, inherited: key !== envKey }
  }
  const other = channelId === 'android' ? 'ios' : 'android'
  for (const key of [envKey, ...keys]) {
    if (!key) continue
    const v = channelValue(profiles?.[key], other, mobileField(other))
    if (v) return { value: v, fromKey: key, fromChannel: other, inherited: true }
  }
  return { value: '', fromKey: '', fromChannel: '', inherited: false }
}

export function profileIsFilled(snap, channels) {
  if (!snap || typeof snap !== 'object') return false
  const list = Array.isArray(channels) && channels.length ? channels : DEFAULT_CHANNELS
  return list.some((ch) => channelValue(snap, ch.id, ch.field))
}

export function envLabel(key, environments) {
  if (Array.isArray(environments)) {
    const hit = environments.find((e) => e.key === key)
    if (hit?.label) return hit.label
  }
  return ENV_PROFILES.find((p) => p.key === key)?.label || key || '—'
}

export function isEnvKey(key, environments) {
  if (Array.isArray(environments) && environments.length) {
    return environments.some((e) => e.key === key)
  }
  return ENV_PROFILES.some((p) => p.key === key)
}

export function filledEnvKeys(docOrProfiles) {
  return envSummaries(docOrProfiles).filter((s) => s.filled).map((s) => s.key)
}

export function envSummaries(docOrProfiles) {
  const doc = normalizeEnvDoc(docOrProfiles)
  const pipe = new Set(doc.pipeline)
  const order = doc.pipeline.length ? doc.pipeline : doc.environments.map((e) => e.key)
  return doc.environments.map((e) => {
    const snap = doc.profiles[e.key] || {}
    const channelRows = doc.channels.map((ch) => {
      const resolved = resolveChannelValue(doc.profiles, order, e.key, ch.id, ch.field)
      return {
        id: ch.id,
        label: ch.label,
        value: resolved.value,
        inherited: resolved.inherited,
      }
    })
    const filledChannels = channelRows.filter((c) => c.value)
    const pkg = resolveChannelValue(doc.profiles, order, e.key, 'android', 'package')
    const bundle = resolveChannelValue(doc.profiles, order, e.key, 'ios', 'bundle')
    return {
      key: e.key,
      label: e.label,
      filled: filledChannels.length > 0 || profileIsFilled(snap, doc.channels),
      package: pkg.value,
      bundle: bundle.value,
      web: channelValue(snap, 'web', 'base_url'),
      preview: filledChannels[0]?.value || '',
      channels: channelRows,
      channelText: filledChannels.length
        ? filledChannels.map((c) => `${c.label} ${c.value}`).join(' · ')
        : '',
      inPipeline: pipe.has(e.key),
    }
  })
}

export function pipelineKeys(docOrProfiles) {
  const doc = normalizeEnvDoc(docOrProfiles)
  return doc.pipeline.length ? doc.pipeline : doc.environments.map((e) => e.key)
}

export const RUN_ENV_STORAGE_KEY = 'mo_run_env_profile'

export function getStoredRunEnvProfile() {
  const v = localStorage.getItem(RUN_ENV_STORAGE_KEY)
  return v || 'test'
}

export function setStoredRunEnvProfile(key) {
  const k = slugEnvKey(key, '')
  if (k) localStorage.setItem(RUN_ENV_STORAGE_KEY, k)
}
