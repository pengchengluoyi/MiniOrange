// electron/main.js - 完整的 Electron 主进程代码 (使用纯 JS 实现 scrcpy 转发)

const {app, BrowserWindow, ipcMain, dialog} = require('electron')
const path = require('path')

const {AdbDaemonWebSocket} = require('@yume-chan/adb');
const {ScrcpyClient} = require('@yume-chan/scrcpy');
const fs = require('fs')
const {spawn} = require('child_process')
const {WebSocketServer} = require('ws') // 需要 npm install ws
const net = require('net')                  // Node.js 内置 TCP 库

// --- 串流配置 ---
let currentStreamingProcess = null      // scrcpy server shell 进程
let currentAdbForwardProcess = null     // ADB 转发管理进程 (用于清理)
let wsServer = null                     // WebSocket 服务器实例
let scrcpySocket = null                 // 用于接收 H264 数据的 TCP Socket
let controlSocket = null                // 🔥 新增：用于发送控制指令的 TCP Socket
let mainWindow = null                   // 🔥 全局主窗口引用
let wsClient = null                     // 🔥 新增：当前活跃的 WebSocket 客户端
let connectionTimeout = null            // 🔥 新增：连接延迟定时器
const STREAM_PORT = 8888                // ADB 转发使用的本地端口
const WS_PORT = STREAM_PORT + 1         // WebSocket 服务器使用的端口 (8889)
const SCRCPY_VERSION = '3.3.3'            // 根据你下载的 jar 包版本修改
// !!! 请确保该路径下的文件存在 !!!
const SCRCPY_SERVER_PATH = app.isPackaged 
    ? path.join(process.resourcesPath, 'tools', `scrcpy-server-v${SCRCPY_VERSION}.jar`)
    : path.join(__dirname, `../tools/scrcpy-server-v${SCRCPY_VERSION}.jar`);

// 🔥 新增：获取 ADB 可执行文件路径
const getAdbPath = () => {
    const isWin = process.platform === 'win32';
    const execName = isWin ? 'adb.exe' : 'adb';
    
    if (app.isPackaged) {
        // 生产环境：resources/platform-tools/adb(.exe)
        return path.join(process.resourcesPath, 'platform-tools', execName);
    }
    
    // 开发环境：尝试查找本地 tools 目录，如果没有则回退到全局 adb
    const localDevPath = path.join(__dirname, '../tools/platform-tools', isWin ? 'win' : 'mac', execName);
    if (fs.existsSync(localDevPath)) return localDevPath;
    return 'adb'; // 回退到全局 PATH
}

// // 🔥 1. 开启远程调试端口
// // 这行代码必须在 app 'ready' 之前执行
// app.commandLine.appendSwitch('remote-debugging-port', '9222')
//
// // 允许 HTTP 访问调试接口 (可选，但在某些环境下有帮助)
// app.commandLine.appendSwitch('remote-allow-origins', '*')

let pyProc = null;

const startPythonService = () => {
    let executablePath;
    let cwdPath; // Current Working Directory (工作目录)

    const isWin = process.platform === 'win32';
    if (app.isPackaged) {
        // 【生产环境】
        // 路径：安装目录/resources/py_service/api.exe
        const basePath = path.join(process.resourcesPath, 'services');
        // 🔥 修复：Windows 必须显式加上 .exe 后缀，否则 fs.existsSync 会失败
        executablePath = path.join(basePath, isWin ? 'main.exe' : 'main');
        cwdPath = basePath; // 设置工作目录为该文件夹，方便 Python 读取同级目录下的 config.json
    } else {
        // 【开发环境】
        // 路径：项目根目录/py_service/api.exe
        // 假设 main.js 在 src 目录下，需要回退一级 '../py_service'
        const basePath = path.join(__dirname, '../services/main');
        executablePath = path.join(basePath, 'main');
        cwdPath = basePath;
    }

    console.log('启动 Python 服务:', executablePath);

    if (!fs.existsSync(executablePath)) {
        console.error(`❌ Python 服务可执行文件不存在: ${executablePath}`);
        return;
    }

    // 启动进程
    pyProc = spawn(executablePath, [], {
        detached: false,
        cwd: cwdPath // 【重要】设置工作目录，确保 Python 能找到它旁边的依赖文件
    });

    pyProc.stdout.on('data', (data) => {
        const msg = data.toString();
        console.log('Py Log:', msg);
        // 转发日志到前端控制台，方便调试
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('py-service-log', { type: 'stdout', text: msg });
        }
    });
    pyProc.stderr.on('data', (data) => {
        const msg = data.toString();
        console.error('Py Err:', msg);
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('py-service-log', { type: 'stderr', text: msg });
        }
    });
    pyProc.on('error', (err) => {
        console.error('❌ Python 服务启动失败:', err);
    });
    pyProc.on('close', (code) => {
        console.log(`Python 服务退出，代码: ${code}`);
    });
};

