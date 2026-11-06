// 籤詩和事件：都是在開市前決定當晚的倍率。這個檔案不碰畫面。
export interface NightMods {
  payout: number;
  rent: number;
  price: number;
  sell: number;
  hit: number;
  reach: number;
  rush: number;
  boss: number;
}

export const NEUTRAL: NightMods = { payout: 1, rent: 1, price: 1, sell: 1, hit: 1, reach: 1, rush: 1, boss: 1 };

const MOD_LABELS: Array<[keyof NightMods, string]> = [
  ['payout', '出珠'],
  ['hit', '中獎率'],
  ['rush', '連莊率'],
  ['reach', '聽牌率'],
  ['boss', '打地頭蛇傷害'],
  ['rent', '地頭費'],
  ['price', '珠價'],
  ['sell', '換現金'],
];

export function combineMods(a: NightMods, b: Partial<NightMods>): NightMods {
  const merged = { ...a };
  for (const [key] of MOD_LABELS) merged[key] = a[key] * (b[key] ?? 1);
  return merged;
}

export function describeMods(mods: Partial<NightMods>): string {
  const parts = MOD_LABELS.filter(([key]) => (mods[key] ?? 1) !== 1).map(([key, label]) => `${label} ×${Number((mods[key] ?? 1).toFixed(2))}`);
  return parts.length ? parts.join('・') : '沒有特別加成';
}

export interface Fortune {
  rank: '上上籤' | '上籤' | '中籤' | '下籤' | '下下籤';
  verse: string;
  mods: Partial<NightMods>;
}

export const FORTUNES: Fortune[] = [
  { rank: '上上籤', verse: '鑼聲一響滿街紅，今夜金珠滾滾來。', mods: { payout: 1.5 } },
  { rank: '上上籤', verse: '神桌前頭筊連聖，心想事成不用猜。', mods: { hit: 1.5 } },
  { rank: '上上籤', verse: '遶境鞭炮響不停，一站接著一站行。', mods: { rush: 1.4 } },
  { rank: '上籤', verse: '燈籠高掛客滿街，小攤也有大生意。', mods: { payout: 1.25 } },
  { rank: '上籤', verse: '老闆今日心情好，珠價便宜算你賺。', mods: { price: 0.85 } },
  { rank: '上籤', verse: '換珠櫃檯笑呵呵，一分一毫多給你。', mods: { sell: 1.15 } },
  { rank: '上籤', verse: '聽牌聲聲入耳來，機會不怕等一等。', mods: { reach: 1.5, boss: 1.2 } },
  { rank: '中籤', verse: '無風無雨平常夜，照舊開攤照舊打。', mods: {} },
  { rank: '中籤', verse: '進一步來退半步，賺得多也花得多。', mods: { payout: 1.2, price: 1.15 } },
  { rank: '中籤', verse: '細水長流莫貪多，小獎不斷也是福。', mods: { hit: 1.25, payout: 0.85 } },
  { rank: '中籤', verse: '拳頭硬過鐵算盤，惡人來了也要閃。', mods: { boss: 1.5, rent: 1.1 } },
  { rank: '下籤', verse: '烏雲罩頂租金漲，險中求財看膽量。', mods: { rent: 1.2, payout: 2 } },
  { rank: '下籤', verse: '守得雲開路難行，一旦上路停不住。', mods: { hit: 0.8, rush: 1.3 } },
  { rank: '下下籤', verse: '大凶之夜莫強求，偏要強求賭一手。', mods: { rent: 1.5, payout: 3 } },
  { rank: '下下籤', verse: '珠價飛天人人罵，機台反而特別鬆。', mods: { price: 1.5, hit: 1.6 } },
];

export interface EventOption {
  label: string;
  // 金額都是當晚地頭費的倍數，後期才不會變成零頭。
  cost?: number;
  gain?: number;
  // 收攤時才拿回來的錢。
  repay?: number;
  fame?: number;
  gamble?: { chance: number; payback: number };
  mods?: Partial<NightMods>;
  result: string;
}

export interface NightEvent {
  title: string;
  text: string;
  options: [EventOption, EventOption];
}

