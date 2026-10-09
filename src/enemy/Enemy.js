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

const sharedHitGeo = new THREE.SphereGeometry(0.7, 8, 8);
const sharedHitMat = new THREE.MeshBasicMaterial({ visible: false });
const sharedTracerMat = new THREE.LineBasicMaterial({
  color: 0xffe600,
  transparent: true,
  opacity: 0.85,
});

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

    // Melee combat parameters
    this.meleeDistance = config.attackDistance || 1.8;
    this.meleeDamage = config.damage || 15;
    this.meleeInterval = config.attackInterval || 1.0;

    // Ranged combat parameters
    this.rangedPreferredDistance = 9.0;
    this.rangedMinDistance = 4.5;
    this.rangedMaxDistance = 15.0;
    this.rangedDamage = 11;
    this.rangedInterval = 1.35;

    // Independent Physics & State
    this.radius = 0.45;
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

    // 1. Attached Pistol Sprite for Ranged Attackers (Visible on their image)
    const pistolTex = loadTexture(ASSET_PATHS.weapons.pistol, 1, 1, '#333333', '#111111');
    this.weaponMaterial = new THREE.SpriteMaterial({
      map: pistolTex,
      transparent: true,
      alphaTest: 0.1,
    });
    this.weaponSprite = new THREE.Sprite(this.weaponMaterial);
    // Position pistol in the lower-right area of the enemy's torso/hand
    this.weaponSprite.position.set(0.28, -0.12, 0.05);
    this.weaponSprite.scale.set(0.48, 0.48, 1);
    this.weaponSprite.visible = this.attackStyle === 'ranged';
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
    this.muzzleSprite.position.set(0.46, -0.10, 0.08);
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

    // Invisible hit sphere for player raycasting / weapon hits (shared geometry & material)
    this.hitMesh = new THREE.Mesh(sharedHitGeo, sharedHitMat);
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

    // Randomize attack style on spawn
    this.attackStyle = Math.random() < 0.5 ? 'melee' : 'ranged';
    if (this.weaponSprite) {
      this.weaponSprite.visible = this.attackStyle === 'ranged';
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

  takeDamage(amount, hitPoint = null) {
    if (this.isDead) return;

    this.health -= amount;
    this.hurtTimer = 0.18;
    this.material.color.setRGB(1.0, 0.2, 0.2); // Flash red
    this.audio.playEnemyHit();

    // Knockback
    if (hitPoint) {
      const pushDir = new THREE.Vector3().subVectors(this.position, hitPoint).normalize();
      this.position.x += pushDir.x * 0.25;
      this.position.z += pushDir.z * 0.25;
      this.world.resolveSphereCollision(this.position, this.radius);
    }

    if (this.health <= 0) {
      this.die();
    }
  }

  die() {
    this.isDead = true;
    this.state = ENEMY_STATES.DEAD;
    this.deathTimer = 0;
    if (this.weaponSprite) this.weaponSprite.visible = false;
    if (this.muzzleSprite) this.muzzleSprite.visible = false;
    if (this.tracerLine) this.tracerLine.visible = false;
    this.audio.playEnemyDeath();
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

    const from = new THREE.Vector3(this.position.x, 1.2, this.position.z);
    const to = new THREE.Vector3(targetPos.x, 1.2, targetPos.z);
    const dir = new THREE.Vector3().subVectors(to, from);
    const dist = dir.length();
    if (dist < 0.1) return true;
    dir.normalize();

    const ray = new THREE.Ray(from, dir);
    const hitPt = new THREE.Vector3();

    for (let i = 0; i < this.world.colliders.length; i++) {
      const box = this.world.colliders[i];
      if (ray.intersectBox(box, hitPt)) {
        if (from.distanceTo(hitPt) < dist - 0.25) {
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
        const canSeePlayer = this.hasLineOfSight(playerPosition);

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
    const dir = new THREE.Vector3().subVectors(targetPos, this.position);
    dir.y = 0;
    dir.normalize();

    this.position.x += dir.x * this.speed * deltaTime;
    this.position.z += dir.z * this.speed * deltaTime;

    this.world.resolveSphereCollision(this.position, this.radius);
  }

  moveAwayFrom(targetPos, deltaTime) {
    const dir = new THREE.Vector3().subVectors(this.position, targetPos);
    dir.y = 0;
    dir.normalize();

    this.position.x += dir.x * (this.speed * 0.65) * deltaTime;
    this.position.z += dir.z * (this.speed * 0.65) * deltaTime;

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

    // 2. Play gunshot sound
    if (this.audio && this.audio.playPistolShot) {
      this.audio.playPistolShot();
    }

    // 3. Muzzle flash
    if (this.muzzleSprite) {
      this.muzzleSprite.visible = true;
      this.muzzleTimer = 0.08;
    }

    // 4. Bullet tracer line from enemy gun towards player chest
    if (this.tracerLine) {
      const startPt = new THREE.Vector3(
        this.position.x + 0.25,
        this.position.y + 0.15,
        this.position.z
      );
      const endPt = new THREE.Vector3(
        playerPosition.x + (Math.random() - 0.5) * 0.2,
        playerPosition.y - 0.25 + (Math.random() - 0.5) * 0.2,
        playerPosition.z + (Math.random() - 0.5) * 0.2
      );
      this.tracerLine.geometry.setFromPoints([startPt, endPt]);
      this.tracerLine.visible = true;
      this.tracerTimer = 0.08;
    }

    // 5. Deal ranged damage to player
    if (onDamagePlayer) {
      onDamagePlayer(this.rangedDamage, this.position);
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
    if (this.material) this.material.dispose();
    if (this.weaponMaterial) this.weaponMaterial.dispose();
    if (this.muzzleMaterial) this.muzzleMaterial.dispose();
  }
}
