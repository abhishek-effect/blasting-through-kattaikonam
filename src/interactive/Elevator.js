/**
 * Elevator Module
 * Situated in the East Wing Elevator Alcove.
 * Features elevator.jpg textured doors, a solid physical barrier when locked,
 * proximity trigger, and photocopy progression condition.
 */
import * as THREE from 'three';
import { loadTexture, ASSET_PATHS } from '../config/assets.js';

export class Elevator {
  constructor(scene, elevatorData) {
    this.scene = scene;
    this.data = elevatorData;
    this.position = new THREE.Vector3(elevatorData.x, 0, elevatorData.z);
    this.interactionRadius = elevatorData.interactionRadius || 3.2;

    this.isLocked = true;
    this.promptTitle = '';
    this.promptSubtitle = '';
    this.isPlayerNear = false;

    // Front interaction spot (facing North into Elevator Alcove)
    this.frontPosition = new THREE.Vector3(this.data.x, 1.65, this.data.z + 1.2);

    this.buildMesh();
  }

  buildMesh() {
    this.group = new THREE.Group();
    this.group.position.set(this.data.x, 0, this.data.z);

    const w = this.data.w;
    const l = this.data.l;
    const h = 3.6;

    // 1. Cabin Frame Materials
    const frameMat = new THREE.MeshStandardMaterial({
      color: 0x2f3640,
      roughness: 0.5,
      metalness: 0.6
    });

    // 2. Elevator Doors with elevator.jpg texture!
    const doorTex = loadTexture(ASSET_PATHS.textures.elevator, 1, 1, '#7f8c8d', '#95a5a6');
    const doorMat = new THREE.MeshStandardMaterial({
      map: doorTex,
      roughness: 0.4,
      metalness: 0.5
    });

    // Front Doors facing North (towards Z+)
    const doorGeo = new THREE.BoxGeometry(w, h, 0.4);
    this.doorMesh = new THREE.Mesh(doorGeo, doorMat);
    this.doorMesh.position.set(0, h / 2, 0);
    this.group.add(this.doorMesh);

    // Archway & Signs
    const signGeo = new THREE.BoxGeometry(w + 0.4, 0.6, 0.5);
    const signMesh = new THREE.Mesh(signGeo, frameMat);
    signMesh.position.set(0, h + 0.1, 0);
    this.group.add(signMesh);

    // Indicator Light above elevator
    const lightGeo = new THREE.SphereGeometry(0.15, 8, 8);
    this.statusLightMat = new THREE.MeshBasicMaterial({ color: 0xff2222 }); // Red when locked
    this.statusLightMesh = new THREE.Mesh(lightGeo, this.statusLightMat);
    this.statusLightMesh.position.set(0, h + 0.1, 0.3);
    this.group.add(this.statusLightMesh);

    this.scene.add(this.group);
  }

  getColliders() {
    // Solid barrier box across the elevator doors so player CANNOT clip through without photocopy!
    const h = 3.6;
    const box = new THREE.Box3();
    const half = new THREE.Vector3(this.data.w / 2 + 0.2, h / 2, 0.6);
    const center = new THREE.Vector3(this.data.x, h / 2, this.data.z);
    box.min.subVectors(center, half);
    box.max.addVectors(center, half);
    return [box];
  }

  update(player) {
    if (!player) return;

    const dist = player.position.distanceTo(this.frontPosition);
    this.isPlayerNear = dist <= this.interactionRadius;

    if (this.isPlayerNear) {
      if (!player.hasPhotocopy) {
        // Locked
        this.isLocked = true;
        this.statusLightMat.color.setHex(0xff2222);
        this.promptTitle = 'WHERE IS YOUR PHOTOCOPY?';
        this.promptSubtitle = 'You need a photocopy to enter the elevator.';
      } else {
        // Unlocked hook
        this.isLocked = false;
        this.statusLightMat.color.setHex(0x2ecc71);
        this.promptTitle = '[E] ENTER ELEVATOR';
        this.promptSubtitle = 'Access granted. Press E to travel to Floor 2.';
      }
    } else {
      this.promptTitle = '';
      this.promptSubtitle = '';
    }
  }

  interact(player, onFloorTransition) {
    if (!this.isPlayerNear) return false;

    if (!player.hasPhotocopy) {
      return false; // Still locked!
    }

    if (onFloorTransition) {
      onFloorTransition(this.data.targetFloor);
    }
    return true;
  }
}
