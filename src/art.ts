// 美術元件：畫面上的物件都用 public/art 的 AI 插圖。
// 換圖只要替換檔案，導演程式不用改。
import { Assets, Container, Graphics, Sprite, Text, Texture, type Renderer } from 'pixi.js';
import gsap from 'gsap';
import { FONT_SANS, registerArtGlyphs } from './text';

const POSES = ['base', 'jackpot', 'nervous', 'throw', 'sad', 'run'] as const;
export type AgongPose = (typeof POSES)[number];

const SYMBOL_GLOWS = [0xff3a20, 0xffa030, 0xff2a60, 0xffc21a, 0xffd257, 0xff4040, 0xffe27a, 0xffb040];

const TEXT_ART: Record<string, string> = {
  救救阿公的攤位: 'title',
  聽牌: 'reach',
  機會: 'chance',
  好運: 'luck',
  激熱: 'hot',
  超激熱: 'superhot',
  聖筊: 'sheng',
  笑筊: 'xiao',
  陰筊: 'yin',
  第三次: 'third',
  三聖筊: 'triple',
  復活: 'revive',
  大獎: 'jackpot',
  遶境: 'parade',
  RUSH: 'rush',
  連莊: 'chain',
  最後一次: 'last',
  遶境成功: 'success',
  遶境結束: 'over',
  總計: 'total',
  保留: 'hold',
  抵達香腸街: 'stop-1',
  抵達珍奶巷: 'stop-2',
  抵達大牌樓: 'stop-3',
  出珠: 'balls',
};
const DIGIT_FILES: Record<string, string> = { ',': 'comma', '×': 'x' };
const DIGITS = '0123456789';

export interface ArtBook {
  poses: Record<AgongPose, Texture>;
  symbols: Texture[];
  market: Texture;
  temple: Texture;
  digits: Texture[];
  rainbowSeven: Texture;
  frameBack: Texture;
  frameRing: Texture;
  pocket: Texture;
  tray: Texture;
  roof: Texture;
  lampOff: Texture;
  lampOn: Texture;
  jiaoRound: Texture;
  jiaoFlat: Texture;
  gong: Texture;
  lantern: Texture;
  ball: Texture;
  peg: Texture;
  papers: Texture[];
  gate: Texture;
  streetFar: Texture;
  streetRoad: Texture;
  stalls: Texture[];
}

export async function loadArt(): Promise<ArtBook> {
  const url = (name: string) => `${import.meta.env.BASE_URL}art/${name}.webp`;
  const load = (name: string) => Assets.load<Texture>(url(name));
  const many = (names: string[]) => Promise.all(names.map(load));
  const poseTextures = await many(POSES.map((pose) => `agong-${pose}`));
  const poses = Object.fromEntries(POSES.map((pose, i) => [pose, poseTextures[i]])) as Record<AgongPose, Texture>;
  const symbols = await many(Array.from({ length: 8 }, (_, i) => `sym-${i + 1}`));
  const digits = await many([...DIGITS].map((d) => `digit-${d}`));

  const words = Object.keys(TEXT_ART);
  const wordTextures = await many(words.map((word) => `text-${TEXT_ART[word]}`));
  const marks = Object.keys(DIGIT_FILES);
  const markTextures = await many(marks.map((mark) => `digit-${DIGIT_FILES[mark]}`));
  registerArtGlyphs({
    ...Object.fromEntries(words.map((word, i) => [word, wordTextures[i]])),
    ...Object.fromEntries([...DIGITS].map((d, i) => [d, digits[i]])),
    ...Object.fromEntries(marks.map((mark, i) => [mark, markTextures[i]])),
  });

  const [market, temple, rainbowSeven, frameBack, frameRing, pocket, tray, roof, lampOff, lampOn, jiaoRound, jiaoFlat, gong, lantern, ball, peg, gate, streetFar, streetRoad] = await many([
    'bg-market', 'bg-temple', 'digit-rainbow-7', 'frame-back', 'frame-ring', 'pocket', 'tray', 'roof', 'lamp-off', 'lamp-on', 'jiao-round', 'jiao-flat', 'gong', 'lantern', 'orb-ball', 'orb-peg', 'gate', 'street-far', 'street-road',
  ]);
  const papers = await many(['1', '2', '3', '4', '5'].map((n) => `paper-${n}`));
  const stalls = await many(['1', '2', '3', '4', '5', '6'].map((n) => `stall-${n}`));
  return { poses, symbols, market, temple, digits, rainbowSeven, frameBack, frameRing, pocket, tray, roof, lampOff, lampOn, jiaoRound, jiaoFlat, gong, lantern, ball, peg, papers, gate, streetFar, streetRoad, stalls };
}

