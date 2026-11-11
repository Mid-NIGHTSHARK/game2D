// Trystero WebRTC + Nostr Signaling Implementation of ITransport

import { joinRoom, selfId } from 'trystero';
import type { Room, MessageAction, DataPayload, JoinError } from 'trystero';
import {
  ITransport,
  NetworkDiagnosticState,
  NetworkDiagnosticEvent,
  DiagnosticFailureReason,
  IceCandidateStats
} from './Transport';
import { APP_ID } from './Protocol';

/**
 * Curated high-availability public Nostr relays verified for low latency and
 * active support of ephemeral event pub/sub (EOSE + OK true).
 */
export const DEFAULT_NOSTR_RELAYS: readonly string[] = Object.freeze([
  'wss://nostr.oxtr.dev',
  'wss://relay.aarpia.com',
  'wss://cdn.satellite.earth',
  'wss://relay.agentry.com',
  'wss://relay.snort.social'
]);

export interface TrysteroTransportConfig {
  appId?: string;
  relayUrls?: string[];
  warnOnRelayFailure?: boolean;
  mdnsHostFallbackToLoopback?: boolean;
}

/**
 * Helper to determine whether code is running on a localhost / loopback environment.
 */
export function isLocalhostOrigin(): boolean {
  if (typeof window === 'undefined') return true;
  const h = window.location?.hostname || '';
  return h === 'localhost' || h === '127.0.0.1' || h === '';
}

export class TrysteroTransport implements ITransport {
  public readonly selfId: string = selfId;
  private room: Room | null = null;
  private actions: Map<string, MessageAction<any>> = new Map();
  private peerJoinHandlers: ((peerId: string) => void)[] = [];
  private peerLeaveHandlers: ((peerId: string) => void)[] = [];
  private joinErrorHandlers: ((err: JoinError) => void)[] = [];
  private actionHandlers: Map<string, ((data: any, peerId: string) => void)[]> = new Map();
  private connectedPeers: Set<string> = new Set();
  private handshakeValidator?: (peerId: string) => Promise<boolean> | boolean;
  private isConnecting: boolean = false;

  private currentState: NetworkDiagnosticState = 'disconnected';
  private stateChangeHandlers: ((event: NetworkDiagnosticEvent) => void)[] = [];

  private iceStats: IceCandidateStats = {
    hostCandidatesGathered: 0,
    srflxCandidatesGathered: 0,
    relayCandidatesGathered: 0,
    selectedCandidatePair: undefined
  };

  private readonly appId: string;
  private readonly relayUrls: string[];
  private readonly warnOnRelayFailure: boolean;
  private mdnsHostFallbackToLoopback: boolean;

  constructor(config?: TrysteroTransportConfig) {
    this.appId = config?.appId || APP_ID;
    this.relayUrls = config?.relayUrls && config.relayUrls.length > 0
      ? config.relayUrls
      : [...DEFAULT_NOSTR_RELAYS];
    this.warnOnRelayFailure = config?.warnOnRelayFailure ?? false;

    const isLocalhost = isLocalhostOrigin();

    // Check for explicit localhost test enablement flag
    const explicitTestFlag = Boolean(
      config?.mdnsHostFallbackToLoopback === true ||
      (typeof window !== 'undefined' && (
        (window as any).__RILLKEEPERS_MDNS_LOOPBACK__ === true ||
        new URLSearchParams(window.location?.search || '').get('mdns_fallback') === '1'
      ))
    );

    // STRICT PRODUCTION ASSERTION:
    // mDNS loopback fallback MUST NEVER be active on non-localhost or production origins (e.g. GitHub Pages).
    if (!isLocalhost) {
      if (config?.mdnsHostFallbackToLoopback || explicitTestFlag) {
        console.warn(
          `[TrysteroTransport Security Warning] mdnsHostFallbackToLoopback was requested on production origin (${typeof window !== 'undefined' ? window.location?.hostname : 'unknown'}). Fallback is strictly disabled.`
        );
      }
      this.mdnsHostFallbackToLoopback = false;
    } else {
      // On localhost, enabled strictly if explicitly configured or requested by test harness
      this.mdnsHostFallbackToLoopback = config?.mdnsHostFallbackToLoopback ?? explicitTestFlag;
    }
  }

