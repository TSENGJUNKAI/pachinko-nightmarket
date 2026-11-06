// 釘盤：真實物理。珠子沿軌道射上去、撞釘子，掉進洞口才算數。
import { Container, Graphics, Sprite } from 'pixi.js';
import gsap from 'gsap';
import Matter from 'matter-js';
import type { ArtBook } from './art';
import type { AudioKit } from './audio';

const { Bodies, Body, Composite, Engine, Events } = Matter;

export const BOARD = {
  left: 26,
  right: 694,
  top: 124,
  floor: 882,
  lcd: { left: 88, right: 632, top: 170, bottom: 530 },
  pocket: { x: 360, y: 812, width: 58 },
};

const BALL_RADIUS = 9;
const PEG_RADIUS = 5;
const MAX_BALLS = 14;
const MAX_AGE = 16;
const STEP = 1000 / 120;
const POCKET_WIDTH = 214;
const POCKET_HOLE_Y = 0.617;

interface Ball {
  body: Matter.Body;
  view: Sprite;
  age: number;
  force: string;
}

function railPoint(t: number) {
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

export class Board {
  readonly root = new Container();
  // 珠子真的進洞時呼叫，參數是演出測試指定的結果（平常為空字串）。
  onPocket: (force: string) => void = () => undefined;
  paused = false;

  private readonly engine = Engine.create({ gravity: { x: 0, y: 1, scale: 0.0011 } });
  private readonly railLayer = new Graphics();
  private readonly pegLayer = new Container();
  private readonly ballLayer = new Container();
  private readonly pocketGlow = new Graphics();
  private readonly pocketView: Sprite;
  private readonly pegFlash = new Graphics();
  private readonly balls = new Map<number, Ball>();
  private accumulator = 0;
  private lastTick = 0;
  private flying = 0;
  private readonly pegBodies: Matter.Body[] = [];
  private readonly pocketSensor: Matter.Body;
  private readonly floorSensor: Matter.Body;

  constructor(private readonly audio: AudioKit, private readonly art: ArtBook) {
    const { left, right, top, floor, lcd, pocket } = BOARD;
    const wall = { isStatic: true, restitution: 0.4, friction: 0.02 };
    const statics: Matter.Body[] = [
      Bodies.rectangle(left - 20, (top + floor) / 2, 40, floor - top + 200, wall),
      Bodies.rectangle(right + 20, (top + floor) / 2, 40, floor - top + 200, wall),
      Bodies.rectangle((left + right) / 2, top - 22, right - left + 80, 44, wall),
      // 轉盤本身是障礙物，頂部是斜面，珠子會滾向兩側。
      Bodies.rectangle((lcd.left + lcd.right) / 2, (lcd.top + lcd.bottom) / 2, lcd.right - lcd.left, lcd.bottom - lcd.top, wall),
      ...this.roofSlopes(),
      // 兩側導軌把一部分珠子往中間送。
      this.slope(left, 580, 150, 626),
      this.slope(right, 580, 570, 626),
      // 洞口兩邊的擋板，形成漏斗。
      this.slope(pocket.x - pocket.width / 2 - 34, pocket.y - 42, pocket.x - pocket.width / 2 - 2, pocket.y + 2),
      this.slope(pocket.x + pocket.width / 2 + 34, pocket.y - 42, pocket.x + pocket.width / 2 + 2, pocket.y + 2),
    ];

    this.pocketSensor = Bodies.rectangle(pocket.x, pocket.y + 4, pocket.width - 6, 14, { isStatic: true, isSensor: true, label: 'pocket' });
    this.floorSensor = Bodies.rectangle((left + right) / 2, floor + 16, right - left + 40, 20, { isStatic: true, isSensor: true, label: 'floor' });

    this.buildPegs();
    Composite.add(this.engine.world, [...statics, ...this.pegBodies, this.pocketSensor, this.floorSensor]);
    Events.on(this.engine, 'collisionStart', (event) => this.onCollision(event));

    this.pocketView = new Sprite(art.pocket);
    this.drawBoard();
    this.pegFlash.blendMode = 'add';
    // 洞口在釘子下面，才不會有被蓋住卻撞得到的釘子。
    this.root.addChild(this.railLayer, this.pocketView, this.pocketGlow, this.pegLayer, this.pegFlash, this.ballLayer);
    this.pocketGlow.alpha = 0;
  }

  private roofSlopes() {
    const { lcd } = BOARD;
    const mid = (lcd.left + lcd.right) / 2;
    return [this.slope(lcd.left - 4, lcd.top + 2, mid, lcd.top - 10), this.slope(lcd.right + 4, lcd.top + 2, mid, lcd.top - 10)];
  }

  private slope(x1: number, y1: number, x2: number, y2: number) {
    const length = Math.hypot(x2 - x1, y2 - y1);
    return Bodies.rectangle((x1 + x2) / 2, (y1 + y2) / 2, length, 8, {
      isStatic: true,
      angle: Math.atan2(y2 - y1, x2 - x1),
      restitution: 0.35,
      friction: 0.01,
      label: 'guide',
    });
  }

  private buildPegs() {
    const { left, right, lcd, floor, pocket } = BOARD;
    const pegOptions = { isStatic: true, restitution: 0.55, friction: 0.01, label: 'peg' };
    const add = (x: number, y: number) => {
      this.pegBodies.push(Bodies.circle(x, y, PEG_RADIUS, pegOptions));
    };
    // 轉盤左右兩側的窄通道。
    for (let y = 190; y < 560; y += 46) {
      const offset = Math.round((y - 190) / 46) % 2 ? 0 : 18;
      add(left + 16 + offset, y);
      add(right - 16 - offset, y);
    }
    // 轉盤下方的主釘陣。
    let row = 0;
    for (let y = 560; y < floor - 34; y += 40) {
      const xOffset = row % 2 ? 26 : 0;
      for (let x = left + 40 + xOffset; x < right - 30; x += 52) {
        const nearPocket = Math.abs(x - pocket.x) < pocket.width / 2 + 40 && y > pocket.y - 60 && y < pocket.y + 30;
        const nearLcd = y < lcd.bottom + 20;
        const nearGuide = (x < 176 || x > 544) && y < 650;
        if (!nearPocket && !nearLcd && !nearGuide) add(x, y);
      }
      row += 1;
    }
    // 天釘：洞口正上方的兩根，決定珠子進不進得去。
    add(pocket.x - pocket.width / 2 + 3, pocket.y - 52);
    add(pocket.x + pocket.width / 2 - 3, pocket.y - 52);
  }

  private drawBoard() {
    const { left, right, pocket } = BOARD;
    const g = this.railLayer;
    // 發射軌道。
    const start = railPoint(0);
    g.moveTo(start.x, start.y);
    for (let i = 1; i <= 60; i += 1) {
      const p = railPoint(i / 60);
      g.lineTo(p.x, p.y);
    }
    g.stroke({ width: 22, color: 0x14060f, alpha: 0.72, join: 'round' });

    this.pegBodies.forEach((peg) => {
      const sprite = new Sprite(this.art.peg);
      sprite.anchor.set(0.5);
      sprite.width = PEG_RADIUS * 2 + 3;
      sprite.height = PEG_RADIUS * 2 + 3;
      sprite.position.set(peg.position.x, peg.position.y);
      this.pegLayer.addChild(sprite);
    });

    const line = (x1: number, y1: number, x2: number, y2: number) => {
      g.moveTo(x1, y1).lineTo(x2, y2).stroke({ width: 8, color: 0xffc21a, cap: 'round' });
    };
    line(left, 580, 150, 626);
    line(right, 580, 570, 626);

    // 圖裡的黑洞對準感應區，兩側金色擋板就是物理上的漏斗。
    const w = pocket.width;
    const v = this.pocketView;
    v.anchor.set(0.5, POCKET_HOLE_Y);
    v.scale.set(POCKET_WIDTH / this.art.pocket.width);
    v.position.set(pocket.x, pocket.y + 8);

    this.pocketGlow.ellipse(pocket.x, pocket.y + 6, w / 2 + 34, 38).fill(0xfff0a0);
    this.pocketGlow.blendMode = 'add';
  }

  get ballCount() {
    return this.balls.size + this.flying;
  }

  // power 是 0 到 1。力道決定珠子從軌道的哪裡飛出來。
  launch(power: number, force = '') {
    if (this.paused || this.ballCount >= MAX_BALLS) return false;
    const view = this.makeBallView();
    const start = railPoint(0);
    view.position.set(start.x, start.y);
    this.ballLayer.addChild(view);
    this.audio.launch();
    this.flying += 1;

    // 真實機台每顆力道都有一點誤差，同樣的力道才不會走同一條路。
    const release = 0.5 + Math.max(0, Math.min(1, power)) * 0.42 + (Math.random() - 0.5) * 0.035;
    const progress = { t: 0 };
    gsap.to(progress, {
      t: release,
      duration: 0.32 + release * 0.28,
      ease: 'power1.out',
      onUpdate: () => {
        const p = railPoint(progress.t);
        view.position.set(p.x, p.y);
      },
      onComplete: () => {
        this.flying -= 1;
        const before = railPoint(release - 0.01);
        const at = railPoint(release);
        this.spawnBody(view, at.x, Math.max(at.y, BOARD.top + 12), (at.x - before.x) * 0.6, (at.y - before.y) * 0.5 + (Math.random() - 0.5) * 1.5, force);
      },
    });
    return true;
  }

  // 演出測試用：直接從洞口正上方放一顆珠子。
  dropTest(force: string) {
    if (this.paused) return false;
    const view = this.makeBallView();
    const { pocket } = BOARD;
    view.position.set(pocket.x, pocket.y - 70);
    this.ballLayer.addChild(view);
    this.audio.launch();
    this.spawnBody(view, pocket.x, pocket.y - 70, 0, 0, force);
    return true;
  }

  private makeBallView() {
    const view = new Sprite(this.art.ball);
    view.anchor.set(0.5);
    view.width = BALL_RADIUS * 2 + 1;
    view.height = BALL_RADIUS * 2 + 1;
    return view;
  }

  private spawnBody(view: Sprite, x: number, y: number, vx: number, vy: number, force: string) {
    const body = Bodies.circle(x, y, BALL_RADIUS, { restitution: 0.5, friction: 0.01, frictionAir: 0.006, density: 0.002, label: 'ball' });
    Body.setVelocity(body, { x: vx, y: vy });
    Composite.add(this.engine.world, body);
    this.balls.set(body.id, { body, view, age: 0, force });
  }

  private onCollision(event: Matter.IEventCollision<Matter.Engine>) {
    event.pairs.forEach(({ bodyA, bodyB }) => {
      const ballBody = bodyA.label === 'ball' ? bodyA : bodyB.label === 'ball' ? bodyB : null;
      if (!ballBody) return;
      const other = ballBody === bodyA ? bodyB : bodyA;
      const ball = this.balls.get(ballBody.id);
      if (!ball) return;
      if (other.label === 'pocket') this.capture(ball);
      else if (other.label === 'floor') this.remove(ball);
      else if (other.label === 'peg') this.hitPeg(other, ballBody);
    });
  }

  private lastPegSound = 0;
  private hitPeg(peg: Matter.Body, ball: Matter.Body) {
    const now = performance.now();
    if (now - this.lastPegSound > 45 && ball.speed > 1.2) {
      this.lastPegSound = now;
      this.audio.pegHit();
    }
    const flash = new Graphics().circle(peg.position.x, peg.position.y, PEG_RADIUS * 2.2).fill(0xfff0a0);
    flash.blendMode = 'add';
    this.root.addChild(flash);
    gsap.to(flash, { alpha: 0, duration: 0.16, onComplete: () => flash.destroy() });
  }

  // 進洞：珠子被吸進去並縮小消失，洞口爆亮。
  private capture(ball: Ball) {
    const { pocket } = BOARD;
    Composite.remove(this.engine.world, ball.body);
    this.balls.delete(ball.body.id);
    const { view } = ball;
    this.audio.pocketIn();
    gsap.to(view.position, { x: pocket.x, y: pocket.y + 9, duration: 0.14, ease: 'power2.in' });
    gsap.to(view.scale, { x: view.scale.x * 0.25, y: view.scale.y * 0.25, duration: 0.2, delay: 0.08, ease: 'power2.in', onComplete: () => view.destroy() });
    gsap.killTweensOf(this.pocketGlow);
    gsap.fromTo(this.pocketGlow, { alpha: 1 }, { alpha: 0, duration: 0.7, ease: 'power2.out' });
    this.ring(pocket.x, pocket.y + 6);
    this.onPocket(ball.force);
  }

  private ring(x: number, y: number) {
    const ring = new Graphics().circle(0, 0, 30).stroke({ width: 7, color: 0xffe27a });
    ring.position.set(x, y);
    ring.scale.y = 0.55;
    ring.blendMode = 'add';
    this.root.addChild(ring);
    gsap.to(ring.scale, { x: 3.2, y: 1.8, duration: 0.45, ease: 'power2.out' });
    gsap.to(ring, { alpha: 0, duration: 0.45, onComplete: () => ring.destroy() });
  }

  private remove(ball: Ball) {
    Composite.remove(this.engine.world, ball.body);
    this.balls.delete(ball.body.id);
    gsap.killTweensOf(ball.view);
    ball.view.destroy();
  }

  clear() {
    [...this.balls.values()].forEach((ball) => this.remove(ball));
  }

  update(delta: number) {
    if (this.paused) return;
    this.lastTick = delta;
    this.accumulator += Math.min(delta * 1000, 100);
    while (this.accumulator >= STEP) {
      Engine.update(this.engine, STEP);
      this.accumulator -= STEP;
    }
    this.balls.forEach((ball) => {
      ball.age += this.lastTick;
      ball.view.position.set(ball.body.position.x, ball.body.position.y);
      ball.view.rotation = ball.body.angle;
      const outside = ball.body.position.y > BOARD.floor + 60 || ball.body.position.x < 0 || ball.body.position.x > 720;
      // 極少數卡住的珠子輕推一下，太久就收掉。
      if (ball.age > 6 && ball.body.speed < 0.15) Body.applyForce(ball.body, ball.body.position, { x: (Math.random() - 0.5) * 0.0006, y: -0.0004 });
      if (outside || ball.age > MAX_AGE) this.remove(ball);
    });
  }
}
