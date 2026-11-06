// ===== Arquipélago — bots =====
// action(): bot de verdade (escolhe bons lugares, troca com o banco, compra e usa cartas, responde propostas).
// safeAction(): jogada mínima para quem ficou sem tempo ou caiu (põe peças no melhor lugar, rola, passa a vez).
// Só devolve ações válidas: o motor confere tudo de novo antes de aplicar.
const ArqBot = (() => {
  const A = () => (typeof Arq !== 'undefined' ? Arq : require('./arq.js'));
  const MapGen = typeof ArqMap !== 'undefined' ? ArqMap : require('./arq-map.js');
  const RES = MapGen.RES, PIPS = MapGen.PIPS, TR = MapGen.TERRAIN_RES;
  const pl = (st, id) => st.players.find(p => p.id === id);
  const cur = st => st.players[st.turn];

  // produção esperada de cada recurso para um jogador (pips das construções)
  function income(st, pid) {
    const g = A().grid(st), inc = Object.fromEntries(RES.map(r => [r, 0]));
    for (const [v, b] of Object.entries(st.buildings)) if (b.owner === pid) for (const h of g.vertices[v].hexes) {
      const t = st.map.tiles[h], r = TR[t.terrain]; if (r && t.num && h !== st.storm) inc[r] += PIPS(t.num) * (b.type === 'cidade' ? 2 : 1);
    }
    return inc;
  }
  // quanto vale uma interseção para este jogador: produção, recursos que ele ainda não tem e mercados
  function vertexValue(st, pid, v) {
    const g = A().grid(st), inc = income(st, pid); let val = 0; const seen = new Set();
    for (const h of g.vertices[v].hexes) {
      const t = st.map.tiles[h], r = TR[t.terrain]; if (!r || !t.num) continue;
      const p = PIPS(t.num) * (h === st.storm ? .4 : 1);
      val += p * (inc[r] < 3 ? 1.35 : 1) + (seen.has(r) ? 0 : 1.2); seen.add(r);
    }
    for (const m of st.map.markets) { const E = g.edges[m.edge]; if (E.a === v || E.b === v) val += m.type === 'any' ? 1.5 : (inc[m.type] >= 5 ? 3 : 1); }
    return val;
  }
  function bestRoad(st, pid, list) {
    const g = A().grid(st); let best = null, bs = -1;
    for (const e of list) {
      const E = g.edges[e];
      // ponta nova da trilha: onde ainda não há trilha minha
      const ends = [E.a, E.b].filter(v => !g.vertices[v].edges.some(x => x !== e && st.roads[x] === pid) && !(st.buildings[v]?.owner === pid));
      let s = 0;
      for (const u of ends.length ? ends : [E.a, E.b]) {
        const free = w => !st.buildings[w] && g.vertices[w].adj.every(x => !st.buildings[x]);
        if (free(u)) s = Math.max(s, vertexValue(st, pid, u));
        for (const w of g.vertices[u].adj) if (free(w)) s = Math.max(s, vertexValue(st, pid, w) * .7);
      }
      s += Math.random() * .3;
      if (s > bs) { bs = s; best = e; }
    }
    return best;
  }
  const bestVertex = (st, pid, list) => list.reduce((b, v) => (b == null || vertexValue(st, pid, v) > vertexValue(st, pid, b) ? v : b), null);

  function stormTile(st, pid) {
    const g = A().grid(st), opp = st.players.filter(p => p.id !== pid);
    const lead = opp.reduce((b, p) => (A().publicVP(st, p) > A().publicVP(st, b) ? p : b), opp[0]);
    let best = null, bs = -Infinity;
    for (const h of g.hexes) {
      if (h.id === st.storm) continue;
      const t = st.map.tiles[h.id]; let s = 0, mine = false;
      for (const v of h.corners) { const b = v != null && st.buildings[v]; if (!b) continue; if (b.owner === pid) mine = true; else s += (t.num ? PIPS(t.num) : .5) * (b.type === 'cidade' ? 2 : 1) * (b.owner === lead.id ? 1.5 : 1); }
      if (mine) s -= 100;
      s += Math.random() * .2;
      if (s > bs) { bs = s; best = h.id; }
    }
    return best;
  }

  function discardFor(hand, n, keep = {}) {
    const h = { ...hand }, out = {};
    for (let i = 0; i < n; i++) {
      const r = RES.filter(x => h[x] > 0).sort((a, b) => (h[b] - (keep[b] || 0)) - (h[a] - (keep[a] || 0)))[0];
      h[r]--; out[r] = (out[r] || 0) + 1;
    }
    return out;
  }

  // o que o bot quer construir agora e o que falta para isso
  function goal(st, pid) {
    const p = pl(st, pid), C = A().COST;
    const cities = A().validCitySpots(st, pid), vilas = A().validVilaSpots(st, pid);
    if (cities.length && p.pieces.cidade) return C.cidade;
    if (vilas.length && p.pieces.vila) return C.vila;
    if (p.pieces.trilha && A().validRoadSpots(st, pid).length) return p.pieces.vila ? { ...C.trilha } : C.carta;
    return C.carta;
  }
  const missing = (hand, cost) => Object.fromEntries(Object.entries(cost).map(([r, n]) => [r, Math.max(0, n - (hand[r] || 0))]).filter(([, n]) => n > 0));

  function setupAction(st, pid) {
    const s = st.setup;
    if (s.need === 'vila') return { type: 'setupVila', v: bestVertex(st, pid, A().validVilaSpots(st, pid, true)) };
    return { type: 'setupTrilha', e: bestRoad(st, pid, A().validRoadSpots(st, pid, s.lastVila)) };
  }

  function playable(st, p, k) { return !st.cardPlayed && p.cards.some(c => c.k === k && c.t < st.turnNo); }

  function action(st, pid) {
    const p = pl(st, pid); if (!p || st.result) return null;
    if (st.discard?.[pid]) return { type: 'discard', res: discardFor(p.hand, st.discard[pid], goal(st, pid)) };
    const o = st.offer;
    if (o && o.from !== pid && !o.replies[pid] && (!o.to || o.to.includes(pid))) return { type: 'reply', accept: wantsTrade(st, p, o) };
    if (cur(st).id !== pid) return null;
    switch (st.phase) {
      case 'setup': return setupAction(st, pid);
      case 'roll': {
        // explorador antes dos dados se a tempestade estiver em cima de mim
        if (playable(st, p, 'explorador') && blocksMe(st, pid)) return { type: 'playCard', card: 'explorador' };
        return { type: 'roll' };
      }
      case 'storm': return { type: 'storm', tile: stormTile(st, pid) };
      case 'steal': return { type: 'steal', from: [...st.stealFrom].sort((a, b) => A().publicVP(st, pl(st, b)) - A().publicVP(st, pl(st, a)))[0] };
      case 'roads': { const l = A().validRoadSpots(st, pid); return l.length ? { type: 'build', what: 'trilha', at: bestRoad(st, pid, l) } : { type: 'skipRoads' }; }
      case 'main': return mainAction(st, p);
    }
    return null;
  }
  function blocksMe(st, pid) {
    const g = A().grid(st);
    return st.map.tiles[st.storm].num && g.hexes[st.storm].corners.some(v => v != null && st.buildings[v]?.owner === pid);
  }
  function mainAction(st, p) {
    const pid = p.id, C = A().COST, has = A().has;
    if (st.offer?.from === pid) {
      const ok = Object.entries(st.offer.replies).find(([, r]) => r === 'accept');
      return ok ? { type: 'confirm', with: ok[0] } : { type: 'cancelOffer' };
    }
    if (playable(st, p, 'explorador') && blocksMe(st, pid)) return { type: 'playCard', card: 'explorador' };
    if (playable(st, p, 'carpinteiros') && p.pieces.trilha >= 2 && A().validRoadSpots(st, pid).length) return { type: 'playCard', card: 'carpinteiros' };
    if (playable(st, p, 'tesouro')) {
      const miss = missing(p.hand, goal(st, pid)), want = Object.entries(miss).flatMap(([r, n]) => Array(n).fill(r)).filter(r => st.bank[r] > 0);
      if (want.length && want.length <= 2) { while (want.length < 2) want.push(RES.find(r => st.bank[r] > 0)); return { type: 'playCard', card: 'tesouro', res: want }; }
    }
    const cities = A().validCitySpots(st, pid);
    if (cities.length && p.pieces.cidade && has(p.hand, C.cidade)) return { type: 'build', what: 'cidade', at: bestVertex(st, pid, cities) };
    const vilas = A().validVilaSpots(st, pid);
    if (vilas.length && p.pieces.vila && has(p.hand, C.vila)) return { type: 'build', what: 'vila', at: bestVertex(st, pid, vilas) };
    const roads = A().validRoadSpots(st, pid);
    const roadCount = Object.values(st.roads).filter(x => x === pid).length;
    if (!vilas.length && roads.length && p.pieces.trilha && has(p.hand, C.trilha) && (p.pieces.vila || roadCount < 14)) return { type: 'build', what: 'trilha', at: bestRoad(st, pid, roads) };
    if (st.deck.length && has(p.hand, C.carta) && (!vilas.length || !has(p.hand, C.vila)) && !(cities.length && p.pieces.cidade && (p.hand.pedra < 3))) return { type: 'buyCard' };
    // troca com o banco: sobra de um recurso por um que falta para o objetivo
    const target = goal(st, pid), miss = missing(p.hand, target), ratios = A().marketRatios(st, pid);
    for (const want of Object.keys(miss)) {
      if (!st.bank[want]) continue;
      const giveR = RES.filter(r => r !== want && (p.hand[r] - (target[r] || 0)) >= (st.blackMarket ? 1 : ratios[r])).sort((a, b) => p.hand[b] - p.hand[a])[0];
      if (giveR) return { type: 'bank', give: giveR, get: want, n: 1 };
    }
    return { type: 'end' };
  }
  function wantsTrade(st, p, o) {
    if (!A().has(p.hand, o.get)) return false;
    const from = pl(st, o.from); if (A().publicVP(st, from) >= st.goal - 2) return false; // não ajuda quem está para ganhar
    const need = missing(p.hand, goal(st, p.id)), inc = income(st, p.id);
    const val = (r, sign) => (need[r] ? 3 : 1) * (inc[r] < 3 ? 1.3 : 1) * (sign < 0 && p.hand[r] <= 1 ? 1.6 : 1);
    const gain = Object.entries(o.give).reduce((s, [r, n]) => s + n * val(r, 1), 0), loss = Object.entries(o.get).reduce((s, [r, n]) => s + n * val(r, -1), 0);
    return gain > loss * 1.15;
  }

  // jogada mínima e segura (sem trocas nem compras)
  function safeAction(st, pid) {
    const p = pl(st, pid); if (!p) return null;
    if (st.discard?.[pid]) return { type: 'discard', res: discardFor(p.hand, st.discard[pid]) };
    if (cur(st).id !== pid) return null;
    switch (st.phase) {
      case 'setup': return setupAction(st, pid);
      case 'roll': return { type: 'roll' };
      case 'storm': return { type: 'storm', tile: stormTile(st, pid) };
      case 'steal': return { type: 'steal', from: st.stealFrom[0] };
      case 'roads': { const l = A().validRoadSpots(st, pid); return l.length ? { type: 'build', what: 'trilha', at: bestRoad(st, pid, l) } : { type: 'skipRoads' }; }
      case 'main': return st.offer ? { type: 'cancelOffer' } : { type: 'end' };
    }
    return null;
  }

  return { action, safeAction, vertexValue, income, discardFor };
})();
if (typeof module !== 'undefined') module.exports = ArqBot;
