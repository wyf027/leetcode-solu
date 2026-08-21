# LAN Desktop Share Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local Node.js application that lets one host share silent desktop video through WebRTC with 1–5 viewers on the same LAN.

**Architecture:** A Node HTTP server serves a Tailwind-based browser UI and exposes an in-memory WebSocket signaling channel. The host creates one `RTCPeerConnection` per viewer; video travels directly between browsers while the server only routes signaling messages.

**Tech Stack:** Node.js ES modules, native `node:test`, `ws`, browser WebRTC and Screen Capture APIs, Tailwind CSS CLI, ESLint, Prettier.

## Global Constraints

- Listen on `0.0.0.0:4173`; the host opens `http://localhost:4173` and viewers use a LAN IPv4 address.
- Support 1–5 concurrent viewers with one peer connection per viewer.
- Capture video only with `getDisplayMedia({ video: true, audio: false })`; never request or add audio tracks.
- Keep room and signaling state in memory only; never persist media, session descriptions, room secrets, or complete viewer URLs.
- Put a cryptographically random 128-bit room ID in the URL fragment.
- Do not add NAT traversal promises, public hosting, recording, downloads, remote control, chat, or account authentication.
- Generate Tailwind CSS locally; the running page must not depend on a CDN or external asset.
- Treat real multi-device LAN verification as separate evidence from automated local tests.

## Planned File Structure

```text
.
├── .ai/tasks/lan-desktop-share.md       # Mutable task state and verification record
├── .gitignore                           # Dependency and generated-output exclusions
├── README.md                            # Setup, use, security boundary, troubleshooting
├── eslint.config.js                     # JavaScript static-analysis rules
├── package.json                         # Runtime, build, test, lint and formatting commands
├── public/
│   ├── index.html                       # Tailwind UI shell for host and viewer roles
│   ├── js/
│   │   ├── app.js                       # Role detection and DOM/event wiring
│   │   ├── host-session.js              # Host capture and per-viewer peer management
│   │   ├── room-link.js                 # Room ID and viewer-link helpers
│   │   ├── signaling-client.js          # Browser WebSocket wrapper
│   │   └── viewer-session.js            # Viewer peer lifecycle and remote video delivery
│   ├── styles.css                       # Generated Tailwind output; ignored by Git
│   └── styles/
│       └── input.css                    # Tailwind source and small base rules
├── src/
│   ├── network-addresses.js             # LAN IPv4 discovery
│   ├── protocol.js                      # Signaling message parsing and validation
│   ├── room-registry.js                 # In-memory room membership and routing rules
│   └── server.js                        # HTTP/static/API/WebSocket composition and CLI entry
└── test/
    ├── browser-sessions.test.js          # WebRTC session behavior with fakes
    ├── helpers.test.js                   # Room-link and LAN-address helper tests
    ├── protocol.test.js                  # Message validation tests
    ├── room-registry.test.js             # Room lifecycle tests
    ├── server.test.js                    # HTTP and WebSocket integration tests
    └── ui-shell.test.js                  # Required DOM hooks and no-CDN assertions
```

---

### Task 1: Project Foundation and Pure Helpers

**Files:**

- Create: `package.json`
- Create: `eslint.config.js`
- Create: `.gitignore`
- Create: `src/network-addresses.js`
- Create: `public/js/room-link.js`
- Test: `test/helpers.test.js`

**Interfaces:**

- Produces: `listLanIpv4(networkInterfaces): string[]`
- Produces: `createRoomId(cryptoProvider): string`
- Produces: `buildViewerUrl({ protocol, address, port, roomId }): string`
- Produces: `parseViewerHash(hash): { role: 'viewer', roomId: string } | null`

- [ ] **Step 1: Create the package and tool configuration**

Create `package.json` with these scripts and dependencies:

```json
{
  "name": "lan-desktop-share",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "styles:build": "tailwindcss -i ./public/styles/input.css -o ./public/styles.css --minify",
    "prestart": "npm run styles:build",
    "start": "node src/server.js",
    "dev": "npm run styles:build && node --watch src/server.js",
    "test": "node --test",
    "lint": "eslint src public/js test eslint.config.js",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "check": "npm run styles:build && npm run lint && npm run format:check && npm test"
  },
  "dependencies": {
    "ws": "latest"
  },
  "devDependencies": {
    "@eslint/js": "latest",
    "@tailwindcss/cli": "latest",
    "eslint": "latest",
    "globals": "latest",
    "prettier": "latest",
    "tailwindcss": "latest"
  }
}
```

Create `eslint.config.js`:

```js
import eslint from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['node_modules/**', 'public/styles.css', 'outputs/**', 'work/**'] },
  eslint.configs.recommended,
  {
    files: ['src/**/*.js', 'test/**/*.js', 'eslint.config.js'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['public/js/**/*.js'],
    languageOptions: { globals: globals.browser },
  },
];
```

Create `.gitignore`:

```gitignore
node_modules/
public/styles.css
coverage/
.DS_Store
outputs/*.zip
```

Run: `npm install`

Expected: `package-lock.json` is created and installation exits with code 0.

- [ ] **Step 2: Write failing helper tests**

Create `test/helpers.test.js`:

```js
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildViewerUrl, createRoomId, parseViewerHash } from '../public/js/room-link.js';
import { listLanIpv4 } from '../src/network-addresses.js';

test('listLanIpv4 returns unique non-internal IPv4 addresses', () => {
  const interfaces = {
    en0: [
      { address: '192.168.1.8', family: 'IPv4', internal: false },
      { address: 'fe80::1', family: 'IPv6', internal: false },
    ],
    en1: [{ address: '192.168.1.8', family: 4, internal: false }],
    lo0: [{ address: '127.0.0.1', family: 'IPv4', internal: true }],
  };

  assert.deepEqual(listLanIpv4(interfaces), ['192.168.1.8']);
});

test('createRoomId returns 128 random bits as lowercase hex', () => {
  const cryptoProvider = {
    getRandomValues(bytes) {
      bytes.set(Uint8Array.from({ length: 16 }, (_, index) => index));
      return bytes;
    },
  };

  assert.equal(createRoomId(cryptoProvider), '000102030405060708090a0b0c0d0e0f');
});

test('viewer URL keeps the room secret in the fragment', () => {
  const roomId = '00112233445566778899aabbccddeeff';
  const url = buildViewerUrl({
    protocol: 'http:',
    address: '192.168.1.8',
    port: '4173',
    roomId,
  });

  assert.equal(url, `http://192.168.1.8:4173/#role=viewer&room=${roomId}`);
  assert.deepEqual(parseViewerHash(`#role=viewer&room=${roomId}`), {
    role: 'viewer',
    roomId,
  });
  assert.equal(parseViewerHash('#role=host'), null);
});
```

- [ ] **Step 3: Run the helper tests and confirm the expected failure**

Run: `node --test test/helpers.test.js`

Expected: FAIL because `src/network-addresses.js` and `public/js/room-link.js` do not exist.

- [ ] **Step 4: Implement the pure helpers**

Create `src/network-addresses.js`:

```js
import os from 'node:os';

