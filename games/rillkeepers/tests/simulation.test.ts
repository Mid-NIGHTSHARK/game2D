import { describe, it, expect, beforeEach } from 'vitest';
import { ValleySimulation, MAP_CONFIG } from '../src/shared/Simulation';

describe('Valley Simulation & Interactions', () => {
  let sim: ValleySimulation;

  beforeEach(() => {
    sim = new ValleySimulation();
    // Add test player
    sim.players.set('player_1', {
      id: 'player_1',
      name: 'Keeper Rowan',
      x: 100,
      y: 100,
      vx: 0,
      vy: 0,
      direction: 'down',
      isMoving: false,
      colorIndex: 0,
      carryingObjectId: null,
      lastInputSeq: 0,
      lastActiveTime: Date.now()
    });
  });

  it('updates player movement responsive to input vector and dt', () => {
    sim.applyPlayerInput('player_1', 1, 0, 0.1, 1, 'right');
    const player = sim.players.get('player_1')!;
    expect(player.isMoving).toBe(true);
    expect(player.x).toBeGreaterThan(100);
    expect(player.y).toBe(100);
    expect(player.direction).toBe('right');
    expect(player.lastInputSeq).toBe(1);
  });

  it('enforces world bounds on player movement', () => {
    const player = sim.players.get('player_1')!;
    player.x = 10;
    sim.applyPlayerInput('player_1', -1, 0, 1.0, 2, 'left');
    expect(player.x).toBeGreaterThanOrEqual(16);

    player.x = MAP_CONFIG.widthPx + 100;
    sim.applyPlayerInput('player_1', 1, 0, 1.0, 3, 'right');
    expect(player.x).toBeLessThanOrEqual(MAP_CONFIG.widthPx - 32);
  });

  it('rejects gate interaction when player is too far away', () => {
    const player = sim.players.get('player_1')!;
    player.x = 400; // Far away from gate_upper at (7*16, 8*16) = (112, 128)
    player.y = 400;

    const interacted = sim.interact('player_1', 'gate', 'gate_upper');
    expect(interacted).toBe(false);
  });

  it('allows gate interaction when player is in proximity', () => {
    const player = sim.players.get('player_1')!;
    player.x = 7 * 16 + 10;
    player.y = 8 * 16 + 10;

    const interacted = sim.interact('player_1', 'gate', 'gate_upper');
    expect(interacted).toBe(true);

    const gate = sim.waterNetwork.getNode('gate_upper') as any;
    expect(gate.isOpen).toBe(true);
    expect(sim.objective.gatesOpenedCount).toBe(1);
  });

  it('drifts floating raft across pool when basin is filled with water', () => {
    const raft = sim.platforms.get('platform_raft')!;
    const initialX = raft.x;

    // Fill pool by opening gate and clearing debris
    sim.waterNetwork.setGateState('gate_upper', true);
    sim.waterNetwork.clearDebris('debris_pool_canal');

    // Step simulation across several ticks
    for (let i = 0; i < 20; i++) {
      sim.step(0.1);
    }

    expect(raft.isFloating).toBe(true);
    expect(raft.x).toBeGreaterThan(initialX);
  });

  it('picks up and drops movable crates in front of the player', () => {
    const player = sim.players.get('player_1')!;
    const crate = sim.movables.get('crate_1')!;

    // Move player right next to crate
    player.x = crate.x + 8;
    player.y = crate.y + 8;

    const picked = sim.pickOrDropObject('player_1');
    expect(picked).toBe(true);
    expect(player.carryingObjectId).toBe('crate_1');
    expect(crate.carriedByPlayerId).toBe('player_1');

    // Move player while carrying
    sim.applyPlayerInput('player_1', 1, 0, 0.5, 4, 'right');
    expect(crate.x).toBe(player.x);

    // Drop crate
    const dropped = sim.pickOrDropObject('player_1');
    expect(dropped).toBe(true);
    expect(player.carryingObjectId).toBeNull();
    expect(crate.carriedByPlayerId).toBeNull();
  });

  it('triggers victory and records completion time when water reaches waterwheel', () => {
    expect(sim.objective.waterwheelRestored).toBe(false);

    // Open both gates
    sim.waterNetwork.setGateState('gate_upper', true);
    sim.waterNetwork.setGateState('gate_mill', true);

    sim.step(0.1);

    expect(sim.objective.waterwheelRestored).toBe(true);
    expect(sim.objective.completionTime).not.toBeNull();
  });
});
