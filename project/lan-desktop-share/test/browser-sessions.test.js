import assert from "node:assert/strict";
import { test } from "node:test";

import { HostSession } from "../public/js/host-session.js";
import { SignalingClient } from "../public/js/signaling-client.js";
import { ViewerSession } from "../public/js/viewer-session.js";

const roomId = "00112233445566778899aabbccddeeff";
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

class FakeSignal {
  constructor() {
    this.sent = [];
    this.listeners = new Set();
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  send(message) {
    this.sent.push(message);
  }

  emit(message) {
    for (const listener of this.listeners) listener(message);
  }
}

class FakeTrack {
  constructor() {
    this.kind = "video";
    this.stopped = false;
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  emit(type) {
    this.listeners.get(type)?.();
  }

  stop() {
    this.stopped = true;
  }
}

class FakePeerConnection {
  constructor() {
    this.addedTracks = [];
    this.localDescription = null;
    this.remoteDescription = null;
    this.remoteCandidate = null;
    this.connectionState = "new";
    this.closed = false;
  }

  addTrack(track, stream) {
    this.addedTracks.push({ track, stream });
  }

  async createOffer() {
    return { type: "offer", sdp: "host-offer" };
  }

  async createAnswer() {
    return { type: "answer", sdp: "viewer-answer" };
  }

  async setLocalDescription(description) {
    this.localDescription = description;
  }

  async setRemoteDescription(description) {
    this.remoteDescription = description;
  }

  async addIceCandidate(candidate) {
    if (!this.remoteDescription)
      throw new Error("Remote description is not set");
    this.remoteCandidate = candidate;
  }

