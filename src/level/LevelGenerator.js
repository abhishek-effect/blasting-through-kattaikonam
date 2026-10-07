/**
 * LevelGenerator Module
 * Generates continuous deterministic 3D map geometry, seamless floor foundation,
 * lighting, doorways, elevator, and rock-solid collision detection.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ASSET_PATHS, loadTexture } from '../config/assets.js';
import { Elevator } from '../interactive/Elevator.js';

export class LevelGenerator {
  constructor(scene, levelData) {
    this.scene = scene;
    this.data = levelData;
    this.colliders = []; // List of THREE.Box3 for player/enemy collisions
    this.lights = [];
    this.elevator = null;
    this.seminarGate = null;
    this.builtWalls = new Set();
    this.mapModel = null;
    this.isMapLoaded = false;
    this.proceduralGroup = new THREE.Group();
    this.scene.add(this.proceduralGroup);

    this.materials = this.initMaterials();
    this.buildMap();
    this.buildEnhancedLights();
    this.loadMapGLB();
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
      }),
      blackFloor: new THREE.MeshStandardMaterial({
        color: 0x141414,
        roughness: 0.85,
        metalness: 0.1,
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

    // 1. Continuous Foundation Base Floor
    const baseFloorGeo = new THREE.PlaneGeometry(totalW, totalL);
    const baseFloorMesh = new THREE.Mesh(baseFloorGeo, this.materials.floor);
    baseFloorMesh.rotation.x = -Math.PI / 2;
    baseFloorMesh.position.set(midX, 0, midZ);
    baseFloorMesh.receiveShadow = true;
    this.proceduralGroup.add(baseFloorMesh);

    // 1b. Distinctive Black Floor Tiles for designated rooms (Central Atrium)
    this.data.rooms.forEach((room) => {
      if (room.hasBlackTiles) {
        const atriumGeo = new THREE.PlaneGeometry(room.w, room.l);
        const atriumMesh = new THREE.Mesh(atriumGeo, this.materials.blackFloor);
        atriumMesh.rotation.x = -Math.PI / 2;
        atriumMesh.position.set(room.x, 0.015, room.z);
        atriumMesh.receiveShadow = true;
        this.proceduralGroup.add(atriumMesh);
      }
    });

    // 2. Continuous Base Ceiling
    const baseCeilingGeo = new THREE.PlaneGeometry(totalW, totalL);
    const baseCeilingMesh = new THREE.Mesh(baseCeilingGeo, this.materials.ceiling);
    baseCeilingMesh.rotation.x = Math.PI / 2;
    baseCeilingMesh.position.set(midX, h, midZ);
    this.proceduralGroup.add(baseCeilingMesh);

    // 3. Build Walls with Doorway Openings
    this.buildWalls(h);

    // 4. Add Lockers along corridors
    this.addProps();

    // 5. Build Accessible Elevator inside West Wing
    if (this.data.elevator) {
      this.elevator = new Elevator(this.scene, this.data.elevator);
      const elevColliders = this.elevator.getColliders();
      elevColliders.forEach((box) => this.colliders.push(box));
    }

    // 6. Build Seminar Hall Security Gate (Locked until 20 kills)
    this.buildSeminarGate(h);
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
    this.proceduralGroup.add(mesh);
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
    this.proceduralGroup.add(mesh);
    this.addColliderBox(x, 1.1, z, 0.5, 2.2, length);
  }

  buildSeminarGate(h) {
    const doorH = 2.6;
    // Security laser field barrier blocking the seminar hall doorway (x: 2, z: 0)
    const gateGeo = new THREE.BoxGeometry(0.3, doorH, 3.8);
    const gateMat = new THREE.MeshStandardMaterial({
      color: 0xff2222,
      emissive: 0xaa1111,
      roughness: 0.3,
      metalness: 0.8,
      transparent: true,
      opacity: 0.85
    });
    const gateMesh = new THREE.Mesh(gateGeo, gateMat);
    gateMesh.position.set(2, doorH / 2, 0);
    this.scene.add(gateMesh);

    const gateCollider = new THREE.Box3();
    const half = new THREE.Vector3(0.15, doorH / 2, 1.9);
    const center = new THREE.Vector3(2, doorH / 2, 0);
    gateCollider.min.subVectors(center, half);
    gateCollider.max.addVectors(center, half);
    this.colliders.push(gateCollider);

    this.seminarGate = {
      mesh: gateMesh,
      collider: gateCollider,
      isUnlocked: false,
      requiresKills: 20,
      x: 2,
      z: 0
    };
  }

  unlockSeminarGate() {
    if (!this.seminarGate || this.seminarGate.isUnlocked) return;
    this.seminarGate.isUnlocked = true;
    if (this.seminarGate.mesh) {
      this.seminarGate.mesh.visible = false;
    }
    const idx = this.colliders.indexOf(this.seminarGate.collider);
    if (idx !== -1) {
      this.colliders.splice(idx, 1);
    }
  }

  resetSeminarGate() {
    if (!this.seminarGate) return;
    this.seminarGate.isUnlocked = false;
    if (this.seminarGate.mesh) {
      this.seminarGate.mesh.visible = true;
    }
    if (!this.colliders.includes(this.seminarGate.collider)) {
      this.colliders.push(this.seminarGate.collider);
    }
  }

  /**
   * Enhanced High-Visibility Lighting Setup across the entire campus map
   * Includes ambient, hemisphere bounce, dual directional suns, and 12 fluorescent ceiling point lights
   */
  buildEnhancedLights() {
    // 1. Bright Ambient & Hemisphere Fill
    const ambient = new THREE.AmbientLight(0xffffff, 1.25);
    this.scene.add(ambient);
    this.lights.push(ambient);

    const hemi = new THREE.HemisphereLight(0xfffaed, 0x555566, 1.05);
    this.scene.add(hemi);
    this.lights.push(hemi);

    // 2. High-Altitude Sun Light (casts shadows)
    const sun = new THREE.DirectionalLight(0xfff5e0, 1.6);
    sun.position.set(15, 32, 20);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 2048;
    sun.shadow.mapSize.height = 2048;
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 100;
    const d = 36;
    sun.shadow.camera.left = -d;
    sun.shadow.camera.right = d;
    sun.shadow.camera.top = d;
    sun.shadow.camera.bottom = -d;
    this.scene.add(sun);
    this.lights.push(sun);

    // 3. Counter-directional Fill Skylight
    const fillSun = new THREE.DirectionalLight(0xe8f0ff, 1.0);
    fillSun.position.set(-20, 28, -25);
    this.scene.add(fillSun);
    this.lights.push(fillSun);

    // 4. Campus Fluorescent Tube Luminaires Grid (12 bright point lights with glowing fixtures)
    const lightPositions = [
      { x: 0, y: 3.8, z: 15, color: 0xfff5e6, intensity: 2.2, range: 26 },     // South Spawn Hall
      { x: 0, y: 3.8, z: 0, color: 0xfff8ee, intensity: 2.4, range: 30 },      // Central Atrium
      { x: -18, y: 3.8, z: 0, color: 0xfff5e6, intensity: 2.0, range: 24 },    // West Corridor
      { x: 18, y: 3.8, z: 0, color: 0xfff5e6, intensity: 2.0, range: 24 },     // East Corridor
      { x: -12, y: 3.8, z: -23, color: 0xffeedd, intensity: 2.2, range: 22 },  // Grand Doorway Arch
      { x: -10, y: 3.8, z: -32, color: 0xfff5e6, intensity: 2.4, range: 28 },  // North Wing (Physics Lab)
      { x: 26, y: 3.8, z: -28, color: 0xffea77, intensity: 2.4, range: 24 },   // North Stairs (Golden illumination)
      { x: -24, y: 3.8, z: -3, color: 0xe6f2ff, intensity: 2.0, range: 20 },   // West Wing Elevator
      { x: 24, y: 3.8, z: 14, color: 0xfff5e6, intensity: 2.0, range: 22 },    // South-East Library
      { x: -24, y: 3.8, z: 14, color: 0xfff5e6, intensity: 2.0, range: 22 },   // South-West Room
      { x: -24, y: 3.8, z: -32, color: 0xffeedd, intensity: 2.0, range: 22 },  // North-West Corner
      { x: 0, y: 3.8, z: -32, color: 0xfff5e6, intensity: 2.0, range: 22 },    // North-East Hall
    ];

    lightPositions.forEach((lp) => {
      const fixtureGeo = new THREE.BoxGeometry(0.5, 0.1, 2.2);
      const fixtureMesh = new THREE.Mesh(fixtureGeo, this.materials.lightFixture);
      fixtureMesh.position.set(lp.x, lp.y, lp.z);
      this.scene.add(fixtureMesh);

      const pl = new THREE.PointLight(lp.color, lp.intensity, lp.range, 1.2);
      pl.position.set(lp.x, lp.y - 0.2, lp.z);
      this.scene.add(pl);
      this.lights.push(pl);
    });
  }

  /**
   * Loads 3D map.glb model, scales properly, assigns PBR textures, and generates colliders
   */
  loadMapGLB(url = ASSET_PATHS.models.map) {
    const loader = new GLTFLoader();
    loader.load(
      url,
      (gltf) => {
        this.setupMapGLB(gltf);
      },
      undefined,
      (err) => {
        console.warn('[LevelGenerator] Could not load map.glb, using fallback procedural map:', err);
      }
    );
  }

  setupMapGLB(gltf) {
    this.mapModel = gltf.scene;

    const mapGroup = new THREE.Group();
    mapGroup.name = 'MapGLB_Root';
    mapGroup.add(this.mapModel);

    // Calibration:
    // Model in Blender was created with width 65.3m (X: -32.65 to 32.65) and depth 47.9m (Z: -23.94 to 23.94).
    // The vertical heights in Blender were extruded ~22m.
    // By scaling Y by 0.175, walls become 3.8m tall, doorway lintel bottom is 2.32m (walk-through),
    // each stair step is 0.35m, and floor top is exactly at Y = 0.0m!
    const sy = 0.175;
    mapGroup.scale.set(1.0, sy, 1.0);
    mapGroup.position.set(0, -0.56168 * sy, 0);
    mapGroup.updateMatrixWorld(true);

    // Apply textures and shadow properties to loaded meshes
    this.mapModel.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;

        const name = child.name.toLowerCase();
        if (name.includes('cube006') || name.includes('cube007') || name.includes('cube008') || name.includes('cube009')) {
          // Stairs
          child.material = new THREE.MeshStandardMaterial({
            map: loadTexture(ASSET_PATHS.textures.floor, 2, 1, '#999988', '#666655'),
            roughness: 0.5,
            metalness: 0.1,
          });
        } else if (name === 'cube' || name.includes('cube004')) {
          // Floors
          child.material = new THREE.MeshStandardMaterial({
            map: loadTexture(ASSET_PATHS.textures.floor, 16, 12, '#888877', '#666655'),
            roughness: 0.7,
            metalness: 0.1,
          });
        } else if (name.includes('cube001') || name.includes('cube003') || name.includes('cube005') || name.includes('cube010') || name.includes('cube011') || name.includes('cube012')) {
          // Walls
          child.material = new THREE.MeshStandardMaterial({
            map: loadTexture(ASSET_PATHS.textures.wall, 6, 2, '#cfcbbf', '#aba89e'),
            roughness: 0.7,
            metalness: 0.05,
          });
        } else {
          if (child.material) {
            child.material.roughness = 0.6;
            child.material.metalness = 0.1;
            child.material.needsUpdate = true;
          }
        }
      }
    });

    this.scene.add(mapGroup);
    this.isMapLoaded = true;

    // Switch colliders to map.glb geometry
    this.colliders = [];

    // Register wall and obstacle colliders from map.glb meshes
    this.mapModel.traverse((child) => {
      if (child.isMesh) {
        const name = child.name.toLowerCase();
        // Skip floor meshes so player walks on them
        if (name === 'cube' || name.includes('cube004')) {
          return;
        }
        const box = new THREE.Box3().setFromObject(child);
        this.colliders.push(box);
      }
    });

    // Add perimeter boundary collision barriers around the floor plate (-32.7 to 32.7 in X, -23.9 to 23.9 in Z)
    this.addColliderBox(0, 2.0, 24.2, 66.0, 4.0, 1.0);  // South
    this.addColliderBox(33.0, 2.0, 0, 1.0, 4.0, 49.0);   // East
    this.addColliderBox(-33.0, 2.0, 0, 1.0, 4.0, 49.0);  // West

    // Retain elevator colliders
    if (this.elevator) {
      const elevColliders = this.elevator.getColliders();
      elevColliders.forEach((box) => this.colliders.push(box));
    }

    // Retain seminar gate collider
    if (this.seminarGate && !this.seminarGate.isUnlocked) {
      this.colliders.push(this.seminarGate.collider);
    }

    // Hide procedural walls since map.glb is active
    if (this.proceduralGroup) {
      this.proceduralGroup.visible = false;
    }
  }

  /**
   * Returns exact walking floor surface height at given (x, z) position
   * Allows player to naturally walk onto steps of the north stairs
   */
  getFloorHeightAt(position) {
    if (position.x >= 19.0 && position.x <= 33.0) {
      if (position.z <= -23.8 && position.z >= -26.2) {
        return 0.00;
      } else if (position.z <= -25.7 && position.z >= -28.1) {
        return 0.34;
      } else if (position.z <= -28.0 && position.z >= -30.5) {
        return 0.65;
      } else if (position.z <= -30.2 && position.z >= -32.8) {
        return 0.98;
      }
    }
    return 0.0;
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
    this.proceduralGroup.add(mesh);

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
        // Step-up support for stair steps: if barrier is low enough, allow stepping up
        const stepRise = wallBox.max.y - playerFeet;
        if (stepRise > 0 && stepRise <= 0.42) {
          position.y = Math.max(position.y, wallBox.max.y + 1.65);
          continue;
        }

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
