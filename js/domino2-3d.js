// ===== Dominó 2 em 3D (Three.js r128) =====
// Mesa de feltro com almofada de couro e moldura de madeira, sob uma luminária. Cada pedra é um objeto só, que desliza
// entre monte, mãos e fileira: a jogada voa em arco da mão de quem jogou e assenta (ou bate) na mesa.
// Pedras de marfim envernizado, pontos cavados e rebite de latão no meio.
// Sua mão fica em pé na sua frente: arraste até a ponta (solte rápido ou segure parado em cima para BATER) ou toque.
// Câmera: arraste a mesa para girar, botão direito/dois dedos para mover, roda/pinça para zoom, duplo clique volta.
const Domino2GL = (() => {
  let T, renderer, scene, camera, ray, wrap, canvas, raf = 0, mounted = false, active = false, lastT = 0;
  let H = {}, st = null, opt = {}, curHand = -1, n = 4, mySeat = 0, lastEvN = -1;
  const TH = .34, LEAN = .62;                    // espessura da pedra; inclinação da sua mão (rad)
  const objs = new Map();                         // chave -> { g, key, tile, kind, from, to, t0, delay, dur, arc, land, slam, wob, lift, hold }
  let geo, mats, ghosts = [], ripples = [], hoverKey = null, drag = null, ptr = null, plane = null, resetBtn = null;
  const faceMat = {};                             // id da pedra -> material da face (textura própria)
  const cam = { az: 0, el: null, zoom: 1, tx: 0, tz: .9, caz: 0, cel: null, czoom: 1, ctx: 0, ctz: .9, baseDist: 30, baseEl: 1.02, shake: 0, moved: false };
  const touches = new Map(); let gesture = null;
  // relógio das animações (anda mais devagar na câmera lenta da batida final), tremida da mesa, ambiente e placar
  let vnow = 0, slow = 1, replay = null, kick = null, lamp = null, neon = null, flick = null, fxEl = null, clockHands = null, tvT = null, ambient = true, trays = null, woodM = null, chipMat = null, chipGame = null;
  const smoke = [], chips = [], fans = [], clock = () => vnow;
  const TEAMC = ['#2f7de1', '#e0453a', '#2fa36b', '#c08a12'];         // mesmas cores do HUD
  const REVEAL = { per: 110, dur: 560, base: won => (won ? 2600 : 300) }; // vencedora: espera a batida final // fim da mão: as pedras viram uma a uma (o HUD conta junto)
  const PIP = { 0: [], 1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
    5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [-1, 0], [-1, 1], [1, -1], [1, 0], [1, 1]] };
  const idOf = t => Math.min(t[0], t[1]) * 10 + Math.max(t[0], t[1]);
  const same = (t, u) => (t[0] === u[0] && t[1] === u[1]) || (t[0] === u[1] && t[1] === u[0]);
  const C = h => new T.Color(h).convertSRGBToLinear();
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
      const g = x.createRadialGradient(W / 2, Hh / 2, Hh * .1, W / 2, Hh / 2, W * .62); g.addColorStop(0, '#fdf8ec'); g.addColorStop(1, '#eadfc6');
      x.fillStyle = g; x.fillRect(0, 0, W, Hh); grain(x, W, Hh, 2600, ['#b59f78', '#ffffff', '#cdbb94'], .09);
      // filete gravado perto da borda
      rrect(x, s * .08, s * .08, W - s * .16, Hh - s * .16, s * .1); x.lineWidth = s * .012; x.strokeStyle = 'rgba(120,96,60,.28)'; x.stroke();
    }
    // risca do meio (gravada)
    const [mx, my0] = U(0, -.37), my1 = U(0, .37)[1];
    if (bump) { x.strokeStyle = '#2a2a2a'; x.lineWidth = s * .05; x.beginPath(); x.moveTo(mx, my0); x.lineTo(mx, my1); x.stroke(); }
    else {
      x.lineCap = 'round'; x.lineWidth = s * .04;
      x.strokeStyle = 'rgba(255,255,255,.8)'; x.beginPath(); x.moveTo(mx + s * .012, my0 + s * .01); x.lineTo(mx + s * .012, my1 + s * .01); x.stroke();
      x.strokeStyle = '#5b4a33'; x.beginPath(); x.moveTo(mx, my0); x.lineTo(mx, my1); x.stroke();
    }
    // pontos cavados: anel claro embaixo, sombra em cima, fundo escuro com reflexo
    const R = .088 * s;
    [[t[0], -.5], [t[1], .5]].forEach(([v, cx]) => PIP[v].forEach(([px, pz]) => {
      const [X, Y] = U(cx + px * .26, pz * .26);
      if (bump) { const g = x.createRadialGradient(X, Y, 0, X, Y, R * 1.15); g.addColorStop(0, '#000'); g.addColorStop(.75, '#222'); g.addColorStop(1, '#808080'); x.fillStyle = g; x.beginPath(); x.arc(X, Y, R * 1.15, 0, 7); x.fill(); return; }
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
    return (faceMat[id] = new T.MeshPhysicalMaterial({ map, bumpMap: bump, bumpScale: .012, color: 0xffffff, roughness: .3, clearcoat: .7, clearcoatRoughness: .18, emissive: 0x000000 }));
  }
  function backTex() { // verso: marfim com um medalhão gravado (simétrico, porque o verso aparece espelhado)
    const t = canvasTex(512, 256, (x, W, Hh) => {
      const g = x.createRadialGradient(W / 2, Hh / 2, 10, W / 2, Hh / 2, W * .6); g.addColorStop(0, '#f8f1e1'); g.addColorStop(1, '#e3d6b9');
      x.fillStyle = g; x.fillRect(0, 0, W, Hh); grain(x, W, Hh, 2600, ['#b59f78', '#ffffff'], .09);
      x.strokeStyle = 'rgba(120,96,60,.3)'; x.lineWidth = 3; rrect(x, 20, 20, W - 40, Hh - 40, 24); x.stroke();
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
    const back = new T.MeshPhysicalMaterial({ map: backTex(), roughness: .32, clearcoat: .6, clearcoatRoughness: .2 });
    mats = {
      back, side: new T.MeshPhysicalMaterial({ color: C(0xeee4cd), roughness: .35, clearcoat: .6, clearcoatRoughness: .2 }),
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
  function seat(s) { // lugar de cada jogador em volta da mesa (rel = 0 é você, embaixo)
    const rel = (s - mySeat + n) % n, name = n === 2 ? ['me', 'top'][rel] : n === 3 ? ['me', 'right', 'left'][rel] : ['me', 'right', 'top', 'left'][rel];
    return {
      me: { c: new T.Vector3(0, 0, 8.4), out: new T.Vector3(0, 0, 1), along: new T.Vector3(1, 0, 0) },
      top: { c: new T.Vector3(0, 0, -9.2), out: new T.Vector3(0, 0, -1), along: new T.Vector3(-1, 0, 0) },
      right: { c: new T.Vector3(12.4, 0, -.6), out: new T.Vector3(1, 0, 0), along: new T.Vector3(0, 0, 1) },
      left: { c: new T.Vector3(-12.4, 0, -.6), out: new T.Vector3(-1, 0, 0), along: new T.Vector3(0, 0, -1) },
    }[name];
  }
  function standPose(s, j, c) { // pedra em pé na frente do dono, de costas para a mesa
    const S = seat(s), p = S.c.clone().addScaledVector(S.along, (j - (c - 1) / 2) * 1.1); p.y = 1.02;
    return basis(UP(), S.out.clone(), p);
  }
  function openPose(s, j, c) { // fim da mão: pedras deitadas, viradas para cima, na frente do dono
    const S = seat(s), p = S.c.clone().addScaledVector(S.out, -1.4).addScaledVector(S.along, (j - (c - 1) / 2) * 1.15);
    return basis(S.out.clone().negate(), UP(), p);
  }
  function myPose(j, c) { // sua mão: em pé, inclinada para trás, de frente para quem joga
    const sp = Math.min(1.16, 22 / Math.max(c, 1)), p = new T.Vector3((j - (c - 1) / 2) * sp, Math.cos(LEAN) + .04, 8.4);
    return basis(new T.Vector3(0, Math.cos(LEAN), -Math.sin(LEAN)), new T.Vector3(0, Math.sin(LEAN), Math.cos(LEAN)), p);
  }
  function pilePose(j) { // monte virado para baixo
    const b = n === 2 ? flat(-12.2 + Math.floor(j / 7) * 2.2, -3.6 + (j % 7) * 1.12, 0) : flat(-3.4 + (j % 7) * 1.12, -8.7 + Math.floor(j / 7) * 2.2, Math.PI / 2);
    b.q.multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), Math.PI)); b.p.y = TH; return b;
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
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
    canvas = renderer.domElement; canvas.className = 'd2-gl'; wrap.prepend(canvas);
    scene = new T.Scene(); scene.background = new T.Color(0x120c08);
    camera = new T.PerspectiveCamera(36, 1, .5, 420); ray = new T.Raycaster(); ptr = new T.Vector2(); plane = new T.Plane(UP(), -.9);
    // luz: luminária quente em cima, céu suave e um contorno frio
    scene.add(new T.HemisphereLight(0xfff3e0, 0x3a2614, .55));
    lamp = new T.SpotLight(0xffeccc, 1.6, 80, .6, .5, 1); lamp.position.set(-7, 29, 10); // um pouco de lado: a sombra aparece
    lamp.castShadow = true; lamp.shadow.mapSize.set(2048, 2048); lamp.shadow.bias = -.0004; lamp.shadow.radius = 4; scene.add(lamp, lamp.target);
    const rim = new T.DirectionalLight(0xbcd2ff, .25); rim.position.set(10, 12, 18); scene.add(rim);
    buildGeo(); buildTable(); bindInput();
    resetBtn = document.createElement('button'); resetBtn.className = 'd2-cam'; resetBtn.title = 'Voltar a câmera (ou dê dois cliques na mesa)'; resetBtn.textContent = '🎥';
    resetBtn.onclick = resetCam; wrap.appendChild(resetBtn);
    fxEl = document.createElement('div'); fxEl.className = 'd2-fx'; fxEl.innerHTML = '<i></i><i></i><u></u>'; wrap.appendChild(fxEl); // vinheta + faixas de cinema
    new ResizeObserver(resize).observe(wrap); resize();
    mounted = true; return true;
  }
  function buildTable() {
    // feltro
    const ft = feltTex(), felt = new T.Mesh(new T.PlaneGeometry(30, 23), new T.MeshStandardMaterial({ map: ft, bumpMap: ft, bumpScale: .02, roughness: 1 }));
    felt.rotation.x = -Math.PI / 2; felt.receiveShadow = true; scene.add(felt);
    // almofada de couro em volta (anel arredondado e estofado)
    const ring = roundRect(33.8, 26.8, 2.2); ring.holes.push(roundRect(29.6, 22.6, 1.1));
    const lt = leatherTex();
    const rail = new T.Mesh(new T.ExtrudeGeometry(ring, { depth: .3, bevelEnabled: true, bevelThickness: .42, bevelSize: .38, bevelSegments: 6, curveSegments: 16 }),
      new T.MeshPhysicalMaterial({ map: lt, bumpMap: lt, bumpScale: .03, roughness: .48, clearcoat: .5, clearcoatRoughness: .3 }));
    rail.rotation.x = -Math.PI / 2; rail.position.y = .12; rail.castShadow = rail.receiveShadow = true; scene.add(rail);
    // duas costuras de linha clara em cima do couro (um ponto a cada 0,3)
    const thread = new T.MeshStandardMaterial({ color: C(0xe9d4a4), roughness: .7 }), stitch = new T.BoxGeometry(.19, .025, .05), d = new T.Object3D();
    for (const [w, h, r] of [[33.8 - .7, 26.8 - .7, 1.85], [29.6 + .7, 22.6 + .7, 1.45]]) {
      const pts = roundRect(w, h, r).getSpacedPoints(Math.round((w + h) * 2 / .3)), m = new T.InstancedMesh(stitch, thread, pts.length - 1);
      for (let i = 0; i < pts.length - 1; i++) { const a = pts[i], b = pts[i + 1]; d.position.set((a.x + b.x) / 2, .855, -(a.y + b.y) / 2); d.rotation.set(0, Math.atan2(b.y - a.y, b.x - a.x), 0); d.updateMatrix(); m.setMatrixAt(i, d.matrix); }
      scene.add(m);
    }
    // moldura e saia de madeira (borda larga e arredondada, verniz brilhante)
    const wt = woodTex(); woodM = new T.MeshPhysicalMaterial({ map: wt, bumpMap: wt, bumpScale: .03, roughness: .45, clearcoat: 1, clearcoatRoughness: .12 });
    const frame = new T.Mesh(new T.ExtrudeGeometry(roundRect(38.4, 31.4, 3.6), { depth: 1.1, bevelEnabled: true, bevelThickness: .4, bevelSize: .45, bevelSegments: 6, curveSegments: 20 }), woodM);
    frame.rotation.x = -Math.PI / 2; frame.position.y = -1.55; frame.receiveShadow = frame.castShadow = true; scene.add(frame); // sólida: a sombra no chão sai cheia
    geo.chip = new T.CylinderGeometry(.36, .36, .1, 28); chipMat = TEAMC.map(chipMats);
    // fumaça de cigarro bem fraquinha subindo na luz da luminária
    const smT = canvasTex(256, 256, (x, W) => { for (let i = 0; i < 14; i++) { const X = rand(60, 196), Y = rand(60, 196), r = rand(30, 70), g = x.createRadialGradient(X, Y, 0, X, Y, r); g.addColorStop(0, 'rgba(235,228,215,.5)'); g.addColorStop(1, 'rgba(235,228,215,0)'); x.fillStyle = g; x.fillRect(0, 0, W, W); } });
    for (let i = 0; i < 7; i++) { const s = new T.Sprite(new T.SpriteMaterial({ map: smT, transparent: true, opacity: 0, depthWrite: false })); s.userData = { ph: rand(0, 1), sp: rand(.035, .06), x: rand(-9, 9), z: rand(-6, 5), sc: rand(7, 12), rot: rand(-.1, .1) }; scene.add(s); smoke.push(s); }
    // pés de madeira e o chão
    const legM = woodM;
    for (const [x, z] of [[-15, -11.5], [15, -11.5], [-15, 11.5], [15, 11.5]]) { const l = new T.Mesh(new T.CylinderGeometry(.7, .5, 14, 16), legM); l.position.set(x, -8.6, z); l.castShadow = true; scene.add(l); }
    buildBar();
  }
  // ---------- o boteco em volta: sala pequena e cheia de detalhe, tudo pintado em canvas e formas simples ----------
  // (sem luz nem sombra a mais: o "brilho" vem pintado nas texturas, então continua leve)
  function buildBar() {
    const FY = -15.6, H = 50, CY = FY + H, X = 62, ZB = -50, ZF = 56, g = new T.Group(), V = (x, y, z) => new T.Vector3(x, y, z);
    const add = (geom, m, x, y, z, parent = g) => { const o = new T.Mesh(geom, m); o.position.set(x, y, z); parent.add(o); return o; };
    const lit = (map, k, x = {}) => new T.MeshStandardMaterial({ map, emissive: 0xffffff, emissiveMap: map, emissiveIntensity: k, roughness: .85, ...x });
    const std = (c, x = {}) => new T.MeshStandardMaterial({ color: C(c), roughness: .6, emissive: C(c), emissiveIntensity: .35, ...x });
    const glowT = canvasTex(128, 128, (x, W) => { const r = x.createRadialGradient(W / 2, W / 2, 0, W / 2, W / 2, W / 2); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(.22, 'rgba(255,255,255,.35)'); r.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = r; x.fillRect(0, 0, W, W); });
    const gms = {}, glow = (x, y, z, s, op = .45, col = 0xffb46a) => { const k = op + '|' + col, sp = new T.Sprite(gms[k] || (gms[k] = new T.SpriteMaterial({ map: glowT, color: col, transparent: true, opacity: op, blending: T.AdditiveBlending, depthWrite: false }))); sp.position.set(x, y, z); sp.scale.setScalar(s); g.add(sp); return sp; };
    const noise = (x, W, Hh, n, a) => { for (let i = 0; i < n; i++) { x.fillStyle = `rgba(${Math.random() < .5 ? '0,0,0' : '255,235,200'},${rand(a * .3, a)})`; x.fillRect(rand(0, W), rand(0, Hh), rand(1, 5), rand(1, 5)); } };
    const pool = (x, cx, cy, r, a = .55) => { const p = x.createRadialGradient(cx, cy, 4, cx, cy + r * .2, r); p.addColorStop(0, `rgba(255,190,110,${a})`); p.addColorStop(.45, `rgba(255,150,70,${a * .3})`); p.addColorStop(1, 'rgba(255,140,60,0)'); x.fillStyle = p; x.fillRect(cx - r, cy - r, r * 2, r * 2.2); };
    const gold = new T.MeshStandardMaterial({ color: C(0xb08a3e), metalness: .8, roughness: .35, emissive: C(0x3a2a10), emissiveIntensity: .7 });
    const dark = std(0x141010, { emissiveIntensity: .2, roughness: .4 }), bulbM = new T.MeshBasicMaterial({ color: 0xffe2a8 });

    // chão de ladrilho hidráulico (roseta clássica), com a sombra macia da mesa
    const tileT = canvasTex(512, 512, (x, W) => {
      const s = W / 4;
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
        const X = i * s, Y = j * s; x.fillStyle = '#8a3b22'; x.fillRect(X, Y, s, s);
        x.fillStyle = '#d9c7a3'; x.beginPath(); x.moveTo(X + s / 2, Y + 8); x.lineTo(X + s - 8, Y + s / 2); x.lineTo(X + s / 2, Y + s - 8); x.lineTo(X + 8, Y + s / 2); x.fill();
        x.fillStyle = '#1d1a17'; for (const [a, b] of [[0, 0], [s, 0], [0, s], [s, s]]) { x.beginPath(); x.arc(X + a, Y + b, s * .28, 0, 7); x.fill(); }
        x.fillStyle = '#8a3b22'; x.beginPath(); x.arc(X + s / 2, Y + s / 2, s * .16, 0, 7); x.fill(); x.fillStyle = '#d9c7a3'; x.beginPath(); x.arc(X + s / 2, Y + s / 2, s * .06, 0, 7); x.fill();
        x.strokeStyle = 'rgba(0,0,0,.6)'; x.lineWidth = 2; x.strokeRect(X, Y, s, s);
      }
      noise(x, W, W, 5000, .12); x.fillStyle = 'rgba(20,10,5,.35)'; x.fillRect(0, 0, W, W); // gasto e encardido
    });
    tileT.wrapS = tileT.wrapT = T.RepeatWrapping; tileT.repeat.set(9, 8);
    const floor = add(new T.PlaneGeometry(X * 2, ZF - ZB), lit(tileT, .22, { roughness: .5 }), 0, FY, (ZF + ZB) / 2); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
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
    const wall = (map, w, x, z, ry) => { const m = add(new T.PlaneGeometry(w, H), lit(map, .4, { roughness: .95 }), x, FY + H / 2, z); m.rotation.y = ry; return m; };
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
    shelfY.forEach((y, r) => { add(board, woodM, 0, FY + y - .25, ZB + 1.8); for (let i = 0; i < nB; i++) { const s = rand(.8, 1.15); bottles.setMatrixAt(r * nB + i, mm.makeScale(s, s * rand(.85, 1.1), s).setPosition(-25 + i * 3.05 + rand(-.4, .4), FY + y, ZB + 1.8 + rand(-.5, .5))); bottles.setColorAt(r * nB + i, cols[Math.floor(rand(0, cols.length))]); } });
    g.add(bottles);
    const neonT = canvasTex(1024, 256, (x, W, Hh) => { x.font = 'italic 700 120px Georgia, serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.shadowColor = '#ff5a3c'; x.shadowBlur = 40; x.fillStyle = '#ffd2b8'; for (let i = 0; i < 3; i++) x.fillText('Dominó Bar', W / 2, Hh / 2); });
    neon = add(new T.PlaneGeometry(30, 7.5), new T.MeshBasicMaterial({ map: neonT, transparent: true, blending: T.AdditiveBlending, depthWrite: false }), 0, FY + 45, ZB + .4); glow(0, FY + 45, ZB + 2, 34, .25, 0xff6a4a);
    const ZC = ZB + 9;
    add(new T.BoxGeometry(58, 16.5, 7), woodM, 0, FY + 8.25, ZC);
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
    add(new T.BoxGeometry(.8, 18, 20), woodM, X - .4, FY + 30, -8); add(new T.PlaneGeometry(17, 15), lit(win, .8), X - .85, FY + 30, -8).rotation.y = -Math.PI / 2; glow(X - 3, FY + 30, -8, 26, .18, 0x6a8aff);
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
    [[0, 0, 0], [7.2, 0, .3], [3.4, 4.05, .2], [.4, 0, 5.2]].forEach(([dx, dy, dz]) => { const c = add(crG, crM, -X + 5 + dx, FY + 2 + dy, ZF - 6 - dz); c.rotation.y = rand(-.1, .1); });

    // mesas de plástico amarelas (de boteco) e cadeiras em volta da mesa de jogo
    const yel = std(0xe8b81a, { emissiveIntensity: .3, roughness: .5 }), legG = new T.CylinderGeometry(.18, .18, 1, 6);
    const chair = (x, z, ry, m) => {
      const c = new T.Group(); c.position.set(x, FY, z); c.rotation.y = ry; g.add(c);
      add(new T.BoxGeometry(4.2, .45, 4.2), m, 0, 9.5, 0, c); add(new T.BoxGeometry(4.2, 5, .4), m, 0, 12.6, -2, c);
      for (const [a, b] of [[-1.8, -1.8], [1.8, -1.8], [-1.8, 1.8], [1.8, 1.8]]) { const l = add(legG, m, a, 4.75, b, c); l.scale.y = 9.5; }
    };
    for (const [x, z] of [[-42, 30], [42, -24]]) {
      add(new T.BoxGeometry(10, .5, 10), yel, x, FY + 14, z); for (const [a, b] of [[-4.5, -4.5], [4.5, -4.5], [-4.5, 4.5], [4.5, 4.5]]) add(legG, yel, x + a, FY + 7, z + b).scale.y = 14;
      chair(x - 8, z, Math.PI / 2, yel); chair(x + 8, z, -Math.PI / 2, yel); beer(x - 1.5, FY + 14.25, z + 1); beer(x + 2, FY + 14.25, z - 1.5);
    }
    const woodChair = std(0x4a2a14, { emissiveIntensity: .3 });
    chair(-25, 0, Math.PI / 2, woodChair); chair(25, 0, -Math.PI / 2, woodChair); chair(0, -21, 0, woodChair);

    // varal de lâmpadas em volta, rente às paredes (no meio do teto atrapalharia a vista da mesa), e dois ventiladores
    const sag = (a, b, s, n) => Array.from({ length: n }, (_, i) => { const t = i / (n - 1); return a.clone().lerp(b, t).setY(a.y - s * 4 * t * (1 - t)); });
    const cordM = new T.LineBasicMaterial({ color: 0x050302 }), bulbs = [], y0 = CY - 3, m = 4;
    for (const [a, b] of [[V(-X + m, y0, ZB + m), V(X - m, y0, ZB + m)], [V(-X + m, y0, ZB + m), V(-X + m, y0, ZF - m)], [V(X - m, y0, ZB + m), V(X - m, y0, ZF - m)], [V(-X + m, y0, ZF - m), V(X - m, y0, ZF - m)]]) {
      const pts = sag(a, b, 4, 24); g.add(new T.Line(new T.BufferGeometry().setFromPoints(pts), cordM)); for (let i = 1; i < 23; i += 2) bulbs.push(pts[i].clone().setY(pts[i].y - .6));
    }
    const bi = new T.InstancedMesh(new T.SphereGeometry(.45, 8, 6), bulbM, bulbs.length);
    bulbs.forEach((p, i) => { bi.setMatrixAt(i, mm.makeTranslation(p.x, p.y, p.z)); glow(p.x, p.y, p.z, 5, .45); }); g.add(bi);
    for (const x of [-42, 42]) {
      add(new T.CylinderGeometry(.2, .2, 3, 6), dark, x, CY - 1.5, 6); add(new T.CylinderGeometry(1.3, 1, 1.4, 14), gold, x, CY - 3.6, 6);
      const f = new T.Group(); f.position.set(x, CY - 4, 6); for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2, b = add(new T.BoxGeometry(8, .15, 1.8), woodChair, Math.cos(a) * 4.8, 0, -Math.sin(a) * 4.8, f); b.rotation.y = a; }
      g.add(f); fans.push(f);
    }
    scene.add(g);
    scene.background = new T.Color(0x0a0604); scene.fog = new T.Fog(0x0a0604, 60, 170);
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
  const chipSlot = (N, side, k) => { const t = TRAY(N)[side], s = t.x < 0 ? -1 : 1; return new T.Vector3(t.x - s * .45 + (Math.min(k, 5) - 2.5) * .8, TY + .075 + Math.max(0, k - 5) * .1, t.z); }; // passou de 6: empilha
  function plateTex(hex, big, small) {
    return canvasTex(160, 200, (x, W, Hh) => {
      x.fillStyle = '#1a0d06'; x.fillRect(0, 0, W, Hh); x.fillStyle = hex; rrect(x, 10, 10, W - 20, Hh - 20, 18); x.fill();
      x.strokeStyle = 'rgba(255,255,255,.6)'; x.lineWidth = 4; rrect(x, 18, 18, W - 36, Hh - 36, 12); x.stroke();
      x.fillStyle = '#fff'; x.textAlign = 'center'; x.font = '700 26px Georgia, serif'; x.fillText(small, W / 2, 70); x.font = '900 84px Georgia, serif'; x.fillText(big, W / 2, 160);
    });
  }
  function buildTrays(N, teams) {
    const g = new T.Group(), brass = new T.MeshPhysicalMaterial({ color: C(0xc9a24a), metalness: .8, roughness: .3 }), bedM = new T.MeshStandardMaterial({ color: C(0x2a140a), roughness: .95 });
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
    if (!mounted) return;
    st = state; opt = o2 || {}; n = st.players.length; mySeat = opt.mySeat >= 0 ? opt.mySeat : 0;
    const want = new Map(), ev = st.ev || {}, deal = st.hand !== curHand, lp = st.lastPlay || {}, freshEv = ev.n !== lastEvN; curHand = st.hand;
    const won = st.phase !== 'play' && st.last && st.last.kind !== 'tranca';
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
          if (fin || (dbl && f > 1)) { // bucha batida e batida final têm coreografia própria (moveStep)
            o.t0 = null; o.settle = null; o.mv = { t0: clock(), from: { p: o.g.position.clone(), q: o.g.quaternion.clone() }, to: pose, f, coin: dbl, fin };
            if (fin) { replay = { p: pose.p.clone(), t0: performance.now() }; cine('on'); }
          } else {
            if (f === 3 && !charged) { const ax = new T.Vector3().crossVectors(UP(), dir); o.flip = ax.lengthSq() > 1e-6 ? ax.normalize() : new T.Vector3(1, 0, 0); } // pancada: cambalhota no ar
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
    const can = opt.can || [];
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
  const playable = o => o && o.kind === 'me' && opt.myTurn && (opt.can || []).some(m => same(m.t, o.tile));
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
    for (const o of objs.values()) {
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
        if (k >= 1 && (now - o.t0 - o.delay) >= o.dur) { o.t0 = null; if (o.land) { const f = o.land; o.land = 0; impact(o, f); } }
      }
      if (o.kind === 'me') { // sua mão: a jogável respira de leve; sobe mais com o mouse em cima e quando está escolhida
        const want = opt.sel && same(opt.sel, o.tile) ? .75 : o.key === hoverKey && o.playable ? .45 : o.playable ? .16 + .05 * Math.sin(now / 380 + o.g.position.x) : 0;
        o.lift += (want - o.lift) * Math.min(1, dt * 10);
        if (o.t0 == null) o.g.position.y = o.to.p.y + o.lift;
      }
      if (o.bump) bumpStep(o, dt, now);
      const h = o.g.userData.halo; if (h) { h.visible = !!o.playable && !o.shuf; if (h.visible) h.material.opacity = (o.key === hoverKey ? .95 : .55) + .25 * Math.sin(now / 300); }
    }
    for (const o of objs.values()) shade(o);
    for (const g of ghosts) g.material.opacity = .22 + .14 * Math.sin(now / 220);
    if (!drag?.moved && chargeRing) chargeRing.visible = glow.visible = false;
    push += ((drag?.moved ? easeOut(drag.charge) : 0) - push) * Math.min(1, dt * 5);
    ripples = ripples.filter(r => { const k = (now - r.t0) / r.dur; if (k >= 1) { scene.remove(r.m); return false; } r.m.scale.setScalar(1 + k * r.size); r.m.material.opacity = .35 * (1 - k) * r.op; return true; });
    chipStep(now);
    if (kick) { // a mesa toda dá um tranco para baixo e balança um tiquinho
      const s = (now - kick.t0) / 1000, e = Math.exp(-s * 6);
      if (s > 2.5) { kick = null; scene.position.set(0, 0, 0); scene.rotation.set(0, 0, 0); }
      else if (s >= 0) { scene.position.y = -kick.a * e * Math.sin(s * 40); scene.rotation.x = kick.a * .09 * e * Math.sin(s * 33 + 1); scene.rotation.z = kick.a * .1 * e * Math.sin(s * 29); }
    }
    // ambiente: a luminária balança devagar e a fumaça sobe na luz
    const ks = kick ? (now - kick.t0) / 1000 : 0, sw = kick && ks > 0 ? kick.a * 9 * Math.exp(-ks * 2.2) * Math.sin(ks * 5) : 0; // na pancada a luminária balança
    lamp.position.x = -7 + Math.sin(rnow / 2300) * .6 + sw; lamp.position.z = 10 + Math.sin(rnow / 3100) * .4 - sw * .4;
    const fl = flick && rnow - flick.t0 < 800; if (flick && !fl) flick = null; // na batida final a luz falha
    lamp.intensity = fl ? (Math.random() < .45 ? .15 : 2) : 1.6;
    if (neon) neon.material.opacity = fl ? Math.random() * .3 : Math.random() < .004 ? .35 : .9 + .1 * Math.sin(rnow / 90); // neon velho piscando de vez em quando
    for (const fan of fans) fan.rotation.y += rdt * 2.2;
    if (clockHands) { const d = new Date(), mi = d.getMinutes() + d.getSeconds() / 60; clockHands[1].rotation.z = -mi / 60 * Math.PI * 2; clockHands[0].rotation.z = -((d.getHours() % 12) + mi / 60) / 12 * Math.PI * 2; tvT.offset.x = .2 + .2 * Math.sin(rnow / 4000); }
    for (const s of smoke) {
      const u = s.userData; u.ph = (u.ph + rdt * u.sp) % 1;
      s.position.set(u.x + Math.sin(u.ph * 6 + u.sc) * 1.5, 3 + u.ph * 9, u.z); s.scale.setScalar(u.sc * (.7 + u.ph * .6));
      s.material.opacity = ambient ? .05 * Math.sin(Math.PI * u.ph) : 0; s.material.rotation += u.rot * rdt;
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
  // coreografias: bucha (sobe em pé, gira como pião, desce e tomba deitando no lugar) e batida final (sobe alto, treme e desce de uma vez)
  function moveStep(o, now) {
    const m = o.mv, P = m.to.p, t = now - m.t0, XA = new T.Vector3(1, 0, 0);
    const X = XA.clone().applyQuaternion(m.to.q).setY(0).normalize(), ax = new T.Vector3().crossVectors(X, UP()).normalize(), A = P.clone().addScaledVector(X, -1); // A: a ponta onde ela se apoia
    const stand = th => ({ p: A.clone().add(X.clone().applyAxisAngle(ax, th)), q: new T.Quaternion().setFromAxisAngle(ax, th).multiply(m.to.q) }); // th = 90°: em pé; 0: deitada no lugar
    const T1 = m.fin ? 420 : 340, T2 = T1 + (m.fin ? 700 : 520), T3 = T2 + (m.coin ? (m.fin ? 190 : 260) : 110);
    let p = null, q = null;
    if (m.coin) {
      const up = stand(Math.PI / 2), hi = m.fin ? 5 : 3;
      if (t < T1) { const k = EZ.settle(t / T1); p = m.from.p.clone().lerp(up.p.clone().setY(up.p.y + hi), k); p.y += Math.sin(Math.PI * k) * 1.2; q = m.from.q.clone().slerp(up.q, k); }
      else if (t < T2) { const k = (t - T1) / (T2 - T1); p = up.p.clone().setY(up.p.y + hi * (1 - EZ.settle(k))); q = new T.Quaternion().setFromAxisAngle(UP(), (m.fin ? 6 : 4) * Math.PI * EZ.settle(k)).multiply(up.q); }
      else if (t < T3) { const k = (t - T2) / (T3 - T2), st2 = stand(Math.PI / 2 * (1 - k * k)); p = st2.p; q = st2.q; }
    } else {
      const hov = P.clone().setY(P.y + 4.6), tq = new T.Quaternion().setFromAxisAngle(new T.Vector3(Math.cos(cam.caz), 0, -Math.sin(cam.caz)), .95).multiply(m.to.q); // no ar, mostra a face para quem olha
      if (t < T1) { const k = EZ.settle(t / T1); p = m.from.p.clone().lerp(hov, k); q = m.from.q.clone().slerp(tq, k); }
      else if (t < T2) { const k = (t - T1) / (T2 - T1), j = () => rand(-1, 1) * .08 * k * k; p = hov.clone().add(new T.Vector3(j(), j() + .45 * Math.sin(k * Math.PI), j())); q = tq.clone().multiply(new T.Quaternion().setFromEuler(new T.Euler(j(), j(), j()))); }
      else if (t < T3) { const k = (t - T2) / (T3 - T2); p = hov.clone().lerp(P, k * k * k); q = tq.clone().slerp(m.to.q, k); }
    }
    if (!p) { o.mv = null; o.bump = null; o.g.position.copy(P); o.g.quaternion.copy(m.to.q); o.to = m.to; o.t0 = null; impact(o, m.f, m.coin); return false; }
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
  function impact(src, f, coin) { // f: 1 assenta, 2 batida, 3 pancada, 4 a batida que fecha a mão; coin: bucha que tombou
    const fin = f === 4, big = f >= 3, bucha = !!coin && !fin; src.flip = null;
    Domino2SFX.land(f); if (coin) Domino2SFX.bucha();
    if (fin) { flick = { t0: performance.now() }; if (replay) replay.hit = performance.now(); if (fxEl) { fxEl.classList.add('flash'); setTimeout(() => fxEl.classList.remove('flash'), 90); } }
    if (src.settle) { // caiu um pouco antes: escorrega até encostar, com um estalinho
      const p = src.settle; src.settle = null;
      setTarget(src, p, { force: true, arc: 0, ez: 'settle', dur: f > 1 ? 200 : 320 });
      setTimeout(() => Domino2SFX.tick(), f > 1 ? 110 : 220);
    }
    const now = clock(), R = f === 1 ? 3.2 : f === 2 && !bucha ? 9 : 60, A = f === 1 ? .05 : f === 2 ? .2 : fin ? 1.05 : .65;
    if (f > 1) { src.bump = mkBump(now, .03 * Math.min(f, 3), new T.Vector3(rand(-1, 1), 0, rand(-1, 1)).normalize(), rand(-.5, .5) * f, 0); kick = { t0: now, a: fin ? .42 : f === 3 ? .22 : bucha ? .1 : .045 }; }
    if (big) for (const l of chips) for (const c of l || []) if (c.t0 == null) c.hop = { t0: now + rand(0, 60), h: fin ? rand(.3, .55) : rand(.1, .28), w: rand(18, 26) };
    for (const o of objs.values()) {
      if (o === src || o.hold || o.shuf || (drag && o.key === drag.key)) continue;
      const dir = o.g.position.clone().sub(src.g.position).setY(0), d = dir.length(); if (d > R) continue;
      const fall = o.kind === 'line' ? 1 - d / R * .7 : fin ? .9 : f === 3 ? .6 : f === 2 && d < 7 ? .3 : 0; if (!fall) continue;
      if (d < 1e-3) dir.set(1, 0, 0); dir.normalize().applyAxisAngle(UP(), rand(-.6, .6));
      const wave = bucha && o.kind === 'line' && o.li != null && src.li != null, dl = wave ? Math.abs(o.li - src.li) : 0; // bucha: uma onda corre pela fileira, pedra por pedra
      const at = wave ? now + dl * 55 : now + d * rand(6, 12) + rand(0, 70), hop = wave ? .45 * Math.max(.35, 1 - dl * .05) : Math.random() < .25 ? 0 : A * fall * rand(.5, 1.5); // umas só balançam, sem sair do chão
      o.bump = mkBump(at, hop, dir, rand(.4, 1.2) * (fin ? 6 : f === 3 ? 4 : bucha ? 3 : f) * fall * (Math.random() < .2 ? -1 : 1), .04 * f * fall);
      if (o.kind === 'line' && f > 1 && o.base) { // depois da batida forte ela fica um pouco torta, mas encaixada no lugar
        const nd = o.nudge || (o.nudge = { x: 0, z: 0, yaw: 0 }), amt = fall * (big ? 1 : .45);
        nd.x += (dir.x * rand(0, .03) + rand(-.015, .015)) * amt; nd.z += (dir.z * rand(0, .03) + rand(-.015, .015)) * amt; nd.yaw += rand(-.035, .035) * amt;
        const m = Math.hypot(nd.x, nd.z); if (m > .04) { nd.x *= .04 / m; nd.z *= .04 / m; } nd.yaw = Math.max(-.04, Math.min(.04, nd.yaw));
        setTarget(o, nudged(o.base, nd), { force: true, arc: 0, ez: 'settle', dur: rand(300, 650), delay: at - now });
      }
    }
    if (f > 1) cam.shake = Math.max(cam.shake, fin ? 1.15 : f === 3 ? .62 : bucha ? .3 : .16);
    const m = new T.Mesh(geo.ring, mats.ripple.clone()); m.position.copy(src.g.position).setY(.015); scene.add(m);
    ripples.push({ m, t0: now, dur: 380 + f * 160, size: f === 1 ? 1.2 : fin ? 16 : f * 3, op: f === 1 ? .35 : 1 });
    if (coin || fin) { const g2 = new T.Mesh(geo.ring, mats.ripple.clone()); g2.material.color.setHex(fin ? 0xff5a3c : 0xffc94a); g2.position.copy(m.position); scene.add(g2); ripples.push({ m: g2, t0: now, dur: fin ? 1400 : 800, size: fin ? 9 : 5, op: 1 }); } // bucha: anel dourado; final: vermelho
  }

  const cine = m => { if (fxEl) { fxEl.classList.toggle('on', !!m); fxEl.classList.toggle('rep', m === 'rep'); } };
  const setAmbient = on => { ambient = !!on; };
  return { supported, mount, show, sync, resetCam, setAmbient, REVEAL, get active() { return active; } };
})();
