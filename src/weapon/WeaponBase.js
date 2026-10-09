/**
 * WeaponBase Module
 * Shared base class for firearm weapons (Rifle, Pistol).
 * Provides 3D first-person viewmodel rendering with held arms/hands,
 * authentic first-person perspective angle, hitscan raycasting, recoil,
 * muzzle flash, weapon sway, and impact particles.
 */
import * as THREE from 'three';
import { loadTexture } from '../config/assets.js';

export class WeaponBase {
  constructor(camera, scene, audio, config = {}) {
    this.camera = camera;
    this.scene = scene;
    this.audio = audio;

    // Weapon Configuration
    this.name = config.name || 'Weapon';
    this.type = config.type || 'firearm';
    this.spriteUrl = config.spriteUrl;
    this.magSize = config.magSize || 30;
    this.ammoInMag = config.ammoInMag !== undefined ? config.ammoInMag : this.magSize;
    this.reserveAmmo = config.reserveAmmo !== undefined ? config.reserveAmmo : 90;
    this.damage = config.damage || 25;
    this.fireInterval = config.fireInterval || 0.1; // Seconds between shots
    this.reloadDuration = config.reloadDuration || 1.8;
    this.range = config.range || 80;
    this.isAutomatic = config.isAutomatic !== undefined ? config.isAutomatic : true;

    // Viewmodel sizing & positioning
    this.viewWidth = config.viewWidth || 0.55;
    this.viewHeight = config.viewHeight || 0.35;
    this.restPosition = config.restPosition
      ? config.restPosition.clone()
      : new THREE.Vector3(0.19, -0.18, -0.46);

    // Realistic first-person viewing angle (aiming down range with inward cant)
    this.baseRotation = config.baseRotation
      ? config.baseRotation.clone()
      : new THREE.Euler(0.10, -0.42, 0.08, 'YXZ');

    this.muzzleOffset = config.muzzleOffset
      ? config.muzzleOffset.clone()
      : new THREE.Vector3(-0.245, 0.055, 0.01);

    this.armsBuilder = config.armsBuilder || null;

    // Dynamic Sway & Bobbing
    this.swayX = 0;
    this.swayY = 0;
    this.swayRotZ = 0;

    // Timers & States
    this.fireTimer = 0;
    this.reloadTimer = 0;
    this.isReloading = false;
    this.autoReloadDelay = 0;
    this.muzzleFlashTimer = 0;

    // Recoil state
    this.currentRecoilZ = 0;
    this.currentRecoilRot = 0;
    this.cameraRecoilPitch = 0;
    this.recoilKickZ = config.recoilKickZ || 0.05;
    this.recoilKickRot = config.recoilKickRot || 0.09;
    this.cameraKick = config.cameraKick || 0.012;

    // Raycaster for hitscan
    this.raycaster = new THREE.Raycaster();

    // Impact particles pool
    this.impactParticles = [];

    // Build 3D viewmodel
    this.viewmodelGroup = new THREE.Group();
    this.viewmodelGroup.visible = false;
    this.camera.add(this.viewmodelGroup);
    this.buildViewmodel();
    this.buildImpactParticleSystem();
  }

