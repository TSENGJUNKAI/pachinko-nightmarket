// 舞台：擺放所有畫面元件，並提供震動、閃光、粒子等共用效果。
import { Application, BlurFilter, Container, Graphics, Sprite, type Texture } from 'pixi.js';
import gsap from 'gsap';
import { SYMBOL_COUNT } from './outcome';
import { Agong, JiaoBlock, Lantern, ParadeStreet, Runner, loadArt, makeBackground, makePanel, makeSymbolTextures, makeTempleScene, type ArtBook } from './art';
import { Board } from './board';
import { BigText, type BigTextOptions, type TextLook } from './text';
import { Burst, shockRing } from './fx';
import type { AudioKit } from './audio';

export const WIDTH = 720;
export const HEIGHT = 1080;

const REEL_WIDTH = 188;
const CELL_HEIGHT = 130;
const PANEL = { x: 60, y: 190, w: 600, h: 390 };
const MACHINE = { y: 350, scale: 0.84 };
const RING_MARGIN = { x: 40, y: 34 };
const LAMP_SIZE = 54;
const BALL_RAIN_SCALE = 20 / 64;
export const IDLE_AGONG = { x: 112, y: 1078, height: 196 };

const mod = (n: number, m: number) => ((n % m) + m) % m;
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export const wait = (seconds: number) => new Promise<void>((resolve) => gsap.delayedCall(seconds, resolve));

interface StopOptions {
  cells?: number;
  duration?: number;
  ease?: string;
}

export class Reel {
  readonly root = new Container();
  pos = Math.floor(Math.random() * SYMBOL_COUNT);
  speed = 0;

  private lastCell = Math.floor(this.pos);
  private tickOn = false;
  private readonly blur = new BlurFilter({ strength: 0, quality: 2 });
  private readonly tiles: Array<{ sprite: Sprite; offset: number }>;

  constructor(private readonly textures: Texture[], x: number, y: number, private readonly onTick: () => void) {
    this.root.position.set(x, y);
    this.blur.strengthX = 0;
    this.tiles = [-2, -1, 0, 1, 2].map((offset) => {
      const sprite = new Sprite(textures[0]);
      sprite.anchor.set(0.5);
      this.root.addChild(sprite);
      return { sprite, offset };
    });
    this.draw();
  }

  get symbol() {
    return mod(Math.round(this.pos), SYMBOL_COUNT);
  }

  private draw() {
    const base = Math.floor(this.pos);
    const frac = this.pos - base;
    this.tiles.forEach(({ sprite, offset }) => {
      sprite.texture = this.textures[mod(base - offset, SYMBOL_COUNT)];
      sprite.y = (frac + offset) * CELL_HEIGHT;
    });
    if (base !== this.lastCell) {
      this.lastCell = base;
      if (this.tickOn) this.onTick();
    }
  }

  private setBlur(amount: number) {
    this.blur.strengthY = amount;
    this.root.filters = amount > 0.5 ? [this.blur] : [];
  }

  update(delta: number) {
    if (this.speed > 0) {
      this.pos += this.speed * delta;
      this.draw();
    }
  }

  spin(speed = 24) {
    gsap.killTweensOf(this);
    this.tickOn = false;
    this.speed = speed;
    this.setBlur(14);
  }

  slowTo(speed: number, seconds = 0.8) {
    this.tickOn = true;
    gsap.to(this, {
      speed,
      duration: seconds,
      ease: 'power2.out',
      onUpdate: () => this.setBlur(this.speed > 9 ? 8 : 0),
    });
  }

  // 停在指定圖案，至少再走 cells 格。
  stopAt(symbol: number, { cells = 3, duration = 0.4, ease = 'back.out(1.5)' }: StopOptions = {}) {
    gsap.killTweensOf(this);
    this.speed = 0;
    let target = Math.ceil(this.pos);
    while (target - this.pos < cells || mod(target, SYMBOL_COUNT) !== symbol) target += 1;
    this.setBlur(duration < 0.6 ? 6 : 0);
    return new Promise<void>((resolve) => {
      gsap.to(this, {
        pos: target,
        duration,
        ease,
        onUpdate: () => this.draw(),
        onComplete: () => {
          this.setBlur(0);
          this.pos = target;
          this.draw();
          resolve();
        },
      });
    });
  }
}

