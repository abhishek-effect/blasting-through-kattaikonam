/**
 * Medkit Module (Slot 3)
 * Non-weapon consumable healing item with viewmodel, animation,
 * consumable charges, and 2-minute cooldown.
 */
import * as THREE from 'three';
import { loadTexture, ASSET_PATHS } from '../config/assets.js';

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
    this.restPosition = new THREE.Vector3(0.18, -0.22, -0.52);
    this.viewmodelGroup = new THREE.Group();
    this.viewmodelGroup.visible = false;
    this.camera.add(this.viewmodelGroup);
    this.buildViewmodel();
  }

  buildViewmodel() {
    const geo = new THREE.PlaneGeometry(0.38, 0.38);
    const tex = loadTexture(ASSET_PATHS.weapons.medkit, 1, 1, '#16a085', '#2ecc71');
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      alphaTest: 0.1,
      depthTest: false,
      depthWrite: false,
    });

    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.renderOrder = 999;
    this.mesh.position.copy(this.restPosition);
    this.viewmodelGroup.add(this.mesh);
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

    // Use animation
    if (this.isUsing) {
      this.useTimer -= deltaTime;
      const progress = 1 - (this.useTimer / this.useDuration);
      // Lift towards center and pulse
      const lift = Math.sin(progress * Math.PI) * 0.12;
      this.mesh.position.set(
        this.restPosition.x - lift * 0.5,
        this.restPosition.y + lift,
        this.restPosition.z
      );

      if (this.useTimer <= 0) {
        this.isUsing = false;
        this.count--;
        this.cooldownTimer = this.cooldownDuration;
        this.mesh.position.copy(this.restPosition);

        // Apply heal
        player.health = Math.min(player.maxHealth, player.health + this.healAmount);
        this.audio.playMedkitUse();
      }
    } else {
      this.mesh.position.copy(this.restPosition);
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
    this.mesh.position.copy(this.restPosition);
  }

  destroy() {
    this.camera.remove(this.viewmodelGroup);
  }
}
