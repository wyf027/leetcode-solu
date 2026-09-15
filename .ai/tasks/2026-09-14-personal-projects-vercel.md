# Personal Projects on Vercel

- Status: complete; provider-backed generation explicitly skipped by user.
- Coordination repository: `wyf027/leetcode-solu`.
- Branch: `feat/personal-projects-vercel-20260914`.
- Worktree: `/Users/wuyangfan/Documents/Codex/2026-09-09/gong/work/leetcode-solu-personal-projects-vercel`.
- Design: `docs/superpowers/specs/2026-09-14-personal-projects-vercel-design.md`.

## Goal

Customize `wyf027/screenshot-to-code`, deploy the browser-runnable projects under `project/` to Vercel, and add their verified preview links to `wyf027.github.io`.

## Decisions

- Scope A approved.
- Browser-provided model keys approved.
- Separate Vercel projects approved.
- Only verified public previews may appear in the homepage gallery.

## Current Checkpoint

- Repository inventory completed.
- Existing screenshot-to-code Vercel deployment identified.
- GitHub Pages source confirmed as `gh-pages`.
- WYF Screenshot Studio:
  - PR #5 merged as `df99d21a`.
  - Hosted-mode fix PR #6 merged as `78856f0a`.
  - Production deployment `6434646878` completed successfully.
  - Stable URL: `https://screenshot-to-code-blue.vercel.app/`.
  - HTTP 200, expected title, Chinese primary UI, session-key clearing, hosted field boundary, and clean production console verified.
  - Provider-backed generation was skipped by the user on 2026-09-15.
- Plans:
  - `docs/superpowers/plans/2026-09-14-wyf-screenshot-studio.md`
  - `docs/superpowers/plans/2026-09-14-leetcode-vercel-projects.md`
  - `docs/superpowers/plans/2026-09-14-github-pages-project-gallery.md`
- Leetcode-solu PR #2215 merged as `29415212`.
- GitHub Pages gallery PRs #1-#3 merged; final Pages run `34836204576` succeeded.
- Live homepage: `https://wyf027.github.io/`, HTTP 200 with 12 verified project cards.
- Task complete. No provider-backed model call was made.

## Vercel Session

- CLI: `59.16.0`.
- User: `yangfanwu027-3170`.
- Scope: `leno23s-projects`.
- Login was refreshed through Vercel's device flow; no token or login code is recorded.
- Every new project was disconnected from `wyf027/leetcode-solu` after linking, so Git pushes do not create thirteen automatic deployments.

## Deployment Manifest

| Directory | Deployment | Stable URL | State | HTTP/title | Gallery |
| --- | --- | --- | --- | --- | --- |
| `classic-atlas` | `dpl_5VkNwmqueY8CU7D4UW7y7NB1NZkS` | https://wyf-classic-atlas.vercel.app/ | Ready | 200 / pass | yes |
| `classic-games` | `dpl_7e6B12bePDHmLtwUeK3TH3CAHqpP` | https://wyf-classic-games.vercel.app/ | Ready | 200 / pass | yes |
| `classic-sci-fi-atlas` | `dpl_DbWMpkWDBbfCdp4Zy8wfTPuT8pw5` | https://wyf-classic-sci-fi-atlas.vercel.app/ | Ready | 200 / title pass | no |
| `daodejing-atlas` | `dpl_Daa538LiYXWTUYo7e7kdrfijKQpA` | https://wyf-daodejing-atlas.vercel.app/ | Ready | 200 / title pass | no |
| `declarative-partial-updates-demo` | `dpl_6v5EgPET18JW579i9TexFrY7FACM` | https://wyf-declarative-partial-updates-dem.vercel.app/ | Ready | 200 / pass | yes |
| `drag-sort` | `dpl_5cpv8G55q4rZpAAikbdM6Qcm8PkH` | https://wyf-drag-sort.vercel.app/ | Ready | 200 / pass | yes |
| `design-pattern` | `dpl_CZNx7hNKzTKWHjowXPNnFTMaPUJa` | https://wyf-design-pattern.vercel.app/ | Ready | 200 / pass | yes |
| `leetcode-interactive` | `dpl_3wkQMF4yZnqhqxGnK5fmSzdTJjC1` | https://wyf-leetcode-interactive.vercel.app/ | Ready | 200 / pass | yes |
| `nodepod-demo` | `dpl_3t6xoQ9KL2apbDuxzYaJrp5SZ8hg` | https://wyf-nodepod-demo.vercel.app/ | Ready | 200 / pass | yes |
| `open-file-viewer-demo` | `dpl_AsHLi7p2K8czBPCp6WZyAovQc7e3` | https://wyf-open-file-viewer-demo.vercel.app/ | Ready | 200 / pass | yes |
| `rag-flow-demo` | `dpl_HJQ6DV9jcf67j8w6SQLKH8vqe7mX` | https://wyf-rag-flow-demo.vercel.app/ | Ready | 200 / pass | yes |
| `react-demo` | `dpl_GVYPdNRbz9g7MU13yZ2MUySmJjwY` | https://wyf-react-demo.vercel.app/ | Ready | 200 / pass | yes |
| `screenshot-workflow-lite` | `dpl_7MA2rrDhW88g29YMVMHmEfAc1Dit` | https://wyf-screenshot-workflow-lite.vercel.app/ | Ready | 200 / pass | yes |

### Browser Findings

- All thirteen production aliases rendered their expected application shell.
- `daodejing-atlas` requests 657 image assets that are absent from the repository, so its text shell is deployed but it is excluded from the homepage.
- `classic-sci-fi-atlas` contains 2995 Git LFS image pointers. The real objects total 7.58 GiB, exceed the Vercel Hobby static-file limit, and render as broken book images, so the deployed index is excluded from the homepage.
- `nodepod-demo` started its virtual HTTP service, rendered the iframe response, and returned `/api/status` data. SharedArrayBuffer-dependent synchronous features remain unavailable without COOP/COEP headers.
- `declarative-partial-updates-demo` reports its expected experimental Chrome document-patching warning.
- The remaining observed console messages are existing Tailwind CDN or accessibility warnings; no failed navigation request was reproduced.
- `design-pattern` had one pre-deployment network fetch failure with no server-side deployment record; the single retry reached Ready.
- `react-demo` initially failed because unused `Child` code is treated as an error under Vercel `CI=true`. Removing that unreachable component produced the successful deployment above.
