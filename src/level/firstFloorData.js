/**
 * First Floor Campus Data Definition
 * Calibrated to images/first-floor-plan.png and images/floor-1.obj:
 * - Dimensions: 100m x 100m footprint, ceiling height 5m
 * - Player Spawn: (20.0, 1.65, 27.0) outside the Floor 1 Elevator
 * - Black Tiles Area: X: 28..44, Z: 28..70
 * - Pillar: Circle at X: 42.0, Z: 78.0
 * - North Rooms: North Stairs, Staff Room, 12A, 12B, 12C
 * - West Rooms: Elevator (X: 14, Z: 27), 11A, 11B, 11C, Option Room 1
 * - East Wing: Grand Open Staircase Atrium (Actual Stairs)
 * - South Rooms: 10A, 10B, 10C
 */
import { assetUrl } from '../config/assets.js';

export const firstFloorWalls = [
  // Boundaries (100m x 100m)
  { id: 'f1_b_north', minX: 0, maxX: 100, minZ: 0, maxZ: 0 },
  { id: 'f1_b_south', minX: 0, maxX: 100, minZ: 100, maxZ: 100 },
  { id: 'f1_b_east', minX: 100, maxX: 100, minZ: 0, maxZ: 100 },
  { id: 'f1_b_west', minX: 0, maxX: 0, minZ: 0, maxZ: 100 },

  // North Wing (Z: 0 to 14)
  // staff_room (X: 38 to 52, Z: 0 to 14) - Doorway at X: 43..47
  { id: 'f1_staff_w', minX: 38, maxX: 38, minZ: 0, maxZ: 14 },
  { id: 'f1_staff_e', minX: 52, maxX: 52, minZ: 0, maxZ: 14 },
  { id: 'f1_staff_s1', minX: 38, maxX: 43, minZ: 14, maxZ: 14 },
  { id: 'f1_staff_s2', minX: 47, maxX: 52, minZ: 14, maxZ: 14 },

  // 12A (X: 56 to 68, Z: 0 to 14) - Doorway at X: 60..64
  { id: 'f1_12a_w', minX: 56, maxX: 56, minZ: 0, maxZ: 14 },
  { id: 'f1_12a_e', minX: 68, maxX: 68, minZ: 0, maxZ: 14 },
  { id: 'f1_12a_s1', minX: 56, maxX: 60, minZ: 14, maxZ: 14 },
  { id: 'f1_12a_s2', minX: 64, maxX: 68, minZ: 14, maxZ: 14 },

  // 12B (X: 71 to 83, Z: 0 to 14) - Doorway at X: 75..79
  { id: 'f1_12b_w', minX: 71, maxX: 71, minZ: 0, maxZ: 14 },
  { id: 'f1_12b_e', minX: 83, maxX: 83, minZ: 0, maxZ: 14 },
  { id: 'f1_12b_s1', minX: 71, maxX: 75, minZ: 14, maxZ: 14 },
  { id: 'f1_12b_s2', minX: 79, maxX: 83, minZ: 14, maxZ: 14 },

  // 12C (X: 86 to 100, Z: 0 to 14) - Doorway at X: 91..95
  { id: 'f1_12c_w', minX: 86, maxX: 86, minZ: 0, maxZ: 14 },
  { id: 'f1_12c_s1', minX: 86, maxX: 91, minZ: 14, maxZ: 14 },
  { id: 'f1_12c_s2', minX: 95, maxX: 100, minZ: 14, maxZ: 14 },

  // West Wing (X: 0 to 14)
  // elevator shaft room (X: 0 to 14, Z: 20 to 34) - Opening at Z: 25..29
  { id: 'f1_elev_n', minX: 0, maxX: 14, minZ: 20, maxZ: 20 },
  { id: 'f1_elev_s', minX: 0, maxX: 14, minZ: 34, maxZ: 34 },
  { id: 'f1_elev_e1', minX: 14, maxX: 14, minZ: 20, maxZ: 25 },
  { id: 'f1_elev_e2', minX: 14, maxX: 14, minZ: 29, maxZ: 34 },

  // 11A (X: 0 to 14, Z: 36 to 48) - Doorway at Z: 40..44
  { id: 'f1_11a_n', minX: 0, maxX: 14, minZ: 36, maxZ: 36 },
  { id: 'f1_11a_s', minX: 0, maxX: 14, minZ: 48, maxZ: 48 },
  { id: 'f1_11a_e1', minX: 14, maxX: 14, minZ: 36, maxZ: 40 },
  { id: 'f1_11a_e2', minX: 14, maxX: 14, minZ: 44, maxZ: 48 },

  // 11B (X: 0 to 14, Z: 51 to 63) - Doorway at Z: 55..59
  { id: 'f1_11b_n', minX: 0, maxX: 14, minZ: 51, maxZ: 51 },
  { id: 'f1_11b_s', minX: 0, maxX: 14, minZ: 63, maxZ: 63 },
  { id: 'f1_11b_e1', minX: 14, maxX: 14, minZ: 51, maxZ: 55 },
  { id: 'f1_11b_e2', minX: 14, maxX: 14, minZ: 59, maxZ: 63 },

  // 11C (X: 0 to 14, Z: 66 to 78) - Doorway at Z: 70..74
  { id: 'f1_11c_n', minX: 0, maxX: 14, minZ: 66, maxZ: 66 },
  { id: 'f1_11c_s', minX: 0, maxX: 14, minZ: 78, maxZ: 78 },
  { id: 'f1_11c_e1', minX: 14, maxX: 14, minZ: 66, maxZ: 70 },
  { id: 'f1_11c_e2', minX: 14, maxX: 14, minZ: 74, maxZ: 78 },

  // OPTION ROOM 1 (X: 0 to 14, Z: 81 to 97) - Doorway at Z: 87..91
  { id: 'f1_opt_n', minX: 0, maxX: 14, minZ: 81, maxZ: 81 },
  { id: 'f1_opt_s', minX: 0, maxX: 14, minZ: 97, maxZ: 97 },
  { id: 'f1_opt_e1', minX: 14, maxX: 14, minZ: 81, maxZ: 87 },
  { id: 'f1_opt_e2', minX: 14, maxX: 14, minZ: 91, maxZ: 97 },

  // East Wing - Grand Staircase Atrium (Open, stairs only have collision barrier on steps)

  // South Wing (Z: 85 to 100)
  // 10A (X: 52 to 66, Z: 85 to 100) - Doorway at X: 57..61
  { id: 'f1_10a_w', minX: 52, maxX: 52, minZ: 85, maxZ: 100 },
  { id: 'f1_10a_e', minX: 66, maxX: 66, minZ: 85, maxZ: 100 },
  { id: 'f1_10a_n1', minX: 52, maxX: 57, minZ: 85, maxZ: 85 },
  { id: 'f1_10a_n2', minX: 61, maxX: 66, minZ: 85, maxZ: 85 },

  // 10B (X: 69 to 83, Z: 85 to 100) - Doorway at X: 74..78
  { id: 'f1_10b_w', minX: 69, maxX: 69, minZ: 85, maxZ: 100 },
  { id: 'f1_10b_e', minX: 83, maxX: 83, minZ: 85, maxZ: 100 },
  { id: 'f1_10b_n1', minX: 69, maxX: 74, minZ: 85, maxZ: 85 },
  { id: 'f1_10b_n2', minX: 78, maxX: 83, minZ: 85, maxZ: 85 },

  // 10C (X: 86 to 98, Z: 85 to 100) - Doorway at X: 90..94
  { id: 'f1_10c_w', minX: 86, maxX: 86, minZ: 85, maxZ: 100 },
  { id: 'f1_10c_e', minX: 98, maxX: 98, minZ: 85, maxZ: 100 },
  { id: 'f1_10c_n1', minX: 86, maxX: 90, minZ: 85, maxZ: 85 },
  { id: 'f1_10c_n2', minX: 94, maxX: 98, minZ: 85, maxZ: 85 },
];

