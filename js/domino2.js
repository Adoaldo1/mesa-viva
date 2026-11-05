// ===== Dominó 2 — motor de regras (roda só no anfitrião) =====
// Regras (dominó brasileiro):
// - 28 pedras (0-0 a 6-6), 7 para cada um. Com 4 jogadores: duplas (lugares 0+2 contra 1+3), sem monte.
//   Com 2 ou 3: cada um por si, e quem não tem pedra que encaixa compra do monte até poder jogar.
// - 1ª mão: começa quem tem a maior carroça (ou a pedra mais alta, se ninguém tiver carroça), jogando ela.
//   Nas outras, quem bateu começa com qualquer pedra.
// - Batida: simples 1 ponto, carroça 2, lá e lô 3 (a última pedra cabia nas duas pontas), cruzada 4 (carroça que cabia nas duas).
// - Mesa trancada (ninguém joga): quem tem menos pontos na mão leva 1. Empate: ninguém pontua.
const Domino2 = (() => {
  const HAND = 7, GOAL = 6, TURN_MS = 30000, END_MS = 6500, SHUF_MS = 4300;
  const PTS = { simples: 1, carroca: 2, laelo: 3, cruzada: 4, tranca: 1 };
  const KIND = { simples: 'batida simples', carroca: 'batida de carroça', laelo: 'lá e lô', cruzada: 'cruzada', tranca: 'mesa trancada' };
  const EMO = ['😂', '😤', '👏', '😱', '🤫', '🔥', '😎', '🙏'];
  const SIG = { forte: 'Tenho muito', sem: 'Tô sem', carroca: 'Tenho a carroça de' }; // sinais secretos da dupla (um por mão)
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
      gatoMode: !!room.settings?.gato, gato: null,
      last: null, log: [], ev: { n: 0 }, result: null, emote: { n: 0 }, signals: [], sigN: 0,
      stats: ids.map(() => ({ batidas: 0, pancadas: 0, bateuMesa: 0, carrocas: 0, laelo: 0, cruzadas: 0, compras: 0, passes: 0 })),
    };
    log(st, `🎲 Começou o dominó${st.teams ? ' em duplas' : ''}! Quem fizer ${st.goal} pontos vence.`);
    deal(st);
    return st;
  }
  function deal(st) {
    const set = []; for (let a = 0; a <= 6; a++) for (let b = a; b <= 6; b++) set.push([a, b]);
    shuffle(set); st.hand++;
    st.players.forEach(p => (p.hand = set.splice(0, HAND)));
    st.signals = [];
    st.pile = set; st.C = null; st.L = []; st.R = []; st.passes = 0; st.last = null; st.must = null; st.phase = 'play';
    if (st.starter == null) { // 1ª mão (ou depois de empate sem dono): maior carroça, ou a pedra mais alta
      let best = null;
      st.players.forEach((p, s) => p.hand.forEach(t => {
        const k = (t[0] === t[1] ? 100 : 0) + t[0] + t[1];
        if (!best || k > best.k) best = { k, s, t };
      }));
      st.turn = best.s; st.must = best.t;
    } else st.turn = st.starter;
    st.dealtAt = Date.now(); st.deadline = st.dealtAt + TURN_MS + SHUF_MS; // a mesa 3D embaralha antes de distribuir
    log(st, `🔀 Mão ${st.hand}: ${nameOf(st.players[st.turn].id)} começa${st.must ? ` com a ${st.must[0]}-${st.must[1]}` : ''}.`);
    st.gato = null;
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
  // vale gato: qualquer pedra em qualquer ponta (menos a última); quem pegar pede gato
  const loose = (st, hand) => (st.gatoMode && st.C && hand.length > 1 ? hand.flatMap(t => [{ t, end: 'L' }, { t, end: 'R' }]) : moves(st, hand));
  function nextTurn(st) { st.turn = (st.turn + 1) % st.players.length; st.deadline = Date.now() + TURN_MS; }

  function act(st, pid, a) {
    const seat = st.players.findIndex(p => p.id === pid); if (seat < 0) return 'Você não está jogando.';
    if (a.type === 'emote') return emote(st, seat, a);
    if (st.result) return 'A partida acabou.';
    if (a.type === 'signal') return signal(st, seat, a);
    if (a.type === 'gato') return gato(st, seat);
    if (st.phase !== 'play') return 'Espere a próxima mão.';
    if (seat !== st.turn) return 'Não é a sua vez.';
    const me = st.players[seat], can = moves(st, me.hand);
    switch (a.type) {
      case 'play': {
        const t = Array.isArray(a.tile) ? a.tile.map(Number) : [];
        const m = can.find(x => same(x.t, t) && (x.end === a.end || x.end === 'C' || (!a.end && can.filter(y => same(y.t, t)).length === 1)))
          || loose(st, me.hand).find(x => same(x.t, t) && x.end === a.end);
        const illegal = !can.includes(m);
        if (!m) return st.must && !st.C ? `Comece com a ${st.must[0]}-${st.must[1]}.` : 'Essa pedra não encaixa aí.';
        const before = ends(st), dbl = m.t[0] === m.t[1];
        me.hand = me.hand.filter(x => x !== m.t);
        if (m.end === 'C') st.C = [...m.t];
        else {
          const open = before[m.end === 'L' ? 0 : 1], inner = m.t[0] === open ? m.t[0] : m.t[1];
          (m.end === 'L' ? st.L : st.R).push([inner, m.t[0] + m.t[1] - inner]);
        }
        const passes = st.passes; st.passes = 0; st.must = null;
        const f = [1, 2, 3].includes(a.f) ? a.f : 1; // força: 1 assenta, 2 batida, 3 pancada na mesa
        const S = st.stats[seat]; if (f === 3) S.pancadas++; if (f === 2) S.bateuMesa++; if (dbl) S.carrocas++;
        st.lastPlay = { n: (st.lastPlay?.n || 0) + 1, seat, f };
        st.gato = st.gatoMode && st.C !== null && m.end !== 'C' ? { n: st.lastPlay.n, seat, tile: m.t, end: m.end, illegal, passes } : null;
        ev(st, { type: 'play', seat, tile: m.t, end: m.end, f });
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
        st.stats[seat].compras++;
        me.hand.push(st.pile.pop()); ev(st, { type: 'buy', seat });
        st.deadline = Date.now() + TURN_MS; return null;
      }
      case 'pass': {
        if (can.length) return 'Você tem pedra para jogar.';
        if (st.pile.length) return 'Compre do monte antes de passar.';
        st.stats[seat].passes++;
        st.passes++; log(st, `🚫 ${nameOf(pid)} passou.`); ev(st, { type: 'pass', seat });
        if (st.passes >= st.players.length) return tranca(st), null;
        nextTurn(st); return null;
      }
    }
    return 'Ação desconhecida.';
  }
  // emoji para alguém (to = -1: para a mesa toda). Spam é ignorado sem erro.
  function emote(st, seat, a) {
    if (!EMO.includes(a.e)) return 'Emoji inválido.';
    const to = Number.isInteger(a.to) && a.to >= 0 && a.to < st.players.length ? a.to : -1, now = Date.now();
    st.emoteAt = st.emoteAt || {}; if (now - (st.emoteAt[seat] || 0) < 1500) return null;
    st.emoteAt[seat] = now; st.emote = { n: (st.emote?.n || 0) + 1, from: seat, to, e: a.e, ev: st.ev?.n }; return null;
  }
  // sinal para o parceiro: só a dupla vê o conteúdo; os outros só sabem que houve cochicho
  function signal(st, seat, a) {
    if (!st.teams) return 'Sinal só existe no jogo em duplas.';
    if (st.phase !== 'play') return 'Espere a próxima mão.';
    if (st.signals.some(s => s.seat === seat)) return 'Você já deu o seu sinal nesta mão.';
    if (!SIG[a.kind] || !Number.isInteger(a.x) || a.x < 0 || a.x > 6) return 'Sinal inválido.';
    st.signals.push({ seat, kind: a.kind, x: a.x, n: ++st.sigN }); log(st, `🤫 ${nameOf(st.players[seat].id)} cochichou com o parceiro.`); return null;
  }
  // pedido de gato contra a última jogada: se era gato, a pedra volta, o espertinho compra 2 (se tiver monte) e quem pediu ganha 1 ponto; se não era, o ponto vai para quem jogou
  function gato(st, seat) {
    const g = st.gato;
    if (st.phase !== 'play' || !g || g.done) return 'Não tem jogada para contestar.';
    if (g.seat === seat || teamOf(st, g.seat) === teamOf(st, seat)) return 'Não dá para pedir gato da sua dupla.';
    g.done = true; g.by = seat;
    const cheat = st.players[g.seat], who = st.players[seat], k = teamOf(st, g.illegal ? seat : g.seat);
    st.score[k] = Math.min(st.goal - 1, st.score[k] + 1); // shortcut: o ponto do gato nunca fecha a partida, para não precisar encerrar a mão no meio
    if (g.illegal) { (g.end === 'L' ? st.L : st.R).pop(); cheat.hand.push(g.tile); for (let i = 0; i < 2 && st.pile.length; i++) cheat.hand.push(st.pile.pop()); log(st, `🐱 GATO! ${nameOf(who.id)} pegou ${nameOf(cheat.id)} jogando pedra que não encaixa: a pedra volta e ${sideName(st, k)} ganha 1 ponto.`); }
    else log(st, `🐱 ${nameOf(who.id)} pediu gato, mas a jogada de ${nameOf(cheat.id)} era limpa: 1 ponto para ${sideName(st, k)}.`);
    ev(st, { type: 'gato', seat, cheat: g.seat, ok: g.illegal });
    if (g.illegal && ++g.passes + st.passes >= st.players.length) { st.passes = g.passes + st.passes; return tranca(st), null; } // gato pego conta como passe (senão a mesa travada nunca tranca)
    if (g.illegal) st.passes += g.passes;
    return null;
  }
  function finish(st, seat, kind) {
    const k = teamOf(st, seat), pts = PTS[kind];
    st.score[k] += pts; st.starter = seat;
    st.stats[seat].batidas++; if (kind === 'laelo') st.stats[seat].laelo++; if (kind === 'cruzada') st.stats[seat].cruzadas++;
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
    st.phase = 'end'; st.deadline = Date.now() + END_MS + (e.type === 'win' ? 2500 : 0); ev(st, e); // batida: tempo para o replay e para ver as pedras
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
    const p = st.players[st.turn], a = botAction(st, p.id, true);
    return !!a && act(st, p.id, a) === null;
  }

  // visão de cada jogador: só a própria mão (no fim da mão, todas ficam à mostra)
  function viewFor(st, pid) {
    const v = JSON.parse(JSON.stringify(st)), open = st.phase !== 'play';
    v.pile = { count: st.pile.length };
    for (const p of v.players) { p.count = p.hand.length; if (p.id !== pid && !open) p.hand = []; }
    const me = st.players.findIndex(p => p.id === pid);
    v.signals = (st.signals || []).map(s => (me >= 0 && teamOf(st, s.seat) === teamOf(st, me) ? s : { seat: s.seat, n: s.n }));
    delete v.emoteAt; if (v.gato && !v.gato.done) delete v.gato.illegal;
    v.me = pid;
    return v;
  }

  // bot: carroça primeiro, depois a pedra mais pesada; sem jogada, compra ou passa
  // em dupla, o bot conta para o parceiro o número que mais tem e joga ouvindo o sinal dele
  function botAction(st, pid, noSignal) {
    if (st.result || st.phase !== 'play') return null;
    const g = st.gato, gs = st.players.findIndex(p => p.id === pid);
    if (!noSignal && g && !g.done && g.illegal && gs >= 0 && teamOf(st, gs) !== teamOf(st, g.seat) && (g.n * 7 + gs * 3) % 10 < 6) return { type: 'gato' }; // bot pega gato 60% das vezes
    if (st.players[st.turn]?.id !== pid) return null;
    const seat = st.turn, hand = st.players[seat].hand, can = moves(st, hand);
    // reage com emoji ao que o anterior fez: às vezes (sorteio fixo por jogada, para não sortear de novo a cada atualização) e uma vez só
    const e = st.ev, ally = s => st.teams && teamOf(st, s) === teamOf(st, seat), pick = (a, b) => (e.n % 2 ? a : b);
    if (!noSignal && e.seat != null && e.seat !== seat && !(st.emote?.from === seat && st.emote.ev === e.n) && Date.now() - (st.emoteAt?.[seat] || 0) > 1600 && (e.n * 7 + seat * 13) % 10 < (e.f === 3 ? 6 : 3)) {
      if (e.type === 'play' && e.f === 3) return { type: 'emote', e: ally(e.seat) ? pick('🔥', '👏') : pick('😱', '😤'), to: e.seat };
      if (e.type === 'pass' && !ally(e.seat)) return { type: 'emote', e: pick('😂', '😎'), to: e.seat };
    }
    if (st.teams && !noSignal && !st.signals.some(s => s.seat === seat) && hand.length >= 5 && Math.random() < .7) {
      const cnt = [0, 1, 2, 3, 4, 5, 6].map(x => hand.filter(t => t.includes(x)).length), x = cnt.indexOf(Math.max(...cnt));
      if (cnt[x] >= 3) return { type: 'signal', kind: 'forte', x };
    }
    if (!can.length && st.gatoMode && st.C && hand.length > 1 && !noSignal && (st.ev.n * 5 + seat) % 4 === 0) return { type: 'play', tile: hand[0], end: (st.ev.n % 2) ? 'L' : 'R', f: 1 }; // sem jogada, às vezes arrisca um gato
    if (!can.length) return { type: st.pile.length ? 'buy' : 'pass' };
    const sig = st.teams ? st.signals.filter(s => s.seat === (seat + 2) % 4) : [];
    const after = m => { if (!st.C) return m.t; const e = ends(st), i = m.end === 'L' ? 0 : 1, out = [...e]; out[i] = m.t[0] === e[i] ? m.t[1] : m.t[0]; return out; };
    const heard = m => sig.reduce((v, s) => v + (after(m).includes(s.x) ? (s.kind === 'sem' ? -6 : s.kind === 'forte' ? 6 : 4) : 0), 0);
    const score = m => (m.t[0] === m.t[1] ? 20 : 0) + m.t[0] + m.t[1] + heard(m);
    const m = can.reduce((a, b) => (score(b) > score(a) ? b : a)), last = st.players[st.turn].hand.length === 1;
    // a última pedra sempre vai na pancada; no meio do jogo, de vez em quando uma batida
    const f = last ? 3 : m.t[0] === m.t[1] && Math.random() < .35 ? 2 : Math.random() < .12 ? 2 : Math.random() < .04 ? 3 : 1;
    return { type: 'play', tile: m.t, end: m.end, f };
  }
  const botDelay = (a, st) => (a.type === 'play' ? 900 + rnd(1100) : a.type === 'buy' ? 450 : a.type === 'signal' ? 500 : a.type === 'emote' ? 400 + rnd(500) : a.type === 'gato' ? 1100 + rnd(900) : 900) + Math.max(0, (st?.dealtAt || 0) + SHUF_MS - Date.now()); // espera o embaralhar

  return { GOAL, TURN_MS, END_MS, KIND, EMO, SIG, newGame, act, viewFor, timeout, botAction, botDelay, moves, loose, ends, teamOf, setNameResolver: f => (nameOf = f) };
})();
if (typeof module !== 'undefined') module.exports = Domino2;
