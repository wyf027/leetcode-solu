# LeetCode TUI search collision repair

- User requested fixing missing problem 23 when searching its Chinese title.
- List parsing preserves only the first summary per numeric ID and retains
  other records in collisionCandidates. The all-problems search uses summaries.
- Gateway localization now chooses the collision candidate whose English title
  matches the numeric problem in the Chinese catalog, then applies its Chinese
  title and slug. Other candidates remain available for detail identity checks.
- If catalog data is unavailable or no candidate matches, existing fallback
  behavior is retained; no unverified title is attached to a different problem.
- Existing image-timeout and search-label edits remain in the working tree.
- No tests or builds requested or run. Runtime acceptance remains pending;
  pnpm start still uses the existing built artifact.
