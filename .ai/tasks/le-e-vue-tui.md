# LeetCode Vue TUI

- Status: delivery approved — PR merge in progress
- Branch: `fix/le-e-favorite-folder-navigation-20260819`
- Active writer: Codex in the isolated `leetcode-solu` worktree
- Updated: 2026-08-19

## Objective

Build a Vue 3 terminal UI around the installed `clearloop/leetcode-cli` using
`@simon_he/vue-tui`. The first release must support problem browsing, search,
difficulty and favorite filters, details, Vim editing backed by a CLI source
bridge, test output, explicitly confirmed submission, and a bounded log panel.

## Boundaries

- Reuse the installed `leetcode` executable through a typed subprocess adapter.
- Runtime must not read browser cookies or the CLI SQLite cache. Public Chinese
  titles and statements may be read anonymously from `leetcode.cn`; authenticated
  editing, testing, submission, and favorites must keep credentials inside a CLI
  process and must never print or retain credential fields.
- Do not perform a real submission during automated or implementation
  verification.
- Default solution language is the case-sensitive slug `javascript`.
- Minimum supported terminal size is 100 columns by 28 rows.

## Approved decisions

- Framework: `@simon_he/vue-tui` with Vue 3 and TypeScript.
- Architecture: CLI adapter with dedicated output parsers.
- Layout: two-pane master/detail view with a bottom log panel.
- Editing: `e` suspends the TUI and opens the exact CLI-prepared JavaScript
  source in local `vim`; leaving Vim restores the same TUI session.
- Bridge: a `le-e-editor` helper hands the CLI-created path to the TUI through
  a private Unix Socket and falls back to the original editor outside the TUI.
- Chinese content: keep CLI titles for identity checks, but render public Chinese
  titles and statements from the China-site GraphQL endpoint when available.
- Failed tests: retain the parsed failing input, actual output, and expected output
  per problem and render them below the statement.
- Favorites: add a separate favorites page grouped by user folders, keep the same
  edit/test/submit path, show per-problem favorite state, and support reversible
  add/remove actions without exposing account credentials.
- Submission: modal confirmation with cancel focused by default; `y` confirms.
- Identity safety: duplicate numeric IDs remain provisional until `pick` confirms
  both ID and title; unresolved conflicts cannot edit, test, or submit.
- Language safety: each problem must complete `edit --lang javascript` in the
  current session before test or submit is enabled.

## Verification target

- Preserve and run the 50 existing automated tests; do not add test cases per
  explicit user direction.
- Manually inspect headless rendering and keyboard flow at 100x28.
- Manually verify edit/save/test data flow with a fake `leetcode` executable.
- Live setup, source editing, test, and submit require separate explicit
  authorization; default verification remains fake/local and non-networked.

## Next action

Deliver the verified favorite navigation, terminal-image, loading, and unsupported
question fixes through a pull request to `main`. Commit, push, and merge
authorization was granted on 2026-08-19.

## Design artifact

- `docs/superpowers/specs/2026-08-10-leetcode-vue-tui-design.md`

## Design approval

- Approved by user on 2026-08-10.
- Committed as `d2a4082`.
- Embedded-editor interaction was approved on 2026-08-10 and committed as
  `d6624c2`, then superseded by the Vim-only direction on 2026-08-11.

## Implementation plan

- `docs/superpowers/plans/2026-08-10-leetcode-vue-tui-implementation.md`
- The embedded-editor steps in this historical plan were superseded by the
  Vim-only direction on 2026-08-11; no new test cases will be added.

## Verification log

### Task 1 — complete

- Runtime: project-local verified Node `22.23.2`, pnpm `11.15.1`.
- Red test: `runtime.spec.ts` failed only because `runtime.ts` did not exist.
- Green test: 1 file, 2 tests passed.
- `pnpm typecheck`: passed.
- `pnpm build`: passed, emitted `dist-terminal/main.js`.
- Prettier on changed code: unchanged.
- `pnpm lint`: passed.

### Tasks 2–6 — complete

- Output sanitization: ANSI/control stripping, credential redaction, UTF-8 limits.
- List parsing: status, Unicode, starred rows, duplicate ID candidates.
- Detail and judge result parsing: passed/failed/accepted/rejected/unknown.
- Process runner: literal argv, captured/inherited stdio, timeout, cancellation,
  output cap, and SIGKILL escalation.
- CLI Gateway: exact approved argv, safe streaming logs, conservative errors.
- Cumulative result: 7 test files, 30 tests passed.
- Prettier, ESLint, and `vue-tsc --noEmit`: passed.

