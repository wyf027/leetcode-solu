# Project Agent Instructions

## Project Map

- Keep this file concise and stable. Treat it as a map to the repository, not a task log.
- Document the project purpose, module boundaries, critical directories, and canonical commands below.
- Put changing task state in `.ai/tasks/` and detailed architecture under `docs/`.

## Required Discovery

Before writing or reviewing:

1. Inspect the repository root, branch, HEAD, and `git status`.
2. Read relevant nested `AGENTS.md` files and linked architecture or test documents.
3. Discover existing implementations, scripts, tests, and conventions before creating new ones.
4. Confirm the task card's allowed scope and acceptance criteria.

## Collaboration

- Use one task, one branch, one worktree, and one active writer for non-trivial work.
- Use separate worktrees only for tasks with non-overlapping file and semantic boundaries.
- Treat schema, authentication, billing, production data, deployment, and lockfiles as serial high-risk work.
- Use the non-authoring tool or a fresh read-only session for independent review when practical.
- Before switching tools, update the task card and leave a recoverable Git checkpoint.

## Verification

- Do not claim completion without repeatable evidence.
- Discover repository-provided commands; do not invent commands from memory.
- Record commands and result summaries in the task card or merge request.
- Keep production read-only unless a narrowly scoped production action is explicitly authorized.

## Security

- Never place secrets, tokens, passwords, cookies, private keys, raw credentials, or one-time codes in prompts, logs, task cards, commits, hooks, or memory.
- Use the minimum permission required for the current task.

## Project-Specific Entries

- Purpose: TODO
- Module boundaries: TODO
- Development command: TODO
- Fast verification: TODO
- Full verification: TODO
- Merge target and branch policy: TODO
- High-risk paths: TODO
