# leetcode-solu 仓库索引

本索引按“题解与算法 → 专题课程 → 工程项目 → 工具配置”组织仓库中已经纳入 Git 的内容。单题文件较多，因此这里定位到稳定目录和主要入口，不重复罗列每一道题。

## 快速导航

| 分类              | 入口                                       | 内容                                                      |
| ----------------- | ------------------------------------------ | --------------------------------------------------------- |
| LeetCode 日常题解 | [`每日一题/`](./每日一题/)                 | 按年份整理的每日题、Offer 题和数据结构练习                |
| 算法专题          | [`算法/`](./算法/)                         | 排序、动态规划、图、树、字符串、数据结构等专题实现        |
| LeetCode 竞赛     | [`leetcode竞赛/`](./leetcode竞赛/)         | 周赛、双周赛和 LCP/LCC 题解                               |
| 华为机试          | [`huawei test/`](<./huawei test/>)         | 按题号与算法类型整理的机试题解                            |
| 其他 OJ           | [`acwing/`](./acwing/)、[`牛客/`](./牛客/) | AcWing 课程/题库、牛客基础题与竞赛题                      |
| 数据结构实现      | [`datastructure-js/`](./datastructure-js/) | JavaScript 栈、队列、链表、Trie、树状数组、线段树等       |
| 专题课程          | [`课程/`](./课程/)                         | 动态规划优化、Trie、归并排序、RSA、莫比乌斯反演等课程笔记 |
| 工程项目          | [`project/`](./project/)                   | React、Vue、GraphQL、Mini React 与静态交互演示            |
| 测试与实验        | [`test/`](./test/)                         | 多语言小实验和独立 DB Console                             |
| Agent 配置        | [`agent-config/`](./agent-config/)         | Codex、Cursor、Agents 与 macOS 多工具协作配置快照         |

## 题解与算法

### 按来源整理

| 目录                               | 说明                     | 常用子目录                                              |
| ---------------------------------- | ------------------------ | ------------------------------------------------------- |
| [`每日一题/`](./每日一题/)         | LeetCode 日常题解主目录  | `2021/`、`2022/`、`2026/`、`offer/`、数据结构练习       |
| [`leetcode竞赛/`](./leetcode竞赛/) | LeetCode 竞赛题解        | `周赛/`、`双周赛/`、`lcc/`                              |
| [`huawei test/`](<./huawei test/>) | 华为机试题库             | 动态规划、并查集、双指针、单调栈、数位 DP、正则表达式等 |
| [`acwing/`](./acwing/)             | AcWing 学习与题解        | 算法基础课、算法竞赛进阶、语法基础课、周赛、题库        |
| [`牛客/`](./牛客/)                 | 牛客题解                 | 基础、模拟、BFS、竞赛                                   |
| [`其他/`](./其他/)                 | 未归入主分类的题解与错题 | `错题/` 及按题号命名的 Markdown                         |

### 按知识点整理

[`算法/`](./算法/) 是知识点索引的核心，主要包括：

- 基础结构：数组、链表、栈、优先队列、哈希表、并查集、树状数组、线段树。
- 搜索与图：深搜广搜、拓扑排序、二叉树。
- 常用技巧：二分、双指针、滑动/单调窗口、前缀和、差分数组、位运算。
- 算法范式：动态规划、贪心、分治、递归、递推、枚举、模拟。
- 字符串与数学：字符串匹配、数学、线性筛。
- 扩展主题：排序、编译器、设计类问题。

独立 JavaScript 实现位于 [`datastructure-js/`](./datastructure-js/)，Promise、柯里化和生成器等语言专题位于 [`js专题/`](./js专题/)。

## 专题课程

[`课程/README.md`](./课程/README.md) 是课程内容入口，当前覆盖：

- 前缀和、树状数组与动态规划优化。
- Trie、双数组 Trie、哈夫曼编码。
- 归并排序与系列刷题课程。
- RSA 算法与莫比乌斯反演。

## 工程项目与演示

