// src/api/componentService.js
import request from '@/utils/request'

// 辅助函数：确保 content 是对象格式
const parseContent = (content) => {
  if (typeof content === 'string') {
    try {
      return JSON.parse(content)
    } catch (e) {
      return {}
    }
  }
  return content || {}
}

/**
 * 扫描组件 (替代原 electronAPI.scanComponents)
 * @param {string} rootPath - 项目根路径
 */
export const scanComponentsApi = () => {
  return request({
    url: '/get_api', // 后端对应的路由地址
    method: 'get',          // 建议用 POST，因为路径可能包含特殊字符，放 body 里更安全
  })
}

/**
 * 获取所有的脚本
 */
export const fetchWorkflowList = () => {
  return request({
    url: '/workflow/list',
    method: 'get'
  })
}

/**
 * 新增一个flow
 */
export const fetchWorkflowAdd = (name, desc, content) => {
  return request({
    url: `/workflow/add`,
    method: 'post',
    data: {
        "name": name || '未命名流程',
        "desc": desc || '',
        "nodes": parseContent(content)
    }
  })
}

/**
 * 保存一个flow
 */
export const fetchWorkflowSave = (workflow_id, name, desc, content) => {
  return request({
    url: `/workflow/save`,
    method: 'post',
    data: {
      "id": workflow_id,
      "name": name || '未命名流程',
      "desc": desc || '',
      "nodes": parseContent(content)
    }
  })
}
/**
 * 获取某个flow的详情
 */
export const fetchWorkflowDetail = (workflow_id) => {
  return request({
    url: `/workflow/detail/${workflow_id}`,
    method: 'get'
  })
}

/**
 * 获取删除某个flow
 */
export const fetchWorkflowDelete = (workflow_id) => {
  return request({
    url: `/workflow/delete/${workflow_id}`,
    method: 'get'
  })
}

/**
 * 运行某个flow
 */
export const fetchWorkflowRun = (workflow_id) => {
  return request({
    url: `/workflow/${workflow_id}/run`,
    method: 'get'
  })
}

/**
 * 获取运行日志 (轮询)
 */
export const fetchRunLog = (run_id) => {
  return request({
    url: `/logs/${run_id}`,
    method: 'get'
  })
}