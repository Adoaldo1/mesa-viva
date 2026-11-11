// Regressões do Supremacia: node --test tests/war.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function fixture() {
  const math = Object.create(Math), context = vm.createContext({ Math: math, Date });
  for (const file of ['war-map.js', 'war.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../js', file), 'utf8'), context);
  const War = vm.runInContext('War', context);
  const room = { players: Array.from({ length: 3 }, (_, i) => ({ id: 'p' + i, seat: i })), settings: { turnSec: 0 } };
  const st = War.newGame(room);
  Object.keys(st.owner).forEach((id, i) => { st.owner[id] = 'p' + i % 3; st.armies[id] = 20; });
  st.players.forEach(p => { p.obj = 0; p.cards = []; });
  st.owner.brasil = 'p0'; st.owner.venezuela = 'p1';
  st.turn = st.players.findIndex(p => p.id === 'p0'); st.phase = 'attack'; st.round = 2; st.evs = []; st.ev = { n: 0 };
  const roll = values => { let i = 0; math.random = () => ((values[i++ % values.length] || 1) - .5) / 6; };
  const attack = n => War.act(st, 'p0', { type: 'attack', from: 'brasil', to: 'venezuela', n });
  return { War, st, roll, attack };
}
const plain = data => JSON.parse(JSON.stringify(data));

test('cada comparação é contada, incluindo empates a favor da defesa', () => {
  const { st, roll, attack } = fixture();
  roll([6, 5, 2, 6, 3, 1]); assert.equal(attack(3), null);
  const attacker = st.players.find(p => p.id === 'p0'), defender = st.players.find(p => p.id === 'p1');
  assert.deepEqual(plain(attacker.battleStats), { attacks: 1, defenses: 0, diceWins: 2, diceLosses: 1, conquests: 0 });
  assert.deepEqual(plain(defender.battleStats), { attacks: 0, defenses: 1, diceWins: 1, diceLosses: 2, conquests: 0 });
  roll([1]); assert.equal(attack(3), null);
  assert.equal(attacker.battleStats.attacks, 2); assert.equal(attacker.battleStats.diceLosses, 4);
  assert.equal(defender.battleStats.defenses, 2); assert.equal(defender.battleStats.diceWins, 4);
});

test('uma batalha mantém seu resultado mesmo quando ataques posteriores já chegaram', () => {
  const { st, roll, attack } = fixture();
  roll([6, 5, 2, 6, 3, 1]); assert.equal(attack(3), null);
  const first = st.evs.find(e => e.type === 'battle'), snapshot = plain(first.after);
  assert.deepEqual(snapshot, { brasil: { owner: 'p0', armies: 19 }, venezuela: { owner: 'p1', armies: 18 } });
  roll([1]); for (let i = 0; i < 4; i++) assert.equal(attack(3), null);
  assert.deepEqual(plain(first.after), snapshot);
  assert.equal(st.armies.brasil, 7); assert.equal(first.after.brasil.armies, 19);
});

test('conquista e ocupação têm estados separados e a conquista é registrada uma vez', () => {
  const { st, roll, attack, War } = fixture(); st.armies.venezuela = 1;
  roll([6, 1]); assert.equal(attack(1), null);
  const battle = st.evs.find(e => e.type === 'battle');
  assert.deepEqual(plain(battle.after.venezuela), { owner: 'p0', armies: 0 });
  assert.equal(st.players.find(p => p.id === 'p0').battleStats.conquests, 1);
  assert.equal(War.act(st, 'p0', { type: 'occupy', n: 1 }), null);
  const occupy = st.evs.find(e => e.type === 'occupy');
  assert.equal(occupy.after.venezuela.armies, 1); assert.equal(battle.after.venezuela.armies, 0);
  assert.equal(st.players.find(p => p.id === 'p0').battleStats.attacks, 1);
});

test('ações recusadas não alteram o relatório', () => {
  const { st, attack } = fixture(); st.armies.brasil = 1;
  const before = JSON.stringify(st.players.map(p => p.battleStats));
  assert.equal(typeof attack(3), 'string');
  assert.equal(JSON.stringify(st.players.map(p => p.battleStats)), before);
});

