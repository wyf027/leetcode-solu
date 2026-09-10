# Inline Vim workspace — approved 2026-09-10

Superseded by the user's Micro selection; see le-e-micro-editor.md for the current implementation.

- First row: full-width problem/folder list with a clickable collapse header.
  Collapsed state keeps the current problem visible. Second row: statement left,
  real Vim right; drag their divider with minimum widths and resize the PTY.
- Reuse the editor bridge and native Vim, with node-pty and @xterm/headless for
  the embedded terminal. Vim retains its own editing commands and configuration.
  F6/click switches panes; Tab and Ctrl+C belong to Vim while it has focus.
- Keep one active editor bound to the current problem/language; require quitting
  Vim before selecting a different problem, changing language, testing/submitting
  or exiting the TUI. :wq and :q! keep native save/discard semantics.
- No tests or builds requested. Use type/lint checks and a disposable PTY manual
  probe without touching user solution files. Existing newline fixes are preserved.
- Writer: current task, branch feat/le-e-inline-vim-20260910, existing isolated
  checkout based on 68454fec. Dependencies use shipped prebuilds, no native build.

## Implementation and verification

- Implemented App's two-row layout and pointer-driven divider. VimPane renders
  xterm cells with matching colors, CJK widths and the Vim cursor; mouse events
  use pane-local coordinates and capture release outside the pane.
- PTY probe used only a disposable Python file with `vim -Nu NONE -n`: Unicode
  multiline paste, resize to 72x18, :wq and file content inspection succeeded.
- Headless App snapshots confirmed first-row collapse, side-by-side statement
  and actual Vim text, resizing from 58 to 42 editor columns, and resizing while
  Vim mouse mode was enabled. Ctrl+C did not exit the host; :q! exited Vim.
- Typecheck, source ESLint, formatting and diff checks passed. Independent
  read-only review found mouse capture/coordinate issues, fixed and re-reviewed.
- No repository tests or build commands were run. Running built TUI remains
  unchanged until rebuilt. No user solution files were used in probes.
- Known boundary: input is normalized by the existing terminal driver, so rare
  unknown/extended key escape sequences are not passed through byte-for-byte.