export const firstFloorData = {
  id: 2,
  name: 'First Floor Campus',
  ceilingHeight: 5.0,
  playerStart: { x: 20.0, y: 1.65, z: 27.0, yaw: Math.PI / 2 },

  bounds: {
    minX: 0,
    maxX: 100,
    minZ: 0,
    maxZ: 100,
  },

  obj: assetUrl('/images/floor-1.obj'),
  mtl: assetUrl('/images/floor-1.mtl'),

  walls: firstFloorWalls,

  rooms: [
    // North Wing
    { id: 'f1_nw_stairs', name: 'North Stairwell', x: 24, z: 5, w: 16, l: 10 },
    { id: 'f1_staff_room', name: 'Staff Room', x: 45, z: 7, w: 14, l: 14, isClass: true, doorDir: 'z+', doorPos: { x: 45, z: 14 } },
    { id: 'f1_12a', name: 'Class 12A', x: 62, z: 7, w: 12, l: 14, isClass: true, doorDir: 'z+', doorPos: { x: 62, z: 14 } },
    { id: 'f1_12b', name: 'Class 12B', x: 77, z: 7, w: 12, l: 14, isClass: true, doorDir: 'z+', doorPos: { x: 77, z: 14 } },
    { id: 'f1_12c', name: 'Class 12C', x: 93, z: 7, w: 14, l: 14, isClass: true, doorDir: 'z+', doorPos: { x: 93, z: 14 } },

    // West Wing
    { id: 'f1_elevator_lobby', name: 'First Floor Elevator Lobby', x: 7, z: 27, w: 14, l: 14 },
    { id: 'f1_11a', name: 'Class 11A', x: 7, z: 42, w: 14, l: 12, isClass: true, doorDir: 'x+', doorPos: { x: 14, z: 42 } },
    { id: 'f1_11b', name: 'Class 11B', x: 7, z: 57, w: 14, l: 12, isClass: true, doorDir: 'x+', doorPos: { x: 14, z: 57 } },
    { id: 'f1_11c', name: 'Class 11C', x: 7, z: 72, w: 14, l: 12, isClass: true, doorDir: 'x+', doorPos: { x: 14, z: 72 } },
    { id: 'f1_option1', name: 'Option Room 1', x: 7, z: 89, w: 14, l: 16, isClass: true, doorDir: 'x+', doorPos: { x: 14, z: 89 } },

    // Central & East
    { id: 'f1_central_atrium', name: 'Central Hall (Black Tiles)', x: 36, z: 49, w: 16, l: 42, hasBlackTiles: true },
    { id: 'f1_stairs_atrium', name: 'Grand Staircase Atrium', x: 80, z: 45, w: 36, l: 40, isGrandStairs: true },

    // South Wing
    { id: 'f1_10a', name: 'Class 10A', x: 59, z: 92.5, w: 14, l: 15, isClass: true, doorDir: 'z-', doorPos: { x: 59, z: 85 } },
    { id: 'f1_10b', name: 'Class 10B', x: 76, z: 92.5, w: 14, l: 15, isClass: true, doorDir: 'z-', doorPos: { x: 76, z: 85 } },
    { id: 'f1_10c', name: 'Class 10C', x: 92, z: 92.5, w: 12, l: 15, isClass: true, doorDir: 'z-', doorPos: { x: 92, z: 85 } },
  ],

  doorways: [
    // North Doors
    { id: 'd_f1_staff', x: 45, z: 14, w: 4.0, dir: 'x', label: 'STAFF ROOM' },
    { id: 'd_f1_12a', x: 62, z: 14, w: 4.0, dir: 'x', label: 'CLASS 12A' },
    { id: 'd_f1_12b', x: 77, z: 14, w: 4.0, dir: 'x', label: 'CLASS 12B' },
    { id: 'd_f1_12c', x: 93, z: 14, w: 4.0, dir: 'x', label: 'CLASS 12C' },

    // West Doors (Elevator occupies doorway at x: 14, z: 27)
    { id: 'd_f1_11a', x: 14, z: 42, w: 4.0, dir: 'z', label: 'CLASS 11A' },
    { id: 'd_f1_11b', x: 14, z: 57, w: 4.0, dir: 'z', label: 'CLASS 11B' },
    { id: 'd_f1_11c', x: 14, z: 72, w: 4.0, dir: 'z', label: 'CLASS 11C' },
    { id: 'd_f1_opt', x: 14, z: 89, w: 4.0, dir: 'z', label: 'OPTION ROOM 1' },

    // South Doors
    { id: 'd_f1_10a', x: 59, z: 85, w: 4.0, dir: 'x', label: 'CLASS 10A' },
    { id: 'd_f1_10b', x: 76, z: 85, w: 4.0, dir: 'x', label: 'CLASS 10B' },
    { id: 'd_f1_10c', x: 92, z: 85, w: 4.0, dir: 'x', label: 'CLASS 10C' },
  ],

  // Main Campus Elevator on First Floor (x: 14.0, z: 27.0)
  elevator: {
    id: 'floor1_elevator',
    name: 'Campus Elevator',
    x: 14.0,
    z: 27.0,
    w: 4.0,
    l: 3.0,
    dir: 'z',
    interactionRadius: 2.2,
    currentFloor: 2,
    targetFloor: 1,
  },

  // First Floor Circular Pillar matching blueprint (x: 42.0, z: 78.0)
  pillars: [
    { id: 'pillar_f1_south', x: 42.0, z: 78.0, radius: 0.95 }
  ],

  spawnZones: [
    {
      id: 'f1_zone_central',
      name: 'First Floor Central Corridor',
      center: { x: 36.0, z: 50.0 },
      triggerRadius: 18.0,
      radius: 6.0,
      allowedTypes: ['all'],
      minCount: 2,
      maxCount: 4,
      isActive: true,
      difficulty: 2,
    },
    {
      id: 'f1_zone_north',
      name: 'First Floor North Hall',
      center: { x: 60.0, z: 20.0 },
      triggerRadius: 16.0,
      radius: 5.0,
      allowedTypes: ['all'],
      minCount: 2,
      maxCount: 3,
      isActive: true,
      difficulty: 2,
    },
    {
      id: 'f1_zone_south',
      name: 'First Floor South Hall',
      center: { x: 65.0, z: 78.0 },
      triggerRadius: 16.0,
      radius: 5.0,
      allowedTypes: ['all'],
      minCount: 2,
      maxCount: 3,
      isActive: true,
      difficulty: 2,
    },
    {
      id: 'f1_zone_stair_atrium',
      name: 'Grand Staircase Atrium Patrol',
      center: { x: 75.0, z: 45.0 },
      triggerRadius: 18.0,
      radius: 6.0,
      allowedTypes: ['all'],
      minCount: 3,
      maxCount: 5,
      isActive: true,
      difficulty: 3,
    },
    {
      id: 'f1_zone_west',
      name: 'First Floor West Wing',
      center: { x: 20.0, z: 65.0 },
      triggerRadius: 15.0,
      radius: 4.0,
      allowedTypes: ['all'],
      minCount: 2,
      maxCount: 3,
      isActive: true,
      difficulty: 2,
    }
  ],

  lasers: []
};
