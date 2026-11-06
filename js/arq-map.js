// ===== Arquipélago — geração do mapa =====
// Sorteia terrenos, cardumes (mar que produz peixe), números e mercados do litoral.
// Regras de validade (sempre): 6 e 8 nunca vizinhos; o vulcão não tem número; mercados não dividem interseção.
// Modo equilibrado (opcional): também evita números iguais vizinhos, terrenos iguais vizinhos,
// interseções "ricas demais" e recursos concentrados (a produção esperada de cada recurso fica parecida).
const ArqMap = (() => {
  const Grid = typeof ArqGrid !== 'undefined' ? ArqGrid : require('./arq-grid.js');
  const RES = ['madeira', 'argila', 'algodao', 'pedra', 'peixe'];
  const TERRAIN_RES = { mata: 'madeira', barreiro: 'argila', algodoal: 'algodao', pedreira: 'pedra', cardume: 'peixe', vulcao: null };
  // composição de cada tamanho de mapa
  const SETUP = {
    std: { land: { mata: 4, barreiro: 4, algodoal: 5, pedreira: 5, vulcao: 1 }, shoals: 6, markets: 9,
      tokens: [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12, 3, 4, 5, 9, 10, 11] },
    big: { land: { mata: 6, barreiro: 6, algodoal: 7, pedreira: 7, vulcao: 2 }, shoals: 8, markets: 11,
      tokens: [2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 6, 8, 8, 8, 9, 9, 9, 10, 10, 10, 11, 11, 11, 12, 12, 3, 4, 5, 9, 10, 11, 4, 10] },
  };
  // mercados: genéricos (3:1) e um de cada recurso (2:1)
  const MARKETS = { std: ['any', 'any', 'any', 'any', ...RES], big: ['any', 'any', 'any', 'any', 'any', 'any', ...RES] };
  const PIPS = n => (n ? 6 - Math.abs(7 - n) : 0); // chance relativa de sair (2 e 12 = 1 ... 6 e 8 = 5)

  function shuffle(a, rnd) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  // escolhe k itens espalhados de uma lista circular ordenada (com início sorteado)
  function spread(list, k, rnd, ok) {
    const out = [], n = list.length, off = rnd() * n / k;
    for (let i = 0; i < k; i++) {
      const base = Math.floor(off + i * n / k);
      for (let d = 0; d < n; d++) { const c = list[(base + d) % n]; if (!out.includes(c) && ok(c, out)) { out.push(c); break; } }
    }
    return out.length === k ? out : null;
  }

  // mercados nas arestas da costa (sem dividir interseção) e cardumes nos hexágonos de mar (sem vizinhos entre si)
  function placeSea(g, conf, rnd) {
    const coast = g.edges.filter(e => e.coast).sort((a, b) => a.angle - b.angle);
    const mkEdges = spread(coast, conf.markets, rnd, (e, chosen) => chosen.every(c => c.a !== e.a && c.a !== e.b && c.b !== e.a && c.b !== e.b));
    if (!mkEdges) return null;
    const mkSea = new Set(mkEdges.map(e => e.hexes.find(h => g.hexes[h].kind === 'sea')));
    const seaOk = g.sea.filter(i => g.hexes[i].corners.filter(c => c != null).length >= 2 && !mkSea.has(i)).map(i => g.hexes[i]).sort((a, b) => a.angle - b.angle);
    const shoals = spread(seaOk, conf.shoals, rnd, (h, chosen) => chosen.every(c => !h.nb.includes(c.id)));
    if (!shoals) return null;
    const types = shuffle([...MARKETS[g.size]], rnd);
    return { markets: mkEdges.map((e, i) => ({ edge: e.id, type: types[i], sea: e.hexes.find(h => g.hexes[h].kind === 'sea') })), shoals: shoals.map(h => h.id) };
  }

  function score(g, terrain, num, balanced) {
    // vizinhança entre hexágonos com número (terra e cardumes)
    let bad = 0;
    for (const [id, n] of Object.entries(num)) {
      const h = g.hexes[id];
      for (const nb of h.nb) {
        const m = num[nb]; if (!m || nb < h.id) continue;
        if ((n === 6 || n === 8) && (m === 6 || m === 8)) return Infinity; // regra fixa
        if (balanced && n === m) bad += 3;
      }
      if (balanced) for (const nb of h.nb) if (nb > h.id && terrain[nb] && terrain[nb] === terrain[id] && terrain[id] !== 'cardume') bad += 1;
    }
    if (!balanced) return 0;
    // interseções ricas demais
    for (const v of g.vertices) { const s = v.hexes.reduce((t, h) => t + PIPS(num[h]), 0); if (s > 11) bad += (s - 11) * 2; }
    // produção esperada por recurso parecida
    const per = {}; for (const [id, n] of Object.entries(num)) { const r = TERRAIN_RES[terrain[id]]; per[r] = (per[r] || 0) + PIPS(n); }
    const vals = Object.values(per), avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    for (const v of vals) bad += Math.abs(v - avg) * .6;
    return bad;
  }

  // gera um mapa válido. mode: 'random' | 'balanced'
  function generate(size = 'std', mode = 'random', rnd = Math.random) {
    const g = Grid.build(size), conf = SETUP[size];
    let best = null;
    const tries = mode === 'balanced' ? 400 : 200;
    for (let t = 0; t < tries; t++) {
      const sea = placeSea(g, conf, rnd); if (!sea) continue;
      const kinds = shuffle(Object.entries(conf.land).flatMap(([k, n]) => Array(n).fill(k)), rnd);
      const terrain = {}; g.land.forEach((id, i) => { terrain[id] = kinds[i]; });
      for (const id of sea.shoals) terrain[id] = 'cardume';
      const producing = Object.keys(terrain).map(Number).filter(id => terrain[id] !== 'vulcao');
      const toks = shuffle([...conf.tokens], rnd), num = {};
      producing.forEach((id, i) => { num[id] = toks[i]; });
      const s = score(g, terrain, num, mode === 'balanced');
      if (s === Infinity) continue;
      if (!best || s < best.s) best = { s, terrain, num, sea };
      if (mode !== 'balanced' || s < 2) break;
    }
    if (!best) throw new Error('não foi possível gerar o mapa');
    const tiles = g.hexes.map(h => ({ id: h.id, terrain: best.terrain[h.id] || 'mar', num: best.num[h.id] || null }));
    const volcano = tiles.find(t => t.terrain === 'vulcao').id;
    return { size, mode, tiles, markets: best.sea.markets, volcano };
  }

  return { generate, RES, TERRAIN_RES, SETUP, MARKETS, PIPS };
})();
if (typeof module !== 'undefined') module.exports = ArqMap;
