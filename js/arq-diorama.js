// ===== Arquipélago — protótipo do diorama (Etapa 2 da reformulação gráfica) =====
// Abre com ?diorama no endereço: um trecho de 7 hexágonos com os cinco biomas de terra, um cardume e o mar,
// uma vila, trilhas e fichas de número, para avaliar o visual antes de levar ao tabuleiro inteiro.
const ArqDiorama = (() => {
  let T, renderer, scene, camera, atmo, world, sea, reefG, root, raf = 0, clock = 0, last = 0;
  const cam = { yaw: .35, tilt: .95, dist: 7.2, tx: 0, tz: 0, tyaw: .35, ttilt: .95, tdist: 7.2, ttx: 0, ttz: 0, auto: false };
  const SQ3 = Math.sqrt(3);
  const RING = ['mata', 'algodoal', 'barreiro', 'cardume', 'vulcao', 'mata'];
  const NUMS = { 0: 9, 1: 6, 2: 4, 3: 10, 5: 8, center: 5 };
  const NAMES = { pedreira: 'Pedreira', mata: 'Mata', algodoal: 'Algodoal', barreiro: 'Barreiro', vulcao: 'Vulcão', cardume: 'Cardume' };

  function tiles() {
    const out = [{ id: 0, x: 0, z: 0, biome: 'pedreira', num: NUMS.center }];
    RING.forEach((b, k) => out.push({ id: k + 1, x: Math.cos(k * Math.PI / 3) * SQ3, z: Math.sin(k * Math.PI / 3) * SQ3, biome: b, num: b === 'vulcao' ? null : NUMS[k] }));
    // anel de mar em volta (para a costa e a espuma)
    let id = 20; for (let q = -3; q <= 3; q++) for (let r = -3; r <= 3; r++) { const s = -q - r; if (Math.max(Math.abs(q), Math.abs(r), Math.abs(s)) !== 2) continue; const x = SQ3 * (q + r / 2), z = 1.5 * r; out.push({ id: id++, x, z, biome: 'mar' }); }
    return out;
  }

  function token(num) {
    const red = num === 6 || num === 8, pips = 6 - Math.abs(7 - num);
    const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
    const rg = g.createRadialGradient(118, 110, 20, 128, 128, 128); rg.addColorStop(0, '#fbf3dc'); rg.addColorStop(1, '#e6d4a8');
    g.fillStyle = rg; g.beginPath(); g.arc(128, 128, 122, 0, Math.PI * 2); g.fill();
    g.lineWidth = 9; g.strokeStyle = '#7a5a34'; g.stroke(); g.lineWidth = 3; g.strokeStyle = 'rgba(122,90,52,.45)'; g.beginPath(); g.arc(128, 128, 104, 0, Math.PI * 2); g.stroke();
    g.fillStyle = red ? '#b8241a' : '#2a1e10'; g.font = `700 ${red ? 118 : 104}px Georgia, serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(num, 128, 116);
    for (let i = 0; i < pips; i++) { g.beginPath(); g.arc(128 + (i - (pips - 1) / 2) * 22, 198, 8, 0, Math.PI * 2); g.fill(); }
    const tex = new T.CanvasTexture(c); tex.encoding = T.sRGBEncoding; tex.anisotropy = 8;
    const wood = new T.MeshStandardMaterial({ color: new T.Color('#8a6238').convertSRGBToLinear(), roughness: .7 });
    const m = new T.Mesh(new T.CylinderGeometry(.24, .25, .06, 32), [wood, new T.MeshStandardMaterial({ map: tex, roughness: .55 }), wood]);
    m.rotation.y = Math.PI / 2; m.castShadow = true; m.receiveShadow = true; return m;
  }

  function setup() {
    T = THREE;
    root = document.createElement('div'); root.id = 'arq-diorama';
    root.innerHTML = `<div class="dio-bar"><b>🏝️ Arquipélago — diorama de teste</b>
      <span class="dio-btns">${['geral', 'pedreira', 'mata', 'algodoal', 'barreiro', 'vulcao', 'cardume'].map(b => `<button data-f="${b}">${b === 'geral' ? '🔭 Geral' : NAMES[b]}</button>`).join('')}<button data-auto>⟳ Girar</button></span>
      <span class="dio-btns">${[['manha', '🌅 Manhã'], ['tarde', '☀️ Tarde'], ['por', '🌇 Pôr do sol']].map(([k, l]) => `<button data-p="${k}">${l}</button>`).join('')}</span>
      <a href="./" class="dio-back">Voltar ao jogo</a></div><div class="dio-vignette"></div><div class="dio-info"></div>`;
    document.body.appendChild(root);
    renderer = new T.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
    renderer.outputEncoding = T.sRGBEncoding; renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
    root.prepend(renderer.domElement);
    scene = new T.Scene();
    camera = new T.PerspectiveCamera(38, 1, .05, 80);
    atmo = ArqWorld.atmosphere(scene, renderer);
    const t = tiles();
    const W = ArqWorld.build(t);
    world = W; scene.add(W.group);
    sea = ArqWorld.ocean(t, 30); scene.add(sea);
    const shoal = t.find(x => x.biome === 'cardume'); reefG = ArqWorld.reef(shoal); scene.add(reefG);
    scene.add(ArqWorld.ambient(4.2));
    // fichas de número
    for (const x of t) if (x.num) {
      if (x.biome === 'cardume') { // ficha sobre uma jangadinha de toras
        const raft = new T.Group(), wood = new T.MeshStandardMaterial({ color: new T.Color('#8a6238').convertSRGBToLinear(), roughness: .8 });
        for (let k = 0; k < 5; k++) { const log = new T.Mesh(new T.CylinderGeometry(.045, .045, .62, 7), wood); log.rotation.z = Math.PI / 2; log.position.set(0, 0, (k - 2) * .092); log.castShadow = true; raft.add(log); }
        raft.position.set(x.x, .01, x.z); raft.rotation.y = .4; const tk = token(x.num); tk.position.set(x.x, .075, x.z); scene.add(raft, tk); continue; }
      const s = W.tokenSpot(x.id), tk = token(x.num); tk.position.set(s.x, s.y + .045, s.z); scene.add(tk);
    }
    // uma vila e duas trilhas na esquina entre a pedreira, a mata e o algodoal
    const vx = Math.cos(Math.PI / 6), vz = Math.sin(Math.PI / 6), house = new T.Mesh(ArqWorld.houseGeo('#d8442f'), new T.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: .7 }));
    house.position.set(vx, W.heightAt(vx, vz), vz); house.rotation.y = -.5; house.castShadow = house.receiveShadow = true; scene.add(house);
    const city = new T.Mesh(ArqWorld.cityGeo('#2f6fd6'), new T.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: .7 }));
    const cx = Math.cos(Math.PI * 7 / 6), cz = Math.sin(Math.PI * 7 / 6); city.position.set(cx, W.heightAt(cx, cz), cz); city.rotation.y = .4; city.castShadow = city.receiveShadow = true; scene.add(city);
    const road = (a, b, color) => {
      const A = [Math.cos(a), Math.sin(a)], B = [Math.cos(b), Math.sin(b)], len = Math.hypot(B[0] - A[0], B[1] - A[1]) * .72;
      const m = new T.Mesh(ArqWorld.roadGeo(color, len), new T.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: .8 }));
      const mx = (A[0] + B[0]) / 2, mz = (A[1] + B[1]) / 2; m.position.set(mx, W.heightAt(mx, mz) + .005, mz); m.rotation.y = -Math.atan2(B[1] - A[1], B[0] - A[0]); m.castShadow = m.receiveShadow = true; scene.add(m);
    };
    road(Math.PI / 6, -Math.PI / 6, '#d8442f'); road(Math.PI / 6, Math.PI / 2, '#d8442f'); road(Math.PI * 7 / 6, Math.PI * 5 / 6, '#2f6fd6');
    // sombra de contato sob as peças e as fichas
    const tokSpots = t.filter(x => x.num && x.biome !== 'cardume').map(x => { const s = W.tokenSpot(x.id); return [s.x, s.y, s.z, .3]; });
    scene.add(ArqWorld.contactShadows([[vx, W.heightAt(vx, vz), vz, .2], [cx, W.heightAt(cx, cz), cz, .26], ...tokSpots]));
    preset('tarde');
    bind(); resize(); new ResizeObserver(resize).observe(root);
    raf = requestAnimationFrame(loop);
    info();
  }
  function info() {
    const r = renderer.info.render; root.querySelector('.dio-info').textContent = `chamadas de desenho: ${r.calls} · triângulos: ${(r.triangles / 1000).toFixed(1)} mil · ${Math.round(fps)} fps`;
  }
  let fps = 60, acc = 0, frames = 0;
  function focus(b) {
    if (b === 'geral') Object.assign(cam, { ttx: 0, ttz: 0, tdist: 7.2, ttilt: .95 });
    else { const t = tiles().find(x => x.biome === b); Object.assign(cam, { ttx: t.x, ttz: t.z, tdist: 3.1, ttilt: .82 }); }
  }
  function bind() {
    const c = renderer.domElement; let down = null;
    c.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY, yaw: cam.tyaw, tilt: cam.ttilt }; c.setPointerCapture(e.pointerId); });
    c.addEventListener('pointermove', e => { if (!down) return; cam.tyaw = down.yaw - (e.clientX - down.x) * .006; cam.ttilt = Math.max(.35, Math.min(1.35, down.tilt - (e.clientY - down.y) * .004)); });
    c.addEventListener('pointerup', () => { down = null; });
    c.addEventListener('wheel', e => { e.preventDefault(); cam.tdist = Math.max(1.6, Math.min(14, cam.tdist * (e.deltaY > 0 ? 1.1 : .9))); }, { passive: false });
    root.querySelectorAll('[data-f]').forEach(b => (b.onclick = () => focus(b.dataset.f)));
    root.querySelector('[data-auto]').onclick = () => { cam.auto = !cam.auto; };
    root.querySelectorAll('[data-p]').forEach(b => (b.onclick = () => preset(b.dataset.p)));
  }
  // horário: luz, céu, névoa e a graduação de cor da tela (filtro no canvas + vinheta)
  function preset(k) { const P = atmo.setPreset(k); renderer.domElement.style.filter = P.grade; root.dataset.preset = k; }
  function resize() { const w = root.clientWidth, h = root.clientHeight; renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); }
  function frame(dt) {
    clock += dt; const k = 1 - Math.exp(-dt * 5);
    if (cam.auto) cam.tyaw += dt * .15;
    for (const p of ['yaw', 'tilt', 'dist']) cam[p] += (cam['t' + p] - cam[p]) * k;
    cam.tx += (cam.ttx - cam.tx) * k; cam.tz += (cam.ttz - cam.tz) * k;
    camera.position.set(cam.tx + Math.sin(cam.yaw) * Math.sin(cam.tilt) * cam.dist, Math.cos(cam.tilt) * cam.dist, cam.tz + Math.cos(cam.yaw) * Math.sin(cam.tilt) * cam.dist);
    camera.lookAt(cam.tx, .25, cam.tz);
    ArqWorld.animate(scene, clock);
    renderer.render(scene, camera);
    acc += dt; frames++; if (acc > 1) { fps = frames / acc; acc = 0; frames = 0; info(); }
  }
  function loop(t) { raf = requestAnimationFrame(loop); const dt = Math.min(.05, (t - (last || t)) / 1000); last = t; frame(dt); }
  // depuração: avança quadros sem depender do requestAnimationFrame (painel escondido) e permite enquadrar por código
  const step = (n = 30) => { for (let i = 0; i < n; i++) frame(1 / 60); };
  // captura: renderiza e copia o quadro para uma imagem por cima (serve para inspeção mesmo com a aba em segundo plano)
  function snap(n = 1) {
    step(n);
    let img = root.querySelector('#dio-snap'); if (!img) { img = document.createElement('img'); img.id = 'dio-snap'; img.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none'; root.appendChild(img); }
    img.src = renderer.domElement.toDataURL('image/jpeg', .9); img.style.display = '';
    renderer.domElement.addEventListener('pointerdown', () => { img.style.display = 'none'; }, { once: true });
  }
  if (typeof location !== 'undefined' && /[?&]diorama\b/.test(location.search)) window.addEventListener('DOMContentLoaded', () => setTimeout(setup, 0));
  return { setup, focus, step, snap, preset, cam, get renderer() { return renderer; }, get scene() { return scene; } };
})();
