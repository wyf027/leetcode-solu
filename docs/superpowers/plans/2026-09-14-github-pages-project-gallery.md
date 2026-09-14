# GitHub Pages Personal Project Gallery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Add a Tailwind personal-project section to https://wyf027.github.io/ using only production links that passed the Vercel publication plan.

**Architecture:** Keep the current Jekyll and Bootstrap blog unchanged. Add one YAML data source and render the cards inline on the homepage with prefixed Tailwind browser utilities and preflight disabled.

**Tech Stack:** Jekyll, Liquid, YAML, Tailwind browser build, GitHub Pages

**Spec:** docs/superpowers/specs/2026-09-14-personal-projects-vercel-design.md in wyf027/leetcode-solu

## Global Constraints

- Base branch: gh-pages.
- Work branch: feat/personal-project-gallery-20260914.
- Worktree: /Users/wuyangfan/Documents/Codex/2026-09-09/gong/work/wyf027-github-io-personal-projects.
- Preserve the existing Jekyll theme, posts, resume, install endpoint, and Bootstrap layout.
- Use only gallery-eligible production URLs from the leetcode-solu deployment manifest.
- Put WYF Screenshot Studio first.
- Prefix Tailwind utilities with tw- and disable preflight.
- Do not add JavaScript behavior, dependencies, or test files beyond the Tailwind browser loader.

---

### Task 1: Create the isolated gallery branch and task card

**Files:**
- Create: .ai/tasks/2026-09-14-personal-project-gallery.md

**Interfaces:**
- Consumes: origin/gh-pages and the verified Vercel deployment manifest.
- Produces: a clean feature branch for the homepage change.

- [ ] **Step 1: Inspect the checkout**

~~~bash
git rev-parse --show-toplevel
git branch --show-current
git rev-parse HEAD
git status --short --branch
git remote -v
~~~

Expected: wyf027/wyf027.github.io on a clean gh-pages branch.

- [ ] **Step 2: Create the branch**

~~~bash
git fetch origin gh-pages
git switch -c feat/personal-project-gallery-20260914 origin/gh-pages
~~~

- [ ] **Step 3: Create the task card**

Create .ai/tasks/2026-09-14-personal-project-gallery.md recording the branch, verified deployment-manifest commit, number of eligible projects, and the live homepage URL.

### Task 2: Add the project data source

**Files:**
- Create: _data/projects.yml

**Interfaces:**
- Consumes: the exact stable aliases recorded by the Vercel publication plan.
- Produces: site.data.projects entries with name, description, tags, preview_url, and source_url.

- [ ] **Step 1: Write verified entries**

Create one YAML entry for WYF Screenshot Studio followed by each gallery-eligible leetcode-solu project. Use this shape:

~~~yaml
- name: WYF Screenshot Studio
  description: 上传截图，使用自己的模型 Key 生成并预览前端代码。
  tags:
    - React
    - TailwindCSS
    - FastAPI
  preview_url: https://screenshot-to-code-blue.vercel.app/
  source_url: https://github.com/wyf027/screenshot-to-code
~~~

For leetcode-solu entries, copy each verified stable alias from the deployment manifest and use these source URLs:

~~~text
classic-atlas: https://github.com/wyf027/leetcode-solu/tree/main/project/classic-atlas
classic-games: https://github.com/wyf027/leetcode-solu/tree/main/project/classic-games
classic-sci-fi-atlas: https://github.com/wyf027/leetcode-solu/tree/main/project/classic-sci-fi-atlas
daodejing-atlas: https://github.com/wyf027/leetcode-solu/tree/main/project/daodejing-atlas
declarative-partial-updates-demo: https://github.com/wyf027/leetcode-solu/tree/main/project/declarative-partial-updates-demo
drag-sort: https://github.com/wyf027/leetcode-solu/tree/main/project/drag-sort
design-pattern: https://github.com/wyf027/leetcode-solu/tree/main/project/design-pattern
leetcode-interactive: https://github.com/wyf027/leetcode-solu/tree/main/project/leetcode-interactive
nodepod-demo: https://github.com/wyf027/leetcode-solu/tree/main/project/nodepod-demo
open-file-viewer-demo: https://github.com/wyf027/leetcode-solu/tree/main/project/open-file-viewer-demo
rag-flow-demo: https://github.com/wyf027/leetcode-solu/tree/main/project/rag-flow-demo
react-demo: https://github.com/wyf027/leetcode-solu/tree/main/project/react-demo
screenshot-workflow-lite: https://github.com/wyf027/leetcode-solu/tree/main/project/screenshot-workflow-lite
~~~

Do not add an entry whose manifest marks HTTP, title, browser render, or primary navigation as failed.

- [ ] **Step 2: Validate the YAML**

~~~bash
ruby -e 'require "yaml"; rows=YAML.load_file("_data/projects.yml"); abort "empty projects" unless rows.is_a?(Array) && !rows.empty?; abort "bad project" unless rows.all? { |row| %w[name description tags preview_url source_url].all? { |key| row.key?(key) } }; puts "#{rows.length} projects valid"'
~~~

Expected: a positive project count and exit 0.

### Task 3: Render the Tailwind project section

**Files:**
- Modify: index.html

**Interfaces:**
- Consumes: site.data.projects.
- Produces: a responsive card grid between the jumbotron and existing blog content.

- [ ] **Step 1: Configure scoped Tailwind on the homepage**

After the front matter in index.html, add:

~~~html
<script src="https://cdn.tailwindcss.com"></script>
<script>
tailwind.config = {
  prefix: 'tw-',
  corePlugins: { preflight: false }
}
</script>
~~~

- [ ] **Step 2: Render the project grid**

Insert this section after the jumbotron and before the existing content container:

