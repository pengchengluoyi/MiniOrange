# 多设备任务：覆盖方式开发方案

> 日期：2026-08-20  
> 状态：方案锁定，未实现  
> 交互线框：[multi-device-coverage.canvas.tsx](/Users/changpengcheng/.cursor/projects/Users-changpengcheng-code-MiniOrange/canvases/multi-device-coverage.canvas.tsx)  
> 对照现状：`POST /case-runner/run` 只收一台 `sn`；`busy_task_for_sn` 单 SN；`report_run_id = task::case_id`；`builtins.TARGET_DEVICE_SN` 全局可变。

本文回答四件事：市面工具怎么拆「快」和「全」、我们学什么避开什么、产品与交互怎么改、后端怎么改才不会串台。

**给实现 Agent：** 先读 §0–§2 铁律和 §7 工作包。不要把一次任务拆成多个 `cr-*`。不要在没拆掉全局 `TARGET_DEVICE_SN` 之前开多 worker。

---

## 0. 产品定义（不得含糊）

一次任务勾选多台设备时，必须显式选择 **覆盖方式**（创建后冻结，运行中不可改）：

| 界面文案 | 字段 | 含义 | 执行单元 | 单元数 |
|---|---|---|---|---|
| 加速拆分 | `coverage: once` | 每条用例只跑一次，空闲设备接着领 | `(case_id)` 绑定一台 `sn` | 用例数 |
| 全机覆盖 | `coverage: per_device` | 每台设备把这批用例各跑一遍 | `(case_id, sn)` | 用例数 × 设备数 |

一台设备时两种结果相同：**不展示该选项**，请求仍写 `coverage: once`。

**默认必须是加速拆分。** 云真机农场（Firebase / AWS / BrowserStack）默认矩阵是因为按设备分钟计费；我们是工位上有限的 USB / Wi‑Fi 真机，默认矩阵会在无提示下把 12×3 变成 36 次 Agent 执行。

**禁止：** 全局开关、运行中切换覆盖方式、热迁移正在跑的用例、同一 SN 挂两个任务、把矩阵拆成多个 `cr-*`。

同一任务**可以混选 Android 与 iOS**。每台设备用自己的通道（ADB / WDA）和项目环境里对应的包名 / Bundle；用例视为跨端同一套，某端不支持的前置条件允许失败或跳过。

---

## 1. 铁律

1. **任务是唯一聚合根。** 对外一个 `task_id`；设备 worker 是内部对象。
2. **覆盖方式写进任务，不可变。** 它决定分配、trace 主键、计数、重跑语义。
3. **执行单元（unit）是最小结果。**  
   - `once`：unit = `(case_id)`，绑定一台 `sn`  
   - `per_device`：unit = `(case_id, sn)`，同一 `case_id` 可有多行
4. **设备锁仍是 `sn → task_id` 一对一。** 任务占用名单里全部 SN，直到任务结束。
5. **进程内禁止共享可变执行态。** 一机一个 `RunContext` / 引擎；禁止两个 worker 写同一个 `TARGET_DEVICE_SN`。
6. **HITL 只停本机。** 其它机继续自己的队列（加速）或自己的拷贝（全机）。
7. **取消 = 停全部 worker。** 任务终态 `cancelled`。
8. **baseline 仍按 `(case_id, device_signature)`。** 不做任务级合成 baseline。
9. **混平台任务按设备下沉 platform / 包名。** 任务级 `platform` 在混选时为 `mixed`；worker 读 `platforms_by_sn[sn]`，启动标识读项目环境 `android.package` / `ios.bundle`。用例不必与设备同平台才能开跑。
10. **加速模式用共享队列（工作窃取），不用静态 round-robin 切块。** Agent 用例耗时极不均匀，预切块会让快机空转。

---

## 2. 行业对照：学什么、不学什么

交互图与对照表见 Canvas「行业对照」。这里只留实现时要遵守的结论。

| 来源 | 做法 | 我们 |
|---|---|---|
| Maestro `--shard-split` / `--shard-all` | 两个互斥旗标，本地多机最像我们 | 界面两张卡片，字段 `once` / `per_device` |
| Maestro `--shard-split-dynamic` | 共享队列，谁空谁领 | **加速 v1 就用这个**，不要先做静态切块 |
| Firebase Test Lab | 一张 Test Matrix；失败语义是「任一 execution 失败」 | 一个 `task_id`；有失败单元 → 任务 `failed` / `partial_fail` |
| BrowserStack `deviceSelection=all\|any` | 写清 shards×devices=会话数 | 开始按钮前写出「将执行 N 次 · 占用 M 台」 |
| Playwright `--shard` | 资源有限时默认分片 | **默认加速拆分** |
| AWS Device Farm | 只有矩阵，分片靠用户拆 suite | 不要把加速变成「请自己开三个任务」 |
| BrowserStack 默认 `all` | 矩阵吃并行席位，容易误触 | 不默认全机；次数变化要可见 |
| Flank 重试整颗 shard | 已通过的邻居被重跑 | 沿用「重跑失败」：只重失败单元 |
| 云农场把设备当槽位 | 断线丢弃/换机 | 断线只失败该单元；不热迁移 running / HITL |

