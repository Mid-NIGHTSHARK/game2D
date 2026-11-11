// Shared simulation logic for Rillkeepers
// Used identically by local simulation and host authority.

import { WaterNetwork, WaterNode, WaterEdge, GateNode, DebrisNode, WaterWheelNode, PoolNode } from './WaterGraph';
import { PlayerState, FloatingPlatformState, MovableObjectState, ObjectiveState, WorldSnapshot } from './GameState';

export const MAP_CONFIG = {
  tileWidth: 16,
  tileHeight: 16,
  mapCols: 40,
  mapRows: 30,
  widthPx: 40 * 16,  // 640px
  heightPx: 30 * 16  // 480px
};

export const CHECKPOINTS = {
  defaultSpawn: { x: 5 * 16, y: 24 * 16 }, // Village entrance meadow
  cliffSpawn: { x: 22 * 16, y: 18 * 16 }
};

export function createInitialWaterNetwork(): WaterNetwork {
  const net = new WaterNetwork();

  // 1. Mountain Spring Source
  const sourceNode: WaterNode = {
    id: 'source_spring',
    type: 'source',
    name: 'Mountain Spring',
    x: 7,
    y: 3,
    inflow: 100,
    outflow: 100,
    level: 1.0
  };

  // 2. Upper Canal Segment
  const upperCanal: WaterNode = {
    id: 'canal_upper',
    type: 'channel',
    name: 'Upper Aqueduct',
    x: 7,
    y: 6,
    inflow: 0,
    outflow: 0,
    level: 0
  };

  // 3. Gate 1 (Upper Sluice Gate) - Initially CLOSED
  const gate1: GateNode = {
    id: 'gate_upper',
    type: 'gate',
    name: 'Upper Sluice Gate',
    x: 7,
    y: 8,
    width: 2,
    height: 2,
    inflow: 0,
    outflow: 0,
    level: 0,
    isOpen: false,
    openPercent: 0.0
  };

  // 4. Central Junction
  const junction: WaterNode = {
    id: 'junction_central',
    type: 'junction',
    name: 'Valley Water Splitter',
    x: 7,
    y: 11,
    inflow: 0,
    outflow: 0,
    level: 0
  };

  // 5. Debris blocking the canal to the Basin Pool
  const debrisNode: DebrisNode = {
    id: 'debris_pool_canal',
    type: 'debris',
    name: 'Storm Timber & Silt',
    x: 10,
    y: 14,
    inflow: 0,
    outflow: 0,
    level: 0,
    isCleared: false,
    blockagePercent: 1.0
  };

  // 6. Basin Pool (Pool 1)
  const poolNode: PoolNode = {
    id: 'pool_basin',
    type: 'pool',
    name: 'Raft Basin',
    x: 13,
    y: 18,
    width: 4,
    height: 3,
    inflow: 0,
    outflow: 0,
    level: 0,
    fillProgress: 0.0,
    isFilled: false
  };

  // 7. Gate 2 (Mill Flume Sluice) - Winch accessible from East Cliff
  const gate2: GateNode = {
    id: 'gate_mill',
    type: 'gate',
    name: 'Mill Race Sluice',
    x: 24,
    y: 11,
    width: 2,
    height: 2,
    inflow: 0,
    outflow: 0,
    level: 0,
    isOpen: false,
    openPercent: 0.0
  };

  // 8. Mill Race Canal
  const millRace: WaterNode = {
    id: 'canal_mill_race',
    type: 'channel',
    name: 'Mill Race Flume',
    x: 26,
    y: 13,
    inflow: 0,
    outflow: 0,
    level: 0
  };

  // 9. Abandoned Waterwheel (Restoration Target!)
  const waterwheel: WaterWheelNode = {
    id: 'waterwheel_mill',
    type: 'waterwheel',
    name: 'Valley Mill Waterwheel',
    x: 28,
    y: 15,
    width: 2,
    height: 2,
    inflow: 0,
    outflow: 0,
    level: 0,
    isSpinning: false,
    rpm: 0,
    activationThreshold: 40
  };

  net.addNode(sourceNode);
  net.addNode(upperCanal);
  net.addNode(gate1);
  net.addNode(junction);
  net.addNode(debrisNode);
  net.addNode(poolNode);
  net.addNode(gate2);
  net.addNode(millRace);
  net.addNode(waterwheel);

  // Connect Edges
  net.addEdge({
    id: 'edge_src_to_upper',
    fromNodeId: 'source_spring',
    toNodeId: 'canal_upper',
    maxFlow: 100,
    currentFlow: 0,
    flowDirection: { x: 0, y: 1 }
  });

  net.addEdge({
    id: 'edge_upper_to_gate1',
    fromNodeId: 'canal_upper',
    toNodeId: 'gate_upper',
    maxFlow: 100,
    currentFlow: 0,
    flowDirection: { x: 0, y: 1 }
  });

  net.addEdge({
    id: 'edge_gate1_to_junction',
    fromNodeId: 'gate_upper',
    toNodeId: 'junction_central',
    maxFlow: 100,
    currentFlow: 0,
    flowDirection: { x: 0, y: 1 }
  });

  // From Junction: West to Debris/Pool (maxFlow: 50)
  net.addEdge({
    id: 'edge_junc_to_debris',
    fromNodeId: 'junction_central',
    toNodeId: 'debris_pool_canal',
    maxFlow: 50,
    currentFlow: 0,
    flowDirection: { x: 1, y: 1 }
  });

  net.addEdge({
    id: 'edge_debris_to_pool',
    fromNodeId: 'debris_pool_canal',
    toNodeId: 'pool_basin',
    maxFlow: 50,
    currentFlow: 0,
    flowDirection: { x: 0, y: 1 }
  });

  // From Junction: East to Gate 2 (maxFlow: 50)
  net.addEdge({
    id: 'edge_junc_to_gate2',
    fromNodeId: 'junction_central',
    toNodeId: 'gate_mill',
    maxFlow: 50,
    currentFlow: 0,
    flowDirection: { x: 1, y: 0 }
  });

  net.addEdge({
    id: 'edge_gate2_to_race',
    fromNodeId: 'gate_mill',
    toNodeId: 'canal_mill_race',
    maxFlow: 50,
    currentFlow: 0,
    flowDirection: { x: 1, y: 1 }
  });

  net.addEdge({
    id: 'edge_race_to_wheel',
    fromNodeId: 'canal_mill_race',
    toNodeId: 'waterwheel_mill',
    maxFlow: 50,
    currentFlow: 0,
    flowDirection: { x: 1, y: 0 }
  });

  net.evaluate();
  return net;
}

