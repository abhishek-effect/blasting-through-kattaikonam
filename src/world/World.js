/**
 * World Module
 * Generates a retro school corridor using primitive 3D Three.js geometry.
 * Designed to be modular: materials, dimensions, and door placements
 * can easily be customized or retextured.
 */
import * as THREE from 'three';
import { ASSET_PATHS, loadTexture } from '../config/assets.js';

export class World {
  constructor(scene) {
    this.scene = scene;
    this.colliders = []; // List of THREE.Box3 for player & enemy collisions
    this.doors = [];
    this.lights = [];

    // Corridor Dimensions (meters)
    this.corridorWidth = 6;
    this.corridorHeight = 3.6;
    this.corridorLength = 36;
    this.originZ = -10; // Center along Z axis

    this.materials = this.initMaterials();
    this.buildCorridor();
    this.buildLighting();
  }

  /**
   * Modular Materials - easily swapped with new textures or colors
   */
  initMaterials() {
    return {
      floor: new THREE.MeshStandardMaterial({
        map: loadTexture(ASSET_PATHS.textures.floor, 4, 18, '#888877', '#666655'),
        roughness: 0.8,
        metalness: 0.1,
      }),
      ceiling: new THREE.MeshStandardMaterial({
        map: loadTexture(ASSET_PATHS.textures.ceiling, 3, 12, '#ffffff', '#cccccc'),
        roughness: 0.9,
      }),
      wall: new THREE.MeshStandardMaterial({
        map: loadTexture(ASSET_PATHS.textures.wall, 4, 2, '#cfcbbf', '#aba89e'),
        roughness: 0.7,
      }),
      door: new THREE.MeshStandardMaterial({
        map: loadTexture(ASSET_PATHS.textures.door, 1, 1, '#8b5a2b', '#5c3a21'),
        roughness: 0.6,
      }),
      doorFrame: new THREE.MeshStandardMaterial({
        color: 0x3e352f,
        roughness: 0.8,
      }),
      locker: new THREE.MeshStandardMaterial({
        color: 0x4a7a8c, // Retro faded teal school locker
        roughness: 0.5,
        metalness: 0.4,
      }),
      lightFixture: new THREE.MeshBasicMaterial({
        color: 0xffffff,
      }),
      trim: new THREE.MeshStandardMaterial({
        color: 0x222222,
        roughness: 0.8,
      })
    };
  }

  /**
   * Builds the entire corridor room
   */
  buildCorridor() {
    const halfW = this.corridorWidth / 2;
    const halfL = this.corridorLength / 2;
    const zStart = this.originZ - halfL;
    const zEnd = this.originZ + halfL;

    // 1. Floor
    const floorGeo = new THREE.PlaneGeometry(this.corridorWidth, this.corridorLength);
    const floorMesh = new THREE.Mesh(floorGeo, this.materials.floor);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.set(0, 0, this.originZ);
    floorMesh.receiveShadow = true;
    this.scene.add(floorMesh);

    // 2. Ceiling
    const ceilingGeo = new THREE.PlaneGeometry(this.corridorWidth, this.corridorLength);
    const ceilingMesh = new THREE.Mesh(ceilingGeo, this.materials.ceiling);
    ceilingMesh.rotation.x = Math.PI / 2;
    ceilingMesh.position.set(0, this.corridorHeight, this.originZ);
    this.scene.add(ceilingMesh);

    // 3. End Walls (Back and Front Caps)
    this.addStaticWall(0, this.corridorHeight / 2, zStart, this.corridorWidth, this.corridorHeight, 0.4);
    this.addStaticWall(0, this.corridorHeight / 2, zEnd, this.corridorWidth, this.corridorHeight, 0.4);

    // 4. Side Walls with Door Openings
    // Door positions along the corridor (Z-coordinates and side)
    const doorSpecs = [
      { side: -1, z: this.originZ - 10, label: 'CLASS 10-A' },
      { side: 1, z: this.originZ - 6, label: 'PRINCIPAL OFFICE' },
      { side: -1, z: this.originZ + 2, label: 'STAFF ROOM' },
      { side: 1, z: this.originZ + 8, label: 'CHEMISTRY LAB' },
    ];

    this.buildSegmentedWall(-halfW, doorSpecs.filter((d) => d.side === -1), -1);
    this.buildSegmentedWall(halfW, doorSpecs.filter((d) => d.side === 1), 1);

    // 5. Retro School Lockers along walls
    this.addLockers(-halfW + 0.35, this.originZ - 1.5, 3.0);
    this.addLockers(halfW - 0.35, this.originZ - 13.5, 3.5);
  }

  /**
   * Builds a wall with doorway cutouts along the Z axis
   */
  buildSegmentedWall(xPos, doorList, sideSign) {
    const halfL = this.corridorLength / 2;
    const zMin = this.originZ - halfL;
    const zMax = this.originZ + halfL;
    const doorWidth = 1.6;
    const doorHeight = 2.5;
    const wallThick = 0.4;

    // Sort doors by Z
    doorList.sort((a, b) => a.z - b.z);

    let currentZ = zMin;

    doorList.forEach((door) => {
      const doorStart = door.z - doorWidth / 2;
      const doorEnd = door.z + doorWidth / 2;

      // Solid wall section before the door
      if (doorStart > currentZ) {
        const segLen = doorStart - currentZ;
        const segZ = currentZ + segLen / 2;
        this.addStaticWall(xPos, this.corridorHeight / 2, segZ, wallThick, this.corridorHeight, segLen);
      }

      // Wall lintel above the doorway
      const lintelHeight = this.corridorHeight - doorHeight;
      const lintelY = doorHeight + lintelHeight / 2;
      this.addStaticWall(xPos, lintelY, door.z, wallThick, lintelHeight, doorWidth);

      // Inset doorway recess and door mesh
      this.addDoorway(xPos, door.z, doorWidth, doorHeight, sideSign, door.label);

      currentZ = doorEnd;
    });

    // Solid wall section after the last door
    if (currentZ < zMax) {
      const segLen = zMax - currentZ;
      const segZ = currentZ + segLen / 2;
      this.addStaticWall(xPos, this.corridorHeight / 2, segZ, wallThick, this.corridorHeight, segLen);
    }
  }

