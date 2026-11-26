const byId = (id) => document.getElementById(id);
const samples = [
  { label: "创建项目", text: "创建「星图招聘」项目，由林舟负责" },
  { label: "添加第一个任务", text: "为「星图招聘」添加任务「梳理候选人流程」，指派给许宁" },
  { label: "再加一个任务", text: "为「星图招聘」添加任务「接入招聘邮箱」，指派给周然" },
  { label: "建立任务依赖", text: "让「接入招聘邮箱」依赖「梳理候选人流程」" },
  { label: "完成任务", text: "把「梳理候选人流程」标为已完成" },
  { label: "查询项目任务", text: "「星图招聘」有哪些任务？" },
];
const types = {
  Project: { label: "项目", ink: "#a69bff", fill: "#322959", glyph: "P" },
  Person: { label: "人员", ink: "#64dbc6", fill: "#17413e", glyph: "人" },
  Task: { label: "任务", ink: "#7eacff", fill: "#20395f", glyph: "T" },
  Document: { label: "文档", ink: "#efbd7b", fill: "#513823", glyph: "D" },
};
const relationNames = {
  has_owner: "负责人", has_task: "包含任务", assigned_to: "指派给",
  depends_on: "依赖", part_of: "属于",
};
const statusNames = { open: "待办", in_progress: "进行中", blocked: "阻塞", done: "已完成", cancelled: "已取消" };
const graphHost = byId("graph-canvas");
const messages = byId("messages");
const input = byId("message");
const composerStatus = byId("composer-status");
const inspector = byId("inspector");
const viewControls = [byId("zoom-in"), byId("zoom-out"), byId("fit-graph")];
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const cameraMotion = () => reducedMotion.matches ? false : { duration: 280 };
const storeKey = "ontology-demo-v1";
let session;
let history;
let graph;
let data = { nodes: [], edges: [] };
let selection = null;
let busy = false;
let ready = false;
let playback = null;

function html(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function icon(name) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const use = document.createElementNS(svg.namespaceURI, "use");
  use.setAttribute("href", "#i-" + name);
  svg.setAttribute("aria-hidden", "true");
  svg.append(use);
  return svg;
}

function makeSession() {
  return crypto.randomUUID().replaceAll("-", "");
}

function remember() {
  try {
    sessionStorage.setItem(storeKey, JSON.stringify({ session, history: history.slice(-40) }));
  } catch {
    // The graph still persists in the service's session directory.
  }
}

function restore() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(storeKey));
    if (/^[a-f0-9]{32}$/.test(saved?.session) && Array.isArray(saved.history)) return saved;
  } catch {
    // A fresh session can start even when tab storage is unavailable.
  }
  return { session: makeSession(), history: [] };
}

function scrollMessages() {
  messages.scrollTop = messages.scrollHeight;
}

function messageRow(entry) {
  const row = html("article", "message-row " + entry.role);
  row.dataset.error = Boolean(entry.error);
  const body = html("div", "message-body");
  if (entry.role === "assistant") {
    const avatar = html("span", "message-avatar");
    avatar.append(icon("mark"));
    row.append(avatar);
    const name = entry.model ? "OpenAI · " + entry.model : "Ontology";
    body.append(html("p", "message-name", name));
  }
  body.append(html("p", "message-copy", entry.text));
  if (entry.trace?.length) {
    const trace = html("details", "trace");
    const summary = html("summary");
    const calls = [entry.trace.length + " 次 CLI 调用"];
    if (entry.modelCalls) calls.unshift(entry.modelCalls + " 次 OpenAI 调用");
    summary.append(icon("terminal"), document.createTextNode(calls.join(" · ")));
    const output = entry.trace.map((operation) => {
      const args = operation.args.map((arg) => /^[\w.-]+$/.test(arg) ? arg : JSON.stringify(arg));
      const result = typeof operation.output === "string" ? operation.output : JSON.stringify(operation.output, null, 2);
      return ["$ python scripts/ontology.py", operation.command, ...args].join(" ") + "\n" + result;
    }).join("\n\n");
    trace.append(summary, html("pre", "", output));
    body.append(trace);
  }
  if (entry.modelNotice) body.append(html("p", "message-notice", entry.modelNotice));
  row.append(body);
  return row;
}

