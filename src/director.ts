// 導演：拿到已決定好的結果，排出整段演出的節奏。
// 想調「什麼時候緊張、停多久」都在這裡。
import gsap from 'gsap';
import { CONFIG, type JiaoResult, type Outcome, type Tier } from './outcome';
import { HEIGHT, IDLE_AGONG, WIDTH, wait, type LightMode, type Stage } from './stage';
import type { AudioKit } from './audio';
import type { BurstLook } from './fx';
import type { TextLook } from './text';
import { RushMode, type RushResult } from './rush';

interface StepCut {
  text: string;
  look: TextLook;
  burst: BurstLook;
  light: LightMode;
  lantern: number;
}

// 預告分段升級：越高段字越大、越誇張。藍最低，金最高；彩虹留給三聖筊。
const STEP_CUTS: StepCut[] = [
  { text: '機會', look: 'blue', burst: 'blue', light: 'blue', lantern: 0x3d86e0 },
  { text: '好運', look: 'green', burst: 'green', light: 'green', lantern: 0x2fe06a },
  { text: '激熱', look: 'red', burst: 'red', light: 'red', lantern: 0xff2b2b },
  { text: '超激熱', look: 'fire', burst: 'fire', light: 'gold', lantern: 0xffd257 },
];

const STEPS_BY_TIER: Record<Tier, number> = { blue: 1, red: 3, gold: 4 };

const JIAO_INFO: Record<JiaoResult, { text: string; faces: ['flat' | 'round', 'flat' | 'round'] }> = {
  sheng: { text: '聖筊', faces: ['flat', 'round'] },
  xiao: { text: '笑筊', faces: ['flat', 'flat'] },
  yin: { text: '陰筊', faces: ['round', 'round'] },
};

const FESTIVE = [0xff2fa0, 0x21f0ff, 0xffd257, 0xff4d4d, 0xffffff];

export interface RoundStats {
  win: number;
  balls: number;
  chain: number;
  reachedFinal: boolean;
}

export class Director {
  readonly rush: RushMode;
  // 攤位等級帶來的出珠倍率。
  payoutScale = 1;

  constructor(
    private readonly stage: Stage,
    private readonly audio: AudioKit,
    private readonly onStats: (stats: RoundStats) => void,
    onRushChange: (active: boolean) => void,
    // 全螢幕演出時暫停釘盤。
    private readonly onTakeover: (active: boolean) => void,
  ) {
    this.rush = new RushMode(stage, audio, onRushChange);
  }

  async run(outcome: Outcome) {
    const { stage, audio } = this;
    stage.clearBanners();
    this.resetLights();
    audio.music('idle');
    stage.lightMode = 'spin';
    audio.lever();
    stage.reels.left.spin();
    stage.reels.center.spin();
    stage.reels.right.spin();

    await wait(0.9);
    await this.stopReel('left', outcome.reels.left);
    await wait(0.18);
    await this.stopReel('right', outcome.reels.right);

    if (!outcome.reach) {
      await wait(0.22);
      await this.stopReel('center', outcome.reels.center);
      stage.lightMode = 'idle';
      return;
    }

    await this.reachIntro();
    await this.stepUp(outcome.tier ?? 'blue');
    const sacred = await this.throwAllJiao(outcome);
    await this.resolveCenter(outcome, sacred);

    if (outcome.hit) await this.jackpot(outcome);
    else await this.loss();
  }

  private async stopReel(name: 'left' | 'right' | 'center', symbol: number) {
    await this.stage.reels[name].stopAt(symbol);
    this.audio.reelStop();
    this.stage.shake(5, 0.12);
  }

  private resetLights() {
    const { stage } = this;
    stage.setAmbient(0x000000, 0, 0.2);
    stage.setLanterns(0xff2a20);
    stage.pulseCenter(0xffffff, false);
    stage.agong.idle();
    stage.burst.hide();
    stage.machineFull();
    stage.title.visible = true;
    stage.temple.visible = false;
    stage.agong.moveTo(IDLE_AGONG.x, IDLE_AGONG.y, IDLE_AGONG.height, 0.3);
  }

