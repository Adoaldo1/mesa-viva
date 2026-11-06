// Testes do motor do Arquipélago. Rodar: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const Grid = require('../js/arq-grid.js');
const MapGen = require('../js/arq-map.js');
const Arq = require('../js/arq.js');

// gerador previsível (para os testes não dependerem da sorte)
function seeded(seed = 1) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function game(n = 3, opts = {}) {
  Arq.setRng(seeded(opts.seed || 7));
  const room = { players: Array.from({ length: n }, (_, i) => ({ id: 'p' + i, seat: i })), settings: { turnSec: 0, mapMode: opts.mode || 'random' } };
  const st = Arq.newGame(room);
  return st;
}
// pula a colocação inicial: estado limpo, todos sem peças, fase de ações do jogador da vez
function blank(st, phase = 'main') {
  st.buildings = {}; st.roads = {}; st.phase = phase; st.setup.need = null; st.turn = 0; st.turnNo = 5; st.rolled = phase === 'main';
  for (const p of st.players) { for (const r of Arq.RES) p.hand[r] = 0; p.cards = []; p.pieces = { ...Arq.PIECES }; p.played.explorador = 0; }
  for (const r of Arq.RES) st.bank[r] = st.map.size === 'big' ? 24 : 19;
  st.storm = st.map.volcano; st.longest = { owner: null, len: 0 }; st.army = { owner: null, n: 0 }; st.offer = null;
  return st;
}
const id = (st, i) => st.players[i].id;
const g = st => Arq.grid(st);
const giveHand = (st, i, h) => Object.assign(st.players[i].hand, h);
const rich = { madeira: 9, argila: 9, algodao: 9, pedra: 9, peixe: 9 };
// um caminho de arestas encadeadas a partir de um vértice (para montar estradas nos testes)
function path(st, start, len, avoid = new Set()) {
  const G = g(st), out = []; let v = start; const used = new Set();
  for (let i = 0; i < len; i++) {
    const e = G.vertices[v].edges.find(x => !used.has(x) && !avoid.has(x) && !st.roads[x]);
    if (e == null) break; used.add(e); out.push(e); const E = G.edges[e]; v = E.a === v ? E.b : E.a;
  }
  return out;
}
const otherEnd = (st, e, v) => { const E = g(st).edges[e]; return E.a === v ? E.b : E.a; };

// ---------- tabuleiro ----------
test('grade padrão: 19 hexágonos de terra, 54 interseções, 72 arestas', () => {
  const G = Grid.build('std');
  assert.equal(G.land.length, 19); assert.equal(G.vertices.length, 54); assert.equal(G.edges.length, 72);
  for (const v of G.vertices) assert.ok(v.adj.length >= 2 && v.adj.length <= 3);
});
test('grade grande: 30 hexágonos de terra', () => { assert.equal(Grid.build('big').land.length, 30); });

test('mapas gerados são válidos: composição, números e 6/8 nunca vizinhos', () => {
  for (const size of ['std', 'big']) for (const mode of ['random', 'balanced']) for (let i = 0; i < 30; i++) {
    const m = MapGen.generate(size, mode, seeded(i + 1)), G = Grid.build(size), conf = MapGen.SETUP[size];
    const count = k => m.tiles.filter(t => t.terrain === k).length;
    for (const [k, n] of Object.entries(conf.land)) assert.equal(count(k), n, `${size} ${k}`);
    assert.equal(count('cardume'), conf.shoals);
    assert.equal(m.tiles.find(t => t.terrain === 'vulcao').num, null);
    assert.deepEqual(m.tiles.filter(t => t.num).map(t => t.num).sort((a, b) => a - b), [...conf.tokens].sort((a, b) => a - b));
    for (const t of m.tiles) if (t.num === 6 || t.num === 8) for (const nb of G.hexes[t.id].nb) assert.ok(![6, 8].includes(m.tiles[nb].num), '6/8 vizinhos');
    assert.equal(m.markets.length, conf.markets);
    const ends = m.markets.flatMap(k => [G.edges[k.edge].a, G.edges[k.edge].b]);
    assert.equal(new Set(ends).size, ends.length, 'mercados dividindo interseção');
  }
});

