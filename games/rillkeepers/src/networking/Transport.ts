// Transport Abstraction for Rillkeepers P2P Networking

export type NetworkDiagnosticState =
  | 'initializing'
  | 'connecting_relays'
  | 'subscribed'
  | 'announcing'
  | 'discovering_peers'
  | 'connecting_webrtc'
  | 'connected'
  | 'disconnected'
  | 'failed';

export type DiagnosticFailureReason =
  | 'relay_unavailable'
  | 'relay_subscription_failure'
  | 'peer_not_discovered'
  | 'sdp_negotiation_failure'
  | 'ice_connection_failure'
  | 'datachannel_failure'
  | 'authentication_rejection'
  | 'capacity_rejection'
  | 'unknown_failure';

export interface NetworkDiagnosticEvent {
  state: NetworkDiagnosticState;
  details?: string;
  failureReason?: DiagnosticFailureReason;
  timestamp: number;
}

export interface IceCandidateStats {
  hostCandidatesGathered: number;
  srflxCandidatesGathered: number;
  relayCandidatesGathered: number;
  selectedCandidatePair?: {
    localType: string;
    remoteType: string;
    isLoopback?: boolean;
  };
}

export interface ITransport {
  readonly selfId: string;
  connect(roomId: string, password?: string): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  getConnectedPeers(): string[];

  onPeerJoin(cb: (peerId: string) => void): void;
  onPeerLeave(cb: (peerId: string) => void): void;

  sendAction<T>(actionName: string, data: T, targetPeerId?: string): Promise<void>;
  onAction<T>(actionName: string, cb: (data: T, peerId: string) => void): void;

  setHandshakeValidator?(validator: (peerId: string) => Promise<boolean> | boolean): void;
  onJoinError?(cb: (err: any) => void): void;

  getState?(): NetworkDiagnosticState;
  onStateChange?(cb: (event: NetworkDiagnosticEvent) => void): void;
  getIceCandidateStats?(): IceCandidateStats;
  isMdnsFallbackActive?(): boolean;
}
