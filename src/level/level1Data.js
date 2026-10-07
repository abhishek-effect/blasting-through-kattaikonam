/**
 * Level 1 Data Definition - Ground Floor Campus Blueprint
 * Accurately models images/ground-floor-plan.png in 3D:
 * - Spawn Lobby (bottom center)
 * - Library (bottom right)
 * - Blocked Stairs (bottom left & top left)
 * - West Wing: Open Room, Elevator, Infirmary
 * - Central Atrium with distinct Black Tiles ("black tiles here")
 * - North Wing: Physics Lab (PHY LAB), Faculty Locked Archives
 * - Seminar Hall ("LOCKED BEFORE KILLING 20 ENEMIES") & Stage
 * - Strategic shin-height laser obstacles requiring jump
 */

export const level1Data = {
  id: 1,
  name: 'Ground Floor Campus - Main Blueprint',
  ceilingHeight: 3.6,
  playerStart: { x: 0, y: 1.65, z: 15, yaw: 0 },

  // Footprint bounding box for foundation base floor & ceiling
  bounds: {
    minX: -32,
    maxX: 32,
    minZ: -21,
    maxZ: 21,
  },

  // Rooms and Corridors matching ground-floor-plan.png
  rooms: [
    // 1. Spawn Lobby (Bottom Center)
    { id: 'spawn', name: 'Spawn Entrance Lobby', x: 0, z: 15, w: 12, l: 8 },

    // 2. Library (Bottom Right)
    { id: 'library', name: 'Campus Library', x: 18, z: 15, w: 20, l: 8 },

    // 3. Unusable Stairs (Bottom Left)
    { id: 'unusable_stairs_south', name: 'South Stairwell (Blocked)', x: -20, z: 15, w: 12, l: 8 },

    // 4. Open Room (West Lower)
    { id: 'open_room', name: 'Open Study Classroom', x: -22, z: 5, w: 12, l: 8 },

    // 5. Elevator Room (West Middle)
    { id: 'elevator_room', name: 'Campus Elevator Lobby', x: -22, z: -2.5, w: 12, l: 7 },

    // 6. Infirmary (West Upper)
    { id: 'infirmary', name: 'School Infirmary & Medical', x: -22, z: -9.5, w: 12, l: 7 },

    // 7. North Unusable Stairs & Locked Door (Top Left)
    { id: 'locked_stairs_north', name: 'North Stairwell & Locked Exit', x: -20, z: -17, w: 14, l: 6 },

    // 8. Physics Lab (PHY LAB - Top Center)
    { id: 'phy_lab', name: 'Physics Laboratory', x: 0, z: -17, w: 20, l: 6 },

    // 9. Faculty Locked Archives (Top Right)
    { id: 'locked_room_north', name: 'Faculty Archives (Locked)', x: 18, z: -17, w: 14, l: 6 },

    // 10. Central Hall with Black Tiles ("black tiles here"!)
    { id: 'central_atrium', name: 'Central Atrium (Black Tiles)', x: -7, z: 0, w: 14, l: 14, hasBlackTiles: true },

    // 11. Seminar Hall ("LOCKED BEFORE KILLING 20 ENEMIES")
    { id: 'seminar_hall', name: 'Seminar Hall (Grand Auditorium)', x: 10, z: 0, w: 16, l: 14, requiresKills: 20 },

    // 12. Seminar Stage (East Wing Annex)
    { id: 'seminar_stage', name: 'Seminar Hall Stage & Backstage', x: 23, z: 0, w: 10, l: 14 },

    // 13. Connecting Corridors
    { id: 'corridor_south', name: 'South Corridor', x: 0, z: 9.5, w: 36, l: 3 },
    { id: 'corridor_west', name: 'West Wing Corridor', x: -15, z: 0, w: 4, l: 18 },
    { id: 'corridor_north', name: 'North Wing Corridor', x: 0, z: -10.5, w: 38, l: 5 },
  ],

  // Doorways connecting corridors and rooms
  doorways: [
    { id: 'd_spawn', x: 0, z: 11, w: 4.5, dir: 'z', label: 'SOUTH HALL' },
    { id: 'd_library', x: 12, z: 11, w: 4.0, dir: 'z', label: 'LIBRARY' },
    { id: 'd_unusable_stairs', x: -16, z: 11, w: 3.0, dir: 'z', label: 'BLOCKED STAIRS' },
    { id: 'd_open_room', x: -16, z: 5, w: 3.5, dir: 'x', label: 'OPEN ROOM' },
    { id: 'd_elevator', x: -16, z: -2.5, w: 4.0, dir: 'x', label: 'ELEVATOR' },
    { id: 'd_infirmary', x: -16, z: -9.5, w: 3.5, dir: 'x', label: 'INFIRMARY' },
    { id: 'd_stairs_north', x: -15, z: -14, w: 3.0, dir: 'z', label: 'NORTH STAIRS' },
    { id: 'd_phy_lab', x: 0, z: -14, w: 4.5, dir: 'z', label: 'PHY LAB' },
    { id: 'd_locked_room', x: 15, z: -14, w: 3.5, dir: 'z', label: 'LOCKED ROOM' },
    { id: 'd_atrium_south', x: -7, z: 7, w: 4.5, dir: 'z', label: 'ATRIUM' },
    { id: 'd_atrium_north', x: -7, z: -7, w: 4.5, dir: 'z', label: 'NORTH CORRIDOR' },
    { id: 'd_atrium_west', x: -14, z: 0, w: 4.0, dir: 'x', label: 'WEST CORRIDOR' },
    { id: 'd_seminar_gate', x: 2, z: 0, w: 4.0, dir: 'x', label: 'SEMINAR HALL (20 KILLS)' },
    { id: 'd_seminar_stage', x: 18, z: 0, w: 5.0, dir: 'x', label: 'STAGE' },
  ],

  // Main Campus Elevator located on the west wall of the Elevator Lobby
  elevator: {
    id: 'floor1_elevator',
    name: 'Campus Elevator',
    x: -25.5,
    z: -2.5,
    w: 4.0,
    l: 3.2,
    interactionRadius: 3.2,
    currentFloor: 1,
    targetFloor: 2,
  },

  // Predefined Enemy Spawn Zones (balanced for PC and Phone)
  spawnZones: [
    // 1. South Corridor & Spawn area (Early: 1-2 enemies)
    {
      id: 'zone_south_spawn',
      name: 'South Corridor Zone',
      center: { x: 0, z: 9.5 },
      radius: 4.0,
      allowedTypes: ['all'],
      minCount: 1,
      maxCount: 2,
      isActive: true,
      difficulty: 1,
    },

    // 2. Library (Middle: 2-3 enemies)
    {
      id: 'zone_library',
      name: 'Library Zone',
      center: { x: 18, z: 15 },
      radius: 5.0,
      allowedTypes: ['all'],
      minCount: 2,
      maxCount: 3,
      isActive: true,
      difficulty: 2,
    },

    // 3. West Wing & Infirmary (Middle: 2-3 enemies)
    {
      id: 'zone_west_hall',
      name: 'West Wing Zone',
      center: { x: -16, z: 0 },
      radius: 5.0,
      allowedTypes: ['all'],
      minCount: 2,
      maxCount: 3,
      isActive: true,
      difficulty: 2,
    },

    // 4. Central Black-Tile Atrium (Middle: 2-4 enemies)
    {
      id: 'zone_atrium',
      name: 'Central Atrium Zone',
      center: { x: -7, z: 0 },
      radius: 4.5,
      allowedTypes: ['all'],
      minCount: 2,
      maxCount: 4,
      isActive: true,
      difficulty: 3,
    },

    // 5. Physics Lab & North Corridor (Late: 2-3 enemies)
    {
      id: 'zone_phy_lab',
      name: 'Physics Lab Zone',
      center: { x: 0, z: -15 },
      radius: 4.5,
      allowedTypes: ['all'],
      minCount: 2,
      maxCount: 3,
      isActive: true,
      difficulty: 3,
    },

    // 6. Seminar Hall & Stage (Late: 3-5 enemies)
    {
      id: 'zone_seminar',
      name: 'Seminar Hall Zone',
      center: { x: 14, z: 0 },
      radius: 6.0,
      allowedTypes: ['all'],
      minCount: 3,
      maxCount: 5,
      isActive: true,
      difficulty: 4,
    },
  ],

  // Laser obstacles spanning corridors (shin height = 0.40m, jump to clear)
  lasers: [
    // 1. South Corridor Exit from Spawn
    { id: 'laser_spawn_gate', x1: -4.5, z1: 11.0, x2: 4.5, z2: 11.0, y: 0.40, damage: 15 },

    // 2. West Wing Corridor approaching Elevator
    { id: 'laser_elevator_approach', x1: -16.5, z1: -2.5, x2: -13.5, z2: -2.5, y: 0.40, damage: 15 },

    // 3. Central Atrium spanning Black Tiles
    { id: 'laser_atrium_center', x1: -13.5, z1: 0.0, x2: -0.5, z2: 0.0, y: 0.40, damage: 15 },

    // 4. North Corridor outside Physics Lab
    { id: 'laser_phy_lab', x1: -4.0, z1: -12.5, x2: 4.0, z2: -12.5, y: 0.40, damage: 15 },

    // 5. South Corridor approach to Library
    { id: 'laser_library', x1: 9.0, z1: 8.5, x2: 9.0, z2: 11.5, y: 0.40, damage: 15 },
  ],
};
