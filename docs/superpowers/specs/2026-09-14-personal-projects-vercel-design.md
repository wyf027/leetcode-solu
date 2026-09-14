# Personal Projects on Vercel and GitHub Pages

Date: 2026-09-14

## Objective

Turn the existing `wyf027/screenshot-to-code` fork into a personal screenshot-to-code product, publish every independently usable browser project under `wyf027/leetcode-solu/project` to Vercel, and add a verified personal-project gallery to `https://wyf027.github.io/`.

## Approved Decisions

- Use scope A: the screenshot-to-code fork plus browser-runnable projects inside `leetcode-solu/project`.
- Use browser-provided model keys. Keys exist only in the current page session and are never persisted by the application.
- Give each deployable project its own Vercel project and stable preview URL.
- Show a project on the GitHub Pages homepage only after its production URL passes verification.
- Generate new HTML with Tailwind CSS.

## Repositories

Work is split across three existing GitHub repositories, with one branch and one isolated worktree per repository:

- `wyf027/screenshot-to-code`: branch `feat/wyf-screenshot-studio-20260914` from `main`, for product customization and the existing Vercel frontend/backend deployment.
- `wyf027/leetcode-solu`: branch `feat/personal-projects-vercel-20260914` from `main`, for static project entry pages, deployment records, and this design.
- `wyf027/wyf027.github.io`: branch `feat/personal-project-gallery-20260914` from `gh-pages`, for the public personal-project gallery.

Only one repository worktree is written at a time. Each repository keeps its own commit and pull request history.

## Screenshot-to-Code Product

The existing fork remains the technical base. Its React/Vite frontend, FastAPI backend, WebSocket streaming flow, code preview, and provider adapters are reused instead of rebuilt.

The product is presented as **WYF Screenshot Studio**:

- Chinese primary interface and personal branding.
- Screenshot upload and paste.
- Optional text instructions.
- HTML with Tailwind CSS as the default output.
- React with Tailwind CSS and Vue with Tailwind CSS remain selectable.
- Streaming code output, rendered preview, copy, and download.
- OpenAI, Gemini, and Anthropic remain supported through browser-provided keys.
- The original MIT license and required attribution remain intact.

Upstream marketing, funding, analytics, and links that imply the deployment is the upstream official service are removed or replaced with links to the personal repository.

### Key and Image Flow

1. The browser accepts a screenshot, instructions, stack, provider, model, and key.
2. The key and image are sent to the existing Vercel FastAPI service only when the user starts a generation.
3. The backend validates the request and calls the selected provider.
4. Generated code streams back through the existing WebSocket connection.
5. The browser renders the preview and exposes copy and download actions.
6. Reloading or closing the page removes the key from the application session.

The application must not write model keys or uploaded images to local storage, cookies, analytics, logs, databases, or tracked files. Provider calls can incur charges on the user's provider account.

### Errors

The interface gives direct Chinese messages for:

- Missing provider key.
- Unsupported or oversized image.
- Provider authentication, quota, rate-limit, and model errors.
- Interrupted WebSocket connections.
- Vercel function timeout or unavailable backend.
- Generated output that cannot be rendered.

Raw provider errors may be logged only after secrets and image data are removed.

## Vercel Project Publication

Projects are deployed independently through Vercel CLI. They are not connected individually to the same Git repository, avoiding the Hobby-plan limit on Git-connected projects per repository.

Each new Vercel project uses `wyf-<directory-name>` as its requested project name. If that name is already taken in the account, Vercel's assigned stable project domain is retained and recorded; no deployment is renamed after the homepage is published. The existing screenshot-to-code Vercel project is updated in place so its current public link keeps working.

The initial publication set is:

- `classic-atlas`
- `classic-games`
- `classic-sci-fi-atlas`
- `daodejing-atlas`
- `declarative-partial-updates-demo`
- `drag-sort`
- `design-pattern`
- `leetcode-interactive`
- `nodepod-demo`
- `open-file-viewer-demo`
- `rag-flow-demo`
- `react-demo`
- `screenshot-workflow-lite`

`drag-sort` and `design-pattern` receive small Tailwind entry pages because each currently contains several demos without a usable project root.

`nodepod-demo` and `react-demo` use their existing frontend dependencies and Vercel build detection. Pure HTML projects are uploaded without a build framework.

The following directories are excluded because they do not produce a truthful standalone browser preview:

- `a2a-desktop-pet`: Tauri desktop application.
- `ai-interview`: document artifact.
- `graphql`: client depends on a separate server.
- `lan-desktop-share`: persistent WebSocket and native-control service.
- `le-e`: terminal application.
- `mini-react`: library and development demos.
- `upload`: depends on a local Express file-upload service and local storage.
- `react-book`: source script without a standalone application.

If a listed project fails to run after a small deployment-specific correction, it is left out of the homepage and recorded as excluded rather than published as a broken demo.

## GitHub Pages Project Gallery

`wyf027/wyf027.github.io` continues to publish the Jekyll site from the `gh-pages` branch.

Project metadata is stored in `_data/projects.yml`. The homepage `index.html` renders a Tailwind-based “个人项目” section containing:

- Project name and short Chinese description.
- Technology tags.
- “在线预览” link to the verified Vercel production URL.
- “查看源码” link to the project repository or its directory in `leetcode-solu`.

The screenshot-to-code product appears first. The remaining cards follow the approved publication list. The homepage loads Tailwind's browser build only on `index.html`, with the `tw-` class prefix and preflight disabled, so the existing Bootstrap/Jekyll theme is not restyled.

## Verification

No test files are added and no unrelated test suite is run.

Verification consists of:

- Secret-pattern scans over every changed repository.
- Existing source-level lint or syntax checks that do not require adding tests.
- Vercel deployment reaching a successful terminal state.
- HTTP 200 and expected page-title probes against every production URL.
- Browser rendering, console-error inspection, and one screenshot for every distinct application shell.
- Missing-key and invalid-image checks for WYF Screenshot Studio.
- One real screenshot generation after the user manually supplies a provider key and confirms the provider call that may incur cost.
- GitHub Pages workflow success followed by a live check of the project cards and every preview link.
- Git ancestry checks confirming each merged head is contained in its target branch.

Deployment success, HTTP availability, browser rendering, and real model generation are reported as separate evidence.

## Delivery Order

1. Customize and deploy WYF Screenshot Studio.
2. Prepare and deploy the `leetcode-solu` browser projects, recording their stable production URLs.
3. Add only those verified URLs to the GitHub Pages project gallery.
4. Merge the three repository changes and verify the final public homepage.

## Rollback

- Vercel projects retain their previous production deployments and can be reassigned to the prior deployment.
- Each repository change is isolated in its own pull request and can be reverted independently.
- If the gallery fails, revert only the GitHub Pages pull request; existing project deployments remain available.
