/**
 * Medkit Module (Slot 3)
 * Non-weapon consumable healing item with first-person held arms viewmodel,
 * use animation, consumable charges, and 2-minute cooldown.
 */
import * as THREE from 'three';
import { loadTexture, ASSET_PATHS } from '../config/assets.js';
import { createMedkitArms } from './ArmsViewmodel.js';

export class Medkit {
  constructor(camera, scene, audio) {
    this.camera = camera;
    this.scene = scene;
    this.audio = audio;

    this.name = 'FIRST AID MEDKIT';
    this.type = 'medkit';
    this.healAmount = 50;
    this.count = 2; // Consumable count
    this.cooldownDuration = 120; // 2 minutes in seconds
    this.cooldownTimer = 0;
    this.useDuration = 1.0; // Short application delay
    this.useTimer = 0;
    this.isUsing = false;

    // Viewmodel
    this.restPosition = new THREE.Vector3(0.02, -0.18, -0.44);
    this.baseRotation = new THREE.Euler(0.16, -0.06, 0.02, 'YXZ');
    this.swayX = 0;
    this.swayY = 0;

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

    const geo = new THREE.PlaneGeometry(0.36, 0.36);
    const tex = loadTexture(ASSET_PATHS.weapons.medkit, 1, 1, '#16a085', '#2ecc71');
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      alphaTest: 0.1,
      depthTest: false,
      depthWrite: false,
    });

    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.renderOrder = 998;
    this.mesh.position.set(0, 0, 0);
    this.viewmodelPivot.add(this.mesh);

    this.armsGroup = createMedkitArms();
    this.viewmodelPivot.add(this.armsGroup);
  }

  setVisible(visible) {
    this.viewmodelGroup.visible = visible;
  }

  use(player) {
    if (this.count <= 0) {
      return { used: false, reason: 'empty', message: 'No medkits remaining!' };
    }

    if (this.cooldownTimer > 0) {
      const remaining = Math.ceil(this.cooldownTimer);
      return { used: false, reason: 'cooldown', message: `Medkit on cooldown (${remaining}s remaining)` };
    }

    if (player.health >= player.maxHealth) {
      return { used: false, reason: 'full', message: 'Health already full!' };
    }

    if (this.isUsing) {
      return { used: false, reason: 'busy' };
    }

    // Start application
    this.isUsing = true;
    this.useTimer = this.useDuration;
    return { used: true, message: 'Applying first aid...' };
  }

  update(deltaTime, player) {
    // Cooldown countdown
    if (this.cooldownTimer > 0) {
      this.cooldownTimer = Math.max(0, this.cooldownTimer - deltaTime);
    }

    if (!this.viewmodelGroup.visible) return;

    // Viewmodel sway & bob
    const lookYaw = player ? (player.lastDeltaYaw || 0) : 0;
    const lookPitch = player ? (player.lastDeltaPitch || 0) : 0;
    this.swayX = THREE.MathUtils.lerp(this.swayX, -lookYaw * 0.02, Math.min(1.0, deltaTime * 12.0));
    this.swayY = THREE.MathUtils.lerp(this.swayY, lookPitch * 0.02, Math.min(1.0, deltaTime * 12.0));

    let bobX = 0;
    let bobY = 0;
    if (player && player.bobTimer > 0 && player.isGrounded) {
      bobX = Math.cos(player.bobTimer * 0.5) * 0.005;
      bobY = Math.sin(player.bobTimer) * 0.004;
    }

    // Use animation
    if (this.isUsing) {
      this.useTimer -= deltaTime;
      const progress = 1 - (this.useTimer / this.useDuration);
      // Lift towards center and pulse
      const lift = Math.sin(progress * Math.PI) * 0.12;
      this.viewmodelPivot.position.set(
        this.restPosition.x + this.swayX + bobX,
        this.restPosition.y + this.swayY + bobY + lift,
        this.restPosition.z + lift * 0.5
      );

      if (this.useTimer <= 0) {
        this.isUsing = false;
        this.count--;
        this.cooldownTimer = this.cooldownDuration;
        this.viewmodelPivot.position.copy(this.restPosition);

        // Apply heal
        player.health = Math.min(player.maxHealth, player.health + this.healAmount);
        this.audio.playMedkitUse();
      }
    } else {
      this.viewmodelPivot.position.set(
        this.restPosition.x + this.swayX + bobX,
        this.restPosition.y + this.swayY + bobY,
        this.restPosition.z
      );
    }
  }

  getCooldownText() {
    if (this.cooldownTimer <= 0) {
      return 'READY';
    }
    const mins = Math.floor(this.cooldownTimer / 60);
    const secs = Math.floor(this.cooldownTimer % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  }

  reset() {
    this.count = 2;
    this.cooldownTimer = 0;
    this.useTimer = 0;
    this.isUsing = false;
    this.viewmodelPivot.position.copy(this.restPosition);
    this.viewmodelPivot.rotation.copy(this.baseRotation);
  }

  destroy() {
    this.camera.remove(this.viewmodelGroup);
  }
}
