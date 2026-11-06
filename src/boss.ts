// 地頭蛇規則：每 7 晚來一個。這個檔案不碰畫面，調血量和獎懲只改這裡。
import { rentForNight } from './economy';

export const BOSS_INTERVAL = 7;
const BASE_HP = 150;
const HP_GROWTH = 1.2;
const BONUS_RATIO = 1;
const PENALTY_RATIO = 0.5;

export type BossHit = 'spin' | 'reach' | 'jackpot' | 'chain' | 'final';

export const BOSS_DAMAGE: Record<BossHit, number> = {
  spin: 1,
  reach: 5,
  jackpot: 40,
  chain: 25,
  final: 100,
};

export const BOSS_NAMES = ['金牙虎哥', '鐵算盤阿姨', '夜市大仔'];

export interface Boss {
  name: string;
  hp: number;
  bonus: number;
  penalty: number;
}

export function bossForNight(night: number): Boss | null {
  if (night < BOSS_INTERVAL || night % BOSS_INTERVAL !== 0) return null;
  const round = night / BOSS_INTERVAL;
  const rent = rentForNight(night);
  return {
    name: BOSS_NAMES[(round - 1) % BOSS_NAMES.length],
    hp: Math.round(BASE_HP * HP_GROWTH ** (round - 1)),
    bonus: Math.round(rent * BONUS_RATIO),
    penalty: Math.round(rent * PENALTY_RATIO),
  };
}
