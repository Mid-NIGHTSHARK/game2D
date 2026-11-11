/**
 * main.ts
 * Entry Point for Deepvein: Powder & Pickaxe.
 * Manages Lobby UI, Join Flows, 1-Click Invite URLs, and Phaser Initialization.
 * CC0 1.0 Universal Public Domain.
 */

import Phaser from 'phaser';
import { DeepveinScene, SceneConfig } from '../../src/game/DeepveinScene';
import { SoundEngine } from '../../src/audio/SoundEngine';
import { NetworkManager, LobbyRoomInfo } from '../../src/net/NetworkManager';
import { TeamId } from '../../src/game/Entities';

class ExpeditionApp {
  private phaserGame: Phaser.Game | null = null;
  private netDiscovery: NetworkManager = new NetworkManager();
  private selectedTeam: TeamId = 'red';
  private currentRoomCode: string = '';

  constructor() {
    this.initUI();
    this.checkUrlParams();
    this.startDiscovery();
  }

  private initUI(): void {
    // Team Toggle
    const redBtn = document.getElementById('team-red-btn')!;
    const blueBtn = document.getElementById('team-blue-btn')!;

    redBtn.addEventListener('click', () => {
      this.selectedTeam = 'red';
      redBtn.classList.add('selected');
      blueBtn.classList.remove('selected');
    });

    blueBtn.addEventListener('click', () => {
      this.selectedTeam = 'blue';
      blueBtn.classList.add('selected');
      redBtn.classList.remove('selected');
    });

    // Host Button
    const hostBtn = document.getElementById('btn-host-room')!;
    hostBtn.addEventListener('click', () => {
      const codeInput = (document.getElementById('input-room-code') as HTMLInputElement).value.trim();
      const roomCode = codeInput.length === 4 ? codeInput.toUpperCase() : this.generateRoomCode();
      const botCount = parseInt((document.getElementById('select-bots') as HTMLSelectElement).value, 10);
      this.launchExpedition(roomCode, true, botCount);
    });

    // Join Button
    const joinBtn = document.getElementById('btn-join-room')!;
    joinBtn.addEventListener('click', () => {
      const codeInput = (document.getElementById('input-room-code') as HTMLInputElement).value.trim();
      if (!codeInput) {
        alert('Please enter a 4-letter Room Code to join.');
        return;
      }
      this.launchExpedition(codeInput.toUpperCase(), false, 0);
    });

    // Copy Link Button
    const copyBtn = document.getElementById('btn-copy-link')!;
    copyBtn.addEventListener('click', () => {
      if (!this.currentRoomCode) return;
      const url = `${window.location.origin}${window.location.pathname}?room=${this.currentRoomCode}`;
      navigator.clipboard.writeText(url).then(() => {
        copyBtn.textContent = 'COPIED!';
        setTimeout(() => (copyBtn.textContent = 'Copy Link'), 2000);
      }).catch(() => {
        prompt('Copy invite link:', url);
      });
    });

    // Sound Toggle Button
    const soundBtn = document.getElementById('btn-toggle-sound')!;
    soundBtn.addEventListener('click', () => {
      const muted = !SoundEngine.getMuted();
      SoundEngine.setMuted(muted);
      soundBtn.textContent = muted ? 'SFX: OFF' : 'SFX: ON';
    });

    // Play Again Button
    const playAgainBtn = document.getElementById('btn-play-again')!;
    playAgainBtn.addEventListener('click', () => {
      window.location.reload();
    });
  }

  private checkUrlParams(): void {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    if (roomParam) {
      const code = roomParam.trim().toUpperCase();
      (document.getElementById('input-room-code') as HTMLInputElement).value = code;
      // Auto-join after user interaction or directly
      const hostBtn = document.getElementById('btn-host-room')!;
      hostBtn.textContent = `Join Room [${code}]`;
    }
  }

  private startDiscovery(): void {
    this.netDiscovery.startLobbyDiscovery();
    this.netDiscovery.onLobbyDiscovered = (rooms: LobbyRoomInfo[]) => {
      this.renderPublicRooms(rooms);
    };
  }

  private renderPublicRooms(rooms: LobbyRoomInfo[]): void {
    const container = document.getElementById('public-rooms-list');
    if (!container) return;

    if (rooms.length === 0) {
      container.innerHTML = `<div style="color:#73707b; font-size:16px; padding:4px;">No active public expeditions found. Host one!</div>`;
      return;
    }

    container.innerHTML = '';
    for (const r of rooms) {
      const div = document.createElement('div');
      div.className = 'room-item';
      div.innerHTML = `
        <div>
          <strong style="color:var(--gold-bright);">${r.roomCode}</strong> — 
          <span>Host: ${r.hostName}</span>
        </div>
        <div style="font-size:14px; color:#ab9e92;">
          ${r.playerCount}/${r.maxPlayers} Miners
        </div>
      `;
      div.addEventListener('click', () => {
        (document.getElementById('input-room-code') as HTMLInputElement).value = r.roomCode;
        this.launchExpedition(r.roomCode, false, 0);
      });
      container.appendChild(div);
    }
  }

  private generateRoomCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  private launchExpedition(roomCode: string, isHost: boolean, botCount: number): void {
    this.currentRoomCode = roomCode;
    this.netDiscovery.stopLobbyDiscovery();

    // Player Name
    const nameInput = (document.getElementById('input-player-name') as HTMLInputElement).value.trim();
    const playerName = nameInput || (this.selectedTeam === 'red' ? 'Red Miner' : 'Blue Miner');

    // Hide Lobby Modal
    const lobbyModal = document.getElementById('lobby-modal')!;
    lobbyModal.style.display = 'none';

    // Start Audio
    SoundEngine.init();

    const config: SceneConfig = {
      roomCode,
      isHost,
      playerName,
      playerTeam: this.selectedTeam,
      botCount
    };

    const phaserConfig: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      parent: 'game-container',
      width: window.innerWidth,
      height: window.innerHeight,
      pixelArt: true,
      scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH
      },
      backgroundColor: '#141316',
      scene: [DeepveinScene]
    };

    this.phaserGame = new Phaser.Game(phaserConfig);
    this.phaserGame.scene.start('DeepveinScene', config);
  }
}

// Start application
window.addEventListener('DOMContentLoaded', () => {
  new ExpeditionApp();
});