export function listLanIpv4(networkInterfaces = os.networkInterfaces()) {
  const addresses = Object.values(networkInterfaces)
    .flatMap((entries) => entries ?? [])
    .filter((entry) => (entry.family === 'IPv4' || entry.family === 4) && !entry.internal)
    .map((entry) => entry.address);

  return [...new Set(addresses)];
}
```

Create `public/js/room-link.js`:

```js
const ROOM_ID_PATTERN = /^[a-f0-9]{32}$/;

export function createRoomId(cryptoProvider = globalThis.crypto) {
  const bytes = new Uint8Array(16);
  cryptoProvider.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function buildViewerUrl({ protocol, address, port, roomId }) {
  if (!ROOM_ID_PATTERN.test(roomId)) throw new Error('Invalid room ID');
  const authority = port ? `${address}:${port}` : address;
  return `${protocol}//${authority}/#role=viewer&room=${roomId}`;
}

export function parseViewerHash(hash) {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const roomId = params.get('room');
  if (params.get('role') !== 'viewer' || !ROOM_ID_PATTERN.test(roomId ?? '')) return null;
  return { role: 'viewer', roomId };
}
```

- [ ] **Step 5: Verify helpers, format, and commit**

Run: `node --test test/helpers.test.js && npm run lint && npm run format:check`

Expected: all commands exit with code 0. If Prettier reports only formatting differences, run `npm run format` once and repeat the command.

```bash
git add package.json package-lock.json eslint.config.js .gitignore src/network-addresses.js public/js/room-link.js test/helpers.test.js
git commit -m "chore: establish LAN share project foundation"
```

---

### Task 2: Signaling Protocol and Room Registry

**Files:**

- Create: `src/protocol.js`
- Create: `src/room-registry.js`
- Test: `test/protocol.test.js`
- Test: `test/room-registry.test.js`

**Interfaces:**

- Produces: `MAX_SIGNAL_BYTES = 16_384`
- Produces: `parseClientMessage(raw): ClientMessage`
- Produces: `RoomRegistry` methods `hostRoom`, `joinRoom`, `getMembership`, `assertRoute`, `endRoom`, and `removeClient`
- Consumes: 32-character lowercase hexadecimal room IDs created by `createRoomId`

- [ ] **Step 1: Write failing protocol tests**

Create `test/protocol.test.js`:

```js
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { MAX_SIGNAL_BYTES, parseClientMessage } from '../src/protocol.js';

const roomId = '00112233445566778899aabbccddeeff';

test('accepts room and directed WebRTC messages', () => {
  assert.deepEqual(parseClientMessage(JSON.stringify({ type: 'host-room', roomId })), {
    type: 'host-room',
    roomId,
  });
  assert.equal(
    parseClientMessage(
      JSON.stringify({
        type: 'offer',
        roomId,
        targetId: 'viewer-1',
        sdp: { type: 'offer', sdp: 'v=0' },
      }),
    ).type,
    'offer',
  );
});

test('rejects unknown, malformed and oversized messages', () => {
  assert.throws(() => parseClientMessage('{'), /valid JSON/);
  assert.throws(() => parseClientMessage(JSON.stringify({ type: 'unknown' })), /message type/);
  assert.throws(
    () => parseClientMessage(JSON.stringify({ type: 'join-room', roomId: '1234' })),
    /room ID/,
  );
  assert.throws(() => parseClientMessage('x'.repeat(MAX_SIGNAL_BYTES + 1)), /too large/);
});
```

- [ ] **Step 2: Write failing room lifecycle tests**

Create `test/room-registry.test.js`:

```js
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { RoomRegistry } from '../src/room-registry.js';

const roomId = '00112233445566778899aabbccddeeff';

test('hosts a room, joins viewers, and limits membership to five viewers', () => {
  const registry = new RoomRegistry({ maxViewers: 5 });
  registry.hostRoom(roomId, 'host');
  for (let index = 1; index <= 5; index += 1) registry.joinRoom(roomId, `viewer-${index}`);

  assert.deepEqual(registry.getMembership('viewer-1'), { roomId, role: 'viewer' });
  assert.throws(() => registry.joinRoom(roomId, 'viewer-6'), /full/);
  assert.equal(registry.assertRoute(roomId, 'host', 'viewer-1'), 'viewer-1');
  assert.throws(() => registry.assertRoute(roomId, 'viewer-1', 'viewer-2'), /not permitted/);
});

test('ending a room removes every membership', () => {
  const registry = new RoomRegistry();
  registry.hostRoom(roomId, 'host');
  registry.joinRoom(roomId, 'viewer');

  assert.deepEqual(registry.endRoom(roomId, 'host'), ['viewer']);
  assert.equal(registry.getMembership('host'), null);
  assert.equal(registry.getMembership('viewer'), null);
});

test('removing one viewer leaves the room active', () => {
  const registry = new RoomRegistry();
  registry.hostRoom(roomId, 'host');
  registry.joinRoom(roomId, 'viewer');

  assert.deepEqual(registry.removeClient('viewer'), {
    kind: 'viewer-left',
    roomId,
    hostId: 'host',
    viewerId: 'viewer',
  });
  assert.deepEqual(registry.getMembership('host'), { roomId, role: 'host' });
});
```

- [ ] **Step 3: Run protocol and registry tests to verify failure**

Run: `node --test test/protocol.test.js test/room-registry.test.js`

Expected: FAIL because both production modules are missing.

- [ ] **Step 4: Implement message validation**

Create `src/protocol.js` with these exported rules:

```js
export const MAX_SIGNAL_BYTES = 16_384;
const ROOM_ID_PATTERN = /^[a-f0-9]{32}$/;
const DIRECTED_TYPES = new Set(['offer', 'answer', 'ice-candidate']);
const ROOM_TYPES = new Set(['host-room', 'join-room', 'share-ended']);

function requireString(value, label) {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`Invalid ${label}`);
}

export function parseClientMessage(raw) {
  const text = Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw);
  if (Buffer.byteLength(text) > MAX_SIGNAL_BYTES) throw new Error('Signal message too large');

  let message;
  try {
    message = JSON.parse(text);
  } catch {
    throw new Error('Signal message must be valid JSON');
  }

  if (!message || typeof message !== 'object' || Array.isArray(message)) {
    throw new Error('Signal message must be an object');
  }
  if (!ROOM_TYPES.has(message.type) && !DIRECTED_TYPES.has(message.type)) {
    throw new Error('Unsupported message type');
  }
  if (!ROOM_ID_PATTERN.test(message.roomId ?? '')) throw new Error('Invalid room ID');

  if (DIRECTED_TYPES.has(message.type)) {
    requireString(message.targetId, 'target ID');
    const payloadKey = message.type === 'ice-candidate' ? 'candidate' : 'sdp';
    if (!message[payloadKey] || typeof message[payloadKey] !== 'object') {
      throw new Error(`Invalid ${payloadKey}`);
    }
  }

  return message;
}
```

- [ ] **Step 5: Implement the in-memory registry**

Create `src/room-registry.js` with `rooms: Map<roomId, { hostId, viewerIds }>` and `memberships: Map<clientId, { roomId, role }>`.

Required behavior:

```js
export class RoomRegistry {
  constructor({ maxViewers = 5 } = {}) {
    this.maxViewers = maxViewers;
    this.rooms = new Map();
    this.memberships = new Map();
  }

