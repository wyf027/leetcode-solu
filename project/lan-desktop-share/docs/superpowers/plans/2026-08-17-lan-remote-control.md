# 局域网桌面远程控制实施计划

**目标：** 在现有 1–5 人局域网 WebRTC 视频观看工具上，增加分享端逐次批准、单控制者、10 分钟租约的 macOS 远程控制。

**基础规格：** `docs/superpowers/specs/2026-08-17-lan-remote-control-design.md`

**现有基线：** `feat/lan-desktop-share` 的 `cf511d2`。`README.md` 和 `package.json` 已有原任务收尾改动，实施时必须保留并在对应任务中增量修改。

**测试约束：** 用户明确要求不为远程控制编写新的自动化测试。不得新增控制功能测试文件或用例，也不得删除现有 27 项观看测试。实现完成后运行既有门禁、Swift 编译和手工验证。

## 全局约束

- 保持现有分支、工作树和单一写入者，不创建第二个实现分支。
- HTML 与界面样式继续使用本地 Tailwind CSS，不引入 CDN。
- 远程控制只接受回环地址上的分享端 WebSocket；局域网观看者不能直接调用 Node 控制桥。
- Swift 助手不监听网络，不保存输入，不接收房间密钥。
- 控制不可用时不得影响视频观看。
- 不实现多显示器、窗口/标签页控制、移动端触控、剪贴板、文件传输、系统快捷键和无人值守控制。
- 不记录房间密钥、完整观看链接、租约标识、键盘内容或控制事件。
- 每完成一个任务都更新 `.ai/tasks/lan-desktop-share.md`，记录验证结果和唯一下一动作。
- 实施期间不执行 `git commit`，直到全部改动完成审查且用户再次明确确认提交范围。

---

## Task 1：建立 macOS Swift 助手

**新增文件：**

- `native/macos-control-helper/Package.swift`
- `native/macos-control-helper/Sources/LanControlHelper/ControlCommand.swift`
- `native/macos-control-helper/Sources/LanControlHelper/DisplayEnvironment.swift`
- `native/macos-control-helper/Sources/LanControlHelper/InputInjector.swift`
- `native/macos-control-helper/Sources/LanControlHelper/CommandStream.swift`
- `native/macos-control-helper/Sources/LanControlHelper/main.swift`

**修改文件：**

- `.gitignore`
- `package.json`
- `package-lock.json`

### 1.1 Swift Package 与构建命令

- [ ] 创建 macOS 13+ Swift executable package，产物名固定为 `lan-control-helper`。
- [ ] 在 `package.json` 保留现有 `engines.node >=20` 改动，并新增：

```json
{
  "control:build": "cd native/macos-control-helper && swift build -c release",
  "control:probe": "native/macos-control-helper/.build/release/lan-control-helper --probe"
}
```

- [ ] 在 `.gitignore` 忽略 `native/macos-control-helper/.build/`，不忽略 Swift 源码。

### 1.2 只读环境探测

- [ ] `DisplayEnvironment` 使用 `AXIsProcessTrusted()` 检查辅助功能权限，不在普通探测时自动打开系统设置。
- [ ] 使用 `CGGetActiveDisplayList` 获取活动显示器，只有数量恰好为 1 时 `singleDisplay` 为真。
- [ ] 使用 `CGMainDisplayID()` 与 `CGDisplayBounds` 返回控制会话所需的显示器边界；探测输出只暴露布尔状态和通用原因，不暴露设备名或稳定硬件标识。
- [ ] `--probe` 模式输出一行 JSON 后立即退出，不能进入输入读取循环，也不能调用事件投递方法。

期望探测格式：

```json
{"v":1,"status":"available","accessibility":true,"singleDisplay":true}
```

不可用时使用稳定原因：`unsupported-platform`、`accessibility-denied`、`multiple-displays`、`display-unavailable`。

### 1.3 有界命令流

- [ ] `CommandStream` 使用 `FileHandle.standardInput` 分块读取并自行按换行切帧，缓冲上限 4096 字节；不要直接用无界 `readLine()`。
- [ ] 每行解码为 `ControlCommand`；未知字段、未知命令、非有限数、越界坐标、超长文本或超长行立即拒绝。
- [ ] 会话模式启动后先输出 `{"v":1,"status":"ready"}`，Node 收到 ready 前不能签发租约。

