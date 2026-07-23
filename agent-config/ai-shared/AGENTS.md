涉及到生成html时，都使用tailwindcss

# Multi-Tool Collaboration

- Treat Git, versioned task cards, project documentation, and verification output as the sources of truth. Chat history and automatic memory are caches.
- For work larger than a trivial single-file change, use one task, one branch, one worktree, and one active writer.
- Before writing, inspect the repository root, branch, HEAD, worktree status, project instructions, and active task card.
- Record changing task state under `.ai/tasks/`; keep stable rules in `AGENTS.md` and detailed knowledge under project documentation.
- Before switching tools, stop active side effects, create a recoverable checkpoint, record verification results, and identify exactly one next action.
- Use the non-authoring tool or a fresh read-only session for independent review when practical.
- Do not claim completion without repeatable evidence such as tests, lint, type checks, builds, API probes, screenshots, or CI results.
- Keep production read-only unless the user explicitly authorizes a narrowly scoped production action.
- Never place secrets, tokens, passwords, cookies, private keys, raw credentials, or one-time codes in prompts, logs, task cards, commits, hooks, or memory.
- Use the `pickup` skill when taking over existing work and the `handoff` skill before switching tools, sessions, or owners.

<!-- goal-prompt-clarifier:start -->

# Goal Prompt Clarifier

Use `/Users/wuyangfan/.codex/skills/goal-prompt-clarifier/SKILL.md` globally when the user mentions `/goal`, goal mode, `goal模式`, `目标模式`, `create_goal`, `持久目标`, `完成条件`, `验收标准`, `预算`, or asks to turn work into a durable objective.

Before creating or activating a Goal, audit the prompt for outcome, verification surface, constraints, boundaries, iteration policy, and blocked stop condition. If any required part is missing or ambiguous, ask follow-up questions until the contract is clear. Do not start the Goal before all required uncertainty is resolved.

<!-- goal-prompt-clarifier:end -->

<!-- codebase-memory-mcp:start -->

# Codebase Knowledge Graph (codebase-memory-mcp)

This project uses codebase-memory-mcp to maintain a knowledge graph of the codebase.
ALWAYS prefer MCP graph tools over grep/glob/file-search for code discovery.

## Priority Order

1. `search_graph` — find functions, classes, routes, variables by pattern
2. `trace_path` — trace who calls a function or what it calls
3. `get_code_snippet` — read specific function/class source code
4. `query_graph` — run Cypher queries for complex patterns
5. `get_architecture` — high-level project summary

## When to fall back to grep/glob

- Searching for string literals, error messages, config values
- Searching non-code files (Dockerfiles, shell scripts, configs)
- When MCP tools return insufficient results

## Examples

- Find a handler: `search_graph(name_pattern=".*OrderHandler.*")`
- Who calls it: `trace_path(function_name="OrderHandler", direction="inbound")`
- Read source: `get_code_snippet(qualified_name="pkg/orders.OrderHandler")`
<!-- codebase-memory-mcp:end -->

<!-- my-ai-memory:start -->

# Personal AI Memory (my-ai-memory)

Use `/Users/wuyangfan/.codex/my-ai-memory` as the durable personal memory repository.

## Session Startup

At the start of a session, Codex should use the SessionStart hook to load all safe Markdown memory files from the repository into the conversation context. If the hook did not run or the needed detail is missing, inspect the repository directly before relying on memory-sensitive claims.

## Remember Triggers

When the user says phrases like `记下来`, `记住`, `记一下`, `记录下来`, `写入我的记忆系统`, `保存到记忆`, `长期记忆`, `remember this`, or `save this`, treat it as an explicit memory-write request.

Default behavior:

1. Capture the content into `/Users/wuyangfan/.codex/my-ai-memory/inbox/auto-captured/`.
2. Commit the memory repository change.
3. Push to `origin main` when Git credentials are available.
4. If push fails, keep the local commit and report that remote sync is pending.

Do not store secrets, API keys, tokens, passwords, cookies, private keys, raw credentials, or one-time codes. Store only safe references to where such credentials live.

<!-- my-ai-memory:end -->
