# Ontology 图谱工作台

左侧是对话，右侧是 AntV G6 图谱。点击「演示一段对话」可逐轮创建项目和任务、建立依赖、更新状态并查询。每条回复可展开查看实际 CLI 命令及输出。

## 本地启动

需要 `uv`、Python 3.10 或更高版本，以及本机 CC Switch 中「Claude Desktop → OpenAI API」的配置。该配置须可调用 `gpt-6.1-terra`。启动时 `uv` 会安装脚本声明的 PyYAML 依赖。从仓库根目录运行以下命令。

```sh
cd project/ontology-graph-demo
uv run server.py --port 8765
```

浏览器打开 [本地演示](http://127.0.0.1:8765/)。服务只监听本机。首屏从空图开始，图谱按对话存到 `.data/`。刷新当前标签页会恢复该对话，新对话会建立独立图谱。

## 运行方式

对话通过 OpenAI Responses API 运行。服务只读复用本机 CC Switch 中「Claude Desktop → OpenAI API」的配置，使用 `gpt-6.1-terra`。凭证只在后端使用。请求包含最近对话上下文，Responses 请求使用 `store: false`。页面中的示例消息和手动输入使用同一个接口。

查询和写入由模型发起工具调用，服务执行并校验 ontology，校验通过后立即刷新图谱，再把真实结果交给模型。页面用 SSE 实时显示 OpenAI 返回的文本片段。普通对话也以同样方式流式回复。每轮可查看 OpenAI 调用次数及实际 CLI 输出。

服务固定调用 ModelScope 下载包中的原版 ontology.py，基于其 JSON 输出和日志读取函数构建快照。写入整轮通过 skill 校验后提交。前端 G6 包和 skill 均随项目提供。

- [ModelScope ontology v1.0.4](https://www.modelscope.cn/skills/@oswalpalash/ontology) · 源包提交 `58623aaf38be879a9361a13df21f3e883ae8ac2a` · [MIT-0](https://docs.clawhub.ai/oswalpalash/skills/ontology)
- [AntV G6 5.1.1](https://g6.antv.antgroup.com/) · [MIT](./vendor/G6-LICENSE)
