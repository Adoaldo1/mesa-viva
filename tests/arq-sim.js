// Simulação: partidas inteiras só com bots, direto no motor. Uso: node tests/arq-sim.js [partidas] [jogadores] [modo]
const Arq = require('../js/arq.js');
const N = +process.argv[2] || 200, NP = +process.argv[3] || 4, mode = process.argv[4] || 'random';
let errors = 0, stalls = 0, turns = 0, done = 0; const wins = Array(NP).fill(0), errSample = new Map();
for (let g = 0; g < N; g++) {
  const room = { players: Array.from({ length: NP }, (_, i) => ({ id: 'p' + i, seat: i })), settings: { mapMode: mode, turnSec: 0 } };
  const st = Arq.newGame(room);
  let k = 0;
  while (!st.result && k++ < 6000) {
    let acted = false;
    const order = [st.players[st.turn].id, ...st.players.map(p => p.id)];
    for (const id of order) {
      const a = Arq.botAction(st, id); if (!a) continue;
      const err = Arq.act(st, id, a);
      if (err) { errors++; errSample.set(a.type + ': ' + err, (errSample.get(a.type + ': ' + err) || 0) + 1); if (Arq.act(st, id, { type: 'end' })) { /* nada */ } }
      acted = true; break;
    }
    if (!acted) { stalls++; break; }
  }
  // conferências de consistência: recursos nunca negativos e banco + mãos = total
  const BANK = st.map.size === 'big' ? 24 : 19;
  for (const r of Arq.RES) { const sum = st.bank[r] + st.players.reduce((s, p) => s + p.hand[r], 0); if (sum !== BANK) { console.log('INCONSISTENTE', r, sum); process.exit(1); } }
  for (const p of st.players) for (const r of Arq.RES) if (p.hand[r] < 0) { console.log('NEGATIVO', p.id, r); process.exit(1); }
  if (st.result) { done++; wins[st.players.findIndex(p => p.id === st.result.winner)]++; turns += st.turnNo; }
}
console.log(JSON.stringify({ partidas: N, terminadas: done, erros: errors, travadas: stalls, turnos_medios: (turns / Math.max(1, done)).toFixed(1), vitorias_por_ordem: wins.map(w => (100 * w / Math.max(1, done)).toFixed(1) + '%') }));
if (errSample.size) console.log([...errSample].slice(0, 10));
