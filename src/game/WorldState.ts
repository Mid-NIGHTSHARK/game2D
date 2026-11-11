/**
 * WorldState.ts
 * 72x72 Seeded Destructible Cavern, Tile HP, Voronoi Veins,
 * Cellular Water Flooding Simulation, and Gas Pockets.
 * CC0 1.0 Universal Public Domain.
 */

export const MAP_WIDTH = 72;
export const MAP_HEIGHT = 72;
export const TILE_SIZE = 16; // 16x16 pixels per tile

export enum TileType {
  EMPTY = 0,
  BEDROCK = 1,
  GRANITE = 2,
  DIRT = 3,
  TIMBER_WALL = 4,
  GOLD_SEAM = 5,
  WATER_POCKET = 6,
  GAS_POCKET = 7
}

export interface TileHealth {
  maxHp: number;
  currentHp: number;
}

export interface WaterTileInfo {
  depth: number; // 1 to 4
  flowDirX: number; // -1, 0, 1
  flowDirY: number; // -1, 0, 1
}

export class WorldState {
  public seed: number;
  public tiles: Uint8Array;
  public healths: Uint8Array; // Current HP per tile
  public waterGrid: Uint8Array; // 0: no water, 1-4: water depth
  public gasIgnited: Uint8Array; // 1 if currently detonating gas
  public lastWaterSimTime: number = 0;

  // Extraction Cart Positions (in world pixels)
  public redCartPos = { x: 5 * TILE_SIZE + 16, y: 36 * TILE_SIZE + 12 };
  public blueCartPos = { x: 66 * TILE_SIZE + 16, y: 36 * TILE_SIZE + 12 };

  // Spawns
  public redSpawnPos = { x: 7 * TILE_SIZE, y: 36 * TILE_SIZE };
  public blueSpawnPos = { x: 64 * TILE_SIZE, y: 36 * TILE_SIZE };

  constructor(seed: number = 133742) {
    this.seed = seed;
    this.tiles = new Uint8Array(MAP_WIDTH * MAP_HEIGHT);
    this.healths = new Uint8Array(MAP_WIDTH * MAP_HEIGHT);
    this.waterGrid = new Uint8Array(MAP_WIDTH * MAP_HEIGHT);
    this.gasIgnited = new Uint8Array(MAP_WIDTH * MAP_HEIGHT);
    this.generate();
  }