export function makeText(text: string, size: number, fill: number, strokeColor = 0x1a0a14, strokeWidth = Math.max(4, size / 10)) {
  const label = new Text({
    text,
    style: {
      fontFamily: FONT_SANS,
      fontSize: size,
      fontWeight: '900',
      fill,
      align: 'center',
      stroke: { color: strokeColor, width: strokeWidth },
    },
  });
  label.anchor.set(0.5);
  return label;
}

// 轉盤格子：插圖放大當主角，金屬大數字壓在前面。
export function makeSymbolTextures(renderer: Renderer, art: ArtBook, width: number, height: number): Texture[] {
  return art.symbols.map((symbolTexture, index) => {
    const tile = new Container();
    const card = new Graphics().roundRect(0, 0, width, height, 14).fill(0x1c0612).stroke({ width: 5, color: 0xffc21a });
    const glow = new Graphics().ellipse(width * 0.58, height * 0.5, width * 0.42, height * 0.52).fill({ color: SYMBOL_GLOWS[index], alpha: 0.5 });
    const picture = new Sprite(symbolTexture);
    picture.anchor.set(0.5);
    const scale = (height * 1.16) / 360;
    picture.scale.set(scale);
    picture.position.set(width * 0.6, height * 0.5);
    const clip = new Graphics().roundRect(3, 3, width - 6, height - 6, 12).fill(0xffffff);
    picture.mask = clip;
    const number = new Sprite(index === 6 ? art.rainbowSeven : art.digits[index + 1]);
    number.anchor.set(0.5);
    number.scale.set((height * 0.66) / number.texture.height);
    number.position.set(width * 0.2, height * 0.56);
    tile.addChild(card, glow, clip, picture, number);
    const texture = renderer.generateTexture({ target: tile, resolution: 2 });
    tile.destroy({ children: true });
    return texture;
  });
}

function coverSprite(texture: Texture, width: number, height: number) {
  const sprite = new Sprite(texture);
  sprite.scale.set(Math.max(width / texture.width, height / texture.height));
  sprite.position.set((width - sprite.width) / 2, (height - sprite.height) / 2);
  return sprite;
}

// 燈籠本身不變色，預告的顏色由背後的光暈帶出來。
export class Lantern extends Container {
  swayPhase = 0;
  private readonly glow = new Graphics().circle(0, 27, 30).fill(0xffffff);

  constructor(texture: Texture) {
    super();
    const body = new Sprite(texture);
    body.anchor.set(0.5, 0);
    body.scale.set(52 / texture.height);
    this.glow.alpha = 0.5;
    this.glow.blendMode = 'add';
    this.addChild(this.glow, body);
  }

  setColor(color: number) {
    this.glow.tint = color;
  }
}

// 外框原圖的開口對準轉盤，釘子和珠子走在它上面。
const FRAME_BACK = { y: 6, width: 720, height: 641 };

