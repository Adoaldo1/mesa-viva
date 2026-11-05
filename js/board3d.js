// ===== Magnata em 3D de verdade (Three.js) — só visualização =====
// Mesa, tabuleiro, peões laqueados, edifícios detalhados por nível, dados arredondados, cartas, moedas,
// pós-processamento (bloom, tons ACES, vinheta) e um efeito visual para cada acontecimento do jogo.
const Board3D = (() => {
  const B = 10;                       // lado do tabuleiro em unidades do mundo
  const U = 1 / 12.2, C = 1.6 / 12.2; // largura normalizada de casa comum / canto
  const CELL = B * U;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const rand = (a, b) => a + Math.random() * (b - a);
  const ease = t => (t < .5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
  const easeOut = t => 1 - (1 - t) ** 3;
  const easeIn = t => t * t * t;
  const smooth = t => t * t * (3 - 2 * t);
  const backOut = t => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2;

  let T = null, renderer, scene, camera, raycaster, wrap, canvas, fxLayer, composer = null, post = null, backdrop = null;
  let mounted = false, active = false, raf = 0, handlers = {};
  let boardMesh, boardTex, diceMeshes = [], diceVals = [3, 4], diceRest = [];
  let pawns = {}, pos = {}, curId = null, moving = new Set();
  let shadowDirty = true, dpr = 1, maxDpr = 1, frameAcc = 0, frameN = 0, lastT = 0;
  const tickers = new Set(); // animações rodam DENTRO do ciclo de renderização (sem atraso de um quadro)
  let buildings = {}, owners = {}, morts = {}, star = null, starLevel = 0, starTile = -1;
  const cam = { az: 0, polar: 50, r: 15, azTo: 0 };
  const look = { x: 0, z: .55 }, lookTo = { x: 0, z: .55 }; let lookBack = 0;
  let glow = null, dust = null, confetti = null, flash = 0, flashCol = null, shake = 0;
  const texCache = {};
  let boardParts = [], flipping = false; // peças fixas do tabuleiro (para virar a mesa)

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
  const tileW = (i, y = 0) => { const c = centerN(i); return toW(c.x, c.y, y); };
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
  const lacquer = (color, o = {}) => new T.MeshPhysicalMaterial({ color, roughness: .28, metalness: .05, clearcoat: 1, clearcoatRoughness: .12, ...o });
  const gold = () => texCache.gold || (texCache.gold = mat('#f0b93a', { metalness: 1, roughness: .24 }));
  function canvasTex(w, h, draw, srgb = true) {
    const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
    const t = new T.CanvasTexture(c); if (srgb) t.encoding = T.sRGBEncoding; t.anisotropy = renderer.capabilities.getMaxAnisotropy(); return t;
  }
  function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function shadowy(o) { o.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } }); return o; }
  const glowTex = () => texCache.glowT || (texCache.glowT = canvasTex(128, 128, (c, w) => { const g = c.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.25, 'rgba(255,255,255,.5)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, w, w); }));

  // mapa de relevo: só os nomes das casas, brancos sobre preto
  async function drawBump() {
    const S = 2048, cell = S * U;
    return canvasTex(S, S, ctx => { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, S, S); paintTiles(ctx, S, cell, {}, true); }, false);
  }
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
      g.addColorStop(0, 'rgba(255,250,235,.0)'); g.addColorStop(1, 'rgba(60,40,15,.14)'); ctx.fillStyle = g; ctx.fillRect(c0, c0, cS, cS);
      ctx.save(); ctx.translate(S / 2, c0 + cS * .2); ctx.rotate(-7 * Math.PI / 180);
      ctx.font = `400 ${cell * 1.02}px "Lilita One"`; const tw = ctx.measureText('MAGNATA').width + cell * .9, th = cell * 1.35;
      ctx.fillStyle = '#3a2614'; rr(ctx, -tw / 2 + 6, -th / 2 + cell * .14, tw, th, 22); ctx.fill();
      ctx.fillStyle = '#fff'; rr(ctx, -tw / 2 - 8, -th / 2 - 8, tw + 16, th + 16, 26); ctx.fill();
      const lg = ctx.createLinearGradient(0, -th / 2, 0, th / 2); lg.addColorStop(0, '#e94b3c'); lg.addColorStop(1, '#b9261a');
      ctx.fillStyle = lg; rr(ctx, -tw / 2, -th / 2, tw, th, 18); ctx.fill();
      ctx.fillStyle = '#7a1810'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('MAGNATA', 0, cell * .07);
      ctx.fillStyle = '#fff'; ctx.fillText('MAGNATA', 0, 0); ctx.restore();
      paintTiles(ctx, S, cell, imgs, false);
    });
  }

  // desenha as casas; com bump=true só os nomes, em branco sobre preto (mapa de relevo das letras)
  function paintTiles(ctx, S, cell, imgs, bump) {
  TILES.forEach((t, i) => {
      const r = rectN(i), x = r.x * S, y = r.y * S, w = r.w * S, h = r.h * S;
      if (!bump) { ctx.fillStyle = t.type === 'upgrade' ? '#efe4fb' : '#fbf6e6'; ctx.fillRect(x, y, w, h); ctx.strokeStyle = 'rgba(58,38,20,.45)'; ctx.lineWidth = 2; ctx.strokeRect(x, y, w, h); }
      const sd = side(i), corner = sd === 'corner';
      ctx.save(); ctx.translate(x + w / 2, y + h / 2);
      if (sd === 'left') ctx.rotate(Math.PI / 2); if (sd === 'right') ctx.rotate(-Math.PI / 2); if (sd === 'top') ctx.rotate(Math.PI); // cada lado virado para fora
      const lw = corner ? w : cell, lh = corner ? h : C * S, rev = false;
      const top = -lh / 2, bot = lh / 2;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#241a10';
      // faixa de cor
      if (!corner) { sideTile(ctx, t, lw, lh, top, bot, rev, cell, imgs, bump); ctx.restore(); return; }
      const fs = cell * (corner ? .16 : .135);
      ctx.font = corner ? `400 ${fs}px "Lilita One"` : `900 ${fs}px Nunito`; ctx.fillStyle = '#241a10';
      const words = t.name.toUpperCase().split(' '), lines = []; let line = '';
      for (const wd of words) { const tl = line ? line + ' ' + wd : wd; if (ctx.measureText(tl).width > lw * .88 && line) { lines.push(line); line = wd; } else line = tl; }
      lines.push(line);
      const band = t.type === 'street' ? lh * .22 : 0;
      const nameY0 = rev ? bot - band - lh * .06 - (lines.length - 1) * fs * 1.05 : top + band + lh * .06 + fs * .55;
      lines.forEach((l, k) => raised(ctx, l, 0, (rev ? nameY0 : nameY0) + k * fs * 1.05, bump, fs));
      if (bump) { ctx.restore(); return; }
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
  }
  // nome em relevo: na textura, sombra embaixo e brilho em cima (letra "saltada"); no mapa de relevo, branco desfocado
  function raised(ctx, text, x, y, bump, fs) {
    if (bump) { ctx.save(); ctx.filter = `blur(${Math.max(1, fs * .035)}px)`; ctx.fillStyle = '#fff'; ctx.fillText(text, x, y); ctx.restore(); return; }
    const o = Math.max(1.2, fs * .045), col = ctx.fillStyle;
    ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fillText(text, x - o * .6, y - o * .6);
    ctx.fillStyle = 'rgba(40,25,10,.38)'; ctx.fillText(text, x + o, y + o * 1.2);
    ctx.fillStyle = col; ctx.fillText(text, x, y);
  }

  // casa lateral: posições medidas a partir da borda de dentro (a que fica virada para o centro)
  function sideTile(ctx, t, lw, lh, top, bot, rev, cell, imgs, bump) {
    const inner = rev ? bot : top, sg = rev ? -1 : 1, Y = d => inner + sg * d, bandH = lh * .2;
    if (!bump) {
      ctx.fillStyle = t.type === 'street' ? GROUPS[t.group].color : '#eadfc2';
      ctx.fillRect(-lw / 2, Math.min(Y(0), Y(bandH)), lw, bandH);
      ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.fillRect(-lw / 2, rev ? Y(bandH) - 3 + 3 : Y(bandH) - 3, lw, 3);
    }
    // nome: até 2 linhas, encolhe se precisar, centralizado numa área fixa logo abaixo da faixa
    const words = t.name.toUpperCase().split(' '); let fs = cell * .155, lines;
    for (;;) {
      ctx.font = `900 ${fs}px Nunito`; lines = []; let line = '';
      for (const wd of words) { const tl = line ? line + ' ' + wd : wd; if (ctx.measureText(tl).width > lw * .86 && line) { lines.push(line); line = wd; } else line = tl; }
      lines.push(line);
      if ((lines.length <= 2 && lines.every(l => ctx.measureText(l).width <= lw * .9)) || fs < cell * .1) break;
      fs *= .92;
    }
    ctx.fillStyle = '#241a10'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const dc = bandH + lh * .15, lh2 = fs * 1.04;
    lines.forEach((l, k) => raised(ctx, l, 0, Y(dc) + (k - (lines.length - 1) / 2) * lh2, bump, fs));
    if (bump) return;
    // ícone no meio do espaço que sobra
    const im = imgs[t.img];
    if (im) {
      const d0 = bandH + lh * .3, d1 = lh * .8, sz = Math.min(lw * .5, (d1 - d0) * .92), cy = Y((d0 + d1) / 2);
      ctx.save(); rr(ctx, -sz / 2, cy - sz / 2, sz, sz, sz * .18); ctx.clip(); ctx.drawImage(im, -sz / 2, cy - sz / 2, sz, sz); ctx.restore();
    }
    // preço numa pílula junto à borda de fora
    const price = t.price || t.amount;
    if (price) {
      ctx.font = `800 ${cell * .125}px Nunito`; const txt = fmtMoney(price), pw = ctx.measureText(txt).width + cell * .16, ph = cell * .17, py = Y(lh * .9);
      ctx.fillStyle = 'rgba(58,38,20,.1)'; rr(ctx, -pw / 2, py - ph / 2, pw, ph, ph / 2); ctx.fill();
      ctx.fillStyle = '#241a10'; ctx.fillText(txt, 0, py + 1);
    }
  }

  // mesas: madeira (padrão), feltro, mármore e noite
  const tableRefs = {}; let tableNow = 'wood';
  function setTable(id) {
    if (!tableRefs.table || id === tableNow) return; tableNow = id;
    const tm = tableRefs.table.material, fm = tableRefs.frame;
    const marble = () => tableRefs.marble || (tableRefs.marble = canvasTex(1024, 1024, (c, w, h) => {
      c.fillStyle = '#ece8e1'; c.fillRect(0, 0, w, h);
      for (let k = 0; k < 26; k++) { c.strokeStyle = `rgba(120,115,110,${.08 + Math.random() * .18})`; c.lineWidth = .8 + Math.random() * 2.4; c.beginPath(); let x = Math.random() * w, y = Math.random() * h; c.moveTo(x, y); for (let j = 0; j < 14; j++) { x += (Math.random() - .3) * 90; y += (Math.random() - .5) * 90; c.lineTo(x, y); } c.stroke(); }
    }));
    const feltTex = () => tableRefs.felt || (tableRefs.felt = (() => { const t = canvasTex(512, 512, (c, w, h) => { c.fillStyle = '#123a24'; c.fillRect(0, 0, w, h); for (let i = 0; i < 40000; i++) { const v = Math.random() < .5 ? 0 : 255; c.fillStyle = `rgba(${v},${v},${v},.05)`; c.fillRect(Math.random() * w, Math.random() * h, 1, 1); } }); t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(6, 6); return t; })());
    const S = { wood: [tableRefs.wood, 0xffffff, .55, 0x3d2414, tableRefs.wood, 0x1d120b],
      felt: [feltTex(), 0x2a6a44, 1, 0x3a1d10, tableRefs.wood, 0x0d1a12],
      marble: [marble(), 0xffffff, .25, 0xece6da, marble(), 0x2b2724],
      night: [null, 0x141a2e, .35, 0x0e1322, null, 0x05070f] }[id] || null;
    if (!S) return;
    tm.map = S[0]; tm.color.setHex(S[1]); tm.roughness = S[2]; tm.needsUpdate = true;
    fm.color.setHex(S[3]); fm.map = S[4]; fm.needsUpdate = true;
    scene.background = new T.Color(S[5]); scene.fog.color.setHex(S[5]);
    shadowDirty = true;
  }

  // ---------- modelos ----------
  // peão de laca com frisos dourados e o retrato do personagem num medalhão acima
  function pawnModel(color, img, kind = 'classic') {
    const g = new T.Group();
    const m = lacquer(color);
    const felt = new T.Mesh(new T.CircleGeometry(.235, 40), mat('#2a1a0e', { roughness: 1 })); felt.rotation.x = -Math.PI / 2; felt.position.y = .001;
    g.add(felt, ...tokenBody(kind, m));
    // medalhão com o retrato
    const tex = canvasTex(256, 256, () => { });
    loadImg(img).then(im => {
      const ctx = tex.image.getContext('2d'); ctx.clearRect(0, 0, 256, 256);
      ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 4;
      const rim = ctx.createLinearGradient(0, 0, 256, 256); rim.addColorStop(0, '#fff2b8'); rim.addColorStop(.45, '#d49a2a'); rim.addColorStop(.6, '#8a5a12'); rim.addColorStop(1, '#ffe08a');
      ctx.fillStyle = rim; ctx.beginPath(); ctx.arc(128, 124, 118, 0, Math.PI * 2); ctx.fill(); ctx.shadowColor = 'transparent';
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc(128, 124, 106, 0, Math.PI * 2); ctx.fill();
      ctx.save(); ctx.beginPath(); ctx.arc(128, 124, 94, 0, Math.PI * 2); ctx.clip(); if (im) ctx.drawImage(im, 34, 30, 188, 188);
      const sh = ctx.createLinearGradient(0, 30, 0, 220); sh.addColorStop(0, 'rgba(255,255,255,.25)'); sh.addColorStop(.4, 'rgba(255,255,255,0)'); ctx.fillStyle = sh; ctx.fillRect(0, 0, 256, 256); ctx.restore();
      tex.needsUpdate = true;
    });
    const sp = new T.Sprite(new T.SpriteMaterial({ map: tex, depthWrite: false })); sp.scale.set(.46, .46, 1); sp.position.y = .95; sp.renderOrder = 5;
    g.add(sp); g.userData.sprite = sp;
    // anel e halo do jogador da vez
    const ring = new T.Group(); ring.visible = false;
    const tor = new T.Mesh(new T.TorusGeometry(.29, .02, 10, 56), mat(0xf3b733, { metalness: .8, roughness: .2, emissive: 0xffb020, emissiveIntensity: .9 })); tor.rotation.x = -Math.PI / 2; tor.position.y = .012;
    const halo = new T.Mesh(new T.PlaneGeometry(1.1, 1.1), new T.MeshBasicMaterial({ map: glowTex(), color: 0xffc040, transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: .55 }));
    halo.rotation.x = -Math.PI / 2; halo.position.y = .008; ring.add(tor, halo); ring.userData.halo = halo;
    g.add(ring); g.userData.ring = ring;
    g.userData.color = color;
    shadowy(g); halo.castShadow = false; felt.castShadow = false;
    return g;
  }

  // corpo do peão conforme o formato escolhido na sala
  function tokenBody(kind, m) {
    const M = (geo, mt, x = 0, y = 0, z = 0) => { const o = new T.Mesh(geo, mt); o.position.set(x, y, z); return o; };
    const dark = mat('#1d1712', { roughness: .5 });
    if (kind === 'car') { // carrinho conversível
      const body = M(new T.BoxGeometry(.46, .12, .26), m, 0, .1, 0), hood = M(new T.BoxGeometry(.16, .07, .24), m, .14, .19, 0), cab = M(new T.BoxGeometry(.16, .1, .22), m, -.06, .21, 0);
      const glass = M(new T.BoxGeometry(.02, .09, .22), mat('#9fd0ff', { metalness: .2, roughness: .05, transparent: true, opacity: .7 }), .03, .27, 0);
      const parts = [body, hood, cab, glass];
      for (const [x, z] of [[.15, .13], [-.15, .13], [.15, -.13], [-.15, -.13]]) { const w = M(new T.CylinderGeometry(.065, .065, .05, 20), dark, x, .065, z); w.rotation.x = Math.PI / 2; const hub = M(new T.CylinderGeometry(.03, .03, .055, 14), gold(), x, .065, z); hub.rotation.x = Math.PI / 2; parts.push(w, hub); }
      for (const z of [.08, -.08]) parts.push(M(new T.SphereGeometry(.025, 12, 8), gold(), .235, .12, z));
      return parts;
    }
    if (kind === 'rocket') {
      const prof = [[0, .08], [.1, .08], [.12, .16], [.125, .32], [.1, .46], [.05, .56], [0, .6]].map(([x, y]) => new T.Vector2(x, y));
      const parts = [M(new T.LatheGeometry(prof, 40), m), M(new T.CylinderGeometry(.06, .09, .08, 20), gold(), 0, .04, 0)];
      const win = M(new T.SphereGeometry(.045, 16, 12), mat('#9fd0ff', { metalness: .3, roughness: .05 }), 0, .36, .11); parts.push(win);
      for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2, fin = M(new T.BoxGeometry(.02, .16, .1), gold(), Math.cos(a) * .12, .14, Math.sin(a) * .12); fin.rotation.y = -a; parts.push(fin); }
      return parts;
    }
    if (kind === 'crown') { // almofada na cor do jogador com coroa dourada
      const cushion = M(new T.CylinderGeometry(.2, .21, .1, 32), m, 0, .06, 0); cushion.scale.set(1, 1, 1);
      const ring = M(new T.CylinderGeometry(.15, .14, .12, 32, 1, true), gold(), 0, .19, 0);
      const parts = [cushion, ring];
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; parts.push(M(new T.ConeGeometry(.04, .12, 10), gold(), Math.cos(a) * .145, .3, Math.sin(a) * .145), M(new T.SphereGeometry(.022, 10, 8), gold(), Math.cos(a) * .145, .37, Math.sin(a) * .145)); }
      for (let i = 0; i < 6; i++) { const a = (i + .5) / 6 * Math.PI * 2; parts.push(M(new T.SphereGeometry(.022, 10, 8), mat(i % 2 ? '#d22a3c' : '#2a7be0', { metalness: .3, roughness: .1 }), Math.cos(a) * .15, .19, Math.sin(a) * .15)); }
      return parts;
    }
    if (kind === 'piggy') { // cofrinho
      const body = M(new T.SphereGeometry(.17, 32, 24), m, 0, .2, 0); body.scale.set(1.25, 1, 1);
      const snout = M(new T.CylinderGeometry(.06, .065, .06, 20), m, .22, .2, 0); snout.rotation.z = Math.PI / 2;
      const parts = [body, snout, M(new T.BoxGeometry(.1, .012, .025), gold(), 0, .37, 0)];
      for (const z of [.07, -.07]) parts.push(M(new T.ConeGeometry(.04, .07, 12), m, .12, .35, z));
      for (const [x, z] of [[.1, .08], [-.1, .08], [.1, -.08], [-.1, -.08]]) parts.push(M(new T.CylinderGeometry(.035, .035, .08, 12), m, x, .04, z));
      for (const z of [.02, -.02]) parts.push(M(new T.SphereGeometry(.01, 8, 6), dark, .253, .2, z));
      return parts;
    }
    if (kind === 'diamond') { // brilhante lapidado sobre garras douradas
      const prof = [[0, .06], [.2, .3], [.22, .33], [.15, .42], [0, .43]].map(([x, y]) => new T.Vector2(x, y));
      const gem = M(new T.LatheGeometry(prof, 10), lacquer(m.color, { flatShading: true, roughness: .05, clearcoat: 1, metalness: .1, transparent: true, opacity: .92 }));
      const parts = [gem, M(new T.CylinderGeometry(.09, .12, .06, 24), gold(), 0, .03, 0)];
      for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + .4, pr = M(new T.BoxGeometry(.02, .26, .02), gold(), Math.cos(a) * .12, .17, Math.sin(a) * .12); pr.rotation.z = Math.cos(a) * -.6; pr.rotation.x = Math.sin(a) * .6; parts.push(pr); }
      return parts;
    }
    // clássico: peão de laca com frisos dourados
    const prof = [[0, 0], [.23, 0], [.24, .018], [.236, .044], [.205, .058], [.208, .074], [.155, .098], [.112, .158], [.087, .29], [.082, .34], [.132, .366], [.138, .392], [.084, .414], [0, .414]].map(([x, y]) => new T.Vector2(x, y));
    const body = new T.Mesh(new T.LatheGeometry(prof, 56), m);
    const head = new T.Mesh(new T.SphereGeometry(.13, 40, 26), m); head.position.y = .53;
    const band = new T.Mesh(new T.TorusGeometry(.207, .013, 10, 56), gold()); band.rotation.x = Math.PI / 2; band.position.y = .066;
    const collar = new T.Mesh(new T.TorusGeometry(.135, .011, 10, 48), gold()); collar.rotation.x = Math.PI / 2; collar.position.y = .39;
    return [body, head, band, collar];
  }

  // fachadas: janelas com moldura e vidro; o mapa de emissão acende algumas janelas (brilham com o bloom)
  function facade(cols, rows, wall = '#f3ead6', glass = '#5d8fd0', o = {}) {
    const key = [cols, rows, wall, glass, o.door ? 1 : 0].join('|'); if (texCache[key]) return texCache[key];
    const lit = Array.from({ length: cols * rows }, () => Math.random() < .55);
    const draw = em => (ctx, w, h) => {
      ctx.fillStyle = em ? '#000' : wall; ctx.fillRect(0, 0, w, h);
      if (!em) { ctx.fillStyle = 'rgba(0,0,0,.05)'; for (let y = 0; y < h; y += 16) ctx.fillRect(0, y, w, 2); }
      const pw = w / cols, ph = h / rows;
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        if (o.door && r === rows - 1 && c === Math.floor(cols / 2)) continue;
        const x = c * pw + pw * .22, y = r * ph + ph * .2, ww = pw * .56, hh = ph * .56;
        if (em) { if (lit[r * cols + c]) { ctx.fillStyle = '#ffd27a'; ctx.fillRect(x, y, ww, hh); } continue; }
        ctx.fillStyle = '#ffffff'; ctx.fillRect(x - 4, y - 4, ww + 8, hh + 10);
        const g = ctx.createLinearGradient(0, y, 0, y + hh); g.addColorStop(0, '#d8efff'); g.addColorStop(1, glass);
        ctx.fillStyle = g; ctx.fillRect(x, y, ww, hh);
        ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.fillRect(x + ww / 2 - 1.5, y, 3, hh); ctx.fillRect(x, y + hh / 2 - 1.5, ww, 3);
        ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(x - 4, y + hh + 2, ww + 8, 4);
      }
    };
    const map = canvasTex(256, 256, draw(false)), emi = canvasTex(256, 256, draw(true));
    return (texCache[key] = new T.MeshStandardMaterial({ map, emissiveMap: emi, emissive: 0xffc070, emissiveIntensity: .55, roughness: .7 }));
  }
  function box(w, h, d, material, x = 0, y = 0, z = 0) { const m = new T.Mesh(new T.BoxGeometry(w, h, d), material); m.position.set(x, y + h / 2, z); return m; }
  function roof(w, rh, d, material, y) { // telhado de duas águas com beiral
    const s = new T.Shape(); s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(0, rh); s.closePath();
    const geo = new T.ExtrudeGeometry(s, { depth: d, bevelEnabled: true, bevelThickness: .006, bevelSize: .006, bevelSegments: 1 }); geo.translate(0, 0, -d / 2);
    const m = new T.Mesh(geo, material); m.position.y = y; return m;
  }
  function bush(x, z, s = 1) { const g = new T.Group(), m = mat('#3f9b4a', { roughness: .9 }); [[0, 0, .05], [.035, .01, .038], [-.035, .005, .036]].forEach(([dx, dy, r]) => { const b = new T.Mesh(new T.SphereGeometry(r * s, 12, 10), m); b.position.set(x + dx * s, r * s + dy, z); g.add(b); }); return g; }
  function tree(x, z, s = 1) { const g = new T.Group(); g.add(box(.025 * s, .09 * s, .025 * s, mat('#7a4a2a'), x, 0, z)); const c = new T.Mesh(new T.ConeGeometry(.07 * s, .16 * s, 10), mat('#2f8a42', { roughness: .85 })); c.position.set(x, .16 * s, z); g.add(c); return g; }
  function buildingModel(level, groupColor) {
    const g = new T.Group(), white = mat('#ffffff', { roughness: .5 }), dark = mat('#3a2614'), roofM = mat(groupColor, { roughness: .45 }), stone = mat('#cfc6b6', { roughness: .9 });
    const door = (x, z, h = .11, w = .07) => { const d = new T.Group(); d.add(box(w, h, .02, mat('#6b3e1f', { roughness: .6 }), x, 0, z)); const k = new T.Mesh(new T.SphereGeometry(.007, 8, 6), gold()); k.position.set(x + w * .3, h * .5, z + .012); d.add(k); return d; };
    if (level === 1) { // Casa
      g.add(box(.42, .025, .38, stone, 0, 0, 0));
      g.add(box(.32, .2, .27, [facade(2, 1), facade(2, 1), white, white, facade(2, 1, undefined, undefined, { door: true }), facade(2, 1)], 0, .025, 0));
      g.add(roof(.42, .16, .35, roofM, .225), box(.05, .12, .05, mat('#a0522d'), .1, .3, -.05), door(0, .146, .11).translateY(.025));
      g.add(bush(-.15, .17), bush(.16, .17, .8), box(.06, .006, .07, stone, 0, .025, .18));
    } else if (level === 2) { // Sobrado
      g.add(box(.42, .025, .38, stone));
      const f = facade(2, 2), fd = facade(2, 2, undefined, undefined, { door: true });
      g.add(box(.32, .36, .28, [f, f, white, white, fd, f], 0, .025, 0), roof(.42, .17, .36, roofM, .385));
      g.add(box(.34, .02, .1, white, 0, .2, .18)); for (let k = -3; k <= 3; k++) g.add(box(.008, .05, .008, white, k * .05, .22, .225)); g.add(box(.34, .008, .008, white, 0, .27, .225));
      g.add(door(0, .15).translateY(.025), bush(.16, .17, .8), tree(-.17, .14, .9));
    } else if (level === 3) { // Mansão
      g.add(box(.7, .025, .44, stone));
      const f = facade(3, 2, '#fbf3e4'), fw = facade(1, 2, '#fbf3e4');
      g.add(box(.42, .3, .28, [f, f, white, white, f, f], 0, .025, -.02), roof(.5, .15, .34, roofM, .325).translateZ(-.02));
      g.add(box(.15, .22, .24, [fw, fw, white, white, fw, fw], -.29, .025, -.02), box(.15, .22, .24, [fw, fw, white, white, fw, fw], .29, .025, -.02));
      g.add(roof(.19, .08, .28, roofM, .245).translateX(-.29).translateZ(-.02), roof(.19, .08, .28, roofM, .245).translateX(.29).translateZ(-.02));
      for (const x of [-.15, -.05, .05, .15]) { const col = new T.Mesh(new T.CylinderGeometry(.016, .018, .25, 12), white); col.position.set(x, .15, .15); g.add(col); }
      g.add(box(.4, .03, .09, white, 0, .275, .14), roof(.4, .07, .06, white, .305).translateZ(.14));
      g.add(box(.18, .02, .06, stone, 0, .025, .2), door(0, .125, .14, .08).translateY(.025));
      g.add(box(.18, .05, .05, mat('#3f9b4a', { roughness: .9 }), -.22, .025, .19), box(.18, .05, .05, mat('#3f9b4a', { roughness: .9 }), .22, .025, .19));
      const ft = new T.Mesh(new T.CylinderGeometry(.05, .055, .03, 20), stone); ft.position.set(0, .04, .3); g.add(ft);
      const water = new T.Mesh(new T.CircleGeometry(.043, 20), mat('#5ec8ff', { emissive: 0x2a8ad0, emissiveIntensity: .6, roughness: .1 })); water.rotation.x = -Math.PI / 2; water.position.set(0, .056, .3); g.add(water);
    } else if (level === 4) { // Prédio
      g.add(box(.42, .025, .42, stone));
      const f = facade(3, 7, '#e9e4dc', '#4d7fbf'), fd = facade(3, 7, '#e9e4dc', '#4d7fbf', { door: true });
      g.add(box(.32, .8, .32, [f, f, mat('#bdb5aa'), white, fd, f], 0, .025, 0), box(.35, .03, .35, roofM, 0, .825, 0), box(.24, .08, .24, f, 0, .855, 0), box(.27, .02, .27, roofM, 0, .935, 0));
      const tank = new T.Mesh(new T.CylinderGeometry(.045, .045, .07, 14), mat('#9a7a5a')); tank.position.set(.06, .99, -.05); g.add(tank);
      const ant = new T.Mesh(new T.CylinderGeometry(.004, .004, .2, 6), dark); ant.position.set(-.07, 1.05, .05); g.add(ant);
      const blink = new T.Mesh(new T.SphereGeometry(.012, 8, 6), mat('#ff3030', { emissive: 0xff2020, emissiveIntensity: 2 })); blink.position.set(-.07, 1.15, .05); g.add(blink); g.userData.blink = blink;
      g.add(box(.2, .015, .08, roofM, 0, .17, .2), door(0, .165, .12, .1).translateY(.025));
    } else if (level === 5) { // Hotel
      g.add(box(.5, .025, .5, stone));
      const fp = facade(4, 1, '#f6d9d0', '#4d79c4', { door: true }), ft = facade(3, 9, '#f6d9d0', '#4d79c4');
      g.add(box(.46, .18, .46, [fp, fp, white, white, fp, fp], 0, .025, 0), box(.48, .02, .48, gold(), 0, .205, 0));
      g.add(box(.34, .95, .34, [ft, ft, white, white, ft, ft], 0, .225, 0), box(.38, .04, .38, gold(), 0, 1.175, 0));
      const crown = new T.Mesh(new T.CylinderGeometry(.12, .16, .1, 20), gold()); crown.position.y = 1.265; g.add(crown);
      for (let k = 0; k < 6; k++) { const sp = new T.Mesh(new T.ConeGeometry(.026, .1, 8), gold()); const a = k / 6 * Math.PI * 2; sp.position.set(Math.cos(a) * .12, 1.36, Math.sin(a) * .12); g.add(sp); }
      // letreiro luminoso
      const signT = canvasTex(256, 64, (c, w, h) => { c.fillStyle = '#7a1408'; rr(c, 0, 0, w, h, 14); c.fill(); c.font = '400 46px "Lilita One"'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#ffe9a0'; c.fillText('HOTEL', w / 2, h / 2 + 2); });
      const sign = new T.Mesh(new T.PlaneGeometry(.3, .08), new T.MeshStandardMaterial({ map: signT, emissiveMap: signT, emissive: 0xffffff, emissiveIntensity: .8 }));
      sign.position.set(0, 1.05, .172); g.add(sign);
      g.add(box(.32, .02, .14, mat('#d9412f'), 0, .16, .29), door(0, .231, .14, .12).translateY(.025));
      const pole = new T.Mesh(new T.CylinderGeometry(.005, .005, .22, 6), white); pole.position.set(.14, 1.32, .14); g.add(pole);
      const flag = new T.Mesh(new T.PlaneGeometry(.1, .06), mat(groupColor, { side: T.DoubleSide })); flag.position.set(.19, 1.4, .14); g.add(flag); g.userData.flag = flag;
      g.add(tree(-.2, .21, .8), tree(.2, .21, .8));
    }
    return shadowy(g);
  }
  function starModel() {
    const s = new T.Shape();
    for (let k = 0; k < 10; k++) { const r = k % 2 ? .1 : .24, a = k / 10 * Math.PI * 2 - Math.PI / 2; k ? s.lineTo(Math.cos(a) * r, Math.sin(a) * r) : s.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
    const geo = new T.ExtrudeGeometry(s, { depth: .06, bevelEnabled: true, bevelSize: .015, bevelThickness: .015, bevelSegments: 3 }); geo.center();
    const m = new T.Mesh(geo, mat('#f3b733', { metalness: .85, roughness: .18, emissive: 0x7036a8, emissiveIntensity: .5 }));
    const g = new T.Group(); g.add(m); g.userData.star = m;
    const halo = new T.Sprite(new T.SpriteMaterial({ map: glowTex(), color: 0xb47cff, transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: .7 })); halo.scale.set(1.1, 1.1, 1); g.add(halo); g.userData.halo = halo;
    const lab = new T.Sprite(new T.SpriteMaterial({ map: canvasTex(128, 64, () => { }), depthWrite: false })); lab.scale.set(.5, .25, 1); lab.position.y = -.32; g.add(lab); g.userData.label = lab;
    shadowy(g); halo.castShadow = false; return g;
  }
  function setStarLabel(level) {
    const tex = star.userData.label.material.map, c = tex.image, ctx = c.getContext('2d');
    ctx.clearRect(0, 0, 128, 64); ctx.fillStyle = '#7036a8'; rr(ctx, 8, 6, 112, 52, 26); ctx.fill(); ctx.strokeStyle = '#3a2614'; ctx.lineWidth = 5; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = '400 38px "Lilita One"'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(UPGRADE.label(level), 64, 34); tex.needsUpdate = true;
  }
  const PIPS = { 1: [[.5, .5]], 2: [[.27, .27], [.73, .73]], 3: [[.27, .27], [.5, .5], [.73, .73]], 4: [[.27, .27], [.73, .27], [.27, .73], [.73, .73]], 5: [[.27, .27], [.73, .27], [.5, .5], [.27, .73], [.73, .73]], 6: [[.27, .25], [.73, .25], [.27, .5], [.73, .5], [.27, .75], [.73, .75]] };
  const dieFace = n => canvasTex(256, 256, (ctx, w) => {
    const g = ctx.createRadialGradient(w * .35, w * .3, 10, w / 2, w / 2, w * .75); g.addColorStop(0, '#fffef9'); g.addColorStop(1, '#efe6d2');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, w);
    for (const [x, y] of PIPS[n]) {
      const r = n === 1 ? 30 : 22;
      ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.arc(x * w, y * w + 2, r + 2, 0, Math.PI * 2); ctx.fill();
      const pg = ctx.createRadialGradient(x * w - r * .3, y * w - r * .3, 1, x * w, y * w, r); pg.addColorStop(0, n === 1 ? '#ff5a48' : '#4a3424'); pg.addColorStop(1, n === 1 ? '#a01810' : '#120a05');
      ctx.fillStyle = pg; ctx.beginPath(); ctx.arc(x * w, y * w, r, 0, Math.PI * 2); ctx.fill();
    }
  });
  // cubo de cantos arredondados (mantém os grupos de material de cada face)
  function roundedBox(s, r, seg = 6) {
    const geo = new T.BoxGeometry(s, s, s, seg, seg, seg), p = geo.attributes.position, h = s / 2 - r, v = new T.Vector3(), inner = new T.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i); inner.set(Math.max(-h, Math.min(h, v.x)), Math.max(-h, Math.min(h, v.y)), Math.max(-h, Math.min(h, v.z)));
      v.sub(inner).normalize().multiplyScalar(r).add(inner); p.setXYZ(i, v.x, v.y, v.z);
    }
    geo.computeVertexNormals(); return geo;
  }
  // ordem dos materiais do BoxGeometry: +x, -x, +y, -y, +z, -z
  const FACE_VAL = [2, 5, 3, 4, 1, 6];
  const FACE_N = () => [new T.Vector3(1, 0, 0), new T.Vector3(-1, 0, 0), new T.Vector3(0, 1, 0), new T.Vector3(0, -1, 0), new T.Vector3(0, 0, 1), new T.Vector3(0, 0, -1)];
  function faceUpQuat(v, yaw) {
    const n = FACE_N()[FACE_VAL.indexOf(v)];
    const q = new T.Quaternion().setFromUnitVectors(n, new T.Vector3(0, 1, 0));
    return new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), yaw).multiply(q);
  }
  const DIE = CELL * .5;
  function coinModel() {
    if (!texCache.coinM) {
      const face = canvasTex(128, 128, (c, w) => { const g = c.createRadialGradient(45, 40, 6, 64, 64, 64); g.addColorStop(0, '#fff0a8'); g.addColorStop(1, '#c98a14'); c.fillStyle = g; c.fillRect(0, 0, w, w); c.strokeStyle = '#a8700c'; c.lineWidth = 7; c.beginPath(); c.arc(64, 64, 52, 0, 7); c.stroke(); c.fillStyle = '#9a650a'; c.font = '400 64px "Lilita One"'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('M', 64, 68); });
      const top = new T.MeshStandardMaterial({ map: face, metalness: .9, roughness: .28 });
      texCache.coinM = [mat('#e0a630', { metalness: 1, roughness: .3 }), top, top];
      texCache.coinG = new T.CylinderGeometry(.11, .11, .028, 28);
    }
    const m = new T.Mesh(texCache.coinG, texCache.coinM); m.castShadow = true; return m;
  }

  // ---------- partículas ----------
  const pointsVS = `attribute float size; attribute float alpha; attribute vec3 pcolor; varying vec3 vC; varying float vA; uniform float uScale;
    void main(){ vC=pcolor; vA=alpha; vec4 mv=modelViewMatrix*vec4(position,1.); gl_PointSize=size*uScale/-mv.z; gl_Position=projectionMatrix*mv; }`;
  const glowFS = `varying vec3 vC; varying float vA; void main(){ float d=length(gl_PointCoord-.5); float a=smoothstep(.5,0.,d); float core=1.-smoothstep(0.,.12,d); gl_FragColor=vec4(vC*(a*a*.8+core*1.1)*vA,a*vA); }`;
  const dustFS = `varying vec3 vC; varying float vA; void main(){ float d=length(gl_PointCoord-.5); float a=smoothstep(.5,.05,d); gl_FragColor=vec4(vC,a*a*vA); }`;
  function particleSystem(cap, fs, blending) {
    const geo = new T.BufferGeometry();
    const P = new Float32Array(cap * 3), PC = new Float32Array(cap * 3), S = new Float32Array(cap), A = new Float32Array(cap);
    const V = new Float32Array(cap * 3), L = new Float32Array(cap), M = new Float32Array(cap), S0 = new Float32Array(cap), S1 = new Float32Array(cap);
    const C0 = new Float32Array(cap * 3), C1 = new Float32Array(cap * 3), G = new Float32Array(cap), D = new Float32Array(cap), A0 = new Float32Array(cap);
    for (const [n, a, k] of [['position', P, 3], ['pcolor', PC, 3], ['size', S, 1], ['alpha', A, 1]]) { const b = new T.BufferAttribute(a, k); b.setUsage(T.DynamicDrawUsage); geo.setAttribute(n, b); }
    const material = new T.ShaderMaterial({ uniforms: { uScale: { value: 300 } }, vertexShader: pointsVS, fragmentShader: fs, transparent: true, depthWrite: false, blending });
    const pts = new T.Points(geo, material); pts.frustumCulled = false; pts.renderOrder = 6;
    let head = 0, live = false; const tmp = new T.Vector3(), ca = new T.Color(), cb = new T.Color();
    function emit(o) {
      ca.set(o.color ?? 0xffffff); cb.set(o.color2 ?? o.color ?? 0xffffff);
      for (let k = 0; k < (o.n || 20); k++) {
        const i = head; head = (head + 1) % cap;
        if (o.shape === 'disc') { const a = Math.random() * Math.PI * 2; tmp.set(Math.cos(a), rand(0, o.up ?? .25), Math.sin(a)); }
        else { tmp.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)); if (tmp.lengthSq() > 1) tmp.normalize(); }
        if (o.dir) tmp.multiplyScalar(o.spread ?? .4).add(o.dir);
        tmp.normalize().multiplyScalar(rand(...(o.speed || [1, 3])));
        const r = o.radius || 0;
        P[i * 3] = o.pos.x + (r ? rand(-r, r) : 0); P[i * 3 + 1] = o.pos.y + (r && !o.flat ? rand(-r, r) : 0); P[i * 3 + 2] = o.pos.z + (r ? rand(-r, r) : 0);
        V[i * 3] = tmp.x; V[i * 3 + 1] = tmp.y; V[i * 3 + 2] = tmp.z;
        M[i] = L[i] = rand(...(o.life || [.5, 1])); const sz = o.size || [.2, 0]; S0[i] = sz[0] * rand(.6, 1.3); S1[i] = sz[1] * rand(.6, 1.3);
        C0.set([ca.r, ca.g, ca.b], i * 3); C1.set([cb.r, cb.g, cb.b], i * 3); G[i] = o.gravity ?? -2; D[i] = o.drag ?? 1.2; A0[i] = o.alpha ?? 1;
      }
      live = true;
    }
    function update(dt) {
      if (!live) return; let any = false;
      for (let i = 0; i < cap; i++) {
        if (L[i] <= 0) { A[i] = 0; continue; }
        any = true; L[i] -= dt; const k = 1 - Math.max(0, L[i]) / M[i], d = Math.exp(-D[i] * dt);
        V[i * 3] *= d; V[i * 3 + 1] = V[i * 3 + 1] * d + G[i] * dt; V[i * 3 + 2] *= d;
        P[i * 3] += V[i * 3] * dt; P[i * 3 + 1] += V[i * 3 + 1] * dt; P[i * 3 + 2] += V[i * 3 + 2] * dt;
        if (P[i * 3 + 1] < .03 && G[i] < 0) { P[i * 3 + 1] = .03; V[i * 3 + 1] *= -.3; V[i * 3] *= .6; V[i * 3 + 2] *= .6; }
        S[i] = S0[i] + (S1[i] - S0[i]) * k; A[i] = A0[i] * (k < .08 ? k / .08 : 1 - k ** 2.2);
        for (let j = 0; j < 3; j++) PC[i * 3 + j] = C0[i * 3 + j] + (C1[i * 3 + j] - C0[i * 3 + j]) * k;
      }
      for (const n of ['position', 'pcolor', 'size', 'alpha']) geo.attributes[n].needsUpdate = true;
      live = any;
    }
    return { pts, emit, update, material };
  }
  // confete de papel de verdade: pedacinhos girando e planando (malha instanciada)
  function confettiSystem(cap = 600) {
    const mesh = new T.InstancedMesh(new T.PlaneGeometry(.075, .045), new T.MeshStandardMaterial({ side: T.DoubleSide, roughness: .6, metalness: .15 }), cap);
    mesh.instanceMatrix.setUsage(T.DynamicDrawUsage); mesh.frustumCulled = false;
    const P = new Float32Array(cap * 3), V = new Float32Array(cap * 3), R = new Float32Array(cap * 3), W = new Float32Array(cap * 3), L = new Float32Array(cap), M = new Float32Array(cap);
    const o3 = new T.Object3D(), c = new T.Color(); let head = 0, live = false;
    o3.scale.setScalar(0); o3.updateMatrix(); for (let i = 0; i < cap; i++) { mesh.setMatrixAt(i, o3.matrix); mesh.setColorAt(i, c.set(0xffffff)); }
    function emit(o) {
      const cols = o.colors || ['#e5383b', '#f3b733', '#3fa34d', '#2f6db5', '#8e4ec6', '#ff8fb3'];
      for (let k = 0; k < (o.n || 60); k++) {
        const i = head; head = (head + 1) % cap; const a = Math.random() * Math.PI * 2, sp = rand(...(o.speed || [1.5, 4]));
        P.set([o.pos.x + rand(-.1, .1), o.pos.y, o.pos.z + rand(-.1, .1)], i * 3);
        V.set([Math.cos(a) * sp * (o.spread ?? .45), rand(.6, 1) * sp * (o.up ?? 1.2), Math.sin(a) * sp * (o.spread ?? .45)], i * 3);
        R.set([rand(0, 6), rand(0, 6), rand(0, 6)], i * 3); W.set([rand(-12, 12), rand(-8, 8), rand(-12, 12)], i * 3);
        M[i] = L[i] = rand(...(o.life || [2.2, 3.4])); mesh.setColorAt(i, c.set(cols[Math.floor(Math.random() * cols.length)]));
      }
      mesh.instanceColor.needsUpdate = true; live = true;
    }
    function update(dt) {
      if (!live) return; let any = false;
      for (let i = 0; i < cap; i++) {
        if (L[i] <= 0) continue;
        any = true; L[i] -= dt; const k = 1 - Math.max(0, L[i]) / M[i];
        const d = Math.exp(-2.4 * dt); V[i * 3] *= d; V[i * 3 + 2] *= d; V[i * 3 + 1] = V[i * 3 + 1] * Math.exp(-1.2 * dt) - 3.2 * dt;
        if (V[i * 3 + 1] < -.6) V[i * 3 + 1] = -.6 + Math.sin(L[i] * 9 + i) * .15; // plana como papel
        for (let j = 0; j < 3; j++) { P[i * 3 + j] += V[i * 3 + j] * dt; R[i * 3 + j] += W[i * 3 + j] * dt * (P[i * 3 + 1] > .04 ? 1 : 0); }
        if (P[i * 3 + 1] < .025) { P[i * 3 + 1] = .025; V[i * 3] = V[i * 3 + 2] = 0; R[i * 3] = -Math.PI / 2; R[i * 3 + 2] = 0; }
        o3.position.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]); o3.rotation.set(R[i * 3], R[i * 3 + 1], R[i * 3 + 2]); o3.scale.setScalar(L[i] <= 0 ? 0 : Math.min(1, (1 - k) * 4));
        o3.updateMatrix(); mesh.setMatrixAt(i, o3.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true; live = any;
    }
    return { mesh, emit, update };
  }
  // rastro em fita que segue um objeto
  function trail(obj, color, width = .12, len = 22) {
    const N = len, P = new Float32Array(N * 6), TA = new Float32Array(N * 2), idx = [];
    for (let i = 0; i < N - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(P, 3)); geo.setAttribute('ta', new T.BufferAttribute(TA, 1)); geo.setIndex(idx);
    const m = new T.ShaderMaterial({ uniforms: { uC: { value: new T.Color(color) }, uF: { value: 1 } }, transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide,
      vertexShader: 'attribute float ta; varying float vA; void main(){ vA=ta; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: 'uniform vec3 uC; uniform float uF; varying float vA; void main(){ float a=vA*vA; gl_FragColor=vec4(uC*(.8+a)*a*uF, a*uF); }' });
    const mesh = new T.Mesh(geo, m); mesh.frustumCulled = false; scene.add(mesh);
    const hist = [], wp = new T.Vector3(), sd = new T.Vector3(), dir = new T.Vector3(), tc = new T.Vector3();
    obj.getWorldPosition(wp); for (let i = 0; i < N; i++) hist.push(wp.clone());
    const tk = () => {
      obj.getWorldPosition(wp); hist.pop(); hist.unshift(wp.clone());
      for (let i = 0; i < N; i++) {
        const p = hist[i], q = hist[Math.min(N - 1, i + 1)]; dir.subVectors(p, q); if (dir.lengthSq() < 1e-8) dir.set(0, 0, 1);
        tc.subVectors(camera.position, p); sd.crossVectors(dir, tc).normalize().multiplyScalar(width * (1 - i / N));
        P.set([p.x + sd.x, p.y + sd.y, p.z + sd.z, p.x - sd.x, p.y - sd.y, p.z - sd.z], i * 6); TA[i * 2] = TA[i * 2 + 1] = 1 - i / N;
      }
      geo.attributes.position.needsUpdate = true; geo.attributes.ta.needsUpdate = true;
    };
    tickers.add(tk);
    return { end: () => { tickers.delete(tk); return tween(300, k => { m.uniforms.uF.value = 1 - k; if (k >= 1) { scene.remove(mesh); geo.dispose(); m.dispose(); } }); } };
  }

  // ---------- montagem da cena ----------
  // se já estiver carregando, reaproveita o mesmo carregamento (evita dois tabuleiros 3D)
  let mounting = null;
  function mount(container, h = {}) {
    handlers = h; wrap = container;
    if (mounted) { if (canvas.parentNode !== wrap) wrap.appendChild(canvas); if (fxLayer.parentNode !== wrap) wrap.appendChild(fxLayer); resize(); return Promise.resolve(); }
    return (mounting ||= build().finally(() => { mounting = null; })).then(() => { if (canvas.parentNode !== wrap) wrap.appendChild(canvas); resize(); });
  }
  async function build() {
    T = window.THREE;
    renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    maxDpr = Math.min(1.5, window.devicePixelRatio || 1); dpr = maxDpr;
    renderer.setPixelRatio(dpr);
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate = false; // sombras só são recalculadas quando algo se move (a câmera não precisa)
    canvas = renderer.domElement; canvas.className = 'gl3d'; wrap.appendChild(canvas);
    fxLayer = document.createElement('div'); fxLayer.className = 'fx3d'; wrap.appendChild(fxLayer);
    scene = new T.Scene(); scene.background = new T.Color(0x1d120b); scene.fog = new T.Fog(0x1d120b, 26, 60);
    camera = new T.PerspectiveCamera(36, 1, .1, 200); scene.add(camera);
    raycaster = new T.Raycaster();
    // reflexos: ambiente de uma sala aconchegante (luz quente de cima e janelas)
    const envS = new T.Scene(); envS.add(new T.Mesh(new T.BoxGeometry(30, 16, 30), new T.MeshBasicMaterial({ color: 0x1e150e, side: T.BackSide })));
    [[0, 7.5, 0, 0xfff1d8, 1.2, 8, 8], [-14, 4, 0, 0xffd9a0, .7, 5, 5], [14, 4, -4, 0xcfe2ff, .6, 5, 5], [0, 4, 14, 0xffe2b8, .5, 8, 4]].forEach(([x, y, z, c, k, w, h]) => {
      const m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ color: new T.Color(c).multiplyScalar(k), side: T.DoubleSide })); m.position.set(x, y, z); m.lookAt(0, 0, 0); envS.add(m);
    });
    const pm = new T.PMREMGenerator(renderer); scene.environment = pm.fromScene(envS, .04).texture; pm.dispose();
    scene.add(new T.HemisphereLight(0xfff4e0, 0x3a2614, .38));
    const sun = new T.DirectionalLight(0xfff1dc, .9); sun.position.set(5, 13, 7); sun.castShadow = true;
    Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 1, far: 40 }); sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -.0004; sun.shadow.radius = 3; scene.add(sun);
    const fill = new T.DirectionalLight(0xbcd4ff, .3); fill.position.set(-8, 6, -6); scene.add(fill);
    const lamp = new T.PointLight(0xffc98a, .25, 30, 1.5); lamp.position.set(0, 9, 0); scene.add(lamp);
    // fundo: a sala (só aparece com a câmera mais deitada)
    backdrop = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshBasicMaterial({ map: (() => { const t = new T.TextureLoader().load(IMG.lobby_bg); t.encoding = T.sRGBEncoding; return t; })(), color: 0x8a7a6a, fog: false, depthWrite: false }));
    backdrop.renderOrder = -1; camera.add(backdrop);
    // mesa de madeira
    const woodTex = new T.TextureLoader().load(IMG.bg_wood); woodTex.encoding = T.sRGBEncoding; woodTex.wrapS = woodTex.wrapT = T.RepeatWrapping; woodTex.repeat.set(3, 3); woodTex.anisotropy = 8;
    const table = new T.Mesh(new T.CircleGeometry(30, 64), new T.MeshStandardMaterial({ map: woodTex, roughness: .55, metalness: 0 })); tableRefs.table = table; tableRefs.wood = woodTex;
    table.rotation.x = -Math.PI / 2; table.position.y = -.3; table.receiveShadow = true; scene.add(table);
    // moldura do tabuleiro: madeira escura chanfrada com friso dourado
    const frameShape = new T.Shape(), hb = (B + .5) / 2; frameShape.moveTo(-hb, -hb); frameShape.lineTo(hb, -hb); frameShape.lineTo(hb, hb); frameShape.lineTo(-hb, hb); frameShape.closePath();
    const frameM = mat('#3d2414', { roughness: .45, map: woodTex }); tableRefs.frame = frameM;
    const base = new T.Mesh(new T.ExtrudeGeometry(frameShape, { depth: .2, bevelEnabled: true, bevelThickness: .06, bevelSize: .06, bevelSegments: 4 }), frameM);
    base.rotation.x = -Math.PI / 2; base.position.y = -.31; base.castShadow = base.receiveShadow = true; scene.add(base);
    const trim = new T.Mesh(new T.BoxGeometry(B + .14, .022, B + .14), gold()); trim.position.y = -.004; scene.add(trim); boardParts.push(base, trim);
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const cap = new T.Mesh(new T.CylinderGeometry(.13, .15, .05, 20), gold()); cap.position.set(x * (hb - .02), -.03, z * (hb - .02)); cap.castShadow = true; scene.add(cap); boardParts.push(cap); }
    boardTex = await drawBoard();
    const bumpTex = await drawBump();
    boardMesh = new T.Mesh(new T.PlaneGeometry(B, B), new T.MeshStandardMaterial({ map: boardTex, roughness: .6, bumpMap: bumpTex, bumpScale: .018 }));
    boardMesh.rotation.x = -Math.PI / 2; boardMesh.position.y = .012; boardMesh.receiveShadow = true; scene.add(boardMesh); boardParts.push(boardMesh);
    // baralhos (montinhos de cartas)
    for (const [deck, nx] of [['fortuna', .27], ['evento', .73]]) {
      const ct = new T.TextureLoader().load(deck === 'fortuna' ? IMG.card_fortuna : IMG.card_evento); ct.encoding = T.sRGBEncoding;
      const sideM = mat('#fbf6e6'), top = new T.MeshStandardMaterial({ map: ct, roughness: .45 });
      const pile = new T.Group(); pile.userData.deck = deck; pile.userData.tex = ct;
      for (let k = 0; k < 7; k++) { const c = new T.Mesh(new T.BoxGeometry(1.0, .022, 1.36), [sideM, sideM, top, sideM, sideM, sideM]); c.position.set(rand(-.02, .02), .011 + k * .024, rand(-.02, .02)); c.rotation.y = rand(-.04, .04); c.castShadow = c.receiveShadow = true; pile.add(c); }
      pile.position.copy(toW(nx, .77, .012)); pile.rotation.y = deck === 'fortuna' ? .14 : -.14; scene.add(pile);
    }
    // dados de cantos arredondados
    const faces = [1, 2, 3, 4, 5, 6].reduce((o, n) => (o[n] = dieFace(n), o), {}), dgeo = roundedBox(DIE, DIE * .16, 6);
    for (let k = 0; k < 2; k++) {
      const m = new T.Mesh(dgeo, FACE_VAL.map(v => new T.MeshPhysicalMaterial({ map: faces[v], roughness: .3, clearcoat: .7, clearcoatRoughness: .15 })));
      m.castShadow = m.receiveShadow = true; m.userData.die = true; scene.add(m); diceMeshes.push(m);
    }
    restDice(diceVals);
    star = starModel(); star.visible = false; star.traverse(m => { m.castShadow = false; }); scene.add(star);
    glow = particleSystem(3000, glowFS, T.AdditiveBlending); dust = particleSystem(800, dustFS, T.NormalBlending); confetti = confettiSystem(700);
    scene.add(dust.pts, glow.pts, confetti.mesh);
    // pós-processamento: realce de cor, vinheta e flash dos efeitos (sem bloom: deixava o tabuleiro claro leitoso) (se os scripts estiverem disponíveis)
    if (T.EffectComposer && T.ShaderPass) {
      const rt = new T.WebGLRenderTarget(2, 2, { type: T.HalfFloatType, minFilter: T.LinearFilter, magFilter: T.LinearFilter, format: T.RGBAFormat });
      composer = new T.EffectComposer(renderer, rt); composer.setPixelRatio(dpr);
      composer.addPass(new T.RenderPass(scene, camera));
      post = new T.ShaderPass({
        uniforms: { tDiffuse: { value: null }, uFlash: { value: 0 }, uFC: { value: new T.Color(1, 1, 1) } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
        fragmentShader: `uniform sampler2D tDiffuse; uniform float uFlash; uniform vec3 uFC; varying vec2 vUv;
          vec3 aces(vec3 x){ return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.); }
          void main(){ vec3 c=texture2D(tDiffuse,vUv).rgb; vec3 hi=max(c-.85,0.); c=min(c,.85)+hi/(1.+hi*2.5); float l=dot(c,vec3(.299,.587,.114)); c=mix(vec3(l),c,1.12);
            c+=uFC*uFlash*(.2+l*.8); vec2 d=vUv-.5; c*=mix(.72,1.,smoothstep(.9,.25,length(d*vec2(1.15,1.))));
            gl_FragColor=vec4(pow(max(c,0.),vec3(1./2.2)),1.); }`,
      });
      composer.addPass(post);
      renderer.toneMapping = T.NoToneMapping; renderer.outputEncoding = T.LinearEncoding;
    } else { renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1; renderer.outputEncoding = T.sRGBEncoding; }
    // pré-compila os shaders de todos os modelos para não engasgar quando o primeiro prédio/peão aparecer
    cornerDecor();
    const warm = new T.Group(); warm.position.y = -40;
    for (let l = 1; l <= 5; l++) warm.add(buildingModel(l, '#e5383b')); warm.add(pawnModel('#ffffff', null), coinModel());
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
    if (composer) composer.setSize(w, h);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    cam.r = 16.8 * Math.max(1, 1.2 / camera.aspect) * (cam.userZoom || 1);
    const sc = .65 * h * renderer.getPixelRatio() / (2 * Math.tan(camera.fov * Math.PI / 360));
    glow.material.uniforms.uScale.value = sc; dust.material.uniforms.uScale.value = sc;
    { const D = 70, hh = D * Math.tan(camera.fov * Math.PI / 360), hw = hh * camera.aspect, W = Math.max(hw * 2.1, hh * 2.2 * 1.75); backdrop.scale.set(W, W / 1.75, 1); backdrop.position.set(0, 0, -D); }
  }
  function placeCamera() {
    look.x += (lookTo.x - look.x) * .05; look.z += (lookTo.z - look.z) * .05;
    const a = cam.az * Math.PI / 180, p = cam.polar * Math.PI / 180;
    camera.position.set(look.x + cam.r * Math.sin(p) * Math.sin(a) + (Math.random() - .5) * shake, cam.r * Math.cos(p) + (Math.random() - .5) * shake, look.z - .55 + cam.r * Math.sin(p) * Math.cos(a));
    camera.lookAt(look.x, 0, look.z);
  }
  // a câmera acompanha de leve um ponto (peão andando, efeito) e depois volta ao centro
  function follow(v, ms = 1500, k = .28) { lookTo.x = v.x * k; lookTo.z = .55 + (v.z - .55) * k; clearTimeout(lookBack); lookBack = setTimeout(() => { lookTo.x = 0; lookTo.z = .55; }, ms); }
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

  function loop(t) { raf = requestAnimationFrame(loop); frame(t); }
  // avança quadro a quadro (testes: fotos de momentos exatos das animações)
  async function advance(ms) {
    cancelAnimationFrame(raf); let t = lastT || performance.now();
    for (let e = 0; e < ms; e += 1000 / 60) { t += 1000 / 60; frame(t); for (let i = 0; i < 12; i++) await null; }
  }
  function frame(t) {
    // qualidade adaptativa: se os quadros estiverem lentos, reduz a densidade de pixels (e volta a subir se sobrar folga)
    const dt = lastT ? t - lastT : 16; lastT = t;
    if (dt < 250) { frameAcc += dt; frameN++; }
    if (frameN >= 90) {
      const avg = frameAcc / frameN; frameAcc = 0; frameN = 0;
      if (avg > 24 && dpr > 1) { dpr = Math.max(1, dpr - .25); renderer.setPixelRatio(dpr); composer?.setPixelRatio(dpr); resize(); }
      else if (avg < 15 && dpr < maxDpr) { dpr = Math.min(maxDpr, dpr + .25); renderer.setPixelRatio(dpr); composer?.setPixelRatio(dpr); resize(); }
    }
    tickers.forEach(f => f(t));
    const sdt = Math.min(.05, dt / 1000);
    glow.update(sdt); dust.update(sdt); confetti.update(sdt);
    shake *= .86; flash *= .88;
    cam.az += (cam.azTo - cam.az) * Math.min(1, dt / 16 * .14); placeCamera();
    const s = t / 1000;
    for (const [id, g] of Object.entries(pawns)) {
      const isCur = id === curId && !moving.has(id), ring = g.userData.ring;
      if (ring.visible !== (id === curId)) { ring.visible = id === curId; shadowDirty = true; }
      if (ring.visible) { const p = .5 + Math.sin(s * 3.2) * .5; ring.userData.halo.material.opacity = .35 + p * .35; ring.userData.halo.scale.setScalar(.9 + p * .2); ring.rotation.y = s * .8; }
      g.userData.sprite.position.y = .95 + (isCur ? Math.abs(Math.sin(s * 3)) * .1 : Math.sin(s * 1.6 + g.id) * .015);
    }
    for (const g of decor) g.userData.tick?.(s);
    for (const b of Object.values(buildings)) {
      if (b.userData.blink) b.userData.blink.material.emissiveIntensity = Math.sin(s * 4) > .6 ? 3 : .2;
      if (b.userData.flag) b.userData.flag.rotation.y = Math.sin(s * 3 + b.id) * .35;
    }
    if (star.visible) { star.userData.star.rotation.y = s * 1.6; star.position.y = .95 + Math.sin(s * 2) * .06; star.userData.halo.material.opacity = .5 + Math.sin(s * 3) * .2; if (Math.random() < .08) glow.emit({ pos: star.position, n: 1, speed: [.1, .4], life: [.5, 1], size: [.1, 0], color: 0xd9b0ff, gravity: .3, radius: .2 }); }
    if (shadowDirty) { renderer.shadowMap.needsUpdate = true; shadowDirty = false; }
    if (composer) { post.uniforms.uFlash.value = flash; if (flashCol) post.uniforms.uFC.value = flashCol; composer.render(); }
    else renderer.render(scene, camera);
  }
  // mede o custo real de um quadro (força a GPU a terminar cada um) — ferramenta de diagnóstico
  function bench(n = 60) {
    if (!mounted) return null;
    const gl = renderer.getContext(), draw = () => (composer ? composer.render() : renderer.render(scene, camera));
    renderer.shadowMap.needsUpdate = true; draw(); gl.finish();
    let t0 = performance.now(); for (let k = 0; k < n; k++) { draw(); gl.finish(); } const plain = (performance.now() - t0) / n;
    t0 = performance.now(); for (let k = 0; k < n; k++) { renderer.shadowMap.needsUpdate = true; draw(); gl.finish(); } const withShadow = (performance.now() - t0) / n;
    return { msPorQuadro: +plain.toFixed(2), msComSombra: +withShadow.toFixed(2), dpr, tamanho: renderer.domElement.width + 'x' + renderer.domElement.height, chamadas: renderer.info.render.calls, triangulos: renderer.info.render.triangles };
  }
  function show(on) {
    active = !!on; if (!mounted) return;
    canvas.style.display = fxLayer.style.display = active ? '' : 'none';
    cancelAnimationFrame(raf); lastT = 0; if (active) { resize(); raf = requestAnimationFrame(loop); }
  }

  // ---------- sincronização com o estado ----------
  function slot(id) {
    const here = Object.keys(pos).filter(k => pos[k] === pos[id] && pawns[k]?.visible), n = here.length, k = here.indexOf(id);
    const c = centerN(pos[id]), w = toW(c.x, c.y);
    if (n > 1) { const a = k / n * Math.PI * 2, r = CELL * (n > 4 ? .3 : .24); w.x += Math.cos(a) * r; w.z += Math.sin(a) * r; }
    return w;
  }
  // os peões deslizam até o lugar novo (em vez de pular de posição)
  function layoutPawns() {
    if (flipping) return;
    for (const id of Object.keys(pawns)) if (!moving.has(id)) {
      const g = pawns[id], p = slot(id); p.y = .012;
      if (g.position.distanceTo(p) < .01 || !g.userData.placed) { g.position.copy(p); g.userData.placed = true; continue; }
      const a = g.position.clone(); tween(260, k => { if (!moving.has(id)) g.position.lerpVectors(a, p, smooth(k)); });
    }
    shadowDirty = true;
  }
  function sync(d) {
    shadowDirty = true;
    if (!mounted) return;
    if (d.table) setTable(d.table);
    // peões
    const ids = new Set(d.tokens.map(t => t.id));
    for (const id of Object.keys(pawns)) if (!ids.has(id)) { scene.remove(pawns[id]); delete pawns[id]; delete pos[id]; }
    for (const t of d.tokens) {
      const pk = t.color + t.img + (t.kind || 'classic');
      if (!pawns[t.id] || pawns[t.id].userData.key !== pk) {
        if (pawns[t.id]) scene.remove(pawns[t.id]);
        const g = pawnModel(t.color, t.img, t.kind); g.userData.key = pk; scene.add(g); pawns[t.id] = g;
      }
      if (!pawns[t.id].userData.dying) pawns[t.id].visible = !t.out;
      if (!moving.has(t.id)) pos[t.id] = t.pos;
      if (t.cur) curId = t.id;
    }
    if (!d.tokens.some(t => t.cur)) curId = null;
    layoutPawns();
    // donos, construções, hipotecas
    for (const p of d.props) {
      const i = p.tile, c = centerN(i), r = rectN(i), inw = inward(i);
      // marcador do dono: faixa colorida laqueada na borda externa
      if (p.ownerColor) {
        let o = owners[i];
        if (!o) {
          const horiz = side(i) === 'bottom' || side(i) === 'top';
          o = new T.Mesh(new T.BoxGeometry(horiz ? r.w * B * .86 : .1, .05, horiz ? .1 : r.h * B * .86), lacquer('#fff'));
          const w = toW(c.x, c.y); const off = (horiz ? r.h : r.w) * B * .44;
          o.position.set(w.x - inw.x * off, .037, w.z - inw.z * off); o.castShadow = true; scene.add(o); owners[i] = o;
          o.scale.set(.01, 1, .01); tween(450, k => { const e = backOut(k); o.scale.set(horiz ? e : 1, 1, horiz ? 1 : e); });
        }
        o.material.color.set(p.ownerColor);
      } else if (owners[i]) { const o = owners[i]; delete owners[i]; tween(300, k => { o.scale.setScalar(1 - k); if (k >= 1) scene.remove(o); }); }
      // edifício do nível
      const lvl = p.ownerColor ? p.houses : 0, b = buildings[i];
      if (lvl > 0 && (!b || b.userData.level !== lvl)) {
        if (b) sinkAway(b);
        const g = buildingModel(lvl, GROUPS[TILES[i].group].color); g.userData.level = lvl;
        const w = toW(c.x, c.y); g.position.set(w.x + inw.x * CELL * .3, .012, w.z + inw.z * CELL * .3); g.rotation.y = outwardYaw(i);
        scene.add(g); buildings[i] = g; riseUp(g);
      } else if (!lvl && b) { sinkAway(b); delete buildings[i]; }
      // hipoteca
      if (p.mortgaged && !morts[i]) {
        const tex = canvasTex(256, 256, (ctx, w) => { ctx.fillStyle = 'rgba(40,20,10,.55)'; ctx.fillRect(0, 0, w, w); ctx.save(); ctx.translate(w / 2, w / 2); ctx.rotate(-Math.PI / 6); ctx.fillStyle = '#d9412f'; ctx.fillRect(-w, -26, w * 2, 52); ctx.fillStyle = '#fff'; ctx.font = '900 30px Nunito'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('HIPOTECADA', 0, 2); ctx.restore(); });
        const m = new T.Mesh(new T.PlaneGeometry(r.w * B, r.h * B), new T.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0 }));
        const w = toW(c.x, c.y, .02); m.position.copy(w); m.rotation.x = -Math.PI / 2; scene.add(m); morts[i] = m;
        tween(400, k => (m.material.opacity = k)); puff(w, 0x6b6b6b, 14);
      } else if (!p.mortgaged && morts[i]) { const m = morts[i]; delete morts[i]; tween(300, k => { m.material.opacity = 1 - k; if (k >= 1) scene.remove(m); }); }
    }
    // estrela do upgrade
    if (d.upgrade) {
      const w = tileW(d.upgrade.tile); if (!starFlying) { star.position.x = w.x; star.position.z = w.z; } star.visible = true;
      if (starLevel !== d.upgrade.level || starTile !== d.upgrade.tile) { setStarLabel(d.upgrade.level); starLevel = d.upgrade.level; starTile = d.upgrade.tile; }
    } else star.visible = false;
    if (d.dice && !rolling) restDice(d.dice);
  }
  // construção: o prédio sobe do chão com poeira e assenta com um quique
  function riseUp(g) {
    const p = g.position.clone(); g.scale.set(1, .01, 1);
    puff(p.clone().setY(.05), 0xc9b79a, 26, .4);
    tween(650, k => { const e = backOut(k); g.scale.set(1 + (1 - Math.min(1, e)) * .15, Math.max(.01, e), 1 + (1 - Math.min(1, e)) * .15); });
  }
  function sinkAway(g) { puff(g.position.clone().setY(.05), 0x9a8a7a, 18, .35); tween(380, k => { g.scale.set(1, Math.max(.01, 1 - easeIn(k)), 1); if (k >= 1) scene.remove(g); }); }
  function reset() {
    if (!mounted) return;
    for (const o of [...Object.values(pawns), ...Object.values(buildings), ...Object.values(owners), ...Object.values(morts)]) scene.remove(o);
    pawns = {}; pos = {}; buildings = {}; owners = {}; morts = {}; curId = null; moving.clear(); star.visible = false; starTile = -1;
  }

  // ---------- enfeites 3D das casas especiais (cantos) ----------
  const decor = [];
  function cornerDecor() {
    const M = (geo, mt, x = 0, y = 0, z = 0) => { const o = new T.Mesh(geo, mt); o.position.set(x, y, z); return o; };
    const white = mat('#f4efe6', { roughness: .4 }), dark = mat('#2a221c', { roughness: .5 }), stone = mat('#9c968c', { roughness: .85 });
    const metal = mat('#6c737b', { metalness: .8, roughness: .3 }), yellow = mat('#f3b733', { roughness: .45 });
    const glowM = c => new T.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: .2, roughness: .3 });
    const place = (i, g, scale = 1) => {
      const c = tileW(i), inw = inward(i); g.scale.setScalar(scale);
      g.position.set(c.x - inw.x * CELL * .62, .012, c.z - inw.z * CELL * .62); g.rotation.y = Math.atan2(inw.x, inw.z);
      shadowy(g); scene.add(g); boardParts.push(g); decor.push(g); return g;
    };
    // PARTIDA: arco de largada com faixa quadriculada e pilhas de moedas
    { const g = new T.Group();
      const chk = canvasTex(256, 64, (c, w, h) => { for (let x = 0; x < 16; x++) for (let y = 0; y < 4; y++) { c.fillStyle = (x + y) % 2 ? '#111' : '#fff'; c.fillRect(x * 16, y * 16, 16, 16); } });
      for (const x of [-.32, .32]) { g.add(M(new T.CylinderGeometry(.035, .04, .62, 14), white, x, .31, 0), M(new T.SphereGeometry(.05, 14, 10), gold(), x, .64, 0)); }
      const banner = M(new T.BoxGeometry(.72, .13, .03), [white, white, white, white, new T.MeshStandardMaterial({ map: chk, roughness: .5 }), new T.MeshStandardMaterial({ map: chk, roughness: .5 })], 0, .55, 0); g.add(banner);
      const flag = M(new T.PlaneGeometry(.2, .13, 6, 1), new T.MeshStandardMaterial({ map: chk, side: T.DoubleSide, roughness: .6 }), .12, .72, 0); flag.userData.wave = true; g.add(flag, M(new T.CylinderGeometry(.008, .008, .26, 8), gold(), .02, .74, 0));
      for (const [x, n] of [[-.42, 4], [.44, 3], [.48, 2]]) for (let k = 0; k < n; k++) { const coin = coinModel(); coin.scale.setScalar(.45); coin.position.set(x, .015 + k * .028, x > 0 && n === 2 ? .14 : 0); g.add(coin); }
      g.userData.tick = s => { flag.rotation.y = Math.sin(s * 3) * .25; };
      place(0, g, .9);
    }
    // DELEGACIA: celinha com grades e giroflex azul
    { const g = new T.Group();
      g.add(M(new T.BoxGeometry(.62, .05, .5), stone, 0, .025, 0), M(new T.BoxGeometry(.62, .42, .05), stone, 0, .26, -.22), M(new T.BoxGeometry(.05, .42, .5), stone, -.29, .26, 0), M(new T.BoxGeometry(.05, .42, .5), stone, .29, .26, 0), M(new T.BoxGeometry(.68, .05, .56), dark, 0, .49, 0));
      for (let k = 0; k < 7; k++) g.add(M(new T.CylinderGeometry(.012, .012, .42, 8), metal, -.24 + k * .08, .26, .22));
      for (const y of [.12, .4]) g.add(M(new T.BoxGeometry(.56, .025, .025), metal, 0, y, .22));
      const lamp = M(new T.SphereGeometry(.05, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), glowM(0x2f7bff), 0, .52, 0); g.add(lamp, M(new T.CylinderGeometry(.06, .06, .02, 14), metal, 0, .52, 0));
      g.userData.tick = s => { lamp.material.emissiveIntensity = Math.sin(s * 6) > 0 ? 2.4 : .15; };
      place(10, g, .85);
    }
    // ATELIÊ DO ARQUITETO: prancheta com planta azul e um guindaste de obra que gira
    { const g = new T.Group();
      const plan = canvasTex(256, 192, (c, w, h) => { c.fillStyle = '#1f5fa8'; c.fillRect(0, 0, w, h); c.strokeStyle = 'rgba(255,255,255,.85)'; c.lineWidth = 2; c.strokeRect(18, 18, w - 36, h - 36); c.strokeRect(40, 40, 90, 70); c.strokeRect(130, 40, 70, 110); c.beginPath(); c.moveTo(40, 110); c.lineTo(130, 150); c.stroke(); c.lineWidth = 1; c.strokeStyle = 'rgba(255,255,255,.3)'; for (let x = 0; x < w; x += 16) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); } });
      const desk = new T.Group();
      for (const [x, z] of [[-.17, -.11], [.17, -.11], [-.17, .11], [.17, .11]]) desk.add(M(new T.CylinderGeometry(.012, .012, .3, 8), dark, x, .15, z));
      const board = M(new T.BoxGeometry(.42, .02, .3), [white, white, new T.MeshStandardMaterial({ map: plan, roughness: .6 }), white, white, white], 0, .33, 0); board.rotation.x = .35; desk.add(board);
      const lampArm = M(new T.CylinderGeometry(.008, .008, .22, 6), metal, .2, .44, -.1); lampArm.rotation.z = -.5; const shade = M(new T.ConeGeometry(.045, .06, 14, 1, true), yellow, .25, .54, -.1);
      desk.add(lampArm, shade); desk.position.set(-.18, 0, .08); g.add(desk);
      const crane = new T.Group(); crane.position.set(.26, 0, -.12);
      const stripes = canvasTex(32, 256, (c, w, h) => { c.fillStyle = '#f3b733'; c.fillRect(0, 0, w, h); c.strokeStyle = '#3a2a10'; c.lineWidth = 3; for (let y = 0; y < h; y += 22) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y + 22); c.stroke(); c.beginPath(); c.moveTo(w, y); c.lineTo(0, y + 22); c.stroke(); } });
      const yl = new T.MeshStandardMaterial({ map: stripes, roughness: .5 });
      crane.add(M(new T.BoxGeometry(.12, .02, .12), stone, 0, .01, 0), M(new T.BoxGeometry(.05, .8, .05), yl, 0, .41, 0));
      const jib = new T.Group(); jib.position.y = .82;
      jib.add(M(new T.BoxGeometry(.06, .07, .06), yellow, 0, .02, 0), M(new T.BoxGeometry(.5, .03, .035), yl, .17, .06, 0), M(new T.BoxGeometry(.1, .05, .06), stone, -.12, .04, 0));
      const cable = M(new T.CylinderGeometry(.004, .004, .3, 4), dark, .36, -.09, 0), hook = M(new T.BoxGeometry(.06, .05, .06), mat('#d24a2a'), .36, -.26, 0);
      jib.add(cable, hook); crane.add(jib); g.add(crane);
      g.userData.tick = s => { jib.rotation.y = Math.sin(s * .35) * 1.2; hook.position.y = -.26 + Math.sin(s * .9) * .04; };
      place(20, g, .9);
    }
    // VÁ PARA A DELEGACIA: viatura com giroflex vermelho e azul + cone
    { const g = new T.Group();
      const body = M(new T.BoxGeometry(.56, .12, .27), mat('#1d2c4f', { roughness: .35, metalness: .2 }), 0, .1, 0), door = M(new T.BoxGeometry(.24, .1, .275), white, .02, .1, 0);
      const cab = M(new T.BoxGeometry(.28, .1, .24), mat('#1d2c4f', { roughness: .35 }), -.03, .21, 0), glass = M(new T.BoxGeometry(.29, .07, .245), mat('#9fd0ff', { metalness: .2, roughness: .05, transparent: true, opacity: .75 }), -.03, .215, 0);
      g.add(body, door, cab, glass);
      for (const [x, z] of [[.18, .13], [-.18, .13], [.18, -.13], [-.18, -.13]]) { const w = M(new T.CylinderGeometry(.06, .06, .05, 18), dark, x, .06, z); w.rotation.x = Math.PI / 2; g.add(w); }
      const red = M(new T.BoxGeometry(.08, .04, .1), glowM(0xff2020), -.07, .28, 0), blue = M(new T.BoxGeometry(.08, .04, .1), glowM(0x2f6bff), .01, .28, 0);
      g.add(red, blue, M(new T.BoxGeometry(.18, .015, .12), metal, -.03, .258, 0));
      for (const z of [.07, -.07]) g.add(M(new T.SphereGeometry(.02, 10, 8), glowM(0xfff4c0), .285, .11, z));
      const cone = new T.Group(); cone.add(M(new T.ConeGeometry(.06, .2, 18), mat('#ff6a1a', { roughness: .5 }), 0, .1, 0), M(new T.CylinderGeometry(.045, .055, .03, 18), white, 0, .1, 0), M(new T.BoxGeometry(.14, .015, .14), mat('#ff6a1a'), 0, .008, 0)); cone.position.set(.36, 0, .2); g.add(cone);
      g.rotation.y = .3;
      g.userData.tick = s => { const on = Math.floor(s * 6) % 2; red.material.emissiveIntensity = on ? 2.6 : .1; blue.material.emissiveIntensity = on ? .1 : 2.6; };
      place(30, g, .95);
    }
  }
  // ---------- abertura: câmera desce do alto, enfeites sobem e os peões caem no tabuleiro ----------
  async function introFx() {
    const end = { az: cam.azTo, polar: cam.polar, r: cam.r };
    const st = { az: end.az + 140, polar: 6, r: end.r * 1.9 };
    decor.forEach((g, k) => { g.visible = false; setTimeout(() => { g.visible = true; riseUp(g); }, 900 + k * 220); });
    Object.values(pawns).forEach((g, k) => {
      const y0 = 4 + k * .5; g.position.y = y0;
      setTimeout(() => tween(520, q => { g.position.y = y0 * (1 - easeIn(q)) + .012; if (q >= 1) { puff(g.position.clone().setY(.03), 0xe8dcc4, 10, .25); ripple(g.position, 0xffffff, .6, 450); } }), 1500 + k * 180);
    });
    await tween(2600, k => { const e = smooth(k); cam.az = cam.azTo = st.az + (end.az - st.az) * e; cam.polar = st.polar + (end.polar - st.polar) * e; cam.r = st.r + (end.r - st.r) * e; });
    cam.az = cam.azTo = end.az; cam.polar = end.polar; cam.r = end.r;
  }

  // ---------- animações ----------
  // fn(k) com k de 0 a 1, chamada pelo próprio ciclo de renderização logo antes de desenhar o quadro
  function tween(ms, fn) {
    return new Promise(res => {
      let t0 = null, fin = false;
      const finish = () => { if (fin) return; fin = true; tickers.delete(tk); try { fn(1); } catch (e) { console.warn(e); } shadowDirty = true; res(); };
      const tk = now => { if (fin) return; if (t0 === null) t0 = now; const k = Math.min(1, (now - t0) / ms); try { fn(k); } catch (e) { console.warn(e); return finish(); } shadowDirty = true; if (k >= 1) finish(); };
      tickers.add(tk);
      setTimeout(finish, ms + 250); // garantia se a aba congelar
      if (!active) finish();
    });
  }
  // ---- efeitos básicos ----
  function puff(p, color = 0xd8c8a8, n = 16, r = .25) { dust.emit({ pos: p, n, shape: 'disc', up: .25, speed: [.3, 1.1], life: [.5, 1], size: [.25, .55], color, gravity: .15, drag: 3, alpha: .55, radius: r * .3, flat: true }); }
  function ripple(p, color = 0xffffff, maxR = 1.2, ms = 600) {
    const m = new T.Mesh(new T.PlaneGeometry(2, 2), new T.ShaderMaterial({
      uniforms: { uR: { value: 0 }, uC: { value: new T.Color(color) }, uA: { value: 1 } }, transparent: true, depthWrite: false, blending: T.AdditiveBlending,
      vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: 'uniform float uR,uA; uniform vec3 uC; varying vec2 vUv; void main(){ float d=length(vUv-.5)*2.; float r=smoothstep(uR*.7,uR,d)*smoothstep(uR+.03,uR,d); gl_FragColor=vec4(uC*r*1.5*uA,r*uA); }',
    }));
    m.position.copy(p).setY(.03); m.rotation.x = -Math.PI / 2; m.scale.setScalar(maxR); scene.add(m);
    return tween(ms, k => { m.material.uniforms.uR.value = easeOut(k) * .95; m.material.uniforms.uA.value = 1 - k; if (k >= 1) { scene.remove(m); m.geometry.dispose(); m.material.dispose(); } });
  }
  function beam(p, color, h = 3, w = .45, ms = 1100) { // coluna de luz sobre uma casa
    const m = new T.Mesh(new T.CylinderGeometry(w, w * .8, h, 28, 1, true), new T.ShaderMaterial({
      uniforms: { uC: { value: new T.Color(color) }, uA: { value: 0 } }, transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide,
      vertexShader: 'varying vec2 vUv; varying vec3 vN,vV; void main(){ vUv=uv; vN=normalize(normalMatrix*normal); vec4 mv=modelViewMatrix*vec4(position,1.); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }',
      fragmentShader: 'uniform vec3 uC; uniform float uA; varying vec2 vUv; varying vec3 vN,vV; void main(){ float f=pow(abs(dot(vN,vV)),1.6); float a=f*(1.-vUv.y)*smoothstep(0.,.08,vUv.y)*uA; gl_FragColor=vec4(uC*a*1.6,a); }',
    }));
    m.position.copy(p).setY(h / 2); scene.add(m);
    return tween(ms, k => { m.material.uniforms.uA.value = k < .15 ? k / .15 : 1 - (k - .15) / .85; m.scale.set(1 + k * .2, 1, 1 + k * .2); if (k >= 1) { scene.remove(m); m.geometry.dispose(); m.material.dispose(); } });
  }
  function lightPulse(p, color, power = 3, ms = 700, dist = 6) { const l = new T.PointLight(color, power, dist, 1.6); l.position.copy(p); scene.add(l); return tween(ms, k => { l.intensity = power * (1 - easeOut(k)); if (k >= 1) scene.remove(l); }); }
  function impact(color, f = .3, s = .15) { flash = Math.max(flash, f); flashCol = new T.Color(color); shake = Math.max(shake, s); }
  async function coinFly(from, to, n, { stagger = 80, h = 1.6, color = 0xffd56b } = {}) {
    const all = [];
    for (let i = 0; i < n; i++) all.push(wait(i * stagger).then(async () => {
      const c = coinModel(); scene.add(c);
      const a = from.clone().add(new T.Vector3(rand(-.15, .15), 0, rand(-.15, .15))), b = to.clone().add(new T.Vector3(rand(-.1, .1), 0, rand(-.1, .1))), hh = h * rand(.8, 1.2);
      const tr = trail(c, color, .04, 12);
      await tween(rand(520, 680), k => { const e = ease(k); c.position.lerpVectors(a, b, e); c.position.y = a.y + (b.y - a.y) * e + Math.sin(Math.PI * k) * hh; c.rotation.x = k * 12; c.rotation.z = k * 3; });
      scene.remove(c); tr.end(); SFX.coinPing?.(i);
      glow.emit({ pos: b, n: 6, speed: [.4, 1.2], life: [.2, .4], size: [.09, 0], color: 0xffe9a0, gravity: -3, shape: 'disc', up: .8 });
    }));
    await Promise.all(all);
  }
  const pawnPos = id => (pawns[id] ? pawns[id].position.clone() : new T.Vector3());
  const coinsFor = amount => Math.max(2, Math.min(8, Math.round(Math.log10(Math.max(10, Math.abs(amount))) * 1.6 - 5)));

  const restSpots = () => [toW(.44, .52, DIE / 2 + .012), toW(.56, .53, DIE / 2 + .012)];
  let rolling = false, starFlying = false;
  function restDice(vals) {
    diceVals = vals; if (flipping) return; diceRest = diceRest.length ? diceRest : restSpots();
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
      return { h: h0 + (h1 - h0) * e, g: g0 + (g1 - g0) * smooth(u) };
    };
    const dice = diceMeshes.map((m, k) => {
      const yaw = rand(-.5, .5); m.userData.yaw = yaw;
      const start = rest[k].clone().add(toCam.clone().multiplyScalar(rand(2.6, 3.4))).add(new T.Vector3(rand(-.4, .4), 0, rand(-.4, .4)));
      const axis = new T.Vector3(rand(-1, 1), rand(-.3, .3), rand(-1, 1)).normalize(), spin = rand(4, 6.5) * Math.PI;
      return { m, start, end: rest[k], qf: faceUpQuat(vals[k], yaw), axis, spin, delay: k * 60, hits: 0 };
    });
    SFX.shake();
    [[.28, 1], [.55, .6], [.7, .35], [.86, .18]].forEach(([o, v]) => { setTimeout(() => SFX.bounce(v, -.15), D * o); setTimeout(() => SFX.bounce(v * .85, .15), D * o + 60); });
    const BOUNCES = [.28, .55, .7];
    await tween(D + 60, k => {
      for (const d of dice) {
        const t = Math.max(0, Math.min(1, (k * (D + 60) - d.delay) / D)), s = sample(t);
        d.m.position.set(d.start.x + (d.end.x - d.start.x) * s.g, d.end.y + s.h * DIE * 2.2, d.start.z + (d.end.z - d.start.z) * s.g);
        const rem = 1 - Math.min(1, t / .88), q = new T.Quaternion().setFromAxisAngle(d.axis, d.spin * rem * rem * (3 - 2 * rem) * .9 + d.spin * rem * .1);
        d.m.quaternion.copy(d.qf).multiply(q);
        // poeirinha a cada quique na mesa
        while (d.hits < BOUNCES.length && t >= BOUNCES[d.hits]) { puff(d.m.position.clone().setY(.03), 0xe8dcc4, 8 - d.hits * 2, .15); if (!d.hits) ripple(d.m.position, 0xffffff, .5, 400); d.hits++; }
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
    if (dbl) {
      SFX.deal(); impact(0xffe08a, .25, .1);
      glow.emit({ pos: mid.clone().setY(.3), n: 60, speed: [1, 3], dir: new T.Vector3(0, 1, 0), spread: .8, life: [.6, 1.2], size: [.16, 0], color: 0xfff2b0, color2: 0xffb020, gravity: -2 });
      confetti.emit({ pos: mid.clone().setY(.3), n: 50, speed: [1.2, 2.6], colors: ['#f3b733', '#fff2b0', '#ffffff'] });
    } else SFX.click();
    await wait(small ? 450 : 650);
  }
  async function walk(id, from, steps) {
    const g = pawns[id]; if (!g) return;
    moving.add(id); pos[id] = from;
    const dir = Math.sign(steps), n = Math.abs(steps), col = g.userData.color || '#ffffff';
    const p0 = slot(id); g.position.set(p0.x, .012, p0.z);
    const pts = [p0];
    for (let k = 1; k <= n; k++) pts.push(tileW((from + dir * k + 400) % 40, .012));
    let hop = -1;
    await tween(n * FX.STEP, t => {
      const x = t * n, k = Math.min(n - 1, Math.floor(x)), u = t >= 1 ? 1 : x - k;
      if (k !== hop) {
        if (hop >= 0) { puff(pts[hop + 1].clone().setY(.03), 0xe8dcc4, 5, .1); }
        hop = k; SFX.step(k + 1); const tile = (from + dir * (k + 1) + 400) % 40; pos[id] = tile;
        follow(pts[k + 1], 1400, .25);
        if (tile === 0 && dir > 0) { ripple(pts[k + 1], 0x5fd35f, 1.6, 700); glow.emit({ pos: pts[k + 1].clone().setY(.3), n: 40, speed: [.8, 2], dir: new T.Vector3(0, 1, 0), spread: .7, life: [.6, 1], size: [.14, 0], color: 0xc8ffb0, color2: 0x3fa34d, gravity: -1 }); }
      }
      const a = pts[k], b = pts[k + 1], e = smooth(u);
      g.position.set(a.x + (b.x - a.x) * e, .012 + Math.sin(Math.PI * u) * .42, a.z + (b.z - a.z) * e);
      // abaixa antes de pular, estica no ar, achata ao tocar a casa
      const sy = u < .12 ? 1 - Math.sin(u / .12 * Math.PI) * .1 : u < .4 ? 1 + Math.sin((u - .12) / .28 * Math.PI) * .12 : u > .86 ? 1 - Math.sin((u - .86) / .14 * Math.PI) * .15 : 1;
      const sxz = 1 / Math.sqrt(sy); g.scale.set(sxz, sy, sxz);
      // inclina na direção do movimento
      const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz) || 1, tilt = Math.sin(Math.PI * u) * .16;
      g.rotation.set(tilt * dz / L, 0, -tilt * dx / L);
    });
    g.scale.set(1, 1, 1); g.rotation.set(0, 0, 0); pos[id] = (from + steps + 400) % 40;
    const end = pts[pts.length - 1];
    puff(end.clone().setY(.03), 0xe8dcc4, 14, .2); ripple(end, new T.Color(col).getHex(), 1, 550);
    moving.delete(id); SFX.land(); layoutPawns(); await wait(300);
  }
  async function jump(id, to) {
    const g = pawns[id]; if (!g) return;
    moving.add(id); SFX.jail();
    const a = g.position.clone(), b = tileW(to, .012), tr = trail(g, 0xff4040, .12, 18);
    // luzes de viatura piscando na delegacia
    const red = new T.PointLight(0xff2020, 0, 6, 1.5), blue = new T.PointLight(0x2050ff, 0, 6, 1.5); red.position.copy(b).setY(1.2).add(new T.Vector3(-.4, 0, 0)); blue.position.copy(b).setY(1.2).add(new T.Vector3(.4, 0, 0)); scene.add(red, blue);
    const siren = k => { const on = Math.floor(k * 14) % 2; red.intensity = on ? 3.5 : .3; blue.intensity = on ? .3 : 3.5; };
    follow(b, 1600, .3);
    await tween(850, t => { const e = ease(t); g.position.set(a.x + (b.x - a.x) * e, .012 + Math.sin(Math.PI * t) * 2.4, a.z + (b.z - a.z) * e); g.rotation.y = t * Math.PI * 4; siren(t); });
    g.rotation.y = 0; tr.end(); puff(b.clone().setY(.03), 0x9a9a9a, 18, .25); impact(0xff3030, .15, .2);
    // grades caindo em volta do peão
    const cage = new T.Group(), bar = mat('#555b66', { metalness: .9, roughness: .3 });
    for (let k = 0; k < 10; k++) { const a2 = k / 10 * Math.PI * 2, m = new T.Mesh(new T.CylinderGeometry(.015, .015, .9, 8), bar); m.position.set(Math.cos(a2) * .32, .45, Math.sin(a2) * .32); cage.add(m); }
    const ringT = new T.Mesh(new T.TorusGeometry(.32, .02, 8, 32), bar); ringT.rotation.x = Math.PI / 2; ringT.position.y = .9; cage.add(ringT);
    cage.position.copy(b).setY(2); scene.add(cage);
    tween(1500, k => siren(.5 + k));
    await tween(320, k => { cage.position.y = .012 + 2 * (1 - easeIn(k)); });
    impact(0x000000, 0, .15); SFX.land();
    pos[id] = to; moving.delete(id); layoutPawns();
    setTimeout(() => tween(400, k => { cage.position.y = .012 + easeIn(k) * 2; cage.traverse(o => o.material && (o.material.transparent = true, o.material.opacity = 1 - k)); if (k >= 1) { scene.remove(cage); scene.remove(red, blue); } }), 1100);
    await wait(150);
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
    const sp = project(tileW(tile, .3));
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

  // ---------- efeito visual de cada acontecimento do jogo (não bloqueia) ----------
  function fx(e, info = {}) {
    if (!mounted || !active || document.hidden) return;
    const colorOf = id => info.color?.(id) || '#ffffff';
    try {
      switch (e.k) {
        case 'turn': { const p = pawnPos(e.pid); if (pawns[e.pid]) { follow(p, 1300, .22); ripple(p, new T.Color(colorOf(e.pid)).getHex(), 1.3, 700); glow.emit({ pos: p.clone().setY(.2), n: 24, shape: 'disc', up: .6, speed: [.5, 1.4], life: [.5, .9], size: [.1, 0], color: 0xffe9a0, gravity: .5 }); } break; }
        case 'money': {
          const p = pawnPos(e.pid); if (!pawns[e.pid]) break;
          if (e.amount > 0) coinFly(p.clone().add(new T.Vector3(0, 2.2, 0)), p.clone().setY(.3), coinsFor(e.amount), { stagger: 60, h: .2 });
          else coinFly(p.clone().setY(.4), new T.Vector3(0, .3, .2), coinsFor(e.amount), { stagger: 60, h: 1.4, color: 0xffb070 });
          break;
        }
        case 'land': {
          const p = tileW(e.tile);
          if (e.kind === 'rent' && pawns[e.owner]) { const o = pawnPos(e.owner); coinFly(pawnPos(e.pid).setY(.4), o.setY(.4), coinsFor(e.amount) + 2, { stagger: 70, h: 1.8, color: 0xffd56b }); beam(o, new T.Color(colorOf(e.owner)).getHex(), 2.2, .35, 1000); }
          else if (e.kind === 'tax') { coinFly(pawnPos(e.pid).setY(.4), new T.Vector3(0, .3, .2), 5, { stagger: 70, h: 1.5, color: 0xff9a60 }); }
          else if (e.kind === 'start') { beam(p, 0x5fd35f, 3, .5, 1200); confetti.emit({ pos: p.clone().setY(.2), n: 50, colors: ['#3fa34d', '#9be37a', '#ffffff', '#f3b733'] }); }
          else if (e.kind === 'gotojail') { lightPulse(p.clone().setY(1), 0xff2020, 4, 600); }
          else if (e.kind === 'own') { glow.emit({ pos: p.clone().setY(.3), n: 30, dir: new T.Vector3(0, 1, 0), spread: .6, speed: [.5, 1.5], life: [.6, 1.1], size: [.12, 0], color: new T.Color(colorOf(e.pid)).getHex(), gravity: .4 }); }
          else if (e.kind === 'mortgaged') puff(p.clone().setY(.05), 0x7a7a7a, 20, .3);
          break;
        }
        case 'buy': case 'sold': {
          const p = tileW(e.tile), c = new T.Color(colorOf(e.pid)).getHex();
          beam(p, c, 3.2, .45, 1200); ripple(p, c, 1.5, 700); lightPulse(p.clone().setY(1), c, 3, 900);
          confetti.emit({ pos: p.clone().setY(.25), n: e.improve ? 40 : 70, colors: [colorOf(e.pid), '#f3b733', '#ffffff'] });
          if (e.k === 'sold') impact(0xffe08a, .2, .25);
          break;
        }
        case 'auction': { const p = tileW(e.tile); ripple(p, 0xf3b733, 2, 800); lightPulse(p.clone().setY(1.2), 0xffc040, 3, 700); impact(0xffe08a, .15, .2); break; }
        case 'build': { const p = tileW(e.tile); if (e.sell) puff(p.clone().setY(.05), 0x9a8a7a, 20, .3); else { glow.emit({ pos: p.clone().setY(.4), n: 30, speed: [.6, 1.8], life: [.4, .8], size: [.1, 0], color: 0xfff0c0, gravity: -2 }); ripple(p, 0xffffff, .9, 500); } break; }
        case 'soldback': { const p = tileW(e.tile); ripple(p, 0x2f6db5, 1.4, 700); coinFly(p.clone().setY(.3), pawnPos(e.pid).setY(.4), 4, { stagger: 70, h: 1.2, color: 0x7ab0ff }); break; }
        case 'upgrade': upgradeFx(e, colorOf); break;
        case 'free': { const p = pawnPos(e.pid); glow.emit({ pos: p.clone().setY(.4), n: 50, speed: [1, 2.5], life: [.5, 1], size: [.13, 0], color: 0xfff2b0, color2: 0xf3b733, gravity: -1.5 }); ripple(p, 0xf3b733, 1.2, 600); break; }
        case 'deal': { for (const g of Object.values(pawns)) if (g.visible) glow.emit({ pos: g.position.clone().setY(.5), n: 12, speed: [.4, 1], life: [.4, .8], size: [.1, 0], color: 0x9be37a, gravity: .3 }); break; }
        case 'card': {
          const pile = scene.children.find(o => o.userData.deck === e.deck); if (!pile) break;
          const card = new T.Mesh(new T.PlaneGeometry(1, 1.36), new T.MeshBasicMaterial({ map: pile.userData.tex, side: T.DoubleSide, transparent: true }));
          const p0 = pile.position.clone().setY(.2); card.position.copy(p0); card.rotation.x = -Math.PI / 2; scene.add(card);
          const halo = new T.Sprite(new T.SpriteMaterial({ map: glowTex(), color: e.deck === 'fortuna' ? 0x6dff8a : 0x6db0ff, transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: 0 })); scene.add(halo);
          tween(900, k => { const e2 = easeOut(k); card.position.set(p0.x, .2 + e2 * 1.4, p0.z); card.rotation.set(-Math.PI / 2 + e2 * Math.PI * .4, 0, e2 * Math.PI * 2); halo.position.copy(card.position); halo.scale.setScalar(2.4 * e2); halo.material.opacity = Math.sin(Math.PI * k) * .8; card.material.opacity = 1 - Math.max(0, k - .7) / .3; if (k >= 1) { scene.remove(card); scene.remove(halo); } });
          break;
        }
        case 'intro': introFx(); break;
        case 'bankrupt': {
          const g = pawns[e.pid]; if (!g) break; const p = g.position.clone();
          // o retrato fica cinza, o peão se despedaça e as moedas se espalham
          g.userData.sprite.material.color.setHex(0x777777);
          const col = new T.Color(g.userData.color || '#888');
          for (let i = 0; i < 16; i++) {
            const f = new T.Mesh(new T.TetrahedronGeometry(.04 + Math.random() * .05), lacquer(col)); f.position.copy(p).add(new T.Vector3(0, .25 + Math.random() * .3, 0)); f.castShadow = true; scene.add(f);
            const v = new T.Vector3((Math.random() - .5) * 2.4, 1.2 + Math.random() * 1.6, (Math.random() - .5) * 2.4), rs = new T.Vector3(Math.random() * 9, Math.random() * 9, Math.random() * 9);
            let last = 0; tween(1500, k => { const dt = (k - last) * 1.5; last = k; f.position.addScaledVector(v, dt); v.y -= 9.8 * dt; if (f.position.y < .03) { f.position.y = .03; v.multiplyScalar(.35); v.y = Math.abs(v.y) * .4; } f.rotation.x += rs.x * dt; f.rotation.z += rs.z * dt; if (k > .75) f.scale.setScalar(Math.max(.01, 1 - (k - .75) * 4)); if (k >= 1) scene.remove(f); });
          }
          for (let i = 0; i < 8; i++) { const c = coinModel(); c.position.copy(p).setY(.3); scene.add(c); const v = new T.Vector3((Math.random() - .5) * 2, 2 + Math.random(), (Math.random() - .5) * 2); let last = 0; tween(1300, k => { const dt = (k - last) * 1.3; last = k; c.position.addScaledVector(v, dt); v.y -= 9.8 * dt; c.rotation.x += dt * 12; if (k >= 1) scene.remove(c); }); }
          lightPulse(p.clone().setY(1), 0xff3020, 5, 900);
          g.userData.dying = true; moving.add(e.pid);
          dust.emit({ pos: p.clone().setY(.3), n: 40, dir: new T.Vector3(0, 1, 0), spread: .6, speed: [.3, 1.2], life: [1.2, 2], size: [.4, 1], color: 0x3a3a3a, gravity: .6, drag: 1.5, alpha: .7 });
          impact(0x000000, 0, .3);
          tween(1200, k => { g.rotation.z = easeIn(Math.min(1, k * 1.5)) * Math.PI / 2; g.position.y = .012 - Math.max(0, k - .6) * .5; if (k >= 1) { g.visible = false; g.rotation.z = 0; g.userData.dying = false; moving.delete(e.pid); } });
          break;
        }
        case 'win': {
          const p = pawnPos(e.pid); follow(p, 4000, .35);
          beam(p, 0xffd56b, 5, .6, 3000);
          for (let i = 0; i < 6; i++) setTimeout(() => {
            const at = p.clone().add(new T.Vector3(rand(-2, 2), rand(2.2, 3.4), rand(-2, 2))), cols = [0xff5a5a, 0xffd56b, 0x5fd35f, 0x6db0ff, 0xc77dff][i % 5];
            glow.emit({ pos: at, n: 90, speed: [1.5, 3.2], life: [.9, 1.5], size: [.12, 0], color: 0xffffff, color2: cols, gravity: -1.5, drag: 1.4 });
            lightPulse(at, cols, 3, 800); SFX.coinPing?.(i);
          }, i * 380);
          confetti.emit({ pos: p.clone().setY(.4), n: 160, speed: [2, 5], up: 1.6 });
          break;
        }
      }
    } catch (err) { console.warn('fx 3d', err); }
  }
  // a estrela do upgrade voa da casa antiga para a nova (vermelho se foi roubada)
  async function upgradeFx(e, colorOf) {
    const to = tileW(e.tile, .95), steal = !!e.stolenFrom, col = steal ? 0xff4040 : 0xb47cff;
    if (e.fromTile != null && e.fromTile !== e.tile && star) {
      const from = tileW(e.fromTile, .95); starFlying = true; star.visible = true;
      if (steal) { impact(0xff3030, .2, .25); ripple(tileW(e.fromTile), 0xff4040, 1.4, 700); }
      const tr = trail(star, col, .14, 24), mid = from.clone().lerp(to, .5).setY(3);
      await tween(900, k => { const e2 = ease(k), u = 1 - e2; star.position.set(u * u * from.x + 2 * u * e2 * mid.x + e2 * e2 * to.x, u * u * from.y + 2 * u * e2 * mid.y + e2 * e2 * to.y, u * u * from.z + 2 * u * e2 * mid.z + e2 * e2 * to.z); });
      tr.end(); starFlying = false;
    }
    beam(to, col, 3, .45, 1200); ripple(to, col, 1.4, 700);
    glow.emit({ pos: to, n: 70, speed: [1, 3], life: [.6, 1.2], size: [.14, 0], color: 0xffffff, color2: col, gravity: -1 });
    confetti.emit({ pos: to.clone().setY(.4), n: 50, colors: ['#8e4ec6', '#f3b733', '#ffffff', colorOf(e.pid)] });
  }

  // ---------- virar a mesa: o tabuleiro salta e cai de cabeça para baixo, as peças voam pela mesa e depois tudo volta ----------
  async function flip(pid) {
    if (!mounted || !active || flipping) return;
    flipping = true;
    try {
      const from = pawns[pid]?.visible ? pawns[pid].position.clone() : new T.Vector3(camera.position.x, 0, camera.position.z);
      const dir = new T.Vector3(-from.x, 0, -from.z); if (dir.lengthSq() < .01) dir.set(0, 0, -1); dir.normalize(); // de quem virou para o outro lado
      const axis = new T.Vector3(dir.z, 0, -dir.x).normalize(); // a borda de quem virou sobe primeiro
      const decks = scene.children.filter(o => o.userData.deck);
      const rigid = [...boardParts, ...Object.values(owners), ...Object.values(morts)];
      const loose = [...Object.entries(pawns).filter(([id, g]) => g.visible && !moving.has(id)).map(([, g]) => g), ...Object.values(buildings), ...diceMeshes, ...decks, ...(star.visible ? [star] : [])];
      const all = [...rigid, ...loose], saved = new Map(all.map(o => [o, { p: o.position.clone(), q: o.quaternion.clone() }]));
      // o tabuleiro gira em torno do próprio meio (assim cai de cabeça para baixo no mesmo lugar)
      const rig = new T.Group(); rig.position.set(0, -.18, 0); scene.add(rig); rigid.forEach(o => rig.attach(o));
      const FLOOR = -.3, bodies = loose.map(o => ({
        o, v: dir.clone().multiplyScalar(rand(1.5, 4.5)).add(new T.Vector3(rand(-1.6, 1.6), rand(4, 7.5), rand(-1.6, 1.6))),
        w: new T.Vector3(rand(-9, 9), rand(-6, 6), rand(-9, 9)), off: diceMeshes.includes(o) ? DIE / 2 : 0, wait: rand(0, .12),
      }));
      SFX.tableFlip?.(); impact(0xff7a3a, .25, 1.1); follow(new T.Vector3(0, 0, .55), 4500, 0);
      puff(from.clone().setY(.05), 0xd8c8a8, 30, .8);
      let last = 0, landed = false; const q0 = rig.quaternion.clone(), qa = new T.Quaternion(), tmpQ = new T.Quaternion();
      await tween(2600, k => {
        const t = k * 2.6, dt = Math.min(.05, t - last); last = t;
        // tabuleiro: salta, capota 180° e bate de volta na mesa
        const kb = Math.min(1, t / 1.15);
        rig.position.set(dir.x * Math.sin(Math.PI * kb) * 1.2, -.18 + Math.sin(Math.PI * kb) * 3.4, dir.z * Math.sin(Math.PI * kb) * 1.2);
        qa.setFromAxisAngle(axis, -Math.PI * smooth(kb)); rig.quaternion.copy(q0).premultiply(qa);
        rig.rotateZ(Math.sin(Math.PI * kb) * .15);
        if (kb >= 1 && !landed) { landed = true; impact(0x000000, 0, 1); SFX.land(); SFX.bounce?.(1, 0); puff(new T.Vector3(0, -.2, 0), 0xc9b79a, 60, 3); ripple(new T.Vector3(0, -.28, 0), 0xc9b79a, 7, 600); }
        // peças: arremessadas com gravidade, quicam e deslizam na mesa
        for (const b of bodies) {
          if (t < b.wait) continue;
          b.v.y -= 15 * dt; b.o.position.addScaledVector(b.v, dt);
          tmpQ.setFromEuler(new T.Euler(b.w.x * dt, b.w.y * dt, b.w.z * dt)); b.o.quaternion.multiply(tmpQ);
          const fl = FLOOR + b.off;
          if (b.o.position.y < fl) { b.o.position.y = fl; if (b.v.y < -1.5) { b.v.y *= -.35; puff(b.o.position.clone(), 0xd8c8a8, 3, .1); } else b.v.y = 0; b.v.x *= .7; b.v.z *= .7; b.w.multiplyScalar(.6); }
        }
      });
      await wait(900);
      // tudo volta para o lugar, puxado por um brilho dourado
      SFX.magic?.();
      rigid.forEach(o => scene.attach(o)); scene.remove(rig);
      const cur = all.map(o => ({ o, p: o.position.clone(), q: o.quaternion.clone() }));
      for (const c of cur.filter(c => loose.includes(c.o))) glow.emit({ pos: c.p, n: 6, speed: [.3, 1], life: [.4, .8], size: [.12, 0], color: 0xffe9a0, gravity: .5 });
      await tween(1300, k => {
        const e = ease(k);
        for (const c of cur) { const s = saved.get(c.o); c.o.position.lerpVectors(c.p, s.p, e); if (loose.includes(c.o)) c.o.position.y += Math.sin(Math.PI * k) * .8; c.o.quaternion.copy(c.q).slerp(s.q, e); }
      });
      for (const [o, s] of saved) { o.position.copy(s.p); o.quaternion.copy(s.q); }
      glow.emit({ pos: new T.Vector3(0, .3, 0), n: 80, shape: 'disc', up: .3, speed: [2, 5], life: [.5, 1], size: [.14, 0], color: 0xfff2b0, gravity: 0 });
    } catch (err) { console.warn('flip 3d', err); }
    finally { flipping = false; layoutPawns(); restDice(diceVals); shadowDirty = true; }
  }

  function supported() {
    if (!window.THREE) return false;
    try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
  }

  return {
    supported, mount, show, sync, reset, bench, rotate, setAzimuth, rollDice, walk, jump, floatMoney, stamp, deckRect, fx, flip,
    get active() { return active && mounted; }, get mounted() { return mounted; }, get dbg() { return { composer, post, renderer, scene, advance, resume: () => { cancelAnimationFrame(raf); lastT = 0; raf = requestAnimationFrame(loop); } }; },
  };
})();
