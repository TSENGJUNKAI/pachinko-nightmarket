// 大獎和遶境 RUSH：真的打珠。往右打，進電動門才轉，中了就開大開口。
// 連莊與否在中大獎時就決定好了，玩家打得好不好只影響拿到多少珠和花多少時間。
import { Container, Graphics, Sprite } from 'pixi.js';
import gsap from 'gsap';
import { ATTACKER, CONFIG, RUSH_SPINS, RUSH_STOPS, attackerPayout, rushSpinReels, type RushPlan } from './outcome';
import { HEIGHT, WIDTH, wait, type Stage } from './stage';
import { BigText } from './text';
import { makeTempleGate, makeText } from './art';
import { RUSH_FIELD } from './boardPhysics';
import type { AudioKit } from './audio';
import type { BossHit } from './boss';

export interface RushResult {
  totalBalls: number;
  hits: number;
  reachedFinal: boolean;
}

// 每抵達一站敲一次鑼。
const GONG_BONUS = { perfect: 300, good: 120, late: 0 } as const;
const PERFECT_WINDOW = 0.13;
const GOOD_WINDOW = 0.3;
const GONG_SECONDS = 1.4;
const GAUGE = { x: 590, y: 985, target: 58 };
// 電動門一開一合，珠子要抓時機。
const GATE_OPEN = 0.8;
const GATE_CLOSED = 0.6;
const MAX_HOLD = 4;
const FIELD_MACHINE = { y: 300, scale: 0.66 };
const STRIP_Y = 492;
const HINT_GAP = 2.2;
const FIRE_TEXT = { label: '往右打！', hint: '力道拉高・按住連發' };

export class RushMode {
  active = false;
  // 演出中不開放打珠。
  canShoot = false;
  onBossHit: (hit: BossHit) => void = () => undefined;
  onEnterRush: () => void = () => undefined;
  onFireText: (label: string, hint: string) => void = () => undefined;

  private readonly hud = new Container();
  private readonly route = new Graphics();
  private readonly routeLabels: ReturnType<typeof makeText>[] = [];
  private readonly gauge = new Container();
  private readonly gaugeRing = new Graphics();
  private gaugeTime = 0;
  private gaugeDuration = 1;
  private gaugeOpen = false;
  private remaining: BigText | null = null;
  private readonly remainingLabel = makeText('剩餘', 30, 0xffffff, 0x2a0050, 6);
  private readonly roundText = makeText('', 30, 0xffe94a, 0x3a0606, 6);
  private readonly ballsText = makeText('', 34, 0xffe98c, 0x3a0606, 7);
  private balls = 0;
  private stopIndex = 0;
  private scale = 1;
  private hold = 0;
  private gateOn = false;
  private gateIsOpen = false;
  private gateTimer = 0;
  private lastHint = -HINT_GAP;
  private clock = 0;
  private entryWaiter: (() => void) | null = null;
  private attackerHit: (() => void) | null = null;

  constructor(
    private readonly stage: Stage,
    private readonly audio: AudioKit,
    private readonly onActiveChange: (active: boolean) => void,
  ) {
    this.hud.visible = false;
    stage.overlay.addChild(this.hud);

    RUSH_STOPS.forEach((name, i) => {
      const label = makeText(name, 22, 0xffffff, 0x2a0050, 5);
      label.position.set(this.stopX(i), 54);
      this.routeLabels.push(label);
    });
    this.remainingLabel.position.set(190, STRIP_Y);
    this.roundText.position.set(235, STRIP_Y);
    this.ballsText.position.set(500, STRIP_Y);
    const gongFace = new Sprite(stage.art.gong);
    gongFace.anchor.set(0.5);
    gongFace.width = GAUGE.target * 2 + 26;
    gongFace.height = GAUGE.target * 2 + 26;
    this.gauge.addChild(gongFace, this.gaugeRing);
    this.gauge.position.set(GAUGE.x, GAUGE.y);
    this.gauge.visible = false;
    this.hud.addChild(this.route, ...this.routeLabels, this.remainingLabel, this.roundText, this.ballsText, this.gauge);

    stage.board.onGate = () => this.gateEntry();
    stage.board.onAttacker = () => this.attackerHit?.();

    const previous = stage.onUpdate;
    stage.onUpdate = (delta) => {
      previous?.(delta);
      this.clock += delta;
      this.updateGauge(delta);
      this.updateGate(delta);
    };
  }

