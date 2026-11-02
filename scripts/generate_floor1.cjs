const fs = require('fs');
const path = require('path');

// Wall builder helper for OBJ format (floor to ceiling)
function buildWallQuad(x1, z1, x2, z2, h = 5.0) {
  return [
    `v ${x1} 0.0 ${z1}`,
    `v ${x2} 0.0 ${z2}`,
    `v ${x2} ${h.toFixed(1)} ${z2}`,
    `v ${x1} ${h.toFixed(1)} ${z1}`,
    `f -4 -3 -2 -1\n`
  ].join('\n');
}

// Wall header / lintel builder helper (from top of door 3.5m to ceiling 5.0m)
// This guarantees room signs like "CLASS 11A" never float in mid-air
function buildLintelQuad(x1, z1, x2, z2, y1 = 3.5, y2 = 5.0) {
  return [
    `v ${x1} ${y1.toFixed(2)} ${z1}`,
    `v ${x2} ${y1.toFixed(2)} ${z2}`,
    `v ${x2} ${y2.toFixed(2)} ${z2}`,
    `v ${x1} ${y2.toFixed(2)} ${z1}`,
    `f -4 -3 -2 -1\n`
  ].join('\n');
}

let objLines = [
  '# floor-1.obj - First Floor Campus Blueprint Architecture',
  'mtllib floor-1.mtl\n',
  '# --- FLOORS & CEILINGS ---',
  'usemtl white_tiles',
  '# Main Floor',
  'v 0 0 100',
  'v 100 0 100',
  'v 100 0 0',
  'v 0 0 0',
  'f -4 -3 -2 -1\n',
  'usemtl black_solid',
  '# Black Tiles Area',
  'v 28 0.01 70',
  'v 44 0.01 70',
  'v 44 0.01 28',
  'v 28 0.01 28',
  'f -4 -3 -2 -1\n',
  'usemtl ceiling',
  '# Ceiling (Height = 5)',
  'v 0 5 0',
  'v 100 5 0',
  'v 100 5 100',
  'v 0 5 100',
  'f -4 -3 -2 -1\n',
  '# --- BOUNDARY WALLS ---',
  'usemtl boundary_wall',
  '# North Boundary',
  buildWallQuad(0, 0, 100, 0),
  '# South Boundary',
  buildWallQuad(100, 100, 0, 100),
  '# East Boundary',
  buildWallQuad(100, 0, 100, 100),
  '# West Boundary',
  buildWallQuad(0, 100, 0, 0),
  '# --- INTERNAL ROOM WALLS ---'
];

