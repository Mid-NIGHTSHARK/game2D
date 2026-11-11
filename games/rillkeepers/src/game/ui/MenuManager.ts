// UI and Menu Manager for Rillkeepers P2P Multiplayer

import { ValleyScene } from '../scenes/ValleyScene';
import { Network } from '../../networking/NetworkManager';
import {
  parseInvitationUrl,
  parseCombinedInviteCode,
  formatCombinedInviteCode,
  isValidRoomId,
  isValidRoomSecret
} from '../../networking/RoomCode';
import { SoundEffects } from '../../audio/SoundEffects';

export class MenuManager {
  private scene: ValleyScene;

  // DOM Elements
  private hud = document.getElementById('hud')!;
  private hudStatusDot = document.getElementById('hud-status-dot')!;
  private hudRoomLabel = document.getElementById('hud-room-label')!;
  private hudCopyBtn = document.getElementById('hud-copy-btn')!;
  private hudPlayerCount = document.getElementById('player-count-text')!;
  private hudObjective = document.getElementById('objective-text')!;

  private titleScreen = document.getElementById('title-screen')!;
  private joinModal = document.getElementById('join-modal')!;
  private joinErrorMsg = document.getElementById('join-error-msg')!;
  private publicWorldsModal = document.getElementById('public-worlds-modal')!;
  private pauseModal = document.getElementById('pause-modal')!;
  private victoryModal = document.getElementById('victory-modal')!;
  private creditsModal = document.getElementById('credits-modal')!;
  private hostDepartedModal = document.getElementById('host-departed-modal')!;
  private interactionPrompt = document.getElementById('interaction-prompt')!;
  private promptKey = document.getElementById('prompt-key')!;
  private promptLabel = document.getElementById('prompt-label')!;
  private toastContainer = document.getElementById('toast-container')!;
  private touchControls = document.getElementById('touch-controls')!;

  constructor(scene: ValleyScene) {
    this.scene = scene;
    this.bindEvents();
    this.bindNetworkEvents();
    this.detectTouchDevice();
  }

  private detectTouchDevice(): void {
    const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (isTouch) {
      this.touchControls.classList.remove('hidden');
    }
  }

  public checkUrlInvitation(): void {
    if (typeof window === 'undefined') return;
    const parsed = parseInvitationUrl(window.location.href);
    if (parsed) {
      const combinedInput = document.getElementById('invite-combined-input') as HTMLInputElement;
      const roomIdInput = document.getElementById('room-id-input') as HTMLInputElement;
      const secretInput = document.getElementById('room-secret-input') as HTMLInputElement;
      if (combinedInput) combinedInput.value = formatCombinedInviteCode(parsed.roomId, parsed.roomSecret);
      if (roomIdInput) roomIdInput.value = parsed.roomId;
      if (secretInput) secretInput.value = parsed.roomSecret;
      this.showToast(`Invitation detected for Valley ${parsed.roomId}!`);
      this.joinModal.classList.remove('hidden');
    }
  }

