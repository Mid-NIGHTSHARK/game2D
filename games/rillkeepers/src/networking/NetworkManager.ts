// Unified P2P Network Manager for Rillkeepers

import {
  ITransport,
  NetworkDiagnosticState,
  DiagnosticFailureReason,
  IceCandidateStats
} from './Transport';
import { TrysteroTransport, TrysteroTransportConfig } from './TrysteroTransport';
import { HostAuthority } from './HostAuthority';
import { GuestClient } from './GuestClient';
import {
  generateRoomId,
  generateRoomSecret,
  sanitizeRoomId,
  sanitizeRoomSecret,
  isValidRoomId,
  isValidRoomSecret,
  generateInvitationUrl,
  formatCombinedInviteCode,
  parseCombinedInviteCode
} from './RoomCode';
import { ValleySimulation } from '../shared/Simulation';
import { WorldSnapshot } from '../shared/GameState';
import { WorldEventPayload, Direction, GuestInputPayload } from './Protocol';

export type NetworkRole = 'host' | 'guest' | 'offline';

export class NetworkManager {
  private transport: ITransport;
  private hostAuthority: HostAuthority | null = null;
  private guestClient: GuestClient | null = null;
  private simulation: ValleySimulation | null = null;
  private role: NetworkRole = 'offline';
  private currentRoomId: string = '';
  private currentRoomSecret: string = '';
  private playerName: string = 'Keeper Rowan';

  // Event Callbacks
  public onConnected?: (isHost: boolean, playerId: string, assignedColor: number, roomCode: string, snapshot: WorldSnapshot) => void;
  public onSnapshot?: (snapshot: WorldSnapshot) => void;
  public onWorldEvent?: (event: WorldEventPayload) => void;
  public onPlayerCountChange?: (count: number) => void;
  public onHostDisconnected?: () => void;
  public onError?: (message: string) => void;
  public onStatusChange?: (status: string) => void;
  public onDiagnosticStateChange?: (state: NetworkDiagnosticState, details?: string, failureReason?: DiagnosticFailureReason) => void;

  constructor(customTransport?: ITransport, config?: TrysteroTransportConfig) {
    this.transport = customTransport || new TrysteroTransport(config);
    this.bindTransportDiagnostics();
  }

  public setTransport(transport: ITransport): void {
    this.disconnect();
    this.transport = transport;
    this.bindTransportDiagnostics();
  }

  private bindTransportDiagnostics(): void {
    if (this.transport.onStateChange) {
      this.transport.onStateChange((ev) => {
        this.onDiagnosticStateChange?.(ev.state, ev.details, ev.failureReason);
        switch (ev.state) {
          case 'initializing':
            this.onStatusChange?.('Initializing P2P transport...');
            break;
          case 'connecting_relays':
            this.onStatusChange?.('Connecting to Nostr signaling relays...');
            break;
          case 'subscribed':
            this.onStatusChange?.('Subscribed to signaling channel');
            break;
          case 'announcing':
            this.onStatusChange?.('Announcing room presence...');
            break;
          case 'discovering_peers':
            this.onStatusChange?.('Discovering peers...');
            break;
          case 'connecting_webrtc':
            this.onStatusChange?.('Establishing WebRTC connection...');
            break;
          case 'connected':
            this.onStatusChange?.(this.role === 'host' ? 'Host Active (Peers Connected)' : 'Connected');
            break;
          case 'failed':
            this.onStatusChange?.('Connection Failed');
            if (ev.details) {
              this.onError?.(ev.details);
            }
            break;
          case 'disconnected':
            this.onStatusChange?.('Offline');
            break;
        }
      });
    }
  }

  public getState(): NetworkDiagnosticState {
    return this.transport.getState ? this.transport.getState() : 'disconnected';
  }

  public getIceCandidateStats(): IceCandidateStats {
    return this.transport.getIceCandidateStats
      ? this.transport.getIceCandidateStats()
      : { hostCandidatesGathered: 0, srflxCandidatesGathered: 0, relayCandidatesGathered: 0 };
  }

  public isMdnsFallbackActive(): boolean {
    return this.transport.isMdnsFallbackActive ? this.transport.isMdnsFallbackActive() : false;
  }