### Tasks 7–9 — complete before embedded-editor scope change

- Filters, identity resolution, bounded logs, controller operations, source-ready
  gate, and submit confirmation state machine implemented.
- Terminal lifecycle mount/suspend/resume/dispose behavior implemented.
- Cumulative result: 13 test files, 50 tests passed.
- Prettier, ESLint, and `vue-tsc --noEmit`: passed.
- Remaining UI work paused when the user added embedded editing; no code was
  written for the new editor before design approval.

### Tasks 10–13 — complete

- Vue TUI list/detail/log layout, filters, keyboard routing, help, resize notice,
  submit confirmation, and full-screen JavaScript editor implemented.
- Private Unix-socket editor bridge, strict UTF-8 source loading, atomic source
  save, fallback-editor setup/restore, and executable/config-file safety checks
  implemented.
- Fake CLI PTY acceptance passed for list, detail, edit, dirty confirmation,
  save, close, and streamed test output at 110x35; submission was not triggered.
- Exact minimum-size 100x28 render and clean terminal restoration passed with
  the fake CLI entrypoint.
- Existing automated suite remains 13 files and 50 tests; no new test cases were
  added after the user's direction.
- Prettier, ESLint, `vue-tsc --noEmit`, Vitest, build, and `git diff --check`
  passed after the final implementation changes.
- No real LeetCode configuration, network test, or submission was performed.

### Tasks 14–17 — complete

- The editor now renders fixed-width line numbers, JavaScript token colors,
  two-space indentation guides, and an inverse overlay cursor without inserting
  a cursor glyph into the source text.
- Public China-site data loaded 4,017 localized problem records during manual
  verification; #1 rendered the Chinese title and Chinese statement. Duplicate
  numeric IDs remain on the CLI identity path and are not localized by ID.
- Failed CLI tests retain and prominently render the failing input, actual
  output, and expected output before the problem statement.
- Added a separate favorites page with folder cycling, per-problem favorite
  markers, mouse/keyboard add-remove actions, and the existing edit/test/submit
  flow. The project-local Rust helper reuses clearloop CLI authentication and
  emits no cookies or tokens; `pnpm setup:account` builds it reproducibly.
- Real read-only acceptance loaded the logged-in favorites folders and Chinese
  titles, then exited cleanly. No real favorite mutation, test, or submission was
  triggered.
- Fake PTY acceptance passed for folder navigation, failed-case rendering,
  editor line numbers, indentation guides, ANSI syntax colors, inverse cursor,
  and clean terminal exit at 110x35.
- Existing automated suite remains 13 files and 50 tests; no test cases were
  added. Prettier, ESLint, `vue-tsc --noEmit`, Vitest, Vite build,
  `git diff --check`, Rust release build, and Clippy all passed.

### Tasks 18–19 — complete

- The dirty-close dialog now routes `Enter` and `s` to atomic save followed by
  the requested return/quit action; `d`/`y` discard and `Esc`/`n` cancel.
- Added a local Vim path on `Shift+E`. It reuses the private source bridge,
  validates the exact `.js` path before and after Vim, suspends terminal drawing,
  and restores the TUI after Vim exits.
- Restoring the input driver explicitly re-references stdin because vue-tui
  unreferences it while suspended; manual PTY verification confirmed the process
  remains alive and returns to `Ready` with the source marked ready.
- Fake PTY acceptance at 110x35 passed for both flows: dirty editor → `Esc` →
  `Enter` → saved problem list, and problem list → `Shift+E` → external editor
  exit → restored problem list. No test or submission command was triggered.
- Existing automated suite remains 13 files and 50 tests; no test cases were
  added. Targeted Prettier, ESLint, `vue-tsc --noEmit`, Vitest, Vite build, and
  `git diff --check` passed.

### Task 20 — complete

- Removed the legacy embedded editor, its buffer/presentation/session state,
  dirty-close dialog, and in-process source-save path.
- Unified editing on `e`: the CLI prepares and reports the exact JavaScript
  source through the private bridge, the TUI suspends for local Vim, and the same
  session resumes after Vim exits.
- Updated current help, shortcuts, runtime wiring, documentation, and the
  existing controller test fixture without adding test cases.
- Fake PTY acceptance at 110x35 passed for `e` transitioning from `Running edit`
  back to `Ready` with the source marked ready; `q` then restored the terminal
  and exited with code 0. The fake editor was `/usr/bin/true`, so no real source,
  test, submit, or favorite mutation occurred.
