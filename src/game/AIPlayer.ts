/**
 * AIPlayer.ts
 * Autonomous Sapper Bots with Tactical Decision Making:
 * Mining Gold Seams, Hoisting Crates, Minecart Extraction,
 * Lit-Keg Counterplay Throwing, and Sabotage.
 * CC0 1.0 Universal Public Domain.
 */

import { MinerEntity, GoldCrateEntity, PowderKegEntity, PlayerInput } from './Entities';
import { WorldState, TileType, TILE_SIZE, MAP_WIDTH, MAP_HEIGHT } from './WorldState';

export enum AIState {
  SEARCH_GOLD = 'SEARCH_GOLD',
  MINE_TILE = 'MINE_TILE',
  PICKUP_CRATE = 'PICKUP_CRATE',
  HAUL_TO_CART = 'HAUL_TO_CART',
  THROW_KEG = 'THROW_KEG',
  COMBAT = 'COMBAT'
}

export class AISapperController {
  public bot: MinerEntity;
  public state: AIState = AIState.SEARCH_GOLD;
  public targetTile: { x: number; y: number } | null = null;
  public targetEntityId: string | null = null;
  public thinkCooldown: number = 0;

  constructor(bot: MinerEntity) {
    this.bot = bot;
  }

  /**
   * Generates input frame for this bot
   */
  public update(
    world: WorldState,
    crates: GoldCrateEntity[],
    kegs: PowderKegEntity[],
    players: MinerEntity[]
  ): PlayerInput {
    const input: PlayerInput = {
      seq: 0,
      up: false,
      down: false,
      left: false,
      right: false,
      aimAngle: this.bot.aimAngle,
      actionPrimary: false,
      actionInteract: false,
      actionFuse: false,
      actionLantern: false,
      slot: 1
    };

    if (this.bot.isDead) return input;

    // Team cart location
    const cartPos = this.bot.team === 'red' ? world.redCartPos : world.blueCartPos;

    // 1. High-Priority Counterplay: Check for ticking lit powder kegs nearby
    let dangerousKeg: PowderKegEntity | null = null;
    let minKegDist = 9999;
    for (const k of kegs) {
      if (k.isLit && !k.isHeld) {
        const d = Math.hypot(k.x - this.bot.x, k.y - this.bot.y);
        if (d < 65 && d < minKegDist) {
          minKegDist = d;
          dangerousKeg = k;
        }
      }
    }

    // If holding a lit keg, immediately throw it towards the enemy side!
    if (this.bot.heldType === 'keg') {
      const enemyCartPos = this.bot.team === 'red' ? world.blueCartPos : world.redCartPos;
      input.aimAngle = Math.atan2(enemyCartPos.y - this.bot.y, enemyCartPos.x - this.bot.x);
      input.actionInteract = true; // Throw!
      this.state = AIState.SEARCH_GOLD;
      return input;
    }

    if (dangerousKeg && minKegDist < 40 && this.bot.heldType === 'none') {
      // Run to keg, pick it up and throw it!
      const angle = Math.atan2(dangerousKeg.y - this.bot.y, dangerousKeg.x - this.bot.x);
      input.aimAngle = angle;
      if (minKegDist <= 20) {
        input.actionInteract = true; // Grab the ticking keg!
      } else {
        input.left = dangerousKeg.x < this.bot.x - 4;
        input.right = dangerousKeg.x > this.bot.x + 4;
        input.up = dangerousKeg.y < this.bot.y - 4;
        input.down = dangerousKeg.y > this.bot.y + 4;
      }
      return input;
    }

    // 2. If holding a Gold Crate -> Haul back to team Minecart!
    if (this.bot.heldType === 'crate') {
      const distToCart = Math.hypot(cartPos.x - this.bot.x, cartPos.y - this.bot.y);
      if (distToCart <= 28) {
        // At cart! Throw into cart hopper!
        input.aimAngle = Math.atan2(cartPos.y - this.bot.y, cartPos.x - this.bot.x);
        input.actionInteract = true;
      } else {
        // Move towards cart
        this.navigateTowards(cartPos.x, cartPos.y, input);
      }
      return input;
    }

    // 3. Check for loose Gold Crates on ground
    let nearestCrate: GoldCrateEntity | null = null;
    let minCrateDist = 320;
    for (const c of crates) {
      if (!c.isHeld) {
        const d = Math.hypot(c.x - this.bot.x, c.y - this.bot.y);
        if (d < minCrateDist) {
          minCrateDist = d;
          nearestCrate = c;
        }
      }
    }

    if (nearestCrate) {
      if (minCrateDist <= 20) {
        input.aimAngle = Math.atan2(nearestCrate.y - this.bot.y, nearestCrate.x - this.bot.x);
        input.actionInteract = true; // Pick up gold crate!
      } else {
        this.navigateTowards(nearestCrate.x, nearestCrate.y, input);
      }
      return input;
    }

    // 4. Combat / Sabotage check: If enemy player is nearby carrying gold
    let enemyCarryingGold: MinerEntity | null = null;
    for (const p of players) {
      if (p.team !== this.bot.team && !p.isDead && p.heldType === 'crate') {
        const d = Math.hypot(p.x - this.bot.x, p.y - this.bot.y);
        if (d < 160) {
          enemyCarryingGold = p;
          break;
        }
      }
    }

    if (enemyCarryingGold) {
      const dist = Math.hypot(enemyCarryingGold.x - this.bot.x, enemyCarryingGold.y - this.bot.y);
      input.aimAngle = Math.atan2(enemyCarryingGold.y - this.bot.y, enemyCarryingGold.x - this.bot.x);

      if (dist > 50 && this.bot.flintlockCooldown <= 0) {
        input.slot = 2; // Equip flintlock
        input.actionPrimary = true; // Shoot!
      } else {
        input.slot = 1; // Equip pickaxe
        this.navigateTowards(enemyCarryingGold.x, enemyCarryingGold.y, input);
        if (dist <= 26) {
          input.actionPrimary = true; // Melee whack!
        }
      }
      return input;
    }

    // 5. Default State: Find Nearest Gold Seam to mine
    if (!this.targetTile || world.getTile(this.targetTile.x, this.targetTile.y) !== TileType.GOLD_SEAM) {
      this.targetTile = this.findNearestTileType(world, TileType.GOLD_SEAM);
    }

    if (this.targetTile) {
      const targetWorldX = this.targetTile.x * TILE_SIZE + 8;
      const targetWorldY = this.targetTile.y * TILE_SIZE + 8;
      const dist = Math.hypot(targetWorldX - this.bot.x, targetWorldY - this.bot.y);

      input.aimAngle = Math.atan2(targetWorldY - this.bot.y, targetWorldX - this.bot.x);
      input.slot = 1; // Pickaxe

      if (dist <= 24) {
        input.actionPrimary = true; // Mine the gold!
      } else {
        this.navigateTowards(targetWorldX, targetWorldY, input);
        // If path is obstructed by dirt or granite, swing pickaxe at obstruction
        const frontX = this.bot.x + Math.cos(input.aimAngle) * 16;
        const frontY = this.bot.y + Math.sin(input.aimAngle) * 16;
        const tx = Math.floor(frontX / TILE_SIZE);
        const ty = Math.floor(frontY / TILE_SIZE);
        if (world.isSolid(tx, ty)) {
          input.actionPrimary = true;
        }
      }
    }

    return input;
  }

