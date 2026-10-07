/**
 * LaserObstacle & LaserManager Module
 * Creates retro high-voltage laser barriers spanning hallways and doorways.
 * Utilizes laser-launcher.png for wall emitter brackets and laser-texture.png
 * for glowing, animated, pulsating energy beams.
 * Players must jump over the laser to avoid electric zap damage.
 */
import * as THREE from 'three';
import { ASSET_PATHS, loadTexture } from '../config/assets.js';

export class LaserObstacle {
  constructor(scene, audio, config = {}) {
    this.scene = scene;
    this.audio = audio;

    // Beam line endpoints
    this.x1 = config.x1 || 0;
    this.z1 = config.z1 || 0;
    this.x2 = config.x2 || 0;
    this.z2 = config.z2 || 0;
    this.y = config.y !== undefined ? config.y : 0.40; // Shin height (0.4m from floor)

    this.damage = config.damage || 15;
    this.damageCooldown = 0.55; // Delay between consecutive zaps
    this.cooldownTimer = 0;
    this.glowTimer = Math.random() * 5;

    this.group = new THREE.Group();
    this.buildGeometry();
    this.scene.add(this.group);
  }

  buildGeometry() {
    const launcherTex = loadTexture(ASSET_PATHS.textures.laserLauncher, 1, 1, '#ff3333', '#111111');
    const launcherMat = new THREE.MeshStandardMaterial({
      map: launcherTex,
      roughness: 0.4,
      metalness: 0.8,
    });

    // 1. Mount emitter brackets at each end
    const mountGeo = new THREE.BoxGeometry(0.32, 0.32, 0.32);

    const emitter1 = new THREE.Mesh(mountGeo, launcherMat);
    emitter1.position.set(this.x1, this.y, this.z1);
    this.group.add(emitter1);

    const emitter2 = new THREE.Mesh(mountGeo, launcherMat);
    emitter2.position.set(this.x2, this.y, this.z2);
    this.group.add(emitter2);

    // 2. Glowing Laser Beam spanning emitter1 and emitter2
    const dx = this.x2 - this.x1;
    const dz = this.z2 - this.z1;
    const length = Math.hypot(dx, dz);
    const midX = (this.x1 + this.x2) / 2;
    const midZ = (this.z1 + this.z2) / 2;
    const angle = Math.atan2(dz, dx);

    // Laser beam texture
    this.beamTex = loadTexture(ASSET_PATHS.textures.laserBeam, Math.max(1, Math.round(length / 1.5)), 1, '#ff2222', '#000000');
    this.beamTex.wrapS = THREE.RepeatWrapping;
    this.beamTex.wrapT = THREE.RepeatWrapping;

    // Outer pulsating laser mesh (two intersecting planes for 3D visibility from all camera angles)
    const beamPlaneGeo = new THREE.PlaneGeometry(length, 0.22);
    this.beamMat = new THREE.MeshBasicMaterial({
      map: this.beamTex,
      transparent: true,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
      color: 0xff3344,
    });

    const beamMeshA = new THREE.Mesh(beamPlaneGeo, this.beamMat);
    beamMeshA.position.set(midX, this.y, midZ);
    beamMeshA.rotation.y = -angle;
    this.group.add(beamMeshA);

    const beamMeshB = new THREE.Mesh(beamPlaneGeo, this.beamMat);
    beamMeshB.position.set(midX, this.y, midZ);
    beamMeshB.rotation.y = -angle;
    beamMeshB.rotation.x = Math.PI / 2;
    this.group.add(beamMeshB);

    // Core bright hot beam line
    const coreGeo = new THREE.CylinderGeometry(0.025, 0.025, length, 6);
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.9,
    });
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    coreMesh.position.set(midX, this.y, midZ);
    coreMesh.rotation.z = Math.PI / 2;
    coreMesh.rotation.y = -angle;
    this.group.add(coreMesh);

    // 3. Ambient warning light
    this.light = new THREE.PointLight(0xff2222, 1.1, Math.max(4.0, length * 1.2), 2);
    this.light.position.set(midX, this.y + 0.1, midZ);
    this.group.add(this.light);
  }

  update(deltaTime, player, hud) {
    if (this.cooldownTimer > 0) {
      this.cooldownTimer -= deltaTime;
    }

    this.glowTimer += deltaTime * 5;

    // Animate texture scrolling along beam
    if (this.beamTex) {
      this.beamTex.offset.x -= deltaTime * 3.0;
    }

    // Flicker/pulse light intensity slightly
    if (this.light) {
      this.light.intensity = 1.0 + Math.sin(this.glowTimer) * 0.35 + Math.random() * 0.15;
    }

    // Check collision with player
    this.checkPlayerCollision(player, hud);
  }

  checkPlayerCollision(player, hud) {
    if (this.cooldownTimer > 0 || !player || player.isDead) return;

    const pX = player.position.x;
    const pZ = player.position.z;

    // Distance from player horizontal position to segment (x1, z1) -> (x2, z2)
    const segX = this.x2 - this.x1;
    const segZ = this.z2 - this.z1;
    const segLenSq = segX * segX + segZ * segZ;

    let t = 0;
    if (segLenSq > 0.0001) {
      t = ((pX - this.x1) * segX + (pZ - this.z1) * segZ) / segLenSq;
      t = Math.max(0, Math.min(1, t));
    }

    const closestX = this.x1 + t * segX;
    const closestZ = this.z1 + t * segZ;
    const distSq = (pX - closestX) * (pX - closestX) + (pZ - closestZ) * (pZ - closestZ);

    const collisionRadius = (player.radius || 0.45) + 0.15; // ~0.6m threshold
    if (distSq < collisionRadius * collisionRadius) {
      // Player is crossing the beam horizontally!
      // Check player's vertical clearance:
      // Player's feet are at: player.position.y - player.height
      const feetY = player.position.y - player.height;

      // Laser is at y = 0.40m with clearance threshold ~0.46m
      if (feetY < (this.y + 0.06)) {
        // Player failed to jump over or touched the beam -> Zap!
        this.cooldownTimer = this.damageCooldown;
        player.takeDamage(this.damage);
        if (this.audio && this.audio.playLaserZap) {
          this.audio.playLaserZap();
        }
        if (hud && hud.showNotification) {
          hud.showNotification('⚡ WARNING: LASER GRID DAMAGE! PRESS SPACE TO JUMP!');
        }
      }
    }
  }

  destroy() {
    this.scene.remove(this.group);
  }
}

export class LaserManager {
  constructor(scene, audio, laserConfigs = []) {
    this.scene = scene;
    this.audio = audio;
    this.lasers = [];

    this.initLasers(laserConfigs);
  }

  initLasers(laserConfigs) {
    this.clear();
    laserConfigs.forEach((cfg) => {
      this.lasers.push(new LaserObstacle(this.scene, this.audio, cfg));
    });
  }

  update(deltaTime, player, hud) {
    for (let i = 0; i < this.lasers.length; i++) {
      this.lasers[i].update(deltaTime, player, hud);
    }
  }

  clear() {
    this.lasers.forEach((laser) => laser.destroy());
    this.lasers = [];
  }
}