  // 聽牌：轉盤縮到上方，阿公放大站到舞台中央。
  private async reachIntro() {
    const { stage, audio } = this;
    this.onTakeover(true);
    stage.reels.center.slowTo(9, 0.5);
    audio.music('reach', 0);
    audio.reachSting();
    stage.flash(0xffffff, 0.6, 0.3);
    stage.shake(14, 0.4);
    stage.ring(0xffffff);
    stage.burst.show('dark', { spin: 0.9, bolts: 0 });
    stage.machineMini();
    stage.title.visible = false;
    stage.agong.nervous();
    stage.agong.say('拜託拜託！', 1.5);
    stage.agong.moveTo(WIDTH / 2, 1085, 600, 0.35);
    stage.bigText('聽牌', 'gold', { size: 200, y: 400, hold: 0.75 });
    await wait(1.05);
  }

  // 分段升級的全螢幕預告。
  private async stepUp(tier: Tier) {
    const { stage, audio } = this;
    const count = STEPS_BY_TIER[tier];
    // 阿公讓到右邊，直書大字放左邊，才不會蓋到臉。
    stage.agong.moveTo(470, 1085, 640, 0.25);
    for (let i = 0; i < count; i += 1) {
      const cut = STEP_CUTS[i];
      const top = i === count - 1;
      const size = 150 + i * 42;
      audio.stepSting(i);
      stage.lightMode = cut.light;
      stage.setLanterns(cut.lantern);
      stage.burst.show(cut.burst, { spin: 1 + i * 0.7, bolts: i >= 2 ? 3 + i * 3 : 0 });
      stage.flash(0xffffff, 0.35 + i * 0.1, 0.25);
      stage.shake(8 + i * 8, 0.3 + i * 0.1);
      stage.ring(0xffffff, WIDTH / 2, HEIGHT * 0.42);
      if (i === 3) stage.paperRain(60);
      stage.bigText(cut.text, cut.look, {
        size,
        vertical: true,
        x: 158,
        y: HEIGHT * 0.42,
        hold: top ? 1.1 : 0.42,
        maxHeight: 640,
      });
      await wait(top ? 1.4 : 0.66);
    }
    stage.pulseCenter(STEP_CUTS[count - 1].look === 'blue' ? 0x65b6ff : 0xffd257, true);
    // 預告結束，舞台換到廟口準備擲筊。
    stage.temple.visible = true;
    stage.burst.hide(0.25);
    stage.agong.moveTo(190, 1085, 640, 0.3);
  }

  private async throwAllJiao(outcome: Outcome) {
    const { stage, audio } = this;
    let sacred = 0;
    stage.jiaoLayer.visible = true;
    stage.reels.center.slowTo(5, 0.8);
    for (const result of outcome.jiao) {
      // 第三次擲筊前先停頓，心跳聲會把緊張感拉滿。
      if (sacred === 2) {
        audio.music(null);
        stage.setAmbient(0x000000, 0.6, 0.35);
        stage.bigText('第三次', 'silver', { size: 130, y: 420, hold: 1.2 });
        audio.heartbeat();
        await wait(0.8);
        audio.heartbeat();
        await wait(0.8);
      }
      await this.throwJiao(result, sacred === 2 ? 1.9 : 1.1);
      stage.agong.pray();
      if (sacred === 2) stage.setAmbient(0x000000, 0, 0.1);
      if (result !== 'sheng') {
        audio.jiaoBad();
        stage.bigText(JIAO_INFO[result].text, 'silver', { size: 150, y: 470, hold: 0.7 });
        await wait(1.05);
        break;
      }
      sacred += 1;
      audio.jiaoGood(sacred);
      audio.intensity(sacred);
      stage.shake(10 + sacred * 7, 0.35);
      stage.sparks(510, 860, 40 + sacred * 28, [0xffd257, 0xffffff]);
      stage.ring(0xffd257, 510, 860, 480);
      if (sacred === 3) {
        audio.rainbowSting();
        audio.firecrackers(10);
        stage.burst.show('rainbow', { spin: 3, bolts: 14 });
        stage.flash(0xffffff, 0.75, 0.55);
        stage.shake(34, 0.9);
        stage.bigText('三聖筊', 'rainbow', { size: 210, vertical: true, y: HEIGHT * 0.45, hold: 1.5, maxHeight: 800 });
        stage.agong.say('穩啦！！', 1.6);
        await wait(1.9);
      } else {
        stage.bigText(`聖筊×${sacred}`, 'gold', { size: 120, y: 470, hold: 0.7 });
        await wait(1.05);
      }
    }
    stage.jiaoLayer.visible = false;
    return sacred;
  }

