// Pixel-art asset generator for Rillkeepers
// Creates 16x16 native handcrafted pixel art sheets matching the valley aesthetic.
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function createPNG(width, height, rgbaBuffer) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  function makeChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const body = Buffer.concat([typeBuf, data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(body) >>> 0, 0);
    return Buffer.concat([len, body, crc]);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 4)] = 0; // Filter None
    for (let x = 0; x < width; x++) {
      const srcIdx = (y * width + x) * 4;
      const dstIdx = y * (1 + width * 4) + 1 + x * 4;
      raw[dstIdx] = rgbaBuffer[srcIdx];
      raw[dstIdx + 1] = rgbaBuffer[srcIdx + 1];
      raw[dstIdx + 2] = rgbaBuffer[srcIdx + 2];
      raw[dstIdx + 3] = rgbaBuffer[srcIdx + 3];
    }
  }
  const idat = zlib.deflateSync(raw);
  return Buffer.concat([signature, makeChunk('IHDR', ihdr), makeChunk('IDAT', idat), makeChunk('IEND', Buffer.alloc(0))]);
}

class Canvas {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.buffer = Buffer.alloc(width * height * 4, 0);
  }

  setPixel(x, y, r, g, b, a = 255) {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return;
    const idx = (Math.floor(y) * this.width + Math.floor(x)) * 4;
    this.buffer[idx] = r;
    this.buffer[idx + 1] = g;
    this.buffer[idx + 2] = b;
    this.buffer[idx + 3] = a;
  }

  hexToRgb(hex) {
    const val = parseInt(hex.replace('#', ''), 16);
    return [(val >> 16) & 255, (val >> 8) & 255, val & 255];
  }

  fillHex(x, y, hex, a = 255) {
    const [r, g, b] = this.hexToRgb(hex);
    this.setPixel(x, y, r, g, b, a);
  }

  fillRect(x, y, w, h, hex, a = 255) {
    for (let py = y; py < y + h; py++) {
      for (let px = x; px < x + w; px++) {
        this.fillHex(px, py, hex, a);
      }
    }
  }

  toBuffer() {
    return createPNG(this.width, this.height, this.buffer);
  }
}

// Ensure target directories
const outDir = path.resolve(__dirname, '../public/assets');
fs.mkdirSync(path.join(outDir, 'tilesets'), { recursive: true });
fs.mkdirSync(path.join(outDir, 'characters'), { recursive: true });
fs.mkdirSync(path.join(outDir, 'mechanics'), { recursive: true });

// Palette
const PALETTE = {
  grassBase: '#3a5a40',
  grassDark: '#2f4934',
  grassLight: '#4d7555',
  dirtBase: '#6b5138',
  dirtDark: '#4a3622',
  dirtLight: '#856748',
  stoneBase: '#4a5568',
  stoneDark: '#2d3748',
  stoneLight: '#718096',
  stoneMoss: '#42584d',
  waterDry: '#5c4d3c',
  waterShallow: '#3d7ea6',
  waterDeep: '#235070',
  waterCurrent: '#64b5f6',
  waterFoam: '#e2f1fc',
  woodBase: '#6e4727',
  woodDark: '#452b14',
  woodLight: '#946338',
  iron: '#33373b',
  ironLight: '#595f66',
  reedGreen: '#6a8d4e'
};

// ================= 1. VALLEY TILESET (128x128 = 8x8 tiles of 16x16) =================
console.log('Generating valley_tiles.png...');
const valley = new Canvas(128, 128);

function drawTile(tx, ty, drawFn) {
  const ox = tx * 16;
  const oy = ty * 16;
  drawFn(ox, oy);
}

// (0, 0): Grass flat
drawTile(0, 0, (ox, oy) => {
  valley.fillRect(ox, oy, 16, 16, PALETTE.grassBase);
  // subtle grass tufts
  valley.fillHex(ox + 3, oy + 4, PALETTE.grassLight);
  valley.fillHex(ox + 3, oy + 5, PALETTE.grassDark);
  valley.fillHex(ox + 11, oy + 9, PALETTE.grassLight);
  valley.fillHex(ox + 12, oy + 10, PALETTE.grassDark);
  valley.fillHex(ox + 7, oy + 13, PALETTE.grassLight);
});

