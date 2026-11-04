// ===== Efeitos sonoros sintetizados (WebAudio) e animações do tabuleiro =====
const SFX = (() => {
  let ctx = null, master = null, noiseBuf = null;
  let muted = false; try { muted = localStorage.getItem('mesaviva.mute') === '1'; } catch { }

  function ac() {
    if (!ctx) {
      const C = window.AudioContext || window.webkitAudioContext; if (!C) return null;
      ctx = new C();
      const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
      master = ctx.createGain(); master.gain.value = muted ? 0 : .8;
      master.connect(comp); comp.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function env(g, t, v, a, d) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
  function tone({ f, f2, type = 'sine', at = 0, d = .2, v = .2, a = .004, pan = 0 }) {
    const c = ac(); if (!c || muted) return;
    const t = c.currentTime + at, o = c.createOscillator(), g = c.createGain(), p = c.createStereoPanner?.();
    o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + a + d);
    env(g, t, v, a, d); o.connect(g); if (p) { p.pan.value = pan; g.connect(p); p.connect(master); } else g.connect(master);
    o.start(t); o.stop(t + a + d + .05);
  }
  function noise({ at = 0, d = .1, v = .2, type = 'bandpass', f = 2000, f2, q = 1, a = .002 }) {
    const c = ac(); if (!c || muted) return;
    const t = c.currentTime + at, s = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain();
    s.buffer = noiseBuf; s.loop = true; fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
    if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + a + d);
    env(g, t, v, a, d); s.connect(fl); fl.connect(g); g.connect(master);
    s.start(t, Math.random() * .5); s.stop(t + a + d + .05);
  }
  // marimba: fundamental + parcial inarmônica que some rápido
  const mallet = (f, at = 0, v = .22, d = .45) => { tone({ f, at, v, d, type: 'sine' }); tone({ f: f * 3.99, at, v: v * .25, d: d * .25 }); tone({ f: f * 2, at, v: v * .1, d: d * .5, type: 'triangle' }); };
  const bell = (f, at = 0, v = .12, d = .8) => { tone({ f, at, v, d }); tone({ f: f * 2.76, at, v: v * .35, d: d * .5 }); tone({ f: f * 5.4, at, v: v * .12, d: d * .3 }); };

  const S = {
    click: () => tone({ f: 1400, f2: 900, d: .03, v: .05 }),
    shake: () => { for (let i = 0; i < 9; i++) noise({ at: i * .035 + Math.random() * .02, d: .025, v: .09, f: 2500 + Math.random() * 1500, q: 3 }); },
    bounce: (s = 1, pan = 0) => {
      noise({ d: .045, v: .32 * s, f: 1600 + Math.random() * 600, q: 1.2 });
      tone({ f: 190, f2: 80, type: 'triangle', d: .09, v: .3 * s, pan });
      noise({ d: .015, v: .12 * s, type: 'highpass', f: 5000 });
    },
    step: (i = 0) => { const f = i % 2 ? 560 : 640; tone({ f, f2: f * .55, d: .08, v: .16 }); noise({ d: .012, v: .05, type: 'highpass', f: 3000 }); },
    land: () => { tone({ f: 300, f2: 140, type: 'triangle', d: .16, v: .22 }); noise({ d: .05, v: .1, f: 900 }); },
    coinUp: () => { bell(1568, 0); bell(2093, .08); },
    coinDown: () => { tone({ f: 523, f2: 440, type: 'triangle', d: .14, v: .12 }); tone({ f: 392, f2: 330, type: 'triangle', at: .1, d: .2, v: .12 }); },
    card: () => { noise({ d: .22, v: .14, f: 700, f2: 4500, q: .8 }); tone({ f: 1800, at: .2, d: .03, v: .05 }); },
    flip: () => noise({ d: .08, v: .12, f: 3000, f2: 1200, q: 1 }),
    buy: () => { noise({ d: .03, v: .2, type: 'highpass', f: 4000 }); tone({ f: 120, f2: 60, d: .1, v: .2 }); [1319, 1661, 1976].forEach((f, i) => bell(f, .06 + i * .06, .09)); },
    gavel: () => { tone({ f: 150, f2: 55, type: 'triangle', d: .22, v: .45 }); noise({ d: .08, v: .3, type: 'lowpass', f: 900 }); },
    jail: () => { tone({ f: 392, type: 'square', d: .22, v: .06 }); tone({ f: 294, type: 'square', at: .25, d: .35, v: .06 }); noise({ at: .55, d: .25, v: .15, type: 'highpass', f: 5000 }); tone({ f: 2400, f2: 1800, at: .55, d: .2, v: .05 }); },
    free: () => { tone({ f: 2600, d: .04, v: .06 }); tone({ f: 1900, at: .06, d: .05, v: .05 }); mallet(784, .12, .14); },
    turnMine: () => { mallet(523, 0); mallet(659, .12); mallet(1047, .24, .2, .7); },
    turnOther: () => mallet(659, 0, .12, .35),
    build: () => { [0, .13].forEach(at => { tone({ f: 900, f2: 450, at, d: .05, v: .18 }); noise({ at, d: .03, v: .12, f: 2500 }); }); },
    auction: () => { S.gavel(); setTimeout(S.gavel, 220); },
    tick: () => tone({ f: 1500, d: .025, v: .05 }),
    bankrupt: () => { tone({ f: 440, f2: 70, type: 'sawtooth', d: 1.1, v: .07 }); tone({ f: 330, f2: 55, type: 'triangle', at: .1, d: 1.1, v: .1 }); },
    deal: () => { mallet(587, 0, .15); mallet(880, .1, .15); },
    win: () => { [523, 659, 784, 1047].forEach((f, i) => mallet(f, i * .14, .2)); [523, 659, 784].forEach(f => tone({ f, type: 'triangle', at: .62, d: 1.2, v: .07 })); bell(2093, .62, .1, 1.4); },
    chat: () => tone({ f: 880, f2: 1100, d: .06, v: .05 }),
    upgrade: () => { [784, 988, 1175, 1568, 1976].forEach((f, i) => bell(f, i * .07, .09, .6)); noise({ at: .05, d: .5, v: .05, type: 'highpass', f: 6000 }); },
    steal: () => { tone({ f: 220, f2: 880, type: 'sawtooth', d: .35, v: .06 }); noise({ d: .3, v: .12, f: 900, f2: 4000 }); [1175, 988, 1568].forEach((f, i) => bell(f, .3 + i * .08, .09)); },
  };
  S.setMuted = m => { muted = m; try { localStorage.setItem('mesaviva.mute', m ? '1' : '0'); } catch { } if (master) master.gain.value = m ? 0 : .8; };
  S.isMuted = () => muted;
  S.unlock = () => ac();
  return S;
})();

