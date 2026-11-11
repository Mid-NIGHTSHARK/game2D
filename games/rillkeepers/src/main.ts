import Phaser from 'phaser';
import { BootScene } from './game/scenes/BootScene';
import { ValleyScene } from './game/scenes/ValleyScene';
import { MenuManager } from './game/ui/MenuManager';
import { Network } from './networking/NetworkManager';
import { CONFIG } from './config';

const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: CONFIG.GAME_WIDTH,
  height: CONFIG.GAME_HEIGHT,
  parent: 'game-container',
  pixelArt: true,
  roundPixels: true,
  backgroundColor: '#1d2a21',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: false
    }
  },
  scene: [BootScene, ValleyScene]
};

const game = new Phaser.Game(gameConfig);
(window as any).game = game;
(window as any).Network = Network;

// Initialize MenuManager once ValleyScene is running
game.events.once('ready', () => {
  const valleyScene = game.scene.getScene('ValleyScene') as ValleyScene;
  if (valleyScene) {
    const menu = new MenuManager(valleyScene);
    // Parse invitation URL (?room=ROOM_ID#key=ROOM_SECRET)
    menu.checkUrlInvitation();
  }
});
