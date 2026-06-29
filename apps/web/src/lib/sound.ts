// Lightweight, fully synthesised SFX for the roulette.
//
// The wheel is drawn programmatically (see RouletteWheel.tsx) and ships with no
// recorded audio, so we generate the "ball clicking past the frets" ticks live
// with the Web Audio API and ramp them to match the wheel's deceleration.
//
// Tuning knobs live at the top so the feel can be adjusted in one place.
const MASTER_VOLUME = 0.55; // overall SFX loudness (0..1)
const TICK_BASE_HZ = 1050; // pitch of a fret click at full speed — bright so it cuts through
const TICK_END_HZ = 820; // pitch once the wheel has slowed down
const CHIME_HZ = 1320; // landing note when the ball settles

let ctx: AudioContext | null = null;
let master: GainNode | null = null;

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) {
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = MASTER_VOLUME;
    master.connect(ctx.destination);
  }
  // Browsers create the context suspended until a user gesture; spin() is a click
  // handler, so priming it there (see primeRouletteAudio) keeps playback unlocked.
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

// Create + resume the context from within a user gesture so later, post-`await`
// playback is allowed (Safari only unlocks audio during the gesture itself).
export function primeRouletteAudio(): void {
  audio();
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

// One short "tick" — a fret click. A square wave gives it a bright, mechanical edge.
function tick(c: AudioContext, at: number, freq: number, gain: number): void {
  const osc = c.createOscillator();
  const amp = c.createGain();
  osc.type = 'square';
  osc.frequency.value = freq;
  amp.gain.setValueAtTime(0.0001, at);
  amp.gain.linearRampToValueAtTime(gain, at + 0.002);
  amp.gain.exponentialRampToValueAtTime(0.0001, at + 0.045);
  osc.connect(amp).connect(master!);
  osc.start(at);
  osc.stop(at + 0.05);
}

// Soft landing chime when the wheel settles on its number.
function chime(c: AudioContext, at: number, freq: number, gain: number): void {
  const osc = c.createOscillator();
  const amp = c.createGain();
  osc.type = 'triangle';
  osc.frequency.value = freq;
  amp.gain.setValueAtTime(0.0001, at);
  amp.gain.linearRampToValueAtTime(gain, at + 0.01);
  amp.gain.exponentialRampToValueAtTime(0.0001, at + 0.4);
  osc.connect(amp).connect(master!);
  osc.start(at);
  osc.stop(at + 0.42);
}

// Schedule the whole spin: a stream of ticks that thins out as the wheel slows
// (mirroring the cubic-bezier(0.16, 1, 0.3, 1) transition on the wheel), then a
// landing chime when it lands. `durationMs` should match the wheel's SPIN_MS.
export function playRouletteSpin(durationMs: number): void {
  const c = audio();
  if (!c) return;
  const start = c.currentTime;
  const dur = durationMs / 1000;

  if (prefersReducedMotion()) {
    // No spinning visual to track — just acknowledge the landing.
    chime(c, start + 0.05, CHIME_HZ, 0.45);
    return;
  }

  // Ticks start dense and fast, then the gap grows as the wheel decelerates, so
  // fewer frets cross the ball per second toward the end.
  let t = 0;
  let gap = 0.04;
  while (t < dur - 0.12) {
    const progress = t / dur;
    const freq = TICK_BASE_HZ - (TICK_BASE_HZ - TICK_END_HZ) * progress;
    tick(c, start + t, freq, 0.32 * (1 - progress * 0.35));
    gap *= 1.055;
    t += gap;
  }

  chime(c, start + dur, CHIME_HZ, 0.45);
}
