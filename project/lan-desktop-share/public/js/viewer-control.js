import {
  encodeControlMessage,
  parseControlChannelMessage,
} from "./control-messages.js";

const CONTROL_KEYS = new Set([
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "Backspace",
  "Delete",
  "End",
  "Enter",
  "Escape",
  "Home",
  "PageDown",
  "PageUp",
  "Tab",
]);
const MAX_MOVE_BUFFER = 16 * 1024;
const MAX_SCROLL_DELTA = 120;
const BLOCKED_INPUT_TYPES = new Set([
  "insertFromDrop",
  "insertFromPaste",
  "insertFromYank",
]);

export class ViewerControlController {
  constructor({
    video,
    textInput,
    documentTarget = globalThis.document,
    windowTarget = globalThis.window,
    requestFrame = (callback) => requestAnimationFrame(callback),
    cancelFrame = (id) => cancelAnimationFrame(id),
    now = () => Date.now(),
    onState = () => {},
  }) {
    this.video = video;
    this.textInput = textInput;
    this.documentTarget = documentTarget;
    this.windowTarget = windowTarget;
    this.requestFrame = requestFrame;
    this.cancelFrame = cancelFrame;
    this.now = now;
    this.onState = onState;
    this.channel = null;
    this.channelListeners = null;
    this.state = "unavailable";
    this.reason = "channel-unavailable";
    this.videoReady = false;
    this.lease = null;
    this.nextSeq = 1;
    this.invalidMessages = 0;
    this.focused = false;
    this.composing = false;
    this.pendingMove = null;
    this.moveFrame = null;
    this.pressedPointers = new Map();
    this.inputListenersAttached = false;
    this.closed = false;

    this.bound = {
      playing: () => this.setVideoReady(true),
      pause: () => this.setVideoReady(false),
      emptied: () => this.setVideoReady(false),
      pointerMove: (event) => this.handlePointerMove(event),
      pointerDown: (event) => this.handlePointerDown(event),
      pointerUp: (event) => this.handlePointerUp(event),
      pointerCancel: (event) => this.handlePointerUp(event),
      contextMenu: (event) => this.handleContextMenu(event),
      wheel: (event) => this.handleWheel(event),
      keyDown: (event) => this.handleKey(event, "down"),
      keyUp: (event) => this.handleKey(event, "up"),
      beforeInput: (event) => this.handleBeforeInput(event),
      blockTransfer: (event) => event.preventDefault(),
      input: () => this.handleTextInput(),
      compositionStart: () => {
        this.composing = true;
      },
      compositionEnd: () => {
        this.composing = false;
      },
      textBlur: () => this.loseFocus(),
      visibilityChange: () => {
        if (this.documentTarget.visibilityState === "hidden") {
          this.end("page-hidden");
        }
      },
      windowBlur: () => this.end("window-blurred"),
    };

    this.video.addEventListener("playing", this.bound.playing);
    this.video.addEventListener("pause", this.bound.pause);
    this.video.addEventListener("emptied", this.bound.emptied);
    if (!this.video.paused && this.video.readyState >= 2)
      this.videoReady = true;
    this.transition("unavailable", this.reason);
  }

  setChannel(channel) {
    if (this.closed || this.channel === channel) return;
    if (this.state === "active" || this.state === "pending") {
      this.end("channel-replaced");
    } else {
      this.resetLease();
    }
    this.detachChannel({ close: false });
    this.channel = channel;
    this.invalidMessages = 0;
    if (!channel) {
      this.resetLease();
      this.transition("unavailable", "channel-unavailable");
      return;
    }

    const open = () => this.updateAvailability();
    const message = (event) => this.handleChannelMessage(event.data);
    const close = () => {
      if (this.channel !== channel) return;
      this.detachChannel({ close: false });
      this.resetLease();
      this.transition("unavailable", "channel-closed");
    };
    channel.addEventListener("open", open);
    channel.addEventListener("message", message);
    channel.addEventListener("close", close, { once: true });
    channel.addEventListener("error", close, { once: true });
    this.channelListeners = { channel, open, message, close };
    this.updateAvailability();
  }

  setVideoReady(ready) {
    if (this.closed) return;
    this.videoReady = ready === true;
    if (!this.videoReady && this.state === "active") {
      this.end("video-unavailable");
      return;
    }
    this.updateAvailability();
  }

