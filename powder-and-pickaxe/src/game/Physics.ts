/**
 * Physics.ts
 * Kinematics, Collision, Carrying, Throwing, Water Currents, and Explosions.
 * CC0 1.0 Universal Public Domain.
 */

import { WorldState, TileType, TILE_SIZE, MAP_WIDTH, MAP_HEIGHT } from './WorldState';
import { MinerEntity, GoldCrateEntity, PowderKegEntity, BulletEntity } from './Entities';

export class PhysicsEngine {
  public static readonly BASE_SPEED = 110; // Pixels per second
  public static readonly CARRY_SPEED_MULT = 0.65; // -35% speed when carrying
  public static readonly WATER_SPEED_MULT = 0.75; // -25% speed when in water
  public static readonly THROW_SPEED = 320; // Pixels per second
  public static readonly BULLET_SPEED = 620; // Pixels per second
  public static readonly FRICTION = 0.91; // Per-tick damping for sliding objects
  public static readonly BOUNCE_RESTITUTION = 0.55;

  /**
   * Updates player movement against tile collisions
   */
  public static updatePlayerMovement(
    player: MinerEntity,
    world: WorldState,
    dt: number
  ): void {
    if (player.isDead) return;

    // Determine current speed multiplier
    let speed = this.BASE_SPEED;
    if (player.heldType !== 'none') {
      speed *= this.CARRY_SPEED_MULT;
    }

    const tileX = Math.floor(player.x / TILE_SIZE);
    const tileY = Math.floor(player.y / TILE_SIZE);
    const waterDepth = world.waterGrid[world.getIndex(tileX, tileY)] || 0;
    player.inWater = waterDepth > 0;

    if (player.inWater) {
      speed *= this.WATER_SPEED_MULT;
    }

    // Apply desired velocity
    let targetVx = player.vx;
    let targetVy = player.vy;

    // Normalizing diagonal speed
    if (targetVx !== 0 && targetVy !== 0) {
      const invLen = 1 / Math.SQRT2;
      targetVx *= invLen;
      targetVy *= invLen;
    }

    const dx = targetVx * speed * dt;
    const dy = targetVy * speed * dt;

    // Move and slide along X
    const newX = player.x + dx;
    if (!this.checkPlayerTileCollision(newX, player.y, world)) {
      player.x = newX;
    }

    // Move and slide along Y
    const newY = player.y + dy;
    if (!this.checkPlayerTileCollision(player.x, newY, world)) {
      player.y = newY;
    }

    // Constrain to world bounds
    player.x = Math.max(TILE_SIZE * 2, Math.min((MAP_WIDTH - 2) * TILE_SIZE, player.x));
    player.y = Math.max(TILE_SIZE * 2, Math.min((MAP_HEIGHT - 2) * TILE_SIZE, player.y));
  }

