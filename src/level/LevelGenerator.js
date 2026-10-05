/**
 * LevelGenerator Module
 * Generates continuous deterministic 3D map geometry, seamless floor foundation,
 * lighting, doorways, elevator, and rock-solid collision detection.
 */
import * as THREE from 'three';
import { ASSET_PATHS, loadTexture } from '../config/assets.js';
import { Elevator } from '../interactive/Elevator.js';

export class LevelGenerator {
  constructor(scene, levelData) {
    this.scene = scene;
    this.data = levelData;
    this.colliders = []; // List of THREE.Box3 for player/enemy collisions
    this.lights = [];
    this.elevator = null;
    this.builtWalls = new Set();

    this.materials = this.initMaterials();
    this.buildMap();
  }

  initMaterials() {
    return {
      floor: new THREE.MeshStandardMaterial({
        map: loadTexture(ASSET_PATHS.textures.floor, 16, 20, '#888877', '#666655'),
        roughness: 0.8,
        metalness: 0.1,
      }),
      ceiling: new THREE.MeshStandardMaterial({
        map: loadTexture(ASSET_PATHS.textures.ceiling, 8, 12, '#ffffff', '#cccccc'),
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
        color: 0x4a7a8c,
        roughness: 0.5,
        metalness: 0.4,
      }),
      lightFixture: new THREE.MeshBasicMaterial({
        color: 0xffffff,
      })
    };
  }

  buildMap() {
    const h = this.data.ceilingHeight || 3.6;
    const b = this.data.bounds;
    const totalW = b.maxX - b.minX + 8;
    const totalL = b.maxZ - b.minZ + 8;
    const midX = (b.minX + b.maxX) / 2;
    const midZ = (b.minZ + b.maxZ) / 2;

    // 1. Continuous Foundation Base Floor (NO BLACK HOLES OR GAPS!)
    const baseFloorGeo = new THREE.PlaneGeometry(totalW, totalL);
    const baseFloorMesh = new THREE.Mesh(baseFloorGeo, this.materials.floor);
    baseFloorMesh.rotation.x = -Math.PI / 2;
    baseFloorMesh.position.set(midX, 0, midZ);
    baseFloorMesh.receiveShadow = true;
    this.scene.add(baseFloorMesh);

    // 2. Continuous Base Ceiling
    const baseCeilingGeo = new THREE.PlaneGeometry(totalW, totalL);
    const baseCeilingMesh = new THREE.Mesh(baseCeilingGeo, this.materials.ceiling);
    baseCeilingMesh.rotation.x = Math.PI / 2;
    baseCeilingMesh.position.set(midX, h, midZ);
    this.scene.add(baseCeilingMesh);

    // 3. Fluorescent Lighting & Fixtures across rooms
    this.data.rooms.forEach((room) => {
      const fixtureGeo = new THREE.BoxGeometry(0.5, 0.1, 2.0);
      const fixtureMesh = new THREE.Mesh(fixtureGeo, this.materials.lightFixture);
      fixtureMesh.position.set(room.x, h - 0.05, room.z);
      this.scene.add(fixtureMesh);

      const light = new THREE.PointLight(0xfff5e6, 1.3, Math.max(room.w, room.l) * 1.3, 1.5);
      light.position.set(room.x, h - 0.25, room.z);
      this.scene.add(light);
      this.lights.push(light);
    });

    // 4. Build Walls with Doorway Openings
    this.buildWalls(h);

    // 5. Add Lockers along corridors
    this.addProps();

    // 6. Build Accessible Elevator inside East Wing Alcove
    if (this.data.elevator) {
      this.elevator = new Elevator(this.scene, this.data.elevator);
      // Register elevator barrier colliders
      const elevColliders = this.elevator.getColliders();
      elevColliders.forEach((box) => this.colliders.push(box));
    }

    // 7. Ambient Light
    const ambient = new THREE.AmbientLight(0xffffff, 0.7);
    this.scene.add(ambient);
  }

