/**
 * MP5 Module (Submachine Gun)
 * Rapid-fire compact submachine gun with high rate of fire and low recoil.
 * Uses 3D model low-poly_hk_mp5.glb from images/3d models.
 */
import * as THREE from 'three';
import { WeaponBase } from './WeaponBase.js';
import { ASSET_PATHS, assetUrl } from '../config/assets.js';
import { createRifleArms } from './ArmsViewmodel.js';

export class MP5 extends WeaponBase {
  constructor(camera, scene, audio) {
    super(camera, scene, audio, {
      name: 'HK MP5 SUBMACHINE GUN',
      type: 'mp5',
      spriteUrl: ASSET_PATHS.weapons.ak47, // Sprite fallback
      modelUrl: assetUrl('/images/3d models/low-poly_hk_mp5.glb'),
      magSize: 30,
      ammoInMag: 30,
      reserveAmmo: 120,
      damage: 22,
      fireInterval: 0.085, // ~700 RPM rapid-fire
      reloadDuration: 1.5,
      range: 70,
      isAutomatic: true,
      viewWidth: 0.46,
      viewHeight: 0.30,
      restPosition: new THREE.Vector3(0.17, -0.17, -0.44),
      baseRotation: new THREE.Euler(0.08, -0.38, 0.06, 'YXZ'),
      muzzleOffset: new THREE.Vector3(-0.21, 0.05, 0.01),
      armsBuilder: createRifleArms,
      recoilKickZ: 0.035,
      recoilKickRot: 0.06,
      cameraKick: 0.008
    });
  }

  playFiringSound() {
    if (this.audio && this.audio.playGunshot) {
      this.audio.playGunshot();
    } else if (this.audio && this.audio.playPistolShot) {
      this.audio.playPistolShot();
    }
  }
}