interface Particle {
  sprite: Sprite;
  vx: number;
  vy: number;
  gravity: number;
  life: number;
  maxLife: number;
  spin: number;
  fade: boolean;
}

interface EmitOptions {
  texture: Texture;
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  gravity?: number;
  life?: number;
  tint?: number;
  scale?: number;
  spin?: number;
  fade?: boolean;
  add?: boolean;
}

export type LightMode = 'idle' | 'spin' | 'blue' | 'green' | 'red' | 'gold' | 'jackpot' | 'dark';

const LIGHTS: Record<LightMode, { speed: number; palette: number[] }> = {
  idle: { speed: 3, palette: [0xffd257, 0x7a4f18] },
  spin: { speed: 12, palette: [0xfff4dc, 0x6a4820] },
  blue: { speed: 12, palette: [0x65b6ff, 0x12305c] },
  green: { speed: 15, palette: [0x7dff5e, 0x0e4f22] },
  red: { speed: 20, palette: [0xff4d4d, 0x4f1010] },
  gold: { speed: 28, palette: [0xffe27a, 0x7a2f06] },
  jackpot: { speed: 34, palette: [0xff2fa0, 0x21f0ff, 0xffd257] },
  dark: { speed: 0, palette: [0x332030] },
};

export class Stage {
  app = new Application();
  world = new Container();
  reels!: { left: Reel; center: Reel; right: Reel };
  art!: ArtBook;
  agong!: Agong;
  board!: Board;
  runner!: Runner;
  street!: ParadeStreet;
  temple!: Sprite;
  jiaoLeft!: JiaoBlock;
  jiaoRight!: JiaoBlock;
  jiaoLayer = new Container();
  burst = new Burst(WIDTH, HEIGHT);
  machine = new Container();
  tray = new Container();
  holdLamps: Sprite[] = [];
  overlay = new Container();
  bannerLayer = new Container();
  title!: BigText;
  particles: Particle[] = [];
  lightMode: LightMode = 'idle';
  streetSpeed = 0;
  onUpdate: ((delta: number) => void) | null = null;

  private lanterns: Lantern[] = [];
  private bulbs: Graphics[] = [];
  private ambient = new Graphics().rect(0, 0, WIDTH, HEIGHT).fill(0xffffff);
  private flashRect = new Graphics().rect(0, 0, WIDTH, HEIGHT).fill(0xffffff);
  private centerGlow = new Graphics();
  private particleLayer = new Container();
  private time = 0;
  private ballTexture!: Texture;
  private sparkTexture!: Texture;
  private paperTextures: Texture[] = [];

