import {
  CONTROL_CHANNEL_LABEL,
  CONTROL_CHANNEL_PROTOCOL,
} from "./control-messages.js";

export class HostSession {
  constructor({
    signal,
    mediaDevices = navigator.mediaDevices,
    createPeerConnection = () => new RTCPeerConnection(),
    onState = () => {},
    onViewerCount = () => {},
    onPreview = () => {},
    onControlChannel = () => {},
    onControlChannelClosed = () => {},
    onViewerLeft = () => {},
  }) {
    this.signal = signal;
    this.mediaDevices = mediaDevices;
    this.createPeerConnection = createPeerConnection;
    this.onState = onState;
    this.onViewerCount = onViewerCount;
    this.onPreview = onPreview;
    this.onControlChannel = onControlChannel;
    this.onControlChannelClosed = onControlChannelClosed;
    this.onViewerLeft = onViewerLeft;
    this.peers = new Map();
    this.roomId = null;
    this.stream = null;
    this.unsubscribe = null;
    this.endSent = false;
  }

  async start(roomId) {
    if (this.stream) throw new Error("Sharing is already active");
    this.roomId = roomId;
    this.endSent = false;
    this.unsubscribe = this.signal.subscribe((message) => {
      void this.handleMessage(message).catch(() => {
        const viewerId = message.viewerId ?? message.senderId;
        if (viewerId) this.removePeer(viewerId);
        this.onState("connection-error");
      });
    });

    try {
      this.stream = await this.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });
    } catch (error) {
      this.unsubscribe?.();
      this.unsubscribe = null;
      this.roomId = null;
      this.onState("permission-denied");
      throw error;
    }

    for (const track of this.stream.getVideoTracks()) {
      track.addEventListener("ended", () => this.stop(), { once: true });
    }
    this.onPreview(this.stream);
    this.signal.send({ type: "host-room", roomId });
    this.onState("sharing");
  }

  async createPeer(viewerId, retryCount = 0) {
    this.removePeer(viewerId, { updateCount: false });
    const peer = this.createPeerConnection();
    const controlChannel =
      typeof peer.createDataChannel === "function"
        ? peer.createDataChannel(CONTROL_CHANNEL_LABEL, {
            ordered: true,
            protocol: CONTROL_CHANNEL_PROTOCOL,
          })
        : null;
    this.peers.set(viewerId, {
      peer,
      controlChannel,
      retryCount,
      pendingCandidates: [],
    });
    if (controlChannel) {
      this.onControlChannel({ viewerId, channel: controlChannel });
      controlChannel.addEventListener?.(
        "close",
        () => {
          const current = this.peers.get(viewerId);
          if (current?.controlChannel !== controlChannel) return;
          current.controlChannel = null;
          this.onControlChannelClosed(viewerId);
        },
        { once: true },
      );
    }
    for (const track of this.stream.getVideoTracks())
      peer.addTrack(track, this.stream);

    peer.onicecandidate = ({ candidate }) => {
      if (candidate && this.roomId) {
        this.signal.send({
          type: "ice-candidate",
          roomId: this.roomId,
          targetId: viewerId,
          candidate,
        });
      }
    };
    peer.onconnectionstatechange = () => {
      if (peer.connectionState !== "failed") return;
      if (retryCount < 1 && this.roomId && this.stream) {
        void this.createPeer(viewerId, retryCount + 1).catch(() => {
          this.removePeer(viewerId);
          this.onState("viewer-failed");
        });
      } else {
        this.removePeer(viewerId);
        this.onState("viewer-failed");
      }
    };

    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    this.signal.send({
      type: "offer",
      roomId: this.roomId,
      targetId: viewerId,
      sdp: offer,
    });
    this.onViewerCount(this.peers.size);
  }

  async handleMessage(message) {
    if (message.type === "viewer-joined") {
      await this.createPeer(message.viewerId);
      return;
    }
    if (message.type === "viewer-left") {
      this.removePeer(message.viewerId);
      return;
    }
    if (message.type === "answer") {
      const connection = this.peers.get(message.senderId);
      if (!connection) return;
      await connection.peer.setRemoteDescription(message.sdp);
      for (const candidate of connection.pendingCandidates) {
        await connection.peer.addIceCandidate(candidate);
      }
      connection.pendingCandidates = [];
      return;
    }
    if (message.type === "ice-candidate") {
      const connection = this.peers.get(message.senderId);
      if (!connection) return;
      if (connection.peer.remoteDescription) {
        await connection.peer.addIceCandidate(message.candidate);
      } else {
        connection.pendingCandidates.push(message.candidate);
      }
      return;
    }
    if (message.type === "signal-closed") this.onState("signal-closed");
    if (message.type === "error") this.onState("connection-error");
  }

  removePeer(viewerId, { updateCount = true } = {}) {
    const connection = this.peers.get(viewerId);
    if (!connection) return;
    const controlChannel = connection.controlChannel;
    connection.controlChannel = null;
    controlChannel?.close();
    this.onControlChannelClosed(viewerId);
    connection.peer.close();
    this.peers.delete(viewerId);
    this.onViewerLeft(viewerId);
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
    for (const viewerId of [...this.peers.keys()]) {
      this.removePeer(viewerId, { updateCount: false });
    }
    this.onViewerCount(0);
    if (notify && activeRoomId && !this.endSent) {
      this.endSent = true;
      try {
        this.signal.send({ type: "share-ended", roomId: activeRoomId });
      } catch {
        this.onState("signal-closed");
      }
    }
    this.onState("stopped");
  }
}