function createWindow() {
    const win = new BrowserWindow({
        width: 1400,
        height: 900,
        // Windows/Linux 窗口图标
        icon: app.isPackaged
            ? path.join(process.resourcesPath, 'icon.ico')
            : path.join(__dirname, '../public/icon.ico'),

        // 🔥 核心设置：无边框模式
        frame: false,
        titleBarStyle: 'hidden',
        trafficLightPosition: {x: 12, y: 18},
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: true,
            contextIsolation: true,
            webSecurity: false,
            webviewTag: true,        // 【关键】：必须设置为 true
        }
    })
    mainWindow = win // 🔥 保存引用

    if (process.env.VITE_DEV_SERVER_URL) {
        win.loadURL(process.env.VITE_DEV_SERVER_URL)
        // win.webContents.openDevTools() // 可以打开 DevTools 调试
    } else {
        win.loadFile(path.join(__dirname, '../dist/index.html'))
    }

    // 🔥 macOS 专属：强制设置 Dock 图标
    if (process.platform === 'darwin') {
        const iconPath = app.isPackaged 
            ? path.join(process.resourcesPath, 'icon.icns')
            : path.join(__dirname, '../public/icon.icns');
        
        // 确保文件存在再设置，避免报错
        if (fs.existsSync(iconPath)) {
            app.dock.setIcon(iconPath);
        }
    }
}

// ----------------------------------------------------
// IPC 处理器 (只保留与串流相关的部分，其他保持不变)
// ----------------------------------------------------
app.whenReady().then(() => {
    startPythonService()

    // 6. 🔥🔥 运行测试用例 (修复模块导入问题) 🔥🔥
// 6. 🔥🔥 运行测试用例 (修复：优先使用 .venv 虚拟环境) 🔥🔥
    ipcMain.on('run-case', (event, {rootPath, filename}) => {
        if (!rootPath) {
            event.reply('run-case-log', {type: 'error', text: '❌ 未指定项目根目录'})
            event.reply('run-case-finished', {code: 1})
            return
        }

        // 1. 确定脚本路径
        const scriptPath = path.join(rootPath, 'framework/api/actuator.py')

        if (!fs.existsSync(scriptPath)) {
            event.reply('run-case-log', {type: 'error', text: `❌ 找不到执行脚本: ${scriptPath}`})
            event.reply('run-case-finished', {code: 1})
            return
        }

        // 2. 🔥🔥 核心修复：探测并使用 .venv 虚拟环境 🔥🔥
        const isWin = process.platform === 'win32'
        const venvPythonPath = isWin
            ? path.join(rootPath, '.venv', 'Scripts', 'python.exe')
            : path.join(rootPath, '.venv', 'bin', 'python')

        // 🔥 修复：默认回退逻辑优化
        // 如果用户电脑没有 Python，这里必须尝试寻找我们随包分发的独立 Python (如果有的话)
        // 否则在 Windows 上 'python3' 通常不存在，应该是 'python'
        let pythonExecutable = isWin ? 'python' : 'python3' 
        let envSource = 'System Global'

        // 1. 优先检测项目内的 .venv (开发者模式)
        if (fs.existsSync(venvPythonPath)) {
            pythonExecutable = venvPythonPath
            envSource = 'Local .venv'
        } else {
            // 2. (可选) 检测应用内置的 Portable Python (如果你决定打包一个独立 Python 解释器)
            // 假设你把 python 放在 resources/python_runtime 下
            const bundledPython = path.join(process.resourcesPath, 'python_runtime', isWin ? 'python.exe' : 'bin/python3');
            if (app.isPackaged && fs.existsSync(bundledPython)) {
                pythonExecutable = bundledPython;
                envSource = 'Bundled Runtime';
            } else {
                // 3. 最后尝试系统环境变量
                event.reply('run-case-log', {type: 'info', text: `⚠️ 未检测到 .venv 或内置运行时，尝试使用系统 ${pythonExecutable}...`})
            }
        }

        event.reply('run-case-log', {type: 'info', text: `🐍 Python 环境: ${envSource}`})
        
        // 🔥 警告：如果 envSource 是 System Global 且用户没安装 Python，下面的 spawn 会报错
        event.reply('run-case-log', {
            type: 'info',
            text: `🚀 开始执行: ${pythonExecutable} "${scriptPath}" "${filename}"`
        })

        // 3. 启动子进程
        const pythonProcess = spawn(pythonExecutable, ['-u', scriptPath, filename], {
            cwd: rootPath,
            env: {
                ...process.env,
                PYTHONUNBUFFERED: '1', // 强制无缓冲，让日志实时输出
                PYTHONPATH: rootPath   // 确保能 import framework
            }
        })

        // 4. 日志处理
        pythonProcess.stdout.on('data', (data) => {
            event.reply('run-case-log', {type: 'stdout', text: data.toString()})
        })

        pythonProcess.stderr.on('data', (data) => {
            event.reply('run-case-log', {type: 'stderr', text: data.toString()})
        })

        pythonProcess.on('close', (code) => {
            event.reply('run-case-log', {type: 'info', text: `🏁 执行结束，退出码: ${code}`})
            event.reply('run-case-finished', {code})
        })

        pythonProcess.on('error', (err) => {
            event.reply('run-case-log', {type: 'error', text: `❌ 进程启动失败: ${err.message}`})
            event.reply('run-case-finished', {code: 1})
        })
    })
    createWindow()

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
})

