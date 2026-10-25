# NEXUS-7 AI 迭代指南 | AI Iteration Guide

> 更新：2026-10-23 · v5 有界研究站 / v2 安全内核 / v4.10.1 只读历史标本

## 定义与边界

NEXUS-7 正向反例驱动的计算研究站演进：城市是研究对象，而非不可修改的项目
身份。AI 可提出问题、执行有界实验和综合工具；事实、权限与验收不能由候选
自批。高风险变更仍须证据、授权、灰度、监控与回滚。

v4 保留长期模拟深圳：200 人、36 AI、24 机器人均为软件模拟，无真人、PII、
私人输入或现实城市控制。数据只校准尺度，不是数字孪生。v2 保留安全内核。
不得声称现实政策效果、AI 意识或法律人格，不得展示或保存隐藏思维链。

## 权威来源

- 研究站：`docs/RESEARCH_STATION.md`、`docs/adr/0042-counterexample-research-station.md`
- 方向草案（非已实现声明）：`docs/AI_SELF_EVOLUTION_PLAN.md`
- v4 宪法/路线：`docs/SYMBIOSIS_CONSTITUTION.md`、`docs/SYMBIOTIC_SHENZHEN_PLAN.md`
- v4 架构/数据/验证：`docs/V4_ARCHITECTURE.md`、`docs/V4_DATA_GOVERNANCE.md`、
  `docs/V4_VERIFICATION.md`、`docs/V4_TRUST_MATRIX.md`
- v2 闭环：`docs/CLOSED_LOOP_PLAN.md`、`docs/VERIFICATION.md`、`docs/V2_VERIFICATION.md`
- 生产/安全：`docs/PRODUCTION.md`、`docs/THREAT_MODEL.md`
- 治理/扩展/历史：`docs/GOVERNANCE.md`、`docs/EXTENSIONS.md`、`iterations/*.json`、`docs/adr/*.md`

## 开发与生产发布

- 开发在 `main`，不留长期特性分支；push 前 `npm run check` 必须全绿。
  main push 会经 CI 自动发布，不能把 push 当成无生产后果的保存动作。
- 专用 SSH publisher 仅接受 `deploy <40-char SHA>` 及归档；共享设施归
  `Carrick-K7/carrick-ops`。所有者已明确授权本次研究站上线及旧城市归档退役，
  仅限NEXUS必要的发布器/单元/权限/监控接线；不授权其他站点或付费模型。
- 当前生产位于 OrangeVPS；PG 容器 `carrick-postgres`，卷 `carrick-pg-data`。
  旧腾讯云 `nexus7-postgres-data` 是冷保留资料；两者均不得删除/替换。
- 每次切换必须具备明确恢复点；校验和/TOC不等于实际恢复。应用指针回滚不等于
  数据库回滚或零停机，不能覆盖新研究账本以抹去已花预算。新发布器与安装器共用
  项目锁；HTTP就绪与OS进程瞬时active仍不替代真实worker周期验证。
- 共享备份整改仍暂停；本次独立NEXUS备份/离线恢复不代表恢复该整改。不得顺势
  改其他凭据、DNS或服务；宿主包管理必须抑制无关服务的自动重启。
- 不输出生产环境值、数据库 URL、密码、模型密钥或签名材料。
  发布后必须核验 exact revision、Web/worker、数据库、主路径及真实研究进展；
  退休城市应核验head不再变化，不用人为补Turn伪造自然运行。
- 测试必须显式隔离 DB/模型环境。真实 PG 使用独立 test/restore 数据库；
  Playwright 的隔离启动器不得继承生产配置。不得在生产卷/数据库演练。

## 北极星与真实性

v1：verified loop ≥90%，replay ≥99%，因果完整性/rollback=100%，invariant violations=0。

v2 **VBCR**：符合条件的问题完成检测到受治理学习且无保护指标越界的比例。
门禁 VBCR≥80%、检测≥95%、重放≥99.9%、故障回滚100%、严重逃逸0；同时展示
分母、未决年龄、回滚、人类否决与群体影响，不得通过隐藏难题改善分数。

v4 **RALR**：双方偏好、拒绝/退出、协商、结局、观察和反思及零严重违规的
跨类型事件比例。必须展示分母、拒绝、撤回、强制、长期未决、需求、依赖和
群体分布。RALR 不是所有群体健康或真实独立认知的证明，不替代 v2 门禁。

研究站：分别展示已知审计种子、受控挑战和自然新发现；协议派生问题不等于新
命题。十轮是观察窗口，不是脚本或十个独立科学样本。不能调门槛、删除负性结果
或改分母凑绿。原反例复现与新样本泛化必须分开；新样本健康不能撤销原反例。