### 1.4 输入注入与释放

- [ ] `InputInjector` 只实现 `mouseMove`、左右 `mouseButton`、`scroll`、导航/编辑白名单 `key`、最多 32 个 Unicode 标量的 `text` 和 `releaseAll`。
- [ ] 鼠标使用归一化坐标乘以唯一活动显示器的 Core Graphics 边界，并通过 `CGEvent.post(tap: .cghidEventTap)` 投递。
- [ ] 拖动事件根据当前按钮状态选择 moved/dragged 事件类型。
- [ ] 导航键使用固定 macOS virtual key code 映射；不接受 Meta、Control、Option、功能键、媒体键或任意外部 key code。
- [ ] 文本事件使用 `keyboardSetUnicodeString` 投递已提交文本，不实现剪贴板粘贴。
- [ ] 跟踪左右按钮和白名单按键的按下状态；`releaseAll`、标准输入结束和正常退出都执行幂等释放。

### 1.5 Task 1 验证

运行：

```bash
npm run control:build
npm run control:probe
```

验收：Release 编译成功；探测只报告当前状态且不移动鼠标、不产生按键。若当前 Mac 未授予权限，`accessibility-denied` 是有效的探测结果，不得伪称控制已验证。

---

## Task 2：实现 Node 控制协议与本地桥接

**新增文件：**

- `src/control-protocol.js`
- `src/control-bridge.js`

**修改文件：**

- `src/protocol.js`
- `src/server.js`
- `.ai/tasks/lan-desktop-share.md`

### 2.1 控制协议解析

- [ ] `src/control-protocol.js` 定义协议版本、1024 字节消息上限、10 分钟租约、事件白名单和字段校验。
- [ ] 暴露 `isControlMessageType(type)`、`parseControlMessage(message, byteLength)` 和 `validateHelperEvent(event)`。
- [ ] 支持来自分享端的 `control-probe`、`control-start`、`control-event`、`control-stop`。
- [ ] `control-start` 必须包含 `roomId` 和 `viewerId`；`control-event` 还必须包含租约、单调序号和单个事件。
- [ ] `src/protocol.js` 继续处理现有信令；遇到控制类型时委托控制协议解析，不放宽 offer/answer/ICE 的现有校验。

### 2.2 回环连接识别

- [ ] 将 WebSocket `connection` 回调改为接收 upgrade request，读取 `request.socket.remoteAddress`。
- [ ] 新增小型 `isLoopbackAddress` 纯函数，接受 `127.0.0.1`、`::1` 和 IPv4-mapped loopback，拒绝 LAN 地址。
- [ ] `sockets` 继续只负责发送；独立保存 `clientId -> { remoteAddress, isLoopback }` 元数据，关闭连接时同步清理。

### 2.3 `ControlBridge` 生命周期

- [ ] `ControlBridge` 构造函数接收 helper 路径、spawn 函数、时钟和回调，内部维护 `roomId -> lease`，不依赖 HTTP/WS 细节。
- [ ] `probe()` 以 `--probe` 启动助手，限制启动/响应超时，读取一行有界 JSON，随后确认子进程退出。
- [ ] `start()` 验证当前房间无租约，启动助手会话并等待 `ready`，然后由 Node 生成随机租约标识和 10 分钟到期计时器。
- [ ] `forward()` 验证 room、host、viewer、lease、严格递增 seq，并分别对移动 60/s、其他输入 30/s 做每租约限流。
- [ ] `stop()` 幂等发送 `releaseAll`、关闭 stdin、等待短暂退出，只对未退出的具体助手子进程执行强制结束。
- [ ] `stopForClient()` 和 `closeAll()` 支持观看者离开、分享端离开、房间结束、服务关闭和进程退出路径。
- [ ] 助手 stdout/stderr 不原样写入应用日志；仅把稳定错误原因返回页面。

### 2.4 集成 `createLanShareServer`

- [ ] 为 `createLanShareServer` 增加可选 `controlBridge` 依赖，默认创建真实桥接层，保持现有调用方式可用。
- [ ] 处理控制消息前验证：发送者 membership 是目标 room 的 host、连接是 loopback、viewer membership 是同房间 viewer。
- [ ] 返回 `control-capabilities`、`control-started`、`control-stopped` 或通用 `control-error`；不返回 helper 路径、系统用户名或原始错误。
- [ ] 观看者离开时撤销其租约；host 结束房间、WebSocket 关闭或 `close()` 时关闭对应/全部租约。
- [ ] CLI 入口监听 `SIGINT`/`SIGTERM`，先 `await app.close()` 再设置退出码，避免直接遗留助手。

