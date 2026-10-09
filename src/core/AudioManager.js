/**
 * AudioManager Module
 * Combines Web Audio API procedural synthesis with support for preloaded audio files.
 * Pre-computes all noise and audio buffers ahead of time to eliminate audio thread lag spikes
 * during combat, shooting, grenade throwing, sliding, and medkit use.
 */
export class AudioManager {
  constructor() {
    this.ctx = null;
    this.soundBuffers = new Map();
    this.precomputedBuffers = new Map();
    this.masterGain = null;
    this.initialized = false;
    this.bgm = null;
    this.bgmVolume = 0.45;
    this.sfxVolume = 0.50;
    this.isMuted = false;
    this.bgmMuted = false;
    this.sfxMuted = false;
  }

  init() {
    if (this.initialized && this.ctx) {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return;
    }

    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;

      this.ctx = new AudioContextClass();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.sfxVolume, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);
      this.initialized = true;

      // Pre-compute noise buffers once so hot gameplay loops never allocate audio memory
      this.initPrecomputedBuffers();

      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
    } catch (e) {
      console.warn('[AudioManager] Web Audio API not supported:', e);
    }
  }

  ensureContext() {
    if (!this.initialized) {
      this.init();
    } else if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  /**
   * Pre-generates all noise curves once so zero CPU loops run during action
   */
  initPrecomputedBuffers() {
    if (!this.ctx) return;
    const sampleRate = this.ctx.sampleRate;

    // 1. Grenade throw whoosh buffer
    const throwLen = Math.floor(sampleRate * 0.15);
    const throwBuf = this.ctx.createBuffer(1, throwLen, sampleRate);
    const throwData = throwBuf.getChannelData(0);
    for (let i = 0; i < throwLen; i++) {
      throwData[i] = (Math.random() * 2 - 1) * Math.sin((i / throwLen) * Math.PI);
    }
    this.precomputedBuffers.set('throw', throwBuf);

    // 2. Rifle crack buffer
    const gunLen = Math.floor(sampleRate * 0.08);
    const gunBuf = this.ctx.createBuffer(1, gunLen, sampleRate);
    const gunData = gunBuf.getChannelData(0);
    for (let i = 0; i < gunLen; i++) {
      gunData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (sampleRate * 0.02));
    }
    this.precomputedBuffers.set('gunshot', gunBuf);

    // 3. Pistol crack buffer
    const pistolLen = Math.floor(sampleRate * 0.05);
    const pistolBuf = this.ctx.createBuffer(1, pistolLen, sampleRate);
    const pistolData = pistolBuf.getChannelData(0);
    for (let i = 0; i < pistolLen; i++) {
      pistolData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (sampleRate * 0.012));
    }
    this.precomputedBuffers.set('pistol', pistolBuf);

    // 4. Slide friction noise buffer
    const slideLen = Math.floor(sampleRate * 0.45);
    const slideBuf = this.ctx.createBuffer(1, slideLen, sampleRate);
    const slideData = slideBuf.getChannelData(0);
    for (let i = 0; i < slideLen; i++) {
      const progress = i / slideLen;
      slideData[i] = (Math.random() * 2 - 1) * Math.sin(progress * Math.PI) * Math.exp(-progress * 2.5);
    }
    this.precomputedBuffers.set('slide', slideBuf);

    // 5. Laser sizzle noise buffer
    const laserLen = Math.floor(sampleRate * 0.08);
    const laserBuf = this.ctx.createBuffer(1, laserLen, sampleRate);
    const laserData = laserBuf.getChannelData(0);
    for (let i = 0; i < laserLen; i++) {
      laserData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (sampleRate * 0.02));
    }
    this.precomputedBuffers.set('laser', laserBuf);
  }

  /**
   * Preload external audio files (e.g. grenade.mp3)
   */
  async loadSound(name, url) {
    this.ensureContext();
    if (!this.ctx) return;
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
      this.soundBuffers.set(name, audioBuffer);
    } catch (err) {
      console.warn(`[AudioManager] Failed to load sound "${name}" from ${url}:`, err);
    }
  }

  playBuffer(name, volume = 1.0) {
    if (this.isMuted || this.sfxMuted) return;
    this.ensureContext();
    if (!this.ctx) return;
    const buffer = this.soundBuffers.get(name);
    if (!buffer) return;

    try {
      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      const gain = this.ctx.createGain();
      gain.gain.value = volume;
      source.connect(gain);
      gain.connect(this.masterGain);
      source.start();
    } catch (e) {}
  }

  playPrecomputed(name, volume = 1.0, filterSetup = null) {
    if (this.isMuted || this.sfxMuted) return;
    this.ensureContext();
    if (!this.ctx) return;
    const buffer = this.precomputedBuffers.get(name);
    if (!buffer) return;

    try {
      const source = this.ctx.createBufferSource();
      source.buffer = buffer;

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(volume, this.ctx.currentTime);

      if (filterSetup) {
        filterSetup(source, gain, this.ctx.currentTime);
      } else {
        source.connect(gain);
      }

      gain.connect(this.masterGain);
      source.start();
    } catch (e) {}
  }

  setSfxVolume(vol) {
    this.sfxVolume = Math.max(0, Math.min(1.0, vol));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime((this.isMuted || this.sfxMuted) ? 0 : this.sfxVolume, this.ctx.currentTime);
    }
  }

  setBgmVolume(vol) {
    this.bgmVolume = Math.max(0, Math.min(1.0, vol));
    if (this.bgm) {
      this.bgm.volume = (this.isMuted || this.bgmMuted) ? 0 : this.bgmVolume;
    }
  }

  toggleBGM() {
    this.bgmMuted = !this.bgmMuted;
    if (this.bgm) {
      this.bgm.volume = (this.isMuted || this.bgmMuted) ? 0 : this.bgmVolume;
    }
    return !this.bgmMuted;
  }

  toggleSFX() {
    this.sfxMuted = !this.sfxMuted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime((this.isMuted || this.sfxMuted) ? 0 : this.sfxVolume, this.ctx.currentTime);
    }
    return !this.sfxMuted;
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    this.setSfxVolume(this.sfxVolume);
    this.setBgmVolume(this.bgmVolume);
    return this.isMuted;
  }

  playBGM(url, volume = 0.45) {
    this.bgmVolume = volume;
    if (!this.bgm) {
      this.bgm = new Audio(url);
      this.bgm.loop = true;
    } else if (this.bgm.src !== url && !this.bgm.src.endsWith(url)) {
      this.bgm.src = url;
    }

    this.bgm.volume = (this.isMuted || this.bgmMuted) ? 0 : this.bgmVolume;

    if (this.bgm.paused && !this.bgmMuted && !this.isMuted) {
      const playPromise = this.bgm.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => {});
      }
    }
  }

  pauseBGM() {
    if (this.bgm && !this.bgm.paused) {
      this.bgm.pause();
    }
  }

  stopBGM() {
    if (this.bgm) {
      this.bgm.pause();
      this.bgm.currentTime = 0;
    }
  }

  resumeBGM() {
    if (this.bgm && this.bgm.paused) {
      const playPromise = this.bgm.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => {});
      }
    }
  }

  playGunshot() {
    if (this.isMuted || this.sfxMuted) return;
    this.ensureContext();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    // 1. Noise crack (instant from precomputed buffer)
    this.playPrecomputed('gunshot', 0.7, (source, gain, t) => {
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1400, t);
      filter.Q.setValueAtTime(1.2, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.08);

      source.connect(filter);
      filter.connect(gain);
    });

    // 2. Punchy low-end thud
    try {
      const osc = this.ctx.createOscillator();
      const oscGain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(160, now);
      osc.frequency.exponentialRampToValueAtTime(35, now + 0.09);

      oscGain.gain.setValueAtTime(0.6, now);
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

      osc.connect(oscGain);
      oscGain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.09);
    } catch (e) {}
  }

  playPistolShot() {
    if (this.isMuted || this.sfxMuted) return;
    this.ensureContext();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    this.playPrecomputed('pistol', 0.65, (source, gain, t) => {
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.setValueAtTime(1800, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.05);

      source.connect(filter);
      filter.connect(gain);
    });

    try {
      const osc = this.ctx.createOscillator();
      const oscGain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(260, now);
      osc.frequency.exponentialRampToValueAtTime(60, now + 0.06);

      oscGain.gain.setValueAtTime(0.55, now);
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

      osc.connect(oscGain);
      oscGain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.06);
    } catch (e) {}
  }

  playEmptyClick() {
    if (this.isMuted || this.sfxMuted) return;
    this.ensureContext();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(950, now);
      osc.frequency.exponentialRampToValueAtTime(300, now + 0.03);

      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.03);
    } catch (e) {}
  }

  playReloadSound() {
    if (this.isMuted || this.sfxMuted) return;
    this.ensureContext();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    try {
      const osc1 = this.ctx.createOscillator();
      const g1 = this.ctx.createGain();
      osc1.frequency.setValueAtTime(320, now);
      osc1.frequency.exponentialRampToValueAtTime(180, now + 0.08);
      g1.gain.setValueAtTime(0.3, now);
      g1.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      osc1.connect(g1);
      g1.connect(this.masterGain);
      osc1.start(now);
      osc1.stop(now + 0.08);

      const t2 = now + 0.55;
      const osc2 = this.ctx.createOscillator();
      const g2 = this.ctx.createGain();
      osc2.frequency.setValueAtTime(450, t2);
      osc2.frequency.exponentialRampToValueAtTime(650, t2 + 0.08);
      g2.gain.setValueAtTime(0.4, t2);
      g2.gain.exponentialRampToValueAtTime(0.001, t2 + 0.08);
      osc2.connect(g2);
      g2.connect(this.masterGain);
      osc2.start(t2);
      osc2.stop(t2 + 0.08);
    } catch (e) {}
  }

  playMedkitUse() {
    if (this.isMuted || this.sfxMuted) return;
    this.ensureContext();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    [261.63, 329.63, 392.00, 523.25].forEach((freq, idx) => {
      try {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const startT = now + idx * 0.08;

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, startT);

        gain.gain.setValueAtTime(0.25, startT);
        gain.gain.exponentialRampToValueAtTime(0.001, startT + 0.35);

        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(startT);
        osc.stop(startT + 0.35);
      } catch (e) {}
    });
  }

  playGrenadeThrow() {
    if (this.isMuted || this.sfxMuted) return;
    this.ensureContext();
    if (!this.ctx) return;

    // Instant playback from pre-allocated buffer
    this.playPrecomputed('throw', 0.45, (source, gain, t) => {
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(400, t);
      filter.frequency.exponentialRampToValueAtTime(1200, t + 0.15);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.15);

      source.connect(filter);
      filter.connect(gain);
    });
  }

  playGrenadeExplosion() {
    if (this.isMuted || this.sfxMuted) return;
    if (this.soundBuffers.has('grenade')) {
      this.playBuffer('grenade', 0.85);
      return;
    }

    this.ensureContext();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(120, now);
      osc.frequency.exponentialRampToValueAtTime(25, now + 0.7);

      gain.gain.setValueAtTime(0.8, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.7);
    } catch (e) {}
  }

  playPickup() {
    if (this.isMuted || this.sfxMuted) return;
    this.ensureContext();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(587.33, now);
      osc.frequency.setValueAtTime(880.00, now + 0.08);

      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.25);
    } catch (e) {}
  }

  playEnemyHit() {
    if (this.isMuted || this.sfxMuted) return;
    this.ensureContext();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.linearRampToValueAtTime(110, now + 0.07);

      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.07);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.07);
    } catch (e) {}
  }

  playEnemyDeath() {
    if (this.isMuted || this.sfxMuted) return;
    if (this.soundBuffers.has('grenade')) {
      this.playBuffer('grenade', 0.5);
      return;
    }

    this.ensureContext();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(280, now);
      osc.frequency.exponentialRampToValueAtTime(40, now + 0.35);

      gain.gain.setValueAtTime(0.5, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.35);
    } catch (e) {}
  }

  playPlayerHurt() {
    if (this.isMuted || this.sfxMuted) return;
    this.ensureContext();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(140, now);
      osc.frequency.exponentialRampToValueAtTime(60, now + 0.15);

      gain.gain.setValueAtTime(0.5, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.15);
    } catch (e) {}
  }

  playJump() {
    if (this.isMuted || this.sfxMuted) return;
    this.ensureContext();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(140, now);
      osc.frequency.exponentialRampToValueAtTime(360, now + 0.14);

      gain.gain.setValueAtTime(0.28, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.14);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.14);
    } catch (e) {}
  }

  playLaserZap() {
    if (this.isMuted || this.sfxMuted) return;
    this.ensureContext();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    try {
      const osc = this.ctx.createOscillator();
      const oscGain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(750, now);
      osc.frequency.exponentialRampToValueAtTime(160, now + 0.12);

      oscGain.gain.setValueAtTime(0.35, now);
      oscGain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);

      osc.connect(oscGain);
      oscGain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.12);
    } catch (e) {}

    this.playPrecomputed('laser', 0.4, (source, gain, t) => {
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.setValueAtTime(2400, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.08);

      source.connect(filter);
      filter.connect(gain);
    });
  }

  playSlide() {
    if (this.isMuted || this.sfxMuted) return;
    this.ensureContext();
    if (!this.ctx) return;

    this.playPrecomputed('slide', 0.42, (source, gain, t) => {
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(800, t);
      filter.frequency.exponentialRampToValueAtTime(350, t + 0.45);
      filter.Q.setValueAtTime(1.8, t);
      gain.gain.exponentialRampToValueAtTime(0.005, t + 0.45);

      source.connect(filter);
      filter.connect(gain);
    });
  }
}
