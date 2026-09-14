# Add Screenshot Workflow Lite

- Owner: Codex
- Branch: `feat/screenshot-workflow-lite`
- User requested a GitHub survey of screenshot-to-code projects and a minimal self-owned version committed to `wyf027/leetcode-solu`.
- Add `project/screenshot-workflow-lite` as a static Tailwind HTML tool.
- Scope: local screenshot preview, workflow generation, JSON export, Markdown prompt copy.
- Non-scope: model API calls, backend service, persisted uploads, real screenshot-to-code inference.
- GitHub references reviewed:
  - `abi/screenshot-to-code`: MIT, React/Vite frontend plus FastAPI backend, supports HTML/Tailwind, React, Vue and related stacks.
  - GitHub `screenshot-to-code` topic: lists projects such as screenshot-to-page, OpenKombai, pictocode and AWS Bedrock samples.
  - `aws-samples/screenshot-to-code-use-bedrock`: MIT-0 sample fork, not production-ready.
- Verification:
  - Static source checks only; no build step is required for this one-file HTML project.
