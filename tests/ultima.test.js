// Última!: regras e partidas inteiras com bots — node --test tests/
const assert = require('assert');
const U = require('../js/ultima.js');
const { CARDS } = U;
const room = (n, bots = 0, extra = {}) => ({ settings: { ulTurn: 30, ...extra }, players: Array.from({ length: n }, (_, i) => ({ id: 'p' + i, name: 'P' + i, char: 'lia', bot: i < bots })) });
const find = (c, v, not = []) => CARDS.findIndex((k, id) => k.c === c && k.v === v && !not.includes(id));
const total = st => st.deck.length + st.pile.length + st.players.reduce((s, p) => s + p.hand.length, 0);
// mesa montada à mão: cada mão, a carta de cima e de quem é a vez
function table(hands, topCard, opts = {}) {
  const st = U.newGame(room(hands.length, 0, opts.settings));
  const used = new Set([topCard, ...hands.flat()]);
  st.players.forEach((p, i) => { p.hand = [...hands[i]]; });
  st.pile = [topCard]; st.deck = [...CARDS.keys()].filter(id => !used.has(id));
  Object.assign(st, { color: CARDS[topCard].c, turn: 0, dir: 1, pending: 0, pendKind: null, phase: 'play', drawn: null, exposed: null }, opts.st);
  return st;
}
const R5 = find('r', '5'), R7 = find('r', '7'), B5 = find('b', '5'), B2 = find('b', '2'), G9 = find('g', '9'), Y1 = find('y', '1');
const RSKIP = find('r', 'skip'), RREV = find('r', 'rev'), RD2 = find('r', 'd2'), BD2 = find('b', 'd2'), W = find('w', 'wild'), W4 = find('w', 'd4');

// baralho: 108 cartas, 25 por cor e 8 coringas
assert.strictEqual(CARDS.length, 108);
for (const c of U.COLORS) assert.strictEqual(CARDS.filter(k => k.c === c).length, 25);
assert.strictEqual(CARDS.filter(k => k.c === 'w').length, 8);

