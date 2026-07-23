---
name: frontend-governance-cleanup
description: 【已拆分为多文件体系，本文件作为索引】前端工程治理执行模型 v1.3.0 已拆分为 4 个职责单一的 Skill 文件 + 1 个 Rules 文件。请加载对应文件而非此文件。
license: MIT
metadata:
  author: zhangxia
  version: "2.0.0-index"
  suite: frontend-governance
  status: index-only
---

> **frontend-governance v1.3.1（稳定版）** · 已冻结，进入实战验证阶段，禁止在执行任务时直接修改 skill / rule。

# 前端工程治理 · 文件索引

> 本文件为索引文件，不包含可执行内容。v1.3.0 的所有内容已拆分至以下文件，请按任务类型加载对应文件。

---

## 文件结构

```
~/.cursor/
  skills/
    frontend-governance-core/SKILL.md        ← 调度器（第一步必加载）
    frontend-cleanup-playbook/SKILL.md       ← Cleanup 五轮手册
    frontend-bugfix/SKILL.md                 ← Bug 修复模式
    frontend-anti-patterns/SKILL.md          ← 11 条反模式 + 检测命令
    frontend-governance-cleanup/SKILL.md     ← 本文件（仅索引）
  rules/
    standards/
      frontend-governance.mdc               ← 硬约束规则（自动应用）
```

---

## 加载指南

| 任务类型 | 第一步加载 | 第二步加载 |
|---|---|---|
| 任何前端治理任务 | `frontend-governance-core` | 根据任务类型选下面 |
| 修 bug | `frontend-governance-core` | `frontend-bugfix` |
| 整体 cleanup | `frontend-governance-core` | `frontend-cleanup-playbook` |
| 定向优化（数据流/状态/UI/质量） | `frontend-governance-core` | `frontend-cleanup-playbook`（指定轮次） |
| 发现可疑代码，想检查反模式 | `frontend-anti-patterns` | — |
| 查看硬约束规则 | `frontend-governance.mdc` | — |

---

## 拆分说明

从 v1.3.0 单文件（1006 行）拆分为多文件体系：

| 原文件章节 | 迁移到 |
|---|---|
| 一、何时应用 | `frontend-governance-core` |
| ★ 二、执行决策流程 | `frontend-governance-core` |
| ★ 三、Bug 修复模式 + 验证闭环 | `frontend-bugfix` |
| ★ 三.五、修改范围控制 | `frontend-governance.mdc`（升级为硬约束） |
| 四、分轮 Cleanup 策略（五轮） | `frontend-cleanup-playbook` |
| ★ 五、常见反模式（11 条）| `frontend-anti-patterns` |
| 六、分层职责原则 | `frontend-governance-core`（参考图） |
| ★ 七、停止优化条件 | `frontend-governance-core` |
| ★ 七.五、安全回退策略 | `frontend-governance-core` |
| ★ 七.六、复杂任务分解 | `frontend-governance-core` |
| 八、注释规范 | `frontend-governance.mdc`（升级为硬约束） |
| 九、执行优先级与风险评估 | `frontend-cleanup-playbook` |
| 十、诊断工具箱 | `frontend-cleanup-playbook` |
| 十一、输出格式要求 | `frontend-governance-core` |

---

## 问题记录

> v1.3.1 已冻结，发现的执行问题或优化建议统一记录在此，不直接修改 Skill / Rule。积累后统一评审，进入版本升级流程。

| 日期 | 问题类型 | 触发场景 | 当前规则是否覆盖 | Cursor 行为偏差 | 建议调整方向 |
|------|---------|---------|----------------|----------------|-------------|
| — | — | — | — | — | — |
