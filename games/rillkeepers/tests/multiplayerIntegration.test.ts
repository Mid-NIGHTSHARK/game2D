import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MockTransport } from '../src/networking/MockTransport';
import { NetworkManager } from '../src/networking/NetworkManager';
import { ValleySimulation } from '../src/shared/Simulation';
import { GateNode, DebrisNode, WaterWheelNode } from '../src/shared/WaterGraph';
import { WorldSnapshot } from '../src/shared/GameState';
import { formatCombinedInviteCode, generateInvitationUrl } from '../src/networking/RoomCode';

describe('P2P Host-Authoritative Integration Tests', () => {
  let hostNet: NetworkManager;
  let guest1Net: NetworkManager;
  let guest2Net: NetworkManager;
  let sim: ValleySimulation;

  beforeEach(() => {
    MockTransport.resetAll();
    sim = new ValleySimulation();
  });

  afterEach(async () => {
    if (hostNet) await hostNet.disconnect();
    if (guest1Net) await guest1Net.disconnect();
    if (guest2Net) await guest2Net.disconnect();
  });

  it('orchestrates 1 Host and 2 Guests: movement, gate, debris, waterwheel sync using dual roomId and roomSecret', async () => {
    const roomId = 'TESTVALLEY99';
    const roomSecret = 'SECRETKEY9876543';

    // 1. Host creates room
    const hostTransport = new MockTransport('peer_host');
    hostNet = new NetworkManager(hostTransport);
    const { roomId: createdId, roomSecret: createdSecret, inviteUrl, combinedCode } = await hostNet.createWorld(
      sim,
      roomId,
      roomSecret,
      'Host Keeper'
    );
    expect(createdId).toBe(roomId);
    expect(createdSecret).toBe(roomSecret);
    expect(inviteUrl).toContain(`?room=${roomId}#key=${roomSecret}`);
    expect(combinedCode).toBe(`${roomId}.${roomSecret}`);
    expect(hostNet.isHost()).toBe(true);

    // 2. Guest 1 joins using separate roomId and roomSecret
    const g1Transport = new MockTransport('peer_guest1');
    guest1Net = new NetworkManager(g1Transport);

    let g1Snapshot: WorldSnapshot | null = null;
    let g1PlayerId = '';
    let g1Color = -1;

    guest1Net.onConnected = (_isHost, pId, color, code, snap) => {
      g1PlayerId = pId;
      g1Color = color;
      g1Snapshot = snap;
    };

    guest1Net.onSnapshot = (snap) => {
      g1Snapshot = snap;
    };

    await guest1Net.joinWorld(roomId, roomSecret, 'Guest One');

    // Wait for microtask network dispatch
    await new Promise(r => setTimeout(r, 60));

    expect(g1Snapshot).not.toBeNull();
    expect(g1Color).toBe(1); // Host is 0 (Teal), Guest 1 is 1 (Rust)
    expect(g1PlayerId).toContain('guest_peer_guest1');

    // 3. Guest 2 joins using combined code format (ROOMID.ROOMSECRET)
    const g2Transport = new MockTransport('peer_guest2');
    guest2Net = new NetworkManager(g2Transport);

    let g2Snapshot: WorldSnapshot | null = null;
    let g2Color = -1;

    guest2Net.onConnected = (_isHost, _pId, color, _code, snap) => {
      g2Color = color;
      g2Snapshot = snap;
    };

    guest2Net.onSnapshot = (snap) => {
      g2Snapshot = snap;
    };

    await guest2Net.joinWorld(`${roomId}.${roomSecret}`, 'Guest Two');
    await new Promise(r => setTimeout(r, 60));

    expect(g2Color).toBe(2); // Guest 2 gets color 2 (Olive)

    // Verify all peers see all 3 players in snapshot
    expect(Object.keys(g2Snapshot!.players)).toHaveLength(3);

    // 4. Guest 1 sends movement input
    guest1Net.sendInput(1, 0, 0.1, 'right');
    await new Promise(r => setTimeout(r, 150));

    const updatedSnap = g2Snapshot!;
    const g1State = updatedSnap.players[g1PlayerId];
    expect(g1State).toBeDefined();
    expect(g1State.direction).toBe('right');

    // 5. Guest 1 operates Upper Sluice Gate
    // Place guest 1 near gate_upper
    sim.players.get(g1PlayerId)!.x = 7 * 16 + 8;
    sim.players.get(g1PlayerId)!.y = 8 * 16 + 8;

    guest1Net.sendInput(0, 0, 0.05, 'down', { targetType: 'gate', targetId: 'gate_upper' });
    await new Promise(r => setTimeout(r, 120));

    // Both guests see gate open and water flowing to junction
    const gateNode = g2Snapshot!.waterNetwork.nodes['gate_upper'] as GateNode;
    expect(gateNode.isOpen).toBe(true);
    expect(g2Snapshot!.waterNetwork.nodes['junction_central'].inflow).toBe(100);

    // 6. Guest 2 clears debris
    sim.players.get(guest2Net.getPlayerId())!.x = 10 * 16 + 8;
    sim.players.get(guest2Net.getPlayerId())!.y = 14 * 16 + 8;

    guest2Net.sendInput(0, 0, 0.05, 'down', { targetType: 'debris', targetId: 'debris_pool_canal' });
    await new Promise(r => setTimeout(r, 120));

    const debrisNode = g1Snapshot!.waterNetwork.nodes['debris_pool_canal'] as DebrisNode;
    expect(debrisNode.isCleared).toBe(true);
    expect(g1Snapshot!.waterNetwork.nodes['pool_basin'].inflow).toBeGreaterThan(0);

    // 7. Host operates Mill Sluice Gate -> Water reaches waterwheel
    sim.players.get(hostNet.getPlayerId())!.x = 24 * 16 + 8;
    sim.players.get(hostNet.getPlayerId())!.y = 11 * 16 + 8;
    const gateOperated = sim.interact(hostNet.getPlayerId(), 'gate', 'gate_mill');
    expect(gateOperated).toBe(true);
    await new Promise(r => setTimeout(r, 150));

    const wheelNode = g2Snapshot!.waterNetwork.nodes['waterwheel_mill'] as WaterWheelNode;
    expect(wheelNode.isSpinning).toBe(true);
    expect(g2Snapshot!.objective.waterwheelRestored).toBe(true);
  });

  it('rejects guest joining without secret key', async () => {
    const roomId = 'SECUREVALLEY1';
    const roomSecret = 'SECRETKEY123456';

    const hostTransport = new MockTransport('host_sec');
    hostNet = new NetworkManager(hostTransport);
    await hostNet.createWorld(sim, roomId, roomSecret);

    const guestTransport = new MockTransport('guest_nosecret');
    const guestNet = new NetworkManager(guestTransport);

    // Calling joinWorld with only roomId must throw an error
    await expect(guestNet.joinWorld(roomId)).rejects.toThrow(/Room secret.*required/i);
    await guestNet.disconnect();
  });

  it('rejects guest joining with WRONG secret key', async () => {
    const roomId = 'SECRETVALLEY2';
    const correctSecret = 'CORRECTSECRET123';
    const wrongSecret = 'WRONGSECRET99999';

    const hostTransport = new MockTransport('host_sec2');
    hostNet = new NetworkManager(hostTransport);
    await hostNet.createWorld(sim, roomId, correctSecret);

    const guestTransport = new MockTransport('guest_wrongsecret');
    const guestNet = new NetworkManager(guestTransport);

    let rejectedNotice = '';
    guestNet.onError = (msg) => {
      rejectedNotice = msg;
    };

    await guestNet.joinWorld(roomId, wrongSecret, 'Impostor');
    await new Promise(r => setTimeout(r, 100));

    expect(rejectedNotice).toMatch(/signaling.*mismatch|could not join/i);
    expect(guestTransport.getConnectedPeers()).toHaveLength(0);
    await guestNet.disconnect();
  });

  it('allows joining via complete invitation URL with fragment key', async () => {
    const roomId = 'URLVALLEY42';
    const roomSecret = 'KEYFRAGMENT1234';

    const hostTransport = new MockTransport('host_url');
    hostNet = new NetworkManager(hostTransport);
    const { inviteUrl } = await hostNet.createWorld(sim, roomId, roomSecret);

    const guestTransport = new MockTransport('guest_url');
    const guestNet = new NetworkManager(guestTransport);

    let connected = false;
    guestNet.onConnected = () => {
      connected = true;
    };

    await guestNet.joinWorld(inviteUrl, 'URL Guest');
    await new Promise(r => setTimeout(r, 80));

    expect(connected).toBe(true);
    await guestNet.disconnect();
  });

  it('enforces 4-player capacity and rejects the 5th participant', async () => {
    const roomId = 'CAPACITY4ROOM';
    const roomSecret = 'SECRETCAP444444';
    const hostTransport = new MockTransport('host_p');
    hostNet = new NetworkManager(hostTransport);
    await hostNet.createWorld(sim, roomId, roomSecret, 'Host Keeper');

    // Add 3 guests (making total 4 players)
    const guests: NetworkManager[] = [];
    for (let i = 1; i <= 3; i++) {
      const gTransport = new MockTransport(`guest_${i}`);
      const gNet = new NetworkManager(gTransport);
      await gNet.joinWorld(roomId, roomSecret, `Guest ${i}`);
      guests.push(gNet);
      await new Promise(r => setTimeout(r, 60));
    }
    expect(hostNet.getTransport().getConnectedPeers()).toHaveLength(3);

    // 5th participant attempts to join
    const g5Transport = new MockTransport('guest_5');
    const g5Net = new NetworkManager(g5Transport);
    let rejectedError = '';
    g5Net.onError = (msg) => {
      rejectedError = msg;
    };

    await g5Net.joinWorld(roomId, roomSecret, 'Guest Five');
    await new Promise(r => setTimeout(r, 100));

    expect(rejectedError).toMatch(/capacity|full/i);

    for (const g of guests) {
      await g.disconnect();
    }
    await g5Net.disconnect();
  });

  it('preserves player slot and world state when a guest reconnects', async () => {
    const roomId = 'RECONNECTVALLEY';
    const roomSecret = 'SECRETRECONN999';
    const hostTransport = new MockTransport('host_peer');
    hostNet = new NetworkManager(hostTransport);
    await hostNet.createWorld(sim, roomId, roomSecret, 'Host Keeper');

    // Guest joins
    const g1Transport = new MockTransport('guest_peer');
    guest1Net = new NetworkManager(g1Transport);
    let assignedColor = -1;
    guest1Net.onConnected = (_isHost, _pId, color) => {
      assignedColor = color;
    };

    // Guest joins with persistent reconnect token
    const token = 'persistent_token_123';
    await guest1Net.joinWorld(roomId, roomSecret, 'Keeper Rowan', token);
    await new Promise(r => setTimeout(r, 60));
    expect(assignedColor).toBe(1);

    // Change world state
    sim.waterNetwork.setGateState('gate_upper', true);

    // Guest disconnects
    await guest1Net.disconnect();
    await new Promise(r => setTimeout(r, 60));

    // Guest reconnects with fresh transport but same token
    const g1ReconnectedTransport = new MockTransport('guest_peer_new');
    const g1Reconnected = new NetworkManager(g1ReconnectedTransport);

    let reconnectedColor = -1;
    let reconnectedSnapshot: WorldSnapshot | null = null;

    g1Reconnected.onConnected = (_isHost, _pId, color, _code, snap) => {
      reconnectedColor = color;
      reconnectedSnapshot = snap;
    };

    await g1Reconnected.joinWorld(roomId, roomSecret, 'Keeper Rowan', token);
    await new Promise(r => setTimeout(r, 80));

    expect(reconnectedColor).toBe(1); // Same color/slot reclaimed!
    expect((reconnectedSnapshot!.waterNetwork.nodes['gate_upper'] as GateNode).isOpen).toBe(true);

    await g1Reconnected.disconnect();
  });

  it('notifies guests cleanly when the host departs (no fake authority migration)', async () => {
    const roomId = 'HOSTDEPARTROOM';
    const roomSecret = 'SECRETDEPART888';
    const hostTransport = new MockTransport('host_p');
    hostNet = new NetworkManager(hostTransport);
    await hostNet.createWorld(sim, roomId, roomSecret, 'Host Keeper');

    const gTransport = new MockTransport('guest_p');
    guest1Net = new NetworkManager(gTransport);

    let hostLostNoticeFired = false;
    guest1Net.onHostDisconnected = () => {
      hostLostNoticeFired = true;
    };

    await guest1Net.joinWorld(roomId, roomSecret, 'Guest');
    await new Promise(r => setTimeout(r, 60));

    // Host departs
    await hostNet.disconnect();
    await new Promise(r => setTimeout(r, 100));

    expect(hostLostNoticeFired).toBe(true);
  });

  it('never logs the room secret to console during room creation or join', async () => {
    const logSpy = vi.spyOn(console, 'log');
    const warnSpy = vi.spyOn(console, 'warn');
    const errorSpy = vi.spyOn(console, 'error');

    const roomId = 'SILENTVALLEY1';
    const roomSecret = 'CLASSIFIEDSECRET9';

    const hostTransport = new MockTransport('host_silent');
    hostNet = new NetworkManager(hostTransport);
    await hostNet.createWorld(sim, roomId, roomSecret, 'Silent Host');

    const gTransport = new MockTransport('guest_silent');
    guest1Net = new NetworkManager(gTransport);
    await guest1Net.joinWorld(roomId, roomSecret, 'Silent Guest');
    await new Promise(r => setTimeout(r, 60));

    const checkCalls = (calls: any[][]) => {
      for (const call of calls) {
        for (const arg of call) {
          const str = String(arg);
          expect(str).not.toContain(roomSecret);
        }
      }
    };

    checkCalls(logSpy.mock.calls);
    checkCalls(warnSpy.mock.calls);
    checkCalls(errorSpy.mock.calls);

    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
