# Classic Atlas

六本经典、804 张图册卡，保留完整正文和原始生成插画。

## 图片与部署

804 张原始 PNG 已从本机历史输出恢复，使用 Git LFS 保存，总计 2,292,231,251 字节。原始图片路径和条目顺序保留在 `atlas-data.js` 的 `image` 字段中，未重新生成或转码。正文沿用仓库版本。

Vercel 以本目录为根目录部署。`vercel.json` 在静态文件匹配之前将 `/atlas-images-gpt-image2/*.png` 转发至 GitHub LFS 原图，固定到提交 `1985335c69582cdaea31a9d7cb97a673e0b1a0fa`，避免把 LFS 指针当作图片发布。此方式依赖 GitHub LFS 可用性及流量额度。

本地查看图片时需安装 Git LFS 并获取此目录的原图。`atlas.js` 在图片加载失败时保留纯色占位作为兜底。

图片验证应检查 PNG 文件头，不能仅检查 HTTP 状态与 Content-Type。更新原图后，先确认 LFS 内容上传成功，再更新配置中的固定提交号。
