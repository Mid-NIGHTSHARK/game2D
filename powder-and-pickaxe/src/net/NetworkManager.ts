/**
 * NetworkManager.ts
 * Serverless WebRTC Multiplayer via Trystero Nostr + Local BroadcastChannel fallback.
 * Host-authoritative 30Hz simulation, 20Hz state broadcast, reliable event streaming,
 * and global public lobby discovery room.
 * CC0 1.0 Universal Public Domain.
 */

import { joinRoom, Room } from 'trystero/nostr';
import { PlayerInput, TeamId } from '../game/Entities';

export interface LobbyRoomInfo {
  roomCode: string;
  hostName: string;
  playerCount: number;
  maxPlayers: number;
  mode: string;
  timestamp: number;
}

export interface NetworkStatePayload {
  tick: number;
  players: {
    id: string;
    name: string;
    team: TeamId;
    x: number;
    y: number;
    vx: number;
    vy: number;
    aim: number;
    hp: number;
    slot: number;
    shuttered: boolean;
    heldType: 'none' | 'crate' | 'keg';
    heldId: string | null;
    isDead: boolean;
  }[];
  crates: { id: string; x: number; y: number; vx: number; vy: number; held: boolean }[];
  kegs: { id: string; x: number; y: number; vx: number; vy: number; lit: boolean; fuse: number; held: boolean }[];
  scores: { red: number; blue: number };
  timeRemaining: number;
}

export interface NetworkEventPayload {
  type: 'WORLD_INIT' | 'TILE_DAMAGE' | 'EXPLOSION' | 'SOUND_RIPPLE' | 'CHAT_ALERT' | 'VICTORY' | 'PING';
  data: any;
}

export class NetworkManager {
  public static readonly RELAY_URLS = [
    'wss://relay.damus.io',
    'wss://nos.lol',
    'wss://relay.snort.social',
    'wss://nostr.mom'
  ];

  public static readonly APP_ID = 'deepvein-powder-pickaxe-v1';
  public static readonly LOBBY_ROOM_ID = 'deepvein-lobby-discovery-v1';

  public isHost: boolean = false;
  public roomCode: string = '';
  public localPeerId: string = '';
  public localPlayerName: string = 'Miner';
  public connectedPeers: Set<string> = new Set();
  public pingMs: number = 0;

  private gameRoom: Room | null = null;
  private lobbyRoom: Room | null = null;
  private localChannel: BroadcastChannel | null = null;
  private lobbyBroadcastInterval: number | null = null;
  private pingInterval: number | null = null;

  // Actions
  private sendStateAction: ((data: any, targetPeerId?: string) => void) | null = null;
  private sendEventAction: ((data: any, targetPeerId?: string) => void) | null = null;
  private sendInputAction: ((data: any, targetPeerId?: string) => void) | null = null;

  // Event Callbacks
  public onStateReceived?: (state: NetworkStatePayload) => void;
  public onEventReceived?: (event: NetworkEventPayload, senderId: string) => void;
  public onInputReceived?: (input: PlayerInput, senderId: string) => void;
  public onPeerJoined?: (peerId: string) => void;
  public onPeerLeft?: (peerId: string) => void;
  public onLobbyDiscovered?: (rooms: LobbyRoomInfo[]) => void;

  private discoveredRooms: Map<string, LobbyRoomInfo> = new Map();

  constructor() {
    this.localPeerId = 'peer_' + Math.random().toString(36).substring(2, 8);
  }

  /**
   * Initializes Public Lobby Discovery subscription
   */
  public startLobbyDiscovery(): void {
    try {
      this.lobbyRoom = joinRoom(
        { appId: NetworkManager.APP_ID, relayUrls: NetworkManager.RELAY_URLS },
        NetworkManager.LOBBY_ROOM_ID
      );

      const [sendLobbyPing, onLobbyPing] = this.lobbyRoom.makeAction<any>('lobbyPing');

      onLobbyPing((data: any) => {
        if (data && data.roomCode) {
          this.discoveredRooms.set(data.roomCode, {
            roomCode: data.roomCode,
            hostName: data.hostName || 'Host',
            playerCount: data.playerCount || 1,
            maxPlayers: data.maxPlayers || 8,
            mode: data.mode || 'Crew vs Crew',
            timestamp: Date.now()
          });
          this.pruneLobbyRooms();
          this.onLobbyDiscovered?.(Array.from(this.discoveredRooms.values()));
        }
      });
    } catch (e) {
      console.warn('Lobby discovery unavailable, continuing local/direct mode:', e);
    }
  }

  public stopLobbyDiscovery(): void {
    if (this.lobbyRoom) {
      try {
        this.lobbyRoom.leave();
      } catch {}
      this.lobbyRoom = null;
    }
  }

  private pruneLobbyRooms(): void {
    const now = Date.now();
    for (const [code, info] of this.discoveredRooms.entries()) {
      if (now - info.timestamp > 9000) {
        this.discoveredRooms.delete(code);
      }
    }
  }

