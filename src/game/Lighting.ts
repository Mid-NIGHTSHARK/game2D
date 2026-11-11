/**
 * Lighting.ts
 * Dynamic Subterranean Darkness Overlay, Warm Amber Lantern Cones,
 * Shuttering Stealth Mechanics, and Acoustic Sound Ring Ripples.
 * CC0 1.0 Universal Public Domain.
 */

import { MinerEntity, SoundRipple } from './Entities';

export interface LightSource {
  x: number;
  y: number;
  radius: number;
  color: string;
  intensity: number;
  angle?: number;
  fov?: number; // In radians
}

export class LightingEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private textureKey: string;
  private scene: Phaser.Scene;
  private darknessImage: Phaser.GameObjects.Image | null = null;
  public ripples: SoundRipple[] = [];

  constructor(scene: Phaser.Scene, width: number, height: number, textureKey: string = 'darkness_overlay') {
    this.scene = scene;
    this.textureKey = textureKey;
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx = this.canvas.getContext('2d')!;

    if (!scene.textures.exists(textureKey)) {
      scene.textures.addCanvas(textureKey, this.canvas);
    }
  }

  public initOverlay(width: number, height: number): Phaser.GameObjects.Image {
    this.darknessImage = this.scene.add.image(0, 0, this.textureKey);
    this.darknessImage.setOrigin(0, 0);
    this.darknessImage.setScrollFactor(0);
    this.darknessImage.setDepth(50); // Above tiles and entities, below UI
    this.resize(width, height);
    return this.darknessImage;
  }

  public resize(width: number, height: number): void {
    this.canvas.width = width;
    this.canvas.height = height;
    if (this.darknessImage) {
      this.darknessImage.setDisplaySize(width, height);
    }
  }

  /**
   * Adds an acoustic ring ripple (drawn on top of darkness to reveal noise sources)
   */
  public addSoundRipple(x: number, y: number, maxRadius: number = 70, color: number = 0xdf9e28): void {
    this.ripples.push({
      x,
      y,
      radius: 4,
      maxRadius,
      alpha: 0.9,
      color
    });
  }

  public updateRipples(dt: number): void {
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const r = this.ripples[i];
      r.radius += dt * 110;
      r.alpha = Math.max(0, 1 - r.radius / r.maxRadius);
      if (r.radius >= r.maxRadius || r.alpha <= 0.05) {
        this.ripples.splice(i, 1);
      }
    }
  }

  /**
   * Renders the darkness mask and dynamic lighting cuts
   */
  public render(
    camera: Phaser.Cameras.Scene2D.Camera,
    players: MinerEntity[],
    localPlayerId: string,
    staticLights: LightSource[],
    flashIntensity: number = 0
  ): void {
    const ctx = this.ctx;
    const width = this.canvas.width;
    const height = this.canvas.height;

    // 1. Fill base ambient darkness: Deep Basalt Void (#141316 at 0.96 opacity)
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = `rgba(20, 19, 22, ${Math.max(0, 0.96 - flashIntensity)})`;
    ctx.fillRect(0, 0, width, height);

    // 2. Cut out warm amber light sources using 'destination-out' and radial gradients
    ctx.globalCompositeOperation = 'destination-out';

    // Static sconce lights
    for (const light of staticLights) {
      const screenX = light.x - camera.scrollX;
      const screenY = light.y - camera.scrollY;

      if (screenX >= -light.radius && screenX <= width + light.radius &&
          screenY >= -light.radius && screenY <= height + light.radius) {
        const grad = ctx.createRadialGradient(screenX, screenY, 2, screenX, screenY, light.radius);
        grad.addColorStop(0, `rgba(0, 0, 0, ${light.intensity})`);
        grad.addColorStop(0.6, `rgba(0, 0, 0, ${light.intensity * 0.4})`);
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(screenX, screenY, light.radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Dynamic Player Lanterns
    for (const p of players) {
      if (p.isDead) continue;
      const screenX = p.x - camera.scrollX;
      const screenY = p.y - camera.scrollY;

      const isLocal = p.id === localPlayerId;
      const isShuttered = p.isLanternShuttered;

      // Determine lantern radius
      // When shuttered, local player sees a tiny dim circle (26px); enemies see practically nothing (6px)
      const radius = isShuttered ? (isLocal ? 28 : 8) : 135;
      const intensity = isShuttered ? (isLocal ? 0.75 : 0.3) : 1.0;

      // Radial base ambient light around miner
      const grad = ctx.createRadialGradient(screenX, screenY, 4, screenX, screenY, radius);
      grad.addColorStop(0, `rgba(0, 0, 0, ${intensity})`);
      grad.addColorStop(0.5, `rgba(0, 0, 0, ${intensity * 0.5})`);
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(screenX, screenY, radius, 0, Math.PI * 2);
      ctx.fill();

      // Forward Directional Cone (only if not shuttered)
      if (!isShuttered) {
        const coneRadius = 180;
        const fov = Math.PI * 0.42; // ~75 degrees cone
        const startAngle = p.aimAngle - fov / 2;
        const endAngle = p.aimAngle + fov / 2;

        const coneGrad = ctx.createRadialGradient(screenX, screenY, 10, screenX, screenY, coneRadius);
        coneGrad.addColorStop(0, 'rgba(0, 0, 0, 0.95)');
        coneGrad.addColorStop(0.6, 'rgba(0, 0, 0, 0.45)');
        coneGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

        ctx.fillStyle = coneGrad;
        ctx.beginPath();
        ctx.moveTo(screenX, screenY);
        ctx.arc(screenX, screenY, coneRadius, startAngle, endAngle);
        ctx.closePath();
        ctx.fill();
      }
    }

    // 3. Warm Amber Tint Layer on top of illuminated cutouts
    ctx.globalCompositeOperation = 'source-over';

    // 4. Draw Acoustic Ring Ripples directly ON TOP of the darkness
    for (const r of this.ripples) {
      const rx = r.x - camera.scrollX;
      const ry = r.y - camera.scrollY;
      if (rx >= -r.maxRadius && rx <= width + r.maxRadius &&
          ry >= -r.maxRadius && ry <= height + r.maxRadius) {
        ctx.save();
        ctx.strokeStyle = `rgba(223, 158, 40, ${r.alpha})`;
        ctx.lineWidth = 2.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc(rx, ry, r.radius, 0, Math.PI * 2);
        ctx.stroke();

        // Inner harmonic ring
        if (r.radius > 16) {
          ctx.strokeStyle = `rgba(247, 208, 96, ${r.alpha * 0.6})`;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(rx, ry, r.radius * 0.65, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    // Push updated canvas to Phaser texture
    this.scene.textures.get(this.textureKey).getSourceImage();
    const phaserTexture = this.scene.textures.get(this.textureKey);
    (phaserTexture as unknown as { update: () => void }).update?.();
  }
}
