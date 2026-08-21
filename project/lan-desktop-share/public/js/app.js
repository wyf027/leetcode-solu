import { HostControlController } from "./host-control.js";
import { HostSession } from "./host-session.js";
import { buildViewerUrl, createRoomId, parseViewerHash } from "./room-link.js";
import { SignalingClient } from "./signaling-client.js";
import { ViewerControlController } from "./viewer-control.js";
import { ViewerSession } from "./viewer-session.js";

const byId = (id) => document.getElementById(id);
const elements = {
  hostPanel: byId("host-panel"),
  viewerPanel: byId("viewer-panel"),
  startButton: byId("start-button"),
  stopButton: byId("stop-button"),
  copyButton: byId("copy-button"),
  viewerLink: byId("viewer-link"),
  viewerCount: byId("viewer-count"),
  hostVideo: byId("host-video"),
  viewerVideo: byId("viewer-video"),
  viewerControlInput: byId("viewer-control-input"),
  hostStatus: byId("host-status"),
  viewerStatus: byId("viewer-status"),
  retryButton: byId("retry-button"),
  hostControlBanner: byId("host-control-banner"),
  hostControllerLabel: byId("host-controller-label"),
  hostControlCountdown: byId("host-control-countdown"),
  bannerRevokeControlButton: byId("banner-revoke-control-button"),
  hostControlStatus: byId("host-control-status"),
  hostControlIndicator: byId("host-control-indicator"),
  hostControlDetail: byId("host-control-detail"),
  hostDisplayPicker: byId("host-display-picker"),
  hostDisplaySelect: byId("host-display-select"),
  identifyDisplaysButton: byId("identify-displays-button"),
  refreshDisplaysButton: byId("refresh-displays-button"),
  hostControlRequest: byId("host-control-request"),
  hostControlRequester: byId("host-control-requester"),
  allowControlButton: byId("allow-control-button"),
  denyControlButton: byId("deny-control-button"),
  revokeControlButton: byId("revoke-control-button"),
  viewerVideoShell: byId("viewer-video-shell"),
  viewerControlBadge: byId("viewer-control-badge"),
  viewerControlStatus: byId("viewer-control-status"),
  viewerControlDetail: byId("viewer-control-detail"),
  requestControlButton: byId("request-control-button"),
  cancelControlButton: byId("cancel-control-button"),
  endControlButton: byId("end-control-button"),
};

const hostCopy = {
  idle: "等待开始",
  starting: "正在请求屏幕权限",
  sharing: "正在共享",
  stopped: "已停止",
  "permission-denied": "未获得屏幕权限，可重试",
  "connection-error": "连接协商失败",
  "viewer-failed": "一位观看者连接失败",
  "signal-closed": "连接服务已断开",
};
const viewerCopy = {
  connecting: "正在连接",
  "waiting-for-video": "等待分享画面",
  watching: "正在观看",
  reconnecting: "正在重新连接",
  disconnected: "连接已中断",
  "room-unavailable": "链接无效或分享尚未开始",
  ended: "分享已结束",
};
const socketProtocol = location.protocol === "https:" ? "wss:" : "ws:";
const socketUrl = `${socketProtocol}//${location.host}`;
const hostControlReasonCopy = {
  "accessibility-denied":
    "请在“系统设置 → 隐私与安全性 → 辅助功能”中允许终端或 Node，然后重启服务。",
  "checking-capture-type": "正在确认你共享的是整个显示器。",
  "checking-control-environment":
    "正在检查本机助手、辅助功能权限和显示器数量。",
  "control-request-rejected":
    "控制请求未通过本机安全校验，请从 localhost 打开分享端。",
  "display-configuration-changed":
    "显示器连接、分辨率、排列或镜像状态已变化，本次控制已停止。请重新检测并绑定屏幕。",
  "display-identification-required":
    "检测到多个屏幕。请先点击“显示屏幕编号”，再选择共享预览中的编号。",
  "display-selection-invalid": "选择的屏幕已不可用，请重新检测显示器。",
  "display-selection-required":
    "屏幕编号已经显示，请选择当前正在共享的那一块。",
  "display-unavailable": "无法读取主显示器，请停止共享后重试。",
  "helper-missing":
    "本机控制助手尚未构建，请在终端运行 npm run control:build。",
  "helper-unavailable": "本机控制助手无法启动，请重新构建并重启服务。",
  "host-must-use-localhost":
    "请从 localhost 打开分享端；局域网地址只能用于观看。",
  "host-page-hidden": "分享端页面进入后台，本次控制已自动停止。",
  "identifying-displays":
    "每块屏幕会显示编号 6 秒，请在共享预览中确认对应编号。",
  "not-started": "开始整屏共享后检查本机权限。每次控制都需要你批准。",
  "signal-closed": "本机信令连接已断开；视频停止后可重新开始。",
  "unsupported-platform": "远程控制助手目前只支持 macOS；视频观看不受影响。",
  "whole-screen-required":
    "当前不是整屏共享。重新开始并选择“整个屏幕”才能允许控制。",
};
const viewerControlReasonCopy = {
  "channel-closed": "控制通道已断开，视频仍可继续观看。",
  "channel-unavailable": "正在建立控制通道；视频连接后可申请控制。",
  "click-video-to-control": "已获授权，点击远程画面后开始发送鼠标和键盘输入。",
  "control-busy": "当前已有其他观看者正在控制，请稍后再试。",
  "controller-ended": "你已结束本次控制，可再次发起申请。",
  "controller-cancelled": "你已取消本次控制申请。",
  expired: "10 分钟授权已到期，可再次发起申请。",
  "host-denied": "分享者拒绝了本次申请。",
  "host-page-hidden": "分享端页面进入后台，本次控制未继续。",
  "host-revoked": "分享者已停止本次控制。",
  "page-hidden": "页面离开前台，本次控制已自动结束。",
  "video-unavailable": "等待远程视频开始播放。",
  "viewer-left": "控制连接已断开。",
  "waiting-for-host": "申请已送达，等待分享者确认。",
  "window-blurred": "浏览器失去焦点，本次控制已自动结束。",
};

