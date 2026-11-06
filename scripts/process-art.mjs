// 把 AI 產的綠底或洋紅底圖去背、裁切、縮小，輸出到 public/art。
// 用法：node scripts/process-art.mjs <原圖資料夾> [只處理的編號...]
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const source = process.argv[2];
if (!source) throw new Error('請提供原圖資料夾');
const only = process.argv.slice(3);

const SYMBOL = 360;
const POSE = 900;
const TEXT = 1000;
const TEXT_SMALL = 560;
const STALL = 620;

// 外框開口（原圖座標），用來把開口對準遊戲裡的轉盤。
const HOLE = { left: 450, right: 958, top: 216, bottom: 609 };
const SCREEN_HOLE = { width: 504, height: 328 };
const FRAME_X = SCREEN_HOLE.width / (HOLE.right - HOLE.left);
const FRAME_Y = SCREEN_HOLE.height / (HOLE.bottom - HOLE.top);
const FRAME_WINDOW = Math.round(720 / FRAME_X);
const RING_MARGIN = 34;

const JOBS = [
  ['001', 'agong-base', { h: POSE }],
  ['002', 'agong-jackpot', { h: POSE }],
  ['011', 'agong-nervous', { h: POSE, rightHalf: true }],
  ['012', 'agong-throw', { h: POSE, rightHalf: true }],
  ['013', 'agong-sad', { h: POSE, rightHalf: true }],
  ['014', 'agong-run', { h: POSE, rightHalf: true }],
  ['003', 'sym-1', { s: SYMBOL }],
  ['004', 'sym-2', { s: SYMBOL }],
  ['005', 'sym-3', { s: SYMBOL }],
  ['006', 'sym-4', { s: SYMBOL }],
  ['007', 'sym-5', { s: SYMBOL }],
  ['008', 'sym-6', { s: SYMBOL }],
  ['009', 'sym-7', { s: SYMBOL }],
  ['010', 'sym-8', { s: SYMBOL }],
  ['015', 'bg-market', { bg: true }],
  ['016', 'bg-temple', { bg: true }],

  ['017', 'text-title', { long: TEXT }],
  ['018', 'text-reach', { long: TEXT }],
  ['019', 'text-chance', { long: TEXT }],
  ['020', 'text-luck', { long: TEXT, key: 'magenta' }],
  ['021', 'text-hot', { long: TEXT }],
  ['022', 'text-superhot', { long: TEXT }],
  ['023', 'text-sheng', { long: TEXT }],
  ['024', 'text-xiao', { long: TEXT }],
  ['025', 'text-yin', { long: TEXT }],
  ['026', 'text-third', { long: TEXT }],
  ['027', 'text-triple', { long: TEXT, key: 'magenta' }],
  ['028', 'text-revive', { long: TEXT }],
  ['029', 'text-jackpot', { long: TEXT }],
  ['030', 'text-parade', { long: TEXT }],
  ['031', 'text-rush', { long: TEXT }],
  ['032', 'text-chain', { long: TEXT }],
  ['033', 'text-last', { long: TEXT }],
  ['034', 'text-success', { long: TEXT, key: 'magenta' }],
  ['035', 'text-over', { long: TEXT }],
  ['036', 'text-total', { long: TEXT_SMALL }],
  ['037', 'text-hold', { long: TEXT_SMALL }],
  ['038', 'text-stop-1', { long: TEXT }],
  ['039', 'text-stop-2', { long: TEXT }],
  ['040', 'text-stop-3', { long: TEXT }],
  ['041', 'text-balls', { long: TEXT_SMALL }],
  ['042', 'digit', { split: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'comma', 'x'], rows: [5, 5, 2], splitH: 220 }],
  ['043', 'digit-rainbow-7', { long: 320, key: 'magenta' }],

  ['044', 'frame-back', { islands: false, area: { left: Math.round((HOLE.left + HOLE.right - FRAME_WINDOW) / 2), top: 0, width: FRAME_WINDOW, height: 768 }, fill: [1080, Math.round(768 * FRAME_Y * 1.5)], noTrim: true }],
  ['044', 'frame-ring', { islands: false, area: { left: HOLE.left - RING_MARGIN, top: HOLE.top - RING_MARGIN, width: HOLE.right - HOLE.left + RING_MARGIN * 2, height: HOLE.bottom - HOLE.top + RING_MARGIN * 2 }, fill: [1000, 700], noTrim: true }],
  ['045', 'pocket', { long: 520 }],
  ['046', 'tray', { bgArea: { left: 0, top: 190, width: 1408, height: 410 }, bgSize: [1080, 294] }],
  ['047', 'roof', { long: 1200, fillRatio: 0.6 }],
  ['048', 'lamp', { split: ['off', 'on'], splitS: 160 }],
  ['049', 'jiao', { split: ['round', 'flat'], splitS: 360 }],
  ['050', 'gong', { fill: [360, 360] }],
  ['051', 'lantern', { lantern: true, h: 220 }],
  ['052', 'orb', { split: ['ball', 'peg'], splitS: 64 }],
  ['053', 'paper', { split: ['1', '2', '3', '4', '5'], splitH: 72 }],
  ['054', 'gate', { long: 1100 }],
  ['055', 'street-far', { bgArea: { left: 0, top: 0, width: 1408, height: 768 }, bgSize: [1408, 768] }],
  ['056', 'street-road', { bgArea: { left: 0, top: 0, width: 1408, height: 768 }, bgSize: [880, 480] }],
  ['057', 'stall-1', { h: STALL }],
  ['058', 'stall-2', { h: STALL }],
  ['059', 'stall-3', { h: STALL }],
  ['060', 'stall-4', { h: STALL }],
  ['061', 'stall-5', { h: STALL }],
  ['大牌樓多生的', 'stall-6', { h: STALL }],
];