// ---------- colocação ----------
test('regra da distância: não dá vila vizinha de outra construção', () => {
  const st = blank(game()); const G = g(st), v = 10, u = G.vertices[v].adj[0];
  st.buildings[v] = { owner: id(st, 1), type: 'vila' };
  assert.equal(Arq.canPlaceVila(st, id(st, 0), u, true), false);
  assert.equal(Arq.canPlaceVila(st, id(st, 0), v, true), false);
});
test('vila fora da colocação inicial precisa de trilha própria ligada', () => {
  const st = blank(game()); giveHand(st, 0, rich);
  const v = 20, [e1, e2] = path(st, v, 2), far = otherEnd(st, e2, otherEnd(st, e1, v));
  st.buildings[v] = { owner: id(st, 0), type: 'vila' };
  assert.ok(Arq.act(st, id(st, 0), { type: 'build', what: 'vila', at: far }), 'sem trilha deveria falhar');
  st.roads[e1] = id(st, 0); st.roads[e2] = id(st, 0);
  assert.equal(Arq.act(st, id(st, 0), { type: 'build', what: 'vila', at: far }), null);
  assert.equal(st.buildings[far].owner, id(st, 0));
});
test('trilha precisa se ligar e não atravessa construção de outro', () => {
  const st = blank(game()); giveHand(st, 0, rich); const G = g(st);
  const v = 20, [e1, e2] = path(st, v, 2), mid = otherEnd(st, e1, v);
  st.buildings[v] = { owner: id(st, 0), type: 'vila' };
  assert.ok(Arq.act(st, id(st, 0), { type: 'build', what: 'trilha', at: e2 }), 'trilha solta deveria falhar');
  assert.equal(Arq.act(st, id(st, 0), { type: 'build', what: 'trilha', at: e1 }), null);
  st.buildings[mid] = { owner: id(st, 1), type: 'vila' }; // outro jogador fecha a passagem
  assert.equal(Arq.canPlaceRoad(st, id(st, 0), e2), false);
  assert.ok(G.edges[e2]);
});
test('colocação inicial: ordem de ida e volta e recursos da segunda vila', () => {
  const st = game(3);
  assert.deepEqual(st.setup.order, [0, 1, 2, 2, 1, 0]);
  const used = [];
  for (let step = 0; step < 6; step++) {
    const pid = st.players[st.turn].id, spots = Arq.validVilaSpots(st, pid, true), v = spots[0];
    const before = Arq.total(st.players[st.turn].hand);
    assert.equal(Arq.act(st, pid, { type: 'setupVila', v }), null);
    const gained = Arq.total(st.players.find(p => p.id === pid).hand) - before;
    const expect = step >= 3 ? Arq.producingHexes(st, v).filter(h => Arq.TERRAIN_RES[st.map.tiles[h].terrain]).length : 0;
    assert.equal(gained, expect, `passo ${step}`);
    const e = Arq.validRoadSpots(st, pid, v)[0];
    assert.equal(Arq.act(st, pid, { type: 'setupTrilha', e }), null);
    used.push(pid);
  }
  assert.deepEqual(used, ['p?', 'p?', 'p?', 'p?', 'p?', 'p?'].map((_, i) => st.players[[0, 1, 2, 2, 1, 0][i]].id));
  assert.equal(st.phase, 'roll'); assert.equal(st.turn, 0);
});

