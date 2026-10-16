# Chinese Can Fly — 五人并行分工（修订版）

项目：Emergency Response；Python + FastAPI + React；使用明确标记为 synthetic 的数据。

用户：急救调度主管。目标：按区域、优先级检查每日超时比例的变化，并查看需要复查的已完成出车记录。

依据：`SPEC.md` 定义产品与统计，`docs/plan.md` 定义公式和测试，`CONTRACT.yaml` 记录任务与验收；本文件定义谁负责、如何并行和怎样交接。配套文件需要一同同步给所有队员，不能只转发本文而继续使用旧任务表。

团队提交目标：**2026 年 10 月 17 日 12:30，纽约时间**；仓库活动日程列出的官方截止为 13:00，Showcase 为 14:00–15:00。导师时段以现场通知为准。

> 这是分工和验收计划，不代表实现或测试已经完成。本次修订允许在不重叠的文件内并行准备数据、统计、示例接口、示例页面和部署；正式分析必须先通过统计测试再集成，美化最后做。

## 1. 五个人现在分别做什么

| 成员 | GitHub | 主要职责 | 第一阶段立即可做 | 后续交付 |
|---|---|---|---|---|
| **Shifeng Hong** | sh942-spec | 统计、接口约定、队长协调 | 与 Julian、Pingchuan 定接口；写手算测试与统计函数 | K0–K4、D1–D3 通过；方法讲解；统一任务表 |
| **Jingyao** | Jingyao0610 | 数据、codebook、文档 | 按已确定五列准备生成器和采集说明；接口确认后生成三份数据 | 演示文档、根 README、app README；核对数据说明 |
| **Julian Jiang** | Yulinjiang599 | FastAPI、启动脚本、依赖、联调 | 定请求和返回格式；初始化后端；做显式模拟接口 | 接入已验证统计；API 测试；一条命令启动；联调负责人 |
| **Pingchuan Liu** | pl482 | React 三页、演示操作、录屏 | 定返回格式；用标为 MOCK 的示例 JSON 做页面 | 接入真实 API；状态展示、CSV 操作；录制 2–3 分钟演示 |
| **Hayden Yang** | haydenYang666 | 部署、发布验证、Devpost | 核对权限、准备 workflow；Julian 最小后端可运行后部署健康页 | API 与前端上线；fresh-clone 验证；最终提交 |

**并行不等于没有依赖。** 前期各人都能准备；真实联调仍须依次完成“统计验证 → API 对齐 → 页面验证 → 完整线上演示”。Hayden 不另外创建第二份后端，也不独自承担演示文档和录屏。

## 2. 开工前 30 分钟：冻结第一版接口

Shifeng 主写 `docs/interfaces.md`，Julian 与 Pingchuan 逐项核对；Jingyao 同时准备数据生成规则，Hayden 同时核对发布权限。先完成 H-01 的团队方法说明，再正式认领各自实现任务。

### 输入与函数

- CSV 五列：`incident_id, zone, priority, dispatched_at, on_scene_at`。时间必须带 UTC offset；每次出车一行。
- 每次分析选择一个 `selected_priority`；按 `America/New_York` 的派车日期分组。
- `target_minutes` 默认 10，仅为演示值；恰好 10 分钟不算超时。
- Python 纯函数签名必须一致：

```python
analyze_response(
    records, target_minutes, selected_priority,
    baseline_end, reviewed_zones, as_of
) -> dict
```

- `reviewed_zones` 默认空列表；主管查看基线后逐区确认，才允许正式判定。确认不代表证明了统计假设。
- API 未收到 `as_of` 时，由服务端取当前时间并传入纯函数；演示、测试可明确传固定历史时点，不能晚于服务端现在。**不得默认用数据最后一天。**
- `baseline_end` 是纽约时区当地午夜，为排他截止；截止时刻及以后属于监测期。不得晚于 `as_of` 当天零点。
- 数据、目标、优先级或截止设置改变时，旧分析失效并清除基线确认；追加监测数据不得悄悄改变基线。

