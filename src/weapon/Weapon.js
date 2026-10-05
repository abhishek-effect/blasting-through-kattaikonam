/**
 * Weapon Module
 * Implements an automatic assault rifle (AK-47) with:
 * - Raycaster hitscan shooting
 * - Magazine & reserve ammo
 * - Recoil & muzzle flash
 * - Particle impact effects
 * - Sound playback via AudioManager
 */
import * as THREE from 'three';
import { ASSET_PATHS, loadTexture } from '../config/assets.js';

export class Weapon {
  constructor(camera, scene, audio) {
    this.camera = camera;
    this.scene = scene;
    this.audio = audio;

    // Weapon attributes
    this.name = 'AK-47 CLASSROOM ENFORCER';
    this.magSize = 30;
    this.ammoInMag = 30;
    this.reserveAmmo = 90;
    this.damage = 25;
    this.fireRate = 600; // Rounds per minute
    this.fireInterval = 60 / this.fireRate; // ~0.10s
    this.reloadDuration = 1.8; // Seconds
    this.range = 80; // Meters

    // State timers
    this.fireTimer = 0;
    this.reloadTimer = 0;
    this.isReloading = false;
    this.muzzleFlashTimer = 0;

    // Recoil state
    this.currentRecoilZ = 0;
    this.currentRecoilRot = 0;
    this.cameraRecoilPitch = 0;

    // Raycaster for hitscan
    this.raycaster = new THREE.Raycaster();

    // Impact particles pool
    this.impactParticles = [];

    // Create Viewmodel
    this.viewmodelGroup = new THREE.Group();
    this.camera.add(this.viewmodelGroup);
    this.buildViewmodel();
    this.buildImpactParticleSystem();
  }

  buildViewmodel() {
    // 1. Weapon Sprite / Plane
    // Positioned at bottom-right in camera view
    const gunGeo = new THREE.PlaneGeometry(0.55, 0.32);
    const gunTex = loadTexture(ASSET_PATHS.weapons.ak47, 1, 1, '#2c3e50', '#1a252f');
    const gunMat = new THREE.MeshBasicMaterial({
      map: gunTex,
      transparent: true,
      depthTest: false, // Ensures weapon renders on top of scene geometry
      depthWrite: false,
    });

    this.gunMesh = new THREE.Mesh(gunGeo, gunMat);
    this.gunMesh.renderOrder = 999; // Render over scene
    // Default rest position in front of camera
    this.restPosition = new THREE.Vector3(0.26, -0.22, -0.58);
    this.gunMesh.position.copy(this.restPosition);
    this.viewmodelGroup.add(this.gunMesh);

    // 2. Muzzle Flash Sprite
    const flashGeo = new THREE.PlaneGeometry(0.18, 0.18);
    const flashMat = new THREE.MeshBasicMaterial({
      color: 0xffe600,
      transparent: true,
      opacity: 0.9,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    this.muzzleFlash = new THREE.Mesh(flashGeo, flashMat);
    this.muzzleFlash.position.set(0.12, 0.08, 0.01); // Relative to gun mesh
    this.muzzleFlash.visible = false;
    this.gunMesh.add(this.muzzleFlash);

    // 3. Muzzle Flash Point Light
    this.flashLight = new THREE.PointLight(0xffaa22, 0, 8);
    this.flashLight.position.set(0.2, -0.15, -0.6);
    this.viewmodelGroup.add(this.flashLight);
  }

  buildImpactParticleSystem() {
    // Spark / Dust particles pool
    const count = 30;
    const geo = new THREE.SphereGeometry(0.03, 4, 4);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffaa00 });

    for (let i = 0; i < count; i++) {
      const p = new THREE.Mesh(geo, mat);
      p.visible = false;
      this.scene.add(p);
      this.impactParticles.push({
        mesh: p,
        velocity: new THREE.Vector3(),
        life: 0,
        maxLife: 0.25
      });
    }
  }

  spawnImpactSparks(point, normal = new THREE.Vector3(0, 1, 0), color = 0xffaa00) {
    let spawned = 0;
    for (let p of this.impactParticles) {
      if (!p.mesh.visible && spawned < 6) {
        p.mesh.position.copy(point);
        p.mesh.material.color.setHex(color);
        p.mesh.visible = true;
        p.life = 0;
        p.velocity.set(
          (Math.random() - 0.5) * 3 + normal.x * 2,
          (Math.random() - 0.5) * 3 + normal.y * 2,
          (Math.random() - 0.5) * 3 + normal.z * 2
        );
        spawned++;
      }
    }
  }

  canShoot() {
    return this.fireTimer <= 0 && !this.isReloading && this.ammoInMag > 0;
  }

