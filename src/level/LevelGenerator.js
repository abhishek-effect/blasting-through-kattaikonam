/**
 * LevelGenerator Module
 * Loads mappu.obj and mappu.mtl as the primary 3D level geometry based on ground-floor-newer-plan.
 * Features:
 * - Direct integration of mappu.obj and mappu.mtl with double-sided PBR light pink (#fae6e7) walls.
 * - Aligned 1:1 scale: 100m x 100m campus footprint, 5m ceiling height.
 * - 54 deterministic wall colliders matching all rooms and doorway openings.
 * - Two cylindrical pillars matching blueprint circles.
 * - Functional interactable doors on every room with door-texture.jpg.
 * - Robust axis-separated AABB collision resolution (zero wall/ceiling clipping).
 * - Comprehensive campus illumination rig across all wings and rooms.
 * - Interactive Elevator and Seminar Hall security gate (requires 20 kills).
 */
import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { ASSET_PATHS, loadTexture } from '../config/assets.js';
import { Elevator } from '../interactive/Elevator.js';
import { Door } from '../interactive/Door.js';

export const MAPPU_WALLS = [
  // Outer Boundaries (100m x 100m)
  { id: 'b_north', minX: 0, maxX: 100, minZ: 0, maxZ: 0 },
  { id: 'b_south', minX: 0, maxX: 100, minZ: 100, maxZ: 100 },
  { id: 'b_east', minX: 100, maxX: 100, minZ: 0, maxZ: 100 },
  { id: 'b_west', minX: 0, maxX: 0, minZ: 0, maxZ: 100 },

  // 1. West Wing (X = 0 to 14)
  // 1a. Infirmary (Z: 16 to 28) - Doorway at Z: 20 to 24
  { id: 'inf_north', minX: 0, maxX: 14, minZ: 16, maxZ: 16 },
  { id: 'inf_south', minX: 0, maxX: 14, minZ: 28, maxZ: 28 },
  { id: 'inf_east_north', minX: 14, maxX: 14, minZ: 16, maxZ: 20 },
  { id: 'inf_east_south', minX: 14, maxX: 14, minZ: 24, maxZ: 28 },

  // 1b. Elevator Lobby (Z: 32 to 46) - Doorway at Z: 37 to 41
  { id: 'elev_north', minX: 0, maxX: 14, minZ: 32, maxZ: 32 },
  { id: 'elev_south', minX: 0, maxX: 14, minZ: 46, maxZ: 46 },
  { id: 'elev_east_north', minX: 14, maxX: 14, minZ: 32, maxZ: 37 },
  { id: 'elev_east_south', minX: 14, maxX: 14, minZ: 41, maxZ: 46 },

  // 1c. Computer Lab (Z: 50 to 64) - Doorway at Z: 55 to 59
  { id: 'comp_north', minX: 0, maxX: 14, minZ: 50, maxZ: 50 },
  { id: 'comp_south', minX: 0, maxX: 14, minZ: 64, maxZ: 64 },
  { id: 'comp_east_north', minX: 14, maxX: 14, minZ: 50, maxZ: 55 },
  { id: 'comp_east_south', minX: 14, maxX: 14, minZ: 59, maxZ: 64 },

  // 1d. Bio Lab (Z: 68 to 82) - Doorway at Z: 73 to 77
  { id: 'bio_north', minX: 0, maxX: 14, minZ: 68, maxZ: 68 },
  { id: 'bio_south', minX: 0, maxX: 14, minZ: 82, maxZ: 82 },
  { id: 'bio_east_north', minX: 14, maxX: 14, minZ: 68, maxZ: 73 },
  { id: 'bio_east_south', minX: 14, maxX: 14, minZ: 77, maxZ: 82 },

  // 1e. Unusable Stairs SW (X: 0 to 20, Z: 86 to 100) - Doorway at Z: 89 to 93
  { id: 'stairs_sw_north', minX: 0, maxX: 20, minZ: 86, maxZ: 86 },
  { id: 'stairs_sw_east_north', minX: 20, maxX: 20, minZ: 86, maxZ: 89 },
  { id: 'stairs_sw_east_south', minX: 20, maxX: 20, minZ: 93, maxZ: 100 },

  // 2. North Wall Rooms (Z: 0 to 14)
  // 2a. Door Locked NW (X: 0 to 14, Z: 0 to 10) - Doorway at X: 4 to 8
  { id: 'nw_lock_east', minX: 14, maxX: 14, minZ: 0, maxZ: 10 },
  { id: 'nw_lock_south_w', minX: 0, maxX: 4, minZ: 10, maxZ: 10 },
  { id: 'nw_lock_south_e', minX: 8, maxX: 14, minZ: 10, maxZ: 10 },

  // 2b. NW Stairs (X: 16 to 32, Z: 0 to 10) - Doorway at X: 22 to 26
  { id: 'nw_stairs_west', minX: 16, maxX: 16, minZ: 0, maxZ: 10 },
  { id: 'nw_stairs_east', minX: 32, maxX: 32, minZ: 0, maxZ: 10 },
  { id: 'nw_stairs_south_w', minX: 16, maxX: 22, minZ: 10, maxZ: 10 },
  { id: 'nw_stairs_south_e', minX: 26, maxX: 32, minZ: 10, maxZ: 10 },

  // 2c. Physics Lab (X: 35 to 62, Z: 0 to 14) - Doorway at X: 46 to 50
  { id: 'phy_west', minX: 35, maxX: 35, minZ: 0, maxZ: 14 },
  { id: 'phy_east', minX: 62, maxX: 62, minZ: 0, maxZ: 14 },
  { id: 'phy_south_w', minX: 35, maxX: 46, minZ: 14, maxZ: 14 },
  { id: 'phy_south_e', minX: 50, maxX: 62, minZ: 14, maxZ: 14 },

  // 2d. Locked Room (X: 65 to 80, Z: 0 to 14) - Doorway at X: 70 to 74
  { id: 'lock_west', minX: 65, maxX: 65, minZ: 0, maxZ: 14 },
  { id: 'lock_east', minX: 80, maxX: 80, minZ: 0, maxZ: 14 },
  { id: 'lock_south_w', minX: 65, maxX: 70, minZ: 14, maxZ: 14 },
  { id: 'lock_south_e', minX: 74, maxX: 80, minZ: 14, maxZ: 14 },

  // 2e. Unlockable Room (X: 83 to 100, Z: 0 to 14) - Doorway at X: 88 to 92
  { id: 'unlock_west', minX: 83, maxX: 83, minZ: 0, maxZ: 14 },
  { id: 'unlock_south_w', minX: 83, maxX: 88, minZ: 14, maxZ: 14 },
  { id: 'unlock_south_e', minX: 92, maxX: 100, minZ: 14, maxZ: 14 },

  // 3. South Wall Rooms (Z: 85 to 100)
  // 3a. Board Room (X: 46 to 64, Z: 85 to 100) - Doorway at X: 53 to 57
  { id: 'board_west', minX: 46, maxX: 46, minZ: 85, maxZ: 100 },
  { id: 'board_east', minX: 64, maxX: 64, minZ: 85, maxZ: 100 },
  { id: 'board_north_w', minX: 46, maxX: 53, minZ: 85, maxZ: 85 },
  { id: 'board_north_e', minX: 57, maxX: 64, minZ: 85, maxZ: 85 },

  // 3b. Library (X: 66 to 100, Z: 83 to 100) - Doorway at X: 78 to 82
  { id: 'lib_west', minX: 66, maxX: 66, minZ: 83, maxZ: 100 },
  { id: 'lib_north_w', minX: 66, maxX: 78, minZ: 83, maxZ: 83 },
  { id: 'lib_north_e', minX: 82, maxX: 100, minZ: 83, maxZ: 83 },

  // 4. Seminar Hall & Stage (X: 55 to 100, Z: 27 to 66) - Security Gate at Z: 43 to 48, X=55
  { id: 'sem_north', minX: 55, maxX: 100, minZ: 27, maxZ: 27 },
  { id: 'sem_south', minX: 55, maxX: 100, minZ: 66, maxZ: 66 },
  { id: 'sem_west_north', minX: 55, maxX: 55, minZ: 27, maxZ: 43 },
  { id: 'sem_west_south', minX: 55, maxX: 55, minZ: 48, maxZ: 66 },
  { id: 'sem_stage_div_north', minX: 83, maxX: 83, minZ: 27, maxZ: 40 },
  { id: 'sem_stage_div_south', minX: 83, maxX: 83, minZ: 53, maxZ: 66 },
];