### API 与示例

- `GET /health`；`POST /analyze` 接收 `records` 和上述设置。
- 返回顶层字段：`meta, quality, excluded_records, zone_baselines, daily_points, signals, late_incidents`。
- `daily_points` 至少包含 `zone/date/n/late/rate/lower/upper/status/reasons`；无法计算的量用 `null`，不能填 0。
- `quality` 分开记录全部导入行与所选优先级的计数；排除行只计一次，满足“总行数＝有效行数＋排除行数”。
- 在 `interfaces.md` 写出完整的请求、返回示例，统一每个字段类型、单位、状态枚举和缺失值。覆盖：无越界、越界、样本不足、行级错误、基线未审阅、当天暂定。
- 参数非法或导入结构缺必需列返回 422；结构可识别但个别行有错误，返回 200 并列排除原因。3 行中 2 有效、1 非法，应显示 3/2/1；全部不可用时为空结果及原因。
- `high/low/no_signal` 只用于满足全部判定条件的监测日；其他状态不得显示为“正常”。

接口改动由提出者说明影响，Shifeng、Julian、Pingchuan 确认后更新接口文档及相关测试。先更新约定，再改实现。

## 3. 文件边界与任务编号

只使用已有 **H-01–H-08**。前后端都属于 H-04，Julian 是负责人，Pingchuan 是协作者；“前端/后端”是角色，不新增 H-04a/H-04b 任务。

| 任务 | 负责人 / 协作者 | 写入范围与边界 |
|---|---|---|
| H-01 规格与接口 | Shifeng 协调全队 | `SPEC.md`、`docs/plan.md`、`docs/team.md`、`docs/interfaces.md` |
| H-02 数据 | Jingyao | `data/`：三个 CSV、生成器、codebook |
| H-03 统计 | Shifeng | `app/qc.py`、`tests/test_qc.py`、`tests/fixtures/qc/`；不改依赖文件或 API 测试 |
| H-04 后端与前端 | Julian / Pingchuan | Julian 写后端、四脚本、`app/requirements.txt`、`tests/test_api.py`、`tests/fixtures/api/`；Pingchuan 写 `app/frontend/`；排除 H-03 文件及 Hayden 的发布文件 |
| H-05 演示 | Jingyao / Pingchuan | Jingyao 唯一写入 `demo/README.md` 与文字材料；Pingchuan 唯一写入 `demo/recordings/`。页面修复仍回 H-04 |
| H-06 部署 | Hayden | `.github/workflows/`、`.github/scripts/`、`app/manifest.json`、`app/.python-version`；两个发布流程分别部署 API 和 React |
| H-07 文档 | Jingyao | 根 `README.md`、`app/README.md`；各模块负责人提供内容，不同时编辑这些文件 |
| H-08 复现与提交 | Hayden | `.gitignore`；执行 fresh-clone、检查公开链接、提交 Devpost |

### 初始化和交接的例外必须说清楚

1. **Julian 只初始化一次 `app/`**：从 `demos/fastapi/` 复制必要文件；不能整目录覆盖已经存在的统计、前端、manifest 或运行版本文件。
2. `app/requirements.txt` 只有 Julian 改。Shifeng 一开始就列出所需库，Julian 同步锁定依赖，避免统计开发等安装。统计任务不靠额外手工安装才能通过。
3. Julian 可以在 H-04 初始化时创建模板 `app/README.md`；转入 H-07 后明确交给 Jingyao，此后 Julian 只提供修改建议。
4. `app/manifest.json`、`app/.python-version` 由 Hayden 维护；Julian 提供启动入口、依赖和兼容版本。生成 manifest 的脚本由 Julian 写，正式生成和更新文件由 Hayden 执行。
5. Pingchuan 使用 React 模板时，移除示例统计模块及对应测试，并清理所有相关 import 和旧图表调用；不能只删 `src/spc.js` 而留下引用。
6. 前端 API 地址由 Pingchuan 配置；部署地址通过构建环境变量注入，实际课程服务器地址和凭据不写进源码文档。Julian 配置跨域访问，双方验证线上连接。
7. 同一文件同一时段只有一人写。修复他人的模块时，先由原负责人交接，不因“帮忙联调”直接覆盖。

