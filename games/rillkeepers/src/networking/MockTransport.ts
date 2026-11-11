// In-memory MockTransport for deterministic multi-client tests

import {
  ITransport,
  NetworkDiagnosticState,
  NetworkDiagnosticEvent,
  DiagnosticFailureReason,
  IceCandidateStats
} from './Transport';

class MockNetworkHub {
  private static rooms: Map<string, { password?: string; peers: Set<MockTransport> }> = new Map();

  public static async join(room: string, transport: MockTransport, password?: string): Promise<void> {
    let roomEntry = this.rooms.get(room);
    if (!roomEntry) {
      roomEntry = { password, peers: new Set() };
      this.rooms.set(room, roomEntry);
    } else {
      // Validate secret/password match
      if (roomEntry.password !== undefined && roomEntry.password !== password) {
        // Mismatch! Handshake fails
        transport._receiveJoinError({
          error: 'signaling encryption key mismatch',
          appId: 'mock-app',
          roomId: room,
          peerId: 'hub'
        });
        return;
      }
    }

    const peers = roomEntry.peers;

    // Check handshake validator on existing peers (e.g., host)
    for (const peer of peers) {
      if (peer._handshakeValidator) {
        const allowed = await peer._handshakeValidator(transport.selfId);
        if (!allowed) {
          transport._receiveJoinError({
            error: 'Peer admission rejected: valley crew is at maximum capacity',
            appId: 'mock-app',
            roomId: room,
            peerId: peer.selfId
          });
          return;
        }
      }
    }

    // Notify existing peers of new peer join
    for (const peer of peers) {
      peer._receivePeerJoin(transport.selfId);
      transport._receivePeerJoin(peer.selfId);
    }

    peers.add(transport);
  }

  public static leave(room: string, transport: MockTransport): void {
    const roomEntry = this.rooms.get(room);
    if (roomEntry) {
      roomEntry.peers.delete(transport);
      for (const peer of roomEntry.peers) {
        peer._receivePeerLeave(transport.selfId);
      }
      if (roomEntry.peers.size === 0) {
        this.rooms.delete(room);
      }
    }
  }

  public static broadcast(room: string, senderId: string, action: string, data: any, targetId?: string): void {
    const roomEntry = this.rooms.get(room);
    if (!roomEntry) return;

    for (const peer of roomEntry.peers) {
      if (peer.selfId === senderId) continue;
      if (targetId && peer.selfId !== targetId) continue;
      // Deliver asynchronously to mimic network
      queueMicrotask(() => {
        peer._receiveAction(action, data, senderId);
      });
    }
  }

  public static reset(): void {
    this.rooms.clear();
  }
}

export class MockTransport implements ITransport {
  public readonly selfId: string;
  private currentRoom: string | null = null;
  private currentPassword?: string;
  private connectedPeers: Set<string> = new Set();
  private peerJoinHandlers: ((peerId: string) => void)[] = [];
  private peerLeaveHandlers: ((peerId: string) => void)[] = [];
  private joinErrorHandlers: ((err: any) => void)[] = [];
  private actionHandlers: Map<string, ((data: any, peerId: string) => void)[]> = new Map();
  public _handshakeValidator?: (peerId: string) => Promise<boolean> | boolean;
  private currentState: NetworkDiagnosticState = 'disconnected';
  private stateChangeHandlers: ((event: NetworkDiagnosticEvent) => void)[] = [];

  constructor(id?: string) {
    this.selfId = id || 'peer_' + Math.random().toString(36).substring(2, 8);
  }

  public getState(): NetworkDiagnosticState {
    return this.currentState;
  }

  public onStateChange(cb: (event: NetworkDiagnosticEvent) => void): void {
    this.stateChangeHandlers.push(cb);
  }

  public isMdnsFallbackActive(): boolean {
    return false;
  }

  public getIceCandidateStats(): IceCandidateStats {
    return {
      hostCandidatesGathered: 0,
      srflxCandidatesGathered: 0,
      relayCandidatesGathered: 0
    };
  }

