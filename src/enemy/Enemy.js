/**
 * Enemy Module
 * Instance-based 2D Billboard sprite enemy.
 * Multiple instances of the same enemy type can exist simultaneously,
 * each with independent health, AI state, animation, and position.
 * Supports dual attack styles:
 * 1. Melee Rusher: Closes in to strike in melee range.
 * 2. Ranged Shooter: Displays equipped pistol on sprite, holds distance, checks line of sight, and shoots.
 */
import * as THREE from 'three';
import { ASSET_PATHS, loadTexture, getImageMetrics, createProceduralEnemySprite } from '../config/assets.js';

export const ENEMY_STATES = {
  IDLE: 'IDLE',
  CHASE: 'CHASE',
  ATTACK: 'ATTACK',
  HURT: 'HURT',
  DEAD: 'DEAD',
};

let sharedMuzzleTexture = null;

function getSharedMuzzleFlashTexture() {
  if (!sharedMuzzleTexture) {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    const gradient = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    gradient.addColorStop(0, '#ffffff');
    gradient.addColorStop(0.3, '#ffea75');
    gradient.addColorStop(0.7, '#ff6a00');
    gradient.addColorStop(1, 'rgba(255, 60, 0, 0)');

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(32, 32, 30, 0, Math.PI * 2);
    ctx.fill();

    sharedMuzzleTexture = new THREE.CanvasTexture(canvas);
  }
  return sharedMuzzleTexture;
}

const sharedHitGeo = new THREE.CylinderGeometry(0.65, 0.65, 2.2, 10);
const sharedHitMat = new THREE.MeshBasicMaterial({ visible: false });
const sharedTracerMat = new THREE.LineBasicMaterial({
  color: 0xffe600,
  transparent: true,
  opacity: 0.85,
});

const _enemyPushDir = new THREE.Vector3();
const _enemyHeadPos = new THREE.Vector3();
const _losFrom = new THREE.Vector3();
const _losTo = new THREE.Vector3();
const _losDir = new THREE.Vector3();
const _losRay = new THREE.Ray();
const _losHitPt = new THREE.Vector3();
const _enemyMoveDir = new THREE.Vector3();
const _tracerStart = new THREE.Vector3();
const _tracerEnd = new THREE.Vector3();

export class Enemy {
  constructor(scene, world, audio, config = {}, instanceId = 'enemy_001') {
    this.scene = scene;
    this.world = world;
    this.audio = audio;
    this.instanceId = instanceId;

    // Type attributes
    this.typeId = config.id || 'normal';
    this.name = config.name || 'Patrol';
    this.spriteUrl = config.sprite || createProceduralEnemySprite();
    this.maxHealth = config.hp || 100;
    this.health = this.maxHealth;
    this.speed = config.speed || 2.8;

    // Standard human figure scale (1.68m) calibrated to match ab.png, aswin.png, and player eye height (1.65m)
    this.targetFigureHeight = 1.68;
    this.scaleHeight = 2.1;
    this.scaleWidth = this.scaleHeight * 0.75;
    this.detectionRadius = config.detectionRadius || 24;

    // Attack Style: Randomly decides between 'melee' and 'ranged' upon creation
    this.attackStyle = Math.random() < 0.5 ? 'melee' : 'ranged';

    // Special Boss & Sijinil identification
    this.isSijinil = !!config.isSijinil || (this.typeId && this.typeId.toLowerCase().includes('sijinil'));
    this.isBoss = !!config.isBoss || (this.typeId && this.typeId.toLowerCase().includes('boss'));

    if (this.isSijinil) {
      this.name = 'SIJINIL';
      this.attackStyle = 'ranged';
      this.speed = 3.2;
      this.maxHealth = 140;
      this.health = 140;
      this.rangedDamage = 14;
      this.rangedInterval = 0.85;
    }

    if (this.isBoss) {
      this.name = 'CHIEF OVERSEER';
      this.maxHealth = 250; // 2.5x normal enemy HP (100 -> 250)
      this.health = 250;
      this.speed = 2.4;
      this.targetFigureHeight = 2.45;
      this.scaleHeight = 3.1;
      this.scaleWidth = this.scaleHeight * 0.85;
      this.attackStyle = 'ranged';
      this.rangedDamage = 16;
      this.rangedInterval = 1.25;
      this.bossGrenadeTimer = 1.0;
      this.activeBossGrenades = [];
    }

    // Melee combat parameters
    this.meleeDistance = config.attackDistance || 1.8;
    this.meleeDamage = config.damage || 15;
    this.meleeInterval = config.attackInterval || 1.0;

    // Ranged combat parameters
    this.rangedPreferredDistance = 9.0;
    this.rangedMinDistance = 4.5;
    this.rangedMaxDistance = 15.0;
    this.rangedDamage = this.isSijinil ? 14 : (this.isBoss ? 16 : 11);
    this.rangedInterval = this.isSijinil ? 0.85 : (this.isBoss ? 1.25 : 1.35);

    // Independent Physics & State
    this.radius = this.isBoss ? 0.75 : 0.45;
    this.position = new THREE.Vector3();
    this.state = ENEMY_STATES.IDLE;
    this.isDead = false;

    // Timers
    this.attackTimer = Math.random() * 0.5; // Stagger initial attacks across enemies
    this.hurtTimer = 0;
    this.deathTimer = 0;
    this.muzzleTimer = 0;
    this.tracerTimer = 0;
    this.walkAnimTimer = Math.random() * 10; // Desynchronize walk animations

    // 3D Billboard Sprite & Visual Attachments
    this.buildSprite();
  }