test('relatório final guarda os totais de ataque e defesa de todos os jogadores', () => {
  const { st, War, roll, attack } = fixture();
  Object.keys(st.owner).forEach(id => st.owner[id] = 'p0');
  st.owner.venezuela = 'p1'; st.owner.mexico = 'p2'; st.armies.venezuela = 1;
  st.players.find(p => p.id === 'p0').obj = 6;
  roll([6, 1]); assert.equal(attack(1), null);
  assert.equal(st.result.winner, 'p0');
  const row = st.result.ranking.find(p => p.id === 'p0');
  assert.equal(row.battleStats.attacks, 1); assert.equal(row.battleStats.conquests, 1);
  assert.equal(st.result.ranking.find(p => p.id === 'p1').battleStats.diceLosses, 1);
  assert.equal(st.result.ranking.find(p => p.id === 'p2').battleStats.attacks, 0);
  st.players.find(p => p.id === 'p0').battleStats.attacks++;
  assert.equal(row.battleStats.attacks, 1, 'resultado não compartilha o objeto mutável de contadores');
  assert.equal(War.viewFor(st, 'p2').result.ranking.length, 3);
});

test('dados de animação não expõem cartas e objetivos de outros jogadores', () => {
  const { st, War, roll, attack } = fixture(); st.players.find(p => p.id === 'p1').cards = [4, 5];
  roll([6, 5, 2, 6, 3, 1]); assert.equal(attack(3), null);
  const view = War.viewFor(st, 'p0'), enemy = view.players.find(p => p.id === 'p1');
  assert.equal(enemy.obj, null); assert.deepEqual(plain(enemy.cards), []);
  for (const item of Object.values(view.evs[0].after)) assert.deepEqual(Object.keys(item).sort(), ['armies', 'owner']);
});

test('bots aguardam a apresentação da última batalha antes de agir novamente', () => {
  const { War, st, roll, attack } = fixture(); roll([1]); assert.equal(attack(3), null);
  assert.ok(War.botDelay({ type: 'attack' }, st) >= 3000);
  assert.ok(War.botDelay({ type: 'occupy' }, st) >= 3000);
  st.evs[0].at -= 10000;
  assert.equal(War.botDelay({ type: 'attack' }, st), 1500);
});

test('partidas antigas seguem funcionando e identificam contadores parciais', () => {
  const { st, roll, attack } = fixture(); st.players.forEach(p => delete p.battleStats);
  roll([1]); assert.equal(attack(3), null);
  assert.equal(st.statsPartial, true);
  assert.equal(st.players.find(p => p.id === 'p0').battleStats.diceLosses, 3);
});

function tradeFixture(cards, trades = 0) {
  const f = fixture();
  f.st.phase = 'place'; f.st.trades = trades; f.st.pool = { free: 3, cont: {} };
  f.st.players.find(p => p.id === 'p0').cards = cards.slice();
  return f;
}

test('três símbolos iguais do mesmo continente recebem 50% a mais na troca', () => {
  const { War } = fixture();
  for (const cards of [[0, 3, 6], [1, 4, 7], [2, 5, 8]]) {
    assert.deepEqual(plain(War.tradeReward(0, cards)), { base: 4, bonus: 2, total: 6, continent: 'na' });
  }
});

test('trios mistos, curingas e seleções incompletas não ativam o bônus continental', () => {
  const { War } = fixture();
  for (const cards of [[0, 3, 9], [0, 1, 2], [0, 3, 42], [0, 0, 0], [0, 3], [42, 43, 0], []]) {
    assert.deepEqual(plain(War.tradeReward(0, cards)), { base: 4, bonus: 0, total: 4, continent: null });
  }
});

test('bônus usa o valor atual da sequência de trocas e arredonda frações para baixo', () => {
  const { War } = fixture();
  assert.deepEqual(plain(War.tradeReward(5, [0, 3, 6])), { base: 15, bonus: 7, total: 22, continent: 'na' });
  assert.deepEqual(plain(War.tradeReward(6, [0, 3, 6])), { base: 20, bonus: 10, total: 30, continent: 'na' });
});

test('troca credita o total previsto e mantém os bônus de territórios próprios', () => {
  const { War, st } = tradeFixture([0, 3, 6]);
  const before = [0, 3, 6].map(id => { const t = War.CARDS[id].terr; st.owner[t] = 'p0'; return st.armies[t]; });
  const expected = War.tradeReward(st.trades, [0, 3, 6]);
  assert.equal(War.act(st, 'p0', { type: 'trade', cards: [0, 3, 6] }), null);
  assert.equal(st.pool.free, 3 + expected.total);
  [0, 3, 6].forEach((id, i) => assert.equal(st.armies[War.CARDS[id].terr], before[i] + 2));
  const event = st.evs.find(e => e.type === 'trade');
  assert.equal(event.value, 6); assert.equal(event.baseValue, 4); assert.equal(event.continentalBonus, 2); assert.equal(event.continent, 'na');
  assert.equal(st.trades, 1); assert.equal(st.players.find(p => p.id === 'p0').cards.length, 0);
  const snapshot = JSON.stringify(st);
  assert.equal(typeof War.act(st, 'p0', { type: 'trade', cards: [0, 3, 6] }), 'string');
  assert.equal(JSON.stringify(st), snapshot, 'cartas entregues não geram o bônus novamente');
});

