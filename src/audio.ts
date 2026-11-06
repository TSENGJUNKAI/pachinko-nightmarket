// 暫代聲音：全部用 Web Audio 即時合成。導演程式只呼叫這裡的介面，
// 之後換成正式音樂時，導演不用改。

const midiToHz = (m: number) => 440 * 2 ** ((m - 69) / 12);

// D 宮五聲音階，聽起來比較有廟會的味道。
const BASS = [38, 38, 45, 43];
const IDLE_ARP = [62, 66, 69, 71, 74, 71, 69, 66];
const SUONA_RISE = [74, null, 76, 78, 81, null, 78, 76, 74, 76, 78, 81, 83, null, 81, 78];
const SUONA_JACKPOT = [
  81, 83, 86, 83, 81, 78, 81, null, 78, 76, 74, 76, 78, 81, 78, null,
  86, 88, 90, 88, 86, 83, 86, null, 83, 81, 78, 81, 83, 86, 90, null,
];
// 遶境專用的陣頭旋律，和大獎完全不同，一聽就知道換了模式。
const SUONA_RUSH = [
  74, 74, 78, 81, 83, 81, 78, 81, 86, null, 83, 81, 78, null, 81, 83,
  86, 86, 88, 90, 88, 86, 83, 86, 81, null, 78, 81, 74, null, 76, 78,
];
const TOM_PATTERN = [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 1, 1, 0, 1, 1, 1];

export type MusicMode = 'idle' | 'reach' | 'jackpot' | 'rush';

const TEMPO: Record<MusicMode, number> = { idle: 112, reach: 128, jackpot: 150, rush: 168 };

export class AudioKit {
  muted = false;
  mode: MusicMode | null = null;
  ctx: AudioContext | null = null;

  private level = 0;
  private step = 0;
  private nextTime = 0;
  private master!: DynamicsCompressorNode;
  private output!: GainNode;
  private noiseBuffer!: AudioBuffer;

