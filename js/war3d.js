// ===== Supremacia: mesa de guerra em 3D (Three.js r128) =====
// Mapa em relevo (cada território é uma peça extrudada), exércitos como soldadinhos (pequeno = 1, grande = 10),
// dados 3D (vermelhos no ataque, amarelos na defesa), setas de ataque, explosões e bandeiras de conquista.
const War3D = (() => {
  let T, renderer, scene, camera, raycaster, wrap, canvas, raf = 0, mounted = false, active = false, lastT = 0, clock = 0;
  let handlers = {}, view = null, ui = {};
  const S = .1; // unidades do mapa → mundo
  let MW, MH;
  const terr = {};          // id → { mesh, mat, side, pieces: Group, label: Sprite, shown: {owner, armies}, c: Vector3, r }
  const tweens = [], fx = [];
  let lock = new Set();     // territórios em animação (o estado novo espera a animação terminar)
  let queue = [], busy = false, diceGroup, arrowObj = null;
  const cam = { x: 0, z: .6, dist: 26, tx: 0, tz: .6, tdist: 26, yaw: 0 };
  const COLOR = {}; // id da cor → hex
  const CONT_COLOR = { na: 0xd59a3a, sa: 0x6aa84f, eu: 0x4f7fc4, af: 0xc9663a, as: 0x8f9a3c, oc: 0x9a62b8 };

  const ease = t => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const easeOut = t => 1 - Math.pow(1 - t, 3);
  const tween = (dur, fn, done, delay = 0) => tweens.push({ t0: clock + delay, dur, fn, done });
  const wait = ms => new Promise(r => tween(ms / 1000, () => {}, r));
  const W2 = (x, y) => new T.Vector3((x - MW / 2) * S, 0, (y - MH / 2) * S);

  function canvasTex(w, h, draw) {
    const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
    const t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; t.anisotropy = 4; return t;
  }

  // ---------- montagem ----------
  function supported() { if (!window.THREE) return false; try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; } }
  function mount(el, h) {
    handlers = h || {};
    if (mounted) { if (canvas.parentElement !== el) el.prepend(canvas); wrap = el; resize(); return true; }
    if (!supported()) return false;
    T = THREE; wrap = el; MW = WAR_MAP.w; MH = WAR_MAP.h;
    for (const c of War.COLORS) COLOR[c.id] = new T.Color(c.hex);
    renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.outputEncoding = T.sRGBEncoding; renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
    canvas = renderer.domElement; canvas.className = 'war3d'; el.prepend(canvas);
    scene = new T.Scene(); scene.background = new T.Color(0x0b0d10); scene.fog = new T.Fog(0x0b0d10, 40, 80);
    camera = new T.PerspectiveCamera(38, 1, .1, 200); raycaster = new T.Raycaster();
    // luz: lâmpada quente sobre a mesa + preenchimento frio
    scene.add(new T.HemisphereLight(0x9fb3c8, 0x1a120a, .55));
    const key = new T.DirectionalLight(0xffe2b8, 1.25); key.position.set(-8, 22, 10); key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048); Object.assign(key.shadow.camera, { left: -22, right: 22, top: 14, bottom: -14, near: 1, far: 60 }); key.shadow.bias = -.0005;
    scene.add(key);
    const rim = new T.DirectionalLight(0x7fa6ff, .35); rim.position.set(10, 8, -14); scene.add(rim);
    buildTable(); buildMap(); buildRoutes(); buildContLabels();
    diceGroup = new T.Group(); scene.add(diceGroup);
    bindInput(); new ResizeObserver(resize).observe(el); resize();
    mounted = true; return true;
  }

  function buildTable() {
    // mesa de madeira escura com moldura de latão; o oceano é uma placa com grade de latitude/longitude
    const wood = IMG.cj_wood ? new T.TextureLoader().load(IMG.cj_wood) : null;
    if (wood) { wood.encoding = T.sRGBEncoding; wood.wrapS = wood.wrapT = T.RepeatWrapping; wood.repeat.set(3, 2); }
    const table = new T.Mesh(new T.BoxGeometry(MW * S + 9, 1, MH * S + 9), new T.MeshStandardMaterial({ color: 0x5a3a22, map: wood, roughness: .6 }));
    table.position.y = -.62; table.receiveShadow = true; scene.add(table);
    const brass = new T.MeshStandardMaterial({ color: 0xb08a4a, metalness: .85, roughness: .32 });
    const fw = MW * S + 1.2, fh = MH * S + 1.2;
    for (const [w, d, x, z] of [[fw, .35, 0, -fh / 2], [fw, .35, 0, fh / 2], [.35, fh + .35, -fw / 2, 0], [.35, fh + .35, fw / 2, 0]]) {
      const b = new T.Mesh(new T.BoxGeometry(w, .22, d), brass); b.position.set(x, -.04, z); b.castShadow = b.receiveShadow = true; scene.add(b);
    }
    const ocean = canvasTex(2048, 900, (c, w, h) => {
      const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#163447'); g.addColorStop(.5, '#1d4a5e'); g.addColorStop(1, '#14303f');
      c.fillStyle = g; c.fillRect(0, 0, w, h);
      for (let i = 0; i < 9000; i++) { c.fillStyle = `rgba(255,255,255,${Math.random() * .025})`; c.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
      c.strokeStyle = 'rgba(170,210,230,.10)'; c.lineWidth = 1.5;
      for (let x = 0; x <= w; x += w / 24) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); }
      for (let y = 0; y <= h; y += h / 10) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
      // rosa dos ventos
      const cx = w * .3, cy = h * .82, R = 70; c.strokeStyle = 'rgba(220,200,150,.35)'; c.lineWidth = 2;
      c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.stroke(); c.beginPath(); c.arc(cx, cy, R * .55, 0, Math.PI * 2); c.stroke();
      c.fillStyle = 'rgba(220,200,150,.35)';
      for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4, L = k % 2 ? R * .7 : R * 1.15; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(a + .12) * 14, cy + Math.sin(a + .12) * 14); c.lineTo(cx + Math.cos(a) * L, cy + Math.sin(a) * L); c.lineTo(cx + Math.cos(a - .12) * 14, cy + Math.sin(a - .12) * 14); c.fill(); }
      c.font = 'bold 26px Georgia, serif'; c.textAlign = 'center'; c.fillText('N', cx, cy - R * 1.25);
    });
    const sea = new T.Mesh(new T.PlaneGeometry(MW * S + 1, MH * S + 1), new T.MeshStandardMaterial({ map: ocean, roughness: .35, metalness: .1 }));
    sea.rotation.x = -Math.PI / 2; sea.position.y = -.1; sea.receiveShadow = true; scene.add(sea);
  }

  // textura de relevo para o topo dos territórios (ruído + curvas de nível)
  let terrainTex;
  function terrain() {
    if (terrainTex) return terrainTex;
    terrainTex = canvasTex(1024, 512, (c, w, h) => {
      c.fillStyle = '#d9d2bf'; c.fillRect(0, 0, w, h);
      for (let i = 0; i < 2600; i++) { const x = Math.random() * w, y = Math.random() * h, r = 4 + Math.random() * 26; const g = c.createRadialGradient(x, y, 0, x, y, r); const v = Math.random() < .5 ? 0 : 255; g.addColorStop(0, `rgba(${v},${v},${v},.045)`); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2); }
      c.strokeStyle = 'rgba(60,50,30,.10)'; c.lineWidth = 1.2;
      for (let k = 0; k < 140; k++) { const x = Math.random() * w, y = Math.random() * h, r = 10 + Math.random() * 60; for (let j = 0; j < 3; j++) { c.beginPath(); c.ellipse(x, y, r * (1 + j * .45), r * (.6 + j * .3), Math.random(), 0, Math.PI * 2); c.stroke(); } }
    });
    terrainTex.wrapS = terrainTex.wrapT = T.RepeatWrapping; terrainTex.repeat.set(1 / (MW * S) * 2, 1 / (MH * S) * 2);
    return terrainTex;
  }

  function buildMap() {
    const sideMats = {};
    for (const t of WAR_MAP.territories) {
      const shapes = t.polys.map(poly => new T.Shape(poly.map(([x, y]) => new T.Vector2((x - MW / 2) * S, -(y - MH / 2) * S))));
      const geo = new T.ExtrudeGeometry(shapes, { depth: .2, bevelEnabled: true, bevelThickness: .05, bevelSize: .045, bevelSegments: 2, curveSegments: 1 });
      geo.rotateX(-Math.PI / 2); geo.translate(0, -.05, 0);
      const mat = new T.MeshStandardMaterial({ color: 0xcccccc, map: terrain(), roughness: .78, metalness: 0, emissive: 0x000000 });
      const side = sideMats[t.cont] || (sideMats[t.cont] = new T.MeshStandardMaterial({ color: new T.Color(CONT_COLOR[t.cont]).multiplyScalar(.55), roughness: .7 }));
      const mesh = new T.Mesh(geo, [mat, side]); mesh.castShadow = mesh.receiveShadow = true; mesh.userData.terr = t.id; scene.add(mesh);
      // contorno do território
      const edges = new T.LineSegments(new T.EdgesGeometry(geo, 30), new T.LineBasicMaterial({ color: 0x1a140c, transparent: true, opacity: .55 }));
      scene.add(edges);
      const pieces = new T.Group(); scene.add(pieces);
      const c = W2(t.c[0], t.c[1]); c.y = .2;
      const label = new T.Sprite(new T.SpriteMaterial({ transparent: true, depthWrite: false, depthTest: false }));
      label.renderOrder = 10; scene.add(label);
      terr[t.id] = { mesh, mat, pieces, label, c, r: t.r * S, shown: { owner: null, armies: 0 }, cont: t.cont, name: t.name, lift: 0 };
    }
  }
  function buildRoutes() {
    // ligações por mar: tracejado de latão (Alasca–Vladivostok dá a volta pelas bordas do mapa)
    const mat = new T.LineDashedMaterial({ color: 0xe8d29a, dashSize: .22, gapSize: .16, transparent: true, opacity: .75 });
    const line = pts => { const g = new T.BufferGeometry().setFromPoints(pts); const l = new T.Line(g, mat); l.computeLineDistances(); scene.add(l); };
    for (const [a, b] of WAR_MAP.sea) {
      const A = terr[a].c.clone().setY(.08), B = terr[b].c.clone().setY(.08);
      if (Math.abs(A.x - B.x) > MW * S / 2) { // dá a volta no mundo
        const [L, R] = A.x < B.x ? [A, B] : [B, A], edgeL = -MW * S / 2 - .3, edgeR = MW * S / 2 + .3, zm = (L.z + R.z) / 2;
        line([L, new T.Vector3(edgeL, .08, zm)]); line([R, new T.Vector3(edgeR, .08, zm)]);
      } else {
        const mid = A.clone().lerp(B, .5); mid.y = .5;
        line(new T.QuadraticBezierCurve3(A, mid, B).getPoints(24));
      }
    }
  }
  function buildContLabels() {
    const at = { na: [22, 52], sa: [62, 120], eu: [143, 36], af: [150, 112], as: [330, 64], oc: [334, 126] };
    for (const [k, [x, y]] of Object.entries(at)) {
      const c = WAR_MAP.continents[k];
      const tex = canvasTex(512, 96, (g, w, h) => {
        g.font = '700 40px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillStyle = 'rgba(232,210,154,.85)'; g.fillText(c.name.toUpperCase(), w / 2, h / 2 - 8);
        g.font = '600 24px Georgia, serif'; g.fillStyle = 'rgba(232,210,154,.6)'; g.fillText(`bônus +${c.bonus}`, w / 2, h / 2 + 26);
      });
      const m = new T.Mesh(new T.PlaneGeometry(3.8, .72), new T.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
      m.rotation.x = -Math.PI / 2; const p = W2(x, y); m.position.set(p.x, -.08, p.z); scene.add(m);
    }
  }

  // ---------- peças (soldadinhos) ----------
  let pieceGeo, bigGeo, ringGeo, pieceMats = {};
  function geos() {
    if (pieceGeo) return;
    const prof = [[0, 0], [.15, 0], [.16, .025], [.13, .05], [.09, .07], [.075, .2], [.1, .235], [.095, .26], [.05, .28], [.05, .3], [.075, .315], [.085, .36], [.06, .395], [0, .405]];
    pieceGeo = new T.LatheGeometry(prof.map(([x, y]) => new T.Vector2(x, y)), 18);
    bigGeo = pieceGeo.clone().scale(1.45, 1.45, 1.45);
    ringGeo = new T.TorusGeometry(.13, .022, 8, 24).rotateX(Math.PI / 2);
  }
  const gold = () => pieceMats.gold || (pieceMats.gold = new T.MeshStandardMaterial({ color: 0xd8b25a, metalness: .9, roughness: .25 }));
  function pieceMat(color) {
    if (!pieceMats[color]) {
      const c = COLOR[color] || new T.Color(0x888888);
      pieceMats[color] = new T.MeshStandardMaterial({ color: c, roughness: .32, metalness: .05, emissive: color === 'preto' ? 0x0d0d12 : 0x000000 });
    }
    return pieceMats[color];
  }
  function makePiece(color, big) {
    geos();
    const g = new T.Group();
    const m = new T.Mesh(big ? bigGeo : pieceGeo, pieceMat(color)); m.castShadow = true; g.add(m); g.scale.setScalar(1.45);
    if (big) { const r = new T.Mesh(ringGeo, gold()); r.position.y = .18 * 1.45; g.add(r); }
    return g;
  }
  // arranjo das peças num território: grandes no centro, pequenas em volta
  function slots(n, big, r) {
    const out = [], R = Math.min(r * .62, .7);
    for (let i = 0; i < big; i++) out.push([(i - (big - 1) / 2) * .42, -.1, true]);
    for (let i = 0; i < n; i++) { const a = (i / Math.max(n, 6)) * Math.PI * 2 + .4, rr = big ? R : R * (n > 1 ? .75 : 0); out.push([Math.cos(a) * rr, Math.sin(a) * rr * .7 + (big ? .12 : 0), false]); }
    return out;
  }
  function setPieces(id, owner, armies, spawn) {
    const t = terr[id], color = view?.players.find(p => p.id === owner)?.color || 'branco';
    const big = Math.min(5, Math.floor(armies / 10)), small = armies - Math.floor(armies / 10) * 10;
    const key = color + ':' + big + ':' + small;
    if (t.key === key) return; t.key = key;
    const old = t.pieces.children.slice(); old.forEach(o => t.pieces.remove(o));
    const sl = slots(small, big, t.r);
    sl.forEach(([dx, dz, isBig], i) => {
      const p = makePiece(color, isBig); p.position.set(t.c.x + dx, t.c.y, t.c.z + dz); p.rotation.y = Math.random() * Math.PI;
      t.pieces.add(p);
      if (spawn && i >= old.length - (old.length ? 1 : 0)) { // as novas caem do alto
        const y0 = t.c.y + 2.2 + Math.random(); p.position.y = y0;
        tween(.45, k => { p.position.y = y0 + (t.c.y - y0) * easeOut(k); }, null, i * .03);
      }
    });
    t.shown = { owner, armies };
    drawLabel(id);
  }
  function drawLabel(id) {
    const t = terr[id], pl = view?.players.find(p => p.id === t.shown.owner), color = pl ? War.COLORS.find(c => c.id === pl.color).hex : '#888';
    const dark = pl && ['branco', 'amarelo'].includes(pl.color);
    const tex = canvasTex(256, 112, (g, w, h) => {
      g.font = '700 26px "Helvetica Neue", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = 6; g.strokeStyle = 'rgba(10,8,5,.85)'; g.strokeText(t.name.toUpperCase(), w / 2, 22); g.fillStyle = '#f3ead2'; g.fillText(t.name.toUpperCase(), w / 2, 22);
      // selo com o número de exércitos na cor do dono
      g.beginPath(); g.arc(w / 2, 74, 30, 0, Math.PI * 2); g.fillStyle = color; g.fill(); g.lineWidth = 5; g.strokeStyle = 'rgba(10,8,5,.9)'; g.stroke();
      g.font = '800 34px "Helvetica Neue", Arial, sans-serif'; g.fillStyle = dark ? '#111' : '#fff'; g.fillText(String(t.shown.armies), w / 2, 76);
    });
    const m = t.label.material; m.map?.dispose(); m.map = tex; m.needsUpdate = true;
    t.label.scale.set(2.1, .92, 1);
    t.label.position.set(t.c.x, 1.25, t.c.z - .05);
    // topo do território: cor do dono misturada à cor do continente
    const base = new T.Color(CONT_COLOR[t.cont]), own = pl ? COLOR[pl.color] : new T.Color(0x777777);
    t.mat.color.copy(base).lerp(own, pl?.color === 'preto' ? .6 : .7);
  }

  // ---------- sincronização ----------
  function sync(v, u = {}) {
    if (!mounted) return; view = v; ui = u;
    for (const id in terr) if (!lock.has(id)) setPieces(id, v.owner[id], v.armies[id], terr[id].shown.owner === v.owner[id] && v.armies[id] > terr[id].shown.armies);
    highlight();
  }
  function highlight() {
    const sel = ui.sel, targets = new Set(ui.targets || []), hov = hoverId;
    for (const [id, t] of Object.entries(terr)) {
      const on = id === sel ? 1 : targets.has(id) ? .55 : id === hov ? .3 : 0;
      t.hl = on; t.hlColor = id === sel ? 0xffc04a : targets.has(id) ? (ui.mode === 'attack' ? 0xff3b2f : 0x3fe07a) : 0xffffff;
    }
  }

  // ---------- animações de eventos ----------
  function play(e) { queue.push(e); if (queue.length > 6) queue.splice(0, queue.length - 6); pump(); }
  async function pump() {
    if (busy) return; busy = true;
    while (queue.length) {
      const e = queue.shift(), fast = queue.length > 2 || document.hidden;
      try { await run(e, fast); } catch (err) { console.warn(err); }
    }
    busy = false; lock.clear(); if (view) sync(view, ui);
  }
  async function run(e, fast) {
    if (e.type === 'battle') return battleFx(e, fast);
    if (e.type === 'move' || e.type === 'occupy') return marchFx(e, fast);
    if (e.type === 'trade') { SFX.coinShower?.(); return; }
    if (e.type === 'eliminated') { SFX.explosion?.(); return; }
  }
  function apply(ids) { for (const id of ids) { lock.delete(id); if (view) setPieces(id, view.owner[id], view.armies[id], false); } }

  async function battleFx(e, fast) {
    lock.add(e.from); lock.add(e.to);
    const A = terr[e.from].c, B = terr[e.to].c;
    // seta em arco do atacante até o alvo
    const curve = new T.QuadraticBezierCurve3(A.clone().setY(.5), A.clone().lerp(B, .5).setY(1.6 + A.distanceTo(B) * .12), B.clone().setY(.5));
    const arrow = new T.Mesh(new T.TubeGeometry(curve, 40, .06, 8, false), new T.MeshBasicMaterial({ color: 0xff4a32, transparent: true, opacity: .95 }));
    arrow.geometry.setDrawRange(0, 0); scene.add(arrow);
    const head = new T.Mesh(new T.ConeGeometry(.16, .4, 12), arrow.material); scene.add(head);
    SFX.whoosh?.();
    const total = arrow.geometry.index.count;
    await new Promise(r => tween(fast ? .2 : .5, k => {
      const kk = easeOut(k); arrow.geometry.setDrawRange(0, Math.floor(total * kk / 6) * 6);
      const p = curve.getPoint(kk), d = curve.getTangent(kk); head.position.copy(p); head.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), d);
    }, r));
    // dados
    await rollDice(e.a, e.d, fast);
    // perdas: explosões nos territórios
    if (e.lossA) boom(A, e.lossA, fast);
    if (e.lossD) boom(B, e.lossD, fast);
    (e.lossD > e.lossA ? SFX.swordClash : SFX.slash)?.();
    await wait(fast ? 120 : 380);
    if (e.conquered) { conquerFx(e.to, e.att); SFX.truth?.(); }
    apply([e.from, e.to]);
    await new Promise(r => tween(fast ? .15 : .35, k => { arrow.material.opacity = .95 * (1 - k); }, r));
    scene.remove(arrow, head); arrow.geometry.dispose();
    clearDice(fast);
  }
  async function marchFx(e, fast) {
    lock.add(e.from); lock.add(e.to);
    const A = terr[e.from].c, B = terr[e.to].c, color = view.players.find(p => p.id === e.pid)?.color;
    const n = Math.min(5, e.count), walkers = [];
    for (let i = 0; i < n; i++) { const p = makePiece(color, false); p.position.copy(A); scene.add(p); walkers.push(p); }
    apply([e.from]);
    SFX.cardWhoosh?.();
    await new Promise(r => tween(fast ? .3 : .7, k => walkers.forEach((p, i) => {
      const kk = ease(Math.min(1, Math.max(0, k * 1.3 - i * .06))); p.position.lerpVectors(A, B, kk); p.position.y = A.y + Math.sin(kk * Math.PI) * (1 + A.distanceTo(B) * .08);
    }), r));
    walkers.forEach(p => scene.remove(p));
    apply([e.to]);
  }
  function conquerFx(id, pid) {
    const t = terr[id], color = view.players.find(p => p.id === pid)?.color || 'branco', col = COLOR[color];
    // anel de choque + bandeira fincada
    const ring = new T.Mesh(new T.RingGeometry(.2, .32, 48), new T.MeshBasicMaterial({ color: col, transparent: true, opacity: .9, side: T.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.copy(t.c).setY(.25); scene.add(ring);
    tween(.9, k => { ring.scale.setScalar(1 + k * 9); ring.material.opacity = .9 * (1 - k); }, () => scene.remove(ring));
    const flag = new T.Group();
    const pole = new T.Mesh(new T.CylinderGeometry(.018, .018, 1.1, 6), gold()); pole.position.y = .55; flag.add(pole);
    const cloth = new T.Mesh(new T.PlaneGeometry(.5, .32, 6, 2), new T.MeshStandardMaterial({ color: col, side: T.DoubleSide, roughness: .6 }));
    cloth.position.set(.26, .92, 0); flag.add(cloth); flag.position.copy(t.c).add(new T.Vector3(t.r * .35, 0, -t.r * .2)); scene.add(flag);
    const pos = cloth.geometry.attributes.position, base = pos.array.slice();
    tween(.5, k => { flag.position.y = t.c.y + 1.5 * (1 - easeOut(k)); });
    tween(2.6, k => {
      for (let i = 0; i < pos.count; i++) { const x = base[i * 3]; pos.array[i * 3 + 2] = Math.sin(x * 9 + clock * 9) * .05 * (x + .25); }
      pos.needsUpdate = true; if (k > .8) flag.scale.setScalar(1 - (k - .8) * 5 + .0001);
    }, () => scene.remove(flag));
    t.flash = 1;
  }
  // explosão: fumaça + faíscas + peças voando
  let puffTex;
  function boom(at, n, fast) {
    puffTex = puffTex || canvasTex(64, 64, (c, w) => { const g = c.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.5, 'rgba(255,255,255,.4)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, w, w); });
    for (let i = 0; i < 4 + n * 4; i++) {
      const fire = i < 3 + n * 2, s = new T.Sprite(new T.SpriteMaterial({ map: puffTex, color: fire ? 0xffa040 : 0x555555, transparent: true, depthWrite: false, blending: fire ? T.AdditiveBlending : T.NormalBlending }));
      s.position.copy(at).add(new T.Vector3((Math.random() - .5) * .5, .3, (Math.random() - .5) * .5)); scene.add(s);
      const v = new T.Vector3((Math.random() - .5) * 1.6, 1 + Math.random() * 1.6, (Math.random() - .5) * 1.6), size = fire ? .4 : .6;
      tween(fast ? .5 : (fire ? .6 : 1.3), k => { s.position.addScaledVector(v, .016); v.y -= fire ? .02 : .005; s.scale.setScalar(size * (1 + k * (fire ? 1 : 2.5))); s.material.opacity = (1 - k) * (fire ? 1 : .55); }, () => scene.remove(s), i * .01);
    }
    for (let i = 0; i < n; i++) { // peças derrubadas voando
      const p = makePiece('preto', false); p.children[0].material = new T.MeshStandardMaterial({ color: 0x3a3a3a, roughness: .8 }); p.position.copy(at); scene.add(p);
      const v = new T.Vector3((Math.random() - .5) * 2.5, 3 + Math.random() * 2, (Math.random() - .5) * 2.5), spin = new T.Vector3(Math.random() * 12, Math.random() * 12, Math.random() * 12);
      tween(fast ? .5 : .9, k => { p.position.addScaledVector(v, .016); v.y -= .16; p.rotation.x += spin.x * .016; p.rotation.z += spin.z * .016; p.scale.setScalar(1 - k * .8); }, () => scene.remove(p));
    }
    SFX.explosion?.();
  }

  // ---------- dados ----------
  let diceMats = {};
  function dieMats(kind) {
    if (diceMats[kind]) return diceMats[kind];
    const bg = kind === 'a' ? '#c8261d' : '#f2c02c', fg = kind === 'a' ? '#fff' : '#1b1b1b';
    const face = v => canvasTex(128, 128, (c, w) => {
      c.fillStyle = bg; c.fillRect(0, 0, w, w);
      const g = c.createRadialGradient(64, 64, 20, 64, 64, 90); g.addColorStop(0, 'rgba(255,255,255,.12)'); g.addColorStop(1, 'rgba(0,0,0,.25)'); c.fillStyle = g; c.fillRect(0, 0, w, w);
      c.fillStyle = fg; const P = { 1: [[64, 64]], 2: [[34, 34], [94, 94]], 3: [[30, 30], [64, 64], [98, 98]], 4: [[34, 34], [94, 34], [34, 94], [94, 94]], 5: [[32, 32], [96, 32], [64, 64], [32, 96], [96, 96]], 6: [[34, 28], [94, 28], [34, 64], [94, 64], [34, 100], [94, 100]] }[v];
      P.forEach(([x, y]) => { c.beginPath(); c.arc(x, y, 11, 0, Math.PI * 2); c.fill(); });
    });
    // ordem das faces do BoxGeometry: +x, -x, +y, -y, +z, -z
    return (diceMats[kind] = [3, 4, 1, 6, 2, 5].map(v => new T.MeshStandardMaterial({ map: face(v), roughness: .35, metalness: .05 })));
  }
  const FACE_NORMAL = { 3: [1, 0, 0], 4: [-1, 0, 0], 1: [0, 1, 0], 6: [0, -1, 0], 2: [0, 0, 1], 5: [0, 0, -1] };
  let dieGeo;
  function makeDie(kind) {
    dieGeo = dieGeo || (() => { const g = new T.BoxGeometry(.5, .5, .5, 3, 3, 3), p = g.attributes.position, v = new T.Vector3(); for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const c = v.clone().clampScalar(-.17, .17); v.sub(c).normalize().multiplyScalar(.08).add(c); p.setXYZ(i, v.x * 1.0, v.y, v.z); } g.computeVertexNormals(); return g; })();
    const m = new T.Mesh(dieGeo, dieMats(kind)); m.castShadow = true; return m;
  }
  async function rollDice(a, d, fast) {
    clearDice(true);
    const z0 = MH * S / 2 + 1.9, mk = (vals, kind, x0) => vals.map((v, i) => { const m = makeDie(kind); const tx = x0 + i * .72, tz = z0; m.userData = { v, tx, tz }; diceGroup.add(m); return m; });
    const A = mk(a, 'a', -2.6), D = mk(d, 'd', .9), all = [...A, ...D];
    SFX.shake?.(); setTimeout(() => SFX.bounce?.(), fast ? 250 : 600);
    const dur = fast ? .5 : 1.1;
    all.forEach((m, i) => {
      const { v, tx, tz } = m.userData, up = new T.Vector3(0, 1, 0), n = new T.Vector3(...FACE_NORMAL[v]);
      const end = new T.Quaternion().setFromUnitVectors(n, up).premultiply(new T.Quaternion().setFromAxisAngle(up, (Math.random() - .5) * .6));
      const spin = new T.Euler(Math.random() * 20, Math.random() * 20, Math.random() * 20), start = new T.Vector3(tx + (Math.random() - .5) * 2, 3, tz + 2.5);
      tween(dur, k => {
        const kk = easeOut(k); m.position.lerpVectors(start, new T.Vector3(tx, .25, tz), kk); m.position.y = .25 + Math.abs(Math.sin(kk * Math.PI * 2.5)) * (1 - kk) * 1.6;
        if (k < .85) m.rotation.set(spin.x * (1 - kk), spin.y * (1 - kk), spin.z * (1 - kk)); else m.quaternion.slerp(end, (k - .85) / .15);
        if (k >= 1) m.quaternion.copy(end);
      }, null, i * .05);
    });
    await wait(dur * 1000 + 250);
    // pares comparados: brilho verde no vencedor
    for (let i = 0; i < Math.min(A.length, D.length); i++) {
      const win = a[i] > d[i] ? A[i] : D[i];
      const glow = new T.Mesh(new T.RingGeometry(.34, .44, 32), new T.MeshBasicMaterial({ color: 0x6dff8a, transparent: true, opacity: .9, side: T.DoubleSide }));
      glow.rotation.x = -Math.PI / 2; glow.position.set(win.position.x, .03, win.position.z); diceGroup.add(glow);
    }
    await wait(fast ? 150 : 550);
  }
  function clearDice(now) {
    const kids = diceGroup.children.slice();
    if (now) return kids.forEach(k => diceGroup.remove(k));
    tween(.4, k => kids.forEach(m => { m.scale.setScalar(Math.max(.001, 1 - k)); }), () => kids.forEach(k => diceGroup.remove(k)), .9);
  }

  // ---------- entrada (clique, arrastar para mover a câmera, roda para zoom) ----------
  let hoverId = null, down = null;
  function pick(e) {
    const r = canvas.getBoundingClientRect();
    raycaster.setFromCamera(new T.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
    const hit = raycaster.intersectObjects(Object.values(terr).map(t => t.mesh), false)[0];
    return hit?.object.userData.terr || null;
  }
  function bindInput() {
    canvas.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY, cx: cam.tx, cz: cam.tz, moved: false }; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', e => {
      if (down) {
        const dx = e.clientX - down.x, dy = e.clientY - down.y;
        if (Math.hypot(dx, dy) > 6) down.moved = true;
        if (down.moved) { const k = cam.dist / canvas.clientHeight * 1.1; cam.tx = clamp(down.cx - dx * k, -MW * S / 2 + 2, MW * S / 2 - 2); cam.tz = clamp(down.cz - dy * k * 1.3, -MH * S / 2, MH * S / 2 + 1); canvas.style.cursor = 'grabbing'; }
        return;
      }
      const id = pick(e); if (id !== hoverId) { hoverId = id; highlight(); handlers.hover?.(id); }
      canvas.style.cursor = id ? 'pointer' : 'grab';
    });
    canvas.addEventListener('pointerup', e => {
      const d = down; down = null; canvas.style.cursor = '';
      if (d && !d.moved) { const id = pick(e); handlers.click?.(id, e); }
    });
    canvas.addEventListener('pointerleave', () => { if (hoverId) { hoverId = null; highlight(); handlers.hover?.(null); } });
    canvas.addEventListener('wheel', e => { e.preventDefault(); cam.tdist = clamp(cam.tdist * (e.deltaY > 0 ? 1.1 : .9), 9, fitDist() * 1.15); }, { passive: false });
    canvas.addEventListener('dblclick', e => { const id = pick(e); if (id) focus(id); });
  }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function focus(id, dist = 13) { const t = terr[id]; if (!t) return; cam.tx = t.c.x; cam.tz = t.c.z; cam.tdist = Math.min(cam.tdist, dist); }
  function overview() { cam.tx = 0; cam.tz = .6; cam.tdist = fitDist(); }
  function fitDist() {
    const a = camera.aspect, vf = camera.fov * Math.PI / 180;
    const needW = (MW * S + 3) / 2 / Math.tan(vf / 2) / a, needH = (MH * S + 7) / 2 / Math.tan(vf / 2);
    return Math.max(needW, needH) * .92;
  }
  function resize() {
    if (!renderer || !wrap) return;
    const w = wrap.clientWidth, h = wrap.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false); canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
    camera.aspect = w / h; camera.updateProjectionMatrix();
    const f = fitDist(); if (!resize.done || cam.tdist > f * 1.15) { cam.tdist = cam.dist = f; resize.done = true; }
  }

  // ---------- laço ----------
  function loop(t) {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(.05, (t - (lastT || t)) / 1000); lastT = t; frame(dt);
  }
  // depuração: avança a animação quadro a quadro (o painel escondido segura o requestAnimationFrame)
  function advance(ms) { for (let k = 0; k < ms / 16; k++) frame(.016); }
  function frame(dt) {
    clock += dt;
    for (let i = tweens.length - 1; i >= 0; i--) {
      const tw = tweens[i]; if (clock < tw.t0) continue;
      const k = Math.min(1, (clock - tw.t0) / tw.dur); tw.fn(k);
      if (k >= 1) { tweens.splice(i, 1); tw.done?.(); }
    }
    const kc = 1 - Math.exp(-dt * 6);
    cam.x += (cam.tx - cam.x) * kc; cam.z += (cam.tz - cam.z) * kc; cam.dist += (cam.tdist - cam.dist) * kc;
    camera.position.set(cam.x, cam.dist * .86, cam.z + cam.dist * .52); camera.lookAt(cam.x, 0, cam.z - .3);
    const pulse = .5 + .5 * Math.sin(clock * 5);
    for (const t of Object.values(terr)) {
      const target = t.hl ? (t.hl >= 1 ? .3 : .12 + .14 * pulse * t.hl) : 0;
      t.lift += ((t.hl >= 1 ? .12 : 0) - t.lift) * kc;
      t.mesh.position.y = t.lift; t.pieces.position.y = t.lift;
      t.mat.emissive.setHex(t.hl ? t.hlColor : 0x000000); t.mat.emissiveIntensity = target;
      if (t.flash > 0) { t.flash = Math.max(0, t.flash - dt * 1.4); t.mat.emissive.setHex(0xffffff); t.mat.emissiveIntensity = t.flash * .6; }
    }
    renderer.render(scene, camera);
  }
  function show(on) { active = !!on && mounted; if (!mounted) return; canvas.style.display = active ? '' : 'none'; cancelAnimationFrame(raf); lastT = 0; if (active) { resize(); raf = requestAnimationFrame(loop); } }
  // posição de um território na tela (para balões e dicas)
  function screenPos(id, y = .9) {
    const t = terr[id]; if (!t || !camera) return null;
    const v = t.c.clone().setY(y).project(camera), r = canvas.getBoundingClientRect();
    return { x: (v.x + 1) / 2 * r.width, y: (1 - v.y) / 2 * r.height };
  }

  return { supported, mount, show, sync, play, focus, overview, screenPos, advance, dbg: () => ({ terr, scene, camera, lock, queue }), get active() { return active; }, get busy() { return busy; } };
})();
