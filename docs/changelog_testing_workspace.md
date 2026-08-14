# 测试工作台改动总结

> 日期：2026-08-14  
> 版本：前端 MiniOrange **0.0.101** · 后端 MiniOrangeServer **0.0.102**  
> 仓库：`MiniOrange`（前端）+ `MiniOrangeServer`（后端）  
> 范围：双工作面（Agent | 测试）、应用下任务中心、执行时间线 UX、批次进度与截图/耗时落库。

本文汇总本轮**全部已落地改动**（含交互迭代），对应方案见 `docs/prd_testing_workspace_v3.md`、`docs/prd_testing_nav_flatten.md`。

---

## 1. 产品结构

把回归执行从「设置 → 应用 → 飞书回归」抽出来，做成与 Agent **并列的工作面**。

| 工作面 | 入口 | 主路径 |
|--------|------|--------|
| Agent | 侧栏 `Agent` | 对话 `/dialogue` |
| 测试 | 侧栏 `测试` | 全部应用 → App → 任务列表 / 任务详情 / 配置 |

- 任务语义：**一次触发/批次 = 一个任务**（`cr-xxx`），下面挂多条 case run（`cr-xxx::case_id`）。
- 配置（环境、图标、逻辑、设计稿、用例来源）退到 App 壳二级，不再作为执行监控入口。
- 齿轮只进全局运维设置；旧 Settings 应用/回归深链 **redirect** 到 `/testing`。

### 路由

| 路径 | 页面 |
|------|------|
| `/testing` | 全部应用（`AppList.vue`） |
| `/testing/:appId?tab=tasks` | 应用任务列表 |
| `/testing/:appId?tab=tasks&task=` | 任务详情 |
| `/testing/:appId?tab=config` | 同壳配置 |
| `/testing/:appId/tasks/:taskId` | redirect 到 query `task=` |
| `/settings/apps/:appId`、`/report/feishu/:appId` 等 | redirect 到测试工作台 |

各工作面记住上次路径（`src/utils/workMode.js`），侧栏切换 Agent / 测试时回到上次位置。

---

## 2. 前端：壳与导航

### 新增文件

| 文件 | 作用 |
|------|------|
| `src/layouts/WorkShell.vue` + `work-shell.css` | 共享主壳：Mac 交通灯区、Agent\|测试切换、侧栏槽、底栏设备/设置 |
| `src/views/Testing/AppList.vue` | 全部应用页 |
| `src/views/Testing/AppShell.vue` | App 工作台：任务轨 + 详情 + 配置 + 新建执行 |
| `src/views/Testing/TaskDetailPane.vue` | 任务详情：进度头、用例轨、时间线、总结报表 |
| `src/utils/testingTasks.js` | 把 memory runs + traces 聚合成任务；排序/进度/状态文案 |
| `src/utils/testingDevices.js` | 仅列出在线可执行设备 |
| `src/utils/workMode.js` | Agent / 测试路径记忆、从设置返回 |

### 改造文件

- `src/App.vue`：测试/对话走 WorkShell 时隐藏全局 TitleBar。
- `src/router/index.js`：测试路由 + Settings 深链 redirect。
- `src/views/Dialogue/index.vue`：对话页接入 WorkShell。
- `src/views/Settings/index.vue`、`AppConfigPage.vue`：配置可嵌入 App 壳；应用/回归入口改走测试面。
- `src/logic/CopilotCommands.js`：相关跳转对齐新路由。
- `src/components/GlobalHitlDialog.vue`：文案明确「必须点击后 Agent 才会继续」。

### 侧栏与任务列表交互（已定稿）

- 进 App 后侧栏只保留：**当前应用 + 任务 / 配置 / 新建执行**（去掉顶栏重复按钮、去掉「最近任务」）。
- 点任务进入详情时，**默认折叠中间任务轨**，详情全宽；可用「展开任务列表」临时并排。
- 任务行按状态着色；运行中绿色脉冲；进度文案 `completed/total`。
- 切换应用会清空并重载任务；traces **只纳入当前 App 的 case_id**，空集合时不回退成全量 traces。
- 任务轨展开宽度约 **156px**；全宽任务列表卡片左对齐，不再把进度条顶到最右侧留下大缝。
- 用例列收窄到约 **132px**，时间线区 `width: 100%` 贴合容器。

### 「任务 / 配置」点击立即切换

此前侧栏点击像没反应，常见原因：

1. Electron `-webkit-app-region: drag` 吞点击。
2. 切 tab 仍保留 `?task=`，主区停在详情。
3. 界面完全绑在 `route.query`，等 `router.push` 才换面；`loadProjects` 异步 `replaceQuery` 还会把旧 query 写回。

现行为：

- 侧栏整列 `no-drag`，按钮可点。
- `tab` / `selectedTaskId` 为**本地 ref**：点击先改本地状态，主区立刻切换，再 `router.replace`。
- 点「任务」或「配置」都会清掉当前 `task`（退出详情）。
- `loadProjects` 只补 `projectId` 等字段，不再整份回写旧 query。

「新建执行」仍只开对话框，不承担切 tab 的职责。

---

