import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { WebSocket, WebSocketServer } from "ws";

import { ControlBridge, ControlBridgeError } from "./control-bridge.js";
import { isControlMessageType, isLoopbackAddress } from "./control-protocol.js";
import { listLanIpv4 } from "./network-addresses.js";
import { MAX_SIGNAL_BYTES, parseClientMessage } from "./protocol.js";
import { RoomRegistry } from "./room-registry.js";

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultPublicDirectory = path.resolve(moduleDirectory, "../public");
const MIME_TYPES = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".svg", "image/svg+xml"],
]);

function writeJson(response, statusCode, value) {
  response.writeHead(statusCode, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(value));
}

export function createLanShareServer({
  publicDir = defaultPublicDirectory,
  networkInterfaces,
  controlBridge: providedControlBridge,
} = {}) {
  const registry = new RoomRegistry({ maxViewers: 5 });
  const sockets = new Map();
  const clientMetadata = new Map();
  const resolvedPublicDir = path.resolve(publicDir);

  const server = http.createServer(async (request, response) => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405, { Allow: "GET, HEAD" });
      response.end();
      return;
    }

    let requestUrl;
    try {
      requestUrl = new URL(request.url, "http://localhost");
    } catch {
      response.writeHead(400).end();
      return;
    }

    if (requestUrl.pathname === "/api/network-info") {
      const address = server.address();
      writeJson(response, 200, {
        addresses: listLanIpv4(networkInterfaces),
        port: typeof address === "object" && address ? address.port : 4173,
      });
      return;
    }

    let relativePath;
    try {
      relativePath =
        requestUrl.pathname === "/"
          ? "index.html"
          : decodeURIComponent(requestUrl.pathname.slice(1));
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
        "Cache-Control": "no-store",
        "Content-Security-Policy":
          "default-src 'self'; connect-src 'self' ws: wss:; media-src 'self' blob:; style-src 'self'; script-src 'self'",
        "Content-Type":
          MIME_TYPES.get(path.extname(filePath)) ?? "application/octet-stream",
      });
      response.end(request.method === "HEAD" ? undefined : body);
    } catch (error) {
      response.writeHead(error.code === "ENOENT" ? 404 : 500).end();
    }
  });

  const webSocketServer = new WebSocketServer({
    server,
    maxPayload: MAX_SIGNAL_BYTES,
    verifyClient({ origin, req }, done) {
      try {
        done(new URL(origin).host === req.headers.host, 403, "Origin rejected");
      } catch {
        done(false, 403, "Origin rejected");
      }
    },
  });
  const send = (clientId, message) => {
    const socket = sockets.get(clientId);
    if (socket?.readyState === WebSocket.OPEN)
      socket.send(JSON.stringify(message));
  };
  const notifyLeaseEnded = (lease) => {
    send(lease.hostId, {
      type: "control-stopped",
      roomId: lease.roomId,
      viewerId: lease.viewerId,
      leaseId: lease.leaseId,
      reason: lease.reason,
    });
  };
  const controlBridge = providedControlBridge ?? new ControlBridge();
  controlBridge.setOnLeaseEnded?.(notifyLeaseEnded);

  const assertHostControlAccess = (clientId, roomId) => {
    const metadata = clientMetadata.get(clientId);
    const membership = registry.getMembership(clientId);
    if (
      !metadata?.isLoopback ||
      membership?.role !== "host" ||
      membership.roomId !== roomId
    ) {
      throw new ControlBridgeError("control-request-rejected");
    }
  };

  const assertViewerInRoom = (viewerId, roomId) => {
    const membership = registry.getMembership(viewerId);
    if (membership?.role !== "viewer" || membership.roomId !== roomId) {
      throw new ControlBridgeError("control-request-rejected");
    }
  };

  const handleControlMessage = async (clientId, message) => {
    assertHostControlAccess(clientId, message.roomId);
    if (message.viewerId) assertViewerInRoom(message.viewerId, message.roomId);

    switch (message.type) {
      case "control-probe": {
        const result = await controlBridge.probe({
          roomId: message.roomId,
          hostId: clientId,
        });
        send(clientId, {
          type: "control-capabilities",
          roomId: message.roomId,
          requestId: message.requestId,
          available: result.available,
          reason: result.reason,
          displays: result.displays,
          bindingId: result.bindingId,
        });
        break;
      }
      case "control-identify": {
        const result = await controlBridge.identify({
          roomId: message.roomId,
          hostId: clientId,
        });
        send(clientId, {
          type: "control-identified",
          roomId: message.roomId,
          requestId: message.requestId,
          displays: result.displays,
          bindingId: result.bindingId,
        });
        break;
      }
      case "control-start": {
        const lease = await controlBridge.start({
          roomId: message.roomId,
          hostId: clientId,
          viewerId: message.viewerId,
          displayId: message.displayId,
          bindingId: message.bindingId,
        });
        send(clientId, {
          type: "control-started",
          roomId: lease.roomId,
          viewerId: lease.viewerId,
          leaseId: lease.leaseId,
          expiresAt: lease.expiresAt,
        });
        break;
      }
      case "control-event":
        await controlBridge.forward({
          roomId: message.roomId,
          hostId: clientId,
          viewerId: message.viewerId,
          leaseId: message.leaseId,
          seq: message.seq,
          event: message.event,
        });
        break;
      case "control-stop": {
        const lease = await controlBridge.stop({
          roomId: message.roomId,
          hostId: clientId,
          viewerId: message.viewerId,
          leaseId: message.leaseId,
          reason: "revoked",
        });
        if (lease) notifyLeaseEnded(lease);
        break;
      }
    }
  };

  webSocketServer.on("connection", (socket, request) => {
    const clientId = randomUUID();
    sockets.set(clientId, socket);
    clientMetadata.set(clientId, {
      isLoopback: isLoopbackAddress(request.socket.remoteAddress),
    });

    const processMessage = async (raw) => {
      let message;
      try {
        message = parseClientMessage(raw);
      } catch {
        send(clientId, { type: "error", message: "Invalid signaling message" });
        socket.close(1008, "Invalid signaling message");
        return;
      }

      try {
        if (isControlMessageType(message.type)) {
          await handleControlMessage(clientId, message);
          return;
        }
        switch (message.type) {
          case "host-room":
            registry.hostRoom(message.roomId, clientId);
            send(clientId, {
              type: "room-hosted",
              roomId: message.roomId,
              hostId: clientId,
            });
            break;
          case "join-room": {
            const hostId = registry.joinRoom(message.roomId, clientId);
            send(clientId, {
              type: "viewer-accepted",
              roomId: message.roomId,
              hostId,
            });
            send(hostId, {
              type: "viewer-joined",
              roomId: message.roomId,
              hostId,
              viewerId: clientId,
            });
            break;
          }
          case "offer":
          case "answer":
          case "ice-candidate": {
            registry.assertRoute(message.roomId, clientId, message.targetId);
            const { targetId, ...forwarded } = message;
            send(targetId, { ...forwarded, senderId: clientId });
            break;
          }
          case "share-ended": {
            await controlBridge.stopForClient(clientId, "share-ended");
            const viewerIds = registry.endRoom(message.roomId, clientId);
            for (const viewerId of viewerIds) {
              send(viewerId, { type: "share-ended", roomId: message.roomId });
            }
            break;
          }
        }
      } catch (error) {
        if (isControlMessageType(message.type)) {
          send(clientId, {
            type: "control-error",
            roomId: message.roomId,
            requestId: message.requestId,
            reason:
              error instanceof ControlBridgeError
                ? error.reason
                : "control-request-rejected",
          });
          return;
        }
        const unavailable =
          error.message === "Room unavailable" ||
          error.message === "Room is full";
        send(clientId, {
          type: unavailable ? "room-unavailable" : "error",
          message: unavailable
            ? "Room unavailable"
            : "Signaling request rejected",
        });
      }
    };

    let messageQueue = Promise.resolve();
    socket.on("message", (raw) => {
      messageQueue = messageQueue.then(() => processMessage(raw));
    });

    socket.on("close", () => {
      sockets.delete(clientId);
      clientMetadata.delete(clientId);
      void controlBridge.stopForClient(clientId).then((leases) => {
        for (const lease of leases) {
          if (lease) notifyLeaseEnded(lease);
        }
      });
      const removal = registry.removeClient(clientId);
      if (removal?.kind === "viewer-left" && removal.hostId) {
        send(removal.hostId, {
          type: "viewer-left",
          roomId: removal.roomId,
          viewerId: removal.viewerId,
        });
      }
      if (removal?.kind === "host-left") {
        for (const viewerId of removal.viewerIds) {
          send(viewerId, { type: "share-ended", roomId: removal.roomId });
        }
      }
    });
    socket.on("error", () => {});
  });

  return {
    server,
    listen({ port = 4173, host = "0.0.0.0" } = {}) {
      return new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, host, () => {
          server.off("error", reject);
          resolve(server.address());
        });
      });
    },
    async close() {
      await controlBridge.closeAll();
      for (const socket of webSocketServer.clients) socket.terminate();
      await new Promise((resolve) =>
        webSocketServer.close(() => server.close(resolve)),
      );
    },
  };
}

const entryPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : "";
if (entryPath === import.meta.url) {
  const app = createLanShareServer();
  const port = Number(process.env.PORT ?? 4173);
  await app.listen({ port });
  console.log(`Share page: http://localhost:${port}`);
  for (const address of listLanIpv4())
    console.log(`LAN access: http://${address}:${port}`);

  let closing = false;
  const shutdown = async () => {
    if (closing) return;
    closing = true;
    await app.close();
  };
  process.once("SIGINT", () => void shutdown());
  process.once("SIGTERM", () => void shutdown());
}
