import {ref, nextTick} from 'vue'
import {useVueFlow} from '@vue-flow/core'
import dagre from 'dagre'

export function useGraphOperations(isPickingMode, showSelector, selectorStyle) {
    const {
        addNodes,
        removeNodes,
        addEdges,
        removeEdges,
        findNode,
        findEdge,
        getNodes,
        getEdges,
        setNodes,
        fitView,
        updateNode
    } = useVueFlow()

    const pendingAction = ref(null)

    // 1. 检查连线有效性
    const checkConnection = (connection) => {
        if (isPickingMode.value) return false
        const sourceNode = findNode(connection.source);
        const targetNode = findNode(connection.target);
        if (!sourceNode || !targetNode) return false;

        // 允许的连接逻辑
        if (connection.sourceHandle === 'right' && connection.targetHandle === 'left') return true
        if ((connection.sourceHandle === 'loop-source' || connection.sourceHandle.startsWith('branch-') || connection.sourceHandle === 'else') && connection.targetHandle === 'left') return true
        if (connection.sourceHandle === 'left' && connection.targetHandle === 'right') return true
        return false
    }

    // 2. 自动布局 (Dagre)
    const layoutGraph = (direction = 'LR') => {
        if (isPickingMode.value) return
        const g = new dagre.graphlib.Graph({compound: true});
        g.setGraph({rankdir: direction, nodesep: 100, ranksep: 140});
        g.setDefaultEdgeLabel(() => ({}));

        // 排除临时节点
        getNodes.value.forEach(node => {
            if (node.id.includes('temp_draft')) return;
            const width = node.dimensions?.width || 240;
            const height = node.dimensions?.height || 100;
            g.setNode(node.id, {width, height});
            if (node.parentNode) g.setParent(node.id, node.parentNode)
        });

        const sortedEdges = [...getEdges.value].sort((a, b) => {
            const getWeight = (h) => {
                if (!h) return 999;
                if (h === 'right') return 0;
                if (h === 'else') return 100;
                if (h.startsWith('branch-')) return parseInt(h.split('-')[1]) + 1;
                return 999
            };
            if (a.source === b.source) return getWeight(a.sourceHandle) - getWeight(b.sourceHandle);
            return 0
        })

        sortedEdges.forEach(edge => {
            if (edge.sourceHandle !== 'loop-source') g.setEdge(edge.source, edge.target)
        });
        dagre.layout(g);

        getNodes.value.forEach(node => {
            if (node.id.includes('temp_draft')) return;
            const pos = g.node(node.id);
            const w = node.dimensions?.width || 240;
            const h = node.dimensions?.height || 100;
            if (node.parentNode) {
                const parentPos = g.node(node.parentNode);
                node.position = {x: pos.x - parentPos.x - (w / 2), y: pos.y - parentPos.y - (h / 2)}
            } else {
                node.position = {x: pos.x - (w / 2), y: pos.y - (h / 2)}
            }
            if (node.type === 'group') {
                node.style = {width: `${pos.width + 100}px`, height: `${pos.height + 100}px`}
            }
        });

        getEdges.value.forEach(edge => {
            if (edge.sourceHandle === 'loop-source') {
                const loopNode = findNode(edge.source);
                const groupNode = findNode(edge.target);
                if (loopNode && groupNode) groupNode.position = {
                    x: loopNode.position.x - 100,
                    y: loopNode.position.y + 150
                }
            }
        })
        setNodes([...getNodes.value]);
        setTimeout(() => fitView({padding: 0.2}), 50)
    }

    // 3. 处理分割线添加节点事件
    const handleSplitEdge = (e) => {
        if (isPickingMode.value) return
        const {edgeId, source, target, sourceHandle, targetHandle} = e.detail
        const edge = findEdge(edgeId);
        if (edge && edge.data?.isLoopLink) return
        const sourceNode = findNode(source);
        const targetNode = findNode(target);
        if (!sourceNode || !targetNode) return

        const midX = (sourceNode.position.x + targetNode.position.x) / 2;
        const midY = (sourceNode.position.y + targetNode.position.y) / 2

        pendingAction.value = {
            type: 'insert',
            edgeId,
            source: {id: source, handle: sourceHandle},
            target: {id: target, handle: targetHandle},
            position: {x: midX, y: midY}
        }
        showSelector.value = true
    }

    const createLoopBody = async (parentId, position) => {
        const groupId = `group-${parentId}`;
        addNodes([{
            id: groupId,
            type: 'group',
            position: {x: position.x - 100, y: position.y + 150},
            style: {width: '400px', height: '200px', zIndex: -1},
            data: {label: '循环体'}
        }]);
        setTimeout(() => {
            addEdges([{
                id: `link-${parentId}-${groupId}`,
                source: parentId,
                sourceHandle: 'loop-source',
                target: groupId,
                targetHandle: 'top',
                type: 'custom',
                animated: false,
                selectable: false,
                deletable: false,
                data: {isLoopLink: true},
                style: {strokeDasharray: '5 5', strokeWidth: 2, stroke: '#6366f1'}
            }])
        }, 100)
    }

    // 4. 处理节点选择（添加/替换/插入）
    const handleNodeSelection = async (item) => {
        const action = pendingAction.value;
        if (!action) return
        let idPrefix = 'node';
        if (item.code) {
            const parts = item.code.split('/');
            idPrefix = parts.length >= 2 ? `${parts[0]}-${parts[1]}` : parts[0]
        }
        const newNodeId = `${idPrefix}-${Date.now()}`;
        const newNodeLabel = item.name || '新节点';
        const isIfNode = item.code === 'cfs/mIf'
        const schemaDefaults = item.defaultData ? JSON.parse(JSON.stringify(item.defaultData)) : {}
        if (isIfNode && !schemaDefaults.conditions) schemaDefaults.conditions = [{left: '', op: '=', right: ''}]
        const newNode = {
            id: newNodeId,
            type: isIfNode ? 'if' : 'custom',
            label: newNodeLabel,
            position: action.position,
            data: {
                ...schemaDefaults,
                iconChar: item.icon,
                inputs: item.inputs,
                outputs: item.outputs,
                nodeCode: item.code,
                nodeType: item.type
            }
        }

        if (action.type === 'replace-temp') {
            const refId = action.direction === 'backward' ? action.targetId : action.sourceId;
            const refNode = findNode(refId)
            if (refNode) {
                if (refNode.type === 'group') {
                    const relX = action.position.x - refNode.position.x;
                    const relY = action.position.y - refNode.position.y;
                    newNode.parentNode = refNode.id;
                    newNode.position = {x: relX, y: relY};
                    newNode.expandParent = true
                } else if (refNode.parentNode) {
                    const parentGroup = findNode(refNode.parentNode);
                    if (parentGroup) {
                        const relX = action.position.x - parentGroup.position.x;
                        const relY = action.position.y - parentGroup.position.y;
                        newNode.parentNode = parentGroup.id;
                        newNode.position = {x: relX, y: relY};
                        newNode.expandParent = true
                    }
                }
            }
            addNodes([newNode]);
            await nextTick();
            removeNodes([action.tempNodeId])
            if (action.direction === 'backward') {
                const newSourceHandle = isIfNode ? 'branch-0' : 'right';
                addEdges([{
                    source: newNodeId,
                    sourceHandle: newSourceHandle,
                    target: action.targetId,
                    targetHandle: action.targetHandle,
                    type: 'custom',
                    animated: false,
                    style: {stroke: '#6366f1', strokeWidth: 2}
                }])
            } else {
                addEdges([{
                    source: action.sourceId,
                    sourceHandle: action.sourceHandle,
                    target: newNodeId,
                    targetHandle: 'left',
                    type: 'custom',
                    animated: false,
                    style: {stroke: '#6366f1', strokeWidth: 2}
                }])
            }
        } else if (action.type === 'insert') {
            const sourceNode = findNode(action.source.id);
            if (sourceNode.parentNode) {
                const parentGroup = findNode(sourceNode.parentNode);
                const relX = action.position.x - parentGroup.position.x;
                const relY = action.position.y - parentGroup.position.y;
                newNode.parentNode = parentGroup.id;
                newNode.position = {x: relX, y: relY};
                newNode.expandParent = true
            }
            addNodes([newNode]);
            await nextTick();
            removeEdges([action.edgeId])
            const newSourceHandle = isIfNode ? 'branch-0' : 'right'
            addEdges([{
                id: `e-ins-1-${Date.now()}`,
                source: action.source.id,
                sourceHandle: action.source.handle || 'right',
                target: newNodeId,
                targetHandle: 'left',
                type: 'custom',
                animated: false,
                style: {stroke: '#6366f1', strokeWidth: 2}
            }, {
                id: `e-ins-2-${Date.now()}`,
                source: newNodeId,
                sourceHandle: newSourceHandle,
                target: action.target.id,
                targetHandle: action.target.handle || 'left',
                type: 'custom',
                animated: false,
                style: {stroke: '#6366f1', strokeWidth: 2}
            }])
            setTimeout(() => {
                layoutGraph('LR')
            }, 100)
        } else if (action.type === 'add-standalone') {
            newNode.position = action.position;
            addNodes([newNode])
        }
        if (item.name === 'FOR循环') {
            await createLoopBody(newNodeId, action.position)
        }
        showSelector.value = false;
        pendingAction.value = null
    }

    return {
        pendingAction,
        checkConnection,
        layoutGraph,
        handleSplitEdge,
        handleNodeSelection
    }
}