// 7. 扫描 Android 设备 (使用 ADB) - 保持不变
ipcMain.handle('scan-devices', async () => {
    return new Promise((resolve, reject) => {
        const adbProcess = spawn(getAdbPath(), ['devices', '-l'])
        let output = ''
        let error = ''
        adbProcess.stdout.on('data', (data) => {
            output += data.toString()
        })
        adbProcess.stderr.on('data', (data) => {
            error += data.toString()
        })
        adbProcess.on('close', (code) => {
            if (code !== 0) return reject(new Error(`ADB 命令失败: ${error}`));
            const lines = output.trim().split('\n').slice(1)
            const devices = lines
                .map(line => {
                    const parts = line.split(/\s+/);
                    if (parts.length < 2 || parts[1] !== 'device') return null;
                    const id = parts[0];
                    const modelMatch = line.match(/model:(\S+)/);
                    const model = modelMatch ? modelMatch[1] : 'Unknown Device';
                    return {id, model};
                })
                .filter(Boolean);
            resolve(devices);
        })
        adbProcess.on('error', (err) => {
            reject(new Error(`无法启动 ADB 进程: ${err.message}`));
        });
    })
})

// ----------------------------------------------------
// 8. 启动 scrcpy 转发服务 (纯 JS 实现)
// ----------------------------------------------------
// 在主进程的 start-stream 处理器中，修复 scrcpy 启动命令
// 在主进程中修复 scrcpy 启动命令
// 在主进程中修改 scrcpy 启动命令
ipcMain.handle('start-stream', async (event, deviceId) => {
    const mainWindow = BrowserWindow.fromWebContents(event.sender);
    ipcMain.emit('stop-stream', null, mainWindow);

    if (!fs.existsSync(SCRCPY_SERVER_PATH)) {
        throw new Error(`找不到 scrcpy 服务端 JAR 包: ${SCRCPY_SERVER_PATH}. 请检查路径和文件名!`);
    }

    console.log(`[Main] 开始为设备 ${deviceId} 启动串流服务...`);

    try {
        // 🔥 0. 清理设备上残留的 scrcpy-server 进程 (防止资源占用)
        try {
            await new Promise(resolve => {
                // 使用 pkill 杀掉之前的 server 实例
                const killProc = spawn(getAdbPath(), ['-s', deviceId, 'shell', 'pkill', '-f', 'com.genymobile.scrcpy.Server']);
                killProc.on('close', resolve);
                killProc.on('error', resolve);
            });
        } catch (e) {}

        // 🔥 生成随机 SCID (防止 Address already in use)
        // Scrcpy 使用 scid 生成 socket 名称: scrcpy_%08x
        const scid = Math.floor(Math.random() * 0x7FFFFFFF); // 生成随机正整数
        const scidHex = scid.toString(16).padStart(8, '0'); // 转为 8位 16进制字符串
        const socketName = `scrcpy_${scidHex}`;
        console.log(`[Main] 使用随机 SCID: ${scid} (Socket: ${socketName})`);

        // 1. ADB 端口转发
        console.log(`[Main] 启动 ADB 端口转发: local:${STREAM_PORT} -> remote:localabstract:${socketName}`);
        
        // 🔥 显式清理旧规则 (防止端口占用导致 "ADB 端口转发失败")
        try {
            await new Promise(resolve => {
                const p = spawn(getAdbPath(), ['forward', '--remove', `tcp:${STREAM_PORT}`]);
                p.on('close', resolve);
                p.on('error', resolve);
            });
        } catch (e) {}

        await new Promise((resolve, reject) => {
            const forwardProcess = spawn(getAdbPath(), ['-s', deviceId, 'forward', `tcp:${STREAM_PORT}`, `localabstract:${socketName}`]);
            
            // 🔥 捕获错误输出，方便调试
            let stderr = '';
            forwardProcess.stderr.on('data', d => stderr += d.toString());

            forwardProcess.on('close', (code) => {
                if (code !== 0) return reject(new Error(`ADB 端口转发失败: ${stderr}`));
                console.log('[Main] ADB 端口转发成功');
                resolve();
            });
            forwardProcess.on('error', reject);
        });

        // 2. 推送 JAR 文件
        console.log('[Main] 推送 scrcpy-server.jar 到设备...');
        await new Promise((resolve, reject) => {
            const pushProcess = spawn(getAdbPath(), ['-s', deviceId, 'push', SCRCPY_SERVER_PATH, '/data/local/tmp/scrcpy-server.jar']);

            pushProcess.stdout.on('data', (data) => {
                console.log(`[ADB PUSH]: ${data.toString().trim()}`);
            });

            pushProcess.stderr.on('data', (data) => {
                console.error(`[ADB PUSH ERROR]: ${data.toString().trim()}`);
            });

            pushProcess.on('close', (code) => {
                if (code !== 0) return reject(new Error('ADB PUSH 失败'));
                console.log('[Main] JAR 文件推送成功');
                resolve();
            });

            pushProcess.on('error', reject);
        });

        // 3. 启动 scrcpy server - 修复参数问题
        console.log('[Main] 在设备上启动 scrcpy server...');

        // 🚨 修正: 适配 Scrcpy 3.x 参数
        // 1. scid=随机值 (必须与 forward 对应)
        // 2. audio=false (我们只处理视频，避免音频导致的问题)
        // 3. control=true (开启控制权限)
        // 4. tunnel_forward=true (服务端监听，客户端连接)
        // 5. send_dummy_byte=false (禁用连接检测字节，防止握手阻塞)
        // 6. send_frame_meta=false (禁用帧元数据头，只发送纯 H.264 流，方便前端解码)
        // 7. max_size=1280 (限制最大分辨率，防止 4K/VR 设备导致解码器崩溃或黑屏，同时提升性能)
        const shellCommand = `CLASSPATH=/data/local/tmp/scrcpy-server.jar app_process / com.genymobile.scrcpy.Server ${SCRCPY_VERSION} scid=${scidHex} log_level=verbose audio=false video=true max_size=1280 tunnel_forward=true control=true send_dummy_byte=false send_frame_meta=false`;

        currentStreamingProcess = spawn(getAdbPath(), [
            '-s', deviceId,
            'shell',
            shellCommand
        ], {
            stdio: ['pipe', 'pipe', 'pipe']
        });

        // 详细日志
        currentStreamingProcess.stdout.on('data', (data) => {
            const output = data.toString().trim();
            console.log(`[SCRCPY SERVER STDOUT]: ${output}`);

            // 检查是否有错误信息
            if (output.includes('ERROR') || output.includes('Exception')) {
                console.error(`[SCRCPY ERROR DETECTED]: ${output}`);
            }
        });

        currentStreamingProcess.stderr.on('data', (data) => {
            const error = data.toString().trim();
            console.error(`[SCRCPY SERVER STDERR]: ${error}`);
        });

        currentStreamingProcess.on('close', (code, signal) => {
            console.log(`[Main] scrcpy server 进程退出，代码: ${code}, 信号: ${signal}`);
            ipcMain.emit('stop-stream', null, mainWindow);
        });

        currentStreamingProcess.on('error', (err) => {
            console.error(`[Main] scrcpy server 启动失败:`, err);
            ipcMain.emit('stop-stream', null, mainWindow);
            throw new Error(`scrcpy 启动失败: ${err.message}`);
        });

        // 4. 启动 WebSocket 服务器
        console.log(`[Main] 启动 WebSocket 服务器在端口 ${WS_PORT}...`);
        wsServer = new WebSocketServer({port: WS_PORT});

        wsServer.on('connection', (ws) => {
            console.log('✅ [WebSocket] 前端连接成功');

            // 🔥 强制单客户端策略：如果有新连接，关闭旧连接
            if (wsClient) {
                console.warn('⚠️ 检测到新的 WebSocket 连接，关闭旧连接');
                wsClient.close();
            }
            wsClient = ws;

            // 清除之前的定时器
            if (connectionTimeout) clearTimeout(connectionTimeout);

            // 延迟连接 TCP，给 scrcpy server 启动时间
            connectionTimeout = setTimeout(() => {
                // 清理旧的 TCP 连接
                if (scrcpySocket) { scrcpySocket.destroy(); scrcpySocket = null; }
                if (controlSocket) { controlSocket.destroy(); controlSocket = null; }

                // 1. 连接视频流 Socket
                scrcpySocket = net.connect(STREAM_PORT, '127.0.0.1', () => {
                    console.log('🔗 [TCP] 连接到设备视频流成功');

                    let dataReceived = false;
                    let dataCount = 0;

                    scrcpySocket.on('data', (data) => {
                        dataReceived = true;
                        dataCount++;

                        if (ws.readyState === ws.OPEN) {
                            // 只记录前几次数据传输，避免日志过多
                            if (dataCount <= 5) {
                                console.log(`[TCP] 转发 ${data.length} 字节到 WebSocket (${dataCount})`);
                            } else if (dataCount === 6) {
                                console.log(`[TCP] 继续传输数据...`);
                            }
                            ws.send(data);
                        }
                    });

                    scrcpySocket.on('error', (err) => {
                        console.error('❌ [TCP ERROR]', err.message);
                        ws.close();
                    });

                    scrcpySocket.on('close', (hadError) => {
                        console.log(`❌ [TCP] 连接断开，错误: ${hadError}, 收到数据: ${dataReceived}`);
                        ws.close();
                    });

                    // 🔥🔥 关键修复：确保视频流连接成功后，再连接控制流 🔥🔥
                    // Scrcpy Server 依靠连接顺序区分 Video(第1个) 和 Control(第2个)
                    // 移除延时，立即发起连接，防止服务端超时关闭 Video Socket
                    controlSocket = net.connect(STREAM_PORT, '127.0.0.1', () => {
                        console.log('🔗 [TCP] 连接到设备控制通道成功');
                    });
                    controlSocket.on('error', (err) => {
                        console.warn('⚠️ [Control] 控制通道连接失败:', err.message);
                    });
                });

                scrcpySocket.on('error', (err) => {
                    console.error('❌ [TCP CONNECT ERROR]', err.message);
                    ws.close();
                });

            }, 3000); // 等待 3 秒让 scrcpy server 完全启动

            ws.on('close', (code, reason) => {
                console.log(`❌ [WebSocket] 前端断开连接，代码: ${code}, 原因: ${reason}`);
                // 只有当前客户端断开时才清理资源
                if (ws === wsClient) {
                    wsClient = null;
                    if (connectionTimeout) clearTimeout(connectionTimeout);
                    if (scrcpySocket) { scrcpySocket.destroy(); scrcpySocket = null; }
                    if (controlSocket) { controlSocket.destroy(); controlSocket = null; }
                }
            });

            ws.on('error', (err) => {
                console.error('❌ [WebSocket ERROR]', err.message);
            });
        });

        wsServer.on('error', (err) => {
            console.error('❌ [WS SERVER ERROR]', err);
            ipcMain.emit('stop-stream', null, mainWindow);
        });

        // 等待服务启动
        console.log('[Main] 等待服务启动...');
        await new Promise(resolve => setTimeout(resolve, 5000));

        console.log(`[Main] 串流服务启动完成`);
        return {success: true, port: WS_PORT};
    } catch (error) {
        console.error(`[Main] 启动串流失败:`, error);
        ipcMain.emit('stop-stream', null, mainWindow);
        throw error;
    }
});