// (1, 0): Grass with flowers/moss
drawTile(1, 0, (ox, oy) => {
  valley.fillRect(ox, oy, 16, 16, PALETTE.grassBase);
  valley.fillHex(ox + 5, oy + 6, '#dfc463'); // small yellow flower
  valley.fillHex(ox + 6, oy + 6, '#f3e8b5');
  valley.fillHex(ox + 5, oy + 7, PALETTE.grassDark);
  valley.fillHex(ox + 12, oy + 11, '#d47b74'); // small pink/red wildflower
});

// (2, 0): Dirt path flat
drawTile(2, 0, (ox, oy) => {
  valley.fillRect(ox, oy, 16, 16, PALETTE.dirtBase);
  valley.fillHex(ox + 4, oy + 3, PALETTE.dirtLight);
  valley.fillHex(ox + 5, oy + 4, PALETTE.dirtDark);
  valley.fillHex(ox + 10, oy + 8, PALETTE.dirtLight);
  valley.fillHex(ox + 2, oy + 12, PALETTE.dirtDark);
});

// (3, 0): Stone canal bottom/bed
drawTile(3, 0, (ox, oy) => {
  valley.fillRect(ox, oy, 16, 16, PALETTE.stoneDark);
  for (let y = 0; y < 16; y += 4) {
    for (let x = 0; x < 16; x += 4) {
      if ((x + y) % 8 === 0) valley.fillRect(ox + x, oy + y, 3, 3, PALETTE.stoneBase);
    }
  }
});

// (0, 1): Stone wall / cliff top
drawTile(0, 1, (ox, oy) => {
  valley.fillRect(ox, oy, 16, 16, PALETTE.stoneBase);
  valley.fillRect(ox, oy, 16, 3, PALETTE.stoneMoss);
  valley.fillRect(ox, oy + 13, 16, 3, PALETTE.stoneDark);
  valley.fillRect(ox + 4, oy + 5, 6, 4, PALETTE.stoneLight);
});

// (1, 1): Stone canal wall - Top
drawTile(1, 1, (ox, oy) => {
  valley.fillRect(ox, oy, 16, 8, PALETTE.stoneBase);
  valley.fillRect(ox, oy + 8, 16, 8, PALETTE.stoneDark);
  valley.fillRect(ox + 1, oy + 1, 14, 2, PALETTE.stoneLight);
});

// (2, 1): Stone canal wall - Left
drawTile(2, 1, (ox, oy) => {
  valley.fillRect(ox, oy, 8, 16, PALETTE.stoneBase);
  valley.fillRect(ox + 8, oy, 8, 16, PALETTE.stoneDark);
  valley.fillRect(ox + 1, oy + 1, 2, 14, PALETTE.stoneLight);
});

// (3, 1): Stone canal wall - Right
drawTile(3, 1, (ox, oy) => {
  valley.fillRect(ox, oy, 8, 16, PALETTE.stoneDark);
  valley.fillRect(ox + 8, oy, 8, 16, PALETTE.stoneBase);
  valley.fillRect(ox + 13, oy + 1, 2, 14, PALETTE.stoneLight);
});

// (0, 2): Wooden bridge horizontal
drawTile(0, 2, (ox, oy) => {
  valley.fillRect(ox, oy, 16, 16, PALETTE.woodBase);
  valley.fillRect(ox, oy, 16, 2, PALETTE.woodDark);
  valley.fillRect(ox, oy + 14, 16, 2, PALETTE.woodDark);
  for (let x = 0; x < 16; x += 4) {
    valley.fillRect(ox + x, oy + 2, 1, 12, PALETTE.woodLight);
    valley.fillRect(ox + x + 3, oy + 2, 1, 12, PALETTE.woodDark);
  }
});

// (1, 2): Wooden bridge vertical
drawTile(1, 2, (ox, oy) => {
  valley.fillRect(ox, oy, 16, 16, PALETTE.woodBase);
  valley.fillRect(ox, oy, 2, 16, PALETTE.woodDark);
  valley.fillRect(ox + 14, oy, 2, 16, PALETTE.woodDark);
  for (let y = 0; y < 16; y += 4) {
    valley.fillRect(ox + 2, oy + y, 12, 1, PALETTE.woodLight);
    valley.fillRect(ox + 2, oy + y + 3, 12, 1, PALETTE.woodDark);
  }
});

// (2, 2): Reeds / riverside vegetation
drawTile(2, 2, (ox, oy) => {
  valley.fillRect(ox, oy, 16, 16, PALETTE.grassBase);
  // Reeds stalks
  for (let i = 0; i < 4; i++) {
    const rx = ox + 3 + i * 3;
    valley.fillRect(rx, oy + 3, 1, 12, PALETTE.reedGreen);
    valley.fillRect(rx - 1, oy + 2, 3, 3, '#917849'); // Reed top seedhead
  }
});

