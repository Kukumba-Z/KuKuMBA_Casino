// KuKuMBA Plinko — canvas visualizer (framework-agnostic, canvas + WebAudio).
// The engine is a pure PRESENTER: every ruble of truth comes from the plinko
// API (apps/api/src/modules/games/plinko). The server rolls the provably-fair
// left/right path and the landing slot; drop(path, slot, mult) just animates
// the exact ball the server already resolved, so what you watch is what settled.
//
// The board geometry is an exact Galton board: at pin-row i the ball hits the
// pin at column (rights-so-far + 1) head-on, then deflects per path[i]; after
// `rows` deflections it rests in slot = total rights — dead-centre of the slot
// the server computed. Edges are rare (binomial), which is why they pay big.
// @ts-nocheck

export interface PlinkoSlot {
  mult: number;
  label: string;
}
export interface PlinkoDropInfo {
  slot: number;
  mult: number;
  win: boolean;
  big: boolean;
  /** Whatever the page attached to this drop (e.g. its server payout/round id). */
  meta?: any;
}
export interface PlinkoEngineOptions {
  onLand?: (info: PlinkoDropInfo) => void;
  onEvent?: (name: string, data?: any) => void;
  texts?: { idle?: string };
}

const C = {
  night: '#0E0B1A',
  ink: '#0B0817',
  lav: '#B79CED',
  bubble: '#FF8FD0',
  mint: '#7EE7C7',
  sky: '#7CC4FF',
  sun: '#FFD86E',
  red: '#E5484D',
  outline: '#191430',
  // Neon cyan/mint ball — reads brightest against the deep purple board.
  neon: '#45E3F5',
  neonRim: '#1E9FC4',
  neonGlow: 'rgba(90,232,255,',
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);

/** Colour a slot by its multiplier — a smooth neon heat map that runs cool in
 *  the centre (small pays) to hot at the edges (big pays): indigo → blue → mint
 *  → gold → orange → pink → red. Mirrors the "жар по краям" feel of the board. */
function slotColor(m: number): string {
  if (m < 1) return '#6C7BE0'; // cool periwinkle — the tiny centre pays
  if (m < 1.5) return C.sky; // blue
  if (m < 3) return C.mint; // mint
  if (m < 12) return C.sun; // gold
  if (m < 60) return '#FF9F5C'; // orange
  if (m < 200) return C.bubble; // hot pink
  return C.red; // molten red — the monster edges
}

/** Format a multiplier for the slot/label. The server sends CLEAN multipliers
 *  (whole numbers ≥100, ≤2 decimals below), and the payout is exactly
 *  `stake × this value`, so we show it faithfully (trailing zeros stripped) —
 *  what you see is what you're paid, no mystery sub-cent dust. */
export function fmtMult(m: number): string {
  if (m >= 100) return String(Math.round(m));
  return String(Math.round(m * 100) / 100);
}

// ── tiny WebAudio kit: peg plinks (pitch rises with depth) + win/lose stings ──
class PlinkoSound {
  ctx: AudioContext | null = null;
  on = true;
  master: GainNode | null = null;
  ensure() {
    if (this.ctx) return;
    try {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AC();
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -12;
      comp.ratio.value = 8;
      comp.connect(this.ctx.destination);
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.85;
      this.master.connect(comp);
    } catch {
      this.ctx = null;
    }
  }
  resume() {
    this.ensure();
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
  }
  setOn(v: boolean) {
    this.on = v;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(v ? 0.85 : 0, this.ctx.currentTime, 0.02);
  }
  private blip(freq, dur, { type = 'sine', gain = 0.16, at = 0, slideTo }: any = {}) {
    if (!this.ctx || !this.master) return;
    const t0 = this.ctx.currentTime + at;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(this.master);
    o.start(t0);
    o.stop(t0 + dur + 0.03);
  }
  /** The bet cue — a short downward "drop" whoosh when the ball is released. */
  bet() {
    if (!this.on) return;
    this.resume();
    if (!this.ctx || document.hidden) return;
    this.blip(680, 0.14, { type: 'sine', gain: 0.13, slideTo: 320 });
  }
  win(big: boolean) {
    if (!this.on) return;
    this.resume();
    if (!this.ctx || document.hidden) return;
    const notes = big ? [523.25, 659.25, 783.99, 1046.5, 1318.51, 1567.98] : [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, i) => this.blip(f, 0.2, { type: 'triangle', gain: 0.16, at: i * 0.075 }));
  }
  lose() {
    if (!this.on) return;
    this.resume();
    if (!this.ctx || document.hidden) return;
    this.blip(300, 0.28, { type: 'sine', gain: 0.12, slideTo: 150 });
  }
}

