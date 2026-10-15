/**
 * DropItem Module
 * Manages item drops from fallen enemies:
 * - Pen Drive dropped by Sijinil
 * - Photocopy dropped by Boss
 * Features:
 * - 3D rotating floating billboard sprite with glowing aura
 * - Automatic proximity pickup detection
 */
import * as THREE from 'three';
import { ASSET_PATHS, loadTexture } from '../config/assets.js';

export class DropItemManager {
  constructor(scene, audio) {
    this.scene = scene;
    this.audio = audio;
    this.drops = [];
  }

  spawnDrop(type, position, onCollected = null) {
    const group = new THREE.Group();
    group.position.set(position.x, 0.45, position.z);

    let spriteUrl = ASSET_PATHS.items.penDrive;
    let lightColor = 0x00a8ff;
    let label = 'PEN DRIVE';

    if (type === 'photocopy') {
      spriteUrl = ASSET_PATHS.items.photocopy;
      lightColor = 0xf1c40f;
      label = 'PHOTOCOPY';
    }

    const tex = loadTexture(spriteUrl, 1, 1, '#ffffff', '#aaaaaa');
    const mat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      alphaTest: 0.1,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(0.55, 0.55, 1);
    group.add(sprite);

    // Glowing point light
    const light = new THREE.PointLight(lightColor, 1.6, 3.5);
    group.add(light);

    this.scene.add(group);

    const drop = {
      type,
      label,
      group,
      position: group.position,
      baseY: 0.45,
      bobTimer: Math.random() * 10,
      onCollected,
      collected: false
    };

    this.drops.push(drop);
    return drop;
  }

  update(deltaTime, player) {
    if (!player || player.isDead) return;

    for (let i = this.drops.length - 1; i >= 0; i--) {
      const drop = this.drops[i];
      if (drop.collected) continue;

      drop.bobTimer += deltaTime * 3.0;
      drop.group.position.y = drop.baseY + Math.sin(drop.bobTimer) * 0.08;

      const dist = Math.hypot(player.position.x - drop.position.x, player.position.z - drop.position.z);
      if (dist <= 1.8) {
        drop.collected = true;
        this.scene.remove(drop.group);
        this.drops.splice(i, 1);

        if (this.audio && this.audio.playPickup) {
          this.audio.playPickup();
        }

        if (drop.onCollected) {
          drop.onCollected(drop.type);
        }
      }
    }
  }

  clear() {
    this.drops.forEach((d) => {
      this.scene.remove(d.group);
    });
    this.drops = [];
  }
}
