/**
 * Pistol Module (Slot 2)
 * Semi-automatic sidearm using transparent PNG viewmodel.
 */
import * as THREE from 'three';
import { WeaponBase } from './WeaponBase.js';
import { ASSET_PATHS } from '../config/assets.js';

export class Pistol extends WeaponBase {
  constructor(camera, scene, audio) {
    super(camera, scene, audio, {
      name: 'SERVICE PISTOL',
      type: 'pistol',
      spriteUrl: ASSET_PATHS.weapons.pistol,
      magSize: 12,
      ammoInMag: 12,
      reserveAmmo: 48,
      damage: 38,
      fireInterval: 0.17, // ~350 RPM semi-auto
      reloadDuration: 1.3,
      range: 65,
      isAutomatic: false, // Semi-automatic!
      viewWidth: 0.40,
      viewHeight: 0.32,
      restPosition: new THREE.Vector3(0.22, -0.22, -0.52),
      recoilKickZ: 0.05,
      recoilKickRot: 0.14,
      cameraKick: 0.010
    });
  }

  playFiringSound() {
    this.audio.playPistolShot();
  }
}
