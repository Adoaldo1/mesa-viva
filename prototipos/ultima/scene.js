// Última!: as cartas em 3D sobre um pano de feltro (three.js r128). A câmera fica parada; quem mexe são as cartas.
const Stage = (() => {
  const T = THREE, C = Ultima.CARDS;
  const CW = 0.64, CH = 1, CD = 0.011, CR = 0.07; // carta: largura, altura, espessura e canto, nas unidades da geometria
  const TS = 1.75; let FS = 1.6;                  // escala das cartas no descarte/monte e na mão dos outros
  const PILE = new T.Vector3(0, 0, 1.15), DECK = new T.Vector3(-3.6, 0, -1.9), MID = new T.Vector3(0, 0, 0); // o descarte no meio; o monte longe, no fundo à esquerda (muda com a tela em seatWorld)
  const UP = new T.Vector3(0, 1, 0), HAND_D = 5, HAND_UP = 0.6; // HAND_UP: altura do centro da carta do meio acima da borda de baixo, em alturas de carta
  const FELT_S = 60, DECK_YAW = 0.75, PILE_SHOW = 22, FAN_MAX = 12, STEP = 0.0042, BEND = 0.035; // BEND: quanto as beiradas sobem quando a carta está curvada
  // cores do feltro: no meio, na borda e o fundo além da mesa (antes da luz). A escolha fica salva no aparelho (ui.js).
  const FELTS = {
    preto: { name: 'Preto', mid: '#18181b', edge: '#070708', bg: '#030303', amp: 3.1 },
    vermelho: { name: 'Vermelho', mid: '#8a1520', edge: '#2a0509', bg: '#140305' },
    verde: { name: 'Verde', mid: '#23744f', edge: '#0b2a1d', bg: '#06140e' },
    azul: { name: 'Azul', mid: '#215a88', edge: '#0b1f33', bg: '#060e17' },
    roxo: { name: 'Roxo', mid: '#5f3880', edge: '#1e1029', bg: '#0e0814' },
  };
  let feltKind = 'preto', outer;
  // fileira dos outros: passo máximo e largura máxima (em larguras de carta), raio da curva (em alturas), quanto deita para trás e quanto abre no alto
  const ROW_STEP = 0.42, ROW_W = 2.4, ROW_R = 3, ROW_LEAN = 0.1, ROW_TILT = 0.5;
  let renderer, scene, camera, ok = false, W = 1, H = 1, me = -1, nSeats = 0, speed = 1;
  let geo, stackGeo, rimGeo, backMat, edgeMat, faceTex = {}, blankTex, rimTex, glowTex, stripeTex;
  let felt, deckBody, pileBody, colorRing, colorGlow, dirRing, turnGlow, rowW = 2.4;
  const hand = [], fans = [], pile = [], seats = [];
  let deckN = 0, pileN = 0, dir = 1, handState = { myTurn: false, playable: new Set(), drawn: null, sending: null };
  let hovered = null, touch = false, drag = null, deckLoose = null;
  const tweens = new Set();
  const now = () => performance.now();

  // ---------- recursos ----------
  const tex = cv => { const t = new T.CanvasTexture(cv); t.encoding = T.sRGBEncoding; t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); return t; };
  const key = id => C[id].c + C[id].v;
  const faceOf = id => (id < 0 ? blankTex : faceTex[key(id)] || (faceTex[key(id)] = tex(Art.face(C[id].c, C[id].v))));
  // bloco do monte e do descarte: o contorno extrudado (cresce em z com a escala)
  function blockGeometry() {
    const s = new T.Shape(), w = CW, h = CH, r = CR, x = -w / 2, y = -h / 2;
    s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
    s.lineTo(x + w, y + h - r); s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false);
    s.lineTo(x + r, y + h); s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false);
    s.lineTo(x, y + r); s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
    const g = new T.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false, curveSegments: 6 });
    const lid = g.groups[0], side = g.groups[1], half = lid.count / 2, pos = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < lid.count; i++) { const u = (pos.getX(i) + CW / 2) / CW; uv.setXY(i, i < half ? 1 - u : u, (pos.getY(i) + CH / 2) / CH); }
    g.clearGroups(); g.addGroup(0, half, 0); g.addGroup(half, half, 1); g.addGroup(side.start, side.count, 2);
    return g;
  }
  // contorno arredondado recuado d para dentro, sempre com o mesmo número de pontos por trecho (os anéis casam ponto a ponto)
  function ring(d, [nx, ny, na]) {
    const w = CW - 2 * d, h = CH - 2 * d, r = Math.max(0, CR - d), x1 = w / 2 - r, y1 = h / 2 - r, pts = [];
    const line = (ax, ay, bx, by, k) => { for (let i = 0; i < k; i++) pts.push([ax + (bx - ax) * i / k, ay + (by - ay) * i / k]); };
    const arc = (cx, cy, a0) => { for (let i = 0; i < na; i++) { const a = a0 + Math.PI / 2 * i / na; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } };
    line(-x1, -h / 2, x1, -h / 2, nx); arc(x1, -y1, -Math.PI / 2);
    line(w / 2, -y1, w / 2, y1, ny); arc(x1, y1, 0);
    line(x1, h / 2, -x1, h / 2, nx); arc(-x1, y1, Math.PI / 2);
    line(-w / 2, y1, -w / 2, -y1, ny); arc(-x1, -y1, Math.PI);
    return pts;
  }
  // a carta: verso (material 0), frente (1) e borda (2), com a frente e o verso feitos de anéis para ela poder curvar.
  // A curva fica guardada como morph: 0 = reta (na mesa), 1 = curvada como quem segura com o polegar no meio
  function cardGeometry() {
    const K = 3, rings = [], pos = [], nor = [], uv = [], idx = [], dp = [], dn = [], g = new T.BufferGeometry();
    for (let k = 0; k <= K; k++) rings.push(ring(k / K * CW / 2, [10, 14, 4]));
    const M = rings[0].length, f = x => BEND * (2 * x / CW) ** 2, df = x => 8 * BEND * x / (CW * CW);
    for (const s of [-1, 1]) {
      const base = pos.length / 3, start = idx.length;
      for (const rg of rings) for (const [x, y] of rg) {
        pos.push(x, y, s * CD / 2); nor.push(0, 0, s);
        const u = (x + CW / 2) / CW; uv.push(s < 0 ? 1 - u : u, (y + CH / 2) / CH); // o verso é visto por trás: espelha para a marca não sair invertida
        const sl = df(x), l = Math.hypot(sl, 1); dp.push(0, 0, f(x)); dn.push(-s * sl / l, 0, s / l - s);
      }
      for (let k = 0; k < K; k++) for (let j = 0; j < M; j++) {
        const a = base + k * M + j, b = base + k * M + (j + 1) % M, c = base + (k + 1) * M + (j + 1) % M, d = base + (k + 1) * M + j;
        if (s > 0) idx.push(a, b, c, a, c, d); else idx.push(a, c, b, a, d, c);
      }
      g.addGroup(start, idx.length - start, s > 0 ? 1 : 0);
    }
    const base = pos.length / 3, start = idx.length, o = rings[0];
    o.forEach(([x, y], j) => {
      const [px, py] = o[(j + M - 1) % M], [qx2, qy2] = o[(j + 1) % M], tx = qx2 - px, ty = qy2 - py, l = Math.hypot(tx, ty) || 1;
      for (const s of [-1, 1]) { pos.push(x, y, s * CD / 2); nor.push(ty / l, -tx / l, 0); uv.push(0, 0); dp.push(0, 0, f(x)); dn.push(0, 0, 0); }
    });
    for (let j = 0; j < M; j++) { const a = base + j * 2, b = base + ((j + 1) % M) * 2; idx.push(a, b, b + 1, a, b + 1, a + 1); }
    g.addGroup(start, idx.length - start, 2);
    g.setIndex(idx);
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    g.morphAttributes.position = [new T.Float32BufferAttribute(dp, 3)]; g.morphAttributes.normal = [new T.Float32BufferAttribute(dn, 3)]; g.morphTargetsRelative = true;
    return g;
  }
  function newCard(id = -1, shadow = true) {
    const front = new T.MeshPhysicalMaterial({ map: faceOf(id), emissive: 0xffffff, emissiveMap: faceOf(id), emissiveIntensity: 0, toneMapped: false, roughness: 0.55, metalness: 0, clearcoat: 0.2, clearcoatRoughness: 0.35, envMapIntensity: 0.45, morphTargets: true, morphNormals: true });
    front.color.setScalar(0.8); // na pilha o holofote batia direto e o amarelo estourava (a face não passa pelo tone mapping); a mão sobrescreve isso
    const m = new T.Mesh(geo, [backMat, front, edgeMat]);
    m.castShadow = shadow; m.receiveShadow = true;
    // brilho de jogável: desenhado logo depois do chão e antes de todas as cartas, então só aparece em volta delas
    // (por cima, o brilho de uma carta lavava a cor da vizinha e a mão inteira ficava desbotada)
    const rim = new T.Mesh(rimGeo, new T.MeshBasicMaterial({ map: rimTex, opacity: 0, blending: T.AdditiveBlending, depthWrite: false, color: 0xffe28a, toneMapped: false }));
    rim.position.z = -CD; rim.renderOrder = -1; rim.visible = false; m.add(rim);
    m.userData = { id, bp: new T.Vector3(), bq: new T.Quaternion(), bs: 1, bend: 0, lift: 0, liftT: 0, fan: 0, fanT: 0, oy: 0, oyT: 0, dim: 1, dimT: 1, glow: 0, glowT: 0, tw: null, rim, flying: false, down: false };
    scene.add(m);
    return m;
  }
  function setFace(m, id) { m.userData.id = id; m.material[1].map = m.material[1].emissiveMap = faceOf(id); m.material[1].needsUpdate = true; }
  function stop(m) { const u = m.userData; if (u.tw) { const tw = u.tw; tweens.delete(tw); tw.res(); } }
  function drop(m) { stop(m); scene.remove(m); m.material[1].dispose(); m.userData.rim.material.dispose(); }

  // ---------- orientação ----------
  const qx = a => new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), a);
  const qy = a => new T.Quaternion().setFromAxisAngle(UP, a);
  const qz = a => new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 0, 1), a);
  const faceUp = yaw => qy(yaw).multiply(qx(-Math.PI / 2));             // deitada de frente; com yaw 0 eu leio direito
  const faceDown = yaw => qy(yaw + Math.PI).multiply(qx(Math.PI / 2));  // deitada de costas; a cabeça aponta para qy(yaw)·(0,0,-1)

  // ---------- animação ----------
  const ease = {
    out: k => 1 - (1 - k) ** 3,
    out5: k => 1 - (1 - k) ** 5,
    io: k => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2),
    io2: k => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2),
    fall: k => k * k,
  };
  const clamp01 = k => Math.min(1, Math.max(0, k));
  function tween(dur, fn, e = ease.io, delay = 0) {
    return new Promise(res => { tweens.add({ t0: now() + delay / speed, dur: Math.max(1, dur / speed), fn, e, res }); });
  }
  const wait = ms => new Promise(r => setTimeout(r, ms / speed));
  function run(m, dur, delay, e, fn) {
    const u = m.userData;
    return new Promise(res => { const tw = { t0: now() + delay / speed, dur: Math.max(1, dur / speed), e, fn, res: () => { u.tw = null; res(); } }; u.tw = tw; tweens.add(tw); });
  }
  // giro em volta de si mesma que desenrola até o fim: começa embutido na pose de saída (antes a carta pulava de uma vez para o giro inteiro)
  const spun = (q, spin) => (spin ? q.clone().multiply(qz(-spin)) : q.clone());
  // leva a carta até o destino num arco; a rotação vai por slerp
  function fly(m, to, dur, { arc = 0, e = ease.io, delay = 0, spin = 0 } = {}) {
    const u = m.userData; stop(m);
    const p0 = u.bp.clone(), q0 = spun(u.bq, spin), s0 = u.bs, b0 = u.bend, pe = to.p.clone(), qe = to.q.clone(), se = to.s ?? s0, be = to.b ?? b0;
    return run(m, dur, delay, e, k => {
      const kc = clamp01(k);
      u.bp.lerpVectors(p0, pe, k); if (arc) u.bp.y += Math.sin(Math.PI * kc) * arc;
      u.bq.slerpQuaternions(q0, qe, kc); if (spin) u.bq.multiply(qz(spin * (1 - kc)));
      u.bs = s0 + (se - s0) * k; u.bend = b0 + (be - b0) * kc;
    });
  }
  // voo pela tela: a posição na tela e o tamanho aparente mudam por igual e a profundidade vai por 1/d
  // (da mão, a 5 da câmera, até a mesa, a ~80: em linha reta a carta encolhia de uma vez e parecia teleporte)
  const _v = new T.Vector3();
  function flyView(m, to, dur, { arc = 0, e = ease.io, delay = 0, spin = 0, flip = false } = {}) {
    const u = m.userData; stop(m); camera.updateMatrixWorld();
    const v0 = u.bp.clone().applyMatrix4(camera.matrixWorldInverse), v1 = to.p.clone().applyMatrix4(camera.matrixWorldInverse);
    const d0 = Math.max(0.5, -v0.z), d1 = Math.max(0.5, -v1.z), a0 = u.bs / d0, a1 = (to.s ?? u.bs) / d1, b0 = u.bend, b1 = to.b ?? b0;
    const q0 = spun(u.bq, spin), q1 = flip ? to.q.clone().multiply(qy(Math.PI)) : to.q.clone(), lift = arc * 2 * Math.tan(camera.fov * Math.PI / 360);
    return run(m, dur, delay, e, k => {
      const kc = clamp01(k), d = 1 / (1 / d0 + (1 / d1 - 1 / d0) * k);
      const sx = v0.x / d0 + (v1.x / d1 - v0.x / d0) * k, sy = v0.y / d0 + (v1.y / d1 - v0.y / d0) * k + Math.sin(Math.PI * kc) * lift;
      u.bp.copy(_v.set(sx * d, sy * d, -d).applyMatrix4(camera.matrixWorld)); u.bs = (a0 + (a1 - a0) * k) * d;
      u.bq.slerpQuaternions(q0, q1, kc); if (flip) u.bq.multiply(qy(Math.PI * kc)); if (spin) u.bq.multiply(qz(spin * (1 - kc))); // flip: vira no eixo comprido, como quem olha a carta
      u.bend = b0 + (b1 - b0) * kc;
    });
  }
  const place = (m, to) => { const u = m.userData; stop(m); u.bp.copy(to.p); u.bq.copy(to.q); u.bs = to.s ?? u.bs; u.bend = to.b ?? u.bend; };
  // pousar no feltro: chega baixinho um pouco antes do lugar e escorrega até parar (touch: na hora que encosta)
  async function land(m, to, dur, { arc = 0.9, spin = 0, touch } = {}) {
    const u = m.userData, dirV = to.p.clone().sub(u.bp).setY(0);
    if (dirV.lengthSq() < 1e-4) dirV.set(0, 0, -1);
    dirV.normalize();
    const pre = { p: to.p.clone().addScaledVector(dirV, -0.36).setY(to.p.y + 0.1), q: to.q.clone().multiply(qz(spin * 0.16)), s: to.s * 1.03, b: 0 };
    await fly(m, pre, dur * 0.72, { arc, e: ease.io2, spin: spin * 0.84 });
    touch?.();
    await fly(m, to, dur * 0.34, { e: ease.out5 });
  }
  // da minha mão até o descarte: voa pela tela, encosta um pouco antes do lugar (vindo do meu lado) e escorrega até parar
  async function landView(m, to, dur, { spin = 0, arc = 0.06, touch } = {}) {
    const dirV = to.p.clone().sub(camera.position).setY(0).normalize();
    const pre = { p: to.p.clone().addScaledVector(dirV, -0.32).setY(to.p.y + 0.12), q: to.q.clone().multiply(qz(spin * 0.14)), s: to.s * 1.03, b: 0 };
    await flyView(m, pre, dur * 0.74, { arc, e: ease.io, spin: spin * 0.86 });
    touch?.();
    await fly(m, to, dur * 0.3, { e: ease.out5 });
  }

  // ---------- montagem ----------
  function ringGeo(r0, r1, seg, rep) { // anel com UV polar (as setas seguem a volta)
    const pos = [], uv = [], idx = [];
    for (let i = 0; i <= seg; i++) { const a = i / seg * Math.PI * 2, c = Math.cos(a), s = Math.sin(a); pos.push(c * r0, 0, s * r0, c * r1, 0, s * r1); uv.push(i / seg * rep, 0, i / seg * rep, 1); if (i < seg) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); } }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); return g;
  }
  function build() {
    scene = new T.Scene();
    camera = new T.PerspectiveCamera(38, 1, 0.1, 400); scene.add(camera);
    // luz: um foco quente bem em cima do jogo (o pano escurece nas bordas) e preenchimento suave
    // reflexo: uma salinha com três softboxes, para o verniz das cartas pegar luz
    const pm = new T.PMREMGenerator(renderer), es = new T.Scene(); es.background = new T.Color(0x221d1e);
    const box = (c, k, pos, w, h) => { const m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ color: new T.Color(c).multiplyScalar(k), side: T.DoubleSide })); m.position.set(...pos); m.lookAt(0, 0, 0); es.add(m); };
    box(0xfff0dc, 2.2, [0, 10, 2], 9, 6); box(0xcfe4ff, 1, [-10, 4, -3], 5, 7); box(0xffe2c4, 0.8, [10, 3, 5], 4, 6);
    scene.environment = pm.fromScene(es, 0.03).texture; pm.dispose();
    scene.add(new T.HemisphereLight(0xe8f2ff, 0x1c1c20, 0.3)); // por baixo, a luz que volta do pano
    const spot = new T.SpotLight(0xffeed6, 0.85, 0, 0.75, 1, 1);
    spot.position.set(2, 26, 10); spot.target.position.set(0, 0, -1.5);
    spot.castShadow = true; spot.shadow.mapSize.set(2048, 2048); spot.shadow.bias = -0.0003; spot.shadow.normalBias = 0.02; spot.shadow.radius = 4; spot.shadow.camera.near = 10; spot.shadow.camera.far = 50;
    scene.add(spot, spot.target);
    const fill = new T.DirectionalLight(0xbfe0ff, 0.22); fill.position.set(-8, 10, -6); scene.add(fill);
    const rimL = new T.DirectionalLight(0xffd9a8, 0.35); rimL.position.set(6, 5, -12); scene.add(rimL); // contraluz: separa as cartas em pé do pano

    // o chão: um pano de FELT_S×FELT_S com o centro no descarte, ladrilho de feltro que repete, a cor por vértice escurece para as bordas; fora dele, pano liso na cor da borda
    scene.background = new T.Color(); scene.fog = new T.Fog(new T.Color(), 40, 120);
    const map = feltMap(1);
    const fg = new T.PlaneGeometry(FELT_S, FELT_S, 150, 150);
    fg.setAttribute('color', new T.Float32BufferAttribute(new Float32Array(fg.attributes.position.count * 3), 3));
    const fm = new T.MeshStandardMaterial({ map, vertexColors: true, emissive: 0xffffff, emissiveMap: map, emissiveIntensity: 0.34, roughness: 1, metalness: 0, envMapIntensity: 0, toneMapped: false });
    fm.onBeforeCompile = s => { s.fragmentShader = s.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance *= vColor;'); }; // o brilho próprio do pano segue a mesma cor
    felt = new T.Mesh(fg, fm);
    felt.rotation.x = -Math.PI / 2; felt.position.copy(PILE); felt.receiveShadow = true; felt.renderOrder = -2; scene.add(felt); // primeiro o chão, depois o brilho das cartas da mão, depois as cartas
    // costura em volta do descarte: filha do feltro (anda com ele) e sem profundidade, desenhada logo depois do pano
    const st = new T.Mesh(new T.PlaneGeometry(5, 5), new T.MeshBasicMaterial({ map: tex(Art.stitch(1.95, 5)), transparent: true, opacity: 0.32, depthTest: false, depthWrite: false, toneMapped: false }));
    st.renderOrder = -1.9; felt.add(st);
    outer = new T.Mesh(new T.PlaneGeometry(400, 400), new T.MeshStandardMaterial({ roughness: 1, metalness: 0, envMapIntensity: 0, toneMapped: false, depthWrite: false }));
    outer.rotation.x = -Math.PI / 2; outer.position.y = -0.05; outer.receiveShadow = true; outer.renderOrder = -3; scene.add(outer);

    geo = cardGeometry(); stackGeo = blockGeometry(); rimGeo = new T.PlaneGeometry(CW * 1.32, CH * 1.22);
    backMat = new T.MeshPhysicalMaterial({ map: tex(Art.back()), roughness: 0.45, clearcoat: 0.4, clearcoatRoughness: 0.28, envMapIntensity: 0.5, morphTargets: true, morphNormals: true });
    edgeMat = new T.MeshStandardMaterial({ color: 0xe9e1cf, roughness: 0.6, envMapIntensity: 0.6, morphTargets: true, morphNormals: true });
    blankTex = backMat.map; rimTex = tex(Art.rim()); glowTex = tex(Art.glow());
    const sc = document.createElement('canvas'); sc.width = 4; sc.height = 8; const sg = sc.getContext('2d'); sg.fillStyle = '#f4efe3'; sg.fillRect(0, 0, 4, 8); sg.fillStyle = '#c9c0ad'; sg.fillRect(0, 6, 4, 2);
    stripeTex = new T.CanvasTexture(sc); stripeTex.wrapS = stripeTex.wrapT = T.RepeatWrapping;

    // monte e descarte: um bloco com listras (uma por carta) e as cartas soltas por cima; o bloco não curva, usa cópias sem morph
    const flat = m => { const c = m.clone(); c.morphTargets = c.morphNormals = false; return c; };
    const blockBack = flat(backMat), blockEdge = flat(edgeMat);
    deckBody = new T.Mesh(stackGeo, [blockBack, blockBack, new T.MeshStandardMaterial({ map: stripeTex, roughness: 0.8 })]); deckBody.castShadow = deckBody.receiveShadow = true;
    deckBody.quaternion.copy(faceDown(DECK_YAW)); deckBody.position.copy(DECK); deckBody.scale.set(TS, TS, 0.0001); scene.add(deckBody);
    const pileStripe = stripeTex.clone(); pileStripe.needsUpdate = true;
    const pileMats = [blockEdge, blockEdge, new T.MeshStandardMaterial({ map: pileStripe, roughness: 0.8 })];
    pileBody = [[-0.12, 0.05, -0.03], [0.09, -0.06, 0.04], [-0.04, 0.03, 0.06], [0.14, -0.03, -0.05]].map(([yaw, dx, dz]) => { // giro e deslocamento de cada camada
      const m = new T.Mesh(stackGeo, pileMats); m.castShadow = m.receiveShadow = true;
      m.quaternion.copy(faceUp(yaw)); m.position.copy(PILE).add(new T.Vector3(dx, 0, dz)); m.scale.set(TS * 0.97, TS * 0.97, 0.0001); scene.add(m); return m;
    });

    // cor da vez: anel luminoso em volta do descarte; sentido: anel de setas que gira
    colorRing = new T.Mesh(ringGeo(1.3, 1.42, 96, 1), new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, side: T.DoubleSide, toneMapped: false }));
    colorRing.position.copy(PILE).setY(0.006); scene.add(colorRing);
    colorGlow = new T.Mesh(new T.PlaneGeometry(4, 4), new T.MeshBasicMaterial({ map: glowTex, transparent: true, opacity: 0.16, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false }));
    colorGlow.rotation.x = -Math.PI / 2; colorGlow.position.copy(PILE).setY(0.004); scene.add(colorGlow);
    const arT = tex(Art.arrows()); arT.wrapS = T.RepeatWrapping;
    dirRing = new T.Mesh(ringGeo(1.55, 1.76, 128, 3), new T.MeshBasicMaterial({ map: arT, transparent: true, opacity: 0.3, depthWrite: false, side: T.DoubleSide }));
    dirRing.position.copy(PILE).setY(0.005); dirRing.visible = false; scene.add(dirRing); // o anel de setas girando saiu (pedido do Adoaldo); fica escondido para não mexer no resto
    turnGlow = new T.Mesh(new T.PlaneGeometry(4.4, 4.4), new T.MeshBasicMaterial({ map: glowTex, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false, color: 0xffe08a, toneMapped: false }));
    turnGlow.rotation.x = -Math.PI / 2; turnGlow.position.y = 0.01; turnGlow.visible = false; scene.add(turnGlow); // a luz no chão saiu: a vez agora aparece na fileira
    setColor('r', true);
  }

  // ---------- câmera e lugares ----------
  function handMetrics() {
    const hh = Math.tan(camera.fov * Math.PI / 360) * HAND_D, hw = hh * camera.aspect;
    const ch = Math.min(hh * 2 * 0.17, hw * 2 * 0.18 / CW, H ? 175 / H * hh * 2 : 9), cw = ch * CW; // limita a altura da carta em px nas telas grandes
    return { hh, hw, ch, cw };
  }
  const handTopY = () => { const { hh, ch } = handMetrics(); return (1 - (-hh + ch * (HAND_UP + 0.5)) / hh) / 2 * H; };
  // câmera parada, de longe e com lente fechada (quase isométrica), olhando reto para o centro; para caber entre o topo e a minha mão
  // a imagem é deslocada (como lente de arquiteto), sem inclinar a câmera
  let offY = 0;
  function frame() {
    const a = W / H, tall = a < 0.8, elev = (tall ? 52 : 46) * Math.PI / 180;
    camera.aspect = a; camera.fov = tall ? 22 : 18;
    camera.clearViewOffset(); // a altura da mão (handTopY) é medida com a imagem centrada
    const topPx = Math.min(120, H * 0.13), botPx = handTopY() - 10;
    offY = H / 2 - (topPx + botPx) / 2; camera.setViewOffset(W, H, 0, offY, W, H); // também atualiza a projeção
    const top = 1 - 2 * topPx / H, bottom = 1 - 2 * botPx / H, dirV = new T.Vector3(0, Math.sin(elev), Math.cos(elev));
    // o que precisa caber: o descarte com os anéis, o monte e, em cada lugar, a fileira (no alto quando é a vez dele, e as pontas) e o crachá logo à frente
    const pts = [[-1.9, 0, 0], [1.9, 0, 0], [0, 0, -1.9], [0, 0, 1.9]].map(p => new T.Vector3(...p).add(PILE));
    pts.push(DECK.clone().add(new T.Vector3(-0.7, 0, -1)), DECK.clone().add(new T.Vector3(0.7, 0, 1)));
    seats.forEach((st, i) => {
      if (i === me) return;
      const yaw = fanYaw(i), side = new T.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)).multiplyScalar(CW * FS * (rowW / 2 + 0.75)), back = st.pos.clone().addScaledVector(st.out, 0.3 * FS); // as pontas curvam para trás e abrem no alto
      pts.push(st.pos.clone().setY(FS * 1.25), st.pos.clone().add(new T.Vector3(0, 0, 0.9)), st.pos.clone().addScaledVector(st.out, 0.8), back.clone().add(side).setY(FS), back.clone().sub(side).setY(FS));
    });
    const aim = d => { camera.position.copy(MID).addScaledVector(dirV, d); camera.lookAt(MID); camera.updateMatrixWorld(); };
    const fits = () => pts.every(p => { const v = p.clone().project(camera); return Math.abs(v.x) < 0.94 && v.y <= top && v.y >= bottom; });
    let lo = 4, hi = 400;
    for (let k = 0; k < 28; k++) { const d = (lo + hi) / 2; aim(d); if (fits()) hi = d; else lo = d; }
    aim(hi); camera.far = hi + 200; camera.updateProjectionMatrix();
    scene.fog.near = hi + 15; scene.fog.far = hi + 120;
  }
  const project = v => { const p = v.clone().project(camera); return { x: (p.x + 1) / 2 * W, y: (1 - p.y) / 2 * H }; };
  const ray = new T.Raycaster(), ndc = new T.Vector2();
  const aimRay = (x, y) => { ndc.set(x / W * 2 - 1, -(y / H) * 2 + 1); ray.setFromCamera(ndc, camera); return ray.ray; };
  function onPlane(x, y, h = 0) { // ponto da tela -> ponto no feltro (ou num plano acima dele)
    const r = aimRay(x, y), t = (h - r.origin.y) / r.direction.y; return r.origin.clone().addScaledVector(r.direction, t);
  }
  // os outros ficam numa roda em volta do centro, no feltro (do meu lado esquerdo, pelo fundo, até o direito: a vez anda no sentido do relógio)
  function seatWorld() {
    seats.length = 0;
    const tall = W / H < 0.8, opp = me < 0 ? nSeats : nSeats - 1;
    const rx = tall ? 3.3 + opp * 0.12 : 5.4 + opp * 0.32, rz = tall ? 4.4 + opp * 0.22 : 3.4 + opp * 0.14;
    // com só dois na frente, eles ficam nos lados: o descarte sobe para longe da minha mão (leva junto o pano desenhado e os anéis)
    const pz = opp <= 2 ? 0.5 : 1.15;
    if (pz !== PILE.z) { const dz = pz - PILE.z; PILE.z = pz; [felt, colorRing, colorGlow, dirRing, ...(pileBody || []), ...pile].forEach(m => { if (m) m.position.z += dz; }); }
    const ext = (opp > 6 ? 26 : opp > 3 ? 16 : opp > 2 ? 6 : 0) * Math.PI / 180;
    FS = Math.min(tall ? 1.25 : 1.7, (tall ? 7 : 12) / Math.max(opp, 1)); // com muita gente as fileiras encolhem para não encostar
    rowW = ROW_W * (opp > 6 ? 0.55 : opp > 4 ? 0.75 : 1); // e as fileiras ficam mais curtas
    // o monte: longe do descarte, no fundo à esquerda, no ponto mais livre dos crachás (a distância em z conta menos: a câmera vê o feltro de lado)
    const thOf = k => Math.PI + ext - (opp > 1 ? k / (opp - 1) : 0.5) * (Math.PI + ext * 2), ex = rx / ((rx + rz) / 2), ez = rz / ((rx + rz) / 2);
    let best = -Infinity;
    if (!tall) for (let deg = 100; deg <= 170; deg += 5) for (let r = 2.6; r <= 4.01; r += 0.2) { // no celular não sobra vão: o monte vai para o canto (deckCorner)
      const th = deg * Math.PI / 180, x = r * ex * Math.cos(th), z = -r * ez * Math.sin(th);
      if (Math.hypot(x, z) < 2.8) continue; // fora dos anéis do descarte
      let m = Infinity; for (let k = 0; k < opp; k++) { const a = thOf(k); m = Math.min(m, Math.hypot(x - rx * 0.92 * Math.cos(a), (z + rz * 0.92 * Math.sin(a)) * 0.72)); }
      const score = Math.min(m, 3) - Math.abs(deg - 135) * 0.004 - (r - 2.6) * 0.05; // livre (até um ponto), perto do canto de cima à esquerda e não longe demais
      if (score > best) { best = score; DECK.set(x, 0, z); }
    }
    if (deckBody) { deckBody.position.x = DECK.x; deckBody.position.z = DECK.z; }
    for (let i = 0; i < nSeats; i++) {
      let pos;
      if (i === me) pos = MID.clone().add(new T.Vector3(0, 0, rz + 2));
      else {
        const k = me < 0 ? i : (i - me - 1 + nSeats) % nSeats;
        const th = thOf(k);
        pos = MID.clone().add(new T.Vector3(rx * Math.cos(th), 0, -rz * Math.sin(th)));
      }
      seats.push({ pos, out: pos.clone().sub(MID).setY(0).normalize(), screen: { x: W / 2, y: H }, badge: null });
    }
    while (fans.length < nSeats) fans.push([]);
  }
  // o crachá fica no pé da fileira (as cartas saem de trás da foto, como na mão de alguém)
  function seatScreen() {
    const hTop = handTopY();
    seats.forEach((st, i) => {
      st.screen = project(st.pos); if (i === me) return;
      const a = project(st.pos), tip = project(st.pos.clone().setY(CH * FS));
      const size = Math.round(Math.max(34, Math.min(56, Math.hypot(tip.x - a.x, tip.y - a.y) * 0.45)));
      st.badge = { x: Math.max(44, Math.min(W - 44, a.x)), y: Math.max(44, Math.min(hTop - size, a.y + size * 0.3)), size };
    });
  }
  // no celular os lugares ficam colados uns nos outros: o monte vai para o canto de cima à esquerda, acima das fileiras, onde sobra feltro
  function deckCorner() {
    DECK.set(0, 0, 0); frame(); // câmera sem o monte; o canto escolhido cabe nela, então ela não muda
    let rowTop = H; seats.forEach((st, i) => { if (i !== me) rowTop = Math.min(rowTop, project(st.pos.clone().setY(CH * FS * 1.2)).y); });
    const topPx = Math.min(120, H * 0.13), p = onPlane(W * 0.2, Math.max(topPx + 40, (topPx + rowTop) / 2));
    DECK.set(p.x, 0, p.z); if (deckBody) { deckBody.position.x = DECK.x; deckBody.position.z = DECK.z; }
  }
  function layoutSeats() { seatWorld(); if (W / H < 0.8) deckCorner(); frame(); seatScreen(); }
  function resize() {
    const c = renderer.domElement; W = c.clientWidth || innerWidth; H = c.clientHeight || innerHeight;
    renderer.setSize(W, H, false); layoutSeats(); layoutHand(false); fans.forEach((f, i) => layoutFan(i, false));
    renderer.render(scene, camera); // mudar o tamanho apaga o quadro; sem desenhar já, a mesa piscava escura enquanto o painel abria ou fechava
  }

  // ---------- minha mão: um leque em arco à frente da câmera, girando em volta de um polegar bem abaixo da tela ----------
  function handArc(n) {
    const { hh, hw, ch, cw } = handMetrics(), tall = camera.aspect < 0.8, R = ch * 3.8, maxW = hw * 2 * (tall ? 0.94 : 0.62);
    const spread = n > 1 ? Math.min(0.105 * (n - 1), 0.8, 2 * Math.asin(Math.min(1, Math.max(0, (maxW - cw) / (2 * R))))) : 0;
    const cy = -hh - 2 * hh * offY / H + ch * HAND_UP; // a imagem está deslocada: a borda de baixo desce junto
    return { R, spread, cy, ch, pivot: new T.Vector3(0, cy - R, -HAND_D) };
  }
  function handTarget(i, n) {
    const { R, spread, cy, ch } = handArc(n), a = n > 1 ? -spread / 2 + spread * i / (n - 1) : 0;
    const f = 1 - i * 0.06 / HAND_D, local = new T.Vector3(R * Math.sin(a) * f, (cy - R * (1 - Math.cos(a))) * f, -HAND_D * f);
    const q = camera.quaternion.clone().multiply(qz(-a)).multiply(qx(-0.12)); // deitada um pouco para trás, como apoiada na mão
    return { p: camera.localToWorld(local), q, s: ch / CH * f, b: 1 };
  }
  function layoutHand(anim = true, skip) {
    hand.forEach((m, i) => {
      if (m === skip || m.userData.flying || m === drag?.m) return;
      const to = handTarget(i, hand.length); if (m.userData.down) to.q.multiply(qy(Math.PI)); // ainda de costas (na distribuição)
      anim ? fly(m, to, 340, { e: ease.out }) : place(m, to);
    });
  }
  const order = id => 'rygbw'.indexOf(C[id].c) * 20 + ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'skip', 'rev', 'd2', 'wild', 'd4'].indexOf(C[id].v);
  const sortHand = () => hand.sort((a, b) => order(a.userData.id) - order(b.userData.id) || a.userData.id - b.userData.id);

  // ---------- cartas dos outros: em pé no feltro, numa fileira com uma curvinha leve, de costas para o centro ----------
  // de costas para o centro e meio virada para mim (de perfil a fileira sumia)
  const fanYaw = seat => { const o = seats[seat].out.clone().add(new T.Vector3(0, 0, W / H < 0.8 ? -1.6 : -0.9)); return Math.atan2(o.x, o.z); };
  // a fileira curva em volta de quem segura (as pontas vão um pouco para trás) e as cartas abrem de leve no alto
  function fanTarget(seat, i, n, open = false) {
    const yaw = fanYaw(seat) + (open ? Math.PI : 0), cw = CW * FS, ch = CH * FS, step = n > 1 ? Math.min(cw * (open ? 0.66 : ROW_STEP), cw * rowW * (open ? 1.7 : 1) / (n - 1)) : 0, R = ch * ROW_R; // aberta no fim, para ver cada carta
    const a = (i - (n - 1) / 2) * step / R, q = qy(yaw - a).multiply(qx(ROW_LEAN)).multiply(qz(-a * ROW_TILT));
    const foot = new T.Vector3(R * Math.sin(a), 0.015 * FS + cw / 2 * Math.abs(Math.sin(a * ROW_TILT)), R * (1 - Math.cos(a)) + (i - (n - 1) / 2) * (CD * FS + 0.02)).applyQuaternion(qy(yaw)).add(seats[seat].pos); // a da direita (para mim) fica na frente
    return { p: foot.addScaledVector(new T.Vector3(0, 1, 0).applyQuaternion(q), ch / 2), q, s: FS, b: 0.3 }; // o pé da carta fica no feltro
  }
  function layoutFan(seat, anim = true) {
    const f = fans[seat]; if (!f || !seats[seat]) return;
    f.forEach((m, i) => { if (m.userData.flying) return; const to = fanTarget(seat, i, f.length); anim ? fly(m, to, 300, { e: ease.out }) : place(m, to); });
  }

  // ---------- monte e descarte ----------
  function setDeck(n) {
    deckN = Math.max(0, n);
    // virado para baixo o bloco cresce para baixo: sobe ele a altura toda
    deckBody.scale.z = Math.max(0.0001, deckN * STEP); deckBody.visible = deckN > 1; deckBody.position.y = deckN * STEP + 0.0015;
    stripeTex.repeat.set(1, Math.max(1, Math.round(deckN / 3)));
  }
  const deckPose = () => ({ p: DECK.clone().setY(deckN * STEP + 0.003 + CD * TS / 2), q: faceDown(DECK_YAW), s: TS, b: 0 });
  const pileY = () => 0.004 + Math.max(0, pileN - pile.length) * STEP;
  function pilePose(k) { // k-ésima carta: um girinho e um deslocamento ao acaso, fixos por carta
    const r1 = (Math.sin(k * 12.9898) * 43758.5453) % 1, r2 = (Math.sin(k * 78.233) * 12543.123) % 1;
    return { p: PILE.clone().add(new T.Vector3(r1 * 0.2, pileY() + pile.length * (CD * TS + 0.003) + CD * TS / 2, r2 * 0.16)), q: faceUp(r1 * 0.6), s: TS, b: 0 };
  }
  function setPileBlock() { const n = Math.max(0, pileN - pile.length), h = n * STEP / pileBody.length; pileBody.forEach((m, i) => { m.scale.z = Math.max(0.0001, h); m.position.y = i * h; m.visible = n > 0; }); pileBody[0].material[2].map.repeat.set(1, Math.max(1, Math.round(n / 3))); }
  function trimPile() {
    while (pile.length > PILE_SHOW) drop(pile.shift()); setPileBlock();
    for (const m of pile) { const f = m.material[1]; f.emissiveIntensity = 0; f.color.setScalar(0.8); f.envMapIntensity = 0.45; m.userData.glowT = m.userData.glow = 0; m.userData.rim.visible = false; } // a carta vinda da mão chegava com a luz própria da mão e estourava sob o holofote
  }
  // tira a carta de cima do monte: ela escorrega um pouco para fora antes de voar
  async function peel(m, toward) {
    const top = deckPose(); place(m, top); setDeck(deckN - 1);
    const d = toward ? toward.clone().sub(DECK).setY(0).normalize().multiplyScalar(0.34) : new T.Vector3(0.28, 0, 0.22);
    await fly(m, { p: top.p.clone().add(d).setY(top.p.y + 0.05), q: qy(-0.25).multiply(top.q), s: TS * 1.02, b: 0 }, 120, { e: ease.out });
  }

  // ---------- anéis e efeitos ----------
  const COLOR_HEX = { r: 0xff6450, y: 0xffcc33, g: 0x3ad06a, b: 0x4a93ff };
  const colorFrom = new T.Color(), colorTo = new T.Color(); let colorK = 1, dirFlip = 0, turnSeat = -1;
  function setColor(c, instant) {
    colorFrom.copy(colorRing.material.color); colorTo.set(COLOR_HEX[c] || 0xffffff); colorK = instant ? 1 : 0;
    if (instant) { colorRing.material.color.copy(colorTo); colorGlow.material.color.copy(colorTo); }
  }
  function setDir(d, anim) { if (d !== dir && anim) dirFlip = 1; dir = d; dirRing.scale.x = d; }
  function shock(c, big) {
    const m = new T.Mesh(ringGeo(0.9, 1.05, 96, 1), new T.MeshBasicMaterial({ color: COLOR_HEX[c] || 0xffffff, transparent: true, opacity: 0.85, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide, toneMapped: false }));
    m.position.copy(PILE).setY(0.02); scene.add(m);
    const s1 = big ? 4.6 : 2.8;
    return tween(big ? 900 : 650, k => { m.scale.setScalar(1 + (s1 - 1) * k); m.material.opacity = 0.85 * (1 - k); }, ease.out).then(() => { scene.remove(m); m.geometry.dispose(); m.material.dispose(); });
  }
  const turnCol = new T.Color(0xffe28a);
  const setTurn = (i, c) => { turnSeat = i; if (c) turnCol.set(c).lerp(new T.Color(0xffffff), 0.35); }; // um pouco mais claro: aditivo sobre o feltro escuro sumia

  // ---------- quadro a quadro ----------
  const camUp = new T.Vector3(), camBack = new T.Vector3(), cardUp = new T.Vector3(), piv = new T.Vector3(), _q = new T.Quaternion();
  let last = now(), pulse = 0;
  function loop() {
    requestAnimationFrame(loop);
    const t = now(), dt = Math.min(0.05, (t - last) / 1000); last = t; pulse += dt;
    for (const tw of [...tweens]) {
      if (t < tw.t0) continue;
      const k = Math.min(1, (t - tw.t0) / tw.dur); tw.fn(tw.e(k));
      if (k >= 1) { tweens.delete(tw); tw.res(); }
    }
    dragFollow(dt);
    camUp.set(0, 1, 0).applyQuaternion(camera.quaternion); camBack.set(0, 0, 1).applyQuaternion(camera.quaternion);
    const { ch } = handMetrics(), hs = handState, hi = hovered && !touch && !drag ? hand.indexOf(hovered) : -1;
    if (hand.length) camera.localToWorld(piv.copy(handArc(hand.length).pivot));
    // mão: a carta sob o mouse sobe devagar e as vizinhas abrem espaço; as jogáveis acendem de leve
    hand.forEach((m, i) => {
      const u = m.userData, id = u.id, can = hs.myTurn && hs.playable.has(id) && (hs.drawn == null || hs.drawn === id);
      if (u.flying || m === drag?.m) { u.liftT = 0; u.fanT = 0; u.dimT = 1; u.glowT = 0; return; }
      u.liftT = hs.sending === id ? 1.3 : i === hi ? (can ? 1 : 0.55) : can ? 0.5 : hs.drawn === id ? 0.45 : 0;
      u.fanT = hi < 0 || i === hi ? 0 : Math.sign(i - hi) * 0.05 / Math.abs(i - hi) ** 0.8;
      u.dimT = hs.myTurn && !can && hs.sending !== id ? 0.6 : 1;
      u.glowT = can ? 0.8 + Math.sin(pulse * 2.2) * 0.15 : 0;
    });
    // leques dos outros: respiram de leve e quem está na vez levanta as cartas
    // vez dos outros: a fileira de quem joga sobe e ganha um contorno brilhante na cor da pessoa
    fans.forEach((f, si) => { const on = si === turnSeat, up = (on ? 0.32 : 0) * FS; f.forEach(m => { const u = m.userData; u.oyT = u.flying ? 0 : up; u.glowT = on && !u.flying ? 1.1 + Math.sin(pulse * 2.4) * 0.2 : 0; u.rim.material.color.copy(turnCol); }); });
    const kl = 1 - Math.exp(-dt * 9), kd = 1 - Math.exp(-dt * 8), kg = 1 - Math.exp(-dt * 5), ko = 1 - Math.exp(-dt * 4);
    for (const o of scene.children) {
      const u = o.userData; if (!u || !u.bp) continue;
      u.lift += (u.liftT - u.lift) * kl; u.fan += (u.fanT - u.fan) * kl; u.oy += (u.oyT - u.oy) * ko;
      u.dim += (u.dimT - u.dim) * kd; u.glow += (u.glowT - u.glow) * kg;
      o.position.copy(u.bp); o.quaternion.copy(u.bq);
      if (Math.abs(u.fan) > 1e-4) { _q.setFromAxisAngle(camBack, -u.fan); o.position.sub(piv).applyQuaternion(_q).add(piv); o.quaternion.premultiply(_q); } // gira em volta do polegar
      if (u.lift > 0.001) { cardUp.set(0, 1, 0).applyQuaternion(o.quaternion); o.position.addScaledVector(cardUp, u.lift * ch * 0.16); } // só sobe: vir para frente fazia ela atravessar a vizinha
      if (u.oy) o.position.y += u.oy;
      o.scale.setScalar(u.bs * (1 + u.lift * 0.035));
      o.morphTargetInfluences[0] = u.bend;
      // perto da câmera (mão, arrastando, comprando) a face tem luz própria; as que não servem apagam de verdade
      const fm = o.material[1], off = clamp01((1 - u.dim) / 0.4); // 0 = acesa, 1 = apagada
      fm.color.setScalar(u.dim); fm.emissiveIntensity = clamp01((25 - o.position.distanceTo(camera.position)) / 15) * (0.6 - off * 0.32);
      fm.envMapIntensity = 0.45 * (1 - off * 0.75); // o reflexo do verniz apaga junto (senão a apagada ficava desbotada, rosada)
      u.rim.material.opacity = u.glow; u.rim.visible = u.glow > 0.004;
    }
    if (colorK < 1) { colorK = Math.min(1, colorK + dt * 3.5); colorRing.material.color.copy(colorFrom).lerp(colorTo, colorK); colorGlow.material.color.copy(colorRing.material.color); }
    colorGlow.material.opacity = 0.13 + Math.sin(pulse * 2.2) * 0.04;
    if (dirFlip > 0) dirFlip = Math.max(0, dirFlip - dt * 1.4);
    dirRing.rotation.y -= dir * dt * (0.25 + dirFlip * dirFlip * 9);
    dirRing.material.opacity = 0.26 + dirFlip * 0.5;
    if (turnSeat >= 0 && seats[turnSeat] && turnSeat !== me) {
      const target = seats[turnSeat].pos;
      turnGlow.position.x += (target.x - turnGlow.position.x) * Math.min(1, dt * 7); turnGlow.position.z += (target.z - turnGlow.position.z) * Math.min(1, dt * 7);
      turnGlow.material.opacity += (0.22 - turnGlow.material.opacity) * Math.min(1, dt * 5);
    } else turnGlow.material.opacity *= 0.9;
    renderer.render(scene, camera);
  }

  // ---------- o que a tela de jogo chama ----------
  async function init(canvas) {
    renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    renderer.outputEncoding = T.sRGBEncoding; renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.92;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
    setFelt(feltKind);
    // resolução das faces: a altura que a carta da mão ocupa em pixels de verdade, com folga
    Art.setScale(Math.min(innerWidth, innerHeight * 1.4) * Math.min(devicePixelRatio || 1, 2) * 0.27 / 800 * 1.2);
    build();
    for (const id of C.keys()) faceOf(id); // desenha todas as faces enquanto a tela de carregar está aberta
    resize(); addEventListener('resize', resize);
    if (window.ResizeObserver) new ResizeObserver(resize).observe(canvas);
    ok = true; requestAnimationFrame(loop);
  }
  function clear() { [...hand, ...pile, ...fans.flat()].forEach(drop); hand.length = 0; pile.length = 0; fans.forEach(f => (f.length = 0)); if (deckLoose) { drop(deckLoose); deckLoose = null; } drag = null; }
  function setSeats(n, mine) { nSeats = n; me = mine; layoutSeats(); }

  // estado completo, sem animação (entrada, reconexão ou atraso grande)
  function snap(st, mine) {
    clear(); setSeats(st.players.length, mine);
    st.players.forEach((p, i) => {
      if (i === mine) { p.hand.forEach(id => hand.push(newCard(id, false))); return; }
      for (let k = 0; k < Math.min(FAN_MAX, p.count); k++) fans[i].push(newCard(-1));
      layoutFan(i, false);
    });
    sortHand(); layoutHand(false);
    pileN = st.pile.length;
    st.pile.slice(-PILE_SHOW).forEach((id, k, a) => { const m = newCard(id); place(m, pilePose(pileN - a.length + k + 1)); pile.push(m); });
    setPileBlock(); setDeck(st.deckN); setColor(st.color, true); setDir(st.dir, false); setTurn(st.phase === 'over' ? -1 : st.turn);
  }

  // embaralhar: o monte se abre em duas metades que curvam e se intercalam, e o bloco se acerta de novo
  async function riffle() {
    const n = 16, base = deckPose(), cards = [], gap = Math.max(CD * TS + 0.004, deckN * STEP / n);
    deckBody.visible = false;
    for (let k = 0; k < n; k++) { const m = newCard(-1); place(m, { p: base.p.clone().setY(0.004 + k * gap), q: base.q, s: TS, b: 0 }); cards.push(m); }
    await Promise.all(cards.map((m, k) => {
      const side = k < n / 2 ? -1 : 1, h = k % (n / 2);
      return fly(m, { p: base.p.clone().add(new T.Vector3(side * 0.9, 0, side * 0.08)).setY(0.004 + h * gap), q: qy(side * 0.18).multiply(base.q), s: TS, b: 0.5 }, 240, { arc: 0.15, e: ease.out, delay: h * 8 });
    }));
    // as duas metades soltam carta por carta, alternando, e caem intercaladas no meio
    Sound.play('shuffle');
    const order = []; for (let h = 0; h < n / 2; h++) order.push(cards[h], cards[h + n / 2]);
    await Promise.all(order.map((m, k) => fly(m, { p: base.p.clone().setY(0.006 + k * gap), q: qy((Math.random() - 0.5) * 0.08).multiply(base.q), s: TS, b: 1 }, 200, { arc: 0.18, e: ease.io, delay: 40 + k * 26 })));
    Sound.play('select');
    await Promise.all(order.map((m, k) => fly(m, { p: base.p.clone().setY(0.004 + k * gap), q: base.q, s: TS, b: 0 }, 140, { e: ease.out }))); // acerta o maço na altura do bloco, que entra no lugar
    cards.forEach(drop); setDeck(deckN);
  }
  // vira a carta da mão (de costas para de frente) no eixo comprido, com um pulinho
  function flipUp(m, to, dur, delay) { const u = m.userData; u.down = false; u.flying = true; return fly(m, to, dur, { e: ease.io, delay, arc: 0.035 }).then(() => { u.flying = false; }); }

  // distribuição: uma carta por vez em volta da roda (girando no ar); as minhas chegam de costas e viram todas numa onda
  async function deal(st, mine, first) {
    clear(); setSeats(st.players.length, mine); pileN = 0; setPileBlock(); setColor(st.color, true); setDir(1, false); setTurn(-1);
    const n = st.players.length, total = n * 7; setDeck(st.deckN + total + 1);
    await wait(200); await riffle(); await wait(80);
    const gap = Math.min(80, 2200 / total), flights = [];
    for (let r = 0; r < 7; r++) for (let k = 0; k < n; k++) {
      const i = (first + 1 + k) % n, m = newCard(i === mine ? st.players[mine].hand[r] : -1, i !== mine), u = m.userData;
      place(m, deckPose()); setDeck(deckN - 1); u.flying = true;
      Sound.play('deal', panOf(i));
      if (i === mine) {
        u.down = true; hand.push(m); layoutHand(true, m);
        const to = handTarget(hand.length - 1, hand.length); to.q.multiply(qy(Math.PI));
        flights.push(flyView(m, to, 460, { arc: 0.12, e: ease.out, spin: 1.2 }).then(() => { u.flying = false; layoutHand(); }));
      } else {
        fans[i].push(m); layoutFan(i);
        const to = fanTarget(i, fans[i].length - 1, fans[i].length);
        flights.push(fly(m, to, 440, { arc: 0.6, e: ease.out, spin: 3 }).then(() => { u.flying = false; layoutFan(i); }));
      }
      await wait(gap);
    }
    await Promise.all(flights);
    await wait(90); Sound.play('fan');
    await Promise.all(hand.map((m, k) => flipUp(m, handTarget(k, hand.length), 280, k * 55)));
    sortHand(); layoutHand(); await wait(360);
    const top = newCard(st.pile[0]); await peel(top, PILE); pileN = 1;
    await land(top, pilePose(1), 520, { arc: 1.1, spin: 2.6, touch: () => Sound.play('place', 0.6) }); pile.push(top);
    shock(st.color, false);
  }

  const panOf = p => (p === me ? 0 : Math.max(-0.8, Math.min(0.8, ((seats[p]?.screen.x ?? W / 2) / W - 0.5) * 1.6)));
  async function play(p, id, color, left) {
    let m;
    if (p === me) {
      m = hand.find(x => x.userData.id === id) || newCard(id);
      const i = hand.indexOf(m); if (i >= 0) hand.splice(i, 1);
      if (drag?.m === m) drag = null;
      const u = m.userData; stop(m); // a sombra só liga quando encosta (lá do alto ela aparecia de repente perto do descarte)
      u.bp.copy(m.position); u.bq.copy(m.quaternion); u.bs = m.scale.x; // sai de onde está na tela (levantada, aberta ou arrastada)
      u.liftT = u.lift = 0; u.fanT = u.fan = 0; u.dimT = u.dim = 1; u.glowT = u.glow = 0;
      layoutHand(true, m);
    } else {
      // leque cheio: sai uma carta nova do lugar da última e o leque continua igual
      const f = fans[p];
      if (left >= FAN_MAX && f.length) { m = newCard(-1); place(m, fanTarget(p, f.length - 1, f.length)); m.userData.oy = f[f.length - 1].userData.oy; } else m = f.length ? f.pop() : newCard(-1);
      setFace(m, id); layoutFan(p);
      const u = m.userData; u.bp.y += u.oy; u.oy = u.oyT = 0; u.flying = true; // sai do leque na altura em que ele estava
      // puxa a carta para cima, para fora do leque, antes de jogar
      await fly(m, { p: u.bp.clone().add(new T.Vector3(0, 0.42 * FS, 0)).addScaledVector(seats[p].out, -0.25), q: u.bq.clone().multiply(qx(-0.3)), s: FS * 1.05, b: 0.3 }, 170, { e: ease.out });
    }
    const u = m.userData; u.flying = true; pileN++;
    const to = pilePose(pileN), special = C[id].c === 'w' || ['d2', 'skip', 'rev'].includes(C[id].v), heavy = C[id].v === 'd4' || C[id].v === 'd2';
    const thump = () => { m.castShadow = true; Sound.play(heavy ? 'slam' : 'place', C[id].v === 'd4' ? 1 : 0.6, panOf(p)); };
    if (p === me && u.bp.distanceTo(to.p) < 0.9) { await fly(m, to, 150, { e: ease.fall }); thump(); } // veio arrastada e já encaixada: só cai
    else if (p === me) { Sound.play('slide', 0); await landView(m, to, 480, { spin: 0.9 + Math.random() * 1.2, touch: thump }); }
    else { Sound.play('slide', panOf(p)); await land(m, to, 500, { arc: 1.2, spin: -(1.2 + Math.random() * 1.6), touch: thump }); }
    u.flying = false; pile.push(m); trimPile();
    if (special) shock(color || C[id].c, C[id].v === 'd4' || C[id].v === 'wild');
    setColor(color || C[id].c);
  }

  // comprar: cada carta escorrega do topo do monte e voa até a mão (virando no caminho) ou até o leque de quem comprou
  async function draw(p, cards) {
    const flights = [];
    for (let k = 0; k < cards.length; k++) {
      let m;
      if (p === me && k === 0 && deckLoose) { m = deckLoose; deckLoose = null; drag = null; setFace(m, cards[k]); m.castShadow = false; setDeck(deckN - 1); stop(m); }
      else { m = newCard(p === me ? cards[k] : -1, p !== me); m.userData.flying = true; Sound.play('draw', panOf(p)); await peel(m, p === me ? null : seats[p]?.pos); }
      const u = m.userData; u.flying = true;
      if (p === me) {
        hand.push(m); sortHand(); layoutHand(true, m);
        flights.push(flyView(m, handTarget(hand.indexOf(m), hand.length), 520, { arc: 0.1, e: ease.io, flip: true }).then(() => { u.flying = false; layoutHand(); }));
      } else {
        const f = fans[p];
        if (f.length >= FAN_MAX) flights.push(fly(m, fanTarget(p, f.length - 1, f.length), 420, { arc: 0.6, e: ease.out, spin: 2 }).then(() => drop(m)));
        else { f.push(m); const to = fanTarget(p, f.length - 1, f.length); layoutFan(p); flights.push(fly(m, to, 440, { arc: 0.6, e: ease.out, spin: 2 }).then(() => { u.flying = false; layoutFan(p); })); }
      }
      await wait(cards.length > 4 ? 80 : 120);
    }
    await Promise.all(flights);
  }

  // monte acabou: o descarte (menos a de cima) volta e é embaralhado
  async function reshuffle(count) {
    const keep = pile.pop(), going = pile.splice(0);
    Sound.play('slide', 0);
    await Promise.all(going.map((m, k) => fly(m, { p: deckPose().p, q: faceDown(DECK_YAW), s: TS, b: 0 }, 420, { arc: 0.5, delay: k * 18, e: ease.io }).then(() => drop(m))));
    pile.push(keep); pileN = 1; setPileBlock(); setDeck(count); place(keep, pilePose(1));
    await riffle();
  }

  // acerta o que sobrou de diferença depois dos eventos (sem refazer o que já está certo)
  function sync(st, mine) {
    if (mine !== me || st.players.length !== nSeats) return snap(st, mine);
    if (mine >= 0) {
      const want = st.players[mine].hand, have = hand.map(m => m.userData.id);
      hand.filter(m => !want.includes(m.userData.id)).forEach(m => { hand.splice(hand.indexOf(m), 1); if (drag?.m === m) drag = null; drop(m); });
      want.filter(id => !have.includes(id)).forEach(id => { const m = newCard(id, false); place(m, deckPose()); hand.push(m); });
      hand.forEach(m => { m.userData.down = false; });
      sortHand(); layoutHand();
    }
    st.players.forEach((p, i) => {
      if (i === mine) return;
      const f = fans[i], n = Math.min(FAN_MAX, p.count);
      while (f.length > n) drop(f.pop());
      while (f.length < n) { const m = newCard(-1); place(m, deckPose()); f.push(m); }
      if (st.phase !== 'over') layoutFan(i); // no fim os leques ficam desvirados
    });
    const topId = st.pile[st.pile.length - 1];
    if (pile[pile.length - 1]?.userData.id !== topId) { const m = newCard(topId); pileN = st.pile.length; place(m, pilePose(pileN)); pile.push(m); trimPile(); }
    pileN = st.pile.length; setPileBlock(); setDeck(st.deckN); setColor(st.color); setDir(st.dir, false); setTurn(st.phase === 'over' ? -1 : st.turn);
  }

  // fim: cada leque gira e mostra o que sobrou (a fileira inteira é montada virada, não carta por carta, senão a curva e a inclinação invertem e as cartas se cruzam)
  function reveal(st) {
    st.players.forEach((p, i) => {
      if (i === me || !fans[i]) return;
      const n = fans[i].length;
      fans[i].forEach((m, k) => { const id = p.hand[k]; if (id === undefined) return; setFace(m, id); fly(m, fanTarget(i, k, n, true), 560, { arc: 0.3, delay: k * 45 + i * 90, e: ease.io }); });
    });
  }

  // ---------- toque, mouse e arrastar ----------
  function hit(x, y, list) { aimRay(x, y); return ray.intersectObjects(list, false)[0]?.object || null; }
  const nearDeck = (x, y) => { const s = project(DECK); return Math.hypot(x - s.x, y - s.y) < Math.max(44, W * 0.05); };
  function pick(x, y) {
    const m = hit(x, y, hand.filter(c => !c.userData.flying)); if (m) return { card: m.userData.id };
    if (deckN > 0 && (hit(x, y, [deckBody]) || nearDeck(x, y))) return { deck: true };
    return null;
  }
  function hover(x, y, isTouch) {
    touch = isTouch; if (drag && !drag.held) return true;
    const m = isTouch ? null : hit(x, y, hand.filter(c => !c.userData.flying)), was = hovered; hovered = m;
    if (m && m !== was) Sound.play('hover');
    return !!m || (!isTouch && deckN > 0 && nearDeck(x, y));
  }
  // quanto o ponteiro já saiu da mão para cima do feltro (0 = na mão, 1 = sobre o feltro)
  const overTable = y => { const t = Math.max(0, Math.min(1, (handTopY() + 10 - y) / 120)); return t * t * (3 - 2 * t); };
  function dragStart(h) {
    if (drag?.held) return false;
    if (drag) dragCancel(); // um arrasto que nunca terminou (o navegador perdeu o soltar): a carta volta antes de pegar outra
    if (h.card !== undefined) {
      const m = hand.find(x => x.userData.id === h.card); if (!m) return false;
      const u = m.userData; stop(m); u.flying = true; u.bp.copy(m.position); u.bq.copy(m.quaternion); u.bs = m.scale.x; u.lift = u.liftT = 0; u.fan = u.fanT = 0;
      drag = { m, kind: 'hand' }; Sound.play('select'); return true;
    }
    if (h.deck && deckN > 0 && !deckLoose) {
      const m = newCard(-1, true); place(m, deckPose()); m.userData.flying = true; deckLoose = m;
      drag = { m, kind: 'deck' }; Sound.play('draw', 0); return true;
    }
    return false;
  }
  function dragMove(x, y) {
    if (!drag || drag.held) return;
    const t = overTable(y), { ch } = handMetrics(), r = aimRay(x, y), mine = drag.kind === 'hand';
    const vx = drag.lx == null ? 0 : x - drag.lx; drag.lx = x; drag.sway = (drag.sway || 0) * 0.6 + Math.max(-1, Math.min(1, vx / 25)) * 0.4;
    drag.m.castShadow = t > 0.9; // só faz sombra perto do feltro (lá do alto ela surgia grande de repente)
    const tp = onPlane(x, y, Math.max(0.6, pileY() + pile.length * (CD * TS + 0.003) + 0.35)), dh = HAND_D * 0.95, dt0 = tp.distanceTo(r.origin), sh = ch / CH, st = TS * 1.04;
    // distância harmônica: o tamanho na tela vai da mão até a mesa sem a carta encolher até sumir (a câmera fica muito longe da mesa)
    const dist = 1 / ((1 - t) / dh + t / dt0), size = dist * (sh / dh + (st / dt0 - sh / dh) * t);
    // na mão ela olha para a câmera; sobre o feltro deita quase reta (de frente se é minha, de costas se veio do monte)
    const handQ = camera.quaternion.clone().multiply(qx(-0.1)); if (!mine) handQ.multiply(qy(Math.PI));
    const flatQ = (mine ? faceUp(0).multiply(qx(0.1)) : faceDown(0).multiply(qx(-0.1))).premultiply(qy(-drag.sway * 0.25));
    const q = new T.Quaternion(); q.slerpQuaternions(handQ, flatQ, t); q.multiply(qz(-drag.sway * 0.12 * (1 - t))); // no r128 o slerpQuaternions não devolve o quaternion
    const to = { p: r.origin.clone().addScaledVector(r.direction, dist), q, s: size, b: (mine ? 1 : 0.4) * (1 - t) };
    drag.to = to;
  }
  // a carta arrastada corre atrás do alvo com uma molinha, pela tela (posição, tamanho aparente e 1/d, como o flyView):
  // mesmo quando a profundidade muda muito (da mão, a 5 da câmera, até a mesa, a ~80) ela não dá pulo
  const _a = new T.Vector3(), _b = new T.Vector3();
  function dragFollow(dt) {
    if (!drag?.to) return;
    const u = drag.m.userData, to = drag.to, k = 1 - Math.exp(-dt * 45); // segue o cursor quase colada
    const v0 = _a.copy(u.bp).applyMatrix4(camera.matrixWorldInverse), v1 = _b.copy(to.p).applyMatrix4(camera.matrixWorldInverse);
    const d0 = Math.max(0.5, -v0.z), d1 = Math.max(0.5, -v1.z), d = 1 / (1 / d0 + (1 / d1 - 1 / d0) * k);
    const sx = v0.x / d0 + (v1.x / d1 - v0.x / d0) * k, sy = v0.y / d0 + (v1.y / d1 - v0.y / d0) * k, a = u.bs / d0 + (to.s / d1 - u.bs / d0) * k;
    u.bp.copy(_v.set(sx * d, sy * d, -d).applyMatrix4(camera.matrixWorld)); u.bs = a * d;
    u.bq.slerp(to.q, k); u.bend += ((to.b ?? u.bend) - u.bend) * k;
  }
  // soltou: diz onde caiu ('table' = sobre o feltro, 'hand' = na faixa da mão)
  const dragEnd = (x, y) => (drag && !drag.held ? (overTable(y) > 0.12 ? 'table' : 'hand') : null); // qualquer ponto acima da mão vale como mesa
  // a carta fica parada onde foi solta esperando a jogada voltar da sala
  function dragHold() { if (drag) drag.held = true; }
  // desistiu: a carta volta voando pela tela (de onde estiver, perto ou longe)
  function dragCancel(only) {
    if (only && drag && drag.kind !== only) return;
    if (only === 'hand' && !drag) return;
    const d = drag; drag = null;
    if (d?.kind === 'hand') {
      const m = d.m; if (!hand.includes(m)) return;
      m.castShadow = false; flyView(m, handTarget(hand.indexOf(m), hand.length), 320, { e: ease.out }).then(() => { m.userData.flying = false; layoutHand(); });
      return;
    }
    const m = deckLoose; deckLoose = null; if (!m) return;
    m.userData.flying = true; flyView(m, deckPose(), 300, { arc: 0.04, e: ease.io2 }).then(() => drop(m));
  }
  function nudge(id) {
    const m = hand.find(x => x.userData.id === id); if (!m || m.userData.flying) return;
    const q0 = m.userData.bq.clone();
    tween(320, k => { m.userData.bq.copy(q0).multiply(qz(Math.sin(k * Math.PI * 5) * 0.09 * (1 - k))); }, k => k).then(() => m.userData.bq.copy(q0));
  }

  // pinta o pano: degradê do meio para a borda (mais aberto e suave), o pano de fora e o fundo
  const feltMaps = {};
  function feltMap(amp) { if (!feltMaps[amp]) { const t = feltMaps[amp] = tex(Art.table(amp)); t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(FELT_S / 2.4, FELT_S / 2.4); } return feltMaps[amp]; }
  function setFelt(kind) {
    feltKind = FELTS[kind] ? kind : 'preto'; const f = FELTS[feltKind]; if (!felt) return;
    felt.material.map = felt.material.emissiveMap = feltMap(f.amp || 1);
    const fp = felt.geometry.attributes.position, col = felt.geometry.attributes.color, cc = new T.Color();
    const midC = new T.Color(f.mid).convertSRGBToLinear(), edgeC = new T.Color(f.edge).convertSRGBToLinear();
    for (let i = 0; i < fp.count; i++) { const k = clamp01((Math.hypot(fp.getX(i) / 1.35, fp.getY(i)) - 2.5) / 15); const t = Math.pow(k, 1.3); cc.copy(midC).lerp(edgeC, t * t * (3 - 2 * t)); col.setXYZ(i, cc.r, cc.g, cc.b); }
    col.needsUpdate = true;
    const ec = edgeC.clone().multiplyScalar(0.84); outer.material.color.copy(ec); outer.material.emissive.copy(ec).multiplyScalar(0.34);
    scene.background.set(f.bg); scene.fog.color.set(f.bg); renderer.setClearColor(f.bg); renderer.render(scene, camera);
  }

  return {
    get ok() { return ok; }, set speed(v) { speed = v; }, get speed() { return speed; }, get dragging() { return !!drag && !drag.held; },
    FELTS, setFelt, init, setSeats, snap, sync, deal, reveal, play, draw, reshuffle, shock, setColor, setDir, setTurn, setHandState: s => { handState = s; },
    pick, hover, nudge, dragStart, dragMove, dragEnd, dragHold, dragCancel,
    seatPoint: i => seats[i]?.badge || null, fanPoint: i => seats[i]?.badge || null,
    handTop: () => handTopY(), pilePoint: () => project(PILE.clone().setY(0.4)), deckPoint: () => project(DECK), wait,
  };
})();
