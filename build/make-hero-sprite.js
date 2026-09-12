// build/make-hero-sprite.js — สร้าง renderer/assets/sprite-hero.png จากแผนที่พิกเซล ASCII
//
// รัน (จากโฟลเดอร์โปรเจกต์):   node build/make-hero-sprite.js
// ไม่ต้องติดตั้งอะไรเพิ่ม ใช้แค่ fs + zlib ที่ติดมากับ Node
//
// ตัวละคร: "น้องวง" แมวส้มเถ้าแก่น้อยประจำร้านวงเวียน คาดผ้าโพกหัวแดงแบบฮีโร่
// เฟรมละ 24x24 px | 1 แถว = 1 ท่า | เฟรมเรียงซ้าย→ขวา | ช่องที่ไม่ใช้ = โปร่งใส
//
//   แถว 0 idle   4 เฟรม  (วน)     ยืนหายใจ แกว่งหาง กระพริบตา
//   แถว 1 cheer  6 เฟรม  (ครั้งเดียว) ย่อ → กระโดด → ได้เหรียญ → ลงพื้น
//   แถว 2 nod    3 เฟรม  (ครั้งเดียว) ยิ้มหลับตา พยักหน้า
//   แถว 3 sleep  2 เฟรม  (วน)     หลับ Zzz
//   แถว 4 sweat  3 เฟรม  (ครั้งเดียว) กังวล เหงื่อตก
//
// อยากแก้หน้าตา: แก้สตริงในแต่ละชิ้นส่วนด้านล่าง แล้วรันใหม่
// ตัวอักษร 1 ตัว = 1 พิกเซล, '.' = โปร่งใส, ตัวอื่นดูใน PALETTE

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const FRAME = 24;

const PALETTE = {
    O: [43, 23, 8],      // เส้นขอบ
    o: [242, 160, 61],   // ขนส้ม
    d: [201, 112, 31],   // ขนส้มเงา
    l: [255, 224, 170],  // ครีม (พุง/ปาก/อุ้งเท้า)
    p: [245, 138, 138],  // ชมพู (ในหู/แก้ม)
    n: [214, 86, 100],   // จมูก/ลิ้น
    r: [216, 50, 46],    // ผ้าโพกหัว
    R: [150, 28, 30],    // ผ้าโพกหัวเงา
    w: [255, 255, 255],  // ประกายตา
    g: [246, 196, 83],   // เหรียญ
    G: [183, 121, 31],   // เหรียญเงา
    y: [255, 241, 168],  // ประกายวิบวับ
    b: [120, 190, 255],  // หยดเหงื่อ
    B: [60, 120, 200],   // หยดเหงื่อเงา
    z: [220, 228, 255],  // ตัว Z
};

// ---------- ชิ้นส่วน ----------
const HEAD = [
    '..OO..........OO..',
    '.OpoO........OopO.',
    '.OppoOOOOOOOOoppO.',
    'OooooooooooooooooO',
    'OrrrrrrrrrrrrrrrrOrR',
    'OooooooooooooooooORR',
    'OooooooooooooooooO.R',
    'OooooooooooooooooO',
    'OoppoollnnllooppoO',
    'OoooooollllloooooO',
    '.OooooooooooooooO.',
    '..OOOOOOOOOOOOOO..',
];
const HX = 3, HY = 3;

// ตา: [แถวในหัว, คอลัมน์ในหัว, ภาพ]
const EYES = {
    open:  [5, 4, ['wO......wO', 'OO......OO', 'OO......OO']],
    blink: [7, 4, ['OO......OO']],
    happy: [6, 3, ['.OO....OO.', 'O..O..O..O']],
    sleep: [7, 3, ['OOO....OOO']],
    worry: [5, 4, ['.O......O.', 'wO......wO', 'OO......OO']],
};
// ปาก: [แถวในหัว, คอลัมน์ในหัว, ภาพ]
const MOUTH = {
    smile: [9, 6, ['O.OO.O', '.O..O.']],
    open:  [9, 7, ['OnnO', 'OppO', '.OO.']],
    flat:  [9, 8, ['OO']],
    wavy:  [9, 6, ['.O.O.O', 'O.O.O.']],
};
const BODY = [
    'OoollllllooO',
    'OolllllllloO',
    'OolllllllloO',
    'OdoooOOooodO',
    'OddoO..OoddO',
    '.OOOO..OOOO.',
];
const BX = 6, BY = 15;
// แขน: รายการ [x, y, ภาพ] (พิกัดในเฟรม)
const ARMS = {
    down: [[4, 15, ['.O', 'Oo', 'Ol', 'OO']], [18, 15, ['O.', 'oO', 'lO', 'OO']]],
    out:  [[2, 14, ['OO..', 'OloO', '..OO']], [18, 14, ['..OO', 'OolO', 'OO..']]],
    up:   [[2, 11, ['OO', 'lO', 'oO', 'OoO']], [20, 11, ['OO', 'Ol', 'Oo', 'OoO']]],
};
const TAIL = {
    a: [18, 14, ['...OO', '..OoO', '..OoO', '.OoO.', 'OoO..']],
    b: [18, 13, ['..OO.', '..OoO', '...OoO', '..OoO.', '.OoO..']],
};
// เอฟเฟกต์ (ไม่ขยับตามตัว)
const FX = {
    coin:   [[19, 0, ['.OOO.', 'OgygO', 'OggGO', 'OgGGO', '.OOO.']]],
    spark1: [[1, 2, ['.y.', 'yyy', '.y.']]],
    spark2: [[21, 7, ['.y.', 'yyy', '.y.']], [0, 6, ['y']]],
    z1:     [[20, 3, ['zzz', '.z.', 'zzz']]],
    z2:     [[19, 0, ['zzzz', '..z.', '.z..', 'zzzz']], [22, 5, ['zz', 'zz']]],
    sweat1: [[20, 5, ['.b.', 'bbb', 'bBb', '.b.']]],
    sweat2: [[20, 7, ['.b.', 'bbb', 'bBb', '.b.']]],
};

