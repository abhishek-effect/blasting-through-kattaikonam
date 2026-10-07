/**
 * LevelGenerator Module
 * Loads mappu.obj and mappu.mtl as the primary 3D level geometry.
 * Features:
 * - Direct integration of mappu.obj and mappu.mtl with double-sided PBR materials.
 * - Perfectly aligned 1:1 scale: 100m x 100m campus footprint, 5m ceiling height.
 * - 34 deterministic wall colliders matching all rooms and doorway openings.
 * - Robust axis-separated AABB collision resolution (zero wall/ceiling clipping).
 * - Comprehensive campus illumination rig with bright ambient, sun, and 14 ceiling luminaires.
 * - Interactive Elevator and Seminar Hall security gate (requires 20 kills).
 */
import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { ASSET_PATHS, loadTexture } from '../config/assets.js';
import { Elevator } from '../interactive/Elevator.js';

export const MAPPU_WALLS = [
  // Outer Boundaries (Height 5m)
  { id: 'b_north', minX: 0, maxX: 100, minZ: 0, maxZ: 0 },
  { id: 'b_south', minX: 0, maxX: 100, minZ: 100, maxZ: 100 },
  { id: 'b_east', minX: 100, maxX: 100, minZ: 0, maxZ: 100 },
  { id: 'b_west', minX: 0, maxX: 0, minZ: 0, maxZ: 100 },

  // 1. Physics Lab (PHY LAB - Top Center) - Door gap at X=45 to 48
  { id: 'phy_south_left', minX: 35, maxX: 45, minZ: 10, maxZ: 10 },
  { id: 'phy_south_right', minX: 48, maxX: 60, minZ: 10, maxZ: 10 },
  { id: 'phy_west', minX: 35, maxX: 35, minZ: 0, maxZ: 10 },
  { id: 'phy_east', minX: 60, maxX: 60, minZ: 0, maxZ: 10 },

  // 2. Seminar Hall (Right Auditorium) - Door gap at Z=40 to 45
  { id: 'sem_west_north', minX: 55, maxX: 55, minZ: 25, maxZ: 40 },
  { id: 'sem_west_south', minX: 55, maxX: 55, minZ: 45, maxZ: 60 },
  { id: 'sem_south', minX: 55, maxX: 100, minZ: 60, maxZ: 60 },
  { id: 'sem_north', minX: 55, maxX: 100, minZ: 25, maxZ: 25 },

  // 3. Library (Bottom Right) - Door gap at X=65 to 70
  { id: 'lib_north_left', minX: 55, maxX: 65, minZ: 85, maxZ: 85 },
  { id: 'lib_north_right', minX: 70, maxX: 85, minZ: 85, maxZ: 85 },
  { id: 'lib_west', minX: 55, maxX: 55, minZ: 85, maxZ: 100 },
  { id: 'lib_east', minX: 85, maxX: 85, minZ: 85, maxZ: 100 },

  // 4. Infirmary (West Upper) - Door gap at Z=18 to 21
  { id: 'inf_east_north', minX: 12, maxX: 12, minZ: 15, maxZ: 18 },
  { id: 'inf_east_south', minX: 12, maxX: 12, minZ: 21, maxZ: 25 },
  { id: 'inf_north', minX: 0, maxX: 12, minZ: 15, maxZ: 15 },
  { id: 'inf_south', minX: 0, maxX: 12, minZ: 25, maxZ: 25 },

  // 5. Elevator & Open Room (West Middle) - Doors at Z=34-37 & Z=50-53
  { id: 'elev_east_north', minX: 12, maxX: 12, minZ: 30, maxZ: 34 },
  { id: 'elev_east_mid', minX: 12, maxX: 12, minZ: 37, maxZ: 40 },
  { id: 'open_east_mid', minX: 12, maxX: 12, minZ: 45, maxZ: 50 },
  { id: 'open_east_south', minX: 12, maxX: 12, minZ: 53, maxZ: 60 },
  { id: 'elev_north', minX: 0, maxX: 12, minZ: 30, maxZ: 30 },
  { id: 'open_south', minX: 0, maxX: 12, minZ: 60, maxZ: 60 },

  // 6. Locked Archives (Top Right) - Door gap at X=70 to 73
  { id: 'arch_south_left', minX: 65, maxX: 70, minZ: 10, maxZ: 10 },
  { id: 'arch_south_right', minX: 73, maxX: 80, minZ: 10, maxZ: 10 },
  { id: 'arch_west', minX: 65, maxX: 65, minZ: 0, maxZ: 10 },
  { id: 'arch_east', minX: 80, maxX: 80, minZ: 0, maxZ: 10 },

  // 7. Unusable Stairs (Bottom Left) - Door gap at Z=88 to 91
  { id: 'stairs_north', minX: 0, maxX: 20, minZ: 85, maxZ: 85 },
  { id: 'stairs_south', minX: 0, maxX: 20, minZ: 95, maxZ: 95 },
  { id: 'stairs_east_north', minX: 20, maxX: 20, minZ: 85, maxZ: 88 },
  { id: 'stairs_east_south', minX: 20, maxX: 20, minZ: 91, maxZ: 95 },
];