export function makeBackground(art: ArtBook, width: number, height: number) {
  const root = new Container();
  root.addChild(coverSprite(art.market, width, height));
  // 壓暗一點，釘子和珠子才看得清楚。
  root.addChild(new Graphics().rect(0, 0, width, height).fill({ color: 0x14041f, alpha: 0.58 }));
  const frame = new Sprite(art.frameBack);
  frame.position.set(0, FRAME_BACK.y);
  frame.width = FRAME_BACK.width;
  frame.height = FRAME_BACK.height;
  root.addChild(frame);
  const roof = new Sprite(art.roof);
  roof.width = width;
  roof.height = 160;
  roof.y = -14;
  root.addChild(roof);

  const lanterns: Lantern[] = [];
  for (let i = 0; i < 7; i += 1) {
    const lantern = new Lantern(art.lantern);
    lantern.setColor(0xff2a20);
    lantern.position.set(60 + i * 100, 132);
    lantern.swayPhase = i * 0.7;
    root.addChild(lantern);
    lanterns.push(lantern);
  }
  return { root, lanterns };
}

export function makeTempleScene(art: ArtBook, width: number, height: number) {
  return coverSprite(art.temple, width, height);
}

export function makePanel(x: number, y: number, width: number, height: number) {
  const panel = new Graphics();
  panel.roundRect(x, y, width, height, 12).fill(0x0c0812);

  const bulbs: Graphics[] = [];
  const count = 44;
  const w = width + 24;
  const h = height + 24;
  const perimeter = 2 * (w + h);
  const bulbLayer = new Container();
  for (let i = 0; i < count; i += 1) {
    const distance = (i / count) * perimeter;
    let px: number;
    let py: number;
    if (distance < w) {
      px = distance;
      py = 0;
    } else if (distance < w + h) {
      px = w;
      py = distance - w;
    } else if (distance < 2 * w + h) {
      px = 2 * w + h - distance;
      py = h;
    } else {
      px = 0;
      py = perimeter - distance;
    }
    const bulb = new Graphics().circle(0, 0, 6).fill(0xffffff);
    bulb.position.set(x - 12 + px, y - 12 + py);
    bulbs.push(bulb);
    bulbLayer.addChild(bulb);
  }
  return { panel, bulbLayer, bulbs };
}

// 兩片筊杯。flat 是平面朝上，round 是圓面朝上。
export class JiaoBlock {
  readonly root = new Container();
  private readonly round: Sprite;
  private readonly flat: Sprite;

  // side 是落地後在左還是右，兩片的圓背都朝外。
  constructor(art: ArtBook, side: 'left' | 'right') {
    const make = (texture: Texture, flip: boolean) => {
      const sprite = new Sprite(texture);
      sprite.anchor.set(0.5);
      const scale = 132 / texture.width;
      sprite.scale.set(flip ? -scale : scale, scale);
      return sprite;
    };
    this.round = make(art.jiaoRound, side === 'right');
    this.flat = make(art.jiaoFlat, side === 'left');
    this.root.addChild(this.round, this.flat);
    this.setFace('round');
  }

  setFace(face: 'flat' | 'round') {
    this.round.visible = face === 'round';
    this.flat.visible = face === 'flat';
  }
}

// 阿公：每個情緒一張插圖，換姿勢時砸進畫面。
export class Agong {
  readonly root = new Container();
  private readonly body = new Sprite();
  private readonly bubble = new Container();
  private readonly bubbleBox = new Graphics();
  private readonly bubbleText = makeText('', 30, 0x241418, 0xffffff, 0);
  private height = 340;

  constructor(private readonly poses: Record<AgongPose, Texture>) {
    this.body.anchor.set(0.5, 1);
    this.root.addChild(this.body);
    this.bubble.addChild(this.bubbleBox, this.bubbleText);
    this.bubble.visible = false;
    this.root.addChild(this.bubble);
    this.setPose('base');
    this.idle();
  }

  private setPose(pose: AgongPose, mirror = false) {
    this.body.texture = this.poses[pose];
    this.fit(mirror);
  }

  private fit(mirror = false) {
    const scale = this.height / this.body.texture.height;
    gsap.killTweensOf(this.body.scale);
    this.body.scale.set(mirror ? -scale : scale, scale);
    this.bubble.position.set(Math.min(this.height * 0.3, 150), -Math.min(this.height * 0.9, 560));
  }

