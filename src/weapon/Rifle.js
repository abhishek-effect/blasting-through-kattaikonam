/**
 * Rifle Module (Slot 1)
 * Automatic assault rifle with realistic first-person viewing angle
 * and modeled first-person arms holding the weapon.
 */
import * as THREE from 'three';
import { WeaponBase } from './WeaponBase.js';
import { ASSET_PATHS } from '../config/assets.js';
import { createRifleArms } from './ArmsViewmodel.js';

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
      restPosition: new THREE.Vector3(0.19, -0.18, -0.46),
      baseRotation: new THREE.Euler(0.10, -0.42, 0.08, 'YXZ'),
      muzzleOffset: new THREE.Vector3(-0.245, 0.055, 0.01),
      armsBuilder: createRifleArms,
      recoilKickZ: 0.05,
      recoilKickRot: 0.09,
      cameraKick: 0.012
    });
  }

  playFiringSound() {
    this.audio.playGunshot();
  }
}
