import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildViewerUrl,
  createRoomId,
  parseViewerHash,
} from "../public/js/room-link.js";
import { listLanIpv4 } from "../src/network-addresses.js";

test("listLanIpv4 returns unique non-internal IPv4 addresses", () => {
  const interfaces = {
    en0: [
      { address: "192.0.2.8", family: "IPv4", internal: false },
      { address: "fe80::1", family: "IPv6", internal: false },
    ],
    en1: [{ address: "192.0.2.8", family: 4, internal: false }],
    lo0: [{ address: "127.0.0.1", family: "IPv4", internal: true }],
  };

  assert.deepEqual(listLanIpv4(interfaces), ["192.0.2.8"]);
});

test("createRoomId returns 128 random bits as lowercase hex", () => {
  const cryptoProvider = {
    getRandomValues(bytes) {
      bytes.set(Uint8Array.from({ length: 16 }, (_, index) => index));
      return bytes;
    },
  };

  assert.equal(
    createRoomId(cryptoProvider),
    "000102030405060708090a0b0c0d0e0f",
  );
});

test("viewer URL keeps the room secret in the fragment", () => {
  const roomId = "00112233445566778899aabbccddeeff";
  const url = buildViewerUrl({
    protocol: "http:",
    address: "192.0.2.8",
    port: "4173",
    roomId,
  });

  assert.equal(url, `http://192.0.2.8:4173/#role=viewer&room=${roomId}`);
  assert.deepEqual(parseViewerHash(`#role=viewer&room=${roomId}`), {
    role: "viewer",
    roomId,
  });
  assert.equal(parseViewerHash("#role=host"), null);
});
