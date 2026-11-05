// ===== Cartas Contra a Humanidade em 3D (Three.js r128) =====
// Mesa sob uma luminária, baralhos preto e branco, carta preta no centro, respostas viradas na mesa e a sua mão em leque.
// Todas as cartas deslizam suavemente até o lugar delas; dá para arrastar as cartas da mão até a carta preta.
const Cah3D = (() => {
  let T, renderer, scene, camera, raycaster, wrap, canvas, raf = 0, mounted = false, active = false, lastT = 0;
  let handlers = {}, view = null, camDist = 1, glow = null;
  const CW = 1.25, CH = 1.75, CT = .012;          // tamanho da carta (proporção de carta de baralho)
  const BLACK_POS = () => new T.Vector3(0, .02, -1.55), WHITE_DECK = () => new T.Vector3(4.4, 0, -1.9), BLACK_DECK = () => new T.Vector3(-4.4, 0, -1.9);
  const objs = new Map();                          // chave -> carta 3D (mão: 'h'+id, respostas: 's'+i+'-'+k, preta: 'black')
  const tex = {}, drag = { card: null, plane: null, off: null, moved: false, sx: 0, sy: 0 };
  let selected = [], hoverKey = null, chosenSub = -1, decks = {};
  const rand = (a, b) => a + Math.random() * (b - a);

  // ---------- texturas das cartas ----------
  function canvasTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; t.anisotropy = renderer.capabilities.getMaxAnisotropy(); return t; }
  function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  const FONT = '"Helvetica Neue", Helvetica, Arial, sans-serif';
  function wrapLines(c, text, maxW) {
    const out = []; for (const para of text.split('\n')) { let line = ''; for (const w of para.split(' ')) { const t = line ? line + ' ' + w : w; if (c.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t; } out.push(line); }
    return out;
  }
  function logo(c, x, y, ink) { // três cartinhas inclinadas + nome
    c.save(); c.translate(x, y);
    [[-.3, .55], [0, .75], [.3, 1]].forEach(([a, op], i) => { c.save(); c.translate(i * 9, 0); c.rotate(a); c.globalAlpha = op; c.fillStyle = ink; c.fillRect(-9, -13, 18, 26); c.restore(); });
    c.globalAlpha = 1; c.fillStyle = ink; c.font = `700 19px ${FONT}`; c.textBaseline = 'middle'; c.fillText('Cartas Contra a Humanidade', 42, 1); c.restore();
  }
  function cardTex(kind, idx) { // kind: 'w' | 'b'; idx null = verso
    const key = kind + (idx ?? 'back'); if (tex[key]) return tex[key];
    const black = kind === 'b', bg = black ? '#111' : '#fdfdfb', ink = black ? '#fff' : '#111';
    return (tex[key] = canvasTex(512, 716, (c, W, H) => {
      c.fillStyle = bg; rr(c, 0, 0, W, H, 34); c.fill();
      if (idx == null) { // verso: nome do jogo em letras grandes
        c.fillStyle = ink; c.font = `800 74px ${FONT}`; c.textBaseline = 'top';
        ['Cartas', 'Contra a', 'Humanidade'].forEach((l, i) => c.fillText(l, 44, 60 + i * 86));
        return;
      }
      const text = black ? CAH_BLACK[idx].t.replace(/_/g, '________') : CAH_WHITE[idx];
      let fs = 50, lines; c.textBaseline = 'top';
      do { c.font = `800 ${fs}px ${FONT}`; lines = wrapLines(c, text, W - 88); fs -= 2; } while (lines.length * fs * 1.22 > H - 210 && fs > 22);
      c.fillStyle = ink; lines.forEach((l, i) => c.fillText(l, 44, 52 + i * (fs + 2) * 1.2));
      logo(c, 52, H - 62, ink);
      if (black && CAH_BLACK[idx].p > 1) {
        const p = CAH_BLACK[idx].p; c.font = `800 30px ${FONT}`; c.textAlign = 'right'; c.textBaseline = 'middle';
        const badge = (label, n, y) => { c.fillStyle = '#fff'; c.fillText(label, W - 96, y); c.beginPath(); c.arc(W - 66, y, 22, 0, 7); c.fill(); c.fillStyle = '#111'; c.textAlign = 'center'; c.fillText(n, W - 66, y + 1); c.textAlign = 'right'; };
        if (p === 3) badge('DRAW', 2, H - 112);
        badge('PICK', p, H - 62);
      }
    }));
  }

  // ---------- modelo da carta: frente, verso e borda finas; deitada, a frente fica para cima ----------
  let geoFace, geoEdge;
  function geos() {
    if (geoFace) return;
    const s = new T.Shape(), w = CW, h = CH, r = .09, x = -w / 2, y = -h / 2;
    s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h); s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
    geoFace = new T.ShapeGeometry(s, 8); const uv = geoFace.attributes.uv, p = geoFace.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (p.getX(i) + w / 2) / w, (p.getY(i) + h / 2) / h);
    geoEdge = new T.ExtrudeGeometry(s, { depth: CT, bevelEnabled: false, curveSegments: 8 }); geoEdge.translate(0, 0, -CT / 2);
  }
  function makeCard(kind, idx) {
    geos();
    const holder = new T.Group(), body = new T.Group(); body.rotation.x = -Math.PI / 2; holder.add(body);
    const mat = t => new T.MeshStandardMaterial({ map: t, roughness: .55, metalness: 0 });
    const front = new T.Mesh(geoFace, mat(cardTex(kind, idx))); front.position.z = CT / 2 + .0005;
    const back = new T.Mesh(geoFace, mat(cardTex(kind, null))); back.rotation.y = Math.PI; back.position.z = -CT / 2 - .0005;
    const edge = new T.Mesh(geoEdge, new T.MeshStandardMaterial({ color: kind === 'b' ? 0x222222 : 0xe9e6dc, roughness: .8 }));
    [front, back, edge].forEach(m => { m.castShadow = true; m.receiveShadow = true; body.add(m); });
    holder.userData = { kind, idx, front, target: null };
    return holder;
  }
  function setFace(card, idx) { if (card.userData.idx === idx) return; card.userData.idx = idx; const m = card.userData.front.material; m.map = cardTex(card.userData.kind, idx); m.needsUpdate = true; }
  // alvo (posição, rotação, escala) para onde a carta desliza
  function aim(card, pos, euler, scale = 1) { card.userData.target = { pos, quat: new T.Quaternion().setFromEuler(euler), scale }; }

  // ---------- cena ----------
  function mount(container, h) {
    handlers = h || handlers; wrap = container;
    if (mounted) { if (canvas.parentNode !== wrap) wrap.prepend(canvas); resize(); return true; }
    if (!window.THREE) return false;
    T = window.THREE;
    try { renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }); } catch { return false; }
    renderer.setPixelRatio(Math.min(1.75, devicePixelRatio || 1)); renderer.outputEncoding = T.sRGBEncoding;
    renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
    canvas = renderer.domElement; canvas.className = 'cah3d'; wrap.prepend(canvas);
    scene = new T.Scene(); scene.background = new T.Color(0x120d0a); scene.fog = new T.FogExp2(0x120d0a, .035);
    camera = new T.PerspectiveCamera(40, 1, .1, 100); raycaster = new T.Raycaster();
    // luz: luminária quente bem em cima da mesa, um pouco de luz ambiente
    scene.add(new T.HemisphereLight(0xfff1dc, 0x1a120c, .45));
    const lamp = new T.SpotLight(0xfff0d8, 1.6, 40, .75, .65, 1.1); lamp.position.set(0, 12, 1.5); lamp.target.position.set(0, 0, .3);
    lamp.castShadow = true; lamp.shadow.mapSize.set(2048, 2048); lamp.shadow.bias = -.0004; scene.add(lamp, lamp.target);
    // cúpula da luminária
    const shade = new T.Mesh(new T.ConeGeometry(1.4, 1, 32, 1, true), new T.MeshStandardMaterial({ color: 0x1b1b1b, side: T.DoubleSide, roughness: .4, metalness: .6 }));
    shade.position.set(0, 11.6, 1.5); scene.add(shade);
    // mesa: madeira escura com um feltro preto no meio
    const woodT = new T.TextureLoader().load(IMG.cj_wood || IMG.bg_wood); woodT.encoding = T.sRGBEncoding; woodT.wrapS = woodT.wrapT = T.RepeatWrapping; woodT.repeat.set(2, 2);
    const table = new T.Mesh(new T.BoxGeometry(15, .4, 10.5), new T.MeshStandardMaterial({ map: woodT, color: 0x8a5a3a, roughness: .45 }));
    table.position.y = -.2; table.receiveShadow = true; scene.add(table);
    const felt = new T.Mesh(new T.PlaneGeometry(13.6, 9), new T.MeshStandardMaterial({ color: 0x1c1c1f, roughness: .95 }));
    felt.rotation.x = -Math.PI / 2; felt.position.y = .002; felt.receiveShadow = true; scene.add(felt);
    const floor = new T.Mesh(new T.PlaneGeometry(80, 80), new T.MeshStandardMaterial({ color: 0x1a120c, roughness: 1 })); floor.rotation.x = -Math.PI / 2; floor.position.y = -3; scene.add(floor);
    // baralhos (montes de cartas viradas)
    for (const [k, p] of [['w', WHITE_DECK()], ['b', BLACK_DECK()]]) {
      const g = new T.Group(); g.position.copy(p); g.rotation.y = k === 'w' ? -.12 : .12;
      for (let i = 0; i < 12; i++) { const c = makeCard(k, null); c.rotation.z = Math.PI; c.position.set(rand(-.02, .02), .012 + i * .014, rand(-.02, .02)); c.rotation.y = rand(-.05, .05); g.add(c); }
      scene.add(g); decks[k] = g;
    }
    // brilho (vitória / seleção)
    glow = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshBasicMaterial({ map: canvasTex(128, 128, (c, w) => { const g = c.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(255,214,107,.9)'); g.addColorStop(1, 'rgba(255,214,107,0)'); c.fillStyle = g; c.fillRect(0, 0, w, w); }), transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: 0 }));
    glow.rotation.x = -Math.PI / 2; glow.position.y = .01; scene.add(glow);
    bindInput(); new ResizeObserver(resize).observe(wrap); resize();
    mounted = true; return true;
  }
  function resize() {
    if (!renderer || !wrap) return;
    const w = wrap.clientWidth, h = wrap.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false); canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
    camera.aspect = w / h; camera.fov = w / h < 1 ? 50 : 42; camDist = Math.min(1.6, Math.max(1, 1.2 / (w / h)));
    camera.updateProjectionMatrix(); camera.position.set(0, 7.4 * camDist, 7.2 * camDist); camera.lookAt(0, 0, .35);
    if (view) layout(view);
  }
  function loop(t) {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(.05, (t - (lastT || t)) / 1000); lastT = t;
    const k = 1 - Math.exp(-dt * 9), kr = 1 - Math.exp(-dt * 8);
    for (const c of objs.values()) {
      const tg = c.userData.target; if (!tg || c === drag.card) continue;
      c.position.lerp(tg.pos, k); c.quaternion.slerp(tg.quat, kr); c.scale.setScalar(c.scale.x + (tg.scale - c.scale.x) * k);
      if (c.userData.dying && c.position.distanceTo(tg.pos) < .05) { scene.remove(c); objs.delete(c.userData.key); }
    }
    glow.material.opacity += ((glow.userData.on ? .9 : 0) - glow.material.opacity) * k;
    renderer.render(scene, camera);
  }
  function show(on) { active = !!on && mounted; if (!mounted) return; canvas.style.display = active ? '' : 'none'; cancelAnimationFrame(raf); lastT = 0; if (active) { resize(); raf = requestAnimationFrame(loop); } }
  function supported() { if (!window.THREE) return false; try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; } }

  // ---------- sincronização com o estado ----------
  function getCard(key, kind, idx, spawn) {
    let c = objs.get(key);
    if (!c) { c = makeCard(kind, idx); c.userData.key = key; if (spawn) { c.position.copy(spawn.pos); c.quaternion.copy(spawn.quat || new T.Quaternion()); } scene.add(c); objs.set(key, c); }
    else if (idx != null) setFace(c, idx);
    c.userData.dying = false;
    return c;
  }
  const downQ = yaw => new T.Quaternion().setFromEuler(new T.Euler(0, yaw || 0, Math.PI));
  function sync(v, sel = selected, chosen = chosenSub) {
    if (!mounted) return; view = v; selected = sel; chosenSub = chosen; layout(v);
  }
  function layout(v) {
    const used = new Set(), me = v.players.find(p => p.id === v.me);
    // carta preta: vem do monte preto e vira no centro
    if (v.black != null) {
      const b = getCard('black-' + v.round, 'b', v.black, { pos: BLACK_DECK().setY(.3), quat: downQ(.12) });
      aim(b, BLACK_POS(), new T.Euler(0, 0, 0), 1.35); used.add('black-' + v.round);
    }
    // respostas: viradas para baixo numa fileira; o Czar vira uma por uma
    const subs = v.subs || [], perRow = subs.length > 6 ? Math.ceil(subs.length / 2) : subs.length;
    const span = n => n * (CW * .82 + .12) + .35;
    subs.forEach((s, i) => {
      const row = perRow ? Math.floor(i / perRow) : 0, col = i - row * perRow, nRow = Math.min(perRow, subs.length - row * perRow);
      const widths = subs.slice(row * perRow, row * perRow + nRow).map(x => span(x.n));
      const total = widths.reduce((a, b) => a + b, 0) - .35, x0 = -total / 2 + widths.slice(0, col).reduce((a, b) => a + b, 0);
      const win = v.winner === i && (v.phase === 'reveal' || v.phase === 'done'), focus = chosenSub === i;
      for (let k = 0; k < s.n; k++) {
        const key = `s${v.round}-${i}-${k}`, idx = s.cards ? s.cards[k] : null;
        const c = getCard(key, 'w', idx, { pos: new T.Vector3(0, 1.5, 4), quat: downQ() });
        c.userData.sub = i;
        const lift = win ? .5 : focus ? .25 : 0;
        aim(c, new T.Vector3(x0 + k * (CW * .82 + .12) + CW * .41, .03 + k * .004 + lift, .55 + row * 1.6 - (win ? .3 : 0)), new T.Euler(win ? -.35 : 0, 0, s.shown ? 0 : Math.PI), .82 * (win ? 1.12 : 1));
        used.add(key);
      }
      if (win) { glow.position.set(x0 + span(s.n) / 2 - .17, .01, .4 + row * 1.6); glow.scale.setScalar(span(s.n) * 1.7); }
    });
    glow.userData.on = (v.phase === 'reveal' || v.phase === 'done') && v.winner != null;
    // minha mão: leque em frente à câmera; as escolhidas sobem e vão para perto da carta preta
    const hand = me ? me.hand : [], n = hand.length;
    const handPos = new T.Vector3(0, 1.7, 4.15);
    const dist = camera.position.distanceTo(handPos), visH = 2 * dist * Math.tan(camera.fov * Math.PI / 360), visW = visH * camera.aspect;
    // tamanho da mão: cabe na largura e ocupa no máximo ~1/3 da altura da tela
    const HS = Math.min(1.18, visH * .3 / CH, visW * .94 / (Math.max(n, 5) * CW * 1.04));
    const spread = Math.min(CW * HS * 1.04, (visW * .94 - CW * HS) / Math.max(1, n - 1));
    hand.forEach((id, j) => {
      const key = 'h' + id, c = getCard(key, 'w', id, { pos: WHITE_DECK().setY(.4), quat: downQ(-.12) });
      c.userData.handId = id; used.add(key);
      if (c === drag.card) return;
      const si = selected.indexOf(id), mid = (n - 1) / 2, off = j - mid;
      const inHand = si < 0; if (c.userData.inHand !== inHand) { c.userData.inHand = inHand; c.traverse(m => { if (m.isMesh) m.castShadow = !inHand; }); } // a mão (perto da câmera) não projeta sombra na mesa
      if (si >= 0) { // escolhida: fica sobre a mesa, ao lado da carta preta, na ordem de escolha
        aim(c, new T.Vector3(1.55 + si * (CW * .85 + .1), .05 + si * .01, -1.55), new T.Euler(0, 0, 0), .9);
      } else {
        const hov = hoverKey === key;
        aim(c, new T.Vector3(off * spread, handPos.y - Math.abs(off) * .025 + (hov ? .35 : 0) + j * .003, handPos.z + Math.abs(off) * .05 - (hov ? .3 : 0)),
          new T.Euler(1.02, -off * .03, -off * .025), HS * (hov ? 1.12 : 1));
      }
    });
    // o que saiu de cena: cartas jogadas/descartadas somem para o lado
    for (const [key, c] of objs) if (!used.has(key) && !c.userData.dying) {
      c.userData.dying = true;
      const winSeat = v.last && key.startsWith('s'); // fim da rodada: tudo sai voando para cima
      aim(c, winSeat || key.startsWith('black') ? new T.Vector3(c.position.x * .5, 4, -6) : new T.Vector3(c.position.x, 2.5, -3), new T.Euler(-.8, 0, 0), .6);
    }
    const wc = v.white?.count ?? 40; decks.w.children.forEach((c, i) => (c.visible = i < Math.ceil(Math.min(12, wc / 30 + 1))));
  }

  // ---------- entrada: arrastar e clicar ----------
  function ndc(e) { const r = canvas.getBoundingClientRect(); return new T.Vector2((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1); }
  function hit(e) {
    raycaster.setFromCamera(ndc(e), camera);
    const list = [...objs.values()].filter(c => !c.userData.dying);
    const h = raycaster.intersectObjects(list, true)[0]; if (!h) return null;
    let o = h.object; while (o && !o.userData.key) o = o.parent; return o;
  }
  // ponto do raio no plano horizontal na altura y
  function onPlane(e, y) { raycaster.setFromCamera(ndc(e), camera); const p = new T.Vector3(); return raycaster.ray.intersectPlane(new T.Plane(new T.Vector3(0, 1, 0), -y), p) ? p : null; }
  function bindInput() {
    canvas.addEventListener('pointerdown', e => {
      const c = hit(e); if (!c) return;
      drag.card = c; drag.moved = false; drag.sx = e.clientX; drag.sy = e.clientY; canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', e => {
      if (!drag.card) { const c = hit(e), k = c && c.userData.handId != null ? c.userData.key : null; if (k !== hoverKey) { hoverKey = k; if (view) layout(view); } canvas.style.cursor = c ? 'grab' : ''; return; }
      if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 6) drag.moved = true;
      if (!drag.moved) return;
      const c = drag.card; const canMove = c.userData.handId != null || (c.userData.sub != null && view?.phase === 'judge' && view.me === view.players[view.czar].id);
      if (!canMove) return;
      const p = onPlane(e, .9); if (!p) return;
      c.position.lerp(p, .6); c.quaternion.slerp(new T.Quaternion().setFromEuler(new T.Euler(.25, 0, c.userData.target?.quat && c.userData.sub != null && !(view.subs[c.userData.sub]?.shown) ? Math.PI : 0)), .3);
      canvas.style.cursor = 'grabbing';
      // realça a carta preta quando a carta passa por cima dela
      glow.userData.on = p.distanceTo(BLACK_POS()) < 1.6; if (glow.userData.on) { glow.position.copy(BLACK_POS()).setY(.01); glow.scale.setScalar(3.4); }
    });
    canvas.addEventListener('pointerup', e => {
      const c = drag.card; drag.card = null; if (!c) return;
      canvas.style.cursor = '';
      const p = onPlane(e, .9), overBlack = p && p.distanceTo(BLACK_POS()) < 1.9, overTable = p && p.z < 2.3;
      if (c.userData.handId != null) {
        const id = c.userData.handId, isSel = selected.includes(id);
        if (!drag.moved) handlers.toggle?.(id);                 // clique: escolhe/desfaz
        else if (overBlack || overTable) { if (!isSel) handlers.toggle?.(id, true); }   // arrastou para a mesa: escolhe (e joga se completar)
        else if (isSel) handlers.toggle?.(id);                    // arrastou de volta para a mão: desfaz
      } else if (c.userData.sub != null) {
        const i = c.userData.sub;
        if (drag.moved && overBlack) handlers.judge?.(i, true); else if (!drag.moved) handlers.subClick?.(i);
      }
      if (view) layout(view);
    });
    canvas.addEventListener('pointerleave', () => { if (hoverKey) { hoverKey = null; if (view) layout(view); } });
  }

  return { supported, mount, show, sync, get active() { return active; } };
})();