  private transitionState(
    state: NetworkDiagnosticState,
    details?: string,
    failureReason?: DiagnosticFailureReason
  ): void {
    this.currentState = state;
    const ev: NetworkDiagnosticEvent = {
      state,
      details,
      failureReason,
      timestamp: Date.now()
    };
    for (const handler of this.stateChangeHandlers) {
      handler(ev);
    }
  }

  public setHandshakeValidator(validator: (peerId: string) => Promise<boolean> | boolean): void {
    this._handshakeValidator = validator;
  }

  public onJoinError(cb: (err: any) => void): void {
    this.joinErrorHandlers.push(cb);
  }

  public async connect(roomId: string, password?: string): Promise<void> {
    if (this.currentRoom) {
      await this.disconnect();
    }
    this.transitionState('initializing', 'Mock transport initializing');
    this.currentRoom = roomId;
    this.currentPassword = password;
    this.transitionState('connecting_relays', 'Mock connecting to virtual hub');
    this.transitionState('subscribed', 'Mock subscribed to virtual room');
    this.transitionState('announcing', 'Mock presence announced');
    this.transitionState('discovering_peers', 'Mock awaiting peers');
    await MockNetworkHub.join(roomId, this, password);
  }

  public async disconnect(): Promise<void> {
    if (this.currentRoom) {
      MockNetworkHub.leave(this.currentRoom, this);
      this.currentRoom = null;
      this.currentPassword = undefined;
    }
    this.connectedPeers.clear();
    this.transitionState('disconnected', 'Mock transport disconnected');
  }

  public isConnected(): boolean {
    return this.currentRoom !== null;
  }

  public getConnectedPeers(): string[] {
    return Array.from(this.connectedPeers);
  }

  public onPeerJoin(cb: (peerId: string) => void): void {
    this.peerJoinHandlers.push(cb);
  }

  public onPeerLeave(cb: (peerId: string) => void): void {
    this.peerLeaveHandlers.push(cb);
  }

  public async sendAction<T>(actionName: string, data: T, targetPeerId?: string): Promise<void> {
    if (!this.currentRoom) return;
    MockNetworkHub.broadcast(this.currentRoom, this.selfId, actionName, data, targetPeerId);
  }

  public onAction<T>(actionName: string, cb: (data: T, peerId: string) => void): void {
    let list = this.actionHandlers.get(actionName);
    if (!list) {
      list = [];
      this.actionHandlers.set(actionName, list);
    }
    list.push(cb);
  }

  public _receiveJoinError(err: any): void {
    let failureReason: DiagnosticFailureReason = 'unknown_failure';
    const errStr = String(err?.error || '');
    if (errStr.includes('signaling encryption') || errStr.includes('password') || errStr.includes('mismatch')) {
      failureReason = 'authentication_rejection';
    } else if (errStr.includes('capacity')) {
      failureReason = 'capacity_rejection';
    }
    this.transitionState('failed', err?.error || 'Mock join error', failureReason);
    for (const cb of this.joinErrorHandlers) {
      cb(err);
    }
  }

  public _receivePeerJoin(peerId: string): void {
    this.transitionState('connecting_webrtc', `Mock establishing WebRTC channel with ${peerId}`);
    this.connectedPeers.add(peerId);
    this.transitionState('connected', `Mock connected with ${this.connectedPeers.size} peer(s)`);
    for (const cb of this.peerJoinHandlers) {
      cb(peerId);
    }
  }

  public _receivePeerLeave(peerId: string): void {
    this.connectedPeers.delete(peerId);
    for (const cb of this.peerLeaveHandlers) {
      cb(peerId);
    }
  }

  public _receiveAction(actionName: string, data: any, peerId: string): void {
    const list = this.actionHandlers.get(actionName);
    if (list) {
      for (const cb of list) {
        cb(data, peerId);
      }
    }
  }

  public static resetAll(): void {
    MockNetworkHub.reset();
  }
}