  private throwJiao(result: JiaoResult, flightTime: number) {
    const { stage, audio } = this;
    const { faces } = JIAO_INFO[result];
    const blocks = [stage.jiaoLeft, stage.jiaoRight];
    stage.agong.throwUp();
    return new Promise<void>((resolve) => {
      let landed = 0;
      blocks.forEach((block, i) => {
        const { root } = block;
        const restX = 430 + i * 160;
        const restY = 880 + (i ? 8 : -6);
        root.position.set(260, 760);
        root.rotation = 0;
        block.setFace('round');
        const flip = gsap.to(
          {},
          {
            duration: flightTime,
            onUpdate() {
              block.setFace(Math.floor(this.progress() * 14 + i) % 2 ? 'flat' : 'round');
            },
          },
        );
        gsap.to(root.position, { x: restX, duration: flightTime, ease: 'none' });
        gsap
          .timeline()
          .to(root.position, { y: 480, duration: flightTime * 0.5, ease: 'power2.out' })
          .to(root.position, { y: restY, duration: flightTime * 0.5, ease: 'power2.in' });
        gsap.to(root, {
          rotation: (i ? -1 : 1) * Math.PI * 6,
          duration: flightTime,
          ease: 'none',
          onComplete: () => {
            flip.kill();
            block.setFace(faces[i]);
            root.rotation = i ? -0.08 : 0.08;
            landed += 1;
            if (landed === 2) {
              audio.jiaoLand();
              resolve();
            }
          },
        });
      });
    });
  }

  // 揭曉：轉盤回到舞台中央並放大，只留中間一輪。
  private async resolveCenter(outcome: Outcome, sacred: number) {
    const { stage, audio } = this;
    const center = stage.reels.center;
    const stopSymbol = outcome.comebackFrom ?? outcome.reels.center;
    audio.music(null);
    stage.machineFull(0.3, 1.1, 420);
    stage.burst.show(sacred >= 3 ? 'rainbow' : 'dark', { spin: sacred >= 3 ? 2 : 0.3 });
    stage.agong.moveTo(120, 1085, 340, 0.3);
    audio.heartbeat();
    await center.stopAt(stopSymbol, { cells: 7 + sacred, duration: 3.4, ease: 'power2.out' });
    stage.pulseCenter(0xffffff, false);
    audio.reelStop();

    if (outcome.comebackFrom === null) return;

    // 復活：先讓玩家以為沒中，再一口氣翻盤。
    audio.deflate();
    stage.agong.sad();
    stage.agong.say('哎唷……', 1.2);
    stage.lightMode = 'dark';
    stage.burst.show('dark', { spin: 0 });
    await wait(1.7);
    audio.revive();
    stage.burst.show('fire', { spin: 3, bolts: 12 });
    stage.flash(0xffffff, 0.8, 0.45);
    stage.shake(30, 0.6);
    stage.ring(0xffffff);
    stage.bigText('復活', 'fire', { size: 220, y: 880, hold: 0.85 });
    await center.stopAt(outcome.reels.center, { cells: 1, duration: 0.55, ease: 'back.out(2)' });
    await wait(0.6);
  }

