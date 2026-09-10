# Micro editor and action buttons — 2026-09-10

## GitHub delivery

- Final review narrowed Micro's inherited environment to explicit runtime and
  locale variables (including HOME/PATH), excluding unrelated credentials. Its
  terminal, private config and source-path overrides remain explicit.

- User requested committing/syncing code to wyf027/leetcode-solu. Append this
  implementation to existing open PR #2213 (fix/le-e-image-timeout-20260909),
  which currently ends at 68454fec; merging requires separate user authorization.
- Latest main fetched at eb23808d, already an ancestor of the working branch.
- Current typecheck, source ESLint, Prettier and diff checks passed; test files
  are unchanged. No tests or builds run during this delivery.

## Four-pane wheel routing

- Route wheel input by pointer location rather than keyboard focus for problem/
  folder list, statement, Micro and logs. List viewport scrolling never changes
  the selected problem/folder, including during editing. Divider wheel events
  are swallowed and zero deltas are ignored.
- Log direction respects its existing top-based failure view / bottom-based
  live log offset. Read-only wheel scrolling stays available while executing.
- Headless App + real Micro probe confirmed movement in list, statement, log,
  Micro and folder views, with selection unchanged. Type/lint checks passed.
- No build run for this wheel-support change.

## Native image layout/clipping repair

- vue-tui queues whole native PNG placements without viewport-height clipping;
  its virtual scroll also keeps placements whose anchor row is above the view.
  This caused clear images to overlap text/other images and extend into logs.
- Native PNGs now become full-resolution one-cell-high PNG strips separated by
  hard line breaks. This makes native placements follow text-row clipping and
  cleanup. Per-image output is bounded to 256 strips / 4 MiB; cache remains 8.
- Markdown width and image sizing share width-3; content height is height-6 to
  stay inside the border. Geometry/document changes remount the markdown view
  to delete old placements. Loading placeholders preserve image row height.
- Real native-graphics queue probes confirmed all placements are one-row high,
  non-overlapping and inside the viewport before/after scroll, resize and move;
  unmount removed every tracked image placement.

## Per-case result display

- Wrong-answer result cards now group each case with its own input arguments,
  actual output and expected output. Case count follows CLI answer records;
  input arguments are divided evenly only when all records are complete JSON
  and input/output counts agree. Truncated/ambiguous data keeps the original view.
- Headless probes confirmed two separate matrix cases, two-argument cases kept
  together, and ambiguous record counts not incorrectly grouped. Type/lint checks
  passed. No tests or builds run for this presentation change.

## Confirmed bundled environment root cause

- User's new live process reports TERM_PROGRAM=ghostty and TERM=xterm-ghostty.
  Inspecting dist-terminal/main.js showed the image detector called with env:{},
  while Micro's environment contained only explicit overrides, no inherited env.
- Vite's client build replaced bare process.env in the two newly added modules.
  This explains both the persistent Ghostty character-image fallback and the
  earlier Micro PATH/config-directory failures that source-only probes missed.
- Both modules now import env from node:process, matching existing project code.
  The rebuilt artifact references the runtime env in detection and spreads it
  into Micro's child environment; no credentials are serialized into the build.
- A read-only in-memory probe of actual bundled functions under Node 23.11.1
  returned Ghostty protocol kitty and completed Micro save-and-close successfully.
  Reopening the user's TUI is required to replace the already-running bundle.

## Execution-only diagnostics

- Beginning a CLI test clears prior in-memory logs and expands the execution log.
- Parsed failed-test results retain sanitized diagnostic text after the status.
  Runtime/compile errors show this text directly, including location/stack lines.
  Wrong-answer input/actual/expected cards remain, without appending historic logs.
- Headless log probe confirmed TypeError and source line visibility while an
  unrelated old problem-list entry stayed hidden. Type/lint/diff checks passed.
- No build run for this log-presentation change.

## Image fallback and lighter dividers

- Live TUI process reports TERM_PROGRAM=Apple_Terminal, TERM=xterm-256color,
  no Kitty capability. vue-tui graphics detection resolves this to unicode,
  which otherwise shows only the image's linked alt text even for valid PNGs.
  This explains the recurring image report; increasing network timeout alone
  cannot address this renderer limitation.
- Added a bounded Sharp-backed half-block color-cell fallback in ProblemDetail
  when native image protocols are unavailable. Native-capable terminals keep
  the existing graphic path. Conversion respects displayed dimensions, handles
  resize/selection races, and caches at most eight raster sizes/images.
- Public problem 54 images both downloaded/decoded; headless detail rendering
  produced 496 and 656 image cells across 16 rows, instead of linked alt text.
  This is a lower-resolution terminal fallback, not pixel-accurate native images.
- Divider glyphs are thin lines, gray by default and cyan on hover. Removed
  full-line selected backgrounds and bold yellow arrow styling.

## F3 acknowledgement repair