  private bindEvents(): void {
    // 1. Single Player Play
    document.getElementById('btn-solo-play')?.addEventListener('click', async () => {
      SoundEffects.resume();
      this.titleScreen.classList.add('hidden');
      this.hud.classList.remove('hidden');
      await Network.disconnect();
      this.scene.setMode(false, false);
      this.updateHudConnection('offline_local', 'Solo Practice');
      this.hudPlayerCount.textContent = '1/1';
      this.showToast('Entered Valley in Solo Practice Mode.');
    });

    // 2. Local 2-Player Co-op
    document.getElementById('btn-local-coop')?.addEventListener('click', async () => {
      SoundEffects.resume();
      this.titleScreen.classList.add('hidden');
      this.hud.classList.remove('hidden');
      await Network.disconnect();
      this.scene.setMode(false, true);
      this.updateHudConnection('offline_local', 'Local 2P');
      this.hudPlayerCount.textContent = '2/2';
      this.showToast('Local 2-Player: P1 uses WASD+E, P2 uses Arrows+Enter.');
    });

    // 3. Create Private World (Host)
    document.getElementById('btn-create-room')?.addEventListener('click', async () => {
      SoundEffects.resume();
      this.titleScreen.classList.add('hidden');
      this.hud.classList.remove('hidden');
      this.scene.setMode(true, false);
      this.updateHudConnection('connecting', 'Creating...');

      try {
        const { roomId, inviteUrl, combinedCode } = await Network.createWorld(
          this.scene.simulation,
          undefined,
          undefined,
          'Host Keeper'
        );
        this.updateHudConnection('connected', `${roomId} (Host)`);
        this.hudCopyBtn.classList.remove('hidden');
        navigator.clipboard?.writeText(inviteUrl);
        this.showToast(`Private valley created! Code: ${combinedCode}`);
      } catch (err: any) {
        this.showToast('Failed to create private world: ' + (err?.message || 'Error'));
      }
    });

    // 4. Join Dialog
    document.getElementById('btn-join-room-dialog')?.addEventListener('click', () => {
      SoundEffects.resume();
      this.joinErrorMsg.classList.add('hidden');
      this.joinModal.classList.remove('hidden');
    });

    // Synchronize combined input with manual inputs
    const combinedInput = document.getElementById('invite-combined-input') as HTMLInputElement;
    const roomIdInput = document.getElementById('room-id-input') as HTMLInputElement;
    const secretInput = document.getElementById('room-secret-input') as HTMLInputElement;

    combinedInput?.addEventListener('input', () => {
      this.joinErrorMsg.classList.add('hidden');
      const val = combinedInput.value.trim();
      const parsed = parseCombinedInviteCode(val);
      if (parsed) {
        if (roomIdInput) roomIdInput.value = parsed.roomId;
        if (secretInput) secretInput.value = parsed.roomSecret;
      }
    });

    roomIdInput?.addEventListener('input', () => {
      this.joinErrorMsg.classList.add('hidden');
    });

    secretInput?.addEventListener('input', () => {
      this.joinErrorMsg.classList.add('hidden');
    });

    document.getElementById('btn-confirm-join')?.addEventListener('click', async () => {
      let roomId = roomIdInput?.value.trim() || '';
      let secret = secretInput?.value.trim() || '';
      const combinedVal = combinedInput?.value.trim() || '';

      if (combinedVal && (!roomId || !secret)) {
        const parsed = parseCombinedInviteCode(combinedVal);
        if (parsed) {
          roomId = parsed.roomId;
          secret = parsed.roomSecret;
        }
      }

      // Security check: Must have both Room ID and Secret Key
      if (!roomId || !isValidRoomId(roomId)) {
        this.joinErrorMsg.textContent = 'Please enter a valid Room ID.';
        this.joinErrorMsg.classList.remove('hidden');
        return;
      }

      if (!secret || !isValidRoomSecret(secret)) {
        this.joinErrorMsg.textContent = 'A Secret Key is required! A valley cannot be joined with only a Room ID. Please provide both Room ID and Secret Key or paste the invite link.';
        this.joinErrorMsg.classList.remove('hidden');
        return;
      }

      this.joinModal.classList.add('hidden');
      this.titleScreen.classList.add('hidden');
      this.hud.classList.remove('hidden');
      this.scene.setMode(true, false);
      this.updateHudConnection('connecting', roomId.toUpperCase());

      try {
        await Network.joinWorld(roomId, secret, 'Guest Keeper');
        this.showToast(`Connecting to valley room: ${roomId.toUpperCase()}`);
      } catch (err: any) {
        this.showToast('Failed to join room: ' + (err?.message || 'Error'));
      }
    });

    document.getElementById('btn-cancel-join')?.addEventListener('click', () => {
      this.joinModal.classList.add('hidden');
    });

    // 5. Public Worlds Dialog
    document.getElementById('btn-public-lobby')?.addEventListener('click', () => {
      SoundEffects.resume();
      this.publicWorldsModal.classList.remove('hidden');
    });

    document.getElementById('btn-close-public-rooms')?.addEventListener('click', () => {
      this.publicWorldsModal.classList.add('hidden');
    });

    // 6. Settings & Pause
    document.getElementById('btn-settings')?.addEventListener('click', () => {
      SoundEffects.resume();
      this.pauseModal.classList.remove('hidden');
    });

    document.getElementById('hud-pause-btn')?.addEventListener('click', () => {
      SoundEffects.resume();
      this.pauseModal.classList.remove('hidden');
    });

    document.getElementById('btn-resume')?.addEventListener('click', () => {
      this.pauseModal.classList.add('hidden');
    });

    document.getElementById('btn-respawn')?.addEventListener('click', () => {
      this.pauseModal.classList.add('hidden');
      this.scene.respawnLocalPlayer();
      this.showToast('Reset to Valley Checkpoint.');
    });

    document.getElementById('btn-return-title')?.addEventListener('click', async () => {
      this.pauseModal.classList.add('hidden');
      this.hud.classList.add('hidden');
      this.titleScreen.classList.remove('hidden');
      await Network.disconnect();
      this.scene.setMode(false, false);
    });

    // Audio toggles
    document.getElementById('setting-sfx')?.addEventListener('change', (e) => {
      SoundEffects.setSfxEnabled((e.target as HTMLInputElement).checked);
    });

    document.getElementById('setting-music')?.addEventListener('change', (e) => {
      SoundEffects.setAmbientEnabled((e.target as HTMLInputElement).checked);
    });

    // 7. Credits
    document.getElementById('btn-credits')?.addEventListener('click', () => {
      SoundEffects.resume();
      this.creditsModal.classList.remove('hidden');
    });

    document.getElementById('btn-close-credits')?.addEventListener('click', () => {
      this.creditsModal.classList.add('hidden');
    });

    // 8. Victory continue / return
    document.getElementById('btn-victory-continue')?.addEventListener('click', () => {
      this.victoryModal.classList.add('hidden');
    });

    document.getElementById('btn-victory-title')?.addEventListener('click', async () => {
      this.victoryModal.classList.add('hidden');
      this.hud.classList.add('hidden');
      this.titleScreen.classList.remove('hidden');
      await Network.disconnect();
      this.scene.setMode(false, false);
    });

    // 9. Host Departed Modal
    document.getElementById('btn-host-departed-title')?.addEventListener('click', async () => {
      this.hostDepartedModal.classList.add('hidden');
      this.hud.classList.add('hidden');
      this.titleScreen.classList.remove('hidden');
      await Network.disconnect();
      this.scene.setMode(false, false);
    });

    // 10. Copy invite link (copies full URL containing #key=ROOM_SECRET)
    this.hudCopyBtn.addEventListener('click', () => {
      const url = Network.getInvitationUrl();
      if (!url) return;
      navigator.clipboard?.writeText(url);
      this.showToast('Full invitation link with secret key copied to clipboard!');
    });

    // 11. Virtual Mobile Controls
    this.setupVirtualControls();

    // Scene callbacks
    this.scene.onContextPrompt = (text, key = 'E') => {
      if (text) {
        this.promptKey.textContent = key;
        this.promptLabel.textContent = text;
        this.interactionPrompt.classList.remove('hidden');
      } else {
        this.interactionPrompt.classList.add('hidden');
      }
    };

    this.scene.onVictory = () => {
      const stats = this.scene.simulation.objective;
      const elapsed = Math.round((Date.now() - stats.startTime) / 1000);
      const mins = Math.floor(elapsed / 60).toString().padStart(2, '0');
      const secs = (elapsed % 60).toString().padStart(2, '0');

      document.getElementById('stat-time')!.textContent = `${mins}:${secs}`;
      document.getElementById('stat-gates')!.textContent = stats.gatesOpenedCount.toString();
      document.getElementById('stat-debris')!.textContent = stats.debrisClearedCount.toString();

      this.victoryModal.classList.remove('hidden');
    };

    this.scene.onHostDisconnected = () => {
      this.hostDepartedModal.classList.remove('hidden');
    };
  }

