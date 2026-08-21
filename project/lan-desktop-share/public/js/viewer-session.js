import {
  CONTROL_CHANNEL_LABEL,
  CONTROL_CHANNEL_PROTOCOL,
} from "./control-messages.js";

export class ViewerSession {
  constructor({
    signal,
    createPeerConnection = () => new RTCPeerConnection(),
    onState = () => {},
    onStream = () => {},
    onControlChannel = () => {},
    onControlChannelClosed = () => {},
  }) {
    this.signal = signal;
    this.createPeerConnection = createPeerConnection;
    this.onState = onState;
    this.onStream = onStream;
    this.onControlChannel = onControlChannel;
    this.onControlChannelClosed = onControlChannelClosed;
    this.roomId = null;
    this.hostId = null;
    this.peer = null;
    this.controlChannel = null;
    this.pendingCandidates = [];
    this.unsubscribe = null;
  }

  join(roomId) {
    this.roomId = roomId;
    this.unsubscribe = this.signal.subscribe((message) => {
      void this.handleMessage(message).catch(() =>
        this.onState("disconnected"),
      );
    });
    this.onState("connecting");
    this.signal.send({ type: "join-room", roomId });
  }

  async handleMessage(message) {
    if (message.type === "viewer-accepted") {
      this.hostId = message.hostId;
      this.onState("waiting-for-video");
      return;
    }
    if (message.type === "offer") {
      this.hostId = message.senderId;
      this.closeControlChannel();
      this.peer?.close();
      const peer = this.createPeerConnection();
      this.peer = peer;
      peer.ondatachannel = ({ channel }) => {
        if (
          this.controlChannel ||
          channel.label !== CONTROL_CHANNEL_LABEL ||
          channel.protocol !== CONTROL_CHANNEL_PROTOCOL
        ) {
          channel.close();
          return;
        }
        this.controlChannel = channel;
        this.onControlChannel(channel);
        channel.addEventListener?.(
          "close",
          () => {
            if (this.controlChannel !== channel) return;
            this.controlChannel = null;
            this.onControlChannelClosed();
          },
          { once: true },
        );
      };
      peer.onicecandidate = ({ candidate }) => {
        if (candidate && this.roomId && this.hostId) {
          this.signal.send({
            type: "ice-candidate",
            roomId: this.roomId,
            targetId: this.hostId,
            candidate,
          });
        }
      };
      peer.ontrack = (event) => {
        this.onStream(event.streams[0]);
        this.onState("watching");
      };
      peer.onconnectionstatechange = () => {
        if (peer.connectionState === "failed") this.onState("reconnecting");
      };
      await peer.setRemoteDescription(message.sdp);
      for (const candidate of this.pendingCandidates)
        await peer.addIceCandidate(candidate);
      this.pendingCandidates = [];
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      this.signal.send({
        type: "answer",
        roomId: this.roomId,
        targetId: this.hostId,
        sdp: answer,
      });
      return;
    }
    if (message.type === "ice-candidate") {
      if (this.peer?.remoteDescription) {
        await this.peer.addIceCandidate(message.candidate);
      } else {
        this.pendingCandidates.push(message.candidate);
      }
      return;
    }
    if (message.type === "share-ended") {
      this.close({ state: "ended" });
      return;
    }
    if (message.type === "room-unavailable") {
      this.close({ state: "room-unavailable" });
      return;
    }
    if (message.type === "signal-closed") this.onState("disconnected");
    if (message.type === "error") this.onState("disconnected");
  }

  close({ state = "disconnected" } = {}) {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.closeControlChannel();
    this.peer?.close();
    this.peer = null;
    this.pendingCandidates = [];
    this.onStream(null);
    if (state) this.onState(state);
  }

  closeControlChannel() {
    if (!this.controlChannel) return;
    const channel = this.controlChannel;
    this.controlChannel = null;
    channel.close();
    this.onControlChannelClosed();
  }
}
