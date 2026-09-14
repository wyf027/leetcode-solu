# WYF Screenshot Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Turn wyf027/screenshot-to-code into a personally branded, Chinese-first screenshot-to-code tool with non-persistent browser-provided model keys.

**Architecture:** Keep the existing React/Vite frontend, FastAPI backend, WebSocket generation pipeline, and provider adapters. Make settings session-only, remove the upstream hosted email/credit flow, translate the primary generation path, and update the existing Vercel project in place.

**Tech Stack:** React 18, TypeScript, Vite, Tailwind CSS, FastAPI, WebSocket, Vercel Services

**Spec:** docs/superpowers/specs/2026-09-14-personal-projects-vercel-design.md in wyf027/leetcode-solu

## Global Constraints

- Base branch: main.
- Work branch: feat/wyf-screenshot-studio-20260914.
- Worktree: /Users/wuyangfan/Documents/Codex/2026-09-09/gong/work/screenshot-to-code-wyf-studio.
- Preserve the MIT license and attribution.
- Reuse the existing frontend, backend, provider adapters, and Vercel Services configuration.
- HTML with Tailwind CSS remains the default output.
- OpenAI, Gemini, and Anthropic keys live only in React state for the current page lifetime.
- Never put keys, images, credentials, or raw provider payloads in logs, task cards, commits, or prompts.
- Delete the upstream email subscription and paid-credit UI.
- Do not add or modify tests.
- Run the repository-required frontend lint; do not run the backend suite because backend code is unchanged.

---

### Task 1: Create the isolated product branch and task card

**Files:**
- Create: .ai/tasks/2026-09-14-wyf-screenshot-studio.md

**Interfaces:**
- Consumes: approved design and current origin/main at 1ad0308bf0461b542c4278fdb4f11ff59ae59081.
- Produces: a clean feature branch and a task card used by the remaining tasks.

- [ ] **Step 1: Inspect the checkout before writing**

Run:

~~~bash
git rev-parse --show-toplevel
git branch --show-current
git rev-parse HEAD
git status --short --branch
git remote -v
sed -n '1,240p' AGENTS.md
~~~

Expected: repository wyf027/screenshot-to-code, branch main, clean status, and both origin and upstream remotes.

- [ ] **Step 2: Create the feature branch**

Run:

~~~bash
git fetch origin main
git switch -c feat/wyf-screenshot-studio-20260914 origin/main
~~~

Expected: the new branch tracks origin/main and the worktree remains clean.

- [ ] **Step 3: Create the task card**

Create .ai/tasks/2026-09-14-wyf-screenshot-studio.md with:

~~~markdown
# WYF Screenshot Studio

- Status: implementation in progress.
- Branch: feat/wyf-screenshot-studio-20260914.
- Base: origin/main.
- Scope: personal branding, Chinese primary flow, session-only BYOK, and existing Vercel deployment.
- Non-scope: provider rewrites, new storage, authentication, billing, analytics, and backend persistence.
- Verification: frontend lint, secret scan, Vercel deployment, browser checks, then one user-authorized provider call.
~~~

- [ ] **Step 4: Commit the checkpoint**

~~~bash
git add .ai/tasks/2026-09-14-wyf-screenshot-studio.md
git commit -m "docs: track WYF screenshot studio"
~~~

Expected: one documentation-only commit.

### Task 2: Remove upstream hosted-service behavior and stop key persistence

**Files:**
- Modify: frontend/src/App.tsx
- Modify: frontend/src/config.ts
- Delete: frontend/src/components/TermsOfServiceDialog.tsx

**Interfaces:**
- Consumes: the existing Settings interface and generateCode request assembly.
- Produces: a Settings object held by React useState; doGenerateCode still receives the same FullGenerationSettings shape.

- [ ] **Step 1: Replace persisted settings with page-session state**

In frontend/src/App.tsx, keep usePersistedState only for appTheme and change the Settings initialization to:

~~~tsx
const [settings, setSettings] = useState<Settings>({
  openAiApiKey: null,
  openAiBaseURL: null,
  replicateApiKey: null,
  anthropicApiKey: null,
  geminiApiKey: null,
  screenshotOneApiKey: null,
  isImageGenerationEnabled: true,
  editorTheme: EditorTheme.COBALT,
  generatedCodeConfig: Stack.HTML_TAILWIND,
  codeGenerationModel: CodeGenerationModel.GEMINI_3_FLASH_PREVIEW_MINIMAL,
  selectedDesignSystemId: null,
  isTermOfServiceAccepted: true,
});
~~~

