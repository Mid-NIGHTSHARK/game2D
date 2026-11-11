/**
 * Entities.ts
 * Players, Gold Crates, Wooden Powder Kegs, Bullets, and Minecarts.
 * CC0 1.0 Universal Public Domain.
 */

export type TeamId = 'red' | 'blue';

export interface PlayerInput {
  seq: number;
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  aimAngle: number;
  actionPrimary: boolean;   // Left-click (mine/shoot/throw)
  actionInteract: boolean;  // E key (pickup/throw)
  actionFuse: boolean;      // Q key or Right-click (light fuse)
  actionLantern: boolean;   // F key (shutter lantern)
  slot: number;             // 1: Pickaxe, 2: Flintlock
}

export class MinerEntity {
  public id: string;
  public name: string;
  public team: TeamId;
  public isBot: boolean;
  public x: number;
  public y: number;
  public vx: number = 0;
  public vy: number = 0;
  public aimAngle: number = 0;
  public health: number = 100;
  public maxHealth: number = 100;
  public activeSlot: number = 1; // 1: Pickaxe, 2: Flintlock
  public isLanternShuttered: boolean = false;

  // Inventory / Carrying
  public heldType: 'none' | 'crate' | 'keg' = 'none';
  public heldEntityId: string | null = null;

  // Combat Timers
  public swingCooldown: number = 0;
  public flintlockCooldown: number = 0; // 2.5s reload (150 frames at 60fps)
  public isSwinging: boolean = false;
  public swingArc: number = 0;

  // Respawn
  public isDead: boolean = false;
  public respawnTimer: number = 0;

  // Animation state
  public animFrame: number = 0;
  public animTick: number = 0;
  public isMoving: boolean = false;

  // Water slow factor
  public inWater: boolean = false;

  constructor(id: string, name: string, team: TeamId, x: number, y: number, isBot: boolean = false) {
    this.id = id;
    this.name = name;
    this.team = team;
    this.x = x;
    this.y = y;
    this.isBot = isBot;
  }
}

export class GoldCrateEntity {
  public id: string;
  public x: number;
  public y: number;
  public vx: number = 0;
  public vy: number = 0;
  public isHeld: boolean = false;
  public holderId: string | null = null;
  public inWater: boolean = false;

  constructor(id: string, x: number, y: number) {
    this.id = id;
    this.x = x;
    this.y = y;
  }
}

export class PowderKegEntity {
  public id: string;
  public x: number;
  public y: number;
  public vx: number = 0;
  public vy: number = 0;
  public isHeld: boolean = false;
  public holderId: string | null = null;
  public isLit: boolean = false;
  public fuseRemaining: number = 4.0; // 4.0 seconds
  public inWater: boolean = false;

  constructor(id: string, x: number, y: number) {
    this.id = id;
    this.x = x;
    this.y = y;
  }
}

export class BulletEntity {
  public id: string;
  public shooterId: string;
  public shooterTeam: TeamId;
  public x: number;
  public y: number;
  public vx: number;
  public vy: number;
  public life: number = 1.2; // seconds

  constructor(id: string, shooterId: string, shooterTeam: TeamId, x: number, y: number, vx: number, vy: number) {
    this.id = id;
    this.shooterId = shooterId;
    this.shooterTeam = shooterTeam;
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
  }
}

export interface SoundRipple {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  alpha: number;
  color: number;
}
