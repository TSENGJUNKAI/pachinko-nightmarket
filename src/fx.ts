// 全螢幕特效：放射光、電光、衝擊波。都由程式產生，不需要美術素材。
import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import gsap from 'gsap';

export type BurstLook = 'blue' | 'green' | 'red' | 'gold' | 'fire' | 'rainbow' | 'dark' | 'parade';

const PALETTE: Record<BurstLook, { stops: string[]; rays: string; bolts: number }> = {
  blue: { stops: ['#bfe6ff', '#1f6be0', '#04124a'], rays: '#9fdcff', bolts: 0x9fdcff },
  green: { stops: ['#e6ffb0', '#16b34f', '#02331a'], rays: '#c9ff9a', bolts: 0xc9ff9a },
  red: { stops: ['#ffe07a', '#ef2410', '#3d0202'], rays: '#ffc27a', bolts: 0xffe27a },
  gold: { stops: ['#fffbd0', '#ffb300', '#6b1c00'], rays: '#fff3a0', bolts: 0xfff3a0 },
  fire: { stops: ['#fff7a0', '#ff5a0a', '#4a0000'], rays: '#ffe08a', bolts: 0xffe08a },
  rainbow: { stops: ['#ffffff', '#ff3ad0', '#2a0a6b'], rays: '#ffffff', bolts: 0xffffff },
  dark: { stops: ['#3a1030', '#16061c', '#050208'], rays: '#5a2a50', bolts: 0x7a4a70 },
  parade: { stops: ['#ffe27a', '#ff4d6a', '#3a0a5c'], rays: '#fff0a0', bolts: 0xfff0a0 },
};

const backgrounds = new Map<BurstLook, Texture>();
const rays = new Map<string, Texture>();

function backgroundTexture(look: BurstLook, width: number, height: number): Texture {
  const cached = backgrounds.get(look);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(width / 2, height / 2, 20, width / 2, height / 2, height * 0.68);
  const { stops } = PALETTE[look];
  stops.forEach((color, i) => gradient.addColorStop(i / (stops.length - 1), color));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  const texture = Texture.from(canvas);
  backgrounds.set(look, texture);
  return texture;
}

function rayTexture(color: string): Texture {
  const cached = rays.get(color);
  if (cached) return cached;
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const center = size / 2;
  const count = 22;
  ctx.fillStyle = color;
  for (let i = 0; i < count; i += 1) {
    const start = (i / count) * Math.PI * 2;
    const spread = (Math.PI / count) * (0.35 + ((i * 7) % 5) * 0.14);
    ctx.globalAlpha = 0.22 + ((i * 3) % 4) * 0.1;
    ctx.beginPath();
    ctx.moveTo(center, center);
    ctx.lineTo(center + Math.cos(start) * size, center + Math.sin(start) * size);
    ctx.lineTo(center + Math.cos(start + spread) * size, center + Math.sin(start + spread) * size);
    ctx.closePath();
    ctx.fill();
  }
  const texture = Texture.from(canvas);
  rays.set(color, texture);
  return texture;
}

interface ShowOptions {
  spin?: number;
  bolts?: number;
  duration?: number;
}

export class Burst extends Container {
  private readonly background = new Sprite();
  private readonly raysSprite = new Sprite();
  private readonly bolts = new Graphics();
  private spinSpeed = 0.5;
  private boltTimer = 0;
  private boltColor = 0xffffff;
  private boltPower = 0;

  constructor(private readonly w: number, private readonly h: number) {
    super();
    this.raysSprite.anchor.set(0.5);
    this.raysSprite.position.set(w / 2, h / 2);
    this.raysSprite.scale.set(1.5);
    this.raysSprite.blendMode = 'add';
    this.bolts.blendMode = 'add';
    this.addChild(this.background, this.raysSprite, this.bolts);
    this.alpha = 0;
    this.visible = false;
  }

  show(look: BurstLook, { spin = 0.5, bolts = 0, duration = 0.12 }: ShowOptions = {}) {
    const palette = PALETTE[look];
    this.background.texture = backgroundTexture(look, this.w, this.h);
    this.raysSprite.texture = rayTexture(palette.rays);
    this.boltColor = palette.bolts;
    this.boltPower = bolts;
    this.spinSpeed = spin;
    this.visible = true;
    gsap.killTweensOf(this);
    gsap.to(this, { alpha: 1, duration });
  }

  hide(duration = 0.25) {
    gsap.killTweensOf(this);
    this.boltPower = 0;
    this.bolts.clear();
    gsap.to(this, {
      alpha: 0,
      duration,
      onComplete: () => {
        this.visible = false;
      },
    });
  }

  update(delta: number) {
    if (!this.visible) return;
    this.raysSprite.rotation += this.spinSpeed * delta;
    this.boltTimer -= delta;
    if (this.boltTimer <= 0) {
      this.boltTimer = 0.06;
      this.drawBolts();
    }
  }

  private drawBolts() {
    this.bolts.clear();
    for (let i = 0; i < this.boltPower; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const reach = this.h * 0.72;
      let x = this.w / 2 + Math.cos(angle) * reach;
      let y = this.h / 2 + Math.sin(angle) * reach;
      const endRadius = 90 + Math.random() * 150;
      const endX = this.w / 2 + Math.cos(angle) * endRadius;
      const endY = this.h / 2 + Math.sin(angle) * endRadius;
      const segments = 9;
      this.bolts.moveTo(x, y);
      for (let s = 1; s <= segments; s += 1) {
        const remaining = segments - s + 1;
        x += (endX - x) / remaining + (Math.random() - 0.5) * 46;
        y += (endY - y) / remaining + (Math.random() - 0.5) * 46;
        this.bolts.lineTo(x, y);
      }
      this.bolts.stroke({ width: 3 + Math.random() * 4, color: this.boltColor, alpha: 0.85 });
    }
  }
}

export function shockRing(parent: Container, x: number, y: number, color: number, maxRadius = 620) {
  const ring = new Graphics().circle(0, 0, 100).stroke({ width: 26, color });
  ring.blendMode = 'add';
  ring.position.set(x, y);
  ring.scale.set(0.15);
  parent.addChild(ring);
  const target = maxRadius / 100;
  gsap.to(ring.scale, { x: target, y: target, duration: 0.55, ease: 'power2.out' });
  gsap.to(ring, { alpha: 0, duration: 0.55, ease: 'power1.in', onComplete: () => ring.destroy() });
}
