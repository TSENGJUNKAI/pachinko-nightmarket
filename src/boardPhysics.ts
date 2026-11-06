// 釘盤的幾何和物理，不碰畫面。三種釘盤的排法都在這裡，改手感只動這個檔案。
import Matter from 'matter-js';
import type { MachineId } from './machines';

const { Bodies, Body } = Matter;

export const BOARD = {
  left: 26,
  right: 694,
  top: 124,
  floor: 882,
  lcd: { left: 88, right: 632, top: 170, bottom: 530 },
  pocket: { x: 360, y: 812, width: 58 },
};

export const BALL_RADIUS = 9;
export const PEG_RADIUS = 5;
export const STEP = 1000 / 120;
// Matter 的小圓預設只有 10 個邊，平的那面會貼在緩坡上不滾，所以邊數要多。
export const BALL_SIDES = 36;
export const GRAVITY = { x: 0, y: 1, scale: 0.0011 };
// 靜摩擦歸零，珠子才不會黏在緩坡上。
export const BALL_OPTIONS = { restitution: 0.5, friction: 0.01, frictionStatic: 0, frictionAir: 0.006, density: 0.002, label: 'ball' };

// 珠子停太久：先輕推，還不動就收掉，才不會一直卡在畫面上。
const STILL_SPEED = 0.15;
const NUDGE_AFTER = 0.5;
const REMOVE_AFTER = 2.5;

// 屋頂斜到珠子一定滾得動。
const ROOF = { apexY: 150, edgeY: 180 };

export const GUIDES = [
  { x1: BOARD.left, y1: 580, x2: 150, y2: 626 },
  { x1: BOARD.right, y1: 580, x2: 570, y2: 626 },
];

export interface Point {
  x: number;
  y: number;
}

export function railPoint(t: number): Point {
  // 軌道：沿左牆往上，再沿頂部弧線往右。
  const { left, right, top, floor } = BOARD;
  const riseEnd = 0.45;
  if (t < riseEnd) {
    return { x: left - 11, y: floor - ((floor - (top + 110)) * t) / riseEnd };
  }
  const arc = ((t - riseEnd) / (1 - riseEnd)) * Math.PI;
  const cx = (left + right) / 2;
  const rx = (right - left) / 2 + 6;
  return { x: cx - Math.cos(arc) * rx, y: top + 110 - Math.sin(arc) * 96 };
}

function roofY(x: number) {
  const { lcd } = BOARD;
  const mid = (lcd.left + lcd.right) / 2;
  const half = (lcd.right - lcd.left) / 2 + 4;
  return ROOF.apexY + ((ROOF.edgeY - ROOF.apexY) * Math.abs(x - mid)) / half;
}

// 力道決定珠子從軌道的哪裡飛出來，真實機台每顆都有一點誤差。
export function releaseFor(power: number, rng: () => number = Math.random) {
  const clamped = Math.max(0, Math.min(1, power));
  const release = 0.5 + clamped * 0.42 + (rng() - 0.5) * 0.035;
  const before = railPoint(release - 0.01);
  const at = railPoint(release);
  const { lcd, top } = BOARD;
  // 飛出點在轉盤上方時要留在屋頂之上，珠子才不會生在屋頂裡。
  const ceiling = at.x > lcd.left - BALL_RADIUS && at.x < lcd.right + BALL_RADIUS ? roofY(at.x) - BALL_RADIUS - 6 : Infinity;
  return {
    release,
    x: at.x,
    y: Math.min(Math.max(at.y, top + 12), ceiling),
    vx: (at.x - before.x) * 0.6,
    vy: (at.y - before.y) * 0.5 + (rng() - 0.5) * 1.5,
  };
}

function slope(x1: number, y1: number, x2: number, y2: number) {
  const length = Math.hypot(x2 - x1, y2 - y1);
  return Bodies.rectangle((x1 + x2) / 2, (y1 + y2) / 2, length, 8, {
    isStatic: true,
    angle: Math.atan2(y2 - y1, x2 - x1),
    restitution: 0.35,
    friction: 0,
    frictionStatic: 0,
    label: 'guide',
  });
}