// ---------- dados e produção ----------
function forceRoll(st, a, b) { const seq = [(a - 1) / 6 + .01, (b - 1) / 6 + .01]; let i = 0; Arq.setRng(() => seq[i++ % 2]); }
test('produção: vila recebe 1, cidade recebe 2, tempestade bloqueia', () => {
  const st = blank(game(), 'roll'), G = g(st);
  const t = st.map.tiles.find(x => x.num === 9 && x.terrain !== 'cardume' && x.id !== st.storm), res = Arq.TERRAIN_RES[t.terrain];
  const [v1, , v3] = G.hexes[t.id].corners;
  st.buildings[v1] = { owner: id(st, 1), type: 'vila' }; st.buildings[v3] = { owner: id(st, 2), type: 'cidade' };
  const otherNine = st.map.tiles.filter(x => x.num === 9 && x.id !== t.id).map(x => x.id);
  for (const o of otherNine) for (const v of G.hexes[o].corners) if (v != null) delete st.buildings[v];
  forceRoll(st, 4, 5); Arq.act(st, id(st, 0), { type: 'roll' });
  assert.equal(st.players[1].hand[res], 1); assert.equal(st.players[2].hand[res], 2);
  // de novo, com a tempestade em cima
  st.phase = 'roll'; st.storm = t.id; forceRoll(st, 4, 5); Arq.act(st, id(st, 0), { type: 'roll' });
  assert.equal(st.players[1].hand[res], 1); assert.equal(st.players[2].hand[res], 2);
});
test('cardume (mar) produz peixe para a costa', () => {
  const st = blank(game(), 'roll'), G = g(st);
  const t = st.map.tiles.find(x => x.terrain === 'cardume'); const v = G.hexes[t.id].corners.find(c => c != null);
  st.buildings[v] = { owner: id(st, 1), type: 'vila' };
  const [a, b] = t.num <= 7 ? [1, t.num - 1] : [6, t.num - 6];
  forceRoll(st, a, b); Arq.act(st, id(st, 0), { type: 'roll' });
  assert.ok(st.players[1].hand.peixe >= 1);
});
test('banco sem estoque: com dois ou mais jogadores, ninguém recebe aquele recurso', () => {
  const st = blank(game(), 'roll'), G = g(st);
  const t = st.map.tiles.find(x => x.num === 5 && x.terrain !== 'cardume'), res = Arq.TERRAIN_RES[t.terrain];
  const c = G.hexes[t.id].corners;
  st.buildings[c[0]] = { owner: id(st, 1), type: 'cidade' }; st.buildings[c[3]] = { owner: id(st, 2), type: 'cidade' };
  st.bank[res] = 3; forceRoll(st, 2, 3); Arq.act(st, id(st, 0), { type: 'roll' });
  assert.equal(st.players[1].hand[res], 0); assert.equal(st.players[2].hand[res], 0); assert.equal(st.bank[res], 3);
});

// ---------- sete, descarte e tempestade ----------
test('sete: quem tem mais de 9 descarta metade (para baixo), depois move a tempestade e rouba', () => {
  const st = blank(game(), 'roll');
  giveHand(st, 1, { madeira: 6, pedra: 5 }); giveHand(st, 2, { argila: 9 });
  forceRoll(st, 3, 4); Arq.act(st, id(st, 0), { type: 'roll' });
  assert.equal(st.phase, 'discard'); assert.deepEqual(st.discard, { [id(st, 1)]: 5 });
  assert.ok(Arq.act(st, id(st, 0), { type: 'storm', tile: 0 }), 'não pode mover antes dos descartes');
  assert.ok(Arq.act(st, id(st, 1), { type: 'discard', res: { madeira: 4 } }), 'descarte com número errado');
  assert.equal(Arq.act(st, id(st, 1), { type: 'discard', res: { madeira: 3, pedra: 2 } }), null);
  assert.equal(Arq.total(st.players[1].hand), 6);
  assert.equal(st.phase, 'storm');
  assert.ok(Arq.act(st, id(st, 0), { type: 'storm', tile: st.storm }), 'precisa sair de onde está');
  const G = g(st), t = st.map.tiles.find(x => x.num && x.id !== st.storm).id;
  const v = G.hexes[t].corners.find(c => c != null); st.buildings[v] = { owner: id(st, 2), type: 'vila' };
  assert.equal(Arq.act(st, id(st, 0), { type: 'storm', tile: t }), null);
  assert.equal(Arq.total(st.players[0].hand), 1); assert.equal(Arq.total(st.players[2].hand), 8);
  assert.equal(st.phase, 'main');
});
test('roubo com mais de uma vítima: o jogador escolhe', () => {
  const st = blank(game(), 'storm'); st.resume = 'main';
  const G = g(st), t = st.map.tiles.find(x => x.num && x.id !== st.storm && x.terrain !== 'cardume').id, c = G.hexes[t].corners;
  st.buildings[c[0]] = { owner: id(st, 1), type: 'vila' }; st.buildings[c[3]] = { owner: id(st, 2), type: 'vila' };
  giveHand(st, 1, { pedra: 2 }); giveHand(st, 2, { peixe: 1 });
  Arq.act(st, id(st, 0), { type: 'storm', tile: t });
  assert.equal(st.phase, 'steal'); assert.deepEqual([...st.stealFrom].sort(), [id(st, 1), id(st, 2)].sort());
  assert.equal(Arq.act(st, id(st, 0), { type: 'steal', from: id(st, 2) }), null);
  assert.equal(st.players[0].hand.peixe, 1); assert.equal(st.phase, 'main');
});
test('1 contra 1: a tempestade não rouba de quem tem 3 pontos ou menos', () => {
  const st = blank(game(2), 'storm'); st.resume = 'main';
  const G = g(st), t = st.map.tiles.find(x => x.num && x.id !== st.storm && x.terrain !== 'cardume').id;
  st.buildings[G.hexes[t].corners[0]] = { owner: id(st, 1), type: 'vila' }; giveHand(st, 1, { pedra: 3 });
  Arq.act(st, id(st, 0), { type: 'storm', tile: t });
  assert.equal(st.players[1].hand.pedra, 3);
});