function showMessages() {
  messages.replaceChildren();
  if (history.length) {
    messages.append(...history.map(messageRow));
    scrollMessages();
  } else {
    messages.append(byId("welcome-template").content.cloneNode(true));
    byId("play-demo").addEventListener("click", playDemo);
  }
}

function entityLabel(entity) {
  return entity.properties.name ?? entity.properties.title ?? entity.id;
}

function relationLabel(edge) {
  return relationNames[edge.rel] ?? edge.rel;
}

function edgeId(edge) {
  return [edge.from, edge.rel, edge.to].join(":");
}

function nextSuggestions() {
  const graphLabels = new Set(data.nodes.map(entityLabel));
  const project = "星图招聘";
  if (!graphLabels.has(project)) {
    return [samples[0], { label: "创建人员", text: "记录一位人员「林舟」" }, { label: "查询图谱", text: "查看图谱" }];
  }
  const incomplete = samples.slice(1, 5).find((item) => !history.some((entry, index) =>
    entry.role === "user" && entry.text === item.text && history[index + 1]?.role === "assistant" && !history[index + 1].error
  ));
  return [incomplete, samples[5], { label: "校验图谱", text: "校验图谱" }].filter(Boolean);
}

function updateControls() {
  const blocked = busy || Boolean(playback) || !ready;
  byId("new-chat").disabled = blocked;
  byId("send").disabled = blocked || !input.value.trim();
  const seeDemo = byId("play-demo");
  if (seeDemo) seeDemo.disabled = blocked;
  const suggestions = byId("suggestions");
  suggestions.replaceChildren();
  if (playback) {
    const stop = html("button", "suggestion", "停止演示");
    stop.type = "button";
    stop.prepend(icon("stop"));
    stop.addEventListener("click", () => {
      playback.stopped = true;
      stop.disabled = true;
    });
    suggestions.append(stop);
    return;
  }
  for (const { label, text } of nextSuggestions()) {
    const button = html("button", "suggestion", label);
    button.type = "button";
    button.disabled = blocked;
    button.addEventListener("click", () => {
      input.value = text;
      byId("send").disabled = false;
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    });
    suggestions.append(button);
  }
}

function connection(status, text) {
  byId("connection").dataset.status = status;
  byId("connection-label").textContent = text;
}

async function api(path, options) {
  const response = await fetch(path, options);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "本地服务请求失败。");
  return result;
}