function formatCountdown(expiresAt) {
  const remaining = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
  const minutes = Math.floor(remaining / 60);
  const seconds = String(remaining % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function showHost() {
  elements.hostPanel.hidden = false;
  elements.viewerPanel.hidden = true;
}

function showViewer() {
  elements.hostPanel.hidden = true;
  elements.viewerPanel.hidden = false;
}

async function runHost() {
  showHost();
  elements.hostStatus.textContent = hostCopy.idle;

  if (!navigator.mediaDevices?.getDisplayMedia) {
    elements.hostStatus.textContent =
      "浏览器不支持屏幕共享，请改用最新版 Chrome 或 Edge";
    elements.startButton.disabled = true;
    return;
  }

  const roomId = createRoomId();
  const response = await fetch("/api/network-info", { cache: "no-store" });
  if (!response.ok) throw new Error("Network information unavailable");
  const { addresses, port } = await response.json();
  const address = addresses[0];
  let session = null;
  let signal = null;
  let control = null;
  let sharing = false;
  let controlCountdownTimer = null;
  let viewerSequence = 0;
  const viewerLabels = new Map();

  const viewerLabel = (viewerId) => {
    if (!viewerId) return "一位观看者";
    if (!viewerLabels.has(viewerId)) {
      viewerSequence += 1;
      viewerLabels.set(viewerId, `观看者 #${viewerSequence}`);
    }
    return viewerLabels.get(viewerId);
  };

  const stopControlCountdown = () => {
    if (controlCountdownTimer !== null) {
      clearInterval(controlCountdownTimer);
      controlCountdownTimer = null;
    }
  };

  const renderHostControl = ({
    state,
    reason,
    viewerId,
    expiresAt,
    displays = [],
    selectedDisplayId,
    environmentAvailable = false,
    bindingReady = false,
  }) => {
    stopControlCountdown();
    const checking =
      reason === "checking-capture-type" ||
      reason === "checking-control-environment" ||
      reason === "identifying-displays";
    const selectedDisplay = displays.find(
      (display) => display.id === selectedDisplayId,
    );
    const titles = {
      unavailable:
        reason === "display-identification-required"
          ? "先识别共享屏幕"
          : reason === "display-selection-required"
            ? "请选择共享屏幕"
            : reason === "identifying-displays"
              ? "正在显示屏幕编号"
              : checking
                ? "正在检查控制环境"
                : "控制当前不可用",
      idle: "可以接收控制申请",
      requested: "收到控制申请",
      granting: "正在启动安全控制",
      active: `${viewerLabel(viewerId)} 正在控制`,
      revoking: "正在停止控制",
    };
    elements.hostControlStatus.textContent = titles[state] ?? "控制状态已更新";
    elements.hostControlDetail.textContent =
      state === "idle"
        ? `已绑定屏幕 ${selectedDisplay?.ordinal ?? ""}。观看者申请后仍需你在此批准。`
        : state === "requested"
          ? "确认对方身份后再允许；授权最多持续 10 分钟。"
          : state === "granting"
            ? "正在启动本机助手，完成前不会接受任何输入。"
            : state === "active"
              ? "红色提示持续显示。你可以随时立即停止控制。"
              : state === "revoking"
                ? "正在释放所有按键与鼠标按钮并关闭本机助手。"
                : (hostControlReasonCopy[reason] ??
                  "控制不可用，但视频共享仍可继续。");

    const showDisplayPicker = displays.length > 1;
    elements.hostDisplayPicker.hidden = !showDisplayPicker;
    const currentOptions = [...elements.hostDisplaySelect.options].map(
      (option) => option.value,
    );
    const nextOptions = ["", ...displays.map((display) => display.id)];
    if (currentOptions.join("|") !== nextOptions.join("|")) {
      elements.hostDisplaySelect.replaceChildren();
      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = "请选择共享中的屏幕";
      elements.hostDisplaySelect.append(placeholder);
      for (const display of displays) {
        const option = document.createElement("option");
        option.value = display.id;
        option.textContent = `屏幕 ${display.ordinal} · ${display.name} · ${display.width}×${display.height}${display.isMain ? " · 主屏幕" : ""}`;
        elements.hostDisplaySelect.append(option);
      }
    }
    elements.hostDisplaySelect.value = selectedDisplayId ?? "";
    const displaySelectionLocked =
      state === "requested" ||
      state === "granting" ||
      state === "active" ||
      state === "revoking" ||
      reason === "identifying-displays" ||
      reason === "checking-control-environment";
    elements.hostDisplaySelect.disabled =
      !bindingReady || displaySelectionLocked;
    elements.identifyDisplaysButton.disabled =
      displays.length < 2 || !environmentAvailable || displaySelectionLocked;
    elements.refreshDisplaysButton.disabled = displaySelectionLocked;
    elements.hostControlIndicator.className =
      state === "active"
        ? "mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-[#ff8d80] shadow-[0_0_12px_#ff8d80]"
        : state === "idle"
          ? "mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-[#31d2c5] shadow-[0_0_12px_#31d2c5]"
          : checking || state === "requested" || state === "granting"
            ? "mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-[#f0c36b]"
            : "mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-[#66828c]";

    const requestVisible = state === "requested";
    elements.hostControlRequest.hidden = !requestVisible;
    elements.hostControlRequester.textContent = viewerLabel(viewerId);
    elements.allowControlButton.disabled = !requestVisible;
    elements.denyControlButton.disabled = !requestVisible;
    elements.revokeControlButton.hidden = state !== "active";
    elements.hostControlBanner.hidden = state !== "active";
    if (state === "active") {
      elements.hostControllerLabel.textContent = viewerLabel(viewerId);
      const updateCountdown = () => {
        elements.hostControlCountdown.textContent = `剩余 ${formatCountdown(expiresAt)}`;
      };
      updateCountdown();
      controlCountdownTimer = setInterval(updateCountdown, 1000);
    }
  };

  renderHostControl({ state: "unavailable", reason: "not-started" });

  if (address) {
    elements.viewerLink.value = buildViewerUrl({
      protocol: location.protocol,
      address,
      port: String(port),
      roomId,
    });
  } else {
    elements.hostStatus.textContent = "未找到局域网地址，请检查网络设置";
  }

  const resetControls = () => {
    sharing = false;
    elements.startButton.disabled = false;
    elements.stopButton.disabled = true;
    elements.copyButton.disabled = true;
  };

  elements.allowControlButton.addEventListener("click", () => {
    control?.approve();
  });
  elements.denyControlButton.addEventListener("click", () => {
    control?.deny();
  });
  elements.hostDisplaySelect.addEventListener("change", () => {
    control?.selectDisplay(elements.hostDisplaySelect.value);
  });
  elements.identifyDisplaysButton.addEventListener("click", () => {
    control?.identifyDisplays();
  });
  elements.refreshDisplaysButton.addEventListener("click", () => {
    control?.refreshDisplays();
  });
  const revokeControl = () => control?.revoke("host-revoked");
  elements.revokeControlButton.addEventListener("click", revokeControl);
  elements.bannerRevokeControlButton.addEventListener("click", revokeControl);

  elements.startButton.addEventListener("click", async () => {
    elements.startButton.disabled = true;
    elements.hostStatus.textContent = hostCopy.starting;
    try {
      signal = new SignalingClient({ url: socketUrl });
      await signal.connect();
      control = new HostControlController({
        signal,
        onState: renderHostControl,
      });
      control.start(roomId);
      session = new HostSession({
        signal,
        onPreview: (stream) => {
          elements.hostVideo.srcObject = stream;
        },
        onViewerCount: (count) => {
          elements.viewerCount.textContent = String(count);
        },
        onControlChannel: ({ viewerId, channel }) => {
          viewerLabel(viewerId);
          control?.registerViewer(viewerId, channel);
        },
        onControlChannelClosed: (viewerId) => {
          control?.unregisterViewer(viewerId, { reason: "channel-closed" });
        },
        onViewerLeft: (viewerId) => {
          control?.unregisterViewer(viewerId, { reason: "viewer-left" });
          viewerLabels.delete(viewerId);
        },
        onState: (state) => {
          elements.hostStatus.textContent = hostCopy[state] ?? "状态已更新";
          if (state === "stopped") {
            control?.close({ reason: "share-ended" });
            resetControls();
            signal?.close();
          }
        },
      });
      await session.start(roomId);
      const displaySurface = session.stream
        ?.getVideoTracks()[0]
        ?.getSettings?.().displaySurface;
      control.updateDisplaySurface(displaySurface);
      sharing = true;
      elements.stopButton.disabled = false;
      elements.copyButton.disabled = !address;
    } catch {
      control?.close({ reason: "start-failed" });
      signal?.close();
      session = null;
      signal = null;
      control = null;
      if (elements.hostStatus.textContent === hostCopy.starting) {
        elements.hostStatus.textContent = "无法连接本机共享服务";
      }
      resetControls();
    }
  });

  elements.stopButton.addEventListener("click", () => {
    control?.close({ reason: "share-ended" });
    stopControlCountdown();
    session?.stop();
    signal?.close();
    session = null;
    signal = null;
    control = null;
    resetControls();
  });

  elements.copyButton.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(elements.viewerLink.value);
      elements.hostStatus.textContent = "链接已复制";
    } catch {
      elements.hostStatus.textContent = "复制失败，请手动复制";
    }
  });

  addEventListener("beforeunload", (event) => {
    if (!sharing) return;
    event.preventDefault();
    event.returnValue = "";
  });
  addEventListener("pagehide", () => session?.stop());
}

