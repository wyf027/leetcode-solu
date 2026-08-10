# LeetCode Vue TUI 实施计划

- 日期：2026-08-10
- 状态：执行中
- 分支：`feat/leetcode-vue-tui`
- 设计依据：`docs/superpowers/specs/2026-08-10-leetcode-vue-tui-design.md`
- 已批准设计提交：`d2a4082`、`d6624c2`

## 1. 交付目标

在当前仓库实现可运行的 `le-e` 终端应用，以 Vue 3、TypeScript 和
`@simon_he/vue-tui` 1.1.5 包装本机 `leetcode` 0.5.4，完成列表、搜索、难度/收藏
筛选、详情、TUI 内嵌基础代码编辑、测试日志和显式确认提交。

实施全过程遵循：

- 保留并持续运行变更前已经落地的 50 个测试；按用户明确要求，内嵌编辑器及后续 UI
  不新增测试用例。
- 所有 CLI 调用使用参数数组与 `shell: false`。
- 自动化测试只能调用假 CLI，绝不调用真实 `leetcode exec`。
- 运行时不读取 Cookie、CLI SQLite、LeetCode API 或 `leetcode.toml`；只有用户显式执行的
  setup 可以定点替换 `[code].editor`，且不得输出或备份 Cookie。
- 不修改设计外功能，不加入每日一题、统计、语法高亮、行号、撤销/重做等扩展。
- HTML 不在本项目产物范围；若测试报告需要 HTML，必须使用 TailwindCSS。

## 2. 完成证据

最终至少提供以下可重复证据：

```text
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm check
```

此外提供以下手工证据：

- 假 CLI 编辑链路记录，证明模板路径来自 CLI、`Ctrl+S` 后假 test 读取到一致源码。
- `100x28` headless 普通界面和编辑界面快照。
- 假 CLI 调用记录，证明只有确认层 `y` 触发一次假 `exec`。
- 真实 CLI 的 `--version`、列表、收藏和详情只读验收结果。
- 未经具体题号授权，不运行真实 `edit`、`test` 或 `exec`。

## 3. 执行约定

- 每一剩余任务结束运行 Prettier、ESLint、类型检查和构建；现有测试只在行为接线稳定后
  累计运行，不创建新测试文件或新用例。
- 解析器 fixture 只保存脱敏输出，不保存 Cookie、token、代码答案或账号信息。
- 子进程测试通过依赖注入传入假命令路径，不通过全局修改用户环境实现。
- 手工验收临时目录使用系统安全临时目录，结束后清理。
- 若 `vue-tui` 公开类型与设计假设不同，先通过最小编译探针确认，再在任务卡记录偏差。
- 任何需要更改已批准交互或安全门的情况都停止实施并请求用户决定。

## 4. 分步任务

当前进度：任务 1–8 已完成；任务 9 的终端生命周期已完成，Vue 启动尚未接入。剩余任务
从任务 9 继续，原外部编辑器和测试先行描述由 `d6624c2` 的增量设计取代。

### 任务 1：建立 Node/Vue/TypeScript 工程门禁

新增文件：

```text
.nvmrc
package.json
pnpm-lock.yaml
tsconfig.json
tsconfig.node.json
vite.config.ts
vitest.config.ts
eslint.config.js
.prettierrc.json
.prettierignore
src/main.ts
src/config/runtime.ts
tests/unit/runtime.spec.ts
```

步骤：

1. 固定 Node 22、pnpm 11、Vue 3.5、`@simon_he/vue-tui` 1.1.5。
2. 先写 `runtime.spec.ts`，断言目标语言、最小终端尺寸、超时和日志上限。
3. 运行 `pnpm test -- tests/unit/runtime.spec.ts`，确认因模块缺失失败。
4. 实现 `runtime.ts` 常量并完成 Vite terminal build 配置。
5. 建立 format、lint、typecheck、test、build、check 脚本。

验收命令：

```text
pnpm test -- tests/unit/runtime.spec.ts
pnpm typecheck
pnpm build
```

### 任务 2：实现领域类型与输出净化

新增文件：

```text
src/domain/problem.ts
src/domain/operation.ts
src/domain/errors.ts
src/infrastructure/parsers/outputSanitizer.ts
tests/unit/outputSanitizer.spec.ts
```