async function streamTurn(payload, onEvent) {
  const response = await fetch("/api/turn", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "text/event-stream" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const problem = await response.json();
    throw new Error(problem.error || "本地服务请求失败。");
  }
  if (!response.body || !response.headers.get("Content-Type")?.startsWith("text/event-stream")) {
    throw new Error("本地服务未返回回复流。");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result;
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      let boundary;
      while ((boundary = buffer.indexOf("\n\n")) !== -1) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        if (!frame.startsWith("data: ")) continue;
        const event = JSON.parse(frame.slice(6));
        if (event.type === "done") {
          result = event.result;
        } else if (event.type === "error") {
          throw new Error(event.message);
        } else {
          onEvent(event);
        }
      }
      if (done) {
        if (result) return result;
        throw new Error("回复流提前结束。");
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

const sleep = (time) => new Promise((resolve) => setTimeout(resolve, time));

async function playDemo() {
  if (!ready || busy || playback) return;
  const current = { stopped: false };
  playback = current;
  updateControls();
  for (const sample of samples) {
    if (current.stopped) break;
    if (!await send(sample.text)) break;
    await sleep(700);
  }
  playback = null;
  updateControls();
}

async function send(message) {
  if (busy || !ready || !message.trim()) return false;
  busy = true;
  input.value = "";
  history.push({ role: "user", text: message });
  const welcome = messages.querySelector(".welcome");
  if (welcome) welcome.remove();
  messages.append(messageRow(history.at(-1)));
  const pending = messageRow({ role: "assistant", text: "正在调用 OpenAI…" });
  pending.classList.add("is-pending");
  pending.setAttribute("aria-hidden", "true");
  const pendingName = pending.querySelector(".message-name");
  const pendingCopy = pending.querySelector(".message-copy");
  messages.append(pending);
  scrollMessages();
  composerStatus.dataset.error = "false";
  composerStatus.textContent = "执行中";
  updateControls();
  let result;
  let graphRender;
  try {
    result = await streamTurn({
      session,
      message,
      history: history.slice(-11, -1).map((entry) => ({ role: entry.role, content: entry.text.slice(0, 1000) })),
    }, (event) => {
      if (event.type === "model") {
        pendingName.textContent = "OpenAI · " + event.model;
      } else if (event.type === "graph") {
        pending.classList.remove("is-streaming");
        pendingCopy.textContent = "正在生成回复…";
        graphRender = drawGraph(event.graph, event.focus).then(() => null, (error) => error);
      } else if (event.type === "delta") {
        const scrollDistance = messages.scrollHeight - messages.scrollTop - messages.clientHeight;
        if (!pending.classList.contains("is-streaming")) {
          pendingCopy.textContent = "";
          pending.classList.add("is-streaming");
        }
        pendingCopy.textContent += event.text;
        if (scrollDistance < 60) scrollMessages();
      }
    });
    const reply = {
      role: "assistant", text: result.reply, error: result.error, trace: result.trace,
      model: result.model, modelCalls: result.model_calls, modelNotice: result.model_notice,
    };
    history.push(reply);
    pending.replaceWith(messageRow(reply));
    remember();
    if (graphRender) {
      const renderError = await graphRender;
      if (renderError) throw renderError;
    } else {
      await drawGraph(result.graph, result.focus);
    }
    const timestamp = new Date().toLocaleTimeString("zh-CN", { hour12: false });
    composerStatus.textContent = result.error ? "图谱未变更" : "最近执行 " + timestamp;
  } catch (error) {
    const reply = { role: "assistant", text: error.message, error: true };
    if (pending.isConnected) {
      history.push(reply);
      pending.replaceWith(messageRow(reply));
      remember();
    }
    composerStatus.dataset.error = "true";
    composerStatus.textContent = "执行或渲染失败 · " + error.message;
    console.error(error);
  } finally {
    busy = false;
    scrollMessages();
    updateControls();
  }
  return Boolean(result && !result.error);
}

function graphData(snapshot, focus, changedNodes, changedEdges) {
  const focusIds = new Set(focus);
  return {
    nodes: snapshot.nodes.map((entity) => {
      const type = types[entity.type];
      const highlighted = changedNodes.has(entity.id) || focusIds.has(entity.id);
      const done = entity.properties.status === "done";
      const position = data.nodes.some((old) => old.id === entity.id)
        ? graph.getElementPosition(entity.id) : null;
      return {
        id: entity.id,
        style: {
          ...(position && { x: position[0], y: position[1] }),
          size: entity.type === "Project" ? 55 : 43,
          fill: type.fill, stroke: type.ink, lineWidth: highlighted ? 2.2 : 1.4,
          halo: highlighted, haloStroke: type.ink, haloLineWidth: 9, haloStrokeOpacity: 0.21,
          labelText: entityLabel(entity), labelPlacement: "bottom", labelOffsetY: 7,
          labelFill: highlighted ? "#f3f0ff" : "#d1daee", labelFontSize: 13, labelFontWeight: 560,
          labelMaxWidth: 120, labelWordWrap: true, labelMaxLines: 1,
          iconText: done ? "✓" : type.glyph, iconFill: type.ink, iconFontSize: done ? 19 : 16, iconFontWeight: 680,
        },
      };
    }),
    edges: snapshot.edges.map((edge) => {
      const id = edgeId(edge);
      const changed = changedEdges.has(id);
      const hasFocus = focusIds.has(edge.from) && focusIds.has(edge.to);
      const dependency = edge.rel === "depends_on";
      const color = changed || hasFocus ? (dependency ? "#f0b880" : "#a498ed") : (dependency ? "#bb9471" : "#687793");
      return {
        id, source: edge.from, target: edge.to,
        style: {
          stroke: color, lineWidth: changed ? 2.1 : 1.45, cursor: "pointer", increasedLineWidthForHitTesting: 7,
          ...(dependency && { lineDash: [5, 4] }),
          endArrow: true, endArrowFill: color, endArrowSize: 7,
          labelText: relationLabel(edge), labelAutoRotate: false, labelFill: changed ? "#f1eaff" : "#a7b3ca",
          labelFontSize: 11, labelBackground: true, labelBackgroundFill: "#151825",
          labelBackgroundRadius: 4, labelPadding: [2, 4], labelOffsetY: -2,
        },
      };
    }),
  };
}

function fitGraph(animation = cameraMotion()) {
  if (!data.nodes.length) return Promise.resolve();
  if (data.nodes.length === 1) return graph.fitCenter(animation);
  return graph.fitView({}, animation);
}

async function drawGraph(snapshot, focus = []) {
  const oldNodes = new Map(data.nodes.map((node) => [node.id, node]));
  const oldEdges = new Set(data.edges.map(edgeId));
  const changedNodes = new Set(snapshot.nodes
    .filter((node) => oldNodes.get(node.id)?.updated !== node.updated).map((node) => node.id));
  const changedEdges = new Set(snapshot.edges.map(edgeId).filter((id) => !oldEdges.has(id)));
  const topologyChanged = snapshot.nodes.length !== oldNodes.size || snapshot.edges.length !== oldEdges.size
    || snapshot.nodes.some(({ id }) => !oldNodes.has(id)) || changedEdges.size > 0;
  graph.setData(graphData(snapshot, focus, changedNodes, changedEdges));
  data = snapshot;

  byId("node-count").textContent = snapshot.nodes.length;
  byId("edge-count").textContent = snapshot.edges.length;
  byId("empty-graph").hidden = Boolean(snapshot.nodes.length);
  for (const control of viewControls) control.disabled = !snapshot.nodes.length;

  const legend = byId("legend");
  const presentTypes = new Set(snapshot.nodes.map((node) => node.type));
  legend.replaceChildren(...Object.entries(types).filter(([key]) => presentTypes.has(key)).map(([, type]) => {
    const item = html("span");
    const swatch = html("i");
    swatch.style.setProperty("--swatch", type.ink);
    item.append(swatch, document.createTextNode(type.label));
    return item;
  }));

  if (topologyChanged && snapshot.nodes.length) {
    await graph.render();
    await fitGraph();
  } else {
    await graph.draw();
  }
  if (selection) showInspector(selection.kind, selection.id);
}

function showInspector(kind, id) {
  const entity = kind === "node" ? data.nodes.find((node) => node.id === id) : null;
  const edge = kind === "edge" ? data.edges.find((row) => edgeId(row) === id) : null;
  if (!entity && !edge) {
    selection = null;
    inspector.hidden = true;
    return;
  }
  selection = { kind, id };
  const header = html("div", "inspector-title");
  const title = html("strong", "", entity ? entityLabel(entity) : relationLabel(edge));
  const close = html("button");
  close.type = "button";
  close.setAttribute("aria-label", "关闭图谱详情");
  close.append(icon("close"));
  close.addEventListener("click", () => showInspector());
  header.append(title, close);

  const kindLine = html("div", "inspector-type");
  if (entity) {
    const type = types[entity.type];
    const dot = html("i", "inspector-dot");
    dot.style.setProperty("--swatch", type.ink);
    kindLine.append(dot, document.createTextNode(type.label));
  } else {
    kindLine.textContent = edge.rel;
  }

  const details = html("dl");
  function field(key, value) {
    details.append(html("dt", "", key), html("dd", "", value));
  }
  if (entity) {
    for (const [key, value] of Object.entries(entity.properties)) {
      if (key === "name" || key === "title") continue;
      field(key === "status" ? "状态" : key, statusNames[value] ?? String(value));
    }
    field("ID", entity.id);
  } else {
    field("起点", entityLabel(data.nodes.find((node) => node.id === edge.from)));
    field("终点", entityLabel(data.nodes.find((node) => node.id === edge.to)));
  }
  inspector.replaceChildren(header, kindLine, details);
  inspector.hidden = false;
}

async function start() {
  ({ session, history } = restore());
  remember();
  showMessages();
  updateControls();
  try {
    graph = new G6.Graph({
      container: graphHost,
      width: graphHost.clientWidth,
      height: graphHost.clientHeight,
      padding: [47, 38, 42, 38],
      zoomRange: [0.22, 1.65],
      node: { type: "circle", style: { cursor: "grab" } },
      edge: { type: "line" },
      layout: {
        type: "d3-force",
        animation: false,
        iterations: 180,
        manyBody: { strength: -460 },
        collide: { radius: 54 },
        link: { distance: 156, strength: 0.37 },
        x: { strength: 0.05 },
        y: { strength: 0.08 },
      },
      behaviors: ["drag-canvas", "zoom-canvas", "drag-element"],
      animation: !reducedMotion.matches,
    });
    graph.on("node:click", (event) => showInspector("node", event.target.id));
    graph.on("edge:click", (event) => showInspector("edge", event.target.id));
    graph.on("canvas:click", () => showInspector());
    await graph.render();
    let resizeFrame;
    new ResizeObserver(() => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => graph.setSize(graphHost.clientWidth, graphHost.clientHeight));
    }).observe(graphHost);
    const result = await api("/api/state?session=" + session);
    await drawGraph(result.graph);
    connection("ready", "Skill 已连接");
    const skill = "ontology v" + result.version + " · " + result.revision.slice(0, 8);
    byId("connection").title = [skill, result.model ? "OpenAI · " + result.model : "OpenAI 配置不可用"].join("\n");
    composerStatus.textContent = "Enter 发送 · Shift + Enter 换行";
    ready = true;
  } catch (error) {
    connection("error", "连接失败");
    composerStatus.dataset.error = "true";
    composerStatus.textContent = error.message;
    console.error(error);
  }
  updateControls();
}

