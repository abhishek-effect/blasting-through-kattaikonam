/**
 * EvilSanthomiteManager Module (Evade Mode)
 * Spawns and manages Evil Santhomites.
 * Features:
 * - 50% taller than player (2.7m height vs 1.8m player).
 * - Textured exclusively with uncropped JPG images (abhishek.jpg, adesh.jpg, aswin.jpg, dipu.jpg).
 * - Player starts 100% faster than bots (initial bot speed ~4.2 m/s vs player ~8.5 m/s).
 * - Relentlessly chases the closest living player.
 * - Touch melee damage (no guns) with hit cooldown.
 * - Progressive difficulty: as rooms are unlocked, bot count and bot speeds increase.
 * - Dynamic spatial proximity audio / terror cues.
 */
import * as THREE from 'three';
import { assetUrl } from '../config/assets.js';

export const EVIL_SANTHOMITE_TYPES = [
  { id: 'abhishek', name: 'Abhishek', img: assetUrl('/images/enemies/abhishek.jpg'), color: '#ff3838' },
  { id: 'adesh', name: 'Adesh', img: assetUrl('/images/enemies/adesh.jpg'), color: '#ff9f1a' },
  { id: 'aswin', name: 'Aswin', img: assetUrl('/images/enemies/aswin.jpg'), color: '#7158e2' },
  { id: 'dipu', name: 'Dipu', img: assetUrl('/images/enemies/dipu.jpg'), color: '#17c0eb' },
  { id: 'aahil', name: 'Aahil', img: assetUrl('/images/enemies/aahil.jpg'), color: '#ff4757' },
  { id: 'eshan', name: 'Eshan', img: assetUrl('/images/enemies/Eshan.jpg'), color: '#2ed573' },
  { id: 'johann', name: 'Johann', img: assetUrl('/images/enemies/johann.jpg'), color: '#ffa502' },
  { id: 'ligin', name: 'Ligin', img: assetUrl('/images/enemies/ligin.jpg'), color: '#1e90ff' },
  { id: 'mahadev', name: 'Mahadev', img: assetUrl('/images/enemies/mahadev.jpg'), color: '#ff6348' },
  { id: 'ritul', name: 'Ritul', img: assetUrl('/images/enemies/ritul.jpg'), color: '#e056fd' },
  { id: 'ryan', name: 'Ryan', img: assetUrl('/images/enemies/ryan.jpg'), color: '#f0932b' },
  { id: 'sijinil', name: 'Sijinil', img: assetUrl('/images/enemies/sijinil.jpg'), color: '#00d2d3' },
];

export const NEXTBOT_TYPES = EVIL_SANTHOMITE_TYPES;

// Pre-allocated static vectors (zero GC allocations)
const _botToTarget = new THREE.Vector3();
const _botAvoidDir = new THREE.Vector3();
const _botSeparation = new THREE.Vector3();

export class EvilSanthomiteManager {
  constructor(scene, colliders, audio, level = null) {
    this.scene = scene;
    this.colliders = colliders || [];
    this.audio = audio;
    this.level = level;
    this.isHost = true;
    this.isMultiplayer = false;
    this.playerCount = 1;

    // Active Nextbot instances: Array of Nextbot objects
    this.bots = [];

    // Bot stats configuration
    this.botHeight = 2.7; // 50% taller than 1.8m player
    this.botWidth = 2.05;
    this.initialSpeed = 4.2; // Player base run is ~8.5 m/s (player is 100% faster at start)
    this.currentSpeed = 4.2;
    this.touchDamage = 38;
    this.touchCooldown = 1.25;

    // Texture loader cache
    this.texLoader = new THREE.TextureLoader();
    this.cachedTextures = new Map();

    // Spawning bounds / locations safely placed in open corridors away from keys & locked rooms
    this.spawnPoints = [
      new THREE.Vector3(31, 0, 48),  // Central Atrium open floor
      new THREE.Vector3(48, 0, 24),  // North Central Hallway (outside Physics Lab)
      new THREE.Vector3(20, 0, 40),  // West Corridor (outside elevator, open hallway)
      new THREE.Vector3(50, 0, 68),  // East Hallway (outside Seminar Gate)
      new THREE.Vector3(34, 0, 68),  // South Central Hallway
      new THREE.Vector3(20, 0, 65),  // West South Corridor
      new THREE.Vector3(31, 0, 32),  // Central North Hallway
      new THREE.Vector3(40, 0, 85),  // South Hallway Approach
    ];

    // Proximity audio state
    this.proximityVolume = 0;
    this.closestDistance = 999;
  }