  close() {
    this.closed = true;
    this.connectionState = "closed";
  }
}

function createMediaFixture() {
  const track = new FakeTrack();
  const stream = {
    getVideoTracks: () => [track],
    getTracks: () => [track],
  };
  const calls = [];
  const mediaDevices = {
    async getDisplayMedia(options) {
      calls.push(options);
      return stream;
    },
  };
  return { calls, mediaDevices, stream, track };
}

test("SignalingClient exchanges JSON messages over its WebSocket boundary", async () => {
  class FakeWebSocket {
    static OPEN = 1;
    static instances = [];

    constructor(url) {
      this.url = url;
      this.readyState = 0;
      this.listeners = new Map();
      this.sent = [];
      FakeWebSocket.instances.push(this);
      queueMicrotask(() => {
        this.readyState = FakeWebSocket.OPEN;
        this.emit("open", {});
      });
    }

    addEventListener(type, listener) {
      const listeners = this.listeners.get(type) ?? [];
      listeners.push(listener);
      this.listeners.set(type, listeners);
    }

    emit(type, event) {
      for (const listener of this.listeners.get(type) ?? []) listener(event);
    }

    send(value) {
      this.sent.push(value);
    }

    close() {
      this.readyState = 3;
      this.emit("close", {});
    }
  }

  const received = [];
  const client = new SignalingClient({
    url: "ws://lan.test",
    WebSocketCtor: FakeWebSocket,
  });
  client.subscribe((message) => received.push(message));
  await client.connect();
  client.send({ type: "join-room", roomId });
  FakeWebSocket.instances[0].emit("message", {
    data: '{"type":"viewer-accepted"}',
  });
  client.close();

  assert.equal(FakeWebSocket.instances[0].url, "ws://lan.test");
  assert.equal(
    FakeWebSocket.instances[0].sent[0],
    JSON.stringify({ type: "join-room", roomId }),
  );
  assert.deepEqual(received, [
    { type: "viewer-accepted" },
    { type: "signal-closed" },
  ]);
});

test("HostSession captures video without audio and registers the room", async () => {
  const signal = new FakeSignal();
  const media = createMediaFixture();
  const previews = [];
  const states = [];
  const session = new HostSession({
    signal,
    mediaDevices: media.mediaDevices,
    createPeerConnection: () => new FakePeerConnection(),
    onPreview: (stream) => previews.push(stream),
    onState: (state) => states.push(state),
  });

  await session.start(roomId);

  assert.deepEqual(media.calls, [{ video: true, audio: false }]);
  assert.deepEqual(signal.sent, [{ type: "host-room", roomId }]);
  assert.equal(previews[0], media.stream);
  assert.equal(states.at(-1), "sharing");
});

test("HostSession creates and removes one independent peer per viewer", async () => {
  const signal = new FakeSignal();
  const media = createMediaFixture();
  const peers = [];
  const counts = [];
  const session = new HostSession({
    signal,
    mediaDevices: media.mediaDevices,
    createPeerConnection: () => {
      const peer = new FakePeerConnection();
      peers.push(peer);
      return peer;
    },
    onViewerCount: (count) => counts.push(count),
  });
  await session.start(roomId);

  signal.emit({ type: "viewer-joined", viewerId: "viewer-1" });
  signal.emit({ type: "viewer-joined", viewerId: "viewer-2" });
  await flush();

  assert.equal(peers.length, 2);
  assert.equal(peers[0].addedTracks.length, 1);
  assert.equal(peers[0].addedTracks[0].track.kind, "video");
  assert.equal(
    signal.sent.filter((message) => message.type === "offer").length,
    2,
  );
  assert.equal(counts.at(-1), 2);

  signal.emit({ type: "viewer-left", viewerId: "viewer-1" });
  await flush();
  assert.equal(peers[0].closed, true);
  assert.equal(peers[1].closed, false);
  assert.equal(counts.at(-1), 1);
});

test("HostSession applies answers and candidates to the sending viewer", async () => {
  const signal = new FakeSignal();
  const media = createMediaFixture();
  const peers = [];
  const session = new HostSession({
    signal,
    mediaDevices: media.mediaDevices,
    createPeerConnection: () => {
      const peer = new FakePeerConnection();
      peers.push(peer);
      return peer;
    },
  });
  await session.start(roomId);
  signal.emit({ type: "viewer-joined", viewerId: "viewer-1" });
  await flush();

  signal.emit({
    type: "answer",
    senderId: "viewer-1",
    sdp: { type: "answer", sdp: "v=0" },
  });
  signal.emit({
    type: "ice-candidate",
    senderId: "viewer-1",
    candidate: { candidate: "ice" },
  });
  await flush();

  assert.deepEqual(peers[0].remoteDescription, { type: "answer", sdp: "v=0" });
  assert.deepEqual(peers[0].remoteCandidate, { candidate: "ice" });
});

test("HostSession queues ICE candidates that arrive before the answer", async () => {
  const signal = new FakeSignal();
  const media = createMediaFixture();
  const peer = new FakePeerConnection();
  const session = new HostSession({
    signal,
    mediaDevices: media.mediaDevices,
    createPeerConnection: () => peer,
  });
  await session.start(roomId);
  signal.emit({ type: "viewer-joined", viewerId: "viewer-1" });
  await flush();

  signal.emit({
    type: "ice-candidate",
    senderId: "viewer-1",
    candidate: { candidate: "early" },
  });
  signal.emit({
    type: "answer",
    senderId: "viewer-1",
    sdp: { type: "answer", sdp: "viewer-answer" },
  });
  await flush();

  assert.deepEqual(peer.remoteCandidate, { candidate: "early" });
});

test("HostSession retries one failed viewer once without stopping others", async () => {
  const signal = new FakeSignal();
  const media = createMediaFixture();
  const peers = [];
  const states = [];
  const session = new HostSession({
    signal,
    mediaDevices: media.mediaDevices,
    createPeerConnection: () => {
      const peer = new FakePeerConnection();
      peers.push(peer);
      return peer;
    },
    onState: (state) => states.push(state),
  });
  await session.start(roomId);
  signal.emit({ type: "viewer-joined", viewerId: "viewer-1" });
  signal.emit({ type: "viewer-joined", viewerId: "viewer-2" });
  await flush();

  peers[0].connectionState = "failed";
  peers[0].onconnectionstatechange();
  await flush();
  assert.equal(peers.length, 3);
  assert.equal(peers[1].closed, false);

  peers[2].connectionState = "failed";
  peers[2].onconnectionstatechange();
  await flush();
  assert.equal(session.peers.has("viewer-1"), false);
  assert.equal(session.peers.has("viewer-2"), true);
  assert.equal(states.at(-1), "viewer-failed");
});

test("HostSession stops once when the browser ends its capture track", async () => {
  const signal = new FakeSignal();
  const media = createMediaFixture();
  const previews = [];
  const session = new HostSession({
    signal,
    mediaDevices: media.mediaDevices,
    createPeerConnection: () => new FakePeerConnection(),
    onPreview: (stream) => previews.push(stream),
  });
  await session.start(roomId);

  media.track.emit("ended");
  session.stop();

  assert.equal(media.track.stopped, true);
  assert.equal(previews.at(-1), null);
  assert.equal(
    signal.sent.filter((message) => message.type === "share-ended").length,
    1,
  );
});

test("ViewerSession answers an offer and publishes the remote stream", async () => {
  const signal = new FakeSignal();
  const streams = [];
  const states = [];
  const peer = new FakePeerConnection();
  const session = new ViewerSession({
    signal,
    createPeerConnection: () => peer,
    onStream: (stream) => streams.push(stream),
    onState: (state) => states.push(state),
  });

  session.join(roomId);
  signal.emit({ type: "viewer-accepted", hostId: "host-1" });
  signal.emit({
    type: "offer",
    senderId: "host-1",
    sdp: { type: "offer", sdp: "host-offer" },
  });
  await flush();

  assert.deepEqual(signal.sent[0], { type: "join-room", roomId });
  assert.deepEqual(peer.remoteDescription, {
    type: "offer",
    sdp: "host-offer",
  });
  assert.deepEqual(signal.sent.at(-1), {
    type: "answer",
    roomId,
    targetId: "host-1",
    sdp: { type: "answer", sdp: "viewer-answer" },
  });

  const stream = { id: "remote-stream" };
  peer.ontrack({ streams: [stream] });
  assert.equal(streams.at(-1), stream);
  assert.equal(states.at(-1), "watching");
});

test("ViewerSession queues ICE candidates that arrive before the offer", async () => {
  const signal = new FakeSignal();
  const peer = new FakePeerConnection();
  const session = new ViewerSession({
    signal,
    createPeerConnection: () => peer,
  });
  session.join(roomId);

  signal.emit({
    type: "ice-candidate",
    senderId: "host-1",
    candidate: { candidate: "early" },
  });
  signal.emit({
    type: "offer",
    senderId: "host-1",
    sdp: { type: "offer", sdp: "host-offer" },
  });
  await flush();

  assert.deepEqual(peer.remoteCandidate, { candidate: "early" });
});

test("ViewerSession closes the peer when sharing ends", async () => {
  const signal = new FakeSignal();
  const states = [];
  const peer = new FakePeerConnection();
  const session = new ViewerSession({
    signal,
    createPeerConnection: () => peer,
    onState: (state) => states.push(state),
  });
  session.join(roomId);
  signal.emit({
    type: "offer",
    senderId: "host-1",
    sdp: { type: "offer", sdp: "host-offer" },
  });
  await flush();

  signal.emit({ type: "share-ended", roomId });
  await flush();

  assert.equal(peer.closed, true);
  assert.equal(states.at(-1), "ended");
});