This keeps the existing request type intact while ensuring API keys disappear on reload.

- [ ] **Step 2: Delete the hosted email gate**

In frontend/src/App.tsx:

- Remove the TermsOfServiceDialog import.
- Remove handleTermDialogOpenChange.
- Remove the IS_RUNNING_ON_CLOUD TermsOfServiceDialog render block.
- Change the OnboardingNote condition so it is shown only when all three supported provider keys are absent:

~~~tsx
{IS_RUNNING_ON_CLOUD &&
  !settings.openAiApiKey &&
  !settings.anthropicApiKey &&
  !settings.geminiApiKey && (
    <div className="px-6 mt-4">
      <OnboardingNote />
    </div>
  )}
~~~

Delete frontend/src/components/TermsOfServiceDialog.tsx.

- [ ] **Step 3: Remove the unused upstream form secret**

Delete PICO_BACKEND_FORM_SECRET from frontend/src/config.ts. Do not read or copy any environment value.

- [ ] **Step 4: Verify the storage boundary**

Run:

~~~bash
! rg -n "TermsOfServiceDialog|PICO_BACKEND_FORM_SECRET|VITE_PICO_BACKEND_FORM_SECRET" frontend --glob '!pnpm-lock.yaml'
! rg -n "usePersistedState<Settings>|localStorage.*ApiKey|localStorage.*apiKey" frontend/src
~~~

Expected: no matches. appTheme may still use usePersistedState.

- [ ] **Step 5: Commit**

~~~bash
git add frontend/src/App.tsx frontend/src/config.ts frontend/src/components/TermsOfServiceDialog.tsx
git commit -m "fix: keep provider keys session-only"
~~~

### Task 3: Apply personal branding and Chinese primary-flow copy

**Files:**
- Modify: frontend/index.html
- Modify: frontend/src/hooks/useBrowserTabIndicator.ts
- Modify: frontend/src/components/messages/OnboardingNote.tsx
- Modify: frontend/src/components/recording/ScreenRecorder.tsx
- Modify: frontend/src/components/sidebar/IconStrip.tsx
- Modify: frontend/src/components/unified-input/UnifiedInputPane.tsx
- Modify: frontend/src/components/unified-input/tabs/UploadTab.tsx
- Modify: frontend/src/components/unified-input/ScreenshotToCodeControls.tsx
- Modify: frontend/src/components/settings/OutputSettingsSection.tsx
- Modify: frontend/src/components/settings/SettingsTab.tsx
- Modify: frontend/src/components/preview/PreviewPane.tsx
- Modify: frontend/src/components/preview/CodeTab.tsx
- Modify: frontend/src/generateCode.ts
- Modify: frontend/src/urls.ts
- Modify: frontend/vite.config.ts
- Modify: README.md

**Interfaces:**
- Consumes: existing component props and Stack values.
- Produces: the same component APIs and data flow, with personal metadata and Chinese user-facing copy.

- [ ] **Step 1: Replace page metadata**

Set frontend/index.html to use:

~~~html
<html lang="zh-CN">
<title>WYF Screenshot Studio</title>
<meta property="og:title" content="WYF Screenshot Studio" />
<meta property="og:description" content="把截图转换为可预览、可复制的前端代码" />
<meta property="og:url" content="https://screenshot-to-code-blue.vercel.app" />
<meta name="twitter:title" content="WYF Screenshot Studio" />
<meta name="twitter:description" content="把截图转换为可预览、可复制的前端代码" />
~~~

Remove the upstream twitter:site and upstream Open Graph image tags. Remove the hosted injectHead placeholder and its Plausible injection from vite.config.ts. Keep the existing favicon and font loading.

- [ ] **Step 2: Update the browser-tab title**

In frontend/src/hooks/useBrowserTabIndicator.ts use:

~~~ts
const CODING_SETTINGS = {
  title: "正在生成代码...",
  favicon: "/favicon/coding.png",
};
const DEFAULT_SETTINGS = {
  title: "WYF Screenshot Studio",
  favicon: "/favicon/main.png",
};
~~~

- [ ] **Step 3: Replace the onboarding notice**

Replace frontend/src/components/messages/OnboardingNote.tsx with a short notice that says:

~~~tsx
export function OnboardingNote() {
  return (
    <div className="flex flex-col space-y-2 rounded bg-violet-700 p-3 text-sm text-white">
      <strong>开始前请先配置模型 Key</strong>
      <span>
        点击上方设置按钮，填写 OpenAI、Gemini 或 Anthropic Key。Key
        只在当前页面中使用，刷新或关闭页面后即清除。
      </span>
    </div>
  );
}
~~~

- [ ] **Step 4: Translate the first-run navigation and generation controls**

Use these exact labels without changing component props:

~~~text
Upload -> 上传图片
URL -> 网页截图
Text -> 文字描述
Import -> 导入代码
Stack -> 输出技术
Add instructions -> 添加生成要求
Additional instructions -> 生成要求
Optional -> 可选
Generate Code -> 生成代码
Generating… -> 正在生成…
Extract image assets from original -> 从原图提取素材
~~~

Apply them in UnifiedInputPane.tsx, ScreenshotToCodeControls.tsx, ScreenRecorder.tsx, and IconStrip.tsx. In OutputSettingsSection.tsx use 输出技术： as the default label and 选择输出技术 as the empty-selection prompt.

- [ ] **Step 5: Translate upload validation and the upload surface**

In UploadTab.tsx retain PNG/JPG and 20 MB validation, the five-screenshot limit, and the existing video behavior. Translate the visible dropzone, remove, instruction, and validation messages. Use these exact validation messages:

~~~text
请上传 1 个视频，或最多 5 张截图，不能混合上传。
请先移除视频，再添加截图。
最多可上传 5 张截图。
文件不能超过 20 MB。
不支持该文件类型，请使用 PNG、JPG、MP4、MOV 或 WebM。
读取文件失败。
~~~

- [ ] **Step 6: Translate key settings and correct the privacy statement**

In SettingsTab.tsx translate the page title, theme headings, API key headings, image-generation headings, and screenshot capability status. For every provider key show:

~~~text
只在当前页面中使用，不会保存到浏览器或服务器；刷新页面后需要重新填写。
~~~

Keep the existing provider-specific inputs and model behavior. Remove the affiliate wording from ScreenshotOne and link directly to https://screenshotone.com/.

- [ ] **Step 7: Translate preview actions**

In PreviewPane.tsx and CodeTab.tsx use:

~~~text
Preview -> 预览
Chat -> 调整
Desktop -> 桌面端
Mobile -> 移动端
Code -> 代码
Copy Code -> 复制代码
Copied to clipboard -> 已复制代码
Download Code -> 下载代码
Refresh Preview -> 刷新预览
Open in New Tab -> 新窗口打开
~~~

Keep CodePen behavior unchanged.

- [ ] **Step 8: Replace upstream links and README introduction**

In frontend/src/urls.ts, point help links to the personal repository:

~~~ts
export const URLS = {
  "intro-to-video":
    "https://github.com/wyf027/screenshot-to-code/wiki/Screen-Recording-to-Code",
  tips: "https://github.com/wyf027/screenshot-to-code",
};
~~~

Rewrite the README heading and first section in Chinese as WYF Screenshot Studio, state that it is based on abi/screenshot-to-code under MIT, and document that keys are session-only. Keep upstream setup commands that remain accurate.

- [ ] **Step 9: Translate runtime generation errors without logging provider payloads**

In frontend/src/generateCode.ts replace the generic English constants and map the known provider/transport failures:

~~~ts
const ERROR_MESSAGE = "生成失败，请稍后重试。";
const CANCEL_MESSAGE = "已取消生成";

function toUserError(message = "") {
  const normalized = message.toLowerCase();
  if (normalized.includes("no openai") || normalized.includes("no api key")) {
    return "请先在设置中填写 OpenAI、Gemini 或 Anthropic Key。";
  }
  if (normalized.includes("401") || normalized.includes("authentication")) {
    return "模型 Key 无效，请检查后重试。";
  }
  if (normalized.includes("quota") || normalized.includes("credit")) {
    return "模型额度不足，请检查服务商账户。";
  }
  if (normalized.includes("rate limit") || normalized.includes("429")) {
    return "模型请求过于频繁，请稍后重试。";
  }
  if (normalized.includes("timeout") || normalized.includes("timed out")) {
    return "生成请求超时，请缩小图片或稍后重试。";
  }
  return ERROR_MESSAGE;
}
~~~

Use toUserError for WebSocket error messages and close reasons. Keep raw provider messages out of console output; log only the WebSocket close code and the localized category. In App.tsx use 未生成可预览代码，请调整要求后重试。 when a failed create leaves every variant empty.