| 项目                                                                              | 技术/用途                                    | 入口或启动方式                                                                    |
| --------------------------------------------------------------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------- |
| [`classic-atlas`](./project/classic-atlas/)                                       | 中国经典文本图谱，原生 HTML/CSS/JS           | 在 macOS 执行 `open project/classic-atlas/index.html`                             |
| [`declarative-partial-updates-demo`](./project/declarative-partial-updates-demo/) | 声明式局部更新单页演示                       | `open project/declarative-partial-updates-demo/index.html`                        |
| [`drag-sort`](./project/drag-sort/)                                               | 原生拖拽排序实验                             | 打开目录内的 `192.html`、`flip.html` 或 `sortable.html`                           |
| [`design-pattern`](./project/design-pattern/)                                     | JavaScript 设计模式与设计原则示例            | 按模式目录阅读；依赖声明见 `package.json`                                         |
| [`graphql`](./project/graphql/)                                                   | React/Apollo 客户端 + Express/GraphQL 服务端 | 分别进入 `client/`、`server/` 安装依赖并执行 `npm start`                          |
| [`mini-react`](./project/mini-react/)                                             | React Reconciler、调度与 DOM 渲染的精简实现  | `cd project/mini-react && npm install && npm run demos`                           |
| [`open-file-viewer-demo`](./project/open-file-viewer-demo/)                       | 浏览器文件打开与预览演示                     | `open project/open-file-viewer-demo/index.html`                                   |
| [`rag-flow-demo`](./project/rag-flow-demo/)                                       | RAG 流程可视化单页演示                       | `open project/rag-flow-demo/index.html`                                           |
| [`react-book`](./project/react-book/)                                             | React 更新机制学习代码                       | [`update.js`](./project/react-book/update.js)                                     |
| [`react-demo`](./project/react-demo/)                                             | Create React App 示例                        | `cd project/react-demo && npm install && npm start`                               |
| [`upload`](./project/upload/)                                                     | Vue 3、Vite、Express、Multer 文件上传示例    | `cd project/upload && npm install && npm run dev`                                 |
| [`db-console-standalone`](./test/db-console-standalone/)                          | Flask + 原生前端的 PostgreSQL Web Console    | `cd test/db-console-standalone && uv sync && uv run python -m db_console_app.app` |

各子项目拥有独立依赖与命令，应在对应目录安装依赖；仓库根目录不是统一的 monorepo 启动入口。

## 其他代码与工具

| 路径                                                 | 用途                                                    |
| ---------------------------------------------------- | ------------------------------------------------------- |
| [`refactoring/`](./refactoring/)                     | 《重构》账单示例及数据拆分练习                          |
| [`packages/index.js`](./packages/index.js)           | 根目录 ESLint 当前覆盖的 JavaScript 入口                |
| [`demo.go`](./demo.go)                               | Go 语言独立示例                                         |
| [`sh/`](./sh/)                                       | Shell 小工具与练习                                      |
| [`test/README.md`](./test/README.md)                 | 早期仓库说明与题目列表                                  |
| [`agent-config/README.md`](./agent-config/README.md) | Agent 配置快照的包含范围、安全边界与 macOS 共享配置说明 |

## 根目录工程命令

根目录 `package.json` 主要提供提交规范与轻量检查：

```bash
npm install
npm run lint
```

`npm run lint` 只检查 `packages/` 下的 JavaScript/TypeScript 文件，不代表所有题解和子项目都已完成统一测试。

提交信息采用 Conventional Commits；规则入口为 [`.commitlintrc.js`](./.commitlintrc.js)。

## 维护约定

- 新增单题时，优先放入对应平台、年份或知识点目录。
- 新增可独立运行的工程演示时，放入 `project/<name>/`，并提供自己的 `README.md` 或明确入口。
- 新增跨工具 Agent 配置时，先更新 `agent-config/ai-shared/` 的规范源，再同步工具快照。
- 目录边界、入口或启动命令发生变化时，同步更新本文件；临时文件和未提交内容不进入索引。
