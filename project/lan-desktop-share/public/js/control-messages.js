export const CONTROL_CHANNEL_LABEL = "lan-control-v1";
export const CONTROL_CHANNEL_PROTOCOL = "lan-control-v1";
export const MAX_CONTROL_CHANNEL_BYTES = 1024;

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
const LEASE_ID_PATTERN =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;

export function encodeControlMessage(message) {
  const encoded = JSON.stringify(message);
  parseControlChannelMessage(encoded);
  return encoded;
}

export function parseControlChannelMessage(raw) {
  if (typeof raw !== "string") throw new Error("Control message must be text");
  if (new TextEncoder().encode(raw).byteLength > MAX_CONTROL_CHANNEL_BYTES) {
    throw new Error("Control message too large");
  }

  let message;
  try {
    message = JSON.parse(raw);
  } catch {
    throw new Error("Control message must be valid JSON");
  }
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    throw new Error("Control message must be an object");
  }
  if (message.v !== 1) throw new Error("Invalid control protocol version");

  switch (message.type) {
    case "control-request":
    case "control-cancel":
    case "control-pending":
      requireExactKeys(message, ["v", "type"]);
      break;
    case "control-granted":
      requireExactKeys(message, ["v", "type", "leaseId", "expiresAt"]);
      requireLease(message.leaseId);
      if (!Number.isSafeInteger(message.expiresAt) || message.expiresAt <= 0) {
        throw new Error("Invalid control expiry");
      }
      break;
    case "control-denied":
    case "control-revoked":
      requireExactKeys(message, ["v", "type", "reason"]);
      requireReason(message.reason);
      break;
    case "control-input":
      requireExactKeys(message, ["v", "type", "leaseId", "seq", "event"]);
      requireLease(message.leaseId);
      if (!Number.isSafeInteger(message.seq) || message.seq < 1) {
        throw new Error("Invalid control sequence");
      }
      message.event = validateControlEvent(message.event);
      break;
    default:
      throw new Error("Unsupported control message type");
  }

  return message;
}

export function validateControlEvent(event) {
  if (!event || typeof event !== "object" || Array.isArray(event)) {
    throw new Error("Invalid control event");
  }

  switch (event.kind) {
    case "mouseMove":
      requireExactKeys(event, ["kind", "x", "y"]);
      requireNormalized(event.x, "x");
      requireNormalized(event.y, "y");
      return { kind: event.kind, x: event.x, y: event.y };
    case "mouseButton":
      requireExactKeys(event, ["kind", "button", "state"]);
      if (event.button !== "left" && event.button !== "right") {
        throw new Error("Invalid mouse button");
      }
      requirePressState(event.state);
      return {
        kind: event.kind,
        button: event.button,
        state: event.state,
      };
    case "scroll":
      requireExactKeys(event, ["kind", "deltaX", "deltaY"]);
      requireBoundedNumber(event.deltaX, 120, "scroll delta X");
      requireBoundedNumber(event.deltaY, 120, "scroll delta Y");
      return {
        kind: event.kind,
        deltaX: event.deltaX,
        deltaY: event.deltaY,
      };
    case "key":
      requireExactKeys(event, ["kind", "key", "state"]);
      if (!CONTROL_KEYS.has(event.key)) throw new Error("Invalid control key");
      requirePressState(event.state);
      return { kind: event.kind, key: event.key, state: event.state };
    case "text":
      requireExactKeys(event, ["kind", "text"]);
      if (
        typeof event.text !== "string" ||
        event.text.length === 0 ||
        [...event.text].length > 32 ||
        containsControlCharacter(event.text)
      ) {
        throw new Error("Invalid control text");
      }
      return { kind: event.kind, text: event.text };
    case "releaseAll":
      requireExactKeys(event, ["kind"]);
      return { kind: event.kind };
    default:
      throw new Error("Unsupported control event");
  }
}

function requireExactKeys(value, expected) {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  if (
    actual.length !== sortedExpected.length ||
    actual.some((key, index) => key !== sortedExpected[index])
  ) {
    throw new Error("Unexpected control message fields");
  }
}

function requireLease(value) {
  if (typeof value !== "string" || !LEASE_ID_PATTERN.test(value)) {
    throw new Error("Invalid control lease");
  }
}

function requireReason(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 64) {
    throw new Error("Invalid control reason");
  }
}

function requireNormalized(value, label) {
  requireBoundedNumber(value, 1, label);
  if (value < 0) throw new Error(`Invalid ${label}`);
}

function requireBoundedNumber(value, absoluteLimit, label) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    Math.abs(value) > absoluteLimit
  ) {
    throw new Error(`Invalid ${label}`);
  }
}

function requirePressState(value) {
  if (value !== "down" && value !== "up") {
    throw new Error("Invalid control state");
  }
}

function containsControlCharacter(value) {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint < 0x20 || codePoint === 0x7f;
  });
}