  /**
   * Main Shooting logic
   * Raycasts forward, tests hits against enemies and world walls
   */
  shoot(enemies = [], colliders = []) {
    if (this.isReloading) return { fired: false, reason: 'reloading' };

    if (this.ammoInMag <= 0) {
      this.audio.playEmptyClick();
      this.fireTimer = 0.25; // Brief cooldown for empty click
      return { fired: false, reason: 'empty' };
    }

    // Deduct ammo & set fire cooldown
    this.ammoInMag--;
    this.fireTimer = this.fireInterval;

    // Trigger Gunshot Sound
    this.audio.playGunshot();

    // Trigger Muzzle Flash
    this.muzzleFlash.visible = true;
    this.muzzleFlash.rotation.z = Math.random() * Math.PI * 2;
    this.flashLight.intensity = 2.5;
    this.muzzleFlashTimer = 0.05;

    // Recoil Kick
    this.currentRecoilZ = 0.06;
    this.currentRecoilRot = 0.12;
    this.cameraRecoilPitch = 0.012;

    // Raycast from Camera Center (0, 0 in NDC)
    // Add slight random spread
    const spreadX = (Math.random() - 0.5) * 0.015;
    const spreadY = (Math.random() - 0.5) * 0.015;
    this.raycaster.setFromCamera(new THREE.Vector2(spreadX, spreadY), this.camera);
    this.raycaster.far = this.range;

    // Check hit against active enemies first
    let hitResult = null;
    let closestDistance = Infinity;

    enemies.forEach((enemy) => {
      if (enemy.isDead) return;
      const hit = enemy.checkRaycastHit(this.raycaster);
      if (hit && hit.distance < closestDistance) {
        closestDistance = hit.distance;
        hitResult = { type: 'enemy', enemy, point: hit.point };
      }
    });

    // Check hit against world colliders
    if (colliders.length > 0) {
      const ray = this.raycaster.ray;
      for (let box of colliders) {
        const hitPoint = new THREE.Vector3();
        if (ray.intersectBox(box, hitPoint)) {
          const dist = ray.origin.distanceTo(hitPoint);
          if (dist < closestDistance) {
            closestDistance = dist;
            hitResult = { type: 'wall', point: hitPoint };
          }
        }
      }
    }

    if (hitResult) {
      if (hitResult.type === 'enemy') {
        hitResult.enemy.takeDamage(this.damage, hitResult.point);
        this.spawnImpactSparks(hitResult.point, new THREE.Vector3(0, 1, 0), 0xff2222);
        return { fired: true, hit: true, target: 'enemy' };
      } else if (hitResult.type === 'wall') {
        this.spawnImpactSparks(hitResult.point, new THREE.Vector3(0, 1, 0), 0xffbb44);
        return { fired: true, hit: true, target: 'wall' };
      }
    }

    return { fired: true, hit: false };
  }

  reload() {
    if (this.isReloading || this.ammoInMag === this.magSize || this.reserveAmmo <= 0) {
      return false;
    }

    this.isReloading = true;
    this.reloadTimer = this.reloadDuration;
    this.audio.playReloadSound();
    return true;
  }

  update(deltaTime, player) {
    // 1. Fire timer cooldown
    if (this.fireTimer > 0) {
      this.fireTimer -= deltaTime;
    }

    // 2. Muzzle flash fade
    if (this.muzzleFlashTimer > 0) {
      this.muzzleFlashTimer -= deltaTime;
      if (this.muzzleFlashTimer <= 0) {
        this.muzzleFlash.visible = false;
        this.flashLight.intensity = 0;
      }
    }

    // 3. Reloading timer
    if (this.isReloading) {
      this.reloadTimer -= deltaTime;
      // Gun dips downward while reloading
      const reloadDip = Math.sin((this.reloadTimer / this.reloadDuration) * Math.PI) * 0.18;
      this.gunMesh.position.y = this.restPosition.y - reloadDip;

      if (this.reloadTimer <= 0) {
        const needed = this.magSize - this.ammoInMag;
        const available = Math.min(needed, this.reserveAmmo);
        this.ammoInMag += available;
        this.reserveAmmo -= available;
        this.isReloading = false;
        this.gunMesh.position.y = this.restPosition.y;
      }
    } else {
      // 4. Recoil spring recovery
      this.currentRecoilZ = THREE.MathUtils.lerp(this.currentRecoilZ, 0, deltaTime * 16);
      this.currentRecoilRot = THREE.MathUtils.lerp(this.currentRecoilRot, 0, deltaTime * 16);

      this.gunMesh.position.z = this.restPosition.z + this.currentRecoilZ;
      this.gunMesh.rotation.z = this.currentRecoilRot;
    }

    // 5. Camera recoil absorption
    if (this.cameraRecoilPitch > 0 && player) {
      player.pitch += this.cameraRecoilPitch;
      this.cameraRecoilPitch = 0;
    }

    // 6. Update impact spark particles
    for (let p of this.impactParticles) {
      if (p.mesh.visible) {
        p.life += deltaTime;
        if (p.life >= p.maxLife) {
          p.mesh.visible = false;
        } else {
          p.mesh.position.addScaledVector(p.velocity, deltaTime);
          p.velocity.y -= 9.8 * deltaTime; // Gravity on sparks
        }
      }
    }
  }

  reset() {
    this.ammoInMag = this.magSize;
    this.reserveAmmo = 90;
    this.isReloading = false;
    this.fireTimer = 0;
    this.reloadTimer = 0;
    this.gunMesh.position.copy(this.restPosition);
    this.gunMesh.rotation.set(0, 0, 0);
  }
}