  request() {
    if (
      (this.state !== "idle" && this.state !== "revoked") ||
      !this.isAvailable()
    ) {
      return false;
    }
    if (!this.sendMessage({ v: 1, type: "control-request" })) return false;
    this.transition("pending", "waiting-for-host");
    return true;
  }

  cancel() {
    if (this.state !== "pending") return false;
    this.sendMessage({ v: 1, type: "control-cancel" });
    this.resetLease();
    this.updateAvailability();
    return true;
  }

  end(reason = "controller-ended") {
    if (this.state !== "active" && this.state !== "pending") return false;
    if (this.state === "active" && this.focused) this.sendReleaseAll();
    this.sendMessage({ v: 1, type: "control-cancel" });
    this.resetLease();
    if (this.isAvailable()) {
      this.transition("revoked", reason);
    } else {
      this.updateAvailability();
    }
    return true;
  }

  close({ notifyHost = true } = {}) {
    if (this.closed) return;
    if (notifyHost) this.end("viewer-closed");
    this.closed = true;
    this.resetLease();
    this.detachChannel({ close: false });
    this.video.removeEventListener("playing", this.bound.playing);
    this.video.removeEventListener("pause", this.bound.pause);
    this.video.removeEventListener("emptied", this.bound.emptied);
    this.transition("unavailable", "closed");
  }

  handleChannelMessage(raw) {
    let message;
    try {
      message = parseControlChannelMessage(raw);
      this.invalidMessages = Math.max(0, this.invalidMessages - 1);
    } catch {
      this.invalidMessages += 1;
      if (this.invalidMessages >= 3) this.channel?.close();
      return;
    }

    switch (message.type) {
      case "control-pending":
        if (this.state === "pending") {
          this.transition("pending", "waiting-for-host");
        }
        break;
      case "control-granted":
        this.handleGranted(message);
        break;
      case "control-denied":
      case "control-revoked":
        if (this.state === "pending" || this.state === "active") {
          this.resetLease();
          this.transition("revoked", message.reason);
        }
        break;
      default:
        this.invalidMessages += 1;
        if (this.invalidMessages >= 3) this.channel?.close();
    }
  }

  handleGranted(message) {
    if (this.state !== "pending" || !this.isAvailable()) {
      this.sendMessage({ v: 1, type: "control-cancel" });
      return;
    }
    if (message.expiresAt <= this.now()) {
      this.sendMessage({ v: 1, type: "control-cancel" });
      this.resetLease();
      this.transition("revoked", "expired");
      return;
    }
    this.lease = {
      leaseId: message.leaseId,
      expiresAt: message.expiresAt,
    };
    this.nextSeq = 1;
    this.focused = false;
    this.attachInputListeners();
    this.transition("active", "click-video-to-control");
  }

  updateAvailability() {
    if (this.state === "active" || this.state === "pending") return;
    if (this.isAvailable()) {
      this.transition("idle", null);
      return;
    }
    const reason =
      this.channel?.readyState === "open"
        ? "video-unavailable"
        : "channel-unavailable";
    this.transition("unavailable", reason);
  }

  isAvailable() {
    return this.channel?.readyState === "open" && this.videoReady;
  }

  attachInputListeners() {
    if (this.inputListenersAttached) return;
    this.inputListenersAttached = true;
    this.video.addEventListener("pointermove", this.bound.pointerMove);
    this.video.addEventListener("pointerdown", this.bound.pointerDown);
    this.video.addEventListener("pointerup", this.bound.pointerUp);
    this.video.addEventListener("pointercancel", this.bound.pointerCancel);
    this.video.addEventListener("contextmenu", this.bound.contextMenu);
    this.video.addEventListener("wheel", this.bound.wheel, { passive: false });
    this.textInput.addEventListener("keydown", this.bound.keyDown);
    this.textInput.addEventListener("keyup", this.bound.keyUp);
    this.textInput.addEventListener("beforeinput", this.bound.beforeInput);
    this.textInput.addEventListener("paste", this.bound.blockTransfer);
    this.textInput.addEventListener("drop", this.bound.blockTransfer);
    this.textInput.addEventListener("input", this.bound.input);
    this.textInput.addEventListener(
      "compositionstart",
      this.bound.compositionStart,
    );
    this.textInput.addEventListener(
      "compositionend",
      this.bound.compositionEnd,
    );
    this.textInput.addEventListener("blur", this.bound.textBlur);
    this.documentTarget.addEventListener(
      "visibilitychange",
      this.bound.visibilityChange,
    );
    this.windowTarget.addEventListener("blur", this.bound.windowBlur);
  }