  hostRoom(roomId, hostId) {
    if (this.rooms.has(roomId)) throw new Error('Room already exists');
    if (this.memberships.has(hostId)) throw new Error('Client already joined a room');
    this.rooms.set(roomId, { hostId, viewerIds: new Set() });
    this.memberships.set(hostId, { roomId, role: 'host' });
  }

  joinRoom(roomId, viewerId) {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error('Room unavailable');
    if (this.memberships.has(viewerId)) throw new Error('Client already joined a room');
    if (room.viewerIds.size >= this.maxViewers) throw new Error('Room is full');
    room.viewerIds.add(viewerId);
    this.memberships.set(viewerId, { roomId, role: 'viewer' });
    return room.hostId;
  }

  getMembership(clientId) {
    return this.memberships.get(clientId) ?? null;
  }

  assertRoute(roomId, senderId, targetId) {
    const sender = this.memberships.get(senderId);
    const target = this.memberships.get(targetId);
    if (!sender || !target || sender.roomId !== roomId || target.roomId !== roomId) {
      throw new Error('Signal target is outside the room');
    }
    if (sender.role === target.role) throw new Error('Signal route is not permitted');
    return targetId;
  }

  endRoom(roomId, hostId) {
    const room = this.rooms.get(roomId);
    if (!room || room.hostId !== hostId) throw new Error('Only the room host can end sharing');
    const viewerIds = [...room.viewerIds];
    this.memberships.delete(hostId);
    for (const viewerId of viewerIds) this.memberships.delete(viewerId);
    this.rooms.delete(roomId);
    return viewerIds;
  }

  removeClient(clientId) {
    const membership = this.memberships.get(clientId);
    if (!membership) return null;
    if (membership.role === 'host') {
      const viewerIds = this.endRoom(membership.roomId, clientId);
      return { kind: 'host-left', roomId: membership.roomId, viewerIds };
    }
    const room = this.rooms.get(membership.roomId);
    room?.viewerIds.delete(clientId);
    this.memberships.delete(clientId);
    return {
      kind: 'viewer-left',
      roomId: membership.roomId,
      hostId: room?.hostId,
      viewerId: clientId,
    };
  }
}
```

- [ ] **Step 6: Verify signaling rules and commit**

Run: `node --test test/protocol.test.js test/room-registry.test.js && npm run lint && npm run format:check`

Expected: all tests and checks pass.

```bash
git add src/protocol.js src/room-registry.js test/protocol.test.js test/room-registry.test.js
git commit -m "feat: add in-memory signaling rules"
```

---

### Task 3: HTTP and WebSocket Server

**Files:**

- Create: `src/server.js`
- Test: `test/server.test.js`

**Interfaces:**

- Consumes: `listLanIpv4`, `parseClientMessage`, `MAX_SIGNAL_BYTES`, and `RoomRegistry`
- Produces: `createLanShareServer({ publicDir, networkInterfaces }): { listen, close, server }`
- Produces HTTP: `GET /api/network-info -> { addresses: string[], port: number }`
- Produces WebSocket server events: `room-hosted`, `viewer-accepted`, `viewer-joined`, `viewer-left`, `offer`, `answer`, `ice-candidate`, `share-ended`, `room-unavailable`, `error`

- [ ] **Step 1: Write failing server integration tests**

Create `test/server.test.js` with a `startServer()` helper that creates a temporary public directory, writes `<h1>LAN Desktop Share</h1>` to its `index.html`, calls `createLanShareServer({ publicDir, networkInterfaces })`, and listens on `127.0.0.1` port `0`. Track every started service and temporary directory; `afterEach` closes all services and removes those directories. This keeps Task 3 independently testable before the real UI exists. Add these assertions:

```js
test('serves the app and LAN address API', async () => {
  const app = await startServer({
    networkInterfaces: {
      en0: [{ address: '192.168.10.20', family: 'IPv4', internal: false }],
    },
  });
  const html = await fetch(`${app.origin}/`).then((response) => response.text());
  const info = await fetch(`${app.origin}/api/network-info`).then((response) => response.json());

  assert.match(html, /LAN Desktop Share/);
  assert.deepEqual(info.addresses, ['192.168.10.20']);
  assert.equal(info.port, app.port);
});

test('routes offers only between a host and its viewer', async () => {
  const app = await startServer();
  const host = await openSocket(app.wsOrigin);
  const viewer = await openSocket(app.wsOrigin);

  host.send(JSON.stringify({ type: 'host-room', roomId }));
  await nextMessage(host, 'room-hosted');
  viewer.send(JSON.stringify({ type: 'join-room', roomId }));
  const joined = await nextMessage(host, 'viewer-joined');

  host.send(
    JSON.stringify({
      type: 'offer',
      roomId,
      targetId: joined.viewerId,
      sdp: { type: 'offer', sdp: 'v=0' },
    }),
  );
  const offer = await nextMessage(viewer, 'offer');
  assert.equal(offer.senderId, joined.hostId);
  assert.equal(offer.sdp.sdp, 'v=0');
});

test('notifies every viewer when the host ends sharing', async () => {
  const app = await startServer();
  const host = await openSocket(app.wsOrigin);
  const viewer = await openSocket(app.wsOrigin);
  host.send(JSON.stringify({ type: 'host-room', roomId }));
  await nextMessage(host, 'room-hosted');
  viewer.send(JSON.stringify({ type: 'join-room', roomId }));
  await nextMessage(viewer, 'viewer-accepted');

  host.send(JSON.stringify({ type: 'share-ended', roomId }));
  assert.equal((await nextMessage(viewer, 'share-ended')).roomId, roomId);
});
```

Implement `openSocket` and `nextMessage` in the same test file using the `ws` client. `openSocket(url)` must pass `{ origin: url.replace(/^ws/, 'http') }` so the test exercises the same-origin handshake rule. `nextMessage(socket, type)` must parse incoming JSON, ignore messages with other types, and reject after 2 seconds. Add one handshake test with origin `http://untrusted.example` and expect HTTP 403.

- [ ] **Step 2: Run server tests and verify the missing-server failure**

Run: `node --test test/server.test.js`

Expected: FAIL because `createLanShareServer` is not defined.

- [ ] **Step 3: Implement the HTTP surface**

In `src/server.js`, export `createLanShareServer`. Resolve the public directory relative to `import.meta.url`, serve only files whose resolved path remains inside that directory, and return these MIME types:

```js
const MIME_TYPES = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
]);
```

For `/api/network-info`, call `listLanIpv4(networkInterfaces)` and read the active port from `server.address().port`. Return JSON with `Cache-Control: no-store`. For unknown routes return 404; for traversal attempts return 403. Do not log request URLs.

The returned lifecycle interface must be:

