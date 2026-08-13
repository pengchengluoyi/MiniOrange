import request from '@/utils/request'

// ---- 启动 / 进度 ----

export const runCaseRunner = (data) =>
  request({ url: '/case-runner/run', method: 'post', data, timeout: 120000 })

export const getCaseRunnerRun = (runId) =>
  request({ url: `/case-runner/run/${runId}`, method: 'get' })

export const listCaseRunnerRuns = (limit = 30) =>
  request({ url: '/case-runner/runs', method: 'get', params: { limit } })

// ---- Agent 流式执行（实时 + 历史回填） ----

export const getAgentRuns = () =>
  request({ url: '/case-runner/agent/runs', method: 'get' })

export const getAgentSteps = (runId) =>
  request({ url: `/case-runner/agent/steps/${encodeURIComponent(runId)}`, method: 'get' })


// ---- Trace（持久化的 m_case_run_trace） ----

export const listCaseRunnerTraces = ({ caseId, deviceSignature, onlyPass, limit = 20 } = {}) =>
  request({
    url: '/case-runner/traces',
    method: 'get',
    params: {
      case_id: caseId || undefined,
      device_signature: deviceSignature || undefined,
      only_pass: onlyPass ? true : undefined,
      limit,
    },
  })

export const getCaseRunnerTraceDetail = (runId) =>
  request({ url: `/case-runner/traces/${runId}`, method: 'get' })

// ---- Baseline ----

export const getCaseRunnerBaseline = (caseId, { sn = '', deviceSignature = '', platform = 'android' } = {}) =>
  request({
    url: `/case-runner/baseline/${caseId}`,
    method: 'get',
    params: { sn, device_signature: deviceSignature, platform },
  })

export const promoteCaseRunnerBaseline = (data) =>
  request({ url: '/case-runner/baseline/promote', method: 'post', data })

// ---- 设备 ----

export const listCaseRunnerDevices = (onlyOnline = true) =>
  request({ url: '/case-runner/devices', method: 'get', params: { only_online: onlyOnline } })
