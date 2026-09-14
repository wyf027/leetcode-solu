# LeetCode Browser Projects Vercel Publication Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Give every independently usable browser project under leetcode-solu/project a verified Vercel production URL.

**Architecture:** Add only two missing Tailwind index pages and a repository ignore rule. Deploy thirteen project roots sequentially as independent Vercel projects, record the exact aliases, and exclude apps that require desktop, terminal, persistent WebSocket, or local filesystem services.

**Tech Stack:** Static HTML, Tailwind browser build, Vite, Create React App, Vercel CLI

**Spec:** docs/superpowers/specs/2026-09-14-personal-projects-vercel-design.md

## Global Constraints

- Base branch: main.
- Work branch: feat/personal-projects-vercel-20260914.
- Worktree: /Users/wuyangfan/Documents/Codex/2026-09-09/gong/work/leetcode-solu-personal-projects-vercel.
- Requested Vercel names use wyf- followed by the project directory name.
- Deploy sequentially because the Vercel Hobby account has one concurrent build.
- Do not connect thirteen projects individually to the Git repository.
- Do not add dependencies, deployment frameworks, tests, or shared build abstractions.
- Every new HTML file uses Tailwind CSS.
- Never commit .vercel metadata or credentials.
- Only a verified production URL is eligible for the GitHub Pages gallery.

---

### Task 1: Add deployment hygiene and missing project entry pages

**Files:**
- Modify: .gitignore
- Create: project/drag-sort/index.html
- Create: project/design-pattern/index.html
- Modify: .ai/tasks/2026-09-14-personal-projects-vercel.md

**Interfaces:**
- Consumes: the existing demos in project/drag-sort and project/design-pattern.
- Produces: two standalone root pages and ignored per-directory .vercel metadata.

- [ ] **Step 1: Confirm the active isolated branch**

~~~bash
git rev-parse --show-toplevel
git branch --show-current
git rev-parse HEAD
git status --short --branch
git remote -v
~~~

Expected: feat/personal-projects-vercel-20260914 with only committed design and plan files.

- [ ] **Step 2: Ignore Vercel link metadata**

Add this line to the root .gitignore:

~~~gitignore
.vercel/
~~~

This pattern covers .vercel directories created inside every project root.

- [ ] **Step 3: Create the drag-sort entry page**

Create project/drag-sort/index.html as a Chinese Tailwind page with three cards:

~~~html
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>拖拽排序实验室</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="min-h-screen bg-slate-950 text-slate-100">
  <main class="mx-auto max-w-5xl px-6 py-16">
    <p class="text-sm font-semibold uppercase tracking-[0.3em] text-cyan-400">Drag Sort Lab</p>
    <h1 class="mt-3 text-4xl font-bold">拖拽排序实验室</h1>
    <p class="mt-4 text-slate-400">三个无需安装即可体验的排序与动画示例。</p>
    <div class="mt-10 grid gap-5 md:grid-cols-3">
      <a class="rounded-2xl border border-slate-800 bg-slate-900 p-6 hover:border-cyan-400" href="./192.html">原生拖放排序</a>
      <a class="rounded-2xl border border-slate-800 bg-slate-900 p-6 hover:border-cyan-400" href="./flip.html">FLIP 动画</a>
      <a class="rounded-2xl border border-slate-800 bg-slate-900 p-6 hover:border-cyan-400" href="./sortable.html">Sortable 排序</a>
    </div>
  </main>
</body>
</html>
~~~

- [ ] **Step 4: Create the design-pattern entry page**

Create project/design-pattern/index.html with the same Tailwind shell and cards linking only to the standalone browser demos:

~~~html
<a href="./设计原则/">设计原则</a>
<a href="./策略模式/">策略模式</a>
<a href="./状态模式/">状态模式</a>
~~~

Do not link the Express-backed proxy and singleton demos.

- [ ] **Step 5: Run static checks**

Run:

~~~bash
git diff --check
for page in project/drag-sort/index.html project/design-pattern/index.html; do
  rg -q 'cdn.tailwindcss.com' "$page"
  rg -q '<meta name="viewport"' "$page"
  rg -q '<title>[^<]+</title>' "$page"
done
git check-ignore project/drag-sort/.vercel/project.json
~~~

Expected: all commands exit 0.

- [ ] **Step 6: Commit**

~~~bash
git add .gitignore project/drag-sort/index.html project/design-pattern/index.html
git commit -m "feat: add project demo entry pages"
~~~

### Task 2: Authenticate Vercel without exposing credentials

**Files:**
- Modify: .ai/tasks/2026-09-14-personal-projects-vercel.md

**Interfaces:**
- Consumes: the user's Vercel account and the installed Node/npm runtime.
- Produces: a working Vercel CLI session for scope leno23s-projects.

- [ ] **Step 1: Check the current CLI session**

~~~bash
npx --yes vercel@59.16.0 whoami
~~~

Expected username: leno23. A 403 response means the saved credential is expired.

- [ ] **Step 2: Recover an expired login**

If whoami fails, run:

~~~bash
npx --yes vercel@59.16.0 login
~~~

Let the user complete the browser or email confirmation. Do not read, print, parse, or copy the Vercel auth file. Re-run whoami and continue only when it succeeds.

- [ ] **Step 3: Record non-sensitive account evidence**

Add only the username, scope, CLI version, and successful timestamp to the task card. Do not record tokens, email codes, account IDs, or auth-file contents.

