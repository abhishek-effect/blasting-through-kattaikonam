/**
 * Rifle Module (Slot 1)
 * Automatic assault rifle using transparent PNG viewmodel.
 */
import * as THREE from 'three';
import { WeaponBase } from './WeaponBase.js';
import { ASSET_PATHS } from '../config/assets.js';

export class Rifle extends WeaponBase {
  constructor(camera, scene, audio) {
    super(camera, scene, audio, {
      name: 'AK-47 CLASSROOM ENFORCER',
      type: 'rifle',
      spriteUrl: ASSET_PATHS.weapons.ak47,
      magSize: 30,
      ammoInMag: 30,
      reserveAmmo: 90,
      damage: 25,
      fireInterval: 0.10, // 600 RPM
      reloadDuration: 1.8,
      range: 80,
      isAutomatic: true,
      viewWidth: 0.52,
      viewHeight: 0.32,
      restPosition: new THREE.Vector3(0.24, -0.22, -0.55),
      recoilKickZ: 0.06,
      recoilKickRot: 0.10,
      cameraKick: 0.012
    });
  }

  playFiringSound() {
    this.audio.playGunshot();
  }
}
