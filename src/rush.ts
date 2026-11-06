// 遶境 RUSH：大獎後的獨立模式，有自己的場景、音樂和操作。
// 玩家敲鑼只影響額外出珠，連莊與否在進入模式時就決定好了。
import { Container, Graphics, Sprite } from 'pixi.js';
import gsap from 'gsap';
import { CONFIG, RUSH_SPINS, RUSH_STOPS, rushSpinReels, type RushPlan } from './outcome';
import { HEIGHT, WIDTH, wait, type Stage } from './stage';
import { BigText } from './text';
import { makeTempleGate, makeText } from './art';
import type { AudioKit } from './audio';
import type { BossHit } from './boss';

export interface RushResult {
  totalBalls: number;
  hits: number;
  reachedFinal: boolean;
}

const GONG_BONUS = { perfect: 100, good: 40, late: 0 } as const;
const PERFECT_WINDOW = 0.13;
const GOOD_WINDOW = 0.3;
const GAUGE = { x: 590, y: 985, target: 58 };

export class RushMode {
  active = false;
  onBossHit: (hit: BossHit) => void = () => undefined;

  private readonly hud = new Container();
  private readonly route = new Graphics();
  private readonly routeLabels: ReturnType<typeof makeText>[] = [];
  private readonly gauge = new Container();
  private readonly gaugeRing = new Graphics();
  private gaugeTime = 0;
  private gaugeDuration = 1;
  private gaugeOpen = false;
  private remaining: BigText | null = null;
  private ballsText = makeText('', 40, 0xffe98c, 0x3a0606, 7);
  private balls = 0;
  private stopIndex = 0;
  private scale = 1;

  constructor(
    private readonly stage: Stage,
    private readonly audio: AudioKit,
    private readonly onActiveChange: (active: boolean) => void,
  ) {
    this.hud.visible = false;
    stage.overlay.addChild(this.hud);

    RUSH_STOPS.forEach((name, i) => {
      const label = makeText(name, 22, 0xffffff, 0x2a0050, 5);
      label.position.set(this.stopX(i), 44);
      this.routeLabels.push(label);
    });
    this.ballsText.position.set(WIDTH - 130, 240);
    const gongFace = new Sprite(stage.art.gong);
    gongFace.anchor.set(0.5);
    gongFace.width = GAUGE.target * 2 + 26;
    gongFace.height = GAUGE.target * 2 + 26;
    this.gauge.addChild(gongFace, this.gaugeRing);
    this.gauge.position.set(GAUGE.x, GAUGE.y);
    this.hud.addChild(this.route, ...this.routeLabels, this.ballsText, this.gauge);

    const previous = stage.onUpdate;
    stage.onUpdate = (delta) => {
      previous?.(delta);
      this.updateGauge(delta);
    };
  }

  private stopX(i: number) {
    return 70 + i * ((WIDTH - 140) / (RUSH_STOPS.length - 1));
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

  private setRemaining(count: number) {
    this.remaining?.killMotion();
    this.remaining?.destroy({ children: true });
    const look = count <= 2 ? 'red' : 'gold';
    this.remaining = new BigText(String(count), look, { size: 150 });
    this.remaining.position.set(112, 216);
    this.hud.addChild(this.remaining);
    this.remaining.slam(0.14);
  }

  private setBalls(value: number) {
    this.balls = value;
    this.ballsText.text = `出珠 ${value.toLocaleString()}`;
    if (this.ballsText.width > 260) this.ballsText.scale.set(260 / (this.ballsText.width / this.ballsText.scale.x));
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
    if (quality !== 'late') {
      this.stage.runner.y = 988;
      gsap.to(this.stage.runner, { y: 1000, duration: 0.2 });
    }
  }

  private openGauge(duration: number) {
    this.gaugeTime = 0;
    this.gaugeDuration = duration;
    this.gaugeOpen = true;
  }

  private async enter(startBalls: number) {
    const { stage, audio } = this;
    this.active = true;
    this.onActiveChange(true);
    this.stopIndex = 0;
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

    stage.agong.root.visible = false;
    stage.street.visible = true;
    stage.runner.visible = true;
    stage.streetSpeed = 360;
    stage.burst.hide(0.2);
    stage.machineMini(0.3, 190, 0.36);
    stage.setAmbient(0x000000, 0, 0.1);
    this.hud.visible = true;
    this.setBalls(startBalls);
    this.drawRoute();
    this.setRemaining(RUSH_SPINS);
    stage.flash(0xffffff, 0.4, 0.3);
    await wait(0.55);
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
    this.openGauge(1);

    if (last) {
      stage.bigText('最後一次', 'red', { size: 96, y: 480, hold: 0.8 });
      audio.heartbeat();
    }

    await wait(0.5);
    await stage.reels.left.stopAt(reels.left, { cells: 2, duration: 0.14 });
    audio.reelStop();
    await stage.reels.right.stopAt(reels.right, { cells: 2, duration: 0.14 });
    audio.reelStop();
    // 中獎或最後一次時，中間那輪多拖一下。
    const slow = hit || last;
    await wait(slow ? 0.35 : 0.1);
    await stage.reels.center.stopAt(reels.center, slow ? { cells: 5, duration: 1.05, ease: 'power2.out' } : { cells: 2, duration: 0.16 });
    audio.reelStop();
    await wait(slow ? 0.1 : 0.14);
  }

  private async chainWin(hitNumber: number) {
    const { stage, audio } = this;
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
    await this.countUp(Math.round(CONFIG.ballsPerRound * this.scale), 1.5);
    stopParty();

    this.stopIndex += 1;
    audio.intensity(this.stopIndex);
    this.drawRoute();
    stage.burst.hide(0.2);
    stage.streetSpeed = 360 + this.stopIndex * 70;
    await wait(0.2);
    if (this.stopIndex < RUSH_STOPS.length - 1) {
      audio.reachSting();
      stage.bigText(`抵達${RUSH_STOPS[this.stopIndex]}`, 'gold', { size: 88, y: 480, hold: 0.85 });
      await wait(1.05);
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

  private countUp(amount: number, seconds: number) {
    const start = this.balls;
    return new Promise<void>((resolve) => {
      const counter = { value: 0 };
      gsap.to(counter, {
        value: amount,
        duration: seconds,
        ease: 'none',
        onUpdate: () => this.setBalls(start + Math.floor(counter.value)),
        onComplete: () => {
          this.setBalls(start + amount);
          resolve();
        },
      });
    });
  }

  private async finale() {
    const { stage, audio } = this;
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
    await this.countUp(Math.round(CONFIG.ballsFinal * this.scale), 2.4);
    stopParty();
    gate.destroy();
  }

  private async exit(reachedFinal: boolean) {
    const { stage, audio } = this;
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

    this.hud.visible = false;
    stage.street.visible = false;
    stage.runner.visible = false;
    stage.streetSpeed = 0;
    stage.agong.root.visible = true;
    stage.flash(0xffffff, 0.35, 0.3);
    this.active = false;
    this.onActiveChange(false);
  }

  async play(plan: RushPlan, startBalls: number, scale = 1): Promise<RushResult> {
    this.scale = scale;
    await this.enter(startBalls);

    let hits = 0;
    let ended = false;
    while (!ended) {
      const hitSpin = plan.hitSpins[hits];
      for (let spinIndex = 1; spinIndex <= RUSH_SPINS; spinIndex += 1) {
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
        else this.setRemaining(RUSH_SPINS);
      }
    }

    if (plan.reachedFinal) await this.finale();
    await this.exit(plan.reachedFinal);
    return { totalBalls: this.balls, hits, reachedFinal: plan.reachedFinal };
  }
}
