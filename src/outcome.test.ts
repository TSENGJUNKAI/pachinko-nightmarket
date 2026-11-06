import { describe, expect, it } from 'vitest';
import { CONFIG, attackerPayout, RUSH_SPINS, RUSH_STOPS, SYMBOL_COUNT, forcedModes, roll, rollRush, rushSpinReels } from './outcome';

const N = 200_000;

describe('大開口出珠', () => {
  it('全進剛好拿滿，少進就少拿', () => {
    expect(attackerPayout(700, 50)).toBe(700);
    expect(attackerPayout(700, 99)).toBe(700);
    expect(attackerPayout(700, 25)).toBe(350);
    expect(attackerPayout(3500, 1)).toBe(70);
    expect(attackerPayout(1050, 0)).toBe(0);
  });
});

describe('roll', () => {
  it('keeps reels consistent with the result', () => {
    for (let i = 0; i < N; i += 1) {
      const o = roll();
      const { left, right, center } = o.reels;
      if ((left === right && right === center) !== o.hit) throw new Error('triple mismatch');
      if ((left === right) !== o.reach) throw new Error('reach mismatch');
      for (const s of [left, right, center]) {
        if (!(s >= 0 && s < SYMBOL_COUNT && Number.isInteger(s))) throw new Error('symbol range');
      }
      if ((o.rush !== null) !== o.hit) throw new Error('rush mismatch');
    }
  });

  it('only shows three sacred blocks on a hit', () => {
    for (let i = 0; i < N; i += 1) {
      const o = roll();
      const sacred = o.jiao.filter((j) => j === 'sheng').length;
      if (sacred === 3 && !o.hit) throw new Error('three sacred on a miss');
      if (o.reach && sacred < 3 && o.jiao.length !== sacred + 1) throw new Error('jiao length');
    }
  });

  it('hits close to the configured rate', () => {
    let hits = 0;
    for (let i = 0; i < N; i += 1) if (roll().hit) hits += 1;
    expect(hits / N).toBeCloseTo(CONFIG.hitRate, 2);
  });

  it('never stops a comeback on the winning symbol', () => {
    for (const mode of forcedModes) {
      const o = roll(Math.random, mode);
      if (o.comebackFrom !== null) expect(o.comebackFrom).not.toBe(o.reels.center);
    }
  });

  it('honours every forced mode', () => {
    expect(roll(Math.random, 'miss').reach).toBe(false);
    expect(roll(Math.random, 'goldMiss').hit).toBe(false);
    expect(roll(Math.random, 'superHit').jiao).toEqual(['sheng', 'sheng', 'sheng']);
    expect(roll(Math.random, 'rushFinal').rush?.reachedFinal).toBe(true);
    expect(roll(Math.random, 'reachHit').rush?.hitSpins).toEqual([]);
  });
});

describe('rollRush', () => {
  it('stays inside the route and spin count', () => {
    for (let i = 0; i < N; i += 1) {
      const plan = rollRush();
      if (plan.hitSpins.length > RUSH_STOPS.length - 1) throw new Error('too many hits');
      if (plan.reachedFinal !== (plan.hitSpins.length === RUSH_STOPS.length - 1)) throw new Error('final mismatch');
      for (const spin of plan.hitSpins) if (!(spin >= 1 && spin <= RUSH_SPINS)) throw new Error('spin range');
    }
  });

  it('continues about 55% of the time', () => {
    let continued = 0;
    for (let i = 0; i < N; i += 1) if (rollRush().hitSpins.length > 0) continued += 1;
    expect(continued / N).toBeCloseTo(1 - (1 - CONFIG.rushSpinHitRate) ** RUSH_SPINS, 2);
    expect(continued / N).toBeGreaterThan(0.5);
    expect(continued / N).toBeLessThan(0.6);
  });
});

describe('rushSpinReels', () => {
  it('matches only on a hit', () => {
    for (let i = 0; i < 20_000; i += 1) {
      const hit = rushSpinReels(true);
      if (!(hit.left === hit.center && hit.center === hit.right)) throw new Error('hit mismatch');
      const miss = rushSpinReels(false);
      if (miss.left === miss.right) throw new Error('miss looks like reach');
    }
  });
});
