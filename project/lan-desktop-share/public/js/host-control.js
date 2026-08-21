import {
  encodeControlMessage,
  parseControlChannelMessage,
} from "./control-messages.js";

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const UUID_PATTERN =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const TRANSIENT_ACTIVE_ERRORS = new Set(["rate-limited"]);
const CAPABILITY_ERRORS = new Set([
  "accessibility-denied",
  "display-configuration-changed",
  "display-selection-invalid",
  "display-unavailable",
  "helper-missing",
  "helper-unavailable",
  "unsupported-platform",
]);

export class HostControlController {
  constructor({
    signal,
    hostname = globalThis.location?.hostname ?? "",
    documentTarget = globalThis.document,
    now = () => Date.now(),
    setTimer = setTimeout,
    clearTimer = clearTimeout,
    onState = () => {},
  }) {
    this.signal = signal;
    this.hostname = hostname;
    this.documentTarget = documentTarget;
    this.now = now;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.onState = onState;
    this.roomId = null;
    this.state = "unavailable";
    this.reason = "not-started";
    this.environmentAvailable = false;
    this.capabilitiesAvailable = false;
    this.displays = [];
    this.selectedDisplayId = null;
    this.bindingId = null;
    this.pendingEnvironmentRequestId = null;
    this.channels = new Map();
    this.pendingViewerId = null;
    this.active = null;
    this.expiryTimer = null;
    this.unsubscribeSignal = null;
    this.cancelAfterStart = false;
    this.handleVisibilityChange = () => {
      if (this.documentTarget?.visibilityState !== "hidden") return;
      if (this.state === "requested") {
        this.deny(this.pendingViewerId, "host-page-hidden");
      } else if (this.state === "granting" || this.state === "active") {
        this.revoke("host-page-hidden");
      }
    };
  }

  start(roomId) {
    this.close({ notifyNode: false, reason: "restarted" });
    this.roomId = roomId;
    this.unsubscribeSignal = this.signal.subscribe((message) => {
      this.handleSignal(message);
    });
    this.documentTarget?.addEventListener(
      "visibilitychange",
      this.handleVisibilityChange,
    );
    this.transition("unavailable", "checking-capture-type");
  }

  updateDisplaySurface(displaySurface) {
    if (!this.roomId) return;
    if (!LOCAL_HOSTNAMES.has(this.hostname)) {
      this.setCapabilities(false, "host-must-use-localhost");
      return;
    }
    if (displaySurface !== "monitor") {
      this.setCapabilities(false, "whole-screen-required");
      return;
    }

    this.setCapabilities(false, "checking-control-environment");
    this.probeDisplays();
  }

  refreshDisplays() {
    if (!this.roomId) return false;
    this.setCapabilities(false, "checking-control-environment");
    return this.probeDisplays();
  }

  identifyDisplays() {
    if (
      !this.roomId ||
      !this.environmentAvailable ||
      this.displays.length < 2 ||
      this.active ||
      this.pendingViewerId
    ) {
      return false;
    }
    this.bindingId = null;
    this.selectedDisplayId = null;
    this.capabilitiesAvailable = false;
    const requestId = globalThis.crypto.randomUUID();
    this.pendingEnvironmentRequestId = requestId;
    this.transition("unavailable", "identifying-displays");
    try {
      this.signal.send({
        v: 1,
        type: "control-identify",
        roomId: this.roomId,
        requestId,
      });
      return true;
    } catch {
      this.setCapabilities(false, "signal-closed");
      return false;
    }
  }

  selectDisplay(displayId) {
    if (
      !this.environmentAvailable ||
      !this.bindingId ||
      this.active ||
      this.pendingViewerId ||
      !this.displays.some((display) => display.id === displayId)
    ) {
      return false;
    }
    this.selectedDisplayId = displayId;
    this.setCapabilities(true, null);
    return true;
  }

  registerViewer(viewerId, channel) {
    this.unregisterViewer(viewerId, { reason: "channel-replaced" });
    const onMessage = (event) =>
      this.handleChannelMessage(viewerId, event.data);
    const onClose = () =>
      this.unregisterViewer(viewerId, { reason: "channel-closed" });
    channel.addEventListener("message", onMessage);
    channel.addEventListener("close", onClose, { once: true });
    channel.addEventListener("error", onClose, { once: true });
    this.channels.set(viewerId, {
      channel,
      invalidMessages: 0,
      onMessage,
      onClose,
    });
  }

