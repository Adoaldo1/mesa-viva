// Partidas inteiras pela sala: node tests/patrimonio.test.js
const assert = require('assert');
global.Engine = require('../js/pat-engine.js');
global.PD = require('../js/pat-data.js');
const P = require('../js/patrimonio.js');
const room = (n, bots) => ({ settings: { turnSec: 90 }, players: Array.from({ length: n }, (_, i) => ({ id: 'p' + i, name: 'P' + i, char: 'lia', seat: i, bot: i < bots, pathat: i === n - 1 ? 'coroa' : undefined })) });

// chapéus nunca repetem e o escolhido é respeitado
const st0 = P.newGame(room(6, 5));
assert.strictEqual(new Set(st0.players.map(p => p.token)).size, 6);
assert.strictEqual(st0.players[5].token, 'coroa');
assert.ok(st0.gameId && st0.log.length >= 0);

// entrada ruim da rede: erro, sem quebrar nem mudar o estado
const st1 = P.newGame(room(3, 0)), snap = JSON.stringify(st1);
for (const [id, a] of [['p0', null], ['p0', {}], ['p0', { type: 'nada' }], ['x', { type: 'roll' }], ['p1', { type: 'roll' }], ['p0', { type: 'offer', to: 99, give: null }], ['p0', { type: 'build', sq: 'constructor' }]]) {
  assert.ok(typeof P.act(st1, id, a) === 'string', JSON.stringify(a));
  assert.strictEqual(JSON.stringify(st1), snap, JSON.stringify(a));
}

// contratos dos outros não vão para a tela de ninguém
const st2 = P.newGame(room(3, 0)); st2.players[1].contracts = [1, 2]; st2.players[0].contracts = [3];
const v = P.viewFor(st2, 'p0');
assert.deepStrictEqual(v.players[1].contracts, []); assert.deepStrictEqual(v.players[0].contracts, [3]); assert.deepStrictEqual(st2.players[1].contracts, [1, 2]);

// o relógio do leilão acaba o leilão; bots e ausentes levam a partida até o fim, com resultado para o placar
function play(n, bots, afk) {
  const st = P.newGame(room(n, bots));
  let steps = 0, auctions = 0, seen = 0;
  while (st.phase !== 'over' && steps++ < 40000) {
    for (const e of st.log) { if (e.n > seen) seen = e.n; }
    assert.strictEqual(st.ev.length, 0);
    assert.ok(st.log.length <= 40);
    const list = [st.players[st.turn], ...st.players];
    let a = null, who = null;
    for (const p of list) { a = (p.bot ? P.botAction : afk(p) ? P.afkAction : () => null)(st, p.id); if (a) { who = p; break; } }
    if (st.auction) { auctions += 1; if (!a) { assert.ok(st.auction.deadline > 0); assert.ok(P.nextDeadline(st) === st.auction.deadline); assert.ok(P.timeout(st)); continue; } }
    if (!a) { assert.ok(st.deadline > 0, 'humano sem prazo em ' + st.phase); assert.ok(P.timeout(st)); continue; }
    const err = P.act(st, who.id, a);
    assert.strictEqual(err, null, JSON.stringify(a) + ' ' + err + ' fase ' + st.phase);
  }
  return { st, steps, auctions };
}
const r1 = play(4, 4, () => false);
assert.strictEqual(r1.st.phase, 'over'); assert.ok(r1.st.result.winner); assert.strictEqual(r1.st.result.ranking.length, 4); assert.ok(r1.auctions > 0);
// humano parado: o prazo joga por ele no modo seguro e a partida anda
const r2 = play(3, 2, () => false);
assert.strictEqual(r2.st.phase, 'over'); assert.ok(r2.st.result.winner);
// só desconectados
const r3 = play(3, 0, () => true);
assert.ok(r3.steps >= 40000 || r3.st.phase === 'over');
console.log('ok: patrimônio na sala', r1.steps, r2.steps, r3.steps);
