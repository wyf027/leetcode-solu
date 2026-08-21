const ROOM_ID_PATTERN = /^[a-f0-9]{32}$/;

export function createRoomId(cryptoProvider = globalThis.crypto) {
  const bytes = new Uint8Array(16);
  cryptoProvider.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function buildViewerUrl({ protocol, address, port, roomId }) {
  if (!ROOM_ID_PATTERN.test(roomId)) throw new Error("Invalid room ID");
  const authority = port ? `${address}:${port}` : address;
  return `${protocol}//${authority}/#role=viewer&room=${roomId}`;
}

export function parseViewerHash(hash) {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const roomId = params.get("room");
  if (params.get("role") !== "viewer" || !ROOM_ID_PATTERN.test(roomId ?? ""))
    return null;
  return { role: "viewer", roomId };
}
