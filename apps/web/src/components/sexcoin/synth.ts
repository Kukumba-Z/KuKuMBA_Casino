// Sexcoin audio — Web Audio synthesis only (no binary assets, design rule).
// Modelled on the crash engine's Synth: own AudioContext behind a limiter,
// a generated impulse response for a light reverb, one shared noise buffer,
// and a lookahead step-scheduler for the background loop.
//
// The music is a boudoir-lounge groove at ~76 BPM: a warm sub bass (sine plus
// a soft lowpassed saw), hushed minor7/9 chords on detuned oscillators with a
// slowly breathing lowpass, breathy bandpass-noise pads and sparse brush
// percussion. Intensity follows the streak (like the crash tiers): the filter
// opens, the tempo creeps up and the percussion thickens as the run deepens.

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const hash = (n: number) => {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};

// A2-rooted i – iv – VI – V7♭9: Am9, Dm9, Fmaj9, E7♭9 (hushed jazz minor).
const BARS: Array<{ root: number; chord: number[] }> = [
  { root: 110.0, chord: [261.63, 329.63, 392.0, 493.88] },
  { root: 73.42, chord: [174.61, 220.0, 261.63, 329.63] },
  { root: 87.31, chord: [220.0, 261.63, 329.63, 392.0] },
  { root: 82.41, chord: [207.65, 246.94, 293.66, 349.23] },
];

interface ToneOpts {
  type?: OscillatorType;
  gain?: number;
  attack?: number;
  filter?: number;
  q?: number;
  detune?: number;
  slide?: number;
  dest?: AudioNode;
}

export class SexcoinSynth {
  private ctx: AudioContext | null = null;
  private on = true;
  private master: GainNode | null = null;
  private comp: DynamicsCompressorNode | null = null;
  private mus: GainNode | null = null;
  private musLP: BiquadFilterNode | null = null;
  private sfxBus: GainNode | null = null;
  private conv: ConvolverNode | null = null;
  private nbuf: AudioBuffer | null = null;
  private playing = false;
  private step = 0;
  private abs = 0;
  private next = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private tempo = 76;
  private intensity = 0;
  private onVis = () => {
    if (!this.ctx) return;
    if (document.hidden) {
      if (this.ctx.state === 'running') void this.ctx.suspend();
    } else if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
  };

  private ensure() {
    if (this.ctx) return;
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    // master -> limiter -> destination (the limiter kills clip-crackle)
    this.comp = this.ctx.createDynamicsCompressor();
    this.comp.threshold.value = -16;
    this.comp.knee.value = 24;
    this.comp.ratio.value = 10;
    this.comp.attack.value = 0.003;
    this.comp.release.value = 0.24;
    this.comp.connect(this.ctx.destination);
    this.master = this.ctx.createGain();
    this.master.gain.value = this.on ? 0.8 : 0;
    this.master.connect(this.comp);
    // music bus with a slowly breathing lowpass
    this.mus = this.ctx.createGain();
    this.mus.gain.value = 0.5;
    this.musLP = this.ctx.createBiquadFilter();
    this.musLP.type = 'lowpass';
    this.musLP.frequency.value = 2400;
    this.musLP.Q.value = 0.4;
    this.mus.connect(this.musLP);
    this.musLP.connect(this.master);
    // light generated-impulse reverb, fed by the music bus + a touch of sfx
    const len = Math.floor(this.ctx.sampleRate * 1.8);
    const imp = this.ctx.createBuffer(2, len, this.ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = imp.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.4);
    }
    this.conv = this.ctx.createConvolver();
    this.conv.buffer = imp;
    const wet = this.ctx.createGain();
    wet.gain.value = 0.16;
    this.mus.connect(this.conv);
    this.conv.connect(wet);
    wet.connect(this.master);
    // sfx bus (dry, plus a whisper into the reverb)
    this.sfxBus = this.ctx.createGain();
    this.sfxBus.gain.value = 0.9;
    this.sfxBus.connect(this.master);
    const sfxSend = this.ctx.createGain();
    sfxSend.gain.value = 0.08;
    this.sfxBus.connect(sfxSend);
    sfxSend.connect(this.conv);
    // one shared noise buffer for pads / percussion / the flip whoosh
    const nl = Math.floor(this.ctx.sampleRate * 2);
    this.nbuf = this.ctx.createBuffer(1, nl, this.ctx.sampleRate);
    const nd = this.nbuf.getChannelData(0);
    for (let i = 0; i < nl; i++) nd[i] = Math.random() * 2 - 1;

