// ===== Magnata em 3D de verdade (Three.js) — só visualização =====
// Mesa, tabuleiro, peões, edifícios por nível, dados, cartas e marcadores são modelados em código.
const Board3D = (() => {
  const B = 10;                       // lado do tabuleiro em unidades do mundo
  const U = 1 / 12.2, C = 1.6 / 12.2; // largura normalizada de casa comum / canto
  const CELL = B * U;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const rand = (a, b) => a + Math.random() * (b - a);

  let T = null, renderer, scene, camera, raycaster, wrap, canvas, fxLayer;
  let mounted = false, active = false, raf = 0, handlers = {};
  let boardMesh, boardTex, diceMeshes = [], diceVals = [3, 4], diceRest = [];
  let pawns = {}, pos = {}, curId = null, moving = new Set();
  let shadowDirty = true, dpr = 1, maxDpr = 1, frameAcc = 0, frameN = 0, lastT = 0;
  const tickers = new Set(); // animações rodam DENTRO do ciclo de renderização (sem atraso de um quadro)
  let buildings = {}, owners = {}, morts = {}, star = null, starLevel = 0, starTile = -1;
  const cam = { az: 0, polar: 50, r: 15, azTo: 0 };

  // ---------- geometria das casas (mesma grade do 2D) ----------
  const cw = c => (c === 1 || c === 11 ? C : U);
  const cs = c => (c === 1 ? 0 : C + (c - 2) * U);
  function gridPos(i) {
    if (i <= 10) return [11, 11 - i];
    if (i <= 20) return [11 - (i - 10), 1];
    if (i <= 30) return [1, 1 + (i - 20)];
    return [1 + (i - 30), 11];
  }
  const side = i => (i % 10 === 0 ? 'corner' : i < 10 ? 'bottom' : i < 20 ? 'left' : i < 30 ? 'top' : 'right');
  function rectN(i) { const [r, c] = gridPos(i); return { x: cs(c), y: cs(r), w: cw(c), h: cw(r) }; }
  function centerN(i) { const r = rectN(i); return { x: r.x + r.w / 2, y: r.y + r.h / 2 }; }
  const toW = (nx, ny, y = 0) => new T.Vector3((nx - .5) * B, y, (ny - .5) * B);
  // direção da borda externa para o centro, reta (perpendicular ao lado da casa); só os cantos usam a diagonal
  function inward(i) {
    switch (side(i)) {
      case 'bottom': return { x: 0, z: -1 }; case 'top': return { x: 0, z: 1 };
      case 'left': return { x: 1, z: 0 }; case 'right': return { x: -1, z: 0 };
    }
    const c = centerN(i), dx = .5 - c.x, dy = .5 - c.y, d = Math.hypot(dx, dy) || 1; return { x: dx / d, z: dy / d };
  }
  function tileAt(u, v) { for (let i = 0; i < 40; i++) { const r = rectN(i); if (u >= r.x && u <= r.x + r.w && v >= r.y && v <= r.y + r.h) return i; } return -1; }
  const outwardYaw = i => ({ bottom: 0, left: -Math.PI / 2, top: Math.PI, right: Math.PI / 2, corner: 0 })[side(i)];

  // ---------- utilidades de material/textura ----------
  const loadImg = src => new Promise(res => { if (!src) return res(null); const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = src; });
  const mat = (color, o = {}) => new T.MeshStandardMaterial({ color, roughness: .55, metalness: .05, ...o });
  function canvasTex(w, h, draw) {
    const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
    const t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; t.anisotropy = renderer.capabilities.getMaxAnisotropy(); return t;
  }
  function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function shadowy(o) { o.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } }); return o; }

  // ---------- textura do tabuleiro (desenhada em canvas) ----------
  async function drawBoard() {
    const S = 2048, cell = S * U;
    try { await Promise.all([document.fonts.load(`400 40px "Lilita One"`), document.fonts.load(`900 40px Nunito`)]); } catch { }
    const imgs = {};
    await Promise.all([...new Set(TILES.map(t => t.img).concat([IMG.board_center]))].map(async s => { imgs[s] = await loadImg(s); }));
    return canvasTex(S, S, ctx => {
      ctx.fillStyle = '#cfe3c8'; ctx.fillRect(0, 0, S, S);
      // centro
      const c0 = C * S, cS = S - 2 * C * S, art = imgs[IMG.board_center];
      if (art) ctx.drawImage(art, c0, c0, cS, cS);
      const g = ctx.createRadialGradient(S / 2, S * .55, cS * .1, S / 2, S / 2, cS * .75);
      g.addColorStop(0, 'rgba(255,250,235,.0)'); g.addColorStop(1, 'rgba(30,20,10,.45)'); ctx.fillStyle = g; ctx.fillRect(c0, c0, cS, cS);
      ctx.save(); ctx.translate(S / 2, c0 + cS * .2); ctx.rotate(-7 * Math.PI / 180);
      ctx.font = `400 ${cell * 1.02}px "Lilita One"`; const tw = ctx.measureText('MAGNATA').width + cell * .9, th = cell * 1.35;
      ctx.fillStyle = '#3a2614'; rr(ctx, -tw / 2 + 6, -th / 2 + cell * .14, tw, th, 22); ctx.fill();
      ctx.fillStyle = '#fff'; rr(ctx, -tw / 2 - 8, -th / 2 - 8, tw + 16, th + 16, 26); ctx.fill();
      const lg = ctx.createLinearGradient(0, -th / 2, 0, th / 2); lg.addColorStop(0, '#e94b3c'); lg.addColorStop(1, '#b9261a');
      ctx.fillStyle = lg; rr(ctx, -tw / 2, -th / 2, tw, th, 18); ctx.fill();
      ctx.fillStyle = '#7a1810'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('MAGNATA', 0, cell * .07);
      ctx.fillStyle = '#fff'; ctx.fillText('MAGNATA', 0, 0); ctx.restore();
      // casas
      TILES.forEach((t, i) => {
        const r = rectN(i), x = r.x * S, y = r.y * S, w = r.w * S, h = r.h * S;
        ctx.fillStyle = t.type === 'upgrade' ? '#efe4fb' : '#fbf6e6'; ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = 'rgba(58,38,20,.45)'; ctx.lineWidth = 2; ctx.strokeRect(x, y, w, h);
        const sd = side(i), corner = sd === 'corner';
        ctx.save(); ctx.translate(x + w / 2, y + h / 2);
        if (sd === 'left') ctx.rotate(Math.PI / 2); if (sd === 'right') ctx.rotate(-Math.PI / 2);
        const lw = corner ? w : cell, lh = corner ? h : C * S, rev = sd === 'top';
        const top = -lh / 2, bot = lh / 2;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#241a10';
        // faixa de cor
        if (t.type === 'street') {
          ctx.fillStyle = GROUPS[t.group].color; const bh = lh * .22;
          ctx.fillRect(-lw / 2, rev ? bot - bh : top, lw, bh);
          ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(-lw / 2, rev ? bot - bh : top + bh - 3, lw, 3);
        }
        const fs = cell * (corner ? .16 : .135);
        ctx.font = corner ? `400 ${fs}px "Lilita One"` : `900 ${fs}px Nunito`; ctx.fillStyle = '#241a10';
        const words = t.name.toUpperCase().split(' '), lines = []; let line = '';
        for (const wd of words) { const tl = line ? line + ' ' + wd : wd; if (ctx.measureText(tl).width > lw * .88 && line) { lines.push(line); line = wd; } else line = tl; }
        lines.push(line);
        const band = t.type === 'street' ? lh * .22 : 0;
        const nameY0 = rev ? bot - band - lh * .06 - (lines.length - 1) * fs * 1.05 : top + band + lh * .06 + fs * .55;
        lines.forEach((l, k) => ctx.fillText(l, 0, (rev ? nameY0 : nameY0) + k * fs * 1.05));
        const im = imgs[t.img];
        if (im) {
          const s = (corner ? .56 : .58) * lw, iy = corner ? fs * .9 : 0;
          ctx.save(); rr(ctx, -s / 2, iy - s / 2 + (rev ? -lh * .02 : lh * .04), s, s, s * .18); ctx.clip();
          ctx.drawImage(im, -s / 2, iy - s / 2 + (rev ? -lh * .02 : lh * .04), s, s); ctx.restore();
        }
        const price = t.price || t.amount;
        if (price) { ctx.font = `800 ${cell * .13}px Nunito`; ctx.fillStyle = '#241a10'; ctx.fillText(fmtMoney(price), 0, rev ? top + lh * .09 : bot - lh * .09); }
        ctx.restore();
      });
    });
  }

  // ---------- modelos ----------
  function pawnModel(color, img) {
    const g = new T.Group();
    const prof = [[0, 0], [.2, 0], [.215, .025], [.2, .055], [.14, .085], [.1, .15], [.08, .3], [.07, .36], [.115, .385], [.12, .405], [.07, .425], [0, .425]].map(([x, y]) => new T.Vector2(x, y));
    const m = mat(color, { roughness: .32, metalness: .12 });
    const body = new T.Mesh(new T.LatheGeometry(prof, 40), m);
    const head = new T.Mesh(new T.SphereGeometry(.125, 32, 20), m); head.position.y = .52;
    g.add(body, head);
    // retrato do personagem flutuando acima do peão
    const tex = canvasTex(256, 256, () => { });
    loadImg(img).then(im => {
      const c = tex.image, ctx = c.getContext('2d');
      ctx.clearRect(0, 0, 256, 256);
      ctx.fillStyle = '#3a2614'; ctx.beginPath(); ctx.arc(128, 128, 126, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc(128, 128, 118, 0, Math.PI * 2); ctx.fill();
      ctx.save(); ctx.beginPath(); ctx.arc(128, 128, 100, 0, Math.PI * 2); ctx.clip(); if (im) ctx.drawImage(im, 28, 28, 200, 200); ctx.restore();
      tex.needsUpdate = true;
    });
    const sp = new T.Sprite(new T.SpriteMaterial({ map: tex, depthWrite: false })); sp.scale.set(.42, .42, 1); sp.position.y = .92; sp.renderOrder = 5;
    g.add(sp); g.userData.sprite = sp;
    const ring = new T.Mesh(new T.TorusGeometry(.27, .025, 8, 40), mat(0xf3b733, { emissive: 0x8a5a00, emissiveIntensity: .6 }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = .01; ring.visible = false; g.add(ring); g.userData.ring = ring;
    return shadowy(g);
  }

  let winTex = null, winTexTall = null;
  function windowsTex(cols, rows, wall = '#f3ead6', glass = '#5d8fd0') {
    return canvasTex(256, 256, (ctx, w, h) => {
      ctx.fillStyle = wall; ctx.fillRect(0, 0, w, h);
      const pw = w / cols, ph = h / rows;
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        ctx.fillStyle = '#3a2614'; ctx.fillRect(c * pw + pw * .2 - 2, r * ph + ph * .2 - 2, pw * .6 + 4, ph * .55 + 4);
        const g = ctx.createLinearGradient(0, r * ph, 0, r * ph + ph * .7); g.addColorStop(0, '#bfe3ff'); g.addColorStop(1, glass);
        ctx.fillStyle = g; ctx.fillRect(c * pw + pw * .2, r * ph + ph * .2, pw * .6, ph * .55);
      }
    });
  }
  function box(w, h, d, material, x = 0, y = 0, z = 0) { const m = new T.Mesh(new T.BoxGeometry(w, h, d), material); m.position.set(x, y + h / 2, z); return m; }
  function roof(w, rh, d, material, y) {
    const s = new T.Shape(); s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(0, rh); s.closePath();
    const geo = new T.ExtrudeGeometry(s, { depth: d, bevelEnabled: false }); geo.translate(0, 0, -d / 2);
    const m = new T.Mesh(geo, material); m.position.y = y; return m;
  }
  function buildingModel(level, groupColor) {
    const g = new T.Group(), wall = mat('#f3ead6'), dark = mat('#3a2614'), roofM = mat(groupColor, { roughness: .45 });
    winTex ||= windowsTex(2, 1); winTexTall ||= windowsTex(3, 6);
    const door = (x, z, h = .11) => box(.07, h, .02, dark, x, 0, z);
    if (level === 1) { // Casa
      g.add(box(.34, .22, .3, wall), roof(.42, .17, .36, roofM, .22), box(.05, .12, .05, mat('#a0522d'), .1, .3, -.04), door(0, .151));
    } else if (level === 2) { // Sobrado
      const wm = new T.MeshStandardMaterial({ map: winTex, roughness: .6 });
      g.add(box(.34, .4, .3, [wall, wall, wall, wall, wm, wm].map(x => x)), roof(.42, .18, .36, roofM, .4), box(.36, .025, .1, mat('#ffffff'), 0, .19, .17), door(0, .151));
    } else if (level === 3) { // Mansão
      g.add(box(.48, .28, .3, wall), roof(.56, .16, .36, roofM, .28), box(.16, .2, .24, wall, -.32, 0, 0), box(.16, .2, .24, wall, .32, 0, 0),
        roof(.2, .09, .28, roofM, .2).translateX(-.32), roof(.2, .09, .28, roofM, .2).translateX(.32), door(0, .151, .14));
      for (const x of [-.15, -.05, .05, .15]) { const col = new T.Mesh(new T.CylinderGeometry(.018, .018, .26, 10), mat('#ffffff')); col.position.set(x, .13, .19); g.add(col); }
      g.add(box(.42, .03, .1, mat('#ffffff'), 0, .26, .18));
    } else if (level === 4) { // Prédio
      const wm = new T.MeshStandardMaterial({ map: winTexTall, roughness: .5 });
      g.add(box(.32, .88, .32, wm), box(.36, .04, .36, roofM, 0, .88, 0), box(.02, .16, .02, dark, .08, .92, .05), door(0, .161, .12));
    } else if (level === 5) { // Hotel
      const ht = windowsTex(3, 8, '#f6d9d0', '#4d79c4'), wm = new T.MeshStandardMaterial({ map: ht, roughness: .5 });
      const gold = mat('#f3b733', { metalness: .6, roughness: .25, emissive: 0x5a3a00, emissiveIntensity: .3 });
      g.add(box(.38, 1.12, .38, wm), box(.42, .05, .42, gold, 0, 1.12, 0));
      const crown = new T.Mesh(new T.CylinderGeometry(.12, .16, .1, 16), gold); crown.position.y = 1.22; g.add(crown);
      for (let k = 0; k < 5; k++) { const sp = new T.Mesh(new T.ConeGeometry(.03, .1, 8), gold); const a = k / 5 * Math.PI * 2; sp.position.set(Math.cos(a) * .12, 1.32, Math.sin(a) * .12); g.add(sp); }
      g.add(box(.3, .025, .12, mat('#d9412f'), 0, .16, .23), door(0, .191, .15));
    }
    return shadowy(g);
  }
  function starModel() {
    const s = new T.Shape();
    for (let k = 0; k < 10; k++) { const r = k % 2 ? .1 : .24, a = k / 10 * Math.PI * 2 - Math.PI / 2; k ? s.lineTo(Math.cos(a) * r, Math.sin(a) * r) : s.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
    const geo = new T.ExtrudeGeometry(s, { depth: .06, bevelEnabled: true, bevelSize: .015, bevelThickness: .015, bevelSegments: 2 }); geo.center();
    const m = new T.Mesh(geo, mat('#f3b733', { metalness: .7, roughness: .2, emissive: 0x7036a8, emissiveIntensity: .45 }));
    const g = new T.Group(); g.add(m); g.userData.star = m;
    const lab = new T.Sprite(new T.SpriteMaterial({ map: canvasTex(128, 64, () => { }), depthWrite: false })); lab.scale.set(.5, .25, 1); lab.position.y = -.32; g.add(lab); g.userData.label = lab;
    return shadowy(g);
  }
  function setStarLabel(level) {
    const tex = star.userData.label.material.map, c = tex.image, ctx = c.getContext('2d');
    ctx.clearRect(0, 0, 128, 64); ctx.fillStyle = '#7036a8'; rr(ctx, 8, 6, 112, 52, 26); ctx.fill(); ctx.strokeStyle = '#3a2614'; ctx.lineWidth = 5; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = '400 38px "Lilita One"'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(UPGRADE.label(level), 64, 34); tex.needsUpdate = true;
  }
  const PIPS = { 1: [[.5, .5]], 2: [[.27, .27], [.73, .73]], 3: [[.27, .27], [.5, .5], [.73, .73]], 4: [[.27, .27], [.73, .27], [.27, .73], [.73, .73]], 5: [[.27, .27], [.73, .27], [.5, .5], [.27, .73], [.73, .73]], 6: [[.27, .25], [.73, .25], [.27, .5], [.73, .5], [.27, .75], [.73, .75]] };
  const dieFace = n => canvasTex(256, 256, (ctx, w) => {
    ctx.fillStyle = '#d9ccb0'; ctx.fillRect(0, 0, w, w);
    const g = ctx.createRadialGradient(w * .35, w * .3, 10, w / 2, w / 2, w * .7); g.addColorStop(0, '#fffef8'); g.addColorStop(1, '#ebe1cb');
    ctx.fillStyle = g; rr(ctx, 6, 6, w - 12, w - 12, 46); ctx.fill();
    for (const [x, y] of PIPS[n]) { ctx.fillStyle = n === 1 ? '#c8281b' : '#1d120a'; ctx.beginPath(); ctx.arc(x * w, y * w, n === 1 ? 30 : 22, 0, Math.PI * 2); ctx.fill(); }
  });
  // ordem dos materiais do BoxGeometry: +x, -x, +y, -y, +z, -z
  const FACE_VAL = [2, 5, 3, 4, 1, 6];
  const FACE_N = () => [new T.Vector3(1, 0, 0), new T.Vector3(-1, 0, 0), new T.Vector3(0, 1, 0), new T.Vector3(0, -1, 0), new T.Vector3(0, 0, 1), new T.Vector3(0, 0, -1)];
  function faceUpQuat(v, yaw) {
    const n = FACE_N()[FACE_VAL.indexOf(v)];
    const q = new T.Quaternion().setFromUnitVectors(n, new T.Vector3(0, 1, 0));
    return new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), yaw).multiply(q);
  }
  const DIE = CELL * .5;

  // ---------- montagem da cena ----------
  // se já estiver carregando, reaproveita o mesmo carregamento (evita dois tabuleiros 3D)
  let mounting = null;
  function mount(container, h = {}) {
    handlers = h; wrap = container;
    if (mounted) { if (canvas.parentNode !== wrap) wrap.appendChild(canvas); resize(); return Promise.resolve(); }
    return (mounting ||= build().finally(() => { mounting = null; })).then(() => { if (canvas.parentNode !== wrap) wrap.appendChild(canvas); resize(); });
  }
  async function build() {
    T = window.THREE;
    renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
    maxDpr = Math.min(1.5, window.devicePixelRatio || 1); dpr = maxDpr;
    renderer.setPixelRatio(dpr);
    renderer.outputEncoding = T.sRGBEncoding; renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate = false; // sombras só são recalculadas quando algo se move (a câmera não precisa)
    canvas = renderer.domElement; canvas.className = 'gl3d'; wrap.appendChild(canvas);
    fxLayer = document.createElement('div'); fxLayer.className = 'fx3d'; wrap.appendChild(fxLayer);
    scene = new T.Scene();
    camera = new T.PerspectiveCamera(36, 1, .1, 200);
    raycaster = new T.Raycaster();
    scene.add(new T.HemisphereLight(0xfff4e0, 0x3a2614, .75));
    const sun = new T.DirectionalLight(0xfff1dc, 1.0); sun.position.set(5, 13, 7); sun.castShadow = true;
    Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 1, far: 40 }); sun.shadow.mapSize.set(1536, 1536); sun.shadow.bias = -.0005; scene.add(sun);
    const fill = new T.DirectionalLight(0xbcd4ff, .25); fill.position.set(-8, 6, -6); scene.add(fill);
    // mesa de madeira
    const woodTex = new T.TextureLoader().load(IMG.bg_wood); woodTex.encoding = T.sRGBEncoding; woodTex.wrapS = woodTex.wrapT = T.RepeatWrapping; woodTex.repeat.set(3, 3);
    const table = new T.Mesh(new T.PlaneGeometry(80, 80), new T.MeshStandardMaterial({ map: woodTex, roughness: .8 }));
    table.rotation.x = -Math.PI / 2; table.position.y = -.3; table.receiveShadow = true; scene.add(table);
    // moldura e base do tabuleiro
    const frameM = mat('#3d2414', { roughness: .6 }), trimM = mat('#c99c4a', { metalness: .4, roughness: .35 });
    const base = new T.Mesh(new T.BoxGeometry(B + .5, .3, B + .5), frameM); base.position.y = -.15; base.castShadow = base.receiveShadow = true; scene.add(base);
    const trim = new T.Mesh(new T.BoxGeometry(B + .12, .02, B + .12), trimM); trim.position.y = -.005; scene.add(trim);
    boardTex = await drawBoard();
    boardMesh = new T.Mesh(new T.PlaneGeometry(B, B), new T.MeshStandardMaterial({ map: boardTex, roughness: .75 }));
    boardMesh.rotation.x = -Math.PI / 2; boardMesh.position.y = .012; boardMesh.receiveShadow = true; scene.add(boardMesh);
    // baralhos
    for (const [deck, nx] of [['fortuna', .27], ['evento', .73]]) {
      const ct = new T.TextureLoader().load(deck === 'fortuna' ? IMG.card_fortuna : IMG.card_evento); ct.encoding = T.sRGBEncoding;
      const side = mat('#fbf6e6'), top = new T.MeshStandardMaterial({ map: ct, roughness: .5 });
      const pile = new T.Mesh(new T.BoxGeometry(1.0, .2, 1.36), [side, side, top, side, side, side]);
      const p = toW(nx, .77, .1); pile.position.copy(p); pile.rotation.y = deck === 'fortuna' ? .14 : -.14;
      pile.castShadow = pile.receiveShadow = true; pile.userData.deck = deck; scene.add(pile);
    }
    // dados
    const faces = [1, 2, 3, 4, 5, 6].reduce((o, n) => (o[n] = dieFace(n), o), {});
    for (let k = 0; k < 2; k++) {
      const m = new T.Mesh(new T.BoxGeometry(DIE, DIE, DIE), FACE_VAL.map(v => new T.MeshStandardMaterial({ map: faces[v], roughness: .35 })));
      m.castShadow = m.receiveShadow = true; m.userData.die = true; scene.add(m); diceMeshes.push(m);
    }
    restDice(diceVals);
    star = starModel(); star.visible = false; star.traverse(m => { m.castShadow = false; }); scene.add(star);
    // pré-compila os shaders de todos os modelos para não engasgar quando o primeiro prédio/peão aparecer
    const warm = new T.Group(); warm.position.y = -40;
    for (let l = 1; l <= 5; l++) warm.add(buildingModel(l, '#e5383b')); warm.add(pawnModel('#ffffff', null));
    scene.add(warm); placeCamera(); renderer.compile(scene, camera); scene.remove(warm);
    shadowDirty = true;
    bindInput(); new ResizeObserver(resize).observe(wrap); resize();
    mounted = true;
  }

  // ---------- câmera e entrada ----------
  function resize() {
    if (!renderer || !wrap) return;
    const w = wrap.clientWidth, h = wrap.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false); canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
    camera.aspect = w / h; camera.updateProjectionMatrix();
    cam.r = 16.8 * Math.max(1, 1.2 / camera.aspect) * (cam.userZoom || 1);
  }
  function placeCamera() {
    const a = cam.az * Math.PI / 180, p = cam.polar * Math.PI / 180;
    camera.position.set(cam.r * Math.sin(p) * Math.sin(a), cam.r * Math.cos(p), cam.r * Math.sin(p) * Math.cos(a));
    camera.lookAt(0, 0, .55);
  }
  function bindInput() {
    let down = null;
    canvas.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY, az: cam.azTo, polar: cam.polar, moved: false }; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', e => {
      if (!down) { canvas.style.cursor = pick(e) ? 'pointer' : 'grab'; return; }
      const dx = e.clientX - down.x, dy = e.clientY - down.y;
      if (Math.abs(dx) + Math.abs(dy) > 5) down.moved = true;
      if (down.moved) { cam.azTo = down.az - dx * .35; cam.polar = Math.max(18, Math.min(68, down.polar - dy * .25)); canvas.style.cursor = 'grabbing'; }
    });
    canvas.addEventListener('pointerup', e => {
      const d = down; down = null; if (!d || d.moved) return;
      const hit = pick(e); if (!hit) return;
      if (hit.die) handlers.onDice?.(); else if (hit.tile >= 0) handlers.onTile?.(hit.tile);
    });
    canvas.addEventListener('wheel', e => { e.preventDefault(); cam.userZoom = Math.max(.6, Math.min(1.5, (cam.userZoom || 1) * (1 + e.deltaY * .001))); cam.r = 16.8 * Math.max(1, 1.2 / camera.aspect) * cam.userZoom; }, { passive: false });
  }
  function pick(e) {
    const r = canvas.getBoundingClientRect();
    const v = new T.Vector2((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
    raycaster.setFromCamera(v, camera);
    if (raycaster.intersectObjects(diceMeshes).length) return { die: true };
    const h = raycaster.intersectObject(boardMesh)[0]; if (!h) return null;
    return { tile: tileAt(h.uv.x, 1 - h.uv.y) };
  }
  function rotate(delta) { cam.azTo += delta; }
  function setAzimuth(deg) { cam.azTo = deg; cam.az = deg; }

  function loop(t) {
    raf = requestAnimationFrame(loop);
    // qualidade adaptativa: se os quadros estiverem lentos, reduz a densidade de pixels (e volta a subir se sobrar folga)
    const dt = lastT ? t - lastT : 16; lastT = t;
    if (dt < 250) { frameAcc += dt; frameN++; }
    if (frameN >= 90) {
      const avg = frameAcc / frameN; frameAcc = 0; frameN = 0;
      if (avg > 24 && dpr > 1) { dpr = Math.max(1, dpr - .25); renderer.setPixelRatio(dpr); resize(); }
      else if (avg < 15 && dpr < maxDpr) { dpr = Math.min(maxDpr, dpr + .25); renderer.setPixelRatio(dpr); resize(); }
    }
    tickers.forEach(f => f(t));
    cam.az += (cam.azTo - cam.az) * Math.min(1, dt / 16 * .14); placeCamera();
    const s = t / 1000;
    for (const [id, g] of Object.entries(pawns)) {
      const isCur = id === curId && !moving.has(id), ring = g.userData.ring;
      if (ring.visible !== (id === curId)) { ring.visible = id === curId; shadowDirty = true; }
      g.userData.sprite.position.y = .92 + (isCur ? Math.abs(Math.sin(s * 3)) * .1 : 0);
    }
    if (star.visible) { star.userData.star.rotation.y = s * 1.6; star.position.y = .95 + Math.sin(s * 2) * .06; }
    if (shadowDirty) { renderer.shadowMap.needsUpdate = true; shadowDirty = false; }
    renderer.render(scene, camera);
  }
  // mede o custo real de um quadro (força a GPU a terminar cada um) — ferramenta de diagnóstico
  function bench(n = 60) {
    if (!mounted) return null;
    const gl = renderer.getContext(); renderer.shadowMap.needsUpdate = true; renderer.render(scene, camera); gl.finish();
    let t0 = performance.now(); for (let k = 0; k < n; k++) { renderer.render(scene, camera); gl.finish(); } const plain = (performance.now() - t0) / n;
    t0 = performance.now(); for (let k = 0; k < n; k++) { renderer.shadowMap.needsUpdate = true; renderer.render(scene, camera); gl.finish(); } const withShadow = (performance.now() - t0) / n;
    return { msPorQuadro: +plain.toFixed(2), msComSombra: +withShadow.toFixed(2), dpr, tamanho: renderer.domElement.width + 'x' + renderer.domElement.height, chamadas: renderer.info.render.calls, triangulos: renderer.info.render.triangles };
  }
  function show(on) {
    active = !!on; if (!mounted) return;
    canvas.style.display = fxLayer.style.display = active ? '' : 'none';
    cancelAnimationFrame(raf); if (active) { resize(); raf = requestAnimationFrame(loop); }
  }

  // ---------- sincronização com o estado ----------
  function slot(id) {
    const here = Object.keys(pos).filter(k => pos[k] === pos[id] && pawns[k]?.visible), n = here.length, k = here.indexOf(id);
    const c = centerN(pos[id]), w = toW(c.x, c.y);
    if (n > 1) { const a = k / n * Math.PI * 2, r = CELL * (n > 4 ? .3 : .24); w.x += Math.cos(a) * r; w.z += Math.sin(a) * r; }
    return w;
  }
  function layoutPawns() { for (const id of Object.keys(pawns)) if (!moving.has(id)) { const p = slot(id); pawns[id].position.set(p.x, .012, p.z); } shadowDirty = true; }
  function sync(d) {
    shadowDirty = true;
    if (!mounted) return;
    // peões
    const ids = new Set(d.tokens.map(t => t.id));
    for (const id of Object.keys(pawns)) if (!ids.has(id)) { scene.remove(pawns[id]); delete pawns[id]; delete pos[id]; }
    for (const t of d.tokens) {
      if (!pawns[t.id] || pawns[t.id].userData.key !== t.color + t.img) {
        if (pawns[t.id]) scene.remove(pawns[t.id]);
        const g = pawnModel(t.color, t.img); g.userData.key = t.color + t.img; scene.add(g); pawns[t.id] = g;
      }
      pawns[t.id].visible = !t.out;
      if (!moving.has(t.id)) pos[t.id] = t.pos;
      if (t.cur) curId = t.id;
    }
    if (!d.tokens.some(t => t.cur)) curId = null;
    layoutPawns();
    // donos, construções, hipotecas
    for (const p of d.props) {
      const i = p.tile, c = centerN(i), r = rectN(i), inw = inward(i);
      // marcador do dono: faixa colorida na borda externa
      if (p.ownerColor) {
        let o = owners[i];
        if (!o) {
          const horiz = side(i) === 'bottom' || side(i) === 'top';
          o = new T.Mesh(new T.BoxGeometry(horiz ? r.w * B * .86 : .09, .05, horiz ? .09 : r.h * B * .86), mat('#fff'));
          const w = toW(c.x, c.y); const off = (horiz ? r.h : r.w) * B * .44;
          o.position.set(w.x - inw.x * off, .035, w.z - inw.z * off); o.castShadow = true; scene.add(o); owners[i] = o;
        }
        o.material.color.set(p.ownerColor);
      } else if (owners[i]) { scene.remove(owners[i]); delete owners[i]; }
      // edifício do nível
      const lvl = p.ownerColor ? p.houses : 0, b = buildings[i];
      if (lvl > 0 && (!b || b.userData.level !== lvl)) {
        if (b) scene.remove(b);
        const g = buildingModel(lvl, GROUPS[TILES[i].group].color); g.userData.level = lvl;
        const w = toW(c.x, c.y); g.position.set(w.x + inw.x * CELL * .3, .012, w.z + inw.z * CELL * .3); g.rotation.y = outwardYaw(i);
        g.scale.setScalar(.01); scene.add(g); buildings[i] = g; popIn(g);
      } else if (!lvl && b) { scene.remove(b); delete buildings[i]; }
      // hipoteca
      if (p.mortgaged && !morts[i]) {
        const tex = canvasTex(256, 256, (ctx, w) => { ctx.fillStyle = 'rgba(40,20,10,.55)'; ctx.fillRect(0, 0, w, w); ctx.save(); ctx.translate(w / 2, w / 2); ctx.rotate(-Math.PI / 6); ctx.fillStyle = '#d9412f'; ctx.fillRect(-w, -26, w * 2, 52); ctx.fillStyle = '#fff'; ctx.font = '900 30px Nunito'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('HIPOTECADA', 0, 2); ctx.restore(); });
        const m = new T.Mesh(new T.PlaneGeometry(r.w * B, r.h * B), new T.MeshBasicMaterial({ map: tex, transparent: true }));
        const w = toW(c.x, c.y, .02); m.position.copy(w); m.rotation.x = -Math.PI / 2; scene.add(m); morts[i] = m;
      } else if (!p.mortgaged && morts[i]) { scene.remove(morts[i]); delete morts[i]; }
    }
    // estrela do upgrade
    if (d.upgrade) {
      const c = centerN(d.upgrade.tile), w = toW(c.x, c.y); star.position.x = w.x; star.position.z = w.z; star.visible = true;
      if (starLevel !== d.upgrade.level || starTile !== d.upgrade.tile) { setStarLabel(d.upgrade.level); starLevel = d.upgrade.level; starTile = d.upgrade.tile; }
    } else star.visible = false;
    if (d.dice && !rolling) restDice(d.dice);
  }
  function popIn(g) {
    tween(550, k => { const e = 1 + 2.7 * (k - 1) ** 3 + 1.7 * (k - 1) ** 2; g.scale.setScalar(Math.max(.01, e)); });
  }
  function reset() {
    if (!mounted) return;
    for (const o of [...Object.values(pawns), ...Object.values(buildings), ...Object.values(owners), ...Object.values(morts)]) scene.remove(o);
    pawns = {}; pos = {}; buildings = {}; owners = {}; morts = {}; curId = null; moving.clear(); star.visible = false; starTile = -1;
  }

  // ---------- animações ----------
  // fn(k) com k de 0 a 1, chamada pelo próprio ciclo de renderização logo antes de desenhar o quadro
  function tween(ms, fn) {
    return new Promise(res => {
      let t0 = null, fin = false;
      const finish = () => { if (fin) return; fin = true; tickers.delete(tk); fn(1); shadowDirty = true; res(); };
      const tk = now => { if (fin) return; if (t0 === null) t0 = now; const k = Math.min(1, (now - t0) / ms); fn(k); shadowDirty = true; if (k >= 1) finish(); };
      tickers.add(tk);
      setTimeout(finish, ms + 250); // garantia se a aba congelar
      if (!active) finish();
    });
  }
  function restSpots() { return [toW(.44, .52, DIE / 2 + .012), toW(.56, .53, DIE / 2 + .012)]; }
  let rolling = false;
  function restDice(vals) {
    diceVals = vals; diceRest = diceRest.length ? diceRest : restSpots();
    diceMeshes.forEach((m, k) => { if (m.userData.yaw == null) m.userData.yaw = rand(-.4, .4); m.position.copy(diceRest[k]); m.quaternion.copy(faceUpQuat(vals[k], m.userData.yaw)); });
    shadowDirty = true;
  }
  async function rollDice(vals, { small = false } = {}) {
    if (!mounted) return;
    rolling = true; diceVals = vals;
    const D = small ? 1150 : 1450, rest = restSpots().map(p => p.add(new T.Vector3(rand(-.12, .12), 0, rand(-.12, .12))));
    diceRest = rest;
    // joga a partir do lado da câmera
    const a = cam.az * Math.PI / 180, toCam = new T.Vector3(Math.sin(a), 0, Math.cos(a));
    const KF = [[0, 2.2, 0], [.28, 0, .42], [.42, .5, .6], [.55, 0, .74], [.63, .16, .82], [.7, 0, .88], [.88, 0, 1], [1, 0, 1]];
    const sample = t => {
      let i = 0; while (i < KF.length - 2 && t > KF[i + 1][0]) i++;
      const [o0, h0, g0] = KF[i], [o1, h1, g1] = KF[i + 1], u = (t - o0) / (o1 - o0 || 1);
      const e = h1 > h0 ? 1 - (1 - u) ** 2 : u * u; // sobe desacelerando, desce acelerando
      return { h: h0 + (h1 - h0) * e, g: g0 + (g1 - g0) * u };
    };
    const dice = diceMeshes.map((m, k) => {
      const yaw = rand(-.5, .5); m.userData.yaw = yaw;
      const start = rest[k].clone().add(toCam.clone().multiplyScalar(rand(2.6, 3.4))).add(new T.Vector3(rand(-.4, .4), 0, rand(-.4, .4)));
      const axis = new T.Vector3(rand(-1, 1), rand(-.3, .3), rand(-1, 1)).normalize(), spin = rand(4, 6.5) * Math.PI;
      return { m, start, end: rest[k], qf: faceUpQuat(vals[k], yaw), axis, spin, delay: k * 60 };
    });
    SFX.shake();
    [[.28, 1], [.55, .6], [.7, .35], [.86, .18]].forEach(([o, v]) => { setTimeout(() => SFX.bounce(v, -.15), D * o); setTimeout(() => SFX.bounce(v * .85, .15), D * o + 60); });
    await tween(D + 60, k => {
      for (const d of dice) {
        const t = Math.max(0, Math.min(1, (k * (D + 60) - d.delay) / D)), s = sample(t);
        d.m.position.set(d.start.x + (d.end.x - d.start.x) * s.g, d.end.y + s.h * DIE * 2.2, d.start.z + (d.end.z - d.start.z) * s.g);
        const rem = 1 - Math.min(1, t / .88), q = new T.Quaternion().setFromAxisAngle(d.axis, d.spin * rem * rem * (3 - 2 * rem) * .9 + d.spin * rem * .1);
        d.m.quaternion.copy(d.qf).multiply(q);
      }
    });
    dice.forEach(d => { d.m.position.copy(d.end); d.m.quaternion.copy(d.qf); });
    rolling = false;
    // soma em cima dos dados
    const mid = rest[0].clone().add(rest[1]).multiplyScalar(.5); mid.y += DIE * 2.2;
    const sp = project(mid), el = document.createElement('div');
    const dbl = vals[0] === vals[1] && !small;
    el.className = 'dice-sum on'; el.innerHTML = `<b>${vals[0] + vals[1]}</b>${dbl ? '<span>DUPLA!</span>' : small ? '<span>serviço</span>' : ''}`;
    el.style.left = sp.x + 'px'; el.style.top = sp.y + 'px'; fxLayer.appendChild(el); setTimeout(() => el.remove(), 2500);
    if (dbl) SFX.deal(); else SFX.click();
    await wait(small ? 450 : 650);
  }
  async function walk(id, from, steps) {
    const g = pawns[id]; if (!g) return;
    moving.add(id); pos[id] = from;
    const dir = Math.sign(steps), n = Math.abs(steps);
    const p0 = slot(id); g.position.set(p0.x, .012, p0.z);
    const pts = [p0];
    for (let k = 1; k <= n; k++) { const c = centerN((from + dir * k + 400) % 40); pts.push(toW(c.x, c.y, .012)); }
    let hop = -1;
    await tween(n * FX.STEP, t => {
      const x = t * n, k = Math.min(n - 1, Math.floor(x)), u = t >= 1 ? 1 : x - k;
      if (k !== hop) { hop = k; SFX.step(k + 1); pos[id] = (from + dir * (k + 1) + 400) % 40; }
      const a = pts[k], b = pts[k + 1], e = u < .5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2;
      g.position.set(a.x + (b.x - a.x) * e, .012 + Math.sin(Math.PI * u) * .45, a.z + (b.z - a.z) * e);
      const sq = u > .82 ? 1 - Math.sin((u - .82) / .18 * Math.PI) * .14 : 1; // achata um pouco ao tocar a casa
      g.scale.set(1 + (1 - sq) * .5, sq, 1 + (1 - sq) * .5);
    });
    g.scale.set(1, 1, 1); pos[id] = (from + steps + 400) % 40;
    moving.delete(id); SFX.land(); layoutPawns(); await wait(300);
  }
  async function jump(id, to) {
    const g = pawns[id]; if (!g) return;
    moving.add(id); SFX.jail();
    const a = g.position.clone(), c = centerN(to), b = toW(c.x, c.y, .012);
    await tween(850, t => { const e = t < .5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2; g.position.set(a.x + (b.x - a.x) * e, .012 + Math.sin(Math.PI * t) * 2.4, a.z + (b.z - a.z) * e); g.rotation.y = t * Math.PI * 4; });
    g.rotation.y = 0; pos[id] = to; moving.delete(id); layoutPawns(); await wait(150);
  }
  function project(v) {
    const p = v.clone().project(camera), r = canvas.getBoundingClientRect(), wr = wrap.getBoundingClientRect();
    return { x: (p.x + 1) / 2 * r.width + r.left - wr.left, y: (1 - p.y) / 2 * r.height + r.top - wr.top };
  }
  function floatMoney(id, amount) {
    const g = pawns[id]; if (!g || !active) return;
    const sp = project(g.position.clone().add(new T.Vector3(0, 1.1, 0)));
    const f = document.createElement('div'); f.className = 'float-money ' + (amount >= 0 ? 'up' : 'down');
    f.textContent = (amount >= 0 ? '+' : '−') + fmtMoney(Math.abs(amount)); f.style.left = sp.x + 'px'; f.style.top = sp.y + 'px'; fxLayer.appendChild(f);
    f.animate([{ transform: 'translate(-50%, -50%) scale(.6)', opacity: 0 }, { transform: 'translate(-50%, -120%) scale(1.1)', opacity: 1, offset: .2 }, { transform: 'translate(-50%, -260%) scale(1)', opacity: 0 }], { duration: 1500, easing: 'ease-out' });
    setTimeout(() => f.remove(), 1600);
  }
  function stamp(tile, text, color) {
    if (!active) return;
    const c = centerN(tile), sp = project(toW(c.x, c.y, .3));
    const s = document.createElement('div'); s.className = 'stamp'; s.textContent = text; s.style.setProperty('--sc', color || '#d94031');
    s.style.left = sp.x + 'px'; s.style.top = sp.y + 'px'; fxLayer.appendChild(s);
    s.animate([{ transform: 'translate(-50%,-50%) scale(3) rotate(-18deg)', opacity: 0 }, { transform: 'translate(-50%,-50%) scale(.95) rotate(-12deg)', opacity: 1, offset: .25 }, { transform: 'translate(-50%,-50%) scale(1) rotate(-12deg)', opacity: 1, offset: .8 }, { transform: 'translate(-50%,-50%) scale(1) rotate(-12deg)', opacity: 0 }], { duration: 1300, easing: 'ease-out' });
    setTimeout(() => s.remove(), 1400);
  }
  // retângulo na tela do baralho (para a carta "sair" dele)
  function deckRect(deck) {
    const pile = scene?.children.find(o => o.userData.deck === deck); if (!pile) return null;
    const p = project(pile.position.clone()), wr = wrap.getBoundingClientRect(), w = 60;
    return { getBoundingClientRect: () => ({ left: wr.left + p.x - w / 2, top: wr.top + p.y - w * .7, width: w, height: w * 1.4 }) };
  }

  function supported() {
    if (!window.THREE) return false;
    try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
  }

  return {
    supported, mount, show, sync, reset, bench, rotate, setAzimuth, rollDice, walk, jump, floatMoney, stamp, deckRect,
    get active() { return active && mounted; }, get mounted() { return mounted; },
  };
})();
