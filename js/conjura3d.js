// ===== Conjura em 3D (Three.js): mesa, velas, cartas, moedas e animações especiais de cada personagem =====
const Conjura3D = (() => {
  let camDist = 1, T = null, renderer, scene, camera, wrap, canvas, raf = 0, mounted = false, active = false;
  let seats = [], cardsOf = {}, stacksOf = {}, deckGroup, treasury, candles = [], tickers = new Set(), shake = 0;
  let queue = Promise.resolve(), texCache = {}, lastView = null;
  const ROLE_COLOR = { tesoureiro: 0xb67cff, sicario: 0xff3b2f, corsario: 0xff7a2a, diplomata: 0x46d17d, guarda: 0x4f8dff, confessor: 0xd2304f };
  // com eventos acumulados na fila, as animações aceleram para alcançar o jogo
  let pending = 0;
  const spd = () => Math.min(4, 1 + Math.max(0, pending - 1) * .8);
  const wait = ms => new Promise(r => setTimeout(r, ms / spd()));
  const rand = (a, b) => a + Math.random() * (b - a);
  const ease = t => (t < .5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
  const easeOut = t => 1 - (1 - t) ** 3;
  const backOut = t => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2;

  // animação dentro do ciclo de renderização (termina mesmo com a aba congelada)
  function tween(ms, fn) {
    ms /= spd();
    return new Promise(res => {
      let t0 = null, fin = false;
      const done = () => { if (fin) return; fin = true; tickers.delete(tk); try { fn(1); } catch (e) { console.warn(e); } res(); };
      const tk = now => { if (t0 === null) t0 = now; const k = Math.min(1, (now - t0) / ms); fn(k); if (k >= 1) done(); };
      tickers.add(tk); setTimeout(done, ms + 400); if (!active) done();
    });
  }

  // ---------- texturas ----------
  const loadImg = src => new Promise(r => { if (!src) return r(null); const i = new Image(); i.onload = () => r(i); i.onerror = () => r(null); i.src = src; });
  function canvasTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; t.anisotropy = 8; return t; }
  function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  const hex = n => '#' + n.toString(16).padStart(6, '0');
  function cardTexture(role) { // role null = verso (o Rei)
    const key = role || 'back'; if (texCache[key]) return texCache[key];
    const tex = canvasTex(512, 716, () => { });
    texCache[key] = tex;
    loadImg(IMG['conj_' + (role || 'rei')]).then(img => {
      const ctx = tex.image.getContext('2d'), W = 512, H = 716;
      ctx.fillStyle = '#2a170b'; rr(ctx, 0, 0, W, H, 34); ctx.fill();
      ctx.save(); rr(ctx, 14, 14, W - 28, H - 28, 26); ctx.clip();
      if (img) { const s = Math.max((W - 28) / img.width, (H - 28) / img.height); ctx.drawImage(img, 14 + (W - 28 - img.width * s) / 2, 14, img.width * s, img.height * s); }
      if (!role) { ctx.fillStyle = 'rgba(40,15,5,.35)'; ctx.fillRect(0, 0, W, H); }
      ctx.restore();
      ctx.strokeStyle = '#d4a548'; ctx.lineWidth = 10; rr(ctx, 14, 14, W - 28, H - 28, 26); ctx.stroke();
      ctx.strokeStyle = '#f5d98a'; ctx.lineWidth = 3; rr(ctx, 26, 26, W - 52, H - 52, 20); ctx.stroke();
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      if (role) {
        const R = Conjura.ROLES[role];
        ctx.fillStyle = hex(ROLE_COLOR[role]); rr(ctx, 40, H - 150, W - 80, 64, 14); ctx.fill();
        ctx.strokeStyle = '#2a170b'; ctx.lineWidth = 5; ctx.stroke();
        ctx.font = '400 44px "Lilita One"'; ctx.fillStyle = '#fff'; ctx.shadowColor = '#000'; ctx.shadowBlur = 6; ctx.fillText(R.name.toUpperCase(), W / 2, H - 116); ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(251,243,223,.93)'; rr(ctx, 40, H - 80, W - 80, 50, 12); ctx.fill();
        ctx.font = '800 21px Nunito'; ctx.fillStyle = '#3a2614';
        ctx.fillText((R.act !== '—' ? R.act : R.block).slice(0, 44), W / 2, H - 55);
      } else {
        ctx.font = '400 62px "Lilita One"'; ctx.fillStyle = '#f3b733'; ctx.shadowColor = '#000'; ctx.shadowBlur = 14;
        ctx.fillText('CONJURA', W / 2, H - 90); ctx.shadowBlur = 0;
      }
      tex.needsUpdate = true;
    });
    return tex;
  }
  function glowTex() { if (texCache.glow) return texCache.glow; return (texCache.glow = canvasTex(128, 128, (c, w) => { const g = c.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.25, 'rgba(255,255,255,.6)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, w, w); })); }

  // ---------- modelos ----------
  const mat = (color, o = {}) => new T.MeshStandardMaterial({ color, roughness: .5, metalness: .1, ...o });
  const CARD_W = .9, CARD_H = 1.26;
  function cardModel(role) { // frente (role) em -Y, verso em +Y; deitada na mesa mostra o verso
    const edge = mat(0xd4a548, { metalness: .6, roughness: .3 });
    const g = new T.Mesh(new T.BoxGeometry(CARD_W, .025, CARD_H), [edge, edge,
      new T.MeshStandardMaterial({ map: cardTexture(null), roughness: .45 }), new T.MeshStandardMaterial({ map: cardTexture(role), roughness: .45 }), edge, edge]);
    g.castShadow = true; g.receiveShadow = true; g.userData.role = role;
    return g;
  }
  function setCardFront(mesh, role) { if (mesh.userData.role === role) return; mesh.material[3].map = cardTexture(role); mesh.material[3].needsUpdate = true; mesh.userData.role = role; }
  const coinGeo = () => texCache.coinGeo || (texCache.coinGeo = new T.CylinderGeometry(.17, .17, .045, 28));
  function coinMat() {
    if (texCache.coinMat) return texCache.coinMat;
    const face = canvasTex(128, 128, (c, w) => { c.fillStyle = '#e8b931'; c.beginPath(); c.arc(64, 64, 64, 0, 7); c.fill(); c.strokeStyle = '#a77a10'; c.lineWidth = 8; c.beginPath(); c.arc(64, 64, 52, 0, 7); c.stroke(); c.fillStyle = '#a77a10'; c.font = '700 60px serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('♛', 64, 68); });
    const side = mat(0xd9a521, { metalness: .85, roughness: .28 }), top = new T.MeshStandardMaterial({ map: face, metalness: .8, roughness: .3 });
    return (texCache.coinMat = [side, top, top]);
  }
  function coinModel() { const m = new T.Mesh(coinGeo(), coinMat()); m.castShadow = true; return m; }
  function daggerModel(len = 1.1, color = 0xd8dde6) {
    const g = new T.Group();
    const s = new T.Shape(); s.moveTo(0, 0); s.lineTo(.07, .08); s.lineTo(.05, len); s.lineTo(0, len + .18); s.lineTo(-.05, len); s.lineTo(-.07, .08); s.closePath();
    const blade = new T.Mesh(new T.ExtrudeGeometry(s, { depth: .02, bevelEnabled: true, bevelSize: .012, bevelThickness: .01, bevelSegments: 1 }), mat(color, { metalness: .95, roughness: .15 }));
    blade.position.z = -.01;
    const guard = new T.Mesh(new T.BoxGeometry(.34, .05, .06), mat(0xd4a548, { metalness: .8, roughness: .3 }));
    const grip = new T.Mesh(new T.CylinderGeometry(.03, .035, .28, 10), mat(0x3a2614)); grip.position.y = -.16;
    const pommel = new T.Mesh(new T.SphereGeometry(.05, 12, 10), guard.material); pommel.position.y = -.32;
    g.add(blade, guard, grip, pommel); g.traverse(m => m.isMesh && (m.castShadow = true));
    return g;
  }
  function shieldModel() {
    const tex = canvasTex(256, 256, (c, w) => {
      const g = c.createRadialGradient(w / 2, w / 2, 10, w / 2, w / 2, w / 2); g.addColorStop(0, '#3d74d6'); g.addColorStop(1, '#16336e'); c.fillStyle = g; c.fillRect(0, 0, w, w);
      c.fillStyle = '#f3c449'; c.font = '700 150px serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('♛', w / 2, w / 2 + 10);
    });
    const g = new T.Group();
    const face = new T.Mesh(new T.CylinderGeometry(.85, .85, .1, 40), [mat(0x8a99ad, { metalness: .9, roughness: .25 }), new T.MeshStandardMaterial({ map: tex, metalness: .4, roughness: .4 }), mat(0x555555)]);
    face.rotation.x = Math.PI / 2;
    const rim = new T.Mesh(new T.TorusGeometry(.86, .07, 10, 40), mat(0xd4a548, { metalness: .9, roughness: .2 }));
    g.add(face, rim); return g;
  }
  function eyeSprite() {
    const tex = canvasTex(256, 256, (c, w) => {
      const g = c.createRadialGradient(w / 2, w / 2, 4, w / 2, w / 2, w / 2); g.addColorStop(0, 'rgba(255,230,180,1)'); g.addColorStop(.3, 'rgba(210,48,79,.8)'); g.addColorStop(1, 'rgba(60,0,20,0)'); c.fillStyle = g; c.fillRect(0, 0, w, w);
      c.strokeStyle = '#fff3d6'; c.lineWidth = 8; c.beginPath(); c.moveTo(30, 128); c.quadraticCurveTo(128, 40, 226, 128); c.quadraticCurveTo(128, 216, 30, 128); c.stroke();
      c.fillStyle = '#1a0408'; c.beginPath(); c.arc(128, 128, 34, 0, 7); c.fill(); c.fillStyle = '#ffd36b'; c.beginPath(); c.arc(128, 128, 12, 0, 7); c.fill();
    });
    const s = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: T.AdditiveBlending })); return s;
  }
  function candleModel() {
    const g = new T.Group();
    const wax = new T.Mesh(new T.CylinderGeometry(.11, .12, .55, 16), mat(0xf3e6c4, { roughness: .8 })); wax.position.y = .275; wax.castShadow = true;
    const holder = new T.Mesh(new T.CylinderGeometry(.22, .26, .06, 20), mat(0xa77a10, { metalness: .8, roughness: .3 })); holder.position.y = .03;
    const flame = new T.Sprite(new T.SpriteMaterial({ map: glowTex(), color: 0xffb347, transparent: true, depthWrite: false, blending: T.AdditiveBlending })); flame.scale.set(.32, .5, 1); flame.position.y = .7;
    const light = new T.PointLight(0xff9a3c, 1.1, 9, 1.8); light.position.y = .85;
    g.add(wax, holder, flame, light); g.userData = { flame, light, seed: Math.random() * 10 };
    return g;
  }

  // ---------- partículas ----------
  function burst(pos, color, { n = 60, speed = 3, life = 900, size = .18, up = 1.5, gravity = -4 } = {}) {
    const geo = new T.BufferGeometry(), p = new Float32Array(n * 3), v = [];
    for (let i = 0; i < n; i++) { p.set([pos.x, pos.y, pos.z], i * 3); const a = Math.random() * Math.PI * 2, b = Math.random() * Math.PI - Math.PI / 2; v.push([Math.cos(a) * Math.cos(b) * speed * rand(.3, 1), Math.abs(Math.sin(b)) * speed * up * rand(.3, 1), Math.sin(a) * Math.cos(b) * speed * rand(.3, 1)]); }
    geo.setAttribute('position', new T.BufferAttribute(p, 3));
    const m = new T.PointsMaterial({ color, size, map: glowTex(), transparent: true, depthWrite: false, blending: T.AdditiveBlending });
    const pts = new T.Points(geo, m); scene.add(pts);
    let last = 0;
    return tween(life, k => {
      const dt = (k - last) * life / 1000; last = k;
      for (let i = 0; i < n; i++) { v[i][1] += gravity * dt; p[i * 3] += v[i][0] * dt; p[i * 3 + 1] += v[i][1] * dt; p[i * 3 + 2] += v[i][2] * dt; }
      geo.attributes.position.needsUpdate = true; m.opacity = 1 - k;
      if (k >= 1) { scene.remove(pts); geo.dispose(); m.dispose(); }
    });
  }
  function glowSprite(color, scale = 3) { const s = new T.Sprite(new T.SpriteMaterial({ map: glowTex(), color, transparent: true, depthWrite: false, blending: T.AdditiveBlending })); s.scale.set(scale, scale, 1); return s; }
  function flashLight(pos, color, power = 4, ms = 600) {
    const l = new T.PointLight(color, power, 12, 1.5); l.position.copy(pos); scene.add(l);
    return tween(ms, k => { l.intensity = power * (1 - k); if (k >= 1) scene.remove(l); });
  }

  // ---------- montagem ----------
  function mount(container) {
    if (!window.THREE) return false;
    T = window.THREE; wrap = container;
    if (mounted) { if (canvas.parentNode !== wrap) wrap.prepend(canvas); resize(); return true; }
    try { renderer = new T.WebGLRenderer({ antialias: true, alpha: true }); } catch { return false; }
    renderer.setPixelRatio(Math.min(1.5, devicePixelRatio || 1)); renderer.outputEncoding = T.sRGBEncoding;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
    canvas = renderer.domElement; canvas.className = 'cj3d'; wrap.prepend(canvas);
    scene = new T.Scene(); scene.fog = new T.Fog(0x120a05, 14, 30);
    camera = new T.PerspectiveCamera(38, 1, .1, 100); camera.position.set(0, 9.2, 8.6); camera.lookAt(0, 0, .7);
    scene.add(new T.HemisphereLight(0xffe2b8, 0x1a0e06, .45));
    const key = new T.DirectionalLight(0xffe6c2, .55); key.position.set(2, 12, 6); key.castShadow = true;
    Object.assign(key.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8 }); key.shadow.mapSize.set(1024, 1024); scene.add(key);
    // mesa: tampo de feltro, borda de madeira, pé
    const felt = canvasTex(512, 512, (c, w) => { const g = c.createRadialGradient(w / 2, w / 2, 20, w / 2, w / 2, w / 2); g.addColorStop(0, '#2f7149'); g.addColorStop(1, '#173d27'); c.fillStyle = g; c.fillRect(0, 0, w, w); for (let i = 0; i < 4000; i++) { c.fillStyle = `rgba(0,0,0,${Math.random() * .08})`; c.fillRect(Math.random() * w, Math.random() * w, 2, 2); } c.strokeStyle = 'rgba(212,165,72,.35)'; c.lineWidth = 4; c.beginPath(); c.ellipse(w / 2, w / 2, w * .42, w * .42, 0, 0, 7); c.stroke(); });
    const top = new T.Mesh(new T.CylinderGeometry(1, 1, .2, 72), [mat(0x4a2b16), new T.MeshStandardMaterial({ map: felt, roughness: .95 }), mat(0x2a170b)]);
    top.scale.set(6.2, 1, 3.9); top.position.y = -.1; top.receiveShadow = true; scene.add(top);
    const wood = new T.TextureLoader().load(IMG.bg_wood); wood.encoding = T.sRGBEncoding;
    const rim = new T.Mesh(new T.TorusGeometry(1, .07, 16, 96), new T.MeshStandardMaterial({ map: wood, color: 0x8a5a33, roughness: .55, metalness: .1 }));
    rim.rotation.x = Math.PI / 2; rim.scale.set(6.3, 3.98, 2.4); rim.position.y = .02; rim.castShadow = true; scene.add(rim);
    const floor = new T.Mesh(new T.PlaneGeometry(60, 60), new T.MeshStandardMaterial({ map: wood, color: 0x3b2414, roughness: .9 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -2.2; floor.receiveShadow = true; scene.add(floor);
    // velas nos cantos da mesa
    for (const [x, z] of [[-5.1, -2.2], [5.1, -2.2], [-5.4, 1.2], [5.4, 1.2]]) { const c = candleModel(); c.position.set(x, 0, z); scene.add(c); candles.push(c); }
    // baralho da Corte e Tesouro
    deckGroup = new T.Group(); deckGroup.position.set(-1.3, 0, -.4); scene.add(deckGroup);
    treasury = new T.Group(); treasury.position.set(1.3, 0, -.4); scene.add(treasury);
    for (let i = 0; i < 26; i++) { const c = coinModel(); const a = Math.random() * 7, r = Math.random() * .55; c.position.set(Math.cos(a) * r, .03 + (i % 5) * .046, Math.sin(a) * r * .8); c.rotation.set(rand(-.15, .15), Math.random() * 7, rand(-.15, .15)); treasury.add(c); }
    new ResizeObserver(resize).observe(wrap); resize();
    mounted = true; return true;
  }
  function resize() {
    if (!renderer || !wrap) return;
    const w = wrap.clientWidth, h = wrap.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false); canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
    camera.aspect = w / h; camera.fov = w / h < 1.2 ? 50 : 38; camDist = Math.min(1.8, Math.max(1, (w / h < 1.2 ? 1.3 : 1.75) / (w / h))); placeCam(0); camera.updateProjectionMatrix(); layoutCb?.();
  }
  function loop(t) {
    raf = requestAnimationFrame(loop);
    tickers.forEach(f => f(t));
    const s = t / 1000;
    for (const c of candles) { const f = .85 + Math.sin(s * 9 + c.userData.seed) * .08 + Math.sin(s * 23 + c.userData.seed * 2) * .05; c.userData.light.intensity = 1.1 * f; c.userData.flame.scale.set(.3 * f, .5 * f, 1); }
    shake *= .9;
    placeCam(s);
    renderer.render(scene, camera);
  }
  function placeCam(s) { // a câmera se afasta em telas estreitas para a mesa inteira caber
    camera.position.set(Math.sin(s * .15) * .25 + (Math.random() - .5) * shake, 9.2 * camDist + (Math.random() - .5) * shake, 8.6 * camDist);
    camera.lookAt(0, 0, .7);
  }
  function show(on) { active = !!on && mounted; if (!mounted) return; canvas.style.display = active ? '' : 'none'; cancelAnimationFrame(raf); if (active) { resize(); raf = requestAnimationFrame(loop); } }
  function supported() { if (!window.THREE) return false; try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; } }

  // ---------- assentos e sincronização ----------
  function seatAngle(rel, n) { return Math.PI / 2 + (rel / n) * Math.PI * 2; } // eu na frente (z+)
  function setup(view) {
    for (const g of Object.values(cardsOf)) g.forEach(m => scene.remove(m));
    for (const s of Object.values(stacksOf)) scene.remove(s);
    cardsOf = {}; stacksOf = {}; seats = [];
    const n = view.players.length, myIdx = Math.max(0, view.players.findIndex(p => p.id === view.me));
    view.players.forEach((p, k) => {
      const rel = (k - myIdx + n) % n, a = seatAngle(rel, n);
      const anchor = new T.Vector3(Math.cos(a) * 4.3, 0, Math.sin(a) * 2.75);  // onde ficam as cartas
      const label = new T.Vector3(Math.cos(a) * 6.9, .4, Math.sin(a) * 4.5);   // onde fica o painel do jogador
      const yaw = -a - Math.PI / 2; // cartas viradas para o jogador
      seats.push({ id: p.id, a, anchor, label, yaw });
      cardsOf[p.id] = [0, 1].map(i => {
        const m = cardModel(null); const off = new T.Vector3(i ? .52 : -.52, 0, 0).applyAxisAngle(new T.Vector3(0, 1, 0), yaw);
        m.position.copy(anchor).add(off).setY(.03 + i * .002); m.rotation.y = yaw + (i ? .06 : -.06); scene.add(m); return m;
      });
      const st = new T.Group(); st.position.copy(anchor).add(new T.Vector3(1.25, 0, 0).applyAxisAngle(new T.Vector3(0, 1, 0), yaw)); scene.add(st); stacksOf[p.id] = st;
    });
  }
  function seatOf(id) { return seats.find(s => s.id === id); }
  function setStack(id, n) {
    const st = stacksOf[id]; if (!st) return;
    const shown = Math.min(n, 14);
    while (st.children.length > shown) st.remove(st.children[st.children.length - 1]);
    while (st.children.length < shown) { const c = coinModel(); const i = st.children.length; c.position.set(rand(-.02, .02), .03 + i * .047, rand(-.02, .02)); c.rotation.y = Math.random() * 7; st.add(c); }
  }
  let animating = 0;
  function sync(view) {
    if (!mounted) return;
    lastView = view;
    if (seats.length !== view.players.length || view.players.some((p, i) => !seats.find(s => s.id === p.id))) setup(view);
    for (const p of view.players) {
      const ms = cardsOf[p.id]; if (!ms) continue;
      p.cards.forEach((c, i) => {
        const m = ms[i]; if (!m || m.userData.busy) return;
        if (c.up) { setCardFront(m, c.role); m.rotation.z = Math.PI; m.material[3].color.setHex(0x8c8c8c); }
        else { m.rotation.z = 0; m.material[3].color.setHex(0xffffff); }
        m.visible = true;
      });
      if (!animating) setStack(p.id, p.coins);
    }
    // baralho da Corte
    const count = view.deck.count ?? view.deck.length ?? 0;
    while (deckGroup.children.length > Math.min(count, 15)) deckGroup.remove(deckGroup.children[deckGroup.children.length - 1]);
    while (deckGroup.children.length < Math.min(count, 15)) { const c = cardModel(null); const i = deckGroup.children.length; c.position.set(rand(-.02, .02), .03 + i * .027, rand(-.02, .02)); c.rotation.y = rand(-.05, .05); deckGroup.add(c); }
  }
  // posição na tela (px, relativa ao contêiner) do painel de cada jogador
  function labelPos(id) {
    const s = seatOf(id); if (!s || !mounted) return null;
    camera.updateMatrixWorld(); const p = s.label.clone().project(camera);
    const W = wrap.clientWidth, H = wrap.clientHeight, cl = (v, a, b) => Math.max(a, Math.min(b, v));
    return { x: cl((p.x + 1) / 2 * W, 58, W - 58), y: cl((1 - p.y) / 2 * H, 70, H - 60) };
  }

  // ---------- animações ----------
  const seatPos = id => (seatOf(id)?.anchor.clone() || new T.Vector3(0, 0, 0));
  const center = () => new T.Vector3(0, 0, .7).lerp(camera.position, .42); // destaque: entre a mesa e a câmera
  async function coinFly(from, to, n, delayStep = 70) {
    const all = [];
    for (let i = 0; i < n; i++) {
      const c = coinModel(); scene.add(c); c.position.copy(from);
      const a = from.clone().add(new T.Vector3(rand(-.3, .3), .1, rand(-.3, .3))), b = to.clone().add(new T.Vector3(rand(-.15, .15), .1, rand(-.15, .15)));
      all.push(wait(i * delayStep).then(() => tween(650, k => {
        const e = ease(k); c.position.lerpVectors(a, b, e); c.position.y = a.y + (b.y - a.y) * e + Math.sin(Math.PI * k) * 2.2; c.rotation.x = k * 12; c.rotation.z = k * 5;
        if (k >= 1) { scene.remove(c); SFX.coinPing?.(i); }
      })));
    }
    await Promise.all(all);
  }
  // a carta "jogada" voa ao centro, gira, brilha (estilo Hearthstone/Runeterra) e volta
  async function playCard(actorId, role) {
    const color = ROLE_COLOR[role] || 0xffffff;
    const g = new T.Group(); scene.add(g);
    const plane = new T.Mesh(new T.PlaneGeometry(CARD_W * 2, CARD_H * 2), new T.MeshBasicMaterial({ map: cardTexture(role), transparent: true }));
    const halo = glowSprite(color, 5.5); halo.material.opacity = 0; halo.position.z = -.05;
    g.add(halo, plane);
    const from = seatPos(actorId).setY(.4), to = center();
    SFX.cardWhoosh?.();
    await tween(620, k => {
      const e = backOut(Math.min(1, k * 1.05));
      g.position.lerpVectors(from, to, easeOut(k)); g.scale.setScalar(.35 + .65 * e);
      g.lookAt(camera.position); g.rotateY((1 - easeOut(k)) * Math.PI * 2);
      halo.material.opacity = k * .9;
    });
    SFX.cardReveal?.(role);
    burst(to.clone(), color, { n: 70, speed: 3.5, life: 900, up: .6, gravity: -1.5 });
    flashLight(to, color, 5, 700);
    await tween(700, k => { g.lookAt(camera.position); const p = 1 + Math.sin(k * Math.PI) * .06; g.scale.setScalar(p); halo.material.opacity = .9 - Math.sin(k * Math.PI * 3) * .25; });
    return {
      g, done: () => tween(380, k => { g.position.lerpVectors(to, from, ease(k)); g.scale.setScalar(1 - .7 * k); halo.material.opacity = .9 * (1 - k); plane.material.opacity = 1 - k; if (k >= 1) scene.remove(g); }),
    };
  }
  async function flyObject(obj, from, to, ms, arc = 1.5, spin = 0) {
    scene.add(obj);
    await tween(ms, k => { const e = ease(k); obj.position.lerpVectors(from, to, e); obj.position.y += Math.sin(Math.PI * k) * arc; if (spin) obj.rotation.z = k * spin; });
  }
  async function slashAt(pos, color = 0xff2a1a) {
    const tex = canvasTex(256, 64, (c, w, h) => { const g = c.createLinearGradient(0, 0, w, 0); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(.5, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, h * .4, w, h * .2); });
    const s = new T.Sprite(new T.SpriteMaterial({ map: tex, color, transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
    s.position.copy(pos).setY(.9); s.material.rotation = -.6; scene.add(s);
    SFX.slash?.(); shake = .5;
    burst(pos.clone().setY(.6), color, { n: 50, speed: 3, life: 700 });
    await tween(420, k => { s.scale.set(4 * easeOut(k), 1.4, 1); s.material.opacity = 1 - k; if (k >= 1) scene.remove(s); });
  }

  // ---------- efeitos especiais de cada personagem (no momento em que a ação acontece) ----------
  const TREAS = () => treasury.position.clone().setY(.4);
  async function sicarioStrike(target) {
    const d = daggerModel(); d.rotation.x = -Math.PI / 2; SFX.whoosh?.();
    await flyObject(d, center().setY(2), target.clone().setY(.5), 450, .4, 0);
    scene.remove(d); await slashAt(target, 0xff2a1a);
  }
  async function corsarioStrike(target, actor, n) {
    const d = daggerModel(1.5, 0xc9ced8); d.rotation.x = -Math.PI / 2; SFX.whoosh?.();
    await flyObject(d, actor.clone().setY(1), target.clone().setY(.6), 420, .5, Math.PI * 4); scene.remove(d);
    SFX.swordClash?.(); shake = .3; burst(target.clone().setY(.6), ROLE_COLOR.corsario, { n: 40, speed: 3, life: 600 });
    if (n) await coinFly(target.clone().setY(.3), actor, n, 120);
  }
  async function courtSwirl(actor, n, color) {
    SFX.magic?.();
    const cards = [];
    for (let i = 0; i < n; i++) { const c = cardModel(null); c.position.copy(deckGroup.position).setY(.5); scene.add(c); cards.push(c); }
    const dp = deckGroup.position;
    await tween(1000, k => cards.forEach((c, i) => {
      const a = k * Math.PI * 3 + i * Math.PI * 2 / n, r = Math.sin(k * Math.PI);
      c.position.set(dp.x + (actor.x - dp.x) * ease(k) + Math.cos(a) * 1.1 * r, .5 + r * 1.8, dp.z + (actor.z - dp.z) * ease(k) + Math.sin(a) * .8 * r);
      c.rotation.y = a; c.rotation.z = Math.sin(k * 12) * .3;
    }));
    burst(actor.clone().setY(.6), color, { n: 50, speed: 2, life: 800, up: 1.2 });
    cards.forEach(c => scene.remove(c));
  }
  async function confessorEye(target) {
    const eye = eyeSprite(), c0 = center(); eye.position.copy(c0); eye.scale.setScalar(.1); scene.add(eye); SFX.eye?.();
    await tween(500, k => eye.scale.setScalar(2.6 * backOut(k)));
    await tween(650, k => { eye.position.lerpVectors(c0, target.clone().setY(1.2), ease(k)); eye.material.opacity = 1 - k * .3; });
    flashLight(target.clone().setY(1), ROLE_COLOR.confessor, 4, 600); await wait(300); scene.remove(eye);
  }

  // ---------- reação a cada evento do jogo ----------
  function play(e, view) {
    if (!mounted || !active) return Promise.resolve();
    pending++;
    queue = queue.then(() => (pending > 5 && e.type !== 'win' ? null : run(e, view))).catch(err => console.warn('3d', err)).finally(() => pending--);
    return queue;
  }
  let lastDeclare = null;
  async function run(e, view) {
    animating++;
    try {
      switch (e.type) {
        case 'declare': {
          lastDeclare = e;
          if (e.claim) { const c = await playCard(e.pid, e.claim); if (e.action === 'investigate' && e.target) await confessorEye(seatPos(e.target)); await c.done(); }
          else SFX.card();
          const cost = Conjura.ACTIONS[e.action]?.cost || 0; // Golpe e Assassinato: moedas pagas vão ao Tesouro
          if (cost) { SFX.coinDown(); await coinFly(seatPos(e.pid), TREAS(), Math.min(cost, 7), 45); }
          break;
        }
        case 'coins': {
          if (e.n >= 3) { // Tesoureiro: chuva de moedas com brilho roxo
            SFX.coinShower?.(); const p = seatPos(e.pid).setY(.6); flashLight(p, ROLE_COLOR.tesoureiro, 4, 900);
            await Promise.all([coinFly(TREAS(), seatPos(e.pid), 9, 50), burst(p, ROLE_COLOR.tesoureiro, { n: 50, speed: 2, life: 1100, up: 1.4, gravity: -1 })]);
          } else { SFX.coinUp(); await coinFly(TREAS(), seatPos(e.pid), e.n, 130); }
          break;
        }
        case 'steal': await corsarioStrike(seatPos(e.from), seatPos(e.pid), e.n); break;
        case 'assassinated': await sicarioStrike(seatPos(e.pid)); break;
        case 'coup': {
          const t = seatPos(e.target).setY(.5);
          // bola de fogo do atacante até o alvo
          const ball = glowSprite(0xff7a2a, 1.4); SFX.whoosh?.();
          await flyObject(ball, seatPos(e.pid).setY(1), t, 500, 1.6);
          scene.remove(ball); SFX.explosion?.(); SFX.music?.surge(); shake = 1;
          burst(t, 0xff8a2a, { n: 120, speed: 5, life: 1100, up: 1.2 }); burst(t, 0xffe08a, { n: 60, speed: 3, life: 800 }); flashLight(t, 0xff7a2a, 8, 900);
          await wait(450); break;
        }
        case 'exchangeStart': {
          const role = lastDeclare?.claim || 'diplomata', n = lastDeclare?.action === 'exchange1' ? 1 : 2;
          await courtSwirl(seatPos(e.pid), n, ROLE_COLOR[role]); break;
        }
        case 'exchanged': SFX.deal(); break;
        case 'block': {
          const c = await playCard(e.pid, e.role);
          if (e.role === 'guarda') {
            const sh = shieldModel(), p = seatPos(e.pid).setY(1.2); sh.position.copy(p); sh.scale.setScalar(.01); sh.lookAt(camera.position); scene.add(sh); SFX.shieldUp?.();
            await tween(450, k => { sh.scale.setScalar(1.1 * backOut(k)); sh.lookAt(camera.position); });
            const ring = glowSprite(ROLE_COLOR.guarda, 1); ring.position.copy(p); scene.add(ring);
            await tween(500, k => { ring.scale.setScalar(1 + k * 5); ring.material.opacity = 1 - k; });
            scene.remove(ring); await tween(300, k => { sh.scale.setScalar(1.1 * (1 - k)); if (k >= 1) scene.remove(sh); });
          } else { SFX.shieldUp?.(); burst(seatPos(e.pid).setY(.8), ROLE_COLOR[e.role] || 0xffffff, { n: 50, speed: 2.5, life: 700, up: 1 }); await wait(300); }
          await c.done(); break;
        }
        case 'blocked': SFX.coinDown(); break;
        case 'challenge': {
          // espadas cruzando entre quem contestou e quem foi contestado
          SFX.challenge?.(); SFX.music?.surge();
          const a = seatPos(e.challenger).setY(1), b = seatPos(e.claimant).setY(1), mid = a.clone().lerp(b, .5).setY(1.8);
          const s1 = daggerModel(1.3), s2 = daggerModel(1.3); SFX.whoosh?.();
          await Promise.all([flyObject(s1, a, mid, 420, .6), flyObject(s2, b, mid, 420, .6)]);
          s1.rotation.z = -.7; s2.rotation.z = .7; SFX.swordClash?.(); shake = .45; burst(mid, 0xfff1b8, { n: 60, speed: 4, life: 600, up: .5 });
          await wait(450); scene.remove(s1); scene.remove(s2);
          // resultado: a carta contestada aparece — brilha (verdade) ou se estilhaça (blefe)
          const card = new T.Mesh(new T.PlaneGeometry(CARD_W * 1.6, CARD_H * 1.6), new T.MeshBasicMaterial({ map: cardTexture(e.truth ? e.role : null), transparent: true }));
          const p = seatPos(e.claimant).setY(1.6); card.position.copy(p); card.lookAt(camera.position); card.scale.setScalar(.1); scene.add(card);
          await tween(350, k => { card.scale.setScalar(backOut(k)); card.lookAt(camera.position); card.rotateY((1 - k) * Math.PI); });
          if (e.truth) {
            SFX.truth?.(); burst(p, 0xffd56b, { n: 80, speed: 3, life: 900, up: 1.4 }); flashLight(p, 0xffd56b, 5, 800);
            await wait(650); await tween(300, k => { card.material.opacity = 1 - k; });
          } else {
            SFX.shatter?.(); shake = .6;
            // estilhaços: pedaços da carta voando
            const shards = [];
            for (let i = 0; i < 14; i++) { const s = new T.Mesh(new T.PlaneGeometry(rand(.2, .45), rand(.2, .5)), new T.MeshBasicMaterial({ color: 0x9a3b2a, side: T.DoubleSide, transparent: true })); s.position.copy(p); s.userData.v = new T.Vector3(rand(-3, 3), rand(0, 4), rand(-1, 3)); scene.add(s); shards.push(s); }
            scene.remove(card); burst(p, 0xff4040, { n: 70, speed: 4.5, life: 900, up: 1, gravity: -6 });
            let last = 0;
            await tween(900, k => { const dt = (k - last) * .9; last = k; shards.forEach(s => { s.userData.v.y -= 9 * dt; s.position.addScaledVector(s.userData.v, dt); s.rotation.x += 8 * dt; s.rotation.y += 6 * dt; s.material.opacity = 1 - k; }); });
            shards.forEach(s => scene.remove(s));
          }
          scene.remove(card); break;
        }
        case 'lose': {
          const m = cardsOf[e.pid]?.[e.idx]; if (!m) break;
          m.userData.busy = true; setCardFront(m, e.role); SFX.flip();
          const y0 = m.position.y;
          await tween(650, k => { m.position.y = y0 + Math.sin(Math.PI * k) * 1.2; m.rotation.z = Math.PI * ease(k); });
          burst(m.position.clone().setY(.3), 0x553322, { n: 30, speed: 1.2, life: 900, up: 2, gravity: 1 });
          await tween(400, k => m.material[3].color.setScalar(1 - .45 * k));
          m.userData.busy = false; break;
        }
        case 'exiled': { SFX.bankrupt(); const p = seatPos(e.pid).setY(.4); burst(p, 0x333333, { n: 60, speed: 1.5, life: 1400, up: 1.5, gravity: .8 }); await wait(500); break; }
        case 'win': { SFX.win(); const p = seatPos(e.pid).setY(1); for (let i = 0; i < 3; i++) { burst(p, [0xffd56b, 0xb67cff, 0x46d17d][i], { n: 90, speed: 4, life: 1400, up: 1.6 }); await wait(250); } break; }
      }
    } finally { animating--; if (!animating && lastView) for (const p of lastView.players) setStack(p.id, p.coins); }
  }

  let layoutCb = null;
  return { supported, mount, show, sync, play, labelPos, onLayout: f => (layoutCb = f), get active() { return active; }, get pending() { return pending; }, idle: () => queue };
})();