  private setupVirtualControls(): void {
    const dpadButtons = document.querySelectorAll('.dpad-btn');
    dpadButtons.forEach(btn => {
      const dir = btn.getAttribute('data-dir');
      const startMove = (e: Event) => {
        e.preventDefault();
        SoundEffects.resume();
        btn.classList.add('active');
        if (dir === 'up') this.scene.touchInput.dy = -1;
        if (dir === 'down') this.scene.touchInput.dy = 1;
        if (dir === 'left') this.scene.touchInput.dx = -1;
        if (dir === 'right') this.scene.touchInput.dx = 1;
      };

      const stopMove = (e: Event) => {
        e.preventDefault();
        btn.classList.remove('active');
        if (dir === 'up' && this.scene.touchInput.dy < 0) this.scene.touchInput.dy = 0;
        if (dir === 'down' && this.scene.touchInput.dy > 0) this.scene.touchInput.dy = 0;
        if (dir === 'left' && this.scene.touchInput.dx < 0) this.scene.touchInput.dx = 0;
        if (dir === 'right' && this.scene.touchInput.dx > 0) this.scene.touchInput.dx = 0;
      };

      btn.addEventListener('touchstart', startMove, { passive: false });
      btn.addEventListener('touchend', stopMove, { passive: false });
      btn.addEventListener('mousedown', startMove);
      btn.addEventListener('mouseup', stopMove);
    });

    const actionBtn = document.getElementById('btn-touch-action');
    actionBtn?.addEventListener('touchstart', (e) => {
      e.preventDefault();
      SoundEffects.resume();
      this.scene.touchInput.interact = true;
    }, { passive: false });
    actionBtn?.addEventListener('mousedown', () => {
      SoundEffects.resume();
      this.scene.touchInput.interact = true;
    });

    const carryBtn = document.getElementById('btn-touch-carry');
    carryBtn?.addEventListener('touchstart', (e) => {
      e.preventDefault();
      SoundEffects.resume();
      this.scene.touchInput.carry = true;
    }, { passive: false });
    carryBtn?.addEventListener('mousedown', () => {
      SoundEffects.resume();
      this.scene.touchInput.carry = true;
    });
  }

