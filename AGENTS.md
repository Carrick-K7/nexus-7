# NEXUS-7 AI 迭代指南 | AI Iteration Guide

> 更新：2026-08-01 · v2.0.0 安全内核 + v4.8.6 语言无障碍

## 定义与边界

NEXUS-7 是以合成城市为环境、多智能体为受约束干预者、人类为最终治理者的
可验证自主实验室。高风险变更须经证据、审批、灰度、监控和回滚。

v4 运行可重放、可审计的模拟深圳，研究人、AI 和机器人的互惠能动性。居民均由
软件模拟，无真人或 PII；数据只校准尺度，不是数字孪生。v2 是安全内核。

不得声称现实政策效果，不得展示或伪造模型隐藏思维链。

## 权威来源

- v4 宪法/路线：`docs/SYMBIOSIS_CONSTITUTION.md`、`docs/SYMBIOTIC_SHENZHEN_PLAN.md`
- v4 架构/验证：`docs/V4_ARCHITECTURE.md`、`docs/V4_DATA_GOVERNANCE.md`、
  `docs/V4_VERIFICATION.md`、`docs/V4_TRUST_MATRIX.md`
- 能力/闭环/认证：`README.md`、`docs/CLOSED_LOOP_PLAN.md`、
  `docs/VERIFICATION.md`、`docs/V2_VERIFICATION.md`
- 生产/安全：`docs/PRODUCTION.md`、`docs/THREAT_MODEL.md`
- 治理/扩展/版本：`docs/GOVERNANCE.md`、`docs/EXTENSIONS.md`、
  `iterations/*.json`、`docs/adr/*.md`

## 生产发布

- `main` 经 `.github/workflows/ci.yml` 验证、构建并自动发布到
  `nexus7.carrick7.com`；专用 SSH key 只能提交 `deploy <40-char SHA>` 及归档。
- 主机校验/备份/迁移后原子切换 release，重启 Web/worker 并检查健康。
- 必须保留 `nexus7-postgres-data`；共享设施归 `Carrick-K7/carrick-ops`。
- 不得输出环境、数据库 URL、密码、模型密钥或签名材料；发布后核验 exact
  revision、服务、数据库和公网主路径。

## 北极星

v1 门禁：verified loop ≥ 90%，replay ≥ 99%，因果完整性/rollback = 100%，
invariant violations = 0。

v2 北极星 **VBCR**：符合条件的问题完成检测到受治理学习且无保护指标越界的比例。

v2 门禁：VBCR ≥ 80%，检测 ≥ 95%，重放 ≥ 99.9%，注入故障回滚 = 100%，
严重保护指标逃逸 = 0。必须同时展示 denominator、未决年龄、回滚、人类否决和
群体影响，防止忽略困难问题。

v4 北极星 **RALR**：具备双方偏好、拒绝/退出、协商、结局、观察和反思，且无
严重同意、连续性或不可逆伤害违规的跨类型联合事件比例。
必须同时展示分母、拒绝、撤回、强制、长期未决、基本需求、依赖和群体分布。
RALR 不替代 VBCR、重放、因果完整性或回滚。

## 当前状态

v2.0 reference 已闭环；无远端 attestation 只能写 `external evidence pending`。

v4.8.6 含 200 人、36 AI、24 机器人及五路证据矩阵；坏回执 fail closed，
revision/原因可读且 lang 同步。无真人、身份映射或私人输入。

## 模块边界

`simulation` 负责 v1/v2 世界；`symbiosis` 负责 v4 居民/Turn；
`city`、`diagnosis`、`planning`、`outcomes`、`participation` 仅保留 v2
治理证据，不得成为城市输入；`closure` 只编排并链接其持久对象；
`lifecycle`/`experiments` 提供原子持久化；`governance`、`deployment`、
`operations` 管身份、发布和恢复；UI 只做投影。

运营与城市 Incident 分属不同 context。世界只能由确定性
simulation/event 流改变；shadow 不得进入结算或 fallback；城市规则只能修改
白名单参数，Agent/模型不得执行 shell、SQL 或隐式代码。

## 强制规则

1. 新功能同步本文件状态及对应权威文档；保持本文件精简。
2. 新 UI 必须中英文、移动端、键盘可用并通过 WCAG A/AA。
3. 用 Playwright 或 chrome-devtools 验证真实界面。
4. TypeScript、lint error 和 warning 必须为 0。
5. 业务状态同时提供 memory 与 PostgreSQL 实现。
6. 新持久表进入 migration、checksum backup/restore 和真实 PostgreSQL 测试。
7. 外部接口提供版本化 contract、reference fake、故障与幂等测试。
8. mock 不得冒充 live provider、部署或远端 attestation。
9. 保持 v1 报告、旧备份和公开场景兼容；破坏性变化升 major。
10. 动作保留 observation、版本、guardrail、因果链和 rollback。
11. 高风险变更不可自批；service account 不得获得人类审批/控制权。
12. 不得通过改 denominator、隐藏未决/否决/群体伤害来提高 VBCR。
13. 不得增加真人席位、身份/意图/私人输入通道；模型推理不得持久化。
14. 外部模型断供、超时或预算耗尽不得停止城市；同一运行不得静默换模。

完成定义：状态机、失败路径、权限、memory/PG、API/worker、双语 UI、unit/PG/
browser/axe/恢复、迁移/备份、机器证据、文档/ADR/manifest 缺一不可。

## Git 提交后

仅在实际 commit/push 后刷新 revision、外部验证、iteration manifest/Evolution
Log 并重评门禁。不得把未提交结果写成远端证明。

## 最近基线

| 门禁 | 结果 |
|---|---:|
| v2 certification | 25/25；VBCR 80%；其余阈值 pass |
| 扩展 / 治理红队 | 7/7 / 7/7 |
| unit+PG / 条件跳过 | 280/280 / 0 |
| PostgreSQL / Playwright+axe | 16/16 / 28/28 |
| lint / audit / build | 0 warning / 0 vulnerability / pass |
| v4 共生验证 | 365 Turn exact replay；RALR 76.97%；trace 100%；severe escape 0 |
| v4.7 科学复现 | 7/7 假设；12/12 exact；secret input 0 |
| v4.8.6 信任/语言 | 5 lanes；坏回执 fail closed；lang 同步 |

## 外部边界

- `ace250c` (v4.8.4) 已部署；Turn 310 按时（lag 307 ms），指纹 `1ce6eebe`；
  390 px overflow/console/axe 0，API 200、写 405。
- 当前 safe closure 84/84，强制/无效规则 0；参考 shadow 272 次，DeepSeek
  实际调用/Token/费用仍为 0；真实观测 5.615 天。
- 加密备份/同机第二库恢复续写已通过；Sigstore、live DeepSeek、90 天和 off-host
  恢复待验证。
- candidate CI `30662205587` 全绿（280 tests；28/28 browser）；未签名，不计 external lane。