// ---------- construções e peças ----------
test('cidade custa 2 pedra + 2 algodão, devolve a vila e vale 2 pontos', () => {
  const st = blank(game()); const v = 15; st.buildings[v] = { owner: id(st, 0), type: 'vila' };
  giveHand(st, 0, { pedra: 2, algodao: 1 });
  assert.ok(Arq.act(st, id(st, 0), { type: 'build', what: 'cidade', at: v }));
  giveHand(st, 0, { algodao: 2 });
  const vilas = st.players[0].pieces.vila;
  assert.equal(Arq.act(st, id(st, 0), { type: 'build', what: 'cidade', at: v }), null);
  assert.equal(st.buildings[v].type, 'cidade'); assert.equal(st.players[0].pieces.vila, vilas + 1);
  assert.equal(Arq.publicVP(st, st.players[0]), 2);
});
test('limite de peças: sem vilas na reserva não constrói vila', () => {
  const st = blank(game()); giveHand(st, 0, rich);
  const v = 20, [e1, e2] = path(st, v, 2), far = otherEnd(st, e2, otherEnd(st, e1, v));
  st.buildings[v] = { owner: id(st, 0), type: 'vila' }; st.roads[e1] = st.roads[e2] = id(st, 0);
  st.players[0].pieces.vila = 0;
  assert.match(Arq.act(st, id(st, 0), { type: 'build', what: 'vila', at: far }), /não tem mais vilas/);
});
test('ações fora da vez e antes de rolar são recusadas', () => {
  const st = blank(game(), 'roll'); giveHand(st, 1, rich); giveHand(st, 0, rich);
  assert.match(Arq.act(st, id(st, 1), { type: 'roll' }), /vez/);
  assert.match(Arq.act(st, id(st, 0), { type: 'buyCard' }), /Role/);
  assert.match(Arq.act(st, id(st, 0), { type: 'end' }), /Role/);
});

