/**
 * BattleRemotePlayer Module
 * Represents other connected players in 3D Battle Arena space.
 * Features:
 * - 3D player.fbx humanoid model scaled and textured according to Team (Red vs Blue).
 * - Chosen unique JPG or PNG character portrait billboard on the character model.
 * - Floating nametag sprite with Team badge, Player Name, Character Name, and real-time Health Bar.
 * - Hitbox raycast testing for weapon bullets (Rifle & Pistol) and headshot detection.
 * - Dynamic hit feedback (emissive flash, sparks), limb animations, and death posture.
 */
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { assetUrl, ASSET_PATHS, loadTexture } from '../config/assets.js';

let playerFbxTemplate = null;
let playerFbxPromise = null;

function getPlayerFBXTemplate() {
  if (playerFbxPromise) return playerFbxPromise;
  playerFbxPromise = new Promise((resolve) => {
    try {
      const loader = new FBXLoader();
      loader.load(
        assetUrl('/models/player.fbx'),
        (fbx) => {
          const box = new THREE.Box3().setFromObject(fbx);
          const size = box.getSize(new THREE.Vector3());
          const center = box.getCenter(new THREE.Vector3());

          const targetHeight = 1.8;
          const scale = size.y > 0.01 ? targetHeight / size.y : 0.01;
          fbx.scale.setScalar(scale);

          fbx.position.x = -center.x * scale;
          fbx.position.z = -center.z * scale;
          fbx.position.y = -box.min.y * scale;

          fbx.traverse((child) => {
            if (child.isMesh) {
              child.castShadow = false;
              child.receiveShadow = false;
            }
          });

          playerFbxTemplate = fbx;
          resolve(fbx);
        },
        undefined,
        (err) => {
          console.warn('[BattleRemotePlayer] player.fbx load failed, using procedural humanoid:', err);
          resolve(null);
        }
      );
    } catch (e) {
      console.warn('[BattleRemotePlayer] FBXLoader initialization error:', e);
      resolve(null);
    }
  });
  return playerFbxPromise;
}

export class BattleRemotePlayer {
  constructor(scene, data = {}) {
    this.scene = scene;
    this.id = data.id || `p_${Math.random().toString(36).substring(2, 6)}`;
    this.name = data.name || 'Operative';
    this.team = data.team || 'red';
    this.characterId = data.characterId || 'aahil_confront';
    this.isHost = !!data.isHost;

    this.health = 100;
    this.maxHealth = 100;
    this.isDead = false;
    this.isCrouching = false;
    this.isSliding = false;

    // Target transform for interpolation
    this.targetPos = new THREE.Vector3(0, 0, 0);
    this.targetYaw = 0;
    this.currentPos = new THREE.Vector3(0, 0, 0);
    this.currentYaw = 0;

    // Team colors
    this.teamColorHex = this.team === 'blue' ? 0x3498db : 0xe74c3c;
    this.teamColorStr = this.team === 'blue' ? '#3498db' : '#e74c3c';

    // 3D Groups
    this.group = new THREE.Group();
    this.bodyGroup = new THREE.Group();
    this.group.add(this.bodyGroup);
    this.scene.add(this.group);

    // Hitbox for raycast shooting
    this.boundingBox = new THREE.Box3();
    this.hitboxSize = new THREE.Vector3(0.75, 1.85, 0.75);

    // Muzzle flash on weapon
    this.muzzleFlash = null;
    this.muzzleTimer = 0;

    // Flash mesh on damage
    this.hitFlashTimer = 0;
    this.originalMaterials = [];

    // Animation timer
    this.animTime = 0;

    this.buildCharacterMesh();
    this.buildCharacterBadge();
    this.buildNameTag();
    this.buildMuzzleFlash();
  }

