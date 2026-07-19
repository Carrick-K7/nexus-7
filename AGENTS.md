# NEXUS-7 AI 迭代指南 | AI Iteration Guide

> 更新：2026-07-19 · v2.0.0 安全内核 + v4.3.2 双主题城市界面

## 定义与边界

NEXUS-7 是以合成城市为环境、多智能体为受约束干预者、人类为最终治理者的
可验证自主实验室。模型输出是待验证提案；高风险变更须经证据、审批、灰度、
监控和回滚。

v4 运行可重放、可审计的模拟深圳，用于研究人、AI 和机器人在不同物质条件下的
互惠能动性。当前居民均由软件模拟，不含真人参与或 PII。它不是
数字孪生；数据只校准尺度，居民、社区、机构、关系和事件均为合成。v2 是安全内核。

不得把合成结果描述成现实政策效果，不得展示或伪造模型隐藏思维链。

## 权威来源

- 产品闭环：`docs/CLOSED_LOOP_PLAN.md`
- v4 宪法/路线：`docs/SYMBIOSIS_CONSTITUTION.md`、`docs/SYMBIOTIC_SHENZHEN_PLAN.md`
- v4 架构/数据/验证：`docs/V4_ARCHITECTURE.md`、`docs/V4_DATA_GOVERNANCE.md`、
  `docs/V4_VERIFICATION.md`
- 当前能力/运行：`README.md`
- v1/v2 认证：`docs/VERIFICATION.md`、`docs/V2_VERIFICATION.md`
- 编排/生产/安全：`docs/CLOSED_LOOP_ORCHESTRATION.md`、`docs/PRODUCTION.md`、
  `docs/THREAT_MODEL.md`
- 治理/扩展：`docs/GOVERNANCE.md`、`docs/EXTENSIONS.md`
- 版本事实/架构：`iterations/*.json`、`docs/adr/*.md`

本文件只保留执行规则和最近基线，不复制详细历史、API 或设计。

## 北极星

v1 兼容门禁：verified loop ≥ 90%，replay ≥ 99%，accepted causal
completeness = 100%，rollback = 100%，invariant violations = 0。

v2 北极星 **VBCR**：符合条件的问题中，完成检测、诊断、受控实验、授权、
分阶段执行、独立结果评估和受治理学习，且没有保护指标越界的比例。

v2 门禁：VBCR ≥ 80%，检测 ≥ 95%，重放 ≥ 99.9%，注入故障回滚 = 100%，
严重保护指标逃逸 = 0。必须同时展示 denominator、未决年龄、回滚、人类否决和
群体影响，防止忽略困难问题。

v4 北极星 **RALR**：具有双方偏好、真实拒绝/退出、协商/接受、承诺结局、结果
观察和双方反思，且无严重同意、连续性或不可逆伤害违规的跨类型联合事件比例。
必须同时展示分母、拒绝、撤回、强制、长期未决、基本需求、依赖和群体分布。
RALR 不替代 VBCR、重放、因果完整性或回滚。

## 当前状态

v2.0 本地/reference 已闭环；未获得远端 attestation 时只能写
`implementation complete / external evidence pending`。

v4.3.2 含 200 人、36 AI、24 机器人、Turn 资源流、Human Observatory 与
浅/深双主题；其余页面使用赛博朋克视觉层。真人接入、身份映射、私人输入和
居民登录不在范围。

## 模块边界

`simulation` 负责 v1/v2 世界；`symbiosis` 负责 v4 居民/Turn；
`city`、`diagnosis`、`planning`、`outcomes`、
`participation` 仅保留 v2 运营治理证据，不得成为城市输入；`closure` 只编排并
链接其持久对象；
`lifecycle`/`experiments` 提供 memory/PostgreSQL 原子持久化；`governance`、
`deployment`、`operations` 管身份、发布和恢复；UI 只做投影。

运营 Incident 与合成城市 Incident 是不同 bounded context。世界只能由确定性
simulation/event 流改变；Agent/模型不得执行任意 shell、SQL 或隐式代码。

## 强制规则

1. 新功能同步本文件状态及对应权威文档；保持本文件精简。
2. 新 UI 必须中英文、移动端、键盘可用并通过 WCAG A/AA。
3. 用 Playwright 或 chrome-devtools 验证真实界面。
4. TypeScript、lint error 和 warning 必须为 0。
5. 业务状态同时提供 memory reference 与 PostgreSQL 实现。
6. 新持久表进入 migration、checksum backup/restore 和真实 PostgreSQL 测试。
7. 外部接口提供版本化 contract、reference fake、故障与幂等测试。
8. mock 不得冒充 live provider、真实部署或远端 attestation。
9. 保持 v1 报告、旧备份和公开场景兼容；破坏性变化升 major。
10. 动作保留 observation、版本、guardrail、因果链和 rollback。
11. 高风险变更不可自批；service account 不得获得人类审批/控制权。
12. 不得通过改 denominator、隐藏未决/否决/群体伤害来提高 VBCR。
13. 不得增加真人席位、身份/意图/私人输入通道；模型推理不得持久化。
14. 外部模型断供、超时或预算耗尽不得停止城市；同一运行不得静默换模。

完成定义：领域对象/状态机/失败路径、workspace 隔离/最小权限、memory/PG、
API/worker、双语可观测 UI、unit/integration/browser/axe/恢复测试、迁移/备份、
机器证据、文档/ADR/manifest 缺一不可。

## Git 提交后

仅在实际 commit/push 后刷新 revision 事实、TODO 和外部验证；更新 iteration
manifest/Evolution Log；重新评估退出门禁。不得把未提交结果写成远端证明。

## 最近基线

| 门禁 | 结果 |
|---|---:|
| v2 certification | 25/25；VBCR 80%；其余阈值 pass |
| 扩展 / 治理红队 | 7/7 / 7/7 |
| unit / 条件跳过 | 229/229 / 16 |
| PostgreSQL / Playwright+axe | 16/16 / 26/26 |
| lint / audit / build | 0 warning / 0 vulnerability / pass |
| v4 共生验证 | 365 Turn exact replay；RALR 76.97%；trace 100%；severe escape 0 |
| v4 多季对照 | 3 regimes × 3 seeds × 90 Turns；mechanism separation pass |

## 外部边界

- v4.3.0 Tag/分支已 push；`bd285f9` 已部署至 `nexus7.carrick7.com`，三类居民
  迁移、资源流看板、双层写阻断、Turn 12 与升级前后备份已验证。
- 尚无 v4.3 的远端 Sigstore receipt；live DeepSeek、外部恢复演练和第二数据库
  待验证；生产既有 season 保留 v4.0 origin，逐 Turn revision 绑定仍待实现。
- evidence 回灌需要 GitHub OIDC workload、变量和治理 endpoint。