// ----------------------------------------------------
// 9. 停止串流服务 (清理所有进程)
// ----------------------------------------------------
ipcMain.on('stop-stream', (event, targetWindow) => {
    console.log('[Main] 停止所有串流相关进程...');

    // 1. 终止 scrcpy server shell 进程
    if (currentStreamingProcess) {
        currentStreamingProcess.kill('SIGKILL');
        currentStreamingProcess = null;
    }

    // 2. 清理 ADB 端口转发
    // 🔥 移除 if (currentAdbForwardProcess) 判断，直接清理，确保端口释放
    try {
        spawn(getAdbPath(), ['forward', '--remove', `tcp:${STREAM_PORT}`]);
    } catch (e) { console.error('清理转发规则失败', e); }
    currentAdbForwardProcess = null;

    // 3. 关闭 WebSocket 服务器
    if (wsServer) {
        wsServer.close();
        wsServer = null;
    }

    // 4. 清理资源
    if (connectionTimeout) clearTimeout(connectionTimeout);
    if (scrcpySocket) { scrcpySocket.destroy(); scrcpySocket = null; }
    if (controlSocket) { controlSocket.destroy(); controlSocket = null; }
    if (wsClient) {
        wsClient.close();
        wsClient = null;
    }

    // 通知前端，串流已停止
    const windowToNotify = targetWindow || BrowserWindow.getAllWindows()[0];
    if (windowToNotify && !windowToNotify.isDestroyed()) {
        windowToNotify.webContents.send('stream-stopped', {deviceId: 'unknown', code: 0});
    }
});