  buildCharacterMesh() {
    // 1. Stylized procedural fallback avatar
    this.proceduralGroup = new THREE.Group();
    this.bodyGroup.add(this.proceduralGroup);

    const shirtMat = new THREE.MeshStandardMaterial({
      color: this.teamColorHex,
      roughness: 0.6,
      metalness: 0.2
    });

    const skinMat = new THREE.MeshStandardMaterial({
      color: 0xffd1a4,
      roughness: 0.8
    });

    const pantsMat = new THREE.MeshStandardMaterial({
      color: 0x1e272e,
      roughness: 0.7
    });

    // Torso
    const torsoGeo = new THREE.BoxGeometry(0.55, 0.75, 0.3);
    this.torso = new THREE.Mesh(torsoGeo, shirtMat);
    this.torso.position.y = 1.05;
    this.proceduralGroup.add(this.torso);

    // Head
    const headGeo = new THREE.BoxGeometry(0.38, 0.38, 0.38);
    this.head = new THREE.Mesh(headGeo, skinMat);
    this.head.position.y = 1.62;
    this.proceduralGroup.add(this.head);

    // Team visor
    const visorGeo = new THREE.BoxGeometry(0.3, 0.12, 0.05);
    const visorMat = new THREE.MeshBasicMaterial({ color: this.teamColorHex });
    const visor = new THREE.Mesh(visorGeo, visorMat);
    visor.position.set(0, 1.63, 0.19);
    this.proceduralGroup.add(visor);

    // Arms
    const armGeo = new THREE.BoxGeometry(0.18, 0.65, 0.2);
    this.leftArm = new THREE.Mesh(armGeo, shirtMat);
    this.leftArm.position.set(-0.38, 1.05, 0);
    this.proceduralGroup.add(this.leftArm);

    this.rightArm = new THREE.Mesh(armGeo, shirtMat);
    this.rightArm.position.set(0.38, 1.05, 0);
    this.proceduralGroup.add(this.rightArm);

    // Legs
    const legGeo = new THREE.BoxGeometry(0.22, 0.7, 0.22);
    this.leftLeg = new THREE.Mesh(legGeo, pantsMat);
    this.leftLeg.position.set(-0.16, 0.35, 0);
    this.proceduralGroup.add(this.leftLeg);

    this.rightLeg = new THREE.Mesh(legGeo, pantsMat);
    this.rightLeg.position.set(0.16, 0.35, 0);
    this.proceduralGroup.add(this.rightLeg);

    // 2. Load 3D player.fbx model from directory
    getPlayerFBXTemplate().then((template) => {
      if (template && !this.isDestroyed) {
        if (this.proceduralGroup) {
          this.bodyGroup.remove(this.proceduralGroup);
          this.proceduralGroup = null;
        }

        const modelClone = template.clone(true);
        modelClone.traverse((child) => {
          if (child.isMesh && child.material) {
            child.material = Array.isArray(child.material)
              ? child.material.map((m) => m.clone())
              : child.material.clone();
            const mat = Array.isArray(child.material) ? child.material[0] : child.material;
            if (mat && mat.color) {
              mat.color.lerp(new THREE.Color(this.teamColorHex), 0.35);
            }
          }
        });

        this.customModel = modelClone;
        this.bodyGroup.add(modelClone);
      }
    });
  }

  /**
   * Builds the chosen character sprite portrait badge on the 3D player
   */
  buildCharacterBadge() {
    const charConfig = ASSET_PATHS.enemies.types[this.characterId];
    const spriteUrl = (charConfig && charConfig.sprite) ? charConfig.sprite : assetUrl('/images/enemies/aahil-confront.png');

    const badgeGeo = new THREE.PlaneGeometry(0.34, 0.44);
    const badgeTex = loadTexture(spriteUrl, 1, 1);
    const badgeMat = new THREE.MeshBasicMaterial({
      map: badgeTex,
      transparent: true,
      side: THREE.DoubleSide
    });

    this.badgeMesh = new THREE.Mesh(badgeGeo, badgeMat);
    this.badgeMesh.position.set(0, 1.15, 0.17); // On chest
    this.bodyGroup.add(this.badgeMesh);
  }