```js
return {
  server,
  listen({ port = 4173, host = '0.0.0.0' } = {}) {
    return new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, host, () => {
        server.off('error', reject);
        resolve(server.address());
      });
    });
  },
  close() {
    for (const socket of webSocketServer.clients) socket.terminate();
    return new Promise((resolve) => webSocketServer.close(() => server.close(resolve)));
  },
};
```

- [ ] **Step 4: Implement WebSocket signaling**

Implement the complete `src/server.js` below. It includes the HTTP surface from Step 3, a `WebSocketServer` with `maxPayload: MAX_SIGNAL_BYTES`, random connection IDs, safe message forwarding, cleanup, and the CLI entry point.

```js
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { WebSocket, WebSocketServer } from 'ws';

import { listLanIpv4 } from './network-addresses.js';
import { MAX_SIGNAL_BYTES, parseClientMessage } from './protocol.js';
import { RoomRegistry } from './room-registry.js';

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultPublicDirectory = path.resolve(moduleDirectory, '../public');
const MIME_TYPES = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
]);

function writeJson(response, statusCode, value) {
  response.writeHead(statusCode, {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
  });
  response.end(JSON.stringify(value));
}

export function createLanShareServer({
  publicDir = defaultPublicDirectory,
  networkInterfaces,
} = {}) {
  const registry = new RoomRegistry({ maxViewers: 5 });
  const sockets = new Map();
  const resolvedPublicDir = path.resolve(publicDir);

  const server = http.createServer(async (request, response) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { Allow: 'GET, HEAD' });
      response.end();
      return;
    }

    let requestUrl;
    try {
      requestUrl = new URL(request.url, 'http://localhost');
    } catch {
      response.writeHead(400).end();
      return;
    }

    if (requestUrl.pathname === '/api/network-info') {
      const address = server.address();
      writeJson(response, 200, {
        addresses: listLanIpv4(networkInterfaces),
        port: typeof address === 'object' && address ? address.port : 4173,
      });
      return;
    }

    let relativePath;
    try {
      relativePath = requestUrl.pathname === '/' ? 'index.html' : decodeURIComponent(requestUrl.pathname.slice(1));
    } catch {
      response.writeHead(400).end();
      return;
    }
    const filePath = path.resolve(resolvedPublicDir, relativePath);
    if (!filePath.startsWith(`${resolvedPublicDir}${path.sep}`)) {
      response.writeHead(403).end();
      return;
    }

    try {
      const body = await fs.readFile(filePath);
      response.writeHead(200, {
        'Cache-Control': 'no-store',
        'Content-Security-Policy':
          "default-src 'self'; connect-src 'self' ws: wss:; media-src 'self' blob:; style-src 'self'; script-src 'self'",
        'Content-Type': MIME_TYPES.get(path.extname(filePath)) ?? 'application/octet-stream',
      });
      response.end(request.method === 'HEAD' ? undefined : body);
    } catch (error) {
      response.writeHead(error.code === 'ENOENT' ? 404 : 500).end();
    }
  });

  const webSocketServer = new WebSocketServer({
    server,
    maxPayload: MAX_SIGNAL_BYTES,
    verifyClient({ origin, req }, done) {
      try {
        done(new URL(origin).host === req.headers.host, 403, 'Origin rejected');
      } catch {
        done(false, 403, 'Origin rejected');
      }
    },
  });
  const send = (clientId, message) => {
    const socket = sockets.get(clientId);
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  };

  webSocketServer.on('connection', (socket) => {
    const clientId = randomUUID();
    sockets.set(clientId, socket);

    socket.on('message', (raw) => {
      let message;
      try {
        message = parseClientMessage(raw);
      } catch {
        send(clientId, { type: 'error', message: 'Invalid signaling message' });
        socket.close(1008, 'Invalid signaling message');
        return;
      }

      try {
        switch (message.type) {
          case 'host-room':
            registry.hostRoom(message.roomId, clientId);
            send(clientId, { type: 'room-hosted', roomId: message.roomId, hostId: clientId });
            break;
          case 'join-room': {
            const hostId = registry.joinRoom(message.roomId, clientId);
            send(clientId, { type: 'viewer-accepted', roomId: message.roomId, hostId });
            send(hostId, {
              type: 'viewer-joined',
              roomId: message.roomId,
              hostId,
              viewerId: clientId,
            });
            break;
          }
          case 'offer':
          case 'answer':
          case 'ice-candidate': {
            registry.assertRoute(message.roomId, clientId, message.targetId);
            const { targetId, ...forwarded } = message;
            send(targetId, { ...forwarded, senderId: clientId });
            break;
          }
          case 'share-ended': {
            const viewerIds = registry.endRoom(message.roomId, clientId);
            for (const viewerId of viewerIds) {
              send(viewerId, { type: 'share-ended', roomId: message.roomId });
            }
            break;
          }
        }
      } catch (error) {
        const unavailable = error.message === 'Room unavailable' || error.message === 'Room is full';
        send(clientId, {
          type: unavailable ? 'room-unavailable' : 'error',
          message: unavailable ? 'Room unavailable' : 'Signaling request rejected',
        });
      }
    });

    socket.on('close', () => {
      sockets.delete(clientId);
      const removal = registry.removeClient(clientId);
      if (removal?.kind === 'viewer-left' && removal.hostId) {
        send(removal.hostId, {
          type: 'viewer-left',
          roomId: removal.roomId,
          viewerId: removal.viewerId,
        });
      }
      if (removal?.kind === 'host-left') {
        for (const viewerId of removal.viewerIds) {
          send(viewerId, { type: 'share-ended', roomId: removal.roomId });
        }
      }
    });
    socket.on('error', () => {});
  });

  return {
    server,
    listen({ port = 4173, host = '0.0.0.0' } = {}) {
      return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, () => {
          server.off('error', reject);
          resolve(server.address());
        });
      });
    },
    close() {
      for (const socket of webSocketServer.clients) socket.terminate();
      return new Promise((resolve) => webSocketServer.close(() => server.close(resolve)));
    },
  };
}

const entryPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (entryPath === import.meta.url) {
  const app = createLanShareServer();
  const port = Number(process.env.PORT ?? 4173);
  await app.listen({ port });
  console.log(`Share page: http://localhost:${port}`);
  for (const address of listLanIpv4()) console.log(`LAN access: http://${address}:${port}`);
}
```

The implementation deliberately maps only “room missing” and “room full” to `room-unavailable`; all other registry errors return a generic `error`. It never prints room IDs or complete viewer links.

- [ ] **Step 5: Verify HTTP and signaling integration, then commit**

Run: `node --test test/server.test.js && npm run lint && npm run format:check`

Expected: HTTP, API, offer routing, share-end, malformed-message and traversal tests all pass.

```bash
git add src/server.js test/server.test.js
git commit -m "feat: serve app and route WebRTC signaling"
```

---

### Task 4: Browser WebRTC Sessions

**Files:**

- Create: `public/js/signaling-client.js`
- Create: `public/js/host-session.js`
- Create: `public/js/viewer-session.js`
- Test: `test/browser-sessions.test.js`

**Interfaces:**

- Produces: `SignalingClient({ url, WebSocketCtor })` with `connect`, `subscribe`, `send`, and `close`
- Produces: `HostSession({ signal, mediaDevices, createPeerConnection, onState, onViewerCount, onPreview })`
- Produces: `ViewerSession({ signal, createPeerConnection, onState, onStream })`
- Consumes: server messages and room IDs defined in Tasks 1–3

- [ ] **Step 1: Write fake browser primitives and failing session tests**

Create `test/browser-sessions.test.js`. Define:

```js
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

