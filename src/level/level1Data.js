/**
 * Level 1 Data Definition
 * Seamless, deterministic layout connecting all corridors and rooms with zero gaps.
 * Elevator is placed inside the East Wing Alcove, fully accessible.
 */

export const level1Data = {
  id: 1,
  name: 'Floor 1 - High School Main Campus',
  ceilingHeight: 3.6,
  playerStart: { x: 0, y: 1.65, z: 21, yaw: 0 },

  // Footprint bounding box for continuous foundation floor & ceiling
  bounds: {
    minX: -36,
    maxX: 36,
    minZ: -52,
    maxZ: 28
  },

  // Rooms and Corridors (all sharing exact adjacent boundaries)
  rooms: [
    // 1. Entrance Lobby (Starting Area)
    // X: [-8, 8], Z: [8, 24]
    { id: 'lobby', name: 'Main Entrance & Lobby', x: 0, z: 16, w: 16, l: 16 },

    // 2. Central Corridor (Main Spine)
    // X: [-3, 3], Z: [-20, 8] - connects directly to Lobby at Z=8 and Assembly Arena at Z=-20
    { id: 'corridor_central', name: 'Central Spine Hallway', x: 0, z: -6, w: 6, l: 28 },

    // 3. West Wing Cross-Hallway
    // X: [-24, -3], Z: [-3, 3] - connects directly to Central Corridor at X=-3
    { id: 'corridor_west', name: 'West Wing Corridor', x: -13.5, z: 0, w: 21, l: 6 },

    // 4. Classroom 101 (North of West Wing)
    // X: [-18, -8], Z: [3, 15] - connects to West Wing at Z=3
    { id: 'classroom_101', name: 'Classroom 101', x: -13, z: 9, w: 10, l: 12 },

    // 5. Science Lab 102 (South of West Wing)
    // X: [-18, -8], Z: [-15, -3] - connects to West Wing at Z=-3
    { id: 'classroom_102', name: 'Science Laboratory', x: -13, z: -9, w: 10, l: 12 },

    // 6. West Dead End (Maintenance Storage)
    // X: [-30, -24], Z: [-3, 3] - connects to West Wing at X=-24
    { id: 'dead_end_west', name: 'Maintenance Closet (Dead End)', x: -27, z: 0, w: 6, l: 6 },

    // 7. East Wing Cross-Hallway
    // X: [3, 24], Z: [-11, -5] - connects directly to Central Corridor at X=3
    { id: 'corridor_east', name: 'East Wing Corridor', x: 13.5, z: -8, w: 21, l: 6 },

    // 8. Staff Faculty Office (North of East Wing)
    // X: [8, 18], Z: [-5, 7] - connects to East Wing at Z=-5
    { id: 'staff_office', name: 'Staff Faculty Office', x: 13, z: 1, w: 10, l: 12 },

    // 9. East Dead End (Storage Archives)
    // X: [24, 30], Z: [-11, -5] - connects to East Wing at X=24
    { id: 'dead_end_east', name: 'Storage Archives (Dead End)', x: 27, z: -8, w: 6, l: 6 },

    // 10. Elevator Alcove / Lobby (South of East Wing)
    // X: [9, 17], Z: [-18, -11] - connects directly to East Wing at Z=-11!
    { id: 'elevator_alcove', name: 'Elevator Lobby', x: 13, z: -14.5, w: 8, l: 7 },

    // 11. Assembly Hall / Future Boss Arena
    // X: [-12, 12], Z: [-48, -20] - connects directly to Central Corridor at Z=-20!
    { id: 'arena_assembly', name: 'Assembly Hall (Boss Arena)', x: 0, z: -34, w: 24, l: 28 }
  ],

  // Passages / Doorways with labels and widths
  doorways: [
    { id: 'd_lobby_central', x: 0, z: 8, w: 4.0, dir: 'z', label: 'CENTRAL HALL' },
    { id: 'd_central_west', x: -3, z: 0, w: 4.0, dir: 'x', label: 'WEST WING' },
    { id: 'd_central_east', x: 3, z: -8, w: 4.0, dir: 'x', label: 'EAST WING' },
    { id: 'd_class101', x: -13, z: 3, w: 2.4, dir: 'z', label: 'CLASS 101' },
    { id: 'd_class102', x: -13, z: -3, w: 2.4, dir: 'z', label: 'SCIENCE LAB' },
    { id: 'd_staff', x: 13, z: -5, w: 2.4, dir: 'z', label: 'STAFF ROOM' },
    { id: 'd_elevator', x: 13, z: -11, w: 4.5, dir: 'z', label: 'ELEVATOR' },
    { id: 'd_arena', x: 0, z: -20, w: 5.0, dir: 'z', label: 'ASSEMBLY' },
  ],

  // Elevator placed at the south wall of the Elevator Alcove
  elevator: {
    id: 'floor1_elevator',
    name: 'Main Campus Elevator',
    x: 13,
    z: -17.5,
    w: 4.2,
    l: 3.0,
    interactionRadius: 3.2,
    currentFloor: 1,
    targetFloor: 2
  },

  // Predefined enemy spawn zones (instance-based)
  spawnZones: [
    // 1. Early: Lobby (1-2 enemies)
    {
      id: 'zone_lobby',
      name: 'Lobby Zone',
      center: { x: 0, z: 12 },
      radius: 2.5,
      allowedTypes: ['all'],
      minCount: 1,
      maxCount: 2,
      isActive: true,
      difficulty: 1
    },

    // 2. Middle: Central Corridor (2-3 enemies)
    {
      id: 'zone_central',
      name: 'Central Corridor Zone',
      center: { x: 0, z: -6 },
      radius: 5.0,
      allowedTypes: ['all'],
      minCount: 2,
      maxCount: 3,
      isActive: true,
      difficulty: 2
    },

    // 3. Middle: West Wing & Classrooms (2-3 enemies)
    {
      id: 'zone_west_wing',
      name: 'West Wing Zone',
      center: { x: -13, z: 0 },
      radius: 5.0,
      allowedTypes: ['all'],
      minCount: 2,
      maxCount: 3,
      isActive: true,
      difficulty: 2
    },

    // 4. Middle: Staff Office (1-2 enemies)
    {
      id: 'zone_staff',
      name: 'Staff Office Zone',
      center: { x: 13, z: 1 },
      radius: 3.5,
      allowedTypes: ['all'],
      minCount: 1,
      maxCount: 2,
      isActive: true,
      difficulty: 2
    },

    // 5. Late: East Wing near Elevator (2-4 enemies)
    {
      id: 'zone_east_elevator',
      name: 'East Wing & Elevator Zone',
      center: { x: 13, z: -9 },
      radius: 4.0,
      allowedTypes: ['all'],
      minCount: 2,
      maxCount: 4,
      isActive: true,
      difficulty: 3
    },

    // 6. Boss Arena (0 normal enemies for now)
    {
      id: 'zone_boss_arena',
      name: 'Assembly Hall Arena',
      center: { x: 0, z: -34 },
      radius: 8.0,
      allowedTypes: [],
      minCount: 0,
      maxCount: 0,
      isActive: false,
      difficulty: 5
    }
  ]
};
