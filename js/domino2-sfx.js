// ===== Dominó 2 — sons: gravações reais de pedras de dominó (Freesound, CC0) + baques da Kenney (CC0) =====
// Cada gravação tem vários estalos seguidos; recorto um estalo por vez (detecção de início) para cada pedra que bate.
const Domino2SFX = (() => {
  const URLS = {
    pedras_mesa: ['assets/d_pedras_mesa.mp3'], pedra_mesa: ['assets/d_pedra_mesa.mp3'], pedras_batendo: ['assets/d_pedras_batendo.mp3'],
    embaralhar: ['assets/d_embaralhar.mp3'], puxar: ['assets/d_puxar.mp3'],
    soft: ['assets/k_soft_heavy_1.ogg', 'assets/k_soft_heavy_2.ogg', 'assets/k_soft_heavy_3.ogg'],
    punch: ['assets/k_punch_heavy_1.ogg', 'assets/k_punch_heavy_2.ogg', 'assets/k_punch_heavy_3.ogg'],
    wood: ['assets/k_wood_heavy_1.ogg', 'assets/k_wood_heavy_2.ogg', 'assets/k_wood_heavy_3.ogg'],
  };
  const rand = (a, b) => a + Math.random() * (b - a);
  let ac = null, bus = null, buf = null, lastClick = 0;
  const HITS = {};
  function onsets(b) { // começo de cada estalo: subida forte da energia em janelas de 5 ms
    const d = b.getChannelData(0), w = Math.round(b.sampleRate * .005), env = [];
    for (let i = 0; i + w < d.length; i += w) { let m = 0; for (let j = i; j < i + w; j++) m = Math.max(m, Math.abs(d[j])); env.push(m); }
    const top = Math.max(...env), out = []; let last = -1e9;
    for (let i = 1; i < env.length; i++) if (env[i] > top * .22 && env[i] > env[i - 1] * 2.2 && (i - last) * .005 > .12) { out.push({ t: Math.max(0, (i - 1) * .005), pk: Math.max(...env.slice(i, i + 6)) / top }); last = i; }
    return out.map((o, k) => ({ ...o, dur: Math.min(.4, (out[k + 1]?.t ?? b.duration) - o.t) }));
  }
  // o navegador só libera o áudio depois de um toque: chamado no primeiro clique na mesa
  function unlock() {
    try {
      if (!ac) {
        ac = new (window.AudioContext || window.webkitAudioContext)();
        const c = ac.createDynamicsCompressor(); c.threshold.value = -16; c.knee.value = 8; c.ratio.value = 5; c.attack.value = .002; c.release.value = .18;
        const g = ac.createGain(); g.gain.value = 1.2; c.connect(g).connect(ac.destination); bus = c;
        buf = Object.fromEntries(Object.keys(URLS).map(k => [k, []]));
        for (const [k, urls] of Object.entries(URLS)) for (const u of urls)
          fetch(u).then(r => r.arrayBuffer()).then(b => ac.decodeAudioData(b)).then(b => { buf[k].push(b); if (u.endsWith('.mp3')) HITS[k] = onsets(b); }).catch(() => {});
      }
      if (ac.state === 'suspended') ac.resume();
      if (ambWant && !amb) ambience(true);
    } catch {}
  }
  function play(k, { at = 0, vol = 1, rate = rand(.93, 1.07), off = 0, dur, lp } = {}) {
    if (!ac || SFX.isMuted() || !buf[k]?.length) return;
    const src = ac.createBufferSource(), g = ac.createGain(), t = ac.currentTime + at;
    src.buffer = buf[k][Math.floor(Math.random() * buf[k].length)]; src.playbackRate.value = rate; g.gain.value = vol;
    if (dur) { g.gain.setValueAtTime(vol, t + dur * .8 / rate); g.gain.linearRampToValueAtTime(0, t + dur / rate); }
    let n = src.connect(g); if (lp) { const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; n = n.connect(f); }
    n.connect(bus); src.start(t, off, dur);
  }
  function hit(k, o = {}, strong) { // um estalo só, com o volume igualado
    let h = HITS[k] || []; const fortes = h.filter(x => x.pk > .7); if (strong && fortes.length) h = fortes;
    const x = h[Math.floor(Math.random() * h.length)]; if (!x) return;
    play(k, { off: x.t, dur: x.dur, ...o, vol: (o.vol ?? 1) / Math.max(.3, x.pk) * (strong ? 1 : .7) });
  }
  // pedra assentando no feltro (f = 1), batida (2) ou pancada (3): estalo da pedra + baque abafado da mesa + as outras pedras chacoalhando
  function land(f = 1) {
    if (f <= 1) { hit(Math.random() < .5 ? 'pedras_mesa' : 'pedra_mesa', { vol: .9 }); play('soft', { vol: .18, rate: rand(1.1, 1.3), lp: 900 }); return; }
    const big = f > 2;
    hit('pedra_mesa', { rate: big ? rand(.8, .87) : rand(.88, .95), vol: big ? 1.7 : 1.3 }, true);
    hit('pedras_mesa', { rate: big ? rand(.78, .85) : rand(.86, .94), vol: big ? 1.2 : .9, at: .003 }, true);
    play('punch', { vol: big ? .9 : .5, rate: rand(.72, .82), lp: 800 });
    play('soft', { vol: big ? .8 : .45, rate: rand(.75, .9), lp: 700, at: .004 });
    if (big) play('wood', { vol: .35, rate: .78, at: .006, lp: 1200 });
    for (let i = 0; i < (big ? 7 : 3); i++) hit('pedras_batendo', { at: .07 + i * rand(.045, .09), vol: (big ? .85 : .55) * (1 - i / 9), rate: rand(.95, 1.1) });
  }
  const click = v => { const now = performance.now(); if (now - lastClick < 45) return; lastClick = now; hit('pedras_batendo', { vol: .15 + .35 * v, rate: rand(1.05, 1.2) }); };
  const tick = () => hit('pedras_batendo', { vol: .45, rate: rand(1.05, 1.2) });
  const draw = () => { const b = buf?.puxar?.[0]; if (b) play('puxar', { vol: .8 }); };
  const shuffle = (len = 1.6) => { const b = buf?.embaralhar?.[0]; if (b) play('embaralhar', { off: rand(0, Math.max(0, b.duration - len)), dur: len, vol: .8 }); };
  const knock = () => [0, .2].forEach(at => { hit('pedra_mesa', { at, rate: .9, vol: .8 }); play('soft', { at, vol: .25, lp: 800 }); }); // tocar na mesa: passo
  // ambiente de bar, sintetizado: burburinho de conversa (ruído passando por "formantes" que abrem e fecham no ritmo de sílabas),
  // pedras batendo em outra mesa lá no fundo e um copo tilintando de vez em quando
  let amb = null, ambWant = false;
  function ambience(on) {
    ambWant = !!on;
    if (!ac) return; // liga sozinho no unlock
    if (on && !amb) {
      const len = ac.sampleRate * 3, nb = ac.createBuffer(1, len, ac.sampleRate), d = nb.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const src = ac.createBufferSource(); src.buffer = nb; src.loop = true;
      const master = ac.createGain(); master.gain.value = 0; master.connect(ac.destination);
      const voices = [320, 520, 780, 1150, 1700].map(f => {
        const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = 5;
        const g = ac.createGain(); g.gain.value = 0; src.connect(bp).connect(g).connect(master); return { bp, g, f };
      });
      src.start();
      const syl = setInterval(() => { // sílabas: cada faixa abre e fecha num ritmo meio aleatório
        const t = ac.currentTime;
        for (const v of voices) { v.g.gain.setTargetAtTime(Math.random() < .55 ? rand(.2, 1) : rand(0, .15), t, rand(.03, .09)); v.bp.frequency.setTargetAtTime(v.f * rand(.85, 1.15), t, .1); }
        master.gain.setTargetAtTime(SFX.isMuted() ? 0 : .09, t, .4);
      }, 140);
      const far = setInterval(() => {
        if (SFX.isMuted() || Math.random() < .35) return;
        if (Math.random() < .7) hit('pedras_batendo', { vol: rand(.05, .11), rate: rand(.8, .95), lp: 1300, at: rand(0, .8) });
        else clink();
      }, 2300);
      amb = { src, master, syl, far };
    } else if (!on && amb) {
      clearInterval(amb.syl); clearInterval(amb.far); amb.master.gain.setTargetAtTime(0, ac.currentTime, .2);
      const a = amb; setTimeout(() => { try { a.src.stop(); a.master.disconnect(); } catch {} }, 900); amb = null;
    }
  }
  function clink() { // copo: dois senos agudos que morrem rápido
    const t = ac.currentTime + rand(0, .5);
    for (const f of [rand(2500, 2900), rand(3700, 4300)]) {
      const o = ac.createOscillator(), g = ac.createGain(); o.frequency.value = f;
      g.gain.setValueAtTime(.018, t); g.gain.exponentialRampToValueAtTime(.0001, t + .45); o.connect(g).connect(bus); o.start(t); o.stop(t + .5);
    }
  }
  return { unlock, land, click, tick, draw, shuffle, knock, ambience };
})();
