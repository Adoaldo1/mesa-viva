// ===== Ludo em 3D (Three.js) — só visualização; regras ficam em js/ludo.js =====
// Estilo cartoon: casas em relevo chanfradas, bases com pinos, pirâmide no centro, peões torneados, dado na mesa.
// Coordenadas de entrada em "grade" 15×15 contínua (linha y, coluna x), as mesmas da tela 2D.
const Ludo3D = (() => {
  const B = 10, CELL = B / 15, STEP = 220;
  const TILE_TOP = .2, YARD_TOP = .3, GOAL_H = .55, DIE = .7;
  const rand = (a, b) => a + Math.random() * (b - a);
  let T, renderer, scene, camera, raycaster, canvas, wrap, group, die, dieRing;
  let mounted = false, active = false, raf = 0, handlers = {}, pawns = {}, hint = false, rolling = false;
  const cam = { az: 0, polar: 50, zoom: 1 };

  const W = (gy, gx) => [(gx - 7.5) * CELL, (gy - 7.5) * CELL]; // grade → mundo local (x, z)
  function surfaceY(gy, gx) {
    if (gx >= 6 && gx <= 9 && gy >= 6 && gy <= 9) return .12 + GOAL_H * Math.max(0, 1 - Math.max(Math.abs(gx - 7.5), Math.abs(gy - 7.5)) / 1.5);
    if ((gx < 6 || gx > 9) && (gy < 6 || gy > 9)) return YARD_TOP;
    return TILE_TOP;
  }

  // cores em hex são sRGB; converte para linear senão tudo sai desbotado com outputEncoding sRGB
  const col = c => new T.Color(c).convertSRGBToLinear();
  const mat = (color, o = {}) => new T.MeshStandardMaterial({ color: col(color), roughness: .55, metalness: 0, ...o, ...(o.emissive != null && { emissive: col(o.emissive) }) });
  const shadowy = o => (o.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } }), o);
  // bloco arredondado e chanfrado (cartoon), apoiado em y = 0
  function slab(w, d, h, r = .08, bevel = .04) {
    const s = new T.Shape(), x = -w / 2 + bevel, y = -d / 2 + bevel, ww = w - 2 * bevel, dd = d - 2 * bevel, rr = Math.min(r, ww / 2, dd / 2);
    s.moveTo(x + rr, y); s.lineTo(x + ww - rr, y); s.quadraticCurveTo(x + ww, y, x + ww, y + rr); s.lineTo(x + ww, y + dd - rr);
    s.quadraticCurveTo(x + ww, y + dd, x + ww - rr, y + dd); s.lineTo(x + rr, y + dd); s.quadraticCurveTo(x, y + dd, x, y + dd - rr);
    s.lineTo(x, y + rr); s.quadraticCurveTo(x, y, x + rr, y);
    const g = new T.ExtrudeGeometry(s, { depth: h - 2 * bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 6 });
    g.rotateX(-Math.PI / 2); g.translate(0, bevel, 0);
    return g;
  }
  function canvasTex(w, h, draw) {
    const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
    const t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; t.anisotropy = renderer.capabilities.getMaxAnisotropy(); return t;
  }

  // ---------- modelos ----------
  function pawnModel(color) {
    const g = new T.Group();
    const m = new T.MeshPhysicalMaterial({ color: col(color), roughness: .3, clearcoat: .9, clearcoatRoughness: .2 });
    const prof = [[0, 0], [.26, 0], [.28, .025], [.28, .06], [.25, .09], [.17, .12], [.13, .18], [.105, .3], [.1, .4], [.16, .43], [.17, .46], [.12, .49], [0, .5]].map(([x, y]) => new T.Vector2(x, y));
    const body = new T.Mesh(new T.LatheGeometry(prof, 48), m);
    const head = new T.Mesh(new T.SphereGeometry(.16, 40, 24), m); head.position.y = .62;
    const shine = new T.Mesh(new T.SphereGeometry(.045, 16, 10), new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .75 }));
    shine.position.set(-.06, .7, .1);
    const ring = new T.Mesh(new T.TorusGeometry(.33, .035, 10, 48), mat(0xf3b733, { emissive: 0xb07b0e, emissiveIntensity: .7 }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = .02; ring.visible = false;
    const lift = new T.Group(); lift.add(body, head, shine);
    g.add(lift, ring); g.userData = { lift, ring };
    shadowy(lift); return g;
  }

  const PIPS = { 1: [[.5, .5]], 2: [[.27, .27], [.73, .73]], 3: [[.27, .27], [.5, .5], [.73, .73]], 4: [[.27, .27], [.73, .27], [.27, .73], [.73, .73]], 5: [[.27, .27], [.73, .27], [.5, .5], [.27, .73], [.73, .73]], 6: [[.27, .25], [.73, .25], [.27, .5], [.73, .5], [.27, .75], [.73, .75]] };
  const dieFace = n => canvasTex(256, 256, (ctx, w) => {
    const g = ctx.createRadialGradient(w * .35, w * .3, 10, w / 2, w / 2, w * .75); g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#ece6da');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, w);
    for (const [x, y] of PIPS[n]) { ctx.fillStyle = n === 1 ? '#d9412f' : '#1d120a'; ctx.beginPath(); ctx.arc(x * w, y * w, n === 1 ? 32 : 24, 0, Math.PI * 2); ctx.fill(); }
  });
  const FACE_VAL = [2, 5, 3, 4, 1, 6]; // ordem dos materiais do BoxGeometry: +x, -x, +y, -y, +z, -z
  function faceUpQuat(v, yaw) {
    const n = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]][FACE_VAL.indexOf(v)];
    const q = new T.Quaternion().setFromUnitVectors(new T.Vector3(...n), new T.Vector3(0, 1, 0));
    return new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), yaw).multiply(q);
  }
  const DIE_REST = () => new T.Vector3(3.2, -.35 + DIE / 2, B / 2 + 1.25); // na mesa, à frente do tabuleiro

  // ---------- cena ----------
  function mount(container, h) {
    handlers = h; wrap = container;
    if (mounted) { if (canvas.parentNode !== wrap) wrap.appendChild(canvas); resize(); return; }
    T = window.THREE;
    renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.outputEncoding = T.sRGBEncoding;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
    canvas = renderer.domElement; canvas.className = 'ludo-gl'; wrap.appendChild(canvas);
    scene = new T.Scene();
    camera = new T.PerspectiveCamera(34, 1, .1, 200);
    raycaster = new T.Raycaster();
    scene.add(new T.HemisphereLight(0xfff6e8, 0x5a3a20, .7));
    const sun = new T.DirectionalLight(0xfff1dc, 1.15); sun.position.set(6, 14, 8); sun.castShadow = true;
    Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10, near: 1, far: 45 });
    sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -.0004; sun.shadow.radius = 4; scene.add(sun);
    const fill = new T.DirectionalLight(0xc8dcff, .35); fill.position.set(-9, 7, -5); scene.add(fill);

    // mesa de madeira (o tabuleiro fica apoiado nela)
    const wood = new T.TextureLoader().load(IMG.bg_wood); wood.encoding = T.sRGBEncoding; wood.wrapS = wood.wrapT = T.RepeatWrapping; wood.repeat.set(3, 3);
    const table = new T.Mesh(new T.PlaneGeometry(90, 90), new T.MeshStandardMaterial({ map: wood, roughness: .75 }));
    table.rotation.x = -Math.PI / 2; table.position.y = -.35; table.receiveShadow = true; scene.add(table);

    // tabuleiro: base de madeira escura com friso dourado, girada para a sua cor ficar à frente
    group = new T.Group(); scene.add(group);
    const base = new T.Mesh(slab(B + .7, B + .7, .35, .3, .06), mat('#3d2414', { roughness: .5 })); base.position.y = -.35;
    const trim = new T.Mesh(slab(B + .3, B + .3, .04, .2, .015), mat('#d6a84e', { metalness: .45, roughness: .35 })); trim.position.y = -.03;
    const felt = new T.Mesh(slab(B + .1, B + .1, .06, .16, .02), mat('#e9dcc0', { roughness: .9 })); felt.position.y = -.01;
    group.add(shadowy(base), trim, shadowy(felt));

    const S = Ludo.SEATS.map(s => s.color), cream = mat('#fbf5e6'), seatM = S.map(c => mat(c, { roughness: .45 }));
    const tileGeo = slab(CELL * .9, CELL * .9, TILE_TOP, .07, .035);
    const tile = (gy, gx, m) => { const t = new T.Mesh(tileGeo, m); const [x, z] = W(gy + .5, gx + .5); t.position.set(x, 0, z); group.add(t); return t; };
    // pista (mesma ordem/tabela da tela 2D)
    LudoUI.TRACK.forEach(([r, c], i) => {
      const startOf = i % 13 === 0 ? i / 13 : -1;
      tile(r, c, startOf >= 0 ? seatM[startOf] : cream);
      if (Ludo.SAFE.has(i) && startOf < 0) group.add(star(r + .5, c + .5));
      if (startOf >= 0) group.add(arrow(r + .5, c + .5, startOf));
    });
    LudoUI.LANE.forEach((l, s) => l.forEach(([r, c]) => tile(r, c, seatM[s])));
    // bases: plataforma colorida + quintal branco + 4 pinos
    LudoUI.BASE.forEach(([r, c], s) => {
      const [x, z] = W(r + 3, c + 3);
      const plat = new T.Mesh(slab(CELL * 5.8, CELL * 5.8, TILE_TOP, .3, .05), seatM[s]); plat.position.set(x, 0, z);
      const yard = new T.Mesh(slab(CELL * 4.3, CELL * 4.3, YARD_TOP - TILE_TOP + .02, .35, .04), cream); yard.position.set(x, TILE_TOP - .02, z);
      group.add(plat, yard);
      for (const [dy, dx] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
        const [px, pz] = W(r + 3 + dy, c + 3 + dx);
        const pad = new T.Mesh(new T.CylinderGeometry(.36, .38, .05, 40), seatM[s]); pad.position.set(px, YARD_TOP + .005, pz); group.add(pad);
      }
    });
    // centro: pirâmide de 4 cores (vermelho à esquerda, verde em cima, amarelo à direita, azul embaixo)
    const gh = CELL * 1.5, top = new T.Vector3(0, .12 + GOAL_H, 0), cn = [[-gh, -gh], [gh, -gh], [gh, gh], [-gh, gh]].map(([x, z]) => new T.Vector3(x, .12, z));
    [[3, 0, 0], [0, 1, 1], [1, 2, 2], [2, 3, 3]].forEach(([a, b, s]) => {
      let [p, q] = [cn[a], cn[b]];
      if (new T.Vector3().subVectors(q, p).cross(new T.Vector3().subVectors(top, p)).y < 0) [p, q] = [q, p]; // face virada para fora
      const geo = new T.BufferGeometry().setFromPoints([p, q, top]); geo.computeVertexNormals();
      group.add(new T.Mesh(geo, seatM[s]));
    });
    const goalBase = new T.Mesh(slab(CELL * 3, CELL * 3, .12, .05, .02), mat('#3a2614')); group.add(goalBase);
    const cap = new T.Mesh(new T.SphereGeometry(.16, 24, 16), mat('#f3b733', { metalness: .5, roughness: .3 })); cap.position.copy(top); group.add(cap);
    group.children.forEach(o => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } });

    // dado
    const faces = [1, 2, 3, 4, 5, 6].reduce((o, n) => (o[n] = dieFace(n), o), {});
    die = new T.Mesh(new T.BoxGeometry(DIE, DIE, DIE), FACE_VAL.map(v => new T.MeshStandardMaterial({ map: faces[v], roughness: .3 })));
    die.castShadow = die.receiveShadow = true; scene.add(die);
    die.position.copy(DIE_REST()); die.quaternion.copy(faceUpQuat(6, .3));
    dieRing = new T.Mesh(new T.TorusGeometry(DIE * .8, .04, 10, 48), mat(0xf3b733, { emissive: 0xb07b0e, emissiveIntensity: .8 }));
    dieRing.rotation.x = -Math.PI / 2; dieRing.position.set(die.position.x, -.33, die.position.z); scene.add(dieRing);

    bindInput(); new ResizeObserver(resize).observe(wrap); resize();
    mounted = true;
  }

  function star(gy, gx) {
    const s = new T.Shape();
    for (let k = 0; k < 10; k++) { const r = k % 2 ? .1 : .22, a = k / 10 * Math.PI * 2 - Math.PI / 2; k ? s.lineTo(Math.cos(a) * r, Math.sin(a) * r) : s.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
    const geo = new T.ExtrudeGeometry(s, { depth: .03, bevelEnabled: true, bevelSize: .015, bevelThickness: .015, bevelSegments: 2 }); geo.rotateX(-Math.PI / 2);
    const m = new T.Mesh(geo, mat('#c9a14a', { metalness: .4, roughness: .35 })); const [x, z] = W(gy, gx); m.position.set(x, TILE_TOP, z); return m;
  }
  function arrow(gy, gx, seat) { // seta branca na casa de saída, apontando para o sentido do movimento
    const s = new T.Shape(); s.moveTo(-.18, -.08); s.lineTo(.04, -.08); s.lineTo(.04, -.16); s.lineTo(.2, 0); s.lineTo(.04, .16); s.lineTo(.04, .08); s.lineTo(-.18, .08); s.closePath();
    const geo = new T.ExtrudeGeometry(s, { depth: .02, bevelEnabled: false }); geo.rotateX(-Math.PI / 2);
    const m = new T.Mesh(geo, mat('#ffffff')); const [x, z] = W(gy, gx); m.position.set(x, TILE_TOP + .001, z);
    m.rotation.y = [0, -Math.PI / 2, Math.PI, Math.PI / 2][seat]; return m;
  }

  // ---------- câmera (giro limitado) e clique ----------
  function resize() {
    if (!renderer || !wrap) return;
    const w = wrap.clientWidth, h = wrap.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false); canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  function placeCamera() {
    const r = 23 * Math.max(1, 1.05 / camera.aspect) * cam.zoom, a = cam.az * Math.PI / 180, p = cam.polar * Math.PI / 180;
    camera.position.set(r * Math.sin(p) * Math.sin(a), r * Math.cos(p), r * Math.sin(p) * Math.cos(a));
    camera.lookAt(0, -.4, .9);
  }
  function pick(e) {
    const r = canvas.getBoundingClientRect();
    raycaster.setFromCamera(new T.Vector2((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1), camera);
    if (hint && raycaster.intersectObject(die).length) return { die: true };
    const can = Object.values(pawns).filter(p => p.userData.can);
    const hit = raycaster.intersectObjects(can, true)[0]; if (!hit) return null;
    let o = hit.object; while (o && o.userData.k === undefined) o = o.parent;
    return o ? { k: o.userData.k } : null;
  }
  function bindInput() {
    let down = null;
    canvas.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY, az: cam.az, polar: cam.polar, moved: false }; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', e => {
      if (!down) { canvas.style.cursor = pick(e) ? 'pointer' : 'grab'; return; }
      const dx = e.clientX - down.x, dy = e.clientY - down.y;
      if (Math.abs(dx) + Math.abs(dy) > 5) down.moved = true;
      if (down.moved) { cam.az = Math.max(-25, Math.min(25, down.az - dx * .15)); cam.polar = Math.max(28, Math.min(58, down.polar - dy * .15)); canvas.style.cursor = 'grabbing'; }
    });
    canvas.addEventListener('pointerup', e => {
      const d = down; down = null; if (!d || d.moved) return;
      const hit = pick(e); if (!hit) return;
      if (hit.die) handlers.onDice?.(); else handlers.onPiece?.(hit.k);
    });
    canvas.addEventListener('dblclick', () => { cam.az = 0; cam.polar = 50; cam.zoom = 1; });
    canvas.addEventListener('wheel', e => { e.preventDefault(); cam.zoom = Math.max(.75, Math.min(1.25, cam.zoom * (1 + e.deltaY * .001))); }, { passive: false });
  }

  function loop(t) {
    // para sozinho quando a tela do jogo sai de vista (hub, sala, Magnata)
    if (!canvas.isConnected || !canvas.offsetParent) { active = false; return; }
    raf = requestAnimationFrame(loop);
    const s = t / 1000;
    for (const g of Object.values(pawns)) {
      g.userData.ring.visible = g.userData.can;
      if (!g.userData.walking) g.userData.lift.position.y = g.userData.can ? Math.abs(Math.sin(s * 4)) * .18 : 0;
    }
    dieRing.visible = hint && !rolling;
    if (hint && !rolling) die.position.y = DIE_REST().y + Math.abs(Math.sin(s * 3)) * .12;
    placeCamera(); renderer.render(scene, camera);
  }
  function show(on) {
    if (on && !active) { active = true; resize(); raf = requestAnimationFrame(loop); }
    if (!on) { active = false; cancelAnimationFrame(raf); }
  }

  // ---------- estado ----------
  // mySeat: a sua cor fica no canto da frente à esquerda; espectador vê na posição padrão
  function reset(mySeat) {
    for (const g of Object.values(pawns)) group.remove(g);
    pawns = {};
    group.rotation.y = mySeat == null ? 0 : ((mySeat + 1) % 4) * Math.PI / 2;
    cam.az = 0; cam.polar = 50; cam.zoom = 1;
  }
  const tween = (ms, delay, fn) => new Promise(res => {
    const t0 = performance.now() + delay;
    const f = now => { const k = Math.min(1, Math.max(0, (now - t0) / ms)); fn(k); k < 1 ? requestAnimationFrame(f) : res(); };
    requestAnimationFrame(f);
  });
  const place = (g, gy, gx, lift = 0) => { const [x, z] = W(gy, gx); g.position.set(x, surfaceY(gy, gx) + lift, z); };

  // pieces: [{id, seat, k, y, x, can}]; moves: [{id, pts:[[y,x],...], back}] — devolve quanto tempo a caminhada leva
  function sync(pieces, moves) {
    const want = new Set();
    for (const p of pieces) {
      want.add(p.id);
      let g = pawns[p.id];
      if (!g) { g = pawns[p.id] = pawnModel(Ludo.SEATS[p.seat].color); g.userData.k = p.k; group.add(g); place(g, p.y, p.x); }
      g.userData.can = p.can; g.userData.to = [p.y, p.x];
      if (!g.userData.walking) place(g, p.y, p.x);
    }
    for (const id of Object.keys(pawns)) if (!want.has(id)) { group.remove(pawns[id]); delete pawns[id]; }
    const walkMs = Math.max(0, ...moves.filter(m => !m.back).map(m => (m.pts.length - 1) * STEP));
    for (const m of moves) {
      const g = pawns[m.id]; if (!g) continue;
      const pts = m.pts.slice(); pts[pts.length - 1] = g.userData.to;
      const n = pts.length - 1, dur = m.back ? 650 : n * STEP, hop = m.back ? 2.2 : .5, token = (g.userData.walking = {});
      g.userData.lift.position.y = 0;
      place(g, ...pts[0]);
      tween(dur, m.back ? walkMs : 0, k => {
        if (g.userData.walking !== token) return;
        const f = Math.min(n - 1, Math.floor(k * n)), u = k * n - f, [y0, x0] = pts[f], [y1, x1] = pts[f + 1];
        const gy = y0 + (y1 - y0) * u, gx = x0 + (x1 - x0) * u;
        const base = surfaceY(y0, x0) + (surfaceY(y1, x1) - surfaceY(y0, x0)) * u;
        const [x, z] = W(gy, gx); g.position.set(x, base + Math.sin(Math.PI * u) * hop, z);
        if (k === 1) { g.userData.walking = null; place(g, ...g.userData.to); }
      });
    }
    return walkMs;
  }

  function setHint(on) { hint = on; if (!on && !rolling && die) die.position.y = DIE_REST().y; }

  async function rollDice(v) {
    rolling = true; SFX.shake();
    const end = DIE_REST(), start = end.clone().add(new T.Vector3(rand(-1, 1), 0, rand(2.5, 3.5)));
    const qf = faceUpQuat(v, rand(-.6, .6)), axis = new T.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize(), spin = rand(14, 20);
    [.2, .6, .87].forEach((o, i) => setTimeout(() => SFX.bounce?.(.9 - i * .25, .1), 1150 * o));
    await tween(1150, 0, k => {
      const e = 1 - (1 - k) ** 3;
      die.position.lerpVectors(start, end, e);
      die.position.y = end.y + 3 * (1 - k) ** 2 * Math.abs(Math.cos(k * Math.PI * 2.5));
      die.quaternion.setFromAxisAngle(axis, spin * (1 - e)).multiply(qf);
    });
    rolling = false;
  }

  function supported() {
    if (!window.THREE) return false;
    try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
  }

  return { supported, mount, show, reset, sync, rollDice, setHint, STEP };
})();
