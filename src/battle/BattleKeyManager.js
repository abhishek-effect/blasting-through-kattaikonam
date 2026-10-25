/**
 * BattleKeyManager Module
 * Manages randomly locked doors and scattered keys in Battle Multiplayer mode:
 * - Host randomly locks 3 to 5 campus doors at match start.
 * - Scattered 3D golden keys with rotating beacons in campus corridors and rooms.
 * - Proximity detection: collecting keys and unlocking doors with Key [E].
 * - Full PeerJS synchronization across all connected peers.
 */
import * as THREE from 'three';
import { ASSET_PATHS, loadTexture } from '../config/assets.js';

export class BattleKeyManager {
  constructor(scene, level, audio = null) {
    this.scene = scene;
    this.level = level;
    this.audio = audio;

    this.keysHeld = 0;
    this.activeKeyPickups = new Map(); // Map<keyId, { id, group, light, x, y, z }>
    this.lockedDoorIds = new Set();
    this.animTimer = 0;

    // Callbacks
    this.onKeyCollected = null;
    this.onDoorUnlocked = null;

    // Candidate key spawn locations strictly scattered in open campus corridors/atrium (outside locked rooms & seminar)
    this.candidateSpawns = [
      { x: 31, y: 0.8, z: 48, name: 'Central Atrium' },
      { x: 31, y: 0.8, z: 24, name: 'North Hall' },
      { x: 20, y: 0.8, z: 40, name: 'West Wing' },
      { x: 48, y: 0.8, z: 55, name: 'East Corridor' },
      { x: 34, y: 0.8, z: 88, name: 'South Lobby' },
      { x: 20, y: 0.8, z: 65, name: 'West Corridor' },
      { x: 31, y: 0.8, z: 34, name: 'North Corridor' },
      { x: 34, y: 0.8, z: 68, name: 'South Central Hall' },
      { x: 48, y: 0.8, z: 24, name: 'North-East Hall' },
      { x: 48, y: 0.8, z: 75, name: 'South-East Corridor' }
    ];
  }

  /**
   * Host chooses random doors to lock for the match, including Seminar Gate
   */
  setupRandomDoors(count = 4) {
    if (!this.level || !this.level.doors) return { lockedDoors: [], keySpawns: [] };

    // Reset doors first
    this.level.doors.forEach((door) => {
      door.isLocked = false;
      door.customLockedPrompt = null;
      door.setOpen(true);
    });

    // 1. Lock Seminar Gate for Battle Mode (always unlockable via key)
    if (this.level && this.level.resetSeminarGate) {
      this.level.resetSeminarGate();
    }
    this.lockedDoorIds.add('door_seminar_gate');

    const lockedDoors = [
      { id: 'door_seminar_gate', name: 'SEMINAR HALL GATE' }
    ];

    // 2. Randomly select other campus doors to lock
    const eligibleDoors = this.level.doors.filter((d) => d.id !== 'door_stairs_sw' && d.id !== 'door_nw_stairs');
    const shuffled = [...eligibleDoors].sort(() => 0.5 - Math.random());
    const selected = shuffled.slice(0, Math.max(1, count - 1));

    selected.forEach((d) => {
      d.isLocked = true;
      d.setOpen(false);
      d.customLockedPrompt = '🔒 DOOR LOCKED [KEY REQUIRED]';
      this.lockedDoorIds.add(d.id);
      lockedDoors.push({ id: d.id, name: d.name || 'Door' });
    });

    // Generate matching key spawns in open common corridors
    const shuffledSpawns = [...this.candidateSpawns].sort(() => 0.5 - Math.random());
    const keySpawns = [];
    for (let i = 0; i < lockedDoors.length; i++) {
      const sp = shuffledSpawns[i % shuffledSpawns.length];
      const keyId = `key_${i}_${Math.random().toString(36).substring(2, 6)}`;
      keySpawns.push({
        id: keyId,
        x: sp.x + (Math.random() - 0.5) * 3,
        y: 0.8,
        z: sp.z + (Math.random() - 0.5) * 3,
        name: sp.name
      });
    }

    this.spawnKeys(keySpawns);
    return { lockedDoors, keySpawns };
  }

  applyMatchConfig(lockedDoors = [], keySpawns = []) {
    this.clear();

    const isSeminarLocked = lockedDoors.some((d) => (typeof d === 'string' ? d === 'door_seminar_gate' : d.id === 'door_seminar_gate'));
    if (isSeminarLocked) {
      if (this.level && this.level.resetSeminarGate) {
        this.level.resetSeminarGate();
      }
      this.lockedDoorIds.add('door_seminar_gate');
    } else {
      if (this.level && this.level.unlockSeminarGate) {
        this.level.unlockSeminarGate();
      }
      this.lockedDoorIds.delete('door_seminar_gate');
    }

    if (this.level && this.level.doors) {
      this.level.doors.forEach((door) => {
        const isTarget = lockedDoors.some((d) => (typeof d === 'string' ? d === door.id : d.id === door.id));
        if (isTarget) {
          door.isLocked = true;
          door.setOpen(false);
          door.customLockedPrompt = '🔒 DOOR LOCKED [KEY REQUIRED]';
          this.lockedDoorIds.add(door.id);
        } else {
          door.isLocked = false;
          door.customLockedPrompt = null;
        }
      });
    }

    this.spawnKeys(keySpawns);
  }

