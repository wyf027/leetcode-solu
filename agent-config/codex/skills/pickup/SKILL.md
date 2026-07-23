---
name: pickup
description: Inspect and safely continue an existing Git task. Use when the user says pickup, 接手, 继续之前的任务, 换工具继续, 恢复现场, or asks Codex/Claude to continue work started by another tool, session, or person.
---

# Pickup

Prepare a continuation plan before changing files.

1. Resolve the Git repository root and current worktree.
2. Read applicable global and project instruction files.
3. Inspect the current branch, HEAD, `git status`, recent commits, and remote divergence without mutating the worktree.
4. Locate the active task card under `.ai/tasks/`. If several candidates exist, use branch, owner, status, and recent commits to identify the best match; ask only when the choice would materially change the work.
5. Read linked plans, architecture notes, acceptance criteria, and verification instructions.
6. Identify uncommitted changes, running side effects, known failures, prohibited files, and the current write owner.
7. Summarize in at most five concise points:
   - current objective;
   - branch, HEAD, and worktree state;
   - completed work;
   - risks or blockers;
   - the single next action and its verification.
8. Wait for confirmation before writing when the task card requires a handoff acknowledgment or the intended next action expands scope. Otherwise continue when the user already explicitly authorized execution.

Treat Git, the task card, and verification evidence as authoritative. Do not reconstruct critical state from chat history alone.
