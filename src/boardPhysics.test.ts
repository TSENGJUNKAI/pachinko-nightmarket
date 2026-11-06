import { describe, expect, it } from 'vitest';
import Matter from 'matter-js';
import { assistRoof, BALL_OPTIONS, BALL_RADIUS, BALL_SIDES, BOARD, GRAVITY, PEG_RADIUS, STEP, buildPegBodies, buildRushBodies, buildSensors, buildStatics, isStill, nudge, pegLayout, releaseFor, rushPegLayout, stillAction } from './boardPhysics';
import type { MachineId } from './machines';

const { Bodies, Body, Composite, Engine, Events } = Matter;
const IDS: MachineId[] = ['old', 'steady', 'wild'];
const BALL = BALL_RADIUS * 2;

// 實際打一批珠子，回傳進洞和停住的比例。
// 固定種子：物理測試每次結果都一樣，不會讓部署偶爾失敗。
function seeded(seed: number) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shootBatch(id: MachineId, power: number, count: number) {
  const rng = seeded(Math.round(power * 100) + 1);
  const engine = Engine.create({ gravity: GRAVITY });
  const sensors = buildSensors();
  Composite.add(engine.world, [...buildStatics(), ...buildPegBodies(pegLayout(id)), sensors.pocket, sensors.floor]);
  let ended = '';
  Events.on(engine, 'collisionStart', ({ pairs }) => {
    pairs.forEach(({ bodyA, bodyB }) => {
      const labels = [bodyA.label, bodyB.label];
      if (labels.includes('ball') && labels.includes('pocket')) ended = 'pocket';
      else if (labels.includes('ball') && labels.includes('floor')) ended = ended || 'floor';
    });
  });
  let pocket = 0;
  let stuck = 0;
  for (let i = 0; i < count; i += 1) {
    const shot = releaseFor(power, rng);
    const body = Bodies.circle(shot.x, shot.y, BALL_RADIUS, BALL_OPTIONS, BALL_SIDES);
    Body.setVelocity(body, { x: shot.vx, y: shot.vy });
    Composite.add(engine.world, body);
    ended = '';
    let still = 0;
    for (let step = 0; step < 16 * 120 && !ended; step += 1) {
      assistRoof(body);
      Engine.update(engine, STEP);
      still = isStill(body) ? still + STEP / 1000 : 0;
      const action = stillAction(still);
      if (action === 'nudge') nudge(body, rng);
      if (action === 'remove') ended = 'stuck';
    }
    if (ended === 'pocket') pocket += 1;
    if (ended === 'stuck' || !ended) {
      stuck += 1;
    }
    Composite.remove(engine.world, body);
  }
  return { pocket: pocket / count, stuck: stuck / count };
}

// 右打區：回傳每個力道進電動門、大開口和卡住的比例。
function shootField(id: MachineId, power: number, count: number, gateOpen: boolean, doorOpen: boolean) {
  const rng = seeded(Math.round(power * 100) + 7);
  const engine = Engine.create({ gravity: GRAVITY });
  const sensors = buildSensors();
  const rush = buildRushBodies();
  Composite.add(engine.world, [
    ...buildStatics(), ...buildPegBodies(rushPegLayout(id)), sensors.pocket, sensors.floor,
    ...rush.fixed,
    ...(gateOpen ? [rush.gateStop, rush.gateSensor] : [rush.gateLid]),
    ...(doorOpen ? [rush.doorStop, rush.attackerSensor] : [rush.doorLid]),
  ]);
  let ended = '';
  Events.on(engine, 'collisionStart', ({ pairs }) => {
    pairs.forEach(({ bodyA, bodyB }) => {
      const ball = bodyA.label === 'ball' ? bodyA : bodyB.label === 'ball' ? bodyB : null;
      if (ball && !ended) {
        const other = ball === bodyA ? bodyB : bodyA;
        if (['gate', 'attacker', 'floor', 'pocket'].includes(other.label)) ended = other.label;
      }
    });
  });
  const tally = { gate: 0, attacker: 0, floor: 0, pocket: 0, stuck: 0, seconds: 0 };
  for (let i = 0; i < count; i += 1) {
    const shot = releaseFor(power, rng);
    const body = Bodies.circle(shot.x, shot.y, BALL_RADIUS, BALL_OPTIONS, BALL_SIDES);
    Body.setVelocity(body, { x: shot.vx, y: shot.vy });
    Composite.add(engine.world, body);
    ended = '';
    let still = 0;
    let step = 0;
    for (; step < 16 * 120 && !ended; step += 1) {
      assistRoof(body);
      Engine.update(engine, STEP);
      still = isStill(body) ? still + STEP / 1000 : 0;
      const action = stillAction(still);
      if (action === 'nudge') nudge(body, rng);
      if (action === 'remove') ended = 'stuck';
    }
    tally[(ended || 'stuck') as 'gate'] += 1;
    tally.seconds += (step * STEP) / 1000 / count;
    Composite.remove(engine.world, body);
  }
  return tally;
}