测试先覆盖：

- ANSI、C0/C1 控制字符移除。
- `LEETCODE_SESSION`、`csrftoken`、Cookie、Authorization 整值脱敏。
- 普通中文、emoji、换行和制表符保留。
- 单行 4 KiB、流 1 MiB 截断标记。

验收命令：

```text
pnpm test -- tests/unit/outputSanitizer.spec.ts
pnpm typecheck
```

### 任务 3：实现列表解析与重复 ID 候选

新增文件：

```text
src/infrastructure/parsers/listParser.ts
tests/fixtures/leetcode-0.5.4/list-basic.txt
tests/fixtures/leetcode-0.5.4/list-starred.txt
tests/fixtures/leetcode-0.5.4/list-unicode.txt
tests/fixtures/leetcode-0.5.4/list-malformed.txt
tests/unit/listParser.spec.ts
```

测试先覆盖：

- solved、not-ac、locked、unknown。
- Easy、Medium、Hard、通过率缺失。
- 中英文和 emoji 宽度。
- 同一数字 ID 的首条 provisional 项及 collision candidates。
- 空输出、部分坏行、完全不可解析输出。
- starred 输出按 ID 合并。

返回结构必须包含 summaries、collision map、duplicate count 和 unparsed line count。

验收命令：

```text
pnpm test -- tests/unit/listParser.spec.ts
```

### 任务 4：实现详情与运行结果解析

新增文件：

```text
src/infrastructure/parsers/detailParser.ts
src/infrastructure/parsers/runResultParser.ts
tests/fixtures/leetcode-0.5.4/pick-two-sum.txt
tests/fixtures/leetcode-0.5.4/test-passed.txt
tests/fixtures/leetcode-0.5.4/test-failed.txt
tests/fixtures/leetcode-0.5.4/submit-accepted.txt
tests/unit/detailParser.spec.ts
tests/unit/runResultParser.spec.ts
```

测试先覆盖：

- `pick` 头部 ID、标题和正文。
- ID 不匹配、标题匹配其他 candidate、无 candidate conflict。
- test/submit 的 passed、failed、accepted、rejected、unknown。
- 非零退出与文本结果之间的优先规则。

验收命令：

```text
pnpm test -- tests/unit/detailParser.spec.ts tests/unit/runResultParser.spec.ts
```

### 任务 5：实现受控子进程执行器

新增文件：

```text
src/infrastructure/processRunner.ts
tests/helpers/process-fixture.mjs
tests/unit/processRunner.spec.ts
```

接口分为 captured 和 inherited 两种运行方式。测试先覆盖：

- 命令与参数数组原样传递，`shell: false`。
- stdout/stderr 分流与实时行回调。
- 30/120 秒超时。
- 主动取消后 `SIGTERM`，2 秒后升级 `SIGKILL`。
- 输出超限、spawn error、信号退出和耗时。
- inherited 命令不捕获编辑器内容。

验收命令：

```text
pnpm test -- tests/unit/processRunner.spec.ts
```

### 任务 6：实现 LeetCode Gateway

新增文件：

```text
src/infrastructure/leetcodeGateway.ts
tests/unit/leetcodeGateway.spec.ts
```

按设计逐字断言参数：

```text
leetcode --version
leetcode list
leetcode list -q s
leetcode pick <id>
leetcode edit <id> --lang javascript
leetcode test <id>
leetcode exec <id>
```

测试同时覆盖 CLI 不存在、版本警告、认证错误、站点/网络错误、超时、解析错误和提交未知。
Gateway 构造器默认命令为 `leetcode`，测试显式注入假命令，生产环境不开放自由命令输入。

验收命令：

```text
pnpm test -- tests/unit/leetcodeGateway.spec.ts
```

### 任务 7：实现筛选、身份解析和日志状态

新增文件：

```text
src/application/filters.ts
src/application/logBuffer.ts
src/application/problemIdentity.ts
tests/unit/filters.spec.ts
tests/unit/logBuffer.spec.ts
tests/unit/problemIdentity.spec.ts
```

测试先覆盖：

- 标题/数字 ID 搜索与难度/收藏交集。
- 筛选后选中项保持或迁移到首项。
- 500 行环形日志。
- provisional → resolved、candidate replacement、conflict。
- 刷新使详情缓存和身份状态失效。