  private async jackpot(outcome: Outcome) {
    const { stage, audio } = this;
    const { agong } = stage;
    audio.music(null);
    audio.fanfare();
    audio.firecrackers(20);
    stage.lightMode = 'jackpot';
    stage.setLanterns(0xffd257);
    stage.burst.show('gold', { spin: 2.4, bolts: 10 });
    stage.flash(0xffffff, 0.8, 0.6);
    stage.shake(36, 0.9);
    stage.ring(0xffffff);
    stage.machineMini(0.3);
    agong.dance();
    agong.moveTo(WIDTH / 2, 1125, 940, 0.28);
    agong.say('著矣！！', 1.8);
    stage.bigText('大獎', 'fire', { size: 250, y: 860, hold: 1.5, maxWidth: 680 });
    stage.sparks(WIDTH / 2, HEIGHT * 0.42, 150, FESTIVE, 700);
    await wait(1.5);

    audio.music('jackpot');
    const stopParty = this.startParty();
    const round = Math.round(CONFIG.ballsPerRound * this.payoutScale);
    const counter = stage.bigText('出珠 0', 'gold', { size: 96, y: 900, hold: null, outline: 0.8 });
    await this.countBalls(0, round, 2.6, (value) => this.replaceCounter(counter, value));
    this.dropCounter();
    stopParty();

    const rush: RushResult = await this.rush.play(outcome.rush ?? { hitSpins: [], reachedFinal: false }, round, this.payoutScale);

    this.onStats({ win: 1, balls: rush.totalBalls, chain: rush.hits + 1, reachedFinal: rush.reachedFinal });
    this.resetLights();
    this.onTakeover(false);
    audio.music('idle');
    stage.lightMode = 'idle';
  }

  private currentCounter: ReturnType<Stage['bigText']> | null = null;

  private replaceCounter(first: ReturnType<Stage['bigText']>, value: number) {
    const { stage } = this;
    const previous = this.currentCounter ?? first;
    previous.killMotion();
    previous.destroy({ children: true });
    const label = stage.bigText(`出珠 ${value.toLocaleString()}`, 'gold', { size: 96, y: 900, hold: null, outline: 0.8 });
    label.killMotion();
    label.alpha = 1;
    label.scale.set(label.fitScale);
    this.currentCounter = label;
  }

  private dropCounter() {
    if (this.currentCounter && !this.currentCounter.destroyed) {
      this.currentCounter.killMotion();
      this.currentCounter.destroy({ children: true });
    }
    this.currentCounter = null;
  }

  private countBalls(from: number, to: number, seconds: number, onValue: (value: number) => void) {
    return new Promise<void>((resolve) => {
      const counter = { value: from };
      let lastShown = -1;
      // 大約跳 40 次，避免頻繁重畫大字。
      const step = Math.max(50, Math.ceil(to / 40 / 50) * 50);
      gsap.to(counter, {
        value: to,
        duration: seconds,
        ease: 'none',
        onUpdate: () => {
          const shown = Math.floor(counter.value / step) * step;
          if (shown !== lastShown) {
            lastShown = shown;
            onValue(shown);
          }
        },
        onComplete: () => {
          onValue(to);
          resolve();
        },
      });
    });
  }

  private startParty() {
    const { stage, audio } = this;
    let running = true;
    const firework = () => {
      if (!running) return;
      stage.sparks(70 + Math.random() * (WIDTH - 140), 130 + Math.random() * 300, 60, FESTIVE, 460);
      gsap.delayedCall(0.5 + Math.random() * 0.4, firework);
    };
    const balls = () => {
      if (!running) return;
      stage.ballRain(7);
      audio.ballPing();
      gsap.delayedCall(0.09, balls);
    };
    firework();
    balls();
    return () => {
      running = false;
    };
  }

  private async loss() {
    const { stage, audio } = this;
    audio.deflate();
    stage.lightMode = 'dark';
    stage.agong.sad();
    stage.agong.say('哎唷……', 1.5);
    await wait(1.5);
    this.resetLights();
    this.onTakeover(false);
    audio.music('idle');
    stage.lightMode = 'idle';
    await wait(0.35);
  }
}