- `pnpm check` passed: Prettier, ESLint, `vue-tsc --noEmit`, 13 Vitest files with
  all 50 existing tests, and the terminal Vite build. `git diff --check` also
  passed.

### Task 21 — complete

- Fixed the submit dialog ignoring terminal line-break input by routing
  `inputType: insertLineBreak` through the existing default-cancel `Enter`
  transition; keydown `Enter`, `Escape`, `n`, and `y` behavior is unchanged.
- Reproduced the bug in the fake PTY at 110x35: before the fix, sending `\n`
  left the confirmation dialog open while `\r` closed it. After the fix, the
  same `e` → `s` → `\n` path closed the dialog without running submit, and `q`
  restored the terminal with exit code 0.
- No test cases were added. `pnpm check` passed with all 50 existing tests,
  Prettier, ESLint, `vue-tsc --noEmit`, and the terminal Vite build;
  `git diff --check` also passed.

### Task 22 — complete

- Fixed Chinese localization for duplicate numeric IDs by matching the CLI title
  against the LeetCode CN original title before applying the translated title,
  slug, and statement. Identity resolution and operation gates remain unchanged.
- Fixed logged-in favorites hydration by allowing the helper's bounded JSON
  response to use the existing 1 MiB stream limit without the log-specific 4 KiB
  per-line truncation.
- Read-only probes loaded 4,029 Chinese catalog records, localized 3,767 current
  CLI rows, rendered #1 and its statement in Chinese, and parsed 55 folders with
  732 favorite question references. No credentials or full favorite data were
  printed or retained.
- Real PTY acceptance at 110x35 rendered Chinese problem titles, loaded a Chinese
  statement, opened the favorites page with 9 matching questions in the first
  folder, and cycled to another folder with 4 matching questions. No edit, test,
  submit, or favorite mutation was triggered; `q` restored the terminal cleanly.
- No test cases were added. `pnpm check` passed with all 50 existing tests,
  Prettier, ESLint, `vue-tsc --noEmit`, and the terminal Vite build;
  `git diff --check` also passed.
- A live follow-up reproduced “无收藏夹” only in two still-running processes from
  the stale, Git-broken `leetcode-solu-le-e-vue-tui` worktree. The fixed isolated
  checkout's helper returned 55 folders / 732 question references, and its real
  TUI rendered 9 questions in “我的收藏”; no mutation command was triggered.

### Task 23 — complete

- Fixed Enter being discarded while startup or manual refresh held the
  `refresh-list` / `refresh-starred` operation lock. The controller now remembers
  the latest selected detail request and starts it immediately after refresh
  releases the lock; requests for a selection that moved meanwhile are ignored.
- Real PTY acceptance reproduced the race deterministically with `r` followed by
  Enter. Refresh cleared the existing detail, then transitioned automatically to
  `Running load-detail`, rendered the Chinese Two Sum statement, returned to
  `Ready`, and exited cleanly with `q`. No favorite mutation, edit, test, or
  submission was triggered.
- No test cases were added. `pnpm check` passed with all 50 existing tests,
  Prettier, ESLint, `vue-tsc --noEmit`, and the terminal Vite build.

### Task 24 — complete

- Updated the logged-in favorite question-list query from the obsolete `v2`
  response to the `v3` version currently used by the LeetCode CN problem-list
  page. Folder discovery and favorite add/remove mutations remain unchanged.
- Included duplicate numeric-ID candidates when matching a folder's question
  slugs and titles against the CLI problem catalog. The normal problem-list view
  remains deduplicated, while the existing `pick` identity check still resolves
  the selected candidate before edit, test, or submit.
- Read-only Chrome inspection confirmed the webpage reports 11 questions in
  `我的收藏` and 5 in `算法思想`, and that the current frontend requests V3.
  The rebuilt helper returned the same 11/5 counts across 55 folders.
- Real PTY acceptance at 110x35 rendered all 11 `我的收藏` questions, including
  `解数独` and `编辑距离`, rendered all 5 `算法思想` questions, loaded the
  Chinese Sudoku statement through the existing identity gate, and exited
  cleanly with `q`. No favorite mutation, edit, test, or submission was run.
- `pnpm check` passed with all 50 existing tests, Prettier, ESLint,
  `vue-tsc --noEmit`, and the terminal Vite build. Rustfmt passed; helper Clippy
  passed with only the upstream Rust 1.97 formatting-borrow lint explicitly
  allowed, while all other warnings remained denied. `git diff --check` passed.

### Task 25 — complete

- The favorites page must open at the folder list instead of immediately showing
  the first folder's questions.
