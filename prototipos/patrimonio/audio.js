// Patrimônio: quase todo o som é sintetizado aqui. Os dados são gravações reais (sons/, CC0, RPG em OpenGameArt); roleta e caça-níquel imitam a mecânica.
const Sound = (() => {
  let ac = null, out = null, verb = null, sfxOn = true, noiseBuf = null, ksCache = {};
  const LEVEL = .6;
  try { sfxOn = localStorage.getItem('pat-sfx') !== '0'; } catch (e) { /* preferência só desta visita */ }
  const hz = m => 440 * 2 ** ((m - 69) / 12);
  const r = (a, b) => a + Math.random() * (b - a);

  function graph(ctx) {
    ac = ctx; ksCache = {}; noiseBuf = null;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -22; comp.ratio.value = 5; comp.attack.value = .003; comp.release.value = .18;
    // limitador no fim da linha: nenhum som passa do teto, por mais que vários toquem juntos
    const limit = ctx.createDynamicsCompressor(); limit.threshold.value = -9; limit.knee.value = 0; limit.ratio.value = 20; limit.attack.value = .001; limit.release.value = .12; comp.connect(limit); limit.connect(ctx.destination);
    out = ctx.createGain(); out.gain.value = sfxOn ? LEVEL : 0;
    // tira o brilho de todos os efeitos de uma vez: nada de agudo cortante
    const soften = ctx.createBiquadFilter(); soften.type = 'lowpass'; soften.frequency.value = 4200; soften.Q.value = .4; out.connect(soften); soften.connect(comp);
    // sala pequena e quente: resposta de impulso gerada na hora
    const len = Math.floor(ctx.sampleRate * 1.5), ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); let lp = 0; for (let i = 0; i < len; i++) { const t = i / len, e = (1 - t) ** 3.4 * (i < 400 ? i / 400 : 1); lp += (Math.random() * 2 - 1 - lp) * (.5 - t * .36); d[i] = lp * e; } }
    const conv = ctx.createConvolver(); conv.buffer = ir;
    verb = ctx.createGain(); verb.gain.value = .3; verb.connect(conv); const wet = ctx.createGain(); wet.gain.value = .5; conv.connect(wet); wet.connect(comp);
  }
  const SHOTS = [];
  function shot(t, v, level = .8) {
    const n = SHOTS.length; if (!n) return;
    const i = Math.max(0, Math.min(n - 1, Math.round(v * (n - 1) + r(-1.2, 1.2)))), s = ac.createBufferSource(), g = ac.createGain(); s.buffer = SHOTS[i]; s.playbackRate.value = r(.96, 1.05); g.gain.value = level; s.connect(g); route(g, .05, r(-.45, .45)); s.start(t);
  }
  const TAPS = [];
  function tap(t, level, rate) {
    if (!TAPS.length) return tone(300, t, .05, level * .4, { to: 210 });
    const s = ac.createBufferSource(), g = ac.createGain(); s.buffer = TAPS[Math.floor(Math.random() * TAPS.length)]; s.playbackRate.value = rate * r(.98, 1.02); g.gain.value = level; s.connect(g); g.connect(out); s.start(t);
  }
  async function loadTaps() { const list = await Promise.all([1, 2, 3].map(async k => ac.decodeAudioData(await (await fetch(`../../assets/k_wood_light_${k}.ogg`)).arrayBuffer()))); TAPS.push(...list); }
  async function loadShots() { // em ordem de força: dado00 é a mais fraca
    const list = await Promise.all(Array.from({ length: 14 }, async (_, k) => { const a = await (await fetch(`sons/dado${String(k).padStart(2, '0')}.wav`)).arrayBuffer(); return ac.decodeAudioData(a); }));
    SHOTS.push(...list);
  }
  function unlock() {
    if (!ac) { const C = window.AudioContext || window.webkitAudioContext; if (!C) return; graph(new C()); loadShots().catch(e => console.warn('sons de dado', e)); loadTaps().catch(e => console.warn('passos', e)); }
    if (ac.state === 'suspended') ac.resume();
  }
  const ok = () => ac && ac.state === 'running' && sfxOn;
  const now = () => ac.currentTime + .005;
  function route(node, wet = 0, pan = 0, dest = out) {
    let n = node; if (pan && ac.createStereoPanner) { const p = ac.createStereoPanner(); p.pan.value = pan; n.connect(p); n = p; }
    n.connect(dest); if (wet && verb) { const s = ac.createGain(); s.gain.value = wet * dest.gain.value; n.connect(s); s.connect(verb); }
  }
  function tone(f, t, dur, vel, { type = 'sine', to, wet = 0, pan = 0, dest, attack = .002 } = {}) {
    const o = ac.createOscillator(), g = ac.createGain(); o.type = type; o.frequency.setValueAtTime(f, t); if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(vel, t + attack); g.gain.exponentialRampToValueAtTime(.0001, t + dur); o.connect(g); route(g, wet, pan, dest); o.start(t); o.stop(t + dur + .02);
  }
  function noise() { if (!noiseBuf) { noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; } const s = ac.createBufferSource(); s.buffer = noiseBuf; s.loop = true; return s; }
  function hiss(t, dur, vel, { type = 'bandpass', f = 2000, to, Q = 1, wet = 0, pan = 0, dest, attack = .001 } = {}) {
    const s = noise(), fl = ac.createBiquadFilter(), g = ac.createGain(); fl.type = type; fl.frequency.setValueAtTime(f, t); if (to) fl.frequency.exponentialRampToValueAtTime(to, t + dur); fl.Q.value = Q;
    g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(vel, t + attack); g.gain.exponentialRampToValueAtTime(.0001, t + dur); s.connect(fl); fl.connect(g); route(g, wet, pan, dest); s.start(t, Math.random()); s.stop(t + dur + .02);
  }
  // corda dedilhada (Karplus-Strong), o timbre de violão das melodias
  function ksBuffer(m) {
    if (ksCache[m]) return ksCache[m];
    const sr = ac.sampleRate, N = Math.max(2, Math.round(sr / hz(m))), len = Math.floor(sr * 2.2), b = ac.createBuffer(1, len, sr), y = b.getChannelData(0), line = new Float32Array(N);
    for (let i = 0; i < N; i++) line[i] = Math.random() * 2 - 1;
    for (let pass = 0; pass < 3; pass++) for (let i = 0; i < N; i++) line[i] = (line[i] + line[(i + 1) % N]) * .5;
    const decay = .9975 - Math.max(0, m - 60) * .00025; let peak = 0;
    for (let n = 0; n < len; n++) { const i = n % N, v = line[i]; y[n] = v; line[i] = (v + line[(i + 1) % N]) * .5 * decay; if (Math.abs(v) > peak) peak = Math.abs(v); }
    const fade = Math.floor(sr * .2); for (let i = 0; i < len; i++) { y[i] /= peak; if (i > len - fade) y[i] *= (len - i) / fade; }
    return (ksCache[m] = { b, rate: hz(m) / (sr / N) });
  }
  function pluck(m, t, vel = .5, { wet = .25, pan = 0, dest, dur = 2.1 } = {}) {
    const k = ksBuffer(m), s = ac.createBufferSource(), g = ac.createGain(), lp = ac.createBiquadFilter(); s.buffer = k.b; s.playbackRate.value = k.rate; lp.type = 'lowpass'; lp.frequency.value = 3400; lp.Q.value = .3;
    g.gain.setValueAtTime(vel, t); g.gain.setValueAtTime(vel, t + dur - .1); g.gain.linearRampToValueAtTime(.0001, t + dur); s.connect(lp); lp.connect(g); route(g, wet, pan, dest); s.start(t); s.stop(t + dur + .02);
  }
  // madeira afinada: o passo da peça vira marimba
  function marimba(m, t, vel = .3, o = {}) { const f = hz(m); tone(f, t, .34, vel, { wet: .16, ...o }); tone(f * 3.93, t, .06, vel * .34, { wet: .08, ...o }); tone(f * 9.2, t, .018, vel * .12, o); }
  function bell(m, t, vel = .2, o = {}) { const f = hz(m); tone(f, t, 1.5, vel, { wet: .4, ...o }); tone(f * 2.76, t, .7, vel * .28, { wet: .4, ...o }); tone(f * 5.4, t, .3, vel * .1, { wet: .3, ...o }); }
  function knock(f, t, vel = .5, o = {}) { tone(f, t, .1, vel, { to: f * .72, wet: .22, ...o }); tone(f * 2.3, t, .035, vel * .5, { wet: .12, ...o }); hiss(t, .022, vel * .55, { type: 'highpass', f: 1800, ...o }); }
  function metal(t, vel = .1, base = 1, o = {}) { const detune = r(.97, 1.03) * base; for (const [f, d, a] of [[2637, .1, 1], [3951, .19, .8], [5274, .28, .6], [6645, .16, .45], [8372, .1, .3]]) tone(f * detune * r(.99, 1.01), t, d * r(.8, 1.2), vel * a, { wet: .14, ...o }); hiss(t, .012, vel * .8, { type: 'highpass', f: 5000, ...o }); }

  // nota macia: seno com ataque curto e um fio de oitava, em região média
  function soft(m, t, vel = .15, dur = .55) { tone(hz(m), t, dur, vel, { wet: .18, attack: .012 }); tone(hz(m) * 2, t, dur * .5, vel * .14, { wet: .1, attack: .012 }); }
  const seq = (t, notes, gap = .09, vel, dur) => notes.forEach((m, i) => soft(m, t + i * gap, vel, dur));
  const fx = {
    click() { tone(520, now(), .05, .06, { to: 380, attack: .004 }); },
    deny() { const t = now(); tone(196, t, .12, .12); tone(165, t + .1, .16, .12); },
    // batida gravada de verdade, escolhida pela força com que o dado tocou a mesa
    dice(v = .5) {
      shot(now(), v);
    },
    // virar a mesa: a madeira range, tudo voa, e o tombo fecha com as peças chovendo
    tableLift() { // as mãos agarram: batida seca e a madeira estala
      const t = now();
      knock(150, t, .3); knock(92, t + .01, .28); tone(58, t, .2, .25, { to: 92, type: 'sawtooth', attack: .02 }); hiss(t, .16, .35, { f: 300, to: 900, Q: 2 });
    },
    tableLaunch() { // a tábua corta o ar enquanto as peças se soltam
      const t = now();
      hiss(t, .42, .4, { f: 300, to: 1700, Q: .7, wet: .2, attack: .06 }); hiss(t + .36, .42, .3, { f: 1700, to: 300, Q: .7, wet: .25, attack: .08 });
      for (let i = 0; i < 5; i++) shot(t + r(0, .14), r(.4, .8), .4);
    },
    tableTiles() { const t = now(); for (let i = 0; i < 9; i++) knock(r(800, 1400), t + .04 + i * .03 + r(0, .012), r(.07, .13), { pan: r(-.5, .5) }); },
    tableSlam() {
      const t = now();
      tone(92, t, .7, .6, { to: 27, wet: .25 }); tone(165, t, .28, .4, { to: 62 }); hiss(t, .42, .5, { type: 'lowpass', f: 1400, to: 110, Q: .5, wet: .45 });
      knock(235, t, .42); knock(128, t + .008, .42); knock(510, t + .004, .2); hiss(t, .05, .25, { type: 'highpass', f: 2200 });
      // estalo da madeira e cacos caindo depois da pancada, bem baixinho
      for (let k = 0; k < 3; k++) knock(r(700, 1000), t + .02 + k * .018, .12); for (let k = 0; k < 10; k++) tap(t + .12 + k * .05 + r(0, .04), r(.08, .16) * (1 - k * .07), r(.95, 1.25));
    },
    // passo de peça de madeira no feltro: um toque abafado, baixo e curto; alterna duas alturas para não soar mecânico
    hop(k = 0) { const t = now(), up = k % 2; tap(t, .24, up ? 1.04 : 1.16); tone(up ? 150 : 178, t, .08, .075, { to: 105 }); hiss(t, .035, .035, { type: 'lowpass', f: 800, to: 300 }); },
    land() { const t = now(); tap(t, .46, .9); tone(128, t, .17, .15, { to: 72, wet: .08 }); hiss(t, .07, .05, { type: 'lowpass', f: 650, to: 220 }); },
    tableThud(v = .5) { const t = now(); tone(r(84, 110), t, .22, .14 + v * .28, { to: 42, wet: .2 }); knock(r(170, 250), t, .15 + v * .4); hiss(t, .1, v * .35, { type: 'lowpass', f: 900, to: 200 }); },
    coin(k = 0) { tone(880 * (1 + (k % 5) * .02), now(), .09, .035, { attack: .004, wet: .1, pan: r(-.2, .2) }); },
    cash() { seq(now(), [67, 72], .1, .07); },
    card() { hiss(now(), .2, .22, { f: 500, to: 1500, Q: .7, attack: .03 }); },
    flip() { hiss(now(), .14, .14, { f: 900, to: 500, Q: .8, attack: .02 }); },
    stamp() { const t = now(); tap(t, .6, .72); tone(125, t, .14, .22, { to: 72 }); },
    sponsor() { const t = now(); seq(t, [60, 64, 67, 72], .1, .12, .5); bell(84, t + .36, .07); },
    sponsorStamp() { const t = now(); tap(t, .5, .75); tone(110, t, .16, .16, { to: 70 }); seq(t + .08, [67, 72, 76], .07, .1, .5); },
    blitz() { const t = now(); for (const [d, a, b] of [[0, 392, 523], [.42, 523, 392], [.84, 392, 523]]) { tone(a, t + d, .4, .06, { to: b, type: 'triangle', wet: .3, attack: .05 }); } hiss(t + .55, .3, .08, { f: 900, to: 300, Q: .7, attack: .02 }); },
    siren() { const t = now(); for (const [d, f] of [[0, 620], [.2, 495], [.4, 620], [.6, 495]]) tone(f, t + d, .19, .028, { type: 'triangle', wet: .3, attack: .03 }); },
    tableRestore() { // a mesa sobe rangendo e corta o ar de volta
      const t = now(); hiss(t, .62, .5, { f: 220, to: 1100, Q: .8, wet: .2, attack: .18 }); hiss(t + .42, .36, .4, { f: 1100, to: 260, Q: .8, wet: .2, attack: .06 });
      for (let i = 0; i < 4; i++) knock(r(120, 190), t + .05 + i * .11 + r(0, .03), r(.08, .15)); tone(60, t, .55, .22, { to: 110, type: 'triangle', attack: .1 });
    },
    tableSettle() { // assenta no feltro, sem o estrondo da queda
      const t = now(); tone(84, t, .34, .32, { to: 40, wet: .2 }); knock(180, t, .22); knock(120, t + .01, .22); hiss(t, .16, .3, { type: 'lowpass', f: 800, to: 180 }); tap(t + .02, .5, .7);
    },
    buy() { seq(now(), [60, 64, 67], .08, .15, .6); },
    group() { seq(now(), [60, 64, 67, 72], .09, .15, .8); },
    build() { const t = now(); tap(t, .4, .95); soft(67, t + .09, .1); },
    hotel() { const t = now(); tap(t, .45, .85); seq(t + .1, [60, 67, 72], .09, .12, .7); },
    sell() { seq(now(), [67, 60], .1, .13); },
    pay() { seq(now(), [57, 53], .11, .13); },
    bigPay() { seq(now(), [50, 45], .14, .2, .7); },
    // bola correndo no aro de madeira, perdendo força, e depois batendo nos trastes até assentar (acompanha os 3,4 s do giro)
    roulette() {
      const t = now(); hiss(t, 2.3, .09, { f: 2400, to: 700, Q: 1.6, attack: .25, wet: .12 }); tone(92, t, 2.3, .035, { to: 58, attack: .3 });
      let a = 2.05, gap = .065; while (a < 3.25) { knock(r(1500, 2100), t + a, r(.05, .09), { pan: r(-.15, .15) }); gap *= 1.17; a += gap; }
      knock(1250, t + 3.36, .13); knock(420, t + 3.37, .1);
    },
    // alavanca com catraca, depois o giro dos rolos; quem marca a parada de cada um é o slotStop
    slot() {
      const t = now(); knock(190, t, .26); for (let k = 0; k < 5; k++) knock(r(950, 1200), t + .05 + k * .05, .05); knock(150, t + .34, .22);
      let a = .36, gap = .045; while (a < 2.25) { knock(r(1300, 1600), t + a, .035, { pan: r(-.2, .2) }); gap *= 1.012; a += gap; }
      tone(120, t + .36, 1.9, .03, { to: 86, type: 'triangle', attack: .1 });
    },
    slotStop() { const t = now(); tap(t, .5, .72); knock(165, t, .3); tone(82, t, .12, .14, { to: 58 }); metal(t, .02, .7); },
    // os dados chacoalham no copo: as próprias gravações, baixinho e em sequência
    rattle() { const t = now(); for (let k = 0; k < 6; k++) shot(t + k * .065 + r(0, .02), r(.05, .25), .22); },
    // moedas caindo na bandeja, mais moedas quanto maior o prêmio, e um acorde curto por cima
    casinoWin(v = 10) { const t = now(), n = Math.min(22, 6 + Math.floor(v / 15)); for (let k = 0; k < n; k++) metal(t + .04 + k * .055 + r(0, .025), r(.016, .03), r(.75, 1), { pan: r(-.3, .3) }); [60, 64, 67, 72].forEach((m, i) => pluck(m, t + i * .075, .17, { wet: .3, dur: 1.2 })); },
    // fichas recolhidas e duas notas abafadas descendo: chato, sem drama
    casinoLose() { const t = now(); hiss(t, .22, .07, { f: 1500, to: 600, Q: .8, attack: .04 }); for (let k = 0; k < 3; k++) knock(r(620, 800), t + .06 + k * .06, .05); pluck(52, t + .22, .22, { wet: .2, dur: 1 }); pluck(47, t + .46, .24, { wet: .25, dur: 1.2 }); },
    dupla() { const t = now(); soft(72, t, .09, .4); soft(79, t + .09, .09, .5); },
    good() { seq(now(), [64, 67, 72], .09, .13); },
    jail() { const t = now(); tone(110, t, 1, .22, { wet: .4, attack: .01 }); tone(165, t, .6, .08, { wet: .4, attack: .01 }); },
    free() { seq(now(), [60, 67], .1, .13); },
    whoosh() { hiss(now(), .7, .25, { f: 300, to: 1100, Q: .9, attack: .25 }); },
    gavel() { const t = now(); tap(t, .55, .8); tone(130, t, .12, .18, { to: 90 }); },
    sold() { const t = now(); for (const d of [0, .3, .6]) tap(t + d, .3, .8); seq(t + .72, [60, 64, 67], .07, .12, .7); },
    bid() { tap(now(), .28, 1.15); },
    pass_() { tap(now(), .16, .9); },
    turn() { seq(now(), [64, 69], .11, .07, .5); },
    myTurn() { seq(now(), [60, 64, 67], .1, .1, .6); },
    trade() { seq(now(), [62, 66, 69], .08, .13); },
    no() { seq(now(), [55, 52], .12, .06); },
    mortgage() { const t = now(); tap(t, .4, .75); tone(110, t, .18, .16, { to: 85 }); },
    // falência: moedas caindo e um lamento de trombone, sem estrondo
    bankrupt() { const t = now(); for (let i = 0; i < 9; i++) tone(r(1500, 2300), t + i * .05 + r(0, .02), .07, .025, { attack: .002, wet: .15, pan: r(-.4, .4) }); [[58, .28], [57, .28], [56, .28], [55, .95]].forEach(([m, d], i) => { const at = t + .32 + i * .3; tone(hz(m), at, d, .11, { type: 'triangle', wet: .3, attack: .025, to: i === 3 ? hz(m - 2) : undefined }); tone(hz(m - 12), at, d, .07, { wet: .2, attack: .025, to: i === 3 ? hz(m - 14) : undefined }); }); },
    thud() { const t = now(); tap(t, .4, .7); tone(95, t, .18, .16, { to: 60 }); },
    plane() { const t = now(); hiss(t, 1.9, .07, { f: 500, to: 900, Q: .8, attack: .35 }); tone(92, t, 1.9, .035, { to: 130, type: 'sawtooth', attack: .3 }); tone(138, t, 1.9, .02, { to: 196, type: 'sawtooth', attack: .3 }); },
    win() {
      const t = now(), b = .155;
      // batucada de surdo, tamborim e chocalho por baixo da fanfarra
      for (let i = 0; i < 48; i++) { const a = t + i * b; if (i % 8 === 4) tone(70, a, .26, .26, { to: 44, wet: .2 }); else if (i % 8 === 0) tone(62, a, .2, .12, { to: 46 }); if ([0, 3, 6, 10, 12].includes(i % 16)) hiss(a, .03, .1, { type: 'bandpass', f: 3400, Q: 3, wet: .12 }); hiss(a, .018, .025, { type: 'highpass', f: 6500 }); }
      [[0, 72], [2, 76], [4, 79], [6, 84], [10, 83], [12, 79], [16, 81], [18, 84], [20, 88], [24, 91], [28, 88], [32, 84], [36, 86], [40, 88], [44, 96]].forEach(([p, m]) => { soft(m - 12, t + p * b, .09, .7); pluck(m - 12, t + p * b, .16, { wet: .4 }); });
      [[0, [48, 64, 67, 71]], [8, [45, 64, 67, 72]], [16, [50, 65, 69, 72]], [24, [43, 65, 71, 74]], [32, [48, 64, 67, 71]], [40, [43, 65, 71, 74]], [44, [48, 64, 67, 72, 76]]].forEach(([p, ch]) => ch.forEach((m, i) => pluck(m, t + p * b + i * .012, .15, { wet: .35 })));
    },
  };

  const play = (name, ...a) => { if (ok() && fx[name]) { try { fx[name](...a); } catch (e) { console.warn(e); } } };
  function setSfx(v) { sfxOn = v; if (out) out.gain.value = v ? LEVEL : 0; try { localStorage.setItem('pat-sfx', v ? '1' : '0'); } catch (e) { /* ignora */ } }
  // Autoteste: renderiza cada som fora de tempo real e mede pico e duração, já que testes automáticos não ouvem
  async function check() {
    const res = {}, keep = { ac, out, verb, ksCache, noiseBuf, sfxOn };
    for (const name of Object.keys(fx)) {
      const dur = name === 'win' ? 9 : 3.2, c = new OfflineAudioContext(2, 44100 * dur, 44100); graph(c); sfxOn = true; out.gain.value = LEVEL;
      fx[name](name === 'hop' ? 3 : undefined);
      const b = await c.startRendering(), L = b.getChannelData(0); let peak = 0, sum = 0, lastLoud = 0; for (let i = 0; i < L.length; i++) { const v = Math.abs(L[i]); if (v > peak) peak = v; sum += v * v; if (v > .002) lastLoud = i; }
      res[name] = { pico: +peak.toFixed(3), rms: +Math.sqrt(sum / L.length).toFixed(4), seg: +(lastLoud / 44100).toFixed(2) };
    }
    ac = keep.ac; out = keep.out; verb = keep.verb; ksCache = keep.ksCache; noiseBuf = keep.noiseBuf; sfxOn = keep.sfxOn;
    return res;
  }
  return { unlock, play, setSfx, check, get sfx() { return sfxOn; } };
})();