export class ValleySimulation {
  public waterNetwork: WaterNetwork;
  public players: Map<string, PlayerState> = new Map();
  public platforms: Map<string, FloatingPlatformState> = new Map();
  public movables: Map<string, MovableObjectState> = new Map();
  public objective: ObjectiveState;
  public currentTick: number = 0;

  constructor() {
    this.waterNetwork = createInitialWaterNetwork();
    this.objective = {
      waterwheelRestored: false,
      gatesOpenedCount: 0,
      debrisClearedCount: 0,
      startTime: Date.now(),
      completionTime: null
    };

    // Initialize Floating Platform in Raft Basin
    this.platforms.set('platform_raft', {
      id: 'platform_raft',
      x: 11 * 16,
      y: 19 * 16,
      targetX: 18 * 16,
      targetY: 19 * 16,
      isFloating: false,
      waterNodeId: 'pool_basin'
    });

    // Initialize a movable crate
    this.movables.set('crate_1', {
      id: 'crate_1',
      type: 'crate',
      x: 6 * 16,
      y: 20 * 16,
      carriedByPlayerId: null
    });
  }

  public step(dtSec: number): void {
    this.currentTick++;

    // Evaluate water simulation
    this.waterNetwork.evaluate();

    // Update Floating Platform based on Basin Pool level
    const pool = this.waterNetwork.getNode<PoolNode>('pool_basin');
    const raft = this.platforms.get('platform_raft');
    if (pool && raft) {
      if (pool.isFilled) {
        raft.isFloating = true;
        // Smoothly glide raft across pool along water current
        const dx = raft.targetX - raft.x;
        if (Math.abs(dx) > 1) {
          raft.x += Math.sign(dx) * 20 * dtSec;
        } else {
          raft.x = raft.targetX;
        }
      } else {
        raft.isFloating = false;
        // Retracts if basin drains
        const origX = 11 * 16;
        const dx = origX - raft.x;
        if (Math.abs(dx) > 1) {
          raft.x += Math.sign(dx) * 15 * dtSec;
        } else {
          raft.x = origX;
        }
      }
    }

    // Check waterwheel objective
    const wheel = this.waterNetwork.getNode<WaterWheelNode>('waterwheel_mill');
    if (wheel && wheel.isSpinning && !this.objective.waterwheelRestored) {
      this.objective.waterwheelRestored = true;
      this.objective.completionTime = Date.now();
    }
  }

