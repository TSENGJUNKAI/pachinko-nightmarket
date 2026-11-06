import { describe, expect, it } from 'vitest';
import { ECONOMY, ballPrice, ballsToCash, buyBalls, moneyText, newTitleAt, payoutScale, rentForNight, settle, titleFor, upgradeCost } from './economy';

describe('地頭費和珠價', () => {
  it('第 1 晚的地頭費和珠價是起始值', () => {
    expect(rentForNight(1)).toBe(ECONOMY.firstRent);
    expect(ballPrice(1)).toBe(ECONOMY.firstBallPrice);
  });

  it('兩者每晚都漲，地頭費漲得比較快', () => {
    for (let night = 1; night < 60; night += 1) {
      expect(rentForNight(night + 1)).toBeGreaterThan(rentForNight(night));
      expect(ballPrice(night + 1)).toBeGreaterThan(ballPrice(night));
    }
    expect(ECONOMY.rentGrowth).toBeGreaterThan(ECONOMY.priceGrowth);
  });
});

describe('買珠和換現金', () => {
  it('買了馬上換回去會虧', () => {
    for (const night of [1, 5, 20]) {
      const { balls, cost } = buyBalls(1e15, night);
      expect(balls).toBe(ECONOMY.buyBalls);
      expect(ballsToCash(balls, night)).toBeLessThan(cost);
    }
  });

  it('現金不夠時有多少買多少，不會變負數', () => {
    expect(buyBalls(100, 1)).toEqual({ balls: 25, cost: 100 });
    expect(buyBalls(3, 1)).toEqual({ balls: 0, cost: 0 });
  });
});

describe('結算', () => {
  it('付得起就扣地頭費', () => {
    expect(settle(1500, 500, 1)).toEqual({ rent: 1500, earned: 1600, cashAfter: 1600, bankrupt: false });
  });

  it('剛好付清不算倒店', () => {
    expect(settle(1500, 0, 1).bankrupt).toBe(false);
  });

  it('付不起就倒店', () => {
    const result = settle(100, 10, 1);
    expect(result.bankrupt).toBe(true);
    expect(result.cashAfter).toBe(0);
  });
});

describe('攤位等級', () => {
  it('等級越高，出珠和升級費用都越多', () => {
    expect(payoutScale(1)).toBe(1);
    for (let level = 1; level < 40; level += 1) {
      expect(payoutScale(level + 1)).toBeGreaterThan(payoutScale(level));
      expect(upgradeCost(level + 1)).toBeGreaterThan(upgradeCost(level));
    }
  });
});

describe('顯示', () => {
  it('稱號只在里程碑那一晚才算新解鎖', () => {
    expect(titleFor(0)).toBe('欠債的阿公');
    expect(titleFor(8)).toBe('救回阿公的攤位');
    expect(newTitleAt(7)).toBe('救回阿公的攤位');
    expect(newTitleAt(8)).toBeNull();
  });

  it('大數字換成中文單位', () => {
    expect(moneyText(12345)).toBe('12,345');
    expect(moneyText(250000)).toBe('25.0 萬');
    expect(moneyText(320000000)).toBe('3.2 億');
  });
});
