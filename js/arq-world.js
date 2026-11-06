// ===== Arquipélago — mundo 3D em diorama (Three.js r128) =====
// Constrói o arquipélago como uma maquete: cada hexágono vira uma ilhota com relevo próprio do bioma, laterais com
// camadas de solo, praia nas bordas voltadas para o mar e bordas na mesma altura entre vizinhos (sem degrau).
// Vegetação, rochas e enfeites são modelados em código (low-poly com cores por vértice) e desenhados em instâncias.
// Usado pelo protótipo de diorama (arq-diorama.js) e, depois de validado, pelo tabuleiro 3D do jogo.
const ArqWorld = (() => {
  let T;
  const SQ3 = Math.sqrt(3), APO = SQ3 / 2;                 // hexágono de raio 1 (centro → canto), apótema
  const WATER = 0, RIM = .16, SHORE = -.07, FLOOR = -.42;  // nível da água, borda entre ilhas, pé da praia, fundo
  const EDGE_W = .3;                                        // largura da faixa de transição junto às bordas
  const TEX = {};
  // ---------- vida: registro único de animações e vento ----------
  // cada elemento animado se registra aqui ao ser criado; animate() só percorre esta lista (nada de varrer a cena)
  const ANIM = [], WIND = { value: 0 };
  const onFrame = fn => ANIM.push(fn);
  // balanço pelo vento, calculado na placa de vídeo: desloca os vértices pela altura (pé parado, copa balança),
  // com fase diferente para cada instância (posição no mundo) — custo praticamente zero
  function windify(mat, k, speed = 1) {
    mat.onBeforeCompile = sh => {
      sh.uniforms.uWind = WIND;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uWind;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          #ifdef USE_INSTANCING
            vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
          #else
            vec3 ip = vec3(0.);
          #endif
          float hgt = max(transformed.y, 0.);
          float ph = uWind * ${(1.6 * speed).toFixed(2)} + ip.x * 2.3 + ip.z * 1.9;
          float sw = (sin(ph) * .65 + sin(ph * 2.3 + 1.3) * .25 + sin(ph * 5.1) * .1) * ${(0.1 * k).toFixed(3)} * hgt * hgt;
          transformed.x += sw; transformed.z += sw * .55;`);
    };
    mat.customProgramCacheKey = () => 'wind' + k + ':' + speed;
    return mat;
  }
  const WINDK = { palm: 1, tree: .5, tree2: .5, tall: .45, bush: .7, fern: 1.6, tuft: 6, flower: 6, cotton: 3.5, cottonYoung: 3.5, reed: 2.4, scarecrow: .15 };

  // ---------- ruído (determinístico) ----------
  const fract = x => x - Math.floor(x);
  const hash = (x, y, s) => fract(Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453);
  const smooth = t => t * t * (3 - 2 * t);
  function vnoise(x, y, s = 0) {
    const ix = Math.floor(x), iy = Math.floor(y), fx = smooth(x - ix), fy = smooth(y - iy);
    const a = hash(ix, iy, s), b = hash(ix + 1, iy, s), c = hash(ix, iy + 1, s), d = hash(ix + 1, iy + 1, s);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  }
  function fbm(x, y, s = 0, oct = 4) { let v = 0, a = .5, f = 1; for (let i = 0; i < oct; i++) { v += a * vnoise(x * f, y * f, s + i * 17); f *= 2.03; a *= .5; } return v; }
  const ridged = (x, y, s) => { let v = 0, a = .5, f = 1; for (let i = 0; i < 4; i++) { v += a * (1 - Math.abs(vnoise(x * f, y * f, s + i) * 2 - 1)); f *= 2.1; a *= .5; } return v; };
  const rng = seed => { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); };
  const lin = v => Math.pow(Math.max(0, v), 2.2);
  const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

  // ---------- relevo de cada bioma (altura absoluta, em coordenadas locais do hexágono) ----------
  const BIOME = {
    mata: { tex: 'grama', alt: 'terra', tint: [.9, 1, .86] },
    algodoal: { tex: 'terra', alt: 'grama', tint: [1, .97, .92] },
    barreiro: { tex: 'argila', alt: 'terra', tint: [1, .95, .9] },
    pedreira: { tex: 'rocha', alt: 'grama', tint: [.6, .6, .66] },
    vulcao: { tex: 'basalto', alt: 'basalto', tint: [.5, .5, .55] },
  };
  function interior(b, lx, lz, wx, wz, seed) {
    switch (b) {
      case 'mata': return RIM + .05 + .13 * fbm(wx * 1.4, wz * 1.4, seed);
      case 'algodoal': return RIM + .03 + .025 * fbm(wx * 2.2, wz * 2.2, seed);
      case 'barreiro': {
        let h = RIM + .03 + .05 * (fbm(wx * 1.8, wz * 1.8, seed) - .5);
        for (const [px, pz, r] of PITS) { const d = Math.hypot(lx - px, lz - pz); h -= .07 * (1 - sstep(r * .5, r, d)); }
        return h;
      }
      case 'pedreira': {
        const r = Math.hypot(lx - .1, lz + .18), r2 = Math.hypot(lx + .32, lz - .02), r3 = Math.hypot(lx - .3, lz - .2);
        let m = .62 * Math.exp(-((r / .36) ** 2)) + .4 * Math.exp(-((r2 / .26) ** 2)) + .3 * Math.exp(-((r3 / .22) ** 2))
          + .38 * ridged(wx * 2.6, wz * 2.6, seed) * Math.exp(-((Math.hypot(lx, lz) / .78) ** 2));
        m = m * .5 + (Math.floor(m * 7) / 7) * .5;            // degraus de rocha estratificada
        return RIM + .05 + m;
      }
      case 'vulcao': {
        const r = Math.hypot(lx, lz);
        let h = 1.1 * Math.pow(Math.max(0, 1 - r / .84), 1.25) + .04 * fbm(wx * 3, wz * 3, seed);
        if (r < .26) h -= (.26 - r) * 2.1;                      // cratera larga
        h += .018 * Math.sin(r * 38 + fbm(wx * 2, wz * 2, seed) * 6) * sstep(.5, .7, r);  // dunas de cinza no sopé
        return RIM + .02 + h;
      }
    }
    return RIM;
  }
  const PITS = [[-.32, .18, .2], [.22, -.28, .16]];         // poças do barreiro (posições locais)
  const PEAK_TOKEN = { pedreira: [0, .52], vulcao: [0, .6] }; // onde a ficha fica legível nos biomas altos

  // contexto de um hexágono: bioma, centro e o tipo de cada um dos 6 vizinhos (terra ou mar)
  const normals = Array.from({ length: 6 }, (_, k) => [Math.cos(k * Math.PI / 3), Math.sin(k * Math.PI / 3)]);
  function heightLocal(c, lx, lz) {
    const wx = c.x + lx, wz = c.z + lz;
    let sw = 0, se = 0, ss = 0, dmin = 9;
    for (let k = 0; k < 6; k++) {
      const d = APO - (lx * normals[k][0] + lz * normals[k][1]); dmin = Math.min(dmin, d);
      const w = Math.max(0, EDGE_W - d) ** 2; if (!w) continue;
      sw += w; se += w * (c.sea[k] ? SHORE : RIM); ss += w * (c.sea[k] ? 1 : 0);
    }
    const inner = interior(c.biome, lx, lz, wx, wz, c.seed);
    if (!sw) return { h: inner, sand: 0 };
    const f = sstep(0, EDGE_W, dmin), e = se / sw;
    return { h: e + (inner - e) * f, sand: (ss / sw) * (1 - sstep(0, EDGE_W * .85, dmin)) };
  }

  // ---------- materiais ----------
  function loadTextures(base = 'assets/arq/') {
    const L = new T.TextureLoader();
    for (const n of ['grama', 'terra', 'argila', 'rocha', 'areia', 'basalto']) {
      if (TEX[n]) continue;
      const map = L.load(`${base}tex_${n}.webp`), nrm = L.load(`${base}tex_${n}_n.webp`), rough = L.load(`${base}tex_${n}_r.webp`);
      map.encoding = T.sRGBEncoding;
      for (const t of [map, nrm, rough]) { t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = 8; }
      TEX[n] = { map, nrm, rough };
    }
  }
  // material do terreno: textura do bioma + textura alternativa + areia, misturadas por vértice (aAlt, aSand)
  const terrainMats = {};
  function terrainMaterial(biome) {
    if (terrainMats[biome]) return terrainMats[biome];
    const B = BIOME[biome], m = new T.MeshStandardMaterial({ map: TEX[B.tex].map, normalMap: TEX[B.tex].nrm, normalScale: new T.Vector2(.8, .8), roughnessMap: TEX[B.tex].rough, vertexColors: true, roughness: 1, metalness: 0 });
    m.onBeforeCompile = sh => {
      sh.uniforms.altMap = { value: TEX[B.alt].map }; sh.uniforms.sandMap = { value: TEX.areia.map };
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aAlt; attribute float aSand; varying float vAlt; varying float vSand; varying vec2 vWorldUv;')
        .replace('#include <uv_vertex>', '#include <uv_vertex>\nvAlt = aAlt; vSand = aSand; vWorldUv = uv;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D altMap; uniform sampler2D sandMap; varying float vAlt; varying float vSand; varying vec2 vWorldUv;')
        .replace('#include <map_fragment>', `
          vec4 texelColor = mapTexelToLinear(texture2D(map, vUv));
          vec4 altC = mapTexelToLinear(texture2D(altMap, vWorldUv * 1.15));
          vec4 sandC = mapTexelToLinear(texture2D(sandMap, vWorldUv * .9));
          texelColor = mix(texelColor, altC, clamp(vAlt, 0., 1.));
          texelColor = mix(texelColor, sandC, clamp(vSand, 0., 1.));
          diffuseColor *= texelColor;`);
    };
    return (terrainMats[biome] = m);
  }
  let sideMat;
  function sideMaterial() {
    return sideMat || (sideMat = new T.MeshStandardMaterial({ map: TEX.terra.map, vertexColors: true, roughness: 1, side: T.DoubleSide }));
  }

  // ---------- malha de um hexágono ----------
  // grade triangular dentro do hexágono (cantos alinhados com os do tabuleiro): |i|,|j|,|i+j| ≤ n
  function hexTile(c, n = 12) {
    const u = [Math.cos(-Math.PI / 6) / n, Math.sin(-Math.PI / 6) / n], v = [Math.cos(Math.PI / 6) / n, Math.sin(Math.PI / 6) / n];
    const idx = new Map(), pos = [], uv = [], col = [], alt = [], sand = [], heights = [];
    const B = BIOME[c.biome];
    for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) {
      if (Math.abs(i + j) > n) continue;
      const lx = i * u[0] + j * v[0], lz = i * u[1] + j * v[1];
      const { h, sand: sd } = heightLocal(c, lx, lz), wx = c.x + lx, wz = c.z + lz;
      idx.set(i + ',' + j, pos.length / 3); pos.push(lx, h, lz); uv.push(wx * .55, wz * .55); heights.push(h);
      // textura alternativa: pedreira mostra grama embaixo; mata mostra terra nas clareiras; algodoal tem grama na borda
      let a = 0;
      if (c.biome === 'pedreira') a = 1 - sstep(RIM + .1, RIM + .3, h);
      else if (c.biome === 'mata') a = sstep(.62, .78, fbm(wx * 2.6, wz * 2.6, c.seed + 3)) * .8;
      else if (c.biome === 'algodoal') a = 1 - sstep(.05, .2, APO - Math.max(...normals.map(nn => lx * nn[0] + lz * nn[1])));
      else if (c.biome === 'barreiro') a = sstep(.55, .75, fbm(wx * 3, wz * 3, c.seed + 9)) * .6;
      alt.push(a); sand.push(sd);
      // cor por vértice: matiz do bioma, variação suave e oclusão nas partes baixas
      const k = .88 + .24 * fbm(wx * 3.1, wz * 3.1, c.seed + 5);
      let tr = B.tint[0], tg = B.tint[1], tb = B.tint[2];
      if (c.biome === 'pedreira' && h > RIM + .12) { const band = .5 + .5 * Math.sin(h * 34 + fbm(wx * 4, wz * 4, 2) * 3); tr *= 1 + band * .45; tg *= 1 + band * .25; tb *= 1 - band * .12; }
      if (c.biome === 'vulcao') { const r0 = Math.hypot(lx, lz); if (r0 < .34) { const glow = 1 - sstep(.18, .34, r0); tr += glow * .5; tg += glow * .12; } }
      col.push(...[tr * k, tg * k, tb * k].map(lin)); // tons escritos como na tela (sRGB) → espaço linear do renderizador
    }
    const index = [];
    for (let i = -n; i < n; i++) for (let j = -n; j < n; j++) {
      const a = idx.get(i + ',' + j), b = idx.get((i + 1) + ',' + j), d = idx.get(i + ',' + (j + 1)), e = idx.get((i + 1) + ',' + (j + 1));
      if (a != null && b != null && d != null) index.push(a, d, b);
      if (b != null && e != null && d != null) index.push(b, d, e);
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    g.setAttribute('color', new T.Float32BufferAttribute(col, 3)); g.setAttribute('aAlt', new T.Float32BufferAttribute(alt, 1)); g.setAttribute('aSand', new T.Float32BufferAttribute(sand, 1));
    g.setIndex(index); g.computeVertexNormals();
    bakeAO(g, idx, n);
    // contorno (anel externo, em ordem) para as laterais
    const ring = [];
    const corners = [[n, 0], [0, n], [-n, n], [-n, 0], [0, -n], [n, -n]];
    for (let k = 0; k < 6; k++) { const [a0, b0] = corners[k], [a1, b1] = corners[(k + 1) % 6]; for (let s = 0; s < n; s++) { const i = Math.round(a0 + (a1 - a0) * s / n), j = Math.round(b0 + (b1 - b0) * s / n); ring.push(idx.get(i + ',' + j)); } }
    return { geo: g, ring };
  }
  // oclusão de ambiente "assada": vértices em vales ficam mais escuros, cristas mais claras
  function bakeAO(g, idx, n) {
    const p = g.attributes.position, c = g.attributes.color, N = g.attributes.normal;
    for (let k = 0; k < p.count; k++) {
      const up = N.getY(k), ao = .72 + .28 * Math.min(1, Math.max(0, up));
      c.setXYZ(k, c.getX(k) * ao, c.getY(k) * ao, c.getZ(k) * ao);
    }
  }
  // laterais: parede do contorno até o fundo do mar, com faixas de solo (grama/terra/rocha)
  function hexSides(tileGeo, ring) {
    const p = tileGeo.attributes.position, pos = [], col = [], uv = [], index = [];
    let along = 0;
    for (let s = 0; s <= ring.length; s++) {
      const k = ring[s % ring.length], x = p.getX(k), y = p.getY(k), z = p.getZ(k);
      if (s) { const q = ring[(s - 1) % ring.length]; along += Math.hypot(x - p.getX(q), z - p.getZ(q)); }
      const levels = [y, y - .035, y - .12, y - .3, FLOOR];
      const tints = [[.55, .62, .32], [.42, .3, .2], [.5, .38, .27], [.46, .42, .38], [.32, .3, .28]];
      levels.forEach((ly, li) => { pos.push(x * 1.002, ly, z * 1.002); uv.push(along * 1.2, ly * 1.2); col.push(...tints[li].map(lin)); });
    }
    const L = 5;
    for (let s = 0; s < ring.length; s++) for (let l = 0; l < L - 1; l++) { const a = s * L + l, b = (s + 1) * L + l; index.push(a, a + 1, b, b, a + 1, b + 1); }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); g.setAttribute('color', new T.Float32BufferAttribute(col, 3));
    g.setIndex(index); g.computeVertexNormals(); return g;
  }

  // ---------- modelos low-poly (geometrias fundidas, com cor por vértice) ----------
  function merge(parts) {
    const pos = [], nor = [], col = [];
    for (const [g0, color] of parts) {
      const g = g0.index ? g0.toNonIndexed() : g0; g.computeVertexNormals();
      const P = g.attributes.position, Nn = g.attributes.normal, C = new T.Color(color).convertSRGBToLinear();
      for (let i = 0; i < P.count; i++) { pos.push(P.getX(i), P.getY(i), P.getZ(i)); nor.push(Nn.getX(i), Nn.getY(i), Nn.getZ(i)); col.push(C.r, C.g, C.b); }
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3)); g.setAttribute('color', new T.Float32BufferAttribute(col, 3));
    return g;
  }
  const jitter = (g, amt, seed) => { const p = g.attributes.position, r = rng(seed); for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) + (r() - .5) * amt, p.getY(i) + (r() - .5) * amt, p.getZ(i) + (r() - .5) * amt); return g; };
  // vértices iguais recebem o mesmo deslocamento (sem rachar a malha)
  function wobble(g, amt, seed) { const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = 1 + (vnoise(x * 6 + 3, y * 6 + z * 4, seed) - .5) * amt; p.setXYZ(i, x * k, y * k, z * k); } return g; }

  const PROTO = {};
  function protos() {
    if (PROTO.done) return PROTO;
    const ico = (r, d = 0) => new T.IcosahedronGeometry(r, d), cyl = (a, b, h, s = 6) => new T.CylinderGeometry(a, b, h, s), cone = (r, h, s = 6) => new T.ConeGeometry(r, h, s);
    // palmeira: tronco curvo em gomos e folhas compridas caindo
    const palm = [];
    for (let i = 0; i < 6; i++) { const s = cyl(.022 - i * .002, .026 - i * .002, .1, 6); s.translate(Math.sin(i * .35) * .05 * i * .3, .05 + i * .095, 0); palm.push([s, i % 2 ? '#8a6a44' : '#7a5a38']); }
    for (let f = 0; f < 7; f++) {
      const leaf = new T.ConeGeometry(.05, .38, 3, 4); leaf.rotateZ(-Math.PI / 2); leaf.scale(1, .18, 1); leaf.translate(.19, 0, 0);
      const p = leaf.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i); p.setY(i, p.getY(i) - x * x * .9); }
      leaf.rotateY(f / 7 * Math.PI * 2 + .3); leaf.translate(.09, .6, 0); palm.push([leaf, f % 2 ? '#3f8f3a' : '#4fa244']);
    }
    palm.push([ico(.035, 0).translate(.09, .58, 0), '#6b4a2a']);
    PROTO.palm = merge(palm);
    // árvore de copa larga: tronco e três massas de folhagem facetadas
    PROTO.tree = merge([
      [cyl(.03, .045, .26, 6).translate(0, .13, 0), '#6b4a2e'],
      [wobble(ico(.2, 1), .35, 3).translate(0, .38, 0), '#2f7a3a'],
      [wobble(ico(.15, 1), .35, 5).translate(.12, .32, .06), '#3a8a3f'],
      [wobble(ico(.13, 1), .35, 7).translate(-.1, .3, -.05), '#2a6a34'],
    ]);
    // árvore alta e estreita (variação de silhueta)
    PROTO.tall = merge([[cyl(.025, .035, .34, 6).translate(0, .17, 0), '#5e4128'], [wobble(cone(.14, .42, 7), .2, 11).translate(0, .52, 0), '#24603a'], [wobble(cone(.11, .3, 7), .2, 13).translate(0, .72, 0), '#2c6e40']]);
    // arbusto e samambaia rasteira
    PROTO.bush = merge([[wobble(ico(.09, 1), .4, 21).scale(1, .75, 1).translate(0, .05, 0), '#3d8a3c'], [wobble(ico(.06, 1), .4, 23).translate(.07, .04, .03), '#4f9a44']]);
    const fern = []; for (let f = 0; f < 5; f++) { const l = cone(.025, .16, 3); l.rotateZ(-1.1); l.rotateY(f / 5 * Math.PI * 2); l.translate(0, .05, 0); fern.push([l, '#5aa64a']); }
    PROTO.fern = merge(fern);
    // tufo de capim
    const tuft = []; for (let f = 0; f < 4; f++) { const b = cone(.012, .1, 3); b.rotateZ((f - 1.5) * .25); b.rotateY(f * 1.7); b.translate(0, .05, 0); tuft.push([b, f % 2 ? '#7cb84a' : '#9ac85a']); }
    PROTO.tuft = merge(tuft);
    // flores (pontinhos coloridos sobre um caule)
    PROTO.flower = merge([[cyl(.004, .004, .06, 3).translate(0, .03, 0), '#4f8a3a'], [ico(.018, 0).translate(0, .065, 0), '#ffffff']]);
    // rochas facetadas
    PROTO.rock = merge([[wobble(ico(.12, 1), .55, 31).scale(1, .7, 1), '#767a82']]);
    PROTO.rockSmall = merge([[wobble(ico(.05, 0), .5, 33).scale(1, .7, 1), '#84878e']]);
    PROTO.boulder = merge([[wobble(new T.DodecahedronGeometry(.16, 0), .3, 35).scale(1.2, .8, 1), '#6c7078']]);
    // algodoeiro: arbusto baixo com capulhos brancos
    PROTO.cotton = merge([
      [cyl(.008, .01, .07, 4).translate(0, .035, 0), '#5e7a32'],
      [wobble(ico(.045, 1), .4, 41).scale(1, .8, 1).translate(0, .08, 0), '#5f8a3a'],
      [ico(.022, 0).translate(.03, .11, .01), '#fbfaf2'], [ico(.02, 0).translate(-.025, .1, .02), '#f6f3e6'], [ico(.018, 0).translate(.0, .12, -.03), '#ffffff'],
    ]);
    // barreiro: pilha de tijolos e forno de barro
    const bricks = []; for (let l = 0; l < 3; l++) for (let b = 0; b < 3 - l; b++) bricks.push([new T.BoxGeometry(.07, .035, .035).translate((b - (2 - l) / 2) * .075, .018 + l * .036, 0), l % 2 ? '#a3502c' : '#b85e34']);
    PROTO.bricks = merge(bricks);
    PROTO.kiln = merge([
      [cyl(.09, .12, .14, 9).translate(0, .07, 0), '#9a5634'], [wobble(new T.SphereGeometry(.1, 9, 6, 0, Math.PI * 2, 0, Math.PI / 2), .1, 51).translate(0, .14, 0), '#a8613a'],
      [new T.BoxGeometry(.06, .06, .02).translate(0, .05, .11), '#2a1810'], [cyl(.025, .03, .1, 6).translate(.03, .25, 0), '#7a4428'],
    ]);
    PROTO.clay = merge([[wobble(ico(.1, 1), .3, 81).scale(1.3, .55, 1.1).translate(0, .02, 0), '#c06a3e'], [wobble(ico(.06, 1), .3, 83).scale(1.2, .6, 1).translate(.09, .01, .04), '#b05e36']]);
    const reed = []; for (let f = 0; f < 6; f++) { const b = cyl(.006, .01, .2 + (f % 3) * .05, 3); b.rotateZ((f - 2.5) * .08); b.translate((f - 2.5) * .015, .11, (f % 2) * .02); reed.push([b, f % 2 ? '#6f8a3a' : '#87a24a']); }
    reed.push([cyl(.012, .012, .05, 5).translate(0, .24, 0), '#6b4a2a']); PROTO.reed = merge(reed);
    // vulcão: pedras-pomes escuras
    PROTO.pumice = merge([[wobble(ico(.07, 0), .5, 61).scale(1, .6, 1), '#3a3330']]);
    // recife: coral e peixinho
    // coral ramificado: galhos finos inclinados com pontas arredondadas (rotateZ(+θ) leva o topo do galho para -x)
    const coral = []; for (let k = 0; k < 6; k++) { const a = k * 1.05, tilt = .35 + (k % 3) * .15, h = .09 + (k % 2) * .04; const b = cyl(.008, .014, h, 5); b.translate(0, h / 2, 0); b.rotateZ(tilt); b.rotateY(a); coral.push([b, '#ff7a6a']); const tip = ico(.016, 0); tip.translate(-Math.sin(tilt) * h, Math.cos(tilt) * h, 0); tip.rotateY(a); coral.push([tip, '#ffb08a']); }
    PROTO.coral = merge(coral);
    PROTO.fish = merge([[new T.ConeGeometry(.025, .09, 4).rotateZ(Math.PI / 2), '#ffd27a'], [new T.ConeGeometry(.02, .03, 3).rotateZ(-Math.PI / 2).translate(-.055, 0, 0), '#ffb04a']]);
    // cerca de madeira (algodoal)
    PROTO.fence = merge([[new T.BoxGeometry(.015, .07, .015).translate(-.07, .035, 0), '#7a5a38'], [new T.BoxGeometry(.015, .07, .015).translate(.07, .035, 0), '#7a5a38'], [new T.BoxGeometry(.16, .012, .01).translate(0, .05, 0), '#8a6a44'], [new T.BoxGeometry(.16, .012, .01).translate(0, .025, 0), '#8a6a44']]);
    // --- mata: mais espécies e chão de floresta ---
    PROTO.tree2 = merge([[cyl(.025, .04, .2, 6).translate(0, .1, 0), '#6b4a2e'], [wobble(new T.SphereGeometry(.16, 8, 6), .25, 91).scale(1, .75, 1).translate(0, .28, 0), '#6f9e34'], [wobble(new T.SphereGeometry(.11, 8, 6), .25, 93).scale(1, .8, 1).translate(.02, .4, .01), '#8db343']]);
    PROTO.log = merge([[cyl(.035, .035, .26, 7).rotateZ(Math.PI / 2).translate(0, .03, 0), '#6e4a2c'], [cyl(.036, .036, .01, 7).rotateZ(Math.PI / 2).translate(.13, .03, 0), '#c49a64'], [wobble(ico(.03, 0), .4, 95).translate(-.05, .06, 0), '#4f8a3a']]);
    PROTO.mushroom = merge([[cyl(.008, .01, .04, 5).translate(0, .02, 0), '#f4ead6'], [new T.SphereGeometry(.024, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, .04, 0), '#d8402c'], [cyl(.006, .008, .03, 5).translate(.03, .015, .01), '#f4ead6'], [new T.SphereGeometry(.016, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2).translate(.03, .03, .01), '#e05a3a']]);
    // --- algodoal: planta jovem, cesto e espantalho ---
    PROTO.cottonYoung = merge([[wobble(ico(.035, 1), .4, 101).scale(1, .7, 1).translate(0, .03, 0), '#7aa83e'], [wobble(ico(.022, 0), .4, 103).translate(.025, .03, .01), '#8fbc4a']]);
    PROTO.basket = merge([[cyl(.05, .04, .06, 9).translate(0, .03, 0), '#a8804f'], [cyl(.052, .052, .008, 9).translate(0, .06, 0), '#8a6238'], [ico(.022, 0).translate(.015, .065, 0), '#ffffff'], [ico(.02, 0).translate(-.018, .068, .012), '#f6f3e6'], [ico(.018, 0).translate(0, .072, -.02), '#fbfaf2']]);
    PROTO.scarecrow = merge([[cyl(.008, .008, .3, 5).translate(0, .15, 0), '#7a5a38'], [new T.BoxGeometry(.2, .012, .012).translate(0, .22, 0), '#7a5a38'], [new T.BoxGeometry(.09, .1, .05).translate(0, .2, 0), '#4f6fa8'], [ico(.035, 1).translate(0, .29, 0), '#e8d8a8'], [cone(.06, .05, 8).translate(0, .33, 0), '#c8a04a'], [cyl(.07, .07, .006, 10).translate(0, .31, 0), '#c8a04a']]);
    // --- pedreira: blocos cortados e um guindaste de madeira ---
    PROTO.block = merge([[new T.BoxGeometry(.09, .07, .07).translate(0, .035, 0), '#9a9690']]);
    PROTO.blockStack = merge([[new T.BoxGeometry(.09, .07, .07).translate(-.05, .035, 0), '#9a9690'], [new T.BoxGeometry(.09, .07, .07).translate(.05, .035, .01), '#8f8b86'], [new T.BoxGeometry(.09, .07, .07).translate(0, .105, .005), '#a29e98']]);
    PROTO.crane = merge([
      [new T.BoxGeometry(.018, .42, .018).rotateZ(.18).translate(-.04, .2, -.04), '#7a5a38'], [new T.BoxGeometry(.018, .42, .018).rotateZ(-.18).translate(.04, .2, -.04), '#7a5a38'], [new T.BoxGeometry(.018, .42, .018).rotateX(.25).translate(0, .2, .06), '#6e5032'],
      [new T.BoxGeometry(.34, .016, .016).translate(.1, .4, 0), '#8a6a44'], [cyl(.003, .003, .2, 3).translate(.24, .3, 0), '#d8c8a0'], [new T.BoxGeometry(.06, .05, .05).translate(.24, .18, 0), '#a29e98']]);
    // --- barreiro: estante de secagem ---
    const rack = [[new T.BoxGeometry(.012, .16, .012).translate(-.1, .08, -.03), '#7a5a38'], [new T.BoxGeometry(.012, .16, .012).translate(.1, .08, -.03), '#7a5a38'], [new T.BoxGeometry(.012, .16, .012).translate(-.1, .08, .03), '#7a5a38'], [new T.BoxGeometry(.012, .16, .012).translate(.1, .08, .03), '#7a5a38'], [new T.BoxGeometry(.22, .01, .08).translate(0, .07, 0), '#8a6a44'], [new T.BoxGeometry(.22, .01, .08).translate(0, .15, 0), '#8a6a44']];
    for (let b = 0; b < 4; b++) rack.push([new T.BoxGeometry(.04, .02, .05).translate(-.075 + b * .05, .085, 0), '#c06a3e'], [new T.BoxGeometry(.04, .02, .05).translate(-.075 + b * .05, .165, 0), '#b05e36']);
    PROTO.rack = merge(rack);
    // --- vulcão: obsidiana e fumarola ---
    const obs = []; for (let k = 0; k < 5; k++) { const sh = cone(.025 + (k % 2) * .01, .1 + k * .02, 4); sh.rotateZ((k - 2) * .25); sh.rotateY(k * 1.3); sh.translate((k - 2) * .02, .05, (k % 2) * .02); obs.push([sh, k % 2 ? '#1e1a24' : '#2a2434']); }
    PROTO.obsidian = merge(obs);
    PROTO.fumarole = merge([[wobble(cyl(.03, .09, .07, 7), .2, 111).translate(0, .035, 0), '#4a3c36'], [cyl(.024, .024, .01, 7).translate(0, .072, 0), '#1a1210']]);
    // --- cardume: algas, conchas, estrela-do-mar e boia ---
    const weed = []; for (let k = 0; k < 4; k++) { const b = new T.ConeGeometry(.012, .2 + k * .04, 3, 4); const p = b.attributes.position; for (let i = 0; i < p.count; i++) p.setX(i, p.getX(i) + Math.sin(p.getY(i) * 18) * .012); b.translate((k - 1.5) * .02, .1 + k * .02, (k % 2) * .015); weed.push([b, k % 2 ? '#2f7a4a' : '#3f9a5a']); }
    PROTO.seaweed = merge(weed);
    PROTO.shell = merge([[new T.SphereGeometry(.022, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, .5, 1.2), '#f6d8c8']]);
    const star = []; for (let k = 0; k < 5; k++) { const arm = new T.ConeGeometry(.012, .05, 4); arm.rotateZ(-Math.PI / 2); arm.translate(.025, .005, 0); arm.rotateY(k * Math.PI * 2 / 5); star.push([arm, '#ff7a4a']); } PROTO.starfish = merge(star);
    PROTO.buoy = merge([[new T.SphereGeometry(.05, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), '#e8402c'], [cyl(.052, .052, .02, 10).translate(0, -.005, 0), '#f6f0e4'], [cyl(.006, .006, .08, 4).translate(0, .07, 0), '#3a3a3a'], [new T.BoxGeometry(.04, .025, .004).translate(.02, .1, 0), '#ffd34a']]);
    PROTO.done = true; return PROTO;
  }

  // ---------- peças dos jogadores ----------
  function houseGeo(color) {
    const roof = new T.ConeGeometry(.15, .11, 4, 1); roof.rotateY(Math.PI / 4); roof.scale(1.15, 1, .95); roof.translate(0, .185, 0);
    return merge([
      [new T.BoxGeometry(.2, .13, .16).translate(0, .065, 0), '#f1e6cc'],
      [roof, color],
      [new T.BoxGeometry(.04, .07, .005).translate(0, .035, .082), '#4a2e1a'],
      [new T.BoxGeometry(.035, .03, .005).translate(-.06, .08, .082), '#3a5a7a'], [new T.BoxGeometry(.035, .03, .005).translate(.06, .08, .082), '#3a5a7a'],
      [new T.BoxGeometry(.03, .08, .03).translate(.06, .22, -.03), '#8a6a54'],
      [new T.BoxGeometry(.22, .02, .18).translate(0, .005, 0), '#9a8a70'],
    ]);
  }
  function cityGeo(color) {
    const roofA = new T.ConeGeometry(.17, .12, 4); roofA.rotateY(Math.PI / 4); roofA.scale(1.2, 1, .9); roofA.translate(-.06, .2, 0);
    const roofT = new T.ConeGeometry(.1, .16, 4); roofT.rotateY(Math.PI / 4); roofT.translate(.1, .41, 0);
    return merge([
      [new T.BoxGeometry(.26, .14, .18).translate(-.06, .07, 0), '#ece0c4'], [roofA, color],
      [new T.BoxGeometry(.13, .33, .13).translate(.1, .165, 0), '#e2d4b4'], [roofT, color],
      [new T.BoxGeometry(.05, .08, .005).translate(-.06, .04, .092), '#4a2e1a'], [new T.BoxGeometry(.04, .05, .005).translate(.1, .24, .067), '#3a5a7a'],
      [new T.BoxGeometry(.36, .02, .22).translate(.0, .005, 0), '#9a8a70'],
    ]);
  }
  // trilha: tábuas atravessadas com a cor do jogador nas pontas
  // trilha: passarela de tábuas pintadas na cor do jogador, sobre duas vigas escuras e com estacas nas pontas
  function roadGeo(color, len) {
    const base = new T.Color(color), dark = base.clone().multiplyScalar(.82), light = base.clone().lerp(new T.Color('#ffffff'), .12);
    const parts = [[new T.BoxGeometry(len, .02, .022).translate(0, .01, .042), '#5a3e26'], [new T.BoxGeometry(len, .02, .022).translate(0, .01, -.042), '#5a3e26']];
    const n = Math.max(5, Math.round(len / .075));
    for (let i = 0; i < n; i++) { const x = (i - (n - 1) / 2) * (len / n), w = len / n * .9; parts.push([new T.BoxGeometry(w, .022, .13 - (i % 3) * .006).translate(x, .031, (i % 2) * .004), '#' + (i % 2 ? dark : light).getHexString()]); }
    for (const sx of [-1, 1]) parts.push([new T.CylinderGeometry(.012, .014, .08, 6).translate(sx * len / 2, .04, .075), '#5a3e26'], [new T.CylinderGeometry(.012, .014, .08, 6).translate(sx * len / 2, .04, -.075), '#5a3e26']);
    return merge(parts);
  }

  // ---------- mundo ----------
  // tiles: [{id, x, z, biome|'mar'|'cardume', num}] — monta tudo num Group
  function build(tiles, opts = {}) {
    T = THREE; loadTextures(opts.texBase); protos();
    const group = new T.Group(), byPos = new Map(), key = (x, z) => Math.round(x * 100) + ':' + Math.round(z * 100);
    for (const t of tiles) byPos.set(key(t.x, t.z), t);
    const ctx = {};
    const isLand = t => t && BIOME[t.biome];
    for (const t of tiles) if (isLand(t)) {
      const sea = normals.map(([nx, nz]) => !isLand(byPos.get(key(t.x + nx * SQ3, t.z + nz * SQ3))));
      ctx[t.id] = { x: t.x, z: t.z, biome: t.biome, seed: (t.id * 7 + 3) % 97, sea, tile: t };
    }
    // terreno
    const sideM = sideMaterial();
    for (const c of Object.values(ctx)) {
      const { geo, ring } = hexTile(c, opts.detail || 12);
      const top = new T.Mesh(geo, terrainMaterial(c.biome)); top.position.set(c.x, 0, c.z); top.receiveShadow = true; top.castShadow = true; top.userData.hex = c.tile.id;
      const side = new T.Mesh(hexSides(geo, ring), sideM); side.position.copy(top.position); side.receiveShadow = true;
      group.add(top, side); c.mesh = top;
    }
    const heightAt = (x, z) => {
      let best = null, bd = 9; for (const c of Object.values(ctx)) { const d = Math.hypot(x - c.x, z - c.z); if (d < bd) { bd = d; best = c; } }
      return best && bd < 1.05 ? heightLocal(best, x - best.x, z - best.z).h : SHORE - .1;
    };
    // enfeites em instâncias
    const inst = {}; const put = (name, x, z, s = 1, rot = 0, tint = null, y = null, tilt = 0) => { (inst[name] = inst[name] || []).push({ x, z, s, rot, tint, y: y ?? heightAt(x, z), tilt }); };
    for (const c of Object.values(ctx)) scatter(c, put, heightAt);
    const D = new T.Object3D(), color = new T.Color();
    for (const [name, list] of Object.entries(inst)) {
      const mat = new T.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: .8, ...(PROTO_MAT[name] || {}) });
      if (WINDK[name]) windify(mat, WINDK[name]);
      const m = new T.InstancedMesh(PROTO[name], mat, list.length);
      list.forEach((o, i) => {
        D.position.set(o.x, o.y, o.z); D.rotation.set(o.tilt, o.rot, o.tilt * .5); D.scale.setScalar(o.s); D.updateMatrix(); m.setMatrixAt(i, D.matrix);
        color.setRGB(1, 1, 1); if (o.tint) color.setRGB(...o.tint); m.setColorAt(i, color);
      });
      m.castShadow = !NO_SHADOW.includes(name); m.receiveShadow = true; m.userData.kind = name;
      group.add(m);
    }
    const blobs = []; for (const [name, list] of Object.entries(inst)) if (CONTACT[name]) for (const o of list) blobs.push([o.x, o.y, o.z, CONTACT[name] * o.s]);
    if (blobs.length) group.add(contactShadows(blobs));
    // poças do barreiro e lava do vulcão
    for (const c of Object.values(ctx)) {
      if (c.biome === 'barreiro') for (const [px, pz, r] of PITS) { const w = new T.Mesh(new T.CircleGeometry(r * .62, 18), new T.MeshStandardMaterial({ color: new T.Color('#7a5236').convertSRGBToLinear(), roughness: .08, metalness: .1, transparent: true, opacity: .85 })); w.rotation.x = -Math.PI / 2; w.position.set(c.x + px, heightAt(c.x + px, c.z + pz) + .012, c.z + pz); group.add(w); }
      if (c.biome === 'vulcao') {
        const lava = new T.Mesh(new T.CircleGeometry(.2, 20), new T.MeshBasicMaterial({ color: new T.Color('#ff5a12').convertSRGBToLinear() })); lava.rotation.x = -Math.PI / 2; lava.position.set(c.x, heightAt(c.x, c.z) + .03, c.z); group.add(lava);
        // três escorridos de lava descendo as encostas, colados ao relevo
        const flowMat = new T.MeshBasicMaterial({ color: new T.Color('#f04a0c').convertSRGBToLinear() });
        for (const ang of [.5, 2.6, 4.4]) {
          const pts = []; for (let k = 0; k <= 12; k++) { const rr = .22 + k * .04, wob = Math.sin(k * 1.3 + ang * 3) * .05, a = ang + wob; const x = c.x + Math.cos(a) * rr, z = c.z + Math.sin(a) * rr; pts.push(new T.Vector3(x, heightAt(x, z) + .012, z)); }
          const tube = new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(pts), 24, .022, 5, false), flowMat); group.add(tube);
        }
        const glow = new T.PointLight(0xff7a2a, 1.2, 1.6, 2); glow.position.set(c.x, heightAt(c.x, c.z) + .25, c.z); group.add(glow);
        const halo = new T.Sprite(new T.SpriteMaterial({ map: softDot(), color: new T.Color('#ff6a20'), transparent: true, opacity: .55, depthWrite: false, blending: T.AdditiveBlending }));
        halo.position.set(c.x, heightAt(c.x, c.z) + .12, c.z); halo.scale.setScalar(.75); halo.renderOrder = 4; group.add(halo);
        onFrame(t => { halo.material.opacity = .45 + Math.sin(t * 3) * .1; });
        onFrame(t => { lava.material.color.setHSL(.04, 1, .22 + Math.sin(t * 2) * .04); glow.intensity = 1.1 + Math.sin(t * 3) * .25; });
        const vents = [[c.x, heightAt(c.x, c.z) + .05, c.z, 1.4]].concat((inst.fumarole || []).filter(o => Math.hypot(o.x - c.x, o.z - c.z) < 1).map(o => [o.x, o.y + .08 * o.s, o.z, .5]));
        group.add(smoke(vents));
      }
    }
    return { group, heightAt, ctx, tokenSpot: id => { const c = ctx[id]; if (!c) return null; const [ox, oz] = PEAK_TOKEN[c.biome] || [0, 0]; return { x: c.x + ox, z: c.z + oz, y: heightAt(c.x + ox, c.z + oz) }; } };
  }

  const PROTO_MAT = { obsidian: { roughness: .12, metalness: .35 }, block: { roughness: .72 }, blockStack: { roughness: .72 }, mushroom: { roughness: .5 }, buoy: { roughness: .35 }, shell: { roughness: .3 } };
  const NO_SHADOW = ['tuft', 'flower', 'fish', 'shell', 'starfish', 'mushroom'];
  let puffTex;
  function softDot() {
    if (puffTex) return puffTex;
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
    const rg = g.createRadialGradient(32, 32, 0, 32, 32, 32); rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(.5, 'rgba(255,255,255,.45)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rg; g.fillRect(0, 0, 64, 64); return (puffTex = new T.CanvasTexture(c));
  }
  function smoke(vents) {
    const N = 70, pos = new Float32Array(N * 3), alpha = new Float32Array(N), size = new Float32Array(N), life = new Float32Array(N), seed = rng(17);
    const vel = Array.from({ length: N }, () => [0, 0, 0]), src = new Int8Array(N);
    const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(pos, 3)); geo.setAttribute('aAlpha', new T.BufferAttribute(alpha, 1)); geo.setAttribute('aSize', new T.BufferAttribute(size, 1));
    const mat = new T.ShaderMaterial({
      transparent: true, depthWrite: false, uniforms: { uTex: { value: softDot() } },
      vertexShader: `attribute float aAlpha; attribute float aSize; varying float vA; void main(){ vA = aAlpha; vec4 mv = modelViewMatrix * vec4(position, 1.); gl_PointSize = aSize * (260. / -mv.z); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D uTex; varying float vA; void main(){ vec4 t = texture2D(uTex, gl_PointCoord); gl_FragColor = vec4(vec3(.58, .56, .54), t.a * vA); }`,
    });
    const pts = new T.Points(geo, mat); pts.frustumCulled = false; pts.renderOrder = 3; // depois da água (que é transparente e não deixaria a fumaça aparecer)
    // nasce cada partícula em uma saída (a cratera solta mais fumaça que as fumarolas)
    const weights = vents.map(v => v[3]), wsum = weights.reduce((a, b) => a + b, 0);
    const spawn = i => { let k = seed() * wsum, j = 0; while ((k -= weights[j]) > 0 && j < vents.length - 1) j++; const v = vents[j]; src[i] = j; pos[i * 3] = v[0] + (seed() - .5) * .06; pos[i * 3 + 1] = v[1]; pos[i * 3 + 2] = v[2] + (seed() - .5) * .06; vel[i] = [(seed() - .5) * .04 + .05, .26 + seed() * .14, (seed() - .5) * .04]; life[i] = 0; };
    for (let i = 0; i < N; i++) { spawn(i); life[i] = seed() * 5.5; }
    let last = 0;
    onFrame(t => {
      const dt = Math.min(.05, Math.max(0, t - last)); last = t;
      for (let i = 0; i < N; i++) {
        life[i] += dt; const k = life[i] / 5.5, big = vents[src[i]][3] > 1;
        if (k >= 1) { spawn(i); continue; }
        pos[i * 3] += vel[i][0] * dt; pos[i * 3 + 1] += vel[i][1] * dt * (1 - k * .5); pos[i * 3 + 2] += vel[i][2] * dt;
        size[i] = (big ? .35 : .16) + k * (big ? 1.4 : .55); alpha[i] = Math.pow(Math.sin(k * Math.PI), .7) * (big ? .75 : .45);
      }
      geo.attributes.position.needsUpdate = geo.attributes.aAlpha.needsUpdate = geo.attributes.aSize.needsUpdate = true;
    });
    return pts;
  }
  // distribui os enfeites de um bioma (com folga para a ficha de número e para as bordas)
  function scatter(c, put, heightAt) {
    const r = rng(c.seed * 131 + 7), [tx, tz] = PEAK_TOKEN[c.biome] || [0, 0];
    const inside = (lx, lz, margin = .1) => normals.every(([nx, nz]) => lx * nx + lz * nz < APO - margin);
    const free = (lx, lz, rad = .36) => Math.hypot(lx - tx, lz - tz) > rad;
    const sample = (n, margin, fn) => { let k = 0, tries = 0; while (k < n && tries++ < n * 30) { const lx = (r() - .5) * 2, lz = (r() - .5) * 2; if (!inside(lx, lz, margin) || !free(lx, lz)) continue; if (fn(lx, lz, c.x + lx, c.z + lz) !== false) k++; } };
    const g = (a, b) => a + r() * (b - a);
    if (c.biome === 'mata') {
      // aglomerados naturais: 3 bosques, com sub-bosque em volta e clareiras floridas entre eles
      const groves = []; sample(3, .3, (lx, lz) => { if (groves.some(([a, b]) => Math.hypot(a - lx, b - lz) < .55)) return false; groves.push([lx, lz]); });
      const around = (n, spread, margin, fn) => { for (const [gx, gz] of groves) for (let k = 0, t = 0; k < n && t < n * 20; t++) { const a = r() * 6.3, d = Math.abs(r() + r() - 1) * spread, lx = gx + Math.cos(a) * d, lz = gz + Math.sin(a) * d; if (!inside(lx, lz, margin) || !free(lx, lz)) continue; fn(lx, lz, c.x + lx, c.z + lz); k++; } };
      const leaf = () => [g(.8, 1.08), g(.88, 1.1), g(.78, 1)];
      around(3, .28, .16, (lx, lz, x, z) => { const k = r(); put(k < .38 ? 'palm' : k < .7 ? 'tree' : k < .85 ? 'tree2' : 'tall', x, z, g(.7, 1.05), r() * 6.3, leaf()); });
      around(4, .38, .08, (lx, lz, x, z) => put(r() < .5 ? 'bush' : 'fern', x, z, g(.7, 1.3), r() * 6.3, leaf()));
      around(2, .3, .1, (lx, lz, x, z) => put('mushroom', x, z, g(.8, 1.3), r() * 6.3));
      sample(1, .25, (lx, lz, x, z) => put('log', x, z, g(.9, 1.1), r() * 6.3));
      const petals = [[1, .9, .95], [1, .85, .3], [.95, .55, .85], [1, 1, 1]];
      sample(16, .06, (lx, lz, x, z) => { if (groves.some(([a, b]) => Math.hypot(a - lx, b - lz) < .25)) return false; put('flower', x, z, g(.8, 1.3), r() * 6.3, petals[Math.floor(r() * 4)]); });
      sample(16, .04, (lx, lz, x, z) => put('tuft', x, z, g(.8, 1.2), r() * 6.3, [g(.85, 1.05), 1, g(.8, 1)]));
    } else if (c.biome === 'algodoal') {
      // fileiras paralelas, levemente onduladas
      const rot = .5, cs = Math.cos(rot), sn = Math.sin(rot);
      for (let row = -4; row <= 4; row++) for (let k = -7; k <= 7; k++) {
        const a = k * .105, b = row * .165 + Math.sin(k * .7) * .015, lx = a * cs - b * sn, lz = a * sn + b * cs;
        if (!inside(lx, lz, .2) || !free(lx, lz, .3)) continue;
        // a cada três fileiras, uma ainda nova (verde e baixa): variação de cor e altura no campo
        if ((row + 9) % 3 === 0) put('cottonYoung', c.x + lx, c.z + lz, g(.8, 1.1), r() * 6.3, [g(.9, 1), 1, g(.85, 1)]);
        else put('cotton', c.x + lx, c.z + lz, g(.58, .88), r() * 6.3, [g(.92, 1), g(.95, 1.05), g(.9, 1)]);
      }
      put('scarecrow', c.x - .34, c.z + .36, 1.1, .4);
      for (const [px, pz] of [[.52, -.26], [.47, -.36], [-.1, -.6]]) if (inside(px, pz, .06) && free(px, pz)) put('basket', c.x + px, c.z + pz, g(.9, 1.1), r() * 6.3);
      for (let k = 0; k < 6; k++) { const ang = Math.PI / 3 * k + Math.PI / 6, lx = Math.cos(ang) * .7, lz = Math.sin(ang) * .7; if (k % 2 === 0 && free(lx, lz)) put('fence', c.x + lx, c.z + lz, 1, -ang + Math.PI / 2); }
      sample(8, .04, (lx, lz, x, z) => { if (!inside(lx, lz, .2)) put('tuft', x, z, g(.7, 1)); else return false; });
    } else if (c.biome === 'barreiro') {
      put('kiln', c.x + .3, c.z + .22, 1.1, -.6);
      for (let k = 0; k < 4; k++) { const px = -.5 + k * .13, pz = -.42 + k * .03; if (free(px, pz)) put('bricks', c.x + px, c.z + pz, g(.9, 1.1), .2); } // fileira secando
      for (const [px, pz] of [[.42, -.05], [.05, .5]]) if (free(px, pz)) put('bricks', c.x + px, c.z + pz, g(.9, 1.2), r() * 6.3);
      sample(5, .14, (lx, lz, x, z) => put('clay', x, z, g(.8, 1.3), r() * 6.3));
      for (const [px, pz, rot] of [[-.12, .55, .3], [.52, .2, 1.4]]) if (inside(px, pz, .12) && free(px, pz)) put('rack', c.x + px, c.z + pz, 1, rot);
      for (const [px, pz, rr] of PITS) for (let k = 0; k < 4; k++) { const a = k * 1.6 + r(), lx = px + Math.cos(a) * rr * .75, lz = pz + Math.sin(a) * rr * .75; if (free(lx, lz)) put('reed', c.x + lx, c.z + lz, g(.8, 1.2), r() * 6.3); }
      sample(6, .1, (lx, lz, x, z) => put('tuft', x, z, g(.7, 1.1), r() * 6.3, [.8, .85, .6]));
      sample(4, .15, (lx, lz, x, z) => put('rockSmall', x, z, g(.8, 1.4), r() * 6.3, [1, .8, .7]));
    } else if (c.biome === 'pedreira') {
      // pátio da pedreira na parte baixa: blocos cortados, pilhas e um guindaste de madeira
      sample(5, .14, (lx, lz, x, z) => { if (heightAt(x, z) > RIM + .1) return false; put(r() < .5 ? 'block' : 'blockStack', x, z, g(.9, 1.2), r() * 6.3, [g(.95, 1.05), g(.95, 1.05), g(.95, 1.05)]); });
      sample(1, .18, (lx, lz, x, z) => { if (heightAt(x, z) > RIM + .1) return false; put('crane', x, z, 1, Math.atan2(-lz, lx)); });
      sample(7, .14, (lx, lz, x, z) => put('boulder', x, z, g(.6, 1.1), r() * 6.3, [g(.9, 1.05), g(.9, 1.05), g(.95, 1.1)], null, g(-.2, .2)));
      sample(16, .08, (lx, lz, x, z) => put(r() < .5 ? 'rock' : 'rockSmall', x, z, g(.6, 1.2), r() * 6.3, [g(.9, 1.1), g(.9, 1.1), g(.95, 1.1)], null, g(-.3, .3)));
      sample(8, .06, (lx, lz, x, z) => { if (heightAt(x, z) < RIM + .2) put('tuft', x, z, g(.7, 1)); else return false; });
      sample(3, .2, (lx, lz, x, z) => { if (heightAt(x, z) < RIM + .2) put('tall', x, z, g(.6, .8), r() * 6.3); else return false; });
    } else if (c.biome === 'vulcao') {
      sample(12, .08, (lx, lz, x, z) => { if (Math.hypot(lx, lz) > .22) put('pumice', x, z, g(.6, 1.4), r() * 6.3, null, null, g(-.3, .3)); else return false; });
      sample(6, .1, (lx, lz, x, z) => { if (Math.hypot(lx, lz) > .62) put('rockSmall', x, z, g(.8, 1.3), r() * 6.3, [.5, .48, .48]); else return false; });
      sample(6, .1, (lx, lz, x, z) => { const d = Math.hypot(lx, lz); if (d > .3 && d < .7) put('obsidian', x, z, g(.8, 1.3), r() * 6.3, null, null, g(-.2, .2)); else return false; });
      sample(3, .12, (lx, lz, x, z) => { const d = Math.hypot(lx, lz); if (d > .35 && d < .6) put('fumarole', x, z, g(.9, 1.2), r() * 6.3); else return false; });
    }
  }

  // ---------- oceano ----------
  // água com profundidade (cor e transparência pela distância da costa), espuma na beira e brilho do sol
  function ocean(tiles, size = 30) {
    const land = tiles.filter(t => BIOME[t.biome]);
    // a textura da costa cobre só a área das ilhas (com folga); fora dela é mar fundo
    const span = Math.max(...land.map(t => Math.max(Math.abs(t.x), Math.abs(t.z)))) * 2 + 5;
    const N = 512, ext = span / 2, cv = document.createElement('canvas'); cv.width = cv.height = N;
    const g = cv.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, N, N);
    const toPx = v => (v + ext) / span * N, hexPath = (x, z, r) => { g.beginPath(); for (let i = 0; i < 6; i++) { const a = Math.PI / 180 * (60 * i - 30); g.lineTo(toPx(x + r * Math.cos(a)), toPx(z + r * Math.sin(a))); } g.closePath(); };
    const ppu = N / span; // pixels por unidade
    const shoals = tiles.filter(t => t.biome === 'cardume');
    g.save(); g.filter = `blur(${.5 * ppu}px)`; g.fillStyle = 'rgba(255,255,255,.62)'; for (const t of shoals) { hexPath(t.x, t.z, .95); g.fill(); } g.restore();
    for (const [blur, a] of [[1.1 * ppu, .55], [.45 * ppu, .7], [.12 * ppu, .95]]) { g.save(); g.filter = `blur(${blur}px)`; g.fillStyle = `rgba(255,255,255,${a})`; for (const t of land) { hexPath(t.x, t.z, 1); g.fill(); } g.restore(); }
    const coast = new T.CanvasTexture(cv); coast.flipY = false; // linha 0 do canvas = z mínimo
    const mat = new T.ShaderMaterial({
      transparent: true,
      uniforms: Object.assign({ uTime: { value: 0 }, uCoast: { value: coast }, uSize: { value: span } }, WATER_U),
      vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `uniform float uTime, uSize, uFogNear, uFogFar; uniform sampler2D uCoast; uniform vec3 uSun, uSunCol, uSky, uFog; varying vec3 vW;
        float wave(vec2 p, vec2 d, float f, float s){ return sin(dot(p, d) * f + uTime * s); }
        void main(){
          vec2 uv = vW.xz / uSize + .5; float c = (uv.x < 0. || uv.y < 0. || uv.x > 1. || uv.y > 1.) ? 0. : texture2D(uCoast, uv).r;
          c = max(0., c - .03) / .97 * smoothstep(0., .08, min(min(uv.x, uv.y), min(1. - uv.x, 1. - uv.y))); // sem degrau na borda da textura da costa
          vec2 p = vW.xz;
          float h = wave(p, vec2(.8,.6), 3.1, 1.1) + wave(p, vec2(-.5,.86), 4.3, 1.4) * .6 + wave(p, vec2(.2,-1.), 7.9, 2.1) * .3;
          vec3 n = normalize(vec3(cos(dot(p, vec2(.8,.6)) * 3.1 + uTime * 1.1) * .08 + cos(dot(p, vec2(-.5,.86)) * 4.3 + uTime * 1.4) * .05, 1., cos(dot(p, vec2(.2,-1.)) * 7.9 + uTime * 2.1) * .05));
          vec3 deep = vec3(.02, .16, .26), mid = vec3(.03, .36, .48), shallow = vec3(.25, .78, .76);
          vec3 col = mix(deep, mid, smoothstep(0., .35, c)); col = mix(col, shallow, smoothstep(.35, .85, c));
          vec3 V = normalize(cameraPosition - vW); vec3 H = normalize(uSun + V);
          float spec = pow(max(dot(n, H), 0.), 140.) * 1.4; float fres = pow(1. - max(dot(n, V), 0.), 3.);
          col += uSunCol * spec + uSky * fres * .3;
          float band = sin(c * 26. - uTime * 1.5 + h * .6);
          float foam = smoothstep(.75, 1., band) * smoothstep(.5, .8, c) + smoothstep(.86, .95, c) * .9;
          col = mix(col, vec3(.96, .98, 1.), clamp(foam, 0., 1.) * .8);
          float a = mix(.96, .26, smoothstep(.25, .9, c));
          float fogK = smoothstep(uFogNear, uFogFar, length(vW - cameraPosition)); // horizonte some na névoa
          gl_FragColor = vec4(mix(col, uFog, fogK), mix(a, 1., fogK));
        }`,
    });
    const water = new T.Mesh(new T.PlaneGeometry(size, size, 1, 1), mat); water.rotation.x = -Math.PI / 2; water.position.y = WATER; water.renderOrder = 2;
    const bedTex = new T.TextureLoader().load('assets/arq/tex_areia.webp'); bedTex.encoding = T.sRGBEncoding; bedTex.wrapS = bedTex.wrapT = T.RepeatWrapping; bedTex.repeat.set(size / 2.2, size / 2.2);
    const bed = new T.Mesh(new T.PlaneGeometry(size, size), new T.MeshStandardMaterial({ map: bedTex, color: new T.Color('#c8b98a').convertSRGBToLinear(), roughness: 1 }));
    bed.rotation.x = -Math.PI / 2; bed.position.y = FLOOR; // sem sombra: o fundo fica sob a água e a borda da área de sombra apareceria como um retângulo
    const g2 = new T.Group(); g2.add(bed, water); onFrame(t => { mat.uniforms.uTime.value = t; });
    return g2;
  }
  // recifes dos cardumes: todos os bancos de areia, corais, algas, conchas, peixes e boias de uma vez
  // (uma malha instanciada por tipo para o mapa inteiro, em vez de ~7 malhas por cardume)
  function reefs(list, heightAtSea = -.1) {
    const g = new T.Group(), P = protos(), D = new T.Object3D(), col = new T.Color(), top = -.18;
    const bankTex = new T.TextureLoader().load('assets/arq/tex_areia.webp'); bankTex.encoding = T.sRGBEncoding; bankTex.wrapS = bankTex.wrapT = T.RepeatWrapping; bankTex.repeat.set(2, 2);
    const bankGeos = list.map(t => new T.CylinderGeometry(.9, 1.02, FLOOR * -1 - .18, 6).rotateY(Math.PI / 6).translate(t.x, (FLOOR - .18) / 2, t.z));
    const bank = new T.Mesh(THREE.BufferGeometryUtils.mergeBufferGeometries(bankGeos), new T.MeshStandardMaterial({ map: bankTex, color: new T.Color('#e8dcb0').convertSRGBToLinear(), roughness: 1 }));
    bank.receiveShadow = true; g.add(bank);
    const inst = (proto, perTile, place, mat = {}) => {
      const m = new T.InstancedMesh(proto, new T.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: .6, ...mat }), perTile * list.length); let i = 0;
      for (const t of list) { const r = rng(t.id * 31 + proto.uuid.charCodeAt(0)); for (let k = 0; k < perTile; k++, i++) { place(D, t, r, k); D.updateMatrix(); m.setMatrixAt(i, D.matrix); if (m.userData.tint) { m.userData.tint(col, r); m.setColorAt(i, col); } } }
      g.add(m); return m;
    };
    const onBank = (D, t, r, minD = .15, maxD = .78) => { const a = r() * 6.3, d = minD + r() * (maxD - minD); D.position.set(t.x + Math.cos(a) * d, top + .005, t.z + Math.sin(a) * d); D.rotation.set(0, r() * 6.3, 0); };
    const coral = new T.InstancedMesh(P.coral, new T.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: .7 }), 10 * list.length);
    list.forEach((t, ti) => { const r = rng(t.id * 31 + 5); for (let k = 0; k < 10; k++) { onBank(D, t, r, .2, .75); D.scale.setScalar(.9 + r() * .9); D.updateMatrix(); coral.setMatrixAt(ti * 10 + k, D.matrix); col.setHSL(.02 + r() * .1, .8, .6); coral.setColorAt(ti * 10 + k, col); } });
    g.add(coral);
    const weed = inst(P.seaweed, 9, (D, t, r) => { onBank(D, t, r, .2); D.scale.setScalar(.7 + r() * .6); });
    windify(weed.material, 3, .45); // algas: balanço lento, como na correnteza
    inst(P.shell, 8, (D, t, r) => { onBank(D, t, r); D.scale.setScalar(.8 + r() * .7); }, { roughness: .3 });
    inst(P.starfish, 4, (D, t, r) => { onBank(D, t, r); D.scale.setScalar(.9 + r() * .5); });
    const buoy = inst(P.buoy, 1, (D, t) => { D.position.set(t.x + .72, 0, t.z - .3); D.rotation.set(0, 0, 0); D.scale.setScalar(1.2); }, { roughness: .35 });
    const NF = 8, fish = new T.InstancedMesh(P.fish, new T.MeshStandardMaterial({ vertexColors: true, flatShading: true }), NF * list.length); g.add(fish);
    const fr = rng(7), phase = Array.from({ length: NF * list.length }, () => fr() * 6.3), rad = Array.from({ length: NF * list.length }, () => .25 + fr() * .45);
    const F = new T.Object3D();
    onFrame(time => {
      list.forEach((t, ti) => {
        for (let k = 0; k < NF; k++) { const i = ti * NF + k, a = time * (.5 + k * .05) + phase[i]; F.position.set(t.x + Math.cos(a) * rad[i], heightAtSea + Math.sin(a * 3) * .02, t.z + Math.sin(a) * rad[i]); F.rotation.set(0, -a - Math.PI / 2, 0); F.scale.setScalar(1); F.updateMatrix(); fish.setMatrixAt(i, F.matrix); }
        F.position.set(t.x + .72, Math.sin(time * 1.8 + ti) * .018 - .005, t.z - .3); F.rotation.set(Math.sin(time * 1.3 + ti) * .12, 0, Math.cos(time * 1.6 + ti) * .12); F.scale.setScalar(1.2); F.updateMatrix(); buoy.setMatrixAt(ti, F.matrix);
      });
      fish.instanceMatrix.needsUpdate = true; buoy.instanceMatrix.needsUpdate = true;
    });
    return g;
  }
  const reef = t => reefs([t]);
  // ---------- luz e atmosfera ----------
  const WATER_U = { uSun: { value: new THREE.Vector3(-.5, .75, .45).normalize() }, uSunCol: { value: new THREE.Color(1, .95, .82) }, uSky: { value: new THREE.Color(.55, .75, .85) }, uFog: { value: new THREE.Color(.62, .78, .82) }, uFogNear: { value: 11 }, uFogFar: { value: 24 } };
  // horários: sol (cor, força, direção), céu e chão da luz de preenchimento, névoa e graduação de cor da tela
  const PRESETS = {
    manha: { sun: '#fff1d8', sunI: 1.5, dir: [-3.5, 9, 6], sky: '#d6ecff', ground: '#6a5a40', hemi: .32, fog: '#a9d0dc', top: '#7fb6d6', hor: '#cfe6ee', grade: 'saturate(1.05) brightness(1.02)', env: 1 },
    tarde: { sun: '#ffd9a4', sunI: 1.55, dir: [-5, 7, 4.5], sky: '#cfe2ff', ground: '#5a4630', hemi: .3, fog: '#9cc7d2', top: '#6aa4c8', hor: '#f2dcc0', grade: 'saturate(1.08) contrast(1.04)', env: .9 },
    por: { sun: '#ff9a5a', sunI: 1.5, dir: [-7, 3.6, 2.5], sky: '#c9b6e6', ground: '#4a3020', hemi: .38, fog: '#d8a890', top: '#5a6aa8', hor: '#ffb07a', grade: 'saturate(1.1) contrast(1.06) sepia(.08)', env: .75 },
  };
  // opts: ext = meia largura da área com sombra; fog = [perto, longe] da névoa (o tabuleiro inteiro pede valores maiores)
  function atmosphere(scene, renderer, opts = {}) {
    const ext = opts.ext || 4.6, fogN = opts.fog?.[0] ?? 12, fogF = opts.fog?.[1] ?? 26;
    T = THREE; // pode ser chamada antes de build()
    const sun = new T.DirectionalLight(0xffffff, 1.5); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -ext, right: ext, top: ext, bottom: -ext, near: 1, far: 30 + ext * 2 }); sun.shadow.bias = -.0004; sun.shadow.normalBias = .02;
    const hemi = new T.HemisphereLight(0xffffff, 0x000000, .3), rim = new T.DirectionalLight(0x9ec4ff, .3); rim.position.set(5, 4, -6);
    scene.add(sun, sun.target, hemi, rim);
    const pmrem = new T.PMREMGenerator(renderer); let envRT = null;
    const lin = h => new T.Color(h).convertSRGBToLinear();
    function setPreset(name) {
      const P = PRESETS[name] || PRESETS.tarde;
      sun.color.copy(lin(P.sun)); sun.intensity = P.sunI; sun.position.set(...P.dir.map(v => v * Math.max(1, ext / 4.6)));
      hemi.color.copy(lin(P.sky)); hemi.groundColor.copy(lin(P.ground)); hemi.intensity = P.hemi;
      const fog = lin(P.fog); scene.background = fog; scene.fog = new T.Fog(fog.getHex(), fogN, fogF); WATER_U.uFogNear.value = fogN - 1; WATER_U.uFogFar.value = fogF - 2;
      WATER_U.uSun.value.set(...P.dir).normalize(); WATER_U.uSunCol.value.set(P.sun); WATER_U.uSky.value.set(P.sky); WATER_U.uFog.value.set(P.fog);
      // luz de ambiente: um céu em degradê vira o mapa de reflexo de todos os materiais (PBR)
      // céu em degradê nas cores dos vértices, com material embutido (o PMREM desta versão grava em RGBE e precisa da codificação de saída do Three)
      const sg = new T.SphereGeometry(10, 32, 16), cols = [], top = lin(P.top), hor = lin(P.hor), gnd = lin(P.ground), pp = sg.attributes.position;
      for (let i = 0; i < pp.count; i++) { const y = pp.getY(i) / 10, c = y > 0 ? hor.clone().lerp(top, Math.pow(y, .6)) : hor.clone().lerp(gnd, Math.pow(-y, .5)); cols.push(c.r, c.g, c.b); }
      sg.setAttribute('color', new T.Float32BufferAttribute(cols, 3));
      const sky = new T.Scene(), sph = new T.Mesh(sg, new T.MeshBasicMaterial({ vertexColors: true, side: T.BackSide }));
      sky.add(sph); envRT?.dispose(); envRT = pmrem.fromScene(sky, .02); scene.environment = envRT.texture;
      scene.traverse(o => { if (o.material && 'envMapIntensity' in o.material) o.material.envMapIntensity = P.env; });
      return P;
    }
    return { sun, hemi, setPreset, PRESETS };
  }
  // sombras de contato: manchas suaves sob cada objeto (dão peso e "pousam" o objeto no chão), todas num só desenho
  let blobTex;
  function contactShadows(list) {
    if (!blobTex) { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const rg = g.createRadialGradient(32, 32, 2, 32, 32, 32); rg.addColorStop(0, 'rgba(0,0,0,.85)'); rg.addColorStop(.55, 'rgba(0,0,0,.35)'); rg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = rg; g.fillRect(0, 0, 64, 64); blobTex = new T.CanvasTexture(c); }
    const geo = new T.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), mat = new T.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, opacity: .5, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const m = new T.InstancedMesh(geo, mat, list.length), D = new T.Object3D();
    list.forEach(([x, y, z, r], i) => { D.position.set(x, y + .006, z); D.rotation.set(0, 0, 0); D.scale.set(r * 2, 1, r * 2); D.updateMatrix(); m.setMatrixAt(i, D.matrix); });
    m.renderOrder = 1; return m;
  }
  const CONTACT = { palm: .14, tree: .26, tree2: .22, tall: .17, bush: .12, fern: .09, boulder: .22, rock: .14, kiln: .2, crane: .18, scarecrow: .07, rack: .16, blockStack: .12, block: .08, clay: .14, log: .14, basket: .06, cotton: .05, obsidian: .08, fumarole: .1 };
  // ficha de número: disco de madeira com o número e a chance (pontos) pintados no tampo
  const tokenCache = {};
  function tokenMesh(num) {
    if (!tokenCache[num]) {
      const red = num === 6 || num === 8, pips = 6 - Math.abs(7 - num);
      const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
      g.fillStyle = '#7a5530'; g.fillRect(0, 0, 256, 256); // fundo de madeira (usado pela lateral da ficha)
      const rg = g.createRadialGradient(118, 110, 20, 128, 128, 128); rg.addColorStop(0, '#fbf3dc'); rg.addColorStop(1, '#e6d4a8');
      g.fillStyle = rg; g.beginPath(); g.arc(128, 128, 122, 0, Math.PI * 2); g.fill();
      g.lineWidth = 9; g.strokeStyle = '#7a5a34'; g.stroke(); g.lineWidth = 3; g.strokeStyle = 'rgba(122,90,52,.45)'; g.beginPath(); g.arc(128, 128, 104, 0, Math.PI * 2); g.stroke();
      g.fillStyle = red ? '#b8241a' : '#2a1e10'; g.font = `700 ${red ? 118 : 104}px Georgia, serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(num, 128, 116);
      for (let i = 0; i < pips; i++) { g.beginPath(); g.arc(128 + (i - (pips - 1) / 2) * 22, 198, 8, 0, Math.PI * 2); g.fill(); }
      const tex = new T.CanvasTexture(c); tex.encoding = T.sRGBEncoding; tex.anisotropy = 8;
      tokenCache[num] = { mat: new T.MeshStandardMaterial({ map: tex, roughness: .55 }) };
    }
    // geometria única para todas as fichas: tampo mapeado no disco pintado, lateral num canto de madeira da textura
    if (!tokenCache.geo) {
      const geo = new T.CylinderGeometry(.24, .25, .06, 32), n = geo.attributes.normal, uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) if (Math.abs(n.getY(i)) < .5) uv.setXY(i, .03, .03);
      tokenCache.geo = geo;
    }
    const m = new T.Mesh(tokenCache.geo, tokenCache[num].mat);
    m.rotation.y = Math.PI / 2; m.castShadow = false; m.receiveShadow = true; return m; // sem sombra projetada: a sombra de contato já assenta a ficha
  }
  // gaivotas voando em círculos ao longe e um veleiro dando a volta na ilha
  function ambient(radius = 4) {
    const g = new T.Group(), white = new T.MeshStandardMaterial({ color: new T.Color('#f4f1ea').convertSRGBToLinear(), roughness: .7, side: T.DoubleSide });
    const gulls = [];
    for (let k = 0; k < 3; k++) {
      const bird = new T.Group(), body = new T.Mesh(new T.ConeGeometry(.018, .09, 5).rotateX(Math.PI / 2), white);
      const wing = () => { const sh = new T.Shape(); sh.moveTo(0, 0); sh.lineTo(.11, .025); sh.lineTo(.13, -.01); sh.lineTo(0, -.03); const m = new T.Mesh(new T.ShapeGeometry(sh).rotateX(-Math.PI / 2), white); return m; };
      const L = wing(), R = wing(); R.scale.x = -1; bird.add(body, L, R); g.add(bird);
      gulls.push({ bird, L, R, r: radius * (.7 + k * .18), h: 2 + k * .35, sp: .16 + k * .03, ph: k * 2.1 });
    }
    // veleiro (casco, mastro e vela)
    const boat = new T.Group(), hullSh = new T.Shape(); hullSh.moveTo(-.18, -.06); hullSh.lineTo(.1, -.06); hullSh.quadraticCurveTo(.22, 0, .1, .06); hullSh.lineTo(-.18, .06); hullSh.closePath();
    const hull = new T.Mesh(new T.ExtrudeGeometry(hullSh, { depth: .06, bevelEnabled: true, bevelThickness: .012, bevelSize: .012, bevelSegments: 1 }).rotateX(Math.PI / 2).translate(0, .06, 0), new T.MeshStandardMaterial({ color: new T.Color('#7a4a2a').convertSRGBToLinear(), roughness: .7 }));
    const sailSh = new T.Shape(); sailSh.moveTo(0, 0); sailSh.lineTo(0, .3); sailSh.quadraticCurveTo(.09, .15, .15, .02); sailSh.closePath();
    const sail = new T.Mesh(new T.ShapeGeometry(sailSh), white); sail.position.set(-.02, .08, 0);
    const mast = new T.Mesh(new T.CylinderGeometry(.006, .006, .34, 5), hull.material); mast.position.set(-.02, .23, 0);
    hull.castShadow = sail.castShadow = true; boat.add(hull, sail, mast); g.add(boat);
    onFrame(t => {
      for (const s of gulls) { const a = t * s.sp + s.ph; s.bird.position.set(Math.cos(a) * s.r, s.h + Math.sin(t * .7 + s.ph) * .15, Math.sin(a) * s.r); s.bird.rotation.set(0, -a, Math.sin(a) * .2); const f = Math.sin(t * 7 + s.ph) * .55; s.L.rotation.z = f; s.R.rotation.z = -f; }
      const a = t * .045 + 1, br = radius * .95; boat.position.set(Math.cos(a) * br, -.015 + Math.sin(t * 1.9) * .012, Math.sin(a) * br * .92); boat.rotation.set(Math.sin(t * 1.4) * .05, -a - Math.PI / 2 + Math.PI, Math.sin(t * 1.1) * .06);
      sail.rotation.y = Math.sin(t * .8) * .1;
    });
    return g;
  }
  function animate(_, time) { WIND.value = time; for (const fn of ANIM) fn(time); }


  return { build, ocean, reef, reefs, ambient, animate, atmosphere, contactShadows, tokenMesh, clearAnimations: () => { ANIM.length = 0; }, houseGeo, cityGeo, roadGeo, BIOME, RIM, WATER, FLOOR, SHORE, normals };
})();
