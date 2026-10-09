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
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    // 2. Instantiate Systems
    this.gameState = new GameState();
    this.audio = new AudioManager();
    this.input = new InputManager(this.canvas, this.hudContainer);

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

    this.clock = new THREE.Clock();

    // 3. Setup Listeners
    this.initListeners();

    // 4. Initial Spawning from Predefined Zones (reduced on mobile)
    this.enemySpawner.spawnLevelEnemies(level1Data.spawnZones, this.input.isTouchDevice);

    // 5. Preload All Assets & Warm Up Shaders
    this.initPreloadAndIntro();
  }

  async initPreloadAndIntro() {
    this.gameState.setState(STATES.INTRO);

    // Step 1: Preload All Audio Buffers
    try {
      await Promise.all([
        this.audio.loadSound('grenade', ASSET_PATHS.audio.grenade),
        this.audio.loadSound('reload', ASSET_PATHS.audio.reload),
        this.audio.loadSound('kill-1', ASSET_PATHS.audio.kills[0]),
        this.audio.loadSound('kill-2', ASSET_PATHS.audio.kills[1]),
        this.audio.loadSound('kill-3', ASSET_PATHS.audio.kills[2]),
        this.audio.loadSound('combo-1', ASSET_PATHS.audio.combos[0]),
        this.audio.loadSound('combo-2', ASSET_PATHS.audio.combos[1]),
      ]);
    } catch (e) {
      console.warn('[Game] Audio preload warning:', e);
    }

    // Step 2: Preload All Textures & Precompute Metrics
    await preloadAllAssets((progress, msg) => {
      this.hud.updateIntroLoading(progress * 0.85, msg);
    });

    // Step 3: Warm Up WebGL Shaders (Viewmodels & Explosion pool)
    this.hud.updateIntroLoading(0.92, 'WARMING UP GRAPHICS ENGINE...');
    this.warmupShaders();

    // Step 4: Finish Intro Loading
    this.hud.updateIntroLoading(1.0, 'SYSTEMS ONLINE');
    this.hud.finishIntroLoading(() => {
      this.gameState.setState(STATES.MENU);
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
      this.restart(mode);
    });

    this.gameState.on('startMode', ({ mode }) => {
      this.launchMode(mode);
    });

    this.gameState.on('stateChange', ({ newState }) => {
      if (newState === STATES.PLAYING) {
        this.audio.playBGM(ASSET_PATHS.audio.metalBgm, 0.45);
      } else if (newState === STATES.GAME_OVER || newState === STATES.VICTORY) {
        this.audio.stopBGM();
      } else if (newState === STATES.PAUSED || newState === STATES.MENU) {
        this.audio.pauseBGM();
      }
    });
  }

  launchMode(mode) {
    this.audio.ensureContext();
    this.gameState.currentMode = mode;
    this.restart(mode);
    if (mode === GAME_MODES.SHOOT_SHOOT_SHOOT) {
      this.hud.showNotification('💥 MODE: SHOOT SHOOT SHOOT', 3.0);
    } else {
      this.hud.showNotification('▶ MODE: PLAY (CORE MISSION)', 3.0);
    }
  }

  restart(mode = null) {
    if (mode) {
      this.gameState.currentMode = mode;
    }
    this.audio.ensureContext();

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
    this.enemySpawner.spawnLevelEnemies(level1Data.spawnZones, this.input.isTouchDevice);
    if (this.laserManager) {
      this.laserManager.initLasers(level1Data.lasers || []);
    }

    this.gameState.reset(this.enemySpawner.getEnemies().length);
    this.audio.playBGM(ASSET_PATHS.audio.metalBgm, 0.45);
    this.input.requestPointerLock();
  }

  start() {
    this.renderer.setAnimationLoop(() => this.update());
  }

  update() {
    const rawDelta = this.clock.getDelta();
    const deltaTime = Math.min(rawDelta, 0.1);

    if (this.gameState.isPlaying()) {
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
      this.interactionSystem.update(this.player, this.input);
    }

    // 9. Update HUD
    this.hud.update(deltaTime, this.player, this.grenadeManager, this.camera);

    // 10. Render 3D Scene
    this.renderer.render(this.scene, this.camera);
  }
}