export function buildStatics() {
  const { left, right, top, floor, lcd, pocket } = BOARD;
  const wall = { isStatic: true, restitution: 0.4, friction: 0.02 };
  const mid = (lcd.left + lcd.right) / 2;
  return [
    Bodies.rectangle(left - 20, (top + floor) / 2, 40, floor - top + 200, wall),
    Bodies.rectangle(right + 20, (top + floor) / 2, 40, floor - top + 200, wall),
    Bodies.rectangle((left + right) / 2, top - 22, right - left + 80, 44, wall),
    // 轉盤本身是障礙物，頂部是斜面，珠子會滾向兩側。
    // 碰撞體比畫面矮一點，屋頂斜面才不會被平頂擋住，珠子停在上面。
    Bodies.rectangle(mid, (ROOF.edgeY + 12 + lcd.bottom) / 2, lcd.right - lcd.left, lcd.bottom - ROOF.edgeY - 12, wall),
    slope(lcd.left - 4, ROOF.edgeY, mid, ROOF.apexY),
    slope(lcd.right + 4, ROOF.edgeY, mid, ROOF.apexY),
    // 兩側導軌把一部分珠子往中間送。
    ...GUIDES.map((guide) => slope(guide.x1, guide.y1, guide.x2, guide.y2)),
    // 洞口兩邊的擋板，形成漏斗。
    slope(pocket.x - pocket.width / 2 - 34, pocket.y - 42, pocket.x - pocket.width / 2 - 2, pocket.y + 2),
    slope(pocket.x + pocket.width / 2 + 34, pocket.y - 42, pocket.x + pocket.width / 2 + 2, pocket.y + 2),
  ];
}

export function buildSensors() {
  const { left, right, floor, pocket } = BOARD;
  return {
    pocket: Bodies.rectangle(pocket.x, pocket.y + 4, pocket.width - 6, 14, { isStatic: true, isSensor: true, label: 'pocket' }),
    floor: Bodies.rectangle((left + right) / 2, floor + 16, right - left + 40, 20, { isStatic: true, isSensor: true, label: 'floor' }),
  };
}

export function buildPegBodies(points: Point[]) {
  return points.map((point) => Bodies.circle(point.x, point.y, PEG_RADIUS, { isStatic: true, restitution: 0.55, friction: 0.01, label: 'peg' }));
}

// 轉盤兩側的通道寬 62，釘子放中線附近，兩邊的縫都比珠子寬，才不會卡。
function sidePegs(): Point[] {
  const { left, right, lcd } = BOARD;
  const leftMid = (left + lcd.left) / 2;
  const rightMid = (lcd.right + right) / 2;
  const points: Point[] = [];
  // 第一根離屋頂邊緣遠一點，滾下來的珠子才過得去。
  for (let y = 224, i = 0; y < 560; y += 46, i += 1) {
    const swing = i % 2 ? -4 : 4;
    points.push({ x: leftMid - swing, y }, { x: rightMid + swing, y });
  }
  return points;
}

function mirrored(points: Point[]): Point[] {
  const { pocket } = BOARD;
  return points.flatMap((point) => [point, { x: pocket.x * 2 - point.x, y: point.y }]);
}

// 由 a 到 b 排一串釘子，間距小到珠子過不去，等於一條釘子做的導軌。
function chain(a: Point, b: Point, spacing = 13): Point[] {
  const count = Math.max(1, Math.round(Math.hypot(b.x - a.x, b.y - a.y) / spacing));
  return Array.from({ length: count + 1 }, (_, i) => ({ x: a.x + ((b.x - a.x) * i) / count, y: a.y + ((b.y - a.y) * i) / count }));
}

interface GridOptions {
  spacingX: number;
  spacingY: number;
  keep: (x: number, y: number) => boolean;
}

function grid({ spacingX, spacingY, keep }: GridOptions): Point[] {
  const { left, right, lcd, floor } = BOARD;
  const points: Point[] = [];
  let row = 0;
  for (let y = 560; y < floor - 34; y += spacingY) {
    const offset = row % 2 ? spacingX / 2 : 0;
    for (let x = left + 40 + offset; x < right - 30; x += spacingX) {
      const nearGuide = (x < 176 || x > 544) && y < 650;
      if (y >= lcd.bottom + 20 && !nearGuide && keep(x, y)) points.push({ x, y });
    }
    row += 1;
  }
  return points;
}