  async init(slot: HTMLElement, audio: AudioKit) {
    await this.app.init({
      width: WIDTH,
      height: HEIGHT,
      background: 0x0b0714,
      antialias: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
    });
    slot.appendChild(this.app.canvas);
    this.app.stage.addChild(this.world);

    this.art = await loadArt();
    const bg = makeBackground(this.art, WIDTH, HEIGHT);
    this.lanterns = bg.lanterns;
    this.world.addChild(bg.root);

    this.board = new Board(audio, this.art);
    this.buildTray();
    this.world.addChild(this.board.root, this.tray);

    this.title = new BigText('救救阿公的攤位', 'goldLite', { size: 84, maxWidth: 560, outline: 0.42 });
    this.title.position.set(WIDTH / 2, 72);
    this.world.addChild(this.title);

    this.temple = makeTempleScene(this.art, WIDTH, HEIGHT);
    this.temple.visible = false;
    this.street = new ParadeStreet(this.art, WIDTH, HEIGHT);
    this.street.visible = false;
    this.runner = new Runner(this.art.poses.run, 560);
    this.runner.position.set(WIDTH / 2 - 20, 1000);
    this.runner.visible = false;
    this.world.addChild(this.temple, this.street, this.runner, this.burst);

    this.buildMachine(audio);
    this.world.addChild(this.machine);

    this.ambient.tint = 0x000000;
    this.ambient.alpha = 0;
    this.world.addChild(this.ambient);

    this.agong = new Agong(this.art.poses);
    this.agong.place(IDLE_AGONG.x, IDLE_AGONG.y, IDLE_AGONG.height);
    this.world.addChild(this.agong.root);

    this.jiaoLeft = new JiaoBlock(this.art, 'left');
    this.jiaoRight = new JiaoBlock(this.art, 'right');
    this.jiaoLayer.addChild(this.jiaoLeft.root, this.jiaoRight.root);
    this.jiaoLayer.visible = false;
    this.world.addChild(this.jiaoLayer, this.overlay, this.particleLayer, this.bannerLayer);

    this.ballTexture = this.art.ball;
    this.sparkTexture = this.app.renderer.generateTexture(new Graphics().circle(5, 5, 5).fill(0xffffff));
    this.paperTextures = this.art.papers;

    this.flashRect.alpha = 0;
    this.app.stage.addChild(this.flashRect);

    this.app.ticker.add((ticker) => this.tick(ticker.deltaMS / 1000));
    return this;
  }

  private buildMachine(audio: AudioKit) {
    const panel = makePanel(PANEL.x, PANEL.y, PANEL.w, PANEL.h);
    this.bulbs = panel.bulbs;
    const textures = makeSymbolTextures(this.app.renderer, this.art, REEL_WIDTH - 12, CELL_HEIGHT - 10);
    const reelLayer = new Container();
    const mask = new Graphics().roundRect(PANEL.x, PANEL.y, PANEL.w, PANEL.h, 12).fill(0xffffff);
    reelLayer.mask = mask;
    const centerY = PANEL.y + PANEL.h / 2;
    const reelX = (i: number) => PANEL.x + 12 + REEL_WIDTH / 2 + i * (REEL_WIDTH + 4);
    this.reels = {
      left: new Reel(textures, reelX(0), centerY, () => audio.reelTick(0.8)),
      center: new Reel(textures, reelX(1), centerY, () => audio.reelTick(1.1)),
      right: new Reel(textures, reelX(2), centerY, () => audio.reelTick(0.9)),
    };
    Object.values(this.reels).forEach((reel) => reelLayer.addChild(reel.root));

    const payline = new Graphics()
      .rect(PANEL.x, centerY - CELL_HEIGHT / 2 - 2, PANEL.w, 4)
      .fill({ color: 0xffd257, alpha: 0.75 })
      .rect(PANEL.x, centerY + CELL_HEIGHT / 2 - 2, PANEL.w, 4)
      .fill({ color: 0xffd257, alpha: 0.75 });

    this.centerGlow
      .roundRect(reelX(1) - REEL_WIDTH / 2, centerY - CELL_HEIGHT / 2, REEL_WIDTH, CELL_HEIGHT, 14)
      .stroke({ width: 9, color: 0xffffff });
    this.centerGlow.alpha = 0;
    this.centerGlow.blendMode = 'add';

    const ring = new Sprite(this.art.frameRing);
    ring.position.set(PANEL.x - RING_MARGIN.x, PANEL.y - RING_MARGIN.y);
    ring.width = PANEL.w + RING_MARGIN.x * 2;
    ring.height = PANEL.h + RING_MARGIN.y * 2;

    this.machine.addChild(panel.panel, reelLayer, mask, payline, ring, panel.bulbLayer, this.centerGlow);
    // 以面板中心為軸心，縮小時才會留在預期位置。
    this.machine.pivot.set(WIDTH / 2, centerY);
    this.machine.position.set(WIDTH / 2, MACHINE.y);
    this.machine.scale.set(MACHINE.scale);
  }