  buildSprite() {
    const texture = loadTexture(this.spriteUrl, 1, 1, '#ff4444', '#222222');

    // SpriteMaterial automatically keeps billboard facing camera
    this.material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      alphaTest: 0.15, // Clean transparent cutout
    });

    this.sprite = new THREE.Sprite(this.material);
    this.sprite.renderOrder = 1;

    // Apply proportional scaling so all characters match ab.png/aswin.png size
    const applyMetrics = (metrics) => {
      if (!metrics) return;
      this.scaleHeight = this.targetFigureHeight / Math.max(0.35, metrics.contentRatio);
      this.scaleWidth = this.scaleHeight * metrics.aspect;
      if (this.sprite) {
        this.sprite.scale.set(this.scaleWidth, this.scaleHeight, 1);
      }
      this.position.y = this.scaleHeight / 2;
      if (this.sprite) {
        this.sprite.position.y = this.position.y;
      }
      if (this.hitMesh) {
        this.hitMesh.position.y = this.position.y;
      }
    };

    const initialMetrics = texture.userData.metrics || getImageMetrics(this.spriteUrl);
    if (initialMetrics) {
      applyMetrics(initialMetrics);
    } else {
      texture.userData.onMetrics = (m) => applyMetrics(m);
      this.sprite.scale.set(this.scaleWidth, this.scaleHeight, 1);
    }

    this.scene.add(this.sprite);

    // 1. Attached Weapon Sprite (AK-47 for Sijinil, Pistol for standard ranged, hidden for Boss)
    const isAk = this.isSijinil;
    const weaponTexUrl = isAk ? ASSET_PATHS.weapons.ak47 : ASSET_PATHS.weapons.pistol;
    const weaponTex = loadTexture(weaponTexUrl, 1, 1, '#333333', '#111111');
    this.weaponMaterial = new THREE.SpriteMaterial({
      map: weaponTex,
      transparent: true,
      alphaTest: 0.1,
    });
    this.weaponSprite = new THREE.Sprite(this.weaponMaterial);
    if (isAk) {
      this.weaponSprite.position.set(0.34, -0.10, 0.05);
      this.weaponSprite.scale.set(0.72, 0.44, 1);
    } else {
      this.weaponSprite.position.set(0.28, -0.12, 0.05);
      this.weaponSprite.scale.set(0.48, 0.48, 1);
    }
    this.weaponSprite.visible = this.attackStyle === 'ranged' && !this.isBoss;
    this.sprite.add(this.weaponSprite);

    // 2. Muzzle Flash Sprite (shared texture to eliminate canvas allocations)
    const muzzleTex = getSharedMuzzleFlashTexture();
    this.muzzleMaterial = new THREE.SpriteMaterial({
      map: muzzleTex,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.muzzleSprite = new THREE.Sprite(this.muzzleMaterial);
    this.muzzleSprite.position.set(isAk ? 0.60 : 0.46, -0.10, 0.08);
    this.muzzleSprite.scale.set(0.38, 0.38, 1);
    this.muzzleSprite.visible = false;
    this.sprite.add(this.muzzleSprite);

    // 3. Bullet Tracer Line for Ranged Gunfire
    const tracerGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(),
      new THREE.Vector3()
    ]);
    this.tracerLine = new THREE.Line(tracerGeo, sharedTracerMat);
    this.tracerLine.visible = false;
    this.scene.add(this.tracerLine);

    // Hit mesh for player raycasting / weapon hits (custom size for boss)
    const hitGeo = this.isBoss
      ? new THREE.CylinderGeometry(0.95, 0.95, 3.4, 10)
      : sharedHitGeo;
    this.hitMesh = new THREE.Mesh(hitGeo, sharedHitMat);
    this.hitMesh.userData.enemy = this;
    this.scene.add(this.hitMesh);
  }

  spawn(x, z) {
    this.position.set(x, this.scaleHeight / 2, z);
    this.sprite.position.copy(this.position);
    this.hitMesh.position.copy(this.position);
    this.health = this.maxHealth;
    this.state = ENEMY_STATES.IDLE;
    this.isDead = false;

    // Sijinil and Boss always use ranged
    if (this.isSijinil || this.isBoss) {
      this.attackStyle = 'ranged';
    } else {
      this.attackStyle = Math.random() < 0.5 ? 'melee' : 'ranged';
    }
    if (this.weaponSprite) {
      this.weaponSprite.visible = this.attackStyle === 'ranged' && !this.isBoss;
    }
    if (this.muzzleSprite) {
      this.muzzleSprite.visible = false;
    }
    if (this.tracerLine) {
      this.tracerLine.visible = false;
    }

    this.sprite.visible = true;
    this.material.opacity = 1.0;
    this.material.color.setRGB(1, 1, 1);
  }

  takeDamage(amount, hitPoint = null, isCritical = false) {
    if (this.isDead) return;

    this.health -= amount;
    this.hurtTimer = 0.18;
    if (isCritical) {
      this.material.color.setRGB(1.0, 0.85, 0.15); // Flash vibrant gold on critical headshot
    } else {
      this.material.color.setRGB(1.0, 0.2, 0.2); // Flash red on normal hit
    }
    this.audio.playEnemyHit();

    // Knockback
    if (hitPoint) {
      _enemyPushDir.subVectors(this.position, hitPoint).normalize();
      this.position.x += _enemyPushDir.x * 0.25;
      this.position.z += _enemyPushDir.z * 0.25;
      this.world.resolveSphereCollision(this.position, this.radius);
    }

    if (this.onDamageReceived) {
      this.onDamageReceived(amount, isCritical, hitPoint);
    }

    if (this.health <= 0) {
      this.die();
    }
  }

  /**
   * Checks whether the hit point struck the top head area of the enemy
   */
  checkIsHeadshot(hitPoint) {
    if (!hitPoint) return false;
    const headThreshold = this.position.y + (this.scaleHeight * 0.22);
    return hitPoint.y >= headThreshold;
  }

  /**
   * Returns world position of enemy's head for floating damage numbers (zero allocation)
   */
  getHeadPosition(targetVec = null) {
    const out = targetVec || _enemyHeadPos;
    out.set(
      this.position.x,
      this.position.y + (this.scaleHeight * 0.45),
      this.position.z
    );
    return out;
  }

  die() {
    if (this.isDead) return;
    this.isDead = true;
    this.state = ENEMY_STATES.DEAD;
    this.deathTimer = 0;
    if (this.weaponSprite) this.weaponSprite.visible = false;
    if (this.muzzleSprite) this.muzzleSprite.visible = false;
    if (this.tracerLine) this.tracerLine.visible = false;
    this.audio.playEnemyDeath();
    if (this.isSijinil && this.onDropItem) {
      this.onDropItem('pendrive', this.position.clone());
    }
    if (this.isBoss && this.onDropItem) {
      this.onDropItem('photocopy', this.position.clone());
    }
    if (this.onDeath) {
      this.onDeath(this);
    }
  }

  checkRaycastHit(raycaster) {
    if (this.isDead) return null;
    const intersects = raycaster.intersectObject(this.hitMesh);
    if (intersects.length > 0) {
      return intersects[0];
    }
    return null;
  }

  /**
   * Raycast check against world colliders to determine if clear line of sight exists to player
   */
  hasLineOfSight(targetPos) {
    if (!this.world || !this.world.colliders || this.world.colliders.length === 0) {
      return true;
    }

    _losFrom.set(this.position.x, 1.2, this.position.z);
    _losTo.set(targetPos.x, 1.2, targetPos.z);
    _losDir.subVectors(_losTo, _losFrom);
    const dist = _losDir.length();
    if (dist < 0.1) return true;
    _losDir.normalize();

    _losRay.origin.copy(_losFrom);
    _losRay.direction.copy(_losDir);

    const colliders = this.world.getCollidersNear
      ? this.world.getCollidersNear(this.position, dist)
      : this.world.colliders;

    for (let i = 0; i < colliders.length; i++) {
      const box = colliders[i];
      if (_losRay.intersectBox(box, _losHitPt)) {
        if (_losFrom.distanceTo(_losHitPt) < dist - 0.25) {
          // Wall blocks line of sight
          return false;
        }
      }
    }
    return true;
  }

  update(deltaTime, playerPosition, onDamagePlayer) {
    if (this.isDead) {
      this.updateDeathAnimation(deltaTime);
      return;
    }

    // Boss Grenade Attack: Throws grenades every 5 seconds at the floor on a location marked with color
    if (this.isBoss && !this.isDead) {
      this.bossGrenadeTimer = (this.bossGrenadeTimer || 0) + deltaTime;
      if (this.bossGrenadeTimer >= 5.0) {
        this.bossGrenadeTimer = 0;
        this.performBossGrenadeAttack(playerPosition, onDamagePlayer);
      }
      this.updateBossGrenades(deltaTime, playerPosition);
    }

    // 1. Hurt Flash Reset
    if (this.hurtTimer > 0) {
      this.hurtTimer -= deltaTime;
      if (this.hurtTimer <= 0) {
        this.material.color.setRGB(1, 1, 1);
      }
    }

    // 2. Muzzle flash timer
    if (this.muzzleTimer > 0) {
      this.muzzleTimer -= deltaTime;
      if (this.muzzleTimer <= 0 && this.muzzleSprite) {
        this.muzzleSprite.visible = false;
      }
    }

    // 3. Bullet tracer timer
    if (this.tracerTimer > 0) {
      this.tracerTimer -= deltaTime;
      if (this.tracerTimer <= 0 && this.tracerLine) {
        this.tracerLine.visible = false;
      }
    }

    // 4. Distance to Player
    const distToPlayer = this.position.distanceTo(playerPosition);

    // 5. AI Decision Branching (Melee vs Ranged)
    let isMoving = false;

    if (this.attackStyle === 'ranged') {
      // --- RANGED SHOOTER AI ---
      if (this.state === ENEMY_STATES.IDLE) {
        if (distToPlayer <= this.detectionRadius) {
          this.state = ENEMY_STATES.CHASE;
        }
      } else if (this.state === ENEMY_STATES.CHASE || this.state === ENEMY_STATES.ATTACK) {
        // Stagger & cache line-of-sight check to eliminate frame raycast spikes
        this.losTimer = (this.losTimer || (Math.random() * 0.12)) - deltaTime;
        if (this.losTimer <= 0) {
          this.losTimer = 0.12;
          this.cachedCanSeePlayer = this.hasLineOfSight(playerPosition);
        }
        const canSeePlayer = this.cachedCanSeePlayer !== undefined ? this.cachedCanSeePlayer : true;

        if (!canSeePlayer || distToPlayer > this.rangedMaxDistance) {
          // Cannot see player or too far: move towards player to regain line of sight
          this.state = ENEMY_STATES.CHASE;
          this.moveTowards(playerPosition, deltaTime);
          isMoving = true;
        } else {
          // Has clear line of sight and within shooting distance!
          this.state = ENEMY_STATES.ATTACK;

          if (distToPlayer < this.rangedMinDistance) {
            // Player rushed in too close: back up slightly while shooting
            this.moveAwayFrom(playerPosition, deltaTime * 0.65);
            isMoving = true;
          }

          // Fire gun on interval
          this.attackTimer += deltaTime;
          if (this.attackTimer >= this.rangedInterval) {
            this.attackTimer = 0;
            this.performRangedAttack(playerPosition, onDamagePlayer);
          }
        }
      }
    } else {
      // --- MELEE RUSHER AI ---
      if (this.state === ENEMY_STATES.IDLE) {
        if (distToPlayer <= this.detectionRadius) {
          this.state = ENEMY_STATES.CHASE;
        }
      } else if (this.state === ENEMY_STATES.CHASE) {
        if (distToPlayer <= this.meleeDistance) {
          this.state = ENEMY_STATES.ATTACK;
        } else {
          this.moveTowards(playerPosition, deltaTime);
          isMoving = true;
        }
      } else if (this.state === ENEMY_STATES.ATTACK) {
        if (distToPlayer > this.meleeDistance + 0.6) {
          this.state = ENEMY_STATES.CHASE;
        } else {
          this.attackTimer += deltaTime;
          if (this.attackTimer >= this.meleeInterval) {
            this.attackTimer = 0;
            this.performMeleeAttack(onDamagePlayer);
          }
        }
      }
    }

    // 6. Walking Animation (Bob & Squash)
    if (isMoving) {
      this.walkAnimTimer += deltaTime * 8;
      const bob = Math.sin(this.walkAnimTimer) * 0.08;
      const squash = 1 + Math.sin(this.walkAnimTimer * 2) * 0.05;
      this.sprite.scale.set(this.scaleWidth * (2 - squash), this.scaleHeight * squash, 1);
      this.sprite.position.y = (this.scaleHeight / 2) + bob;
    } else {
      this.sprite.scale.set(this.scaleWidth, this.scaleHeight, 1);
      this.sprite.position.y = this.scaleHeight / 2;
    }

    // Update positions
    this.sprite.position.x = this.position.x;
    this.sprite.position.z = this.position.z;
    this.hitMesh.position.copy(this.position);
  }

  moveTowards(targetPos, deltaTime) {
    _enemyMoveDir.subVectors(targetPos, this.position);
    _enemyMoveDir.y = 0;
    _enemyMoveDir.normalize();

    this.position.x += _enemyMoveDir.x * this.speed * deltaTime;
    this.position.z += _enemyMoveDir.z * this.speed * deltaTime;

    this.world.resolveSphereCollision(this.position, this.radius);
  }

  moveAwayFrom(targetPos, deltaTime) {
    _enemyMoveDir.subVectors(this.position, targetPos);
    _enemyMoveDir.y = 0;
    _enemyMoveDir.normalize();

    this.position.x += _enemyMoveDir.x * (this.speed * 0.65) * deltaTime;
    this.position.z += _enemyMoveDir.z * (this.speed * 0.65) * deltaTime;

    this.world.resolveSphereCollision(this.position, this.radius);
  }

  performMeleeAttack(onDamagePlayer) {
    this.sprite.scale.set(this.scaleWidth * 1.25, this.scaleHeight * 1.25, 1);
    if (onDamagePlayer) {
      onDamagePlayer(this.meleeDamage, this.position);
    }
  }

  performRangedAttack(playerPosition, onDamagePlayer) {
    // 1. Snappy recoil animation
    this.sprite.scale.set(this.scaleWidth * 1.1, this.scaleHeight * 1.1, 1);

    // 2. Play gunshot sound (AK-47 for Sijinil, Pistol for others)
    if (this.isSijinil) {
      if (this.audio && this.audio.playGunshot) {
        this.audio.playGunshot();
      } else if (this.audio && this.audio.playPistolShot) {
        this.audio.playPistolShot();
      }
    } else if (this.audio && this.audio.playPistolShot) {
      this.audio.playPistolShot();
    }

    // 3. Muzzle flash
    if (this.muzzleSprite) {
      this.muzzleSprite.visible = true;
      this.muzzleTimer = 0.08;
    }

    // 4. Bullet tracer line from enemy gun towards player chest (zero allocation buffer update)
    if (this.tracerLine) {
      _tracerStart.set(
        this.position.x + (this.isSijinil ? 0.35 : 0.25),
        this.position.y + 0.15,
        this.position.z
      );
      _tracerEnd.set(
        playerPosition.x + (Math.random() - 0.5) * 0.2,
        playerPosition.y - 0.25 + (Math.random() - 0.5) * 0.2,
        playerPosition.z + (Math.random() - 0.5) * 0.2
      );
      const posAttr = this.tracerLine.geometry.attributes.position;
      posAttr.setXYZ(0, _tracerStart.x, _tracerStart.y, _tracerStart.z);
      posAttr.setXYZ(1, _tracerEnd.x, _tracerEnd.y, _tracerEnd.z);
      posAttr.needsUpdate = true;
      this.tracerLine.visible = true;
      this.tracerTimer = 0.08;
    }

    // 5. Deal ranged damage to player
    if (onDamagePlayer) {
      onDamagePlayer(this.rangedDamage, this.position);
    }
  }

  performBossGrenadeAttack(playerPosition, onDamagePlayer) {
    if (this.isDead || !this.scene) return;

    // Pick target position near player on the floor
    const targetPos = new THREE.Vector3(
      playerPosition.x + (Math.random() - 0.5) * 1.8,
      0.04,
      playerPosition.z + (Math.random() - 0.5) * 1.8
    );

    // Colored danger marker on the floor (bright pulsating crimson/orange ring)
    const markerGeo = new THREE.RingGeometry(0.2, 3.0, 32);
    markerGeo.rotateX(-Math.PI / 2);
    const markerMat = new THREE.MeshBasicMaterial({
      color: 0xff2200,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.75,
      depthWrite: false
    });
    const markerMesh = new THREE.Mesh(markerGeo, markerMat);
    markerMesh.position.set(targetPos.x, 0.04, targetPos.z);
    this.scene.add(markerMesh);

    // Grenade projectile mesh thrown from Boss
    const projGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.22, 8);
    const projMat = new THREE.MeshStandardMaterial({
      color: 0x2e402b,
      roughness: 0.5,
      metalness: 0.6
    });
    const projMesh = new THREE.Mesh(projGeo, projMat);
    projMesh.position.set(this.position.x, this.position.y + 0.8, this.position.z);
    this.scene.add(projMesh);

    const startPos = projMesh.position.clone();
    const duration = 1.4;

    if (!this.activeBossGrenades) this.activeBossGrenades = [];
    this.activeBossGrenades.push({
      marker: markerMesh,
      proj: projMesh,
      startPos,
      targetPos,
      timer: 0,
      duration,
      onDamagePlayer
    });

    if (this.audio && this.audio.playJump) {
      this.audio.playJump();
    }
  }

  updateBossGrenades(deltaTime, playerPosition) {
    if (!this.activeBossGrenades || this.activeBossGrenades.length === 0) return;

    for (let i = this.activeBossGrenades.length - 1; i >= 0; i--) {
      const g = this.activeBossGrenades[i];
      g.timer += deltaTime;
      const progress = Math.min(1.0, g.timer / g.duration);

      // Pulsate colored marker opacity
      if (g.marker && g.marker.material) {
        g.marker.material.opacity = 0.45 + Math.sin(g.timer * 16) * 0.35;
      }

      // Parabolic arc for projectile flying from Boss to marked spot
      if (g.proj) {
        g.proj.position.x = THREE.MathUtils.lerp(g.startPos.x, g.targetPos.x, progress);
        g.proj.position.z = THREE.MathUtils.lerp(g.startPos.z, g.targetPos.z, progress);
        g.proj.position.y = THREE.MathUtils.lerp(g.startPos.y, g.targetPos.y, progress) + Math.sin(progress * Math.PI) * 4.2;
        g.proj.rotation.x += deltaTime * 8;
        g.proj.rotation.y += deltaTime * 6;
      }

      if (progress >= 1.0) {
        // Explosion detonates on the marked location!
        if (g.marker) {
          this.scene.remove(g.marker);
          if (g.marker.geometry) g.marker.geometry.dispose();
          if (g.marker.material) g.marker.material.dispose();
        }
        if (g.proj) {
          this.scene.remove(g.proj);
          if (g.proj.geometry) g.proj.geometry.dispose();
          if (g.proj.material) g.proj.material.dispose();
        }

        // Audio & Visual Explosion
        if (this.audio) {
          if (this.audio.playBuffer) {
            this.audio.playBuffer('grenade', 0.85);
          } else if (this.audio.playEnemyDeath) {
            this.audio.playEnemyDeath();
          }
        }

        // Damage player if caught in marker radius (3.0m)
        if (playerPosition) {
          const dist = Math.hypot(playerPosition.x - g.targetPos.x, playerPosition.z - g.targetPos.z);
          if (dist <= 3.2 && g.onDamagePlayer) {
            g.onDamagePlayer(35, g.targetPos);
          }
        }

        this.activeBossGrenades.splice(i, 1);
      }
    }
  }

  updateDeathAnimation(deltaTime) {
    this.deathTimer += deltaTime;

    const progress = Math.min(1.0, this.deathTimer / 0.6);
    const squishY = Math.max(0.1, this.scaleHeight * (1.0 - progress * 0.85));
    const stretchX = this.scaleWidth * (1.0 + progress * 0.35);

    this.sprite.scale.set(stretchX, squishY, 1);
    this.sprite.position.y = squishY / 2;

    if (this.deathTimer > 1.2) {
      this.material.opacity = Math.max(0, 1.0 - (this.deathTimer - 1.2) * 2.0);
      if (this.material.opacity <= 0) {
        this.sprite.visible = false;
        this.hitMesh.visible = false;
      }
    }
  }

  destroy() {
    this.scene.remove(this.sprite);
    this.scene.remove(this.hitMesh);
    if (this.tracerLine) {
      this.scene.remove(this.tracerLine);
      if (this.tracerLine.geometry) this.tracerLine.geometry.dispose();
    }
    if (this.activeBossGrenades) {
      this.activeBossGrenades.forEach((g) => {
        if (g.marker) this.scene.remove(g.marker);
        if (g.proj) this.scene.remove(g.proj);
      });
      this.activeBossGrenades = [];
    }
    if (this.material) this.material.dispose();
    if (this.weaponMaterial) this.weaponMaterial.dispose();
    if (this.muzzleMaterial) this.muzzleMaterial.dispose();
  }
}