  // 移動到指定位置和大小（height 是畫面上的高度）。
  moveTo(x: number, y: number, height: number, duration = 0.32) {
    this.height = height;
    gsap.killTweensOf(this.root.position);
    gsap.to(this.root.position, { x, y, duration, ease: 'power3.out' });
    const scale = height / this.body.texture.height;
    gsap.killTweensOf(this.body.scale);
    gsap.to(this.body.scale, { x: scale, y: scale, duration, ease: 'power3.out' });
    this.bubble.position.set(Math.min(height * 0.3, 150), -Math.min(height * 0.9, 560));
  }

  place(x: number, y: number, height: number) {
    this.height = height;
    this.root.position.set(x, y);
    this.fit();
  }

  say(text: string, seconds = 1.8) {
    this.bubbleText.text = text;
    const w = this.bubbleText.width + 36;
    this.bubbleBox.clear().roundRect(-w / 2, -34, w, 68, 18).fill(0xffffff).stroke({ width: 4, color: 0x241418 });
    this.bubble.visible = true;
    this.bubble.scale.set(0.3);
    gsap.killTweensOf(this.bubble.scale);
    gsap.to(this.bubble.scale, { x: 1, y: 1, duration: 0.28, ease: 'back.out(2.5)' });
    gsap.delayedCall(seconds, () => {
      if (this.bubbleText.text === text) this.bubble.visible = false;
    });
  }

  private clearMotion() {
    gsap.killTweensOf([this.body, this.body.position]);
    this.body.rotation = 0;
    this.body.position.set(0, 0);
  }

  // 換姿勢時衝一下，比單純切圖有力。
  private punch(power = 1.18) {
    const x = this.body.scale.x;
    const y = this.body.scale.y;
    this.body.scale.set(x * power, y * power);
    gsap.to(this.body.scale, { x, y, duration: 0.22, ease: 'back.out(2.4)' });
  }

  idle() {
    this.clearMotion();
    this.setPose('base');
    gsap.to(this.body.position, { y: -4, duration: 1.1, ease: 'sine.inOut', yoyo: true, repeat: -1 });
  }

  nervous() {
    this.clearMotion();
    this.setPose('nervous');
    this.punch();
    gsap.to(this.body.position, { x: 4, duration: 0.06, yoyo: true, repeat: -1, ease: 'none' });
  }

  throwUp() {
    this.clearMotion();
    this.setPose('throw');
    this.punch(1.1);
    gsap.fromTo(this.body, { rotation: -0.06 }, { rotation: 0.03, duration: 0.3, ease: 'power2.out' });
  }

  // 擲完回到祈禱的姿勢，等結果。
  pray() {
    this.clearMotion();
    this.setPose('nervous');
    gsap.to(this.body.position, { x: 3, duration: 0.07, yoyo: true, repeat: -1, ease: 'none' });
  }

  sad() {
    this.clearMotion();
    this.setPose('sad');
    gsap.to(this.body.position, { y: 6, duration: 0.5, ease: 'power2.out' });
  }

  dance() {
    this.clearMotion();
    this.setPose('jackpot');
    this.punch(1.3);
    gsap.to(this.body.position, { y: -26, duration: 0.2, ease: 'sine.out', yoyo: true, repeat: -1 });
    gsap.fromTo(this.body, { rotation: -0.035 }, { rotation: 0.035, duration: 0.4, ease: 'sine.inOut', yoyo: true, repeat: -1 });
  }
}

// 遶境街景：三層捲動，讓畫面有往前衝的速度感。
const ROAD_HEIGHT = 240;
const STREET_FLOOR = 840;
const STALL_HEIGHT = 340;
const STALL_SPAN = 330;
const LANTERN_COUNT = 8;
const LANTERN_SPAN = 200;