export class LevelGenerator {
  constructor(scene, levelData, audio = null) {
    this.scene = scene;
    this.data = levelData;
    this.audio = audio;
    this.colliders = []; // List of THREE.Box3 for player/enemy collisions
    this.lights = [];
    this.doors = [];
    this.pillars = [];
    this.furniture = [];
    this.posters = [];
    this.elevator = null;
    this.seminarGate = null;
    this.mapModel = null;
    this.isMapLoaded = false;

    this.materials = this.initMaterials();
    this.buildMap();
    this.buildCampusLights();
    this.loadMappu();
  }

  initMaterials() {
    return {
      lightFixture: new THREE.MeshBasicMaterial({
        color: 0xffffff,
      }),
      doorFrame: new THREE.MeshStandardMaterial({
        color: 0x3e352f,
        roughness: 0.8,
      }),
      locker: new THREE.MeshStandardMaterial({
        color: 0x4a7a8c,
        roughness: 0.5,
        metalness: 0.4,
      })
    };
  }

  buildMap() {
    const h = this.data.ceilingHeight || 5.0;

    // 1. Build deterministic AABB colliders for all 54 walls
    this.buildWallColliders(h);

    // 2. Build the Two Cylindrical Pillars matching circles on ground-floor-newer-plan
    this.buildPillars(h);

    // 3. Build Functional Interactable Doors on every room with door-texture.jpg
    this.buildDoors();

    // 4. Build Accessible Elevator replacing door at West Wing doorway (x: 14.0, z: 39.0)
    if (this.data.elevator) {
      this.elevator = new Elevator(this.scene, this.data.elevator);
      const elevColliders = this.elevator.getColliders();
      elevColliders.forEach((box) => this.colliders.push(box));
    }

    // 5. Build Seminar Hall Security Gate (x: 55, z: 45.5, width: 5.0m, locked until 20 kills)
    this.buildSeminarGate(h);

    // 6. Build 3D Collide-able Tables and Chairs in CS, Bio, and Physics Labs
    this.buildFurniture();

    // 7. Mount Educational Posters on Lab Walls
    this.buildPosters();
  }

