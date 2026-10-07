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
import { GameState, STATES } from './GameState.js';
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
import { ASSET_PATHS } from '../config/assets.js';

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
    this.level = new LevelGenerator(this.scene, level1Data);

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

    // HUD & Interaction System
    this.hud = new HUD(this.gameState, this.input);
    this.interactionSystem = new InteractionSystem(this.level.elevator, this.hud);

    // Laser Obstacle Trap System
    this.laserManager = new LaserManager(this.scene, this.audio, level1Data.lasers || []);

    // Player Notification Callback
    this.player.onPickupNotification = (msg) => {
      this.hud.showNotification(msg);
    };

    this.clock = new THREE.Clock();

    // 3. Setup Listeners
    this.initListeners();

    // 4. Preload Audio
    this.audio.loadSound('grenade', ASSET_PATHS.audio.grenade);

    // Initial Spawning from Predefined Zones
    this.enemySpawner.spawnLevelEnemies(level1Data.spawnZones);
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

    this.gameState.on('restartGame', () => {
      this.restart();
    });

    this.gameState.on('stateChange', ({ newState }) => {
      if (newState === STATES.PLAYING) {
        this.audio.playBGM(ASSET_PATHS.audio.metalBgm, 0.45);
      } else if (newState === STATES.GAME_OVER) {
        // Stop metal bgm when player dies
        this.audio.stopBGM();
      } else if (newState === STATES.PAUSED) {
        this.audio.pauseBGM();
      } else if (newState === STATES.VICTORY) {
        this.audio.stopBGM();
      }
    });
  }

  restart() {
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
    this.enemySpawner.spawnLevelEnemies(level1Data.spawnZones);
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

      // 8. Update Proximity Interactions (Elevator Photocopy prompt)
      this.interactionSystem.update(this.player, this.input);
    }

    // 9. Update HUD
    this.hud.update(deltaTime, this.player, this.grenadeManager);

    // 10. Render 3D Scene
    this.renderer.render(this.scene, this.camera);
  }
}