// 🔥 新增: 处理控制指令 (暂时留空，防止前端报错)
ipcMain.on('device-control', (event, { deviceId, params }) => {
    if (!controlSocket || controlSocket.destroyed) return;

    try {
        if (params.type === 'touch') {
            // --- 触摸事件 (Inject Touch Event) ---
            // 🔥 防崩溃校验：如果尺寸无效，直接忽略
            if (!params.width || !params.height || params.width <= 0 || params.height <= 0) return;

            // Total size: 32 bytes
            const buffer = Buffer.alloc(32);

            // 1. Type (1 byte): INJECT_TOUCH_EVENT = 2
            buffer.writeUInt8(2, 0);

            // 2. Action (1 byte): 0=down, 1=up, 2=move
            const actionMap = { 'down': 0, 'up': 1, 'move': 2 };
            const actionCode = actionMap[params.action] ?? 1;
            buffer.writeUInt8(actionCode, 1);

            // 3. Pointer ID (8 bytes)
            buffer.writeBigUInt64BE(BigInt(1), 2);

            // 4. Position (4 bytes + 4 bytes)
            buffer.writeInt32BE(Math.round(params.x), 10);
            buffer.writeInt32BE(Math.round(params.y), 14);

            // 5. Screen Size (2 bytes + 2 bytes)
            buffer.writeUInt16BE(Math.round(params.width), 18);
            buffer.writeUInt16BE(Math.round(params.height), 20);

            // 6. Pressure (2 bytes)
            buffer.writeUInt16BE(0xFFFF, 22);

            // 7. Action Button (4 bytes)
            buffer.writeInt32BE(1, 24);

            // 8. Buttons (4 bytes)
            buffer.writeInt32BE(1, 28);

            controlSocket.write(buffer);

        } else if (params.type === 'key') {
            // --- 按键事件 (Inject Keycode) ---
            // Total size: 14 bytes
            const buffer = Buffer.alloc(14);

            buffer.writeUInt8(0, 0); // Type: INJECT_KEYCODE = 0
            const actionMap = { 'down': 0, 'up': 1 };
            buffer.writeUInt8(actionMap[params.action] ?? 1, 1); // Action
            buffer.writeInt32BE(params.keycode, 2); // Keycode
            buffer.writeInt32BE(0, 6); // Repeat
            buffer.writeInt32BE(0, 10); // MetaState

            controlSocket.write(buffer);
        } else if (params.type === 'scroll') {
            // --- 滚动事件 (Inject Scroll Event) ---
            // 🔥 防崩溃校验：如果尺寸无效，直接忽略
            if (!params.width || !params.height || params.width <= 0 || params.height <= 0) return;

            // Total size: 33 bytes
            const buffer = Buffer.alloc(33);
            buffer.writeUInt8(3, 0); // Type: INJECT_SCROLL_EVENT = 3
            buffer.writeBigUInt64BE(BigInt(1), 1); // Pointer ID
            buffer.writeInt32BE(Math.round(params.x), 9); // X
            buffer.writeInt32BE(Math.round(params.y), 13); // Y
            buffer.writeUInt16BE(Math.round(params.width), 17); // Width
            buffer.writeUInt16BE(Math.round(params.height), 19); // Height
            
            // 🔥 修正: Scrcpy 滚动值使用 16.16 定点数 (float * 65536)
            // 前端传来的值通常是 "ticks" (1.0 = 1 滚轮刻度)
            buffer.writeInt32BE(Math.round(params.hScroll * 0x10000), 21); // hScroll
            buffer.writeInt32BE(Math.round(params.vScroll * 0x10000), 25); // vScroll
            
            buffer.writeInt32BE(0, 29); // Buttons (0 for none)
            
            controlSocket.write(buffer);

        } else if (params.type === 'text') {
            // --- 文本事件 (Inject Text Event) ---
            const textBuffer = Buffer.from(params.text, 'utf8');
            const len = textBuffer.length;
            // Header: Type (1) + Length (4) = 5 bytes
            const header = Buffer.alloc(5);
            // 🚨 修正: INJECT_TEXT type code is 1, not 5
            header.writeUInt8(1, 0); // Type: INJECT_TEXT = 1
            header.writeInt32BE(len, 1); // Length
            
            controlSocket.write(Buffer.concat([header, textBuffer]));
        } else if (params.type === 'swipe') {
            // 🔥 新增：滑动事件 (ADB Shell Input Swipe)
            // 替代 Scrcpy 原生滚动，防止协议参数错误导致 Server 断开
            const args = [
                '-s', deviceId,
                'shell', 'input', 'swipe',
                Math.round(params.x), Math.round(params.y),
                Math.round(params.endX), Math.round(params.endY),
                params.duration || 100
            ];
            spawn(getAdbPath(), args);
        }
    } catch (err) {
        console.error('发送控制指令失败:', err);
    }
});

