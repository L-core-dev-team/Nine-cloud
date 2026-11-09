# P6-ADAPTER-01 契约测试与验收报告

日期：2026-10-13。授权的独立原型和测试准备已完成；阶段0继续REVIEW_READY，正式接入6项BLOCKED。本报告与契约包供道主及道童审核，不声称生产联合验收通过。

## 现场与范围

新worktree：水龙吟专用/项目/Nine-cloud-P6-adapter-01-20261013；新分支：shuilongyin/p6-adapter-01-20261013；基线534a6d58acf32ce8915f419cf4aeddc723a88e2d。开工前已报告路径、分支、基线及预计文件，实际核验隔离位置后才研发。

仅新增tests/experiments/p6-adapter-01/及圈内交接报告。旧P6-04、P6-INTEGRATION-READY-01、冻结测试／证据、main、P3/PR #83、P4/P5、Canon及生产数据库均未修改；旧42项未重新运行。旧本地提交及两套万回合实验数据保留。

## 可交付模块

- adapter.cjs＋adapter.d.cts：异步只读证据适配器，注入五个可信Reader端口和权威校验器，复制请求/结果并在查询结束复核。
- reader.ts：待审可信Reader类型；policySurface由服务端明确，P6不实现认证、授权或数据库事务。
- contract-suite.cjs、contract-catalog.json、run-contracts.cjs：同一30项测试与可注入后端工厂；reader-harness.example.ts为未实现类型骨架。
- fixture-factory、serialized-factory、frozen-factory：三种明确标为测试替身的工厂；最后一类验证不可变DTO与故障注入复制件。
- retained-recall.ts、profile-worker.ts、benchmark.cjs、verify-profile.cjs：旧冻结引擎的独立视图保留实验、全量成对测量和独立核验。
- checks.cjs、retention.test.ts、tsconfig.json：新模块类型、语法和四项缓存边界测试。

## 新增契约覆盖与旧证据复用

|组别|新增行为|与旧测试的区别|
|---|---|---|
|R01–R02|只读Reader路径、已确认旧回执无发布正文|不依赖本地publish恢复；没有本地正文或行动重试|
|R03–R10|分别在证据/正文/回执await后撤权；结束快照错配；异常；晚到回调；取消；参数突变|此前同步/本地bridge不能证明的异步边界和请求快照隔离|
|R11–R15|20个并发NPC；同generation多attempt；明确source选择；发布时序；历史投影|并发上下文与publishedAtRevision比原回执revision更晚的情况|
|R16–R20|P4/P5明确不同结果；缺面/错面；缺页/错snapshot|复用上一轮真实P4/P5差异证据，新增Reader不得强行统一的消费契约|
|R21–R30|未发布状态、回执/事实不符、epoch不变但撤权、下一请求拒读、输出修改隔离、Reader缺正文/回执、时间/政策结束变化、猜源不得触发raw读取|验证新Reader边界，不重复旧42项实现|

R16用此前实测的P4 forgotten／P5保留语义作为明确测试输入，验证适配器遵循各自已授权结果。它不重新计算政策，也不证明尚未实现的真实Reader政策算法正确。

## 测试结果

- 原合成工厂：contracts-03，30 PASS／0 FAIL。
- 异步JSON外部工厂CLI：contracts-cli-02，30 PASS／0 FAIL；portability-01另有5项选定工厂注入用例通过。
- 不可变JSON工厂：contracts-immutable-01，30 PASS／0 FAIL，验证最终测试包故障注入不污染后端DTO。
- checks-03：四项缓存测试、TypeScript及新模块Node语法检查通过。新增verify-profile语法及实际执行也通过。
- verification-01：20000条来源、1200对查询、1676段原文核验；所有非计时字段与基线一致。

上述为30项相同契约在不同替身上的结果，不把它们累计宣称为90个不同生产测试，更不称PostgreSQL已通过。真实工厂尚未实现。

CJS实现用消费者声明与运行时验证，未声称逐行静态类型化。TypeScript检查覆盖Reader类型、消费者骨架及优化实验；核心Adapter入参和输出仍使用冻结正式receipt/DTO校验器，并对scope、hash、偏移、时序和结束边界作额外检查。

## 成败证据与修复

完整cases含observed与Reader调用计数，无外部模型调用。首轮performance-01因Node strip-only不支持TypeScript参数属性失败；改为显式字段赋值，首次failure.log保留。checks-01/02的缓存测试因把elapsedMs纳入等值比较失败；修正两处计时比较后仍比较全部其它证据，retention-03通过。新增返回对象深复制及污染测试后，checks-03四项通过。

performance-02是初始实验，03是加入返回隔离后的优化复验、复用成功基线；04为最终代码重新成对顺序测量，期间没有其他测试运行。各轮均保留，不覆盖已冻结或已生成结果。

## 审核门槛与停止条件

本轮只交原型、测试包、独立性能优化和对接说明。Reader接口、same-version多attempt选择规则、历史发布边界、finishRead线性化和真实测试工厂需阶段0冻结后由临江仙统一审阅。六项真实依赖仍BLOCKED；没有认证／政策／SQL／生产事务实现，也没有PR、合并、部署或远端推送。完成后停止，等待道主与道童审核。
