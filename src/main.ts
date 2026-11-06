import '@fontsource/noto-serif-tc/900.css';
import '@fontsource/noto-sans-tc/900.css';
import gsap from 'gsap';
import { roll } from './outcome';
import { AudioKit } from './audio';
import { Stage } from './stage';
import { Director } from './director';
import { loadFonts } from './text';
import { BOOK, BOOK_FAME, BOOK_STEP, BOOK_TOTAL, FAME_PER_BOSS, FAME_PER_NIGHT, markSeen, newMeta, type Meta } from './collection';
import { EVENTS, FORTUNES, NEUTRAL, canAfford, combineMods, describeMods, drawEvent, drawFortune, resolveOption, type EventOption } from './fortune';
import { MACHINES, isUnlocked, machineById } from './machines';
import { BOSS_DAMAGE, bossForNight, type Boss, type BossHit } from './boss';
import { ECONOMY, ballPrice, ballsToCash, buyBalls, moneyText, newRun, payoutScale, rentForNight, settle, titleFor, upgradeCost, type RunState, type Today } from './economy';

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
const bookButton = el<HTMLButtonElement>('open-book');
const toastBox = el('toast');

await loadFonts();

const audio = new AudioKit();
const stage = await new Stage().init(el('canvas-slot'), audio);

const SAVE_KEY = 'agong-stall-save';
const META_KEY = 'agong-stall-meta';
const INTRO_STORY = '阿公欠下地頭費。每晚收攤都要繳錢，繳不出來攤位就沒了。先買珠，再開始打。';

function loadRun(): RunState {
  try {
    const saved = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null') as RunState | null;
    if (saved && saved.night >= 1 && saved.level >= 1 && saved.cash >= 0) return { ...newRun(), ...saved };
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

function loadMeta(): Meta {
  try {
    return { ...newMeta(), ...(JSON.parse(localStorage.getItem(META_KEY) ?? 'null') as Partial<Meta> | null) };
  } catch {
    return newMeta();
  }
}

function saveMeta() {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(meta));
  } catch {
    // 同上，存不了就算了。
  }
}

let run = loadRun();
const meta = loadMeta();
type Phase = 'day' | 'night' | 'bust';
let phase: Phase = 'day';
let balls = 0;
let closing = false;
// 錢不夠繳時，收攤要按兩次才算數。
let closeArmed = false;
let nightJackpots = 0;
let boss: Boss | null = null;
let bossHp = 0;

const bossAlive = () => boss !== null && bossHp > 0;
const bossDead = () => boss !== null && bossHp <= 0;

const mods = () => run.today?.mods ?? NEUTRAL;
const machine = () => {
  const picked = machineById(meta.machine);
  return isUnlocked(picked, meta.fame) ? picked : MACHINES[0];
};

function tune() {
  const m = machine();
  const night = mods();
  return {
    hitRate: Math.min(0.5, m.hitRate * night.hit),
    reachOnMiss: Math.min(0.6, m.reachOnMiss * night.reach),
    comebackRate: m.comebackRate,
    rushSpinHitRate: Math.min(0.5, m.rushSpinHitRate * night.rush),
  };
}

function rentDue() {
  return Math.round(rentForNight(run.night) * mods().rent);
}

function amountDue() {
  return rentDue() + (bossAlive() ? boss!.penalty : 0);
}

function closingValue() {
  return run.cash + ballsToCash(balls, run.night, mods().sell) + (bossDead() ? boss!.bonus : 0) + (run.today?.repay ?? 0);
}

let toastTween: gsap.core.Tween | null = null;

function toast(text: string) {
  toastTween?.kill();
  toastBox.textContent = text;
  toastBox.hidden = false;
  toastTween = gsap.fromTo(toastBox, { opacity: 1 }, { opacity: 0, delay: 1.6, duration: 0.4, onComplete: () => { toastBox.hidden = true; } });
}

function seen(id: string) {
  const fame = markSeen(meta, id);
  if (fame === null) return;
  saveMeta();
  const label = BOOK.flatMap((group) => group.entries).find((entry) => entry.id === id)?.name ?? '';
  toast(fame ? `圖鑑滿 ${meta.seen.length} 項，名氣 +${BOOK_FAME}！` : `圖鑑新增：${label}`);
}

