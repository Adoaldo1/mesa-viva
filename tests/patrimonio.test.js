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

// cor vem do perfil; o que não for cor vira a padrão (a tela põe isso direto no HTML)
const rc = room(2, 0); rc.players[0].color = '#12a594'; rc.players[1].color = '"><img src=x onerror=alert(1)>';
const stc = P.newGame(rc);
assert.strictEqual(stc.players[0].color, '#12a594'); assert.strictEqual(stc.players[1].color, PD.COLORS[1]);

// a prévia do patrocínio bate com o aluguel depois de escolher
const stp = P.newGame(room(2, 0)), sqp = 39; stp.props[sqp].owner = 0;
assert.strictEqual(Engine.sponsorLevel(stp, 0), 1);
const prevista = Engine.rentOf(stp, sqp, { lv: 1 }); stp.sp = { who: 0, sq: sqp, lv: 1 };
assert.strictEqual(Engine.rentOf(stp, sqp), prevista); assert.strictEqual(prevista, Math.round(stp.props[sqp].h ? 0 : 43 * 1.5));
assert.strictEqual(Engine.sponsorLevel(stp, 0), 2); assert.strictEqual(Engine.sponsorLevel(stp, 1), 1); stp.sp = null;

// o número da roleta sobrevive à numeração do diário: a roda e o resultado mostram o mesmo sorteio
{
  const st = P.newGame(room(2, 0)); st.busyUntil = 0; st.casino = true; st.phase = 'casino'; st.turn = 0; st.players[0].cash = 500;
  assert.strictEqual(P.act(st, 'p0', { type: 'bet', game: 'roleta', pick: 'red', amount: 10 }), null);
  const spin = st.log.find(e => e.t === 'casinoSpin'), res = st.log.find(e => e.t === 'casinoResult');
  assert.ok(spin.num >= 0 && spin.num <= 36); assert.ok(res.shown.startsWith(String(spin.num)), res.shown);
  assert.strictEqual(spin.color, spin.num === 0 ? 'green' : PD.ROULETTE_RED.includes(spin.num) ? 'red' : 'black');
}
// fiado cobre só o que falta, não a conta inteira
{
  const st = P.newGame(room(2, 0)); st.busyUntil = 0; st.props[24].owner = 0; st.players[0].cash = -20; st.players[1].cash = 500; st.phase = 'debt'; st.turn = 0; st.debts = [{ who: 0, to: 1, amt: 233, why: 'aluguel' }];
  assert.strictEqual(P.act(st, 'p0', { type: 'fiado', sq: 24, rate: 10, turns: 2 }), null); assert.strictEqual(st.credit.amt, 20);
  assert.strictEqual(P.act(st, 'p1', { type: 'creditYes' }), null); assert.strictEqual(st.players[0].cash, 0); assert.strictEqual(st.players[1].cash, 480); assert.strictEqual(st.loans[0].total, 22);
}
// no vermelho dá para negociar; recusar a compra não leiloa
{
  const st = P.newGame(room(2, 0)); st.busyUntil = 0; st.props[5].owner = 0; st.players[0].cash = -133; st.players[1].cash = 677; st.phase = 'debt'; st.turn = 0; st.debts = [{ who: 0, to: 1, amt: 133, why: 'aluguel' }];
  assert.strictEqual(P.act(st, 'p0', { type: 'offer', to: 1, give: { props: [5] }, want: { cash: 100 } }), null, 'pode vender mesmo sem zerar o saldo');
  const s2 = P.newGame(room(2, 0)); s2.busyUntil = 0; s2.phase = 'buy'; s2.buy = 39; s2.turn = 0;
  assert.strictEqual(P.act(s2, 'p0', { type: 'decline' }), null); assert.strictEqual(s2.auction, null); assert.strictEqual(s2.log.at(-1).t, 'declined', 'quem está vendo precisa saber que a carta saiu'); assert.strictEqual(s2.props[39].owner, null); assert.notStrictEqual(s2.phase, 'auction');
}
// passe livre: não troca por passe, não sai de graça e só corre em uma direção
{
  const st = P.newGame(room(2, 0)); st.busyUntil = 0; st.phase = 'post'; st.turn = 0; st.players[0].cash = 500; st.players[1].cash = 500;
  assert.ok(P.act(st, 'p0', { type: 'offer', to: 1, give: { passes: 1 }, want: { passes: 1 } }), 'passe por passe');
  assert.ok(P.act(st, 'p0', { type: 'offer', to: 1, give: { passes: 1 }, want: {} }), 'de graça');
  assert.ok(P.act(st, 'p0', { type: 'offer', to: 1, give: { passes: 2 }, want: { cash: 39 } }), 'abaixo do mínimo');
  assert.strictEqual(P.act(st, 'p0', { type: 'offer', to: 1, give: { passes: 2 }, want: { cash: 40 } }), null); assert.strictEqual(P.act(st, 'p1', { type: 'accept' }), null);
  assert.ok(P.act(st, 'p1', { type: 'offer', to: 0, give: { passes: 1 }, want: { cash: 40 } }), 'não dá para devolver e zerar');
}
// a obra sobe dentro da rua
for (const g of Object.values(Engine.GROUP_OF)) { const h = g.map(s => PD.SQ[s].house).filter(Boolean); h.forEach((v, i) => assert.ok(!i || v > h[i - 1], 'obra crescente')); }
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
assert.strictEqual(r1.st.phase, 'over'); assert.ok(r1.st.result.winner); assert.strictEqual(r1.st.result.ranking.length, 4);
// humano parado: o prazo joga por ele no modo seguro e a partida anda
const r2 = play(3, 2, () => false);
assert.strictEqual(r2.st.phase, 'over'); assert.ok(r2.st.result.winner);
// só desconectados
const r3 = play(3, 0, () => true);
assert.ok(r3.steps >= 40000 || r3.st.phase === 'over');
console.log('ok: patrimônio na sala', r1.steps, r2.steps, r3.steps);
