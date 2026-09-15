# Language options

- Approved scope: JavaScript, Python 3, Java and C++.
- `g` cycles languages; the header and submission dialog show the selection.
- Switching is disabled during operations and submission confirmation. A switch
  clears prepared-source and run-result state; existing source files are kept.
- Editing supplies the chosen CLI language and validates the matching extension
  before/after Vim. The CLI edit command persists code.lang; test/exec use that
  configuration. A new edit is mandatory after each language change.
- Shared CLI config remains an upstream limitation: another CLI process can
  change it outside this TUI. No extra global-config writer was introduced.
- No tests or builds run for this change; terminal acceptance remains pending.
