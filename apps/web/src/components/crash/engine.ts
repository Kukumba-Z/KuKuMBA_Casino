// VODKA WIN! — Crash engine (framework-agnostic, canvas + WebAudio).
// Ported from the verified HTML prototype; this build is the SERVER-DRIVEN
// visualizer — all money truth lives in apps/api/src/modules/games/crash.
//
//  - Normal round: placeBet(autoAt, null, elapsedMs) — the crash point is NOT
//    known here (the server never reveals it mid-round); the multiplier is the
//    same closed-form time curve the server validates cashouts with
//    (multiplierAt/secondsToReach — mirror of crash.engine.ts on the API), and
//    the page settles the round via settleFromServer() when the server answers.
//  - Turbo round: the server settles in the bet transaction and returns the
//    crash point up front — placeBet(autoAt, crashPoint) plays it out locally.
// @ts-nocheck

export interface CrashStatePayload {
  phase: 'idle' | 'running' | 'crashed';
  multiplier: number; crashPoint: number; stageIndex: number; stageLabel: string;
  betActive: boolean; cashedAt: number | null; countdown: number;
}
export interface CrashEngineOptions {
  onState?: (s: CrashStatePayload) => void;
  onRoundEnd?: (crashPoint: number, info: { finale: boolean; lost: boolean; cashedAt: number | null }) => void;
  onEvent?: (name: string, data?: any) => void;
  rng?: () => number;   // inject a fair float source (defaults to Math.random for the demo)
  rtp?: number;         // 0..1, defaults to 0.99; in production pass game.rtp
  /** localized scene captions (idle hint + round-end stamps) */
  texts?: { idle?: string; lost?: string; won?: string; finale?: string };
}

