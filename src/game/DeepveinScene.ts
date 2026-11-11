/**
 * DeepveinScene.ts
 * Main Phaser 3 Gameplay Scene for Deepvein: Powder & Pickaxe.
 * Ties together Destructible Seeded Caverns, Entities, Kinematics,
 * Dynamic Darkness & Lantern Stealth, Sound Ripples, WebAudio SFX, and WebRTC Sync.
 * CC0 1.0 Universal Public Domain.
 */

import Phaser from 'phaser';
import { PixelAtlasGenerator } from '../assets/PixelAtlasGenerator';
import { SoundEngine } from '../audio/SoundEngine';
import { WorldState, TileType, TILE_SIZE, MAP_WIDTH, MAP_HEIGHT } from './WorldState';
import { MinerEntity, GoldCrateEntity, PowderKegEntity, BulletEntity, PlayerInput, TeamId } from './Entities';
import { PhysicsEngine } from './Physics';
import { LightingEngine } from './Lighting';
import { AISapperController } from './AIPlayer';
import { NetworkManager, NetworkStatePayload, NetworkEventPayload } from '../net/NetworkManager';

export interface SceneConfig {
  roomCode: string;
  isHost: boolean;
  playerName: string;
  playerTeam: TeamId;
  botCount: number;
}

export class DeepveinScene extends Phaser.Scene {
  public config!: SceneConfig;
  public net!: NetworkManager;

  // World and Physics
  public world!: WorldState;
  public lighting!: LightingEngine;

  // Entities
  public players: Map<string, MinerEntity> = new Map();
  public crates: Map<string, GoldCrateEntity> = new Map();
  public kegs: Map<string, PowderKegEntity> = new Map();
  public bullets: BulletEntity[] = [];
  public aiControllers: AISapperController[] = [];

  // Local Player
  public localMiner!: MinerEntity;
  private localInputSeq: number = 0;

  // Visual Sprites / Renderers
  private terrainGraphics!: Phaser.GameObjects.Graphics;
  private waterGraphics!: Phaser.GameObjects.Graphics;
  private playerSprites: Map<string, { container: Phaser.GameObjects.Container; body: Phaser.GameObjects.Sprite; tool: Phaser.GameObjects.Sprite; nameText: Phaser.GameObjects.Text }> = new Map();
  private crateSprites: Map<string, Phaser.GameObjects.Sprite> = new Map();
  private kegSprites: Map<string, { sprite: Phaser.GameObjects.Sprite; fuseEmitter?: Phaser.GameObjects.Particles.ParticleEmitter }> = new Map();
  private bulletSprites: Map<string, Phaser.GameObjects.Sprite> = new Map();
  private redCartSprite!: Phaser.GameObjects.Sprite;
  private blueCartSprite!: Phaser.GameObjects.Sprite;

  // Particle Emitters
  private sparkEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;
  private smokeEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;
  private rubbleEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;
  private goldEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;

  // Game Match State
  public redScore: number = 0;
  public blueScore: number = 0;
  public matchTimeRemaining: number = 300; // 5 minutes countdown
  public isGameOver: boolean = false;
  private flashIntensity: number = 0;

  // Timers
  private lastSimTickTime: number = 0;
  private lastNetBroadcastTime: number = 0;
  private lastWaterTickTime: number = 0;

  // Input Keys
  private keyW!: Phaser.Input.Keyboard.Key;
  private keyA!: Phaser.Input.Keyboard.Key;
  private keyS!: Phaser.Input.Keyboard.Key;
  private keyD!: Phaser.Input.Keyboard.Key;
  private keyE!: Phaser.Input.Keyboard.Key;
  private keyQ!: Phaser.Input.Keyboard.Key;
  private keyF!: Phaser.Input.Keyboard.Key;
  private key1!: Phaser.Input.Keyboard.Key;
  private key2!: Phaser.Input.Keyboard.Key;
  private keySpace!: Phaser.Input.Keyboard.Key;

  constructor() {
    super({ key: 'DeepveinScene' });
  }

  public init(data: SceneConfig): void {
    this.config = data;
    this.net = new NetworkManager();
  }

  public preload(): void {
    PixelAtlasGenerator.generateAllTextures(this);
  }

