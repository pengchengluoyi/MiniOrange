import { computed, ref } from 'vue'
import { getAppAutomationConfig, updateAppAutomationConfig } from '@/api/appAutomation'
import { nowIso } from '@/utils/qaProcess'
import { rebaseTickets } from '@/utils/qaWorkflow'

const cacheKey = (appId) => `mo.qa-process.${appId}`

function emptyState() {
  return { requirements: [], releases: [], schedule: [], workflow: null, updated_at: '' }
}

function readCache(appId) {
  try {
    const raw = localStorage.getItem(cacheKey(appId))
    const parsed = raw ? JSON.parse(raw) : null
    if (parsed && Array.isArray(parsed.requirements)) return parsed
  } catch (_) { /* ignore */ }
  return emptyState()
}

function writeCache(appId, state) {
  try {
    localStorage.setItem(cacheKey(appId), JSON.stringify(state))
  } catch (_) { /* ignore */ }
}

export function useQaProcess(appIdRef) {
  const requirements = ref([])
  const releases = ref([])
  const schedule = ref([])
  const workflow = ref(null)
  const loading = ref(false)
  const saving = ref(false)
  const loadedFor = ref('')

  const state = computed(() => ({
    requirements: requirements.value,
    releases: releases.value,
    schedule: schedule.value,
    workflow: workflow.value,
    updated_at: nowIso(),
  }))

  const persist = async () => {
    const appId = appIdRef.value
    if (!appId) return
    const next = state.value
    writeCache(appId, next)
    saving.value = true
    try {
      await updateAppAutomationConfig(appId, { qa_process: next })
    } catch (_) {
      /* 本机缓存仍可用 */
    } finally {
      saving.value = false
    }
  }

  let persistTimer = null
  const persistSoon = () => {
    clearTimeout(persistTimer)
    persistTimer = setTimeout(() => { persist() }, 400)
  }

  const apply = (doc) => {
    requirements.value = Array.isArray(doc?.requirements) ? doc.requirements : []
    releases.value = Array.isArray(doc?.releases) ? doc.releases : []
    schedule.value = Array.isArray(doc?.schedule) ? doc.schedule : []
    workflow.value = doc?.workflow && typeof doc.workflow === 'object' ? doc.workflow : null
  }

  const load = async () => {
    const appId = appIdRef.value
    if (!appId) return
    loading.value = true
    const cached = readCache(appId)
    apply(cached)
    try {
      const res = await getAppAutomationConfig(appId)
      const remote = res?.data?.automation?.qa_process
      if (remote && (Array.isArray(remote.requirements) || Array.isArray(remote.releases) || Array.isArray(remote.schedule) || remote.workflow)) {
        const remoteAt = String(remote.updated_at || '')
        const localAt = String(cached.updated_at || '')
        if (!localAt || remoteAt >= localAt) apply(remote)
        else await persist()
      } else if (cached.requirements.length || cached.releases.length || (cached.schedule || []).length || cached.workflow) {
        await persist()
      }
    } catch (_) {
      apply(cached)
    } finally {
      loadedFor.value = appId
      loading.value = false
    }
  }

  const upsertReq = async (row) => {
    const next = { ...row, updated_at: nowIso() }
    const i = requirements.value.findIndex((r) => r.id === next.id)
    if (i >= 0) requirements.value.splice(i, 1, next)
    else requirements.value = [next, ...requirements.value]
    await persist()
    return next
  }

  const removeReq = async (id) => {
    requirements.value = requirements.value.filter((r) => r.id !== id)
    releases.value = releases.value.map((rel) => ({
      ...rel,
      requirement_ids: (rel.requirement_ids || []).filter((x) => x !== id),
    }))
    schedule.value = schedule.value.filter((s) => s.requirement_id !== id)
    await persist()
  }

  const upsertRel = async (row) => {
    const next = { ...row, updated_at: nowIso() }
    const i = releases.value.findIndex((r) => r.id === next.id)
    if (i >= 0) releases.value.splice(i, 1, next)
    else releases.value = [next, ...releases.value]
    await persist()
    return next
  }

  const removeRel = async (id) => {
    releases.value = releases.value.filter((r) => r.id !== id)
    schedule.value = schedule.value.filter((s) => s.release_id !== id)
    await persist()
  }

  const upsertSlot = async (row) => {
    const next = { ...row, id: row.id || `sch-${Date.now().toString(36)}` }
    const i = schedule.value.findIndex((s) => s.id === next.id)
    if (i >= 0) schedule.value.splice(i, 1, next)
    else schedule.value = [next, ...schedule.value]
    await persist()
    return next
  }

  const removeSlot = async (id) => {
    schedule.value = schedule.value.filter((s) => s.id !== id)
    await persist()
  }

  const saveWorkflow = async (next) => {
    const prev = workflow.value
    workflow.value = next && typeof next === 'object' ? next : null
    const stampMoved = (before, after) => after.map((row) => {
      const old = before.find((x) => x.id === row.id)
      return old && old.gate !== row.gate ? { ...row, updated_at: nowIso() } : row
    })
    const prevReqs = requirements.value
    const prevRels = releases.value
    requirements.value = stampMoved(prevReqs, rebaseTickets(prev, workflow.value, prevReqs, 'req'))
    releases.value = stampMoved(prevRels, rebaseTickets(prev, workflow.value, prevRels, 'rel'))
    const moved = [...requirements.value, ...releases.value].filter((row) => {
      const old = [...prevReqs, ...prevRels].find((x) => x.id === row.id)
      return old && old.gate !== row.gate
    }).length
    await persist()
    return moved
  }

  const attachRun = async ({ requirementId, releaseId, kind, taskId }) => {
    const run = { task_id: taskId, kind, at: nowIso() }
    if (requirementId) {
      const req = requirements.value.find((r) => r.id === requirementId)
      if (req) await upsertReq({ ...req, runs: [...(req.runs || []), run] })
    }
    if (releaseId) {
      const rel = releases.value.find((r) => r.id === releaseId)
      if (rel) await upsertRel({ ...rel, runs: [...(rel.runs || []), run] })
    }
  }

  return {
    requirements,
    releases,
    schedule,
    workflow,
    loading,
    saving,
    load,
    persist,
    persistSoon,
    upsertReq,
    removeReq,
    upsertRel,
    removeRel,
    upsertSlot,
    removeSlot,
    saveWorkflow,
    attachRun,
  }
}