const Anim = (() => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const rand = (a, b) => a + Math.random() * (b - a);
  // espera a animação OU o tempo previsto (o navegador congela animações em abas ocultas)
  const done = (anim, ms) => Promise.race([anim.finished.catch(() => { }), wait(ms + 80)]);
  const settle = (anim, el, transform) => { anim.cancel(); if (el && transform != null) el.style.transform = transform; };

  // ---------- dados 3D ----------
  const PIPS = { 1: [5], 2: [3, 7], 3: [3, 5, 7], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9] };
  // faces: frente 1, trás 6, direita 2, esquerda 5, topo 3, base 4 (opostas somam 7)
  const FACES = [[1, 'front'], [6, 'back'], [2, 'right'], [5, 'left'], [3, 'top'], [4, 'bottom']];
  const SHOW = { 1: [0, 0], 6: [0, 180], 2: [0, -90], 5: [0, 90], 3: [-90, 0], 4: [90, 0] };
  const faceHTML = n => `<div class="face f-${FACES.find(f => f[0] === n)[1]}">${Array.from({ length: 9 }, (_, k) => `<i class="${PIPS[n].includes(k + 1) ? 'on' : ''}"></i>`).join('')}</div>`;
  // inclinação fixa (mostra o dado em 3D) → giro no plano da mesa → rotação que põe a face sorteada para frente
  // câmera levemente à frente (vê a face de cima e um pouco da lateral) → giro no plano da mesa → face sorteada para cima
  // no 2D, inclina um pouco para mostrar a lateral; no 3D o próprio tabuleiro já está em perspectiva
  let view3d = false;
  const cubeT = (rx, ry, rz = 0) => `rotateX(${view3d ? 0 : -14}deg) rotateZ(${rz}deg) rotateX(${rx}deg) rotateY(${ry}deg)`;
  // altura do dado: no 2D é simulada com escala; no 3D é altura real (translateZ) acima da mesa
  const liftT = (h, s) => view3d ? `translateZ(${s * (.5 + h * 1.4)}px)` : `translate(${-h * s * .1}px, ${-h * s * .4}px) scale(${1 + h * .38})`;

  function initDice(tray) {
    tray.innerHTML = [0, 1].map(k => `<div class="die3d" data-k="${k}"><div class="dshadow"></div><div class="dlift"><div class="cube">${FACES.map(f => faceHTML(f[0])).join('')}</div></div></div>`).join('') + '<div class="dice-sum"></div>';
    tray._rest = null;
  }
  function restSpots(tray) {
    const W = tray.clientWidth, H = tray.clientHeight, s = tray.querySelector('.die3d').offsetWidth;
    return [0, 1].map(k => ({ x: W / 2 + (k ? .45 : -1.45) * s + rand(-.12, .12) * s, y: H * .5 + rand(-.2, .2) * s, rz: rand(-18, 18) }));
  }
  function restDice(tray, values) {
    if (!tray.querySelector('.die3d')) initDice(tray);
    if (!tray._rest || tray._restW !== tray.clientWidth) { tray._rest = restSpots(tray); tray._restW = tray.clientWidth; }
    tray.querySelectorAll('.die3d').forEach((d, k) => {
      const r = tray._rest[k], [fx, fy] = SHOW[values[k] || 1];
      d.style.transform = `translate(${r.x}px, ${r.y}px)`;
      d.querySelector('.cube').style.transform = cubeT(fx, fy, r.rz);
      d.querySelector('.dlift').style.transform = liftT(0, d.offsetWidth);
    });
  }
  async function rollDice(tray, values, { small = false } = {}) {
    if (!tray.querySelector('.die3d')) initDice(tray);
    const W = tray.clientWidth, H = tray.clientHeight;
    const dice = [...tray.querySelectorAll('.die3d')], s = dice[0].offsetWidth;
    const D = small ? 1150 : 1450;
    tray._rest = restSpots(tray); tray._restW = W;
    tray.querySelector('.dice-sum').classList.remove('on');
    SFX.shake();
    // queda de verdade: o dado cai de cima (escala = altura), quica 3 vezes no lugar, rola uma face e assenta.
    // [offset, altura, progresso no chão]
    const KF = [[0, 2.2, 0], [.28, 0, .42], [.42, .5, .6], [.55, 0, .74], [.63, .16, .82], [.7, 0, .88], [.88, 0, 1], [1, 0, 1]];
    const anims = dice.map((d, k) => {
      const end = tray._rest[k], delay = k * 60;
      // vem do lado de quem joga (de baixo) em direção ao centro da mesa
      const start = { x: end.x + rand(-.35, .35) * s, y: end.y + s * rand(1.1, 1.5) };
      const opts = { duration: D, delay, fill: 'both' };
      const ease = i => (KF[i + 1] && KF[i + 1][1] > KF[i][1] ? 'ease-out' : 'ease-in');
      const pos = KF.map(([offset, , g]) => ({ offset, transform: `translate(${start.x + (end.x - start.x) * g}px, ${start.y + (end.y - start.y) * g}px)` }));
      const lift = KF.map(([offset, h], i) => ({ offset, transform: liftT(h, s), easing: ease(i) }));
      const shadow = KF.map(([offset, h], i) => ({ offset, transform: `translate(${h * s * .28}px, ${h * s * .22}px) scale(${1 + h * .3})`, opacity: Math.max(.12, .6 - h * .22), easing: ease(i) }));
      const [fx, fy] = SHOW[values[k]];
      const sx = 360 * Math.round(rand(2, 3)) * (Math.random() < .5 ? -1 : 1), sy = 360 * Math.round(rand(1, 3)) * (Math.random() < .5 ? -1 : 1);
      const cube = d.querySelector('.cube');
      const rot = cube.animate([
        { offset: 0, transform: cubeT(fx + sx + 90, fy + sy, rand(-90, 90)), easing: 'cubic-bezier(.25,.6,.4,1)' },
        { offset: .7, transform: cubeT(fx + 90, fy, end.rz * .5), easing: 'cubic-bezier(.45,0,.3,1)' }, // última face antes de assentar
        { offset: .88, transform: cubeT(fx, fy, end.rz) },
        { offset: 1, transform: cubeT(fx, fy, end.rz) },
      ], opts);
      return [d.animate(pos, { ...opts, easing: 'linear' }), d.querySelector('.dlift').animate(lift, opts), d.querySelector('.dshadow').animate(shadow, opts), rot];
    });
    [[.28, 1], [.55, .6], [.7, .35], [.86, .18]].forEach(([o, v], i) => {
      setTimeout(() => SFX.bounce(v, -.15), D * o);
      setTimeout(() => SFX.bounce(v * .85, .15), D * o + 60);
    });
    await wait(D + 80);
    anims.flat().forEach(a => a.cancel());
    restDice(tray, values);
    // mostra o resultado
    const sum = tray.querySelector('.dice-sum');
    const dbl = values[0] === values[1] && !small;
    sum.innerHTML = `<b>${values[0] + values[1]}</b>${dbl ? '<span>DUPLA!</span>' : small ? '<span>serviço</span>' : ''}`;
    sum.style.left = (tray._rest[0].x + tray._rest[1].x) / 2 + s / 2 + 'px';
    sum.style.top = Math.min(tray._rest[0].y, tray._rest[1].y) - s * .9 + 'px';
    sum.classList.remove('on'); void sum.offsetWidth; sum.classList.add('on');
    if (dbl) SFX.deal(); else SFX.click();
    await wait(small ? 450 : 650);
  }

  // ---------- peões ----------
  let board = null, layer = null, tokens = {}, pos = {};
  const tileEl = i => board.querySelector('#t' + i);
  function tileCenter(i) { const t = tileEl(i); return { x: t.offsetLeft + t.offsetWidth / 2, y: t.offsetTop + t.offsetHeight / 2 }; }
  function slotOffset(pid) {
    const here = Object.keys(pos).filter(id => pos[id] === pos[pid] && tokens[id]?.isConnected && !tokens[id].classList.contains('gone'));
    const n = here.length, k = here.indexOf(pid), cell = board.clientWidth / 12.2;
    if (n <= 1) return { x: 0, y: 0 };
    const r = cell * (n > 4 ? .28 : .22), a = (k / n) * Math.PI * 2 - Math.PI / 2;
    return { x: Math.cos(a) * r, y: Math.sin(a) * r };
  }
  const T = (x, y) => `translate(${x}px, ${y}px)`;
  function place(pid) {
    const el = tokens[pid]; if (!el) return;
    const c = tileCenter(pos[pid]), o = slotOffset(pid), s = el.offsetWidth;
    el.style.transform = T(c.x + o.x - s / 2, c.y + o.y - s / 2);
  }
  function layoutAll() { Object.keys(tokens).forEach(place); placeBuildings(); }

  // ---------- edifícios em pé (modo 3D) ----------
  let bldLayer = null, blds = {};
  function placeBuildings() {
    if (!bldLayer || !board) return;
    const W = board.clientWidth, cell = W / 12.2;
    for (const [tile, el] of Object.entries(blds)) {
      const c = tileCenter(+tile), s = el.offsetWidth;
      // empurra o prédio para o lado da faixa de cor (borda interna), deixando o centro para os peões
      const dx = W / 2 - c.x, dy = W / 2 - c.y, d = Math.hypot(dx, dy) || 1, k = cell * .32;
      el.style.transform = T(c.x + dx / d * k - s / 2, c.y + dy / d * k - s / 2);
    }
  }
  function syncBuildings(list) { // [{tile, level}]
    if (!bldLayer) return;
    const want = new Map(list.map(b => [String(b.tile), b.level]));
    for (const t of Object.keys(blds)) if (!want.has(t)) { blds[t].remove(); delete blds[t]; }
    for (const [t, level] of want) {
      let el = blds[t];
      if (!el) { el = document.createElement('div'); el.className = 'bld'; el.innerHTML = '<div class="bld-stand"><img alt=""></div>'; bldLayer.appendChild(el); blds[t] = el; }
      const img = el.querySelector('img');
      if (img.dataset.l !== String(level)) { img.src = TIERS[level].img; img.dataset.l = level; el.dataset.l = level; el.title = TIERS[level].name; }
    }
    placeBuildings();
  }
  function setView(is3d) { view3d = !!is3d; }
  function setupTokens(b, l, bl) { board = b; layer = l; tokens = {}; pos = {}; layer.innerHTML = ''; bldLayer = bl || null; blds = {}; if (bldLayer) bldLayer.innerHTML = ''; }
  function syncTokens(list) { // [{id, pos, color, img, name, cur, out}]
    const ids = new Set(list.map(p => p.id));
    for (const id of Object.keys(tokens)) if (!ids.has(id)) { tokens[id].remove(); delete tokens[id]; delete pos[id]; }
    for (const p of list) {
      let el = tokens[p.id];
      if (!el) {
        el = document.createElement('div'); el.className = 'token';
        el.innerHTML = `<div class="tok-stand"><div class="tok-in"><img src="${p.img}" alt=""></div></div>`;
        layer.appendChild(el); tokens[p.id] = el;
      }
      el.style.setProperty('--c', p.color); el.title = p.name;
      el.classList.toggle('cur', !!p.cur); el.classList.toggle('gone', !!p.out);
      pos[p.id] = p.pos;
    }
    layoutAll();
  }
  async function walk(pid, from, steps) {
    const el = tokens[pid]; if (!el) return;
    pos[pid] = from; layoutAll();
    const dir = Math.sign(steps), n = Math.abs(steps), s = el.offsetWidth, inner = el.querySelector('.tok-in');
    el.classList.add('moving');
    for (let k = 1; k <= n; k++) {
      const a = tileCenter(pos[pid]); pos[pid] = (pos[pid] + dir + 40) % 40; const b = tileCenter(pos[pid]);
      const dur = FX.STEP * .92;
      const m = el.animate([{ transform: T(a.x - s / 2, a.y - s / 2) }, { transform: T(b.x - s / 2, b.y - s / 2) }], { duration: dur, easing: 'cubic-bezier(.45,0,.55,1)', fill: 'forwards' });
      inner.animate([
        { transform: 'translateY(0) scale(1)' },
        { transform: `translateY(${-s * .7}px) scale(1.18)`, offset: .45, easing: 'ease-in' },
        { transform: 'translateY(0) scale(.92, 1.06)', offset: .9 },
        { transform: 'translateY(0) scale(1)' }], { duration: dur });
      SFX.step(k);
      await done(m, dur); settle(m, el, T(b.x - s / 2, b.y - s / 2));
      await wait(FX.STEP - dur);
    }
    el.classList.remove('moving');
    SFX.land(); layoutAll();
    await wait(300);
  }
  async function jump(pid, to) {
    const el = tokens[pid]; if (!el) return;
    const s = el.offsetWidth, a = tileCenter(pos[pid]), b = tileCenter(to), inner = el.querySelector('.tok-in');
    SFX.jail();
    const m = el.animate([{ transform: T(a.x - s / 2, a.y - s / 2) }, { transform: T(b.x - s / 2, b.y - s / 2) }], { duration: 850, easing: 'ease-in-out', fill: 'forwards' });
    inner.animate([{ transform: 'translateY(0) scale(1) rotate(0)' }, { transform: `translateY(${-s * 2.2}px) scale(1.5) rotate(360deg)`, offset: .5 }, { transform: 'translateY(0) scale(1) rotate(720deg)' }], { duration: 850, easing: 'ease-in-out' });
    await done(m, 850); settle(m, el, T(b.x - s / 2, b.y - s / 2));
    pos[pid] = to; layoutAll(); await wait(150);
  }
  function floatMoney(pid, amount) {
    const el = tokens[pid]; if (!el || !layer) return;
    const c = tileCenter(pos[pid]);
    const f = document.createElement('div');
    f.className = 'float-money ' + (amount >= 0 ? 'up' : 'down');
    f.textContent = (amount >= 0 ? '+' : '−') + Magnata.money(Math.abs(amount));
    f.style.left = c.x + 'px'; f.style.top = c.y + 'px';
    layer.appendChild(f);
    f.animate([{ transform: 'translate(-50%, -50%) scale(.6)', opacity: 0 }, { transform: 'translate(-50%, -120%) scale(1.1)', opacity: 1, offset: .2 }, { transform: 'translate(-50%, -260%) scale(1)', opacity: 0 }], { duration: 1500, easing: 'ease-out' }).finished.catch(() => { }).finally(() => f.remove()); setTimeout(() => f.remove(), 1700);
  }
  function stamp(tile, text, color) {
    const t = tileEl(tile); if (!t) return;
    const s = document.createElement('div'); s.className = 'stamp'; s.textContent = text; s.style.setProperty('--sc', color || '#d94031');
    const c = tileCenter(tile); s.style.left = c.x + 'px'; s.style.top = c.y + 'px';
    layer.appendChild(s);
    s.animate([{ transform: 'translate(-50%,-50%) scale(3) rotate(-18deg)', opacity: 0 }, { transform: 'translate(-50%,-50%) scale(.95) rotate(-12deg)', opacity: 1, offset: .25 }, { transform: 'translate(-50%,-50%) scale(1) rotate(-12deg)', opacity: 1, offset: .8 }, { transform: 'translate(-50%,-50%) scale(1) rotate(-12deg)', opacity: 0 }], { duration: 1300, easing: 'ease-out' }).finished.catch(() => { }).finally(() => s.remove()); setTimeout(() => s.remove(), 1500);
  }

  // ---------- carta ----------
  async function showCard(stage, deckEl, deck, text, who, img) {
    const ov = document.createElement('div'); ov.className = 'card-stage';
    ov.innerHTML = `<div class="card3d"><div class="cface cback" style="background-image:url(${img})"></div>
      <div class="cface cfront ${deck}"><div class="cf-h">${deck === 'fortuna' ? '🍀 FORTUNA' : '⚡ EVENTO'}</div><p></p><small></small><em>toque para continuar</em></div></div>`;
    ov.querySelector('p').textContent = text; ov.querySelector('small').textContent = who;
    stage.appendChild(ov);
    const card = ov.querySelector('.card3d');
    // o clique pode vir a qualquer momento (inclusive durante a entrada)
    let skip; const clicked = new Promise(r => (skip = r)); ov.onclick = () => skip();
    try {
      const dr = deckEl ? deckEl.getBoundingClientRect() : null, cr = card.getBoundingClientRect();
      const dx = dr ? dr.left + dr.width / 2 - (cr.left + cr.width / 2) : 0, dy = dr ? dr.top + dr.height / 2 - (cr.top + cr.height / 2) : 0;
      const sc = dr && cr.width ? dr.width / cr.width : .3;
      SFX.card();
      await Promise.race([done(card.animate([
        { transform: `translate(${dx}px, ${dy}px) scale(${sc}) rotateY(180deg)` },
        { transform: `translate(0, -6%) scale(1.08) rotateY(90deg)`, offset: .6 },
        { transform: 'translate(0,0) scale(1) rotateY(0deg)' }], { duration: 750, easing: 'cubic-bezier(.3,.7,.3,1)', fill: 'forwards' }), 750), clicked]);
      SFX.flip();
      await Promise.race([wait(2100), clicked]);
      await done(card.animate([{ opacity: 1 }, { transform: 'translate(0, 30%) scale(.6) rotate(8deg)', opacity: 0 }], { duration: 350, easing: 'ease-in', fill: 'forwards' }), 350);
    } finally {
      ov.remove(); // a carta sempre sai da tela, aconteça o que acontecer
    }
  }

  // ---------- faixa de anúncio ----------
  async function banner(stage, html, cls = '', ms = 900) {
    const b = document.createElement('div'); b.className = 'banner ' + cls; b.innerHTML = `<div class="ribbon">${html}</div>`;
    stage.appendChild(b);
    const r = b.firstElementChild;
    await done(r.animate([{ transform: 'translateX(-120%) skewX(-8deg)', opacity: 0 }, { transform: 'translateX(4%) skewX(-8deg)', opacity: 1, offset: .7 }, { transform: 'translateX(0) skewX(-8deg)', opacity: 1 }], { duration: 380, easing: 'ease-out', fill: 'forwards' }), 380);
    await wait(ms - 650);
    await done(r.animate([{ transform: 'translateX(0) skewX(-8deg)', opacity: 1 }, { transform: 'translateX(120%) skewX(-8deg)', opacity: 0 }], { duration: 270, easing: 'ease-in', fill: 'forwards' }), 270);
    b.remove();
  }

  // contador animado de dinheiro
  function countTo(el, from, to, ms = 700) {
    if (from === to) return;
    const t0 = performance.now();
    el.classList.add(to > from ? 'gain' : 'loss');
    const tick = now => {
      const k = Math.min(1, (now - t0) / ms), e = 1 - (1 - k) ** 3;
      el.textContent = Magnata.money(Math.round(from + (to - from) * e));
      if (k < 1) requestAnimationFrame(tick); else setTimeout(() => el.classList.remove('gain', 'loss'), 400);
    };
    requestAnimationFrame(tick);
  }

  return { wait, initDice, restDice, rollDice, setupTokens, syncTokens, syncBuildings, setView, layoutAll, walk, jump, floatMoney, stamp, showCard, banner, countTo, tileCenter };
})();