export const EVENTS: NightEvent[] = [
  { title: '進香團湧入', text: '遊覽車一台接一台，整條街都是人。要不要多備料？', options: [
    { label: '多備料', cost: 0.3, mods: { payout: 1.4 }, result: '人潮全往你這裡擠。' },
    { label: '照常就好', result: '賺個平常錢，也不錯。' },
  ] },
  { title: '颱風要來了', text: '氣象說半夜登陸。街上的人走得差不多，機台卻沒人搶。', options: [
    { label: '硬開到底', mods: { hit: 1.25, sell: 0.85 }, result: '機台隨你打，只是換珠櫃檯急著收。' },
    { label: '早點收工', mods: { rent: 0.7, payout: 0.7 }, result: '地頭費打了折，生意也打了折。' },
  ] },
  { title: '警察臨檢', text: '警察來查攤位許可，排隊的客人開始散了。', options: [
    { label: '請喝杯珍奶', cost: 0.2, result: '大家都客客氣氣，很快就結束了。' },
    { label: '慢慢配合', mods: { hit: 0.85 }, result: '查了好一陣子，今晚手氣有點冷。' },
  ] },
  { title: '老朋友來借錢', text: '阿公的老朋友搓著手說：「收攤前一定連本帶利還你。」', options: [
    { label: '借他', cost: 0.5, repay: 0.8, result: '收攤時他會帶錢回來。今晚手頭緊一點。' },
    { label: '假裝沒聽到', result: '阿公嘆了一口氣。' },
  ] },
  { title: '隔壁攤送香腸', text: '隔壁香腸伯多烤了一批，端過來請大家吃。', options: [
    { label: '收下', gain: 0.2, result: '省下一頓，客人也聞香而來。' },
    { label: '回送一杯飲料', cost: 0.1, mods: { reach: 1.5 }, result: '整條街都替你加油。' },
  ] },
  { title: '暗巷賭盤', text: '巷口有人招手：「押一把，一翻兩瞪眼。」', options: [
    { label: '押一把', cost: 0.5, gamble: { chance: 0.5, payback: 1.5 }, result: '' },
    { label: '不碰', result: '阿公說得對，十賭九輸。' },
  ] },
  { title: '廟方擲筊大賽', text: '報名費不貴，贏的人今晚走路有風。', options: [
    { label: '報名', cost: 0.2, mods: { rush: 1.3 }, result: '連擲幾個聖筊，士氣大振。' },
    { label: '在旁邊看', result: '熱鬧也看了，錢也省了。' },
  ] },
  { title: '夜市跳電', text: '半條街黑了。可以花錢叫人修，也可以點蠟燭硬撐。', options: [
    { label: '叫人修', cost: 0.3, result: '燈亮了，一切照舊。' },
    { label: '點蠟燭硬撐', mods: { hit: 0.8, rent: 0.9 }, result: '地頭費少收一點，機台卻看不太清楚。' },
  ] },
  { title: '網紅來直播', text: '手機架到你面前：「阿公，跟大家打個招呼！」', options: [
    { label: '配合演出', fame: 2, mods: { payout: 0.9 }, result: '阿公紅了，只是今晚一直分心。' },
    { label: '揮手趕走', result: '少了麻煩，也少了名氣。' },
  ] },
  { title: '金爐開爐', text: '廟口金爐燒得正旺，大家都拿著金紙排隊。', options: [
    { label: '燒一疊金紙', cost: 0.25, mods: { hit: 1.25 }, result: '煙往你這邊飄，應該是好兆頭。' },
    { label: '拜一下就好', result: '心意到了。' },
  ] },
];

export const EVENT_CHANCE = 0.35;

export type Rng = () => number;

export function drawFortune(rng: Rng): number {
  return Math.floor(rng() * FORTUNES.length);
}

// 第一晚先讓玩家熟悉，不出事件。
export function drawEvent(rng: Rng, night: number): number | null {
  if (night < 2 || rng() >= EVENT_CHANCE) return null;
  return Math.floor(rng() * EVENTS.length);
}

export interface EventResult {
  cashDelta: number;
  repay: number;
  fame: number;
  mods: Partial<NightMods>;
  text: string;
}

export function canAfford(option: EventOption, cash: number, rent: number): boolean {
  return cash >= Math.round((option.cost ?? 0) * rent);
}

export function resolveOption(option: EventOption, rent: number, rng: Rng): EventResult {
  let cashDelta = Math.round(((option.gain ?? 0) - (option.cost ?? 0)) * rent);
  let text = option.result;
  if (option.gamble) {
    const won = rng() < option.gamble.chance;
    if (won) cashDelta += Math.round(option.gamble.payback * rent);
    text = won ? '翻出來是你的！對方臉都綠了。' : '押金沒了，對方笑著走開。';
  }
  return { cashDelta, repay: Math.round((option.repay ?? 0) * rent), fame: option.fame ?? 0, mods: option.mods ?? {}, text };
}
