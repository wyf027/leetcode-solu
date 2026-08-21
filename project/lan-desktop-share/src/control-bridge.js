import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { CONTROL_LEASE_MS, toHelperCommand } from "./control-protocol.js";

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultHelperPath = path.resolve(
  moduleDirectory,
  "../native/macos-control-helper/.build/release/lan-control-helper",
);
const HELPER_LINE_BYTES = 8192;
const HELPER_READY_TIMEOUT_MS = 2000;
const HELPER_STOP_TIMEOUT_MS = 500;
const MAX_HELPER_STDIN_BYTES = 64 * 1024;
const ALLOWED_PROBE_REASONS = new Set([
  "accessibility-denied",
  "display-configuration-changed",
  "display-selection-invalid",
  "display-unavailable",
  "unsupported-platform",
]);

export class ControlBridge {
  constructor({
    helperPath = defaultHelperPath,
    spawnProcess = spawn,
    platform = process.platform,
    now = () => Date.now(),
    leaseMs = CONTROL_LEASE_MS,
    onLeaseEnded = () => {},
  } = {}) {
    this.helperPath = helperPath;
    this.spawnProcess = spawnProcess;
    this.platform = platform;
    this.now = now;
    this.leaseMs = leaseMs;
    this.onLeaseEnded = onLeaseEnded;
    this.leases = new Map();
    this.bindings = new Map();
    this.identifiers = new Map();
  }

  setOnLeaseEnded(listener) {
    this.onLeaseEnded = listener;
  }

  async probe({ roomId, hostId }) {
    await this.stopIdentifier(roomId);
    this.bindings.delete(roomId);
    if (this.platform !== "darwin") {
      return { available: false, reason: "unsupported-platform", displays: [] };
    }

    let child;
    try {
      child = this.spawnProcess(this.helperPath, ["--probe"], {
        stdio: ["ignore", "pipe", "ignore"],
      });
      await waitForSpawn(child);
      const response = await readJsonLine(child.stdout, {
        maxBytes: HELPER_LINE_BYTES,
        timeoutMs: HELPER_READY_TIMEOUT_MS,
      });
      await waitForExit(child, HELPER_READY_TIMEOUT_MS);
      const result = sanitizeEnvironment(response, "available");
      if (!result.available || result.displays.length !== 1) {
        return publicEnvironment(result);
      }
      const binding = createBinding({ roomId, hostId, result });
      this.bindings.set(roomId, binding);
      return publicEnvironment(result, binding.bindingId);
    } catch (error) {
      await terminateChild(child);
      return {
        available: false,
        reason:
          error?.code === "ENOENT" ? "helper-missing" : "helper-unavailable",
        displays: [],
      };
    }
  }

  async identify({ roomId, hostId }) {
    if (this.platform !== "darwin") {
      throw new ControlBridgeError("unsupported-platform");
    }

    await this.stopIdentifier(roomId);
    this.bindings.delete(roomId);
    let child;
    let identifier;
    try {
      child = this.spawnProcess(this.helperPath, ["--identify"], {
        stdio: ["ignore", "pipe", "ignore"],
      });
      identifier = { child, roomId, hostId };
      this.identifiers.set(roomId, identifier);
      await waitForSpawn(child);
      const response = await readJsonLine(child.stdout, {
        maxBytes: HELPER_LINE_BYTES,
        timeoutMs: HELPER_READY_TIMEOUT_MS,
      });
      const result = sanitizeEnvironment(response, "identified");
      if (!result.available) {
        throw new ControlBridgeError(
          normalizeReason(result.reason, "helper-unavailable"),
        );
      }
      const binding = createBinding({ roomId, hostId, result });
      this.bindings.set(roomId, binding);
      void waitForExit(child, 8000)
        .catch(() => terminateChild(child))
        .finally(() => {
          if (
            child.exitCode !== 0 &&
            this.bindings.get(roomId)?.bindingId === binding.bindingId
          ) {
            this.bindings.delete(roomId);
          }
          if (this.identifiers.get(roomId) === identifier) {
            this.identifiers.delete(roomId);
          }
        });
      return publicEnvironment(result, binding.bindingId);
    } catch (error) {
      if (this.identifiers.get(roomId) === identifier) {
        this.identifiers.delete(roomId);
      }
      await terminateChild(child);
      if (error instanceof ControlBridgeError) throw error;
      throw new ControlBridgeError(
        error?.code === "ENOENT" ? "helper-missing" : "helper-unavailable",
      );
    }
  }

  async stopIdentifier(roomId) {
    const identifier = this.identifiers.get(roomId);
    if (!identifier) return;
    this.identifiers.delete(roomId);
    await terminateChild(identifier.child);
  }

