# Agent Config Snapshot

This directory stores a versioned snapshot of global agent-related configuration from this machine.

## Included

- `ai-shared/`
- `codex/AGENTS.md`
- `codex/config.toml`
- `codex/prompts/`
- `codex/rules/`
- `codex/skills/`
- `cursor/mcp.json`
- `cursor/rules/`
- `cursor/skills/`
- `cursor/skills-cursor/`
- `agents/.skill-lock.json`
- `agents/skills/`

## macOS shared source

`ai-shared/` is the canonical, tool-neutral source for Claude Code and Codex collaboration on macOS:

- `AGENTS.md` contains the shared global rules.
- `skills/pickup/` and `skills/handoff/` preserve recoverable task transitions.
- `templates/project-governance/` contains project-level rules, task cards, and verification scripts.
- `bin/install-project-governance.sh` installs the project template without overwriting existing files.

The active `~/.codex/AGENTS.md` and `~/.claude/CLAUDE.md` files can point to the shared rules with symlinks. Versioned copies in this repository are regular files so the snapshot remains portable.

## Excluded

Runtime and sensitive data are intentionally not copied:

- auth files and tokens
- sqlite databases
- logs
- sessions and transcripts
- generated images and attachments
- plugin caches and downloaded extensions
- project-local runtime state
- `antview-incident` skills, because their incident assets contain environment-specific credentials and internal endpoints

Symlinked skills are copied as real files so the snapshot is usable outside this machine.