// (3, 2): Cobblestone pavement
drawTile(3, 2, (ox, oy) => {
  valley.fillRect(ox, oy, 16, 16, PALETTE.stoneDark);
  const stones = [
    [1, 1, 5, 4], [8, 1, 6, 4],
    [2, 7, 6, 4], [10, 7, 5, 4],
    [1, 12, 5, 3], [8, 12, 7, 3]
  ];
  stones.forEach(([sx, sy, sw, sh]) => {
    valley.fillRect(ox + sx, oy + sy, sw, sh, PALETTE.stoneBase);
    valley.fillRect(ox + sx, oy + sy, sw, 1, PALETTE.stoneLight);
  });
});

// (0, 3): Bush / Shrub
drawTile(0, 3, (ox, oy) => {
  valley.fillRect(ox, oy, 16, 16, PALETTE.grassBase);
  valley.fillRect(ox + 2, oy + 4, 12, 10, PALETTE.grassDark);
  valley.fillRect(ox + 3, oy + 2, 10, 12, PALETTE.grassBase);
  valley.fillRect(ox + 4, oy + 3, 8, 8, PALETTE.grassLight);
  valley.fillHex(ox + 6, oy + 5, '#ffffff', 180);
});

// (1, 3): Mill cottage wall / Timber frame
drawTile(1, 3, (ox, oy) => {
  valley.fillRect(ox, oy, 16, 16, '#e5d9c5'); // parchment plaster
  valley.fillRect(ox, oy, 16, 3, PALETTE.woodDark);
  valley.fillRect(ox, oy + 13, 16, 3, PALETTE.woodDark);
  valley.fillRect(ox, oy, 3, 16, PALETTE.woodDark);
  valley.fillRect(ox + 13, oy, 3, 16, PALETTE.woodDark);
  // Cross beam
  for (let i = 0; i < 12; i++) {
    valley.fillHex(ox + 2 + i, oy + 2 + i, PALETTE.woodBase);
  }
});

// (2, 3): Mill roof shingle
drawTile(2, 3, (ox, oy) => {
  valley.fillRect(ox, oy, 16, 16, '#8b4513');
  for (let y = 0; y < 16; y += 4) {
    valley.fillRect(ox, oy + y, 16, 1, '#5c2d0c');
    for (let x = 0; x < 16; x += 8) {
      const shift = (y % 8 === 0) ? 0 : 4;
      valley.fillRect(ox + ((x + shift) % 16), oy + y, 1, 4, '#5c2d0c');
    }
  }
});

// (3, 3): Stepping stone in water bed
drawTile(3, 3, (ox, oy) => {
  valley.fillRect(ox, oy, 16, 16, PALETTE.stoneDark);
  valley.fillRect(ox + 3, oy + 3, 10, 10, PALETTE.stoneBase);
  valley.fillRect(ox + 4, oy + 4, 8, 8, PALETTE.stoneLight);
  valley.fillRect(ox + 3, oy + 3, 10, 2, PALETTE.stoneMoss);
});

fs.writeFileSync(path.join(outDir, 'tilesets/valley_tiles.png'), valley.toBuffer());

// ================= 2. WATER TILESET (96x64 = 6x4 tiles of 16x16) =================
console.log('Generating water_tiles.png...');
const water = new Canvas(96, 64);

// Row 0: Dry / Low / Still Deep Water
// (0, 0): Dry channel bed (cracked mud)
drawTile(0, 0, (ox, oy) => {
  water.fillRect(ox, oy, 16, 16, PALETTE.waterDry);
  water.fillRect(ox + 2, oy + 4, 12, 1, '#3b2f23');
  water.fillRect(ox + 7, oy + 5, 1, 6, '#3b2f23');
  water.fillRect(ox + 4, oy + 11, 8, 1, '#3b2f23');
});

// (1, 0): Shallow trickle
drawTile(1, 0, (ox, oy) => {
  water.fillRect(ox, oy, 16, 16, PALETTE.waterDry);
  water.fillRect(ox + 4, oy + 2, 8, 12, PALETTE.waterShallow);
  water.fillRect(ox + 6, oy + 4, 4, 8, PALETTE.waterCurrent);
});

