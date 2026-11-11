import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload(): void {
    // Determine asset base path relative to current URL
    const basePath = './assets/';

    this.load.image('valley_tiles', `${basePath}tilesets/valley_tiles.png`);
    this.load.spritesheet('water_tiles', `${basePath}tilesets/water_tiles.png`, {
      frameWidth: 16,
      frameHeight: 16
    });
    this.load.spritesheet('mechanics', `${basePath}mechanics/mechanics.png`, {
      frameWidth: 32,
      frameHeight: 32
    });
    this.load.spritesheet('crew', `${basePath}characters/crew.png`, {
      frameWidth: 16,
      frameHeight: 16
    });
  }

  create(): void {
    this.createAnimations();
    this.scene.start('ValleyScene');
  }

  private createAnimations(): void {
    // Water horizontal flow animation (frames 6 to 9 in water_tiles)
    this.anims.create({
      key: 'water_flow_h',
      frames: this.anims.generateFrameNumbers('water_tiles', { start: 6, end: 9 }),
      frameRate: 6,
      repeat: -1
    });

    // Water vertical flow animation (frames 12 to 15 in water_tiles)
    this.anims.create({
      key: 'water_flow_v',
      frames: this.anims.generateFrameNumbers('water_tiles', { start: 12, end: 15 }),
      frameRate: 6,
      repeat: -1
    });

    // Water splash / churn animation (frames 18 to 21 in water_tiles)
    this.anims.create({
      key: 'water_splash',
      frames: this.anims.generateFrameNumbers('water_tiles', { start: 18, end: 21 }),
      frameRate: 8,
      repeat: -1
    });

    // Waterwheel rotation animation: 8 frames located at row index 1 & 2 (indices 4..11) in 32x32 mechanics sheet
    this.anims.create({
      key: 'waterwheel_spin',
      frames: this.anims.generateFrameNumbers('mechanics', { start: 4, end: 11 }),
      frameRate: 10,
      repeat: -1
    });

    // Player animations for 4 colors (0: Teal, 1: Rust, 2: Olive, 3: Ochre)
    // In crew.png: 128x128. Frame width=16, height=16. 8 frames per row.
    // Row 0 & 1: Player 0. Row 2 & 3: Player 1. Row 4 & 5: Player 2. Row 6 & 7: Player 3.
    for (let p = 0; p < 4; p++) {
      const rowOffset = p * 16;
      // Directions: Down (0,1), Up (2,3), Left (4,5), Right (6,7)
      const dirs = ['down', 'up', 'left', 'right'];
      dirs.forEach((dir, dIdx) => {
        const startFrame = rowOffset + dIdx * 2;
        this.anims.create({
          key: `player_${p}_walk_${dir}`,
          frames: this.anims.generateFrameNumbers('crew', { start: startFrame, end: startFrame + 1 }),
          frameRate: 6,
          repeat: -1
        });

        this.anims.create({
          key: `player_${p}_idle_${dir}`,
          frames: [{ key: 'crew', frame: startFrame }],
          frameRate: 1
        });
      });
    }
  }
}