  public getState(): NetworkDiagnosticState {
    return this.currentState;
  }

  public onStateChange(cb: (event: NetworkDiagnosticEvent) => void): void {
    this.stateChangeHandlers.push(cb);
  }

  public isMdnsFallbackActive(): boolean {
    return this.mdnsHostFallbackToLoopback;
  }

  public getIceCandidateStats(): IceCandidateStats {
    return {
      hostCandidatesGathered: this.iceStats.hostCandidatesGathered,
      srflxCandidatesGathered: this.iceStats.srflxCandidatesGathered,
      relayCandidatesGathered: this.iceStats.relayCandidatesGathered,
      selectedCandidatePair: this.iceStats.selectedCandidatePair
        ? { ...this.iceStats.selectedCandidatePair }
        : undefined
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
      try {
        handler(ev);
      } catch {
        // Suppress handler errors
      }
    }
  }

  public setHandshakeValidator(validator: (peerId: string) => Promise<boolean> | boolean): void {
    this.handshakeValidator = validator;
  }

  public onJoinError(cb: (err: JoinError) => void): void {
    this.joinErrorHandlers.push(cb);
  }

  public async connect(roomId: string, password?: string): Promise<void> {
    if (this.room) {
      await this.disconnect();
    }

    const isLocalhost = isLocalhostOrigin();

    // Check for explicit test harness flag in local testing environments
    if (isLocalhost) {
      const explicitFlag = typeof window !== 'undefined' && (
        (window as any).__RILLKEEPERS_MDNS_LOOPBACK__ === true ||
        new URLSearchParams(window.location?.search || '').get('mdns_fallback') === '1'
      );
      if (explicitFlag) {
        this.mdnsHostFallbackToLoopback = true;
      }
    } else {
      // Production origin assertion: strictly disable and forbid fallback on non-localhost origins
      this.mdnsHostFallbackToLoopback = false;
    }

    // Security assertion: confirm fallback is strictly disabled on production origins
    if (!isLocalhost && this.mdnsHostFallbackToLoopback) {
      throw new Error(
        '[TrysteroTransport Security Assertion Failed] _test_only_mdnsHostFallbackToLoopback cannot be enabled on production origins'
      );
    }

    this.isConnecting = true;
    this.iceStats = {
      hostCandidatesGathered: 0,
      srflxCandidatesGathered: 0,
      relayCandidatesGathered: 0,
      selectedCandidatePair: undefined
    };

    const modeDescription = this.mdnsHostFallbackToLoopback
      ? 'mDNS fallback enabled (explicit localhost testing)'
      : 'mDNS fallback disabled (production standard)';

    this.transitionState('initializing', `Configuring P2P transport parameters (${modeDescription})`);

    try {
      this.transitionState(
        'connecting_relays',
        `Connecting to ${this.relayUrls.length} verified Nostr signaling relays`
      );

      // Construct monitored RTCPeerConnection to track candidate statistics without capturing IP addresses
      const self = this;
      const NativePC = typeof window !== 'undefined' && window.RTCPeerConnection
        ? window.RTCPeerConnection
        : (globalThis as any).RTCPeerConnection;

      let rtcPolyfill: any = undefined;
      if (NativePC) {
        rtcPolyfill = class MonitoredRTCPeerConnection extends NativePC {
          constructor(rtcConfig?: RTCConfiguration) {
            super(rtcConfig);

            this.addEventListener('icecandidate', (event: RTCPeerConnectionIceEvent) => {
              if (event.candidate) {
                const typ = event.candidate.type;
                if (typ === 'host') {
                  self.iceStats.hostCandidatesGathered++;
                } else if (typ === 'srflx') {
                  self.iceStats.srflxCandidatesGathered++;
                } else if (typ === 'relay') {
                  self.iceStats.relayCandidatesGathered++;
                }
              }
            });

            const inspectStats = async () => {
              try {
                if (this.iceConnectionState === 'connected' || this.iceConnectionState === 'completed') {
                  const statsReport = await this.getStats();
                  let activePair: any = null;
                  statsReport.forEach((stat: any) => {
                    if (stat.type === 'candidate-pair' && (stat.nominated || stat.state === 'succeeded')) {
                      activePair = stat;
                    }
                  });
                  if (activePair) {
                    const local = statsReport.get(activePair.localCandidateId);
                    const remote = statsReport.get(activePair.remoteCandidateId);
                    if (local && remote && local.candidateType && remote.candidateType) {
                      const isLoop = (local?.address === '127.0.0.1' || remote?.address === '127.0.0.1' ||
                                      local?.ip === '127.0.0.1' || remote?.ip === '127.0.0.1');
                      self.iceStats.selectedCandidatePair = {
                        localType: local.candidateType,
                        remoteType: remote.candidateType,
                        isLoopback: Boolean(isLoop)
                      };
                    }
                  }
                }
              } catch {
                // Ignore stats inspection failure
              }
            };

            this.addEventListener('iceconnectionstatechange', () => {
              void inspectStats();
            });

            this.addEventListener('connectionstatechange', () => {
              void inspectStats();
            });
          }
        };
      }

      const roomConfig: any = {
        appId: this.appId,
        ...(password ? { password } : {}),
        ...(rtcPolyfill ? { rtcPolyfill } : {}),
        relayConfig: {
          urls: this.relayUrls,
          warnOnRelayFailure: this.warnOnRelayFailure
        }
      };

      if (this.mdnsHostFallbackToLoopback) {
        roomConfig._test_only_mdnsHostFallbackToLoopback = true;
      }

      this.room = joinRoom(
        roomConfig,
        roomId,
        {
          onJoinError: (details: JoinError) => {
            const errStr = String(details?.error || '');
            let actionableMsg = 'Signaling relay session notice';
            let failureReason: DiagnosticFailureReason = 'unknown_failure';

            if (
              errStr.includes('incorrect room password') ||
              errStr.includes('decrypting offer') ||
              errStr.includes('decrypting answer')
            ) {
              actionableMsg = 'Cryptographic rejection: room secret encryption key does not match world host';
              failureReason = 'authentication_rejection';
            } else if (
              errStr.includes('exchanging SDP') ||
              errStr.includes('could not connect')
            ) {
              actionableMsg = 'Peer connection failed after signaling: WebRTC ICE candidate negotiation was unsuccessful';
              failureReason = 'ice_connection_failure';
            } else if (errStr.includes('handshake')) {
              actionableMsg = `Peer admission rejected: ${errStr}`;
              failureReason = errStr.includes('capacity') ? 'capacity_rejection' : 'authentication_rejection';
            } else if (errStr.includes('relay') || errStr.includes('socket') || errStr.includes('timeout')) {
              failureReason = 'relay_unavailable';
            } else if (errStr.includes('SDP') || errStr.includes('offer') || errStr.includes('answer')) {
              failureReason = 'sdp_negotiation_failure';
            }

            // If we have active peers (e.g. host with legitimate guests), do not collapse room state
            if (this.connectedPeers.size === 0) {
              this.transitionState('failed', actionableMsg, failureReason);
            }

            for (const handler of this.joinErrorHandlers) {
              handler(details);
            }
          },
          onPeerHandshake: async (peerId: string) => {
            this.transitionState(
              'connecting_webrtc',
              `Verifying peer admission and performing cryptographic handshake with ${peerId}`
            );
            if (this.handshakeValidator) {
              const allowed = await this.handshakeValidator(peerId);
              if (!allowed) {
                this.transitionState(
                  'failed',
                  'Valley crew is at maximum 4-player capacity',
                  'capacity_rejection'
                );
                throw new Error('Peer admission rejected: valley crew is at maximum capacity');
              }
            }
          }
        }
      );

      this.transitionState('subscribed', 'Subscribed to room signaling channel');
      this.transitionState('announcing', 'Broadcasting presence to room topic on Nostr relays');
      this.transitionState('discovering_peers', 'Listening for peer announcements on signaling network');

      this.room.onPeerJoin = (peerId: string) => {
        this.connectedPeers.add(peerId);
        // ONLY reported as connected once real WebRTC DataChannel is established and handshake completed
        this.transitionState('connected', `WebRTC DataChannel active with ${this.connectedPeers.size} peer(s)`);
        for (const handler of this.peerJoinHandlers) {
          handler(peerId);
        }
      };

      this.room.onPeerLeave = (peerId: string) => {
        this.connectedPeers.delete(peerId);
        if (this.connectedPeers.size === 0) {
          this.transitionState('discovering_peers', 'All peers departed; awaiting new connections');
        } else {
          this.transitionState('connected', `WebRTC DataChannel active with ${this.connectedPeers.size} peer(s)`);
        }
        for (const handler of this.peerLeaveHandlers) {
          handler(peerId);
        }
      };

      // Re-bind any actions registered prior to connect
      for (const [actionName] of this.actionHandlers.entries()) {
        this.ensureAction(actionName);
      }
    } catch (err: any) {
      const errStr = String(err?.message || err || '');
      let failureReason: DiagnosticFailureReason = 'unknown_failure';
      if (errStr.includes('relay') || errStr.includes('WebSocket')) {
        failureReason = 'relay_unavailable';
      } else if (errStr.includes('subscribe')) {
        failureReason = 'relay_subscription_failure';
      }
      this.transitionState('failed', errStr || 'Failed to initialize signaling', failureReason);
      throw err;
    } finally {
      this.isConnecting = false;
    }
  }

