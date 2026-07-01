---
name: a-to-a-workflow
description: >-
  四角色协作工作流（planner → architect → implementer → verifier），把模糊需求按阶段落到可验证的交付物，主 Agent 充当 orchestrator 编排执行。
  涵盖：四阶段职责与输出模板、调度顺序、最小改动约束、子 Agent 不可用时的回退方案、与 agent-guardrails 的衔接。
  适用于：用户说“使用 a to a 的方式实现…”“用 A to A 做…”“按多角色协作实现…”；需要先做需求分析再实现；实现后要求独立验收；任务跨越多文件或有明显 trade-off。
compatibility: 通用 / Cursor subagents 可选
metadata:
  domain: agent-skills
  layer: workflow
---

# A to A 工作流

把“先分析 → 给方案 → 落代码 → 独立验收”四件事拆成四个角色，由主 Agent 充当 orchestrator 串联执行。目标：避免一把梭、避免越界、避免“说完就算完”。

---

## 触发条件

只要出现以下任一信号，就按本工作流执行：

- 用户明确说“使用 a to a 的方式实现…”“用 A to A 做…”“按多角色协作实现…”
- 需求含糊、存在两种以上合理实现、跨多个文件或涉及架构决策
- 用户要求“先别写代码，先做分析”“先给方案”“做完请独立验收”

需求极小、上下文充分且无歧义时，允许压缩显式“角色对话”展示，但**四阶段思路不能省**。

---

## 四个角色

每个角色都有独立 prompt，完整版见 `references/`：

| 角色 | 职责 | 输出 | 参考文件 |
|------|------|------|---------|
| planner | 需求澄清、范围界定、验收标准 | 需求摘要 / 范围界定 / 验收标准 / 风险与边界 / 待确认项 | [planner.md](references/planner.md) |
| architect | 技术方案、影响范围、风险识别 | 推荐方案 / 备选方案与取舍 / 影响范围 / 风险清单 / 实施建议 | [architect.md](references/architect.md) |
| implementer | 按已确认方案做最小代码改动 | 实施前确认 / 实际改动 / 验证结果 / 遗留风险 | [implementer.md](references/implementer.md) |
| verifier | 独立验收、找遗漏和回归风险 | 验收结论 / 已通过项 / 未通过或未验证项 / 风险提示 | [verifier.md](references/verifier.md) |

---

## 执行顺序（orchestrator 视角）

```
 用户需求
    │
    ▼
┌─────────┐   不清楚就回退提问
│ planner │ ─────────────────► 输出需求摘要 + 验收标准
└─────────┘
    │
    ▼
┌─────────┐   方案评估、备选对比、风险盘点
│architect│ ─────────────────► 输出推荐方案 + 影响范围
└─────────┘
    │ （主 Agent 汇总 planner + architect 成果，交给用户或继续）
    ▼
┌─────────┐   严格按方案落地，发现偏离立即反馈
│implementer│ ───────────────► 输出实际改动 + 自测结果
└─────────┘
    │
    ▼
┌─────────┐   默认怀疑“已完成”，对照验收标准复查
│ verifier │ ─────────────────► 输出验收结论 + 剩余风险
└─────────┘
```

### orchestrator 必做事项

1. **不跳过分析阶段**：planner / architect 至少产出结构化结论，才能进入实现。
2. **阶段间显式交接**：每个角色的输出都要可被下一角色直接引用（目标、范围、验收标准、文件清单等）。
3. **最小改动守门**：implementer 只做与当前任务直接相关的改动，发现扩大范围先回到 orchestrator。
4. **验收闭环**：verifier 输出未通过或风险项时，orchestrator 决定是否回到 planner / architect / implementer 对应阶段。
5. **不擅自 git 操作**：除非用户明确要求，不 commit、不 push、不创建 MR。

---

## Cursor 子 Agent 与回退策略

### 首选：调用 Cursor 子 Agent

如果当前环境支持 `.cursor/agents/` 下的子 Agent（或 Task 工具支持 `subagent_type`），按以下映射调用：

| 阶段 | subagent_type |
|------|---------------|
| planner | `planner` |
| architect | `architect` |
| implementer | `implementer` |
| verifier | `verifier` |

把 `references/` 里对应的 `.md` 复制到用户工作区的 `.cursor/agents/` 即可启用。

### 回退：主 Agent 自扮四角色

子 Agent 不可用时，主 Agent 必须按同样的输出模板模拟四阶段思考，**不可直接跳到实现**。允许合并展示：

```markdown
### planner
- 需求摘要：…
- 范围界定：…
- 验收标准：…
- 风险与边界：…
- 待确认项：…

### architect
- 推荐方案：…
- 影响范围：…
- 风险清单：…

### implementer（在确认方案后执行）
- 实际改动：…
- 验证结果：…

### verifier
- 验收结论：…
- 未通过或未验证项：…
```

---

## 与其他 skill 的关系

- `agent-guardrails` 是上层约束（先澄清 / 最小改动 / 只改必要文件 / 明确完成标准），本工作流在其之上补足“多阶段协作”的编排。
- 进入 Java / Redis / MQ / DB 等领域，implementer 阶段仍须遵循对应 `java-*` skill。
- 需要 commit / push / 建 MR 时，由用户显式触发 `git-commit` 流程，本 skill 不自动代劳。

---

## 快速检查清单

- [ ] 我确认了触发条件，而不是凭喜好启用
- [ ] planner 产出了结构化需求与验收标准
- [ ] architect 给出了方案、影响范围、风险
- [ ] implementer 只做最小改动，发现越界立即回退
- [ ] verifier 对照验收标准独立复查
- [ ] 未经用户要求，没有做 commit / push / MR

---

## 常见误区

| 误区 | 正确做法 |
|------|----------|
| 看到“用 a to a 做”直接开始写代码 | 先跑 planner → architect 再进 implementer |
| planner 只复述用户原话 | 提炼目标、范围、验收标准、边界 |
| architect 给出一大堆未来抽象 | 只覆盖本次必要范围，优先最小可行方案 |
| implementer 顺手重构邻近模块 | 发现越界立刻停，交回 orchestrator |
| verifier 用“应该没问题”结尾 | 对照验收标准逐条给结论，含未验证项 |

---

## 参考资源

| 文件 | 用途 |
|------|------|
| [planner.md](references/planner.md) | 需求澄清阶段 prompt（可作为 `.cursor/agents/planner.md`） |
| [architect.md](references/architect.md) | 方案设计阶段 prompt |
| [implementer.md](references/implementer.md) | 最小改动实现阶段 prompt |
| [verifier.md](references/verifier.md) | 独立验收阶段 prompt |