  detachInputListeners() {
    if (!this.inputListenersAttached) return;
    this.inputListenersAttached = false;
    this.video.removeEventListener("pointermove", this.bound.pointerMove);
    this.video.removeEventListener("pointerdown", this.bound.pointerDown);
    this.video.removeEventListener("pointerup", this.bound.pointerUp);
    this.video.removeEventListener("pointercancel", this.bound.pointerCancel);
    this.video.removeEventListener("contextmenu", this.bound.contextMenu);
    this.video.removeEventListener("wheel", this.bound.wheel);
    this.textInput.removeEventListener("keydown", this.bound.keyDown);
    this.textInput.removeEventListener("keyup", this.bound.keyUp);
    this.textInput.removeEventListener("beforeinput", this.bound.beforeInput);
    this.textInput.removeEventListener("paste", this.bound.blockTransfer);
    this.textInput.removeEventListener("drop", this.bound.blockTransfer);
    this.textInput.removeEventListener("input", this.bound.input);
    this.textInput.removeEventListener(
      "compositionstart",
      this.bound.compositionStart,
    );
    this.textInput.removeEventListener(
      "compositionend",
      this.bound.compositionEnd,
    );
    this.textInput.removeEventListener("blur", this.bound.textBlur);
    this.documentTarget.removeEventListener(
      "visibilitychange",
      this.bound.visibilityChange,
    );
    this.windowTarget.removeEventListener("blur", this.bound.windowBlur);
  }

  handlePointerMove(event) {
    if (!this.focused) return;
    const point = this.mapPointer(event.clientX, event.clientY);
    if (!point) return;
    this.pendingMove = point;
    if (this.moveFrame !== null) return;
    this.moveFrame = this.requestFrame(() => {
      this.moveFrame = null;
      const latest = this.pendingMove;
      this.pendingMove = null;
      if (!latest || this.channel?.bufferedAmount > MAX_MOVE_BUFFER) return;
      this.sendEvent({ kind: "mouseMove", ...latest });
    });
  }

  handlePointerDown(event) {
    const button = pointerButton(event.button);
    const point = this.mapPointer(event.clientX, event.clientY);
    if (!button || !point || this.state !== "active") return;
    event.preventDefault();
    this.gainFocus();
    this.sendEvent({ kind: "mouseMove", ...point });
    if (!this.sendEvent({ kind: "mouseButton", button, state: "down" })) {
      return;
    }
    this.pressedPointers.set(event.pointerId, button);
    try {
      this.video.setPointerCapture(event.pointerId);
    } catch {
      this.pressedPointers.delete(event.pointerId);
      this.sendEvent({ kind: "mouseButton", button, state: "up" });
    }
  }

  handlePointerUp(event) {
    const button = this.pressedPointers.get(event.pointerId);
    if (!button) return;
    event.preventDefault();
    this.pressedPointers.delete(event.pointerId);
    this.sendEvent({ kind: "mouseButton", button, state: "up" });
    try {
      if (this.video.hasPointerCapture(event.pointerId)) {
        this.video.releasePointerCapture(event.pointerId);
      }
    } catch {
      // Pointer capture may already have been released by the browser.
    }
  }

  handleContextMenu(event) {
    if (
      this.state === "active" &&
      this.focused &&
      this.mapPointer(event.clientX, event.clientY)
    ) {
      event.preventDefault();
    }
  }

  handleWheel(event) {
    if (
      this.state !== "active" ||
      !this.focused ||
      !this.mapPointer(event.clientX, event.clientY)
    ) {
      return;
    }
    const deltaX = clamp(event.deltaX, -MAX_SCROLL_DELTA, MAX_SCROLL_DELTA);
    const deltaY = clamp(event.deltaY, -MAX_SCROLL_DELTA, MAX_SCROLL_DELTA);
    if (deltaX === 0 && deltaY === 0) return;
    event.preventDefault();
    this.sendEvent({ kind: "scroll", deltaX, deltaY });
  }

  handleKey(event, state) {
    if (
      this.state !== "active" ||
      !this.focused ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey ||
      !CONTROL_KEYS.has(event.key) ||
      (state === "down" && event.repeat)
    ) {
      return;
    }
    event.preventDefault();
    this.sendEvent({ kind: "key", key: event.key, state });
  }

