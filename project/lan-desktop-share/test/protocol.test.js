import assert from "node:assert/strict";
import { test } from "node:test";

import { MAX_SIGNAL_BYTES, parseClientMessage } from "../src/protocol.js";

const roomId = "00112233445566778899aabbccddeeff";

test("accepts room and directed WebRTC messages", () => {
  assert.deepEqual(
    parseClientMessage(JSON.stringify({ type: "host-room", roomId })),
    {
      type: "host-room",
      roomId,
    },
  );
  assert.equal(
    parseClientMessage(
      JSON.stringify({
        type: "offer",
        roomId,
        targetId: "viewer-1",
        sdp: { type: "offer", sdp: "v=0" },
      }),
    ).type,
    "offer",
  );
});

test("rejects unknown, malformed and oversized messages", () => {
  assert.throws(() => parseClientMessage("{"), /valid JSON/);
  assert.throws(
    () => parseClientMessage(JSON.stringify({ type: "unknown" })),
    /message type/,
  );
  assert.throws(
    () =>
      parseClientMessage(JSON.stringify({ type: "join-room", roomId: "1234" })),
    /room ID/,
  );
  assert.throws(
    () => parseClientMessage("x".repeat(MAX_SIGNAL_BYTES + 1)),
    /too large/,
  );
});

test("requires directed WebRTC payloads and target IDs", () => {
  assert.throws(
    () =>
      parseClientMessage(JSON.stringify({ type: "answer", roomId, sdp: {} })),
    /target ID/,
  );
  assert.throws(
    () =>
      parseClientMessage(
        JSON.stringify({
          type: "ice-candidate",
          roomId,
          targetId: "host",
          candidate: null,
        }),
      ),
    /candidate/,
  );
});