  // 下方托盤：阿公平常站在這裡，中間是保留燈。
  private buildTray() {
    const panel = new Sprite(this.art.tray);
    panel.position.set(0, 884);
    panel.width = WIDTH;
    panel.height = HEIGHT - 884;
    const label = new BigText('保留', 'goldLite', { size: 42 });
    label.position.set(WIDTH / 2 + 30, 935);
    this.tray.addChild(panel, label);
    for (let i = 0; i < 4; i += 1) {
      const lamp = new Sprite(this.art.lampOff);
      lamp.anchor.set(0.5);
      lamp.width = LAMP_SIZE;
      lamp.height = LAMP_SIZE;
      lamp.position.set(WIDTH / 2 - 75 + i * 70, 1005);
      this.tray.addChild(lamp);
      this.holdLamps.push(lamp);
    }
  }

  setHoldLamps(count: number) {
    this.holdLamps.forEach((lamp, i) => {
      const on = i < count;
      const lit = lamp.texture === this.art.lampOn;
      lamp.texture = on ? this.art.lampOn : this.art.lampOff;
      const size = LAMP_SIZE / lamp.texture.width;
      gsap.killTweensOf(lamp.scale);
      if (on && !lit) gsap.fromTo(lamp.scale, { x: size * 1.5, y: size * 1.5 }, { x: size, y: size, duration: 0.25, ease: 'back.out(3)' });
      else lamp.scale.set(size);
    });
  }

  // 轉盤縮到畫面上方，把舞台讓給預告；日本機台的重要手法。
  machineMini(duration = 0.3, y = 108, scale = 0.32) {
    gsap.killTweensOf([this.machine.position, this.machine.scale]);
    gsap.to(this.machine.position, { y, duration, ease: 'power3.inOut' });
    gsap.to(this.machine.scale, { x: scale, y: scale, duration, ease: 'power3.inOut' });
  }

  machineFull(duration = 0.35, scale = MACHINE.scale, y = MACHINE.y) {
    gsap.killTweensOf([this.machine.position, this.machine.scale]);
    gsap.to(this.machine.position, { y, duration, ease: 'power3.inOut' });
    gsap.to(this.machine.scale, { x: scale, y: scale, duration, ease: 'power3.inOut' });
  }

  private tick(realDelta: number) {
    const delta = realDelta * gsap.globalTimeline.timeScale();
    this.time += delta;
    Object.values(this.reels).forEach((reel) => reel.update(delta));
    this.burst.update(delta);
    this.board.update(delta);
    if (this.street.visible) this.street.update(delta, this.streetSpeed);
    this.onUpdate?.(delta);

    this.lanterns.forEach((lantern) => {
      lantern.rotation = Math.sin(this.time * 1.5 + lantern.swayPhase) * 0.07;
    });

    const { speed, palette } = LIGHTS[this.lightMode];
    const phase = Math.floor(this.time * speed);
    this.bulbs.forEach((bulb, i) => {
      bulb.tint = palette[(i + phase) % palette.length];
    });

    for (let i = this.particles.length - 1; i >= 0; i -= 1) {
      const p = this.particles[i];
      p.life -= delta;
      p.vy += p.gravity * delta;
      p.sprite.x += p.vx * delta;
      p.sprite.y += p.vy * delta;
      p.sprite.rotation += p.spin * delta;
      if (p.fade) p.sprite.alpha = Math.max(0, p.life / p.maxLife);
      if (p.life <= 0 || p.sprite.y > HEIGHT + 40) {
        p.sprite.destroy();
        this.particles.splice(i, 1);
      }
    }
  }

  private emit({ texture, x, y, vx = 0, vy = 0, gravity = 600, life = 1.5, tint = 0xffffff, scale = 1, spin = 0, fade = true, add = false }: EmitOptions) {
    if (this.particles.length > 420) return;
    const sprite = new Sprite(texture);
    sprite.anchor.set(0.5);
    sprite.position.set(x, y);
    sprite.tint = tint;
    sprite.scale.set(scale);
    if (add) sprite.blendMode = 'add';
    this.particleLayer.addChild(sprite);
    this.particles.push({ sprite, vx, vy, gravity, life, maxLife: life, spin, fade });
  }