// 綠色佔比越高越透明，並把邊緣反射的綠光壓掉。
function keyGreen(data, width, height) {
  for (let i = 0; i < width * height; i += 1) {
    const p = i * 4;
    const r = data[p];
    const g = data[p + 1];
    const b = data[p + 2];
    const spill = g - Math.max(r, b);
    if (spill > 12) {
      const alpha = Math.max(0, Math.min(1, 1 - (spill - 12) / 58));
      data[p + 3] = Math.round(alpha * 255);
      data[p + 1] = Math.max(r, b);
    }
  }
}

// 洋紅底：彩虹字裡有桃紅色，只把接近純洋紅的像素去掉，再從邊緣的混色還原原色。
function keyMagenta(data, width, height) {
  for (let i = 0; i < width * height; i += 1) {
    const p = i * 4;
    const r = data[p];
    const g = data[p + 1];
    const b = data[p + 2];
    const strength = Math.min(r, b) - g - Math.abs(r - b) * 1.5;
    if (strength <= 70) continue;
    const alpha = Math.max(0, 1 - (strength - 70) / 90);
    data[p + 3] = Math.round(alpha * 255);
    if (alpha > 0.02) {
      data[p] = Math.max(0, Math.min(255, (r - (1 - alpha) * 255) / alpha));
      data[p + 1] = Math.max(0, Math.min(255, g / alpha));
      data[p + 2] = Math.max(0, Math.min(255, (b - (1 - alpha) * 255) / alpha));
    }
  }
}

function findComponents(data, width, height) {
  const label = new Int32Array(width * height).fill(-1);
  const parts = [];
  const stack = [];
  for (let start = 0; start < width * height; start += 1) {
    if (label[start] !== -1 || data[start * 4 + 3] < 24) continue;
    const id = parts.length;
    const part = { id, size: 0, left: width, right: 0, top: height, bottom: 0 };
    label[start] = id;
    stack.push(start);
    while (stack.length) {
      const at = stack.pop();
      part.size += 1;
      const x = at % width;
      const y = (at - x) / width;
      part.left = Math.min(part.left, x);
      part.right = Math.max(part.right, x);
      part.top = Math.min(part.top, y);
      part.bottom = Math.max(part.bottom, y);
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const n = ny * width + nx;
        if (label[n] === -1 && data[n * 4 + 3] >= 24) {
          label[n] = id;
          stack.push(n);
        }
      }
    }
    parts.push(part);
  }
  return { label, parts };
}

// 只留下主體和夠大的碎片；角落的小標記和雜點會在這一步被清掉。
function dropIslands(data, width, height) {
  const { label, parts } = findComponents(data, width, height);
  if (!parts.length) return;
  const biggest = Math.max(...parts.map((part) => part.size));
  const minKeep = width * height * 0.0004;
  for (let i = 0; i < width * height; i += 1) {
    const id = label[i];
    if (id === -1) continue;
    const part = parts[id];
    const corner = part.left > width * 0.86 && part.top > height * 0.82;
    if (part.size !== biggest && (part.size < minKeep || corner)) data[i * 4 + 3] = 0;
  }
}

