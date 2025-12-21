// src/utils/useFlowAdapter.js
import { MarkerType } from '@vue-flow/core'

export function useFlowAdapter() {

  // 1. 保存：导出为后端 JSON
  const toBackendFormat = (nodes, edges, flowName, description = '') => {
    const result = {
      case_info: {
        displayName: flowName,
        description: description
      },
      nodes: {},
      _ui_meta: {
        edges: edges.map(e => ({
          id: e.id,
          source: e.source,
          target: e.target,
          sourceHandle: e.sourceHandle,
          targetHandle: e.targetHandle,
          type: e.type,
          animated: e.animated,
          style: e.style
        }))
      }
    }

    // 构建连接关系映射
    const connectionMap = {}
    nodes.forEach(n => connectionMap[n.id] = { next: [], last: [] })
    edges.forEach(edge => {
      if (edge.id.includes('temp_draft')) return
      if (connectionMap[edge.source]) connectionMap[edge.source].next.push(edge.target)
      if (connectionMap[edge.target]) connectionMap[edge.target].last.push(edge.source)
    })

    nodes.forEach(node => {
      if (node.id.includes('temp')) return
      if (node.type === 'group') return

      const nodeCode = node.data.nodeCode || 'unknown'
      // 深拷贝 data，防止修改影响 UI
      const cleanData = JSON.parse(JSON.stringify(node.data))

      // 清理逻辑字段，避免脏数据
      if (nodeCode === 'cfs/mIf') {
        delete cleanData.branches
        delete cleanData.else // 确保清理旧数据
      }
      if (nodeCode === 'cfs/mFor') {
        delete cleanData.child_node
        delete cleanData.next_node
      }

      // 清理 UI 辅助字段
      delete cleanData.iconChar
      delete cleanData.nodeCode
      delete cleanData.nodeType
      delete cleanData.outputs
      delete cleanData._pickDisabled

      const backendNode = {
        id: node.id,
        nodeType: node.data.nodeType || 200,
        nodeCode: nodeCode,
        displayName: node.label || '开始',
        lastCodes: connectionMap[node.id]?.last || [],
        nextCodes: connectionMap[node.id]?.next || [],
        data: cleanData,
        _ui: {
          x: node.position.x,
          y: node.position.y,
          type: node.type,
          parentNode: node.parentNode,
          width: node.style?.width,
          height: node.style?.height
        }
      }

      // --- 逻辑连线处理 ---

      // A. IF 节点 (多分支逻辑) - 🔥🔥🔥 核心修改部分 🔥🔥🔥
      if (nodeCode === 'cfs/mIf') {
        backendNode.nextCodes = [] // IF 节点物理上的 nextCodes 置空，完全由 branches 控制逻辑
        backendNode.data.branches = {}

        // 找到所有从当前 IF 节点出发的连线
        const outgoingEdges = edges.filter(e => e.source === node.id)

        outgoingEdges.forEach(edge => {
          // 1. 处理普通条件分支 (sourceHandle 格式为 "branch-0", "branch-1" ...)
          if (edge.sourceHandle && edge.sourceHandle.startsWith('branch-')) {
            const index = edge.sourceHandle.split('-')[1]
            backendNode.data.branches[index] = edge.target
          }
          // 2. 处理 Else 分支 (sourceHandle 为 "else")
          // 之前的代码写的是 'false'，这里修正为 'else'
          else if (edge.sourceHandle === 'else') {
            backendNode.data.branches['else'] = edge.target
          }
        })
      }

      // B. 循环节点逻辑
      if (nodeCode === 'cfs/mFor') {
        backendNode.nextCodes = []
        const relatedGroupId = `group-${node.id}`
        // 寻找位于 Group 内的第一个子节点
        const children = nodes.filter(n => n.parentNode === relatedGroupId)
        if (children.length > 0) {
            // 按 Y 轴排序，取最上面的作为循环体入口
            const sortedChildren = [...children].sort((a, b) => a.position.y - b.position.y)
            backendNode.data.child_node = sortedChildren[0].id
        }
        // 寻找右侧连线作为循环结束后的下一个节点
        const nextEdge = edges.find(e => e.source === node.id && e.sourceHandle === 'right')
        if (nextEdge) {
          backendNode.data.next_node = nextEdge.target
        }
      }

      result.nodes[node.id] = backendNode
    })

    // return JSON.stringify(result, null, 4)
    return result
  }

  // 2. 读取：JSON -> Vue Flow (保持不变)
  const fromBackendFormat = (jsonString, schema) => {
    let jsonData
    try {
      jsonData = JSON.parse(jsonString)
    } catch (e) {
      console.error('JSON 解析失败', e)
      return { nodes: [], edges: [], flowName: '', description: '' }
    }

    const newNodes = []
    let newEdges = []

    const rawNodes = jsonData.nodes || {}

    Object.values(rawNodes).forEach(node => {
      const ui = node._ui || { x: 0, y: 0, type: 'custom' }
      const config = schema[node.nodeCode] || {}

      const vueNode = {
        id: node.id,
        type: ui.type || 'custom',
        label: node.displayName,
        position: { x: ui.x, y: ui.y },
        parentNode: ui.parentNode,
        extent: ui.parentNode ? 'parent' : undefined,
        expandParent: !!ui.parentNode,
        style: (ui.width && ui.height) ? { width: ui.width, height: ui.height } : undefined,
        data: {
          ...node.data,
          nodeCode: node.nodeCode,
          nodeType: node.nodeType,
          iconChar: config.icon || '🧩',
          outputs: []
        }
      }
      newNodes.push(vueNode)

      // 恢复 FOR 循环组框
      if (node.nodeCode === 'cfs/mFor') {
        const groupId = `group-${node.id}`
        newNodes.push({
          id: groupId,
          type: 'group',
          position: { x: ui.x - 100, y: ui.y + 150 },
          style: { width: '400px', height: '200px', zIndex: -1 },
          data: { label: '循环体' }
        })
        // 恢复虚线连接
        newEdges.push({
          id: `link-${node.id}-${groupId}`,
          source: node.id,
          sourceHandle: 'loop-source',
          target: groupId,
          targetHandle: 'top',
          type: 'custom', // 确保这里类型和编辑器里的一致
          animated: false,
          style: { strokeDasharray: '5 5', strokeWidth: 2, stroke: '#6366f1' }
        })
      }
    })

    // 恢复普通连线
    if (jsonData._ui_meta && jsonData._ui_meta.edges) {
      newEdges = [...newEdges, ...jsonData._ui_meta.edges.map(e => ({
        ...e,
        markerEnd: MarkerType.ArrowClosed,
        type: e.type || 'custom' // 确保有默认类型
      }))]
    }

    return {
      nodes: newNodes,
      edges: newEdges,
      flowName: jsonData.case_info?.displayName,
      description: jsonData.case_info?.description || ''
    }
  }

  return { toBackendFormat, fromBackendFormat }
}