  buildWallColliders(h = 5.0) {
    const wallThick = 0.4;
    const halfThick = wallThick / 2;

    MAPPU_WALLS.forEach((w) => {
      const box = new THREE.Box3();
      if (Math.abs(w.minZ - w.maxZ) < 0.01) {
        // Wall runs along X axis
        const minX = Math.min(w.minX, w.maxX);
        const maxX = Math.max(w.minX, w.maxX);
        const z = w.minZ;
        box.min.set(minX, 0, z - halfThick);
        box.max.set(maxX, h, z + halfThick);
      } else if (Math.abs(w.minX - w.maxX) < 0.01) {
        // Wall runs along Z axis
        const minZ = Math.min(w.minZ, w.maxZ);
        const maxZ = Math.max(w.minZ, w.maxZ);
        const x = w.minX;
        box.min.set(x - halfThick, 0, minZ);
        box.max.set(x + halfThick, h, maxZ);
      } else {
        box.min.set(Math.min(w.minX, w.maxX), 0, Math.min(w.minZ, w.maxZ));
        box.max.set(Math.max(w.minX, w.maxX), h, Math.max(w.minZ, w.maxZ));
      }
      this.colliders.push(box);
    });
  }

  /**
   * Builds the two prominent cylindrical pillars to the left of black tiles
   */
  buildPillars(h = 5.0) {
    const pillarRadius = 0.85;
    const pillarGeo = new THREE.CylinderGeometry(pillarRadius, pillarRadius, h, 32);
    const pillarMat = new THREE.MeshStandardMaterial({
      color: 0xfae6e7, // Light pink matching campus walls
      roughness: 0.65,
      metalness: 0.1,
    });

    const pillarCoords = [
      { id: 'pillar_north', x: 19.5, z: 31.0 },
      { id: 'pillar_south', x: 19.5, z: 68.0 },
    ];

    pillarCoords.forEach((p) => {
      const mesh = new THREE.Mesh(pillarGeo, pillarMat);
      mesh.position.set(p.x, h / 2, p.z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      this.pillars.push(mesh);

      // Robust cylinder AABB collider
      const box = new THREE.Box3();
      box.min.set(p.x - pillarRadius, 0, p.z - pillarRadius);
      box.max.set(p.x + pillarRadius, h, p.z + pillarRadius);
      this.colliders.push(box);
    });
  }

  /**
   * Builds functional interactable doors for every room
   */
  buildDoors() {
    this.doors = [];
    const doorConfigs = [
      // West Wing Doors
      { id: 'door_infirmary', name: 'INFIRMARY', x: 14, z: 22, width: 4.0, height: 3.5, dir: 'z', swingDir: 1 },
      // Elevator directly replaces the door at x: 14, z: 39 (no redundant door)
      { id: 'door_computer_lab', name: 'COMPUTER LAB', x: 14, z: 57, width: 4.0, height: 3.5, dir: 'z', swingDir: 1 },
      { id: 'door_bio_lab', name: 'BIO LAB', x: 14, z: 75, width: 4.0, height: 3.5, dir: 'z', swingDir: 1 },
      { id: 'door_stairs_sw', name: 'STAIRS', x: 20, z: 91, width: 4.0, height: 3.5, dir: 'z', swingDir: -1 },

      // North Wall Doors
      { id: 'door_nw_lock', name: 'DOOR LOCKED', x: 6, z: 10, width: 4.0, height: 3.5, dir: 'x', swingDir: -1, isLocked: true },
      { id: 'door_nw_stairs', name: 'STAIRS', x: 24, z: 10, width: 4.0, height: 3.5, dir: 'x', swingDir: -1 },
      { id: 'door_phy_lab', name: 'PHY LAB', x: 48, z: 14, width: 4.0, height: 3.5, dir: 'x', swingDir: -1 },
      { id: 'door_locked_room', name: 'LOCKED ROOM', x: 72, z: 14, width: 4.0, height: 3.5, dir: 'x', swingDir: -1, isLocked: true },
      { id: 'door_unlockable_room', name: 'UNLOCKABLE ROOM', x: 90, z: 14, width: 4.0, height: 3.5, dir: 'x', swingDir: -1 },

      // South Wall Doors
      { id: 'door_board_room', name: 'BOARD ROOM', x: 55, z: 85, width: 4.0, height: 3.5, dir: 'x', swingDir: 1 },
      { id: 'door_library', name: 'LIBRARY', x: 80, z: 83, width: 4.0, height: 3.5, dir: 'x', swingDir: 1 },
    ];

    doorConfigs.forEach((cfg) => {
      const door = new Door(this.scene, this.colliders, this.audio, cfg);
      this.doors.push(door);
    });
  }

  update(deltaTime, playerPosition) {
    if (this.doors) {
      for (let i = 0; i < this.doors.length; i++) {
        this.doors[i].update(deltaTime, playerPosition);
      }
    }
  }

  /**
   * Loads mappu.mtl and mappu.obj
   */
  loadMappu() {
    const mtlUrl = ASSET_PATHS.models.mtl || './images/mappu.mtl';
    const objUrl = ASSET_PATHS.models.obj || './images/mappu.obj';

    const mtlLoader = new MTLLoader();
    mtlLoader.load(
      mtlUrl,
      (materials) => {
        materials.preload();
        const objLoader = new OBJLoader();
        objLoader.setMaterials(materials);
        objLoader.load(
          objUrl,
          (obj) => {
            this.setupMappuModel(obj);
          },
          undefined,
          (err) => {
            console.warn('[LevelGenerator] Error loading mappu.obj with materials:', err);
            this.loadStandaloneOBJ(objUrl);
          }
        );
      },
      undefined,
      (err) => {
        console.warn('[LevelGenerator] Error loading mappu.mtl:', err);
        this.loadStandaloneOBJ(objUrl);
      }
    );
  }

  loadStandaloneOBJ(objUrl) {
    const objLoader = new OBJLoader();
    objLoader.load(
      objUrl,
      (obj) => {
        this.setupMappuModel(obj);
      },
      undefined,
      (err) => {
        console.error('[LevelGenerator] Critical: failed to load mappu.obj:', err);
      }
    );
  }

  setupMappuModel(obj) {
    this.mapModel = obj;
    obj.name = 'MappuModel';

    // Model coordinates: 100m x 100m footprint, 5m height
    obj.scale.set(1.0, 1.0, 1.0);
    obj.position.set(0, 0, 0);

    // Apply double-sided rendering, shadows, and light pink (#fae6e7) wall coloring
    obj.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;

        const formatMaterial = (mat) => {
          mat.side = THREE.DoubleSide;
          mat.roughness = 0.7;
          mat.metalness = 0.05;
          // Apply light pink color #fae6e7 to all walls
          if (
            mat.name === 'boundary_wall' ||
            (!mat.name.includes('black') && !mat.name.includes('white') && !mat.name.includes('ceiling'))
          ) {
            mat.color.setHex(0xfae6e7);
          }
        };

        if (Array.isArray(child.material)) {
          child.material.forEach(formatMaterial);
        } else if (child.material) {
          formatMaterial(child.material);
        }
      }
    });

    this.scene.add(obj);
    this.isMapLoaded = true;
  }

  /**
   * Campus Lighting Rig across all wings and rooms
   */
  buildCampusLights() {
    // 1. Ambient & Sky Fill
    const ambient = new THREE.AmbientLight(0xffffff, 1.25);
    this.scene.add(ambient);
    this.lights.push(ambient);

    const hemi = new THREE.HemisphereLight(0xfffaed, 0x555566, 1.05);
    this.scene.add(hemi);
    this.lights.push(hemi);

    // 2. High-Altitude Sun Light (casts shadows)
    const sun = new THREE.DirectionalLight(0xfff5e0, 1.6);
    sun.position.set(50, 45, 50);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 2048;
    sun.shadow.mapSize.height = 2048;
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 120;
    const d = 55;
    sun.shadow.camera.left = -d;
    sun.shadow.camera.right = d;
    sun.shadow.camera.top = d;
    sun.shadow.camera.bottom = -d;
    this.scene.add(sun);
    this.lights.push(sun);

    // 3. Counter-directional Fill Sun
    const fillSun = new THREE.DirectionalLight(0xe8f0ff, 1.0);
    fillSun.position.set(-20, 30, -20);
    this.scene.add(fillSun);
    this.lights.push(fillSun);

    // 4. Campus Fluorescent Tube Luminaires Grid (17 bright fixtures at Y = 4.7)
    const lightPositions = [
      { x: 34.0, y: 4.7, z: 92.5, color: 0xfff5e6, intensity: 2.5, range: 28 }, // South Spawn Hall
      { x: 55.0, y: 4.7, z: 92.5, color: 0xfff5e6, intensity: 2.2, range: 26 }, // Board Room
      { x: 82.0, y: 4.7, z: 91.5, color: 0xfff5e6, intensity: 2.5, range: 28 }, // Library
      { x: 10.0, y: 4.7, z: 93.0, color: 0xffe0cc, intensity: 2.0, range: 24 }, // South Unusable Stairs
      { x: 45.0, y: 4.7, z: 75.0, color: 0xfff5e6, intensity: 2.2, range: 26 }, // South Corridor Junction
      { x: 31.0, y: 4.7, z: 58.0, color: 0xfff8ee, intensity: 2.5, range: 30 }, // Central Hall (South)
      { x: 31.0, y: 4.7, z: 38.0, color: 0xfff8ee, intensity: 2.5, range: 30 }, // Central Hall (North)
      { x: 7.0,  y: 4.7, z: 22.0, color: 0xe6f2ff, intensity: 2.2, range: 22 }, // Infirmary
      { x: 7.0,  y: 4.7, z: 39.0, color: 0xffeedd, intensity: 2.2, range: 22 }, // Elevator Room
      { x: 7.0,  y: 4.7, z: 57.0, color: 0xfff5e6, intensity: 2.2, range: 22 }, // Computer Lab
      { x: 7.0,  y: 4.7, z: 75.0, color: 0xe6fff0, intensity: 2.2, range: 22 }, // Bio Lab
      { x: 20.0, y: 4.7, z: 5.0,  color: 0xffeedd, intensity: 2.2, range: 24 }, // NW Storage / Stairs
      { x: 48.5, y: 4.7, z: 7.0,  color: 0xffeedd, intensity: 2.5, range: 28 }, // Physics Lab
      { x: 72.5, y: 4.7, z: 7.0,  color: 0xffe0cc, intensity: 2.2, range: 24 }, // Locked Archives
      { x: 91.5, y: 4.7, z: 7.0,  color: 0xfff0e6, intensity: 2.2, range: 24 }, // Unlockable Room
      { x: 70.0, y: 4.7, z: 46.5, color: 0xfff5e6, intensity: 3.0, range: 36 }, // Seminar Hall Auditorium
      { x: 91.0, y: 4.7, z: 46.5, color: 0xffea77, intensity: 2.5, range: 26 }, // Seminar Hall Stage
    ];

    lightPositions.forEach((lp) => {
      // 3D ceiling luminaire fixture mesh
      const fixtureGeo = new THREE.BoxGeometry(0.5, 0.1, 2.2);
      const fixtureMesh = new THREE.Mesh(fixtureGeo, this.materials.lightFixture);
      fixtureMesh.position.set(lp.x, lp.y, lp.z);
      this.scene.add(fixtureMesh);

      // Bright point light
      const pl = new THREE.PointLight(lp.color, lp.intensity, lp.range, 1.2);
      pl.position.set(lp.x, lp.y - 0.2, lp.z);
      this.scene.add(pl);
      this.lights.push(pl);
    });
  }

  buildSeminarGate(h = 5.0) {
    const gateGeo = new THREE.BoxGeometry(0.4, h, 5.0);
    const gateMat = new THREE.MeshStandardMaterial({
      color: 0xff2222,
      emissive: 0xaa1111,
      roughness: 0.3,
      metalness: 0.8,
      transparent: true,
      opacity: 0.85,
    });
    const gateMesh = new THREE.Mesh(gateGeo, gateMat);
    gateMesh.position.set(55, h / 2, 45.5);
    this.scene.add(gateMesh);

    const gateCollider = new THREE.Box3();
    const half = new THREE.Vector3(0.2, h / 2, 2.5);
    const center = new THREE.Vector3(55, h / 2, 45.5);
    gateCollider.min.subVectors(center, half);
    gateCollider.max.addVectors(center, half);
    this.colliders.push(gateCollider);

    this.seminarGate = {
      mesh: gateMesh,
      collider: gateCollider,
      isUnlocked: false,
      requiresKills: 20,
      x: 55,
      z: 45.5,
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
   * Builds 3D collide-able tables and chairs for CS, Bio, and Physics labs.
   * Scaled realistically (human-scale, not too big) with accurate AABB colliders.
   */
  buildFurniture() {
    this.furniture = [];

    // Shared chair materials
    const chairTex = loadTexture(ASSET_PATHS.textures.chairs, 1, 1, '#b2bec3', '#636e72');
    chairTex.wrapS = THREE.ClampToEdgeWrapping;
    chairTex.wrapT = THREE.ClampToEdgeWrapping;

    const chairCushionMat = new THREE.MeshStandardMaterial({
      map: chairTex,
      roughness: 0.65,
      metalness: 0.1,
    });

    const chairFrameMat = new THREE.MeshStandardMaterial({
      color: 0x2d3436,
      roughness: 0.45,
      metalness: 0.65,
    });

    // Room-specific tabletop materials
    const csTableMat = new THREE.MeshStandardMaterial({
      color: 0x2f3542, // Sleek dark workstation top
      roughness: 0.35,
      metalness: 0.15,
    });

    const bioTableMat = new THREE.MeshStandardMaterial({
      color: 0xf1f2f6, // Clean white laboratory laminate
      roughness: 0.3,
      metalness: 0.05,
    });

    const phyTableMat = new THREE.MeshStandardMaterial({
      color: 0x6d4c41, // Solid hardwood lab bench
      roughness: 0.55,
      metalness: 0.1,
    });

    const tableFrameMat = new THREE.MeshStandardMaterial({
      color: 0x222f3e,
      roughness: 0.4,
      metalness: 0.7,
    });

    // Helper: Create a 3D Lab Table Group
    const createTableMesh = (tableMat) => {
      const group = new THREE.Group();
      // Tabletop: 1.4m wide x 0.06m thick x 0.8m deep at y: 0.79m
      const topGeo = new THREE.BoxGeometry(1.4, 0.06, 0.8);
      const topMesh = new THREE.Mesh(topGeo, tableMat);
      topMesh.position.set(0, 0.79, 0);
      topMesh.castShadow = true;
      topMesh.receiveShadow = true;
      group.add(topMesh);

      // Support apron frame
      const apronGeo = new THREE.BoxGeometry(1.28, 0.04, 0.68);
      const apronMesh = new THREE.Mesh(apronGeo, tableFrameMat);
      apronMesh.position.set(0, 0.74, 0);
      apronMesh.castShadow = true;
      group.add(apronMesh);

      // 4 Legs
      const legGeo = new THREE.BoxGeometry(0.06, 0.76, 0.06);
      const legOffsets = [
        [-0.61, -0.31],
        [0.61, -0.31],
        [-0.61, 0.31],
        [0.61, 0.31],
      ];
      legOffsets.forEach(([ox, oz]) => {
        const leg = new THREE.Mesh(legGeo, tableFrameMat);
        leg.position.set(ox, 0.38, oz);
        leg.castShadow = true;
        leg.receiveShadow = true;
        group.add(leg);
      });

      return group;
    };

    // Helper: Create a 3D Lab Chair Group
    const createChairMesh = () => {
      const group = new THREE.Group();
      // Seat cushion: 0.46m x 0.05m x 0.46m at y: 0.45m
      const seatGeo = new THREE.BoxGeometry(0.46, 0.05, 0.46);
      const seatMesh = new THREE.Mesh(seatGeo, chairCushionMat);
      seatMesh.position.set(0, 0.45, 0);
      seatMesh.castShadow = true;
      seatMesh.receiveShadow = true;
      group.add(seatMesh);

      // Backrest: 0.44m x 0.32m x 0.04m at y: 0.68m, z: -0.20m
      const backGeo = new THREE.BoxGeometry(0.44, 0.32, 0.04);
      const backMesh = new THREE.Mesh(backGeo, chairCushionMat);
      backMesh.position.set(0, 0.68, -0.20);
      backMesh.castShadow = true;
      backMesh.receiveShadow = true;
      group.add(backMesh);

      // 2 Vertical Backrest Struts
      const strutGeo = new THREE.BoxGeometry(0.03, 0.24, 0.03);
      [-0.16, 0.16].forEach((sx) => {
        const strut = new THREE.Mesh(strutGeo, chairFrameMat);
        strut.position.set(sx, 0.54, -0.20);
        group.add(strut);
      });

      // 4 Chair Legs
      const chairLegGeo = new THREE.BoxGeometry(0.04, 0.42, 0.04);
      const chairLegOffsets = [
        [-0.18, -0.18],
        [0.18, -0.18],
        [-0.18, 0.18],
        [0.18, 0.18],
      ];
      chairLegOffsets.forEach(([cx, cz]) => {
        const cl = new THREE.Mesh(chairLegGeo, chairFrameMat);
        cl.position.set(cx, 0.21, cz);
        cl.castShadow = true;
        cl.receiveShadow = true;
        group.add(cl);
      });

      return group;
    };

    // Placements: 4 tables and 4 chairs in each lab (CS, Bio, Phy)
    const furnitureSets = [
      // 1. Computer Lab (X: 0..14, Z: 50..64) - doorways clear at Z: 55..59
      { type: 'table', mat: csTableMat, x: 4.5, z: 53.0, rotY: 0 },
      { type: 'chair', x: 4.5, z: 53.8, rotY: 0 },
      { type: 'table', mat: csTableMat, x: 9.5, z: 53.0, rotY: 0 },
      { type: 'chair', x: 9.5, z: 53.8, rotY: 0 },
      { type: 'table', mat: csTableMat, x: 4.5, z: 61.0, rotY: 0 },
      { type: 'chair', x: 4.5, z: 60.2, rotY: Math.PI },
      { type: 'table', mat: csTableMat, x: 9.5, z: 61.0, rotY: 0 },
      { type: 'chair', x: 9.5, z: 60.2, rotY: Math.PI },

      // 2. Bio Lab (X: 0..14, Z: 68..82) - doorways clear at Z: 73..77
      { type: 'table', mat: bioTableMat, x: 4.5, z: 71.0, rotY: 0 },
      { type: 'chair', x: 4.5, z: 71.8, rotY: 0 },
      { type: 'table', mat: bioTableMat, x: 9.5, z: 71.0, rotY: 0 },
      { type: 'chair', x: 9.5, z: 71.8, rotY: 0 },
      { type: 'table', mat: bioTableMat, x: 4.5, z: 79.0, rotY: 0 },
      { type: 'chair', x: 4.5, z: 78.2, rotY: Math.PI },
      { type: 'table', mat: bioTableMat, x: 9.5, z: 79.0, rotY: 0 },
      { type: 'chair', x: 9.5, z: 78.2, rotY: Math.PI },

      // 3. Physics Lab (X: 35..62, Z: 0..14) - doorways clear at X: 46..50
      { type: 'table', mat: phyTableMat, x: 41.0, z: 5.0, rotY: 0 },
      { type: 'chair', x: 41.0, z: 5.8, rotY: 0 },
      { type: 'table', mat: phyTableMat, x: 41.0, z: 9.5, rotY: 0 },
      { type: 'chair', x: 41.0, z: 8.7, rotY: Math.PI },
      { type: 'table', mat: phyTableMat, x: 56.0, z: 5.0, rotY: 0 },
      { type: 'chair', x: 56.0, z: 5.8, rotY: 0 },
      { type: 'table', mat: phyTableMat, x: 56.0, z: 9.5, rotY: 0 },
      { type: 'chair', x: 56.0, z: 8.7, rotY: Math.PI },
    ];

    furnitureSets.forEach((item) => {
      let mesh;
      const box = new THREE.Box3();

      if (item.type === 'table') {
        mesh = createTableMesh(item.mat);
        mesh.position.set(item.x, 0, item.z);
        mesh.rotation.y = item.rotY || 0;
        this.scene.add(mesh);
        this.furniture.push(mesh);

        // Precise AABB Collider for table
        box.min.set(item.x - 0.70, 0, item.z - 0.40);
        box.max.set(item.x + 0.70, 0.85, item.z + 0.40);
        this.colliders.push(box);
      } else if (item.type === 'chair') {
        mesh = createChairMesh();
        mesh.position.set(item.x, 0, item.z);
        mesh.rotation.y = item.rotY || 0;
        this.scene.add(mesh);
        this.furniture.push(mesh);

        // Precise AABB Collider for chair
        box.min.set(item.x - 0.24, 0, item.z - 0.24);
        box.max.set(item.x + 0.24, 0.88, item.z + 0.24);
        this.colliders.push(box);
      }
    });
  }

  /**
   * Mounts educational posters in CS, Bio, and Physics labs.
   * Frame and image plane sized properly and placed at eye height.
   */
  buildPosters() {
    this.posters = [];

    const posterConfigs = [
      // 1. CS Lab Poster in Computer Lab (North wall at Z: 50.05, facing South +Z)
      {
        id: 'poster_cs',
        name: 'CS Lab Poster',
        url: ASSET_PATHS.props.csPoster,
        x: 7.0,
        y: 2.3,
        z: 50.05,
        width: 1.8,
        height: 1.01,
        rotY: 0,
      },
      // 2. Python Data Types Poster in Computer Lab (South wall at Z: 63.95, facing North -Z)
      {
        id: 'poster_python',
        name: 'Python Data Types',
        url: ASSET_PATHS.props.pythonDataTypes,
        x: 7.0,
        y: 2.3,
        z: 63.95,
        width: 1.45,
        height: 1.25,
        rotY: Math.PI,
      },
      // 3. Bio Lab Poster in Bio Lab (West wall at X: 0.05, facing East +X)
      {
        id: 'poster_bio',
        name: 'Bio Lab Diagram',
        url: ASSET_PATHS.props.bioLabPoster,
        x: 0.05,
        y: 2.3,
        z: 75.0,
        width: 1.4,
        height: 1.4,
        rotY: Math.PI / 2,
      },
      // 4. Vernier Caliper Poster in Physics Lab (North wall at Z: 0.05, facing South +Z)
      {
        id: 'poster_vernier',
        name: 'Vernier Caliper Poster',
        url: ASSET_PATHS.props.vernierCaliper,
        x: 48.0,
        y: 2.3,
        z: 0.05,
        width: 1.7,
        height: 1.15,
        rotY: 0,
      },
    ];

    const frameMat = new THREE.MeshStandardMaterial({
      color: 0x1e272e,
      roughness: 0.6,
      metalness: 0.4,
    });

    posterConfigs.forEach((cfg) => {
      const group = new THREE.Group();
      group.position.set(cfg.x, cfg.y, cfg.z);
      group.rotation.y = cfg.rotY;

      // Picture frame bezel
      const frameGeo = new THREE.BoxGeometry(cfg.width + 0.06, cfg.height + 0.06, 0.02);
      const frameMesh = new THREE.Mesh(frameGeo, frameMat);
      frameMesh.castShadow = true;
      group.add(frameMesh);

      // Picture plane
      const picGeo = new THREE.PlaneGeometry(cfg.width, cfg.height);
      const picTex = loadTexture(cfg.url, 1, 1, '#ffffff', '#cccccc');
      picTex.wrapS = THREE.ClampToEdgeWrapping;
      picTex.wrapT = THREE.ClampToEdgeWrapping;

      const picMat = new THREE.MeshStandardMaterial({
        map: picTex,
        roughness: 0.4,
        metalness: 0.05,
        side: THREE.FrontSide,
      });

      const picMesh = new THREE.Mesh(picGeo, picMat);
      picMesh.position.set(0, 0, 0.015);
      group.add(picMesh);

      this.scene.add(group);
      this.posters.push(group);
    });
  }

  getFloorHeightAt(position) {
    return 0.0;
  }

  /**
   * Robust Axis-Separated AABB Collision Resolution
   */
  resolveAxisCollision(position, radius, axis) {
    const playerFeet = Math.max(0, position.y - 1.6);
    const playerHead = position.y + 0.2;

    const entityBox = new THREE.Box3();
    entityBox.min.set(position.x - radius, playerFeet, position.z - radius);
    entityBox.max.set(position.x + radius, playerHead, position.z + radius);

    for (let i = 0; i < this.colliders.length; i++) {
      const wallBox = this.colliders[i];

      // Ignore overhead geometry or floor geometry
      if (wallBox.min.y >= playerHead || wallBox.max.y <= playerFeet) {
        continue;
      }

      if (entityBox.intersectsBox(wallBox)) {
        if (axis === 'x') {
          const distToMin = Math.abs(position.x - wallBox.min.x);
          const distToMax = Math.abs(position.x - wallBox.max.x);
          if (distToMin < distToMax) {
            position.x = wallBox.min.x - radius - 0.005;
          } else {
            position.x = wallBox.max.x + radius + 0.005;
          }
        } else if (axis === 'z') {
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

  resolveSphereCollision(position, radius = 0.45) {
    this.resolveAxisCollision(position, radius, 'x');
    this.resolveAxisCollision(position, radius, 'z');
  }
}
