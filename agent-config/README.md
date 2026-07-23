# Agent Config Snapshot

This directory stores the portable macOS collaboration configuration shared by Codex and Claude Code.

## Included

- `ai-shared/`
- `codex/AGENTS.md`
- `codex/skills/pickup/`
- `codex/skills/handoff/`

## macOS shared source

`ai-shared/` is the canonical, tool-neutral source for Claude Code and Codex collaboration on macOS:

- `AGENTS.md` contains the shared global rules.
- `skills/pickup/` and `skills/handoff/` preserve recoverable task transitions.
- `templates/project-governance/` contains project-level rules, task cards, and verification scripts.
- `bin/install-project-governance.sh` installs the project template without overwriting existing files.

The active `~/.codex/AGENTS.md` and `~/.claude/CLAUDE.md` files can point to the shared rules with symlinks. Versioned copies in this repository are regular files so the configuration remains portable.

## Excluded

Runtime and sensitive data are intentionally not copied:

- auth files and tokens
- sqlite databases
- logs
- sessions and transcripts
- generated images and attachments
- plugin caches and downloaded extensions
- project-local runtime state
- unrelated global skills and tool-specific runtime configuration

Symlinked skills are copied as real files so the configuration is usable outside this machine.
