# Native Command-V paste

## Follow-up: raw Command-V fallback

- User reported native-profile-only fix still ineffective in the existing window.
- App now forwards modal Command keys to the shared router. Login/search accept
  raw Command-V by invoking bounded macOS pbpaste (2 s, 64 KiB) only on that key.
- Clipboard output/error objects never logged. Existing input limits/masking apply.
  Input revision and target checks discard results after switching/cancelling,
  typing, or receiving a native paste. Unknown Command keys never run app hotkeys.
- Real stdin driver synthetic probe passes both fields, search, stale cancellation,
  native-event deduplication, and no clipboard access in inactive areas. The actual
  clipboard was never accessed. Type/lint/format/diff checks passed.
- Not built on this turn; user needs an explicit build and restart for this fallback.

- Token-login screenshot reported Command-V doing nothing.
- Project Ghostty profile forwarded super+v as CSI 118;9u; App consumes Command
  keys outside Micro. Login/search handlers accept native paste events instead.
- Changed only the profile binding to paste_from_clipboard; existing bracketed
  paste routing serves both masked token fields, search and Micro. No host-side
  clipboard reader, credential persistence or new event-handling abstraction.
- Installed Ghostty +validate-config passed. Real stdin-driver + terminal App
  simulation reproduced dropped raw Cmd-V and verified native paste into both
  masked fields and search, draft clearing and no raw input in logs.
- Used synthetic strings only; never read or changed the real clipboard.
- No build/tests requested. Reload the project profile in a new Ghostty window;
  existing windows can use the terminal Paste menu. No commit/push.