  /**
   * Joins or hosts a match room
   */
  public joinMatch(roomCode: string, isHost: boolean, playerName: string): void {
    this.roomCode = roomCode.toUpperCase();
    this.isHost = isHost;
    this.localPlayerName = playerName;

    // 1. Initialize Local BroadcastChannel for instant local-tab testing (<5ms latency)
    try {
      this.localChannel = new BroadcastChannel('deepvein-' + this.roomCode);
      this.localChannel.onmessage = (ev) => {
        const msg = ev.data;
        if (!msg || msg.senderId === this.localPeerId) return;

        if (msg.kind === 'state') {
          this.onStateReceived?.(msg.payload);
        } else if (msg.kind === 'event') {
          this.onEventReceived?.(msg.payload, msg.senderId);
        } else if (msg.kind === 'input') {
          this.onInputReceived?.(msg.payload, msg.senderId);
        } else if (msg.kind === 'hello') {
          this.connectedPeers.add(msg.senderId);
          this.onPeerJoined?.(msg.senderId);
        }
      };

      // Announce on local channel
      this.localChannel.postMessage({ kind: 'hello', senderId: this.localPeerId });
    } catch (e) {
      console.warn('BroadcastChannel not supported:', e);
    }

    // 2. Initialize Trystero WebRTC Room
    try {
      this.gameRoom = joinRoom(
        { appId: NetworkManager.APP_ID, relayUrls: NetworkManager.RELAY_URLS },
        this.roomCode
      );

      const [sendState, onState] = this.gameRoom.makeAction<any>('state');
      const [sendEvent, onEvent] = this.gameRoom.makeAction<any>('event');
      const [sendInput, onInput] = this.gameRoom.makeAction<any>('input');

      this.sendStateAction = sendState;
      this.sendEventAction = sendEvent;
      this.sendInputAction = sendInput;

      onState((data: any) => {
        this.onStateReceived?.(data as NetworkStatePayload);
      });

      onEvent((data: any, peerId: string) => {
        const event = data as NetworkEventPayload;
        if (event.type === 'PING') {
          if (!this.isHost && event.data.clientTime) {
            this.pingMs = Math.round((Date.now() - event.data.clientTime) / 2);
          }
        }
        this.onEventReceived?.(event, peerId);
      });

      onInput((data: any, peerId: string) => {
        this.onInputReceived?.(data as PlayerInput, peerId);
      });

      this.gameRoom.onPeerJoin((peerId: string) => {
        this.connectedPeers.add(peerId);
        this.onPeerJoined?.(peerId);
      });

      this.gameRoom.onPeerLeave((peerId: string) => {
        this.connectedPeers.delete(peerId);
        this.onPeerLeft?.(peerId);
      });

    } catch (e) {
      console.warn('Trystero WebRTC init fallback to broadcast channel:', e);
    }

    // 3. If Host, broadcast to Public Lobby Discovery every 3 seconds
    if (this.isHost) {
      this.startHostLobbyBeacon();
    } else {
      // Start ping heartbeat
      this.pingInterval = window.setInterval(() => {
        if (this.sendEventAction) {
          this.sendEventAction({ type: 'PING', data: { clientTime: Date.now() } });
        }
      }, 2000);
    }
  }

  private startHostLobbyBeacon(): void {
    if (!this.lobbyRoom) {
      this.startLobbyDiscovery();
    }

    const [sendLobbyPing] = this.lobbyRoom?.makeAction<any>('lobbyPing') || [null];

    this.lobbyBroadcastInterval = window.setInterval(() => {
      const info: LobbyRoomInfo = {
        roomCode: this.roomCode,
        hostName: this.localPlayerName,
        playerCount: this.connectedPeers.size + 1,
        maxPlayers: 8,
        mode: 'Crew vs Crew',
        timestamp: Date.now()
      };
      if (sendLobbyPing) {
        sendLobbyPing(info);
      }
    }, 3000);
  }

  /**
   * Broadcasts 20Hz state (Host-authoritative)
   */
  public broadcastState(state: NetworkStatePayload): void {
    if (!this.isHost) return;

    if (this.sendStateAction) {
      try {
        this.sendStateAction(state);
      } catch {}
    }

    if (this.localChannel) {
      this.localChannel.postMessage({ kind: 'state', senderId: this.localPeerId, payload: state });
    }
  }

  /**
   * Broadcasts reliable game events (Seed, Block destruction, Explosions, Ripples)
   */
  public broadcastEvent(event: NetworkEventPayload, targetPeerId?: string): void {
    if (this.sendEventAction) {
      try {
        if (targetPeerId) {
          this.sendEventAction(event, targetPeerId);
        } else {
          this.sendEventAction(event);
        }
      } catch {}
    }

    if (this.localChannel) {
      this.localChannel.postMessage({ kind: 'event', senderId: this.localPeerId, payload: event });
    }
  }

  /**
   * Sends local player input frame to Host
   */
  public sendInputToHost(input: PlayerInput): void {
    if (this.isHost) return; // Host applies inputs directly

    if (this.sendInputAction) {
      try {
        this.sendInputAction(input);
      } catch {}
    }

    if (this.localChannel) {
      this.localChannel.postMessage({ kind: 'input', senderId: this.localPeerId, payload: input });
    }
  }

  public leaveMatch(): void {
    if (this.lobbyBroadcastInterval) {
      clearInterval(this.lobbyBroadcastInterval);
      this.lobbyBroadcastInterval = null;
    }
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    if (this.gameRoom) {
      try {
        this.gameRoom.leave();
      } catch {}
      this.gameRoom = null;
    }
    if (this.localChannel) {
      try {
        this.localChannel.close();
      } catch {}
      this.localChannel = null;
    }
    this.connectedPeers.clear();
  }
}
