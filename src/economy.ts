// 金錢規則：買珠、換現金、地頭費和攤位等級。這個檔案不碰畫面，調數值只改這裡。

export const ECONOMY = {
  startCash: 4000,
  buyBalls: 100,
  firstBallPrice: 4,
  // 珠價每晚上漲，落後的人靠磨時間也追不回來。
  priceGrowth: 1.5,
  // 換回現金只有買價的八成，留在手上的珠子有風險。
  sellRatio: 0.8,
  entryBalls: 1,
  firstRent: 1500,
  rentGrowth: 1.55,
  firstUpgradeCost: 5000,
  upgradeCostGrowth: 3,
  payoutGrowth: 1.25,
} as const;

// 地頭費收到整百，帳單上比較好看。
export function rentForNight(night: number): number {
  return Math.round((ECONOMY.firstRent * ECONOMY.rentGrowth ** (night - 1)) / 100) * 100;
}

export function ballPrice(night: number): number {
  return Math.ceil(ECONOMY.firstBallPrice * ECONOMY.priceGrowth ** (night - 1));
}

export function payoutScale(level: number): number {
  return ECONOMY.payoutGrowth ** (level - 1);
}

export function upgradeCost(level: number): number {
  return Math.round((ECONOMY.firstUpgradeCost * ECONOMY.upgradeCostGrowth ** (level - 1)) / 100) * 100;
}

export function ballsToCash(balls: number, night: number): number {
  return Math.floor(balls * ballPrice(night) * ECONOMY.sellRatio);
}

// 現金不夠買一整包時，有多少買多少。
export function buyBalls(cash: number, night: number): { balls: number; cost: number } {
  const unit = ballPrice(night);
  const balls = Math.min(ECONOMY.buyBalls, Math.floor(cash / unit));
  return { balls, cost: balls * unit };
}

const TITLES: Array<[number, string]> = [
  [35, '全台廟會總舖師'],
  [28, '夜市之王'],
  [21, '珍奶巷霸主'],
  [14, '香腸街老大'],
  [7, '救回阿公的攤位'],
  [0, '欠債的阿公'],
];

export function titleFor(nightsSurvived: number): string {
  return TITLES.find(([nights]) => nightsSurvived >= nights)![1];
}

export function newTitleAt(nightsSurvived: number): string | null {
  return TITLES.some(([nights]) => nights > 0 && nights === nightsSurvived) ? titleFor(nightsSurvived) : null;
}

// 數字太大時改用萬、億、兆，面板才放得下。
export function moneyText(value: number): string {
  const units: Array<[number, string]> = [[1e12, '兆'], [1e8, '億'], [1e5, '萬']];
  for (const [size, unit] of units) {
    if (value >= size) {
      const base = unit === '萬' ? 1e4 : size;
      return `${(value / base).toFixed(value / base >= 100 ? 0 : 1)} ${unit}`;
    }
  }
  return Math.floor(value).toLocaleString();
}

export interface RunState {
  night: number;
  cash: number;
  level: number;
  best: number;
}

export function newRun(best = 0): RunState {
  return { night: 1, cash: ECONOMY.startCash, level: 1, best };
}

export interface Settlement {
  rent: number;
  earned: number;
  cashAfter: number;
  bankrupt: boolean;
}

export function settle(cash: number, balls: number, night: number): Settlement {
  const earned = ballsToCash(balls, night);
  const rent = rentForNight(night);
  const total = cash + earned;
  return { rent, earned, cashAfter: Math.max(0, total - rent), bankrupt: total < rent };
}
