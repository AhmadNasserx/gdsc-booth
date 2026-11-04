// The winners ceremony: a presenter-driven reveal for the booth's big screen. Plain DOM rather than
// React, because every step is a timed sequence of animations and sounds on one stage.
// Space, Enter or a click moves on; pressing during a spin lands it at once. ← steps back.
import type { Winner } from '@/lib/announce';

export interface CeremonyOptions {
  /** Winners, best first. 3 for one hour, up to 9 for the day. */
  winners: Winner[];
  /** Names the reel spins through before it lands. */
  pool: string[];
  /** Eyebrow and title on the opening screen. */
  eyebrow: string;
  title: string;
  subtitle: string;
}

type Step = { t: 'title' } | { t: 'rank'; r: number } | { t: 'podium' } | { t: 'pod'; r: number } | { t: 'fin' };

const MEDAL = ['🥇', '🥈', '🥉'];
const COLORS = ['#F7B500', '#965D94', '#00A6BA', '#7DB83A', '#E1484B', '#FFFFFF'];

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);
const pts = (n: number) => n.toLocaleString('en-US');
const ord = (r: number) => (r === 1 ? '1st' : r === 2 ? '2nd' : r === 3 ? '3rd' : `${r}th`);

/* ---------- sound: synthesized, so the page needs no audio files ---------- */
class Sound {
  private ac: AudioContext | null = null;
  private out!: GainNode;
  private nb!: AudioBuffer;
  on = true;

  start() {
    if (!this.ac) {
      try {
        const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.ac = new Ctx();
      } catch {
        return;
      }
      const c = this.ac.createDynamicsCompressor();
      c.threshold.value = -12;
      c.ratio.value = 5;
      c.connect(this.ac.destination);
      this.out = this.ac.createGain();
      this.out.gain.value = 0.9;
      this.out.connect(c);
      this.nb = this.ac.createBuffer(1, this.ac.sampleRate * 2, this.ac.sampleRate);
      const d = this.nb.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    void this.ac.resume();
  }

  close() {
    void this.ac?.close();
  }

  private get ok() {
    return !!this.ac && this.on;
  }

  private tone(f: number, t: number, dur: number, type: OscillatorType, vol: number, slide?: number) {
    const ac = this.ac as AudioContext;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this.out);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private nz(t: number, dur: number, vol: number, type: BiquadFilterType, freq: number, sweep?: number, q = 0.8) {
    const ac = this.ac as AudioContext;
    const s = ac.createBufferSource();
    s.buffer = this.nb;
    const f = ac.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    f.Q.value = q;
    if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f);
    f.connect(g);
    g.connect(this.out);
    s.start(t, Math.random());
    s.stop(t + dur + 0.05);
  }

