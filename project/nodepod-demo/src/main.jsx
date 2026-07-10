import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import * as monaco from "monaco-editor";
import cssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker";
import htmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker";
import jsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import tsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import { GridLayout, useContainerWidth } from "react-grid-layout";
import { gridBounds, minMaxSize, snapToGrid } from "react-grid-layout/core";
import { Nodepod } from "@scelar/nodepod";
import "@vscode/codicons/dist/codicon.css";
import "./styles.css";

const LAYOUT_STORAGE_KEY = "nodepod-rgl-layout-v1";
const COLLAPSED_DIRECTORIES = new Set([".nodepod"]);
const PREVIEW_PATH = "/preview";

self.MonacoEnvironment = {
  getWorker(_workerId, label) {
    if (label === "json") return new jsonWorker();
    if (label === "css" || label === "scss" || label === "less") {
      return new cssWorker();
    }
    if (label === "html" || label === "handlebars" || label === "razor") {
      return new htmlWorker();
    }
    if (label === "typescript" || label === "javascript") {
      return new tsWorker();
    }

    return new editorWorker();
  },
};

monaco.editor.defineTheme("nodepod-dark", {
  base: "vs-dark",
  inherit: true,
  rules: [
    { token: "comment", foreground: "6a7283" },
    { token: "keyword", foreground: "ff7b72" },
    { token: "string", foreground: "a5d6ff" },
    { token: "number", foreground: "79c0ff" },
  ],
  colors: {
    "editor.background": "#0f1117",
    "editor.foreground": "#d4d4d8",
    "editor.lineHighlightBackground": "#171b25",
    "editorLineNumber.foreground": "#4b5563",
    "editorLineNumber.activeForeground": "#9ca3af",
    "editorCursor.foreground": "#58a6ff",
    "editor.selectionBackground": "#1389fd55",
    "editorSuggestWidget.background": "#151922",
    "editorSuggestWidget.border": "#303645",
    "editorSuggestWidget.foreground": "#d4d4d8",
    "editorSuggestWidget.selectedBackground": "#12395f",
  },
});

const ITEM_CONSTRAINTS = {
  explorer: { minW: 2, maxW: 4, minH: 9, maxH: 28 },
  editor: { minW: 4, maxW: 8, minH: 10, maxH: 30 },
  preview: { minW: 4, maxW: 8, minH: 10, maxH: 30 },
  terminal: { minW: 3, maxW: 8, minH: 5, maxH: 14 },
  response: { minW: 3, maxW: 8, minH: 5, maxH: 14 },
};

const DEFAULT_LAYOUT = [
  { i: "explorer", x: 0, y: 0, w: 2, h: 26 },
  { i: "editor", x: 2, y: 0, w: 5, h: 19 },
  { i: "preview", x: 7, y: 0, w: 5, h: 19 },
  { i: "terminal", x: 2, y: 19, w: 5, h: 7 },
  { i: "response", x: 7, y: 19, w: 5, h: 7 },
].map((item) => ({ ...item, ...ITEM_CONSTRAINTS[item.i] }));

const evenColumnsOnly = {
  name: "evenColumnsOnly",
  constrainPosition(_item, x, y) {
    return { x: Math.round(x / 2) * 2, y };
  },
};

const minHeightHalfWidth = {
  name: "minHeightHalfWidth",
  constrainSize(_item, w, h) {
    return { w, h: Math.max(h, Math.ceil(w / 2)) };
  },
};

const maxArea = (area) => ({
  name: `maxArea(${area})`,
  constrainSize(_item, w, h, handle) {
    if (w * h <= area) return { w, h };

    if (handle.includes("e") || handle.includes("w")) {
      return { w: Math.max(1, Math.floor(area / h)), h };
    }

    return { w, h: Math.max(1, Math.floor(area / w)) };
  },
});

const CONSTRAINT_OPTIONS = {
  none: {
    label: "默认约束",
    constraint: null,
  },
  evenColumns: {
    label: "偶数列",
    constraint: evenColumnsOnly,
  },
  minHeightHalfWidth: {
    label: "高 >= 宽/2",
    constraint: minHeightHalfWidth,
  },
  maxArea120: {
    label: "面积 <= 120",
    constraint: maxArea(120),
  },
  snapToGrid3: {
    label: "3x3 吸附",
    constraint: snapToGrid(3),
  },
};

function loadLayout() {
  try {
    const saved = JSON.parse(
      localStorage.getItem(LAYOUT_STORAGE_KEY) || "null",
    );
    if (!Array.isArray(saved)) return DEFAULT_LAYOUT;

    const byId = new Map(saved.map((item) => [item.i, item]));
    return DEFAULT_LAYOUT.map((fallback) => ({
      ...fallback,
      ...(byId.get(fallback.i) ?? {}),
      ...ITEM_CONSTRAINTS[fallback.i],
    }));
  } catch {
    return DEFAULT_LAYOUT;
  }
}

function toPreviewUrl(url) {
  if (!url) return "";
  return `${url.replace(/\/$/, "")}${PREVIEW_PATH}`;
}

function joinPodPath(parent, name) {
  return parent === "/" ? `/${name}` : `${parent}/${name}`;
}

function getParentPath(path) {
  if (!path || path === "/") return "/";

  const normalized = path.endsWith("/") ? path.slice(0, -1) : path;
  const index = normalized.lastIndexOf("/");

  return index <= 0 ? "/" : normalized.slice(0, index);
}

function getBaseName(path) {
  if (!path || path === "/") return "/";

  const normalized = path.endsWith("/") ? path.slice(0, -1) : path;
  return normalized.slice(normalized.lastIndexOf("/") + 1);
}

function replacePathPrefix(path, fromPath, toPath) {
  if (!path) return path;
  if (path === fromPath) return toPath;
  if (!path.startsWith(`${fromPath}/`)) return path;

  return `${toPath}${path.slice(fromPath.length)}`;
}