test('troca normal mantém o valor quando só um dos requisitos do bônus é cumprido', () => {
  for (const cards of [[0, 3, 9], [0, 1, 2], [0, 3, 42]]) {
    const { War, st } = tradeFixture(cards);
    assert.equal(War.act(st, 'p0', { type: 'trade', cards }), null);
    assert.equal(st.pool.free, 7); assert.equal(st.evs.find(e => e.type === 'trade').continentalBonus, 0);
  }
});

test('bots consideram o bônus continental ao escolher suas três cartas', () => {
  const { War, st } = tradeFixture([0, 1, 2, 3, 6]);
  [0, 1, 2, 3, 6].forEach(id => st.owner[War.CARDS[id].terr] = 'p1');
  const action = War.botAction(st, 'p0');
  assert.equal(action.type, 'trade');
  assert.deepEqual(plain(action.cards).sort((a, b) => a - b), [0, 3, 6]);
});

test('cinco cartas do mesmo símbolo dobram o valor normal sem exigir continente', () => {
  const { War } = fixture(), cards = [0, 3, 6, 9, 12];
  assert.equal(War.validSet(cards), true);
  assert.ok(new Set(cards.map(id => War.contOf[War.CARDS[id].terr])).size > 1);
  assert.deepEqual(plain(War.tradeReward(0, cards)), { base: 4, bonus: 4, total: 8, continent: null });
  assert.deepEqual(plain(War.tradeReward(5, cards)), { base: 15, bonus: 15, total: 30, continent: null });
});

test('cinco símbolos misturados, curingas e cartas repetidas não dão troca dupla', () => {
  const { War } = fixture();
  for (const cards of [[0, 3, 6, 9, 13], [0, 3, 6, 9, 42], [0, 3, 6, 9, 0], [0, 3, 6, 9]]) {
    assert.equal(War.validSet(cards), false);
    assert.equal(War.tradeReward(0, cards).bonus, 0);
  }
  assert.equal(War.validSet([0, 3, 42]), true, 'curinga continua completando uma troca normal de três');
});

test('troca dupla consome cinco cartas, avança uma troca e preserva os bônus de território', () => {
  const cards = [0, 3, 6, 9, 12], { War, st } = tradeFixture(cards);
  cards.forEach(id => st.owner[War.CARDS[id].terr] = 'p0');
  const armies = cards.map(id => st.armies[War.CARDS[id].terr]);
  assert.equal(War.act(st, 'p0', { type: 'trade', cards }), null);
  assert.equal(st.pool.free, 11, 'três na reserva + oito da troca dupla');
  assert.equal(st.players.find(p => p.id === 'p0').cards.length, 0);
  assert.deepEqual(plain(st.used).slice(-5), cards); assert.equal(st.trades, 1);
  cards.forEach((id, i) => assert.equal(st.armies[War.CARDS[id].terr], armies[i] + 2));
  const event = st.evs.find(e => e.type === 'trade');
  assert.equal(event.value, 8); assert.equal(event.fiveCardBonus, 4);
  assert.equal(event.continentalBonus, 0, 'o bônus de três cartas não se acumula com o dobro');
  assert.equal(War.act(st, 'p0', { type: 'place', t: 'brasil', n: 1 }), null);
});

test('trocas inválidas de cinco cartas não consomem cartas nem soldados', () => {
  for (const cards of [[0, 3, 6, 9, 13], [0, 3, 6, 9, 42], [0, 3, 6, 9, 0]]) {
    const { War, st } = tradeFixture([...new Set(cards)]), before = JSON.stringify(st);
    assert.equal(typeof War.act(st, 'p0', { type: 'trade', cards }), 'string');
    assert.equal(JSON.stringify(st), before);
  }
});

test('bots escolhem um conjunto de cinco iguais mesmo com uma sexta carta na mão', () => {
  const { War, st } = tradeFixture([0, 3, 6, 9, 12, 1]);
  st.players.find(p => p.id === 'p0').cards.forEach(id => st.owner[War.CARDS[id].terr] = 'p1');
  const action = War.botAction(st, 'p0');
  assert.equal(action.type, 'trade'); assert.deepEqual(plain(action.cards).sort((a, b) => a - b), [0, 3, 6, 9, 12]);
  assert.equal(War.act(st, 'p0', action), null);
  assert.deepEqual(plain(st.players.find(p => p.id === 'p0').cards), [1]);
});
