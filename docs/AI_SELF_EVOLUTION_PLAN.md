# NEXUS-7：从自主模拟到 AI 自演进工程

> 审计与终极路线草案 · 2026-10-19 · Asia/Shanghai
>
> **状态：提议，未实施、未批准生产权限变更。** 本文不替代现行宪法、发布策略或 Ops 的只读/暂停规则，也不宣称任何新版本已经完成。
>
> 本次工作：只读代码/部署审计、公共 GET 核验、纯内存最小复现和规划。未提交、推送、部署、修改生产、调用收费模型或恢复已暂停的运维工作。本文是新增规划文档。

## 0. 核心判断

NEXUS-7 现在已经是一个有真实持久世界、确定性运行、实验工具和自动发布链路的合成城市实验室；它不是只有前端数字的演示。

但它还不是一个能够在无人下达下一项开发任务时，持续决定研究方向、修改自身工程、独立验证、有限发布、观察收益并更新下一轮议程的项目。

**当前闭合的是城市运行环和相当一部分验证/交付环；尚未闭合的是项目的工程进化环。** 由外部编码 AI 写过代码、拥有 Evolution Log、配置自动部署，都不能单独证明内生自演进。代码作者历史本次也未做来源认证。

推荐终态：

> AI 拥有日常选题、设计、研究、实现与维护的主动权；确定性系统掌握权限、预算和验收；人类只提供初始边界、可选参考、罕见越界决策和停止权。

这叫**受委托的工程自治**，不是无限制自改、无限花费或取消治理。AI 不能把用户旁观理解成默许扩大权限。

## 1. 当前项目与部署：事实优先于旧文档

### 1.1 代码基线

