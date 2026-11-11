// Host Authority Implementation for Rillkeepers P2P Multiplayer

import { ITransport } from './Transport';
import { ValleySimulation } from '../shared/Simulation';
import {
  MAX_PLAYERS,
  JoinRequestPayload,
  JoinResponsePayload,
  GuestInputPayload,
  WorldEventPayload,
  ResyncRequestPayload,
  ResyncResponsePayload,
  HeartbeatPayload,
  isValidGuestInput,
  isValidJoinRequest,
  sanitizePlayerName
} from './Protocol';
import { GateNode, DebrisNode, WaterWheelNode } from '../shared/WaterGraph';

interface PeerSlot {
  peerId: string;
  playerId: string;
  name: string;
  colorIndex: number;
  reconnectToken: string;
  lastActive: number;
}

export class HostAuthority {
  private transport: ITransport;
  private simulation: ValleySimulation;
  private roomCode: string;
  private peerSlots: Map<string, PeerSlot> = new Map(); // peerId -> PeerSlot
  private tokenSlots: Map<string, PeerSlot> = new Map(); // reconnectToken -> PeerSlot
  private simIntervalId: any = null;
  private snapshotIntervalId: any = null;
  private heartbeatIntervalId: any = null;
  private eventSeq: number = 0;
  private isDisposed: boolean = false;

  constructor(transport: ITransport, simulation: ValleySimulation, roomCode: string, hostPlayerName: string = 'Keeper Rowan') {
    this.transport = transport;
    this.simulation = simulation;
    this.roomCode = roomCode;

    // Host claims slot 0 (Teal)
    const hostSlot: PeerSlot = {
      peerId: transport.selfId,
      playerId: 'host_' + transport.selfId,
      name: sanitizePlayerName(hostPlayerName),
      colorIndex: 0,
      reconnectToken: 'host_token',
      lastActive: Date.now()
    };
    this.peerSlots.set(transport.selfId, hostSlot);

    // Initialize host player in simulation
    this.simulation.players.set(hostSlot.playerId, {
      id: hostSlot.playerId,
      name: hostSlot.name,
      x: 5 * 16,
      y: 24 * 16,
      vx: 0,
      vy: 0,
      direction: 'down',
      isMoving: false,
      colorIndex: 0,
      carryingObjectId: null,
      lastInputSeq: 0,
      lastActiveTime: Date.now()
    });

    this.registerTransportHandlers();
    this.startSimulationLoop();
  }

  public getHostPlayerId(): string {
    return 'host_' + this.transport.selfId;
  }

  private registerTransportHandlers(): void {
    // Enforce peer admission at WebRTC handshake level (Max 4 players total)
    if (this.transport.setHandshakeValidator) {
      this.transport.setHandshakeValidator((peerId: string) => {
        if (this.peerSlots.has(peerId)) return true;
        if (this.peerSlots.size >= MAX_PLAYERS) {
          return false;
        }
        return true;
      });
    }

    // 1. Listen for join requests
    this.transport.onAction<JoinRequestPayload>('join_request', (payload, senderPeerId) => {
      this.handleJoinRequest(payload, senderPeerId);
    });

    // 2. Listen for guest inputs
    this.transport.onAction<GuestInputPayload>('guest_input', (payload, senderPeerId) => {
      this.handleGuestInput(payload, senderPeerId);
    });

    // 3. Listen for resync requests
    this.transport.onAction<ResyncRequestPayload>('resync_request', (payload, senderPeerId) => {
      this.handleResyncRequest(payload, senderPeerId);
    });

    // 4. Handle peer disconnects
    this.transport.onPeerLeave((peerId) => {
      this.handlePeerLeave(peerId);
    });
  }

  private handleJoinRequest(payload: any, senderPeerId: string): void {
    if (!isValidJoinRequest(payload)) {
      this.transport.sendAction<JoinResponsePayload>('join_response', {
        accepted: false,
        rejectReason: 'Invalid join request or protocol version mismatch',
        assignedColor: -1,
        playerId: '',
        hostPeerId: this.transport.selfId
      }, senderPeerId);
      return;
    }

    // Check reconnection
    const token = payload.reconnectToken;
    let existingSlot = this.tokenSlots.get(token);

    if (existingSlot) {
      // Reclaiming existing slot
      this.peerSlots.delete(existingSlot.peerId);
      existingSlot.peerId = senderPeerId;
      existingSlot.lastActive = Date.now();
      this.peerSlots.set(senderPeerId, existingSlot);

      this.transport.sendAction<JoinResponsePayload>('join_response', {
        accepted: true,
        assignedColor: existingSlot.colorIndex,
        playerId: existingSlot.playerId,
        hostPeerId: this.transport.selfId,
        initialSnapshot: this.simulation.getSnapshot()
      }, senderPeerId);
      return;
    }

    // Check capacity: max 4 players
    if (this.peerSlots.size >= MAX_PLAYERS) {
      this.transport.sendAction<JoinResponsePayload>('join_response', {
        accepted: false,
        rejectReason: 'Valley crew is full (Max 4 Keepers)',
        assignedColor: -1,
        playerId: '',
        hostPeerId: this.transport.selfId
      }, senderPeerId);
      return;
    }

    // Find first available color index 1..3 (0 is host)
    const usedColors = new Set(Array.from(this.peerSlots.values()).map(s => s.colorIndex));
    let assignedColor = 1;
    for (let c = 1; c < MAX_PLAYERS; c++) {
      if (!usedColors.has(c)) {
        assignedColor = c;
        break;
      }
    }

    const playerId = 'guest_' + senderPeerId;
    const newSlot: PeerSlot = {
      peerId: senderPeerId,
      playerId,
      name: sanitizePlayerName(payload.playerName),
      colorIndex: assignedColor,
      reconnectToken: token,
      lastActive: Date.now()
    };

    this.peerSlots.set(senderPeerId, newSlot);
    if (token) {
      this.tokenSlots.set(token, newSlot);
    }

    // Spawn player in simulation
    this.simulation.players.set(playerId, {
      id: playerId,
      name: newSlot.name,
      x: (5 + assignedColor * 2) * 16,
      y: 24 * 16,
      vx: 0,
      vy: 0,
      direction: 'down',
      isMoving: false,
      colorIndex: assignedColor,
      carryingObjectId: null,
      lastInputSeq: 0,
      lastActiveTime: Date.now()
    });

    this.transport.sendAction<JoinResponsePayload>('join_response', {
      accepted: true,
      assignedColor,
      playerId,
      hostPeerId: this.transport.selfId,
      initialSnapshot: this.simulation.getSnapshot()
    }, senderPeerId);

    // Broadcast updated state immediately
    this.broadcastSnapshot();
  }

