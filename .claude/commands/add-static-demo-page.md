---
name: add-static-demo-page
description: Workflow command scaffold for add-static-demo-page in leetcode-solu.
allowed_tools: ["Bash", "Read", "Write", "Grep", "Glob"]
---

# /add-static-demo-page

Use this workflow when working on **add-static-demo-page** in `leetcode-solu`.

## Goal

Adds a new static HTML demo or feature page to the project, typically for showcasing a UI, plugin, or feature.

## Common Files

- `project/*/index.html`
- `project/*/*.html`
- `project/*/*.js`
- `project/*/*.css`
- `project/*/README.md`

## Suggested Sequence

1. Understand the current state and failure mode before editing.
2. Make the smallest coherent change that satisfies the workflow goal.
3. Run the most relevant verification for touched files.
4. Summarize what changed and what still needs review.

## Typical Commit Signals

- Create a new directory under project/ with a descriptive name for the demo or feature.
- Add an index.html file (or multiple .html files) to serve as the demo page.
- Optionally add supporting files such as README.md, JavaScript (.js), and CSS (.css) files for richer demos.

## Notes

- Treat this as a scaffold, not a hard-coded script.
- Update the command if the workflow evolves materially.