  buildViewmodel() {
    // 1. Viewmodel Pivot Group (holds gun + arms together at the authentic held angle)
    this.viewmodelPivot = new THREE.Group();
    this.viewmodelPivot.position.copy(this.restPosition);
    this.viewmodelPivot.rotation.copy(this.baseRotation);
    this.viewmodelGroup.add(this.viewmodelPivot);

    // 2. Weapon Sprite Plane
    const gunGeo = new THREE.PlaneGeometry(this.viewWidth, this.viewHeight);
    const gunTex = loadTexture(this.spriteUrl, 1, 1, '#333333', '#111111');
    const gunMat = new THREE.MeshBasicMaterial({
      map: gunTex,
      transparent: true,
      alphaTest: 0.1, // Clean transparent cutout edges
      depthTest: false,
      depthWrite: false,
    });

    this.gunMesh = new THREE.Mesh(gunGeo, gunMat);
    this.gunMesh.renderOrder = 998; // Renders over hands back, under gripping fingers
    this.gunMesh.position.set(0, 0, 0);
    this.viewmodelPivot.add(this.gunMesh);

    // 3. Held Arms & Hands (First-person player model)
    if (this.armsBuilder) {
      this.armsGroup = this.armsBuilder();
      this.viewmodelPivot.add(this.armsGroup);
    }

    // 4. Muzzle Flash Sprite (positioned precisely at barrel tip)
    const flashGeo = new THREE.PlaneGeometry(0.18, 0.18);
    const flashMat = new THREE.MeshBasicMaterial({
      color: 0xffe600,
      transparent: true,
      opacity: 0.95,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    this.muzzleFlash = new THREE.Mesh(flashGeo, flashMat);
    this.muzzleFlash.renderOrder = 1000;
    this.muzzleFlash.position.copy(this.muzzleOffset);
    this.muzzleFlash.visible = false;
    this.viewmodelPivot.add(this.muzzleFlash);

    // 5. Muzzle Flash Point Light
    this.flashLight = new THREE.PointLight(0xffaa22, 0, 8);
    this.flashLight.position.copy(this.muzzleOffset);
    this.viewmodelPivot.add(this.flashLight);
  }

  buildImpactParticleSystem() {
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

  setVisible(visible) {
    this.viewmodelGroup.visible = visible;
  }

  canShoot() {
    return this.fireTimer <= 0 && !this.isReloading && this.ammoInMag > 0;
  }

  playFiringSound() {
    this.audio.playGunshot();
  }

  shoot(enemies = [], colliders = []) {
    if (this.isReloading) return { fired: false, reason: 'reloading' };

    if (this.ammoInMag <= 0) {
      this.audio.playEmptyClick();
      this.fireTimer = 0.25;
      if (this.reserveAmmo > 0 && !this.isReloading) {
        this.reload();
      }
      return { fired: false, reason: 'empty' };
    }

    // Deduct ammo & set fire cooldown
    this.ammoInMag--;
    this.fireTimer = this.fireInterval;

    if (this.ammoInMag === 0 && this.reserveAmmo > 0) {
      this.autoReloadDelay = 0.25;
    }

    // Trigger audio
    this.playFiringSound();

    // Trigger Muzzle Flash
    this.muzzleFlash.visible = true;
    this.muzzleFlash.rotation.z = Math.random() * Math.PI * 2;
    this.flashLight.intensity = 2.5;
    this.muzzleFlashTimer = 0.05;

    // Recoil Kick (viewmodel kicks back and barrel rises)
    this.currentRecoilZ = this.recoilKickZ;
    this.currentRecoilRot = this.recoilKickRot;
    this.cameraRecoilPitch = this.cameraKick;

    // Raycast from Camera Center
    const spreadX = (Math.random() - 0.5) * 0.015;
    const spreadY = (Math.random() - 0.5) * 0.015;
    this.raycaster.setFromCamera(new THREE.Vector2(spreadX, spreadY), this.camera);
    this.raycaster.far = this.range;

    // Check hit against active enemies
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
        const enemy = hitResult.enemy;
        const hitPoint = hitResult.point;
        const isCritical = enemy.checkIsHeadshot ? enemy.checkIsHeadshot(hitPoint) : false;
        // Critical Hit gives 2.0x extra damage (1.5x - 2.5x range)
        const mult = isCritical ? 2.0 : 1.0;
        const finalDamage = Math.round(this.damage * mult);

        enemy.takeDamage(finalDamage, hitPoint, isCritical);
        this.spawnImpactSparks(
          hitPoint,
          new THREE.Vector3(0, 1, 0),
          isCritical ? 0xffea00 : 0xff2222
        );
        return {
          fired: true,
          hit: true,
          target: 'enemy',
          enemy,
          damage: finalDamage,
          isCritical,
          point: hitPoint
        };
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
    if (!this.viewmodelGroup.visible) return;

    // 1. Fire cooldown
    if (this.fireTimer > 0) {
      this.fireTimer -= deltaTime;
    }

    // 1b. Automatic reload when magazine empty
    if (this.ammoInMag === 0 && !this.isReloading && this.reserveAmmo > 0) {
      if (this.autoReloadDelay > 0) {
        this.autoReloadDelay -= deltaTime;
        if (this.autoReloadDelay <= 0) {
          this.reload();
        }
      } else {
        this.reload();
      }
    }

    // 2. Muzzle flash fade
    if (this.muzzleFlashTimer > 0) {
      this.muzzleFlashTimer -= deltaTime;
      if (this.muzzleFlashTimer <= 0) {
        this.muzzleFlash.visible = false;
        this.flashLight.intensity = 0;
      }
    }

    // 3. Calculate Viewmodel Animation, Recoil, Sway, and Movement Bob
    let reloadDip = 0;
    let reloadPitch = 0;
    if (this.isReloading) {
      this.reloadTimer -= deltaTime;
      const reloadProgress = 1 - (this.reloadTimer / this.reloadDuration);
      reloadDip = Math.sin(reloadProgress * Math.PI) * 0.16;
      reloadPitch = Math.sin(reloadProgress * Math.PI) * 0.18;

      if (this.reloadTimer <= 0) {
        const needed = this.magSize - this.ammoInMag;
        const available = Math.min(needed, this.reserveAmmo);
        this.ammoInMag += available;
        this.reserveAmmo -= available;
        this.isReloading = false;
      }
    }

    // Recoil spring recovery
    this.currentRecoilZ = THREE.MathUtils.lerp(this.currentRecoilZ, 0, Math.min(1.0, deltaTime * 16));
    this.currentRecoilRot = THREE.MathUtils.lerp(this.currentRecoilRot, 0, Math.min(1.0, deltaTime * 16));

    // Dynamic Mouse Sway
    const lookYaw = player ? (player.lastDeltaYaw || 0) : 0;
    const lookPitch = player ? (player.lastDeltaPitch || 0) : 0;
    this.swayX = THREE.MathUtils.lerp(this.swayX, -lookYaw * 0.022, Math.min(1.0, deltaTime * 14.0));
    this.swayY = THREE.MathUtils.lerp(this.swayY, lookPitch * 0.022, Math.min(1.0, deltaTime * 14.0));
    this.swayRotZ = THREE.MathUtils.lerp(this.swayRotZ, -lookYaw * 0.045, Math.min(1.0, deltaTime * 14.0));

    // Movement Bobbing
    let bobX = 0;
    let bobY = 0;
    let crouchSlideY = 0;
    let slideRotZ = 0;

    if (player) {
      if (player.bobTimer > 0 && player.isGrounded) {
        const bobSpeed = player.input && player.input.isSprinting() ? 1.3 : 1.0;
        bobX = Math.cos(player.bobTimer * 0.5) * 0.007;
        bobY = Math.sin(player.bobTimer) * 0.005;
      }

      if (player.isSliding) {
        crouchSlideY = -0.025;
        slideRotZ = -0.04;
      } else if (player.isCrouching) {
        crouchSlideY = -0.015;
      }
    }

    // Apply combined transforms to the viewmodel pivot
    this.viewmodelPivot.position.set(
      this.restPosition.x + this.swayX + bobX,
      this.restPosition.y + this.swayY + bobY - reloadDip + crouchSlideY,
      this.restPosition.z + this.currentRecoilZ
    );

    this.viewmodelPivot.rotation.set(
      this.baseRotation.x + this.currentRecoilRot - reloadPitch,
      this.baseRotation.y,
      this.baseRotation.z + this.swayRotZ + slideRotZ,
      'YXZ'
    );

    // 4. Camera recoil absorption
    if (this.cameraRecoilPitch > 0 && player) {
      player.pitch += this.cameraRecoilPitch;
      this.cameraRecoilPitch = 0;
    }

    // 5. Impact particles
    for (let p of this.impactParticles) {
      if (p.mesh.visible) {
        p.life += deltaTime;
        if (p.life >= p.maxLife) {
          p.mesh.visible = false;
        } else {
          p.mesh.position.addScaledVector(p.velocity, deltaTime);
          p.velocity.y -= 9.8 * deltaTime;
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
    this.currentRecoilZ = 0;
    this.currentRecoilRot = 0;
    this.swayX = 0;
    this.swayY = 0;
    this.swayRotZ = 0;
    this.viewmodelPivot.position.copy(this.restPosition);
    this.viewmodelPivot.rotation.copy(this.baseRotation);
  }

  destroy() {
    this.camera.remove(this.viewmodelGroup);
    this.impactParticles.forEach((p) => this.scene.remove(p.mesh));
  }
}
