// ===== Arquipélago — tabuleiro 3D do jogo (diorama, Three.js r128) =====
// Monta o mapa da partida com o mundo em diorama (arq-world.js): terrenos com relevo, vegetação viva, mar, luz por horário.
// Mesma interface do tabuleiro 2D: mount(el, {pick, hover}), update(state, ui), show(on), screenPos(kind, id), hitNumber(n).
// Arraste para girar (e inclinar), roda para zoom. Os cliques só valem nos destaques (onde a jogada é possível).
const ArqBoard3D = (() => {
  let T, renderer, scene, camera, ray, host = null, canvas = null, handlers = {}, mounted = false, active = false, raf = 0, clock = 0, lastT = 0;
  let mapKey = null, last = null, world = null, worldGroup = null, sea = null, reefs = [], amb = null, atmo = null, tokens = {}, pickHex = [], hlGroup, pieceGroup, storm, markets;
  const cam = { yaw: .2, tilt: .92, dist: 13, tyaw: .2, ttilt: .92, tdist: 13 };
  const tweens = [];
  const tween = (dur, fn, done) => tweens.push({ t0: clock, dur, fn, done });
  const easeOut = k => 1 - Math.pow(1 - k, 3);
  let preset = 'tarde'; try { preset = localStorage.getItem('arq-luz') || 'tarde'; } catch { }
  // qualidade automática: se o quadro ficar lento, reduz a resolução e a sombra (sem mudar o visual do resto)
  const quality = { level: 2, slow: 0, samples: 0, acc: 0 };

  function supported() { if (!window.THREE || typeof ArqWorld === 'undefined') return false; try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; } }

  function init() {
    T = THREE;
    renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
    renderer.outputEncoding = T.sRGBEncoding; renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
    canvas = renderer.domElement; canvas.className = 'arq3d';
    scene = new T.Scene(); camera = new T.PerspectiveCamera(38, 1, .05, 120); ray = new T.Raycaster();
    hlGroup = new T.Group(); pieceGroup = new T.Group(); scene.add(hlGroup, pieceGroup);
    storm = makeStorm(); scene.add(storm);
    bindInput(); mounted = true;
  }

  // ---------- mapa ----------
  function tilesOf(st) {
    const G = Arq.grid(st);
    return G.hexes.map(h => { const t = st.map.tiles[h.id]; return { id: h.id, x: h.x, z: h.y, biome: t.terrain === 'mar' ? 'mar' : t.terrain, num: t.num }; });
  }
  let LOG, PLANK, POST;
  function disposeWorld() {
    LOG = LOG || new THREE.CylinderGeometry(.045, .045, .62, 7); PLANK = PLANK || new THREE.BoxGeometry(.2, .025, .07); POST = POST || new THREE.CylinderGeometry(.015, .015, .2, 5);
    for (const o of [worldGroup, sea, amb, markets, ...reefs]) if (o) { scene.remove(o); o.traverse(m => { m.geometry?.dispose(); }); }
    for (const t of Object.values(tokens)) scene.remove(t.mesh);
    for (const m of pickHex) scene.remove(m);
    tokens = {}; reefs = []; pickHex = []; ArqWorld.clearAnimations();
  }
  function buildStatic(st) {
    disposeWorld();
    const tiles = tilesOf(st), big = st.map.size === 'big', ext = big ? 6.6 : 5.2;
    if (!atmo) atmo = ArqWorld.atmosphere(scene, renderer, { ext, fog: [18, 40] });
    world = ArqWorld.build(tiles); worldGroup = world.group; scene.add(worldGroup);
    sea = ArqWorld.ocean(tiles, 220); scene.add(sea); // grande o bastante para as bordas sumirem na névoa
    const shoals = tiles.filter(t => t.biome === 'cardume'); if (shoals.length) { const r = ArqWorld.reefs(shoals); reefs.push(r); scene.add(r); }
    amb = ArqWorld.ambient(ext + .4); scene.add(amb);
    // fichas (no cardume, sobre uma jangadinha de toras)
    // geometrias fixas fundidas numa malha só por material (jangadas e píeres): poucas chamadas de desenho
    const wood = new T.MeshStandardMaterial({ color: new T.Color('#8a6238').convertSRGBToLinear(), roughness: .8 }), woodParts = [];
    const place = (geo, x, y, z, ry = 0, rz = 0) => { const M = new T.Matrix4().makeRotationFromEuler(new T.Euler(0, ry, rz, 'YXZ')).setPosition(x, y, z); woodParts.push(geo.clone().applyMatrix4(M)); };
    for (const t of tiles) if (t.num) {
      const tk = ArqWorld.tokenMesh(t.num);
      if (t.biome === 'cardume') {
        for (let k = 0; k < 5; k++) { const off = (k - 2) * .092; place(LOG, t.x + Math.sin(.4) * off, .01, t.z + Math.cos(.4) * off, .4, Math.PI / 2); }
        tk.position.set(t.x, .075, t.z);
      } else { const s = world.tokenSpot(t.id); tk.position.set(s.x, s.y + .045, s.z); }
      tk.userData.base = tk.position.y; scene.add(tk); tokens[t.id] = { mesh: tk, num: t.num };
    }
    // mercados: píer de tábuas da praia para o mar e placa com recurso e proporção
    markets = new T.Group(); const G = Arq.grid(st);
    for (const mk of st.map.markets) {
      const E = G.edges[mk.edge], A = G.vertices[E.a], B = G.vertices[E.b], S = G.hexes[mk.sea];
      const mx = (A.x + B.x) / 2, mz = (A.y + B.y) / 2, dx = S.x - mx, dz = S.y - mz, L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L;
      for (let k = 0; k < 5; k++) place(PLANK, mx + ux * (.1 + k * .09), .03, mz + uz * (.1 + k * .09), -Math.atan2(uz, ux) + Math.PI / 2);
      for (const sx of [-1, 1]) place(POST, mx + ux * .5 - uz * .09 * sx, .0, mz + uz * .5 + ux * .09 * sx);
      const icon = { madeira: '🪵', argila: '🧱', algodao: '☁️', pedra: '🪨', peixe: '🐟', any: '⚓' }[mk.type];
      const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
      g.fillStyle = '#f1e2bd'; g.beginPath(); g.arc(64, 64, 60, 0, Math.PI * 2); g.fill(); g.lineWidth = 6; g.strokeStyle = '#6b4a24'; g.stroke();
      g.font = '46px serif'; g.textAlign = 'center'; g.fillText(icon, 64, 66); g.font = '800 26px system-ui'; g.fillStyle = '#3b2a14'; g.fillText(mk.type === 'any' ? '3:1' : '2:1', 64, 106);
      const tex = new T.CanvasTexture(c); tex.encoding = T.sRGBEncoding;
      const sign = new T.Sprite(new T.SpriteMaterial({ map: tex })); sign.position.set(mx + ux * .58, .4, mz + uz * .58); sign.scale.setScalar(.42); markets.add(sign);
    }
    const woodMesh = new T.Mesh(THREE.BufferGeometryUtils.mergeBufferGeometries(woodParts), wood); woodMesh.castShadow = woodMesh.receiveShadow = true; markets.add(woodMesh);
    scene.add(markets);
    // alvos invisíveis para o mouse sobre cada hexágono (balão de informação)
    for (const t of tiles) { const m = new T.Mesh(new T.CircleGeometry(.95, 6).rotateX(-Math.PI / 2).rotateY(Math.PI / 6), new T.MeshBasicMaterial({ visible: false })); m.position.set(t.x, Math.max(.05, world.heightAt(t.x, t.z)), t.z); m.userData.hex = t.id; scene.add(m); pickHex.push(m); }
    canvas.style.filter = atmo.setPreset(preset).grade;
    storm.userData.hex = null;
    fit();
  }

  // ---------- peças ----------
  const geoCache = {}, matPiece = () => geoCache.mat || (geoCache.mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: .7 }));
  const pieceGeo = (kind, color, len) => { const k = kind + color + (len || ''); return geoCache[k] || (geoCache[k] = kind === 'vila' ? ArqWorld.houseGeo(color) : kind === 'cidade' ? ArqWorld.cityGeo(color) : ArqWorld.roadGeo(color, len)); };
  function syncPieces(st, ui) {
    // tira as peças antigas; as geometrias das peças ficam em cache, só a malha de sombras de contato é descartada
    for (const o of [...pieceGroup.children]) { pieceGroup.remove(o); if (o.userData.own) { o.geometry.dispose(); o.material.dispose(); } }
    const G = Arq.grid(st), col = id => Arq.COLORS.find(c => c.id === st.players.find(p => p.id === id)?.color)?.hex || '#999', blobs = [];
    for (const [e, o] of Object.entries(st.roads)) {
      const E = G.edges[e], A = G.vertices[E.a], B = G.vertices[E.b], mx = (A.x + B.x) / 2, mz = (A.y + B.y) / 2;
      const m = new T.Mesh(pieceGeo('trilha', col(o), .72), matPiece()); m.position.set(mx, world.heightAt(mx, mz) + .006, mz); m.rotation.y = -Math.atan2(B.y - A.y, B.x - A.x); m.castShadow = m.receiveShadow = true;
      pieceGroup.add(m); if (ui.fresh?.has('e' + e)) pop(m);
    }
    for (const [v, b] of Object.entries(st.buildings)) {
      const V = G.vertices[v], y = world.heightAt(V.x, V.y), m = new T.Mesh(pieceGeo(b.type, col(b.owner)), matPiece());
      m.position.set(V.x, y, V.y); m.rotation.y = (+v % 5) * .35 - .6; m.castShadow = m.receiveShadow = true; pieceGroup.add(m); if (ui.fresh?.has('v' + v)) pop(m);
      blobs.push([V.x, y, V.y, b.type === 'cidade' ? .27 : .2]);
    }
    for (const t of Object.values(tokens)) blobs.push([t.mesh.position.x, t.mesh.userData.base - .045, t.mesh.position.z, .3]);
    if (blobs.length) { const cs = ArqWorld.contactShadows(blobs); cs.userData.own = true; pieceGroup.add(cs); }
    // tempestade: nuvem flutuando sobre o hexágono bloqueado (desliza quando muda)
    const S = G.hexes[st.storm], sy = Math.max(.3, world.heightAt(S.x, S.y)) + 1.15;
    if (storm.userData.hex == null) storm.position.set(S.x, sy, S.y);
    else if (storm.userData.hex !== st.storm) { const from = storm.position.clone(), to = new T.Vector3(S.x, sy, S.y); tween(.9, k => { storm.position.lerpVectors(from, to, easeOut(k)); storm.position.y += Math.sin(k * Math.PI) * .6; }); }
    storm.userData.hex = st.storm;
  }
  function pop(m) { const s = m.scale.clone(); m.scale.setScalar(.001); tween(.5, k => { const b = 1 + Math.sin(k * Math.PI) * .25 * (1 - k); m.scale.set(s.x * easeOut(k) * b, s.y * easeOut(k) * b, s.z * easeOut(k) * b); }); }
  function makeStorm() {
    const g = new THREE.Group(), cm = new THREE.MeshStandardMaterial({ color: new THREE.Color('#5a6270').convertSRGBToLinear(), roughness: 1 });
    for (const [x, y, z, r] of [[0, 0, 0, .3], [.27, -.02, .05, .23], [-.26, -.03, -.02, .22], [.06, .13, -.05, .21], [-.08, -.05, .2, .19]]) { const s = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), cm); s.position.set(x, y, z); s.castShadow = true; g.add(s); }
    const bolt = new THREE.Mesh(new THREE.ConeGeometry(.05, .45, 4), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd34a').convertSRGBToLinear() })); bolt.position.y = -.42; bolt.rotation.z = .3; g.add(bolt); g.userData.bolt = bolt;
    const rain = new THREE.Mesh(new THREE.CylinderGeometry(.32, .38, .9, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0x9ec4ff, transparent: true, opacity: .12, depthWrite: false, side: THREE.DoubleSide })); rain.position.y = -.55; g.add(rain);
    return g;
  }

  // ---------- destaques clicáveis ----------
  const hlMat = () => new T.MeshBasicMaterial({ color: 0xffd23a, transparent: true, opacity: .85, depthWrite: false });
  function syncHighlights(st, ui) {
    while (hlGroup.children.length) hlGroup.remove(hlGroup.children[0]);
    const G = Arq.grid(st);
    for (const v of ui.vertices || []) { const V = G.vertices[v], m = new T.Mesh(new T.SphereGeometry(.15, 14, 10), hlMat()); m.position.set(V.x, world.heightAt(V.x, V.y) + .16, V.y); m.userData = { kind: 'vertex', id: v }; hlGroup.add(m); }
    for (const e of ui.edges || []) { const E = G.edges[e], A = G.vertices[E.a], B = G.vertices[E.b], mx = (A.x + B.x) / 2, mz = (A.y + B.y) / 2, m = new T.Mesh(new T.BoxGeometry(.6, .1, .16), hlMat()); m.position.set(mx, world.heightAt(mx, mz) + .08, mz); m.rotation.y = -Math.atan2(B.y - A.y, B.x - A.x); m.userData = { kind: 'edge', id: e }; hlGroup.add(m); }
    for (const h of ui.hexes || []) { const H = G.hexes[h], m = new T.Mesh(new T.CircleGeometry(.85, 6).rotateX(-Math.PI / 2).rotateY(Math.PI / 6), new T.MeshBasicMaterial({ color: 0xffe58a, transparent: true, opacity: .2, depthWrite: false, side: T.DoubleSide })); m.position.set(H.x, Math.max(.06, world.heightAt(H.x, H.y) + .08), H.y); m.userData = { kind: 'hex', id: h }; m.renderOrder = 5; hlGroup.add(m); }
  }

  // ---------- entrada ----------
  let down = null, hoverHex = null, hovered = null;
  function rayAt(e, list) { const r = canvas.getBoundingClientRect(); ray.setFromCamera(new T.Vector2((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1), camera); return ray.intersectObjects(list, false)[0]; }
  function bindInput() {
    canvas.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY, yaw: cam.tyaw, tilt: cam.ttilt, moved: false }; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', e => {
      if (down) { const dx = e.clientX - down.x, dy = e.clientY - down.y; if (Math.hypot(dx, dy) > 6) down.moved = true; if (down.moved) { cam.tyaw = down.yaw - dx * .006; cam.ttilt = Math.max(.45, Math.min(1.25, down.tilt - dy * .004)); } return; }
      const hit = rayAt(e, hlGroup.children);
      if (hovered !== (hit?.object || null)) { if (hovered) { hovered.material.opacity = hovered.userData.kind === 'hex' ? .2 : .85; hovered.material.color.setHex(0xffd23a); } hovered = hit?.object || null; if (hovered) { hovered.material.opacity = hovered.userData.kind === 'hex' ? .45 : 1; hovered.material.color.setHex(0xffffff); } }
      canvas.style.cursor = hit ? 'pointer' : 'grab';
      const h = rayAt(e, pickHex)?.object.userData.hex ?? null; if (h !== hoverHex) { hoverHex = h; handlers.hover?.(h, e); }
    });
    canvas.addEventListener('pointerup', e => { const d = down; down = null; if (d && !d.moved) { const hit = rayAt(e, hlGroup.children); if (hit) handlers.pick?.(hit.object.userData); } });
    canvas.addEventListener('pointerleave', () => { if (hoverHex != null) { hoverHex = null; handlers.hover?.(null); } });
    canvas.addEventListener('wheel', e => { e.preventDefault(); cam.tdist = Math.max(4, Math.min(fitDist() * 1.25, cam.tdist * (e.deltaY > 0 ? 1.1 : .9))); }, { passive: false });
  }
  const fitDist = () => { const big = last?.map.size === 'big', w = big ? 13.5 : 10.5, h = big ? 11 : 9; const vf = camera.fov * Math.PI / 180; return Math.max(h / 2 / Math.tan(vf / 2), w / 2 / Math.tan(vf / 2) / camera.aspect) * 1.02; };
  function fit() { cam.tdist = cam.dist = fitDist(); }
  function resize() {
    if (!host || !renderer) return; const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false); canvas.style.width = w + 'px'; canvas.style.height = h + 'px'; camera.aspect = w / h; camera.updateProjectionMatrix();
    if (last) cam.tdist = Math.min(cam.tdist, fitDist() * 1.25);
  }

  // ---------- laço ----------
  function frame(dt) {
    clock += dt;
    for (let i = tweens.length - 1; i >= 0; i--) { const t = tweens[i], k = Math.min(1, (clock - t.t0) / t.dur); t.fn(k); if (k >= 1) { tweens.splice(i, 1); t.done?.(); } }
    const kc = 1 - Math.exp(-dt * 6); for (const p of ['yaw', 'tilt', 'dist']) cam[p] += (cam['t' + p] - cam[p]) * kc;
    camera.position.set(Math.sin(cam.yaw) * Math.sin(cam.tilt) * cam.dist, Math.cos(cam.tilt) * cam.dist, Math.cos(cam.yaw) * Math.sin(cam.tilt) * cam.dist + .4); camera.lookAt(0, 0, .4);
    storm.rotation.y += dt * .3; storm.userData.bolt.visible = Math.sin(clock * 7) > .6 || Math.sin(clock * 2.3) > .97;
    for (const m of hlGroup.children) if (m !== hovered && m.userData.kind !== 'hex') m.scale.setScalar(1 + Math.sin(clock * 5) * .12);
    ArqWorld.animate(null, clock);
    renderer.render(scene, camera);
  }
  function loop(t) {
    raf = requestAnimationFrame(loop); const dt = Math.min(.05, (t - (lastT || t)) / 1000); lastT = t;
    const t0 = performance.now(); frame(dt); adapt(dt, performance.now() - t0);
  }
  // se o quadro passar de ~28 ms com frequência (menos de ~35 fps), desce um degrau: resolução 1x e sombras menores
  function adapt(dt, ms) {
    quality.acc += dt; quality.samples++; if (dt > .028) quality.slow++;
    if (quality.acc < 3) return;
    if (quality.level > 0 && quality.slow / quality.samples > .5) {
      quality.level--;
      if (quality.level === 1) renderer.setPixelRatio(1);
      if (quality.level === 0) { atmo.sun.shadow.mapSize.set(1024, 1024); atmo.sun.shadow.map?.dispose(); atmo.sun.shadow.map = null; }
      resize();
    }
    quality.acc = 0; quality.slow = 0; quality.samples = 0;
  }

  // ---------- interface pública ----------
  function mount(el, h) {
    if (!supported()) return false;
    if (!mounted) { init(); new ResizeObserver(() => resize()).observe(document.body); }
    handlers = h || {}; host = el; el.appendChild(canvas); mapKey = null; resize(); return true;
  }
  function update(st, ui = {}) {
    if (!mounted || !host) return;
    last = st;
    if (st.gameId !== mapKey) { mapKey = st.gameId; buildStatic(st); resize(); }
    syncPieces(st, ui); syncHighlights(st, ui);
  }
  function show(on) { active = !!on && mounted; cancelAnimationFrame(raf); lastT = 0; if (canvas) canvas.style.display = active ? '' : 'none'; if (active) { resize(); raf = requestAnimationFrame(loop); } }
  function screenPos(kind, id) {
    if (!last || !camera) return null;
    const G = Arq.grid(last); let x, z;
    if (kind === 'hex') ({ x, y: z } = G.hexes[id]);
    else if (kind === 'vertex') ({ x, y: z } = G.vertices[id]);
    else { const E = G.edges[id]; x = (G.vertices[E.a].x + G.vertices[E.b].x) / 2; z = (G.vertices[E.a].y + G.vertices[E.b].y) / 2; }
    const v = new T.Vector3(x, (world?.heightAt(x, z) ?? 0) + (kind === 'hex' ? .3 : .1), z).project(camera), r = canvas.getBoundingClientRect(); // na altura dos destaques
    return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height };
  }
  function hitNumber(n) {
    for (const [h, t] of Object.entries(tokens)) if (t.num === n && +h !== last?.storm) { const m = t.mesh; tween(1.2, k => { m.position.y = m.userData.base + Math.sin(k * Math.PI * 2) * .22 * (1 - k * .5); m.rotation.x = Math.sin(k * Math.PI * 2) * .2; }, () => { m.position.y = m.userData.base; m.rotation.x = 0; }); }
  }
  // horário da luz (manhã, tarde, pôr do sol) — só na tela de quem escolheu
  function setPreset(k) { preset = k; try { localStorage.setItem('arq-luz', k); } catch { } if (atmo) { const P = atmo.setPreset(k); canvas.style.filter = P.grade; } }
  const PRESET_ORDER = ['manha', 'tarde', 'por'];
  function nextPreset() { setPreset(PRESET_ORDER[(PRESET_ORDER.indexOf(preset) + 1) % 3]); return preset; }
  // depuração: avança quadros sem o requestAnimationFrame (aba em segundo plano) e mede o custo
  const step = n => { for (let i = 0; i < n; i++) frame(1 / 60); };
  return { supported, mount, update, show, screenPos, hitNumber, setPreset, nextPreset, get preset() { return preset; }, step, cam, get renderer() { return renderer; }, get quality() { return quality.level; } };
})();