  private stopX(i: number) {
    return 70 + i * ((WIDTH - 140) / (RUSH_STOPS.length - 1));
  }

  private setRouteVisible(visible: boolean) {
    this.route.visible = visible;
    this.routeLabels.forEach((label) => {
      label.visible = visible;
    });
  }

  private drawRoute() {
    const { route } = this;
    route.clear();
    route.roundRect(30, 10, WIDTH - 60, 66, 14).fill({ color: 0x1c0a2a, alpha: 0.82 });
    route.rect(this.stopX(0), 18, this.stopX(RUSH_STOPS.length - 1) - this.stopX(0), 8).fill(0x5a3a70);
    route.rect(this.stopX(0), 18, this.stopX(this.stopIndex) - this.stopX(0), 8).fill(0xffc21a);
    RUSH_STOPS.forEach((_, i) => {
      route.circle(this.stopX(i), 22, 9).fill(i <= this.stopIndex ? 0xffc21a : 0x5a3a70).stroke({ width: 3, color: 0xffffff });
    });
  }

  private clearRemaining() {
    this.remaining?.killMotion();
    this.remaining?.destroy({ children: true });
    this.remaining = null;
    this.remainingLabel.visible = false;
  }

  private setRemaining(count: number) {
    this.clearRemaining();
    this.remainingLabel.visible = true;
    this.roundText.visible = false;
    this.remaining = new BigText(String(count), count <= 2 ? 'red' : 'gold', { size: 72 });
    this.remaining.position.set(262, STRIP_Y);
    this.hud.addChild(this.remaining);
    this.remaining.slam(0.14);
  }

  private setBalls(value: number) {
    this.balls = value;
    this.ballsText.text = `出珠 ${value.toLocaleString()}`;
  }

  private setHold(count: number) {
    this.hold = count;
    this.stage.setHoldLamps(count);
  }

  private updateGauge(delta: number) {
    if (!this.gaugeOpen) return;
    this.gaugeTime += delta;
    const t = Math.min(1, this.gaugeTime / this.gaugeDuration);
    const radius = GAUGE.target * (2.3 - 1.3 * t);
    this.gaugeRing.clear().circle(0, 0, radius).stroke({ width: 8, color: t > 0.72 ? 0x7dff5e : 0xffffff });
    if (t >= 1) {
      this.gaugeOpen = false;
      this.gaugeRing.clear();
    }
  }

  // 玩家敲鑼：外圈縮到鑼的邊緣時按下最好。
  press() {
    if (!this.active || !this.gaugeOpen) return;
    this.gaugeOpen = false;
    this.gaugeRing.clear();
    const miss = Math.abs(1 - this.gaugeTime / this.gaugeDuration);
    const quality = miss <= PERFECT_WINDOW ? 'perfect' : miss <= GOOD_WINDOW ? 'good' : 'late';
    this.audio.gongHit(quality);
    const bonus = Math.round(GONG_BONUS[quality] * this.scale);
    this.setBalls(this.balls + bonus);

    gsap.fromTo(this.gauge.scale, { x: 1.3, y: 1.3 }, { x: 1, y: 1, duration: 0.25, ease: 'back.out(3)' });
    const text = { perfect: '完美！', good: '不錯！', late: '慢了' }[quality];
    const color = { perfect: 0xffe94a, good: 0xffffff, late: 0xa8a0b8 }[quality];
    const label = makeText(bonus ? `${text} +${bonus}` : text, 36, color, 0x3a0606, 7);
    label.position.set(GAUGE.x - 60, GAUGE.y - 104);
    this.hud.addChild(label);
    gsap.to(label, { y: label.y - 60, alpha: 0, duration: 0.8, onComplete: () => label.destroy() });

    if (quality === 'perfect') {
      this.stage.sparks(GAUGE.x, GAUGE.y, 34, [0xffd257, 0xffffff], 300);
      this.stage.shake(7, 0.15);
    }
  }

  private async gongChance() {
    this.gauge.visible = true;
    this.onFireText('敲鑼！', '外圈縮到鑼邊時按');
    this.gaugeTime = 0;
    this.gaugeDuration = GONG_SECONDS;
    this.gaugeOpen = true;
    await wait(GONG_SECONDS + 0.35);
    this.gaugeOpen = false;
    this.gaugeRing.clear();
    this.gauge.visible = false;
    this.onFireText(FIRE_TEXT.label, FIRE_TEXT.hint);
  }

