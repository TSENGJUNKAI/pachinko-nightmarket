// 金錢規則：買珠、換現金、地頭費和攤位等級。這個檔案不碰畫面，調數值只改這裡。

import type { NightMods } from './fortune';

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
  lateRentFrom: 14,
  lateRentGrowth: 1.25,
  firstUpgradeCost: 5000,
  upgradeCostGrowth: 3,
  payoutGrowth: 1.25,
} as const;

// 地頭費收到整百，帳單上比較好看。撐過前期後漲得更快，滾雪球的人也會有壓力。
export function rentForNight(night: number): number {
  const late = ECONOMY.lateRentGrowth ** Math.max(0, night - ECONOMY.lateRentFrom);
  return Math.round((ECONOMY.firstRent * ECONOMY.rentGrowth ** (night - 1) * late) / 100) * 100;
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

export function ballsToCash(balls: number, night: number, sellScale = 1): number {
  return Math.floor(balls * ballPrice(night) * ECONOMY.sellRatio * sellScale);
}

// 現金不夠買一整包時，有多少買多少。
export function buyBalls(cash: number, night: number, priceScale = 1): { balls: number; cost: number } {
  const unit = Math.ceil(ballPrice(night) * priceScale);
  const balls = Math.min(ECONOMY.buyBalls, Math.floor(cash / unit));
  return { balls, cost: balls * unit };
}

// 稱號靠打倒地頭蛇取得，索引是打贏的次數。
const TITLES = ['欠債的阿公', '救回阿公的攤位', '香腸街老大', '珍奶巷霸主', '夜市之王', '全台廟會總舖師'];

export function titleFor(bossWins: number): string {
  return TITLES[Math.min(bossWins, TITLES.length - 1)];
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
  bossWins: number;
  today: Today | null;
}

// 這一晚抽到的籤和事件。存起來，重新整理才不能重抽。
export interface Today {
  fortune: number;
  event: number | null;
  chosen: boolean;
  result: string;
  mods: NightMods;
  repay: number;
}

export function newRun(best = 0): RunState {
  return { night: 1, cash: ECONOMY.startCash, level: 1, best, bossWins: 0, today: null };
}

export interface Settlement {
  rent: number;
  earned: number;
  bonus: number;
  penalty: number;
  cashAfter: number;
  bankrupt: boolean;
}

export function settle(cash: number, balls: number, night: number, { bonus = 0, penalty = 0, rentScale = 1, sellScale = 1 }: { bonus?: number; penalty?: number; rentScale?: number; sellScale?: number } = {}): Settlement {
  const earned = ballsToCash(balls, night, sellScale);
  const rent = Math.round(rentForNight(night) * rentScale);
  const total = cash + earned + bonus;
  const due = rent + penalty;
  return { rent, earned, bonus, penalty, cashAfter: Math.max(0, total - due), bankrupt: total < due };
}
