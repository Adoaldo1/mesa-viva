// Patrimônio: o tabuleiro em 3D. Ladrilhos, rua, moldura, peças, dados, construções, câmera e efeitos.
const Stage = (() => {
  const TW = 2, TD = 3.4, H = 9, R1 = H + TD, RW = 1.4, R2 = R1 + RW, RF = R2 + .2, RHO1 = 1.4, RHO2 = RHO1 + RW, RC = R1 + RW / 2;
  const SIDE = [0, -Math.PI / 2, Math.PI, Math.PI / 2];
  const sideOf = i => Math.floor(i / 10) % 4;
  let gl, scene, camera, canvas, speed = 1;
  const lin = c => new THREE.Color(c).convertSRGBToLinear();
  const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: lin(c), roughness: .55, ...o });
  const add = (geo, mat, x = 0, y = 0, z = 0, parent = scene, cast = true, recv = true) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = cast; m.receiveShadow = recv; parent.add(m); return m; };
  const tex = (c, opts = {}) => { const t = new THREE.CanvasTexture(c); t.encoding = opts.linear ? THREE.LinearEncoding : THREE.sRGBEncoding; t.anisotropy = gl.capabilities.getMaxAnisotropy(); if (opts.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(opts.repeat, opts.repeat); } return t; };
  const rrect = (s, x, y, w, h, r) => { s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h); s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); return s; };
  const ease = { out: k => 1 - (1 - k) ** 3, inOut: k => (k < .5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2), back: k => 1 + 2.4 * (k - 1) ** 3 + 1.4 * (k - 1) ** 2, line: k => k };

  // ---------- animação ----------
  const tweens = [];
  const tw = (ms, fn, e = ease.line) => new Promise(res => tweens.push({ t: 0, ms: Math.max(1, ms), fn, e, res }));
  const wait = ms => new Promise(res => tweens.push({ t: 0, ms: Math.max(1, ms), fn() {}, e: ease.line, res }));
  let last = performance.now(), lastFrame = 0;
  function step(now, render) {
    const dtReal = Math.max(0, Math.min(.1, (now - last) / 1000)); last = now; const dt = dtReal * speed; // max: o quadro pode trazer hora anterior à do timer de aba oculta
    for (let i = tweens.length - 1; i >= 0; i--) { const a = tweens[i]; a.t += dt * 1000; const k = Math.min(1, a.t / a.ms); a.fn(a.e(k), k); if (k >= 1) { tweens.splice(i, 1); a.res(); } }
    updateCam(dtReal); idle(now / 1000, dtReal); updateFx(dtReal);
    if (render) gl.render(scene, camera);
  }
  function frame(now) { requestAnimationFrame(frame); lastFrame = now; step(now, true); }

  // ---------- câmera ----------
  // Órbita rígida: a câmera mira o centro da mesa, a uma distância só, e nada do jogo a move. Quem mexe é só a pessoa.
  const EL_MIN = .3, EL_MAX = 1.5, FLAT_EL = 1.562, FOV_FLAT = 13;
  // padrão absoluto da câmera, escolhido pela pessoa no painel de ajustes: é para ele que o reset volta
  const VIEW0 = { fov: 60, lift: .13, el: 28 * Math.PI / 180, zg: 1 / 1.6, az: 3 * Math.PI / 180 };
  let FOV = VIEW0.fov, viewX = 0;
  const LIFT_FIT = .04; // a conta de encaixe é a mesma em que esses números foram escolhidos
  const OV_EL = VIEW0.el;
  const cam = { fz: 1, gfz: 1, el: OV_EL, gel: OV_EL, az: 0, gaz: 0, shake: 0, user: VIEW0.az, userEl: 0, zoom: VIEW0.zg, zg: VIEW0.zg, px: 0, pz: 0, vx: 0, vz: 0, va: 0, ve: 0, snap: null, back: false, backEl: false, held: false, orbit: false, flat: false, fl: 0, cx: 0, cz: 0, vfz: 0, vfl: 0, vs: 0, wpp: .1, dyn: true, follow: null, hold: 0, ox: 0, oz: 0, vox: 0, voz: 0, lift: VIEW0.lift, liftNow: VIEW0.lift, vxNow: 0, sd: null, dk: 1, zf: 1, fe: 0, oy: 0 };
  let hudOn = false;
  let PANEL = 370; // painel de informações à direita, como nos outros jogos
  const sol = { d: 80 };
  const vt = new THREE.PerspectiveCamera(FOV, 1, 1, 2400), vv = new THREE.Vector3();
  // acha a distância para o tabuleiro inteiro caber com o centro dele no centro da área livre
  function solveView(el, az, fov, o) {
    const w = innerWidth, h = innerHeight, wide = w > 820, room = hudOn && wide ? 1 - (PANEL + 104) / w : 1, limY = 1 - 2 * (wide ? 24 : 92) / h - 2 * LIFT_FIT, limX = .97 * room;
    vt.fov = fov; vt.aspect = camera.aspect; vt.updateProjectionMatrix();
    const sa = Math.sin(az), ca = Math.cos(az), se = Math.sin(el), ce = Math.cos(el);
    for (let it = 0; it < 40; it++) {
      vt.position.set(sa * ce * o.d, se * o.d, ca * ce * o.d); vt.lookAt(0, 0, 0); vt.updateMatrixWorld();
      let my = 0, mx = 0;
      for (const a of [-RF, RF]) for (const b of [-RF, RF]) { vv.set(a, 0, b).project(vt); my = Math.max(my, Math.abs(vv.y)); mx = Math.max(mx, Math.abs(vv.x)); }
      o.d = Math.max(12, Math.min(1200, o.d * Math.max(my / limY, mx / limX) ** .7));
    }
    return o;
  }
  // uma conta só por tamanho de tela e FOV. Fica entre o que cabe de frente e na diagonal: girar não aproxima nem afasta
  let viewFlat = { d: 200 };
  function buildView() {
    const FIT_EL = innerWidth > 820 ? .78 : 1.14, a = solveView(FIT_EL, 0, FOV, { d: 80 }), b = solveView(FIT_EL, Math.PI / 4, FOV, { d: 100 });
    sol.d = a.d + (b.d - a.d) * .25; solveView(FLAT_EL, 0, FOV_FLAT, viewFlat);
  }
  // o FOV padrão é independente do zoom: a distância compensa e o tabuleiro continua cabendo
  const setFov = v => { FOV = v; if (gl) buildView(); };
  // mola sem tranco: mudar o alvo no meio do caminho não quebra a velocidade
  function damp(o, key, vel, goal, w, dt) {
    const x = w * dt, e = 1 / (1 + x + .48 * x * x + .235 * x * x * x), ch = o[key] - goal, t = (o[vel] + w * ch) * dt;
    o[vel] = (o[vel] - w * t) * e; o[key] = goal + (ch + t) * e;
  }
  const applyView = () => camera.setViewOffset(innerWidth, innerHeight, cam.vxNow, cam.liftNow * innerHeight, innerWidth, innerHeight);
  function fit() {
    const w = innerWidth, h = innerHeight; gl.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    // o meio do tabuleiro fica no meio da área livre, ao lado do painel
    viewX = hudOn && w > 820 ? PANEL / 2 : 0; applyView();
    buildView();
  }
  const shortAngle = (from, to) => { let d = (to - from) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return from + d; };
  function overview(i) { if (i !== undefined) cam.gaz = shortAngle(cam.gaz, 0); cam.gel = OV_EL; }
  const setupView = () => {};
  const setPanel = w => { PANEL = w; if (gl) fit(); };
  const setHud = on => { hudOn = on; fit(); };
  // textos da fileira de cima: para fora no 3D, como os outros lados; de pé só no 2D. A versão de pé só é desenhada se usada
  const topRow = on => { for (let i = 21; i < 30 && tiles[i]; i++) { const t = tiles[i]; t.outMap = t.outMap || t.mat.map; t.mat.map = on ? (t.upMap = t.upMap || tex(Art.tile(i, true))) : t.outMap; } };
  const setFlat = on => { topRow(on); cam.flat = on; cam.snap = Math.round((cam.snap ?? cam.user) / (Math.PI / 2)) * (Math.PI / 2) + (on ? 0 : VIEW0.az); cam.back = true; cam.zg = on ? 1 : VIEW0.zg; cam.vx = cam.vz = cam.va = cam.ve = 0; };
  // de perto dá para passear até a ponta do tabuleiro; sem zoom o centro não sai do lugar
  const panLimit = z => RF * Math.max(0, Math.min(.92, (1 - z) * 1.6));
  // foco na mesa do cassino: a inclinação sobe só o necessário para o que está construído entre a câmera e a mesa não tampar
  const BLD_TOP = [0, 1.1, 1.25, 1.3, 1.9, 2.75];
  function clearEl(f, az) {
    const sa = Math.sin(az), ca = Math.cos(az); let tan = Math.tan(f.el);
    for (const t of tiles) {
      const top = BLD_TOP[t.h] + (t.spons ? 2.2 : 0); if (!top) continue;
      const p = tilePos(t.i), dx = p.x - f.x, dz = p.z - f.z, along = dx * sa + dz * ca;
      if (along > 0 && Math.abs(dx * ca - dz * sa) < f.r + TW) tan = Math.max(tan, top / Math.max(.6, along - f.r));
    }
    return Math.min(EL_MAX - .1, Math.atan(tan) + .04);
  }
  function updateCam(dt) {
    const s = 1 - Math.exp(-dt * 2.6), s2 = 1 - Math.exp(-dt * 2.3);
    damp(cam, 'fz', 'vfz', cam.gfz, 2.4, dt);
    cam.el += (cam.gel - cam.el) * s; cam.az += (cam.gaz - cam.az) * s2;
    if (cam.orbit) cam.gaz += dt * .07;
    // solto, o movimento continua e vai perdendo força
    if (!cam.held) {
      const fr = Math.exp(-dt * 2.6);
      cam.px += cam.vx * dt; cam.pz += cam.vz * dt; cam.user += cam.va * dt; cam.userEl += cam.ve * dt;
      cam.vx *= fr; cam.vz *= fr; cam.va *= fr; cam.ve *= fr;
      if (cam.snap !== null) { damp(cam, 'user', 'vs', cam.snap, 6, dt); if (Math.abs(cam.snap - cam.user) < .002 && Math.abs(cam.vs) < .02) { cam.user = cam.snap; cam.vs = 0; cam.snap = null; } }
      if (cam.back) { const f = Math.exp(-dt * 5); cam.px *= f; cam.pz *= f; if (cam.backEl) cam.userEl *= f; if (Math.hypot(cam.px, cam.pz) < .01 && (!cam.backEl || Math.abs(cam.userEl) < .004)) cam.back = cam.backEl = false; }
      const L = panLimit(cam.zg), r = Math.hypot(cam.px, cam.pz); if (r > L) { const k = 1 + (L / r - 1) * (1 - Math.exp(-dt * 9)); cam.px *= k; cam.pz *= k; cam.vx *= .9; cam.vz *= .9; }
    }
    cam.userEl = Math.max(EL_MIN - cam.el, Math.min(EL_MAX - cam.el, cam.userEl));
    cam.zoom += (cam.zg - cam.zoom) * (1 - Math.exp(-dt * 9));
    damp(cam, 'fl', 'vfl', cam.flat ? 1 : 0, 5, dt); const fl = Math.max(0, Math.min(1, cam.fl));
    const lf = cam.liftNow + (cam.lift * (1 - fl) - cam.liftNow) * (1 - Math.exp(-dt * 10)); const vn = cam.vxNow + (viewX - cam.vxNow) * (1 - Math.exp(-dt * 3.2)); if (Math.abs(lf - cam.liftNow) > 1e-4 || Math.abs(vn - cam.vxNow) > .05) { cam.liftNow = lf; cam.vxNow = vn; applyView(); }
    cam.sd = cam.sd === null ? sol.d : cam.sd + (sol.d - cam.sd) * (1 - Math.exp(-dt * 3.2));
    // câmera dinâmica: vai só um pouco na direção do peão que anda e volta sozinha; de perto acompanha mais, para ele não sumir
    if (cam.follow && (cam.hold -= dt) <= 0) cam.follow = null;
    const fo = cam.dyn && !cam.flat ? cam.follow : null, fk = fo && fo.k ? fo.k : Math.min(1, .09 * (VIEW0.zg / cam.zg) ** 2);
    const fs = fo && fo.table, fsk = 1 - Math.exp(-dt * 2.6);
    cam.zf += ((fs ? Math.min(1, fs.zoom / cam.zoom) : 1) - cam.zf) * fsk; cam.oy += ((fs ? fs.y : 0) - cam.oy) * fsk;
    const elB = Math.max(EL_MIN, Math.min(EL_MAX, cam.el + cam.userEl));
    cam.fe += ((fs ? Math.max(0, clearEl(fs, cam.az + cam.user) - elB) : 0) - cam.fe) * fsk;
    damp(cam, 'ox', 'vox', fo ? fo.position.x * fk : 0, 1.9, dt); damp(cam, 'oz', 'voz', fo ? fo.position.z * fk : 0, 1.9, dt);
    const elU = Math.max(EL_MIN, Math.min(EL_MAX, cam.el + cam.userEl)), el = (elU + cam.fe) * (1 - fl) + FLAT_EL * fl, az = cam.az + cam.user;
    // 3D e 2D: o tamanho na tela anda em linha reta enquanto a distância e o FOV trocam
    const d0 = cam.sd * (1 - fl) + viewFlat.d * fl, d = d0 * cam.dk, tanB = (cam.sd * Math.tan(FOV * Math.PI / 360) * (1 - fl) + viewFlat.d * Math.tan(FOV_FLAT * Math.PI / 360) * fl) / d0, tanN = tanB * cam.fz * cam.zoom * cam.zf;
    const fov = 2 * Math.atan(tanN) * 180 / Math.PI; if (Math.abs(camera.fov - fov) > .002) { camera.fov = fov; camera.updateProjectionMatrix(); }
    cam.wpp = 2 * d * tanN / innerHeight;
    const sa = Math.sin(az), ca = Math.cos(az), y = Math.sin(el) * d, r = Math.cos(el) * d;
    cam.cx = cam.px + cam.ox; cam.cz = cam.pz + cam.oz; scene.fog.near = d + 50; scene.fog.far = d + 540;
    const sx = (Math.random() - .5) * cam.shake, sy = (Math.random() - .5) * cam.shake;
    camera.position.set(cam.cx + sa * r + sx, y + sy + cam.oy, cam.cz + ca * r + sx); camera.lookAt(cam.cx, cam.oy, cam.cz); cam.shake *= Math.exp(-dt * 9);
  }
  // abertura da partida: a câmera vem de longe e do alto, dá meia volta e pousa no padrão
  function introCam(ms) {
    stopCam(); const az0 = cam.flat ? 0 : VIEW0.az, A = az0 + 1.3, E = cam.flat ? 0 : .55, D0 = 2.7;
    cam.dk = D0; cam.user = A; cam.userEl = E;
    return tw(ms, e => { cam.dk = D0 + (1 - D0) * e; cam.user = A + (az0 - A) * e; cam.userEl = E * (1 - e); }, ease.inOut).then(() => { cam.dk = 1; });
  }
  // cassino: a câmera dinâmica vai de leve para a mesa escolhida e se aproxima um pouco
  const RT_AT = [0, 0], RT_SCALE = 2; // a roleta é o centro da mesa; os dados caem no prato fixo do miolo dela
  const TABLES = { roleta: { at: RT_AT, r: 6.2, y: .3, zoom: .5, el: .82 } };
  const focusTable = g => {
    const T = TABLES[g]; if (!T) { cam.follow = null; cam.lift = VIEW0.lift; return; }
    // o painel da aposta fica embaixo: a mesa vai para o meio do que sobra da tela
    const b = document.getElementById('bar')?.offsetHeight || 0, free = Math.max(.35, 1 - b / innerHeight);
    cam.lift = b / 2 / innerHeight; cam.hold = Infinity;
    cam.follow = { position: { x: T.at[0], z: T.at[1] }, k: 1, table: { x: T.at[0], z: T.at[1], r: T.r, y: T.y, el: T.el, zoom: T.zoom / free } };
  };
  const shake = v => { cam.shake = Math.max(cam.shake, v); };
  const toScreen = (x, y, z) => { const v = new THREE.Vector3(x, y, z).project(camera); return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight }; };
  // ponto no mundo atrás de um ponto da tela, para a moeda chegar voando até o placar
  const fromScreen = (px, py, dist = 24) => { const v = new THREE.Vector3(px / innerWidth * 2 - 1, -(py / innerHeight * 2 - 1), .5).unproject(camera); return v.sub(camera.position).normalize().multiplyScalar(dist).add(camera.position); };

  // ---------- posições ----------
  const CORNERS = { 0: [1, 1], 10: [-1, 1], 20: [-1, -1], 30: [1, -1] };
  function tilePos(i) {
    if (CORNERS[i]) { const [a, b] = CORNERS[i], m = H + TD / 2; return { x: a * m, z: b * m }; }
    const s = sideOf(i), k = i - s * 10 - .5, m = H + TD / 2, t = H - k * TW;
    return [{ x: t, z: m }, { x: -m, z: t }, { x: -t, z: -m }, { x: m, z: -t }][s];
  }
  function roadPos(i) { // centro da rua na frente da casa
    if (CORNERS[i]) { const [a, b] = CORNERS[i], c = R1 - RHO1, m = c + (RHO1 + RW / 2) * Math.SQRT1_2; return { x: a * m, z: b * m, tx: a, tz: -b }; }
    const s = sideOf(i), k = i - s * 10 - .5, t = H - k * TW;
    return [{ x: t, z: RC, tx: 1, tz: 0 }, { x: -RC, z: t, tx: 0, tz: 1 }, { x: -t, z: -RC, tx: 1, tz: 0 }, { x: RC, z: -t, tx: 0, tz: 1 }][s];
  }

  // ---------- montagem ----------
  const tiles = [];
  const DISH_Y = .38, FLOOR = .02 + DISH_Y * RT_SCALE; // altura do prato da roleta, onde os dados param
  let fieldMat, contactMat, contactMesh, rig, sun;
  let fieldHex = '#262626';
  const setFieldColor = c => { fieldHex = c; fieldMat.color.copy(lin(c)); };
  function buildEnv() {
    const s = new THREE.Scene(); s.background = new THREE.Color(0x0e0b09);
    const panel = (w, h, x, y, z, c, v) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(v), side: THREE.DoubleSide })); m.position.set(x, y, z); m.lookAt(0, 0, 0); s.add(m); };
    panel(40, 18, 0, 34, -10, 0xfff0d8, 1.15); panel(16, 26, -38, 16, 16, 0xffdcb0, 1.15); panel(14, 20, 38, 14, 8, 0xbcd4ff, .7); panel(50, 6, 0, 8, 44, 0xffe6c8, .65); panel(60, 60, 0, -30, 0, 0x3a2a20, .25);
    const pm = new THREE.PMREMGenerator(gl); const rt = pm.fromScene(s, .035); pm.dispose(); return rt.texture;
  }
  function tileGeo(w, d, bevel = .045) {
    const s = new THREE.Shape(); rrect(s, -w / 2 + bevel, -d / 2 + bevel, w - bevel * 2, d - bevel * 2, .08);
    const g = new THREE.ExtrudeGeometry(s, { depth: .22, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 4 }); g.rotateX(-Math.PI / 2); return mapUV(g, w, d);
  }
  // teste: sem o vão entre os ladrilhos
  let gStreet, gJoined;
  const setJoined = on => { gJoined = gJoined || mapUV((() => { const s = new THREE.Shape(); s.moveTo(-TW / 2, -(TD - .05) / 2); s.lineTo(TW / 2, -(TD - .05) / 2); s.lineTo(TW / 2, (TD - .05) / 2); s.lineTo(-TW / 2, (TD - .05) / 2); s.closePath(); const g = new THREE.ExtrudeGeometry(s, { depth: .22, bevelEnabled: true, bevelThickness: .012, bevelSize: .001, bevelSegments: 1 }); g.rotateX(-Math.PI / 2); return g; })(), TW, TD - .05); tiles.forEach(t => { if (!CORNERS[t.i]) t.mesh.geometry = on ? gJoined : gStreet; }); };
  function cornerGeo() {
    const c = TD / 2, b = .045, m = c - b, r = RHO1 - b;
    // o canto externo (x+, z+ depois de girar) é o redondo: em y da forma isso é -m
    const q = new THREE.Shape(); q.moveTo(-m, m); q.lineTo(m, m); q.lineTo(m, -m + r); q.absarc(m - r, -m + r, r, 0, -Math.PI / 2, true); q.lineTo(-m, -m); q.closePath();
    const g = new THREE.ExtrudeGeometry(q, { depth: .22, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 3, curveSegments: 18 }); g.rotateX(-Math.PI / 2); return mapUV(g, TD, TD);
  }
  function mapUV(g, w, d) { const p = g.attributes.position, u = g.attributes.uv; for (let i = 0; i < p.count; i++) u.setXY(i, (p.getX(i) + w / 2) / w, 1 - (p.getZ(i) + d / 2) / d); return g; }

  // piso embaixo da mesa: feltro ou tábuas de madeira
  let floorMesh = null; const floorMaps = {}; const FLOORS = { feltro: { bg: '#17392b', rep: 360, glow: .32, art: () => Art.felt() }, madeira: { bg: '#3d2717', rep: 40, glow: .3, art: () => Art.planks() } };
  function setFloor(kind) {
    const f = FLOORS[kind] || FLOORS.feltro, m = floorMesh.material;
    if (!floorMaps[kind]) { const t = tex(f.art()); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(f.rep, f.rep); floorMaps[kind] = t; }
    m.map = m.emissiveMap = floorMaps[kind]; m.emissiveIntensity = f.glow; m.needsUpdate = true;
    scene.background.set(f.bg); scene.fog.color.set(f.bg);
  }
  function buildBoard(bar) {
    const woodMap = tex(Art.wood(), {}); woodMap.wrapS = woodMap.wrapT = THREE.RepeatWrapping; woodMap.repeat.set(.05, .16);
    const brass = new THREE.MeshStandardMaterial({ color: lin('#1a1613'), roughness: .5 });
    // feltro da mesa, com a sombra de contato do tabuleiro
    const FLOOR_Y = -.62, feltMap = tex(Art.felt()); feltMap.wrapS = feltMap.wrapT = THREE.RepeatWrapping; feltMap.repeat.set(360, 360);
    const floor = floorMesh = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600), new THREE.MeshStandardMaterial({ map: feltMap, color: lin('#c8c8c8'), emissive: 0xffffff, emissiveMap: feltMap, emissiveIntensity: .32, roughness: 1, envMapIntensity: 0 })); floor.rotation.x = -Math.PI / 2; floor.position.y = FLOOR_Y; floor.receiveShadow = true; floor.userData.stay = true; scene.add(floor);
    const sc = document.createElement('canvas'); sc.width = sc.height = 512; const q = sc.getContext('2d'), P = RF + 5, pp = v => (v + P) / (2 * P) * 512; q.filter = 'blur(14px)'; q.fillStyle = 'rgba(0,0,0,.7)'; q.beginPath(); q.roundRect(pp(-RF), pp(-RF), pp(RF) - pp(-RF), pp(RF) - pp(-RF), 24); q.fill();
    const contact = new THREE.Mesh(new THREE.PlaneGeometry(P * 2, P * 2), new THREE.MeshBasicMaterial({ map: tex(sc), transparent: true, depthWrite: false })); contact.rotation.x = -Math.PI / 2; contact.position.y = FLOOR_Y + .04; contact.userData.stay = true; contactMat = contact.material; contactMesh = contact; scene.add(contact);
    const us = new THREE.Shape(); rrect(us, -RF, -RF, RF * 2, RF * 2, RHO2 + .28); const ug = new THREE.ShapeGeometry(us, 16), up = ug.attributes.position, uu = ug.attributes.uv; for (let i = 0; i < up.count; i++) uu.setXY(i, (up.getX(i) + RF) / (2 * RF), (up.getY(i) + RF) / (2 * RF)); ug.rotateX(Math.PI / 2);
    add(ug, new THREE.MeshStandardMaterial({ map: tex(Art.under()), roughness: .7 }), 0, FLOOR_Y - .09, 0, scene, false, false);
    // moldura baixa e lisa: é só o acabamento, o foco fica nas casas
    const frame = new THREE.Shape(); rrect(frame, -RF, -RF, RF * 2, RF * 2, RHO2 + .28);
    const hole = new THREE.Path(); rrect(hole, -R2, -R2, R2 * 2, R2 * 2, RHO2); frame.holes.push(hole);
    const fg = new THREE.ExtrudeGeometry(frame, { depth: .68, bevelEnabled: true, bevelThickness: .09, bevelSize: .09, bevelSegments: 4, curveSegments: 24 }); fg.rotateX(-Math.PI / 2); add(fg, new THREE.MeshPhysicalMaterial({ map: woodMap, color: lin('#2a2623'), roughness: .66, clearcoat: .1, clearcoatRoughness: .4, envMapIntensity: .18 }), 0, FLOOR_Y + .02, 0);
    const inlay = (a, b, r0, r1, y, t) => { const o = new THREE.Shape(); rrect(o, -a, -a, a * 2, a * 2, r0); const i = new THREE.Path(); rrect(i, -b, -b, b * 2, b * 2, r1); o.holes.push(i); const g = new THREE.ExtrudeGeometry(o, { depth: t, bevelEnabled: false, curveSegments: 20 }); g.rotateX(-Math.PI / 2); return add(g, brass, 0, y, 0, scene, false); };
    // base funda sob a rua e os ladrilhos
    const base = new THREE.Shape(); rrect(base, -R2 - .1, -R2 - .1, (R2 + .1) * 2, (R2 + .1) * 2, RHO2); const bg = new THREE.ExtrudeGeometry(base, { depth: .4, bevelEnabled: false, curveSegments: 16 }); bg.rotateX(-Math.PI / 2); add(bg, std('#3a4048', { roughness: .9 }), 0, -.7, 0, scene, false);
    // rua de asfalto: uma textura só para o anel inteiro, então nenhum buraco se repete
    bar(.12);
    const asf = Art.asphalt(R1, R2, RHO1), ct = tex(asf.color), cb = tex(asf.bump, { linear: true });
    for (const t of [ct, cb]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1 / (2 * R2), 1 / (2 * R2)); t.offset.set(.5, .5); }
    const road = new THREE.Shape(); rrect(road, -R2, -R2, R2 * 2, R2 * 2, RHO2); const rh = new THREE.Path(); rrect(rh, -R1, -R1, R1 * 2, R1 * 2, RHO1); road.holes.push(rh);
    const rg = new THREE.ExtrudeGeometry(road, { depth: .1, bevelEnabled: false, curveSegments: 24 }); rg.rotateX(-Math.PI / 2); add(rg, new THREE.MeshStandardMaterial({ map: ct, bumpMap: cb, bumpScale: .07, roughness: .96, envMapIntensity: .3 }), 0, -.16, 0, scene, false);
    inlay(R2, R2 - .05, RHO2, RHO2 - .05, -.06, .1).material = std('#141210', { roughness: .6 });
    // miolo: calçada portuguesa
    bar(.22); const N = Math.min(4096, gl.capabilities.maxTextureSize), mos = Art.mosaic(N);
    bar(.42);
    fieldMat = new THREE.MeshStandardMaterial({ map: tex(mos.color), bumpMap: tex(mos.bump, { linear: true }), bumpScale: .045, roughness: 1, envMapIntensity: .15 });
    const field = new THREE.Mesh(new THREE.PlaneGeometry(H * 2, H * 2), fieldMat); field.rotation.x = -Math.PI / 2; field.position.y = .02; field.receiveShadow = true; scene.add(field);
    // moldura de latão entre o miolo e os ladrilhos
    inlay(H + .02, H - .1, .05, .05, .02, .06);
    // ladrilhos
    gStreet = tileGeo(TW - .05, TD - .05); const gCorner = cornerGeo();
    for (let i = 0; i < 40; i++) {
      bar(.42 + i / 40 * .5);
      const q = PD.SQ[i], isC = !!CORNERS[i], map = tex(isC ? Art.corner(i) : Art.tile(i));
      const mat = new THREE.MeshStandardMaterial({ map, roughness: .92, envMapIntensity: .35 }); // fosco: o reflexo apagava o texto
      const p = tilePos(i), g = new THREE.Group(); g.position.set(p.x, 0, p.z); g.rotation.y = SIDE[sideOf(i)]; scene.add(g);
      const mesh = add(isC ? gCorner : gStreet, mat, 0, -.17, 0, g); mesh.userData.sq = i;
      const lots = new THREE.Group(); g.add(lots);
      tiles.push({ i, q, g, mesh, mat, lots, flag: null, stamp: null, h: 0 });
    }
    buildJail(brass);
    buildCorners();
    buildDecks();
    casinoBuild();
    bar(.95);
  }
  let jailGate, jailLamps = [];
  const spinners = [];
  function starGeo(r, inner = .42) { const s = new THREE.Shape(); for (let k = 0; k < 10; k++) { const a = Math.PI / 2 + k * Math.PI / 5, q = k % 2 ? r * inner : r; k ? s.lineTo(Math.cos(a) * q, Math.sin(a) * q) : s.moveTo(Math.cos(a) * q, Math.sin(a) * q); } s.closePath(); const g = new THREE.ExtrudeGeometry(s, { depth: r * .25, bevelEnabled: true, bevelThickness: r * .06, bevelSize: r * .05, bevelSegments: 2 }); g.center(); return g; }
  // cada esquina ganha sua peça, como a cela da Delegacia. O canto de dentro é (-, -) em todas
  function buildCorners() {
    const gold = std('#e6b84a', { roughness: .32, metalness: .55, envMapIntensity: .8 }), marble = std('#efe7d6', { roughness: .5 });
    // Marco Zero: obelisco de pedra com bandeira
    let g = new THREE.Group(); g.position.set(-.62, 0, -.62); tiles[0].g.add(g);
    add(new THREE.BoxGeometry(.8, .12, .8), std('#a59c8c', { roughness: .85 }), 0, .1, 0, g); add(new THREE.BoxGeometry(.56, .16, .56), marble, 0, .24, 0, g);
    const ob = add(new THREE.CylinderGeometry(.1, .23, 1.75, 4), marble, 0, 1.2, 0, g); ob.rotation.y = Math.PI / 4;
    const tip = add(new THREE.ConeGeometry(.145, .24, 4), gold, 0, 2.2, 0, g); tip.rotation.y = Math.PI / 4;
    add(new THREE.CylinderGeometry(.018, .018, 2.05, 8), grayMat(), .36, 1.1, -.36 + .72 * 0, g);
    add(new THREE.BoxGeometry(.62, .36, .02), std('#2563eb', { roughness: .7 }), .68, 1.9, -.36, g);
    // Patrocinador: troféu dourado no pedestal com estrela girando
    g = new THREE.Group(); g.position.set(-.82, 0, -.82); tiles[20].g.add(g);
    add(new THREE.BoxGeometry(.72, .22, .72), marble, 0, .13, 0, g); add(new THREE.BoxGeometry(.5, .14, .5), std('#2c9a68', { roughness: .6 }), 0, .31, 0, g);
    const prof = [[.001, 0], [.26, 0], [.26, .05], [.08, .12], [.06, .42], [.14, .5], [.33, .72], [.38, 1.12], [.34, 1.12], [.28, .78], [.001, .6]].map(([a, b]) => new THREE.Vector2(a, b));
    add(new THREE.LatheGeometry(prof, 28), gold, 0, .38, 0, g);
    for (const sx of [-1, 1]) { const h = add(new THREE.TorusGeometry(.17, .03, 10, 20), gold, sx * .39, 1.2, 0, g); h.rotation.y = 0; }
    const star = add(starGeo(.26), gold, 0, 1.9, 0, g); spinners.push(star);
    // Blitz: cancela listrada, cones e placa de pare
    g = new THREE.Group(); g.position.set(-.72, 0, -.72); g.rotation.y = Math.PI / 4; tiles[30].g.add(g);
    const stripe = (w, h, a, b, txt) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.fillStyle = a; x.fillRect(0, 0, w, h); x.fillStyle = b; for (let k = -h; k < w; k += 48) { x.beginPath(); x.moveTo(k, h); x.lineTo(k + 24, h); x.lineTo(k + 24 + h, 0); x.lineTo(k + h, 0); x.fill(); } return tex(c); };
    add(new THREE.BoxGeometry(2, .17, .07), std('#ffffff', { map: stripe(384, 32, '#f4f1e8', '#c8342e'), roughness: .6 }), 0, .78, 0, g);
    for (const sx of [-1, 1]) { add(new THREE.BoxGeometry(.11, .86, .11), std('#2a2a2e', { roughness: .5 }), sx * .88, .43, 0, g); add(new THREE.SphereGeometry(.075, 12, 10), new THREE.MeshStandardMaterial({ color: lin('#ff5a45'), emissive: lin('#ff2a1a'), emissiveIntensity: .9 }), sx * .88, .93, 0, g); }
    const coneM = std('#ee6a1f', { roughness: .6 }), band = std('#fffaf0', { roughness: .6 });
    for (const [a, b] of [[-.55, .5], [.55, .5], [0, .78]]) { add(new THREE.BoxGeometry(.3, .03, .3), std('#2a2a2e'), a, .065, b, g); add(new THREE.ConeGeometry(.12, .42, 16), coneM, a, .29, b, g); add(new THREE.CylinderGeometry(.062, .083, .08, 16), band, a, .27, b, g, false); }
    const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'); x.fillStyle = '#c8222a'; x.beginPath(); for (let k = 0; k < 8; k++) { const a = Math.PI / 8 + k * Math.PI / 4; x.lineTo(64 + Math.cos(a) * 62, 64 + Math.sin(a) * 62); } x.fill(); x.fillStyle = '#fff'; x.font = '900 42px Nunito, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('PARE', 64, 66);
    add(new THREE.CylinderGeometry(.022, .022, 1.5, 8), grayMat(), 0, .75, -.3, g);
    const sign = new THREE.Mesh(new THREE.CircleGeometry(.34, 8), new THREE.MeshStandardMaterial({ map: tex(c), roughness: .5, side: THREE.DoubleSide, transparent: true })); sign.position.set(0, 1.52, -.27); g.add(sign);
  }
  const grayMat = () => G.pole || (G.pole = std('#6b6b70', { roughness: .5, metalness: .4 }));
  function buildJail(brass) {
    // grades de ferro: sobem para o preso entrar e descem atrás dele
    const t = tiles[10], iron = std('#20201f', { metalness: .7, roughness: .45 }), m = TD / 2, inner = -m + TD * (610 / 870);
    jailGate = new THREE.Group(); t.g.add(jailGate);
    const g = new THREE.CylinderGeometry(.035, .035, 1.1, 8);
    for (let k = 0; k < 9; k++) { const a = -m + .12 + k * ((inner + m - .14) / 8); add(g, iron, a, .55, inner, jailGate); add(g, iron, inner, .55, a, jailGate); }
    for (const y of [.14, 1.02]) { const bx = new THREE.BoxGeometry(inner + m, .07, .07); add(bx, iron, (inner - m) / 2, y, inner, jailGate); const bz = new THREE.BoxGeometry(.07, .07, inner + m); add(bz, iron, inner, y, (inner - m) / 2, jailGate); }
    const cp = new THREE.BoxGeometry(.13, 1.26, .13); add(cp, iron, inner, .63, inner, t.g);
    // giroflex discreto no poste da esquina: só acende quando alguém é preso
    for (const [c, dx] of [['#e0352b', -.1], ['#2b6fe0', .1]]) { const mat = new THREE.MeshStandardMaterial({ color: lin(c), emissive: lin(c), emissiveIntensity: .05, roughness: .4 }); add(new THREE.SphereGeometry(.1, 14, 10), mat, inner + dx, 1.33, inner, t.g); jailLamps.push(mat); }
  }
  const gate = open => { const y0 = jailGate.position.y, y1 = open ? 1.28 : 0; return tw(open ? 200 : 240, k => { jailGate.position.y = y0 + (y1 - y0) * k; }, open ? ease.out : k => k * k); };
  function blinkLamps(ms = 1500) { tw(ms, (_, k) => { const p = Math.sin(k * Math.PI * 7), fade = Math.min(1, (1 - k) * 4); jailLamps[0].emissiveIntensity = .05 + Math.max(0, p) * 2.2 * fade; jailLamps[1].emissiveIntensity = .05 + Math.max(0, -p) * 2.2 * fade; }); }
  const decks = {};
  const CW = 2.1, CD = 2.95, DECK_N = 15, DECK_GAP = .027;
  function cardGeo() { const s = new THREE.Shape(); rrect(s, -CW / 2, -CD / 2, CW, CD, .17); const g = new THREE.ExtrudeGeometry(s, { depth: .017, bevelEnabled: false, curveSegments: 6 }); g.rotateX(-Math.PI / 2); return mapUV(g, CW, CD); }
  function buildDecks() {
    const geo = cardGeo(), ST = DECK_N, GAP = DECK_GAP;
    for (const [deck, x, z, rot, tint] of [['destino', -5.9, -5.9, Math.PI * .25, '#1f4fb8'], ['mutirao', 5.9, 5.9, Math.PI * 1.25, '#c95f2b']]) {
      const backT = tex(Art.cardBack(deck)), top = new THREE.MeshPhysicalMaterial({ map: backT, roughness: .5, clearcoat: .35, clearcoatRoughness: .25 }), under = std(tint, { roughness: .7 }), edges = [std('#f6f1e4', { roughness: .85 }), std('#ddd5c2', { roughness: .85 })];
      const g = new THREE.Group(); g.position.set(x, .03, z); g.rotation.y = rot; scene.add(g);
      // cartas soltas umas sobre as outras, cada uma um pouco fora do lugar
      for (let i = 0; i < ST; i++) { const m = add(geo, [i === ST - 1 ? top : under, edges[i % 2]], (Math.random() - .5) * .05, i * GAP, (Math.random() - .5) * .05, g); m.rotation.y = (Math.random() - .5) * .05; }
      const topY = ST * GAP, fly = add(geo, [top, edges[0]], 0, topY, 0, g); fly.visible = false;
      decks[deck] = { g, fly, topY };
    }
  }
  async function liftCard(deck) { // a carta de cima sobe e vira de lado; a tela assume dali, continuando o giro
    const d = decks[deck], f = d.fly; f.visible = true; f.position.set(0, d.topY, 0); f.rotation.set(0, 0, 0);
    await tw(230, (e, k) => { f.position.y = d.topY + e * 3.4; f.rotation.z = k * k * Math.PI / 2; f.rotation.x = Math.sin(k * Math.PI) * .22; }, ease.out);
    const w = new THREE.Vector3(); f.getWorldPosition(w); const pt = toScreen(w.x, w.y, w.z); f.visible = false; return pt;
  }
  const deckPoint = deck => { const w = new THREE.Vector3(); decks[deck].g.getWorldPosition(w); return toScreen(w.x, w.y + .5, w.z); };

  // ---------- peças ----------
  const tokens = [];
  const hullMat = new THREE.MeshBasicMaterial({ color: 0x1b1512, side: THREE.BackSide });
  // contorno de desenho animado: a mesma forma, por trás e um pouco maior
  const hull = (m, s = 1.05) => { const h = new THREE.Mesh(m.geometry, hullMat); h.scale.setScalar(s); m.add(h); return m; };
  function tokenModel(id, color) {
    const g = new THREE.Group(), tint = new THREE.Color(color).lerp(new THREE.Color('#ffffff'), .28), body = new THREE.MeshPhysicalMaterial({ color: lin(color), roughness: .34, clearcoat: .75, clearcoatRoughness: .2 }), trim = new THREE.MeshPhysicalMaterial({ color: tint.convertSRGBToLinear(), roughness: .34, clearcoat: .75, clearcoatRoughness: .2 });
    const curve = pts => new THREE.SplineCurve(pts.map(([a, b]) => new THREE.Vector2(a, b))).getPoints(36);
    const lathe = (pts, mat, y = 0, parent = g) => add(new THREE.LatheGeometry(pts, 48), mat, 0, y, 0, parent);
    // peão de tabuleiro: base larga e baixa, cintura fina, colarinho e cabeça redonda
    hull(lathe([new THREE.Vector2(0, 0), new THREE.Vector2(.39, 0), ...curve([[.415, .035], [.405, .085], [.32, .135], [.235, .215], [.175, .36], [.135, .53], [.125, .615]]), new THREE.Vector2(.08, .66), new THREE.Vector2(0, .66)], body));
    hull(lathe(curve([[.13, .61], [.205, .635], [.215, .665], [.16, .695], [.09, .705]]), trim), 1.05);
    hull(add(new THREE.SphereGeometry(.215, 32, 24), body, 0, .88, 0, g), 1.055);
    add(new THREE.TorusGeometry(.385, .017, 8, 48), trim, 0, .09, 0, g).rotation.x = Math.PI / 2;
    const hat = new THREE.Group(); hat.position.y = 1.0; g.add(hat);
    const part = (geo, mat, x = 0, y = 0, z = 0, s = 1.06) => hull(add(geo, mat, x, y, z, hat), s);
    const disc = (r0, r1, h, mat, y, sx = 1, sz = 1) => { const m = part(new THREE.CylinderGeometry(r0, r1, h, 36), mat, 0, y); m.scale.set(sx, 1, sz); return m; };
    const lat = (pts, mat, y, sz = 1) => { const m = hull(add(new THREE.LatheGeometry(curve(pts), 40), mat, 0, y, 0, hat), 1.05); m.scale.z = sz; return m; };
    if (id === 'palha') { // abas largas e onduladas, fita na cor do jogador
      const straw = std('#e6c67c', { roughness: .85 }), dark = std('#b9944f', { roughness: .85 });
      lat([[.14, .015], [.28, -.005], [.4, .012], [.45, .045], [.4, .03], [.28, .018], [.14, .03]], straw, -.03);
      lat([[.18, 0], [.175, .07], [.15, .14], [.09, .175], [.001, .185]], straw, -.015);
      add(new THREE.CylinderGeometry(.181, .186, .05, 36, 1, true), new THREE.MeshStandardMaterial({ color: lin(color), side: THREE.DoubleSide }), 0, .012, 0, hat);
      for (const r of [.26, .34]) add(new THREE.TorusGeometry(r, .005, 5, 40), dark, 0, -.018, 0, hat).rotation.x = Math.PI / 2;
    } else if (id === 'bone') { // boné de aba curva e botão no topo
      const cap = std('#fbf7ec', { roughness: .6 }), m = part(new THREE.SphereGeometry(.225, 28, 14, 0, 6.283, 0, Math.PI / 2), cap, 0, -.06, 0, 1.05); m.scale.y = .86;
      const visor = part(new THREE.CylinderGeometry(.225, .235, .02, 28, 1, false, -Math.PI / 2.6, Math.PI / 1.3), body, 0, -.055, .045, 1.06); visor.scale.z = 1.45;
      add(new THREE.SphereGeometry(.028, 10, 8), body, 0, .135, 0, hat);
      add(new THREE.CylinderGeometry(.228, .228, .035, 28, 1, true), new THREE.MeshStandardMaterial({ color: lin(color), side: THREE.DoubleSide }), 0, -.045, 0, hat);
    } else if (id === 'cangaco') { // meia-lua de couro na frente e atrás, com estrela e tachas
      const leather = std('#7a4a26', { roughness: .62 }), gold = std('#e0b24e', { metalness: .55, roughness: .38 }), crown = disc(.165, .205, .13, leather, -.01, 1, .92);
      const moon = new THREE.Shape(); moon.moveTo(-.36, 0); moon.quadraticCurveTo(-.3, .3, 0, .33); moon.quadraticCurveTo(.3, .3, .36, 0); moon.quadraticCurveTo(0, .09, -.36, 0);
      const mg = new THREE.ExtrudeGeometry(moon, { depth: .03, bevelEnabled: false, curveSegments: 16 });
      part(mg, leather, 0, -.09, .13, 1.04).rotation.x = -.2; const back = part(mg, leather, 0, -.09, -.13, 1.04); back.rotation.set(.2, Math.PI, 0);
      const st = new THREE.Shape(); for (let k = 0; k < 10; k++) { const a = k / 10 * 6.283 + Math.PI / 2, r = k % 2 ? .035 : .085; k ? st.lineTo(Math.cos(a) * r, Math.sin(a) * r) : st.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
      add(new THREE.ExtrudeGeometry(st, { depth: .012, bevelEnabled: false }), gold, 0, .05, .178, hat).rotation.x = -.2;
      for (const x of [-.26, -.16, .16, .26]) add(new THREE.SphereGeometry(.016, 8, 6), gold, x, Math.abs(x) > .2 ? -.015 : .045, .158, hat);
    } else if (id === 'cartola') { // copa um pouco alargada no alto, faixa na cor do jogador
      const black = std('#1c1c20', { roughness: .36 });
      lat([[.16, 0], [.26, .002], [.335, .03], [.34, .05], [.26, .03], [.16, .03]], black, -.05);
      lat([[.17, 0], [.16, .13], [.175, .29], [.19, .335], [.09, .345], [.001, .345]], black, -.03);
      add(new THREE.CylinderGeometry(.166, .172, .065, 32, 1, true), new THREE.MeshStandardMaterial({ color: lin(color), side: THREE.DoubleSide }), 0, .005, 0, hat);
    } else if (id === 'sertanejo') { // aba curvada para cima dos lados, vinco na copa e fivela
      const felt = std('#b08150', { roughness: .72 }), band = std('#3a2616'), gold = std('#e0b24e', { metalness: .55, roughness: .38 });
      lat([[.15, .012], [.27, .012], [.38, .065], [.46, .15], [.43, .13], [.3, .04], [.15, .04]], felt, -.05, .76);
      const crown = lat([[.17, 0], [.165, .1], [.15, .18], [.08, .215], [.001, .19]], felt, -.03, .86); crown.rotation.y = .001;
      const bd = add(new THREE.CylinderGeometry(.171, .175, .05, 32, 1, true), band, 0, -.008, 0, hat); bd.scale.z = .86; bd.material.side = THREE.DoubleSide;
      add(new THREE.BoxGeometry(.05, .05, .012), gold, 0, -.008, .15, hat);
    } else if (id === 'coroa') { // aro dourado com pontas e pedras vermelhas, forro na cor do jogador
      const gold = std('#e8bb45', { metalness: .55, roughness: .34 }), ruby = std('#c9202e', { roughness: .3 });
      const lining = part(new THREE.SphereGeometry(.17, 24, 12, 0, 6.283, 0, Math.PI / 2), body, 0, -.02, 0, 1); lining.scale.y = .7;
      disc(.205, .19, .11, gold, .02);
      for (let k = 0; k < 6; k++) { const a = k / 6 * 6.283, x = Math.cos(a) * .19, z = Math.sin(a) * .19; part(new THREE.ConeGeometry(.058, .13, 12), gold, x, .14, z, 1.08); add(new THREE.SphereGeometry(.027, 10, 8), ruby, x, .215, z, hat); }
    } else if (id === 'obra') { // capacete de obra: casco amarelo, friso no meio e aba curta
      const yellow = std('#f2c230', { roughness: .4 });
      const dome = part(new THREE.SphereGeometry(.235, 28, 14, 0, 6.283, 0, Math.PI / 2), yellow, 0, -.05, 0, 1.05); dome.scale.y = .92;
      disc(.285, .285, .028, yellow, -.055, 1, 1.08);
      part(new THREE.BoxGeometry(.075, .05, .42), yellow, 0, .155, 0, 1.06);
      add(new THREE.CylinderGeometry(.238, .238, .03, 28, 1, true), new THREE.MeshStandardMaterial({ color: lin(color), side: THREE.DoubleSide }), 0, -.02, 0, hat);
    } else if (id === 'chef') { // chapéu de cozinheiro: faixa reta e topo fofo
      const white = std('#fbf7ec', { roughness: .75 });
      disc(.18, .175, .17, white, .05);
      const puff = part(new THREE.SphereGeometry(.24, 24, 14), white, 0, .235, 0, 1.05); puff.scale.y = .62;
      for (let k = 0; k < 5; k++) { const a = k / 5 * 6.283; add(new THREE.SphereGeometry(.09, 12, 10), white, Math.cos(a) * .15, .25, Math.sin(a) * .15, hat); }
      add(new THREE.CylinderGeometry(.183, .183, .04, 28, 1, true), new THREE.MeshStandardMaterial({ color: lin(color), side: THREE.DoubleSide }), 0, -.02, 0, hat);
    } else if (id === 'boina') { // boina caída para o lado, com pino no topo
      const wool = std('#7c2632', { roughness: .95 });
      const top = part(new THREE.SphereGeometry(.3, 28, 16), wool, .05, .05, 0, 1.05); top.scale.y = .3; top.rotation.z = -.16;
      add(new THREE.CylinderGeometry(.018, .018, .05, 8), wool, .07, .14, 0, hat);
      disc(.195, .195, .05, std('#5c1a24', { roughness: .95 }), -.015);
    } else if (id === 'festa') { // chapéu de festa: cone na cor do jogador, listras douradas e pompom
      const gold = std('#f1c74f', { roughness: .4 });
      part(new THREE.ConeGeometry(.2, .52, 28), body, 0, .22, 0, 1.05);
      for (const [y, r] of [[.09, .158], [.23, .102], [.34, .057]]) add(new THREE.TorusGeometry(r, .012, 6, 28), gold, 0, y, 0, hat).rotation.x = Math.PI / 2;
      part(new THREE.SphereGeometry(.058, 14, 10), gold, 0, .5, 0, 1.08);
    } else if (id === 'quepe') { // quepe: topo largo, viseira preta e distintivo
      const navy = std('#1f2c4f', { roughness: .55 }), black = std('#111114', { roughness: .3 }), gold = std('#e0b24e', { metalness: .55, roughness: .38 });
      disc(.19, .19, .1, navy, .0);
      disc(.31, .2, .1, navy, .09);
      const visor = part(new THREE.CylinderGeometry(.22, .24, .022, 28, 1, false, -Math.PI / 2.6, Math.PI / 1.3), black, 0, -.04, .05, 1.06); visor.scale.z = 1.45;
      add(new THREE.BoxGeometry(.07, .08, .015), gold, 0, .05, .192, hat);
    }
    return g;
  }
  const K1 = 1.42, KS = [K1, K1, 1.14, .98, .86, .78, .74];
  function addPlayers(players) {
    players.forEach(p => { const m = tokenModel(p.token, p.color); scene.add(m); tokens[p.i] = { m, p, at: 0, inJail: false, phase: Math.random() * 6, k: K1, kGoal: K1, sx: 1, sy: 1, slide: 0 }; });
    layoutTokens(true);
  }
  // foto do personagem flutuando sobre a peça, pequena para não tampar as casas
  function setFace(i, url, color) { attachFace(tokens[i].m, url, color); }
  function attachFace(model, url, color) {
    const img = new Image(); img.onload = () => {
      const cv = document.createElement('canvas'); cv.width = cv.height = 128; const x = cv.getContext('2d');
      x.beginPath(); x.arc(64, 64, 57, 0, 7); x.save(); x.clip(); x.drawImage(img, 0, 0, 128, 128); x.restore(); x.lineWidth = 10; x.strokeStyle = color; x.stroke();
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex(cv), depthWrite: false, toneMapped: false })); s.scale.setScalar(.62); s.position.y = 1.62; model.add(s);
    }; img.src = url;
  }
  // quem assiste: peões em fila no piso, na frente da mesa, com o nome em cima
  const specs = new Map();
  function setSpectators(list) {
    for (const [id, s] of specs) if (!list.some(p => p.id === id)) { scene.remove(s.m); specs.delete(id); }
    list.forEach((p, k) => {
      let s = specs.get(p.id);
      if (!s) {
        const m = tokenModel('peao', p.color); m.userData.stay = true; m.scale.setScalar(K1); m.rotation.y = Math.PI; scene.add(m); attachFace(m, p.face, p.color);
        const c = document.createElement('canvas'); c.width = 320; c.height = 64; const x = c.getContext('2d'); x.font = "800 34px Nunito, sans-serif"; x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineWidth = 7; x.strokeStyle = '#241d17'; x.strokeText(p.name, 160, 32, 300); x.fillStyle = '#fff'; x.fillText(p.name, 160, 32, 300);
        const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex(c), transparent: true, depthWrite: false, toneMapped: false })); tag.scale.set(1.5, .3, 1); tag.position.y = 2.1; m.add(tag);
        s = { m, busy: false }; specs.set(p.id, s);
      }
      s.m.position.set((k - (list.length - 1) / 2) * 2.1, -.62, RF + 1.5);
    });
  }
  function specAct(id, k) {
    const s = specs.get(id); if (!s || s.busy) return; s.busy = true;
    const m = s.m, y0 = m.position.y, r0 = m.rotation.y, h = k === 'pular' ? 1.7 : k === 'festa' ? .9 : .25, hops = k === 'festa' ? 3 : 1, turns = k === 'pular' ? 0 : k === 'girar' ? 2 : 1;
    tw(k === 'pular' ? 620 : 950, (_, p) => { m.position.y = y0 + Math.abs(Math.sin(p * Math.PI * hops)) * h; m.rotation.y = r0 + p * turns * Math.PI * 2; }).then(() => { m.position.y = y0; m.rotation.y = r0; s.busy = false; });
  }
  function restSpot(i, order, n, inJail) {
    if (inJail) { const t = tiles[10], m = TD / 2, a = -m + .75 + (order % 3) * .62, b = -m + .75 + Math.floor(order / 3) * .62, c = Math.cos(t.g.rotation.y), s = Math.sin(t.g.rotation.y); return { x: t.g.position.x + a * c + b * s, z: t.g.position.z - a * s + b * c }; }
    // até 3 em fila na rua; a partir de 4, duas filas
    const r = roadPos(i), row = n > 3 ? Math.ceil(n / 2) : n || 1, span = n === 2 ? .98 : n === 3 ? .8 : .72, col = order % row, line = Math.floor(order / row), a = (col - (row - 1) / 2) * span, off = n > 3 ? (line - .5) * .62 : 0;
    const nx = -r.tz, nz = r.tx; return { x: r.x + r.tx * a + nx * off, z: r.z + r.tz * a + nz * off };
  }
  // onde cada peça parada fica e de que tamanho: quanto mais gente na casa, menores
  function spots() {
    const groups = {}, out = {};
    tokens.forEach((t, idx) => { if (!t || t.out || t.moving) return; const key = t.inJail ? 'j' : t.at; (groups[key] = groups[key] || []).push(idx); });
    for (const g of Object.values(groups)) g.forEach((idx, o) => { const t = tokens[idx]; out[idx] = { ...restSpot(t.at, o, g.length, t.inJail), k: KS[Math.min(6, g.length)] }; });
    return out;
  }
  function layoutTokens(instant) {
    const sp = spots();
    for (const idx of Object.keys(sp)) {
      const t = tokens[idx], s = sp[idx], x0 = t.m.position.x, z0 = t.m.position.z; t.kGoal = s.k;
      if (instant) { t.k = s.k; t.m.position.set(s.x, baseY(t), s.z); continue; }
      if (Math.hypot(s.x - x0, s.z - z0) > .01) { const id = ++t.slide; tw(300, k => { if (t.slide !== id || t.moving) return; t.m.position.x = x0 + (s.x - x0) * k; t.m.position.z = z0 + (s.z - z0) * k; }, ease.inOut); }
    }
  }
  const baseY = t => (t.inJail ? .1 : -.06);
  // anda aos pulinhos sem parar seco em cada casa: a peça se inclina para onde vai, estica no ar e amassa de leve ao tocar o chão
  const followOn = t => { cam.follow = t.m; cam.hold = Infinity; }, followOff = () => { cam.hold = .3; };
  async function walk(idx, from, n, onStep) {
    const t = tokens[idx], dir = Math.sign(n), total = Math.abs(n); if (!total) return;
    followOn(t); const at = i => (from + dir * i + 400) % 40, final = at(total); t.moving = true; t.inJail = false; t.slide++; layoutTokens(false); t.m.quaternion.identity();
    // a vaga final já conta com quem está lá; os outros só abrem espaço quando esta pisar
    t.moving = false; const realAt = t.at; t.at = final; const end = spots()[idx]; t.at = realAt; t.moving = true;
    const pts = [t.m.position.clone().setY(0)];
    for (let i = 1; i <= total; i++) { const p = i === total ? end : roadPos(at(i)); pts.push(new THREE.Vector3(p.x, 0, p.z)); }
    const hopMs = 290, HOP = .95, Y0 = -.06, P = new THREE.Vector3(), D = new THREE.Vector3();
    let seg = 0;
    const touch = s => { t.at = at(s); softPress(t.at); onStep && onStep(t.at, s - 1, total); };
    await tw(total * hopMs, (_, k) => {
      const f = Math.min(total - 1e-6, k * total), i = Math.floor(f), u = f - i;
      while (seg < i) touch(++seg);
      P.lerpVectors(pts[i], pts[i + 1], u + (u * u * (3 - 2 * u) - u) * .45); D.subVectors(pts[i + 1], pts[i]).normalize();
      const air = Math.sin(u * Math.PI), c = 1 - Math.min(1, Math.min(u, 1 - u) / .2), lean = Math.sin(u * Math.PI * 2) * .17, wob = air * .055 * (i % 2 ? 1 : -1);
      t.m.position.set(P.x, Y0 + HOP * 4 * u * (1 - u), P.z);
      t.sy = 1 + air * .09 - c * c * .13; t.sx = 1 - air * .04 + c * c * .07;
      t.m.rotation.set(D.z * lean + D.x * wob, 0, -D.x * lean + D.z * wob);
    }, k => k);
    followOff(); touch(total); t.m.position.y = Y0; t.m.rotation.set(0, 0, 0); t.moving = false; layoutTokens(false); settle(t);
  }
  function softPress(i) { const g = tiles[i].g; tw(200, k => { g.position.y = -Math.sin(k * Math.PI) * .035; }).then(() => { g.position.y = 0; }); }
  function settle(t, v = .13) { const y0 = t.sy, x0 = t.sx; tw(240, k => { const o = Math.sin(k * Math.PI * 2) * (1 - k) * v * .5; t.sy = y0 + (1 - y0) * k + o; t.sx = x0 + (1 - x0) * k - o * .5; }).then(() => { t.sx = t.sy = 1; }); }
  function pressTile(i) { const g = tiles[i].g; tw(240, k => { g.position.y = -Math.sin(k * Math.PI) * .09; }).then(() => { g.position.y = 0; }); }
  async function fly(idx, to, inJail, dur = 900, height = 5, onF = null) { // salto baixo por cima do tabuleiro, sem rodopio
    const t = tokens[idx], A = t.m.position.clone(); followOn(t); t.slide++; t.moving = true; layoutTokens(false);
    t.moving = false; const a0 = t.at, j0 = t.inJail; t.at = to; t.inJail = inJail; const sp = spots()[idx]; t.moving = true;
    const dx = sp.x - A.x, dz = sp.z - A.z, l = Math.hypot(dx, dz) || 1;
    await tw(dur, (e, k) => { t.m.position.x = A.x + dx * e; t.m.position.z = A.z + dz * e; t.m.position.y = baseY(t) + Math.sin(k * Math.PI) * height; onF && onF(k, dx, dz, l); const lean = Math.sin(k * Math.PI * 2) * .3; t.m.rotation.set(dz / l * lean, 0, -dx / l * lean); t.sy = 1 + Math.sin(k * Math.PI) * .08; t.sx = 1 - Math.sin(k * Math.PI) * .04; }, ease.inOut);
    followOff(); t.m.rotation.set(0, 0, 0); t.m.position.y = baseY(t); t.moving = false; t.sy = .88; t.sx = 1.06; settle(t); dust(sp.x, sp.z, 6); layoutTokens(false);
  }
  // ponte aérea: o peão vira um aviãozinho na cor dele, com a cabeça no cockpit
  function planeModel(col) {
    const g = new THREE.Group(), c = std(col, { roughness: .45 }), w = std('#fffaf0', { roughness: .45 }), body = add(new THREE.CylinderGeometry(.2, .13, 1.5, 14), w, 0, 0, 0, g); body.rotation.x = Math.PI / 2;
    const nose = add(new THREE.SphereGeometry(.2, 14, 10), c, 0, 0, .75, g); nose.scale.z = 1.4;
    add(new THREE.BoxGeometry(2.1, .05, .44), c, 0, .02, .1, g); add(new THREE.BoxGeometry(.9, .04, .24), c, 0, .04, -.68, g); add(new THREE.BoxGeometry(.04, .36, .3), c, 0, .2, -.68, g);
    add(new THREE.SphereGeometry(.16, 14, 10), c, 0, .2, .18, g); add(new THREE.TorusGeometry(.16, .025, 8, 18), std('#2a2a2e'), 0, .14, .18, g).rotation.x = Math.PI / 2;
    const prop = add(new THREE.BoxGeometry(.72, .06, .025), std('#2a2a2e'), 0, 0, 1.03, g, false); g.userData.prop = prop;
    return g;
  }
  async function flyPlane(idx, to, col) {
    const t = tokens[idx], pl = planeModel(col), H = 6.5; pl.rotation.order = 'YXZ'; pl.scale.setScalar(.01); pl.position.copy(t.m.position); scene.add(pl); t.m.visible = false;
    await fly(idx, to, false, 2100, H, (k, dx, dz, l) => {
      const m = t.m.position, s = Math.min(1, k * 7, (1 - k) * 7) * 1.25; pl.position.set(m.x, m.y + .55, m.z); pl.scale.setScalar(Math.max(.01, s));
      pl.rotation.set(-Math.cos(k * Math.PI) * Math.atan(H * Math.PI / Math.max(l, 1)) * .55, Math.atan2(dx, dz), Math.sin(k * Math.PI * 2) * .28); pl.userData.prop.rotation.z = k * 260;
    });
    scene.remove(pl); t.m.visible = true;
  }
  // prisão: as grades sobem, a peça entra num salto baixo, as grades descem e o giroflex pisca
  async function arrest(idx, onShut) {
    blinkLamps(2000); gate(true); await fly(idx, 10, true, 720, 3.2);
    await gate(false); onShut && onShut(); const p = tilePos(10); dust(p.x, p.z, 5, 0xbbbbbb);
  }
  const release = async () => { await gate(true); await wait(260); await gate(false); };
  const syncToken = (idx, at, inJail, out) => { const t = tokens[idx]; t.at = at; t.inJail = inJail; t.out = out; t.m.visible = !out; };
  // falência: o peão dá um pulo de susto, tomba com as moedas voando, fica caído um instante e afunda
  async function dropOut(idx, onThud) {
    const t = tokens[idx], p = t.m.position, y0 = p.y, k0 = t.k; t.out = true;
    await tw(360, (_, k) => { p.y = y0 + Math.sin(k * Math.PI) * 1.5; t.m.rotation.y = k * 6.283; });
    onThud && onThud(); dust(p.x, p.z, 26, 0xffd36b); dust(p.x, p.z, 10, 0x777777); shake(.22);
    await tw(300, e => { t.m.rotation.z = e * 1.5; p.y = y0 + .12 * e; }, ease.out);
    await tw(120, (_, k) => { p.y = y0 + .12 + Math.sin(k * Math.PI) * .12; });
    await wait(520);
    await tw(620, e => { p.y = y0 + .12 - e * .9; t.k = t.kGoal = k0 * (1 - e); }, ease.inOut);
    t.m.visible = false; t.m.rotation.set(0, 0, 0); layoutTokens(false);
  }

  // ---------- dados com física de verdade ----------
  const SIZE = 1.02;
  const NORMALS = { 1: [0, 1, 0], 6: [0, -1, 0], 2: [0, 0, 1], 5: [0, 0, -1], 3: [1, 0, 0], 4: [-1, 0, 0] };
  let diceMeshes = [];
  function dieGeo() {
    const g = new THREE.BoxGeometry(SIZE, SIZE, SIZE, 8, 8, 8), p = g.attributes.position, n = g.attributes.normal, h = SIZE / 2, r = SIZE * .13, inner = h - r, v = new THREE.Vector3(), c = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); c.set(Math.max(-inner, Math.min(inner, v.x)), Math.max(-inner, Math.min(inner, v.y)), Math.max(-inner, Math.min(inner, v.z))); const d = v.clone().sub(c).normalize(); p.setXYZ(i, c.x + d.x * r, c.y + d.y * r, c.z + d.z * r); n.setXYZ(i, d.x, d.y, d.z); }
    return g;
  }
  function buildDice() {
    const mats = [3, 4, 1, 6, 2, 5].map(v => { const d = Art.die(v); return new THREE.MeshPhysicalMaterial({ map: tex(d.color), bumpMap: tex(d.bump, { linear: true }), bumpScale: .018, roughness: .26, clearcoat: .9, clearcoatRoughness: .14 }); });
    const g = dieGeo(); diceMeshes = [0, 1].map((_, i) => { const m = new THREE.Mesh(g, mats); m.castShadow = true; m.receiveShadow = true; m.position.set(-.76 + i * 1.52, FLOOR + SIZE / 2, 0); scene.add(m); return m; });
  }
  // lance: sobem em curva, quicam duas vezes perdendo força e param um ao lado do outro; nunca um dentro do outro
  async function rollDice(a, b, onHit, one = false) {
    const V = THREE.Vector3, Q = THREE.Quaternion, Y = new V(0, 1, 0), az = cam.az + cam.user, right = new V(Math.cos(az), 0, -Math.sin(az)), fwd = new V(Math.sin(az), 0, Math.cos(az)), turn = new Q(), P = new V();
    // cada dado vai para o lado de onde já está, assim os caminhos não se cruzam
    const flip = !one && diceMeshes[0].position.dot(right) > diceMeshes[1].position.dot(right), gap = .76 + Math.random() * .14, shift = (Math.random() - .5) * .3;
    const offs = one ? [0] : flip ? [gap, -gap] : [-gap, gap], vals = one ? [a] : [a, b];
    const items = vals.map((v, i) => {
      const yawJ = (Math.random() - .5) * .5, slide = (Math.random() - .5) * .3, to = new V().addScaledVector(right, offs[i]).addScaledVector(fwd, shift + slide); to.y = FLOOR + SIZE / 2;
      return { m: diceMeshes[i], from: diceMeshes[i].position.clone(), q0: diceMeshes[i].quaternion.clone(), to, bulge: (offs[i] < 0 ? -1 : 1) * (.7 + Math.random() * .5), end: new Q().setFromAxisAngle(Y, az + yawJ).multiply(new Q().setFromUnitVectors(new V(...NORMALS[v]), Y)), axis: new V(Math.random() - .5, Math.random() - .5, Math.random() - .5).normalize(), spin: (2.5 + i * .5 + Math.random()) * Math.PI * 2, delay: i * .035, hit: 0 };
    });
    // três arcos cada vez menores: o tempo de cada um segue a altura, como numa queda de verdade
    const ARC = [[0, .6, 3.5], [.6, .83, .62], [.83, .95, .13]];
    await tw(1020, (_, k) => {
      items.forEach(d => {
        const u = Math.max(0, Math.min(1, (k - d.delay) / (1 - d.delay))), e = 1 - (1 - Math.min(1, u / .86)) ** 2.4;
        let h = 0; for (const [s, t, a2] of ARC) if (u >= s && u < t) { const w = (u - s) / (t - s); h = 4 * a2 * w * (1 - w); }
        P.lerpVectors(d.from, d.to, e).addScaledVector(right, Math.sin(e * Math.PI) * d.bulge); P.y = d.to.y + h; d.m.position.copy(P);
        d.m.quaternion.copy(turn.setFromAxisAngle(d.axis, d.spin * (1 - u) ** 2.2)).multiply(d.end);
        const stage = u >= .95 ? 3 : u >= .83 ? 2 : u >= .6 ? 1 : 0; if (stage > d.hit) { d.hit = stage; onHit && onHit([.8, .35, .15][stage - 1]); }
      });
      // se no ar chegarem perto demais, um afasta o outro
      if (items.length === 2) { const A = items[0].m.position, B = items[1].m.position, dx = B.x - A.x, dz = B.z - A.z, l = Math.hypot(dx, dz) || .001, need = SIZE * 1.42; if (l < need && Math.abs(A.y - B.y) < SIZE * 1.2) { const push = (need - l) / 2 / l; A.x -= dx * push; A.z -= dz * push; B.x += dx * push; B.z += dz * push; } }
    }, k => k);
  }
  // o jeitinho da Blitz usa um dado só: o segundo some durante o lance
  async function rollOne(a, onHit) { diceMeshes[1].visible = false; await rollDice(a, 1, onHit, true); diceMeshes[1].visible = true; }
  function placeDice(a, b) { [a, b].forEach((v, i) => { const m = diceMeshes[i]; m.quaternion.setFromUnitVectors(new THREE.Vector3(...NORMALS[v]), new THREE.Vector3(0, 1, 0)); }); }

  // ---------- virar a mesa ----------
  let flipping = false;
  // a mesa é um corpo rígido de verdade: dois braços levantam a borda de cá, a borda de lá escora no feltro e o resto é gravidade
  function simBoard(RF, floorY, GR) {
    const HT = .31, Ix = RF * RF * 4 / 12, Iy = Ix * 2, I = [Ix, Iy, Ix], DTS = 1 / 1200, K = 60000, DAMP = 190, MU = .75;
    const rot = (q, x, y, z) => { const [a, b, c, w] = q, tx = 2 * (b * z - c * y), ty = 2 * (c * x - a * z), tz = 2 * (a * y - b * x); return [x + w * tx + b * tz - c * ty, y + w * ty + c * tx - a * tz, z + w * tz + a * ty - b * tx]; };
    const inv = q => [-q[0], -q[1], -q[2], q[3]], rnd = (a, b) => a + Math.random() * (b - a);
    const corners = []; for (const x of [-RF, RF]) for (const z of [-RF, RF]) for (const y of [-HT, HT]) corners.push([x, y, z]);
    const F = rnd(410, 450), FZ = rnd(-70, -35), X0 = rnd(3, 8) * (Math.random() < .5 ? -1 : 1), HEAVE = .15, TEND = .5;
    const p = [0, floorY + HT, 0], v = [0, 0, 0], w = [0, 0, 0]; let q = [0, 0, 0, 1];
    const rec = [], hits = []; let t = 0, first = 0, lastHit = -1, n = 0;
    while (!first || t < first + .8) {
      if (t > 2.4) break;
      const f = [0, -GR, 0], tau = [0, 0, 0];
      const force = (r, fx, fy, fz) => { f[0] += fx; f[1] += fy; f[2] += fz; tau[0] += r[1] * fz - r[2] * fy; tau[1] += r[2] * fx - r[0] * fz; tau[2] += r[0] * fy - r[1] * fx; };
      if (t < HEAVE) { const r = rot(q, X0, 0, RF), e = Math.sin(t / HEAVE * Math.PI) * 1.57; force(r, 0, F * e, FZ * e); }
      let impact = 0, ix = 0, iz = 0;
      for (const c of corners) {
        const r = rot(q, c[0], c[1], c[2]), py = p[1] + r[1], pen = floorY - py; if (pen <= 0) continue;
        const vx = v[0] + w[1] * r[2] - w[2] * r[1], vy = v[1] + w[2] * r[0] - w[0] * r[2], vz = v[2] + w[0] * r[1] - w[1] * r[0];
        const N = Math.max(0, K * pen - DAMP * vy), sp = Math.hypot(vx, vz) || 1, fr = Math.min(MU * N, sp * 400);
        force(r, -vx / sp * fr, N, -vz / sp * fr);
        if (t > HEAVE && -vy > impact) { impact = -vy; ix = p[0] + r[0]; iz = p[2] + r[2]; }
      }
      if (impact > 5 && t - lastHit > .045 && t > .3) { lastHit = t; hits.push({ t, v: impact, x: ix, z: iz }); if (!first) first = t; }
      for (let k = 0; k < 3; k++) v[k] += f[k] * DTS;
      const qi = inv(q), tb = rot(qi, tau[0], tau[1], tau[2]), wb = rot(qi, w[0], w[1], w[2]);
      const d = [(tb[0] - (wb[1] * I[2] * wb[2] - wb[2] * I[1] * wb[1])) / I[0], (tb[1] - (wb[2] * I[0] * wb[0] - wb[0] * I[2] * wb[2])) / I[1], (tb[2] - (wb[0] * I[1] * wb[1] - wb[1] * I[0] * wb[0])) / I[2]], dw = rot(q, d[0], d[1], d[2]);
      for (let k = 0; k < 3; k++) { w[k] += dw[k] * DTS; w[k] *= 1 - .15 * DTS; p[k] += v[k] * DTS; }
      const [a, b, c, s] = q, wx = w[0] * DTS / 2, wy = w[1] * DTS / 2, wz = w[2] * DTS / 2;
      q = [a + wx * s + wy * c - wz * b, b + wy * s + wz * a - wx * c, c + wz * s + wx * b - wy * a, s - wx * a - wy * b - wz * c];
      const l = Math.hypot(...q); q = q.map(u => u / l);
      if (n++ % 4 === 0) rec.push(p[0], p[1], p[2], q[0], q[1], q[2], q[3], v[0], v[1], v[2], w[0], w[1], w[2]);
      t += DTS;
    }
    const up = rot(q, 0, 1, 0)[1], flat = Math.hypot(...w) < 1.2 && Math.abs(v[1]) < 3;
    return { rec, hits, first, end: t, ok: first > .55 && first < 1.05 && up < -.985 && flat && Math.abs(p[0]) < 9, up, p: p.slice(), yaw: Math.atan2(rot(q, 1, 0, 0)[2], rot(q, 1, 0, 0)[0]), kick: HEAVE };
  }
  async function flipTable(h = {}) {
    if (flipping) return; flipping = true; const s0 = speed; speed = 1; blitzCar(false, true); sponsors.forEach(o => { o.g.visible = false; });
    const GR = 220, DT = 1 / 300, FLOOR_Y = -.62, HT = .31, rnd = (a, b) => a + Math.random() * (b - a);
    let sim; for (let i = 0; i < 40; i++) { sim = simBoard(RF, FLOOR_Y, GR); if (sim.ok) break; }
    const rec = sim.rec, frames = rec.length / 13, iKick = Math.round(sim.kick / DT), iSlam = Math.round(sim.first / DT);
    const hits = sim.hits.map(e => ({ ...e, i: Math.round(e.t / DT) })), loud = hits.reduce((m, e) => (e.v > m.v ? e : m), hits[0]);
    // corpos soltos: peões, dados, prédios e as cartas dos montes
    const saved = { ...cam }, bodies = [], back = [], pieces = tokens.filter(t => t && !t.out);
    const body = (m, o) => bodies.push(Object.assign({ m, v: new THREE.Vector3(), w: new THREE.Vector3(), c: m.position.y + HT, rad: .3, e: .35, kick: [12, 30], flat: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd(0, 6.28)), ground: false }, o));
    pieces.forEach(t => { t.moving = true; body(t.m, { hard: true, tok: true, flat: new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, rnd(0, 6.28), 0, 'YXZ')) }); });
    diceMeshes.forEach(m => { back.push({ m, p: m.position.clone(), q: m.quaternion.clone() }); body(m, { hard: true, rad: SIZE / 2, e: .45, kick: [20, 40] }); });
    tiles.forEach(t => { if (!t.lots) return; [...t.lots.children].forEach(b => { back.push({ m: b, parent: t.lots, p: b.position.clone(), q: b.quaternion.clone() }); scene.attach(b); body(b, { hard: true, rad: .18, e: .3 }); }); });
    [casino.rt].forEach(b => { back.push({ m: b, parent: casino.g, p: b.position.clone(), q: b.quaternion.clone() }); scene.attach(b); body(b, { hard: true, rad: .02, e: .22, kick: [12, 24] }); });
    const loose = [], flyers = [];
    for (const key of Object.keys(decks)) {
      const d = decks[key], w = new THREE.Vector3(), Q = new THREE.Quaternion(); d.g.getWorldPosition(w); d.g.getWorldQuaternion(Q); d.g.visible = false;
      for (let i = 0; i < DECK_N; i++) { const c = new THREE.Mesh(d.fly.geometry, d.fly.material); c.castShadow = true; c.position.set(w.x, w.y + i * DECK_GAP, w.z); c.quaternion.copy(Q); scene.add(c); loose.push(c); const side = Math.sign(w.x) * (Math.random() < .9 ? 1 : -1); flyers.push({ m: c, a: c.position.clone(), to: new THREE.Vector3(sim.p[0] + side * (RF * 1.2 + rnd(1, 11)), FLOOR_Y + .04 + i * .004, sim.p[2] * .5 + rnd(-11, 11)), t0: rnd(.02, .12), dur: rnd(.55, 1.05), h: rnd(3, 9), wx: rnd(-14, 14), wz: rnd(-14, 14), flat: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd(0, 6.28)) }); }
    }
    // o enquadramento abre um pouco para caber a mesa caindo
    const camFrom = cam.fz, DTO = 1.35;
    const n = new THREE.Vector3(), ax = new THREE.Vector3(), az = new THREE.Vector3(), rel = new THREE.Vector3(), com = new THREE.Vector3(), vb = new THREE.Vector3(), wb = new THREE.Vector3(), vs = new THREE.Vector3(), qb = new THREE.Quaternion();
    const shudder = tiles.map(() => ({ h: rnd(.1, .3), rx: rnd(-.05, .05), rz: rnd(-.05, .05), d: rnd(0, .05) }));
    const pose = i => { const o = i * 13; com.set(rec[o], rec[o + 1], rec[o + 2]); qb.set(rec[o + 3], rec[o + 4], rec[o + 5], rec[o + 6]); vb.set(rec[o + 7], rec[o + 8], rec[o + 9]); wb.set(rec[o + 10], rec[o + 11], rec[o + 12]); n.set(0, 1, 0).applyQuaternion(qb); ax.set(1, 0, 0).applyQuaternion(qb); az.set(0, 0, 1).applyQuaternion(qb); };
    let i = 0, landed = false, lastHit = 0, count = 0, simT = 0, nextHit = 0;
    const tick = () => {
      pose(i); simT = i * DT;
      if (i === iKick) {
        h.launch && h.launch(); cam.shake = Math.max(cam.shake, .6);
        for (let x = -RF; x <= RF; x += 3) dust(x, RF + .8, 2, 0xcfd8c8);
        bodies.forEach(b => { b.v.addScaledVector(n, rnd(b.kick[0], b.kick[1])); b.v.x += rnd(-11, 11); b.v.z += rnd(-8, 8); b.w.set(rnd(-16, 16), rnd(-10, 10), rnd(-16, 16)); });
      }
      if (i === iSlam) { landed = true; contactMesh.position.x = sim.p[0]; contactMesh.position.z = sim.p[2]; contactMesh.rotation.z = -sim.yaw; }
      // cada batida que a mesa dá no feltro: som, poeira e tremor no instante certo
      while (nextHit < hits.length && hits[nextHit].i <= i) {
        const e = hits[nextHit++];
        if (e === loud) {
          h.slam && h.slam(); cam.shake = 2.2;
          for (let a = -RF; a <= RF; a += 2.4) for (const [x, z] of [[a, RF + .6], [a, -RF - .6], [RF + .6, a], [-RF - .6, a]]) { rel.copy(ax).multiplyScalar(x).addScaledVector(az, z).add(com); dust(rel.x, rel.z, 3, 0xcfd8c8); }
          // o tombo sacode o chão e o vento leva o que é leve
          bodies.forEach(b => { if (b.m.position.y > 1.5) return; b.ground = false; b.v.y += rnd(8, 26); const dx = b.m.position.x - com.x, dz = b.m.position.z - com.z, l = Math.hypot(dx, dz) || 1; b.v.x += dx / l * rnd(0, 6); b.v.z += dz / l * rnd(0, 6); });
        } else { h.thud && h.thud(Math.min(1, e.v / 110)); cam.shake = Math.max(cam.shake, e.v / 70); dust(e.x, e.z, 5, 0xcfd8c8); }
      }
      // cartas: voo próprio para fora da mesa, em arco, e pousam no chão ao lado dela
      for (const f of flyers) {
        const u = Math.min(1, (simT - f.t0) / f.dur); if (u <= 0) continue;
        const e = 1 - (1 - u) ** 3, p = f.m.position; p.x = f.a.x + (f.to.x - f.a.x) * e; p.z = f.a.z + (f.to.z - f.a.z) * e; p.y = f.a.y + (f.to.y - f.a.y) * u + Math.sin(u * Math.PI) * f.h;
        if (u < .72) { f.m.rotation.x += f.wx * DT; f.m.rotation.z += f.wz * DT; } else f.m.quaternion.slerp(f.flat, u >= 1 ? 1 : Math.min(1, 14 * DT));
      }
      for (const b of bodies) {
        const p = b.m.position; b.v.y -= GR * DT;
        p.addScaledVector(b.v, DT);
        if (!b.ground) { b.m.rotation.x += b.w.x * DT; b.m.rotation.y += b.w.y * DT; b.m.rotation.z += b.w.z * DT; }
        rel.copy(p).sub(com); const lx = rel.dot(ax), lz = rel.dot(az), inside = Math.abs(lx) < RF && Math.abs(lz) < RF;
        // a mesa empurra o que está em cima dela
        if (!landed && inside) { const gap = rel.dot(n) - b.c; if (gap < 0 && gap > -2.4) { p.addScaledVector(n, -gap); vs.crossVectors(wb, rel).add(vb); const vn = b.v.dot(n), us = vs.dot(n); if (vn < us) b.v.addScaledVector(n, us - vn); } }
        // chão: o verso da mesa depois do tombo, ou o feltro
        const fy = (landed && inside && p.y > -.2 ? .09 : FLOOR_Y) + b.rad;
        if (p.y < fy) {
          p.y = fy; const vy = -b.v.y;
          if (b.hard && vy > 24 && simT - lastHit > .06 && count < 16) { lastHit = simT; count++; h.clink && h.clink(Math.min(1, vy / 80)); if (b.tok) dust(p.x, p.z, 3); }
          b.v.y = vy > 7 ? vy * b.e : 0; b.v.x *= .72; b.v.z *= .72; b.w.multiplyScalar(.6);
          if (vy <= 7) b.ground = true;
        }
        if (b.ground) { b.v.x *= 1 - 7 * DT; b.v.z *= 1 - 7 * DT; b.m.quaternion.slerp(b.flat, Math.min(1, 16 * DT)); }
      }
    };
    h.lift && h.lift();
    const T = frames * DT * 1000;
    await tw(T, k => {
      const secs = k * T / 1000, to = Math.min(frames - 1, Math.floor(secs / DT));
      while (i <= to) { tick(); i++; }
      pose(to); rig.quaternion.copy(qb); rig.position.copy(com).addScaledVector(n, HT);
      contactMat.opacity = landed ? Math.max(0, 1 - (com.y - FLOOR_Y - HT) * .6) : Math.max(0, 1 - (com.y - FLOOR_Y - HT) * .5);
      // o tranco das mãos sacode os ladrilhos, que voltam ao lugar
      const u0 = (secs - sim.kick) / .3; tiles.forEach((t, j) => { const p = shudder[j], u = Math.min(1, Math.max(0, u0 - p.d * 4)), e = Math.sin(u * Math.PI * 3) * (1 - u); t.g.position.y = e * p.h; t.g.rotation.set(e * p.rx, SIDE[sideOf(t.i)], e * p.rz); });
      const u = Math.min(1, secs / .62), e = u * u * (3 - 2 * u); cam.fz = cam.gfz = camFrom + (DTO - camFrom) * e;
    });
    // a mesa volta sozinha: sobe, desvira no ar, desce no lugar e cada peça volta para a sua casa
    await wait(240);
    const qA = rig.quaternion.clone(), pA = rig.position.clone(), O = new THREE.Vector3(), QI = new THREE.Quaternion(), V3 = THREE.Vector3, Q4 = THREE.Quaternion;
    tiles.forEach(t => { t.g.position.y = 0; t.g.rotation.set(0, SIDE[sideOf(t.i)], 0); }); // a volta do ângulo no rig troca a rotação de 180° por outra equivalente; aqui ela é refeita
    rig.quaternion.identity(); rig.position.set(0, 0, 0); rig.updateMatrixWorld(true);
    const moves = [];
    const go = (m, to, q, delay, lift = 3) => moves.push({ m, a: m.position.clone(), qa: m.quaternion.clone(), to, q, delay, lift });
    back.forEach(r => { let to = r.p.clone(), q = r.q.clone(); if (r.parent) { to = r.parent.localToWorld(to); const pq = new Q4(); r.parent.getWorldQuaternion(pq); q = pq.multiply(q); } go(r.m, to, q, rnd(.38, .5), r.parent ? 3.5 : 4); });
    pieces.forEach(t => { t.moving = false; }); const sp = spots(); pieces.forEach(t => { t.moving = true; const s = sp[t.p.i]; go(t.m, new V3(s.x, baseY(t), s.z), QI.clone(), rnd(.4, .5), 5); });
    const deckHome = {}; for (const key of Object.keys(decks)) { const d = decks[key], w = new V3(), q = new Q4(); d.g.getWorldPosition(w); d.g.getWorldQuaternion(q); deckHome[key] = { w, q, n: 0 }; }
    const keys = Object.keys(decks); loose.forEach((c, i) => { const hm = deckHome[keys[i < DECK_N ? 0 : 1]]; go(c, new V3(hm.w.x, hm.w.y + hm.n++ * DECK_GAP, hm.w.z), hm.q.clone(), .3 + (hm.n / DECK_N) * .25, 4); });
    rig.quaternion.copy(qA); rig.position.copy(pA); rig.updateMatrixWorld(true);
    const shA = contactMesh.position.clone(), yA = contactMesh.rotation.z;
    h.restore && h.restore();
    let settled = false, tq = new Q4();
    const LIFT = RF * 1.04, DUR = 1180;
    await tw(DUR, (_, k) => {
      const u = Math.min(1, k / .68), e = u * u * u * (u * (6 * u - 15) + 10);
      rig.quaternion.copy(qA).slerp(QI, e); rig.position.lerpVectors(pA, O, e); rig.position.y = Math.max(rig.position.y, Math.sin(e * Math.PI) * LIFT);
      contactMesh.position.x = shA.x * (1 - e); contactMesh.position.z = shA.z * (1 - e); contactMesh.rotation.z = yA * (1 - e); contactMat.opacity = Math.max(.15, 1 - Math.sin(e * Math.PI) * .9);
      if (u >= 1 && !settled) { settled = true; h.settle && h.settle(); cam.shake = Math.max(cam.shake, .55); for (let a = -RF; a <= RF; a += 3.4) for (const [x, z] of [[a, RF + .5], [a, -RF - .5], [RF + .5, a], [-RF - .5, a]]) dust(x, z, 1, 0xcfd8c8); h.tiles && h.tiles(); }
      for (const b of moves) { const w = Math.max(0, Math.min(1, (k - b.delay) / .48)), s = w * w * (3 - 2 * w); b.m.position.lerpVectors(b.a, b.to, s); b.m.position.y += Math.sin(w * Math.PI) * b.lift; tq.copy(b.qa).slerp(b.q, s); b.m.quaternion.copy(tq); }
      const f = k * k * (3 - 2 * k); cam.fz = cam.gfz = DTO * (1 - f) + saved.fz * f;
    });
    rig.quaternion.identity(); rig.position.set(0, 0, 0); contactMesh.position.set(0, contactMesh.position.y, 0); contactMesh.rotation.z = 0; contactMat.opacity = 1;
    loose.forEach(c => scene.remove(c)); for (const key of Object.keys(decks)) decks[key].g.visible = true;
    back.forEach(r => { if (r.parent) r.parent.add(r.m); r.m.position.copy(r.p); r.m.quaternion.copy(r.q); });
    pieces.forEach(t => { t.moving = false; t.m.rotation.set(0, 0, 0); });
    layoutTokens(false); cam.gfz = saved.gfz;
    sponsors.forEach(o => { o.g.visible = true; });
    speed = s0; flipping = false;
  }

  // ---------- construções ----------
  const G = {};
  function ensureGeos() {
    if (G.wall) return;
    G.wall = new THREE.BoxGeometry(.56, .42, .5); G.roof = new THREE.ConeGeometry(.46, .3, 4); G.roof.rotateY(Math.PI / 4); G.roof.scale(1.08, 1, .98); G.door = new THREE.PlaneGeometry(.14, .25); G.win = new THREE.PlaneGeometry(.11, .11); G.chim = new THREE.BoxGeometry(.08, .2, .08);
    G.wallM = std('#fbf1dc', { roughness: .7 }); G.doorM = std('#4a2c17'); G.glass = new THREE.MeshStandardMaterial({ color: lin('#ffe6a8'), emissive: lin('#ffb95e'), emissiveIntensity: .7 }); G.chimM = std('#8c4a30', { roughness: .8 });
  }
  function house(col) {
    const g = new THREE.Group();
    add(G.wall, G.wallM, 0, .21, 0, g); add(G.roof, trimOf(col), 0, .57, 0, g); add(G.chim, G.chimM, .15, .68, -.08, g);
    add(G.door, G.doorM, 0, .125, .252, g, false); add(G.win, G.glass, -.18, .25, .252, g, false); add(G.win, G.glass, .18, .25, .252, g, false);
    return g;
  }
  // construções trabalhadas: fachada pintada numa textura só e peças reaproveitadas, para a mesa cheia continuar leve
  const boxes = {}, trims = {}, facades = {};
  const box = (w, h, d) => boxes[w + '|' + h + '|' + d] || (boxes[w + '|' + h + '|' + d] = new THREE.BoxGeometry(w, h, d));
  const trimOf = col => trims[col] || (trims[col] = std(col, { roughness: .6, envMapIntensity: .25 }));
  const goldM = () => G.goldM || (G.goldM = std('#e0b44e', { roughness: .4, metalness: .35, envMapIntensity: .5 }));
  const grayM = () => G.grayM || (G.grayM = std('#8f8a82', { roughness: .8, envMapIntensity: .2 }));
  const topM = () => G.topM || (G.topM = std('#c7bba4', { roughness: .95, envMapIntensity: .2 }));
  function facade(style, cols, rows) {
    const k = style + cols + 'x' + rows; if (facades[k]) return facades[k];
    const cw = 72, ch = 84, c = document.createElement('canvas'); c.width = cols * cw; c.height = rows * ch; const x = c.getContext('2d'), night = style === 'noite';
    x.fillStyle = night ? '#1b2736' : style === 'tijolo' ? '#b4603c' : style[0] === '#' ? style : '#f2e4c8'; x.fillRect(0, 0, c.width, c.height);
    if (style === 'tijolo') { x.fillStyle = 'rgba(70,28,12,.28)'; for (let y = 0; y < c.height; y += 12) { x.fillRect(0, y, c.width, 2); for (let a = (y / 12) % 2 ? 0 : 12; a < c.width; a += 24) x.fillRect(a, y, 2, 12); } }
    for (let r = 0; r < rows; r++) {
      x.fillStyle = night ? 'rgba(224,180,78,.5)' : 'rgba(40,25,10,.2)'; x.fillRect(0, r * ch, c.width, 3);
      for (let q = 0; q < cols; q++) {
        const a = q * cw + 15, b = r * ch + 16, w = 42, h = 50, lit = (q * 7 + r * 13) % 10 < 7;
        x.fillStyle = night ? '#e0b44e' : style === 'tijolo' || style[0] === '#' ? '#f3e6cf' : '#8c6a42'; x.fillRect(a - 4, b - 4, w + 8, h + 9);
        x.fillStyle = night ? (lit ? '#ffdf94' : '#33465c') : '#34506b'; x.fillRect(a, b, w, h);
        if (!night) { x.fillStyle = 'rgba(255,255,255,.28)'; x.beginPath(); x.moveTo(a, b + h * .6); x.lineTo(a + w * .6, b); x.lineTo(a + w * .9, b); x.lineTo(a, b + h * .9); x.fill(); }
      }
    }
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 4;
    return facades[k] = std('#ffffff', night ? { map: t, emissive: lin('#ffffff'), emissiveMap: t, emissiveIntensity: .3, roughness: .7, envMapIntensity: .2 } : { map: t, roughness: .85, envMapIntensity: .2 });
  }
  function block(style, w, h, dp, colsF, colsS, rows, y, g) {
    const F = facade(style, colsF, rows), S = facade(style, colsS, rows);
    return add(box(w, h, dp), [S, S, topM(), topM(), F, F], 0, y + h / 2, 0, g);
  }
  // prédio e hotel pintados na cor do grupo e mais baixos: a cor da casa continua lá, mesmo com a faixa coberta
  const creamM = () => G.creamM || (G.creamM = std('#fff6e4', { roughness: .6, envMapIntensity: .25 }));
  // telhado na cor do grupo; num grupo próprio, porque a peça vem girada e escalar direto a deforma
  function bigRoof(col, y, sx, sz, g) { const r = new THREE.Group(); add(G.roof, trimOf(col), 0, 0, 0, r); r.position.set(0, y, 0); r.scale.set(sx, 1, sz); g.add(r); }
  function sobrado(col) {
    const g = new THREE.Group(), w = .68, h = .64;
    block('creme', w, h, .56, 2, 1, 2, .02, g); bigRoof(col, .02 + h + .15, 1.36, 1.15, g);
    add(G.door, G.doorM, 0, .145, .285, g, false);
    return g;
  }
  function mansao(col) {
    const g = new THREE.Group(), h = .6;
    block('creme', 1.14, h, .6, 3, 1, 2, .02, g); bigRoof(col, .02 + h + .15, 2.25, 1.25, g);
    add(G.door, G.doorM, 0, .145, .305, g, false);
    add(box(.42, .04, .2), goldM(), 0, .38, .38, g);
    for (const x of [-.18, .18]) add(box(.04, .36, .04), creamM(), x, .2, .45, g);
    return g;
  }
  function building(col, n) {
    const g = new THREE.Group(), w = 1.14, dp = .72, fh = .4, y0 = .05, h = n * fh, top = y0 + h;
    add(box(w + .1, y0, dp + .1), grayM(), 0, y0 / 2, 0, g);
    block(col, w, h, dp, 2, 1, 3, y0, g);
    add(box(w + .08, .09, dp + .08), creamM(), 0, top + .045, 0, g);
    add(box(w - .14, .03, dp - .14), topM(), 0, top + .105, 0, g, false);
    return g;
  }
  let signM = null;
  function hotelSign() {
    if (signM) return signM;
    const c = document.createElement('canvas'); c.width = 320; c.height = 90; const x = c.getContext('2d');
    x.fillStyle = '#16202c'; x.fillRect(0, 0, 320, 90); x.strokeStyle = '#e0b44e'; x.lineWidth = 6; x.strokeRect(5, 5, 310, 80); x.fillStyle = '#ffd36b'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = '66px "Lilita One", sans-serif'; x.fillText('HOTEL', 160, 48);
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 4;
    const face = new THREE.MeshStandardMaterial({ map: t, emissive: lin('#ffffff'), emissiveMap: t, emissiveIntensity: .5, roughness: .6 });
    return signM = [goldM(), goldM(), goldM(), goldM(), face, face];
  }
  function hotel(col) { // o último nível: base larga, torre na cor do grupo, friso dourado e letreiro
    const g = new THREE.Group(), gold = goldM(), fh = .4, base = .4;
    add(box(1.42, .05, .92), grayM(), 0, .025, 0, g);
    block(col, 1.32, base, .82, 3, 1, 1, .05, g);
    add(box(1.4, .07, .9), gold, 0, base + .085, 0, g);
    const y1 = base + .12; block(col, 1.12, fh * 4, .7, 2, 1, 3, y1, g);
    const y2 = y1 + fh * 4; add(box(1.2, .07, .78), gold, 0, y2 + .035, 0, g);
    add(box(1.16, .34, .07), hotelSign(), 0, y2 + .24, 0, g);
    add(box(.62, .04, .2), gold, 0, .34, .5, g);
    return g;
  }
  function setHouses(i, h, animate = true) {
    ensureGeos(); const t = tiles[i], col = PD.GROUPS[t.q.g].c, prev = t.h; t.h = h;
    const z = -TD / 2 + (h === 5 ? .48 : h >= 3 ? .42 : .38), big = h >= 2;
    t.lots.clear();
    const items = !h ? [] : [h === 5 ? hotel(col) : h === 4 ? building(col, 4) : h === 3 ? mansao(col) : h === 2 ? sobrado(col) : house(col)];
    items.forEach((b, k) => {
      b.position.set(0, .05, z); t.lots.add(b);
      if (!animate || h <= prev) return;
      const end = () => { b.scale.setScalar(1); const w = new THREE.Vector3(); b.getWorldPosition(w); dust(w.x, w.z, h === 5 ? 18 : big ? 10 : 7, h === 5 ? 0xffd36b : 0xfff0d0); shake(.14); };
      if (big) { b.scale.set(1, .02, 1); tw(520, u => { const o = u < .8 ? u / .8 * 1.06 : 1.06 - .06 * (u - .8) / .2; b.scale.set(1, o, 1); }).then(end); return; } // prédio sobe do chão
      const y = b.position.y; b.position.y = y + 5; b.scale.setScalar(.3); tw(460, u => { b.position.y = y + 5 * (1 - u) * (1 - u); const q = u < .78 ? .3 + u * .9 : 1 + Math.sin((u - .78) / .22 * Math.PI) * .22; b.scale.set(q, q * (u > .78 ? 1 - Math.sin((u - .78) / .22 * Math.PI) * .36 : 1), q); }).then(end);
    });
  }
  // cassino: as duas mesas ficam sempre nos cantos livres do miolo. Os dados de Par ou Ímpar são os do meio
  let casino = null;
  function casinoBuild() {
    const g = new THREE.Group(); scene.add(g);
    const wood = std('#6a3419', { roughness: .36, envMapIntensity: .7 }), gold = goldM(), ring = (r, t, y, o) => { const m = add(new THREE.TorusGeometry(r, t, 10, 72), gold, 0, y, 0, o, false); m.rotation.x = Math.PI / 2; return m; };
    const turned = (pts, mat, o) => add(new THREE.LatheGeometry(pts.map(([a, b]) => new THREE.Vector2(a, b)), 72), mat, 0, 0, 0, o);
    // roleta: cuba torneada, pista da bolinha, losangos de latão e torre dourada que gira com a roda
    const rt = new THREE.Group(); rt.position.set(RT_AT[0], .02, RT_AT[1]); rt.scale.setScalar(RT_SCALE); g.add(rt);
    turned([[.001, 0], [2.84, 0], [2.94, .07], [2.94, .3], [2.84, .42], [2.62, .44], [2.5, .38], [2.28, .3], [.001, .3]], wood, rt);
    ring(2.8, .04, .43, rt); ring(2.27, .035, .32, rt);
    for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4, m = add(new THREE.OctahedronGeometry(.075), gold, Math.cos(a) * 2.42, .42, Math.sin(a) * 2.42, rt, false); m.scale.y = .7; }
    const wheel = new THREE.Group(); wheel.position.y = .31; rt.add(wheel);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(2.25, 72), new THREE.MeshStandardMaterial({ map: tex(Art.roulette()), roughness: .42, envMapIntensity: .45 })); disc.rotation.x = -Math.PI / 2; disc.receiveShadow = true; wheel.add(disc);
    // prato fixo no miolo: a roda gira por baixo e os dados ficam parados em cima, com a marca do jogo
    add(new THREE.CylinderGeometry(1.46, 1.5, .1, 72), [wood, new THREE.MeshLambertMaterial({ map: tex(Art.medallion()) }), wood], 0, DISH_Y - .05, 0, rt).rotation.y = Math.PI / 2; ring(1.47, .03, DISH_Y, rt);
    const ball = add(new THREE.SphereGeometry(.075, 16, 12), std('#fffaf0', { roughness: .22 }), 2.08, .385, 0, rt);
    casino = { g, rt, wheel, ball };
  }
  const gray2 = () => G.g2 || (G.g2 = std('#b9b4a8', { roughness: .3, metalness: .6 }));
  // a roda gira para um lado, a bolinha para o outro, e ela cai na casa sorteada
  function spinRoulette(n) {
    const { wheel, ball } = casino, step = Math.PI * 2 / Art.WHEEL.length, slot = Art.WHEEL.indexOf(n) * step, a0 = wheel.rotation.y, a1 = a0 + Math.PI * 2 * 3 + Math.random() * 6.28, end = slot - a1, TAU = Math.PI * 2;
    if (casino.mark) { wheel.remove(casino.mark); casino.mark = null; }
    const phi0 = Math.atan2(ball.position.z, ball.position.x), extra = ((phi0 - end) % TAU + TAU) % TAU, r0 = Math.hypot(ball.position.x, ball.position.z);
    return tw(3400, (_, k) => {
      const e = 1 - (1 - k) ** 3, e2 = 1 - (1 - k) ** 2.4; wheel.rotation.y = a0 + (a1 - a0) * e;
      const lift = Math.min(1, k / .08), drop = Math.min(1, Math.max(0, (k - .62) / .3)), hop = k > .62 && k < .92 ? Math.abs(Math.sin(drop * Math.PI * 3)) * .14 * (1 - drop) : 0;
      const r = (r0 + (2.42 - r0) * lift) + (2.08 - 2.42) * drop, phi = end + (1 - e2) * (TAU * 7 + extra);
      ball.position.set(Math.cos(phi) * r, .385 + (.08 * lift) * (1 - drop) + hop, Math.sin(phi) * r);
    }).then(() => {
      // vista de lado, a bolinha parece estar na casa vizinha: a casa sorteada acende para não deixar dúvida
      const mark = new THREE.Mesh(new THREE.RingGeometry(1.5, 2.25, 6, 1, -slot - step / 2, step), new THREE.MeshBasicMaterial({ color: 0xffe14d, transparent: true, opacity: .75, depthWrite: false, toneMapped: false }));
      mark.rotation.x = -Math.PI / 2; mark.position.y = .025; wheel.add(mark); casino.mark = mark;
      setTimeout(() => { if (casino.mark === mark) { wheel.remove(mark); casino.mark = null; } mark.geometry.dispose(); mark.material.dispose(); }, 5000);
    });
  }
  // puxadinho: casinha menor, separada das casas de verdade
  function setPux(i, on, animate = true) {
    ensureGeos(); const t = tiles[i];
    if (t.pux) { t.lots.remove(t.pux); t.pux = null; }
    if (!on) return;
    const b = house(PD.GROUPS[t.q.g].c); b.position.set(0, .05, -TD / 2 + .3); t.lots.add(b); t.pux = b;
    if (animate) tw(360, k => b.scale.setScalar(.8 * Math.min(1, k * 1.15)), ease.out); else b.scale.setScalar(.8);
  }
  function setOwner(i, color) {
    const t = tiles[i];
    if (t.flag) { t.g.remove(t.flag); t.flag = null; }
    if (color === null) return;
    const f = new THREE.Group(), mat = new THREE.MeshStandardMaterial({ color: lin(color), emissive: lin(color), emissiveIntensity: .12, roughness: .75, envMapIntensity: .25 });
    t.g.add(f); t.flag = f;
    // meio-fio pintado na frente do ladrilho: fica na rua, nada em cima do desenho
    add(new THREE.BoxGeometry(TW - .1, .13, .2), mat, 0, -.005, TD / 2 + .12, f, false);
    // na ponta de dentro, só uma lingueta do meio-fio, com 40% da largura da casa
    add(new THREE.BoxGeometry(TW * .4, .13, .2), mat, 0, -.005, -TD / 2 - .1, f, false);
    f.scale.y = .01; tw(220, k => { f.scale.y = Math.max(.01, k); }, ease.out);
  }
  let stampTex;
  function setMortgaged(i, on) {
    const t = tiles[i]; t.mat.color.setRGB(...(on ? [.62, .5, .5] : [1, 1, 1])); t.mat.needsUpdate = true;
    if (t.stamp) { t.g.remove(t.stamp); t.stamp = null; }
    if (on) { stampTex = stampTex || tex(Art.stamp(TD / TW)); const m = new THREE.Mesh(new THREE.PlaneGeometry(TW, TD), new THREE.MeshBasicMaterial({ map: stampTex, transparent: true, depthWrite: false, toneMapped: false })); m.rotation.x = -Math.PI / 2; m.position.set(0, .1, 0); t.g.add(m); t.stamp = m; }
  }
  function pulseTile(i, color) { const p = tilePos(i), m = new THREE.Mesh(new THREE.RingGeometry(.92, 1.08, 48), new THREE.MeshBasicMaterial({ color: lin(color), transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false })); m.rotation.x = -Math.PI / 2; m.position.set(p.x, .22, p.z); scene.add(m); tw(800, k => { m.scale.setScalar(1 + k * 2.1); m.material.opacity = (1 - k) * .9; }, ease.out).then(() => { scene.remove(m); m.geometry.dispose(); m.material.dispose(); }); }

  // ---------- efeitos ----------
  const fx = [];
  let puffTex;
  function puffCanvas() { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 2, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,.85)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return c; }
  function dust(x, z, n = 4, color = 0xe8dcc4) {
    puffTex = puffTex || tex(puffCanvas());
    for (let i = 0; i < n; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, color, transparent: true, depthWrite: false, opacity: .7 })), a = Math.random() * 6.28, sp = 1 + Math.random() * 1.4; s.position.set(x, .12, z); s.scale.setScalar(.3); scene.add(s); fx.push({ s, life: .55 + Math.random() * .25, t: 0, vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vy: .7 + Math.random(), g: -.3, grow: 1.7 }); }
  }
  const coinGeo = () => { if (!G.coin) { G.coin = new THREE.CylinderGeometry(.2, .2, .045, 18); G.coinM = new THREE.MeshStandardMaterial({ color: lin('#e8b93f'), metalness: 1, roughness: .26, emissive: lin('#6a4a10'), emissiveIntensity: .35 }); } };
  function coins(from, toFn, n, each) { // moeda de verdade voando entre dois pontos
    coinGeo();
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(G.coin, G.coinM); m.position.copy(from); m.castShadow = true; scene.add(m);
      const delay = i * 62, spin = new THREE.Vector3(Math.random() * 14 - 7, Math.random() * 14 - 7, Math.random() * 14 - 7), side = (Math.random() - .5) * 3.4, up = 2.5 + Math.random() * 2.5;
      wait(delay).then(() => tw(640, k => {
        const to = toFn(); m.position.lerpVectors(from, to, k); m.position.y += Math.sin(k * Math.PI) * up; m.position.x += Math.sin(k * Math.PI) * side;
        m.rotation.x += spin.x * .016; m.rotation.y += spin.y * .016; m.rotation.z += spin.z * .016; m.scale.setScalar(1 - k * .4);
      }, ease.inOut)).then(() => { scene.remove(m); each && each(i); });
    }
  }
  function confetti(x, y, z, n = 90) {
    const cols = ['#d8432f', '#e0a21b', '#2377c9', '#2c9a68', '#9a4fb0', '#fbf4e2'];
    G.conf = G.conf || new THREE.PlaneGeometry(.2, .28);
    for (let i = 0; i < n; i++) { const m = new THREE.Mesh(G.conf, new THREE.MeshStandardMaterial({ color: lin(cols[i % cols.length]), side: THREE.DoubleSide, roughness: .6 })), a = Math.random() * 6.283, sp = 3 + Math.random() * 10; m.position.set(x, y, z); scene.add(m); fx.push({ s: m, life: 2.2 + Math.random() * 1.6, t: 0, vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vy: 9 + Math.random() * 12, g: -15, drag: .985, rx: Math.random() * 9, rz: Math.random() * 9 }); }
  }
  // patrocínio: estrela de verdade, com volume, sempre virada para quem olha, balançando de leve e com brilhinhos em volta
  const sponsors = [], spQ = new THREE.Quaternion();
  function sealModel(lv) {
    const g = new THREE.Group(), geo = G.spGeo || (G.spGeo = starGeo(1, .58));
    const main = new THREE.MeshPhysicalMaterial({ color: lin(lv === 2 ? '#7a2be0' : '#2460f0'), roughness: .24, clearcoat: 1, clearcoatRoughness: .12, envMapIntensity: 1.1, emissive: lin(lv === 2 ? '#3a0f80' : '#0c2a90'), emissiveIntensity: .45 });
    add(geo, main, 0, 0, 0, g, false, false);
    const white = add(geo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .4 }), 0, 0, -.05, g, false, false); white.scale.set(1.12, 1.12, 1);
    const ink = add(geo, new THREE.MeshBasicMaterial({ color: lin('#141a33') }), 0, 0, -.09, g, false, false); ink.scale.set(1.22, 1.22, 1);
    const c = document.createElement('canvas'); c.width = 256; c.height = 128; const x = c.getContext('2d'), label = lv === 2 ? '2×' : '+50%'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = `${lv === 2 ? 104 : 84}px "Lilita One", sans-serif`; x.lineJoin = 'round'; x.lineWidth = 12; x.strokeStyle = lv === 2 ? '#2c0a66' : '#0a2070'; x.strokeText(label, 128, 68); x.fillStyle = '#fff'; x.fillText(label, 128, 68);
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 4;
    const txt = new THREE.Mesh(new THREE.PlaneGeometry(1.5, .75), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, toneMapped: false })); txt.position.z = .24; g.add(txt);
    // verso igual à frente, para quem gira a câmera e olha por trás
    add(geo, main, 0, 0, -.14, g, false, false).rotation.y = Math.PI; const txtB = new THREE.Mesh(txt.geometry, txt.material); txtB.position.z = -.38; txtB.rotation.y = Math.PI; g.add(txtB);
    if (!G.spark) { const k = document.createElement('canvas'); k.width = k.height = 64; const y = k.getContext('2d'); y.fillStyle = '#fff'; y.beginPath(); y.moveTo(32, 0); y.quadraticCurveTo(34, 30, 64, 32); y.quadraticCurveTo(34, 34, 32, 64); y.quadraticCurveTo(30, 34, 0, 32); y.quadraticCurveTo(30, 30, 32, 0); y.fill(); G.spark = new THREE.CanvasTexture(k); }
    g.userData.sparks = [[1.05, .75, .34], [-1.1, .35, .26], [.75, -.85, .22]].map(([a, b, sz]) => { const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: G.spark, transparent: true, depthWrite: false, toneMapped: false })); m.position.set(a, b, .2); m.scale.setScalar(sz); g.add(m); return m; });
    return g;
  }
  // etiqueta discreta do jornal nas casas afetadas: texto vermelho encarece, verde barateia
  const newsTex = {};
  function newsLabel(txt, up) {
    const key = txt + up; if (newsTex[key]) return newsTex[key];
    const c = document.createElement('canvas'); c.width = 192; c.height = 92; const x = c.getContext('2d');
    x.beginPath(); x.roundRect(6, 6, 180, 80, 40); x.fillStyle = 'rgba(36, 29, 23, .88)'; x.fill();
    x.fillStyle = up ? '#ff9d8a' : '#8fe3a8'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = `${txt.length > 4 ? 44 : 58}px 'Lilita One', Nunito, sans-serif`; x.fillText(txt, 96, 49);
    return (newsTex[key] = tex(c));
  }
  function setNewsMarks(marks) {
    tiles.forEach((t, i) => {
      const m = marks[i], key = m ? m.t + m.up : null; if (t.newsKey === key || (!t.newsKey && !key)) return;
      if (t.newsMark) { t.g.remove(t.newsMark); t.newsMark.material.dispose(); t.newsMark = null; }
      t.newsKey = key; if (!m) return;
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: newsLabel(m.t, m.up), transparent: true, depthWrite: false, depthTest: false, toneMapped: false }));
      s.scale.set(1.1, .53, 1); s.position.set(0, .12, -.55); s.renderOrder = 5; t.g.add(s); t.newsMark = s;
    });
  }
  function setSponsor(i, lv, pop = false) {
    const t = tiles[i];
    if (t.spons) { t.g.remove(t.spons.g); sponsors.splice(sponsors.indexOf(t.spons), 1); t.spons = null; }
    if (!lv) return;
    const g = new THREE.Group(), seal = sealModel(lv), size = lv === 2 ? 1 : .86;
    seal.position.set(0, 2, 0); seal.scale.setScalar(size); g.add(seal);
    t.g.add(g); t.spons = { g, seal, tile: t, lv, size, pop: false }; sponsors.push(t.spons);
    if (pop) { t.spons.pop = true; tw(420, k => { seal.scale.setScalar(size * Math.max(.01, k < .7 ? k / .7 * 1.3 : 1.3 - .3 * (k - .7) / .3)); }).then(() => { seal.scale.setScalar(size); if (t.spons) t.spons.pop = false; }); }
  }
  // confete no canto e o selo voa até o lugar escolhido
  function sponsorBurst(i) { const p = tilePos(i); [0, 180].forEach(d => wait(d).then(() => pulseTile(i, '#4f8dff'))); confetti(p.x, .5, p.z, 34); }
  async function sponsorFly(from, to, lv) {
    const A = tilePos(from), B = tilePos(to), a = new THREE.Vector3(A.x, 1, A.z), b = new THREE.Vector3(B.x, 1.5, B.z), m = sealModel(lv); m.position.copy(a); scene.add(m);
    coins(a, () => b, 7);
    await tw(720, k => { m.position.lerpVectors(a, b, k); m.position.y += Math.sin(k * Math.PI) * 5; m.scale.setScalar(.6 + Math.sin(k * Math.PI) * .6); m.quaternion.copy(camera.quaternion); }, ease.inOut);
    scene.remove(m); setSponsor(to, lv, true); pulseTile(to, '#4f8dff'); dust(B.x, B.z, 10, 0xcfe0ff); shake(.16);
  }
  // viatura da blitz: chega pela rua, para atrás de quem caiu e fica com o giroflex ligado
  let car = null;
  function carModel() {
    const g = new THREE.Group(), white = std('#f4f1e8', { roughness: .45 }), ink = std('#1d2b3a', { roughness: .4 }), glass = std('#3b5468', { roughness: .25 }), tyre = std('#17171a', { roughness: .9, envMapIntensity: .1 });
    add(box(1.22, .17, .56), white, 0, .2, 0, g); add(box(.3, .13, .57), ink, .46, .19, 0, g); add(box(.3, .13, .57), ink, -.46, .19, 0, g);
    add(box(.6, .17, .5), glass, -.06, .37, 0, g); add(box(.64, .03, .52), white, -.06, .47, 0, g);
    add(box(.03, .05, .5), std('#ffe9a8', { emissive: lin('#ffd479'), emissiveIntensity: .8 }), .615, .22, 0, g, false);
    const wheel = new THREE.CylinderGeometry(.11, .11, .08, 14); wheel.rotateX(Math.PI / 2);
    for (const x of [-.38, .38]) for (const z of [-.28, .28]) add(wheel, tyre, x, .11, z, g);
    const red = new THREE.MeshStandardMaterial({ color: lin('#7a1711'), emissive: lin('#ff2b1c'), emissiveIntensity: 0 }), blue = new THREE.MeshStandardMaterial({ color: lin('#12306e'), emissive: lin('#2b6bff'), emissiveIntensity: 0 });
    add(box(.1, .07, .22), red, -.06, .52, -.13, g, false); add(box(.1, .07, .22), blue, -.06, .52, .13, g, false);
    puffTex = puffTex || tex(puffCanvas());
    const halo = c => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, color: c, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })); s.scale.setScalar(2.1); g.add(s); return s; };
    const hr = halo(0xff3322), hb = halo(0x3377ff); hr.position.set(-.06, .56, -.2); hb.position.set(-.06, .56, .2);
    g.userData = { red, blue, hr, hb }; return g;
  }
  const roadPath = (ids, y) => new THREE.CatmullRomCurve3(ids.map(i => { const p = roadPos(i); return new THREE.Vector3(p.x, y, p.z); }));
  function drive(path, ms, fn, onK) {
    return tw(ms, k => { const u = Math.max(0, Math.min(1, k)); path.getPoint(u, car.position); const d = path.getTangent(u); car.rotation.y = Math.atan2(-d.z, d.x); onK && onK(u); }, fn);
  }
  async function blitzCar(on, now = false) {
    if (!on) {
      if (!car || car.leaving) return; const c = car; c.leaving = true;
      if (now) { scene.remove(c); car = null; return; }
      await drive(roadPath([29, 30, 31, 33, 35], c.position.y), 1100, k => k * k, u => c.scale.setScalar(1 - Math.max(0, u - .7) / .3));
      scene.remove(c); if (car === c) car = null; return;
    }
    if (car) scene.remove(car);
    const t = tokens.find(x => x && x.at === 30 && !x.out), y = (t ? baseY(t) : .4) - .1;
    car = carModel(); scene.add(car);
    await drive(roadPath([24, 26, 28, 29], y), 760, ease.out);
    const p = roadPos(29); dust(p.x + .5, p.z, 6, 0xcfd8c8); shake(.22);
    if (t) { const y0 = t.m.position.y; t.moving = true; await tw(280, k => { t.m.position.y = y0 + Math.sin(k * Math.PI) * .6; }); t.m.position.y = y0; t.moving = false; }
  }
  function updateFx(dt) {
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i]; f.t += dt; const k = f.t / f.life;
      if (k >= 1) { scene.remove(f.s); f.s.material.dispose(); fx.splice(i, 1); continue; }
      f.vy += f.g * dt; if (f.drag) { f.vx *= f.drag; f.vz *= f.drag; }
      f.s.position.x += f.vx * dt; f.s.position.y += f.vy * dt; f.s.position.z += f.vz * dt; if (f.rx) { f.s.rotation.x += f.rx * dt; f.s.rotation.z += f.rz * dt; if (f.s.position.y < .15) { f.s.position.y = .15; f.vx = f.vz = f.vy = f.rx = f.rz = 0; f.s.rotation.x = -Math.PI / 2; f.g = 0; } }
      if (f.grow) { f.s.scale.setScalar(.3 + k * f.grow); f.s.material.opacity = (1 - k) * .7; } else if (k > .8) { f.s.material.transparent = true; f.s.material.opacity = (1 - k) / .2; }
    }
  }
  function idle(t, dt) {
    // o selo flutua acima do que estiver construído e nada o esconde
    // a estrela fica em pé e reta na mesma direção em toda casa; não acompanha a câmera
    sponsors.forEach(o => { const w = Math.sin(t * 2.2), top = [1, 1.1, 1.25, 1.3, 1.9, 2.75][o.tile.h] || 1, m = o.seal; m.position.y = top + 1.2 + w * .14; m.quaternion.copy(m.parent.getWorldQuaternion(spQ).invert()); m.userData.sparks.forEach((p, k) => { p.material.opacity = Math.max(0, Math.sin(t * 2.6 + k * 2.1)); }); });
    spinners.forEach(m => { m.rotation.y = t * 1.2; });
    if (car) { const u = car.userData, w = Math.sin(t * 13), r = Math.max(0, w), b = Math.max(0, -w); u.red.emissiveIntensity = r * 2.4; u.blue.emissiveIntensity = b * 2.4; u.hr.material.opacity = r * .8; u.hb.material.opacity = b * .8; }
    let shown = false;
    tokens.forEach((tk, i) => {
      if (!tk) return; tk.k += (tk.kGoal - tk.k) * (1 - Math.exp(-dt * 9)); tk.m.scale.set(tk.k * tk.sx, tk.k * tk.sy, tk.k * tk.sx);
      if (tk.moving || tk.out) return; const on = active === i;
      tk.m.position.y = baseY(tk);
      if (on && activeRing) { const pulse = Math.sin(t * 3); activeRing.position.set(tk.m.position.x, tk.m.position.y + .03, tk.m.position.z); activeRing.scale.setScalar((1 + pulse * .07) * tk.k / K1); activeRing.material.opacity = .72 + pulse * .25; shown = true; }
    });
    if (activeRing) activeRing.visible = shown;
  }
  let active = -1, activeRing = null;
  // a vez é marcada por um anel no chão; o peão fica parado
  const setActive = i => {
    active = i; if (i < 0 || !tokens[i]) return;
    if (!activeRing) { activeRing = new THREE.Mesh(new THREE.RingGeometry(.74, .9, 56), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false })); activeRing.rotation.x = -Math.PI / 2; activeRing.renderOrder = 2; scene.add(activeRing); }
    activeRing.material.color.copy(lin(tokens[i].p.color));
  };

  // ---------- seleção com o ponteiro ----------
  const ray = new THREE.Raycaster();
  function pick(px, py) {
    ray.setFromCamera(new THREE.Vector2(px / innerWidth * 2 - 1, -(py / innerHeight) * 2 + 1), camera);
    const hit = ray.intersectObjects(tiles.map(t => t.mesh), false)[0];
    return hit ? hit.object.userData.sq : null;
  }
  const ZMIN = .3, ZMAX = 1.25;
  const stopCam = () => { cam.vx = cam.vz = cam.va = cam.ve = 0; cam.snap = null; cam.vs = 0; cam.back = false; lastInput = performance.now(); };
  let lastInput = 0;
  const zoomTo = z => { cam.zg = Math.max(ZMIN, Math.min(ZMAX, z)); lastInput = performance.now(); };
  function bindPointer(onTap, onHover) {
    const pts = new Map(); let down = null, pair = null;
    const panBy = (dx, dy) => { // o chão acompanha o dedo
      const az = cam.az + cam.user, el = Math.max(EL_MIN, Math.min(EL_MAX, cam.el + cam.userEl)) * (1 - cam.fl) + FLAT_EL * cam.fl, w = cam.wpp, a = -dx * w, b = dy * w / Math.sin(el);
      return { x: Math.cos(az) * a - Math.sin(az) * b, z: -Math.sin(az) * a - Math.cos(az) * b };
    };
    const track = (cur, v, t, max) => cur + (Math.max(-max, Math.min(max, v / Math.max(.004, t))) - cur) * .4;
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('pointerdown', e => {
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); canvas.setPointerCapture(e.pointerId); stopCam(); cam.held = true;
      if (pts.size === 2) { const [a, b] = [...pts.values()]; pair = { d: Math.hypot(a.x - b.x, a.y - b.y), ang: Math.atan2(b.y - a.y, b.x - a.x), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }; if (down) down.moved = 99; return; }
      // arrastar só gira, com qualquer botão: a mesa não sai do lugar. Só na visão 2D com zoom dá para passear
      down = { x: e.clientX, y: e.clientY, moved: 0, t: performance.now(), rot: !cam.flat };
    });
    canvas.addEventListener('pointermove', e => {
      if (!pts.has(e.pointerId)) { if (onHover && e.pointerType === 'mouse') onHover(flipping ? null : pick(e.clientX, e.clientY), e.clientX, e.clientY); return; }
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); onHover && onHover(null); lastInput = performance.now();
      if (pts.size >= 2 && pair) {
        const [a, b] = [...pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y), ang = Math.atan2(b.y - a.y, b.x - a.x), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        cam.zg = cam.zoom = Math.max(ZMIN, Math.min(ZMAX, cam.zg * pair.d / Math.max(1, d))); let da = ang - pair.ang; if (da > Math.PI) da -= 2 * Math.PI; if (da < -Math.PI) da += 2 * Math.PI; cam.user -= da;
        pair = { d, ang, mx, my }; return;
      }
      if (!down) return;
      const dx = e.clientX - down.x, dy = e.clientY - down.y, now_ = performance.now(), t = (now_ - down.t) / 1000; down.x = e.clientX; down.y = e.clientY; down.t = now_; down.moved += Math.hypot(dx, dy);
      if (down.moved <= 6) return;
      if (down.rot) { const a = -dx * .0047, b = dy * .0031; cam.px *= .88; cam.pz *= .88; cam.user += a; cam.userEl += b; cam.va = track(cam.va, a, t, 4); cam.ve = track(cam.ve, b, t, 1.2); }
      else { const p = panBy(dx, dy); cam.px += p.x; cam.pz += p.z; cam.vx = track(cam.vx, p.x, t, 40); cam.vz = track(cam.vz, p.z, t, 40); }
    });
    const up = e => {
      pts.delete(e.pointerId);
      if (pts.size) { const [o] = [...pts.values()]; pair = null; down = { x: o.x, y: o.y, moved: 99, t: performance.now(), rot: !cam.flat }; return; }
      cam.held = false; pair = null;
      if (down) { if (performance.now() - down.t > 90) { cam.vx = cam.vz = cam.va = cam.ve = 0; } if (down.moved <= 6 && e.type === 'pointerup') { const s = pick(e.clientX, e.clientY); if (s !== null) onTap(s); } }
      down = null;
    };
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('wheel', e => { e.preventDefault(); zoomTo(cam.zg * Math.exp(Math.max(-120, Math.min(120, e.deltaY)) * (e.ctrlKey ? .01 : .0016))); }, { passive: false });
  }
  const resetView = () => { stopCam(); cam.zg = cam.flat ? 1 : VIEW0.zg; cam.lift = VIEW0.lift; setFov(VIEW0.fov); cam.back = cam.backEl = true; cam.snap = Math.round((cam.user - VIEW0.az) / (Math.PI * 2)) * Math.PI * 2 + (cam.flat ? 0 : VIEW0.az); };
  // ao lançar os dados um passeio feito com o botão direito volta ao centro; o zoom fica como a pessoa deixou
  const recenter = () => { if (!cam.held) { cam.back = true; cam.vx = cam.vz = 0; } };

  // ---------- início ----------
  function thumbnail(id, color) { // retrato da peça para o placar
    const s = new THREE.Scene(); s.background = lin(color).multiplyScalar(.55); s.environment = scene.environment;
    const m = tokenModel(id, color); s.add(m); const box = new THREE.Box3().setFromObject(m), cy = (box.min.y + box.max.y) / 2;
    s.add(new THREE.HemisphereLight(0xffffff, 0x554433, .55)); const d = new THREE.DirectionalLight(0xfff0d8, 1.1); d.position.set(-2, 4, 3); s.add(d);
    const c = new THREE.PerspectiveCamera(28, 1, .1, 20); c.position.set(0, cy + 1.25, 3.4); c.lookAt(0, cy, 0);
    const size = gl.getSize(new THREE.Vector2()), pr = gl.getPixelRatio(); gl.setPixelRatio(1); gl.setSize(160, 160, false); gl.shadowMap.autoUpdate = false; gl.render(s, c);
    const url = gl.domElement.toDataURL('image/png'); gl.setPixelRatio(pr); gl.setSize(size.x, size.y, false); gl.shadowMap.autoUpdate = true; return url;
  }
  async function init(cv, bar) {
    canvas = cv;
    gl = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    gl.setPixelRatio(Math.min(2, devicePixelRatio)); gl.outputEncoding = THREE.sRGBEncoding; gl.toneMapping = THREE.NoToneMapping; gl.shadowMap.enabled = true; gl.shadowMap.type = THREE.PCFSoftShadowMap;
    scene = new THREE.Scene(); scene.background = new THREE.Color('#17392b'); scene.fog = new THREE.Fog(new THREE.Color('#17392b'), 130, 620); // câmera bem baixa: o feltro some no horizonte
    camera = new THREE.PerspectiveCamera(FOV, 1, 1, 2400);
    scene.environment = buildEnv();
    scene.add(new THREE.HemisphereLight(0xffeedd, 0x2a2a3a, .2));
    sun = new THREE.DirectionalLight(0xffe7c6, 1.02); sun.position.set(-18, 76, 14); sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096); Object.assign(sun.shadow.camera, { left: -52, right: 52, top: 52, bottom: -52, near: 10, far: 170 }); sun.shadow.bias = -.00025; sun.shadow.normalBias = .012; sun.shadow.radius = 3; scene.add(sun);
    const fill = new THREE.DirectionalLight(0xa9c4ff, .12); fill.position.set(20, 16, -18); scene.add(fill);
    await Art.ready(); bar(.06);
    buildBoard(bar);
    rig = new THREE.Group(); scene.add(rig); [...scene.children].forEach(o => { if (o !== rig && !o.isLight && !o.userData.stay) rig.attach(o); });
    buildDice(); ensureGeos();
    fit(); cam.el = cam.gel = OV_EL;
    addEventListener('resize', fit);
    requestAnimationFrame(frame);
    // aba oculta não dispara animação; a lógica continua para os bots não travarem
    setInterval(() => { const n = performance.now(); if (n - lastFrame > 250) step(n, false); }, 120);
    bar(1);
  }
  const setSpeed = v => { speed = v; };
  return { VIEW0, setNewsMarks, setSpectators, specAct, setJoined, flyPlane, init, spinRoulette, setSponsor, sponsorBurst, sponsorFly, blitzCar, setFov, setFloor, flipTable, setFieldColor, fieldColor: () => fieldHex, setFlat, introCam, focusTable, recenter, arrest, release, deckPoint, setPanel, setHud, setupView, addPlayers, setFace, walk, fly, rollDice, rollOne, placeDice, overview, setActive, setHouses, setPux, setOwner, setMortgaged, pulseTile, dust, coins, confetti, shake, toScreen, fromScreen, tilePos, roadPos, tokens, liftCard, layoutTokens, syncToken, dropOut, wait, tw, bindPointer, resetView, thumbnail, setSpeed, ease, cam, get camera() { return camera; }, get gl() { return gl; }, get scene() { return scene; } };
})();
