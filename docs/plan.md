# Chinese Can Fly — Emergency Response 实施计划

本轮完成 Step 2 规划及用户授权的五人并行分工修订，详见docs/team.md；依据SPEC.md、CONTRACT.yaml。应用尚未实现；下列验收均待执行。K1–K3假定日期已关闭、基线已审阅。
用户：急救调度主管。决策：同一优先级中，哪些区域每天的超时比例发生异常变化，哪些已完成出车需要复查。

## 统计先行：公式与可复核答案
- K0 时间与超时：t=(到场−派车秒数)/60；y=1[t>T]。T=10 时，09:00→09:10 得 t=10、y=0；到场09:10:01 得 t=10+1/60、y=1。
- 每个区域×优先级单独计算：每日有效完成数 n、超时数 d=Σy、比例 p=d/n；n=0 时 p=null。基线 p̄=Σd/Σn，不能平均每日比例。
- 标准误 SE=√(p̄(1−p̄)/n)；下限=max(0,p̄−3SE)，上限=min(1,p̄+3SE)。只用冻结基线；仅严格越界触发，比例比较绝对容差1e−12。
- K1：同一区域/优先级，基线20天每天10/100超时，p̄=200/2000=0.10；监测n=100时SE=.03、下限=.01、上限=.19。d=0→低值，1或19→无信号，20→高值。
- K2：基线10天各6/100，加10天各34/300，p̄=400/4000=.10；错误的日比例均值为.0866667。追加监测数据不得改变基线；设置相同、n相同则界限不变。
- K3：同一基线、n=400时SE=.015、界限[.055,.145]；d=21→低值，22或58→无信号，59→高值。展示百分数=100p%，判定使用未舍入值。
- D1：空数据、n=1、基线不足20个非空日、新区域无基线、p̄=0或1均不作正式判定；n p̄及n(1−p̄)都须≥5，故p̄=.1时n=49不满足、n=50满足。
- D2：缺失/非法/逆序/未来时间、空字段、重复ID均排除并给原因；同一重复ID的所有行均排除。每行只计一次排除；总行数=有效行数+排除行数。
- D3：as_of=2026-10-16T12:00:00-04:00，当天20/100只显示20%暂定值、不触发正式信号；10月15日23:55→16日00:05为10分钟，归15日。恰在baseline_end的派车属于监测。
- 基线截止必须是纽约时区当地午夜，且不晚于as_of当天零点。先看每日基线率及星期分组比例（该星期Σd/Σn），再逐区确认“已审阅基线”；未确认只给暂定结果。
- K4 星期汇总：同一星期类别两日分别6/100、34/300，显示40/400=10%；这只是描述统计，不另做显著性检验。基线确认、日期关闭、样本门槛全部满足后才给high/low/no_signal。
- 输出用“未发现越界信号”，不宣称“已证明受控”；超时目标≠控制限。20天与期望数≥5是本项目政策/近似条件，不能证明独立、稳定或可比。
- p图不在新版glossary列出的课堂覆盖范围；作为有出处的质量控制扩展使用：[NIST p chart](https://www.itl.nist.gov/div898/handbook/pmc/section3/pmc332.htm)。团队需能讲清上述手算。
## 页面、数据与接口
- 页面1 Data & Settings：Import CSV、Add completed response（Save/Cancel）、Export CSV；预览原始记录及排除原因；设置priority、target_minutes、baseline_end及可选历史as_of（默认现在）；Run analysis。导入替换当前会话。
- 页面2 Zone Monitoring：区域筛选、每日超时率控制图（比例轴与当天n）、固定基线及上下限、基线/星期检查视图、逐区Baseline reviewed确认、待复查日列表；View incidents、Back to data。
- 页面3 Incident Review：按区域/日期筛选超时记录，按响应分钟数或时间排序；Clear filters、Back to chart。三页固定显示纽约时区、as_of、目标和有效/排除计数。
- CSV五列：incident_id、zone、priority、dispatched_at、on_scene_at；时间必须带UTC offset。每次派车一行、每天一个组；仅分析已完成记录，缺失到场不视为0。
- Python纯函数 analyze_response(records,target_minutes,selected_priority,baseline_end,reviewed_zones,as_of) 放app/qc.py；所有时长、排除、计数、比例、界限、信号及星期汇总都由它返回。
- GET /health 返回运行状态；POST /analyze 接收records[]及设置。as_of省略时取服务端当前时间；可指定历史值但不能晚于现在；返回meta、quality、excluded_records、zone_baselines、daily_points、signals、late_incidents。
- daily_points至少含zone/date/n/late/rate/lower/upper/status/reasons；不可计算量用null。无信号、数据不足、未审阅基线、当天暂定分别标识；全局导入计数与所选priority计数分开。
- 非法分析参数/缺少必需列→HTTP 422；可识别的行级错误→HTTP 200并列出排除项；全无可用记录→空结果和解释。例：3行中2有效1非法，quality须为3/2/1。
- React只解析/导出CSV、排序和展示；不重算统计。追加记录、历史修正或设置变化使旧结果过期，并清除基线确认；点击Run analysis产生标明as_of的新结果。
- 三个明确标记synthetic的CSV：stable.csv、zone_shift.csv、edge_cases.csv；前两者共享相同基线。生成脚本、固定seed=5300及字段说明放data/，不用真实患者信息。
- 演示候选：2区域×2优先级，每组每天100条，派车在08:00–20:00；基线2026-09-01至20日，监测09-21至30日；baseline_end=09-21T00:00:00-04:00，测试as_of=10-01T00:00:00-04:00。
- 正常生成超时概率.15；shift仅改变A区P1监测期为.35，其他条件相同；时长按是否超时生成正值。固定种子后不挑选“漂亮”结果；记录真实跑出的信号，精确K测试独立于随机CSV。

## 按任务交接：五人并行准备，路径以CONTRACT和docs/team.md为准
| 顺序/任务 | 人员与文件边界 | 工时估计 | 已知答案与边界验收 |
|---|---|---|---|
| 1 H-01 规格 | Shifeng协调全队；SPEC.md、docs/plan.md、docs/team.md、docs/interfaces.md。 | 0.5h | 空白检查=0；全队解释K1与D1并固定接口后交接；当前仍in_progress。 |
| 2 H-02 数据 | Jingyao；data/，含CSV、生成脚本、README。 | 1.5h | 核对K0、两份基线一致、可复现；edge_cases覆盖D1/D2/D3，不伪造预期输出。 |
| 3 H-03 统计 | Shifeng；app/qc.py、tests/test_qc.py、tests/fixtures/qc/；依赖请求Julian添加。 | 3h | pytest tests/test_qc.py：K0–K4、D1–D3与冻结基线通过；独立stats-reviewer给PASS/FAIL及数字。 |
| 4 H-04 API和页面 | Julian：后端、requirements、脚本、tests/test_api.py及tests/fixtures/api/；Pingchuan：app/frontend/；例外见team。 | 3h | pytest tests通过；K1/K3在核心/API/UI一致；D1/D2与未审阅/当天状态正确；一条命令启动及CSV流转。 |
| 5 H-05 演示 | Jingyao：demo/文字；Pingchuan：demo/recordings/；Hayden独立复演。 | 1h | 三份CSV写实际结果、解释与固定设置；Hayden未参与编写，按步骤复现，边界原因明确。 |
| 6 H-06 部署 | Hayden；.github/workflows/、.github/scripts/、app/manifest.json、app/.python-version。 | 1.5h | 先API后React；匿名访问、K1同值、D1解释；关闭mock，健康页上线仅属准备。 |
| 7 H-07 文档 | Jingyao；README.md、app/README.md；Julian初始化后交接app README。 | 1h | 新队友一条命令启动并复现K1、处理D2；假设、参数、示例、发布访问说明及引用齐全。 |
| 8 H-08 复现提交 | Hayden；.gitignore；执行fresh-clone、按文档验证与Devpost操作，Julian支持。 | 1h | 空目录clone后testme和全套测试通过；无凭据；核对公开repo、演示及提交成功。 |
- 每人一次一个活动任务；Shifeng完成H-01后转H-03，Jingyao按H-02→H-05→H-07，Pingchuan在H-04后参与H-05，Hayden按H-06→H-08。H-04保留一个ID、负责人和前端协作者。
- 用户授权并行数据/统计/明确标记mock的接口与页面/部署准备；H-03验证后才能接入真实分析，美化最后。Shifeng唯一修改ledger；每个模块按CONTRACT验收，口头完成不算通过。
- Julian只初始化一次模板，不覆盖qc、frontend、manifest或.python-version；requirements由他唯一维护，README按阶段交接。Hayden复用其最小后端先验部署链路；真实集成关卡见team，留3–4小时缓冲。
## Decisions（用户已授权其余事项由代理决定）
- 已确认：Chinese Can Fly；校内24小时；Emergency Response；Python + FastAPI + React。使用者、p图、三页和最小输入依SPEC；当前没有需要再次提问的产品决策。
- 选择日超时比例而非直接给偏态响应时长套控制限；按zone/priority分别建基线。目标默认10分钟仅为演示，可修改；不做Cp/Cpk、预测、因果归责或自动派车。
- 记录只在浏览器会话保存，CSV导出留存；FastAPI与React分别部署，API地址由构建配置注入，不写课程服务器配置进源码。根目录bash app/testme.sh启动，采用现成工作流。
- 界面英文，规划中文；不引入Open Design、动画、登录或数据库。本轮只规划；构建时查官方库文档并用已有浏览器工具验证，额外工具安装不作为规划前提。
- H-01尚需团队理解方法的验收；H-02–H-08未实现。提交与推送前另展示实际diff；部署时由队员把凭据放GitHub Secrets，不能放聊天或仓库。

## 三个主要风险与处理
1. 统计解释和可比性：p图属于课外扩展，引用NIST并讲清K1；检查基线/星期图、分开优先级；相关性或结构变化明显时不给可信“正常”结论。
2. 记录不全或数量不足：仅表示已记录的完成响应；逐行排除、计数对账、当前日暂定和小样本门槛；用户确认基线也不能消除漏记偏差。
3. 集成和发布耗时：先固定接口、统计通过再真实集成；Julian协助Hayden部署，Jingyao写演示、Pingchuan录屏；目标10月17日12:30纽约时间提交，官方13:00截止。