async function runViewer(roomId) {
  showViewer();
  let signal = null;
  let session = null;
  let control = null;
  let reconnects = 0;
  let ended = false;
  let timer = null;

  const closeCurrent = () => {
    control?.close();
    session?.close({ state: null });
    signal?.close();
    control = null;
    session = null;
    signal = null;
  };

  const desktopControlSupported =
    globalThis.matchMedia?.("(min-width: 768px) and (pointer: fine)").matches ??
    false;
  const renderViewerControl = ({ state, reason, focused }) => {
    const active = state === "active";
    elements.viewerVideoShell.classList.toggle("ring-2", active && focused);
    elements.viewerVideoShell.classList.toggle("ring-inset", active && focused);
    elements.viewerVideoShell.classList.toggle(
      "ring-[#ff8d80]",
      active && focused,
    );
    elements.viewerVideo.classList.toggle("cursor-crosshair", active);
    elements.viewerVideo.classList.toggle("select-none", active);
    elements.viewerVideo.classList.toggle("touch-none", active);
    elements.viewerControlBadge.hidden = !active;
    if (active) {
      elements.viewerControlBadge.textContent = focused
        ? "正在控制 · Esc 等按键会发送到远程电脑"
        : "已授权 · 点击画面开始控制";
    }

    if (!desktopControlSupported) {
      elements.viewerControlStatus.textContent = "当前设备仅观看画面";
      elements.viewerControlDetail.textContent =
        "远程控制需要带鼠标和键盘的桌面版 Chrome 或 Edge。";
      elements.requestControlButton.hidden = true;
      elements.cancelControlButton.hidden = true;
      elements.endControlButton.hidden = true;
      return;
    }

    const requestAvailable = state === "idle" || state === "revoked";
    elements.requestControlButton.hidden = !requestAvailable;
    elements.cancelControlButton.hidden = state !== "pending";
    elements.endControlButton.hidden = !active;
    const titles = {
      unavailable: "控制通道暂不可用",
      idle: "可以申请远程控制",
      pending: "等待分享者批准",
      active: focused ? "正在控制远程电脑" : "控制已授权",
      revoked: "本次控制已结束",
    };
    elements.viewerControlStatus.textContent =
      titles[state] ?? "控制状态已更新";
    elements.viewerControlDetail.textContent =
      state === "idle"
        ? "申请后仍需分享者在本机明确批准，授权最长 10 分钟。"
        : state === "active" && focused
          ? "鼠标和白名单键盘输入正在发送；系统快捷键和剪贴板不会发送。"
          : (viewerControlReasonCopy[reason] ??
            "视频观看保持可用，控制状态可单独恢复。");
  };

  renderViewerControl({
    state: "unavailable",
    reason: "channel-unavailable",
    focused: false,
  });
  elements.requestControlButton.addEventListener("click", () => {
    if (desktopControlSupported) control?.request();
  });
  elements.cancelControlButton.addEventListener("click", () => {
    control?.cancel();
  });
  elements.endControlButton.addEventListener("click", () => {
    control?.end();
  });

  const showRetry = ({ preserveStatus = false } = {}) => {
    if (!ended && !preserveStatus)
      elements.viewerStatus.textContent = viewerCopy.disconnected;
    elements.retryButton.hidden = false;
    elements.retryButton.textContent = "重新连接";
  };

  const connect = async () => {
    clearTimeout(timer);
    elements.viewerStatus.textContent = viewerCopy.connecting;
    elements.retryButton.hidden = true;
    signal = new SignalingClient({ url: socketUrl });
    await signal.connect();
    control = new ViewerControlController({
      video: elements.viewerVideo,
      textInput: elements.viewerControlInput,
      onState: renderViewerControl,
    });
    session = new ViewerSession({
      signal,
      onStream: (stream) => {
        elements.viewerVideo.srcObject = stream;
        if (!stream) control?.setVideoReady(false);
        if (!stream) return;
        elements.viewerVideo.play().catch(() => {
          elements.retryButton.hidden = false;
          elements.retryButton.textContent = "点击播放";
        });
      },
      onControlChannel: (channel) => {
        control?.setChannel(channel);
      },
      onControlChannelClosed: () => {
        control?.setChannel(null);
      },
      onState: (state) => {
        elements.viewerStatus.textContent = viewerCopy[state] ?? "状态已更新";
        if (state === "ended") {
          ended = true;
          clearTimeout(timer);
          elements.retryButton.hidden = true;
          return;
        }
        if ((state === "disconnected" || state === "reconnecting") && !ended) {
          if (reconnects < 1) {
            reconnects += 1;
            timer = setTimeout(() => {
              closeCurrent();
              void connect().catch(showRetry);
            }, 1000);
          } else {
            showRetry();
          }
        }
        if (state === "room-unavailable") showRetry({ preserveStatus: true });
      },
    });
    session.join(roomId);
  };

  elements.retryButton.addEventListener("click", async () => {
    if (elements.viewerVideo.srcObject && elements.viewerVideo.paused) {
      await elements.viewerVideo.play();
      elements.retryButton.hidden = true;
      return;
    }
    reconnects = 0;
    ended = false;
    elements.retryButton.hidden = true;
    closeCurrent();
    await connect().catch(showRetry);
  });

  await connect().catch(showRetry);
  addEventListener("pagehide", closeCurrent, { once: true });
}

async function main() {
  const viewer = parseViewerHash(location.hash);
  const hashRole = new URLSearchParams(location.hash.replace(/^#/, "")).get(
    "role",
  );
  if (viewer) {
    await runViewer(viewer.roomId);
    return;
  }
  if (hashRole === "viewer") {
    showViewer();
    elements.viewerStatus.textContent = "观看链接无效";
    return;
  }
  await runHost();
}

main().catch(() => {
  const status = parseViewerHash(location.hash)
    ? elements.viewerStatus
    : elements.hostStatus;
  status.textContent = "页面初始化失败，请刷新后重试";
});
