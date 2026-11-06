// 釘盤：真實物理。珠子沿軌道射上去、撞釘子，掉進洞口才算數。
import { Container, Graphics, Sprite } from 'pixi.js';
import gsap from 'gsap';
import Matter from 'matter-js';
import type { ArtBook } from './art';
import type { AudioKit } from './audio';
import { assistRoof, BALL_OPTIONS, BALL_RADIUS, BALL_SIDES, BOARD, GRAVITY, GUIDES, PEG_RADIUS, RUSH_FIELD, STEP, buildPegBodies, buildRushBodies, buildSensors, buildStatics, isStill, nudge, pegLayout, railPoint, releaseFor, rushPegLayout, stillAction } from './boardPhysics';
import { makeText } from './art';
import type { MachineId } from './machines';

const { Bodies, Body, Composite, Engine, Events } = Matter;

export { BOARD };

const MAX_BALLS = 14;
const MAX_AGE = 16;
const POCKET_WIDTH = 214;
const POCKET_HOLE_Y = 0.617;

interface Ball {
  body: Matter.Body;
  view: Sprite;
  age: number;
  still: number;
  force: string;
}

export class Board {
  readonly root = new Container();
  // 珠子真的進洞時呼叫，參數是演出測試指定的結果（平常為空字串）。
  onPocket: (force: string) => void = () => undefined;
  // 右打區：珠子進電動門和大開口時呼叫。
  onGate: () => void = () => undefined;
  onAttacker: () => void = () => undefined;
  paused = false;

  private readonly engine = Engine.create({ gravity: GRAVITY });
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
  private pegBodies: Matter.Body[] = [];
  private layout: MachineId = 'old';
  private readonly rushBodies = buildRushBodies();
  private readonly fieldLayer = new Container();
  private readonly gateView = new Graphics();
  private readonly doorView = new Graphics();
  private field = false;
  private gateOpen = false;
  private doorOpen = false;

  constructor(private readonly audio: AudioKit, private readonly art: ArtBook) {
    const sensors = buildSensors();
    this.pegBodies = buildPegBodies(pegLayout(this.layout));
    Composite.add(this.engine.world, [...buildStatics(), ...this.pegBodies, sensors.pocket, sensors.floor]);
    Events.on(this.engine, 'collisionStart', (event) => this.onCollision(event));

    this.pocketView = new Sprite(art.pocket);
    this.drawBoard();
    this.pegFlash.blendMode = 'add';
    // 洞口在釘子下面，才不會有被蓋住卻撞得到的釘子。
    this.buildFieldView();
    this.root.addChild(this.railLayer, this.fieldLayer, this.pocketView, this.pocketGlow, this.pegLayer, this.pegFlash, this.ballLayer);
    this.pocketGlow.alpha = 0;
  }

  // 換機台就換釘盤。場上還有珠子時不換。
  setLayout(id: MachineId) {
    if (id === this.layout || this.ballCount > 0 || this.field) return;
    this.layout = id;
    Composite.remove(this.engine.world, this.pegBodies);
    this.pegBodies = buildPegBodies(pegLayout(id));
    Composite.add(this.engine.world, this.pegBodies);
    this.drawPegs();
  }

  // 大獎和 RUSH 用的右打區。切換時場上的珠子一律收掉，才不會卡在新出現的斜道裡。
  setField(on: boolean) {
    if (on === this.field) return;
    this.clear();
    this.field = on;
    const { fixed, gateSensor, attackerSensor, gateLid, gateStop, doorLid, doorStop } = this.rushBodies;
    const { world } = this.engine;
    Composite.remove(world, this.pegBodies);
    this.pegBodies = buildPegBodies(on ? rushPegLayout(this.layout) : pegLayout(this.layout));
    Composite.add(world, this.pegBodies);
    this.drawPegs();
    this.fieldLayer.visible = on;
    if (on) {
      Composite.add(world, [...fixed, gateLid, doorLid]);
      this.gateOpen = false;
      this.doorOpen = false;
      this.drawGate();
      this.drawDoor();
    } else {
      Composite.remove(world, [...fixed, gateSensor, attackerSensor, gateLid, gateStop, doorLid, doorStop]);
    }
  }

  setGate(open: boolean) {
    if (open === this.gateOpen) return;
    this.gateOpen = open;
    // 感應區跟著開關，門關著時從下面碰到也不算。
    const { gateLid, gateStop, gateSensor } = this.rushBodies;
    Composite.remove(this.engine.world, open ? [gateLid] : [gateStop, gateSensor]);
    Composite.add(this.engine.world, open ? [gateStop, gateSensor] : [gateLid]);
    this.drawGate();
  }

  setDoor(open: boolean) {
    if (open === this.doorOpen) return;
    this.doorOpen = open;
    const { doorLid, doorStop, attackerSensor } = this.rushBodies;
    Composite.remove(this.engine.world, open ? [doorLid] : [doorStop, attackerSensor]);
    Composite.add(this.engine.world, open ? [doorStop, attackerSensor] : [doorLid]);
    this.drawDoor();
  }

  private buildFieldView() {
    const { plate, rampA, rampB, wall, rampC, gate, attacker } = RUSH_FIELD;
    const base = new Graphics();
    base.rect(BOARD.left, BOARD.top, BOARD.right - BOARD.left, BOARD.floor - BOARD.top).fill({ color: 0x0b0714, alpha: 0.72 });
    base.roundRect(plate.x, plate.y, plate.width, plate.height, 14).fill(0x14060f).stroke({ width: 4, color: 0xffc21a });
    [rampA, rampB, wall, rampC].forEach(({ x1, y1, x2, y2 }) => {
      base.moveTo(x1, y1).lineTo(x2, y2).stroke({ width: 8, color: 0xffc21a, cap: 'round' });
    });
    const gateLabel = makeText('電動門', 20, 0x9dffc0, 0x06240f, 4);
    gateLabel.position.set(gate.x, gate.y + 24);
    const doorLabel = makeText('大開口', 24, 0xffe98c, 0x3a0606, 5);
    doorLabel.position.set(attacker.x, attacker.y + 26);
    this.fieldLayer.addChild(base, this.gateView, this.doorView, gateLabel, doorLabel);
    this.fieldLayer.visible = false;
  }

