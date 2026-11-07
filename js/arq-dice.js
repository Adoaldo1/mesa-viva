// ===== Arquipélago — dados em 3D =====
// Uma camada WebGL transparente por cima da mesa (serve no tabuleiro 2D e no 3D): dois dados de osso com cantos
// arredondados e pintas cavadas são lançados da beira da mesa, quicam com sombra, rolam e param na face sorteada.
// Só desenha enquanto há dado na tela.
const ArqDice = (() => {
  let T, renderer, scene, camera, canvas, host, dice = [], raf = 0, ok = null, anim = null, hideTimer = 0;
  const SIZE = 1, PX = 76; // tamanho do dado na tela (px) — a câmera se afasta conforme a altura da mesa
  // faces da BoxGeometry na ordem +x, -x, +y, -y, +z, -z (faces opostas somam 7)
  const FACE_VAL = [3, 4, 1, 6, 2, 5];
  const NORMAL = { 3: [1, 0, 0], 4: [-1, 0, 0], 1: [0, 1, 0], 6: [0, -1, 0], 2: [0, 0, 1], 5: [0, 0, -1] };

  function supported() {
    if (ok == null) { try { const c = document.createElement('canvas'); ok = !!(window.THREE && (c.getContext('webgl2') || c.getContext('webgl'))); } catch { ok = false; } }
    return ok;
  }

  // cubo de cantos arredondados: cada vértice é puxado para a "casca" de raio r em volta de um cubo menor
  function roundedBox(size, r, seg) {
    const g = new T.BoxGeometry(size, size, size, seg, seg, seg), p = g.attributes.position, n = g.attributes.normal, h = size / 2 - r;
    const v = new T.Vector3(), c = new T.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      c.set(Math.max(-h, Math.min(h, v.x)), Math.max(-h, Math.min(h, v.y)), Math.max(-h, Math.min(h, v.z)));
      v.sub(c).normalize(); n.setXYZ(i, v.x, v.y, v.z); // normal exata da superfície arredondada (sem costura entre faces)
      v.multiplyScalar(r).add(c); p.setXYZ(i, v.x, v.y, v.z);
    }
    return g;
  }

  // textura de uma face: osso com veios leves e pintas cavadas (cor + relevo)
  const PIPS = { 1: [[.5, .5]], 2: [[.27, .27], [.73, .73]], 3: [[.27, .27], [.5, .5], [.73, .73]], 4: [[.27, .27], [.73, .27], [.27, .73], [.73, .73]], 5: [[.27, .27], [.73, .27], [.5, .5], [.27, .73], [.73, .73]], 6: [[.27, .25], [.27, .5], [.27, .75], [.73, .25], [.73, .5], [.73, .75]] };
  function faceTex(v, bump) {
    const S = 256, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
    if (bump) { g.fillStyle = '#fff'; g.fillRect(0, 0, S, S); }
    else {
      const rg = g.createRadialGradient(S * .4, S * .35, 10, S / 2, S / 2, S * .75); rg.addColorStop(0, '#fffaf0'); rg.addColorStop(1, '#ecdfc2');
      g.fillStyle = rg; g.fillRect(0, 0, S, S);
      g.globalAlpha = .07; g.strokeStyle = '#8a6a3a'; g.lineWidth = 2; // veios do osso
      for (let k = 0; k < 6; k++) { g.beginPath(); const y = S * (.1 + k * .16 + Math.sin(v * 3 + k) * .03); g.moveTo(0, y); g.bezierCurveTo(S * .3, y + 12, S * .6, y - 10, S, y + 4); g.stroke(); }
      g.globalAlpha = 1;
    }
    const r = v === 1 ? S * .11 : S * .085;
    for (const [x, y] of PIPS[v]) {
      if (bump) { const rg = g.createRadialGradient(x * S, y * S, 0, x * S, y * S, r * 1.15); rg.addColorStop(0, '#000'); rg.addColorStop(.75, '#222'); rg.addColorStop(1, '#fff'); g.fillStyle = rg; }
      else {
        const rg = g.createRadialGradient(x * S - r * .25, y * S - r * .3, r * .1, x * S, y * S, r);
        rg.addColorStop(0, v === 1 ? '#c8321e' : '#4a3018'); rg.addColorStop(1, v === 1 ? '#7a1a0e' : '#1e1208'); g.fillStyle = rg;
      }
      g.beginPath(); g.arc(x * S, y * S, r, 0, Math.PI * 2); g.fill();
      if (!bump) { g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 2; g.beginPath(); g.arc(x * S, y * S, r + 1.5, Math.PI * .15, Math.PI * .85); g.stroke(); } // borda clara embaixo da pinta
    }
    const t = new T.CanvasTexture(c); if (!bump) t.encoding = T.sRGBEncoding; t.anisotropy = 4; return t;
  }

  function init() {
    T = THREE;
    canvas = document.createElement('canvas'); canvas.className = 'arq-dice3d';
    renderer = new T.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1)); renderer.setClearColor(0, 0);
    renderer.outputEncoding = T.sRGBEncoding; renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
    scene = new T.Scene();
    camera = new T.PerspectiveCamera(30, 1, .1, 100);
    scene.add(new T.HemisphereLight(0xfff4e0, 0x5a4a38, .75));
    const sun = new T.DirectionalLight(0xfff0d8, 1.6); sun.position.set(-3, 8, 4); sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024); Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 1, far: 20 }); sun.shadow.radius = 4; sun.shadow.bias = -.001;
    const rim = new T.DirectionalLight(0x9ec4ff, .35); rim.position.set(4, 3, -5);
    scene.add(sun, rim);
    // chão invisível que só recebe a sombra dos dados
    const floor = new T.Mesh(new T.PlaneGeometry(40, 40).rotateX(-Math.PI / 2), new T.ShadowMaterial({ opacity: .38 }));
    floor.receiveShadow = true; scene.add(floor);
    const geo = roundedBox(SIZE, .16, 6);
    const mats = FACE_VAL.map(v => new T.MeshStandardMaterial({ map: faceTex(v), bumpMap: faceTex(v, true), bumpScale: .035, roughness: .38, metalness: 0 }));
    for (let k = 0; k < 2; k++) { const m = new T.Mesh(geo, mats); m.castShadow = true; m.visible = false; scene.add(m); dice.push(m); }
  }

  function resize() {
    const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false); canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
    camera.aspect = w / h; camera.fov = 30; camera.updateProjectionMatrix();
    // distância que deixa o dado com ~PX pixels na tela, olhando a mesa a 58° de inclinação
    const px = Math.max(46, Math.min(PX, Math.min(w, h) / 11)); // menor em telas estreitas (celular)
    const vis = h / px * SIZE, dist = vis / 2 / Math.tan(T.MathUtils.degToRad(camera.fov / 2)), a = T.MathUtils.degToRad(58);
    camera.position.set(0, Math.sin(a) * dist, Math.cos(a) * dist); camera.lookAt(0, 0, 0);
    return { halfW: vis / 2 * camera.aspect };
  }

  // orientação final: face sorteada para cima e um giro qualquer em volta do eixo vertical
  function restQuat(v, yaw) {
    const q = new T.Quaternion().setFromUnitVectors(new T.Vector3(...NORMAL[v]), new T.Vector3(0, 1, 0));
    return new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), yaw).multiply(q);
  }

  // estado do dado k no instante t (0 → 1): arremesso em arco, 3 quiques cada vez menores, giro que vai morrendo
  function pose(d, t) {
    const u = d.userData, e = 1 - Math.pow(1 - t, 3);
    d.position.set(u.from.x + (u.to.x - u.from.x) * e, 0, u.from.z + (u.to.z - u.from.z) * e);
    d.position.y = SIZE / 2 + u.lift * Math.pow(1 - t, 1.6) * Math.abs(Math.cos(t * Math.PI * 3.5));
    const spin = u.spin * Math.pow(1 - t, 2.2);
    d.quaternion.copy(u.rest).multiply(new T.Quaternion().setFromAxisAngle(u.axis, spin));
    if (t >= 1) { d.position.set(u.to.x, SIZE / 2, u.to.z); d.quaternion.copy(u.rest); }
  }

  // rola os dados na mesa 'el' e resolve quando eles param; onBounce toca a cada quique
  function roll(el, values, { ms = 1150, onBounce } = {}) {
    if (!supported()) return Promise.resolve(false);
    if (!renderer) init();
    clearTimeout(hideTimer); cancelAnimationFrame(raf); anim?.resolve(true);
    host = el; if (canvas.parentNode !== el) el.appendChild(canvas);
    const { halfW } = resize() || { halfW: 6 };
    canvas.classList.add('on');
    const side = Math.random() < .5 ? -1 : 1; // lançados da esquerda ou da direita
    dice.forEach((d, k) => {
      // trajetórias paralelas (mesmo deslocamento para os dois): ficam sempre a mais de uma diagonal de distância
      const tx = (k ? .76 : -.76) + (Math.random() - .5) * .12, tz = (k ? .12 : -.12) + (Math.random() - .5) * .2;
      d.userData = {
        from: new T.Vector3(tx + side * (halfW + 2), 0, tz + 1.8), to: new T.Vector3(tx, 0, tz),
        lift: 2.4 + Math.random() * .6, spin: Math.PI * (5 + Math.random() * 3), rest: restQuat(values[k], (Math.random() - .5) * .9),
        axis: new T.Vector3(Math.random() - .5, Math.random() * .3, Math.random() - .5).normalize(),
      };
      d.visible = true; pose(d, 0);
    });
    return new Promise(resolve => {
      const t0 = performance.now(); let bounces = 0;
      anim = { resolve };
      const tick = now => {
        const t = Math.min(1, (now - t0) / ms);
        dice.forEach(d => pose(d, t));
        const b = Math.min(3, Math.floor(t * 3.5 + .5)); while (bounces < b) onBounce?.(++bounces); // quique quando o cosseno passa por zero (sem pular nenhum, mesmo com poucos quadros)
        renderer.render(scene, camera);
        if (t < 1) raf = requestAnimationFrame(tick); else { anim = null; resolve(true); }
      };
      raf = requestAnimationFrame(tick);
    });
  }

  // some com os dados (esmaece e para de desenhar)
  function hide() {
    if (!canvas) return;
    canvas.classList.remove('on');
    clearTimeout(hideTimer); hideTimer = setTimeout(() => { if (!canvas.classList.contains('on')) dice.forEach(d => (d.visible = false)); }, 400);
  }

  // depuração (aba em segundo plano não roda requestAnimationFrame): desenha os dados num instante t da rolagem
  function debugAt(el, values, t) {
    if (!renderer) init(); host = el; if (canvas.parentNode !== el) el.appendChild(canvas);
    const { halfW } = resize(); canvas.classList.add('on');
    dice.forEach((d, k) => { if (!d.userData.rest) d.userData = { from: new T.Vector3((k ? .76 : -.76) - (halfW + 2), 0, (k ? .12 : -.12) + 1.8), to: new T.Vector3(k ? .76 : -.76, 0, k ? .12 : -.12), lift: 2.6, spin: Math.PI * 6, rest: restQuat(values[k], k ? .3 : -.2), axis: new T.Vector3(1, .2, .4).normalize() }; d.visible = true; pose(d, t); });
    renderer.render(scene, camera); return canvas;
  }

  return { supported, roll, hide, debugAt };
})();