  /**
   * Checks player bounding box (12x12) against solid world tiles
   */
  public static checkPlayerTileCollision(x: number, y: number, world: WorldState): boolean {
    const half = 6;
    const left = Math.floor((x - half) / TILE_SIZE);
    const right = Math.floor((x + half) / TILE_SIZE);
    const top = Math.floor((y - half) / TILE_SIZE);
    const bottom = Math.floor((y + half) / TILE_SIZE);

    for (let ty = top; ty <= bottom; ty++) {
      for (let tx = left; tx <= right; tx++) {
        if (world.isSolid(tx, ty)) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Updates physical crates (sliding, wall bouncing, floating in water currents)
   */
  public static updateCratePhysics(
    crate: GoldCrateEntity,
    world: WorldState,
    dt: number
  ): void {
    if (crate.isHeld) return;

    const tileX = Math.floor(crate.x / TILE_SIZE);
    const tileY = Math.floor(crate.y / TILE_SIZE);
    const waterDepth = world.waterGrid[world.getIndex(tileX, tileY)] || 0;
    crate.inWater = waterDepth > 0;

    // Water current drift: check water gradient in adjacent tiles
    if (crate.inWater) {
      const leftW = world.waterGrid[world.getIndex(tileX - 1, tileY)] || 0;
      const rightW = world.waterGrid[world.getIndex(tileX + 1, tileY)] || 0;
      const downW = world.waterGrid[world.getIndex(tileX, tileY + 1)] || 0;
      const upW = world.waterGrid[world.getIndex(tileX, tileY - 1)] || 0;

      const driftX = (rightW - leftW) * 8;
      const driftY = (downW - upW) * 8;
      crate.vx += driftX * dt;
      crate.vy += driftY * dt;
    }

    // Velocity update
    if (Math.abs(crate.vx) > 1 || Math.abs(crate.vy) > 1) {
      const nextX = crate.x + crate.vx * dt;
      if (this.checkPointTileCollision(nextX, crate.y, 6, world)) {
        crate.vx = -crate.vx * this.BOUNCE_RESTITUTION;
      } else {
        crate.x = nextX;
      }

      const nextY = crate.y + crate.vy * dt;
      if (this.checkPointTileCollision(crate.x, nextY, 6, world)) {
        crate.vy = -crate.vy * this.BOUNCE_RESTITUTION;
      } else {
        crate.y = nextY;
      }

      // Apply friction
      crate.vx *= this.FRICTION;
      crate.vy *= this.FRICTION;
    } else {
      crate.vx = 0;
      crate.vy = 0;
    }
  }

  /**
   * Updates powder kegs (sliding, fuse countdown, water extinguishing)
   */
  public static updateKegPhysics(
    keg: PowderKegEntity,
    world: WorldState,
    dt: number
  ): { exploded: boolean } {
    if (!keg.isHeld) {
      const tileX = Math.floor(keg.x / TILE_SIZE);
      const tileY = Math.floor(keg.y / TILE_SIZE);
      const waterDepth = world.waterGrid[world.getIndex(tileX, tileY)] || 0;
      keg.inWater = waterDepth > 0;

      // Water extinguishes lit powder keg fuse!
      if (keg.isLit && keg.inWater) {
        keg.isLit = false;
        keg.fuseRemaining = 4.0;
      }

      // Velocity & bounce
      if (Math.abs(keg.vx) > 1 || Math.abs(keg.vy) > 1) {
        const nextX = keg.x + keg.vx * dt;
        if (this.checkPointTileCollision(nextX, keg.y, 6, world)) {
          keg.vx = -keg.vx * this.BOUNCE_RESTITUTION;
        } else {
          keg.x = nextX;
        }

        const nextY = keg.y + keg.vy * dt;
        if (this.checkPointTileCollision(keg.x, nextY, 6, world)) {
          keg.vy = -keg.vy * this.BOUNCE_RESTITUTION;
        } else {
          keg.y = nextY;
        }

        keg.vx *= this.FRICTION;
        keg.vy *= this.FRICTION;
      } else {
        keg.vx = 0;
        keg.vy = 0;
      }
    }

    // Fuse countdown
    if (keg.isLit) {
      keg.fuseRemaining -= dt;
      if (keg.fuseRemaining <= 0) {
        return { exploded: true };
      }
    }

    return { exploded: false };
  }

  /**
   * Point circle collision against solid tiles
   */
  public static checkPointTileCollision(x: number, y: number, radius: number, world: WorldState): boolean {
    const left = Math.floor((x - radius) / TILE_SIZE);
    const right = Math.floor((x + radius) / TILE_SIZE);
    const top = Math.floor((y - radius) / TILE_SIZE);
    const bottom = Math.floor((y + radius) / TILE_SIZE);

    for (let ty = top; ty <= bottom; ty++) {
      for (let tx = left; tx <= right; tx++) {
        if (world.isSolid(tx, ty)) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Throws a carried object in aim direction
   */
  public static throwObject(
    player: MinerEntity,
    crate: GoldCrateEntity | null,
    keg: PowderKegEntity | null
  ): void {
    const cos = Math.cos(player.aimAngle);
    const sin = Math.sin(player.aimAngle);

    if (crate && player.heldEntityId === crate.id) {
      crate.isHeld = false;
      crate.holderId = null;
      crate.x = player.x + cos * 14;
      crate.y = player.y + sin * 14;
      crate.vx = cos * this.THROW_SPEED;
      crate.vy = sin * this.THROW_SPEED;
      player.heldType = 'none';
      player.heldEntityId = null;
    } else if (keg && player.heldEntityId === keg.id) {
      keg.isHeld = false;
      keg.holderId = null;
      keg.x = player.x + cos * 14;
      keg.y = player.y + sin * 14;
      keg.vx = cos * this.THROW_SPEED;
      keg.vy = sin * this.THROW_SPEED;
      player.heldType = 'none';
      player.heldEntityId = null;
    }
  }

  /**
   * Performs explosion carving, damage, impulse, and chain reactions
   */
  public static executeExplosion(
    blastX: number,
    blastY: number,
    radius: number,
    world: WorldState,
    players: MinerEntity[],
    crates: GoldCrateEntity[],
    kegs: PowderKegEntity[],
    onDropGoldCrate: (x: number, y: number) => void
  ): { hitPlayerIds: string[]; triggeredKegIds: string[]; destroyedTiles: [number, number][] } {
    const hitPlayerIds: string[] = [];
    const triggeredKegIds: string[] = [];
    const destroyedTiles: [number, number][] = [];

    const blastTileX = Math.floor(blastX / TILE_SIZE);
    const blastTileY = Math.floor(blastY / TILE_SIZE);
    const tileRadius = Math.ceil(radius / TILE_SIZE);

    // 1. Carve crater in WorldState
    for (let dy = -tileRadius; dy <= tileRadius; dy++) {
      for (let dx = -tileRadius; dx <= tileRadius; dx++) {
        const dist = Math.hypot(dx * TILE_SIZE, dy * TILE_SIZE);
        if (dist <= radius) {
          const tx = blastTileX + dx;
          const ty = blastTileY + dy;
          const res = world.damageTile(tx, ty, 10); // Massive damage clears Granite, Dirt, Timber
          if (res.destroyed) {
            destroyedTiles.push([tx, ty]);
            if (res.droppedGold) {
              onDropGoldCrate(tx * TILE_SIZE + 8, ty * TILE_SIZE + 8);
            }
          }
        }
      }
    }

    // 2. Chain detonate gas pockets
    for (let dy = -tileRadius - 1; dy <= tileRadius + 1; dy++) {
      for (let dx = -tileRadius - 1; dx <= tileRadius + 1; dx++) {
        const tx = blastTileX + dx;
        const ty = blastTileY + dy;
        if (world.getTile(tx, ty) === TileType.GAS_POCKET) {
          world.setTile(tx, ty, TileType.EMPTY);
          destroyedTiles.push([tx, ty]);
        }
      }
    }

    // 3. Player damage & knockback
    for (const p of players) {
      if (p.isDead) continue;
      const dist = Math.hypot(p.x - blastX, p.y - blastY);
      if (dist <= radius * 1.5) {
        const damage = Math.max(25, Math.floor((1 - dist / (radius * 1.5)) * 100));
        p.health -= damage;
        hitPlayerIds.push(p.id);

        // Impulse knockback
        const angle = Math.atan2(p.y - blastY, p.x - blastX);
        p.x += Math.cos(angle) * (radius * 0.4);
        p.y += Math.sin(angle) * (radius * 0.4);

        // Knock held items out of hand
        if (p.heldType !== 'none') {
          p.heldType = 'none';
          p.heldEntityId = null;
        }

        if (p.health <= 0) {
          p.isDead = true;
          p.respawnTimer = 4.0;
        }
      }
    }

    // 4. Knock crates
    for (const c of crates) {
      const dist = Math.hypot(c.x - blastX, c.y - blastY);
      if (dist <= radius * 1.4 && !c.isHeld) {
        const angle = Math.atan2(c.y - blastY, c.x - blastX);
        c.vx = Math.cos(angle) * 350;
        c.vy = Math.sin(angle) * 350;
      }
    }

    // 5. Chain detonate adjacent kegs
    for (const k of kegs) {
      const dist = Math.hypot(k.x - blastX, k.y - blastY);
      if (dist <= radius && dist > 2) {
        if (!k.isLit) {
          k.isLit = true;
          k.fuseRemaining = 0.1; // Instantly ignite and detonate in next tick!
          triggeredKegIds.push(k.id);
        }
      }
    }

    return { hitPlayerIds, triggeredKegIds, destroyedTiles };
  }
}

