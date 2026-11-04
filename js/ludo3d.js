// ===== Ludo em 3D (Three.js) — só visualização; regras ficam em js/ludo.js =====
// Estilo cartoon de jogo de tabuleiro: cores vivas, contorno escuro nas peças, peças gordinhas com olhinhos,
// sombra de contato embaixo de tudo, ladrilhos que afundam ao serem pisados, dado arremessado na mesa.
// Coordenadas de entrada em "grade" 15×15 contínua (linha y, coluna x), as mesmas da tela 2D.
const Ludo3D = (() => {
  const B = 10, CELL = B / 15, STEP = 220;
  const TILE_TOP = .2, YARD_TOP = .3, GOAL_H = .55, DIE = .82, TABLE = -.45;
  const CAM_STEP = 12.5, CAM_MAX = 25;
  const rand = (a, b) => a + Math.random() * (b - a);
  let T, renderer, scene, camera, raycaster, canvas, wrap, group, die, dieRing, dieBlob, ctl;
  let mounted = false, active = false, raf = 0, handlers = {}, pawns = {}, hint = false, rolling = false, tiles = {}, pressed = new Set(), ac = null;
  let ink, blobTex;
  const cam = { az: 0, azTo: 0, polar: 50 };

  const W = (gy, gx) => [(gx - 7.5) * CELL, (gy - 7.5) * CELL]; // grade → mundo local (x, z)
  function surfaceY(gy, gx) {
    if (gx >= 6 && gx <= 9 && gy >= 6 && gy <= 9) return .12 + GOAL_H * Math.max(0, 1 - Math.max(Math.abs(gx - 7.5), Math.abs(gy - 7.5)) / 1.5);
    if ((gx < 6 || gx > 9) && (gy < 6 || gy > 9)) return YARD_TOP;
    return TILE_TOP;
  }

  // ---------- materiais cartoon ----------
  // cores em hex são sRGB; converte para linear senão tudo sai desbotado com outputEncoding sRGB
  const col = c => new T.Color(c).convertSRGBToLinear();
  // sombreado suave e fosco (como o Monopoly 3D de referência); o ar de desenho vem do contorno e das cores
  const toon = (color, o = {}) => new T.MeshStandardMaterial({ color: col(color), roughness: .6, metalness: 0, ...o, ...(o.emissive != null && { emissive: col(o.emissive) }) });
  // contorno "desenho animado": casca um pouco maior, só com as faces de trás, em cor de tinta
  function outline(mesh, sx = 1.06, sy = sx, sz = sx) {
    const o = new T.Mesh(mesh.geometry, ink); o.scale.set(sx, sy, sz); o.castShadow = false; o.userData.outline = true; mesh.add(o); return mesh;
  }
  const shadowy = o => (o.traverse(m => { if (m.isMesh && !m.userData.outline) { m.castShadow = true; m.receiveShadow = true; } }), o);
  // sombra de contato (mancha escura macia): é o que tira a sensação de "flutuar"
  function blob(size, opacity = .5) {
    const m = new T.Mesh(new T.PlaneGeometry(size, size), new T.MeshBasicMaterial({ map: blobTex, transparent: true, opacity, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.renderOrder = 1; return m;
  }
  // bloco arredondado e chanfrado, apoiado em y = 0
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
  // cubo com cantos arredondados: empurra cada vértice para a casca de raio r em volta de um cubo interno
  function roundedBox(size, r, seg = 10) {
    const g = new T.BoxGeometry(size, size, size, seg, seg, seg), p = g.attributes.position, n = g.attributes.normal, v = new T.Vector3(), c = new T.Vector3(), k = size / 2 - r;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      c.set(Math.max(-k, Math.min(k, v.x)), Math.max(-k, Math.min(k, v.y)), Math.max(-k, Math.min(k, v.z)));
      v.sub(c).normalize(); n.setXYZ(i, v.x, v.y, v.z);
      v.multiplyScalar(r).add(c); p.setXYZ(i, v.x, v.y, v.z);
    }
    return g;
  }

  // ---------- modelos ----------
  // peão gordinho com olhinhos, sempre olhando para a câmera
  function pawnModel(color) {
    const g = new T.Group(), m = toon(color);
    const prof = [[0, 0], [.29, 0], [.31, .035], [.29, .08], [.2, .11], [.16, .16], [.17, .26], [.13, .36], [.18, .39], [.18, .42], [0, .43]].map(([x, y]) => new T.Vector2(x, y));
    const body = outline(new T.Mesh(new T.LatheGeometry(prof, 40), m), 1.08, 1.04, 1.08);
    const head = outline(new T.Mesh(new T.SphereGeometry(.2, 32, 20), m), 1.09); head.position.y = .58;
    const eyeM = new T.MeshBasicMaterial({ color: 0x1d120a }), glint = new T.MeshBasicMaterial({ color: 0xffffff });
    const face = new T.Group(); face.position.y = .6;
    for (const x of [-.07, .07]) {
      const e = new T.Mesh(new T.SphereGeometry(.036, 12, 10), eyeM); e.position.set(x, 0, .18); e.scale.z = .6;
      const gl = new T.Mesh(new T.SphereGeometry(.012, 8, 6), glint); gl.position.set(x - .012, .014, .2);
      face.add(e, gl);
    }
    const shine = new T.Mesh(new T.SphereGeometry(.05, 12, 8), new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .8 })); shine.position.set(-.08, .7, .12);
    const ring = new T.Mesh(new T.TorusGeometry(.36, .04, 10, 48), toon('#ffd23f', { emissive: '#b07b0e', emissiveIntensity: .6 }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = .03; ring.visible = false;
    const shadow = blob(.85, .55); shadow.position.y = .012;
    const lift = new T.Group(); lift.add(body, head, face, shine); lift.rotation.y = -group.rotation.y;
    g.add(shadow, lift, ring); g.userData = { lift, ring, shadow };
    shadowy(lift); return g;
  }

  const PIPS = { 1: [[.5, .5]], 2: [[.27, .27], [.73, .73]], 3: [[.27, .27], [.5, .5], [.73, .73]], 4: [[.27, .27], [.73, .27], [.27, .73], [.73, .73]], 5: [[.27, .27], [.73, .27], [.5, .5], [.27, .73], [.73, .73]], 6: [[.27, .25], [.73, .25], [.27, .5], [.73, .5], [.27, .75], [.73, .75]] };
  const dieFace = n => canvasTex(256, 256, (ctx, w) => {
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, w);
    for (const [x, y] of PIPS[n]) {
      const rr = n === 1 ? 36 : 26, cx = 34 + x * (w - 68), cy = 34 + y * (w - 68);
      ctx.fillStyle = n === 1 ? '#e8382c' : '#22263a'; ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.beginPath(); ctx.arc(cx - rr * .3, cy - rr * .3, rr * .28, 0, Math.PI * 2); ctx.fill();
    }
  });
  const FACE_VAL = [2, 5, 3, 4, 1, 6]; // ordem dos materiais do BoxGeometry: +x, -x, +y, -y, +z, -z
  function faceUpQuat(v, yaw) {
    const n = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]][FACE_VAL.indexOf(v)];
    const q = new T.Quaternion().setFromUnitVectors(new T.Vector3(...n), new T.Vector3(0, 1, 0));
    return new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), yaw).multiply(q);
  }
  const DIE_REST = () => new T.Vector3(1.6, TABLE + DIE / 2, B / 2 + 1.55); // na mesa, à frente do tabuleiro

  // ---------- cena ----------
  function mount(container, h) {
    handlers = h; wrap = container;
    if (mounted) { if (canvas.parentNode !== wrap) wrap.append(canvas, ctl); resize(); return; }
    T = window.THREE;
    renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.outputEncoding = T.sRGBEncoding;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
    canvas = renderer.domElement; canvas.className = 'ludo-gl'; wrap.appendChild(canvas);
    // botões de câmera: a câmera só se mexe por aqui (clicar no tabuleiro nunca gira nada)
    ctl = document.createElement('div'); ctl.className = 'ludo-cam';
    ctl.innerHTML = '<button data-r="-1" title="Girar para a esquerda">⟲</button><button data-r="0" title="Voltar a câmera">⌖</button><button data-r="1" title="Girar para a direita">⟳</button>';
    ctl.onclick = e => { const b = e.target.closest('button'); if (!b) return; const r = +b.dataset.r; cam.azTo = r ? Math.max(-CAM_MAX, Math.min(CAM_MAX, cam.azTo + r * CAM_STEP)) : 0; SFX.click(); };
    wrap.appendChild(ctl);

    ink = new T.MeshBasicMaterial({ color: col('#2a1a10'), side: T.BackSide });
    blobTex = canvasTex(128, 128, (ctx, w) => { const g = ctx.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); g.addColorStop(0, 'rgba(0,0,0,.9)'); g.addColorStop(.45, 'rgba(0,0,0,.5)'); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, w); });

    scene = new T.Scene();
    camera = new T.PerspectiveCamera(34, 1, .1, 200);
    raycaster = new T.Raycaster();
    scene.add(new T.HemisphereLight(0xfffaf0, 0x6b4a30, .6));
    const sun = new T.DirectionalLight(0xfff4e0, 1.0); sun.position.set(5, 14, 9); sun.castShadow = true;
    Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10, near: 1, far: 45 });
    sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -.002; sun.shadow.normalBias = .02; sun.shadow.radius = 3; scene.add(sun);
    scene.add(new T.AmbientLight(0xffffff, .25));

    // mesa de madeira (o tabuleiro fica apoiado nela)
    const wood = new T.TextureLoader().load(IMG.bg_wood); wood.encoding = T.sRGBEncoding; wood.wrapS = wood.wrapT = T.RepeatWrapping; wood.repeat.set(3, 3);
    const table = new T.Mesh(new T.PlaneGeometry(90, 90), new T.MeshStandardMaterial({ map: wood, roughness: .8 }));
    table.rotation.x = -Math.PI / 2; table.position.y = TABLE; table.receiveShadow = true; scene.add(table);

    // tabuleiro: base grossa azul-escura (estilo do Monopoly 3D) com tampo creme, girado para a sua cor ficar à frente
    group = new T.Group(); scene.add(group);
    const base = outline(new T.Mesh(slab(B + .9, B + .9, -TABLE + .02, .45, .08), toon('#24304d')), 1.012, 1.04, 1.012); base.position.y = TABLE;
    const top = new T.Mesh(slab(B + .25, B + .25, .05, .3, .02), toon('#d9cdb4')); top.position.y = -.03;
    const under = blob(B + 3, .45); under.position.y = TABLE + .006; scene.add(under);
    group.add(shadowy(base), shadowy(top));

    const S = Ludo.SEATS.map(s => s.color), cream = toon('#fffaf0'), seatM = S.map(c => toon(c));
    const tileGeo = slab(CELL * .92, CELL * .92, TILE_TOP, .08, .04);
    const tile = (gy, gx, m) => {
      const t = new T.Mesh(tileGeo, m); const [x, z] = W(gy + .5, gx + .5); t.position.set(x, 0, z);
      group.add(shadowy(t)); tiles[gy + ',' + gx] = t; return t;
    };
    // pista (mesma tabela da tela 2D); estrelas e setas vão dentro do ladrilho, para afundarem junto
    LudoUI.TRACK.forEach(([r, c], i) => {
      const startOf = i % 13 === 0 ? i / 13 : -1, t = tile(r, c, startOf >= 0 ? seatM[startOf] : cream);
      if (Ludo.SAFE.has(i) && startOf < 0) t.add(star());
      if (startOf >= 0) t.add(arrow(startOf));
    });
    LudoUI.LANE.forEach((l, s) => l.forEach(([r, c]) => tile(r, c, seatM[s])));
    // bases: plataforma colorida + quintal creme + 4 pinos
    LudoUI.BASE.forEach(([r, c], s) => {
      const [x, z] = W(r + 3, c + 3);
      const plat = outline(new T.Mesh(slab(CELL * 5.8, CELL * 5.8, TILE_TOP, .35, .06), seatM[s]), 1.012, 1.06, 1.012); plat.position.set(x, 0, z);
      const yard = new T.Mesh(slab(CELL * 4.3, CELL * 4.3, YARD_TOP - TILE_TOP + .02, .4, .04), cream); yard.position.set(x, TILE_TOP - .02, z);
      group.add(shadowy(plat), shadowy(yard));
      for (const [dy, dx] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
        const [px, pz] = W(r + 3 + dy, c + 3 + dx);
        const pad = new T.Mesh(new T.CylinderGeometry(.37, .39, .05, 40), seatM[s]); pad.position.set(px, YARD_TOP + .005, pz); group.add(pad);
      }
    });
    // centro: pirâmide de 4 cores (vermelho à esquerda, verde em cima, amarelo à direita, azul embaixo)
    const gh = CELL * 1.5, apex = new T.Vector3(0, .12 + GOAL_H, 0), cn = [[-gh, -gh], [gh, -gh], [gh, gh], [-gh, gh]].map(([x, z]) => new T.Vector3(x, .12, z));
    [[3, 0, 0], [0, 1, 1], [1, 2, 2], [2, 3, 3]].forEach(([a, b, s]) => {
      let [p, q] = [cn[a], cn[b]];
      if (new T.Vector3().subVectors(q, p).cross(new T.Vector3().subVectors(apex, p)).y < 0) [p, q] = [q, p]; // face virada para fora
      const geo = new T.BufferGeometry().setFromPoints([p, q, apex]); geo.computeVertexNormals();
      group.add(shadowy(new T.Mesh(geo, seatM[s])));
    });
    group.add(outline(new T.Mesh(slab(CELL * 3.05, CELL * 3.05, .12, .06, .02), toon('#24304d')), 1.02, 1.1, 1.02));
    const cap = outline(new T.Mesh(new T.SphereGeometry(.17, 24, 16), toon('#ffd23f')), 1.1); cap.position.copy(apex); group.add(cap);

    // dado
    const faces = [1, 2, 3, 4, 5, 6].reduce((o, n) => (o[n] = dieFace(n), o), {});
    die = outline(new T.Mesh(roundedBox(DIE, DIE * .18), FACE_VAL.map(v => new T.MeshStandardMaterial({ map: faces[v], roughness: .35 }))), 1.06);
    die.castShadow = true; scene.add(die);
    die.position.copy(DIE_REST()); die.quaternion.copy(faceUpQuat(6, .3));
    dieBlob = blob(DIE * 1.9, .6); scene.add(dieBlob);
    dieRing = new T.Mesh(new T.TorusGeometry(DIE * .85, .045, 10, 48), toon('#ffd23f', { emissive: '#b07b0e', emissiveIntensity: .6 }));
    dieRing.rotation.x = -Math.PI / 2; dieRing.position.set(die.position.x, TABLE + .02, die.position.z); scene.add(dieRing);

    bindInput(); new ResizeObserver(resize).observe(wrap); resize();
    mounted = true;
  }

  function star() {
    const s = new T.Shape();
    for (let k = 0; k < 10; k++) { const r = k % 2 ? .1 : .22, a = k / 10 * Math.PI * 2 - Math.PI / 2; k ? s.lineTo(Math.cos(a) * r, Math.sin(a) * r) : s.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
    const geo = new T.ExtrudeGeometry(s, { depth: .03, bevelEnabled: true, bevelSize: .015, bevelThickness: .015, bevelSegments: 2 }); geo.rotateX(-Math.PI / 2);
    const m = new T.Mesh(geo, toon('#ffc23a')); m.position.y = TILE_TOP; return m;
  }
  function arrow(seat) { // seta branca na casa de saída, apontando para o sentido do movimento
    const s = new T.Shape(); s.moveTo(-.18, -.08); s.lineTo(.04, -.08); s.lineTo(.04, -.16); s.lineTo(.2, 0); s.lineTo(.04, .16); s.lineTo(.04, .08); s.lineTo(-.18, .08); s.closePath();
    const geo = new T.ExtrudeGeometry(s, { depth: .02, bevelEnabled: false }); geo.rotateX(-Math.PI / 2);
    const m = new T.Mesh(geo, toon('#ffffff')); m.position.y = TILE_TOP + .001;
    m.rotation.y = [0, -Math.PI / 2, Math.PI, Math.PI / 2][seat]; return m;
  }

  // ---------- câmera e clique ----------
  function resize() {
    if (!renderer || !wrap) return;
    const w = wrap.clientWidth, h = wrap.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false); canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  function placeCamera() {
    const r = 18.5 * Math.max(1, 1.1 / camera.aspect), a = cam.az * Math.PI / 180, p = cam.polar * Math.PI / 180;
    camera.position.set(r * Math.sin(p) * Math.sin(a), r * Math.cos(p), r * Math.sin(p) * Math.cos(a));
    camera.lookAt(0, -.5, 1.5);
  }
  function pick(e) {
    const r = canvas.getBoundingClientRect();
    raycaster.setFromCamera(new T.Vector2((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1), camera);
    if (hint && raycaster.intersectObject(die, true).length) return { die: true };
    const can = Object.values(pawns).filter(p => p.userData.can);
    const hit = raycaster.intersectObjects(can, true)[0]; if (!hit) return null;
    let o = hit.object; while (o && o.userData.k === undefined) o = o.parent;
    return o ? { k: o.userData.k } : null;
  }
  function bindInput() {
    let down = null;
    canvas.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY }; });
    canvas.addEventListener('pointermove', e => { canvas.style.cursor = pick(e) ? 'pointer' : 'default'; });
    canvas.addEventListener('pointerup', e => {
      const d = down; down = null;
      if (!d || Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 8) return;
      const hit = pick(e); if (!hit) return;
      if (hit.die) handlers.onDice?.(); else handlers.onPiece?.(hit.k);
    });
  }

  function loop(t) {
    // para sozinho quando a tela do jogo sai de vista (hub, sala, Magnata)
    if (!canvas.isConnected || !canvas.offsetParent) { active = false; return; }
    raf = requestAnimationFrame(loop);
    const s = t / 1000, pulse = Math.sin(s * 6);
    for (const g of Object.values(pawns)) {
      const { ring, lift, shadow } = g.userData;
      ring.visible = g.userData.can; ring.scale.setScalar(1 + .1 * pulse);
      // peão que pode andar "respira" (espreme e estica) sem sair do chão
      const sq = g.userData.can && !g.userData.walking ? .05 * pulse : 0;
      lift.scale.set(1 - sq * .6, 1 + sq, 1 - sq * .6);
      if (!g.userData.walking) { lift.position.y = 0; shadow.position.y = .012; shadow.scale.setScalar(1); place(g, ...g.userData.to); }
      g.scale.setScalar(g.scale.x + ((g.userData.scale || 1) - g.scale.x) * .2);
    }
    const now = performance.now();
    for (const tl of pressed) {
      const d = (now - tl.userData.t0) / 1000;
      tl.position.y = -.1 * Math.min(1, d / .05) * Math.exp(-d * 6) * Math.cos(d * 17);
      if (d > 1.2) { tl.position.y = 0; pressed.delete(tl); }
    }
    dieRing.visible = hint && !rolling; dieRing.scale.setScalar(1 + .08 * pulse);
    const hgt = Math.max(0, die.position.y - DIE_REST().y);
    dieBlob.position.set(die.position.x, TABLE + .008, die.position.z); dieBlob.scale.setScalar(1 / (1 + hgt * .5)); dieBlob.material.opacity = .6 / (1 + hgt);
    cam.az += (cam.azTo - cam.az) * .1;
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
    cam.az = cam.azTo = 0;
  }
  const tween = (ms, delay, fn) => new Promise(res => {
    const t0 = performance.now() + delay;
    const f = now => { const k = Math.min(1, Math.max(0, (now - t0) / ms)); fn(k); k < 1 ? requestAnimationFrame(f) : res(); };
    requestAnimationFrame(f);
  });
  const tileAt = (gy, gx) => tiles[Math.floor(gy) + ',' + Math.floor(gx)];
  const tileY = (gy, gx) => tileAt(gy, gx)?.position.y || 0;
  function press(gy, gx) { const t = tileAt(gy, gx); if (t) { t.userData.t0 = performance.now(); pressed.add(t); } }
  const place = (g, gy, gx) => { const [x, z] = W(gy, gx); g.position.set(x, surfaceY(gy, gx) + tileY(gy, gx), z); };

  // pieces: [{id, seat, k, y, x, can, scale}]; moves: [{id, pts:[[y,x],...], back}] — devolve quanto tempo a caminhada leva
  function sync(pieces, moves) {
    const want = new Set();
    for (const p of pieces) {
      want.add(p.id);
      let g = pawns[p.id];
      if (!g) { g = pawns[p.id] = pawnModel(Ludo.SEATS[p.seat].color); g.userData.k = p.k; group.add(g); place(g, p.y, p.x); }
      g.userData.can = p.can; g.userData.to = [p.y, p.x]; g.userData.scale = p.scale || 1;
      if (!g.userData.walking) place(g, p.y, p.x);
    }
    for (const id of Object.keys(pawns)) if (!want.has(id)) { group.remove(pawns[id]); delete pawns[id]; }
    const walkMs = Math.max(0, ...moves.filter(m => !m.back).map(m => (m.pts.length - 1) * STEP));
    for (const m of moves) {
      const g = pawns[m.id]; if (!g) continue;
      const pts = m.pts.slice(); pts[pts.length - 1] = g.userData.to;
      const n = pts.length - 1, dur = m.back ? 650 : n * STEP, hop = m.back ? 2.2 : .5, token = (g.userData.walking = {}), { lift, shadow } = g.userData;
      place(g, ...pts[0]);
      let landed = 0;
      if (m.back) setTimeout(() => boing(), walkMs);
      tween(dur, m.back ? walkMs : 0, k => {
        if (g.userData.walking !== token) return;
        const f = Math.min(n - 1, Math.floor(k * n)), u = k * n - f, [y0, x0] = pts[f], [y1, x1] = pts[f + 1];
        if (f > landed) { press(...pts[landed = f]); tok(landed); }
        const gy = y0 + (y1 - y0) * u, gx = x0 + (x1 - x0) * u;
        const base = (surfaceY(y0, x0) + tileY(y0, x0)) * (1 - u) + (surfaceY(y1, x1) + tileY(y1, x1)) * u, up = Math.sin(Math.PI * u) * hop;
        const [x, z] = W(gy, gx); g.position.set(x, base, z);
        // sobe só o corpo; a sombra fica no chão e encolhe enquanto ele está no ar
        lift.position.y = up; shadow.scale.setScalar(1 - .5 * up / (hop + .01));
        if (k === 1) { g.userData.walking = null; lift.position.y = 0; shadow.scale.setScalar(1); press(...g.userData.to); if (!m.back) tok(n); place(g, ...g.userData.to); }
      });
    }
    return walkMs;
  }

  function setHint(on) { hint = on; }

  async function rollDice(v) {
    rolling = true;
    const end = DIE_REST(), start = end.clone().add(new T.Vector3(rand(3.5, 4.5), 0, rand(-.3, .6)));
    const qf = faceUpQuat(v, rand(-.6, .6)), axis = new T.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize(), spin = rand(14, 20);
    diceSound(1150);
    await tween(1150, 0, k => {
      const e = 1 - (1 - k) ** 3;
      die.position.lerpVectors(start, end, e);
      die.position.y = end.y + 3 * (1 - k) ** 2 * Math.abs(Math.cos(k * Math.PI * 2.5));
      die.quaternion.setFromAxisAngle(axis, spin * (1 - e)).multiply(qf);
    });
    rolling = false;
  }

  // ---------- sons (WebAudio, sem arquivo) ----------
  function audio() {
    if (SFX.isMuted()) return null;
    try { ac ||= new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === 'suspended') ac.resume(); } catch { return null; }
    return ac;
  }
  function noiseHit(a, t, v, f, q, decay) {
    const len = Math.floor(a.sampleRate * .06), buf = a.createBuffer(1, len, a.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (a.sampleRate * decay));
    const src = a.createBufferSource(); src.buffer = buf; src.playbackRate.value = rand(.9, 1.15);
    const bp = a.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q;
    const g = a.createGain(); g.gain.value = v; src.connect(bp).connect(g).connect(a.destination); src.start(t);
  }
  function tone(a, t, type, f0, f1, v, dur) {
    const o = a.createOscillator(), g = a.createGain(); o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + .02);
  }
  // dado de plástico batendo e rolando na mesa de madeira
  function knock(a, t, v) {
    noiseHit(a, t, v * 1.1, rand(2600, 4200), 1.3, rand(.004, .008));
    tone(a, t, 'triangle', rand(1000, 1500), rand(550, 750), v * .3, .06);
    tone(a, t, 'sine', rand(150, 190), 85, v * .55, .11);
  }
  function diceSound(ms) {
    const a = audio(); if (!a) return; const t0 = a.currentTime, D = ms / 1000;
    [[.2, 1], [.6, .6], [1, .32]].forEach(([o, v]) => { knock(a, t0 + D * o, v); knock(a, t0 + D * o + rand(.012, .03), v * .5); });
    for (let i = 0, t = .63; i < 6; i++, t += .045 + i * .012) knock(a, t0 + D * t, .25 * (1 - i / 7));
  }
  // passo do peão: "toc" de plástico no ladrilho, um pouquinho mais agudo a cada casa
  function tok(i) {
    const a = audio(); if (!a) return; const t = a.currentTime, f = 520 * Math.pow(1.06, Math.min(i, 12));
    tone(a, t, 'triangle', f * 1.6, f, .22, .07);
    tone(a, t, 'sine', 210, 120, .3, .08);
    noiseHit(a, t, .25, 3000, 1.5, .003);
  }
  // peça capturada voltando para a base
  function boing() {
    const a = audio(); if (!a) return; const t = a.currentTime;
    const o = a.createOscillator(), g = a.createGain(); o.type = 'sine';
    o.frequency.setValueAtTime(180, t); o.frequency.exponentialRampToValueAtTime(720, t + .18); o.frequency.exponentialRampToValueAtTime(260, t + .5);
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.35, t + .03); g.gain.exponentialRampToValueAtTime(.0001, t + .55);
    const lfo = a.createOscillator(), lg = a.createGain(); lfo.frequency.value = 22; lg.gain.value = 40; lfo.connect(lg).connect(o.frequency);
    o.connect(g).connect(a.destination); o.start(t); lfo.start(t); o.stop(t + .6); lfo.stop(t + .6);
    noiseHit(a, t + .62, .5, 900, .8, .02); // pouso na base
  }

  function supported() {
    if (!window.THREE) return false;
    try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
  }

  return { supported, mount, show, reset, sync, rollDice, setHint, STEP };
})();
