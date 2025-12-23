import {ref, computed, nextTick, onMounted, onUnmounted} from 'vue'
import {fetchWorkflowRun, fetchRunLog} from '@/api/workflow'

export function useFlowRun(performSave, workflowId, showLogPanel) {
    const isRunning = ref(false)
    const logs = ref([])
    const searchQuery = ref('')
    const logBodyRef = ref(null)

    // ANSI 转义码去除
    const stripAnsi = (str) => {
        if (!str) return ''
        // eslint-disable-next-line no-control-regex
        return str.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
    }

    // 日志级别解析 (Fallback: 当服务端未返回 level 时使用)
    const parseLogLevelFromText = (text) => {
        if (/\bE\b|\bError\b/i.test(text)) return 'log-error'
        if (/\bW\b|\bWarn\b/i.test(text)) return 'log-warn'
        if (/\bD\b|\bDebug\b/i.test(text)) return 'log-debug'
        if (/\bI\b|\bInfo\b/i.test(text)) return 'log-info'
        return ''
    }

    // 格式化时间 (支持 ISO 字符串)
    const formatTime = (isoStr) => {
        if (!isoStr) return new Date().toLocaleTimeString('en-GB', {hour12: false});
        const d = new Date(isoStr);
        return isNaN(d.getTime()) ? isoStr : d.toLocaleTimeString('en-GB', {hour12: false});
    }

    const addLog = (level, rawText, timestamp = null, extraData = {}) => {
        const time = formatTime(timestamp);
        const cleanText = stripAnsi(rawText);

        let levelClass = '';
        const upperLevel = String(level || '').toUpperCase();

        // 1. 优先根据 level 字段判断样式
        if (['ERROR', 'E', 'FAIL', 'FATAL'].includes(upperLevel)) levelClass = 'log-error';
        else if (['WARN', 'WARNING', 'W'].includes(upperLevel)) levelClass = 'log-warn';
        else if (['DEBUG', 'D'].includes(upperLevel)) levelClass = 'log-debug';
        else if (['INFO', 'I'].includes(upperLevel)) levelClass = 'log-info';

        // 2. 如果没有明确 level，尝试从文本解析
        if (!levelClass) {
            levelClass = parseLogLevelFromText(cleanText);
        }

        // 🔥 核心修改：展开 extraData，保留 tag, node_id 等原始字段
        logs.value.push({
            ...extraData,
            type: level || 'info',
            text: cleanText,
            time,
            levelClass
        })

        nextTick(() => {
            if (logBodyRef.value) {
                logBodyRef.value.scrollTop = logBodyRef.value.scrollHeight
            }
        })
    }

    const clearLogs = () => {
        logs.value = []
    }

    const stopRun = () => {
        if (isRunning.value) {
            isRunning.value = false
            addLog('warn', '🛑 用户手动停止轮询')
            // 🔥 手动停止：显示失败/停止状态
            if (window.electronAPI && window.electronAPI.invoke) {
                window.electronAPI.invoke('set-app-badge', 'fail');
            }
        }
    }

    const filteredLogs = computed(() => {
        if (!searchQuery.value) return logs.value;
        const q = searchQuery.value.toLowerCase();
        return logs.value.filter(log =>
            log.text.toLowerCase().includes(q) ||
            log.time.includes(q)
        )
    })

    const handleRunCase = async () => {
        if (isRunning.value) return
        const saved = await performSave();
        if (!saved) {
            addLog('error', '保存失败，无法运行');
            return
        }

        if (!workflowId.value) {
            addLog('error', '未获取到流程ID，无法运行');
            return
        }

        // 🔥 开始运行：设置 Dock 转圈/进度条
        if (window.electronAPI && window.electronAPI.invoke) {
            window.electronAPI.invoke('set-app-badge', 'running');
        }

        isRunning.value = true;
        showLogPanel.value = true;
        clearLogs();
        addLog('info', '正在请求服务端运行...')

        try {
            const res = await fetchWorkflowRun(workflowId.value)

            if (res.code !== 200) {
                throw new Error(res.message || '启动失败')
            }

            const runId = res.run_id
            addLog('info', `✅ 任务已启动 (RunID: ${runId})`)

            // --- 轮询日志逻辑 ---
            let lastLogIndex = 0
            const pollLogs = async () => {
                if (!isRunning.value) return

                try {
                    const logRes = await fetchRunLog(runId)
                    if (!isRunning.value) return
                    let currentLogs = []
                    let status = null
                    let isTaskFinished = false

                    // 🔥 适配多种后端返回结构
                    if (Array.isArray(logRes)) {
                        currentLogs = logRes
                    } else if (logRes && Array.isArray(logRes.data)) {
                        currentLogs = logRes.data
                    } else if (logRes && logRes.data && Array.isArray(logRes.data.logs)) {
                        currentLogs = logRes.data.logs
                        status = logRes.data.status
                    } else if (logRes && Array.isArray(logRes.logs)) {
                        currentLogs = logRes.logs
                        console.log(currentLogs)
                        status = logRes.status
                    }

                    if (Array.isArray(currentLogs) && currentLogs.length > lastLogIndex) {
                        const newLogs = currentLogs.slice(lastLogIndex)
                        newLogs.forEach(log => {
                            let msg = ''
                            if (typeof log === 'object' && log !== null) {
                                // 🔥 适配服务端返回的对象结构
                                msg = log.message || JSON.stringify(log)
                                const lvl = log.level || 'INFO'
                                const time = log.created_at
                                // 🔥 核心修改：将原始 log 对象传进去，防止字段丢失
                                addLog(lvl, msg, time, log)
                            } else {
                                // 兼容旧的字符串格式
                                msg = String(log)
                                addLog('info', msg)
                            }

                            // 🔥 检测结束信号: [System] end
                            if (msg && msg.includes('end')) {
                                isTaskFinished = true
                            }
                        })
                        lastLogIndex = currentLogs.length
                    }

                    // 2. 检查状态是否结束
                    if (isTaskFinished) {
                        addLog('info', '✅ 运行结束')
                        isRunning.value = false
                        // 🔥 运行成功：显示 ✅
                        if (window.electronAPI && window.electronAPI.invoke) {
                            window.electronAPI.invoke('set-app-badge', 'success');
                        }
                    } else if (status && ['finished', 'completed', 'success', 'failed', 'error', 'stopped'].includes(status.toLowerCase())) {
                        addLog('info', `任务结束: ${status}`)
                        isRunning.value = false
                        // 🔥 根据状态显示 ✅ 或 ❌
                        const isSuccess = ['finished', 'completed', 'success'].includes(status.toLowerCase());
                        if (window.electronAPI && window.electronAPI.invoke) {
                            window.electronAPI.invoke('set-app-badge', isSuccess ? 'success' : 'fail');
                        }
                    } else {
                        // 继续轮询
                        if (isRunning.value) setTimeout(pollLogs, 3000)
                    }
                } catch (e) {
                    console.error("获取日志失败", e)
                    if (isRunning.value) setTimeout(pollLogs, 5000) // 出错重试
                }
            }

            pollLogs()

        } catch (e) {
            addLog('error', `❌ 运行请求失败: ${e.message || e}`)
            isRunning.value = false
            // 🔥 请求失败：显示 ❌
            if (window.electronAPI && window.electronAPI.invoke) {
                window.electronAPI.invoke('set-app-badge', 'fail');
            }
        }
    }

    // 监听器注册
    const setupRunListeners = () => {
        if (window.electronAPI) {
            window.electronAPI.onRunLog((data) => {
                const cleanText = data.text.replace(/\r?\n$/, '');
                if (cleanText) addLog(data.type, cleanText) // Electron 模式保持原样
            })
            window.electronAPI.onRunFinished((data) => {
                isRunning.value = false;
                if (data.code === 0) {
                    addLog('info', '✅ 运行成功完成');
                    if (window.electronAPI.invoke) window.electronAPI.invoke('set-app-badge', 'success');
                }
                else {
                    addLog('error', `❌ 运行异常结束 (Exit Code: ${data.code})`)
                    if (window.electronAPI.invoke) window.electronAPI.invoke('set-app-badge', 'fail');
                }
            })
        }
    }

    const removeRunListeners = () => {
        if (window.electronAPI) window.electronAPI.removeRunListeners()
    }

    return {
        isRunning,
        logs,
        searchQuery,
        logBodyRef,
        filteredLogs,
        handleRunCase,
        stopRun,
        clearLogs,
        setupRunListeners,
        removeRunListeners
    }
}