### 2.5 Task 2 验证

不新增测试。运行现有门禁：

```bash
npm run lint
npm run format:check
npm test
```

验收：现有 27 项测试通过；Node 启动/关闭不遗留助手进程；从 LAN 地址建立的 WebSocket 不能调用 `control-probe` 或 `control-start`。

---

## Task 3：在 WebRTC 会话中建立控制 DataChannel

**新增文件：**

- `public/js/control-messages.js`

**修改文件：**

- `public/js/host-session.js`
- `public/js/viewer-session.js`
- `.ai/tasks/lan-desktop-share.md`

### 3.1 浏览器控制消息边界

- [ ] `control-messages.js` 定义 `lan-control-v1`、1024 字节限制、消息构造器和严格解析器。
- [ ] 解析器只接受 `control-request`、`control-cancel`、`control-pending`、`control-granted`、`control-denied`、`control-revoked`、`control-input`。
- [ ] 输入事件字段与服务端白名单一致；坐标必须有限且位于 `0–1`，文本最多 32 个 Unicode 标量。
- [ ] 不把租约、viewer ID 或房间 ID写入 DOM dataset、URL 或日志。

### 3.2 扩展 `HostSession`

- [ ] 构造函数新增 `onControlChannel` 和 `onViewerLeft` 回调，默认空函数，保持现有调用兼容。
- [ ] `createPeer(viewerId)` 在 `createOffer()` 前调用 `peer.createDataChannel("lan-control-v1", { ordered: true })`。
- [ ] `peers` 条目保存 `controlChannel`；open 时通过 `onControlChannel({ viewerId, channel })` 注册。
- [ ] `removePeer`、重试和 `stop` 先关闭 DataChannel，再关闭 PeerConnection，并通知控制协调器撤销相关状态。

### 3.3 扩展 `ViewerSession`

- [ ] 构造函数新增 `onControlChannel` 回调。
- [ ] 创建 PeerConnection 后设置 `peer.ondatachannel`，只接受标签匹配且协议预期的单个通道，其他通道立即关闭。
- [ ] `close`、重连和分享结束时关闭控制通道并清空回调状态。

### 3.4 Task 3 验证

运行现有 `npm test`。随后启动服务，用本机两个浏览器确认视频连接仍成功，并在 DevTools 中确认每位观看者恰好建立一个 `lan-control-v1` DataChannel；此检查不注入系统输入。

---

## Task 4：实现分享端控制协调器

**新增文件：**

- `public/js/host-control.js`

**修改文件：**

- `public/js/app.js`
- `.ai/tasks/lan-desktop-share.md`

### 4.1 `HostControlController`

- [ ] 独立实现 `unavailable`、`idle`、`requested`、`granting`、`active`、`revoking`、`error` 状态机。
- [ ] 构造函数接收 SignalingClient、DOM 无关回调和时钟；不直接查找页面元素。
- [ ] `registerViewer(viewerId, channel)` 绑定有界消息处理；每个 channel 只允许一个待处理申请。
- [ ] 已有待处理申请或 active lease 时，后续申请立即回复 `control-denied`。
- [ ] `probe({ roomId, displaySurface })` 仅当 `location.hostname === "localhost"` 且 `displaySurface === "monitor"` 时请求 Node 探测。
- [ ] `approve(viewerId)` 发送 `control-start`，收到 `control-started` 后才向观看者发 `control-granted` 并开始倒计时。
- [ ] `deny`、`revoke`、viewer 离开、channel 关闭、页面隐藏和共享停止走同一个幂等清理入口。
- [ ] active 时仅转发当前 viewer、当前 lease、严格递增 seq 的 `control-input`，其他消息丢弃并计数。

### 4.2 与现有 `runHost` 连接

- [ ] `runHost` 创建 signal 后创建 `HostControlController`，再把控制通道回调注入 `HostSession`。
- [ ] 屏幕流建立后读取唯一视频轨道的 `getSettings().displaySurface`；未明确为 `monitor` 时只更新控制不可用状态，不停止视频。
- [ ] `HostSession.stop`、停止按钮、`pagehide` 和信令关闭都先撤销控制，再清理视频。
- [ ] 保持复制观看链接使用浏览器剪贴板的现有功能；“不支持剪贴板”只指远程控制期间不进行两台电脑之间的剪贴板同步。