byId("message-form").addEventListener("submit", (event) => {
  event.preventDefault();
  if (!playback) void send(input.value.trim());
});
input.addEventListener("input", () => {
  byId("send").disabled = busy || Boolean(playback) || !ready || !input.value.trim();
});
input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing && event.keyCode !== 229) {
    event.preventDefault();
    if (!byId("send").disabled) byId("message-form").requestSubmit();
  }
});
byId("new-chat").addEventListener("click", async () => {
  if (busy || playback || !ready) return;
  busy = true;
  updateControls();
  session = makeSession();
  history = [];
  remember();
  input.value = "";
  showMessages();
  showInspector();
  try {
    await drawGraph({ nodes: [], edges: [] });
    await graph.zoomTo(1, false);
    composerStatus.dataset.error = "false";
    composerStatus.textContent = "Enter 发送 · Shift + Enter 换行";
  } catch (error) {
    composerStatus.dataset.error = "true";
    composerStatus.textContent = error.message;
    console.error(error);
  } finally {
    busy = false;
    updateControls();
  }
});
byId("zoom-in").addEventListener("click", () => graph.zoomBy(1.22, cameraMotion()));
byId("zoom-out").addEventListener("click", () => graph.zoomBy(1 / 1.22, cameraMotion()));
byId("fit-graph").addEventListener("click", () => {
  if (data.nodes.length === 1) {
    void graph.zoomTo(1, cameraMotion()).then(() => graph.fitCenter(cameraMotion()));
  } else if (data.nodes.length > 1) {
    void graph.fitView({}, cameraMotion());
  }
});
void start();
