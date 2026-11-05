// ===== Supremacia: mesa de guerra em 3D (Three.js r128) =====
// Mapa em relevo (cada território é uma peça extrudada), exércitos como soldadinhos de plástico (soldado = 1, tanque = 5),
// dados 3D numa bandeja no meio da tela (vermelhos no ataque, amarelos na defesa), setas de ataque, explosões, bandeiras de conquista,
// água animada (reflexos e ondas na costa), navios e sombras de nuvens.
const War3D = (() => {
  let T, renderer, scene, camera, raycaster, wrap, canvas, raf = 0, mounted = false, active = false, lastT = 0, clock = 0;
  let handlers = {}, view = null, ui = {};
  const S = .1; // unidades do mapa → mundo
  let MW, MH;
  const terr = {};          // id → { mesh, mat, side, pieces: Group, label: Sprite, shown: {owner, armies}, c: Vector3, r }
  const tweens = [], fx = [];
  let lock = new Set();     // territórios em animação (o estado novo espera a animação terminar)
  let queue = [], busy = false, diceGroup, arrowObj = null;
  const cam = { x: 0, z: .6, dist: 26, tx: 0, tz: .6, tdist: 26, yaw: 0, shake: 0 };
  let flashLight, shimmer, dust, sideMats = {}, contOwner = {};
  const COLOR = {}; // id da cor → hex
  const CONT_COLOR = { na: 0xd59a3a, sa: 0x6aa84f, eu: 0x4f7fc4, af: 0xc9663a, as: 0x8f9a3c, oc: 0x9a62b8 };

  const ease = t => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const easeOut = t => 1 - Math.pow(1 - t, 3);
  const tween = (dur, fn, done, delay = 0) => tweens.push({ t0: clock + delay, dur, fn, done });
  const wait = ms => new Promise(r => tween(ms / 1000, () => {}, r));
  const W2 = (x, y) => new T.Vector3((x - MW / 2) * S, 0, (y - MH / 2) * S);

  function canvasTex(w, h, draw) {
    const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
    const t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; t.anisotropy = 4; return t;
  }

  // ---------- montagem ----------
  function supported() { if (!window.THREE) return false; try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; } }
  function mount(el, h) {
    handlers = h || {};
    if (mounted) { if (canvas.parentElement !== el) el.prepend(canvas); wrap = el; resize(); return true; }
    if (!supported()) return false;
    T = THREE; wrap = el; MW = WAR_MAP.w; MH = WAR_MAP.h;
    for (const c of War.COLORS) COLOR[c.id] = new T.Color(c.hex);
    renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.outputEncoding = T.sRGBEncoding; renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
    canvas = renderer.domElement; canvas.className = 'war3d'; el.prepend(canvas);
    scene = new T.Scene(); scene.background = new T.Color(0x0b0d10); scene.fog = new T.Fog(0x0b0d10, 40, 80);
    camera = new T.PerspectiveCamera(38, 1, .1, 200); raycaster = new T.Raycaster();
    // luz: lâmpada quente sobre a mesa + preenchimento frio
    scene.add(new T.HemisphereLight(0x9fb3c8, 0x1a120a, .55));
    const key = new T.DirectionalLight(0xffe2b8, 1.25); key.position.set(-8, 22, 10); key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048); Object.assign(key.shadow.camera, { left: -22, right: 22, top: 14, bottom: -14, near: 1, far: 60 }); key.shadow.bias = -.0005;
    scene.add(key);
    const rim = new T.DirectionalLight(0x7fa6ff, .35); rim.position.set(10, 8, -14); scene.add(rim);
    // luz das explosões: uma só, reaproveitada (criar luzes durante o jogo recompila os shaders)
    flashLight = new T.PointLight(0xffa040, 0, 9, 2); flashLight.position.set(0, 1.5, 0); scene.add(flashLight);
    buildTable(); buildMap(); buildRoutes(); buildContLabels();
    buildTray();
    bindInput(); new ResizeObserver(resize).observe(el); resize();
    mounted = true; return true;
  }

  function buildTable() {
    const wood = IMG.cj_wood ? new T.TextureLoader().load(IMG.cj_wood) : null;
    if (wood) { wood.encoding = T.sRGBEncoding; wood.wrapS = wood.wrapT = T.RepeatWrapping; wood.repeat.set(3, 2); }
    const mw = MW * S, mh = MH * S;
    // tampo de madeira com borda chanfrada
    const tw = mw + 10, th = mh + 10, sh = new T.Shape(), r = 1.2;
    sh.moveTo(-tw / 2 + r, -th / 2); sh.lineTo(tw / 2 - r, -th / 2); sh.quadraticCurveTo(tw / 2, -th / 2, tw / 2, -th / 2 + r); sh.lineTo(tw / 2, th / 2 - r); sh.quadraticCurveTo(tw / 2, th / 2, tw / 2 - r, th / 2);
    sh.lineTo(-tw / 2 + r, th / 2); sh.quadraticCurveTo(-tw / 2, th / 2, -tw / 2, th / 2 - r); sh.lineTo(-tw / 2, -th / 2 + r); sh.quadraticCurveTo(-tw / 2, -th / 2, -tw / 2 + r, -th / 2);
    const tg = new T.ExtrudeGeometry(sh, { depth: .9, bevelEnabled: true, bevelThickness: .12, bevelSize: .12, bevelSegments: 3 }); tg.rotateX(-Math.PI / 2);
    const woodMat = new T.MeshStandardMaterial({ color: 0x6a4428, map: wood, roughness: .55, metalness: .02 });
    const table = new T.Mesh(tg, woodMat); table.position.y = -1.32; table.receiveShadow = true; scene.add(table);
    // couro verde entre a moldura e a madeira
    const leatherTex = canvasTex(512, 512, (c, w, h) => { c.fillStyle = '#1f3a2c'; c.fillRect(0, 0, w, h); for (let i = 0; i < 9000; i++) { const v = Math.random() < .5 ? 0 : 255; c.fillStyle = `rgba(${v},${v},${v},${Math.random() * .05})`; c.fillRect(Math.random() * w, Math.random() * h, 2, 2); } c.strokeStyle = 'rgba(214,180,110,.55)'; c.setLineDash([6, 5]); c.lineWidth = 3; c.strokeRect(18, 18, w - 36, h - 36); });
    const leather = new T.Mesh(new T.BoxGeometry(mw + 5.4, .1, mh + 5.4), new T.MeshStandardMaterial({ map: leatherTex, roughness: .8 }));
    leather.position.y = -.26; leather.receiveShadow = true; scene.add(leather);
    // moldura de latão com cantoneiras e rebites
    const brass = new T.MeshStandardMaterial({ color: 0xb8904c, metalness: .9, roughness: .28 });
    const fw = mw + 1.2, fh = mh + 1.2;
    for (const [w, d, x, z] of [[fw, .35, 0, -fh / 2], [fw, .35, 0, fh / 2], [.35, fh + .35, -fw / 2, 0], [.35, fh + .35, fw / 2, 0]]) {
      const b = new T.Mesh(new T.BoxGeometry(w, .24, d), brass); b.position.set(x, -.06, z); b.castShadow = b.receiveShadow = true; scene.add(b);
    }
    const rivet = new T.SphereGeometry(.05, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const cap = new T.Mesh(new T.CylinderGeometry(.42, .46, .3, 24), brass); cap.position.set(sx * fw / 2, -.02, sz * fh / 2); cap.castShadow = true; scene.add(cap);
      const star = new T.Mesh(new T.CylinderGeometry(.2, .2, .32, 5), new T.MeshStandardMaterial({ color: 0x7a1d17, metalness: .4, roughness: .4 })); star.position.copy(cap.position); scene.add(star);
    }
    for (let x = -fw / 2 + 1; x < fw / 2 - .5; x += 1.6) for (const z of [-fh / 2, fh / 2]) { const rv = new T.Mesh(rivet, brass); rv.position.set(x, .06, z); scene.add(rv); }
    for (let z = -fh / 2 + 1; z < fh / 2 - .5; z += 1.6) for (const x of [-fw / 2, fw / 2]) { const rv = new T.Mesh(rivet, brass); rv.position.set(x, .06, z); scene.add(rv); }
    // placa gravada na frente
    const plateTex = canvasTex(1024, 160, (c, w, h) => {
      const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#e2c27e'); g.addColorStop(.5, '#b38a45'); g.addColorStop(1, '#8a6730'); c.fillStyle = g; c.fillRect(0, 0, w, h);
      c.strokeStyle = 'rgba(60,40,10,.6)'; c.lineWidth = 6; c.strokeRect(10, 10, w - 20, h - 20);
      c.font = '700 92px Georgia, serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.letterSpacing = '18px';
      c.fillStyle = 'rgba(255,240,200,.5)'; c.fillText('SUPREMACIA', w / 2 + 2, h / 2 + 4); c.fillStyle = '#3a2810'; c.fillText('SUPREMACIA', w / 2, h / 2 + 2);
      c.fillStyle = '#3a2810'; for (const x of [40, w - 40]) { c.beginPath(); c.arc(x, h / 2, 9, 0, Math.PI * 2); c.fill(); }
    });
    const plate = new T.Mesh(new T.BoxGeometry(6.4, .08, 1), [brass, brass, new T.MeshStandardMaterial({ map: plateTex, metalness: .75, roughness: .32 }), brass, brass, brass]);
    plate.position.set(0, -.18, fh / 2 + 2.05); plate.rotation.x = -.08; plate.castShadow = true; scene.add(plate);
    // oceano: carta náutica antiga (águas rasas brilhando na costa, linhas de contorno, grade e rosa dos ventos)
    const CW = 4096, CH = Math.round(CW * MH / MW), k = CW / MW;
    const coast = (c, fn) => { c.beginPath(); for (const t of WAR_MAP.territories) for (const poly of t.polys) { poly.forEach(([x, y], i) => (i ? c.lineTo(x * k, y * k) : c.moveTo(x * k, y * k))); c.closePath(); } fn(); };
    const ocean = canvasTex(CW, CH, (c, w, h) => {
      const g = c.createRadialGradient(w / 2, h / 2, h * .2, w / 2, h / 2, w * .62); g.addColorStop(0, '#1d5168'); g.addColorStop(1, '#0d2534'); c.fillStyle = g; c.fillRect(0, 0, w, h);
      for (let i = 0; i < 26000; i++) { c.fillStyle = `rgba(255,255,255,${Math.random() * .025})`; c.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
      // águas rasas: brilho turquesa junto à costa
      c.save(); c.shadowColor = 'rgba(80,190,200,.55)'; c.shadowBlur = 60; c.fillStyle = 'rgba(70,160,175,.35)'; coast(c, () => c.fill()); c.restore();
      c.save(); c.shadowColor = 'rgba(120,220,215,.5)'; c.shadowBlur = 18; c.fillStyle = 'rgba(110,200,200,.4)'; coast(c, () => c.fill()); c.restore();
      // linhas d'água ao redor da costa (como nas cartas antigas)
      for (const [lw, a] of [[44, .05], [30, .07], [18, .1], [8, .16]]) { c.lineWidth = lw; c.strokeStyle = `rgba(190,225,230,${a})`; c.lineJoin = 'round'; coast(c, () => c.stroke()); c.lineWidth = lw - 3; c.strokeStyle = 'rgba(14,40,54,1)'; coast(c, () => c.stroke()); }
      // grade
      c.strokeStyle = 'rgba(170,210,230,.09)'; c.lineWidth = 2;
      for (let lon = -150; lon <= 180; lon += 30) { const x = (lon + 170) * k; c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); }
      for (let y = 0; y <= h; y += h / 8) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
      // rosa dos ventos (Atlântico Sul) e cartela
      const cx = w * .4, cy = h * .82, R = 150; c.strokeStyle = 'rgba(226,196,130,.45)'; c.fillStyle = 'rgba(226,196,130,.42)'; c.lineWidth = 3;
      for (const rr of [R, R * .62, R * .3]) { c.beginPath(); c.arc(cx, cy, rr, 0, Math.PI * 2); c.stroke(); }
      for (let q = 0; q < 16; q++) { const a = q * Math.PI / 8 - Math.PI / 2, L = q % 4 === 0 ? R * 1.25 : q % 2 ? R * .55 : R * .85, wd = q % 4 === 0 ? 22 : 12; c.beginPath(); c.moveTo(cx + Math.cos(a + 1.57) * wd, cy + Math.sin(a + 1.57) * wd); c.lineTo(cx + Math.cos(a) * L, cy + Math.sin(a) * L); c.lineTo(cx + Math.cos(a - 1.57) * wd, cy + Math.sin(a - 1.57) * wd); c.fill(); }
      c.font = '700 56px Georgia, serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; [['N', 0, -1], ['S', 0, 1], ['L', 1, 0], ['O', -1, 0]].forEach(([t, dx, dy]) => c.fillText(t, cx + dx * R * 1.48, cy + dy * R * 1.48));
    });
    ocean.anisotropy = 8;
    const sea = new T.Mesh(new T.PlaneGeometry(mw + 1, mh + 1), new T.MeshStandardMaterial({ map: ocean, roughness: .28, metalness: .15 }));
    sea.rotation.x = -Math.PI / 2; sea.position.y = -.1; sea.receiveShadow = true; scene.add(sea);
    // água viva (shader somado por cima da carta): reflexos que ondulam e ondas que rolam até a costa
    const coastTex = canvasTex(1024, Math.round(1024 * MH / MW), (c, w, h) => {
      const kk = w / MW; c.fillStyle = '#000'; c.fillRect(0, 0, w, h);
      const land = () => { c.beginPath(); for (const t of WAR_MAP.territories) for (const poly of t.polys) { poly.forEach(([x, y], i) => (i ? c.lineTo(x * kk, y * kk) : c.moveTo(x * kk, y * kk))); c.closePath(); } };
      for (const [blur, a] of [[34, .5], [16, .6], [6, .8]]) { c.save(); c.shadowColor = `rgba(255,255,255,${a})`; c.shadowBlur = blur; c.fillStyle = `rgba(255,255,255,${a * .5})`; land(); c.fill(); c.restore(); }
    });
    coastTex.encoding = T.LinearEncoding;
    shimmer = new T.Mesh(new T.PlaneGeometry(mw + 1, mh + 1), new T.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uCoast: { value: coastTex }, uSize: { value: new T.Vector2(mw + 1, mh + 1) } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform float uTime; uniform sampler2D uCoast; uniform vec2 uSize; varying vec2 vUv;
        void main(){
          vec2 p = vUv * uSize; float t = uTime;
          float w = sin(p.x * 1.7 + p.y * .9 + t * .9) + sin(-p.x * 1.1 + p.y * 2.1 + t * 1.3) + .6 * sin(p.x * 2.9 - p.y * 1.6 - t * .7) + .5 * sin(p.x * .6 + p.y * 3.7 + t * 1.1);
          float blot = .5 + .5 * sin(p.x * .35 + t * .15) * sin(p.y * .5 - t * .12);
          float glint = pow(clamp(w / 2.9, 0., 1.), 7.) * (.35 + blot) * .5;
          float c = texture2D(uCoast, vUv).r;
          float band = sin(c * 22. - t * 1.6);
          float foam = smoothstep(.72, 1., band) * smoothstep(.04, .35, c) * .32;
          gl_FragColor = vec4(vec3(.55, .82, 1.) * glint + vec3(.82, .94, 1.) * foam, 1.);
        }`,
      transparent: true, blending: T.AdditiveBlending, depthWrite: false,
    }));
    shimmer.rotation.x = -Math.PI / 2; shimmer.position.y = -.085; scene.add(shimmer);
    // sombras de nuvens passando devagar sobre o mapa
    const cloudTex = canvasTex(512, 256, (c, w, h) => {
      c.clearRect(0, 0, w, h);
      for (let i = 0; i < 22; i++) {
        const x = Math.random() * w, y = Math.random() * h, r = 18 + Math.random() * 46;
        for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) { const g = c.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r); g.addColorStop(0, 'rgba(0,0,0,.55)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(x + ox - r, y + oy - r, r * 2, r * 2); }
      }
    });
    cloudTex.wrapS = cloudTex.wrapT = T.RepeatWrapping; cloudTex.repeat.set(1.6, 1.2);
    clouds = new T.Mesh(new T.PlaneGeometry(mw + 1, mh + 1), new T.MeshBasicMaterial({ map: cloudTex, transparent: true, opacity: .32, depthWrite: false }));
    clouds.rotation.x = -Math.PI / 2; clouds.position.y = .34; clouds.renderOrder = 2; scene.add(clouds);
    buildShips();
    // cone de luz da lâmpada e poeira flutuando
    const n = 260, pos = new Float32Array(n * 3); for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - .5) * mw; pos[i * 3 + 1] = Math.random() * 7; pos[i * 3 + 2] = (Math.random() - .5) * mh; }
    const dg = new T.BufferGeometry(); dg.setAttribute('position', new T.BufferAttribute(pos, 3));
    dust = new T.Points(dg, new T.PointsMaterial({ color: 0xffe6c0, size: .05, transparent: true, opacity: .45, depthWrite: false, blending: T.AdditiveBlending })); scene.add(dust);
  }

  // navios a vela fazendo rotas em mar aberto (em coordenadas do mapa), com balanço e esteira
  const LANES = [
    [[122, 64], [140, 78], [148, 100], [140, 118], [128, 98], [116, 78]],    // Atlântico
    [[226, 108], [242, 116], [258, 132], [244, 150], [226, 146], [222, 124]], // Índico
    [[18, 92], [36, 104], [40, 124], [24, 140], [8, 118]],                   // Pacífico leste
    [[326, 96], [346, 104], [354, 122], [336, 112]],                         // Pacífico oeste
    [[150, 150], [172, 160], [196, 162], [176, 170], [154, 164]],            // Atlântico Sul
  ];
  let ships = [], clouds, wakeT = 0;
  function buildShips() {
    const hullShape = new T.Shape(); hullShape.moveTo(-.22, -.07); hullShape.lineTo(.12, -.07); hullShape.quadraticCurveTo(.26, 0, .12, .07); hullShape.lineTo(-.22, .07); hullShape.closePath();
    const hullGeo = new T.ExtrudeGeometry(hullShape, { depth: .07, bevelEnabled: true, bevelThickness: .015, bevelSize: .015, bevelSegments: 1 }).rotateX(Math.PI / 2).translate(0, .06, 0);
    const hullMat = new T.MeshStandardMaterial({ color: 0x6b4423, roughness: .6 }), sailMat = new T.MeshStandardMaterial({ color: 0xf1e7cc, roughness: .8, side: T.DoubleSide });
    const sailShape = new T.Shape(); sailShape.moveTo(0, 0); sailShape.lineTo(0, .32); sailShape.quadraticCurveTo(.1, .16, .17, .02); sailShape.closePath();
    const sailGeo = new T.ShapeGeometry(sailShape), mastGeo = new T.CylinderGeometry(.008, .008, .36, 6);
    LANES.forEach((lane, i) => {
      const curve = new T.CatmullRomCurve3(lane.map(([x, y]) => W2(x, y).setY(-.08)), true, 'centripetal');
      const boat = new T.Group();
      const hull = new T.Mesh(hullGeo, hullMat); hull.castShadow = true; boat.add(hull);
      const mast = new T.Mesh(mastGeo, hullMat); mast.position.set(-.02, .22, 0); boat.add(mast);
      const sail = new T.Mesh(sailGeo, sailMat); sail.position.set(-.01, .07, 0); sail.rotation.y = -.25; sail.castShadow = true; boat.add(sail);
      boat.scale.setScalar(1.6); scene.add(boat);
      ships.push({ boat, curve, sail, u: i * .21, speed: .012 + (i % 3) * .003 });
    });
  }
  function moveShips(dt) {
    wakeT += dt; const drop = wakeT > .14; if (drop) wakeT = 0;
    for (const [i, s] of ships.entries()) {
      s.u = (s.u + s.speed * dt) % 1;
      const p = s.curve.getPointAt(s.u), d = s.curve.getTangentAt(s.u);
      s.boat.position.set(p.x, -.09 + Math.sin(clock * 2.1 + i) * .012, p.z);
      s.boat.rotation.set(Math.sin(clock * 1.7 + i) * .05, Math.atan2(-d.z, d.x), Math.sin(clock * 1.3 + i * 2) * .04);
      s.sail.rotation.y = -.25 + Math.sin(clock * .9 + i) * .08;
      if (drop) { // esteira: espuma que fica para trás e se desfaz
        const w = new T.Sprite(new T.SpriteMaterial({ map: puffTexture(), color: 0xd8f0ff, transparent: true, opacity: .35, depthWrite: false }));
        w.position.set(p.x - d.x * .32, -.07, p.z - d.z * .32); w.scale.setScalar(.1); scene.add(w);
        tween(1.4, k => { w.scale.setScalar(.1 + k * .28); w.material.opacity = .35 * (1 - k); }, () => { scene.remove(w); w.material.dispose(); });
      }
    }
  }

  // textura de relevo para o topo dos territórios (ruído + curvas de nível)
  let terrainTex;
  function terrain() {
    if (terrainTex) return terrainTex;
    terrainTex = canvasTex(1024, 512, (c, w, h) => {
      c.fillStyle = '#d9d2bf'; c.fillRect(0, 0, w, h);
      for (let i = 0; i < 2600; i++) { const x = Math.random() * w, y = Math.random() * h, r = 4 + Math.random() * 26; const g = c.createRadialGradient(x, y, 0, x, y, r); const v = Math.random() < .5 ? 0 : 255; g.addColorStop(0, `rgba(${v},${v},${v},.045)`); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2); }
      // relevo suave: manchas claras e escuras em várias escalas + granulado
      for (const [n, r0, a] of [[300, 40, .05], [900, 14, .05], [2400, 5, .06]]) for (let i = 0; i < n; i++) { const x = Math.random() * w, y = Math.random() * h, r = r0 * (.5 + Math.random()); const g = c.createRadialGradient(x, y, 0, x, y, r); const v = Math.random() < .5 ? 40 : 255; g.addColorStop(0, `rgba(${v},${v},${v},${a})`); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2); }
      for (let i = 0; i < 30000; i++) { const v = Math.random() < .5 ? 0 : 255; c.fillStyle = `rgba(${v},${v},${v},.05)`; c.fillRect(Math.random() * w, Math.random() * h, 1, 1); }
    });
    terrainTex.wrapS = terrainTex.wrapT = T.RepeatWrapping; terrainTex.repeat.set(1 / (MW * S) * 2, 1 / (MH * S) * 2);
    return terrainTex;
  }

  function buildMap() {
    for (const t of WAR_MAP.territories) {
      const shapes = t.polys.map(poly => new T.Shape(poly.map(([x, y]) => new T.Vector2((x - MW / 2) * S, -(y - MH / 2) * S))));
      const geo = new T.ExtrudeGeometry(shapes, { depth: .3, bevelEnabled: true, bevelThickness: .06, bevelSize: .04, bevelSegments: 2, curveSegments: 1 });
      geo.rotateX(-Math.PI / 2); geo.translate(0, -.05, 0);
      const mat = new T.MeshStandardMaterial({ color: 0xcccccc, map: terrain(), roughness: .78, metalness: 0, emissive: 0x000000 });
      const side = sideMats[t.cont] || (sideMats[t.cont] = new T.MeshStandardMaterial({ color: new T.Color(CONT_COLOR[t.cont]).multiplyScalar(.55), roughness: .7, emissive: 0x000000 }));
      const mesh = new T.Mesh(geo, [mat, side]); mesh.castShadow = mesh.receiveShadow = true; mesh.userData.terr = t.id; scene.add(mesh);
      // contorno do território
      const edges = new T.LineSegments(new T.EdgesGeometry(geo, 40), new T.LineBasicMaterial({ color: 0x1a140c, transparent: true, opacity: .5 }));
      scene.add(edges);
      const pieces = new T.Group(); scene.add(pieces);
      const c = W2(t.c[0], t.c[1]); c.y = .31;
      const label = new T.Sprite(new T.SpriteMaterial({ transparent: true, depthWrite: false }));
      label.renderOrder = 10; scene.add(label);
      terr[t.id] = { mesh, mat, pieces, label, c, r: t.r * S, shown: { owner: null, armies: 0 }, cont: t.cont, name: t.name, lift: 0 };
    }
  }
  function buildRoutes() {
    // ligações por mar: tracejado de latão (Alasca–Vladivostok dá a volta pelas bordas do mapa)
    const mat = new T.LineDashedMaterial({ color: 0xe8d29a, dashSize: .22, gapSize: .16, transparent: true, opacity: .75 });
    const line = pts => { const g = new T.BufferGeometry().setFromPoints(pts); const l = new T.Line(g, mat); l.computeLineDistances(); scene.add(l); };
    for (const [a, b] of WAR_MAP.sea) {
      const A = terr[a].c.clone().setY(.08), B = terr[b].c.clone().setY(.08);
      if (Math.abs(A.x - B.x) > MW * S / 2) { // dá a volta no mundo
        const [L, R] = A.x < B.x ? [A, B] : [B, A], edgeL = -MW * S / 2 - .3, edgeR = MW * S / 2 + .3, zm = (L.z + R.z) / 2;
        line([L, new T.Vector3(edgeL, .08, zm)]); line([R, new T.Vector3(edgeR, .08, zm)]);
      } else {
        const mid = A.clone().lerp(B, .5); mid.y = .5;
        line(new T.QuadraticBezierCurve3(A, mid, B).getPoints(24));
      }
    }
  }
  function buildContLabels() {
    for (const [k, c] of Object.entries(WAR_MAP.continents)) {
      const [x, y] = c.label;
      const tex = canvasTex(512, 96, (g, w, h) => {
        g.font = '700 40px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillStyle = 'rgba(232,210,154,.85)'; g.fillText(c.name.toUpperCase(), w / 2, h / 2 - 8);
        g.font = '600 24px Georgia, serif'; g.fillStyle = 'rgba(232,210,154,.6)'; g.fillText(`bônus +${c.bonus}`, w / 2, h / 2 + 26);
      });
      const m = new T.Mesh(new T.PlaneGeometry(3.8, .72), new T.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
      m.rotation.x = -Math.PI / 2; const p = W2(x, y); m.position.set(p.x, -.07, p.z); m.scale.setScalar(1.25); scene.add(m);
    }
  }

  // ---------- peças: soldadinhos de plástico (1 exército) e tanques (5 exércitos) ----------
  // cada miniatura é uma malha só (partes fundidas), com sombreado por vértice sobre a cor do jogador
  const TANK = 5, MAX_TANKS = 4;
  let soldierGeo, tankGeo, pieceMats = {};
  function mergeParts(parts) {
    const pos = [], nor = [], col = [];
    for (const [g0, shade] of parts) {
      const g = g0.index ? g0.toNonIndexed() : g0, p = g.attributes.position, n = g.attributes.normal;
      for (let i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); nor.push(n.getX(i), n.getY(i), n.getZ(i)); col.push(shade, shade, shade); }
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3)); g.setAttribute('color', new T.Float32BufferAttribute(col, 3));
    return g;
  }
  function geos() {
    if (soldierGeo) return;
    const B = (w, h, d) => new T.BoxGeometry(w, h, d), C = (r1, r2, h, s = 14) => new T.CylinderGeometry(r1, r2, h, s);
    const leg = s => B(.045, .15, .055).translate(0, -.075, 0).rotateX(s * .3).translate(s * .032, .19, 0);
    // soldado em marcha, fuzil no ombro, capacete e mochila (de frente para +z)
    soldierGeo = mergeParts([
      [C(.105, .115, .03, 20).translate(0, .015, 0), .72],
      [leg(1), .9], [leg(-1), .9],
      [B(.12, .13, .075).translate(0, .25, 0), 1], [B(.126, .022, .082).translate(0, .195, 0), .62],
      [B(.09, .095, .045).translate(0, .26, -.06), .78],
      [B(.034, .12, .04).translate(0, -.06, 0).rotateX(-.35).translate(.078, .31, 0), .95],
      [B(.034, .12, .04).translate(0, -.06, 0).rotateX(.45).translate(-.078, .31, 0), .95],
      [new T.SphereGeometry(.042, 12, 10).translate(0, .35, 0), 1],
      [new T.SphereGeometry(.056, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, .355, 0), .82], [C(.072, .072, .008, 18).translate(0, .357, 0), .82],
      [B(.018, .28, .024).rotateX(-.25).translate(.095, .38, -.03), .45],
    ]);
    // tanque: casco, lagartas, torre, canhão e escotilha (canhão para +x)
    tankGeo = mergeParts([
      [B(.29, .075, .18).translate(0, .095, 0), 1], [B(.22, .03, .16).translate(-.02, .145, 0), .88],
      [B(.33, .075, .055).translate(0, .055, .105), .42], [B(.33, .075, .055).translate(0, .055, -.105), .42],
      ...[-.12, -.06, 0, .06, .12].flatMap(x => [[C(.03, .03, .06, 10).rotateX(Math.PI / 2).translate(x, .048, .118), .3], [C(.03, .03, .06, 10).rotateX(Math.PI / 2).translate(x, .048, -.118), .3]]),
      [C(.072, .085, .065, 18).translate(-.03, .19, 0), .95], [C(.03, .03, .022, 12).translate(-.055, .232, .02), .7],
      [C(.016, .016, .22, 10).rotateZ(Math.PI / 2).translate(.13, .195, 0), .75], [C(.024, .024, .035, 10).rotateZ(Math.PI / 2).translate(.245, .195, 0), .55],
    ]);
  }
  const gold = () => pieceMats.gold || (pieceMats.gold = new T.MeshStandardMaterial({ color: 0xd8b25a, metalness: .9, roughness: .25 }));
  function pieceMat(color) {
    if (!pieceMats[color]) {
      const c = COLOR[color] || new T.Color(0x888888);
      pieceMats[color] = new T.MeshStandardMaterial({ color: c, vertexColors: true, roughness: .42, metalness: .04, emissive: color === 'preto' ? 0x15151c : 0x000000 });
    }
    return pieceMats[color];
  }
  function makePiece(color, big) {
    geos();
    const g = new T.Group();
    const m = new T.Mesh(big ? tankGeo : soldierGeo, pieceMat(color)); m.castShadow = true; g.add(m); g.scale.setScalar(big ? 1.75 : 1.5);
    return g;
  }
  // arranjo num território: tanques no centro (em pares), soldados em volta
  function slots(n, big, r) {
    const out = [], R = Math.min(r * .62, .72), rows = Math.ceil(big / 2);
    for (let i = 0; i < big; i++) { const cols = Math.min(big - (i & ~1), 2), col = i % 2; out.push([(col - (cols - 1) / 2) * .5, (Math.floor(i / 2) - (rows - 1) / 2) * .46 - .05, true]); }
    for (let i = 0; i < n; i++) { const a = (i / Math.max(n, 5)) * Math.PI * 2 + .4, rr = big ? Math.max(R, .5 + rows * .12) : n > 1 ? .2 + n * .025 : 0; out.push([Math.cos(a) * rr, Math.sin(a) * rr * .72 + (big ? .1 : 0), false]); }
    return out;
  }
  function setPieces(id, owner, armies, spawn) {
    const t = terr[id], color = view?.players.find(p => p.id === owner)?.color || 'branco';
    const big = Math.min(MAX_TANKS, Math.floor(armies / TANK)), small = armies - Math.floor(armies / TANK) * TANK;
    const key = color + ':' + big + ':' + small;
    if (t.key === key) return; t.key = key;
    const old = t.pieces.children.slice(); old.forEach(o => t.pieces.remove(o));
    const sl = slots(small, big, t.r);
    sl.forEach(([dx, dz, isBig], i) => {
      // soldados de frente para quem joga (com uma folga); tanques na diagonal, mostrando o canhão
      const p = makePiece(color, isBig); p.position.set(t.c.x + dx, t.c.y, t.c.z + dz); p.rotation.y = isBig ? -.7 + (Math.random() - .5) * .3 : (Math.random() - .5) * 1.1;
      t.pieces.add(p);
      if (spawn && i >= old.length - (old.length ? 1 : 0)) { // as novas caem do alto
        const y0 = t.c.y + 2.2 + Math.random(); p.position.y = y0;
        tween(.45, k => { p.position.y = y0 + (t.c.y - y0) * easeOut(k); }, () => puff(p.position, .35, 0xd8c8a8, 3), i * .03);
      }
    });
    t.shown = { owner, armies };
    drawLabel(id);
  }
  function drawLabel(id) {
    const t = terr[id], pl = view?.players.find(p => p.id === t.shown.owner), color = pl ? War.COLORS.find(c => c.id === pl.color).hex : '#888';
    const dark = pl && ['branco', 'amarelo'].includes(pl.color);
    const tex = canvasTex(256, 112, (g, w, h) => {
      g.font = '700 26px "Helvetica Neue", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = 6; g.strokeStyle = 'rgba(10,8,5,.85)'; g.strokeText(t.name.toUpperCase(), w / 2, 22); g.fillStyle = '#f3ead2'; g.fillText(t.name.toUpperCase(), w / 2, 22);
      // selo com o número de exércitos na cor do dono
      g.beginPath(); g.arc(w / 2, 74, 30, 0, Math.PI * 2); g.fillStyle = color; g.fill(); g.lineWidth = 5; g.strokeStyle = 'rgba(10,8,5,.9)'; g.stroke();
      g.font = '800 34px "Helvetica Neue", Arial, sans-serif'; g.fillStyle = dark ? '#111' : '#fff'; g.fillText(String(t.shown.armies), w / 2, 76);
    });
    const m = t.label.material; m.map?.dispose(); m.map = tex; m.needsUpdate = true;
    t.label.scale.set(2.1, .92, 1);
    t.label.position.set(t.c.x, 1.45, t.c.z - .45); // um pouco atrás das peças, para não cobri-las
    // topo do território: cor do dono misturada à cor do continente
    const base = new T.Color(CONT_COLOR[t.cont]), own = pl ? COLOR[pl.color] : new T.Color(0x777777);
    const target = base.lerp(own, pl?.color === 'preto' ? .6 : .7);
    if (t.paint) { const from = t.mat.color.clone(); t.paint = false; tween(.8, k => t.mat.color.copy(from).lerp(target, easeOut(k))); }
    else t.mat.color.copy(target);
  }

  // ---------- sincronização ----------
  function sync(v, u = {}) {
    if (!mounted) return; view = v; ui = u;
    for (const id in terr) if (!lock.has(id)) setPieces(id, v.owner[id], v.armies[id], terr[id].shown.owner === v.owner[id] && v.armies[id] > terr[id].shown.armies);
    highlight(); continents();
  }
  function continents() {
    for (const [k, mat] of Object.entries(sideMats)) {
      const ids = Object.keys(terr).filter(id => terr[id].cont === k), o = terr[ids[0]].shown.owner;
      const all = o && ids.every(id => terr[id].shown.owner === o), pl = all ? view.players.find(p => p.id === o) : null;
      contOwner[k] = pl ? COLOR[pl.color] : null;
      if (!pl) mat.emissive.setHex(0x000000);
    }
  }
  function highlight() {
    const sel = ui.sel, targets = new Set(ui.targets || []), hov = hoverId;
    for (const [id, t] of Object.entries(terr)) {
      const on = id === sel ? 1 : targets.has(id) ? .55 : id === hov ? .3 : 0;
      t.hl = on; t.hlColor = id === sel ? 0xffc04a : targets.has(id) ? (ui.mode === 'attack' ? 0xff3b2f : 0x3fe07a) : 0xffffff;
    }
  }

  // ---------- animações de eventos ----------
  function play(e) { queue.push(e); if (queue.length > 6) queue.splice(0, queue.length - 6); pump(); }
  async function pump() {
    if (busy) return; busy = true;
    while (queue.length) {
      const e = queue.shift(), fast = queue.length > 2 || document.hidden;
      try { await run(e, fast); } catch (err) { console.warn(err); }
    }
    busy = false; lock.clear(); if (view) sync(view, ui);
  }
  async function run(e, fast) {
    if (e.type === 'battle') return battleFx(e, fast);
    if (e.type === 'move' || e.type === 'occupy') return marchFx(e, fast);
    if (e.type === 'trade') { SFX.coinShower?.(); return; }
    if (e.type === 'eliminated') { SFX.explosion?.(); cam.shake = .5; flash(new T.Vector3(cam.x, 1, cam.z), 3, 0xff7040); return; }
    if (e.type === 'win') return winFx(e);
  }
  function apply(ids) { for (const id of ids) { lock.delete(id); if (view) setPieces(id, view.owner[id], view.armies[id], false); } }

  async function battleFx(e, fast) {
    lock.add(e.from); lock.add(e.to);
    const A = terr[e.from].c, B = terr[e.to].c;
    // seta em arco do atacante até o alvo
    const curve = new T.QuadraticBezierCurve3(A.clone().setY(.5), A.clone().lerp(B, .5).setY(1.6 + A.distanceTo(B) * .12), B.clone().setY(.5));
    const arrow = new T.Mesh(new T.TubeGeometry(curve, 40, .06, 8, false), new T.MeshBasicMaterial({ color: 0xff4a32, transparent: true, opacity: .95 }));
    arrow.geometry.setDrawRange(0, 0); scene.add(arrow);
    const head = new T.Mesh(new T.ConeGeometry(.16, .4, 12), arrow.material); scene.add(head);
    SFX.whoosh?.();
    const total = arrow.geometry.index.count;
    const shot = new T.Sprite(new T.SpriteMaterial({ map: puffTexture(), color: 0xffd28a, transparent: true, depthWrite: false, blending: T.AdditiveBlending })); shot.scale.setScalar(.6); scene.add(shot);
    let last = 0;
    await new Promise(r => tween(fast ? .25 : .6, k => {
      const kk = easeOut(k); arrow.geometry.setDrawRange(0, Math.floor(total * kk / 6) * 6);
      const p = curve.getPoint(kk), d = curve.getTangent(kk); head.position.copy(p); head.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), d);
      shot.position.copy(p);
      if (kk - last > .04) { last = kk; spark(p, 0xff9a40, .25, 1, .35); } // rastro
    }, r));
    scene.remove(shot);
    flash(B, 2.2); ring(B, 0xffb060, 5, .5); cam.shake = Math.max(cam.shake, .18);
    // dados
    await rollDice(e.a, e.d, fast);
    // perdas: explosões nos territórios
    if (e.lossA) boom(A, e.lossA, fast);
    if (e.lossD) boom(B, e.lossD, fast);
    (e.lossD > e.lossA ? SFX.swordClash : SFX.slash)?.();
    await wait(fast ? 120 : 380);
    if (e.conquered) { terr[e.to].paint = true; conquerFx(e.to, e.att); SFX.truth?.(); }
    apply([e.from, e.to]);
    await new Promise(r => tween(fast ? .15 : .35, k => { arrow.material.opacity = .95 * (1 - k); }, r));
    scene.remove(arrow, head); arrow.geometry.dispose();
    clearDice(fast);
  }
  async function marchFx(e, fast) {
    lock.add(e.from); lock.add(e.to);
    const A = terr[e.from].c, B = terr[e.to].c, color = view.players.find(p => p.id === e.pid)?.color;
    const n = Math.min(5, e.count), walkers = [];
    for (let i = 0; i < n; i++) { const p = makePiece(color, false); p.position.copy(A); scene.add(p); walkers.push(p); }
    apply([e.from]);
    SFX.cardWhoosh?.();
    await new Promise(r => tween(fast ? .3 : .7, k => walkers.forEach((p, i) => {
      const kk = ease(Math.min(1, Math.max(0, k * 1.3 - i * .06))); p.position.lerpVectors(A, B, kk); p.position.y = A.y + Math.sin(kk * Math.PI) * (1 + A.distanceTo(B) * .08) + Math.abs(Math.sin(kk * Math.PI * 7)) * .06;
        p.rotation.y = Math.atan2(B.x - A.x, B.z - A.z); p.rotation.z = Math.sin(kk * Math.PI * 7) * .12; // marcham de frente para o destino
      if (i === 0 && Math.random() < .35) spark(p.position, COLOR[color]?.getHex() ?? 0xffffff, .18, .5, .5);
    }), r));
    puff(B, .6, 0xd8c8a8, 6);
    walkers.forEach(p => scene.remove(p));
    apply([e.to]);
  }
  function conquerFx(id, pid) {
    const t = terr[id], color = view.players.find(p => p.id === pid)?.color || 'branco', col = COLOR[color];
    // anel de choque + bandeira fincada
    const ring = new T.Mesh(new T.RingGeometry(.2, .32, 48), new T.MeshBasicMaterial({ color: col, transparent: true, opacity: .9, side: T.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.copy(t.c).setY(.36); scene.add(ring);
    tween(.9, k => { ring.scale.setScalar(1 + k * 9); ring.material.opacity = .9 * (1 - k); }, () => scene.remove(ring));
    for (let i = 0; i < 26; i++) spark(t.c.clone().add(new T.Vector3((Math.random() - .5) * t.r, .2, (Math.random() - .5) * t.r)), col.getHex(), .22, 2.6, 1.1);
    const flag = new T.Group();
    const pole = new T.Mesh(new T.CylinderGeometry(.018, .018, 1.1, 6), gold()); pole.position.y = .55; flag.add(pole);
    const cloth = new T.Mesh(new T.PlaneGeometry(.5, .32, 6, 2), new T.MeshStandardMaterial({ color: col, side: T.DoubleSide, roughness: .6 }));
    cloth.position.set(.26, .92, 0); flag.add(cloth); flag.position.copy(t.c).add(new T.Vector3(t.r * .35, 0, -t.r * .2)); scene.add(flag);
    const pos = cloth.geometry.attributes.position, base = pos.array.slice();
    tween(.5, k => { flag.position.y = t.c.y + 1.5 * (1 - easeOut(k)); });
    tween(2.6, k => {
      for (let i = 0; i < pos.count; i++) { const x = base[i * 3]; pos.array[i * 3 + 2] = Math.sin(x * 9 + clock * 9) * .05 * (x + .25); }
      pos.needsUpdate = true; if (k > .8) flag.scale.setScalar(1 - (k - .8) * 5 + .0001);
    }, () => scene.remove(flag));
    t.flash = 1;
  }
  // explosão: fumaça + faíscas + peças voando
  let puffTex;
  function boom(at, n, fast) {
    puffTex = puffTex || canvasTex(64, 64, (c, w) => { const g = c.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.5, 'rgba(255,255,255,.4)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, w, w); });
    for (let i = 0; i < 4 + n * 4; i++) {
      const fire = i < 3 + n * 2, s = new T.Sprite(new T.SpriteMaterial({ map: puffTex, color: fire ? 0xffa040 : 0x555555, transparent: true, depthWrite: false, blending: fire ? T.AdditiveBlending : T.NormalBlending }));
      s.position.copy(at).add(new T.Vector3((Math.random() - .5) * .5, .3, (Math.random() - .5) * .5)); scene.add(s);
      const v = new T.Vector3((Math.random() - .5) * 1.6, 1 + Math.random() * 1.6, (Math.random() - .5) * 1.6), size = fire ? .4 : .6;
      tween(fast ? .5 : (fire ? .6 : 1.3), k => { s.position.addScaledVector(v, .016); v.y -= fire ? .02 : .005; s.scale.setScalar(size * (1 + k * (fire ? 1 : 2.5))); s.material.opacity = (1 - k) * (fire ? 1 : .55); }, () => scene.remove(s), i * .01);
    }
    for (let i = 0; i < n; i++) { // peças derrubadas voando
      const p = makePiece('preto', false); p.children[0].material = new T.MeshStandardMaterial({ color: 0x3a3a3a, roughness: .8 }); p.position.copy(at); scene.add(p);
      const v = new T.Vector3((Math.random() - .5) * 2.5, 3 + Math.random() * 2, (Math.random() - .5) * 2.5), spin = new T.Vector3(Math.random() * 12, Math.random() * 12, Math.random() * 12);
      tween(fast ? .5 : .9, k => { p.position.addScaledVector(v, .016); v.y -= .16; p.rotation.x += spin.x * .016; p.rotation.z += spin.z * .016; p.scale.setScalar(1 - k * .8); }, () => scene.remove(p));
    }
    for (let i = 0; i < 10 + n * 6; i++) spark(at.clone().setY(.4), Math.random() < .5 ? 0xffc060 : 0xff6a20, .14, 4, .7);
    flash(at, 1.6 + n * .6); cam.shake = Math.max(cam.shake, .1 + n * .06);
    const scorch = new T.Mesh(new T.CircleGeometry(.55, 24), new T.MeshBasicMaterial({ map: puffTexture(), color: 0x000000, transparent: true, opacity: .55, depthWrite: false }));
    scorch.rotation.x = -Math.PI / 2; scorch.position.copy(at).setY(.32); scene.add(scorch);
    tween(3, k => { scorch.material.opacity = .55 * (1 - k); }, () => scene.remove(scorch), .4);
    SFX.explosion?.();
  }
  // utilitários de efeitos
  function puffTexture() { return puffTex || (puffTex = canvasTex(64, 64, (c, w) => { const g = c.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.5, 'rgba(255,255,255,.4)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, w, w); })); }
  function spark(at, color, size, speed, life) {
    const s = new T.Sprite(new T.SpriteMaterial({ map: puffTexture(), color, transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
    s.position.copy(at); s.scale.setScalar(size); scene.add(s);
    const v = new T.Vector3((Math.random() - .5), Math.random() * .9 + .4, (Math.random() - .5)).normalize().multiplyScalar(speed * (.4 + Math.random() * .6));
    tween(life * (.6 + Math.random() * .6), k => { s.position.addScaledVector(v, .016); v.y -= .07; s.material.opacity = 1 - k; s.scale.setScalar(size * (1 - k * .6)); }, () => { scene.remove(s); s.material.dispose(); });
  }
  function puff(at, size, color, n) {
    for (let i = 0; i < n; i++) {
      const s = new T.Sprite(new T.SpriteMaterial({ map: puffTexture(), color, transparent: true, depthWrite: false, opacity: .5 }));
      const a = i / n * Math.PI * 2; s.position.copy(at).add(new T.Vector3(Math.cos(a) * .1, .05, Math.sin(a) * .1)); s.scale.setScalar(size * .5); scene.add(s);
      tween(.6, k => { s.position.x += Math.cos(a) * .012; s.position.z += Math.sin(a) * .012; s.position.y += .004; s.scale.setScalar(size * (.5 + k)); s.material.opacity = .5 * (1 - k); }, () => { scene.remove(s); s.material.dispose(); });
    }
  }
  function ring(at, color, scale, life) {
    const m = new T.Mesh(new T.RingGeometry(.25, .34, 48), new T.MeshBasicMaterial({ color, transparent: true, opacity: .9, side: T.DoubleSide, depthWrite: false, blending: T.AdditiveBlending }));
    m.rotation.x = -Math.PI / 2; m.position.copy(at).setY(.34); scene.add(m);
    tween(life, k => { m.scale.setScalar(1 + k * scale); m.material.opacity = .9 * (1 - k); }, () => { scene.remove(m); m.geometry.dispose(); });
  }
  function flash(at, power, color = 0xffa040) {
    flashLight.color.setHex(color); flashLight.position.copy(at).setY(1.4);
    tween(.5, k => { flashLight.intensity = power * 4 * (1 - k) * (1 - k); });
  }
  async function winFx(e) {
    const pl = view?.players.find(p => p.id === e.pid), col = pl ? COLOR[pl.color].getHex() : 0xffd060;
    const mine = Object.keys(terr).filter(id => terr[id].shown.owner === e.pid);
    for (let w = 0; w < 14; w++) {
      const id = mine[Math.floor(Math.random() * mine.length)]; if (!id) break;
      const at = terr[id].c.clone().setY(2.5 + Math.random() * 2);
      for (let i = 0; i < 26; i++) spark(at, i % 3 ? col : 0xfff2c0, .2, 3.5, 1.2);
      flash(at, 1.4, col); SFX.coinPing?.(w);
      await wait(260);
    }
  }

  // ---------- dados ----------
  let diceMats = {};
  function dieMats(kind) {
    if (diceMats[kind]) return diceMats[kind];
    const bg = kind === 'a' ? '#c8261d' : '#f2c02c', fg = kind === 'a' ? '#fff' : '#1b1b1b';
    const face = v => canvasTex(128, 128, (c, w) => {
      c.fillStyle = bg; c.fillRect(0, 0, w, w);
      const g = c.createRadialGradient(64, 64, 20, 64, 64, 90); g.addColorStop(0, 'rgba(255,255,255,.12)'); g.addColorStop(1, 'rgba(0,0,0,.25)'); c.fillStyle = g; c.fillRect(0, 0, w, w);
      c.fillStyle = fg; const P = { 1: [[64, 64]], 2: [[34, 34], [94, 94]], 3: [[30, 30], [64, 64], [98, 98]], 4: [[34, 34], [94, 34], [34, 94], [94, 94]], 5: [[32, 32], [96, 32], [64, 64], [32, 96], [96, 96]], 6: [[34, 28], [94, 28], [34, 64], [94, 64], [34, 100], [94, 100]] }[v];
      P.forEach(([x, y]) => { c.beginPath(); c.arc(x, y, 11, 0, Math.PI * 2); c.fill(); });
    });
    // ordem das faces do BoxGeometry: +x, -x, +y, -y, +z, -z
    return (diceMats[kind] = [3, 4, 1, 6, 2, 5].map(v => new T.MeshStandardMaterial({ map: face(v), roughness: .35, metalness: .05 })));
  }
  const FACE_NORMAL = { 3: [1, 0, 0], 4: [-1, 0, 0], 1: [0, 1, 0], 6: [0, -1, 0], 2: [0, 0, 1], 5: [0, 0, -1] };
  let dieGeo;
  function makeDie(kind) {
    dieGeo = dieGeo || (() => { const g = new T.BoxGeometry(.5, .5, .5, 3, 3, 3), p = g.attributes.position, v = new T.Vector3(); for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const c = v.clone().clampScalar(-.17, .17); v.sub(c).normalize().multiplyScalar(.08).add(c); p.setXYZ(i, v.x * 1.0, v.y, v.z); } g.computeVertexNormals(); return g; })();
    // materiais próprios (mesmas texturas) para poder escurecer o dado que perdeu
    const m = new T.Mesh(dieGeo, dieMats(kind).map(x => x.clone())); m.castShadow = true; return m;
  }
  // bandeja de dados: aparece no meio da tela, entre a câmera e o mapa (feltro com aro de latão)
  let tray;
  function buildTray() {
    tray = new T.Group(); tray.visible = false; scene.add(tray);
    const felt = canvasTex(256, 256, (c, w) => { c.fillStyle = '#173226'; c.fillRect(0, 0, w, w); for (let i = 0; i < 5000; i++) { const v = Math.random() < .5 ? 0 : 255; c.fillStyle = `rgba(${v},${v},${v},${Math.random() * .06})`; c.fillRect(Math.random() * w, Math.random() * w, 2, 2); } });
    const disc = new T.Mesh(new T.CylinderGeometry(3.3, 3.3, .14, 56), new T.MeshStandardMaterial({ map: felt, roughness: .95, transparent: true }));
    disc.position.y = -.07; disc.receiveShadow = true; tray.add(disc);
    const rim = new T.Mesh(new T.TorusGeometry(3.3, .1, 10, 72).rotateX(Math.PI / 2), new T.MeshStandardMaterial({ color: 0xb8904c, metalness: .9, roughness: .28, transparent: true }));
    rim.position.y = .02; tray.add(rim);
    const tag = (txt, color, z) => {
      const tex = canvasTex(256, 64, (c, w, h) => { c.font = '800 38px Georgia, serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = color; c.fillText(txt, w / 2, h / 2 + 2); });
      const m = new T.Mesh(new T.PlaneGeometry(1.5, .375), new T.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
      m.rotation.x = -Math.PI / 2; m.position.set(-2.15, .005, z); m.renderOrder = 5; tray.add(m); // desenha depois do feltro
    };
    tag('ATAQUE', '#ff6a5c', -.6); tag('DEFESA', '#f2c230', .6);
    diceGroup = new T.Group(); tray.add(diceGroup);
  }
  function placeTray() {
    // a uma fração do caminho entre a câmera e o mapa, no centro da vista; o tamanho acompanha a proporção da tela
    const dir = new T.Vector3(); camera.getWorldDirection(dir);
    const D = cam.dist * .45; tray.position.copy(camera.position).addScaledVector(dir, D);
    return D * .69 * Math.min(camera.aspect, 1.6) * .5 / 6.6;
  }
  async function rollDice(a, d, fast) {
    clearDice(true);
    const sc = placeTray(); tray.visible = true; tray.userData.sc = sc; tray.userData.gen = (tray.userData.gen || 0) + 1;
    tray.traverse(o => o.material && o.material.transparent && o.parent === tray && (o.material.opacity = 1));
    tray.userData.k = .6; tween(fast ? .12 : .25, k => { tray.userData.k = .6 + .4 * easeOut(k); });
    // colunas fixas: o 1º dado de cada lado fica frente a frente (maior contra maior)
    const mk = (vals, kind, z) => vals.map((v, i) => { const m = makeDie(kind); m.userData = { v, tx: (i - 1) * .9, tz: z }; m.position.set(0, -50, 0); diceGroup.add(m); return m; });
    const A = mk(a, 'a', -.6), D = mk(d, 'd', .6), all = [...A, ...D];
    SFX.shake?.(); setTimeout(() => SFX.bounce?.(), fast ? 250 : 650);
    const dur = fast ? .55 : 1.15;
    all.forEach((m, i) => {
      const { v, tx, tz } = m.userData, up = new T.Vector3(0, 1, 0), n = new T.Vector3(...FACE_NORMAL[v]);
      const end = new T.Quaternion().setFromUnitVectors(n, up).premultiply(new T.Quaternion().setFromAxisAngle(up, (Math.random() - .5) * .5));
      const spin = new T.Euler(Math.random() * 22, Math.random() * 22, Math.random() * 22);
      const start = new T.Vector3(tx * .4 + (Math.random() - .5) * 1.5, 2.8, 3.4 + Math.random()), stop = new T.Vector3(tx, .25, tz);
      tween(dur, k => {
        const kk = easeOut(k); m.position.lerpVectors(start, stop, kk); m.position.y = .25 + Math.abs(Math.sin(kk * Math.PI * 2.5)) * (1 - kk) * 1.8 + (1 - kk) * (1 - kk) * 1.2;
        if (k < .85) m.rotation.set(spin.x * (1 - kk), spin.y * (1 - kk), spin.z * (1 - kk)); else m.quaternion.slerp(end, (k - .85) / .15);
        if (k >= 1) { m.quaternion.copy(end); m.position.copy(stop); }
      }, null, i * .06);
    });
    await wait(dur * 1000 + 350);
    // comparação par a par (maior com maior): o vencedor ganha um anel verde, quem perde escurece e afunda
    for (let i = 0; i < Math.min(A.length, D.length); i++) {
      const aw = a[i] > d[i], win = aw ? A[i] : D[i], lose = aw ? D[i] : A[i];
      const glow = new T.Mesh(new T.RingGeometry(.36, .48, 36), new T.MeshBasicMaterial({ color: 0x6dff8a, transparent: true, opacity: 0, side: T.DoubleSide, blending: T.AdditiveBlending, depthWrite: false }));
      glow.rotation.x = -Math.PI / 2; glow.position.set(win.position.x, .01, win.position.z); glow.renderOrder = 5; diceGroup.add(glow);
      const link = new T.Mesh(new T.BoxGeometry(.05, .02, .55), new T.MeshBasicMaterial({ color: aw ? 0xff6a5c : 0xf2c230, transparent: true, opacity: 0 }));
      link.position.set(A[i].position.x, .01, 0); link.renderOrder = 5; diceGroup.add(link);
      tween(fast ? .15 : .3, k => {
        glow.material.opacity = .95 * k; link.material.opacity = .8 * k; glow.scale.setScalar(1 + .25 * Math.sin(k * Math.PI));
        win.position.y = .25 + Math.sin(k * Math.PI) * .25;
        lose.position.y = .25 - .08 * k; lose.material.forEach(mm => mm.color.setScalar(1 - .55 * k));
      }, null, i * (fast ? .08 : .22));
    }
    await wait(fast ? 300 : 700 + Math.min(A.length, D.length) * 220);
  }
  function clearDice(now) {
    const kids = diceGroup.children.slice(), drop = () => kids.forEach(k => { diceGroup.remove(k); (Array.isArray(k.material) ? k.material : [k.material]).forEach(m => m.dispose()); });
    if (now) { drop(); tray.visible = false; return; }
    const gen = tray.userData.gen;
    tween(.35, k => { if (tray.userData.gen !== gen) return; tray.userData.k = 1 - .4 * k; tray.traverse(o => { if (o.material && !Array.isArray(o.material)) { o.material.transparent = true; o.material.opacity = Math.min(o.material.opacity, 1 - k); } else if (Array.isArray(o.material)) o.material.forEach(m => { m.transparent = true; m.opacity = 1 - k; }); }); },
      () => { drop(); if (tray.userData.gen !== gen) return; tray.visible = false; tray.traverse(o => o.material && !Array.isArray(o.material) && (o.material.opacity = 1)); }, .9);
  }

  // ---------- entrada (clique, arrastar para mover a câmera, roda para zoom) ----------
  let hoverId = null, down = null;
  function pick(e) {
    const r = canvas.getBoundingClientRect();
    raycaster.setFromCamera(new T.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
    const hit = raycaster.intersectObjects(Object.values(terr).map(t => t.mesh), false)[0];
    return hit?.object.userData.terr || null;
  }
  function bindInput() {
    canvas.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY, cx: cam.tx, cz: cam.tz, moved: false }; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', e => {
      if (down) {
        const dx = e.clientX - down.x, dy = e.clientY - down.y;
        if (Math.hypot(dx, dy) > 6) down.moved = true;
        if (down.moved) { const k = cam.dist / canvas.clientHeight * 1.1; cam.tx = clamp(down.cx - dx * k, -MW * S / 2 + 2, MW * S / 2 - 2); cam.tz = clamp(down.cz - dy * k * 1.3, -MH * S / 2, MH * S / 2 + 1); canvas.style.cursor = 'grabbing'; }
        return;
      }
      const id = pick(e); if (id !== hoverId) { hoverId = id; highlight(); handlers.hover?.(id); }
      canvas.style.cursor = id ? 'pointer' : 'grab';
    });
    canvas.addEventListener('pointerup', e => {
      const d = down; down = null; canvas.style.cursor = '';
      if (d && !d.moved) { const id = pick(e); handlers.click?.(id, e); }
    });
    canvas.addEventListener('pointerleave', () => { if (hoverId) { hoverId = null; highlight(); handlers.hover?.(null); } });
    canvas.addEventListener('wheel', e => { e.preventDefault(); cam.tdist = clamp(cam.tdist * (e.deltaY > 0 ? 1.1 : .9), 9, fitDist() * 1.15); }, { passive: false });
    canvas.addEventListener('dblclick', e => { const id = pick(e); if (id) focus(id); });
  }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function focus(id, dist = 13) { const t = terr[id]; if (!t) return; cam.tx = t.c.x; cam.tz = t.c.z; cam.tdist = Math.min(cam.tdist, dist); }
  function overview() { cam.tx = 0; cam.tz = .6; cam.tdist = fitDist(); }
  function fitDist() {
    const a = camera.aspect, vf = camera.fov * Math.PI / 180;
    const needW = (MW * S + 3) / 2 / Math.tan(vf / 2) / a, needH = (MH * S + 7) / 2 / Math.tan(vf / 2);
    return Math.max(needW, needH) * .92;
  }
  function resize() {
    if (!renderer || !wrap) return;
    const w = wrap.clientWidth, h = wrap.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false); canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
    camera.aspect = w / h; camera.updateProjectionMatrix();
    const f = fitDist(); if (!resize.done || cam.tdist > f * 1.15) { cam.tdist = cam.dist = f; resize.done = true; }
  }

  // ---------- laço ----------
  function loop(t) {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(.05, (t - (lastT || t)) / 1000); lastT = t; frame(dt);
  }
  // depuração: avança a animação quadro a quadro (o painel escondido segura o requestAnimationFrame)
  function advance(ms) { for (let k = 0; k < ms / 16; k++) frame(.016); }
  function frame(dt) {
    clock += dt;
    for (let i = tweens.length - 1; i >= 0; i--) {
      const tw = tweens[i]; if (clock < tw.t0) continue;
      const k = Math.min(1, (clock - tw.t0) / tw.dur); tw.fn(k);
      if (k >= 1) { tweens.splice(i, 1); tw.done?.(); }
    }
    const kc = 1 - Math.exp(-dt * 6);
    cam.x += (cam.tx - cam.x) * kc; cam.z += (cam.tz - cam.z) * kc; cam.dist += (cam.tdist - cam.dist) * kc;
    camera.position.set(cam.x, cam.dist * .86, cam.z + cam.dist * .52); camera.lookAt(cam.x, 0, cam.z - .3);
    if (cam.shake > .001) { camera.position.x += (Math.random() - .5) * cam.shake; camera.position.y += (Math.random() - .5) * cam.shake; cam.shake *= Math.exp(-dt * 7); }
    // a névoa acompanha a distância da câmera (em tela estreita a câmera recua muito e o mapa escurecia)
    scene.fog.near = Math.max(40, cam.dist * 1.25); scene.fog.far = Math.max(80, cam.dist * 2.6);
    if (shimmer) shimmer.material.uniforms.uTime.value = clock;
    if (tray?.visible) tray.scale.setScalar(placeTray() * (tray.userData.k ?? 1)); // a bandeja acompanha a câmera (zoom/arrastar)
    if (clouds) { clouds.material.map.offset.x -= dt * .004; clouds.material.map.offset.y += dt * .0012; }
    moveShips(dt);
    if (dust) { const a = dust.geometry.attributes.position; for (let i = 0; i < a.count; i++) { a.array[i * 3 + 1] += dt * .05; a.array[i * 3] += Math.sin(clock + i) * dt * .02; if (a.array[i * 3 + 1] > 7) a.array[i * 3 + 1] = 0; } a.needsUpdate = true; }
    for (const [k, mat] of Object.entries(sideMats)) if (contOwner[k]) { mat.emissive.copy(contOwner[k]); mat.emissiveIntensity = .35 + .25 * Math.sin(clock * 2.4); }
    const pulse = .5 + .5 * Math.sin(clock * 5);
    for (const t of Object.values(terr)) {
      const target = t.hl ? (t.hl >= 1 ? .3 : .12 + .14 * pulse * t.hl) : 0;
      t.lift += ((t.hl >= 1 ? .12 : 0) - t.lift) * kc;
      t.mesh.position.y = t.lift; t.pieces.position.y = t.lift;
      t.mat.emissive.setHex(t.hl ? t.hlColor : 0x000000); t.mat.emissiveIntensity = target;
      if (t.flash > 0) { t.flash = Math.max(0, t.flash - dt * 1.4); t.mat.emissive.setHex(0xffffff); t.mat.emissiveIntensity = t.flash * .6; }
    }
    renderer.render(scene, camera);
  }
  function show(on) { active = !!on && mounted; if (!mounted) return; canvas.style.display = active ? '' : 'none'; cancelAnimationFrame(raf); lastT = 0; if (active) { resize(); raf = requestAnimationFrame(loop); } }
  // posição de um território na tela (para balões e dicas)
  function screenPos(id, y = .9) {
    const t = terr[id]; if (!t || !camera) return null;
    const v = t.c.clone().setY(y).project(camera), r = canvas.getBoundingClientRect();
    return { x: (v.x + 1) / 2 * r.width, y: (1 - v.y) / 2 * r.height };
  }

  return { supported, mount, show, sync, play, focus, overview, screenPos, advance, dbg: () => ({ terr, scene, camera, lock, queue }), get active() { return active; }, get busy() { return busy; } };
})();