国内 WeTest / EMAS / Testin：兼容性实验室默认矩阵、功能自动化偏单机。我们把两种意图放进**同一个「新建执行」**，不新开产品入口。

---

## 3. 交互场景

### 3.1 新建执行（`AppShell` 对话框，加宽，不新开页）

```
设备（可多选，仅在线可执行）
  ☑ Pixel 8     Android 14   空闲
  ☑ Redmi K70   Android 14   空闲
  ☑ iPhone 15   iOS 18       空闲
  ☐ Pixel 7     占用中 cr-…

覆盖方式（已选 ≥2 台才出现）
  [ 加速拆分 ]  [ 全机覆盖 ]
  将执行 6 次（6 用例 × 1）· 占用 3 台
          或 18 次（6 用例 × 3）
```

| 条件 | UI |
|---|---|
| 0 台空闲 | 现有提示；主按钮禁用 |
| 1 台 | 不展示覆盖方式 |
| ≥2 台空闲（可跨 Android / iOS） | 展示两张卡片 + 执行次数 |
| 提交瞬间某台变忙 | 409，提示去看占用任务，不静默丢设备 |

主按钮文案带次数：`开始 · 6 次执行`。

### 3.2 任务列表

仍一行一个任务。增加：

- 覆盖芯片：`拆分` / `全机`（单机不显示）
- 设备：`Pixel +2`，不要拼接超长 SN
- 进度：加速用 `3/6`；全机用 `5/18`（格子，不是去重后的用例数）

筛选「设备」改为 `sns` 包含，不是 `task.sn ===`。

### 3.3 任务详情

顶栏设备条（每台一行状态：执行中 / HITL / 空闲待领 / 已完成 / 断线）。

- **加速：** 用例列表；每行一个 `sn` 芯片；未领取为「排队」。点行打开时间线。
- **全机：** 用例 × 设备格子（过 / 败 / 跑 / 空）。点格打开该 `(case_id, sn)` 时间线。同一用例的多份步骤**禁止混轴**。

### 3.4 取消 / HITL / 重跑

- 取消：停全部 worker，剩余 pending → `cancelled`。
- HITL：只该 worker 阻塞；顶栏该设备显示「等人」。
- 重跑失败：开**新任务**，同一 `coverage` 与 `sns`。加速重失败 `case_id`；全机只重失败格子。

---

## 4. 数据与 API

### 4.1 任务 JSON 增量

旧字段 `sn` 保留为 `sns[0]`，兼容旧列表。新增：

```json
{
  "task_id": "cr-8f21ab12cd34",
  "sn": "pixel8",
  "sns": ["pixel8", "k70", "iphone15"],
  "coverage": "once",
  "platform": "mixed",
  "platforms_by_sn": { "pixel8": "android", "iphone15": "ios" },
  "packages_by_platform": { "android": "com.example.app", "ios": "com.example.app.ios" },
  "total": 6,
  "completed": 3,
  "cases": [
    {
      "case_id": "login",
      "sn": "pixel8",
      "status": "pass",
      "report_run_id": "cr-8f21ab12cd34::login"
    }
  ]
}
```

全机覆盖示例（同一 `case_id` 两行）：

```json
{
  "coverage": "per_device",
  "total": 18,
  "cases": [
    {
      "case_id": "login",
      "sn": "pixel8",
      "status": "pass",
      "report_run_id": "cr-8f21ab12cd34::login::pixel8"
    },
    {
      "case_id": "login",
      "sn": "k70",
      "status": "fail",
      "report_run_id": "cr-8f21ab12cd34::login::k70"
    }
  ]
}
```

旧任务无 `coverage` / `sns`：读取时视为 `coverage=once`，`sns=[sn]`。

### 4.2 `POST /case-runner/run`

| 字段 | 旧 | 新 | 缺省 |
|---|---|---|---|
| `sn` | 必填 | 仍接受 | 写入 `sns=[sn]` |
| `sns` | 无 | 1～N | 与 `sn` 二选一，去重、保序 |
| `coverage` | 无 | `once` \| `per_device` | 设备数=1 或省略 → `once` |

校验：

- `sns` 全部在线可执行、无 `busy_task_id`（Android 与 iOS 可混选）
- 任一忙 → **409** `{ message, busy_task_id, sn }`（多个忙可只报第一台）
- `coverage=per_device` 且设备数=1 → 允许，等价 once
- 混平台 → 任务 `platform=mixed`，每 worker 用自己的 `platforms_by_sn[sn]`

### 4.3 占用检测