  public applyPlayerInput(playerId: string, dx: number, dy: number, dt: number, seq: number, dir: 'down' | 'up' | 'left' | 'right'): void {
    const player = this.players.get(playerId);
    if (!player) return;

    player.direction = dir;
    player.lastInputSeq = seq;
    player.lastActiveTime = Date.now();

    const speed = player.carryingObjectId ? 65 : 90; // Slower while carrying
    const len = Math.hypot(dx, dy);
    if (len > 0.001) {
      player.isMoving = true;
      player.vx = (dx / len) * speed;
      player.vy = (dy / len) * speed;
      player.x += player.vx * dt;
      player.y += player.vy * dt;
    } else {
      player.isMoving = false;
      player.vx = 0;
      player.vy = 0;
    }

    // Keep player within world bounds
    player.x = Math.max(16, Math.min(MAP_CONFIG.widthPx - 32, player.x));
    player.y = Math.max(16, Math.min(MAP_CONFIG.heightPx - 32, player.y));

    // If carrying an object, update object position
    if (player.carryingObjectId) {
      const movable = this.movables.get(player.carryingObjectId);
      if (movable) {
        movable.x = player.x;
        movable.y = player.y - 12; // carried above head
      }
    }
  }

  public interact(playerId: string, targetType: 'gate' | 'debris' | 'lever' | 'waterwheel', targetId: string): boolean {
    const player = this.players.get(playerId);
    if (!player) return false;

    if (targetType === 'gate') {
      const gate = this.waterNetwork.getNode<GateNode>(targetId);
      if (!gate) return false;
      // Proximity check (must be within 40 pixels)
      const dist = Math.hypot(player.x - gate.x * 16, player.y - gate.y * 16);
      if (dist > 50) return false;

      const newState = !gate.isOpen;
      this.waterNetwork.setGateState(targetId, newState);
      if (newState) this.objective.gatesOpenedCount++;
      return true;
    }

    if (targetType === 'debris') {
      const debris = this.waterNetwork.getNode<DebrisNode>(targetId);
      if (!debris || debris.isCleared) return false;
      const dist = Math.hypot(player.x - debris.x * 16, player.y - debris.y * 16);
      if (dist > 50) return false;

      this.waterNetwork.clearDebris(targetId);
      this.objective.debrisClearedCount++;
      return true;
    }

    return false;
  }

  public pickOrDropObject(playerId: string): boolean {
    const player = this.players.get(playerId);
    if (!player) return false;

    if (player.carryingObjectId) {
      // Drop object in front of player
      const movable = this.movables.get(player.carryingObjectId);
      if (movable) {
        movable.carriedByPlayerId = null;
        let dropX = player.x;
        let dropY = player.y;
        if (player.direction === 'down') dropY += 16;
        else if (player.direction === 'up') dropY -= 16;
        else if (player.direction === 'left') dropX -= 16;
        else if (player.direction === 'right') dropX += 16;
        movable.x = dropX;
        movable.y = dropY;
      }
      player.carryingObjectId = null;
      return true;
    } else {
      // Look for closest movable object within 28px
      for (const movable of this.movables.values()) {
        if (!movable.carriedByPlayerId) {
          const dist = Math.hypot(player.x - movable.x, player.y - movable.y);
          if (dist < 32) {
            movable.carriedByPlayerId = playerId;
            player.carryingObjectId = movable.id;
            return true;
          }
        }
      }
    }
    return false;
  }

  public getSnapshot(): WorldSnapshot {
    const players: Record<string, PlayerState> = {};
    for (const [id, p] of this.players.entries()) {
      players[id] = { ...p };
    }
    const platforms: Record<string, FloatingPlatformState> = {};
    for (const [id, pl] of this.platforms.entries()) {
      platforms[id] = { ...pl };
    }
    const movables: Record<string, MovableObjectState> = {};
    for (const [id, m] of this.movables.entries()) {
      movables[id] = { ...m };
    }

    return {
      tick: this.currentTick,
      players,
      waterNetwork: this.waterNetwork.serialize(),
      platforms,
      movables,
      objective: { ...this.objective }
    };
  }
}
