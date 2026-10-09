/**
 * NextbotManager Module
 * Spawns and manages Roblox Evade / Garry's Mod Nextbots.
 * Features:
 * - 50% taller than player (2.7m height vs 1.8m player).
 * - Textured with uncropped JPG images (abhishek.jpg, adesh.jpg, aswin.jpg, dipu.jpg).
 * - Player starts 100% faster than bots (initial bot speed ~4.2 m/s vs player ~8.5 m/s).
 * - Relentlessly chases the closest living player.
 * - Touch melee damage (no guns) with hit cooldown.
 * - Progressive difficulty: as rooms are unlocked, bot count and bot speeds increase.
 * - Dynamic spatial proximity audio / terror cues.
 */
import * as THREE from 'three';
import { assetUrl } from '../config/assets.js';

export const NEXTBOT_TYPES = [
  { id: 'abhishek', name: 'Abhishek', img: assetUrl('/images/enemies/abhishek.jpg'), color: '#ff3838' },
  { id: 'adesh', name: 'Adesh', img: assetUrl('/images/enemies/adesh.jpg'), color: '#ff9f1a' },
  { id: 'aswin', name: 'Aswin', img: assetUrl('/images/enemies/aswin.jpg'), color: '#7158e2' },
  { id: 'dipu', name: 'Dipu', img: assetUrl('/images/enemies/dipu.jpg'), color: '#17c0eb' },
];

export class NextbotManager {
  constructor(scene, colliders, audio) {
    this.scene = scene;
    this.colliders = colliders || [];
    this.audio = audio;

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

    // Spawning bounds / locations
    this.spawnPoints = [
      new THREE.Vector3(31, 0, 49),  // Central Atrium
      new THREE.Vector3(7, 0, 22),   // West Wing Hall
      new THREE.Vector3(48, 0, 14),  // North Hall
      new THREE.Vector3(80, 0, 83),  // East Hall
    ];

    // Proximity audio state
    this.proximityVolume = 0;
    this.closestDistance = 999;
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
   * Spawns initial Nextbot at start of match
   */
  spawnInitialBot() {
    this.reset();
    this.spawnBot(0, this.spawnPoints[0]);
  }

  /**
   * Called when a room is unlocked: increases active bot count and accelerates all bots
   */
  onRoomUnlocked(roomsUnlockedCount) {
    // Increase speed for all bots (+0.95 m/s per room unlocked)
    this.currentSpeed = this.initialSpeed + (roomsUnlockedCount * 0.95);
    this.bots.forEach((b) => {
      b.speed = this.currentSpeed;
    });

    // Spawn additional bot if available
    const nextIdx = this.bots.length;
    if (nextIdx < NEXTBOT_TYPES.length) {
      const sp = this.spawnPoints[nextIdx % this.spawnPoints.length];
      this.spawnBot(nextIdx, sp);
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
    group.add(mesh);

    // Glowing menacing aura underneath
    const shadowGeo = new THREE.RingGeometry(0.3, 1.2, 16);
    shadowGeo.rotateX(-Math.PI / 2);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.55
    });
    const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
    shadowMesh.position.y = -this.botHeight / 2 + 0.05;
    group.add(shadowMesh);

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
      if (isHost && livingTargets.length > 0) {
        // Find closest target
        let closestTarget = null;
        let closestDist = Infinity;

        livingTargets.forEach((t) => {
          const d = bot.group.position.distanceTo(t.position);
          if (d < closestDist) {
            closestDist = d;
            closestTarget = t;
          }
        });

        if (closestTarget) {
          const toTarget = new THREE.Vector3().subVectors(closestTarget.position, bot.group.position);
          toTarget.y = 0; // Flat floor movement
          const dist = toTarget.length();

          if (dist > 0.05) {
            toTarget.normalize();

            // Steer away from walls/obstacles
            const steer = this.calculateObstacleAvoidance(bot.group.position, toTarget);
            toTarget.addScaledVector(steer, 0.45).normalize();

            // Glide smoothly towards target
            const moveStep = toTarget.multiplyScalar(bot.speed * deltaTime);
            bot.group.position.add(moveStep);
          }

          // 5. Touch Damage Check
          if (dist <= 1.35) {
            this.handleTouchAttack(bot, closestTarget);
          }
        }
      }

      // Check distance to local player for terror audio
      if (localPlayer) {
        const dLocal = Math.hypot(
          bot.group.position.x - localPlayer.position.x,
          bot.group.position.z - localPlayer.position.z
        );
        if (dLocal < minDistToLocal) {
          minDistToLocal = dLocal;
        }
      }
    });

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

  calculateObstacleAvoidance(pos, forwardDir) {
    const avoid = new THREE.Vector3();
    const probeDist = 1.6;
    const probePos = pos.clone().addScaledVector(forwardDir, probeDist);

    // Simple bounds check against map colliders
    for (const box of this.colliders) {
      if (box.containsPoint(probePos)) {
        // Push away from box center
        const center = new THREE.Vector3();
        box.getCenter(center);
        const away = new THREE.Vector3().subVectors(pos, center);
        away.y = 0;
        away.normalize();
        avoid.add(away);
      }
    }
    return avoid;
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
    // Match by ID or index
    botStates.forEach((bs, idx) => {
      let bot = this.bots.find((b) => b.id === bs.id);
      if (!bot) {
        bot = this.spawnBot(bs.typeIndex, new THREE.Vector3(bs.x, bs.y, bs.z));
        bot.id = bs.id;
      }
      bot.speed = bs.speed;
      bot.group.position.lerp(new THREE.Vector3(bs.x, bs.y, bs.z), 0.5);
    });
  }
}