  private kick(t: number, v = 1) {
    const ac = this.ac as AudioContext;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.4);
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    o.connect(g);
    g.connect(this.out);
    o.start(t);
    o.stop(t + 0.65);
  }

  private mf = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

  boom() {
    if (!this.ok) return;
    const t = this.ac!.currentTime;
    this.kick(t, 1.1);
    this.nz(t, 0.9, 0.25, 'lowpass', 400, 80);
    this.tone(55, t, 1.2, 'sine', 0.5);
  }
  whoosh() {
    if (!this.ok) return;
    this.nz(this.ac!.currentTime, 0.6, 0.35, 'bandpass', 250, 5000, 2);
  }
  drumroll(dur: number) {
    if (!this.ok) return;
    const t0 = this.ac!.currentTime;
    for (let t = t0; t < t0 + dur; ) {
      const p = (t - t0) / dur;
      this.nz(t, 0.07, 0.08 + 0.42 * p * p, 'bandpass', 1800 + p * 1200, undefined, 1.2);
      t += 0.075 - 0.04 * p;
    }
    this.tone(48, t0, dur, 'sine', 0.25, 70);
  }
  tick(p: number) {
    if (this.ok) this.tone(900 + p * 900, this.ac!.currentTime, 0.035, 'square', 0.05);
  }
  land(big: boolean) {
    if (!this.ok) return;
    const t = this.ac!.currentTime;
    this.kick(t);
    this.nz(t, big ? 2.4 : 1.6, 0.4, 'highpass', 4000);
    (big ? [60, 64, 67, 72, 76] : [67, 71, 74, 79]).forEach((m) => {
      this.tone(this.mf(m), t, big ? 1.6 : 1, 'sawtooth', 0.05);
      this.tone(this.mf(m), t, big ? 1.6 : 1, 'square', 0.04);
    });
    [84, 88, 91].forEach((m, k) => this.tone(this.mf(m), t + 0.08 + k * 0.07, 0.25, 'triangle', 0.08));
  }
  heartbeat(n: number) {
    if (!this.ok) return;
    const t = this.ac!.currentTime;
    for (let i = 0; i < n; i++) {
      this.kick(t + i * 0.7, 0.7);
      this.kick(t + i * 0.7 + 0.18, 0.45);
    }
  }
  count(p: number) {
    if (this.ok) this.tone(500 + p * 1000, this.ac!.currentTime, 0.025, 'sine', 0.05);
  }
  fanfare() {
    if (!this.ok) return;
    const t = this.ac!.currentTime;
    ([[60, 0], [60, 0.14], [60, 0.28], [67, 0.42], [64, 0.9], [67, 1.04], [72, 1.2]] as const).forEach(([m, d]) => {
      this.tone(this.mf(m), t + d, 0.16, 'square', 0.1);
      this.tone(this.mf(m) / 2, t + d, 0.16, 'sawtooth', 0.06);
    });
    [72, 76, 79, 84].forEach((m) => {
      this.tone(this.mf(m), t + 1.35, 1.8, 'sawtooth', 0.05);
      this.tone(this.mf(m), t + 1.35, 1.8, 'square', 0.04);
    });
    this.kick(t + 1.35);
    this.nz(t + 1.35, 2.5, 0.3, 'highpass', 5000);
  }
  applause(dur: number) {
    if (!this.ok) return;
    const t0 = this.ac!.currentTime;
    for (let i = 0; i < dur * 90; i++) {
      const t = t0 + Math.random() * dur;
      const p = 1 - (t - t0) / dur;
      this.nz(t, 0.03 + Math.random() * 0.03, (0.05 + Math.random() * 0.1) * p, 'bandpass', 900 + Math.random() * 2400, undefined, 1.5);
    }
  }
  sparkle(n: number) {
    if (!this.ok) return;
    const t = this.ac!.currentTime;
    for (let k = 0; k < n; k++) this.tone(1800 + Math.random() * 2400, t + Math.random() * 0.6, 0.09, 'sine', 0.05);
  }
  flip() {
    if (!this.ok) return;
    const t = this.ac!.currentTime;
    this.nz(t, 0.08, 0.2, 'bandpass', 2200, undefined, 2);
    this.tone(500, t, 0.1, 'triangle', 0.08, 900);
  }
}

/* ---------- confetti and fireworks ---------- */
interface Piece { x: number; y: number; vx: number; vy: number; w: number; h: number; r: number; vr: number; c: string; life: number; max: number; round: boolean; spark?: boolean; fall?: boolean }

class Fx {
  private ctx: CanvasRenderingContext2D | null;
  private pieces: Piece[] = [];
  private frame = 0;
  rain = 0;
  private reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  constructor(private cv: HTMLCanvasElement) {
    this.ctx = cv.getContext('2d');
    this.size();
    this.loop();
  }

  size = () => {
    this.cv.width = innerWidth * devicePixelRatio;
    this.cv.height = innerHeight * devicePixelRatio;
  };

  stop() {
    cancelAnimationFrame(this.frame);
  }