// ---------- rota mais longa ----------
function lineFor(st, i, start, len, avoid) { const es = path(st, start, len, avoid); for (const e of es) st.roads[e] = id(st, i); return es; }
test('rota mais longa: mínimo de 5, conta ramificação pelo caminho mais longo', () => {
  const st = blank(game()); giveHand(st, 0, rich);
  const v0 = 25; st.buildings[v0] = { owner: id(st, 0), type: 'vila' };
  const es = lineFor(st, 0, v0, 4);
  assert.equal(Arq.roadLength(st, id(st, 0)), 4);
  // ramo curto saindo do meio não aumenta a rota
  const G = g(st), mid = otherEnd(st, es[0], v0), branch = G.vertices[mid].edges.find(e => !st.roads[e]);
  st.roads[branch] = id(st, 0);
  assert.equal(Arq.roadLength(st, id(st, 0)), 4);
  // estende a ponta: 5 → ganha a conquista
  let end = v0; for (const e of es) end = otherEnd(st, e, end);
  const ext = G.vertices[end].edges.find(e => !st.roads[e]);
  assert.equal(Arq.act(st, id(st, 0), { type: 'build', what: 'trilha', at: ext }), null);
  assert.equal(Arq.roadLength(st, id(st, 0)), 5);
  assert.equal(st.longest.owner, id(st, 0));
  assert.equal(Arq.publicVP(st, st.players[0]), 3);
});
test('rota mais longa: vila de outro corta a rota e a conquista sai se ninguém empatado', () => {
  const st = blank(game()); giveHand(st, 1, rich);
  const v0 = 25; st.buildings[v0] = { owner: id(st, 0), type: 'vila' };
  const es = lineFor(st, 0, v0, 6); st.longest = { owner: id(st, 0), len: 6 };
  assert.equal(Arq.roadLength(st, id(st, 0)), 6);
  // interseção no meio da rota, livre pela regra da distância
  let v = v0; const verts = [v0]; for (const e of es) { v = otherEnd(st, e, v); verts.push(v); }
  const cut = verts.slice(2, 5).find(x => Arq.canPlaceVila(st, id(st, 1), x, true));
  assert.ok(cut != null, 'precisa de um ponto de corte livre');
  // o jogador 1 chega ali por uma trilha própria e funda a vila
  const G = g(st), side = G.vertices[cut].edges.find(e => !st.roads[e]);
  st.roads[side] = id(st, 1); // trilha do jogador 1 chegando no ponto de corte (sem construção vizinha, pela regra da distância)
  assert.equal(Arq.act(st, id(st, 0), { type: 'end' }), null); st.turn = 1; st.phase = 'main';
  assert.equal(Arq.act(st, id(st, 1), { type: 'build', what: 'vila', at: cut }), null);
  assert.ok(Arq.roadLength(st, id(st, 0)) < 5);
  assert.equal(st.longest.owner, null);
});
test('rota mais longa: empate não tira de quem já tem; só passa quem tiver mais', () => {
  const st = blank(game());
  st.buildings[25] = { owner: id(st, 0), type: 'vila' }; lineFor(st, 0, 25, 5);
  st.longest = { owner: id(st, 0), len: 5 };
  const far = g(st).vertices.find(v => v.id > 40 && Arq.canPlaceVila(st, id(st, 1), v.id, true)).id;
  st.buildings[far] = { owner: id(st, 1), type: 'vila' }; const es1 = lineFor(st, 1, far, 5);
  assert.equal(es1.length, 5);
  st.turn = 1; giveHand(st, 1, rich);
  // mesma quantidade: continua com o jogador 0
  Arq.act(st, id(st, 1), { type: 'cancelOffer' }); // ação qualquer não muda nada
  assert.equal(st.longest.owner, id(st, 0));
  let end = far; for (const e of es1) end = otherEnd(st, e, end);
  const ext = g(st).vertices[end].edges.find(e => !st.roads[e]);
  assert.equal(Arq.act(st, id(st, 1), { type: 'build', what: 'trilha', at: ext }), null);
  assert.equal(st.longest.owner, id(st, 1));
});

// ---------- cartas ----------
test('carta comprada no turno não pode ser usada; só uma carta por turno', () => {
  const st = blank(game()); giveHand(st, 0, rich); st.deck = ['explorador', 'explorador', 'tesouro'];
  Arq.act(st, id(st, 0), { type: 'buyCard' });
  assert.match(Arq.act(st, id(st, 0), { type: 'playCard', card: 'tesouro' }), /próximo/);
  st.players[0].cards.push({ k: 'explorador', t: 1 }, { k: 'mercado', t: 1 });
  assert.equal(Arq.act(st, id(st, 0), { type: 'playCard', card: 'mercado' }), null);
  assert.match(Arq.act(st, id(st, 0), { type: 'playCard', card: 'explorador' }), /Só uma carta/);
});
test('mapa do tesouro e mercado negro', () => {
  const st = blank(game()); st.players[0].cards.push({ k: 'tesouro', t: 1 });
  assert.equal(Arq.act(st, id(st, 0), { type: 'playCard', card: 'tesouro', res: ['pedra', 'peixe'] }), null);
  assert.equal(st.players[0].hand.pedra, 1); assert.equal(st.players[0].hand.peixe, 1);
  st.cardPlayed = false; st.players[0].cards.push({ k: 'mercado', t: 1 });
  Arq.act(st, id(st, 0), { type: 'playCard', card: 'mercado' });
  assert.equal(Arq.act(st, id(st, 0), { type: 'bank', give: 'pedra', get: 'madeira' }), null);
  assert.equal(st.players[0].hand.madeira, 1); assert.equal(st.blackMarket, 2);
});
test('explorador antes dos dados: move a tempestade e volta para a rolagem', () => {
  const st = blank(game(), 'roll'); st.players[0].cards.push({ k: 'explorador', t: 1 });
  assert.equal(Arq.act(st, id(st, 0), { type: 'playCard', card: 'explorador' }), null);
  assert.equal(st.phase, 'storm');
  Arq.act(st, id(st, 0), { type: 'storm', tile: st.map.tiles.find(t => t.id !== st.storm && !t.num && t.terrain === 'mar').id });
  assert.equal(st.phase, 'roll');
});
test('maior expedição: 3 exploradores; só passa quem superar', () => {
  const st = blank(game());
  const play = i => { st.turn = i; st.phase = 'main'; st.cardPlayed = false; st.players[i].cards.push({ k: 'explorador', t: 1 }); assert.equal(Arq.act(st, id(st, i), { type: 'playCard', card: 'explorador' }), null); st.phase = 'main'; };
  play(0); play(0); assert.equal(st.army.owner, null); play(0); assert.equal(st.army.owner, id(st, 0));
  play(1); play(1); play(1); assert.equal(st.army.owner, id(st, 0), 'empate não transfere');
  play(1); assert.equal(st.army.owner, id(st, 1));
});
test('carpinteiros: 2 trilhas de graça', () => {
  const st = blank(game()); st.buildings[25] = { owner: id(st, 0), type: 'vila' }; st.players[0].cards.push({ k: 'carpinteiros', t: 1 });
  Arq.act(st, id(st, 0), { type: 'playCard', card: 'carpinteiros' }); assert.equal(st.phase, 'roads');
  const e1 = Arq.validRoadSpots(st, id(st, 0))[0]; Arq.act(st, id(st, 0), { type: 'build', what: 'trilha', at: e1 });
  const e2 = Arq.validRoadSpots(st, id(st, 0))[0]; Arq.act(st, id(st, 0), { type: 'build', what: 'trilha', at: e2 });
  assert.equal(st.phase, 'main'); assert.equal(Arq.total(st.players[0].hand), 0); assert.equal(st.players[0].pieces.trilha, 13);
});