  handleBeforeInput(event) {
    if (BLOCKED_INPUT_TYPES.has(event.inputType)) {
      event.preventDefault();
      this.textInput.value = "";
    }
  }

  handleTextInput() {
    if (this.composing || this.state !== "active" || !this.focused) return;
    const value = this.textInput.value;
    this.textInput.value = "";
    if (!value || containsControlCharacter(value)) return;
    const characters = [...value];
    for (let index = 0; index < characters.length; index += 32) {
      this.sendEvent({
        kind: "text",
        text: characters.slice(index, index + 32).join(""),
      });
    }
  }

  gainFocus() {
    if (this.state !== "active") return;
    this.focused = true;
    try {
      this.textInput.focus({ preventScroll: true });
    } catch {
      this.textInput.focus();
    }
    this.transition("active", null);
  }

  loseFocus() {
    if (!this.focused) return;
    this.sendReleaseAll();
    this.focused = false;
    this.cancelPendingMove();
    this.pressedPointers.clear();
    this.transition("active", "click-video-to-control");
  }

  sendReleaseAll() {
    if (!this.lease) return false;
    return this.sendEvent({ kind: "releaseAll" }, { requireFocus: false });
  }

  sendEvent(event, { requireFocus = true } = {}) {
    if (
      event.kind !== "releaseAll" &&
      this.lease &&
      this.lease.expiresAt <= this.now()
    ) {
      this.end("expired");
      return false;
    }
    if (
      this.state !== "active" ||
      !this.lease ||
      (requireFocus && !this.focused) ||
      !Number.isSafeInteger(this.nextSeq)
    ) {
      return false;
    }
    const sent = this.sendMessage({
      v: 1,
      type: "control-input",
      leaseId: this.lease.leaseId,
      seq: this.nextSeq,
      event,
    });
    if (sent) this.nextSeq += 1;
    return sent;
  }

  sendMessage(message) {
    if (this.channel?.readyState !== "open") return false;
    try {
      this.channel.send(encodeControlMessage(message));
      return true;
    } catch {
      return false;
    }
  }

  resetLease() {
    this.cancelPendingMove();
    this.detachInputListeners();
    this.textInput.blur?.();
    this.lease = null;
    this.nextSeq = 1;
    this.focused = false;
    this.composing = false;
    this.pressedPointers.clear();
    this.textInput.value = "";
  }

  cancelPendingMove() {
    if (this.moveFrame !== null) this.cancelFrame(this.moveFrame);
    this.moveFrame = null;
    this.pendingMove = null;
  }

  detachChannel({ close }) {
    const listeners = this.channelListeners;
    if (listeners) {
      listeners.channel.removeEventListener("open", listeners.open);
      listeners.channel.removeEventListener("message", listeners.message);
      listeners.channel.removeEventListener("close", listeners.close);
      listeners.channel.removeEventListener("error", listeners.close);
    }
    const channel = this.channel;
    this.channelListeners = null;
    this.channel = null;
    if (close && channel && channel.readyState !== "closed") channel.close();
  }

  mapPointer(clientX, clientY) {
    const bounds = this.video.getBoundingClientRect();
    const videoWidth = this.video.videoWidth;
    const videoHeight = this.video.videoHeight;
    if (
      bounds.width <= 0 ||
      bounds.height <= 0 ||
      videoWidth <= 0 ||
      videoHeight <= 0
    ) {
      return null;
    }
    const scale = Math.min(
      bounds.width / videoWidth,
      bounds.height / videoHeight,
    );
    const width = videoWidth * scale;
    const height = videoHeight * scale;
    const left = bounds.left + (bounds.width - width) / 2;
    const top = bounds.top + (bounds.height - height) / 2;
    const x = (clientX - left) / width;
    const y = (clientY - top) / height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return null;
    return { x, y };
  }

  transition(state, reason) {
    this.state = state;
    this.reason = reason;
    this.onState({
      state,
      reason,
      focused: this.focused,
      expiresAt: this.lease?.expiresAt ?? null,
    });
  }
}

function pointerButton(button) {
  if (button === 0) return "left";
  if (button === 2) return "right";
  return null;
}

function clamp(value, minimum, maximum) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(maximum, Math.max(minimum, value));
}

function containsControlCharacter(value) {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint < 0x20 || codePoint === 0x7f;
  });
}