// (2, 0): Still deep pool
drawTile(2, 0, (ox, oy) => {
  water.fillRect(ox, oy, 16, 16, PALETTE.waterDeep);
  water.fillRect(ox + 2, oy + 3, 5, 2, PALETTE.waterShallow);
  water.fillRect(ox + 9, oy + 9, 5, 2, PALETTE.waterShallow);
});

// Row 1: Flowing water (horizontal frames for animation)
for (let f = 0; f < 4; f++) {
  const ox = f * 16;
  const oy = 16;
  water.fillRect(ox, oy, 16, 16, PALETTE.waterDeep);
  // Flow lines moving eastward
  const shift = f * 4;
  for (let y = 3; y < 14; y += 4) {
    for (let x = 0; x < 16; x++) {
      if ((x + shift) % 8 < 5) {
        water.fillHex(ox + x, oy + y, PALETTE.waterCurrent);
      }
      if ((x + shift) % 8 === 0) {
        water.fillHex(ox + x, oy + y, PALETTE.waterFoam);
      }
    }
  }
}

// Row 2: Flowing water (vertical frames for animation)
for (let f = 0; f < 4; f++) {
  const ox = f * 16;
  const oy = 32;
  water.fillRect(ox, oy, 16, 16, PALETTE.waterDeep);
  const shift = f * 4;
  for (let x = 3; x < 14; x += 4) {
    for (let y = 0; y < 16; y++) {
      if ((y + shift) % 8 < 5) {
        water.fillHex(ox + x, oy + y, PALETTE.waterCurrent);
      }
      if ((y + shift) % 8 === 0) {
        water.fillHex(ox + x, oy + y, PALETTE.waterFoam);
      }
    }
  }
}

// Row 3: Splash / Churn / Waterfall edge
for (let f = 0; f < 4; f++) {
  const ox = f * 16;
  const oy = 48;
  water.fillRect(ox, oy, 16, 16, PALETTE.waterDeep);
  water.fillRect(ox, oy, 16, 6, PALETTE.waterFoam);
  // Droplet sprinkles
  const dropX = (f * 5 + 3) % 14 + 1;
  water.fillHex(ox + dropX, oy + 8, '#ffffff');
  water.fillHex(ox + ((dropX + 6) % 14 + 1), oy + 11, PALETTE.waterCurrent);
}

fs.writeFileSync(path.join(outDir, 'tilesets/water_tiles.png'), water.toBuffer());

// ================= 3. MECHANICS & OBJECTS (128x128) =================
console.log('Generating mechanics.png...');
const mech = new Canvas(128, 128);

// Sluice Gate: Closed (0, 0: 32x32)
// Frame timber pillars on sides, heavy wooden gate blade down
mech.fillRect(0, 0, 32, 32, '#000000', 0); // transparent base
// Left & right pillars
mech.fillRect(2, 2, 6, 28, PALETTE.woodDark);
mech.fillRect(24, 2, 6, 28, PALETTE.woodDark);
mech.fillRect(4, 4, 3, 24, PALETTE.woodLight);
mech.fillRect(25, 4, 3, 24, PALETTE.woodLight);
// Top crossbeam & crank wheel
mech.fillRect(2, 2, 28, 6, PALETTE.woodBase);
mech.fillRect(13, 0, 6, 6, PALETTE.iron); // Winch gear
mech.fillRect(15, 1, 2, 4, PALETTE.ironLight);
// Closed Gate blade (in canal)
mech.fillRect(7, 10, 18, 20, PALETTE.woodBase);
for (let y = 12; y < 28; y += 4) {
  mech.fillRect(8, y, 16, 1, PALETTE.woodDark);
}
// Iron banding
mech.fillRect(7, 16, 18, 2, PALETTE.iron);
mech.fillRect(7, 24, 18, 2, PALETTE.iron);

// Sluice Gate: Open (32, 0: 32x32)
mech.fillRect(32, 0, 32, 32, '#000000', 0);
mech.fillRect(34, 2, 6, 28, PALETTE.woodDark);
mech.fillRect(56, 2, 6, 28, PALETTE.woodDark);
mech.fillRect(36, 4, 3, 24, PALETTE.woodLight);
mech.fillRect(57, 4, 3, 24, PALETTE.woodLight);
mech.fillRect(34, 2, 28, 6, PALETTE.woodBase);
mech.fillRect(45, 0, 6, 6, PALETTE.iron);
// Raised Gate blade
mech.fillRect(39, 4, 18, 10, PALETTE.woodBase);
mech.fillRect(39, 8, 18, 2, PALETTE.iron);
// Clear canal underneath with water foam!
mech.fillRect(39, 20, 14, 10, PALETTE.waterCurrent, 220);
mech.fillRect(41, 22, 10, 4, PALETTE.waterFoam, 240);