export class PlinkoEngine {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  onLand: (info: PlinkoDropInfo) => void;
  onEvent: (name: string, data?: any) => void;
  sound: PlinkoSound;
  texts: { idle: string };

  W = 0;
  H = 0;
  dpr = 1;
  rows = 8;
  slots: PlinkoSlot[] = [];
  fast = false;

  // layout
  cx = 0;
  topPad = 0;
  rowH = 0;
  gap = 0; // horizontal pin spacing
  pinR = 3;
  ballR = 8;
  slotTop = 0;
  slotH = 30;

  pins: { x: number; y: number; flash: number }[][] = [];
  slotFlash: number[] = [];
  balls: any[] = [];
  particles: any[] = [];
  confetti: any[] = [];
  shake = 0;
  last = 0;
  raf = 0;
  private _ro: ResizeObserver;
  private _onVis: () => void;

  constructor(canvas: HTMLCanvasElement, opts: PlinkoEngineOptions = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.onLand = opts.onLand || (() => {});
    this.onEvent = opts.onEvent || (() => {});
    this.sound = new PlinkoSound();
    this.texts = { idle: 'Урони шар, чтобы начать', ...(opts.texts || {}) };
    this._ro = new ResizeObserver(() => this.resize());
    this._ro.observe(canvas.parentElement || canvas);
    this.resize();
    this._onVis = () => {
      const actx = this.sound.ctx;
      if (!actx) return;
      if (document.hidden && actx.state === 'running') actx.suspend();
      else if (!document.hidden && actx.state === 'suspended') void actx.resume();
    };
    document.addEventListener('visibilitychange', this._onVis);
  }