## 3. 前端：任务详情与时间线

### 任务详情（`TaskDetailPane.vue`）

- 头带：状态、短 ID、设备、P/F/B、`completed/total`、通过率、进度条。
- HITL 琥珀色横幅：必须在弹窗点选，否则用例卡住。
- Tab：**用例与时间线** | **总结报表**。
- 用例轨展示 pending / running / done；自动选中运行中用例；轮询刷新。
- 总结：通过率卡片 + 失败/异常表。

### 执行时间线（`ExecutionTimeline.vue`）

| 能力 | 说明 |
|------|------|
| 缩略图识别 | JPEG base64 以 `/9j/` 开头，不再误当成 URL 路径导致裂图 |
| 水瀑条 | 各步骤按**公共时间轴**排布（类似浏览器 Network Waterfall）；长度 = 耗时，位置 = 起点 |
| 分色 | 按能力类型岔开颜色（点击蓝、滑动青、输入紫、启动靛、断言绿、等待灰、失败红、HITL 黄）；不再「全是通过就全绿」 |
| 胶片 | **紧凑横滑**，不再按时间绝对定位（中间无截图不再留大块空白） |
| 悬停放大 | **仅 hover** 时 CSS `scale`；选中只描边。去掉贴在右侧、未悬停也显示的大预览浮层 |
| 点击 | 胶片/步骤缩略图打开灯箱；Esc 关闭 |
| 步骤列表 | 始终展开 thought/summary；状态标签在左；每行显示耗时胶囊 |
| 历史 0ms | 从 `elapsed_ms` 或 `started_at`/`finished_at` 推算；仍缺则把用例总耗时未记账部分摊给 `assert_goal` / 末步（估算，精确值需重跑） |

---

## 4. 后端（MiniOrangeServer）

| 文件 | 改动 |
|------|------|
| `case_runner.py` | 开跑时把计划用例全部 seed 为 `pending`；开始执行标 `running`；按 `case_id` upsert（不再只在结束后 append）；设备早期失败则把剩余 pending 标失败 |
| `schemas.py` | `EventResult.thumb` |
| `router.py`（CapabilityRouter） | `_with_thumb`：从截图生成 JPEG 缩略图挂到结果上 |
| `agent_stream.py` | `make_thumb` 去掉 `data:` 前缀再 decode |
| `agent_executor.py` | `result` 事件带 `elapsed_ms`；`assert_goal` 计时并写入 `EventResult.elapsed_ms` + 流事件；可选 `capability_id` |

前端列表仍可只靠 `/case-runner/runs` + traces 聚合任务，不必等独立 Task API。

---

## 5. 用户反馈对照（UX 迭代）

| 反馈 | 处理 |
|------|------|
| 任务列表右侧大片空白 | 收窄轨宽；全宽列表左对齐，进度不再 `margin-left: auto` |
| 要点「新建执行」后「任务/配置」才像能切 | 本地 tab 立刻切面 + `no-drag` + 清 `task` + 禁止项目加载覆盖 query |
| 没悬停就放大预览 | 预览曾绑 `activeStep`；改为仅 hover scale，去掉 sticky 浮层 |
| 时间轴放大被挡住 | 去掉右侧绝对定位大卡片；胶片区预留 hover 空间 |
| 没有每方法耗时（要图五水瀑） | 公共时间轴彩色条；步骤行始终显示耗时 |
| 水瀑全绿 | 按 capability 分色，失败/阻塞另色 |
| `assert_goal` 显示 0ms | 服务端写入耗时；前端对历史 run 回填/分摊 |
| 时间轴下方空洞 | 胶片改为紧凑横排，空洞来自「按时间绝对定位」 |
| 详情区不贴合宽度 | 用例列收窄；时间线/步骤/报表 `width: 100%` |

---

## 6. 已知限制

1. **历史任务无 thumb**：执行时未落库缩略图的 run，胶片为空；需**重新跑一轮**。
2. **历史 `assert_goal` 耗时**：旧数据可能仍为 0 或分摊估算；服务端修复后新任务才有真实 `elapsed_ms`。
3. **任务列表数据源**：批次进度依赖内存 run + traces 聚合，进程重启后内存 run 会丢，历史以 traces 为准。
4. **HITL**：不在弹窗点选，对应用例会一直卡住。

---

## 7. 建议自测

- [ ] 侧栏 `测试` → 全部应用 → 进某个 App，默认任务列表。
- [ ] 直接点「配置」立刻进配置；点「任务」立刻回任务列表（无需先点新建执行）。
- [ ] 选一条任务：详情全宽；「展开任务列表」出现窄轨且无明显右空白。
- [ ] 新建执行：仅在线设备、多选用例、启动后进入该任务详情。
- [ ] 运行中：用例 pending→running→完成；时间线实时出步骤；HITL 横幅+全局弹窗。
- [ ] 时间线：水瀑分色；悬停才放大胶片；点击开灯箱；步骤行有耗时。
- [ ] 新跑一轮：截图 thumb 可见，`assert_goal` 非 0ms。
- [ ] Agent / 测试来回切，回到各自上次页面；齿轮进设置后能返回。
