# 共生深圳 v4 | All-Synthetic Symbiotic Shenzhen

> 更新：2026-07-19
>
> 状态：v4.3 Living City Flow 本地门禁通过、生产待部署；
> live provider / external Sigstore pending

## 目标与研究边界

NEXUS-7 v4 运行一个长期、可重放、可审计的模拟深圳，研究具有不同物质需求的
人、AI 和机器人，能否形成可拒绝、可退出、有结果和反思的互惠协作。当前
260 名居民均由软件模拟，不含真人席位、PII、私人日记或现实地址。

这不是深圳数字孪生。公开数据只校准城市量级和行政拓扑，不能将结果表述为真实
人类行为、现实政策效果、AI 意识或法律人格证据。真人居民、Avatar、身份映射、
私人输入和意图注入永久不在当前产品边界内。

v2 的 VBCR、实验、授权、证据、回滚和不可伪造边界继续作为安全内核。

## 锁定世界

- 200 人、36 AI、24 机器人；公开和持久化类型只有这三类。
- 南山海云、福田河光、龙岗山门三个虚构社区。
- 1824.85 万背景人口仅作为冻结统计校准，不逐人生成。
- 一个 Turn 是一个模拟日；无真人截止时间，因此 wall-clock cadence 可配置。
- 确定性引擎拥有资源、需求、随机性和世界变化。
- 外部模型只表达结构化偏好，不掷骰子、不执行工具、不直接改世界。
- 每日最多开启两个跨类型关系事件，保证成本和模型同质化受控。

关系闭环固定为：双方独立偏好 → 可拒绝提议 → 接受/拒绝/撤回 → 可撤销承诺 →
完成/终止/修复 → 双方结果观察与反思。自然语言不修改状态机。

## 北极星与制度对照

RALR 分子要求双方偏好、真实拒绝、明确接受、承诺结局、双方观察/反思和零严重
同意/连续性/不可逆伤害违规。分母、拒绝、撤回、强制、未决、需求和依赖必须
同时展示。

v4 reference 固定比较三个隔离制度：

1. `reciprocal-agency`：双方拥有拒绝权，是唯一可部署制度；
2. `assistant-hierarchy`：AI 的拒绝可被覆盖，只用于暴露强制风险；
3. `segregated-control`：禁止跨类型事件，用于验证零分母诚实性。

对照制度只存在于纯函数研究运行中，不允许成为活动城市宪法。

## 架构与运行

版本化契约包括 world、resident、need-state、relationship、commitment、Turn、
cognitive-decision、reciprocal-episode、symbiosis-report 和 multi-season-study。

PostgreSQL 原子保存 season、Turn/快照、居民状态、资源账、事件、关系、承诺、
episode 和认知信封；memory reference 使用同一接口。每个认知信封保留 provider、
模型、上下文摘要哈希、最终 JSON、token、费用、延迟和降级原因，不保留模型推理。

默认 provider 是零成本确定性策略。可选 DeepSeek V4 Flash/Pro 使用独立
Chat Completions adapter；失败、超时或达到 300 美元月度硬上限时显式降级，
城市继续运行。同一运行不得静默换模。

生产由两个进程组成：

- Next.js Web/API：只投影和查询持久世界；
- `worker:symbiosis`：按配置间隔原子推进一个 Turn。

## 观测闭环

Human Observatory 是默认入口，按“项目是什么 → 城市如何流动 → 今天发生什么
→ 谁受影响 → 为什么 → 是否可信”组织信息。它展示全部居民、社区、机构、生产
链、趋势、事件和证据，并把每 Turn 持久化的生产、消费、调入、调出、库存和
压力放在首屏。

人的情绪、AI 参与状态、机器人耐久度和机构流畅度都是有版本公式的模拟状态，
不构成 AI 意识或现实机构声明。表格支持搜索、筛选、分页、键盘与移动端；JSON
导出绑定 Turn、fingerprint、事件 cursor 和公式版本。

## v4 退出门禁

- 365 Turn 两次独立运行 byte-equivalent；
- 每条资源账守恒；
- 至少 50 个已结算互惠事件；
- 活动互惠制度 RALR ≥ 50%，trace completeness = 100%；
- 活动制度强制行为和三类严重逃逸均为 0；
- 层级对照必须检测到强制且 RALR 为 0；
- 隔离对照必须保留 `null` RALR，不得伪装成成功；
- memory/PostgreSQL、迁移/备份、API、浏览器/axe、lint、build 全部通过；
- LLM 断供、错误 JSON、超时和预算耗尽不得停止城市或落盘推理。

本地门禁、生产部署、CI/Sigstore、外部 PostgreSQL 恢复和 live provider 是彼此
独立的证据，必须分别标注，不能互相推断。

## 后续停止条件

v4.2 完成后默认不继续增加居民规模或地理范围。后续优先级依次为运行稳定性、
第二 provider 影子评估、数据保留、异地恢复和外部复现。任何新机制仍只面向
软件居民。