  sparks(x: number, y: number, count: number, colors: number[], power = 340) {
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = power * (0.35 + Math.random() * 0.75);
      this.emit({
        texture: this.sparkTexture,
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        gravity: 260,
        life: 0.7 + Math.random() * 0.6,
        tint: colors[i % colors.length],
        scale: 0.8 + Math.random() * 1.2,
        add: true,
      });
    }
  }

  ballRain(count: number) {
    for (let i = 0; i < count; i += 1) {
      this.emit({
        texture: this.ballTexture,
        x: 40 + Math.random() * (WIDTH - 80),
        y: -20 - Math.random() * 60,
        vx: -60 + Math.random() * 120,
        vy: 260 + Math.random() * 240,
        gravity: 1100,
        life: 2,
        fade: false,
        scale: (0.8 + Math.random() * 0.5) * BALL_RAIN_SCALE,
      });
    }
  }

  paperRain(count: number) {
    for (let i = 0; i < count; i += 1) {
      this.emit({
        texture: this.paperTextures[i % this.paperTextures.length],
        x: Math.random() * WIDTH,
        y: -20,
        vx: -60 + Math.random() * 120,
        vy: 100 + Math.random() * 140,
        gravity: 70,
        life: 4,
        spin: -5 + Math.random() * 10,
        scale: 0.4 + Math.random() * 0.4,
        fade: false,
      });
    }
  }

  ring(color: number, x = WIDTH / 2, y = HEIGHT / 2, radius = 620) {
    shockRing(this.overlay, x, y, color, radius);
  }

  shake(strength = 14, duration = 0.35) {
    if (reduceMotion) return;
    gsap.killTweensOf(this.world.position);
    this.world.position.set(0, 0);
    const proxy = { power: strength };
    gsap.to(proxy, {
      power: 0,
      duration,
      ease: 'power2.out',
      onUpdate: () => {
        this.world.position.set((Math.random() - 0.5) * 2 * proxy.power, (Math.random() - 0.5) * 2 * proxy.power);
      },
      onComplete: () => this.world.position.set(0, 0),
    });
  }

  // 單次閃光，並限制強度，避免對光敏感的玩家不舒服。
  flash(color = 0xffffff, alpha = 0.75, duration = 0.45) {
    this.flashRect.tint = color;
    gsap.killTweensOf(this.flashRect);
    gsap.fromTo(this.flashRect, { alpha: reduceMotion ? Math.min(alpha, 0.2) : alpha }, { alpha: 0, duration, ease: 'power2.out' });
  }

  setAmbient(color: number, alpha: number, duration = 0.5) {
    gsap.killTweensOf(this.ambient);
    this.ambient.tint = color;
    gsap.to(this.ambient, { alpha, duration });
  }

  setLanterns(color: number) {
    this.lanterns.forEach((lantern, i) => {
      gsap.delayedCall(i * 0.04, () => {
        lantern.setColor(color);
      });
    });
  }

  // 大字砸進畫面。hold 為 null 時不自動消失。
  bigText(text: string, look: TextLook, options: BigTextOptions & { x?: number; y?: number; hold?: number | null; pulse?: boolean } = {}) {
    const { x = WIDTH / 2, y = HEIGHT / 2, hold = 0.8, pulse = false, ...rest } = options;
    const label = new BigText(text, look, rest);
    label.position.set(x, y);
    this.bannerLayer.addChild(label);
    label.slam();
    if (pulse) gsap.delayedCall(0.3, () => label.destroyed || label.pulse());
    if (hold !== null) void label.fadeAway(hold);
    return label;
  }

  clearBanners() {
    [...this.bannerLayer.children].forEach((child) => {
      (child as BigText).killMotion();
      child.destroy({ children: true });
    });
  }

  pulseCenter(color: number, on: boolean) {
    gsap.killTweensOf(this.centerGlow);
    this.centerGlow.tint = color;
    if (on) gsap.fromTo(this.centerGlow, { alpha: 0.25 }, { alpha: 1, duration: 0.22, yoyo: true, repeat: -1 });
    else this.centerGlow.alpha = 0;
  }
}
