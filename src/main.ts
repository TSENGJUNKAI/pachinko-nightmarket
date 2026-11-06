import '@fontsource/noto-serif-tc/900.css';
import '@fontsource/noto-sans-tc/900.css';
import gsap from 'gsap';
import { roll } from './outcome';
import { AudioKit } from './audio';
import { Stage } from './stage';
import { Director } from './director';
import { loadFonts } from './text';
import { ECONOMY, ballPrice, ballsToCash, buyBalls, moneyText, newRun, newTitleAt, payoutScale, rentForNight, settle, titleFor, upgradeCost, type RunState } from './economy';

function el<T extends HTMLElement>(id: string) {
  return document.getElementById(id) as T;
}

const fireButton = el<HTMLButtonElement>('fire');
const fireLabel = el<HTMLElement>('fire-label');
const fireHint = el<HTMLElement>('fire-hint');
const forceSelect = el<HTMLSelectElement>('force');
const muteButton = el<HTMLButtonElement>('mute');
const powerInput = el<HTMLInputElement>('power');
const buyButton = el<HTMLButtonElement>('buy');
const closeButton = el<HTMLButtonElement>('close-stall');
const screen = el('screen');
const screenTitle = el('screen-title');
const screenStory = el('screen-story');
const billing = el('billing');
const stallPanel = el('stall-panel');
const upgradeButton = el<HTMLButtonElement>('upgrade');
const openButton = el<HTMLButtonElement>('open-night');
const restartButton = el<HTMLButtonElement>('restart');

await loadFonts();

const audio = new AudioKit();
const stage = await new Stage().init(el('canvas-slot'), audio);

const SAVE_KEY = 'agong-stall-save';
const INTRO_STORY = '阿公欠下地頭費。每晚收攤都要繳錢，繳不出來攤位就沒了。先買珠，再開始打。';

function loadRun(): RunState {
  try {
    const saved = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null') as RunState | null;
    if (saved && saved.night >= 1 && saved.level >= 1 && saved.cash >= 0) return saved;
  } catch {
    // 讀不到存檔就從頭開始。
  }
  return newRun();
}

function saveRun() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(run));
  } catch {
    // 無痕模式等情況存不了，遊戲照常進行。
  }
}

let run = loadRun();
type Phase = 'day' | 'night' | 'bust';
let phase: Phase = 'day';
let balls = 0;
let closing = false;
// 錢不夠繳時，收攤要按兩次才算數。
let closeArmed = false;
let nightJackpots = 0;