  private bindNetworkEvents(): void {
    Network.onStatusChange = (status: string) => {
      if (status.includes('Active') || status.includes('Connected')) {
        this.updateHudConnection('connected', this.hudRoomLabel.textContent || 'P2P');
        this.hudCopyBtn.classList.remove('hidden');
      } else if (status.includes('Finding') || status.includes('Connecting')) {
        this.updateHudConnection('connecting', status);
      } else {
        this.updateHudConnection('offline', 'Offline');
        this.hudCopyBtn.classList.add('hidden');
      }
    };

    Network.onPlayerCountChange = (count: number) => {
      this.hudPlayerCount.textContent = `${count}/4`;
    };

    Network.onError = (errMsg) => {
      this.showToast(`P2P Network Notice: ${errMsg}`);
    };
  }

  public updateHudConnection(status: 'connected' | 'connecting' | 'offline' | 'offline_local', label: string): void {
    this.hudRoomLabel.textContent = label;
    this.hudStatusDot.className = 'hud-dot';

    if (status === 'connected') {
      // green
    } else if (status === 'connecting') {
      this.hudStatusDot.classList.add('connecting');
    } else {
      this.hudStatusDot.classList.add('offline');
    }
  }

  public showToast(message: string): void {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    this.toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.remove();
    }, 4000);
  }
}
