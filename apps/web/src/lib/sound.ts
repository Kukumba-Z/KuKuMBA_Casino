/**
 * Tiny synthesized sound effects via the Web Audio API — no asset files, so
 * nothing binary is committed and the bundle stays small. Shared across games;
 * each effect is a no-op when sound is disabled. The AudioContext is created
 * lazily on the first call (which always follows a user gesture, so browsers
 * allow it) and resumed if suspended.
 */
let ctx: AudioContext | null = null;
let enabled = true;

export function setSoundEnabled(v: boolean) {
  enabled = v;
}

/** Unlock/resume the shared AudioContext on a user gesture (browsers gate audio). */
export function resumeAudio() {
  audio();
}

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    if (!ctx) {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null; // audio unavailable — effects become silent no-ops
  }
}

function blip(
  c: AudioContext,
  { freq, dur, type = 'sine', gain = 0.18, at = 0, slideTo }: { freq: number; dur: number; type?: OscillatorType; gain?: number; at?: number; slideTo?: number },
) {
  const t0 = c.currentTime + at;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.03);
}

export const sfx = {
  /** Soft chip click when a bet is placed on a position. */
  chip() {
    if (!enabled) return;
    const c = audio();
    if (!c) return;
    blip(c, { freq: 520, dur: 0.05, type: 'triangle', gain: 0.16 });
    blip(c, { freq: 880, dur: 0.06, type: 'triangle', gain: 0.12, at: 0.02 });
  },

  /** Decelerating "ball clacking the wheel" ticks, spread over the spin duration. */
  spin(durationMs: number) {
    if (!enabled) return;
    const c = audio();
    if (!c) return;
    const dur = durationMs / 1000;
    const N = 46;
    for (let k = 1; k <= N; k++) {
      const x = k / N;
      // ease-out: ticks get sparser toward the end, like a settling ball
      const at = dur * (1 - Math.pow(1 - x, 3));
      // brighter, a touch louder clacks — raised tone + volume per request
      // (was 240–300 Hz / gain 0.06).
      blip(c, { freq: k % 2 ? 440 : 360, dur: 0.022, type: 'triangle', gain: 0.1, at });
    }
    // final settle thunk — fuller so the landing reads clearly
    blip(c, { freq: 220, dur: 0.14, type: 'triangle', gain: 0.16, at: dur });
  },

  /** Spinning-needle whoosh (Upgrader): a rising frequency sweep plus dense ticks
   *  that thin out toward the finish (ease-out), capped by a final settle "tuk". */
  arrowSpin(durationMs: number) {
    if (!enabled) return;
    const c = audio();
    if (!c) return;
    const dur = durationMs / 1000;
    // rising whoosh under the ticks (kept soft — the slow spin makes it long)
    blip(c, { freq: 180, dur, type: 'sawtooth', gain: 0.04, slideTo: 480 });
    // ticks: dense at the start, sparser toward the end (ease-out), like a
    // decelerating needle clacking past the pins; capped so a long suspense
    // spin stays a tick-tick-tick, not a buzz
    const N = Math.max(18, Math.min(72, Math.round(dur * 24)));
    for (let k = 1; k <= N; k++) {
      const x = k / N;
      const at = dur * (1 - Math.pow(1 - x, 3));
      blip(c, { freq: k % 2 ? 620 : 500, dur: 0.018, type: 'triangle', gain: 0.08, at });
    }
    blip(c, { freq: 240, dur: 0.12, type: 'triangle', gain: 0.15, at: dur }); // final "tuk"
  },

  /** Snappy card-flick when a card is dealt or flipped. */
  card() {
    if (!enabled) return;
    const c = audio();
    if (!c) return;
    blip(c, { freq: 980, dur: 0.028, type: 'triangle', gain: 0.09 });
    blip(c, { freq: 430, dur: 0.055, type: 'triangle', gain: 0.12, at: 0.02 });
  },

  /** Bright ascending arpeggio on a win. */
  win() {
    if (!enabled) return;
    const c = audio();
    if (!c) return;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
      blip(c, { freq: f, dur: 0.18, type: 'sine', gain: 0.16, at: i * 0.09 }),
    );
  },

  /** Soft low blip on a loss. */
  lose() {
    if (!enabled) return;
    const c = audio();
    if (!c) return;
    blip(c, { freq: 320, dur: 0.32, type: 'sine', gain: 0.12, slideTo: 170 });
  },
};