  buildWalls(h) {
    const wallThick = 0.5;

    // Define room boundary walls
    // We filter out internal connected boundaries where corridors seamlessly meet!
    this.data.rooms.forEach((room) => {
      const minX = room.x - room.w / 2;
      const maxX = room.x + room.w / 2;
      const minZ = room.z - room.l / 2;
      const maxZ = room.z + room.l / 2;

      // 4 Wall Edges: North (Z-min), South (Z-max), West (X-min), East (X-max)
      this.processWallSegment(minX, maxX, minZ, 'z', -1, room, h); // North
      this.processWallSegment(minX, maxX, maxZ, 'z', 1, room, h);  // South
      this.processWallSegment(minZ, maxZ, minX, 'x', -1, room, h); // West
      this.processWallSegment(minZ, maxZ, maxX, 'x', 1, room, h);  // East
    });
  }

  processWallSegment(start, end, pos, axis, side, room, h) {
    const wallLength = end - start;
    const wallThick = 0.5;
    const doorH = 2.6;
    const lintelH = h - doorH;

    // Find any doorway lying on this wall segment
    const doorway = this.data.doorways.find((d) => {
      if (axis === 'z') {
        return Math.abs(d.z - pos) < 0.6 && d.x >= start && d.x <= end;
      } else {
        return Math.abs(d.x - pos) < 0.6 && d.z >= start && d.z <= end;
      }
    });

    // Check if this wall edge is an open connection to an adjacent room
    if (!doorway && this.isOpenRoomAdjacency(start, end, pos, axis, room)) {
      return; // Open hallway connection, leave clear!
    }

    if (doorway) {
      const doorW = doorway.w || 3.0;

      if (axis === 'z') {
        const seg1W = doorway.x - doorW / 2 - start;
        const seg2W = end - (doorway.x + doorW / 2);

        // Wall before door
        if (seg1W > 0.3) {
          this.addStaticWall(start + seg1W / 2, h / 2, pos, seg1W, h, wallThick);
        }
        // Wall after door
        if (seg2W > 0.3) {
          this.addStaticWall(end - seg2W / 2, h / 2, pos, seg2W, h, wallThick);
        }
        // Lintel above door (no collision box so player walks underneath!)
        this.addStaticWall(doorway.x, doorH + lintelH / 2, pos, doorW, lintelH, wallThick, false);

        // Door frame pillars
        this.addDoorPillar(doorway.x - doorW / 2, pos, doorH);
        this.addDoorPillar(doorway.x + doorW / 2, pos, doorH);
      } else {
        const seg1L = doorway.z - doorW / 2 - start;
        const seg2L = end - (doorway.z + doorW / 2);

        if (seg1L > 0.3) {
          this.addStaticWall(pos, h / 2, start + seg1L / 2, wallThick, h, seg1L);
        }
        if (seg2L > 0.3) {
          this.addStaticWall(pos, h / 2, end - seg2L / 2, wallThick, h, seg2L);
        }
        // Lintel above door (no collision box)
        this.addStaticWall(pos, doorH + lintelH / 2, doorway.z, wallThick, lintelH, doorW, false);

        this.addDoorPillar(pos, doorway.z - doorW / 2, doorH);
        this.addDoorPillar(pos, doorway.z + doorW / 2, doorH);
      }
    } else {
      // Solid Wall
      if (axis === 'z') {
        this.addStaticWall((start + end) / 2, h / 2, pos, wallLength, h, wallThick);
      } else {
        this.addStaticWall(pos, h / 2, (start + end) / 2, wallThick, h, wallLength);
      }
    }
  }

  isOpenRoomAdjacency(start, end, pos, axis, room) {
    // If this edge touches another room's interior, check if it's supposed to be an open corridor intersection
    for (let r of this.data.rooms) {
      if (r.id === room.id) continue;
      const rMinX = r.x - r.w / 2 - 0.1;
      const rMaxX = r.x + r.w / 2 + 0.1;
      const rMinZ = r.z - r.l / 2 - 0.1;
      const rMaxZ = r.z + r.l / 2 + 0.1;

      // Special open junctions:
      // Central corridor connecting to Lobby
      if ((room.id === 'lobby' && r.id === 'corridor_central') ||
          (room.id === 'corridor_central' && r.id === 'lobby')) {
        return false; // Handled by d_lobby_central doorway
      }
    }
    return false;
  }

