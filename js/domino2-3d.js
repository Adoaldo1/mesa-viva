// ===== Dominó 2 em 3D (Three.js r128) =====
// Mesa de feltro com almofada de couro e moldura de madeira, sob uma luminária. Cada pedra é um objeto só, que desliza
// entre monte, mãos e fileira: a jogada voa em arco da mão de quem jogou e assenta (ou bate) na mesa.
// Pedras de marfim envernizado, pontos cavados e rebite de latão no meio.
// Sua mão fica em pé na sua frente: arraste até a ponta (solte rápido ou segure parado em cima para BATER) ou toque.
// Câmera: arraste a mesa para girar, botão direito/dois dedos para mover, roda/pinça para zoom, duplo clique volta.
const Domino2GL = (() => {
  let T, renderer, scene, camera, ray, wrap, canvas, raf = 0, mounted = false, active = false, lastT = 0;
  let H = {}, st = null, opt = {}, curHand = -1, n = 4, mySeat = 0, lastEvN = -1;
  const TH = .34, LEAN = .62, LAMP_I = 2.15, DIM = d => Math.max(.1, Math.min(1, 1.3 - d / 50)); // DIM: brilho do bar conforme a distância da mesa                    // espessura da pedra; inclinação da sua mão (rad)
  const objs = new Map();                         // chave -> { g, key, tile, kind, from, to, t0, delay, dur, arc, land, slam, wob, lift, hold }
  let geo, mats, ghosts = [], ripples = [], hoverKey = null, drag = null, ptr = null, plane = null, resetBtn = null;
  const faceMat = {};                             // id da pedra -> material da face (textura própria)
  const cam = { az: 0, el: null, zoom: 1, tx: 0, tz: .9, caz: 0, cel: null, czoom: 1, ctx: 0, ctz: .9, baseDist: 30, baseEl: 1.02, shake: 0, moved: false };
  const touches = new Map(); let gesture = null;
  // relógio das animações (anda mais devagar na câmera lenta da batida final), tremida da mesa, ambiente e placar
  let vnow = 0, slow = 1, replay = null, kick = null, lamp = null, neon = null, flick = null, fxEl = null, clockHands = null, tvT = null, ambient = true, trays = null, woodM = null, chipMat = null, chipGame = null;
  let dog = null, frameN = 0;
  // cenário (arena) e mesa escolhidos no lobby: só o escolhido é montado; trocar desmonta o anterior
  let envG = null, tableG = null, sceneKey = '', tbl = { mat: 'wood', tray: 'canaleta' }, envTick = null, hemi = null, peopleP = null, lampI = LAMP_I, feltT = null;
  const lampP = { x: -7, y: 29, z: 10 }, FY = -15.6; // FY: altura do chão (os pés de toda mesa vão até ele)
  const perf = { t0: 0, n: 0, last: 0, down: 0 };
  const smoke = [], chips = [], fans = [], npcs = [], clock = () => vnow;
  const TEAMC = ['#2f7de1', '#e0453a', '#2fa36b', '#c08a12'];         // mesmas cores do HUD
  const REVEAL = { per: 110, dur: 560, base: won => (won ? 2600 : 300) }; // vencedora: espera a batida final // fim da mão: as pedras viram uma a uma (o HUD conta junto)
  const PIP = { 0: [], 1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
    5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [-1, 0], [-1, 1], [1, -1], [1, 0], [1, 1]],
    7: [[-1, -1], [-1, 0], [-1, 1], [0, 0], [1, -1], [1, 0], [1, 1]], 8: [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]],
    9: [[-1, -1], [0, -1], [1, -1], [-1, 0], [0, 0], [1, 0], [-1, 1], [0, 1], [1, 1]] };
  const idOf = t => Math.min(t[0], t[1]) * 10 + Math.max(t[0], t[1]);
  const same = (t, u) => (t[0] === u[0] && t[1] === u[1]) || (t[0] === u[1] && t[1] === u[0]);
  const C = h => new T.Color(h).convertSRGBToLinear();
  // pedras personalizadas (cada um escolhe as suas; só muda na própria tela)
  const SKINS = {
    marfim: { f: ['#fdf8ec', '#eadfc6'], gr: ['#b59f78', '#ffffff', '#cdbb94'], ln: 'rgba(120,96,60,.28)', mid: '#5b4a33', hi: 'rgba(255,255,255,.8)', side: 0xeee4cd, b: ['#f8f1e1', '#e3d6b9'], bl: 'rgba(120,96,60,.3)' },
    preto: { f: ['#38383e', '#16161a'], gr: ['#000000', '#5a5a60'], ln: 'rgba(255,255,255,.16)', mid: '#e8e0d0', hi: 'rgba(0,0,0,.6)', side: 0x1c1c20, b: ['#2c2c32', '#121216'], bl: 'rgba(255,255,255,.18)', light: true },
    madeira: { f: ['#b07a44', '#7a4a22'], gr: ['#5a3418', '#d8a06a'], ln: 'rgba(40,20,5,.35)', mid: '#2a1608', hi: 'rgba(255,220,170,.35)', side: 0x8a5a30, b: ['#a8703c', '#6a3e1c'], bl: 'rgba(40,20,5,.35)', wood: true },
    cristal: { f: ['#ff9a6a', '#c8401a'], gr: ['#ffffff', '#8a2a0a'], ln: 'rgba(255,255,255,.3)', mid: '#fff4e0', hi: 'rgba(120,30,0,.5)', side: 0xe0602a, b: ['#ff8a5a', '#b8381a'], bl: 'rgba(255,255,255,.3)', light: true, glass: true },
  };
  let skin = SKINS.marfim;
  const woodLines = (x, W, Hh, a) => { for (let i = 0; i < 46; i++) { x.strokeStyle = `rgba(50,25,8,${rand(.08, .25) * a})`; x.lineWidth = rand(1, 4); const y = rand(-20, Hh + 20); x.beginPath(); x.moveTo(0, y); x.bezierCurveTo(W * .3, y + rand(-14, 14), W * .7, y + rand(-14, 14), W, y + rand(-10, 10)); x.stroke(); } };
  const rand = (a, b) => a + Math.random() * (b - a);

  // ---------- texturas desenhadas no canvas ----------
  function canvasTex(w, h, draw, srgb = true) {
    const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
    const t = new T.CanvasTexture(c); if (srgb) t.encoding = T.sRGBEncoding; t.anisotropy = renderer.capabilities.getMaxAnisotropy(); return t;
  }
  function grain(x, w, h, n, cols, a) { for (let i = 0; i < n; i++) { x.fillStyle = cols[i % cols.length]; x.globalAlpha = a * Math.random(); x.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 1.5, 1 + Math.random() * 1.5); } x.globalAlpha = 1; }
  function rrect(x, X, Y, w, h, r) { x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + w, Y, X + w, Y + h, r); x.arcTo(X + w, Y + h, X, Y + h, r); x.arcTo(X, Y + h, X, Y, r); x.arcTo(X, Y, X + w, Y, r); x.closePath(); }
  // face da pedra: 1 unidade = W/2 px; meio esquerdo = a, meio direito = b
  function drawFace(x, W, Hh, t, bump) {
    const s = W / 2, U = (u, v) => [(u + 1) * s, (v + .5) * s];
    if (bump) { x.fillStyle = '#808080'; x.fillRect(0, 0, W, Hh); }
    else {
      const g = x.createRadialGradient(W / 2, Hh / 2, Hh * .1, W / 2, Hh / 2, W * .62); g.addColorStop(0, skin.f[0]); g.addColorStop(1, skin.f[1]);
      x.fillStyle = g; x.fillRect(0, 0, W, Hh); grain(x, W, Hh, 2600, skin.gr, .09); if (skin.wood) woodLines(x, W, Hh, 1);
      // filete gravado perto da borda
      rrect(x, s * .08, s * .08, W - s * .16, Hh - s * .16, s * .1); x.lineWidth = s * .012; x.strokeStyle = skin.ln; x.stroke();
    }
    // risca do meio (gravada)
    const [mx, my0] = U(0, -.37), my1 = U(0, .37)[1];
    if (bump) { x.strokeStyle = '#2a2a2a'; x.lineWidth = s * .05; x.beginPath(); x.moveTo(mx, my0); x.lineTo(mx, my1); x.stroke(); }
    else {
      x.lineCap = 'round'; x.lineWidth = s * .04;
      x.strokeStyle = skin.hi; x.beginPath(); x.moveTo(mx + s * .012, my0 + s * .01); x.lineTo(mx + s * .012, my1 + s * .01); x.stroke();
      x.strokeStyle = skin.mid; x.beginPath(); x.moveTo(mx, my0); x.lineTo(mx, my1); x.stroke();
    }
    // pontos cavados: anel claro embaixo, sombra em cima, fundo escuro com reflexo
    const R = .088 * s;
    [[t[0], -.5], [t[1], .5]].forEach(([v, cx]) => PIP[v].forEach(([px, pz]) => {
      const [X, Y] = U(cx + px * .26, pz * .26);
      if (bump) { const g = x.createRadialGradient(X, Y, 0, X, Y, R * 1.15); g.addColorStop(0, '#000'); g.addColorStop(.75, '#222'); g.addColorStop(1, '#808080'); x.fillStyle = g; x.beginPath(); x.arc(X, Y, R * 1.15, 0, 7); x.fill(); return; }
      if (skin.light) { // pontos claros pintados (pedra escura)
        x.fillStyle = 'rgba(0,0,0,.55)'; x.beginPath(); x.arc(X + R * .1, Y + R * .12, R * 1.1, 0, 7); x.fill();
        const g = x.createRadialGradient(X - R * .3, Y - R * .3, R * .1, X, Y, R); g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#d8d0c0'); x.fillStyle = g; x.beginPath(); x.arc(X, Y, R, 0, 7); x.fill(); return;
      }
      x.fillStyle = 'rgba(255,255,255,.85)'; x.beginPath(); x.arc(X + R * .12, Y + R * .14, R * 1.1, 0, 7); x.fill();
      x.fillStyle = 'rgba(70,50,25,.5)'; x.beginPath(); x.arc(X - R * .1, Y - R * .12, R * 1.06, 0, 7); x.fill();
      const g = x.createRadialGradient(X - R * .25, Y - R * .3, R * .1, X, Y, R); g.addColorStop(0, '#2c2118'); g.addColorStop(.6, '#0e0a07'); g.addColorStop(1, '#241a10');
      x.fillStyle = g; x.beginPath(); x.arc(X, Y, R, 0, 7); x.fill();
      x.fillStyle = 'rgba(255,255,255,.22)'; x.beginPath(); x.arc(X + R * .3, Y + R * .35, R * .22, 0, 7); x.fill();
    }));
    // rebite de latão no meio
    const [cx, cy] = U(0, 0), rr = .085 * s;
    if (bump) { const g = x.createRadialGradient(cx, cy, 0, cx, cy, rr); g.addColorStop(0, '#fff'); g.addColorStop(1, '#a0a0a0'); x.fillStyle = g; x.beginPath(); x.arc(cx, cy, rr, 0, 7); x.fill(); return; }
    x.fillStyle = 'rgba(60,40,10,.55)'; x.beginPath(); x.arc(cx + rr * .12, cy + rr * .15, rr * 1.12, 0, 7); x.fill();
    const g = x.createRadialGradient(cx - rr * .35, cy - rr * .4, rr * .05, cx, cy, rr); g.addColorStop(0, '#fff6c2'); g.addColorStop(.45, '#d9a640'); g.addColorStop(1, '#6e4a12');
    x.fillStyle = g; x.beginPath(); x.arc(cx, cy, rr, 0, 7); x.fill();
  }
  function faceOf(t) {
    const id = idOf(t); if (faceMat[id]) return faceMat[id];
    const map = canvasTex(512, 256, (x, w, h) => drawFace(x, w, h, t, false)), bump = canvasTex(256, 128, (x, w, h) => drawFace(x, w, h, t, true), false);
    for (const tx of [map, bump]) { tx.repeat.set(.5, 1); tx.offset.set(.5, .5); }
    return (faceMat[id] = new T.MeshPhysicalMaterial({ map, bumpMap: bump, bumpScale: .012, color: 0xffffff, roughness: .3, clearcoat: .7, clearcoatRoughness: .18, emissive: 0x000000, transparent: !!skin.glass, opacity: skin.glass ? .86 : 1 }));
  }
  function backTex() { // verso: marfim com um medalhão gravado (simétrico, porque o verso aparece espelhado)
    const t = canvasTex(512, 256, (x, W, Hh) => {
      const g = x.createRadialGradient(W / 2, Hh / 2, 10, W / 2, Hh / 2, W * .6); g.addColorStop(0, skin.b[0]); g.addColorStop(1, skin.b[1]);
      x.fillStyle = g; x.fillRect(0, 0, W, Hh); grain(x, W, Hh, 2600, skin.gr, .09); if (skin.wood) woodLines(x, W, Hh, 1);
      x.strokeStyle = skin.bl; x.lineWidth = 3; rrect(x, 20, 20, W - 40, Hh - 40, 24); x.stroke();
      x.lineWidth = 2.5; for (const r of [52, 40]) { x.beginPath(); x.arc(W / 2, Hh / 2, r, 0, 7); x.stroke(); }
      x.beginPath(); for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4, r = k % 2 ? 14 : 34; x.lineTo(W / 2 + Math.cos(a) * r, Hh / 2 + Math.sin(a) * r); } x.closePath(); x.stroke();
    });
    t.repeat.set(.5, 1); t.offset.set(.5, .5); return t;
  }
  function feltTex() { // feltro: fibras, costura em volta e o nome da casa bem apagado no meio
    const W = 1536, Hh = Math.round(W * 23 / 30), s = W / 30;
    return canvasTex(W, Hh, (x) => {
      x.fillStyle = '#1b6a40'; x.fillRect(0, 0, W, Hh);
      for (let i = 0; i < 60000; i++) { // fibrinhas
        const X = Math.random() * W, Y = Math.random() * Hh, a = Math.random() * 7, l = 1 + Math.random() * 3;
        x.strokeStyle = Math.random() < .5 ? 'rgba(10,50,28,.35)' : 'rgba(80,170,110,.18)'; x.lineWidth = .8;
        x.beginPath(); x.moveTo(X, Y); x.lineTo(X + Math.cos(a) * l, Y + Math.sin(a) * l); x.stroke();
      }
      const v = x.createRadialGradient(W / 2, Hh / 2, Hh * .3, W / 2, Hh / 2, W * .65); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.28)');
      x.fillStyle = v; x.fillRect(0, 0, W, Hh);
      // costura a 0,7 da borda
      const m = .7 * s; x.setLineDash([s * .32, s * .2]); x.lineWidth = s * .06;
      x.strokeStyle = 'rgba(0,0,0,.35)'; rrect(x, m + 2, m + 3, W - 2 * m, Hh - 2 * m, s * .9); x.stroke();
      x.strokeStyle = 'rgba(232,212,150,.75)'; rrect(x, m, m, W - 2 * m, Hh - 2 * m, s * .9); x.stroke(); x.setLineDash([]);
    });
  }
  function woodTex() { // madeira de lei envernizada: veios ondulados que contornam dois nós, com poros riscados
    const t = canvasTex(1024, 1024, (x, W, Hh) => {
      const im = x.createImageData(W, Hh), d = im.data, knots = [[rand(0, W), rand(0, Hh), rand(25, 45)], [rand(0, W), rand(0, Hh), rand(18, 32)]];
      const row = Float32Array.from({ length: Hh }, (_, y) => .06 * Math.sin(y * .37) + .05 * Math.sin(y * 1.9 + 1));
      for (let y = 0; y < Hh; y++) for (let X = 0; X < W; X++) {
        let v = y + 16 * Math.sin(X * .0061 + y * .0023) + 5 * Math.sin(X * .023 + 1.7);
        for (const [kx, ky, kr] of knots) { const dx = (X - kx) / (kr * 3), dy = (y - ky) / kr; v += kr * 1.6 * Math.exp(-(dx * dx + dy * dy)); }
        const f = (v / 21 + .2 * Math.sin(v * .013)) % 1, band = Math.pow(1 - Math.abs(f * 2 - 1), 4);
        const k = Math.min(1, Math.max(0, .32 + .5 * band + row[y] + (Math.random() - .5) * .06)), i = (y * W + X) * 4;
        d[i] = 170 - 100 * k; d[i + 1] = 92 - 58 * k; d[i + 2] = 46 - 32 * k; d[i + 3] = 255;
      }
      x.putImageData(im, 0, 0);
      for (let i = 0; i < 2600; i++) { x.fillStyle = `rgba(20,8,2,${rand(.08, .22)})`; x.fillRect(rand(0, W), rand(0, Hh), rand(4, 18), 1); }
    });
    t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(1 / 16, 1 / 16); return t;
  }
  function leatherTex() { // couro conhaque: manchas largas, poros e rugas finas
    const t = canvasTex(1024, 1024, (x, W, Hh) => {
      x.fillStyle = '#7a4424'; x.fillRect(0, 0, W, Hh);
      for (let i = 0; i < 240; i++) {
        const X = rand(0, W), Y = rand(0, Hh), r = rand(40, 160), g = x.createRadialGradient(X, Y, 0, X, Y, r);
        g.addColorStop(0, Math.random() < .55 ? 'rgba(45,18,6,.22)' : 'rgba(170,105,60,.16)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(X - r, Y - r, 2 * r, 2 * r);
      }
      for (let i = 0; i < 30000; i++) { x.fillStyle = `rgba(30,12,4,${rand(.12, .35)})`; x.beginPath(); x.arc(rand(0, W), rand(0, Hh), rand(.5, 1.6), 0, 7); x.fill(); }
      x.lineWidth = 1;
      for (let i = 0; i < 500; i++) {
        const X = rand(0, W), Y = rand(0, Hh), a = rand(0, 7), l = rand(8, 40);
        x.strokeStyle = 'rgba(25,10,3,.24)'; x.beginPath(); x.moveTo(X, Y); x.quadraticCurveTo(X + Math.cos(a + .5) * l * .5, Y + Math.sin(a + .5) * l * .5, X + Math.cos(a) * l, Y + Math.sin(a) * l); x.stroke();
        x.strokeStyle = 'rgba(255,210,170,.08)'; x.beginPath(); x.moveTo(X + 1, Y + 1); x.lineTo(X + 1 + Math.cos(a) * l, Y + 1 + Math.sin(a) * l); x.stroke();
      }
    });
    t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(1 / 7, 1 / 7); return t;
  }
  function chipMats(hex) { // ficha de pôquer: cor da dupla com listras brancas na borda
    const top = canvasTex(128, 128, (x) => {
      x.fillStyle = hex; x.beginPath(); x.arc(64, 64, 64, 0, 7); x.fill(); x.fillStyle = '#fff';
      for (let k = 0; k < 6; k++) { x.save(); x.translate(64, 64); x.rotate(k * Math.PI / 3); x.fillRect(-7, -64, 14, 18); x.restore(); }
      x.strokeStyle = 'rgba(255,255,255,.85)'; x.lineWidth = 3; x.beginPath(); x.arc(64, 64, 38, 0, 7); x.stroke();
      x.fillStyle = 'rgba(0,0,0,.12)'; x.beginPath(); x.arc(64, 64, 34, 0, 7); x.fill();
    });
    const side = canvasTex(128, 8, (x, W, Hh) => { x.fillStyle = hex; x.fillRect(0, 0, W, Hh); x.fillStyle = '#fff'; for (let k = 0; k < 6; k++) x.fillRect(k * W / 6, 0, W / 12, Hh); });
    const m = map => new T.MeshPhysicalMaterial({ map, roughness: .35, clearcoat: .7, clearcoatRoughness: .2 });
    return [m(side), m(top), m(top)];
  }

  // ---------- modelo da pedra ----------
  function roundRect(w, h, r) {
    const s = new T.Shape(), x = -w / 2, y = -h / 2;
    s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); return s;
  }
  function buildGeo() {
    const bv = .06, body = new T.ExtrudeGeometry(roundRect(2, 1, .17), { depth: TH - 2 * bv, bevelEnabled: true, bevelThickness: bv, bevelSize: bv * .85, bevelSegments: 4, curveSegments: 8 });
    // grupos: tampa de baixo = verso (2), tampa de cima = face (0), laterais (1)
    const caps = body.groups[0], half = caps.count / 2, rest = body.groups[1];
    body.clearGroups(); body.addGroup(caps.start, half, 2); body.addGroup(caps.start + half, half, 0); body.addGroup(rest.start, rest.count, 1);
    body.rotateX(-Math.PI / 2); body.translate(0, bv, 0); // deitada: face de cima em y = TH
    geo = { body, ring: new T.RingGeometry(.6, .9, 48).rotateX(-Math.PI / 2) };
    const back = new T.MeshPhysicalMaterial({ map: backTex(), roughness: .32, clearcoat: .6, clearcoatRoughness: .2, transparent: !!skin.glass, opacity: skin.glass ? .86 : 1 });
    mats = {
      back, side: new T.MeshPhysicalMaterial({ color: C(skin.side), roughness: .35, clearcoat: .6, clearcoatRoughness: .2, transparent: !!skin.glass, opacity: skin.glass ? .86 : 1 }),
      ghost: new T.MeshStandardMaterial({ color: 0xffe08a, emissive: 0xffc94a, emissiveIntensity: .6, transparent: true, opacity: .32, depthWrite: false }),
      ripple: new T.MeshBasicMaterial({ color: 0xfff2c8, transparent: true, opacity: .35, depthWrite: false }),
      // halo dourado atrás da pedra que dá para jogar (só a borda borrada aparece em volta dela)
      halo: new T.MeshBasicMaterial({ map: canvasTex(320, 200, (x, W, Hh) => { x.shadowColor = 'rgba(255,196,70,1)'; x.shadowBlur = 34; x.fillStyle = '#ffd36a'; rrect(x, 46, 46, W - 92, Hh - 92, 18); x.fill(); x.fill(); }),
        transparent: true, opacity: .8, blending: T.AdditiveBlending, depthWrite: false }),
      charge: new T.MeshBasicMaterial({ color: 0xffd36a, transparent: true, opacity: .85, depthWrite: false, side: T.DoubleSide }),
      // brilho redondo no feltro, embaixo da ponta, enquanto arma a pancada
      glow: new T.MeshBasicMaterial({ map: canvasTex(256, 256, (x, W) => { const g = x.createRadialGradient(W / 2, W / 2, 0, W / 2, W / 2, W / 2); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.45, 'rgba(255,255,255,.35)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, W, W); }),
        color: 0xffd36a, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false }),
      // sombra de contato: mancha escura borrada embaixo de cada pedra (some e espalha quando ela sobe)
      shadow: new T.MeshBasicMaterial({ map: canvasTex(270, 170, (x) => { x.shadowColor = '#000'; x.shadowBlur = 20; x.fillStyle = '#000'; rrect(x, 35, 35, 200, 100, 16); x.fill(); }),
        color: 0x000000, transparent: true, opacity: .5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 }),
    };
    geo.halo = new T.PlaneGeometry(2.9, 1.82).rotateX(-Math.PI / 2);
    geo.shadow = new T.PlaneGeometry(2.7, 1.7).rotateX(-Math.PI / 2);
    geo.glow = new T.PlaneGeometry(6, 6).rotateX(-Math.PI / 2);
    const wt = woodTex(); woodM = new T.MeshPhysicalMaterial({ map: wt, bumpMap: wt, bumpScale: .03, roughness: .45, clearcoat: 1, clearcoatRoughness: .12 });
    woodM.color.setScalar(.52); // a madeira da mesa no tom de antes (o bar apagava ela junto)
    geo.chip = new T.CylinderGeometry(.36, .36, .1, 28); chipMat = TEAMC.map(chipMats);
  }
  function addHalo(g) { const h = new T.Mesh(geo.halo, mats.halo.clone()); h.position.y = -.06; h.visible = false; h.renderOrder = -1; g.add(h); g.userData.halo = h; }
  function makeTile(t) { // t = [a, b] ou null (pedra desconhecida: verso dos dois lados)
    const g = new T.Group(), body = new T.Mesh(geo.body, [t ? faceOf(t) : mats.back, mats.side, mats.back]);
    body.castShadow = true; body.receiveShadow = true; g.add(body);
    if (t) addHalo(g);
    g.userData.body = body; return g;
  }
  // pedra reaproveitada no embaralhar: troca a face (ou vira só verso)
  function retile(o, tile) {
    if (o.tile === tile || (o.tile && tile && same(o.tile, tile))) return;
    o.tile = tile; o.g.userData.body.material = [tile ? faceOf(tile) : mats.back, mats.side, mats.back];
    if (tile && !o.g.userData.halo) addHalo(o.g);
    if (o.g.userData.halo) o.g.userData.halo.visible = false;
  }
  const faceDown = yaw => new T.Quaternion().setFromAxisAngle(UP(), yaw).multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), Math.PI));

  // ---------- posições ----------
  const UP = () => new T.Vector3(0, 1, 0);
  const flat = (x, z, rad) => ({ p: new T.Vector3(x, 0, z), q: new T.Quaternion().setFromAxisAngle(UP(), rad) });
  function basis(xv, yv, pos) { const z = new T.Vector3().crossVectors(xv, yv); return { p: pos, q: new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(xv, yv, z)) }; }
  // 5 a 8 jogadores (dominó de 9): os outros se espalham pela direita, pelo fundo e pela esquerda, no sentido da vez
  // [lado, posição ao longo do lado, comprimento livre para a mão]
  const MANY = {
    5: [['r', -.6, 13], ['t', 6.5, 12], ['t', -6.5, 12], ['l', -.6, 13]],
    6: [['r', -.6, 13], ['t', 9.5, 9], ['t', 0, 9], ['t', -9.5, 9], ['l', -.6, 13]],
    7: [['r', 3, 7], ['r', -5.5, 7], ['t', 6, 10], ['t', -6, 10], ['l', -5.5, 7], ['l', 3, 7]],
    8: [['r', 3, 7], ['r', -5.5, 7], ['t', 9.5, 8.5], ['t', 0, 8.5], ['t', -9.5, 8.5], ['l', -5.5, 7], ['l', 3, 7]],
  };
  function seat(s) { // lugar de cada jogador em volta da mesa (rel = 0 é você, embaixo)
    const rel = (s - mySeat + n) % n;
    if (n > 4 && rel) {
      const [side, u, len] = MANY[n][rel - 1];
      return side === 'r' ? { c: new T.Vector3(12.4, 0, -u), out: new T.Vector3(1, 0, 0), along: new T.Vector3(0, 0, 1), len }
        : side === 't' ? { c: new T.Vector3(u, 0, -9.2), out: new T.Vector3(0, 0, -1), along: new T.Vector3(-1, 0, 0), len }
          : { c: new T.Vector3(-12.4, 0, -u), out: new T.Vector3(-1, 0, 0), along: new T.Vector3(0, 0, -1), len };
    }
    const name = n === 2 ? ['me', 'top'][rel] : n === 3 ? ['me', 'right', 'left'][rel] : ['me', 'right', 'top', 'left'][rel];
    return {
      me: { c: new T.Vector3(0, 0, 8.4), out: new T.Vector3(0, 0, 1), along: new T.Vector3(1, 0, 0) },
      top: { c: new T.Vector3(0, 0, -9.2), out: new T.Vector3(0, 0, -1), along: new T.Vector3(-1, 0, 0) },
      right: { c: new T.Vector3(12.4, 0, -.6), out: new T.Vector3(1, 0, 0), along: new T.Vector3(0, 0, 1) },
      left: { c: new T.Vector3(-12.4, 0, -.6), out: new T.Vector3(-1, 0, 0), along: new T.Vector3(0, 0, -1) },
    }[name];
  }
  function standPose(s, j, c) { // pedra em pé na frente do dono, de costas para a mesa
    const S = seat(s), p = S.c.clone().addScaledVector(S.along, (j - (c - 1) / 2) * Math.min(1.1, (S.len || 99) / c)); p.y = 1.02;
    return basis(UP(), S.out.clone(), p);
  }
  function openPose(s, j, c) { // fim da mão: pedras deitadas, viradas para cima, na frente do dono
    const S = seat(s), p = S.c.clone().addScaledVector(S.out, -1.4).addScaledVector(S.along, (j - (c - 1) / 2) * Math.min(1.15, (S.len || 99) / c));
    return basis(S.out.clone().negate(), UP(), p);
  }
  function myPose(j, c) { // sua mão: em pé, inclinada para trás, de frente para quem joga
    const sp = Math.min(1.16, 22 / Math.max(c, 1)), p = new T.Vector3((j - (c - 1) / 2) * sp, Math.cos(LEAN) + .04, 8.4);
    return basis(new T.Vector3(0, Math.cos(LEAN), -Math.sin(LEAN)), new T.Vector3(0, Math.sin(LEAN), Math.cos(LEAN)), p);
  }
  function pilePose(j) { // monte virado para baixo
    const L = Math.floor(j / 14), k = j % 14; // monte grande (dominó de 9): empilha em camadas de 14
    const b = n >= 4 ? flat(9.6 + (j % 2) * 2.2, 6.3 + (Math.floor(j / 2) % 2) * 1.12, 0) // com gente no fundo da mesa: torrinha no canto da direita
      : n === 2 ? flat(-12.2 + Math.floor(k / 7) * 2.2, -3.6 + (k % 7) * 1.12, 0) : flat(-3.4 + (k % 7) * 1.12, -8.7 + Math.floor(k / 7) * 2.2, Math.PI / 2);
    b.q.multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), Math.PI)); b.p.y = TH + (n >= 4 ? Math.floor(j / 4) : L) * TH; return b;
  }
  // encaixe "de mão": uma folguinha entre as pedras e cada uma um pouco torta (sempre igual para a mesma pedra)
  const jit = (id, k) => { const v = Math.sin(id * 12.9898 + k * 78.233) * 43758.5453; return (v - Math.floor(v)) * 2 - 1; };
  function linePoses(s) { // pose de cada pedra da fileira (a partir da serpentina do Domino2UI)
    const { out } = Domino2UI.layout(s), keys = [s.C, ...s.R, ...s.L];
    return out.map((t, i) => {
      const id = idOf(keys[i]), a = -t.ang * Math.PI / 180, side = .035 * jit(id, 2);
      return { id, a: t.a, d: t.a === t.b, pose: flat(t.x * 1.035 + Math.sin(a) * side, t.y * 1.035 + Math.cos(a) * side, a + .045 * jit(id, 1)) };
    });
  }
  function lineAfter(tile, end) { // onde a pedra cairia se fosse jogada naquela ponta
    if (end === 'C' || !st.C) return { a: tile[0], pose: flat(0, 0, tile[0] === tile[1] ? -Math.PI / 2 : 0) };
    const [l, r] = Domino2.ends(st), open = end === 'L' ? l : r, inner = tile[0] === open ? tile[0] : tile[1], e = [inner, tile[0] + tile[1] - inner];
    const s2 = { C: st.C, L: end === 'L' ? [...st.L, e] : st.L, R: end === 'R' ? [...st.R, e] : st.R };
    const P = linePoses(s2); return P[end === 'R' ? s2.R.length : s2.R.length + s2.L.length];
  }
  // a pedra 3D tem os pontos fixos (a à esquerda); se na fileira ela entra virada, gira 180°
  const facing = (o, a, d, pose) => (d || o.tile[0] === a ? pose : { p: pose.p, q: pose.q.clone().multiply(new T.Quaternion().setFromAxisAngle(UP(), Math.PI)) });

  // ---------- montagem: luz, mesa e sala ----------
  function mount(container, h) {
    H = h || H; wrap = container;
    if (mounted) { if (canvas.parentNode !== wrap) wrap.prepend(canvas); if (resetBtn.parentNode !== wrap) wrap.appendChild(resetBtn); if (fxEl.parentNode !== wrap) wrap.appendChild(fxEl); resize(); return true; }
    if (!window.THREE) return false;
    T = window.THREE;
    try { renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }); } catch { return false; }
    renderer.setPixelRatio(Math.min(1.75, devicePixelRatio || 1)); renderer.outputEncoding = T.sRGBEncoding;
    renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = .95;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap; renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = true; // a sombra só é refeita quando algo se mexe (loop)
    canvas = renderer.domElement; canvas.className = 'd2-gl'; wrap.prepend(canvas);
    scene = new T.Scene(); scene.background = new T.Color(0x120c08);
    camera = new T.PerspectiveCamera(36, 1, .5, 420); ray = new T.Raycaster(); ptr = new T.Vector2(); plane = new T.Plane(UP(), -.9);
    // luz: luminária quente em cima, céu suave e um contorno frio
    hemi = new T.HemisphereLight(0xfff3e0, 0x3a2614, .2); scene.add(hemi);
    lamp = new T.SpotLight(0xffe6c0, LAMP_I, 90, .55, .45, 1); lamp.position.set(-7, 29, 10); // um pouco de lado: a sombra aparece
    lamp.castShadow = true; lamp.shadow.mapSize.set(2048, 2048); lamp.shadow.bias = -.0004; lamp.shadow.radius = 4; scene.add(lamp, lamp.target);
    const rim = new T.DirectionalLight(0xbcd2ff, .25); rim.position.set(10, 12, 18); scene.add(rim);
    buildGeo(); bindInput(); // o cenário e a mesa vêm no primeiro sync (dependem das opções da sala)
    resetBtn = document.createElement('button'); resetBtn.className = 'd2-cam d2-camreset'; resetBtn.title = 'Volta a câmera para a posição padrão (ou dê dois cliques na mesa)'; resetBtn.textContent = '🎥 Câmera padrão';
    resetBtn.onclick = resetCam; wrap.appendChild(resetBtn);
    fxEl = document.createElement('div'); fxEl.className = 'd2-fx'; fxEl.innerHTML = '<i></i><i></i><u></u>'; wrap.appendChild(fxEl); // vinheta + faixas de cinema
    new ResizeObserver(resize).observe(wrap); resize();
    mounted = true; return true;
  }
  // ---------- mesas: toda mesa tem a mesma área útil (feltro 30 x 23 em y = 0, com as pedras, mãos e fichas no mesmo lugar) ----------
  // muda o corpo, as cadeiras, o som/tremida (mat) e onde ficam as fichas (tray)
  const SEATS = [[-25, 0, Math.PI / 2], [25, 0, -Math.PI / 2], [0, -21, 0]]; // cadeiras de quem joga (a sua fica fora da câmera)
  const TABLES = {
    madeira(K) {
      const g = K.g;
      // feltro
      const ft = feltT || (feltT = feltTex()), felt = new T.Mesh(new T.PlaneGeometry(30, 23), new T.MeshStandardMaterial({ map: ft, bumpMap: ft, bumpScale: .02, roughness: 1 }));
      felt.rotation.x = -Math.PI / 2; felt.receiveShadow = true; g.add(felt);
      // almofada de couro em volta (anel arredondado e estofado)
      const ring = roundRect(33.8, 26.8, 2.2); ring.holes.push(roundRect(29.6, 22.6, 1.1));
      const lt = leatherTex();
      const rail = new T.Mesh(new T.ExtrudeGeometry(ring, { depth: .3, bevelEnabled: true, bevelThickness: .42, bevelSize: .38, bevelSegments: 6, curveSegments: 16 }),
        new T.MeshPhysicalMaterial({ map: lt, bumpMap: lt, bumpScale: .03, roughness: .48, clearcoat: .5, clearcoatRoughness: .3 }));
      rail.rotation.x = -Math.PI / 2; rail.position.y = .12; rail.castShadow = rail.receiveShadow = true; g.add(rail);
      // duas costuras de linha clara em cima do couro (um ponto a cada 0,3)
      const thread = new T.MeshStandardMaterial({ color: C(0xe9d4a4), roughness: .7 }), stitch = new T.BoxGeometry(.19, .025, .05), d = new T.Object3D();
      for (const [w, h, r] of [[33.8 - .7, 26.8 - .7, 1.85], [29.6 + .7, 22.6 + .7, 1.45]]) {
        const pts = roundRect(w, h, r).getSpacedPoints(Math.round((w + h) * 2 / .3)), m = new T.InstancedMesh(stitch, thread, pts.length - 1);
        for (let i = 0; i < pts.length - 1; i++) { const a = pts[i], b = pts[i + 1]; d.position.set((a.x + b.x) / 2, .855, -(a.y + b.y) / 2); d.rotation.set(0, Math.atan2(b.y - a.y, b.x - a.x), 0); d.updateMatrix(); m.setMatrixAt(i, d.matrix); }
        g.add(m);
      }
      // moldura e saia de madeira (borda larga e arredondada, verniz brilhante)
      const frame = new T.Mesh(new T.ExtrudeGeometry(roundRect(38.4, 31.4, 3.6), { depth: 1.1, bevelEnabled: true, bevelThickness: .4, bevelSize: .45, bevelSegments: 6, curveSegments: 20 }), woodM);
      frame.rotation.x = -Math.PI / 2; frame.position.y = -1.55; frame.receiveShadow = frame.castShadow = true; g.add(frame); // sólida: a sombra no chão sai cheia
      // pés de madeira e o chão
      const legM = woodM;
      for (const [x, z] of [[-15, -11.5], [15, -11.5], [-15, 11.5], [15, 11.5]]) { const l = new T.Mesh(new T.CylinderGeometry(.7, .5, 14, 16), legM); l.position.set(x, -8.6, z); l.castShadow = true; g.add(l); }
      const wc = K.std(0x40240f, { emissiveIntensity: .24 }); for (const [x, z, r] of SEATS) K.chair(x, z, r, wc);
      return { mat: 'wood', tray: 'canaleta' };
    },
    feltro(K) { // cenário padrão: só um tapete de feltro grosso, sem pés (como a base do Ludo)
      const g = K.g, ft = feltT || (feltT = feltTex());
      const felt = K.add(new T.PlaneGeometry(30, 23), new T.MeshStandardMaterial({ map: ft, bumpMap: ft, bumpScale: .02, roughness: 1 }), 0, 0, 0); felt.rotation.x = -Math.PI / 2; felt.receiveShadow = true;
      const base = K.add(new T.ExtrudeGeometry(roundRect(34, 27, 2.2), { depth: .8, bevelEnabled: true, bevelThickness: .3, bevelSize: .3, bevelSegments: 4, curveSegments: 16 }), new T.MeshStandardMaterial({ color: C(0x123d27), roughness: .95 }), 0, -1.12, 0);
      base.rotation.x = -Math.PI / 2; base.receiveShadow = base.castShadow = true;
      const ring = roundRect(30.9, 23.9, 1.3); ring.holes.push(roundRect(30.1, 23.1, 1));
      K.add(new T.ExtrudeGeometry(ring, { depth: .06, bevelEnabled: false }).rotateX(-Math.PI / 2), new T.MeshStandardMaterial({ color: C(0xb08a3e), metalness: .7, roughness: .35 }), 0, -.02, 0); // filete dourado em volta do feltro
      return { mat: 'felt', tray: 'canaleta' };
    },
    plastico(K) { // mesa de plástico de bar (azul): tampo com os cantos recortados, nervuras em estrela, saia baixa e pés em L que abrem um pouco
      const W = 31, h = W / 2, n = 1.7;
      const m = new T.MeshPhysicalMaterial({ color: C(0x1d4fa8), roughness: .45, clearcoat: .3, clearcoatRoughness: .45 });
      const topT = canvasTex(512, 512, (x, S) => {
        const c = S / 2; x.fillStyle = '#fff'; x.fillRect(0, 0, S, S); x.strokeStyle = 'rgba(0,0,0,.18)'; x.lineWidth = 5;
        for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, r = i % 2 ? c * 1.42 : c; x.beginPath(); x.moveTo(c, c); x.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r); x.stroke(); } // nervuras do molde
        x.beginPath(); x.arc(c, c, 18, 0, 7); x.stroke(); x.fillStyle = 'rgba(0,0,0,.3)'; x.beginPath(); x.arc(c, c, 9, 0, 7); x.fill(); // furo do guarda-sol
      });
      topT.repeat.set(1 / W, 1 / W); topT.offset.set(.5, .5); // a tampa do Extrude usa as coordenadas da forma como UV
      const outline = (hh, nn) => { const sh = new T.Shape(), P = [[-hh + nn, -hh], [hh - nn, -hh], [hh - nn, -hh + nn], [hh, -hh + nn], [hh, hh - nn], [hh - nn, hh - nn], [hh - nn, hh], [-hh + nn, hh], [-hh + nn, hh - nn], [-hh, hh - nn], [-hh, -hh + nn], [-hh + nn, -hh + nn]];
        sh.moveTo(...P[0]); for (const q of P.slice(1)) sh.lineTo(...q); sh.closePath(); return sh; }; // contorno com o degrau de cada canto (encaixe para empilhar)
      const top = K.add(new T.ExtrudeGeometry(outline(h, n), { depth: .5, bevelEnabled: true, bevelThickness: .15, bevelSize: .15, bevelSegments: 2 }), new T.MeshPhysicalMaterial({ color: C(0x1d4fa8), map: topT, bumpMap: topT, bumpScale: .05, roughness: .5, clearcoat: .3, clearcoatRoughness: .45 }), 0, -.65, 0);
      top.rotation.x = -Math.PI / 2; top.receiveShadow = top.castShadow = true;
      const ring = outline(h, n); ring.holes.push(outline(h - .5, n));
      const sk = K.add(new T.ExtrudeGeometry(ring, { depth: 2.2, bevelEnabled: false }), m, 0, -2.9, 0); sk.rotation.x = -Math.PI / 2; sk.castShadow = true; // saia
      const taper = (w, H, d, k) => { const g2 = new T.BoxGeometry(w, H, d); g2.translate(0, -H / 2, 0); const q = g2.attributes.position; for (let i = 0; i < q.count; i++) if (q.getY(i) < -H / 2) { q.setX(i, q.getX(i) * k); q.setZ(i, q.getZ(i) * k); } g2.computeVertexNormals(); return g2; };
      const H = -FY - .6;
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { // pé em L no canto recortado, afinando e abrindo para fora
        const L = new T.Group(); L.position.set(sx * (h - n), -.6, sz * (h - n)); L.rotation.set(-sz * .07, 0, sx * .07); K.g.add(L);
        K.add(taper(3.6, H, .55, .72), m, -sx * 1.5, 0, sz * .2, L); K.add(taper(.55, H, 3.6, .72), m, sx * .2, 0, -sz * 1.5, L);
        K.add(taper(1.6, H, 1.6, .7), m, sx * .2, 0, sz * .2, L); // quina grossa do L
        K.add(new T.BoxGeometry(2.6, .6, 2.6), m, sx * .2, -H + .3, sz * .2, L); // pezinho
        L.traverse(o => { if (o.isMesh) o.castShadow = true; });
      }
      for (const [x, z, r] of SEATS) K.plasticChair(x, z, r, m);
      return { mat: 'plastic', tray: 'pires' };
    },
    dobravel(K) { // mesa dobrável de metal preta: tampo de chapa com borda, quadro de tubo e pés em X dos dois lados
      const W = 31, h = W / 2, y = new T.MeshStandardMaterial({ color: C(0x151515), roughness: .38, metalness: .55 });
      const topT = canvasTex(512, 512, (x, S) => { x.fillStyle = '#1c1c1c'; x.fillRect(0, 0, S, S); grain(x, S, S, 6000, ['#0e0e0e', '#3a3a3a'], .25); for (let i = 0; i < 25; i++) { x.strokeStyle = `rgba(160,160,160,${rand(.03, .09)})`; x.lineWidth = rand(1, 2); const a = rand(0, S), b = rand(0, S); x.beginPath(); x.moveTo(a, b); x.lineTo(a + rand(-40, 40), b + rand(-8, 8)); x.stroke(); } }); // riscos de uso
      const top = K.add(new T.BoxGeometry(W, .4, W), [y, y, new T.MeshStandardMaterial({ map: topT, roughness: .45, metalness: .3 }), y, y, y], 0, -.2, 0); top.receiveShadow = top.castShadow = true;
      for (const [a, b] of [[[-h, h], [-h, -h]], [[h, h], [h, -h]], [[-h, -h], [h, -h]], [[-h, h], [h, h]]]) K.beam(y, K.V(a[0], -.3, a[1]), K.V(b[0], -.3, b[1]), .3, .3, 8); // borda virada
      const q = h - 1.4;
      for (const [a, b] of [[[-q, q], [-q, -q]], [[q, q], [q, -q]], [[-q, -q], [q, -q]], [[-q, q], [q, q]]]) K.beam(y, K.V(a[0], -.9, a[1]), K.V(b[0], -.9, b[1]), .35, .35, 8); // quadro de tubo
      const bolt = new T.MeshStandardMaterial({ color: 0x777777, metalness: .8, roughness: .3 }), rub = new T.MeshStandardMaterial({ color: 0x0a0a0a, roughness: .9 });
      for (const x of [-q, q]) {
        K.beam(y, K.V(x, -.9, -q), K.V(x, FY + .5, q + .6), .42, .42, 8); K.beam(y, K.V(x, -.9, q), K.V(x, FY + .5, -q - .6), .42, .42, 8);
        const b = K.add(new T.CylinderGeometry(.5, .5, 1.3, 10), bolt, x, (FY - .4) / 2, 0); b.rotation.z = Math.PI / 2; // parafuso do X
        for (const z of [q + .6, -q - .6]) K.add(new T.CylinderGeometry(.5, .55, .5, 10), rub, x, FY + .25, z); // ponteira de borracha
      }
      for (const z of [q + .6, -q - .6]) K.beam(y, K.V(-q, FY + .5, z), K.V(q, FY + .5, z), .35, .35, 8); // barra do pé
      for (const [x, z, r] of SEATS) K.foldChair(x, z, r, y);
      return { mat: 'metal', tray: 'pires' };
    },
    concreto(K) { // mesa de concreto de praça: tampo com azulejo português em volta e granilite no meio, num pé só
      const cT = canvasTex(1024, 1024, (x, W) => {
        const u = W / 36; x.fillStyle = '#9a968c'; x.fillRect(0, 0, W, W); grain(x, W, W, 9000, ['#6e6a62', '#c8c4b8', '#55524c'], .35);
        for (let i = 0; i < 12; i++) for (let j = 0; j < 12; j++) { // faixa de azulejo branco e azul
          if (i > 0 && i < 11 && j > 0 && j < 11) continue;
          const X = 1.5 * u + i * 2.75 * u, Y = 1.5 * u + j * 2.75 * u, w = 2.75 * u - 4; x.fillStyle = '#eef2f4'; x.fillRect(X, Y, w, w);
          x.strokeStyle = '#1d4f9a'; x.lineWidth = 5; x.beginPath(); x.arc(X + w / 2, Y + w / 2, w * .28, 0, 7); x.stroke();
          for (const [a, b] of [[0, 0], [w, 0], [0, w], [w, w]]) { x.beginPath(); x.arc(X + a, Y + b, w * .22, 0, 7); x.stroke(); }
          x.fillStyle = '#1d4f9a'; x.beginPath(); x.arc(X + w / 2, Y + w / 2, w * .08, 0, 7); x.fill();
        }
        const a = 4.4 * u; x.fillStyle = '#8c8a84'; x.fillRect(a, a, W - 2 * a, W - 2 * a);
        for (let i = 0; i < 9000; i++) { x.fillStyle = ['#5a5852', '#d8d4c8', '#7a4a3a', '#3a3a38'][i % 4]; x.globalAlpha = rand(.3, .8); x.fillRect(rand(a, W - a), rand(a, W - a), rand(1, 4), rand(1, 4)); } x.globalAlpha = 1; // granilite
      });
      const conc = new T.MeshStandardMaterial({ color: C(0xa8a49a), roughness: .95 });
      const top = K.add(new T.BoxGeometry(32, 1.6, 32), [conc, conc, new T.MeshStandardMaterial({ map: cT, roughness: .7 }), conc, conc, conc], 0, -.8, 0); top.receiveShadow = top.castShadow = true;
      K.add(new T.CylinderGeometry(3.6, 4.4, -FY - 1.6, 20), conc, 0, (FY - 1.6) / 2, 0).castShadow = true;
      K.add(new T.CylinderGeometry(6, 6.5, 1, 20), conc, 0, FY + .5, 0);
      for (const [x, z] of SEATS) { const b = K.add(new T.CylinderGeometry(2.8, 3, 9.5, 16), conc, x, FY + 4.75, z); b.castShadow = true; } // banquinhos de concreto
      return { mat: 'concrete', tray: 'pires' };
    },
  };
  let glowTex = null;
  function kit(g) {
    const V = (x, y, z) => new T.Vector3(x, y, z);
    const add = (geom, m, x, y, z, parent = g) => { const o = new T.Mesh(geom, m); o.position.set(x, y, z); parent.add(o); return o; };
    const lit = (map, k, x = {}) => new T.MeshStandardMaterial({ map, emissive: 0xffffff, emissiveMap: map, emissiveIntensity: k, roughness: .85, ...x });
    const std = (c, x = {}) => new T.MeshStandardMaterial({ color: C(c), roughness: .6, emissive: C(c), emissiveIntensity: .22, ...x });
    const glowT = glowTex || (glowTex = canvasTex(128, 128, (x, W) => { const r = x.createRadialGradient(W / 2, W / 2, 0, W / 2, W / 2, W / 2); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(.22, 'rgba(255,255,255,.35)'); r.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = r; x.fillRect(0, 0, W, W); }));
    const gms = {}, glow = (x, y, z, s, op = .45, col = 0xffb46a) => { const k = op + '|' + col, sp = new T.Sprite(gms[k] || (gms[k] = new T.SpriteMaterial({ map: glowT, color: col, transparent: true, opacity: op, blending: T.AdditiveBlending, depthWrite: false }))); sp.position.set(x, y, z); sp.scale.setScalar(s); g.add(sp); return sp; };
    const noise = (x, W, Hh, n, a) => { for (let i = 0; i < n; i++) { x.fillStyle = `rgba(${Math.random() < .5 ? '0,0,0' : '255,235,200'},${rand(a * .3, a)})`; x.fillRect(rand(0, W), rand(0, Hh), rand(1, 5), rand(1, 5)); } };
    const pool = (x, cx, cy, r, a = .55) => { const p = x.createRadialGradient(cx, cy, 4, cx, cy + r * .2, r); p.addColorStop(0, `rgba(255,190,110,${a})`); p.addColorStop(.45, `rgba(255,150,70,${a * .3})`); p.addColorStop(1, 'rgba(255,140,60,0)'); x.fillStyle = p; x.fillRect(cx - r, cy - r, r * 2, r * 2.2); };
    const legG = new T.CylinderGeometry(.18, .18, 1, 6);
    const chair = (x, z, ry, m) => { // cadeira de madeira: assento de 40 cm e encosto de ripas
      const c = new T.Group(); c.position.set(x, FY, z); c.rotation.y = ry; g.add(c);
      add(new T.BoxGeometry(7.8, .6, 7.4), m, 0, 9.2, 0, c);
      for (const k of [0, 1, 2]) add(new T.BoxGeometry(7.6, 1.1, .4), m, 0, 12 + k * 2, -3.5, c);
      for (const [a, b, hh] of [[-3.4, -3.4, 18], [3.4, -3.4, 18], [-3.4, 3.2, 9.2], [3.4, 3.2, 9.2]]) { const l = add(legG, m, a, hh / 2, b, c); l.scale.set(2.6, hh, 2.6); }
      c.traverse(o => { if (o.isMesh) o.castShadow = true; }); return c;
    };
    const beam = (m, a, b, r0, r1, sides = 8) => { const d = b.clone().sub(a), o = add(new T.CylinderGeometry(r1, r0, d.length(), sides), m, 0, 0, 0); o.position.copy(a).addScaledVector(d, .5); o.quaternion.setFromUnitVectors(UP(), d.normalize()); if (sides === 4) o.rotateY(Math.PI / 4); o.castShadow = true; return o; };
    const rod = (c, m, a, b, r0, r1 = r0, sides = 8) => { const d = b.clone().sub(a), o = add(new T.CylinderGeometry(r1, r0, d.length(), sides), m, 0, 0, 0, c); o.position.copy(a).addScaledVector(d, .5); o.quaternion.setFromUnitVectors(UP(), d.normalize()); return o; };
    const plasticChair = (x, z, ry, m) => { // cadeira de plástico com braço (monobloco): assento largo, encosto curvo que vira braço e pés abertos
      const c = new T.Group(); c.position.set(x, FY, z); c.rotation.y = ry; g.add(c);
      add(new T.ExtrudeGeometry(roundRect(9, 8.4, 1.6), { depth: .5, bevelEnabled: true, bevelThickness: .2, bevelSize: .2, bevelSegments: 2 }).rotateX(-Math.PI / 2), m, 0, 8.9, .4, c);
      const back = add(new T.CylinderGeometry(5.2, 5.4, 7.2, 20, 1, true, Math.PI - 1.25, 2.5), m.clone(), 0, 13.3, .9, c); back.material.side = T.DoubleSide; back.rotation.x = -.1; // encosto curvo
      add(new T.TorusGeometry(5.3, .32, 6, 20, 2.5), m, 0, 16.9, .6, c).rotation.set(Math.PI / 2, 0, Math.PI / 2 + 1.25 - .02); // borda de cima do encosto
      for (const sx of [-1, 1]) {
        add(new T.BoxGeometry(1.3, .5, 6), m, sx * 4.7, 12.6, .9, c); // braço
        rod(c, m, V(sx * 4.6, 12.5, 3.6), V(sx * 5.1, 0, 4.7), .75, .55, 6); // pé da frente sobe até o braço
        rod(c, m, V(sx * 4.2, 9.2, -3.2), V(sx * 5, 0, -4.8), .75, .55, 6); // pé de trás
      }
      c.traverse(o => { if (o.isMesh) o.castShadow = true; }); return c;
    };
    const padM = new T.MeshStandardMaterial({ color: C(0x111111), roughness: .55 });
    const foldChair = (x, z, ry, m) => { // cadeira dobrável de metal preta: assento e encosto estofados, tubos cruzados dos lados
      const c = new T.Group(); c.position.set(x, FY, z); c.rotation.y = ry; g.add(c);
      add(new T.BoxGeometry(7.8, .8, 7.2), padM, 0, 9.2, .4, c);
      add(new T.BoxGeometry(7.6, 3.8, .7), padM, 0, 15.2, -3.6, c).rotation.x = -.08;
      for (const sx of [-1, 1]) {
        rod(c, m, V(sx * 3.9, 0, -4.8), V(sx * 3.9, 17.4, -3.5), .28); // trás: vai do chão até o encosto
        rod(c, m, V(sx * 3.9, 0, 4.4), V(sx * 3.9, 9, -3.6), .28); // frente: cruza por baixo do assento
        rod(c, m, V(sx * 3.9, 8.7, -3.6), V(sx * 3.9, 8.7, 4), .24); // trilho do assento
      }
      rod(c, m, V(-3.9, .4, 4.4), V(3.9, .4, 4.4), .22); rod(c, m, V(-3.9, .4, -4.8), V(3.9, .4, -4.8), .22);
      c.traverse(o => { if (o.isMesh) o.castShadow = true; }); return c;
    };
    const K = { g, V, add, lit, std, glow, glowT, noise, pool, chair, beam, plasticChair, foldChair };
    K.npc = (...a) => (K._npc || (K._npc = npcKit(K)))(...a);
    return K;
  }
  function npcKit(K) { // fregueses: (x, z, giro, altura do assento ou 0 em pé, jeito, bebe?)
    const { g, add, std, V } = K;
    const glassM = new T.MeshStandardMaterial({ color: C(0xd08a2a), roughness: .1, transparent: true, opacity: .7, emissive: C(0x7a4a10), emissiveIntensity: .6 }), glassG = new T.CylinderGeometry(.75, .6, 2.6, 12), foamM = std(0xf2ead8, { emissiveIntensity: .5 }), foamG = new T.CylinderGeometry(.76, .76, .5, 12);
    // fregueses: feitos de formas simples (leves), mas com rosto, cabelo, cotovelo e sapato; bebem de vez em quando e olham para a mesa na batida final
    const skinC = ['#c68a62', '#8a5a3a', '#e0b090', '#6a4028'], shirtC = ['#8a2a2a', '#2a4a7a', '#d8d0c0', '#3a5a2a', '#6a4a8a', '#c08a2a', '#7a3a1a'];
    const limb = new T.CylinderGeometry(.75, .65, 1, 8), headG = new T.SphereGeometry(2.1, 16, 12), hairG = new T.SphereGeometry(2.2, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2.1), handG = new T.SphereGeometry(.7, 8, 6);
    const torsoG = new T.LatheGeometry([[0, 0], [2.15, 0], [2.25, 3], [2.05, 6], [2.55, 9.4], [2.7, 10.7], [2.1, 11.8], [.9, 12.2], [0, 12.2]].map(([a, b]) => new T.Vector2(a, b)), 16);
    const ballJ = new T.SphereGeometry(.9, 8, 6), eyeG = new T.SphereGeometry(.26, 8, 6), noseG = new T.SphereGeometry(.42, 8, 6), earG = new T.SphereGeometry(.5, 8, 6), neckG = new T.CylinderGeometry(.85, .95, 1.8, 10);
    const shoeG = new T.BoxGeometry(1.7, 1, 3.2), beltG = new T.CylinderGeometry(2.2, 2.2, .6, 16), browG = new T.BoxGeometry(1, .22, .3), mustG = new T.BoxGeometry(1.6, .38, .4);
    const capG = new T.CylinderGeometry(2.25, 2.3, 1.6, 16), brimG = new T.BoxGeometry(3.4, .25, 2.4), eyeM = std('#120c08', { emissiveIntensity: 0, roughness: .3 }), shoeM = std('#1a120c', { emissiveIntensity: .12, roughness: .4 });
    const seg = (parent, m, a, b, r = 1) => { const d = b.clone().sub(a), o = add(limb, m, 0, 0, 0, parent); o.position.copy(a).addScaledVector(d, .5); o.scale.set(r, d.length(), r); o.quaternion.setFromUnitVectors(UP(), d.normalize()); return o; };
    return (x, z, ry, seat, i, drink) => {
      const p = new T.Group(); p.position.set(x, FY, z); p.rotation.y = ry; g.add(p);
      const shirt = std(shirtC[i % shirtC.length], { emissiveIntensity: .2 }), skin = std(skinC[i % skinC.length], { emissiveIntensity: .2, roughness: .75 }), pants = std(i % 2 ? '#2a3040' : '#3a3026', { emissiveIntensity: .15 }), hair = std(i % 3 ? '#1a120c' : '#5a4030', { emissiveIntensity: .15 });
      const hip = seat || 16.5;
      for (const sx of [-1.1, 1.1]) {
        if (seat) { seg(p, pants, V(sx, hip, 0), V(sx, hip, 5), 1.15); add(ballJ, pants, sx, hip, 5, p); seg(p, pants, V(sx, hip, 5), V(sx, .9, 5.5)); add(shoeG, shoeM, sx, .5, 6.1, p); }
        else { seg(p, pants, V(sx, hip, 0), V(sx, .9, 0), 1.15); add(shoeG, shoeM, sx, .5, .6, p); }
      }
      add(torsoG, shirt, 0, hip, 0, p).scale.z = .78; add(beltG, shoeM, 0, hip + .4, 0, p).scale.z = .8;
      add(neckG, skin, 0, hip + 12.7, 0, p);
      const head = new T.Group(); head.position.set(0, hip + 14.6, 0); p.add(head); add(headG, skin, 0, 0, 0, head).scale.set(1, 1.12, 1.02);
      for (const sx of [-1, 1]) { add(eyeG, eyeM, sx * .75, .3, 1.88, head); add(browG, hair, sx * .8, .85, 1.86, head); add(earG, skin, sx * 2.05, 0, 0, head).scale.set(.5, 1, .8); }
      add(noseG, skin, 0, -.25, 2.1, head).scale.set(.8, 1, 1.2);
      const hs = i % 4;
      if (hs === 1) { add(capG, std(shirtC[(i + 3) % shirtC.length]), 0, 1.3, 0, head); add(brimG, std(shirtC[(i + 3) % shirtC.length]), 0, .6, 2.1, head); } // boné
      else if (hs === 2) add(hairG, hair, 0, -.2, -.3, head).scale.set(1.02, .7, 1); // careca com a coroa baixa
      else add(hairG, hair, 0, .3, -.2, head);
      if (hs === 3 || i === 2) add(mustG, hair, 0, -.95, 1.95, head); // bigode
      // braço esquerdo apoiado; o direito é o que leva o copo à boca
      seg(p, shirt, V(-2.6, hip + 10.6, 0), V(-2.9, hip + 7.4, .4), .95); add(ballJ, skin, -2.9, hip + 7.4, .4, p).scale.setScalar(.8);
      seg(p, skin, V(-2.9, hip + 7.4, .4), V(-2.9, hip + 4.4, .8), .75); add(handG, skin, -2.9, hip + 4, .9, p);
      const arm = new T.Group(); arm.position.set(2.6, hip + 10.6, 0); p.add(arm); seg(arm, shirt, V(0, 0, 0), V(.3, -5.1, 1), .95); add(ballJ, skin, .3, -5.1, 1, arm).scale.setScalar(.8);
      const fore = new T.Group(); fore.position.set(.3, -5.1, 1); arm.add(fore); seg(fore, skin, V(0, 0, 0), V(0, 0, 4.5), .75); add(handG, skin, 0, 0, 4.8, fore);
      if (drink) { add(glassG, glassM, 0, .7, 5, fore); add(foamG, foamM, 0, 2.15, 5, fore); }
      let look = Math.atan2(-x, -z) - ry; look = Math.atan2(Math.sin(look), Math.cos(look)); // cabeça virando para a mesa do jogo
      npcs.push({ head, fore, ph: rand(0, 9), next: rand(2, 9), dt: 99, drink, look: Math.max(-1.3, Math.min(1.3, look)), lookT: 0, p, x, z, seat, i, yaw: 0, shirtC: shirtC[i % shirtC.length] });
    };
  }
  // fim de todo cenário: troca os fregueses pelos 3D, apaga o que está longe da mesa (a luz é pintada, então dá para dosar por material) e junta o que é parado
  function finishEnv(K, floor, o = {}) {
    const g = K.g, dim = o.dim || DIM;
    if (npcs.length) loadPeople();
    const near = new Map(), wp = new T.Vector3();
    g.updateMatrixWorld(true);
    g.traverse(o2 => { if (!o2.material || o2 === floor) return; o2.getWorldPosition(wp); const d = Math.hypot(wp.x, wp.z); for (const m of [].concat(o2.material)) near.set(m, Math.min(near.get(m) ?? 1e9, d)); });
    for (const [m, d] of near) {
      const k = dim(d), src = m.isMeshBasicMaterial || m.emissiveIntensity >= .9; // lâmpadas, neon e telas apagam menos: são o que dá clima no escuro
      if (m.isSpriteMaterial) m.opacity *= Math.sqrt(k);
      else if (src) { if ('emissiveIntensity' in m) m.emissiveIntensity *= Math.sqrt(k); }
      else { if ('emissiveIntensity' in m) m.emissiveIntensity *= k; if (m.color && !m.transparent) m.color.multiplyScalar(.35 + .65 * k); } // apaga a luz pintada e também o quanto a peça reflete a luz ambiente
    }
    if (floor && o.floorC) floor.material.color.setScalar(o.floorC); // chão de noite: mais escuro que a mesa
    if (floor && o.floorK != null) floor.material.emissiveIntensity = o.floorK; else if (floor) floor.material.emissiveIntensity = .05; // o chão só aparece onde a luz da mesa alcança
    mergeStatic(g, new Set([dog?.g, ...npcs.map(n => n.p), ...fans, ...(clockHands || []), ...smoke, ...(o.skip || [])].filter(Boolean)));
    scene.background = new T.Color(o.bg ?? 0x030201); scene.fog = new T.Fog(o.bg ?? 0x030201, ...(o.fog || [80, 200]));
  }
  // ---------- pedaços dos cenários ao ar livre ----------
  const DAYDIM = d => Math.max(.75, Math.min(1, 1.25 - d / 160)); // de dia quase não apaga o entorno
  function skyDome(K, top, mid, o = {}) { // céu em degradê numa esfera; de noite com estrelas
    const t = canvasTex(8, 256, (x, W, Hh) => { const g = x.createLinearGradient(0, 0, 0, Hh); g.addColorStop(0, top); g.addColorStop(.5, mid); g.addColorStop(1, mid); x.fillStyle = g; x.fillRect(0, 0, W, Hh); });
    K.add(new T.SphereGeometry(330, 24, 16), new T.MeshBasicMaterial({ map: t, side: T.BackSide, fog: false, depthWrite: false }), 0, 0, 0).renderOrder = -2;
    if (o.stars) {
      const n = 500, pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { const a = rand(0, Math.PI * 2), e = Math.asin(rand(.08, 1)), r = 300; pos.set([Math.cos(a) * Math.cos(e) * r, Math.sin(e) * r - 30, Math.sin(a) * Math.cos(e) * r], i * 3); }
      const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3)); K.g.add(new T.Points(g, new T.PointsMaterial({ color: 0xdfe6ff, size: 1.6, sizeAttenuation: false, fog: false, transparent: true })));
    }
    scene.background = new T.Color(mid);
  }
  function daylight(sun = 0xfff1dc, at = { x: -24, y: 62, z: 26 }, I = 1.5) { // de dia a "luminária" vira o sol
    hemi.color.setHex(0xe4f0ff); hemi.groundColor.setHex(0x7a6a50); hemi.intensity = .85; lamp.color.setHex(sun); lampI = I; lamp.angle = .7; lamp.distance = 0;
    Object.assign(lampP, at); renderer.toneMappingExposure = 1;
  }
  function night(col, at, I = 2.3, sky = 0x8aa0d0) { lamp.color.setHex(col); lampI = I; if (at) Object.assign(lampP, at); hemi.color.setHex(sky); hemi.groundColor.setHex(0x1a1a20); hemi.intensity = .25; }
  function ground(K, tex, rep, w = 900) {
    tex.wrapS = tex.wrapT = T.RepeatWrapping; tex.repeat.set(rep * w / 420, rep * w / 420);
    const f = K.add(new T.PlaneGeometry(w, w), K.lit(tex, .1, { roughness: .95 }), 0, FY, 0); f.rotation.x = -Math.PI / 2; f.receiveShadow = true;
    const ao = K.add(geo.shadow, mats.shadow.clone(), 0, FY + .05, 0); ao.scale.set(17, 1, 24); ao.material.opacity = .7; return f;
  }
  function tree(K, x, z, s = 1) { // árvore de praça: tronco grosso e copa de várias bolotas
    const g = new T.Group(); g.position.set(x, FY, z); g.scale.setScalar(s); K.g.add(g);
    const bark = K.std('#4a3424', { emissiveIntensity: .12, roughness: .95 }), lv = ['#2f5a24', '#3a6a2a', '#28501f'].map(c => K.std(c, { emissiveIntensity: .14, roughness: .9, flatShading: true }));
    K.add(new T.CylinderGeometry(1.5, 2.4, 24, 10), bark, 0, 12, 0, g).castShadow = true;
    for (const a of [.6, 2.6, 4.4]) { const b = K.add(new T.CylinderGeometry(.6, 1, 10, 6), bark, Math.cos(a) * 3, 25, Math.sin(a) * 3, g); b.rotation.set(Math.sin(a) * .6, 0, -Math.cos(a) * .6); }
    const crown = new T.Group(); crown.position.y = 32; g.add(crown);
    for (let i = 0; i < 10; i++) K.add(new T.IcosahedronGeometry(rand(5, 8.5), 1), lv[i % 3], rand(-8, 8), rand(-3, 6), rand(-8, 8), crown).castShadow = true;
    return crown;
  }
  function lantern(K, at, col = 0xffd9a0) { // lanterna onde fica a luz da mesa
    const ferro = K.std('#1c2a22', { emissiveIntensity: .1, roughness: .5, metalness: .4 });
    K.add(new T.ConeGeometry(2.2, 2, 6), ferro, at.x, at.y + 2.4, at.z);
    K.add(new T.CylinderGeometry(1.3, 1, 2.6, 6, 1, true), new T.MeshBasicMaterial({ color: col, transparent: true, opacity: .55, side: T.DoubleSide }), at.x, at.y + .6, at.z);
    K.add(new T.SphereGeometry(.6, 10, 8), new T.MeshBasicMaterial({ color: 0xfff2d0 }), at.x, at.y + .6, at.z); K.glow(at.x, at.y + .6, at.z, 18, .5, col);
    return ferro;
  }
  function poste(K, x, z, at, col) { // poste colonial com um braço até a lanterna
    const ferro = lantern(K, at, col), top = at.y + 4;
    K.add(new T.CylinderGeometry(.55, .9, top - FY, 10), ferro, x, (top + FY) / 2, z).castShadow = true; K.add(new T.CylinderGeometry(1.5, 1.9, 3, 10), ferro, x, FY + 1.5, z);
    const arm = K.beam(ferro, K.V(x, top - .5, z), K.V(at.x, top - .5, at.z), .25, .25, 6); arm.castShadow = false;
  }
  function bench(K, x, z, ry) { // banco de praça: pés de concreto e ripas de madeira
    const g = new T.Group(); g.position.set(x, FY, z); g.rotation.y = ry; K.g.add(g);
    const conc = K.std('#9a968c', { emissiveIntensity: .12, roughness: .95 }), wood = K.std('#7a4a26', { emissiveIntensity: .15, roughness: .8 });
    for (const a of [-8, 8]) K.add(new T.BoxGeometry(1.5, 8, 6), conc, a, 4, 0, g);
    for (let k = 0; k < 3; k++) K.add(new T.BoxGeometry(20, .5, 1.6), wood, 0, 8.3, -1.9 + k * 1.9, g);
    for (let k = 0; k < 2; k++) K.add(new T.BoxGeometry(20, 1.4, .4), wood, 0, 11 + k * 2, -3, g);
  }
  function stringBulbs(K, a, b, sag, nB, col = 0xffd08a) { // gambiarra: fio caído com lâmpadas
    const pts = Array.from({ length: 24 }, (_, i) => { const t = i / 23; return a.clone().lerp(b, t).setY(a.y + (b.y - a.y) * t - sag * 4 * t * (1 - t)); });
    K.g.add(new T.Line(new T.BufferGeometry().setFromPoints(pts), new T.LineBasicMaterial({ color: 0x0a0806 })));
    const bm = new T.MeshBasicMaterial({ color: col }), bg = new T.SphereGeometry(.45, 8, 6);
    for (let i = 1; i <= nB; i++) { const p = pts[Math.round(i * 23 / (nB + 1))]; K.add(bg, bm, p.x, p.y - .5, p.z); K.glow(p.x, p.y - .5, p.z, 5, .45, col); }
    return pts;
  }
  const OUTDOOR = {
    praca(K, dia) { // praça de bairro: pedra portuguesa, árvores, poste colonial, bancos e os velhos da outra mesa
      const at = { x: -16, y: 33, z: -6 };
      skyDome(K, dia ? '#5d9fd8' : '#03060f', dia ? '#cfe3f0' : '#151b2e', { stars: !dia });
      if (dia) daylight(); else night(0xffd9a0, at);
      const pt = canvasTex(512, 512, (x, W) => {
        x.fillStyle = '#b8b3a8'; x.fillRect(0, 0, W, W); x.fillStyle = '#3a3a3e';
        for (let b = 0; b < 4; b++) { x.beginPath(); for (let X = 0; X <= W; X += 8) x.lineTo(X, b * 128 + 40 + Math.sin(X / W * Math.PI * 4) * 34); for (let X = W; X >= 0; X -= 8) x.lineTo(X, b * 128 + 78 + Math.sin(X / W * Math.PI * 4) * 34); x.fill(); } // ondas
        x.strokeStyle = 'rgba(90,85,80,.55)'; x.lineWidth = 1.2; for (let y = 0; y < W; y += 7) for (let X = 0; X < W; X += 7) { x.strokeRect(X + rand(-1, 1), y + rand(-1, 1), 7, 7); } // pedrinhas
      });
      const floor = ground(K, pt, 12);
      poste(K, -24, -8, at); if (!dia) { lantern(K, { x: 60, y: 30, z: -70 }); K.add(new T.CylinderGeometry(.55, .9, 50, 8), K.std('#1c2a22'), 60, FY + 25, -70); }
      const crowns = [tree(K, -50, -44, 1.2), tree(K, 56, -56, 1.1), tree(K, -78, 34, 1), tree(K, 70, 46, .9), tree(K, 8, -92, 1.3)];
      bench(K, 4, -52, 0); bench(K, 52, 6, -Math.PI / 2); bench(K, -56, -6, Math.PI / 2);
      // a outra mesa de concreto, de dama, com dois velhos jogando
      const conc = K.std('#a8a49a', { emissiveIntensity: .15, roughness: .95 }), dama = canvasTex(256, 256, (x, W) => { for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { x.fillStyle = (i + j) % 2 ? '#2a2a2a' : '#e8e4da'; x.fillRect(i * 32, j * 32, 32, 32); } });
      K.add(new T.BoxGeometry(12, 1, 12), [conc, conc, K.lit(dama, .2), conc, conc, conc], -46, FY + 14, 30); K.add(new T.CylinderGeometry(1.6, 2, 14, 10), conc, -46, FY + 7, 30);
      for (const dx of [-9, 9]) K.add(new T.CylinderGeometry(2.4, 2.6, 9.5, 12), conc, -46 + dx, FY + 4.75, 30);
      K.npc(-55, 30, Math.PI / 2, 9.5, 2, false); K.npc(-37, 30, -Math.PI / 2, 9.5, 3, false);
      K.npc(-24, -27, .7, 0, 6, false); K.npc(25, -25, -.8, 0, 1, true); // os que ficam em pé olhando a sua mesa
      envTick = (dt, now) => crowns.forEach((c, i) => { c.rotation.z = Math.sin(now / 2100 + i) * .015; c.rotation.x = Math.sin(now / 2700 + i * 2) * .012; });
      finishEnv(K, floor, { bg: dia ? 0xcfe3f0 : 0x151b2e, fog: dia ? [70, 230] : [55, 200], dim: dia ? DAYDIM : null, floorK: dia ? 0 : .05, floorC: dia ? 0 : .45, skip: crowns });
    },
    quintal(K, dia) { // laje: lajota, muro de bloco, a parede da casa com a porta, churrasqueira, rede, varal, caixa d'água e a lâmpada pendurada
      const at = { x: -5, y: 27, z: 5 };
      skyDome(K, dia ? '#4f94d4' : '#04060d', dia ? '#c4dcee' : '#121624', { stars: !dia });
      if (dia) daylight(); else night(0xffe2b0, at, 2.2);
      const lt = canvasTex(256, 256, (x, W) => { for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { x.fillStyle = `hsl(${rand(8, 16)},${rand(45, 55)}%,${rand(30, 36)}%)`; x.fillRect(i * 64 + 2, j * 64 + 2, 60, 60); } x.fillStyle = 'rgba(0,0,0,.25)'; for (let i = 0; i < 800; i++) x.fillRect(rand(0, W), rand(0, W), 2, 2); });
      const floor = ground(K, lt, 26);
      const blk = canvasTex(512, 256, (x, W, Hh) => { x.fillStyle = '#5a5850'; x.fillRect(0, 0, W, Hh); for (let r = 0, y = 0; y < Hh; r++, y += 32) for (let X = r % 2 ? -32 : 0; X < W; X += 64) { x.fillStyle = `hsl(40,${rand(3, 8)}%,${rand(52, 62)}%)`; x.fillRect(X + 2, y + 2, 60, 28); } x.fillStyle = 'rgba(200,190,170,.5)'; for (let i = 0; i < 3; i++) { x.beginPath(); x.ellipse(rand(0, W), rand(0, Hh), rand(30, 70), rand(20, 40), 0, 0, 7); x.fill(); } });
      blk.wrapS = T.RepeatWrapping; const wall = (w, x, z, ry) => { const t = blk.clone(); t.needsUpdate = true; t.repeat.set(w / 40, 1); const m = K.add(new T.BoxGeometry(w, 20, 1.6), K.lit(t, .15, { roughness: .95 }), x, FY + 10, z); m.rotation.y = ry; };
      wall(140, 0, -60, 0); wall(120, -70, 0, Math.PI / 2);
      // parede da casa (reboco pintado) com a porta de entrada, uma janela e o degrau
      const reb = canvasTex(512, 256, (x, W, Hh) => { x.fillStyle = '#e6d6b0'; x.fillRect(0, 0, W, Hh); grain(x, W, Hh, 5000, ['#c8b48a', '#f4ead0'], .3); x.fillStyle = 'rgba(120,100,70,.25)'; x.fillRect(0, Hh - 22, W, 22); });
      K.add(new T.BoxGeometry(2, 32, 120), K.lit(reb, .18, { roughness: .95 }), 71, FY + 16, 0);
      K.add(new T.BoxGeometry(.6, 18, 9), K.std('#7a4a26', { emissiveIntensity: .22, roughness: .7 }), 69.8, FY + 9, -12); // porta
      K.add(new T.SphereGeometry(.4, 8, 6), K.std('#c8a040', { metalness: .8, emissiveIntensity: .3 }), 69.3, FY + 9, -8.6); // maçaneta
      K.add(new T.BoxGeometry(.7, 19, 10.4), K.std('#f4f0e4', { emissiveIntensity: .2 }), 70.1, FY + 9.5, -12); // batente
      K.add(new T.BoxGeometry(5, 1, 13), K.std('#8a8680', { emissiveIntensity: .15 }), 68, FY + .5, -12); // degrau
      K.add(new T.BoxGeometry(.6, 9, 12), K.std(dia ? '#5a7a9a' : '#ffd890', { emissiveIntensity: dia ? .15 : .9 }), 69.8, FY + 14, 18); // janela (acesa de noite)
      if (!dia) K.glow(66, FY + 14, 18, 14, .35, 0xffd090);
      // churrasqueira de tijolo com brasa e fumaça
      const brick = K.std('#8a3a22', { emissiveIntensity: .2, roughness: .9 }); K.add(new T.BoxGeometry(16, 13, 8), brick, 42, FY + 6.5, -54); K.add(new T.BoxGeometry(6, 30, 6), brick, 42, FY + 28, -56);
      K.add(new T.BoxGeometry(13, .4, 5), new T.MeshBasicMaterial({ color: 0xff5a1a }), 42, FY + 13.2, -53); K.glow(42, FY + 15, -52, 16, .55, 0xff6a2a);
      const grelha = K.std('#222', { emissiveIntensity: .05, metalness: .8 }); for (let i = 0; i < 9; i++) K.add(new T.BoxGeometry(.15, .15, 5), grelha, 36.5 + i * 1.4, FY + 14, -53);
      const smT = canvasTex(128, 128, (x, W) => { const g = x.createRadialGradient(W / 2, W / 2, 0, W / 2, W / 2, W / 2); g.addColorStop(0, 'rgba(220,215,205,.6)'); g.addColorStop(1, 'rgba(220,215,205,0)'); x.fillStyle = g; x.fillRect(0, 0, W, W); });
      const puffs = Array.from({ length: 8 }, (_, i) => { const s = new T.Sprite(new T.SpriteMaterial({ map: smT, transparent: true, opacity: 0, depthWrite: false })); s.userData.ph = i / 8; K.g.add(s); return s; });
      // rede entre dois esteios, varal com roupa, caixa d'água
      const post = K.std('#5a3a1e', { emissiveIntensity: .2 }); for (const z of [-30, 10]) K.add(new T.CylinderGeometry(.8, .9, 26, 8), post, -60, FY + 13, z);
      const redeT = canvasTex(256, 64, (x, W, Hh) => { for (let i = 0; i < 12; i++) { x.fillStyle = ['#d8402a', '#f0b020', '#2a8a5a', '#2a5ab0'][i % 4]; x.fillRect(0, i * Hh / 12, W, Hh / 12); } });
      const rg = new T.PlaneGeometry(36, 7, 16, 2), rp = rg.attributes.position; for (let k = 0; k < rp.count; k++) { const u = rp.getX(k) / 18; rp.setZ(k, -(1 - u * u) * 7); } rg.computeVertexNormals();
      const rede = new T.Group(); rede.position.set(-60, FY + 18, -10); rede.rotation.y = Math.PI / 2; K.g.add(rede); const rm = new T.Mesh(rg, K.lit(redeT, .3, { side: T.DoubleSide })); rm.rotation.x = -Math.PI / 2; rm.castShadow = true; rede.add(rm);
      const varal = [], clothes = ['#e8e4da', '#c83a3a', '#3a6ab0', '#f0c030', '#3a9a5a', '#e88aa8'];
      const va = K.V(-40, FY + 22, -58), vb = K.V(20, FY + 22, -58); K.g.add(new T.Line(new T.BufferGeometry().setFromPoints([va, vb]), new T.LineBasicMaterial({ color: 0xcccccc })));
      clothes.forEach((c, i) => { const p = new T.Group(); p.position.copy(va.clone().lerp(vb, (i + .7) / 7)); K.g.add(p); const w = i % 3 ? 5 : 7, h = i % 3 ? 6 : 9; const m = K.add(new T.PlaneGeometry(w, h), K.std(c, { emissiveIntensity: .2, side: T.DoubleSide }), 0, -h / 2, 0, p); m.castShadow = true; varal.push(p); });
      K.add(new T.CylinderGeometry(6, 5.4, 9, 20), K.std('#3a6ab8', { emissiveIntensity: .25, roughness: .5 }), -55, FY + 24.5, -52); K.add(new T.CylinderGeometry(6.4, 6.4, 1, 20), K.std('#2a5aa0'), -55, FY + 29.5, -52);
      for (const [a, b] of [[-60, -57], [-50, -57], [-60, -47], [-50, -47]]) K.add(new T.BoxGeometry(1, 20, 1), post, a, FY + 10, b);
      // isopor e as cadeiras de plástico de quem não está jogando
      K.add(new T.BoxGeometry(7, 5, 5), K.std('#f4f2ec', { emissiveIntensity: .25 }), 28, FY + 2.5, -20);
      const pc = K.std('#e8e4da', { emissiveIntensity: .25 }); K.plasticChair(-38, -18, .6, pc); K.plasticChair(36, -40, -2.6, pc);
      K.add(new T.CylinderGeometry(.04, .04, 22, 4), new T.MeshBasicMaterial({ color: 0x111111 }), at.x, at.y + 12, at.z); // fio da lâmpada
      K.add(new T.SphereGeometry(.9, 12, 10), new T.MeshBasicMaterial({ color: 0xfff1d0 }), at.x, at.y, at.z); K.glow(at.x, at.y, at.z, 16, .6, 0xffe0a0);
      K.npc(-38, -18, .6, 10, 1, true); K.npc(42, -45, Math.PI, 0, 3, false); // um sentado bebendo, outro no churrasco
      makeDog(K, 30, 28, [[30, 28], [-30, 30], [-36, 0], [36, -6], [20, -36], [-20, -38], [44, 20]]);
      envTick = (dt, now) => {
        rede.rotation.z = Math.sin(now / 1500) * .05; varal.forEach((p, i) => { p.rotation.x = Math.sin(now / 900 + i) * .08; });
        puffs.forEach(s => { const u = s.userData; u.ph = (u.ph + dt * .12) % 1; s.position.set(42 + Math.sin(u.ph * 5) * 2, FY + 15 + u.ph * 26, -53 + u.ph * 4); s.scale.setScalar(4 + u.ph * 12); s.material.opacity = .3 * Math.sin(Math.PI * u.ph); });
      };
      finishEnv(K, floor, { bg: dia ? 0xc4dcee : 0x121624, fog: dia ? [150, 330] : [90, 260], dim: dia ? DAYDIM : null, floorK: dia ? 0 : .05, floorC: dia ? 0 : .5, skip: [rede, ...varal, ...puffs] });
    },
    calcada(K, dia) { // calçada da vendinha: porta de enrolar meio baixada, orelhão, poste de rua e uma moto que passa
      const at = { x: 14, y: 34, z: 2 };
      skyDome(K, dia ? '#5a9ad6' : '#0a0a10', dia ? '#c8dcec' : '#2a1c16', { stars: false });
      if (dia) daylight(); else night(0xffb060, at, 2.4, 0x9a7a5a);
      const pav = canvasTex(256, 256, (x, W) => { x.fillStyle = '#8a8680'; x.fillRect(0, 0, W, W); grain(x, W, W, 4000, ['#5a5852', '#b0aca4'], .35); x.strokeStyle = 'rgba(40,38,34,.6)'; x.lineWidth = 3; x.strokeRect(1, 1, W - 2, W - 2); x.fillStyle = 'rgba(30,25,20,.25)'; for (let i = 0; i < 3; i++) { x.beginPath(); x.arc(rand(0, W), rand(0, W), rand(6, 20), 0, 7); x.fill(); } });
      const floor = ground(K, pav, 30);
      const asf = canvasTex(256, 256, (x, W) => { x.fillStyle = '#26262a'; x.fillRect(0, 0, W, W); grain(x, W, W, 6000, ['#111', '#4a4a50'], .5); x.fillStyle = '#d8b020'; x.fillRect(W / 2 - 3, 0, 6, W * .6); }); asf.wrapS = asf.wrapT = T.RepeatWrapping; asf.repeat.set(1, 18);
      const rua = K.add(new T.PlaneGeometry(50, 900), K.lit(asf, .08, { roughness: .9 }), 70, FY + .05, 0); rua.rotation.x = -Math.PI / 2; rua.receiveShadow = true;
      K.add(new T.BoxGeometry(1.4, 1.2, 900), K.std('#b0aca0', { emissiveIntensity: .2 }), 45, FY + .6, 0); // meio-fio
      // fachada da vendinha
      const fach = canvasTex(1024, 384, (x, W, Hh) => {
        x.fillStyle = '#7aa88a'; x.fillRect(0, 0, W, Hh); grain(x, W, Hh, 8000, ['#5a8a6a', '#a8c8b0'], .3);
        x.fillStyle = 'rgba(230,220,200,.6)'; for (let i = 0; i < 6; i++) { x.beginPath(); x.ellipse(rand(0, W), rand(Hh * .5, Hh), rand(20, 60), rand(10, 30), 0, 0, 7); x.fill(); } // reboco descascando
        x.fillStyle = '#f4ead0'; x.fillRect(W * .2, 18, W * .6, 72); x.strokeStyle = '#a8321a'; x.lineWidth = 6; x.strokeRect(W * .2, 18, W * .6, 72);
        x.fillStyle = '#a8321a'; x.font = '900 54px Georgia, serif'; x.textAlign = 'center'; x.fillText('MERCEARIA DO BAIRRO', W / 2, 74);
        x.fillStyle = '#3a2a1a'; x.font = 'italic 700 22px Georgia, serif'; x.fillText('secos e molhados · bebidas geladas', W / 2, 116);
        x.fillStyle = 'rgba(0,0,0,.35)'; x.fillRect(0, Hh - 30, W, 30); // barra suja embaixo
      });
      K.add(new T.PlaneGeometry(130, 48), K.lit(fach, .3, { roughness: .95 }), -10, FY + 24, -40);
      K.add(new T.BoxGeometry(132, 2, 6), K.std('#5a6a5a', { emissiveIntensity: .2 }), -10, FY + 49, -38); // marquise
      for (let i = 0; i < 5; i++) { // casas vizinhas à esquerda, para a calçada não acabar do lado da vendinha (à direita é a rua)
        const x = -95 - i * 40, hh = 30 + (i * 13) % 22;
        K.add(new T.BoxGeometry(40, hh, 30), K.std(['#c8a878', '#9ab0c0', '#d8c8a8', '#b88a7a', '#a8b890'][i % 5], { emissiveIntensity: .18, roughness: .95 }), x, FY + hh / 2, -56);
        K.add(new T.BoxGeometry(8, 14, .4), K.std('#4a3a2a', { emissiveIntensity: .15 }), x - 8, FY + 7, -40.8); // porta
        K.add(new T.BoxGeometry(9, 7, .4), K.std(dia ? '#6a7a8a' : '#e8c890', { emissiveIntensity: dia ? .1 : .9 }), x + 8, FY + 15, -40.8); // janela (acesa de noite)
      }
      const inside = canvasTex(256, 128, (x, W, Hh) => { x.fillStyle = '#2a1a0a'; x.fillRect(0, 0, W, Hh); for (let r = 0; r < 4; r++) for (let i = 0; i < 18; i++) { x.fillStyle = ['#e83a2a', '#f0c020', '#2a8ae0', '#e8e4da', '#3ab04a'][(r * 7 + i) % 5]; x.fillRect(6 + i * 14, 10 + r * 30, 10, 20); } const g = x.createRadialGradient(W / 2, Hh / 2, 10, W / 2, Hh / 2, W * .6); g.addColorStop(0, 'rgba(255,220,150,.35)'); g.addColorStop(1, 'rgba(0,0,0,.4)'); x.fillStyle = g; x.fillRect(0, 0, W, Hh); });
      K.add(new T.PlaneGeometry(24, 12), K.lit(inside, .9), 0, FY + 6, -39.7); K.glow(0, FY + 6, -36, 30, .35, 0xffd090);
      const ond = canvasTex(64, 256, (x, W, Hh) => { x.fillStyle = '#8a8c90'; x.fillRect(0, 0, W, Hh); for (let y = 0; y < Hh; y += 8) { x.fillStyle = 'rgba(0,0,0,.35)'; x.fillRect(0, y, W, 3); x.fillStyle = 'rgba(255,255,255,.2)'; x.fillRect(0, y + 4, W, 1); } }); ond.wrapS = T.RepeatWrapping; ond.repeat.set(4, 1);
      K.add(new T.BoxGeometry(26, 26, .6), K.lit(ond, .2, { metalness: .4, roughness: .5 }), 0, FY + 25, -39.4); // porta de enrolar meio baixada
      const o2 = ond.clone(); o2.needsUpdate = true; K.add(new T.BoxGeometry(26, 38, .6), K.lit(o2, .15, { metalness: .4, roughness: .5 }), -40, FY + 19, -39.4); // a outra, fechada
      const fiado = canvasTex(256, 96, (x, W, Hh) => { x.fillStyle = '#f4f0e4'; x.fillRect(0, 0, W, Hh); x.fillStyle = '#1a1a1a'; x.font = '700 30px "Comic Sans MS", cursive'; x.textAlign = 'center'; x.fillText('FIADO SÓ', W / 2, 40); x.fillText('AMANHÃ', W / 2, 78); });
      K.add(new T.PlaneGeometry(6, 2.3), K.lit(fiado, .4), 18, FY + 20, -39.5);
      // engradados na porta, orelhão e o poste de rua
      const cr = K.std('#b81d1d', { emissiveIntensity: .3 }); for (const [x, y, z] of [[-18, 2, -34], [-18, 6.1, -34], [-25.5, 2, -34]]) K.add(new T.BoxGeometry(7, 4, 5), cr, x, FY + y, z);
      const oreG = new T.SphereGeometry(4, 16, 12, 0, Math.PI * 2, 0, Math.PI * .55); oreG.scale(1, 1.25, 1);
      K.add(new T.CylinderGeometry(.45, .45, 20, 8), K.std('#4a4a4a'), 38, FY + 10, -16); const ore = K.add(oreG, K.std('#e8701a', { emissiveIntensity: .35, side: T.DoubleSide }), 38, FY + 16, -14.5); ore.rotation.x = Math.PI / 2 - .2;
      K.add(new T.BoxGeometry(2.4, 3.4, 1.4), K.std('#3a3a40', { emissiveIntensity: .2 }), 38, FY + 14, -15.6);
      const conc = K.std('#9a968c', { emissiveIntensity: .15 }); K.add(new T.BoxGeometry(2, 54, 2), conc, 42, FY + 27, 2); K.beam(conc, K.V(42, at.y + 3, 2), K.V(at.x, at.y + 3, at.z), .4, .4, 6).castShadow = false; lantern(K, at, 0xffb060);
      const pc = K.std('#e83a2a', { emissiveIntensity: .25 }); K.plasticChair(-30, -32, .3, pc);
      K.npc(-30, -32, .3, 10, 4, true); K.npc(16, -35, -.5, 0, 2, false); // o freguês de sempre e o dono na porta
      makeDog(K, -40, 14, [[-40, 14], [-36, -24], [-56, -20], [-50, 30], [30, 30], [24, -26]]);
      // a moto que passa de vez em quando na rua
      const moto = new T.Group(); moto.visible = false; K.g.add(moto); const pneu = K.std('#111', { emissiveIntensity: .05 });
      for (const z of [-3.2, 3.2]) { const w = K.add(new T.TorusGeometry(1.7, .55, 8, 16), pneu, 0, 2.2, z, moto); w.rotation.y = Math.PI / 2; }
      K.add(new T.BoxGeometry(1.6, 2.2, 6), K.std('#b01a1a', { emissiveIntensity: .3 }), 0, 4.2, 0, moto); K.add(new T.BoxGeometry(1.4, 1, 3), K.std('#111'), 0, 5.6, -1, moto);
      K.add(new T.BoxGeometry(2.4, 5, 2), K.std('#2a3a6a', { emissiveIntensity: .25 }), 0, 8.4, -1.2, moto); K.add(new T.SphereGeometry(1.4, 10, 8), K.std('#e8e4da', { emissiveIntensity: .3 }), 0, 12, -1, moto); // piloto de capacete
      const farol = new T.Sprite(new T.SpriteMaterial({ map: K.glowT, color: 0xfff0c0, transparent: true, blending: T.AdditiveBlending, depthWrite: false })); farol.position.set(0, 5, 3.6); farol.scale.setScalar(8); moto.add(farol);
      let mt = 6000 + rand(0, 8000), mdir = 1;
      envTick = (dt, now) => {
        mt -= dt * 1000; if (mt > 0 || mt < -5200) { if (mt < -5200) { mt = 18000 + rand(0, 20000); mdir = -mdir; moto.visible = false; } return; }
        if (!moto.visible) { moto.visible = true; Domino2SFX.moto?.(mdir); }
        const k = -mt / 5200; moto.position.set(58 + (mdir > 0 ? 6 : -6), FY, mdir * (-200 + k * 400)); moto.rotation.y = mdir > 0 ? 0 : Math.PI;
      };
      finishEnv(K, floor, { bg: dia ? 0xc8dcec : 0x2a1c16, fog: dia ? [70, 230] : [50, 190], dim: dia ? DAYDIM : null, floorK: dia ? 0 : .05, floorC: dia ? 0 : .5, skip: [moto] });
    },
  };
  // ---------- cenários: cada um monta o seu entorno, a luz e o céu; só o escolhido é montado ----------
  const ARENAS = {
    padrao(K) { // só a mesa de feltro num fundo escuro liso, sem nada em volta (também é o modo leve)
      const f = K.add(new T.CircleGeometry(46, 48), new T.MeshBasicMaterial({ map: K.glowT, color: 0x26324a, transparent: true, opacity: .55, depthWrite: false }), 0, -1.4, 0); f.rotation.x = -Math.PI / 2;
      scene.background = new T.Color(0x0c0e13); scene.fog = new T.Fog(0x0c0e13, 120, 300);
      hemi.intensity = .35;
    },
    bar: buildBar,
    ...OUTDOOR,
  };
  const DAY = new Set(['praca', 'quintal', 'calcada']); // cenários com opção de dia
  const pref = k => { try { return localStorage.getItem(k); } catch { return null; } };
  function sceneOf(c = {}) {
    const leve = pref('d2-leve') === '1', arena = leve ? 'padrao' : ARENAS[c.arena] ? c.arena : 'bar';
    return { arena, mesa: Domino2UI.mesaOf(arena, c.mesa), dia: !!c.dia && DAY.has(arena) };
  }
  function dispose(root) { root.traverse(o => { o.geometry?.dispose(); for (const m of [].concat(o.material || [])) { m.map?.dispose(); m.dispose(); } }); }
  function setScene(c) {
    const S = sceneOf(c), key = S.arena + '|' + S.mesa + '|' + S.dia; if (key === sceneKey) return; sceneKey = key;
    for (const g of [envG, tableG]) if (g) { scene.remove(g); dispose(g); }
    npcs.length = fans.length = smoke.length = 0; dog = neon = clockHands = tvT = envTick = null;
    if (trays) { scene.remove(trays); trays = null; } chipGame = null; // as fichas são refeitas no lugar da mesa nova
    // luz padrão (o cenário muda o que precisar)
    Object.assign(lampP, { x: -7, y: 29, z: 10 }); lamp.position.set(lampP.x, lampP.y, lampP.z); lamp.color.setHex(0xffe6c0); lamp.angle = .55; lamp.distance = 90; lampI = LAMP_I;
    hemi.color.setHex(0xfff3e0); hemi.groundColor.setHex(0x3a2614); hemi.intensity = .2; renderer.toneMappingExposure = .95;
    tableG = new T.Group(); envG = new T.Group();
    tbl = TABLES[S.mesa](kit(tableG)); ARENAS[S.arena](kit(envG), S.dia, S);
    lamp.position.set(lampP.x, lampP.y, lampP.z);
    scene.add(tableG, envG); Domino2SFX.setMat?.(tbl.mat); Domino2SFX.setArena?.(S.arena, S.dia);
    if (renderer) renderer.shadowMap.needsUpdate = true;
  }
  let testCfg = null; // menu de teste: troca cenário/mesa só na sua tela
  const setLeve = on => { try { localStorage.setItem('d2-leve', on ? '1' : '0'); } catch {} if (st && mounted) sync(st, opt); };
  function setSkin(k) {
    const s = SKINS[k] || SKINS.marfim; if (s === skin) return; skin = s; if (!mats) return; // antes de montar: o buildGeo já usa o skin
    for (const id in faceMat) { const m = faceMat[id]; m.map.dispose(); m.bumpMap.dispose(); m.dispose(); delete faceMat[id]; }
    mats.back.map.dispose(); mats.back.map = backTex(); mats.side.color.copy(C(s.side));
    for (const m of [mats.back, mats.side]) { m.transparent = !!s.glass; m.opacity = s.glass ? .86 : 1; m.needsUpdate = true; }
    for (const o of objs.values()) o.g.userData.body.material = [o.tile ? faceOf(o.tile) : mats.back, mats.side, mats.back];
  }
  const setTest = c => { testCfg = c ? { ...testCfg, ...c } : null; if (st && mounted) sync(st, opt); };
  // ---------- o boteco em volta: sala pequena e cheia de detalhe, tudo pintado em canvas e formas simples ----------
  // (sem luz nem sombra a mais: o "brilho" vem pintado nas texturas, então continua leve)
  function buildBar(K) {
    const H = 52, CY = FY + H, X = 80, ZB = -64, ZF = 72, { g, V, add, lit, std, glow, glowT, noise, pool, chair } = K, npc = K.npc, bw = woodM.clone(); bw.color.setScalar(1); // bw: madeira do bar (o bar apaga a dele)
    const gold = new T.MeshStandardMaterial({ color: C(0xb08a3e), metalness: .8, roughness: .35, emissive: C(0x3a2a10), emissiveIntensity: .7 });
    const dark = std(0x141010, { emissiveIntensity: .2, roughness: .4 }), bulbM = new T.MeshBasicMaterial({ color: 0xffe2a8 });

    // chão de boteco: vermelhão (cimento queimado vermelho) encerado, liso, com juntas discretas e manchas de uso
    const tileT = canvasTex(256, 256, (x, W) => {
      x.fillStyle = '#4a1a12'; x.fillRect(0, 0, W, W);
      for (let i = 0; i < 26; i++) { const r = rand(20, 70), cx = rand(0, W), cy = rand(0, W), gr = x.createRadialGradient(cx, cy, 0, cx, cy, r); gr.addColorStop(0, `rgba(${Math.random() < .5 ? '20,6,4' : '110,40,28'},.18)`); gr.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = gr; x.fillRect(0, 0, W, W); }
      x.strokeStyle = 'rgba(15,5,3,.55)'; x.lineWidth = 2; x.strokeRect(1, 1, W - 2, W - 2); // junta de dilatação
    });
    tileT.wrapS = tileT.wrapT = T.RepeatWrapping; tileT.repeat.set(5, 4);
    const floor = add(new T.PlaneGeometry(X * 2, ZF - ZB), lit(tileT, .12, { roughness: .78 }), 0, FY, (ZF + ZB) / 2); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
    const ao = add(geo.shadow, mats.shadow.clone(), 0, FY + .05, 0); ao.scale.set(19, 1, 26); ao.material.opacity = .85;

    // paredes: tijolinho aparente atrás do balcão; nas outras, azulejo embaixo e reboco velho em cima, com as manchas de luz das arandelas
    const brickT = canvasTex(1024, 512, (x, W, Hh) => {
      x.fillStyle = '#2a1a12'; x.fillRect(0, 0, W, Hh);
      for (let r = 0, y = 0; y < Hh; r++, y += 22) for (let X = r % 2 ? -26 : 0; X < W; X += 52) { x.fillStyle = `hsl(${rand(8, 20)}, ${rand(35, 50)}%, ${rand(16, 26)}%)`; x.fillRect(X + 2, y + 2, 48, 18); }
      noise(x, W, Hh, 6000, .15);
      const s = x.createLinearGradient(0, 0, 0, Hh); s.addColorStop(0, 'rgba(0,0,0,.65)'); s.addColorStop(.5, 'rgba(0,0,0,.15)'); s.addColorStop(1, 'rgba(0,0,0,.5)'); x.fillStyle = s; x.fillRect(0, 0, W, Hh);
      for (const u of [.18, .82]) pool(x, u * W, Hh * .3, 230, .5);
    });
    const sideT = canvasTex(1024, 512, (x, W, Hh) => {
      const tp = Hh * .6, gr = x.createLinearGradient(0, 0, 0, tp); gr.addColorStop(0, '#1b1a12'); gr.addColorStop(1, '#4a4630'); x.fillStyle = gr; x.fillRect(0, 0, W, tp);
      for (let i = 0; i < 900; i++) { x.fillStyle = `rgba(${Math.random() < .6 ? '0,0,0' : '255,230,190'},${rand(.02, .06)})`; x.beginPath(); x.arc(rand(0, W), rand(0, tp), rand(4, 28), 0, 7); x.fill(); }
      for (const u of [.25, .75]) pool(x, u * W, tp * .35, 200, .6);
      for (let i = 0; i < W / 40; i++) for (let j = 0; j * 40 < Hh - tp; j++) { // azulejo branco e azul
        const X = i * 40, Y = tp + j * 40; x.fillStyle = (i + j) % 2 ? '#b9c3c4' : '#a9b6bb'; x.fillRect(X + 1, Y + 1, 38, 38);
        x.strokeStyle = '#2d5d8a'; x.lineWidth = 3; x.beginPath(); x.arc(X + 20, Y + 20, 9, 0, 7); x.stroke(); x.beginPath(); x.moveTo(X + 20, Y + 4); x.lineTo(X + 36, Y + 20); x.lineTo(X + 20, Y + 36); x.lineTo(X + 4, Y + 20); x.closePath(); x.stroke();
      }
      const d = x.createLinearGradient(0, tp, 0, Hh); d.addColorStop(0, 'rgba(10,6,3,.55)'); d.addColorStop(1, 'rgba(10,6,3,.8)'); x.fillStyle = d; x.fillRect(0, tp, W, Hh - tp); // azulejo na penumbra
      x.fillStyle = '#3b2312'; x.fillRect(0, tp - 6, W, 14); x.fillStyle = 'rgba(255,200,130,.25)'; x.fillRect(0, tp - 6, W, 2);
    });
    const wall = (map, w, x, z, ry) => { const m = add(new T.PlaneGeometry(w, H), lit(map, .2, { roughness: .95 }), x, FY + H / 2, z); m.rotation.y = ry; return m; };
    wall(brickT, X * 2, 0, ZB, 0);
    const s2 = sideT.clone(); s2.needsUpdate = true;
    wall(sideT, ZF - ZB, -X, (ZF + ZB) / 2, Math.PI / 2); wall(s2, ZF - ZB, X, (ZF + ZB) / 2, -Math.PI / 2); wall(sideT, X * 2, 0, ZF, Math.PI);
    add(new T.PlaneGeometry(X * 2, ZF - ZB), new T.MeshBasicMaterial({ color: 0x070403 }), 0, CY, (ZF + ZB) / 2).rotation.x = Math.PI / 2;
    // arandelas: cúpula de latão, lâmpada e o brilho (em cima de cada mancha de luz pintada)
    const scG = new T.ConeGeometry(1.3, 2, 14, 1, true), bG = new T.SphereGeometry(.55, 10, 8);
    for (const [x, z] of [[-.64 * X, ZB + 1], [.64 * X, ZB + 1], [-X + 1, ZB + .25 * (ZF - ZB)], [-X + 1, ZB + .75 * (ZF - ZB)], [X - 1, ZF - .25 * (ZF - ZB)], [X - 1, ZF - .75 * (ZF - ZB)]]) {
      const y = FY + H * .78; add(scG, gold, x, y, z).rotation.x = Math.PI; add(bG, bulbM, x, y - .5, z); glow(x, y - .4, z, 11, .5);
    }

    // balcão com tampo de mármore, prateleiras de garrafas contra um fundo iluminado, neon em cima
    const back = canvasTex(512, 256, (x, W, Hh) => { x.fillStyle = '#120904'; x.fillRect(0, 0, W, Hh); pool(x, W / 2, Hh * .45, W * .55, .8); });
    add(new T.PlaneGeometry(54, 22), lit(back, .6), 0, FY + 33, ZB + .3);
    const board = new T.BoxGeometry(54, .5, 3.4), btlP = [[0, 0], [.55, 0], [.6, .1], [.6, 2.2], [.5, 2.6], [.22, 3.1], [.2, 3.9], [.25, 4], [0, 4]].map(([a, b]) => new T.Vector2(a, b));
    const btlG = new T.LatheGeometry(btlP, 10), btlM = new T.MeshStandardMaterial({ roughness: .15, transparent: true, opacity: .88, emissive: C(0x2a1a08), emissiveIntensity: .8 });
    const shelfY = [24, 31, 38], nB = 17, bottles = new T.InstancedMesh(btlG, btlM, shelfY.length * nB), mm = new T.Matrix4(), cols = [0x2d5a1e, 0x6a3a10, 0x8a1d18, 0x1d3a5a, 0xc9a24a, 0x3a2414, 0xd8d0c0].map(c => new T.Color(c).convertSRGBToLinear());
    shelfY.forEach((y, r) => { add(board, bw, 0, FY + y - .25, ZB + 1.8); for (let i = 0; i < nB; i++) { const s = rand(.8, 1.15); bottles.setMatrixAt(r * nB + i, mm.makeScale(s, s * rand(.85, 1.1), s).setPosition(-25 + i * 3.05 + rand(-.4, .4), FY + y, ZB + 1.8 + rand(-.5, .5))); bottles.setColorAt(r * nB + i, cols[Math.floor(rand(0, cols.length))]); } });
    g.add(bottles);
    const neonT = canvasTex(1024, 256, (x, W, Hh) => { x.font = 'italic 700 120px Georgia, serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.shadowColor = '#ff5a3c'; x.shadowBlur = 40; x.fillStyle = '#ffd2b8'; for (let i = 0; i < 3; i++) x.fillText('Dominó Bar', W / 2, Hh / 2); });
    neon = add(new T.PlaneGeometry(30, 7.5), new T.MeshBasicMaterial({ map: neonT, transparent: true, blending: T.AdditiveBlending, depthWrite: false }), 0, FY + 45, ZB + .4); glow(0, FY + 45, ZB + 2, 34, .25, 0xff6a4a);
    const ZC = ZB + 12; // espaço atrás do balcão para o garçom
    add(new T.BoxGeometry(58, 16.5, 7), bw, 0, FY + 8.25, ZC);
    const marble = canvasTex(512, 128, (x, W, Hh) => { x.fillStyle = '#cfc8bd'; x.fillRect(0, 0, W, Hh); for (let i = 0; i < 14; i++) { x.strokeStyle = `rgba(90,80,70,${rand(.15, .4)})`; x.lineWidth = rand(.5, 2); x.beginPath(); let px = rand(0, W), py = 0; x.moveTo(px, py); while (py < Hh) { px += rand(-14, 14); py += rand(4, 10); x.lineTo(px, py); } x.stroke(); } });
    add(new T.BoxGeometry(60, .9, 9), lit(marble, .25, { roughness: .25 }), 0, FY + 16.95, ZC);
    add(new T.BoxGeometry(58.5, .5, .5), gold, 0, FY + 2.2, ZC + 4.3);
    for (const x of [-8, -4.5]) { add(new T.CylinderGeometry(.45, .45, 5.5, 12), gold, x, FY + 20.2, ZC - 1.5); add(new T.CylinderGeometry(.3, .2, 2.6, 8), dark, x, FY + 24, ZC - 1.5); add(new T.CylinderGeometry(.22, .22, 1.6, 8), gold, x, FY + 21.8, ZC - .7).rotation.x = Math.PI / 2; }
    const glassM = new T.MeshStandardMaterial({ color: C(0xd08a2a), roughness: .1, transparent: true, opacity: .7, emissive: C(0x7a4a10), emissiveIntensity: .6 }), glassG = new T.CylinderGeometry(.75, .6, 2.6, 12), foamM = std(0xf2ead8, { emissiveIntensity: .5 }), foamG = new T.CylinderGeometry(.76, .76, .5, 12);
    const beer = (x, y, z) => { add(glassG, glassM, x, y + 1.3, z); add(foamG, foamM, x, y + 2.75, z); };
    for (const [x, z] of [[2, ZC + 1], [4, ZC - .5], [-20, ZC + 1.5], [24, ZC + .5]]) beer(x, FY + 17.4, z);
    const reg = add(new T.BoxGeometry(6, 3.4, 5), dark, 16, FY + 19.1, ZC - 1); add(new T.BoxGeometry(3.6, 1.6, .4), lit(canvasTex(64, 32, (x) => { x.fillStyle = '#062'; x.fillRect(0, 0, 64, 32); x.fillStyle = '#4f8'; x.font = '18px monospace'; x.fillText('0,00', 8, 23); }), .9), 16, FY + 21.6, ZC + .2).rotation.x = -.4; reg.castShadow = false;
    const jar = add(new T.CylinderGeometry(1.7, 1.7, 4.6, 16), new T.MeshStandardMaterial({ color: C(0xe8f0e0), roughness: .05, transparent: true, opacity: .3 }), -15, FY + 19.7, ZC - .5); // ovo colorido no vidro
    const eggM = std(0xd96a8a, { emissiveIntensity: .5 }), eggG = new T.SphereGeometry(.55, 10, 8).scale(1, 1.3, 1);
    for (let i = 0; i < 9; i++) add(eggG, eggM, -15 + rand(-1, 1), FY + 18 + Math.floor(i / 3) * 1.2 + rand(0, .3), ZC - .5 + rand(-1, 1));
    add(new T.CylinderGeometry(1.8, 1.8, .3, 16), gold, -15, FY + 22.1, ZC - .5); jar.renderOrder = 2;
    const stoolM = std(0x6a1a12, { emissiveIntensity: .45, roughness: .45 }), sring = new T.TorusGeometry(1.5, .14, 6, 16);
    for (const x of [-21, -7, 7, 21]) { add(new T.CylinderGeometry(2.1, 2, .9, 18), stoolM, x, FY + 15.5, ZC + 8); add(new T.CylinderGeometry(.35, .55, 15, 8), gold, x, FY + 7.5, ZC + 8); add(sring, gold, x, FY + 5.5, ZC + 8).rotation.x = Math.PI / 2; }

    // parede esquerda: freezer de cerveja iluminado, quadro de petiscos e o relógio (que anda de verdade)
    const fridgeT = canvasTex(256, 512, (x, W, Hh) => {
      x.fillStyle = '#dfe9ef'; x.fillRect(0, 0, W, Hh); x.fillStyle = '#c8d8e2'; x.fillRect(16, 16, W - 32, Hh - 32);
      for (let r = 0; r < 4; r++) { const y = 40 + r * 115; x.fillStyle = '#9fb3bf'; x.fillRect(16, y + 92, W - 32, 6); for (let X = 26; X < W - 40; X += 26) { x.fillStyle = ['#3f6a2a', '#7a4410', '#2a4a6a'][(X + r) % 3]; rrect(x, X, y + 22, 18, 70, 6); x.fill(); x.fillRect(X + 6, y + 6, 6, 18); x.fillStyle = '#eee'; x.fillRect(X + 2, y + 50, 14, 16); } }
      x.fillStyle = 'rgba(255,255,255,.25)'; x.fillRect(30, 0, 16, Hh); x.strokeStyle = '#8a9aa4'; x.lineWidth = 16; x.strokeRect(0, 0, W, Hh);
    });
    add(new T.BoxGeometry(8, 24, 12), std(0xe8e8e8, { emissiveIntensity: .25 }), -X + 4, FY + 12, ZB + 12);
    add(new T.PlaneGeometry(11, 23), lit(fridgeT, .75), -X + 8.05, FY + 12, ZB + 12).rotation.y = Math.PI / 2; glow(-X + 10, FY + 13, ZB + 12, 26, .25, 0x9ad4ff);
    const chalk = canvasTex(512, 384, (x, W, Hh) => {
      x.fillStyle = '#1b231e'; x.fillRect(0, 0, W, Hh); x.strokeStyle = '#6b4424'; x.lineWidth = 22; x.strokeRect(0, 0, W, Hh);
      x.fillStyle = 'rgba(240,240,230,.85)'; x.font = '700 46px "Comic Sans MS", cursive'; x.textAlign = 'center'; x.fillText('PETISCOS', W / 2, 74);
      x.font = '30px "Comic Sans MS", cursive';
      [['Torresmo', '18'], ['Bolinho de bacalhau', '24'], ['Pastel', '9'], ['Caldinho', '12']].forEach(([a, b], i) => { x.textAlign = 'left'; x.fillText(a, 44, 140 + i * 56); x.textAlign = 'right'; x.fillText(b, W - 44, 140 + i * 56); });
      x.fillStyle = 'rgba(255,255,255,.05)'; for (let i = 0; i < 40; i++) x.fillRect(rand(0, W), rand(0, Hh), rand(20, 120), rand(4, 14));
    });
    add(new T.PlaneGeometry(16, 12), lit(chalk, .4), -X + .3, FY + 30, 2).rotation.y = Math.PI / 2;
    const face = canvasTex(128, 128, (x, W) => { x.fillStyle = '#efe6cf'; x.beginPath(); x.arc(64, 64, 60, 0, 7); x.fill(); x.lineWidth = 8; x.strokeStyle = '#2a1608'; x.stroke(); x.fillStyle = '#2a1608'; for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; x.fillRect(64 + Math.cos(a) * 46 - 3, 64 + Math.sin(a) * 46 - 3, 6, 6); } });
    const clock = new T.Group(); clock.position.set(-X + .4, FY + 38, 15); clock.rotation.y = Math.PI / 2; g.add(clock);
    add(new T.CircleGeometry(2.6, 24), lit(face, .5), 0, 0, 0, clock);
    const hand = (l, w) => { const p = new T.Group(); add(new T.BoxGeometry(w, l, .08), dark, 0, l / 2, .1, p); clock.add(p); return p; };
    clockHands = [hand(1.4, .22), hand(2.1, .14)];
    // parede direita: janela da rua à noite, jukebox acesa, TV com o jogo e um vaso de planta
    const win = canvasTex(256, 256, (x, W) => {
      const s = x.createLinearGradient(0, 0, 0, W); s.addColorStop(0, '#0b1630'); s.addColorStop(1, '#22345a'); x.fillStyle = s; x.fillRect(0, 0, W, W);
      for (let i = 0; i < 9; i++) { const bw = rand(18, 40), bh = rand(60, 150), bx = rand(0, W - bw); x.fillStyle = '#0a0f1c'; x.fillRect(bx, W - bh, bw, bh); for (let k = 0; k < 6; k++) { x.fillStyle = Math.random() < .5 ? '#ffd27a' : '#1a2238'; x.fillRect(bx + rand(3, bw - 8), W - bh + rand(6, bh - 10), 5, 6); } }
      x.fillStyle = 'rgba(0,0,0,.55)'; for (let y = 6; y < W; y += 16) x.fillRect(0, y, W, 7); // persiana
      x.fillStyle = '#2a170b'; x.fillRect(W / 2 - 4, 0, 8, W); x.fillRect(0, W / 2 - 4, W, 8);
    });
    add(new T.BoxGeometry(.8, 18, 20), bw, X - .4, FY + 30, -8); add(new T.PlaneGeometry(17, 15), lit(win, .8), X - .85, FY + 30, -8).rotation.y = -Math.PI / 2; glow(X - 3, FY + 30, -8, 26, .18, 0x6a8aff);
    const juke = canvasTex(256, 384, (x, W, Hh) => {
      x.fillStyle = '#2a0f08'; x.fillRect(0, 0, W, Hh);
      ['#ff3b30', '#ff9f0a', '#ffd60a', '#34c759', '#0a84ff', '#bf5af2'].forEach((c, i) => { x.fillStyle = c; x.fillRect(18 + i * 37, 20, 22, Hh * .55); });
      const gl = x.createLinearGradient(0, 0, 0, Hh * .6); gl.addColorStop(0, 'rgba(255,255,255,.4)'); gl.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gl; x.fillRect(0, 0, W, Hh * .6);
      x.fillStyle = '#c9a24a'; x.fillRect(20, Hh * .64, W - 40, 10); x.fillStyle = '#111'; rrect(x, 40, Hh * .7, W - 80, Hh * .22, 14); x.fill();
      x.strokeStyle = '#c9a24a'; x.lineWidth = 3; for (let i = 0; i < 6; i++) { x.beginPath(); x.moveTo(52, Hh * .73 + i * 13); x.lineTo(W - 52, Hh * .73 + i * 13); x.stroke(); }
    });
    add(new T.BoxGeometry(6, 15, 9), std(0x5a1a0e), X - 3.5, FY + 7.5, 20);
    const arch = add(new T.CylinderGeometry(4.5, 4.5, 6, 20, 1, false, 0, Math.PI), std(0x5a1a0e), X - 3.5, FY + 15, 20); arch.rotation.z = Math.PI / 2;
    add(new T.PlaneGeometry(8.4, 14), lit(juke, 1), X - 6.55, FY + 8.2, 20).rotation.y = -Math.PI / 2; glow(X - 8, FY + 9, 20, 24, .3, 0xff6aa0);
    tvT = canvasTex(512, 256, (x, W, Hh) => {
      x.fillStyle = '#1f7a2e'; x.fillRect(0, 0, W, Hh); for (let i = 0; i < 8; i++) { x.fillStyle = i % 2 ? '#238a33' : '#1f7a2e'; x.fillRect(i * W / 8, 0, W / 8, Hh); }
      x.strokeStyle = 'rgba(255,255,255,.8)'; x.lineWidth = 3; x.strokeRect(10, 20, W - 20, Hh - 40); x.beginPath(); x.moveTo(W / 2, 20); x.lineTo(W / 2, Hh - 20); x.stroke(); x.beginPath(); x.arc(W / 2, Hh / 2, 32, 0, 7); x.stroke();
      for (let i = 0; i < 18; i++) { x.fillStyle = i % 2 ? '#e33' : '#fff'; x.beginPath(); x.arc(rand(30, W - 30), rand(35, Hh - 35), 5, 0, 7); x.fill(); }
      x.fillStyle = 'rgba(0,0,0,.6)'; x.fillRect(12, 6, 120, 18); x.fillStyle = '#fff'; x.font = '700 13px sans-serif'; x.fillText('BOT 1 x 1 FUT', 18, 20);
    });
    tvT.wrapS = T.RepeatWrapping; tvT.repeat.set(.6, 1);
    const tv = new T.Group(); tv.position.set(X - 3, FY + 39, 40); tv.rotation.y = -Math.PI / 2 - .35; g.add(tv);
    add(new T.BoxGeometry(14.5, 8.6, 1), dark, 0, 0, 0, tv); add(new T.PlaneGeometry(13.6, 7.7), lit(tvT, 1.1), 0, 0, .52, tv); glow(X - 6, FY + 39, 38, 20, .2, 0x7aff9a);
    add(new T.BoxGeometry(1, 1, 4), dark, X - .5, FY + 39, 40);
    const potM = std(0x8a4a2a), leafM = std(0x2a5a2a, { emissiveIntensity: .45 }), leafG = new T.SphereGeometry(1, 8, 6).scale(.9, 4.2, .35);
    add(new T.CylinderGeometry(2.6, 2, 5, 14), potM, X - 5, FY + 2.5, ZB + 5);
    for (let i = 0; i < 8; i++) { const l = add(leafG, leafM, X - 5, FY + 8, ZB + 5); l.rotation.set(rand(-.6, .6), i * .8, rand(-.6, .6)); }
    // engradados de cerveja empilhados no canto
    const crate = canvasTex(128, 128, (x, W) => { x.fillStyle = '#b81d1d'; x.fillRect(0, 0, W, W); x.fillStyle = '#8a1212'; for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { x.beginPath(); x.arc(16 + i * 32, 16 + j * 32, 11, 0, 7); x.fill(); } x.fillStyle = '#c9a24a'; for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { x.beginPath(); x.arc(16 + i * 32, 16 + j * 32, 6, 0, 7); x.fill(); } });
    const crM = lit(crate, .35), crG = new T.BoxGeometry(7, 4, 5);
    [[0, 0, 0], [7.2, 0, .3], [3.4, 4.05, .2], [.4, 0, 5.2]].forEach(([dx, dy, dz]) => { const c = add(crG, crM, X - 18 + dx, FY + 2 + dy, ZF - 6 - dz); c.rotation.y = rand(-.1, .1); });

    // mesas de plástico amarelas (de boteco) e cadeiras em volta da mesa de jogo
    const woodChair = std(0x4a2a14, { emissiveIntensity: .3 }), yel = std(0xe8b81a, { emissiveIntensity: .3, roughness: .5 }), legG = new T.CylinderGeometry(.18, .18, 1, 6);
    for (const [x, z] of [[-54, 36], [54, -34], [-56, -26]]) {
      add(new T.BoxGeometry(10, .5, 10), yel, x, FY + 14, z); for (const [a, b] of [[-4.5, -4.5], [4.5, -4.5], [-4.5, 4.5], [4.5, 4.5]]) add(legG, yel, x + a, FY + 7, z + b).scale.y = 14;
      chair(x - 8, z, Math.PI / 2, yel); chair(x + 8, z, -Math.PI / 2, yel); beer(x - 1.5, FY + 14.25, z + 1); beer(x + 2, FY + 14.25, z - 1.5);
    }

    // varal de lâmpadas em volta, rente às paredes (no meio do teto atrapalharia a vista da mesa), e dois ventiladores
    const sag = (a, b, s, n) => Array.from({ length: n }, (_, i) => { const t = i / (n - 1); return a.clone().lerp(b, t).setY(a.y - s * 4 * t * (1 - t)); });
    const cordM = new T.LineBasicMaterial({ color: 0x050302 }), bulbs = [], y0 = CY - 3, m = 4;
    for (const [a, b] of [[V(-X + m, y0, ZB + m), V(X - m, y0, ZB + m)], [V(-X + m, y0, ZB + m), V(-X + m, y0, ZF - m)], [V(X - m, y0, ZB + m), V(X - m, y0, ZF - m)], [V(-X + m, y0, ZF - m), V(X - m, y0, ZF - m)]]) {
      const pts = sag(a, b, 4, 24); g.add(new T.Line(new T.BufferGeometry().setFromPoints(pts), cordM)); for (let i = 1; i < 23; i += 2) bulbs.push(pts[i].clone().setY(pts[i].y - .6));
    }
    const bi = new T.InstancedMesh(new T.SphereGeometry(.45, 8, 6), bulbM, bulbs.length);
    bulbs.forEach((p, i) => { bi.setMatrixAt(i, mm.makeTranslation(p.x, p.y, p.z)); glow(p.x, p.y, p.z, 5, .45); }); g.add(bi);
    for (const x of [-52, 52]) {
      add(new T.CylinderGeometry(.2, .2, 3, 6), dark, x, CY - 1.5, 6); add(new T.CylinderGeometry(1.3, 1, 1.4, 14), gold, x, CY - 3.6, 6);
      const f = new T.Group(); f.position.set(x, CY - 4, 6); for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2, b = add(new T.BoxGeometry(8, .15, 1.8), woodChair, Math.cos(a) * 4.8, 0, -Math.sin(a) * 4.8, f); b.rotation.y = a; }
      g.add(f); fans.push(f);
    }
    // portas: a da rua (com a luz azulada da calçada no vidro) e a do banheiro
    const doorT = (label, glass) => canvasTex(256, 512, (x, W, Hh) => {
      x.fillStyle = '#3a2210'; x.fillRect(0, 0, W, Hh); for (let i = 0; i < 40; i++) { x.strokeStyle = `rgba(0,0,0,${rand(.1, .3)})`; x.beginPath(); const xx = rand(0, W); x.moveTo(xx, 0); x.lineTo(xx + rand(-6, 6), Hh); x.stroke(); }
      x.strokeStyle = '#1e1008'; x.lineWidth = 10; x.strokeRect(28, 300, W - 56, 170);
      if (glass) { const gr = x.createLinearGradient(0, 40, 0, 260); gr.addColorStop(0, glass); gr.addColorStop(1, '#0b1020'); x.fillStyle = gr; x.fillRect(36, 40, W - 72, 220); x.fillStyle = 'rgba(255,255,255,.12)'; x.fillRect(50, 50, 18, 200); x.lineWidth = 12; x.strokeRect(36, 40, W - 72, 220); }
      else { x.strokeRect(28, 40, W - 56, 220); x.fillStyle = '#e8dcc0'; x.font = '700 30px sans-serif'; x.textAlign = 'center'; x.fillText(label, W / 2, 160); }
    });
    const door = (x, z, ry, tex, sign, signCol, k = 1) => {
      const d = new T.Group(); d.position.set(x, FY, z); d.rotation.y = ry; d.scale.setScalar(k); g.add(d); // k: tamanho (gente em pé tem ~33 de altura)
      add(new T.BoxGeometry(13, 25, 1), bw, 0, 12.5, 0, d); add(new T.PlaneGeometry(11, 23), lit(tex, .3), 0, 11.5, .55, d); add(new T.SphereGeometry(.45, 8, 6), gold, 4.3, 11, .9, d);
      const st = canvasTex(256, 64, (c, W, Hh) => { c.fillStyle = signCol; c.fillRect(0, 0, W, Hh); c.fillStyle = '#fff'; c.font = '700 36px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(sign, W / 2, Hh / 2 + 2); });
      add(new T.PlaneGeometry(7, 1.75), lit(st, .9), 0, 26.6, .6, d);
      add(new T.PlaneGeometry(9, 5).rotateX(-Math.PI / 2), std('#2a1a10', { emissiveIntensity: .12 }), 0, .05, 4, d); // capacho
    };
    door(58, ZB + .6, 0, doorT('', '#3a4f7a'), 'ENTRADA', '#1f6b3a', 1.6); glow(58, FY + 22, ZB + 3, 26, .12, 0x7a9aff);
    door(-X + .6, ZF - 14, Math.PI / 2, doorT('BANHEIRO'), '♂  ♀', '#24406b', 1.45);
    // alvo de dardos, prateleira de troféus e a foto do time da várzea
    const dartT = canvasTex(256, 256, (x, W) => {
      const c = W / 2; x.fillStyle = '#1a1a1a'; x.beginPath(); x.arc(c, c, 126, 0, 7); x.fill();
      for (let i = 0; i < 20; i++) { const a0 = i * Math.PI / 10 - Math.PI / 20, a1 = a0 + Math.PI / 10; for (const [r0, r1, cA, cB] of [[0, 100, '#111', '#e8dcb8'], [92, 100, '#c22', '#2a8a3a'], [56, 63, '#c22', '#2a8a3a']]) { x.fillStyle = i % 2 ? cA : cB; x.beginPath(); x.arc(c, c, r1, a0, a1); x.arc(c, c, r0, a1, a0, true); x.fill(); } }
      x.fillStyle = '#2a8a3a'; x.beginPath(); x.arc(c, c, 14, 0, 7); x.fill(); x.fillStyle = '#c22'; x.beginPath(); x.arc(c, c, 6, 0, 7); x.fill();
    });
    add(new T.CylinderGeometry(4, 4, .6, 32), [std('#1a1a1a'), lit(dartT, .3), std('#1a1a1a')], -X + .5, FY + 31, -14).rotation.z = -Math.PI / 2;
    for (const [dy, dz] of [[.8, .6], [-1.2, -.4]]) add(new T.CylinderGeometry(.08, .08, 3, 6), std('#c8c8c8'), -X + 2.3, FY + 31 + dy, -14 + dz).rotation.z = -Math.PI / 2;
    add(new T.BoxGeometry(16, .5, 2.6), bw, -52, FY + 27, ZB + 1.3);
    const cupG = new T.LatheGeometry([[0, 0], [1, 0], [1, .4], [.3, .6], [.3, 1.6], [1.2, 2.4], [1.4, 3.6], [0, 3.6]].map(([a, b]) => new T.Vector2(a, b)), 14);
    for (const [x, sc] of [[-58, 1], [-54, 1.3], [-50, .9], [-46, 1.1]]) add(cupG, gold, x, FY + 27.25, ZB + 1.5).scale.setScalar(sc);
    const teamT = canvasTex(256, 180, (x, W, Hh) => { x.fillStyle = '#6a7a5a'; x.fillRect(0, 0, W, Hh); x.fillStyle = '#3a6a2a'; x.fillRect(0, Hh * .6, W, Hh * .4); for (let r = 0; r < 2; r++) for (let i = 0; i < 6; i++) { const px = 30 + i * 39 + r * 18, py = 60 + r * 50; x.fillStyle = '#d9a07a'; x.beginPath(); x.arc(px, py, 8, 0, 7); x.fill(); x.fillStyle = r ? '#b22' : '#eee'; x.fillRect(px - 10, py + 9, 20, 26); } x.fillStyle = 'rgba(255,230,180,.22)'; x.fillRect(0, 0, W, Hh); });
    add(new T.BoxGeometry(14, 10, .5), dark, -66, FY + 34, ZB + .3); add(new T.PlaneGeometry(13, 9), lit(teamT, .3), -66, FY + 34, ZB + .6);
    // sinuca com a luminária comprida dela, e o suporte de tacos na parede
    const snk = new T.Group(); snk.position.set(50, FY, 46); g.add(snk);
    add(new T.BoxGeometry(22, 3, 12.5), bw, 0, 13.2, 0, snk); add(new T.BoxGeometry(19, .3, 9.5), std('#1f5a8a', { emissiveIntensity: .35, roughness: 1 }), 0, 14.75, 0, snk);
    for (const [a, b] of [[-9.5, -4.8], [0, -5], [9.5, -4.8], [-9.5, 4.8], [0, 5], [9.5, 4.8]]) add(new T.CylinderGeometry(.6, .6, .35, 10), dark, a, 14.8, b, snk);
    for (const [a, b] of [[-9, -4.5], [9, -4.5], [-9, 4.5], [9, 4.5]]) add(new T.BoxGeometry(1.6, 11.7, 1.6), bw, a, 5.85, b, snk);
    const ballG = new T.SphereGeometry(.42, 10, 8);
    ['#f2ead8', '#e8c21a', '#1e4fbf', '#d42a1a', '#5a2a8a', '#e8701a', '#1a7a3a', '#7a1a1a', '#111'].forEach((c, i) => add(ballG, std(c, { emissiveIntensity: .35, roughness: .2 }), rand(-8, 8), 15.32, rand(-4, 4), snk));
    const cue = add(new T.CylinderGeometry(.12, .22, 14, 8), std('#c8a06a'), 1, 15.4, -3.4, snk); cue.rotation.z = Math.PI / 2; cue.rotation.y = .25;
    add(new T.BoxGeometry(16, 1.6, 4), std('#1d4a2a', { emissiveIntensity: .6 }), 0, 30, 0, snk);
    for (const a of [-5, 0, 5]) { add(new T.SphereGeometry(.6, 8, 6), bulbM, a, 29, 0, snk); glow(50 + a, FY + 28.6, 46, 9, .5); }
    for (const a of [-6, 6]) { const c = add(new T.CylinderGeometry(.08, .08, 1, 4), dark, a, (H + 30.8) / 2, 0, snk); c.scale.y = H - 30.8; }
    add(new T.PlaneGeometry(22, 12).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ map: glowT, color: 0xffd9a0, transparent: true, opacity: .3, blending: T.AdditiveBlending, depthWrite: false }), 0, 14.95, 0, snk);
    add(new T.BoxGeometry(.6, 1, 7), bw, X - .6, FY + 8, 58); for (let i = 0; i < 4; i++) add(new T.CylinderGeometry(.12, .2, 14, 6), std('#c8a06a'), X - 1.1, FY + 14.5, 55.5 + i * 1.6);
    // fliperama piscando
    const arcT = canvasTex(128, 128, (x, W) => { x.fillStyle = '#05051a'; x.fillRect(0, 0, W, W); for (let i = 0; i < 30; i++) { x.fillStyle = ['#ff3b6b', '#3bd1ff', '#ffe03b', '#6bff6b'][i % 4]; x.fillRect(rand(8, W - 16), rand(24, W - 16), 6, 6); } x.fillStyle = '#fff'; x.font = '700 13px monospace'; x.fillText('1UP 004200', 10, 16); });
    const arc = new T.Group(); arc.position.set(-X + 4, FY, 22); arc.rotation.y = Math.PI / 2; g.add(arc);
    add(new T.BoxGeometry(7, 20, 7), std('#2a1a4a', { emissiveIntensity: .3 }), 0, 10, 0, arc); add(new T.PlaneGeometry(5.6, 4.6), lit(arcT, 1.1), 0, 15.5, 3.55, arc);
    add(new T.BoxGeometry(7.2, 1.6, 2.5), std('#3a2a6a'), 0, 11, 4, arc);
    for (const [a, c] of [[-1.6, '#e33'], [-.6, '#3c3'], [.6, '#33e'], [1.6, '#ee3']]) add(new T.CylinderGeometry(.28, .28, .3, 8), std(c, { emissiveIntensity: .8 }), a, 11.9, 4.2, arc);
    add(new T.PlaneGeometry(6.6, 1.6), lit(canvasTex(256, 64, (x, W) => { x.fillStyle = '#111'; x.fillRect(0, 0, W, 64); x.fillStyle = '#ff4fd8'; x.font = '900 40px sans-serif'; x.textAlign = 'center'; x.fillText('FLIPERAMA', W / 2, 46); }), 1), 0, 19.2, 3.55, arc);
    glow(-X + 9, FY + 15, 22, 14, .22, 0x8a6aff);
    npc(-4, ZB + 6.5, 0, 0, 2, false); // garçom
    npc(-21, ZC + 9, Math.PI, 16, 0, true); npc(7, ZC + 9, Math.PI, 16, 3, true);
    npc(-62, 36, Math.PI / 2, 10, 1, true); npc(-46, 36, -Math.PI / 2, 10, 4, true); npc(46, -34, Math.PI / 2, 10, 5, true);
    npc(36, 49, Math.PI / 2, 0, 6, false); npc(-X + 13, 22, -Math.PI / 2, 0, 1, false);
    // fumaça de cigarro bem fraquinha subindo na luz da luminária
    const smT = canvasTex(256, 256, (x, W) => { for (let i = 0; i < 14; i++) { const X = rand(60, 196), Y = rand(60, 196), r = rand(30, 70), g = x.createRadialGradient(X, Y, 0, X, Y, r); g.addColorStop(0, 'rgba(235,228,215,.5)'); g.addColorStop(1, 'rgba(235,228,215,0)'); x.fillStyle = g; x.fillRect(0, 0, W, W); } });
    for (let i = 0; i < 7; i++) { const s = new T.Sprite(new T.SpriteMaterial({ map: smT, transparent: true, opacity: 0, depthWrite: false })); s.userData = { ph: rand(0, 1), sp: rand(.035, .06), x: rand(-9, 9), z: rand(-6, 5), sc: rand(7, 12), rot: rand(-.1, .1) }; g.add(s); smoke.push(s); }
    makeDog(K, -30, 30, DOGW); // vira-lata caramelo
    finishEnv(K, floor, { bg: 0x030201, fog: [80, 200] });
  }
  // ---------- câmera ----------
  function resize() {
    if (!renderer || !wrap) return;
    const w = wrap.clientWidth || 1, h = wrap.clientHeight || 1;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    // enquadra a mesa inteira: mais de cima quando a tela é estreita (celular em pé)
    const portrait = w / h < 1, vf = T.MathUtils.degToRad(camera.fov), hf = 2 * Math.atan(Math.tan(vf / 2) * camera.aspect);
    cam.baseEl = portrait ? 1.2 : 1.02; cam.baseDist = Math.max((portrait ? 13.6 : 14.4) / Math.tan(hf / 2), 10.8 / Math.tan(vf / 2));
    if (cam.el == null || !cam.moved) { cam.el = cam.baseEl; if (cam.cel == null) cam.cel = cam.el; }
  }
  function resetCam() { cam.az = 0; cam.el = cam.baseEl; cam.zoom = 1; cam.tx = 0; cam.tz = .9; cam.moved = false; }
  function placeCamera(dt) {
    const R = replay, k = 1 - Math.exp(-dt * (R ? 5 : 9)), g = !R ? cam : { az: cam.az, el: .46, zoom: .66, tx: R.p.x, tz: R.p.z }; // batida final: a câmera chega perto da ponta
    cam.caz += (g.az - cam.caz) * k; cam.cel += (g.el - cam.cel) * k; cam.czoom += (g.zoom - cam.czoom) * k; cam.ctx += (g.tx - cam.ctx) * k; cam.ctz += (g.tz - cam.ctz) * k;
    const d = cam.baseDist * cam.czoom * (1 - .07 * push), ce = Math.cos(cam.cel);
    camera.position.set(cam.ctx + Math.sin(cam.caz) * ce * d, Math.sin(cam.cel) * d, cam.ctz + Math.cos(cam.caz) * ce * d);
    if (cam.shake > .002) { camera.position.x += rand(-1, 1) * cam.shake; camera.position.y += rand(-1, 1) * cam.shake; cam.shake *= Math.exp(-dt * 9); }
    camera.lookAt(cam.ctx, 0, cam.ctz);
  }
  const orbit = (dx, dy) => { cam.az -= dx * .006; cam.el = Math.max(.3, Math.min(1.5, cam.el + dy * .005)); cam.moved = true; };
  const zoomBy = f => { cam.zoom = Math.max(.35, Math.min(1.7, cam.zoom * f)); cam.moved = true; };
  function pan(dx, dy) {
    const s = cam.baseDist * cam.zoom * .0016, ca = Math.cos(cam.az), sa = Math.sin(cam.az);
    cam.tx = Math.max(-13, Math.min(13, cam.tx - (dx * ca + dy * sa) * s)); cam.tz = Math.max(-10, Math.min(10, cam.tz - (-dx * sa + dy * ca) * s)); cam.moved = true;
  }
  function show(on) { active = !!on && mounted; if (!mounted) return; canvas.style.display = resetBtn.style.display = fxEl.style.display = active ? '' : 'none'; cancelAnimationFrame(raf); lastT = 0; if (active) { resize(); raf = requestAnimationFrame(loop); } }
  function supported() { if (!window.THREE) return false; try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; } }

  // ---------- estado -> alvos ----------
  function setTarget(o, pose, x = {}) {
    if (o.to && o.to.p.distanceTo(pose.p) < .01 && o.to.q.angleTo(pose.q) < .01 && !x.force) return;
    const dist = o.g.position.distanceTo(pose.p);
    o.from = { p: o.g.position.clone(), q: o.g.quaternion.clone() }; o.to = pose; o.t0 = clock();
    o.ez = x.ez || 'flight';
    o.delay = x.delay || 0; o.dur = x.dur || (o.ez === 'slide' ? Math.min(650, 380 + dist * 40) : Math.min(1000, 420 + dist * 32)); o.arc = x.arc ?? Math.min(2.6, dist * .13);
    o.land = x.land || 0; o.slam = !!x.slam;
  }
  // curvas: voo = acelera e freia suave; deslizar = seno; assentar = freia no fim; pancada carregada = só acelera até a mesa
  const EZ = { flight: k => (k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2), slide: k => -(Math.cos(Math.PI * k) - 1) / 2, settle: k => 1 - Math.pow(1 - k, 3), drop: k => k * k * k };
  function add(key, tile, start) {
    const g = makeTile(tile); g.position.copy(start.p); g.quaternion.copy(start.q); scene.add(g);
    const sh = new T.Mesh(geo.shadow, mats.shadow.clone()); sh.renderOrder = -2; scene.add(sh);
    const o = { g, sh, key, tile, kind: null, lift: 0, hold: false }; g.userData.key = key; objs.set(key, o); return o;
  }
  const drop = o => scene.remove(o.g, o.sh);
  // pedra da fileira que ficou meio torta depois de uma batida forte (continua no lugar)
  const nudged = (pose, n) => (n ? { p: pose.p.clone().add(new T.Vector3(n.x, 0, n.z)), q: new T.Quaternion().setFromAxisAngle(UP(), n.yaw).multiply(pose.q) } : pose);
  // placar: uma canaleta de madeira para cada dupla (ou jogador) num canto da mesa, com uma ficha por ponto
  const TRAY = N => [{ x: -10.6, z: 9.75 }, { x: 10.6, z: 9.75 }, { x: -10.6, z: -9.9 }].slice(0, N), TY = .36; // TY: fundo da canaleta
  const PY = .2; // fundo do pires
  const chipSlot = (N, side, k) => { const t = TRAY(N)[side], s = t.x < 0 ? -1 : 1; if (tbl.tray === 'pires') return new T.Vector3(t.x - s * .9 + jit(k, side) * .06, PY + .05 + k * .1, t.z + jit(k, side + 5) * .06); return new T.Vector3(t.x - s * .45 + (Math.min(k, 5) - 2.5) * .8, TY + .075 + Math.max(0, k - 5) * .1, t.z); }; // passou de 6: empilha
  function plateTex(hex, big, small) {
    return canvasTex(160, 200, (x, W, Hh) => {
      x.fillStyle = '#1a0d06'; x.fillRect(0, 0, W, Hh); x.fillStyle = hex; rrect(x, 10, 10, W - 20, Hh - 20, 18); x.fill();
      x.strokeStyle = 'rgba(255,255,255,.6)'; x.lineWidth = 4; rrect(x, 18, 18, W - 36, Hh - 36, 12); x.stroke();
      x.fillStyle = '#fff'; x.textAlign = 'center'; x.font = '700 26px Georgia, serif'; x.fillText(small, W / 2, 70); x.font = '900 84px Georgia, serif'; x.fillText(big, W / 2, 160);
    });
  }
  function buildTrays(N, teams) {
    const g = new T.Group(), brass = new T.MeshPhysicalMaterial({ color: C(0xc9a24a), metalness: .8, roughness: .3 }), bedM = new T.MeshStandardMaterial({ color: C(0x2a140a), roughness: .95 });
    if (tbl.tray === 'pires') { // pires de boteco: louça branca com friso, e a plaquinha da dupla do lado
      const louca = new T.MeshPhysicalMaterial({ color: C(0xf4f1ea), roughness: .25, clearcoat: .8 }), friso = new T.MeshStandardMaterial({ color: C(0x2a5aa8), roughness: .4 });
      const pg = new T.LatheGeometry([[0, 0], [1.1, 0], [1.15, .05], [1.25, .18], [1.9, .3], [2.05, .42], [1.95, .45], [1.2, .26], [0, .22]].map(([a, b]) => new T.Vector2(a, b)), 32);
      TRAY(N).forEach((t, side) => {
        const s = t.x < 0 ? -1 : 1, x = t.x - s * .9, pr = new T.Mesh(pg, louca), fr = new T.Mesh(new T.TorusGeometry(1.95, .035, 4, 40).rotateX(Math.PI / 2), friso);
        pr.position.set(x, 0, t.z); fr.position.set(x, .44, t.z); pr.castShadow = pr.receiveShadow = true;
        const plate = new T.Mesh(new T.PlaneGeometry(.8, 1).rotateX(-Math.PI / 2), new T.MeshStandardMaterial({ map: plateTex(TEAMC[side % 4], String(side + 1), teams ? 'DUPLA' : 'JOG.'), roughness: .5 }));
        plate.position.set(t.x + s * 1.9, .012, t.z); g.add(pr, fr, plate);
      });
      g.userData.N = N; scene.add(g); return g;
    }
    TRAY(N).forEach((t, side) => {
      const s = t.x < 0 ? -1 : 1, flatShape = (w, h, r, d) => new T.ExtrudeGeometry(roundRect(w, h, r), { depth: d, bevelEnabled: false }).rotateX(-Math.PI / 2);
      const box = new T.Mesh(new T.ExtrudeGeometry(roundRect(6.3, 1.4, .35), { depth: .2, bevelEnabled: true, bevelThickness: .08, bevelSize: .08, bevelSegments: 3 }).rotateX(-Math.PI / 2), woodM);
      const rim = new T.Mesh(flatShape(5.3, 1, .5, .02), brass), bed = new T.Mesh(flatShape(5.18, .88, .44, .025), bedM);
      const plate = new T.Mesh(new T.PlaneGeometry(.8, 1).rotateX(-Math.PI / 2), new T.MeshStandardMaterial({ map: plateTex(TEAMC[side % 4], String(side + 1), teams ? 'DUPLA' : 'JOG.'), roughness: .5 }));
      const sh = new T.Mesh(geo.shadow, mats.shadow.clone()); sh.scale.set(3.15, 1, 1.4); sh.material.opacity = .55;
      box.position.set(t.x, .08, t.z); rim.position.set(t.x - s * .45, TY, t.z); bed.position.set(t.x - s * .45, TY + .002, t.z); plate.position.set(t.x + s * 2.7, TY + .006, t.z); sh.position.set(t.x, .012, t.z);
      box.castShadow = box.receiveShadow = bed.receiveShadow = true; g.add(box, rim, bed, plate, sh);
    });
    g.userData.N = N; scene.add(g); return g;
  }
  function syncChips() {
    const N = st.score.length, fresh = chipGame !== st.gameId;
    if (N > 3) { chips.forEach(l => l.forEach(c => scene.remove(c.m))); chips.length = 0; if (trays) { scene.remove(trays); trays = null; } chipGame = st.gameId; return; } // shortcut: com 5 a 8 cada um por si, não tem canaleta para todos; o placar fica no HUD
    if (fresh || trays?.userData.N !== N) { chips.forEach(l => l.forEach(c => scene.remove(c.m))); chips.length = 0; if (trays) scene.remove(trays); trays = buildTrays(N, st.teams); }
    chipGame = st.gameId;
    let nk = 0;
    st.score.forEach((v, side) => {
      const list = chips[side] || (chips[side] = []);
      while (list.length > v) scene.remove(list.pop().m);
      while (list.length < v) { // ponto novo: a ficha sai de quem pontuou e cai rodando na canaleta (depois do replay)
        const to = chipSlot(N, side, list.length), m = new T.Mesh(geo.chip, chipMat[side % 4]), c = { m, to, t0: null };
        m.castShadow = true; m.position.copy(to);
        if (!fresh) { c.from = st.last?.seat != null ? seat(st.last.seat).c.clone().setY(2.5) : new T.Vector3(0, 3, 0); c.t0 = clock() + (replay ? 3000 : 2300) + nk++ * 260; c.spin = rand(7, 13); m.visible = false; }
        scene.add(m); list.push(c);
      }
    });
  }
  function chipStep(now) {
    for (const list of chips) for (const c of list || []) {
      if (c.t0 != null) {
        const k = (now - c.t0) / 650; if (k < 0) continue;
        c.m.visible = true;
        if (k >= 1) { c.t0 = null; c.m.position.copy(c.to); c.m.rotation.set(0, 0, 0); Domino2SFX.tick(); continue; }
        c.m.position.lerpVectors(c.from, c.to, EZ.flight(k)); c.m.position.y += 2.2 * Math.sin(Math.PI * k); c.m.rotation.x = c.spin * (1 - EZ.settle(k));
      } else if (c.hop) { // pancada: as fichas pulam e chacoalham na canaleta
        const s = (now - c.hop.t0) / 1000; if (s < 0) continue;
        if (s > 1.2) { c.hop = null; c.m.position.copy(c.to); c.m.rotation.set(0, 0, 0); continue; }
        const e = Math.exp(-s * 5); c.m.position.y = c.to.y + c.hop.h * e * Math.abs(Math.sin(s * c.hop.w)); c.m.rotation.z = c.hop.h * 1.5 * e * Math.sin(s * c.hop.w * 1.3);
      }
    }
  }
  function sync(state, o2) {
    if (renderer) renderer.shadowMap.needsUpdate = true;
    if (!mounted) return;
    st = state; opt = o2 || {}; n = st.players.length; mySeat = opt.mySeat >= 0 ? opt.mySeat : 0;
    setScene(testCfg ? { ...st.cfg, ...testCfg } : st.cfg);
    const want = new Map(), ev = st.ev || {}, deal = st.hand !== curHand, lp = st.lastPlay || {}, freshEv = ev.n !== lastEvN; curHand = st.hand;
    const won = st.phase !== 'play' && st.last && st.last.kind !== 'tranca';
    if (deal) clearJunk(); // mesa limpa a cada mão
    if (st.toss && tossSeen !== null && st.toss.n !== tossSeen && st.toss.hand === st.hand) toss(st.toss);
    tossSeen = st.toss?.n ?? 0;
    let reveal = 0;
    // sons dos eventos
    if (ev.n !== lastEvN) { if (lastEvN >= 0 || deal) { if (deal) { Domino2SFX.gather(); setTimeout(() => Domino2SFX.shuffle(1.9), 850); } else if (ev.type === 'buy') Domino2SFX.draw(); else if (ev.type === 'pass') Domino2SFX.knock(); } lastEvN = ev.n; }
    if (st.C) linePoses(st).forEach((L, i) => want.set('t' + L.id, { kind: 'line', a: L.a, d: L.d, pose: L.pose, li: i <= st.R.length ? i : st.R.length - i })); // li: posição na fileira (a carroça do meio = 0)
    st.players.forEach((p, s) => {
      if (s === opt.mySeat) p.hand.forEach((t, j) => want.set('t' + idOf(t), { kind: 'me', tile: t, pose: myPose(j, p.hand.length) }));
      else if (p.hand.length) p.hand.forEach((t, j) => want.set('t' + idOf(t), { kind: 'open', tile: t, s, j, pose: openPose(s, j, p.hand.length) }));
      else for (let j = 0; j < p.count; j++) want.set(`o${s}-${j}`, { kind: 'hid', s, pose: standPose(s, j, p.count) });
    });
    const pc = st.pile?.count ?? (Array.isArray(st.pile) ? st.pile.length : 0);
    for (let j = 0; j < pc; j++) want.set('p' + j, { kind: 'pile', pose: pilePose(j) });
    // mão nova: as pedras que sobraram da mão anterior não somem, vão para o embaralhar
    const pool = [];
    for (const [k, o] of objs) if (!want.has(k)) { objs.delete(k); if (deal) pool.push(o); else drop(o); }
    let i = 0;
    const now = clock(), swirl = Math.random() < .5 ? 1 : -1;
    for (const [k, w] of want) {
      let o = objs.get(k);
      const tile = w.tile || (k[0] === 't' ? [Math.floor(+k.slice(1) / 10), +k.slice(1) % 10] : null);
      let gather = null;
      if (deal) { const r = 4.4 * Math.sqrt(Math.random()), a = rand(0, 7), yaw = rand(0, 7); gather = { r, a, yaw, p: new T.Vector3(Math.cos(a) * r, TH, Math.sin(a) * r * .75) }; }
      if (!o && pool.length) { o = pool.pop(); o.key = k; o.g.userData.key = k; objs.set(k, o); retile(o, tile); }
      if (!o) { // de onde a pedra nova surge
        let start;
        if (deal) start = { p: gather.p.clone().setY(4 + rand(0, 2)), q: faceDown(gather.yaw) }; // chove no meio da mesa
        else if (w.kind === 'line' && lp.seat != null) start = standPose(lp.seat, 0, 1);
        else if ((w.kind === 'me' || w.kind === 'hid') && ev.type === 'buy') start = pilePose(pc);
        else if (w.kind === 'open') start = standPose(w.s, w.j, st.players[w.s].hand.length);
        else start = { p: w.pose.p.clone().add(new T.Vector3(0, 3, 0)), q: w.pose.q.clone() };
        o = add(k, tile, start);
      }
      if (deal) o.nudge = null;
      const base = w.kind === 'line' ? (o.base = facing(o, w.a, w.d, w.pose)) : w.pose, pose = w.kind === 'line' ? nudged(base, o.nudge) : base, toLine = w.kind === 'line' && o.kind !== 'line';
      if (o.hold && w.kind !== 'me') o.hold = false;
      if (!o.hold) {
        if (deal) { // junta tudo virado para baixo no meio, embaralha em roda e depois distribui
          o.settle = null; o.bump = null; o.revealing = false;
          setTarget(o, { p: gather.p, q: faceDown(gather.yaw) }, { delay: i * 14, dur: 480, arc: .9, force: true });
          o.shuf = { t0: now + 900, dur: 1550, ...gather, dir: swirl, w: 2.2 + 1.4 * (1 - gather.r / 4.4), i, final: pose };
        } else if (o.shuf && !toLine) o.shuf.final = pose;
        else if (toLine) { // jogada: assenta (1), bate (2) ou dá a pancada (3)
          const fin = won && freshEv, f = fin ? 4 : lp.f || 1, charged = o.charged; o.charged = false; o.shuf = null; // 4 = a batida que fecha a mão
          // cai um pouquinho antes e meio virada; depois escorrega até encostar (o "assentar" fica no impact)
          const dir = pose.p.clone().sub(o.g.position).setY(0); if (dir.lengthSq() < 1e-4) dir.set(0, 0, -1); dir.normalize();
          const short = { p: pose.p.clone().addScaledVector(dir, -(f > 1 ? .12 : .28)).add(new T.Vector3(rand(-.06, .06), 0, rand(-.06, .06))), q: pose.q.clone().multiply(new T.Quaternion().setFromAxisAngle(UP(), rand(-.12, .12))) };
          // carregada: já está lá em cima, só desce acelerando e gira até deitar; senão voa em arco
          const dbl = tile && tile[0] === tile[1]; o.mv = null; o.flip = null;
          o.bucha = dbl && f > 1 && !fin; // bucha: mesmo voo, mas cai pesada (som duplo, anel dourado e uma onda leve na fileira)
          if (fin) { // batida final: coreografia própria (moveStep)
            o.t0 = null; o.settle = null; o.mv = { t0: clock(), from: { p: o.g.position.clone(), q: o.g.quaternion.clone() }, to: pose, f, fin };
            if (fin) { replay = { p: pose.p.clone(), t0: performance.now() }; cine('on'); }
          } else {
            if (f === 3 && !charged && !dbl) { const ax = new T.Vector3().crossVectors(UP(), dir); o.flip = ax.lengthSq() > 1e-6 ? ax.normalize() : new T.Vector3(1, 0, 0); } // pancada: cambalhota no ar
            setTarget(o, short, charged ? { land: f, arc: .25, dur: 230, ez: 'drop' } : { land: f, slam: f > 1, arc: f === 3 ? 3 : f === 2 ? 1.4 : undefined, dur: f > 1 ? 520 : undefined, ez: 'flight' });
            o.settle = pose;
          }
        } else if (o.settle) o.settle = pose; // ainda caindo/assentando: só atualiza onde vai parar
        else if (w.kind === 'open' && o.kind !== 'open') { // fim da mão: as pedras dos outros deitam e viram uma a uma
          const oo = o, p = pose; o.revealing = true; o.t0 = null; o.to = { p: o.g.position.clone(), q: o.g.quaternion.clone() };
          setTimeout(() => { oo.revealing = false; if (objs.get(k) === oo && oo.kind === 'open') { setTarget(oo, p, { arc: 1.1, dur: REVEAL.dur, ez: 'flight', force: true }); Domino2SFX.click(.5); } }, REVEAL.base(won) + reveal++ * REVEAL.per);
        } else if (o.revealing) { /* espera a vez dela de virar */ }
        else if (o.kind === w.kind) setTarget(o, pose, { arc: 0, ez: 'slide' }); // só reorganizou: desliza
        else setTarget(o, pose, { arc: .8, ez: 'flight' });
      }
      o.kind = w.kind; o.li = w.li; i++;
    }
    pool.forEach(drop);
    syncChips();
    // pedras que dá para jogar: halo dourado pulsando; as outras ficam apagadinhas na sua vez
    const can = opt.legal || opt.can || []; // halo só nas que encaixam de verdade (no vale gato dá para arrastar qualquer uma)
    for (const o of objs.values()) if (o.tile) {
      const on = o.kind === 'me' && opt.myTurn && can.some(m => same(m.t, o.tile)), m = o.g.userData.body.material;
      o.playable = on;
      m[0].color.setHex(o.kind === 'me' && opt.myTurn && !on ? 0xb9b2a2 : 0xffffff);
    }
    setGhosts(drag?.moved ? drag.tile : opt.sel);
  }
  function setGhosts(tile) {
    ghosts.forEach(g => scene.remove(g)); ghosts = [];
    if (!tile || !opt.myTurn) return;
    const ends = [...new Set((opt.can || []).filter(m => same(m.t, tile)).map(m => m.end))];
    for (const end of ends) {
      const P = lineAfter(tile, end), g = new T.Mesh(geo.body, mats.ghost);
      g.position.copy(P.pose.p).setY(.02); g.quaternion.copy(P.pose.q); g.userData = { end, tile }; scene.add(g); ghosts.push(g);
    }
  }

  // ---------- entrada ----------
  function setPtr(e) { const r = canvas.getBoundingClientRect(); ptr.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1); ray.setFromCamera(ptr, camera); }
  const playable = o => o && o.kind === 'me' && opt.myTurn && (opt.can || []).some(m => same(m.t, o.tile)); // no vale gato, opt.can tem todas
  function pickMine() {
    const mine = [...objs.values()].filter(o => o.kind === 'me').map(o => o.g.userData.body);
    const hit = ray.intersectObjects(mine)[0]; return hit ? objs.get(hit.object.parent.userData.key) : null;
  }
  function nearGhost(p) { let best = null, bd = 1e9; for (const g of ghosts) { const d = Math.hypot(g.position.x - p.x, g.position.z - p.z); if (d < bd) { bd = d; best = g; } } return bd < 4.2 ? best : null; }
  const speed = tr => { const a = tr[0], z = tr[tr.length - 1]; return a && z && z[0] > a[0] ? Math.hypot(z[1] - a[1], z[2] - a[2]) / (z[0] - a[0]) : 0; };
  function bindInput() {
    wrap.addEventListener('pointerdown', () => Domino2SFX.unlock(), true);
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('dblclick', resetCam);
    canvas.addEventListener('wheel', e => { e.preventDefault(); zoomBy(Math.exp(e.deltaY * .0012)); }, { passive: false });
    canvas.addEventListener('pointermove', e => {
      setPtr(e);
      if (touches.has(e.pointerId)) { // gesto de câmera
        const p = touches.get(e.pointerId), dx = e.clientX - p.x, dy = e.clientY - p.y; touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (touches.size >= 2) { // dois dedos: pinça = zoom, arrastar = mover
          const [a, b] = [...touches.values()], dd = Math.hypot(a.x - b.x, a.y - b.y);
          if (gesture?.dd) zoomBy(gesture.dd / Math.max(1, dd)); gesture = { dd }; pan(dx / 2, dy / 2);
        } else if (gesture?.pan) pan(dx, dy); else orbit(dx, dy);
        return;
      }
      if (drag) {
        drag.trail.push([performance.now(), e.clientX, e.clientY]); while (drag.trail.length > 2 && drag.trail[0][0] < performance.now() - 100) drag.trail.shift();
        if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 8) { drag.moved = true; setGhosts(drag.tile); Domino2SFX.click(.6); }
        if (drag.moved) { const p = new T.Vector3(); if (ray.ray.intersectPlane(plane, p)) drag.at = p; }
        return;
      }
      const o = pickMine(); if (o?.key !== hoverKey && playable(o)) Domino2SFX.click(.25);
      hoverKey = o ? o.key : null; canvas.style.cursor = playable(o) ? 'grab' : ray.intersectObjects(ghosts)[0] ? 'pointer' : 'move';
    });
    canvas.addEventListener('pointerdown', e => {
      setPtr(e);
      const g = !touches.size && ray.intersectObjects(ghosts)[0]; if (g) return H.play?.(g.object.userData.tile, g.object.userData.end, 1);
      const o = !touches.size && pickMine();
      if (playable(o)) { drag = { key: o.key, tile: o.tile, sx: e.clientX, sy: e.clientY, moved: false, at: null, trail: [], charge: 0 }; try { canvas.setPointerCapture(e.pointerId); } catch {} return; }
      if (drag) return;
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY }); gesture = { pan: e.button === 2 || e.shiftKey }; try { canvas.setPointerCapture(e.pointerId); } catch {}
    });
    const up = e => {
      if (touches.delete(e.pointerId)) { gesture = touches.size ? {} : null; return; }
      if (!drag) return; const d = drag; drag = null; canvas.style.cursor = '';
      if (!d.moved) return H.pick?.(d.tile);
      const g = d.at && nearGhost(d.at), o = objs.get(d.key);
      if (g && o) {
        // soltou rápido = batida; segurou parado em cima da ponta = pancada carregada
        const v = speed(d.trail), fv = v > 1.8 ? 3 : v > .9 ? 2 : 1, fc = d.charge > .85 ? 3 : d.charge > .35 ? 2 : 1, f = Math.max(fv, fc);
        o.hold = true; o.t0 = null; o.charged = d.charge > .35; H.play?.(d.tile, g.userData.end, f);
        setTimeout(() => { if (o.hold) { o.hold = false; setTarget(o, o.to, { force: true }); } }, 2500); // jogada recusada: volta para a mão
      }
      setGhosts(opt.sel);
      if (o && !g) setTarget(o, o.to, { force: true, arc: .5, dur: 380 });
    };
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  }

  // ---------- quadro a quadro ----------
  let push = 0; // a câmera chega um pouco mais perto enquanto você arma a pancada
  function loop(t) {
    if (!active) return; raf = requestAnimationFrame(loop);
    const rdt = Math.min(.05, lastT ? (t - lastT) / 1000 : .016), rnow = performance.now(); lastT = t;
    if (replay && rnow - (replay.hit || replay.t0 + 5000) > 1000) { replay = null; cine(false); }
    const dt = rdt * slow, now = (vnow += dt * 1000);
    let busy = !!drag?.moved || !!kick || flying.length > 0 || (frameN++ % 3 === 0 && !!opt.myTurn); // na sua vez as pedras "respiram": sombra a cada 3 quadros
    for (const o of objs.values()) {
      if (o.t0 != null || o.mv || o.shuf || o.bump || o.hold) busy = true;
      if (drag?.moved && o.key === drag.key && drag.at) { dragStep(o, rdt, rnow); continue; }
      if (o.hold) continue;
      if (o.mv && moveStep(o, now)) continue;
      if (o.shuf && shuffleStep(o, now)) continue;
      if (o.t0 != null) {
        let k = Math.max(0, Math.min(1, (now - o.t0 - o.delay) / o.dur));
        if (o.slam) k = k < .6 ? k / .6 * .5 : .5 + (k - .6) / .4 * .5; // sobe devagar, desce rápido
        const e = EZ[o.ez](k);
        o.g.position.lerpVectors(o.from.p, o.to.p, e); o.g.position.y += o.arc * Math.sin(Math.PI * k);
        o.g.quaternion.copy(o.from.q).slerp(o.to.q, o.ez === 'flight' ? EZ.slide(Math.min(1, k * 1.15)) : e); // no voo, gira um pouco antes de chegar
        if (o.flip) o.g.quaternion.premultiply(new T.Quaternion().setFromAxisAngle(o.flip, Math.PI * 2 * (1 - e)));
        if (k >= 1 && (now - o.t0 - o.delay) >= o.dur) { o.t0 = null; if (o.land) { const f = o.land; o.land = 0; impact(o, f, o.bucha); o.bucha = false; } }
      }
      if (o.kind === 'me') { // sua mão: a jogável respira de leve; sobe mais com o mouse em cima e quando está escolhida
        const want = opt.sel && same(opt.sel, o.tile) ? .75 : o.key === hoverKey && o.playable ? .45 : o.playable ? .16 + .05 * Math.sin(now / 380 + o.g.position.x) : 0;
        o.lift += (want - o.lift) * Math.min(1, dt * 10); if (!opt.myTurn && Math.abs(want - o.lift) > .003) busy = true; // a mão descendo depois da vez ainda mexe a sombra
        if (o.t0 == null) o.g.position.y = o.to.p.y + o.lift;
      }
      if (o.bump) bumpStep(o, dt, now);
      const h = o.g.userData.halo; if (h) { h.visible = !!o.playable && !o.shuf; if (h.visible) h.material.opacity = (o.key === hoverKey ? .95 : .55) + .25 * Math.sin(now / 300); }
    }
    for (const o of objs.values()) shade(o);
    for (const g of ghosts) g.material.opacity = .22 + .14 * Math.sin(now / 220);
    if (!drag?.moved && chargeRing) chargeRing.visible = glow.visible = false;
    push += ((drag?.moved ? easeOut(drag.charge) : 0) - push) * Math.min(1, dt * 5);
    junkStep(dt, now); dogStep(rdt, rnow);
    if (!busy) busy = junk.some(j => j.v || j.grow) || (dog?.state === 'walk' && dog.g.position.lengthSq() < 1600) || chips.some(l => l?.some(c => c.t0 != null || c.hop));
    if (busy) renderer.shadowMap.needsUpdate = true;
    ripples = ripples.filter(r => { const k = (now - r.t0) / r.dur; if (k >= 1) { scene.remove(r.m); return false; } r.m.scale.setScalar(1 + k * r.size); r.m.material.opacity = .35 * (1 - k) * r.op; return true; });
    chipStep(now);
    if (kick) { // a mesa toda dá um tranco para baixo e balança um tiquinho
      const s = (now - kick.t0) / 1000, e = Math.exp(-s * 6);
      if (s > 2.5) { kick = null; scene.position.set(0, 0, 0); scene.rotation.set(0, 0, 0); }
      else if (s >= 0) { scene.position.y = -kick.a * e * Math.sin(s * 40); scene.rotation.x = kick.a * .09 * e * Math.sin(s * 33 + 1); scene.rotation.z = kick.a * .1 * e * Math.sin(s * 29); }
    }
    // ambiente: a luminária balança devagar e a fumaça sobe na luz
    const ks = kick ? (now - kick.t0) / 1000 : 0, sw = kick && ks > 0 ? kick.a * 9 * Math.exp(-ks * 2.2) * Math.sin(ks * 5) : 0; // na pancada a luminária balança
    lamp.position.x = lampP.x + sw; lamp.position.z = lampP.z - sw * .4;
    const fl = flick && rnow - flick.t0 < 800; if (flick && !fl) flick = null; // na batida final a luz falha
    lamp.intensity = fl ? (Math.random() < .45 ? .15 : lampI * 1.25) : lampI;
    for (const n of npcs) {
      n.ph += rdt; const want = n.lookT > rnow ? n.look : .3 * Math.sin(n.ph * .35) + .15 * Math.sin(n.ph * .9);
      if (n.drink) { n.next -= rdt; if (n.next < 0) { n.dt = 0; n.next = rand(8, 16); } if (n.dt < 2.6) n.dt += rdt; }
      if (n.gl) { peopleStep(n, rdt, rnow, want); continue; }
      n.head.rotation.y += (want - n.head.rotation.y) * Math.min(1, rdt * (n.lookT > rnow ? 9 : 2));
      if (n.drink && n.dt < 2.6) n.fore.rotation.x = -1.35 * Math.sin(Math.min(1, n.dt / 2.6) * Math.PI);
    }
    if (neon) neon.material.opacity = fl ? Math.random() * .3 : Math.random() < .004 ? .35 : .9 + .1 * Math.sin(rnow / 90); // neon velho piscando de vez em quando
    for (const fan of fans) fan.rotation.y += rdt * 2.2;
    envTick?.(rdt, rnow);
    if (clockHands) { const d = new Date(), mi = d.getMinutes() + d.getSeconds() / 60; clockHands[1].rotation.z = -mi / 60 * Math.PI * 2; clockHands[0].rotation.z = -((d.getHours() % 12) + mi / 60) / 12 * Math.PI * 2; tvT.offset.x = .2 + .2 * Math.sin(rnow / 4000); }
    for (const s of smoke) {
      const u = s.userData; u.ph = (u.ph + rdt * u.sp) % 1;
      s.position.set(u.x + Math.sin(u.ph * 6 + u.sc) * 1.5, 3 + u.ph * 9, u.z); s.scale.setScalar(u.sc * (.7 + u.ph * .6));
      s.material.opacity = ambient ? .05 * Math.sin(Math.PI * u.ph) : 0; s.material.rotation += u.rot * rdt;
    }
    // resolução adaptativa: abaixo de ~48 fps baixa a nitidez um degrau; estável em 60 por 20 s, volta a subir
    if (rnow - perf.last > 250) { perf.t0 = rnow; perf.n = 0; } perf.last = rnow; perf.n++;
    if (rnow - perf.t0 > 2000) {
      const fps = perf.n * 1000 / (rnow - perf.t0), max = Math.min(1.75, devicePixelRatio || 1); let pr = renderer.getPixelRatio();
      if (fps < 48 && pr > 1) { pr = Math.max(1, pr - .25); perf.down = rnow; } else if (fps > 57 && pr < max && rnow - perf.down > 20000) { pr = Math.min(max, pr + .25); perf.down = rnow; }
      if (pr !== renderer.getPixelRatio()) { renderer.setPixelRatio(pr); resize(); }
      perf.t0 = rnow; perf.n = 0;
    }
    placeCamera(rdt);
    renderer.render(scene, camera);
  }
  // embaralhar: viradas para baixo, as pedras giram em roda no meio da mesa (as de dentro mais rápido), indo e vindo um pouco
  function shuffleStep(o, now) {
    const s = o.shuf, k = (now - s.t0) / s.dur;
    if (k < 0) return false; // ainda juntando no meio
    if (k >= 1) { // distribui, uma de cada vez
      o.shuf = null; setTarget(o, s.final, { delay: s.i * 45, dur: 650, arc: 1.4, force: true });
      if (s.i % 4 === 0) setTimeout(() => Domino2SFX.click(.35), s.i * 45 + 600);
      return false;
    }
    o.t0 = null;
    const e = EZ.slide(k), wob = Math.sin(Math.PI * k), ang = s.a + s.dir * s.w * e, rr = s.r * (1 + .25 * wob * Math.sin(k * 11 + s.i));
    o.g.position.set(Math.cos(ang) * rr, TH, Math.sin(ang) * rr * .75);
    o.g.quaternion.copy(faceDown(s.yaw + s.dir * 2.5 * e + .4 * wob * Math.sin(k * 7 + s.i)));
    return true;
  }
  // batida final: sobe alto em cima do lugar mostrando a face, treme cada vez mais e desce de uma vez
  function moveStep(o, now) {
    const m = o.mv, P = m.to.p, t = now - m.t0;
    const T1 = 420, T2 = T1 + 700, T3 = T2 + 110;
    let p = null, q = null;
    {
      const hov = P.clone().setY(P.y + 4.6), tq = new T.Quaternion().setFromAxisAngle(new T.Vector3(Math.cos(cam.caz), 0, -Math.sin(cam.caz)), .95).multiply(m.to.q); // no ar, mostra a face para quem olha
      if (t < T1) { const k = EZ.settle(t / T1); p = m.from.p.clone().lerp(hov, k); q = m.from.q.clone().slerp(tq, k); }
      else if (t < T2) { const k = (t - T1) / (T2 - T1), j = () => rand(-1, 1) * .08 * k * k; p = hov.clone().add(new T.Vector3(j(), j() + .45 * Math.sin(k * Math.PI), j())); q = tq.clone().multiply(new T.Quaternion().setFromEuler(new T.Euler(j(), j(), j()))); }
      else if (t < T3) { const k = (t - T2) / (T3 - T2); p = hov.clone().lerp(P, k * k * k); q = tq.clone().slerp(m.to.q, k); }
    }
    if (!p) { o.mv = null; o.bump = null; o.g.position.copy(P); o.g.quaternion.copy(m.to.q); o.to = m.to; o.t0 = null; impact(o, m.f, false); return false; }
    o.bump = null; o.g.position.copy(p); o.g.quaternion.copy(q); return true;
  }
  // pulo quando bate uma pedra perto: física simples (gravidade, quique que perde força, balanço de mola na borda),
  // cada pedra com seu próprio quique, rigidez e atraso, para não pularem todas no mesmo ritmo
  const mkBump = (t0, h, dir, av, push) => ({ t0, y: 0, vy: Math.sqrt(2 * 32 * Math.max(0, h)), e: rand(.2, .45), ang: 0, av, k: rand(140, 320), c: rand(5, 11), dir, push,
    axis: new T.Vector3().crossVectors(UP(), dir.lengthSq() > 1e-6 ? dir : new T.Vector3(1, 0, 0)).normalize() });
  function bumpStep(o, dt, now) {
    const b = o.bump; if (now < b.t0) return;
    if (o.t0 == null && o.to) { o.g.position.copy(o.to.p); o.g.quaternion.copy(o.to.q); if (o.kind === 'me') o.g.position.y += o.lift; }
    b.vy -= 32 * dt; b.y += b.vy * dt; if (b.y <= 0) { b.y = 0; b.vy = b.vy < -.6 ? -b.vy * b.e : 0; }
    b.av += (-b.k * b.ang - b.c * b.av) * dt; b.ang += b.av * dt;
    if ((b.y === 0 && b.vy === 0 && Math.abs(b.ang) < .002 && Math.abs(b.av) < .02) || now - b.t0 > 2500) { o.bump = null; return; }
    o.g.position.y += b.y + Math.abs(Math.sin(b.ang)) * .6; o.g.position.addScaledVector(b.dir, b.push * Math.min(1, b.y * 5));
    o.g.quaternion.premultiply(new T.Quaternion().setFromAxisAngle(b.axis, b.ang));
  }
  // sombra de contato: projeta a caixa da pedra no feltro (comprimento e largura do "rastro") e apaga conforme ela sobe
  let _v, _c, _A, _B;
  function shade(o) {
    if (!_v) { _v = [new T.Vector3(), new T.Vector3(), new T.Vector3()]; _c = new T.Vector3(); _A = new T.Vector3(); _B = new T.Vector3(); }
    const q = o.g.quaternion, L = _v[0].set(1, 0, 0).applyQuaternion(q), Y = _v[1].set(0, 1, 0).applyQuaternion(q), S = _v[2].set(0, 0, 1).applyQuaternion(q);
    _c.copy(Y).multiplyScalar(TH / 2).add(o.g.position);
    const h = Math.max(0, _c.y - (Math.abs(L.y) + Math.abs(S.y) * .5 + Math.abs(Y.y) * TH / 2));
    L.setY(0).multiplyScalar(2); Y.setY(0).multiplyScalar(TH); S.setY(0);
    _A.copy(_v.reduce((m, x) => (x.lengthSq() > m.lengthSq() ? x : m))).normalize(); _B.set(-_A.z, 0, _A.x);
    const ea = _v.reduce((s, x) => s + Math.abs(x.dot(_A)), 0), eb = _v.reduce((s, x) => s + Math.abs(x.dot(_B)), 0), k = 1 + h * .2;
    o.sh.position.set(_c.x, .012, _c.z); o.sh.rotation.y = Math.atan2(-_A.z, _A.x); o.sh.scale.set(ea / 2 * k, 1, eb * k);
    o.sh.material.opacity = .5 * Math.exp(-h * .5);
  }
  // arrastando: a pedra segue o dedo, inclinando para onde vai; perto da ponta deita no sentido certo. Parada em cima da ponta
  // ela "arma" a pancada: puxa para cima e para trás mostrando a face, balança, e perto do máximo treme cada vez mais.
  // No feltro, um brilho e um anel vão enchendo (dourado -> vermelho) e a câmera chega um pouco mais perto.
  let chargeRing = null, glow = null, ringStep = -1;
  const easeOut = k => 1 - Math.pow(1 - k, 3);
  function dragStep(o, dt, now) {
    const g = nearGhost(drag.at), last = drag.trail[drag.trail.length - 1], still = speed(drag.trail) < .12 || now - (last?.[0] || now) > 120;
    drag.charge = g && still ? Math.min(1, drag.charge + dt / 1.1) : Math.max(0, drag.charge - dt * 3);
    const c = easeOut(drag.charge), toCam = new T.Vector3(Math.sin(cam.caz), 0, Math.cos(cam.caz)), right = new T.Vector3(Math.cos(cam.caz), 0, -Math.sin(cam.caz));
    const tp = g ? drag.at.clone().lerp(g.position.clone().setY(.9), .55) : drag.at.clone();
    tp.y += c * 2.6; tp.addScaledVector(toCam, c * 1.3);
    const tr = Math.pow(Math.max(0, drag.charge - .55) / .45, 2), sh = (a, b) => (Math.sin(now / a) + Math.sin(now / b)) * .5;
    tp.addScaledVector(right, sh(19, 13.7) * .05 * tr); tp.y += sh(23, 9.1) * .04 * tr;
    const v = o.dv || (o.dv = new T.Vector3()); v.lerp(tp.clone().sub(o.g.position).divideScalar(Math.max(dt, .001)).setY(0), Math.min(1, dt * 8));
    const q = (g ? g.quaternion : flat(0, 0, 0).q).clone(), sp = v.length();
    if (sp > .5 && c < .5) q.premultiply(new T.Quaternion().setFromAxisAngle(new T.Vector3().crossVectors(UP(), v).normalize(), Math.min(.3, sp * .01)));
    if (c > .01) {
      q.premultiply(new T.Quaternion().setFromAxisAngle(right, .7 * c)); // ergue a ponta de lá: a face vira para quem joga
      q.premultiply(new T.Quaternion().setFromAxisAngle(toCam, .08 * c * Math.sin(now / 420))); // balança de leve
      q.multiply(new T.Quaternion().setFromAxisAngle(UP(), sh(31, 17) * .05 * tr));
    }
    o.g.position.lerp(tp, Math.min(1, dt * 14)); o.g.quaternion.slerp(q, Math.min(1, dt * 10));
    ghosts.forEach(x => x.scale.setScalar(x === g ? 1.06 + .04 * c : 1));
    if (drag.charge >= 1 && !drag.full) { drag.full = true; Domino2SFX.click(1); cam.shake = Math.max(cam.shake, .05); }
    if (drag.charge < .9) drag.full = false;
    if (!chargeRing) {
      chargeRing = new T.Mesh(new T.BufferGeometry(), mats.charge); chargeRing.renderOrder = 2; scene.add(chargeRing);
      glow = new T.Mesh(geo.glow, mats.glow); glow.renderOrder = 1; scene.add(glow);
    }
    chargeRing.visible = glow.visible = !!g && drag.charge > .02;
    if (chargeRing.visible) {
      const step = Math.round(drag.charge * 60);
      if (step !== ringStep) { ringStep = step; chargeRing.geometry.dispose(); chargeRing.geometry = new T.RingGeometry(1.3, 1.62, 64, 1, Math.PI / 2, Math.max(.01, drag.charge) * Math.PI * 2).rotateX(-Math.PI / 2); }
      chargeRing.position.copy(g.position).setY(.03);
      mats.charge.color.setHex(0xffd36a).lerp(new T.Color(0xff3b1f), drag.charge); mats.glow.color.copy(mats.charge.color);
      chargeRing.scale.setScalar(drag.charge >= 1 ? 1 + .06 * Math.sin(now / 70) : 1);
      glow.position.copy(g.position).setY(.02); glow.scale.setScalar(.7 + .4 * c);
      mats.glow.opacity = .1 + .45 * c + (drag.charge >= 1 ? .15 * Math.sin(now / 60) : 0);
    }
  }
  // a pedra chegou na mesa: som, tremor da câmera, onda no feltro e as outras pedras quicando (a onda sai da batida:
  // as de perto pulam primeiro e mais alto; na pancada até as mãos e o monte pulam)
  const SHAKE = { wood: 1, felt: 1, plastic: 1.7, metal: 1.25, concrete: .15 };
  function impact(src, f, coin) { // f: 1 assenta, 2 batida, 3 pancada, 4 a batida que fecha a mão; coin: bucha que tombou
    const fin = f === 4, big = f >= 3, bucha = !!coin && !fin; src.flip = null;
    Domino2SFX.land(f); if (coin) Domino2SFX.bucha();
    if (fin) { flick = { t0: performance.now() }; cheer(); if (replay) replay.hit = performance.now(); if (fxEl) { fxEl.classList.add('flash'); setTimeout(() => fxEl.classList.remove('flash'), 90); } }
    if (src.settle) { // caiu um pouco antes: escorrega até encostar, com um estalinho
      const p = src.settle; src.settle = null;
      setTarget(src, p, { force: true, arc: 0, ez: 'settle', dur: f > 1 ? 200 : 320 });
      setTimeout(() => Domino2SFX.tick(), f > 1 ? 110 : 220);
    }
    const now = clock(), R = f === 1 ? 3.2 : f === 2 && !bucha ? 9 : 60, A = f === 1 ? .05 : f === 2 ? .2 : fin ? 1.05 : .65;
    if (f > 1) { src.bump = mkBump(now, .03 * Math.min(f, 3), new T.Vector3(rand(-1, 1), 0, rand(-1, 1)).normalize(), rand(-.5, .5) * f, 0); kick = { t0: now, a: (fin ? .42 : f === 3 ? .22 : bucha ? .1 : .045) * (SHAKE[tbl.mat] ?? 1) }; }
    if (big) for (const l of chips) for (const c of l || []) if (c.t0 == null) c.hop = { t0: now + rand(0, 60), h: fin ? rand(.3, .55) : rand(.1, .28), w: rand(18, 26) };
    for (const o of objs.values()) {
      if (o === src || o.hold || o.shuf || (drag && o.key === drag.key)) continue;
      const dir = o.g.position.clone().sub(src.g.position).setY(0), d = dir.length(); if (d > R) continue;
      const fall = o.kind === 'line' ? 1 - d / R * .7 : fin ? .9 : f === 3 ? .6 : f === 2 && d < 7 ? .3 : 0; if (!fall) continue;
      if (d < 1e-3) dir.set(1, 0, 0); dir.normalize().applyAxisAngle(UP(), rand(-.6, .6));
      const wave = bucha && o.kind === 'line' && o.li != null && src.li != null, dl = wave ? Math.abs(o.li - src.li) : 0; // bucha: uma onda corre pela fileira, pedra por pedra
      const at = wave ? now + dl * 55 : now + d * rand(6, 12) + rand(0, 70), hop = wave ? .22 * Math.max(.35, 1 - dl * .06) : Math.random() < .25 ? 0 : A * fall * rand(.5, 1.5); // umas só balançam, sem sair do chão
      o.bump = mkBump(at, hop, dir, rand(.4, 1.2) * (fin ? 6 : f === 3 ? 4 : bucha ? 3 : f) * fall * (Math.random() < .2 ? -1 : 1), .04 * f * fall);
      if (o.kind === 'line' && f > 1 && o.base) { // depois da batida forte ela fica um pouco torta, mas encaixada no lugar
        const nd = o.nudge || (o.nudge = { x: 0, z: 0, yaw: 0 }), amt = fall * (big ? 1 : .45);
        nd.x += (dir.x * rand(0, .03) + rand(-.015, .015)) * amt; nd.z += (dir.z * rand(0, .03) + rand(-.015, .015)) * amt; nd.yaw += rand(-.035, .035) * amt;
        const m = Math.hypot(nd.x, nd.z); if (m > .04) { nd.x *= .04 / m; nd.z *= .04 / m; } nd.yaw = Math.max(-.04, Math.min(.04, nd.yaw));
        setTarget(o, nudged(o.base, nd), { force: true, arc: 0, ez: 'settle', dur: rand(300, 650), delay: at - now });
      }
    }
    if (f > 1) cam.shake = Math.max(cam.shake, (fin ? 1.15 : f === 3 ? .62 : bucha ? .3 : .16) * Math.sqrt(SHAKE[tbl.mat] ?? 1));
    const m = new T.Mesh(geo.ring, mats.ripple.clone()); m.position.copy(src.g.position).setY(.015); scene.add(m);
    ripples.push({ m, t0: now, dur: 380 + f * 160, size: f === 1 ? 1.2 : fin ? 16 : f * 3, op: f === 1 ? .35 : 1 });
    if (coin || fin) { const g2 = new T.Mesh(geo.ring, mats.ripple.clone()); g2.material.color.setHex(fin ? 0xff5a3c : 0xffc94a); g2.position.copy(m.position); scene.add(g2); ripples.push({ m: g2, t0: now, dur: fin ? 1400 : 800, size: fin ? 9 : 5, op: 1 }); } // bucha: anel dourado; final: vermelho
  }

  const cine = m => { if (fxEl) { fxEl.classList.toggle('on', !!m); fxEl.classList.toggle('rep', m === 'rep'); } };
  const setAmbient = on => { ambient = !!on; };

  // ---------- coisas jogadas na mesa (copo, garrafa, amendoim): voam de quem jogou, quebram e ficam lá até a próxima mão ----------
  const junk = [], flying = []; let junkM = null, tossSeen = null;
  function junkMats() {
    return junkM || (junkM = {
      glass: new T.MeshStandardMaterial({ color: 0xe6f6ff, transparent: true, opacity: .38, roughness: .05, metalness: .1, emissive: 0x2a3a44, depthWrite: false }),
      shard: new T.MeshStandardMaterial({ color: 0xeefaff, transparent: true, opacity: .75, roughness: .05, metalness: .4, emissive: 0x3a4a54, side: T.DoubleSide }),
      green: new T.MeshStandardMaterial({ color: 0x2a7a34, transparent: true, opacity: .8, roughness: .1, metalness: .2, emissive: 0x0c3014, side: T.DoubleSide }),
      beer: new T.MeshStandardMaterial({ color: 0xe8a820, transparent: true, opacity: .85, roughness: .2, emissive: 0x4a2c00 }),
      foam: new T.MeshStandardMaterial({ color: 0xfff8e8, roughness: .9, emissive: 0x3a3630 }),
      puddle: new T.MeshStandardMaterial({ color: 0x1a1004, transparent: true, opacity: .5, roughness: .08, metalness: .5, depthWrite: false }), // feltro molhado de cerveja: mancha escura e brilhante
      nut: new T.MeshStandardMaterial({ color: 0xc89050, roughness: .75, emissive: 0x2a1808 }),
      pinga: new T.MeshStandardMaterial({ color: 0xf0e0a0, transparent: true, opacity: .55, roughness: .1, emissive: 0x3a3010 }),
      coco: new T.MeshStandardMaterial({ color: 0x4f7a22, roughness: .55, emissive: 0x10200a }),
      milho: new T.MeshStandardMaterial({ roughness: .6, emissive: 0x2a2000, map: canvasTex(128, 64, (x, W, Hh) => { x.fillStyle = '#c89a1a'; x.fillRect(0, 0, W, Hh); for (let i = 0; i < 16; i++) for (let j = 0; j < 8; j++) { x.fillStyle = `hsl(${rand(44, 50)},85%,${rand(52, 62)}%)`; rrect(x, i * 8 + 1, j * 8 + 1, 6.5, 6.5, 2); x.fill(); } }) }),
      palha: new T.MeshStandardMaterial({ color: 0x9aa860, roughness: .8, side: T.DoubleSide, emissive: 0x1a2008 }),
      shardG: new T.TetrahedronGeometry(.22), nutG: new T.SphereGeometry(.2, 8, 6), puddleG: new T.CircleGeometry(1, 28).rotateX(-Math.PI / 2),
    });
  }
  const mk = (geom, m, x, y, z, parent) => { const o = new T.Mesh(geom, m); o.position.set(x, y, z); o.castShadow = true; parent.add(o); return o; };
  // ---------- desempenho: o que não se mexe no bar vira poucos desenhos (um por material) ----------
  function mergeStatic(root, skip) {
    const U = T.BufferGeometryUtils; if (!U) return;
    root.updateMatrixWorld(true);
    const inv = root.matrixWorld.clone().invert(), buckets = new Map();
    root.traverse(o => {
      if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || o.children.length || Array.isArray(o.material) || o.material.transparent) return;
      for (let a = o; a && a !== root; a = a.parent) if (skip.has(a)) return;
      const m = new T.Matrix4().multiplyMatrices(inv, o.matrixWorld); if (m.determinant() <= 0) return;
      const geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      if (!geo.attributes.normal || !geo.attributes.uv) return;
      for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k);
      geo.morphAttributes = {}; geo.clearGroups(); geo.applyMatrix4(m);
      const key = o.material.uuid + (o.castShadow ? 'c' : '') + (o.receiveShadow ? 'r' : '');
      if (!buckets.has(key)) buckets.set(key, { mat: o.material, cs: o.castShadow, rs: o.receiveShadow, geos: [], objs: [] });
      const b = buckets.get(key); b.geos.push(geo); b.objs.push(o);
    });
    for (const b of buckets.values()) {
      if (b.objs.length < 2) continue; // sozinho não ganha nada
      const geo = U.mergeBufferGeometries(b.geos); if (!geo) continue; // não juntou: deixa como estava
      b.objs.forEach(o => o.parent.remove(o));
      const mesh = new T.Mesh(geo, b.mat); mesh.castShadow = b.cs; mesh.receiveShadow = b.rs; root.add(mesh);
    }
  }
  // vira-lata caramelo: anda entre as mesas, senta, fareja e abana o rabo; quando algo quebra, corre para ver
  function makeDog(K, x, z, ways) { // ways: pontos do cenário por onde ele anda
    const { g, add, std } = K;
      const fur = std('#c8843a', { emissiveIntensity: .25, roughness: .9 }), light = std('#ecc89a', { emissiveIntensity: .25, roughness: .9 }), nose = std('#1a120c', { emissiveIntensity: 0, roughness: .3 });
      const d = new T.Group(), body = new T.Group(); d.position.set(x, FY, z); g.add(d); d.add(body); body.position.y = 7.5;
      const trunk = add(new T.SphereGeometry(3, 16, 12), fur, 0, 0, 0, body); trunk.scale.set(1, .95, 2.2);
      add(new T.SphereGeometry(2.6, 14, 10), light, 0, -.9, .6, body).scale.set(.85, .7, 1.9); // barriga clara
      const neck = add(new T.CylinderGeometry(1.4, 1.9, 4, 10), fur, 0, 2.2, 5.6, body); neck.rotation.x = .7;
      const head = new T.Group(); head.position.set(0, 4.2, 7.4); body.add(head);
      add(new T.SphereGeometry(2.2, 14, 12), fur, 0, 0, 0, head).scale.set(1, .95, 1.05);
      add(new T.CylinderGeometry(.9, 1.3, 2.6, 10), light, 0, -.6, 2.2, head).rotation.x = Math.PI / 2; // focinho
      add(new T.SphereGeometry(.5, 8, 6), nose, 0, -.35, 3.5, head);
      for (const sx of [-1, 1]) { add(new T.SphereGeometry(.32, 8, 6), nose, sx * .85, .5, 1.8, head); const ear = add(new T.ConeGeometry(.9, 2.2, 8), fur, sx * 1.4, 1.9, -.2, head); ear.rotation.z = -sx * .35; ear.rotation.x = -.2; }
      const legs = [];
      for (const [x, z] of [[-1.5, 3.6], [1.5, 3.6], [-1.5, -3.8], [1.5, -3.8]]) {
        const L = new T.Group(); L.position.set(x, -1, z); body.add(L);
        add(new T.CylinderGeometry(.75, .55, 6.4, 8), fur, 0, -3.2, 0, L); add(new T.SphereGeometry(.7, 8, 6), light, 0, -6.4, .3, L).scale.set(1, .6, 1.4);
        legs.push(L);
      }
      const tail = new T.Group(); tail.position.set(0, 1.4, -6.2); body.add(tail);
      const tl = add(new T.CylinderGeometry(.25, .6, 4.5, 8), fur, 0, 2, -.6, tail); tl.rotation.x = -.35;
      d.traverse(o => { if (o.isMesh) o.castShadow = true; });
      dog = { g: d, body, head, legs, tail, ph: 0, wag: 0, state: 'idle', until: 3000, to: null, sit: 0, speed: 9, ways };
    }
  // ---------- o cachorro ----------
  const DOGW = [[-30, 30], [0, 42], [30, 30], [42, 6], [32, -26], [10, -36], [-14, -36], [-38, -10], [-42, 10], [-20, 52], [24, 52]];
  function callDog() { // corre até a beira da mesa e senta olhando
    if (!dog) return; const p = dog.g.position, a = Math.atan2(p.x, p.z);
    dog.to = new T.Vector3(Math.sin(a) * 27, p.y, Math.cos(a) * 27); dog.state = 'walk'; dog.speed = 22; dog.look = true; dog.until = 0;
  }
  function dogStep(dt, rnow) {
    const D = dog; if (!D) return;
    const P = D.g.position;
    if (D.state === 'walk') {
      const v = D.to.clone().sub(P).setY(0), d = v.length(), want = Math.atan2(v.x, v.z);
      let da = want - D.g.rotation.y; da = Math.atan2(Math.sin(da), Math.cos(da)); D.g.rotation.y += da * Math.min(1, dt * 6);
      if (d < 1) { D.state = 'idle'; D.until = rnow + (D.look ? 5000 : 2000 + Math.random() * 5000); D.sitting = D.look || Math.random() < .5; if (D.look) D.g.rotation.y = Math.atan2(-P.x, -P.z); D.look = false; }
      else { P.addScaledVector(v.normalize(), Math.min(d, D.speed * dt)); D.ph += dt * D.speed * .9; }
    } else if (rnow > D.until) { // próximo ponto do mesmo lado do salão (assim não atravessa a mesa do jogo)
      const a0 = Math.atan2(P.x, P.z), opts = D.ways.filter(([x, z]) => { const da = Math.atan2(Math.sin(Math.atan2(x, z) - a0), Math.cos(Math.atan2(x, z) - a0)); return Math.abs(da) < 1.6 && Math.hypot(x - P.x, z - P.z) > 6; });
      const [x, z] = opts[Math.floor(Math.random() * opts.length)] || D.ways[0]; D.to = new T.Vector3(x, P.y, z); D.state = 'walk'; D.speed = 9; D.sitting = false;
    }
    const walking = D.state === 'walk', sw = walking ? Math.sin(D.ph) * (D.speed > 12 ? .9 : .55) : 0;
    D.legs.forEach((L, i) => { L.rotation.x = (i === 0 || i === 3 ? sw : -sw) + (D.sitting && i > 1 ? -1.25 : 0); });
    D.sit += ((D.sitting ? 1 : 0) - D.sit) * Math.min(1, dt * 5);
    D.body.rotation.x = -.42 * D.sit; D.body.position.y = 7.5 - 1.6 * D.sit + (walking ? Math.abs(Math.sin(D.ph)) * .35 : 0);
    D.wag += dt * (D.sitting ? 16 : 9); D.tail.rotation.y = Math.sin(D.wag) * (D.sitting ? .7 : .35);
    D.head.rotation.x = walking ? .15 : Math.sin(rnow / 900) * .12; D.head.rotation.y = walking ? 0 : Math.sin(rnow / 1700) * .4;
  }
  // ---------- fregueses em 3D de verdade (Quaternius, CC0): sentados, parados no balcão, bebendo, olhando a mesa e batendo palma na batida final ----------
  const PEOPLE = ['homem1', 'homem2', 'mulher1', 'homem3', 'mulher2', 'mulher3'], PK = 6.8; // PK: escala (modelo tem 4,84 de altura; gente aqui ~33)
  let pq, pq2, pv, UPW; // criados no loadPeople (o THREE só existe depois do mount)
  const boneTurn = (b, axis, ang) => { b.parent.getWorldQuaternion(pq2); pv.copy(axis).applyQuaternion(pq2.invert()).normalize(); b.quaternion.premultiply(pq.setFromAxisAngle(pv, ang)); }; // gira o osso em torno de um eixo do mundo
  function loadPeople() {
    if (!T.GLTFLoader || !T.SkeletonUtils) return; // sem o loader, ficam os bonecos
    pq = new T.Quaternion(); pq2 = new T.Quaternion(); pv = new T.Vector3(); UPW = new T.Vector3(0, 1, 0);
    const L = new T.GLTFLoader(), list = npcs.slice();
    peopleP = peopleP || Promise.all(PEOPLE.map(f => new Promise((ok, no) => L.load(`assets/npc/${f}.glb`, ok, null, no))));
    peopleP.then(gl => list.forEach((n, j) => {
      if (n.gl || !npcs.includes(n)) return; // já trocado, ou o cenário mudou
      const src = gl[j % gl.length], m = T.SkeletonUtils.clone(src.scene), w = new T.Group(), d = Math.hypot(n.x, n.z), k = DIM(d);
      w.position.copy(n.p.position); w.rotation.copy(n.p.rotation); n.p.parent.add(w); n.p.parent.remove(n.p);
      m.scale.setScalar(PK); if (n.seat) m.position.set(0, n.seat - 1.1 * PK, .6 * PK); w.add(m); // sentado: o quadril cai no assento
      m.traverse(o => {
        if (!o.isMesh) return; o.frustumCulled = false;
        const mt = o.material = o.material.clone(), nm = mt.name;
        if (nm === 'Shirt' || nm === 'Dress') mt.color.set(C(n.shirtC)); else if (nm === 'Pants') mt.color.set(C(n.i % 2 ? '#2a3040' : '#3a3026'));
        mt.color.multiplyScalar(.35 + .65 * k); mt.emissive = mt.color.clone(); mt.emissiveIntensity = .3 * k; mt.roughness = .8;
      });
      const mix = new T.AnimationMixer(m), clip = nm => src.animations.find(a => a.name.endsWith(nm)), sex = /mulher/.test(PEOPLE[j % PEOPLE.length]) ? 'Female_' : 'Man_';
      const base = mix.clipAction(clip(sex + (n.seat ? 'Sitting' : 'Idle'))); base.play(); if (n.seat) base.time = 1.2 + Math.random() * 5; else base.time = Math.random() * 4;
      const clap = n.seat ? null : mix.clipAction(clip(sex + 'Clapping'));
      const B = nm => m.getObjectByName(nm), bones = { head: B('Head'), neck: B('Neck'), ua: B('UpperArmR'), la: B('LowerArmR') };
      if (n.drink) { const gl2 = new T.Group(); bones.palm = B('PalmR'); bones.palm.add(gl2); w.updateMatrixWorld(true); const ws = bones.palm.getWorldScale(new T.Vector3()); gl2.scale.set(1 / ws.x, 1 / ws.y, 1 / ws.z); // o esqueleto tem escala própria: o copo volta ao tamanho do mundo
        n.fore.children.slice(-2).forEach(c => { const cc = c.clone(); cc.position.set(0, c.position.y - .7 + .2, .4); gl2.add(cc); }); }
      n.gl = { mix, base, clap, bones, w, rest: Object.fromEntries(Object.entries(bones).filter(([, b]) => b).map(([k2, b]) => [k2, b.quaternion.clone()])) };
    })).catch(e => console.warn('fregueses 3D não carregaram; ficam os bonecos', e));
  }
  function peopleStep(n, rdt, rnow, want) {
    const G = n.gl, b = G.bones;
    for (const k2 in G.rest) b[k2].quaternion.copy(G.rest[k2]); // o mixer só reescreve os ossos que a animação mexe
    if (G.clap) { const on = n.clapT > rnow; if (on && !G.clapping) { G.clap.reset().play(); G.clap.crossFadeFrom(G.base, .25, false); G.clapping = true; } else if (!on && G.clapping) { G.base.reset().play(); G.base.crossFadeFrom(G.clap, .4, false); G.clapping = false; } }
    G.mix.update(rdt);
    if (n.seat && G.base.time > 7) G.base.time = 1.2; // fica no trecho sentado (antes de levantar)
    n.yaw += (want - n.yaw) * Math.min(1, rdt * (n.lookT > rnow ? 9 : 2));
    G.w.updateMatrixWorld(true); boneTurn(b.neck, UPW, n.yaw * .4); boneTurn(b.head, UPW, n.yaw * .6);
    if (n.drink && n.dt < 2.6) { const e = Math.sin(Math.min(1, n.dt / 2.6) * Math.PI), side = pv.set(1, 0, 0).applyQuaternion(G.w.getWorldQuaternion(pq2)).clone(); boneTurn(b.ua, side, -1.1 * e); G.w.updateMatrixWorld(true); boneTurn(b.la, side, -1.5 * e); } // leva o copo à boca
  }
  function cheer() { for (const n of npcs) { n.lookT = performance.now() + rand(2200, 3200); n.clapT = performance.now() + rand(2600, 3600); } } // batida final: todo mundo olha e quem está em pé bate palma
  function toss(t) { // t: { seat, item, x, z } (x, z de -1 a 1 no feltro)
    if (!mounted) return;
    const M = junkMats(), g = new T.Group(), S = seat(t.seat);
    if (t.item === 'copo') { mk(new T.CylinderGeometry(.62, .5, 1.7, 16, 1, true), M.glass, 0, 0, 0, g); mk(new T.CylinderGeometry(.56, .48, 1.2, 16), M.beer, 0, -.2, 0, g); mk(new T.CylinderGeometry(.58, .56, .3, 16), M.foam, 0, .52, 0, g); }
    else if (t.item === 'garrafa') mk(new T.LatheGeometry([[0, -1.6], [.62, -1.6], [.66, -1.4], [.66, .4], [.3, 1], [.22, 1.7], [.26, 1.85], [0, 1.85]].map(([a, b]) => new T.Vector2(a, b)), 14), M.green, 0, 0, 0, g);
    else if (t.item === 'cachaca') { mk(new T.CylinderGeometry(.42, .34, 1, 8, 1, true), M.glass, 0, 0, 0, g); mk(new T.CylinderGeometry(.38, .33, .6, 8), M.pinga, 0, -.15, 0, g); } // copinho americano de pinga
    else if (t.item === 'coco') mk(new T.SphereGeometry(.9, 16, 12), M.coco, 0, 0, 0, g).scale.set(1, 1.15, 1);
    else if (t.item === 'milho') { const e = mk(new T.CapsuleGeometry ? new T.CapsuleGeometry(.36, 1.8, 4, 10) : new T.CylinderGeometry(.36, .3, 2.4, 10), M.milho, 0, 0, 0, g); e.rotation.z = Math.PI / 2; for (const a of [-.5, .5]) { const h = mk(new T.PlaneGeometry(.8, 1.6), M.palha, -1.3, 0, a * .4, g); h.rotation.set(0, a, Math.PI / 2); } } // espiga assada com a palha
    else for (let i = 0; i < 8; i++) mk(M.nutG, M.nut, rand(-.5, .5), rand(-.3, .3), rand(-.5, .5), g).scale.set(1, .75, 1.35);
    const from = S.c.clone().addScaledVector(S.out, 4); from.y = 4.5;
    g.position.copy(from); scene.add(g);
    flying.push({ g, item: t.item, from, to: new T.Vector3(Math.max(-1, Math.min(1, +t.x || 0)) * 13, .3, Math.max(-1, Math.min(1, +t.z || 0)) * 9.5), t0: clock(), dur: 620, spin: new T.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize() });
  }
  function shatter(f) {
    const M = junkMats(), now = clock(), P = f.to;
    if (f.item === 'coco' || f.item === 'milho') { // não quebra: quica e rola na mesa até parar
      Domino2SFX.smash(f.item); kick = { t0: now, a: (f.item === 'coco' ? .12 : .04) * (SHAKE[tbl.mat] ?? 1) }; cam.shake = Math.max(cam.shake, f.item === 'coco' ? .25 : .06);
      for (const n of npcs) n.lookT = performance.now() + rand(1200, 2200); callDog();
      f.g.position.copy(P); junk.push({ o: f.g, v: new T.Vector3(rand(-4, 4), rand(4, 7), rand(-4, 4)), av: new T.Vector3(rand(-8, 8), rand(-8, 8), rand(-8, 8)), r: f.item === 'coco' ? .95 : .4, solid: true });
      return;
    }
    scene.remove(f.g); Domino2SFX.smash(f.item);
    kick = { t0: now, a: (f.item === 'amendoim' ? .02 : .07) * (SHAKE[tbl.mat] ?? 1) }; cam.shake = Math.max(cam.shake, f.item === 'amendoim' ? .03 : .14);
    for (const n of npcs) n.lookT = performance.now() + rand(1200, 2200); // o bar inteiro olha
    if (f.item !== 'amendoim' || Math.random() < .5) callDog(); // e o cachorro vem ver
    const bits = f.item === 'amendoim' ? f.g.children.map(c => { const o = new T.Mesh(M.nutG, M.nut); o.scale.copy(c.scale); return o; }) : Array.from({ length: 18 }, () => new T.Mesh(M.shardG, f.item === 'garrafa' && Math.random() < .8 ? M.green : M.shard));
    for (const o of bits) {
      const a = rand(0, Math.PI * 2), sp = f.item === 'amendoim' ? rand(2, 6) : rand(3, 11);
      o.position.copy(P); o.scale.multiplyScalar(f.item === 'amendoim' ? 1 : rand(.5, 1.5)); o.castShadow = true; scene.add(o);
      junk.push({ o, v: new T.Vector3(Math.cos(a) * sp, rand(4, f.item === 'amendoim' ? 9 : 14), Math.sin(a) * sp), av: new T.Vector3(rand(-20, 20), rand(-20, 20), rand(-20, 20)), r: f.item === 'amendoim' ? .15 : .04 });
    }
    if (f.item !== 'amendoim') { // poça de cerveja se espalhando
      const o = new T.Mesh(M.puddleG, M.puddle); o.position.set(P.x, .015 + junk.length * .0004, P.z); o.rotation.y = rand(0, 6); o.scale.setScalar(.01); scene.add(o);
      junk.push({ o, grow: { t0: now, sx: rand(1.1, 1.9), sz: rand(.9, 1.5) } });
    }
    while (junk.length > 160) scene.remove(junk.shift().o); // shortcut: teto fixo de cacos na mesa; some o mais velho
  }
  function junkStep(dt, now) {
    for (let i = flying.length; i--;) {
      const f = flying[i], k = Math.min(1, (now - f.t0) / f.dur);
      f.g.position.lerpVectors(f.from, f.to, k); f.g.position.y += Math.sin(Math.PI * k) * 7; f.g.rotateOnAxis(f.spin, dt * 13);
      if (k >= 1) { flying.splice(i, 1); shatter(f); }
    }
    for (const j of junk) {
      if (j.grow) { const k = Math.min(1, (now - j.grow.t0) / 900), e = 1 - (1 - k) ** 3; j.o.scale.set(j.grow.sx * e, 1, j.grow.sz * e); if (k >= 1) j.grow = null; continue; }
      if (!j.v) continue;
      j.v.y -= 40 * dt; j.o.position.addScaledVector(j.v, dt); j.o.rotation.x += j.av.x * dt; j.o.rotation.y += j.av.y * dt; j.o.rotation.z += j.av.z * dt;
      if (Math.abs(j.o.position.x) > 14.6 || Math.abs(j.o.position.z) > 11.1) { j.v.x *= -.3; j.v.z *= -.3; j.o.position.x = Math.max(-14.6, Math.min(14.6, j.o.position.x)); j.o.position.z = Math.max(-11.1, Math.min(11.1, j.o.position.z)); } // a almofada segura
      if (j.o.position.y <= j.r && j.v.y < 0) {
        j.o.position.y = j.r; j.v.y *= -.25; j.v.x *= .45; j.v.z *= .45; j.av.multiplyScalar(.4);
        if (Math.abs(j.v.y) < 1.2) { j.v = null; if (!j.solid) { j.o.rotation.x = j.r > .1 ? 0 : Math.PI / 2 + rand(-.3, .3); j.o.rotation.z = 0; } else { j.o.rotation.x = 0; j.o.rotation.z = 0; } } // caco deita no feltro
      }
    }
  }
  function clearJunk() { for (const j of junk) scene.remove(j.o); for (const f of flying) scene.remove(f.g); junk.length = flying.length = 0; }
  return { supported, mount, show, sync, resetCam, setAmbient, toss, clearJunk, callDog, cheer, setLeve, setTest, setSkin, REVEAL, get active() { return active; } };
})();