验收命令：

```text
pnpm test -- tests/unit/filters.spec.ts tests/unit/logBuffer.spec.ts tests/unit/problemIdentity.spec.ts
```

### 任务 8：实现控制器与提交安全状态机

新增文件：

```text
src/application/submitState.ts
src/application/createAppController.ts
tests/unit/submitState.spec.ts
tests/unit/appController.spec.ts
```

测试先覆盖：

- 同时只允许一个活动操作。
- 初始 list → starred 顺序执行，失败保留旧快照。
- 详情加载完成身份解析。
- 只有成功返回的 edit 将当前 ID 加入 source-ready。
- 重启/新控制器的 source-ready 为空。
- 未 resolved/source-ready 时 `t`、`s` 不调用 Gateway。
- 提交层 `Esc`、`n`、Enter 不提交，`y` 恰好提交一次。
- 提交超时/中断为 unknown，永不自动重试。

验收命令：

```text
pnpm test -- tests/unit/submitState.spec.ts tests/unit/appController.spec.ts
```

### 任务 9：完成最小 Vue 终端启动

新增文件：

```text
src/infrastructure/terminalLifecycle.ts
src/main.ts
src/App.vue
tests/unit/terminalLifecycle.spec.ts
```

终端生命周期及其既有测试已经完成。剩余步骤：

1. 用类型探针确认 `@simon_he/vue-tui/cli` 的公开 App、renderer、stdin 和 snapshot API。
2. 接入 `createTerminalApp`、stdout renderer、stdin driver 和幂等 cleanup。
3. 先使用最小 `App.vue` 验证 mount、重绘、退出和初始化失败清理。
4. 保留 suspend/resume API 作为已验证的通用能力，但内嵌编辑不调用它。

验收命令：

```text
pnpm exec prettier --write src/main.ts src/App.vue
pnpm lint
pnpm typecheck
pnpm build
```

### 任务 10：实现编辑器桥接、setup 与源码文件适配器

新增文件：

```text
bin/le-e-editor
src/editorBridgeMain.ts
src/infrastructure/editorBridgeProtocol.ts
src/infrastructure/sourceBridgeServer.ts
src/infrastructure/editorSetup.ts
src/infrastructure/sourceFile.ts
```

步骤：

1. 定义有版本号、最大消息长度和随机令牌的 JSON-line Socket 协议。
2. 在 `0700` 临时目录创建 Unix Socket；握手 5 秒超时，关闭流程幂等。
3. `le-e-editor` 将最后一个参数视为源码路径；有 Socket 时握手并等待结束通知，无 Socket
   时以 `shell: false` 启动回退编辑器。
4. setup 只定点替换唯一 `[code].editor`，以原子写保留权限，不创建配置备份；安全配置只
   保存原编辑器名称并使用 `0600`。同时提供仅在当前值仍为桥接路径时生效的 restore。
5. `SourceFile` 拒绝符号链接、非当前用户、非 `.js`、非普通文件及大于 1 MiB 的文件；
   读取时记录文件指纹，保存时检测外部变化并以同目录临时文件原子替换。
6. 整个实现不得输出 CLI 配置内容、Cookie、Socket 令牌或源码全文。

验收命令：

```text
pnpm exec prettier --write bin/le-e-editor src/editorBridgeMain.ts src/infrastructure/editorBridgeProtocol.ts src/infrastructure/sourceBridgeServer.ts src/infrastructure/editorSetup.ts src/infrastructure/sourceFile.ts
pnpm lint
pnpm typecheck
pnpm build
```

### 任务 11：实现基础 CodeBuffer 与编辑会话

新增文件：

```text
src/application/codeBuffer.ts
src/application/editorSession.ts
```

步骤：

1. 用按行数组保存内容，记录 row、column、preferred column 和 viewport scroll row。
2. 实现普通/多字符文本插入、换行、退格、Delete、方向键、Home/End、PageUp/PageDown 和
   两空格 Tab；粘贴中的换行按统一路径处理。
3. 光标列使用字符串索引，渲染时另按 terminal cell width 计算，不能在 surrogate pair
   中间落点。
4. 保留读取时的 LF/CRLF 和末尾换行状态；dirty 只在内容变化时更新。
5. 编辑会话状态固定为 `idle → launching → editing → closing → idle`，并记录 dirty 确认
   意图是 back 还是 quit。