## 4. 每人的交付与验收

### Shifeng：统计核心与方法解释

所有响应时长、数据排除、计数、比例、控制限、信号和星期汇总都在 `app/qc.py`；不导入 FastAPI。用原始精度判定，比例边界比较绝对容差为 `1e-12`。

| 测试 | 必须复现的结果 |
|---|---|
| K0 | 09:00→09:10 为 10 分钟，不超时；09:10:01 超时 |
| K1 | 基线 20 天每天 10/100，合计 200/2000；p̄=0.10。n=100 时界限 [0.01, 0.19]；d=0 低值，1/19 无越界，20 高值 |
| K2 | 10 天各 6/100＋10 天各 34/300，p̄=400/4000=0.10；不能平均每日比例；增加监测记录不改变基线 |
| K3 | 同一基线 n=400，界限 [0.055, 0.145]；d=21 低值，22/58 无越界，59 高值 |
| K4 | 同一星期类别两日分别 6/100、34/300，应汇总为 40/400=10% |
| D1 | 空数据、n=1、少于 20 个基线日、无基线、p̄=0/1：无正式判定；p̄=.1 时 n=49 不满足期望计数门槛，n=50 满足 |
| D2 | 缺失、非法、逆序、未来时间和重复 ID 有明确排除原因；重复 ID 的所有行都排除，行数对账正确 |
| D3 | 当前日只展示暂定结果；跨午夜按派车日归组；恰好在截止时刻的派车归监测期 |

K1–K3 的正式判定还要求日期已结束、基线已审阅，且其他门槛均满足。每日控制限随当天 n 变化；“冻结基线”不等于所有天的上下限数值相同。

验收：`pytest tests/test_qc.py` 通过，独立 stats-reviewer 给出数字和 PASS/FAIL 表；Julian 或 Jingyao 再核对一个手算例和一个边界例。API 测试未写完不应阻塞统计单元测试，但全部集成时必须跑完整测试。

### Jingyao：数据 → 演示文档 → README

- 用 `data/generate.py`、seed=5300，生成 `stable.csv`、`zone_shift.csv`、`edge_cases.csv`。
- 前两份数据为 2 区域×2 优先级，每组每天 100 条；基线 09-01～09-20，监测 09-21～09-30，派车 08:00–20:00。两份基线完全相同。
- 稳定数据生成超时概率 .15；变化数据仅 A 区 P1 的监测概率改为 .35。生成概率不是保证实际比例；不得挑种子来强行消除假警报。
- 演示固定 `baseline_end=2026-09-21T00:00:00-04:00`、`as_of=2026-10-01T00:00:00-04:00`。边界场景按测试需要使用单独明确的分析时点。
- `edge_cases.csv` 覆盖不足样本、缺失/逆序时间、重复 ID、跨午夜等；手算 K 测试使用独立确定性输入，不能假定随机 CSV 正好产生 K1 的数字。
- `data/README.md` 写清每个字段、单位、生成假设，以及现场由谁、何时、怎样记录。全部数据明确标记 synthetic。
- 数据完成后写 `demo/README.md`：三份 CSV 各写“点什么 → 实际得到什么 → 怎样解释”；统计确认前只写步骤，不编造结果。
- H-05 演示验收通过后再汇总两份 README。Julian 提供安装与 API 说明，Pingchuan 提供页面说明，Hayden 提供发布与访问说明。Hayden 独立按演示文档复演，问题交回模块负责人；文档作者不能代替独立验收人。

### Julian：FastAPI、依赖与联调

