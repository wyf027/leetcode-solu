import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";

import WebSocket from "ws";

import { createLanShareServer } from "../src/server.js";

const roomId = "00112233445566778899aabbccddeeff";
const runningApps = [];

afterEach(async () => {
  const contexts = runningApps.splice(0);
  await Promise.allSettled(contexts.map(({ app }) => app.close()));
  await Promise.allSettled(
    contexts.map(({ publicDir }) =>
      fs.rm(publicDir, { recursive: true, force: true }),
    ),
  );
});

async function startServer({ networkInterfaces } = {}) {
  const publicDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "lan-desktop-share-"),
  );
  await fs.writeFile(
    path.join(publicDir, "index.html"),
    "<h1>LAN Desktop Share</h1>",
  );
  const app = createLanShareServer({ publicDir, networkInterfaces });
  const address = await app.listen({ port: 0, host: "127.0.0.1" });
  const origin = `http://127.0.0.1:${address.port}`;
  const context = {
    app,
    origin,
    wsOrigin: `ws://127.0.0.1:${address.port}`,
    port: address.port,
  };
  runningApps.push({ app, publicDir });
  return context;
}

function prepareMessageQueue(socket) {
  socket.messageQueue = [];
  socket.messageWaiters = [];
  socket.on("message", (raw) => {
    const message = JSON.parse(raw.toString());
    const waiterIndex = socket.messageWaiters.findIndex(
      (waiter) => waiter.type === message.type,
    );
    if (waiterIndex === -1) {
      socket.messageQueue.push(message);
      return;
    }
    const [waiter] = socket.messageWaiters.splice(waiterIndex, 1);
    clearTimeout(waiter.timeout);
    waiter.resolve(message);
  });
}

function openSocket(url, origin = url.replace(/^ws/, "http")) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url, { origin });
    socket.once("open", () => {
      prepareMessageQueue(socket);
      resolve(socket);
    });
    socket.once("error", reject);
  });
}

function nextMessage(socket, type) {
  const queuedIndex = socket.messageQueue.findIndex(
    (message) => message.type === type,
  );
  if (queuedIndex !== -1)
    return Promise.resolve(socket.messageQueue.splice(queuedIndex, 1)[0]);

  return new Promise((resolve, reject) => {
    const waiter = { type, resolve, reject, timeout: null };
    waiter.timeout = setTimeout(() => {
      socket.messageWaiters = socket.messageWaiters.filter(
        (candidate) => candidate !== waiter,
      );
      reject(new Error(`Timed out waiting for ${type}`));
    }, 2000);
    socket.messageWaiters.push(waiter);
  });
}

function nextClose(socket) {
  return new Promise((resolve) =>
    socket.once("close", (code) => resolve(code)),
  );
}

test("serves the app and LAN address API", async () => {
  const app = await startServer({
    networkInterfaces: {
      en0: [{ address: "198.51.100.20", family: "IPv4", internal: false }],
    },
  });
  const html = await fetch(`${app.origin}/`).then((response) =>
    response.text(),
  );
  const info = await fetch(`${app.origin}/api/network-info`).then((response) =>
    response.json(),
  );

  assert.match(html, /LAN Desktop Share/);
  assert.deepEqual(info.addresses, ["198.51.100.20"]);
  assert.equal(info.port, app.port);
});

test("rejects static-file traversal outside the public directory", async () => {
  const app = await startServer();
  const response = await fetch(`${app.origin}/%2e%2e%2fpackage.json`);
  assert.equal(response.status, 403);
});

test("rejects a WebSocket request from a different origin", async () => {
  const app = await startServer();
  await assert.rejects(
    openSocket(app.wsOrigin, "http://untrusted.example"),
    /403/,
  );
});

test("routes offers only between a host and its viewer", async () => {
  const app = await startServer();
  const host = await openSocket(app.wsOrigin);
  const viewer = await openSocket(app.wsOrigin);

  host.send(JSON.stringify({ type: "host-room", roomId }));
  const hosted = await nextMessage(host, "room-hosted");
  viewer.send(JSON.stringify({ type: "join-room", roomId }));
  const joined = await nextMessage(host, "viewer-joined");

  host.send(
    JSON.stringify({
      type: "offer",
      roomId,
      targetId: joined.viewerId,
      sdp: { type: "offer", sdp: "v=0" },
    }),
  );
  const offer = await nextMessage(viewer, "offer");
  assert.equal(offer.senderId, hosted.hostId);
  assert.equal(offer.sdp.sdp, "v=0");
  assert.equal("targetId" in offer, false);
});

test("notifies every viewer when the host ends sharing", async () => {
  const app = await startServer();
  const host = await openSocket(app.wsOrigin);
  const viewer = await openSocket(app.wsOrigin);
  host.send(JSON.stringify({ type: "host-room", roomId }));
  await nextMessage(host, "room-hosted");
  viewer.send(JSON.stringify({ type: "join-room", roomId }));
  await nextMessage(viewer, "viewer-accepted");

  host.send(JSON.stringify({ type: "share-ended", roomId }));
  assert.equal((await nextMessage(viewer, "share-ended")).roomId, roomId);
});

test("closes a client that sends malformed signaling JSON", async () => {
  const app = await startServer();
  const socket = await openSocket(app.wsOrigin);
  const closed = nextClose(socket);
  socket.send("{");

  assert.equal(
    (await nextMessage(socket, "error")).message,
    "Invalid signaling message",
  );
  assert.equal(await closed, 1008);
});
