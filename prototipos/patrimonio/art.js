// Patrimônio: tudo que é pintado à mão em canvas. Ladrilhos, ilustrações, mosaico, rua, madeira, dados e cartas.
const Art = (() => {
  const INK = '#1f1a16', PAPER = '#fffdf6', CREAM = '#fbf6e8', BRASS = '#f0b429', GO = '#12924f', TERRA = '#c8552f', WATER = '#3a8fb2', LEAF = '#2f7d57', SAND = '#edd6a4', RED = '#c8342e';
  const SERIF = "'Lilita One', Nunito, system-ui, sans-serif", SANS = 'Nunito, system-ui, sans-serif';
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  let seed = 12345;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) | 0; return ((seed >>> 8) & 0xffffff) / 0x1000000; };
  // sem internet as fontes não chegam: depois de alguns segundos segue com a fonte reserva
  // imagens geradas para as casas das nossas cidades; o valor é onde fica o assunto na largura da imagem, para o recorte
  const PHOTO_FOCUS = { alter: .55, iracema: .62, petrolina: .55, recife: .5, taguatinga: .5, santos: .5, campinas: .5, tresmarias: .55, ouropreto: .5, pampulha: .55, aviao: .5, canoa: .58, cantareira: .5, cassino: .5, copacabana: .5, cristo: .36, descoberto: .55, destino: .5, esplanada: .5, itaipu: .5, jeri: .5, leao: .5, luxo: .5, mutirao: .47, paraty: .5, pelourinho: .5, paulista: .5, saopedro: .5, terezinha: .5, veropeso: .5 }, photos = {};
  const loadPhotos = () => Promise.all(Object.keys(PHOTO_FOCUS).map(id => new Promise(res => { if (photos[id]) return res(); const i = new Image(); i.onload = () => { photos[id] = i; res(); }; i.onerror = res; i.src = `img/${id}.jpg`; })));
  function coverPhoto(x, id, ax, ay, aw, ah) { x.imageSmoothingQuality = 'high'; const i = photos[id], s = Math.max(aw / i.width, ah / i.height), sw = aw / s, sh = ah / s, sx = Math.max(0, Math.min(i.width - sw, i.width * PHOTO_FOCUS[id] - sw / 2)); x.drawImage(i, sx, (i.height - sh) / 2, sw, sh, ax, ay, aw, ah); }
  const ready = () => Promise.all([loadPhotos(), Promise.race([Promise.all(['400 40px "Lilita One"', '800 40px Nunito', '900 40px Nunito'].map(f => document.fonts.load(f, 'Patrimônio R$ 123'))).catch(() => {}), new Promise(r => setTimeout(r, 4000))])]);

  // ---------- atalhos de desenho, numa caixa de 100 x 100 ----------
  const C = (x, y, r) => `M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
  const R = (x, y, w, h) => `M${x} ${y}h${w}v${h}h${-w}Z`;
  const T = (a, b, c, d, e, f) => `M${a} ${b}L${c} ${d}L${e} ${f}Z`;
  const ARCH = (x, y, w, h) => `M${x} ${y + h}V${y + w / 2}a${w / 2} ${w / 2} 0 0 1 ${w} 0V${y + h}Z`;
  const SKY = '#bfe3ee';
  const SEA = (y, A = 2, n = 4) => { const L = 110 / n; let s = `M-5 ${y}`; for (let i = 0; i < n; i++) s += `q${L / 4} ${i % 2 ? A : -A} ${L / 2} 0t${L / 2} 0`; return s + 'V110H-5Z'; };
  const PALM = (f, st, x, y, s, c) => {
    st(c, 1.3 * s, `M${x} ${y}Q${x + 2 * s} ${y - 12 * s} ${x - 1 * s} ${y - 24 * s}`);
    const hx = x - 1 * s, hy = y - 24 * s;
    for (const [dx, dy] of [[-11, 3], [-8, -5], [-1, -9], [7, -6], [11, 2], [5, 6], [-5, 6]]) f(c, `M${hx} ${hy}Q${hx + dx * s * .6} ${hy + dy * s * .9 - 3 * s} ${hx + dx * s} ${hy + dy * s}Q${hx + dx * s * .5} ${hy + dy * s * .5} ${hx} ${hy + 1.2 * s}Z`);
  };
  const HOUSE = (f, x, base, w, h, c, trim = CREAM, roof = TERRA) => {
    f(c, R(x, base - h, w, h)); f(roof, `M${x - 1.5} ${base - h}L${x + 2} ${base - h - 4}H${x + w - 2}L${x + w + 1.5} ${base - h}Z`);
    const n = w > 16 ? 3 : 2, gap = w / n, wn = gap * .46, floors = h > 22 ? 2 : 1;
    for (let y = 0; y < floors; y++) for (let i = 0; i < n; i++) { const wx = x + gap * i + (gap - wn) / 2, wy = base - h + 3 + y * 11.5; f(trim, ARCH(wx - .7, wy - .7, wn + 1.4, 9.4)); f(INK, ARCH(wx, wy, wn, 8)); }
  };

  // Ilustrações no estilo de cartaz modernista: poucas formas, recorte chapado
  const SCENES = {
    paraty(f, st, p) {
      f(LEAF, SEA(30, 8, 2)); f('#215f43', SEA(40, 5, 3));
      f(CREAM, R(10, 36, 80, 32)); f(TERRA, 'M6 36L16 24H84L94 36Z');
      for (const x of [15, 33, 58, 76]) { f(p.c, R(x - 1, 41, 11, 12)); f(CREAM, R(x + 1, 43, 7, 8)); f(INK, R(x + 1, 43, 3.1, 8)); }
      f(p.c, R(45, 44, 10, 24)); f(INK, ARCH(47, 47, 6, 21));
      for (let x = 12; x < 90; x += 7) if (x < 44 || x > 56) { f(p.c, R(x, 58, 5, 8)); }
      f('#7d7d76', R(-5, 68, 110, 8)); for (let x = -4; x < 102; x += 6) f(INK, R(x, 69, 4.4, 1.6)); f(WATER, SEA(76, 1.5, 4));
      f(BRASS, 'M28 84h34l-6 8h-22Z'); f(RED, 'M30 82.6h30v2h-30Z'); f(CREAM, R(40, 76, 12, 6.6)); st(CREAM, .8, 'M66 92q5 -2 10 0t10 0');
    },
    pelourinho(f, st, p) {
      f(SKY, R(-5, -5, 110, 110)); f(BRASS, C(80, 16, 8));
      // ladeira de sobrados coloridos
      HOUSE(f, -3, 92, 27, 60, p.c); HOUSE(f, 24, 94, 25, 50, BRASS); HOUSE(f, 49, 97, 25, 42, WATER); HOUSE(f, 74, 100, 30, 34, '#d9849a', CREAM, p.d);
      f('#7d7d76', 'M-5 92L105 100V110H-5Z'); for (let i = 0; i < 11; i++) for (let j = 0; j < 2; j++) f(CREAM, R(-2 + i * 10 + j * 5, 96 + i * .75 + j * 5, 3.6, 1.2));
    },
    veropeso(f, st, p) {
      f(SKY, R(-5, -5, 110, 80));
      // o mercado de ferro: salão azul e quatro torres pontudas
      for (const x of [17, 39, 61, 83]) { f('#2f7fa8', R(x - 6, 26, 12, 24)); f(RED, T(x - 9, 27, x, 6, x + 9, 27)); f(BRASS, C(x, 6, 1.8)); f(CREAM, ARCH(x - 2.6, 31, 5.2, 10)); }
      f('#2f7fa8', R(7, 46, 86, 26)); f(INK, R(5, 42, 90, 5));
      for (let x = 12; x < 84; x += 15.4) f(CREAM, ARCH(x, 51, 11, 21));
      f(WATER, SEA(72, 1.6, 4));
      // barco de feira na frente
      f(RED, 'M22 82h46l-7 10h-32Z'); f(CREAM, 'M22 82h46l-1.6 2.4h-42.8Z'); st(INK, 1.4, 'M44 60V82'); f(BRASS, T(46, 60, 46, 80, 62, 80));
    },
    canoa(f, st, p) {
      f(SKY, R(-5, -5, 110, 64)); f(BRASS, C(84, 18, 8)); f(WATER, SEA(58, 1.6, 5));
      // falésia vermelha com a lua e a estrela riscadas
      f('#c8502c', 'M-5 26L40 34L54 58L64 74L72 110H-5Z'); f('#9c3a1e', 'M40 34L54 58L64 74L72 110H50L44 72L30 58Z'); f(LEAF, 'M-5 22L41 31L43 38L-5 31Z');
      f(CREAM, 'M15 46a10 10 0 1 0 8.5 15.5a8 8 0 1 1 -8.5 -15.5Z'); f(CREAM, 'M25 50L26.4 53.6L30 55L26.4 56.4L25 60L23.6 56.4L20 55L23.6 53.6Z');
      // jangada
      f(CREAM, 'M80 36Q102 58 95 84H80Z'); f(RED, 'M80 62Q92 66 96 72L95 84H80Z'); st(INK, 1.4, 'M79.5 34V86'); f('#5c3a22', 'M64 85h35l-5 7h-25Z'); st(CREAM, .9, 'M72 98q5 -2 10 0t10 0');
    },
    jeri(f, st, p) {
      f(SKY, R(-5, -5, 110, 70)); f(WATER, SEA(60, 1.6, 4)); f('#f6a23c', C(53, 57, 10));
      // a Pedra Furada: arco de rocha com o sol no vão
      f('#8d6a4c', 'M12 88Q4 62 13 44Q22 20 46 18Q74 16 86 40Q96 58 90 88H72Q74 66 67 55Q59 44 48 46Q36 48 34 62Q32 76 34 88Z');
      f('#b08a64', 'M13 44Q22 20 46 18Q74 16 86 40Q70 28 50 29Q30 31 23 50Q18 58 13 44Z');
      st('#5f4630', 1.1, 'M22 60q4 8 2 20M80 50q-3 14 0 28M42 26q7 3 13 1');
      f(SAND, 'M-5 84Q40 76 105 86V110H-5Z'); st(CREAM, 1, 'M40 92q7 -2 12 0t12 0');
    },
    paulista(f, st, p) {
      for (const [x, w, h, c] of [[-2, 16, 54, INK], [14, 14, 66, '#34495c'], [30, 12, 46, INK], [44, 15, 60, '#34495c'], [60, 13, 72, INK], [74, 15, 52, '#34495c'], [90, 14, 62, INK]]) { f(c, R(x, 84 - h, w, h)); for (let y = 84 - h + 3; y < 40; y += 5) for (let a = x + 2; a < x + w - 2; a += 3.4) f(BRASS, R(a, y, 1.6, 2.4)); }
      f(CREAM, R(-5, 56, 110, 3));
      f(RED, R(14, 30, 72, 8)); f(RED, R(14, 30, 7, 50)); f(RED, R(79, 30, 7, 50)); f('#22323f', R(21, 38, 58, 20));
      for (let x = 21; x < 79; x += 5.8) f(p.c, R(x, 38, .8, 20)); f(p.c, R(21, 47, 58, .8));
      f(CREAM, R(-5, 80, 110, 4)); f('#7d7d76', R(-5, 84, 110, 26)); for (let x = -2; x < 102; x += 14) f(CREAM, R(x, 95, 8, 1.6));
    },
    esplanada(f, st, p) {
      f(SKY, R(-5, -5, 110, 68)); f(BRASS, C(80, 22, 10));
      // Congresso: duas torres, a cúpula e a tigela virada
      f(CREAM, R(43.5, 12, 6, 46)); f(CREAM, R(50.5, 12, 6, 46)); f(p.c, R(43, 30, 14, 2)); for (let y = 16; y < 56; y += 5) st(INK, .4, `M44 ${y}h5M51 ${y}h5`);
      f(CREAM, R(4, 58, 92, 6)); f(CREAM, 'M12 58Q24 34 38 58Z'); f(CREAM, 'M62 42H92Q90 58 77 58Q64 58 62 42Z'); f(p.d, 'M62 42H92L91 45H63Z');
      f(LEAF, R(-5, 64, 110, 46)); f('#cfcfc4', 'M42 64H58L72 110H28Z'); st(CREAM, 1, 'M50 68V74M50 80V88M50 94V104');
    },
    copacabana(f, st, p) {
      f(BRASS, C(70, 22, 11)); f(p.d, 'M-5 52Q8 34 22 38Q34 20 44 52Z'); f(WATER, SEA(46, 1.2, 5)); f(CREAM, 'M-5 58Q50 52 105 58V66H-5Z'); f(SAND, 'M-5 58Q50 54 105 58V76H-5Z');
      PALM(f, st, 84, 72, 1.15, '#215f43'); PALM(f, st, 16, 74, .85, '#215f43');
      f(CREAM, R(-5, 74, 110, 40));
      for (let k = 0; k < 4; k++) { const y = 76 + k * 7.6; let s = `M-5 ${y}`; for (let i = 0; i < 5; i++) s += 'q6 -4 12 0t12 0'; s += `V${y + 3.8}`; for (let i = 0; i < 5; i++) s += 'q-6 -4 -12 0t-12 0'; f(INK, s + 'Z'); }
    },
    aviao(f, st, p, x) {
      f(SKY, R(-5, -5, 110, 120));
      const cloud = (a, b, s) => { f(CREAM, C(a, b, 6 * s)); f(CREAM, C(a + 7 * s, b + 1, 5 * s)); f(CREAM, C(a - 7 * s, b + 1.6, 4 * s)); f(CREAM, R(a - 11 * s, b + 1, 22 * s, 4 * s)); };
      cloud(18, 78, 1.2); cloud(76, 84, 1.5); cloud(82, 18, .8);
      // jato de carreira subindo: de longe, tem que ser avião à primeira vista
      x.save(); x.translate(49, 46); x.rotate(-.34);
      f('#8f9ba3', 'M6 -2L20 -19H28L20 -2Z');
      f(RED, 'M-39 -4L-47 -24H-37L-25 -4Z');
      f('#8f9ba3', 'M-44 -1L-55 -8H-49L-34 -1Z');
      f(CREAM, 'M-43 -5H32Q45 -5 47 1Q45 6 32 7H-30Q-39 6 -43 -5Z');
      f('#2d6f9c', 'M-39 1H46Q45 5 32 7H-30Q-36 6 -39 1Z');
      for (let i = -26; i < 28; i += 6.2) f(INK, C(i, -1.4, 1.25));
      f(INK, 'M36 -4Q42 -3.4 44.4 -1H36Z');
      f('#b9c3c9', 'M-9 3H9L-9 26H-20Z');
      f('#55606a', 'M-9 13H3a2.4 2.4 0 0 1 0 5H-9Z');
      x.restore();
    },
    itaipu(f, st, p) {
      f(WATER, R(-5, -5, 110, 44)); f(p.c, SEA(30, 3, 2));
      f(CREAM, 'M-5 44Q50 30 105 44V82H-5Z'); for (let i = 0; i < 9; i++) { const x = -2 + i * 12; f('#c8c7ba', `M${x} 40h7V82h-7Z`); }
      f(p.d, R(-5, 70, 110, 8)); f(WATER, SEA(80, 1.6, 4)); st(CREAM, 1, 'M12 90q6 -2 12 0t12 0M58 94q6 -2 12 0t12 0');
      f(BRASS, 'M58 8L34 50H50L42 84L74 38H56L68 8Z'); st(INK, 1, 'M58 8L34 50H50L42 84L74 38H56L68 8Z');
    },
    cantareira(f, st, p) {
      f(SKY, R(-5, -5, 110, 120)); f(LEAF, SEA(66, 4, 2)); f(WATER, SEA(80, 1.6, 3)); st(CREAM, 1, 'M12 92q6 -2 12 0t12 0M64 96q6 -2 12 0t12 0');
      // torneira e gota: água, sem precisar ler
      f(INK, R(6, 18, 7, 20)); f('#8f9ba3', 'M13 22H54Q70 22 70 38V46H56V40Q56 36 52 36H13Z'); f('#c8d0d4', 'M13 24H54Q60 24 63 27H13Z');
      f('#8f9ba3', R(32, 13, 5, 9)); f(RED, 'M24 8h21a2 2 0 0 1 0 5.4h-21a2 2 0 0 1 0 -5.4Z'); f(INK, R(54, 45, 18, 3));
      f('#2d8fd0', 'M63 52Q76 68 76 76A13 13 0 0 1 50 76Q50 68 63 52Z'); f('#a8d7e4', 'M56 75a7 7 0 0 0 6 7q-9 -2 -6 -13Z');
    },
    leao(f, st, p) {
      f('#f6d58b', R(-5, -5, 110, 120));
      // juba em duas camadas de mechas
      const tuft = (r0, r1, n, c, off = 0) => { for (let i = 0; i < n; i++) { const t = (i + off) / n * 6.283, w = 3.14 / n; f(c, `M${50 + Math.cos(t - w) * r0} ${52 + Math.sin(t - w) * r0}Q${50 + Math.cos(t - w * .5) * r1} ${52 + Math.sin(t - w * .5) * r1} ${50 + Math.cos(t) * (r1 + 3)} ${52 + Math.sin(t) * (r1 + 3)}Q${50 + Math.cos(t + w * .5) * r1} ${52 + Math.sin(t + w * .5) * r1} ${50 + Math.cos(t + w) * r0} ${52 + Math.sin(t + w) * r0}Z`); } };
      tuft(28, 42, 14, '#8a4516'); tuft(25, 35, 14, '#c26a1e', .5); f('#c26a1e', C(50, 52, 28));
      // orelhas, cara, focinho
      f('#e9a93f', C(30, 32, 7)); f('#e9a93f', C(70, 32, 7)); f('#8a4516', C(30, 32, 3.4)); f('#8a4516', C(70, 32, 3.4));
      f('#f4c35c', 'M50 27Q69 27 71 48Q72 66 60 74Q55 79 50 79Q45 79 40 74Q28 66 29 48Q31 27 50 27Z');
      f('#fff4d6', 'M50 56Q62 56 62 66Q60 76 50 77Q40 76 38 66Q38 56 50 56Z');
      f('#fff', 'M36 45Q42 39 47 46Q42 50 36 45Z'); f('#fff', 'M64 45Q58 39 53 46Q58 50 64 45Z'); f(INK, C(42, 45, 2.6)); f(INK, C(58, 45, 2.6));
      st(INK, 2, 'M33 38Q40 34 47 41M67 38Q60 34 53 41');
      f(INK, 'M44 57Q50 54 56 57Q55 63 50 65Q45 63 44 57Z'); st(INK, 1.5, 'M50 65V69M50 69Q45 74 40 70M50 69Q55 74 60 70');
      st(INK, .7, 'M39 62L28 60M39 65L28 67M61 62L72 60M61 65L72 67');
    },
    luxo(f, st, p) {
      f('#c1121f', R(-5, -5, 110, 120));
      let s = ''; for (let k = 0; k < 10; k++) { const t = -Math.PI / 2 + k * Math.PI / 5, r = k % 2 ? 15.5 : 38; s += `${k ? 'L' : 'M'}${50 + Math.cos(t) * r} ${56 + Math.sin(t) * r}`; }
      f('#ffd23f', s + 'Z');
    },
    destino(f, st, p, x) {
      const stars = [[16, 16, 2.4], [84, 18, 3], [12, 78, 2], [88, 76, 2.6], [30, 90, 1.6], [70, 88, 1.8]];
      f('#1d3f86', R(-5, -5, 110, 120)); for (const [a, b, s] of stars) f(BRASS, `M${a} ${b - s * 2}L${a + s * .5} ${b - s * .5}L${a + s * 2} ${b}L${a + s * .5} ${b + s * .5}L${a} ${b + s * 2}L${a - s * .5} ${b + s * .5}L${a - s * 2} ${b}L${a - s * .5} ${b - s * .5}Z`);
      st(BRASS, .8, `${C(50, 50, 32)}`); x.save(); x.fillStyle = CREAM; x.font = `900 62px ${SERIF}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('?', 50, 54); x.restore();
    },
    cassino(f, st, p) {
      f('#1f5a3f', R(-5, -5, 110, 120)); f('#6b3f1d', C(50, 58, 36));
      for (let i = 0; i < 12; i++) { const a = i / 12 * 6.283, b = (i + 1) / 12 * 6.283, q = 31; f(i % 2 ? '#1f1a16' : '#c0392b', `M50 58L${50 + Math.cos(a) * q} ${58 + Math.sin(a) * q}L${50 + Math.cos(b) * q} ${58 + Math.sin(b) * q}Z`); }
      f('#6b3f1d', C(50, 58, 15)); f(BRASS, C(50, 58, 6)); f(CREAM, C(62, 40, 3.2));
    },
    mutirao(f, st, p, x) {
      f('#c95f2b', R(-5, -5, 110, 120)); st(CREAM, .8, C(50, 50, 32));
      x.save(); x.fillStyle = CREAM; x.font = `900 62px ${SERIF}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('!', 50, 54); x.restore();
    },
  };
  function drawScene(x, id, group) {
    const p = PD.GROUPS[group];
    const f = (c, d, rule) => { const P = new Path2D(d); x.fillStyle = c; x.fill(P, rule || 'nonzero'); x.strokeStyle = 'rgba(31,26,22,.8)'; x.lineWidth = .55; x.lineJoin = 'round'; x.stroke(P); };
    const st = (c, w, d) => { x.strokeStyle = c; x.lineWidth = w; x.lineJoin = 'round'; x.lineCap = 'round'; x.stroke(new Path2D(d)); };
    SCENES[id](f, st, p, x);
  }
  // cena no quadrado que une todos os ladrilhos; casas especiais têm contorno próprio, para se reconhecer de longe
  const poly = (n, rot) => Array.from({ length: n }, (_, k) => { const t = rot + k / n * 6.283; return [.5 + Math.cos(t) * .5, .5 + Math.sin(t) * .5]; });
  const SHAPES = { destino: poly(4, 0), mutirao: poly(6, 0), leao: poly(8, Math.PI / 8), luxo: [[0, 0], [1, 0], [1, .62], [.5, 1], [0, .62]] };
  function niche(x, id, group, ax, ay, aw, ah, kind) {
    const p = PD.GROUPS[group], pts = SHAPES[kind], shape = () => { x.beginPath(); if (kind === 'util') x.arc(ax + aw / 2, ay + ah / 2, aw / 2, 0, 7); else if (pts) { pts.forEach(([u, v], k) => x[k ? 'lineTo' : 'moveTo'](ax + u * aw, ay + v * ah)); x.closePath(); } else x.rect(ax, ay, aw, ah); };
    x.save(); shape(); x.clip();
    const g = x.createLinearGradient(0, ay, 0, ay + ah); g.addColorStop(0, p.l); g.addColorStop(1, CREAM); x.fillStyle = g; x.fillRect(ax, ay, aw, ah);
    if (photos[id]) coverPhoto(x, id, ax, ay, aw, ah); else if (SCENES[id]) { const s = aw / 100; x.translate(ax, ay + ah - s * 100); x.scale(s, s); drawScene(x, id, group); } x.restore();
    x.save(); shape(); x.lineJoin = 'round'; x.lineWidth = 5; x.strokeStyle = INK; x.stroke(); x.restore();
  }
  // louça: leve manchado do esmalte e bordas mais escuras, como peça cozida no forno
  function ceramic(x, w, h, base = PAPER) {
    x.fillStyle = base; x.fillRect(0, 0, w, h);
    x.globalAlpha = .035; for (let i = 0; i < 70; i++) { x.fillStyle = rnd() > .5 ? '#a98852' : '#fff'; x.beginPath(); x.ellipse(rnd() * w, rnd() * h, 14 + rnd() * 60, 10 + rnd() * 40, rnd() * 3, 0, 7); x.fill(); } x.globalAlpha = 1;
    x.strokeStyle = 'rgba(31,26,22,.28)'; x.lineWidth = 5; x.strokeRect(2.5, 2.5, w - 5, h - 5);
  }
  // módulo em quartos de círculo, em posições soltas, à maneira dos painéis modernistas de azulejo: a textura das faixas de grupo
  function moduleBand(x, X, Y, W, H, c, c2, cell) {
    x.save(); x.beginPath(); x.rect(X, Y, W, H); x.clip(); x.fillStyle = c; x.fillRect(X, Y, W, H);
    if (c2 && cell) { x.fillStyle = c2; x.globalAlpha = .17;
      for (let a = 0; a * cell < W; a++) for (let b = 0; b * cell < H; b++) {
        const cx = X + a * cell, cy = Y + b * cell, q = Math.floor(rnd() * 4); x.save(); x.translate(cx + cell / 2, cy + cell / 2); x.rotate(q * Math.PI / 2);
        x.beginPath(); x.moveTo(-cell / 2, -cell / 2); x.arc(-cell / 2, -cell / 2, cell, 0, Math.PI / 2); x.closePath(); x.fill(); x.restore();
      } }
    x.restore();
  }
  // a mesma faixa para o topo das cartas da tela
  const bands = {};
  function bandURL(c, d) { if (bands[c]) return bands[c]; const cv = mk(400, 100), x = cv.getContext('2d'); seed = c.length * 977 + parseInt(c.slice(1), 16) % 991; moduleBand(x, 0, 0, 400, 100, c, d, 50); return (bands[c] = cv.toDataURL()); }
  function fitLines(x, text, maxW) { const ws = text.split(' '), out = []; let l = ''; for (const a of ws) { const n = l ? l + ' ' + a : a; if (x.measureText(n).width > maxW && l) { out.push(l); l = a; } else l = n; } out.push(l); return out; }
  const spaced = (x, text, cx, y, gap) => { const w = [...text].reduce((t, c) => t + x.measureText(c).width + gap, -gap); let a = cx - w / 2; x.textAlign = 'left'; for (const c of text) { x.fillText(c, a, y); a += x.measureText(c).width + gap; } x.textAlign = 'center'; };

  const STATES = { PA: 'PARÁ', PE: 'PERNAMBUCO', MA: 'MARANHÃO', CE: 'CEARÁ', RJ: 'RIO DE JANEIRO', BA: 'BAHIA', MG: 'MINAS GERAIS', RS: 'RIO GRANDE DO SUL', PR: 'PARANÁ', AM: 'AMAZONAS', SP: 'SÃO PAULO', DF: 'DISTRITO FEDERAL', MS: 'MATO GROSSO DO SUL', ES: 'ESPÍRITO SANTO' };
  function tile(i, upright = false) {
    const q = PD.SQ[i], W = 512, H = 870, c = mk(W, H), x = c.getContext('2d'), p = PD.GROUPS[q.g];
    seed = 4242 + i * 97;
    ceramic(x, W, H);
    // só os grupos têm cor; as outras casas ficam limpas
    const hasBand = q.k === 'prop', bh = hasBand ? 124 : 0;
    if (hasBand) { moduleBand(x, 0, 0, W, bh, p.c, p.d, 62); x.fillStyle = 'rgba(31,26,22,.5)'; x.fillRect(0, bh - 4, W, 4); }
    // na visão 2D a fileira de cima fica de pé para quem olha da frente: a faixa continua para dentro, o texto é que gira
    const turn = upright && i > 20 && i < 30;
    if (turn) { x.save(); x.translate(W, bh + H); x.rotate(Math.PI); }
    const aw = hasBand ? 212 : SHAPES[q.art] ? 262 : 226, ay = hasBand ? bh + 30 : SHAPES[q.art] ? 38 : 56; // sem os cantos, o desenho pede mais área
    niche(x, q.art, q.g, (W - aw) / 2, ay, aw, aw, q.k === 'util' ? 'util' : q.art);
    // texto em bastão pesado, escuro sobre claro: a miniatura precisa ser lida de longe e de lado
    x.textAlign = 'center'; x.textBaseline = 'alphabetic';
    const label = q.name.toUpperCase(), maxW = W - 36; let size = 84; x.font = `900 ${size}px ${SANS}`; let lines = fitLines(x, label, maxW);
    while ((lines.length > 2 || Math.max(...lines.map(l => x.measureText(l).width)) > maxW) && size > 36) { size -= 2; x.font = `900 ${size}px ${SANS}`; lines = fitLines(x, label, maxW); }
    const lh = size * 1.04, cy = hasBand ? 562 : 480, y0 = cy - (lines.length - 1) * lh / 2 + size * .36;
    x.fillStyle = INK; lines.forEach((l, k) => x.fillText(l, W / 2, y0 + k * lh));
    const py = 818;
    if (q.price) { x.font = `800 66px ${SANS}`; x.fillStyle = INK; x.fillText('R$ ' + (q.price * 1000).toLocaleString('pt-BR'), W / 2, py); }
    else if (q.place) { x.font = `900 52px ${SANS}`; x.fillStyle = '#a5341f'; x.fillText(q.place, W / 2, py - 6); }
    else { x.font = `800 44px ${SANS}`; x.fillStyle = '#5c5344'; x.fillText('Tire uma carta', W / 2, py - 6); }
    if (turn) x.restore();
    return c;
  }

  // ---------- esquinas ----------
  function rose(x, cx, cy, r, c1, c2, c3 = PAPER) {
    for (let i = 0; i < 16; i++) { const a = i / 16 * 6.283 - Math.PI / 2, big = i % 2 === 0, card = i % 4 === 0, R0 = card ? r : big ? r * .72 : r * .46, w = r * (card ? .16 : .1); x.save(); x.translate(cx, cy); x.rotate(a); x.beginPath(); x.moveTo(0, 0); x.lineTo(R0, 0); x.lineTo(0, w); x.closePath(); x.fillStyle = c1; x.fill(); x.beginPath(); x.moveTo(0, 0); x.lineTo(R0, 0); x.lineTo(0, -w); x.closePath(); x.fillStyle = c2; x.fill(); x.restore(); }
    x.beginPath(); x.arc(cx, cy, r * .1, 0, 7); x.fillStyle = c3; x.fill(); x.lineWidth = 3; x.strokeStyle = INK; x.stroke();
  }
  function corner(i) {
    const S = 870, c = mk(S, S), x = c.getContext('2d'), q = PD.SQ[i]; seed = 777 + i;
    ceramic(x, S, S);
    const diag = fn => { x.save(); x.translate(S / 2, S / 2); x.rotate(-Math.PI / 4); fn(); x.restore(); };
    x.textAlign = 'center'; x.textBaseline = 'alphabetic';
    if (q.k === 'go') {
      moduleBand(x, 0, 0, S, 92, '#2563eb', '#2563eb', 92); moduleBand(x, 0, 92, 92, S - 92, '#2563eb', '#2563eb', 92);
      
      diag(() => {
        rose(x, 0, -170, 215, INK, GO, CREAM); x.fillStyle = INK; x.font = `900 124px ${SERIF}`; x.fillText('Marco Zero', 0, 150);
        x.font = `800 34px ${SANS}`; x.fillStyle = '#6d6452'; spaced(x, 'PASSOU, GANHOU', 0, 208, 5); x.font = `600 92px ${SERIF}`; x.fillStyle = TERRA; x.fillText('R$ 130.000', 0, 300);
      });
    } else if (q.k === 'jail') {
      // cela no canto de dentro; a calçada em L é a visita
      x.fillStyle = '#2c2522'; x.fillRect(0, 0, 610, 610);
      x.save(); x.beginPath(); x.rect(0, 0, 610, 610); x.clip();
      for (let y = 0; y < 610; y += 42) for (let a = (y / 42) % 2 ? -44 : 0; a < 610; a += 88) { const l = 30 + rnd() * 24; x.fillStyle = `rgb(${l + 40},${l + 12},${l})`; x.fillRect(a + 2, y + 2, 84, 38); }
      x.restore(); x.fillStyle = 'rgba(0,0,0,.34)'; x.fillRect(0, 0, 610, 610);
      
      x.fillStyle = '#f2e3c4'; x.font = `900 76px ${SERIF}`; x.fillText('DELEGACIA', 305, 560);
      x.font = `600 58px ${SERIF}`; x.fillStyle = INK;
      x.fillText('Só de visita', 305, 725); x.save(); x.translate(725, 305); x.rotate(-Math.PI / 2); x.fillText('Só de visita', 0, 18); x.restore();
    } else if (q.k === 'free') {
      moduleBand(x, 0, 0, S, 92, GO, GO, 92); moduleBand(x, 0, 92, 92, S - 92, GO, GO, 92); 
      diag(() => {
        x.save(); x.translate(-300, -340); x.scale(6, 6);
        const f = (cl, d, rule) => { x.fillStyle = cl; x.fill(new Path2D(d), rule || 'nonzero'); }, st = (cl, w, d) => { x.strokeStyle = cl; x.lineWidth = w; x.lineCap = 'round'; x.stroke(new Path2D(d)); };
        f(RED, 'M34 58L24 88L38 80L46 90L50 62Z'); f(RED, 'M66 58L76 88L62 80L54 90L50 62Z');
        f(INK, C(50, 40, 27)); f(BRASS, C(50, 40, 24)); f(CREAM, C(50, 40, 18));
        let star = ''; for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, r = k % 2 ? 6.2 : 14; star += `${k ? 'L' : 'M'}${50 + Math.cos(a) * r} ${40 + Math.sin(a) * r}`; } f(RED, star + 'Z');
        x.restore();
        x.fillStyle = INK; x.font = `900 80px ${SERIF}`; x.fillText('Patrocinador', 0, 205);
        x.font = `800 30px ${SANS}`; x.fillStyle = '#6d6452'; spaced(x, 'ESCOLHA UM LUGAR', 0, 262, 3); spaced(x, 'PARA GANHAR BÔNUS', 0, 306, 3);
      });
    } else {
      moduleBand(x, 0, 0, S, 92, RED, RED, 92); moduleBand(x, 0, 92, 92, S - 92, RED, RED, 92); 
      diag(() => {
        x.save(); x.translate(-300, -340); x.scale(6, 6);
        const st = (cl, w, d) => { x.strokeStyle = cl; x.lineWidth = w; x.lineCap = 'round'; x.stroke(new Path2D(d)); }, f = (cl, d) => { x.fillStyle = cl; x.fill(new Path2D(d)); };
        for (let k = 0; k < 9; k++) { const a = Math.PI + k / 8 * Math.PI, r0 = 31, r1 = k % 2 ? 42 : 48; st(k % 2 ? BRASS : RED, 3.4, `M${50 + Math.cos(a) * r0} ${54 + Math.sin(a) * r0}L${50 + Math.cos(a) * r1} ${54 + Math.sin(a) * r1}`); }
        f(RED, 'M28 54V40a22 22 0 0 1 44 0V54Z'); f('#e8675c', 'M34 54V41a15 15 0 0 1 12 -14Q38 34 40 54Z'); f(INK, 'M22 54H78V62H22Z'); f(BRASS, 'M22 54H78V56H22Z');
                for (const c of [8, 74]) { f('#e8742c', `M${c} 62L${c + 6} 34H${c + 12}L${c + 18} 62Z`); f(CREAM, `M${c + 3.6} 50L${c + 4.8} 44H${c + 13.2}L${c + 14.4} 50Z`); }
        x.restore();
        x.fillStyle = RED; x.font = `900 150px ${SERIF}`; x.fillText('Blitz!', 0, 135);
        x.font = `800 30px ${SANS}`; x.fillStyle = '#6d6452'; spaced(x, 'CAIU NA BLITZ, VAI PRA CADEIA', 0, 190, 3); spaced(x, 'SEM PASSAR PELO MARCO ZERO', 0, 234, 3);
      });
    }
    return c;
  }
  // ---------- calçada portuguesa do miolo ----------
  // o desenho original em tons de cinza: a cor vem do material, e a pessoa escolhe qual
  function mosaic(N) {
    const c = mk(N, N), x = c.getContext('2d'), bump = mk(N / 2, N / 2), b = bump.getContext('2d');
    x.fillStyle = '#9a9a9a'; x.fillRect(0, 0, N, N); b.fillStyle = '#000'; b.fillRect(0, 0, N / 2, N / 2);
    seed = 991;
    const TONE = { w: 255, s: 236, o: 216, g: 200, u: 190, r: 206, k: 158 };
    const seeds = [[.5, .06, 'r'], [.32, .38, 'g'], [-.02, .52, 'o'], [-.36, .36, 'u'], [-.54, .02, 'k'], [-.34, -.38, 'g'], [.02, -.52, 'r'], [.36, -.36, 'o'], [.14, .12, 'u'], [-.16, -.1, 'o'], [.2, -.2, 'k'], [-.2, .2, 'r']];
    const pattern = (u, v) => {
      const d = Math.pow(Math.pow(Math.abs(u), 6) + Math.pow(Math.abs(v), 6), 1 / 6), th = Math.atan2(v, u), r = Math.hypot(u, v);
      if (d > .975) return 'k';
      if (d > .948) return 'w';
      if (r > .715) { const w = d + .03 * Math.sin(th * 28); return ((Math.floor((w - .7) / .068) % 2) + 2) % 2 ? 'w' : 'k'; }
      if (r > .69) return 'k';
      if (r > .67) return 's';
      const a = u + .13 * Math.sin(3.1 * v + 1) + .06 * Math.sin(7 * v + 2), b = v + .13 * Math.sin(2.7 * u + .5) + .06 * Math.sin(6.3 * u + 1);
      let best = 9, next = 9, col = 's';
      for (const [sa, sb, c] of seeds) { const t = Math.hypot(a - sa, b - sb); if (t < best) { next = best; best = t; col = c; } else if (t < next) next = t; }
      return next - best < .022 ? 's' : col;
    };
    const cell = N / 18 * .088, hb = .5;
    for (let gy = 0; gy * cell < N + cell; gy++) for (let gx = 0; gx * cell < N + cell; gx++) {
      const cx = (gx + (gy % 2 ? .5 : 0)) * cell, cy = gy * cell, u = cx / N * 2 - 1, v = cy / N * 2 - 1, g = Math.max(0, Math.min(255, TONE[pattern(u, v)] + (rnd() - .5) * 26 | 0));
      const n = 5 + Math.floor(rnd() * 2), a0 = rnd() * 6.28, pts = [];
      for (let i = 0; i < n; i++) { const a = a0 + i / n * 6.283, r = cell * (.5 + rnd() * .1); pts.push([cx + Math.cos(a) * r + (rnd() - .5) * 2, cy + Math.sin(a) * r * .94 + (rnd() - .5) * 2]); }
      x.fillStyle = `rgb(${g},${g},${g})`; x.beginPath(); pts.forEach((p, i) => (i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1]))); x.closePath(); x.fill();
      b.fillStyle = `rgb(${180 + rnd() * 60 | 0},${180 + rnd() * 60 | 0},${180 + rnd() * 60 | 0})`; b.beginPath(); pts.forEach((p, i) => (i ? b.lineTo(p[0] * hb, p[1] * hb) : b.moveTo(p[0] * hb, p[1] * hb))); b.closePath(); b.fill();
    }
    return { color: c, bump };
  }
  // asfalto brasileiro: faixa gasta, remendo em cima de remendo, trinca, buraco e bueiro
  function asphalt(R1, R2, rho1) {
    const N = 3072, B = N / 2, u = N / (2 * R2), c = mk(N, N), x = c.getContext('2d'), bump = mk(B, B), b = bump.getContext('2d'); seed = 31;
    const grain = (lo, hi, size = 256) => { const g = mk(size, size), q = g.getContext('2d'), d = q.createImageData(size, size); for (let i = 0; i < d.data.length; i += 4) { const v = lo + rnd() * (hi - lo) | 0; d.data[i] = v + 1; d.data[i + 1] = v + 1; d.data[i + 2] = v + 2; d.data[i + 3] = 255; } q.putImageData(d, 0, 0); return g; };
    const px = v => (v + R2) * u;
    const both = fn => { fn(x, u, 0); b.save(); b.scale(.5, .5); fn(b, u, 1); b.restore(); };
    x.fillStyle = x.createPattern(grain(52, 78), 'repeat'); x.fillRect(0, 0, N, N);
    b.fillStyle = b.createPattern(grain(105, 150), 'repeat'); b.fillRect(0, 0, B, B);
    const RC = (R1 + R2) / 2, L = R1 - rho1, RR = rho1 + (R2 - R1) / 2;
    const at = (t, off = 0) => { const s = Math.floor(t * 4) % 4, a = (t * 4 % 1) * 2 - 1, m = RC + off; return [[a * L, m, 0], [m, -a * L, Math.PI / 2], [-a * L, -m, 0], [-m, a * L, Math.PI / 2]][s]; };
    const lane = (ctx, off) => { const a = RC + off, r = RR + off, m = px(0); ctx.beginPath(); ctx.moveTo(m - a * u + r * u, m - a * u); ctx.arcTo(m + a * u, m - a * u, m + a * u, m + a * u, r * u); ctx.arcTo(m + a * u, m + a * u, m - a * u, m + a * u, r * u); ctx.arcTo(m - a * u, m + a * u, m - a * u, m - a * u, r * u); ctx.arcTo(m - a * u, m - a * u, m + a * u, m - a * u, r * u); ctx.closePath(); };
    // desgaste leve: manchas de sol e pneu, faixa clara e bordas apagadas, alguns remendos e trincas. Sem buracos, para o foco ficar nas casas
    for (let i = 0; i < 300; i++) { const [a, z] = at(rnd(), (rnd() - .5) * 1.9), r = (.15 + rnd() * .75) * u; x.fillStyle = rnd() > .6 ? `rgba(135,133,128,${.012 + rnd() * .03})` : `rgba(10,10,12,${.02 + rnd() * .05})`; x.beginPath(); x.ellipse(px(a), px(z), r, r * (.4 + rnd() * .6), rnd() * 3, 0, 7); x.fill(); }
    lane(x, 0); x.setLineDash([.55 * u, .55 * u]); x.lineWidth = .06 * u; x.strokeStyle = 'rgba(236,232,220,.38)'; x.stroke(); x.setLineDash([]);
    for (const o of [-.84, .84]) { lane(x, o); x.lineWidth = .04 * u; x.strokeStyle = 'rgba(205,203,194,.22)'; x.stroke(); }
    const dark = grain(40, 64);
    for (let i = 0; i < 9; i++) {
      const [a, z, rot] = at((i + rnd() * .8) / 9, (rnd() - .5) * 1.1), w = (.2 + rnd() * .36) * u, h = (.16 + rnd() * .2) * u, tilt = (rnd() - .5) * .14;
      both((ctx, _, isB) => { ctx.save(); ctx.translate(px(a), px(z)); ctx.rotate(rot + tilt); ctx.beginPath(); ctx.roundRect(-w, -h, w * 2, h * 2, h * .35); ctx.fillStyle = isB ? '#a0a0a0' : x.createPattern(dark, 'repeat'); ctx.fill(); ctx.lineWidth = isB ? 5 : 2.5; ctx.strokeStyle = isB ? '#666' : 'rgba(10,10,11,.45)'; ctx.stroke(); ctx.restore(); });
    }
    for (let i = 0; i < 16; i++) {
      const [a, z, rot] = at(rnd(), (rnd() - .5) * 1.6), pts = [[px(a), px(z)]]; let d = rot + (rnd() - .5) * 2.2;
      for (let k = 0, n = 8 + rnd() * 12 | 0; k < n; k++) { d += (rnd() - .5) * .9; const [p0, p1] = pts[pts.length - 1]; pts.push([p0 + Math.cos(d) * .05 * u, p1 + Math.sin(d) * .05 * u]); }
      both((ctx, _, isB) => { ctx.beginPath(); pts.forEach((p, k) => (k ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.lineWidth = isB ? 3.5 : 1.6; ctx.strokeStyle = isB ? '#333' : 'rgba(8,8,9,.5)'; ctx.stroke(); });
    }
    return { color: c, bump };
  }
  function wood() {
    const W = 2048, H = 512, c = mk(W, H), x = c.getContext('2d'); seed = 77;
    const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#3d1f14'); g.addColorStop(.5, '#4a2617'); g.addColorStop(1, '#351a10'); x.fillStyle = g; x.fillRect(0, 0, W, H);
    for (let i = 0; i < 420; i++) {
      const y = rnd() * H, a = 3 + rnd() * 16, ph = rnd() * 6; x.strokeStyle = rnd() > .68 ? 'rgba(14,6,3,.55)' : rnd() > .5 ? 'rgba(122,62,32,.3)' : 'rgba(62,30,16,.5)'; x.lineWidth = .6 + rnd() * 2.4;
      x.beginPath(); for (let px = 0; px <= W; px += 32) { const yy = y + Math.sin(px / W * 6.283 * 2 + ph) * a + Math.sin(px / W * 6.283 * 5 + ph * 2) * a * .3; px ? x.lineTo(px, yy) : x.moveTo(px, yy); } x.stroke();
    }
    return c;
  }
  function glaze() {
    const N = 512, c = mk(N, N), x = c.getContext('2d'); seed = 5; x.fillStyle = '#808080'; x.fillRect(0, 0, N, N);
    for (let i = 0; i < 220; i++) { const r = 20 + rnd() * 90, a = rnd() * N, b = rnd() * N, g = x.createRadialGradient(a, b, 0, a, b, r), v = rnd() > .5 ? 255 : 0; g.addColorStop(0, `rgba(${v},${v},${v},.13)`); g.addColorStop(1, `rgba(${v},${v},${v},0)`); x.fillStyle = g; x.fillRect(a - r, b - r, r * 2, r * 2); }
    return c;
  }
  function die(v) {
    const N = 256, c = mk(N, N), x = c.getContext('2d'), bump = mk(N, N), b = bump.getContext('2d');
    const g = x.createRadialGradient(N / 2, N / 2, 40, N / 2, N / 2, 190); g.addColorStop(0, '#fff8ea'); g.addColorStop(1, '#efe0c2'); x.fillStyle = g; x.fillRect(0, 0, N, N); b.fillStyle = '#ccc'; b.fillRect(0, 0, N, N);
    const P = { 1: [[2, 2]], 2: [[1, 1], [3, 3]], 3: [[1, 1], [2, 2], [3, 3]], 4: [[1, 1], [3, 1], [1, 3], [3, 3]], 5: [[1, 1], [3, 1], [2, 2], [1, 3], [3, 3]], 6: [[1, 1], [3, 1], [1, 2], [3, 2], [1, 3], [3, 3]] }[v];
    for (const [a, y] of P) { const px = a * 64, py = y * 64, r = v === 1 ? 40 : 24, col = v === 1 ? '#b92c38' : INK; const s = x.createRadialGradient(px - 4, py - 4, 2, px, py, r); s.addColorStop(0, col); s.addColorStop(.86, col); s.addColorStop(1, '#00000055'); x.fillStyle = s; x.beginPath(); x.arc(px, py, r, 0, 7); x.fill(); b.fillStyle = '#222'; b.beginPath(); b.arc(px, py, r, 0, 7); b.fill(); }
    return { color: c, bump };
  }
  function cardBack(deck) {
    const W = 512, H = 720, c = mk(W, H), x = c.getContext('2d'), isD = deck === 'destino', col = isD ? '#2a62d6' : '#e4702f', dk = isD ? '#173d94' : '#a84a1b', lt = isD ? '#6f9bf0' : '#f7ab78'; seed = deck.length * 13;
    x.fillStyle = PAPER; x.fillRect(0, 0, W, H);
    const rr = (i, r) => { x.beginPath(); x.roundRect(i, i, W - i * 2, H - i * 2, r); };
    rr(20, 26); const g = x.createRadialGradient(W / 2, H / 2, 60, W / 2, H / 2, 470); g.addColorStop(0, col); g.addColorStop(1, dk); x.fillStyle = g; x.fill();
    x.save(); rr(20, 26); x.clip();
    // raios saindo do centro e losangos miúdos: o desenho de costas de baralho
    x.globalAlpha = .12; x.fillStyle = '#fff'; for (let i = 0; i < 24; i += 2) { const a = i / 24 * 6.283, b = (i + 1) / 24 * 6.283; x.beginPath(); x.moveTo(W / 2, H / 2); x.lineTo(W / 2 + Math.cos(a) * 600, H / 2 + Math.sin(a) * 600); x.lineTo(W / 2 + Math.cos(b) * 600, H / 2 + Math.sin(b) * 600); x.fill(); }
    x.globalAlpha = .2; x.strokeStyle = lt; x.lineWidth = 2; for (let k = -H; k < W + H; k += 44) { x.beginPath(); x.moveTo(k, 0); x.lineTo(k + H, H); x.stroke(); x.beginPath(); x.moveTo(k + H, 0); x.lineTo(k, H); x.stroke(); }
    x.globalAlpha = 1; x.restore();
    // moldura dupla com cantos recortados
    x.strokeStyle = CREAM; x.lineWidth = 6; rr(44, 18); x.stroke(); x.lineWidth = 2; rr(58, 12); x.stroke();
    for (const [a, b] of [[66, 66], [W - 66, 66], [66, H - 66], [W - 66, H - 66]]) { x.fillStyle = CREAM; x.beginPath(); for (let k = 0; k < 8; k++) { const t = k / 8 * 6.283 - Math.PI / 2, r = k % 2 ? 7 : 18; x[k ? 'lineTo' : 'moveTo'](a + Math.cos(t) * r, b + Math.sin(t) * r); } x.fill(); }
    // nome em cima e, de cabeça para baixo, embaixo
    x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = `400 58px ${SERIF}`; const label = isD ? 'SORTE' : 'IMPREVISTO';
    for (const flip of [0, 1]) { x.save(); x.translate(W / 2, H / 2); x.rotate(flip * Math.PI); x.fillStyle = dk; x.fillText(label, 3, -H / 2 + 116 + 4); x.fillStyle = CREAM; x.fillText(label, 0, -H / 2 + 116); x.restore(); }
    // medalhão central
    x.fillStyle = dk; x.beginPath(); x.arc(W / 2, H / 2 + 6, 158, 0, 7); x.fill();
    x.fillStyle = CREAM; x.beginPath(); x.arc(W / 2, H / 2, 158, 0, 7); x.fill(); x.lineWidth = 6; x.strokeStyle = INK; x.stroke();
    x.save(); x.beginPath(); x.arc(W / 2, H / 2, 136, 0, 7); x.clip(); x.translate(W / 2 - 136, H / 2 - 136); x.scale(2.72, 2.72); drawScene(x, deck, 'neutro'); x.restore();
    x.lineWidth = 5; x.strokeStyle = col; x.beginPath(); x.arc(W / 2, H / 2, 136, 0, 7); x.stroke();
    return c;
  }
  // hipoteca: listras e moldura vermelhas na casa inteira, com o carimbo no meio, para ver de longe
  function stamp(ratio = 1.5) {
    const W = 512, H = Math.round(W * ratio), c = mk(W, H), x = c.getContext('2d');
    x.save(); x.beginPath(); x.rect(0, 0, W, H); x.clip(); x.strokeStyle = 'rgba(200,32,31,.34)'; x.lineWidth = 24; for (let k = -H; k < W + H; k += 76) { x.beginPath(); x.moveTo(k, 0); x.lineTo(k + H, H); x.stroke(); } x.restore();
    x.strokeStyle = '#c8201f'; x.lineWidth = 22; x.strokeRect(11, 11, W - 22, H - 22);
    x.translate(W / 2, H / 2); x.rotate(-.2);
    x.fillStyle = '#fff4dc'; x.strokeStyle = '#c8201f'; x.lineWidth = 11; x.fillRect(-234, -64, 468, 128); x.strokeRect(-234, -64, 468, 128);
    x.fillStyle = '#c8201f'; x.font = `900 68px ${SERIF}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('HIPOTECADA', 0, 4);
    return c;
  }
  function under() {
    const N = 1024, c = mk(N, N), x = c.getContext('2d'); x.drawImage(wood(), 0, 0, N, N);
    x.fillStyle = 'rgba(0,0,0,.28)'; x.fillRect(0, 0, N, N);
    x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#efe2c6'; x.font = `900 118px ${SERIF}`; x.fillText('PATRIMÔNIO', N / 2, N / 2 - 70);
    x.font = `800 44px ${SANS}`; x.fillText('FAVOR NÃO VIRAR A MESA', N / 2, N / 2 + 40);
    x.lineWidth = 8; x.strokeStyle = '#efe2c6'; x.strokeRect(150, N / 2 - 170, N - 300, 300);
    return c;
  }
  function planks() { // assoalho: tábuas compridas de veio contínuo, pintado uma vez só
    const N = 1024, ROWS = 7, H = N / ROWS, c = mk(N, N), x = c.getContext('2d'), d = x.createImageData(N, N), px = d.data; seed = 11;
    const T = new Float32Array(4096); for (let i = 0; i < 4096; i++) T[i] = rnd();
    const hash = (a, b) => T[((a * 73) ^ (b * 179)) & 4095], sm = v => v * v * (3 - 2 * v);
    const noise = (u, v) => { const a = Math.floor(u), b = Math.floor(v), f = sm(u - a), g = sm(v - b); return (hash(a, b) * (1 - f) + hash(a + 1, b) * f) * (1 - g) + (hash(a, b + 1) * (1 - f) + hash(a + 1, b + 1) * f) * g; };
    const TONES = [[122, 84, 52], [112, 76, 46], [132, 92, 58], [104, 70, 42], [126, 88, 54], [116, 80, 50]];
    for (let r = 0; r < ROWS; r++) {
      const y0 = Math.round(r * H), y1 = Math.round((r + 1) * H), seam = [], first = Math.floor(rnd() * N * .9);
      seam.push(first, (first + N * (.45 + rnd() * .2)) % N); seam.sort((a, b) => a - b);
      const plank = [0, 1].map(() => ({ tone: TONES[Math.floor(rnd() * TONES.length)], ph: rnd() * 500, amp: 16 + rnd() * 22, f: .16 + rnd() * .12 }));
      for (let y = y0; y < y1; y++) for (let X = 0; X < N; X++) {
        const inside = X >= seam[0] && X < seam[1], P = plank[inside ? 1 : 0], o = (y * N + X) * 4;
        // veio em "catedral": anéis largos entortados por um ruído lento, mais os poros bem finos
        const warp = noise(X * .0045 + P.ph, y * .022 + P.ph) * P.amp, ring = Math.sin((y - y0 + warp) * P.f) * .5 + .5, pore = noise(X * .018 + P.ph, y * .85), slow = noise(X * .0025 + P.ph, y * .012);
        let v = .86 + ring * ring * .14 + (pore - .5) * .13 + (slow - .5) * .16;
        // junta: fresta escura com a borda da tábua caindo um pouco
        const de = Math.min(y - y0, y1 - 1 - y, Math.abs(X - seam[0]), Math.abs(X - seam[1]));
        if (de < 1.5) v *= .34; else if (de < 4) v *= .86;
        px[o] = Math.min(255, P.tone[0] * v * 1.06); px[o + 1] = Math.min(255, P.tone[1] * v); px[o + 2] = Math.min(255, P.tone[2] * v * .94); px[o + 3] = 255;
      }
    }
    x.putImageData(d, 0, 0);
    return c;
  }
  function felt() {
    const N = 512, c = mk(N, N), x = c.getContext('2d'), d = x.createImageData(N, N); seed = 3;
    for (let i = 0; i < d.data.length; i += 4) { const v = rnd() * 16 - 8; d.data[i] = 34 + v; d.data[i + 1] = 72 + v; d.data[i + 2] = 58 + v; d.data[i + 3] = 255; }
    x.putImageData(d, 0, 0); x.lineWidth = 1;
    for (let i = 0; i < 2600; i++) { const a = rnd() * N, b = rnd() * N, t = rnd() * 6.283, l = 3 + rnd() * 8; x.strokeStyle = rnd() > .5 ? 'rgba(120,170,145,.1)' : 'rgba(5,20,14,.16)'; x.beginPath(); x.moveTo(a, b); x.lineTo(a + Math.cos(t) * l, b + Math.sin(t) * l); x.stroke(); }
    return c;
  }
  // miniatura da cena para as cartas da tela
  function sceneCanvas(q, W = 480) {
    const H = Math.round(W * .62), c = mk(W, H), x = c.getContext('2d'), p = PD.GROUPS[q.g];
    const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, p.l); g.addColorStop(1, CREAM); x.fillStyle = g; x.fillRect(0, 0, W, H);
    if (photos[q.art]) { coverPhoto(x, q.art, 0, 0, W, H); return c; }
    x.save(); const s = W / 100; x.translate(0, H - s * 100 + s * 6); x.scale(s, s); if (SCENES[q.art]) drawScene(x, q.art, q.g); x.restore();
    return c;
  }
  // roleta e mesa de dados do cassino, em círculo. O ângulo 0 é a direita e cresce no sentido do relógio
  const WHEEL = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
  function medallion() {
    const N = 1024, c = mk(N, N), x = c.getContext('2d'), m = N / 2; seed = 8;
    x.fillStyle = '#1b1a18'; x.beginPath(); x.arc(m, m, m, 0, 7); x.fill();
    x.fillStyle = '#176a41'; x.beginPath(); x.arc(m, m, 326, 0, 7); x.fill();
    // veios claros no verde e a rosa em preto por cima
    x.save(); x.beginPath(); x.arc(m, m, 326, 0, 7); x.clip(); x.globalAlpha = .1; x.strokeStyle = '#fff'; x.lineWidth = 3; for (let r = 40; r < 326; r += 34) { x.beginPath(); x.arc(m, m, r, 0, 7); x.stroke(); } x.globalAlpha = 1; rose(x, m, m, 300, '#141311', '#2b2926', '#176a41'); x.restore();
    x.lineWidth = 5; x.strokeStyle = '#f3ead6'; x.beginPath(); x.arc(m, m, 330, 0, 7); x.stroke(); x.lineWidth = 3; x.beginPath(); x.arc(m, m, 494, 0, 7); x.stroke();
    const ring = (text, r, font, color, top, gapDeg) => {
      x.save(); x.translate(m, m); x.font = font; x.fillStyle = color; x.textAlign = 'center'; x.textBaseline = 'middle';
      const arr = [...text], step = gapDeg * Math.PI / 180, total = step * (arr.length - 1);
      arr.forEach((ch, i) => { const a = top ? -total / 2 + i * step : total / 2 - i * step; x.save(); x.rotate(a); x.translate(0, top ? -r : r); x.fillText(ch, 0, 0); x.restore(); });
      x.restore();
    };
    ring('PATRIMÔNIO', 405, `400 112px ${SERIF}`, '#f3ead6', true, 18.6);
    ring('UM JOGO DO BRASIL', 408, `800 50px ${SANS}`, '#b8ae9a', false, 8.6);
    return c;
  }
  function roulette() {
    const N = 1024, c = mk(N, N), x = c.getContext('2d'), m = N / 2, step = Math.PI * 2 / WHEEL.length, RED = PD.ROULETTE_RED;
    x.fillStyle = '#3a1f0e'; x.beginPath(); x.arc(m, m, m, 0, 7); x.fill();
    WHEEL.forEach((n, i) => { const a = i * step - step / 2; x.beginPath(); x.moveTo(m, m); x.arc(m, m, 506, a, a + step); x.closePath(); x.fillStyle = n === 0 ? '#169a52' : RED.includes(n) ? '#c8201f' : '#121014'; x.fill(); x.strokeStyle = '#e8c061'; x.lineWidth = 3; x.stroke(); });
    x.fillStyle = 'rgba(0,0,0,.28)'; x.beginPath(); x.arc(m, m, 506, 0, 7); x.arc(m, m, 442, 0, 7, true); x.fill(); // canaleta onde a bolinha cai
    x.strokeStyle = '#e8c061'; x.lineWidth = 4; x.beginPath(); x.arc(m, m, 442, 0, 7); x.stroke();
    x.font = `900 40px ${SANS}`; x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle';
    WHEEL.forEach((n, i) => { x.save(); x.translate(m, m); x.rotate(i * step); x.translate(392, 0); x.rotate(Math.PI / 2); x.fillText(n, 0, 0); x.restore(); });
    const g = x.createRadialGradient(m - 60, m - 60, 30, m, m, 340); g.addColorStop(0, '#c98a4c'); g.addColorStop(1, '#6a3419'); x.fillStyle = g; x.beginPath(); x.arc(m, m, 336, 0, 7); x.fill(); x.strokeStyle = '#e8c061'; x.lineWidth = 9; x.stroke();
    return c;
  }
  return { WHEEL, roulette, bandURL, ready, tile, corner, under, mosaic, medallion, asphalt, wood, glaze, die, cardBack, stamp, felt, planks, sceneCanvas, SCENES, drawScene, moduleBand, INK, BRASS, CREAM, PAPER };
})();