// 燈籠原圖帶到機台外框，用燈籠的輪廓挖出來。
const LANTERN_MASK = `<svg width="1408" height="768" xmlns="http://www.w3.org/2000/svg">
  <rect x="582" y="30" width="248" height="90"/>
  <ellipse cx="704" cy="322" rx="256" ry="222"/>
  <rect x="608" y="510" width="196" height="60"/>
  <polygon points="620,560 790,560 862,700 830,736 610,742 588,680"/>
</svg>`;

function sourcePath(name) {
  for (const ext of ['.png', '.jpg', '.jpeg', '.webp']) {
    const file = path.join(source, `${name}${ext}`);
    if (fs.existsSync(file)) return file;
  }
  throw new Error(`找不到 ${name}`);
}

async function writeWebp(pipeline, out, quality = 88) {
  const file = `public/art/${out}.webp`;
  const result = await pipeline.webp({ quality, alphaQuality: 95 }).toFile(file);
  console.log(out, `${result.width}x${result.height}`, `${Math.round(result.size / 1024)}KB`);
}

async function splitParts(raw, out, opts) {
  const { data, width, height } = raw;
  const { label, parts } = findComponents(data, width, height);
  const keep = [...parts].sort((a, b) => b.size - a.size).slice(0, opts.split.length);
  if (keep.length !== opts.split.length) throw new Error(`${out} 只切出 ${keep.length} 塊`);
  let ordered = [];
  if (opts.rows) {
    const byY = [...keep].sort((a, b) => (a.top + a.bottom) - (b.top + b.bottom));
    let at = 0;
    for (const count of opts.rows) {
      ordered.push(...byY.slice(at, at + count).sort((a, b) => a.left - b.left));
      at += count;
    }
  } else {
    ordered = [...keep].sort((a, b) => a.left - b.left);
  }
  for (let n = 0; n < ordered.length; n += 1) {
    const part = ordered[n];
    const w = part.right - part.left + 1;
    const h = part.bottom - part.top + 1;
    const piece = Buffer.alloc(w * h * 4);
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const from = (y + part.top) * width + x + part.left;
        if (label[from] !== part.id) continue;
        data.copy(piece, (y * w + x) * 4, from * 4, from * 4 + 4);
      }
    }
    const image = sharp(piece, { raw: { width: w, height: h, channels: 4 } });
    const resized = opts.splitS
      ? image.resize(opts.splitS, opts.splitS, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      : image.resize({ height: opts.splitH });
    await writeWebp(resized, `${out}-${opts.split[n]}`);
  }
}

for (const [name, out, opts] of JOBS) {
  if (only.length && !only.includes(name)) continue;
  let image = sharp(sourcePath(name));
  const meta = await image.metadata();
  if (opts.bg) {
    await image.resize(720, 1080, { fit: 'cover' }).webp({ quality: 84 }).toFile(`public/art/${out}.webp`);
    console.log(out, 'background');
    continue;
  }
  if (opts.bgArea) {
    await writeWebp(image.extract(opts.bgArea).resize(opts.bgSize[0], opts.bgSize[1], { fit: 'fill' }), out, 82);
    continue;
  }
  if (opts.rightHalf) {
    const left = Math.ceil(meta.width / 2) + 16;
    image = image.extract({ left, top: 0, width: meta.width - left, height: meta.height });
  }
  if (opts.area) image = image.extract(opts.area);
  const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  (opts.key === 'magenta' ? keyMagenta : keyGreen)(data, info.width, info.height);
  if (opts.lantern) {
    const mask = await sharp(Buffer.from(LANTERN_MASK)).ensureAlpha().raw().toBuffer();
    for (let i = 0; i < info.width * info.height; i += 1) {
      data[i * 4 + 3] = Math.round((data[i * 4 + 3] * mask[i * 4 + 3]) / 255);
    }
  }
  if (opts.split) {
    await splitParts({ data, width: info.width, height: info.height }, out, opts);
    continue;
  }
  if (opts.islands !== false) dropIslands(data, info.width, info.height);
  const png = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
  const cut = opts.noTrim ? png : await sharp(png).trim({ threshold: 2 }).png().toBuffer();
  let resized;
  if (opts.fill) resized = sharp(cut).resize(opts.fill[0], opts.fill[1], { fit: 'fill' });
  else if (opts.long) {
    const m = await sharp(cut).metadata();
    const scale = opts.long / Math.max(m.width, m.height);
    resized = sharp(cut).resize(Math.round(m.width * scale), Math.round(m.height * scale * (opts.fillRatio ?? 1)), { fit: 'fill' });
  } else if (opts.h) resized = sharp(cut).resize({ height: opts.h, fit: 'inside', withoutEnlargement: false });
  else resized = sharp(cut).resize(opts.s, opts.s, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } });
  await writeWebp(resized, out);
}
