// 三台機台的個性。調手感只改這裡，機率規則本身在 outcome.ts。
import type { Tune } from './outcome';

export type MachineId = 'old' | 'steady' | 'wild';

export interface Machine extends Tune {
  id: MachineId;
  name: string;
  desc: string;
  fame: number;
  payout: number;
  tint: number;
}

export const MACHINES: Machine[] = [
  { id: 'old', name: '阿公的老台', desc: '各方面平均，阿公用了三十年。', fame: 0, hitRate: 1 / 30, reachOnMiss: 0.2, comebackRate: 0.15, rushSpinHitRate: 0.095, payout: 1, tint: 0xffffff },
  { id: 'steady', name: '穩定台', desc: '常中小獎，比較不容易倒店。', fame: 15, hitRate: 1 / 18, reachOnMiss: 0.25, comebackRate: 0.15, rushSpinHitRate: 0.08, payout: 0.5, tint: 0x9dffc0 },
  { id: 'wild', name: '狂暴台', desc: '很難中，一中就爆發，遶境常走到廟口。', fame: 60, hitRate: 1 / 60, reachOnMiss: 0.12, comebackRate: 0.2, rushSpinHitRate: 0.16, payout: 2.4, tint: 0xff8a7a },
];

export function machineById(id: MachineId): Machine {
  return MACHINES.find((machine) => machine.id === id) ?? MACHINES[0];
}

export function isUnlocked(machine: Machine, fame: number): boolean {
  return fame >= machine.fame;
}