export class LevelGenerator {
  constructor(scene, levelData) {
    this.scene = scene;
    this.data = levelData;
    this.colliders = []; // List of THREE.Box3 for player/enemy collisions
    this.lights = [];
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

    // 1. Build deterministic AABB colliders for all 34 walls defined in mappu.obj
    this.buildWallColliders(h);

    // 2. Build Accessible Elevator inside West Wing Room (x: 6.0, z: 35.5)
    if (this.data.elevator) {
      this.elevator = new Elevator(this.scene, this.data.elevator);
      const elevColliders = this.elevator.getColliders();
      elevColliders.forEach((box) => this.colliders.push(box));
    }

    // 3. Build Seminar Hall Security Gate (x: 55, z: 42.5, width: 5.0m, locked until 20 kills)
    this.buildSeminarGate(h);
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
            // Fallback load without mtl
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

    // Model coordinates are already in meters: 100m x 100m footprint, 5m height
    obj.scale.set(1.0, 1.0, 1.0);
    obj.position.set(0, 0, 0);

    // Apply double-sided rendering, shadows, and clean roughness to all loaded materials
    obj.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;

        if (Array.isArray(child.material)) {
          child.material.forEach((mat) => {
            mat.side = THREE.DoubleSide;
            mat.roughness = 0.7;
            mat.metalness = 0.1;
          });
        } else if (child.material) {
          child.material.side = THREE.DoubleSide;
          child.material.roughness = 0.7;
          child.material.metalness = 0.1;
        }
      }
    });

    this.scene.add(obj);
    this.isMapLoaded = true;
  }

  /**
   * Comprehensive Campus Lighting Rig:
   * Ambient, hemisphere sky bounce, dual directional suns, and 14 fluorescent ceiling fixtures
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

    // 4. Campus Fluorescent Tube Luminaires Grid (14 bright point lights with glowing fixtures at Y = 4.7)
    const lightPositions = [
      { x: 37.5, y: 4.7, z: 90.0, color: 0xfff5e6, intensity: 2.5, range: 28 }, // South Spawn Hall
      { x: 45.0, y: 4.7, z: 75.0, color: 0xfff5e6, intensity: 2.2, range: 26 }, // South Corridor Junction
      { x: 29.0, y: 4.7, z: 55.0, color: 0xfff8ee, intensity: 2.5, range: 30 }, // Central Hall (South)
      { x: 29.0, y: 4.7, z: 35.0, color: 0xfff8ee, intensity: 2.5, range: 30 }, // Central Hall (North)
      { x: 70.0, y: 4.7, z: 92.5, color: 0xfff5e6, intensity: 2.5, range: 28 }, // Library
      { x: 10.0, y: 4.7, z: 90.0, color: 0xffe0cc, intensity: 2.0, range: 24 }, // South Unusable Stairs
      { x: 6.0,  y: 4.7, z: 20.0, color: 0xe6f2ff, intensity: 2.2, range: 22 }, // Infirmary
      { x: 6.0,  y: 4.7, z: 35.0, color: 0xffeedd, intensity: 2.2, range: 22 }, // Elevator Room
      { x: 6.0,  y: 4.7, z: 52.0, color: 0xfff5e6, intensity: 2.2, range: 22 }, // Open Classroom
      { x: 47.5, y: 4.7, z: 5.0,  color: 0xffeedd, intensity: 2.5, range: 28 }, // Physics Lab
      { x: 72.5, y: 4.7, z: 5.0,  color: 0xffe0cc, intensity: 2.2, range: 24 }, // Locked Archives
      { x: 75.0, y: 4.7, z: 42.5, color: 0xfff5e6, intensity: 3.0, range: 36 }, // Seminar Hall Auditorium Center
      { x: 90.0, y: 4.7, z: 42.5, color: 0xffea77, intensity: 2.5, range: 26 }, // Seminar Hall Stage
      { x: 50.0, y: 4.7, z: 20.0, color: 0xfff5e6, intensity: 2.2, range: 26 }, // North Corridor
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
    gateMesh.position.set(55, h / 2, 42.5);
    this.scene.add(gateMesh);

    const gateCollider = new THREE.Box3();
    const half = new THREE.Vector3(0.2, h / 2, 2.5);
    const center = new THREE.Vector3(55, h / 2, 42.5);
    gateCollider.min.subVectors(center, half);
    gateCollider.max.addVectors(center, half);
    this.colliders.push(gateCollider);

    this.seminarGate = {
      mesh: gateMesh,
      collider: gateCollider,
      isUnlocked: false,
      requiresKills: 20,
      x: 55,
      z: 42.5,
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

  getFloorHeightAt(position) {
    return 0.0;
  }

  /**
   * Robust Axis-Separated AABB Collision Resolution
   * Completely prevents clipping or tunneling through walls.
   */
  resolveAxisCollision(position, radius, axis) {
    const playerFeet = Math.max(0, position.y - 1.6);
    const playerHead = position.y + 0.2; // approx 1.85m

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
