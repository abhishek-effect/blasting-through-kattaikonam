/**
 * RemotePlayer Module
 * Represents other connected multiplayer players in 3D world space.
 * Features:
 * - Clean stylized 3D humanoid avatar (torso, head, limbs, colored shirt).
 * - Floating nametag and health bar billboard above head.
 * - Smooth position & yaw interpolation.
 * - Posture animations: running limb swing, crouching, sliding, and downed (lying flat on ground).
 */
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { assetUrl } from '../config/assets.js';

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
          // Compute bounding box
          const box = new THREE.Box3().setFromObject(fbx);
          const size = box.getSize(new THREE.Vector3());
          const center = box.getCenter(new THREE.Vector3());

          // Standard human player height ~1.8m
          const targetHeight = 1.8;
          const scale = (size.y > 0.01) ? (targetHeight / size.y) : 0.01;
          fbx.scale.setScalar(scale);

          // Center on X and Z, align floor bottom to Y = 0
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
          console.warn('[RemotePlayer] player.fbx load failed, using procedural humanoid:', err);
          resolve(null);
        }
      );
    } catch (e) {
      console.warn('[RemotePlayer] FBXLoader initialization error:', e);
      resolve(null);
    }
  });
  return playerFbxPromise;
}

export class RemotePlayer {
  constructor(scene, id, name, isHost = false) {
    this.scene = scene;
    this.id = id;
    this.name = name;
    this.isHost = isHost;
    this.isDestroyed = false;

    this.health = 100;
    this.maxHealth = 100;
    this.isDowned = false;
    this.isEscaped = false;
    this.isSliding = false;
    this.isCrouching = false;

    // Target transform for interpolation
    this.targetPos = new THREE.Vector3(0, 0, 0);
    this.targetYaw = 0;
    this.currentPos = new THREE.Vector3(0, 0, 0);
    this.currentYaw = 0;

    this.group = new THREE.Group();
    this.scene.add(this.group);

    // Color theme based on ID
    const hue = Math.abs(this.hashCode(id)) % 360;
    this.primaryColor = new THREE.Color(`hsl(${hue}, 70%, 55%)`);

    this.bodyGroup = new THREE.Group();
    this.group.add(this.bodyGroup);

    this.proceduralGroup = null;
    this.customModel = null;

    this.buildCharacterMesh();
    this.buildNameTag();

    this.animTime = 0;
  }

  hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    return hash;
  }

  buildCharacterMesh() {
    // 1. Build initial stylized procedural avatar
    this.proceduralGroup = new THREE.Group();
    this.bodyGroup.add(this.proceduralGroup);

    const shirtMat = new THREE.MeshStandardMaterial({
      color: this.primaryColor,
      roughness: 0.6,
      metalness: 0.1
    });

    const skinMat = new THREE.MeshStandardMaterial({
      color: 0xffd1a4,
      roughness: 0.8
    });

    const pantsMat = new THREE.MeshStandardMaterial({
      color: 0x2c3e50,
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

    // Visor / Face
    const visorGeo = new THREE.BoxGeometry(0.3, 0.12, 0.05);
    const visorMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
    const visor = new THREE.Mesh(visorGeo, visorMat);
    visor.position.set(0, 1.63, 0.19);
    this.proceduralGroup.add(visor);

    // Left & Right Arms
    const armGeo = new THREE.BoxGeometry(0.18, 0.65, 0.2);
    this.leftArm = new THREE.Mesh(armGeo, shirtMat);
    this.leftArm.position.set(-0.38, 1.05, 0);
    this.proceduralGroup.add(this.leftArm);

    this.rightArm = new THREE.Mesh(armGeo, shirtMat);
    this.rightArm.position.set(0.38, 1.05, 0);
    this.proceduralGroup.add(this.rightArm);

    // Left & Right Legs
    const legGeo = new THREE.BoxGeometry(0.22, 0.7, 0.22);
    this.leftLeg = new THREE.Mesh(legGeo, pantsMat);
    this.leftLeg.position.set(-0.16, 0.35, 0);
    this.proceduralGroup.add(this.leftLeg);

    this.rightLeg = new THREE.Mesh(legGeo, pantsMat);
    this.rightLeg.position.set(0.16, 0.35, 0);
    this.proceduralGroup.add(this.rightLeg);

    // 2. Load and attach 3D player.fbx model
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
              mat.color.lerp(this.primaryColor, 0.25);
            }
          }
        });

        this.customModel = modelClone;
        this.bodyGroup.add(modelClone);
      }
    });
  }

  buildNameTag() {
    this.nameCanvas = document.createElement('canvas');
    this.nameCanvas.width = 512;
    this.nameCanvas.height = 128;
    this.nameCtx = this.nameCanvas.getContext('2d');

    this.nameTexture = new THREE.CanvasTexture(this.nameCanvas);
    this.nameTexture.minFilter = THREE.LinearFilter;

    const spriteMat = new THREE.SpriteMaterial({
      map: this.nameTexture,
      transparent: true,
      depthTest: false
    });

    this.nameSprite = new THREE.Sprite(spriteMat);
    this.nameSprite.position.y = 2.2;
    this.nameSprite.scale.set(1.8, 0.45, 1);
    this.group.add(this.nameSprite);

    this.updateNameTag();
  }

  updateNameTag() {
    const ctx = this.nameCtx;
    ctx.clearRect(0, 0, 512, 128);

    // Background pill
    ctx.fillStyle = this.isDowned ? 'rgba(180, 20, 20, 0.85)' : 'rgba(20, 25, 35, 0.8)';
    ctx.roundRect ? ctx.roundRect(20, 10, 472, 108, 16) : ctx.fillRect(20, 10, 472, 108);
    ctx.fill();

    // Border
    ctx.strokeStyle = this.isDowned ? '#ff3838' : '#3498db';
    ctx.lineWidth = 4;
    ctx.stroke();

    // Name text
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 36px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    const title = this.isDowned ? `⚠️ ${this.name} [DOWNED]` : (this.isEscaped ? `★ ${this.name} [ESCAPED]` : this.name);
    ctx.fillText(title, 256, 52);

    // Health bar track
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.fillRect(60, 72, 392, 18);

    // Health fill
    const pct = Math.max(0, Math.min(1, this.health / this.maxHealth));
    ctx.fillStyle = pct > 0.5 ? '#2ecc71' : (pct > 0.25 ? '#f39c12' : '#e74c3c');
    ctx.fillRect(60, 72, 392 * pct, 18);

    this.nameTexture.needsUpdate = true;
  }

  updateFromNetwork(data) {
    if (data.pos) {
      this.targetPos.set(data.pos.x, data.pos.y, data.pos.z);
      if (this.currentPos.lengthSq() === 0) {
        this.currentPos.copy(this.targetPos);
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
    if (data.isDowned !== undefined && data.isDowned !== this.isDowned) {
      this.isDowned = data.isDowned;
      this.updateNameTag();
    }
    if (data.isEscaped !== undefined && data.isEscaped !== this.isEscaped) {
      this.isEscaped = data.isEscaped;
      this.updateNameTag();
    }
    this.isSliding = !!data.isSliding;
    this.isCrouching = !!data.isCrouching;
  }

  update(deltaTime) {
    // 1. Smooth position interpolation (feet placed on floor)
    this.currentPos.lerp(this.targetPos, Math.min(1, deltaTime * 14));
    const floorY = Math.max(0, this.currentPos.y - 1.65);
    this.group.position.set(this.currentPos.x, floorY, this.currentPos.z);

    // 2. Smooth rotation interpolation
    let deltaYaw = this.targetYaw - this.currentYaw;
    while (deltaYaw > Math.PI) deltaYaw -= Math.PI * 2;
    while (deltaYaw < -Math.PI) deltaYaw += Math.PI * 2;
    this.currentYaw += deltaYaw * Math.min(1, deltaTime * 12);
    this.bodyGroup.rotation.y = this.currentYaw;

    // 3. Posture handling
    if (this.isDowned) {
      // Lie flat on the floor
      this.bodyGroup.rotation.x = -Math.PI / 2;
      this.bodyGroup.position.y = -0.55;
      this.nameSprite.position.y = 0.8;
      return;
    } else {
      this.bodyGroup.rotation.x = 0;
      this.bodyGroup.position.y = 0;
      this.nameSprite.position.y = 2.2;
    }

    if (this.isSliding) {
      // Crouch / tilt back for slide
      this.bodyGroup.scale.set(1.0, 0.65, 1.0);
      this.bodyGroup.rotation.x = -0.25;
    } else if (this.isCrouching) {
      this.bodyGroup.scale.set(1.0, 0.72, 1.0);
      this.bodyGroup.rotation.x = 0;
    } else {
      this.bodyGroup.scale.set(1.0, 1.0, 1.0);
      this.bodyGroup.rotation.x = 0;
    }

    // 4. Running limb swing or model bob animation
    const speed = this.currentPos.distanceTo(this.targetPos) / Math.max(0.001, deltaTime);
    if (speed > 1.2 && !this.isSliding && !this.isDowned) {
      this.animTime += deltaTime * speed * 2.2;
      const swing = Math.sin(this.animTime) * 0.65;
      if (this.leftArm) this.leftArm.rotation.x = swing;
      if (this.rightArm) this.rightArm.rotation.x = -swing;
      if (this.leftLeg) this.leftLeg.rotation.x = -swing;
      if (this.rightLeg) this.rightLeg.rotation.x = swing;
      if (this.customModel) {
        this.customModel.position.y = Math.abs(Math.sin(this.animTime * 1.5)) * 0.08;
      }
    } else {
      if (this.leftArm) this.leftArm.rotation.x = 0;
      if (this.rightArm) this.rightArm.rotation.x = 0;
      if (this.leftLeg) this.leftLeg.rotation.x = 0;
      if (this.rightLeg) this.rightLeg.rotation.x = 0;
      if (this.customModel) {
        this.customModel.position.y = 0;
      }
    }
  }

  destroy() {
    this.isDestroyed = true;
    if (this.group && this.group.parent) {
      this.group.parent.remove(this.group);
    }
    if (this.nameTexture) this.nameTexture.dispose();
  }
}

