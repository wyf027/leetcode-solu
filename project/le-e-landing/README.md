# le-e landing

`le-e-landing` 是 le-e 的静态介绍页，适合直接部署为静态文件。

## 本地生成 CSS

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm build:css
```

将本目录中的 `index.html`、`app.js`、`styles.css` 和 `assets/` 一并部署即可；页面没有运行时 CDN、后端、分析追踪或 Cookie 收集。

项目源码：[project/le-e](https://github.com/wyf027/leetcode-solu/tree/main/project/le-e)。