  spawnKeys(spawns = []) {
    const keyTex = loadTexture(ASSET_PATHS.items.key, 1, 1);
    const keyGeo = new THREE.PlaneGeometry(0.55, 0.55);
    const keyMat = new THREE.MeshBasicMaterial({
      map: keyTex,
      transparent: true,
      side: THREE.DoubleSide
    });

    spawns.forEach((sp) => {
      if (this.activeKeyPickups.has(sp.id)) return;

      const group = new THREE.Group();
      group.position.set(sp.x, sp.y, sp.z);

      const mesh = new THREE.Mesh(keyGeo, keyMat);
      group.add(mesh);

      // Glowing point light beacon
      const light = new THREE.PointLight(0xf1c40f, 2.0, 6.0);
      light.position.set(0, 0, 0);
      group.add(light);

      this.scene.add(group);
      this.activeKeyPickups.set(sp.id, {
        id: sp.id,
        group,
        light,
        baseY: sp.y,
        x: sp.x,
        z: sp.z
      });
    });
  }

  removeKey(keyId) {
    const item = this.activeKeyPickups.get(keyId);
    if (item) {
      if (item.group && item.group.parent) {
        item.group.parent.remove(item.group);
      }
      this.activeKeyPickups.delete(keyId);
    }
  }

  unlockDoor(doorId) {
    this.lockedDoorIds.delete(doorId);

    // Check if this is the Seminar Hall Gate
    if (doorId === 'door_seminar_gate') {
      if (this.level && this.level.unlockSeminarGate) {
        this.level.unlockSeminarGate();
      }
      return;
    }

    if (this.level && this.level.doors) {
      const door = this.level.doors.find((d) => d.id === doorId);
      if (door) {
        door.isLocked = false;
        door.customLockedPrompt = null;
        door.setOpen(true);
      }
    }
  }

  update(deltaTime, playerPosition, input = null) {
    this.animTimer += deltaTime;

    // 1. Animate key pickups (bob & rotate)
    this.activeKeyPickups.forEach((item) => {
      if (item.group) {
        item.group.rotation.y += deltaTime * 2.5;
        item.group.position.y = item.baseY + Math.sin(this.animTimer * 3.0) * 0.15;
      }

      // Check pickup collision
      if (playerPosition) {
        const dx = item.x - playerPosition.x;
        const dz = item.z - playerPosition.z;
        const distSq = dx * dx + dz * dz;

        if (distSq < 2.5) { // within ~1.5m
          this.collectKey(item.id);
        }
      }
    });

    // 2. Check regular door unlocks with key
    if (this.keysHeld > 0 && playerPosition && this.level && this.level.doors) {
      for (let door of this.level.doors) {
        if (!door.isLocked) continue;

        const doorPos = door.pivot ? door.pivot.position : null;
        if (!doorPos) continue;

        const dist = Math.hypot(doorPos.x - playerPosition.x, doorPos.z - playerPosition.z);
        if (dist < 3.2) {
          // If close, unlock door
          const wantsInteract = input && input.keys && (input.keys.KeyE || input.keys.e);
          if (wantsInteract || dist < 2.0) {
            this.useKeyOnDoor(door.id);
            break;
          }
        }
      }
    }

    // 3. Check Seminar Gate unlock with key (Gate is at x: 55, z: 45.5)
    if (this.keysHeld > 0 && playerPosition && this.lockedDoorIds.has('door_seminar_gate')) {
      const distToGate = Math.hypot(55 - playerPosition.x, 45.5 - playerPosition.z);
      if (distToGate < 3.8) {
        const wantsInteract = input && input.keys && (input.keys.KeyE || input.keys.e);
        if (wantsInteract || distToGate < 2.0) {
          this.useKeyOnDoor('door_seminar_gate');
        }
      }
    }
  }

  collectKey(keyId) {
    this.keysHeld++;
    this.removeKey(keyId);

    if (this.audio && this.audio.playComboSound) {
      this.audio.playComboSound(1);
    }

    if (this.onKeyCollected) {
      this.onKeyCollected(keyId, this.keysHeld);
    }
  }

  useKeyOnDoor(doorId) {
    if (this.keysHeld <= 0) return;
    this.keysHeld--;
    this.unlockDoor(doorId);

    if (this.audio && this.audio.playComboSound) {
      this.audio.playComboSound(2);
    }

    if (this.onDoorUnlocked) {
      this.onDoorUnlocked(doorId, this.keysHeld);
    }
  }

  clear() {
    this.keysHeld = 0;
    this.activeKeyPickups.forEach((item) => {
      if (item.group && item.group.parent) {
        item.group.parent.remove(item.group);
      }
    });
    this.activeKeyPickups.clear();
    this.lockedDoorIds.clear();

    // Ensure Seminar Gate is not left locked if player leaves Battle mode
    if (this.level && this.level.unlockSeminarGate) {
      this.level.unlockSeminarGate();
    }
  }
}