### 4.3 Task 4 验证

本机手工验证申请状态，但在 Swift 权限未准备好时不得批准输入注入。确认：申请只出现一次、第二申请被拒绝、停止共享会清理状态、非整屏时观看正常而控制不可用。

---

## Task 5：实现观看端输入采集

**新增文件：**

- `public/js/viewer-control.js`

**修改文件：**

- `public/js/app.js`
- `.ai/tasks/lan-desktop-share.md`

### 5.1 `ViewerControlController`

- [ ] 管理 `unavailable`、`idle`、`pending`、`active`、`revoked` 状态，不直接操作全局 DOM。
- [ ] 仅在 DataChannel open 且视频已播放时允许申请。
- [ ] 收到 `control-granted` 后保存内存租约与过期时间、seq 从 1 开始；不持久化到 localStorage/sessionStorage。
- [ ] `end()`、channel 关闭、页面隐藏和 viewer session 关闭时停止监听、发送可行的取消/结束消息并清空租约。

### 5.2 指针映射

- [ ] 基于 `video.getBoundingClientRect()`、`video.videoWidth` 和 `video.videoHeight` 计算 `object-contain` 的实际内容矩形。
- [ ] 内容矩形之外的 pointer 事件直接忽略；矩形内转换为 `0–1` 坐标。
- [ ] pointer down 时使用 `setPointerCapture` 保证拖动结束能发送 button up；只允许左右键。
- [ ] `contextmenu` 仅在 active 且位于视频内容区域时阻止默认菜单。
- [ ] pointer move 通过 `requestAnimationFrame` 合并为每帧最新位置，并检查 DataChannel `bufferedAmount`；积压时丢弃旧移动事件。
- [ ] wheel 监听器仅在 active 时使用 `{ passive: false }`，对增量限幅后发送。

### 5.3 键盘与文本

- [ ] 在观看端增加一个有明确 `aria-label` 的视觉隐藏 textarea；视频获得控制焦点时把输入焦点转入 textarea。
- [ ] `keydown`/`keyup` 只发送导航和编辑白名单键；出现 Meta、Control 或 Alt 时不发送并不阻止本机系统处理。
- [ ] 使用 composition/input 流程发送输入法最终提交的 Unicode 文本，发送后清空 textarea；不读取 Clipboard API。
- [ ] 页面隐藏、失焦、租约结束时发送可行的释放消息并移除监听器。

### 5.4 Task 5 验证

使用本机两个浏览器观察 DataChannel 消息，确认黑边不产生事件、坐标范围正确、移动被合并、系统快捷键不进入消息、输入法只发送最终提交文本。此阶段可先让分享端丢弃事件，不必注入系统输入。

---

## Task 6：完成 Tailwind 控制界面

**修改文件：**

- `public/index.html`
- `public/styles/input.css`
- `public/js/app.js`
- `.ai/tasks/lan-desktop-share.md`

### 6.1 分享端界面

- [ ] 在现有 host aside 中增加控制状态卡：环境检查、不可用原因、待审批申请、允许 10 分钟和拒绝按钮。
- [ ] 增加固定红色 active banner，显示“观看者 #N 正在控制”、倒计时和“立即停止控制”。
- [ ] 所有状态使用文字和 `aria-live`，不能只依赖红/黄/绿颜色。
- [ ] 权限缺失时给出“授予辅助功能权限并重启服务”的具体说明；助手缺失时显示 `npm run control:build`。

### 6.2 观看端界面

- [ ] 在 viewer panel 底部增加申请、取消申请、结束控制按钮和状态文案。
- [ ] active 时给视频内容容器明显的控制焦点边框和“正在控制”标记。
- [ ] 保留重连与点击播放按钮；控制按钮不能覆盖错误恢复操作。
- [ ] 手机尺寸保持只看画面，隐藏或禁用控制按钮并说明需要桌面浏览器。

### 6.3 Tailwind 与响应式检查