// Waterwheel: 8 rotation frames (each 32x32) at y = 32 and y = 64
for (let frame = 0; frame < 8; frame++) {
  const fx = (frame % 4) * 32;
  const fy = 32 + Math.floor(frame / 4) * 32;
  const cx = fx + 16;
  const cy = fy + 16;
  const angle = (frame * Math.PI) / 4;

  // Outer rim
  for (let r = 0; r < 360; r += 15) {
    const rad = (r * Math.PI) / 180;
    const px = Math.round(cx + Math.cos(rad) * 12);
    const py = Math.round(cy + Math.sin(rad) * 12);
    mech.fillHex(px, py, PALETTE.woodDark);
  }
  // Spokes / blades (4 main axes)
  for (let s = 0; s < 4; s++) {
    const spokeAngle = angle + (s * Math.PI) / 2;
    for (let d = 2; d <= 12; d++) {
      const px = Math.round(cx + Math.cos(spokeAngle) * d);
      const py = Math.round(cy + Math.sin(spokeAngle) * d);
      mech.fillHex(px, py, PALETTE.woodLight);
    }
    // Water paddle scoop at tip
    const tipX = Math.round(cx + Math.cos(spokeAngle) * 12);
    const tipY = Math.round(cy + Math.sin(spokeAngle) * 12);
    mech.fillRect(tipX - 1, tipY - 1, 3, 3, PALETTE.woodBase);
  }
  // Iron hub / axle
  mech.fillRect(cx - 3, cy - 3, 7, 7, PALETTE.iron);
  mech.fillRect(cx - 1, cy - 1, 3, 3, PALETTE.ironLight);
}

// Floating Platform / Raft (0, 96: 32x16)
mech.fillRect(0, 96, 32, 16, '#000000', 0);
// 4 bound wooden logs
for (let i = 0; i < 4; i++) {
  const ly = 96 + i * 4;
  mech.fillRect(2, ly, 28, 3, PALETTE.woodBase);
  mech.fillRect(4, ly, 24, 1, PALETTE.woodLight);
  mech.fillRect(2, ly + 2, 28, 1, PALETTE.woodDark);
}
// Cross rope bindings
mech.fillRect(8, 96, 2, 16, '#c4a66a');
mech.fillRect(22, 96, 2, 16, '#c4a66a');

// Debris Clump (32, 96: 16x16)
mech.fillRect(32, 96, 16, 16, '#000000', 0);
mech.fillRect(34, 100, 12, 8, '#3d2b1a');
mech.fillRect(36, 98, 8, 12, '#523c27');
// Twigs / leaves sticking out
mech.fillHex(33, 102, PALETTE.woodDark);
mech.fillHex(45, 104, PALETTE.woodLight);
mech.fillHex(38, 97, PALETTE.reedGreen);
mech.fillHex(42, 109, PALETTE.reedGreen);

// Wooden Crate / Pushable Barrel (48, 96: 16x16)
mech.fillRect(48, 96, 16, 16, PALETTE.woodBase);
mech.fillRect(49, 97, 14, 14, PALETTE.woodLight);
mech.fillRect(48, 96, 16, 1, PALETTE.woodDark);
mech.fillRect(48, 111, 16, 1, PALETTE.woodDark);
mech.fillRect(48, 96, 1, 16, PALETTE.woodDark);
mech.fillRect(63, 96, 1, 16, PALETTE.woodDark);
// Diagonal brace
for (let i = 1; i < 14; i++) {
  mech.fillHex(49 + i, 97 + i, PALETTE.woodDark);
}

// Crank Lever / Mechanism (64, 96: 16x16)
mech.fillRect(64, 96, 16, 16, '#000000', 0);
mech.fillRect(67, 108, 10, 4, PALETTE.stoneBase); // base pedestal
mech.fillRect(71, 99, 2, 9, PALETTE.iron);        // lever arm
mech.fillRect(70, 98, 4, 3, '#c29b38');          // bronze knob

fs.writeFileSync(path.join(outDir, 'mechanics/mechanics.png'), mech.toBuffer());

// ================= 4. CREW CHARACTERS (128x128: 4 players x 4 directions x 2 walk frames) =================
console.log('Generating crew.png...');
const crew = new Canvas(128, 128);

