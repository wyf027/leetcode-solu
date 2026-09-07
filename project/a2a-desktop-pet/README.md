# A2A Desktop Pet

## 当前桌宠交互

- 默认仅显示桌宠，点击展开上方状态圆点及下方快捷图标，再次点击收起。
- 快捷图标为 24px 点击区域，透明背景，浅色图标带 1px 深色描边。
- 保留工具首页、LiveTalking、算法题库、Codex 索引及暂不可用的模型切换入口。
- 拖动不会切换控件状态；单击继续刷新后台额度，界面不再显示额度面板。

这是独立 Tauri 项目，请在本目录运行下方命令。当前服务地址与快捷入口的本地路径针对
原开发机器配置；其他机器需要按自己的环境调整 Rust 中的固定地址及路径。凭据仍由
macOS Keychain 管理，源码不包含凭据。

2026-09-07 源码快照：`f588b70`。已通过前端类型、格式、静态检查及 Tauri 构建，
并在 macOS 上验证点击展开/收起、图标显示与打开 Codex 索引。已有测试文件保持原样，
其中旧额度展示与控件默认可见的断言尚未随本轮 UI 更新，不代表当前测试全绿。

macOS 桌面部署状态宠物。它通过 Jenkins JSON API 和实时健康探测，分别展示测试、生产 A2A
前端和后端的部署状态。测试环境状态圆点可以提交固定构建任务；生产环境状态圆点会先由 Rust
命令显示 macOS 原生确认，再提交固定晋级任务。生产后端因没有独立健康探针，会以琥珀色“晋级
成功，服务未验证”明确区分于绿色“已部署”。

## 技术栈

- Tauri 2 / Rust
- React / TypeScript / Vite
- Tailwind CSS 4
- Vitest / Testing Library / ESLint / Prettier

## 本地运行

```bash
nvm use
pnpm install
pnpm tauri dev
```

窗口保持置顶、透明无边框并支持拖动。菜单栏图标提供显示、隐藏和退出操作。点击测试前端或
后端状态圆点会立即提交对应的固定 Jenkins 构建；点击生产状态圆点只能调用接受 `ServiceKind`
的 Rust 命令，该命令先显示 macOS 原生确认。请求或原生确认处理中会禁用全部四个状态触发器；
某服务部署或晋级中时，只禁用该服务对应的状态点。空闲时每 30 秒刷新部署状态，任一环境部署
中每 5 秒刷新。

关闭或取消生产原生确认会返回 `cancelled`：不会读取 Keychain、不会访问 Jenkins、不显示成功
提示，也不会额外刷新部署快照。只有在原生确认选择“确认晋级”后，Rust 才会提交一次允许的生产
晋级请求。

首次运行时点击右上角齿轮，输入拥有固定 Job 读取与构建权限的 Jenkins 用户名和 API Token。
Token 只写入 macOS Keychain，不写入仓库、配置文件或 WebView 状态。

当前 server20 契约：

- Jenkins：`http://172.16.1.20:18140`
- 测试前端 Job：`aihire-test-frontend/buildWithParameters?FORCE_DEPLOY=false`
- 测试后端 Job：`aihire-test-backend/buildWithParameters?FORCE_DEPLOY=false&RUN_AGENT_LLM_E2E=false`
- 前端真实路由：`http://172.16.1.20:19430/b`
- 后端 readiness：`http://172.16.1.20:18131/health/ready`
- 生产前端 Job：`aihire-prod-frontend/build`（无参数，仅限 Rust 原生命令正向确认后调用）
- 生产后端 Job：`aihire-prod-backend/build`（无参数，仅限 Rust 原生命令正向确认后调用）
- 生产前端真实路由：`https://aihire.succaiss.com/login`，并校验响应头
  `X-OpenHire-Edge-Cluster: openhire-prod`
- 生产后端没有独立公开健康探针，只展示 Jenkins 精确晋级结果并以琥珀色明确标注该验证缺口

## 验证

```bash
pnpm format:check
pnpm lint
pnpm test
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo test --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
pnpm build
pnpm tauri build
git diff --check
```

自动化验证只使用本地测试替身，绝不确认真实生产晋级。安装和 macOS 原生对话框的手动验收尚未
执行；执行时只能验证两个生产对话框出现后取消或关闭，不能点击“确认晋级”。

## 安全边界

应用只允许读取四个固定 Jenkins Job 状态、探测三个固定健康地址，并且只允许：

- 对 `aihire-test-frontend` 和 `aihire-test-backend` 使用既有固定 `buildWithParameters`
  请求及上述 `false` 参数；
- 在 Rust 命令获得 macOS 原生对话框正向确认之后，对 `aihire-prod-frontend` 或
  `aihire-prod-backend` 使用固定、无参数的 `/build` 请求。

生产 Tauri 命令的唯一 WebView 输入是 `ServiceKind`；即使直接通过 WebView IPC 调用，它仍会先
打开原生确认，取消时不会接触 Keychain 或网络。保存凭据时只校验原有两个测试 Job 的权限；生产
Job 无读取权限时相应状态降级为未知，不影响测试状态和构建功能。应用不接收任意 Job、URL 或
参数，也不提供 Retry、Stop、Delete、Shell、Kubernetes 凭据、构建号、镜像或摘要选择，且不绕过
TLS 校验。
