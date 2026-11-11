import { describe, it, expect, beforeEach } from 'vitest';
import { WaterNetwork, GateNode, DebrisNode, WaterWheelNode, PoolNode } from '../src/shared/WaterGraph';
import { createInitialWaterNetwork } from '../src/shared/Simulation';

describe('Rillkeepers Deterministic Water Network', () => {
  let net: WaterNetwork;

  beforeEach(() => {
    net = createInitialWaterNetwork();
  });

  it('initializes with Mountain Spring as authoritative active source', () => {
    const spring = net.getNode('source_spring');
    expect(spring).toBeDefined();
    expect(spring?.inflow).toBe(100);
    expect(spring?.outflow).toBe(100);
    expect(spring?.level).toBe(1.0);
  });

  it('keeps downstream channels dry while Upper Sluice Gate is closed', () => {
    const gate1 = net.getNode<GateNode>('gate_upper');
    expect(gate1?.isOpen).toBe(false);

    const junction = net.getNode('junction_central');
    const waterwheel = net.getNode<WaterWheelNode>('waterwheel_mill');

    expect(junction?.inflow).toBe(0);
    expect(waterwheel?.inflow).toBe(0);
    expect(waterwheel?.isSpinning).toBe(false);
  });

  it('opens Upper Sluice Gate and propagates water to Central Junction', () => {
    const success = net.setGateState('gate_upper', true);
    expect(success).toBe(true);

    const gate1 = net.getNode<GateNode>('gate_upper');
    expect(gate1?.isOpen).toBe(true);
    expect(gate1?.inflow).toBe(100);
    expect(gate1?.outflow).toBe(100);

    const junction = net.getNode('junction_central');
    expect(junction?.inflow).toBe(100);
  });

  it('blocks water flow to Basin Pool when Debris is present', () => {
    net.setGateState('gate_upper', true);
    const pool = net.getNode<PoolNode>('pool_basin');
    expect(pool?.inflow).toBe(0);
    expect(pool?.isFilled).toBe(false);
  });

  it('fills Basin Pool after Debris is cleared', () => {
    net.setGateState('gate_upper', true);
    const cleared = net.clearDebris('debris_pool_canal');
    expect(cleared).toBe(true);

    const debris = net.getNode<DebrisNode>('debris_pool_canal');
    expect(debris?.isCleared).toBe(true);

    const pool = net.getNode<PoolNode>('pool_basin');
    expect(pool?.inflow).toBeGreaterThan(0);

    // Step a few evaluations to fill pool
    for (let i = 0; i < 5; i++) {
      net.evaluate();
    }
    expect(pool?.isFilled).toBe(true);
    expect(pool?.level).toBeGreaterThanOrEqual(0.8);
  });

  it('activates the Waterwheel only when Mill Sluice Gate is opened with flow', () => {
    // Upper gate open
    net.setGateState('gate_upper', true);

    const wheel = net.getNode<WaterWheelNode>('waterwheel_mill');
    expect(wheel?.isSpinning).toBe(false);

    // Open Mill Sluice Gate
    net.setGateState('gate_mill', true);

    expect(wheel?.inflow).toBeGreaterThanOrEqual(wheel!.activationThreshold);
    expect(wheel?.isSpinning).toBe(true);
    expect(wheel?.rpm).toBeGreaterThan(0);
  });

  it('serializes and deserializes the full water network state deterministically', () => {
    net.setGateState('gate_upper', true);
    net.clearDebris('debris_pool_canal');
    net.evaluate();

    const snapshot = net.serialize();
    const restoredNet = new WaterNetwork();
    restoredNet.deserialize(snapshot);

    const originalPool = net.getNode<PoolNode>('pool_basin');
    const restoredPool = restoredNet.getNode<PoolNode>('pool_basin');

    expect(restoredPool?.inflow).toBe(originalPool?.inflow);
    expect(restoredPool?.level).toBe(originalPool?.level);
    expect(restoredPool?.isFilled).toBe(originalPool?.isFilled);
  });
});
