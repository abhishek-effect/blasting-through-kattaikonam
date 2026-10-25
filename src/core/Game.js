/**
 * Game Core Module
 * Ties together:
 * - Deterministic data-driven level generation (Floor 1)
 * - 3-Slot Inventory (Rifle, Pistol, Medkit)
 * - Grenade throwing & drop pickups
 * - Elevator photocopy progression
 * - Instance-based enemy spawning
 * - Heads-Up Display and Unified Controls
 */
import * as THREE from 'three';
import { GameState, STATES, GAME_MODES } from './GameState.js';
import { AudioManager } from './AudioManager.js';
import { InputManager } from './InputManager.js';
import { level1Data } from '../level/level1Data.js';
import { LevelGenerator } from '../level/LevelGenerator.js';
import { InteractionSystem } from '../interactive/InteractionSystem.js';
import { Player } from '../player/Player.js';
import { Rifle } from '../weapon/Rifle.js';
import { Pistol } from '../weapon/Pistol.js';
import { Medkit } from '../weapon/Medkit.js';
import { GrenadeManager } from '../weapon/GrenadeManager.js';
import { EnemySpawner } from '../enemy/EnemySpawner.js';
import { LaserManager } from '../interactive/LaserObstacle.js';
import { HUD } from '../ui/HUD.js';
import { ASSET_PATHS, preloadAllAssets } from '../config/assets.js';
import { EvadeGame } from '../evade/EvadeGame.js';
import { BattleGame } from '../battle/BattleGame.js';
import { ShootProgression } from './ShootProgression.js';
import { SurvivalMode } from './SurvivalMode.js';

export class Game {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.hudContainer = document.getElementById('hud');

