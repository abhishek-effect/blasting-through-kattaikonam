/**
 * GrenadeManager Module
 * Handles throwing, projectile physics, radius blast damage falloff,
 * pre-allocated retro explosion VFX pooling (zero runtime GPU shader recompilation or memory allocation),
 * and dropped grenade pickups every 3 kills.
 */
import * as THREE from 'three';

export class GrenadeManager {
  constructor(scene, world, audio) {
    this.scene = scene;
    this.world = world;
    this.audio = audio;

    // Inventory & limits
    this.maxGrenades = 5;
    this.grenades = 2; // Starting grenades

    // Balance settings
    this.throwSpeed = 16.0;
    this.fuseTime = 2.2;
    this.blastRadius = 6.5;
    this.maxBlastDamage = 140;

    // Active projectiles
    this.projectiles = [];

    // Active pickups in the world
    this.pickups = [];

    // Shared Geometries & Materials
    this.grenadeGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.18, 8);
    this.grenadeMat = new THREE.MeshStandardMaterial({
      color: 0x2e402b, // Olive green
      roughness: 0.6,
      metalness: 0.5
    });

    this.pickupMat = new THREE.MeshStandardMaterial({
      color: 0x44aa44,
      emissive: 0x114411,
      roughness: 0.4
    });

    // Pre-allocate explosion VFX pool so zero meshes or PointLights are added during action!
    this.initExplosionPool(5);
  }

  initExplosionPool(poolSize = 5) {
    this.explosionPool = [];
    const sphereGeo = new THREE.SphereGeometry(1, 12, 12);
    const ringGeo = new THREE.RingGeometry(0.5, 0.8, 20);

    for (let i = 0; i < poolSize; i++) {
      const sphereMat = new THREE.MeshBasicMaterial({
        color: 0xff7711,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const sphere = new THREE.Mesh(sphereGeo, sphereMat);
      sphere.visible = false;
      this.scene.add(sphere);

      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xffbb33,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.visible = false;
      this.scene.add(ring);

      const light = new THREE.PointLight(0xff6600, 0, 14);
      light.visible = false;
      this.scene.add(light);

      this.explosionPool.push({
        sphere,
        ring,
        light,
        active: false,
        timer: 0,
        duration: 0.45,
        maxRadius: this.blastRadius * 0.8
      });
    }
  }

  canThrow() {
    return this.grenades > 0;
  }

  throw(camera) {
    if (!this.canThrow()) return false;

    this.grenades--;
    this.audio.playGrenadeThrow();

    // Spawn projectile in front of player
    const mesh = new THREE.Mesh(this.grenadeGeo, this.grenadeMat);
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);

    const spawnPos = camera.position.clone().addScaledVector(forward, 0.6);
    mesh.position.copy(spawnPos);
    this.scene.add(mesh);

    // Initial velocity: throw forward with slight upward arc
    const velocity = forward.clone().multiplyScalar(this.throwSpeed);
    velocity.y += 3.2;

    this.projectiles.push({
      mesh,
      velocity,
      fuse: this.fuseTime,
      rotationSpeed: new THREE.Vector3(
        (Math.random() - 0.5) * 10,
        (Math.random() - 0.5) * 10,
        (Math.random() - 0.5) * 10
      )
    });

    return true;
  }

  spawnPickup(position) {
    const pickupGroup = new THREE.Group();
    const mesh = new THREE.Mesh(this.grenadeGeo, this.pickupMat);
    pickupGroup.add(mesh);

    // Subtle beacon ring on the floor
    const ringGeo = new THREE.RingGeometry(0.15, 0.25, 16);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x2ecc71,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.6
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -0.15;
    pickupGroup.add(ring);

    pickupGroup.position.set(position.x, 0.35, position.z);
    this.scene.add(pickupGroup);

    this.pickups.push({
      group: pickupGroup,
      position: pickupGroup.position,
      bobTimer: Math.random() * Math.PI
    });
  }

  triggerExplosion(pos, enemies = [], player = null) {
    this.audio.playGrenadeExplosion();

    // 1. Splash damage with distance falloff
    enemies.forEach((enemy) => {
      if (enemy.isDead) return;
      const dist = pos.distanceTo(enemy.position);
      if (dist <= this.blastRadius) {
        const falloff = 1.0 - (dist / this.blastRadius);
        const damage = Math.round(this.maxBlastDamage * falloff);
        enemy.takeDamage(damage, pos);
      }
    });

    // Damage player if caught in blast
    if (player && !player.isDead) {
      const dist = pos.distanceTo(player.position);
      if (dist <= this.blastRadius) {
        const falloff = 1.0 - (dist / this.blastRadius);
        const damage = Math.round((this.maxBlastDamage * 0.65) * falloff);
        player.takeDamage(damage);
      }
    }

    // 2. Visual Explosion Effect from pre-allocated pool (zero memory allocation)
    this.activateExplosionFromPool(pos);
  }

  activateExplosionFromPool(pos) {
    let exp = this.explosionPool.find((e) => !e.active);
    if (!exp) {
      // If all are busy, recycle the oldest
      exp = this.explosionPool[0];
    }

    exp.active = true;
    exp.timer = 0;

    exp.sphere.position.copy(pos);
    exp.sphere.scale.set(0.5, 0.5, 0.5);
    exp.sphere.material.opacity = 0.85;
    exp.sphere.visible = true;

    exp.ring.position.set(pos.x, 0.1, pos.z);
    exp.ring.scale.set(0.5, 0.5, 0.5);
    exp.ring.material.opacity = 0.9;
    exp.ring.visible = true;

    exp.light.position.copy(pos);
    exp.light.intensity = 5.0;
    exp.light.visible = true;
  }

  update(deltaTime, enemies = [], player = null) {
    // 1. Update Projectiles
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.fuse -= deltaTime;

      // Apply Gravity
      p.velocity.y -= 22 * deltaTime;

      // Update position
      p.mesh.position.addScaledVector(p.velocity, deltaTime);

      // Spin
      p.mesh.rotation.x += p.rotationSpeed.x * deltaTime;
      p.mesh.rotation.y += p.rotationSpeed.y * deltaTime;

      // Floor bounce
      if (p.mesh.position.y <= 0.12) {
        p.mesh.position.y = 0.12;
        p.velocity.y = -p.velocity.y * 0.45;
        p.velocity.x *= 0.7;
        p.velocity.z *= 0.7;
      }

      // Wall collision
      this.world.resolveSphereCollision(p.mesh.position, 0.15);

      // Check collision or proximity with living enemies
      let enemyNearby = false;
      const grenadePos = p.mesh.position;
      const proximityThreshold = 1.6;

      for (let e = 0; e < enemies.length; e++) {
        const enemy = enemies[e];
        if (enemy && !enemy.isDead && enemy.position) {
          const dist = grenadePos.distanceTo(enemy.position);
          if (dist <= proximityThreshold) {
            enemyNearby = true;
            break;
          }
        }
      }

      if (p.fuse <= 0 || enemyNearby) {
        const blastPos = p.mesh.position.clone();
        this.scene.remove(p.mesh);
        this.projectiles.splice(i, 1);
        this.triggerExplosion(blastPos, enemies, player);
      }
    }

    // 2. Update Pickups
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const pickup = this.pickups[i];
      pickup.bobTimer += deltaTime * 3;
      pickup.group.rotation.y += deltaTime * 2;
      pickup.group.position.y = 0.35 + Math.sin(pickup.bobTimer) * 0.08;

      if (player && !player.isDead) {
        const dist = player.position.distanceTo(pickup.position);
        if (dist < 1.6) {
          if (this.grenades < this.maxGrenades) {
            this.grenades++;
            this.audio.playPickup();
            this.scene.remove(pickup.group);
            this.pickups.splice(i, 1);
            if (player.onPickupNotification) {
              player.onPickupNotification('+1 GRENADE ACQUIRED!');
            }
          }
        }
      }
    }

    // 3. Update Pooled Explosions
    for (let i = 0; i < this.explosionPool.length; i++) {
      const exp = this.explosionPool[i];
      if (!exp.active) continue;

      exp.timer += deltaTime;
      const progress = exp.timer / exp.duration;

      if (progress >= 1.0) {
        exp.active = false;
        exp.sphere.visible = false;
        exp.ring.visible = false;
        exp.light.visible = false;
        exp.light.intensity = 0;
      } else {
        const radius = THREE.MathUtils.lerp(0.5, exp.maxRadius, progress);
        exp.sphere.scale.set(radius, radius, radius);
        exp.sphere.material.opacity = (1 - progress) * 0.8;

        const ringR = THREE.MathUtils.lerp(0.5, exp.maxRadius * 1.2, progress);
        exp.ring.scale.set(ringR, ringR, ringR);
        exp.ring.material.opacity = (1 - progress) * 0.9;

        exp.light.intensity = (1 - progress) * 5.0;
      }
    }
  }

  reset() {
    this.grenades = 2;
    this.projectiles.forEach((p) => this.scene.remove(p.mesh));
    this.projectiles = [];
    this.pickups.forEach((p) => this.scene.remove(p.group));
    this.pickups = [];

    // Reset pooled explosions
    this.explosionPool.forEach((e) => {
      e.active = false;
      e.sphere.visible = false;
      e.ring.visible = false;
      e.light.visible = false;
      e.light.intensity = 0;
    });
  }
}
