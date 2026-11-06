import { describe, expect, it } from 'vitest';
import { EVENTS, FORTUNES, NEUTRAL, canAfford, combineMods, describeMods, drawEvent, resolveOption } from './fortune';
import { BOOK, BOOK_FAME, BOOK_STEP, BOOK_TOTAL, markSeen, newMeta } from './collection';
import { MACHINES, isUnlocked } from './machines';
import { roll } from './outcome';

describe('籤詩與事件', () => {
  it('規格的數量：15 支籤、10 個事件', () => {
    expect(FORTUNES).toHaveLength(15);
    expect(EVENTS).toHaveLength(10);
  });

  it('任何籤加事件都不能靠買賣珠子套利', () => {
    for (const fortune of FORTUNES) {
      for (const event of EVENTS) {
        for (const option of event.options) {
          const mods = combineMods(combineMods(NEUTRAL, fortune.mods), option.mods ?? {});
          expect(0.8 * mods.sell).toBeLessThan(mods.price);
        }
      }
    }
  });

  it('每個事件都有不用花錢的選項，沒錢也走得下去', () => {
    for (const event of EVENTS) {
      expect(event.options.some((option) => canAfford(option, 0, 1000))).toBe(true);
    }
  });

  it('第一晚不出事件', () => {
    expect(drawEvent(() => 0, 1)).toBeNull();
    expect(drawEvent(() => 0, 2)).toBe(0);
  });

  it('賭盤輸贏金額正確', () => {
    const gamble = EVENTS.flatMap((event) => event.options).find((option) => option.gamble)!;
    expect(resolveOption(gamble, 1000, () => 0).cashDelta).toBe(1000);
    expect(resolveOption(gamble, 1000, () => 0.99).cashDelta).toBe(-500);
  });

  it('倍率說明寫得出來', () => {
    expect(describeMods({ payout: 1.5 })).toBe('出珠 ×1.5');
    expect(describeMods({})).toBe('沒有特別加成');
  });
});

describe('圖鑑', () => {
  it('編號不重複', () => {
    const ids = BOOK.flatMap((group) => group.entries.map((entry) => entry.id));
    expect(new Set(ids).size).toBe(BOOK_TOTAL);
  });

  it('看過第二次不算，收滿一階送名氣', () => {
    const meta = newMeta();
    expect(markSeen(meta, 'a')).toBe(0);
    expect(markSeen(meta, 'a')).toBeNull();
    for (let i = 1; i < BOOK_STEP; i += 1) markSeen(meta, `x${i}`);
    expect(meta.fame).toBe(BOOK_FAME);
  });
});

describe('機台', () => {
  it('名氣夠才解鎖', () => {
    expect(isUnlocked(MACHINES[0], 0)).toBe(true);
    expect(isUnlocked(MACHINES[1], MACHINES[1].fame - 1)).toBe(false);
    expect(isUnlocked(MACHINES[1], MACHINES[1].fame)).toBe(true);
  });

  it('機台的中獎率真的有作用', () => {
    const rate = (hitRate: number) => {
      let hits = 0;
      for (let i = 0; i < 100_000; i += 1) if (roll(Math.random, '', { hitRate }).hit) hits += 1;
      return hits / 100_000;
    };
    expect(rate(MACHINES[1].hitRate)).toBeGreaterThan(rate(MACHINES[2].hitRate) * 2);
  });

  it('隱藏演出只出現在中獎時', () => {
    for (let i = 0; i < 100_000; i += 1) {
      const outcome = roll();
      if ((outcome.golden || outcome.announce) && !outcome.hit) throw new Error('hidden on a miss');
    }
  });
});
