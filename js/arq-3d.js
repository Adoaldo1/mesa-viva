// ===== Arquipélago — tabuleiro 3D (Three.js r128) =====
// Mesma interface do tabuleiro 2D: mount(el, {pick, hover}), update(state, ui), screenPos(kind, id), hitNumber(n).
// Terrenos em relevo (cada hexágono é um prisma com altura e enfeites próprios), mar animado, peças modeladas em código,
// tempestade como nuvem flutuante e destaques clicáveis onde dá para jogar. Arraste para girar, roda para zoom.
const ArqBoard3D = (() => {
  let T, renderer, scene, camera, ray, host = null, canvas = null, handlers = {}, mounted = false, active = false, raf = 0, clock = 0, lastT = 0;
  let mapKey = null, last = null, tileGroup, pieceGroup, hlGroup, sea, storm, tokens = {}, hexMeshes = [], fishes = [];
  const cam = { yaw: 0, tilt: .9, dist: 12, tyaw: 0, tdist: 12 };
  const tweens = [];
  const tween = (dur, fn, done) => tweens.push({ t0: clock, dur, fn, done });
  const easeOut = k => 1 - Math.pow(1 - k, 3);
  const TER = {
    mata: { c: 0x3f8a46, h: .34 }, barreiro: { c: 0xc46a3f, h: .3 }, algodoal: { c: 0xe6dcbc, h: .28 },
    pedreira: { c: 0x8f9198, h: .42 }, vulcao: { c: 0x4a3a34, h: .4 }, cardume: { c: 0x2b7f96, h: .04 },
  };

  function supported() { if (!window.THREE) return false; try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; } }
  const canvasTex = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; t.anisotropy = 4; return t; };
  // cores escritas em sRGB (como no CSS): convertidas para o espaço linear do renderizador
  const lin = c => (c instanceof THREE.Color ? c.clone() : new THREE.Color(c)).convertSRGBToLinear();
  const mat = (c, o = {}) => new T.MeshStandardMaterial({ color: lin(c), roughness: .7, metalness: 0, ...o });

  function init() {
    T = THREE;
    renderer = new T.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
    renderer.outputEncoding = T.sRGBEncoding; renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = .95;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
    canvas = renderer.domElement; canvas.className = 'arq3d';
    scene = new T.Scene(); scene.background = new T.Color(0x0b2a38); scene.fog = new T.Fog(0x0b2a38, 22, 45);
    camera = new T.PerspectiveCamera(40, 1, .1, 100); ray = new T.Raycaster();
    scene.add(new T.HemisphereLight(0xcfe8ff, 0x2a2018, .55));
    const sun = new T.DirectionalLight(0xfff0d0, 1.15); sun.position.set(-6, 14, 7); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 40 }); sun.shadow.bias = -.0006;
    scene.add(sun);
    // mar: plano grande com ondas desenhadas num shader (cor, reflexos e espuma suave)
    sea = new T.Mesh(new T.PlaneGeometry(80, 80, 1, 1), new T.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: 'varying vec2 vP; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vP = w.xz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: `uniform float uTime; varying vec2 vP;
        void main(){
          float d = length(vP) / 14.0;
          vec3 deep = vec3(.05, .19, .27), shallow = vec3(.12, .42, .5);
          vec3 col = mix(shallow, deep, clamp(d, 0., 1.));
          float w = sin(vP.x * 2.1 + uTime * .9) * sin(vP.y * 1.7 - uTime * .7) + sin((vP.x + vP.y) * 3.3 + uTime * 1.3) * .5;
          col += vec3(.55, .8, .9) * pow(max(w, 0.) / 1.5, 6.) * .35;
          gl_FragColor = vec4(col, 1.);
        }`,
    }));
    sea.rotation.x = -Math.PI / 2; sea.position.y = -.12; scene.add(sea);
    tileGroup = new T.Group(); pieceGroup = new T.Group(); hlGroup = new T.Group(); scene.add(tileGroup, pieceGroup, hlGroup);
    storm = makeStorm(); scene.add(storm);
    bindInput();
    mounted = true;
  }

  // ---------- tabuleiro fixo ----------
  const hexShape = r => { const s = new T.Shape(); for (let i = 0; i < 6; i++) { const a = Math.PI / 180 * (60 * i - 30), x = r * Math.cos(a), y = r * Math.sin(a); i ? s.lineTo(x, y) : s.moveTo(x, y); } s.closePath(); return s; };
  function prism(r, h) { const g = new T.ExtrudeGeometry(hexShape(r), { depth: h, bevelEnabled: true, bevelThickness: .03, bevelSize: .03, bevelSegments: 1 }); g.rotateX(Math.PI / 2); g.translate(0, h, 0); return g; }
  const rngFor = seed => { let s = (seed * 9301 + 49297) % 233280; return () => (s = (s * 9301 + 49297) % 233280) / 233280; };

  function decorate(group, terrain, h, top, seed) {
    const R = rngFor(seed + 5), spot = (s = .5) => [(R() - .5) * s * 1.5, (R() - .5) * s * 1.3];
    if (terrain === 'mata') { const trunk = mat(0x5b3a1e), leaf = mat(0x245c2b, { roughness: .9 });
      for (let i = 0; i < 7; i++) { const [x, z] = spot(.62), s = .7 + R() * .5, t = new T.Mesh(new T.CylinderGeometry(.025, .03, .1, 6), trunk), c = new T.Mesh(new T.ConeGeometry(.12 * s, .32 * s, 7), leaf);
        t.position.set(x, top + .05, z); c.position.set(x, top + .1 + .16 * s, z); c.castShadow = true; group.add(t, c); } }
    if (terrain === 'pedreira') { const rock = mat(0xa3a5ac, { flatShading: true, roughness: .9 });
      for (let i = 0; i < 4; i++) { const [x, z] = spot(.55), s = .12 + R() * .1, m = new T.Mesh(new T.DodecahedronGeometry(s, 0), rock); m.position.set(x, top + s * .6, z); m.rotation.set(R() * 3, R() * 3, R() * 3); m.castShadow = true; group.add(m); }
      const peak = new T.Mesh(new T.ConeGeometry(.3, .45, 5), rock); peak.position.set(.1, top + .2, -.15); peak.castShadow = true; group.add(peak); }
    if (terrain === 'algodoal') { const stem = mat(0x6f8a3a), boll = mat(0xfffdf4, { roughness: .95 });
      for (let i = 0; i < 14; i++) { const [x, z] = spot(.68), st = new T.Mesh(new T.CylinderGeometry(.01, .01, .12, 4), stem), b = new T.Mesh(new T.SphereGeometry(.045, 8, 6), boll);
        st.position.set(x, top + .06, z); b.position.set(x, top + .13, z); b.castShadow = true; group.add(st, b); } }
    if (terrain === 'barreiro') { const brick = mat(0x9c4a26);
      for (let i = 0; i < 3; i++) { const [x, z] = spot(.5); for (let j = 0; j < 3; j++) { const m = new T.Mesh(new T.BoxGeometry(.14, .05, .07), brick); m.position.set(x + (j % 2) * .04, top + .025 + j * .05, z); m.castShadow = true; group.add(m); } }
      const pit = new T.Mesh(new T.CylinderGeometry(.18, .14, .02, 16), mat(0x7a3a1c)); pit.position.set(-.2, top + .01, .2); group.add(pit); }
    if (terrain === 'vulcao') { const cone = new T.Mesh(new T.CylinderGeometry(.12, .45, .55, 9, 1, true), mat(0x2e2320, { flatShading: true, side: T.DoubleSide })); cone.position.y = top + .27; cone.castShadow = true; group.add(cone);
      const lava = new T.Mesh(new T.CircleGeometry(.12, 12), new T.MeshBasicMaterial({ color: 0xff6a20 })); lava.rotation.x = -Math.PI / 2; lava.position.y = top + .53; group.add(lava); }
  }
  function tokenMesh(num) {
    const red = num === 6 || num === 8, pips = 6 - Math.abs(7 - num);
    const tex = canvasTex(256, 256, (c, w) => {
      c.fillStyle = '#f6eed6'; c.beginPath(); c.arc(128, 128, 124, 0, Math.PI * 2); c.fill();
      c.lineWidth = 10; c.strokeStyle = '#5a4428'; c.stroke();
      c.fillStyle = red ? '#c0261c' : '#2a1e10'; c.font = `800 ${red ? 120 : 104}px Georgia, serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(num, 128, 118);
      for (let i = 0; i < pips; i++) { c.beginPath(); c.arc(128 + (i - (pips - 1) / 2) * 22, 200, 8, 0, Math.PI * 2); c.fill(); }
    });
    const side = mat(0xd9c9a0);
    const m = new T.Mesh(new T.CylinderGeometry(.27, .27, .05, 32), [side, new T.MeshStandardMaterial({ map: tex, roughness: .6 }), side]);
    m.rotation.y = Math.PI / 2; // o topo do cilindro mapeia a textura de lado: gira para o número ficar de pé para quem olha
    m.castShadow = true; return m;
  }
  function buildStatic(st) {
    for (const g of [tileGroup, pieceGroup, hlGroup]) while (g.children.length) g.remove(g.children[0]);
    tokens = {}; hexMeshes = []; fishes = [];
    const G = Arq.grid(st), sand = mat(0xe3cc92, { roughness: .95 });
    for (const h of G.hexes) {
      const t = st.map.tiles[h.id], grp = new T.Group(); grp.position.set(h.x, 0, h.y);
      if (t.terrain === 'mar') { const m = new T.Mesh(new T.CircleGeometry(.95, 6), new T.MeshBasicMaterial({ visible: false })); m.rotation.x = -Math.PI / 2; m.rotation.z = Math.PI / 6; m.position.y = .01; m.userData.hex = h.id; grp.add(m); hexMeshes.push(m); tileGroup.add(grp); continue; }
      const cfg = TER[t.terrain];
      if (t.terrain !== 'cardume') { const b = new T.Mesh(prism(1.08, .08), sand); b.position.y = -.06; b.receiveShadow = true; grp.add(b); }
      const top = cfg.h + .03;
      const m = new T.Mesh(prism(t.terrain === 'cardume' ? .9 : .96, cfg.h), mat(cfg.c, t.terrain === 'cardume' ? { transparent: true, opacity: .55, roughness: .3 } : { roughness: .85 }));
      m.receiveShadow = true; m.castShadow = t.terrain !== 'cardume'; m.userData.hex = h.id; grp.add(m); hexMeshes.push(m);
      decorate(grp, t.terrain, cfg.h, top, h.id);
      if (t.terrain === 'cardume') for (let i = 0; i < 4; i++) { const f = new T.Mesh(new T.ConeGeometry(.04, .14, 5), mat(0xcfe9ee, { roughness: .4 })); f.rotation.z = Math.PI / 2; const holder = new T.Group(); holder.add(f); f.position.x = .3 + i * .06; holder.position.y = .02; holder.userData = { sp: .6 + i * .15, ph: i * 1.7 }; grp.add(holder); fishes.push(holder); }
      if (t.num) { const tk = tokenMesh(t.num); tk.position.set(0, top + (t.terrain === 'pedreira' || t.terrain === 'mata' ? .05 : .03), t.terrain === 'pedreira' ? .2 : 0); tk.userData.base = tk.position.y; grp.add(tk); tokens[h.id] = { mesh: tk, num: t.num }; }
      tileGroup.add(grp);
    }
    // mercados: píer de madeira na costa e placa com recurso e proporção
    for (const mk of st.map.markets) {
      const E = G.edges[mk.edge], A = G.vertices[E.a], B = G.vertices[E.b], S = G.hexes[mk.sea];
      const mx = (A.x + B.x) / 2, mz = (A.y + B.y) / 2, dx = S.x - mx, dz = S.y - mz, L = Math.hypot(dx, dz), px = mx + dx / L * .5, pz = mz + dz / L * .5;
      const plank = new T.Mesh(new T.BoxGeometry(.18, .04, .5), mat(0x8a6234)); plank.position.set((mx + px) / 2, .02, (mz + pz) / 2); plank.rotation.y = Math.atan2(dx, dz); plank.castShadow = true; tileGroup.add(plank);
      const icon = { madeira: '🪵', argila: '🧱', algodao: '☁️', pedra: '🪨', peixe: '🐟', any: '⚓' }[mk.type];
      const sign = new T.Sprite(new T.SpriteMaterial({ map: canvasTex(128, 128, (c) => { c.fillStyle = '#f1e2bd'; c.beginPath(); c.arc(64, 64, 60, 0, Math.PI * 2); c.fill(); c.lineWidth = 6; c.strokeStyle = '#6b4a24'; c.stroke(); c.font = '46px serif'; c.textAlign = 'center'; c.fillText(icon, 64, 66); c.font = '800 26px system-ui'; c.fillStyle = '#3b2a14'; c.fillText(mk.type === 'any' ? '3:1' : '2:1', 64, 106); }), depthWrite: false }));
      sign.position.set(px, .45, pz); sign.scale.setScalar(.42); tileGroup.add(sign);
    }
  }

  // ---------- peças ----------
  const pieceMat = {};
  const colorMat = hex => pieceMat[hex] || (pieceMat[hex] = mat(hex, { roughness: .45 }));
  function houseMesh(c) {
    const g = new T.Group(), body = new T.Mesh(new T.BoxGeometry(.22, .16, .2), colorMat(c)), roof = new T.Mesh(new T.ConeGeometry(.19, .13, 4), colorMat(c));
    body.position.y = .08; roof.position.y = .22; roof.rotation.y = Math.PI / 4; body.castShadow = roof.castShadow = true; g.add(body, roof); return g;
  }
  function cityMesh(c) {
    const g = new T.Group(), base = new T.Mesh(new T.BoxGeometry(.36, .16, .24), colorMat(c)), tower = new T.Mesh(new T.BoxGeometry(.16, .3, .16), colorMat(c)), roof = new T.Mesh(new T.ConeGeometry(.14, .14, 4), colorMat(c));
    base.position.y = .08; tower.position.set(.07, .2, 0); roof.position.set(.07, .42, 0); roof.rotation.y = Math.PI / 4;
    for (const m of [base, tower, roof]) { m.castShadow = true; g.add(m); } return g;
  }
  const topAt = (st, v) => { const G = Arq.grid(st); return Math.max(...G.vertices[v].hexes.map(h => (TER[st.map.tiles[h].terrain]?.h ?? 0) + .03)); };
  function syncPieces(st, ui) {
    while (pieceGroup.children.length) pieceGroup.remove(pieceGroup.children[0]);
    const G = Arq.grid(st), col = id => Arq.COLORS.find(c => c.id === st.players.find(p => p.id === id)?.color)?.hex || '#999';
    for (const [e, o] of Object.entries(st.roads)) {
      const E = G.edges[e], A = G.vertices[E.a], B = G.vertices[E.b], y = Math.max(topAt(st, E.a), topAt(st, E.b));
      const m = new T.Mesh(new T.BoxGeometry(.66, .08, .1), colorMat(col(o))); m.position.set((A.x + B.x) / 2, y + .04, (A.y + B.y) / 2); m.rotation.y = -Math.atan2(B.y - A.y, B.x - A.x); m.castShadow = true;
      pieceGroup.add(m); if (ui.fresh?.has('e' + e)) pop(m);
    }
    for (const [v, b] of Object.entries(st.buildings)) {
      const V = G.vertices[v], m = b.type === 'cidade' ? cityMesh(col(b.owner)) : houseMesh(col(b.owner));
      m.position.set(V.x, topAt(st, +v), V.y); m.rotation.y = (+v % 5) * .3; pieceGroup.add(m); if (ui.fresh?.has('v' + v)) pop(m);
    }
    const S = G.hexes[st.storm];
    if (storm.userData.hex == null) storm.position.set(S.x, 1.1, S.y);
    else if (storm.userData.hex !== st.storm) { const from = storm.position.clone(); tween(.8, k => { storm.position.lerpVectors(from, new T.Vector3(S.x, 1.1, S.y), easeOut(k)); storm.position.y = 1.1 + Math.sin(k * Math.PI) * .6; }); }
    storm.userData.hex = st.storm;
  }
  function pop(m) { const s = m.scale.clone(); m.scale.setScalar(.001); tween(.5, k => { const b = 1 + Math.sin(k * Math.PI) * .25 * (1 - k); m.scale.set(s.x * easeOut(k) * b, s.y * easeOut(k) * b, s.z * easeOut(k) * b); }); }
  function makeStorm() {
    const g = new T.Group(), cm = mat(0x59606e, { roughness: 1 });
    for (const [x, y, z, r] of [[0, 0, 0, .28], [.25, -.02, .05, .22], [-.24, -.03, -.02, .21], [.06, .12, -.05, .2], [-.08, -.05, .18, .18]]) { const s = new T.Mesh(new T.SphereGeometry(r, 12, 10), cm); s.position.set(x, y, z); s.castShadow = true; g.add(s); }
    const bolt = new T.Mesh(new T.ConeGeometry(.05, .45, 4), new T.MeshBasicMaterial({ color: 0xffd34a })); bolt.position.y = -.4; bolt.rotation.z = .3; g.add(bolt); g.userData.bolt = bolt;
    return g;
  }

  // ---------- destaques clicáveis ----------
  const hlMat = () => new T.MeshBasicMaterial({ color: 0xffd23a, transparent: true, opacity: .85, depthWrite: false });
  function syncHighlights(st, ui) {
    while (hlGroup.children.length) hlGroup.remove(hlGroup.children[0]);
    const G = Arq.grid(st);
    for (const v of ui.vertices || []) { const V = G.vertices[v], m = new T.Mesh(new T.SphereGeometry(.15, 14, 10), hlMat()); m.position.set(V.x, topAt(st, v) + .14, V.y); m.userData = { kind: 'vertex', id: v }; hlGroup.add(m); }
    for (const e of ui.edges || []) { const E = G.edges[e], A = G.vertices[E.a], B = G.vertices[E.b], m = new T.Mesh(new T.BoxGeometry(.6, .1, .16), hlMat()); m.position.set((A.x + B.x) / 2, Math.max(topAt(st, E.a), topAt(st, E.b)) + .06, (A.y + B.y) / 2); m.rotation.y = -Math.atan2(B.y - A.y, B.x - A.x); m.userData = { kind: 'edge', id: e }; hlGroup.add(m); }
    for (const h of ui.hexes || []) { const H = G.hexes[h], m = new T.Mesh(new T.CircleGeometry(.85, 6), new T.MeshBasicMaterial({ color: 0xffe58a, transparent: true, opacity: .16, depthWrite: false, side: T.DoubleSide })); m.rotation.x = -Math.PI / 2; m.rotation.z = Math.PI / 6; m.position.set(H.x, (TER[st.map.tiles[h].terrain]?.h ?? 0) + .07, H.y); m.userData = { kind: 'hex', id: h }; hlGroup.add(m); }
  }

  // ---------- entrada ----------
  let down = null, hoverHex = null, hovered = null;
  function rayAt(e, list) { const r = canvas.getBoundingClientRect(); ray.setFromCamera(new T.Vector2((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1), camera); return ray.intersectObjects(list, false)[0]; }
  function bindInput() {
    canvas.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY, yaw: cam.tyaw, moved: false }; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', e => {
      if (down) { const dx = e.clientX - down.x; if (Math.abs(dx) > 6) down.moved = true; if (down.moved) cam.tyaw = down.yaw - dx * .006; return; }
      const hit = rayAt(e, hlGroup.children); if (hovered !== (hit?.object || null)) { if (hovered) { hovered.material.opacity = hovered.userData.kind === 'hex' ? .16 : .85; hovered.material.color.setHex(0xffd23a); } hovered = hit?.object || null; if (hovered) { hovered.material.opacity = hovered.userData.kind === 'hex' ? .4 : 1; hovered.material.color.setHex(0xffffff); } }
      canvas.style.cursor = hit ? 'pointer' : 'grab';
      const h = rayAt(e, hexMeshes)?.object.userData.hex ?? null; if (h !== hoverHex) { hoverHex = h; handlers.hover?.(h, e); }
    });
    canvas.addEventListener('pointerup', e => { const d = down; down = null; if (d && !d.moved) { const hit = rayAt(e, hlGroup.children); if (hit) handlers.pick?.(hit.object.userData); } });
    canvas.addEventListener('pointerleave', () => { if (hoverHex != null) { hoverHex = null; handlers.hover?.(null); } });
    canvas.addEventListener('wheel', e => { e.preventDefault(); cam.tdist = Math.max(6, Math.min(18, cam.tdist * (e.deltaY > 0 ? 1.1 : .9))); }, { passive: false });
  }
  function resize() {
    if (!host || !renderer) return; const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false); canvas.style.width = w + 'px'; canvas.style.height = h + 'px'; camera.aspect = w / h; camera.updateProjectionMatrix();
    const size = last?.map.size === 'big' ? 10 : 8.2; cam.tdist = Math.max(cam.tdist === 12 ? 0 : 0, size / Math.tan(camera.fov * Math.PI / 360) / Math.min(1.3, Math.max(.75, camera.aspect)) * .62);
  }

  function frame(dt) {
    clock += dt;
    for (let i = tweens.length - 1; i >= 0; i--) { const t = tweens[i], k = Math.min(1, (clock - t.t0) / t.dur); t.fn(k); if (k >= 1) { tweens.splice(i, 1); t.done?.(); } }
    const kc = 1 - Math.exp(-dt * 6); cam.yaw += (cam.tyaw - cam.yaw) * kc; cam.dist += (cam.tdist - cam.dist) * kc;
    camera.position.set(Math.sin(cam.yaw) * Math.sin(cam.tilt) * cam.dist, Math.cos(cam.tilt) * cam.dist, Math.cos(cam.yaw) * Math.sin(cam.tilt) * cam.dist + .3); camera.lookAt(0, 0, .3);
    sea.material.uniforms.uTime.value = clock;
    storm.rotation.y += dt * .4; storm.children.forEach((s, i) => { if (s !== storm.userData.bolt) s.position.y = Math.sin(clock * 1.5 + i) * .03; });
    storm.userData.bolt.visible = Math.sin(clock * 7) > .6 || Math.sin(clock * 2.3) > .97;
    for (const f of fishes) f.rotation.y = clock * f.userData.sp + f.userData.ph;
    for (const m of hlGroup.children) if (m !== hovered && m.userData.kind !== 'hex') m.scale.setScalar(1 + Math.sin(clock * 5) * .12);
    renderer.render(scene, camera);
  }
  function loop(t) { raf = requestAnimationFrame(loop); const dt = Math.min(.05, (t - (lastT || t)) / 1000); lastT = t; frame(dt); }

  // ---------- interface pública ----------
  function mount(el, h) {
    if (!supported()) return false;
    if (!mounted) { init(); new ResizeObserver(() => resize()).observe(document.body); }
    handlers = h || {}; host = el; el.appendChild(canvas); mapKey = null; resize(); return true;
  }
  function update(st, ui = {}) {
    if (!mounted || !host) return;
    if (st.gameId !== mapKey) { mapKey = st.gameId; last = st; buildStatic(st); storm.userData.hex = null; resize(); }
    last = st; syncPieces(st, ui); syncHighlights(st, ui);
  }
  function show(on) { active = !!on && mounted; cancelAnimationFrame(raf); lastT = 0; if (canvas) canvas.style.display = active ? '' : 'none'; if (active) { resize(); raf = requestAnimationFrame(loop); } }
  function screenPos(kind, id) {
    if (!last || !camera) return null;
    const G = Arq.grid(last); let x, z, y = .4;
    if (kind === 'hex') ({ x, y: z } = G.hexes[id]);
    else if (kind === 'vertex') ({ x, y: z } = G.vertices[id]);
    else { const E = G.edges[id]; x = (G.vertices[E.a].x + G.vertices[E.b].x) / 2; z = (G.vertices[E.a].y + G.vertices[E.b].y) / 2; }
    const v = new T.Vector3(x, y, z).project(camera), r = canvas.getBoundingClientRect();
    return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height };
  }
  function hitNumber(n) {
    for (const [h, t] of Object.entries(tokens)) if (t.num === n && +h !== last?.storm) { const m = t.mesh; tween(1.2, k => { m.position.y = m.userData.base + Math.sin(k * Math.PI * 2) * .2 * (1 - k * .5); m.rotation.y = k * Math.PI * 2; }); }
  }
  return { supported, mount, update, show, screenPos, hitNumber };
})();
