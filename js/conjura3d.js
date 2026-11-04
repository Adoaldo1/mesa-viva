// ===== Conjura em 3D (Three.js r128) =====
// Salão do trono, mesa de mogno, cartas com moldura de ouro, moedas em relevo, baú do Tesouro,
// pós-processamento (bloom, tons ACES, vinheta) e efeitos especiais de cada personagem.
const Conjura3D = (() => {
  let T = null, renderer, scene, camera, composer = null, bloom = null, post = null, wrap, canvas, raf = 0, mounted = false, active = false;
  let hall = null, camDist = 1, shake = 0, lastT = 0, slowUntil = 0, slowK = 1, flash = 0, flashCol = null, sat = 1, aberr = 0, vig = .55;
  let seats = [], cardsOf = {}, stacksOf = {}, deckGroup, chest, candles = [], tickers = new Set(), dust;
  let tableParts = [], tableProps = [], flipping = false; // mesa e o que fica em cima dela (para virar a mesa)
  let queue = Promise.resolve(), texCache = {}, lastView = null, layoutCb = null, pending = 0, animating = 0, glow, smoke;
  const look = { x: 0, y: 0, z: .7, zoom: 0 }, lookTo = { x: 0, y: 0, z: .7, zoom: 0 };
  const ROLE_COLOR = { tesoureiro: 0xb67cff, sicario: 0xff2a3a, corsario: 0xff8a2a, diplomata: 0x3ee089, guarda: 0x4f9dff, confessor: 0xff3d6e, rei: 0xffc83a, escriba: 0x4fd6e0 };
  const rand = (a, b) => a + Math.random() * (b - a);
  const ease = t => (t < .5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
  const easeOut = t => 1 - (1 - t) ** 3;
  const easeIn = t => t * t * t;
  const smooth = t => t * t * (3 - 2 * t);
  const backOut = t => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2;
  const col = c => new T.Color(c);

  // ---------- tempo: câmera lenta e aceleração quando a fila de eventos cresce ----------
  const spd = () => Math.min(4, 1 + Math.max(0, pending - 2) * .7);
  let paused = false;
  let clock = 0; // relógio das animações (ms), avança a cada quadro
  const timeScale = () => (paused ? 0 : 1) * (clock < slowUntil ? slowK : 1) * spd();
  function tween(ms, fn) {
    return new Promise(res => {
      let el = 0, fin = false;
      const done = () => { if (fin) return; fin = true; tickers.delete(tk); try { fn(1, 0); } catch (e) { console.warn(e); } res(); };
      const tk = dt => { el += dt * 1000 * timeScale(); const k = Math.min(1, el / ms); try { fn(k, dt * timeScale()); } catch (e) { console.warn(e); return done(); } if (k >= 1) done(); };
      tickers.add(tk); setTimeout(done, ms * 3 + 1000); if (!active) done();
    });
  }
  const wait = ms => tween(ms, () => { });
  const every = fn => { tickers.add(fn); return () => tickers.delete(fn); }; // função chamada a cada quadro
  function slowmo(ms, k = .3) { slowUntil = clock + ms; slowK = k; }
  function focus(v, zoom = 1.6, ms = 1400) { Object.assign(lookTo, { x: v.x * .3, y: 0, z: v.z * .3 + .5, zoom: zoom * .7 }); clearTimeout(focus._t); focus._t = setTimeout(() => Object.assign(lookTo, { x: 0, y: 0, z: .7, zoom: 0 }), ms); }
  function impact(color = 0xffffff, f = .5, s = .5) { flash = Math.max(flash, f * .4); flashCol = col(color); shake = Math.max(shake, s); aberr = Math.max(aberr, f * .008); }

  // ---------- texturas ----------
  const loadImg = src => new Promise(r => { if (!src) return r(null); const i = new Image(); i.onload = () => r(i); i.onerror = () => r(null); i.src = src; });
  function canvasTex(w, h, draw, srgb = true) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new T.CanvasTexture(c); if (srgb) t.encoding = T.sRGBEncoding; t.anisotropy = 8; return t; }
  function imgTex(src, repeat) { const t = new T.TextureLoader().load(src); t.encoding = T.sRGBEncoding; t.anisotropy = 8; if (repeat) { t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(repeat, repeat); } return t; }
  function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  const hex = n => '#' + n.toString(16).padStart(6, '0');
  const shade = (n, k) => { const c = col(n); c.multiplyScalar(k); return '#' + c.getHexString(); };
  function goldGrad(ctx, x0, y0, x1, y1) { const g = ctx.createLinearGradient(x0, y0, x1, y1); [[0, '#fff3c0'], [.18, '#e8b84a'], [.4, '#8a5a17'], [.55, '#f7d77a'], [.75, '#b07a22'], [1, '#fff0b0']].forEach(([o, c]) => g.addColorStop(o, c)); return g; }
  const fontsReady = () => (document.fonts ? Promise.all(['800 40px Cinzel', '600 40px Cinzel', '800 20px Nunito'].map(f => document.fonts.load(f).catch(() => { }))) : Promise.resolve());

  // moldura dourada com cantos ornamentados (usada na frente e no verso)
  function drawFrame(ctx, W, H, gem, mask) {
    const G = mask ? '#fff' : null;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = G || goldGrad(ctx, 0, 0, W, H); ctx.lineWidth = 26; rr(ctx, 15, 15, W - 30, H - 30, 40); ctx.stroke();
    if (!mask) { ctx.strokeStyle = 'rgba(60,30,5,.85)'; ctx.lineWidth = 3; rr(ctx, 30, 30, W - 60, H - 60, 28); ctx.stroke(); }
    ctx.strokeStyle = G || goldGrad(ctx, W, 0, 0, H); ctx.lineWidth = 6; rr(ctx, 38, 38, W - 76, H - 76, 24); ctx.stroke();
    // cantos: volutas
    for (const [cx, cy, sx, sy] of [[38, 38, 1, 1], [W - 38, 38, -1, 1], [38, H - 38, 1, -1], [W - 38, H - 38, -1, -1]]) {
      ctx.save(); ctx.translate(cx, cy); ctx.scale(sx, sy);
      ctx.fillStyle = G || goldGrad(ctx, 0, 0, 90, 90);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(86, 0); ctx.quadraticCurveTo(44, 10, 30, 30); ctx.quadraticCurveTo(10, 44, 0, 86); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.arc(26, 26, 13, 0, 7); ctx.fill();
      if (!mask) { const g = ctx.createRadialGradient(23, 23, 1, 26, 26, 10); g.addColorStop(0, '#fff'); g.addColorStop(.35, hex(gem)); g.addColorStop(1, shade(gem, .3)); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(26, 26, 9, 0, 7); ctx.fill(); }
      ctx.restore();
    }
  }
  function wrapText(ctx, text, x, y, maxW, lh) {
    const words = text.split(' '); let line = '', lines = [];
    for (const w of words) { const t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; }
    lines.push(line); lines.forEach((l, i) => ctx.fillText(l, x, y + (i - (lines.length - 1) / 2) * lh));
  }
  // frente da carta: arte + moldura + faixa com o nome + caixa de texto; mapa PBR: moldura metálica e lisa
  function cardTextures(role) {
    const key = role || 'back'; if (texCache[key]) return texCache[key];
    const W = 640, H = 896;
    const map = canvasTex(W, H, () => { }), pbr = canvasTex(W, H, () => { }, false);
    texCache[key] = { map, pbr };
    Promise.all([loadImg(IMG['conj_' + (role || 'verso')]), fontsReady()]).then(([img]) => {
      const ctx = map.image.getContext('2d'), m = pbr.image.getContext('2d');
      const color = ROLE_COLOR[role] || 0xc9302c;
      // mapa PBR: G = rugosidade, B = metal. Base: fosco, não metálico
      m.fillStyle = 'rgb(0,190,0)'; m.fillRect(0, 0, W, H);
      ctx.fillStyle = '#140a05'; rr(ctx, 0, 0, W, H, 44); ctx.fill();
      if (role) {
        ctx.save(); rr(ctx, 28, 28, W - 56, H - 56, 30); ctx.clip();
        if (img) { const s = Math.max((W - 56) / img.width, (H - 200) / img.height); ctx.drawImage(img, (W - img.width * s) / 2, 28, img.width * s, img.height * s); }
        const sh = ctx.createLinearGradient(0, H * .45, 0, H); sh.addColorStop(0, 'rgba(10,5,2,0)'); sh.addColorStop(.5, 'rgba(10,5,2,.75)'); sh.addColorStop(1, 'rgba(10,5,2,.95)'); ctx.fillStyle = sh; ctx.fillRect(0, 0, W, H);
        const tint = ctx.createRadialGradient(W / 2, H * .35, 50, W / 2, H * .35, H * .7); tint.addColorStop(0, 'rgba(0,0,0,0)'); tint.addColorStop(1, hex(color) + '55'); ctx.fillStyle = tint; ctx.fillRect(0, 0, W, H);
        ctx.restore();
        const R = Conjura.ROLES[role];
        // caixa de texto em pergaminho
        const by = H - 210;
        const pg = ctx.createLinearGradient(0, by, 0, H - 50); pg.addColorStop(0, '#f6ead0'); pg.addColorStop(1, '#d8c091');
        ctx.fillStyle = pg; rr(ctx, 64, by + 30, W - 128, 140, 16); ctx.fill();
        ctx.strokeStyle = '#6b4416'; ctx.lineWidth = 3; ctx.stroke();
        m.fillStyle = 'rgb(0,235,0)'; rr(m, 64, by + 30, W - 128, 140, 16); m.fill();
        ctx.fillStyle = '#3a2410'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '800 25px Nunito';
        const lines = [R.act !== '—' ? R.act : null, R.block || null].filter(Boolean);
        lines.forEach((l, i) => wrapText(ctx, l, W / 2, by + 100 + (i - (lines.length - 1) / 2) * 58, W - 170, 28));
        // faixa com o nome
        const ry = by - 6;
        ctx.save(); ctx.translate(W / 2, ry);
        const bg = ctx.createLinearGradient(0, -40, 0, 40); bg.addColorStop(0, shade(color, 1.15)); bg.addColorStop(.5, hex(color)); bg.addColorStop(1, shade(color, .45));
        const ribbon = c => { c.beginPath(); c.moveTo(-250, -36); c.lineTo(250, -36); c.lineTo(228, 0); c.lineTo(250, 36); c.lineTo(-250, 36); c.lineTo(-228, 0); c.closePath(); };
        ribbon(ctx); ctx.fillStyle = bg; ctx.fill(); ctx.lineWidth = 7; ctx.strokeStyle = goldGrad(ctx, -250, -36, 250, 36); ctx.stroke();
        ctx.font = '800 46px Cinzel'; ctx.fillStyle = '#fff8e6'; ctx.shadowColor = 'rgba(0,0,0,.8)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 3;
        ctx.fillText(R.name.toUpperCase(), 0, 3, 440); ctx.restore();
        m.save(); m.translate(W / 2, ry); ribbon(m); m.lineWidth = 7; m.strokeStyle = 'rgb(0,70,255)'; m.stroke(); m.restore();
        // gema no topo
        ctx.save(); ctx.translate(W / 2, 30);
        ctx.fillStyle = goldGrad(ctx, -44, -30, 44, 30); ctx.beginPath(); ctx.moveTo(-60, 0); ctx.quadraticCurveTo(0, 70, 60, 0); ctx.quadraticCurveTo(0, 20, -60, 0); ctx.fill();
        ctx.beginPath(); ctx.arc(0, 22, 26, 0, 7); ctx.fill();
        const gg = ctx.createRadialGradient(-7, 15, 2, 0, 22, 20); gg.addColorStop(0, '#fff'); gg.addColorStop(.3, hex(color)); gg.addColorStop(1, shade(color, .25));
        ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(0, 22, 19, 0, 7); ctx.fill(); ctx.restore();
        m.fillStyle = 'rgb(0,60,255)'; m.beginPath(); m.arc(W / 2, 52, 26, 0, 7); m.fill(); m.fillStyle = 'rgb(0,20,0)'; m.beginPath(); m.arc(W / 2, 52, 19, 0, 7); m.fill();
      } else {
        // verso: brasão da corte (arte gerada), com a moldura dourada por cima
        ctx.save(); rr(ctx, 20, 20, W - 40, H - 40, 34); ctx.clip();
        if (img) { const sc = Math.max((W - 40) / img.width, (H - 40) / img.height); ctx.drawImage(img, (W - img.width * sc) / 2, (H - img.height * sc) / 2, img.width * sc, img.height * sc); }
        ctx.restore();
        m.fillStyle = 'rgb(0,120,90)'; m.fillRect(0, 0, W, H); // brasão levemente metálico
      }
      drawFrame(ctx, W, H, color, false);
      m.strokeStyle = m.fillStyle = 'rgb(0,70,255)'; drawFrame(m, W, H, color, true);
      map.needsUpdate = true; pbr.needsUpdate = true;
    });
    return texCache[key];
  }
  function hiddenMat() { return texCache.hidden || (texCache.hidden = new T.MeshBasicMaterial({ visible: false })); }
  function whiteTex() { return texCache.white || (texCache.white = canvasTex(4, 4, (c) => { c.fillStyle = '#fff'; c.fillRect(0, 0, 4, 4); })); }
  function glowTex() { return texCache.glow || (texCache.glow = canvasTex(128, 128, (c, w) => { const g = c.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.2, 'rgba(255,255,255,.55)'); g.addColorStop(.5, 'rgba(255,255,255,.12)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, w, w); })); }
  function runeTex() { // círculo mágico: anéis, runas e estrela
    return texCache.rune || (texCache.rune = canvasTex(512, 512, (c, w) => {
      c.translate(w / 2, w / 2); c.strokeStyle = c.fillStyle = '#fff'; c.shadowColor = '#fff'; c.shadowBlur = 8;
      [[240, 5], [222, 2], [160, 3], [146, 1.5], [70, 2]].forEach(([r, l]) => { c.lineWidth = l; c.beginPath(); c.arc(0, 0, r, 0, 7); c.stroke(); });
      c.font = '26px serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      const runes = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ';
      for (let i = 0; i < 24; i++) { c.save(); c.rotate(i / 24 * Math.PI * 2); c.fillText(runes[i], 0, -191); c.restore(); }
      c.lineWidth = 2.5; c.beginPath();
      for (let i = 0; i <= 7; i++) { const a = i * Math.PI * 2 * 3 / 7 - Math.PI / 2; c[i ? 'lineTo' : 'moveTo'](Math.cos(a) * 146, Math.sin(a) * 146); } c.stroke();
      for (let i = 0; i < 7; i++) { const a = i * Math.PI * 2 / 7 - Math.PI / 2; c.beginPath(); c.arc(Math.cos(a) * 146, Math.sin(a) * 146, 12, 0, 7); c.stroke(); }
    }));
  }
  function raysTex() { // raios de luz atrás da carta
    return texCache.rays || (texCache.rays = canvasTex(512, 512, (c, w) => {
      c.translate(w / 2, w / 2);
      for (let i = 0; i < 28; i++) { const a = i / 28 * Math.PI * 2 + Math.random() * .1, l = rand(150, 256), wd = rand(.02, .07); const g = c.createRadialGradient(0, 0, 20, 0, 0, l); g.addColorStop(0, 'rgba(255,255,255,.9)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, l, a - wd, a + wd); c.closePath(); c.fill(); }
    }));
  }
  function slashTex() {
    return texCache.slash || (texCache.slash = canvasTex(512, 256, (c, w, h) => {
      const crescent = (th, alpha) => {
        const R = 470, cx = w / 2, cy = R + 40, a0 = Math.PI * 1.5 - .5, a1 = Math.PI * 1.5 + .5;
        const g = c.createLinearGradient(0, 0, w, 0); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(.5, `rgba(255,255,255,${alpha})`); g.addColorStop(1, 'rgba(255,255,255,0)');
        c.fillStyle = g; c.beginPath(); c.arc(cx, cy, R, a0, a1); c.arc(cx, cy + th, R + 2, a1, a0, true); c.closePath(); c.fill();
      };
      c.shadowColor = '#fff'; c.shadowBlur = 18; crescent(46, .55); c.shadowBlur = 0; crescent(18, 1);
    }));
  }
  function eyeTex() {
    return texCache.eye || (texCache.eye = canvasTex(256, 256, (c, w) => {
      c.translate(128, 128); c.strokeStyle = c.fillStyle = '#fff'; c.shadowColor = '#fff'; c.shadowBlur = 10; c.lineWidth = 7;
      c.beginPath(); c.moveTo(-110, 0); c.quadraticCurveTo(0, -90, 110, 0); c.quadraticCurveTo(0, 90, -110, 0); c.stroke();
      c.beginPath(); c.arc(0, 0, 38, 0, 7); c.stroke(); c.beginPath(); c.arc(0, 0, 16, 0, 7); c.fill();
      for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; c.lineWidth = 3; c.beginPath(); c.moveTo(Math.cos(a) * 54, Math.sin(a) * 54); c.lineTo(Math.cos(a) * 64, Math.sin(a) * 64); c.stroke(); }
    }));
  }

  // ---------- shaders ----------
  const NOISE = `float h21(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y);}
    float fbm(vec2 p){return vn(p)*.5+vn(p*2.13)*.28+vn(p*4.37)*.15+vn(p*8.9)*.07;}`;
  // dissolver: a carta se desfaz em brasas com borda brilhante na cor do personagem
  function dissolvable(mat, u) {
    mat.onBeforeCompile = sh => {
      sh.uniforms.uDis = u.dis; sh.uniforms.uEdge = u.edge;
      sh.fragmentShader = 'uniform float uDis; uniform vec3 uEdge;\n' + NOISE + '\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        #ifdef USE_UV
        float dn = fbm(vUv*vec2(5.,7.))*.45 + (1.-vUv.y)*.55;
        if (uDis > 0.001) { if (dn < uDis) discard; float e = 1. - smoothstep(uDis, uDis + .035, dn); float ch = 1. - smoothstep(uDis, uDis + .05, dn);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.04,.015,0.), ch*.9); totalEmissiveRadiance = mix(totalEmissiveRadiance, vec3(0.), ch*.9) + mix(uEdge, vec3(1.,.85,.5), e*e) * e * 4.; }
        #endif`);
    };
    mat.customProgramCacheKey = () => 'dissolve';
  }
  const pointsVS = `attribute float size; attribute float alpha; attribute vec3 pcolor; varying vec3 vC; varying float vA; uniform float uScale;
    void main(){ vC=pcolor; vA=alpha; vec4 mv=modelViewMatrix*vec4(position,1.); gl_PointSize=size*uScale/-mv.z; gl_Position=projectionMatrix*mv; }`;
  const glowFS = `varying vec3 vC; varying float vA; void main(){ float d=length(gl_PointCoord-.5); float a=smoothstep(.5,0.,d); float core=1.-smoothstep(0.,.12,d); gl_FragColor=vec4(vC*(a*a*.8+core*1.2)*vA,a*vA); }`;
  const smokeFS = `varying vec3 vC; varying float vA; void main(){ float d=length(gl_PointCoord-.5); float a=smoothstep(.5,.05,d); gl_FragColor=vec4(vC,a*a*vA); }`;

  // ---------- partículas (sistema único reaproveitado) ----------
  function particleSystem(cap, fs, blending) {
    const geo = new T.BufferGeometry();
    const pos = new Float32Array(cap * 3), pc = new Float32Array(cap * 3), size = new Float32Array(cap), alpha = new Float32Array(cap);
    const vel = new Float32Array(cap * 3), life = new Float32Array(cap), max = new Float32Array(cap), s0 = new Float32Array(cap), s1 = new Float32Array(cap);
    const c0 = new Float32Array(cap * 3), c1 = new Float32Array(cap * 3), grav = new Float32Array(cap), drag = new Float32Array(cap), a0 = new Float32Array(cap);
    const attr = (n, a, k) => { const b = new T.BufferAttribute(a, k); b.setUsage(T.DynamicDrawUsage); geo.setAttribute(n, b); };
    attr('position', pos, 3); attr('pcolor', pc, 3); attr('size', size, 1); attr('alpha', alpha, 1);
    const mat = new T.ShaderMaterial({ uniforms: { uScale: { value: 400 } }, vertexShader: pointsVS, fragmentShader: fs, transparent: true, depthWrite: false, blending });
    const pts = new T.Points(geo, mat); pts.frustumCulled = false; pts.renderOrder = 5;
    let head = 0, live = 0;
    const tmp = new T.Vector3(), ca = new T.Color(), cb = new T.Color();
    function emit(o) {
      const n = o.n || 20; ca.set(o.color ?? 0xffffff); cb.set(o.color2 ?? o.color ?? 0xffffff);
      for (let k = 0; k < n; k++) {
        const i = head; head = (head + 1) % cap;
        // direção: esfera, disco (horizontal) ou cone em torno de dir
        if (o.shape === 'disc') { const a = Math.random() * Math.PI * 2; tmp.set(Math.cos(a), rand(0, o.up ?? .3), Math.sin(a)); }
        else { tmp.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)); if (tmp.lengthSq() > 1) tmp.normalize(); }
        if (o.dir) tmp.multiplyScalar(o.spread ?? .4).add(o.dir);
        tmp.normalize().multiplyScalar(rand(...(o.speed || [1, 3])));
        const r = o.radius || 0, ox = r ? rand(-r, r) : 0, oy = r ? rand(-r, r) * (o.flat ? 0 : 1) : 0, oz = r ? rand(-r, r) : 0;
        const box = o.box; // emitir numa área retangular (para dissolver a carta)
        const bp = box ? box() : null;
        pos[i * 3] = (bp ? bp.x : o.pos.x) + ox; pos[i * 3 + 1] = (bp ? bp.y : o.pos.y) + oy; pos[i * 3 + 2] = (bp ? bp.z : o.pos.z) + oz;
        vel[i * 3] = tmp.x; vel[i * 3 + 1] = tmp.y; vel[i * 3 + 2] = tmp.z;
        max[i] = life[i] = rand(...(o.life || [.6, 1.2]));
        const sz = o.size || [.25, 0]; s0[i] = sz[0] * rand(.6, 1.3); s1[i] = sz[1] * rand(.6, 1.3);
        c0[i * 3] = ca.r; c0[i * 3 + 1] = ca.g; c0[i * 3 + 2] = ca.b; c1[i * 3] = cb.r; c1[i * 3 + 1] = cb.g; c1[i * 3 + 2] = cb.b;
        grav[i] = o.gravity ?? -2; drag[i] = o.drag ?? 1.2; a0[i] = o.alpha ?? 1;
      }
      live = cap;
    }
    function update(dt) {
      if (!live) return; let any = 0;
      for (let i = 0; i < cap; i++) {
        if (life[i] <= 0) { alpha[i] = 0; continue; }
        any = 1; life[i] -= dt; const k = 1 - Math.max(0, life[i]) / max[i], d = Math.exp(-drag[i] * dt);
        vel[i * 3] *= d; vel[i * 3 + 1] = vel[i * 3 + 1] * d + grav[i] * dt; vel[i * 3 + 2] *= d;
        pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        if (pos[i * 3 + 1] < .02 && grav[i] < 0) { pos[i * 3 + 1] = .02; vel[i * 3 + 1] *= -.35; vel[i * 3] *= .6; vel[i * 3 + 2] *= .6; }
        size[i] = s0[i] + (s1[i] - s0[i]) * k;
        alpha[i] = a0[i] * (k < .08 ? k / .08 : 1 - Math.pow(k, 2.2));
        for (let j = 0; j < 3; j++) pc[i * 3 + j] = c0[i * 3 + j] + (c1[i * 3 + j] - c0[i * 3 + j]) * k;
      }
      ['position', 'pcolor', 'size', 'alpha'].forEach(n => (geo.attributes[n].needsUpdate = true));
      if (!any) live = 0;
    }
    return { pts, emit, update, mat };
  }

  // rastro em fita que segue um objeto (adaga, moeda, bola de fogo)
  function trail(obj, color, width = .22, len = 26) {
    const N = len, pos = new Float32Array(N * 2 * 3), ta = new Float32Array(N * 2), idx = [];
    for (let i = 0; i < N - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(pos, 3)); geo.setAttribute('ta', new T.BufferAttribute(ta, 1)); geo.setIndex(idx);
    const mat = new T.ShaderMaterial({
      uniforms: { uC: { value: col(color) }, uF: { value: 1 } }, transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide,
      vertexShader: 'attribute float ta; varying float vA; void main(){ vA=ta; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: 'uniform vec3 uC; uniform float uF; varying float vA; void main(){ float a=vA*vA; gl_FragColor=vec4(uC*(.7+a*.8)*a*uF, a*uF); }',
    });
    const mesh = new T.Mesh(geo, mat); mesh.frustumCulled = false; scene.add(mesh);
    const hist = [], wp = new T.Vector3(), side = new T.Vector3(), dir = new T.Vector3(), toCam = new T.Vector3();
    obj.getWorldPosition(wp); for (let i = 0; i < N; i++) hist.push(wp.clone());
    const stop = every(() => {
      obj.getWorldPosition(wp); hist.pop(); hist.unshift(wp.clone());
      for (let i = 0; i < N; i++) {
        const p = hist[i], q = hist[Math.min(N - 1, i + 1)];
        dir.subVectors(p, q); if (dir.lengthSq() < 1e-8) dir.set(0, 0, 1);
        toCam.subVectors(camera.position, p); side.crossVectors(dir, toCam).normalize().multiplyScalar(width * (1 - i / N));
        pos.set([p.x + side.x, p.y + side.y, p.z + side.z, p.x - side.x, p.y - side.y, p.z - side.z], i * 6);
        ta[i * 2] = ta[i * 2 + 1] = (1 - i / N) ** 1.5;
      }
      geo.attributes.position.needsUpdate = true; geo.attributes.ta.needsUpdate = true;
    });
    return { end: () => { stop(); return tween(350, k => { mat.uniforms.uF.value = 1 - k; if (k >= 1) { scene.remove(mesh); geo.dispose(); mat.dispose(); } }); } };
  }

  // ---------- modelos ----------
  const std = (color, o = {}) => new T.MeshStandardMaterial({ color, roughness: .5, metalness: 0, ...o });
  const gold = () => texCache.goldM || (texCache.goldM = std(0xe0a83c, { metalness: 1, roughness: .26 }));
  const darkGold = () => texCache.dgoldM || (texCache.dgoldM = std(0xa8742a, { metalness: 1, roughness: .38 }));
  const CW = .9, CH = 1.26, CT = .014;
  function roundedRect(w, h, r) { const s = new T.Shape(), x = -w / 2, y = -h / 2; s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h); s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); return s; }
  function cardGeos() {
    if (texCache.cardGeo) return texCache.cardGeo;
    const shape = roundedRect(CW, CH, .07);
    const face = new T.ShapeGeometry(shape, 8), uv = face.attributes.uv, p = face.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (p.getX(i) + CW / 2) / CW, (p.getY(i) + CH / 2) / CH);
    const edge = new T.ExtrudeGeometry(shape, { depth: CT, bevelEnabled: false, curveSegments: 8 }); edge.translate(0, 0, -CT / 2);
    return (texCache.cardGeo = { face, edge });
  }
  // carta em pé (plano XY): verso em +Z, frente em -Z
  function makeCard(role, showcase = false) {
    const g = new T.Group(), geos = cardGeos(), u = { dis: { value: 0 }, edge: { value: col(ROLE_COLOR[role] || 0xffb347) } };
    const faceMat = r => {
      const t = cardTextures(r); const m = new T.MeshStandardMaterial({ map: t.map, roughnessMap: t.pbr, metalnessMap: t.pbr, roughness: 1, metalness: 1 });
      if (showcase) { m.emissive = new T.Color(0xffffff); m.emissiveMap = t.map; m.emissiveIntensity = .62; }
      dissolvable(m, u); return m;
    };
    const back = new T.Mesh(geos.face, faceMat(null)); back.position.z = CT / 2 + .0006;
    const front = new T.Mesh(geos.face, faceMat(role)); front.rotation.y = Math.PI; front.position.z = -CT / 2 - .0006;
    const edgeM = std(0xc99a3c, { metalness: 1, roughness: .35, map: whiteTex() }); dissolvable(edgeM, u);
    const edge = new T.Mesh(geos.edge, [hiddenMat(), edgeM]); // só as laterais (sem as tampas da extrusão)
    [back, front, edge].forEach(m => { m.castShadow = true; m.receiveShadow = true; g.add(m); });
    g.userData = { role, front, u };
    return g;
  }
  function setCardRole(card, role) {
    if (card.userData.role === role) return; card.userData.role = role;
    const t = cardTextures(role), m = card.userData.front.material; m.map = t.map; m.roughnessMap = m.metalnessMap = t.pbr; m.needsUpdate = true;
    card.userData.u.edge.value = col(ROLE_COLOR[role] || 0xffb347);
  }
  // carta deitada na mesa (verso para cima); flip=true mostra a frente
  function tableCard(role) { const h = new T.Group(), c = makeCard(role); c.rotation.x = -Math.PI / 2; h.add(c); h.userData.card = c; return h; }

  function coinMats() {
    if (texCache.coinM) return texCache.coinM;
    const face = canvasTex(256, 256, (c, w) => {
      const g = c.createRadialGradient(100, 90, 10, 128, 128, 128); g.addColorStop(0, '#ffe9a0'); g.addColorStop(1, '#c48a1c'); c.fillStyle = g; c.fillRect(0, 0, w, w);
    });
    const bump = canvasTex(256, 256, (c, w) => {
      c.fillStyle = '#000'; c.fillRect(0, 0, w, w); c.fillStyle = '#fff'; c.beginPath(); c.arc(128, 128, 128, 0, 7); c.fill(); c.fillStyle = '#333'; c.beginPath(); c.arc(128, 128, 104, 0, 7); c.fill();
      c.fillStyle = '#bbb'; for (let i = 0; i < 36; i++) { const a = i / 36 * Math.PI * 2; c.beginPath(); c.arc(128 + Math.cos(a) * 94, 128 + Math.sin(a) * 94, 4, 0, 7); c.fill(); }
      c.fillStyle = '#fff'; c.beginPath(); // coroa
      c.moveTo(70, 160); c.lineTo(62, 92); c.lineTo(95, 122); c.lineTo(128, 78); c.lineTo(161, 122); c.lineTo(194, 92); c.lineTo(186, 160); c.closePath(); c.fill();
      c.fillRect(70, 166, 116, 16); [62, 128, 194].forEach((x, i) => { c.beginPath(); c.arc(x, i === 1 ? 74 : 88, 9, 0, 7); c.fill(); });
    }, false);
    const reeds = canvasTex(64, 8, (c, w, h) => { for (let x = 0; x < w; x += 4) { c.fillStyle = '#fff'; c.fillRect(x, 0, 2, h); c.fillStyle = '#000'; c.fillRect(x + 2, 0, 2, h); } }, false);
    reeds.wrapS = T.RepeatWrapping; reeds.repeat.set(8, 1);
    const side = std(0xd9a032, { metalness: 1, roughness: .32, bumpMap: reeds, bumpScale: .004 });
    const top = new T.MeshStandardMaterial({ map: face, metalness: 1, roughness: .28, bumpMap: bump, bumpScale: .012 });
    return (texCache.coinM = [side, top, top]);
  }
  const coinGeo = () => texCache.coinGeo || (texCache.coinGeo = new T.CylinderGeometry(.16, .16, .036, 36));
  function coinModel() { const m = new T.Mesh(coinGeo(), coinMats()); m.castShadow = true; m.receiveShadow = true; return m; }

  function bladeModel(len = 1.1, color = 0xe8edf5, hiltColor = 0xd4a548, gem = 0xff2a3a) {
    const g = new T.Group();
    const s = new T.Shape(); s.moveTo(-.055, 0); s.lineTo(.055, 0); s.lineTo(.045, len * .85); s.quadraticCurveTo(.03, len * .97, 0, len + .14); s.quadraticCurveTo(-.03, len * .97, -.045, len * .85); s.closePath();
    const blade = new T.Mesh(new T.ExtrudeGeometry(s, { depth: .006, bevelEnabled: true, bevelSize: .018, bevelThickness: .016, bevelSegments: 2, curveSegments: 8 }), std(color, { metalness: 1, roughness: .12 }));
    blade.position.z = -.003;
    const fuller = new T.Mesh(new T.BoxGeometry(.016, len * .7, .04), std(0x8a919c, { metalness: 1, roughness: .3 })); fuller.position.y = len * .4;
    const guardC = new T.Mesh(new T.TorusGeometry(.2, .032, 8, 20, Math.PI), std(hiltColor, { metalness: 1, roughness: .25 })); guardC.rotation.z = Math.PI; guardC.position.y = .03; guardC.scale.y = .45;
    const grip = new T.Mesh(new T.CylinderGeometry(.034, .04, .3, 12), std(0x3a1d0c, { roughness: .8 })); grip.position.y = -.16;
    for (let i = 0; i < 5; i++) { const r = new T.Mesh(new T.TorusGeometry(.04, .008, 6, 14), guardC.material); r.rotation.x = Math.PI / 2; r.position.y = -.04 - i * .06; g.add(r); }
    const pommel = new T.Mesh(new T.SphereGeometry(.055, 16, 12), guardC.material); pommel.position.y = -.34;
    const stone = new T.Mesh(new T.SphereGeometry(.03, 12, 10), std(gem, { emissive: gem, emissiveIntensity: 2.5, roughness: .1 })); stone.position.set(0, -.34, .045);
    g.add(blade, fuller, guardC, grip, pommel, stone); g.traverse(m => m.isMesh && (m.castShadow = true));
    return g;
  }

  function chestModel() {
    const g = new T.Group(), wood = std(0x6b3a1f, { map: imgTex(IMG.cj_wood), roughness: .55 }), band = darkGold();
    const body = new T.Mesh(new T.BoxGeometry(1.3, .55, .78), wood); body.position.y = .3; g.add(body);
    for (const x of [-.5, 0, .5]) { const b = new T.Mesh(new T.BoxGeometry(.07, .57, .8), band); b.position.set(x, .3, 0); g.add(b); }
    const rim = new T.Mesh(new T.BoxGeometry(1.34, .06, .82), band); rim.position.y = .58; g.add(rim);
    // tampa aberta (meio cilindro)
    const lidG = new T.Group(); lidG.position.set(0, .58, -.39); lidG.rotation.x = -1.9; g.add(lidG);
    const lid = new T.Mesh(new T.CylinderGeometry(.39, .39, 1.3, 24, 1, false, 0, Math.PI), wood); lid.rotation.z = Math.PI / 2; lid.position.z = .39; lidG.add(lid);
    for (const x of [-.5, 0, .5]) { const b = new T.Mesh(new T.CylinderGeometry(.405, .405, .07, 24, 1, true, 0, Math.PI), band); b.rotation.z = Math.PI / 2; b.position.set(x, 0, .39); lidG.add(b); }
    const lock = new T.Mesh(new T.BoxGeometry(.16, .2, .05), band); lock.position.set(0, .44, .41); g.add(lock);
    // monte de ouro dentro do baú
    const heap = new T.Mesh(new T.SphereGeometry(.6, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), std(0xd9a032, { metalness: 1, roughness: .35, bumpMap: coinMats()[1].bumpMap, bumpScale: .01 }));
    heap.scale.set(1.02, .32, .6); heap.position.y = .52; g.add(heap);
    for (let i = 0; i < 18; i++) { const c = coinModel(); c.position.set(rand(-.5, .5), .6 + Math.random() * .1, rand(-.25, .25)); c.rotation.set(rand(-.6, .6), Math.random() * 7, rand(-.6, .6)); g.add(c); }
    for (let i = 0; i < 9; i++) { const c = coinModel(); const a = Math.random() * 7; c.position.set(Math.cos(a) * rand(.75, 1.1), .02, Math.sin(a) * rand(.5, .7)); c.rotation.set(rand(-.1, .1), Math.random() * 7, 0); g.add(c); }
    const glowL = new T.PointLight(0xffc35a, .9, 2.4, 2); glowL.position.set(0, 1, .2); g.add(glowL);
    g.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    g.userData.light = glowL;
    return g;
  }
  function candleModel(h = .55) {
    const g = new T.Group();
    const pts = [[0, 0], [.12, 0], [.12, h * .7], [.135, h * .74], [.12, h * .8], [.118, h], [.06, h + .02], [0, h + .02]].map(([x, y]) => new T.Vector2(x, y));
    const wax = new T.Mesh(new T.LatheGeometry(pts, 20), std(0xf1e2bd, { roughness: .6, emissive: 0x3a1a00, emissiveIntensity: .4 })); wax.position.y = .06; wax.castShadow = true;
    const dish = new T.Mesh(new T.LatheGeometry([[0, 0], [.26, 0], [.28, .05], [.2, .07], [.14, .07], [.14, .1], [0, .1]].map(([x, y]) => new T.Vector2(x, y)), 24), gold());
    const flameMat = new T.ShaderMaterial({
      uniforms: { uT: { value: 0 }, uS: { value: Math.random() * 10 } }, transparent: true, depthWrite: false, blending: T.AdditiveBlending,
      vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: NOISE + `uniform float uT, uS; varying vec2 vUv; void main(){ vec2 p=vUv-vec2(.5,.25); float n=fbm(vec2(p.x*3., p.y*3.-uT*3.+uS));
        p.x += (n-.5)*.18*vUv.y; float w=.22*(1.-vUv.y)*smoothstep(0.,.25,vUv.y)+.02; float d=abs(p.x)/w; float a=(1.-smoothstep(.4,1.,d))*smoothstep(1.,.55,vUv.y)*smoothstep(0.,.12,vUv.y);
        vec3 c=mix(vec3(1.,.35,.05), vec3(1.,.9,.6), 1.-d); c=mix(vec3(.2,.4,1.), c, smoothstep(.05,.25,vUv.y)); gl_FragColor=vec4(c*a*2.2, a); }`,
    });
    const flame = new T.Mesh(new T.PlaneGeometry(.2, .42), flameMat); flame.position.y = h + .27;
    const halo = new T.Sprite(new T.SpriteMaterial({ map: glowTex(), color: 0xff9a3c, transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: .55 })); halo.scale.set(1.1, 1.1, 1); halo.position.y = h + .2;
    const light = new T.PointLight(0xff9a3c, .8, 7, 1.8); light.position.y = h + .35;
    g.add(dish, wax, flame, halo, light); g.userData = { flame, light, halo, seed: Math.random() * 10 };
    candles.push(g); return g;
  }
  function candelabra() {
    const g = new T.Group(), m = darkGold();
    const stem = new T.Mesh(new T.LatheGeometry([[0, 0], [.45, 0], [.4, .08], [.12, .2], [.07, .3], [.07, 2.2], [.12, 2.3], [.07, 2.4], [0, 2.4]].map(([x, y]) => new T.Vector2(x, y)), 24), m);
    g.add(stem);
    const arm = new T.Mesh(new T.TorusGeometry(.5, .035, 8, 24, Math.PI), m); arm.position.y = 2.15; arm.rotation.z = Math.PI; g.add(arm);
    for (const x of [-.5, 0, .5]) { const c = candleModel(x ? .4 : .55); c.position.set(x, x ? 2.15 : 2.38, 0); g.add(c); }
    g.traverse(o => o.isMesh && (o.castShadow = true)); return g;
  }
  function gobletModel() {
    return new T.Mesh(new T.LatheGeometry([[0, 0], [.2, 0], [.2, .03], [.05, .08], [.04, .32], [.08, .38], [.19, .5], [.2, .7], [.18, .7], [.17, .52], [0, .44]].map(([x, y]) => new T.Vector2(x, y)), 28), gold());
  }

  // ---------- montagem da cena ----------
  function mount(container) {
    if (!window.THREE) return false;
    T = window.THREE; wrap = container;
    if (mounted) { if (canvas.parentNode !== wrap) wrap.prepend(canvas); resize(); return true; }
    try { renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }); } catch { return false; }
    renderer.setPixelRatio(Math.min(1.75, devicePixelRatio || 1));
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
    canvas = renderer.domElement; canvas.className = 'cj3d'; wrap.prepend(canvas);
    scene = new T.Scene(); scene.background = new T.Color(0x0b0604); scene.fog = new T.FogExp2(0x120a06, .02);
    camera = new T.PerspectiveCamera(36, 1, .1, 120);

    // reflexos: ambiente gerado (salão escuro com janelas de luz quente)
    const envS = new T.Scene(); envS.add(new T.Mesh(new T.BoxGeometry(30, 14, 30), new T.MeshBasicMaterial({ color: 0x1c120b, side: T.BackSide })));
    [[0, 6.5, 0, 0xffd9a0, 6, 8, 3], [-14, 3, 0, 0xff9a40, 2.2, 4, 6], [14, 3, -4, 0xff9a40, 2.2, 4, 6], [0, 3, -14, 0x8aa0ff, .6, 10, 3]].forEach(([x, y, z, c, k, w, h]) => {
      const m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ color: new T.Color(c).multiplyScalar(k), side: T.DoubleSide })); m.position.set(x, y, z); m.lookAt(0, 0, 0); envS.add(m);
    });
    const pm = new T.PMREMGenerator(renderer); scene.environment = pm.fromScene(envS, .04).texture; pm.dispose();

    // luz: foco quente sobre a mesa, velas, contraluz azulado
    scene.add(new T.HemisphereLight(0xffd8a8, 0x0d0704, .28));
    const spot = new T.SpotLight(0xffe2b8, 1.6, 40, .62, .75, 1.2); spot.position.set(.5, 13, 3.5); spot.target.position.set(0, 0, .3);
    spot.castShadow = true; spot.shadow.mapSize.set(2048, 2048); spot.shadow.bias = -.0004; spot.shadow.camera.near = 4; spot.shadow.camera.far = 25;
    scene.add(spot, spot.target);
    const rim = new T.DirectionalLight(0x7d93ff, .35); rim.position.set(-4, 6, -10); scene.add(rim);

    // fundo: salão do trono
    hall = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshBasicMaterial({
      map: imgTex(IMG.cj_hall), color: 0x9a8a7c, fog: false, depthWrite: false, transparent: true,
      alphaMap: canvasTex(4, 256, (c, w, h) => { const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#fff'); g.addColorStop(.72, '#fff'); g.addColorStop(1, '#000'); c.fillStyle = g; c.fillRect(0, 0, w, h); }, false),
    }));
    hall.renderOrder = -1; camera.add(hall); scene.add(camera);
    const floor = new T.Mesh(new T.CircleGeometry(15, 64), std(0x2a1d14, { roughness: .85, map: imgTex(IMG.cj_wood, 4), transparent: true,
      alphaMap: canvasTex(256, 256, (c, w) => { const g = c.createRadialGradient(w / 2, w / 2, w * .2, w / 2, w / 2, w / 2); g.addColorStop(0, '#fff'); g.addColorStop(1, '#000'); c.fillStyle = g; c.fillRect(0, 0, w, w); }, false) }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -1.6; floor.receiveShadow = true; scene.add(floor);

    // mesa: tampo de feltro, borda de mogno arredondada, friso de latão, saia
    const RX = 6.3, RZ = 4.05, IN = .5;
    const felt = imgTex(IMG.cj_felt); felt.wrapS = felt.wrapT = T.RepeatWrapping;
    const top = new T.Mesh(new T.CircleGeometry(1, 96), std(0x2c8a55, { map: felt, roughness: .95 }));
    { const uv = top.geometry.attributes.uv, p = top.geometry.attributes.position; for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i) * RX / 2.2, p.getY(i) * RZ / 2.2); }
    top.rotation.x = -Math.PI / 2; top.scale.set(RX - IN, RZ - IN, 1); top.receiveShadow = true; scene.add(top); tableParts.push(top);
    // anel dourado e emblema pintados no feltro
    const deco = new T.Mesh(new T.CircleGeometry(1, 96), new T.MeshStandardMaterial({
      transparent: true, roughness: .4, metalness: .9, color: 0xe2b04a, depthWrite: false,
      alphaMap: canvasTex(1024, 1024, (c, w) => {
        c.fillStyle = '#000'; c.fillRect(0, 0, w, w); c.strokeStyle = '#fff'; c.translate(w / 2, w / 2);
        c.lineWidth = 7; c.beginPath(); c.ellipse(0, 0, w * .44, w * .44, 0, 0, 7); c.stroke(); c.lineWidth = 2.5; c.beginPath(); c.ellipse(0, 0, w * .425, w * .425, 0, 0, 7); c.stroke();
        for (let i = 0; i < 48; i++) { const a = i / 48 * Math.PI * 2; c.fillStyle = '#fff'; c.beginPath(); c.arc(Math.cos(a) * w * .455, Math.sin(a) * w * .455, 4, 0, 7); c.fill(); }
        c.globalAlpha = .55; c.font = `${w * .18}px serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#fff'; c.fillText('♛', 0, w * .01);
      }, false),
    }));
    deco.rotation.x = -Math.PI / 2; deco.scale.set(RX - IN, RZ - IN, 1); deco.position.y = .004; scene.add(deco); tableParts.push(deco);
    const ring = new T.Shape(); ring.absellipse(0, 0, RX, RZ, 0, Math.PI * 2, false); const hole = new T.Path(); hole.absellipse(0, 0, RX - IN, RZ - IN, 0, Math.PI * 2, true); ring.holes.push(hole);
    const woodT = imgTex(IMG.cj_wood); woodT.wrapS = woodT.wrapT = T.RepeatWrapping; woodT.repeat.set(.12, .12);
    const railM = std(0x7a3a1c, { map: woodT, roughness: .32, metalness: 0 });
    const rail = new T.Mesh(new T.ExtrudeGeometry(ring, { depth: .1, bevelEnabled: true, bevelThickness: .1, bevelSize: .12, bevelSegments: 5, curveSegments: 96 }), railM);
    rail.rotation.x = -Math.PI / 2; rail.position.y = .02; rail.castShadow = true; rail.receiveShadow = true; scene.add(rail); tableParts.push(rail);
    const inlay = new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(Array.from({ length: 96 }, (_, i) => { const a = i / 96 * Math.PI * 2; return new T.Vector3(Math.cos(a) * (RX - .2), .245, Math.sin(a) * (RZ - .2)); }), true), 192, .025, 6, true), gold());
    scene.add(inlay); tableParts.push(inlay);
    const skirt = new T.Mesh(new T.CylinderGeometry(1, .93, 1.6, 96, 1, true), railM); skirt.scale.set(RX - .05, 1, RZ - .05); skirt.position.y = -.82; skirt.receiveShadow = true; scene.add(skirt); tableParts.push(skirt);
    // pedestais torneados até o chão
    const legM = std(0x5a2a14, { map: woodT, roughness: .4 });
    for (const x of [-3.2, 3.2]) {
      const leg = new T.Mesh(new T.LatheGeometry([[0, 0], [1.3, 0], [1.25, .12], [.7, .3], [.42, .5], [.5, .75], [.32, 1.0], [.3, 1.2], [.55, 1.45], [.9, 1.6], [0, 1.6]].map(([r, y]) => new T.Vector2(r, y)), 32), legM);
      leg.position.set(x, -1.6, 0); leg.scale.set(1, .8, .8); leg.castShadow = true; scene.add(leg); tableParts.push(leg);
      const band = new T.Mesh(new T.TorusGeometry(.42, .04, 8, 32), darkGold()); band.rotation.x = Math.PI / 2; band.position.set(x, -1.2, 0); scene.add(band); tableParts.push(band);
    }

    // centro da mesa: baralho da Corte, baú do Tesouro, velas e taça
    deckGroup = new T.Group(); deckGroup.position.set(-1.45, 0, -.55); scene.add(deckGroup);
    chest = chestModel(); chest.position.set(1.55, 0, -.75); chest.rotation.y = -.25; scene.add(chest);
    [[-.15, -1.45, .55], [.18, -1.25, .38], [.35, -1.6, .45]].forEach(([x, z, h]) => { const c = candleModel(h); c.position.set(x, 0, z); scene.add(c); tableProps.push(c); });
    const gob = gobletModel(); gob.position.set(-.55, 0, -1.4); gob.castShadow = true; scene.add(gob); tableProps.push(gob);
    // candelabros ao lado da mesa
    for (const x of [-8.2, 8.2]) { const c = candelabra(); c.position.set(x, -1.6, -2.2); scene.add(c); }

    // poeira dourada flutuando na luz
    const dn = 260, dp = new Float32Array(dn * 3); for (let i = 0; i < dn; i++) dp.set([rand(-9, 9), rand(0, 7), rand(-6, 6)], i * 3);
    const dg = new T.BufferGeometry(); dg.setAttribute('position', new T.BufferAttribute(dp, 3));
    dust = new T.Points(dg, new T.PointsMaterial({ size: .05, map: glowTex(), color: 0xffd9a0, transparent: true, opacity: .35, depthWrite: false, blending: T.AdditiveBlending })); scene.add(dust);

    glow = particleSystem(5000, glowFS, T.AdditiveBlending); smoke = particleSystem(900, smokeFS, T.NormalBlending);
    scene.add(smoke.pts, glow.pts);

    // pós-processamento: bloom + ACES + vinheta + flash (se os scripts estiverem disponíveis)
    if (T.EffectComposer && T.UnrealBloomPass && T.ShaderPass) {
      const rt = new T.WebGLRenderTarget(2, 2, { type: T.HalfFloatType, minFilter: T.LinearFilter, magFilter: T.LinearFilter, format: T.RGBAFormat });
      composer = new T.EffectComposer(renderer, rt);
      composer.addPass(new T.RenderPass(scene, camera));
      bloom = new T.UnrealBloomPass(new T.Vector2(256, 256), .32, .45, .9); composer.addPass(bloom);
      post = new T.ShaderPass({
        uniforms: { tDiffuse: { value: null }, uT: { value: 0 }, uFlash: { value: 0 }, uFC: { value: new T.Color(1, 1, 1) }, uVig: { value: vig }, uSat: { value: 1 }, uAb: { value: 0 } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
        fragmentShader: `uniform sampler2D tDiffuse; uniform float uT,uFlash,uVig,uSat,uAb; uniform vec3 uFC; varying vec2 vUv;
          vec3 aces(vec3 x){ return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.); }
          void main(){ vec2 d=vUv-.5; vec3 c;
            if(uAb>0.0001){ c.r=texture2D(tDiffuse,vUv+d*uAb).r; c.g=texture2D(tDiffuse,vUv).g; c.b=texture2D(tDiffuse,vUv-d*uAb).b; } else c=texture2D(tDiffuse,vUv).rgb;
            c=aces(c*1.25); float l=dot(c,vec3(.299,.587,.114)); c=mix(vec3(l),c,uSat);
            c*=vec3(1.04,1.,.94); c+=uFC*uFlash*(.15+l*.85);
            c*=mix(1.-uVig,1.,smoothstep(.95,.2,length(d*vec2(1.25,1.))));
            c=pow(max(c,0.),vec3(1./2.2)); c+=(fract(sin(dot(vUv*(uT+1.),vec2(12.9898,78.233)))*43758.5453)-.5)*.022;
            gl_FragColor=vec4(c,1.); }`,
      });
      composer.addPass(post);
      renderer.toneMapping = T.NoToneMapping; renderer.outputEncoding = T.LinearEncoding;
    } else { renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15; renderer.outputEncoding = T.sRGBEncoding; }

    [null, ...Object.keys(ROLE_COLOR)].forEach(r => cardTextures(r)); // pré-carrega as cartas
    new ResizeObserver(resize).observe(wrap); resize();
    mounted = true; return true;
  }
  function resize() {
    if (!renderer || !wrap) return;
    const w = wrap.clientWidth, h = wrap.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false); canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
    if (composer) composer.setSize(w, h);
    const asp = w / h; camera.aspect = asp; camera.fov = asp < 1.2 ? 48 : 36;
    camDist = Math.min(1.8, Math.max(1, (asp < 1.2 ? 1.25 : 1.7) / asp));
    camera.updateProjectionMatrix(); placeCam(0);
    { // fundo: cobre a parte de cima da tela, a 40 unidades da câmera
      const D = 40, hh = D * Math.tan(camera.fov * Math.PI / 360), hw = hh * asp, W = Math.max(hw * 2.1, hh * 1.5 * 1.75), H = W / 1.75;
      hall.scale.set(W, H, 1); hall.position.set(0, hh - H / 2 + hh * .08, -D);
    }
    const sc = .65 * h * renderer.getPixelRatio() / (2 * Math.tan(camera.fov * Math.PI / 360));
    glow && (glow.mat.uniforms.uScale.value = sc); smoke && (smoke.mat.uniforms.uScale.value = sc);
    layoutCb?.();
  }
  function placeCam(s) {
    for (const k of ['x', 'y', 'z', 'zoom']) look[k] += (lookTo[k] - look[k]) * .06;
    const base = new T.Vector3(Math.sin(s * .12) * .3, 7.4 * camDist, 9.6 * camDist), tgt = new T.Vector3(look.x, look.y, look.z);
    base.lerp(tgt, look.zoom * .12);
    camera.position.set(base.x + (Math.random() - .5) * shake * .4, base.y + (Math.random() - .5) * shake * .4, base.z);
    camera.lookAt(tgt);
  }
  let frames = 0, slowFrames = 0;
  function loop(t) {
    raf = requestAnimationFrame(loop);
    frame(Math.min(.05, (t - (lastT || t)) / 1000), t); lastT = t;
  }
  // avança a animação quadro a quadro (testes: tira fotos de momentos exatos)
  async function advance(ms) {
    cancelAnimationFrame(raf); let t = lastT || performance.now();
    for (let e = 0; e < ms; e += 1000 / 60) { t += 1000 / 60; frame(1 / 60, t); for (let i = 0; i < 12; i++) await null; }
    lastT = t;
  }
  function frame(dt, t) {
    clock += dt * 1000 * (paused ? 0 : 1);
    tickers.forEach(f => f(dt));
    const s = t / 1000, ts = timeScale();
    glow.update(dt * ts); smoke.update(dt * ts);
    for (const c of candles) {
      const u = c.userData, f = .85 + Math.sin(s * 9 + u.seed) * .07 + Math.sin(s * 23 + u.seed * 2) * .05;
      u.light.intensity = .8 * f; u.halo.material.opacity = .45 * f; u.flame.material.uniforms.uT.value = s;
      u.flame.quaternion.copy(camera.quaternion);
    }
    chest.userData.light.intensity = .7 + Math.sin(s * 2) * .15;
    const dp = dust.geometry.attributes.position.array; for (let i = 0; i < dp.length; i += 3) { dp[i + 1] += .002; dp[i] += Math.sin(s + i) * .001; if (dp[i + 1] > 7) dp[i + 1] = 0; } dust.geometry.attributes.position.needsUpdate = true;
    shake *= .88; flash *= .86; aberr *= .9;
    placeCam(s);
    if (composer) {
      post.uniforms.uT.value = s % 10; post.uniforms.uFlash.value = flash; post.uniforms.uFC.value = flashCol || post.uniforms.uFC.value;
      post.uniforms.uAb.value = aberr; post.uniforms.uSat.value += ((clock < slowUntil ? .8 : 1) - post.uniforms.uSat.value) * .1;
      composer.render();
    } else renderer.render(scene, camera);
    // qualidade adaptativa: se ficar lento, reduz a resolução
    if (++frames % 90 === 0) { if (slowFrames > 45 && renderer.getPixelRatio() > 1) { renderer.setPixelRatio(1); composer?.setPixelRatio(1); resize(); } slowFrames = 0; }
    if (dt > .028) slowFrames++;
  }
  function show(on) { active = !!on && mounted; if (!mounted) return; canvas.style.display = active ? '' : 'none'; cancelAnimationFrame(raf); lastT = 0; if (active) { resize(); raf = requestAnimationFrame(loop); } }
  function supported() { if (!window.THREE) return false; try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; } }

  // ---------- assentos ----------
  function seatAngle(rel, n) { return Math.PI / 2 + (rel / n) * Math.PI * 2; }
  function setup(view) {
    for (const g of Object.values(cardsOf)) g.forEach(m => scene.remove(m));
    for (const s of Object.values(stacksOf)) scene.remove(s);
    cardsOf = {}; stacksOf = {}; seats = [];
    const n = view.players.length, myIdx = Math.max(0, view.players.findIndex(p => p.id === view.me)), up = new T.Vector3(0, 1, 0);
    view.players.forEach((p, k) => {
      const rel = (k - myIdx + n) % n, a = seatAngle(rel, n);
      const anchor = new T.Vector3(Math.cos(a) * 4.55, 0, Math.sin(a) * 2.85);
      const label = new T.Vector3(Math.cos(a) * 7.2, .4, Math.sin(a) * 4.75);
      const yaw = -a - Math.PI / 2;
      seats.push({ id: p.id, a, anchor, label, yaw });
      cardsOf[p.id] = [0, 1].map(i => {
        const m = tableCard(null), off = new T.Vector3(i ? .5 : -.5, 0, 0).applyAxisAngle(up, yaw);
        m.position.copy(anchor).add(off).setY(.012 + i * .003); m.rotation.y = yaw + (i ? .07 : -.07); scene.add(m); m.userData.home = m.position.clone(); return m;
      });
      const st = new T.Group(); st.position.copy(anchor).add(new T.Vector3(1.25, 0, .1).applyAxisAngle(up, yaw)); scene.add(st); stacksOf[p.id] = st;
    });
  }
  const seatOf = id => seats.find(s => s.id === id);
  function setStack(id, n) {
    const st = stacksOf[id]; if (!st) return;
    const shown = Math.min(n, 20);
    while (st.children.length > shown) st.remove(st.children[st.children.length - 1]);
    while (st.children.length < shown) {
      const c = coinModel(), i = st.children.length, pile = Math.floor(i / 10), h = i % 10;
      c.position.set(pile * .36 + rand(-.015, .015), .02 + h * .037, (pile ? .12 : 0) + rand(-.015, .015)); c.rotation.y = Math.random() * 7; st.add(c);
    }
  }
  function sync(view) {
    if (!mounted) return;
    lastView = view;
    if (flipping) return; // a mesa está virada: arruma tudo quando voltar
    if (seats.length !== view.players.length || view.players.some(p => !seatOf(p.id))) setup(view);
    for (const p of view.players) {
      const ms = cardsOf[p.id]; if (!ms) continue;
      p.cards.forEach((c, i) => {
        const m = ms[i]; if (!m || m.userData.busy) return;
        const card = m.userData.card;
        if (c.up) { setCardRole(card, c.role); m.rotation.z = Math.PI; card.userData.front.material.color.setHex(0x6a6a6a); m.position.y = .03; }
        else { m.rotation.z = 0; card.userData.front.material.color.setHex(0xffffff); }
        m.visible = !p.out || c.up;
      });
      if (!animating) setStack(p.id, p.coins);
    }
    const count = Math.min(view.deck.count ?? view.deck.length ?? 0, 15);
    while (deckGroup.children.length > count) deckGroup.remove(deckGroup.children[deckGroup.children.length - 1]);
    while (deckGroup.children.length < count) { const c = tableCard(null), i = deckGroup.children.length; c.position.set(rand(-.02, .02), .012 + i * .018, rand(-.02, .02)); c.rotation.y = rand(-.06, .06); deckGroup.add(c); }
  }
  function labelPos(id) {
    const s = seatOf(id); if (!s || !mounted) return null;
    camera.updateMatrixWorld(); const p = s.label.clone().project(camera);
    const W = wrap.clientWidth, H = wrap.clientHeight, cl = (v, a, b) => Math.max(a, Math.min(b, v));
    return { x: cl((p.x + 1) / 2 * W, 58, W - 58), y: cl((1 - p.y) / 2 * H, 70, H - 60) };
  }

  // ---------- efeitos básicos ----------
  const seatPos = id => (seatOf(id)?.anchor.clone() || new T.Vector3());
  const STAGE = () => new T.Vector3(look.x, .3, look.z).lerp(camera.position, .63); // ponto de destaque entre a mesa e a câmera
  const CHEST = () => chest.position.clone().setY(.75);
  function addSprite(tex, color, scale, pos) { const s = new T.Sprite(new T.SpriteMaterial({ map: tex, color, transparent: true, depthWrite: false, blending: T.AdditiveBlending })); s.scale.set(scale, scale, 1); if (pos) s.position.copy(pos); scene.add(s); return s; }
  function lightPulse(pos, color, power = 4, ms = 700, dist = 10) { const l = new T.PointLight(color, power, dist, 1.6); l.position.copy(pos); scene.add(l); return tween(ms, k => { l.intensity = power * (1 - easeOut(k)); if (k >= 1) scene.remove(l); }); }
  function shockwave(pos, color, maxR = 3, ms = 700, flat = true) {
    const m = new T.Mesh(new T.PlaneGeometry(2, 2), new T.ShaderMaterial({
      uniforms: { uR: { value: 0 }, uC: { value: col(color) }, uA: { value: 1 } }, transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide,
      vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: 'uniform float uR,uA; uniform vec3 uC; varying vec2 vUv; void main(){ float d=length(vUv-.5)*2.; float r=smoothstep(uR*.75,uR,d)*smoothstep(uR+.02,uR,d); gl_FragColor=vec4(uC*r*1.8*uA, r*uA); }',
    }));
    m.position.copy(pos); if (flat) m.rotation.x = -Math.PI / 2; else m.lookAt(camera.position); scene.add(m);
    if (flat) maxR *= .7;
    return tween(ms, k => { const e = easeOut(k); m.scale.setScalar(maxR); m.material.uniforms.uR.value = e * .95; m.material.uniforms.uA.value = 1 - k; if (k >= 1) scene.remove(m); });
  }
  function runeCircle(pos, color, size = 2.2, ms = 1600, flat = true, op = 1) {
    const m = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshBasicMaterial({ map: runeTex(), color: col(color).multiplyScalar(1.3), transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide }));
    m.position.copy(pos); if (flat) m.rotation.x = -Math.PI / 2; scene.add(m);
    const p = tween(ms, (k, dt) => { const a = k < .2 ? k / .2 : k > .75 ? (1 - k) / .25 : 1; m.scale.setScalar(size * (.6 + .4 * easeOut(Math.min(1, k * 4)))); m.material.opacity = a * op; if (flat) m.rotation.z += dt * 1.4; else { m.lookAt(camera.position); m.rotateZ(k * 3); } if (k >= 1) scene.remove(m); });
    return p;
  }
  function beam(pos, color, h = 6, w = .9, ms = 1200) { // coluna de luz vinda de cima
    const m = new T.Mesh(new T.CylinderGeometry(w, w * .6, h, 24, 1, true), new T.ShaderMaterial({
      uniforms: { uC: { value: col(color) }, uA: { value: 0 } }, transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide,
      vertexShader: 'varying vec2 vUv; varying vec3 vN, vV; void main(){ vUv=uv; vN=normalize(normalMatrix*normal); vec4 mv=modelViewMatrix*vec4(position,1.); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }',
      fragmentShader: 'uniform vec3 uC; uniform float uA; varying vec2 vUv; varying vec3 vN, vV; void main(){ float f=pow(abs(dot(vN,vV)),2.); float a=f*smoothstep(0.,.25,vUv.y)*smoothstep(1.,.5,vUv.y)*uA; gl_FragColor=vec4(uC*a*2.,a); }',
    }));
    m.position.copy(pos).setY(h / 2); scene.add(m);
    return tween(ms, k => { m.material.uniforms.uA.value = k < .15 ? k / .15 : 1 - (k - .15) / .85; m.scale.x = m.scale.z = 1 + k * .3; if (k >= 1) scene.remove(m); });
  }
  async function coinFly(from, to, n, { stagger = 70, color = 0xffd56b, h = 2.2 } = {}) {
    const all = [];
    for (let i = 0; i < n; i++) {
      all.push(wait(i * stagger).then(async () => {
        const c = coinModel(); c.scale.setScalar(1.35); scene.add(c);
        const a = from.clone().add(new T.Vector3(rand(-.25, .25), 0, rand(-.25, .25))), b = to.clone().add(new T.Vector3(rand(-.12, .12), .1, rand(-.12, .12)));
        const tr = trail(c, color, .06, 14), hh = h * rand(.8, 1.2);
        await tween(rand(560, 720), k => {
          const e = ease(k); c.position.lerpVectors(a, b, e); c.position.y = a.y + (b.y - a.y) * e + Math.sin(Math.PI * k) * hh;
          c.rotation.x = k * 14; c.rotation.z = k * 4;
          if (Math.random() < .3) glow.emit({ pos: c.position, n: 1, speed: [.1, .4], life: [.3, .6], size: [.12, 0], color, gravity: 0 });
        });
        scene.remove(c); tr.end(); SFX.coinPing?.(i);
        glow.emit({ pos: b, n: 8, speed: [.6, 1.6], life: [.2, .45], size: [.12, 0], color: 0xffe9a0, gravity: -3, shape: 'disc', up: .8 });
      }));
    }
    await Promise.all(all);
  }

  // ponto na borda que está queimando (o dissolver varre de cima para baixo)
  const burnEdge = (card, d) => { const v = Math.min(1, Math.max(0, 1 - (d - .2) / .55)); return new T.Vector3(rand(-CW / 2, CW / 2), (v - .5) * CH + rand(-.06, .06), 0).applyMatrix4(card.matrixWorld); };

  // ---------- carta apresentada (estilo Hearthstone/Runeterra) ----------
  // sobe da mesa do jogador, vira mostrando a frente, voa em arco até o destaque, "bate" com onda de energia,
  // fica flutuando com brilho de foil e, no fim, se desfaz em brasas na cor do personagem
  async function presentCard(actorId, role, during) {
    const color = ROLE_COLOR[role] || 0xffd56b;
    const holder = new T.Group(), card = makeCard(role, true); holder.add(card); scene.add(holder);
    const rays = addSprite(raysTex(), color, .1); rays.material.opacity = 0; rays.renderOrder = 4;
    const halo = addSprite(glowTex(), color, .1); halo.material.opacity = 0;
    const from = seatPos(actorId).setY(.15), to = STAGE();
    const ctrl = from.clone().lerp(to, .5).add(new T.Vector3(0, 2.2, 0));
    const tr = trail(holder, color, .16, 18);
    SFX.cardWhoosh?.();
    const q0 = new T.Quaternion().setFromEuler(new T.Euler(-Math.PI / 2, seatOf(actorId)?.yaw || 0, 0));
    await tween(720, (k, dt) => {
      const e = easeOut(k), u = 1 - e;
      holder.position.set(u * u * from.x + 2 * u * e * ctrl.x + e * e * to.x, u * u * from.y + 2 * u * e * ctrl.y + e * e * to.y, u * u * from.z + 2 * u * e * ctrl.z + e * e * to.z);
      holder.lookAt(camera.position); holder.rotateY(Math.PI + (1 - e) * Math.PI * 2); holder.rotateZ(Math.sin(k * Math.PI) * .35);
      const q1 = holder.quaternion.clone(); holder.quaternion.copy(q0).slerp(q1, Math.min(1, k * 1.6));
      holder.scale.setScalar(.6 + .55 * e);
      if (Math.random() < .6) glow.emit({ pos: holder.position, n: 1, speed: [.2, .8], life: [.3, .7], size: [.1, 0], color, gravity: .5 });
      void dt;
    });
    tr.end();
    // impacto
    SFX.cardReveal?.(role); impact(color, .12, .25);
    glow.emit({ pos: to, n: 70, speed: [1.5, 4.5], life: [.4, .9], size: [.12, 0], color: 0xffffff, color2: color, gravity: -1, drag: 2.5 });
    shockwave(to, color, 3.2, 600, false); lightPulse(to.clone().setY(1), color, 3, 900, 10);
    const rc = runeCircle(to.clone().add(camera.position.clone().sub(to).normalize().multiplyScalar(-.25)), color, 2.4, 2200, false, .55);
    // flutuar com brilho de foil
    const sheen = new T.Mesh(new T.PlaneGeometry(CW, CH), new T.ShaderMaterial({
      uniforms: { uP: { value: -1 } }, transparent: true, depthWrite: false, blending: T.AdditiveBlending,
      vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: 'uniform float uP; varying vec2 vUv; void main(){ float d=abs((vUv.x+vUv.y*.6)-uP); float a=smoothstep(.12,0.,d)*.55; gl_FragColor=vec4(vec3(1.,.95,.8)*a,a); }',
    }));
    sheen.position.z = -CT - .004; sheen.rotation.y = Math.PI; card.add(sheen);
    const hold = tween(1500, (k, dt) => {
      holder.position.copy(to).add(new T.Vector3(0, Math.sin(k * Math.PI * 2) * .05, 0));
      holder.lookAt(camera.position); holder.rotateY(Math.PI + Math.sin(k * 6) * .06); holder.rotateX(Math.sin(k * 4) * .04);
      holder.scale.setScalar(1.15 + backOut(Math.min(1, k * 5)) * .05 - .05);
      rays.position.copy(to).add(camera.position.clone().sub(to).normalize().multiplyScalar(-.3));
      rays.scale.setScalar(3.6 * Math.min(1, k * 4)); rays.material.opacity = Math.min(1, k * 4) * .32; rays.material.rotation += dt * .25;
      halo.position.copy(rays.position); halo.scale.setScalar(2.6 * Math.min(1, k * 3)); halo.material.opacity = .35;
      sheen.material.uniforms.uP.value = -.3 + k * 2.2;
    });
    if (during) await Promise.all([hold, during(to)]); else await hold;
    // dissolver em brasas
    SFX.dissolve?.();
    const u = card.userData.u;
    await tween(1000, k => {
      u.dis.value = k * 1.05; holder.position.y = to.y + k * .15;
      glow.emit({ box: () => burnEdge(card, u.dis.value), pos: to, n: 2, speed: [.2, .7], dir: new T.Vector3(0, 1, 0), spread: .7, life: [.5, 1], size: [.09, 0], color: 0xffc070, color2: color, gravity: 1, drag: .8, alpha: .8 });
      rays.material.opacity = .32 * (1 - k); halo.material.opacity = .35 * (1 - k);
    });
    [holder, rays, halo].forEach(o => scene.remove(o)); await rc;
  }

  // ---------- efeitos de cada personagem ----------
  async function tesoureiroRain(actorId) {
    const p = seatPos(actorId);
    SFX.coinShower?.(); runeCircle(p.clone().setY(.03), ROLE_COLOR.tesoureiro, 2.6, 1800);
    chest.userData.light.intensity = 4; lightPulse(CHEST(), 0xffc35a, 6, 1200);
    glow.emit({ pos: CHEST(), n: 70, speed: [2, 4.5], dir: new T.Vector3(0, 1, 0), spread: .5, life: [.8, 1.4], size: [.18, 0], color: 0xfff0b0, color2: 0xffb020, gravity: -5 });
    await coinFly(CHEST(), p, 10, { stagger: 55, color: 0xffd56b, h: 2.8 });
    glow.emit({ pos: p.clone().setY(.4), n: 60, speed: [.5, 2], dir: new T.Vector3(0, 1, 0), spread: .9, life: [.8, 1.6], size: [.2, 0], color: 0xd9b0ff, color2: ROLE_COLOR.tesoureiro, gravity: .8 });
    shockwave(p.clone().setY(.05), ROLE_COLOR.tesoureiro, 3, 700);
  }
  async function sicarioStrike(targetId) {
    const t = seatPos(targetId), sky = t.clone().add(new T.Vector3(0, 3.2, .4));
    focus(t, 1.8, 1700); vig = .8; setTimeout(() => (vig = .55), 1600);
    // fumaça vermelha onde a adaga se materializa
    smoke.emit({ pos: sky, n: 30, speed: [.2, .7], life: [.8, 1.4], size: [.8, 1.6], color: 0x070203, gravity: .3, alpha: .55 });
    glow.emit({ pos: sky, n: 24, speed: [.4, 1.2], life: [.3, .7], size: [.12, 0], color: ROLE_COLOR.sicario, gravity: 0 });
    const d = bladeModel(1.15, 0xcfd5de, 0x2a2a30, ROLE_COLOR.sicario); d.position.copy(sky); d.rotation.x = Math.PI; d.scale.setScalar(.01); scene.add(d);
    SFX.whoosh?.();
    await tween(380, k => { d.scale.setScalar(1.7 * backOut(k)); d.rotation.y = (1 - k) * 4; });
    const tr = trail(d, ROLE_COLOR.sicario, .14, 18); slowmo(500, .35);
    const from = d.position.clone(), to = t.clone().setY(.75);
    await tween(240, k => { d.position.lerpVectors(from, to, easeIn(k)); });
    SFX.slash?.(); impact(ROLE_COLOR.sicario, .5, .9);
    // talho em X
    for (const [r, dl] of [[-.75, 0], [.75, 90]]) wait(dl).then(() => { const s = addSprite(slashTex(), 0xff5a5a, .1, t.clone().setY(.9)); s.material.rotation = r; tween(380, k => { s.scale.set(2.6 * easeOut(Math.min(1, k * 2)), 1.3, 1); s.material.opacity = 1 - easeIn(k); if (k >= 1) scene.remove(s); }); });
    glow.emit({ pos: to, n: 90, speed: [2, 6], life: [.25, .6], size: [.1, 0], color: 0xffe0e0, color2: ROLE_COLOR.sicario, gravity: -6, drag: 1.5 });
    smoke.emit({ pos: to, n: 18, speed: [.3, 1], life: [.8, 1.5], size: [.5, 1.2], color: 0x0a0203, gravity: .4, alpha: .5 });
    shockwave(t.clone().setY(.04), ROLE_COLOR.sicario, 2.6, 500); lightPulse(to, ROLE_COLOR.sicario, 4, 600);
    (cardsOf[targetId] || []).forEach(m => { const y = m.position.y; tween(400, k => { m.position.y = y + Math.sin(k * Math.PI * 4) * .04 * (1 - k); }); });
    tr.end(); await wait(250);
    await tween(350, k => { d.scale.setScalar(1.7 * (1 - k)); if (k >= 1) scene.remove(d); });
  }
  async function corsarioStrike(fromId, actorId, n) {
    const t = seatPos(fromId), a = seatPos(actorId);
    const s = bladeModel(1.5, 0xe2e6ee, 0xd4a548, ROLE_COLOR.corsario); s.scale.setScalar(.9); scene.add(s);
    const tr = trail(s, ROLE_COLOR.corsario, .25, 22); SFX.whoosh?.();
    const p0 = a.clone().setY(1.2), p1 = t.clone().setY(.9);
    await tween(520, k => { const e = ease(k); s.position.lerpVectors(p0, p1, e); s.position.y += Math.sin(k * Math.PI) * 1.2; s.rotation.set(Math.PI / 2, 0, k * Math.PI * 6); });
    SFX.swordClash?.(); impact(ROLE_COLOR.corsario, .35, .45);
    const sl = addSprite(slashTex(), 0xffb070, .1, t.clone().setY(.9)); sl.material.rotation = -.35;
    tween(380, k => { sl.scale.set(2.8 * easeOut(Math.min(1, k * 2)), 1.4, 1); sl.material.opacity = 1 - easeIn(k); if (k >= 1) scene.remove(sl); });
    glow.emit({ pos: p1, n: 80, speed: [2, 5], life: [.3, .7], size: [.14, 0], color: 0xfff1c0, color2: ROLE_COLOR.corsario, gravity: -6 });
    await tween(380, k => { s.position.lerpVectors(p1, p0, ease(k)); s.rotation.z += .4; s.scale.setScalar(.9 * (1 - k)); });
    scene.remove(s); tr.end();
    if (n) await coinFly(t.clone().setY(.3), a, n, { stagger: 140, color: ROLE_COLOR.corsario });
  }
  async function courtSwirl(actorId, n, color) {
    const a = seatPos(actorId), dp = deckGroup.position.clone();
    SFX.magic?.(); runeCircle(a.clone().setY(.03), color, 2.8, 2000); runeCircle(dp.clone().setY(.4), color, 1.8, 1400);
    const cards = [], trs = [];
    for (let i = 0; i < n; i++) { const c = tableCard(null); c.position.copy(dp).setY(.4); scene.add(c); cards.push(c); trs.push(trail(c, color, .18, 20)); }
    await tween(1300, k => cards.forEach((c, i) => {
      const ang = k * Math.PI * 4 + i * Math.PI * 2 / n, r = Math.sin(k * Math.PI) * 1.2, e = ease(k);
      c.position.set(dp.x + (a.x - dp.x) * e + Math.cos(ang) * r, .4 + Math.sin(k * Math.PI) * 2.2, dp.z + (a.z - dp.z) * e + Math.sin(ang) * r * .7);
      c.rotation.set(Math.sin(k * 9 + i) * .6, ang, Math.cos(k * 7) * .4);
      if (Math.random() < .5) glow.emit({ pos: c.position, n: 1, speed: [.1, .4], life: [.4, .8], size: [.18, 0], color, gravity: .3 });
    }));
    trs.forEach(t => t.end()); cards.forEach(c => scene.remove(c));
    glow.emit({ pos: a.clone().setY(.4), n: 70, speed: [.5, 2.5], dir: new T.Vector3(0, 1, 0), spread: 1, life: [.6, 1.2], size: [.2, 0], color: 0xd8ffe8, color2: color, gravity: .5 });
    shockwave(a.clone().setY(.04), color, 3, 650); lightPulse(a.clone().setY(1), color, 4, 700);
  }
  async function confessorEye(targetId) {
    const t = seatPos(targetId), c0 = STAGE(), col0 = ROLE_COLOR.confessor;
    const eye = addSprite(eyeTex(), col0, .1, c0); SFX.eye?.(); const halo = addSprite(glowTex(), col0, .1, c0);
    await tween(500, k => { eye.scale.setScalar(2.4 * backOut(k)); halo.scale.setScalar(4 * k); });
    const above = t.clone().setY(2.2);
    await tween(650, k => { eye.position.lerpVectors(c0, above, ease(k)); halo.position.copy(eye.position); });
    beam(t, col0, 2.4, .9, 1300); focus(t, 1.2, 1400);
    glow.emit({ pos: t.clone().setY(.3), n: 50, speed: [.3, 1.2], dir: new T.Vector3(0, 1, 0), spread: .6, life: [.8, 1.4], size: [.18, 0], color: col0, gravity: .6 });
    await tween(900, k => { eye.material.rotation = Math.sin(k * 10) * .1; eye.material.opacity = 1 - Math.max(0, k - .6) * 2.5; halo.material.opacity = eye.material.opacity * .6; });
    scene.remove(eye); scene.remove(halo);
  }
  // cúpula hexagonal de energia em volta do jogador (Guarda-Real e demais bloqueios)
  async function shieldDome(id, color, attackerId) {
    const p = seatPos(id), m = new T.Mesh(new T.SphereGeometry(1.7, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2), new T.ShaderMaterial({
      uniforms: { uC: { value: col(color) }, uA: { value: 0 }, uHit: { value: new T.Vector3(0, 1, 1) }, uHT: { value: 9 }, uT: { value: 0 } },
      transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide,
      vertexShader: 'varying vec3 vN,vV,vP; varying vec2 vUv; void main(){ vUv=uv; vP=position; vN=normalize(normalMatrix*normal); vec4 mv=modelViewMatrix*vec4(position,1.); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }',
      fragmentShader: `uniform vec3 uC, uHit; uniform float uA, uHT, uT; varying vec3 vN,vV,vP; varying vec2 vUv;
        float hexd(vec2 p){ p=abs(p); return max(dot(p,vec2(.866,.5)),p.y); }
        void main(){ vec2 g=vUv*vec2(28.,9.); vec2 r=vec2(1.,1.732); vec2 h=r*.5; vec2 a=mod(g,r)-h, b=mod(g-h,r)-h; vec2 q=dot(a,a)<dot(b,b)?a:b;
          float edge=smoothstep(.42,.5,hexd(q)); float f=pow(1.-abs(dot(vN,vV)),2.2);
          float d=distance(normalize(vP),normalize(uHit)); float wave=smoothstep(.25,0.,abs(d-uHT*1.4))*exp(-uHT*2.5);
          float a2=(f*.9+edge*.35+wave*2.)*uA*(.8+.2*sin(uT*6.+vP.y*8.)); gl_FragColor=vec4(uC*a2*1.6,a2); }`,
    }));
    m.position.copy(p); m.scale.set(1, .85, .8); scene.add(m); SFX.shieldUp?.();
    glow.emit({ pos: p.clone().setY(.1), n: 60, speed: [1, 3], shape: 'disc', up: .1, life: [.4, .8], size: [.2, 0], color, gravity: 0 });
    shockwave(p.clone().setY(.04), color, 3.6, 600);
    const u = m.material.uniforms;
    await tween(420, (k, dt) => { u.uA.value = easeOut(k); m.scale.y = .85 * backOut(k); u.uT.value += dt; });
    // um projétil do atacante bate no escudo
    if (attackerId) {
      const a = seatPos(attackerId).setY(1), orb = addSprite(glowTex(), 0xffffff, .7, a), hit = p.clone().setY(.9).lerp(a, .32);
      const tr = trail(orb, 0xffe8c0, .15, 14);
      await tween(380, k => orb.position.lerpVectors(a, hit, easeIn(k)));
      scene.remove(orb); tr.end(); SFX.swordClash?.(); impact(color, .4, .4);
      u.uHit.value.copy(hit.clone().sub(p)); u.uHT.value = 0;
      glow.emit({ pos: hit, n: 70, speed: [1.5, 4], life: [.3, .7], size: [.16, 0], color: 0xffffff, color2: color, gravity: -2 });
      lightPulse(hit, color, 5, 600);
    }
    await tween(900, (k, dt) => { u.uHT.value += dt; u.uT.value += dt; });
    await tween(400, (k, dt) => { u.uA.value = 1 - k; u.uT.value += dt; if (k >= 1) scene.remove(m); });
  }
  // estilhaçar a carta em pedaços de verdade (com a textura)
  function shatterCard(role, worldMatrix, color) {
    const t = cardTextures(role), cols = 5, rows = 7, pts = [];
    for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) pts.push(new T.Vector2((i / cols - .5) * CW + (i % cols ? rand(-.06, .06) : 0), (j / rows - .5) * CH + (j % rows ? rand(-.06, .06) : 0)));
    const mat = new T.MeshBasicMaterial({ map: t.map, side: T.DoubleSide, transparent: true }), frags = [];
    const g = new T.Group(); g.applyMatrix4(worldMatrix); scene.add(g);
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const a = pts[j * (cols + 1) + i], b = pts[j * (cols + 1) + i + 1], c = pts[(j + 1) * (cols + 1) + i], d = pts[(j + 1) * (cols + 1) + i + 1];
      for (const tri of [[a, b, d], [a, d, c]]) {
        const cx = (tri[0].x + tri[1].x + tri[2].x) / 3, cy = (tri[0].y + tri[1].y + tri[2].y) / 3;
        const geo = new T.BufferGeometry();
        geo.setAttribute('position', new T.Float32BufferAttribute(tri.flatMap(p => [-(p.x - cx), p.y - cy, 0]), 3));
        geo.setAttribute('uv', new T.Float32BufferAttribute(tri.flatMap(p => [(p.x + CW / 2) / CW, (p.y + CH / 2) / CH]), 2));
        const f = new T.Mesh(geo, mat); f.position.set(-cx, cy, 0); g.add(f);
        f.userData.v = new T.Vector3(-cx * rand(3, 6), cy * rand(2, 5) + rand(0, 2), rand(1, 4)); f.userData.r = new T.Vector3(rand(-9, 9), rand(-9, 9), rand(-9, 9));
        frags.push(f);
      }
    }
    const wp = new T.Vector3().setFromMatrixPosition(worldMatrix);
    glow.emit({ pos: wp, n: 110, speed: [2, 6], life: [.4, 1], size: [.2, 0], color: 0xffd0c0, color2: color, gravity: -4, drag: 1.4 });
    smoke.emit({ pos: wp, n: 20, speed: [.3, 1], life: [.8, 1.4], size: [.6, 1.5], color: 0x1a0d08, gravity: .3, alpha: .55 });
    return tween(1300, (k, dt) => {
      frags.forEach(f => { f.userData.v.y -= 7 * dt; f.position.addScaledVector(f.userData.v, dt); f.rotation.x += f.userData.r.x * dt; f.rotation.y += f.userData.r.y * dt; });
      mat.opacity = 1 - Math.max(0, k - .5) * 2;
      if (k >= 1) { scene.remove(g); frags.forEach(f => f.geometry.dispose()); mat.dispose(); }
    });
  }
  async function fireball(fromId, toId) {
    const a = seatPos(fromId).setY(1.4), b = seatPos(toId).setY(.5), ctrl = a.clone().lerp(b, .5).setY(4.2);
    const core = addSprite(glowTex(), 0xffd090, 1.2, a), outer = addSprite(glowTex(), 0xff5010, 2.6, a);
    const l = new T.PointLight(0xff6a1a, 5, 9, 1.6); scene.add(l);
    const tr = trail(core, 0xff4a08, .2, 26); SFX.whoosh?.(); SFX.fireball?.();
    await tween(800, k => {
      const e = easeIn(k * .6 + k * .4), u = 1 - e;
      core.position.set(u * u * a.x + 2 * u * e * ctrl.x + e * e * b.x, u * u * a.y + 2 * u * e * ctrl.y + e * e * b.y, u * u * a.z + 2 * u * e * ctrl.z + e * e * b.z);
      outer.position.copy(core.position); l.position.copy(core.position); outer.material.rotation += .2; outer.scale.setScalar(2.4 + Math.sin(k * 40) * .3);
      glow.emit({ pos: core.position, n: 8, speed: [.3, 1.4], life: [.25, .6], size: [.7, .08], color: 0xffb040, color2: 0xa01000, gravity: 1.2, alpha: .9, radius: .12 });
      smoke.emit({ pos: core.position, n: 2, speed: [.1, .4], life: [.6, 1.2], size: [.35, 1], color: 0x140a06, gravity: .7, alpha: .55 });
    });
    [core, outer, l].forEach(o => scene.remove(o)); tr.end();
    return b;
  }
  async function explosion(p) {
    SFX.explosion?.(); SFX.music?.surge(); impact(0xff8a3a, .9, 1.4); slowmo(350, .4); focus(p, 1.4, 1200);
    glow.emit({ pos: p, n: 160, speed: [1.5, 6], life: [.35, 1], size: [.5, .1], color: 0xffa040, color2: 0x8a0a00, gravity: 1, drag: 2.6, alpha: .8, radius: .2 });
    glow.emit({ pos: p, n: 70, speed: [4, 9], life: [.6, 1.4], size: [.08, 0], color: 0xffd080, gravity: -9, drag: .4 });
    smoke.emit({ pos: p, n: 60, speed: [.6, 2.4], life: [1.4, 2.6], size: [1, 2.8], color: 0x1a110b, color2: 0x050302, gravity: .8, drag: 1.6, alpha: .8, radius: .3 });
    const ball = addSprite(glowTex(), 0xffa040, .1, p), core = addSprite(glowTex(), 0xfff0c0, .1, p);
    shockwave(p.clone().setY(.04), 0xff7a2a, 6, 800); shockwave(p, 0xffd08a, 3.4, 450, false); lightPulse(p, 0xff7a2a, 10, 1100, 16);
    await tween(650, k => { ball.scale.setScalar(.5 + easeOut(k) * 4.2); ball.material.opacity = (1 - k) ** 1.5; ball.material.rotation += .05; core.scale.setScalar(.3 + easeOut(k) * 2); core.material.opacity = (1 - k) ** 3; if (k >= 1) { scene.remove(ball); scene.remove(core); } });
  }
  async function clash(aId, bId) {
    const a = seatPos(aId).setY(1), b = seatPos(bId).setY(1), mid = a.clone().lerp(b, .5).setY(2.2).lerp(camera.position, .35);
    SFX.challenge?.(); SFX.music?.surge(); focus(mid, 1, 1500);
    const s1 = bladeModel(1.3), s2 = bladeModel(1.3, 0xe8edf5, 0xb0b8c4, 0x4f9dff); s1.scale.setScalar(1.5); s2.scale.setScalar(1.5); scene.add(s1, s2);
    const t1 = trail(s1, 0xfff0d0, .15, 16), t2 = trail(s2, 0xd0e4ff, .15, 16); SFX.whoosh?.();
    await tween(460, k => {
      const e = easeIn(k);
      s1.position.lerpVectors(a, mid, e); s2.position.lerpVectors(b, mid, e);
      s1.lookAt(mid); s2.lookAt(mid); s1.rotateX(Math.PI / 2); s2.rotateX(Math.PI / 2); s1.rotateZ(-.8 * k); s2.rotateZ(.8 * k);
    });
    slowmo(600, .2); SFX.swordClash?.(); impact(0xfff1c8, .7, .7);
    glow.emit({ pos: mid, n: 140, speed: [3, 8], life: [.3, .8], size: [.12, 0], color: 0xffffff, color2: 0xffa040, gravity: -7, drag: 1 });
    shockwave(mid, 0xfff1c8, 3.2, 450, false); lightPulse(mid, 0xffe0b0, 8, 700);
    await tween(500, k => { s1.position.y = mid.y + Math.sin(k * 30) * .02; s2.position.y = mid.y - Math.sin(k * 30) * .02; });
    t1.end(); t2.end();
    await tween(320, k => { s1.position.lerp(a, k * .3); s2.position.lerp(b, k * .3); s1.scale.setScalar(1.5 * (1 - k)); s2.scale.setScalar(1.5 * (1 - k)); });
    scene.remove(s1, s2);
  }
  // resultado da contestação: a carta aparece sobre quem foi contestado — verdade brilha, blefe se estilhaça
  async function verdict(claimantId, role, truth) {
    const p = seatPos(claimantId).setY(1.9).lerp(camera.position, .15), color = truth ? 0xffd56b : 0xff3030;
    const holder = new T.Group(), card = makeCard(truth ? role : null, true); holder.add(card); holder.position.copy(p); scene.add(holder);
    await tween(420, k => { holder.lookAt(camera.position); holder.rotateY(Math.PI + (1 - easeOut(k)) * Math.PI * 3); holder.scale.setScalar(1.15 * backOut(k)); });
    if (truth) {
      SFX.truth?.(); impact(0xffe0a0, .45, .2);
      beam(seatPos(claimantId), 0xffd56b, 7, 1.1, 1500); runeCircle(p.clone().add(camera.position.clone().sub(p).normalize().multiplyScalar(-.1)), 0xffd56b, 3, 1500, false);
      glow.emit({ pos: p, n: 120, speed: [1.5, 4], life: [.6, 1.3], size: [.2, 0], color: 0xffffff, color2: 0xffc040, gravity: -1.5 });
      lightPulse(p, 0xffd56b, 6, 1000);
      await tween(900, k => { holder.lookAt(camera.position); holder.rotateY(Math.PI); holder.position.y = p.y + Math.sin(k * Math.PI) * .1; });
      const u = card.userData.u; u.edge.value = col(0xffd56b);
      await tween(800, k => { u.dis.value = k * 1.05; glow.emit({ pos: p, box: () => burnEdge(card, u.dis.value), n: 2, speed: [.2, .8], dir: new T.Vector3(0, 1, 0), life: [.5, 1], size: [.15, 0], color: 0xffe0a0, gravity: 1 }); });
    } else {
      // tremor, rachaduras vermelhas, explode em pedaços
      await tween(450, k => { holder.lookAt(camera.position); holder.rotateY(Math.PI); holder.position.x = p.x + Math.sin(k * 60) * .04 * k; });
      SFX.shatter?.(); impact(0xff2020, .6, .8);
      holder.updateMatrixWorld(); scene.remove(holder);
      await shatterCard(null, card.matrixWorld.clone(), color);
      return;
    }
    scene.remove(holder);
  }

  // ---------- reação a cada evento do jogo ----------
  function play(e, view) {
    if (!mounted || !active || document.hidden) return Promise.resolve();
    pending++;
    queue = queue.then(() => (pending > 5 && e.type !== 'win' ? null : run(e, view))).catch(err => console.warn('3d', err)).finally(() => pending--);
    return queue;
  }
  let lastDeclare = null;
  async function run(e) {
    animating++;
    try {
      switch (e.type) {
        case 'declare': {
          lastDeclare = e;
          const cost = Conjura.ACTIONS[e.action]?.cost || 0;
          if (e.claim) await presentCard(e.pid, e.claim, e.action === 'investigate' && e.target ? () => confessorEye(e.target) : null);
          else SFX.card();
          if (cost) { SFX.coinDown(); await coinFly(seatPos(e.pid), CHEST(), Math.min(cost, 7), { stagger: 45 }); }
          break;
        }
        case 'coins':
          if (e.n >= 3) await tesoureiroRain(e.pid);
          else { SFX.coinUp(); await coinFly(CHEST(), seatPos(e.pid), e.n, { stagger: 140 }); }
          break;
        case 'steal': await corsarioStrike(e.from, e.pid, e.n); break;
        case 'tribute': {
          const p = seatPos(e.pid), c = ROLE_COLOR.rei; SFX.coinShower?.();
          runeCircle(p.clone().setY(.03), c, 2.8, 1800); beam(p, c, 6, 1, 1500); lightPulse(p.clone().setY(1), c, 5, 1000);
          glow.emit({ pos: p.clone().setY(.4), n: 70, speed: [.6, 2.4], dir: new T.Vector3(0, 1, 0), spread: .8, life: [.8, 1.5], size: [.18, 0], color: 0xfff0b0, color2: c, gravity: .6 });
          await Promise.all((e.from || []).map((id, i) => wait(i * 160).then(() => coinFly(seatPos(id).setY(.3), p, 1, { color: c, h: 2.6 }))));
          shockwave(p.clone().setY(.05), c, 3, 700); break;
        }
        case 'assassinated': await sicarioStrike(e.pid); break;
        case 'coup': { const p = await fireball(e.pid, e.target); await explosion(p); break; }
        case 'exchangeStart': {
          const role = lastDeclare?.claim || 'diplomata';
          await courtSwirl(e.pid, { exchange1: 1, archives: 3 }[lastDeclare?.action] || 2, ROLE_COLOR[role]); break;
        }
        case 'exchanged': SFX.deal(); break;
        case 'block': await presentCard(e.pid, e.role, () => wait(500).then(() => shieldDome(e.pid, ROLE_COLOR[e.role], e.actor))); break;
        case 'blocked': SFX.coinDown(); break;
        case 'challenge': await clash(e.challenger, e.claimant); await verdict(e.claimant, e.role, e.truth); break;
        case 'lose': {
          const m = cardsOf[e.pid]?.[e.idx]; if (!m) break;
          const card = m.userData.card; m.userData.busy = true; setCardRole(card, e.role); SFX.flip();
          const y0 = .012, color = ROLE_COLOR[e.role] || 0xff3030;
          await tween(700, k => { m.position.y = y0 + Math.sin(Math.PI * k) * 1.3; m.rotation.z = Math.PI * ease(k); m.rotation.x = Math.sin(Math.PI * k) * -.5; });
          impact(0x000000, 0, .3);
          glow.emit({ pos: m.position.clone().setY(.1), n: 50, speed: [.5, 2], shape: 'disc', up: .5, life: [.4, .9], size: [.18, 0], color: 0xff9a5a, color2: color, gravity: -1 });
          smoke.emit({ pos: m.position.clone().setY(.1), n: 14, speed: [.2, .6], life: [1, 1.8], size: [.4, 1], color: 0x221410, gravity: .4, alpha: .6 });
          await tween(500, k => card.userData.front.material.color.setScalar(1 - .58 * k));
          m.position.y = .03; m.userData.busy = false; break;
        }
        case 'exiled': {
          SFX.bankrupt(); const p = seatPos(e.pid).setY(.3);
          smoke.emit({ pos: p, n: 60, speed: [.3, 1.2], dir: new T.Vector3(0, 1, 0), spread: .6, life: [1.5, 2.6], size: [.8, 2.4], color: 0x120c0a, gravity: .9, alpha: .8 });
          glow.emit({ pos: p, n: 40, speed: [.3, 1], dir: new T.Vector3(0, 1, 0), spread: .8, life: [1, 1.8], size: [.12, 0], color: 0xff6a2a, gravity: .8 });
          (cardsOf[e.pid] || []).forEach(m => { const c = m.userData.card; tween(1200, k => c.userData.front.material.color.setScalar(.42 - .2 * k)); });
          await wait(600); break;
        }
        case 'win': {
          SFX.win(); const p = seatPos(e.pid); focus(p, 1.4, 3000);
          beam(p, 0xffd56b, 9, 1.4, 3000); runeCircle(p.clone().setY(.04), 0xffd56b, 3.4, 3000);
          for (let i = 0; i < 4; i++) {
            glow.emit({ pos: p.clone().setY(.5), n: 120, speed: [3, 7], dir: new T.Vector3(0, 1, 0), spread: .45, life: [1, 2], size: [.22, 0], color: [0xffe9a0, 0xb67cff, 0x3ee089, 0xff8a2a][i], gravity: -4, drag: .6 });
            shockwave(p.clone().setY(.05), 0xffd56b, 4 + i, 700); impact(0xffe0a0, .25, .2); await wait(320);
          }
          break;
        }
      }
    } finally { animating--; if (!animating && lastView) for (const p of lastView.players) setStack(p.id, p.coins); }
  }

  // demonstração isolada de um efeito (para testes)
  function demo(name, view = lastView) {
    const ids = view.players.map(p => p.id), [a, b] = [ids[0], ids[1 % ids.length]];
    const E = {
      tax: [{ type: 'declare', pid: a, action: 'tax', claim: 'tesoureiro' }, { type: 'coins', pid: a, n: 3 }],
      assassinate: [{ type: 'declare', pid: a, action: 'assassinate', target: b, claim: 'sicario' }, { type: 'assassinated', pid: b }],
      steal: [{ type: 'declare', pid: a, action: 'steal', target: b, claim: 'corsario' }, { type: 'steal', pid: a, from: b, n: 2 }],
      exchange: [{ type: 'declare', pid: a, action: 'exchange', claim: 'diplomata' }, { type: 'exchangeStart', pid: a }],
      investigate: [{ type: 'declare', pid: a, action: 'investigate', target: b, claim: 'confessor' }],
      tribute: [{ type: 'declare', pid: a, action: 'tribute', claim: 'rei' }, { type: 'tribute', pid: a, from: ids.slice(1, 4) }],
      archives: [{ type: 'declare', pid: a, action: 'archives', claim: 'escriba' }, { type: 'exchangeStart', pid: a }],
      block: [{ type: 'block', pid: b, role: 'guarda', actor: a }],
      coup: [{ type: 'coup', pid: a, target: b }],
      truth: [{ type: 'challenge', claimant: a, challenger: b, role: 'sicario', truth: true }],
      bluff: [{ type: 'challenge', claimant: a, challenger: b, role: 'sicario', truth: false }],
      lose: [{ type: 'lose', pid: b, role: 'guarda', idx: 0 }],
      win: [{ type: 'win', pid: a }],
    }[name] || [];
    return Promise.all(E.map(ev => play(ev, view)));
  }

  function bench(n = 30) { const gl = renderer.getContext(), px = new Uint8Array(4), t0 = performance.now(); for (let i = 0; i < n; i++) { composer ? composer.render() : renderer.render(scene, camera); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); } return +((performance.now() - t0) / n).toFixed(1); }
  // ---------- virar a mesa: a mesa capota de cabeça para baixo, cartas/moedas/baú/velas voam para o chão e depois tudo volta ----------
  async function flip(pid) {
    if (!mounted || !active || flipping) return;
    flipping = true; animating++;
    try {
      const from = seatOf(pid)?.anchor.clone() || new T.Vector3(0, 0, 3);
      const dir = from.clone().negate().setY(0); if (dir.lengthSq() < .01) dir.set(0, 0, -1); dir.normalize();
      const axis = new T.Vector3(dir.z, 0, -dir.x).normalize();
      const cardsList = Object.values(cardsOf).flat(), loose = [...cardsList, ...Object.values(stacksOf), deckGroup, chest, ...tableProps].filter(o => o && o.visible !== false);
      const all = [...tableParts, ...loose], saved = new Map(all.map(o => [o, { p: o.position.clone(), q: o.quaternion.clone() }]));
      // a mesa gira em torno do próprio meio (tampo em 0, pés no chão em -1,6): cai de pernas para o ar no mesmo lugar
      const rig = new T.Group(); rig.position.set(0, -.8, 0); scene.add(rig); tableParts.forEach(o => rig.attach(o));
      const FLOOR = -1.6, bodies = loose.map(o => ({
        o, v: dir.clone().multiplyScalar(rand(2, 5.5)).add(new T.Vector3(rand(-2, 2), rand(4.5, 8), rand(-2, 2))),
        w: new T.Vector3(rand(-10, 10), rand(-7, 7), rand(-10, 10)), wait: rand(0, .15),
      }));
      SFX.tableFlip?.(); SFX.music?.surge(); impact(0xff7a3a, .35, 1.3); slowmo(500, .45);
      smoke.emit({ pos: from.clone().setY(.2), n: 30, speed: [.5, 1.5], life: [1, 1.8], size: [.8, 2], color: 0x2a1d14, gravity: .4, alpha: .5 });
      let last = 0, landed = false; const q0 = rig.quaternion.clone(), qa = new T.Quaternion(), tq = new T.Quaternion(), eu = new T.Euler();
      await tween(2800, (k, dt0) => {
        const t = k * 2.8, dt = Math.min(.05, t - last); last = t;
        const kb = Math.min(1, t / 1.25);
        rig.position.set(dir.x * Math.sin(Math.PI * kb) * 1.5, -.8 + Math.sin(Math.PI * kb) * 4, dir.z * Math.sin(Math.PI * kb) * 1.5);
        qa.setFromAxisAngle(axis, -Math.PI * smooth(kb)); rig.quaternion.copy(q0).premultiply(qa); rig.rotateY(Math.sin(Math.PI * kb) * .2);
        if (kb >= 1 && !landed) {
          landed = true; impact(0x000000, 0, 1.4); SFX.explosion?.();
          smoke.emit({ pos: new T.Vector3(0, -1.4, 0), n: 70, shape: 'disc', up: .15, speed: [2, 5], life: [1.2, 2.2], size: [1, 2.6], color: 0x2a1d14, gravity: .2, drag: 1.5, alpha: .6, radius: 1 });
          shockwave(new T.Vector3(0, -1.55, 0), 0xffd8a0, 12, 800);
        }
        for (const b of bodies) {
          if (t < b.wait) continue;
          b.v.y -= 15 * dt; b.o.position.addScaledVector(b.v, dt);
          eu.set(b.w.x * dt, b.w.y * dt, b.w.z * dt); tq.setFromEuler(eu); b.o.quaternion.multiply(tq);
          if (b.o.position.y < FLOOR + .03) { b.o.position.y = FLOOR + .03; if (b.v.y < -1.5) { b.v.y *= -.3; glow.emit({ pos: b.o.position, n: 3, speed: [.3, 1], life: [.2, .4], size: [.08, 0], color: 0xffd08a, gravity: -3 }); } else b.v.y = 0; b.v.x *= .7; b.v.z *= .7; b.w.multiplyScalar(.55); }
        }
        void dt0;
      });
      await wait(900);
      // magia da corte: tudo flutua de volta ao lugar
      SFX.magic?.();
      tableParts.forEach(o => scene.attach(o)); scene.remove(rig);
      const cur = all.map(o => ({ o, p: o.position.clone(), q: o.quaternion.clone() }));
      for (const c of cur.filter(c => loose.includes(c.o))) glow.emit({ pos: c.p, n: 5, speed: [.3, 1], life: [.4, .9], size: [.12, 0], color: 0xd9b0ff, gravity: .5 });
      await tween(1500, k => {
        const e = ease(k);
        for (const c of cur) { const s = saved.get(c.o); c.o.position.lerpVectors(c.p, s.p, e); if (loose.includes(c.o)) c.o.position.y += Math.sin(Math.PI * k) * 1.2; c.o.quaternion.copy(c.q).slerp(s.q, e); }
      });
      for (const [o, s] of saved) { o.position.copy(s.p); o.quaternion.copy(s.q); }
      runeCircle(new T.Vector3(0, .03, .3), 0xffd56b, 6, 1400);
    } catch (err) { console.warn('flip 3d', err); }
    finally { flipping = false; animating--; if (lastView) sync(lastView); }
  }

  return { supported, mount, show, sync, play, labelPos, demo, flip, bench, advance, resume: () => { cancelAnimationFrame(raf); lastT = 0; raf = requestAnimationFrame(loop); }, pause: v => (paused = !!v), onLayout: f => (layoutCb = f), get active() { return active; }, get pending() { return pending; }, idle: () => queue };
})();