  burst(fx: number, fy: number, n: number, power = 11) {
    if (this.reduce) return;
    const k = devicePixelRatio;
    const x = innerWidth * fx * k;
    const y = innerHeight * fy * k;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (3 + Math.random() * power) * k;
      this.pieces.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 5 * k, w: (6 + Math.random() * 9) * k, h: (4 + Math.random() * 6) * k, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, c: COLORS[i % COLORS.length], life: 0, max: 200 + Math.random() * 80, round: Math.random() < 0.3 });
    }
  }

  firework(fx: number, fy: number) {
    if (this.reduce) return;
    const k = devicePixelRatio;
    const x = innerWidth * fx * k;
    const y = innerHeight * fy * k;
    const c = COLORS[Math.floor(Math.random() * 5)];
    for (let i = 0; i < 70; i++) {
      const a = (i / 70) * Math.PI * 2;
      const sp = (5 + Math.random() * 2) * k;
      this.pieces.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, w: 3 * k, h: 3 * k, r: 0, vr: 0, c, life: 0, max: 90, round: true, spark: true });
    }
  }

  private loop = () => {
    const cx = this.ctx;
    if (cx) {
      const k = devicePixelRatio;
      cx.clearRect(0, 0, this.cv.width, this.cv.height);
      if (this.rain > 0 && !this.reduce) {
        this.rain--;
        if (Math.random() < 0.7) {
          this.pieces.push({ x: Math.random() * this.cv.width, y: -20, vx: (Math.random() - 0.5) * 2 * k, vy: (2 + Math.random() * 3) * k, w: (7 + Math.random() * 8) * k, h: (4 + Math.random() * 5) * k, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3, c: COLORS[Math.floor(Math.random() * 6)], life: 0, max: 600, round: false, fall: true });
        }
      }
      this.pieces = this.pieces.filter((p) => p.life < p.max && p.y < this.cv.height + 60);
      for (const p of this.pieces) {
        p.life++;
        if (p.spark) {
          p.vy += 0.06 * k;
          p.vx *= 0.97;
          p.vy *= 0.97;
        } else if (p.fall) {
          p.vx += Math.sin(p.life / 20) * 0.05 * k;
        } else {
          p.vy += 0.3 * k;
          p.vx *= 0.985;
          p.vy *= 0.985;
        }
        p.x += p.vx;
        p.y += p.vy;
        p.r += p.vr;
        cx.save();
        cx.translate(p.x, p.y);
        cx.rotate(p.r);
        cx.globalAlpha = Math.min(1, (p.max - p.life) / 40);
        cx.fillStyle = p.c;
        if (p.round) {
          cx.beginPath();
          cx.arc(0, 0, p.w / 2, 0, 7);
          cx.fill();
        } else {
          cx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r * 2)) + 1);
        }
        cx.restore();
      }
    }
    this.frame = requestAnimationFrame(this.loop);
  };
}

/* ---------- markup ---------- */
function template(o: CeremonyOptions): string {
  const n = o.winners.length;
  const slots = o.winners
    .map(
      (w) => `<div class="ann-slot ann-r${w.rank}" data-r="${w.rank}">
        <div class="ann-fc ann-bk"><span class="ann-rn">${w.rank}</span><span class="ann-who">? ? ?</span></div>
        <div class="ann-fc ann-fr"><span class="ann-rn">${w.rank <= 3 ? MEDAL[w.rank - 1] : w.rank}</span><span class="ann-who">${esc(w.name)}</span><span class="ann-pts">${pts(w.score)}</span></div>
      </div>`,
    )
    .join('');
  const ped = (r: number) => {
    const w = o.winners[r - 1];
    if (!w) return '';
    return `<div class="ann-ped ann-p${r}" data-r="${r}"><div class="ann-pwho"><b>${esc(w.name)}</b><span>${pts(w.score)} pts</span></div><div class="ann-block"><div class="ann-medal">${MEDAL[r - 1]}</div><div class="ann-place">${r}</div></div></div>`;
  };
  return `
  <div class="ann-beam ann-l"></div><div class="ann-beam ann-rt"></div>
  <header class="ann-head">
    <div class="ann-logos"><img src="/brand/bau-logo.png" alt="Beirut Arab University"><span></span><img src="/brand/open-doors-2026.png" alt="Open Doors 2026"></div>
    <div class="ann-hr"><b>Faculty of Science</b><span class="ann-status">${esc(o.eyebrow)}</span><div class="ann-pips">${'<i></i>'.repeat(n)}</div></div>
  </header>
  <div class="ann-main">
    <section class="ann-view ann-on" data-v="title">
      <div class="ann-eyebrow">${esc(o.eyebrow)}</div>
      <h1>${esc(o.title)}</h1>
      <p>${esc(o.subtitle)}</p>
      <div class="ann-press">Press <kbd>Space</kbd> to start</div>
    </section>
    <section class="ann-view" data-v="rank">
      <div class="ann-label">In place number</div>
      <div class="ann-no">9</div>
      <div class="ann-reel"><div class="ann-nm ann-q">? ? ?</div></div>
      <div class="ann-score">0<small>PTS</small></div>
    </section>
    <section class="ann-view ann-podview" data-v="pod">
      <div class="ann-podtop">
        <div class="ann-podhead">The Top 3</div>
        <div class="ann-reel"><div class="ann-nm ann-q">? ? ?</div></div>
        <div class="ann-score">0<small>PTS</small></div>
      </div>
      <div class="ann-podium">${ped(2)}${ped(1)}${ped(3)}</div>
    </section>
    <section class="ann-view" data-v="fin">
      <div class="ann-eyebrow">Congratulations</div>
      <h2>Your <em>champions!</em></h2>
      <p>Thank you to everyone who played at the Faculty of Science booth.</p>
      <div class="ann-trio">${[2, 1, 3]
        .map((r) => o.winners[r - 1])
        .filter(Boolean)
        .map((w) => `<div class="ann-tcard ann-c${w.rank}"><div class="ann-m">${MEDAL[w.rank - 1]}</div><b>${esc(w.name)}</b><span>${pts(w.score)} pts</span></div>`)
        .join('')}</div>
    </section>
  </div>
  <aside class="ann-wall"><h3><span>Wall of fame</span><span class="ann-cnt">0 / ${n}</span></h3><div class="ann-slots">${slots}</div></aside>
  <div class="ann-flash"></div>
  <canvas class="ann-fx"></canvas>
  <div class="ann-ctl"><button type="button" data-a="back">← Back</button><button type="button" data-a="next">Next (Space)</button><button type="button" data-a="fs">Fullscreen (F)</button><button type="button" data-a="snd">Sound on (M)</button><button type="button" data-a="exit">Exit (Esc)</button></div>`;
}