    // 1. Setup Three.js Scene, Camera & Renderer
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0e0e14);
    this.scene.fog = new THREE.FogExp2(0x0e0e14, 0.018);

    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      120
    );
    this.scene.add(this.camera);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: false,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    const maxDpr = ('ontouchstart' in window || navigator.maxTouchPoints > 0) ? 1.25 : 1.5;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxDpr));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    // 2. Instantiate Systems
    this.gameState = new GameState();
    this.audio = new AudioManager();
    this.input = new InputManager(this.canvas, this.hudContainer, this.gameState);

    // Build Deterministic Data-Driven Level
    this.level = new LevelGenerator(this.scene, level1Data, this.audio);

    // Grenade System
    this.grenadeManager = new GrenadeManager(this.scene, this.level, this.audio);

    // Player Controller
    this.player = new Player(this.camera, this.level, this.input, this.audio, this.gameState);

    // Weapons & Equipment
    this.rifle = new Rifle(this.camera, this.scene, this.audio);
    this.pistol = new Pistol(this.camera, this.scene, this.audio);
    this.medkit = new Medkit(this.camera, this.scene, this.audio);
    this.player.setInventory([this.rifle, this.pistol, this.medkit]);

    // Instance-based Enemy Spawner
    this.enemySpawner = new EnemySpawner(
      this.scene,
      this.level,
      this.audio,
      this.gameState,
      this.grenadeManager
    );

    // HUD & Interaction System (pass audio for toggle controls)
    this.hud = new HUD(this.gameState, this.input, this.audio);
    this.hud.setPlayer(this.player);
    this.hud.setCamera(this.camera);
    this.interactionSystem = new InteractionSystem(this.level, this.hud, this.enemySpawner);

    this.grenadeManager.onEnemyDamaged = (enemy, dmg, isCrit, pos) => {
      if (this.hud && this.hud.showDamageNumber) {
        this.hud.showDamageNumber(enemy, dmg, isCrit, pos);
      }
    };

    // Laser Obstacle Trap System
    this.laserManager = new LaserManager(this.scene, this.audio, level1Data.lasers || []);

    // Player Notification Callback
    this.player.onPickupNotification = (msg) => {
      this.hud.showNotification(msg);
    };

    // Player Damage Callback for outer border flash & directional damage indicator
    this.player.onDamageTaken = (amount, sourcePos) => {
      this.hud.triggerDamageFlash(sourcePos, this.player);
    };

    // Evade Multiplayer Mode Subsystem
    this.evadeGame = new EvadeGame(
      this.scene,
      this.camera,
      this.level,
      this.player,
      this.input,
      this.audio,
      this.gameState
    );

    // Battle Multiplayer Mode Subsystem
    this.battleGame = new BattleGame(
      this.scene,
      this.camera,
      this.level,
      this.player,
      this.input,
      this.audio,
      this.gameState
    );

    this.clock = new THREE.Clock();

    // Progression & Objectives Subsystem (Confront Mode)
    window.__game = this;
    this.shootProgression = new ShootProgression(this);
    this.survivalMode = new SurvivalMode(this);

    // 3. Setup Listeners
    this.initListeners();

    // 4. Initial Spawning from Predefined Zones (reduced on mobile)
    this.enemySpawner.spawnLevelEnemies(level1Data.spawnZones, this.input.isTouchDevice);

    // 5. Preload All Assets & Warm Up Shaders
    this.initPreloadAndIntro();
  }

  async initPreloadAndIntro() {
    this.gameState.setState(STATES.INTRO);

    const devSplash = document.getElementById('dev-splash-screen');
    const introScreen = document.getElementById('intro-screen');

    if (devSplash) {
      devSplash.classList.remove('hidden');
      devSplash.style.opacity = '1';
    }
    if (introScreen) {
      introScreen.classList.add('hidden');
    }

    // Resume AudioContext on first user interaction in case autoplay policy requires gesture
    const handleGesture = () => {
      if (this.audio) this.audio.ensureContext();
    };
    window.addEventListener('pointerdown', handleGesture, { once: true });
    window.addEventListener('keydown', handleGesture, { once: true });

    // Step 1: Preload crucial splash audio buffers first
    try {
      await Promise.all([
        this.audio.loadSound('reload', ASSET_PATHS.audio.reload),
        this.audio.loadSound('kill-2', ASSET_PATHS.audio.kills[1]),
      ]);
    } catch (e) {
      console.warn('[Game] Splash audio load error:', e);
    }

    // Play reload audio buffer while displaying dev-logo
    if (this.audio) {
      this.audio.ensureContext();
      this.audio.playBuffer('reload', 1.0);
    }

    // Wait ~1.25s for reload audio
    await new Promise((resolve) => setTimeout(resolve, 1250));

    // Play kill-2 audio buffer
    if (this.audio) {
      this.audio.playBuffer('kill-2', 1.0);
    }

    // Trigger screen shake transition effect
    const container = document.getElementById('game-container') || document.body;
    if (container) {
      container.classList.remove('screen-shake');
      void container.offsetWidth;
      container.classList.add('screen-shake');
      setTimeout(() => container.classList.remove('screen-shake'), 600);
    }

    // Fade out dev splash and transition to loading screen
    if (devSplash) {
      devSplash.style.opacity = '0';
      await new Promise((resolve) => setTimeout(resolve, 380));
      devSplash.classList.add('hidden');
    }
    if (introScreen) {
      introScreen.classList.remove('hidden');
    }

    // Step 2: Preload remaining audio buffers in background
    try {
      await Promise.all([
        this.audio.loadSound('grenade', ASSET_PATHS.audio.grenade),
        this.audio.loadSound('kill-1', ASSET_PATHS.audio.kills[0]),
        this.audio.loadSound('kill-3', ASSET_PATHS.audio.kills[2]),
        this.audio.loadSound('combo-1', ASSET_PATHS.audio.combos[0]),
        this.audio.loadSound('combo-2', ASSET_PATHS.audio.combos[1]),
      ]);
    } catch (e) {
      console.warn('[Game] Audio preload warning:', e);
    }

    // Step 3: Preload All Textures & Precompute Metrics
    await preloadAllAssets((progress, msg) => {
      this.hud.updateIntroLoading(progress * 0.85, msg);
    });

    // Step 4: Warm Up WebGL Shaders (Viewmodels & Explosion pool)
    this.hud.updateIntroLoading(0.92, 'WARMING UP GRAPHICS ENGINE...');
    this.warmupShaders();

    // Step 5: Finish Intro Loading
    this.hud.updateIntroLoading(1.0, 'SYSTEMS ONLINE');
    this.hud.finishIntroLoading(() => {
      const urlParams = new URLSearchParams(window.location.search);
      const roomParam = urlParams.get('room');
      const battleParam = urlParams.get('battle_room');
      if (battleParam) {
        this.launchMode(GAME_MODES.BATTLE);
      } else if (roomParam) {
        this.launchMode(GAME_MODES.PLAY);
      } else {
        this.gameState.setState(STATES.MENU);
      }
    });
  }

  warmupShaders() {
    try {
      // Make all viewmodel groups and arms temporarily visible to compile shaders upfront
      if (this.rifle.viewmodelGroup) this.rifle.viewmodelGroup.visible = true;
      if (this.pistol.viewmodelGroup) this.pistol.viewmodelGroup.visible = true;
      if (this.medkit.viewmodelGroup) this.medkit.viewmodelGroup.visible = true;
      if (this.rifle.mesh) this.rifle.mesh.visible = true;
      if (this.pistol.mesh) this.pistol.mesh.visible = true;
      if (this.medkit.mesh) this.medkit.mesh.visible = true;

      if (this.shootProgression) {
        if (this.shootProgression.keyItem && this.shootProgression.keyItem.viewmodelGroup) {
          this.shootProgression.keyItem.viewmodelGroup.visible = true;
        }
        if (this.shootProgression.vernierItem && this.shootProgression.vernierItem.viewmodelGroup) {
          this.shootProgression.vernierItem.viewmodelGroup.visible = true;
        }
      }

      if (this.grenadeManager && this.grenadeManager.explosionPool) {
        this.grenadeManager.explosionPool.forEach((item) => {
          item.sphere.visible = true;
          item.ring.visible = true;
          item.light.visible = true;
          item.light.intensity = 0;
        });
      }

      // Compile all materials against current scene lighting and fog
      this.renderer.compile(this.scene, this.camera);

      // Restore initial slot visibility
      if (this.shootProgression) {
        if (this.shootProgression.keyItem && this.shootProgression.keyItem.viewmodelGroup) {
          this.shootProgression.keyItem.viewmodelGroup.visible = false;
        }
        if (this.shootProgression.vernierItem && this.shootProgression.vernierItem.viewmodelGroup) {
          this.shootProgression.vernierItem.viewmodelGroup.visible = false;
        }
      }

      if (this.grenadeManager && this.grenadeManager.explosionPool) {
        this.grenadeManager.explosionPool.forEach((item) => {
          item.sphere.visible = false;
          item.ring.visible = false;
          item.light.visible = true;
          item.light.intensity = 0;
        });
      }
      this.player.switchSlot(0);
    } catch (e) {
      console.warn('[Game] Shader warmup encountered non-fatal error:', e);
    }
  }

  initListeners() {
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      const maxDpr = ('ontouchstart' in window || navigator.maxTouchPoints > 0) ? 1.25 : 1.5;
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxDpr));
    });

    let wasPointerLocked = false;
    document.addEventListener('pointerlockchange', () => {
      const isNowLocked = document.pointerLockElement === this.canvas;
      this.input.isPointerLocked = isNowLocked;

      // Only pause if pointer lock was actively engaged and then lost (e.g. pressed Escape)
      if (
        wasPointerLocked &&
        !isNowLocked &&
        this.gameState.current === STATES.PLAYING &&
        !this.input.isTouchDevice
      ) {
        this.gameState.setState(STATES.PAUSED);
      }
      wasPointerLocked = isNowLocked;
    });

    this.canvas.addEventListener('click', () => {
      if (this.hud && this.hud.requestFullscreen) {
        this.hud.requestFullscreen();
      }
      if (this.gameState.current === STATES.PAUSED) {
        this.gameState.setState(STATES.PLAYING);
        this.input.requestPointerLock();
      } else if (this.gameState.current === STATES.PLAYING) {
        this.input.requestPointerLock();
      }
    });

    this.input.onPauseRequested = () => {
      if (this.gameState.current === STATES.PLAYING) {
        this.gameState.setState(STATES.PAUSED);
      } else if (this.gameState.current === STATES.PAUSED) {
        this.gameState.setState(STATES.PLAYING);
        this.input.requestPointerLock();
      } else if (this.gameState.current === STATES.OPTIONS || this.gameState.current === STATES.CREDITS) {
        this.gameState.setState(this.hud.previousState || STATES.MENU);
      }
    };

    this.gameState.on('restartGame', (data) => {
      const mode = (data && data.mode) ? data.mode : this.gameState.currentMode;
      const fromCheckpoint = !!(data && data.fromCheckpoint);
      this.restart(mode, fromCheckpoint);
    });

    this.gameState.on('startMode', (data) => {
      const mode = (data && data.mode) ? data.mode : (typeof data === 'string' ? data : GAME_MODES.CONFRONT);
      const options = (typeof data === 'object') ? data : {};
      this.launchMode(mode, options);
    });

    this.gameState.on('leaveRoom', () => {
      if (this.battleGame && this.battleGame.isActive) {
        this.battleGame.stop();
      }
      if (this.evadeGame && this.evadeGame.isActive) {
        this.evadeGame.leaveRoom();
      } else {
        this.gameState.hasActiveSession = false;
        this.gameState.setState(STATES.MENU);
      }
    });

    this.gameState.on('stateChange', ({ newState }) => {
      if (newState === STATES.PLAYING) {
        if (this.battleGame && this.battleGame.isActive) {
          this.audio.playBGM(ASSET_PATHS.audio.metalBgm, 0.45);
        } else if (!this.evadeGame || !this.evadeGame.isActive) {
          this.audio.playBGM(ASSET_PATHS.audio.metalBgm, 0.45);
        } else {
          this.audio.playBGM(ASSET_PATHS.audio.bladeVoidBgm, 0.45);
        }
      } else {
        if (this.input && this.input.releasePointerLock) {
          this.input.releasePointerLock();
        }
        if (newState === STATES.GAME_OVER) {
          this.audio.stopBGM();
          if (this.survivalMode && this.survivalMode.isActive) {
            this.survivalMode.onPlayerDeath();
          }
        } else if (newState === STATES.VICTORY) {
          this.audio.stopBGM();
        } else if (newState === STATES.PAUSED) {
          this.audio.pauseBGM();
        } else if (newState === STATES.MENU) {
          this.audio.pauseBGM();
          if (this.battleGame && this.battleGame.isActive) {
            this.battleGame.stop();
          }
          if (this.evadeGame && this.evadeGame.isActive) {
            this.evadeGame.stop();
          }
          if (this.survivalMode) {
            this.survivalMode.stop();
          }
          document.body.classList.remove('evade-mode');
          this.gameState.hasActiveSession = false;
        }
      }
    });
  }

  launchMode(mode, options = {}) {
    this.audio.ensureContext();
    this.gameState.currentMode = mode;

    if (mode === GAME_MODES.PLAY) {
      // --- PLAY (EVADE MULTIPLAYER MODE) ---
      if (this.battleGame) {
        this.battleGame.stop();
      }
      if (this.evadeGame) {
        this.evadeGame.stop();
      }
      if (this.survivalMode) {
        this.survivalMode.stop();
      }
      this.enemySpawner.clear();
      if (this.laserManager) {
        this.laserManager.clear();
      }
      if (this.player.setWeaponsVisible) {
        this.player.setWeaponsVisible(false);
      }
      document.body.classList.add('evade-mode');

      this.evadeGame.openLobby();
      this.hud.showNotification('▶ MODE: EVADE', 3.0);
    } else if (mode === GAME_MODES.BATTLE) {
      // --- BATTLE (MULTIPLAYER DEATHMATCH MODE) ---
      if (this.evadeGame) {
        this.evadeGame.stop();
      }
      if (this.survivalMode) {
        this.survivalMode.stop();
      }
      this.enemySpawner.clear();
      if (this.laserManager) {
        this.laserManager.clear();
      }
      if (this.player.setWeaponsVisible) {
        this.player.setWeaponsVisible(true);
      }
      document.body.classList.remove('evade-mode');

      this.battleGame.openLobby();
      this.hud.showNotification('⚔️ MODE: BATTLE (MULTIPLAYER)', 3.0);
    } else {
      // --- CONFRONT MODE (CAMPAIGN OR SURVIVAL) ---
      document.body.classList.remove('evade-mode');
      if (this.battleGame) {
        this.battleGame.stop();
      }
      if (this.evadeGame) {
        this.evadeGame.stop();
      }
      if (this.player.setWeaponsVisible) {
        this.player.setWeaponsVisible(true);
      }

      const subMode = options.subMode || this.gameState.confrontSubMode || 'campaign';
      this.gameState.confrontSubMode = subMode;

      if (subMode === 'survival') {
        this.gameState.currentMode = GAME_MODES.CONFRONT_SURVIVAL;
        if (this.shootProgression) {
          this.shootProgression.reset();
        }
        this.restartConfrontBase();
        this.survivalMode.start(options.playerName);
      } else {
        this.gameState.currentMode = GAME_MODES.CONFRONT_CAMPAIGN;
        if (this.survivalMode) {
          this.survivalMode.stop();
        }
        if (this.level && this.level.doors) {
          this.level.doors.forEach((d) => {
            d.setOpen(false);
            d.isLocked = (d.id === 'door_nw_lock' || d.id === 'door_locked_room');
          });
        }
        this.restart('campaign', options.fromCheckpoint);
        this.hud.showNotification('💥 MODE: CONFRONT (CAMPAIGN)', 3.0);
      }
    }
  }

  restartConfrontBase() {
    const startPos = new THREE.Vector3(
      level1Data.playerStart.x,
      level1Data.playerStart.y,
      level1Data.playerStart.z
    );
    this.player.reset(startPos);
    this.rifle.reset();
    this.pistol.reset();
    this.medkit.reset();
    this.player.switchSlot(0);
    this.grenadeManager.reset();

    if (this.laserManager) {
      this.laserManager.clear();
    }
    this.enemySpawner.clear();
    this.gameState.reset(0);
    this.audio.playBGM(ASSET_PATHS.audio.metalBgm, 0.45);
    this.input.requestPointerLock();
  }

  restart(mode = null, fromCheckpoint = false) {
    if (mode) {
      this.gameState.currentMode = mode;
    }
    this.audio.ensureContext();

    if (this.gameState.currentMode === GAME_MODES.PLAY) {
      if (this.evadeGame) {
        this.evadeGame.startMatch(this.evadeGame.remotePlayers.size === 0);
      }
      return;
    }

    document.body.classList.remove('evade-mode');
    if (this.evadeGame) {
      this.evadeGame.stop();
    }
    if (this.player.setWeaponsVisible) {
      this.player.setWeaponsVisible(true);
    }

    let checkpointData = null;
    if (fromCheckpoint) {
      try {
        const raw = localStorage.getItem('kattaikonam_checkpoint');
        if (raw) checkpointData = JSON.parse(raw);
      } catch (e) {
        console.warn('[Game] Could not parse checkpoint data:', e);
      }
    }

    if (checkpointData && checkpointData.player) {
      const cpPos = new THREE.Vector3(
        checkpointData.player.position.x,
        this.player.standHeight,
        checkpointData.player.position.z
      );
      this.player.reset(cpPos, checkpointData.player.yaw || 0);
      this.player.health = 100;
      this.player.penDriveCount = checkpointData.player.penDriveCount || 0;
      this.player.hasPenDrive = this.player.penDriveCount > 0;

      this.rifle.reset();
      this.rifle.ammoInMag = checkpointData.player.rifleAmmoInMag || 30;
      this.rifle.reserveAmmo = Math.max(60, checkpointData.player.rifleReserveAmmo || 90);

      this.pistol.reset();
      this.pistol.ammoInMag = checkpointData.player.pistolAmmoInMag || 12;
      this.pistol.reserveAmmo = Math.max(24, checkpointData.player.pistolReserveAmmo || 36);

      this.medkit.reset();
      this.medkit.count = Math.max(2, checkpointData.player.medkitCount || 2);

      this.grenadeManager.reset();
      this.grenadeManager.grenades = Math.max(2, checkpointData.player.grenades || 2);

      this.player.switchSlot(0);

      if (this.level && this.level.resetSeminarGate) {
        this.level.resetSeminarGate();
      }
      if (this.level && this.level.doors) {
        this.level.doors.forEach((d) => {
          d.setOpen(false);
          d.isLocked = (d.id === 'door_nw_lock' || d.id === 'door_locked_room');
        });
      }

      this.enemySpawner.clear();
      if (this.laserManager) {
        this.laserManager.initLasers(level1Data.lasers || []);
      }

      if (this.shootProgression) {
        this.shootProgression.reset();
        this.shootProgression.loadCheckpointState(checkpointData);
      }

      this.gameState.reset(0);
      this.gameState.setState(STATES.PLAYING);
      this.audio.playBGM(ASSET_PATHS.audio.metalBgm, 0.45);
      this.input.requestPointerLock();
      this.hud.showNotification(`💾 RESUMED FROM CHECKPOINT: ${checkpointData.checkpointName.toUpperCase()}!`, 4.5);
      return;
    }

    const startPos = new THREE.Vector3(
      level1Data.playerStart.x,
      level1Data.playerStart.y,
      level1Data.playerStart.z
    );
    this.player.reset(startPos);

    this.rifle.reset();
    this.pistol.reset();
    this.medkit.reset();
    this.player.switchSlot(0);

    this.grenadeManager.reset();
    if (this.level && this.level.resetSeminarGate) {
      this.level.resetSeminarGate();
    }
    if (this.level && this.level.doors) {
      this.level.doors.forEach((d) => {
        d.setOpen(false);
        d.isLocked = (d.id === 'door_nw_lock' || d.id === 'door_locked_room');
      });
    }
    this.enemySpawner.spawnLevelEnemies(level1Data.spawnZones, this.input.isTouchDevice);
    if (this.laserManager) {
      this.laserManager.initLasers(level1Data.lasers || []);
    }

    if (this.shootProgression) {
      this.shootProgression.reset();
    }

    this.gameState.reset(0);
    this.audio.playBGM(ASSET_PATHS.audio.metalBgm, 0.45);
    this.input.requestPointerLock();
  }

  start() {
    this.renderer.setAnimationLoop(() => this.update());
  }

  update() {
    const rawDelta = this.clock.getDelta();
    const deltaTime = Math.min(rawDelta, 0.1);

    const isEvade = this.evadeGame && this.evadeGame.isActive;
    const isBattle = this.battleGame && this.battleGame.isActive;

    if (isEvade) {
      // --- EVADE MULTIPLAYER MODE ---
      // Player updates when actively playing
      if (this.gameState.isPlaying()) {
        this.player.update(deltaTime);
      }
      // Evade match & voting phase MUST tick continuously, even if menu is open
      this.evadeGame.update(deltaTime);
      if (this.level && this.level.update) {
        this.level.update(deltaTime, this.player.position);
      }
      this.interactionSystem.update(this.player, this.input);
    } else if (isBattle) {
      // --- BATTLE (MULTIPLAYER DEATHMATCH MODE) ---
      if (this.gameState.isPlaying()) {
        const slotChange = this.input.checkAndConsumeSlotChange ? this.input.checkAndConsumeSlotChange() : null;
        if (slotChange !== null) {
          this.player.switchSlot(slotChange);
        }

        let activeItem = this.player.getActiveItem();
        if (!activeItem && this.player.setWeaponsVisible) {
          this.player.setWeaponsVisible(true);
          this.player.switchSlot(0);
          activeItem = this.player.getActiveItem();
        }

        // 1. Check Reload Input (for weapons)
        if (this.input.checkAndConsumeReload() && activeItem && activeItem.reload) {
          activeItem.reload();
        }

        const targets = this.battleGame.getShootableTargets();

        // 2. Check Firing / Use Input
        if (activeItem) {
          if (activeItem.type === 'rifle') {
            if (this.input.isFiring() && activeItem.canShoot()) {
              const shootResult = activeItem.shoot(targets, this.level.colliders);
              if (shootResult.fired) {
                this.battleGame.network.sendPlayerFire();
              }
              if (shootResult.fired && shootResult.hit && shootResult.target === 'enemy') {
                this.hud.triggerHitmarker();
                this.battleGame.handlePlayerHit(shootResult);
              }
            }
          } else if (activeItem.type === 'pistol') {
            if (this.input.checkAndConsumeTrigger() && activeItem.canShoot()) {
              const shootResult = activeItem.shoot(targets, this.level.colliders);
              if (shootResult.fired) {
                this.battleGame.network.sendPlayerFire();
              }
              if (shootResult.fired && shootResult.hit && shootResult.target === 'enemy') {
                this.hud.triggerHitmarker();
                this.battleGame.handlePlayerHit(shootResult);
              }
            }
          } else if (activeItem.type === 'medkit') {
            if (this.input.checkAndConsumeTrigger()) {
              const res = activeItem.use(this.player);
              if (res.message) this.hud.showNotification(res.message);
            }
          }
        }

        // 3. Grenade Throw
        if (this.input.checkAndConsumeGrenade()) {
          const thrown = this.grenadeManager.throw(this.camera);
          if (!thrown && this.grenadeManager.grenades <= 0) {
            this.hud.showNotification('NO GRENADES REMAINING!');
          }
        }

        // 4. Update Player & Camera
        this.player.update(deltaTime);

        // 5. Update Weapons & Items
        this.rifle.update(deltaTime, this.player);
        this.pistol.update(deltaTime, this.player);
        this.medkit.update(deltaTime, this.player);

        // 6. Grenades
        this.grenadeManager.update(deltaTime, targets, this.player);

        // 7. Update Doors
        if (this.level && this.level.update) {
          this.level.update(deltaTime, this.player.position);
        }
      }

      this.battleGame.update(deltaTime);
    } else if (this.gameState.isPlaying()) {
      // --- CONFRONT MODE (CAMPAIGN OR SURVIVAL) ---
        const activeItem = this.player.getActiveItem();

        // 1. Check Reload Input (for weapons)
        if (this.input.checkAndConsumeReload() && activeItem && activeItem.reload) {
          activeItem.reload();
        }

        // 2. Check Firing / Use Input
        if (activeItem) {
          if (activeItem.type === 'rifle') {
            // Automatic rifle: continuous fire while held
            if (this.input.isFiring() && activeItem.canShoot()) {
              const shootResult = activeItem.shoot(
                this.enemySpawner.getEnemies(),
                this.level.colliders
              );
              if (shootResult.fired && shootResult.hit && shootResult.target === 'enemy') {
                this.hud.triggerHitmarker();
                if (this.hud.showDamageNumber) {
                  this.hud.showDamageNumber(
                    shootResult.enemy,
                    shootResult.damage,
                    shootResult.isCritical,
                    shootResult.point
                  );
                }
              }
            }
          } else if (activeItem.type === 'pistol') {
            // Semi-automatic pistol: fires once per click/tap
            if (this.input.checkAndConsumeTrigger() && activeItem.canShoot()) {
              const shootResult = activeItem.shoot(
                this.enemySpawner.getEnemies(),
                this.level.colliders
              );
              if (shootResult.fired && shootResult.hit && shootResult.target === 'enemy') {
                this.hud.triggerHitmarker();
                if (this.hud.showDamageNumber) {
                  this.hud.showDamageNumber(
                    shootResult.enemy,
                    shootResult.damage,
                    shootResult.isCritical,
                    shootResult.point
                  );
                }
              }
            }
          } else if (activeItem.type === 'medkit') {
            // Consumable Medkit: uses on click/tap
            if (this.input.checkAndConsumeTrigger()) {
              const res = activeItem.use(this.player);
              if (res.message) {
                this.hud.showNotification(res.message);
              }
            }
          } else if (activeItem.type === 'quest_item') {
            // Quest Items (Physics Key, Vernier Caliper): inspect / use hint
            if (this.input.checkAndConsumeTrigger()) {
              const res = activeItem.shoot();
              if (res && res.message) {
                this.hud.showNotification(res.message);
              }
            }
          }
        }

        // 3. Check Grenade Throw (Key G or Mobile Button)
        if (this.input.checkAndConsumeGrenade()) {
          const thrown = this.grenadeManager.throw(this.camera);
          if (!thrown && this.grenadeManager.grenades <= 0) {
            this.hud.showNotification('NO GRENADES REMAINING!');
          }
        }

        // 4. Update Player & Camera
        this.player.update(deltaTime);

        // 5. Update Active Weapon & Passive Item Cooldowns
        this.rifle.update(deltaTime, this.player);
        this.pistol.update(deltaTime, this.player);
        this.medkit.update(deltaTime, this.player);

        // 6. Update Grenades (projectiles, pickups, explosion VFX)
        this.grenadeManager.update(deltaTime, this.enemySpawner.getEnemies(), this.player);

        // 7. Update Level Enemies
        this.enemySpawner.update(deltaTime, this.player);

        // 7b. Update Laser Obstacle Traps
        if (this.laserManager) {
          this.laserManager.update(deltaTime, this.player, this.hud);
        }

        // 8. Update Proximity Interactions & Campus Doors
        if (this.level && this.level.update) {
          this.level.update(deltaTime, this.player.position);
        }
        if (this.survivalMode && this.survivalMode.isActive) {
          this.survivalMode.update(deltaTime);
        } else if (this.shootProgression) {
          this.shootProgression.update(deltaTime, this.player, this.input);
        }
      }

    // 9. Update HUD
    this.hud.update(deltaTime, this.player, this.grenadeManager, this.camera);

    // 10. Render 3D Scene
    this.renderer.render(this.scene, this.camera);
  }
}
