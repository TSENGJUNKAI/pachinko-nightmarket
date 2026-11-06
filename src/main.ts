import '@fontsource/noto-serif-tc/900.css';
import '@fontsource/noto-sans-tc/900.css';
import gsap from 'gsap';
import { roll } from './outcome';
import { AudioKit } from './audio';
import { Stage } from './stage';
import { Director } from './director';
import { loadFonts } from './text';

function el<T extends HTMLElement>(id: string) {
  return document.getElementById(id) as T;
}

const fireButton = el<HTMLButtonElement>('fire');
const fireLabel = el<HTMLElement>('fire-label');
const fireHint = el<HTMLElement>('fire-hint');
const forceSelect = el<HTMLSelectElement>('force');
const muteButton = el<HTMLButtonElement>('mute');
const powerInput = el<HTMLInputElement>('power');

await loadFonts();

const audio = new AudioKit();
const stage = await new Stage().init(el('canvas-slot'), audio);

const stats = { shots: 0, spins: 0, wins: 0, chain: 0, balls: 0, finals: 0 };

function renderStats() {
  el('stat-shots').textContent = stats.shots.toLocaleString();
  el('stat-spins').textContent = stats.spins.toLocaleString();
  el('stat-wins').textContent = stats.wins.toLocaleString();
  el('stat-chain').textContent = stats.chain.toLocaleString();
  el('stat-balls').textContent = stats.balls.toLocaleString();
}

function setRushControls(active: boolean) {
  document.body.classList.toggle('rush', active);
  fireLabel.textContent = active ? '敲鑼！' : '發射！';
  fireHint.textContent = active ? '外圈縮到鑼邊時按' : '按住連發・空白鍵';
}

// 發射：按住會連發，真實機台約每 0.6 秒一顆。
const FIRE_INTERVAL = 0.6;
let firing = false;
let fireTimer = 0;

function stopFiring() {
  firing = false;
}

function setTakeover(active: boolean) {
  stage.board.paused = active;
  fireButton.disabled = active && !director.rush.active;
  if (active) stopFiring();
}

const director = new Director(
  stage,
  audio,
  ({ win, balls, chain, reachedFinal }) => {
    stats.wins += win;
    stats.balls += balls;
    stats.chain = Math.max(stats.chain, chain);
    if (reachedFinal) stats.finals += 1;
    renderStats();
  },
  (active) => {
    setRushControls(active);
    fireButton.disabled = !active && stage.board.paused;
  },
  setTakeover,
);

// 保留：進洞的珠子排隊，最多 4 顆，一次演一個結果。
const MAX_HOLD = 4;
const queue: string[] = [];
let running = false;

async function runQueue() {
  if (running) return;
  running = true;
  while (queue.length) {
    const force = queue.shift() ?? '';
    stage.setHoldLamps(queue.length);
    stats.spins += 1;
    renderStats();
    await director.run(roll(Math.random, force));
  }
  running = false;
}

stage.board.onPocket = (force) => {
  if (queue.length >= MAX_HOLD) return;
  queue.push(force);
  stage.setHoldLamps(queue.length);
  void runQueue();
};

function shoot() {
  const power = Number(powerInput.value) / 100;
  if (stage.board.launch(power)) {
    stats.shots += 1;
    renderStats();
  }
}

function startFiring() {
  if (audio.mode === null) audio.music('idle');
  firing = true;
  fireTimer = 0;
  shoot();
}

const previousUpdate = stage.onUpdate;
stage.onUpdate = (delta) => {
  previousUpdate?.(delta);
  if (!firing || stage.board.paused) return;
  fireTimer += delta;
  if (fireTimer >= FIRE_INTERVAL) {
    fireTimer = 0;
    shoot();
  }
};

function pressDown() {
  audio.unlock();
  if (director.rush.active) {
    director.rush.press();
    return;
  }
  if (stage.board.paused) return;
  const force = forceSelect.value;
  if (force) {
    // 演出測試：放一顆保證進洞的珠子，方便看指定的結果。
    if (audio.mode === null) audio.music('idle');
    stage.board.dropTest(force);
    return;
  }
  startFiring();
}

fireButton.addEventListener('pointerdown', (event) => {
  fireButton.setPointerCapture(event.pointerId);
  pressDown();
});
fireButton.addEventListener('pointerup', stopFiring);
fireButton.addEventListener('pointercancel', stopFiring);
fireButton.addEventListener('lostpointercapture', stopFiring);
// 用鍵盤操作按鈕（Enter）時發射一顆。
fireButton.addEventListener('click', (event) => {
  if (event.detail === 0) {
    pressDown();
    stopFiring();
  }
});

window.addEventListener('keydown', (event) => {
  if (event.code !== 'Space' || event.repeat) return;
  const tag = document.activeElement?.tagName;
  if (tag === 'SELECT' || tag === 'INPUT' || (tag === 'BUTTON' && document.activeElement !== fireButton)) return;
  event.preventDefault();
  pressDown();
});
window.addEventListener('keyup', (event) => {
  if (event.code === 'Space') stopFiring();
});
window.addEventListener('blur', stopFiring);

// 調完就把焦點還給遊戲，空白鍵才能繼續發射。
forceSelect.addEventListener('change', () => forceSelect.blur());
powerInput.addEventListener('change', () => powerInput.blur());
powerInput.addEventListener('input', () => {
  el('power-value').textContent = powerInput.value;
});

muteButton.addEventListener('click', () => {
  const muted = !audio.muted;
  audio.setMuted(muted);
  muteButton.textContent = muted ? '聲音：關' : '聲音：開';
  muteButton.setAttribute('aria-pressed', String(muted));
});

// 開發時用來自動測試演出。
declare global {
  interface Window {
    __game: unknown;
  }
}
window.__game = { stage, audio, stats, director, gsap, queue, shoot, roll, isRunning: () => running };