6. 不加入高亮、行号、撤销、搜索、自动补全、自动保存或恢复草稿。

验收命令：

```text
pnpm exec prettier --write src/application/codeBuffer.ts src/application/editorSession.ts
pnpm lint
pnpm typecheck
```

### 任务 12：实现普通界面、全屏编辑器与键盘路由

新增文件：

```text
src/application/keyRouter.ts
src/components/HeaderBar.vue
src/components/ProblemList.vue
src/components/ProblemDetail.vue
src/components/LogPanel.vue
src/components/ResizeNotice.vue
src/components/SubmitDialog.vue
src/components/HelpOverlay.vue
src/components/CodeEditor.vue
src/components/UnsavedDialog.vue
src/styles/theme.ts
```

步骤：

1. 实现 `100x28` 普通两栏布局、6 行日志、小尺寸阻断页及 cell-width 文本裁剪。
2. 实现普通页面快捷键、搜索输入、焦点轮换、帮助层和提交确认层；只有 `y` 产生提交意图。
3. 全屏编辑器显示题号、标题、语言、basename、Saved/Modified、代码 viewport、可见光标和
   编辑上下文 footer，不展示完整源码路径。
4. 编辑模式独占普通文本和编辑按键；dirty 返回/退出使用带意图的确认层。
5. 将 controller 的 edit 用例改为桥接流程：身份解析 → 启动 Socket → captured edit →
   路径校验 → 编辑 → 关闭桥接 → source-ready。
6. 保存错误、外部修改、桥接超时和协议错误都保留可恢复界面；编辑期间不允许刷新、测试
   或提交。

验收命令：

```text
pnpm format
pnpm lint
pnpm typecheck
pnpm build
```

### 任务 13：假 CLI 手工 E2E、全量检查与受限本机验收

步骤：

1. 新增手工使用的 `scripts/fake-leetcode.mjs`；支持 version、list、starred、pick、edit、
   test、exec 和调用记录，但不增加测试文件。
2. 在安全临时目录运行假 CLI，手工完成：启动 → 详情 → `e` → 输入多行 → 移动/删除 →
   `Ctrl+S` → `Esc` → 假 test 读取完全一致源码。
3. 手工验证 dirty 取消、桥接超时、非法路径、外部修改拒绝、setup apply/restore；setup 仅
   操作临时 LeetCode 配置，不触碰真实配置。
4. 手工检查 `100x28` 普通界面和编辑界面 snapshot；确认小终端恢复不丢编辑内容。
5. 运行格式化、lint、typecheck、既有 50 个测试、build 和总 `pnpm check`。
6. 检查 staged/unstaged diff、依赖锁文件和敏感信息。
7. 用真实 CLI 只运行 `--version`、list、starred、pick 的只读验收。
8. 不运行真实 setup/edit/test/exec；如需验证，先向用户请求具体操作和题号授权。
9. 更新任务卡，记录通过项、接受的验证缺口和唯一下一动作。

验收命令：

```text
pnpm check
git diff --check
leetcode --version
leetcode list -r 1 3
leetcode list -q s
leetcode pick 1
```

## 5. 停止条件

出现以下任一情况立即停止并请求用户决定：

- `vue-tui` 1.1.5 无法支持设计中的输入、渲染或全屏编辑能力。
- 运行时实现需要读取 Cookie、SQLite、`leetcode.toml` 或直接调用 API；setup 的唯一 editor
  定点替换除外。
- 桥接无法在不修改 CLI 源码、不泄露配置和不猜测源码路径的前提下可靠工作。
- 原子保存或外部修改检测不能避免覆盖非目标文件。
- 需要真实 `leetcode exec` 才能继续。
- 0.5.4 的重复 ID 无法通过 `pick` 标题校验安全收敛。
- 终端、Socket 或桥接子进程清理在既有自动化或手工验证中不能可靠恢复。
- 用户已有文件或 Git 改动与本任务发生冲突。

## 6. 预计提交边界

实现完成并通过审查后，建议一个功能提交：

```text
feat(tui): 实现 LeetCode 终端工作台
```

提交前重新执行 git-commit 审计并展示真实证据，取得用户明确确认；没有确认不提交，
没有远端授权不推送。