  private navigateTowards(targetX: number, targetY: number, input: PlayerInput): void {
    const dx = targetX - this.bot.x;
    const dy = targetY - this.bot.y;
    input.aimAngle = Math.atan2(dy, dx);

    if (Math.abs(dx) > 4) {
      input.left = dx < 0;
      input.right = dx > 0;
    }
    if (Math.abs(dy) > 4) {
      input.up = dy < 0;
      input.down = dy > 0;
    }
  }

  private findNearestTileType(world: WorldState, type: TileType): { x: number; y: number } | null {
    const curTx = Math.floor(this.bot.x / TILE_SIZE);
    const curTy = Math.floor(this.bot.y / TILE_SIZE);
    let bestDist = 99999;
    let bestTile: { x: number; y: number } | null = null;

    for (let r = 1; r < 36; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) === r || Math.abs(dy) === r) {
            const tx = curTx + dx;
            const ty = curTy + dy;
            if (tx >= 2 && tx < MAP_WIDTH - 2 && ty >= 2 && ty < MAP_HEIGHT - 2) {
              if (world.getTile(tx, ty) === type) {
                const d = Math.hypot(dx, dy);
                if (d < bestDist) {
                  bestDist = d;
                  bestTile = { x: tx, y: ty };
                }
              }
            }
          }
        }
      }
      if (bestTile) break; // Found nearest within radius
    }
    return bestTile;
  }
}
