import assert from "node:assert/strict";
import { test } from "node:test";

import { RoomRegistry } from "../src/room-registry.js";

const roomId = "00112233445566778899aabbccddeeff";

test("hosts a room, joins viewers, and limits membership to five viewers", () => {
  const registry = new RoomRegistry({ maxViewers: 5 });
  registry.hostRoom(roomId, "host");
  for (let index = 1; index <= 5; index += 1)
    registry.joinRoom(roomId, `viewer-${index}`);

  assert.deepEqual(registry.getMembership("viewer-1"), {
    roomId,
    role: "viewer",
  });
  assert.throws(() => registry.joinRoom(roomId, "viewer-6"), /full/);
  assert.equal(registry.assertRoute(roomId, "host", "viewer-1"), "viewer-1");
  assert.throws(
    () => registry.assertRoute(roomId, "viewer-1", "viewer-2"),
    /not permitted/,
  );
});

test("ending a room removes every membership", () => {
  const registry = new RoomRegistry();
  registry.hostRoom(roomId, "host");
  registry.joinRoom(roomId, "viewer");

  assert.deepEqual(registry.endRoom(roomId, "host"), ["viewer"]);
  assert.equal(registry.getMembership("host"), null);
  assert.equal(registry.getMembership("viewer"), null);
});

test("removing one viewer leaves the room active", () => {
  const registry = new RoomRegistry();
  registry.hostRoom(roomId, "host");
  registry.joinRoom(roomId, "viewer");

  assert.deepEqual(registry.removeClient("viewer"), {
    kind: "viewer-left",
    roomId,
    hostId: "host",
    viewerId: "viewer",
  });
  assert.deepEqual(registry.getMembership("host"), { roomId, role: "host" });
});

test("removing a host closes its room and releases every viewer", () => {
  const registry = new RoomRegistry();
  registry.hostRoom(roomId, "host");
  registry.joinRoom(roomId, "viewer");

  assert.deepEqual(registry.removeClient("host"), {
    kind: "host-left",
    roomId,
    viewerIds: ["viewer"],
  });
  assert.equal(registry.getMembership("viewer"), null);
});
