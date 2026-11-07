// Testes das regras: node prototipos/patrimonio/test_engine.js
const assert = require('assert');
const E = require('../../js/pat-engine.js');
const D = require('../../js/pat-data.js');
// as contas dos testes partem de R$ 1 milhão redondo, independente do dinheiro inicial do jogo
const rich = st => { st.players.forEach(p => { p.cash = 1000; }); return st; };
const mk = (n = 3, seed = 7) => rich(E.newGame(Array.from({ length: n }, (_, i) => ({ name: 'P' + i, token: 'piao', color: '#000', bot: true })), seed));
const own = (st, who, ...sqs) => sqs.forEach(s => { st.props[s].owner = who; });
// Faz os dados darem o que o teste quer: troca a semente até sair
function rollExactly(st, a, b) {
  for (let s = 0; s < 200000; s++) {
    const c = JSON.parse(JSON.stringify(st)); c.seed = s;
    c.seed = (c.seed + 0x6D2B79F5) | 0; let t = c.seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    const d1 = 1 + Math.floor(((t ^ (t >>> 14)) >>> 0) / 4294967296 * 6);
    c.seed = (c.seed + 0x6D2B79F5) | 0; t = c.seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    const d2 = 1 + Math.floor(((t ^ (t >>> 14)) >>> 0) / 4294967296 * 6);
    if (d1 === a && d2 === b) { st.seed = s; return; }
  }
  throw new Error('sem semente');
}

// o tabuleiro tem 40 casas, 28 compráveis e 8 grupos
assert.strictEqual(D.SQ.length, 40);
assert.strictEqual(E.OWNABLE.length, 28);
assert.strictEqual(D.SQ[10].k, 'jail'); assert.strictEqual(D.SQ[20].k, 'free'); assert.strictEqual(D.SQ[30].k, 'gotojail');
assert.strictEqual(D.CARDS.destino.length, 16); assert.strictEqual(D.CARDS.mutirao.length, 16);