/* VODKA WIN! — Crash game engine (framework-agnostic).
 * Canvas scene (caricature character, huge multiplier, VFX, camera shake) +
 * WebAudio music/SFX. Host renders the HUD and reads state via onState.
 *
 * Flow: 'idle' (waiting for a bet — no timer) --placeBet--> 'running' --crash-->
 *       'crashed' (a few seconds) --> 'idle'.
 *
 * API: new CrashEngine(canvas, { onState, onRoundEnd, onEvent })
 *      start() destroy() setMode('random'|'scripted') setSound(bool)
 *      resumeAudio() placeBet() cashOut()->number|null
 */

  const C = {
    night: '#0E0B1A', ink: '#0B0817',
    lav: '#B79CED', bubble: '#FF8FD0', mint: '#7EE7C7', sky: '#7CC4FF', sun: '#FFD86E',
    red: '#E5484D', outline: '#191430', outlineSoft: '#241c3e',
    skin: '#F2C9A0', skinRed: '#E8806A',
  };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);
  const hash = (n) => { const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };
  const hrange = (n, a, b) => a + hash(n) * (b - a);

  // ---- degradation stages — texts matched to actual visual changes -----------
  const STAGES = [
    { x: 1,       t: 'Деловой костюм, кружка пива' },
    { x: 1.1,     t: 'Пригубил, доволен' },
    { x: 1.2,     t: 'Ослабил галстук' },
    { x: 1.35,    t: 'Оглядел бар' },
    { x: 1.5,     t: 'Первый уверенный глоток' },
    { x: 1.7,     t: 'Расплылся в улыбке' },
    { x: 1.9,     t: 'Причмокнул' },
    { x: 2.1,     t: 'Второй заход' },
    { x: 2.4,     t: 'Расстегнул пиджак' },
    { x: 2.8,     t: 'Расстегнул воротник' },
    { x: 3.3,     t: 'Икнул' },
    { x: 3.9,     t: 'Круги под глазами' },
    { x: 4.6,     t: 'Пот градом' },
    { x: 5.5,     t: 'Отрыжка' },
    { x: 6.5,     t: 'Пиджак сполз с плеча' },
    { x: 8,       t: 'Покачивается на стуле' },
    { x: 9.5,     t: 'Взгляд поплыл' },
    { x: 11,      t: 'Перешёл на бутылку' },
    { x: 14,      t: 'Балтика 7' },
    { x: 17,      t: 'Балтика 9' },
    { x: 21,      t: 'Мутный взгляд' },
    { x: 26,      t: 'Снял пиджак' },
    { x: 32,      t: 'Галстук на голову' },
    { x: 40,      t: 'Охота Крепкое' },
    { x: 50,      t: 'Стол трясётся' },
    { x: 62,      t: 'Дешёвое вино' },
    { x: 78,      t: 'Заплетается язык' },
    { x: 95,      t: 'Вторая бутылка' },
    { x: 120,     t: 'Рубашка навыпуск' },
    { x: 150,     t: 'Настойка боярышника' },
    { x: 190,     t: 'Рубашка в пятнах' },
    { x: 240,     t: 'Сползает со стула' },
    { x: 300,     t: 'Рабочая роба' },
    { x: 380,     t: 'Упал со стула, пьёт лёжа' },
    { x: 480,     t: 'Перебрался на бордюр' },
    { x: 600,     t: 'Егермейстер' },
    { x: 750,     t: 'Потерял ботинок' },
    { x: 950,     t: 'Порван рукав' },
    { x: 1200,    t: 'Беседует с урной' },
    { x: 1600,    t: 'Проросла борода' },
    { x: 2100,    t: 'Водка из горла' },
    { x: 2800,    t: 'Оброс сильнее' },
    { x: 3800,    t: 'Самогон' },
    { x: 5000,    t: 'Совсем зарос' },
    { x: 7000,    t: 'Карикатурный бомж' },
    { x: 10000,   t: 'Медицинский спирт' },
    { x: 16000,   t: 'В глазах двоится' },
    { x: 25000,   t: 'Спирт + Балтика 9' },
    { x: 40000,   t: 'Глаза наливаются кровью' },
    { x: 65000,   t: 'Бутылка задымилась' },
    { x: 100000,  t: 'Спирт горит' },
    { x: 170000,  t: 'Валит чёрный дым' },
    { x: 280000,  t: 'Бензин + спирт' },
    { x: 450000,  t: 'Начал светиться' },
    { x: 650000,  t: 'Огромная колба' },
    { x: 850000,  t: 'Бутылки летают по орбите' },
    { x: 1000000, t: 'Вспышка. Гроб. VODKA WIN!' },
  ];
  const MAXMULT = 1000000;
  const HOUSE_EDGE = 0.01; // 1% — тот же плоский edge, что в рулетке (RTP 99%)

  // Честный маппинг: равномерный u ∈ [0,1) -> точка краша (флор до 2 знаков,
  // как rouletteOutcome=floor(float*37)). В бою u = floatFromSeeds(serverSeed, clientSeed, nonce)
  // из модуля provably-fair — тогда краш верифицируем точно так же, как рулетка.
  // P(crash ≥ m) = (1-edge)/m  =>  RTP = m·(1-edge)/m = 1-edge для ЛЮБОЙ цели.
  function crashFromFloat(u, edge) {
    edge = (edge >= 0 && edge < 1) ? edge : HOUSE_EDGE;
    if (!(u >= 0 && u < 1)) u = 0;                 // защита от мусора
    if (u < edge) return 1.00;                    // мгновенный краш с вероятностью = edge
    return Math.min(MAXMULT, Math.floor((1 - edge) / (1 - u) * 100) / 100);
  }

  // ---- deterministic growth curve — EXACT mirror of the API's crash.engine.ts.
  // The server validates cashouts by time on this curve; the client renders the
  // same m(t), so what you see is what settles (modulo network latency).
  //   t(m) = (ln m + A·ln²m) / K      m(t) = exp((√(1 + 4AKt) − 1) / 2A)
  const CURVE_K = 0.26;
  const CURVE_A = 0.25 / Math.LN10;
  function multiplierAt(seconds) {
    if (!(seconds > 0)) return 1;
    const L = (Math.sqrt(1 + 4 * CURVE_A * CURVE_K * seconds) - 1) / (2 * CURVE_A);
    return Math.min(MAXMULT, Math.exp(L));
  }
  function secondsToReach(m) {
    const c = Math.min(Math.max(m, 1), MAXMULT);
    const L = Math.log(c);
    return (L + CURVE_A * L * L) / CURVE_K;
  }

  // алкашные фразы для облачка — показываются в случайные моменты роста икса
  const PHRASES = [
    'Ну, за удачу!', 'Ещё по одной…', 'Я только начал!', 'Мам, я в порядке',
    'Это не запой, это стратегия', 'Печень, держись', 'А кто такой краш?', 'Закусывать надо!',
    'Сейчас бы огурчик…', 'Я вас всех люблю', 'Где мой галстук?', 'Работа подождёт',
    'Ик… всё под контролем', 'Наливай, не жалей!', 'Один икс — один глоток', 'Да я трезвый как стекло',
    'Завтра точно завяжу', 'Это последняя. Честно', 'Кажется, пол шатается', 'Звонил бывшей… зря',
    'Деньги — пыль', 'Гулять так гулять!', 'Что могло пойти не так?', 'Врач сказал — можно',
    'Не мы такие — жизнь такая', 'Улетаю на луну', 'Кто выключил гравитацию?', 'Бутылка — мой компас',
    'Вижу двух крупье…', 'Это витамины', 'Продал гараж', 'Тамада хорош, конкурсы интересные',
  ];

  function stageIndexFor(m) {
    let i = 0;
    for (let k = 0; k < STAGES.length; k++) if (m >= STAGES[k].x) i = k; else break;
    return i;
  }

  function computeLook(m, idx) {
    const chaos = Math.pow(clamp(Math.log(Math.max(m, 1)) / Math.log(MAXMULT), 0, 1), 0.9);
    const env = m < 40 ? 'office' : m < 480 ? 'bar' : m < 5000 ? 'street' : m < 65000 ? 'trash' : 'cosmic';
    const sit = m < 380 ? 'stool' : m < 480 ? 'fall' : m < 5000 ? 'curb' : m < 65000 ? 'container' : 'float';
    // clothing arc: full suit -> shirt (jacket off) -> worker robe -> rags
    const suit = m < 26 ? 'suit' : m < 300 ? 'shirt' : m < 1600 ? 'uniform' : 'rags';
    const jacket = m < 2.4 ? 'buttoned' : m < 6.5 ? 'open' : m < 26 ? 'shoulder' : 'none';
    const drink = m < 11 ? 'mug' : m < 62 ? 'bottle' : m < 150 ? 'wine' : m < 2100 ? 'bottle'
      : m < 40000 ? 'vodka' : m < 100000 ? 'flask' : m < 450000 ? 'gas' : 'bigflask';
    return {
      chaos, env, sit, suit, jacket, drink,
      tie: m < 32,
      tieLoosen: clamp(Math.log(Math.max(m, 1)) / Math.log(32), 0, 1),
      tieHeadband: m >= 32 && m < 190,          // галстук на голову
      collarOpen: m >= 2.8,
      sweat: clamp((m - 4) / 26, 0, 1),
      hiccup: m >= 3.3,
      stains: m >= 190 ? 1 : m >= 95 ? 0.5 : 0,
      untucked: m >= 120,
      driftEyes: m >= 9.5,                      // взгляд поплыл
      grin: clamp(Math.log(Math.max(m, 1)) / Math.log(50), 0, 1),
      beard: m < 1600 ? 0 : m < 2800 ? 1 : m < 5000 ? 2 : m < 10000 ? 3 : 4,
      hair: m < 1600 ? 'neat' : m < 25000 ? 'messy' : 'crazy',
      bags: m < 3.9 ? 0 : m < 40 ? 1 : 2,
      redFace: clamp((Math.log(Math.max(m, 1)) - Math.log(1.6)) / (Math.log(120) - Math.log(1.6)), 0, 1),
      eyes: m >= 650000 ? 'spiral' : m >= 16000 ? 'bloodshot' : 'normal',
      glowEyes: m >= 450000,
      doubleVision: m >= 16000,
      glow: m >= 450000 ? clamp((Math.log(m) - Math.log(450000)) / (Math.log(MAXMULT) - Math.log(450000)), 0, 1) : 0,
      fire: m >= 65000, smoke: m >= 65000, pixelate: m >= 850000,
      drinkSpeed: lerp(3.2, 0.8, chaos), swayAmp: lerp(0.01, 0.13, chaos),
      idx, m,
    };
  }

  // ===========================================================================
  //  AUDIO — tiered groove that evolves fast at SMALL multipliers:
  //  ~1× lounge -> 2× beat kicks in -> 5× oompah-polka -> 16× funk backbeat ->
  //  45× four-on-floor -> 125× rave -> 380×+ hard rave -> 1000×+ madness.
  //  Key rises a semitone per tier. Master goes through a limiter (kills
  //  clipping crackle), percussion uses one shared noise buffer, filter
  //  automation is throttled (no param-event spam).
  // ===========================================================================
  const N = { C2: 65.41, D2: 73.42, E2: 82.41, F2: 87.31, G2: 98.0, A2: 110.0, B2: 123.47,
    C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61, G3: 196.0, A3: 220.0, B3: 246.94,
    C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.0, A4: 440.0, B4: 493.88,
    C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880.0, C6: 1046.5 };

  class Synth {
    constructor() { this.ctx = null; this.on = true; this.master = null; this.mel = null; this.drum = null;
      this.playing = false; this._next = 0; this._step = 0; this._abs = 0; this._timer = null;
      this.tempo = 108; this.energy = 0; this.mad = 0; this._lastFilt = -1; }
    ensure() {
      if (this.ctx) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      // master -> limiter -> destination (limiter kills clip-crackle)
      this.comp = this.ctx.createDynamicsCompressor();
      this.comp.threshold.value = -14; this.comp.knee.value = 24; this.comp.ratio.value = 10;
      this.comp.attack.value = 0.003; this.comp.release.value = 0.22;
      this.comp.connect(this.ctx.destination);
      this.master = this.ctx.createGain(); this.master.gain.value = 0.9; this.master.connect(this.comp);
      // melodic bus with dynamic lowpass (opens with energy)
      this.mel = this.ctx.createGain(); this.mel.gain.value = 0.52;
      this.melLP = this.ctx.createBiquadFilter(); this.melLP.type = 'lowpass'; this.melLP.frequency.value = 4200; this.melLP.Q.value = 0.5;
      this.mel.connect(this.melLP); this.melLP.connect(this.master);
      // subtle reverb send
      const len = Math.floor(this.ctx.sampleRate * 1.6), imp = this.ctx.createBuffer(2, len, this.ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) { const d = imp.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
      this.conv = this.ctx.createConvolver(); this.conv.buffer = imp;
      const wet = this.ctx.createGain(); wet.gain.value = 0.12; this.mel.connect(this.conv); this.conv.connect(wet); wet.connect(this.master);
      // drum bus
      this.drum = this.ctx.createGain(); this.drum.gain.value = 0.58;
      this.drumLP = this.ctx.createBiquadFilter(); this.drumLP.type = 'lowpass'; this.drumLP.frequency.value = 3200;
      this.drum.connect(this.drumLP); this.drumLP.connect(this.master);
      // one shared noise buffer for all percussion/sfx (no allocation churn)
      const nl = Math.floor(this.ctx.sampleRate * 2);
      this._nbuf = this.ctx.createBuffer(1, nl, this.ctx.sampleRate);
      const nd = this._nbuf.getChannelData(0); for (let i = 0; i < nl; i++) nd[i] = Math.random() * 2 - 1;
    }
    resume() { this.ensure(); if (this.ctx.state === 'suspended') this.ctx.resume(); this.startMusic(); }
    setOn(v) { this.on = v; if (this.master) this.master.gain.setTargetAtTime(v ? 0.9 : 0, this.ctx.currentTime, 0.03); }
    // energy is driven by the multiplier so the music changes fast at SMALL x:
    // e hits 1.0 already at 1000×; beyond that "mad" pushes tempo/craziness on.
    setEnergy(mult) {
      const lm = Math.log10(Math.max(mult, 1));
      this.energy = clamp(lm / 3, 0, 1);
      this.mad = clamp((lm - 3) / 3, 0, 1);
      this.tempo = Math.round(108 + this.energy * 52 + this.mad * 22);
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      if (now - this._lastFilt > 0.3) { // throttled automation
        this._lastFilt = now;
        this.melLP.frequency.setTargetAtTime(lerp(4200, 9500, Math.max(this.energy, this.mad)), now, 0.35);
        this.drumLP.frequency.setTargetAtTime(lerp(3000, 7500, this.energy), now, 0.35);
      }
    }

    tone(freq, t, dur, o) {
      if (!this.ctx || !(freq > 0)) return; o = o || {};
      const osc = this.ctx.createOscillator(); osc.type = o.type || 'triangle'; osc.frequency.value = freq;
      if (o.detune) osc.detune.value = o.detune;
      const g = this.ctx.createGain(); const peak = Math.max(0.001, o.gain ?? 0.2), a = o.attack ?? 0.015;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + a);
      g.gain.setValueAtTime(peak, t + Math.max(a, dur * 0.45));
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      let head = osc;
      if (o.filter) { const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.filter; f.Q.value = o.q || 0.6; osc.connect(f); head = f; }
      head.connect(g); g.connect(o.dest || this.mel);
      if (o.vib) { const lfo = this.ctx.createOscillator(), la = this.ctx.createGain(); lfo.frequency.value = o.vib; la.gain.value = o.vibAmt || 3; lfo.connect(la); la.connect(osc.frequency); lfo.start(t); lfo.stop(t + dur); }
      if (o.slide) osc.frequency.exponentialRampToValueAtTime(o.slide, t + dur * 0.9);
      osc.start(t); osc.stop(t + dur + 0.06);
    }
    noise(dur, gain, freq, when, hp, dest) {
      if (!this.ctx) return; const t = when ?? this.ctx.currentTime;
      const src = this.ctx.createBufferSource(); src.buffer = this._nbuf;
      const off = Math.random() * (2 - dur - 0.06);
      const f = this.ctx.createBiquadFilter(); f.type = hp ? 'highpass' : 'lowpass'; f.frequency.value = freq || 1800;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain ?? 0.25, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f); f.connect(g); g.connect(dest || this.master);
      src.start(t, off, dur + 0.03);
    }
    kick(t, hard) { if (!this.ctx) return; const o = this.ctx.createOscillator(), g = this.ctx.createGain(); o.type = 'sine';
      o.frequency.setValueAtTime(hard ? 135 : 118, t); o.frequency.exponentialRampToValueAtTime(44, t + 0.12);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(hard ? 0.85 : 0.72, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      o.connect(g); g.connect(this.drum); o.start(t); o.stop(t + 0.22); }
    rim(t) { this.tone(300, t, 0.08, { type: 'triangle', gain: 0.13, dest: this.drum }); this.noise(0.05, 0.06, 2000, t, false, this.drum); }
    clap(t) { for (let i = 0; i < 3; i++) this.noise(0.08, 0.1, 2400, t + i * 0.009, true, this.drum); }
    shaker(t) { this.noise(0.045, 0.035, 2600, t, false, this.drum); }
    chat(t, g) { this.noise(0.03, g ?? 0.045, 6800, t, true, this.drum); }
    ohat(t, g) { this.noise(0.1, g ?? 0.05, 7400, t, true, this.drum); }
    snare(t, g) { this.noise(0.12, g ?? 0.14, 2800, t, true, this.drum); this.tone(210, t, 0.1, { type: 'triangle', gain: 0.1, dest: this.drum }); }

    // SFX (dry, to master)
    glug() { if (!this.on || !this.ctx) return; const t0 = this.ctx.currentTime; const n = 2 + (Math.random() * 3 | 0), sp = rand(0.085, 0.12);
      for (let i = 0; i < n; i++) this.tone(rand(145, 205) - i * rand(10, 20), t0 + i * sp, 0.1, { type: 'sine', gain: 0.2, dest: this.master, slide: rand(90, 120) }); }
    burp() { if (!this.on || !this.ctx) return; this.noise(0.26, 0.2, 480, this.ctx.currentTime, false, this.master); this.tone(92, this.ctx.currentTime, 0.24, { type: 'sawtooth', gain: 0.13, filter: 300, dest: this.master }); }
    pop() { if (!this.on || !this.ctx) return; const t0 = this.ctx.currentTime; this.tone(420, t0, 0.07, { type: 'sine', gain: 0.2, dest: this.master, slide: 900 }); this.noise(0.16, 0.07, 5200, t0 + 0.03, true); } // пробка новой бутылки
    gulpSfx() { if (!this.on || !this.ctx) return; this.tone(118, this.ctx.currentTime, 0.09, { type: 'sine', gain: 0.15, dest: this.master }); }
    hiccupSfx() { if (!this.on || !this.ctx) return; const t0 = this.ctx.currentTime; this.tone(320, t0, 0.06, { type: 'sine', gain: 0.13, dest: this.master }); this.tone(540, t0 + 0.05, 0.05, { type: 'sine', gain: 0.11, dest: this.master }); }
    tick() {}
    stageDing() {}
    cashout() { if (!this.on || !this.ctx) return; const t0 = this.ctx.currentTime; [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(f, t0 + i * 0.06, 0.2, { type: 'triangle', gain: 0.2, filter: 3600, dest: this.master })); }
    crash() { if (!this.on || !this.ctx) return; const t0 = this.ctx.currentTime; this.noise(0.5, 0.38, 900, t0, false, this.master); this.tone(200, t0, 0.5, { type: 'sawtooth', gain: 0.26, filter: 1200, dest: this.master, slide: 60 }); this.tone(150, t0, 0.5, { type: 'square', gain: 0.15, filter: 900, dest: this.master, slide: 50 }); }
    finale() { if (!this.on || !this.ctx) return; const t0 = this.ctx.currentTime; [392, 523, 659, 784, 1046, 1318, 1568].forEach((f, i) => this.tone(f, t0 + i * 0.08, 0.32, { type: 'triangle', gain: 0.2, filter: 4000, dest: this.master })); this.noise(0.8, 0.22, 2600, t0, false, this.master); }

    startMusic() {
      if (this.playing || !this.ctx) return;
      this.playing = true; this._step = 0; this._abs = 0; this._next = this.ctx.currentTime + 0.1;
      const loop = () => {
        if (!this.playing) return;
        const spb = 60 / this.tempo / 4; // 16th
        // generous lookahead so main-thread jank can't starve the schedule
        while (this._next < this.ctx.currentTime + 0.55) {
          this.scheduleStep(this._step, this._next, spb);
          this._step = (this._step + 1) % 64; this._abs++; this._next += spb;
        }
        this._timer = setTimeout(loop, 80);
      }; loop();
    }
    stopMusic() { this.playing = false; if (this._timer) clearTimeout(this._timer); }

    scheduleStep(s, t, spb) {
      const e = this.energy, mad = this.mad;
      const bar = (s / 16) | 0, st = s % 16, barLen = spb * 16;
      const phraseN = (this._abs / 64) | 0, phrase = phraseN % 4;
      // key rises a semitone per tier — audible "level up" as x grows
      const semis = Math.min(7, Math.floor(e * 7)) + Math.floor(mad * 4);
      const k = Math.pow(2, semis / 12);
      // ii – V – I – vi
      const chords = [[N.D3, N.F3, N.A3, N.C4], [N.G3, N.B3, N.D4, N.F4], [N.C4, N.E4, N.G4, N.B4], [N.A3, N.C4, N.E4, N.G4]];
      const roots = [N.D2, N.G2, N.C2, N.A2];
      const ch = chords[bar], root = roots[bar] * k;

      // ---- HARMONY LAYER ----
      if (e < 0.25) { // lounge pad
        if (st === 0) ch.slice(0, 3).forEach((f, i) => this.tone(f * k, t, barLen * 0.96, { type: 'triangle', gain: 0.045, attack: 0.16, filter: 1700, q: 0.3, detune: (i - 1) * 5 }));
      } else if (e < 0.55) { // oompah / accordion offbeat stabs — silly & fun
        if (st === 2 || st === 6 || st === 10 || st === 14)
          [ch[0], ch[2]].forEach((f, i) => this.tone(f * 2 * k, t, spb * 1.5, { type: 'square', gain: 0.05, attack: 0.005, filter: 2600, detune: i ? 7 : -7 }));
      } else { // rave saw stabs
        if (st % 4 === 2) ch.forEach((f, i) => this.tone(f * 2 * k, t, spb * 1.3, { type: 'sawtooth', gain: 0.05, attack: 0.004, filter: lerp(3600, 7000, e), q: 1.2, detune: (i - 1.5) * 8 }));
      }

      // ---- BASS ----
      if (e < 0.12) { // half notes, warm sine
        if (st === 0) this.tone(root, t, spb * 7, { type: 'sine', gain: 0.16, attack: 0.02, filter: 320 });
        if (st === 8) this.tone(root * 1.5, t, spb * 6, { type: 'sine', gain: 0.12, attack: 0.02, filter: 330 });
      } else if (e < 0.25) { // quarters — beat becomes explicit
        if (st % 4 === 0) this.tone(root * (st === 8 ? 1.5 : 1), t, spb * 2.4, { type: 'triangle', gain: 0.16, attack: 0.012, filter: 420 });
      } else if (e < 0.4) { // polka root-fifth
        if (st % 4 === 0) this.tone(root, t, spb * 1.7, { type: 'triangle', gain: 0.17, attack: 0.008, filter: 520 });
        if (st % 4 === 2) this.tone(root * 1.5, t, spb * 1.7, { type: 'triangle', gain: 0.14, attack: 0.008, filter: 520 });
      } else if (e < 0.7) { // walking 8ths
        if (st % 2 === 0) { const step = [1, 1, 1.5, 1, 2, 1.5, 1, 0.75][(st / 2) | 0]; this.tone(root * step, t, spb * 1.6, { type: 'sawtooth', gain: 0.14, attack: 0.007, filter: 700, q: 1 }); }
      } else { // driving rave 8ths with octave hops
        if (st % 2 === 0) this.tone(root * (st % 8 === 4 ? 2 : 1), t, spb * 1.4, { type: 'sawtooth', gain: 0.15, attack: 0.005, filter: 950 + mad * 400, q: 1.3 });
      }

      // ---- LEAD MELODY (A/B patterns alternate per phrase) ----
      const mels = this._mels || (this._mels = [this._buildMelA(), this._buildMelB(), this._buildMelC(), this._buildMelD()]);
      const mel = mels[phrase];
      if (mel[s]) {
        const oct = e > 0.55 ? 2 : 1;
        const type = e < 0.3 ? 'triangle' : e < 0.65 ? 'square' : 'sawtooth';
        this.tone(mel[s] * oct * k, t, spb * (e > 0.55 ? 2 : 3) * 0.85, { type, gain: lerp(0.1, 0.13, e), attack: 0.018, vib: lerp(5, 7.5, e), vibAmt: lerp(2.5, 5, e), filter: lerp(2600, 7000, e) });
      }

      // ---- ARPEGGIO — appears mid, doubles speed high ----
      if (e > 0.4) {
        const rate = e > 0.72 ? 1 : 2;
        if (st % rate === 0) { const ai = ((s / rate) | 0) % 4; const oct = e > 0.72 ? (2 + (((s / 4) | 0) % 2)) : 2;
          this.tone(ch[ai] * oct * k, t, spb * 0.85, { type: 'square', gain: lerp(0.035, 0.07, e), attack: 0.004, filter: lerp(3200, 8000, e) }); }
      }

      // ---- madness extras ----
      if (mad > 0.15 && Math.random() < 0.2 + mad * 0.2) this.tone(ch[(Math.random() * 4) | 0] * 4 * k, t, spb * 0.5, { type: 'triangle', gain: 0.045, attack: 0.003, filter: 9000 });
      if (mad > 0.4 && st === 0 && bar === 0) this.tone(600 * k, t, barLen * 0.5, { type: 'sawtooth', gain: 0.035, attack: 0.05, filter: 2400, slide: 1200 * k }); // siren ramp

      // ---- DRUMS ----
      if (e < 0.12) { // lounge: brushes only
        if (st === 4 || st === 12) this.rim(t);
        if (st % 4 === 2) this.shaker(t);
      } else if (e < 0.25) { // beat kicks in
        if (st === 0 || st === 8) this.kick(t);
        if (st === 4 || st === 12) this.rim(t);
        if (st % 2 === 0) this.chat(t, 0.035);
      } else if (e < 0.4) { // polka bounce
        if (st === 0 || st === 8) this.kick(t);
        if (st === 4 || st === 12) this.clap(t);
        if (st % 2 === 1) this.chat(t, 0.04);
      } else if (e < 0.7) { // funk backbeat
        if (st === 0 || st === 7 || st === 8) this.kick(t);
        if (st === 4 || st === 12) this.clap(t);
        if (st % 2 === 0) this.chat(t, 0.045); if (st === 14) this.ohat(t, 0.06);
      } else { // four-on-floor rave
        if (st % 4 === 0) this.kick(t, true);
        if (st === 4 || st === 12) this.clap(t);
        if (st % 2 === 1) this.ohat(t, st === 15 ? 0.09 : 0.055);
        if (mad > 0.3 && st % 2 === 0) this.chat(t, 0.05);
      }
      // ---- colour layers per tier — разнообразие тембров ----
      if (e < 0.12 && bar === 1 && (st === 0 || st === 4 || st === 8)) this.tone(ch[((st / 4) | 0) % 4] * 4 * k, t, spb * 3, { type: 'sine', gain: 0.05, attack: 0.01, filter: 6000 }); // колокольчики в лаунже
      if (e >= 0.4 && e < 0.7 && bar % 2 === 1 && (st === 6 || st === 13)) this.tone(760, t, spb * 0.8, { type: 'square', gain: 0.05, attack: 0.004, filter: 2400, q: 3 }); // ковбелл в фанке
      if (e >= 0.7 && st === 14) ch.slice(0, 3).forEach((f, i) => this.tone(f * 2 * k, t, spb * 0.9, { type: 'sawtooth', gain: 0.038, attack: 0.004, detune: (i - 1) * 18, filter: 5200, q: 2 })); // hoover-стаб
      if (e >= 0.55 && st === 0 && bar === 0) this.noise(0.32, 0.06, 6200, t, true, this.drum); // сплэш в начале фразы
      if (e > 0.3 && phraseN % 2 === 1 && bar === 3 && st >= 8 && st % 2 === 0) this.tone(320 - (st - 8) * 22, t, spb * 1.4, { type: 'sine', gain: 0.13, attack: 0.005, dest: this.drum }); // том-филл
      if (e > 0.25 && hash(this._abs) > 0.93) this.tone(ch[(hash(this._abs + 9) * 4) | 0] * 3 * k, t, spb * 0.5, { type: 'triangle', gain: 0.045, attack: 0.004, filter: 5200 }); // случайный форшлаг
      if (mad > 0.25 && st === 8 && bar === 2) this.tone(300 * k, t, spb * 3, { type: 'square', gain: 0.04, attack: 0.01, slide: 900 * k, filter: 3600 }); // весёлый "вжух"
      // phrase-end snare fill
      if (e > 0.35 && bar === 3 && st >= 12) this.snare(t, 0.06 + (st - 12) * 0.03);
    }
    _buildMelA() {
      const m = new Array(64).fill(0), set = (bar, obj) => { for (const q in obj) m[bar * 16 + (+q)] = obj[q]; };
      set(0, { 0: N.A3, 4: N.C4, 6: N.D4, 10: N.F4, 14: N.E4 });
      set(1, { 2: N.B3, 6: N.D4, 8: N.G4, 12: N.F4, 14: N.D4 });
      set(2, { 0: N.C4, 4: N.E4, 6: N.G4, 10: N.C5, 14: N.G4 });
      set(3, { 2: N.E4, 6: N.C4, 8: N.A3, 12: N.G3, 14: N.B3 });
      return m;
    }
    _buildMelB() {
      const m = new Array(64).fill(0), set = (bar, obj) => { for (const q in obj) m[bar * 16 + (+q)] = obj[q]; };
      set(0, { 0: N.C4, 3: N.E4, 6: N.G4, 8: N.A4, 11: N.G4, 14: N.E4 });
      set(1, { 0: N.D4, 3: N.F4, 6: N.G4, 10: N.B4, 14: N.G4 });
      set(2, { 0: N.E4, 2: N.G4, 4: N.C5, 8: N.B4, 10: N.G4, 14: N.E4 });
      set(3, { 0: N.F4, 4: N.A4, 6: N.C5, 8: N.E5, 12: N.C5, 14: N.B4 });
      return m;
    }
    _buildMelC() { // синкопа — оффбитный прыгающий мотив
      const m = new Array(64).fill(0), set = (bar, obj) => { for (const q in obj) m[bar * 16 + (+q)] = obj[q]; };
      set(0, { 2: N.F4, 5: N.A4, 8: N.D4, 11: N.F4, 14: N.C5 });
      set(1, { 2: N.G4, 5: N.B4, 8: N.D5, 11: N.B4, 14: N.G4 });
      set(2, { 2: N.E4, 5: N.G4, 8: N.C5, 10: N.E5, 14: N.C5 });
      set(3, { 2: N.A4, 5: N.C5, 8: N.E4, 11: N.G4, 14: N.B4 });
      return m;
    }
    _buildMelD() { // сбегающая вниз дорожка с подскоком
      const m = new Array(64).fill(0), set = (bar, obj) => { for (const q in obj) m[bar * 16 + (+q)] = obj[q]; };
      set(0, { 0: N.D5, 2: N.C5, 4: N.A4, 6: N.F4, 10: N.A4, 14: N.D4 });
      set(1, { 0: N.D5, 2: N.B4, 4: N.G4, 6: N.D4, 10: N.G4, 14: N.B4 });
      set(2, { 0: N.E5, 2: N.C5, 4: N.G4, 6: N.E4, 10: N.G4, 14: N.C5 });
      set(3, { 0: N.C5, 3: N.A4, 6: N.F4, 8: N.G4, 10: N.A4, 12: N.B4, 14: N.C5 });
      return m;
    }
  }

  // ===========================================================================
  //  ENGINE
  // ===========================================================================
  export class CrashEngine {
    constructor(canvas, opts = {}) {
      this.canvas = canvas; this.ctx = canvas.getContext('2d');
      this.onState = opts.onState || (() => {}); this.onRoundEnd = opts.onRoundEnd || (() => {}); this.onEvent = opts.onEvent || (() => {});
      this.synth = new Synth(); this.mode = 'random'; this._rng = opts.rng || Math.random;
      // надписи сцены — локализуются страницей через setTexts()
      this.texts = { idle: 'Сделай ставку, чтобы начать', lost: 'БЛЕВАНУЛ', won: 'ВЫЖИЛ!', finale: 'VODKA WIN!', ...(opts.texts || {}) };
      // house edge = 1 - RTP. В бою значение приходит из game.rtp (админка/БД), как в рулетке.
      this.houseEdge = (opts.rtp > 0 && opts.rtp <= 1) ? (1 - opts.rtp) : HOUSE_EDGE;
      this.W = 0; this.H = 0; this.dpr = 1; this.particles = [];
      this.shake = 0; this.flash = 0; this.last = 0; this.raf = 0;
      this._emitAcc = 0; this._prevStage = -1; this._drinkT = 0; this._drinkN = 0; this._burpT = 0;
      this._prevGulp = 0; this._prevHic = 0; this._pump = 0;
      this._bubble = null; this.fastMode = false; this._fastHold = 0; this.autoAt = null; this._prevDrink = null; this._crashKnown = true;
      this.resetRound('idle', performance.now());
      this._ro = new ResizeObserver(() => this.resize()); this._ro.observe(canvas.parentElement || canvas); this.resize();
    }
    start() { if (this.raf) return; this.last = performance.now(); this.loop(this.last); }
    destroy() { cancelAnimationFrame(this.raf); this.raf = 0; this._ro.disconnect(); this.synth.stopMusic(); }
    resumeAudio() { this.synth.resume(); }
    setSound(v) { this.synth.setOn(v); }
    setMode(m) { this.mode = m; }
    setTexts(t) { this.texts = { ...this.texts, ...(t || {}) }; }
    // RTP (0..1) => house edge. Меняет ТОЛЬКО математику точки краша, плоско на всех целях.
    setRtp(rtp) { if (rtp > 0 && rtp <= 1) this.houseEdge = 1 - rtp; }
    getRtp() { return 1 - this.houseEdge; }
    setFast(v) { this.fastMode = !!v; }
    resize() {
      const r = (this.canvas.parentElement || this.canvas).getBoundingClientRect();
      this.dpr = Math.min(2, window.devicePixelRatio || 1);
      this.W = Math.max(320, r.width); this.H = Math.max(280, r.height);
      this.canvas.width = Math.round(this.W * this.dpr); this.canvas.height = Math.round(this.H * this.dpr);
      this.canvas.style.width = this.W + 'px'; this.canvas.style.height = this.H + 'px';
    }
    resetRound(phase, now) {
      this.phase = phase; this.phaseStart = now; this.mult = 1;
      this._prevStage = -1; this._drinkT = 0; this._drinkN = 0; this._pump = 0; this._bubble = null; this._fastHold = 0; this._hideMult = false;
      if (phase === 'idle') { this.betActive = false; this.cashedAt = null; this.lost = false; this.finale = false; this.autoAt = null; this._crashKnown = true; }
    }
    // placeBet starts the round immediately (no timer). autoAt — цель авто-кэшаута.
    // serverCrashPoint: известная точка краша (турбо/деморежим); null — серверный
    // раунд, исход неизвестен до settleFromServer(). elapsedMs — сколько раунд уже
    // летит по серверным часам (компенсация сетевой задержки).
    placeBet(autoAt, serverCrashPoint, elapsedMs) {
      if (this.phase !== 'idle') return;
      this.autoAt = (autoAt && autoAt > 1) ? autoAt : null;
      this.betActive = true; this.cashedAt = null; this.lost = false; this.finale = false;
      this.mult = 1; this._prevStage = -1; this._drinkT = 0; this._drinkN = 0; this._pump = 0; this._bubble = null; this._prevDrink = null; this._hideMult = false;
      this._nextPhraseAt = performance.now() + rand(1800, 4200);
      // Серверный раунд: crashPoint скрыт (иначе его можно подсмотреть в devtools),
      // движок растит множитель по общей кривой до ответа сервера.
      this._crashKnown = this.mode === 'scripted' || serverCrashPoint != null;
      this.crashPoint = this.mode === 'scripted' ? MAXMULT
        : (serverCrashPoint != null ? serverCrashPoint : MAXMULT);
      // турбо-прокрутка возможна только с известным исходом (мгновенный ответ сервера)
      if (this.fastMode && this._crashKnown) {
        // турбо: персонаж сразу на финальной стадии; короткая интрига — число скрыто и раскроется вместе с результатом
        this.mult = this.crashPoint;
        this._fastHold = 0.45;
        this._hideMult = true;
        this._prevStage = stageIndexFor(this.mult);
        this._drinkT = 0.4;
        const nowMs = performance.now();
        this._bubble = { text: PHRASES[(Math.random() * PHRASES.length) | 0], born: nowMs, until: nowMs + 3400 };
      }
      this.phase = 'running'; this.phaseStart = performance.now() - (elapsedMs > 0 ? elapsedMs : 0);
      this.onEvent('roundStart', this.crashPoint);
    }
    // Финализация серверного раунда: сервер прислал точку краша и (для победы)
    // множитель кэшаута. Единственный источник правды о деньгах — этот вызов.
    settleFromServer(crashPoint, cashedAt) {
      if (this.phase !== 'running') return;
      this._crashKnown = true;
      this.crashPoint = crashPoint > 1 ? crashPoint : 1;
      if (cashedAt != null) {
        if (this.cashedAt == null) { this.cashedAt = cashedAt; this.synth.cashout(); this.onEvent('cashout', cashedAt); }
        this.mult = this.crashPoint;
      }
      this._resolve(performance.now());
    }
    cancelBet() { if (this.phase === 'running' && this.betActive && this.cashedAt == null && this.mult < 1.02) { this.betActive = false; this.resetRound('idle', performance.now()); return true; } return false; }
    cashOut() {
      if (this.phase === 'running' && this.betActive && this.cashedAt == null) {
        if (!this._crashKnown) return null; // серверный раунд: кэшаут делает страница через API
        if (this.fastMode && this._fastHold > 0) return null; // в турбо решает авто-кэшаут
        this.cashedAt = this.mult; this.mult = this.crashPoint; // забрал — сразу к финальной стадии
        this.synth.cashout(); this.onEvent('cashout', this.cashedAt);
        this._resolve(performance.now()); // резолвим сразу — икс и надпись «ВЫЖИЛ» синхронно
        return this.cashedAt;
      }
      return null;
    }
    // единая точка завершения раунда — икс, флеш, звук и надпись выставляются в одном кадре
    _resolve(now) {
      if (this.phase === 'crashed') return;
      this._hideMult = false; this._fastHold = 0;
      this.mult = Math.min(this.mult, this.crashPoint); // никаких 1.01M
      this.finale = this.crashPoint >= MAXMULT * 0.999;
      // дошёл до 1M — джекпот выплачивается даже без кэшаута
      if (this.finale && this.betActive && this.cashedAt == null) { this.cashedAt = MAXMULT; this.synth.cashout(); this.onEvent('cashout', MAXMULT); }
      this.lost = this.betActive && this.cashedAt == null;
      const won = this.betActive && this.cashedAt != null && !this.finale;
      this.phase = 'crashed'; this.phaseStart = now;
      this.flash = won ? 0.5 : 1; this._flashCol = this.finale ? '#fff' : won ? C.mint : C.red;
      this.shake = this.finale ? 2.6 : won ? 0.7 : 1.6;
      this.burst(this.finale ? 60 : won ? 16 : 24);
      // выиграл — без звука краша, просто показываем до куда дошёл персонаж
      if (this.finale) this.synth.finale(); else if (this.lost) this.synth.crash();
      if (this.lost) this._bubble = { text: 'бууэ…', born: now, until: now + 2600 };
      this.onEvent(this.finale ? 'finale' : 'crash', this.crashPoint);
      this.onRoundEnd(this.crashPoint, { finale: this.finale, lost: this.lost, cashedAt: this.cashedAt });
    }
    CRASH_MS = 3600;

    loop(now) { this.raf = requestAnimationFrame((t) => this.loop(t)); let dt = (now - this.last) / 1000; this.last = now; dt = Math.min(dt, 0.05); this.update(dt, now); this.draw(now); }

    update(dt, now) {
      const el = now - this.phaseStart;
      if (this.phase === 'running') {
        if (this._fastHold > 0) { this._fastHold -= dt; }
        else if (!this.fastMode || !this._crashKnown) {
          // Множитель — замкнутая функция времени (та же кривая, что валидирует
          // сервер), а не покадровое интегрирование: клиент и сервер сходятся.
          this.mult = Math.min(multiplierAt((now - this.phaseStart) / 1000), this.crashPoint);
        }
        // Авто-кэшаут отыгрывается движком только когда точка краша известна
        // (турбо/деморежим); в серверном раунде исход присылает settleFromServer.
        if (this._crashKnown && this._fastHold <= 0 && this.betActive && this.cashedAt == null && this.autoAt && this.autoAt <= this.crashPoint && this.mult >= this.autoAt) {
          this.cashedAt = this.autoAt; this.mult = this.crashPoint; this.synth.cashout(); this.onEvent('cashout', this.cashedAt);
        }
        const idx = stageIndexFor(this.mult);
        if (idx !== this._prevStage) {
          if (this._prevStage >= 0) { this.shake = Math.min(1.2, this.shake + 0.3); this.burst(4 + idx * 0.3); this._pump = 1; this.onEvent('stage', idx); }
          this._prevStage = idx;
        }
        // случайные алкашные фразы в облачке, пока растёт икс
        if (this.betActive && now >= (this._nextPhraseAt || 0) && (!this._bubble || now > this._bubble.until)) {
          this._bubble = { text: PHRASES[(Math.random() * PHRASES.length) | 0], born: now, until: now + 3400 };
          this._nextPhraseAt = now + rand(4500, 9500);
        }
        const look = computeLook(this.mult, idx);
        this.synth.setEnergy(this.mult);
        this._drinkT += dt;
        if (this._drinkT >= look.drinkSpeed) { this._drinkT = 0; this._drinkN++; this.synth.glug(); if (Math.random() < 0.45) this._burpT = 0.0001; }
        if (look.drink !== this._prevDrink) { if (this._prevDrink && this.betActive) this.synth.pop(); this._prevDrink = look.drink; }
        if (Math.random() < look.chaos * 0.5) this.spawnParticle(look);
        if (this._crashKnown && this.mult >= this.crashPoint && this._fastHold <= 0) { this._resolve(now); }
      } else if (this.phase === 'crashed') {
        // проиграл — персонаж блюёт: струя зелёных частиц изо рта
        if (this.lost && el < 1700 && Math.random() < 0.85) {
          const vsc = clamp(Math.min(this.W, this.H) / 520, 0.62, 1.25);
          const mx = this.W * 0.5 + 26 * vsc, my = this.H * 0.78 - 148 * vsc;
          for (let i = 0; i < 2; i++) this.particles.push({ kind: 'vomit', x: mx + rand(-4, 6), y: my + rand(-4, 4), vx: rand(60, 170) * vsc, vy: rand(-40, 30), rot: 0, vr: 0, life: 0, ttl: rand(0.5, 0.95), size: rand(4, 9) * vsc, hue: 0, color: ['#7fd44a', '#5cb437', '#a4e05a'][(Math.random() * 3) | 0] });
        }
        const dur = this.finale ? 4200 : this.fastMode ? 1400 : this.CRASH_MS;
        if (el >= dur) this.resetRound('idle', now);
      } else { this.synth.setEnergy(1); } // idle: music relaxes back to lounge
      this.shake = Math.max(0, this.shake - dt * 2.2); this.flash = Math.max(0, this.flash - dt * 1.8);
      this._pump = Math.max(0, this._pump - dt * 0.9);
      if (this._burpT) { this._burpT += dt; if (this._burpT > 0.18) { this.synth.burp(); this._burpT = 0; } }
      this.stepParticles(dt);
      this._emitAcc += dt;
      if (this._emitAcc >= 0.05 || this.phase !== this._lastPhase) {
        this._emitAcc = 0; this._lastPhase = this.phase; const idx = stageIndexFor(this.mult);
        this.onState({ phase: this.phase, multiplier: this.mult, crashPoint: this.crashPoint, stageIndex: idx, stageLabel: STAGES[idx].t, betActive: this.betActive, cashedAt: this.cashedAt, countdown: 0 });
      }
    }

    spawnParticle(look) {
      const kind = look.pixelate && Math.random() < 0.4 ? 'pixel' : look.fire && Math.random() < 0.3 ? 'fire' : look.smoke && Math.random() < 0.25 ? 'smoke' : look.env === 'cosmic' && Math.random() < 0.4 ? 'star' : Math.random() < 0.5 ? 'bottle' : 'bubble';
      this.particles.push(this.mkParticle(kind));
    }
    burst(n) { const look = computeLook(this.mult, stageIndexFor(this.mult)); for (let i = 0; i < n; i++) this.particles.push(this.mkParticle(Math.random() < 0.6 ? 'bottle' : (look.env === 'cosmic' ? 'star' : 'bubble'))); }
    mkParticle(kind) {
      const cx = this.W * 0.5, cy = this.H * 0.6, bottleCols = ['#3f7a3a', '#6a1f3a', 'rgba(220,235,255,0.85)'], starCols = ['#fff', C.sky, C.bubble, C.mint];
      return { kind, x: cx + rand(-60, 60), y: cy + rand(-40, 20), vx: rand(-130, 130), vy: rand(-260, -60), rot: rand(0, 6.28), vr: rand(-6, 6), life: 0, ttl: rand(1.1, 2.4), size: rand(8, 22), hue: rand(0, 360), color: kind === 'bottle' ? bottleCols[(Math.random() * 3) | 0] : kind === 'star' ? starCols[(Math.random() * 4) | 0] : null };
    }
    stepParticles(dt) {
      for (const p of this.particles) { p.life += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt; if (p.kind !== 'star') p.vy += 320 * dt; if (p.kind === 'smoke' || p.kind === 'fire') { p.vy -= 120 * dt; p.vx *= 0.98; } if (p.kind === 'vomit' && p.y > this.H * 0.78) p.life = p.ttl; }
      this.particles = this.particles.filter((p) => p.life < p.ttl && p.y < this.H + 60);
      if (this.particles.length > 220) this.particles.splice(0, this.particles.length - 220);
    }

    // =========================================================================
    //  DRAW
    // =========================================================================
    draw(now) {
      const ctx = this.ctx, W = this.W, H = this.H;
      const engaged = (this.phase === 'running' || this.phase === 'crashed') && this.betActive;
      const shownM = engaged ? this.mult : 1;
      const idx = stageIndexFor(this.mult);
      const look = computeLook(shownM, engaged ? idx : 0); look.engaged = engaged;
      ctx.save(); ctx.scale(this.dpr, this.dpr); ctx.clearRect(0, 0, W, H);
      const sh = this.shake * (8 + look.chaos * 22); ctx.translate(rand(-sh, sh), rand(-sh, sh));
      const t = now / 1000;
      this.drawBackground(ctx, W, H, look, t);
      this.drawParticles(ctx, false, look);
      this.drawCharacter(ctx, W, H, look, t);
      this.drawParticles(ctx, true, look);
      this.drawMultiplier(ctx, W, H, look, t);
      this.drawBubble(ctx, W, H, look, t);
      this.drawOverlay(ctx, W, H, look, now);
      if (this.flash > 0) { ctx.globalAlpha = this.flash * (this.finale ? 0.9 : 0.5); ctx.fillStyle = this._flashCol || C.red; ctx.fillRect(-40, -40, W + 80, H + 80); ctx.globalAlpha = 1; }
      ctx.restore();
    }

    vgrad(ctx, x, y0, y1, c0, c1) { const g = ctx.createLinearGradient(x, y0, x, y1); g.addColorStop(0, c0); g.addColorStop(1, c1); return g; }

    drawBackground(ctx, W, H, look, t) {
      const env = look.env; let top, mid, bot;
      if (env === 'office') { top = '#241d40'; mid = '#171232'; bot = '#0b0a1c'; }
      else if (env === 'bar') { top = '#2e1c42'; mid = '#1c1230'; bot = '#0d0a1a'; }
      else if (env === 'street') { top = '#1a2748'; mid = '#111a34'; bot = '#0a0c18'; }
      else if (env === 'trash') { top = '#231a2e'; mid = '#160f20'; bot = '#0a0810'; }
      else { top = '#331d4e'; mid = '#180d2e'; bot = '#05030f'; }
      const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, top); g.addColorStop(0.55, mid); g.addColorStop(1, bot);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      const vg = ctx.createRadialGradient(W / 2, H * 0.5, Math.min(W, H) * 0.3, W / 2, H * 0.5, Math.max(W, H) * 0.75);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.42)'); ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);

      const fy = H * 0.78;
      this.drawEnvProps(ctx, W, H, fy, look, t);
      ctx.fillStyle = this.vgrad(ctx, 0, fy, H, 'rgba(255,255,255,0.05)', 'rgba(255,255,255,0.01)'); ctx.fillRect(0, fy, W, H - fy);
      ctx.strokeStyle = 'rgba(255,255,255,0.09)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, fy); ctx.lineTo(W, fy); ctx.stroke();
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(W * 0.5, fy + 5, clamp(W * 0.17, 74, 158), 15, 0, 0, 6.28); ctx.fill();
    }

    drawEnvProps(ctx, W, H, fy, look, t) {
      const env = look.env; ctx.save();
      if (env === 'office') {
        // panoramic window + skyline
        const wx = W * 0.05, wy = H * 0.1, ww = W * 0.34, wh = H * 0.4;
        const sky = ctx.createLinearGradient(0, wy, 0, wy + wh); sky.addColorStop(0, 'rgba(60,80,150,0.28)'); sky.addColorStop(1, 'rgba(20,26,60,0.28)');
        ctx.fillStyle = sky; ctx.fillRect(wx, wy, ww, wh);
        for (let i = 0; i < 9; i++) { const bw = ww / 9, bx = wx + i * bw, bh = hrange(i, wh * 0.35, wh * 0.9); ctx.fillStyle = 'rgba(18,22,48,0.7)'; ctx.fillRect(bx + 1, wy + wh - bh, bw - 2, bh);
          for (let w = 0; w < 8; w++) if (hash(i * 9 + w) > 0.45) { ctx.fillStyle = hash(i + w) > 0.5 ? 'rgba(255,216,110,0.55)' : 'rgba(124,196,255,0.45)'; ctx.fillRect(bx + 3 + (w % 2) * (bw / 2), wy + wh - bh + 6 + Math.floor(w / 2) * (wh / 8), bw / 3.4, 5); } }
        ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.lineWidth = 3; ctx.strokeRect(wx, wy, ww, wh);
        ctx.beginPath(); ctx.moveTo(wx + ww / 2, wy); ctx.lineTo(wx + ww / 2, wy + wh); ctx.moveTo(wx, wy + wh / 2); ctx.lineTo(wx + ww, wy + wh / 2); ctx.stroke();
        // hanging lamp + warm cone
        const lx = W * 0.5; ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(lx, 0); ctx.lineTo(lx, H * 0.11); ctx.stroke();
        ctx.fillStyle = '#2a2440'; ctx.beginPath(); ctx.moveTo(lx - 20, H * 0.11); ctx.lineTo(lx + 20, H * 0.11); ctx.lineTo(lx + 12, H * 0.135); ctx.lineTo(lx - 12, H * 0.135); ctx.closePath(); ctx.fill();
        const cone = ctx.createLinearGradient(0, H * 0.135, 0, H * 0.5); cone.addColorStop(0, 'rgba(255,216,110,0.16)'); cone.addColorStop(1, 'rgba(255,216,110,0)');
        ctx.fillStyle = cone; ctx.beginPath(); ctx.moveTo(lx - 12, H * 0.135); ctx.lineTo(lx + 12, H * 0.135); ctx.lineTo(lx + 120, H * 0.5); ctx.lineTo(lx - 120, H * 0.5); ctx.closePath(); ctx.fill();
        // wall clock — hands spin comically faster as chaos grows
        const cx2 = W * 0.8, cy2 = H * 0.34, cr = clamp(W * 0.035, 16, 24);
        ctx.fillStyle = '#efeaf6'; ctx.strokeStyle = C.outline; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(cx2, cy2, cr, 0, 6.28); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = '#3a3356'; ctx.lineWidth = 2;
        for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; ctx.beginPath(); ctx.moveTo(cx2 + Math.cos(a) * cr * 0.82, cy2 + Math.sin(a) * cr * 0.82); ctx.lineTo(cx2 + Math.cos(a) * cr * 0.92, cy2 + Math.sin(a) * cr * 0.92); ctx.stroke(); }
        const spin = t * (0.5 + look.chaos * 14);
        ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cx2, cy2); ctx.lineTo(cx2 + Math.cos(spin) * cr * 0.6, cy2 + Math.sin(spin) * cr * 0.6); ctx.stroke();
        ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx2, cy2); ctx.lineTo(cx2 + Math.cos(spin * 0.4 + 2) * cr * 0.42, cy2 + Math.sin(spin * 0.4 + 2) * cr * 0.42); ctx.stroke();
        // water cooler
        const kx = W * 0.78;
        ctx.fillStyle = '#d8d4e4'; ctx.strokeStyle = C.outline; ctx.lineWidth = 3;
        ctx.fillRect(kx - 15, fy - 52, 30, 52); ctx.strokeRect(kx - 15, fy - 52, 30, 52);
        ctx.fillStyle = 'rgba(124,196,255,0.55)'; ctx.beginPath(); ctx.moveTo(kx - 12, fy - 52); ctx.lineTo(kx + 12, fy - 52); ctx.lineTo(kx + 9, fy - 74); ctx.lineTo(kx - 9, fy - 74); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = C.sky; ctx.fillRect(kx - 6, fy - 40, 4, 5); ctx.fillStyle = '#8a86a0'; ctx.fillRect(kx + 2, fy - 40, 4, 5);
        this.plant(ctx, W * 0.9, fy);
      } else if (env === 'bar') {
        const sy = H * 0.2; ctx.fillStyle = 'rgba(255,216,110,0.06)'; ctx.fillRect(W * 0.04, sy - 10, W * 0.92, 6);
        for (let r = 0; r < 2; r++) { const y = sy + r * H * 0.15; ctx.strokeStyle = 'rgba(120,90,60,0.45)'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(W * 0.05, y); ctx.lineTo(W * 0.95, y); ctx.stroke();
          for (let i = 0; i < 13; i++) { const x = W * 0.09 + i * (W * 0.82 / 13); this.bottleShape(ctx, x, y, 6, hrange(i + r * 13, 20, 34), ['#3f7a3a', '#6a1f3a', 'rgba(220,235,255,0.7)', '#caa24a', '#7EE7C7'][i % 5], 0, true); } }
        // neon sign
        ctx.save(); ctx.globalAlpha = 0.8 + 0.2 * Math.sin(t * 3); ctx.fillStyle = C.bubble; ctx.shadowColor = C.bubble; ctx.shadowBlur = 16; ctx.font = '900 20px Unbounded, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('БАР', W * 0.5, H * 0.12); ctx.restore();
        // dartboard with darts
        const dx = W * 0.82, dy = H * 0.34, dr = clamp(W * 0.04, 18, 26);
        ctx.strokeStyle = C.outline; ctx.lineWidth = 3;
        ctx.fillStyle = '#caa24a'; ctx.beginPath(); ctx.arc(dx, dy, dr, 0, 6.28); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#8a2f2f'; ctx.beginPath(); ctx.arc(dx, dy, dr * 0.66, 0, 6.28); ctx.fill();
        ctx.fillStyle = '#efeaf6'; ctx.beginPath(); ctx.arc(dx, dy, dr * 0.36, 0, 6.28); ctx.fill();
        ctx.fillStyle = '#8a2f2f'; ctx.beginPath(); ctx.arc(dx, dy, dr * 0.12, 0, 6.28); ctx.fill();
        ctx.strokeStyle = '#2f2a48'; ctx.lineWidth = 2;
        for (const [ang, len] of [[-0.5, 1], [0.7, 0.4], [2.6, 0.7]]) { const px = dx + Math.cos(ang) * dr * len * 0.5, py = dy + Math.sin(ang) * dr * len * 0.5;
          ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + 10, py - 8); ctx.stroke(); ctx.fillStyle = C.sun; ctx.fillRect(px + 8, py - 11, 5, 5); }
      } else if (env === 'street') {
        ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.beginPath(); ctx.arc(W * 0.84, H * 0.16, 26, 0, 6.28); ctx.fill();
        ctx.fillStyle = 'rgba(20,26,52,0.85)'; ctx.beginPath(); ctx.arc(W * 0.8, H * 0.14, 24, 0, 6.28); ctx.fill();
        for (let layer = 0; layer < 2; layer++) { const alpha = layer ? 0.14 : 0.24; const off = layer ? H * 0.06 : 0;
          for (let i = 0; i < 7; i++) { const bw = W * 0.14, bx = i * bw * 1.02 + layer * 20, bh = hrange(i + layer * 7, H * 0.2, H * 0.5); ctx.fillStyle = `rgba(30,36,70,${alpha})`; ctx.fillRect(bx, fy - bh - off, bw * 0.92, bh);
            if (!layer) for (let w = 0; w < 6; w++) if (hash(i * 7 + w) > 0.5) { ctx.fillStyle = 'rgba(255,216,110,0.32)'; ctx.fillRect(bx + 6 + (w % 2) * 18, fy - bh + 10 + Math.floor(w / 2) * 22, 8, 10); } } }
        ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(W * 0.16, fy); ctx.lineTo(W * 0.16, H * 0.2); ctx.lineTo(W * 0.27, H * 0.2); ctx.stroke();
        const lg = ctx.createRadialGradient(W * 0.27, H * 0.23, 2, W * 0.27, H * 0.23, 60); lg.addColorStop(0, 'rgba(255,216,110,0.45)'); lg.addColorStop(1, 'rgba(255,216,110,0)'); ctx.fillStyle = lg; ctx.beginPath(); ctx.arc(W * 0.27, H * 0.23, 60, 0, 6.28); ctx.fill();
        // cigarette butt with smoke wisp
        const cgx = W * 0.63, cgy = fy + 8;
        ctx.fillStyle = '#e8e4f0'; ctx.fillRect(cgx, cgy - 2, 11, 3); ctx.fillStyle = '#ff8a4a'; ctx.fillRect(cgx + 11, cgy - 2, 3, 3);
        ctx.strokeStyle = 'rgba(200,200,215,0.35)'; ctx.lineWidth = 2; ctx.beginPath();
        for (let i = 0; i < 14; i++) { const yy = cgy - 4 - i * 5; ctx.lineTo(cgx + 12 + Math.sin(t * 2 + i * 0.8) * (3 + i * 0.7), yy); } ctx.stroke();
      } else if (env === 'trash') {
        ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 6; for (let i = 0; i < 18; i++) { const x = W * 0.03 + i * (W * 0.94 / 18); ctx.beginPath(); ctx.moveTo(x, fy); ctx.lineTo(x, H * 0.28); ctx.stroke(); }
        ctx.beginPath(); ctx.moveTo(W * 0.03, H * 0.4); ctx.lineTo(W * 0.97, H * 0.4); ctx.stroke();
        ctx.fillStyle = 'rgba(40,50,44,0.7)'; ctx.fillRect(W * 0.08, fy - 60, 70, 60); ctx.fillRect(W * 0.82, fy - 50, 60, 50);
        // rat peeking from the right dumpster, tail flicking
        const peek = clamp(Math.sin(t * 0.8), 0, 1);
        const rx = W * 0.82 + 30, ry = fy - 50 - peek * 9;
        ctx.fillStyle = '#4a4454'; ctx.strokeStyle = C.outline; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(rx, ry, 15, 8, 0, Math.PI, 0); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.arc(rx - 10, ry - 6, 4, 0, 6.28); ctx.fill(); ctx.beginPath(); ctx.arc(rx - 4, ry - 8, 4, 0, 6.28); ctx.fill();
        ctx.fillStyle = '#ffb3c8'; ctx.beginPath(); ctx.arc(rx - 10, ry - 7, 1.8, 0, 6.28); ctx.fill(); ctx.beginPath(); ctx.arc(rx - 4, ry - 9, 1.8, 0, 6.28); ctx.fill();
        ctx.fillStyle = '#160f1e'; ctx.beginPath(); ctx.arc(rx - 13, ry - 3, 1.4, 0, 6.28); ctx.fill();
        ctx.strokeStyle = '#4a4454'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(rx + 14, ry);
        ctx.quadraticCurveTo(rx + 26, ry - 4 + Math.sin(t * 5) * 4, rx + 32, ry + 2 + Math.sin(t * 5 + 1) * 3); ctx.stroke();
        // newspaper sheet
        ctx.fillStyle = 'rgba(220,216,228,0.5)'; ctx.save(); ctx.translate(W * 0.3, fy - 4); ctx.rotate(-0.08);
        ctx.fillRect(-16, -10, 32, 12); ctx.strokeStyle = 'rgba(80,80,96,0.5)'; ctx.lineWidth = 1;
        for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(-12, -7 + i * 3); ctx.lineTo(12, -7 + i * 3); ctx.stroke(); } ctx.restore();
      } else {
        const neb = ctx.createRadialGradient(W * 0.5, H * 0.42, 10, W * 0.5, H * 0.42, W * 0.62); neb.addColorStop(0, 'rgba(255,143,208,0.12)'); neb.addColorStop(0.5, 'rgba(124,196,255,0.07)'); neb.addColorStop(1, 'transparent'); ctx.fillStyle = neb; ctx.fillRect(0, 0, W, H);
        for (let i = 0; i < 80; i++) { const x = (i * 137.5) % W, y = (i * 91.3) % (H * 0.85); ctx.globalAlpha = 0.25 + 0.55 * Math.abs(Math.sin(t * 2 + i)); ctx.fillStyle = i % 3 ? C.sky : C.bubble; ctx.fillRect(x, y, 2, 2); } ctx.globalAlpha = 1;
        const pg = ctx.createRadialGradient(W * 0.82 - 8, H * 0.2 - 8, 4, W * 0.82, H * 0.2, 32); pg.addColorStop(0, '#c9b0ff'); pg.addColorStop(1, '#6b52a8'); ctx.fillStyle = pg; ctx.beginPath(); ctx.arc(W * 0.82, H * 0.2, 30, 0, 6.28); ctx.fill();
        ctx.strokeStyle = 'rgba(255,216,110,0.4)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(W * 0.82, H * 0.2, 48, 13, -0.4, 0, 6.28); ctx.stroke();
        const ss = (t * 0.4) % 4; if (ss < 1) { ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(W * 0.2 + ss * 120, H * 0.15 + ss * 40); ctx.lineTo(W * 0.2 + ss * 120 - 30, H * 0.15 + ss * 40 - 10); ctx.stroke(); }
        // glowing ground cracks under the floating drunk
        const gx = W * 0.5; ctx.strokeStyle = 'rgba(126,231,199,0.5)'; ctx.lineWidth = 2; ctx.shadowColor = C.mint; ctx.shadowBlur = 10;
        for (const [a0, a1, a2] of [[-70, -30, -46], [10, 44, 30], [-20, 12, 60]]) { ctx.beginPath(); ctx.moveTo(gx + a0, fy + 4); ctx.lineTo(gx + a2 * 0.5, fy + 9); ctx.lineTo(gx + a1, fy + 14); ctx.stroke(); }
        ctx.shadowBlur = 0;
      }
      ctx.restore();
    }

    // accumulating empties around the feet — mugs early, bottles later
    drawGroundClutter(ctx, look, t) {
      const n = clamp(Math.floor((look.idx - 2) / 2.2), 0, 10);
      const cols = ['#3f7a3a', '#6a1f3a', 'rgba(220,235,255,0.8)', '#caa24a'];
      for (let i = 0; i < n; i++) {
        const side = i % 2 ? 1 : -1;
        const x = side * hrange(i, 48, 100), y = -2;
        ctx.save(); ctx.translate(x, y);
        if (look.m < 11 || i < 3) { // tipped empty mugs
          ctx.rotate(side * (1.35 + hrange(i + 20, -0.2, 0.2)));
          ctx.fillStyle = 'rgba(220,214,232,0.85)'; ctx.strokeStyle = C.outline; ctx.lineWidth = 2.5;
          ctx.fillRect(-6, -16, 12, 16); ctx.strokeRect(-6, -16, 12, 16);
          ctx.beginPath(); ctx.arc(8, -8, 4, -1.3, 1.3); ctx.stroke();
        } else { // tipped bottles
          ctx.rotate(side * 1.5 + hrange(i + 20, -0.3, 0.3));
          this.bottleShape(ctx, 0, 0, 5, hrange(i + 5, 18, 26), cols[i % 4], 0, false);
        }
        ctx.restore();
      }
      // side table with snacks while indoors
      if (look.env === 'office' || look.env === 'bar') {
        const bx = -108;
        ctx.strokeStyle = C.outline; ctx.lineWidth = 4; ctx.fillStyle = '#6a5238';
        ctx.fillRect(bx - 16, -46, 32, 46); ctx.strokeRect(bx - 16, -46, 32, 46);
        ctx.fillStyle = '#d8d0e2'; ctx.beginPath(); ctx.ellipse(bx, -46, 20, 8, 0, 0, 6.28); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#caa24a'; for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(bx + hrange(i, -12, 12), -48 + hrange(i + 3, -2, 2), 2.4, 0, 6.28); ctx.fill(); }
      }
    }
    plant(ctx, x, fy) {
      ctx.fillStyle = '#c07a4a'; ctx.strokeStyle = C.outline; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(x - 14, fy); ctx.lineTo(x + 14, fy); ctx.lineTo(x + 10, fy - 22); ctx.lineTo(x - 10, fy - 22); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#3f7a4a';
      for (let i = -2; i <= 2; i++) { ctx.save(); ctx.translate(x, fy - 22); ctx.rotate(i * 0.35); ctx.beginPath(); ctx.ellipse(0, -22, 6, 22, 0, 0, 6.28); ctx.fill(); ctx.stroke(); ctx.restore(); }
    }

    bottleShape(ctx, x, baseY, w, h, color, rot, flat) {
      ctx.save(); ctx.translate(x, baseY); if (rot) ctx.rotate(rot);
      ctx.fillStyle = color; ctx.strokeStyle = C.outline; ctx.lineWidth = flat ? 0 : 2;
      ctx.beginPath(); ctx.moveTo(-w, 0); ctx.lineTo(-w, -h * 0.6); ctx.lineTo(-w * 0.4, -h * 0.78); ctx.lineTo(-w * 0.4, -h); ctx.lineTo(w * 0.4, -h); ctx.lineTo(w * 0.4, -h * 0.78); ctx.lineTo(w, -h * 0.6); ctx.lineTo(w, 0); ctx.closePath(); ctx.fill(); if (!flat) ctx.stroke();
      if (!flat) { ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(-w * 0.55, -h * 0.55, 2.5, h * 0.4); }
      ctx.restore();
    }
    wobblePath(ctx, pts, amp) { ctx.beginPath(); for (let i = 0; i < pts.length; i++) { const [x, y] = pts[i]; const w = amp ? Math.sin((x + y) * 0.5) * amp : 0; if (i === 0) ctx.moveTo(x + w, y - w); else ctx.lineTo(x + w, y - w); } ctx.closePath(); }

    drawCharacter(ctx, W, H, look, t) {
      const engaged = look.engaged;
      const baseX = W * 0.5, baseY = H * 0.78;
      const scale = clamp(Math.min(W, H) / 520, 0.62, 1.25);
      ctx.save(); ctx.translate(baseX, baseY); ctx.scale(scale, scale);

      // orbiting bottles behind the character (cosmic finale)
      if (look.env === 'cosmic' && engaged) this.drawOrbitBottles(ctx, t, false);

      // ---- drink cycle ----
      const vomiting = this.phase === 'crashed' && this.lost;
      const cyc = engaged && !vomiting ? clamp(this._drinkT / Math.max(0.1, look.drinkSpeed), 0, 1) : 0;
      let raise = 0; if (cyc < 0.15) raise = cyc / 0.15; else if (cyc < 0.5) raise = 1; else if (cyc < 0.65) raise = 1 - (cyc - 0.5) / 0.15;
      const gulping = cyc >= 0.15 && cyc < 0.5;
      const gulp = gulping ? Math.sin((cyc - 0.15) / 0.35 * Math.PI * 3) : 0;
      const ahh = (cyc >= 0.65 && cyc < 0.82) ? Math.sin((cyc - 0.65) / 0.17 * Math.PI) : 0;
      const drinking = raise > 0.35;
      if (engaged && gulping) { const gp = Math.sign(gulp); if (gp > 0 && this._prevGulp <= 0) this.synth.gulpSfx(); this._prevGulp = gp; } else this._prevGulp = 0;

      // ---- body motion ----
      const sway = Math.sin(t * 1.6) * look.swayAmp + Math.sin(t * 4.3) * look.swayAmp * 0.4 * look.chaos;
      const breathe = Math.sin(t * 2.1) * 1.4;
      const groove = engaged ? Math.sin(t * (5 + look.chaos * 7)) * (1.2 + look.chaos * 3.5) : 0; // bops to the music
      const leanBack = raise * (6 + look.chaos * 6);
      const slump = look.sit === 'fall' ? 0.5 : look.sit === 'curb' ? 0.25 : look.sit === 'container' ? 0.32 : 0;
      const hicPhase = (t + 0.7) % 2.9;
      const hic = (engaged && look.hiccup && hicPhase < 0.16) ? Math.sin(hicPhase / 0.16 * Math.PI) : 0;
      if (hic > 0.5 && this._prevHic <= 0.5) { this.synth.hiccupSfx();
        const nowMs = t * 1000;
        if (!this._bubble || nowMs > this._bubble.until) this._bubble = { text: 'ик!', born: nowMs, until: nowMs + 1800 };
      }
      this._prevHic = hic;
      const headBob = engaged ? Math.sin(t * 3.1) * 0.03 * (0.6 + look.chaos) : Math.sin(t * 1.3) * 0.012;

      // ---- far-arm gesture pick: stage-up fist pump > mouth wipe > resting ----
      const pump = engaged ? clamp(this._pump, 0, 1) : 0;
      let farMode = 'rest', farK = 0;
      if (pump > 0.04) { // жест на смену стадии — каждый раз разный
        const gset = ['cheer', 'wave', 'thumbs', 'scratch'];
        farMode = gset[(hash(look.idx * 7 + 3) * gset.length) | 0];
        farK = Math.sin(Math.min(1, (1 - pump) * 2.4) * Math.PI * 0.5);
      }
      else if (engaged && cyc >= 0.8 && cyc < 0.97 && hash(this._drinkN * 13 + 5) > 0.45) { farMode = 'wipe'; farK = Math.sin((cyc - 0.8) / 0.17 * Math.PI); }

      ctx.rotate(sway - raise * 0.05 + hic * 0.04); ctx.translate(0, slump * 40 + groove * 0.5 - hic * 7);
      this.drawSeat(ctx, look);
      this.drawGroundClutter(ctx, look, t);
      if (vomiting) { // растущая лужа
        const elP = clamp((t * 1000 - this.phaseStart) / 1400, 0, 1);
        ctx.fillStyle = 'rgba(110,190,60,0.7)'; ctx.strokeStyle = 'rgba(60,120,30,0.8)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(80, -2, 12 + elP * 36, 4 + elP * 7, 0, 0, 6.28); ctx.fill(); ctx.stroke();
      }

      const OUT = C.outline, lw = 7, torso = this.suitColor(look);

      // ---- legs (toe tap on the beat) ----
      const tap = engaged ? Math.max(0, Math.sin(t * 8)) * (2 + look.chaos * 5) : 0;
      ctx.strokeStyle = OUT; ctx.lineWidth = lw;
      for (const sgn of [-1, 1]) { const kick = sgn > 0 ? tap : 0;
        ctx.fillStyle = look.suit === 'rags' ? '#4a3f57' : look.suit === 'uniform' ? '#3a4a3a' : '#242040';
        ctx.beginPath(); ctx.moveTo(sgn * 8, -70); ctx.lineTo(sgn * 40, -70); ctx.lineTo(sgn * 46, -8 - kick); ctx.lineTo(sgn * 16, -8 - kick); ctx.closePath(); ctx.fill(); ctx.stroke();
        if (!(look.m >= 750 && sgn === 1)) { ctx.fillStyle = this.vgrad(ctx, 0, -18, 2, '#221d33', '#100d18'); ctx.beginPath(); ctx.ellipse(sgn * 34, -6 - kick, 22, 11, 0, 0, 6.28); ctx.fill(); ctx.stroke(); ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.beginPath(); ctx.ellipse(sgn * 30, -9 - kick, 8, 3, 0, 0, 6.28); ctx.fill(); }
        else { ctx.fillStyle = look.redFace > 0.5 ? C.skinRed : C.skin; ctx.beginPath(); ctx.ellipse(sgn * 34, -8, 18, 10, 0, 0, 6.28); ctx.fill(); ctx.stroke(); }
      }

      // ---- torso ----
      ctx.save(); ctx.translate(0, -leanBack);
      this.drawTorso(ctx, look, t, { breathe, sway, torso });

      // resting far arm sits behind the head
      if (farMode === 'rest') this.drawFarArm(ctx, look, torso, 'rest', 0, t);

      // head
      ctx.save(); ctx.translate(0, -150);
      ctx.rotate(vomiting ? 0.5 + Math.sin(t * 9) * 0.05 : -raise * (0.4 + look.chaos * 0.3) + Math.sin(t * 2.4) * 0.02 + headBob);
      ctx.translate(0, vomiting ? 6 : -hic * 2);
      this.drawHead(ctx, look, t, { raise, gulp, ahh, drinking, cyc, vomit: vomiting }); ctx.restore();
      if (vomiting) { // струя — гаснет к концу
        const elV = (t * 1000 - this.phaseStart) / 1000;
        const va = clamp(1.7 - elV, 0, 1);
        if (va > 0) { const wob = Math.sin(t * 14) * 3;
          ctx.save(); ctx.globalAlpha = va;
          ctx.strokeStyle = 'rgba(127,212,74,0.9)'; ctx.lineWidth = 12; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(14, -150); ctx.quadraticCurveTo(54 + wob, -92, 76 + wob, -8); ctx.stroke();
          ctx.strokeStyle = 'rgba(92,180,55,0.95)'; ctx.lineWidth = 6;
          ctx.beginPath(); ctx.moveTo(14, -148); ctx.quadraticCurveTo(58 - wob, -86, 82 - wob * 0.5, -8); ctx.stroke();
          ctx.restore(); }
      }

      // gesturing far arm drawn over the head/mouth
      if (farMode !== 'rest') this.drawFarArm(ctx, look, torso, farMode, farK, t);

      this.drawDrinkArm(ctx, look, t, raise, torso);
      ctx.restore(); // leanBack

      // orbiting bottles in front
      if (look.env === 'cosmic' && engaged) this.drawOrbitBottles(ctx, t, true);

      ctx.restore(); // character
    }

    drawOrbitBottles(ctx, t, front) {
      for (let i = 0; i < 3; i++) {
        const ang = t * 1.1 + i * 2.09;
        const inFront = Math.sin(ang) > 0;
        if (inFront !== front) continue;
        const x = Math.cos(ang) * 118, y = -128 + Math.sin(ang) * 40;
        ctx.save(); ctx.translate(x, y); ctx.rotate(ang + 1.57); ctx.globalAlpha = 0.9;
        this.bottleShape(ctx, 0, 0, 6, 30, ['#3f7a3a', 'rgba(220,235,255,0.85)', '#6a1f3a'][i], 0, false);
        ctx.restore(); ctx.globalAlpha = 1;
      }
    }

    // torso variants: suit(+jacket states) -> shirt+suspenders -> robe -> rags
    drawTorso(ctx, look, t, o) {
      const OUT = C.outline, lw = 7, { breathe, torso } = o;
      const fillT = this.vgrad(ctx, 0, -150, -66, this.mixHex(torso, '#ffffff', 0.1), this.mixHex(torso, '#000000', 0.22));
      ctx.fillStyle = fillT; ctx.strokeStyle = OUT; ctx.lineWidth = lw;
      this.wobblePath(ctx, [[-46, -150 + breathe * 0.3], [46, -150 + breathe * 0.3], [54, -66], [-54, -66]], look.chaos * 3); ctx.fill(); ctx.stroke();

      if (look.suit === 'suit') {
        const j = look.jacket;
        // shirt V — narrow when buttoned, wide when open
        const vw = j === 'buttoned' ? 9 : 16, vd = j === 'buttoned' ? -122 : -96;
        ctx.fillStyle = '#f4f0fb'; ctx.beginPath(); ctx.moveTo(-vw, -150); ctx.lineTo(vw, -150); ctx.lineTo(vw * 0.55, vd); ctx.lineTo(-vw * 0.55, vd); ctx.closePath(); ctx.fill(); ctx.stroke();
        // open collar shows wings + a skin V
        if (look.collarOpen) { ctx.fillStyle = '#f4f0fb';
          ctx.beginPath(); ctx.moveTo(-10, -150); ctx.lineTo(-1, -150); ctx.lineTo(-9, -138); ctx.closePath(); ctx.fill(); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(10, -150); ctx.lineTo(1, -150); ctx.lineTo(9, -138); ctx.closePath(); ctx.fill(); ctx.stroke();
          ctx.fillStyle = look.redFace > 0.4 ? C.skinRed : C.skin; ctx.beginPath(); ctx.moveTo(-4, -150); ctx.lineTo(4, -150); ctx.lineTo(0, -142); ctx.closePath(); ctx.fill(); }
        // lapels
        ctx.fillStyle = this.mixHex(torso, '#000', 0.28);
        const spread = j === 'buttoned' ? 0 : 5;
        ctx.beginPath(); ctx.moveTo(-16 - spread, -150); ctx.lineTo(-2, -150); ctx.lineTo(-10 - spread, -112); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(16 + spread, -150); ctx.lineTo(2, -150); ctx.lineTo(10 + spread, -112); ctx.closePath(); ctx.fill(); ctx.stroke();
        if (j === 'buttoned') { // closed front: gold buttons down the middle
          ctx.fillStyle = C.sun; for (let b = 0; b < 3; b++) { ctx.beginPath(); ctx.arc(0, -114 + b * 18, 2.8, 0, 6.28); ctx.fill(); }
        } else if (j === 'open') { // flared front edges
          ctx.strokeStyle = OUT; ctx.lineWidth = 4;
          ctx.beginPath(); ctx.moveTo(-10, -112); ctx.quadraticCurveTo(-20, -90, -26, -68); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(10, -112); ctx.quadraticCurveTo(20, -90, 26, -68); ctx.stroke();
        } else { // shoulder — jacket slid off the right shoulder, shirt exposed
          ctx.fillStyle = '#f4f0fb'; ctx.beginPath(); ctx.moveTo(10, -152); ctx.lineTo(48, -149); ctx.lineTo(44, -122); ctx.lineTo(14, -128); ctx.closePath(); ctx.fill(); ctx.stroke();
          ctx.fillStyle = this.mixHex(torso, '#000', 0.15);
          ctx.beginPath(); ctx.moveTo(46, -124); ctx.lineTo(54, -66); ctx.lineTo(30, -66); ctx.lineTo(38, -118); ctx.closePath(); ctx.fill(); ctx.stroke();
        }
        // pocket square
        ctx.fillStyle = C.sun; ctx.fillRect(28, -136, 12, 8); ctx.strokeRect(28, -136, 12, 8);
      } else if (look.suit === 'shirt') {
        // jacket off: light shirt + suspenders; stains grow; untucked hem flaps
        if (look.stains > 0) { ctx.fillStyle = `rgba(120,90,40,${0.25 + look.stains * 0.25})`;
          for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(hrange(i + 7, -38, 38), hrange(i + 40, -138, -76), hrange(i + 70, 5, 11), 0, 6.28); ctx.fill(); } }
        ctx.strokeStyle = '#3a3356'; ctx.lineWidth = 7;
        ctx.beginPath(); ctx.moveTo(-30, -66); ctx.lineTo(-16, -148); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(30, -66); ctx.lineTo(16, -148); ctx.stroke();
        ctx.fillStyle = '#c9b8e8'; ctx.strokeStyle = C.outline; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(-24, -100, 3, 0, 6.28); ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.arc(24, -100, 3, 0, 6.28); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#8a86a0'; for (let b = 0; b < 3; b++) { ctx.beginPath(); ctx.arc(0, -132 + b * 22, 2.4, 0, 6.28); ctx.fill(); }
        if (look.untucked) { ctx.fillStyle = '#e9e4f2'; ctx.strokeStyle = C.outline; ctx.lineWidth = 4;
          ctx.beginPath(); ctx.moveTo(-52, -68); ctx.lineTo(-38, -52); ctx.lineTo(-22, -66); ctx.lineTo(-6, -52); ctx.lineTo(10, -66); ctx.lineTo(26, -54); ctx.lineTo(50, -68); ctx.closePath(); ctx.fill(); ctx.stroke(); }
      } else if (look.suit === 'uniform') {
        // worker robe: zipper + chest pocket + grime
        ctx.strokeStyle = 'rgba(20,26,20,0.6)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, -150); ctx.lineTo(0, -70); ctx.stroke();
        ctx.strokeStyle = C.outline; ctx.lineWidth = 3; ctx.strokeRect(14, -130, 22, 16);
        ctx.fillStyle = 'rgba(45,32,18,0.5)'; for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(hrange(i, -40, 40), hrange(i + 30, -140, -74), hrange(i + 60, 5, 12), 0, 6.28); ctx.fill(); }
      } else { // rags
        ctx.fillStyle = 'rgba(45,32,18,0.55)'; for (let i = 0; i < 7; i++) { ctx.beginPath(); ctx.arc(hrange(i, -42, 42), hrange(i + 30, -142, -72), hrange(i + 60, 5, 13), 0, 6.28); ctx.fill(); }
        ctx.strokeStyle = C.outline; ctx.lineWidth = 3; for (let i = 0; i < 6; i++) { const x = -50 + i * 20; ctx.beginPath(); ctx.moveTo(x, -66); ctx.lineTo(x + 6, -54); ctx.lineTo(x + 12, -66); ctx.stroke(); }
        // sewn patch
        ctx.fillStyle = '#8a6a4a'; ctx.strokeStyle = C.outline; ctx.lineWidth = 2; ctx.fillRect(-34, -110, 18, 14); ctx.strokeRect(-34, -110, 18, 14);
        ctx.setLineDash([3, 3]); ctx.strokeRect(-31, -107, 12, 8); ctx.setLineDash([]);
      }

      // tie (worn normally until 32×)
      if (look.tie) {
        const L = look.tieLoosen; ctx.save(); ctx.translate(0, -150 + L * 12); ctx.rotate(o.sway * 0.5 + L * 0.4 * Math.sin(t * 0.7 + 1) + (look.m < 1.4 ? Math.sin(t * 6) * 0.1 : 0));
        ctx.fillStyle = C.red; ctx.strokeStyle = C.outline; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.rect(-7, 1, 14, 9); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-6, 10); ctx.lineTo(6, 10); ctx.lineTo(10, 54 - L * 4); ctx.lineTo(0, 64 - L * 4); ctx.lineTo(-10, 54 - L * 4); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(-2, 14, 3, 38); ctx.restore();
      }
    }

    drawFarArm(ctx, look, torso, mode, k, t) {
      const OUT = C.outline;
      // жесты с согнутым локтем — никаких прямых выброшенных вверх рук
      let hx = -60, hy = -74, cpx = -78, cpy = -118, hand = 'rest';
      if (mode === 'wipe') { hx = lerp(-60, -14, k); hy = lerp(-74, -162, k); cpx = -80; cpy = -140; hand = 'fist'; }
      else if (mode === 'cheer') { hx = lerp(-60, -76, k) + Math.sin(t * 13) * 3 * k; hy = lerp(-74, -150, k); cpx = -98; cpy = -108; hand = 'cheer'; }
      else if (mode === 'wave') { hx = lerp(-60, -84, k) + Math.sin(t * 8) * 7 * k; hy = lerp(-74, -160, k); cpx = -102; cpy = -118; hand = 'palm'; }
      else if (mode === 'thumbs') { hx = lerp(-60, -54, k); hy = lerp(-74, -126, k); cpx = -90; cpy = -100; hand = 'thumb'; }
      else if (mode === 'scratch') { hx = lerp(-60, -58, k); hy = lerp(-74, -196, k) + Math.sin(t * 11) * 3 * k; cpx = -108; cpy = -150; hand = 'palm'; }
      ctx.strokeStyle = torso; ctx.lineWidth = 22; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-40, -140); ctx.quadraticCurveTo(cpx, cpy, hx, hy); ctx.stroke();
      ctx.strokeStyle = OUT; ctx.lineWidth = 7; ctx.stroke();
      const skin = look.redFace > 0.5 ? C.skinRed : C.skin;
      ctx.fillStyle = skin; ctx.strokeStyle = OUT; ctx.lineWidth = 5;
      if (hand === 'thumb') { // большой палец вверх у груди
        ctx.beginPath(); ctx.arc(hx, hy, 13, 0, 6.28); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.rect(hx - 3, hy - 27, 9, 17); ctx.fill(); ctx.stroke();
      } else if (hand === 'palm') { // открытая ладонь (машет / чешет затылок)
        ctx.beginPath(); ctx.arc(hx, hy, 12, 0, 6.28); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = OUT; ctx.lineWidth = 3; ctx.lineCap = 'round';
        for (let f = -2; f <= 2; f++) { ctx.beginPath(); ctx.moveTo(hx + f * 4, hy - 9); ctx.lineTo(hx + f * 5.5, hy - 19); ctx.stroke(); }
      } else if (hand === 'cheer') { // кулак трясётся у плеча + искры
        ctx.beginPath(); ctx.arc(hx, hy, 14, 0, 6.28); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = OUT; ctx.lineWidth = 2.5; for (let f = -1; f <= 1; f++) { ctx.beginPath(); ctx.moveTo(hx - 7, hy + f * 5); ctx.lineTo(hx + 6, hy + f * 5); ctx.stroke(); }
        if (k > 0.6) { ctx.strokeStyle = C.sun; ctx.lineWidth = 3;
          for (const a of [-2.4, -1.57, -0.7]) { ctx.beginPath(); ctx.moveTo(hx + Math.cos(a) * 20, hy + Math.sin(a) * 20); ctx.lineTo(hx + Math.cos(a) * 28, hy + Math.sin(a) * 28); ctx.stroke(); } }
      } else {
        ctx.beginPath(); ctx.arc(hx, hy, 13, 0, 6.28); ctx.fill(); ctx.stroke();
        if (mode === 'wipe') { ctx.strokeStyle = OUT; ctx.lineWidth = 2.5; for (let f = -1; f <= 1; f++) { ctx.beginPath(); ctx.moveTo(hx - 6, hy + f * 5); ctx.lineTo(hx + 5, hy + f * 5); ctx.stroke(); } }
      }
    }

    drawSeat(ctx, look) {
      const OUT = C.outline; ctx.strokeStyle = OUT; ctx.lineWidth = 6;
      if (look.sit === 'stool') { ctx.fillStyle = this.vgrad(ctx, 0, -78, -54, '#4a3a28', '#2a2018'); ctx.beginPath(); ctx.ellipse(0, -66, 40, 12, 0, 0, 6.28); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#2a2018'; for (const sgn of [-1, 1]) { ctx.beginPath(); ctx.moveTo(sgn * 26, -60); ctx.lineTo(sgn * 34, -4); ctx.lineTo(sgn * 22, -4); ctx.lineTo(sgn * 14, -60); ctx.closePath(); ctx.fill(); ctx.stroke(); } }
      else if (look.sit === 'curb') { ctx.fillStyle = this.vgrad(ctx, 0, -56, 0, '#5a5a62', '#3a3a42'); ctx.fillRect(-90, -56, 180, 56); ctx.strokeRect(-90, -56, 180, 56); ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.beginPath(); ctx.moveTo(-90, -40); ctx.lineTo(90, -40); ctx.stroke(); }
      else if (look.sit === 'container') { ctx.fillStyle = this.vgrad(ctx, 0, -78, 0, '#3a6f4a', '#245038'); ctx.fillRect(-100, -70, 200, 70); ctx.strokeRect(-100, -70, 200, 70); ctx.fillStyle = '#27503a'; ctx.fillRect(-100, -80, 200, 14); ctx.strokeRect(-100, -80, 200, 14); }
    }
    suitColor(look) { switch (look.suit) { case 'suit': return '#312a5c'; case 'shirt': return '#e9e4f2'; case 'uniform': return '#4a5a38'; case 'rags': return '#5a4a55'; default: return '#312a5c'; } }

    drawHead(ctx, look, t, anim) {
      const OUT = C.outline, lw = 7; const { raise, gulp, ahh, drinking, cyc } = anim;
      const skinBase = look.redFace > 0 ? this.mixHex(C.skin, C.skinRed, look.redFace) : C.skin;
      const skinHi = this.mixHex(skinBase, '#ffffff', 0.28), skinLo = this.mixHex(skinBase, '#000000', 0.16);
      // neck + gulp lump
      ctx.fillStyle = skinLo; ctx.strokeStyle = OUT; ctx.lineWidth = lw; ctx.beginPath(); ctx.rect(-12, -8, 24, 18); ctx.fill(); ctx.stroke();
      if (gulp > 0.2) { ctx.fillStyle = this.mixHex(skinBase, '#000', 0.14); ctx.beginPath(); ctx.arc(0, -2 + gulp * 6, 5, 0, 6.28); ctx.fill(); }
      if (look.glow > 0) { ctx.save(); ctx.shadowColor = C.mint; ctx.shadowBlur = 26 * look.glow; ctx.strokeStyle = C.mint; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(0, -54, 56, 60, 0, 0, 6.28); ctx.stroke(); ctx.restore(); }
      // head
      const hg = ctx.createRadialGradient(-18, -74, 8, 0, -54, 74); hg.addColorStop(0, skinHi); hg.addColorStop(0.55, skinBase); hg.addColorStop(1, skinLo);
      ctx.fillStyle = hg; ctx.strokeStyle = OUT; ctx.lineWidth = lw; ctx.beginPath(); ctx.ellipse(0, -54, 56, 60, 0, 0, 6.28); ctx.fill(); ctx.stroke();
      ctx.fillStyle = skinBase; ctx.beginPath(); ctx.ellipse(-54, -54, 10, 16, 0, 0, 6.28); ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.ellipse(54, -54, 10, 16, 0, 0, 6.28); ctx.fill(); ctx.stroke();

      // hair
      const hairG = this.vgrad(ctx, 0, -120, -70, '#3a2b48', '#1c1426'); ctx.fillStyle = hairG;
      if (look.hair === 'neat') { ctx.beginPath(); ctx.arc(0, -86, 50, Math.PI * 1.05, Math.PI * 1.95); ctx.lineTo(36, -86); ctx.quadraticCurveTo(0, -120, -38, -86); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.beginPath(); ctx.ellipse(-20, -96, 14, 6, -0.4, 0, 6.28); ctx.fill(); }
      else if (look.hair === 'messy') { ctx.beginPath(); for (let a = -1; a <= 1.001; a += 0.12) { const x = Math.cos(Math.PI * (1 + a) / 2 + Math.PI) * 52; const y = -92 + Math.abs(Math.sin(a * 5)) * 8; ctx.lineTo(x, y - 6); } ctx.quadraticCurveTo(0, -122, -46, -82); ctx.closePath(); ctx.fill(); ctx.stroke(); }
      else { ctx.beginPath(); for (let i = -6; i <= 6; i++) { const x = i * 8; const y = -100 - (i % 2 ? 22 : 8) - Math.abs(i) * 1.5; ctx.lineTo(x, y); ctx.lineTo(x + 4, -86); } ctx.lineTo(-50, -70); ctx.lineTo(-50, -90); ctx.closePath(); ctx.fill(); ctx.stroke(); }

      // tie worn as a headband (32×–190×)
      if (look.tieHeadband) {
        ctx.fillStyle = C.red; ctx.strokeStyle = OUT; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(-54, -86); ctx.quadraticCurveTo(0, -98, 54, -86); ctx.lineTo(54, -74); ctx.quadraticCurveTo(0, -86, -54, -74); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.rect(50, -86, 10, 12); ctx.fill(); ctx.stroke();
        ctx.save(); ctx.translate(58, -80); ctx.rotate(Math.sin(t * 3) * 0.2 + 0.5);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(22, 6); ctx.lineTo(26, 14); ctx.lineTo(4, 10); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.rotate(Math.sin(t * 3 + 1) * 0.15 + 0.3);
        ctx.beginPath(); ctx.moveTo(0, 2); ctx.lineTo(16, 14); ctx.lineTo(14, 22); ctx.lineTo(-2, 12); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.restore();
      }

      // ---- eyes ----
      const eyeY = -58, eyeDX = 22;
      const happy = ahh > 0.25;                        // blissful ^^ eyes on the post-sip "aah"
      const wink = look.m < 26 && (t % 7) < 0.45;      // playful wink early on
      const closed = anim.vomit ? 0.16 : drinking ? 0.22 : ((Math.sin(t * 1.3 + 1) > 0.985) ? 0.1 : 1);
      for (const sgn of [-1, 1]) { const ex = sgn * eyeDX;
        if (anim.vomit) { // зажмуренные X-глаза
          ctx.strokeStyle = OUT; ctx.lineWidth = 4; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(ex - 8, eyeY - 7); ctx.lineTo(ex + 8, eyeY + 7); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(ex + 8, eyeY - 7); ctx.lineTo(ex - 8, eyeY + 7); ctx.stroke();
          continue;
        }
        if (look.bags) { ctx.strokeStyle = 'rgba(120,70,90,0.55)'; ctx.lineWidth = 3; for (let b = 0; b < look.bags; b++) { ctx.beginPath(); ctx.arc(ex, eyeY + 14 + b * 4, 12, 0.2, Math.PI - 0.2); ctx.stroke(); } }
        if (happy || (wink && sgn === 1 && !drinking)) { // closed happy arc
          ctx.strokeStyle = OUT; ctx.lineWidth = 5; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.arc(ex, eyeY + 4, 11, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
          continue;
        }
        ctx.strokeStyle = OUT; ctx.lineWidth = lw; ctx.fillStyle = '#fbfbfe'; ctx.beginPath(); ctx.ellipse(ex, eyeY, 15, 16 * closed, 0, 0, 6.28); ctx.fill(); ctx.lineWidth = 4; ctx.stroke();
        if (closed > 0.4) { if (look.eyes === 'spiral') { ctx.strokeStyle = OUT; ctx.lineWidth = 3; ctx.beginPath(); for (let a = 0; a < 12; a += 0.3) { const r = a; ctx.lineTo(ex + Math.cos(a + t * 4) * r, eyeY + Math.sin(a + t * 4) * r); } ctx.stroke(); }
          else { if (look.eyes === 'bloodshot') { ctx.strokeStyle = 'rgba(220,60,60,0.7)'; ctx.lineWidth = 1.5; for (let q = 0; q < 4; q++) { ctx.beginPath(); ctx.moveTo(ex, eyeY); ctx.lineTo(ex + Math.cos(q * 1.6) * 13, eyeY + Math.sin(q * 1.6) * 13); ctx.stroke(); } }
            const drift = look.driftEyes ? Math.sin(t * 0.9 + sgn) * 7 : Math.sin(t * 0.7) * 4; // eyes wander independently when drunk
            const driftY = look.driftEyes ? Math.cos(t * 1.1 + sgn * 2) * 3 : 0;
            ctx.fillStyle = look.glowEyes ? C.mint : '#160f1e'; if (look.glowEyes) { ctx.shadowColor = C.mint; ctx.shadowBlur = 14; } ctx.beginPath(); ctx.arc(ex + drift, eyeY + 2 + driftY, look.glowEyes ? 8 : 6, 0, 6.28); ctx.fill(); ctx.shadowBlur = 0;
            if (!look.glowEyes) { ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.beginPath(); ctx.arc(ex + drift - 2, eyeY + driftY - 1, 2, 0, 6.28); ctx.fill(); } } }
      }
      ctx.strokeStyle = '#241a2e'; ctx.lineWidth = 6; ctx.lineCap = 'round';
      const browBob = Math.sin(t * 2.6) * 2 * (0.4 + look.chaos) + (raise > 0.3 ? -4 : 0);
      ctx.beginPath(); ctx.moveTo(-34, eyeY - 22 + look.chaos * 6 + browBob); ctx.lineTo(-10, eyeY - 26 + browBob); ctx.stroke(); ctx.beginPath(); ctx.moveTo(34, eyeY - 22 + look.chaos * 6 - browBob * 0.6); ctx.lineTo(10, eyeY - 26 - browBob * 0.6); ctx.stroke();

      // sweat beads
      if (look.sweat > 0.05) {
        for (let i = 0; i < (look.sweat > 0.5 ? 2 : 1); i++) {
          const side = i % 2 ? 1 : -1; const ph = (t * 0.5 + i * 0.5) % 1;
          const sx = side * 50, sy = -78 + ph * 66;
          ctx.fillStyle = 'rgba(150,210,255,0.85)';
          ctx.beginPath(); ctx.moveTo(sx, sy - 6); ctx.quadraticCurveTo(sx + 4, sy, sx, sy + 4); ctx.quadraticCurveTo(sx - 4, sy, sx, sy - 6); ctx.fill();
        }
      }

      // nose
      ctx.fillStyle = this.mixHex('#d98a6a', C.red, clamp(look.redFace + look.chaos * 0.4, 0, 1)); ctx.strokeStyle = OUT; ctx.lineWidth = 5; ctx.beginPath(); ctx.ellipse(0, -34, 13, 11, 0, 0, 6.28); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.ellipse(-4, -37, 4, 3, -0.4, 0, 6.28); ctx.fill();

      // mouth (grin widens & sloppier with drunkenness)
      ctx.strokeStyle = OUT; ctx.lineWidth = 5; ctx.fillStyle = '#3a1a22';
      if (anim.vomit) { ctx.fillStyle = '#2f4a1a'; ctx.beginPath(); ctx.ellipse(2, -12, 12, 15, 0, 0, 6.28); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#3a1a22'; }
      else if (drinking) { const o = 6 + Math.abs(gulp) * 4; ctx.beginPath(); ctx.ellipse(0, -16, 9, o, 0, 0, 6.28); ctx.fill(); ctx.stroke(); }
      else if (ahh > 0.05) { ctx.beginPath(); ctx.ellipse(0, -14, 13, 9 + ahh * 4, 0, 0, 6.28); ctx.fill(); ctx.stroke(); ctx.fillStyle = C.red; ctx.beginPath(); ctx.ellipse(0, -10, 6, 4 + ahh * 2, 0, 0, 6.28); ctx.fill(); }
      else { const gw = 14 + look.grin * 8; ctx.beginPath(); ctx.moveTo(-gw, -18); ctx.quadraticCurveTo(0, -8 - look.grin * 4 + look.chaos * 6, gw, -18 + look.grin * 3); ctx.stroke();
        if (look.chaos > 0.5) { ctx.strokeStyle = C.sky; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(10, -14); ctx.lineTo(12, -2 - Math.sin(t * 3) * 3); ctx.stroke(); } }

      // beer-foam moustache right after a sip (mug stage)
      if (look.drink === 'mug' && cyc >= 0.55 && cyc < 0.95 && look.engaged) {
        const fa = 1 - (cyc - 0.55) / 0.4;
        ctx.globalAlpha = fa * 0.95; ctx.fillStyle = '#f8f6ff'; ctx.strokeStyle = 'rgba(200,195,215,0.6)'; ctx.lineWidth = 1.5;
        for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.arc(i * 6, -23 - Math.abs(i) * 0.8, 4 - Math.abs(i) * 0.5, 0, 6.28); ctx.fill(); ctx.stroke(); }
        ctx.globalAlpha = 1;
      }

      // mustache + beard
      if (look.beard) {
        ctx.fillStyle = 'rgba(35,26,35,' + (0.6 + look.beard * 0.08) + ')';
        ctx.beginPath(); ctx.moveTo(-16, -22); ctx.quadraticCurveTo(0, -18, 16, -22); ctx.quadraticCurveTo(6, -14, 0, -15); ctx.quadraticCurveTo(-6, -14, -16, -22); ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(42,32,42,' + (0.34 + look.beard * 0.14) + ')';
        ctx.beginPath(); ctx.moveTo(-44, -34); ctx.quadraticCurveTo(0, 20 + look.beard * 6, 44, -34); ctx.quadraticCurveTo(30, 0, 0, 4 + look.beard * 3); ctx.quadraticCurveTo(-30, 0, -44, -34); ctx.closePath(); ctx.fill();
        if (look.beard >= 3) { ctx.strokeStyle = 'rgba(25,18,25,0.75)'; ctx.lineWidth = 2; for (let i = 0; i < 18; i++) { const bx = hrange(i, -40, 40); ctx.beginPath(); ctx.moveTo(bx, -4); ctx.lineTo(bx + hrange(i + 50, -3, 3), 12 + look.beard * 4); ctx.stroke(); } }
      }
      if (look.redFace > 0.3) { const cg = ctx.createRadialGradient(-32, -30, 1, -32, -30, 14); cg.addColorStop(0, 'rgba(229,72,77,' + look.redFace * 0.5 + ')'); cg.addColorStop(1, 'rgba(229,72,77,0)'); ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(-32, -30, 14, 0, 6.28); ctx.fill();
        const cg2 = ctx.createRadialGradient(32, -30, 1, 32, -30, 14); cg2.addColorStop(0, 'rgba(229,72,77,' + look.redFace * 0.5 + ')'); cg2.addColorStop(1, 'rgba(229,72,77,0)'); ctx.fillStyle = cg2; ctx.beginPath(); ctx.arc(32, -30, 14, 0, 6.28); ctx.fill(); }
    }

    drawDrinkArm(ctx, look, t, raise, torso) {
      const OUT = C.outline; const restX = 44, restY = -96, drinkX = 12, drinkY = -166; const hx = lerp(restX, drinkX, raise), hy = lerp(restY, drinkY, raise);
      ctx.strokeStyle = torso; ctx.lineWidth = 22; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(40, -140); ctx.quadraticCurveTo(70 - raise * 30, -118 - raise * 20, hx + 14, hy + 18); ctx.stroke();
      ctx.strokeStyle = OUT; ctx.lineWidth = 7; ctx.stroke();
      const skin = look.redFace > 0.5 ? C.skinRed : C.skin; ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(hx, hy, 13, 0, 6.28); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = OUT; ctx.lineWidth = 2.5; for (let f = -1; f <= 1; f++) { ctx.beginPath(); ctx.moveTo(hx - 6, hy - 6 + f * 5); ctx.lineTo(hx + 4, hy - 6 + f * 5); ctx.stroke(); }
      ctx.save(); ctx.translate(hx, hy); ctx.rotate(raise * -0.9); this.drawDrink(ctx, look, t); ctx.restore();
    }
    drawDrink(ctx, look, t) {
      const OUT = C.outline; ctx.strokeStyle = OUT; ctx.lineWidth = 5; const d = look.drink;
      if (d === 'mug') { ctx.fillStyle = this.vgrad(ctx, 0, -34, 0, '#e0b85a', '#b8862e'); ctx.beginPath(); ctx.rect(-16, -34, 30, 34); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(-1, -34, 16, 6, 0, 0, 6.28); ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.arc(20, -18, 9, -1.4, 1.4); ctx.stroke(); ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fillRect(-12, -30, 3, 24); }
      else if (d === 'wine') { this.bottleShape(ctx, 0, 0, 8, 40, '#6a1f3a', 0, false); ctx.fillStyle = C.sun; ctx.fillRect(-6, -22, 12, 10); ctx.strokeRect(-6, -22, 12, 10); }
      else if (d === 'vodka') { this.bottleShape(ctx, 0, 0, 8, 40, 'rgba(220,235,255,0.9)', 0, false); ctx.fillStyle = C.red; ctx.fillRect(-7, -26, 14, 12); ctx.strokeRect(-7, -26, 14, 12); }
      else if (d === 'flask') { ctx.fillStyle = this.vgrad(ctx, 0, -36, 4, '#b6c0ca', '#7c868f'); ctx.beginPath(); ctx.ellipse(0, -16, 14, 20, 0, 0, 6.28); ctx.fill(); ctx.stroke(); ctx.fillRect(-5, -40, 10, 8); ctx.strokeRect(-5, -40, 10, 8); ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.beginPath(); ctx.ellipse(-5, -20, 3, 8, 0, 0, 6.28); ctx.fill(); }
      else if (d === 'gas') { ctx.fillStyle = this.vgrad(ctx, 0, -40, 0, '#e05548', '#a8342c'); ctx.beginPath(); ctx.rect(-16, -40, 32, 40); ctx.fill(); ctx.stroke(); ctx.fillStyle = C.sun; ctx.font = '900 12px Unbounded, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('95', 0, -16); }
      else if (d === 'bigflask') { ctx.fillStyle = 'rgba(126,231,199,0.55)'; ctx.shadowColor = C.mint; ctx.shadowBlur = 22; ctx.beginPath(); ctx.moveTo(-6, -50); ctx.lineTo(6, -50); ctx.lineTo(8, -34); ctx.bezierCurveTo(30, -28, 30, 4, 0, 6); ctx.bezierCurveTo(-30, 4, -30, -28, -8, -34); ctx.closePath(); ctx.fill(); ctx.shadowBlur = 0; ctx.stroke(); ctx.fillStyle = C.mint; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(hrange(i, -12, 12), -10 - (t * 30 + i * 12) % 30, 3, 0, 6.28); ctx.fill(); } }
      else { this.bottleShape(ctx, 0, 0, 8, 40, '#3f7a3a', 0, false); ctx.fillStyle = C.sun; ctx.fillRect(-7, -24, 14, 12); ctx.strokeRect(-7, -24, 14, 12); }
      if (look.fire) { for (let i = 0; i < 3; i++) { const fx = (i - 1) * 5, fyv = -44 - Math.abs(Math.sin(t * 8 + i)) * 10; ctx.fillStyle = i % 2 ? C.sun : '#ff6a3a'; ctx.beginPath(); ctx.moveTo(fx - 5, -38); ctx.quadraticCurveTo(fx, fyv, fx + 5, -38); ctx.closePath(); ctx.fill(); } }
    }

    drawParticles(ctx, front, look) {
      for (const p of this.particles) { const a = clamp(1 - p.life / p.ttl, 0, 1); ctx.globalAlpha = a;
        if (p.kind === 'bottle') { if (front) { ctx.save(); this.bottleShape(ctx, p.x, p.y, p.size * 0.3, p.size, p.color, p.rot, false); ctx.restore(); } }
        else if (p.kind === 'bubble') { if (!front) { ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.arc(p.x, p.y, p.size * 0.3, 0, 6.28); ctx.fill(); } }
        else if (p.kind === 'smoke') { if (front) { ctx.fillStyle = 'rgba(120,120,130,0.4)'; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, 6.28); ctx.fill(); } }
        else if (p.kind === 'fire') { if (front) { ctx.fillStyle = (p.life * 12 | 0) % 2 ? C.sun : '#ff6a3a'; ctx.beginPath(); ctx.arc(p.x, p.y, p.size * 0.4, 0, 6.28); ctx.fill(); } }
        else if (p.kind === 'vomit') { if (front) { ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.size * 0.5, 0, 6.28); ctx.fill(); } }
        else if (p.kind === 'star') { ctx.fillStyle = p.color; ctx.fillRect(p.x, p.y, 3, 3); }
        else if (p.kind === 'pixel') { if (front) { ctx.fillStyle = `hsl(${p.hue}, 80%, 65%)`; ctx.fillRect(p.x, p.y, p.size * 0.5, p.size * 0.5); } }
      } ctx.globalAlpha = 1;
    }

    drawMultiplier(ctx, W, H, look, t) {
      if (this.phase === 'idle') return;
      const fs = Math.round(clamp(W * 0.11, 42, 100));
      const cx = W / 2, cy = Math.max(H * 0.15, 60 + fs * 0.5); // не прячемся за тулбаром на низких канвасах
      if (this._hideMult) { // турбо-пауза: держим интригу — число раскроется вместе с надписью и звуком
        ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = this.mixHex(C.mint, C.sun, clamp(look.chaos, 0, 1));
        for (let i = 0; i < 3; i++) { const a = 0.3 + 0.7 * Math.max(0, Math.sin(t * 7 - i * 0.7)); ctx.globalAlpha = a; ctx.beginPath(); ctx.arc(cx + (i - 1) * fs * 0.42, cy, fs * 0.12, 0, 6.28); ctx.fill(); }
        ctx.globalAlpha = 1; ctx.restore(); return;
      }
      const txt = this.fmtMult(this.mult);
      const pulse = 1 + Math.min(0.18, look.chaos * 0.18) * Math.sin(t * 10);
      const col = this.phase === 'crashed' ? (this.finale ? C.sun : (this.cashedAt != null ? C.mint : C.red)) : this.mixHex(C.mint, C.sun, clamp(look.chaos, 0, 1));
      ctx.save(); ctx.translate(cx, cy); ctx.scale(pulse, pulse);
      ctx.font = `900 ${Math.round(clamp(W * 0.11, 42, 100))}px Unbounded, system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 8; ctx.strokeStyle = C.outline; ctx.lineJoin = 'round'; ctx.shadowColor = col; ctx.shadowBlur = 24;
      ctx.strokeText(txt, 0, 0); ctx.shadowBlur = 0; ctx.fillStyle = col; ctx.fillText(txt, 0, 0);
      if (look.doubleVision && look.engaged && this.phase === 'running') { ctx.globalAlpha = 0.35; ctx.fillStyle = C.sky; ctx.fillText(txt, Math.sin(t * 3) * 10, Math.cos(t * 3) * 6); ctx.globalAlpha = 1; }
      ctx.restore();
    }
    // речевое облачко — держится ~3.5 c, плавно появляется и уходит
    drawBubble(ctx, W, H, look, t) {
      const b = this._bubble; if (!b || !look.engaged || this.phase === 'idle') return;
      const nowMs = t * 1000; if (nowMs > b.until) return;
      const age = (nowMs - b.born) / 1000, left = (b.until - nowMs) / 1000;
      const a = clamp(Math.min(age / 0.22, left / 0.3, 1), 0, 1);
      const scale = clamp(Math.min(W, H) / 520, 0.62, 1.25);
      ctx.save(); ctx.globalAlpha = a;
      ctx.font = `700 ${Math.round(clamp(W * 0.024, 13, 16))}px Onest, system-ui, sans-serif`;
      const tw = ctx.measureText(b.text).width;
      const bw = tw + 30, bh = 38;
      const headTop = H * 0.78 - 268 * scale;
      let bx = W / 2 + 78 * scale + bw / 2 - 30;
      bx = Math.min(bx, W - bw / 2 - 10);
      let by = headTop - bh / 2 - 6 + Math.sin(t * 1.6) * 3;
      by = Math.max(by, bh / 2 + 8);
      ctx.fillStyle = 'rgba(250,248,255,0.96)'; ctx.strokeStyle = C.outline; ctx.lineWidth = 3;
      this.roundRect(ctx, bx - bw / 2, by - bh / 2, bw, bh, 14); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(bx - bw * 0.24, by + bh / 2 - 2);
      ctx.lineTo(bx - bw * 0.24 - 16, by + bh / 2 + 16); ctx.lineTo(bx - bw * 0.24 + 14, by + bh / 2 - 2);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#241c3e'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(b.text, bx, by + 1);
      ctx.restore();
    }
    drawOverlay(ctx, W, H, look, now) {
      if (this.phase === 'idle') {
        ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = `700 ${Math.round(clamp(W * 0.03, 14, 21))}px Onest, sans-serif`;
        const pulse = 0.5 + 0.5 * Math.sin(now / 500); ctx.globalAlpha = 0.5 + pulse * 0.5;
        ctx.fillText(this.texts.idle, W / 2, H * 0.18); ctx.globalAlpha = 1;
        return;
      }
      if (this.phase === 'running' && !look.engaged) { return; }
      if (this.phase === 'crashed') {
        if (this.finale) { ctx.save(); ctx.translate(W / 2, H * 0.9); ctx.font = `900 ${Math.round(clamp(W * 0.09, 36, 80))}px Unbounded, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 10; ctx.strokeStyle = C.outline; ctx.shadowColor = C.sun; ctx.shadowBlur = 30; ctx.strokeText(this.texts.finale, 0, 0); ctx.fillStyle = C.sun; ctx.shadowBlur = 0; ctx.fillText(this.texts.finale, 0, 0); ctx.restore(); }
        else if (this.lost) { ctx.save(); ctx.translate(W / 2, H * 0.9); ctx.font = `900 ${Math.round(clamp(W * 0.055, 22, 44))}px Unbounded, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 8; ctx.strokeStyle = C.outline; ctx.shadowColor = C.red; ctx.shadowBlur = 18; ctx.strokeText(this.texts.lost, 0, 0); ctx.fillStyle = C.red; ctx.shadowBlur = 0; ctx.fillText(this.texts.lost, 0, 0); ctx.restore(); }
        else { ctx.save(); ctx.translate(W / 2, H * 0.9); ctx.font = `900 ${Math.round(clamp(W * 0.06, 26, 48))}px Unbounded, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 8; ctx.strokeStyle = C.outline; ctx.shadowColor = C.mint; ctx.shadowBlur = 18; ctx.strokeText(this.texts.won, 0, 0); ctx.fillStyle = C.mint; ctx.shadowBlur = 0; ctx.fillText(this.texts.won, 0, 0); ctx.restore(); }
      }
    }

    fmtMult(m) { if (m >= 1000000) return (m / 1000000).toFixed(2) + 'M'; if (m >= 100000) return Math.round(m / 1000) + 'K'; if (m >= 10000) return (m / 1000).toFixed(1) + 'K'; if (m >= 100) return Math.round(m).toString(); return m.toFixed(2); }
    roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
    mixHex(a, b, t) { const pa = this._rgb(a), pb = this._rgb(b); const c = pa.map((v, i) => Math.round(lerp(v, pb[i], clamp(t, 0, 1)))); const h = (n) => n.toString(16).padStart(2, '0'); return `#${h(c[0])}${h(c[1])}${h(c[2])}`; }
    _rgb(s) { if (s[0] === '#') return [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)]; const m = s.match(/(\d+)/g); return [+m[0], +m[1], +m[2]]; }
  }


(CrashEngine as any).STAGES = STAGES;
(CrashEngine as any).MAXMULT = MAXMULT;
(CrashEngine as any).HOUSE_EDGE = HOUSE_EDGE;
(CrashEngine as any).crashFromFloat = crashFromFloat;
export { STAGES, MAXMULT, HOUSE_EDGE, crashFromFloat, multiplierAt, secondsToReach, CURVE_K, CURVE_A };
