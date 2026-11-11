// Strongly typed WebRTC P2P Multiplayer Protocol & Runtime Validators for Rillkeepers

import { WorldSnapshot } from '../shared/GameState';

export const PROTOCOL_VERSION = '1.0.0';
export const APP_ID = 'com.midnightshark.game2d.rillkeepers.v1';
export const MAX_PLAYERS = 4;

export type Direction = 'down' | 'up' | 'left' | 'right';

// --- Message Payloads ---

export interface JoinRequestPayload {
  protocolVersion: string;
  playerName: string;
  reconnectToken: string;
}

export interface JoinResponsePayload {
  accepted: boolean;
  rejectReason?: string;
  assignedColor: number; // 0..3 (Teal, Rust, Olive, Ochre)
  playerId: string;
  hostPeerId: string;
  initialSnapshot?: WorldSnapshot;
}

export interface GuestInputPayload {
  seq: number;
  dx: number;
  dy: number;
  dt: number;
  direction: Direction;
  interact?: {
    targetType: 'gate' | 'debris' | 'waterwheel';
    targetId: string;
  } | null;
  pickDrop?: boolean;
}

export interface WorldEventPayload {
  eventId: string;
  eventSeq: number;
  type: 'gate_toggled' | 'debris_cleared' | 'raft_drifted' | 'waterwheel_activated' | 'victory';
  targetId: string;
  data?: any;
  timestamp: number;
}

export interface ResyncRequestPayload {
  lastKnownTick: number;
  lastKnownEventSeq: number;
}

export interface ResyncResponsePayload {
  snapshot: WorldSnapshot;
  latestEventSeq: number;
}

export interface HeartbeatPayload {
  timestamp: number;
  isHost: boolean;
}

// --- Runtime Validators ---

export function sanitizePlayerName(raw: string): string {
  if (!raw || typeof raw !== 'string') return 'Keeper ' + Math.floor(Math.random() * 900 + 100);
  const clean = raw.trim().replace(/[<>\"'&/]/g, '').slice(0, 24);
  return clean.length > 0 ? clean : 'Keeper ' + Math.floor(Math.random() * 900 + 100);
}

export function isValidDirection(dir: any): dir is Direction {
  return dir === 'down' || dir === 'up' || dir === 'left' || dir === 'right';
}

export function isValidGuestInput(payload: any): payload is GuestInputPayload {
  if (!payload || typeof payload !== 'object') return false;

  const { seq, dx, dy, dt, direction } = payload;
  if (!Number.isInteger(seq) || seq < 0) return false;
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || !Number.isFinite(dt)) return false;
  if (dt <= 0 || dt > 1.0) return false;
  if (Math.abs(dx) > 1.5 || Math.abs(dy) > 1.5) return false; // Sanity limit
  if (!isValidDirection(direction)) return false;

  if (payload.interact) {
    const { targetType, targetId } = payload.interact;
    if (typeof targetId !== 'string' || targetId.length > 32) return false;
    if (targetType !== 'gate' && targetType !== 'debris' && targetType !== 'waterwheel') return false;
  }

  return true;
}

export function isValidWorldEvent(payload: any): payload is WorldEventPayload {
  if (!payload || typeof payload !== 'object') return false;
  const { eventId, eventSeq, type, targetId, timestamp } = payload;
  if (typeof eventId !== 'string' || eventId.length === 0) return false;
  if (!Number.isInteger(eventSeq) || eventSeq < 0) return false;
  if (!Number.isFinite(timestamp)) return false;
  if (typeof targetId !== 'string') return false;

  const validTypes = ['gate_toggled', 'debris_cleared', 'raft_drifted', 'waterwheel_activated', 'victory'];
  return validTypes.includes(type);
}

export function isValidJoinRequest(payload: any): payload is JoinRequestPayload {
  if (!payload || typeof payload !== 'object') return false;
  const { protocolVersion, playerName, reconnectToken } = payload;
  if (typeof protocolVersion !== 'string' || protocolVersion !== PROTOCOL_VERSION) return false;
  if (typeof playerName !== 'string' || playerName.length === 0) return false;
  if (typeof reconnectToken !== 'string') return false;
  return true;
}

export function isValidJoinResponse(payload: any): payload is JoinResponsePayload {
  if (!payload || typeof payload !== 'object') return false;
  if (typeof payload.accepted !== 'boolean') return false;
  if (payload.accepted) {
    if (typeof payload.assignedColor !== 'number' || payload.assignedColor < 0 || payload.assignedColor > 3) return false;
    if (typeof payload.playerId !== 'string' || typeof payload.hostPeerId !== 'string') return false;
    if (!payload.initialSnapshot || typeof payload.initialSnapshot !== 'object') return false;
  }
  return true;
}

export function isValidSnapshot(snap: any): snap is WorldSnapshot {
  if (!snap || typeof snap !== 'object') return false;
  if (!Number.isInteger(snap.tick)) return false;
  if (!snap.players || typeof snap.players !== 'object') return false;
  if (!snap.waterNetwork || typeof snap.waterNetwork !== 'object') return false;
  if (!snap.objective || typeof snap.objective !== 'object') return false;
  return true;
}
