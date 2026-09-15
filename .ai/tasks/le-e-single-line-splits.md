# Single-line pane splits

- User requested one visible divider instead of adjacent pane borders plus a separate line.
- App.vue now overlaps adjacent border cells horizontally and vertically; drag and
  hover hit targets use that shared cell. Existing pane components are unchanged.
- Removed the extra horizontal divider row; the log top border is the resize boundary.
- Actual terminal-buffer probe at 120x40 verified vertical borders only at
  0/29/74/119, both width drags, log-height drag, collapse/expand and resize cursors.
- Type/lint/format/diff checks passed. No build or repository tests requested/run.
- Next: build on request, restart for user visual acceptance; no commit/push.
