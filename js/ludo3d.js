// ===== Ludo em 3D (Three.js) — só visualização; regras ficam em js/ludo.js =====
// Estilo cartoon de jogo de tabuleiro: cores vivas, contorno escuro nas peças, peças gordinhas com olhinhos,
// sombra de contato embaixo de tudo, ladrilhos que afundam ao serem pisados, dado arremessado na mesa.
// Coordenadas de entrada em "grade" 15×15 contínua (linha y, coluna x), as mesmas da tela 2D.
const Ludo3D = (() => {
  const B = 12, CELL = B / 15, STEP = 220;
  const TILE_TOP = .22, YARD_TOP = .34, GOAL_H = .16, DIE = .95, TABLE = -.5;

  const rand = (a, b) => a + Math.random() * (b - a);
  let T, renderer, scene, camera, raycaster, canvas, wrap, group, die, dieRing, dieBlob, ctl;
  let mounted = false, active = false, raf = 0, handlers = {}, pawns = {}, hint = false, rolling = false, tiles = {}, pressed = new Set(), ac = null;
  let pcam, ocam, shake = 0, holdUntil = 0, sunMode = 0, sun, trophy, trophyHop = 0, blobTex, platM = [], fx = [], turnSeat = null, last = 0;
  const cam = { az: 0, azTo: 0, polar: 48, polarTo: 48, zoom: 1, zoomTo: 1, locked: false, dyn: false, follow: null, fz: 1, tgt: null };

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
  const shadowy = o => (o.traverse(m => { if (m.isMesh ) { m.castShadow = true; m.receiveShadow = true; } }), o);
  // sombra de contato (mancha escura macia): é o que tira a sensação de "flutuar"
  function blob(size, opacity = .5) {
    const m = new T.Mesh(new T.PlaneGeometry(size, size), new T.MeshBasicMaterial({ map: blobTex, transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
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

  // "oclusão" barata: escurece a geometria perto da base (cor por vértice), o que dá volume sem pós-processamento
  function ao(g, dark = .6) {
    g.computeBoundingBox(); const p = g.attributes.position, { min, max } = g.boundingBox, h = max.y - min.y || 1, c = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) c.fill(dark + (1 - dark) * Math.pow((p.getY(i) - min.y) / h, .7), i * 3, i * 3 + 3);
    g.setAttribute('color', new T.BufferAttribute(c, 3)); return g;
  }
  const aoCache = new Map();
  const aoMat = m => aoCache.get(m) || (aoCache.set(m, Object.assign(m.clone(), { vertexColors: true })), aoCache.get(m));

  // ---------- modelos ----------
  // peão clássico de plástico liso (base, gola e cabeça), sem contorno
  function pawnModel(color, hat) {
    const g = new T.Group(); g.userData.color = color; const m = new T.MeshPhysicalMaterial({ color: col(color), roughness: .28, clearcoat: .8, clearcoatRoughness: .2 });
    const prof = [[0, 0], [.3, 0], [.32, .035], [.3, .08], [.21, .11], [.16, .16], [.17, .26], [.13, .36], [0, .37]].map(([x, y]) => new T.Vector2(x, y));
    const body = new T.Mesh(new T.LatheGeometry(prof, 48), m);
    const collar = new T.Mesh(new T.TorusGeometry(.15, .045, 12, 36), new T.MeshPhysicalMaterial({ color: col('#ffffff'), roughness: .3, clearcoat: .6 }));
    collar.rotation.x = Math.PI / 2; collar.position.y = .39;
    const head = new T.Mesh(new T.SphereGeometry(.2, 40, 24), m); head.position.y = .58;
    const ring = new T.Mesh(new T.TorusGeometry(.36, .04, 10, 48), toon('#ffd23f', { emissive: '#b07b0e', emissiveIntensity: .6 }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = .03; ring.visible = false;
    const shadow = blob(.85, .55); shadow.position.y = .012;
    const lift = new T.Group(); lift.add(body, collar, head); const hm = hatModel(hat, color); if (hm) lift.add(hm);
    const tilt = new T.Group(); tilt.add(lift);
    g.add(shadow, tilt, ring); Object.assign(g.userData, { lift, tilt, ring, shadow, ph: Math.random() * 6 });
    shadowy(lift); return g;
  }

  // 0: sol girando (sombras longas que mudam); 1: luz de estúdio de cima (sombra curta e bem macia);
  // 2: fim de tarde fixo (sombra longa e quente); 3: só sombra de contato (visual chapado de desenho)
  const SUN_MODES = ['fim de tarde', 'só sombra de contato'];
  function applySun() {
    const c = sun.shadow.camera;
    Object.assign(c, sunMode === 1 ? { left: 100, right: 100.01, top: 100.01, bottom: 100 } : { left: -11, right: 11, top: 11, bottom: -11 }); c.updateProjectionMatrix();
    sun.shadow.radius = 4; sun.color.copy(col('#ffc98a')); sun.intensity = 1.1; sun.position.set(-12, 7, 6);
  }

  // madeira desenhada no canvas: faixas de veio onduladas, fibras finas e alguns nós
  function woodTex() {
    const t = canvasTex(1024, 1024, (ctx, w) => {
      const R = (a, b) => a + Math.random() * (b - a);
      ctx.fillStyle = '#b8682f'; ctx.fillRect(0, 0, w, w);
      for (let i = 0; i < 70; i++) {
        const y0 = R(0, w), amp = R(4, 18), fr = R(.004, .012), ph = R(0, 6), th = R(2, 14);
        ctx.strokeStyle = Math.random() < .6 ? `rgba(110,52,18,${R(.15, .4)})` : `rgba(235,160,95,${R(.12, .3)})`; ctx.lineWidth = th;
        ctx.beginPath(); for (let x = -10; x <= w + 10; x += 8) { const y = y0 + Math.sin(x * fr + ph) * amp + Math.sin(x * fr * 3.1) * amp * .3; x < 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); } ctx.stroke();
      }
      for (let i = 0; i < 2500; i++) { ctx.fillStyle = `rgba(90,40,12,${R(.04, .14)})`; ctx.fillRect(R(0, w), R(0, w), R(10, 60), 1); }
      for (let i = 0; i < 4; i++) {
        const cx = R(80, w - 80), cy = R(80, w - 80);
        for (let r = 30; r > 2; r -= 5) { ctx.strokeStyle = `rgba(95,42,14,${.18 + (30 - r) / 70})`; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.ellipse(cx, cy, r * 2.4, r, 0, 0, Math.PI * 2); ctx.stroke(); }
      }
    });
    t.wrapS = t.wrapT = T.MirroredRepeatWrapping; t.repeat.set(.09, .09); return t;
  }

  // troféu: base, haste, taça com alças e estrela no topo
  function trophyModel() {
    const g = new T.Group(), gold = toon('#f5c22b', { metalness: .45, roughness: .28, emissive: '#7a4c00', emissiveIntensity: .25 });
    const prof = [[0, 0], [.3, 0], [.3, .08], [.22, .1], [.2, .16], [.07, .2], [.05, .38], [.09, .42], [.24, .5], [.3, .68], [.31, .82], [.27, .82], [.25, .7], [.18, .56], [0, .52]].map(([x, y]) => new T.Vector2(x, y));
    const cup = new T.Mesh(new T.LatheGeometry(prof, 48), gold); g.add(cup);
    const base = new T.Mesh(slab(.62, .62, .1, .1, .03), toon('#5a3a22')); base.position.y = -.08; g.add(base);
    for (const sx of [-1, 1]) {
      const c = new T.CubicBezierCurve3(new T.Vector3(sx * .28, .76, 0), new T.Vector3(sx * .5, .78, 0), new T.Vector3(sx * .46, .5, 0), new T.Vector3(sx * .22, .53, 0));
      g.add(new T.Mesh(new T.TubeGeometry(c, 24, .026, 10), gold));
    }
    const sh = blob(1.1, .45); sh.position.y = -.07; g.add(sh);
    g.scale.setScalar(1.5); return shadowy(g);
  }

  // chapéus (ficam em cima da cabeça do peão; cabeça centrada em y = .58, raio .2)
  function hatModel(id, seatC) {
    const g = new T.Group(), M = (c, o) => toon(c, { roughness: .45, ...o }), dark = '#' + new T.Color(seatC).lerp(new T.Color('#000000'), .3).getHexString();
    const cyl = (rt, rb, h, m, y = 0) => { const c = new T.Mesh(new T.CylinderGeometry(rt, rb, h, 32), m); c.position.y = y + h / 2; g.add(c); return c; };
    if (id === 'top') {
      const k = M('#22232b'); cyl(.25, .25, .025, k); cyl(.145, .15, .26, k, .02); cyl(.152, .156, .05, M(seatC), .03);
    } else if (id === 'crown') {
      const gold = M('#f5c22b', { metalness: .45, roughness: .28, emissive: '#7a4c00', emissiveIntensity: .25 });
      const ring = new T.Mesh(new T.LatheGeometry([[.13, 0], [.165, 0], [.165, .09], [.13, .09], [.13, 0]].map(([x, y]) => new T.Vector2(x, y)), 40), gold); g.add(ring);
      for (let i = 0; i < 5; i++) {
        const a = i / 5 * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
        const sp = new T.Mesh(new T.ConeGeometry(.04, .1, 12), gold); sp.position.set(ca * .148, .14, sa * .148); g.add(sp);
        const ball = new T.Mesh(new T.SphereGeometry(.022, 10, 8), gold); ball.position.set(ca * .148, .195, sa * .148); g.add(ball);
        const b2 = a + Math.PI / 5, gem = new T.Mesh(new T.SphereGeometry(.024, 10, 8), M(['#e8382c', '#2f7de1', '#2fbf5a'][i % 3], { roughness: .2 }));
        gem.position.set(Math.cos(b2) * .166, .045, Math.sin(b2) * .166); gem.scale.set(1, 1, .6); gem.lookAt(Math.cos(b2), .045, Math.sin(b2)); g.add(gem);
      }
      g.userData.crown = true;
    } else if (id === 'cap') {
      const c = M(dark), dome = new T.Mesh(new T.SphereGeometry(.205, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), c); dome.position.y = -.04; g.add(dome);
      const visor = new T.Mesh(new T.CylinderGeometry(.16, .16, .02, 32, 1, false, -Math.PI / 2, Math.PI), c); visor.material = M('#ffffff'); visor.position.set(0, -.03, .12); visor.scale.z = 1.3; g.add(visor);
      const btn = new T.Mesh(new T.SphereGeometry(.03, 10, 8), M('#ffffff')); btn.position.y = .17; g.add(btn);
    } else if (id === 'witch') {
      const p = M(dark); cyl(.3, .3, .025, p);
      const cone = new T.Mesh(new T.ConeGeometry(.16, .42, 32), p); cone.position.set(.02, .23, 0); cone.rotation.z = -.25; g.add(cone);
      cyl(.165, .17, .05, M('#ffffff'), .02);
    } else if (id === 'party') {
      const cone = new T.Mesh(new T.ConeGeometry(.12, .34, 32), M(seatC)); cone.position.y = .17; g.add(cone);
      for (const [y, r] of [[.08, .1], [.18, .068]]) { const st = new T.Mesh(new T.TorusGeometry(r, .016, 8, 32), M('#ffffff')); st.rotation.x = Math.PI / 2; st.position.y = y; g.add(st); }
      const pom = new T.Mesh(new T.SphereGeometry(.05, 14, 10), M('#ffffff')); pom.position.y = .35; g.add(pom);
    } else if (id === 'cowboy') {
      const b = M('#a0672f'), brim = new T.Mesh(new T.CylinderGeometry(.32, .32, .025, 40), b); brim.scale.z = .85; brim.position.y = .01; g.add(brim);
      const crown = cyl(.13, .16, .18, b, .02); crown.scale.z = .85; const band = cyl(.163, .165, .04, M(seatC), .03); band.scale.z = .85;
    } else return null;
    const crown = g.userData.crown; g.position.y = crown ? .69 : .72; g.rotation.set(-.08, 0, .12); g.scale.setScalar(crown ? 1.1 : 1.25); return shadowy(g);
  }

  // ---------- efeitos (partículas simples) ----------
  const fxMat = c => new T.MeshBasicMaterial({ color: col(c), transparent: true, depthWrite: false, side: T.DoubleSide });
  function spawn(mesh, o) { mesh.position.copy(o.at); (o.parent || group).add(mesh); fx.push({ mesh, t: 0, ...o }); }
  let puffTex;
  // nuvenzinha macia: sprite com degradê redondo, sempre virada para a câmera
  function puff(c = '#fff7ea') {
    puffTex ||= canvasTex(64, 64, (ctx, w) => { const g = ctx.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.55, 'rgba(255,255,255,.75)'); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, w); });
    const s = new T.Sprite(new T.SpriteMaterial({ map: puffTex, color: col(c), transparent: true, depthWrite: false })); s.scale.setScalar(.22); return s;
  }
  function dust(gy, gx, n = 7, size = .1) {
    const [x, z] = W(gy, gx), y = surfaceY(gy, gx) + .06, big = size / .1;
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2 + rand(-.25, .25), sp = rand(.9, 1.3) * big;
      const p = puff(); p.scale.setScalar(.2 * big);
      spawn(p, { at: new T.Vector3(x + Math.cos(a) * .18, y, z + Math.sin(a) * .18), vel: new T.Vector3(Math.cos(a) * sp, rand(.25, .6), Math.sin(a) * sp), life: rand(.45, .6), grow: 2.6, grav: -.6, drag: 5.5, op: .85 });
    }
    // onda no chão
    const ring = new T.Mesh(new T.RingGeometry(.22, .3, 32), fxMat('#ffffff')); ring.rotation.x = -Math.PI / 2;
    spawn(ring, { at: new T.Vector3(x, y - .03, z), vel: new T.Vector3(), life: .35, grow: 2.2 * big, grav: 0, drag: 0, op: .6 });
  }
  function burst(gy, gx, colors, n = 26, up = 4.5, life = 1.2) {
    const [x, z] = W(gy, gx), y = surfaceY(gy, gx) + .4;
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2), sp = rand(1, 2.6), c = colors[i % colors.length];
      const mesh = new T.Mesh(i % 3 ? new T.PlaneGeometry(.13, .08) : new T.CircleGeometry(.06, 8), fxMat(c));
      spawn(mesh, { at: new T.Vector3(x, y, z), vel: new T.Vector3(Math.cos(a) * sp, rand(up * .6, up), Math.sin(a) * sp), life, grow: 1, grav: 9, drag: 1.2, spin: new T.Vector3(rand(-12, 12), rand(-12, 12), rand(-12, 12)) });
    }
  }
  function footprint(gy, gx, color) {
    const t = tileAt(gy, gx); if (!t) return;
    const m = new T.Mesh(new T.CircleGeometry(.24, 28), fxMat(color)); m.rotation.x = -Math.PI / 2;
    m.position.set((gx % 1 - .5) * CELL, TILE_TOP + .012, (gy % 1 - .5) * CELL); t.add(m);
    fx.push({ mesh: m, t: 0, life: 1.8, grow: .55, vel: new T.Vector3(), grav: 0, drag: 0, parent: t, op: .55 });
  }
  function stepFx(dt) {
    fx = fx.filter(f => {
      f.t += dt; const k = f.t / f.life;
      if (k >= 1) { (f.parent || group).remove(f.mesh); f.mesh.geometry.dispose(); f.mesh.material.dispose(); return false; }
      f.vel.y -= f.grav * dt; f.vel.multiplyScalar(Math.exp(-f.drag * dt)); f.mesh.position.addScaledVector(f.vel, dt);
      if (f.spin) f.mesh.rotation.set(f.mesh.rotation.x + f.spin.x * dt, f.mesh.rotation.y + f.spin.y * dt, f.mesh.rotation.z + f.spin.z * dt);
      f.base ??= f.mesh.scale.x; f.mesh.scale.setScalar(f.base * (1 + (f.grow - 1) * k)); f.mesh.material.opacity = (f.op || 1) * Math.min(1, (1 - k) * 2.2);
      return true;
    });
  }

  const PIPS = { 1: [[.5, .5]], 2: [[.27, .27], [.73, .73]], 3: [[.27, .27], [.5, .5], [.73, .73]], 4: [[.27, .27], [.73, .27], [.27, .73], [.73, .73]], 5: [[.27, .27], [.73, .27], [.5, .5], [.27, .73], [.73, .73]], 6: [[.27, .25], [.73, .25], [.27, .5], [.73, .5], [.27, .75], [.73, .75]] };
  // dado clássico: marfim com pontos pretos cavados (borda escura e fundo levemente mais claro)
  const dieFace = n => canvasTex(256, 256, (ctx, w) => {
    ctx.fillStyle = '#f6f2ea'; ctx.fillRect(0, 0, w, w);
    for (const [x, y] of PIPS[n]) {
      const rr = n === 1 ? 30 : 22, cx = 38 + x * (w - 76), cy = 38 + y * (w - 76);
      const g = ctx.createRadialGradient(cx + rr * .25, cy + rr * .25, rr * .1, cx, cy, rr);
      g.addColorStop(0, '#3a3a3e'); g.addColorStop(.8, '#141416'); g.addColorStop(1, '#0b0b0c');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2); ctx.fill();
    }
  });
  const FACE_VAL = [2, 5, 3, 4, 1, 6]; // ordem dos materiais do BoxGeometry: +x, -x, +y, -y, +z, -z
  function faceUpQuat(v, yaw) {
    const n = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]][FACE_VAL.indexOf(v)];
    const q = new T.Quaternion().setFromUnitVectors(new T.Vector3(...n), new T.Vector3(0, 1, 0));
    return new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), yaw).multiply(q);
  }
  const DIE_REST = () => new T.Vector3(1.6, TABLE + DIE / 2, B / 2 + 1.9); // na mesa, à frente do tabuleiro

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
    // câmera livre: arrastar gira/inclina, roda do mouse aproxima; o cadeado trava a câmera onde está
    try { cam.locked = localStorage.getItem('ludo-cam-lock') === '1'; cam.dyn = localStorage.getItem('ludo-cam-dyn') === '1'; } catch {}
    ctl = document.createElement('div'); ctl.className = 'ludo-cam';
    ctl.innerHTML = '<button data-r="-1" title="Girar para a esquerda">⟲</button><button data-r="0" title="Voltar a câmera">⌖</button><button data-r="1" title="Girar para a direita">⟳</button><button data-lock title="Travar/destravar a câmera"></button><button data-sun title="Trocar estilo de luz e sombra">☀️</button><button data-flat title="Visão 2D de cima / 3D">2D</button><button data-dyn title="Câmera dinâmica: acompanha a peça que anda">🎥</button>';
    const lockBtn = ctl.querySelector('[data-lock]'), paintLock = () => { lockBtn.textContent = cam.locked ? '🔒' : '🔓'; lockBtn.classList.toggle('on', cam.locked); };
    paintLock();
    try { sunMode = localStorage.getItem('ludo-sun2') === '1' ? 1 : 0; } catch {}
    const flatBtn = ctl.querySelector('[data-flat]'), paintFlat = () => { flatBtn.textContent = cam.flat ? '3D' : '2D'; ctl.classList.toggle('flat', cam.flat); };
    try { cam.flat = localStorage.getItem('ludo-flat') === '1'; } catch {} paintFlat();
    const dynBtn = ctl.querySelector('[data-dyn]'); dynBtn.classList.toggle('on', cam.dyn);
    ctl.onclick = e => {
      const b = e.target.closest('button'); if (!b) return; SFX.click();
      if (b.dataset.sun != null) { sunMode = (sunMode + 1) % SUN_MODES.length; applySun(); UI.toast?.('Luz: ' + SUN_MODES[sunMode]); try { localStorage.setItem('ludo-sun2', sunMode); } catch {} return; }
      if (b.dataset.flat != null) { cam.flat = !cam.flat; paintFlat(); try { localStorage.setItem('ludo-flat', cam.flat ? '1' : '0'); } catch {} return; }
      if (b === dynBtn) { cam.dyn = !cam.dyn; dynBtn.classList.toggle('on', cam.dyn); if (!cam.dyn) cam.follow = null; try { localStorage.setItem('ludo-cam-dyn', cam.dyn ? '1' : '0'); } catch {} return; }
      if (b === lockBtn) { cam.locked = !cam.locked; paintLock(); try { localStorage.setItem('ludo-cam-lock', cam.locked ? '1' : '0'); } catch {} return; }
      const r = +b.dataset.r; if (r) cam.azTo += r * 45; else homeCamera();
    };
    wrap.appendChild(ctl);

        blobTex = canvasTex(128, 128, (ctx, w) => { const g = ctx.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); g.addColorStop(0, 'rgba(0,0,0,.9)'); g.addColorStop(.45, 'rgba(0,0,0,.5)'); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, w); });

    scene = new T.Scene();
    pcam = camera = new T.PerspectiveCamera(30, 1, 2, 120); ocam = new T.OrthographicCamera(-1, 1, 1, -1, 1, 80); ocam.up.set(0, 0, -1); // lente fechada: perspectiva quase isométrica, como uma maquete
    raycaster = new T.Raycaster();
    // luz neutra e quente; a cena é só a mesa e o tabuleiro
    scene.background = col('#3f78c9'); scene.fog = new T.Fog(scene.background, 36, 66);
    scene.add(new T.HemisphereLight(col('#ffffff'), col('#7aa6e0'), .62));
    sun = new T.DirectionalLight(col('#ffe9c4'), 1.0); sun.position.set(-6, 16, 9); sun.castShadow = true;
    Object.assign(sun.shadow.camera, { left: -11, right: 11, top: 11, bottom: -11, near: 4, far: 40 });
    sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -.0015; sun.shadow.normalBias = .03; sun.shadow.radius = 4; scene.add(sun);
    // toalha: degradê azul com bolinhas, mais claro embaixo do tabuleiro
    const mat = canvasTex(1024, 1024, (ctx, w) => {
      const g = ctx.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); g.addColorStop(0, '#9fe0ff'); g.addColorStop(.45, '#66b4f0'); g.addColorStop(1, '#3f78c9');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, w); ctx.fillStyle = 'rgba(255,255,255,.13)';
      for (let y = 0; y < w; y += 32) for (let x = (y / 32 % 2) * 16; x < w; x += 32) { ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.fill(); }
    });
    const table = new T.Mesh(new T.PlaneGeometry(60, 60), new T.MeshStandardMaterial({ map: mat, roughness: .9 }));
    table.rotation.x = -Math.PI / 2; table.position.y = TABLE; table.position.z = 1; table.receiveShadow = true; scene.add(table);

    // tabuleiro: base grossa azul-escura (estilo do Monopoly 3D) com tampo creme, girado para a sua cor ficar à frente
    group = new T.Group(); scene.add(group);
    const woodM = toon('#ffffff', { map: woodTex(), roughness: .55 });
    const base = new T.Mesh(ao(slab(B + .9, B + .9, -TABLE + .02, .45, .08), .55), aoMat(woodM)); base.position.y = TABLE;
    const top = new T.Mesh(slab(B + .25, B + .25, .05, .3, .02), toon('#f3e6c8')); top.position.y = -.02;
    const under = blob(B + 3.5, .5); under.position.y = TABLE + .02; scene.add(under);
    group.add(shadowy(base), shadowy(top));
    const RL = B + .9, RW = .42, fr = new T.Shape(), hole = new T.Path(), o = RL / 2 - .08, i = RL / 2 - RW + .06;
    fr.moveTo(-o + .4, -o); fr.lineTo(o - .4, -o); fr.quadraticCurveTo(o, -o, o, -o + .4); fr.lineTo(o, o - .4); fr.quadraticCurveTo(o, o, o - .4, o);
    fr.lineTo(-o + .4, o); fr.quadraticCurveTo(-o, o, -o, o - .4); fr.lineTo(-o, -o + .4); fr.quadraticCurveTo(-o, -o, -o + .4, -o);
    hole.moveTo(-i, -i); hole.lineTo(-i, i); hole.lineTo(i, i); hole.lineTo(i, -i); hole.closePath(); fr.holes.push(hole);
    const frG = new T.ExtrudeGeometry(fr, { depth: .22, bevelEnabled: true, bevelThickness: .06, bevelSize: .06, bevelSegments: 3, curveSegments: 8 });
    frG.rotateX(-Math.PI / 2); frG.translate(0, .01, 0);
    group.add(shadowy(new T.Mesh(ao(frG, .7), aoMat(toon('#f2d2b0', { map: woodTex(), roughness: .5 })))));
    const S = Ludo.SEATS.map(s => s.color), cream = toon('#fffaf0'), seatM = S.map(c => toon(c));
    const tileGeo = ao(slab(CELL * .965, CELL * .965, TILE_TOP, .07, .035), .5);
    const tile = (gy, gx, m) => {
      const t = new T.Mesh(tileGeo, aoMat(m)); const [x, z] = W(gy + .5, gx + .5); t.position.set(x, 0, z);
      group.add(shadowy(t)); tiles[gy + ',' + gx] = t; return t;
    };
    // pista (mesma tabela da tela 2D); estrelas e setas vão dentro do ladrilho, para afundarem junto
    LudoUI.TRACK.forEach(([r, c], i) => {
      const startOf = i % 13 === 0 ? i / 13 : -1, t = tile(r, c, startOf >= 0 ? seatM[startOf] : cream);
      if (Ludo.SAFE.has(i) && startOf < 0) t.add(star());
      if (startOf >= 0) t.add(arrow(startOf));
    });
    LudoUI.LANE.forEach((l, s) => l.forEach(([r, c]) => {
      const t = tile(r, c, seatM[s]), a = arrow(0), dx = 7.5 - (c + .5), dz = 7.5 - (r + .5);
      a.material = toon('#' + new T.Color(S[s]).lerp(new T.Color('#000000'), .16).getHexString()); a.scale.setScalar(.75); a.rotation.y = Math.atan2(-dz, dx); t.add(a);
    }));
    // bases: plataforma colorida + quintal creme + 4 pinos
    LudoUI.BASE.forEach(([r, c], s) => {
      const [x, z] = W(r + 3, c + 3);
      const plat = new T.Mesh(ao(slab(CELL * 5.8, CELL * 5.8, TILE_TOP, .35, .06), .55), (platM[s] = aoMat(toon(S[s], { emissive: S[s], emissiveIntensity: 0 })))); plat.position.set(x, 0, z);
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
    group.add(new T.Mesh(slab(CELL * 3.05, CELL * 3.05, .12, .06, .02), toon('#24304d')));
    trophy = trophyModel(); trophy.position.y = apex.y - .02; group.add(trophy);

    // dado
    const faces = [1, 2, 3, 4, 5, 6].reduce((o, n) => (o[n] = dieFace(n), o), {});
    die = new T.Mesh(roundedBox(DIE, DIE * .1), FACE_VAL.map(v => new T.MeshStandardMaterial({ map: faces[v], roughness: .22 })));
    die.castShadow = true; scene.add(die);
    die.position.copy(DIE_REST()); die.quaternion.copy(faceUpQuat(6, .3));
    dieBlob = blob(DIE * 1.9, .6); scene.add(dieBlob);
    dieRing = new T.Mesh(new T.TorusGeometry(DIE * .85, .045, 10, 48), toon('#ffd23f', { emissive: '#b07b0e', emissiveIntensity: .6 }));
    dieRing.rotation.x = -Math.PI / 2; dieRing.position.set(die.position.x, TABLE + .02, die.position.z); scene.add(dieRing);

    applySun(); bindInput(); new ResizeObserver(resize).observe(wrap); resize();
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
    pcam.aspect = w / h; pcam.updateProjectionMatrix();
  }
  const homeCamera = () => { cam.azTo = Math.round(cam.az / 360) * 360; cam.polarTo = 48; cam.zoomTo = 1; };
  const HOME_TGT = () => new T.Vector3(0, -.3, 1.2);
  // segue a peça que está andando (cam.follow) e volta ao centro quando ela para
  function stepCamera() {
    if (cam.flat) {
      // de cima, sem perspectiva: enquadra tabuleiro + dado
      camera = ocam; cam.zoom += (cam.zoomTo - cam.zoom) * .12;
      const a = pcam.aspect, half = 8.2 * cam.zoom, hh = a >= 1 ? half : half / a, hw = hh * a;
      Object.assign(ocam, { left: -hw, right: hw, top: hh, bottom: -hh }); ocam.updateProjectionMatrix();
      ocam.position.set(0, 40, .9); ocam.lookAt(0, 0, .9);
      return;
    }
    camera = pcam;
    cam.tgt ||= HOME_TGT();
    // câmera dinâmica: puxa o foco para a peça que está andando e aproxima um pouco
    const f = cam.dyn && cam.follow, want = f ? f.getWorldPosition(new T.Vector3()).multiplyScalar(.6).add(HOME_TGT().multiplyScalar(.4)) : HOME_TGT();
    cam.tgt.lerp(want, f ? .06 : .04); cam.fz += ((f ? .75 : 1) - cam.fz) * (f ? .05 : .035);
    cam.az += (cam.azTo - cam.az) * .12; cam.polar += (cam.polarTo - cam.polar) * .12; cam.zoom += (cam.zoomTo - cam.zoom) * .12;
    const r = 25 * Math.max(1, 1.1 / camera.aspect) * cam.zoom * cam.fz, a = cam.az * Math.PI / 180, p = cam.polar * Math.PI / 180;
    camera.position.set(cam.tgt.x + r * Math.sin(p) * Math.sin(a), cam.tgt.y + r * Math.cos(p), cam.tgt.z + r * Math.sin(p) * Math.cos(a));
    camera.lookAt(cam.tgt);
    if (shake > .01) { camera.position.x += (Math.random() - .5) * shake; camera.position.y += (Math.random() - .5) * shake; shake *= .85; }
  }
  function pick(e) {
    const r = canvas.getBoundingClientRect();
    raycaster.setFromCamera(new T.Vector2((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1), camera);
    if (hint && performance.now() > holdUntil && raycaster.intersectObject(die, true).length) return { die: true };
    const can = rolling ? [] : Object.values(pawns).filter(p => p.userData.can);
    const hit = raycaster.intersectObjects(can, true)[0]; if (!hit) return null;
    let o = hit.object; while (o && o.userData.k === undefined) o = o.parent;
    return o ? { k: o.userData.k, g: o } : null;
  }
  function bindInput() {
    let down = null, dragging = false;
    canvas.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY }; dragging = false; });
    canvas.addEventListener('pointermove', e => {
      if (down && !cam.locked && !cam.flat) {
        // só vira arrasto depois de 8px: um clique com a mão tremendo não mexe a câmera
        if (!dragging && Math.abs(e.clientX - down.x) + Math.abs(e.clientY - down.y) > 8) { dragging = true; canvas.setPointerCapture(e.pointerId); }
        if (dragging) {
          cam.azTo -= (e.clientX - down.lx) * .35; cam.polarTo = Math.max(18, Math.min(68, cam.polarTo - (e.clientY - down.ly) * .25));
          cam.az = cam.azTo; cam.polar = cam.polarTo; down.lx = e.clientX; down.ly = e.clientY; canvas.style.cursor = 'grabbing'; return;
        }
      }
      const h = pick(e); preview(h?.g); canvas.style.cursor = h ? 'pointer' : cam.locked ? 'default' : 'grab';
    });
    canvas.addEventListener('pointerup', e => {
      const d = down, wasDrag = dragging; down = null; dragging = false;
      if (!d || wasDrag || Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 8) return;
      const hit = pick(e); if (!hit) return;
      if (hit.die) handlers.onDice?.(); else handlers.onPiece?.(hit.k);
    });
    canvas.addEventListener('wheel', e => { if (cam.locked) return; e.preventDefault(); cam.zoomTo = Math.max(.6, Math.min(1.45, cam.zoomTo * Math.exp(e.deltaY * .0012))); }, { passive: false });
    canvas.addEventListener('dblclick', () => { if (!cam.locked) homeCamera(); });
  }

  function loop(t) {
    // para sozinho quando a tela do jogo sai de vista (hub, sala, Magnata)
    if (!canvas.isConnected || !canvas.offsetParent) { active = false; return; }
    raf = requestAnimationFrame(loop);
    const s = t / 1000, pulse = Math.sin(s * 6), dt = Math.min(.05, last ? s - last : 0); last = s;
    for (const g of Object.values(pawns)) {
      const { ring, lift, tilt, shadow, ph } = g.userData;
      const can = g.userData.can && !rolling;
      ring.visible = can; ring.scale.setScalar(1 + .1 * pulse);
      if (!g.userData.walking) {
        place(g, ...g.userData.to); tilt.rotation.set(0, 0, 0); turnTo(g, g.userData.yaw ?? 0, .15);
        if (can) {
          // peça jogável dá pulinhos chamando o clique (estica no ar, achata ao pousar)
          const c = (s * 1.6 + ph * .1) % 1, air = c < .45 ? Math.sin(c / .45 * Math.PI) : 0, land = c >= .45 && c < .6 ? Math.sin((c - .45) / .15 * Math.PI) : 0;
          lift.position.y = .28 * air; squash(lift, 1 + .12 * air - .18 * land); shadow.scale.setScalar(1 - .35 * air);
        } else {
          // parada: respira de leve e balança um tiquinho
          lift.position.y = 0; squash(lift, 1 + .025 * Math.sin(s * 2.2 + ph)); tilt.rotation.z = .035 * Math.sin(s * 1.3 + ph); shadow.scale.setScalar(1);
        }
      }
      g.scale.setScalar(g.scale.x + ((g.userData.scale || 1) - g.scale.x) * .2);
    }
    // base de quem está na vez brilha devagar
    platM.forEach((m, i) => { m.emissiveIntensity += ((i === turnSeat ? .5 + .2 * Math.sin(s * 3) : 0) - m.emissiveIntensity) * .1; });
    stepFx(dt); stepBubbles();
    if (pv) { if (!pvFor?.userData.can || rolling) preview(null); else pv.children.forEach(o => { if (o.userData.pulse) o.scale.setScalar(1 + .12 * Math.sin(s * 7)); }); }
    // sol dá uma volta lenta (uns 3 min) e sobe/desce um pouco: as sombras vão girando e esticando
    if (trophy) {
      trophyHop = Math.max(0, trophyHop - dt * 1.4);
      trophy.rotation.y = s * .5 + trophyHop * 12; trophy.position.y = .12 + GOAL_H - .02 + .6 * Math.sin(Math.PI * trophyHop);
    }
    const now = performance.now();
    for (const tl of pressed) {
      const d = (now - tl.userData.t0) / 1000;
      tl.position.y = -.15 * (d < .07 ? Math.sin(d / .07 * Math.PI / 2) : Math.exp(-(d - .07) * 9));
      if (d > .8) { tl.position.y = 0; pressed.delete(tl); }
    }
    dieRing.visible = hint && !rolling && performance.now() > holdUntil; dieRing.scale.setScalar(1 + .08 * pulse);
    const hgt = Math.max(0, die.position.y - DIE_REST().y);
    dieBlob.position.set(die.position.x, TABLE + .008, die.position.z); dieBlob.scale.setScalar(1 / (1 + hgt * .5)); dieBlob.material.opacity = .6 / (1 + hgt);
    stepCamera();
    renderer.render(scene, camera);
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
    cam.az = cam.azTo = 0; turnSeat = null; cam.follow = null;
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
      if (!g) { g = pawns[p.id] = pawnModel(Ludo.SEATS[p.seat].color, p.hat); g.userData.img = p.img; g.userData.k = p.k; group.add(g); place(g, p.y, p.x); }
      g.userData.can = p.can; g.userData.route = p.route; g.userData.to = [p.y, p.x]; g.userData.scale = p.scale || 1;
      if (!g.userData.walking) place(g, p.y, p.x);
    }
    for (const id of Object.keys(pawns)) if (!want.has(id)) { group.remove(pawns[id]); delete pawns[id]; }
    const walkMs = Math.max(0, ...moves.filter(m => !m.back).map(m => (m.pts.length - 1) * STEP));
    for (const m of moves) {
      const g = pawns[m.id]; if (!g) continue;
      const pts = m.pts.slice(); pts[pts.length - 1] = g.userData.to;
      const n = pts.length - 1, dur = m.back ? 900 : n * STEP, token = (g.userData.walking = {}), { lift, tilt, shadow } = g.userData;
      const [ey, ex] = pts[n], home = ex >= 6 && ex <= 9 && ey >= 6 && ey <= 9, fromBase = !m.back && surfaceY(...pts[0]) === YARD_TOP;
      place(g, ...pts[0]);
      if (m.back) {
        // capturada: fica parada até a atacante chegar; aí é amassada, solta estrelas, sai rodopiando em arco e quica na base
        const [y0, x0] = pts[0], [y1, x1] = pts[n], C = .4; // C: altura do centro do peão (gira em volta dele, não do pé)
        let fired = false; place(g, y0, x0); bubble(g, false);
        tween(160, walkMs, k => {
          if (g.userData.walking !== token) return;
          if (k > 0 && !fired) { fired = true; burst(y0, x0, ['#ffd23f', '#ffffff', '#ff8a3d'], 22, 3.5, .8); bonk(); shake = .35; }
          squash(lift, 1 - .55 * Math.sin(Math.PI * k * .5));
        }).then(() => {
          if (g.userData.walking !== token) return;
          boing(); squash(lift, 1); tilt.position.y = C; lift.position.y = -C;
          const spinX = rand(3, 4) * Math.PI * 2, spinZ = rand(1, 2) * Math.PI * 2;
          return tween(dur, 0, k => {
            if (g.userData.walking !== token) return;
            const e = k * k * (3 - 2 * k), [x, z] = W(y0 + (y1 - y0) * e, x0 + (x1 - x0) * e), arc = Math.sin(Math.PI * k) * 3.2;
            g.position.set(x, surfaceY(y0, x0) * (1 - e) + surfaceY(y1, x1) * e, z);
            tilt.position.y = C + arc; tilt.rotation.set(spinX * e, 0, spinZ * e); shadow.scale.setScalar(1 - .7 * Math.sin(Math.PI * k));
          });
        }).then(() => {
          if (g.userData.walking !== token) return;
          tilt.position.y = 0; tilt.rotation.set(0, 0, 0); lift.position.y = 0; shadow.scale.setScalar(1);
          place(g, y1, x1); dust(y1, x1, 9, .12); thud();
          // quique na chegada
          return tween(420, 0, k => { if (g.userData.walking !== token) return; const b = Math.abs(Math.sin(k * Math.PI * 2)) * (1 - k); lift.position.y = .35 * b; squash(lift, 1 - .25 * (1 - k) * Math.cos(k * Math.PI * 4)); });
        }).then(() => { if (g.userData.walking === token) { g.userData.walking = null; lift.position.y = 0; squash(lift, 1); } });
        continue;
      }
      if (fromBase) pop();
      cam.follow = g; bubble(g, true);
      tween(dur, 0, k => {
        if (g.userData.walking !== token) return;
        const f = Math.min(n - 1, Math.floor(k * n)), u = k * n - f, [y0, x0] = pts[f], [y1, x1] = pts[f + 1];
        if (f > (g.userData.landed ?? 0)) { g.userData.landed = f; press(y0, x0); dust(y0, x0, 5, .07); footprint(y0, x0, g.userData.color); tok(f); }
        const [x, z] = W(y0 + (y1 - y0) * u, x0 + (x1 - x0) * u);
        g.position.set(x, (surfaceY(y0, x0) + tileY(y0, x0)) * (1 - u) + (surfaceY(y1, x1) + tileY(y1, x1)) * u, z);
        // arco do pulo + estica no ar, achata ao tocar; corpo inclina para onde vai
        const air = Math.sin(Math.PI * u), land = Math.max(0, 1 - u / .18);
        lift.position.y = .38 * air; squash(lift, 1 + .14 * air - .22 * land); shadow.scale.setScalar(1 - .4 * air);
        const dx = x1 - x0, dz = y1 - y0, lean = .22 * Math.sin(Math.PI * Math.min(1, u * 1.3));
        tilt.rotation.set(dz * lean, 0, -dx * lean); turnTo(g, Math.atan2(dx, dz), .25);
        if (k === 1) {
          bubble(g, false);
          if (cam.follow === g) setTimeout(() => { if (cam.follow === g && !g.userData.walking) cam.follow = null; }, 400);
          g.userData.walking = null; g.userData.landed = 0; lift.position.y = 0; squash(lift, 1); tilt.rotation.set(0, 0, 0); shadow.scale.setScalar(1);
          press(...pts[n]); dust(...pts[n], 8, .1); tok(n); place(g, ...pts[n]);
          if (home) { trophyHop = 1; burst(...pts[n], Ludo.SEATS.map(q => q.color).concat('#ffffff', '#ffd23f'), 40, 5.5, 1.6); fanfare(); }
        }
      });
    }
    return walkMs;
  }

  function setHint(on) { hint = on; }
  // caminho da peça sob o mouse: bolinhas nas casas do trajeto + anel pulsando e peça fantasma no destino
  let pv = null, pvFor = null;
  function preview(g) {
    if (g && !g.userData.route) g = null;
    if (g === pvFor) return;
    if (pv) { group.remove(pv); pv.traverse(o => { o.geometry?.dispose(); }); pv = null; }
    pvFor = g; if (!g) return;
    pv = new T.Group(); const c = g.userData.color, pts = g.userData.route, dot = fxMat('#ffffff'), m = fxMat(c);
    dot.opacity = .75;
    pts.slice(1, -1).forEach(([y, x]) => { const d = new T.Mesh(new T.CircleGeometry(.09, 16), dot); d.rotation.x = -Math.PI / 2; const [px, pz] = W(y, x); d.position.set(px, surfaceY(y, x) + .02, pz); pv.add(d); });
    const [ey, ex] = pts[pts.length - 1], [px, pz] = W(ey, ex), y0 = surfaceY(ey, ex) + .02;
    const ring = new T.Mesh(new T.RingGeometry(.3, .4, 40), m); ring.rotation.x = -Math.PI / 2; ring.position.set(px, y0, pz); ring.userData.pulse = true; pv.add(ring);
    const ghost = pawnModel(c); ghost.userData.ring.visible = false; ghost.userData.shadow.visible = false;
    ghost.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = .4; o.material.depthWrite = false; o.castShadow = false; } });
    ghost.position.set(px, y0 - .02, pz); pv.add(ghost);
    group.add(pv);
  }
  const hold = ms => { holdUntil = performance.now() + ms; };
  // balão redondo com o personagem acima da peça enquanto ela anda
  function bubble(g, on) {
    let b = g.userData.bubble;
    if (on) {
      if (!b) { b = g.userData.bubble = document.createElement('div'); b.className = 'ludo-bubble'; b.innerHTML = `<img src="${g.userData.img || ''}" alt="">`; b.style.setProperty('--c', g.userData.color); wrap.appendChild(b); }
      clearTimeout(b._t); b.classList.remove('out'); return;
    }
    if (b) { b._t = setTimeout(() => { b.classList.add('out'); b._t = setTimeout(() => { b.remove(); if (g.userData.bubble === b) g.userData.bubble = null; }, 300); }, 650); }
  }
  function stepBubbles() {
    const v = new T.Vector3(), w = canvas.clientWidth, h = canvas.clientHeight;
    for (const g of Object.values(pawns)) {
      const b = g.userData.bubble; if (!b) continue;
      g.userData.lift.getWorldPosition(v); v.y += 1.55; v.project(camera);
      b.style.transform = `translate(${(v.x + 1) / 2 * w}px, ${(1 - v.y) / 2 * h}px) translate(-50%, -100%)`;
    }
  }
  // gira o corpo (lift) até o ângulo alvo pelo caminho mais curto
  function turnTo(g, yaw, k) {
    g.userData.yaw = yaw; const l = g.userData.lift; let d = yaw - l.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d)); l.rotation.y += d * k;
  }
  const squash = (o, sy) => o.scale.set(1 / Math.sqrt(sy), sy, 1 / Math.sqrt(sy));
  function setTurn(seat) { if (seat !== turnSeat && turnSeat !== null && seat != null) chime(); turnSeat = seat; }

  // pousos do dado (fração do tempo) e altura de cada arco antes do pouso
  const HITS = [.24, .5, .68, .8, .88], ARCS = [2.6, 1.0, .45, .18, .06];
  async function rollDice(v, color = '#ffffff') {
    rolling = true;
    const end = DIE_REST(), start = end.clone().add(new T.Vector3(rand(3.8, 4.6), 0, rand(-1.2, -.4)));
    const dir = end.clone().sub(start).setY(0).normalize(), axis = new T.Vector3(0, 1, 0).cross(dir).normalize(); // rola "para a frente"
    const qf = faceUpQuat(v, rand(-.5, .5)), spin = Math.PI * 2 * Math.round(rand(3, 4)) + rand(-.4, .4), wob = new T.Vector3(dir.z, 0, -dir.x).normalize();
    const MS = 1500;
    rattle(); await new Promise(r => setTimeout(r, 220)); diceSound(MS);
    await tween(MS, 0, k => {
      // altura: arco parabólico entre pousos; depois do último pouso, fica no chão
      let y = 0;
      for (let i = 0, t0 = -HITS[0]; i < HITS.length; t0 = HITS[i++]) {
        if (k < HITS[i]) { const u = (k - Math.max(0, t0)) / (HITS[i] - Math.max(0, t0)); y = i === 0 ? ARCS[0] * (1 - u * u) : ARCS[i] * 4 * u * (1 - u); break; }
      }
      const e = 1 - (1 - k) ** 2.4;
      die.position.lerpVectors(start, end, e); die.position.y = end.y + y;
      const settle = k > HITS[HITS.length - 1] ? (k - HITS[HITS.length - 1]) / (1 - HITS[HITS.length - 1]) : 0;
      const rock = settle ? .22 * Math.sin(settle * Math.PI * 3) * (1 - settle) : 0; // balança na quina antes de deitar
      die.quaternion.setFromAxisAngle(axis, spin * (1 - e)).multiply(new T.Quaternion().setFromAxisAngle(wob, rock)).multiply(qf);
      if (k > HITS[0] && !die.userData.dust?.[HITS.findIndex(h => k < h)]) {
        const i = HITS.findIndex(h => k < h); (die.userData.dust ||= [])[i] = 1; if (i > 0 && i < 3) dieDust(.6 / i);
      }
    });
    die.userData.dust = null; rolling = false; showNumber(v, color);
    if (v === 6) sixParty(color);
  }
  function showNumber(v, color) {
    const el = document.createElement('div'); el.className = 'ludo-num'; el.textContent = v; el.style.setProperty('--c', color);
    if (v === 6) el.classList.add('six');
    wrap.appendChild(el); setTimeout(() => el.remove(), v === 6 ? 1700 : 1300); numSound(v);
  }
  // poeira e estrelas saindo do dado (no mundo, fora do grupo do tabuleiro)
  function dieDust(s) {
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2, sp = rand(.6, 1);
      spawn(puff(), { at: new T.Vector3(die.position.x, TABLE + .1, die.position.z), vel: new T.Vector3(Math.cos(a) * sp, rand(.2, .5), Math.sin(a) * sp), life: .5, grow: 2.4 * s + 1, grav: 0, drag: 4, parent: scene, op: .7 });
    }
  }
  // tirou 6: chuva de estrelas e confete na cor do jogador saindo do dado, dado dá um pulinho de alegria
  function sixParty(color) {
    const at = die.position.clone(), cs = [color, '#ffd23f', '#ffffff'];
    for (let i = 0; i < 34; i++) {
      const a = rand(0, Math.PI * 2), sp = rand(1, 2.4), c = cs[i % 3];
      const mesh = i % 4 ? new T.Mesh(new T.PlaneGeometry(.14, .09), fxMat(c)) : starMesh(c);
      spawn(mesh, { at: at.clone(), vel: new T.Vector3(Math.cos(a) * sp, rand(3.5, 5.5), Math.sin(a) * sp), life: 1.4, grow: 1, grav: 8, drag: 1, spin: new T.Vector3(rand(-10, 10), rand(-10, 10), rand(-10, 10)), parent: scene });
    }
    const y0 = die.position.y;
    tween(420, 0, k => { die.position.y = y0 + Math.sin(Math.PI * k) * .7; die.rotation.y += .25 * (1 - k); });
  }
  function starMesh(c) {
    const s = new T.Shape();
    for (let k = 0; k < 10; k++) { const r = k % 2 ? .05 : .12, a = k / 10 * Math.PI * 2 - Math.PI / 2; k ? s.lineTo(Math.cos(a) * r, Math.sin(a) * r) : s.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
    return new T.Mesh(new T.ShapeGeometry(s), fxMat(c));
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
  // dado batendo na mesa (síntese modal): estalo seco + ressonâncias agudas do plástico + baque grave da madeira
  let noiseBuf;
  function impact(a, t, v) {
    noiseBuf ||= (() => { const n = a.sampleRate * .03 | 0, b = a.createBuffer(1, n, a.sampleRate), d = b.getChannelData(0); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (a.sampleRate * .0012)); return b; })();
    const src = a.createBufferSource(); src.buffer = noiseBuf; src.playbackRate.value = rand(.85, 1.2);
    const hp = a.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1200;
    const click = a.createGain(); click.gain.value = v * .9; src.connect(hp).connect(click).connect(a.destination);
    for (const [f, q, gv] of [[rand(2300, 2700), 30, 3], [rand(3700, 4300), 35, 1.8], [rand(800, 950), 12, 2.2]]) {
      const bp = a.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q;
      const g = a.createGain(); g.gain.value = v * gv; src.connect(bp).connect(g).connect(a.destination);
    }
    tone(a, t, 'sine', rand(140, 170), 70, v * .5, .07); // madeira
    src.start(t);
  }
  // tempos dos toques casam com os pousos da animação (k = .2, .6 e 1) + tombos de quina no fim
  function diceSound(ms) {
    const a = audio(); if (!a) return; const t0 = a.currentTime, D = ms / 1000;
    HITS.forEach((o, i) => impact(a, t0 + D * o, [.45, .3, .18, .1, .06][i]));
    for (let i = 0, t = .92; i < 2; i++, t += .04) impact(a, t0 + D * t, .04);
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
  }

  // número do dado aparecendo: "plim" mais agudo quanto maior o número; 6 ganha brilho extra
  function numSound(v) {
    const a = audio(); if (!a) return; const t = a.currentTime, f = 440 * Math.pow(2, (v - 1) * 2 / 12);
    tone(a, t, 'sine', f * .7, f, .2, .09); tone(a, t + .07, 'triangle', f * 1.5, f * 1.5, .13, .25);
    if (v === 6) {
      [523, 659, 784, 1047, 1319, 1568].forEach((q, i) => { tone(a, t + .1 + i * .07, 'triangle', q, q, .16, .3); tone(a, t + .1 + i * .07, 'sine', q * 2, q * 2, .05, .25); });
      for (let i = 0; i < 10; i++) noiseHit(a, t + .5 + i * .035, .08, rand(6000, 9000), 3, .003);
      tone(a, t + .55, 'sine', 110, 55, .3, .5);
    }
  }
  // contagem da abertura: bipe curto (n > 0) e "vai!" mais longo (n = 0)
  function cue(n) {
    const a = audio(); if (!a) return; const t = a.currentTime;
    if (n) { tone(a, t, 'square', 660, 660, .06, .12); tone(a, t, 'sine', 660, 660, .15, .15); }
    else { [523, 659, 784, 1047].forEach((f, i) => tone(a, t + i * .05, 'triangle', f, f, .18, .4)); }
  }
  // saída da base: "plop" subindo
  function pop() {
    const a = audio(); if (!a) return; const t = a.currentTime;
    tone(a, t, 'sine', 300, 900, .35, .12); tone(a, t + .03, 'triangle', 600, 1300, .12, .1);
  }
  // pancada da captura
  function bonk() {
    const a = audio(); if (!a) return; const t = a.currentTime;
    tone(a, t, 'square', 220, 70, .18, .16); noiseHit(a, t, .6, 1200, .7, .015); tone(a, t, 'sine', 120, 50, .5, .2);
  }
  // pouso pesado (peça capturada caindo na base)
  function thud() {
    const a = audio(); if (!a) return; const t = a.currentTime;
    tone(a, t, 'sine', 160, 60, .45, .14); noiseHit(a, t, .35, 700, .8, .012);
  }
  // chegou ao centro: arpejo alegre
  function fanfare() {
    const a = audio(); if (!a) return; const t = a.currentTime;
    [523, 659, 784, 1047, 1319].forEach((f, i) => { tone(a, t + i * .09, 'triangle', f, f, .22, .28); tone(a, t + i * .09, 'sine', f * 2, f * 2, .06, .2); });
    for (let i = 0; i < 8; i++) noiseHit(a, t + .45 + i * .04, .12, rand(5000, 8000), 2, .004);
  }
  // troca de vez: "ding-dong" curtinho
  function chime() {
    const a = audio(); if (!a) return; const t = a.currentTime;
    tone(a, t, 'sine', 880, 880, .12, .35); tone(a, t + .12, 'sine', 1175, 1175, .12, .45);
  }
  // chacoalhar o dado na mão antes de jogar
  function rattle() {
    const a = audio(); if (!a) return; const t = a.currentTime;
    for (let i = 0; i < 6; i++) noiseHit(a, t + i * .035 + rand(0, .012), .07, rand(2500, 4000), 3, .003);
  }

  function supported() {
    if (!window.THREE) return false;
    try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
  }

  return { supported, mount, show, reset, sync, rollDice, setHint, setTurn, cue, hold, STEP };
})();
