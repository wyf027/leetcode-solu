export class RoomRegistry {
  constructor({ maxViewers = 5 } = {}) {
    this.maxViewers = maxViewers;
    this.rooms = new Map();
    this.memberships = new Map();
  }

  hostRoom(roomId, hostId) {
    if (this.rooms.has(roomId)) throw new Error("Room already exists");
    if (this.memberships.has(hostId))
      throw new Error("Client already joined a room");
    this.rooms.set(roomId, { hostId, viewerIds: new Set() });
    this.memberships.set(hostId, { roomId, role: "host" });
  }

  joinRoom(roomId, viewerId) {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error("Room unavailable");
    if (this.memberships.has(viewerId))
      throw new Error("Client already joined a room");
    if (room.viewerIds.size >= this.maxViewers) throw new Error("Room is full");
    room.viewerIds.add(viewerId);
    this.memberships.set(viewerId, { roomId, role: "viewer" });
    return room.hostId;
  }

  getMembership(clientId) {
    return this.memberships.get(clientId) ?? null;
  }

  assertRoute(roomId, senderId, targetId) {
    const sender = this.memberships.get(senderId);
    const target = this.memberships.get(targetId);
    if (
      !sender ||
      !target ||
      sender.roomId !== roomId ||
      target.roomId !== roomId
    ) {
      throw new Error("Signal target is outside the room");
    }
    if (sender.role === target.role)
      throw new Error("Signal route is not permitted");
    return targetId;
  }

  endRoom(roomId, hostId) {
    const room = this.rooms.get(roomId);
    if (!room || room.hostId !== hostId)
      throw new Error("Only the room host can end sharing");
    const viewerIds = [...room.viewerIds];
    this.memberships.delete(hostId);
    for (const viewerId of viewerIds) this.memberships.delete(viewerId);
    this.rooms.delete(roomId);
    return viewerIds;
  }

  removeClient(clientId) {
    const membership = this.memberships.get(clientId);
    if (!membership) return null;
    if (membership.role === "host") {
      const viewerIds = this.endRoom(membership.roomId, clientId);
      return { kind: "host-left", roomId: membership.roomId, viewerIds };
    }
    const room = this.rooms.get(membership.roomId);
    room?.viewerIds.delete(clientId);
    this.memberships.delete(clientId);
    return {
      kind: "viewer-left",
      roomId: membership.roomId,
      hostId: room?.hostId,
      viewerId: clientId,
    };
  }
}
