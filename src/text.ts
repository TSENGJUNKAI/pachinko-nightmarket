// 浮誇大字：用 Canvas 疊出多層外框、金屬漸層和火焰，再交給 Pixi 當貼圖。
import { Container, Sprite, Texture } from 'pixi.js';
import gsap from 'gsap';

export const FONT_SERIF = '"Noto Serif TC","Microsoft JhengHei",serif';
export const FONT_SANS = '"Noto Sans TC","Microsoft JhengHei",sans-serif';

export type TextLook = 'gold' | 'goldLite' | 'blue' | 'green' | 'red' | 'fire' | 'rainbow' | 'silver' | 'pink';

interface Look {
  fill: string[];
  rim: string;
  rimDark: string;
  glow: string;
  flames?: boolean;
}

const LOOKS: Record<TextLook, Look> = {
  gold: { fill: ['#fffbe0', '#ffd24a', '#8f5a00', '#ffe98c', '#b86e00'], rim: '#fff0b0', rimDark: '#5c2c00', glow: '#ff9d00' },
  goldLite: { fill: ['#fffdf0', '#ffe873', '#ffbe1a'], rim: '#7a2a00', rimDark: '#3d1400', glow: '#ff9d00' },
  blue: { fill: ['#ffffff', '#9fdcff', '#1461d6', '#7fd0ff', '#0a2f96'], rim: '#dff4ff', rimDark: '#04205f', glow: '#2f8bff' },
  green: { fill: ['#ffffff', '#b6ff8c', '#0e8f3c', '#8dff7a', '#066b2c'], rim: '#efffd9', rimDark: '#033d1a', glow: '#2fe06a' },
  red: { fill: ['#fff0e0', '#ff7a5c', '#c40f16', '#ff5a3c', '#7a0205'], rim: '#ffe6c9', rimDark: '#3d0002', glow: '#ff2020' },
  fire: { fill: ['#fff7b0', '#ffc21a', '#ff3d0d', '#ff7a12', '#8d0505'], rim: '#ffffff', rimDark: '#3d0000', glow: '#ff5a00', flames: true },
  rainbow: { fill: ['#ff2a2a', '#ff9d1a', '#fff23a', '#3aff6a', '#2ac4ff', '#6a4aff', '#ff3ad0'], rim: '#ffffff', rimDark: '#26004f', glow: '#ff4ae0', flames: true },
  silver: { fill: ['#ffffff', '#d9e1ea', '#5d6b7a', '#f2f6fa', '#8896a6'], rim: '#ffffff', rimDark: '#141a22', glow: '#7fa8d9' },
  pink: { fill: ['#ffffff', '#ffb0dc', '#e0127f', '#ff8acb', '#8a0550'], rim: '#fff0f8', rimDark: '#46012a', glow: '#ff2fa0' },
};

const cache = new Map<string, Texture>();