  // 瀏覽器規定要等玩家點擊後才能出聲。
  unlock() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createDynamicsCompressor();
      this.output = this.ctx.createGain();
      this.output.gain.value = this.muted ? 0 : 0.8;
      this.master.connect(this.output);
      this.output.connect(this.ctx.destination);
      this.noiseBuffer = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
      setInterval(() => this.schedule(), 25);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (this.ctx) this.output.gain.value = muted ? 0 : 0.8;
  }

  music(mode: MusicMode | null, level = 0) {
    this.level = level;
    if (mode === this.mode) return;
    this.mode = mode;
    this.step = 0;
    if (this.ctx) this.nextTime = this.ctx.currentTime + 0.03;
  }

  intensity(level: number) {
    this.level = level;
  }

  private schedule() {
    if (!this.ctx || !this.mode) return;
    const now = this.ctx.currentTime;
    if (this.nextTime < now) this.nextTime = now + 0.02;
    const stepLength = 60 / TEMPO[this.mode] / 4;
    while (this.nextTime < now + 0.12) {
      this.playStep(this.mode, this.step, this.nextTime, stepLength);
      this.nextTime += stepLength;
      this.step += 1;
    }
  }

  private playStep(mode: MusicMode, step: number, t: number, len: number) {
    if (mode === 'idle') this.idleStep(step, t, len);
    else if (mode === 'reach') this.reachStep(step, t, len);
    else if (mode === 'jackpot') this.jackpotStep(step, t, len);
    else this.rushStep(step, t, len);
  }

  private idleStep(step: number, t: number, len: number) {
    const s = step % 32;
    if (s % 8 === 0) this.kick(t, 0.35);
    if (s % 8 === 4) this.hat(t, 0.08);
    if (s % 8 === 0) this.tone(midiToHz(BASS[Math.floor(s / 8)]), t, len * 3, 'triangle', 0.22);
    if (s % 2 === 0) this.tone(midiToHz(IDLE_ARP[(s / 2) % 8]), t, len * 1.5, 'square', 0.035);
  }

  private reachStep(step: number, t: number, len: number) {
    const s = step % 16;
    if (s % 4 === 0) this.kick(t, 0.7);
    if (s % 4 === 2) this.hat(t, 0.14);
    if (s % 2 === 0) this.tone(midiToHz(BASS[0] + this.level), t, len * 1.5, 'sawtooth', 0.11);
    if (this.level >= 1 && s % 8 === 4) this.snare(t, 0.3);
    if (this.level >= 2 && s % 2 === 1) this.snare(t, 0.14);
    if (this.level >= 2) this.suona(midiToHz((SUONA_RISE[s] ?? 74) + this.level), t, len * 0.9, 0.07);
    this.tone(midiToHz(74 + this.level * 2), t, len * 0.4, 'square', 0.02 + this.level * 0.012);
  }

  private jackpotStep(step: number, t: number, len: number) {
    const s = step % 32;
    if (s % 4 === 0) this.kick(t, 0.85);
    if (s % 4 === 2) this.hat(t, 0.2);
    if (s % 8 === 4) this.snare(t, 0.35);
    if (s % 2 === 0) {
      const bass = BASS[Math.floor(s / 8)];
      this.tone(midiToHz(bass + (s % 4 === 2 ? 12 : 0)), t, len * 1.6, 'sawtooth', 0.14);
    }
    const note = SUONA_JACKPOT[s];
    if (note) this.suona(midiToHz(note), t, len * 1.1, 0.13);
    if (step % 64 === 0) this.gong(t, 0.5);
  }

  // level 代表走到第幾站，每過一站升半音，越走越亢奮。
  private rushStep(step: number, t: number, len: number) {
    const s = step % 32;
    const lift = this.level;
    if (TOM_PATTERN[s % 16]) this.tom(t, s % 16 === 0 ? 0.8 : 0.5, s % 3 === 0 ? 96 : 130);
    if (s % 4 === 0) this.kick(t, 0.75);
    if (s % 2 === 1) this.cymbal(t, 0.09);
    if (s % 8 === 4) this.snare(t, 0.32);
    if (s % 2 === 0) this.tone(midiToHz(BASS[Math.floor(s / 8)] + lift), t, len * 1.4, 'sawtooth', 0.12);
    const note = SUONA_RUSH[s];
    if (note) this.suona(midiToHz(note + lift), t, len * 1.05, 0.14);
    if (step % 32 === 0) this.gong(t, 0.3);
  }

  private tone(freq: number, t: number, dur: number, type: OscillatorType, vol: number, dest: AudioNode = this.master) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    osc.connect(gain);
    gain.connect(dest);
    osc.start(t);
    osc.stop(t + dur + 0.02);
    return osc;
  }

  private noise(t: number, dur: number, vol: number, filterType: BiquadFilterType, filterFreq: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t, Math.random() * 0.8, dur + 0.02);
  }

  private kick(t: number, vol: number) {
    const osc = this.tone(150, t, 0.16, 'sine', vol);
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(42, t + 0.12);
  }

  private tom(t: number, vol: number, freq: number) {
    const osc = this.tone(freq * 1.5, t, 0.18, 'sine', vol);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.7, t + 0.15);
    this.noise(t, 0.03, vol * 0.25, 'bandpass', 1200);
  }

  private hat(t: number, vol: number) {
    this.noise(t, 0.04, vol, 'highpass', 7000);
  }

  private cymbal(t: number, vol: number) {
    this.noise(t, 0.09, vol, 'highpass', 5200);
  }

  private snare(t: number, vol: number) {
    this.noise(t, 0.12, vol, 'bandpass', 1900);
  }

  private suona(freq: number, t: number, dur: number, vol: number) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.value = freq;
    lfo.frequency.value = 6.5;
    lfoGain.gain.value = freq * 0.012;
    filter.type = 'bandpass';
    filter.frequency.value = 1500;
    filter.Q.value = 1.2;
    gain.gain.setValueAtTime(0.0008, t);
    gain.gain.linearRampToValueAtTime(vol, t + 0.015);
    gain.gain.setValueAtTime(vol, t + dur * 0.7);
    gain.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    lfo.start(t);
    osc.stop(t + dur + 0.02);
    lfo.stop(t + dur + 0.02);
  }

  private gong(t: number, vol = 0.7) {
    [146, 219, 293, 412, 587].forEach((freq, i) => {
      this.tone(freq, t, 2.6 - i * 0.3, 'sine', vol / (i + 1.6));
    });
    this.noise(t, 0.4, vol * 0.3, 'bandpass', 2800);
  }

  launch() {
    this.play((t) => {
      this.noise(t, 0.05, 0.14, 'bandpass', 1800);
      this.tone(980, t, 0.03, 'square', 0.03);
    });
  }

  pegHit() {
    this.play((t) => this.tone(1900 + Math.random() * 1400, t, 0.022, 'triangle', 0.045));
  }

  // 進洞：清脆的叮一聲，再往上滑。
  pocketIn() {
    this.play((t) => {
      this.tone(midiToHz(86), t, 0.1, 'square', 0.13);
      this.tone(midiToHz(93), t + 0.06, 0.2, 'square', 0.13);
      this.noise(t, 0.08, 0.18, 'highpass', 4000);
    });
  }

  private play(fn: (t: number) => void) {
    if (this.ctx) fn(this.ctx.currentTime);
  }

  lever() {
    this.play((t) => {
      this.noise(t, 0.09, 0.3, 'bandpass', 1200);
      this.tone(520, t, 0.1, 'square', 0.08);
    });
  }

  reelTick(pitch = 1) {
    this.play((t) => this.tone(1200 * pitch, t, 0.03, 'square', 0.05));
  }

  reelStop() {
    this.play((t) => {
      this.tone(170, t, 0.12, 'square', 0.22);
      this.noise(t, 0.05, 0.22, 'bandpass', 900);
    });
  }

  reachSting() {
    this.play((t) => {
      this.gong(t, 0.45);
      this.suona(midiToHz(81), t, 0.2, 0.2);
      this.suona(midiToHz(86), t + 0.18, 0.5, 0.22);
    });
  }

  // 預告每升一段就高一階，光聽就知道越來越熱。
  stepSting(step: number) {
    this.play((t) => {
      const root = 62 + step * 5;
      [0, 4, 7].forEach((n, i) => this.tone(midiToHz(root + n), t + i * 0.04, 0.28, 'square', 0.15));
      this.kick(t, 0.8);
      if (step >= 3) this.gong(t, 0.45);
    });
  }

  rainbowSting() {
    this.play((t) => {
      this.gong(t, 0.9);
      [74, 78, 81, 86, 90, 93, 98].forEach((n, i) => {
        this.suona(midiToHz(n), t + i * 0.055, 0.5, 0.17);
      });
    });
  }

  jiaoLand() {
    this.play((t) => {
      this.tone(760, t, 0.05, 'triangle', 0.4);
      this.tone(520, t + 0.09, 0.05, 'triangle', 0.3);
      this.tone(640, t + 0.15, 0.04, 'triangle', 0.16);
    });
  }

  jiaoGood(count: number) {
    this.play((t) => {
      const root = 74 + count * 4;
      [0, 4, 7].forEach((n, i) => this.suona(midiToHz(root + n), t + i * 0.08, 0.28, 0.15));
    });
  }

  jiaoBad() {
    this.play((t) => {
      const osc = this.tone(330, t, 0.5, 'sawtooth', 0.14);
      osc.frequency.exponentialRampToValueAtTime(120, t + 0.45);
    });
  }

  heartbeat() {
    this.play((t) => {
      this.kick(t, 0.8);
      this.kick(t + 0.2, 0.55);
    });
  }

  deflate() {
    this.play((t) => {
      const osc = this.tone(420, t, 0.9, 'sawtooth', 0.12);
      osc.frequency.exponentialRampToValueAtTime(70, t + 0.85);
    });
  }

  revive() {
    this.play((t) => {
      this.gong(t, 0.7);
      [74, 78, 81, 86].forEach((n, i) => this.suona(midiToHz(n), t + i * 0.06, 0.3, 0.2));
    });
  }

  firecrackers(count = 14) {
    this.play((t) => {
      for (let i = 0; i < count; i += 1) {
        this.noise(t + i * 0.055 + Math.random() * 0.03, 0.05, 0.42, 'highpass', 1400);
      }
    });
  }

  ballPing() {
    this.play((t) => this.tone(2300 + Math.random() * 1500, t, 0.05, 'sine', 0.05));
  }

  fanfare() {
    this.play((t) => {
      this.gong(t, 0.9);
      [74, 78, 81, 86, 90].forEach((n, i) => {
        this.suona(midiToHz(n), t + 0.05 + i * 0.09, 0.45, 0.2);
      });
    });
  }

  // 敲鑼：quality 越高越響亮。
  gongHit(quality: 'perfect' | 'good' | 'late') {
    this.play((t) => {
      if (quality === 'late') {
        this.tone(190, t, 0.2, 'triangle', 0.25);
        return;
      }
      this.gong(t, quality === 'perfect' ? 1 : 0.55);
      if (quality === 'perfect') this.tone(midiToHz(98), t, 0.25, 'square', 0.13);
    });
  }
}
