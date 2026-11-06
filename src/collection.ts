// 圖鑑內容與跨局存檔。倒店也不會清掉這裡的東西。
import { FORTUNES, EVENTS } from './fortune';
import { MACHINES, type MachineId } from './machines';
import { BOSS_NAMES } from './boss';

export interface BookEntry {
  id: string;
  name: string;
}

export interface BookGroup {
  title: string;
  entries: BookEntry[];
}

export const BOOK: BookGroup[] = [
  { title: '演出', entries: [
    { id: 'chance', name: '機會' }, { id: 'luck', name: '好運' }, { id: 'hot', name: '激熱' }, { id: 'superhot', name: '超激熱' },
    { id: 'sheng1', name: '聖筊×1' }, { id: 'sheng2', name: '聖筊×2' }, { id: 'triple', name: '三聖筊' }, { id: 'xiao', name: '笑筊' }, { id: 'yin', name: '陰筊' },
    { id: 'revive', name: '復活' }, { id: 'jackpot', name: '大獎' }, { id: 'rush', name: '遶境' }, { id: 'chain', name: '連莊' }, { id: 'temple', name: '抵達廟口' },
  ] },
  { title: '隱藏演出', entries: [
    { id: 'golden', name: '金色阿公' }, { id: 'announce', name: '一發告知' }, { id: 'hotnight', name: '一晚三次大獎' },
  ] },
  { title: '地頭蛇', entries: [...BOSS_NAMES.map((name) => ({ id: `boss-${name}`, name })), { id: 'beat', name: '打倒地頭蛇' }] },
  { title: '機台', entries: MACHINES.slice(1).map((machine) => ({ id: `machine-${machine.id}`, name: machine.name })) },
  { title: '籤詩', entries: FORTUNES.map((fortune, i) => ({ id: `fortune-${i}`, name: `${fortune.rank}・${fortune.verse}` })) },
  { title: '事件', entries: EVENTS.map((event, i) => ({ id: `event-${i}`, name: event.title })) },
];

export const BOOK_TOTAL = BOOK.reduce((sum, group) => sum + group.entries.length, 0);

// 每收集這麼多項就送名氣。
export const BOOK_STEP = 10;
export const BOOK_FAME = 3;

export const FAME_PER_NIGHT = 1;
export const FAME_PER_BOSS = 5;

export interface Meta {
  fame: number;
  machine: MachineId;
  seen: string[];
}

export function newMeta(): Meta {
  return { fame: 0, machine: 'old', seen: [] };
}

// 回傳這次收集送的名氣；已經看過就回傳 null。
export function markSeen(meta: Meta, id: string): number | null {
  if (meta.seen.includes(id)) return null;
  meta.seen.push(id);
  const fame = meta.seen.length % BOOK_STEP === 0 ? BOOK_FAME : 0;
  meta.fame += fame;
  return fame;
}