- Enter or click opens the selected folder; Escape or Backspace returns to the
  folder list. The question list title carries the `收藏夹 › 文件夹名`
  breadcrumb.
- The folder root clears the selected problem so edit, test, submit, and favorite
  actions cannot target a stale question.
- Folder refresh renders an explicit `加载收藏夹中…` state instead of presenting
  the temporary empty result as an empty collection.
- Chinese statement images are preserved, downloaded only from approved LeetCode
  HTTPS asset hosts with strict byte/pixel/time limits, converted to bounded PNG,
  and rendered through vue-tui's terminal graphics lifecycle. Unsupported images
  or terminals retain alt text and the original public URL.
- Detail loading displays `加载题目和图片中…`; image data uses a bounded in-memory
  LRU cache and is never written to the repository or account configuration.
- Image redirects are validated before every request, conversions run serially,
  each statement loads at most four images (8 MiB aggregate source bound), and
  changing selection or exiting cancels the active detail request.
- Real TUI acceptance at 120x35 rendered 55 folders first, moved to `算法思想`,
  opened its five questions with the `收藏夹 › 算法思想` breadcrumb, then
  returned to the same highlighted folder with Escape. The diagnostic process
  exited cleanly with `q`; no mutation, edit, test, or submit action ran.
- Public problem `rotate-list` contained two JPEG images. Both were converted to
  PNG, recognized as two terminal graphic segments (about 10 KiB and 15 KiB),
  and retained alt-text fallback. A synthetic allowed-host redirect to localhost
  was rejected before a second request.
- `pnpm check` passed: Prettier, ESLint, `vue-tsc --noEmit`, all 50 existing
  tests, and the terminal Vite build. `git diff --check` passed. No test cases
  were added, preserving the user's standing direction.

### Task 26 — complete

- Map each PNG's own pixel dimensions to terminal cells at 8x16 pixels per cell.
- Preserve smaller images at their original display size. Only scale images down
  when they exceed the detail pane width; keep aspect ratio and use vertical
  scrolling instead of forcing images into a fixed viewport-height cap.
- Root cause was vue-tui's image sizing starting from an implicit one-cell
  minimum when only maximum dimensions were supplied. ProblemDetail now builds
  image-aware Markdown blocks and assigns per-image display cells.
- Real `clone-graph` data verified two source sizes at a 66-column detail width:
  the 2008x2210 source maps from 251x139 to 66x37 cells, while the 163x148 image
  remains at its original 21x10 cells. Safe PNG conversion may reduce raster
  bytes, but the original dimensions remain attached to the display contract.
- The real TUI loaded `字典树 › 克隆图`, showed the existing loading state, and
  returned to Ready. The diagnostic process exited with `q`; no mutation, edit,
  test, or submit action ran.
- `pnpm check` passed: Prettier, ESLint, `vue-tsc --noEmit`, all 50 existing
  tests, and the terminal Vite build. `git diff --check` passed.

### Task 27 — complete

- clearloop exits successfully while printing `No support for database and shell
  questions yet` for unsupported question types, so the controller previously
  misreported an editor bridge configuration failure.
- Classify the explicit CLI output before accepting exit code zero, and show a
  truthful database/Shell unsupported message. Keep normal algorithm-question
  bridge behavior unchanged.
- A fake clearloop result with exit code zero and the unsupported output now
  returns `COMMAND_FAILED` with `当前 LeetCode CLI 暂不支持数据库或 Shell
  题目的编辑。`; a normal empty exit-zero result still succeeds.
- `pnpm check` passed: Prettier, ESLint, `vue-tsc --noEmit`, all 50 existing
  tests, and the terminal Vite build. `git diff --check` passed.

### Repository delivery — approved

- Migrated the verified project into `leetcode-solu/project/le-e` on the
  isolated `feat/le-e-vue-tui` worktree without touching the dirty primary
  checkout.
- Added repository-local setup, usage, shortcut, verification, and ignore
  documentation.
- The first target-worktree test run exposed a cold-start race in the existing
  SIGTERM-ignore fixture: its 150 ms timeout could fire before Node installed
  the signal handler. The same existing test now allows 1 second for child
  startup; no new test case was added and production timeout logic is unchanged.
- GitHub API reports current `main` at `d39286c`, while the local fetched base is
  `815b957`. HTTPS and SSH shallow fetches both stalled and were stopped; the
  staged changes were recovered from the named sync stash without conflicts.
  The user explicitly accepted this documented remote-sync gap on 2026-08-10,
  so commit and PR creation may proceed; merge still requires separate review
  and authorization.