// ---------- ท่าทาง ----------
// dy = ขยับทั้งตัว (ลบ = ขึ้น), hdy = ขยับเฉพาะหัว
const ANIMS = [
    ['idle', [
        {}, { tail: 'b' }, { dy: 1, tail: 'b' }, { eyes: 'blink' },
    ]],
    ['cheer', [
        { dy: 1, arms: 'out', mouth: 'open' },
        { dy: -2, arms: 'up', eyes: 'happy', mouth: 'open' },
        { dy: -3, arms: 'up', eyes: 'happy', mouth: 'open', fx: ['coin', 'spark1'] },
        { dy: -2, arms: 'up', eyes: 'happy', mouth: 'open', fx: ['coin', 'spark2'] },
        { dy: 0, arms: 'out', eyes: 'happy', mouth: 'open', fx: ['coin'] },
        { dy: 1, arms: 'out', eyes: 'happy' },
    ]],
    ['nod', [
        { hdy: 1, eyes: 'happy' }, { hdy: 2, eyes: 'happy' }, { hdy: 1, eyes: 'happy' },
    ]],
    ['sleep', [
        { dy: 1, eyes: 'sleep', mouth: 'flat', tail: 'b', fx: ['z1'] },
        { dy: 1, hdy: 1, eyes: 'sleep', mouth: 'flat', tail: 'b', fx: ['z2'] },
    ]],
    ['sweat', [
        { eyes: 'worry', mouth: 'wavy', fx: ['sweat1'] },
        { eyes: 'worry', mouth: 'wavy', fx: ['sweat2'] },
        { dy: 1, eyes: 'worry', mouth: 'wavy', arms: 'out' },
    ]],
];

// ---------- วาด ----------
const COLS = Math.max(...ANIMS.map(a => a[1].length));
const W = FRAME * COLS, H = FRAME * ANIMS.length;
const px = Buffer.alloc(W * H * 4); // RGBA, เริ่มโปร่งใส

function blit(fx, fy, ox, oy, rows) {
    rows.forEach((row, j) => {
        [...row].forEach((c, i) => {
            const rgb = PALETTE[c];
            if (!rgb) return;
            const x = ox + i, y = oy + j;
            if (x < 0 || x >= FRAME || y < 0 || y >= FRAME) return;
            const k = ((fy + y) * W + (fx + x)) * 4;
            px[k] = rgb[0]; px[k + 1] = rgb[1]; px[k + 2] = rgb[2]; px[k + 3] = 255;
        });
    });
}

function drawFrame(fx, fy, o) {
    const dy = o.dy || 0, hdy = o.hdy || 0;
    const t = TAIL[o.tail || 'a'];
    blit(fx, fy, t[0], t[1] + dy, t[2]);
    blit(fx, fy, BX, BY + dy, BODY);
    const hy = HY + dy + hdy;
    blit(fx, fy, HX, hy, HEAD);
    const e = EYES[o.eyes || 'open'];
    blit(fx, fy, HX + e[1], hy + e[0], e[2]);
    const m = MOUTH[o.mouth || 'smile'];
    blit(fx, fy, HX + m[1], hy + m[0], m[2]);
    ARMS[o.arms || 'down'].forEach(a => blit(fx, fy, a[0], a[1] + dy, a[2]));
    (o.fx || []).forEach(name => FX[name].forEach(f => blit(fx, fy, f[0], f[1], f[2])));
}

ANIMS.forEach(([, frames], row) => {
    frames.forEach((o, col) => drawFrame(col * FRAME, row * FRAME, o));
});

// ---------- เขียน PNG (ไม่ต้องใช้ไลบรารี) ----------
const CRC_TABLE = new Int32Array(256).map((_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c;
});
function crc32(buf) {
    let c = -1;
    for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
}
function chunk(type, data) {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
const raw = Buffer.alloc((W * 4 + 1) * H);
for (let y = 0; y < H; y++) px.copy(raw, y * (W * 4 + 1) + 1, y * W * 4, (y + 1) * W * 4);
const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
]);

const outDir = path.join(__dirname, '..', 'renderer', 'assets');
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, 'sprite-hero.png');
fs.writeFileSync(outPath, png);
console.log(`สร้างแล้ว: ${outPath} (${W}x${H}, ${ANIMS.length} ท่า, เฟรม ${FRAME}x${FRAME})`);