/** Builds the ceremony inside `root`. Returns a function that removes every listener and timer. */
export function mountCeremony(root: HTMLElement, o: CeremonyOptions, onExit: () => void): () => void {
  root.innerHTML = template(o);
  const $ = <T extends Element = HTMLElement>(sel: string) => root.querySelector(sel) as T;
  const $$ = <T extends Element = HTMLElement>(sel: string) => Array.from(root.querySelectorAll(sel)) as T[];
  const sound = new Sound();
  const fx = new Fx($<HTMLCanvasElement>('.ann-fx'));
  addEventListener('resize', fx.size);

  const n = o.winners.length;
  const top = Math.min(3, n);
  const steps: Step[] = [{ t: 'title' }];
  for (let r = n; r > 3; r--) steps.push({ t: 'rank', r });
  if (top > 0) steps.push({ t: 'podium' });
  for (let r = top; r >= 1; r--) steps.push({ t: 'pod', r });
  steps.push({ t: 'fin' });

  let step = 0;
  let busy: (() => void) | null = null;
  let timers: number[] = [];
  const later = (f: () => void, ms: number) => timers.push(window.setTimeout(f, ms));
  const clearT = () => {
    timers.forEach(clearTimeout);
    timers = [];
    busy = null;
  };
  const winner = (r: number) => o.winners[r - 1];

  function showView(v: string) {
    $$('.ann-view').forEach((el) => el.classList.toggle('ann-on', el.dataset.v === v));
  }
  function revealedUpTo(si: number) {
    const out: number[] = [];
    for (let i = 1; i <= si; i++) {
      const s = steps[i];
      if ('r' in s) out.push(s.r);
    }
    return out;
  }
  function paintCount() {
    const k = $$('.ann-slot.ann-won').length;
    $('.ann-cnt').textContent = `${k} / ${n}`;
    $$('.ann-pips i').forEach((p, i) => p.classList.toggle('ann-on', i < k));
  }
  function paintStatic(si: number, skipCurrent: boolean) {
    const rev = revealedUpTo(si);
    const cur = steps[si];
    const shown = (r: number) => rev.includes(r) && !(skipCurrent && 'r' in cur && cur.r === r);
    $$('.ann-slot').forEach((s) => s.classList.toggle('ann-won', shown(Number(s.dataset.r))));
    $$('.ann-ped').forEach((p) => {
      p.classList.toggle('ann-won', shown(Number(p.dataset.r)));
      p.classList.remove('ann-lit');
    });
    paintCount();
  }
  function setReel(el: HTMLElement, txt: string, cls = '') {
    el.innerHTML = `<div class="ann-nm ${cls}">${esc(txt)}</div>`;
  }
  function flash() {
    const f = $('.ann-flash');
    f.classList.remove('ann-go');
    void f.offsetWidth;
    f.classList.add('ann-go');
  }
  function pop(el: HTMLElement) {
    el.classList.remove('ann-pop');
    void el.offsetWidth;
    el.classList.add('ann-pop');
  }

  function land(r: number, reel: HTMLElement, sc: HTMLElement, anim: boolean) {
    const w = winner(r);
    setReel(reel, w.name);
    reel.classList.add('ann-landed');
    const slot = $(`.ann-slot[data-r="${r}"]`);
    const ped = root.querySelector<HTMLElement>(`.ann-ped[data-r="${r}"]`);
    sc.classList.add('ann-on');
    if (!anim) {
      sc.innerHTML = `${pts(w.score)}<small>PTS</small>`;
      slot.classList.add('ann-won');
      ped?.classList.add('ann-won');
      paintCount();
      return;
    }
    sound.land(r <= 3);
    flash();
    const big = r === 1;
    fx.burst(0.36, 0.42, big ? 260 : r <= 3 ? 160 : 90, big ? 16 : 12);
    if (big) {
      fx.rain = 700;
      sound.fanfare();
      later(() => sound.applause(4), 600);
      [700, 1300, 1900, 2600, 3300].forEach((d) => later(() => fx.firework(0.12 + Math.random() * 0.55, 0.15 + Math.random() * 0.3), d));
    } else if (r <= 3) {
      later(() => sound.applause(2.2), 300);
      later(() => fx.firework(0.3, 0.25), 500);
    } else {
      sound.sparkle(10);
    }
    const t0 = performance.now();
    let lc = 0;
    const count = (now: number) => {
      const p = Math.min(1, (now - t0) / 600);
      const e = 1 - Math.pow(1 - p, 3);
      sc.innerHTML = `${pts(Math.round(w.score * e))}<small>PTS</small>`;
      if (now - lc > 40) {
        lc = now;
        sound.count(e);
      }
      if (p < 1) requestAnimationFrame(count);
    };
    requestAnimationFrame(count);
    later(() => {
      sound.flip();
      slot.classList.add('ann-won', 'ann-flashslot');
      later(() => slot.classList.remove('ann-flashslot'), 1300);
      paintCount();
    }, 400);
    if (ped) later(() => ped.classList.add('ann-won'), 400);
  }

  function spin(r: number, reel: HTMLElement, sc: HTMLElement, dur: number) {
    const target = winner(r).name;
    const pool = o.pool.filter((name) => name !== target);
    if (pool.length === 0) pool.push('? ? ?');
    sound.drumroll(dur / 1000);
    const t0 = performance.now();
    let last = '';
    busy = () => {
      clearT();
      land(r, reel, sc, true);
    };
    const tick = () => {
      const p = (performance.now() - t0) / dur;
      if (p >= 1) {
        busy = null;
        land(r, reel, sc, true);
        return;
      }
      let name: string;
      do name = pool[Math.floor(Math.random() * pool.length)];
      while (name === last && pool.length > 1);
      last = name;
      setReel(reel, name, 'ann-spin');
      sound.tick(p);
      timers.push(window.setTimeout(tick, 40 + Math.pow(p, 2.4) * 230));
    };
    tick();
  }

  function render(si: number, animate: boolean) {
    clearT();
    step = si;
    const s = steps[si];
    root.classList.remove('ann-focus');
    fx.rain = 0;
    paintStatic(si, animate);
    $('.ann-status').textContent =
      s.t === 'title' ? o.eyebrow : s.t === 'fin' ? 'All winners revealed' : 'r' in s ? `Revealing ${ord(s.r)} place` : 'The podium';
    if (s.t === 'title') {
      showView('title');
      return;
    }
    if (s.t === 'rank') {
      showView('rank');
      const no = $('.ann-no');
      no.textContent = String(s.r);
      pop(no);
      const reel = $('[data-v="rank"] .ann-reel');
      const sc = $('[data-v="rank"] .ann-score');
      reel.classList.remove('ann-landed');
      sc.classList.remove('ann-on');
      if (!animate) return land(s.r, reel, sc, false);
      setReel(reel, '? ? ?', 'ann-q');
      sound.boom();
      later(() => spin(s.r, reel, sc, 1500), 350);
      return;
    }
    const head = $('.ann-podhead');
    const reel = $('[data-v="pod"] .ann-reel');
    const sc = $('[data-v="pod"] .ann-score');
    reel.classList.remove('ann-landed');
    sc.classList.remove('ann-on');
    if (s.t === 'podium') {
      showView('pod');
      head.textContent = 'The Top 3';
      pop(head);
      setReel(reel, '? ? ?', 'ann-q');
      if (animate) {
        sound.whoosh();
        later(() => {
          sound.boom();
          fx.burst(0.38, 0.75, 60, 8);
        }, 300);
      }
      return;
    }
    if (s.t === 'pod') {
      showView('pod');
      const label = { 3: '🥉 Third place', 2: '🥈 Second place', 1: '🥇 The champion' }[s.r] ?? '';
      head.textContent = label;
      pop(head);
      reel.dataset.place = String(s.r);
      $$('.ann-ped').forEach((p) => p.classList.toggle('ann-lit', Number(p.dataset.r) === s.r));
      if (!animate) return land(s.r, reel, sc, false);
      setReel(reel, '? ? ?', 'ann-q');
      root.classList.add('ann-focus');
      if (s.r === 1) {
        head.textContent = 'And the champion is…';
        sound.heartbeat(2);
        later(() => {
          head.textContent = label;
          pop(head);
          sound.boom();
          spin(1, reel, sc, 2800);
        }, 1300);
      } else {
        sound.boom();
        later(() => spin(s.r, reel, sc, 2100), 350);
      }
      return;
    }
    showView('fin');
    if (animate) {
      sound.fanfare();
      fx.rain = 900;
      [0, 600, 1200, 1800, 2600].forEach((d) => later(() => fx.firework(0.15 + Math.random() * 0.5, 0.2 + Math.random() * 0.3), d));
      later(() => sound.applause(4), 1300);
    }
  }

  function next() {
    sound.start();
    if (busy) return busy();
    if (step < steps.length - 1) render(step + 1, true);
  }
  function back() {
    if (step > 0) render(step - 1, false);
  }
  function fullscreen() {
    const d = document.documentElement;
    try {
      if (!document.fullscreenElement) void d.requestFullscreen?.().catch(() => {});
      else void document.exitFullscreen?.();
    } catch {
      // Fullscreen is optional.
    }
  }
  function toggleSound() {
    sound.on = !sound.on;
    $('[data-a="snd"]').textContent = sound.on ? 'Sound on (M)' : 'Sound off (M)';
  }

  const onClick = (e: MouseEvent) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-a]');
    if (!btn) return next();
    const a = btn.dataset.a;
    if (a === 'next') next();
    else if (a === 'back') back();
    else if (a === 'fs') fullscreen();
    else if (a === 'snd') toggleSound();
    else if (a === 'exit') onExit();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === ' ' || e.key === 'ArrowRight' || e.key === 'Enter' || e.key === 'PageDown') {
      e.preventDefault();
      next();
    } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') back();
    else if (e.key === 'f' || e.key === 'F') fullscreen();
    else if (e.key === 'm' || e.key === 'M') toggleSound();
    else if (e.key === 'Escape') onExit();
  };
  let idle = 0;
  const wake = () => {
    root.classList.remove('ann-idle');
    clearTimeout(idle);
    idle = window.setTimeout(() => root.classList.add('ann-idle'), 2500);
  };
  root.addEventListener('click', onClick);
  addEventListener('keydown', onKey);
  addEventListener('mousemove', wake);
  wake();
  render(0, false);

  return () => {
    clearT();
    clearTimeout(idle);
    root.removeEventListener('click', onClick);
    removeEventListener('keydown', onKey);
    removeEventListener('mousemove', wake);
    removeEventListener('resize', fx.size);
    fx.stop();
    sound.close();
    root.innerHTML = '';
  };
}
