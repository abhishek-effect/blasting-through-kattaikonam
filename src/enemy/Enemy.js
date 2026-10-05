/**
 * Enemy Module
 * Instance-based 2D Billboard sprite enemy.
 * Multiple instances of the same enemy type can exist simultaneously,
 * each with independent health, AI state, animation, and position.
 */
import * as THREE from 'three';
import { loadTexture, createProceduralEnemySprite } from '../config/assets.js';

export const ENEMY_STATES = {
  IDLE: 'IDLE',
  CHASE: 'CHASE',
  ATTACK: 'ATTACK',
  HURT: 'HURT',
  DEAD: 'DEAD',
};

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
    this.scaleHeight = config.scale || 2.2;
    this.scaleWidth = this.scaleHeight * 0.75;
    this.detectionRadius = config.detectionRadius || 24;
    this.attackDistance = config.attackDistance || 1.8;
    this.attackDamage = config.damage || 15;
    this.attackInterval = config.attackInterval || 1.0;

    // Independent Physics & State
    this.radius = 0.45;
    this.position = new THREE.Vector3();
    this.state = ENEMY_STATES.IDLE;
    this.isDead = false;

    // Timers
    this.attackTimer = 0;
    this.hurtTimer = 0;
    this.deathTimer = 0;
    this.walkAnimTimer = Math.random() * 10; // Desynchronize walk animations across instances

    // 3D Billboard Sprite
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
    this.sprite.scale.set(this.scaleWidth, this.scaleHeight, 1);
    this.sprite.renderOrder = 1;
    this.scene.add(this.sprite);

    // Invisible hit sphere for raycasting
    const hitGeo = new THREE.SphereGeometry(0.7, 8, 8);
    const hitMat = new THREE.MeshBasicMaterial({ visible: false });
    this.hitMesh = new THREE.Mesh(hitGeo, hitMat);
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

    // 2. Distance to Player
    const distToPlayer = this.position.distanceTo(playerPosition);

    // 3. AI State Transitions
    if (this.state === ENEMY_STATES.IDLE) {
      if (distToPlayer <= this.detectionRadius) {
        this.state = ENEMY_STATES.CHASE;
      }
    } else if (this.state === ENEMY_STATES.CHASE) {
      if (distToPlayer <= this.attackDistance) {
        this.state = ENEMY_STATES.ATTACK;
      } else {
        this.moveTowards(playerPosition, deltaTime);
      }
    } else if (this.state === ENEMY_STATES.ATTACK) {
      if (distToPlayer > this.attackDistance + 0.5) {
        this.state = ENEMY_STATES.CHASE;
      } else {
        this.attackTimer += deltaTime;
        if (this.attackTimer >= this.attackInterval) {
          this.attackTimer = 0;
          this.performAttack(onDamagePlayer);
        }
      }
    }

    // 4. Walking Animation (Bob & Squash)
    if (this.state === ENEMY_STATES.CHASE) {
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

  performAttack(onDamagePlayer) {
    this.sprite.scale.set(this.scaleWidth * 1.25, this.scaleHeight * 1.25, 1);
    if (onDamagePlayer) {
      onDamagePlayer(this.attackDamage);
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
    if (this.material) this.material.dispose();
  }
}