  buildNameTag() {
    this.nameCanvas = document.createElement('canvas');
    this.nameCanvas.width = 512;
    this.nameCanvas.height = 140;
    this.nameCtx = this.nameCanvas.getContext('2d');

    this.nameTexture = new THREE.CanvasTexture(this.nameCanvas);
    this.nameTexture.minFilter = THREE.LinearFilter;

    const spriteMat = new THREE.SpriteMaterial({
      map: this.nameTexture,
      transparent: true,
      depthTest: false
    });

    this.nameSprite = new THREE.Sprite(spriteMat);
    this.nameSprite.position.y = 2.25;
    this.nameSprite.scale.set(1.9, 0.52, 1);
    this.group.add(this.nameSprite);

    this.updateNameTag();
  }

  updateNameTag() {
    const ctx = this.nameCtx;
    ctx.clearRect(0, 0, 512, 140);

    const teamTag = this.team === 'blue' ? '🔵 BLUE' : '🔴 RED';
    const charName = ASSET_PATHS.enemies.types[this.characterId]?.name || 'Operative';

    // Background pill
    ctx.fillStyle = this.isDead ? 'rgba(80, 10, 10, 0.85)' : 'rgba(15, 18, 25, 0.85)';
    ctx.roundRect ? ctx.roundRect(16, 10, 480, 120, 16) : ctx.fillRect(16, 10, 480, 120);
    ctx.fill();

    // Team colored border
    ctx.strokeStyle = this.isDead ? '#ff3838' : this.teamColorStr;
    ctx.lineWidth = 4;
    ctx.stroke();

    // Team tag + Player Name
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 30px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    const title = this.isDead ? `💀 ${this.name} [ELIMINATED]` : `${teamTag} ${this.name}`;
    ctx.fillText(title, 256, 44);

    // Character subtitle
    ctx.fillStyle = this.teamColorStr;
    ctx.font = 'bold 20px monospace';
    ctx.fillText(`[${charName.toUpperCase()}]`, 256, 74);

    // Health bar track
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.fillRect(40, 92, 432, 18);

    // Health fill
    const pct = Math.max(0, Math.min(1, this.health / this.maxHealth));
    ctx.fillStyle = pct > 0.5 ? '#2ecc71' : (pct > 0.25 ? '#f39c12' : '#e74c3c');
    ctx.fillRect(40, 92, 432 * pct, 18);

    this.nameTexture.needsUpdate = true;
  }

  buildMuzzleFlash() {
    const flashGeo = new THREE.SphereGeometry(0.12, 6, 6);
    const flashMat = new THREE.MeshBasicMaterial({ color: 0xffea00 });
    this.muzzleFlash = new THREE.Mesh(flashGeo, flashMat);
    this.muzzleFlash.position.set(0.35, 1.15, 0.55);
    this.muzzleFlash.visible = false;
    this.bodyGroup.add(this.muzzleFlash);
  }

  playMuzzleFlash() {
    if (this.muzzleFlash) {
      this.muzzleFlash.visible = true;
      this.muzzleTimer = 0.08;
    }
  }

  updateFromNetwork(data) {
    if (data.pos) {
      this.targetPos.set(data.pos.x, data.pos.y, data.pos.z);
      if (this.currentPos.lengthSq() === 0) {
        this.currentPos.copy(this.targetPos);
        this.group.position.copy(this.currentPos);
      }
    }
    if (data.yaw !== undefined) {
      this.targetYaw = data.yaw;
      if (this.currentYaw === 0) {
        this.currentYaw = this.targetYaw;
      }
    }
    if (data.health !== undefined && data.health !== this.health) {
      this.health = data.health;
      this.updateNameTag();
    }
    if (data.isDead !== undefined && data.isDead !== this.isDead) {
      this.isDead = data.isDead;
      this.updateNameTag();
    }
    if (data.isCrouching !== undefined) this.isCrouching = data.isCrouching;
    if (data.isSliding !== undefined) this.isSliding = data.isSliding;
  }

