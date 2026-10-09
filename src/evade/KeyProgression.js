/**
 * KeyProgression Module
 * Implements the Roblox Evade key hunt and room unlocking progression.
 * Features:
 * - Locks all room doors at match start.
 * - Spawns 3D rotating golden keys with glowing halos in sequence.
 * - Unlocks rooms sequentially: Infirmary -> Computer Lab -> Bio Lab -> Phy Lab -> Library -> Seminar Hall.
 * - Escalates Nextbot threat and speed upon every room unlock.
 * - Activates the Seminar Hall escape zone.
 * - Handles 'YOU ESCAPED' victory and 'You oofed' defeat triggers.
 */
import * as THREE from 'three';

export const KEY_CHAIN = [
  {
    step: 0,
    id: 'key_infirmary',
    name: 'INFIRMARY KEY',
    doorId: 'door_infirmary',
    doorName: 'INFIRMARY',
    pos: new THREE.Vector3(34, 0.8, 80), // South Central Corridor near spawn
    hint: 'Search South Hall near spawn for the Infirmary Key'
  },
  {
    step: 1,
    id: 'key_computer_lab',
    name: 'COMPUTER LAB KEY',
    doorId: 'door_computer_lab',
    doorName: 'COMPUTER LAB',
    pos: new THREE.Vector3(7, 0.8, 22), // Inside School Infirmary
    hint: 'Enter Infirmary to locate the Computer Lab Key'
  },
  {
    step: 2,
    id: 'key_bio_lab',
    name: 'BIOLOGY LAB KEY',
    doorId: 'door_bio_lab',
    doorName: 'BIOLOGY LAB',
    pos: new THREE.Vector3(7, 0.8, 57), // Inside Computer Lab
    hint: 'Search Computer Lab tables for Biology Lab Key'
  },
  {
    step: 3,
    id: 'key_phy_lab',
    name: 'PHYSICS LAB KEY',
    doorId: 'door_phy_lab',
    doorName: 'PHYSICS LAB',
    pos: new THREE.Vector3(7, 0.8, 75), // Inside Biology Lab
    hint: 'Search Biology Lab counter for Physics Lab Key'
  },
  {
    step: 4,
    id: 'key_library',
    name: 'CAMPUS LIBRARY KEY',
    doorId: 'door_library',
    doorName: 'CAMPUS LIBRARY',
    pos: new THREE.Vector3(50, 0.8, 8), // Inside Physics Lab
    hint: 'Search Physics Lab workbenches for Library Key'
  },
  {
    step: 5,
    id: 'key_seminar_hall',
    name: 'SEMINAR HALL KEY',
    doorId: 'door_seminar_gate',
    doorName: 'SEMINAR HALL',
    pos: new THREE.Vector3(83, 0.8, 91), // Deep inside Campus Library
    hint: 'Locate the Master Seminar Hall Key in Campus Library!'
  }
];

export class KeyProgression {
  constructor(scene, level, nextbotManager, audio) {
    this.scene = scene;
    this.level = level;
    this.nextbotManager = nextbotManager;
    this.audio = audio;

    this.currentStep = 0;
    this.activeKeyMesh = null;
    this.activeKeyData = null;
    this.escapeZoneMesh = null;
    this.isSeminarUnlocked = false;

    // Callbacks
    this.onKeyCollected = null;
    this.onRoomUnlocked = null;
    this.onEscapeTriggered = null;

    // Build Key Geometries & Materials
    this.keyGroup = new THREE.Group();
    this.scene.add(this.keyGroup);

    this.keyMat = new THREE.MeshStandardMaterial({
      color: 0xffd700, // Shiny gold
      metalness: 0.85,
      roughness: 0.2,
      emissive: 0xffa502,
      emissiveIntensity: 0.4
    });

    // Escape Zone Beacon
    this.escapeZonePos = new THREE.Vector3(77.5, 0, 46.5); // Inside Seminar Hall Auditorium Stage
    this.escapeRadius = 7.5;
  }

