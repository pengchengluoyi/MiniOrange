// /Users/cpc/code/AutobotsWorkFlow/src/views/WorkflowEditor/composables/useFlowPersistence.js
import {ref, watch} from 'vue'
import {useFlowAdapter} from '../../../utils/useFlowAdapter' // 注意路径回退两层
import {fetchWorkflowAdd, fetchWorkflowDetail, fetchWorkflowSave} from '@/api/workflow'

export function useFlowPersistence(getNodes, getEdges, setNodes, setEdges, flowName, flowDescription, dynamicSchema) {
    const isSaving = ref(false)
    const isModified = ref(false)
    const saveStatus = ref('就绪')
    const workflowId = ref(null) // 🔥 新增：用于存储当前流程的数据库 ID

    // 🔥 1. 新增：单独存储时间，方便 Toolbar 显示
    const lastSavedTime = ref('--:--:--')
    const {toBackendFormat, fromBackendFormat} = useFlowAdapter()

    const updateSaveStatus = () => {
        // 🔥 2. 修改：更新 lastSavedTime
        const timeStr = new Date().toLocaleTimeString()
        lastSavedTime.value = timeStr
        saveStatus.value = `已保存 ${timeStr}` // 保持旧逻辑兼容
    }

    const performSave = async () => {
        if (isSaving.value) return false
        if (!flowName.value) flowName.value = `${Date.now()}`

        const jsonString = toBackendFormat(getNodes.value, getEdges.value, flowName.value, flowDescription.value)
        
        // 🔥 数据清洗：移除 case_info，扁平化 nodes 结构
        let payloadNodes = {}
        try {
            const rawData = typeof jsonString === 'string' ? JSON.parse(jsonString) : jsonString
            // rawData 结构: { case_info: {...}, nodes: {...}, _ui_meta: {...} }
            // 目标结构: { ...nodes, _ui_meta: ... }
            if (rawData && rawData.nodes) {
                payloadNodes = {
                    ...rawData.nodes,
                    _ui_meta: rawData._ui_meta
                }
            } else {
                payloadNodes = rawData
            }

            // 🔥 数据清洗：移除 schema 定义 (inputs/outputs)，将 platform 移动到节点根层级
            for (const key in payloadNodes) {
                if (key === '_ui_meta') continue
                const node = payloadNodes[key]
                if (node.data) {
                    if (node.data.inputs) delete node.data.inputs
                    if (node.data.outputs) delete node.data.outputs

                    // 🔥 清理运行时状态字段 (不需要保存到数据库)
                    delete node.data.runStatus
                    delete node.data.runMessage
                    delete node.data.code
                    delete node.data.timestamp

                    // 🔥 优化 interactions 存储：只保留被引用的热区，并精简字段 (用于显示缩略图)
                    if (node.data.interactions && Array.isArray(node.data.interactions)) {
                        // 1. 扫描所有已知字段，收集被引用的 interaction ID
                        const usedIds = new Set()
                        if (node.data.interaction_id) usedIds.add(node.data.interaction_id)
                        if (node.data.anchor_interaction_id) usedIds.add(node.data.anchor_interaction_id)
                        // 如果未来有更多引用字段，在这里添加

                        // 2. 过滤并重构
                        const keptInteractions = node.data.interactions
                            .filter(i => (i.id && usedIds.has(i.id)) || (i.uid && usedIds.has(i.uid)))
                            .map(i => ({
                                // 🔥 只保留 UI 显示缩略图和标签所需的最少字段
                                id: i.id || i.uid,
                                label: i.label,
                                x: i.x, y: i.y, w: i.w, h: i.h,
                                screenshot: i.screenshot,
                                naturalSize: i.naturalSize,
                                sourceNodeId: i.sourceNodeId
                            }))
                        
                        if (keptInteractions.length > 0) {
                            node.data.interactions = keptInteractions
                        } else {
                            delete node.data.interactions
                        }
                    }

                    if (node.data.platform) {
                        node.platform = node.data.platform
                    }
                }
            }
        } catch (e) {
            console.error("JSON parse error", e)
            payloadNodes = {}
        }

        isSaving.value = true
        saveStatus.value = '保存中...'

        try {
            let res;

            // 🔥 2. 核心逻辑：有 ID 调更新，没 ID 调新增
            if (workflowId.value) {
                console.log(`[Save] 正在更新 ID: ${workflowId.value}`)
                res = await fetchWorkflowSave(
                    workflowId.value,
                    flowName.value,
                    flowDescription.value || "",
                    payloadNodes
                )
            } else {
                console.log(`[Save] 正在新建流程...`)
                res = await fetchWorkflowAdd(
                    flowName.value,
                    flowDescription.value || "",
                    payloadNodes
                )
            }

            // 🔥 修复：兼容 res.data.id (常见后端结构) 和 res.id
            const newId = res?.data?.id || res?.id
            if (!workflowId.value && newId) {
                workflowId.value = newId
                console.log(`[Save] 新建成功，绑定 ID: ${workflowId.value}`)
            }

            updateSaveStatus()
            isSaving.value = false
            isModified.value = false
            return true
        } catch (e) {
            console.error("保存出错:", e)
            saveStatus.value = '保存失败'
            isSaving.value = false
            return false
        }
    }

    const loadFlowFromId = async (id) => {
        if (!id) return false

        try {
            const res = await fetchWorkflowDetail(id)
            const data = res.data // 假设后端返回结构 { code: 200, data: { ... } }

            if (data) {
                workflowId.value = data.id
                flowName.value = data.name
                flowDescription.value = data.desc

                // 解析 nodes (兼容旧版 content 字段)
                let nodesData = data.nodes || data.content || {}
                if (typeof nodesData === 'string') {
                    try {
                        nodesData = JSON.parse(nodesData)
                    } catch (e) {
                        nodesData = {}
                    }
                }

                // 🔥 修复：如果 nodesData 包含 nodes 数组 (CaseEditor 保存的格式)，需要提取并转换为对象
                if (nodesData && nodesData.nodes && Array.isArray(nodesData.nodes)) {
                    const normalizedNodes = {}
                    nodesData.nodes.forEach(n => {
                        if (n.id) normalizedNodes[n.id] = n
                    })
                    // 保留 _ui_meta
                    if (nodesData._ui_meta) normalizedNodes._ui_meta = nodesData._ui_meta
                    nodesData = normalizedNodes
                }

                // 重构为适配器需要的完整结构 (补回 case_info 和嵌套 nodes)
                // 此时 nodesData 结构: { node1: {}, node2: {}, _ui_meta: {} }
                const { _ui_meta, ...restNodes } = nodesData
                
                // 🔥 数据还原：将根层级的 platform 移回 data.platform (供前端使用)
                for (const key in restNodes) {
                    const node = restNodes[key]
                    if (node.platform) {
                        if (!node.data) node.data = {}
                        node.data.platform = node.platform
                    }
                }

                const adapterData = {
                    case_info: {
                        displayName: data.name,
                        description: data.desc
                    },
                    nodes: restNodes,
                    _ui_meta: _ui_meta
                }

                const jsonString = JSON.stringify(adapterData)

                const {nodes, edges} = fromBackendFormat(jsonString, dynamicSchema.value)

                setNodes(nodes)
                setEdges(edges)
                return true
            }
        } catch (e) {
            console.error('加载流程失败:', e)
            return false
        }
        return false
    }

    // 自动保存监听
    let saveTimer = null
    // 监听需要在组件里传入的 reactive 数据，或者在这里建立 watch
    // 为了解耦，我们在 index.vue 里建立 watch 会更灵活，或者提供一个 setupAutoSave 函数
    const setupAutoSave = (elementsRef) => {
        watch([elementsRef, flowName, flowDescription], () => {
            isModified.value = true
            saveStatus.value = '修改中...'
            if (saveTimer) clearTimeout(saveTimer)
            saveTimer = setTimeout(() => {
                performSave().catch(e => console.warn("自动保存失败", e))
            }, 3000)
        }, {deep: true})
    }

    return {
        isSaving,
        isModified,
        saveStatus,
        lastSavedTime,
        workflowId,
        performSave,
        loadFlowFromId,
        setupAutoSave
    }
}