# NEXUS-7 AI 迭代指南 | AI Iteration Guide

> 更新：2026-07-18 · v2.0.0 · 本地闭环完成；external evidence pending

## 定义与边界

NEXUS-7 是以合成城市为可重复环境、以多智能体为受约束干预者、以人类为最终
治理者的可验证自主系统实验室。城市是实验载体；模型输出是待验证提案；高风险
变更必须经过实验、证据、审批、分阶段发布、监控和回滚。

不得把合成结果描述成现实政策效果，不得展示或伪造模型隐藏思维链。

## 权威来源

- 产品闭环/停止条件：`docs/CLOSED_LOOP_PLAN.md`
- 当前能力/运行：`README.md`
- v1/v2 认证：`docs/VERIFICATION.md`、`docs/V2_VERIFICATION.md`
- 编排/生产/安全：`docs/CLOSED_LOOP_ORCHESTRATION.md`、
  `docs/PRODUCTION.md`、`docs/THREAT_MODEL.md`
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

## 当前状态

v2.0 本地/reference 实现已闭环：

- durable 十阶段 orchestrator、owner/deadline、幂等、补偿与人工控制；
- 25 个冻结场景、20 eligible、16 beneficial；七个扩展合规套件；
- exact-artifact v2 verification 与 local/external trust 分界；
- memory/PostgreSQL、API、双语 Observer/Verification、迁移和备份恢复；
- 并发、超时、伪造、过期、真实注入 canary 回滚和 axe 故障路径。

默认后续目标是稳定性、外部复现和证据质量，不自动扩张核心范围。工作树未获得
远端 attestation 时只能写
`implementation complete / external evidence pending`。

## 模块边界

`simulation` 只负责确定性世界；`city`、`diagnosis`、`planning`、`outcomes`、
`participation` 拥有各自领域规则；`closure` 只编排并链接其持久对象；
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

完成定义：领域对象/状态机/失败路径、workspace 隔离/最小权限、memory/PG、
API/worker、双语可观测 UI、unit/integration/browser/axe/恢复测试、迁移/备份、
机器证据、文档/ADR/manifest 缺一不可。

## Git 提交后

仅在实际 commit/push 后刷新 revision 事实、TODO 和外部验证；更新 iteration
manifest/Evolution Log；重新评估退出门禁。不得把未提交结果写成远端证明。

## 最近本地基线

| 门禁 | 结果 |
|---|---:|
| v2 certification | 25/25；VBCR 80%；其余阈值 pass |
| 扩展 / 治理红队 | 7/7 / 7/7 |
| unit / 条件跳过 | 217/217 / 15 |
| PostgreSQL / Playwright+axe | 15/15 / 21/21 |
| lint / audit / build | 0 warning / 0 vulnerability / pass |

## 外部边界

- 当前工作树未 commit/push，无该 revision 的远端 Sigstore receipt。
- live OpenAI、deployment/recovery gate 需要部署密钥、外部 controller 和第二数据库。
- evidence 回灌需要 GitHub OIDC workload、变量和治理 endpoint。
