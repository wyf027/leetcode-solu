export const CONTROL_LEASE_MS = 10 * 60 * 1000;
export const MAX_CONTROL_BYTES = 1024;

const CONTROL_MESSAGE_TYPES = new Set([
  "control-event",
  "control-identify",
  "control-probe",
  "control-start",
  "control-stop",
]);
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

export function isControlMessageType(type) {
  return CONTROL_MESSAGE_TYPES.has(type);
}

export function isLoopbackAddress(address) {
  if (address === "127.0.0.1" || address === "::1") return true;
  return address?.toLowerCase() === "::ffff:127.0.0.1";
}

export function parseControlMessage(message, byteLength) {
  if (byteLength > MAX_CONTROL_BYTES)
    throw new Error("Control message too large");
  if (message.v !== 1) throw new Error("Invalid control protocol version");

  switch (message.type) {
    case "control-identify":
    case "control-probe":
      requireExactKeys(message, ["v", "type", "roomId", "requestId"]);
      requireUuid(message.requestId, "control request");
      break;
    case "control-start":
      requireExactKeys(message, [
        "v",
        "type",
        "roomId",
        "viewerId",
        "displayId",
        "bindingId",
      ]);
      requireIdentifier(message.viewerId, "viewer ID");
      requireDisplayId(message.displayId);
      requireUuid(message.bindingId, "display binding");
      break;
    case "control-event":
      requireExactKeys(message, [
        "v",
        "type",
        "roomId",
        "viewerId",
        "leaseId",
        "seq",
        "event",
      ]);
      requireIdentifier(message.viewerId, "viewer ID");
      requireLeaseId(message.leaseId);
      if (!Number.isSafeInteger(message.seq) || message.seq < 1)
        throw new Error("Invalid control sequence");
      message.event = validateControlEvent(message.event);
      break;
    case "control-stop":
      requireExactKeys(message, ["v", "type", "roomId", "viewerId", "leaseId"]);
      requireIdentifier(message.viewerId, "viewer ID");
      requireLeaseId(message.leaseId);
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
      if (event.button !== "left" && event.button !== "right")
        throw new Error("Invalid mouse button");
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
    case "text": {
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
    }
    case "releaseAll":
      requireExactKeys(event, ["kind"]);
      return { kind: event.kind };
    default:
      throw new Error("Unsupported control event");
  }
}

export function toHelperCommand(event) {
  const validated = validateControlEvent(event);
  const { kind, ...fields } = validated;
  return { v: 1, type: kind, ...fields };
}

function containsControlCharacter(value) {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint < 0x20 || codePoint === 0x7f;
  });
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

function requireIdentifier(value, label) {
  if (typeof value !== "string" || value.length === 0 || value.length > 128) {
    throw new Error(`Invalid ${label}`);
  }
}

function requireLeaseId(value) {
  requireUuid(value, "control lease");
}

function requireDisplayId(value) {
  if (typeof value !== "string" || !/^\d{1,10}$/.test(value)) {
    throw new Error("Invalid display ID");
  }
}

function requireUuid(value, label) {
  if (typeof value !== "string" || !LEASE_ID_PATTERN.test(value)) {
    throw new Error(`Invalid ${label}`);
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