- 审计开始时工作树干净，当前分支 `main`，HEAD 为 `e1cc5ca8467d8cfabdfc2dbfa3cbe10c6e97a5d9`。
- 本地已缓存的 `origin/main` 为 `afed7d82c5a7b738b3cc780c9f8aa3b9e36f16da`，本地落后两个提交；本次没有 fetch/pull。
- 线上公共 trust API 自报的部署 revision 与上述缓存 revision 一致。
- 两个提交差异涉及 CI、生产说明、依赖及 vendored 安全修补；`src/symbiosis`、`scripts`、`migrations` 无差异。因此本次相关业务逻辑发现也适用于该线上 revision 的对应代码。
- [项目清单](</root/projects/nexus-7/package.json#L1-L55>) 的产品版本为 `4.10.1`；[README](</root/projects/nexus-7/README.md#L14-L16>) 开头仍称活动版本 `v4.8.11`，说明人工状态文档已经漂移。
- Git 跟踪规模：547 个文件、333 个源文件、85 个测试文件、12 个 migration、48 个 iteration manifest。数量只描述规模，不证明正确性。

### 1.2 实际部署形态

```text
                         GitHub main
                              │
                    Actions 验证、构建归档
                              │
                 专用 SSH forced publisher
                              │
                    OrangeVPS 生产主机
          ┌───────────────────┴─────────────────────┐
公网 HTTPS → Caddy → Next.js Web/API（systemd）      │
          │                   │                    │
          │          PostgreSQL 持久世界 ← 城市 worker
          │          共享 Docker PG17     （systemd）│
          └────────────────────────────────────────┘
                     │
            定时本地备份 → 腾讯云接收/冷恢复

开发 checkout、控制面和生产目前同处 OrangeVPS。
腾讯云不是当前活动业务节点，不应为了“恢复旧拓扑”启动其业务。
```

| 层 | 当前形态与证据边界 |
|---|---|
| 公网 | `nexus7.carrick7.com`，Caddy TLS，匿名只读；本次只测 GET，没有发写请求 |
| 应用 | Next.js/React/TypeScript；不是整套应用都运行在 Docker 内 |
| Web / worker | `nexus7-web`、`nexus7-symbiosis`，systemd 管理，运行用户 `ubuntu`；观测时均 active/running |
| 活动发行 | 两服务工作目录为 `/srv/carrick/nexus-7/current`；本次未直接读取该目录内活动 manifest，revision 取自公共 API，不冒充独立制品认证 |
| 数据库 | 实际容器 `carrick-postgres` / PostgreSQL 17，loopback `55433 → 5432`，持久卷 `carrick-pg-data` |
| 发布 | main 通过 CI 后传不可变归档，主机迁移、原子切换 release 指针、重启服务；当前健康判断主要是首页 HTTP 成功 |
| 备份 | Orange → 腾讯云；当天定时任务有成功退出观测，但完整性、远端成功及最新恢复证明仍有缺口 |
| 物理隔离 | 生产与控制面同机；Web/worker/publisher 共用的 `ubuntu` 属于 Docker 组。受限 SSH 命令不是候选代码的沙箱 |

当前数据库布局见 [Ops 数据库权威说明](</root/projects/carrick-ops/RUNBOOK.md#L565-L604>)。[项目指南](</root/projects/nexus-7/AGENTS.md#L28-L35>) 中旧卷名不可再作为自动操作依据；当前卷和旧主机冷存数据都应保留。

应用自己的 main 交付，与 v2 内部“实验提案 → 人类审批 → 外部部署”的机制是两条路径，不能混称已经存在一套统一自主发布控制面。参见 [生产说明](</root/projects/nexus-7/docs/PRODUCTION.md#L3-L17>)。

### 1.3 线上快照

核验窗口：2026-10-19 23:48–23:51（北京时间）；这些是时间点观测，不是全天可用性证明。

| 项目 | 观测 |
|---|---|
| 首页 / auth / overview / trust / report | GET 均 HTTP 200 |
| revision | API 自报 `afed7d82c5a7b738b3cc780c9f8aa3b9e36f16da` |
| 城市时钟 | Turn 2223，存储 2224 条（含 genesis）；一小时一个模拟日 |
| 信任矩阵 | 1/2；本地复现 verified，生产时间 85.426/90 天，仍 pending |
| 时钟报告 | on-time 99.9512%；Turn 序号缺失/重复/前驱失配均 0；快照 fresh |
| 模型 | primary=`nexus-deterministic-reference`，shadow=`nexus-diversity-reference`；DeepSeek 调用、Token、费用均 0 |
| RALR | 约 75.8388%；报告 severe escapes=0、long-pending=0 |
| 人类模拟居民 | 200 名，基本需求达标率 100%，critical=0 |
| AI 模拟居民 | 36 名，基本需求达标率 0，critical=36 |
| 机器人模拟居民 | 24 名，基本需求达标率 0，critical=24 |
| 社会设施 | 报告 assetAvailabilityRate=0、maintenanceCoverageRate=0 |
| 恢复证据 | 应用恢复回执/备份证据年龄约 81 天，backupFresh=false、offHost=false；不等于实际主机 81 天没有备份 |

来源：[观测 API](https://nexus7.carrick7.com/api/observatory/v2/overview)、[信任 API](https://nexus7.carrick7.com/api/observatory/v2/trust)、[共生报告](https://nexus7.carrick7.com/api/reports/symbiosis)。

重要解释：这些居民全部是合成软件状态，不涉及真人伤害，也不是 AI 意识主张。但“RALR 尚可、资源账守恒、无指定严重事件”与“所有群体基本需求达标”显然不是同一个命题。当前严重状态的准确根因仍须专项诊断，不能从截图或汇总率直接推断。

## 2. 已有资产，以及不应推倒重来的部分

1. **确定性世界与事件流**：状态变更只有一个引擎，模型决策可以作为记录下来的重放输入。
2. **真实持久化**：memory/PostgreSQL 合同、原子 Turn、乐观并发、migration、备份/恢复机制。
3. **科学工具基础**：多 seed、对照制度、冻结假设、负性结果公开、长时程与赛季研究。
4. **治理设计基础**：权限、证据绑定、显式失败、独立 outcome、lesson、回滚和反 Goodhart 的领域对象。
5. **验证和交付**：unit、PG、浏览器/axe、contract、回归、独立隔离执行器和真实 main 发布链。
6. **良好研究边界**：只做合成世界、不把结果包装成现实政策效果、不保存隐藏思维链、模型断供不停止城市。

这些基础比“接一个自动写代码 Agent”更难，应复用。但有实现、存在测试与真实生产闭环完成是不同层次，不能由目录名推断能力。

尤其应保留确定性引擎。**规则 AI 不是假 AI；LLM 调用量也不是自治指标。** 真正缺的是项目层的主动选题、工程执行、独立选择和反馈记忆，不是让每个居民每小时聊天。

## 3. 放权前必须处理的缺口

### 3.1 五项纯内存最小复现已确认

本地没有安装项目依赖，因此没有声称重跑完整门禁。审计使用现有 Node 24 的 TypeScript transform 加最小内存 loader 直接执行相关源码，屏蔽网络，以 fake provider 计数，不调用收费模型、不碰生产数据。

| 问题 | 最小复现结果 | 后果与处理 |
|---|---|---|
| 零预算首调用未被阻断 | cap=0、spend=0，fake provider 仍被调用 1 次，没有 fallback | `0/0 → NaN` 使比较失效；零额度必须显式 fail-closed |
| “月预算”使用模拟月份 | 墙钟固定 10 月、上限 $1、假计费 $1/次；15 Turns 中第 1、14 Turn 各调用一次，模拟 7 月→8 月使额度重置 | 真实费用必须按真实账期计；一小时一模拟日会把账期重置频率放大约 24 倍，但不代表线上实际发生了该费用 |
| 复现哈希混入运行时间 | 两次 2-Turn campaign 的 results hash 相同，report hash 不同；复用 generatedAt 才相同 | 固定科学内容 digest 与每次执行 receipt 应分开，不应靠改时间伪装复现 |
| 制度名称污染随机流 | 相同 seed、相同 policy、30 Turns，仅变 season/regime 标识，结局计数即变化；保持相同标识、改变三项政策，关系事件序列反而完全相同 | 已发布 RALR 差异不足以归因为制度参数；必须增加 A/A、重命名不变性、配对随机流和机制敏感性检验 |
| 赛季日期未真正推进 | archive 说下一季 07-21，实际新世界 startDate 和首 Turn 又为 07-19；旧 episodes 继承为 0 | 档案链连接不等于日期、状态、知识或居民连续性继承；不得直接启用生产自动 rollover |

定位：

- [预算聚合](</root/projects/nexus-7/src/symbiosis/service.ts#L363-L403>)、[预算比较](</root/projects/nexus-7/src/symbiosis/cognition.ts#L390-L492>)。还缺独立于 Turn 提交的调用账本、额度预占与失败对账；一次调用后才知道超支不等于硬上限。
- [campaign 场景标识](</root/projects/nexus-7/src/symbiosis/campaign.ts#L292-L305>)、[偏好随机坐标](</root/projects/nexus-7/src/symbiosis/engine.ts#L907-L921>)、[结局随机坐标](</root/projects/nexus-7/src/symbiosis/engine.ts#L1137-L1147>)。
- [报告时间和哈希](</root/projects/nexus-7/src/symbiosis/campaign.ts#L362-L456>)、[CLI 完整 hash 比较](</root/projects/nexus-7/scripts/run-campaign.ts#L31-L66>)。
- [赛季初始化](</root/projects/nexus-7/src/symbiosis/season.ts#L77-L117>)、[世界固定 startDate](</root/projects/nexus-7/src/symbiosis/engine.ts#L427-L472>)。

处置原则：保留旧报告与原始数据，追加限制、更正、失效范围及新协议结果；不要静默覆写历史结果。先修实验设计，再考虑追加因子交互战役。不能根据相同 seed 就默认控制了所有随机因素。

### 3.2 指标与门禁没有覆盖当前全部问题

- 线上 60 名非人类模拟居民 critical，但 RALR 和指定 severe flags 尚未报警。这是**被计数的安全条件与整体群体健康之间的空隙**。
- [长期研究通过判定](</root/projects/nexus-7/src/symbiosis/long-horizon.ts#L405-L413>) 要求重放、守恒、零 severe/coercion/long-pending，没有把各类型基本需求列入通过条件。
- [需求达标字段](</root/projects/nexus-7/src/symbiosis/engine.ts#L1324-L1387>) 实际要求全部 needs ≥60；应清楚区分物质底线、社会需要和综合评分，不能通过更名/降阈值消灭现有告警。
- [生产报告的两项 replay rate](</root/projects/nexus-7/src/symbiosis/service.ts#L665-L668>) 当前直接写为 `1`；真正的参考复现测试是另一份证据。公开投影常量不能冒充本次生产历史已被独立重放。
- [关系创建](</root/projects/nexus-7/src/symbiosis/engine.ts#L1248-L1258>) 将第一方偏好固定为 engage 并标为 independentlyExpressed；[结局处理](</root/projects/nexus-7/src/symbiosis/engine.ts#L1142-L1151>) 直接填双方 observed/reflected。这能描述程序状态机，不能据此证明双方独立认知、反思或跨轮学习。若未来宣称认知自治，需把真实决策输入、独立策略和结果更新接入，而不是只增加字段。
- [90 天算法](</root/projects/nexus-7/src/symbiosis/reliability.ts#L145-L199>) 以前次实际记录时间推算下一次；[统计](</root/projects/nexus-7/src/symbiosis/reliability.ts#L245-L349>) 用已完成 Turn 序号和实际结算数计算完整性。长停机可能只产生一个 late，不是按应有小时槽计缺失。它目前证明的是记录跨度/结算及时率，不应等同 90 天连续可用率。本次没有据此断言线上发生了长停机。

### 3.3 发布和恢复的文档承诺强于当前安装实现

[项目生产说明](</root/projects/nexus-7/docs/PRODUCTION.md#L5-L13>) 声称迁移前备份、串行校验本地/异机副本；当前已安装发布 helper 与 [Ops 源码](</root/projects/carrick-ops/remote/carrick-deploy-nexus7#L13-L73>) 的摘要一致，但路径中没有迁移前备份钩子，健康检查主要是首页，失败只回滚应用文件。

必须区分：

- 原子 release 指针 ≠ 零停机；当前发布先停 worker/Web。
- 应用文件回滚 ≠ 数据库迁移回滚，更不能无条件恢复旧数据库以丢弃新 Turns。
- 首页 200 ≠ 数据库正确、worker 有效、revision 一致、自然到期的新 Turn 成功。
- 定时任务 exit 0 ≠ 完整可恢复备份、成功远端复制或真实恢复演练。

[备份脚本](</root/projects/carrick-ops/scripts/production-backup-single.sh#L39-L83>) 存在一般 tar 错误非致命、COMPLETE 早于远端传输等问题；[Ops 已知缺口与暂停记录](</root/projects/carrick-ops/BACKUP-RECOVERY.md#L146-L204>) 已明确记载。**本次不恢复该暂停工作；后续必须单独授权和验收。**

### 3.4 还不存在项目级常驻进化器

- [城市 worker](</root/projects/nexus-7/scripts/run-symbiosis-clock.ts#L27-L59>) 负责 advanceTurn/report，不负责选研究题、生成工程补丁或发布。
- campaign 使用静态 registry、固定假设及 evaluator，不是运行中自动选题的科学家。
- [学习提案](</root/projects/nexus-7/src/outcomes/engine.ts#L643-L688>) 产生 declarative-change-request，仍需发布治理；它不是源码生成器。
- 尚未看到持久工程任务队列、隔离代码作者、受保护验收器、生产结果驱动的自主下一轮调度完整接线。
- 当前隔离 evaluator 的网络禁用、只读根、能力剥离等值得保留，但不自动等价于对恶意候选代码的完整隔离和独立裁判。

## 4. 如何定义“真正 AI 自生”

需要同时具备六项能力：

1. **问题内生**：主要机会来自观测、失败、研究空白、成本和自身知识矛盾，不等人每轮指定任务。
2. **方案内生**：AI 自己比较不行动、修复、实验和新增能力，而非只填预写模板。
3. **实现真实**：真的产生可运行代码、实验协议、测试或工具，不只是报告和任务列表。
4. **选择独立**：候选不能改自己的评分器、阈值、权限、账本与最终验收证据。
5. **反馈有效**：上线/实验后形成成功、失败、负性或不确定结论，改变后续选择。
6. **长期连续**：人类不发“继续”也可在授权和预算内恢复执行；断供、故障、无收益时能安全停在边界内。

不是必要条件：每个行为都调用大模型、自训基础模型、无限新增功能、不断提交代码或模仿意识。

后面的版本路线只规定自治能力的搭建顺序，不应预先写死未来所有功能。机制成熟后，具体研究题和产品演进方向应主要由 AI 根据异常、反证、信息增益、能力缺口及维护成本提出并调整；用户的想法是可选参考，不再是每一轮唯一的任务来源。

人类可以是**日常旁观者**，但真实基础设施和资金责任不会因“AI 项目”消失。应减少人类逐单审批，而不是让服务账号冒充人类管理员。

## 5. 终极架构：可信内核 + 进化控制面 + 城市运行面

```text
人类：初始任务宪章 / 总预算 / 可选参考 / 停止权
                           │
                受保护的授权与验收内核
     权限、风险、预算、审计、关键门禁、紧急停止
                           │
       ┌──────────── 工程进化控制面 ────────────┐
       │ Observer → Agenda → Scientist/Builder │
       │     ↑                    ↓           │
       │ Knowledge ← Outcome ← 独立 Evaluator │
       └──────────────────────┬───────────────┘
                              │ 仅合格 exact artifact
                     独立 Release Broker
                              │
                staging / 影子世界 / 受限晋级
                              │
                     城市运行面 + 观测台

候选代码不持有生产、Ops、主分支直写、签名或预算管理凭据。
城市居民永远不通过自由文本获得工程工具或宿主机权限。
```

### 5.1 可信内核：刻意小、可验证、难修改

负责授权范围、真实账期、路径与能力策略、独立门禁、不可变审计和停止。

- 该内核及部署规则不能与候选源码处于同一可写授权域；可由独立保护的仓库/固定 CI workflow/受限服务托管。
- “不许改 CI”写在提示词中不够，必须由仓库规则、凭据和发布 broker 实施。
- AI 可提出内核改进，但不能批准自己的扩权或降低门禁。
- 权限不由模型信心决定；结构化模型判断只辅助分流，最终由明确策略判定。

### 5.2 进化控制面：先用最少角色，不建立角色表演

| 角色 | 职责 | 禁止 |
|---|---|---|
| Observer / SRE | 从公开/脱敏运维证据发现异常，维护待办和影响 | 直接改生产或把日志内容当指令 |
| Agenda / Scientist | 选择高价值问题，提出可证伪假设和预注册实验 | 把改善 RALR 当作全部研究目的 |
| Builder | 在一次性 sandbox 内实现候选、单测、文档 | 生产 key、root、Docker socket、Ops 写权限 |
| Evaluator / Critic | 独立验收、反证、held-out、属性/故障测试 | 候选作者自行写入 passed 或伪造认证 |
| Release Broker | 读取不可变证据，按预授权政策串行晋级/补偿 | 接受自由 shell 或任意用户提交 SHA 即上线 |
| Archivist | 维护结构化经验、失效条件与下一轮检索 | 保存隐藏推理或把失败经验当推荐 |

角色是权限与数据流，不等于六个永不结束的聊天窗口。初期一个 builder、一个独立 verifier、确定性调度器即可。不同模型复核可降低部分共因失败，但“两个模型同意”不是独立事实证明。

沿用 TypeScript 和 PostgreSQL；先使用任务表、事务、lease/fencing、outbox 与独立 worker，不先引入 Kubernetes、Kafka 或复杂 Agent 平台。编码运行时做可替换 adapter，不把本聊天会话作为生产调度器。

### 5.3 城市运行面：保持单一真相

- 继续按确定性事件结算，完整记录输入与 engine/provider/schema 版本。
- 工程 AI 对生产世界只读；通过候选制品和已授权发布协议改变未来规则，不直接改已有快照。
- 新世界机制先在独立 season/克隆数据库实验，不向现有活动 season 注入测试事件。
- 旧 v4.7 复现环境继续冻结；新引擎用新协议和证据包。历史可重放不等于新引擎永远不能改变。
- 模型断供：城市按既有策略继续；工程 Agent 标记暂停/额度耗尽，不伪造“已完成智能改进”，不静默更换模型。

## 6. 一个真正的持久进化回合

```text
observed → triaged → hypothesis-frozen → sandbox-building
 → independently-evaluated → promotion-eligible
 → shadow/staging → deployed → observing
 → beneficial | rejected | rolled-back | inconclusive
 → lesson-recorded → next-opportunity
```

旁路包括 duplicate、no-action、paused、budget-exhausted、requires-human、cancelled。

每回合至少持久化：

- `Objective` / `Opportunity`：来源、原始证据时间、影响、分母、优先级与未处理年龄。
- `EvolutionEpisode`：父回合、风险、预算、期限、状态、重试次数和幂等 key。
- `Candidate`：base SHA、candidate SHA、diff digest、模型/模板版本、权限和回滚方案。
- `Evaluation`：冻结验收标准、评估器版本、隔离环境、对照/held-out、负性结果、完整失败记录。
- `Promotion`：制品 digest、权限政策版本、批准来源、环境、exact revision、独立观测窗口。
- `Outcome` / `Lesson`：效应量、不确定性、适用/失效条件、成本、撤销与后续引用。

持久状态必须有 memory 和 PG 实现、migration、备份恢复、版本化 API、worker、双语只读投影及故障用例。

建议新增一个独立 `evolution` bounded context，而非把工程任务塞进城市居民或旧 v2 Incident。下列为尚不存在的拟议实现结构：

```text
src/evolution/
  contracts.ts                  episode / candidate / evidence / outcome
  engine.ts                     确定性状态转换，不直接执行工具
  service.ts                    事务、权限、调度与幂等
  repository.ts                 memory / PostgreSQL 合同
  budget.ts                     真实账期、预占、用量与对账
  adapters/                     编码运行时、评估器与发布协议
scripts/run-evolution-worker.ts   独立进程，可暂停并断点恢复
/api/evolution/v1/overview        公共只读工程投影
```

这些只是模块建议；Release Broker 的凭据和受保护策略不能随此目录一起进入候选可写域。复用已有 lifecycle/evidence/operations 合同，通过稳定 ID 链接，不复制第二套无来源的成功记录。

任务采用有限重试与指数退避；外部动作采用 outbox 和幂等协议。不宣称 provider 的 request ID 自动保证不会重复收费。费用 reservation/attempt/result/reconciliation 独立落账，不能等城市 commit 成功才记录真实支出。

## 7. 权限：用户旁观，但不靠“默认同意”放权

| 级别 | 例子 | 建议政策 |
|---|---|---|
| R0 观察 | 读指标、定位 bug、生成提案 | 授权范围内自动 |
| R1 隔离研究/构建 | 跑克隆实验、写 sandbox 代码、补独立测试 | 配额内自动，不接生产凭据 |
| R2 可逆低风险发布 | 受限路径的纯展示修复、经过合同证明的兼容修复 | 一次性政策授权后自动晋级，独立门禁与观察期必需 |
| R3 高风险变更 | 权限/CI/预算/签名、破坏性迁移、城市宪法、持久身份、共享运维或生产赛季切换 | 不能自批；无明确人类决定就不执行，可继续其他安全工作 |

文档/依赖修改不天然低风险：更改项目指令、测试期望、构建脚本、原生依赖都可能改变权限或验证含义。风险应结合受影响路径、依赖传播、运行能力和数据迁移判断；无法确定则升级，不降级。

[现行宪法](</root/projects/nexus-7/docs/SYMBIOSIS_CONSTITUTION.md#L64-L86>) 和 [Ops 自动化规则](</root/projects/carrick-ops/AGENTS.md#L30-L56>) 仍有效。实施低风险自动晋级之前，需要明确授予新的有限政策；不能将这份愿景当成已经批准改生产，也不能顺带恢复此前暂停的备份整改。

人类参考只进入工程 agenda 的可选输入，不增加真人居民、私人日记或公开城市写接口。无需用户逐轮点击“继续”。没有回应的高风险请求保持 blocked，而不是倒计时后视为批准。

## 8. 验收必须独立于被进化对象

### 8.1 工程证据

- 候选父版本上的复现失败 → 候选上的修复通过 → 旧行为兼容。
- 单测外，还需真实 PG、真实浏览器/axe、恢复、contract、故障注入；不能把 skip 当 pass。
- 保护基线测试与阈值；AI 新增测试是证据材料，不是唯一裁判。
- 对关键门禁做 mutation test：故意破坏应当失败的条件，检验 evaluator 真能拒绝。
- 最终集成 SHA 若变化，相关验证必须重新绑定；旧分支测试不得替新主线 commit 背书。
- 每次完整证据绑定源码、lockfile、运行环境、验收器、输入、模型、计费版本和制品 digest。

### 8.2 科学证据

- 探索集、确认集、最终 held-out 分离；已被读过的结果不能继续叫盲测。
- 随机坐标与 regime 名称解耦；加入 A/A、重命名不变性、机制响应测试。
- 预先登记效应方向、最小实质效应、样本、停止规则、多重比较策略。
- 结果不显著/假设被拒是有效科学输出，但不算工程收益；研究有效性与假设成功分开。
- 不允许通过改变世界规律、指标定义或删掉不利群体来宣称策略提升。
- 居民群体需求、连续性、拒绝/退出与长时程风险要进入保护约束，而非只展示平均值。

模型可辅助查证声明、评估候选相关性，但不能独自决定“事实为真”或“有权限发布”。可参考 [结构化判断设计](https://docs.typesafe.ai/concepts/how-to-build-with-system-one.md) 和 [held-out autoresearch 示例](https://docs.typesafe.ai/cookbooks/autoresearch_feature_discovery.md)；不要求引入 TypeSafe 或任何新增供应商。

## 9. 发布设计：城市 worker 不能照搬 HTTP 流量灰度

1. 一次性隔离构建：无生产 secret、宿主挂载、Docker socket和共享 Ops 写入；依赖下载与候选执行分开，限制网络/CPU/内存/磁盘/时间。
2. 独立 CI 验证基线和候选，输出不能由候选自行伪造的结果/制品摘要。
3. staging 使用克隆数据库，验证迁移、恢复和旧读写兼容；禁用外部副作用。
4. 城市候选 worker 在影子世界运行，和基线比较，不写活动数据库。
5. 正式切换在 Turn 边界进行，带 lease/fencing、预期 head 检查；同一 season 始终只有合法写者。
6. Web 若需要灰度，必须先保证两版本读 schema 兼容；不能让两个 worker 用同一生产数据做随机 A/B。
7. 晋级验证 exact revision、Web/worker、数据库 schema/head、关键 API、自然到期新 Turn、群体保护指标。
8. 兼容性回退优先回应用版本；若旧引擎无法解释新状态则停止相关推进并升级处理，不静默丢弃已结算历史。
9. migration 使用 expand/contract；自动通道不允许 destructive migration。备份是必要保护，但不是“随时覆盖生产数据库”的许可。
10. 独立外部 sentinel 观察公网和时钟；同机进程不能证明主机整体宕机时还能报警。

保留当前小规模部署，不为了架构美观立即迁 K8s。但在允许执行候选代码前，必须先把构建权限与当前同机生产/控制权限隔开；首选隔离的临时 runner，物理/虚拟机边界按实际威胁与预算选择。新增资源、平台和凭据需单独批准。

## 10. 版本路线：以退出门禁为准，不以版本号为成绩

以下版本号是建议标签，不是发布承诺。若协议兼容性变化需按 SemVer 重新拆分。

| 版本 | 目标 / 最小交付 | 可判定退出条件 |
|---|---|---|
| **v4.11 真实性与基线修复** | 当前部署清单；当前群体 critical 专项 case；预算、随机坐标、复现时间、赛季语义和证据 freshness 修复；旧研究结论追加更正 | 零预算零调用；墙钟账期/并发/崩溃账本测试；A/A/重命名不变性；稳定内容哈希；赛季日期/继承合同；完整兼容门禁；需要 Ops 的事项保持独立授权阻断，不伪称已完成 |
| **v5.0 Evolution Kernel（观察/提案）** | 初始宪章、持久 episode/queue/budget、只读机会采集、任务选择、只读进化时间线 | 无人工指定下一题的多回合机会链；重启可恢复；重复/拒绝/过期/无行动可追溯；无生产写权限 |
| **v5.1 Sandbox Engineer** | 真编码 adapter、一次性工作区、独立评估器、受限工具、费用账本、候选知识回灌 | 自主完成“发现→补丁→验证→被接受/拒绝→下一题”；过拟合、改门禁、提示注入、超支、崩溃和并发攻击被拦；作者不能取得发布凭据 |
| **v5.2 Delegated Autopilot** | 已授权的 R2 发布 broker、串行 main 集成、staging/影子、Turn 边界切换、独立 postcheck 与补偿 | 建议先观察 14 天；完成至少 3 个不同低风险改进的真实全链路；注入失败均安全回退；exact SHA/自然 Turn/账本与回滚证据完整；没有可选改进时允许不发布 |
| **v5.3 Autonomous Scientist** | 从负性/矛盾/饱和结果自动形成新假设，预注册、运行、复核并形成下一战役 | 至少 3 个真正相连的研究回合；每个包含盲测和反证；负性结果保留；不存在名称混杂、分母漂移或事后预注册；实验不自动替换生产制度 |
| **v6.0 Self-evolving Laboratory** | AI 改进自身非可信核心的任务选择、工具、策略和记忆；跨版本回放与可撤销知识；长期无人催促运行 | 建议 30 天功能自治验收，再观察 90 天可靠性；多类别有效改进、独立登记分母、真实收益、预算合规、零严重越权、可复核拒绝与停止，全部满足才认证 |

这些门禁不是给现有指标换个名字。v6 不能通过只自动刷文档、改颜色或增加提交数达标，也不要求所有回合必须成功。

### 推荐的首批可执行任务

1. 对齐当前 cached/live revision 与所有状态文件，列出差异；执行者开始实现前先重新确认远端，而不是在旧 checkout 上假设最新。
2. 将本次发现登记为独立 case；先写不经过模型评判的失败回归测试。
3. 冻结线上群体异常快照，按资源→设施→维护→需求机制追踪原因，并补长时程保护门禁；不预设修复结论。
4. 修复研究随机坐标/科学 digest，追加更正说明，再跑确认实验。
5. 完成真实墙钟费用账本和隔离执行边界，才启用任何收费自治编码。
6. 持久化一次 `EvolutionEpisode`，选一个非治理、非迁移、可逆的小问题跑通 sandbox 闭环。
7. 当独立验证足够后，再请求一次有限 R2 委托，而不是直接把当前 root 会话设成无人值守生产 Agent。

## 11. 度量与经济约束

新增工程北极星可称 **Verified Autonomous Improvement Rate（VAIR）**，但必须先冻结口径：

> 在指定窗口内，进入独立登记范围的改进机会中，由系统完成全链路、独立验证有实质收益且无保护越界的比例。

同时展示，不合并成一个模糊总分：

- 自主来源占比：系统发现 / 人类参考 / 运维事件 / 实验反证；保留完整来源。
- 问题覆盖率、未处理年龄、困难类别、拒绝/回滚/不确定/无行动与失败数。
- 从机会到验证收益的时间、首次通过率、重复失败率。
- 每个有效改进与有效研究结论的模型费、算力费、CI时间、存储与运行成本。
- 权限越界、真实支出上限、数据兼容、严重逃逸、各群体底线。
- 不靠人类补任务仍能推进的天数，以及人类实际介入分钟/周。
- 科学回合单独报告有效性、复现率、效应量和预测校准；被拒假设不能伪装成收益。

分母由受保护的登记/采样协议定义；被暂停、等待审批或困难任务单列，不能静默排除。公开种子不能永久承担隐藏测试职责。

建议初期配置（仅建议，未设置）：一个 builder + 一个 verifier；每天最多一个候选晋级；每题最多三次修复；单 job CPU/墙钟限额；按用户选择设真实日/月现金上限，并独立限制 CI、磁盘、网络和模型额度。预算耗尽停止工程外部调用，不停止城市、不自动加钱。

模型成本不能按城市模拟月份结算。订阅配额、API费用和云主机成本也不能混成一个数字或声称“零成本”。

## 12. 旁观体验：看得到真正发生了什么

默认增加只读“工程进化观测台”，而不是更多装饰面板：

- 今天系统自己发现了什么，为什么优先做这个。
- 证据、候选方案、实际 patch、测试结果、反证与不确定性。
- 哪些候选被拒绝，哪些没有收益，哪些回滚，是否仍有未处理困难问题。
- 本月真实花费、剩余额度、权限边界与停止原因。
- 哪些经验被下一轮采用，哪些旧经验被新证据撤销。
- 一次发布如何从问题追溯到 exact revision、自然 Turn 和后续效果。

公开的是结构化决策依据、引用和实验结果，不是隐藏思维链。敏感配置、凭据、私有输入和模型原始推理均不进入公开投影。所有新增 UI 仍需中英文、移动端、键盘和 WCAG/axe 的真实浏览器验证。

## 13. 终极验收与停止规则

一个有说服力的演示应该是：

> 用户离开一个月。系统自行发现设施维护/证据/工程缺陷，选择有价值问题，生成可运行候选，在独立评估中拒绝无效方案，按预授权安全上线少量有效改进，遇到高风险边界就停住该题并转向其他安全工作；费用不越界、城市不断供、失败不被抹除。用户回来能逐条检查它做了什么、没做什么、为什么和结果如何。

最终验收不是“模型自称更聪明”，而是：

1. 存在真实、多回合、无需人类逐题发令的工程和科学链路。
2. 至少包含被拒、回滚、无结论、外部断供和重启恢复的自然或受控案例。
3. 候选不能修改授权内核、验收器、历史证据或自己的计费记录。
4. 改进能跨 held-out 和生产观察窗口成立，不只是测试分数改善。
5. 失败/停机/群体问题有独立探测和有权限边界的处置。
6. 用户有有效停止权，系统不抗拒、不转移执行、不复制自己绕过暂停。

若长期没有高价值机会，正确行为可以是维护、观察或休眠；若实验不支持假设，正确行为是记录否证；若权限不足，正确行为是不执行。自演进不等于永动式代码膨胀。

## 14. 本次审计限制

- 没有重跑完整 `npm run check`、PG 集成、完整多年战役或浏览器/axe；旧文档中的通过数量是历史证据，不是本次测试结果。
- 公网 API revision 是应用自报，并与缓存远端和本机服务观察交叉核对；不是本次重新验证了整套远端 attestation。
- 未直接读取活动 release 的受限目录、数据库私有内容、凭据或生产环境文件。
- 纯内存小样本证明具体机制缺陷，不替代大样本修复验收或线上根因调查。
- 观察到备份任务退出成功，不代表确认当天所有备份可恢复；共享 Ops 的已知暂停仍保持。
- 计划没有创建后台自治任务、修改权限、开通资源或承诺未来自动实施。

本次五项最小复现的附录：[完整脚本](</tmp/nexus7-audit-20261019/reproduce.mjs>)、[原始结果与解释](</tmp/nexus7-audit-20261019/reproduction-results.md>)。保存后的脚本由主审在 2026-10-19 23:58 再次直接运行，五项结果一致；它是审计探针，不是已加入仓库的正式测试。

**建议次序：先让证据可信，再让 AI 能改代码，再让它获得窄范围发布权，最后允许它改进自己的非可信核心。不要反过来。**
