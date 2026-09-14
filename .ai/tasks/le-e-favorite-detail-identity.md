# Favorite detail identity

- Branch: feat/le-e-inline-vim-20260910.
- HEAD before work: 4745bd6ff71ad29ef627f93d9ab0474f7c2895f5.
- Preserve existing uncommitted Micro shortcuts, completion and indentation work.
- Reported symptom: favorite LCR 177 撞色搭配 loads as SQL 177 through numeric CLI.
- Public GraphQL probe confirms slug shu-zu-zhong-shu-zi-chu-xian-de-ci-shu-lcof,
  frontend ID LCR 177 and a nonempty 558-character translated statement.
- CLI 0.5.4 registry source parser drops the LCR prefix; cache lookup selects
  the first matching fid. Name lookup also reduces to fid, not an escape hatch.
- Read favorites by exact folder slug, retain it in detail results, and hide
  cached details belonging to another same-number question.
- Numeric CLI editing stays gated; loading a web statement alone does not prove
  CLI routing or make a source ready. Reject conflicting favorite identities.
- No test files or builds requested; use type/lint/diff checks and a disposable
  in-memory controller/API probe. No credentials or user solutions accessed.
- Verified: live controller → gateway → public GraphQL loads the LCR statement;
  edit/test/submit return false without any CLI call, ordinary #177 remains intact.
- Repeat static checks from project/le-e: `./node_modules/.bin/vue-tsc --noEmit`
  and `git diff --check`. Focused ESLint and Prettier checks passed.
- Next action: user restart acceptance after an explicitly requested build;
  this source change has not been built, committed or pushed.
- Independent review found a pre-existing boundary outside this screenshot fix:
  a single folder containing both colliding numeric IDs still needs slug-qualified
  list selection and navigation; current selection stores only a numeric ID.
  Do not claim full mixed-ID folder support or LCR code execution support.

## Repeatable read-only API check

Run from project/le-e; no build, credentials or solution files are involved:

```sh
node --input-type=module <<'JS'
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { ViteNodeServer } from 'vite-node/server';
import { ViteNodeRunner } from 'vite-node/client';
const server = await createServer({configFile:false,server:{middlewareMode:true},optimizeDeps:{noDiscovery:true}});
try {
  const vm = new ViteNodeServer(server);
  const runner = new ViteNodeRunner({root:server.config.root,fetchModule:id=>vm.fetchModule(id),resolveId:(id,parent)=>vm.resolveId(id,parent)});
  const {createChineseProblemCatalog} = await runner.executeFile('src/infrastructure/chineseProblemCatalog.ts');
  const {createLeetCodeGateway} = await runner.executeFile('src/infrastructure/leetcodeGateway.ts');
  const reject = () => { throw Error('Must not invoke numeric CLI'); };
  const gateway = createLeetCodeGateway({runner:{runCaptured:reject,runInherited:reject},chineseCatalog:createChineseProblemCatalog()});
  const problemSlug = 'shu-zu-zhong-shu-zi-chu-xian-de-ci-shu-lcof';
  const result = await gateway.loadDetail(177,{problemSlug});
  assert.equal(result.ok,true);
  assert.equal(result.value.slug,problemSlug);
  assert.match(result.value.statement,/sockets/);
  console.log('Exact LCR statement loaded without numeric CLI.');
} finally { await server.close(); }
JS
```
