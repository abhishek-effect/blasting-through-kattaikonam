/**
 * Door Module
 * Functional interactable double-leaf doors for every room on campus.
 * Textured with door-texture.jpg, includes smooth pivot swing animations,
 * dynamic AABB collision registration, and proximity interaction prompts.
 */
import * as THREE from 'three';
import { ASSET_PATHS, loadTexture } from '../config/assets.js';

export class Door {
  constructor(scene, collidersList, audio, config) {
    this.scene = scene;
    this.collidersList = collidersList;
    this.audio = audio;

    this.id = config.id || `door_${Math.random()}`;
    this.name = config.name || 'ROOM';
    this.x = config.x;
    this.z = config.z;
    this.width = config.width || 4.0;
    this.height = config.height || 3.5;
    this.thickness = 0.14;
    this.dir = config.dir || 'x'; // 'x' = wall runs along X; 'z' = wall runs along Z
    this.swingDir = config.swingDir || 1; // 1 or -1 for swing direction
    this.isLocked = !!config.isLocked;
    this.requiresKills = config.requiresKills || 0;
    this.interactionRadius = config.interactionRadius || 3.2;

    this.isOpen = false;
    this.currentAngle = 0;
    this.targetAngle = 0;
    this.isPlayerNear = false;

    // Rich brown door material using door-texture-new.webp
    const doorTex = loadTexture(ASSET_PATHS.textures.door, 1, 1, '#8b5a2b', '#5c3a21');
    doorTex.wrapS = THREE.ClampToEdgeWrapping;
    doorTex.wrapT = THREE.ClampToEdgeWrapping;

    this.doorMaterial = new THREE.MeshStandardMaterial({
      map: doorTex,
      color: 0x8d5b32, // Warm rich brown
      roughness: 0.55,
      metalness: 0.1,
      side: THREE.DoubleSide
    });

    // Deep brown frame
    this.frameMaterial = new THREE.MeshStandardMaterial({
      color: 0x3d2314,
      roughness: 0.75,
      metalness: 0.1
    });

    this.group = new THREE.Group();
    this.scene.add(this.group);

    // Build Double-Leaf Hinge Rig
    this.buildDoubleDoor();

    // Build Blue Plaque Sign with White Border & White Text Above Door Frame
    this.buildRoomSign();

    // Closed Collider
    this.collider = new THREE.Box3();
    this.updateCollider();
    this.collidersList.push(this.collider);
  }

  buildDoubleDoor() {
    const halfW = this.width / 2;
    const leafW = halfW - 0.02; // Small gap between leaves
    const leafGeo = new THREE.BoxGeometry(
      this.dir === 'x' ? leafW : this.thickness,
      this.height,
      this.dir === 'x' ? this.thickness : leafW
    );

    // Left Pivot (Hinge 1)
    this.leftPivot = new THREE.Group();
    // Right Pivot (Hinge 2)
    this.rightPivot = new THREE.Group();

    if (this.dir === 'x') {
      // Wall runs along X axis
      this.leftPivot.position.set(this.x - halfW, 0, this.z);
      this.rightPivot.position.set(this.x + halfW, 0, this.z);

      // Left Leaf Mesh: offset from hinge by +leafW/2
      const leftMesh = new THREE.Mesh(leafGeo, this.doorMaterial);
      leftMesh.position.set(leafW / 2, this.height / 2, 0);
      leftMesh.castShadow = true;
      leftMesh.receiveShadow = true;
      this.leftPivot.add(leftMesh);

      // Right Leaf Mesh: offset from hinge by -leafW/2
      const rightMesh = new THREE.Mesh(leafGeo, this.doorMaterial);
      rightMesh.position.set(-leafW / 2, this.height / 2, 0);
      rightMesh.castShadow = true;
      rightMesh.receiveShadow = true;
      this.rightPivot.add(rightMesh);
    } else {
      // Wall runs along Z axis
      this.leftPivot.position.set(this.x, 0, this.z - halfW);
      this.rightPivot.position.set(this.x, 0, this.z + halfW);

      // Left Leaf Mesh: offset along +Z
      const leftMesh = new THREE.Mesh(leafGeo, this.doorMaterial);
      leftMesh.position.set(0, this.height / 2, leafW / 2);
      leftMesh.castShadow = true;
      leftMesh.receiveShadow = true;
      this.leftPivot.add(leftMesh);

      // Right Leaf Mesh: offset along -Z
      const rightMesh = new THREE.Mesh(leafGeo, this.doorMaterial);
      rightMesh.position.set(0, this.height / 2, -leafW / 2);
      rightMesh.castShadow = true;
      rightMesh.receiveShadow = true;
      this.rightPivot.add(rightMesh);
    }

    this.group.add(this.leftPivot);
    this.group.add(this.rightPivot);
  }

