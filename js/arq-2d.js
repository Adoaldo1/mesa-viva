// ===== Arquipélago — tabuleiro 2D (SVG) =====
// Desenha a ilha com geometria exata (a mesma grade do motor), as peças e os destaques de onde dá para jogar.
// Camadas: fixa (mar, terrenos, números, mercados — refeita só quando muda o mapa) e viva (peças, tempestade, destaques).
// A interface passa os cliques de volta por handlers.pick({kind: 'vertex'|'edge'|'hex', id}).
const ArqBoard2D = (() => {
  const K = 100; // unidades da grade → pixels do SVG
  const P = n => (n * K).toFixed(1);
  let root = null, svg = null, mapKey = null, handlers = {}, last = null, hoverHex = null;
  const TERRAIN = {
    mata: { fill: '#3f8a46', dark: '#2a5f30', name: 'Mata' },
    barreiro: { fill: '#c46a3f', dark: '#8e4627', name: 'Barreiro' },
    algodoal: { fill: '#e9e1c4', dark: '#b7ab83', name: 'Algodoal' },
    pedreira: { fill: '#8f9198', dark: '#5f6168', name: 'Pedreira' },
    vulcao: { fill: '#4a3a34', dark: '#2c211d', name: 'Vulcão' },
    cardume: { fill: '#2b7f96', dark: '#1d5b6c', name: 'Cardume' },
  };
  const RES_ICON = { madeira: '🪵', argila: '🧱', algodao: '☁️', pedra: '🪨', peixe: '🐟', any: '⚓' };

  // rand determinístico por hexágono (a arte não muda a cada redesenho)
  const rng = seed => { let s = (seed * 9301 + 49297) % 233280; return () => (s = (s * 9301 + 49297) % 233280) / 233280; };
  const hexPts = (x, y, r) => Array.from({ length: 6 }, (_, i) => { const a = Math.PI / 180 * (60 * i - 30); return `${P(x + r * Math.cos(a))},${P(y + r * Math.sin(a))}`; }).join(' ');

  // arte de cada terreno, desenhada em código
  function art(t, h) {
    const R = rng(h.id + 3), x = h.x, y = h.y, out = [];
    const jitter = (s = .45) => [x + (R() - .5) * s * 1.6, y + (R() - .5) * s * 1.3];
    if (t === 'mata') for (let i = 0; i < 7; i++) { const [a, b] = jitter(.55), s = .13 + R() * .05; out.push(`<path d="M${P(a)} ${P(b - s * 1.6)} L${P(a - s)} ${P(b + s * .5)} L${P(a + s)} ${P(b + s * .5)} Z" fill="#245c2b" stroke="#183e1d" stroke-width="2"/><rect x="${P(a - .015)}" y="${P(b + s * .5)}" width="${P(.03)}" height="${P(.06)}" fill="#5b3a1e"/>`); }
    if (t === 'barreiro') for (let i = 0; i < 4; i++) { const [a, b] = jitter(.5); for (let j = 0; j < 3; j++) out.push(`<rect x="${P(a - .12 + (j % 2) * .06)}" y="${P(b - j * .055)}" width="${P(.12)}" height="${P(.05)}" rx="2" fill="#9c4a26" stroke="#6b2f16" stroke-width="2"/>`); }
    if (t === 'algodoal') for (let i = 0; i < 12; i++) { const [a, b] = jitter(.6); out.push(`<line x1="${P(a)}" y1="${P(b)}" x2="${P(a)}" y2="${P(b + .09)}" stroke="#6f8a3a" stroke-width="3"/><circle cx="${P(a)}" cy="${P(b)}" r="${P(.045)}" fill="#fffdf4" stroke="#b5a87f" stroke-width="2"/>`); }
    if (t === 'pedreira') for (let i = 0; i < 4; i++) { const [a, b] = jitter(.5), s = .12 + R() * .06; out.push(`<path d="M${P(a - s)} ${P(b + s * .5)} L${P(a - s * .3)} ${P(b - s)} L${P(a + s * .4)} ${P(b - s * .6)} L${P(a + s)} ${P(b + s * .5)} Z" fill="#a7a9b0" stroke="#55575d" stroke-width="2.5"/>`); }
    if (t === 'vulcao') out.push(`<path d="M${P(x - .45)} ${P(y + .3)} L${P(x - .1)} ${P(y - .32)} L${P(x + .1)} ${P(y - .32)} L${P(x + .45)} ${P(y + .3)} Z" fill="#2e2320" stroke="#1a1310" stroke-width="3"/><ellipse cx="${P(x)}" cy="${P(y - .32)}" rx="${P(.1)}" ry="${P(.04)}" fill="#ff7a2a"/><path d="M${P(x - .02)} ${P(y - .3)} q${P(.05)} ${P(.15)} ${P(-.04)} ${P(.3)}" stroke="#ff5a1a" stroke-width="5" fill="none"/>`);
    if (t === 'cardume') for (let i = 0; i < 5; i++) { const [a, b] = jitter(.45), d = R() < .5 ? 1 : -1; out.push(`<path d="M${P(a - .07 * d)} ${P(b)} q${P(.07 * d)} ${P(-.05)} ${P(.14 * d)} 0 q${P(-.07 * d)} ${P(.05)} ${P(-.14 * d)} 0 Z M${P(a - .07 * d)} ${P(b)} l${P(-.05 * d)} ${P(-.035)} v${P(.07)} Z" fill="#cfe9ee" opacity=".85"/>`); }
    return out.join('');
  }

  function token(t, h) {
    const red = t.num === 6 || t.num === 8, pips = 6 - Math.abs(7 - t.num), y = h.y + (t.terrain === 'cardume' ? .05 : .02);
    return `<g class="tok" data-num="${t.num}"><circle cx="${P(h.x)}" cy="${P(y)}" r="${P(.3)}" fill="#f6eed6" stroke="#5a4428" stroke-width="4"/>
      <text x="${P(h.x)}" y="${P(y + .06)}" text-anchor="middle" font-size="${P(red ? .3 : .26)}" font-weight="800" font-family="Georgia, serif" fill="${red ? '#c0261c' : '#2a1e10'}">${t.num}</text>
      ${Array.from({ length: pips }, (_, i) => `<circle cx="${P(h.x + (i - (pips - 1) / 2) * .055)}" cy="${P(y + .17)}" r="${P(.02)}" fill="${red ? '#c0261c' : '#2a1e10'}"/>`).join('')}</g>`;
  }

  function market(m, g) {
    const E = g.edges[m.edge], A = g.vertices[E.a], B = g.vertices[E.b], S = g.hexes[m.sea];
    const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2, dx = S.x - mx, dy = S.y - my, L = Math.hypot(dx, dy), px = mx + dx / L * .52, py = my + dy / L * .52;
    const ratio = m.type === 'any' ? '3:1' : '2:1';
    return `<g class="mkt"><line x1="${P(A.x)}" y1="${P(A.y)}" x2="${P(px)}" y2="${P(py)}" stroke="#8a6234" stroke-width="7"/><line x1="${P(B.x)}" y1="${P(B.y)}" x2="${P(px)}" y2="${P(py)}" stroke="#8a6234" stroke-width="7"/>
      <circle cx="${P(px)}" cy="${P(py)}" r="${P(.24)}" fill="#f1e2bd" stroke="#6b4a24" stroke-width="4"/>
      <text x="${P(px)}" y="${P(py - .02)}" text-anchor="middle" font-size="${P(.15)}">${RES_ICON[m.type]}</text>
      <text x="${P(px)}" y="${P(py + .15)}" text-anchor="middle" font-size="${P(.12)}" font-weight="800" fill="#3b2a14" font-family="system-ui, sans-serif">${ratio}</text></g>`;
  }

  function buildStatic(st) {
    const g = Arq.grid(st), xs = g.hexes.map(h => h.x), ys = g.hexes.map(h => h.y);
    const minX = Math.min(...xs) - 1.15, maxX = Math.max(...xs) + 1.15, minY = Math.min(...ys) - 1.2, maxY = Math.max(...ys) + 1.2;
    const tiles = st.map.tiles;
    const land = g.hexes.filter(h => h.kind === 'land');
    root.innerHTML = `<svg class="arq-svg" viewBox="${P(minX)} ${P(minY)} ${P(maxX - minX)} ${P(maxY - minY)}" preserveAspectRatio="xMidYMid meet">
      <defs>
        <radialGradient id="arq-sea" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="${P(Math.max(maxX - minX, maxY - minY) * .9)}"><stop offset="0" stop-color="#2c7b93"/><stop offset=".6" stop-color="#1b5a73"/><stop offset="1" stop-color="#0e3346"/></radialGradient>
        <filter id="arq-shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="10" stdDeviation="10" flood-color="#04141c" flood-opacity=".55"/></filter>
        <pattern id="arq-waves" width="60" height="30" patternUnits="userSpaceOnUse"><path d="M0 15 q15 -8 30 0 t30 0" stroke="rgba(190,230,240,.12)" stroke-width="2" fill="none"/></pattern>
      </defs>
      <rect x="${P(minX - 30)}" y="${P(minY - 30)}" width="${P(maxX - minX + 60)}" height="${P(maxY - minY + 60)}" fill="url(#arq-sea)"/>
      <rect class="arq-waves" x="${P(minX - 31)}" y="${P(minY - 30)}" width="${P(maxX - minX + 62)}" height="${P(maxY - minY + 60)}" fill="url(#arq-waves)"/>
      <g filter="url(#arq-shadow)">${land.map(h => `<polygon points="${hexPts(h.x, h.y, 1.1)}" fill="#e3cc92" stroke="#e3cc92" stroke-width="30" stroke-linejoin="round"/>`).join('')}</g>
      <g class="arq-tiles">${g.hexes.map(h => {
        const t = tiles[h.id]; if (t.terrain === 'mar') return `<polygon class="hex sea" data-hex="${h.id}" points="${hexPts(h.x, h.y, 1)}" fill="transparent"/>`;
        const T = TERRAIN[t.terrain];
        return `<g class="hex ${t.terrain}" data-hex="${h.id}"><polygon points="${hexPts(h.x, h.y, .97)}" fill="${T.fill}" stroke="${T.dark}" stroke-width="5"/>${art(t.terrain, h)}${t.num ? token(t, h) : ''}</g>`;
      }).join('')}</g>
      <g class="arq-mkts">${st.map.markets.map(m => market(m, g)).join('')}</g>
      <g class="arq-live"></g><g class="arq-hl"></g>
    </svg>`;
    svg = root.querySelector('svg');
    svg.addEventListener('click', onClick);
    svg.addEventListener('mousemove', onMove);
    svg.addEventListener('mouseleave', () => setHover(null));
  }

  // ---------- peças ----------
  const house = (x, y, c, s = 1) => `<path d="M${P(x - .13 * s)} ${P(y + .1 * s)} V${P(y - .03 * s)} L${P(x)} ${P(y - .15 * s)} L${P(x + .13 * s)} ${P(y - .03 * s)} V${P(y + .1 * s)} Z" fill="${c}" stroke="#1b140c" stroke-width="6" stroke-linejoin="round"/>`;
  const city = (x, y, c, k = 1) => `<path d="M${P(x - .2 * k)} ${P(y + .12 * k)} V${P(y - .04 * k)} H${P(x - .04 * k)} V${P(y - .12 * k)} L${P(x + .06 * k)} ${P(y - .22 * k)} L${P(x + .16 * k)} ${P(y - .12 * k)} V${P(y + .12 * k)} Z" fill="${c}" stroke="#1b140c" stroke-width="6" stroke-linejoin="round"/><rect x="${P(x + .02 * k)}" y="${P(y - .08 * k)}" width="${P(.06 * k)}" height="${P(.06 * k)}" fill="rgba(0,0,0,.35)"/>`;
  function live(st, ui) {
    const g = Arq.grid(st), col = id => Arq.COLORS.find(c => c.id === st.players.find(p => p.id === id)?.color)?.hex || '#999';
    const roads = Object.entries(st.roads).map(([e, o]) => { const E = g.edges[e], A = g.vertices[E.a], B = g.vertices[E.b], k = .16;
      const ax = A.x + (B.x - A.x) * k, ay = A.y + (B.y - A.y) * k, bx = B.x + (A.x - B.x) * k, by = B.y + (A.y - B.y) * k;
      return `<g class="road ${ui.fresh?.has('e' + e) ? 'pop' : ''}"><line x1="${P(ax)}" y1="${P(ay)}" x2="${P(bx)}" y2="${P(by)}" stroke="#1b140c" stroke-width="22" stroke-linecap="round"/><line x1="${P(ax)}" y1="${P(ay)}" x2="${P(bx)}" y2="${P(by)}" stroke="${col(o)}" stroke-width="13" stroke-linecap="round"/></g>`; }).join('');
    const blds = Object.entries(st.buildings).map(([v, b]) => { const V = g.vertices[v]; return `<g class="bld ${ui.fresh?.has('v' + v) ? 'pop' : ''}" style="transform-origin:${P(V.x)}px ${P(V.y)}px">${b.type === 'cidade' ? city(V.x, V.y, col(b.owner), 1.45) : house(V.x, V.y, col(b.owner), 1.75)}</g>`; }).join('');
    const S = g.hexes[st.storm];
    const storm = `<g class="storm" style="transform:translate(${P(S.x)}px,${P(S.y)}px)"><circle r="${P(.42)}" fill="rgba(30,36,48,.55)"/>
      <path d="M${P(-.28)} ${P(.05)} a${P(.13)} ${P(.13)} 0 0 1 ${P(.1)} ${P(-.2)} a${P(.17)} ${P(.17)} 0 0 1 ${P(.32)} ${P(-.02)} a${P(.12)} ${P(.12)} 0 0 1 ${P(.06)} ${P(.22)} Z" fill="#59606e" stroke="#1d2129" stroke-width="5"/>
      <path d="M${P(.02)} ${P(.08)} l${P(-.08)} ${P(.14)} h${P(.07)} l${P(-.05)} ${P(.13)}" stroke="#ffd34a" stroke-width="7" fill="none" stroke-linejoin="round"/></g>`;
    svg.querySelector('.arq-live').innerHTML = roads + blds + storm;
  }

  // destaques: onde dá para clicar agora
  function highlights(st, ui) {
    const g = Arq.grid(st); let out = '';
    for (const e of ui.edges || []) { const E = g.edges[e], A = g.vertices[E.a], B = g.vertices[E.b]; out += `<line class="hl-edge" data-edge="${e}" x1="${P(A.x)}" y1="${P(A.y)}" x2="${P(B.x)}" y2="${P(B.y)}"/>`; }
    for (const v of ui.vertices || []) { const V = g.vertices[v]; out += `<circle class="hl-vertex ${ui.mode === 'cidade' ? 'city' : ''}" data-vertex="${v}" cx="${P(V.x)}" cy="${P(V.y)}" r="${P(.17)}"/>`; }
    for (const h of ui.hexes || []) { const H = g.hexes[h]; out += `<polygon class="hl-hex" data-hex="${h}" points="${hexPts(H.x, H.y, .9)}"/>`; }
    svg.querySelector('.arq-hl').innerHTML = out;
    svg.classList.toggle('picking', !!(ui.edges?.length || ui.vertices?.length || ui.hexes?.length));
  }

  function onClick(e) {
    const t = e.target.closest('[data-vertex],[data-edge],[data-hex]'); if (!t) return;
    if (t.dataset.vertex != null) handlers.pick?.({ kind: 'vertex', id: +t.dataset.vertex });
    else if (t.dataset.edge != null) handlers.pick?.({ kind: 'edge', id: +t.dataset.edge });
    else handlers.pick?.({ kind: 'hex', id: +t.dataset.hex });
  }
  function onMove(e) { const t = e.target.closest('.hex'); setHover(t ? +t.dataset.hex : null, e); }
  function setHover(id, e) { if (id === hoverHex) return; hoverHex = id; handlers.hover?.(id, e); }

  function mount(el, h) { root = el; handlers = h || {}; mapKey = null; }
  function update(st, ui = {}) {
    if (!root) return;
    const key = st.gameId; if (key !== mapKey) { buildStatic(st); mapKey = key; }
    live(st, ui); highlights(st, ui); last = st;
  }
  // posição na tela (px, relativa à janela) de um hexágono, interseção ou aresta — para animações e balões
  function screenPos(kind, id) {
    if (!svg || !last) return null;
    const g = Arq.grid(last); let x, y;
    if (kind === 'hex') ({ x, y } = g.hexes[id]);
    else if (kind === 'vertex') ({ x, y } = g.vertices[id]);
    else { const E = g.edges[id]; x = (g.vertices[E.a].x + g.vertices[E.b].x) / 2; y = (g.vertices[E.a].y + g.vertices[E.b].y) / 2; }
    const pt = svg.createSVGPoint(); pt.x = x * K; pt.y = y * K;
    const s = pt.matrixTransform(svg.getScreenCTM()); return { x: s.x, y: s.y };
  }
  // números sorteados pulam no tabuleiro
  function hitNumber(n) {
    if (!svg) return;
    svg.querySelectorAll('.tok').forEach(t => t.classList.toggle('hit', +t.dataset.num === n));
    setTimeout(() => svg?.querySelectorAll('.tok.hit').forEach(t => t.classList.toggle('hit', false)), 2200);
  }
  function reset() { root = null; svg = null; mapKey = null; last = null; }
  return { mount, update, screenPos, reset, hitNumber, TERRAIN, RES_ICON };
})();
