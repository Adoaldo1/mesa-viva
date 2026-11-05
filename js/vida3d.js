// ===== Vida Adulta: tabuleiro 2.5D isométrico (Three.js r128, câmera ortográfica fixa) =====
// A cidade é uma ilustração isométrica pintada à mão (assets/vida/iso.webp, gerada por tools/gen_vida_map.py --iso a partir
// do traçado exato das ruas — tools/vida_iso_guide.py). Por cima dela: as casas do caminho como marcadores, balões com o nome
// dos trechos, a roleta na praça e os amigos como personagens em pé (standees) que pulam de casa em casa.
const Vida3D = (() => {
  let T, renderer, scene, camera, raycaster, wrap, canvas, raf = 0, mounted = false, active = false, lastT = 0, clock = 0;
  let handlers = {}, view = null, queue = [], busy = false;
  // projeção isométrica (os mesmos números de tools/vida_iso_guide.py)
  const ISO_AZ = Math.PI / 4, ISO_EL = Math.PI / 6, VW = 26.4, VH = 14.85;
  let O, F, RX, UY; // direção da câmera, eixo da tela para a direita e para cima
  const nodes = [];      // posição de cada casa (Vector3) e direção
  const cars = {};       // id → personagem
  const tweens = [], tickers = [];
  const cam = { shake: 0 };
  let wheel, tollArm;
  const COLORS = { pay: '#3fae5a', vinganca: '#f3d23a', lifeins: '#3d7fe0', stockbuy: '#8a4fd0', bolsa: '#8a4fd0', kid: '#ef7fb4', prof: '#9aa1a8', event: '#ffffff',
    start: '#ffcf4a', wedding: '#ff8fb0', apartment: '#e8a25a', toll: '#ff9a2a', sorte: '#5ad38a', juizo: '#5a4a7a', millionaire: '#ffd23a' };
  const WHEEL_COLORS = ['#e5484d', '#f76b15', '#ffc53d', '#46a758', '#12a594', '#3e63dd', '#8e4ec6', '#e93d82', '#2b2b30', '#f2efe6'];
  const INKC = '#1d1a24';

  const ease = t => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2), easeOut = t => 1 - Math.pow(1 - t, 3);
  const tween = (dur, fn, done, delay = 0) => tweens.push({ t0: clock + delay, dur, fn, done });
  const wait = ms => new Promise(r => tween(ms / 1000, () => {}, r));
  const M = (geo, mt, x = 0, y = 0, z = 0) => { const o = new T.Mesh(geo, mt); o.position.set(x, y, z); return o; };
  let gradTex; const toon = c => new T.MeshToonMaterial({ color: new T.Color(c).convertSRGBToLinear(), toneMapped: false, gradientMap: gradTex || (gradTex = (() => { const t = new T.DataTexture(new Uint8Array([90, 90, 90, 255, 200, 200, 200, 255, 255, 255, 255, 255]), 3, 1, T.RGBAFormat); t.minFilter = t.magFilter = T.NearestFilter; t.needsUpdate = true; return t; })()) });
  let INK; // contorno preto dos quadrinhos
  function canvasTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; t.anisotropy = 4; return t; }
  const glowTex = (() => { let t; return () => t || (t = canvasTex(64, 64, (c, w) => { const g = c.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.4, 'rgba(255,255,255,.4)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, w, w); })); })();
  const sprite = (color, size, additive = true) => { const s = new T.Sprite(new T.SpriteMaterial({ map: glowTex(), color, transparent: true, depthWrite: false, blending: additive ? T.AdditiveBlending : T.NormalBlending })); s.scale.setScalar(size); s.renderOrder = 8; return s; };
  // sprite "de papel" (sempre de frente para a câmera), ancorado pela base
  function card(tex, w, h, order = 2) { const s = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true, toneMapped: false, depthWrite: false })); s.scale.set(w, h, 1); s.center.set(.5, 0); s.renderOrder = order; return s; }
  function rrect(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  const EMOJI = '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';

  function supported() { if (!window.THREE) return false; try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; } }
  function mount(el, h) {
    handlers = h || {};
    if (mounted) { if (canvas.parentElement !== el) el.prepend(canvas); wrap = el; lastFit = ''; resize(); return true; }
    if (!supported()) return false;
    T = THREE; wrap = el;
    renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); renderer.outputEncoding = T.sRGBEncoding;
    canvas = renderer.domElement; canvas.className = 'vida3d'; el.prepend(canvas);
    scene = new T.Scene(); scene.background = new T.Color(0x3f7a3a);
    O = new T.Vector3(Math.sin(ISO_AZ) * Math.cos(ISO_EL), Math.sin(ISO_EL), Math.cos(ISO_AZ) * Math.cos(ISO_EL)).normalize();
    F = O.clone().negate(); RX = F.clone().cross(new T.Vector3(0, 1, 0)).normalize(); UY = RX.clone().cross(F).normalize();
    camera = new T.OrthographicCamera(-10, 10, 6, -6, .1, 300); camera.position.copy(O).multiplyScalar(60); camera.lookAt(0, 0, 0); raycaster = new T.Raycaster();
    scene.add(new T.HemisphereLight(0xffffff, 0x8a8a7a, .75));
    const sun = new T.DirectionalLight(0xfff1d6, .7); sun.position.set(-6, 20, 10); scene.add(sun);
    INK = new T.MeshBasicMaterial({ color: INKC });
    buildCity(); buildRoad(); buildLabels(); buildWheel();
    bindInput(); new ResizeObserver(resize).observe(el); resize();
    mounted = true; return true;
  }
  const scr = p => [p.dot(RX), p.dot(UY)]; // posição na tela (unidades do mundo)

  // ---------- a cidade isométrica pintada, de fundo ----------
  function buildCity() {
    const tex = new T.TextureLoader().load(IMG.vida_iso); tex.encoding = T.sRGBEncoding; tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const bg = M(new T.PlaneGeometry(VW, VH), new T.MeshBasicMaterial({ map: tex, toneMapped: false, depthWrite: false, depthTest: false }));
    bg.quaternion.copy(camera.quaternion); bg.position.copy(F).multiplyScalar(120); bg.renderOrder = -10; scene.add(bg);
  }

  // ---------- caminho: marcadores das casas ----------
  function segCurve(seg) { return new T.CatmullRomCurve3(VIDA_BOARD.route[seg].map(([x, z]) => new T.Vector3(x, 0, z)), false, 'centripetal'); }
  const ICON = { pay: '💵', vinganca: '😈', lifeins: '🛡️', stockbuy: '📈', bolsa: '📊', kid: '👶', prof: '🎓', event: '', start: '🚦', wedding: '💍', apartment: '🏢', toll: '🚧', sorte: '🍀', juizo: '⚖️', millionaire: '💰' };
  const LABEL = s => ({ pay: s.interest ? 'PAGAMENTO+JUROS' : 'PAGAMENTO', vinganca: 'VINGANÇA', lifeins: 'SEGURO', stockbuy: 'AÇÕES', bolsa: 'BOLSA', kid: s.n === 2 ? 'GÊMEOS!' : 'BEBÊ!',
    prof: VIDA_PROFS[s.prof]?.name.split(' ')[0].toUpperCase(), start: 'SAÍDA', wedding: 'CASAMENTO', apartment: 'APÊ', toll: 'PEDÁGIO', sorte: 'SORTE', juizo: 'JUÍZO', millionaire: 'MILIONÁRIO' })[s.type];
  const BIG = ['start', 'wedding', 'apartment', 'toll', 'juizo', 'millionaire', 'prof', 'sorte'];
  function buildRoad() {
    const S = VIDA_BOARD.spaces, segs = {};
    for (const s of S) (segs[s.seg] = segs[s.seg] || []).push(s.id);
    nodes[VIDA_BOARD.start] = { p: new T.Vector3(VIDA_BOARD.startPos[0], 0, VIDA_BOARD.startPos[1]), dir: new T.Vector3(1, 0, 0) };
    for (const [seg, ids] of Object.entries(segs)) {
      if (seg === 'start') continue;
      const curve = segCurve(seg), n = ids.length;
      ids.forEach((id, i) => { const t = n === 1 ? .5 : i / (n - 1); nodes[id] = { p: curve.getPointAt(t), dir: curve.getTangentAt(t).setY(0).normalize() }; });
    }
    for (const s of S) {
      const big = BIG.includes(s.type), col = COLORS[s.type] || '#ffffff', g = new T.Group(); g.position.copy(nodes[s.id].p);
      // a casinha no chão: disco colorido com contorno (vira elipse na isometria)
      const r = big ? .36 : .28;
      g.add(M(new T.CylinderGeometry(r + .05, r + .05, .03, 32), INK, 0, .015, 0), M(new T.CylinderGeometry(r, r, .05, 32), toon(col), 0, .03, 0));
      // o marcador em pé com o ícone (e o valor, nas casas de evento)
      const tex = canvasTex(160, 200, (c, w, h) => badge(c, w, h, s, col));
      const b = card(tex, big ? .5 : .4, big ? .62 : .5, 3); b.position.y = .05; g.add(b);
      g.userData.node = s.id; scene.add(g); nodes[s.id].tile = g; nodes[s.id].badge = b;
    }
  }
  function badge(c, w, h, s, col) {
    c.clearRect(0, 0, w, h); c.textAlign = 'center'; c.textBaseline = 'middle';
    const cx = w / 2, cy = 72, R = 58;
    // pino: círculo com rabinho apontando para a casa
    c.fillStyle = INKC; c.beginPath(); c.moveTo(cx - 22, cy + R - 10); c.lineTo(cx, h - 4); c.lineTo(cx + 22, cy + R - 10); c.fill();
    c.beginPath(); c.arc(cx, cy, R + 7, 0, Math.PI * 2); c.fill();
    c.fillStyle = col; c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(255,255,255,.35)'; c.beginPath(); c.ellipse(cx - 16, cy - 22, 26, 14, -.5, 0, Math.PI * 2); c.fill();
    if (s.type === 'event') {
      const txt = s.amt === 0 ? '—' : (s.amt > 0 ? '+' : '−') + Math.abs(s.amt / 1000) + 'k';
      c.font = `${s.ins ? 34 : 40}px ${EMOJI}`; c.fillText(s.ins ? { car: '🚗', house: '🏠', life: '❤️' }[s.ins] : s.amt > 0 ? '🤑' : s.amt < 0 ? '💸' : '😐', cx, cy - 14);
      c.font = '900 30px Nunito, Arial'; c.lineWidth = 6; c.strokeStyle = '#fff'; c.strokeText(txt, cx, cy + 26); c.fillStyle = s.amt > 0 ? '#178a35' : s.amt < 0 ? '#c8281e' : '#555'; c.fillText(txt, cx, cy + 26);
      return;
    }
    c.font = `56px ${EMOJI}`; c.fillText(ICON[s.type] || (s.type === 'prof' ? VIDA_PROFS[s.prof].icon : ''), cx, cy + 2);
  }
  // balões com o nome dos trechos e das paradas importantes
  function bubble(text, color = '#ffffff', fg = INKC) {
    const tex = canvasTex(512, 150, (c, w, h) => {
      c.font = '400 64px "Lilita One", Nunito, Arial'; const tw = Math.min(w - 40, c.measureText(text).width + 56), x = (w - tw) / 2;
      c.fillStyle = INKC; rrect(c, x - 6, 8, tw + 12, 100, 30); c.fill(); c.beginPath(); c.moveTo(w / 2 - 22, 100); c.lineTo(w / 2, 142); c.lineTo(w / 2 + 22, 100); c.fill();
      c.fillStyle = color; rrect(c, x, 14, tw, 88, 26); c.fill(); c.beginPath(); c.moveTo(w / 2 - 14, 98); c.lineTo(w / 2, 128); c.lineTo(w / 2 + 14, 98); c.fill();
      c.fillStyle = fg; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, w / 2, 60);
    });
    return card(tex, 1.9, .56, 4);
  }
  function buildLabels() {
    const SEG = VIDA_BOARD.segs, mid = ids => nodes[ids[Math.floor(ids.length / 2)]].p;
    const put = (text, at, lift, color, fg) => { const b = bubble(text, color, fg); b.position.copy(at).setY(lift); scene.add(b); };
    put('NEGÓCIOS', mid(SEG.neg), .9); put('FACULDADE', mid(SEG.fac), .9); put('VIDA LOUCA', mid(SEG.louca), .9, '#ffd6e0');
    put('VIDA TRANQUILA', mid(SEG.tranq), .9, '#dff6d6'); put('APOSENTADORIA', mid(SEG.fim), .9, '#fff2c0');
    const at = t => VIDA_BOARD.spaces.find(s => s.type === t).id;
    put('SAÍDA', nodes[VIDA_BOARD.start].p, 1.0, '#ffcf4a'); put('CASAMENTO', nodes[at('wedding')].p, 1.0, '#ff8fb0'); put('PEDÁGIO', nodes[at('toll')].p, 1.0, '#ffb04a');
    put('DIA DO JUÍZO', nodes[at('juizo')].p, 1.0, '#5a4a7a', '#ffffff'); put('MILIONÁRIO', nodes[at('millionaire')].p, 1.0, '#ffd23a'); put('APARTAMENTO', nodes[at('apartment')].p, 1.0, '#e8a25a');
  }

  // ---------- roleta (na praça) ----------
  function buildWheel() {
    const g = new T.Group(); g.position.set(5.6, 0, -2.7);
    g.add(M(new T.CylinderGeometry(1.42, 1.5, .2, 48), INK, 0, .1, 0), M(new T.CylinderGeometry(1.34, 1.34, .22, 48), toon('#ffcf4a'), 0, .11, 0));
    const tex = canvasTex(512, 512, (c, w) => {
      const cx = w / 2, R = w / 2 - 6;
      c.fillStyle = INKC; c.beginPath(); c.arc(cx, cx, R + 4, 0, Math.PI * 2); c.fill();
      for (let i = 0; i < 10; i++) { const a0 = (i / 10) * Math.PI * 2 - Math.PI / 2, a1 = ((i + 1) / 10) * Math.PI * 2 - Math.PI / 2; c.fillStyle = WHEEL_COLORS[i]; c.beginPath(); c.moveTo(cx, cx); c.arc(cx, cx, R, a0, a1); c.closePath(); c.fill(); c.strokeStyle = INKC; c.lineWidth = 6; c.stroke();
        const am = (a0 + a1) / 2; c.save(); c.translate(cx + Math.cos(am) * R * .7, cx + Math.sin(am) * R * .7); c.rotate(am + Math.PI / 2); c.font = '900 70px Nunito, Arial'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineWidth = 8; c.strokeStyle = INKC; c.strokeText(String(i + 1), 0, 0); c.fillStyle = i === 9 || i === 2 ? '#1b1b1b' : '#ffffff'; if (i === 9 || i === 2) { c.strokeStyle = '#fff'; c.lineWidth = 0; } c.fillText(String(i + 1), 0, 0); c.restore(); }
      c.fillStyle = INKC; c.beginPath(); c.arc(cx, cx, 56, 0, Math.PI * 2); c.fill(); c.fillStyle = '#ffd23a'; c.beginPath(); c.arc(cx, cx, 48, 0, Math.PI * 2); c.fill(); c.font = `42px ${EMOJI}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('🎡', cx, cx + 2);
    });
    wheel = M(new T.CylinderGeometry(1.25, 1.25, .08, 64), [toon('#ffffff'), new T.MeshBasicMaterial({ map: tex, toneMapped: false }), toon('#ffffff')], 0, .26, 0);
    g.add(wheel);
    const ptr = new T.Shape(); ptr.moveTo(-.14, 0); ptr.lineTo(.14, 0); ptr.lineTo(0, -.36); ptr.closePath();
    const pointer = M(new T.ExtrudeGeometry(ptr, { depth: .08, bevelEnabled: true, bevelThickness: .025, bevelSize: .025, bevelSegments: 2 }), toon('#e5484d'), 0, .36, -1.16); pointer.rotation.x = -Math.PI / 2; g.add(pointer);
    scene.add(g); wheel.userData.group = g;
  }
  // gira a roleta até parar no número (o ponteiro fica em -z)
  function spinWheel(n, fast) {
    const seg = Math.PI * 2 / 10, target = -((n - .5) * seg) + Math.PI;
    const cur = wheel.rotation.y, base = cur - (cur % (Math.PI * 2));
    let to = base - Math.PI * 2 * (fast ? 2 : 4) + ((target % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) - Math.PI * 2;
    if (to > cur - Math.PI * 2) to -= Math.PI * 2;
    const from = cur; SFX.shake?.();
    return new Promise(r => tween(fast ? .9 : 2.2, k => { wheel.rotation.y = from + (to - from) * easeOut(k); }, () => { SFX.bounce?.(); r(); }));
  }

  // ---------- personagens em pé (a caricatura de cada amigo num corpinho de papelão) ----------
  function drawStandee(g) {
    const { tex, im, color, info } = g.userData, c = tex.image.getContext('2d'), W = 256, H = 360;
    c.clearRect(0, 0, W, H);
    const gray = info.out;
    // corpo
    c.fillStyle = INKC; rrect(c, 46, 186, 164, 168, 60); c.fill();
    c.fillStyle = gray ? '#8a8a8a' : color; rrect(c, 56, 196, 144, 150, 52); c.fill();
    c.fillStyle = 'rgba(255,255,255,.28)'; rrect(c, 70, 206, 40, 110, 20); c.fill();
    // cabeça: a caricatura num círculo
    c.fillStyle = INKC; c.beginPath(); c.arc(128, 112, 108, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#ffffff'; c.beginPath(); c.arc(128, 112, 99, 0, Math.PI * 2); c.fill();
    c.save(); c.beginPath(); c.arc(128, 112, 91, 0, Math.PI * 2); c.fillStyle = gray ? '#999' : color; c.fill(); c.clip();
    if (im.complete && im.naturalWidth) { if (gray) c.filter = 'grayscale(1)'; c.drawImage(im, 128 - 98, 112 - 96, 196, 220); c.filter = 'none'; }
    c.restore();
    // cônjuge e filhos: fichinhas no peito
    const chips = [...(info.married ? ['💍'] : []), ...Array(Math.min(4, info.kids || 0)).fill('👶')];
    chips.forEach((e, i) => { const x = 128 + (i - (chips.length - 1) / 2) * 38, y = 292; c.fillStyle = INKC; c.beginPath(); c.arc(x, y, 19, 0, Math.PI * 2); c.fill(); c.fillStyle = '#fff'; c.beginPath(); c.arc(x, y, 15, 0, Math.PI * 2); c.fill(); c.font = `20px ${EMOJI}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(e, x, y + 1); });
    tex.needsUpdate = true;
  }
  function makeCar(color, img) {
    const g = new T.Group(), body = new T.Group(); g.add(body);
    const tex = canvasTex(256, 360, () => {}), im = new Image();
    Object.assign(g.userData, { tex, im, color, info: {} });
    im.onload = () => drawStandee(g); drawStandee(g); if (img) im.src = img;
    const fig = card(tex, .78, 1.1, 6); body.add(fig);
    const shadow = M(new T.CircleGeometry(.36, 28), new T.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: .35, depthWrite: false })); shadow.rotation.x = -Math.PI / 2; shadow.position.y = .07; shadow.renderOrder = 5; g.add(shadow);
    const ring = M(new T.TorusGeometry(.38, .04, 8, 48), new T.MeshBasicMaterial({ color: 0xffd23a, toneMapped: false })), arrow = card(canvasTex(96, 96, (c, w) => { c.fillStyle = INKC; c.beginPath(); c.moveTo(8, 14); c.lineTo(88, 14); c.lineTo(48, 88); c.fill(); c.fillStyle = '#ffd23a'; c.beginPath(); c.moveTo(22, 22); c.lineTo(74, 22); c.lineTo(48, 72); c.fill(); }), .3, .3, 7);
    ring.rotation.x = Math.PI / 2; ring.position.y = .08; ring.visible = false; g.add(ring); arrow.position.y = 1.25; arrow.visible = false; body.add(arrow);
    Object.assign(g.userData, { ring, arrow, body, fig, shadow, face: fig });
    return g;
  }
  function setPegs(g, p) {
    const out = p.status === 'bankrupt', key = (p.married ? 1 : 0) + ':' + Math.min(4, p.kids) + ':' + out; if (g.userData.pegKey === key) return; const was = g.userData.pegKey; g.userData.pegKey = key;
    g.userData.info = { married: p.married, kids: p.kids, out }; drawStandee(g);
    if (was && !out) { const p0 = g.position.clone().setY(.8); for (let i = 0; i < 14; i++) burst(p0, 0xffd6e8, .14, 1.4, .8); }
  }
  // posição na casa: um pouco à frente (para ficar na frente do marcador); vários na mesma casa ficam lado a lado
  function spotFor(pid, node) {
    const same = view.players.filter(p => p.pos === node && p.status !== 'bankrupt'), k = same.findIndex(p => p.id === pid), n = nodes[node];
    return n.p.clone().addScaledVector(RX, same.length > 1 ? (k - (same.length - 1) / 2) * .42 : 0).addScaledVector(O, .35).setY(0);
  }

  // ---------- sincronização ----------
  let locked = new Set();
  function sync(v) {
    if (!mounted) return; view = v; fitCam();
    for (const p of v.players) {
      const r = handlers.info?.(p.id) || {};
      let g = cars[p.id];
      if (!g || g.userData.key !== r.color + r.img) { if (g) scene.remove(g); g = makeCar(r.color || '#e5484d', r.img); g.userData.key = r.color + r.img; scene.add(g); cars[p.id] = g; g.position.copy(spotFor(p.id, p.pos)); }
      setPegs(g, p);
      const mine = v.players[v.turn]?.id === p.id && !v.result; g.userData.ring.visible = g.userData.arrow.visible = mine;
      g.visible = p.status !== 'bankrupt' || locked.has(p.id);
      if (!locked.has(p.id) && !busy) { const to = spotFor(p.id, p.pos); if (g.position.distanceTo(to) > .02) { const a = g.position.clone(); tween(.3, k => g.position.lerpVectors(a, to, ease(k))); } }
    }
  }

  // ---------- animações de eventos ----------
  function play(e) { queue.push(e); if (queue.length > 14) queue.splice(0, queue.length - 14); pump(); }
  async function pump() {
    if (busy) return; busy = true;
    while (queue.length) { const e = queue.shift(), fast = queue.length > 4 || document.hidden; try { await run(e, fast); } catch (err) { console.warn(err); } }
    busy = false; if (view) sync(view);
  }
  const head = g => g.position.clone().setY(1.15);
  async function run(e, fast) {
    const g = cars[e.pid];
    switch (e.type) {
      case 'spin': handlers.spinStart?.(e); await spinWheel(e.value, fast); handlers.spinEnd?.(e); return;
      case 'walk': case 'back': {
        if (!g) return; locked.add(e.pid);
        const { body, shadow } = g.userData;
        for (const id of e.path) {
          const to = nodes[id].p.clone().addScaledVector(O, .35).setY(0), a = g.position.clone();
          await new Promise(r => tween(fast ? .12 : .26, k => { const h = Math.sin(Math.PI * k); g.position.lerpVectors(a, to, k); body.position.y = h * .45; body.scale.set(1 - h * .06, 1 + h * .08, 1); shadow.scale.setScalar(1 - h * .35); },
            () => { body.position.y = 0; body.scale.set(1, 1, 1); shadow.scale.setScalar(1); r(); }));
          if (!fast) SFX.step?.(1); puffDust(to);
        }
        locked.delete(e.pid); return;
      }
      case 'payday': if (g) { for (let i = 0; i < 10; i++) burst(head(g), 0x7cff8a, .16, 2, .8); SFX.coinUp?.(); } return;
      case 'money': if (g) floatText(g.position, (e.amount > 0 ? '+' : '−') + Vida.money(Math.abs(e.amount)), e.amount > 0 ? '#2fbf5a' : '#e5484d'); return;
      case 'kid': if (g) { for (let i = 0; i < 20; i++) burst(head(g), 0xff9ac8, .18, 2.2, 1); SFX.magic?.(); } return;
      case 'wedding': if (g) { for (let i = 0; i < 40; i++) burst(head(g), i % 2 ? 0xff7fb4 : 0xffffff, .16, 3, 1.4); SFX.win?.(); } await wait(fast ? 200 : 700); return;
      case 'vinganca': { const t = cars[e.target]; if (t) { flashAt(t.position, 0xff2020); for (let i = 0; i < 20; i++) burst(head(t), 0xff4020, .18, 2.6, .8); cam.shake = .25; SFX.explosion?.(); } await wait(fast ? 150 : 500); return; }
      case 'sorte': case 'jackpot': if (g) { for (let i = 0; i < (e.type === 'jackpot' ? 60 : 24); i++) burst(head(g), 0x6aff9a, .18, 3, 1.2); SFX.coinShower?.(); } return;
      case 'bolsa': if (g) { const up = e.value >= 7, down = e.value <= 3; floatText(g.position, up ? '📈 ALTA' : down ? '📉 BAIXA' : '📊 ESTÁVEL', up ? '#2fbf5a' : down ? '#e5484d' : '#888'); } return;
      case 'juizo': if (g) { flashAt(g.position, 0xb090ff); SFX.gavel?.(); cam.shake = .15; } return;
      case 'millionaire': case 'win': if (g) { for (let w = 0; w < (e.type === 'win' ? 8 : 4); w++) { const at = g.position.clone().setY(1.4 + Math.random()); for (let i = 0; i < 30; i++) burst(at, [0xffd23a, 0xff6a9a, 0x6ac0ff][i % 3], .18, 3.5, 1.3); SFX.coinPing?.(w); await wait(220); } } return;
      case 'bankrupt': if (g) { for (let i = 0; i < 30; i++) burst(head(g), 0x555555, .3, 1.5, 1.6, false); SFX.bankrupt?.(); cam.shake = .3; } return;
      case 'toll': SFX.coinDown?.(); return;
      case 'insured': if (g) { const s = sprite(0x6ac0ff, 1.6); s.position.copy(g.position).setY(.5); scene.add(s); tween(.8, k => { s.material.opacity = 1 - k; s.scale.setScalar(1.6 + k); }, () => scene.remove(s)); SFX.shieldUp?.(); } return;
      case 'apartment': case 'prof': case 'buy': if (g) { for (let i = 0; i < 14; i++) burst(head(g), 0xffe08a, .14, 2, .8); } return;
    }
  }
  // efeitos (o "para cima" da tela é quase o +y do mundo nesta câmera)
  function burst(at, color, size, speed, life, additive = true) {
    const s = sprite(color, size, additive); s.position.copy(at); scene.add(s);
    const v = new T.Vector3(Math.random() - .5, Math.random() * .8 + .5, Math.random() - .5).normalize().multiplyScalar(speed * (.4 + Math.random() * .6));
    tween(life * (.6 + Math.random() * .5), k => { s.position.addScaledVector(v, .016); v.y -= .06; s.material.opacity = 1 - k; }, () => { scene.remove(s); s.material.dispose(); });
  }
  function puffDust(at) { for (let i = 0; i < 3; i++) burst(at.clone().setY(.1), 0xe8dcc4, .25, .6, .5, false); }
  function flashAt(at, color) { const s = sprite(color, 3); s.position.copy(at).setY(.6); scene.add(s); tween(.6, k => { s.material.opacity = 1 - k; s.scale.setScalar(3 + k * 3); }, () => scene.remove(s)); }
  function floatText(at, text, color) {
    const tex = canvasTex(256, 64, (c, w, h) => { c.font = '900 40px Nunito, Arial'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineWidth = 9; c.strokeStyle = INKC; c.strokeText(text, w / 2, h / 2); c.fillStyle = color; c.fillText(text, w / 2, h / 2); });
    const s = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false, toneMapped: false })); s.scale.set(1.6, .4, 1); s.position.copy(at).setY(1.15); s.renderOrder = 10; scene.add(s);
    tween(1.4, k => { s.position.y = 1.15 + k * .8; s.material.opacity = k < .7 ? 1 : 1 - (k - .7) / .3; }, () => { scene.remove(s); tex.dispose(); });
  }

  // ---------- entrada e câmera ----------
  let hoverNode = null;
  function pick(e) {
    const r = canvas.getBoundingClientRect(); raycaster.setFromCamera(new T.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
    const hit = raycaster.intersectObjects(nodes.filter(Boolean).map(n => n.tile), true)[0]; let o = hit?.object; while (o && o.userData.node == null) o = o.parent; return o ? o.userData.node : null;
  }
  function bindInput() {
    canvas.addEventListener('pointermove', e => { const n = pick(e); if (n !== hoverNode) { hoverNode = n; handlers.hover?.(n, e); } else if (n != null) handlers.hover?.(n, e); canvas.style.cursor = n != null ? 'help' : 'default'; });
    canvas.addEventListener('pointerleave', () => { hoverNode = null; handlers.hover?.(null); });
  }
  function resize() {
    if (!renderer || !wrap) return; const w = wrap.clientWidth, h = wrap.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false); canvas.style.width = w + 'px'; canvas.style.height = h + 'px'; lastFit = ''; fitCam();
  }
  // enquadra o caminho inteiro abaixo do placar e acima dos botões, sem sair da ilustração quando der
  let lastFit = '', bounds = null;
  function fitCam() {
    if (!wrap) return; const w = wrap.clientWidth, h = wrap.clientHeight; if (!w || !h) return;
    const R = wrap.getBoundingClientRect(), hud = wrap.querySelector('.war-top');
    const top = Math.max(56, Math.min(h * .3, hud ? hud.getBoundingClientRect().bottom - R.top + 4 : 96)), bot = Math.min(84, h * .14);
    const key = [w, h, Math.round(top)].join(); if (key === lastFit) return; lastFit = key;
    if (!bounds) { bounds = [1e9, -1e9, 1e9, -1e9]; for (const n of nodes) if (n) { const [x, y] = scr(n.p); bounds = [Math.min(bounds[0], x), Math.max(bounds[1], x), Math.min(bounds[2], y), Math.max(bounds[3], y)]; } }
    const [x0, x1, y0, y1] = [bounds[0] - .6, bounds[1] + .6, bounds[2] - .4, bounds[3] + 1.1];
    const avail = Math.max(120, h - top - bot), u = Math.max((x1 - x0) / w, (y1 - y0) / avail); // mundo por pixel
    let cx = (x0 + x1) / 2, ytop = (y0 + y1) / 2 + (top + avail / 2) * u;
    const vw = w * u, vh = h * u;
    if (vw <= VW) cx = Math.max(-VW / 2 + vw / 2, Math.min(VW / 2 - vw / 2, cx));
    if (vh <= VH) ytop = Math.max(-VH / 2 + vh, Math.min(VH / 2, ytop));
    Object.assign(camera, { left: cx - vw / 2, right: cx + vw / 2, top: ytop, bottom: ytop - vh }); camera.updateProjectionMatrix();
  }
  function screenPos(node) { const n = nodes[node]; if (!n) return null; const v = n.p.clone().setY(.5).project(camera), r = canvas.getBoundingClientRect(); return { x: (v.x + 1) / 2 * r.width, y: (1 - v.y) / 2 * r.height }; }

  // ---------- laço ----------
  function loop(t) { raf = requestAnimationFrame(loop); const dt = Math.min(.05, (t - (lastT || t)) / 1000); lastT = t; frame(dt); }
  function advance(ms) { for (let k = 0; k < ms / 16; k++) frame(.016); }
  function frame(dt) {
    clock += dt;
    for (let i = tweens.length - 1; i >= 0; i--) { const tw = tweens[i]; if (clock < tw.t0) continue; const k = Math.min(1, (clock - tw.t0) / tw.dur); tw.fn(k); if (k >= 1) { tweens.splice(i, 1); tw.done?.(); } }
    for (const f of tickers) f(clock, dt);
    camera.position.copy(O).multiplyScalar(60);
    if (cam.shake > .001) { camera.position.addScaledVector(RX, (Math.random() - .5) * cam.shake).addScaledVector(UY, (Math.random() - .5) * cam.shake); cam.shake *= Math.exp(-dt * 7); }
    const s = clock;
    for (const g of Object.values(cars)) if (g.userData.ring.visible) { g.userData.ring.rotation.z = s; g.userData.arrow.position.y = 1.25 + Math.abs(Math.sin(s * 3.2)) * .14; }
    renderer.render(scene, camera);
  }
  function show(on) { active = !!on && mounted; if (!mounted) return; canvas.style.display = active ? '' : 'none'; cancelAnimationFrame(raf); lastT = 0; if (active) { resize(); raf = requestAnimationFrame(loop); } }
  function reset() { for (const g of Object.values(cars)) scene?.remove(g); for (const k of Object.keys(cars)) delete cars[k]; queue = []; locked.clear(); }

  return { supported, mount, show, sync, play, reset, screenPos, advance, get active() { return active; }, get busy() { return busy; }, dbg: () => ({ scene, camera, renderer, nodes, cars }) };
})();
