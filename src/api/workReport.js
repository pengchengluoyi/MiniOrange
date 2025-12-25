// src/api/workReport.js

import request from '@/utils/request'

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// --- Mock Data ---

// --- API Methods ---

export const getProjects = () => {
  return request({
    url: '/project/list',
    method: 'get'
  })
}

export const createProject = (data) => {
  return request({
    url: '/project/create',
    method: 'post',
    data
  })
}

export const createAppInProject = (projectId, appData) => {
  const platforms = Array.isArray(appData.platforms) 
    ? appData.platforms.join(',') 
    : appData.platforms

  return request({
    url: '/project/app/create',
    method: 'post',
    data: {
      project_id: projectId,
      name: appData.name,
      description: appData.description,
      platforms: platforms,
      env: appData.env || {}
    }
  })
}

// --- Tasks (对接 rTask.py) ---

export const getTasks = (params = {}) => {
  return request({
    url: '/task/list',
    method: 'get',
    params: {
      appId: params.appId,
      type: params.type,
      keyword: params.keyword
    }
  })
}

export const createTask = (data) => {
  return request({
    url: '/task/create',
    method: 'post',
    data
  })
}

// --- App Graph / Case Library (对接 rAppGraph.py) ---

export const getAppGraphList = (appId) => {
  return request({
    url: '/app_graph/list',
    method: 'get',
    params: { app_id: appId }
  })
}

export const createAppGraph = (data) => {
  return request({
    url: '/app_graph/create',
    method: 'post',
    data
  })
}

// 替代原有的 getCaseLibrary，现在需要传入 graphId
export const getAppGraphDetail = (graphId) => {
  return request({
    url: `/app_graph/detail/${graphId}`,
    method: 'get'
  })
}

export const saveNodeDetail = (data) => {
  return request({
    url: '/app_graph/save_node_detail',
    method: 'post',
    data
  })
}

export const syncGraphLayout = (data) => {
  return request({
    url: '/app_graph/sync_layout',
    method: 'post',
    data
  })
}

export const addEmptyNode = (data) => {
  return request({
    url: '/app_graph/add_empty_node',
    method: 'post',
    data
  })
}

// --- Missing Interfaces (目前仍使用 Mock) ---
// 以下接口在您提供的 Python 代码中缺失，我保留了 Mock 实现，
// 请在后端补充相应接口后通知我更新。

export const getTaskGraph = async (taskId) => {
  await delay(300)
  // 简单模拟：根据 ID 返回略有不同的数据
  const isFail = taskId === 'T-1002'
  
  return {
    nodes: [
      { id: 'root', type: 'input', label: 'App 启动', position: { x: 0, y: 250 }, style: { background: '#1e293b', color: '#fff', border: 'none', width: '160px' } },
      { id: 'p1', label: '登录页', position: { x: 300, y: 100 }, style: { background: '#fff', borderColor: '#94a3b8' } },
      { id: 'p2', label: '首页', position: { x: 300, y: 300 }, style: { background: '#fff', borderColor: '#94a3b8' } },
      { id: 'c1', label: 'TC-001: 登录', position: { x: 600, y: 50 }, style: { background: '#d1fae5', borderColor: '#10b981' }, data: { status: 'pass' } },
      { id: 'c2', label: 'TC-002: 支付', position: { x: 600, y: 300 }, style: { background: isFail ? '#fee2e2' : '#d1fae5', borderColor: isFail ? '#ef4444' : '#10b981' }, data: { status: isFail ? 'fail' : 'pass' } },
    ],
    edges: [
      { id: 'e1', source: 'root', target: 'p1', type: 'smoothstep' },
      { id: 'e2', source: 'root', target: 'p2', type: 'smoothstep' },
      { id: 'e3', source: 'p1', target: 'c1', type: 'default' },
      { id: 'e4', source: 'p2', target: 'c2', type: 'default' },
    ]
  }
}

export const getCaseDetail = async (caseId) => {
  await delay(300)
  const isFail = caseId.includes('fail') || Math.random() > 0.7
  
  return {
    id: caseId,
    name: `测试用例 ${caseId} 详情`,
    status: isFail ? 'failed' : 'pass',
    duration: (Math.random() * 5 + 1).toFixed(1) + 's',
    steps: [
      {
        time: '10:00:01',
        title: '初始化环境',
        desc: '清理缓存，启动应用',
        status: 'pass',
        image: '',
        logs: [{ time: '10:00:01', type: 'info', msg: 'Environment initialized' }]
      },
      {
        time: '10:00:03',
        title: '执行操作步骤',
        desc: '点击目标元素',
        status: 'pass',
        image: '',
        logs: [{ time: '10:00:03', type: 'info', msg: 'Click action performed' }]
      },
      {
        time: '10:00:05',
        title: '验证结果',
        desc: '检查页面元素是否存在',
        status: isFail ? 'fail' : 'pass',
        error: isFail ? 'Element not found timeout' : null,
        image: '',
        logs: isFail ? [{ time: '10:00:05', type: 'error', msg: 'Assertion failed' }] : [{ time: '10:00:05', type: 'info', msg: 'Assertion passed' }]
      }
    ]
  }
}

export const ocrRecognition = async (imageUrl) => {
  await delay(500)
  // Mock OCR data
  return [
    {'text': 'Google', 'confidence': 0.84, 'coordinates': {'center': [409, 104], 'box': [[261, 44], [562, 58], [557, 165], [256, 151]]}},
    {'text': '搜 Google 或翰入網址', 'confidence': 0.79, 'coordinates': {'center': [171, 216], 'box': [[85, 207], [259, 208], [259, 226], [84, 225]]}},
    {'text': '综上磨用程式..', 'confidence': 0.76, 'coordinates': {'center': [351, 345], 'box': [[307, 339], [395, 339], [395, 352], [307, 352]]}},
    {'text': '新增捷径', 'confidence': 0.74, 'coordinates': {'center': [463, 346], 'box': [[436, 339], [490, 339], [490, 353], [436, 353]]}},
    {'text': '你的分真群组', 'confidence': 0.71, 'coordinates': {'center': [102, 433], 'box': [[63, 427], [141, 426], [141, 439], [64, 440]]}},
    {'text': '使用分真群组保持有條不系', 'confidence': 0.74, 'coordinates': {'center': [407, 659], 'box': [[312, 652], [502, 652], [502, 667], [312, 667]]}},
    {'text': '你可以建立分真群组·将相阐網真存在一起；亚在所有装置上使用', 'confidence': 0.87, 'coordinates': {'center': [407, 686], 'box': [[213, 680], [602, 680], [602, 693], [213, 693]]}},
    {'text': '建立新分真群组', 'confidence': 0.83, 'coordinates': {'center': [421, 730], 'box': [[376, 724], [467, 724], [467, 737], [376, 737]]}}
  ]
}