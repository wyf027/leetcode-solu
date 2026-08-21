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
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", reject, { once: true });
      socket.addEventListener("message", (event) => {
        const message = JSON.parse(event.data);
        for (const listener of this.listeners) listener(message);
      });
      socket.addEventListener("close", () => {
        for (const listener of this.listeners)
          listener({ type: "signal-closed" });
      });
    });
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  send(message) {
    if (!this.socket || this.socket.readyState !== this.WebSocketCtor.OPEN) {
      throw new Error("Signaling connection is not open");
    }
    this.socket.send(JSON.stringify(message));
  }

  close() {
    this.socket?.close();
  }
}
