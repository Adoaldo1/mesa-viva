// ===== Vida Adulta: tabuleiro 3D (Three.js r128) =====
// Estrada sinuosa com casas coloridas, roleta 3D de 1 a 10, carrinhos com motorista (retrato) e pininhos de cônjuge e filhos,
// tudo sobre um mapa de cidade pintado à mão em estilo HQ (assets/vida/mapa.webp, gerado por tools/gen_vida_map.py).
const Vida3D = (() => {
  let T, renderer, scene, camera, raycaster, wrap, canvas, raf = 0, mounted = false, active = false, lastT = 0, clock = 0;
  let handlers = {}, view = null, queue = [], busy = false;
  const BW = 20, BH = 13; // tabuleiro
  const nodes = [];      // posição de cada casa (Vector3) e direção
  const cars = {};       // id → Group do carro
  const tweens = [], tickers = [];
  const cam = { az: 0, polar: 44, r: 19, azTo: 0, lx: 0, lz: 1.1, shake: 0 };
  let wheel, wheelSpin = { a: 0, to: 0, t0: 0, dur: 0, from: 0 }, tollArm, windmill, casinoBulbs = [], fountain;
  const COLORS = { pay: '#3fae5a', vinganca: '#f3e27a', lifeins: '#3d7fe0', stockbuy: '#8a4fd0', bolsa: '#8a4fd0', kid: '#ef7fb4', prof: '#9aa1a8', event: '#f5f0e4',
    start: '#ffcf4a', wedding: '#ff8fb0', apartment: '#e8a25a', toll: '#ff9a2a', sorte: '#5ad38a', juizo: '#5a4a7a', millionaire: '#ffd23a' };
  const WHEEL_COLORS = ['#e5484d', '#f76b15', '#ffc53d', '#46a758', '#12a594', '#3e63dd', '#8e4ec6', '#e93d82', '#2b2b30', '#f2efe6'];

  const ease = t => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2), easeOut = t => 1 - Math.pow(1 - t, 3);
  const tween = (dur, fn, done, delay = 0) => tweens.push({ t0: clock + delay, dur, fn, done });
  const wait = ms => new Promise(r => tween(ms / 1000, () => {}, r));
  const M = (geo, mt, x = 0, y = 0, z = 0) => { const o = new T.Mesh(geo, mt); o.position.set(x, y, z); return o; };
  const mat = (c, o = {}) => new T.MeshStandardMaterial({ color: c, roughness: .55, metalness: .02, ...o });
  let gradTex; const toon = c => new T.MeshToonMaterial({ color: new T.Color(c).convertSRGBToLinear(), toneMapped: false, gradientMap: gradTex || (gradTex = (() => { const t = new T.DataTexture(new Uint8Array([90, 90, 90, 255, 200, 200, 200, 255, 255, 255, 255, 255]), 3, 1, T.RGBAFormat); t.minFilter = t.magFilter = T.NearestFilter; t.needsUpdate = true; return t; })()) });
  let INK; // contorno preto dos quadrinhos
  const pbr = (c, o = {}) => new T.MeshPhysicalMaterial({ color: c, roughness: .35, clearcoat: .7, clearcoatRoughness: .2, ...o });
  function canvasTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; t.anisotropy = 4; return t; }
  function rbox(w, h, d, r = .05) {
    const s = new T.Shape(), x = -w / 2 + r, z = -d / 2 + r, ww = w - 2 * r, dd = d - 2 * r;
    s.moveTo(x, z - r); s.lineTo(x + ww, z - r); s.quadraticCurveTo(x + ww + r, z - r, x + ww + r, z); s.lineTo(x + ww + r, z + dd); s.quadraticCurveTo(x + ww + r, z + dd + r, x + ww, z + dd + r);
    s.lineTo(x, z + dd + r); s.quadraticCurveTo(x - r, z + dd + r, x - r, z + dd); s.lineTo(x - r, z); s.quadraticCurveTo(x - r, z - r, x, z - r);
    const b = Math.min(r * .6, h / 3), g = new T.ExtrudeGeometry(s, { depth: h - 2 * b, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 3, curveSegments: 5 });
    g.rotateX(Math.PI / 2); g.translate(0, h - b, 0); return g; // base em y = 0
  }
  const glowTex = (() => { let t; return () => t || (t = canvasTex(64, 64, (c, w) => { const g = c.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.4, 'rgba(255,255,255,.4)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, w, w); })); })();
  const sprite = (color, size, additive = true) => { const s = new T.Sprite(new T.SpriteMaterial({ map: glowTex(), color, transparent: true, depthWrite: false, blending: additive ? T.AdditiveBlending : T.NormalBlending })); s.scale.setScalar(size); return s; };

  function supported() { if (!window.THREE) return false; try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; } }
  function mount(el, h) {
    handlers = h || {};
    if (mounted) { if (canvas.parentElement !== el) el.prepend(canvas); wrap = el; resize(); return true; }
    if (!supported()) return false;
    T = THREE; wrap = el;
    renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); renderer.outputEncoding = T.sRGBEncoding;
    renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = .88;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
    canvas = renderer.domElement; canvas.className = 'vida3d'; el.prepend(canvas);
    scene = new T.Scene(); scene.background = new T.Color(0x9ed4f0); scene.fog = new T.Fog(0x9ed4f0, 55, 120);
    camera = new T.PerspectiveCamera(38, 1, .1, 200); raycaster = new T.Raycaster();
    // ambiente para reflexos (céu claro)
    const envS = new T.Scene(); envS.add(new T.Mesh(new T.SphereGeometry(30, 16, 8), new T.MeshBasicMaterial({ color: 0xbfe3ff, side: T.BackSide })));
    const sunP = new T.Mesh(new T.PlaneGeometry(10, 10), new T.MeshBasicMaterial({ color: 0xffffff, side: T.DoubleSide })); sunP.position.set(0, 20, 8); sunP.lookAt(0, 0, 0); envS.add(sunP);
    const pm = new T.PMREMGenerator(renderer); scene.environment = pm.fromScene(envS, .04).texture; pm.dispose();
    scene.add(new T.HemisphereLight(0xdff2ff, 0x6a8a4a, .42));
    const sun = new T.DirectionalLight(0xfff1d6, 1.15); sun.position.set(-9, 20, 12); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -13, right: 13, top: 10, bottom: -10, near: 1, far: 60 }); sun.shadow.bias = -.0005; scene.add(sun);
    INK = new T.MeshBasicMaterial({ color: '#1d1a24' });
    buildBoard(); buildRoad(); buildDecor(); buildWheel();
    bindInput(); new ResizeObserver(resize).observe(el); resize();
    mounted = true; return true;
  }

  // ---------- tabuleiro: mesa, base e paisagem pintada ----------
  function buildBoard() {
    const table = M(new T.CircleGeometry(40, 64), mat('#7a5232', { roughness: .7 })); table.rotation.x = -Math.PI / 2; table.position.y = -.42; table.receiveShadow = true; scene.add(table);
    // moldura de quadrinho: borda preta grossa e passe-partout creme
    const frame = M(rbox(BW + .9, .38, BH + .9, .4), toon('#1d1a24'), 0, -.42, 0); frame.receiveShadow = frame.castShadow = true; scene.add(frame);
    const base = M(rbox(BW + .5, .4, BH + .5, .3), toon('#e9a13b'), 0, -.4, 0); base.receiveShadow = true; scene.add(base);
    // a cidade pintada à mão (gerada a partir do traçado exato das estradas: as casas caem sobre as ruas desenhadas)
    const land = new T.TextureLoader().load(IMG.vida_map); land.encoding = T.sRGBEncoding; land.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const top = M(new T.PlaneGeometry(BW, BH), new T.MeshLambertMaterial({ map: land, emissive: '#ffffff', emissiveMap: land, emissiveIntensity: .38, toneMapped: false })); top.rotation.x = -Math.PI / 2; top.position.y = .002; top.receiveShadow = true; scene.add(top);
    const ink = M(new T.PlaneGeometry(BW + .16, BH + .16), new T.MeshBasicMaterial({ color: '#1d1a24' })); ink.rotation.x = -Math.PI / 2; ink.position.y = -.001; scene.add(ink);
  }

  // ---------- estrada e casas ----------
  function segCurve(seg) {
    const R = VIDA_BOARD.route[seg];
    return new T.CatmullRomCurve3(R.map(([x, z]) => new T.Vector3(x, 0, z)), false, 'centripetal');
  }
  function buildRoad() {
    const S = VIDA_BOARD.spaces, segs = {};
    for (const s of S) (segs[s.seg] = segs[s.seg] || []).push(s.id);
    nodes[VIDA_BOARD.start] = { p: new T.Vector3(VIDA_BOARD.startPos[0], 0, VIDA_BOARD.startPos[1]), dir: new T.Vector3(1, 0, 0) };
    for (const [seg, ids] of Object.entries(segs)) {
      if (seg === 'start') continue;
      const curve = segCurve(seg), n = ids.length;
      // asfalto ao longo do traçado
            ids.forEach((id, i) => {
        const t = n === 1 ? .5 : i / (n - 1), p = curve.getPointAt(t), dir = curve.getTangentAt(t).setY(0).normalize();
        nodes[id] = { p, dir };
      });
    }
    // ligações entre segmentos (pequenos trechos de estrada)
    // as casas: bloquinho arredondado com ícone e texto curto no topo
    for (const s of S) {
      const big = ['start', 'wedding', 'apartment', 'toll', 'juizo', 'millionaire'].includes(s.type), w = big ? 1.0 : .78;
      const tile = M(rbox(w, .14, w, .12), toon(COLORS[s.type] || '#ffffff'), nodes[s.id].p.x, .02, nodes[s.id].p.z);
      tile.add(M(rbox(w + .1, .1, w + .1, .16), INK, 0, -.02, 0));
      tile.rotation.y = Math.atan2(nodes[s.id].dir.x, nodes[s.id].dir.z); tile.castShadow = tile.receiveShadow = true; tile.userData.node = s.id; scene.add(tile);
      const tex = canvasTex(256, 256, (c, W) => tileFace(c, W, s));
      const face = M(new T.PlaneGeometry(w * .86, w * .86), new T.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false }), 0, .165, 0); face.rotation.x = -Math.PI / 2; tile.add(face);
      nodes[s.id].tile = tile;
    }
  }
  const ICON = { pay: '💵', vinganca: '😈', lifeins: '🛡️', stockbuy: '📈', bolsa: '📊', kid: '👶', prof: '🎓', event: '', start: '🚦', wedding: '💍', apartment: '🏢', toll: '🚧', sorte: '🍀', juizo: '⚖️', millionaire: '💰' };
  const LABEL = s => ({ pay: s.interest ? 'PAGAMENTO\n+ JUROS' : 'DIA DO\nPAGAMENTO', vinganca: 'VINGANÇA', lifeins: 'SEGURO\nDE VIDA', stockbuy: 'COMPRE\nAÇÕES', bolsa: 'BOLSA', kid: s.n === 2 ? 'GÊMEOS!' : 'BEBÊ!',
    prof: VIDA_PROFS[s.prof]?.name.toUpperCase(), start: 'SAÍDA', wedding: 'CASAMENTO', apartment: 'APARTA-\nMENTO', toll: 'PEDÁGIO', sorte: 'DIA DE\nSORTE', juizo: 'DIA DO\nJUÍZO', millionaire: 'MILIONÁRIO' })[s.type];
  function tileFace(c, W, s) {
    c.clearRect(0, 0, W, W); c.textAlign = 'center'; c.textBaseline = 'middle';
    const dark = ['juizo', 'lifeins', 'stockbuy', 'bolsa', 'pay'].includes(s.type), fg = dark ? '#ffffff' : '#2a2018';
    if (s.type === 'event') {
      c.font = '900 64px Nunito, Arial'; c.fillStyle = s.amt > 0 ? '#1f8a3a' : s.amt < 0 ? '#c8281e' : '#6a6a6a';
      c.fillText(s.amt === 0 ? '—' : (s.amt > 0 ? '+' : '−') + '$' + Math.abs(s.amt / 1000) + 'k', W / 2, W * .36);
      c.font = '44px "Segoe UI Emoji", "Apple Color Emoji", sans-serif'; c.fillText(s.ins ? { car: '🚗', house: '🏠', life: '❤️' }[s.ins] : s.amt > 0 ? '🤑' : s.amt < 0 ? '💸' : '😐', W / 2, W * .72);
      return;
    }
    c.font = '78px "Segoe UI Emoji", "Apple Color Emoji", sans-serif'; c.fillText(ICON[s.type] || (s.type === 'prof' ? VIDA_PROFS[s.prof].icon : ''), W / 2, W * .34);
    const lines = (LABEL(s) || '').split('\n'); c.fillStyle = fg; c.font = `900 ${lines.some(l => l.length > 10) ? 26 : 32}px Nunito, Arial`;
    lines.forEach((l, i) => c.fillText(l, W / 2, W * .7 + (i - (lines.length - 1) / 2) * 32));
  }

  // ---------- cenário: um prédio para cada etapa da vida ----------
  function buildDecor() { // o mapa pintado já traz a cidade; aqui só nuvens passando ao longe
    for (let i = 0; i < 6; i++) { const cl = new T.Group(); for (let k = 0; k < 4; k++) cl.add(M(new T.SphereGeometry(.5 + Math.random() * .3, 12, 8), new T.MeshToonMaterial({ color: '#ffffff' }), k * .6, Math.random() * .2, Math.random() * .3)); cl.position.set(-14 + i * 6, 6 + Math.random() * 2, -10 - Math.random() * 4); scene.add(cl); tickers.push((t, dt) => { cl.position.x += dt * .3; if (cl.position.x > 20) cl.position.x = -20; }); }
  }

  // ---------- roleta 3D (1 a 10) ----------
  function buildWheel() {
    const g = new T.Group(); g.position.set(5.6, 0, -2.7);
    g.add(M(new T.CylinderGeometry(1.35, 1.45, .2, 48), toon('#1d1a24'), 0, .1, 0));
    const tex = canvasTex(512, 512, (c, w) => {
      const cx = w / 2, R = w / 2 - 6;
      for (let i = 0; i < 10; i++) { const a0 = (i / 10) * Math.PI * 2 - Math.PI / 2, a1 = ((i + 1) / 10) * Math.PI * 2 - Math.PI / 2; c.fillStyle = WHEEL_COLORS[i]; c.beginPath(); c.moveTo(cx, cx); c.arc(cx, cx, R, a0, a1); c.closePath(); c.fill(); c.strokeStyle = '#ffffff'; c.lineWidth = 5; c.stroke();
        const am = (a0 + a1) / 2; c.save(); c.translate(cx + Math.cos(am) * R * .72, cx + Math.sin(am) * R * .72); c.rotate(am + Math.PI / 2); c.font = '900 64px Nunito, Arial'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = i === 9 || i === 2 ? '#1b1b1b' : '#ffffff'; c.fillText(String(i + 1), 0, 0); c.restore(); }
      c.fillStyle = '#ffd23a'; c.beginPath(); c.arc(cx, cx, 48, 0, Math.PI * 2); c.fill(); c.font = '40px "Segoe UI Emoji", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('🎡', cx, cx + 2);
    });
    wheel = M(new T.CylinderGeometry(1.25, 1.25, .08, 64), [toon('#ffffff'), new T.MeshBasicMaterial({ map: tex, toneMapped: false }), toon('#ffffff')], 0, .24, 0);
    g.add(wheel);
    for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; g.add(M(new T.CylinderGeometry(.025, .025, .12, 6), pbr('#f0b93a', { metalness: 1 }), Math.sin(a) * 1.28, .3, Math.cos(a) * 1.28)); }
    const ptr = new T.Shape(); ptr.moveTo(-.12, 0); ptr.lineTo(.12, 0); ptr.lineTo(0, -.32); ptr.closePath();
    const pointer = M(new T.ExtrudeGeometry(ptr, { depth: .06, bevelEnabled: true, bevelThickness: .02, bevelSize: .02, bevelSegments: 2 }), pbr('#e5484d'), 0, .34, -1.18); pointer.rotation.x = -Math.PI / 2; g.add(pointer);
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    scene.add(g); wheel.userData.group = g;
  }
  // gira a roleta até parar no número (o ponteiro fica em -z)
  function spinWheel(n, fast) {
    const seg = Math.PI * 2 / 10, target = -((n - .5) * seg) + Math.PI; // centro do setor n alinhado ao ponteiro
    const cur = wheel.rotation.y, base = cur - (cur % (Math.PI * 2));
    let to = base - Math.PI * 2 * (fast ? 2 : 4) + ((target % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) - Math.PI * 2;
    if (to > cur - Math.PI * 2) to -= Math.PI * 2;
    const from = cur; SFX.shake?.();
    return new Promise(r => tween(fast ? .9 : 2.2, k => { wheel.rotation.y = from + (to - from) * easeOut(k); }, () => { SFX.bounce?.(); r(); }));
  }

  // ---------- carrinhos ----------
  function makeCar(color, img) {
    const g = new T.Group(), body = new T.Group(); g.add(body);
    const paint = toon(color);
    body.add(M(rbox(.62, .16, .36, .08), paint, 0, .07, 0), M(rbox(.18, .1, .34, .05), paint, .2, .2, 0), M(rbox(.2, .08, .34, .05), paint, -.22, .2, 0));
    body.add(M(rbox(.42, .02, .3, .04), mat('#f5ead6'), -.02, .225, 0)); // bancos
    const tireM = mat('#1c1c1c', { roughness: .85 }), rimM = pbr('#e8e8e8', { metalness: 1, roughness: .2 });
    for (const [x, z] of [[.19, .19], [-.19, .19], [.19, -.19], [-.19, -.19]]) { const w = M(new T.CylinderGeometry(.075, .075, .06, 18), tireM, x, .075, z); w.rotation.x = Math.PI / 2; body.add(w); const r = M(new T.CylinderGeometry(.04, .04, .065, 12), rimM, x, .075, z); r.rotation.x = Math.PI / 2; body.add(r); }
    for (const z of [.1, -.1]) body.add(M(new T.SphereGeometry(.025, 10, 8), new T.MeshStandardMaterial({ color: 0xfff4c0, emissive: 0xfff4c0, emissiveIntensity: .8 }), .31, .1, z));
    const shield = M(new T.BoxGeometry(.02, .1, .3), new T.MeshPhysicalMaterial({ color: 0xbfe3ff, transparent: true, opacity: .5, roughness: .05 }), .11, .3, 0); shield.rotation.z = -.4; body.add(shield);
    // pininhos: motorista (retrato), cônjuge e filhos
    const pegs = new T.Group(); body.add(pegs); g.userData.pegs = pegs;
    const tex = canvasTex(256, 256, () => {}); const im = new Image(); im.onload = () => { const c = tex.image.getContext('2d'); c.save(); c.beginPath(); c.arc(128, 128, 118, 0, Math.PI * 2); c.fillStyle = color; c.fill(); c.beginPath(); c.arc(128, 128, 104, 0, Math.PI * 2); c.clip(); c.drawImage(im, 24, 10, 208, 260); c.restore(); tex.needsUpdate = true; }; if (img) im.src = img;
    const face = new T.Sprite(new T.SpriteMaterial({ map: tex, depthWrite: false })); face.scale.set(.42, .42, 1); face.position.set(0, .72, 0); face.renderOrder = 6; g.add(face); g.userData.face = face;
    const ring = M(new T.TorusGeometry(.42, .02, 8, 40), new T.MeshStandardMaterial({ color: 0xffd23a, emissive: 0xffb020, emissiveIntensity: 1 }), 0, .02, 0); ring.rotation.x = Math.PI / 2; ring.visible = false; g.add(ring); g.userData.ring = ring;
    g.userData.body = body; g.userData.color = color; body.scale.setScalar(1.35);
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    return g;
  }
  function peg(color, small) { const g = new T.Group(), m = pbr(color, { roughness: .3 }); g.add(M(new T.CylinderGeometry(small ? .022 : .028, small ? .028 : .034, small ? .08 : .11, 10), m, 0, small ? .04 : .055, 0), M(new T.SphereGeometry(small ? .026 : .033, 12, 10), m, 0, small ? .1 : .135, 0)); return g; }
  function setPegs(g, p) {
    const key = (p.married ? 1 : 0) + ':' + Math.min(4, p.kids); if (g.userData.pegKey === key) return; const was = g.userData.pegKey; g.userData.pegKey = key;
    const pegs = g.userData.pegs; pegs.clear();
    const seats = [[.04, .07], [.04, -.07], [-.1, .09], [-.1, -.03], [-.18, .09], [-.18, -.03]];
    const put = (o, x, z) => { o.position.set(x, .23, z); pegs.add(o); };
    put(peg('#3d7fe0'), .04, .07);
    if (p.married) put(peg('#ef7fb4'), .04, -.07);
    for (let k = 0; k < Math.min(4, p.kids); k++) { const s = seats[2 + k]; put(peg(k % 2 ? '#ef7fb4' : '#3d7fe0', true), s[0], s[1]); }
    if (was) { const p0 = g.position.clone().setY(.6); for (let i = 0; i < 14; i++) burst(p0, 0xffd6e8, .14, 1.4, .8); }
  }
  const slot = (id, node) => { const here = Object.keys(cars).filter(k => k !== id && view?.players.find(p => p.id === k)?.pos === node); const n = nodes[node]; return n.p.clone(); };
  // posição de cada carro na casa (vários na mesma casa ficam lado a lado — só no Milionário e na Saída)
  function spotFor(pid, node) {
    const same = view.players.filter(p => p.pos === node && p.status !== 'bankrupt'), k = same.findIndex(p => p.id === pid), n = nodes[node];
    const side = new T.Vector3(-n.dir.z, 0, n.dir.x);
    return n.p.clone().addScaledVector(side, same.length > 1 ? (k - (same.length - 1) / 2) * .55 : 0).setY(.16);
  }

  // ---------- sincronização ----------
  let locked = new Set();
  function sync(v) {
    if (!mounted) return; view = v;
    for (const p of v.players) {
      const r = handlers.info?.(p.id) || {};
      let g = cars[p.id];
      if (!g || g.userData.key !== r.color + r.img) { if (g) scene.remove(g); g = makeCar(r.color || '#e5484d', r.img); g.userData.key = r.color + r.img; scene.add(g); cars[p.id] = g; g.position.copy(spotFor(p.id, p.pos)); face(g, nodes[p.pos].dir); }
      setPegs(g, p);
      g.userData.ring.visible = v.players[v.turn]?.id === p.id && !v.result;
      g.visible = p.status !== 'bankrupt' || locked.has(p.id);
      if (p.status === 'bankrupt') g.userData.body.traverse(o => { if (o.isMesh && o.material.color) o.material = mat('#6a6a6a'); });
      if (!locked.has(p.id) && !busy) { const to = spotFor(p.id, p.pos); if (g.position.distanceTo(to) > .02) { const a = g.position.clone(); tween(.3, k => g.position.lerpVectors(a, to, ease(k))); } }
    }
  }
  function face(g, dir) { g.userData.body.rotation.y = Math.atan2(-dir.z, dir.x); }

  // ---------- animações de eventos ----------
  function play(e) { queue.push(e); if (queue.length > 14) queue.splice(0, queue.length - 14); pump(); }
  async function pump() {
    if (busy) return; busy = true;
    while (queue.length) { const e = queue.shift(), fast = queue.length > 4 || document.hidden; try { await run(e, fast); } catch (err) { console.warn(err); } }
    busy = false; if (view) sync(view);
  }
  async function run(e, fast) {
    const g = cars[e.pid];
    switch (e.type) {
      case 'spin': handlers.spinStart?.(e); await spinWheel(e.value, fast); handlers.spinEnd?.(e); return;
      case 'walk': case 'back': {
        if (!g) return; locked.add(e.pid);
        for (const id of e.path) {
          const to = nodes[id].p.clone().setY(.16), a = g.position.clone(), dir = to.clone().sub(a).setY(0);
          if (dir.lengthSq() > 1e-4) face(g, e.type === 'back' ? dir.clone().negate() : dir.normalize());
          await new Promise(r => tween(fast ? .12 : .26, k => { g.position.lerpVectors(a, to, k); g.position.y = .16 + Math.sin(Math.PI * k) * .25; }, r));
          if (!fast) SFX.step?.(1); puffDust(to);
          if (e.type === 'walk' && VIDA_BOARD.spaces[id].type === 'toll' && tollArm) tween(.6, k => (tollArm.rotation.z = Math.sin(Math.PI * k) * 1.3));
        }
        locked.delete(e.pid); return;
      }
      case 'payday': if (g) { for (let i = 0; i < 10; i++) burst(g.position.clone().setY(.5), 0x7cff8a, .16, 2, .8); SFX.coinUp?.(); } return;
      case 'money': if (g) floatText(g.position, (e.amount > 0 ? '+' : '−') + Vida.money(Math.abs(e.amount)), e.amount > 0 ? '#2fbf5a' : '#e5484d'); return;
      case 'kid': if (g) { for (let i = 0; i < 20; i++) burst(g.position.clone().setY(.5), 0xff9ac8, .18, 2.2, 1); SFX.magic?.(); } return;
      case 'wedding': if (g) { for (let i = 0; i < 40; i++) burst(g.position.clone().setY(.6), i % 2 ? 0xff7fb4 : 0xffffff, .16, 3, 1.4); SFX.win?.(); } await wait(fast ? 200 : 700); return;
      case 'vinganca': { const t = cars[e.target]; if (t) { flashAt(t.position, 0xff2020); for (let i = 0; i < 20; i++) burst(t.position.clone().setY(.4), 0xff4020, .18, 2.6, .8); cam.shake = .25; SFX.explosion?.(); } await wait(fast ? 150 : 500); return; }
      case 'sorte': case 'jackpot': if (g) { for (let i = 0; i < (e.type === 'jackpot' ? 60 : 24); i++) burst(g.position.clone().setY(.6), 0x6aff9a, .18, 3, 1.2); SFX.coinShower?.(); } return;
      case 'bolsa': if (g) { const up = e.value >= 7, down = e.value <= 3; floatText(g.position, up ? '📈 ALTA' : down ? '📉 BAIXA' : '📊 ESTÁVEL', up ? '#2fbf5a' : down ? '#e5484d' : '#888'); } return;
      case 'juizo': if (g) { flashAt(g.position, 0xb090ff); SFX.gavel?.(); cam.shake = .15; } return;
      case 'millionaire': case 'win': if (g) { for (let w = 0; w < (e.type === 'win' ? 8 : 4); w++) { const at = g.position.clone().setY(1.6 + Math.random()); for (let i = 0; i < 30; i++) burst(at, [0xffd23a, 0xff6a9a, 0x6ac0ff][i % 3], .18, 3.5, 1.3); SFX.coinPing?.(w); await wait(220); } } return;
      case 'bankrupt': if (g) { for (let i = 0; i < 30; i++) burst(g.position.clone().setY(.4), 0x555555, .3, 1.5, 1.6, false); SFX.bankrupt?.(); cam.shake = .3; } return;
      case 'toll': if (tollArm) tween(.8, k => (tollArm.rotation.z = Math.sin(Math.PI * k) * 1.3)); SFX.coinDown?.(); return;
      case 'insured': if (g) { const s = sprite(0x6ac0ff, 1.6); s.position.copy(g.position).setY(.4); scene.add(s); tween(.8, k => { s.material.opacity = 1 - k; s.scale.setScalar(1.6 + k); }, () => scene.remove(s)); SFX.shieldUp?.(); } return;
      case 'apartment': case 'prof': case 'buy': if (g) { for (let i = 0; i < 14; i++) burst(g.position.clone().setY(.5), 0xffe08a, .14, 2, .8); } return;
    }
  }
  // efeitos
  function burst(at, color, size, speed, life, additive = true) {
    const s = sprite(color, size, additive); s.position.copy(at); scene.add(s);
    const v = new T.Vector3(Math.random() - .5, Math.random() * .8 + .5, Math.random() - .5).normalize().multiplyScalar(speed * (.4 + Math.random() * .6));
    tween(life * (.6 + Math.random() * .5), k => { s.position.addScaledVector(v, .016); v.y -= .06; s.material.opacity = 1 - k; }, () => { scene.remove(s); s.material.dispose(); });
  }
  function puffDust(at) { for (let i = 0; i < 3; i++) burst(at.clone().setY(.15), 0xe8dcc4, .25, .6, .5, false); }
  function flashAt(at, color) { const s = sprite(color, 3); s.position.copy(at).setY(.6); scene.add(s); tween(.6, k => { s.material.opacity = 1 - k; s.scale.setScalar(3 + k * 3); }, () => scene.remove(s)); }
  function floatText(at, text, color) {
    const tex = canvasTex(256, 64, (c, w, h) => { c.font = '900 40px Nunito, Arial'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineWidth = 8; c.strokeStyle = 'rgba(0,0,0,.6)'; c.strokeText(text, w / 2, h / 2); c.fillStyle = color; c.fillText(text, w / 2, h / 2); });
    const s = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false })); s.scale.set(1.6, .4, 1); s.position.copy(at).setY(1.1); s.renderOrder = 10; scene.add(s);
    tween(1.4, k => { s.position.y = 1.1 + k * .8; s.material.opacity = k < .7 ? 1 : 1 - (k - .7) / .3; }, () => { scene.remove(s); tex.dispose(); });
  }

  // ---------- entrada e câmera ----------
  let down = null, hoverNode = null;
  function pick(e) {
    const r = canvas.getBoundingClientRect(); raycaster.setFromCamera(new T.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
    const hit = raycaster.intersectObjects(nodes.filter(Boolean).map(n => n.tile), true)[0]; let o = hit?.object; while (o && o.userData.node == null) o = o.parent; return o ? o.userData.node : null;
  }
  function bindInput() {
    canvas.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY, az: cam.azTo, moved: false }; try { canvas.setPointerCapture(e.pointerId); } catch { } });
    canvas.addEventListener('pointermove', e => {
      if (down) { const dx = e.clientX - down.x; if (Math.abs(dx) > 5) down.moved = true; if (down.moved) cam.azTo = down.az - dx * .3; return; }
      const n = pick(e); if (n !== hoverNode) { hoverNode = n; handlers.hover?.(n, e); } else if (n != null) handlers.hover?.(n, e);
      canvas.style.cursor = n != null ? 'help' : 'grab';
    });
    canvas.addEventListener('pointerup', () => { down = null; });
    canvas.addEventListener('pointerleave', () => { hoverNode = null; handlers.hover?.(null); });
    canvas.addEventListener('wheel', e => { e.preventDefault(); cam.r = Math.max(8, Math.min(26, cam.r * (e.deltaY > 0 ? 1.1 : .9))); }, { passive: false });
  }
  function resize() {
    if (!renderer || !wrap) return; const w = wrap.clientWidth, h = wrap.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false); canvas.style.width = w + 'px'; canvas.style.height = h + 'px'; camera.aspect = w / h; camera.updateProjectionMatrix();
    const t = Math.tan(camera.fov * Math.PI / 360), fitW = (BW + 1.5) / 2 / t / camera.aspect, fitH = (BH + 2) / 2 / t / Math.cos(cam.polar * Math.PI / 180) * .78; cam.r = Math.max(14, Math.min(34, Math.max(fitW, fitH) * .92));
  }
  function screenPos(node) { const n = nodes[node]; if (!n) return null; const v = n.p.clone().setY(.4).project(camera), r = canvas.getBoundingClientRect(); return { x: (v.x + 1) / 2 * r.width, y: (1 - v.y) / 2 * r.height }; }

  // ---------- laço ----------
  function loop(t) { raf = requestAnimationFrame(loop); const dt = Math.min(.05, (t - (lastT || t)) / 1000); lastT = t; frame(dt); }
  function advance(ms) { for (let k = 0; k < ms / 16; k++) frame(.016); }
  function frame(dt) {
    clock += dt;
    for (let i = tweens.length - 1; i >= 0; i--) { const tw = tweens[i]; if (clock < tw.t0) continue; const k = Math.min(1, (clock - tw.t0) / tw.dur); tw.fn(k); if (k >= 1) { tweens.splice(i, 1); tw.done?.(); } }
    for (const f of tickers) f(clock, dt);
    cam.az += (cam.azTo - cam.az) * Math.min(1, dt * 6);
    const a = cam.az * Math.PI / 180, p = cam.polar * Math.PI / 180;
    camera.position.set(cam.lx + cam.r * Math.sin(p) * Math.sin(a), cam.r * Math.cos(p), cam.lz + cam.r * Math.sin(p) * Math.cos(a));
    if (cam.shake > .001) { camera.position.x += (Math.random() - .5) * cam.shake; camera.position.y += (Math.random() - .5) * cam.shake; cam.shake *= Math.exp(-dt * 7); }
    camera.lookAt(cam.lx, 0, cam.lz);
    const s = clock;
    for (const g of Object.values(cars)) { if (g.userData.ring.visible) { g.userData.ring.rotation.z = s; g.userData.face.position.y = .72 + Math.abs(Math.sin(s * 3)) * .08; } }
    renderer.render(scene, camera);
  }
  function show(on) { active = !!on && mounted; if (!mounted) return; canvas.style.display = active ? '' : 'none'; cancelAnimationFrame(raf); lastT = 0; if (active) { resize(); raf = requestAnimationFrame(loop); } }
  function reset() { for (const g of Object.values(cars)) scene?.remove(g); for (const k of Object.keys(cars)) delete cars[k]; queue = []; locked.clear(); }

  return { supported, mount, show, sync, play, reset, screenPos, advance, get active() { return active; }, get busy() { return busy; }, dbg: () => ({ scene, camera, renderer, nodes, cars }) };
})();