// 🔥 新增：检测锁屏状态
ipcMain.handle('check-lock-screen', async (event, deviceId) => {
    return new Promise((resolve) => {
        // 在设备端执行 dumpsys 并 grep，减少传输数据量
        // 注意：adb shell 后面的参数会被拼接发送给设备 shell 执行
        const proc = spawn(getAdbPath(), ['-s', deviceId, 'shell', 'dumpsys window | grep "Lockscreen"']);
        let output = '';
        proc.stdout.on('data', (data) => output += data.toString());
        proc.on('close', () => resolve(output));
        proc.on('error', () => resolve(''));
    });
});

ipcMain.handle('scrcpy-start', async () => {
    if (!scrcpyInstance) return await startScrcpy();
    return {videoStream: scrcpyInstance.videoStream};
});


// 🔥 监听渲染进程发来的窗口控制指令
ipcMain.on('window-min', () => mainWindow?.minimize())
ipcMain.on('window-max', () => {
    if (!mainWindow) return
    if (mainWindow.isMaximized()) {
        mainWindow.unmaximize()
    } else {
        mainWindow.maximize()
    }
})
ipcMain.on('window-close', () => mainWindow?.close())

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
    // 退出时确保清理
    // ipcMain.emit('stop-stream');
    if (pyProc) pyProc.kill();
});