  update(deltaTime) {
    if (this.isDestroyed) return;

    // Smooth transform interpolation
    const lerpRate = Math.min(1, deltaTime * 16.0);
    this.currentPos.lerp(this.targetPos, lerpRate);
    this.group.position.copy(this.currentPos);

    // Yaw rotation interpolation
    let diff = this.targetYaw - this.currentYaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.currentYaw += diff * lerpRate;
    this.group.rotation.y = this.currentYaw;

    // Update 3D Raycast Hitbox
    this.boundingBox.setFromCenterAndSize(
      new THREE.Vector3(this.currentPos.x, this.currentPos.y + 0.92, this.currentPos.z),
      this.hitboxSize
    );

    // Muzzle flash decay
    if (this.muzzleTimer > 0) {
      this.muzzleTimer -= deltaTime;
      if (this.muzzleTimer <= 0 && this.muzzleFlash) {
        this.muzzleFlash.visible = false;
      }
    }

    // Damage flash decay
    if (this.hitFlashTimer > 0) {
      this.hitFlashTimer -= deltaTime;
      if (this.hitFlashTimer <= 0) {
        this.resetHitFlash();
      }
    }

    // Posture animation
    if (this.isDead) {
      this.bodyGroup.rotation.x = -Math.PI / 2;
      this.bodyGroup.position.y = 0.2;
    } else if (this.isCrouching || this.isSliding) {
      this.bodyGroup.rotation.x = 0;
      this.bodyGroup.position.y = -0.45;
    } else {
      this.bodyGroup.rotation.x = 0;
      this.bodyGroup.position.y = 0;

      // Limb swings if moving
      const speed = this.currentPos.distanceTo(this.targetPos) / Math.max(0.01, deltaTime);
      if (speed > 0.8 && this.leftLeg && this.rightLeg) {
        this.animTime += deltaTime * 10.0;
        const swing = Math.sin(this.animTime) * 0.45;
        this.leftLeg.rotation.x = swing;
        this.rightLeg.rotation.x = -swing;
        if (this.leftArm && this.rightArm) {
          this.leftArm.rotation.x = -swing * 0.7;
          this.rightArm.rotation.x = swing * 0.7;
        }
      } else if (this.leftLeg && this.rightLeg) {
        this.leftLeg.rotation.x = 0;
        this.rightLeg.rotation.x = 0;
        if (this.leftArm && this.rightArm) {
          this.leftArm.rotation.x = 0;
          this.rightArm.rotation.x = 0;
        }
      }
    }
  }

  /**
   * Raycast intersection test for bullets (Rifle & Pistol)
   */
  checkRaycastHit(raycaster) {
    if (this.isDead) return null;
    const hitPoint = new THREE.Vector3();
    if (raycaster.ray.intersectBox(this.boundingBox, hitPoint)) {
      const dist = raycaster.ray.origin.distanceTo(hitPoint);
      return { distance: dist, point: hitPoint };
    }
    return null;
  }

  checkIsHeadshot(point) {
    return point.y >= (this.currentPos.y + 1.45);
  }

  takeDamage(amount, hitPoint = null, isCritical = false) {
    this.health = Math.max(0, this.health - amount);
    this.updateNameTag();
    this.triggerHitFlash();

    if (this.health <= 0) {
      this.isDead = true;
      this.updateNameTag();
    }
  }

  triggerHitFlash() {
    this.hitFlashTimer = 0.15;
    this.bodyGroup.traverse((child) => {
      if (child.isMesh && child.material) {
        if (!child.userData.origEmissive) {
          child.userData.origEmissive = child.material.emissive ? child.material.emissive.clone() : new THREE.Color(0);
        }
        if (child.material.emissive) {
          child.material.emissive.setHex(0xff3333);
        }
      }
    });
  }

  resetHitFlash() {
    this.bodyGroup.traverse((child) => {
      if (child.isMesh && child.material && child.userData.origEmissive) {
        if (child.material.emissive) {
          child.material.emissive.copy(child.userData.origEmissive);
        }
      }
    });
  }

  respawn(newPos) {
    this.health = this.maxHealth;
    this.isDead = false;
    this.currentPos.copy(newPos);
    this.targetPos.copy(newPos);
    this.group.position.copy(newPos);
    this.updateNameTag();
  }

  destroy() {
    this.isDestroyed = true;
    if (this.group && this.group.parent) {
      this.group.parent.remove(this.group);
    }
  }
}