- 根据接口文档实现请求结构、参数校验和错误返回；统计由 `analyze_response` 统一执行。
- `as_of` 的默认时间和“不晚于现在”校验由 API 入口处理，响应记录有效性由统计函数处理。
- 写一条命令运行的 `app/testme.sh`，协调前端启动；维护依赖和四脚本。给 Hayden 最小运行入口，不让两个人重复搭后端。
- 模拟模式必须显式开启并标注；**禁止因导入失败、函数缺失或异常而自动返回示例 JSON**。正式模式报清楚错误，不伪装成功。
- 统计测试通过后接入真实函数，编写 API 测试：K1/K3、422、行级排除、无有效记录、未审阅与当天暂定。
- 验收：`pytest tests` 全部通过；同一输入经过纯函数、API、页面得到一致结果；一份 synthetic CSV 能完整流转。

### Pingchuan：React 三页与录屏

- **Data & Settings**：CSV 导入、手动添加已完成出车、CSV 导出、优先级/目标/基线设置、运行分析；导入替换当前会话。
- **Zone Monitoring**：逐日超时率、当天样本量、对应控制限、基线/星期检查、逐区基线确认、待复查日列表。
- **Incident Review**：按区域/日期筛选，按响应分钟排序，显示排除与记录覆盖说明。
- 三页显示纽约时区、分析时点、目标、有效/排除计数。未审阅、样本不足、当天暂定都要有明确提示，不能统一显示绿色正常。
- 只做 CSV 解析/导出、排序和展示；不重算比例、控制限或信号。数据或关键设置变化时清除旧结果与基线确认。
- 先以明确标注 MOCK 的示例开发交互，统计验证后接真实 API；仅有页面或图表不算完成。
- 线上真实流程通过后，按 Jingyao 的演示文档录 2–3 分钟视频；录屏放 `demo/recordings/` 或使用可访问的分享链接，大视频不直接推入 Git。

### Hayden：部署、复现与提交

- 先准备发布 workflow、核对权限，再部署 Julian 提供的最小健康页；这是检查部署链路，**不是 H-06 完成**。
- API 与 React 分别发布，先 API、后前端；API 地址通过前端构建配置传入。凭据和实际课程服务器配置放 GitHub Secrets，不放聊天、文档或仓库。
- 正式发布关闭模拟模式；退出登录验证两个内容的访问，上传真实测试输入，核对 K1 数字及不足数据状态。仅 HTTP 200 不够。
- H-06 完成后，先作为未参与演示文档编写的队员独立复演 H-05，再转 H-08。fresh-clone 验证：从空目录克隆，按 README 用一条命令启动，跑全部测试，复现演示；由 Julian 协助解决运行/依赖问题。
- 12:30 前提交 Devpost，核对公开仓库、线上工具和演示链接；保留提交确认。视频是团队演示方案，不将 2–3 分钟写成未经核实的官方强制要求。
- 负责协调 Git 冲突；涉及统计代码的冲突交 Shifeng 决定，不能直接选一边覆盖。

Hayden 统一管理部署是协作安排，并非只有仓库所有者才能设置所有 Secrets。GitHub 文档说明个人仓库 collaborator 可以创建仓库级 secrets；environment secrets 的权限另有要求，见文末引用。

## 5. 并行阶段与交接关卡

时间为团队目标，可按当前进度平移；**12:30 提交目标不顺延**。每人一次只认领一个活动任务，完成本项后再转下一项。

| 阶段 | Shifeng | Jingyao | Julian | Pingchuan | Hayden |
|---|---|---|---|---|---|
| 开工前 30 分钟 | 主写接口，讲清 K1 | 准备生成规则和字段说明 | 审接口，列运行依赖 | 审接口，画三页草图 | 检查权限，准备发布流程 |
| 之后约 2–3 小时 | H-03：K/D 测试与统计 | H-02：三份 CSV＋codebook | H-04：模拟接口、脚本和校验 | H-04：模拟页面和各类状态 | H-06：等待最小后端入口时准备 workflow；随后健康页部署 |
| 第一轮真实联调 | 输出统计验证结果 | 数据完成后转 H-05 文档 | 接真实函数，跑 API 测试 | 接真实 API，核对图表和状态 | 跑第一次完整部署 |
| 当晚目标：23:00 前 | 核对线上数字 | 补实际演示结果；H-05 验收后转 H-07 | 修接口/依赖问题 | H-04通过后转 H-05 录屏 | 线上验证；独立复演 H-05 后转 H-08 |
| 周六 08:00–10:00 | 答辩演练，支持统计修复 | README 定稿、核对演示说明 | 支持复现与 bug 修复 | 录屏补录、展示演练 | fresh-clone、独立复演和链接检查 |
| 周六 10:00–12:30 | 只修必要问题 | 文档与实际结果保持一致 | 保持可运行版本 | 保持可演示版本 | 提交并确认成功 |