function hitBoss(hit: BossHit) {
  if (!boss || bossHp <= 0) return;
  const amount = Math.round(BOSS_DAMAGE[hit] * mods().boss);
  bossHp -= amount;
  stage.bossBar.hit(bossHp, amount);
  if (bossHp <= 0) {
    seen('beat');
    audio.rainbowSting();
    audio.firecrackers(12);
    stage.flash(0xffffff, 0.55, 0.4);
    stage.shake(22, 0.5);
    stage.sparks(360, 60, 90, [0xffd257, 0xff4d4d, 0xffffff], 520);
    stage.bigText('打倒地頭蛇', 'fire', { size: 96, y: 320, hold: 1.2, maxWidth: 660 });
  } else if (amount >= BOSS_DAMAGE.chain) {
    stage.shake(10, 0.2);
  }
  renderHud();
}

function renderHud() {
  el('stat-night').textContent = String(run.night);
  const value = closingValue();
  const rent = amountDue();
  const statValue = el('stat-value');
  statValue.textContent = moneyText(value);
  statValue.classList.toggle('short', phase === 'night' && value < rent);
  el('stat-cash').textContent = moneyText(run.cash);
  el('stat-balls').textContent = moneyText(balls);
  el('stat-rent').textContent = moneyText(rent);
  el('stat-level').textContent = String(run.level);
  el('night-mods').textContent = [machine().name, ...(run.today ? [FORTUNES[run.today.fortune].rank, describeMods(run.today.mods)] : [])].join('｜');
  const canAct = phase === 'night' && !closing;
  el('buy-cost').textContent = `−${moneyText(Math.ceil(ballPrice(run.night) * mods().price) * ECONOMY.buyBalls)} 元`;
  buyButton.disabled = !canAct || buyBalls(run.cash, run.night, mods().price).balls === 0;
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
    if (nightJackpots >= 3) seen('hotnight');
    balls += won;
    renderHud();
  },
  (active) => {
    setRushControls(active);
    stage.bossBar.setRush(active);
    updateFireButton();
  },
  setTakeover,
);

director.onBossHit = hitBoss;
director.onSeen = seen;

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
    hitBoss('spin');
    await director.run(roll(Math.random, force, tune()));
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
    if (buyBalls(run.cash, run.night, mods().price).balls === 0) {
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

function renderMachines() {
  const row = el('machine-row');
  const current = machine();
  row.replaceChildren(...MACHINES.map((item) => {
    const button = document.createElement('button');
    button.type = 'button';
    const open = isUnlocked(item, meta.fame);
    button.textContent = item.name;
    button.disabled = !open;
    button.classList.toggle('picked', item.id === current.id);
    button.setAttribute('aria-pressed', String(item.id === current.id));
    if (!open) {
      const need = document.createElement('small');
      need.textContent = `名氣 ${item.fame} 解鎖`;
      button.append(need);
    }
    button.addEventListener('click', () => {
      meta.machine = item.id;
      saveMeta();
      audio.reelStop();
      renderHud();
      renderMachines();
    });
    return button;
  }));
  el('machine-desc').textContent = current.desc;
  stage.setMachineTint(current.tint);
}

function eventOptionButton(option: EventOption, rent: number, today: Today) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = option.label;
  const notes: string[] = [];
  if (option.cost) notes.push(`−${moneyText(Math.round(option.cost * rent))} 元`);
  if (option.gain) notes.push(`+${moneyText(Math.round(option.gain * rent))} 元`);
  if (option.repay) notes.push(`收攤拿回 ${moneyText(Math.round(option.repay * rent))} 元`);
  if (option.gamble) notes.push(`一半機率拿回 ${moneyText(Math.round(option.gamble.payback * rent))} 元`);
  if (option.fame) notes.push(`名氣 +${option.fame}`);
  if (option.mods) notes.push(describeMods(option.mods));
  if (notes.length) {
    const note = document.createElement('small');
    note.textContent = notes.join('・');
    button.append(note);
  }
  button.disabled = !canAfford(option, run.cash, rent);
  button.addEventListener('click', () => {
    const result = resolveOption(option, rent, Math.random);
    run.cash += result.cashDelta;
    meta.fame += result.fame;
    today.repay += result.repay;
    today.mods = combineMods(today.mods, result.mods);
    today.chosen = true;
    today.result = result.text;
    saveRun();
    saveMeta();
    audio.reelStop();
    renderHud();
    renderStall();
    openButton.focus();
  });
  return button;
}