// ---------- comércio ----------
test('banco 4:1, mercado genérico 3:1 e específico 2:1', () => {
  const st = blank(game()), G = g(st); giveHand(st, 0, { madeira: 8 });
  assert.equal(Arq.marketRatios(st, id(st, 0)).madeira, 4);
  const any = st.map.markets.find(m => m.type === 'any'), wood = st.map.markets.find(m => m.type === 'madeira');
  st.buildings[G.edges[any.edge].a] = { owner: id(st, 0), type: 'vila' };
  assert.equal(Arq.marketRatios(st, id(st, 0)).madeira, 3);
  st.buildings[G.edges[wood.edge].a] = { owner: id(st, 0), type: 'vila' };
  assert.equal(Arq.marketRatios(st, id(st, 0)).madeira, 2); assert.equal(Arq.marketRatios(st, id(st, 0)).pedra, 3);
  assert.equal(Arq.act(st, id(st, 0), { type: 'bank', give: 'madeira', get: 'pedra' }), null);
  assert.equal(st.players[0].hand.madeira, 6); assert.equal(st.players[0].hand.pedra, 1);
});
test('troca entre jogadores: proposta, aceite, confirmação atômica', () => {
  const st = blank(game()); giveHand(st, 0, { madeira: 2 }); giveHand(st, 1, { pedra: 1 }); giveHand(st, 2, { pedra: 1 });
  assert.equal(Arq.act(st, id(st, 0), { type: 'offer', give: { madeira: 2 }, get: { pedra: 1 } }), null);
  assert.equal(Arq.act(st, id(st, 1), { type: 'reply', accept: true }), null);
  assert.equal(Arq.act(st, id(st, 2), { type: 'reply', accept: false }), null);
  assert.match(Arq.act(st, id(st, 0), { type: 'confirm', with: id(st, 2) }), /não aceitou/);
  assert.equal(Arq.act(st, id(st, 0), { type: 'confirm', with: id(st, 1) }), null);
  assert.deepEqual([st.players[0].hand.pedra, st.players[0].hand.madeira, st.players[1].hand.madeira, st.players[1].hand.pedra], [1, 0, 2, 0]);
  assert.equal(st.offer, null);
});
test('troca: quem não tem os recursos não pode aceitar, e confirmação revalida', () => {
  const st = blank(game()); giveHand(st, 0, { madeira: 1 }); giveHand(st, 1, { pedra: 1 });
  Arq.act(st, id(st, 0), { type: 'offer', give: { madeira: 1 }, get: { pedra: 2 } });
  assert.match(Arq.act(st, id(st, 1), { type: 'reply', accept: true }), /não tem/);
  Arq.act(st, id(st, 0), { type: 'offer', give: { madeira: 1 }, get: { pedra: 1 } });
  Arq.act(st, id(st, 1), { type: 'reply', accept: true });
  st.players[1].hand.pedra = 0; // gastou antes da confirmação
  assert.match(Arq.act(st, id(st, 0), { type: 'confirm', with: id(st, 1) }), /não tem mais/);
  assert.equal(st.players[0].hand.madeira, 1);
});
test('contraproposta', () => {
  const st = blank(game()); giveHand(st, 0, { madeira: 3 }); giveHand(st, 1, { pedra: 2 });
  Arq.act(st, id(st, 0), { type: 'offer', give: { madeira: 1 }, get: { pedra: 1 } });
  assert.equal(Arq.act(st, id(st, 1), { type: 'counter', give: { madeira: 2 }, get: { pedra: 1 } }), null);
  assert.equal(Arq.act(st, id(st, 0), { type: 'confirm', with: id(st, 1) }), null);
  assert.equal(st.players[1].hand.madeira, 2); assert.equal(st.players[0].hand.pedra, 1);
});