  // 打太低時提醒，不會一直跳。
  hintRight() {
    if (this.clock - this.lastHint < HINT_GAP) return;
    this.lastHint = this.clock;
    this.stage.bigText('力道拉高，往右打！', 'red', { size: 58, y: 620, hold: 0.9, maxWidth: 620 });
  }

  private updateGate(delta: number) {
    if (!this.gateOn) return;
    this.gateTimer -= delta;
    if (this.gateTimer > 0) return;
    this.gateIsOpen = !this.gateIsOpen;
    this.gateTimer = this.gateIsOpen ? GATE_OPEN : GATE_CLOSED;
    this.stage.board.setGate(this.gateIsOpen);
    if (this.gateIsOpen) this.audio.reelTick(1.3);
  }

  private setGateRunning(on: boolean) {
    this.gateOn = on;
    this.gateIsOpen = false;
    this.gateTimer = 0;
    this.stage.board.setGate(false);
  }

  private gateEntry() {
    if (!this.gateOn) return;
    this.audio.pocketIn();
    this.stage.sparks(RUSH_FIELD.gate.x, RUSH_FIELD.gate.y, 14, [0x7dff5e, 0xffffff], 180);
    if (this.hold >= MAX_HOLD) return;
    this.setHold(this.hold + 1);
    const waiter = this.entryWaiter;
    this.entryWaiter = null;
    waiter?.();
  }

  private nextEntry() {
    if (this.hold > 0) return Promise.resolve();
    return new Promise<void>((resolve) => {
      this.entryWaiter = resolve;
    });
  }

  private popPayout(amount: number) {
    const { attacker } = RUSH_FIELD;
    const label = makeText(`+${amount}`, 30, 0xffe94a, 0x3a0606, 6);
    label.position.set(attacker.x, attacker.y - 60);
    this.hud.addChild(label);
    gsap.to(label, { y: label.y - 50, alpha: 0, duration: 0.6, onComplete: () => label.destroy() });
  }

  // 一回合：大開口打開，進滿 10 顆或時間到就關上。
  private playRound(round: number, start: number, total: number, enteredBefore: number) {
    const { stage, audio } = this;
    const { attacker } = RUSH_FIELD;
    return new Promise<number>((resolve) => {
      let entered = 0;
      const show = () => {
        this.roundText.text = `第 ${round}/${ATTACKER.rounds} 回合　${entered}/${ATTACKER.ballsPerRound}`;
      };
      const finish = () => {
        timer.kill();
        this.attackerHit = null;
        stage.board.setDoor(false);
        resolve(entered);
      };
      const timer = gsap.delayedCall(ATTACKER.secondsPerRound, finish);
      this.attackerHit = () => {
        const before = attackerPayout(total, enteredBefore + entered);
        entered += 1;
        const after = attackerPayout(total, enteredBefore + entered);
        this.setBalls(start + after);
        this.popPayout(after - before);
        audio.ballPing();
        stage.sparks(attacker.x, attacker.y - 10, 18, [0xffd257, 0xffffff], 240);
        stage.ballRain(3);
        show();
        if (entered >= ATTACKER.ballsPerRound) finish();
      };
      show();
      stage.board.setDoor(true);
      audio.reachSting();
      stage.flash(0xffe27a, 0.18, 0.2);
    });
  }

  // 大開口的 5 回合。
  private async attackerRounds(total: number) {
    this.clearRemaining();
    this.roundText.visible = true;
    this.canShoot = true;
    this.onFireText(FIRE_TEXT.label, FIRE_TEXT.hint);
    const start = this.balls;
    let entered = 0;
    for (let round = 1; round <= ATTACKER.rounds; round += 1) {
      entered += await this.playRound(round, start, total, entered);
      if (round < ATTACKER.rounds) await wait(0.45);
    }
    this.roundText.visible = false;
    this.stage.shake(10, 0.2);
    await wait(0.35);
  }

