import Phaser from 'phaser';
import { CONFIG } from '../../config';
import { ValleySimulation, MAP_CONFIG } from '../../shared/Simulation';
import { SoundEffects } from '../../audio/SoundEffects';
import { Network } from '../../networking/NetworkManager';
import { ClientPredictor } from '../../networking/Prediction';
import { RemoteInterpolator } from '../../networking/Interpolation';
import { GateNode, DebrisNode, WaterWheelNode, PoolNode } from '../../shared/WaterGraph';
import { WorldSnapshot } from '../../shared/GameState';
import { WorldEventPayload } from '../../networking/Protocol';

export class ValleyScene extends Phaser.Scene {
  // Authoritative simulation (used directly in single-player/local 2P and by Host, mirrored on Guests)
  public simulation!: ValleySimulation;
  public isOnlineMode: boolean = false;
  public localPlayerId: string = 'local_p1';
  public localPlayerColor: number = 0; // 0: Teal
  public isLocal2PMode: boolean = false;

  // Predictor & Interpolator
  public predictor: ClientPredictor = new ClientPredictor();
  public interpolator: RemoteInterpolator = new RemoteInterpolator();

  // Sprites & Visuals
  private playerSprites: Map<string, Phaser.GameObjects.Sprite> = new Map();
  private playerLabels: Map<string, Phaser.GameObjects.Text> = new Map();
  private gateSprites: Map<string, Phaser.GameObjects.Sprite> = new Map();
  private debrisSprite!: Phaser.GameObjects.Sprite;
  private raftSprite!: Phaser.GameObjects.Sprite;
  private waterwheelSprite!: Phaser.GameObjects.Sprite;
  private crateSprite!: Phaser.GameObjects.Sprite;
  private waterFlowTiles: Phaser.GameObjects.Sprite[] = [];
  private poolWaterSprites: Phaser.GameObjects.Sprite[] = [];

  // Controls
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keyW!: Phaser.Input.Keyboard.Key;
  private keyA!: Phaser.Input.Keyboard.Key;
  private keyS!: Phaser.Input.Keyboard.Key;
  private keyD!: Phaser.Input.Keyboard.Key;
  private keyE!: Phaser.Input.Keyboard.Key;
  private keySpace!: Phaser.Input.Keyboard.Key;
  private keyEsc!: Phaser.Input.Keyboard.Key;

  // Player 2 local keys
  private keyP2Interact!: Phaser.Input.Keyboard.Key;
  private keyP2Carry!: Phaser.Input.Keyboard.Key;

  // Virtual touch input state
  public touchInput = { dx: 0, dy: 0, interact: false, carry: false };

  // UI callbacks
  public onContextPrompt?: (text: string | null, key?: string) => void;
  public onVictory?: () => void;
  public onHUDUpdate?: (players: number, objectiveText: string) => void;
  public onHostDisconnected?: () => void;

  private footstepTimer: number = 0;
  private waterSoundTimer: number = 0;

  constructor() {
    super({ key: 'ValleyScene' });
  }