  getMaxBots() {
    return Math.max(2, this.playerCount * 2);
  }

  getTexture(imgPath) {
    if (!this.cachedTextures.has(imgPath)) {
      const tex = this.texLoader.load(imgPath);
      tex.colorSpace = THREE.SRGBColorSpace;
      this.cachedTextures.set(imgPath, tex);
    }
    return this.cachedTextures.get(imgPath);
  }

  /**
   * Clears all active bots
   */
  reset() {
    this.bots.forEach((bot) => {
      if (bot.group && bot.group.parent) {
        bot.group.parent.remove(bot.group);
      }
    });
    this.bots = [];
    this.currentSpeed = this.initialSpeed;
    this.proximityVolume = 0;
    this.closestDistance = 999;
  }

  /**
   * Spawns exactly 2 initial Nextbots chosen randomly from the 12 JPG enemies
   */
  spawnInitialBots() {
    this.reset();
    const available = NEXTBOT_TYPES.map((_, i) => i);
    const idx1 = available.splice(Math.floor(Math.random() * available.length), 1)[0];
    const idx2 = available.splice(Math.floor(Math.random() * available.length), 1)[0];

    this.spawnBot(idx1, this.spawnPoints[0]);
    this.spawnBot(idx2, this.spawnPoints[1 % this.spawnPoints.length]);
  }

  spawnInitialBot() {
    this.spawnInitialBots();
  }

  /**
   * Spawns bots for Survive Mode based on player count (capped at 2 * playerCount)
   */
  spawnSurviveBots(playerCount = 1) {
    this.playerCount = playerCount;
    this.reset();
    const targetCount = this.getMaxBots();
    const available = NEXTBOT_TYPES.map((_, i) => i);

    for (let i = 0; i < targetCount; i++) {
      let chosenIdx;
      if (available.length > 0) {
        const randPos = Math.floor(Math.random() * available.length);
        chosenIdx = available.splice(randPos, 1)[0];
      } else {
        chosenIdx = Math.floor(Math.random() * NEXTBOT_TYPES.length);
      }
      const sp = this.spawnPoints[i % this.spawnPoints.length];
      this.spawnBot(chosenIdx, sp);
    }
  }

  /**
   * Called when a room is unlocked: activates +1 new random bot per key (capped at 2 * playerCount) and accelerates all bots
   */
  onRoomUnlocked(roomsUnlockedCount) {
    // Increase speed for all bots (+0.75 m/s per room unlocked)
    this.currentSpeed = this.initialSpeed + (roomsUnlockedCount * 0.75);
    this.bots.forEach((b) => {
      b.speed = this.currentSpeed;
    });

    // Activate +1 new random bot with every key up to maxBots (2 * active players)
    const maxBots = this.getMaxBots();
    if ((this.isHost || !this.isMultiplayer) && this.bots.length < maxBots) {
      const activeTypeIndices = new Set(this.bots.map((b) => b.typeIndex));
      const unusedIndices = NEXTBOT_TYPES.map((_, i) => i).filter((i) => !activeTypeIndices.has(i));
      const chosenIdx = unusedIndices.length > 0
        ? unusedIndices[Math.floor(Math.random() * unusedIndices.length)]
        : Math.floor(Math.random() * NEXTBOT_TYPES.length);

      const spIdx = this.bots.length % this.spawnPoints.length;
      const sp = this.spawnPoints[spIdx];
      this.spawnBot(chosenIdx, sp);
    }
  }