  private drawGate() {
    const { gateLid, gateStop, gate } = RUSH_FIELD;
    const g = this.gateView.clear();
    if (this.gateOpen) {
      g.rect(gate.x - gate.width / 2, gate.y - 34, gate.width, 42).fill({ color: 0x2fe06a, alpha: 0.35 });
      g.moveTo(gateStop.x1, gateStop.y1).lineTo(gateStop.x2, gateStop.y2).stroke({ width: 8, color: 0x7dff5e, cap: 'round' });
    } else {
      g.moveTo(gateLid.x1, gateLid.y1).lineTo(gateLid.x2, gateLid.y2).stroke({ width: 8, color: 0x2f8a4a, cap: 'round' });
    }
  }

  private drawDoor() {
    const { doorLid, doorStop, attacker } = RUSH_FIELD;
    const g = this.doorView.clear();
    if (this.doorOpen) {
      g.rect(attacker.x - attacker.width / 2, attacker.y - 50, attacker.width, 58).fill({ color: 0xffd257, alpha: 0.45 });
      g.moveTo(doorStop.x1, doorStop.y1).lineTo(doorStop.x2, doorStop.y2).stroke({ width: 10, color: 0xffe94a, cap: 'round' });
    } else {
      g.moveTo(doorLid.x1, doorLid.y1).lineTo(doorLid.x2, doorLid.y2).stroke({ width: 10, color: 0xa02018, cap: 'round' });
    }
  }

  private drawPegs() {
    this.pegLayer.removeChildren().forEach((child) => child.destroy());
    this.pegBodies.forEach((peg) => {
      const sprite = new Sprite(this.art.peg);
      sprite.anchor.set(0.5);
      sprite.width = PEG_RADIUS * 2 + 3;
      sprite.height = PEG_RADIUS * 2 + 3;
      sprite.position.set(peg.position.x, peg.position.y);
      this.pegLayer.addChild(sprite);
    });
  }

  private drawBoard() {
    const { pocket } = BOARD;
    const g = this.railLayer;
    // 發射軌道。
    const start = railPoint(0);
    g.moveTo(start.x, start.y);
    for (let i = 1; i <= 60; i += 1) {
      const p = railPoint(i / 60);
      g.lineTo(p.x, p.y);
    }
    g.stroke({ width: 22, color: 0x14060f, alpha: 0.72, join: 'round' });

    this.drawPegs();

    const line = (x1: number, y1: number, x2: number, y2: number) => {
      g.moveTo(x1, y1).lineTo(x2, y2).stroke({ width: 8, color: 0xffc21a, cap: 'round' });
    };
    GUIDES.forEach((guide) => line(guide.x1, guide.y1, guide.x2, guide.y2));

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

    const shot = releaseFor(power);
    const { release } = shot;
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
        this.spawnBody(view, shot.x, shot.y, shot.vx, shot.vy, force);
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
    const body = Bodies.circle(x, y, BALL_RADIUS, BALL_OPTIONS, BALL_SIDES);
    Body.setVelocity(body, { x: vx, y: vy });
    Composite.add(this.engine.world, body);
    this.balls.set(body.id, { body, view, age: 0, still: 0, force });
  }

  private onCollision(event: Matter.IEventCollision<Matter.Engine>) {
    event.pairs.forEach(({ bodyA, bodyB }) => {
      const ballBody = bodyA.label === 'ball' ? bodyA : bodyB.label === 'ball' ? bodyB : null;
      if (!ballBody) return;
      const other = ballBody === bodyA ? bodyB : bodyA;
      const ball = this.balls.get(ballBody.id);
      if (!ball) return;
      if (other.label === 'pocket') this.capture(ball);
      else if (other.label === 'gate') this.captureField(ball, RUSH_FIELD.gate, this.onGate);
      else if (other.label === 'attacker') this.captureField(ball, RUSH_FIELD.attacker, this.onAttacker);
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

  private captureField(ball: Ball, at: { x: number; y: number }, notify: () => void) {
    Composite.remove(this.engine.world, ball.body);
    this.balls.delete(ball.body.id);
    const { view } = ball;
    gsap.to(view.position, { x: at.x, y: at.y + 6, duration: 0.1, ease: 'power2.in' });
    gsap.to(view.scale, { x: 0, y: 0, duration: 0.14, delay: 0.04, onComplete: () => view.destroy() });
    this.ring(at.x, at.y);
    notify();
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
      this.balls.forEach((ball) => assistRoof(ball.body));
      Engine.update(this.engine, STEP);
      this.accumulator -= STEP;
    }
    this.balls.forEach((ball) => {
      ball.age += this.lastTick;
      ball.view.position.set(ball.body.position.x, ball.body.position.y);
      ball.view.rotation = ball.body.angle;
      const outside = ball.body.position.y > BOARD.floor + 60 || ball.body.position.x < 0 || ball.body.position.x > 720;
      ball.still = isStill(ball.body) ? ball.still + this.lastTick : 0;
      const action = stillAction(ball.still);
      if (action === 'nudge') nudge(ball.body);
      if (outside || action === 'remove' || ball.age > MAX_AGE) this.remove(ball);
    });
  }
}