    document.addEventListener('visibilitychange', this.onVis);
    window.addEventListener('pagehide', this.onVis);
  }

  /** Call on the first user gesture — browsers gate audio behind one. */
  unlock() {
    this.ensure();
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    this.startMusic();
  }

  setSound(v: boolean) {
    this.on = v;
    if (this.ctx && this.master) this.master.gain.setTargetAtTime(v ? 0.8 : 0, this.ctx.currentTime, 0.03);
  }

  /** Streak-driven arousal of the loop (crash-tier style, but gentle). */
  setIntensity(streak: number) {
    this.intensity = clamp(streak / 8, 0, 1);
    this.tempo = Math.round(76 + this.intensity * 8);
    if (this.ctx && this.musLP) {
      this.musLP.frequency.setTargetAtTime(2400 + this.intensity * 2600, this.ctx.currentTime, 0.5);
    }
  }

  destroy() {
    this.stopMusic();
    document.removeEventListener('visibilitychange', this.onVis);
    window.removeEventListener('pagehide', this.onVis);
    if (this.ctx) void this.ctx.close().catch(() => undefined);
    this.ctx = null;
  }

  // ── voices ──────────────────────────────────────────────────────────────

  private tone(freq: number, t: number, dur: number, o: ToneOpts = {}) {
    if (!this.ctx || !(freq > 0)) return;
    const osc = this.ctx.createOscillator();
    osc.type = o.type ?? 'triangle';
    osc.frequency.value = freq;
    if (o.detune) osc.detune.value = o.detune;
    if (o.slide) osc.frequency.exponentialRampToValueAtTime(o.slide, t + dur * 0.9);
    const g = this.ctx.createGain();
    const peak = Math.max(0.001, o.gain ?? 0.15);
    const a = o.attack ?? 0.015;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.setValueAtTime(peak, t + Math.max(a, dur * 0.4));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let head: AudioNode = osc;
    if (o.filter) {
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = o.filter;
      f.Q.value = o.q ?? 0.6;
      osc.connect(f);
      head = f;
    }
    head.connect(g);
    g.connect(o.dest ?? this.mus!);
    osc.start(t);
    osc.stop(t + dur + 0.08);
  }

  private noise(
    t: number,
    dur: number,
    gain: number,
    o: { type?: BiquadFilterType; freq?: number; q?: number; sweepTo?: number; attack?: number; dest?: AudioNode } = {},
  ) {
    if (!this.ctx || !this.nbuf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.nbuf;
    src.loop = true;
    src.loopStart = 0;
    src.loopEnd = this.nbuf.duration;
    const f = this.ctx.createBiquadFilter();
    f.type = o.type ?? 'lowpass';
    f.frequency.setValueAtTime(o.freq ?? 1800, t);
    if (o.sweepTo) f.frequency.exponentialRampToValueAtTime(o.sweepTo, t + dur);
    f.Q.value = o.q ?? 0.8;
    const g = this.ctx.createGain();
    const a = o.attack ?? 0.006;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(o.dest ?? this.master!);
    src.start(t, Math.random() * 1.2);
    src.stop(t + dur + 0.05);
  }

  // ── the boudoir loop ────────────────────────────────────────────────────

  private startMusic() {
    if (this.playing || !this.ctx) return;
    this.playing = true;
    this.step = 0;
    this.abs = 0;
    this.next = this.ctx.currentTime + 0.1;
    const loop = () => {
      if (!this.playing || !this.ctx) return;
      const spb = 60 / this.tempo / 4; // one 16th
      // generous lookahead so main-thread jank can't starve the schedule
      while (this.next < this.ctx.currentTime + 0.6) {
        this.scheduleStep(this.step, this.next, spb);
        this.step = (this.step + 1) % 64;
        this.abs++;
        this.next += spb;
      }
      this.timer = setTimeout(loop, 90);
    };
    loop();
  }

  private stopMusic() {
    this.playing = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private scheduleStep(s: number, t: number, spb: number) {
    const e = this.intensity;
    const bar = (s / 16) | 0;
    const st = s % 16;
    const barLen = spb * 16;
    const { root, chord } = BARS[bar];

    // sub bass: a warm sine on the downbeat + the fifth answering mid-bar,
    // doubled by a soft lowpassed saw for body
    if (st === 0) {
      this.tone(root, t, spb * 10, { type: 'sine', gain: 0.16, attack: 0.03, filter: 300 });
      this.tone(root, t, spb * 10, { type: 'sawtooth', gain: 0.04, attack: 0.05, filter: 190 });
    }
    if (st === 10) this.tone(root * 1.5, t, spb * 4, { type: 'sine', gain: 0.09, attack: 0.03, filter: 300 });

    // hushed m7/9 chord: detuned oscillator pairs, long attack, the bus
    // lowpass does the slow LFO breathing (setIntensity nudges it)
    if (st === 0) {
      chord.forEach((f, i) =>
        this.tone(f, t, barLen * 0.92, {
          type: 'triangle',
          gain: 0.035,
          attack: 0.3,
          filter: 1500,
          q: 0.4,
          detune: (i % 2 ? 1 : -1) * 6,
        }),
      );
    }
    // an offbeat stab sneaks in as the streak heats up
    if (st === 8 && e > 0.35) {
      [chord[0], chord[2]].forEach((f, i) =>
        this.tone(f, t, spb * 2.2, { type: 'triangle', gain: 0.028, attack: 0.02, filter: 1900, detune: i ? 5 : -5 }),
      );
    }

    // breathy pad: bandpassed noise with a slow sweep, one per two bars
    if (st === 0 && bar % 2 === 0) {
      this.noise(t, barLen * 1.9, 0.028 + e * 0.014, {
        type: 'bandpass',
        freq: 900 + hash(this.abs) * 600,
        sweepTo: 1700 + e * 500,
        q: 1.4,
        attack: barLen * 0.6,
        dest: this.mus!,
      });
    }

    // sparse brush percussion; thickens gently with intensity
    if (st === 4 || st === 12) this.noise(t, 0.09, 0.05 + e * 0.03, { type: 'highpass', freq: 2600 });
    if (st % 4 === 2) this.noise(t, 0.04, 0.02 + e * 0.015, { type: 'highpass', freq: 5200 });
    if (e > 0.45 && st % 2 === 1) this.noise(t, 0.03, 0.014, { type: 'highpass', freq: 6800 });
    if (e > 0.6 && (st === 0 || st === 8)) {
      this.tone(90, t, 0.12, { type: 'sine', gain: 0.1, attack: 0.004, slide: 48, dest: this.master! });
    }

    // a rare soft bell from the chord — the "glance across the room"
    if (st === 12 && hash(this.abs * 3) > 0.72) {
      this.tone(chord[(hash(this.abs) * 4) | 0] * 2, t, spb * 3, { type: 'sine', gain: 0.03, attack: 0.01, filter: 5200 });
    }
  }

  // ── SFX ─────────────────────────────────────────────────────────────────
  // One-shots may be triggered by polling while the tab is hidden (suspended
  // context, frozen currentTime) — skip them so they don't fire in a burst on
  // return (same guard as the crash synth).

  private get sfxOk() {
    return this.on && !!this.ctx && !document.hidden;
  }

  /** Soft chip click (bet placed / side chosen). */
  click() {
    if (!this.sfxOk) return;
    const t = this.ctx!.currentTime;
    this.tone(520, t, 0.05, { type: 'triangle', gain: 0.14, dest: this.sfxBus! });
    this.tone(880, t + 0.02, 0.06, { type: 'triangle', gain: 0.1, dest: this.sfxBus! });
  }

  /** The coin spinning: a bandpass whoosh sweeping up then down in sync with
   *  the animation, plus a metallic ring-mod shimmer. */
  flip(durationMs: number) {
    if (!this.sfxOk) return;
    const t = this.ctx!.currentTime;
    const dur = durationMs / 1000;
    // whoosh: noise through a bandpass that rises and falls with the throw
    const src = this.ctx!.createBufferSource();
    src.buffer = this.nbuf!;
    src.loop = true;
    const f = this.ctx!.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.6;
    f.frequency.setValueAtTime(320, t);
    f.frequency.exponentialRampToValueAtTime(2300, t + dur * 0.42);
    f.frequency.exponentialRampToValueAtTime(360, t + dur);
    const g = this.ctx!.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.15, t + dur * 0.18);
    g.gain.setValueAtTime(0.15, t + dur * 0.55);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.sfxBus!);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
    // metallic shimmer: ring-mod of two oscillators, fading with the spin
    const car = this.ctx!.createOscillator();
    car.type = 'sine';
    car.frequency.setValueAtTime(2300, t);
    car.frequency.exponentialRampToValueAtTime(1400, t + dur);
    const mod = this.ctx!.createOscillator();
    mod.type = 'sine';
    mod.frequency.setValueAtTime(170, t);
    mod.frequency.exponentialRampToValueAtTime(60, t + dur);
    const ring = this.ctx!.createGain();
    ring.gain.value = 0;
    mod.connect(ring.gain);
    const rg = this.ctx!.createGain();
    rg.gain.setValueAtTime(0.0001, t);
    rg.gain.linearRampToValueAtTime(0.05, t + dur * 0.2);
    rg.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    car.connect(ring);
    ring.connect(rg);
    rg.connect(this.sfxBus!);
    car.start(t);
    car.stop(t + dur + 0.05);
    mod.start(t);
    mod.stop(t + dur + 0.05);
  }

  /** The landing clink: a short metallic strike with fast-decaying partials. */
  land() {
    if (!this.sfxOk) return;
    const t = this.ctx!.currentTime;
    [
      [2100, 0.11, 0.11],
      [3170, 0.09, 0.07],
      [4230, 0.07, 0.045],
    ].forEach(([f, d, g]) => this.tone(f, t, d, { type: 'triangle', gain: g, attack: 0.002, dest: this.sfxBus! }));
    this.tone(190, t, 0.1, { type: 'sine', gain: 0.12, attack: 0.003, slide: 90, dest: this.sfxBus! });
    this.noise(t, 0.05, 0.05, { type: 'highpass', freq: 4800, dest: this.sfxBus! });
  }

  /** A correct flip mid-series: a glassy two-note lift whose pitch climbs
   *  with the streak (Stake-style tension escalation, softly capped). */
  correct(step: number) {
    if (!this.sfxOk) return;
    const t = this.ctx!.currentTime;
    const f = 440 * Math.pow(2, Math.min(Math.max(step, 0), 16) / 12);
    this.tone(f, t, 0.08, { type: 'triangle', gain: 0.13, dest: this.sfxBus! });
    this.tone(f * 1.5, t + 0.04, 0.1, { type: 'sine', gain: 0.09, dest: this.sfxBus! });
  }

  /** Final win stinger — a bright little lift in key with the loop. */
  win() {
    if (!this.sfxOk) return;
    const t = this.ctx!.currentTime;
    [440, 554.37, 659.25, 880].forEach((f, i) =>
      this.tone(f, t + i * 0.07, 0.2, { type: 'triangle', gain: 0.13, filter: 3800, dest: this.sfxBus! }),
    );
  }

  /** Miss stinger — a dark downward sag in the same key. */
  lose() {
    if (!this.sfxOk) return;
    const t = this.ctx!.currentTime;
    this.tone(330, t, 0.4, { type: 'sawtooth', gain: 0.12, filter: 900, slide: 165, dest: this.sfxBus! });
    this.tone(110, t + 0.03, 0.45, { type: 'sine', gain: 0.14, slide: 55, dest: this.sfxBus! });
  }

  /** Cashout — the "till" glissando chord. */
  cashout() {
    if (!this.sfxOk) return;
    const t = this.ctx!.currentTime;
    [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) =>
      this.tone(f, t + i * 0.055, 0.22, { type: 'triangle', gain: 0.15, filter: 4200, dest: this.sfxBus! }),
    );
    this.tone(2637, t + 0.3, 0.3, { type: 'sine', gain: 0.07, dest: this.sfxBus! });
    this.noise(t, 0.04, 0.05, { type: 'highpass', freq: 5200, dest: this.sfxBus! });
  }
}