// começo: 7 cartas cada, carta de cima é número, nenhuma carta some
for (let n = 2; n <= 10; n++) {
  const st = U.newGame(room(n));
  st.players.forEach(p => assert.strictEqual(p.hand.length, 7));
  assert.match(CARDS[st.pile[0]].v, /^\d$/);
  assert.strictEqual(total(st), 108);
  assert.strictEqual(new Set([...st.deck, ...st.pile, ...st.players.flatMap(p => p.hand)]).size, 108);
}
// quem venceu a última começa
{ const r = room(4); r.lastWinner = 'p2'; assert.strictEqual(U.newGame(r).turn, 2); }
// cor que não é cor vira a da paleta (a tela põe direto no CSS)
{ const r = room(2); r.players[0].color = '#12a594'; r.players[1].color = 'red;}body{x:'; const st = U.newGame(r); assert.strictEqual(st.players[0].color, '#12a594'); assert.match(st.players[1].color, /^#[0-9a-f]{6}$/i); }

// jogadas inválidas não mexem em nada
{ const st = table([[R7, G9, W], [B5, Y1]], R5), snap = JSON.stringify(st);
  assert.strictEqual(U.act(st, 'p1', { type: 'play', card: B5 }), 'Não é a sua vez');
  assert.strictEqual(U.act(st, 'p0', { type: 'play', card: B5 }), 'Você não tem essa carta');
  assert.strictEqual(U.act(st, 'p0', { type: 'play', card: G9 }), 'Essa carta não serve agora');
  assert.strictEqual(U.act(st, 'p0', { type: 'play', card: W }), 'Escolha uma cor');
  assert.strictEqual(U.act(st, 'p0', { type: 'play', card: W, color: 'x' }), 'Escolha uma cor');
  assert.strictEqual(U.act(st, 'p0', { type: 'play', card: String(R7) }), 'Você não tem essa carta');
  assert.strictEqual(U.act(st, 'p0', { type: 'hack' }), 'Jogada inválida');
  assert.strictEqual(U.act(st, 'p0', { type: 'constructor' }), 'Jogada inválida');
  assert.strictEqual(U.act(st, 'zz', { type: 'draw' }), 'Você não está nesta partida');
  assert.strictEqual(JSON.stringify(st), snap); }

// mesma cor, mesmo número, coringa escolhe a cor
{ const st = table([[R7, B5, W, G9], [B2, Y1, G9 + 1], [Y1 + 1, B5 + 1]], R5);
  assert.strictEqual(U.act(st, 'p0', { type: 'play', card: R7 }), null); assert.strictEqual(st.turn, 1); assert.strictEqual(st.color, 'r');
  assert.strictEqual(U.act(st, 'p1', { type: 'play', card: B2 }), 'Essa carta não serve agora'); }
{ const st = table([[W, B5, G9], [B2, Y1]], R5);
  assert.strictEqual(U.act(st, 'p0', { type: 'play', card: W, color: 'b' }), null); assert.strictEqual(st.color, 'b');
  assert.strictEqual(U.act(st, 'p1', { type: 'play', card: B2 }), null); }

// Pula pula o próximo; Volta inverte; com dois, Volta vira Pula
{ const st = table([[RSKIP, G9], [B2, Y1], [B5, Y1 + 1]], R5);
  U.act(st, 'p0', { type: 'play', card: RSKIP }); assert.strictEqual(st.turn, 2); assert.ok(st.log.some(e => e.t === 'skip' && e.p === 1)); }
{ const st = table([[RREV, G9], [B2, Y1], [B5, Y1 + 1]], R5);
  U.act(st, 'p0', { type: 'play', card: RREV }); assert.strictEqual(st.dir, -1); assert.strictEqual(st.turn, 2); }
{ const st = table([[RREV, G9], [B2, Y1]], R5);
  U.act(st, 'p0', { type: 'play', card: RREV }); assert.strictEqual(st.turn, 0); }

// +2 sem acumular: o próximo compra 2 e perde a vez
{ const st = table([[RD2, G9], [B2, BD2], [B5, Y1]], R5, { settings: { ulRules: { stack: false } } });
  U.act(st, 'p0', { type: 'play', card: RD2 }); assert.strictEqual(st.players[1].hand.length, 4); assert.strictEqual(st.turn, 2); }
// acumulando: quem tem +2 devolve; quem não tem compra a soma na hora e perde a vez
{ const st = table([[RD2, G9], [B2, BD2], [B5, Y1]], R5);
  U.act(st, 'p0', { type: 'play', card: RD2 }); assert.strictEqual(st.turn, 1); assert.strictEqual(st.pending, 2);
  assert.match(U.act(st, 'p1', { type: 'play', card: B2 }), /Devolva/);
  U.act(st, 'p1', { type: 'play', card: BD2 });
  assert.strictEqual(st.players[2].hand.length, 6); assert.strictEqual(st.pending, 0); assert.strictEqual(st.turn, 0); }
// +4 em cima de +2 vale; +2 em cima de +4 não; quem tem como devolver pode preferir comprar
{ const st = table([[W4, G9], [BD2, Y1], [B5, Y1 + 1]], R5);
  U.act(st, 'p0', { type: 'play', card: W4, color: 'b' }); assert.strictEqual(st.turn, 2); assert.strictEqual(st.players[1].hand.length, 6); }
{ const st = table([[RD2, G9], [W4, Y1], [B5, Y1 + 1]], R5);
  U.act(st, 'p0', { type: 'play', card: RD2 }); assert.strictEqual(st.turn, 1);
  assert.strictEqual(U.act(st, 'p1', { type: 'draw' }), null); assert.strictEqual(st.players[1].hand.length, 4); assert.strictEqual(st.turn, 2); }

// comprar: se servir, pode jogar só ela ou passar; se não servir, passa sozinho
{ const st = table([[G9, Y1], [B2, B5]], R5); st.deck.push(R7);
  U.act(st, 'p0', { type: 'draw' }); assert.strictEqual(st.phase, 'drawn'); assert.strictEqual(st.drawn, R7);
  assert.match(U.act(st, 'p0', { type: 'play', card: G9 }), /comprou/);
  assert.strictEqual(U.act(st, 'p0', { type: 'draw' }), 'Jogue a carta que comprou ou passe a vez');
  U.act(st, 'p0', { type: 'keep' }); assert.strictEqual(st.turn, 1); assert.strictEqual(st.players[0].hand.length, 3); }
{ const st = table([[G9, Y1], [B2, B5]], R5); st.deck.push(find('g', '3'));
  U.act(st, 'p0', { type: 'draw' }); assert.strictEqual(st.turn, 1); }
// comprar até servir
{ const st = table([[G9, Y1], [B2, B5]], R5, { settings: { ulRules: { drawUntil: true } } }); st.deck.push(R7, find('g', '3'), find('y', '4'));
  U.act(st, 'p0', { type: 'draw' }); assert.strictEqual(st.players[0].hand.length, 5); assert.strictEqual(st.drawn, R7); }
// monte acabou: o descarte é embaralhado, menos a de cima
{ const st = table([[G9, Y1], [B2, B5]], R5); st.pile = [R7, find('r', '3'), R5]; st.deck = [];
  U.act(st, 'p0', { type: 'draw' }); assert.deepStrictEqual(st.pile, [R5]); assert.ok(st.log.some(e => e.t === 'shuffle')); }

// Última!: sem avisar fica exposto; Pegou! = +2; avisar a tempo salva; avisar antes de jogar também
{ const st = table([[R7, G9], [B2, B5, Y1]], R5);
  U.act(st, 'p0', { type: 'play', card: R7 }); assert.strictEqual(st.exposed.p, 0);
  assert.strictEqual(U.act(st, 'p0', { type: 'catch' }), 'Não tem ninguém para pegar');
  U.act(st, 'p1', { type: 'catch' }); assert.strictEqual(st.players[0].hand.length, 3); assert.strictEqual(st.exposed, null); }
{ const st = table([[R7, G9], [B2, B5, Y1]], R5);
  U.act(st, 'p0', { type: 'play', card: R7 }); U.act(st, 'p0', { type: 'call' });
  assert.strictEqual(st.exposed, null); assert.strictEqual(U.act(st, 'p1', { type: 'catch' }), 'Não tem ninguém para pegar'); }
{ const st = table([[R7, G9], [B2, B5, Y1]], R5);
  assert.strictEqual(U.act(st, 'p0', { type: 'call' }), null); U.act(st, 'p0', { type: 'play', card: R7 }); assert.strictEqual(st.exposed, null); }
{ const st = table([[R7, G9], [B2, B5, Y1]], R5);
  U.act(st, 'p0', { type: 'play', card: R7, call: true }); assert.strictEqual(st.exposed, null); assert.ok(st.log.some(e => e.t === 'call')); }
// a janela fecha quando o próximo joga
{ const st = table([[R7, G9], [find('r', '2'), B5, Y1]], R5);
  U.act(st, 'p0', { type: 'play', card: R7 }); U.act(st, 'p1', { type: 'play', card: find('r', '2') }); assert.strictEqual(st.exposed, null); }
{ const st = table([[R7, G9, B5], [B2, Y1]], R5);
  assert.strictEqual(U.act(st, 'p0', { type: 'call' }), 'Só com duas cartas, na sua vez'); }

// bater: fim, vencedor primeiro e os outros pelos pontos que sobraram
{ const st = table([[R7], [W, B5], [G9]], R5);
  U.act(st, 'p0', { type: 'play', card: R7 });
  assert.strictEqual(st.phase, 'over'); assert.strictEqual(st.result.winner, 'p0');
  assert.deepStrictEqual(st.result.ranking.map(r => [r.id, r.pts]), [['p0', 0], ['p2', 9], ['p1', 55]]);
  assert.ok(st.result.ranking.every(r => r.worth === 0));
  assert.strictEqual(U.act(st, 'p1', { type: 'draw' }), 'A partida acabou');
  assert.deepStrictEqual(U.viewFor(st, 'p2').players[1].hand, [W, B5], 'no fim as mãos aparecem'); }

// visão: a mão dos outros e o monte ficam escondidos, inclusive no que cada um comprou
{ const st = table([[G9, Y1], [B2, B5]], R5); st.deck.push(find('g', '3'));
  U.act(st, 'p0', { type: 'draw' });
  const v1 = U.viewFor(st, 'p1'), v0 = U.viewFor(st, 'p0');
  assert.deepStrictEqual(v1.players[0].hand, []); assert.strictEqual(v1.players[0].count, 3); assert.deepStrictEqual(v1.players[1].hand, [B2, B5]);
  assert.deepStrictEqual(v1.deck, []); assert.strictEqual(v1.deckN, st.deck.length);
  assert.ok(v1.log.filter(e => e.t === 'draw').every(e => e.cards.every(c => c === -1)));
  assert.ok(v0.log.some(e => e.t === 'draw' && e.cards[0] === find('g', '3')));
  assert.strictEqual(U.viewFor(v1, 'p1'), v1, 'aplicar de novo não estraga');
  assert.ok(!JSON.stringify(U.viewFor(st, 'spec')).includes(`"hand":[${G9}`)); }

// tempo esgotado: compra e passa, mesmo que a carta sirva
{ const st = table([[G9, Y1], [B2, B5]], R5); st.deck.push(R7);
  assert.ok(U.timeout(st)); assert.strictEqual(st.turn, 1); assert.strictEqual(st.players[0].hand.length, 3); }
// relógio: só na vez de humano, e sobra tempo depois de comprar
{ const st = U.newGame(room(3, 0)); assert.ok(st.deadline > Date.now() + 29000);
  const sb = U.newGame(room(3, 3)); assert.strictEqual(sb.deadline, 0); }

// partidas inteiras só com bots, de 2 a 10, com e sem as regras da casa: nada some, ninguém trava, sempre acaba
for (let g = 0; g < 400; g++) {
  const n = 2 + (g % 9), st = U.newGame(room(n, n, { ulRules: { stack: g % 2 === 0, drawUntil: g % 3 === 0 } }));
  let k = 0;
  while (st.phase !== 'over' && k++ < 5000) {
    // às vezes alguém de fora tenta pegar antes de quem joga
    const ids = st.players.map(p => p.id), first = st.exposed ? ids.find(id => U.botAction(st, id)?.type === 'catch') : null;
    const id = first || st.players[st.turn].id, a = U.botAction(st, id);
    assert.ok(a, 'bot sem jogada');
    assert.strictEqual(U.act(st, id, a), null, `bot errou: ${JSON.stringify(a)}`);
    assert.strictEqual(total(st), 108);
    assert.ok(st.players.every(p => p.hand.every(c => Number.isInteger(c))));
    if (st.pending) assert.ok(st.players[st.turn].hand.some(c => U.canPlay(st, c)), 'quem não pode devolver já comprou');
  }
  assert.strictEqual(st.phase, 'over', `partida ${g} não acabou`);
  assert.strictEqual(st.result.ranking.length, n);
  assert.ok(st.log.length <= 60);
}
console.log('ultima ok');