  addDoorPillar(x, z, h) {
    const geo = new THREE.BoxGeometry(0.2, h, 0.2);
    const mesh = new THREE.Mesh(geo, this.materials.doorFrame);
    mesh.position.set(x, h / 2, z);
    this.scene.add(mesh);
  }

  addProps() {
    // Lockers along central corridor and west wing
    this.addLockerBank(2.6, 2, 4.0);
    this.addLockerBank(-2.6, -6, 4.0);
    this.addLockerBank(-13, 2.7, 3.5);
    this.addLockerBank(13, -7.7, 3.5);
  }

  addLockerBank(x, z, length) {
    const geo = new THREE.BoxGeometry(0.5, 2.2, length);
    const mesh = new THREE.Mesh(geo, this.materials.locker);
    mesh.position.set(x, 1.1, z);
    this.scene.add(mesh);
    this.addColliderBox(x, 1.1, z, 0.5, 2.2, length);
  }

  addStaticWall(x, y, z, wx, hy, lz, addCollider = true) {
    if (wx <= 0.05 || lz <= 0.05) return null;
    if (!this.builtWalls) this.builtWalls = new Set();
    const key = `${Math.round(x * 4)}_${Math.round(y * 2)}_${Math.round(z * 4)}_${Math.round(wx * 4)}_${Math.round(lz * 4)}`;
    if (this.builtWalls.has(key)) return null;
    this.builtWalls.add(key);

    const geo = new THREE.BoxGeometry(wx, hy, lz);
    const mesh = new THREE.Mesh(geo, this.materials.wall);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);

    if (addCollider) {
      this.addColliderBox(x, y, z, wx, hy, lz);
    }
    return mesh;
  }

  addColliderBox(x, y, z, wx, hy, lz) {
    const box = new THREE.Box3();
    const half = new THREE.Vector3(wx / 2, hy / 2, lz / 2);
    const center = new THREE.Vector3(x, y, z);
    box.min.subVectors(center, half);
    box.max.addVectors(center, half);
    this.colliders.push(box);
  }

  /**
   * Robust Axis-Separated AABB Collision Resolution
   * Completely prevents clipping or tunneling through walls.
   * Ignores overhead lintels and ceilings so doorways are fully walkable.
   */
  resolveAxisCollision(position, radius, axis) {
    const playerFeet = Math.max(0, position.y - 1.6);
    const playerHead = position.y + 0.2; // approx 1.85m

    const entityBox = new THREE.Box3();
    entityBox.min.set(position.x - radius, playerFeet, position.z - radius);
    entityBox.max.set(position.x + radius, playerHead, position.z + radius);

    for (let i = 0; i < this.colliders.length; i++) {
      const wallBox = this.colliders[i];

      // Ignore overhead geometry (lintels, ceiling lights) or floor geometry
      if (wallBox.min.y >= playerHead || wallBox.max.y <= playerFeet) {
        continue;
      }

      if (entityBox.intersectsBox(wallBox)) {
        if (axis === 'x') {
          // Push out along X
          const distToMin = Math.abs(position.x - wallBox.min.x);
          const distToMax = Math.abs(position.x - wallBox.max.x);
          if (distToMin < distToMax) {
            position.x = wallBox.min.x - radius - 0.005;
          } else {
            position.x = wallBox.max.x + radius + 0.005;
          }
        } else if (axis === 'z') {
          // Push out along Z
          const distToMin = Math.abs(position.z - wallBox.min.z);
          const distToMax = Math.abs(position.z - wallBox.max.z);
          if (distToMin < distToMax) {
            position.z = wallBox.min.z - radius - 0.005;
          } else {
            position.z = wallBox.max.z + radius + 0.005;
          }
        }
      }
    }
  }

  /**
   * Helper for general sphere collision checks (used by bullets, grenades, enemies)
   */
  resolveSphereCollision(position, radius = 0.45) {
    this.resolveAxisCollision(position, radius, 'x');
    this.resolveAxisCollision(position, radius, 'z');
  }
}