  create(): void {
    this.simulation = new ValleySimulation();

    // Setup input keys
    if (this.input.keyboard) {
      this.cursors = this.input.keyboard.createCursorKeys();
      this.keyW = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W);
      this.keyA = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
      this.keyS = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S);
      this.keyD = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);
      this.keyE = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);
      this.keySpace = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
      this.keyEsc = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);

      // P2 keys
      this.keyP2Interact = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
      this.keyP2Carry = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.M);
    }

    this.buildValleyTerrain();
    this.createWorldEntities();
    this.initDefaultLocalPlayer();
    this.setupNetworkHooks();
  }

  public setMode(online: boolean, local2P: boolean): void {
    this.isOnlineMode = online;
    this.isLocal2PMode = local2P;

    // Reset entities and simulation
    this.simulation = new ValleySimulation();
    this.playerSprites.forEach(s => s.destroy());
    this.playerSprites.clear();
    this.playerLabels.forEach(l => l.destroy());
    this.playerLabels.clear();

    if (local2P) {
      this.localPlayerId = 'p1_teal';
      this.localPlayerColor = 0;
      this.simulation.players.set(this.localPlayerId, {
        id: this.localPlayerId,
        name: 'Keeper 1 (WASD)',
        x: 5 * 16,
        y: 24 * 16,
        vx: 0,
        vy: 0,
        direction: 'down',
        isMoving: false,
        colorIndex: 0,
        carryingObjectId: null,
        lastInputSeq: 0,
        lastActiveTime: Date.now()
      });

      this.simulation.players.set('p2_rust', {
        id: 'p2_rust',
        name: 'Keeper 2 (Arrows)',
        x: 7 * 16,
        y: 24 * 16,
        vx: 0,
        vy: 0,
        direction: 'down',
        isMoving: false,
        colorIndex: 1, // Rust
        carryingObjectId: null,
        lastInputSeq: 0,
        lastActiveTime: Date.now()
      });
    } else if (!online) {
      this.initDefaultLocalPlayer();
    }
  }

  private initDefaultLocalPlayer(): void {
    this.localPlayerId = 'local_p1';
    this.localPlayerColor = 0;
    this.simulation.players.set(this.localPlayerId, {
      id: this.localPlayerId,
      name: 'Keeper Rowan',
      x: 5 * 16,
      y: 24 * 16,
      vx: 0,
      vy: 0,
      direction: 'down',
      isMoving: false,
      colorIndex: 0,
      carryingObjectId: null,
      lastInputSeq: 0,
      lastActiveTime: Date.now()
    });
  }

  private setupNetworkHooks(): void {
    Network.onConnected = (isHost, playerId, colorIndex, roomCode, snapshot) => {
      this.isOnlineMode = true;
      this.localPlayerId = playerId;
      this.localPlayerColor = colorIndex;
      this.applySnapshot(snapshot);
    };

    Network.onSnapshot = (snapshot) => {
      if (!this.isOnlineMode) return;
      this.applySnapshot(snapshot);
    };

    Network.onWorldEvent = (event) => {
      if (event.type === 'gate_toggled') {
        SoundEffects.playGateCrank();
      } else if (event.type === 'debris_cleared') {
        SoundEffects.playDebrisClear();
      } else if (event.type === 'waterwheel_activated' || event.type === 'victory') {
        SoundEffects.playSplash();
        SoundEffects.playVictoryFanfare();
        this.onVictory?.();
      }
    };

    Network.onHostDisconnected = () => {
      this.onHostDisconnected?.();
    };
  }

  private applySnapshot(snapshot: WorldSnapshot): void {
    // Sync water network
    this.simulation.waterNetwork.deserialize(snapshot.waterNetwork);
    this.simulation.objective = { ...snapshot.objective };

    // Update platforms & movables
    for (const [id, pl] of Object.entries(snapshot.platforms)) {
      this.simulation.platforms.set(id, { ...pl });
    }
    for (const [id, m] of Object.entries(snapshot.movables)) {
      this.simulation.movables.set(id, { ...m });
    }

    // Reconcile local player
    const authLocal = snapshot.players[this.localPlayerId];
    if (authLocal) {
      const sprite = this.playerSprites.get(this.localPlayerId);
      if (sprite) {
        this.predictor.reconcile(authLocal, sprite);
      }
    }

    // Record remote player positions for interpolation
    for (const [id, p] of Object.entries(snapshot.players)) {
      if (id !== this.localPlayerId) {
        this.interpolator.pushSample(id, p.x, p.y, p.direction, p.isMoving);
        this.simulation.players.set(id, { ...p });
      }
    }

    // Remove disconnected remote players
    for (const id of this.playerSprites.keys()) {
      if (id !== this.localPlayerId && !snapshot.players[id]) {
        this.playerSprites.get(id)?.destroy();
        this.playerSprites.delete(id);
        this.playerLabels.get(id)?.destroy();
        this.playerLabels.delete(id);
        this.interpolator.removePlayer(id);
      }
    }
  }

  private buildValleyTerrain(): void {
    // Handcrafted tile map layer: 40 columns x 30 rows
    const cols = MAP_CONFIG.mapCols;
    const rows = MAP_CONFIG.mapRows;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = c * 16 + 8;
        const y = r * 16 + 8;

        // Default: Lush grass with occasional flower variation
        let frame = (c * 7 + r * 13) % 11 === 0 ? 1 : 0;

        // Mountain ridge on North & North-West
        if (r <= 2 || (c <= 3 && r <= 15) || (c >= 35 && r <= 10)) {
          frame = 4; // Stone wall / cliff
        }

        // Dirt path from meadow to canal & watermill
        if ((r === 24 && c >= 4 && c <= 25) || (c === 20 && r >= 16 && r <= 24) || (r === 12 && c >= 18 && c <= 30)) {
          frame = 2; // Dirt path
        }

        // Water canals
        // Upper canal: c=7, r=3..11
        // South canal: c=7..13, r=11..18
        // Basin pool: c=11..17, r=18..21
        // Mill race: c=24..28, r=11..15
        const isCanal =
          (c === 7 && r >= 3 && r <= 11) ||
          (r === 11 && c >= 7 && c <= 25) ||
          (c >= 7 && c <= 13 && r === 15) ||
          (c >= 11 && c <= 17 && r >= 18 && r <= 21) ||
          (c >= 24 && c <= 28 && r >= 11 && r <= 15);

        if (isCanal) {
          frame = 3; // Canal stone bed
        }

        // Cobblestones around the watermill
        if (c >= 27 && c <= 33 && r >= 15 && r <= 19) {
          frame = 11; // Cobblestone
        }

        // Cottage wall & roof
        if (c >= 29 && c <= 34 && r >= 12 && r <= 14) {
          frame = r === 12 ? 14 : 13; // Roof / timber plaster
        }

        // Wooden bridge across lower stream at c=7, r=22
        if (c === 7 && (r === 22 || r === 23)) {
          frame = 8; // Bridge horizontal
        }

        const tile = this.add.image(x, y, 'valley_tiles', frame);
        tile.setDepth(1);
      }
    }
  }

  private createWorldEntities(): void {
    // 1. Sluice Gate 1 (Upper Sluice) at (7*16, 8*16)
    const gate1 = this.add.sprite(7 * 16 + 8, 8 * 16 + 16, 'mechanics', 0);
    gate1.setDepth(15);
    this.gateSprites.set('gate_upper', gate1);

    // 2. Sluice Gate 2 (Mill Race Sluice) at (24*16, 11*16)
    const gate2 = this.add.sprite(24 * 16 + 8, 11 * 16 + 16, 'mechanics', 0);
    gate2.setDepth(15);
    this.gateSprites.set('gate_mill', gate2);

    // 3. Debris clump at (10*16, 14*16)
    // Frame for debris clump in mechanics is at frame 13
    this.debrisSprite = this.add.sprite(10 * 16 + 8, 15 * 16 + 8, 'mechanics', 13);
    this.debrisSprite.setDepth(12);

    // 4. Floating Raft at (11*16, 19*16)
    // Frame for raft in mechanics is at frame 12
    this.raftSprite = this.add.sprite(11 * 16 + 16, 19 * 16 + 8, 'mechanics', 12);
    this.raftSprite.setDepth(13);

    // 5. Waterwheel at (28*16, 15*16)
    this.waterwheelSprite = this.add.sprite(28 * 16 + 16, 15 * 16 + 16, 'mechanics', 4);
    this.waterwheelSprite.setDepth(16);

    // 6. Movable Crate at (6*16, 20*16)
    this.crateSprite = this.add.sprite(6 * 16 + 8, 20 * 16 + 8, 'mechanics', 14);
    this.crateSprite.setDepth(14);
  }

  update(time: number, delta: number): void {
    const dt = delta / 1000;

    // Handle local player 1 input
    this.handleLocalInput(dt);

    // If local 2-player mode, handle player 2 input
    if (this.isLocal2PMode) {
      this.handleLocalP2Input(dt);
    }

    // Step local simulation if not online mode
    if (!this.isOnlineMode) {
      this.simulation.step(dt);
    }

    // Update entity visuals
    this.updateWaterVisuals();
    this.updateMachineryVisuals();
    this.updateEntityVisuals(dt);
    this.checkProximityPrompts();
    this.checkVictoryCondition();
  }

  private handleLocalInput(dt: number): void {
    const player = this.simulation.players.get(this.localPlayerId);
    if (!player) return;

    let dx = 0;
    let dy = 0;

    if (this.keyA?.isDown || this.cursors?.left?.isDown || this.touchInput.dx < -0.3) dx -= 1;
    if (this.keyD?.isDown || this.cursors?.right?.isDown || this.touchInput.dx > 0.3) dx += 1;
    if (this.keyW?.isDown || this.cursors?.up?.isDown || this.touchInput.dy < -0.3) dy -= 1;
    if (this.keyS?.isDown || this.cursors?.down?.isDown || this.touchInput.dy > 0.3) dy += 1;

    let dir = player.direction;
    if (Math.abs(dx) > Math.abs(dy)) {
      dir = dx > 0 ? 'right' : 'left';
    } else if (Math.abs(dy) > 0) {
      dir = dy > 0 ? 'down' : 'up';
    }

    const isMoving = Math.hypot(dx, dy) > 0.01;

    // Play footstep audio
    if (isMoving) {
      this.footstepTimer += dt;
      if (this.footstepTimer > 0.32) {
        SoundEffects.playFootstep();
        this.footstepTimer = 0;
      }
    }

    if (this.isOnlineMode && !Network.isHost()) {
      // Guest: Record predicted input locally and forward to Host
      const inputPayload = this.predictor.recordInput(dx, dy, dt, dir);
      this.simulation.applyPlayerInput(this.localPlayerId, dx, dy, dt, inputPayload.seq, dir);
      Network.sendInput(dx, dy, dt, dir);
    } else {
      // Host or Singleplayer: Authoritative local step
      this.simulation.applyPlayerInput(this.localPlayerId, dx, dy, dt, 1, dir);
    }

    // Interaction triggers (E key or touch action)
    if (Phaser.Input.Keyboard.JustDown(this.keyE) || this.touchInput.interact) {
      this.touchInput.interact = false;
      this.triggerPlayerInteract(this.localPlayerId);
    }

    // Carry / Drop triggers (Space key or touch carry)
    if (Phaser.Input.Keyboard.JustDown(this.keySpace) || this.touchInput.carry) {
      this.touchInput.carry = false;
      this.triggerPickDrop(this.localPlayerId);
    }
  }

  private handleLocalP2Input(dt: number): void {
    const p2Id = 'p2_rust';
    const player = this.simulation.players.get(p2Id);
    if (!player) return;

    let dx = 0;
    let dy = 0;

    if (this.cursors?.left?.isDown) dx -= 1;
    if (this.cursors?.right?.isDown) dx += 1;
    if (this.cursors?.up?.isDown) dy -= 1;
    if (this.cursors?.down?.isDown) dy += 1;

    let dir = player.direction;
    if (Math.abs(dx) > Math.abs(dy)) {
      dir = dx > 0 ? 'right' : 'left';
    } else if (Math.abs(dy) > 0) {
      dir = dy > 0 ? 'down' : 'up';
    }

    this.simulation.applyPlayerInput(p2Id, dx, dy, dt, 1, dir);

    if (this.keyP2Interact && Phaser.Input.Keyboard.JustDown(this.keyP2Interact)) {
      this.triggerPlayerInteract(p2Id);
    }
    if (this.keyP2Carry && Phaser.Input.Keyboard.JustDown(this.keyP2Carry)) {
      this.triggerPickDrop(p2Id);
    }
  }

  private triggerPlayerInteract(playerId: string): void {
    const player = this.simulation.players.get(playerId);
    if (!player) return;

    // Check Upper Gate
    const gate1 = this.simulation.waterNetwork.getNode<GateNode>('gate_upper');
    if (gate1 && Math.hypot(player.x - gate1.x * 16, player.y - gate1.y * 16) < CONFIG.INTERACTION_RANGE) {
      SoundEffects.playGateCrank();
      if (this.isOnlineMode && !Network.isHost()) {
        Network.sendInput(0, 0, 0.05, player.direction, { targetType: 'gate', targetId: 'gate_upper' });
      } else {
        this.simulation.interact(playerId, 'gate', 'gate_upper');
      }
      return;
    }

    // Check Mill Gate
    const gate2 = this.simulation.waterNetwork.getNode<GateNode>('gate_mill');
    if (gate2 && Math.hypot(player.x - gate2.x * 16, player.y - gate2.y * 16) < CONFIG.INTERACTION_RANGE) {
      SoundEffects.playGateCrank();
      if (this.isOnlineMode && !Network.isHost()) {
        Network.sendInput(0, 0, 0.05, player.direction, { targetType: 'gate', targetId: 'gate_mill' });
      } else {
        this.simulation.interact(playerId, 'gate', 'gate_mill');
      }
      return;
    }

    // Check Debris
    const debris = this.simulation.waterNetwork.getNode<DebrisNode>('debris_pool_canal');
    if (debris && !debris.isCleared && Math.hypot(player.x - debris.x * 16, player.y - debris.y * 16) < CONFIG.INTERACTION_RANGE) {
      SoundEffects.playDebrisClear();
      if (this.isOnlineMode && !Network.isHost()) {
        Network.sendInput(0, 0, 0.05, player.direction, { targetType: 'debris', targetId: 'debris_pool_canal' });
      } else {
        this.simulation.interact(playerId, 'debris', 'debris_pool_canal');
      }
      return;
    }
  }

  private triggerPickDrop(playerId: string): void {
    const player = this.simulation.players.get(playerId);
    if (this.isOnlineMode && !Network.isHost()) {
      Network.sendInput(0, 0, 0.05, player?.direction || 'down', null, true);
    } else {
      this.simulation.pickOrDropObject(playerId);
    }
  }

  private updateWaterVisuals(): void {
    // Sluice Gate Sprites
    const gate1 = this.simulation.waterNetwork.getNode<GateNode>('gate_upper');
    const s1 = this.gateSprites.get('gate_upper');
    if (gate1 && s1) {
      s1.setFrame(gate1.isOpen ? 1 : 0);
    }

    const gate2 = this.simulation.waterNetwork.getNode<GateNode>('gate_mill');
    const s2 = this.gateSprites.get('gate_mill');
    if (gate2 && s2) {
      s2.setFrame(gate2.isOpen ? 1 : 0);
    }

    // Debris Clump
    const debris = this.simulation.waterNetwork.getNode<DebrisNode>('debris_pool_canal');
    if (debris && this.debrisSprite) {
      this.debrisSprite.setVisible(!debris.isCleared);
    }

    // Floating Raft position
    const raft = this.simulation.platforms.get('platform_raft');
    if (raft && this.raftSprite) {
      this.raftSprite.setPosition(raft.x + 16, raft.y + 8);
    }
  }

  private updateMachineryVisuals(): void {
    const wheel = this.simulation.waterNetwork.getNode<WaterWheelNode>('waterwheel_mill');
    if (wheel && this.waterwheelSprite) {
      if (wheel.isSpinning) {
        if (!this.waterwheelSprite.anims.isPlaying) {
          this.waterwheelSprite.play('waterwheel_spin');
          SoundEffects.playSplash();
        }
        this.waterSoundTimer += 0.016;
        if (this.waterSoundTimer > 0.4) {
          SoundEffects.playWheelSpin();
          this.waterSoundTimer = 0;
        }
      } else {
        if (this.waterwheelSprite.anims.isPlaying) {
          this.waterwheelSprite.stop();
          this.waterwheelSprite.setFrame(4);
        }
      }
    }
  }

  private updateEntityVisuals(dt: number): void {
    // Update movable crate position
    const crate = this.simulation.movables.get('crate_1');
    if (crate && this.crateSprite) {
      this.crateSprite.setPosition(crate.x + 8, crate.y + 8);
      this.crateSprite.setDepth(crate.carriedByPlayerId ? 25 : 14);
    }

    // Render players
    const now = Date.now();
    for (const [id, player] of this.simulation.players.entries()) {
      let sprite = this.playerSprites.get(id);
      let label = this.playerLabels.get(id);

      if (!sprite) {
        sprite = this.add.sprite(player.x, player.y, 'crew', 0);
        sprite.setDepth(20);
        this.playerSprites.set(id, sprite);

        label = this.add.text(player.x, player.y - 14, player.name, {
          fontSize: '9px',
          fontFamily: 'JetBrains Mono',
          color: CONFIG.COLOR_HEX[player.colorIndex] || '#fff',
          backgroundColor: 'rgba(0,0,0,0.6)',
          padding: { x: 3, y: 1 }
        }).setOrigin(0.5).setDepth(21);
        this.playerLabels.set(id, label);
      }

      let renderX = player.x;
      let renderY = player.y;
      let renderDir = player.direction;
      let renderMoving = player.isMoving;

      if (this.isOnlineMode && id !== this.localPlayerId) {
        const interp = this.interpolator.getInterpolatedPosition(id, now);
        if (interp) {
          renderX = interp.x;
          renderY = interp.y;
          renderDir = interp.direction;
          renderMoving = interp.isMoving;
        }
      }

      sprite.setPosition(renderX, renderY);
      label?.setPosition(renderX, renderY - 14);

      // Play walk/idle animation
      const animKey = renderMoving
        ? `player_${player.colorIndex}_walk_${renderDir}`
        : `player_${player.colorIndex}_idle_${renderDir}`;

      if (sprite.anims.currentAnim?.key !== animKey) {
        sprite.play(animKey);
      }
    }
  }

  private checkProximityPrompts(): void {
    const player = this.simulation.players.get(this.localPlayerId);
    if (!player) return;

    // Check Sluice Gate 1
    const gate1 = this.simulation.waterNetwork.getNode<GateNode>('gate_upper');
    if (gate1 && Math.hypot(player.x - gate1.x * 16, player.y - gate1.y * 16) < CONFIG.INTERACTION_RANGE) {
      const action = gate1.isOpen ? 'Close Sluice Gate' : 'Open Sluice Gate';
      this.onContextPrompt?.(action, 'E');
      return;
    }

    // Check Sluice Gate 2
    const gate2 = this.simulation.waterNetwork.getNode<GateNode>('gate_mill');
    if (gate2 && Math.hypot(player.x - gate2.x * 16, player.y - gate2.y * 16) < CONFIG.INTERACTION_RANGE) {
      const action = gate2.isOpen ? 'Close Mill Sluice' : 'Open Mill Sluice';
      this.onContextPrompt?.(action, 'E');
      return;
    }

    // Check Debris
    const debris = this.simulation.waterNetwork.getNode<DebrisNode>('debris_pool_canal');
    if (debris && !debris.isCleared && Math.hypot(player.x - debris.x * 16, player.y - debris.y * 16) < CONFIG.INTERACTION_RANGE) {
      this.onContextPrompt?.('Clear Storm Debris', 'E');
      return;
    }

    // Check Crate
    const crate = this.simulation.movables.get('crate_1');
    if (crate && !crate.carriedByPlayerId && Math.hypot(player.x - crate.x, player.y - crate.y) < CONFIG.INTERACTION_RANGE) {
      this.onContextPrompt?.('Pick up Supply Crate', 'SPACE');
      return;
    } else if (player.carryingObjectId) {
      this.onContextPrompt?.('Drop Supply Crate', 'SPACE');
      return;
    }

    this.onContextPrompt?.(null);
  }

  private checkVictoryCondition(): void {
    const wheel = this.simulation.waterNetwork.getNode<WaterWheelNode>('waterwheel_mill');
    if (wheel && wheel.isSpinning && !this.simulation.objective.waterwheelRestored) {
      this.simulation.objective.waterwheelRestored = true;
      SoundEffects.playVictoryFanfare();
      this.onVictory?.();
    }
  }

  public respawnLocalPlayer(): void {
    const player = this.simulation.players.get(this.localPlayerId);
    if (player) {
      player.x = 5 * 16 + player.colorIndex * 16;
      player.y = 24 * 16;
      player.vx = 0;
      player.vy = 0;
    }
  }
}
