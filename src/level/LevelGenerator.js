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
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ASSET_PATHS, loadTexture, assetUrl } from '../config/assets.js';
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

    // 6. Build 3D Collide-able Tables and Chairs in CS, Bio, Physics Labs, and Library
    this.buildFurniture();

    // 7. Build 3D Props (Bookshelves, Wardrobes, Whiteboard) from models folder
    this.buildPropsFromModels();

    // 8. Mount Educational Posters on Lab Walls
    this.buildPosters();

    // 9. Initialize 2D Spatial Hash Grid for high-performance O(1) collision queries
    this.initSpatialGrid();
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
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
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
      { id: 'door_bio_lab', name: 'BIOLOGY LAB', x: 14, z: 75, width: 4.0, height: 3.5, dir: 'z', swingDir: 1 },
      { id: 'door_stairs_sw', name: 'SOUTH STAIRS', x: 20, z: 91, width: 4.0, height: 3.5, dir: 'z', swingDir: -1 },

      // North Wall Doors
      { id: 'door_nw_lock', name: 'DOOR LOCKED', x: 6, z: 10, width: 4.0, height: 3.5, dir: 'x', swingDir: -1, isLocked: true },
      { id: 'door_nw_stairs', name: 'NORTH STAIRS', x: 24, z: 10, width: 4.0, height: 3.5, dir: 'x', swingDir: -1 },
      { id: 'door_phy_lab', name: 'PHYSICS LAB', x: 48, z: 14, width: 4.0, height: 3.5, dir: 'x', swingDir: -1 },
      { id: 'door_locked_room', name: 'FACULTY ARCHIVES', x: 72, z: 14, width: 4.0, height: 3.5, dir: 'x', swingDir: -1, isLocked: true },
      { id: 'door_unlockable_room', name: 'UNLOCKABLE ROOM', x: 90, z: 14, width: 4.0, height: 3.5, dir: 'x', swingDir: -1 },

      // South Wall Doors
      { id: 'door_board_room', name: 'BOARD ROOM', x: 55, z: 85, width: 4.0, height: 3.5, dir: 'x', swingDir: 1 },
      { id: 'door_library', name: 'CAMPUS LIBRARY', x: 80, z: 83, width: 4.0, height: 3.5, dir: 'x', swingDir: 1 },
    ];

    doorConfigs.forEach((cfg) => {
      const door = new Door(this.scene, this.colliders, this.audio, cfg);
      door.onCollidersChanged = () => this.rebuildSpatialGrid();
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
        child.matrixAutoUpdate = false;
        child.updateMatrix();

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

    // 2. High-Altitude Sun Light
    const sun = new THREE.DirectionalLight(0xfff5e0, 1.6);
    sun.position.set(50, 45, 50);
    sun.castShadow = false;
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
      fixtureMesh.matrixAutoUpdate = false;
      fixtureMesh.updateMatrix();
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
    this.rebuildSpatialGrid();
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
    this.rebuildSpatialGrid();
  }

  /**
   * Builds 3D collide-able tables and chairs for CS, Bio, and Physics labs.
   * Scaled realistically (human-scale, not too big) with accurate AABB colliders.
   */
  buildFurniture() {
    this.furniture = [];

    // Pure white chair materials
    const chairCushionMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.35,
      metalness: 0.05,
    });

    const chairFrameMat = new THREE.MeshStandardMaterial({
      color: 0xdedede,
      roughness: 0.3,
      metalness: 0.6,
    });

    // Room-specific tabletop materials
    const csTableMat = new THREE.MeshStandardMaterial({
      color: 0x2f3542,
      roughness: 0.35,
      metalness: 0.15,
    });

    const bioTableMat = new THREE.MeshStandardMaterial({
      color: 0xf1f2f6,
      roughness: 0.3,
      metalness: 0.05,
    });

    const phyTableMat = new THREE.MeshStandardMaterial({
      color: 0x6d4c41,
      roughness: 0.55,
      metalness: 0.1,
    });

    const libTableMat = new THREE.MeshStandardMaterial({
      color: 0xf8f9fa, // Clean study desk tops matching reference ("black outline white fill")
      roughness: 0.25,
      metalness: 0.05,
    });

    const tableFrameMat = new THREE.MeshStandardMaterial({
      color: 0x222f3e,
      roughness: 0.4,
      metalness: 0.7,
    });

    // Merged Table Frame Geometry (apron + 4 legs)
    const apronGeo = new THREE.BoxGeometry(1.28, 0.04, 0.68).translate(0, 0.74, 0);
    const legGeos = [
      [-0.61, -0.31],
      [0.61, -0.31],
      [-0.61, 0.31],
      [0.61, 0.31],
    ].map(([ox, oz]) => new THREE.BoxGeometry(0.06, 0.76, 0.06).translate(ox, 0.38, oz));
    const tableFrameGeo = mergeGeometries([apronGeo, ...legGeos]);
    const tableTopGeo = new THREE.BoxGeometry(1.4, 0.06, 0.8).translate(0, 0.79, 0);

    // Merged Chair Geometry (cushions + frame)
    const seatGeo = new THREE.BoxGeometry(0.46, 0.05, 0.46).translate(0, 0.45, 0);
    const backGeo = new THREE.BoxGeometry(0.44, 0.32, 0.04).translate(0, 0.68, -0.20);
    const chairCushionGeo = mergeGeometries([seatGeo, backGeo]);
    chairCushionGeo.rotateY(Math.PI);

    const strutGeos = [-0.16, 0.16].map((sx) => new THREE.BoxGeometry(0.03, 0.24, 0.03).translate(sx, 0.54, -0.20));
    const chairLegGeos = [
      [-0.18, -0.18],
      [0.18, -0.18],
      [-0.18, 0.18],
      [0.18, 0.18],
    ].map(([cx, cz]) => new THREE.BoxGeometry(0.04, 0.42, 0.04).translate(cx, 0.21, cz));
    const chairFrameGeo = mergeGeometries([...strutGeos, ...chairLegGeos]);
    chairFrameGeo.rotateY(Math.PI);

    const tableFrameInstanced = new THREE.InstancedMesh(tableFrameGeo, tableFrameMat, 30);
    const csTableTopInstanced = new THREE.InstancedMesh(tableTopGeo, csTableMat, 6);
    const bioTableTopInstanced = new THREE.InstancedMesh(tableTopGeo, bioTableMat, 6);
    const phyTableTopInstanced = new THREE.InstancedMesh(tableTopGeo, phyTableMat, 10);
    const libTableTopInstanced = new THREE.InstancedMesh(tableTopGeo, libTableMat, 10);

    const chairCushionInstanced = new THREE.InstancedMesh(chairCushionGeo, chairCushionMat, 36);
    const chairFrameInstanced = new THREE.InstancedMesh(chairFrameGeo, chairFrameMat, 36);

    const dummy = new THREE.Object3D();
    let chairIdx = 0;
    let csIdx = 0;
    let bioIdx = 0;
    let phyIdx = 0;
    let libIdx = 0;
    let tableFrameIdx = 0;

    const furnitureSets = [
      // 1. Computer Lab (X: 0..14, Z: 50..64)
      { type: 'table', room: 'cs', x: 4.5, z: 53.0, rotY: 0 },
      { type: 'chair', x: 4.5, z: 53.8, rotY: 0 },
      { type: 'table', room: 'cs', x: 9.5, z: 53.0, rotY: 0 },
      { type: 'chair', x: 9.5, z: 53.8, rotY: 0 },
      { type: 'table', room: 'cs', x: 4.5, z: 61.0, rotY: 0 },
      { type: 'chair', x: 4.5, z: 60.2, rotY: Math.PI },
      { type: 'table', room: 'cs', x: 9.5, z: 61.0, rotY: 0 },
      { type: 'chair', x: 9.5, z: 60.2, rotY: Math.PI },

      // 2. Bio Lab (X: 0..14, Z: 68..82)
      { type: 'table', room: 'bio', x: 4.5, z: 71.0, rotY: 0 },
      { type: 'chair', x: 4.5, z: 71.8, rotY: 0 },
      { type: 'table', room: 'bio', x: 9.5, z: 71.0, rotY: 0 },
      { type: 'chair', x: 9.5, z: 71.8, rotY: 0 },
      { type: 'table', room: 'bio', x: 4.5, z: 79.0, rotY: 0 },
      { type: 'chair', x: 4.5, z: 78.2, rotY: Math.PI },
      { type: 'table', room: 'bio', x: 9.5, z: 79.0, rotY: 0 },
      { type: 'chair', x: 9.5, z: 78.2, rotY: Math.PI },

      // 3. Physics Lab (X: 35..62, Z: 0..14) - Calibrated to images/phy-lab-reference.png
      // Teacher's table on middle-left near whiteboard
      { type: 'table', room: 'phy', x: 38.5, z: 7.0, rotY: Math.PI / 2 },
      { type: 'chair', x: 39.25, z: 7.0, rotY: Math.PI / 2 },
      // Upper-left vertical table
      { type: 'table', room: 'phy', x: 43.0, z: 4.5, rotY: Math.PI / 2 },
      { type: 'chair', x: 42.25, z: 4.5, rotY: -Math.PI / 2 },
      // Upper-center horizontal table
      { type: 'table', room: 'phy', x: 50.0, z: 3.5, rotY: 0 },
      { type: 'chair', x: 50.0, z: 4.25, rotY: 0 },
      // Upper-right vertical table
      { type: 'table', room: 'phy', x: 58.0, z: 4.5, rotY: Math.PI / 2 },
      { type: 'chair', x: 58.75, z: 4.5, rotY: Math.PI / 2 },
      // Middle-right horizontal table
      { type: 'table', room: 'phy', x: 52.5, z: 7.5, rotY: 0 },
      { type: 'chair', x: 52.5, z: 8.25, rotY: 0 },
      // Lower-right horizontal table
      { type: 'table', room: 'phy', x: 57.5, z: 11.2, rotY: 0 },
      { type: 'chair', x: 57.5, z: 10.45, rotY: Math.PI },

      // 4. Campus Library (X: 66..100, Z: 83..100) - Calibrated to images/library-reference.png
      // Top-left horizontal table
      { type: 'table', room: 'lib', x: 76.0, z: 88.0, rotY: 0 },
      { type: 'chair', x: 76.0, z: 88.75, rotY: 0 },
      { type: 'chair', x: 76.0, z: 87.25, rotY: Math.PI },
      // Top-right horizontal table
      { type: 'table', room: 'lib', x: 88.0, z: 88.0, rotY: 0 },
      { type: 'chair', x: 88.0, z: 88.75, rotY: 0 },
      { type: 'chair', x: 88.0, z: 87.25, rotY: Math.PI },
      // Bottom-left vertical table
      { type: 'table', room: 'lib', x: 73.0, z: 95.0, rotY: Math.PI / 2 },
      { type: 'chair', x: 72.25, z: 95.0, rotY: -Math.PI / 2 },
      { type: 'chair', x: 73.75, z: 95.0, rotY: Math.PI / 2 },
      // Bottom-center horizontal table
      { type: 'table', room: 'lib', x: 83.0, z: 96.0, rotY: 0 },
      { type: 'chair', x: 83.0, z: 96.75, rotY: 0 },
      { type: 'chair', x: 83.0, z: 95.25, rotY: Math.PI },
      // Bottom-right vertical table
      { type: 'table', room: 'lib', x: 92.5, z: 95.0, rotY: Math.PI / 2 },
      { type: 'chair', x: 91.75, z: 95.0, rotY: -Math.PI / 2 },
      { type: 'chair', x: 93.25, z: 95.0, rotY: Math.PI / 2 },
    ];

    furnitureSets.forEach((item) => {
      dummy.position.set(item.x, 0, item.z);
      dummy.rotation.set(0, item.rotY || 0, 0);
      dummy.updateMatrix();

      const box = new THREE.Box3();

      if (item.type === 'table') {
        tableFrameInstanced.setMatrixAt(tableFrameIdx++, dummy.matrix);
        if (item.room === 'cs') {
          csTableTopInstanced.setMatrixAt(csIdx++, dummy.matrix);
        } else if (item.room === 'bio') {
          bioTableTopInstanced.setMatrixAt(bioIdx++, dummy.matrix);
        } else if (item.room === 'phy') {
          phyTableTopInstanced.setMatrixAt(phyIdx++, dummy.matrix);
        } else if (item.room === 'lib') {
          libTableTopInstanced.setMatrixAt(libIdx++, dummy.matrix);
        }

        // Precise AABB Collider for table (accounting for orientation)
        const isRotated = Math.abs(Math.sin(item.rotY || 0)) > 0.5;
        const halfX = isRotated ? 0.40 : 0.70;
        const halfZ = isRotated ? 0.70 : 0.40;
        box.min.set(item.x - halfX, 0, item.z - halfZ);
        box.max.set(item.x + halfX, 0.85, item.z + halfZ);
        this.colliders.push(box);
      } else if (item.type === 'chair') {
        chairCushionInstanced.setMatrixAt(chairIdx, dummy.matrix);
        chairFrameInstanced.setMatrixAt(chairIdx, dummy.matrix);
        chairIdx++;

        // Precise AABB Collider for chair
        box.min.set(item.x - 0.24, 0, item.z - 0.24);
        box.max.set(item.x + 0.24, 0.88, item.z + 0.24);
        this.colliders.push(box);
      }
    });

    const instancedMeshes = [
      tableFrameInstanced,
      csTableTopInstanced,
      bioTableTopInstanced,
      phyTableTopInstanced,
      libTableTopInstanced,
      chairCushionInstanced,
      chairFrameInstanced
    ];

    instancedMeshes.forEach((im) => {
      im.instanceMatrix.needsUpdate = true;
      im.matrixAutoUpdate = false;
      im.updateMatrix();
      this.scene.add(im);
      this.furniture.push(im);
    });
  }

  /**
   * Builds 3D Props (Bookshelves, Wardrobes, Whiteboard) from models folder
   * Strictly calibrated to images/library-reference.png and images/phy-lab-reference.png
   */
  buildPropsFromModels() {
    this.propsList = [];

    // Wood materials
    const darkWoodMat = new THREE.MeshStandardMaterial({
      color: 0x4a2e18,
      roughness: 0.65,
      metalness: 0.08
    });
    const teakWoodMat = new THREE.MeshStandardMaterial({
      color: 0x6e4726,
      roughness: 0.6,
      metalness: 0.05
    });
    const brassMat = new THREE.MeshStandardMaterial({
      color: 0xd4af37,
      roughness: 0.3,
      metalness: 0.8
    });

    // 1. LIBRARY BOOKSHELVES (5 Bookshelves matching library-reference.png)
    const bookshelfConfigs = [
      // Top bookshelf to the right of the library door (rotated 180 deg)
      { id: 'lib_shelf_door_right', x: 89.0, z: 83.48, rotY: Math.PI, w: 2.1, d: 0.44, h: 2.4 },
      // Left wall (West wall) - top and bottom (rotated 180 deg)
      { id: 'lib_shelf_west_top', x: 66.48, z: 88.0, rotY: -Math.PI / 2, w: 2.1, d: 0.44, h: 2.4 },
      { id: 'lib_shelf_west_bot', x: 66.48, z: 96.0, rotY: -Math.PI / 2, w: 2.1, d: 0.44, h: 2.4 },
      // Right wall (East wall) - top and bottom (rotated 180 deg)
      { id: 'lib_shelf_east_top', x: 99.52, z: 88.0, rotY: Math.PI / 2, w: 2.1, d: 0.44, h: 2.4 },
      { id: 'lib_shelf_east_bot', x: 99.52, z: 96.0, rotY: Math.PI / 2, w: 2.1, d: 0.44, h: 2.4 }
    ];

    // Colors for procedural books
    const bookColors = [0x992d22, 0x2980b9, 0x27ae60, 0xd35400, 0x8e44ad, 0x16a085, 0xb7950b];

    bookshelfConfigs.forEach((cfg) => {
      const shelfGroup = new THREE.Group();
      shelfGroup.position.set(cfg.x, 0, cfg.z);
      shelfGroup.rotation.y = cfg.rotY;

      // Outer wood casing
      const sideThick = 0.06;
      const shelfThick = 0.05;
      const outerGeo = new THREE.BoxGeometry(cfg.w, cfg.h, cfg.d);
      outerGeo.translate(0, cfg.h / 2, 0);

      // Back panel
      const backGeo = new THREE.BoxGeometry(cfg.w, cfg.h, 0.04);
      backGeo.translate(0, cfg.h / 2, -cfg.d / 2 + 0.02);
      const backMesh = new THREE.Mesh(backGeo, darkWoodMat);
      shelfGroup.add(backMesh);

      // Side pillars
      const leftPillar = new THREE.BoxGeometry(sideThick, cfg.h, cfg.d);
      leftPillar.translate(-cfg.w / 2 + sideThick / 2, cfg.h / 2, 0);
      shelfGroup.add(new THREE.Mesh(leftPillar, darkWoodMat));

      const rightPillar = new THREE.BoxGeometry(sideThick, cfg.h, cfg.d);
      rightPillar.translate(cfg.w / 2 - sideThick / 2, cfg.h / 2, 0);
      shelfGroup.add(new THREE.Mesh(rightPillar, darkWoodMat));

      // Top & Bottom plinth
      const topCap = new THREE.BoxGeometry(cfg.w, sideThick, cfg.d);
      topCap.translate(0, cfg.h - sideThick / 2, 0);
      shelfGroup.add(new THREE.Mesh(topCap, darkWoodMat));

      const botPlinth = new THREE.BoxGeometry(cfg.w, sideThick * 1.5, cfg.d);
      botPlinth.translate(0, sideThick * 0.75, 0);
      shelfGroup.add(new THREE.Mesh(botPlinth, darkWoodMat));

      // 4 Internal horizontal shelves with colorful books
      const numShelves = 4;
      const shelfSpacing = (cfg.h - 0.25) / numShelves;
      for (let s = 1; s <= numShelves; s++) {
        const sy = s * shelfSpacing;
        const sGeo = new THREE.BoxGeometry(cfg.w - sideThick * 2, shelfThick, cfg.d - 0.04);
        sGeo.translate(0, sy, 0);
        shelfGroup.add(new THREE.Mesh(sGeo, darkWoodMat));

        // Place rows of books on shelves
        const bookCount = 10;
        const bookRowWidth = cfg.w - sideThick * 3;
        const bStep = bookRowWidth / bookCount;
        for (let b = 0; b < bookCount; b++) {
          const bx = -bookRowWidth / 2 + (b + 0.5) * bStep;
          const bh = 0.22 + (b % 4) * 0.04;
          const bw = 0.045 + (b % 3) * 0.015;
          const bd = cfg.d * 0.65;
          const bGeo = new THREE.BoxGeometry(bw, bh, bd);
          bGeo.translate(bx, sy + bh / 2 + shelfThick / 2, 0.04);
          const bMat = new THREE.MeshStandardMaterial({
            color: bookColors[(b + s) % bookColors.length],
            roughness: 0.55
          });
          shelfGroup.add(new THREE.Mesh(bGeo, bMat));
        }
      }

      this.scene.add(shelfGroup);
      this.propsList.push(shelfGroup);
      cfg._procMesh = shelfGroup;

      // AABB Collider for Bookshelf
      const isRotated = Math.abs(Math.sin(cfg.rotY)) > 0.5;
      const halfX = isRotated ? (cfg.d / 2) : (cfg.w / 2);
      const halfZ = isRotated ? (cfg.w / 2) : (cfg.d / 2);
      const box = new THREE.Box3();
      box.min.set(cfg.x - halfX, 0, cfg.z - halfZ);
      box.max.set(cfg.x + halfX, cfg.h, cfg.z + halfZ);
      this.colliders.push(box);
    });

    // Asynchronously load 3D Bookshelf.glb from models folder
    try {
      const gltfLoader = new GLTFLoader();
      gltfLoader.load(
        assetUrl('/models/Bookshelf.glb'),
        (gltf) => {
          const template = gltf.scene;
          const tBox = new THREE.Box3().setFromObject(template);
          const tSize = tBox.getSize(new THREE.Vector3());
          const tCenter = tBox.getCenter(new THREE.Vector3());
          const targetH = 2.4;
          const scale = (tSize.y > 0.01) ? (targetH / tSize.y) : 1.0;

          bookshelfConfigs.forEach((cfg) => {
            const shelfClone = template.clone(true);
            shelfClone.scale.setScalar(scale);
            shelfClone.position.set(-tCenter.x * scale, -tBox.min.y * scale, -tCenter.z * scale);

            const alignGroup = new THREE.Group();
            alignGroup.rotation.y = -Math.PI / 2;
            alignGroup.scale.set(1.0, 1.0, 1.6);
            alignGroup.add(shelfClone);

            const rig = new THREE.Group();
            rig.position.set(cfg.x, 0, cfg.z);
            rig.rotation.y = cfg.rotY;
            rig.add(alignGroup);

            if (cfg._procMesh) {
              cfg._procMesh.visible = false;
            }
            this.scene.add(rig);
            this.propsList.push(rig);
          });
        },
        undefined,
        (err) => {
          console.warn('[LevelGenerator] Bookshelf.glb load skipped, procedural active:', err);
        }
      );
    } catch (e) {
      console.warn('[LevelGenerator] GLTFLoader error:', e);
    }

    // 2. PHYSICS LAB WARDROBES (2 Wardrobes matching phy-lab-reference.png)
    const wardrobeConfigs = [
      // Top-left wardrobe
      { id: 'phy_wardrobe_top', x: 35.70, z: 3.6, rotY: Math.PI / 2, w: 2.0, d: 0.85, h: 2.95 },
      // Bottom-left wardrobe
      { id: 'phy_wardrobe_bot', x: 35.70, z: 11.2, rotY: Math.PI / 2, w: 2.0, d: 0.85, h: 2.95 }
    ];

    wardrobeConfigs.forEach((cfg) => {
      const wardGroup = new THREE.Group();
      wardGroup.position.set(cfg.x, 0, cfg.z);
      wardGroup.rotation.y = cfg.rotY;

      // Main wardrobe cabinet
      const mainGeo = new THREE.BoxGeometry(cfg.w, cfg.h, cfg.d);
      mainGeo.translate(0, cfg.h / 2, 0);
      wardGroup.add(new THREE.Mesh(mainGeo, teakWoodMat));

      // Door seam divider
      const seamGeo = new THREE.BoxGeometry(0.02, cfg.h - 0.2, 0.02);
      seamGeo.translate(0, cfg.h / 2, cfg.d / 2 + 0.01);
      const darkSeamMat = new THREE.MeshBasicMaterial({ color: 0x221308 });
      wardGroup.add(new THREE.Mesh(seamGeo, darkSeamMat));

      // Brass door handles
      const handleGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.16, 8);
      const leftHandle = new THREE.Mesh(handleGeo, brassMat);
      leftHandle.position.set(-0.08, cfg.h * 0.52, cfg.d / 2 + 0.04);
      wardGroup.add(leftHandle);

      const rightHandle = new THREE.Mesh(handleGeo, brassMat);
      rightHandle.position.set(0.08, cfg.h * 0.52, cfg.d / 2 + 0.04);
      wardGroup.add(rightHandle);

      this.scene.add(wardGroup);
      this.propsList.push(wardGroup);
      cfg._procMesh = wardGroup;

      // AABB Collider for wardrobe
      const isRotated = Math.abs(Math.sin(cfg.rotY)) > 0.5;
      const halfX = isRotated ? (cfg.d / 2) : (cfg.w / 2);
      const halfZ = isRotated ? (cfg.w / 2) : (cfg.d / 2);
      const box = new THREE.Box3();
      box.min.set(cfg.x - halfX, 0, cfg.z - halfZ);
      box.max.set(cfg.x + halfX, cfg.h, cfg.z + halfZ);
      this.colliders.push(box);
    });

    // Asynchronously load 3D wardrobe.fbx from models folder
    try {
      const fbxLoader = new FBXLoader();
      fbxLoader.load(
        assetUrl('/models/wardrobe.fbx'),
        (fbx) => {
          const tBox = new THREE.Box3().setFromObject(fbx);
          const tSize = tBox.getSize(new THREE.Vector3());
          const tCenter = tBox.getCenter(new THREE.Vector3());
          const targetH = 2.95;
          const targetW = 2.0;
          const targetD = 0.85;

          const sX = (tSize.x > 0.01) ? (targetD / tSize.x) : 0.01;
          const sY = (tSize.y > 0.01) ? (targetH / tSize.y) : 0.01;
          const sZ = (tSize.z > 0.01) ? (targetW / tSize.z) : 0.01;

          wardrobeConfigs.forEach((cfg) => {
            const wardClone = fbx.clone(true);
            wardClone.scale.copy(fbx.scale).multiply(new THREE.Vector3(sX, sY, sZ));
            wardClone.position.set(-tCenter.x * sX, -tBox.min.y * sY, -tCenter.z * sZ);

            // Enhance materials with polished teak wood and brass handles
            wardClone.traverse((c) => {
              if (c.isMesh) {
                c.castShadow = true;
                c.receiveShadow = true;
                if (c.name && c.name.startsWith('Box00')) {
                  c.material = brassMat;
                } else {
                  c.material = teakWoodMat;
                }
              }
            });

            const alignGroup = new THREE.Group();
            alignGroup.rotation.y = Math.PI / 2;
            alignGroup.add(wardClone);

            const rig = new THREE.Group();
            rig.position.set(cfg.x, 0, cfg.z);
            rig.rotation.y = cfg.rotY;
            rig.add(alignGroup);

            if (cfg._procMesh) {
              cfg._procMesh.visible = false;
            }
            this.scene.add(rig);
            this.propsList.push(rig);
          });
        },
        undefined,
        (err) => {
          console.warn('[LevelGenerator] wardrobe.fbx load skipped, procedural active:', err);
        }
      );
    } catch (e) {
      console.warn('[LevelGenerator] FBXLoader error:', e);
    }

    // 3. PHYSICS LAB WHITEBOARD (West wall near teacher's table, matching phy-lab-reference.png)
    const wbConfig = {
      x: 35.25, z: 7.0, rotY: Math.PI / 2, w: 2.4, h: 1.5, d: 0.08
    };

    const wbGroup = new THREE.Group();
    wbGroup.position.set(wbConfig.x, 0, wbConfig.z);
    wbGroup.rotation.y = wbConfig.rotY;

    // Aluminum frame
    const frameMat = new THREE.MeshStandardMaterial({
      color: 0xb0bec5,
      roughness: 0.35,
      metalness: 0.8
    });
    const frameGeo = new THREE.BoxGeometry(wbConfig.w, wbConfig.h, 0.06);
    frameGeo.translate(0, 1.85, 0);
    wbGroup.add(new THREE.Mesh(frameGeo, frameMat));

    // Glossy white board face
    const boardMat = new THREE.MeshStandardMaterial({
      color: 0xfdfdfd,
      roughness: 0.12,
      metalness: 0.05
    });
    const boardGeo = new THREE.BoxGeometry(wbConfig.w - 0.12, wbConfig.h - 0.12, 0.04);
    boardGeo.translate(0, 1.85, 0.02);
    wbGroup.add(new THREE.Mesh(boardGeo, boardMat));

    // Marker ledge tray with markers
    const trayGeo = new THREE.BoxGeometry(wbConfig.w - 0.2, 0.04, 0.14);
    trayGeo.translate(0, 1.85 - wbConfig.h / 2 + 0.02, 0.07);
    wbGroup.add(new THREE.Mesh(trayGeo, frameMat));

    // Colored dry-erase markers
    const markerColors = [0x111111, 0xc0392b, 0x2980b9];
    markerColors.forEach((mColor, idx) => {
      const mGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.14, 8);
      mGeo.rotateZ(Math.PI / 2);
      const mMesh = new THREE.Mesh(mGeo, new THREE.MeshStandardMaterial({ color: mColor, roughness: 0.4 }));
      mMesh.position.set(-0.25 + idx * 0.25, 1.85 - wbConfig.h / 2 + 0.05, 0.07);
      wbGroup.add(mMesh);
    });

    this.scene.add(wbGroup);
    this.propsList.push(wbGroup);

    // AABB Collider for Whiteboard frame
    const wbBox = new THREE.Box3();
    wbBox.min.set(35.29, 0, wbConfig.z - 1.05);
    wbBox.max.set(35.87, 2.0, wbConfig.z + 1.05);
    this.colliders.push(wbBox);

    // Asynchronously load 3D whiteboard.obj
    try {
      const objLoader = new OBJLoader();
      objLoader.load(
        assetUrl('/models/whiteboard.obj'),
        (obj) => {
          // Keep only object '01' (the rolling whiteboard), remove drafting boards ('02', '02.1')
          const toRemove = [];
          obj.children.forEach((c) => {
            if (c.name !== '01') {
              c.visible = false;
              toRemove.push(c);
            }
          });
          toRemove.forEach((c) => obj.remove(c));

          const tBox = new THREE.Box3().setFromObject(obj);
          const tSize = tBox.getSize(new THREE.Vector3());
          const tCenter = tBox.getCenter(new THREE.Vector3());
          const targetH = 1.95;
          const scale = (tSize.y > 0.01) ? (targetH / tSize.y) : 0.01;

          obj.scale.setScalar(scale);
          obj.position.set(-tCenter.x * scale, -tBox.min.y * scale, -tCenter.z * scale);

          const rig = new THREE.Group();
          rig.position.set(35.58, 0, wbConfig.z);
          rig.rotation.y = wbConfig.rotY;
          rig.add(obj);

          wbGroup.visible = false;
          this.scene.add(rig);
          this.propsList.push(rig);
        },
        undefined,
        (err) => {
          console.warn('[LevelGenerator] whiteboard.obj load skipped, procedural active:', err);
        }
      );
    } catch (e) {
      console.warn('[LevelGenerator] OBJLoader whiteboard error:', e);
    }
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

      group.matrixAutoUpdate = false;
      group.updateMatrix();
      this.scene.add(group);
      this.posters.push(group);
    });
  }

  getFloorHeightAt(position) {
    return 0.0;
  }

  initSpatialGrid() {
    this.gridCellSize = 10.0;
    this.gridCols = 10;
    this.gridRows = 10;
    this.spatialGrid = new Array(this.gridCols * this.gridRows);
    for (let i = 0; i < this.spatialGrid.length; i++) {
      this.spatialGrid[i] = [];
    }
    this.rebuildSpatialGrid();
  }

  rebuildSpatialGrid() {
    if (!this.spatialGrid) return;
    for (let i = 0; i < this.spatialGrid.length; i++) {
      this.spatialGrid[i].length = 0;
    }

    const cs = this.gridCellSize;
    const cols = this.gridCols;
    const rows = this.gridRows;

    for (let i = 0; i < this.colliders.length; i++) {
      const box = this.colliders[i];
      const minCol = Math.max(0, Math.min(cols - 1, Math.floor(box.min.x / cs)));
      const maxCol = Math.max(0, Math.min(cols - 1, Math.floor(box.max.x / cs)));
      const minRow = Math.max(0, Math.min(rows - 1, Math.floor(box.min.z / cs)));
      const maxRow = Math.max(0, Math.min(rows - 1, Math.floor(box.max.z / cs)));

      for (let r = minRow; r <= maxRow; r++) {
        for (let c = minCol; c <= maxCol; c++) {
          this.spatialGrid[r * cols + c].push(box);
        }
      }
    }
  }

  getCollidersNear(position, radius = 5.0) {
    if (!this.spatialGrid) return this.colliders;
    const cs = this.gridCellSize;
    const cols = this.gridCols;
    const rows = this.gridRows;

    const minCol = Math.max(0, Math.min(cols - 1, Math.floor((position.x - radius) / cs)));
    const maxCol = Math.max(0, Math.min(cols - 1, Math.floor((position.x + radius) / cs)));
    const minRow = Math.max(0, Math.min(rows - 1, Math.floor((position.z - radius) / cs)));
    const maxRow = Math.max(0, Math.min(rows - 1, Math.floor((position.z + radius) / cs)));

    if (minCol === maxCol && minRow === maxRow) {
      return this.spatialGrid[minRow * cols + minCol];
    }

    this._spatialQueryId = (this._spatialQueryId || 0) + 1;
    const qId = this._spatialQueryId;
    const results = [];

    for (let r = minRow; r <= maxRow; r++) {
      for (let c = minCol; c <= maxCol; c++) {
        const cell = this.spatialGrid[r * cols + c];
        for (let i = 0; i < cell.length; i++) {
          const box = cell[i];
          if (box._lastQueryId === qId) continue;
          box._lastQueryId = qId;
          results.push(box);
        }
      }
    }
    return results;
  }

  _testBoxCollision(wallBox, position, radius, axis, entMinX, entMaxX, entMinZ, entMaxZ, playerFeet, playerHead) {
    if (wallBox.min.y >= playerHead || wallBox.max.y <= playerFeet) return;

    if (wallBox.max.x >= entMinX && wallBox.min.x <= entMaxX &&
        wallBox.max.z >= entMinZ && wallBox.min.z <= entMaxZ) {
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

  /**
   * Fast, zero-allocation spatial grid AABB collision resolution
   */
  resolveAxisCollision(position, radius, axis) {
    const playerFeet = Math.max(0, position.y - 1.6);
    const playerHead = position.y + 0.2;
    const entMinX = position.x - radius;
    const entMaxX = position.x + radius;
    const entMinZ = position.z - radius;
    const entMaxZ = position.z + radius;

    if (!this.spatialGrid) {
      for (let i = 0; i < this.colliders.length; i++) {
        this._testBoxCollision(this.colliders[i], position, radius, axis, entMinX, entMaxX, entMinZ, entMaxZ, playerFeet, playerHead);
      }
      return;
    }

    const cs = this.gridCellSize;
    const cols = this.gridCols;
    const rows = this.gridRows;

    const minCol = Math.max(0, Math.min(cols - 1, Math.floor(entMinX / cs)));
    const maxCol = Math.max(0, Math.min(cols - 1, Math.floor(entMaxX / cs)));
    const minRow = Math.max(0, Math.min(rows - 1, Math.floor(entMinZ / cs)));
    const maxRow = Math.max(0, Math.min(rows - 1, Math.floor(entMaxZ / cs)));

    if (minCol === maxCol && minRow === maxRow) {
      const cell = this.spatialGrid[minRow * cols + minCol];
      for (let i = 0; i < cell.length; i++) {
        this._testBoxCollision(cell[i], position, radius, axis, entMinX, entMaxX, entMinZ, entMaxZ, playerFeet, playerHead);
      }
      return;
    }

    this._spatialTestId = (this._spatialTestId || 0) + 1;
    const testId = this._spatialTestId;

    for (let r = minRow; r <= maxRow; r++) {
      for (let c = minCol; c <= maxCol; c++) {
        const cell = this.spatialGrid[r * cols + c];
        for (let i = 0; i < cell.length; i++) {
          const box = cell[i];
          if (box._lastTestId === testId) continue;
          box._lastTestId = testId;
          this._testBoxCollision(box, position, radius, axis, entMinX, entMaxX, entMinZ, entMaxZ, playerFeet, playerHead);
        }
      }
    }
  }

  resolveSphereCollision(position, radius = 0.45) {
    this.resolveAxisCollision(position, radius, 'x');
    this.resolveAxisCollision(position, radius, 'z');
  }
}