// Walls definition array for both OBJ and collision Box3s
// User Requirement: "there should not be walls or doors surrounding steps, they should only be there for rooms"
const firstFloorWalls = [
  // North Wing (Z: 0 to 14)
  // staff_room (X: 38 to 52, Z: 0 to 14) - Door at X: 43..47
  { id: 'f1_staff_w', x1: 38, z1: 0, x2: 38, z2: 14 },
  { id: 'f1_staff_e', x1: 52, z1: 0, x2: 52, z2: 14 },
  { id: 'f1_staff_s1', x1: 38, z1: 14, x2: 43, z2: 14 },
  { id: 'f1_staff_s2', x1: 47, z1: 14, x2: 52, z2: 14 },

  // 12A (X: 56 to 68, Z: 0 to 14) - Door at X: 60..64
  { id: 'f1_12a_w', x1: 56, z1: 0, x2: 56, z2: 14 },
  { id: 'f1_12a_e', x1: 68, z1: 0, x2: 68, z2: 14 },
  { id: 'f1_12a_s1', x1: 56, z1: 14, x2: 60, z2: 14 },
  { id: 'f1_12a_s2', x1: 64, z1: 14, x2: 68, z2: 14 },

  // 12B (X: 71 to 83, Z: 0 to 14) - Door at X: 75..79
  { id: 'f1_12b_w', x1: 71, z1: 0, x2: 71, z2: 14 },
  { id: 'f1_12b_e', x1: 83, z1: 0, x2: 83, z2: 14 },
  { id: 'f1_12b_s1', x1: 71, z1: 14, x2: 75, z2: 14 },
  { id: 'f1_12b_s2', x1: 79, z1: 14, x2: 83, z2: 14 },

  // 12C (X: 86 to 100, Z: 0 to 14) - Door at X: 91..95
  { id: 'f1_12c_w', x1: 86, z1: 0, x2: 86, z2: 14 },
  { id: 'f1_12c_s1', x1: 86, z1: 14, x2: 91, z2: 14 },
  { id: 'f1_12c_s2', x1: 95, z1: 14, x2: 100, z2: 14 },

  // West Wing (X: 0 to 14)
  // elevator shaft room (X: 0 to 14, Z: 20 to 34) - Opening at Z: 25..29
  { id: 'f1_elev_n', x1: 0, z1: 20, x2: 14, z2: 20 },
  { id: 'f1_elev_s', x1: 0, z1: 34, x2: 14, z2: 34 },
  { id: 'f1_elev_e1', x1: 14, z1: 20, x2: 14, z2: 25 },
  { id: 'f1_elev_e2', x1: 14, z1: 29, x2: 14, z2: 34 },

  // 11A (X: 0 to 14, Z: 36 to 48) - Door at Z: 40..44
  { id: 'f1_11a_n', x1: 0, z1: 36, x2: 14, z2: 36 },
  { id: 'f1_11a_s', x1: 0, z1: 48, x2: 14, z2: 48 },
  { id: 'f1_11a_e1', x1: 14, z1: 36, x2: 14, z2: 40 },
  { id: 'f1_11a_e2', x1: 14, z1: 44, x2: 14, z2: 48 },

  // 11B (X: 0 to 14, Z: 51 to 63) - Door at Z: 55..59
  { id: 'f1_11b_n', x1: 0, z1: 51, x2: 14, z2: 51 },
  { id: 'f1_11b_s', x1: 0, z1: 63, x2: 14, z2: 63 },
  { id: 'f1_11b_e1', x1: 14, z1: 51, x2: 14, z2: 55 },
  { id: 'f1_11b_e2', x1: 14, z1: 59, x2: 14, z2: 63 },

  // 11C (X: 0 to 14, Z: 66 to 78) - Door at Z: 70..74
  { id: 'f1_11c_n', x1: 0, z1: 66, x2: 14, z2: 66 },
  { id: 'f1_11c_s', x1: 0, z1: 78, x2: 14, z2: 78 },
  { id: 'f1_11c_e1', x1: 14, z1: 66, x2: 14, z2: 70 },
  { id: 'f1_11c_e2', x1: 14, z1: 74, x2: 14, z2: 78 },

  // OPTION ROOM 1 (X: 0 to 14, Z: 81 to 97) - Door at Z: 87..91
  { id: 'f1_opt_n', x1: 0, z1: 81, x2: 14, z2: 81 },
  { id: 'f1_opt_s', x1: 0, z1: 97, x2: 14, z2: 97 },
  { id: 'f1_opt_e1', x1: 14, z1: 81, x2: 14, z2: 87 },
  { id: 'f1_opt_e2', x1: 14, z1: 91, x2: 14, z2: 97 },

  // South Wing (Z: 85 to 100)
  // 10A (X: 52 to 66, Z: 85 to 100) - Door at X: 57..61
  { id: 'f1_10a_w', x1: 52, z1: 85, x2: 52, z2: 100 },
  { id: 'f1_10a_e', x1: 66, z1: 85, x2: 66, z2: 100 },
  { id: 'f1_10a_n1', x1: 52, z1: 85, x2: 57, z2: 85 },
  { id: 'f1_10a_n2', x1: 61, z1: 85, x2: 66, z2: 85 },

  // 10B (X: 69 to 83, Z: 85 to 100) - Door at X: 74..78
  { id: 'f1_10b_w', x1: 69, z1: 85, x2: 69, z2: 100 },
  { id: 'f1_10b_e', x1: 83, z1: 85, x2: 83, z2: 100 },
  { id: 'f1_10b_n1', x1: 69, z1: 85, x2: 74, z2: 85 },
  { id: 'f1_10b_n2', x1: 78, z1: 85, x2: 83, z2: 85 },

  // 10C (X: 86 to 98, Z: 85 to 100) - Door at X: 90..94
  { id: 'f1_10c_w', x1: 86, z1: 85, x2: 86, z2: 100 },
  { id: 'f1_10c_e', x1: 98, z1: 85, x2: 98, z2: 100 },
  { id: 'f1_10c_n1', x1: 86, z1: 85, x2: 90, z2: 85 },
  { id: 'f1_10c_n2', x1: 94, z1: 85, x2: 98, z2: 85 },
];

for (const w of firstFloorWalls) {
  objLines.push(`# ${w.id}`);
  objLines.push(buildWallQuad(w.x1, w.z1, w.x2, w.z2));
}

// Doorway Lintels (from Y=3.5 to Y=5.0) - gives solid backing wall for room signboards
const doorwayLintels = [
  // North Doors
  { id: 'lintel_staff', x1: 43, z1: 14, x2: 47, z2: 14 },
  { id: 'lintel_12a', x1: 60, z1: 14, x2: 64, z2: 14 },
  { id: 'lintel_12b', x1: 75, z1: 14, x2: 79, z2: 14 },
  { id: 'lintel_12c', x1: 91, z1: 14, x2: 95, z2: 14 },

  // West Doors
  { id: 'lintel_elev', x1: 14, z1: 25, x2: 14, z2: 29 },
  { id: 'lintel_11a', x1: 14, z1: 40, x2: 14, z2: 44 },
  { id: 'lintel_11b', x1: 14, z1: 55, x2: 14, z2: 59 },
  { id: 'lintel_11c', x1: 14, z1: 70, x2: 14, z2: 74 },
  { id: 'lintel_opt', x1: 14, z1: 87, x2: 14, z2: 91 },

  // South Doors
  { id: 'lintel_10a', x1: 57, z1: 85, x2: 61, z2: 85 },
  { id: 'lintel_10b', x1: 74, z1: 85, x2: 78, z2: 85 },
  { id: 'lintel_10c', x1: 90, z1: 85, x2: 94, z2: 85 },
];

objLines.push('# --- DOORWAY LINTELS (WALLS ABOVE 3.5m) ---');
for (const l of doorwayLintels) {
  objLines.push(`# ${l.id}`);
  objLines.push(buildLintelQuad(l.x1, l.z1, l.x2, l.z2));
}

const finalObj = objLines.join('\n');
const finalMtl = `# floor-1.mtl - Material Definitions for First Floor Campus

newmtl black_solid
Kd 0.05 0.05 0.05

newmtl white_tiles
Kd 0.95 0.95 0.95

newmtl boundary_wall
Kd 0.980 0.902 0.906

newmtl ceiling
Kd 1.0 1.0 1.0
`;

['images', 'public/images'].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'floor-1.obj'), finalObj);
  fs.writeFileSync(path.join(dir, 'floor-1.mtl'), finalMtl);
});

console.log('Successfully generated floor-1.obj and floor-1.mtl with doorway lintels in images/ and public/images/!');