- Reported live session had a valid generated plugin and close request but no
  save acknowledgement or normal Micro config artifacts. No solution content was
  inspected, changed or submitted during diagnostics.
- Use the documented ConfigDir/init.lua entry (module initlua), and explicitly
  set the child MICRO_CONFIG_HOME to its private config directory. Initialization
  writes save-ready only after key binding succeeds; save checks it first.
- Distinguish bridge-not-ready, no-save-reply and saved-but-not-exited failures.
  Failed checks continue to block test/submit. Current user's live Micro session
  is left untouched, so reopening with the new build is required.
- Real Micro disposable-file probe confirmed save-ready, multiline save while
  staying open, and successful save-and-close. Exact cause of that old session's
  plugin not responding is not fully established; the old source flow worked in
  separate PTY probes. Recheck the user's reopened session for final acceptance.
- An immediate F3 in the full App probe exposed a startup race: the first Micro
  screen can precede save-ready. Save now waits up to 3 seconds for initialization.
  The complete App + Micro + fake CLI flow then passed: saved content ran once,
  submit confirmation preceded a single submit, and save failure blocked runs.

- User selected Micro, retaining the terminal and collapsible/drag-resizable layout.
- Reuse the PTY/headless screen implementation, replacing Vim with Micro 2.0.15.
- Bottom buttons and F2/F3/F4 trigger save/test/submit. Save leaves Micro open;
  test and submit first save and close Micro, await editor-bridge completion,
  and only then call the existing controller. Submission keeps its confirmation.
- Private temporary config contains a local lee_save Lua plugin, bound to F8.
  It checks the original source path, calls Buffer.Save(), and acknowledges a
  fresh request ID only after Save returns no error. Failure/timeouts block actions.
- Existing global Micro configuration is not modified. Normal session exit cleans
  its temporary config; forced disposal preserves it for potential recovery.
- Existing unrelated newline parsing changes remain untouched. No tests or build
  commands requested; static checks and disposable PTY/UI probes only.

## Evidence

- Installed Homebrew Micro 2.0.15 using its prebuilt bottle.
- Actual Micro PTY probe: multiline Unicode input saved to a disposable file;
  save stayed open; save-and-close received its acknowledgement and exited.
- Headless App + real Micro + fake CLI: bottom buttons were rendered, execution
  read the newly saved content once, submission required confirmation and fired
  once, and a read-only source file caused save failure with zero additional runs.
- No user solution files or real LeetCode test/submission endpoints used.
- Source typecheck, ESLint, Prettier and diff checks passed. Build remains pending.
- Independent review confirmed save gating, editor-task completion and submission
  confirmation. Startup failure now cleans its temporary config via finally;
  forced interruption intentionally retains potential unsaved backups.

## Adjustable vertical layout

### Superseding three-column layout

- User moved the problem list to the left of the statement. The layout is now
  list | statement | Micro, with a collapsible 3-cell list rail and draggable
  list-width divider. Statement/editor widths use coordinates relative to the
  remaining workspace, with 30-cell minimum widths; logs retain height dragging.
- Headless snapshots confirmed three columns, collapse/expand, both horizontal
  resize cursors, restored list width and visible footer at 28 terminal rows.
  Static type/lint checks passed. No new build run for this change.

- Divider hover highlights the active line and displays direction arrows. Where
  supported, OSC 22 requests ew-resize/ns-resize native pointers; default pointer
  is restored on leave, modal interaction and application disposal. Headless
  probes confirmed both directions and restoration to default on pointer leave.

- Added horizontal draggable dividers below the list and above logs. List height
  minimum is 5 rows when expanded; logs retain 3 rows and workspace retains 8.
  Requested heights survive collapse/expand and are clamped on terminal resize.
- Divider pointer capture precedes pane input; releasing on footer suppresses
  the following click so resizing cannot trigger execution or submission.
- Source type/lint/diff checks passed. No build performed for this height change.
- Headless snapshots confirmed dividers at rows 16/30 then 16/26 after dragging,
  corresponding Micro heights 11 then 7. At 28 terminal rows the editor retained
  6 content rows and action buttons stayed visible; footer release did not run code.

## Startup-path repair evidence

- User reported an immediate nonzero Micro exit after launching the built TUI.
  Local Micro and Node 23.11.1 probes worked; restricting PATH to /usr/bin:/bin
  reproduced an empty-output exit 1 for the bare micro command. The user's exact
  terminal environment has not been read, so this is a confirmed failure path,
  not a confirmed attribution of that terminal's error.
- Resolve an executable absolute path before PTY spawn, checking PATH followed
  by standard macOS Homebrew locations. Explicit editor paths remain respected.
- Errors now distinguish missing executables and include abnormal exit status;
  controller uses EDITOR_LAUNCH_FAILED instead of a terminal-restore error.
- Node 23.11.1 with restricted PATH successfully opened Micro, saved a temporary
  multiline file, and completed save-and-close after the repair.
