// Shared GameState definitions for Rillkeepers P2P Multiplayer (Host-Authoritative)

import { WaterNetworkState } from './WaterGraph';

export interface PlayerState {
  id: string;
  name: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  direction: 'down' | 'up' | 'left' | 'right';
  isMoving: boolean;
  colorIndex: number; // 0: Teal, 1: Rust, 2: Olive, 3: Ochre
  carryingObjectId: string | null;
  lastInputSeq: number;
  lastActiveTime: number;
}

export interface FloatingPlatformState {
  id: string;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  isFloating: boolean;
  waterNodeId: string;
}

export interface MovableObjectState {
  id: string;
  type: 'crate' | 'barrel';
  x: number;
  y: number;
  carriedByPlayerId: string | null;
}

export interface ObjectiveState {
  waterwheelRestored: boolean;
  gatesOpenedCount: number;
  debrisClearedCount: number;
  startTime: number;
  completionTime: number | null;
}

export interface WorldSnapshot {
  tick: number;
  players: Record<string, PlayerState>;
  waterNetwork: WaterNetworkState;
  platforms: Record<string, FloatingPlatformState>;
  movables: Record<string, MovableObjectState>;
  objective: ObjectiveState;
}