// ---------- pontuação, vitória e visão ----------
test('vitória só no próprio turno, contando relíquias escondidas', () => {
  const st = blank(game()); st.goal = 10;
  for (const v of [0, 8, 16, 30]) st.buildings[v] = { owner: id(st, 0), type: 'cidade' }; // 8 pontos
  st.players[0].cards.push({ k: 'reliquia', t: 1 });
  giveHand(st, 0, { pedra: 1, peixe: 1, algodao: 1 }); st.deck = ['reliquia'];
  assert.equal(st.result, null);
  assert.equal(Arq.act(st, id(st, 0), { type: 'buyCard' }), null);
  assert.equal(st.result?.winner, id(st, 0));
});
test('com pontos de sobra no turno do outro, só vence quando agir na própria vez', () => {
  const st = blank(game()); st.goal = 10; st.turn = 1;
  for (const v of [0, 8, 16, 30, 40]) st.buildings[v] = { owner: id(st, 0), type: 'cidade' };
  Arq.act(st, id(st, 1), { type: 'end' });
  assert.equal(st.result, null); assert.equal(st.turn, 2);
});
test('visão: mãos e cartas dos outros ficam escondidas', () => {
  const st = blank(game()); giveHand(st, 1, { pedra: 3 }); st.players[1].cards.push({ k: 'reliquia', t: 1 });
  const v = Arq.viewFor(st, id(st, 0));
  assert.equal(v.players[1].hand, null); assert.equal(v.players[1].cards, null);
  assert.equal(v.players[1].handCount, 3); assert.equal(v.players[1].cardCount, 1);
  assert.equal(typeof v.deck.count, 'number');
  assert.notEqual(v.players[0].hand, null);
});
test('ação repetida (mesmo identificador) é ignorada', () => {
  const st = blank(game()); giveHand(st, 0, { madeira: 4 });
  assert.equal(Arq.act(st, id(st, 0), { type: 'bank', give: 'madeira', get: 'pedra', nonce: 'x1' }), null);
  giveHand(st, 0, { madeira: 4 });
  assert.match(Arq.act(st, id(st, 0), { type: 'bank', give: 'madeira', get: 'pedra', nonce: 'x1' }), /repetida/);
  assert.equal(st.players[0].hand.pedra, 1);
});
test('partidas inteiras de bots terminam sem erro e sem criar ou sumir recursos', () => {
  for (const n of [2, 3, 4, 5, 6]) for (let s = 1; s <= 4; s++) {
    const st = game(n, { seed: s * 11 + n });
    let k = 0;
    while (!st.result && k++ < 8000) {
      const ids = [st.players[st.turn].id, ...st.players.map(p => p.id)]; let acted = false;
      for (const pid of ids) { const a = Arq.botAction(st, pid); if (!a) continue; assert.equal(Arq.act(st, pid, a), null, `${n}j ${a.type}`); acted = true; break; }
      assert.ok(acted, 'travou');
    }
    assert.ok(st.result, `${n} jogadores não terminou`);
    const B = st.map.size === 'big' ? 24 : 19;
    for (const r of Arq.RES) assert.equal(st.bank[r] + st.players.reduce((t, p) => t + p.hand[r], 0), B);
  }
});