  updateCollider() {
    const halfThick = 0.35;
    const halfW = this.width / 2;

    if (this.dir === 'x') {
      this.collider.min.set(this.x - halfW, 0, this.z - halfThick);
      this.collider.max.set(this.x + halfW, this.height, this.z + halfThick);
    } else {
      this.collider.min.set(this.x - halfThick, 0, this.z - halfW);
      this.collider.max.set(this.x + halfThick, this.height, this.z + halfW);
    }
  }

  toggle() {
    if (this.isLocked) return false;
    return this.setOpen(!this.isOpen);
  }

  setOpen(open) {
    if (this.isOpen === open) return false;
    this.isOpen = open;

    if (this.isOpen) {
      this.targetAngle = (Math.PI * 0.48) * this.swingDir; // ~86 degrees swing
      // Remove collider so player & enemies can pass freely
      const idx = this.collidersList.indexOf(this.collider);
      if (idx !== -1) {
        this.collidersList.splice(idx, 1);
      }
    } else {
      this.targetAngle = 0;
      // Re-add collider to block doorway
      if (!this.collidersList.includes(this.collider)) {
        this.collidersList.push(this.collider);
      }
    }

    if (this.audio && this.audio.playDoorSound) {
      this.audio.playDoorSound(this.isOpen);
    }

    return true;
  }

  update(deltaTime, playerPosition) {
    // 1. Smooth swing rotation interpolation
    if (Math.abs(this.currentAngle - this.targetAngle) > 0.001) {
      const step = deltaTime * 6.5;
      this.currentAngle = THREE.MathUtils.lerp(this.currentAngle, this.targetAngle, Math.min(1.0, step));

      // Left swings one way, right swings opposite way
      this.leftPivot.rotation.y = this.currentAngle;
      this.rightPivot.rotation.y = -this.currentAngle;
    }

    // 2. Check distance to player
    if (playerPosition) {
      const dist = Math.hypot(playerPosition.x - this.x, playerPosition.z - this.z);
      this.isPlayerNear = dist <= this.interactionRadius;
    }
  }

  getPromptInfo(kills = 0) {
    if (this.isLocked && this.requiresKills > 0) {
      if (kills < this.requiresKills) {
        return {
          title: `${this.name}: LOCKED`,
          subtitle: `Eliminate ${this.requiresKills} campus enemies to unlock (${kills}/${this.requiresKills})`,
          isLocked: true
        };
      } else {
        // Unlock
        this.isLocked = false;
      }
    }

    if (this.isLocked) {
      return {
        title: `${this.name}: LOCKED`,
        subtitle: 'Door is locked from the inside',
        isLocked: true
      };
    }

    return {
      title: `${this.name} DOOR`,
      subtitle: this.isOpen ? 'Press [E] or Tap to CLOSE' : 'Press [E] or Tap to OPEN',
      isLocked: false
    };
  }

  /**
   * Builds the blue plaque sign with white borders and white text displaying room name above door frame
   */
  buildRoomSign() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    // 1. Blue Frame Background
    ctx.fillStyle = '#1e3799'; // Deep campus blue
    ctx.fillRect(0, 0, 1024, 256);

    // 2. White Borders
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 14;
    ctx.strokeRect(10, 10, 1004, 236);

    ctx.lineWidth = 4;
    ctx.strokeRect(26, 26, 972, 204);

    // 3. Crisp White Room Title Text
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 76px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.name.toUpperCase(), 512, 128);

    const signTex = new THREE.CanvasTexture(canvas);
    signTex.wrapS = THREE.ClampToEdgeWrapping;
    signTex.wrapT = THREE.ClampToEdgeWrapping;

    const signMat = new THREE.MeshStandardMaterial({
      map: signTex,
      roughness: 0.45,
      metalness: 0.1,
      side: THREE.DoubleSide
    });

    const signW = 2.4;
    const signH = 0.55;
    const signD = 0.08;

    const signGeo = new THREE.BoxGeometry(
      this.dir === 'x' ? signW : signD,
      signH,
      this.dir === 'x' ? signD : signW
    );

    this.signMesh = new THREE.Mesh(signGeo, signMat);
    this.signMesh.position.set(this.x, this.height + 0.38, this.z);
    this.signMesh.castShadow = true;
    this.scene.add(this.signMesh);
  }

  destroy() {
    const idx = this.collidersList.indexOf(this.collider);
    if (idx !== -1) {
      this.collidersList.splice(idx, 1);
    }
    if (this.signMesh) {
      this.scene.remove(this.signMesh);
    }
    this.scene.remove(this.group);
  }
}


