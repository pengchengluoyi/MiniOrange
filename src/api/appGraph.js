import request from '@/utils/request'

export const API_BASE_URL = 'http://127.0.0.1:8000'
// 2. 辅助：自动补全图片 URL
export const getImageUrl = (path) => {
  if (!path) return ''
  if (path.startsWith('http')) return path
  return `${API_BASE_URL}${path}`
}


// 1. 获取应用列表
export const fetchAppList = () => {
  return request({
    url: '/app_graph/list',
    method: 'get'
  })
}

// 2. 创建新应用
export const createAppGraph = (name, desc = '') => {
  return request({
    url: '/app_graph/create',
    method: 'post',
    data: { name, desc }
  })
}

// 3. 获取详情
export const fetchGraphDetail = (graphId) => {
  return request({
    url: `/app_graph/detail/${graphId}`,
    method: 'get'
  })
}

// 4. 同步布局 (Nodes + Edges)
export const syncLayout = (data) => {
  // data: { graph_id, nodes, edges }
  return request({
    url: '/app_graph/sync_layout',
    method: 'post',
    data: data
  })
}

// 5. 保存节点详情 (包含组件)
export const saveNodeDetail = (data) => {
  // data: NodeSaveDetail structure
  return request({
    url: '/app_graph/save_node_detail',
    method: 'post',
    data: data
  })
}

// 6. 添加空节点
export const addEmptyNode = (graphId, nodeId, x, y) => {
  return request({
    url: '/app_graph/add_empty_node',
    method: 'post',
    params: { graph_id: graphId, node_id: nodeId, x, y }
  })
}

export const uploadSnapshot = (blob) => {
  const formData = new FormData()
  formData.append('file', blob, `snap_${Date.now()}.jpg`)

  return request({
    url: '/file/upload',
    method: 'post',
    data: formData,
    headers: { 'Content-Type': 'multipart/form-data' }
  })
}