function normalizeEntryName(input) {
  const name = input.trim();

  if (!name) throw new Error("名称不能为空");
  if (name === "." || name === "..") {
    throw new Error("名称不能是 . 或 ..");
  }
  if (/[\\/]/.test(name)) {
    throw new Error("名称不能包含路径分隔符");
  }

  return name;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function countFiles(nodes) {
  return nodes.reduce(
    (total, node) =>
      total + (node.type === "file" ? 1 : countFiles(node.children)),
    0,
  );
}

function isTextFile(path) {
  return /\.(js|json|md|txt|html|css|ts|tsx|jsx|mjs|cjs)$/i.test(path);
}

function getEditorLanguage(path = "") {
  const extension = path.split(".").pop()?.toLowerCase();
  const languageByExtension = {
    cjs: "javascript",
    css: "css",
    html: "html",
    js: "javascript",
    json: "json",
    jsx: "javascript",
    md: "markdown",
    mjs: "javascript",
    ts: "typescript",
    tsx: "typescript",
  };

  return languageByExtension[extension] ?? "plaintext";
}

function getFileIcon(node) {
  if (node.type === "directory") return "codicon-folder";

  const extension = node.name.split(".").pop()?.toLowerCase();
  const iconByExtension = {
    css: "codicon-symbol-color",
    html: "codicon-code",
    js: "codicon-file-code",
    json: "codicon-json",
    jsx: "codicon-file-code",
    md: "codicon-markdown",
    mjs: "codicon-file-code",
    ts: "codicon-file-code",
    tsx: "codicon-file-code",
  };

  return iconByExtension[extension] ?? "codicon-symbol-file";
}

function createTerminalSession(index, overrides = {}) {
  return {
    id: `terminal-${Date.now()}-${index}`,
    name: `Terminal ${index}`,
    logs: "",
    ready: false,
    state: "booting",
    cwd: "/",
    input: "",
    history: [],
    historyIndex: 0,
    ...overrides,
  };
}

function resolvePreviewAddress(input, fallbackUrl) {
  const value = input.trim();
  if (!value) return fallbackUrl;

  try {
    if (/^https?:\/\//i.test(value)) {
      return new URL(value).toString();
    }

    const fallback = new URL(fallbackUrl || window.location.href);
    const virtualBaseMatch = fallback.pathname.match(
      /^(.*\/__virtual__\/[^/]+\/\d+)(?:\/.*)?$/,
    );
    const basePath = virtualBaseMatch ? `${virtualBaseMatch[1]}/` : "/";
    const baseUrl = new URL(basePath, fallback.origin);
    const relativePath = value.startsWith("/") ? value.slice(1) : value;

    return new URL(relativePath, baseUrl).toString();
  } catch {
    return fallbackUrl;
  }
}

function firstFilePath(nodes) {
  for (const node of nodes) {
    if (node.type === "file") return node.path;
    const nested = firstFilePath(node.children);
    if (nested) return nested;
  }

  return null;
}

function findFileNode(nodes, path) {
  for (const node of nodes) {
    if (node.path === path && node.type === "file") return node;
    const nested = findFileNode(node.children, path);
    if (nested) return nested;
  }

  return null;
}

async function scanDirectory(fs, directory = "/", depth = 0) {
  const names = await fs.readdir(directory);
  const nodes = [];

  for (const name of names.sort((a, b) => a.localeCompare(b))) {
    if (name === ".DS_Store") continue;

    const path = joinPodPath(directory, name);
    const stat = await fs.stat(path);
    const node = {
      name,
      path,
      size: stat.size,
      type: stat.isDirectory ? "directory" : "file",
      children: [],
    };

    if (stat.isDirectory && depth < 5 && !COLLAPSED_DIRECTORIES.has(name)) {
      node.children = await scanDirectory(fs, path, depth + 1);
    }

    nodes.push(node);
  }

  return nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

function makePodFiles() {
  return {
    "/server.js": makeServerFile(),
    "/package.json": JSON.stringify(
      {
        name: "nodepod-virtual-service",
        private: true,
        scripts: {
          start: "node server.js",
        },
        dependencies: {},
      },
      null,
      2,
    ),
    "/README.md": [
      "# Nodepod virtual service",
      "",
      "These files live inside the Nodepod virtual filesystem.",
      "The host page reads and writes them through nodepod.fs.",
      "",
    ].join("\n"),
    "/public/message.txt": "Hello from the Pod virtual filesystem.\n",
  };
}

function makeServerFile() {
  return `
const http = require('http');

const startedAt = new Date().toISOString();

const server = http.createServer((req, res) => {
  if (req.url === '/api/status') {
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({
      ok: true,
      runtime: 'Nodepod',
      process: 'virtual node process',
      url: req.url,
      startedAt,
      now: new Date().toISOString()
    }, null, 2));
    return;
  }

  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.end([
    '<!doctype html>',
    '<html lang="zh-CN">',
    '<head>',
    '<meta charset="UTF-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0" />',
    '<link rel="icon" href="data:," />',
    '<script src="https://cdn.tailwindcss.com"></script>',
    '<title>Nodepod server</title>',
    '</head>',
    '<body class="min-h-screen bg-zinc-950 text-zinc-100">',
    '<main class="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-5 px-6 py-10">',
    '<p class="text-sm text-[#58a6ff]">Response from virtual HTTP server</p>',
    '<h1 class="text-4xl font-semibold tracking-normal">这个页面由 Nodepod 内部服务返回</h1>',
    '<p class="text-base leading-7 text-zinc-300">服务代码运行在浏览器里的 Node-like 沙箱中，使用 Node 的 http 模块监听虚拟端口 3000，再由 Service Worker 转发到这个预览 iframe。</p>',
    '<div class="grid gap-3 rounded border border-zinc-800 bg-zinc-900 p-4 text-sm">',
    '<div><span class="text-zinc-500">Request URL</span><div class="mt-1 text-[#8ff0b6]">' + req.url + '</div></div>',
    '<div><span class="text-zinc-500">Started At</span><div class="mt-1 text-[#8ff0b6]">' + startedAt + '</div></div>',
    '</div>',
    '</main>',
    '</body>',
    '</html>'
  ].join(''));
});

server.listen(3000, () => {
  console.log('virtual server listening on port 3000');
});
`.trimStart();
}

function Panel({ title, meta, actions, children }) {
  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded border border-[#242832] bg-[#0f1117]">
      <div className="panel-drag-handle flex h-9 shrink-0 cursor-grab touch-none select-none items-center justify-between border-b border-[#242832] bg-[#151922] px-3 active:cursor-grabbing">
        <div className="pointer-events-none flex min-w-0 items-center gap-2">
          <p className="truncate text-xs font-semibold uppercase tracking-wide text-zinc-400">
            {title}
          </p>
          {meta ? (
            <span className="truncate text-xs text-zinc-600">{meta}</span>
          ) : null}
        </div>
        {actions ? (
          <div className="no-drag flex items-center gap-2">{actions}</div>
        ) : null}
      </div>
      <div className="no-drag min-h-0 flex-1">{children}</div>
    </section>
  );
}

function CodeEditor({ path, value, readOnly, onChange }) {
  const containerRef = useRef(null);
  const editorRef = useRef(null);
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!containerRef.current || editorRef.current) return undefined;

    const editor = monaco.editor.create(containerRef.current, {
      automaticLayout: true,
      cursorBlinking: "smooth",
      fontFamily:
        'Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
      fontLigatures: false,
      fontSize: 13,
      language: getEditorLanguage(path),
      lineHeight: 20,
      lineNumbersMinChars: 3,
      minimap: { enabled: false },
      padding: { bottom: 12, top: 12 },
      quickSuggestions: true,
      readOnly,
      renderLineHighlight: "line",
      scrollBeyondLastLine: false,
      suggestOnTriggerCharacters: true,
      tabSize: 2,
      theme: "nodepod-dark",
      value,
      wordWrap: "off",
    });

    editorRef.current = editor;

    const changeDisposable = editor.onDidChangeModelContent(() => {
      const nextValue = editor.getValue();
      if (nextValue === valueRef.current) return;

      valueRef.current = nextValue;
      onChangeRef.current(nextValue);
    });

    return () => {
      changeDisposable.dispose();
      editor.dispose();
      editorRef.current = null;
    };
  }, []);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    const model = editor.getModel();
    if (model) monaco.editor.setModelLanguage(model, getEditorLanguage(path));
  }, [path]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || editor.getValue() === value) return;

    valueRef.current = value;
    editor.setValue(value);
  }, [value]);

  useEffect(() => {
    editorRef.current?.updateOptions({ readOnly });
  }, [readOnly]);

  return (
    <div className="relative h-full min-h-0 bg-[#0f1117]">
      <div ref={containerRef} className="h-full min-h-0 w-full" />
      {readOnly ? (
        <div className="pointer-events-none absolute inset-0 grid place-items-center bg-[#0f1117]/80 text-sm text-zinc-600">
          选择文本文件后开始编辑
        </div>
      ) : null}
    </div>
  );
}

