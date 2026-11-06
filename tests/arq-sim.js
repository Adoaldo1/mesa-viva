// Simulação: partidas inteiras só com bots, direto no motor. Uso: node tests/arq-sim.js [partidas] [jogadores] [modo]
// Mostra erros/travamentos, duração, vitórias por ordem de jogada e de onde vêm os pontos do vencedor.
const Arq = require('../js/arq.js');
const N = +process.argv[2] || 200, NP = +process.argv[3] || 4, mode = process.argv[4] || 'random';
let errors = 0, stalls = 0, turns = 0, done = 0; const wins = Array(NP).fill(0), errSample = new Map();
const vpFrom = { vilas: 0, cidades: 0, rota: 0, expedicao: 0, reliquias: 0 }, produced = Object.fromEntries(Arq.RES.map(r => [r, 0])), bankTrades = Object.fromEntries(Arq.RES.map(r => [r, 0]));
let sevens = 0, rolls = 0;
for (let g = 0; g < N; g++) {
  const room = { players: Array.from({ length: NP }, (_, i) => ({ id: 'p' + i, seat: i })), settings: { mapMode: mode, turnSec: 0 } };
  const st = Arq.newGame(room);
  let k = 0, seenEv = 0;
  while (!st.result && k++ < 6000) {
    let acted = false;
    const order = [st.players[st.turn].id, ...st.players.map(p => p.id)];
    for (const id of order) {
      const a = Arq.botAction(st, id); if (!a) continue;
      const err = Arq.act(st, id, a);
      if (err) { errors++; errSample.set(a.type + ': ' + err, (errSample.get(a.type + ': ' + err) || 0) + 1); Arq.act(st, id, { type: 'end' }); }
      else if (a.type === 'bank') bankTrades[a.get]++;
      acted = true; break;
    }
    for (const e of st.evs) if (e.n > seenEv && e.type === 'roll') { rolls++; if (e.sum === 7) sevens++; for (const gg of Object.values(e.gains || {})) for (const [r, n] of Object.entries(gg)) produced[r] += n; }
    seenEv = st.ev.n;
    if (!acted) { stalls++; break; }
  }
  const BANK = st.map.size === 'big' ? 24 : 19;
  for (const r of Arq.RES) { const sum = st.bank[r] + st.players.reduce((s, p) => s + p.hand[r], 0); if (sum !== BANK) { console.log('INCONSISTENTE', r, sum); process.exit(1); } }
  if (st.result) {
    done++; const w = st.players.find(p => p.id === st.result.winner); wins[st.players.indexOf(w)]++; turns += st.turnNo;
    for (const b of Object.values(st.buildings)) if (b.owner === w.id) vpFrom[b.type === 'cidade' ? 'cidades' : 'vilas'] += b.type === 'cidade' ? 2 : 1;
    if (st.longest.owner === w.id) vpFrom.rota += 2; if (st.army.owner === w.id) vpFrom.expedicao += 2; vpFrom.reliquias += Arq.hiddenVP(w);
  }
}
const pct = (a, b) => (100 * a / Math.max(1, b)).toFixed(1) + '%';
const totVp = Object.values(vpFrom).reduce((a, b) => a + b, 0), totProd = Object.values(produced).reduce((a, b) => a + b, 0);
console.log(JSON.stringify({ partidas: N, jogadores: NP, modo: mode, terminadas: done, erros: errors, travadas: stalls, turnos_medios: (turns / Math.max(1, done)).toFixed(1), vitorias_por_ordem: wins.map(w => pct(w, done)),
  pontos_do_vencedor: Object.fromEntries(Object.entries(vpFrom).map(([k, v]) => [k, pct(v, totVp)])), producao: Object.fromEntries(Object.entries(produced).map(([k, v]) => [k, pct(v, totProd)])),
  compras_no_banco: bankTrades, setes: pct(sevens, rolls) }));
if (errSample.size) console.log([...errSample].slice(0, 10));