  reset() {
    if (this.activeKeyMesh) {
      this.keyGroup.remove(this.activeKeyMesh);
      this.activeKeyMesh = null;
    }
    this.activeKeyData = null;
    if (this.escapeZoneMesh) {
      this.scene.remove(this.escapeZoneMesh);
      this.escapeZoneMesh = null;
    }
    this.currentStep = 0;
    this.isSeminarUnlocked = false;
  }

  /**
   * Initializes or resets key hunt progression
   */
  initProgression() {
    this.reset();

    // 1. Lock all relevant room doors
    if (this.level && this.level.doors) {
      KEY_CHAIN.forEach((kc) => {
        const door = this.level.doors.find((d) => d.id === kc.doorId);
        if (door) {
          door.setOpen(false);
          door.isLocked = true;
          door.requiresKills = 0; // Evade uses keys instead of kills
        }
      });
    }

    if (this.level && this.level.resetSeminarGate) {
      this.level.resetSeminarGate();
    }

    // 2. Spawn initial key (Key 1 for Infirmary)
    this.spawnKeyForStep(0);
  }

  spawnKeyForStep(step) {
    if (this.activeKeyMesh) {
      this.keyGroup.remove(this.activeKeyMesh);
      this.activeKeyMesh = null;
    }

    if (step >= KEY_CHAIN.length) {
      this.activeKeyData = null;
      return;
    }

    this.currentStep = step;
    const kc = KEY_CHAIN[step];
    this.activeKeyData = kc;

    // Build 3D Key Model
    const keyRig = new THREE.Group();
    keyRig.position.copy(kc.pos);

    // 1. Key Bow / Loop
    const bowGeo = new THREE.TorusGeometry(0.24, 0.06, 12, 24);
    bowGeo.rotateX(Math.PI / 2);
    const bowMesh = new THREE.Mesh(bowGeo, this.keyMat);
    bowMesh.position.y = 0.4;
    keyRig.add(bowMesh);

    // 2. Key Stem / Shaft
    const shaftGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.55, 12);
    const shaftMesh = new THREE.Mesh(shaftGeo, this.keyMat);
    shaftMesh.position.y = 0.1;
    keyRig.add(shaftMesh);

    // 3. Key Teeth / Bit
    const bitGeo = new THREE.BoxGeometry(0.18, 0.16, 0.05);
    const bitMesh = new THREE.Mesh(bitGeo, this.keyMat);
    bitMesh.position.set(0.09, -0.05, 0);
    keyRig.add(bitMesh);

    // 4. Glowing halo beacon
    const ringGeo = new THREE.RingGeometry(0.35, 0.65, 24);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xffd32a,
      transparent: true,
      opacity: 0.65,
      side: THREE.DoubleSide
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.position.y = -0.55;
    keyRig.add(ringMesh);

    // 5. Light
    const pointLight = new THREE.PointLight(0xfffa65, 2.0, 5);
    pointLight.position.set(0, 0.2, 0);
    keyRig.add(pointLight);

