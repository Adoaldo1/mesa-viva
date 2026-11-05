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
  let vnow = 0, slow = 1, replay = null, kick = null, lamp = null, ambient = true, grooves = null, chipMat = null, chipGame = null;
  const smoke = [], chips = [], clock = () => vnow;
  const TEAMC = ['#2f7de1', '#e0453a', '#2fa36b', '#c08a12'];         // mesmas cores do HUD
  const REVEAL = { per: 110, dur: 560, base: won => (won ? 2600 : 300) }; // fim da mão: as pedras viram uma a uma (o HUD conta junto)
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
    if (mounted) { if (canvas.parentNode !== wrap) wrap.prepend(canvas); if (resetBtn.parentNode !== wrap) wrap.appendChild(resetBtn); resize(); return true; }
    if (!window.THREE) return false;
    T = window.THREE;
    try { renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }); } catch { return false; }
    renderer.setPixelRatio(Math.min(1.75, devicePixelRatio || 1)); renderer.outputEncoding = T.sRGBEncoding;
    renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = .95;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
    canvas = renderer.domElement; canvas.className = 'd2-gl'; wrap.prepend(canvas);
    scene = new T.Scene(); scene.background = new T.Color(0x120c08);
    camera = new T.PerspectiveCamera(36, 1, .5, 300); ray = new T.Raycaster(); ptr = new T.Vector2(); plane = new T.Plane(UP(), -.9);
    // luz: luminária quente em cima, céu suave e um contorno frio
    scene.add(new T.HemisphereLight(0xfff3e0, 0x3a2614, .55));
    lamp = new T.SpotLight(0xffeccc, 1.6, 80, .6, .5, 1); lamp.position.set(-7, 29, 10); // um pouco de lado: a sombra aparece
    lamp.castShadow = true; lamp.shadow.mapSize.set(2048, 2048); lamp.shadow.bias = -.0004; lamp.shadow.radius = 4; scene.add(lamp, lamp.target);
    const rim = new T.DirectionalLight(0xbcd2ff, .25); rim.position.set(10, 12, 18); scene.add(rim);
    buildGeo(); buildTable(); bindInput();
    resetBtn = document.createElement('button'); resetBtn.className = 'd2-cam'; resetBtn.title = 'Voltar a câmera (ou dê dois cliques na mesa)'; resetBtn.textContent = '🎥';
    resetBtn.onclick = resetCam; wrap.appendChild(resetBtn);
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
    // moldura e saia de madeira (borda larga e arredondada, verniz brilhante); a canaleta do placar fica no lado de lá
    const wt = woodTex(), woodM = new T.MeshPhysicalMaterial({ map: wt, bumpMap: wt, bumpScale: .03, roughness: .45, clearcoat: 1, clearcoatRoughness: .12 });
    const frame = new T.Mesh(new T.ExtrudeGeometry(roundRect(38.4, 31.4, 3.6), { depth: 1.1, bevelEnabled: true, bevelThickness: .4, bevelSize: .45, bevelSegments: 6, curveSegments: 20 }), woodM);
    frame.rotation.x = -Math.PI / 2; frame.position.y = -1.55; frame.receiveShadow = true; scene.add(frame);
    geo.chip = new T.CylinderGeometry(.3, .3, .09, 28); chipMat = TEAMC.map(chipMats);
    // fumaça de cigarro bem fraquinha subindo na luz da luminária
    const smT = canvasTex(256, 256, (x, W) => { for (let i = 0; i < 14; i++) { const X = rand(60, 196), Y = rand(60, 196), r = rand(30, 70), g = x.createRadialGradient(X, Y, 0, X, Y, r); g.addColorStop(0, 'rgba(235,228,215,.5)'); g.addColorStop(1, 'rgba(235,228,215,0)'); x.fillStyle = g; x.fillRect(0, 0, W, W); } });
    for (let i = 0; i < 7; i++) { const s = new T.Sprite(new T.SpriteMaterial({ map: smT, transparent: true, opacity: 0, depthWrite: false })); s.userData = { ph: rand(0, 1), sp: rand(.035, .06), x: rand(-9, 9), z: rand(-6, 5), sc: rand(7, 12), rot: rand(-.1, .1) }; scene.add(s); smoke.push(s); }
    // pés de madeira e o chão
    const legM = woodM;
    for (const [x, z] of [[-15, -11.5], [15, -11.5], [-15, 11.5], [15, 11.5]]) { const l = new T.Mesh(new T.CylinderGeometry(.7, .5, 14, 16), legM); l.position.set(x, -8.6, z); scene.add(l); }
    const floor = new T.Mesh(new T.PlaneGeometry(300, 300), new T.MeshStandardMaterial({ color: C(0x1a110a), roughness: 1 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -15.6; floor.receiveShadow = true; scene.add(floor);
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
    const k = 1 - Math.exp(-dt * (replay ? 6 : 9)), R = replay, g = R ? { az: cam.az + .35, el: .42, zoom: .36, tx: R.p.x, tz: R.p.z } : cam; // replay: desce até a pedra da batida
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
  function show(on) { active = !!on && mounted; if (!mounted) return; canvas.style.display = resetBtn.style.display = active ? '' : 'none'; cancelAnimationFrame(raf); lastT = 0; if (active) { resize(); raf = requestAnimationFrame(loop); } }
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
  // placar: fichas na canaleta do lado de lá da moldura, um trecho por dupla (ou jogador)
  const GZ = 14.95, segX = N => (N === 2 ? [-8.5, 8.5] : N === 3 ? [-10.5, 0, 10.5] : [-12, -4, 4, 12]);
  const chipSlot = (N, side, k) => new T.Vector3(segX(N)[side] + (Math.min(k, 5) - 2.5) * .74, .03 + Math.max(0, k - 5) * .09, -GZ); // passou de 6: empilha
  function buildGrooves(N) {
    const g = new T.Group(), brass = new T.MeshPhysicalMaterial({ color: C(0xc9a24a), metalness: .8, roughness: .3 }), felt = new T.MeshStandardMaterial({ color: C(0x2a140a), roughness: .95 });
    segX(N).forEach((x, side) => {
      const rim = new T.Mesh(new T.ExtrudeGeometry(roundRect(5.06, .98, .49), { depth: .03, bevelEnabled: false }).rotateX(-Math.PI / 2), brass);
      const bed = new T.Mesh(new T.ExtrudeGeometry(roundRect(4.94, .86, .43), { depth: .035, bevelEnabled: false }).rotateX(-Math.PI / 2), felt);
      const tag = new T.Mesh(new T.CylinderGeometry(.11, .11, .02, 16), new T.MeshStandardMaterial({ color: C(TEAMC[side % 4]), roughness: .4 })); // pontinho da cor do dono
      rim.position.set(x, -.055, -GZ); bed.position.set(x, -.05, -GZ); tag.position.set(x - 2.82, -.035, -GZ); bed.receiveShadow = true; g.add(rim, bed, tag);
    });
    g.userData.N = N; scene.add(g); return g;
  }
  function syncChips() {
    const N = st.score.length, fresh = chipGame !== st.gameId;
    if (fresh || grooves?.userData.N !== N) { chips.forEach(l => l.forEach(c => scene.remove(c.m))); chips.length = 0; if (grooves) scene.remove(grooves); grooves = buildGrooves(N); }
    chipGame = st.gameId;
    let nk = 0;
    st.score.forEach((v, side) => {
      const list = chips[side] || (chips[side] = []);
      while (list.length > v) scene.remove(list.pop().m);
      while (list.length < v) { // ponto novo: a ficha sai de quem pontuou e cai rodando na canaleta (depois do replay)
        const to = chipSlot(N, side, list.length), m = new T.Mesh(geo.chip, chipMat[side % 4]), c = { m, to, t0: null };
        m.castShadow = true; m.position.copy(to);
        if (!fresh) { c.from = st.last?.seat != null ? seat(st.last.seat).c.clone().setY(2.5) : new T.Vector3(0, 3, 0); c.t0 = clock() + 2300 + nk++ * 260; c.spin = rand(7, 13); m.visible = false; }
        scene.add(m); list.push(c);
      }
    });
  }
  function chipStep(now) {
    for (const list of chips) for (const c of list || []) if (c.t0 != null) {
      const k = (now - c.t0) / 650; if (k < 0) continue;
      c.m.visible = true;
      if (k >= 1) { c.t0 = null; c.m.position.copy(c.to); c.m.rotation.set(0, 0, 0); Domino2SFX.tick(); continue; }
      c.m.position.lerpVectors(c.from, c.to, EZ.flight(k)); c.m.position.y += 2.2 * Math.sin(Math.PI * k); c.m.rotation.x = c.spin * (1 - EZ.settle(k));
    }
  }
  function sync(state, o2) {
    if (!mounted) return;
    st = state; opt = o2 || {}; n = st.players.length; mySeat = opt.mySeat >= 0 ? opt.mySeat : 0;
    const want = new Map(), ev = st.ev || {}, deal = st.hand !== curHand, lp = st.lastPlay || {}, freshEv = ev.n !== lastEvN; curHand = st.hand;
    const won = st.phase !== 'play' && st.last && st.last.kind !== 'tranca';
    let reveal = 0;
    // sons dos eventos
    if (ev.n !== lastEvN) { if (lastEvN >= 0 || deal) { if (deal) setTimeout(() => Domino2SFX.shuffle(1.7), 800); else if (ev.type === 'buy') Domino2SFX.draw(); else if (ev.type === 'pass') Domino2SFX.knock(); } lastEvN = ev.n; }
    if (st.C) for (const L of linePoses(st)) want.set('t' + L.id, { kind: 'line', a: L.a, d: L.d, pose: L.pose });
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
          const f = lp.f || 1, charged = o.charged; o.charged = false; o.shuf = null;
          // cai um pouquinho antes e meio virada; depois escorrega até encostar (o "assentar" fica no impact)
          const dir = pose.p.clone().sub(o.g.position).setY(0); if (dir.lengthSq() < 1e-4) dir.set(0, 0, -1); dir.normalize();
          const short = { p: pose.p.clone().addScaledVector(dir, -(f > 1 ? .12 : .28)).add(new T.Vector3(rand(-.06, .06), 0, rand(-.06, .06))), q: pose.q.clone().multiply(new T.Quaternion().setFromAxisAngle(UP(), rand(-.12, .12))) };
          // carregada: já está lá em cima, só desce acelerando e gira até deitar; senão voa em arco
          setTarget(o, short, charged ? { land: f, arc: .25, dur: 230, ez: 'drop' } : { land: f, slam: f > 1, arc: f === 3 ? 2.6 : f === 2 ? 1.4 : undefined, dur: f > 1 ? 520 : undefined, ez: 'flight' });
          o.settle = pose;
          // batida que fechou a mão: câmera lenta descendo até a pedra
          if (won && freshEv) { const t = performance.now(); replay = { p: pose.p.clone(), slowUntil: t + 1900, end: t + 2900 }; }
        } else if (o.settle) o.settle = pose; // ainda caindo/assentando: só atualiza onde vai parar
        else if (w.kind === 'open' && o.kind !== 'open') { // fim da mão: as pedras dos outros deitam e viram uma a uma
          const oo = o, p = pose; o.revealing = true; o.t0 = null; o.to = { p: o.g.position.clone(), q: o.g.quaternion.clone() };
          setTimeout(() => { oo.revealing = false; if (objs.get(k) === oo && oo.kind === 'open') { setTarget(oo, p, { arc: 1.1, dur: REVEAL.dur, ez: 'flight', force: true }); Domino2SFX.click(.5); } }, REVEAL.base(won) + reveal++ * REVEAL.per);
        } else if (o.revealing) { /* espera a vez dela de virar */ }
        else if (o.kind === w.kind) setTarget(o, pose, { arc: 0, ez: 'slide' }); // só reorganizou: desliza
        else setTarget(o, pose, { arc: .8, ez: 'flight' });
      }
      o.kind = w.kind; i++;
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
    if (replay && rnow > replay.end) replay = null;
    slow = replay && rnow < replay.slowUntil ? .3 : 1;
    const dt = rdt * slow, now = (vnow += dt * 1000);
    for (const o of objs.values()) {
      if (drag?.moved && o.key === drag.key && drag.at) { dragStep(o, rdt, rnow); continue; }
      if (o.hold) continue;
      if (o.shuf && shuffleStep(o, now)) continue;
      if (o.t0 != null) {
        let k = Math.max(0, Math.min(1, (now - o.t0 - o.delay) / o.dur));
        if (o.slam) k = k < .6 ? k / .6 * .5 : .5 + (k - .6) / .4 * .5; // sobe devagar, desce rápido
        const e = EZ[o.ez](k);
        o.g.position.lerpVectors(o.from.p, o.to.p, e); o.g.position.y += o.arc * Math.sin(Math.PI * k);
        o.g.quaternion.copy(o.from.q).slerp(o.to.q, o.ez === 'flight' ? EZ.slide(Math.min(1, k * 1.15)) : e); // no voo, gira um pouco antes de chegar
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
      if (s > 1.2) { kick = null; scene.position.set(0, 0, 0); scene.rotation.set(0, 0, 0); }
      else if (s >= 0) { scene.position.y = -kick.a * e * Math.sin(s * 40); scene.rotation.x = kick.a * .06 * e * Math.sin(s * 33 + 1); scene.rotation.z = kick.a * .07 * e * Math.sin(s * 29); }
    }
    // ambiente: a luminária balança devagar e a fumaça sobe na luz
    lamp.position.x = -7 + Math.sin(rnow / 2300) * .6; lamp.position.z = 10 + Math.sin(rnow / 3100) * .4;
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
  function impact(src, f) {
    Domino2SFX.land(f);
    if (src.settle) { // caiu um pouco antes: escorrega até encostar, com um estalinho
      const p = src.settle; src.settle = null;
      setTarget(src, p, { force: true, arc: 0, ez: 'settle', dur: f > 1 ? 200 : 320 });
      setTimeout(() => Domino2SFX.tick(), f > 1 ? 110 : 220);
    }
    const now = clock(), R = f === 1 ? 3.2 : f === 2 ? 9 : 40, A = f === 1 ? .05 : f === 2 ? .2 : .45;
    if (f > 1) { src.bump = mkBump(now, .03 * f, new T.Vector3(rand(-1, 1), 0, rand(-1, 1)).normalize(), rand(-.5, .5) * f, 0); kick = { t0: now, a: f === 3 ? .13 : .045 }; }
    for (const o of objs.values()) {
      if (o === src || o.hold || o.shuf || (drag && o.key === drag.key)) continue;
      const dir = o.g.position.clone().sub(src.g.position).setY(0), d = dir.length(); if (d > R) continue;
      const fall = o.kind === 'line' ? 1 - d / R * .7 : f === 3 ? .4 : f === 2 && d < 7 ? .3 : 0; if (!fall) continue;
      if (d < 1e-3) dir.set(1, 0, 0); dir.normalize().applyAxisAngle(UP(), rand(-.6, .6));
      const at = now + d * rand(6, 12) + rand(0, 70), hop = Math.random() < .25 ? 0 : A * fall * rand(.5, 1.5); // umas só balançam, sem sair do chão
      o.bump = mkBump(at, hop, dir, rand(.4, 1.2) * f * fall * (Math.random() < .2 ? -1 : 1), .04 * f * fall);
      if (o.kind === 'line' && f > 1 && o.base) { // depois da batida forte ela fica um pouco torta, mas encaixada no lugar
        const nd = o.nudge || (o.nudge = { x: 0, z: 0, yaw: 0 }), amt = fall * (f === 3 ? 1 : .45);
        nd.x += (dir.x * rand(0, .03) + rand(-.015, .015)) * amt; nd.z += (dir.z * rand(0, .03) + rand(-.015, .015)) * amt; nd.yaw += rand(-.035, .035) * amt;
        const m = Math.hypot(nd.x, nd.z); if (m > .04) { nd.x *= .04 / m; nd.z *= .04 / m; } nd.yaw = Math.max(-.04, Math.min(.04, nd.yaw));
        setTarget(o, nudged(o.base, nd), { force: true, arc: 0, ez: 'settle', dur: rand(300, 650), delay: at - now });
      }
    }
    if (f > 1) cam.shake = Math.max(cam.shake, f === 3 ? .45 : .16);
    const m = new T.Mesh(geo.ring, mats.ripple.clone()); m.position.copy(src.g.position).setY(.015); scene.add(m);
    ripples.push({ m, t0: now, dur: 380 + f * 160, size: f === 1 ? 1.2 : f * 3, op: f === 1 ? .35 : 1 });
  }

  const setAmbient = on => { ambient = !!on; };
  return { supported, mount, show, sync, resetCam, setAmbient, REVEAL, get active() { return active; } };
})();