class FakePeerConnection {
  constructor() {
    this.addedTracks = [];
    this.localDescription = null;
    this.remoteDescription = null;
    this.connectionState = 'new';
  }
  addTrack(track, stream) {
    this.addedTracks.push({ track, stream });
  }
  async createOffer() {
    return { type: 'offer', sdp: 'host-offer' };
  }
  async createAnswer() {
    return { type: 'answer', sdp: 'viewer-answer' };
  }
  async setLocalDescription(description) {
    this.localDescription = description;
  }
  async setRemoteDescription(description) {
    this.remoteDescription = description;
  }
  async addIceCandidate(candidate) {
    this.remoteCandidate = candidate;
  }
  close() {
    this.connectionState = 'closed';
  }
}
```

Add tests proving:

1. `HostSession.start(roomId)` calls `getDisplayMedia({ video: true, audio: false })`, registers the room, exposes the stream to `onPreview`, and adds only the video track.
2. A `viewer-joined` message creates one peer, sends an offer to that viewer, and increments the count.
3. `viewer-left` closes only that viewer's peer.
4. A track `ended` event runs the same cleanup as `HostSession.stop()` and sends `share-ended` once.
5. `ViewerSession.join(roomId)` sends `join-room`; an offer sets the remote description, creates an answer, and sends the answer to the host.
6. A viewer `track` event forwards the remote stream to `onStream`; `share-ended` closes the peer and reports `ended`.

- [ ] **Step 2: Run session tests and verify failure**

Run: `node --test test/browser-sessions.test.js`

Expected: FAIL because the signaling client and session classes do not exist.

- [ ] **Step 3: Implement the signaling client**

Create `public/js/signaling-client.js`:

```js
export class SignalingClient {
  constructor({ url, WebSocketCtor = WebSocket }) {
    this.url = url;
    this.WebSocketCtor = WebSocketCtor;
    this.listeners = new Set();
    this.socket = null;
  }

  connect() {
    return new Promise((resolve, reject) => {
      const socket = new this.WebSocketCtor(this.url);
      this.socket = socket;
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', reject, { once: true });
      socket.addEventListener('message', (event) => {
        const message = JSON.parse(event.data);
        for (const listener of this.listeners) listener(message);
      });
      socket.addEventListener('close', () => {
        for (const listener of this.listeners) listener({ type: 'signal-closed' });
      });
    });
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  send(message) {
    if (!this.socket || this.socket.readyState !== this.WebSocketCtor.OPEN) {
      throw new Error('Signaling connection is not open');
    }
    this.socket.send(JSON.stringify(message));
  }

  close() {
    this.socket?.close();
  }
}
```

- [ ] **Step 4: Implement host capture and peer management**

Create `public/js/host-session.js`:

```js
export class HostSession {
  constructor({
    signal,
    mediaDevices = navigator.mediaDevices,
    createPeerConnection = () => new RTCPeerConnection(),
    onState = () => {},
    onViewerCount = () => {},
    onPreview = () => {},
  }) {
    this.signal = signal;
    this.mediaDevices = mediaDevices;
    this.createPeerConnection = createPeerConnection;
    this.onState = onState;
    this.onViewerCount = onViewerCount;
    this.onPreview = onPreview;
    this.peers = new Map();
    this.roomId = null;
    this.stream = null;
    this.unsubscribe = null;
    this.endSent = false;
  }

  async start(roomId) {
    if (this.stream) throw new Error('Sharing is already active');
    this.roomId = roomId;
    this.endSent = false;
    this.unsubscribe = this.signal.subscribe((message) => {
      void this.handleMessage(message).catch(() => {
        const viewerId = message.viewerId ?? message.senderId;
        if (viewerId) this.removePeer(viewerId);
        this.onState('connection-error');
      });
    });

    try {
      this.stream = await this.mediaDevices.getDisplayMedia({ video: true, audio: false });
    } catch (error) {
      this.unsubscribe?.();
      this.unsubscribe = null;
      this.roomId = null;
      this.onState('permission-denied');
      throw error;
    }

    for (const track of this.stream.getVideoTracks()) {
      track.addEventListener('ended', () => this.stop(), { once: true });
    }
    this.onPreview(this.stream);
    this.signal.send({ type: 'host-room', roomId });
    this.onState('sharing');
  }

  async createPeer(viewerId, retryCount = 0) {
    this.removePeer(viewerId, { updateCount: false });
    const peer = this.createPeerConnection();
    this.peers.set(viewerId, { peer, retryCount });
    for (const track of this.stream.getVideoTracks()) peer.addTrack(track, this.stream);

    peer.onicecandidate = ({ candidate }) => {
      if (candidate && this.roomId) {
        this.signal.send({
          type: 'ice-candidate',
          roomId: this.roomId,
          targetId: viewerId,
          candidate,
        });
      }
    };
    peer.onconnectionstatechange = () => {
      if (peer.connectionState !== 'failed') return;
      if (retryCount < 1 && this.roomId && this.stream) {
        void this.createPeer(viewerId, retryCount + 1).catch(() => {
          this.removePeer(viewerId);
          this.onState('viewer-failed');
        });
      } else {
        this.removePeer(viewerId);
        this.onState('viewer-failed');
      }
    };

    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    this.signal.send({ type: 'offer', roomId: this.roomId, targetId: viewerId, sdp: offer });
    this.onViewerCount(this.peers.size);
  }

  async handleMessage(message) {
    if (message.type === 'viewer-joined') {
      await this.createPeer(message.viewerId);
      return;
    }
    if (message.type === 'viewer-left') {
      this.removePeer(message.viewerId);
      return;
    }
    if (message.type === 'answer') {
      await this.peers.get(message.senderId)?.peer.setRemoteDescription(message.sdp);
      return;
    }
    if (message.type === 'ice-candidate') {
      await this.peers.get(message.senderId)?.peer.addIceCandidate(message.candidate);
      return;
    }
    if (message.type === 'signal-closed') this.onState('signal-closed');
    if (message.type === 'error') this.onState('connection-error');
  }

  removePeer(viewerId, { updateCount = true } = {}) {
    this.peers.get(viewerId)?.peer.close();
    this.peers.delete(viewerId);
    if (updateCount) this.onViewerCount(this.peers.size);
  }