function renderToday() {
  const today = run.today;
  const fortuneBox = el('fortune-box');
  const eventBox = el('event-box');
  fortuneBox.hidden = !today;
  eventBox.hidden = !today || today.event === null;
  if (!today) {
    openButton.disabled = false;
    openButton.textContent = '抽今晚的籤';
    return;
  }
  const fortune = FORTUNES[today.fortune];
  fortuneBox.classList.toggle('low', fortune.rank.startsWith('下'));
  el('fortune-rank').textContent = fortune.rank;
  el('fortune-verse').textContent = fortune.verse;
  el('fortune-effect').textContent = describeMods(fortune.mods);
  openButton.disabled = today.event !== null && !today.chosen;
  openButton.textContent = openButton.disabled ? '先決定事件' : `開市：第 ${run.night} 晚`;
  if (today.event === null) return;
  const event = EVENTS[today.event];
  el('event-title').textContent = event.title;
  el('event-text').textContent = today.chosen ? today.result : event.text;
  const rent = rentForNight(run.night);
  el('event-options').replaceChildren(...(today.chosen ? [] : event.options.map((option) => eventOptionButton(option, rent, today))));
}

function drawToday() {
  const fortune = drawFortune(Math.random);
  const event = drawEvent(Math.random, run.night);
  run.today = { fortune, event, chosen: false, result: '', mods: combineMods(NEUTRAL, FORTUNES[fortune].mods), repay: 0 };
  seen(`fortune-${fortune}`);
  if (event !== null) seen(`event-${event}`);
  saveRun();
  if (FORTUNES[fortune].rank.startsWith('下')) audio.jiaoBad();
  else audio.jiaoGood(FORTUNES[fortune].rank === '上上籤' ? 3 : 1);
  renderStall();
}

function renderBook() {
  el('book-count').textContent = `${meta.seen.length} / ${BOOK_TOTAL}`;
  el('book-hint').textContent = `每收集 ${BOOK_STEP} 項，名氣 +${BOOK_FAME}。倒店也不會清掉。`;
  el('book-groups').replaceChildren(...BOOK.flatMap((group) => {
    const heading = document.createElement('h3');
    heading.textContent = group.title;
    const list = document.createElement('div');
    list.className = 'book-list';
    list.append(...group.entries.map((entry) => {
      const chip = document.createElement('span');
      const known = meta.seen.includes(entry.id);
      chip.textContent = known ? entry.name : '？？？';
      chip.classList.toggle('unseen', !known);
      return chip;
    }));
    return [heading, list];
  }));
}

