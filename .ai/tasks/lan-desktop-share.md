# LAN Desktop Share Migration

- Status: migration-verified-awaiting-commit-confirmation
- Branch: `codex/lan-desktop-share-tool`
- Active writer: Codex in the isolated `leetcode-solu` worktree
- Updated: 2026-08-21

## Objective

Migrate the complete LAN WebRTC desktop-sharing tool into
`project/lan-desktop-share/`, update the repository index, verify the migrated
copy, commit and push it, then remove the original local checkout only after
remote-state verification succeeds.

## Boundaries

- Preserve the existing LAN-only, video-only, 1–5 viewer behavior.
- Preserve host-approved, single-controller, 10-minute macOS control.
- Multi-display control must require numbered display identification and a
  room/host/configuration-bound selection.
- Do not add audio, recording, clipboard, file transfer, system shortcuts, or
  unattended control.
- Do not delete the source checkout until the target commit is present remotely.
- Do not add new automated tests; run the existing 27 tests plus lint, format,
  Tailwind, Swift release build, probe, and migration-integrity checks.

## Verification

- Source-only migration comparison passed for configuration, documentation,
  browser assets, Node source, Swift source, and the existing test suite.
- `npm run check` passed with all 27 existing tests.
- Swift format lint, release build, and live two-display probe passed from the
  target path after resetting copied build caches.
- Root repository lint and root index formatting passed.
- Target runtime served the page and LAN address API on port 4173.

## Delivery contract

Commit and push this verified target state first. Remove the original local
checkout only after the remote branch is confirmed to contain the commit.
