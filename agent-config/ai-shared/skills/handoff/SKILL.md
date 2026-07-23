---
name: handoff
description: Create a recoverable Git checkpoint before work changes tools, sessions, or owners. Use when the user says handoff, 交接, 收工, 换工具, 切换会话, 上下文快满, 暂停任务, or asks to preserve the current implementation state for later continuation.
---

# Handoff

Leave the task recoverable without relying on chat history.

1. Stop or identify active writes, migrations, deployments, dev servers, and background jobs. Never leave an unknown side effect running.
2. Record the repository root, worktree path, branch, HEAD, `git status`, and a concise diff summary.
3. Run the smallest relevant verification available for the current milestone. Record failures honestly; do not hide them or broaden scope merely to make the handoff green.
4. Create a normal commit or clearly labeled local WIP commit only when the user or standing project workflow authorizes committing. Do not replace a recoverable checkpoint with an unnamed stash.
5. Update the active task card under `.ai/tasks/` with:
   - objective and non-goals;
   - completed and incomplete work;
   - changed files and key decisions;
   - verification commands and results;
   - known risks or failures;
   - current owner;
   - exactly one next action.
6. Mark the previous writer as stopped or handed off. Do not imply concurrent write ownership.
7. Report the checkpoint commit, dirty files if any, verification state, and next action.

Never include credentials or secret values in the task card, commit, logs, or response.
