// 地頭蛇血條。角色插圖還沒產，先用徽章代替。
import { Container, Graphics } from 'pixi.js';
import gsap from 'gsap';
import { makeText } from './art';

const PANEL = { x: 10, y: 6, width: 700, height: 54 };
const BAR = { x: 76, y: 36, width: 620, height: 16 };
const RUSH_OFFSET = 76;

export class BossBar extends Container {
  private readonly fill = new Graphics();
  private readonly nameText = makeText('', 22, 0xffffff, 0x2a0505, 5);
  private readonly hpText = makeText('', 18, 0xffe98c, 0x2a0505, 4);
  private shown = { ratio: 1 };
  private maxHp = 1;

  constructor() {
    super();
    const panel = new Graphics()
      .roundRect(PANEL.x, PANEL.y, PANEL.width, PANEL.height, 12)
      .fill({ color: 0x1c0408, alpha: 0.92 })
      .stroke({ width: 3, color: 0xffc21a })
      .circle(44, 33, 25)
      .fill(0x8a0f18)
      .stroke({ width: 3, color: 0xffc21a })
      .roundRect(BAR.x, BAR.y, BAR.width, BAR.height, 6)
      .fill(0x3a1018);
    const badge = makeText('蛇', 30, 0xffe98c, 0x2a0505, 4);
    badge.position.set(44, 33);
    this.nameText.anchor.set(0, 0.5);
    this.nameText.position.set(BAR.x, 21);
    this.hpText.anchor.set(1, 0.5);
    this.hpText.position.set(BAR.x + BAR.width, 21);
    this.addChild(panel, badge, this.nameText, this.hpText, this.fill);
    this.visible = false;
  }

  private draw() {
    this.fill.clear();
    const width = BAR.width * Math.max(0, this.shown.ratio);
    if (width > 0) this.fill.roundRect(BAR.x, BAR.y, width, BAR.height, 6).fill(this.shown.ratio > 0.3 ? 0xff3a20 : 0xffc21a);
  }

  show(name: string, hp: number) {
    this.maxHp = hp;
    this.shown = { ratio: 1 };
    this.nameText.text = `地頭蛇 ${name}`;
    this.hpText.text = `${hp} / ${hp}`;
    this.visible = true;
    this.draw();
  }

  hide() {
    this.visible = false;
  }

  // 遶境時上方有路線圖，血條往下讓。
  setRush(active: boolean) {
    this.y = active ? RUSH_OFFSET : 0;
  }

  hit(hp: number, amount: number) {
    const left = Math.max(0, hp);
    this.hpText.text = `${left} / ${this.maxHp}`;
    gsap.killTweensOf(this.shown);
    gsap.to(this.shown, { ratio: left / this.maxHp, duration: 0.3, ease: 'power2.out', onUpdate: () => this.draw() });
    gsap.killTweensOf(this.position, 'x');
    gsap.fromTo(this.position, { x: amount >= 25 ? 10 : 3 }, { x: 0, duration: 0.25, ease: 'elastic.out(1.5, 0.3)' });

    const label = makeText(`-${amount}`, amount >= 25 ? 54 : 28, 0xffe94a, 0x5a0505, 6);
    label.position.set(BAR.x + BAR.width * Math.max(0.08, left / this.maxHp), BAR.y + 34);
    this.addChild(label);
    gsap.to(label, { y: label.y + 44, alpha: 0, duration: 0.8, ease: 'power1.in', onComplete: () => label.destroy() });
    if (left === 0) this.hpText.text = '已擊敗！';
  }
}