  /**
   * Adds an inset doorway with door slab and frame
   */
  addDoorway(xPos, zPos, width, height, sideSign, labelText) {
    // Door recess wall box behind the doorway to prevent falling into the void
    const recessDepth = 1.2;
    const backWallX = xPos + sideSign * recessDepth;
    this.addStaticWall(backWallX, height / 2, zPos, 0.3, height, width);

    // Door slab
    const doorGeo = new THREE.BoxGeometry(0.08, height - 0.05, width - 0.15);
    const doorMesh = new THREE.Mesh(doorGeo, this.materials.door);
    doorMesh.position.set(xPos + sideSign * 0.4, (height - 0.05) / 2, zPos);
    this.scene.add(doorMesh);

    // Door Frame
    const frameGeo = new THREE.BoxGeometry(0.12, height, 0.08);
    const frame1 = new THREE.Mesh(frameGeo, this.materials.doorFrame);
    frame1.position.set(xPos + sideSign * 0.05, height / 2, zPos - width / 2 + 0.04);
    this.scene.add(frame1);

    const frame2 = new THREE.Mesh(frameGeo, this.materials.doorFrame);
    frame2.position.set(xPos + sideSign * 0.05, height / 2, zPos + width / 2 - 0.04);
    this.scene.add(frame2);

    this.doors.push({ mesh: doorMesh, position: new THREE.Vector3(xPos, height / 2, zPos), label: labelText });
  }

  /**
   * Adds retro high school metal lockers
   */
  addLockers(xPos, zPos, length) {
    const lockerGeo = new THREE.BoxGeometry(0.6, 2.2, length);
    const lockerMesh = new THREE.Mesh(lockerGeo, this.materials.locker);
    lockerMesh.position.set(xPos, 1.1, zPos);
    lockerMesh.castShadow = true;
    lockerMesh.receiveShadow = true;
    this.scene.add(lockerMesh);

    // Add locker to colliders
    const box = new THREE.Box3().setFromObject(lockerMesh);
    this.colliders.push(box);
  }

  /**
   * Helper to create a solid wall mesh and register its AABB collision box
   */
  addStaticWall(x, y, z, widthX, heightY, lengthZ) {
    const geo = new THREE.BoxGeometry(widthX, heightY, lengthZ);
    const mesh = new THREE.Mesh(geo, this.materials.wall);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);

    const box = new THREE.Box3().setFromObject(mesh);
    this.colliders.push(box);
    return mesh;
  }

  /**
   * Corridor lighting: fluorescent ceiling tube lights + ambient base
   */
  buildLighting() {
    // 1. Ambient lighting for retro visibility
    const ambient = new THREE.AmbientLight(0xffffff, 0.75);
    this.scene.add(ambient);

    // 2. Fluorescent tube fixtures spaced along the corridor ceiling
    const zPositions = [
      this.originZ - 12,
      this.originZ - 4,
      this.originZ + 4,
      this.originZ + 12
    ];

    zPositions.forEach((z) => {
      // Light mesh fixture
      const fixtureGeo = new THREE.BoxGeometry(0.5, 0.1, 2.2);
      const fixtureMesh = new THREE.Mesh(fixtureGeo, this.materials.lightFixture);
      fixtureMesh.position.set(0, this.corridorHeight - 0.05, z);
      this.scene.add(fixtureMesh);

      // PointLight with realistic attenuation
      const light = new THREE.PointLight(0xfff6dd, 1.4, 12, 1.5);
      light.position.set(0, this.corridorHeight - 0.2, z);
      this.scene.add(light);
      this.lights.push(light);
    });
  }

  /**
   * Simple and robust Sphere-AABB collision resolution
   * Pushes back an entity position if it intersects any wall collider.
   */
  resolveSphereCollision(position, radius = 0.5) {
    const sphere = new THREE.Sphere(position, radius);
    let collided = false;

    for (let i = 0; i < this.colliders.length; i++) {
      const box = this.colliders[i];

      // Check if sphere intersects AABB box
      if (box.intersectsSphere(sphere)) {
        collided = true;
        // Clamp position to closest point on box
        const closestPoint = new THREE.Vector3();
        box.clampPoint(position, closestPoint);

        const diff = new THREE.Vector3().subVectors(position, closestPoint);
        const dist = diff.length();

        if (dist === 0) {
          // Inside box; nudge outward along X or Z
          position.x += 0.05;
        } else if (dist < radius) {
          // Push out along collision normal
          const pushDir = diff.normalize();
          const overlap = radius - dist;
          position.addScaledVector(pushDir, overlap);
        }
      }
    }

    return collided;
  }
}
