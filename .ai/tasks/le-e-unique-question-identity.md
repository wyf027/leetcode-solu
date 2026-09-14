# Unique LeetCode question identity

- User authorized repairing all discovered ID collisions; no tests/builds requested.
- Parent writer stays on feat/le-e-inline-vim-20260910, baseline
  4745bd6ff71ad29ef627f93d9ab0474f7c2895f5; preserve prior Micro/editor work.
- Internal ProblemSummary.id becomes the site's real numeric questionId. Preserve
  full frontendId (23, LCR 023, 面试题 01.01) separately for display and search.
- Exact authenticated helper catalogue replaces lossy human CLI list parsing in
  production. Existing numeric maps, selection, Vue keys and dialog IDs then use
  unique IDs without converting every component to a second key representation.
- Private helper performs pick/edit/test/exec using real questionId AND expected
  slug; capability check must fail closed for an old helper, no numeric fallback.
- Backend subagent works in its own temporary worktree; parent imports only its
  helper/setup/patch files. Parent exclusively edits TS/UI here.
- Verification: type/lint, all-catalogue read-only reconciliation and in-memory
  probes; no real submissions, credentials, solution reads or builds.
- Implemented exact JSONL catalogue (completion sentinel; reject duplicates/truncation),
  slug-keyed Chinese translations, full frontend labels/search, unique numeric IDs
  across selection/favorites/dialog/source/results and exact helper dispatch.
- Integrated backend helper/setup/patch files from the isolated backend branch.
  New helper capability token is mandatory; no fallback to a legacy binary.
- Helper qid lookup requires an expected slug before code access. Default source
  paths stay unchanged; templates without slug append qid+slug for uniqueness.
- Helper transient session/CSRF only enter request headers. Config loading does
  not import cookie env values (language save must never persist transient tokens).
  LEETCODE_SITE routes URLs without changing the persisted cookie/site settings.
- Verified against the live public catalogue: 4435 rows and 4435 unique IDs;
  Chinese catalogue also has 4435 slugs including all 109 interview labels.
- In-memory controller+gateway probe verified normal 3 / LCR 003 / normal 4 cycling,
  prefixed search, isolated stars/source readiness/details/results, exact qid+slug
  command arguments, favorite mutation preservation and submit-dialog target.
  No real editor, user source or LeetCode submission was touched by the probe.
- Type check, focused ESLint, formatting and patch applicability checks passed.
- User subsequently requested building. setup:account initially exposed a Rust
  Diesel field/local variable collision (`category`); renamed the local binding
  to category_name in both the versioned patch and the applied private source.
- setup:account and pnpm build now pass. Built helper returns exactly
  `leetcode 0.5.4 le-e-question-id-v1`; bundled main passes Node syntax check.
  Vite's >500 kB chunk warning is non-blocking. No repository tests run.
- Next action: restart and accept the real terminal/editor workflow.
  No real LeetCode submission, commit or push performed.

## Repeatable read-only identity probe

From project/le-e (loads source through Vite, without building):

```sh
node --input-type=module <<'JS'
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {ViteNodeServer} from 'vite-node/server';
import {ViteNodeRunner} from 'vite-node/client';
const server = await createServer({configFile:false,server:{middlewareMode:true},optimizeDeps:{noDiscovery:true}});
try {
  const vm = new ViteNodeServer(server);
  const runner = new ViteNodeRunner({root:server.config.root,fetchModule:id=>vm.fetchModule(id),resolveId:(id,parent)=>vm.resolveId(id,parent)});
  const {parseQuestionCatalog} = await runner.executeFile('src/infrastructure/parsers/listParser.ts');
  const {filterProblems} = await runner.executeFile('src/application/filters.ts');
  const base = {title:'same title',difficulty:'Easy',acceptance:null,solveStatus:'unsolved',starred:false};
  const rows = [{...base,id:3,frontendId:'3',slug:'normal-3'},{...base,id:1000230,frontendId:'LCR 003',slug:'w3tCBm'}];
  const input = rows.map(JSON.stringify).join('\n')+'\n'+JSON.stringify({complete:true,count:2});
  const result = parseQuestionCatalog(input);
  assert.equal(result.ok,true);
  assert.equal(result.value.summaries.length,2);
  assert.equal(filterProblems(result.value.summaries,{query:'LCR 003',difficulty:'all',starredOnly:false})[0].id,1000230);
  assert.equal(parseQuestionCatalog(input.slice(0,-10)).ok,false);
} finally { await server.close(); }
JS
```