function nearPocket(x: number, y: number, marginX: number, above: number) {
  const { pocket } = BOARD;
  return Math.abs(x - pocket.x) < pocket.width / 2 + marginX && y > pocket.y - above && y < pocket.y + 30;
}

// 最小力道的珠子路線很固定，導軌出口放一根釘子打散，才不會有一招打天下的力道。
const GUIDE_EXIT_PEG: Point = { x: 186, y: 644 };

function oldLayout(): Point[] {
  const { pocket } = BOARD;
  return [
    ...sidePegs(),
    ...mirrored([GUIDE_EXIT_PEG]),
    ...grid({ spacingX: 52, spacingY: 40, keep: (x, y) => !nearPocket(x, y, 40, 60) }),
    // 天釘：洞口正上方的兩根，決定珠子進不進得去。
    ...mirrored([{ x: pocket.x - pocket.width / 2 + 3, y: pocket.y - 52 }]),
  ];
}

// 穩定台：兩條釘子漏斗把中段的珠子導向洞口。
const STEADY_FUNNEL = { from: { x: 262, y: 704 }, to: { x: 298, y: 744 } };

function steadyLayout(): Point[] {
  const { pocket } = BOARD;
  const { from, to } = STEADY_FUNNEL;
  const clearOfFunnel = (x: number, y: number) => {
    const mx = Math.min(x, pocket.x * 2 - x);
    if (mx < from.x - 24 || mx > to.x + 34) return true;
    const lineY = from.y + ((to.y - from.y) * (mx - from.x)) / (to.x - from.x);
    return y < lineY - 44;
  };
  return [
    ...sidePegs(),
    ...grid({ spacingX: 52, spacingY: 40, keep: (x, y) => clearOfFunnel(x, y) && !nearPocket(x, y, 60, 90) }),
    ...mirrored(chain(from, to)),
    ...mirrored([{ x: pocket.x - pocket.width / 2 - 2, y: pocket.y - 56 }]),
  ];
}

// 狂暴台：釘子稀疏彈得亂，洞口前有傘形擋釘，能進去的珠子很少。
function wildLayout(): Point[] {
  const { pocket } = BOARD;
  return [
    ...sidePegs(),
    // 導軌出口多擋一根，把順著滑下來的珠子往外彈。
    ...mirrored([GUIDE_EXIT_PEG, { x: 204, y: 656 }]),
    ...grid({ spacingX: 78, spacingY: 56, keep: (x, y) => !nearPocket(x, y, 70, 130) }),
    { x: pocket.x, y: pocket.y - 104 },
    ...mirrored([
      { x: pocket.x - 26, y: pocket.y - 84 },
      { x: pocket.x - 52, y: pocket.y - 64 },
      { x: pocket.x - 24, y: pocket.y - 46 },
    ]),
  ];
}

const LAYOUTS: Record<MachineId, () => Point[]> = { old: oldLayout, steady: steadyLayout, wild: wildLayout };

export function pegLayout(id: MachineId): Point[] {
  return LAYOUTS[id]();
}

// 物理引擎的緩坡上珠子會爬得極慢，屋頂上要再推一把才像真的滾下去。
export function assistRoof(body: Matter.Body) {
  const { lcd, pocket } = BOARD;
  if (body.position.y >= lcd.top || body.position.x < lcd.left || body.position.x > lcd.right || body.speed > 1.2) return;
  Body.applyForce(body, body.position, { x: Math.sign(body.position.x - pocket.x || 1) * 0.00012, y: 0 });
}

export type StillAction = 'none' | 'nudge' | 'remove';

export function stillAction(stillTime: number): StillAction {
  if (stillTime >= REMOVE_AFTER) return 'remove';
  if (stillTime >= NUDGE_AFTER) return 'nudge';
  return 'none';
}

export function isStill(body: Matter.Body) {
  return body.speed < STILL_SPEED;
}

export function nudge(body: Matter.Body, rng: () => number = Math.random) {
  // 停在屋頂上就往兩側推，其他地方隨機推。
  const onRoof = body.position.y < BOARD.lcd.top;
  const x = onRoof ? Math.sign(body.position.x - BOARD.pocket.x || 1) * 0.0004 : (rng() - 0.5) * 0.0006;
  Body.applyForce(body, body.position, { x, y: onRoof ? 0 : -0.0004 });
}