  start() {
    if (this.raf) return;
    this.last = performance.now();
    this.loop(this.last);
  }
  destroy() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this._ro.disconnect();
    document.removeEventListener('visibilitychange', this._onVis);
  }
  resumeAudio() {
    this.sound.resume();
  }
  setSound(v: boolean) {
    this.sound.setOn(v);
  }
  setFast(v: boolean) {
    this.fast = !!v;
  }
  setTexts(t: any) {
    this.texts = { ...this.texts, ...(t || {}) };
  }

  /** Rebuild the board when the player changes risk/rows (payout table + geometry). */
  setConfig(rows: number, slots: PlinkoSlot[]) {
    this.rows = clamp(Math.round(rows), 8, 16);
    this.slots = slots && slots.length === this.rows + 1 ? slots : this.slots;
    this.slotFlash = new Array(this.rows + 1).fill(0);
    this.layout();
  }

  resize() {
    const r = (this.canvas.parentElement || this.canvas).getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.W = Math.max(300, r.width);
    this.H = Math.max(300, r.height);
    this.canvas.width = Math.round(this.W * this.dpr);
    this.canvas.height = Math.round(this.H * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.layout();
  }

  /** Compute pin grid + slot geometry for the current size/rows. */
  private layout() {
    const rows = this.rows;
    this.slotH = clamp(this.H * 0.1, 20, 38);
    const basePad = clamp(this.H * 0.04, 10, 22);
    const gridH = this.H - this.slotH - basePad * 2;
    // Horizontal pin spacing fits the widest (bottom) row within side margins.
    const usableW = this.W * 0.94;
    this.gap = usableW / (rows + 1);
    // The vertical row pitch never exceeds the horizontal spacing, so many-pin
    // boards (16 pins especially) stay proportional instead of stretching tall;
    // whatever vertical space is left over is used to centre the board.
    this.rowH = Math.min(gridH / rows, this.gap * 1.04);
    this.pinR = clamp(this.gap * 0.12, 2, 5);
    this.ballR = clamp(this.gap * 0.3, 5, 12);
    this.cx = this.W / 2;
    const boardH = rows * this.rowH + this.slotH;
    this.topPad = clamp((this.H - boardH) * 0.5, basePad, this.H);
    this.slotTop = this.topPad + rows * this.rowH + 2;

    // Pins: row i has i+3 pins, centred (top row = 3 pins, like the reference).
    this.pins = [];
    for (let i = 0; i < rows; i++) {
      const count = i + 3;
      const y = this.topPad + i * this.rowH;
      const row: { x: number; y: number; flash: number }[] = [];
      for (let j = 0; j < count; j++) {
        row.push({ x: this.cx + (j - (count - 1) / 2) * this.gap, y, flash: 0 });
      }
      this.pins.push(row);
    }
    if (this.slotFlash.length !== rows + 1) this.slotFlash = new Array(rows + 1).fill(0);
  }

  /** X-centre of slot s (0..rows). */
  private slotX(s: number) {
    return this.cx + (s - this.rows / 2) * this.gap;
  }

  /**
   * Animate the server-resolved drop. `path[i]` = true means the ball went RIGHT
   * off pin-row i; the landing slot is the count of rights (== `slot`).
   */
  drop(path: boolean[], slot: number, mult: number, meta?: any) {
    this.resumeAudio();
    this.sound.bet(); // sound only on the bet + on landing — nothing in between
    const rows = this.rows;
    let rights = 0;
    for (let i = 0; i < rows; i++) if (path[i]) rights++;
    const landSlot = clamp(rights, 0, rows);
    const win = mult >= 1;
    // Big-win effects (confetti + shake) are reserved for the monster edges only.
    const huge = mult > 100;

    // Turbo/quick play: no flying ball — the winning slot just bounces at once.
    if (this.fast) {
      this.slotFlash[landSlot] = 1;
      if (win) this.sound.win(huge);
      else this.sound.lose();
      if (huge) {
        this.shake = 1;
        this.burstConfetti();
        this.spark(this.slotX(landSlot), this.slotTop + 2, slotColor(mult), 18, 1.6);
      }
      this.onLand({ slot: landSlot, mult, win, big: huge, meta });
      return;
    }

    // Build the exact contact polyline (Galton coordinates).
    const pts: { x: number; y: number }[] = [];
    // entry, just above row 0 (kept on-canvas even when the board is centred)
    pts.push({ x: this.cx, y: this.topPad - Math.min(this.rowH * 0.85, this.topPad - 2) });
    rights = 0;
    for (let i = 0; i < rows; i++) {
      const x = this.cx + (2 * rights - i) * (this.gap / 2);
      pts.push({ x, y: this.topPad + i * this.rowH });
      // which pin (column) this row's contact lands on — for the flash
      const col = rights + 1;
      pts[pts.length - 1].col = col;
      pts[pts.length - 1].rowIdx = i;
      if (path[i]) rights++;
    }
    pts.push({ x: this.slotX(landSlot), y: this.slotTop + this.slotH * 0.5 }); // land
    // Slow, thrilling fall — the ball beats hard side-to-side down the pins.
    const segMs = 200;
    this.balls.push({
      pts,
      seg: 0, // current segment index
      t: 0, // 0..1 within segment
      segMs,
      slot: landSlot,
      mult,
      win,
      huge,
      x: pts[0].x,
      y: pts[0].y,
      squash: 0,
      trail: [],
      done: false,
      meta,
    });
  }

  private spark(x, y, color, n = 8, spread = 1) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2);
      const sp = rand(0.4, 2.2) * spread;
      this.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 0.6, life: 1, color, r: rand(1, 2.6) });
    }
  }
  private burstConfetti() {
    const cols = [C.lav, C.bubble, C.mint, C.sky, C.sun];
    for (let i = 0; i < 64; i++) {
      this.confetti.push({
        x: rand(this.W * 0.2, this.W * 0.8),
        y: rand(-20, this.H * 0.3),
        vx: rand(-1.6, 1.6),
        vy: rand(1.2, 4),
        rot: rand(0, Math.PI),
        vr: rand(-0.3, 0.3),
        w: rand(4, 8),
        h: rand(6, 12),
        color: cols[(Math.random() * cols.length) | 0],
        life: 1,
      });
    }
  }

  private loop = (now: number) => {
    const dt = Math.min(50, now - this.last);
    this.last = now;
    this.update(dt);
    this.render();
    this.raf = requestAnimationFrame(this.loop);
  };

  private update(dt: number) {
    // pins fade
    for (const row of this.pins) for (const p of row) p.flash = Math.max(0, p.flash - dt / 220);
    for (let s = 0; s < this.slotFlash.length; s++) this.slotFlash[s] = Math.max(0, this.slotFlash[s] - dt / 380);
    this.shake = Math.max(0, this.shake - dt / 260);

    // balls
    for (const b of this.balls) {
      if (b.done) continue;
      b.squash = Math.max(0, b.squash - dt / 160);
      b.t += dt / b.segMs;
      while (b.t >= 1 && b.seg < b.pts.length - 1) {
        b.t -= 1;
        b.seg++;
        const p = b.pts[b.seg];
        b.x = p.x;
        b.y = p.y;
        b.squash = 1;
        if (b.seg < b.pts.length - 1) {
          // hit a pin — just a quiet flash (no spark clutter, no peg clicks)
          if (p.rowIdx != null && this.pins[p.rowIdx] && this.pins[p.rowIdx][p.col]) {
            this.pins[p.rowIdx][p.col].flash = 1;
          }
        } else {
          this.land(b);
        }
      }
      if (b.seg >= b.pts.length - 1) {
        b.done = true;
        continue;
      }
      const a = b.pts[b.seg];
      const c = b.pts[b.seg + 1];
      const tt = clamp(b.t, 0, 1);
      const ease = tt * tt * (3 - 2 * tt); // smoothstep along the contact line
      // Lateral sway: the ball bulges out in its travel direction mid-hop —
      // nearly a full pin over — so it visibly whips side-to-side down the board
      // (a run of same-direction bounces reads as "racing toward the edge", a
      // late reversal as the last-second cut back). Endpoints stay server-exact.
      const dir = Math.sign(c.x - a.x);
      const sway = dir * this.gap * 0.6 * Math.sin(Math.PI * tt);
      b.x = clamp(lerp(a.x, c.x, ease) + sway, this.ballR, this.W - this.ballR);
      // tall springy bounce arc between contacts
      const hop = this.rowH * 0.5;
      b.y = lerp(a.y, c.y, tt) - Math.sin(Math.PI * tt) * hop;
      // neon trail — a touch longer so the slow arc glows
      b.trail.push({ x: b.x, y: b.y, life: 1 });
      if (b.trail.length > 20) b.trail.shift();
      for (const tr of b.trail) tr.life -= dt / 300;
    }
    this.balls = this.balls.filter((b) => !(b.done && b.trail.every((t) => t.life <= 0)));

    // particles
    for (const p of this.particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.12;
      p.life -= dt / 520;
    }
    this.particles = this.particles.filter((p) => p.life > 0);

    // confetti
    for (const c of this.confetti) {
      c.x += c.vx;
      c.y += c.vy;
      c.vy += 0.05;
      c.rot += c.vr;
      c.life -= dt / 2600;
    }
    this.confetti = this.confetti.filter((c) => c.life > 0 && c.y < this.H + 30);
  }

  private land(b) {
    this.slotFlash[b.slot] = 1;
    // Kill the trail and retire the ball the instant it lands — nothing lingers
    // in the slot (no residual shimmer, no floating "×" pop).
    b.trail.length = 0;
    b.done = true;
    if (b.win) {
      this.sound.win(b.huge);
      // Big-win spectacle (confetti + shake + spark) is reserved for ×>100 only.
      if (b.huge) {
        this.shake = 1;
        this.burstConfetti();
        this.spark(b.x, this.slotTop + 2, slotColor(b.mult), 18, 1.6);
      }
    } else {
      this.sound.lose();
    }
    this.onLand({ slot: b.slot, mult: b.mult, win: b.win, big: b.huge, meta: b.meta });
  }

  // ── rendering ────────────────────────────────────────────────────────────
  private render() {
    const ctx = this.ctx;
    ctx.save();
    if (this.shake > 0) {
      const s = this.shake * 5;
      ctx.translate(rand(-s, s), rand(-s, s));
    }
    // background
    const g = ctx.createLinearGradient(0, 0, 0, this.H);
    g.addColorStop(0, '#1a1533');
    g.addColorStop(0.55, '#120e26');
    g.addColorStop(1, C.ink);
    ctx.fillStyle = g;
    ctx.fillRect(-8, -8, this.W + 16, this.H + 16);

    // soft holo glow spots
    this.glowSpot(this.W * 0.2, this.H * 0.15, this.W * 0.4, 'rgba(124,196,255,0.10)');
    this.glowSpot(this.W * 0.85, this.H * 0.25, this.W * 0.4, 'rgba(255,143,208,0.10)');

    this.drawSlots(ctx);
    this.drawPins(ctx);
    this.drawParticles(ctx);
    this.drawBalls(ctx);
    this.drawConfetti(ctx);

    // idle hint when nothing is dropping
    if (this.balls.length === 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.30)';
      ctx.font = `600 ${clamp(this.W * 0.03, 12, 15)}px Onest, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(this.texts.idle, this.cx, this.topPad + this.rowH * 0.05);
    }
    ctx.restore();
  }

  private glowSpot(x, y, r, color) {
    const ctx = this.ctx;
    const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, color);
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, this.W, this.H);
  }

  private drawPins(ctx) {
    for (const row of this.pins) {
      for (const p of row) {
        if (p.flash > 0) {
          ctx.beginPath();
          ctx.fillStyle = `rgba(183,156,237,${0.35 * p.flash})`;
          ctx.arc(p.x, p.y, this.pinR + 4 + p.flash * 3, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.beginPath();
        ctx.fillStyle = p.flash > 0 ? '#EDE7FF' : 'rgba(214,208,242,0.85)';
        ctx.arc(p.x, p.y, this.pinR, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  private drawSlots(ctx) {
    const n = this.rows + 1;
    const w = this.gap * 0.9;
    const h = this.slotH;
    const y = this.slotTop;
    const r = Math.min(9, w * 0.26);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const fs = clamp(w * 0.42, 8, 15);
    ctx.font = `800 ${fs}px Unbounded, system-ui, sans-serif`;
    for (let s = 0; s < n; s++) {
      const x = this.slotX(s) - w / 2;
      const color = slotColor(this.slots[s]?.mult ?? 1);
      const flash = this.slotFlash[s];
      const lift = flash * 6; // springier bounce when a ball lands here
      const top = y - lift;
      // glossy body — light sheen on top, deep base below
      const grad = ctx.createLinearGradient(0, top, 0, top + h);
      grad.addColorStop(0, this.shade(color, 0.22));
      grad.addColorStop(0.5, color);
      grad.addColorStop(1, this.shade(color, -0.42));
      ctx.fillStyle = grad;
      this.roundRect(ctx, x, top, w, h, r);
      ctx.fill();
      // top-edge highlight for a soft neon-plastic feel
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      this.roundRect(ctx, x + w * 0.12, top + 1.5, w * 0.76, Math.max(2, h * 0.16), r * 0.5);
      ctx.fill();
      if (flash > 0) {
        ctx.save();
        ctx.shadowColor = color;
        ctx.shadowBlur = 26 * flash;
        ctx.fillStyle = 'rgba(255,255,255,0.001)';
        this.roundRect(ctx, x, top, w, h, r);
        ctx.fill();
        ctx.restore();
      }
      // label — dark for readable contrast on the bright slot
      ctx.fillStyle = this.shade(color, -0.78);
      ctx.fillText(fmtMult(this.slots[s]?.mult ?? 1), this.slotX(s), top + h / 2 + 1);
    }
  }

  private drawBalls(ctx) {
    for (const b of this.balls) {
      // neon trail — additive cyan wisp fading behind the ball (glows, not muddy)
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const tr of b.trail) {
        if (tr.life <= 0) continue;
        ctx.beginPath();
        ctx.fillStyle = `${C.neonGlow}${(0.14 * tr.life).toFixed(3)})`;
        ctx.arc(tr.x, tr.y, this.ballR * (0.38 + 0.5 * tr.life), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      const sq = b.squash;
      const rx = this.ballR * (1 + sq * 0.22);
      const ry = this.ballR * (1 - sq * 0.26);
      // glowing neon sphere
      ctx.save();
      ctx.shadowColor = `${C.neonGlow}0.85)`;
      ctx.shadowBlur = 16;
      const grad = ctx.createRadialGradient(b.x - rx * 0.32, b.y - ry * 0.4, rx * 0.1, b.x, b.y, rx);
      grad.addColorStop(0, '#FFFFFF');
      grad.addColorStop(0.32, '#C6F6FF');
      grad.addColorStop(0.72, C.neon);
      grad.addColorStop(1, C.neonRim);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(b.x, b.y, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      // crisp rim
      ctx.lineWidth = 1.1;
      ctx.strokeStyle = 'rgba(255,255,255,0.4)';
      ctx.beginPath();
      ctx.ellipse(b.x, b.y, rx, ry, 0, 0, Math.PI * 2);
      ctx.stroke();
      // specular highlight — the glossy catch-light
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      ctx.ellipse(b.x - rx * 0.33, b.y - ry * 0.38, rx * 0.22, ry * 0.16, -0.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawParticles(ctx) {
    for (const p of this.particles) {
      ctx.globalAlpha = clamp(p.life, 0, 1);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  private drawConfetti(ctx) {
    for (const c of this.confetti) {
      ctx.save();
      ctx.globalAlpha = clamp(c.life, 0, 1);
      ctx.translate(c.x, c.y);
      ctx.rotate(c.rot);
      ctx.fillStyle = c.color;
      ctx.fillRect(-c.w / 2, -c.h / 2, c.w, c.h);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  // ── small canvas helpers ──────────────────────────────────────────────────
  private roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  private shade(hex: string, amt: number) {
    const h = hex.replace('#', '');
    let r = parseInt(h.slice(0, 2), 16);
    let g = parseInt(h.slice(2, 4), 16);
    let b = parseInt(h.slice(4, 6), 16);
    const f = (v) => clamp(Math.round(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt), 0, 255);
    r = f(r);
    g = f(g);
    b = f(b);
    return `rgb(${r},${g},${b})`;
  }
}