function renderHud() {
  el('stat-night').textContent = String(run.night);
  const value = run.cash + ballsToCash(balls, run.night);
  const rent = rentForNight(run.night);
  const statValue = el('stat-value');
  statValue.textContent = moneyText(value);
  statValue.classList.toggle('short', phase === 'night' && value < rent);
  el('stat-cash').textContent = moneyText(run.cash);
  el('stat-balls').textContent = moneyText(balls);
  el('stat-rent').textContent = moneyText(rentForNight(run.night));
  el('stat-level').textContent = String(run.level);
  const canAct = phase === 'night' && !closing;
  el('buy-cost').textContent = `−${moneyText(ballPrice(run.night) * ECONOMY.buyBalls)} 元`;
  buyButton.disabled = !canAct || buyBalls(run.cash, run.night).balls === 0;
  closeButton.disabled = !canAct;
  if (value >= rent) closeArmed = false;
  closeButton.textContent = closing ? '收攤中…' : closeArmed ? '再按倒店' : '收攤';
  closeButton.classList.toggle('danger', closeArmed);
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

function updateFireButton() {
  fireButton.disabled = !director.rush.active && (stage.board.paused || phase !== 'night' || closing);
}

function setTakeover(active: boolean) {
  stage.board.paused = active;
  updateFireButton();
  if (active) stopFiring();
}

const director = new Director(
  stage,
  audio,
  ({ win, balls: won }) => {
    nightJackpots += win;
    balls += won;
    renderHud();
  },
  (active) => {
    setRushControls(active);
    updateFireButton();
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
    await director.run(roll(Math.random, force));
  }
  running = false;
}

stage.board.onPocket = (force) => {
  balls += ECONOMY.entryBalls;
  renderHud();
  if (queue.length >= MAX_HOLD) return;
  queue.push(force);
  stage.setHoldLamps(queue.length);
  void runQueue();
};

function beginClosing() {
  if (phase !== 'night' || closing) return;
  closing = true;
  stopFiring();
  updateFireButton();
  renderHud();
}

function shoot() {
  if (phase !== 'night' || closing) return;
  if (balls <= 0) {
    stopFiring();
    // 沒珠也沒錢，今晚只能收攤了。
    if (buyBalls(run.cash, run.night).balls === 0) {
      beginClosing();
      return;
    }
    gsap.fromTo(buyButton, { scale: 1.12 }, { scale: 1, duration: 0.3, ease: 'back.out(3)' });
    return;
  }
  const power = Number(powerInput.value) / 100;
  if (stage.board.launch(power)) {
    balls -= 1;
    renderHud();
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
  // 等場上的珠子和保留的演出都跑完才結算。
  if (closing && !running && !queue.length && stage.board.ballCount === 0) finishNight();
  if (!firing || stage.board.paused) return;
  fireTimer += delta;
  if (fireTimer >= FIRE_INTERVAL) {
    fireTimer = 0;
    shoot();
  }
};

function billRow(label: string, value: string, kind = '') {
  const row = document.createElement('div');
  row.className = `bill-row ${kind}`;
  const name = document.createElement('span');
  name.textContent = label;
  const amount = document.createElement('b');
  amount.textContent = value;
  row.append(name, amount);
  return row;
}

function renderStall() {
  const cost = upgradeCost(run.level);
  el('stall-level').textContent = String(run.level);
  el('stall-scale').textContent = `×${payoutScale(run.level).toFixed(1)}`;
  el('stall-title').textContent = titleFor(run.night - 1);
  upgradeButton.textContent = `升級攤位　−${moneyText(cost)} 元`;
  upgradeButton.disabled = run.cash < cost;
  el('next-rent').textContent = `第 ${run.night} 晚：地頭費 ${moneyText(rentForNight(run.night))} 元，珠價每顆 ${moneyText(ballPrice(run.night))} 元`;
  openButton.textContent = `開市：第 ${run.night} 晚`;
}

function showScreen(title: string, story: string, rows: HTMLElement[]) {
  screenTitle.textContent = title;
  screenStory.textContent = story;
  billing.replaceChildren(...rows);
  billing.hidden = rows.length === 0;
  stallPanel.hidden = phase === 'bust';
  restartButton.hidden = phase === 'bust';
  restartArmed = false;
  restartButton.textContent = '放棄這局，重新開始';
  screen.hidden = false;
  if (phase !== 'bust') renderStall();
  else openButton.textContent = '重新開張';
  openButton.focus();
}

function enterDay(title: string, story: string, rows: HTMLElement[] = []) {
  phase = 'day';
  stage.board.paused = true;
  saveRun();
  updateFireButton();
  renderHud();
  showScreen(title, story, rows);
}

function finishNight() {
  closing = false;
  stopFiring();
  const finished = run.night;
  const result = settle(run.cash, balls, finished);
  const rows = [
    billRow(`大獎 ${nightJackpots} 次・${moneyText(balls)} 珠換現金`, `+${moneyText(result.earned)} 元`, 'gain'),
    billRow(`第 ${finished} 晚地頭費`, `−${moneyText(result.rent)} 元`, 'loss'),
  ];
  balls = 0;
  if (result.bankrupt) {
    run.best = Math.max(run.best, finished - 1);
    phase = 'bust';
    stage.board.paused = true;
    rows.push(billRow('還差', `${moneyText(result.rent - run.cash - result.earned)} 元`, 'loss'));
    const best = run.best;
    run = newRun(best);
    saveRun();
    updateFireButton();
    renderHud();
    showScreen('倒店了', `撐過 ${finished - 1} 晚，最高紀錄 ${best} 晚。阿公收起攤子，明天再來過。`, rows);
    return;
  }
  run.cash = result.cashAfter;
  run.night = finished + 1;
  run.best = Math.max(run.best, finished);
  rows.push(billRow('手上現金', `${moneyText(run.cash)} 元`, 'total'));
  const title = newTitleAt(finished);
  const story = title ? `撐過 ${finished} 晚，新稱號：${title}！` : '繳清了。今晚賺的錢要留著，還是投資攤位？';
  enterDay(`第 ${finished} 晚收攤`, story, rows);
}

function startNight() {
  screen.hidden = true;
  phase = 'night';
  balls = 0;
  nightJackpots = 0;
  closeArmed = false;
  closing = false;
  director.payoutScale = payoutScale(run.level);
  stage.board.paused = false;
  stage.setHoldLamps(0);
  updateFireButton();
  renderHud();
  fireButton.focus();
}

openButton.addEventListener('click', () => {
  audio.unlock();
  if (phase === 'bust') {
    enterDay('第 1 晚', INTRO_STORY);
    return;
  }
  startNight();
});

upgradeButton.addEventListener('click', () => {
  const cost = upgradeCost(run.level);
  if (run.cash < cost) return;
  audio.unlock();
  run.cash -= cost;
  run.level += 1;
  saveRun();
  audio.reelStop();
  renderHud();
  renderStall();
});

// 按兩次才算數，避免誤按把進度清掉。
let restartArmed = false;
restartButton.addEventListener('click', () => {
  if (!restartArmed) {
    restartArmed = true;
    restartButton.textContent = '再按一次確認，進度會歸零';
    return;
  }
  run = newRun(run.best);
  enterDay('第 1 晚', INTRO_STORY);
});

buyButton.addEventListener('click', () => {
  audio.unlock();
  const { balls: bought, cost } = buyBalls(run.cash, run.night);
  if (phase !== 'night' || closing || bought === 0) return;
  run.cash -= cost;
  balls += bought;
  audio.ballPing();
  renderHud();
  buyButton.blur();
});

closeButton.addEventListener('click', () => {
  closeButton.blur();
  const short = run.cash + ballsToCash(balls, run.night) < rentForNight(run.night);
  if (short && !closeArmed) {
    closeArmed = true;
    renderHud();
    return;
  }
  closeArmed = false;
  beginClosing();
});

function pressDown() {
  audio.unlock();
  if (director.rush.active) {
    director.rush.press();
    return;
  }
  if (stage.board.paused || phase !== 'night' || closing) return;
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
  muteButton.blur();
});

enterDay(`第 ${run.night} 晚`, run.night === 1 ? INTRO_STORY : '回來開店了。準備好就開市。');

// 開發時用來自動測試演出。
declare global {
  interface Window {
    __game: unknown;
  }
}
window.__game = {
  stage,
  audio,
  director,
  gsap,
  queue,
  shoot,
  roll,
  isRunning: () => running,
  state: () => ({ phase, balls, closing, run }),
};