function renderStall() {
  const cost = upgradeCost(run.level);
  el('stall-fame').textContent = String(meta.fame);
  el('stall-level').textContent = String(run.level);
  el('stall-scale').textContent = `×${payoutScale(run.level).toFixed(1)}`;
  el('stall-title').textContent = titleFor(run.bossWins);
  const next = bossForNight(run.night);
  const note = el('boss-note');
  note.hidden = !next;
  if (next) note.textContent = `今晚地頭蛇「${next.name}」來收保護費！血量 ${next.hp}。收攤前打倒可賺 ${moneyText(next.bonus)} 元，打不倒要多繳 ${moneyText(next.penalty)} 元。`;
  upgradeButton.textContent = `升級攤位　−${moneyText(cost)} 元`;
  upgradeButton.disabled = run.cash < cost;
  el('next-rent').textContent = `第 ${run.night} 晚：地頭費 ${moneyText(rentDue())} 元，珠價每顆 ${moneyText(Math.ceil(ballPrice(run.night) * mods().price))} 元`;
  renderMachines();
  renderToday();
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
  else {
    openButton.disabled = false;
    openButton.textContent = '重新開張';
  }
  bookButton.textContent = `演出圖鑑 ${meta.seen.length}/${BOOK_TOTAL}`;
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
  const beaten = bossDead();
  const escaped = bossAlive();
  const bossName = boss?.name ?? '';
  const bossBonus = beaten ? boss!.bonus : 0;
  const repay = run.today?.repay ?? 0;
  const result = settle(run.cash, balls, finished, { bonus: bossBonus + repay, penalty: escaped ? boss!.penalty : 0, rentScale: mods().rent, sellScale: mods().sell });
  const rows = [
    billRow(`大獎 ${nightJackpots} 次・${moneyText(balls)} 珠換現金`, `+${moneyText(result.earned)} 元`, 'gain'),
  ];
  if (beaten) rows.push(billRow(`打倒${bossName}`, `+${moneyText(bossBonus)} 元`, 'gain'));
  if (repay) rows.push(billRow('老朋友還錢', `+${moneyText(repay)} 元`, 'gain'));
  rows.push(billRow(`第 ${finished} 晚地頭費`, `−${moneyText(result.rent)} 元`, 'loss'));
  if (escaped) rows.push(billRow(`${bossName}的保護費`, `−${moneyText(result.penalty)} 元`, 'loss'));
  boss = null;
  bossHp = 0;
  stage.bossBar.hide();
  stage.title.visible = true;
  balls = 0;
  run.today = null;
  const fameBefore = meta.fame;
  if (beaten) meta.fame += FAME_PER_BOSS;
  if (!result.bankrupt) meta.fame += FAME_PER_NIGHT;
  const fameGain = meta.fame - fameBefore;
  const unlocked = MACHINES.filter((item) => item.fame > fameBefore && item.fame <= meta.fame);
  const unlockNote = unlocked.length ? ` 解鎖新機台：${unlocked.map((item) => item.name).join('、')}！` : '';
  saveMeta();
  if (fameGain) rows.push(billRow('名氣', `+${fameGain}`, 'gain'));
  if (result.bankrupt) {
    run.best = Math.max(run.best, finished - 1);
    phase = 'bust';
    stage.board.paused = true;
    rows.push(billRow('還差', `${moneyText(result.rent + result.penalty - run.cash - result.earned - result.bonus)} 元`, 'loss'));
    const best = run.best;
    run = newRun(best);
    saveRun();
    updateFireButton();
    renderHud();
    showScreen('倒店了', `撐過 ${finished - 1} 晚，最高紀錄 ${best} 晚。阿公收起攤子，明天再來過。名氣 ${meta.fame} 和圖鑑都留著。${unlockNote}`, rows);
    return;
  }
  run.cash = result.cashAfter;
  run.night = finished + 1;
  run.best = Math.max(run.best, finished);
  rows.push(billRow('手上現金', `${moneyText(run.cash)} 元`, 'total'));
  if (beaten) run.bossWins += 1;
  const story = beaten
    ? `打倒${bossName}，新稱號：${titleFor(run.bossWins)}！`
    : escaped
      ? `${bossName}收了保護費揚長而去，下次再算帳。`
      : '繳清了。今晚賺的錢要留著，還是投資攤位？';
  enterDay(`第 ${finished} 晚收攤`, story + unlockNote, rows);
}

function startNight() {
  screen.hidden = true;
  phase = 'night';
  balls = 0;
  nightJackpots = 0;
  closeArmed = false;
  closing = false;
  const picked = machine();
  director.payoutScale = payoutScale(run.level) * picked.payout * mods().payout;
  stage.setMachineTint(picked.tint);
  if (picked.id !== 'old') seen(`machine-${picked.id}`);
  boss = bossForNight(run.night);
  bossHp = boss?.hp ?? 0;
  if (boss) {
    seen(`boss-${boss.name}`);
    stage.bossBar.show(boss.name, boss.hp);
    stage.title.visible = false;
    audio.reachSting();
    stage.shake(16, 0.4);
    stage.flash(0xff2020, 0.35, 0.35);
    stage.bigText(`地頭蛇 ${boss.name}`, 'red', { size: 78, y: 300, hold: 1.3, maxWidth: 660 });
  } else {
    stage.bossBar.hide();
    stage.title.visible = true;
  }
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
  if (!run.today) {
    drawToday();
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

bookButton.addEventListener('click', () => {
  renderBook();
  el('book').hidden = false;
});
el('close-book').addEventListener('click', () => {
  el('book').hidden = true;
  openButton.focus();
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
  const { balls: bought, cost } = buyBalls(run.cash, run.night, mods().price);
  if (phase !== 'night' || closing || bought === 0) return;
  run.cash -= cost;
  balls += bought;
  audio.ballPing();
  renderHud();
  buyButton.blur();
});

closeButton.addEventListener('click', () => {
  closeButton.blur();
  const short = closingValue() < amountDue();
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
  state: () => ({ phase, balls, closing, run, bossHp, boss, meta, tune: tune() }),
};
