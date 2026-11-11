// Client-side prediction & reconciliation for local player

import { PlayerState } from '../shared/GameState';
import { CONFIG } from '../config';
import { Direction } from './Protocol';

export interface PredictedInput {
  seq: number;
  dx: number;
  dy: number;
  dt: number;
  direction: Direction;
}

export class ClientPredictor {
  private pendingInputs: PredictedInput[] = [];
  private currentSeq: number = 0;

  public getNextSeq(): number {
    return ++this.currentSeq;
  }

  public recordInput(dx: number, dy: number, dt: number, direction: Direction): PredictedInput {
    const payload: PredictedInput = {
      seq: this.getNextSeq(),
      dx,
      dy,
      dt,
      direction
    };
    this.pendingInputs.push(payload);
    // Limit buffer length
    if (this.pendingInputs.length > 60) {
      this.pendingInputs.shift();
    }
    return payload;
  }

  public reconcile(authoritativePlayer: PlayerState, localPlayer: { x: number; y: number }): void {
    // Filter out inputs acknowledged by server
    this.pendingInputs = this.pendingInputs.filter(input => input.seq > authoritativePlayer.lastInputSeq);

    // Start from authoritative position
    let estX = authoritativePlayer.x;
    let estY = authoritativePlayer.y;

    // Replay pending inputs
    const speed = authoritativePlayer.carryingObjectId ? CONFIG.PLAYER_CARRY_SPEED : CONFIG.PLAYER_SPEED;
    for (const input of this.pendingInputs) {
      const len = Math.hypot(input.dx, input.dy);
      if (len > 0.001) {
        estX += (input.dx / len) * speed * input.dt;
        estY += (input.dy / len) * speed * input.dt;
      }
    }

    // Soft correction if drift is small, snap if large (>32px)
    const errX = estX - localPlayer.x;
    const errY = estY - localPlayer.y;
    const dist = Math.hypot(errX, errY);

    if (dist > 32) {
      localPlayer.x = estX;
      localPlayer.y = estY;
    } else if (dist > 1) {
      localPlayer.x += errX * 0.2;
      localPlayer.y += errY * 0.2;
    }
  }

  public clear(): void {
    this.pendingInputs = [];
    this.currentSeq = 0;
  }
}
