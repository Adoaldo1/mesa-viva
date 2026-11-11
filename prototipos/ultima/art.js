// Última!: toda a arte é desenhada aqui em canvas (cartas, verso, feltro, madeira). Nada de imagem de fora.
const Art = (() => {
  const W = 512, H = 800, RAD = 56;            // carta 0,64 × 1 (o mesmo canto arredondado da geometria)
  const INK = '#1a1433';
  const BX = 30, BY = 38, IRAD = 34; // borda branca da carta (lados, em cima/embaixo) e canto do miolo
  // nossas cores: coral, sol, folha e céu
  const TONE = {
    r: { base: '#f2463c', hi: '#ff7a5c', lo: '#b8222c', name: 'Coral' },
    y: { base: '#ffbe1f', hi: '#ffdc5e', lo: '#e08a00', name: 'Sol' },
    g: { base: '#25b456', hi: '#5ed97e', lo: '#127a3a', name: 'Folha' },
    b: { base: '#2f7ff0', hi: '#62a8ff', lo: '#1a4fb8', name: 'Céu' },
    w: { base: '#1b1a22', hi: '#34313f', lo: '#0b0a0f', name: 'Coringa' },
  };
  const FONT = '"Lilita One", "Arial Black", sans-serif';
  const mk = (w = W, h = H) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  // as cartas são desenhadas em 512×800 e reduzidas para o tamanho que a tela precisa (54 faces cheias pesariam ~100 MB no celular)
  let K = 1;
  const card = () => { const c = mk(Math.round(W * K), Math.round(H * K)), g = c.getContext('2d'); g.scale(K, K); return [c, g]; };
  function rr(x, y, w, h, r, g) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

  // texto de adesivo: sombra de tinta deslocada, contorno grosso e miolo branco
  function sticker(g, text, x, y, size, { fill = '#fff', stroke = INK, depth = size * 0.045, lw = size * 0.085 } = {}) {
    g.save(); g.font = `${size}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    g.lineWidth = lw; g.strokeStyle = stroke; g.fillStyle = stroke;
    for (let k = depth; k > 0; k -= 2) { g.strokeText(text, x + k * 0.55, y + k); g.fillText(text, x + k * 0.55, y + k); }
    g.strokeText(text, x, y); g.fillStyle = fill; g.fillText(text, x, y);
    g.restore();
  }
  // traço com a mesma receita do texto (para os símbolos desenhados)
  function inked(g, path, size, { fill = '#fff', depth = size * 0.045, lw = size * 0.085 } = {}) {
    g.save(); g.lineJoin = 'round'; g.lineCap = 'round';
    for (let k = depth; k > 0; k -= 2) { g.save(); g.translate(k * 0.55, k); path(g); g.lineWidth = lw; g.strokeStyle = INK; g.stroke(); g.fillStyle = INK; g.fill(); g.restore(); }
    path(g); g.lineWidth = lw; g.strokeStyle = INK; g.stroke(); g.fillStyle = fill; g.fill();
    g.restore();
  }
  // Pula: um sinal de "proibido" redondo
  const skipPath = s => g => {
    g.beginPath(); g.arc(0, 0, s, 0, Math.PI * 2); g.arc(0, 0, s * 0.62, 0, Math.PI * 2, true);
    const a = Math.PI / 4, t = s * 0.2;
    g.moveTo(Math.cos(a) * s * 0.66 - Math.sin(a) * t, -Math.sin(a) * s * 0.66 - Math.cos(a) * t);
    g.lineTo(-Math.cos(a) * s * 0.66 - Math.sin(a) * t, Math.sin(a) * s * 0.66 - Math.cos(a) * t);
    g.lineTo(-Math.cos(a) * s * 0.66 + Math.sin(a) * t, Math.sin(a) * s * 0.66 + Math.cos(a) * t);
    g.lineTo(Math.cos(a) * s * 0.66 + Math.sin(a) * t, -Math.sin(a) * s * 0.66 + Math.cos(a) * t);
    g.closePath();
  };
  // Volta: duas setas curvas formando um círculo
  const revPath = s => g => {
    g.beginPath();
    for (const rot of [0, Math.PI]) {
      const R = s * 0.78, t = s * 0.2, a0 = rot + 0.35, a1 = rot + Math.PI - 0.5;
      g.moveTo(Math.cos(a0) * (R + t), Math.sin(a0) * (R + t));
      g.arc(0, 0, R + t, a0, a1);
      const hx = Math.cos(a1), hy = Math.sin(a1), tx = -hy, ty = hx; // ponta da seta, na tangente
      g.lineTo(hx * (R + t * 2.4), hy * (R + t * 2.4));
      g.lineTo(hx * R + tx * s * 0.5, hy * R + ty * s * 0.5);
      g.lineTo(hx * (R - t * 2.4), hy * (R - t * 2.4));
      g.arc(0, 0, R - t, a1, a0, true);
      g.closePath();
    }
  };
  // número das cartas: branco, contorno de tinta e sombra deslocada, na Rubik itálica (redonda, puxada para a esquerda)
  const NUMFONT = 'italic 800 {s}px Rubik, "Arial Black", sans-serif';
  function numeral(g, t, x, y, s, under) {
    g.save(); g.font = NUMFONT.replace('{s}', s); g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    const d = s * 0.045, lw = s * 0.07;
    g.fillStyle = '#16121c'; g.strokeStyle = '#16121c'; g.lineWidth = lw; g.fillText(t, x + d, y + d * 1.15); g.strokeText(t, x + d, y + d * 1.15);
    g.strokeText(t, x, y); g.fillStyle = '#fff'; g.fillText(t, x, y);
    if (under) { const w = s * 0.3, h = s * 0.05, uy = y + s * 0.37; g.fillStyle = '#16121c'; g.fillRect(x - w / 2 + d - lw / 2, uy + d - lw / 2, w + lw, h + lw); g.fillRect(x - w / 2 - lw / 2, uy - lw / 2, w + lw, h + lw); g.fillStyle = '#fff'; g.fillRect(x - w / 2, uy, w, h); }
    g.restore();
  }
  // Coringa: catavento de quatro pétalas, uma de cada cor
  function pinwheel(g, s, spin = 0) {
    g.save(); g.rotate(spin);
    ['r', 'y', 'g', 'b'].forEach((c, i) => {
      g.save(); g.rotate(i * Math.PI / 2);
      const p = new Path2D(); p.moveTo(0, 0); p.bezierCurveTo(s * 0.15, -s * 0.55, s * 0.95, -s * 0.75, s * 0.95, -s * 0.1); p.quadraticCurveTo(s * 0.62, s * 0.08, 0, 0); p.closePath();
      g.lineJoin = 'round'; g.lineWidth = s * 0.1; g.strokeStyle = INK; g.stroke(p);
      const gr = g.createLinearGradient(0, -s, s, 0); gr.addColorStop(0, TONE[c].hi); gr.addColorStop(1, TONE[c].base); g.fillStyle = gr; g.fill(p);
      g.restore();
    });
    g.beginPath(); g.arc(0, 0, s * 0.16, 0, Math.PI * 2); g.fillStyle = '#fff'; g.lineWidth = s * 0.07; g.strokeStyle = INK; g.stroke(); g.fill();
    g.restore();
  }
  // retícula pop nos cantos: a assinatura do nosso baralho
  function halftone(g, x0, y0, dx, dy, alpha) {
    g.save(); g.fillStyle = `rgba(255,255,255,${alpha})`;
    for (let i = 0; i < 9; i++) for (let j = 0; j < 9 - i; j++) {
      const r = 9 * (1 - (i + j) / 9); if (r < 1.2) continue;
      g.beginPath(); g.arc(x0 + dx * (i * 30 + (j % 2) * 15), y0 + dy * j * 26, r, 0, Math.PI * 2); g.fill();
    }
    g.restore();
  }
  const LABEL = { skip: null, rev: null, d2: '+2', wild: null, d4: '+4' };
  function corner(g, c, v, x, y, s) {
    g.save(); g.translate(x, y);
    if (v === 'skip') inked(g, skipPath(s * 0.42), s, { lw: s * 0.09, depth: s * 0.05 });
    else if (v === 'rev') inked(g, revPath(s * 0.4), s, { lw: s * 0.09, depth: s * 0.05 });
    else if (v === 'wild') pinwheel(g, s * 0.42);
    else numeral(g, LABEL[v] || v, 0, 0, s * (v.length > 1 ? 0.8 : 1.1), false);
    g.restore();
  }

  // cartas desenhadas pelo Adoaldo (cartas/): o anel do meio é coberto com a própria cor da carta e os coringas ganham o catavento
  const IMG = {};
  function load() {
    const ids = [];
    for (const c of ['r', 'y', 'g', 'b']) for (const v of ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'skip', 'rev', 'd2']) ids.push(`${c}-${v}`);
    ids.push('w-wild', 'w-d4'); // Coringa e +4: só entram se forem do baralho novo (raw); senão são desenhados aqui (face), com o catavento grande
    ids.push('verso'); // cartas/verso.jpg, se existir, substitui o verso desenhado
    return Promise.all(ids.map(k => new Promise(ok => { const i = new Image(); i.onload = () => { IMG[k] = i; ok(); }; i.onerror = () => ok(); i.src = `cartas/${k}.jpg?v=${V}`; })));
  }
  // baralho novo do Adoaldo (1024×1536): a imagem entra inteira, sem nada por cima; só os cantos são arredondados
  // shortcut: reconhece o baralho novo pela largura (>= 1000); quando todas as cartas forem dele, os desenhos antigos de photo() podem sair
  const raw = img => img.width >= 1000;
  function plain(img) {
    const [cv, g] = card(), dw = H * img.width / img.height; // cobre a carta pela altura e corta a sobra dos lados
    g.save(); rr(0, 0, W, H, RAD, g); g.clip(); g.drawImage(img, (W - dw) / 2, 0, dw, H); g.restore(); return cv;
  }
  function photo(c, v, img) {
    if (raw(img)) return plain(img);
    if (img.width === 800) { // desenho novo (800×1200): a parte colorida (37 a 763, 37 a 1163) vai num miolo de cantos redondos, com borda branca larga
      const [cv, g] = card(); g.save(); rr(0, 0, W, H, RAD, g); g.clip(); g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
      rr(BX, BY, W - BX * 2, H - BY * 2, IRAD, g); g.clip();
      const sh = 1126, sw = sh * (W - BX * 2) / (H - BY * 2); g.drawImage(img, 400 - sw / 2, 37, sw, sh, BX, BY, W - BX * 2, H - BY * 2);
      // números e "+2" redesenhados com uma fonte redonda e inclinada (a do desenho era dura); a cor é a do próprio desenho
      const num = /^\d$/.test(v);
      if (num || v === 'd2') {
        const px = g.getImageData(Math.round(BX * K + 8), Math.round(H / 2 * K), 1, 1).data; g.fillStyle = `rgb(${px[0]},${px[1]},${px[2]})`;
        if (num) g.fillRect(0, 0, W, H); else { g.fillRect(BX, BY, 190, 200); g.fillRect(W - BX - 190, H - BY - 200, 190, 200); }
        const txt = num ? v : '+2';
        if (num) numeral(g, txt, W / 2, H / 2 + 8, 400, v === '6' || v === '9');
        numeral(g, txt, num ? 92 : 104, 124, num ? 150 : 108, false);
        g.save(); g.translate(W, H); g.rotate(Math.PI); numeral(g, txt, num ? 92 : 104, 124, num ? 150 : 108, false); g.restore();
      }
      g.restore(); return cv;
    }
    const [cv, g] = card(), k = img.width / 662; // medidas no tamanho original do desenho (662×1028)
    g.save(); rr(0, 0, W, H, RAD, g); g.clip();
    g.scale(W / 638, H / 1006); g.translate(-12, -11); // corta a margem cinza de fora
    const sk = v === 'skip'; // o desenho do bloqueio tem a borda mais larga: a parte colorida (40,46 a 619,985) é esticada até onde fica nas outras
    if (sk) { g.fillStyle = '#f9f5ec'; g.fillRect(0, 0, 662, 1028); g.drawImage(img, 40 * k, 46 * k, 579 * k, 939 * k, 30, 27, 602, 972); }
    else g.drawImage(img, 0, 0, 662, 1028);
    // remendo com a textura da própria carta, tirado de um pedaço liso perto do pé
    const pc = mk(128, 40); pc.getContext('2d').drawImage(img, (sk ? 270 : 250) * k, (sk ? 948 : 945) * k, 128 * k, (sk ? 28 : 40) * k, 0, 0, 128, 40);
    const pat = g.createPattern(pc, 'repeat');
    rr(27, 25, 608, 978, 42, g); g.clip(); // encosta na borda: o anel toca nela e deixava um fiozinho
    const [ex, ey, er, rx, ry, lw] = sk ? [330, 518, -57, 434, 238, 92] : [332, 516, -64, 406, 254, 80]; // anel medido nos desenhos (o do bloqueio é outro)
    g.save(); g.translate(ex, ey); g.rotate(er * Math.PI / 180);
    g.beginPath(); g.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); g.lineWidth = lw; g.strokeStyle = pat; g.stroke();
    if (c === 'w') { g.beginPath(); g.ellipse(0, 0, 380, 232, 0, 0, Math.PI * 2); g.fillStyle = pat; g.fill(); }
    g.restore();
    if (c === 'w') {
      g.save(); g.translate(331, 520);
      if (v === 'd4') { pinwheel(g, 150, -0.2); sticker(g, '+4', 0, 10, 300, { lw: 28, depth: 16 }); } else pinwheel(g, 230, -0.2);
      g.restore();
      if (v === 'wild') for (const [x, y, r] of [[128, 132, 0], [526, 890, Math.PI]]) { g.save(); g.fillStyle = pat; g.beginPath(); g.ellipse(x, y, 62, 66, 0, 0, Math.PI * 2); g.fill(); g.translate(x, y); g.rotate(r); pinwheel(g, 48); g.restore(); }
    }
    g.restore();
    return cv;
  }

  function face(c, v) {
    const im = IMG[`${c}-${v}`]; if (im && (c !== 'w' || raw(im))) return photo(c, v, im);
    const [cv, g] = card(), T = TONE[c];
    g.save(); rr(0, 0, W, H, RAD, g); g.clip();
    g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
    // miolo colorido com luz de canto (mesma borda das cartas desenhadas)
    const m = BX; rr(BX, BY, W - BX * 2, H - BY * 2, IRAD, g); g.save(); g.clip();
    const gr = g.createLinearGradient(0, 0, W, H); gr.addColorStop(0, T.hi); gr.addColorStop(0.45, T.base); gr.addColorStop(1, T.lo);
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    halftone(g, W - m - 14, m + 18, -1, 1, c === 'w' ? 0.1 : 0.2); halftone(g, m + 14, H - m - 18, 1, -1, c === 'w' ? 0.1 : 0.2);
    // faixa diagonal clara atrás do símbolo
    g.save(); g.translate(W / 2, H / 2); g.rotate(-0.42); g.fillStyle = 'rgba(255,255,255,.13)'; g.fillRect(-W, -120, W * 2, 240); g.fillStyle = 'rgba(255,255,255,.07)'; g.fillRect(-W, -170, W * 2, 30); g.fillRect(-W, 140, W * 2, 30); g.restore();
    const glow = g.createRadialGradient(W / 2, H / 2, 10, W / 2, H / 2, 300); glow.addColorStop(0, 'rgba(255,255,255,.28)'); glow.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = glow; g.fillRect(0, 0, W, H);
    g.restore();
    // símbolo do meio
    g.save(); g.translate(W / 2, H / 2 + 6);
    if (v === 'skip') inked(g, skipPath(150), 300, { lw: 22, depth: 14 });
    else if (v === 'rev') inked(g, revPath(140), 300, { lw: 22, depth: 14 });
    else if (v === 'wild') pinwheel(g, 232, -0.2);
    else if (v === 'd4') { pinwheel(g, 222, -0.2); numeral(g, '+4', 0, 8, 250, false); }
    else if (v === 'd2') sticker(g, '+2', 0, 10, 270, { lw: 24, depth: 14 });
    else {
      sticker(g, v, 0, 14, 400, { lw: 28, depth: 16 });
      if (v === '6' || v === '9') { g.fillStyle = INK; rr(-70, 175, 140, 26, 13, g); g.fill(); g.fillStyle = '#fff'; rr(-60, 170, 120, 16, 8, g); g.fill(); }
    }
    g.restore();
    corner(g, c, v, 84, 104, 96);
    g.save(); g.translate(W, H); g.rotate(Math.PI); corner(g, c, v, 84, 104, 96); g.restore();
    g.restore();
    return cv;
  }
  // verso preto: brilho de canto, moldura branca, um anel com as quatro cores e a marca no meio
  function back() {
    const [cv, g] = card();
    if (IMG.verso) { g.save(); rr(0, 0, W, H, RAD, g); g.clip(); g.drawImage(IMG.verso, 0, 0, W, H); g.restore(); return cv; }
    g.save(); rr(0, 0, W, H, RAD, g); g.clip();
    const gr = g.createLinearGradient(0, 0, W, H); gr.addColorStop(0, '#2c2b33'); gr.addColorStop(0.5, '#17161c'); gr.addColorStop(1, '#0a090d');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    g.save(); g.translate(W / 2, H / 2); g.fillStyle = 'rgba(255,255,255,.028)';
    for (let k = 0; k < 24; k++) { g.rotate(Math.PI / 12); g.beginPath(); g.moveTo(0, 0); g.lineTo(-38, -700); g.lineTo(38, -700); g.closePath(); if (k % 2) g.fill(); }
    g.restore();
    halftone(g, W - 40, 44, -1, 1, 0.06); halftone(g, 40, H - 44, 1, -1, 0.06);
    g.lineWidth = 10; g.strokeStyle = 'rgba(255,255,255,.92)'; rr(26, 26, W - 52, H - 52, RAD - 20, g); g.stroke();
    g.lineWidth = 3; g.strokeStyle = 'rgba(255,255,255,.18)'; rr(44, 44, W - 88, H - 88, RAD - 30, g); g.stroke();
    g.save(); g.translate(W / 2, H / 2); g.rotate(-0.42);
    ['r', 'y', 'g', 'b'].forEach((c, i) => { g.beginPath(); g.ellipse(0, 0, 196, 128, 0, i * Math.PI / 2 + 0.06, (i + 1) * Math.PI / 2 - 0.06); g.lineWidth = 16; g.lineCap = 'round'; g.strokeStyle = TONE[c].base; g.stroke(); });
    g.restore();
    g.save(); g.translate(W / 2, H / 2 - 4); g.rotate(-0.12);
    sticker(g, 'Última!', 0, 0, 132, { lw: 16, depth: 14, stroke: '#000' });
    g.fillStyle = 'rgba(255,255,255,.75)'; g.font = `30px ${FONT}`; g.textAlign = 'center'; g.fillText('MESA VIVA', 0, 98);
    g.restore();
    g.restore();
    return cv;
  }

  // feltro: ladrilho cinza que repete sem emenda (a cor vem da mesa). Manchas suaves de tingimento e grão miúdo de lã, sem pelos.
  function table(amp = 1) { // amp: força da textura (o pano escuro precisa de mais para ela aparecer)
    const N = 1024, c = mk(N, N), x = c.getContext('2d'), d = x.createImageData(N, N), px = d.data;
    let seed = 11; const rnd = () => { seed = (seed * 1664525 + 1013904223) | 0; return ((seed >>> 8) & 0xffffff) / 0x1000000; };
    const noise = P => { // ruído suave com período P (dá a volta na borda)
      const T = new Float32Array(P * P); for (let i = 0; i < T.length; i++) T[i] = rnd();
      const h = (a, b) => T[(((a % P) + P) % P) * P + (((b % P) + P) % P)], sm = v => v * v * (3 - 2 * v);
      return (u, v) => { const a = Math.floor(u), b = Math.floor(v), f = sm(u - a), g = sm(v - b); return (h(a, b) * (1 - f) + h(a + 1, b) * f) * (1 - g) + (h(a, b + 1) * (1 - f) + h(a + 1, b + 1) * f) * g; };
    };
    const n1 = noise(3), n2 = noise(12), n3 = noise(48), n4 = noise(160);
    for (let y = 0; y < N; y++) for (let X = 0; X < N; X++) {
      const u = X / N, v = y / N, o = (y * N + X) * 4;
      const k = 1 + amp * ((n1(u * 3, v * 3) - 0.5) * 0.1 + (n2(u * 12, v * 12) - 0.5) * 0.07 + (n3(u * 48, v * 48) - 0.5) * 0.08 + (n4(u * 160, v * 160) - 0.5) * 0.1 + (rnd() - 0.5) * 0.05);
      px[o] = px[o + 1] = px[o + 2] = Math.max(0, Math.min(255, 205 * k)); px[o + 3] = 255;
    }
    x.putImageData(d, 0, 0);
    for (let i = 0; i < 500; i++) { x.fillStyle = `rgba(255,255,255,${(0.06 + rnd() * 0.06) * amp})`; x.beginPath(); x.arc(rnd() * N, rnd() * N, 0.8 + rnd() * 1.4, 0, 7); x.fill(); } // bolinhas de uso
    return c;
  }
  // enfeite em volta do descarte: dois anéis de costura e quatro pontinhos (transparente, vai por cima do feltro)
  function stitch(R = 1.9, S = 5) {
    const N = 1024, u = N / S, c = mk(N, N), x = c.getContext('2d');
    x.strokeStyle = '#fff'; x.lineCap = 'round';
    [[R, 0.035, 0.75], [R + 0.16, 0.022, 0.45]].forEach(([r, w, a]) => { x.globalAlpha = a; x.lineWidth = w * u; x.setLineDash([0.11 * u, 0.075 * u]); x.beginPath(); x.arc(N / 2, N / 2, r * u, 0, Math.PI * 2); x.stroke(); });
    x.setLineDash([]); x.globalAlpha = 0.55; x.fillStyle = '#fff';
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4, r = (R + 0.4) * u; x.beginPath(); x.arc(N / 2 + Math.cos(a) * r, N / 2 + Math.sin(a) * r, 0.05 * u, 0, 7); x.fill(); }
    return c;
  }
  // anel de setas em volta do descarte (mostra o sentido do jogo)
  function arrows() {
    const cv = mk(1024, 64), g = cv.getContext('2d');
    g.fillStyle = '#fff';
    for (let k = 0; k < 12; k++) { const x = k * (1024 / 12) + 20; g.beginPath(); g.moveTo(x, 10); g.lineTo(x + 34, 32); g.lineTo(x, 54); g.lineTo(x + 14, 32); g.closePath(); g.fill(); }
    return cv;
  }
  function glow() { // brilho macio para cartas jogáveis e anéis
    const cv = mk(256, 256), g = cv.getContext('2d'), gr = g.createRadialGradient(128, 128, 30, 128, 128, 128);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256); return cv;
  }
  // moldura de luz que contorna a carta jogável (macia: uma passada só)
  function rim() {
    const cv = mk(320, 480), g = cv.getContext('2d');
    g.shadowColor = '#fff'; g.shadowBlur = 26; g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 7;
    rr(36, 36, 248, 408, 36, g); g.stroke();
    return cv;
  }

  return { setScale: k => { K = Math.max(0.4, Math.min(1, k)); }, W, H, TONE, INK, load, face, back, table, stitch, arrows, glow, rim };
})();