  stop({ notify = true } = {}) {
    if (!this.roomId && !this.stream) return;
    const activeRoomId = this.roomId;
    this.roomId = null;
    this.unsubscribe?.();
    this.unsubscribe = null;
    for (const track of this.stream?.getTracks() ?? []) track.stop();
    this.stream = null;
    this.onPreview(null);
    for (const { peer } of this.peers.values()) peer.close();
    this.peers.clear();
    this.onViewerCount(0);
    if (notify && activeRoomId && !this.endSent) {
      this.endSent = true;
      this.signal.send({ type: 'share-ended', roomId: activeRoomId });
    }
    this.onState('stopped');
  }
}
```

The test must cover the isolated negotiation-error path so one failed viewer does not affect the others.

- [ ] **Step 5: Implement viewer peer lifecycle**

Create `public/js/viewer-session.js`:

```js
export class ViewerSession {
  constructor({
    signal,
    createPeerConnection = () => new RTCPeerConnection(),
    onState = () => {},
    onStream = () => {},
  }) {
    this.signal = signal;
    this.createPeerConnection = createPeerConnection;
    this.onState = onState;
    this.onStream = onStream;
    this.roomId = null;
    this.hostId = null;
    this.peer = null;
    this.unsubscribe = null;
  }

  join(roomId) {
    this.roomId = roomId;
    this.unsubscribe = this.signal.subscribe((message) => {
      void this.handleMessage(message).catch(() => this.onState('disconnected'));
    });
    this.onState('connecting');
    this.signal.send({ type: 'join-room', roomId });
  }

  async handleMessage(message) {
    if (message.type === 'viewer-accepted') {
      this.hostId = message.hostId;
      this.onState('waiting-for-video');
      return;
    }
    if (message.type === 'offer') {
      this.hostId = message.senderId;
      this.peer?.close();
      const peer = this.createPeerConnection();
      this.peer = peer;
      peer.onicecandidate = ({ candidate }) => {
        if (candidate && this.roomId && this.hostId) {
          this.signal.send({
            type: 'ice-candidate',
            roomId: this.roomId,
            targetId: this.hostId,
            candidate,
          });
        }
      };
      peer.ontrack = (event) => {
        this.onStream(event.streams[0]);
        this.onState('watching');
      };
      peer.onconnectionstatechange = () => {
        if (peer.connectionState === 'failed') this.onState('reconnecting');
      };
      await peer.setRemoteDescription(message.sdp);
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      this.signal.send({
        type: 'answer',
        roomId: this.roomId,
        targetId: this.hostId,
        sdp: answer,
      });
      return;
    }
    if (message.type === 'ice-candidate') {
      await this.peer?.addIceCandidate(message.candidate);
      return;
    }
    if (message.type === 'share-ended') {
      this.close({ state: 'ended' });
      return;
    }
    if (message.type === 'room-unavailable') {
      this.close({ state: 'room-unavailable' });
      return;
    }
    if (message.type === 'signal-closed') this.onState('disconnected');
    if (message.type === 'error') this.onState('disconnected');
  }