// compra, recusa vira leilão, aluguel normal e em dobro no grupo fechado
{
  const st = mk(); rollExactly(st, 1, 2);
  assert.strictEqual(E.act(st, 0, { type: 'roll' }), null);
  assert.strictEqual(st.players[0].pos, 3); assert.strictEqual(st.phase, 'buy');
  assert.ok(E.act(st, 1, { type: 'buy' }), 'só quem caiu compra');
  assert.strictEqual(E.act(st, 0, { type: 'buy' }), null);
  assert.strictEqual(st.players[0].cash, 960); assert.strictEqual(st.props[3].owner, 0); assert.strictEqual(st.phase, 'post');
  assert.strictEqual(E.rentOf(st, 3), 4);
  own(st, 0, 1); assert.strictEqual(E.rentOf(st, 3), 8, 'grupo fechado dobra');
  st.props[1].m = true; assert.strictEqual(E.rentOf(st, 3), 8, 'hipoteca do vizinho não tira o dobro'); assert.strictEqual(E.rentOf(st, 1), 0, 'hipotecado não cobra');
}
{
  const st = mk(); rollExactly(st, 1, 2); E.act(st, 0, { type: 'roll' }); E.startAuction(st, st.buy);
  assert.strictEqual(st.phase, 'auction');
  const who = E.actor(st); assert.strictEqual(who, 1);
  assert.ok(E.act(st, 1, { type: 'bid', amount: 0 })); assert.ok(E.act(st, 1, { type: 'bid', amount: 99999 }));
  assert.strictEqual(E.act(st, 1, { type: 'bid', amount: 10 }), null);
  assert.ok(E.act(st, 2, { type: 'bid', amount: 10 }), 'tem que cobrir');
  assert.strictEqual(E.act(st, 2, { type: 'pass' }), null);
  assert.strictEqual(E.act(st, 0, { type: 'pass' }), null);
  assert.strictEqual(st.props[3].owner, 1); assert.strictEqual(st.players[1].cash, 990); assert.strictEqual(st.phase, 'post');
}
// leilão sem lances fica com o banco
{
  const st = mk(); rollExactly(st, 1, 2); E.act(st, 0, { type: 'roll' }); E.startAuction(st, st.buy);
  E.act(st, 1, { type: 'pass' }); E.act(st, 2, { type: 'pass' }); E.act(st, 0, { type: 'pass' });
  assert.strictEqual(st.props[3].owner, null); assert.strictEqual(st.phase, 'post');
}
// transportes e serviços
{
  const st = mk(); own(st, 1, 5); assert.strictEqual(E.rentOf(st, 5), 17); own(st, 1, 15, 25); assert.strictEqual(E.rentOf(st, 5), 68); own(st, 1, 35); assert.strictEqual(E.rentOf(st, 5), 136);
  st.dice = [3, 4]; own(st, 1, 12); assert.strictEqual(E.rentOf(st, 12), 21); own(st, 1, 28); assert.strictEqual(E.rentOf(st, 12), 49);
}
// construir por igual, limite de casas, hotel devolve 4 casas, venda pela metade
{
  const st = mk(); own(st, 0, 37, 39);
  assert.ok(E.act(st, 1, { type: 'build', sq: 37 }), 'não é dele');
  assert.strictEqual(E.act(st, 0, { type: 'build', sq: 37 }), null);
  assert.ok(E.act(st, 0, { type: 'build', sq: 37 }), 'tem que ser por igual');
  E.act(st, 0, { type: 'build', sq: 39 }); assert.strictEqual(st.bank.houses, 30); assert.strictEqual(E.rentOf(st, 37), 145);
  st.players[0].cash = 9999;
  for (let k = 0; k < 3; k++) { E.act(st, 0, { type: 'build', sq: 37 }); E.act(st, 0, { type: 'build', sq: 39 }); }
  assert.strictEqual(st.bank.houses, 24);
  assert.strictEqual(E.act(st, 0, { type: 'build', sq: 37 }), null); assert.strictEqual(st.props[37].h, 5);
  assert.strictEqual(st.bank.houses, 28); assert.strictEqual(st.bank.hotels, 11); assert.strictEqual(E.rentOf(st, 37), 840);
  assert.ok(E.act(st, 0, { type: 'mortgage', sq: 39 }), 'com construção no grupo não hipoteca');
  const c = st.players[0].cash;
  assert.ok(E.act(st, 0, { type: 'sell', sq: 39 }), 'venda por igual');
  assert.strictEqual(E.act(st, 0, { type: 'sell', sq: 37 }), null);
  assert.strictEqual(st.props[37].h, 4); assert.strictEqual(st.players[0].cash, c + 100); assert.strictEqual(st.bank.hotels, 12); assert.strictEqual(st.bank.houses, 24);
}
// banco sem casas segura a obra
{
  const st = mk(); own(st, 0, 37, 39); st.bank.houses = 0;
  assert.ok(E.act(st, 0, { type: 'build', sq: 37 }).includes('sem material'));
}
// hipoteca: metade do preço, levanta com 10%
{
  const st = mk(); own(st, 0, 39);
  assert.strictEqual(E.act(st, 0, { type: 'mortgage', sq: 39 }), null); assert.strictEqual(st.players[0].cash, 1135);
  assert.strictEqual(E.act(st, 0, { type: 'lift', sq: 39 }), null); assert.strictEqual(st.players[0].cash, 986);
  own(st, 0, 37); E.act(st, 0, { type: 'mortgage', sq: 37 }); assert.ok(E.act(st, 0, { type: 'build', sq: 39 }), 'grupo hipotecado não constrói');
}
// Delegacia: três duplas, fiança, carta, terceira tentativa paga e anda
{
  const st = mk(); st.turn = 0; st.doubles = 2; st.players[0].pos = 5; rollExactly(st, 2, 2);
  E.act(st, 0, { type: 'roll' });
  assert.strictEqual(st.players[0].pos, 10); assert.ok(st.players[0].jail); assert.strictEqual(st.phase, 'post');
  E.act(st, 0, { type: 'end' }); assert.strictEqual(st.turn, 1);
}
{
  const st = mk(); st.players[0].jail = true; st.players[0].pos = 10;
  assert.strictEqual(E.act(st, 0, { type: 'bail' }), null); assert.strictEqual(st.players[0].cash, 965); assert.ok(!st.players[0].jail); assert.strictEqual(st.phase, 'roll');
  st.players[0].jail = true; assert.ok(E.act(st, 0, { type: 'usecard' }), 'sem carta');
  st.players[0].cards.push({ deck: 'destino', id: 7 }); const n = st.decks.destino.length;
  assert.strictEqual(E.act(st, 0, { type: 'usecard' }), null); assert.strictEqual(st.decks.destino.length, n + 1);
}
{
  const st = mk(); st.players[0].jail = true; st.players[0].pos = 10; st.players[0].tries = 2; rollExactly(st, 1, 3);
  E.act(st, 0, { type: 'roll' });
  assert.strictEqual(st.players[0].pos, 14); assert.ok(!st.players[0].jail); assert.strictEqual(st.players[0].cash, 965);
}
{
  const st = mk(); st.players[0].jail = true; st.players[0].pos = 10; rollExactly(st, 3, 3);
  E.act(st, 0, { type: 'roll' });
  assert.ok(!st.players[0].jail); assert.strictEqual(st.players[0].pos, 16); assert.ok(!st.again, 'dupla que solta não joga de novo');
}
// Teje preso não paga salário; dupla joga de novo; salário ao passar
{
  const st = mk(); st.players[0].pos = 25; rollExactly(st, 2, 3);
  E.act(st, 0, { type: 'roll' });
  assert.strictEqual(st.players[0].pos, 10); assert.ok(st.players[0].jail); assert.strictEqual(st.players[0].cash, 1000);
}
{
  const st = mk(); st.players[0].pos = 38; rollExactly(st, 1, 2);
  E.act(st, 0, { type: 'roll' }); assert.strictEqual(st.players[0].pos, 1); assert.strictEqual(st.players[0].cash, 1130);
}
{
  const st = mk(); rollExactly(st, 2, 2); E.act(st, 0, { type: 'roll' }); assert.strictEqual(st.players[0].pos, 4);
  assert.strictEqual(st.players[0].cash, 850, 'imposto'); assert.strictEqual(st.phase, 'roll', 'dupla joga de novo');
}
// cartas: cada efeito
{
  const force = (st, deck, text) => { const id = D.CARDS[deck].findIndex(c => c.t.includes(text)); st.decks[deck] = [id, ...st.decks[deck].filter(x => x !== id)]; };
  let st = mk(); st.players[0].pos = 5; force(st, 'destino', 'Volte 3'); rollExactly(st, 1, 1); E.act(st, 0, { type: 'roll' });
  assert.strictEqual(st.players[0].pos, 4, 'de 7 volta para o imposto');
  st = mk(); st.players[0].pos = 3; force(st, 'destino', 'Hora de embarcar'); own(st, 1, 15); rollExactly(st, 1, 3); E.act(st, 0, { type: 'roll' });
  assert.strictEqual(st.players[0].pos, 15); assert.strictEqual(st.players[1].cash, 1034, 'transporte em dobro');
  st = mk(); st.players[0].pos = 3; force(st, 'destino', 'A conta chegou'); own(st, 1, 12); rollExactly(st, 1, 3); E.act(st, 0, { type: 'roll' });
  assert.strictEqual(st.players[0].pos, 12); assert.ok(st.players[1].cash >= 1014, '10 vezes os dados novos');
  st = mk(); st.players[0].pos = 30 + 3; force(st, 'destino', 'Réveillon'); rollExactly(st, 1, 2); E.act(st, 0, { type: 'roll' });
  assert.strictEqual(st.players[0].pos, 39); assert.strictEqual(st.phase, 'buy');
  st = mk(); st.players[0].pos = 36; force(st, 'destino', 'Subida'); st.players[0].pos = 33; rollExactly(st, 1, 2); E.act(st, 0, { type: 'roll' });
  assert.strictEqual(st.players[0].pos, 24); assert.strictEqual(st.players[0].cash, 1130, 'passou pelo Marco Zero');
  st = mk(); force(st, 'mutirao', 'aniversário'); rollExactly(st, 1, 1); E.act(st, 0, { type: 'roll' });
  assert.strictEqual(st.players[0].cash, 1010); assert.strictEqual(st.players[1].cash, 995);
  st = mk(); force(st, 'mutirao', 'Reforma da rua'); own(st, 0, 1, 3); st.props[1].h = 5; st.props[3].h = 2; rollExactly(st, 1, 1); E.act(st, 0, { type: 'roll' });
  assert.strictEqual(st.players[0].cash, 1000 - 75 - 50);
  st = mk(); force(st, 'mutirao', 'primo'); rollExactly(st, 1, 1); E.act(st, 0, { type: 'roll' });
  assert.strictEqual(st.players[0].cards.length, 1); assert.strictEqual(st.decks.mutirao.length, 15, 'a carta fica com o jogador');
}
// dívida: vende e paga; falência liquida no banco, o credor recebe só a dívida e os lugares ficam livres
{
  const st = mk(); own(st, 1, 39); st.props[39].h = 5; own(st, 0, 1); st.players[0].cash = 100; st.players[0].pos = 36; rollExactly(st, 1, 2);
  E.act(st, 0, { type: 'roll' });
  assert.strictEqual(st.phase, 'debt'); assert.strictEqual(st.debts[0].amt, 1050);
  assert.strictEqual(st.players[0].cash, 100 - 1050, 'desconta na hora e fica negativo'); assert.strictEqual(st.players[1].cash, 1000 + 1050, 'o dono já recebe');
  assert.ok(E.act(st, 0, { type: 'end' }));
  assert.strictEqual(E.act(st, 0, { type: 'mortgage', sq: 1 }), null);
  assert.strictEqual(E.act(st, 0, { type: 'bankrupt' }), null);
  assert.ok(st.players[0].out); assert.strictEqual(st.props[1].owner, null, 'o lugar volta ao banco'); assert.strictEqual(st.props[1].m, false); assert.strictEqual(st.auction, null, 'sem leilão'); assert.strictEqual(st.turn, 1); assert.strictEqual(st.phase, 'roll');
  assert.strictEqual(st.players[1].cash, 1000 + 120, 'a dívida é maior: o credor recebe tudo o que a liquidação rendeu');
}
{
  // bens valem mais que a dívida: o credor recebe só a dívida, sem ficar com lugar nem carta
  const st = mk(); own(st, 0, 1, 3); st.props[1].h = 1; st.bank.houses = 31; own(st, 1, 39); st.players[0].cash = -20; st.players[1].cash += 30; st.players[0].cards.push({ deck: 'destino', id: 7 }); st.debts.push({ who: 0, to: 1, amt: 30, why: 'aluguel' }); st.phase = 'debt';
  const antes = st.players[1].cash; E.act(st, 0, { type: 'bankrupt' });
  assert.strictEqual(st.players[1].cash, antes, 'os bens cobrem o negativo: o dono não devolve nada'); assert.strictEqual(st.props[1].owner, null); assert.strictEqual(st.props[3].owner, null); assert.strictEqual(st.bank.houses, 32); assert.strictEqual(st.players[1].cards.length, 0); assert.ok(st.decks.destino.includes(7)); assert.strictEqual(st.auction, null);
}
{
  const st = mk(); own(st, 0, 1, 3); st.props[1].h = 1; st.bank.houses = 31; st.players[0].cash = -90; st.players[0].pos = 1; st.players[0].cards.push({ deck: 'destino', id: 7 }); st.debts.push({ who: 0, to: null, amt: 100, why: 'conta' }); st.phase = 'debt';
  E.act(st, 0, { type: 'bankrupt' });
  assert.strictEqual(st.bank.houses, 32); assert.strictEqual(st.phase, 'auction', 'falência para o banco vai a leilão'); assert.strictEqual(st.auction.sq, 1); assert.deepStrictEqual(st.queue, [3]);
  assert.ok(st.decks.destino.includes(7));
  while (st.phase === 'auction') { const w = E.actor(st); assert.strictEqual(E.act(st, w, { type: 'pass' }), null); }
  assert.strictEqual(st.props[1].owner, null); assert.strictEqual(st.props[3].owner, null); assert.notStrictEqual(st.turn, 0); assert.strictEqual(st.phase, 'roll');
}
// ponte aérea: viaja, mas não compra o aeroporto de destino
{
  const st = E.newGame([0, 1].map(i => ({ name: 'P' + i, token: 'piao', color: '#000', bot: true })), 7, { travel: true });
  st.players[0].pos = 2; rollExactly(st, 1, 2); E.act(st, 0, { type: 'roll' });
  assert.strictEqual(st.phase, 'buy'); assert.strictEqual(E.act(st, 0, { type: 'buy' }), null); assert.strictEqual(st.phase, 'travel');
  assert.strictEqual(E.act(st, 0, { type: 'travel', to: 15 }), null); assert.strictEqual(st.players[0].pos, 15); assert.strictEqual(st.buy, null); assert.strictEqual(st.props[15].owner, null); assert.strictEqual(st.phase, 'post');
}
// ponte aérea: só até o próximo aeroporto, inclusive dando a volta no tabuleiro
{
  const st = E.newGame([0, 1].map(i => ({ name: 'P' + i, token: 'piao', color: '#000', bot: true })), 7, { travel: true });
  st.players[0].pos = 35; st.phase = 'travel'; st.travel = true;
  assert.ok(E.act(st, 0, { type: 'travel', to: 25 }), 'não volta nem pula'); assert.ok(E.act(st, 0, { type: 'travel', to: 15 })); assert.strictEqual(st.players[0].pos, 35);
  assert.strictEqual(E.act(st, 0, { type: 'travel', to: 5 }), null); assert.strictEqual(st.players[0].pos, 5);
}
// começa com R$ 750 mil; a última casa da primeira cor não cobra mais que o Magnata
{ const st = E.newGame([{ name: 'A' }, { name: 'B' }], 7); assert.strictEqual(st.players[0].cash, 750); assert.strictEqual(D.SQ[3].rent[5], 185); }
// manchete da inflação: terreno, obra, aluguel e imposto em dobro
{
  const st = mk(), n = D.NEWS.findIndex(x => x.e.rentAll); st.news = { cur: n, next: 0 }; own(st, 1, 3, 12); st.dice = [3, 4];
  assert.strictEqual(E.rentOf(st, 3), 8); assert.strictEqual(E.rentOf(st, 12), 42); assert.strictEqual(E.buildCost(st, 1), 50); assert.strictEqual(E.buyPrice(st, 1), 80);
}
// saldo negativo: vender até voltar ao zero libera o jogo sozinho
{
  const st = mk(); own(st, 0, 24); own(st, 1, 37); st.props[37].h = 1; st.players[0].cash = 70; st.players[0].pos = 34; rollExactly(st, 1, 2); E.act(st, 0, { type: 'roll' });
  assert.strictEqual(st.phase, 'debt'); assert.ok(st.players[0].cash < 0); const falta = -st.players[0].cash; assert.ok(falta <= E.mortgageValue(24), 'a hipoteca cobre: ' + falta);
  assert.strictEqual(E.act(st, 0, { type: 'mortgage', sq: 24 }), null); assert.notStrictEqual(st.phase, 'debt'); assert.strictEqual(st.debts.length, 0);
}
// usina com dono: quem cai joga os dados de novo e paga pelo resultado desses dados
{
  const st = mk(); own(st, 1, 12); st.players[0].pos = 9; rollExactly(st, 1, 2); st.ev = []; const c1 = st.players[1].cash; E.act(st, 0, { type: 'roll' });
  const ds = st.ev.filter(e => e.t === 'dice'), x = ds[1]; assert.strictEqual(st.players[0].pos, 12); assert.strictEqual(ds.length, 2); assert.ok(x.extra && x.why);
  assert.strictEqual(st.players[1].cash - c1, 3 * (x.a + x.b));
}
// leilão por tempo: lance fora da ordem, líder não passa, lance renova o relógio, tempo fecha
{
  const st = mk(); st.players[0].pos = 37; rollExactly(st, 1, 1); st.buy = 39; st.phase = 'buy'; E.startAuction(st, st.buy);
  assert.strictEqual(st.phase, 'auction'); assert.strictEqual(st.auction.ms, 20000);
  assert.ok(E.botAction(st, 0), 'bot decide fora da rotação');
  E.auctionTick(st, 15000); assert.strictEqual(E.act(st, 0, { type: 'bid', amount: 20 }), null, 'qualquer um dá lance a qualquer hora'); assert.strictEqual(st.auction.ms, 10000, 'renova até 10 s');
  assert.ok(E.act(st, 0, { type: 'pass' }), 'líder não passa'); assert.ok(E.act(st, 0, { type: 'bid', amount: 30 }), 'não cobre a si mesmo');
  E.auctionTick(st, 10000); assert.strictEqual(st.auction, null); assert.strictEqual(st.props[39].owner, 0); assert.strictEqual(st.players[0].cash, 980); assert.strictEqual(st.players[0].t.won, 1);
}
// aposta: teto igual para todos, e quem tem pouco arrisca tudo
{
  const st = mk(); assert.strictEqual(E.maxBet(st, 0), 50); st.players[0].cash = 10; assert.strictEqual(E.maxBet(st, 0), 10);
}
// fora da vez dá para construir e hipotecar, menos durante o leilão
{
  const st = mk(); own(st, 1, 1, 3); st.turn = 0; st.phase = 'roll';
  assert.strictEqual(E.act(st, 1, { type: 'build', sq: 1 }), null); assert.strictEqual(st.props[1].h, 1);
  assert.strictEqual(E.act(st, 1, { type: 'sell', sq: 1 }), null); assert.strictEqual(E.act(st, 1, { type: 'mortgage', sq: 3 }), null); assert.strictEqual(st.turn, 0);
}
// fim de jogo
{
  const st = mk(2); st.players[0].cash = 1; own(st, 1, 39); st.players[0].pos = 36; rollExactly(st, 1, 2); E.act(st, 0, { type: 'roll' });
  E.act(st, 0, { type: 'bankrupt' }); assert.strictEqual(st.phase, 'over'); assert.strictEqual(st.winner, 1);
  assert.ok(E.act(st, 1, { type: 'roll' }));
}
// aniversário com devedor sem dinheiro: cada dívida na sua vez e o jogo segue
{
  const st = mk(3); const id = D.CARDS.mutirao.findIndex(c => c.t.includes('aniversário')); st.decks.mutirao = [id, ...st.decks.mutirao.filter(x => x !== id)];
  st.players[1].cash = 1; st.players[2].cash = 1; rollExactly(st, 1, 1); E.act(st, 0, { type: 'roll' });
  assert.strictEqual(st.phase, 'debt'); assert.strictEqual(E.actor(st), 1);
  E.act(st, 1, { type: 'bankrupt' }); assert.strictEqual(E.actor(st), 2);
  E.act(st, 2, { type: 'bankrupt' }); assert.strictEqual(st.phase, 'over'); assert.strictEqual(st.winner, 0); assert.strictEqual(st.players[0].cash, 1002);
}
// negociação: troca na hora, juros da hipoteca, nada com construção, número ruim não vira dinheiro
{
  const st = mk(); own(st, 0, 1); own(st, 1, 3); st.props[3].m = true;
  assert.ok(E.act(st, 0, { type: 'offer', to: 1, give: { cash: 99999 } }));
  assert.ok(E.act(st, 0, { type: 'offer', to: 1 }), 'vazia');
  assert.ok(E.act(st, 0, { type: 'offer', to: 0, give: { cash: 5 } }), 'consigo mesmo');
  assert.strictEqual(E.act(st, 0, { type: 'offer', to: 1, give: { cash: 100, props: [1] }, want: { props: [3] } }), null);
  assert.ok(E.act(st, 2, { type: 'accept' })); assert.ok(E.act(st, 0, { type: 'roll' }), 'proposta segura o jogo');
  assert.strictEqual(E.actor(st), 1);
  assert.strictEqual(E.act(st, 1, { type: 'accept' }), null);
  assert.strictEqual(st.props[1].owner, 1); assert.strictEqual(st.props[3].owner, 0);
  assert.strictEqual(st.players[0].cash, 900 - 2); assert.strictEqual(st.players[1].cash, 1100);
  own(st, 0, 37, 39); st.props[37].h = 1;
  assert.ok(E.act(st, 0, { type: 'offer', to: 1, give: { props: [39] } }), 'grupo com construção não troca');
  const m = st.players[1].cash; E.act(st, 0, { type: 'offer', to: 1, give: { cash: -50 }, want: { cash: -50, props: [1] } }); if (st.offer) E.act(st, 1, { type: 'reject' }); assert.strictEqual(st.players[1].cash, m);
}
// regras da casa
const mkR = (rules, n = 3, seed = 7) => rich(E.newGame(Array.from({ length: n }, (_, i) => ({ name: 'P' + i, token: 'piao', color: '#000', bot: true })), seed, rules));
// hipoteca punitiva: dívida cresce, penhora leva a leilão e o jogador segue na vez dele
{
  const st = mkR({ mortgage: true }); own(st, 0, 39); E.act(st, 0, { type: 'mortgage', sq: 39 });
  assert.strictEqual(E.liftCost(st, 39), 162, 'começa 20% acima'); st.rounds += 3; assert.strictEqual(E.liftCost(st, 39), 203); st.rounds = 100; st.props[39].mAt = 0; assert.strictEqual(E.liftCost(st, 39), 270, 'até o dobro');
  st.rounds = 5; st.props[39].mAt = 0; st.turn = 2; st.phase = 'post'; E.act(st, 2, { type: 'end' });
  assert.strictEqual(st.rounds, 6); assert.strictEqual(st.props[39].owner, null); assert.strictEqual(st.phase, 'auction');
  E.act(st, E.actor(st), { type: 'pass' }); E.act(st, E.actor(st), { type: 'pass' }); E.act(st, E.actor(st), { type: 'pass' });
  assert.strictEqual(st.turn, 0); assert.strictEqual(st.phase, 'roll', 'depois do leilão a vez começa normal');
}
// com a regra, hipoteca no grupo quebra o aluguel em dobro
{
  const st = mkR({ mortgage: true }); own(st, 0, 37, 39); assert.strictEqual(E.rentOf(st, 39), 86); E.act(st, 0, { type: 'mortgage', sq: 37 }); assert.strictEqual(E.rentOf(st, 39), 43);
}
// taxa de fortuna e reajuste
{
  const st = mkR({ wealth: true, reajuste: true }); st.players[0].cash = 2500; st.players[0].pos = 38; rollExactly(st, 1, 2); E.act(st, 0, { type: 'roll' });
  assert.strictEqual(st.players[0].cash, 2630 - 87, '8% do que passa da média');
  own(st, 1, 39); assert.strictEqual(E.rentOf(st, 39), 43); st.rounds = 10; assert.strictEqual(E.rentOf(st, 39), 54); st.rounds = 90; assert.strictEqual(E.rentOf(st, 39), 86, 'até o dobro');
}
// puxadinho: dobra o aluguel, limite, vira casa ao fechar o grupo, trava hipoteca e troca
{
  const st = mkR({ pux: true }); own(st, 0, 37, 1, 6, 11); assert.strictEqual(E.act(st, 0, { type: 'pux', sq: 37 }), null);
  assert.strictEqual(st.players[0].cash, 800); assert.strictEqual(E.rentOf(st, 37), 60); assert.strictEqual(st.bank.houses, 32);
  assert.ok(E.act(st, 0, { type: 'mortgage', sq: 37 }));
  E.act(st, 0, { type: 'pux', sq: 1 }); E.act(st, 0, { type: 'pux', sq: 6 }); assert.ok(E.act(st, 0, { type: 'pux', sq: 11 }), 'limite de 3');
  st.players[1].cash = 900; own(st, 1, 39); assert.strictEqual(E.act(st, 1, { type: 'offer', to: 0, give: { props: [39] } }), null); E.act(st, 0, { type: 'accept' });
  assert.ok(E.hasMonopoly(st, 37)); assert.strictEqual(st.props[37].h, 1); assert.ok(!st.props[37].x); assert.strictEqual(st.bank.houses, 31);
}
// o puxadinho acompanha a escritura numa troca
{
  const st = mkR({ pux: true }); own(st, 0, 37); E.act(st, 0, { type: 'pux', sq: 37 }); assert.strictEqual(E.act(st, 0, { type: 'offer', to: 1, give: { props: [37] } }), null); E.act(st, 1, { type: 'accept' });
  assert.strictEqual(st.props[37].owner, 1); assert.ok(st.props[37].x);
}
// patrocinador: um só na mesa, sobe até o dobro com o mesmo dono e outra pessoa rouba mantendo o nível; sem lugar, ganha em dinheiro
{
  const landOn = (st, i) => { st.turn = i; st.phase = 'roll'; st.players[i].pos = 17; rollExactly(st, 1, 2); E.act(st, i, { type: 'roll' }); };
  let st = mkR({ sponsor: true }); st.props[1].owner = 0; st.props[3].owner = 1; const r1 = E.rentOf(st, 1), r3 = E.rentOf(st, 3);
  landOn(st, 0); assert.strictEqual(st.phase, 'sponsor'); assert.ok(E.act(st, 0, { type: 'sponsor', sq: 3 })); assert.ok(E.act(st, 0, { type: 'end' }));
  assert.strictEqual(E.act(st, 0, { type: 'sponsor', sq: 1 }), null); assert.strictEqual(E.rentOf(st, 1), Math.round(r1 * 1.5));
  st.rounds += 50; assert.strictEqual(E.sponsored(st, 1), 1); st.rounds -= 50; // sem prazo
  landOn(st, 0); assert.strictEqual(E.act(st, 0, { type: 'sponsor', sq: 1 }), null); assert.strictEqual(E.rentOf(st, 1), r1 * 2);
  landOn(st, 0); assert.strictEqual(E.act(st, 0, { type: 'sponsor', sq: 1 }), null); assert.strictEqual(st.sp.lv, 2); // não passa do dobro
  landOn(st, 1); assert.strictEqual(E.act(st, 1, { type: 'sponsor', sq: 3 }), null); assert.strictEqual(E.rentOf(st, 1), r1); assert.strictEqual(E.rentOf(st, 3), r3 * 2);
  st = mkR({ sponsor: true }); const c0 = st.players[0].cash; landOn(st, 0); assert.notStrictEqual(st.phase, 'sponsor'); assert.strictEqual(st.players[0].cash, c0 + 70);
}
// cassino: opcional, com teto, paga pela tabela e o dinheiro fecha
{
  const land = (seed = 7) => { const st = rich(E.newGame([0, 1].map(i => ({ name: 'P' + i, token: 'piao', color: '#000', bot: true })), seed, { casino: true })); st.players[0].pos = 14; rollExactly(st, 1, 2); E.act(st, 0, { type: 'roll' }); return st; };
  let st = land(); assert.strictEqual(st.players[0].pos, 17); assert.strictEqual(st.phase, 'casino'); assert.strictEqual(E.maxBet(st, 0), 50);
  assert.ok(E.act(st, 0, { type: 'end' })); assert.ok(E.act(st, 0, { type: 'bet', game: 'roleta', pick: 'red', amount: 51 }), 'acima do teto'); assert.ok(E.act(st, 0, { type: 'bet', game: 'roleta', pick: 'red', amount: 4 }), 'abaixo do mínimo'); assert.ok(E.act(st, 0, { type: 'bet', game: 'roleta', pick: 37, amount: 10 })); assert.ok(E.act(st, 0, { type: 'bet', game: 'dados', pick: 13, amount: 10 })); assert.ok(E.act(st, 0, { type: 'bet', game: 'poker', pick: 'red', amount: 10 }));
  assert.strictEqual(E.act(st, 0, { type: 'nobet' }), null); assert.strictEqual(st.phase, 'post'); assert.strictEqual(st.players[0].cash, 1000);
  let wins = 0; for (let g = 0; g < 300; g++) { st = land(); st.seed = 100 + g * 7919; assert.strictEqual(E.act(st, 0, { type: 'bet', game: 'roleta', pick: 'black', amount: 50 }), null); const c = st.players[0].cash; assert.ok(c === 950 || c === 1050, 'cor paga 2×'); if (c === 1050) wins++; assert.strictEqual(st.phase, 'post'); }
  assert.ok(wins > 100 && wins < 200, 'cor perto de metade');
  st = land(); assert.ok(E.act(st, 0, { type: 'bet', game: 'slot', amount: 10 }), 'só roleta'); assert.ok(E.act(st, 0, { type: 'bet', game: 'dados', pick: 'par', amount: 10 }), 'só roleta');
  st = land(); st.casino = false; st.phase = 'roll'; st.players[0].cash = 4; st.players[0].pos = 14; rollExactly(st, 1, 2); E.act(st, 0, { type: 'roll' }); assert.notStrictEqual(st.phase, 'casino', 'sem dinheiro para o mínimo');
}
// impostos em porcentagem do dinheiro na mão
{
  const st = mk(); st.players[0].pos = 1; rollExactly(st, 1, 2); E.act(st, 0, { type: 'roll' }); assert.strictEqual(st.players[0].pos, 4); assert.strictEqual(st.players[0].cash, 850, 'Imposto de Renda 15%'); assert.ok(!st.debts.length);
  const s2 = mk(); s2.players[0].cash = 33; s2.players[0].pos = 35; rollExactly(s2, 1, 2); E.act(s2, 0, { type: 'roll' }); assert.strictEqual(s2.players[0].pos, 38); assert.strictEqual(s2.players[0].cash, 24, 'Taxa do Lula 27%, arredonda para cima');
}
// blitz: cadeia por escolha, jeitinho que passa e que falha
{
  let st = mkR({ blitz: true }); st.players[0].pos = 27; rollExactly(st, 1, 2); E.act(st, 0, { type: 'roll' });
  assert.strictEqual(st.phase, 'blitz'); assert.ok(E.act(st, 0, { type: 'end' })); assert.strictEqual(E.act(st, 0, { type: 'jailgo' }), null); assert.ok(st.players[0].jail);
  st = mkR({ blitz: true }); st.phase = 'blitz'; st.blitz = true; st.players[0].pos = 30; rollExactly(st, 4, 1); E.act(st, 0, { type: 'jeitinho' });
  assert.ok(!st.players[0].jail); assert.strictEqual(st.players[0].cash, 965); assert.ok(st.players[0].stats.jeitinho);
  st = mkR({ blitz: true }); st.phase = 'blitz'; st.blitz = true; st.players[0].pos = 30; rollExactly(st, 5, 1); E.act(st, 0, { type: 'jeitinho' });
  assert.ok(st.players[0].jail); assert.strictEqual(st.players[0].cash, 930);
}
// viagem: paga, vai, sem salário, não compra no destino; dono viaja de graça
{
  const st = mkR({ travel: true }); st.players[0].pos = 2; rollExactly(st, 1, 2); E.act(st, 0, { type: 'roll' }); assert.strictEqual(st.phase, 'buy'); E.act(st, 0, { type: 'buy' });
  assert.strictEqual(st.phase, 'travel'); assert.ok(E.act(st, 0, { type: 'travel', to: 5 })); assert.ok(E.act(st, 0, { type: 'travel', to: 35 }), 'só o próximo');
  assert.strictEqual(E.act(st, 0, { type: 'travel', to: 15 }), null); assert.strictEqual(st.players[0].cash, 870, 'grátis no próprio, sem salário'); assert.strictEqual(st.phase, 'post', 'não compra nem encadeia');
}
// passe livre: vale nas propriedades de quem deu, acaba, some na falência
{
  const st = mkR({ passes: true }); own(st, 0, 39); own(st, 1, 37); assert.strictEqual(E.act(st, 0, { type: 'offer', to: 1, give: { passes: 2 }, want: { props: [37] } }), null); E.act(st, 1, { type: 'accept' });
  assert.strictEqual(E.passesOf(st, 0, 1), 2); st.turn = 1; st.phase = 'roll'; st.players[1].pos = 36; rollExactly(st, 1, 2); E.act(st, 1, { type: 'roll' });
  assert.strictEqual(st.players[1].cash, 1000, 'sem aluguel'); assert.strictEqual(E.passesOf(st, 0, 1), 1);
  assert.ok(E.act(st, 0, { type: 'offer', to: 2, give: { passes: 99 }, want: { cash: 100 } }) === null); assert.strictEqual(st.offer.give.passes, 3, 'teto por negócio');
}
// fiado: pede, contraproposta, garantia travada, paga no prazo ou perde a garantia
{
  const setup = () => { const st = mkR({ fiado: true }); own(st, 0, 24, 1); own(st, 1, 37); st.props[37].h = 1; st.players[0].cash = 10; st.players[0].pos = 34; rollExactly(st, 1, 2); E.act(st, 0, { type: 'roll' }); return st; };
  let st = setup(); assert.strictEqual(st.phase, 'debt'); assert.strictEqual(st.debts[0].amt, 145);
  assert.ok(E.act(st, 0, { type: 'fiado', sq: 1, rate: 10, turns: 2 }), 'garantia barata demais');
  assert.strictEqual(E.act(st, 0, { type: 'fiado', sq: 24, rate: 10, turns: 2 }), null); assert.strictEqual(E.actor(st), 1); assert.ok(E.act(st, 0, { type: 'end' }));
  assert.strictEqual(E.act(st, 1, { type: 'creditCounter', rate: 20 }), null); assert.strictEqual(E.actor(st), 0);
  assert.strictEqual(E.act(st, 0, { type: 'creditYes' }), null); assert.ok(st.props[24].lien); assert.strictEqual(E.loanOf(st, 0).total, 162); assert.strictEqual(st.phase, 'post');
  assert.ok(E.act(st, 0, { type: 'mortgage', sq: 24 }), 'garantia não hipoteca'); st.players[0].cash = 300;
  E.act(st, 0, { type: 'end' }); E.act(st, 1, { type: 'roll' }); st.phase = 'post'; st.debts = []; st.buy = null; st.travel = false; st.turn = 2; st.phase = 'post'; st.players[0].cash = 300; const lender = st.players[1].cash; E.act(st, 2, { type: 'end' });
  assert.strictEqual(E.loanOf(st, 0).left, 1); st.turn = 2; st.phase = 'post'; E.act(st, 2, { type: 'end' });
  assert.strictEqual(E.loanOf(st, 0), null); assert.strictEqual(st.players[0].cash, 138); assert.strictEqual(st.players[1].cash, lender + 162); assert.ok(!st.props[24].lien); assert.ok(st.players[1].stats.agiota);
  st = setup(); E.act(st, 0, { type: 'fiado', sq: 24, rate: 10, turns: 1 }); E.act(st, 1, { type: 'creditYes' }); st.turn = 2; st.phase = 'post'; E.act(st, 2, { type: 'end' });
  assert.strictEqual(st.props[24].owner, 1, 'garantia vai para o credor'); assert.ok(!st.props[24].lien); assert.strictEqual(E.loanOf(st, 0), null);
  st = setup(); E.act(st, 0, { type: 'fiado', sq: 24, rate: 10, turns: 3 }); E.act(st, 1, { type: 'creditNo' }); assert.strictEqual(st.phase, 'debt'); assert.ok(E.act(st, 0, { type: 'fiado', sq: 24, rate: 5, turns: 3 }), 'um pedido por conta');
}
// jornal e contratos
{
  const st = mkR({ news: true, contracts: true }); assert.ok(st.news); assert.strictEqual(D.NEWS.length, 25); assert.strictEqual(st.players[0].contracts.length, 2);
  const n = st.news.next; st.turn = 2; st.phase = 'post'; E.act(st, 2, { type: 'end' }); assert.strictEqual(st.news.cur, n, 'a manchete de amanhã vira a de hoje');
  st.news.cur = D.NEWS.findIndex(x => x.e.rent?.g === 'anil' && x.e.rent.x === 2); own(st, 1, 39); assert.strictEqual(E.rentOf(st, 39), 86);
  st.news.cur = D.NEWS.findIndex(x => x.e.build === .75); assert.strictEqual(E.buildCost(st, 39), 188);
  st.news.cur = D.NEWS.findIndex(x => x.e.buy === .8); assert.strictEqual(E.buyPrice(st, 39), 216);
  const id = E.CONTRACTS.findIndex(c => c.id === 'leque'); st.players[0].contracts = [id]; own(st, 0, 1, 6, 11, 16); const c = st.players[0].cash; st.news.cur = 0;
  E.act(st, 0, { type: 'mortgage', sq: 1 }); assert.strictEqual(st.players[0].cash, c + 20 + 70, 'prêmio'); assert.ok(!st.players[0].contracts.includes(id));
}
// limite de voltas
{
  const st = mkR({ limit: 2 }); st.players[1].cash = 5000; st.rounds = 1; st.turn = 2; st.phase = 'post'; E.act(st, 2, { type: 'end' }); assert.strictEqual(st.phase, 'over'); assert.strictEqual(st.winner, 1);
}
// bots: toda partida termina, sem dinheiro negativo nem peça sobrando
const stats = {};
for (const n of [2, 3, 4, 6]) {
  const res = [];
  for (let g = 0; g < 60; g++) {
    const st = mk(n, 1000 + g * 37 + n);
    let guard = 0;
    while (st.phase !== 'over' && guard++ < 150000 && st.turns < 2500) {
      const who = E.actor(st); const a = E.botAction(st, who);
      assert.ok(a, 'bot sem ação em ' + st.phase);
      const err = E.act(st, who, a); assert.strictEqual(err, null, `${JSON.stringify(a)}: ${err} (${st.phase})`);
      E.drain(st);
      for (const p of st.players) assert.ok(p.cash >= 0 || st.debts.some(d => d.who === p.i), 'negativo sem dívida aberta');
      let h = 0, ho = 0; for (const s of E.OWNABLE) { const v = st.props[s].h; if (v === 5) ho++; else h += v; }
      assert.strictEqual(h + st.bank.houses, 32); assert.strictEqual(ho + st.bank.hotels, 12);
    }
    JSON.stringify(st);
    res.push({ turns: st.turns, done: st.phase === 'over' });
  }
  const t = res.map(r => r.turns).sort((a, b) => a - b);
  stats[n] = { acabaram: res.filter(r => r.done).length + '/' + res.length, mediana: t[t.length >> 1], max: t[t.length - 1] };
}
// as mesmas partidas com todas as regras da casa ligadas
const statsR = {};
for (const n of [2, 3, 4, 6]) {
  const res = [];
  for (let g = 0; g < 60; g++) {
    const st = mkR({ ...E.RULES }, n, 5000 + g * 37 + n); let guard = 0;
    while (st.phase !== 'over' && guard++ < 200000 && st.turns < 2500) {
      const who = E.actor(st), a = E.botAction(st, who); assert.ok(a, 'bot sem ação em ' + st.phase);
      const err = E.act(st, who, a); assert.strictEqual(err, null, `${JSON.stringify(a)}: ${err} (${st.phase})`);
      E.drain(st);
      for (const p of st.players) assert.ok(p.cash >= 0 || st.debts.some(d => d.who === p.i), 'negativo sem dívida aberta');
      let h = 0, ho = 0; for (const s of E.OWNABLE) { const v = st.props[s].h; if (v === 5) ho++; else h += v; }
      assert.strictEqual(h + st.bank.houses, 32); assert.strictEqual(ho + st.bank.hotels, 12);
      for (const l of st.loans) assert.ok(st.props[l.sq].lien && st.props[l.sq].owner === l.who, 'garantia solta');
    }
    JSON.stringify(st);
    res.push({ turns: st.turns, done: st.phase === 'over', rounds: st.rounds, first: st.winner === 0 });
  }
  const t = res.map(r => r.turns).sort((a, b) => a - b), rr = res.map(r => r.rounds).sort((a, b) => a - b);
  statsR[n] = { acabaram: res.filter(r => r.done).length + '/' + res.length, medianaJogadas: t[t.length >> 1], maxJogadas: t[t.length - 1], medianaVoltas: rr[rr.length >> 1], primeiroVenceu: res.filter(r => r.first).length };
}
console.log('ok: regras'); console.table(stats); console.log('com as regras da casa'); console.table(statsR);
