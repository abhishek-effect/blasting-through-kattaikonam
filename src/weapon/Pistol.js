/**
 * Pistol Module (Slot 2)
 * Semi-automatic sidearm with realistic first-person viewing angle
 * and modeled two-handed first-person stance holding the weapon.
 */
import * as THREE from 'three';
import { WeaponBase } from './WeaponBase.js';
import { ASSET_PATHS } from '../config/assets.js';
import { createPistolArms } from './ArmsViewmodel.js';

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
      restPosition: new THREE.Vector3(0.16, -0.17, -0.42),
      baseRotation: new THREE.Euler(0.12, -0.32, 0.06, 'YXZ'),
      muzzleOffset: new THREE.Vector3(-0.095, 0.055, 0.01),
      armsBuilder: createPistolArms,
      recoilKickZ: 0.045,
      recoilKickRot: 0.12,
      cameraKick: 0.010
    });
  }

  playFiringSound() {
    this.audio.playPistolShot();
  }
}
