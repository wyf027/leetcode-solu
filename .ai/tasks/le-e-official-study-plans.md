# Official study plan directory

- User approved dynamic official directory, separate from personal favorites;
  reuse clickable lists, breadcrumbs, search and question editing workflow.
- Gateway dynamically loads studyPlanV2Catalogs and paginated studyPlansV2ByCatalog;
  loads studyPlanV2Detail only when a plan opens. Exact titleSlug maps to existing
  real questionId summaries; official order is retained. No personal cookies sent.
- UI: o / right-header click opens official directory; v cycles three views;
  / searches plan names; click/Enter opens; breadcrumb/Esc returns; r retries.
- Public API validation found 33 plans. Heat100/Interview150/LeetCode75 return
  100/150/75 entries; dynamic-programming 46/50 and binary-search 32/42 publicly.
  Preserve official totals and disclose partial data. Fully locked plans stay in
  directory with explicit access warning. SQL/Pandas execution limitations noted.
- Terminal event probe passed click entry/search/open/order/breadcrumb restoration,
  retry/refresh, view cycling and preservation of personal favorites.
- Prior clickable navigation edits retained; no tests created/run. No real submit,
  credential reads, personal solution reads, commits or pushes.
- Type check, eslint src, diff check and requested Vite build pass (105 modules).
  Corepack was missing from PATH; used the existing absolute nvm corepack launcher.
- Gateway/controller negative probes verified access-error classification and
  already-aborted requests without any network dispatch. No real submissions.
- Next action: restart terminal, press o or click 官方题单 for visual acceptance.
- Repeat read-only entry check: query official GraphQL studyPlanV2Catalogs and
  studyPlansV2ByCatalog; load top-100-liked / top-interview-150 / leetcode-75 via
  createOfficialStudyPlansGateway and compare questions.length to 100/150/75.
