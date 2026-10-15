/**
 * HoldableItem Module
 * Represents equippable, non-firearm quest items held in the player's hands like guns
 * (e.g. Physics Lab Key, Vernier Caliper) until they are used for their respective purposes.
 * Features:
 * - 3D first-person viewmodel with player hands/arms holding the item
 * - Realistic weapon sway and walk bobbing
 * - HUD slot integration (Slot 4)
 * - Click inspect animation with informative prompt
 */
import * as THREE from 'three';
import { loadTexture } from '../config/assets.js';

export class HoldableItem {
  constructor(camera, scene, audio, config = {}) {
    this.camera = camera;
    this.scene = scene;
    this.audio = audio;

    this.id = config.id || 'holdable_item';
    this.name = config.name || 'ITEM';
    this.type = config.type || 'quest_item';
    this.spriteUrl = config.spriteUrl;
    this.iconUrl = config.iconUrl || config.spriteUrl;
    this.hint = config.hint || 'Use on locked door to unlock';

    this.restPosition = config.restPosition
      ? config.restPosition.clone()
      : new THREE.Vector3(0.18, -0.16, -0.40);

    this.baseRotation = config.baseRotation
      ? config.baseRotation.clone()
      : new THREE.Euler(0.12, -0.28, 0.06, 'YXZ');

    this.viewWidth = config.viewWidth || 0.38;
    this.viewHeight = config.viewHeight || 0.38;

    this.swayX = 0;
    this.swayY = 0;
    this.swayRotZ = 0;
    this.inspectTimer = 0;

    // Viewmodel container
    this.viewmodelGroup = new THREE.Group();
    this.viewmodelGroup.visible = false;
    this.camera.add(this.viewmodelGroup);

    this.buildViewmodel();
  }

  buildViewmodel() {
    this.viewmodelPivot = new THREE.Group();
    this.viewmodelPivot.position.copy(this.restPosition);
    this.viewmodelPivot.rotation.copy(this.baseRotation);
    this.viewmodelGroup.add(this.viewmodelPivot);

    // 1. Item Plane (Textured 2D cutout rendered in 3D first-person view)
    const geo = new THREE.PlaneGeometry(this.viewWidth, this.viewHeight);
    const tex = loadTexture(this.spriteUrl, 1, 1, '#ffffff', '#cccccc');
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      alphaTest: 0.12,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide
    });

    this.itemMesh = new THREE.Mesh(geo, mat);
    this.itemMesh.renderOrder = 998;
    this.itemMesh.position.set(0, 0, 0);
    this.viewmodelPivot.add(this.itemMesh);

    // 2. Right Arm & Hand gripping the item
    const armGroup = new THREE.Group();

    // Dark navy sleeve
    const sleeveMat = new THREE.MeshBasicMaterial({
      color: 0x1e293b,
      depthTest: false,
      depthWrite: false
    });
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.052, 0.28, 8), sleeveMat);
    sleeve.rotation.set(0.48, 0, -0.32);
    sleeve.position.set(0.14, -0.16, 0.08);
    sleeve.renderOrder = 997;
    armGroup.add(sleeve);

    // Hand skin
    const skinMat = new THREE.MeshBasicMaterial({
      color: 0xb57c55,
      depthTest: false,
      depthWrite: false
    });

    // Thumb gripping front
    const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.048, 0.02), skinMat);
    thumb.position.set(-0.02, -0.06, 0.015);
    thumb.rotation.set(0, 0, -0.25);
    thumb.renderOrder = 999;
    armGroup.add(thumb);

    // Fingers gripping back
    const fingers = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.07, 0.02), skinMat);
    fingers.position.set(0.04, -0.06, -0.015);
    fingers.renderOrder = 997;
    armGroup.add(fingers);

    this.viewmodelPivot.add(armGroup);
  }

  setVisible(visible) {
    if (this.viewmodelGroup) {
      this.viewmodelGroup.visible = visible;
    }
  }

  canShoot() {
    return true;
  }

  shoot() {
    // Left click plays inspect/wiggle animation
    this.inspectTimer = 0.35;
    if (this.audio && this.audio.playPickup) {
      this.audio.playPickup();
    }
    return {
      fired: false,
      hit: false,
      message: this.hint
    };
  }

  update(deltaTime, player) {
    if (!this.viewmodelGroup || !this.viewmodelGroup.visible) return;

    // 1. Dynamic sway based on mouse look
    if (player) {
      const deltaYaw = player.lastDeltaYaw || 0;
      const deltaPitch = player.lastDeltaPitch || 0;

      const targetSwayX = -deltaYaw * 0.45;
      const targetSwayY = deltaPitch * 0.45;
      const targetSwayRotZ = deltaYaw * 0.65;

      const lerpSpeed = Math.min(1.0, deltaTime * 12.0);
      this.swayX = THREE.MathUtils.lerp(this.swayX, targetSwayX, lerpSpeed);
      this.swayY = THREE.MathUtils.lerp(this.swayY, targetSwayY, lerpSpeed);
      this.swayRotZ = THREE.MathUtils.lerp(this.swayRotZ, targetSwayRotZ, lerpSpeed);
    }

    // 2. Walking bob
    let bobX = 0;
    let bobY = 0;
    if (player && player.bobTimer) {
      bobX = Math.cos(player.bobTimer * 0.5) * 0.012;
      bobY = Math.sin(player.bobTimer) * 0.016;
    }

    // 3. Inspect wiggle
    let inspectOffset = 0;
    if (this.inspectTimer > 0) {
      this.inspectTimer -= deltaTime;
      inspectOffset = Math.sin((1 - this.inspectTimer / 0.35) * Math.PI) * 0.03;
    }

    // Apply combined transforms to pivot
    this.viewmodelPivot.position.set(
      this.restPosition.x + this.swayX + bobX,
      this.restPosition.y + this.swayY + bobY + inspectOffset,
      this.restPosition.z
    );

    this.viewmodelPivot.rotation.set(
      this.baseRotation.x + this.swayY * 0.5,
      this.baseRotation.y + this.swayX * 0.5,
      this.baseRotation.z + this.swayRotZ
    );
  }

  getAmmoDisplay() {
    return 'READY';
  }

  destroy() {
    if (this.viewmodelGroup && this.camera) {
      this.camera.remove(this.viewmodelGroup);
    }
  }
}
