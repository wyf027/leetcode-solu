# Basic language completion

## Current dropdown implementation

- Supersedes the earlier InfoBar/native candidate cycling described below.
  CodePane renders a bounded dropdown at the cursor, flipping above when needed.
  Up/down chooses; Tab/Enter or mouse click accepts; Escape dismisses.
- Micro publishes bounded prefix/keyword data through private OSC 777, consumed
  by xterm headless. Host never inserts a guessed suffix directly: a private
  F9 action revalidates current source path, prefix and candidate before editing.
- Confirming uses a tiny synchronous request-file write so following keystrokes
  cannot be dropped while awaiting file I/O. Save clears completion state and
  blocks acceptance; source exit/open clears stale items.
- Real Micro + CodePane probes confirmed dropdown visibility, no eager insertion,
  keyboard selection/acceptance, Escape preservation, mouse acceptance and upward
  placement at the bottom edge. Type/lint checks passed; no new build run.

- User requested basic language hints in Micro. Add keyword/common-name lists
  for .js/.py/.java/.cpp, showing non-mutating hints after two ASCII letters.
- Reuse Micro's native Autocomplete action via preAutocomplete hook, so Tab and
  Shift+Tab cycle suggestions correctly and native undo/selection behavior stays.
  No candidates falls back to Micro buffer completion; whitespace/selection Tab
  retains indentation. CtrlSpace and project-profile Cmd+I trigger completion.
- Actual Micro disposable-file probes passed all four languages, hint-without-
  insertion, forward/backward candidate cycling, indentation and save/exit.
- No repository tests or builds requested/run. Static type/lint checks apply.

## Indentation guides

- Enabled native Micro showchars ispace/itab guides in its private settings file.
- Real Micro probe confirmed space indentation, nested levels and tabs render
  guide characters with native dim-gray palette 239. Save kept source bytes
  unchanged. Static checks passed; no build run for this change.