晚间轮流休息，明确交接人、未解决问题和最近通过的版本；不要求所有人通宵。导师时间以现场安排为准，带可运行结果或具体问题沟通。

**关卡 A：接口确定。** 参与方读过完整示例，字段、单位、缺失状态一致；模拟模式明确。

**关卡 B：统计通过。** K0–K4、D1–D3 和独立复核通过，才能把统计结果当作可信分析接入产品。

**关卡 C：完整流转。** 同一 K 输入由纯函数、API、页面显示一致；随机 CSV 结果与纯函数一致；错误与暂定状态不被吞掉。

**关卡 D：正式发布。** 无模拟返回，匿名访问和完整分析通过，才能标记 H-06 完成并录最终视频。H-01–H-04 按各自验收及时 check-in，不必等发布；H-05、H-07、H-08 按各自后续验收完成。文档数字来自已验证的真实运行，最终演示再核对线上结果。

## 6. 范围控制

当前 SPEC/plan 的承诺继续有效：CSV 导入/导出、单条记录录入、三页、统计及数据质量提示、基线审阅、三个数据集、部署、文档。

- **不能省掉**：样本不足判定、无基线/退化基线处理、数据排除、当前日暂定、有效计数、基线审阅逻辑、真实 API 接入。
- **可简化呈现**：星期汇总先用简单表格；基线检查先用列表或简单折线；页面朴素、少动画。K4 的计算和测试保留。
- 历史 `as_of` 的可视化输入框可以后做，但 API 仍支持显式历史值，演示有固定分析时点；不能拿数据最后一天替代“现在”。
- 若确需取消导出、手动录入等已承诺功能，先由全队确定并同步修改 SPEC、plan、接口和验收；不能只在前端悄悄删掉。
- 23:00 尚未完成真实端到端流程时，停止美化和新增功能，集中解决统计、接口与部署。冻结基线、独立性和记录覆盖的限制仍要讲清。

## 7. Git 与任务表协作

1. Shifeng 是 `CONTRACT.yaml` 的唯一编辑者；其他人报告任务 ID、开始时间、改动路径和实际验收输出，不让自己的 AI 改任务表。
2. 分配负责人不代表已开工。`todo`、`in_progress`、`done` 必须与真实状态一致；只有验收通过才记录完成。H-01 的团队方法讲解不能被文档检查代替。
3. 每次工作从最新共享版本开始。各人使用独立本地副本与角色分支，提交明确路径，不用 `git add .` 或 `git add -A`；小批提交便于检查。
4. PR 写清对应 H-ID、实际测试输出和文件范围；Shifeng 汇总任务状态，Hayden 协调合并。任务正式完成的改动与 `done/result` 在同一次合并提交中进入主分支，不能只凭群里一句“好了”。
5. 前后端共用 H-04，但分别在各自路径开发。只有后端、前端和完整联调全部通过才把 H-04 标记为 done。
6. 不把 `git pull --rebase && git push` 当作无条件修复。先保存/提交自己的改动；出现冲突先停止，由文件负责人确认内容，再由 Hayden 协助处理；不强推主分支。
7. 提交前检查差异和测试。仅规划文档通过检查不代表应用通过；部署到健康页不代表分析功能上线。

## 8. 给各自 AI 的启动提示词

以下提示词用于接口文档定稿、H-01 团队讲解完成、Shifeng 在任务表认领相应任务之后。先同步最新 SPEC、plan、team、CONTRACT；不要拿旧模板直接开始。

