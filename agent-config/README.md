# Agent Config Snapshot

This directory stores a versioned snapshot of global agent-related configuration from this machine.

## Included

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