export class ParadeStreet extends Container {
  private readonly far = new Container();
  private readonly mid = new Container();
  private readonly near = new Container();
  private readonly road = new Container();
  private readonly speedLines = new Graphics();
  private readonly w: number;
  private readonly farSpan: number;
  private readonly roadSpan: number;
  private lineTimer = 0;
  private currentSpeed = 0;

  constructor(art: ArtBook, width: number, _height: number) {
    super();
    this.w = width;

    // 遠景和路面的原圖左右接不起來，隔一張鏡射就能無縫捲動。
    const tile = (texture: Texture, layer: Container, height: number, y: number, count: number) => {
      const scale = height / texture.height;
      const span = texture.width * scale;
      for (let i = 0; i < count; i += 1) {
        const sprite = new Sprite(texture);
        sprite.anchor.set(0.5, 0);
        sprite.scale.set(i % 2 ? -scale : scale, scale);
        sprite.position.set(i * span + span / 2, y);
        layer.addChild(sprite);
      }
      return span;
    };
    this.farSpan = tile(art.streetFar, this.far, STREET_FLOOR, 0, 4);
    this.roadSpan = tile(art.streetRoad, this.road, ROAD_HEIGHT, STREET_FLOOR, 4);

    art.stalls.forEach((texture, i) => {
      const stall = new Sprite(texture);
      stall.anchor.set(0.5, 1);
      stall.scale.set(STALL_HEIGHT / texture.height);
      stall.position.set(i * STALL_SPAN, STREET_FLOOR + 14);
      this.mid.addChild(stall);
    });

    for (let i = 0; i < LANTERN_COUNT; i += 1) {
      const lantern = new Lantern(art.lantern);
      lantern.setColor(i % 2 ? 0xff2a20 : 0xffd257);
      lantern.position.set(i * LANTERN_SPAN, 300 + (i % 2) * 14);
      lantern.scale.set(1.6);
      this.near.addChild(lantern);
    }
    this.speedLines.blendMode = 'add';
    this.addChild(this.far, this.mid, this.road, this.near, this.speedLines);
  }

  private drawSpeedLines() {
    this.speedLines.clear();
    const count = Math.min(16, Math.floor(this.currentSpeed / 60));
    for (let i = 0; i < count; i += 1) {
      const y = 330 + Math.random() * 640;
      const length = 80 + Math.random() * 260;
      const x = Math.random() * this.w;
      this.speedLines.rect(x, y, length, 2 + Math.random() * 3).fill({ color: 0xffffff, alpha: 0.5 });
    }
  }

  update(delta: number, speed: number) {
    this.currentSpeed = speed;
    const wrap = (layer: Container, rate: number, span: number) => {
      layer.children.forEach((child) => {
        child.x -= speed * rate * delta;
        if (child.x < -span / 2) child.x += span * layer.children.length;
      });
    };
    wrap(this.far, 0.25, this.farSpan);
    wrap(this.mid, 0.6, STALL_SPAN);
    wrap(this.near, 1.2, LANTERN_SPAN);
    wrap(this.road, 1, this.roadSpan);
    this.lineTimer -= delta;
    if (this.lineTimer <= 0) {
      this.lineTimer = 0.05;
      this.drawSpeedLines();
    }
  }
}

// 遶境主角：阿公扛著整擔家當往前衝。
export class Runner extends Container {
  private readonly body = new Sprite();

  constructor(texture: Texture, height: number) {
    super();
    this.body.texture = texture;
    this.body.anchor.set(0.5, 1);
    this.body.scale.set(height / texture.height);
    this.addChild(this.body);
    gsap.to(this.body.position, { y: -16, duration: 0.17, ease: 'sine.inOut', yoyo: true, repeat: -1 });
    gsap.to(this.body, { rotation: 0.025, duration: 0.17, ease: 'sine.inOut', yoyo: true, repeat: -1 });
  }
}

// 終點的廟門。
export function makeTempleGate(art: ArtBook, width: number) {
  const gate = new Sprite(art.gate);
  gate.anchor.set(0.5, 1);
  gate.scale.set(width / art.gate.width);
  return gate;
}