`busy_map()` / `busy_task_for_sn`：running 任务的 **每一个** `sns` 都映射到该 `task_id`。  
`GET /devices` 的 `busy_task_id` 行为不变，只是一个任务会标多台。

### 4.4 进度

`total` = 执行单元数。`completed` = 终态单元数。  
`once` 禁止把同一 `case_id` 写两行。`per_device` 必须按 `(case_id, sn)` 唯一行。

---

## 5. 调度

```
                    ┌─ worker(Pixel) ── RunContext(pixel)
 task  ── spawn ────┼─ worker(K70) ──── RunContext(k70)
                    └─ worker(一加) ── RunContext(op12)
```

**加速拆分：** 任务级 `queue = case_ids`（有序）。worker 循环：`claim()` 原子取出一条 → 写入该行 `sn` → 执行 → 再 claim。队列空且无 running 单元 → 任务收口。HITL 期间该 worker 不 claim。

**全机覆盖：** 每台 worker 持有 `case_ids` 的独立拷贝，串行执行（即今天的单机循环 × N）。禁止跨机领取。

**设备断线：**

- 正在跑的单元 → `fail` 或 `blocked`，不迁移。
- 加速：未领取的仍在队列，由其它机领。
- 全机：该 `sn` 上剩余 pending → `blocked`；其它机继续。

**不要做（v1）：** 按时长预切片、按机型加权、任务中途加/减设备、失败自动换机重跑。

---

## 6. 最大风险：执行隔离

`TARGET_DEVICE_SN`、引擎单例、截图/hierarchy 缓存若按进程全局存，多 worker 会点错设备、把 HITL 挂到另一台。

完成标准：

- 每个 worker 启动时创建独立 `RunContext(sn)`，后续 ADB / iOS / Agent 调用只读该 context。
- 禁止 `builtins.TARGET_DEVICE_SN = sn` 作为多机路径；单机旧路径可暂留，但多 `sns` 必须走 context。
- 单测或脚本：两个假 worker 交错执行，断言各自 sn 不串。

这一项不完成，两种覆盖方式都不能合入。

---

## 7. 工作包

**P0 — 可真实开跑**

| ID | 仓库 | 做什么 | 完成标准 |
|---|---|---|---|
| BE-ISO | Server | worker 级 RunContext，切断多机路径上的全局 SN | 双 worker 交错不串台 |
| BE-MODEL | Server | `sns` / `coverage` / unit 主键 / busy 多名 | 旧 `sn` 客户端仍能跑单机 |
| BE-MATRIX | Server | `per_device`：N 路今日循环 | 6×3 → `total=18`，三份 trace |
| BE-ONCE | Server | `once`：共享队列 claim | 6 条用例恰好 6 份结果，sn 落在不同机 |
| FE-CREATE | MiniOrange | 多选设备、覆盖卡片、次数预告、平台禁用 | 单机 UI 与现在一致 |
| FE-LIST | MiniOrange | 芯片、`sns` 过滤、进度分母 | 不出现三个 cr 代表一台任务 |
| FE-DETAIL | MiniOrange | 设备条；加速列表；全机格子；时间线按 unit | 全机点格不混轴 |

建议实现顺序：BE-ISO → BE-MODEL → BE-MATRIX（更接近现状）→ BE-ONCE → 前端可与 BE-MODEL 契约并行。

**P1**

- 重跑失败按执行单元
- HITL 只停本机的联调与顶栏提示
- 断线策略落地
- WS `testing_task` 带上 `sn` / `coverage` / unit 级 case 事件

**P2（明确不做，除非另开需求）**

- 按时长的 smart shard
- 设备提前释放给其它任务
- 排队（设备忙则入队）

---

## 8. 主要改动文件

后端：`case_runner.py`（fan-out worker）、`task_store.py`（`sns` / busy）、`rCaseRunner.py`（请求体）、`agent_executor.py` 与 runtime 层（context 传参）、HITL `session.py`（`report_run_id` 前缀仍 `task::`）。

前端：`AppShell.vue` 新建执行、`testingTasks.js` normalize、`TaskDetailPane.vue` 设备条与矩阵、`testingDevices.js` 平台过滤。

不要改测试侧栏 IA，不要重做 Agent 决策循环。

---

## 9. 验收（6 用例 × 3 台 Android）

1. 单机新建：无覆盖选项，行为与今天一致。  
2. 加速：`total=6`，三台都有活，结束时每个 `case_id` 一行且 `sn` 非空，无重复 case。  
3. 全机：`total=18`，每台 6 行；同一登录可 Pixel 过、K70 不过。  
4. 一加 HITL：另外两台继续（加速）或继续自己的队列（全机）。  
5. 取消：三台都停，任务 `cancelled`。  
6. 提交时一台 busy：409，任务未创建。  
7. 勾选 iPhone + Pixel：可启动；任务 `platform=mixed`；Android worker 走 ADB+安卓包名，iOS worker 走 WDA+Bundle。  
8. 旧任务详情：无 `sns` 也能打开。