  unregisterViewer(viewerId, { reason = "viewer-left" } = {}) {
    const entry = this.channels.get(viewerId);
    if (entry) {
      entry.channel.removeEventListener?.("message", entry.onMessage);
      entry.channel.removeEventListener?.("close", entry.onClose);
      entry.channel.removeEventListener?.("error", entry.onClose);
      this.channels.delete(viewerId);
    }

    if (this.pendingViewerId === viewerId) {
      this.pendingViewerId = null;
      this.cancelAfterStart = false;
      this.transitionAfterLease();
    }
    if (this.active?.viewerId === viewerId) this.revoke(reason);
  }

  approve(viewerId = this.pendingViewerId) {
    if (
      this.state !== "requested" ||
      !this.capabilitiesAvailable ||
      !this.selectedDisplayId ||
      !this.bindingId ||
      !viewerId ||
      viewerId !== this.pendingViewerId ||
      !this.channels.has(viewerId)
    ) {
      return false;
    }

    this.cancelAfterStart = false;
    this.transition("granting", null, { viewerId });
    try {
      this.signal.send({
        v: 1,
        type: "control-start",
        roomId: this.roomId,
        viewerId,
        displayId: this.selectedDisplayId,
        bindingId: this.bindingId,
      });
      return true;
    } catch {
      this.sendToViewer(viewerId, {
        v: 1,
        type: "control-denied",
        reason: "signal-closed",
      });
      this.pendingViewerId = null;
      this.setCapabilities(false, "signal-closed");
      return false;
    }
  }

  deny(viewerId = this.pendingViewerId, reason = "host-denied") {
    if (!viewerId || viewerId !== this.pendingViewerId) return false;
    this.sendToViewer(viewerId, {
      v: 1,
      type: "control-denied",
      reason,
    });
    this.pendingViewerId = null;
    this.cancelAfterStart = false;
    this.transitionAfterLease();
    return true;
  }

  revoke(reason = "host-revoked") {
    if (this.state === "revoking") return false;
    if (this.state === "granting" && this.pendingViewerId) {
      this.cancelAfterStart = true;
      this.sendToViewer(this.pendingViewerId, {
        v: 1,
        type: "control-revoked",
        reason,
      });
      this.transition("revoking", reason, {
        viewerId: this.pendingViewerId,
      });
      return true;
    }
    if (!this.active) return false;

    const lease = this.active;
    this.clearExpiryTimer();
    this.sendToViewer(lease.viewerId, {
      v: 1,
      type: "control-revoked",
      reason,
    });
    this.transition("revoking", reason, {
      viewerId: lease.viewerId,
      expiresAt: lease.expiresAt,
    });
    try {
      this.signal.send({
        v: 1,
        type: "control-stop",
        roomId: this.roomId,
        viewerId: lease.viewerId,
        leaseId: lease.leaseId,
      });
    } catch {
      this.finishLease(reason);
    }
    return true;
  }

  close({ notifyNode = true, reason = "share-ended" } = {}) {
    if (notifyNode) this.revoke(reason);
    this.clearExpiryTimer();
    this.unsubscribeSignal?.();
    this.unsubscribeSignal = null;
    this.documentTarget?.removeEventListener(
      "visibilitychange",
      this.handleVisibilityChange,
    );
    for (const [viewerId, entry] of this.channels) {
      entry.channel.removeEventListener?.("message", entry.onMessage);
      entry.channel.removeEventListener?.("close", entry.onClose);
      entry.channel.removeEventListener?.("error", entry.onClose);
      this.channels.delete(viewerId);
    }
    this.roomId = null;
    this.pendingViewerId = null;
    this.active = null;
    this.cancelAfterStart = false;
    this.environmentAvailable = false;
    this.capabilitiesAvailable = false;
    this.displays = [];
    this.selectedDisplayId = null;
    this.bindingId = null;
    this.pendingEnvironmentRequestId = null;
    this.transition("unavailable", "not-started");
  }

  handleChannelMessage(viewerId, raw) {
    const entry = this.channels.get(viewerId);
    if (!entry) return;

    let message;
    try {
      message = parseControlChannelMessage(raw);
      entry.invalidMessages = Math.max(0, entry.invalidMessages - 1);
    } catch {
      entry.invalidMessages += 1;
      if (entry.invalidMessages >= 3) {
        this.sendToViewer(viewerId, {
          v: 1,
          type: "control-denied",
          reason: "invalid-control-message",
        });
        entry.channel.close();
      }
      return;
    }

    if (message.type === "control-request") {
      this.handleRequest(viewerId);
      return;
    }
    if (message.type === "control-cancel") {
      if (this.pendingViewerId === viewerId) {
        if (this.state === "granting" || this.state === "revoking") {
          this.revoke("controller-cancelled");
        } else {
          this.pendingViewerId = null;
          this.transitionAfterLease();
        }
      }
      if (this.active?.viewerId === viewerId) {
        this.revoke("controller-ended");
      }
      return;
    }
    if (message.type === "control-input") {
      this.forwardInput(viewerId, message);
    }
  }

