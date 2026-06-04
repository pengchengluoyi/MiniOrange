import { ref, computed, nextTick } from 'vue'
import { fetchRunLog, fetchWorkflowRun } from '@/api/workflow'
import { fetchRunReport } from '@/api/workflow_run'

export const resetNodeStatus = (elements) => {
    if (!elements || !elements.value) return
    elements.value = elements.value.map(node => ({
        ...node,
        data: {
            ...node.data,
            runStatus: 'idle',
            runMessage: null,
            code: null,
            timestamp: null
        }
    }))
}

export function useFlowRun(performSave, workflowId, showLogPanel, elements) {
    const isRunning = ref(false)
    const logs = ref([])
    const searchQuery = ref('')
    const logBodyRef = ref(null)
    let lastLogIndex = 0 // 🔥 记录已处理日志的位置

    const stripAnsi = (str) => {
        if (!str) return ''
        return str.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
    }

    const formatTime = (isoStr) => {
        if (!isoStr) return new Date().toLocaleTimeString('en-GB', { hour12: false });
        const d = new Date(isoStr);
        return isNaN(d.getTime()) ? isoStr : d.toLocaleTimeString('en-GB', { hour12: false });
    }

    // 🔥 必须在使用前定义
    const filteredLogs = computed(() => {
        if (!searchQuery.value) return logs.value;
        const q = searchQuery.value.toLowerCase();
        return logs.value.filter(log =>
            log.text.toLowerCase().includes(q) || log.time.toLowerCase().includes(q)
        )
    })

    const addLog = (level, rawText, timestamp = null, extraData = {}) => {
        const time = formatTime(timestamp);
        const cleanText = stripAnsi(rawText);
        let levelClass = '';
        const upperLevel = String(level || '').toUpperCase();
        if (['ERROR', 'E', 'FAIL', 'FATAL'].includes(upperLevel)) levelClass = 'log-error';
        else if (['WARN', 'WARNING', 'W'].includes(upperLevel)) levelClass = 'log-warn';
        else if (['DEBUG', 'D'].includes(upperLevel)) levelClass = 'log-debug';
        else if (['INFO', 'I'].includes(upperLevel)) levelClass = 'log-info';

        logs.value.push({ ...extraData, type: level || 'info', text: cleanText, time, levelClass })
        nextTick(() => { if (logBodyRef.value) logBodyRef.value.scrollTop = logBodyRef.value.scrollHeight })
    }

    const clearLogs = () => { logs.value = []; lastLogIndex = 0; }

    const pollLogs = async (runId) => {
        if (!isRunning.value) return
        try {
            const logRes = await fetchRunLog(runId)

            // 🔥 核心修正：根据控制台截图，logRes 本身就是数组
            let currentLogs = Array.isArray(logRes) ? logRes : (logRes?.data || logRes?.logs || [])
            let status = logRes?.status || logRes?.data?.status

            if (currentLogs.length > lastLogIndex) {
                const newLogs = currentLogs.slice(lastLogIndex)
                newLogs.forEach(log => {
                    const msg = typeof log === 'object' ? (log.message || '') : String(log)
                    addLog(log.level || 'INFO', msg, log.created_at, log)
                })
                lastLogIndex = currentLogs.length
            }

            // 检查结束状态
            const isFinished = status && ['finished', 'success', 'failed', 'error'].includes(status.toLowerCase())
            if (!isFinished && isRunning.value) {
                setTimeout(() => pollLogs(runId), 2000)
            }
        } catch (e) {
            console.error("日志轮询异常", e)
            if (isRunning.value) setTimeout(() => pollLogs(runId), 5000)
        }
    }

    const startStatusPolling = (runId) => {
        if (!runId || runId === 'undefined') return
        let retryCount = 0
        const timer = setInterval(async () => {
            if (!isRunning.value) return clearInterval(timer)
            try {
                const res = await fetchRunReport(runId)
                retryCount = 0 // 成功获取响应（哪怕是404以外的错误）则重置计数
                if (res?.code === 200) {
                    const summary = res.data?.result_summary || {}
                    elements.value = elements.value.map(node => {
                        const runInfo = summary[node.id]
                        if (runInfo) {
                            return {
                                ...node,
                                data: {
                                    ...node.data,
                                    runStatus: runInfo.success ? 'success' : 'failure',
                                    runMessage: runInfo.message,
                                    code: runInfo.code,
                                    timestamp: runInfo.timestamp
                                }
                            }
                        }
                        return node
                    })

                    if (res.data?.end_time) {
                        clearInterval(timer)
                        isRunning.value = false
                        if (window.electronAPI?.invoke) {
                            window.electronAPI.invoke('set-app-badge', res.data.success === "success" ? 'success' : 'fail');
                        }
                    }
                } else if (res?.code === 404) {
                    // 🔥 修复：如果 404，说明任务可能还没创建好或者已经清理，暂时忽略，不要报错停止
                    // 但如果连续多次 404，可能需要停止轮询。这里简单处理：不停止，等待下一次
                    console.warn(`Run report not found for ${runId}, retrying...`)
                }
            } catch (err) { 
                // 🔥 修复：捕获 404 错误，避免控制台刷屏
                if (err.response && err.response.status === 404) {
                     retryCount++
                     if (retryCount > 10) {
                         console.error(`Run report not found (404) for ${runId} after timeout. Stopping.`)
                         clearInterval(timer)
                         isRunning.value = false
                         return
                     }
                     console.warn(`Run report not found (404) for ${runId}, retrying (${retryCount}/10)...`)
                } else {
                    console.error('状态轮询失败', err) 
                }
            }
        }, 1500)
    }

    const handleRunCase = async (snOrPayload, envProfileArg) => {
        let sn = snOrPayload
        let envProfile = envProfileArg
        if (snOrPayload && typeof snOrPayload === 'object') {
            sn = snOrPayload.sn
            envProfile = snOrPayload.envProfile ?? snOrPayload.env_profile
        }
        if (!sn) {
            console.warn('handleRunCase called without SN!')
        }
        if (isRunning.value) return
        resetNodeStatus(elements)
        const saved = await performSave()
        if (!saved || !workflowId.value) return

        isRunning.value = true
        showLogPanel.value = true
        clearLogs()
        addLog('info', '正在请求服务端运行...')

        try {
            const res = await fetchWorkflowRun(workflowId.value, sn, envProfile)
            if (res.code === 200 && res.run_id) {
                addLog('info', `✅ 任务已启动 (ID: ${res.run_id})`)
                pollLogs(res.run_id)
                startStatusPolling(res.run_id)
            } else { throw new Error(res.message || '启动失败') }
        } catch (e) {
            addLog('error', `❌ 失败: ${e.message}`); isRunning.value = false
        }
    }

    const setupRunListeners = () => {
        if (window.electronAPI) {
            window.electronAPI.onRunLog((data) => addLog(data.type, data.text.trim()))
            window.electronAPI.onRunFinished(() => isRunning.value = false)
        }
    }

    const removeRunListeners = () => { if (window.electronAPI) window.electronAPI.removeRunListeners() }

    return {
        isRunning, logs, searchQuery, logBodyRef, filteredLogs,
        handleRunCase, clearLogs, setupRunListeners, removeRunListeners,
        stopRun: () => { isRunning.value = false }
    }
}