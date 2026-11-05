// ===== Dominó 2 em 3D (Three.js r128) =====
// Mesa de feltro sob uma luminária. Cada pedra é um objeto só, que desliza entre monte, mãos e fileira:
// a jogada voa em arco da mão de quem jogou e assenta na mesa; a compra sai do monte; no fim da mão as pedras viram.
// Sua mão fica em pé na sua frente: passe o mouse para levantar, clique ou arraste até a ponta.
const Domino2GL = (() => {
  let T, renderer, scene, camera, ray, wrap, canvas, raf = 0, mounted = false, active = false, lastT = 0;
  let H = {}, st = null, opt = {}, curHand = -1, n = 4, mySeat = 0;
  const TH = .34, LEAN = .62;                    // espessura da pedra; inclinação da sua mão (rad)
  const objs = new Map();                         // chave -> { g, key, tile, kind, from, to, t0, delay, dur, arc, land, lift, hold }
  let geo, mats, ghosts = [], hoverKey = null, drag = null, ptr = null, plane = null;
  const PIP = { 0: [], 1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
    5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [-1, 0], [-1, 1], [1, -1], [1, 0], [1, 1]] };
  const idOf = t => Math.min(t[0], t[1]) * 10 + Math.max(t[0], t[1]);
  const same = (t, u) => (t[0] === u[0] && t[1] === u[1]) || (t[0] === u[1] && t[1] === u[0]);
  const C = h => new T.Color(h).convertSRGBToLinear();
  const ease = k => (k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

  // ---------- modelo da pedra: corpo arredondado de marfim, pontos escuros e a risca do meio ----------
  function buildGeo() {
    const s = new T.Shape(), w = 2, h = 1, r = .16, x = -w / 2, y = -h / 2;
    s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
    const bv = .05, body = new T.ExtrudeGeometry(s, { depth: TH - 2 * bv, bevelEnabled: true, bevelThickness: bv, bevelSize: bv * .8, bevelSegments: 3, curveSegments: 6 });
    body.rotateX(-Math.PI / 2); body.translate(0, bv, 0); // deitada: face de cima em y = TH
    const pip = new T.CircleGeometry(.085, 14); pip.rotateX(-Math.PI / 2);
    const mid = new T.BoxGeometry(.035, .006, .74);
    geo = { body, pip, mid };
    mats = {
      ivory: new T.MeshStandardMaterial({ color: C(0xf3ecdb), roughness: .32, metalness: 0 }),
      glow: new T.MeshStandardMaterial({ color: C(0xfff4d6), roughness: .3, emissive: C(0xffb21e), emissiveIntensity: .55 }),
      pip: new T.MeshStandardMaterial({ color: C(0x17120d), roughness: .6 }),
      mid: new T.MeshStandardMaterial({ color: C(0x9c8e70), roughness: .6 }),
      ghost: new T.MeshStandardMaterial({ color: 0xffe08a, emissive: 0xffc94a, emissiveIntensity: .6, transparent: true, opacity: .32, depthWrite: false }),
    };
  }
  function makeTile(t) { // t = [a, b] ou null (pedra desconhecida: só o corpo)
    const g = new T.Group(), body = new T.Mesh(geo.body, mats.ivory);
    body.castShadow = true; body.receiveShadow = true; g.add(body);
    if (t) {
      const mid = new T.Mesh(geo.mid, mats.mid); mid.position.y = TH + .002; g.add(mid);
      [[t[0], -.5], [t[1], .5]].forEach(([v, cx]) => PIP[v].forEach(([px, pz]) => { const p = new T.Mesh(geo.pip, mats.pip); p.position.set(cx + px * .26, TH + .003, pz * .26); g.add(p); }));
    }
    g.userData.body = body; return g;
  }

  // ---------- posições ----------
  const flat = (x, z, rad) => ({ p: new T.Vector3(x, 0, z), q: new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), rad) });
  function basis(xv, yv, pos) { const z = new T.Vector3().crossVectors(xv, yv); return { p: pos, q: new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(xv, yv, z)) }; }
  // lugar de cada jogador em volta da mesa (rel = 0 é você, embaixo)
  function seat(s) {
    const rel = (s - mySeat + n) % n, name = n === 2 ? ['me', 'top'][rel] : n === 3 ? ['me', 'right', 'left'][rel] : ['me', 'right', 'top', 'left'][rel];
    return {
      me: { c: new T.Vector3(0, 0, 8.4), out: new T.Vector3(0, 0, 1), along: new T.Vector3(1, 0, 0) },
      top: { c: new T.Vector3(0, 0, -9.2), out: new T.Vector3(0, 0, -1), along: new T.Vector3(-1, 0, 0) },
      right: { c: new T.Vector3(12.4, 0, -.6), out: new T.Vector3(1, 0, 0), along: new T.Vector3(0, 0, 1) },
      left: { c: new T.Vector3(-12.4, 0, -.6), out: new T.Vector3(-1, 0, 0), along: new T.Vector3(0, 0, -1) },
    }[name];
  }
  const UP = () => new T.Vector3(0, 1, 0);
  function standPose(s, j, c) { // pedra em pé na frente do dono, de costas para a mesa
    const S = seat(s), p = S.c.clone().addScaledVector(S.along, (j - (c - 1) / 2) * 1.1); p.y = 1.02;
    return basis(UP(), S.out.clone(), p);
  }
  function openPose(s, j, c) { // fim da mão: pedras deitadas, viradas para cima, na frente do dono
    const S = seat(s), p = S.c.clone().addScaledVector(S.out, -1.4).addScaledVector(S.along, (j - (c - 1) / 2) * 1.15);
    return basis(S.out.clone().negate(), UP(), p);
  }
  function myPose(j, c) { // sua mão: em pé, inclinada para trás, de frente para a câmera
    const sp = Math.min(1.16, 22 / Math.max(c, 1)), p = new T.Vector3((j - (c - 1) / 2) * sp, Math.cos(LEAN) + .04, 8.4);
    const face = new T.Vector3(0, Math.sin(LEAN), Math.cos(LEAN)), up = new T.Vector3(0, Math.cos(LEAN), -Math.sin(LEAN));
    return basis(up, face, p);
  }
  function pilePose(j) {
    if (n === 2) return flat(-12.2 + Math.floor(j / 7) * 2.2, -3.6 + (j % 7) * 1.12, 0);
    return flat(-3.4 + (j % 7) * 1.12, -8.7 + Math.floor(j / 7) * 2.2, Math.PI / 2);
  }
  // pose de uma pedra na fileira (a partir do desenho da serpentina do Domino2UI)
  function linePoses(s) {
    const { out } = Domino2UI.layout(s), keys = [s.C, ...s.R, ...s.L];
    return out.map((t, i) => ({ id: idOf(keys[i]), a: t.a, d: t.a === t.b, pose: flat(t.x, t.y, -t.ang * Math.PI / 180) }));
  }
  function lineAfter(tile, end) { // onde a pedra cairia se fosse jogada naquela ponta
    if (end === 'C' || !st.C) return { a: tile[0], pose: flat(0, 0, tile[0] === tile[1] ? -Math.PI / 2 : 0) };
    const [l, r] = Domino2.ends(st), open = end === 'L' ? l : r, inner = tile[0] === open ? tile[0] : tile[1], e = [inner, tile[0] + tile[1] - inner];
    const s2 = { C: st.C, L: end === 'L' ? [...st.L, e] : st.L, R: end === 'R' ? [...st.R, e] : st.R };
    const P = linePoses(s2); return P[end === 'R' ? s2.R.length : s2.R.length + s2.L.length];
  }
  // a pedra 3D tem os pontos fixos (a à esquerda); se na fileira ela entra virada, gira 180°
  const facing = (o, a, d, pose) => (d || o.tile[0] === a ? pose : { p: pose.p, q: pose.q.clone().multiply(new T.Quaternion().setFromAxisAngle(UP(), Math.PI)) });

  // ---------- montagem ----------
  function mount(container, h) {
    H = h || H; wrap = container;
    if (mounted) { if (canvas.parentNode !== wrap) wrap.prepend(canvas); resize(); return true; }
    if (!window.THREE) return false;
    T = window.THREE;
    try { renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }); } catch { return false; }
    renderer.setPixelRatio(Math.min(1.75, devicePixelRatio || 1)); renderer.outputEncoding = T.sRGBEncoding;
    renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = .95;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
    canvas = renderer.domElement; canvas.className = 'd2-gl'; wrap.prepend(canvas);
    scene = new T.Scene(); scene.background = new T.Color(0x150e09);
    camera = new T.PerspectiveCamera(36, 1, .5, 200); ray = new T.Raycaster(); ptr = new T.Vector2(); plane = new T.Plane(new T.Vector3(0, 1, 0), -.9);
    scene.add(new T.HemisphereLight(0xfff3e0, 0x24170e, .4));
    const lamp = new T.SpotLight(0xfff1dc, 1.5, 70, .62, .55, 1); lamp.position.set(-2, 30, 6); lamp.target.position.set(0, 0, 0);
    lamp.castShadow = true; lamp.shadow.mapSize.set(2048, 2048); lamp.shadow.bias = -.0005; lamp.shadow.radius = 4; scene.add(lamp, lamp.target);
    const fill = new T.DirectionalLight(0xbcd2ff, .22); fill.position.set(8, 10, 16); scene.add(fill);
    // mesa: feltro verde com borda de madeira
    const felt = new T.Mesh(new T.PlaneGeometry(30, 23), new T.MeshStandardMaterial({ color: C(0x17643c), roughness: 1 }));
    felt.rotation.x = -Math.PI / 2; felt.receiveShadow = true; scene.add(felt);
    const wood = new T.MeshStandardMaterial({ color: C(0x4a2a12), roughness: .45 });
    [[0, -12.1, 32.4, 1.2], [0, 12.1, 32.4, 1.2], [-15.6, 0, 1.2, 23], [15.6, 0, 1.2, 23]].forEach(([x, z, w, d]) => {
      const m = new T.Mesh(new T.BoxGeometry(w, .9, d), wood); m.position.set(x, .25, z); m.castShadow = m.receiveShadow = true; scene.add(m);
    });
    const floor = new T.Mesh(new T.PlaneGeometry(200, 200), new T.MeshStandardMaterial({ color: C(0x1c120a), roughness: 1 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -8; scene.add(floor);
    buildGeo(); bindInput();
    new ResizeObserver(resize).observe(wrap); resize();
    mounted = true; return true;
  }
  function resize() {
    if (!renderer || !wrap) return;
    const w = wrap.clientWidth || 1, h = wrap.clientHeight || 1;
    renderer.setSize(w, h, false); camera.aspect = w / h;
    // enquadra a mesa inteira: mais alto e mais de cima quando a tela é estreita (celular em pé)
    const portrait = w / h < 1, elev = portrait ? 1.2 : 1.02, vf = T.MathUtils.degToRad(camera.fov), hf = 2 * Math.atan(Math.tan(vf / 2) * camera.aspect);
    const dist = Math.max((portrait ? 13.6 : 14.4) / Math.tan(hf / 2), 10.8 / Math.tan(vf / 2));
    camera.position.set(0, Math.sin(elev) * dist, .9 + Math.cos(elev) * dist); camera.lookAt(0, 0, .9);
    camera.updateProjectionMatrix();
  }
  function show(on) { active = !!on && mounted; if (!mounted) return; canvas.style.display = active ? '' : 'none'; cancelAnimationFrame(raf); lastT = 0; if (active) { resize(); raf = requestAnimationFrame(loop); } }
  function supported() { if (!window.THREE) return false; try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; } }

  // ---------- estado -> alvos ----------
  function setTarget(o, pose, x = {}) {
    if (o.to && o.to.p.distanceTo(pose.p) < .01 && o.to.q.angleTo(pose.q) < .01 && !x.force) return;
    const dist = o.g.position.distanceTo(pose.p);
    o.from = { p: o.g.position.clone(), q: o.g.quaternion.clone() }; o.to = pose; o.t0 = performance.now();
    o.delay = x.delay || 0; o.dur = x.dur || Math.min(950, 320 + dist * 38); o.arc = x.arc ?? Math.min(2.6, dist * .13); o.land = !!x.land;
  }
  function add(key, tile, start) {
    const g = makeTile(tile); g.position.copy(start.p); g.quaternion.copy(start.q); scene.add(g);
    const o = { g, key, tile, kind: null, lift: 0, hold: false }; g.userData.key = key; objs.set(key, o); return o;
  }
  function sync(state, o2) {
    if (!mounted) return;
    st = state; opt = o2 || {}; n = st.players.length; mySeat = opt.mySeat >= 0 ? opt.mySeat : 0;
    const want = new Map(), ev = st.ev || {}, deal = st.hand !== curHand; curHand = st.hand;
    // fileira
    if (st.C) for (const L of linePoses(st)) want.set('t' + L.id, { kind: 'line', a: L.a, d: L.d, pose: L.pose });
    // mãos
    st.players.forEach((p, s) => {
      if (s === opt.mySeat) p.hand.forEach((t, j) => want.set('t' + idOf(t), { kind: 'me', tile: t, pose: myPose(j, p.hand.length) }));
      else if (p.hand.length) p.hand.forEach((t, j) => want.set('t' + idOf(t), { kind: 'open', tile: t, s, j, pose: openPose(s, j, p.hand.length) }));
      else for (let j = 0; j < p.count; j++) want.set(`o${s}-${j}`, { kind: 'hid', s, pose: standPose(s, j, p.count) });
    });
    const pc = st.pile?.count ?? (Array.isArray(st.pile) ? st.pile.length : 0);
    for (let j = 0; j < pc; j++) want.set('p' + j, { kind: 'pile', pose: pilePose(j) });
    // some quem saiu
    for (const [k, o] of objs) if (!want.has(k)) { scene.remove(o.g); objs.delete(k); }
    let i = 0;
    for (const [k, w] of want) {
      let o = objs.get(k);
      const tile = w.tile || (k[0] === 't' ? [Math.floor(+k.slice(1) / 10), +k.slice(1) % 10] : null);
      if (!o) { // de onde a pedra nova surge
        let start;
        if (deal) start = flat((Math.random() - .5) * 5, (Math.random() - .5) * 3.5, Math.random() * 6);
        else if (w.kind === 'line' && ev.type === 'play' && ev.seat != null) start = standPose(ev.seat, 0, 1);
        else if ((w.kind === 'me' || w.kind === 'hid') && ev.type === 'buy') start = pilePose(pc);
        else if (w.kind === 'open') start = standPose(w.s, w.j, st.players[w.s].hand.length);
        else start = { p: w.pose.p.clone().add(new T.Vector3(0, 3, 0)), q: w.pose.q.clone() };
        o = add(k, tile, start);
      }
      const pose = w.kind === 'line' ? facing(o, w.a, w.d, w.pose) : w.pose;
      const toLine = w.kind === 'line' && o.kind !== 'line';
      if (o.hold && w.kind !== 'me') o.hold = false;
      if (!o.hold) setTarget(o, pose, deal ? { delay: i * 28, dur: 750, arc: 1.6, force: true } : { land: toLine, arc: toLine ? undefined : .6 });
      o.kind = w.kind; i++;
    }
    // pedras que podem ser jogadas brilham
    const can = opt.can || [];
    for (const o of objs.values()) o.g.userData.body.material = o.kind === 'me' && o.tile && can.some(m => same(m.t, o.tile)) ? mats.glow : mats.ivory;
    setGhosts(drag?.moved ? drag.tile : opt.sel);
  }
  function setGhosts(tile) {
    ghosts.forEach(g => scene.remove(g)); ghosts = [];
    if (!tile || !opt.myTurn) return;
    const ends = [...new Set((opt.can || []).filter(m => same(m.t, tile)).map(m => m.end))];
    for (const end of ends) {
      const P = lineAfter(tile, end), g = new T.Mesh(geo.body, mats.ghost);
      g.position.copy(P.pose.p).setY(.02); g.quaternion.copy(P.pose.q); g.userData = { end, tile }; scene.add(g); ghosts.push(g);
    }
  }

  // ---------- entrada: passar, clicar e arrastar ----------
  function setPtr(e) { const r = canvas.getBoundingClientRect(); ptr.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1); ray.setFromCamera(ptr, camera); }
  const playable = o => o && o.kind === 'me' && opt.myTurn && (opt.can || []).some(m => same(m.t, o.tile));
  function pickMine() {
    const mine = [...objs.values()].filter(o => o.kind === 'me').map(o => o.g.userData.body);
    const hit = ray.intersectObjects(mine)[0]; return hit ? objs.get(hit.object.parent.userData.key) : null;
  }
  function nearGhost(p) { let best = null, bd = 1e9; for (const g of ghosts) { const d = Math.hypot(g.position.x - p.x, g.position.z - p.z); if (d < bd) { bd = d; best = g; } } return bd < 4.2 ? best : null; }
  function bindInput() {
    canvas.addEventListener('pointermove', e => {
      setPtr(e);
      if (drag) {
        if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 8) { drag.moved = true; setGhosts(drag.tile); }
        if (drag.moved) { const p = new T.Vector3(); if (ray.ray.intersectPlane(plane, p)) drag.at = p; ghosts.forEach(g => g.scale.setScalar(g === nearGhost(drag.at || p) ? 1.1 : 1)); }
        return;
      }
      const o = pickMine(); hoverKey = o ? o.key : null; canvas.style.cursor = playable(o) ? 'grab' : ray.intersectObjects(ghosts)[0] ? 'pointer' : '';
    });
    canvas.addEventListener('pointerdown', e => {
      setPtr(e); SFX.unlock?.();
      const g = ray.intersectObjects(ghosts)[0]; if (g) return H.play?.(g.object.userData.tile, g.object.userData.end);
      const o = pickMine(); if (!playable(o)) return;
      drag = { key: o.key, tile: o.tile, sx: e.clientX, sy: e.clientY, moved: false, at: null }; try { canvas.setPointerCapture(e.pointerId); } catch {}
    });
    const up = () => {
      if (!drag) return; const d = drag; drag = null; canvas.style.cursor = '';
      if (!d.moved) return H.pick?.(d.tile);
      const g = d.at && nearGhost(d.at), o = objs.get(d.key);
      if (g && o) {
        o.hold = true; o.t0 = null; H.play?.(d.tile, g.userData.end);
        setTimeout(() => { if (o.hold) { o.hold = false; setTarget(o, o.to, { force: true }); } }, 2500); // jogada recusada: volta para a mão
      }
      setGhosts(opt.sel);
      if (o && !g) setTarget(o, o.to, { force: true, arc: .5, dur: 380 });
    };
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  }

  // ---------- quadro a quadro ----------
  function loop(t) {
    if (!active) return; raf = requestAnimationFrame(loop);
    const dt = Math.min(.05, lastT ? (t - lastT) / 1000 : .016); lastT = t;
    const now = performance.now();
    for (const o of objs.values()) {
      if (drag?.moved && o.key === drag.key && drag.at) { // a pedra arrastada acompanha o dedo, deitando aos poucos
        const g = nearGhost(drag.at), tp = g ? drag.at.clone().lerp(g.position.clone().setY(.9), .35) : drag.at;
        o.g.position.lerp(tp, Math.min(1, dt * 18)); if (g) o.g.quaternion.slerp(g.quaternion, Math.min(1, dt * 10)); else o.g.quaternion.slerp(flat(0, 0, 0).q, Math.min(1, dt * 6));
        continue;
      }
      if (o.hold) continue;
      if (o.t0 != null) {
        const k = Math.max(0, Math.min(1, (now - o.t0 - o.delay) / o.dur)), e = ease(k);
        o.g.position.lerpVectors(o.from.p, o.to.p, e); o.g.position.y += o.arc * Math.sin(Math.PI * k);
        o.g.quaternion.copy(o.from.q).slerp(o.to.q, e);
        if (k >= 1) { o.t0 = null; if (o.land) { o.land = false; SFX.flip(); bump(o); } }
      }
      // sua mão: a pedra levanta ao passar o mouse e quando está escolhida
      if (o.kind === 'me') {
        const want = opt.sel && same(opt.sel, o.tile) ? .75 : o.key === hoverKey && playable(o) ? .4 : 0;
        o.lift += (want - o.lift) * Math.min(1, dt * 12);
        if (o.t0 == null) o.g.position.y = o.to.p.y + o.lift;
      }
    }
    for (const g of ghosts) g.material.opacity = .22 + .14 * Math.sin(now / 220);
    renderer.render(scene, camera);
  }
  // assentou na mesa: as pedras perto dão uma tremidinha
  function bump(src) {
    for (const o of objs.values()) {
      if (o === src || o.kind !== 'line' || o.t0 != null) continue;
      const d = o.g.position.distanceTo(src.g.position); if (d > 3) continue;
      setTarget(o, o.to, { force: true, arc: .14 * (1 - d / 3), dur: 220 }); // pulinho no lugar
    }
  }

  return { supported, mount, show, sync, get active() { return active; } };
})();
