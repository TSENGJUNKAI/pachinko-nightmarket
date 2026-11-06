// 結果判定：鋼珠進球口的瞬間就決定一切，演出只負責把結果慢慢揭曉。
// 這個檔案不碰畫面和聲音，之後調機率只需要改這裡。

export const SYMBOL_COUNT = 8;
export const RUSH_SPINS = 8;
export const RUSH_STOPS = ['夜市口', '香腸街', '珍奶巷', '大牌樓', '廟口'] as const;

export type Tier = 'blue' | 'red' | 'gold';
export type JiaoResult = 'sheng' | 'xiao' | 'yin';
export type Rng = () => number;

export interface ReelResult {
  left: number;
  right: number;
  center: number;
}

export interface RushPlan {
  // 每一段各在第幾次轉動中獎（從 1 開始）。走完全部站就抵達廟口。
  hitSpins: number[];
  reachedFinal: boolean;
}

// 機台和當晚加成會改的機率。
export interface Tune {
  hitRate: number;
  reachOnMiss: number;
  comebackRate: number;
  rushSpinHitRate: number;
}

export interface Outcome {
  // 隱藏演出，只出現在中獎時。
  golden: boolean;
  announce: boolean;
  hit: boolean;
  reach: boolean;
  reels: ReelResult;
  tier: Tier | null;
  jiao: JiaoResult[];
  comebackFrom: number | null;
  rush: RushPlan | null;
}

// 平均每晚約 1 次大獎；數值是模擬後的起始值。
export const CONFIG = {
  hitRate: 1 / 30,
  reachOnMiss: 0.2,
  comebackRate: 0.15,
  goldenRate: 0.04,
  announceRate: 0.05,
  // 每次轉動約 9.5%，8 次內至少中一次的機率約 55%。
  rushSpinHitRate: 0.095,
  ballsPerRound: 700,
  ballsFinal: 3500,
  tierWeights: {
    hit: { blue: 0.1, red: 0.35, gold: 0.55 },
    miss: { blue: 0.72, red: 0.24, gold: 0.04 },
  },
  // 聖筊數量的機率。三聖筊只存在於中獎結果，所以出現就是必中。
  sacredWeights: {
    hit: {
      blue: { 1: 0.7, 2: 0.3 },
      red: { 1: 0.2, 2: 0.8 },
      gold: { 2: 0.4, 3: 0.6 },
    },
    miss: {
      blue: { 0: 0.6, 1: 0.4 },
      red: { 0: 0.2, 1: 0.6, 2: 0.2 },
      gold: { 1: 0.4, 2: 0.6 },
    },
  },
} as const;

// 大開口：打開 5 回合，每回合最多進 10 顆，全進剛好拿滿那一次的出珠。
export const ATTACKER = { rounds: 5, ballsPerRound: 10, secondsPerRound: 10 } as const;

export function attackerPayout(total: number, entered: number) {
  const capacity = ATTACKER.rounds * ATTACKER.ballsPerRound;
  return Math.round((total * Math.min(entered, capacity)) / capacity);
}

const mod = (n: number, m: number) => ((n % m) + m) % m;

function pickWeighted(weights: Record<string, number>, rng: Rng): string {
  const entries = Object.entries(weights);
  let r = rng();
  for (const [key, weight] of entries) {
    if (r < weight) return key;
    r -= weight;
  }
  return entries[entries.length - 1][0];
}

function randomSymbol(rng: Rng): number {
  return Math.floor(rng() * SYMBOL_COUNT);
}

type RushForce = 'all' | 'none' | number;

interface Forced {
  hit?: boolean;
  reach?: boolean;
  tier?: Tier;
  sacred?: number;
  comeback?: boolean;
  rush?: RushForce;
  golden?: boolean;
  announce?: boolean;
}

