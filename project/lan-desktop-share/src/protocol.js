import {
  isControlMessageType,
  parseControlMessage,
} from "./control-protocol.js";

export const MAX_SIGNAL_BYTES = 16_384;
const ROOM_ID_PATTERN = /^[a-f0-9]{32}$/;
const DIRECTED_TYPES = new Set(["offer", "answer", "ice-candidate"]);
const ROOM_TYPES = new Set(["host-room", "join-room", "share-ended"]);

function requireString(value, label) {
  if (typeof value !== "string" || value.length === 0)
    throw new Error(`Invalid ${label}`);
}

export function parseClientMessage(raw) {
  const text = Buffer.isBuffer(raw) ? raw.toString("utf8") : String(raw);
  if (Buffer.byteLength(text) > MAX_SIGNAL_BYTES)
    throw new Error("Signal message too large");

  let message;
  try {
    message = JSON.parse(text);
  } catch {
    throw new Error("Signal message must be valid JSON");
  }

  if (!message || typeof message !== "object" || Array.isArray(message)) {
    throw new Error("Signal message must be an object");
  }
  if (isControlMessageType(message.type)) {
    if (!ROOM_ID_PATTERN.test(message.roomId ?? ""))
      throw new Error("Invalid room ID");
    return parseControlMessage(message, Buffer.byteLength(text));
  }
  if (!ROOM_TYPES.has(message.type) && !DIRECTED_TYPES.has(message.type)) {
    throw new Error("Unsupported message type");
  }
  if (!ROOM_ID_PATTERN.test(message.roomId ?? ""))
    throw new Error("Invalid room ID");

  if (DIRECTED_TYPES.has(message.type)) {
    requireString(message.targetId, "target ID");
    const payloadKey = message.type === "ice-candidate" ? "candidate" : "sdp";
    if (!message[payloadKey] || typeof message[payloadKey] !== "object") {
      throw new Error(`Invalid ${payloadKey}`);
    }
  }

  return message;
}