  async start({ roomId, hostId, viewerId, displayId, bindingId }) {
    if (this.leases.has(roomId)) {
      throw new ControlBridgeError("control-busy");
    }
    if (this.platform !== "darwin") {
      throw new ControlBridgeError("unsupported-platform");
    }
    const binding = this.bindings.get(roomId);
    if (
      !binding ||
      binding.hostId !== hostId ||
      binding.bindingId !== bindingId ||
      !binding.displays.some((display) => display.id === displayId)
    ) {
      throw new ControlBridgeError("display-selection-invalid");
    }
    await this.stopIdentifier(roomId);

    let child;
    try {
      child = this.spawnProcess(
        this.helperPath,
        [
          "--display",
          displayId,
          "--configuration",
          binding.configurationSignature,
        ],
        { stdio: ["pipe", "pipe", "ignore"] },
      );
      child.stdin.on("error", () => {});
      await waitForSpawn(child);
      const response = await readJsonLine(child.stdout, {
        maxBytes: HELPER_LINE_BYTES,
        timeoutMs: HELPER_READY_TIMEOUT_MS,
      });
      if (response?.status !== "ready") {
        throw new ControlBridgeError(
          normalizeReason(response?.reason, "helper-unavailable"),
        );
      }
      child.stdout.resume();
    } catch (error) {
      await terminateChild(child);
      if (error?.reason === "display-configuration-changed") {
        this.bindings.delete(roomId);
      }
      if (error instanceof ControlBridgeError) throw error;
      throw new ControlBridgeError(
        error?.code === "ENOENT" ? "helper-missing" : "helper-unavailable",
      );
    }

    const leaseId = randomUUID();
    const expiresAt = this.now() + this.leaseMs;
    const lease = {
      roomId,
      hostId,
      viewerId,
      leaseId,
      expiresAt,
      child,
      lastSeq: 0,
      moveRate: createRateWindow(this.now()),
      otherRate: createRateWindow(this.now()),
      rateViolations: 0,
      timer: null,
    };
    lease.timer = setTimeout(() => {
      void this.stop({ roomId, reason: "expired" }).then((ended) => {
        if (ended) this.onLeaseEnded(ended);
      });
    }, this.leaseMs);
    lease.timer.unref?.();
    const onUnexpectedExit = (code) => {
      const current = this.leases.get(roomId);
      if (current !== lease) return;
      clearTimeout(lease.timer);
      this.leases.delete(roomId);
      if (code === 3) this.bindings.delete(roomId);
      this.onLeaseEnded(
        publicLease(
          lease,
          code === 3 ? "display-configuration-changed" : "helper-exited",
        ),
      );
    };
    this.leases.set(roomId, lease);
    child.once("exit", onUnexpectedExit);
    if (child.exitCode !== null || child.signalCode !== null) {
      queueMicrotask(() => onUnexpectedExit(child.exitCode));
    }

    return publicLease(lease, "started");
  }

  async forward({ roomId, hostId, viewerId, leaseId, seq, event }) {
    const lease = this.requireLease({ roomId, hostId, viewerId, leaseId });
    if (!Number.isSafeInteger(seq) || seq <= lease.lastSeq) {
      throw new ControlBridgeError("invalid-sequence");
    }
    if (this.now() >= lease.expiresAt) {
      const ended = await this.stop({ roomId, reason: "expired" });
      if (ended) this.onLeaseEnded(ended);
      throw new ControlBridgeError("expired");
    }

    const command = toHelperCommand(event);
    const isMove = command.type === "mouseMove";
    const rateWindow = isMove ? lease.moveRate : lease.otherRate;
    const rateLimit = isMove ? 60 : 30;
    if (!consumeRate(rateWindow, rateLimit, this.now())) {
      lease.rateViolations += 1;
      if (lease.rateViolations >= 20) {
        const ended = await this.stop({
          roomId,
          reason: "rate-limit-exceeded",
        });
        if (ended) this.onLeaseEnded(ended);
      }
      throw new ControlBridgeError("rate-limited");
    }
    lease.rateViolations = Math.max(0, lease.rateViolations - 1);
    lease.lastSeq = seq;

    if (lease.child.stdin.writableLength > MAX_HELPER_STDIN_BYTES) {
      const ended = await this.stop({ roomId, reason: "helper-backpressure" });
      if (ended) this.onLeaseEnded(ended);
      throw new ControlBridgeError("helper-unavailable");
    }

    try {
      await writeJsonLine(lease.child.stdin, command);
    } catch {
      const ended = await this.stop({ roomId, reason: "helper-write-failed" });
      if (ended) this.onLeaseEnded(ended);
      throw new ControlBridgeError("helper-unavailable");
    }
  }

