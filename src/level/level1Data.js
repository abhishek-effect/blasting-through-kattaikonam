/**
 * Level 1 Data Definition - Ground Floor Campus Blueprint
 * Calibrated to ground-floor-newer-plan and images/mappu.obj:
 * - Dimensions: 100m x 100m footprint, ceiling height 5m
 * - Player Start: (34.0, 1.65, 93.0) in the South Spawn area
 * - Black Tiles Area: X: 22..40, Z: 28..71
 * - Rooms: Infirmary, Elevator Lobby, Computer Lab, Bio Lab, Board Room, Library,
 *          Physics Lab, Locked Room, Unlockable Room, Seminar Hall & Stage
 * - Proximity-triggered enemy spawn zones across all campus wings
 */

export const level1Data = {
  id: 1,
  name: 'Ground Floor Campus - Expanded Blueprint',
  ceilingHeight: 5.0,
  playerStart: { x: 34.0, y: 1.65, z: 93.0, yaw: 0 },

  // Footprint bounding box matching mappu.obj
  bounds: {
    minX: 0,
    maxX: 100,
    minZ: 0,
    maxZ: 100,
  },

  // Rooms definition matching newer ground floor plan
  rooms: [
    { id: 'spawn_lobby', name: 'South Entrance Hall (Spawn)', x: 34, z: 92.5, w: 20, l: 15 },
    { id: 'board_room', name: 'Board Room', x: 55, z: 92.5, w: 18, l: 15 },
    { id: 'library', name: 'Campus Library', x: 83, z: 91.5, w: 34, l: 17 },
    { id: 'unusable_stairs_sw', name: 'South Stairwell (Blocked)', x: 10, z: 93, w: 20, l: 14 },
    { id: 'infirmary', name: 'School Infirmary', x: 7, z: 22, w: 14, l: 12 },
    { id: 'elevator_room', name: 'Campus Elevator Lobby', x: 7, z: 39, w: 14, l: 14 },
    { id: 'computer_lab', name: 'Computer Lab', x: 7, z: 57, w: 14, l: 14 },
    { id: 'bio_lab', name: 'Bio Lab', x: 7, z: 75, w: 14, l: 14 },
    { id: 'central_atrium', name: 'Central Hall (Black Tiles)', x: 31, z: 49.5, w: 18, l: 43, hasBlackTiles: true },
    { id: 'phy_lab', name: 'Physics Laboratory', x: 48.5, z: 7, w: 27, l: 14 },
    { id: 'locked_room', name: 'Faculty Archives (Locked)', x: 72.5, z: 7, w: 15, l: 14 },
    { id: 'unlockable_room', name: 'Unlockable Room', x: 91.5, z: 7, w: 17, l: 14 },
    { id: 'seminar_hall', name: 'Seminar Hall (Auditorium & Stage)', x: 77.5, z: 46.5, w: 45, l: 39, requiresKills: 20 },
  ],

  // Doorways connecting rooms
  doorways: [
    { id: 'd_infirmary', x: 14, z: 22, w: 4.0, dir: 'z', label: 'INFIRMARY' },
    { id: 'd_elevator', x: 14, z: 39, w: 4.0, dir: 'z', label: 'ELEVATOR LOBBY' },
    { id: 'd_computer_lab', x: 14, z: 57, w: 4.0, dir: 'z', label: 'COMPUTER LAB' },
    { id: 'd_bio_lab', x: 14, z: 75, w: 4.0, dir: 'z', label: 'BIO LAB' },
    { id: 'd_unusable_stairs_sw', x: 20, z: 91, w: 4.0, dir: 'z', label: 'STAIRS' },
    { id: 'd_nw_lock', x: 6, z: 10, w: 4.0, dir: 'x', label: 'DOOR LOCKED' },
    { id: 'd_nw_stairs', x: 24, z: 10, w: 4.0, dir: 'x', label: 'STAIRS' },
    { id: 'd_phy_lab', x: 48, z: 14, w: 4.0, dir: 'x', label: 'PHY LAB' },
    { id: 'd_locked_room', x: 72, z: 14, w: 4.0, dir: 'x', label: 'LOCKED ROOM' },
    { id: 'd_unlockable_room', x: 90, z: 14, w: 4.0, dir: 'x', label: 'UNLOCKABLE ROOM' },
    { id: 'd_board_room', x: 55, z: 85, w: 4.0, dir: 'x', label: 'BOARD ROOM' },
    { id: 'd_library', x: 80, z: 83, w: 4.0, dir: 'x', label: 'LIBRARY' },
    { id: 'd_seminar_gate', x: 55, z: 45.5, w: 5.0, dir: 'z', label: 'SEMINAR HALL (20 KILLS)', requiresKills: 20 },
  ],

  // Main Campus Elevator located on the west wall inside Elevator Lobby (x: 6.0, z: 39.0)
  elevator: {
    id: 'floor1_elevator',
    name: 'Campus Elevator',
    x: 6.0,
    z: 39.0,
    w: 3.5,
    l: 3.0,
    interactionRadius: 3.5,
    currentFloor: 1,
    targetFloor: 2,
  },

  // Proximity-triggered Enemy Spawn Zones
  spawnZones: [
    // 1. South Hall Approach
    {
      id: 'zone_south_hall',
      name: 'South Hall Patrol',
      center: { x: 38.0, z: 76.0 },
      triggerRadius: 16.0,
      radius: 4.0,
      allowedTypes: ['all'],
      minCount: 1,
      maxCount: 2,
      isActive: true,
      difficulty: 1,
    },

    // 2. Central Black-Tile Hall & Pillars
    {
      id: 'zone_atrium',
      name: 'Central Hall Patrol',
      center: { x: 31.0, z: 48.0 },
      triggerRadius: 18.0,
      radius: 5.0,
      allowedTypes: ['all'],
      minCount: 2,
      maxCount: 3,
      isActive: true,
      difficulty: 2,
    },

    // 3. Board Room (South Center)
    {
      id: 'zone_board_room',
      name: 'Board Room Meeting',
      center: { x: 55.0, z: 92.5 },
      triggerRadius: 15.0,
      radius: 4.0,
      allowedTypes: ['all'],
      minCount: 1,
      maxCount: 2,
      isActive: true,
      difficulty: 2,
    },

    // 4. Library (South East)
    {
      id: 'zone_library',
      name: 'Library Guards',
      center: { x: 82.0, z: 91.5 },
      triggerRadius: 16.0,
      radius: 5.0,
      allowedTypes: ['all'],
      minCount: 2,
      maxCount: 3,
      isActive: true,
      difficulty: 2,
    },

    // 5. Infirmary (West Upper)
    {
      id: 'zone_infirmary',
      name: 'Infirmary Guard',
      center: { x: 7.0, z: 22.0 },
      triggerRadius: 14.0,
      radius: 3.0,
      allowedTypes: ['all'],
      minCount: 1,
      maxCount: 2,
      isActive: true,
      difficulty: 2,
    },

    // 6. Computer Lab (West Middle)
    {
      id: 'zone_computer_lab',
      name: 'Computer Lab Techs',
      center: { x: 7.0, z: 57.0 },
      triggerRadius: 14.0,
      radius: 3.5,
      allowedTypes: ['all'],
      minCount: 1,
      maxCount: 2,
      isActive: true,
      difficulty: 2,
    },

    // 7. Bio Lab (West Lower)
    {
      id: 'zone_bio_lab',
      name: 'Bio Lab Researchers',
      center: { x: 7.0, z: 75.0 },
      triggerRadius: 14.0,
      radius: 3.5,
      allowedTypes: ['all'],
      minCount: 1,
      maxCount: 2,
      isActive: true,
      difficulty: 2,
    },

    // 8. Physics Lab (North Center)
    {
      id: 'zone_phy_lab',
      name: 'Physics Lab Researchers',
      center: { x: 48.5, z: 7.0 },
      triggerRadius: 15.0,
      radius: 4.0,
      allowedTypes: ['all'],
      minCount: 2,
      maxCount: 3,
      isActive: true,
      difficulty: 3,
    },

    // 9. Faculty Archives (North East)
    {
      id: 'zone_locked_room',
      name: 'Archive Sentries',
      center: { x: 72.5, z: 7.0 },
      triggerRadius: 14.0,
      radius: 3.5,
      allowedTypes: ['all'],
      minCount: 1,
      maxCount: 2,
      isActive: true,
      difficulty: 3,
    },

    // 10. Unlockable Room (North East Corner)
    {
      id: 'zone_unlockable_room',
      name: 'Secret Chamber Guardians',
      center: { x: 91.5, z: 7.0 },
      triggerRadius: 14.0,
      radius: 3.5,
      allowedTypes: ['all'],
      minCount: 1,
      maxCount: 2,
      isActive: true,
      difficulty: 3,
    },

    // 11. Seminar Hall Grand Auditorium
    {
      id: 'zone_seminar',
      name: 'Seminar Hall Audience',
      center: { x: 75.0, z: 46.5 },
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
    { id: 'laser_central_approach', x1: 25.0, z1: 72.0, x2: 45.0, z2: 72.0, y: 0.40, damage: 15 },

    // 2. North Corridor approach
    { id: 'laser_north_corridor', x1: 35.0, z1: 20.0, x2: 55.0, z2: 20.0, y: 0.40, damage: 15 },

    // 3. Central corridor between pillars and seminar hall
    { id: 'laser_hall_cross', x1: 42.0, z1: 45.0, x2: 53.0, z2: 45.0, y: 0.40, damage: 15 },
  ],
};
