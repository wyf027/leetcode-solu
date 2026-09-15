# Clickable problem and favorites navigation

- User requests clickable question rows, favorites and breadcrumb navigation;
  also explicitly requests rebuilding. Official study plans remain pending design approval.
- Problem rows reuse the existing TView click pattern from favorites; exact IDs
  are emitted from visible rows, including after scroll/filter. Click selects and
  loads detail, retaining keyboard selection focus. Busy/editor states block navigation.
- Split the collapse arrow from root/current-folder breadcrumb targets. Root returns
  to folders; current folder reopens its question list. No broad header collapse hit area.
- Runtime terminal-event probe verified scrolled problem selection/detail loading,
  folder open/root return/current crumb, collapse/expand, edit guard and divider drag guard.
  No network, user sources or credentials used; no test files created.
- Type/lint/diff checks and pnpm build passed (104 modules; non-blocking chunk-size warning).
  Next action: user restart/visual acceptance. No commit or push performed.
