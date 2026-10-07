/**
 * Level 1 Data Definition - mappu.obj Campus Map
 * Directly calibrated to images/mappu.obj and images/mappu.mtl:
 * - Dimensions: 100m x 100m footprint, ceiling height 5m
 * - Player Start: (37.5, 1.65, 90.0) on the floor, zero wall/ceiling clipping
 * - Black Tiles Area: X: 20..38, Z: 25..65
 * - Rooms: Physics Lab, Seminar Hall (Locked until 20 kills), Library, Infirmary, Elevator, Open Room, Locked Archives
 * - Proximity-triggered enemy spawn zones: enemies only spawn when player approaches their area!
 */

export const level1Data = {
  id: 1,
  name: 'Ground Floor Campus - Mappu 3D Blueprint',
  ceilingHeight: 5.0,
  playerStart: { x: 37.5, y: 1.65, z: 90.0, yaw: 0 },

  // Footprint bounding box matching mappu.obj
  bounds: {
    minX: 0,
    maxX: 100,
    minZ: 0,
    maxZ: 100,
  },

  // Rooms definition matching mappu.obj coordinates
  rooms: [
    { id: 'spawn_lobby', name: 'South Entrance Hall', x: 37.5, z: 85, w: 35, l: 30 },
    { id: 'library', name: 'Campus Library', x: 70, z: 92.5, w: 30, l: 15 },
    { id: 'unusable_stairs_south', name: 'South Stairwell (Blocked)', x: 10, z: 90, w: 20, l: 10 },
    { id: 'infirmary', name: 'School Infirmary', x: 6, z: 20, w: 12, l: 10 },
    { id: 'elevator_room', name: 'Campus Elevator Lobby', x: 6, z: 35, w: 12, l: 10 },
    { id: 'open_room', name: 'Open Study Classroom', x: 6, z: 52.5, w: 12, l: 15 },
    { id: 'central_atrium', name: 'Central Hall (Black Tiles)', x: 29, z: 45, w: 18, l: 40, hasBlackTiles: true },
    { id: 'phy_lab', name: 'Physics Laboratory', x: 47.5, z: 5, w: 25, l: 10 },
    { id: 'locked_archives', name: 'Faculty Archives', x: 72.5, z: 5, w: 15, l: 10 },
    { id: 'seminar_hall', name: 'Seminar Hall (Auditorium)', x: 77.5, z: 42.5, w: 45, l: 35, requiresKills: 20 },
  ],

  // Doorways connecting rooms in mappu.obj
  doorways: [
    { id: 'd_phy_lab', x: 46.5, z: 10, w: 3.0, dir: 'z', label: 'PHY LAB' },
    { id: 'd_seminar_gate', x: 55, z: 42.5, w: 5.0, dir: 'x', label: 'SEMINAR HALL (20 KILLS)', requiresKills: 20 },
    { id: 'd_library', x: 67.5, z: 85, w: 5.0, dir: 'z', label: 'LIBRARY' },
    { id: 'd_infirmary', x: 12, z: 19.5, w: 3.0, dir: 'x', label: 'INFIRMARY' },
    { id: 'd_elevator', x: 12, z: 35.5, w: 3.0, dir: 'x', label: 'ELEVATOR' },
    { id: 'd_open_room', x: 12, z: 51.5, w: 3.0, dir: 'x', label: 'OPEN ROOM' },
    { id: 'd_locked_room', x: 71.5, z: 10, w: 3.0, dir: 'z', label: 'LOCKED ARCHIVES' },
    { id: 'd_unusable_stairs', x: 20, z: 89.5, w: 3.0, dir: 'x', label: 'BLOCKED STAIRS' },
  ],

  // Main Campus Elevator located on the west wall inside Elevator Lobby (x: 6.0, z: 35.5)
  elevator: {
    id: 'floor1_elevator',
    name: 'Campus Elevator',
    x: 6.0,
    z: 35.5,
    w: 3.5,
    l: 3.0,
    interactionRadius: 3.5,
    currentFloor: 1,
    targetFloor: 2,
  },

  // Proximity-triggered Enemy Spawn Zones
  // Enemies DO NOT spawn until the player comes within triggerRadius!
  spawnZones: [
    // 1. South Hall Approach (triggers as player moves forward from spawn)
    {
      id: 'zone_south_hall',
      name: 'South Hall Patrol',
      center: { x: 37.5, z: 75.0 },
      triggerRadius: 16.0,
      radius: 4.0,
      allowedTypes: ['all'],
      minCount: 1,
      maxCount: 2,
      isActive: true,
      difficulty: 1,
    },

    // 2. Central Black-Tile Hall
    {
      id: 'zone_atrium',
      name: 'Central Hall Patrol',
      center: { x: 29.0, z: 45.0 },
      triggerRadius: 18.0,
      radius: 5.0,
      allowedTypes: ['all'],
      minCount: 2,
      maxCount: 3,
      isActive: true,
      difficulty: 2,
    },

    // 3. Library (Bottom Right)
    {
      id: 'zone_library',
      name: 'Library Guards',
      center: { x: 70.0, z: 92.5 },
      triggerRadius: 16.0,
      radius: 5.0,
      allowedTypes: ['all'],
      minCount: 2,
      maxCount: 3,
      isActive: true,
      difficulty: 2,
    },

    // 4. Infirmary (West Upper)
    {
      id: 'zone_infirmary',
      name: 'Infirmary Guard',
      center: { x: 6.0, z: 20.0 },
      triggerRadius: 14.0,
      radius: 3.0,
      allowedTypes: ['all'],
      minCount: 1,
      maxCount: 2,
      isActive: true,
      difficulty: 2,
    },

    // 5. Open Classroom (West Middle)
    {
      id: 'zone_open_room',
      name: 'Classroom Patrol',
      center: { x: 6.0, z: 52.0 },
      triggerRadius: 14.0,
      radius: 3.5,
      allowedTypes: ['all'],
      minCount: 1,
      maxCount: 2,
      isActive: true,
      difficulty: 2,
    },

    // 6. Physics Lab (North Center)
    {
      id: 'zone_phy_lab',
      name: 'Physics Lab Researchers',
      center: { x: 47.5, z: 5.0 },
      triggerRadius: 15.0,
      radius: 4.0,
      allowedTypes: ['all'],
      minCount: 2,
      maxCount: 3,
      isActive: true,
      difficulty: 3,
    },

    // 7. Locked Archives (North East)
    {
      id: 'zone_locked_room',
      name: 'Archive Sentries',
      center: { x: 72.5, z: 5.0 },
      triggerRadius: 14.0,
      radius: 3.5,
      allowedTypes: ['all'],
      minCount: 1,
      maxCount: 2,
      isActive: true,
      difficulty: 3,
    },

    // 8. Seminar Hall Grand Auditorium (Right Wing)
    {
      id: 'zone_seminar',
      name: 'Seminar Hall Audience',
      center: { x: 75.0, z: 42.5 },
      triggerRadius: 18.0,
      radius: 7.0,
      allowedTypes: ['all'],
      minCount: 3,
      maxCount: 5,
      isActive: true,
      difficulty: 4,
    },
  ],

  // Laser obstacle traps spanning hallways (shin height = 0.40m, jump to clear)
  lasers: [
    // 1. South Corridor approach to Central Hall
    { id: 'laser_central_approach', x1: 25.0, z1: 68.0, x2: 45.0, z2: 68.0, y: 0.40, damage: 15 },

    // 2. Elevator approach doorway
    { id: 'laser_elevator', x1: 12.0, z1: 34.0, x2: 12.0, z2: 37.0, y: 0.40, damage: 15 },

    // 3. Physics Lab doorway
    { id: 'laser_phy_lab', x1: 45.0, z1: 10.0, x2: 48.0, z2: 10.0, y: 0.40, damage: 15 },

    // 4. Library entrance doorway
    { id: 'laser_library', x1: 65.0, z1: 85.0, x2: 70.0, z2: 85.0, y: 0.40, damage: 15 },

    // 5. Infirmary entrance doorway
    { id: 'laser_infirmary', x1: 12.0, z1: 18.0, x2: 12.0, z2: 21.0, y: 0.40, damage: 15 },
  ],
};