const FORCED: Record<string, Forced> = {
  miss: { hit: false, reach: false },
  reachMiss: { hit: false, reach: true, tier: 'blue' },
  goldMiss: { hit: false, reach: true, tier: 'gold', sacred: 2 },
  reachHit: { hit: true, tier: 'red', sacred: 2, comeback: false, rush: 'none' },
  comeback: { hit: true, tier: 'red', sacred: 1, comeback: true, rush: 'none' },
  superHit: { hit: true, tier: 'gold', sacred: 3, comeback: false, rush: 2 },
  rushFinal: { hit: true, tier: 'red', sacred: 1, comeback: false, rush: 'all' },
  golden: { hit: true, tier: 'gold', sacred: 2, comeback: false, rush: 'none', golden: true, announce: false },
  announce: { hit: true, tier: 'red', sacred: 2, comeback: false, rush: 'none', golden: false, announce: true },
};

export const forcedModes = Object.keys(FORCED);

export function rollRush(rng: Rng = Math.random, force?: RushForce, spinHitRate: number = CONFIG.rushSpinHitRate): RushPlan {
  const needed = RUSH_STOPS.length - 1;
  const hitSpins: number[] = [];
  const pickSpin = () => 1 + Math.floor(rng() * RUSH_SPINS);

  if (force === 'none') return { hitSpins, reachedFinal: false };
  if (force === 'all' || typeof force === 'number') {
    const count = force === 'all' ? needed : Math.min(force, needed);
    for (let i = 0; i < count; i += 1) hitSpins.push(pickSpin());
    return { hitSpins, reachedFinal: count === needed };
  }

  while (hitSpins.length < needed) {
    let spinHit = 0;
    for (let spin = 1; spin <= RUSH_SPINS; spin += 1) {
      if (rng() < spinHitRate) {
        spinHit = spin;
        break;
      }
    }
    if (!spinHit) return { hitSpins, reachedFinal: false };
    hitSpins.push(spinHit);
  }
  return { hitSpins, reachedFinal: true };
}

function missReels(rng: Rng): ReelResult {
  const left = randomSymbol(rng);
  const right = mod(left + 1 + Math.floor(rng() * (SYMBOL_COUNT - 1)), SYMBOL_COUNT);
  return { left, right, center: randomSymbol(rng) };
}

export function rushSpinReels(hit: boolean, rng: Rng = Math.random): ReelResult {
  if (!hit) return missReels(rng);
  const symbol = randomSymbol(rng);
  return { left: symbol, right: symbol, center: symbol };
}

// force 只給演出測試用，正式玩法不會傳入。
export function roll(rng: Rng = Math.random, force = '', tune: Partial<Tune> = {}): Outcome {
  const forced = FORCED[force] ?? {};
  const rates = { ...CONFIG, ...tune };
  const hit = forced.hit ?? rng() < rates.hitRate;
  const reach = hit || (forced.reach ?? rng() < rates.reachOnMiss);

  if (!reach) {
    return { golden: false, announce: false, hit: false, reach: false, reels: missReels(rng), tier: null, jiao: [], comebackFrom: null, rush: null };
  }

  const key = hit ? 'hit' : 'miss';
  const tier = forced.tier ?? (pickWeighted(CONFIG.tierWeights[key], rng) as Tier);
  const sacredCount = forced.sacred ?? Number(pickWeighted(CONFIG.sacredWeights[key][tier], rng));

  const jiao: JiaoResult[] = Array<JiaoResult>(sacredCount).fill('sheng');
  if (sacredCount < 3) jiao.push(rng() < 0.5 ? 'xiao' : 'yin');

  const base = randomSymbol(rng);
  // 差一格最折磨人：沒中時停在中獎圖案的前一格或後一格。
  const center = hit ? base : mod(base + (rng() < 0.5 ? -1 : 1), SYMBOL_COUNT);
  const comeback = hit && (forced.comeback ?? rng() < rates.comebackRate);

  return {
    golden: hit && (forced.golden ?? rng() < CONFIG.goldenRate),
    announce: hit && (forced.announce ?? rng() < CONFIG.announceRate),
    hit,
    reach: true,
    reels: { left: base, right: base, center },
    tier,
    jiao,
    comebackFrom: comeback ? mod(base - 1, SYMBOL_COUNT) : null,
    rush: hit ? rollRush(rng, forced.rush, rates.rushSpinHitRate) : null,
  };
}
