// ===== Arquipélago — geometria do tabuleiro =====
// Hexágonos "de ponta para cima" em coordenadas axiais (q, r). A partir só do tamanho do mapa, monta o grafo:
//   hexes    — terra e o anel de mar em volta (com os vizinhos)
//   vertices — interseções onde ficam vilas e cidades (só as que tocam terra)
//   edges    — arestas entre duas interseções, onde ficam as trilhas
// O grafo é determinístico: anfitrião e jogadores calculam exatamente os mesmos ids a partir do tamanho.
// Não depende de interface nem de rede (roda no navegador e nos testes em Node).
const ArqGrid = (() => {
  const SQ3 = Math.sqrt(3);
  const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
  const key = (q, r) => q + ',' + r;

  // formato das ilhas: 'std' = 19 hexágonos (2 a 4 jogadores), 'big' = 30 hexágonos (5 a 6 jogadores)
  function landCoords(size) {
    const out = [];
    if (size === 'big') {
      for (let r = -3; r <= 3; r++) for (let q = Math.max(-3, -3 - r); q <= Math.min(3, 3 - r) - 1; q++) out.push([q, r]);
    } else {
      for (let r = -2; r <= 2; r++) for (let q = Math.max(-2, -2 - r); q <= Math.min(2, 2 - r); q++) out.push([q, r]);
    }
    return out;
  }
  const center = (q, r) => [SQ3 * (q + r / 2), 1.5 * r];
  const corner = (cx, cy, i) => { const a = Math.PI / 180 * (60 * i - 30); return [cx + Math.cos(a), cy + Math.sin(a)]; };
  const vkey = (x, y) => Math.round(x * 100) + ':' + Math.round(y * 100);

  const cache = {};
  function build(size = 'std') {
    if (cache[size]) return cache[size];
    const land = landCoords(size), landSet = new Set(land.map(([q, r]) => key(q, r)));
    // anel de mar: vizinhos da terra que não são terra
    const seaSet = new Map();
    for (const [q, r] of land) for (const [dq, dr] of DIRS) { const k = key(q + dq, r + dr); if (!landSet.has(k) && !seaSet.has(k)) seaSet.set(k, [q + dq, r + dr]); }
    // ordem estável: terra por linha, depois mar
    const sortQR = (a, b) => a[1] - b[1] || a[0] - b[0];
    const coords = [...land.sort(sortQR).map(c => [...c, 'land']), ...[...seaSet.values()].sort(sortQR).map(c => [...c, 'sea'])];
    // centraliza o desenho na origem
    const pts = coords.map(([q, r]) => center(q, r));
    const cx0 = (Math.min(...pts.map(p => p[0])) + Math.max(...pts.map(p => p[0]))) / 2, cy0 = (Math.min(...pts.map(p => p[1])) + Math.max(...pts.map(p => p[1]))) / 2;
    const hexes = coords.map(([q, r, kind], id) => { const [x, y] = center(q, r); return { id, q, r, kind, x: x - cx0, y: y - cy0, corners: [], edges: [], nb: [] }; });
    const byQR = new Map(hexes.map(h => [key(h.q, h.r), h]));
    for (const h of hexes) h.nb = DIRS.map(([dq, dr]) => byQR.get(key(h.q + dq, h.r + dr))?.id).filter(v => v != null);

    // interseções: cantos dos hexágonos de terra (deduplicados pela posição)
    const vmap = new Map(), vlist = [];
    for (const h of hexes) if (h.kind === 'land') for (let i = 0; i < 6; i++) {
      const [x, y] = corner(h.x, h.y, i), k = vkey(x, y);
      if (!vmap.has(k)) { const v = { x, y, hexes: [] }; vmap.set(k, v); vlist.push(v); }
    }
    vlist.sort((a, b) => a.y - b.y || a.x - b.x).forEach((v, i) => { v.id = i; v.adj = []; v.edges = []; });
    for (const h of hexes) for (let i = 0; i < 6; i++) {
      const [x, y] = corner(h.x, h.y, i), v = vmap.get(vkey(x, y));
      h.corners.push(v ? v.id : null);
      if (v) v.hexes.push(h.id);
    }
    // arestas: pares de cantos consecutivos de hexágonos de terra
    const emap = new Map(), elist = [];
    for (const h of hexes) if (h.kind === 'land') for (let i = 0; i < 6; i++) {
      const a = h.corners[i], b = h.corners[(i + 1) % 6], [lo, hi] = a < b ? [a, b] : [b, a], k = lo + '-' + hi;
      if (!emap.has(k)) { const e = { a: lo, b: hi, hexes: [] }; emap.set(k, e); elist.push(e); }
    }
    elist.sort((x, y) => x.a - y.a || x.b - y.b).forEach((e, i) => { e.id = i; });
    for (const h of hexes) for (let i = 0; i < 6; i++) {
      const a = h.corners[i], b = h.corners[(i + 1) % 6]; if (a == null || b == null) continue;
      const e = emap.get(Math.min(a, b) + '-' + Math.max(a, b)); if (!e) continue;
      h.edges.push(e.id); e.hexes.push(h.id);
    }
    for (const e of elist) { vlist[e.a].adj.push(e.b); vlist[e.b].adj.push(e.a); vlist[e.a].edges.push(e.id); vlist[e.b].edges.push(e.id); }
    // costa: arestas com um hexágono de terra e um de mar
    for (const e of elist) e.coast = e.hexes.some(i => hexes[i].kind === 'sea') && e.hexes.some(i => hexes[i].kind === 'land');
    // ordem em volta da ilha (para espalhar mercados e cardumes)
    for (const e of elist) { const A = vlist[e.a], B = vlist[e.b]; e.angle = Math.atan2((A.y + B.y) / 2, (A.x + B.x) / 2); }
    for (const h of hexes) h.angle = Math.atan2(h.y, h.x);

    const g = { size, hexes, vertices: vlist, edges: elist, land: hexes.filter(h => h.kind === 'land').map(h => h.id), sea: hexes.filter(h => h.kind === 'sea').map(h => h.id) };
    g.edgeOf = (a, b) => emap.get(Math.min(a, b) + '-' + Math.max(a, b))?.id ?? null;
    return (cache[size] = g);
  }

  return { build, landCoords, DIRS };
})();
if (typeof module !== 'undefined') module.exports = ArqGrid;