  handleRequest(viewerId) {
    if (!this.capabilitiesAvailable) {
      this.sendToViewer(viewerId, {
        v: 1,
        type: "control-denied",
        reason: this.reason ?? "control-unavailable",
      });
      return;
    }
    if (this.active || this.pendingViewerId) {
      if (this.pendingViewerId === viewerId && this.state === "requested") {
        this.sendToViewer(viewerId, { v: 1, type: "control-pending" });
        return;
      }
      this.sendToViewer(viewerId, {
        v: 1,
        type: "control-denied",
        reason: "control-busy",
      });
      return;
    }

    this.pendingViewerId = viewerId;
    this.sendToViewer(viewerId, { v: 1, type: "control-pending" });
    this.transition("requested", null, { viewerId });
  }

  forwardInput(viewerId, message) {
    if (
      this.state !== "active" ||
      !this.active ||
      this.active.viewerId !== viewerId ||
      this.active.leaseId !== message.leaseId ||
      message.seq <= this.active.lastSeq
    ) {
      return;
    }
    this.active.lastSeq = message.seq;
    try {
      this.signal.send({
        v: 1,
        type: "control-event",
        roomId: this.roomId,
        viewerId,
        leaseId: message.leaseId,
        seq: message.seq,
        event: message.event,
      });
    } catch {
      this.finishLease("signal-closed");
    }
  }

  handleSignal(message) {
    if (message.roomId && message.roomId !== this.roomId) return;
    switch (message.type) {
      case "control-capabilities":
        if (message.requestId !== this.pendingEnvironmentRequestId) return;
        this.pendingEnvironmentRequestId = null;
        this.applyEnvironment(message);
        break;
      case "control-identified":
        if (message.requestId !== this.pendingEnvironmentRequestId) return;
        this.pendingEnvironmentRequestId = null;
        this.applyEnvironment(
          {
            available: true,
            displays: message.displays,
            bindingId: message.bindingId,
          },
          { forceSelection: true },
        );
        break;
      case "control-started":
        this.handleStarted(message);
        break;
      case "control-stopped":
        if (!this.active || message.leaseId !== this.active.leaseId) return;
        this.finishLease(message.reason ?? "revoked", {
          capabilityLost: CAPABILITY_ERRORS.has(message.reason),
        });
        break;
      case "control-error":
        if (
          message.requestId &&
          message.requestId !== this.pendingEnvironmentRequestId
        ) {
          return;
        }
        if (message.requestId) this.pendingEnvironmentRequestId = null;
        this.handleControlError(message.reason ?? "control-unavailable");
        break;
      case "signal-closed":
        this.finishLease("signal-closed", { capabilityLost: true });
        break;
    }
  }

  handleStarted(message) {
    if (
      message.viewerId !== this.pendingViewerId ||
      (this.state !== "granting" && this.state !== "revoking")
    ) {
      return;
    }
    this.active = {
      viewerId: message.viewerId,
      leaseId: message.leaseId,
      expiresAt: message.expiresAt,
      lastSeq: 0,
    };

    if (this.cancelAfterStart) {
      this.cancelAfterStart = false;
      this.revoke("controller-cancelled");
      return;
    }

    this.pendingViewerId = null;
    this.sendToViewer(message.viewerId, {
      v: 1,
      type: "control-granted",
      leaseId: message.leaseId,
      expiresAt: message.expiresAt,
    });
    this.transition("active", null, {
      viewerId: message.viewerId,
      expiresAt: message.expiresAt,
    });
    this.clearExpiryTimer();
    this.expiryTimer = this.setTimer(
      () => this.revoke("expired"),
      Math.max(0, message.expiresAt - this.now()),
    );
  }

  handleControlError(reason) {
    if (this.state === "active" && TRANSIENT_ACTIVE_ERRORS.has(reason)) return;

    const capabilityLost = CAPABILITY_ERRORS.has(reason);
    if (this.active) {
      this.finishLease(reason, { capabilityLost });
      return;
    }

    if (this.pendingViewerId) {
      if (this.state !== "revoking") {
        this.sendToViewer(this.pendingViewerId, {
          v: 1,
          type: "control-denied",
          reason,
        });
      }
      this.clearExpiryTimer();
      this.pendingViewerId = null;
      this.cancelAfterStart = false;
      if (capabilityLost) {
        this.setCapabilities(false, reason);
      } else {
        this.transitionAfterLease();
      }
      return;
    }

    this.setCapabilities(false, reason);
  }

