# LeetCode Vue TUI

- Status: review — Vim-only editor update verified
- Branch: `feat/le-e-vue-tui`
- Active writer: Codex in the isolated `leetcode-solu` worktree
- Updated: 2026-08-11

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

Review and deliver the verified Vim-only editor update to pull request #1657;
merge still requires separate explicit authorization.

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