~~~html
<section id="projects" class="tw-bg-slate-50 tw-py-16">
  <div class="container">
    <div class="tw-mb-8 tw-flex tw-items-end tw-justify-between tw-gap-4">
      <div>
        <p class="tw-m-0 tw-text-sm tw-font-semibold tw-uppercase tw-tracking-[0.24em] tw-text-blue-600">Selected Work</p>
        <h2 class="tw-mt-2 tw-text-3xl tw-font-bold tw-text-slate-900">个人项目</h2>
      </div>
      <a class="tw-text-sm tw-font-medium tw-text-blue-600 hover:tw-text-blue-800" href="https://github.com/wyf027" target="_blank" rel="noopener noreferrer">查看 GitHub</a>
    </div>
    <div class="tw-grid tw-gap-6 md:tw-grid-cols-2 lg:tw-grid-cols-3">
      {% for project in site.data.projects %}
      <article class="tw-flex tw-h-full tw-flex-col tw-rounded-2xl tw-border tw-border-slate-200 tw-bg-white tw-p-6 tw-shadow-sm tw-transition hover:-tw-translate-y-1 hover:tw-shadow-lg">
        <h3 class="tw-m-0 tw-text-xl tw-font-semibold tw-text-slate-900">{{ project.name }}</h3>
        <p class="tw-mt-3 tw-flex-1 tw-text-sm tw-leading-6 tw-text-slate-600">{{ project.description }}</p>
        <div class="tw-mt-4 tw-flex tw-flex-wrap tw-gap-2">
          {% for tag in project.tags %}
          <span class="tw-rounded-full tw-bg-slate-100 tw-px-3 tw-py-1 tw-text-xs tw-font-medium tw-text-slate-700">{{ tag }}</span>
          {% endfor %}
        </div>
        <div class="tw-mt-6 tw-flex tw-gap-4 tw-text-sm tw-font-semibold">
          <a class="tw-text-blue-600 hover:tw-text-blue-800" href="{{ project.preview_url }}" target="_blank" rel="noopener noreferrer">在线预览</a>
          <a class="tw-text-slate-600 hover:tw-text-slate-900" href="{{ project.source_url }}" target="_blank" rel="noopener noreferrer">查看源码</a>
        </div>
      </article>
      {% endfor %}
    </div>
  </div>
</section>
~~~

- [ ] **Step 3: Run source checks**

~~~bash
git diff --check
rg -q 'prefix: .tw-.' index.html
rg -q 'corePlugins: \\{ preflight: false \\}' index.html
rg -q 'for project in site.data.projects' index.html
rg -q 'rel="noopener noreferrer"' index.html
~~~

Expected: exit 0.

- [ ] **Step 4: Scan links and secrets**

~~~bash
ruby -e 'require "yaml"; require "uri"; YAML.load_file("_data/projects.yml").each { |row| %w[preview_url source_url].each { |key| uri=URI(row.fetch(key)); abort "#{row["name"]}: #{key}" unless uri.is_a?(URI::HTTPS) } }'
! rg -n "sk-[A-Za-z0-9]|gh[pousr]_[A-Za-z0-9]|VERCEL_TOKEN=|API_KEY=[^ ]" index.html _data/projects.yml .ai/tasks
~~~

Expected: all links are HTTPS and no credential values match.

- [ ] **Step 5: Commit**

~~~bash
git add index.html _data/projects.yml .ai/tasks/2026-09-14-personal-project-gallery.md
git commit -m "feat: add personal project gallery"
~~~

### Task 4: Publish and verify GitHub Pages

**Files:**
- Modify: .ai/tasks/2026-09-14-personal-project-gallery.md

**Interfaces:**
- Consumes: the committed gallery branch.
- Produces: a merged gh-pages pull request and a verified public homepage.

- [ ] **Step 1: Push and create the pull request**

~~~bash
git push -u origin feat/personal-project-gallery-20260914
gh pr create --base gh-pages --head feat/personal-project-gallery-20260914 --title "feat: add personal project gallery" --body-file /tmp/personal-project-gallery-pr.md
~~~

- [ ] **Step 2: Inspect and merge the exact head**

Use gh pr view to verify the head SHA, mergeability, and checks. Merge only the reviewed head:

~~~bash
pr_number=$(gh pr list --head feat/personal-project-gallery-20260914 --state open --json number --jq '.[0].number')
gh pr merge "$pr_number" --merge --delete-branch
~~~

- [ ] **Step 3: Wait for GitHub Pages**

Use gh run list and gh run watch for the Pages workflow triggered by the merge SHA. Success means the workflow completed successfully; it does not yet prove the live page.

- [ ] **Step 4: Verify the public homepage**

Verify https://wyf027.github.io/ returns HTTP 200 and contains:

~~~text
个人项目
WYF Screenshot Studio
在线预览
查看源码
~~~

Open the live page in a desktop and mobile viewport. Confirm the existing blog header, post list, /resume/, and /install remain reachable. Check that every preview link opens its exact verified Vercel URL and capture desktop and mobile screenshots.

- [ ] **Step 5: Record final evidence**

Update the task card with the merge SHA, Pages workflow URL/status, live HTTP result, card count, link count, desktop screenshot path, mobile screenshot path, and any project excluded during deployment. Commit and merge this evidence only if it changes the repository after the first gallery PR.

- [ ] **Step 6: Verify merge ancestry**

~~~bash
pr_number=$(gh pr list --head feat/personal-project-gallery-20260914 --state merged --json number --jq '.[0].number')
verified_head_sha=$(gh pr view "$pr_number" --json headRefOid --jq .headRefOid)
git fetch origin gh-pages
git merge-base --is-ancestor "$verified_head_sha" origin/gh-pages
~~~

Expected: exit 0.