  public create(): void {
    // 1. Initialize World State from seed
    const seed = this.config.isHost ? Math.floor(Math.random() * 9999999) : 133742;
    this.world = new WorldState(seed);

    // 2. Setup Graphics Layers
    this.terrainGraphics = this.add.graphics();
    this.terrainGraphics.setDepth(1);

    this.waterGraphics = this.add.graphics();
    this.waterGraphics.setDepth(2);

    // Extraction Carts
    this.redCartSprite = this.add.sprite(this.world.redCartPos.x, this.world.redCartPos.y, 'cart_red').setDepth(5);
    this.blueCartSprite = this.add.sprite(this.world.blueCartPos.x, this.world.blueCartPos.y, 'cart_blue').setDepth(5);

    // 3. Setup Particles
    this.rubbleEmitter = this.add.particles(0, 0, 'rubble_particle', {
      lifespan: 600,
      speed: { min: 40, max: 160 },
      scale: { start: 1, end: 0 },
      emitting: false
    }).setDepth(15);

    this.sparkEmitter = this.add.particles(0, 0, 'spark_particle', {
      lifespan: 400,
      speed: { min: 60, max: 200 },
      scale: { start: 1.2, end: 0 },
      emitting: false
    }).setDepth(16);

    this.smokeEmitter = this.add.particles(0, 0, 'smoke_particle', {
      lifespan: 800,
      speed: { min: 20, max: 80 },
      scale: { start: 0.5, end: 2 },
      alpha: { start: 0.7, end: 0 },
      emitting: false
    }).setDepth(14);

    this.goldEmitter = this.add.particles(0, 0, 'gold_particle', {
      lifespan: 700,
      speed: { min: 50, max: 140 },
      scale: { start: 1.5, end: 0.2 },
      emitting: false
    }).setDepth(16);

    // 4. Setup Lighting Engine
    this.lighting = new LightingEngine(this, this.scale.width, this.scale.height);
    this.lighting.initOverlay(this.scale.width, this.scale.height);

    // 5. Initialize Local Player
    const spawnPos = this.config.playerTeam === 'red' ? this.world.redSpawnPos : this.world.blueSpawnPos;
    this.localMiner = new MinerEntity(
      this.net.localPeerId,
      this.config.playerName,
      this.config.playerTeam,
      spawnPos.x,
      spawnPos.y,
      false
    );
    this.players.set(this.localMiner.id, this.localMiner);

    // 6. Camera Settings
    this.cameras.main.setBounds(0, 0, MAP_WIDTH * TILE_SIZE, MAP_HEIGHT * TILE_SIZE);
    this.cameras.main.setZoom(2.2); // Crisp pixel art zoom

    // 7. Setup Host-Initial Keg Caches and Bots
    if (this.config.isHost) {
      // Spawn central powder kegs
      for (let i = 0; i < 4; i++) {
        const kegId = 'keg_init_' + i;
        const keg = new PowderKegEntity(kegId, (34 + i * 2) * TILE_SIZE + 8, 36 * TILE_SIZE + 8);
        this.kegs.set(kegId, keg);
      }

      // Spawn AI Sapper Bots
      const botCount = this.config.botCount || 0;
      for (let b = 0; b < botCount; b++) {
        const botTeam: TeamId = b % 2 === 0 ? (this.config.playerTeam === 'red' ? 'blue' : 'red') : this.config.playerTeam;
        const bSpawn = botTeam === 'red' ? this.world.redSpawnPos : this.world.blueSpawnPos;
        const botId = 'bot_' + b;
        const botName = (botTeam === 'red' ? 'Red Sapper #' : 'Blue Sapper #') + (b + 1);
        const bot = new MinerEntity(botId, botName, botTeam, bSpawn.x + (b * 12), bSpawn.y, true);
        this.players.set(botId, bot);
        this.aiControllers.push(new AISapperController(bot));
      }
    }

    // 8. Keyboard Controls Setup
    const keyboard = this.input.keyboard!;
    this.keyW = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W);
    this.keyA = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.keyS = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S);
    this.keyD = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);
    this.keyE = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    this.keyQ = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Q);
    this.keyF = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F);
    this.key1 = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ONE);
    this.key2 = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.TWO);
    this.keySpace = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

    // Mouse Controls
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      SoundEngine.init();
      if (pointer.rightButtonDown()) {
        this.triggerFuseAction(this.localMiner);
      } else if (pointer.leftButtonDown()) {
        this.triggerPrimaryAction(this.localMiner);
      }
    });

    // Disable default browser context menu on right click
    this.input.mouse?.disableContextMenu();

    // Resize Handler
    this.scale.on('resize', (gameSize: Phaser.Structs.Size) => {
      this.lighting.resize(gameSize.width, gameSize.height);
    });

    // 9. Setup Network Callbacks & Join Room
    this.setupNetwork();
    this.net.joinMatch(this.config.roomCode, this.config.isHost, this.config.playerName);

    // Initial Terrain Render
    this.renderTerrain();
  }

  private setupNetwork(): void {
    // When a remote peer connects
    this.net.onPeerJoined = (peerId: string) => {
      this.displayHudAlert(`Miner connected: ${peerId.substring(0, 6)}`);
      if (this.config.isHost) {
        // Send world seed and delta
        this.net.broadcastEvent({
          type: 'WORLD_INIT',
          data: {
            seed: this.world.seed,
            delta: this.world.serializeDelta(),
            scores: { red: this.redScore, blue: this.blueScore },
            timeRemaining: this.matchTimeRemaining
          }
        }, peerId);
      }
    };

    // Client receives state updates
    this.net.onStateReceived = (state: NetworkStatePayload) => {
      if (!this.config.isHost) {
        this.reconcileState(state);
      }
    };

    // Remote client inputs received on Host
    this.net.onInputReceived = (input: PlayerInput, senderId: string) => {
      if (this.config.isHost) {
        let player = this.players.get(senderId);
        if (!player) {
          // New remote player spawn
          const team: TeamId = this.players.size % 2 === 0 ? 'red' : 'blue';
          const pos = team === 'red' ? this.world.redSpawnPos : this.world.blueSpawnPos;
          player = new MinerEntity(senderId, 'Miner ' + senderId.substring(0, 4), team, pos.x, pos.y, false);
          this.players.set(senderId, player);
        }
        this.applyInputToPlayer(player, input);
      }
    };

    // Reliable Events
    this.net.onEventReceived = (event: NetworkEventPayload, senderId: string) => {
      if (event.type === 'WORLD_INIT') {
        this.world.seed = event.data.seed;
        this.world.generate();
        this.world.applyDelta(event.data.delta);
        this.redScore = event.data.scores.red;
        this.blueScore = event.data.scores.blue;
        this.matchTimeRemaining = event.data.timeRemaining;
        this.renderTerrain();
      } else if (event.type === 'TILE_DAMAGE') {
        const { tx, ty, damage, droppedGold } = event.data;
        const res = this.world.damageTile(tx, ty, damage);
        if (res.destroyed) {
          this.renderTerrain();
          if (droppedGold) {
            this.spawnGoldCrate(tx * TILE_SIZE + 8, ty * TILE_SIZE + 8);
          }
        }
      } else if (event.type === 'EXPLOSION') {
        this.onExplosionEffect(event.data.x, event.data.y, event.data.radius);
      } else if (event.type === 'SOUND_RIPPLE') {
        this.lighting.addSoundRipple(event.data.x, event.data.y, event.data.maxRadius, event.data.color);
      } else if (event.type === 'CHAT_ALERT') {
        this.displayHudAlert(event.data.text);
      } else if (event.type === 'VICTORY') {
        this.triggerVictoryScreen(event.data.winner);
      }
    };
  }

  public update(time: number, delta: number): void {
    if (this.isGameOver) return;
    const dt = Math.min(delta / 1000, 0.1);

    // 1. Gather Local Input & Predict Locally
    const localInput = this.gatherLocalInput();
    this.applyInputToPlayer(this.localMiner, localInput);
    this.net.sendInputToHost(localInput);

    // 2. Host Authoritative 30Hz Simulation Tick
    if (this.config.isHost) {
      if (time - this.lastSimTickTime >= 33) {
        this.lastSimTickTime = time;
        this.runHostSimulationTick(0.033);
      }

      // 20Hz State Broadcast
      if (time - this.lastNetBroadcastTime >= 50) {
        this.lastNetBroadcastTime = time;
        this.broadcastCurrentState();
      }

      // Cellular Water Simulation Tick (every 150ms)
      if (time - this.lastWaterTickTime >= 150) {
        this.lastWaterTickTime = time;
        const waterResult = this.world.updateWaterSimulation();
        if (waterResult.floodedIndices.length > 0 || waterResult.driedIndices.length > 0) {
          this.renderWater();
        }
      }
    }

    // 3. Update Visual Kinematics, Particles & Animations
    this.updateVisualEntities(dt);

    // 4. Update Darkness & Lantern Lighting
    this.updateLighting(dt);

    // 5. Update DOM HUD Elements
    this.updateDomHud();

    // Flash decay
    if (this.flashIntensity > 0) {
      this.flashIntensity = Math.max(0, this.flashIntensity - dt * 2.5);
    }
  }

  private gatherLocalInput(): PlayerInput {
    // Determine active slot
    if (Phaser.Input.Keyboard.JustDown(this.key1)) {
      this.localMiner.activeSlot = 1;
    } else if (Phaser.Input.Keyboard.JustDown(this.key2)) {
      this.localMiner.activeSlot = 2;
    }

    // Shutter lantern toggle
    if (Phaser.Input.Keyboard.JustDown(this.keyF)) {
      this.localMiner.isLanternShuttered = !this.localMiner.isLanternShuttered;
      SoundEngine.playLanternClick();
      this.displayHudAlert(this.localMiner.isLanternShuttered ? 'Lantern Shuttered (Stealth Active)' : 'Lantern Lit');
    }

    // Hoist / Throw
    const interactPressed = Phaser.Input.Keyboard.JustDown(this.keyE) || Phaser.Input.Keyboard.JustDown(this.keySpace);

    // Fuse Light
    const fusePressed = Phaser.Input.Keyboard.JustDown(this.keyQ);

    // Aim angle
    const pointer = this.input.activePointer;
    const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const aimAngle = Math.atan2(worldPoint.y - this.localMiner.y, worldPoint.x - this.localMiner.x);

    return {
      seq: ++this.localInputSeq,
      up: this.keyW.isDown,
      down: this.keyS.isDown,
      left: this.keyA.isDown,
      right: this.keyD.isDown,
      aimAngle,
      actionPrimary: false, // Handled on pointerdown
      actionInteract: interactPressed,
      actionFuse: fusePressed,
      actionLantern: this.localMiner.isLanternShuttered,
      slot: this.localMiner.activeSlot
    };
  }

  private applyInputToPlayer(player: MinerEntity, input: PlayerInput): void {
    if (player.isDead) return;

    player.vx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    player.vy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    player.aimAngle = input.aimAngle;
    player.activeSlot = input.slot;
    player.isLanternShuttered = input.actionLantern;
    player.isMoving = player.vx !== 0 || player.vy !== 0;

    // Kinematic move against world
    PhysicsEngine.updatePlayerMovement(player, this.world, 0.033);

    // Footstep acoustic sound ripples in dark if sprinting or in water
    if (player.isMoving && Math.random() < 0.08) {
      if (player.inWater) {
        SoundEngine.playWaterSplash();
        this.lighting.addSoundRipple(player.x, player.y, 45, 0x4a8299);
      } else if (!player.isLanternShuttered) {
        this.lighting.addSoundRipple(player.x, player.y, 30, 0x52505c);
      }
    }

    // Handle Interacting (Pick up or Throw Crate / Keg)
    if (input.actionInteract) {
      if (player.heldType !== 'none') {
        // Throw!
        const crate = player.heldType === 'crate' ? this.crates.get(player.heldEntityId!) || null : null;
        const keg = player.heldType === 'keg' ? this.kegs.get(player.heldEntityId!) || null : null;
        PhysicsEngine.throwObject(player, crate, keg);
        SoundEngine.playGoldCrateDrop();
      } else {
        // Find nearest crate or keg within pickup range (24px)
        let found = false;
        // Priority 1: Powder Kegs (especially lit ones!)
        for (const [id, keg] of this.kegs) {
          if (!keg.isHeld && Math.hypot(keg.x - player.x, keg.y - player.y) <= 24) {
            player.heldType = 'keg';
            player.heldEntityId = id;
            keg.isHeld = true;
            keg.holderId = player.id;
            found = true;
            break;
          }
        }
        // Priority 2: Gold Crates
        if (!found) {
          for (const [id, crate] of this.crates) {
            if (!crate.isHeld && Math.hypot(crate.x - player.x, crate.y - player.y) <= 24) {
              player.heldType = 'crate';
              player.heldEntityId = id;
              crate.isHeld = true;
              crate.holderId = player.id;
              break;
            }
          }
        }
      }
    }

    // Handle Fuse Lighting
    if (input.actionFuse) {
      this.triggerFuseAction(player);
    }
  }

  private triggerPrimaryAction(player: MinerEntity): void {
    if (player.isDead) return;

    // If holding crate or keg, Left Click throws it!
    if (player.heldType !== 'none') {
      const crate = player.heldType === 'crate' ? this.crates.get(player.heldEntityId!) || null : null;
      const keg = player.heldType === 'keg' ? this.kegs.get(player.heldEntityId!) || null : null;
      PhysicsEngine.throwObject(player, crate, keg);
      SoundEngine.playGoldCrateDrop();
      return;
    }

    if (player.activeSlot === 1) {
      // Pickaxe Swing
      this.performPickaxeSwing(player);
    } else if (player.activeSlot === 2) {
      // Flintlock Fire
      this.performFlintlockShot(player);
    }
  }

  private performPickaxeSwing(player: MinerEntity): void {
    if (player.swingCooldown > 0) return;
    player.swingCooldown = 18; // ~0.3s swing rate
    player.isSwinging = true;

    const reach = 26;
    const hitX = player.x + Math.cos(player.aimAngle) * reach;
    const hitY = player.y + Math.sin(player.aimAngle) * reach;
    const tileX = Math.floor(hitX / TILE_SIZE);
    const tileY = Math.floor(hitY / TILE_SIZE);

    // Emit Acoustic Sound Ripple for mining clink!
    this.lighting.addSoundRipple(hitX, hitY, 65, 0xdf9e28);
    this.net.broadcastEvent({ type: 'SOUND_RIPPLE', data: { x: hitX, y: hitY, maxRadius: 65, color: 0xdf9e28 } });

    // 1. Check tile hit
    const currentTile = this.world.getTile(tileX, tileY);
    if (currentTile !== TileType.EMPTY && currentTile !== TileType.BEDROCK) {
      if (currentTile === TileType.GRANITE) {
        SoundEngine.playPickaxeGranite();
      } else if (currentTile === TileType.DIRT) {
        SoundEngine.playDigDirt();
      } else if (currentTile === TileType.TIMBER_WALL) {
        SoundEngine.playWoodBreak();
      } else if (currentTile === TileType.GOLD_SEAM) {
        SoundEngine.playPickaxeGranite(2);
      }

      this.rubbleEmitter.emitParticleAt(hitX, hitY, 8);

      if (this.config.isHost) {
        const res = this.world.damageTile(tileX, tileY, 1);
        if (res.destroyed) {
          this.renderTerrain();
          if (res.droppedGold) {
            this.spawnGoldCrate(tileX * TILE_SIZE + 8, tileY * TILE_SIZE + 8);
          }
          this.net.broadcastEvent({
            type: 'TILE_DAMAGE',
            data: { tx: tileX, ty: tileY, damage: 1, droppedGold: res.droppedGold }
          });
        }
      }
    }

    // 2. Melee hit against enemy miners (deals 25 damage, knocks crates out of hand!)
    for (const [id, enemy] of this.players) {
      if (enemy.id !== player.id && enemy.team !== player.team && !enemy.isDead) {
        const dist = Math.hypot(enemy.x - hitX, enemy.y - hitY);
        if (dist <= 18) {
          enemy.health -= 25;
          SoundEngine.playHurt();
          this.displayHudAlert(`${player.name} whacked ${enemy.name}!`);

          // Knock held item out of hands
          if (enemy.heldType !== 'none') {
            const heldCrate = enemy.heldType === 'crate' ? this.crates.get(enemy.heldEntityId!) || null : null;
            const heldKeg = enemy.heldType === 'keg' ? this.kegs.get(enemy.heldEntityId!) || null : null;
            PhysicsEngine.throwObject(enemy, heldCrate, heldKeg);
          }

          if (enemy.health <= 0) {
            enemy.isDead = true;
            enemy.respawnTimer = 4.0;
            this.displayHudAlert(`☠ ${enemy.name} was dispatched!`);
          }
        }
      }
    }
  }

  private performFlintlockShot(player: MinerEntity): void {
    if (player.flintlockCooldown > 0) return;
    player.flintlockCooldown = 150; // 2.5 seconds reload

    SoundEngine.playFlintlockShot();
    this.cameras.main.shake(120, 0.008);

    // Acoustic Gunshot Ripple
    this.lighting.addSoundRipple(player.x, player.y, 140, 0xffaa44);
    this.net.broadcastEvent({ type: 'SOUND_RIPPLE', data: { x: player.x, y: player.y, maxRadius: 140, color: 0xffaa44 } });

    // Smoky muzzle flash
    const muzzleX = player.x + Math.cos(player.aimAngle) * 16;
    const muzzleY = player.y + Math.sin(player.aimAngle) * 16;
    this.smokeEmitter.emitParticleAt(muzzleX, muzzleY, 12);
    this.sparkEmitter.emitParticleAt(muzzleX, muzzleY, 6);

    // Bullet Entity
    const bulletId = 'b_' + Math.random().toString(36).substring(2, 7);
    const vx = Math.cos(player.aimAngle) * PhysicsEngine.BULLET_SPEED;
    const vy = Math.sin(player.aimAngle) * PhysicsEngine.BULLET_SPEED;
    const bullet = new BulletEntity(bulletId, player.id, player.team, muzzleX, muzzleY, vx, vy);
    this.bullets.push(bullet);
  }

  private triggerFuseAction(player: MinerEntity): void {
    if (player.isDead) return;

    // Priority 1: Held Powder Keg
    if (player.heldType === 'keg' && player.heldEntityId) {
      const keg = this.kegs.get(player.heldEntityId);
      if (keg && !keg.isLit) {
        keg.isLit = true;
        keg.fuseRemaining = 4.0;
        SoundEngine.startFuseHiss(keg.id);
        this.displayHudAlert('🔥 Powder Keg fuse ignited! (4.0s)');
        return;
      }
    }

    // Priority 2: Nearby Powder Keg within reach (24px)
    for (const [id, keg] of this.kegs) {
      if (!keg.isLit && Math.hypot(keg.x - player.x, keg.y - player.y) <= 24) {
        keg.isLit = true;
        keg.fuseRemaining = 4.0;
        SoundEngine.startFuseHiss(keg.id);
        this.displayHudAlert('🔥 Powder Keg fuse ignited! (4.0s)');
        break;
      }
    }
  }

  /**
   * Host Authoritative 30Hz simulation logic
   */
  private runHostSimulationTick(dt: number): void {
    // 1. Update AI Sapper Bots
    for (const ai of this.aiControllers) {
      const input = ai.update(
        this.world,
        Array.from(this.crates.values()),
        Array.from(this.kegs.values()),
        Array.from(this.players.values())
      );
      this.applyInputToPlayer(ai.bot, input);
    }

    // 2. Update Powder Kegs & Fuse Detonations
    for (const [id, keg] of this.kegs) {
      const res = PhysicsEngine.updateKegPhysics(keg, this.world, dt);
      if (res.exploded) {
        this.detonateKeg(keg);
      }
    }

    // 3. Update Crates & Deposit Checks
    for (const [id, crate] of this.crates) {
      PhysicsEngine.updateCratePhysics(crate, this.world, dt);

      // Check Extraction Hopper deposit
      // Red Cart Hopper
      if (Math.hypot(crate.x - this.world.redCartPos.x, crate.y - this.world.redCartPos.y) <= 22) {
        this.redScore++;
        SoundEngine.playExtractionChime();
        this.goldEmitter.emitParticleAt(crate.x, crate.y, 20);
        this.displayHudAlert(`🏆 RED CREW DEPOSITED GOLD! [${this.redScore}/5]`);
        this.crates.delete(id);
        if (crate.holderId) {
          const holder = this.players.get(crate.holderId);
          if (holder) {
            holder.heldType = 'none';
            holder.heldEntityId = null;
          }
        }
        if (this.redScore >= 5) {
          this.triggerVictory('RED CREW');
        }
        continue;
      }

      // Blue Cart Hopper
      if (Math.hypot(crate.x - this.world.blueCartPos.x, crate.y - this.world.blueCartPos.y) <= 22) {
        this.blueScore++;
        SoundEngine.playExtractionChime();
        this.goldEmitter.emitParticleAt(crate.x, crate.y, 20);
        this.displayHudAlert(`🏆 BLUE CREW DEPOSITED GOLD! [${this.blueScore}/5]`);
        this.crates.delete(id);
        if (crate.holderId) {
          const holder = this.players.get(crate.holderId);
          if (holder) {
            holder.heldType = 'none';
            holder.heldEntityId = null;
          }
        }
        if (this.blueScore >= 5) {
          this.triggerVictory('BLUE CREW');
        }
        continue;
      }
    }

    // 4. Update Bullets
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;

      // Check wall hit
      const tx = Math.floor(b.x / TILE_SIZE);
      const ty = Math.floor(b.y / TILE_SIZE);
      if (this.world.isSolid(tx, ty)) {
        this.rubbleEmitter.emitParticleAt(b.x, b.y, 4);
        this.bullets.splice(i, 1);
        continue;
      }

      // Check keg hit -> lights fuse immediately!
      for (const [id, keg] of this.kegs) {
        if (Math.hypot(keg.x - b.x, keg.y - b.y) <= 12) {
          if (!keg.isLit) {
            keg.isLit = true;
            keg.fuseRemaining = 3.5;
            SoundEngine.startFuseHiss(keg.id);
            this.displayHudAlert('🔥 Gunshot sparked Powder Keg fuse!');
          }
          this.bullets.splice(i, 1);
          break;
        }
      }

      // Check player hit
      for (const [id, p] of this.players) {
        if (p.id !== b.shooterId && !p.isDead && Math.hypot(p.x - b.x, p.y - b.y) <= 12) {
          p.health -= 45;
          SoundEngine.playHurt();
          this.rubbleEmitter.emitParticleAt(b.x, b.y, 6);

          // Knock held item out of hand
          if (p.heldType !== 'none') {
            const heldCrate = p.heldType === 'crate' ? this.crates.get(p.heldEntityId!) || null : null;
            const heldKeg = p.heldType === 'keg' ? this.kegs.get(p.heldEntityId!) || null : null;
            PhysicsEngine.throwObject(p, heldCrate, heldKeg);
          }

          if (p.health <= 0) {
            p.isDead = true;
            p.respawnTimer = 4.0;
            this.displayHudAlert(`☠ ${p.name} was gunned down!`);
          }

          this.bullets.splice(i, 1);
          break;
        }
      }

      if (b.life <= 0) {
        this.bullets.splice(i, 1);
      }
    }

    // 5. Player Cooldowns & Respawns
    for (const [id, p] of this.players) {
      if (p.swingCooldown > 0) p.swingCooldown--;
      if (p.flintlockCooldown > 0) p.flintlockCooldown--;

      if (p.isDead) {
        p.respawnTimer -= dt;
        if (p.respawnTimer <= 0) {
          p.isDead = false;
          p.health = 100;
          const spawn = p.team === 'red' ? this.world.redSpawnPos : this.world.blueSpawnPos;
          p.x = spawn.x;
          p.y = spawn.y;
          this.displayHudAlert(`⛏ ${p.name} returned to the expedition.`);
        }
      }
    }

    // 6. Match Timer Countdown
    this.matchTimeRemaining = Math.max(0, this.matchTimeRemaining - dt);
    if (this.matchTimeRemaining <= 0) {
      const winner = this.redScore > this.blueScore ? 'RED CREW' : (this.blueScore > this.redScore ? 'BLUE CREW' : 'STALEMATE');
      this.triggerVictory(winner);
    }
  }

  private detonateKeg(keg: PowderKegEntity): void {
    SoundEngine.stopFuseHiss(keg.id);
    this.kegs.delete(keg.id);

    const radius = 52;
    const res = PhysicsEngine.executeExplosion(
      keg.x,
      keg.y,
      radius,
      this.world,
      Array.from(this.players.values()),
      Array.from(this.crates.values()),
      Array.from(this.kegs.values()),
      (gx, gy) => this.spawnGoldCrate(gx, gy)
    );

    this.onExplosionEffect(keg.x, keg.y, radius);
    this.renderTerrain();

    this.net.broadcastEvent({
      type: 'EXPLOSION',
      data: { x: keg.x, y: keg.y, radius }
    });
  }

  private onExplosionEffect(x: number, y: number, radius: number): void {
    SoundEngine.playExplosion();
    this.cameras.main.shake(320, 0.024);
    this.flashIntensity = 1.0;

    this.rubbleEmitter.emitParticleAt(x, y, 32);
    this.smokeEmitter.emitParticleAt(x, y, 24);
    this.sparkEmitter.emitParticleAt(x, y, 16);

    // Massive acoustic ripple through dark cavern
    this.lighting.addSoundRipple(x, y, radius * 3.5, 0xffaa44);
  }

  public spawnGoldCrate(x: number, y: number): GoldCrateEntity {
    const id = 'crate_' + Math.random().toString(36).substring(2, 8);
    const crate = new GoldCrateEntity(id, x, y);
    this.crates.set(id, crate);
    this.goldEmitter.emitParticleAt(x, y, 14);
    return crate;
  }

  private broadcastCurrentState(): void {
    const playerArray = Array.from(this.players.values()).map(p => ({
      id: p.id,
      name: p.name,
      team: p.team,
      x: Math.round(p.x),
      y: Math.round(p.y),
      vx: Math.round(p.vx * 10) / 10,
      vy: Math.round(p.vy * 10) / 10,
      aim: Math.round(p.aimAngle * 100) / 100,
      hp: p.health,
      slot: p.activeSlot,
      shuttered: p.isLanternShuttered,
      heldType: p.heldType,
      heldId: p.heldEntityId,
      isDead: p.isDead
    }));

    const crateArray = Array.from(this.crates.values()).map(c => ({
      id: c.id,
      x: Math.round(c.x),
      y: Math.round(c.y),
      vx: Math.round(c.vx),
      vy: Math.round(c.vy),
      held: c.isHeld
    }));

    const kegArray = Array.from(this.kegs.values()).map(k => ({
      id: k.id,
      x: Math.round(k.x),
      y: Math.round(k.y),
      vx: Math.round(k.vx),
      vy: Math.round(k.vy),
      lit: k.isLit,
      fuse: Math.round(k.fuseRemaining * 10) / 10,
      held: k.isHeld
    }));

    const payload: NetworkStatePayload = {
      tick: this.localInputSeq,
      players: playerArray,
      crates: crateArray,
      kegs: kegArray,
      scores: { red: this.redScore, blue: this.blueScore },
      timeRemaining: Math.round(this.matchTimeRemaining)
    };

    this.net.broadcastState(payload);
  }

  private reconcileState(state: NetworkStatePayload): void {
    this.redScore = state.scores.red;
    this.blueScore = state.scores.blue;
    this.matchTimeRemaining = state.timeRemaining;

    // Sync Players (except local prediction position)
    for (const pData of state.players) {
      let p = this.players.get(pData.id);
      if (!p) {
        p = new MinerEntity(pData.id, pData.name, pData.team, pData.x, pData.y, false);
        this.players.set(pData.id, p);
      }
      p.health = pData.hp;
      p.isDead = pData.isDead;
      p.activeSlot = pData.slot;
      p.isLanternShuttered = pData.shuttered;
      p.heldType = pData.heldType;
      p.heldEntityId = pData.heldId;

      if (p.id !== this.localMiner.id) {
        // Smooth interpolation for remote players
        p.x = Phaser.Math.Linear(p.x, pData.x, 0.4);
        p.y = Phaser.Math.Linear(p.y, pData.y, 0.4);
        p.vx = pData.vx;
        p.vy = pData.vy;
        p.aimAngle = pData.aim;
        p.isMoving = p.vx !== 0 || p.vy !== 0;
      }
    }

    // Sync Crates
    const currentCrateIds = new Set(this.crates.keys());
    for (const cData of state.crates) {
      currentCrateIds.delete(cData.id);
      let c = this.crates.get(cData.id);
      if (!c) {
        c = new GoldCrateEntity(cData.id, cData.x, cData.y);
        this.crates.set(cData.id, c);
      }
      c.isHeld = cData.held;
      if (!c.isHeld) {
        c.x = Phaser.Math.Linear(c.x, cData.x, 0.4);
        c.y = Phaser.Math.Linear(c.y, cData.y, 0.4);
      }
    }
    for (const removedId of currentCrateIds) {
      const sp = this.crateSprites.get(removedId);
      if (sp) {
        sp.destroy();
        this.crateSprites.delete(removedId);
      }
      this.crates.delete(removedId);
    }

    // Sync Kegs
    const currentKegIds = new Set(this.kegs.keys());
    for (const kData of state.kegs) {
      currentKegIds.delete(kData.id);
      let k = this.kegs.get(kData.id);
      if (!k) {
        k = new PowderKegEntity(kData.id, kData.x, kData.y);
        this.kegs.set(kData.id, k);
      }
      k.isLit = kData.lit;
      k.fuseRemaining = kData.fuse;
      k.isHeld = kData.held;
      if (!k.isHeld) {
        k.x = Phaser.Math.Linear(k.x, kData.x, 0.4);
        k.y = Phaser.Math.Linear(k.y, kData.y, 0.4);
      }
      if (k.isLit) {
        SoundEngine.startFuseHiss(k.id);
      }
    }
    for (const removedId of currentKegIds) {
      const spEntry = this.kegSprites.get(removedId);
      if (spEntry) {
        spEntry.sprite.destroy();
        this.kegSprites.delete(removedId);
      }
      this.kegs.delete(removedId);
    }
  }

  private updateVisualEntities(dt: number): void {
    // 1. Camera follow local player
    this.cameras.main.scrollX = Phaser.Math.Linear(this.cameras.main.scrollX, this.localMiner.x - this.cameras.main.width / 2, 0.1);
    this.cameras.main.scrollY = Phaser.Math.Linear(this.cameras.main.scrollY, this.localMiner.y - this.cameras.main.height / 2, 0.1);

    // 2. Player Sprites & Containers
    for (const [id, p] of this.players) {
      let entry = this.playerSprites.get(id);
      if (!entry) {
        const container = this.add.container(p.x, p.y).setDepth(10);
        const body = this.add.sprite(0, 0, p.team === 'red' ? 'miner_red_idle' : 'miner_blue_idle');
        const tool = this.add.sprite(8, 2, 'pickaxe_tool').setOrigin(0.2, 0.8);
        const nameText = this.add.text(0, -14, p.name, {
          fontFamily: 'VT323, monospace',
          fontSize: '11px',
          color: p.team === 'red' ? '#d44937' : '#6fb0cf'
        }).setOrigin(0.5);

        container.add([body, tool, nameText]);
        entry = { container, body, tool, nameText };
        this.playerSprites.set(id, entry);
      }

      entry.container.setPosition(p.x, p.y);
      entry.container.setVisible(!p.isDead);

      // Walk cycle animation
      if (p.isMoving && !p.isDead) {
        p.animTick += dt * 10;
        p.animFrame = Math.floor(p.animTick) % 4;
        const prefix = p.team === 'red' ? 'miner_red_run_' : 'miner_blue_run_';
        entry.body.setTexture(prefix + p.animFrame);
      } else {
        entry.body.setTexture(p.team === 'red' ? 'miner_red_idle' : 'miner_blue_idle');
      }

      // Flip sprite based on aim angle
      const facingLeft = Math.cos(p.aimAngle) < 0;
      entry.body.setFlipX(facingLeft);

      // Tool holding / swinging / hoisting
      if (p.heldType !== 'none') {
        // Hoisting crate or keg in front of miner
        entry.tool.setVisible(true);
        entry.tool.setTexture(p.heldType === 'crate' ? 'gold_crate' : 'powder_keg');
        entry.tool.setPosition(facingLeft ? -4 : 4, -8);
        entry.tool.setRotation(0);
      } else {
        entry.tool.setTexture(p.activeSlot === 1 ? 'pickaxe_tool' : 'flintlock_tool');
        entry.tool.setPosition(facingLeft ? -6 : 6, 2);
        entry.tool.setRotation(p.aimAngle + (facingLeft ? Math.PI : 0));
        entry.tool.setFlipY(facingLeft);
      }
    }

    // 3. Crates
    for (const [id, crate] of this.crates) {
      let sp = this.crateSprites.get(id);
      if (!sp) {
        sp = this.add.sprite(crate.x, crate.y, 'gold_crate').setDepth(6);
        this.crateSprites.set(id, sp);
      }
      sp.setPosition(crate.x, crate.y);
      sp.setVisible(!crate.isHeld); // Handled inside player container if held
    }

    // 4. Kegs
    for (const [id, keg] of this.kegs) {
      let entry = this.kegSprites.get(id);
      if (!entry) {
        const sp = this.add.sprite(keg.x, keg.y, 'powder_keg').setDepth(6);
        entry = { sprite: sp };
        this.kegSprites.set(id, entry);
      }
      entry.sprite.setPosition(keg.x, keg.y);
      entry.sprite.setVisible(!keg.isHeld);

      if (keg.isLit) {
        const frame = Math.floor(this.time.now / 100) % 2;
        entry.sprite.setTexture(frame === 0 ? 'powder_keg_lit_0' : 'powder_keg_lit_1');
        // Spark & smoke
        if (Math.random() < 0.3) {
          this.sparkEmitter.emitParticleAt(keg.x + 2, keg.y - 6, 2);
          this.smokeEmitter.emitParticleAt(keg.x + 2, keg.y - 6, 1);
        }
      } else {
        entry.sprite.setTexture('powder_keg');
      }
    }

    // 5. Bullets
    for (const b of this.bullets) {
      let sp = this.bulletSprites.get(b.id);
      if (!sp) {
        sp = this.add.sprite(b.x, b.y, 'bullet_lead').setDepth(8);
        this.bulletSprites.set(b.id, sp);
      }
      sp.setPosition(b.x, b.y);
    }
  }

  private updateLighting(dt: number): void {
    this.lighting.updateRipples(dt);

    const staticLights = [
      // West Red Base sconce
      { x: this.world.redCartPos.x + 16, y: this.world.redCartPos.y - 20, radius: 100, color: '#ffaa44', intensity: 0.9 },
      // East Blue Base sconce
      { x: this.world.blueCartPos.x - 16, y: this.world.blueCartPos.y - 20, radius: 100, color: '#ffaa44', intensity: 0.9 },
      // Central Chamber sconce
      { x: 36 * TILE_SIZE, y: 36 * TILE_SIZE, radius: 120, color: '#ffaa44', intensity: 0.95 }
    ];

    // Add lit keg sparks as light points
    for (const [id, keg] of this.kegs) {
      if (keg.isLit) {
        staticLights.push({
          x: keg.x,
          y: keg.y,
          radius: 40 + Math.sin(this.time.now * 0.05) * 8,
          color: '#f7d060',
          intensity: 0.9
        });
      }
    }

    this.lighting.render(
      this.cameras.main,
      Array.from(this.players.values()),
      this.localMiner.id,
      staticLights,
      this.flashIntensity
    );
  }

  private renderTerrain(): void {
    const g = this.terrainGraphics;
    g.clear();

    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        const type = this.world.getTile(x, y);
        const px = x * TILE_SIZE;
        const py = y * TILE_SIZE;

        switch (type) {
          case TileType.EMPTY:
            g.fillStyle(0x18171c, 1);
            g.fillRect(px, py, TILE_SIZE, TILE_SIZE);
            break;
          case TileType.BEDROCK:
            g.fillStyle(0x141316, 1);
            g.fillRect(px, py, TILE_SIZE, TILE_SIZE);
            g.fillStyle(0x222126, 1);
            g.fillRect(px + 2, py + 2, TILE_SIZE - 4, TILE_SIZE - 4);
            break;
          case TileType.GRANITE:
            g.fillStyle(0x3b3a42, 1);
            g.fillRect(px, py, TILE_SIZE, TILE_SIZE);
            g.fillStyle(0x52505c, 1);
            g.fillRect(px + 2, py + 1, 6, 4);
            break;
          case TileType.DIRT:
            g.fillStyle(0x734c36, 1);
            g.fillRect(px, py, TILE_SIZE, TILE_SIZE);
            g.fillStyle(0x4d3224, 1);
            g.fillRect(px + 3, py + 3, 5, 5);
            break;
          case TileType.TIMBER_WALL:
            g.fillStyle(0x663931, 1);
            g.fillRect(px, py, TILE_SIZE, TILE_SIZE);
            g.fillStyle(0x8f563b, 1);
            g.fillRect(px + 1, py + 1, TILE_SIZE - 2, 4);
            g.fillRect(px + 1, py + 9, TILE_SIZE - 2, 4);
            break;
          case TileType.GOLD_SEAM:
            g.fillStyle(0x3b3a42, 1);
            g.fillRect(px, py, TILE_SIZE, TILE_SIZE);
            g.fillStyle(0xdf9e28, 1);
            g.fillRect(px + 3, py + 2, 7, 6);
            g.fillStyle(0xf7d060, 1);
            g.fillRect(px + 5, py + 4, 3, 3);
            break;
          case TileType.WATER_POCKET:
            g.fillStyle(0x2d576b, 1);
            g.fillRect(px, py, TILE_SIZE, TILE_SIZE);
            g.fillStyle(0x4a8299, 1);
            g.fillRect(px + 2, py + 2, 6, 3);
            break;
          case TileType.GAS_POCKET:
            g.fillStyle(0x18171c, 1);
            g.fillRect(px, py, TILE_SIZE, TILE_SIZE);
            g.fillStyle(0x5c7a3d, 0.5);
            g.fillCircle(px + 8, py + 8, 4);
            break;
        }
      }
    }
    this.renderWater();
  }

  private renderWater(): void {
    const wg = this.waterGraphics;
    wg.clear();

    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        const depth = this.world.waterGrid[this.world.getIndex(x, y)];
        if (depth > 0 && this.world.getTile(x, y) === TileType.EMPTY) {
          const px = x * TILE_SIZE;
          const py = y * TILE_SIZE;
          const alpha = 0.4 + (depth / 4) * 0.45;
          wg.fillStyle(0x2d576b, alpha);
          wg.fillRect(px, py, TILE_SIZE, TILE_SIZE);
          wg.fillStyle(0x4a8299, alpha * 0.8);
          wg.fillRect(px + 1, py + 2, TILE_SIZE - 2, 2);
        }
      }
    }
  }

  private displayHudAlert(msg: string): void {
    const el = document.getElementById('event-feed');
    if (el) {
      const line = document.createElement('div');
      line.className = 'feed-line';
      line.textContent = `> ${msg}`;
      el.appendChild(line);
      while (el.children.length > 5) {
        el.removeChild(el.firstChild!);
      }
      setTimeout(() => line.classList.add('fade'), 4500);
    }
  }

  private updateDomHud(): void {
    // 1. Scores & Timer
    const redScoreEl = document.getElementById('hud-red-score');
    if (redScoreEl) redScoreEl.textContent = `${this.redScore}/5`;

    const blueScoreEl = document.getElementById('hud-blue-score');
    if (blueScoreEl) blueScoreEl.textContent = `${this.blueScore}/5`;

    const timerEl = document.getElementById('hud-timer');
    if (timerEl) {
      const mins = Math.floor(this.matchTimeRemaining / 60);
      const secs = Math.floor(this.matchTimeRemaining % 60);
      timerEl.textContent = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    }

    // 2. Network Pill
    const netPill = document.getElementById('net-status-pill');
    if (netPill) {
      const role = this.config.isHost ? 'HOST' : 'CLIENT';
      const peers = this.net.connectedPeers.size;
      const ping = this.config.isHost ? 0 : this.net.pingMs;
      netPill.textContent = `● [${role}] ROOM: ${this.config.roomCode} | PEERS: ${peers} | PING: ${ping}ms`;
    }

    // 3. Active Tool & Reload
    const toolEl = document.getElementById('hud-active-tool');
    if (toolEl) {
      if (this.localMiner.heldType !== 'none') {
        toolEl.innerHTML = `<span style="color:#f7d060">HOISTING ${this.localMiner.heldType === 'crate' ? 'GOLD CRATE' : 'POWDER KEG'}</span> [E/L-Click to Throw]`;
      } else if (this.localMiner.activeSlot === 1) {
        toolEl.innerHTML = `<span style="color:#df9e28">⛏ PICKAXE</span> [L-Click: Mine / Whack]`;
      } else {
        const reloadPct = Math.max(0, 1 - (this.localMiner.flintlockCooldown / 150));
        const ready = reloadPct >= 1;
        toolEl.innerHTML = `<span style="color:#cfc4ba">︻╦╤─ FLINTLOCK</span> ${ready ? '<span style="color:#5c7a3d">[READY]</span>' : `<span style="color:#d44937">[RELOADING ${Math.round(reloadPct * 100)}%]</span>`}`;
      }
    }

    // 4. Lantern Shutter status
    const lanternEl = document.getElementById('hud-lantern-status');
    if (lanternEl) {
      lanternEl.textContent = this.localMiner.isLanternShuttered ? 'SHUTTERED [STEALTH]' : 'LIT [FULL BEAM]';
      lanternEl.style.color = this.localMiner.isLanternShuttered ? '#734c36' : '#ffaa44';
    }

    // 5. Tactile Iron & Brass Hearts
    const healthEl = document.getElementById('hud-hearts');
    if (healthEl) {
      const hp = this.localMiner.health;
      let hearts = '';
      if (hp > 66) hearts = '🟨 🟨 🟨';
      else if (hp > 33) hearts = '🟨 🟨 ⬛';
      else if (hp > 0) hearts = '🟨 ⬛ ⬛';
      else hearts = '☠ DOWN (RESPAWNING)';
      healthEl.textContent = hearts;
    }
  }

  private triggerVictory(winner: string): void {
    if (this.isGameOver) return;
    this.isGameOver = true;

    this.net.broadcastEvent({
      type: 'VICTORY',
      data: { winner }
    });

    this.triggerVictoryScreen(winner);
  }

  private triggerVictoryScreen(winner: string): void {
    const modal = document.getElementById('victory-modal');
    const winnerText = document.getElementById('victory-winner-text');
    if (modal && winnerText) {
      winnerText.textContent = `${winner} CLAIMS THE DEEPVEIN!`;
      modal.style.display = 'flex';
    }
  }
}