const PLAYER_COLORS = [
  { tunic: '#3a7d7b', tunicDark: '#204d4b', name: 'Teal' },   // Player 1
  { tunic: '#b35d38', tunicDark: '#78361b', name: 'Rust' },   // Player 2
  { tunic: '#588157', tunicDark: '#344e41', name: 'Olive' },  // Player 3
  { tunic: '#c29b38', tunicDark: '#80621b', name: 'Ochre' }   // Player 4
];

// Each player gets a 32-pixel high strip
PLAYER_COLORS.forEach((col, pIdx) => {
  const py = pIdx * 32;

  // Directions: 0: Down, 1: Up, 2: Left, 3: Right
  for (let dir = 0; dir < 4; dir++) {
    // 2 walk frames: 0: idle/neutral, 1: step
    for (let step = 0; step < 2; step++) {
      const px = (dir * 2 + step) * 16;

      // Base skin & hair
      const skin = '#f0c7a1';
      const hair = pIdx % 2 === 0 ? '#4a3319' : '#8c5324';
      const pants = '#2d3748';
      const boots = '#1a202c';

      // Head (at top)
      crew.fillRect(px + 4, py + 1, 8, 6, skin);
      crew.fillRect(px + 4, py + 1, 8, 3, hair); // Hair cap

      if (dir === 0) { // Down
        // Eyes
        crew.fillHex(px + 6, py + 4, '#1a1a1a');
        crew.fillHex(px + 9, py + 4, '#1a1a1a');
        // Tunic body
        crew.fillRect(px + 4, py + 7, 8, 5, col.tunic);
        crew.fillRect(px + 7, py + 7, 2, 5, col.tunicDark);
        // Belt
        crew.fillRect(px + 4, py + 11, 8, 1, '#4a3319');
        // Hands
        crew.fillHex(px + 3, py + 8, skin);
        crew.fillHex(px + 12, py + 8, skin);
        // Legs / boots
        if (step === 0) {
          crew.fillRect(px + 5, py + 12, 2, 3, boots);
          crew.fillRect(px + 9, py + 12, 2, 3, boots);
        } else {
          crew.fillRect(px + 5, py + 12, 2, 4, boots);
          crew.fillRect(px + 9, py + 11, 2, 3, boots);
        }
      } else if (dir === 1) { // Up
        // Back of head
        crew.fillRect(px + 4, py + 1, 8, 5, hair);
        // Tunic back
        crew.fillRect(px + 4, py + 7, 8, 5, col.tunic);
        crew.fillRect(px + 4, py + 11, 8, 1, '#4a3319');
        if (step === 0) {
          crew.fillRect(px + 5, py + 12, 2, 3, boots);
          crew.fillRect(px + 9, py + 12, 2, 3, boots);
        } else {
          crew.fillRect(px + 5, py + 11, 2, 3, boots);
          crew.fillRect(px + 9, py + 12, 2, 4, boots);
        }
      } else if (dir === 2) { // Left
        crew.fillRect(px + 4, py + 1, 3, 3, hair);
        crew.fillHex(px + 5, py + 4, '#1a1a1a'); // one eye
        crew.fillRect(px + 5, py + 7, 6, 5, col.tunic);
        crew.fillRect(px + 5, py + 11, 6, 1, '#4a3319');
        crew.fillHex(px + 4, py + 8, skin); // forward hand
        if (step === 0) {
          crew.fillRect(px + 6, py + 12, 4, 3, boots);
        } else {
          crew.fillRect(px + 4, py + 12, 3, 3, boots);
          crew.fillRect(px + 9, py + 12, 3, 3, boots);
        }
      } else if (dir === 3) { // Right
        crew.fillRect(px + 9, py + 1, 3, 3, hair);
        crew.fillHex(px + 10, py + 4, '#1a1a1a'); // one eye
        crew.fillRect(px + 5, py + 7, 6, 5, col.tunic);
        crew.fillRect(px + 5, py + 11, 6, 1, '#4a3319');
        crew.fillHex(px + 11, py + 8, skin);
        if (step === 0) {
          crew.fillRect(px + 6, py + 12, 4, 3, boots);
        } else {
          crew.fillRect(px + 4, py + 12, 3, 3, boots);
          crew.fillRect(px + 9, py + 12, 3, 3, boots);
        }
      }
    }
  }
});

fs.writeFileSync(path.join(outDir, 'characters/crew.png'), crew.toBuffer());
console.log('All pixel art assets generated successfully!');