  close({ state = 'disconnected' } = {}) {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.peer?.close();
    this.peer = null;
    this.onStream(null);
    if (state) this.onState(state);
  }
}
```

- [ ] **Step 6: Verify browser session behavior and commit**

Run: `node --test test/browser-sessions.test.js && npm run lint && npm run format:check`

Expected: all fake-based capture, offer/answer, ICE, per-viewer cleanup and share-end tests pass.

```bash
git add public/js/signaling-client.js public/js/host-session.js public/js/viewer-session.js test/browser-sessions.test.js
git commit -m "feat: manage host and viewer WebRTC sessions"
```

---

### Task 5: Tailwind Host and Viewer UI

**Files:**

- Create: `public/styles/input.css`
- Create: `public/index.html`
- Create: `public/js/app.js`
- Test: `test/ui-shell.test.js`

**Interfaces:**

- Consumes: `createRoomId`, `buildViewerUrl`, `parseViewerHash`, `SignalingClient`, `HostSession`, and `ViewerSession`
- Consumes HTTP: `/api/network-info`
- Produces DOM hooks: `host-panel`, `viewer-panel`, `start-button`, `stop-button`, `copy-button`, `viewer-link`, `viewer-count`, `host-video`, `viewer-video`, `host-status`, `viewer-status`, `retry-button`

- [ ] **Step 1: Write a failing UI shell contract test**

Create `test/ui-shell.test.js`:

```js
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { test } from 'node:test';

test('HTML exposes every app hook and uses local Tailwind output', async () => {
  const html = await fs.readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  const requiredIds = [
    'host-panel',
    'viewer-panel',
    'start-button',
    'stop-button',
    'copy-button',
    'viewer-link',
    'viewer-count',
    'host-video',
    'viewer-video',
    'host-status',
    'viewer-status',
    'retry-button',
  ];

  for (const id of requiredIds) assert.match(html, new RegExp(`id=["']${id}["']`));
  assert.match(html, /href="\/styles\.css"/);
  assert.doesNotMatch(html, /cdn\.tailwindcss\.com|https:\/\//);
});
```

- [ ] **Step 2: Run the UI test and verify failure**

Run: `node --test test/ui-shell.test.js`

Expected: FAIL because `public/index.html` does not exist.

- [ ] **Step 3: Create Tailwind source and accessible HTML**

Create `public/styles/input.css`:

```css
@import 'tailwindcss';

@layer base {
  body {
    @apply min-h-screen bg-slate-950 text-slate-100 antialiased;
  }

  button:focus-visible,
  input:focus-visible {
    @apply outline-none ring-2 ring-cyan-400 ring-offset-2 ring-offset-slate-950;
  }
}
```

Create `public/index.html`:

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="color-scheme" content="dark" />
    <title>LAN Desktop Share</title>
    <link rel="stylesheet" href="/styles.css" />
  </head>
  <body>
    <main class="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-6 sm:px-6 lg:px-8">
      <header class="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p class="text-sm font-semibold tracking-[0.2em] text-cyan-300">LOCAL WEBRTC</p>
          <h1 class="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">LAN Desktop Share</h1>
        </div>
        <p class="max-w-md text-sm leading-6 text-slate-400">画面仅在局域网浏览器之间传输，不录音、不保存。</p>
      </header>

      <section id="host-panel" class="grid flex-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div class="overflow-hidden rounded-2xl border border-white/10 bg-slate-900 shadow-2xl shadow-black/30">
          <div class="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <span class="text-sm font-medium text-slate-300">本地预览</span>
            <span id="host-status" aria-live="polite" class="rounded-full bg-slate-800 px-3 py-1 text-xs font-medium text-slate-300">等待开始</span>
          </div>
          <div class="aspect-video bg-black">
            <video id="host-video" class="h-full w-full object-contain" autoplay muted playsinline></video>
          </div>
        </div>

        <aside class="flex flex-col gap-5 rounded-2xl border border-white/10 bg-slate-900/80 p-5">
          <div>
            <p class="text-sm text-slate-400">当前观看</p>
            <p class="mt-1 text-3xl font-semibold"><span id="viewer-count">0</span><span class="ml-1 text-base font-normal text-slate-500">/ 5</span></p>
          </div>
          <button id="start-button" type="button" class="min-h-11 rounded-xl bg-cyan-400 px-4 py-3 font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50">开始共享</button>
          <button id="stop-button" type="button" disabled class="min-h-11 rounded-xl border border-rose-400/40 bg-rose-400/10 px-4 py-3 font-semibold text-rose-200 transition hover:bg-rose-400/20 disabled:cursor-not-allowed disabled:opacity-40">停止共享</button>
          <div class="border-t border-white/10 pt-5">
            <label for="viewer-link" class="text-sm font-medium text-slate-300">观看链接</label>
            <input id="viewer-link" type="text" readonly class="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-3 text-sm text-slate-300" />
            <button id="copy-button" type="button" disabled class="mt-3 min-h-11 w-full rounded-xl border border-white/15 px-4 py-3 font-medium transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40">复制链接</button>
          </div>
        </aside>
      </section>

      <section id="viewer-panel" hidden class="flex flex-1 flex-col overflow-hidden rounded-2xl border border-white/10 bg-slate-900 shadow-2xl shadow-black/30">
        <div class="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <span class="text-sm font-medium text-slate-300">实时桌面</span>
          <span id="viewer-status" aria-live="polite" class="rounded-full bg-slate-800 px-3 py-1 text-xs font-medium text-slate-300">正在连接</span>
        </div>
        <div class="flex min-h-0 flex-1 items-center justify-center bg-black">
          <video id="viewer-video" class="max-h-full w-full object-contain" autoplay playsinline></video>
        </div>
        <div class="p-4 text-center">
          <button id="retry-button" type="button" hidden class="min-h-11 rounded-xl bg-cyan-400 px-5 py-3 font-semibold text-slate-950 hover:bg-cyan-300">重新连接</button>
        </div>
      </section>

      <footer class="mt-6 text-sm leading-6 text-slate-500">分享者请使用 localhost 打开；观看者建议使用最新版 Chrome 或 Edge。防火墙或访客 Wi-Fi 隔离可能阻止连接。</footer>
    </main>
    <script type="module" src="/js/app.js"></script>
  </body>
</html>
```

- [ ] **Step 4: Wire the host role in `app.js`**

Create `public/js/app.js` with the host constants and startup path below. Keep status copy in static maps so no raw exception, SDP, ICE candidate, room ID, or stack trace reaches the DOM.

```js
import { HostSession } from './host-session.js';
import { buildViewerUrl, createRoomId, parseViewerHash } from './room-link.js';
import { SignalingClient } from './signaling-client.js';
import { ViewerSession } from './viewer-session.js';

const byId = (id) => document.getElementById(id);
const elements = {
  hostPanel: byId('host-panel'),
  viewerPanel: byId('viewer-panel'),
  startButton: byId('start-button'),
  stopButton: byId('stop-button'),
  copyButton: byId('copy-button'),
  viewerLink: byId('viewer-link'),
  viewerCount: byId('viewer-count'),
  hostVideo: byId('host-video'),
  viewerVideo: byId('viewer-video'),
  hostStatus: byId('host-status'),
  viewerStatus: byId('viewer-status'),
  retryButton: byId('retry-button'),
};

const hostCopy = {
  idle: '等待开始',
  sharing: '正在共享',
  stopped: '已停止',
  'permission-denied': '未获得屏幕权限，可重试',
  'connection-error': '连接协商失败',
  'viewer-failed': '一位观看者连接失败',
  'signal-closed': '连接服务已断开',
};
const viewerCopy = {
  connecting: '正在连接',
  'waiting-for-video': '等待分享画面',
  watching: '正在观看',
  reconnecting: '正在重新连接',
  disconnected: '连接已中断',
  'room-unavailable': '链接无效或分享尚未开始',
  ended: '分享已结束',
};
const socketProtocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
const socketUrl = `${socketProtocol}//${location.host}`;

function showHost() {
  elements.hostPanel.hidden = false;
  elements.viewerPanel.hidden = true;
}

function showViewer() {
  elements.hostPanel.hidden = true;
  elements.viewerPanel.hidden = false;
}

async function runHost() {
  showHost();
  const roomId = createRoomId();
  const response = await fetch('/api/network-info', { cache: 'no-store' });
  if (!response.ok) throw new Error('Network information unavailable');
  const { addresses, port } = await response.json();
  const address = addresses[0];
  let session = null;
  let signal = null;
  let sharing = false;

  if (address) {
    elements.viewerLink.value = buildViewerUrl({
      protocol: location.protocol,
      address,
      port: String(port),
      roomId,
    });
  } else {
    elements.hostStatus.textContent = '未找到局域网地址，请检查网络';
  }

  elements.startButton.addEventListener('click', async () => {
    elements.startButton.disabled = true;
    try {
      signal = new SignalingClient({ url: socketUrl });
      await signal.connect();
      session = new HostSession({
        signal,
        onPreview: (stream) => {
          elements.hostVideo.srcObject = stream;
        },
        onViewerCount: (count) => {
          elements.viewerCount.textContent = String(count);
        },
        onState: (state) => {
          elements.hostStatus.textContent = hostCopy[state] ?? '状态已更新';
          if (state === 'stopped') {
            sharing = false;
            elements.startButton.disabled = false;
            elements.stopButton.disabled = true;
            elements.copyButton.disabled = true;
            signal?.close();
          }
        },
      });
      await session.start(roomId);
      sharing = true;
      elements.stopButton.disabled = false;
      elements.copyButton.disabled = !address;
    } catch {
      signal?.close();
      elements.startButton.disabled = false;
    }
  });

  elements.stopButton.addEventListener('click', () => {
    session?.stop();
    signal?.close();
    session = null;
    signal = null;
    sharing = false;
    elements.startButton.disabled = false;
    elements.stopButton.disabled = true;
    elements.copyButton.disabled = true;
  });

  elements.copyButton.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(elements.viewerLink.value);
      elements.hostStatus.textContent = '链接已复制';
    } catch {
      elements.hostStatus.textContent = '复制失败，请手动复制';
    }
  });

  addEventListener('beforeunload', (event) => {
    if (!sharing) return;
    event.preventDefault();
    event.returnValue = '';
  });
  addEventListener('pagehide', () => session?.stop());
}
```

- [ ] **Step 5: Wire the viewer role and one bounded reconnect**

Append the viewer path and bootstrap to the same `app.js`:

```js
async function runViewer(roomId) {
  showViewer();
  let signal = null;
  let session = null;
  let reconnects = 0;
  let ended = false;
  let timer = null;

  const closeCurrent = () => {
    session?.close({ state: null });
    signal?.close();
    session = null;
    signal = null;
  };

  const connect = async () => {
    clearTimeout(timer);
    signal = new SignalingClient({ url: socketUrl });
    await signal.connect();
    session = new ViewerSession({
      signal,
      onStream: (stream) => {
        elements.viewerVideo.srcObject = stream;
        if (!stream) return;
        elements.viewerVideo.play().catch(() => {
          elements.retryButton.hidden = false;
          elements.retryButton.textContent = '点击播放';
        });
      },
      onState: (state) => {
        elements.viewerStatus.textContent = viewerCopy[state] ?? '状态已更新';
        if (state === 'ended') {
          ended = true;
          elements.retryButton.hidden = true;
          return;
        }
        if ((state === 'disconnected' || state === 'reconnecting') && !ended) {
          if (reconnects < 1) {
            reconnects += 1;
            timer = setTimeout(() => {
              closeCurrent();
              void connect().catch(showRetry);
            }, 1000);
          } else {
            showRetry();
          }
        }
        if (state === 'room-unavailable') showRetry();
      },
    });
    session.join(roomId);
  };

  const showRetry = () => {
    elements.retryButton.hidden = false;
    elements.retryButton.textContent = '重新连接';
  };

  elements.retryButton.addEventListener('click', async () => {
    if (elements.viewerVideo.srcObject && elements.viewerVideo.paused) {
      await elements.viewerVideo.play();
      elements.retryButton.hidden = true;
      return;
    }
    reconnects = 0;
    ended = false;
    elements.retryButton.hidden = true;
    closeCurrent();
    await connect().catch(showRetry);
  });

  await connect().catch(showRetry);
  addEventListener('pagehide', closeCurrent, { once: true });
}