  spawnBot(typeIndex, spawnPos) {
    const type = NEXTBOT_TYPES[typeIndex % NEXTBOT_TYPES.length];
    const tex = this.getTexture(type.img);

    const group = new THREE.Group();
    group.position.copy(spawnPos);
    group.position.y = this.botHeight / 2; // Center plane on floor

    // Upright billboard plane for uncropped full JPG cutout
    const planeGeo = new THREE.PlaneGeometry(this.botWidth, this.botHeight);
    const planeMat = new THREE.MeshBasicMaterial({
      map: tex,
      side: THREE.DoubleSide,
      transparent: false
    });

    const mesh = new THREE.Mesh(planeGeo, planeMat);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    group.add(mesh);

    // Red menace light
    const pointLight = new THREE.PointLight(0xff2222, 1.5, 6);
    pointLight.position.set(0, 0, 0.5);
    group.add(pointLight);

    this.scene.add(group);

    const botObj = {
      id: `bot_${type.id}_${Date.now()}`,
      name: type.name,
      typeIndex,
      group,
      mesh,
      speed: this.currentSpeed,
      position: group.position,
      velocity: new THREE.Vector3(),
      target: null,
      cooldownTimers: new Map(), // Map<playerId, timer>
      bobTimer: Math.random() * 10
    };

    this.bots.push(botObj);
    return botObj;
  }