**通用前缀（所有人先粘贴）**

```text
Read SPEC.md and CONTRACT.yaml first, then CLAUDE.md, AGENTS.md,
docs/plan.md, docs/team.md and docs/interfaces.md. Load the relevant skills.
Follow the approved parallel-preparation workflow in docs/team.md:
mock development is allowed in separate files, but real statistical integration
requires passing known-answer and degenerate tests. No statistics in API/UI code.
Work only on my assigned task and paths. Shifeng alone edits CONTRACT.yaml;
report status and exact test output to me for coordination instead.
Do not deploy, commit or push without my explicit instruction.
Show the diff and actual verification output. Do not call mock output real analysis.
```

**Shifeng — H-03**

```text
Implement H-03 only: app/qc.py, tests/test_qc.py, tests/fixtures/qc/.
Load stats-first-steering. Preserve reviewed_zones and explicit as_of in the
agreed function signature. Write K0-K4 and D1-D3 tests, then implement the
plain Python function. Request dependencies from Julian; do not edit requirements.
Run pytest tests/test_qc.py and obtain independent statistical review.
Report numeric expected/actual results, failures and remaining assumptions.
```

**Jingyao — H-02**

```text
Implement H-02 only in data/. Use seed 5300 to generate stable.csv,
zone_shift.csv and edge_cases.csv exactly as specified. Preserve the same
baseline in stable and shift data. Do not search for a seed with no false alarms.
Write a codebook with units, assumptions and who records each field, when and how.
Do not invent expected analysis outputs. Stop at the H-02 handoff; H-05 and H-07
are separate later tasks after Shifeng updates the ledger.
```

**Julian — H-04 后端**

```text
Implement the backend portion of H-04 only, following docs/team.md ownership.
Initialize the FastAPI starter without overwriting qc.py, frontend, manifest.json
or .python-version. Own requirements, backend scripts, API code and API tests.
Keep the initial app/README as a minimal starter, then hand it to Jingyao for H-07.
Use explicit mock mode only; never fall back to example JSON after a real error.
After H-03 passes review, call the real analyze_response including reviewed_zones
and as_of. Test K1/K3 and error/provisional states, then run pytest tests.
Coordinate the end-to-end handoff with Pingchuan and Hayden.
```

**Pingchuan — H-04 前端，之后 H-05 录屏**

```text
Implement the frontend portion of H-04 only in app/frontend/. Use React/Vite.
Remove the demo statistics module, its tests and all stale imports/calls.
Use explicitly labeled mock fixtures until H-03 is verified, then the real API.
Build all three views and show insufficient, unreviewed and provisional states.
Keep baseline review, stale-result invalidation and data-quality counts.
Use build-time configuration for the API origin; do not commit the course URL.
Do not calculate response statistics in JavaScript. After H-04 handoff, coordinate
with Jingyao on H-05; write recordings only in demo/recordings/, not demo/README.md.
```

**Hayden — H-06**

```text
Prepare H-06 only in its assigned paths. Load connect-publish and posit-dlc
before deploying. Use Julian's minimal backend; do not create another app.
Keep API and static frontend deployments separate. Store credentials and course
server configuration in GitHub Secrets, not source, logs or chat.
A health-only deployment is a preparation check, not H-06 completion.
Before final release verify mock mode is disabled, anonymous access works, and
known-answer plus insufficient-data cases agree with the verified core.
Report actual checks. H-08 is a later task; do not submit Devpost in this task.
```

## 9. 参考与最终检查

- 活动日程：`docs/schedule.md`；评分：`docs/criteria.md`。
- 统计方法：[NIST p chart](https://www.itl.nist.gov/div898/handbook/pmc/section3/pmc332.htm)。p 图属于本项目采用的有出处扩展；团队需要能解释方法、假设与手算。
- 权限说明：[GitHub repository secrets](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets#creating-secrets-for-a-repository)。
- 发布前每个人都应能说明：自己的输入输出、一个已知答案、一个失败情况，以及自己交给下一位的具体文件或结果。
