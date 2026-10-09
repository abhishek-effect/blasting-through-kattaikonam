const fs = require('fs');
const path = require('path');

const rooms = [
  { id: 'infirmary', minX: 0, maxX: 14, minZ: 16, maxZ: 28 },
  { id: 'elevator_room', minX: 0, maxX: 14, minZ: 32, maxZ: 46 },
  { id: 'computer_lab', minX: 0, maxX: 14, minZ: 50, maxZ: 64 },
  { id: 'bio_lab', minX: 0, maxX: 14, minZ: 68, maxZ: 82 },
  { id: 'unusable_stairs_sw', minX: 0, maxX: 20, minZ: 86, maxZ: 100 },
  { id: 'nw_locked', minX: 0, maxX: 14, minZ: 0, maxZ: 10 },
  { id: 'nw_stairs', minX: 16, maxX: 32, minZ: 0, maxZ: 10 },
  { id: 'phy_lab', minX: 35, maxX: 62, minZ: 0, maxZ: 14 },
  { id: 'locked_room', minX: 65, maxX: 80, minZ: 0, maxZ: 14 },
  { id: 'unlockable_room', minX: 83, maxX: 100, minZ: 0, maxZ: 14 },
  { id: 'board_room', minX: 46, maxX: 64, minZ: 85, maxZ: 100 },
  { id: 'library', minX: 66, maxX: 100, minZ: 83, maxZ: 100 },
  { id: 'seminar_hall', minX: 55, maxX: 100, minZ: 27, maxZ: 66 }
];

function isInsideRoom(x, z) {
  for (const r of rooms) {
    if (x >= r.minX - 0.05 && x <= r.maxX + 0.05 && z >= r.minZ - 0.05 && z <= r.maxZ + 0.05) {
      return true;
    }
  }
  return false;
}

// Read current mappu.obj
const objContent = fs.readFileSync('public/images/mappu.obj', 'utf-8');
const lines = objContent.split(/\r?\n/);

let pinkFaces = [];
let whiteFaces = [];
let vertices = [];
let vtList = [];

// Header & Floor/Ceiling elements
let out = [];
out.push('# mappu.obj - Dual-Sided Corridor Pink / Room White Architecture');
out.push('mtllib mappu.mtl\n');

// Standard UVs
out.push('vt 0.0 0.0');
out.push('vt 35.0 0.0');
out.push('vt 35.0 35.0');
out.push('vt 0.0 35.0');

// Floor
out.push('\nusemtl white_tiles');
out.push('# Main Floor with repeating rectangle tiles');
out.push('v 0 0 100');
out.push('v 100 0 100');
out.push('v 100 0 0');
out.push('v 0 0 0');
out.push('f 1/1 2/2 3/3 4/4');

// Black Tiles
out.push('\nusemtl black_solid');
out.push('# Central Atrium Black Tiles');
out.push('v 22 0.01 71');
out.push('v 40 0.01 71');
out.push('v 40 0.01 28');
out.push('v 22 0.01 28');
out.push('f 5 6 7 8');

// Ceiling
out.push('\nusemtl ceiling');
out.push('# Campus Ceiling');
out.push('v 0 5 0');
out.push('v 100 5 0');
out.push('v 100 5 100');
out.push('v 0 5 100');
out.push('f 9 10 11 12');

// Parse all wall blocks from original mappu.obj
let currentBlockName = '';
let currentVertices = [];
let wallBlocks = [];

for (let i = 0; i < lines.length; i++) {
  const line = lines[i].trim();
  if (line.startsWith('#') && !line.includes('---') && !line.includes('mappu') && !line.includes('Floor') && !line.includes('Ceiling') && !line.includes('Black Tiles')) {
    currentBlockName = line.replace('#', '').trim();
  } else if (line.startsWith('v ')) {
    const parts = line.split(/\s+/).slice(1).map(Number);
    currentVertices.push(parts);
  } else if (line.startsWith('f ')) {
    if (currentVertices.length === 4) {
      wallBlocks.push({
        name: currentBlockName,
        v: [...currentVertices]
      });
    }
    currentVertices = [];
  }
}

// Filter out floors/ceilings from wallBlocks (the first 3 quads)
wallBlocks = wallBlocks.filter(b => !['Main Floor', 'Black Tiles Area', 'Pure White Ceiling (Height = 5)'].includes(b.name));

let vIndex = 13; // Starting vertex index after floor, black tiles, ceiling (12 verts)
let corridorMeshLines = [];
let roomMeshLines = [];