  /**
   * Updates Nextbots movement, pathing, and touch damage
   * @param {number} deltaTime
   * @param {Object} localPlayer { id, position, isDowned, isEscaped, takeDamage }
   * @param {Array} remotePlayers Array of RemotePlayer instances
   * @param {Camera} camera Active camera for billboard facing
   * @param {boolean} isHost Whether this machine is authoritative host
   */
  update(deltaTime, localPlayer, remotePlayers = [], camera = null, isHost = true) {
    if (this.bots.length === 0) return;

    // Collect all living potential targets
    const livingTargets = [];
    if (localPlayer && !localPlayer.isDowned && !localPlayer.isEscaped) {
      livingTargets.push({
        id: localPlayer.id || 'local',
        position: localPlayer.position,
        isLocal: true,
        playerObj: localPlayer
      });
    }

    remotePlayers.forEach((rp) => {
      if (rp && !rp.isDowned && !rp.isEscaped) {
        livingTargets.push({
          id: rp.id,
          position: rp.group.position,
          isLocal: false,
          playerObj: rp
        });
      }
    });

    let minDistToLocal = 999;

    this.bots.forEach((bot) => {
      // 1. Cooldown timers
      bot.cooldownTimers.forEach((timer, pid) => {
        if (timer > 0) {
          bot.cooldownTimers.set(pid, timer - deltaTime);
        }
      });

      // 2. Face camera/player upright (Nextbot billboard behavior)
      if (camera) {
        bot.group.lookAt(camera.position.x, bot.group.position.y, camera.position.z);
      }

      // 3. Floating Nextbot wobble
      bot.bobTimer += deltaTime * 8;
      bot.mesh.position.y = Math.sin(bot.bobTimer) * 0.08;

      // 4. Host authoritative chase navigation
      if (isHost) {
        // Find closest target using squared distance
        let closestTarget = null;
        if (livingTargets.length > 0) {
          let closestDistSq = Infinity;
          const bx = bot.group.position.x;
          const bz = bot.group.position.z;

          for (let i = 0; i < livingTargets.length; i++) {
            const t = livingTargets[i];
            const dx = bx - t.position.x;
            const dz = bz - t.position.z;
            const dSq = dx * dx + dz * dz;
            if (dSq < closestDistSq) {
              closestDistSq = dSq;
              closestTarget = t;
            }
          }
        } else {
          // If no living targets currently available (e.g. all downed or disconnected), patrol smoothly
          const fallbackPt = this.spawnPoints[0] || new THREE.Vector3(31, 0, 48);
          closestTarget = { position: fallbackPt };
        }

        if (closestTarget) {
          _botToTarget.subVectors(closestTarget.position, bot.group.position);
          _botToTarget.y = 0; // Flat floor movement
          const dist = Math.hypot(_botToTarget.x, _botToTarget.z);

          if (dist > 0.05) {
            _botToTarget.x /= dist;
            _botToTarget.z /= dist;

            // Inter-bot steering separation (prevents bots from clustering or chasing in a single blob)
            _botSeparation.set(0, 0, 0);
            for (let j = 0; j < this.bots.length; j++) {
              const other = this.bots[j];
              if (other === bot) continue;
              const ox = bot.group.position.x - other.group.position.x;
              const oz = bot.group.position.z - other.group.position.z;
              const dSq = ox * ox + oz * oz;
              const sepRadius = 2.4;
              if (dSq < sepRadius * sepRadius && dSq > 0.0001) {
                const d = Math.sqrt(dSq);
                const weight = (sepRadius - d) / sepRadius;
                _botSeparation.x += (ox / d) * weight;
                _botSeparation.z += (oz / d) * weight;
              }
            }

            if (_botSeparation.lengthSq() > 0.0001) {
              _botToTarget.addScaledVector(_botSeparation, 0.75).normalize();
            }

            // Steer away from walls/obstacles (mutates _botAvoidDir with 0 allocations)
            this.calculateObstacleAvoidance(bot.group.position, _botToTarget, _botAvoidDir);
            _botToTarget.addScaledVector(_botAvoidDir, 0.45).normalize();

            // Glide smoothly towards target
            bot.group.position.x += _botToTarget.x * (bot.speed * deltaTime);
            bot.group.position.z += _botToTarget.z * (bot.speed * deltaTime);

            // Wall slide collision resolution so bots glide around corners without snagging
            if (this.level && this.level.resolveSphereCollision) {
              this.level.resolveSphereCollision(bot.group.position, 0.55);
            }
          }
        }
      }

      // 5. Touch Damage Check (Evaluated for local player on this machine)
      if (localPlayer && !localPlayer.isDowned && !localPlayer.isEscaped) {
        const dLocal = Math.hypot(
          bot.group.position.x - localPlayer.position.x,
          bot.group.position.z - localPlayer.position.z
        );
        if (dLocal <= 1.35) {
          this.handleTouchAttack(bot, {
            id: localPlayer.id || 'local',
            isLocal: true,
            playerObj: localPlayer
          });
        }
        if (dLocal < minDistToLocal) {
          minDistToLocal = dLocal;
        }
      }
    });

    // 4b. Hard inter-bot physical collision resolution (strictly prevents glitching/overlapping)
    if (isHost && this.bots.length > 1) {
      const botRadius = 0.75;
      const minSepDist = botRadius * 2;
      const minSepDistSq = minSepDist * minSepDist;

      for (let i = 0; i < this.bots.length; i++) {
        for (let j = i + 1; j < this.bots.length; j++) {
          const b1 = this.bots[i];
          const b2 = this.bots[j];
          const dx = b1.group.position.x - b2.group.position.x;
          const dz = b1.group.position.z - b2.group.position.z;
          const dSq = dx * dx + dz * dz;

          if (dSq < minSepDistSq && dSq > 0.00001) {
            const d = Math.sqrt(dSq);
            const overlap = minSepDist - d;
            const nx = dx / d;
            const nz = dz / d;
            const halfPush = overlap * 0.5;

            b1.group.position.x += nx * halfPush;
            b1.group.position.z += nz * halfPush;
            b2.group.position.x -= nx * halfPush;
            b2.group.position.z -= nz * halfPush;

            if (this.level && this.level.resolveSphereCollision) {
              this.level.resolveSphereCollision(b1.group.position, 0.55);
              this.level.resolveSphereCollision(b2.group.position, 0.55);
            }
          }
        }
      }
    }

    this.closestDistance = minDistToLocal;
    this.updateTerrorAudio(deltaTime, minDistToLocal);
  }