  // 大獎：釘盤換成右打區，不再是看數字跳。
  private async enterField() {
    const { stage } = this;
    this.active = true;
    this.onActiveChange(true);
    this.stopIndex = 0;
    this.setHold(0);
    stage.clearBanners();
    stage.burst.hide(0.2);
    stage.board.setField(true);
    stage.temple.visible = false;
    stage.jiaoLayer.visible = false;
    stage.machineFull(0.3, FIELD_MACHINE.scale, FIELD_MACHINE.y);
    stage.title.visible = false;
    stage.agong.root.visible = false;
    stage.runner.visible = true;
    this.hud.visible = true;
    this.setRouteVisible(false);
    this.clearRemaining();
    this.setBalls(0);
    stage.flash(0xffffff, 0.4, 0.3);
    stage.bigText('往右打 →', 'fire', { size: 110, y: 620, hold: 1.1, maxWidth: 640 });
    this.onFireText(FIRE_TEXT.label, FIRE_TEXT.hint);
    await wait(0.9);
  }

  private async enterRush() {
    const { stage, audio } = this;
    this.canShoot = false;
    this.onEnterRush();
    audio.music(null);
    audio.fanfare();
    stage.burst.show('parade', { spin: 3, bolts: 8 });
    stage.flash(0xffffff, 0.75, 0.45);
    stage.shake(26, 0.7);
    stage.lightMode = 'jackpot';
    stage.clearBanners();
    stage.bigText('遶境', 'gold', { size: 220, vertical: true, x: 150, y: HEIGHT * 0.42, hold: 1.25, maxHeight: 620 });
    stage.bigText('RUSH', 'fire', { size: 150, x: 480, y: HEIGHT * 0.42, hold: 1.25, maxWidth: 420 });
    await wait(0.5);
    audio.firecrackers(16);
    audio.music('rush', 0);
    await wait(0.85);
    stage.street.visible = true;
    stage.streetSpeed = 360;
    stage.burst.hide(0.2);
    this.setRouteVisible(true);
    this.drawRoute();
    this.setRemaining(RUSH_SPINS);
    stage.flash(0xffffff, 0.4, 0.3);
    await wait(0.45);
    this.canShoot = true;
  }

  private async spin(hit: boolean, spinIndex: number) {
    const { stage, audio } = this;
    const remaining = RUSH_SPINS - spinIndex;
    this.setRemaining(remaining);
    const last = remaining === 0;
    const reels = rushSpinReels(hit);
    audio.lever();
    stage.reels.left.spin(30);
    stage.reels.center.spin(30);
    stage.reels.right.spin(30);

    if (last) {
      stage.bigText('最後一次', 'red', { size: 96, y: 620, hold: 0.8 });
      audio.heartbeat();
    }

    await wait(0.45);
    await stage.reels.left.stopAt(reels.left, { cells: 2, duration: 0.14 });
    audio.reelStop();
    await stage.reels.right.stopAt(reels.right, { cells: 2, duration: 0.14 });
    audio.reelStop();
    // 中獎或最後一次時，中間那輪多拖一下。
    const slow = hit || last;
    await wait(slow ? 0.35 : 0.08);
    await stage.reels.center.stopAt(reels.center, slow ? { cells: 5, duration: 1.05, ease: 'power2.out' } : { cells: 2, duration: 0.16 });
    audio.reelStop();
    await wait(slow ? 0.1 : 0.08);
  }

  private async chainWin(hitNumber: number) {
    const { stage, audio } = this;
    this.canShoot = false;
    this.setGateRunning(false);
    this.onBossHit('chain');
    audio.fanfare();
    audio.firecrackers(14);
    stage.burst.show('fire', { spin: 3, bolts: 9 });
    stage.flash(0xffffff, 0.65, 0.4);
    stage.shake(26, 0.6);
    stage.ring(0xffd257);
    stage.streetSpeed = 1100;
    stage.bigText('連莊', 'fire', { size: 240, vertical: true, y: HEIGHT * 0.5, hold: 0.95, maxHeight: 660 });
    stage.bigText(`×${hitNumber + 1}`, 'rainbow', { size: 130, x: 572, y: HEIGHT * 0.5, hold: 0.95, maxWidth: 270 });
    const stopParty = this.rainBalls();
    await wait(1.2);
    stopParty();

    this.stopIndex += 1;
    audio.intensity(this.stopIndex);
    this.drawRoute();
    stage.burst.hide(0.2);
    stage.streetSpeed = 360 + this.stopIndex * 70;
    if (this.stopIndex < RUSH_STOPS.length - 1) {
      audio.reachSting();
      stage.bigText(`抵達${RUSH_STOPS[this.stopIndex]}`, 'gold', { size: 88, y: 620, hold: 0.85 });
      await this.gongChance();
      await this.attackerRounds(Math.round(CONFIG.ballsPerRound * this.scale));
    }
  }

