// Procedural Web Audio Sound Engine for Rillkeepers
// Handcrafted zero-latency synthesis for crisp retro-indie tactile feedback.

class SoundEffectsEngine {
  private ctx: AudioContext | null = null;
  private sfxGain: GainNode | null = null;
  private ambientGain: GainNode | null = null;
  private ambientSource: AudioNode | null = null;
  public sfxEnabled: boolean = true;
  public ambientEnabled: boolean = true;

  constructor() {
    // AudioContext will be initialized on first user gesture
  }

  private initContext(): void {
    if (this.ctx) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioCtx();

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.setValueAtTime(0.4, this.ctx.currentTime);
      this.sfxGain.connect(this.ctx.destination);

      this.ambientGain = this.ctx.createGain();
      this.ambientGain.gain.setValueAtTime(0.15, this.ctx.currentTime);
      this.ambientGain.connect(this.ctx.destination);

      if (this.ambientEnabled) {
        this.startAmbientStream();
      }
    } catch (e) {
      console.warn('Web Audio not available:', e);
    }
  }

  public resume(): void {
    this.initContext();
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  public setSfxEnabled(enabled: boolean): void {
    this.sfxEnabled = enabled;
    if (this.sfxGain && this.ctx) {
      this.sfxGain.gain.setValueAtTime(enabled ? 0.4 : 0, this.ctx.currentTime);
    }
  }

  public setAmbientEnabled(enabled: boolean): void {
    this.ambientEnabled = enabled;
    if (this.ambientGain && this.ctx) {
      this.ambientGain.gain.setValueAtTime(enabled ? 0.15 : 0, this.ctx.currentTime);
    }
  }

  // Continuous ambient water murmur
  private startAmbientStream(): void {
    if (!this.ctx || !this.ambientGain || this.ambientSource) return;

    // Generate 2 seconds of looping brown/pink noise
    const bufferSize = this.ctx.sampleRate * 2;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    let lastOut = 0.0;

    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      output[i] = (lastOut + 0.02 * white) / 1.02;
      lastOut = output[i];
      output[i] *= 3.5;
    }

    const whiteNoise = this.ctx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;
    whiteNoise.loop = true;

    // Filter to sound like gurgling brook
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(450, this.ctx.currentTime);
    filter.Q.setValueAtTime(1.5, this.ctx.currentTime);

    whiteNoise.connect(filter);
    filter.connect(this.ambientGain);
    whiteNoise.start();
    this.ambientSource = whiteNoise;
  }

  // Soft grassy/stone footstep
  public playFootstep(): void {
    if (!this.sfxEnabled) return;
    this.resume();
    if (!this.ctx || !this.sfxGain) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(120 + Math.random() * 30, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(40, this.ctx.currentTime + 0.06);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(280, this.ctx.currentTime);

    gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.06);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.07);
  }

  // Sluice gate operation (wooden groan + iron ratchet)
  public playGateCrank(): void {
    if (!this.sfxEnabled) return;
    this.resume();
    if (!this.ctx || !this.sfxGain) return;

    const now = this.ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(320 - i * 40, now + i * 0.06);
      gain.gain.setValueAtTime(0.12, now + i * 0.06);
      gain.gain.exponentialRampToValueAtTime(0.001, now + (i + 1) * 0.06);

      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(now + i * 0.06);
      osc.stop(now + (i + 1) * 0.06);
    }
  }

  // Water splash / raft entering water
  public playSplash(): void {
    if (!this.sfxEnabled) return;
    this.resume();
    if (!this.ctx || !this.sfxGain) return;

    const bufferSize = this.ctx.sampleRate * 0.3;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    const whiteNoise = this.ctx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(900, this.ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(300, this.ctx.currentTime + 0.28);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.28);

    whiteNoise.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);

    whiteNoise.start();
  }

  // Debris cleared
  public playDebrisClear(): void {
    if (!this.sfxEnabled) return;
    this.resume();
    if (!this.ctx || !this.sfxGain) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(240, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(80, this.ctx.currentTime + 0.15);

    gain.gain.setValueAtTime(0.14, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.15);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.16);
  }

  // Waterwheel spinning sound
  public playWheelSpin(): void {
    if (!this.sfxEnabled) return;
    this.resume();
    if (!this.ctx || !this.sfxGain) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(90, this.ctx.currentTime);
    gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.12);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.13);
  }

  // Victory Fanfare / Chime
  public playVictoryFanfare(): void {
    if (!this.sfxEnabled) return;
    this.resume();
    if (!this.ctx || !this.sfxGain) return;

    // Harmonic pentatonic arpeggio: C4, E4, G4, B4, C5, E5
    const notes = [261.63, 329.63, 392.00, 493.88, 523.25, 659.25];
    const now = this.ctx.currentTime;

    notes.forEach((freq, idx) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.12);

      gain.gain.setValueAtTime(0.18, now + idx * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.12 + 0.6);

      osc.connect(gain);
      gain.connect(this.sfxGain!);
      osc.start(now + idx * 0.12);
      osc.stop(now + idx * 0.12 + 0.65);
    });
  }
}

export const SoundEffects = new SoundEffectsEngine();