  async stop({ roomId, hostId, viewerId, leaseId, reason = "revoked" }) {
    const lease = this.leases.get(roomId);
    if (!lease) return null;
    if (
      (hostId && lease.hostId !== hostId) ||
      (viewerId && lease.viewerId !== viewerId) ||
      (leaseId && lease.leaseId !== leaseId)
    ) {
      throw new ControlBridgeError("control-lease-mismatch");
    }

    this.leases.delete(roomId);
    clearTimeout(lease.timer);
    await terminateChild(lease.child);
    return publicLease(lease, reason);
  }

  async stopForClient(clientId, reason = "client-left") {
    const matching = [...this.leases.values()].filter(
      (lease) => lease.hostId === clientId || lease.viewerId === clientId,
    );
    const identifierRooms = [...this.identifiers.values()]
      .filter((identifier) => identifier.hostId === clientId)
      .map((identifier) => identifier.roomId);
    for (const [roomId, binding] of this.bindings) {
      if (binding.hostId === clientId) this.bindings.delete(roomId);
    }
    return Promise.all([
      ...matching.map((lease) => this.stop({ roomId: lease.roomId, reason })),
      ...identifierRooms.map((roomId) => this.stopIdentifier(roomId)),
    ]);
  }

  async closeAll(reason = "server-closing") {
    const rooms = [...this.leases.keys()];
    const identifiers = [...this.identifiers.values()];
    this.identifiers.clear();
    this.bindings.clear();
    await Promise.all([
      ...rooms.map((roomId) => this.stop({ roomId, reason })),
      ...identifiers.map((identifier) => terminateChild(identifier.child)),
    ]);
  }

  requireLease({ roomId, hostId, viewerId, leaseId }) {
    const lease = this.leases.get(roomId);
    if (
      !lease ||
      lease.hostId !== hostId ||
      lease.viewerId !== viewerId ||
      lease.leaseId !== leaseId
    ) {
      throw new ControlBridgeError("control-lease-mismatch");
    }
    return lease;
  }
}

export class ControlBridgeError extends Error {
  constructor(reason) {
    super(reason);
    this.name = "ControlBridgeError";
    this.reason = reason;
  }
}

function publicLease(lease, reason) {
  return {
    roomId: lease.roomId,
    hostId: lease.hostId,
    viewerId: lease.viewerId,
    leaseId: lease.leaseId,
    expiresAt: lease.expiresAt,
    reason,
  };
}

function createRateWindow(now) {
  return { startedAt: now, count: 0 };
}

function consumeRate(window, limit, now) {
  if (now - window.startedAt >= 1000) {
    window.startedAt = now;
    window.count = 0;
  }
  if (window.count >= limit) return false;
  window.count += 1;
  return true;
}

function sanitizeEnvironment(response, expectedStatus) {
  const displays = sanitizeDisplays(response?.displays);
  const configurationSignature =
    typeof response?.configurationSignature === "string" &&
    response.configurationSignature.length > 0 &&
    response.configurationSignature.length <= 4096
      ? response.configurationSignature
      : null;
  if (
    response?.v === 1 &&
    response.status === expectedStatus &&
    response.accessibility === true &&
    displays &&
    configurationSignature
  ) {
    return {
      available: true,
      reason: null,
      displays,
      configurationSignature,
    };
  }
  return {
    available: false,
    reason: normalizeReason(response?.reason, "helper-unavailable"),
    displays: displays ?? [],
    configurationSignature: null,
  };
}

function createBinding({ roomId, hostId, result }) {
  return {
    roomId,
    hostId,
    bindingId: randomUUID(),
    configurationSignature: result.configurationSignature,
    displays: result.displays,
  };
}

function publicEnvironment(result, bindingId = null) {
  return {
    available: result.available,
    reason: result.reason,
    displays: result.displays,
    bindingId,
  };
}