长期约束：无论怎样自主演进，都保留人类可理解、可核验的入口，不能由自动
演进删除或降级。用普通语言说明正在研究什么、依据与反例、改变了什么、花费
与未决边界，并可逐层追溯原始证据；不能用漂亮自述或指标堆砌替代理解。
默认首页与 `/human` 直接展示状态、结果和记录；防御性、解释性、指导性文案
直接删除，不折叠、不改写保留，展开详情也同样。详情保留原始数据与证据。
准确性由真实数据、准确状态和验证保障，不能用省略文案来编造成功或隐去错误。
细则见[概览界面约定](<docs/HUMAN_READING.md>)。

## 当前实现边界

- v4.10.1 城市writer按所有者决定于2026-10-23 21:31（上海）停止，最终Turn2317、
  fingerprint 83da794c，源码afed7d82…与数据保留；90天门禁捕获时仍pending。
  新版上线必须以生产health的exact SHA及真实worker进展证明，目录代码不算部署。
- `research` 是有界符号综合/条件归纳；真实模型调用/费用为0。研究账本会持久化，
  仪器不修改城市、部署或配置，没有任意源码执行、自动发布或自扩权能力。
- 一次性operator-delegated许可必须来自真实人类部署请求，绑定release/scope/完整
  预算/nonce/expiry且原子消费；执行者仍system，不伪造human/OIDC/第三方签名。
  许可helper不在公网或worker启动路径；独立worker无Docker/sudo/发布和模型凭据。
- 工具是封闭 JSON-AST 的可移植数据模块，由固定解释器执行。候选只能请求
  核心评价；服务私有回执绑定程序、输入、缩减输出、初始/后验/健康对照与燃料。
- memory/PG 复用 lifecycle 的单聚合原子提交；先预占、token fence、异常计费、
  过期保守核销、暂停阻止新调用。独立 worker 需显式启用和PG，不自动授权研究。
- 已加入有限条件命题归纳：完整同版本观测训练，先持久提案，再由私有F/T评测；
  反例驱动最多三次修订，最终审计一次性且不入训练。预算幸存不是证明，历史
  否证不可被后来健康样本撤销；命题经验由核心生成，候选不得自填confirmed。
- 自然未知缺陷、开放式命题生成和LLM工程自治仍未证明，不能由有限语法成果
  替代。旧审计种子不计新发现；旧数据/失败/退役采样协议记录不得静默改写。

## 模块边界

`simulation` 管 v1/v2 世界；`symbiosis` 管 v4 居民/Turn。`city`、`diagnosis`、
`planning`、`outcomes`、`participation` 只保留 v2 证据，不成为城市输入。
`closure` 只编排持久对象；`lifecycle`/`experiments` 提供原子持久化；
`governance`、`deployment`、`operations` 管身份/发布/恢复；UI 只做投影。

`research` 是独立 context：只读/纯内存研究仪器、受限 DSL、持久议程和证据。
不得引用生产 server factory 来推进城市或把 fixture 身份当真实人类授权。
世界只经确定性事件流改变；shadow 不得进入结算或 fallback；城市规则仅修改
白名单参数。城市居民/模型无 shell、SQL 或隐式代码权限。

## 强制规则与完成定义

1. 新功能同步本文件及权威文档；保持本文件精简。
2. 新UI中英文、移动端、键盘、WCAG A/AA，使用真实 Playwright/浏览器验收。
3. TypeScript、lint error/warning为0；条件跳过不算通过。
4. 持久业务状态必须有 memory/PG 合同；新物理表同步 migration、checksum备份/
   恢复及真实PG测试。复用既有通用表无需伪造空迁移。
5. 外部接口有版本化 contract、reference fake、故障和幂等测试。
6. mock、本地结果、静态字段不得冒充live模型、真实重放、部署或远端证明。
7. 保持v1报告、旧备份、公开场景兼容；破坏性变化升major。
8. 动作保留 observation、版本、guardrail、因果链和rollback；候选不能自批高风险。
9. service account不得获取人类审批权；公开观察入口只读，控制面独立鉴权。
10. 不增加真人席位、身份/意图/私人输入；模型推理不持久化。
11. 模型断供/超时/预算耗尽不得停止城市；同一运行不得静默换模。
12. 每个开发切片独立蓝军审视；修复后重验，不用旧通过结果替新代码背书。

完成必须包含状态机/失败路径/权限、memory/PG、API/worker、双语UI、unit/PG/
browser/axe/恢复、必要migration/备份、机器证据、文档/ADR/manifest。
仅实际commit/push后刷新revision与外部证明；未提交结果明确local/uncommitted。

## 历史基线（不是本轮重新执行结果）

v2认证25/25、VBCR80%；历史unit+PG283/283、PG16/16、browser+axe28/28。
v4参考365 Turn exact、RALR76.97%、trace100%、severe0；v4.7为7假设/12exact。
v4.9按宪法移除外部attestation必需项，双车道为本地复现与90天生产时钟。
v4.10战役/五年/多赛季结果保留在原报告；政策因果解释受已披露随机坐标混杂
限制，不得继续将旧差异写成已确认因果。详情与原始证据见方向草案和历史manifest。
