// Última!: sons. As cartas são gravações reais (sons/, CC0: Kenney, BMacZero e HaelDB, aparadas para sair junto com a carta);
// o resto é sintetizado aqui, baixinho e sem onda quadrada.
const Sound = (() => {
  let ac = null, out = null, cards = null, verb = null, on = true;
  const LEVEL = 0.55, BUF = {}, last = {};
  try { on = localStorage.getItem('ul-sfx') !== '0'; } catch (e) { /* preferência só desta visita */ }
  const hz = m => 440 * 2 ** ((m - 69) / 12);
  const r = (a, b) => a + Math.random() * (b - a);
  const FILES = { deal: 4, draw: 3, slide: 2, place: 3, thud: 1, shuffle: 1, fan: 2, pick: 1 };

  function graph(ctx) {
    ac = ctx;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -22; comp.knee.value = 12; comp.ratio.value = 3; comp.attack.value = 0.004; comp.release.value = 0.2;
    const limit = ctx.createDynamicsCompressor(); limit.threshold.value = -6; limit.knee.value = 0; limit.ratio.value = 20; limit.attack.value = 0.001; limit.release.value = 0.1;
    comp.connect(limit); limit.connect(ctx.destination);
    out = ctx.createGain(); out.gain.value = on ? LEVEL : 0;
    const soft = ctx.createBiquadFilter(); soft.type = 'lowpass'; soft.frequency.value = 6500; soft.Q.value = 0.5; out.connect(soft); soft.connect(comp);
    // as cartas passam por mais um filtro: tira o chiado agudo das gravações
    cards = ctx.createBiquadFilter(); cards.type = 'lowpass'; cards.frequency.value = 5200; cards.Q.value = 0.4; cards.connect(out);
    // sala pequena: uma cauda curta deixa tudo "na mesa"
    const len = Math.floor(ctx.sampleRate * 0.7), ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 4; }
    const conv = ctx.createConvolver(); conv.buffer = ir; verb = ctx.createGain(); verb.gain.value = 0.16; verb.connect(conv); conv.connect(soft);
  }
  async function load() {
    const get = async f => ac.decodeAudioData(await (await fetch(`sons/${f}.wav`)).arrayBuffer());
    await Promise.all(Object.entries(FILES).map(async ([k, n]) => { BUF[k] = await Promise.all(Array.from({ length: n }, (_, i) => get(`${k}-${i + 1}`))); }));
  }
  function unlock() {
    if (!ac) { const Ctx = window.AudioContext || window.webkitAudioContext; if (!Ctx) return; graph(new Ctx()); load().catch(e => console.warn('sons', e)); }
    if (ac.state === 'suspended') ac.resume();
  }
  addEventListener('pointerdown', unlock, { capture: true }); addEventListener('keydown', unlock, { capture: true });
  // já cria e carrega ao abrir: o clique que começou a partida foi na página de fora, e o iframe (allow=autoplay) pode tocar sem esperar um clique aqui dentro
  unlock();
  const ok = () => ac && ac.state === 'running' && on;
  const t0 = () => ac.currentTime + 0.005;
  function route(node, wet = 0, pan = 0, bus = out) {
    let n = node; if (pan && ac.createStereoPanner) { const p = ac.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); n.connect(p); n = p; }
    n.connect(bus); if (wet) { const s = ac.createGain(); s.gain.value = wet; n.connect(s); s.connect(verb); }
  }
  // gravação: sorteia uma variação diferente da última (a mesma duas vezes seguidas soa de máquina)
  function sample(k, t, level, { rate = 1, pan = 0, wet = 0.08, i } = {}) {
    const list = BUF[k]; if (!list?.length) return false;
    let j = i ?? Math.floor(Math.random() * list.length); if (i == null && list.length > 1 && j === last[k]) j = (j + 1) % list.length; last[k] = j;
    const s = ac.createBufferSource(), g = ac.createGain(); s.buffer = list[j]; s.playbackRate.value = rate; g.gain.value = level;
    s.connect(g); route(g, wet, pan, cards); s.start(t); return true;
  }
  function tone(f, t, dur, vel, { type = 'sine', to, wet = 0.08, pan = 0, attack = 0.006 } = {}) {
    const o = ac.createOscillator(), g = ac.createGain(); o.type = type; o.frequency.setValueAtTime(f, t); if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vel, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); route(g, wet, pan); o.start(t); o.stop(t + dur + 0.05);
  }
  let noiseBuf = null;
  function hiss(t, dur, vel, { f = 2000, to, Q = 1, type = 'bandpass', wet = 0.08, pan = 0, attack = 0.02 } = {}) {
    if (!noiseBuf) { noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    const s = ac.createBufferSource(), fl = ac.createBiquadFilter(), g = ac.createGain(); s.buffer = noiseBuf; fl.type = type; fl.frequency.setValueAtTime(f, t); if (to) fl.frequency.exponentialRampToValueAtTime(to, t + dur); fl.Q.value = Q;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vel, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl); fl.connect(g); route(g, wet, pan); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }
  // nota redonda: seno com um fio de oitava (marimba de mesa)
  const bell = (m, t, vel = 0.06, dur = 0.6) => { tone(hz(m), t, dur, vel, { wet: 0.22, attack: 0.008 }); tone(hz(m) * 2.01, t, dur * 0.35, vel * 0.18, { wet: 0.18 }); };
  const pluck = (m, t, vel = 0.07) => { tone(hz(m), t, 0.3, vel, { type: 'triangle', wet: 0.14 }); };
  const COLOR_NOTE = { r: 72, y: 76, g: 79, b: 84 };
  let lastHover = 0;

  const FX = {
    deal: pan => { sample('deal', t0(), 0.24, { rate: r(0.94, 1.06), pan, wet: 0.05 }); },
    draw: pan => { sample('draw', t0(), 0.3, { rate: r(0.95, 1.05), pan }); },
    slide: pan => { sample('slide', t0(), 0.2, { rate: r(0.95, 1.05), pan }); },
    place: (v = 0.6, pan = 0) => { const t = t0(); sample('place', t, 0.3 + v * 0.18, { rate: r(0.95, 1.04), pan }); sample('thud', t, 0.16 + v * 0.12, { rate: r(0.92, 1.08), pan, wet: 0.03 }); },
    slam: (v = 1) => { const t = t0(); sample('place', t, 0.55, { rate: r(0.86, 0.92) }); sample('thud', t, 0.32 + v * 0.14, { rate: 0.86, wet: 0.06 }); },
    shuffle: () => { sample('shuffle', t0(), 0.36, { rate: r(0.98, 1.03) }); },
    fan: () => { sample('fan', t0(), 0.26, { rate: r(1, 1.06) }); },
    hover: () => { const n = performance.now(); if (n - lastHover < 70) return; lastHover = n; sample('deal', t0(), 0.045, { i: 0, rate: r(1, 1.1), wet: 0 }); },
    select: () => { sample('pick', t0(), 0.24, { rate: r(0.96, 1.04) }); },
    error: () => { const t = t0(); tone(300, t, 0.12, 0.045, { to: 250 }); tone(240, t + 0.1, 0.16, 0.04, { to: 200 }); },
    turn: () => { const t = t0(); bell(79, t, 0.05); bell(84, t + 0.12, 0.045, 0.8); },
    skip: () => { const t = t0(); hiss(t, 0.3, 0.035, { f: 1800, to: 600, Q: 0.9, wet: 0.15 }); tone(220, t + 0.16, 0.22, 0.06, { to: 140 }); },
    rev: () => { const t = t0(); hiss(t, 0.45, 0.03, { f: 500, to: 2000, Q: 1.2, wet: 0.2 }); tone(330, t, 0.4, 0.03, { to: 520, type: 'triangle' }); tone(520, t + 0.22, 0.36, 0.028, { to: 330, type: 'triangle' }); },
    wild: c => { const t = t0(), b = COLOR_NOTE[c] || 72; [0, 4, 7, 12].forEach((d, i) => bell(b + d, t + i * 0.06, 0.04, 0.55)); },
    plus: v => { const t = t0(); hiss(t, 0.28, 0.03, { f: 400, to: 1800, Q: 1, wet: 0.15 }); sample('thud', t + 0.24, 0.3 + v * 0.04, { rate: v > 2 ? 0.8 : 0.9, wet: 0.06 }); },
    call: () => { const t = t0(); [72, 76, 79].forEach((m, i) => bell(m, t + i * 0.08, 0.055, 0.5)); bell(84, t + 0.24, 0.065, 1); },
    caught: () => { const t = t0(); tone(440, t, 0.38, 0.06, { to: 160, type: 'triangle', wet: 0.12 }); sample('thud', t + 0.3, 0.35, { rate: 0.85 }); },
    saved: () => { const t = t0(); bell(84, t, 0.045, 0.5); bell(88, t + 0.08, 0.04, 0.6); },
    tick: hurry => { tone(hurry ? 1050 : 860, t0(), 0.03, hurry ? 0.045 : 0.03, { wet: 0, attack: 0.002 }); },
    win: () => { const t = t0(); [60, 64, 67, 72, 76, 79, 84].forEach((m, i) => bell(m, t + i * 0.08, 0.05, 1.1)); [72, 76, 79].forEach(m => tone(hz(m), t + 0.55, 1.4, 0.025, { type: 'triangle', wet: 0.3, attack: 0.08 })); },
    fanfare: () => { const t = t0(); for (let k = 0; k < 12; k++) hiss(t + k * 0.04, 0.05, 0.016 + k * 0.002, { f: 2600, Q: 0.7, wet: 0.08 }); // rufar
      const s = t + 0.52; [[60, 64, 67], [62, 65, 69], [64, 67, 71], [72, 76, 79]].forEach((ch, i) => ch.forEach(m => { tone(hz(m), s + i * 0.15, i === 3 ? 1.3 : 0.13, 0.024, { type: 'triangle', wet: 0.2 }); tone(hz(m), s + i * 0.15, i === 3 ? 0.9 : 0.12, 0.008, { type: 'sawtooth', wet: 0.2 }); }));
      [76, 79, 84, 88, 91].forEach((m, i) => bell(m, s + 0.5 + i * 0.07, 0.035, 1.2)); },
    applause: (n = 50) => { const t = t0(); for (let k = 0; k < n; k++) hiss(t + 0.3 + Math.random() * 2.2 * Math.sqrt(k / n), 0.025, 0.012 + Math.random() * 0.02, { f: 1100 + Math.random() * 1800, Q: 1.4, wet: 0.25 }); },
    lose: () => { const t = t0(); [67, 64, 60].forEach((m, i) => pluck(m, t + i * 0.16)); },
    click: () => { tone(660, t0(), 0.045, 0.035, { to: 520, wet: 0.03 }); },
    color: c => { const t = t0(); tone(420, t, 0.07, 0.035, { to: 820 }); bell(COLOR_NOTE[c] || 72, t + 0.05, 0.05, 0.5); },
    chat: () => { bell(88, t0(), 0.03, 0.3); },
  };
  function play(name, ...a) { if (ac && ac.state === 'suspended' && on) ac.resume(); if (!ok() || !FX[name]) return; try { FX[name](...a); } catch (e) { console.warn('som', name, e); } }
  function toggle() { on = !on; if (out) out.gain.value = on ? LEVEL : 0; try { localStorage.setItem('ul-sfx', on ? '1' : '0'); } catch (e) { /* sem onde guardar */ } return on; }
  return { play, toggle, get on() { return on; } };
})();