  handleTouchAttack(bot, target) {
    const cd = bot.cooldownTimers.get(target.id) || 0;
    if (cd > 0) return;

    // Reset cooldown
    bot.cooldownTimers.set(target.id, this.touchCooldown);

    if (target.isLocal && target.playerObj) {
      // Touch local player
      target.playerObj.takeDamage(this.touchDamage, bot.group.position);
    }
  }

  calculateObstacleAvoidance(pos, forwardDir, outAvoid = _botAvoidDir) {
    outAvoid.set(0, 0, 0);
    const probeDist = 1.6;
    const px = pos.x + forwardDir.x * probeDist;
    const py = pos.y + forwardDir.y * probeDist;
    const pz = pos.z + forwardDir.z * probeDist;

    // Fast bounds check against map colliders with scalar math
    const colliders = this.colliders;
    for (let i = 0; i < colliders.length; i++) {
      const box = colliders[i];
      const min = box.min;
      const max = box.max;
      if (px >= min.x && px <= max.x && py >= min.y && py <= max.y && pz >= min.z && pz <= max.z) {
        // Push away from box center
        const cx = (min.x + max.x) * 0.5;
        const cz = (min.z + max.z) * 0.5;
        const ax = pos.x - cx;
        const az = pos.z - cz;
        const aLen = Math.hypot(ax, az) || 1;
        outAvoid.x += ax / aLen;
        outAvoid.z += az / aLen;
      }
    }
    return outAvoid;
  }

  updateTerrorAudio(deltaTime, distance) {
    // Proximity tension: maximum when < 4m, inaudible when > 25m
    const maxDist = 25.0;
    const minDist = 3.5;
    const targetVol = Math.max(0, Math.min(1.0, 1.0 - (distance - minDist) / (maxDist - minDist)));
    this.proximityVolume += (targetVol - this.proximityVolume) * Math.min(1.0, deltaTime * 8);

    // If audio manager has ambient tension generator or frequency modulation
    if (this.audio && this.audio.updateTerrorVolume) {
      this.audio.updateTerrorVolume(this.proximityVolume);
    }
  }

  /**
   * Export bot states for network synchronization
   */
  getNetworkState() {
    return this.bots.map((b) => ({
      id: b.id,
      name: b.name,
      typeIndex: b.typeIndex,
      x: b.group.position.x,
      y: b.group.position.y,
      z: b.group.position.z,
      speed: b.speed
    }));
  }

  /**
   * Apply network bot states from host
   */
  syncFromNetwork(botStates = []) {
    const activeIds = new Set();
    botStates.forEach((bs) => {
      activeIds.add(bs.id);
      let bot = this.bots.find((b) => b.id === bs.id);
      if (!bot) {
        bot = this.spawnBot(bs.typeIndex, new THREE.Vector3(bs.x, bs.y, bs.z));
        bot.id = bs.id;
      }
      bot.speed = bs.speed;
      bot.group.position.lerp(new THREE.Vector3(bs.x, bs.y, bs.z), 0.5);
    });

    // Remove any bots not in the authoritative host list
    for (let i = this.bots.length - 1; i >= 0; i--) {
      const b = this.bots[i];
      if (!activeIds.has(b.id)) {
        if (b.group && b.group.parent) {
          b.group.parent.remove(b.group);
        }
        this.bots.splice(i, 1);
      }
    }
  }

  onPlayerRemoved(playerId) {
    this.bots.forEach((bot) => {
      bot.cooldownTimers.delete(playerId);
      if (bot.target && bot.target.id === playerId) {
        bot.target = null;
      }
    });
  }
}

export const NextbotManager = EvilSanthomiteManager;