  /**
   * Mulberry32 PRNG from seed
   */
  private createPRNG(seed: number) {
    let s = seed | 0;
    return () => {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  public getIndex(x: number, y: number): number {
    if (x < 0 || x >= MAP_WIDTH || y < 0 || y >= MAP_HEIGHT) return -1;
    return y * MAP_WIDTH + x;
  }

  public getTile(x: number, y: number): TileType {
    const idx = this.getIndex(x, y);
    if (idx === -1) return TileType.BEDROCK;
    return this.tiles[idx];
  }

  public setTile(x: number, y: number, type: TileType): void {
    const idx = this.getIndex(x, y);
    if (idx === -1) return;
    this.tiles[idx] = type;
    this.healths[idx] = this.getMaxHp(type);
    if (type === TileType.WATER_POCKET) {
      this.waterGrid[idx] = 4;
    } else if (type !== TileType.EMPTY) {
      this.waterGrid[idx] = 0;
    }
  }

  public getMaxHp(type: TileType): number {
    switch (type) {
      case TileType.DIRT: return 2;
      case TileType.TIMBER_WALL: return 3;
      case TileType.GOLD_SEAM: return 3;
      case TileType.GRANITE: return 6;
      case TileType.WATER_POCKET: return 2;
      case TileType.GAS_POCKET: return 1;
      case TileType.BEDROCK: return 255;
      default: return 0;
    }
  }

  public isSolid(x: number, y: number): boolean {
    const t = this.getTile(x, y);
    return t !== TileType.EMPTY && t !== TileType.GAS_POCKET;
  }

  public isPassable(x: number, y: number): boolean {
    const t = this.getTile(x, y);
    return t === TileType.EMPTY || t === TileType.GAS_POCKET;
  }

  /**
   * Generates the cavern terrain
   */
  public generate(): void {
    const prng = this.createPRNG(this.seed);

    // 1. Fill entire grid initially with Granite & Bedrock borders
    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        const idx = y * MAP_WIDTH + x;
        if (x <= 1 || x >= MAP_WIDTH - 2 || y <= 1 || y >= MAP_HEIGHT - 2) {
          this.tiles[idx] = TileType.BEDROCK;
        } else {
          // Cellular initial noise
          this.tiles[idx] = prng() < 0.44 ? TileType.EMPTY : TileType.GRANITE;
        }
      }
    }

    // 2. Cellular Automata Smoothing (4 passes)
    for (let step = 0; step < 4; step++) {
      const nextTiles = new Uint8Array(this.tiles);
      for (let y = 2; y < MAP_HEIGHT - 2; y++) {
        for (let x = 2; x < MAP_WIDTH - 2; x++) {
          const idx = y * MAP_WIDTH + x;
          let wallCount = 0;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (this.tiles[(y + dy) * MAP_WIDTH + (x + dx)] !== TileType.EMPTY) {
                wallCount++;
              }
            }
          }
          if (wallCount >= 5) {
            nextTiles[idx] = TileType.GRANITE;
          } else {
            nextTiles[idx] = TileType.EMPTY;
          }
        }
      }
      this.tiles.set(nextTiles);
    }

    // 3. Clear Team Base Outposts & Central Corridor
    // West Red Crew base
    for (let y = 30; y <= 42; y++) {
      for (let x = 2; x <= 12; x++) {
        this.tiles[y * MAP_WIDTH + x] = TileType.EMPTY;
      }
    }
    // East Blue Crew base
    for (let y = 30; y <= 42; y++) {
      for (let x = MAP_WIDTH - 13; x <= MAP_WIDTH - 3; x++) {
        this.tiles[y * MAP_WIDTH + x] = TileType.EMPTY;
      }
    }
    // Central Vault
    for (let y = 32; y <= 40; y++) {
      for (let x = 32; x <= 40; x++) {
        this.tiles[y * MAP_WIDTH + x] = TileType.EMPTY;
      }
    }
    // Main connection tunnel from West to East
    for (let x = 10; x <= MAP_WIDTH - 11; x++) {
      for (let y = 35; y <= 37; y++) {
        this.tiles[y * MAP_WIDTH + x] = TileType.EMPTY;
      }
    }

    // 4. Infill with Dirt, Gold Seams, Timber, Water, and Gas pockets using Voronoi/Noise seeds
    for (let y = 2; y < MAP_HEIGHT - 2; y++) {
      for (let x = 2; x < MAP_WIDTH - 2; x++) {
        const idx = y * MAP_WIDTH + x;
        const current = this.tiles[idx];

        // Dirt infill inside solid granite
        if (current === TileType.GRANITE) {
          const r = prng();
          if (r < 0.28) {
            this.tiles[idx] = TileType.DIRT;
          } else if (r < 0.38) {
            this.tiles[idx] = TileType.TIMBER_WALL;
          }
        }
      }
    }

    // 5. Place Gold Seams in clusters (Pyrite Veins)
    const goldClusterCount = 18;
    for (let c = 0; c < goldClusterCount; c++) {
      const cx = Math.floor(prng() * (MAP_WIDTH - 20)) + 10;
      const cy = Math.floor(prng() * (MAP_HEIGHT - 20)) + 10;
      const clusterSize = Math.floor(prng() * 4) + 3;
      for (let i = 0; i < clusterSize; i++) {
        const gx = cx + Math.floor(prng() * 3) - 1;
        const gy = cy + Math.floor(prng() * 3) - 1;
        if (gx > 2 && gx < MAP_WIDTH - 3 && gy > 2 && gy < MAP_HEIGHT - 3) {
          this.tiles[gy * MAP_WIDTH + gx] = TileType.GOLD_SEAM;
        }
      }
    }

    // 6. Place Pressurized Water Pockets
    const waterPockets = 8;
    for (let w = 0; w < waterPockets; w++) {
      const wx = Math.floor(prng() * (MAP_WIDTH - 24)) + 12;
      const wy = Math.floor(prng() * (MAP_HEIGHT - 24)) + 12;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const posIdx = (wy + dy) * MAP_WIDTH + (wx + dx);
          this.tiles[posIdx] = TileType.WATER_POCKET;
          this.waterGrid[posIdx] = 4;
        }
      }
    }

    // 7. Place Volatile Gas Pockets in dug rooms
    for (let y = 4; y < MAP_HEIGHT - 4; y++) {
      for (let x = 4; x < MAP_WIDTH - 4; x++) {
        const idx = y * MAP_WIDTH + x;
        if (this.tiles[idx] === TileType.EMPTY && prng() < 0.04) {
          // Check if distance from spawns is reasonable
          const distRed = Math.hypot(x - 6, y - 36);
          const distBlue = Math.hypot(x - 66, y - 36);
          if (distRed > 8 && distBlue > 8) {
            this.tiles[idx] = TileType.GAS_POCKET;
          }
        }
      }
    }

    // 8. Initialize Max HPs
    for (let i = 0; i < this.tiles.length; i++) {
      this.healths[i] = this.getMaxHp(this.tiles[i]);
    }
  }

  /**
   * Cellular Water Flooding Simulation step (executed every 150ms)
   * Flows into adjacent empty floor tiles and equalizes levels.
   */
  public updateWaterSimulation(): { floodedIndices: number[]; driedIndices: number[] } {
    const nextWater = new Uint8Array(this.waterGrid);
    const floodedIndices: number[] = [];
    const driedIndices: number[] = [];

    // Directions: Down, Left, Right, Up
    const neighbors = [
      { dx: 0, dy: 1 },
      { dx: -1, dy: 0 },
      { dx: 1, dy: 0 },
      { dx: 0, dy: -1 }
    ];

    for (let y = 1; y < MAP_HEIGHT - 1; y++) {
      for (let x = 1; x < MAP_WIDTH - 1; x++) {
        const idx = y * MAP_WIDTH + x;
        const currentWater = this.waterGrid[idx];
        const tile = this.tiles[idx];

        // Pressurized water source continuously refills
        if (tile === TileType.WATER_POCKET) {
          nextWater[idx] = 4;
        }

        if (currentWater > 0 && tile === TileType.EMPTY) {
          // Flow downwards primarily, then sideways
          for (const n of neighbors) {
            const nx = x + n.dx;
            const ny = y + n.dy;
            const nIdx = ny * MAP_WIDTH + nx;
            const nTile = this.tiles[nIdx];

            if (nTile === TileType.EMPTY) {
              const nWater = this.waterGrid[nIdx];
              if (nWater < currentWater) {
                // Flow into neighbor
                const transfer = Math.max(1, Math.floor((currentWater - nWater) / 2));
                if (nextWater[idx] >= transfer && nextWater[nIdx] + transfer <= 4) {
                  nextWater[idx] -= transfer;
                  nextWater[nIdx] += transfer;
                  floodedIndices.push(nIdx);
                }
              }
            }
          }
        }
      }
    }

    for (let i = 0; i < this.waterGrid.length; i++) {
      if (this.waterGrid[i] > 0 && nextWater[i] === 0) {
        driedIndices.push(i);
      }
    }

    this.waterGrid.set(nextWater);
    return { floodedIndices, driedIndices };
  }

  /**
   * Applies damage to a tile. Returns true if destroyed.
   */
  public damageTile(tileX: number, tileY: number, damage: number = 1): { destroyed: boolean; droppedGold: boolean } {
    const idx = this.getIndex(tileX, tileY);
    if (idx === -1) return { destroyed: false, droppedGold: false };

    const type = this.tiles[idx];
    if (type === TileType.BEDROCK || type === TileType.EMPTY) {
      return { destroyed: false, droppedGold: false };
    }

    if (this.healths[idx] <= damage) {
      this.healths[idx] = 0;
      const isGold = type === TileType.GOLD_SEAM;
      const wasWaterPocket = type === TileType.WATER_POCKET;

      this.tiles[idx] = TileType.EMPTY;
      if (wasWaterPocket) {
        this.waterGrid[idx] = 4; // Bursts pressurized water into chamber!
      }
      return { destroyed: true, droppedGold: isGold };
    } else {
      this.healths[idx] -= damage;
      return { destroyed: false, droppedGold: false };
    }
  }

  /**
   * Serializes current terrain delta for late joiners
   */
  public serializeDelta(): { modified: [number, number, number][]; water: [number, number][] } {
    const modified: [number, number, number][] = [];
    const water: [number, number][] = [];

    for (let i = 0; i < this.tiles.length; i++) {
      if (this.tiles[i] === TileType.EMPTY) {
        modified.push([i, this.tiles[i], this.healths[i]]);
      }
      if (this.waterGrid[i] > 0) {
        water.push([i, this.waterGrid[i]]);
      }
    }
    return { modified, water };
  }

  public applyDelta(delta: { modified: [number, number, number][]; water: [number, number][] }): void {
    for (const [idx, type, hp] of delta.modified) {
      if (idx >= 0 && idx < this.tiles.length) {
        this.tiles[idx] = type;
        this.healths[idx] = hp;
      }
    }
    this.waterGrid.fill(0);
    for (const [idx, depth] of delta.water) {
      if (idx >= 0 && idx < this.waterGrid.length) {
        this.waterGrid[idx] = depth;
      }
    }
  }
}
