const fs = require('fs');
const path = require('path');

function createBoxObj(boxes) {
  let v = [];
  let vn = [];
  let vt = [];
  let f = [];
  let vCount = 1;

  for (const b of boxes) {
    const { minX, maxX, minY, maxY, minZ, maxZ, name } = b;
    // 8 vertices
    const verts = [
      [minX, minY, minZ], [maxX, minY, minZ], [maxX, maxY, minZ], [minX, maxY, minZ], // 1,2,3,4 front z-min
      [minX, minY, maxZ], [maxX, minY, maxZ], [maxX, maxY, maxZ], [minX, maxY, maxZ]  // 5,6,7,8 back z-max
    ];
    verts.forEach(p => v.push('v ' + p[0].toFixed(4) + ' ' + p[1].toFixed(4) + ' ' + p[2].toFixed(4)));

    // 6 faces (quads converted to 2 triangles)
    const base = vCount;
    // Front: 1, 4, 3, 2
    f.push('f ' + base + ' ' + (base + 3) + ' ' + (base + 2));
    f.push('f ' + base + ' ' + (base + 2) + ' ' + (base + 1));
    // Back: 6, 7, 8, 5
    f.push('f ' + (base + 5) + ' ' + (base + 6) + ' ' + (base + 7));
    f.push('f ' + (base + 5) + ' ' + (base + 7) + ' ' + (base + 4));
    // Top: 4, 8, 7, 3
    f.push('f ' + (base + 3) + ' ' + (base + 7) + ' ' + (base + 6));
    f.push('f ' + (base + 3) + ' ' + (base + 6) + ' ' + (base + 2));
    // Bottom: 5, 1, 2, 6
    f.push('f ' + (base + 4) + ' ' + base + ' ' + (base + 1));
    f.push('f ' + (base + 4) + ' ' + (base + 1) + ' ' + (base + 5));
    // Left: 5, 8, 4, 1
    f.push('f ' + (base + 4) + ' ' + (base + 7) + ' ' + (base + 3));
    f.push('f ' + (base + 4) + ' ' + (base + 3) + ' ' + base);
    // Right: 2, 3, 7, 6
    f.push('f ' + (base + 1) + ' ' + (base + 2) + ' ' + (base + 6));
    f.push('f ' + (base + 1) + ' ' + (base + 6) + ' ' + (base + 5));

    vCount += 8;
  }

  return v.join('\n') + '\n' + f.join('\n');
}

// Table
const tableBoxes = [
  // Top
  { minX: -0.75, maxX: 0.75, minY: 0.76, maxY: 0.82, minZ: -0.425, maxZ: 0.425 },
  // Frame
  { minX: -0.70, maxX: 0.70, minY: 0.72, maxY: 0.76, minZ: -0.375, maxZ: 0.375 },
  // 4 Legs
  { minX: -0.71, maxX: -0.65, minY: 0, maxY: 0.76, minZ: -0.385, maxZ: -0.325 },
  { minX: 0.65, maxX: 0.71, minY: 0, maxY: 0.76, minZ: -0.385, maxZ: -0.325 },
  { minX: -0.71, maxX: -0.65, minY: 0, maxY: 0.76, minZ: 0.325, maxZ: 0.385 },
  { minX: 0.65, maxX: 0.71, minY: 0, maxY: 0.76, minZ: 0.325, maxZ: 0.385 },
];

const tableObj = '# Lab Table OBJ\no Table\n' + createBoxObj(tableBoxes);

// Chair
const chairBoxes = [
  // Seat
  { minX: -0.24, maxX: 0.24, minY: 0.42, maxY: 0.47, minZ: -0.24, maxZ: 0.24 },
  // Backrest
  { minX: -0.22, maxX: 0.22, minY: 0.62, maxY: 0.85, minZ: -0.24, maxZ: -0.20 },
  // Backrest posts
  { minX: -0.20, maxX: -0.17, minY: 0.47, maxY: 0.62, minZ: -0.23, maxZ: -0.21 },
  { minX: 0.17, maxX: 0.20, minY: 0.47, maxY: 0.62, minZ: -0.23, maxZ: -0.21 },
  // 4 Legs
  { minX: -0.21, maxX: -0.17, minY: 0, maxY: 0.42, minZ: -0.21, maxZ: -0.17 },
  { minX: 0.17, maxX: 0.21, minY: 0, maxY: 0.42, minZ: -0.21, maxZ: -0.17 },
  { minX: -0.21, maxX: -0.17, minY: 0, maxY: 0.42, minZ: 0.17, maxZ: 0.21 },
  { minX: 0.17, maxX: 0.21, minY: 0, maxY: 0.42, minZ: 0.17, maxZ: 0.21 },
];

const chairObj = '# Lab Chair OBJ\no Chair\n' + createBoxObj(chairBoxes);

// Write to both images/props and public/images/props
['images/props', 'public/images/props'].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'table.obj'), tableObj);
  fs.writeFileSync(path.join(dir, 'chair.obj'), chairObj);
});

console.log('Successfully created table.obj and chair.obj in images/props and public/images/props');

