/**
 * RoomPickups Module
 * Manages extra health pickups, grenade pickups, and ammo crates placed across campus rooms.
 * Features:
 * - 3D floating & rotating retro models with glowing colored point lights
 * - Proximity collection by player
 * - Health restoration (+35 HP), Grenade capacity (+1), and Ammo refill (+60 Rifle, +24 Pistol)
 */
import * as THREE from 'three';
import { ASSET_PATHS, loadTexture } from '../config/assets.js';

export class RoomPickups {
  constructor(scene, audio) {
    this.scene = scene;
    this.audio = audio;
    this.pickups = [];

    this.pickupConfigs = [
      // 1. South Entrance Hall (Spawn Lobby)
      { type: 'health', x: 32.0, z: 91.0, value: 35 },
      // 2. School Infirmary (West Wing)
      { type: 'health', x: 5.5, z: 23.0, value: 35 },
      { type: 'ammo', x: 9.0, z: 21.0, rifle: 60, pistol: 24 },
      // 3. Biology Lab (West Wing Lower)
      { type: 'grenade', x: 5.0, z: 73.0, amount: 1 },
      { type: 'health', x: 9.0, z: 77.0, value: 35 },
      // 4. Board Room (South Center)
      { type: 'ammo', x: 53.0, z: 91.0, rifle: 60, pistol: 24 },
      { type: 'grenade', x: 57.0, z: 93.0, amount: 1 },
      // 5. Faculty Archives (Locked Room North)
      { type: 'ammo', x: 71.0, z: 6.5, rifle: 60, pistol: 24 },
      { type: 'grenade', x: 74.5, z: 8.0, amount: 1 },
      // 6. Unlockable Room (North East Corner)
      { type: 'health', x: 90.0, z: 6.5, value: 35 },
      { type: 'ammo', x: 93.5, z: 8.0, rifle: 60, pistol: 24 },
    ];

    this.initPickups();
  }

  initPickups() {
    this.clear();

    this.pickupConfigs.forEach((cfg, idx) => {
      const group = new THREE.Group();
      group.position.set(cfg.x, 0.65, cfg.z);

      let lightColor = 0xffffff;

      if (cfg.type === 'health') {
        lightColor = 0x2ecc71;
        // Medkit Pickup: white box with green cross
        const boxGeo = new THREE.BoxGeometry(0.35, 0.25, 0.20);
        const boxMat = new THREE.MeshStandardMaterial({
          color: 0xf5f6fa,
          roughness: 0.35,
          metalness: 0.1
        });
        const boxMesh = new THREE.Mesh(boxGeo, boxMat);
        group.add(boxMesh);

        // Green cross
        const crossH = new THREE.BoxGeometry(0.20, 0.06, 0.22);
        const crossV = new THREE.BoxGeometry(0.06, 0.20, 0.22);
        const crossMat = new THREE.MeshBasicMaterial({ color: 0x27ae60 });
        group.add(new THREE.Mesh(crossH, crossMat));
        group.add(new THREE.Mesh(crossV, crossMat));
      } else if (cfg.type === 'grenade') {
        lightColor = 0xe67e22;
        // Grenade Pickup: olive green cylinder with pin
        const bodyGeo = new THREE.CylinderGeometry(0.10, 0.10, 0.24, 10);
        const bodyMat = new THREE.MeshStandardMaterial({
          color: 0x2e402b,
          roughness: 0.5,
          metalness: 0.6
        });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        group.add(body);

        const topGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.08, 8);
        const topMat = new THREE.MeshStandardMaterial({ color: 0x7f8c8d, metalness: 0.8 });
        const topMesh = new THREE.Mesh(topGeo, topMat);
        topMesh.position.y = 0.14;
        group.add(topMesh);
      } else if (cfg.type === 'ammo') {
        lightColor = 0xf1c40f;
        // Ammo Crate: military green with gold lettering
        const ammoGeo = new THREE.BoxGeometry(0.40, 0.22, 0.26);
        const ammoMat = new THREE.MeshStandardMaterial({
          color: 0x3d4a36,
          roughness: 0.45,
          metalness: 0.5
        });
        const crate = new THREE.Mesh(ammoGeo, ammoMat);
        group.add(crate);

        const trimGeo = new THREE.BoxGeometry(0.42, 0.04, 0.28);
        const trimMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.8 });
        group.add(new THREE.Mesh(trimGeo, trimMat));
      }

      // Point Light glow
      const pl = new THREE.PointLight(lightColor, 1.2, 3.5);
      pl.position.set(0, 0.1, 0);
      group.add(pl);

      this.scene.add(group);

      this.pickups.push({
        id: `pickup_${idx}`,
        config: cfg,
        group,
        baseY: 0.65,
        bobTimer: Math.random() * 10,
        collected: false
      });
    });
  }

  update(deltaTime, player, grenadeManager, rifle, pistol) {
    if (!player || player.isDead) return;

    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      if (p.collected) continue;

      // Animate floating & spinning
      p.bobTimer += deltaTime * 2.5;
      p.group.rotation.y += deltaTime * 1.8;
      p.group.position.y = p.baseY + Math.sin(p.bobTimer) * 0.08;

      // Proximity collection (distance < 1.4m)
      const dist = Math.hypot(player.position.x - p.config.x, player.position.z - p.config.z);
      if (dist <= 1.4) {
        let collected = false;

        if (p.config.type === 'health') {
          if (player.health < player.maxHealth) {
            player.health = Math.min(player.maxHealth, player.health + p.config.value);
            collected = true;
            if (player.onPickupNotification) {
              player.onPickupNotification(`+${p.config.value} HEALTH RESTORED!`);
            }
            if (this.audio && this.audio.playMedkitUse) {
              this.audio.playMedkitUse();
            }
          }
        } else if (p.config.type === 'grenade') {
          if (grenadeManager && grenadeManager.grenades < grenadeManager.maxGrenades) {
            grenadeManager.addGrenade(p.config.amount);
            collected = true;
            if (player.onPickupNotification) {
              player.onPickupNotification(`+${p.config.amount} GRENADE PICKUP!`);
            }
            if (this.audio && this.audio.playPickup) {
              this.audio.playPickup();
            }
          }
        } else if (p.config.type === 'ammo') {
          let gained = false;
          if (rifle && rifle.reserveAmmo < 120) {
            rifle.reserveAmmo = Math.min(120, rifle.reserveAmmo + (p.config.rifle || 60));
            gained = true;
          }
          if (pistol && pistol.reserveAmmo < 60) {
            pistol.reserveAmmo = Math.min(60, pistol.reserveAmmo + (p.config.pistol || 24));
            gained = true;
          }
          if (gained) {
            collected = true;
            if (player.onPickupNotification) {
              player.onPickupNotification('AMMO REFILLED (+60 RIFLE / +24 PISTOL)');
            }
            if (this.audio && this.audio.playBuffer) {
              this.audio.playBuffer('reload', 0.8);
            }
          }
        }

        if (collected) {
          p.collected = true;
          this.scene.remove(p.group);
        }
      }
    }
  }

  clear() {
    this.pickups.forEach((p) => {
      this.scene.remove(p.group);
    });
    this.pickups = [];
  }

  reset() {
    this.initPickups();
  }
}
