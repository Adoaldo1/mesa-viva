// ===== Dominó 2 — motor de regras (roda só no anfitrião) =====
// Regras (dominó brasileiro):
// - 28 pedras (0-0 a 6-6), 7 para cada um. Com 4 jogadores: duplas (lugares 0+2 contra 1+3), sem monte.
//   Com 2 ou 3: cada um por si, e quem não tem pedra que encaixa compra do monte até poder jogar.
// - 1ª mão: começa quem tem a maior carroça (ou a pedra mais alta, se ninguém tiver carroça), jogando ela.
//   Nas outras, quem bateu começa com qualquer pedra.
// - Batida: simples 1 ponto, carroça 2, lá e lô 3 (a última pedra cabia nas duas pontas), cruzada 4 (carroça que cabia nas duas).
// - Mesa trancada (ninguém joga): quem tem menos pontos na mão leva 1. Empate: ninguém pontua.
const Domino2 = (() => {
  const HAND = 7, GOAL = 6, TURN_MS = 30000, END_MS = 6500;
  const PTS = { simples: 1, carroca: 2, laelo: 3, cruzada: 4, tranca: 1 };
  const KIND = { simples: 'batida simples', carroca: 'batida de carroça', laelo: 'lá e lô', cruzada: 'cruzada', tranca: 'mesa trancada' };
  const rnd = n => Math.floor(Math.random() * n);
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  let nameOf = id => id;
  const log = (st, msg) => { st.log.push({ t: Date.now(), msg }); if (st.log.length > 160) st.log.shift(); };
  const ev = (st, e) => { st.ev = { n: (st.ev?.n || 0) + 1, ...e }; };
  const same = (t, u) => (t[0] === u[0] && t[1] === u[1]) || (t[0] === u[1] && t[1] === u[0]);
  const pips = h => h.reduce((s, t) => s + t[0] + t[1], 0);
  const teamOf = (st, seat) => (st.teams ? seat % 2 : seat);
  const sideName = (st, k) => (st.teams ? `Dupla ${k + 1}` : nameOf(st.players[k].id));

  function newGame(room) {
    const ids = room.players.map(p => p.id).slice(0, 4);
    const st = {
      gameId: 'd' + Date.now().toString(36) + rnd(1e6).toString(36),
      teams: ids.length === 4, goal: GOAL, players: ids.map(id => ({ id, hand: [] })),
      score: ids.length === 4 ? [0, 0] : ids.map(() => 0), hand: 0, starter: null,
      C: null, L: [], R: [], pile: [], must: null, turn: 0, passes: 0, phase: 'play', deadline: 0,
      last: null, log: [], ev: { n: 0 }, result: null,
    };
    log(st, `🎲 Começou o dominó${st.teams ? ' em duplas' : ''}! Quem fizer ${st.goal} pontos vence.`);
    deal(st);
    return st;
  }
  function deal(st) {
    const set = []; for (let a = 0; a <= 6; a++) for (let b = a; b <= 6; b++) set.push([a, b]);
    shuffle(set); st.hand++;
    st.players.forEach(p => (p.hand = set.splice(0, HAND)));
    st.pile = set; st.C = null; st.L = []; st.R = []; st.passes = 0; st.last = null; st.must = null; st.phase = 'play';
    if (st.starter == null) { // 1ª mão (ou depois de empate sem dono): maior carroça, ou a pedra mais alta
      let best = null;
      st.players.forEach((p, s) => p.hand.forEach(t => {
        const k = (t[0] === t[1] ? 100 : 0) + t[0] + t[1];
        if (!best || k > best.k) best = { k, s, t };
      }));
      st.turn = best.s; st.must = best.t;
    } else st.turn = st.starter;
    st.deadline = Date.now() + TURN_MS;
    log(st, `🔀 Mão ${st.hand}: ${nameOf(st.players[st.turn].id)} começa${st.must ? ` com a ${st.must[0]}-${st.must[1]}` : ''}.`);
    ev(st, { type: 'deal', hand: st.hand });
  }
  const ends = st => (st.C ? [st.L.length ? st.L[st.L.length - 1][1] : st.C[0], st.R.length ? st.R[st.R.length - 1][1] : st.C[1]] : null);
  // jogadas possíveis de uma mão: [{ t, end }] ('L' ou 'R'; 'C' para a primeira pedra)
  function moves(st, hand) {
    if (!st.C) return hand.filter(t => !st.must || same(t, st.must)).map(t => ({ t, end: 'C' }));
    const [l, r] = ends(st), out = [];
    for (const t of hand) {
      if (t[0] === l || t[1] === l) out.push({ t, end: 'L' });
      if (t[0] === r || t[1] === r) out.push({ t, end: 'R' });
    }
    return out;
  }
  function nextTurn(st) { st.turn = (st.turn + 1) % st.players.length; st.deadline = Date.now() + TURN_MS; }

  function act(st, pid, a) {
    if (st.result) return 'A partida acabou.';
    const seat = st.players.findIndex(p => p.id === pid); if (seat < 0) return 'Você não está jogando.';
    if (st.phase !== 'play') return 'Espere a próxima mão.';
    if (seat !== st.turn) return 'Não é a sua vez.';
    const me = st.players[seat], can = moves(st, me.hand);
    switch (a.type) {
      case 'play': {
        const t = Array.isArray(a.tile) ? a.tile.map(Number) : [];
        const m = can.find(x => same(x.t, t) && (x.end === a.end || x.end === 'C' || (!a.end && can.filter(y => same(y.t, t)).length === 1)));
        if (!m) return st.must && !st.C ? `Comece com a ${st.must[0]}-${st.must[1]}.` : 'Essa pedra não encaixa aí.';
        const before = ends(st), dbl = m.t[0] === m.t[1];
        me.hand = me.hand.filter(x => x !== m.t);
        if (m.end === 'C') st.C = [...m.t];
        else {
          const open = before[m.end === 'L' ? 0 : 1], inner = m.t[0] === open ? m.t[0] : m.t[1];
          (m.end === 'L' ? st.L : st.R).push([inner, m.t[0] + m.t[1] - inner]);
        }
        st.passes = 0; st.must = null;
        ev(st, { type: 'play', seat, tile: m.t, end: m.end });
        if (!me.hand.length) {
          const both = !!before && m.t.includes(before[0]) && m.t.includes(before[1]);
          const kind = dbl ? (both ? 'cruzada' : 'carroca') : both && before[0] !== before[1] ? 'laelo' : 'simples';
          return finish(st, seat, kind), null;
        }
        nextTurn(st); return null;
      }
      case 'buy': {
        if (can.length) return 'Você tem pedra para jogar.';
        if (!st.pile.length) return 'O monte acabou: passe a vez.';
        me.hand.push(st.pile.pop()); ev(st, { type: 'buy', seat });
        st.deadline = Date.now() + TURN_MS; return null;
      }
      case 'pass': {
        if (can.length) return 'Você tem pedra para jogar.';
        if (st.pile.length) return 'Compre do monte antes de passar.';
        st.passes++; log(st, `🚫 ${nameOf(pid)} passou.`); ev(st, { type: 'pass', seat });
        if (st.passes >= st.players.length) return tranca(st), null;
        nextTurn(st); return null;
      }
    }
    return 'Ação desconhecida.';
  }
  function finish(st, seat, kind) {
    const k = teamOf(st, seat), pts = PTS[kind];
    st.score[k] += pts; st.starter = seat;
    st.last = { seat, kind, pts, side: k };
    log(st, `🎉 ${nameOf(st.players[seat].id)} bateu: ${KIND[kind]}! +${pts} para ${sideName(st, k)}.`);
    endHand(st, { type: 'win', seat, kind, pts });
  }
  function tranca(st) {
    const sums = st.score.map((_, k) => pips(st.players.filter((p, s) => teamOf(st, s) === k).flatMap(p => p.hand)));
    const low = Math.min(...sums), who = sums.map((v, k) => (v === low ? k : -1)).filter(k => k >= 0);
    if (who.length > 1) { st.last = { kind: 'tranca', pts: 0, sums }; log(st, `🔒 Mesa trancada e empatada (${sums.join(' × ')}): ninguém pontua.`); }
    else {
      const k = who[0]; st.score[k] += PTS.tranca; st.last = { kind: 'tranca', pts: 1, side: k, sums };
      st.starter = st.players.findIndex((_, s) => teamOf(st, s) === k);
      log(st, `🔒 Mesa trancada! ${sideName(st, k)} tem menos pontos na mão (${sums.join(' × ')}) e leva 1.`);
    }
    endHand(st, { type: 'tranca' });
  }
  function endHand(st, e) {
    st.phase = 'end'; st.deadline = Date.now() + END_MS; ev(st, e);
    const k = st.score.findIndex(v => v >= st.goal); if (k < 0) return;
    const ranking = st.players.map((p, s) => ({ id: p.id, worth: st.score[teamOf(st, s)] })).sort((a, b) => b.worth - a.worth);
    const ws = st.last?.seat != null && teamOf(st, st.last.seat) === k ? st.last.seat : st.players.findIndex((_, s) => teamOf(st, s) === k);
    const winner = st.players[ws].id;
    st.result = { winner, side: k, ranking }; st.phase = 'done'; st.deadline = 0;
    log(st, `👑 ${sideName(st, k)} fez ${st.score[k]} pontos e venceu a partida!`); ev(st, { type: 'gameover', side: k });
  }

  // tempo esgotado: joga no lugar de quem está na vez; no fim da mão, distribui a próxima
  function timeout(st) {
    if (!st.deadline || Date.now() < st.deadline - 50 || st.result) return false;
    if (st.phase === 'end') { deal(st); return true; }
    const p = st.players[st.turn], a = botAction(st, p.id);
    return !!a && act(st, p.id, a) === null;
  }

  // visão de cada jogador: só a própria mão (no fim da mão, todas ficam à mostra)
  function viewFor(st, pid) {
    const v = JSON.parse(JSON.stringify(st)), open = st.phase !== 'play';
    v.pile = { count: st.pile.length };
    for (const p of v.players) { p.count = p.hand.length; if (p.id !== pid && !open) p.hand = []; }
    v.me = pid;
    return v;
  }

  // bot: carroça primeiro, depois a pedra mais pesada; sem jogada, compra ou passa
  function botAction(st, pid) {
    if (st.result || st.phase !== 'play' || st.players[st.turn]?.id !== pid) return null;
    const can = moves(st, st.players[st.turn].hand);
    if (!can.length) return { type: st.pile.length ? 'buy' : 'pass' };
    const score = m => (m.t[0] === m.t[1] ? 20 : 0) + m.t[0] + m.t[1];
    const m = can.reduce((a, b) => (score(b) > score(a) ? b : a));
    return { type: 'play', tile: m.t, end: m.end };
  }
  const botDelay = a => (a.type === 'play' ? 900 + rnd(1100) : a.type === 'buy' ? 450 : 900);

  return { GOAL, TURN_MS, END_MS, KIND, newGame, act, viewFor, timeout, botAction, botDelay, moves, ends, teamOf, setNameResolver: f => (nameOf = f) };
})();
if (typeof module !== 'undefined') module.exports = Domino2;