for (const b of wallBlocks) {
  const [A, B, C, D] = b.v;
  // Center of quad
  const cx = (A[0] + B[0] + C[0] + D[0]) / 4;
  const cz = (A[2] + B[2] + C[2] + D[2]) / 4;

  // Calculate face normal from cross product (B - A) x (C - B)
  const v1 = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
  const v2 = [C[0] - B[0], C[1] - B[1], C[2] - B[2]];
  const nx = v1[1] * v2[2] - v1[2] * v2[1];
  const ny = v1[2] * v2[0] - v1[0] * v2[2];
  const nz = v1[0] * v2[1] - v1[1] * v2[0];
  const len = Math.hypot(nx, ny, nz) || 1;
  const normX = nx / len;
  const normZ = nz / len;

  // Check which side points inside a room vs outside in corridor
  const side1Inside = isInsideRoom(cx + normX * 0.15, cz + normZ * 0.15);
  const side2Inside = isInsideRoom(cx - normX * 0.15, cz - normZ * 0.15);

  // Side 1: vertices A, B, C, D (normal points +N)
  // Side 2: vertices A, D, C, B (normal points -N)

  // 1. If Side 1 is corridor -> corridor_wall_pink; if inside room -> room_wall_white
  const side1IsPink = !side1Inside;
  // 2. If Side 2 is corridor -> corridor_wall_pink; if inside room -> room_wall_white
  const side2IsPink = !side2Inside;

  // Emit 4 vertices for Side 1
  const s1Base = vIndex;
  const vStr1 = [
    `v ${A[0]} ${A[1]} ${A[2]}`,
    `v ${B[0]} ${B[1]} ${B[2]}`,
    `v ${C[0]} ${C[1]} ${C[2]}`,
    `v ${D[0]} ${D[1]} ${D[2]}`
  ];
  vIndex += 4;

  if (side1IsPink) {
    corridorMeshLines.push(`# ${b.name} (Corridor Pink)`);
    corridorMeshLines.push(...vStr1);
    corridorMeshLines.push(`f ${s1Base} ${s1Base + 1} ${s1Base + 2} ${s1Base + 3}`);
  } else {
    roomMeshLines.push(`# ${b.name} (Room White)`);
    roomMeshLines.push(...vStr1);
    roomMeshLines.push(`f ${s1Base} ${s1Base + 1} ${s1Base + 2} ${s1Base + 3}`);
  }

  // Emit 4 vertices for Side 2 (opposite winding)
  const s2Base = vIndex;
  const vStr2 = [
    `v ${A[0]} ${A[1]} ${A[2]}`,
    `v ${D[0]} ${D[1]} ${D[2]}`,
    `v ${C[0]} ${C[1]} ${C[2]}`,
    `v ${B[0]} ${B[1]} ${B[2]}`
  ];
  vIndex += 4;

  if (side2IsPink) {
    corridorMeshLines.push(`# ${b.name} - reverse (Corridor Pink)`);
    corridorMeshLines.push(...vStr2);
    corridorMeshLines.push(`f ${s2Base} ${s2Base + 1} ${s2Base + 2} ${s2Base + 3}`);
  } else {
    roomMeshLines.push(`# ${b.name} - reverse (Room White)`);
    roomMeshLines.push(...vStr2);
    roomMeshLines.push(`f ${s2Base} ${s2Base + 1} ${s2Base + 2} ${s2Base + 3}`);
  }
}

out.push('\n# --- CORRIDOR & EXTERIOR WALLS (LIGHT PINK #fae6e7) ---');
out.push('usemtl corridor_wall_pink');
out.push(...corridorMeshLines);

out.push('\n# --- INTERIOR ROOM WALLS (PURE WHITE #ffffff) ---');
out.push('usemtl room_wall_white');
out.push(...roomMeshLines);

const finalObj = out.join('\n') + '\n';

// Materials definition
const finalMtl = `# mappu.mtl - Floor Tile Texture, Corridor Light Pink, Room White
newmtl white_tiles
Ka 0.9 0.9 0.9
Kd 0.95 0.95 0.95
Ks 0.05 0.05 0.05
map_Kd images/textures/floor-tile.png

newmtl black_solid
Ka 0.05 0.05 0.05
Kd 0.08 0.08 0.08
Ks 0.0 0.0 0.0

newmtl corridor_wall_pink
# Light Pink (#fae6e7)
Ka 0.98 0.90 0.90
Kd 0.980 0.902 0.906
Ks 0.05 0.05 0.05

newmtl room_wall_white
# Pure White (#ffffff)
Ka 0.95 0.95 0.95
Kd 1.0 1.0 1.0
Ks 0.05 0.05 0.05

newmtl ceiling
Ka 0.95 0.95 0.95
Kd 1.0 1.0 1.0
Ks 0.0 0.0 0.0
`;

// Save both to public/images and images/
['public/images', 'images'].forEach(dir => {
  fs.writeFileSync(path.join(dir, 'mappu.obj'), finalObj);
  fs.writeFileSync(path.join(dir, 'mappu.mtl'), finalMtl);
});

console.log('Successfully generated dual-sided mappu.obj and mappu.mtl!');