function sanitizeDisplays(value) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 16) {
    return null;
  }
  const ids = new Set();
  const ordinals = new Set();
  const displays = [];
  for (const display of value) {
    if (!display || typeof display !== "object" || Array.isArray(display)) {
      return null;
    }
    const keys = Object.keys(display).sort();
    const expected = ["height", "id", "isMain", "name", "ordinal", "width"];
    if (
      keys.length !== expected.length ||
      keys.some((key, index) => key !== expected[index]) ||
      typeof display.id !== "string" ||
      !/^\d{1,10}$/.test(display.id) ||
      !Number.isSafeInteger(display.ordinal) ||
      display.ordinal < 1 ||
      display.ordinal > 16 ||
      typeof display.name !== "string" ||
      display.name.length === 0 ||
      display.name.length > 80 ||
      !Number.isSafeInteger(display.width) ||
      display.width < 1 ||
      display.width > 32768 ||
      !Number.isSafeInteger(display.height) ||
      display.height < 1 ||
      display.height > 32768 ||
      typeof display.isMain !== "boolean" ||
      ids.has(display.id) ||
      ordinals.has(display.ordinal)
    ) {
      return null;
    }
    ids.add(display.id);
    ordinals.add(display.ordinal);
    displays.push({
      id: display.id,
      ordinal: display.ordinal,
      name: display.name,
      width: display.width,
      height: display.height,
      isMain: display.isMain,
    });
  }
  return displays.sort((left, right) => left.ordinal - right.ordinal);
}

function normalizeReason(reason, fallback) {
  return ALLOWED_PROBE_REASONS.has(reason) ? reason : fallback;
}

function waitForSpawn(child) {
  return new Promise((resolve, reject) => {
    const onSpawn = () => {
      cleanup();
      resolve();
    };
    const onError = (error) => {
      cleanup();
      reject(error);
    };
    const cleanup = () => {
      child.off("spawn", onSpawn);
      child.off("error", onError);
    };
    child.once("spawn", onSpawn);
    child.once("error", onError);
  });
}

function waitForExit(child, timeoutMs) {
  if (!child || child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("Helper exit timeout"));
    }, timeoutMs);
    timer.unref?.();
    const onExit = () => {
      cleanup();
      resolve();
    };
    const onError = (error) => {
      cleanup();
      reject(error);
    };
    const cleanup = () => {
      clearTimeout(timer);
      child.off("exit", onExit);
      child.off("error", onError);
    };
    child.once("exit", onExit);
    child.once("error", onError);
  });
}

function readJsonLine(stream, { maxBytes, timeoutMs }) {
  return new Promise((resolve, reject) => {
    let buffer = Buffer.alloc(0);
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("Helper response timeout"));
    }, timeoutMs);
    timer.unref?.();

    const onData = (chunk) => {
      if (buffer.length + chunk.length > maxBytes) {
        cleanup();
        reject(new Error("Helper response too large"));
        return;
      }
      buffer = Buffer.concat([buffer, chunk]);
      const newline = buffer.indexOf(0x0a);
      if (newline === -1) return;
      const line = buffer.subarray(0, newline).toString("utf8");
      cleanup();
      try {
        resolve(JSON.parse(line));
      } catch {
        reject(new Error("Invalid helper response"));
      }
    };
    const onEnd = () => {
      cleanup();
      reject(new Error("Helper response ended"));
    };
    const onError = (error) => {
      cleanup();
      reject(error);
    };
    const cleanup = () => {
      clearTimeout(timer);
      stream.off("data", onData);
      stream.off("end", onEnd);
      stream.off("error", onError);
    };

    stream.on("data", onData);
    stream.once("end", onEnd);
    stream.once("error", onError);
  });
}

async function writeJsonLine(stream, value) {
  const line = `${JSON.stringify(value)}\n`;
  if (Buffer.byteLength(line) > HELPER_LINE_BYTES) {
    throw new Error("Helper command too large");
  }
  if (stream.destroyed || stream.writableEnded) {
    throw new Error("Helper input unavailable");
  }
  if (stream.write(line)) return;
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("Helper input timeout"));
    }, HELPER_STOP_TIMEOUT_MS);
    timer.unref?.();
    const onDrain = () => {
      cleanup();
      resolve();
    };
    const onError = (error) => {
      cleanup();
      reject(error);
    };
    const onClose = () => {
      cleanup();
      reject(new Error("Helper input closed"));
    };
    const cleanup = () => {
      clearTimeout(timer);
      stream.off("drain", onDrain);
      stream.off("error", onError);
      stream.off("close", onClose);
    };
    stream.once("drain", onDrain);
    stream.once("error", onError);
    stream.once("close", onClose);
  });
}

async function terminateChild(child) {
  if (!child) return;
  if (child.exitCode !== null || child.signalCode !== null) return;

  try {
    if (child.stdin && !child.stdin.destroyed && !child.stdin.writableEnded) {
      await writeJsonLine(child.stdin, { v: 1, type: "releaseAll" });
      child.stdin.end();
    } else {
      child.kill("SIGTERM");
    }
    await waitForExit(child, HELPER_STOP_TIMEOUT_MS);
  } catch {
    child.kill("SIGTERM");
    try {
      await waitForExit(child, HELPER_STOP_TIMEOUT_MS);
    } catch {
      child.kill("SIGKILL");
    }
  }
}
