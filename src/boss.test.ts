import { describe, expect, it } from 'vitest';
import { BOSS_DAMAGE, BOSS_INTERVAL, bossForNight } from './boss';
import { rentForNight, settle, titleFor } from './economy';

describe('地頭蛇出現時機', () => {
  it('只在每 7 晚出現', () => {
    for (let night = 1; night <= 30; night += 1) {
      expect(bossForNight(night) !== null).toBe(night % BOSS_INTERVAL === 0);
    }
  });

  it('三個角色輪流出現，血量一輪比一輪多', () => {
    const rounds = [1, 2, 3, 4].map((round) => bossForNight(round * BOSS_INTERVAL)!);
    expect(new Set(rounds.slice(0, 3).map((boss) => boss.name)).size).toBe(3);
    expect(rounds[3].name).toBe(rounds[0].name);
    for (let i = 1; i < rounds.length; i += 1) expect(rounds[i].hp).toBeGreaterThan(rounds[i - 1].hp);
  });

  it('打贏的獎金和打輸的保護費都跟著地頭費走', () => {
    const boss = bossForNight(7)!;
    expect(boss.bonus).toBe(rentForNight(7));
    expect(boss.penalty).toBe(Math.round(rentForNight(7) / 2));
  });

  it('連莊傷害比一次轉動高很多', () => {
    expect(BOSS_DAMAGE.chain).toBeGreaterThan(BOSS_DAMAGE.spin * 10);
    expect(BOSS_DAMAGE.final).toBeGreaterThan(BOSS_DAMAGE.jackpot);
  });
});

describe('地頭蛇結算', () => {
  it('打贏的獎金算進現金', () => {
    const result = settle(1500, 0, 1, { bonus: 2000 });
    expect(result.cashAfter).toBe(2000);
    expect(result.bonus).toBe(2000);
  });

  it('打輸多繳保護費，付不起就倒店', () => {
    expect(settle(2000, 0, 1, { penalty: 500 }).cashAfter).toBe(0);
    expect(settle(1999, 0, 1, { penalty: 500 }).bankrupt).toBe(true);
  });

  it('稱號靠打倒地頭蛇取得', () => {
    expect(titleFor(0)).toBe('欠債的阿公');
    expect(titleFor(1)).toBe('救回阿公的攤位');
    expect(titleFor(99)).toBe('全台廟會總舖師');
  });
});