  public getTransport(): ITransport {
    return this.transport;
  }

  public getRole(): NetworkRole {
    if (this.role === 'guest') {
      return (this.guestClient && this.guestClient.getState() === 'connected') ? 'guest' : 'offline';
    }
    return this.role;
  }

  public isHost(): boolean {
    return this.role === 'host';
  }

  public getRoomCode(): string {
    return this.currentRoomId;
  }

  public getRoomId(): string {
    return this.currentRoomId;
  }

  public getRoomSecret(): string {
    return this.currentRoomSecret;
  }

  public getCombinedInviteCode(): string {
    if (!this.currentRoomId || !this.currentRoomSecret) return '';
    return formatCombinedInviteCode(this.currentRoomId, this.currentRoomSecret);
  }

  public getInvitationUrl(): string {
    if (!this.currentRoomId || !this.currentRoomSecret) return '';
    return generateInvitationUrl(this.currentRoomId, this.currentRoomSecret);
  }

  public getPlayerId(): string {
    if (this.role === 'host' && this.hostAuthority) {
      return this.hostAuthority.getHostPlayerId();
    }
    if (this.role === 'guest' && this.guestClient) {
      return this.guestClient.getPlayerId();
    }
    return 'local_player';
  }

  /**
   * Host creates a private P2P room with two independent cryptographically random values:
   * 1. Room ID (public identifier)
   * 2. Room Secret (private signaling encryption password)
   */
  public async createWorld(
    simulation: ValleySimulation,
    customRoomId?: string,
    customSecret?: string,
    name: string = 'Keeper Rowan'
  ): Promise<{ roomId: string; roomSecret: string; inviteUrl: string; combinedCode: string }> {
    await this.disconnect();

    this.simulation = simulation;
    this.playerName = name;
    this.role = 'host';

    // Generate independent cryptographically secure Room ID and Room Secret
    this.currentRoomId = sanitizeRoomId(customRoomId || generateRoomId());
    this.currentRoomSecret = sanitizeRoomSecret(customSecret || generateRoomSecret());

    const inviteUrl = generateInvitationUrl(this.currentRoomId, this.currentRoomSecret);
    const combinedCode = formatCombinedInviteCode(this.currentRoomId, this.currentRoomSecret);

    this.onStatusChange?.('Connecting to P2P signaling network...');

    try {
      // Pass roomId as room identifier, and independent roomSecret as encryption password
      await this.transport.connect(this.currentRoomId, this.currentRoomSecret);

      this.hostAuthority = new HostAuthority(this.transport, this.simulation, this.currentRoomId, this.playerName);

      this.transport.onPeerJoin(() => {
        this.onPlayerCountChange?.(this.hostAuthority ? this.hostAuthority.getConnectedCount() : 1);
      });
      this.transport.onPeerLeave(() => {
        this.onPlayerCountChange?.(this.hostAuthority ? this.hostAuthority.getConnectedCount() : 1);
      });

      this.onStatusChange?.('Host Active');
      this.onConnected?.(
        true,
        this.hostAuthority.getHostPlayerId(),
        0, // Host is color 0 (Teal)
        this.currentRoomId,
        this.simulation.getSnapshot()
      );
      this.onPlayerCountChange?.(1);

      return {
        roomId: this.currentRoomId,
        roomSecret: this.currentRoomSecret,
        inviteUrl,
        combinedCode
      };
    } catch (err: any) {
      this.onError?.('Failed to create private world: ' + (err?.message || 'WebRTC error'));
      await this.disconnect();
      throw err;
    }
  }