function paintFlames(ctx: CanvasRenderingContext2D, width: number, height: number, size: number) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const count = Math.round(((width * height) / (size * size)) * 34);
  for (let i = 0; i < count; i += 1) {
    const x = size * 0.45 + Math.random() * (width - size * 0.9);
    const y = size * 0.5 + Math.random() * Math.max(1, height - size * 1.2);
    const radius = size * (0.1 + Math.random() * 0.25);
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, 'rgba(255,214,90,0.5)');
    gradient.addColorStop(0.5, 'rgba(255,90,10,0.28)');
    gradient.addColorStop(1, 'rgba(180,10,0,0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.ellipse(x, y - radius * 0.7, radius * 0.65, radius * 1.6, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function textTexture(text: string, look: TextLook, size: number, vertical = false, font = FONT_SERIF, outline = 1): Texture {
  const key = `${text}|${look}|${size}|${vertical}|${font}|${outline}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const style = LOOKS[look];
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const fontSpec = `900 ${size}px ${font}`;
  ctx.font = fontSpec;
  const pad = Math.ceil(size * 0.42);
  const chars = [...text];
  const lineStep = size * 1.04;
  const textWidth = ctx.measureText(text).width;
  canvas.width = Math.ceil((vertical ? size : textWidth) + pad * 2);
  canvas.height = Math.ceil((vertical ? lineStep * chars.length : size * 1.1) + pad * 2);

  ctx.font = fontSpec;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';

  const positions: Array<[string, number, number]> = vertical
    ? chars.map((c, i): [string, number, number] => [c, canvas.width / 2, pad + lineStep * (i + 0.5)])
    : [[text, canvas.width / 2, canvas.height / 2]];

  const eachChar = (draw: (c: string, x: number, y: number) => void) => {
    positions.forEach(([c, x, y]) => draw(c, x, y));
  };

  if (style.flames) paintFlames(ctx, canvas.width, canvas.height, size);

  ctx.save();
  ctx.shadowColor = style.glow;
  ctx.shadowBlur = size * 0.36;
  ctx.strokeStyle = style.glow;
  ctx.lineWidth = size * 0.2 * outline;
  eachChar((c, x, y) => ctx.strokeText(c, x, y));
  eachChar((c, x, y) => ctx.strokeText(c, x, y));
  ctx.restore();

  ctx.strokeStyle = '#14040a';
  ctx.lineWidth = size * 0.2 * outline;
  eachChar((c, x, y) => ctx.strokeText(c, x, y));

  ctx.strokeStyle = style.rim;
  ctx.lineWidth = size * 0.095 * outline;
  eachChar((c, x, y) => ctx.strokeText(c, x, y));

  ctx.strokeStyle = style.rimDark;
  ctx.lineWidth = size * 0.04 * outline;
  eachChar((c, x, y) => ctx.strokeText(c, x, y));

  eachChar((c, x, y) => {
    const top = y - size * 0.5;
    const gradient = ctx.createLinearGradient(0, top, 0, top + size);
    style.fill.forEach((color, i) => {
      gradient.addColorStop(i / (style.fill.length - 1), color);
    });
    ctx.fillStyle = gradient;
    ctx.fillText(c, x, y);
  });

  const texture = Texture.from(canvas);
  cache.set(key, texture);
  return texture;
}

let sheenCache: Texture | null = null;
function sheenTexture(): Texture {
  if (sheenCache) return sheenCache;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 8;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createLinearGradient(0, 0, 128, 0);
  gradient.addColorStop(0, 'rgba(255,255,255,0)');
  gradient.addColorStop(0.5, 'rgba(255,255,255,0.95)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 8);
  sheenCache = Texture.from(canvas);
  return sheenCache;
}

// AI 產的字圖。登記過的字串會用圖片，其他才退回程式畫的字。
const artGlyphs = new Map<string, Texture>();
const ART_LENGTH_SCALE = 1.3;
const GLYPH_HEIGHT: Record<string, number> = { ',': 0.42, '×': 0.66 };

export function registerArtGlyphs(entries: Record<string, Texture>) {
  Object.entries(entries).forEach(([key, texture]) => artGlyphs.set(key, texture));
}

function artTokens(text: string): string[] | null {
  const keys = [...artGlyphs.keys()].sort((a, b) => b.length - a.length);
  const tokens: string[] = [];
  let rest = text;
  while (rest) {
    const key = rest[0] === ' ' ? ' ' : keys.find((candidate) => rest.startsWith(candidate));
    if (!key) return null;
    tokens.push(key);
    rest = rest.slice(key.length);
  }
  return tokens.length ? tokens : null;
}

// 單一字圖：長邊跟字數走，所以導演程式的 size 不用改。
function singleArtSprite(token: string, text: string, size: number) {
  const texture = artGlyphs.get(token)!;
  const sprite = new Sprite(texture);
  sprite.anchor.set(0.5);
  sprite.scale.set((size * [...text].length * ART_LENGTH_SCALE) / Math.max(texture.width, texture.height));
  return sprite;
}

// 「出珠 1,200」這種字圖加數字的組合，排成一列。
function artRow(tokens: string[], size: number, tint: number) {
  const row = new Container();
  const baseline = size * 0.55;
  let x = 0;
  tokens.forEach((token) => {
    if (token === ' ') {
      x += size * 0.25;
      return;
    }
    const texture = artGlyphs.get(token)!;
    const sprite = new Sprite(texture);
    const isWord = token.length > 1;
    const height = size * (isWord ? 1.1 : GLYPH_HEIGHT[token] ?? 0.88);
    sprite.scale.set(height / texture.height);
    sprite.anchor.set(0, 1);
    sprite.position.set(x, baseline);
    if (!isWord) sprite.tint = tint;
    row.addChild(sprite);
    x += sprite.width * (isWord ? 1.04 : 0.94);
  });
  row.pivot.x = x / 2;
  return row;
}

export interface BigTextOptions {
  size?: number;
  vertical?: boolean;
  font?: string;
  maxWidth?: number;
  maxHeight?: number;
  // 外框粗細倍率。字小時要調細，否則筆畫會糊在一起。
  outline?: number;
}

export class BigText extends Container {
  private readonly main: Container;
  private readonly sheen: Sprite | null = null;
  private readonly fit: number;

  constructor(text: string, look: TextLook, options: BigTextOptions = {}) {
    super();
    const { size = 120, vertical = false, font = FONT_SERIF, maxWidth = 690, maxHeight = 1040, outline = 1 } = options;
    const tokens = artTokens(text);
    const single = tokens?.length === 1;
    let solid: Sprite | null = null;
    if (tokens && single) solid = singleArtSprite(tokens[0], text, size);
    else if (!tokens) {
      solid = new Sprite(textTexture(text, look, size, vertical, font, outline));
      solid.anchor.set(0.5);
    }
    this.main = solid ?? artRow(tokens!, size, 0xffffff);
    // 數字用同一套金色字，紅色的倒數靠染色區分。
    if (tokens && single && look === 'red' && tokens[0].length === 1) (this.main as Sprite).tint = 0xff7a5c;
    this.addChild(this.main);

    if (solid) {
      const maskSprite = new Sprite(solid.texture);
      maskSprite.anchor.set(0.5);
      maskSprite.scale.copyFrom(solid.scale);
      this.addChild(maskSprite);

      this.sheen = new Sprite(sheenTexture());
      this.sheen.anchor.set(0.5);
      this.sheen.blendMode = 'add';
      this.sheen.height = solid.height * 1.5;
      this.sheen.width = Math.max(120, solid.width * 0.4);
      this.sheen.rotation = 0.35;
      this.sheen.x = -solid.width;
      this.sheen.mask = maskSprite;
      this.addChild(this.sheen);
    }

    this.fit = Math.min(1, maxWidth / this.main.width, maxHeight / this.main.height);
    this.scale.set(this.fit);
  }

  get fitScale() {
    return this.fit;
  }

  // 砸進畫面：從很大縮回來，停下時掃一道光。
  slam(duration = 0.26) {
    this.scale.set(this.fit * 2.6);
    this.alpha = 0;
    gsap.to(this, { alpha: 1, duration: 0.07 });
    gsap.to(this.scale, { x: this.fit, y: this.fit, duration, ease: 'back.out(1.8)' });
    if (this.sheen) gsap.fromTo(this.sheen, { x: -this.main.width }, { x: this.main.width, duration: 0.55, delay: duration, ease: 'power1.inOut' });
  }

  pulse(amount = 1.04, duration = 0.16) {
    gsap.to(this.scale, { x: this.fit * amount, y: this.fit * amount, duration, ease: 'sine.inOut', yoyo: true, repeat: -1 });
  }

  fadeAway(delay = 0, duration = 0.18) {
    return new Promise<void>((resolve) => {
      gsap.to(this, {
        alpha: 0,
        duration,
        delay,
        onComplete: () => {
          this.killMotion();
          if (!this.destroyed) this.destroy({ children: true });
          resolve();
        },
      });
    });
  }

  killMotion() {
    gsap.killTweensOf(this);
    gsap.killTweensOf(this.scale);
    if (this.sheen) gsap.killTweensOf(this.sheen);
  }
}

// 字型要先載入，否則第一次畫大字會用到備用字體。
export async function loadFonts(): Promise<void> {
  const serif =
    '保留聽牌激熱超機會好運三聖筊笑陰第次大獎確定復活遶境成功突入連莊結束最後一夜市口香腸街珍奶巷牌樓廟出珠顆本輪剩餘回敲鑼電子花車救阿公的攤位虹必中到站總計抵達RUSH0123456789,！？×…';
  await Promise.all([
    document.fonts.load('900 100px "Noto Serif TC"', serif),
    document.fonts.load('900 100px "Noto Sans TC"', `${serif}燈籠珍奶鞭炮金紙招財貓平安符元寶阿公彈珠台鹹酥雞拜託哎唷穩啦著矣完美不錯慢了蚵仔煎宮`),
  ]);
}
