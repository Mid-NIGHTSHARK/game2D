// Guest Client Implementation for Rillkeepers P2P Multiplayer

import { ITransport } from './Transport';
import {
  PROTOCOL_VERSION,
  JoinRequestPayload,
  JoinResponsePayload,
  GuestInputPayload,
  WorldEventPayload,
  ResyncRequestPayload,
  ResyncResponsePayload,
  HeartbeatPayload,
  isValidSnapshot,
  isValidWorldEvent,
  Direction
} from './Protocol';
import { WorldSnapshot } from '../shared/GameState';
import { ClientPredictor } from './Prediction';
import { RemoteInterpolator } from './Interpolation';

export type GuestState = 'connecting' | 'awaiting_host' | 'connected' | 'rejected' | 'host_disconnected' | 'disconnected';

export class GuestClient {
  private transport: ITransport;
  private playerName: string;
  private reconnectToken: string;
  private hostPeerId: string | null = null;
  private playerId: string = '';
  private assignedColor: number = 1;
  private state: GuestState = 'connecting';

  public predictor: ClientPredictor = new ClientPredictor();
  public interpolator: RemoteInterpolator = new RemoteInterpolator();

  private lastHeartbeatTime: number = 0;
  private heartbeatCheckTimer: any = null;
  private latestEventSeq: number = 0;

  // Callbacks
  public onConnected?: (playerId: string, assignedColor: number, snapshot: WorldSnapshot) => void;
  public onSnapshot?: (snapshot: WorldSnapshot) => void;
  public onWorldEvent?: (event: WorldEventPayload) => void;
  public onRejected?: (reason: string) => void;
  public onHostDisconnected?: () => void;
  public onStateChange?: (state: GuestState) => void;

  constructor(transport: ITransport, playerName: string, reconnectToken?: string) {
    this.transport = transport;
    this.playerName = playerName;
    this.reconnectToken = reconnectToken || 'tok_' + Math.random().toString(36).substring(2, 9);

    this.registerTransportHandlers();
  }

  public getPlayerId(): string {
    return this.playerId;
  }

  public getAssignedColor(): number {
    return this.assignedColor;
  }

  public getState(): GuestState {
    return this.state;
  }

  private setState(newState: GuestState): void {
    this.state = newState;
    this.onStateChange?.(newState);
  }

  private registerTransportHandlers(): void {
    // 1. Listen for join response
    this.transport.onAction<JoinResponsePayload>('join_response', (payload, senderPeerId) => {
      this.handleJoinResponse(payload, senderPeerId);
    });

    // 2. Listen for host snapshots
    this.transport.onAction<WorldSnapshot>('host_snapshot', (payload, senderPeerId) => {
      if (this.hostPeerId && senderPeerId === this.hostPeerId) {
        this.handleSnapshot(payload);
      }
    });

    // 3. Listen for discrete world events
    this.transport.onAction<WorldEventPayload>('world_event', (payload, senderPeerId) => {
      if (this.hostPeerId && senderPeerId === this.hostPeerId) {
        this.handleWorldEvent(payload);
      }
    });

    // 4. Listen for resync response
    this.transport.onAction<ResyncResponsePayload>('resync_response', (payload, senderPeerId) => {
      if (this.hostPeerId && senderPeerId === this.hostPeerId) {
        if (isValidSnapshot(payload?.snapshot)) {
          this.handleSnapshot(payload.snapshot);
          this.latestEventSeq = payload.latestEventSeq;
        }
      }
    });

    // 5. Heartbeat & host departure
    this.transport.onAction<HeartbeatPayload>('connection_heartbeat', (payload, senderPeerId) => {
      if (payload?.isHost) {
        this.hostPeerId = senderPeerId;
        this.lastHeartbeatTime = Date.now();
      }
    });

    this.transport.onAction('host_departed', (_data, senderPeerId) => {
      if (senderPeerId === this.hostPeerId) {
        this.handleHostLoss();
      }
    });

    // When peers join, broadcast a join request ONLY if not already connected
    this.transport.onPeerJoin((peerId) => {
      if (this.state !== 'connected') {
        this.sendJoinRequest(peerId);
      }
    });

    this.transport.onPeerLeave((peerId) => {
      if (peerId === this.hostPeerId) {
        this.handleHostLoss();
      } else {
        this.interpolator.removePlayer(peerId);
      }
    });

    if (this.transport.onJoinError) {
      this.transport.onJoinError((err: any) => {
        if (this.state !== 'connected') {
          this.setState('rejected');
          this.onRejected?.(err?.error || 'Signaling session failed: check room code & secret key');
        }
      });
    }

    this.startHeartbeatWatcher();
  }