    this.keyGroup.add(keyRig);
    this.activeKeyMesh = keyRig;
    this.activeKeyRing = ringMesh;
  }

  createEscapeZone() {
    if (this.escapeZoneMesh) return;

    const group = new THREE.Group();
    group.position.copy(this.escapeZonePos);

    // 1. Glowing extraction zone cylinder
    const cylGeo = new THREE.CylinderGeometry(this.escapeRadius, this.escapeRadius, 10, 32, 1, true);
    const cylMat = new THREE.MeshBasicMaterial({
      color: 0x2ecc71,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide
    });
    const cyl = new THREE.Mesh(cylGeo, cylMat);
    cyl.position.y = 5.0;
    group.add(cyl);

    // 2. Pulsing ground extraction ring
    const ringGeo = new THREE.RingGeometry(this.escapeRadius - 1.2, this.escapeRadius, 32);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x2ecc71,
      transparent: true,
      opacity: 0.75,
      side: THREE.DoubleSide
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.y = 0.1;
    group.add(ring);

    // 3. Bright extraction spotlight
    const light = new THREE.PointLight(0x2ecc71, 3.5, 25);
    light.position.set(0, 4.0, 0);
    group.add(light);

    this.scene.add(group);
    this.escapeZoneMesh = group;
  }

  update(deltaTime, playerPosition, onEscapeCallback) {
    // 1. Animate active floating key
    if (this.activeKeyMesh) {
      this.activeKeyMesh.rotation.y += deltaTime * 2.5;
      this.activeKeyMesh.position.y = this.activeKeyData.pos.y + Math.sin(Date.now() * 0.004) * 0.12;

      // Check distance to player for pickup
      if (playerPosition) {
        const d = Math.hypot(
          this.activeKeyMesh.position.x - playerPosition.x,
          this.activeKeyMesh.position.z - playerPosition.z
        );
        if (d <= 2.2) {
          // Key collected!
          this.collectKey(this.activeKeyData.id);
        }
      }
    }

    // 2. Animate and check escape zone
    if (this.isSeminarUnlocked && this.escapeZoneMesh) {
      this.escapeZoneMesh.rotation.y += deltaTime * 0.4;

      if (playerPosition) {
        const d = Math.hypot(
          this.escapeZonePos.x - playerPosition.x,
          this.escapeZonePos.z - playerPosition.z
        );
        if (d <= this.escapeRadius) {
          if (onEscapeCallback) {
            onEscapeCallback();
          }
        }
      }
    }
  }

  collectKey(keyId) {
    if (!this.activeKeyData || this.activeKeyData.id !== keyId) return;

    const collectedKey = this.activeKeyData;

    // Play pickup chime
    if (this.audio && this.audio.playPickup) {
      this.audio.playPickup();
    }

    // Unlock the associated door
    this.unlockDoor(collectedKey.doorId, collectedKey.doorName);

    // Advance step
    const nextStep = this.currentStep + 1;

    if (this.onKeyCollected) {
      this.onKeyCollected(collectedKey, nextStep);
    }

    if (nextStep < KEY_CHAIN.length) {
      this.spawnKeyForStep(nextStep);
    } else {
      // All keys found! Seminar Hall is unlocked
      this.activeKeyMesh = null;
      this.activeKeyData = null;
    }
  }

  unlockDoor(doorId, doorName) {
    if (doorId === 'door_seminar_gate') {
      // Final seminar hall gate
      if (this.level && this.level.unlockSeminarGate) {
        this.level.unlockSeminarGate();
      }
      this.isSeminarUnlocked = true;
      this.createEscapeZone();

      if (this.nextbotManager) {
        this.nextbotManager.onRoomUnlocked(KEY_CHAIN.length);
      }
      if (this.onRoomUnlocked) {
        this.onRoomUnlocked('SEMINAR HALL', true);
      }
      return;
    }

    // Standard room door
    if (this.level && this.level.doors) {
      const door = this.level.doors.find((d) => d.id === doorId);
      if (door) {
        door.isLocked = false;
        door.setOpen(true);
      }
    }

    // Notify Nextbot manager to increase count and speed!
    if (this.nextbotManager) {
      this.nextbotManager.onRoomUnlocked(this.currentStep + 1);
    }
    if (this.onRoomUnlocked) {
      this.onRoomUnlocked(doorName, false);
    }
  }

  getCurrentObjectiveText() {
    if (this.isSeminarUnlocked) {
      return '★ SEMINAR HALL OPEN! RUN INSIDE TO ESCAPE!';
    }
    if (this.activeKeyData) {
      return `🔑 OBJECTIVE: ${this.activeKeyData.hint}`;
    }
    return 'SURVIVE AND ESCAPE';
  }
}