  private rainBalls() {
    const { stage, audio } = this;
    let running = true;
    const loop = () => {
      if (!running) return;
      stage.ballRain(9);
      audio.ballPing();
      gsap.delayedCall(0.08, loop);
    };
    loop();
    return () => {
      running = false;
    };
  }

  // 抵達廟口：大開口全開，最後一波最多珠。
  private async finale() {
    const { stage, audio } = this;
    this.canShoot = false;
    this.onBossHit('final');
    const gate = makeTempleGate(stage.art, 760);
    gate.position.set(WIDTH + 400, 860);
    stage.street.addChild(gate);
    audio.fanfare();
    await new Promise<void>((resolve) => {
      gsap.to(gate.position, { x: WIDTH / 2, duration: 1.1, ease: 'power2.out', onComplete: resolve });
    });
    stage.streetSpeed = 0;
    audio.rainbowSting();
    audio.firecrackers(30);
    stage.burst.show('rainbow', { spin: 2.4, bolts: 12, duration: 0.2 });
    stage.flash(0xffffff, 0.8, 0.6);
    stage.shake(38, 1);
    stage.ring(0xffffff);
    stage.sparks(WIDTH / 2, HEIGHT * 0.4, 170, [0xff2fa0, 0x21f0ff, 0xffd257, 0xffffff], 760);
    stage.paperRain(70);
    stage.bigText('遶境成功', 'rainbow', { size: 190, vertical: true, y: HEIGHT * 0.5, hold: 2.3, maxHeight: 860 });
    const stopParty = this.rainBalls();
    await wait(2.4);
    stopParty();
    stage.burst.hide(0.2);
    stage.bigText('廟口大開放', 'gold', { size: 96, y: 620, hold: 0.9, maxWidth: 620 });
    await this.gongChance();
    // 最後一站的連莊和廟口的大獎一起開。
    await this.attackerRounds(Math.round((CONFIG.ballsPerRound + CONFIG.ballsFinal) * this.scale));
    gate.destroy();
  }

  private async exit(reachedFinal: boolean) {
    const { stage, audio } = this;
    this.canShoot = false;
    this.setGateRunning(false);
    this.entryWaiter = null;
    if (!reachedFinal) {
      audio.music(null);
      audio.deflate();
      stage.streetSpeed = 90;
      stage.burst.show('dark', { spin: 0.3, duration: 0.3 });
    }
    audio.music(reachedFinal ? 'jackpot' : null);
    stage.bigText(reachedFinal ? '總計' : '遶境結束', reachedFinal ? 'gold' : 'silver', { size: 110, y: 420, hold: 1.6 });
    stage.bigText(`出珠 ${this.balls.toLocaleString()}`, 'gold', { size: 86, y: 560, hold: 1.6, outline: 0.55 });
    await wait(1.9);

    this.clearRemaining();
    this.setHold(0);
    this.hud.visible = false;
    stage.board.setField(false);
    stage.street.visible = false;
    stage.runner.visible = false;
    stage.streetSpeed = 0;
    stage.agong.root.visible = true;
    stage.flash(0xffffff, 0.35, 0.3);
    this.active = false;
    this.onActiveChange(false);
  }

  async play(plan: RushPlan, scale = 1): Promise<RushResult> {
    this.scale = scale;
    await this.enterField();
    await this.attackerRounds(Math.round(CONFIG.ballsPerRound * scale));
    await this.enterRush();

    let hits = 0;
    let ended = false;
    while (!ended) {
      const hitSpin = plan.hitSpins[hits];
      this.setRemaining(RUSH_SPINS);
      this.setGateRunning(true);
      for (let spinIndex = 1; spinIndex <= RUSH_SPINS; spinIndex += 1) {
        await this.nextEntry();
        this.setHold(this.hold - 1);
        const hit = spinIndex === hitSpin;
        await this.spin(hit, spinIndex);
        if (hit) break;
      }
      if (hitSpin === undefined) {
        ended = true;
      } else {
        await this.chainWin(hits + 1);
        hits += 1;
        if (hits === RUSH_STOPS.length - 1) ended = true;
      }
    }

    if (plan.reachedFinal) await this.finale();
    await this.exit(plan.reachedFinal);
    return { totalBalls: this.balls, hits, reachedFinal: plan.reachedFinal };
  }
}