  public sendJoinRequest(targetPeerId?: string): void {
    if (this.state === 'connected') return;

    const payload: JoinRequestPayload = {
      protocolVersion: PROTOCOL_VERSION,
      playerName: this.playerName,
      reconnectToken: this.reconnectToken
    };
    this.setState('awaiting_host');
    this.transport.sendAction<JoinRequestPayload>('join_request', payload, targetPeerId);
  }

  private handleJoinResponse(payload: JoinResponsePayload, senderPeerId: string): void {
    if (!payload.accepted) {
      this.setState('rejected');
      this.onRejected?.(payload.rejectReason || 'Join rejected');
      return;
    }

    this.hostPeerId = payload.hostPeerId || senderPeerId;
    this.playerId = payload.playerId;
    this.assignedColor = payload.assignedColor;
    this.lastHeartbeatTime = Date.now();
    this.setState('connected');

    if (payload.initialSnapshot) {
      this.onConnected?.(this.playerId, this.assignedColor, payload.initialSnapshot);
    }
  }

  private handleSnapshot(snapshot: WorldSnapshot): void {
    if (!isValidSnapshot(snapshot)) return;
    this.lastHeartbeatTime = Date.now();

    // Push remote player positions for interpolation
    const now = Date.now();
    for (const [id, player] of Object.entries(snapshot.players)) {
      if (id !== this.playerId) {
        this.interpolator.pushSample(id, player.x, player.y, player.direction, player.isMoving);
      }
    }

    this.onSnapshot?.(snapshot);
  }

  private handleWorldEvent(event: WorldEventPayload): void {
    if (!isValidWorldEvent(event)) return;
    this.latestEventSeq = Math.max(this.latestEventSeq, event.eventSeq);
    this.onWorldEvent?.(event);
  }

  public sendInput(dx: number, dy: number, dt: number, direction: Direction, interact?: GuestInputPayload['interact'], pickDrop?: boolean): void {
    if (!this.hostPeerId || this.state !== 'connected') return;

    const inputPayload = this.predictor.recordInput(dx, dy, dt, direction);
    const fullPayload: GuestInputPayload = {
      ...inputPayload,
      interact,
      pickDrop
    };

    this.transport.sendAction<GuestInputPayload>('guest_input', fullPayload, this.hostPeerId);
  }

  public requestResync(lastKnownTick: number = 0): void {
    if (!this.hostPeerId) return;
    this.transport.sendAction<ResyncRequestPayload>('resync_request', {
      lastKnownTick,
      lastKnownEventSeq: this.latestEventSeq
    }, this.hostPeerId);
  }

  private handleHostLoss(): void {
    if (this.state === 'host_disconnected') return;
    this.setState('host_disconnected');
    this.onHostDisconnected?.();
  }

  private startHeartbeatWatcher(): void {
    this.heartbeatCheckTimer = setInterval(() => {
      if (this.state === 'connected' && this.hostPeerId) {
        if (Date.now() - this.lastHeartbeatTime > 6000) {
          // No response from host for 6 seconds -> Host lost
          this.handleHostLoss();
        }
      }
    }, 2000);
  }

  public dispose(): void {
    if (this.heartbeatCheckTimer) clearInterval(this.heartbeatCheckTimer);
    this.predictor.clear();
  }
}
