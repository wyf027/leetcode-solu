# Daodejing Sketchbook

- Status: repository verification complete, ready to commit
- Branch: `feat/daodejing-sketchbook-20260827`
- Baseline: `origin/main@c054e2638644e8b02f9f2204fa00ac219153a534`
- Active writer: Codex in the isolated sparse clone
- Updated: 2026-08-27

## Objective

Replace the existing `project/daodejing-atlas/index.html` with the verified
ThreeUI sketchbook implementation whose editorial content is the complete
81-chapter Daodejing, and add its self-contained local asset directory.

## Scope

- `project/daodejing-atlas/index.html`
- `project/daodejing-atlas/daodejing-sketchbook/`

## Boundaries

- Do not modify unrelated LeetCode solutions, tasks, or indexes.
- Preserve the reference 18-strip curl, spring, loupe, tilt, zoom, intro riffle,
  chapter list and responsive behavior.
- Keep all 81 chapter spreads local and avoid secrets or authenticated data.
- Preserve upstream MIT/OFL attribution and redistribution notices.
- Deliver through a feature branch and pull request to `main`; do not merge
  without separate authorization.

## Verification evidence before migration

- Reference sketchbook CSS and core implementation functions were byte-matched.
- 81 chapter spreads exist as 1760x1240 RGBA WebP images.
- Browser checks passed for drag commit/cancel, next/previous, keyboard, zoom,
  loupe toggle/drag, pointer tilt, chapter jump, looping, intro and mobile layout.
- Browser console had no implementation errors.

## Repository verification

- Migrated HTML SHA-256 matched the verified source before repository-only
  semantic HTML fixes.
- All 89 assets matched the verified source checksums.
- All 81 spreads are 1760x1240 RGBA WebP images.
- The extracted inline application script passed `node --check`;
  `html-validate` and `git diff --check` also passed.
- Repository-served browser acceptance loaded 81 chapters, turned chapter 7 to
  8, and produced no console errors.
- Final Git commit audit passed for all 96 changed files with
  `OVERALL_EXIT=0` (`SECRETS_EXIT=0`, `PUSH_TARGET_EXIT=0`).
- Independent review found no runtime or scope defect and requested upstream
  license preservation; the MIT, asset, third-party, and font notices were
  added under `project/daodejing-atlas/`.

## Next action

Perform independent read-only diff review, then commit, push, and open a pull
request to `main`.