  /**
   * Guest joins an existing P2P world.
   * Requires BOTH Room ID and Room Secret.
   * Can accept:
   *  - (roomId, roomSecret, name, reconnectToken)
   *  - (combinedCodeOrUrl, name, reconnectToken)
   */
  public async joinWorld(
    roomIdOrCombined: string,
    secretOrName?: string,
    optionalName?: string,
    reconnectToken?: string
  ): Promise<void> {
    await this.disconnect();

    let targetRoomId = '';
    let targetSecret = '';
    let playerName = 'Guest Keeper';
    let token = reconnectToken;

    // Check if first argument is a combined code (ROOMID.SECRET) or URL
    const parsed = parseCombinedInviteCode(roomIdOrCombined);
    if (parsed) {
      targetRoomId = parsed.roomId;
      targetSecret = parsed.roomSecret;
      if (secretOrName && !targetSecret) {
        targetSecret = sanitizeRoomSecret(secretOrName);
        playerName = optionalName || 'Guest Keeper';
      } else if (secretOrName) {
        playerName = secretOrName;
      }
    } else {
      targetRoomId = sanitizeRoomId(roomIdOrCombined);
      if (secretOrName && isValidRoomSecret(secretOrName)) {
        targetSecret = sanitizeRoomSecret(secretOrName);
        playerName = optionalName || 'Guest Keeper';
      } else if (secretOrName) {
        // secretOrName was passed as a name without a secret
        playerName = secretOrName;
      }
    }

    // MANDATORY SECURITY RULE: User must not be able to join with only the room ID!
    if (!targetSecret || !isValidRoomSecret(targetSecret)) {
      const errMsg = 'Room secret encryption key is required. A valley cannot be joined with only a Room ID.';
      this.onError?.(errMsg);
      throw new Error(errMsg);
    }

    if (!targetRoomId || !isValidRoomId(targetRoomId)) {
      const errMsg = 'Invalid Room ID. Please check the invitation code.';
      this.onError?.(errMsg);
      throw new Error(errMsg);
    }

    this.playerName = playerName;
    this.role = 'guest';
    this.currentRoomId = targetRoomId;
    this.currentRoomSecret = targetSecret;

    this.onStatusChange?.('Finding valley host...');

    // Retrieve or generate unique reconnect token scoped to this transport peer
    if (!token) {
      try {
        const key = 'rillkeepers_reconnect_' + this.transport.selfId;
        token = sessionStorage.getItem(key) || '';
        if (!token) {
          token = 'tok_' + Math.random().toString(36).substring(2, 9);
          sessionStorage.setItem(key, token);
        }
      } catch {
        token = 'tok_' + Math.random().toString(36).substring(2, 9);
      }
    }

    try {
      this.guestClient = new GuestClient(this.transport, this.playerName, token);

      this.guestClient.onConnected = (playerId, assignedColor, snapshot) => {
        this.onStatusChange?.('Connected as Guest');
        this.onConnected?.(false, playerId, assignedColor, this.currentRoomId, snapshot);
      };

      this.guestClient.onSnapshot = (snapshot) => {
        this.onSnapshot?.(snapshot);
      };

      this.guestClient.onWorldEvent = (event) => {
        this.onWorldEvent?.(event);
      };

      this.guestClient.onRejected = (reason) => {
        this.onError?.(`Could not join valley: ${reason}`);
        this.disconnect();
      };

      this.guestClient.onHostDisconnected = () => {
        this.onHostDisconnected?.();
      };

      // Connect with roomId as channel identifier and roomSecret as private encryption key
      await this.transport.connect(this.currentRoomId, this.currentRoomSecret);
      if (this.guestClient) {
        this.guestClient.sendJoinRequest();
      }
    } catch (err: any) {
      this.onError?.('Failed to connect to room: ' + (err?.message || 'WebRTC error'));
      await this.disconnect();
      throw err;
    }
  }

  public sendInput(dx: number, dy: number, dt: number, direction: Direction, interact?: GuestInputPayload['interact'], pickDrop?: boolean): void {
    if (this.role === 'guest' && this.guestClient) {
      this.guestClient.sendInput(dx, dy, dt, direction, interact, pickDrop);
    }
  }

  public async disconnect(): Promise<void> {
    if (this.hostAuthority) {
      this.hostAuthority.dispose();
      this.hostAuthority = null;
    }
    if (this.guestClient) {
      this.guestClient.dispose();
      this.guestClient = null;
    }
    await this.transport.disconnect();
    this.role = 'offline';
    this.currentRoomId = '';
    this.currentRoomSecret = '';
    this.onStatusChange?.('Offline');
  }
}

export const Network = new NetworkManager();