### Task 3: Deploy the thirteen project roots

**Files:**
- Generated but ignored: project/*/.vercel/project.json
- Modify: .ai/tasks/2026-09-14-personal-projects-vercel.md

**Interfaces:**
- Consumes: thirteen project roots with usable index pages.
- Produces: thirteen Vercel project names, production deployment URLs, stable aliases, and deployment states recorded in the task card.

- [ ] **Step 1: Confirm the publication list**

Run:

~~~bash
for project in classic-atlas classic-games classic-sci-fi-atlas daodejing-atlas declarative-partial-updates-demo drag-sort design-pattern leetcode-interactive nodepod-demo open-file-viewer-demo rag-flow-demo react-demo screenshot-workflow-lite; do
  test -f "project/$project/index.html" || test -f "project/$project/public/index.html"
done
~~~

Expected: exit 0.

- [ ] **Step 2: Link and deploy each project sequentially**

For each directory in the exact list above, run:

~~~bash
npx --yes vercel@59.16.0 link --yes --scope leno23s-projects --project "wyf-$project" --cwd "project/$project"
npx --yes vercel@59.16.0 deploy --prod --yes --scope leno23s-projects --cwd "project/$project"
~~~

Wait for each deployment to reach Ready before starting the next. Save the production URL and assigned stable alias in the task card immediately after each success.

- [ ] **Step 3: Inspect each completed deployment**

For every returned deployment URL run:

~~~bash
npx --yes vercel@59.16.0 inspect --wait "$deployment_url"
curl -L --max-time 30 -sS -o /dev/null -w '%{http_code}\n' "$stable_alias"
~~~

Expected: Vercel state Ready and HTTP 200.

- [ ] **Step 4: Verify page identity**

Fetch each stable alias and require these title fragments:

~~~text
classic-atlas -> 经典完整图册索引
classic-games -> Classic Games
classic-sci-fi-atlas -> 公版科幻经典简中图册
daodejing-atlas -> 道德经图册
declarative-partial-updates-demo -> Native Document Patching
drag-sort -> 拖拽排序实验室
design-pattern -> 设计模式
leetcode-interactive -> LeetCode 交互讲解索引
nodepod-demo -> Nodepod Local Service Demo
open-file-viewer-demo -> Open File Viewer Plugin Demo
rag-flow-demo -> RAG 全流程演示
react-demo -> React
screenshot-workflow-lite -> Screenshot Workflow Lite
~~~

Record pass or failure beside each URL. A failed identity check is not gallery-eligible.

- [ ] **Step 5: Perform browser checks**

Open every stable alias in a clean browser context. Check the initial render and primary navigation. Capture one screenshot for each distinct application shell and inspect browser console errors.

For nodepod-demo and react-demo, the remote Vercel build itself is the required build evidence. Do not run a separate local build.

- [ ] **Step 6: Handle a failed project narrowly**

If a project fails, inspect its Vercel build/runtime log and make only the smallest project-local deployment correction. Re-deploy that project once. If it still cannot provide an honest standalone browser experience, record it under Excluded with the exact failure and leave it out of the homepage.

- [ ] **Step 7: Record the final manifest**

Add a Deployment Manifest section to .ai/tasks/2026-09-14-personal-projects-vercel.md. Each row contains directory, requested Vercel project name, production URL, stable alias, Vercel state, HTTP result, page-title result, and gallery eligibility.

- [ ] **Step 8: Commit deployment evidence**

~~~bash
git add .ai/tasks/2026-09-14-personal-projects-vercel.md
git commit -m "docs: record Vercel project deployments"
~~~

### Task 4: Deliver the leetcode-solu changes

**Files:**
- Modify: .ai/tasks/2026-09-14-personal-projects-vercel.md

**Interfaces:**
- Consumes: committed entry pages and deployment manifest.
- Produces: a merged pull request on wyf027/leetcode-solu main.

- [ ] **Step 1: Run final repository checks**

~~~bash
git diff --check origin/main...HEAD
git status --short --branch
! rg -n "sk-[A-Za-z0-9]|gh[pousr]_[A-Za-z0-9]|VERCEL_TOKEN=|API_KEY=[^ ]" .ai/tasks docs/superpowers project/drag-sort/index.html project/design-pattern/index.html
~~~

Expected: clean formatting and no credential values.

- [ ] **Step 2: Push and create the pull request**

~~~bash
git push -u origin feat/personal-projects-vercel-20260914
gh pr create --base main --head feat/personal-projects-vercel-20260914 --title "feat: publish personal browser projects" --body-file /tmp/leetcode-personal-projects-pr.md
~~~

- [ ] **Step 3: Inspect and merge the verified head**

Use gh pr view to confirm the PR head SHA, mergeability, and checks. Merge the exact verified head:

~~~bash
pr_number=$(gh pr list --head feat/personal-projects-vercel-20260914 --state open --json number --jq '.[0].number')
gh pr merge "$pr_number" --merge --delete-branch
~~~

- [ ] **Step 4: Verify merge ancestry**

~~~bash
pr_number=$(gh pr list --head feat/personal-projects-vercel-20260914 --state merged --json number --jq '.[0].number')
verified_head_sha=$(gh pr view "$pr_number" --json headRefOid --jq .headRefOid)
git fetch origin main
git merge-base --is-ancestor "$verified_head_sha" origin/main
~~~

Expected: exit 0.