- [ ] **Step 10: Run required checks**

Run:

~~~bash
cd frontend
pnpm lint
~~~

The repository records existing baseline lint failures. Save the output, then run ESLint only on the changed TypeScript files and require exit 0:

~~~bash
pnpm exec eslint src/App.tsx src/config.ts src/generateCode.ts src/hooks/useBrowserTabIndicator.ts src/components/messages/OnboardingNote.tsx src/components/unified-input/UnifiedInputPane.tsx src/components/unified-input/tabs/UploadTab.tsx src/components/unified-input/ScreenshotToCodeControls.tsx src/components/settings/OutputSettingsSection.tsx src/components/settings/SettingsTab.tsx src/components/preview/PreviewPane.tsx src/components/preview/CodeTab.tsx src/urls.ts
~~~

Run from the repository root:

~~~bash
git diff --check
! rg -n "buy\\.stripe\\.com|backend\\.buildpicoapps\\.com|twitter:site" frontend README.md
! rg -n "sk-[A-Za-z0-9]|gh[pousr]_[A-Za-z0-9]|API_KEY=[^ ]|VERCEL_TOKEN=" . --glob '!frontend/pnpm-lock.yaml' --glob '!backend/poetry.lock' --glob '!backend/uv.lock'
~~~

Expected: no whitespace errors, no removed upstream hosted-service links, and no credential values.

- [ ] **Step 11: Commit**

~~~bash
git add README.md frontend
git commit -m "feat: personalize screenshot to code"
~~~

### Task 4: Deliver and verify the production tool

**Files:**
- Modify: .ai/tasks/2026-09-14-wyf-screenshot-studio.md

**Interfaces:**
- Consumes: the completed frontend branch.
- Produces: a merged pull request and a verified production deployment at the existing public alias.

- [ ] **Step 1: Record verification evidence and mark the task ready**

Update the task card with the lint results, changed-file ESLint result, secret scan, and current head SHA.

- [ ] **Step 2: Push and create the pull request**

~~~bash
git push -u origin feat/wyf-screenshot-studio-20260914
gh pr create --base main --head feat/wyf-screenshot-studio-20260914 --title "feat: personalize screenshot to code" --body-file /tmp/wyf-screenshot-studio-pr.md
~~~

The PR body must describe session-only keys, removed upstream subscription behavior, Chinese primary flow, and lint evidence.

- [ ] **Step 3: Inspect and merge the exact head**

Run gh pr view with number, state, mergeable, headRefOid, and statusCheckRollup. Merge only when the head SHA matches the verified commit and required checks are successful or absent.

~~~bash
pr_number=$(gh pr list --head feat/wyf-screenshot-studio-20260914 --state open --json number --jq '.[0].number')
gh pr merge "$pr_number" --merge --delete-branch
~~~

- [ ] **Step 4: Wait for the existing Vercel production deployment**

Inspect GitHub deployments for the merged main SHA. If the Git integration does not create a deployment, authenticate Vercel CLI and deploy the existing project from the repository root:

~~~bash
npx --yes vercel@59.16.0 whoami
npx --yes vercel@59.16.0 deploy --prod --yes
~~~

Never read or print the Vercel auth file.

- [ ] **Step 5: Verify the public shell without a provider call**

Verify https://screenshot-to-code-blue.vercel.app/ returns HTTP 200 and contains WYF Screenshot Studio. In a browser verify:

- Chinese upload screen is visible.
- Settings exposes OpenAI, Gemini, and Anthropic.
- Refresh clears a typed dummy key.
- Missing-key generation displays a Chinese error.
- No email subscription or upstream credit purchase is shown.
- Browser console has no application error on first load.

- [ ] **Step 6: Complete one real generation with the user**

Open the production settings page and hand control to the user to paste one provider key. Immediately before the user starts generation, state that the call sends the screenshot and prompt to the selected provider and may incur provider charges. Do not inspect the key field.

Success requires streamed code, rendered preview, copy, and download. If the provider rejects quota or credentials, report provider E2E as blocked while retaining the verified deployment evidence.

- [ ] **Step 7: Verify merge ancestry**

~~~bash
pr_number=$(gh pr list --head feat/wyf-screenshot-studio-20260914 --state merged --json number --jq '.[0].number')
verified_head_sha=$(gh pr view "$pr_number" --json headRefOid --jq .headRefOid)
git fetch origin main
git merge-base --is-ancestor "$verified_head_sha" origin/main
~~~

Expected: exit 0.