describe('右打區', () => {
  it.each(IDS)('%s 往右打：門開時大多進電動門', (id) => {
    const result = shootField(id, 0.8, 100, true, false);
    expect(result.gate).toBeGreaterThan(60);
    expect(result.stuck).toBeLessThan(5);
  }, 60000);

  it.each(IDS)('%s 往右打：大開口開時大多進得去', (id) => {
    const result = shootField(id, 0.8, 100, false, true);
    expect(result.attacker).toBeGreaterThan(60);
    expect(result.stuck).toBeLessThan(5);
  }, 60000);

  it.each(IDS)('%s 都關著時珠子會流走，不會卡', (id) => {
    const result = shootField(id, 0.8, 100, false, false);
    expect(result.floor).toBeGreaterThan(90);
  }, 60000);

  it.each(IDS)('%s 往左打幾乎碰不到電動門和大開口', (id) => {
    const result = shootField(id, 0.1, 100, true, true);
    expect(result.gate + result.attacker).toBeLessThan(25);
  }, 60000);
});

describe('釘盤幾何', () => {
  it.each(IDS)('%s 的釘子和牆、轉盤之間都放得下珠子', (id) => {
    const { left, right, lcd } = BOARD;
    for (const { x, y } of pegLayout(id)) {
      expect(Math.min(x - left, right - x) - PEG_RADIUS).toBeGreaterThan(BALL);
      if (y > lcd.top && y < lcd.bottom) {
        const gap = x < lcd.left ? lcd.left - x : x - lcd.right;
        expect(gap - PEG_RADIUS).toBeGreaterThan(BALL);
      }
    }
  });

  it.each(IDS)('%s 沒有水平擠在一起、會接住珠子的釘子', (id) => {
    const points = pegLayout(id);
    for (let i = 0; i < points.length; i += 1) {
      for (let j = i + 1; j < points.length; j += 1) {
        const dx = Math.abs(points[i].x - points[j].x);
        const dy = Math.abs(points[i].y - points[j].y);
        const gap = Math.hypot(dx, dy) - PEG_RADIUS * 2;
        if (gap < BALL + 2) expect(dy, `${id} ${points[i].x},${points[i].y}`).toBeGreaterThan(dx * 0.5);
      }
    }
  });
});

describe('實際打珠', () => {
  it.each(IDS)('%s 幾乎不卡珠', (id) => {
    for (const power of [0.2, 0.55, 0.9]) expect(shootBatch(id, power, 150).stuck).toBeLessThan(0.08);
  }, 120000);

  it('穩定台最好進，狂暴台最難進', () => {
    // 多個力道平均，看的是整台的傾向。
    const rate = (id: MachineId) => [0.35, 0.55, 0.75].reduce((sum, power) => sum + shootBatch(id, power, 400).pocket, 0) / 3;
    const [old, steady, wild] = IDS.map(rate);
    expect(steady).toBeGreaterThan(old);
    expect(old).toBeGreaterThan(wild);
  }, 120000);
});
