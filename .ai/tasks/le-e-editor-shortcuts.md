# VS Code-style Micro shortcuts

- User requested common default editing shortcuts including selected-text Cmd+C.
- Added Command-to-Micro key mapping with unknown Command combinations consumed,
  preventing accidental character insertion or root login/submit actions.
- Project-only Ghostty profile forwards Command combinations using CSI sequences;
  start:ghostty opens a separate configured instance without changing global config.
  Launcher requires fresh built App/editor code, preventing old bundles receiving
  shortcuts they cannot safely interpret. No GUI launch performed by the agent.
- Verified actual stdin parser -> Micro -> external clipboard adapter using a
  private micro-clip fixture (never touching system clipboard): mouse selection
  copied "let", select-all copied the complete fixture, cut/undo/redo/paste/save
  preserved content, Command+Shift+arrows selected text, unknown Command+W did
  not insert a character or close the editor.
- Native Micro keeps Ctrl shortcuts. F2/F3/F4/F6 remain application functions.
- No tests or builds requested/run; static checks and disposable probes only.