function FileTree({
  nodes,
  selectedPath,
  expandedPaths,
  onOpenFile,
  onToggleDirectory,
  onOpenContextMenu,
}) {
  function renderNode(node, depth) {
    const isDirectory = node.type === "directory";
    const isExpanded = expandedPaths.has(node.path);
    const className = [
      "file-tree-row group relative flex w-full items-center gap-1.5 py-1.5 pr-3 text-left text-sm transition",
      isDirectory ? "text-zinc-400 hover:bg-[#171b25]" : "hover:bg-[#1a1f2b]",
      node.path === selectedPath
        ? "bg-[#12395f] text-zinc-100"
        : "text-zinc-300",
    ].join(" ");

    const content = (
      <>
        {Array.from({ length: depth }).map((_, index) => (
          <span
            key={index}
            className="file-tree-indent-line pointer-events-none absolute bottom-0 top-0 border-l border-[#29313d]"
            style={{ left: 16 + index * 16 }}
          />
        ))}
        <span
          className={[
            "codicon shrink-0 text-[14px] text-zinc-500 transition",
            isDirectory
              ? isExpanded
                ? "codicon-chevron-down"
                : "codicon-chevron-right"
              : "codicon-blank",
          ].join(" ")}
        />
        <span
          className={[
            "codicon shrink-0 text-[15px]",
            isDirectory
              ? isExpanded
                ? "codicon-folder-opened text-[#dcb67a]"
                : "codicon-folder text-[#dcb67a]"
              : `${getFileIcon(node)} text-[#58a6ff]`,
          ].join(" ")}
        />
        <span className="min-w-0 flex-1 truncate">{node.name}</span>
        <span className="shrink-0 text-xs text-zinc-600">
          {isDirectory ? "" : formatBytes(node.size)}
        </span>
      </>
    );

    return (
      <React.Fragment key={node.path}>
        {isDirectory ? (
          <button
            type="button"
            className={className}
            style={{ paddingLeft: 8 + depth * 16 }}
            onClick={() => onToggleDirectory(node.path)}
            onContextMenu={(event) => {
              event.preventDefault();
              onOpenContextMenu(event, node);
            }}
          >
            {content}
          </button>
        ) : (
          <button
            type="button"
            className={className}
            style={{ paddingLeft: 8 + depth * 16 }}
            onClick={() => onOpenFile(node)}
            onContextMenu={(event) => {
              event.preventDefault();
              onOpenContextMenu(event, node);
            }}
          >
            {content}
          </button>
        )}
        {isDirectory && isExpanded
          ? node.children.map((child) => renderNode(child, depth + 1))
          : null}
      </React.Fragment>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto py-2 text-sm text-zinc-300">
      <div
        className="px-3 pb-1 text-xs font-medium text-zinc-600"
        onContextMenu={(event) => {
          event.preventDefault();
          onOpenContextMenu(event, {
            children: nodes,
            name: "/",
            path: "/",
            type: "directory",
          });
        }}
      >
        /
      </div>
      {nodes.length === 0 ? (
        <p className="px-3 text-xs text-zinc-500">等待 Pod 启动...</p>
      ) : (
        nodes.map((node) => renderNode(node, 0))
      )}
    </div>
  );
}

function FileMenuButton({ children, destructive = false, icon, onClick }) {
  return (
    <button
      type="button"
      className={[
        "flex h-7 w-full items-center gap-2 rounded px-2 text-left text-xs transition",
        destructive
          ? "text-red-300 hover:bg-red-950/40 hover:text-red-200"
          : "text-zinc-300 hover:bg-[#1f2937] hover:text-zinc-100",
      ].join(" ")}
      onClick={onClick}
    >
      <span className={`codicon ${icon} text-[13px]`} />
      <span>{children}</span>
    </button>
  );
}

function FileContextMenu({
  menu,
  menuRef,
  onClose,
  onCreateFile,
  onCreateFolder,
  onDelete,
  onRename,
}) {
  if (!menu) return null;

  const { node } = menu;
  const isDirectory = node.type === "directory";
  const isRoot = node.path === "/";

  function runAction(action) {
    onClose();
    action(node);
  }

  return (
    <div
      ref={menuRef}
      className="no-drag fixed z-50 min-w-44 rounded border border-[#303645] bg-[#10141d] p-1 shadow-2xl shadow-black/40"
      style={{ left: menu.x, top: menu.y }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className="mb-1 max-w-64 truncate border-b border-[#242832] px-2 py-1.5 font-mono text-[11px] text-zinc-500">
        {node.path}
      </div>
      {isDirectory ? (
        <>
          <FileMenuButton
            icon="codicon-new-file"
            onClick={() => runAction(onCreateFile)}
          >
            新建文件
          </FileMenuButton>
          <FileMenuButton
            icon="codicon-new-folder"
            onClick={() => runAction(onCreateFolder)}
          >
            新建文件夹
          </FileMenuButton>
          <div className="my-1 border-t border-[#242832]" />
        </>
      ) : null}
      {!isRoot ? (
        <>
          <FileMenuButton
            icon="codicon-edit"
            onClick={() => runAction(onRename)}
          >
            重命名
          </FileMenuButton>
          <FileMenuButton
            destructive
            icon="codicon-trash"
            onClick={() => runAction(onDelete)}
          >
            删除
          </FileMenuButton>
        </>
      ) : null}
    </div>
  );
}

function App() {
  const { width, containerRef, mounted } = useContainerWidth();
  const initialTerminalRef = useRef(null);
  if (!initialTerminalRef.current) {
    initialTerminalRef.current = createTerminalSession(1);
  }

  const [layout, setLayout] = useState(loadLayout);
  const [layoutKey, setLayoutKey] = useState(0);
  const [customConstraint, setCustomConstraint] = useState("none");
  const [status, setStatus] = useState("等待启动...");
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState([]);
  const [fileCount, setFileCount] = useState(0);
  const [fileContextMenu, setFileContextMenu] = useState(null);
  const [expandedDirectories, setExpandedDirectories] = useState(
    () => new Set(["/public"]),
  );
  const [selectedFilePath, setSelectedFilePath] = useState("/server.js");
  const [selectedFileSize, setSelectedFileSize] = useState(0);
  const [editorValue, setEditorValue] = useState("");
  const [editorDirty, setEditorDirty] = useState(false);
  const [editorReadOnly, setEditorReadOnly] = useState(true);
  const [serverUrl, setServerUrl] = useState("");
  const [previewAddress, setPreviewAddress] = useState("");
  const [previewFrameUrl, setPreviewFrameUrl] = useState("");
  const [previewStatus, setPreviewStatus] = useState("Preview");
  const [apiResult, setApiResult] = useState("未请求");
  const [terminals, setTerminals] = useState(() => [
    initialTerminalRef.current,
  ]);
  const [activeTerminalId, setActiveTerminalId] = useState(
    () => initialTerminalRef.current.id,
  );

  const nodepodRef = useRef(null);
  const watcherRef = useRef(null);
  const serverProcessRef = useRef(null);
  const terminalProcessesRef = useRef(new Map());
  const terminalOutputRef = useRef(null);
  const fileContextMenuRef = useRef(null);
  const bootedRef = useRef(false);
  const layoutReadyRef = useRef(false);
  const terminalCounterRef = useRef(1);
  const terminalsRef = useRef(terminals);
  const activeTerminalIdRef = useRef(activeTerminalId);
  const selectedFilePathRef = useRef(selectedFilePath);
  const editorValueRef = useRef(editorValue);
  const editorDirtyRef = useRef(editorDirty);
  const editorReadOnlyRef = useRef(editorReadOnly);

  const dirtyClassName = editorDirty
    ? "text-xs text-[#febc2e]"
    : "text-xs text-zinc-600";
  const podReady = Boolean(nodepodRef.current);
  const activeTerminal =
    terminals.find((terminal) => terminal.id === activeTerminalId) ??
    terminals[0];
  const promptText = `nodepod:${activeTerminal?.cwd ?? "/"} $`;
  const layoutConstraints = useMemo(() => {
    const custom = CONSTRAINT_OPTIONS[customConstraint]?.constraint;
    return custom ? [gridBounds, minMaxSize, custom] : [gridBounds, minMaxSize];
  }, [customConstraint]);
  const activeConstraintText = layoutConstraints
    .map((constraint) => constraint.name)
    .join(", ");
  const previewUrl = useMemo(() => toPreviewUrl(serverUrl), [serverUrl]);

  useEffect(() => {
    selectedFilePathRef.current = selectedFilePath;
  }, [selectedFilePath]);

  useEffect(() => {
    editorValueRef.current = editorValue;
  }, [editorValue]);

  useEffect(() => {
    editorDirtyRef.current = editorDirty;
  }, [editorDirty]);

  useEffect(() => {
    editorReadOnlyRef.current = editorReadOnly;
  }, [editorReadOnly]);

  useEffect(() => {
    terminalsRef.current = terminals;
  }, [terminals]);

  useEffect(() => {
    activeTerminalIdRef.current = activeTerminalId;
  }, [activeTerminalId]);

  useEffect(() => {
    setPreviewAddress(previewUrl);
    setPreviewFrameUrl(previewUrl);
  }, [previewUrl]);

  useEffect(() => {
    if (terminalOutputRef.current) {
      terminalOutputRef.current.scrollTop =
        terminalOutputRef.current.scrollHeight;
    }
  }, [activeTerminal?.logs, activeTerminalId]);

  useEffect(() => {
    if (!fileContextMenu) return undefined;

    function handlePointerDown(event) {
      if (fileContextMenuRef.current?.contains(event.target)) return;
      setFileContextMenu(null);
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setFileContextMenu(null);
      }
    }

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [fileContextMenu]);

  function updateTerminal(terminalId, updater) {
    setTerminals((current) =>
      current.map((terminal) => {
        if (terminal.id !== terminalId) return terminal;
        const patch =
          typeof updater === "function" ? updater(terminal) : updater;
        return { ...terminal, ...patch };
      }),
    );
  }

  function appendLog(message, terminalId = activeTerminalIdRef.current) {
    const text = typeof message === "string" ? message : String(message);
    updateTerminal(terminalId, (terminal) => ({
      logs: terminal.logs + (text.endsWith("\n") ? text : `${text}\n`),
    }));
  }

  function updateEditorValue(value) {
    editorValueRef.current = value;
    setEditorValue(value);
  }

  function updateEditorDirty(value) {
    editorDirtyRef.current = value;
    setEditorDirty(value);
  }

  function getTerminal(terminalId) {
    return terminalsRef.current.find((terminal) => terminal.id === terminalId);
  }

  function toggleDirectory(path) {
    setExpandedDirectories((current) => {
      const next = new Set(current);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }

  function getCreationDirectory(node) {
    if (node?.type === "directory") return node.path;
    if (node?.path) return getParentPath(node.path);

    return getParentPath(selectedFilePathRef.current);
  }

  function openFileContextMenu(event, node) {
    setFileContextMenu({
      node,
      x: Math.min(event.clientX, window.innerWidth - 220),
      y: Math.min(event.clientY, window.innerHeight - 220),
    });
  }

  function reportFileOperationError(action, error) {
    const message = error instanceof Error ? error.message : String(error);
    appendLog(`${action} failed: ${message}`);
    window.alert(`${action}失败：${message}`);
  }

  async function pathExists(path) {
    try {
      await nodepodRef.current.fs.stat(path);
      return true;
    } catch {
      return false;
    }
  }

  async function createFile(targetNode = null) {
    const nodepod = nodepodRef.current;
    if (!nodepod) return;

    const directory = getCreationDirectory(targetNode);
    const input = window.prompt("新建文件名", "untitled.js");
    if (input === null) return;

    try {
      const name = normalizeEntryName(input);
      const path = joinPodPath(directory, name);

      if (await pathExists(path)) {
        throw new Error(`${path} 已存在`);
      }

      await nodepod.fs.writeFile(path, "");
      setExpandedDirectories((current) => {
        const next = new Set(current);
        next.add(directory);
        return next;
      });
      selectedFilePathRef.current = path;
      setSelectedFilePath(path);
      await refreshFileSystem({ preserveEditor: true });
      await openFile(
        {
          children: [],
          name,
          path,
          size: 0,
          type: "file",
        },
        { skipRefresh: true },
      );
      appendLog(`created file ${path}`);
    } catch (error) {
      reportFileOperationError("新建文件", error);
    }
  }

  async function createFolder(targetNode = null) {
    const nodepod = nodepodRef.current;
    if (!nodepod) return;

    const directory = getCreationDirectory(targetNode);
    const input = window.prompt("新建文件夹名", "new-folder");
    if (input === null) return;

    try {
      const name = normalizeEntryName(input);
      const path = joinPodPath(directory, name);

      if (await pathExists(path)) {
        throw new Error(`${path} 已存在`);
      }

      await nodepod.fs.mkdir(path);
      setExpandedDirectories((current) => {
        const next = new Set(current);
        next.add(directory);
        next.add(path);
        return next;
      });
      await refreshFileSystem({ preserveEditor: true });
      appendLog(`created folder ${path}`);
    } catch (error) {
      reportFileOperationError("新建文件夹", error);
    }
  }

  async function renameNode(node) {
    const nodepod = nodepodRef.current;
    if (!nodepod || node.path === "/") return;

    const input = window.prompt("重命名", node.name);
    if (input === null) return;

    try {
      const name = normalizeEntryName(input);
      if (name === node.name) return;

      const nextPath = joinPodPath(getParentPath(node.path), name);
      if (await pathExists(nextPath)) {
        throw new Error(`${nextPath} 已存在`);
      }

      const selectedBefore = selectedFilePathRef.current;
      const selectedInside =
        selectedBefore === node.path ||
        selectedBefore.startsWith(`${node.path}/`);

      if (selectedInside && editorDirtyRef.current) {
        await saveSelectedFile({ silent: true });
      }

      await nodepod.fs.rename(node.path, nextPath);

      if (selectedInside) {
        const selectedAfter = replacePathPrefix(
          selectedBefore,
          node.path,
          nextPath,
        );
        selectedFilePathRef.current = selectedAfter;
        setSelectedFilePath(selectedAfter);
      }

      setExpandedDirectories((current) => {
        const next = new Set();
        for (const path of current) {
          next.add(replacePathPrefix(path, node.path, nextPath));
        }
        return next;
      });
      await refreshFileSystem({ preserveEditor: true });
      appendLog(`renamed ${node.path} -> ${nextPath}`);
    } catch (error) {
      reportFileOperationError("重命名", error);
    }
  }

  async function removeDirectoryRecursive(path) {
    const nodepod = nodepodRef.current;
    const names = await nodepod.fs.readdir(path);

    await Promise.all(
      names.map(async (name) => {
        const childPath = joinPodPath(path, name);
        const stat = await nodepod.fs.stat(childPath);

        if (stat.isDirectory) {
          await removeDirectoryRecursive(childPath);
        } else {
          await nodepod.fs.unlink(childPath);
        }
      }),
    );

    await nodepod.fs.rmdir(path);
  }

  async function removeNodePath(node) {
    const nodepod = nodepodRef.current;

    if (node.type !== "directory") {
      await nodepod.fs.unlink(node.path);
      return;
    }

    if (nodepod.fs.rm) {
      await nodepod.fs.rm(node.path, { force: true, recursive: true });
      return;
    }

    await removeDirectoryRecursive(node.path);
  }

  async function deleteNode(node) {
    const nodepod = nodepodRef.current;
    if (!nodepod || node.path === "/") return;

    const confirmed = window.confirm(`确认删除 ${node.path}？`);
    if (!confirmed) return;

    try {
      const selectedBefore = selectedFilePathRef.current;
      const deletingSelected =
        selectedBefore === node.path ||
        selectedBefore.startsWith(`${node.path}/`);

      await removeNodePath(node);

      if (deletingSelected) {
        selectedFilePathRef.current = "";
        setSelectedFilePath("");
        setSelectedFileSize(0);
        setEditorReadOnly(true);
        updateEditorValue("");
        updateEditorDirty(false);
      }

      setExpandedDirectories((current) => {
        const next = new Set();
        for (const path of current) {
          if (path === node.path || path.startsWith(`${node.path}/`)) {
            continue;
          }
          next.add(path);
        }
        return next;
      });
      await refreshFileSystem({ preserveEditor: !deletingSelected });
      appendLog(`deleted ${node.path}`);
    } catch (error) {
      reportFileOperationError("删除", error);
    }
  }

  function addTerminal() {
    terminalCounterRef.current += 1;
    const terminal = createTerminalSession(terminalCounterRef.current, {
      ready: Boolean(nodepodRef.current),
      state: nodepodRef.current ? "ready" : "booting",
    });

    setTerminals((current) => [...current, terminal]);
    setActiveTerminalId(terminal.id);
  }

  async function closeTerminal(terminalId) {
    if (terminalsRef.current.length <= 1) return;

    await stopTerminalProcess(terminalId);
    const nextTerminals = terminalsRef.current.filter(
      (terminal) => terminal.id !== terminalId,
    );
    setTerminals(nextTerminals);

    if (activeTerminalIdRef.current === terminalId) {
      setActiveTerminalId(nextTerminals[0].id);
    }
  }

  function reloadPreview({ reset = false } = {}) {
    const target = reset
      ? previewUrl
      : resolvePreviewAddress(previewAddress, previewUrl);

    setPreviewAddress(target);
    setPreviewFrameUrl("");
    requestAnimationFrame(() => {
      setPreviewFrameUrl(target);
    });
  }

  function resolvePodPath(input = ".", cwd = "/") {
    const base = input.startsWith("/") ? input : `${cwd}/${input}`;
    const parts = [];

    for (const part of base.split("/")) {
      if (!part || part === ".") continue;
      if (part === "..") {
        parts.pop();
        continue;
      }

      parts.push(part);
    }

    return `/${parts.join("/")}`;
  }

  function parseCommandLine(input) {
    const tokens = [];
    let current = "";
    let quote = null;
    let escaping = false;

    for (const char of input) {
      if (escaping) {
        current += char;
        escaping = false;
        continue;
      }

      if (char === "\\") {
        escaping = true;
        continue;
      }

      if (quote) {
        if (char === quote) {
          quote = null;
        } else {
          current += char;
        }
        continue;
      }

      if (char === '"' || char === "'") {
        quote = char;
        continue;
      }

      if (/\s/.test(char)) {
        if (current) {
          tokens.push(current);
          current = "";
        }
        continue;
      }

      current += char;
    }

    if (escaping) current += "\\";
    if (quote) throw new Error("Unclosed quote");
    if (current) tokens.push(current);

    return tokens;
  }

  async function refreshFileSystem({ preserveEditor = false } = {}) {
    const nodepod = nodepodRef.current;
    if (!nodepod) return;

    const nodes = await scanDirectory(nodepod.fs);
    const filesTotal = countFiles(nodes);
    const previousSelectedPath = selectedFilePathRef.current;
    const exactSelectedNode = findFileNode(nodes, previousSelectedPath);
    const selectedNode = exactSelectedNode ?? findFileNode(nodes, firstFilePath(nodes));

    setFiles(nodes);
    setFileCount(filesTotal);

    if (selectedNode) {
      const selectedMissing = Boolean(previousSelectedPath) && !exactSelectedNode;
      setSelectedFilePath(selectedNode.path);

      if (selectedMissing) {
        selectedFilePathRef.current = selectedNode.path;
        setSelectedFileSize(selectedNode.size);
        if (isTextFile(selectedNode.path)) {
          setEditorReadOnly(false);
          updateEditorValue(await nodepod.fs.readFile(selectedNode.path, "utf-8"));
        } else {
          setEditorReadOnly(true);
          updateEditorValue("");
        }
        updateEditorDirty(false);
      } else if (!preserveEditor && !editorDirtyRef.current) {
        await openFile(selectedNode, { skipRefresh: true });
      }
    } else if (previousSelectedPath) {
      setSelectedFilePath("");
      selectedFilePathRef.current = "";
      setSelectedFileSize(0);
      setEditorReadOnly(false);
      updateEditorValue("");
      updateEditorDirty(false);
    }
  }

  async function saveSelectedFile({ silent = false } = {}) {
    const nodepod = nodepodRef.current;
    if (!nodepod || editorReadOnlyRef.current || !selectedFilePathRef.current) {
      return;
    }

    await nodepod.fs.writeFile(
      selectedFilePathRef.current,
      editorValueRef.current,
    );
    const size = editorValueRef.current.length;
    setSelectedFileSize(size);
    updateEditorDirty(false);

    if (!silent) appendLog(`saved ${selectedFilePathRef.current}`);

    await refreshFileSystem({ preserveEditor: true });
  }

  async function openFile(node, { skipRefresh = false } = {}) {
    const nodepod = nodepodRef.current;
    if (!nodepod || node.type !== "file") return;

    if (editorDirtyRef.current) {
      await saveSelectedFile({ silent: true });
    }

    setSelectedFilePath(node.path);
    selectedFilePathRef.current = node.path;
    setSelectedFileSize(node.size);

    if (!isTextFile(node.path)) {
      setEditorReadOnly(true);
      updateEditorValue("");
      updateEditorDirty(false);
      if (!skipRefresh) await refreshFileSystem({ preserveEditor: true });
      return;
    }

    setEditorReadOnly(false);
    updateEditorValue(await nodepod.fs.readFile(node.path, "utf-8"));
    updateEditorDirty(false);

    if (!skipRefresh) {
      await refreshFileSystem({ preserveEditor: true });
    }
  }

  async function readApiStatus(url) {
    try {
      const response = await fetch(`${url.replace(/\/$/, "")}/api/status`);
      const text = await response.text();

      try {
        setApiResult(JSON.stringify(JSON.parse(text), null, 2));
      } catch {
        setApiResult(text);
      }
    } catch (error) {
      setApiResult(error instanceof Error ? error.message : String(error));
    }
  }

  async function stopProcess(processRef) {
    const process = processRef.current;
    if (!process || process.exited) {
      processRef.current = null;
      return;
    }

    process.kill();

    await Promise.race([
      process.completion.catch(() => null),
      new Promise((resolve) => {
        setTimeout(resolve, 400);
      }),
    ]);

    processRef.current = null;
  }

  async function stopServer() {
    await stopProcess(serverProcessRef);
  }

  async function stopTerminalProcess(terminalId = activeTerminalIdRef.current) {
    const process = terminalProcessesRef.current.get(terminalId);
    if (!process || process.exited) {
      terminalProcessesRef.current.delete(terminalId);
      updateTerminal(terminalId, { state: "ready" });
      return;
    }

    process.kill();

    await Promise.race([
      process.completion.catch(() => null),
      new Promise((resolve) => {
        setTimeout(resolve, 400);
      }),
    ]);

    terminalProcessesRef.current.delete(terminalId);
    updateTerminal(terminalId, { state: "ready" });
  }

  async function stopAllTerminalProcesses() {
    await Promise.all(
      [...terminalProcessesRef.current.keys()].map((terminalId) =>
        stopTerminalProcess(terminalId),
      ),
    );
  }

  function clearServerSurface() {
    setServerUrl("");
    setPreviewStatus("Preview");
    setApiResult("未请求");
  }

  async function startServer({ saveBeforeRun = true } = {}) {
    const nodepod = nodepodRef.current;
    if (!nodepod) return;

    setBusy(true);
    setStatus(saveBeforeRun ? "保存并重启服务..." : "启动服务...");

    if (saveBeforeRun) {
      await saveSelectedFile({ silent: true });
    }

    await stopServer();
    clearServerSurface();

    appendLog("$ node server.js");
    const process = await nodepod.spawn("node", ["server.js"]);
    serverProcessRef.current = process;
    process.on("output", appendLog);
    process.on("error", appendLog);
    process.completion.then(({ exitCode }) => {
      if (serverProcessRef.current === process && exitCode !== 0) {
        setStatus(`服务退出：${exitCode}`);
      }
    });

    setBusy(false);
  }

  async function teardownPod() {
    await stopAllTerminalProcesses();
    await stopServer();

    if (watcherRef.current?.close) {
      watcherRef.current.close();
      watcherRef.current = null;
    }

    if (nodepodRef.current?.teardown) {
      nodepodRef.current.teardown();
      nodepodRef.current = null;
    }
  }

  function resetWorkspacePanel() {
    selectedFilePathRef.current = "/server.js";
    setSelectedFilePath("/server.js");
    setSelectedFileSize(0);
    updateEditorValue("");
    updateEditorDirty(false);
    setEditorReadOnly(true);
    setFiles([]);
    setFileCount(0);
    setExpandedDirectories(new Set(["/public"]));
    setTerminals((current) =>
      current.map((terminal) => ({
        ...terminal,
        cwd: "/",
        history: [],
        historyIndex: 0,
        input: "",
        logs: "",
        ready: false,
        state: "booting",
      })),
    );
    clearServerSurface();
  }

  async function bootPod() {
    setBusy(true);
    resetWorkspacePanel();
    setStatus("启动 Nodepod runtime...");

    await teardownPod();

    appendLog("$ Nodepod.boot(...)");

    const nodepod = await Nodepod.boot({
      files: makePodFiles(),
      onServerReady: async (port, url) => {
        appendLog(`server-ready: port ${port} -> ${url}`);
        setServerUrl(url);
        setPreviewStatus(`Port ${port}`);
        setStatus("虚拟 HTTP 服务已启动");
        await readApiStatus(url);
      },
    });
    nodepodRef.current = nodepod;
    setTerminals((current) =>
      current.map((terminal) => ({
        ...terminal,
        ready: true,
        state: "ready",
      })),
    );

    watcherRef.current = nodepod.fs.watch("/", { recursive: true }, () => {
      refreshFileSystem({ preserveEditor: true }).catch((error) => {
        appendLog(error instanceof Error ? error.message : String(error));
      });
    });

    await refreshFileSystem();
    await startServer({ saveBeforeRun: false });
  }

  async function listDirectory(path) {
    const nodepod = nodepodRef.current;
    const names = await nodepod.fs.readdir(path);
    const entries = await Promise.all(
      names
        .filter((name) => name !== ".DS_Store")
        .map(async (name) => {
          const childPath = joinPodPath(path, name);
          const stat = await nodepod.fs.stat(childPath);
          return {
            name,
            label: stat.isDirectory ? `${name}/` : name,
            type: stat.isDirectory ? "directory" : "file",
          };
        }),
    );

    return entries
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
        return a.name.localeCompare(b.name);
      })
      .map((entry) => entry.label)
      .join("  ");
  }

  async function runBuiltinCommand(command, args, terminalId) {
    const nodepod = nodepodRef.current;
    const terminal = getTerminal(terminalId);
    const cwd = terminal?.cwd ?? "/";

    if (command === "clear") {
      updateTerminal(terminalId, { logs: "" });
      return true;
    }

    if (command === "help") {
      appendLog(
        [
          "Built-ins: help, clear, pwd, cd, ls, cat, save, restart, reset",
          "External commands run through Nodepod spawn(), for example:",
          '  node -e "console.log(process.cwd())"',
          "  node server.js",
          "Ctrl+C kills the active terminal process.",
        ].join("\n"),
        terminalId,
      );
      return true;
    }

    if (command === "pwd") {
      appendLog(cwd, terminalId);
      return true;
    }

    if (command === "cd") {
      const nextPath = resolvePodPath(args[0] ?? "/", cwd);
      const stat = await nodepod.fs.stat(nextPath);

      if (!stat.isDirectory) {
        appendLog(`cd: not a directory: ${nextPath}`, terminalId);
        return true;
      }

      updateTerminal(terminalId, { cwd: nextPath });
      return true;
    }

    if (command === "ls") {
      const target = resolvePodPath(args[0] ?? ".", cwd);
      const stat = await nodepod.fs.stat(target);
      appendLog(
        stat.isDirectory
          ? await listDirectory(target)
          : target.split("/").pop(),
        terminalId,
      );
      return true;
    }

    if (command === "cat") {
      if (args.length === 0) {
        appendLog("cat: missing file operand", terminalId);
        return true;
      }

      for (const file of args) {
        const target = resolvePodPath(file, cwd);
        const stat = await nodepod.fs.stat(target);

        if (!stat.isFile) {
          appendLog(`cat: ${target}: not a file`, terminalId);
          continue;
        }

        appendLog(await nodepod.fs.readFile(target, "utf-8"), terminalId);
      }

      return true;
    }

    if (command === "save") {
      await saveSelectedFile();
      return true;
    }

    if (command === "restart") {
      await startServer();
      return true;
    }

    if (command === "reset") {
      await bootPod();
      return true;
    }

    return false;
  }

  async function runExternalCommand(command, args, terminalId) {
    const nodepod = nodepodRef.current;
    const cwd = getTerminal(terminalId)?.cwd ?? "/";
    updateTerminal(terminalId, { state: `running ${command}` });

    const process = await nodepod.spawn(command, args, {
      cwd,
    });
    terminalProcessesRef.current.set(terminalId, process);
    process.on("output", (message) => appendLog(message, terminalId));
    process.on("error", (message) => appendLog(message, terminalId));

    const { exitCode } = await process.completion;

    if (terminalProcessesRef.current.get(terminalId) === process) {
      terminalProcessesRef.current.delete(terminalId);
    }

    if (exitCode !== 0) {
      appendLog(`[exit ${exitCode}]`, terminalId);
    }

    updateTerminal(terminalId, { state: "ready" });
  }

  async function runTerminalCommand(rawInput, terminalId = activeTerminalId) {
    if (!nodepodRef.current) return;

    const terminal = getTerminal(terminalId);
    if (!terminal) return;

    const input = rawInput.trim();
    if (!input) return;

    const runningProcess = terminalProcessesRef.current.get(terminalId);
    if (runningProcess && !runningProcess.exited) {
      appendLog(input, terminalId);
      runningProcess.write(`${input}\n`);
      return;
    }

    const history = [...terminal.history, input].slice(-100);
    updateTerminal(terminalId, {
      history,
      historyIndex: history.length,
      input: "",
    });
    appendLog(`nodepod:${terminal.cwd} $ ${input}`, terminalId);

    try {
      const [command, ...args] = parseCommandLine(input);
      if (!command) return;

      const handled = await runBuiltinCommand(command, args, terminalId);
      if (!handled) {
        await runExternalCommand(command, args, terminalId);
      }
    } catch (error) {
      appendLog(
        error instanceof Error ? error.message : String(error),
        terminalId,
      );
      updateTerminal(terminalId, { state: "ready" });
    } finally {
      refreshFileSystem({ preserveEditor: true }).catch((error) => {
        appendLog(
          error instanceof Error ? error.message : String(error),
          terminalId,
        );
      });
    }
  }

  function handleTerminalKeyDown(event, terminalId = activeTerminalId) {
    const terminal = getTerminal(terminalId);
    if (!terminal) return;

    if (event.ctrlKey && event.key.toLowerCase() === "c") {
      const runningProcess = terminalProcessesRef.current.get(terminalId);
      if (runningProcess && !runningProcess.exited) {
        event.preventDefault();
        appendLog("^C", terminalId);
        stopTerminalProcess(terminalId).catch((error) => {
          appendLog(
            error instanceof Error ? error.message : String(error),
            terminalId,
          );
        });
      }
      return;
    }

    if (event.key === "ArrowUp") {
      if (terminal.history.length === 0) return;

      event.preventDefault();
      const nextIndex = Math.max(0, terminal.historyIndex - 1);
      updateTerminal(terminalId, {
        historyIndex: nextIndex,
        input: terminal.history[nextIndex] ?? "",
      });
      return;
    }

    if (event.key === "ArrowDown") {
      if (terminal.history.length === 0) return;

      event.preventDefault();
      const nextIndex = Math.min(
        terminal.history.length,
        terminal.historyIndex + 1,
      );
      updateTerminal(terminalId, {
        historyIndex: nextIndex,
        input: terminal.history[nextIndex] ?? "",
      });
    }
  }

  function handleLayoutChange(nextLayout) {
    const constrained = nextLayout.map((item) => ({
      ...item,
      ...ITEM_CONSTRAINTS[item.i],
    }));

    if (!layoutReadyRef.current) {
      layoutReadyRef.current = true;
      setLayout(constrained);
      return;
    }

    setLayout(constrained);
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(constrained));
  }

  function resetLayout() {
    localStorage.removeItem(LAYOUT_STORAGE_KEY);
    layoutReadyRef.current = false;
    setLayout(DEFAULT_LAYOUT);
    setLayoutKey((value) => value + 1);
  }

  useEffect(() => {
    if (bootedRef.current) return undefined;
    bootedRef.current = true;

    bootPod().catch((error) => {
      setStatus("启动失败");
      appendLog(error instanceof Error ? error.stack : String(error));
      setBusy(false);
    });

    return () => {
      teardownPod();
    };
  }, []);

  const layoutSummary = useMemo(
    () => `${layout.length} panels`,
    [layout.length],
  );

  return (
    <div className="flex min-h-[100dvh] flex-col bg-[#0b0d12] text-zinc-100">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-[#242832] bg-[#12151d] px-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-7 w-7 place-items-center rounded bg-[#1389fd] text-sm font-semibold text-white">
            N
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-zinc-100">
              Nodepod Workspace
            </div>
            <div className="truncate text-xs text-zinc-500">{status}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label className="hidden items-center gap-2 text-xs text-zinc-500 lg:flex">
            Custom Constraint
            <select
              className="h-8 rounded border border-[#303645] bg-[#0f1117] px-2 text-xs text-zinc-300 outline-none transition hover:border-[#4a5265] focus:border-[#1389fd]"
              value={customConstraint}
              onChange={(event) => setCustomConstraint(event.target.value)}
            >
              {Object.entries(CONSTRAINT_OPTIONS).map(([value, option]) => (
                <option key={value} value={value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <span
            className="hidden max-w-72 truncate text-xs text-zinc-600 xl:inline"
            title={activeConstraintText}
          >
            [{activeConstraintText}]
          </span>
          <span className="hidden text-xs text-zinc-600 md:inline">
            {layoutSummary}
          </span>
          <button
            type="button"
            className="h-8 rounded border border-[#303645] px-3 text-xs font-medium text-zinc-300 transition hover:border-[#4a5265] hover:bg-[#1a1f2b]"
            onClick={resetLayout}
          >
            重置布局
          </button>
          <button
            type="button"
            className="h-8 rounded border border-[#303645] px-3 text-xs font-medium text-zinc-300 transition hover:border-[#4a5265] hover:bg-[#1a1f2b] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={busy}
            onClick={() => {
              bootPod().catch((error) => {
                setStatus("启动失败");
                appendLog(error instanceof Error ? error.stack : String(error));
                setBusy(false);
              });
            }}
          >
            重置 Pod
          </button>
          <button
            type="button"
            className="h-8 rounded bg-[#1389fd] px-3 text-xs font-semibold text-white transition hover:bg-[#2b96ff] disabled:cursor-not-allowed disabled:bg-[#303645] disabled:text-zinc-500"
            disabled={busy}
            onClick={() => {
              startServer().catch((error) => {
                setStatus("启动失败");
                appendLog(error instanceof Error ? error.stack : String(error));
                setBusy(false);
              });
            }}
          >
            重启服务
          </button>
        </div>
      </header>

      <main ref={containerRef} className="min-h-0 flex-1 overflow-auto">
        {mounted && (
          <GridLayout
            key={layoutKey}
            className="min-h-[calc(100dvh-3rem)]"
            width={width}
            layout={layout}
            gridConfig={{
              cols: 12,
              rowHeight: 30,
              margin: [8, 8],
              containerPadding: [8, 8],
              maxRows: Infinity,
            }}
            dragConfig={{
              enabled: true,
              bounded: false,
              handle: ".panel-drag-handle",
              cancel: "textarea,input,button,a,iframe,.no-drag",
              threshold: 0,
            }}
            resizeConfig={{
              enabled: true,
              handles: ["se"],
            }}
            constraints={layoutConstraints}
            onLayoutChange={handleLayoutChange}
          >
            <div key="explorer" className="min-h-0">
              <Panel
                title="Explorer"
                meta={`${fileCount} ${fileCount === 1 ? "file" : "files"}`}
                actions={
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      className="grid h-7 w-7 place-items-center rounded border border-[#303645] text-zinc-300 transition hover:border-[#4a5265] hover:bg-[#1a1f2b] disabled:cursor-not-allowed disabled:opacity-40"
                      title="新建文件"
                      disabled={!podReady}
                      onClick={() => createFile()}
                    >
                      <span className="codicon codicon-new-file text-[14px]" />
                    </button>
                    <button
                      type="button"
                      className="grid h-7 w-7 place-items-center rounded border border-[#303645] text-zinc-300 transition hover:border-[#4a5265] hover:bg-[#1a1f2b] disabled:cursor-not-allowed disabled:opacity-40"
                      title="新建文件夹"
                      disabled={!podReady}
                      onClick={() => createFolder()}
                    >
                      <span className="codicon codicon-new-folder text-[14px]" />
                    </button>
                  </div>
                }
              >
                <div className="flex h-full min-h-0 flex-col">
                  <FileTree
                    nodes={files}
                    expandedPaths={expandedDirectories}
                    selectedPath={selectedFilePath}
                    onOpenFile={openFile}
                    onOpenContextMenu={openFileContextMenu}
                    onToggleDirectory={toggleDirectory}
                  />
                  <div className="shrink-0 border-t border-[#242832] p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                      Server
                    </p>
                    {previewUrl ? (
                      <a
                        className="mt-2 block break-all text-xs leading-5 text-[#58a6ff]"
                        href={previewUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {previewUrl}
                      </a>
                    ) : (
                      <p className="mt-2 text-xs text-zinc-600">未就绪</p>
                    )}
                  </div>
                </div>
              </Panel>
            </div>

            <div key="editor" className="min-h-0">
              <Panel
                title={selectedFilePath || "Editor"}
                meta={selectedFileSize ? formatBytes(selectedFileSize) : ""}
                actions={
                  <>
                    <span className={dirtyClassName}>
                      {editorDirty ? "未保存" : "已保存"}
                    </span>
                    <button
                      type="button"
                      className="h-7 rounded border border-[#303645] px-2.5 text-xs text-zinc-300 transition hover:border-[#4a5265] hover:bg-[#1a1f2b] disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={busy || editorReadOnly}
                      onClick={() => {
                        saveSelectedFile().catch((error) => {
                          appendLog(
                            error instanceof Error
                              ? error.stack
                              : String(error),
                          );
                        });
                      }}
                    >
                      保存
                    </button>
                  </>
                }
              >
                <CodeEditor
                  path={selectedFilePath}
                  value={editorValue}
                  readOnly={busy || editorReadOnly}
                  onChange={(value) => {
                    updateEditorValue(value);
                    updateEditorDirty(true);
                  }}
                />
              </Panel>
            </div>

            <div key="preview" className="min-h-0">
              <Panel
                title="Preview"
                meta={previewUrl || "等待 Nodepod 服务启动"}
                actions={
                  <span className="text-xs text-zinc-600">{previewStatus}</span>
                }
              >
                {previewUrl ? (
                  <div className="flex h-full min-h-0 flex-col bg-[#0b0d12]">
                    <form
                      className="flex h-10 shrink-0 items-center gap-2 border-b border-[#242832] bg-[#0f1117] px-3"
                      onSubmit={(event) => {
                        event.preventDefault();
                        reloadPreview();
                      }}
                    >
                      <input
                        className="min-w-0 flex-1 rounded border border-[#303645] bg-[#090b10] px-2.5 py-1.5 font-mono text-xs text-zinc-300 outline-none transition placeholder:text-zinc-700 focus:border-[#1389fd]"
                        value={previewAddress}
                        onChange={(event) =>
                          setPreviewAddress(event.target.value)
                        }
                      />
                      <button
                        type="submit"
                        className="grid h-7 w-7 place-items-center rounded border border-[#303645] text-zinc-300 transition hover:border-[#4a5265] hover:bg-[#1a1f2b]"
                        title="重新加载"
                      >
                        <span className="codicon codicon-refresh text-[14px]" />
                      </button>
                      <button
                        type="button"
                        className="grid h-7 w-7 place-items-center rounded border border-[#303645] text-zinc-300 transition hover:border-[#4a5265] hover:bg-[#1a1f2b]"
                        title="回到默认预览"
                        onClick={() => reloadPreview({ reset: true })}
                      >
                        <span className="codicon codicon-home text-[14px]" />
                      </button>
                    </form>
                    {previewFrameUrl ? (
                      <iframe
                        key={previewFrameUrl}
                        title="Nodepod service preview"
                        className="min-h-0 flex-1 bg-white"
                        src={previewFrameUrl}
                      />
                    ) : (
                      <div className="grid min-h-0 flex-1 place-items-center text-sm text-zinc-600">
                        Preview
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="grid h-full place-items-center text-sm text-zinc-600">
                    Preview
                  </div>
                )}
              </Panel>
            </div>

            <div key="terminal" className="min-h-0">
              <Panel
                title="Terminal"
                meta={activeTerminal?.state}
                actions={
                  <button
                    type="button"
                    className="grid h-7 w-7 place-items-center rounded border border-[#303645] text-zinc-300 transition hover:border-[#4a5265] hover:bg-[#1a1f2b]"
                    title="新建终端"
                    onClick={addTerminal}
                  >
                    <span className="codicon codicon-add text-[14px]" />
                  </button>
                }
              >
                <div className="flex h-full min-h-0 flex-col bg-[#0b0d12]">
                  <div className="flex h-8 shrink-0 items-center gap-1 overflow-x-auto border-b border-[#242832] bg-[#0f1117] px-2">
                    {terminals.map((terminal) => {
                      const active = terminal.id === activeTerminal?.id;

                      return (
                        <button
                          key={terminal.id}
                          type="button"
                          className={[
                            "flex h-6 max-w-36 shrink-0 items-center gap-1.5 rounded px-2 text-xs transition",
                            active
                              ? "bg-[#1f2937] text-zinc-100"
                              : "text-zinc-500 hover:bg-[#171b25] hover:text-zinc-300",
                          ].join(" ")}
                          onClick={() => setActiveTerminalId(terminal.id)}
                        >
                          <span className="codicon codicon-terminal text-[13px]" />
                          <span className="truncate">{terminal.name}</span>
                          {terminals.length > 1 ? (
                            <span
                              role="button"
                              tabIndex={0}
                              className="codicon codicon-close rounded text-[13px] hover:bg-[#303645]"
                              onClick={(event) => {
                                event.stopPropagation();
                                closeTerminal(terminal.id).catch((error) => {
                                  appendLog(
                                    error instanceof Error
                                      ? error.message
                                      : String(error),
                                    terminal.id,
                                  );
                                });
                              }}
                              onKeyDown={(event) => {
                                if (event.key !== "Enter") return;
                                event.stopPropagation();
                                closeTerminal(terminal.id).catch((error) => {
                                  appendLog(
                                    error instanceof Error
                                      ? error.message
                                      : String(error),
                                    terminal.id,
                                  );
                                });
                              }}
                            />
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                  <pre
                    ref={terminalOutputRef}
                    className="min-h-0 flex-1 overflow-auto p-3 font-mono text-xs leading-5 text-[#8ff0b6]"
                  >
                    {activeTerminal?.logs}
                  </pre>
                  <form
                    className="flex h-9 shrink-0 items-center border-t border-[#242832] bg-[#0f1117] px-3 font-mono text-xs"
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (!activeTerminal) return;

                      const command = activeTerminal.input;
                      updateTerminal(activeTerminal.id, { input: "" });
                      runTerminalCommand(command, activeTerminal.id).catch(
                        (error) => {
                          appendLog(
                            error instanceof Error
                              ? error.stack
                              : String(error),
                            activeTerminal.id,
                          );
                          updateTerminal(activeTerminal.id, { state: "ready" });
                        },
                      );
                    }}
                  >
                    <span className="shrink-0 text-[#58a6ff]">
                      {promptText}
                    </span>
                    <input
                      className="ml-2 min-w-0 flex-1 bg-transparent text-zinc-200 outline-none placeholder:text-zinc-700 disabled:cursor-not-allowed disabled:text-zinc-600"
                      autoComplete="off"
                      autoCapitalize="off"
                      spellCheck="false"
                      placeholder={
                        activeTerminal?.ready
                          ? "输入命令，回车执行"
                          : "Pod 启动后可输入命令"
                      }
                      disabled={!activeTerminal?.ready}
                      value={activeTerminal?.input ?? ""}
                      onChange={(event) => {
                        if (!activeTerminal) return;
                        updateTerminal(activeTerminal.id, {
                          input: event.target.value,
                        });
                      }}
                      onKeyDown={(event) => {
                        if (!activeTerminal) return;
                        handleTerminalKeyDown(event, activeTerminal.id);
                      }}
                    />
                  </form>
                </div>
              </Panel>
            </div>

            <div key="response" className="min-h-0">
              <Panel title="Response" meta="/api/status">
                <pre className="h-full overflow-auto bg-[#0b0d12] p-3 font-mono text-xs leading-5 text-zinc-300">
                  {apiResult}
                </pre>
              </Panel>
            </div>
          </GridLayout>
        )}
      </main>
      <FileContextMenu
        menu={fileContextMenu}
        menuRef={fileContextMenuRef}
        onClose={() => setFileContextMenu(null)}
        onCreateFile={createFile}
        onCreateFolder={createFolder}
        onDelete={deleteNode}
        onRename={renameNode}
      />
    </div>
  );
}

createRoot(document.querySelector("#root")).render(<App />);
