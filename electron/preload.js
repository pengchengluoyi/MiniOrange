// electron/preload.js - 完整的预加载脚本

const {contextBridge, ipcRenderer} = require('electron')
const path = require("node:path");

contextBridge.exposeInMainWorld('electronAPI', {

    minimize: () => ipcRenderer.send('window-min'),
    maximize: () => ipcRenderer.send('window-max'),
    close: () => ipcRenderer.send('window-close'),

    scanComponents: (root) => ipcRenderer.invoke('scan-components', root),
    runCase: (params) => ipcRenderer.send('run-case', params),
    onRunLog: (callback) => ipcRenderer.on('run-case-log', (_event, value) => callback(value)),
    onRunFinished: (callback) => ipcRenderer.on('run-case-finished', (_event, value) => callback(value)),
    removeRunListeners: () => {
        ipcRenderer.removeAllListeners('run-case-log')
        ipcRenderer.removeAllListeners('run-case-finished')
    },

    // 🔥 串流相关 API (新增)
    scanDevices: () => ipcRenderer.invoke('scan-devices'),
    startStream: (deviceId) => ipcRenderer.invoke('start-stream', deviceId),
    stopStream: () => ipcRenderer.send('stop-stream'),

    control: (deviceId, params) => ipcRenderer.send('device-control', {deviceId, params}),

    openExternal: (url) => ipcRenderer.invoke('open-external', url),

    // 🔥 核心修复: 暴露 invoke 方法，用于调用 ipcMain.handle 定义的接口
    invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
    getRuntimeStatus: () => ipcRenderer.invoke('get-runtime-status'),
    discoverGateways: () => ipcRenderer.invoke('discover-gateways'),
    discoverLanNodes: (timeoutMs) => ipcRenderer.invoke('discover-lan-nodes', timeoutMs),
    pairGateway: (payload) => ipcRenderer.invoke('pair-gateway', payload),
    startLanNodeWatch: () => ipcRenderer.invoke('start-lan-node-watch'),
    stopLanNodeWatch: () => ipcRenderer.invoke('stop-lan-node-watch'),
    onLanNodeAppeared: (callback) => ipcRenderer.on('lan-node-appeared', (_event, value) => callback(value)),
    removeLanNodeListeners: () => ipcRenderer.removeAllListeners('lan-node-appeared'),

    // 监听主进程消息
    on: (channel, func) => {
        // 过滤 event 对象，只传递参数
        ipcRenderer.on(channel, (event, ...args) => func(...args))
    },

    // 发送通用消息
    send: (channel, data) => ipcRenderer.send(channel, data),

    onStreamStopped: (callback) => ipcRenderer.on('stream-stopped', (_event, value) => callback(value)),
    removeStreamListeners: () => {
        ipcRenderer.removeAllListeners('stream-stopped')
    },

    start: (deviceId) => ipcRenderer.invoke('start-stream', deviceId), // 确保传递 deviceId

    // 5. 【新增】WebRecorder 路径获取辅助函数
    getRecorderPath: () => {
        // 开发环境
        if (process.env.NODE_ENV === 'development') {
            return path.resolve(process.cwd(), 'public', 'recorder-preload.js');
        }
        // 生产环境 (资源目录)
        return path.join(process.resourcesPath, 'recorder-preload.js');
    },

    // 🔥 自动更新相关 API
    onUpdateAvailable: (callback) => ipcRenderer.on('update-available', (_event, value) => callback(value)),
    onUpdateProgress: (callback) => ipcRenderer.on('update-progress', (_event, value) => callback(value)),
    onUpdateDownloaded: (callback) => ipcRenderer.on('update-downloaded', (_event, value) => callback(value)),
    startDownload: () => ipcRenderer.send('start-download'),
    quitAndInstall: () => ipcRenderer.send('quit-and-install'),

    // 🔥 全局弹窗 (替代 dialog.showMessageBox)
    onShowAlert: (callback) => ipcRenderer.on('show-alert', (_event, value) => callback(value)),
})