  finishLease(reason, { capabilityLost = false } = {}) {
    const viewerId = this.active?.viewerId ?? this.pendingViewerId;
    if (viewerId && this.state !== "revoking") {
      this.sendToViewer(viewerId, {
        v: 1,
        type: "control-revoked",
        reason,
      });
    }
    this.clearExpiryTimer();
    this.active = null;
    this.pendingViewerId = null;
    this.cancelAfterStart = false;
    if (capabilityLost) {
      this.setCapabilities(false, reason);
    } else {
      this.transitionAfterLease();
    }
  }

  transitionAfterLease() {
    if (this.capabilitiesAvailable) {
      this.transition("idle", null);
    } else {
      this.transition("unavailable", this.reason ?? "control-unavailable");
    }
  }

  applyEnvironment(message, { forceSelection = false } = {}) {
    const displays = normalizeDisplays(message.displays);
    const bindingId = normalizeBindingId(message.bindingId);
    this.environmentAvailable =
      message.available === true && displays.length > 0;
    this.displays = displays;
    this.bindingId = bindingId;
    if (!this.environmentAvailable) {
      this.selectedDisplayId = null;
      this.setCapabilities(false, message.reason ?? "control-unavailable");
      return;
    }

    if (displays.length > 1 && !bindingId) {
      this.selectedDisplayId = null;
      this.setCapabilities(false, "display-identification-required");
      return;
    }
    if (
      forceSelection ||
      !displays.some((display) => display.id === this.selectedDisplayId)
    ) {
      this.selectedDisplayId = displays.length === 1 ? displays[0].id : null;
    }
    if (!this.selectedDisplayId) {
      this.setCapabilities(false, "display-selection-required");
      return;
    }
    this.setCapabilities(true, null);
  }

  setCapabilities(available, reason) {
    if (!available && CAPABILITY_ERRORS.has(reason)) {
      this.environmentAvailable = false;
      this.selectedDisplayId = null;
      this.bindingId = null;
    }
    this.capabilitiesAvailable = available;
    this.reason = reason;
    if (!available && (this.active || this.pendingViewerId)) {
      this.finishLease(reason ?? "control-unavailable", {
        capabilityLost: false,
      });
      return;
    }
    this.transitionAfterLease();
  }

  sendToViewer(viewerId, message) {
    const channel = this.channels.get(viewerId)?.channel;
    if (!channel || channel.readyState !== "open") return false;
    try {
      channel.send(encodeControlMessage(message));
      return true;
    } catch {
      return false;
    }
  }

  clearExpiryTimer() {
    if (this.expiryTimer !== null) this.clearTimer(this.expiryTimer);
    this.expiryTimer = null;
  }

  transition(state, reason, detail = {}) {
    this.state = state;
    this.reason = reason;
    this.onState({
      state,
      reason,
      capabilitiesAvailable: this.capabilitiesAvailable,
      viewerId:
        detail.viewerId ?? this.active?.viewerId ?? this.pendingViewerId,
      expiresAt: detail.expiresAt ?? this.active?.expiresAt ?? null,
      displays: this.displays,
      selectedDisplayId: this.selectedDisplayId,
      environmentAvailable: this.environmentAvailable,
      bindingReady: Boolean(this.bindingId),
    });
  }

  probeDisplays() {
    this.bindingId = null;
    this.selectedDisplayId = null;
    const requestId = globalThis.crypto.randomUUID();
    this.pendingEnvironmentRequestId = requestId;
    try {
      this.signal.send({
        v: 1,
        type: "control-probe",
        roomId: this.roomId,
        requestId,
      });
      return true;
    } catch {
      this.setCapabilities(false, "signal-closed");
      return false;
    }
  }
}

function normalizeDisplays(value) {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (display) =>
      display &&
      typeof display.id === "string" &&
      Number.isSafeInteger(display.ordinal) &&
      typeof display.name === "string" &&
      Number.isSafeInteger(display.width) &&
      Number.isSafeInteger(display.height) &&
      typeof display.isMain === "boolean",
  );
}

function normalizeBindingId(value) {
  return typeof value === "string" && UUID_PATTERN.test(value) ? value : null;
}