- [ ] 继续使用 Tailwind utility；只有无法用 utility 表达的基础样式写入 `public/styles/input.css`。
- [ ] 运行 `npm run styles:build`。
- [ ] 本机检查桌面布局与 390×844 只看布局，无水平溢出、按钮触控高度至少 44px。

---

## Task 7：端到端接通与安全清理

**修改文件：**

- `src/control-bridge.js`
- `src/server.js`
- `public/js/host-control.js`
- `public/js/viewer-control.js`
- `public/js/app.js`
- `.ai/tasks/lan-desktop-share.md`

### 7.1 完整授权路径

- [ ] 主机开始整屏共享后执行 probe；满足条件才允许批准。
- [ ] 观看者申请 → 主机批准 → Node 启动 helper 并等待 ready → Node 返回 lease → 主机 grant → 观看者发送事件。
- [ ] Node 与 helper 的所有失败在 grant 前回滚；观看者收到通用拒绝，不进入 active。

### 7.2 完整撤销路径

- [ ] 逐一手工触发：主机立即停止、观看者结束、10 分钟到期、viewer 断线、host 断线、停止共享、浏览器关闭、helper 退出、终端 `Ctrl+C`。
- [ ] 每条路径确认 DataChannel 停发、Node lease 删除、helper 收到 `releaseAll` 并退出。
- [ ] 清理后观看视频按预期继续或结束，不出现孤立 helper 进程。

### 7.3 越权与异常输入

- [ ] 用局域网 URL 打开一个伪 host 页面或直接发控制 WebSocket 消息，确认 Node 因非 loopback 拒绝。
- [ ] 手工提交过期 lease、错误 viewer、重复 seq、越界坐标、未知键、超长文本和超限频率，确认不会注入且持续违规撤销控制。
- [ ] 检查终端输出，确认没有输入内容、房间密钥、租约标识和完整观看链接。

---

## Task 8：文档、门禁与交付物

**修改文件：**

- `README.md`
- `package.json`
- `.ai/tasks/lan-desktop-share.md`

**生成交付物：**

- `outputs/lan-desktop-share.zip`

### 8.1 README

- [ ] 保留现有安装、启动、观看和故障排查内容，增量加入 Swift 工具链、`npm run control:build`、辅助功能授权、单显示器/整屏限制和权限撤销说明。
- [ ] 明确“拥有观看链接不等于身份认证”“每次控制需本机批准”“不用时停止服务”“禁止映射到公网”。
- [ ] 区分控制不可用与视频不可用，提供具体修复顺序。

### 8.2 最终门禁

按顺序运行：

```bash
npm run control:build
npm run styles:build
npm run lint
npm run format:check
npm test
```

期望：Swift Release 构建、Tailwind、ESLint、Prettier 和现有 27 项测试全部退出 0。不得新增远程控制自动化测试。

### 8.3 手工验收矩阵

- [ ] 单显示器整屏共享下验证中心、四角、缩放窗口点击映射。
- [ ] 验证左右键、拖动、滚轮、普通文本、输入法提交文本、导航和编辑键。
- [ ] 验证第二控制申请、撤销、超时、断线、停止共享、helper 异常和服务退出。
- [ ] 验证 helper 缺失、权限缺失、多显示器、窗口/标签页共享只禁用控制。
- [ ] 验证手机仍可只看画面。
- [ ] 在真实局域网第二台桌面设备复验；若没有设备，在任务卡和交付说明中明确记录未验证。

### 8.4 交付包

- [ ] 打包源码、lockfile、README 和 Swift 源码，不包含 `node_modules`、Swift `.build`、生成 CSS、测试临时文件、日志、媒体文件或任何密钥。
- [ ] 解压到临时目录后执行文件清单检查，确认启动说明与构建命令存在。
- [ ] 更新任务卡为 `implementation-complete-awaiting-commit-review`，记录实际通过与未通过/未执行的验证，不夸大跨设备证据。

---

## 完成定义

- 现有视频观看功能与 27 项测试保持通过。
- Swift 助手 Release 构建通过，且无网络监听入口。
- 单显示器整屏条件下，一位获批观看者可完成白名单鼠标和键盘操作。
- 未授权、非回环、第二控制者、过期租约和异常输入不能注入本机。
- 所有主动与异常结束路径都撤销租约并释放输入。
- 控制不可用时仍可只看画面。
- README、任务卡、手工验证记录和交付包完整。
- 实施改动经过审查后，等待用户显式确认再提交。