async function main() {
  const viewer = parseViewerHash(location.hash);
  if (viewer) await runViewer(viewer.roomId);
  else await runHost();
}

main().catch(() => {
  const status = parseViewerHash(location.hash) ? elements.viewerStatus : elements.hostStatus;
  status.textContent = '页面初始化失败，请刷新后重试';
});
```

Because `connect` references `showRetry`, declare `showRetry` before the first call to `connect`; the code above satisfies that at runtime because `connect()` is invoked after both constants are initialized. Add a test case or lint assertion that guards against duplicate reconnect timers after an `ended` state.

- [ ] **Step 6: Build styles, verify UI contracts, and commit**

Run: `npm run styles:build && node --test test/ui-shell.test.js && npm run lint && npm run format:check`

Expected: `public/styles.css` is generated, the UI shell test passes, and source checks pass. Confirm `git status --short` does not list `public/styles.css`.

```bash
git add public/index.html public/styles/input.css public/js/app.js test/ui-shell.test.js
git commit -m "feat: add Tailwind desktop sharing interface"
```

---

### Task 6: Full Verification, Documentation, and Deliverable

**Files:**

- Create: `README.md`
- Modify: `.ai/tasks/lan-desktop-share.md`
- Create at delivery time: `outputs/lan-desktop-share.zip`

**Interfaces:**

- Consumes: complete app and all checks from Tasks 1–5
- Produces: repeatable setup instructions, captured verification evidence, and a user-facing source archive

- [ ] **Step 1: Run the complete automated gate**

Run: `npm run check`

Expected: Tailwind build, ESLint, Prettier check, helper tests, protocol tests, registry tests, server integration tests, browser session tests, and UI contract test all pass.

- [ ] **Step 2: Probe the running HTTP service without opening a browser**

Run the server in a PTY with `npm start`. From a second command, run:

```bash
curl --fail --silent http://localhost:4173/ >/dev/null
curl --fail --silent http://localhost:4173/api/network-info
```

Expected: the first command exits 0; the second returns JSON with `addresses` and `port: 4173`. Stop the PTY cleanly with Ctrl-C after probes.

- [ ] **Step 3: Perform host-side browser smoke verification**

Open `http://localhost:4173` in current Chrome or Edge and verify:

- The page shows the host controls and no external asset failures.
- Clicking start opens the browser's native screen/window selector.
- Canceling the selector returns to idle with a retryable permission message.
- Selecting a window produces a muted local preview and a LAN viewer link.
- Copy and stop controls update status correctly.

Record browser name/version, date, chosen capture type, and observed result in `.ai/tasks/lan-desktop-share.md`. Do not record the generated room ID or complete viewer URL.

- [ ] **Step 4: Perform real LAN viewer verification when a second device is available**

On a second device connected to the same LAN, open the generated link in Chrome or Edge and verify:

- The remote video appears and updates in real time with no sound.
- Viewer count changes on join and leave.
- Refreshing the viewer reconnects.
- Stopping the host causes the viewer to show “分享已结束”.

Repeat with additional browsers up to five when practical. Record the number of verified simultaneous viewers and each result in `.ai/tasks/lan-desktop-share.md`, without recording device names, IP addresses, room IDs, or viewer URLs. If no second device is available, mark this gate as not run rather than claiming LAN success.

- [ ] **Step 5: Verify that no media artifacts were created**

Before and after one complete share session, run:

```bash
find . -path './node_modules' -prune -o -type f \( -name '*.webm' -o -name '*.mp4' -o -name '*.mkv' -o -name '*.png' -o -name '*.jpg' \) -print
```

Expected: no media files are printed from the application workspace.

- [ ] **Step 6: Write the README**

Create `README.md` with:

- Requirements: current Node.js, same mutually reachable LAN, latest Chrome/Edge.
- Install: `npm install`.
- Start: `npm start`.
- Host flow: open `http://localhost:4173`, start sharing, choose a source, copy the LAN link.
- Viewer flow: open the received link and wait for video.
- Stop flow: use the page button or browser sharing control, then stop the Node process.
- Privacy: video only, no recording, in-memory signaling, media does not pass through the Node service.
- Troubleshooting: macOS/Windows firewall prompt, guest Wi-Fi isolation, missing LAN address, permission cancellation, autoplay click, and browser compatibility.
- Security warning: anyone holding the live random link and able to reach the service can attempt to join; do not expose port 4173 to the internet.

- [ ] **Step 7: Update task evidence and run the final gate again**

Update `.ai/tasks/lan-desktop-share.md` with exact command results and separate fields for:

```markdown
- Automated checks: passed or failed, command, date
- Local HTTP probes: passed or failed, command, date
- Host browser smoke: passed, failed, or not run, browser, date
- Real LAN multi-device: passed, failed, or not run, viewer count, date
- Media artifact check: passed or failed, command, date
- Remaining gap: explicit statement when real second-device validation was not available
```

Run: `npm run check && git diff --check && git status --short`

Expected: all checks pass; only `README.md` and `.ai/tasks/lan-desktop-share.md` are pending before the documentation commit.

- [ ] **Step 8: Commit documentation and create the user-facing archive**

```bash
git add README.md .ai/tasks/lan-desktop-share.md
git commit -m "docs: add LAN sharing setup and verification"
mkdir -p outputs
git archive --format=zip --output=outputs/lan-desktop-share.zip HEAD
```

Expected: the archive contains tracked source, tests, design, plan, and README; it excludes `node_modules`, generated CSS, room IDs, credentials, and media files. The recipient runs `npm install && npm start`, which builds Tailwind CSS automatically through `prestart`.

- [ ] **Step 9: Perform the completion audit**

Run:

```bash
git status --short
git log --oneline --decorate -7
unzip -l outputs/lan-desktop-share.zip
```

Expected: the Git worktree is clean except for the ignored archive; the log shows the six scoped implementation/documentation commits after the design and plan commits; the archive has no `node_modules`, generated `public/styles.css`, media files, secrets, or cookies.