  private handleGuestInput(payload: any, senderPeerId: string): void {
    if (!isValidGuestInput(payload)) return;

    const slot = this.peerSlots.get(senderPeerId);
    if (!slot) return;
    slot.lastActive = Date.now();

    const { dx, dy, dt, seq, direction, interact, pickDrop } = payload;

    // Apply movement through authoritative simulation
    this.simulation.applyPlayerInput(slot.playerId, dx, dy, dt, seq, direction);

    // Validate and process interaction
    if (interact) {
      const { targetType, targetId } = interact;
      const success = this.simulation.interact(slot.playerId, targetType, targetId);
      if (success) {
        let eventType: WorldEventPayload['type'] = 'gate_toggled';
        if (targetType === 'debris') eventType = 'debris_cleared';
        else if (targetType === 'waterwheel') eventType = 'waterwheel_activated';

        this.broadcastEvent(eventType, targetId);
      }
    }

    if (pickDrop) {
      this.simulation.pickOrDropObject(slot.playerId);
    }
  }

  private handleResyncRequest(payload: ResyncRequestPayload, senderPeerId: string): void {
    this.transport.sendAction<ResyncResponsePayload>('resync_response', {
      snapshot: this.simulation.getSnapshot(),
      latestEventSeq: this.eventSeq
    }, senderPeerId);
  }

  private handlePeerLeave(peerId: string): void {
    const slot = this.peerSlots.get(peerId);
    if (slot) {
      this.peerSlots.delete(peerId);
      this.simulation.players.delete(slot.playerId);
      this.broadcastSnapshot();
    }
  }

  private broadcastEvent(type: WorldEventPayload['type'], targetId: string, data?: any): void {
    this.eventSeq++;
    const eventPayload: WorldEventPayload = {
      eventId: 'evt_' + Math.random().toString(36).substring(2, 9),
      eventSeq: this.eventSeq,
      type,
      targetId,
      data,
      timestamp: Date.now()
    };
    this.transport.sendAction<WorldEventPayload>('world_event', eventPayload);
  }

  private broadcastSnapshot(): void {
    if (this.isDisposed) return;
    const snap = this.simulation.getSnapshot();
    this.transport.sendAction('host_snapshot', snap);
  }

  private startSimulationLoop(): void {
    // 20 Hz fixed tick
    this.simIntervalId = setInterval(() => {
      this.simulation.step(0.05);

      // Check for waterwheel victory
      const wheel = this.simulation.waterNetwork.getNode<WaterWheelNode>('waterwheel_mill');
      if (wheel && wheel.isSpinning && !this.simulation.objective.waterwheelRestored) {
        this.simulation.objective.waterwheelRestored = true;
        this.broadcastEvent('victory', 'waterwheel_mill');
      }
    }, 50);

    // 10 Hz snapshot broadcast
    this.snapshotIntervalId = setInterval(() => {
      this.broadcastSnapshot();
    }, 100);

    // 1 Hz heartbeat
    this.heartbeatIntervalId = setInterval(() => {
      this.transport.sendAction<HeartbeatPayload>('connection_heartbeat', {
        timestamp: Date.now(),
        isHost: true
      });
    }, 1000);
  }

  public getConnectedCount(): number {
    return this.peerSlots.size;
  }

  public dispose(): void {
    this.isDisposed = true;
    if (this.simIntervalId) clearInterval(this.simIntervalId);
    if (this.snapshotIntervalId) clearInterval(this.snapshotIntervalId);
    if (this.heartbeatIntervalId) clearInterval(this.heartbeatIntervalId);

    // Notify peers that host is departing
    this.transport.sendAction('host_departed', { timestamp: Date.now() });

    this.peerSlots.clear();
    this.tokenSlots.clear();
  }
}