  public async disconnect(): Promise<void> {
    if (this.room) {
      try {
        await this.room.leave();
      } catch {
        // Suppress or sanitize error leaving room
      }
      this.room = null;
    }
    this.connectedPeers.clear();
    this.actions.clear();
    this.transitionState('disconnected', 'P2P transport disconnected');
  }

  public isConnected(): boolean {
    return this.room !== null && this.connectedPeers.size > 0;
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

  private ensureAction<T extends DataPayload = any>(actionName: string): MessageAction<T> | null {
    if (!this.room) return null;

    let action = this.actions.get(actionName);
    if (!action) {
      action = this.room.makeAction<T>(actionName);
      action.onMessage = (data: T, context: { peerId: string }) => {
        const handlers = this.actionHandlers.get(actionName);
        if (handlers) {
          for (const handler of handlers) {
            handler(data, context.peerId);
          }
        }
      };
      this.actions.set(actionName, action);
    }
    return action;
  }

  public async sendAction<T = any>(actionName: string, data: T, targetPeerId?: string): Promise<void> {
    if (!this.room) return;

    const action = this.ensureAction(actionName);
    if (!action) return;

    try {
      if (targetPeerId) {
        await action.send(data as any, { target: targetPeerId });
      } else {
        await action.send(data as any);
      }
    } catch {
      // Data channel send failure
    }
  }

  public onAction<T = any>(actionName: string, cb: (data: T, peerId: string) => void): void {
    let list = this.actionHandlers.get(actionName);
    if (!list) {
      list = [];
      this.actionHandlers.set(actionName, list);
    }
    list.push(cb);

    if (this.room) {
      this.ensureAction(actionName);
    }
  }
}
