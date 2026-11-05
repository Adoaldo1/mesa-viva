// ===== Cartas Contra a Humanidade — motor de regras (roda só no anfitrião) =====
// Regras do jogo original (Cards Against Humanity, CC BY-NC-SA 2.0):
// - Cada jogador tem 10 cartas brancas. A cada rodada um jogador é o Czar: ele vira uma carta preta.
// - Os outros respondem em segredo com 1 carta branca (ou 2/3, se a preta pedir PICK 2 / PICK 3).
//   Nas cartas "DRAW 2, PICK 3", todos (menos o Czar) compram 2 cartas extras antes de responder.
// - O Czar embaralha as respostas, lê cada uma e escolhe a favorita: quem a jogou ganha a carta preta (1 Ponto Incrível).
// - O Czar passa para o próximo jogador e todos completam a mão até 10 cartas.
// - Apostas (regra oficial): quem tem pontos pode apostar 1 para jogar uma resposta extra. Se vencer, fica com o ponto;
//   se perder, o vencedor da rodada leva o ponto apostado.
// - Reiniciar o Universo (regra da casa, opcional): troque 1 ponto para descartar a mão inteira e comprar 10 novas.
const Cah = (() => {
  const HAND = 10;
  const SWAP_MAX = 2; // troca com o monte: até 2 cartas, uma vez por rodada
  const rnd = n => Math.floor(Math.random() * n);
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  let nameOf = id => id;
  const log = (st, msg) => { st.log.push({ t: Date.now(), msg }); if (st.log.length > 160) st.log.shift(); };
  const ev = (st, e) => { st.ev = { n: (st.ev?.n || 0) + 1, ...e }; st.evs.push(st.ev); if (st.evs.length > 30) st.evs.shift(); };
  const pl = (st, id) => st.players.find(p => p.id === id);
  const pickOf = st => CAH_BLACK[st.black]?.p || 1;
  const czarId = st => st.players[st.czar].id;
  // texto da carta preta com as respostas encaixadas nas lacunas (ou no fim, se for pergunta)
  function compose(black, whites) {
    const strip = s => s.replace(/[.!]+$/, '');
    const t = CAH_BLACK[black].t; let i = 0;
    if (t.includes('_')) return t.replace(/_/g, () => `«${strip(CAH_WHITE[whites[i++]] ?? '___')}»`);
    return t + ' ' + whites.map(w => `«${CAH_WHITE[w]}»`).join(' ');
  }

  function newGame(room) {
    const ids = room.players.map(p => p.id), s = room.settings;
    const st = {
      gameId: 'h' + Date.now().toString(36) + rnd(1e6).toString(36),
      goal: s.goal || 7, answerMs: (s.answerSec || 60) * 1000, judgeMs: 90000, gamble: s.gamble !== false, reboot: !!s.reboot, swap: s.swap !== false,
      white: shuffle(CAH_WHITE.map((_, i) => i)), black: null, blackDeck: shuffle(CAH_BLACK.map((_, i) => i)), discard: [],
      players: ids.map(id => ({ id, hand: [], points: 0, won: [] })),
      czar: room.lastWinner && ids.includes(room.lastWinner) ? ids.indexOf(room.lastWinner) : rnd(ids.length),
      round: 0, phase: 'play', subs: [], last: null, deadline: 0, log: [], ev: { n: 0 }, evs: [], result: null, seq: 0,
    };
    log(st, `🃏 Começou Cartas Contra a Humanidade! Quem fizer ${st.goal} pontos vence.`);
    startRound(st, true);
    return st;
  }
  function draw(st, p, n) {
    for (let k = 0; k < n; k++) {
      if (!st.white.length) { st.white = shuffle(st.discard); st.discard = []; if (!st.white.length) return; log(st, '🔁 O monte branco acabou: as cartas usadas foram embaralhadas de novo.'); }
      p.hand.push(st.white.pop());
    }
  }
  function startRound(st, first = false) {
    if (!first) st.czar = (st.czar + 1) % st.players.length;
    if (!st.blackDeck.length) st.blackDeck = shuffle(CAH_BLACK.map((_, i) => i).filter(i => !st.players.some(p => p.won.includes(i))));
    st.black = st.blackDeck.pop(); st.round++;
    for (const p of st.players) draw(st, p, Math.max(0, HAND - p.hand.length));
    const pick = pickOf(st);
    if (pick === 3) for (const p of st.players) if (p.id !== czarId(st)) draw(st, p, 2); // DRAW 2, PICK 3
    st.turn = st.czar; // usado pelo agendador de bots da sala
    st.subs = []; st.phase = 'play'; st.deadline = Date.now() + st.answerMs + (pick - 1) * 15000;
    log(st, `🎩 Rodada ${st.round}: ${nameOf(czarId(st))} é o Czar e virou: "${CAH_BLACK[st.black].t.replace(/_/g, '____')}"${pick > 1 ? ` (escolha ${pick})` : ''}`);
    ev(st, { type: 'round', czar: czarId(st), black: st.black, pick });
  }
  const answering = st => st.players.filter(p => p.id !== czarId(st));
  const submitted = (st, id) => st.subs.some(s => s.pid === id && !s.bet);

  function act(st, pid, a) {
    if (st.result) return 'A partida acabou.';
    const me = pl(st, pid); if (!me) return 'Você não está jogando.';
    switch (a.type) {
      case 'play': {
        if (st.phase !== 'play') return 'Não é hora de jogar cartas.';
        if (pid === czarId(st)) return 'O Czar não joga nesta rodada.';
        if (submitted(st, pid)) return 'Você já jogou nesta rodada.';
        const pick = pickOf(st), cards = (a.cards || []).map(Number), extra = (a.extra || []).map(Number);
        const all = [...cards, ...extra];
        if (cards.length !== pick || new Set(all).size !== all.length || !all.every(c => me.hand.includes(c))) return `Escolha ${pick} carta${pick > 1 ? 's' : ''} da sua mão.`;
        if (extra.length) {
          if (!st.gamble) return 'Apostas estão desligadas nesta partida.';
          if (extra.length !== pick) return `A aposta também precisa de ${pick} carta${pick > 1 ? 's' : ''}.`;
          if (me.points < 1) return 'Você precisa de pelo menos 1 ponto para apostar.';
        }
        me.hand = me.hand.filter(c => !all.includes(c));
        st.subs.push({ pid, cards, bet: false });
        if (extra.length) { me.points--; st.subs.push({ pid, cards: extra, bet: true }); log(st, `🎲 ${nameOf(pid)} apostou 1 ponto e jogou uma resposta extra.`); }
        ev(st, { type: 'played', pid, count: st.subs.length });
        if (answering(st).every(p => submitted(st, p.id))) toJudge(st);
        return null;
      }
      case 'reboot': { // Reiniciar o Universo
        if (!st.reboot) return 'Essa regra da casa está desligada.';
        if (st.phase !== 'play' || submitted(st, pid)) return 'Só dá para trocar a mão antes de jogar.';
        if (me.points < 1) return 'Você precisa de 1 ponto para trocar a mão.';
        me.points--; st.discard.push(...me.hand); me.hand = []; draw(st, me, HAND + (pickOf(st) === 3 && pid !== czarId(st) ? 2 : 0));
        log(st, `♻️ ${nameOf(pid)} trocou 1 ponto por uma mão nova.`); ev(st, { type: 'reboot', pid });
        return null;
      }
      case 'swap': { // troca: até 2 cartas da mão por outras do monte, uma vez por rodada
        if (!st.swap) return 'A troca de cartas está desligada nesta partida.';
        if (st.phase !== 'play' || submitted(st, pid)) return 'Só dá para trocar cartas antes de jogar.';
        if (me.swapRound === st.round) return 'Você já trocou cartas nesta rodada.';
        const cards = (a.cards || []).map(Number);
        if (!cards.length || cards.length > SWAP_MAX || new Set(cards).size !== cards.length || !cards.every(c => me.hand.includes(c))) return `Escolha 1 ou ${SWAP_MAX} cartas da sua mão para trocar.`;
        me.hand = me.hand.filter(c => !cards.includes(c)); draw(st, me, cards.length); st.discard.push(...cards); me.swapRound = st.round;
        log(st, `🔄 ${nameOf(pid)} trocou ${cards.length} carta${cards.length > 1 ? 's' : ''} com o monte.`); ev(st, { type: 'swap', pid, count: cards.length });
        return null;
      }
      case 'reveal': {
        if (st.phase !== 'judge' || pid !== czarId(st)) return 'Só o Czar vira as respostas.';
        const s = st.subs[a.i]; if (!s) return 'Resposta inválida.';
        if (!s.shown) { s.shown = true; ev(st, { type: 'reveal', i: a.i }); }
        return null;
      }
      case 'judge': {
        if (st.phase !== 'judge' || pid !== czarId(st)) return 'Só o Czar escolhe a vencedora.';
        if (st.subs.some(s => !s.shown)) return 'Vire todas as respostas antes de escolher.';
        if (!st.subs[a.i]) return 'Resposta inválida.';
        return win(st, a.i), null;
      }
      case 'next': { // o Czar (ou o tempo) passa para a próxima rodada depois de mostrar o resultado
        if (st.phase !== 'reveal') return null;
        return nextRound(st), null;
      }
    }
    return 'Ação desconhecida.';
  }
  function toJudge(st) {
    shuffle(st.subs); st.phase = 'judge'; st.deadline = Date.now() + st.judgeMs;
    log(st, `🃏 Todos responderam! ${nameOf(czarId(st))} vai ler as respostas.`);
    ev(st, { type: 'judge', count: st.subs.length });
  }
  function win(st, i) {
    const s = st.subs[i], w = pl(st, s.pid);
    w.points++; w.won.push(st.black);
    if (s.bet) w.points++; // ganhou com a aposta: recupera o ponto apostado
    // apostas perdidas vão para o vencedor
    const lostBets = st.subs.filter(x => x.bet && x.pid !== s.pid).length + (s.bet ? 0 : st.subs.filter(x => x.bet && x.pid === s.pid).length);
    if (lostBets) { w.points += lostBets; log(st, `🎲 ${nameOf(w.id)} levou ${lostBets} ponto${lostBets > 1 ? 's' : ''} de aposta.`); }
    st.last = { black: st.black, cards: s.cards, pid: s.pid, text: compose(st.black, s.cards) };
    log(st, `🏆 ${nameOf(czarId(st))} escolheu: ${st.last.text} — ponto para ${nameOf(w.id)}!`);
    ev(st, { type: 'win', pid: w.id, i, czar: czarId(st) });
    for (const x of st.subs) st.discard.push(...x.cards);
    st.winner = i; st.phase = 'reveal'; st.deadline = Date.now() + 7000;
    if (w.points >= st.goal) {
      const ranking = [...st.players].sort((a, b) => b.points - a.points).map(p => ({ id: p.id, worth: p.points }));
      st.result = { winner: w.id, ranking }; st.phase = 'done'; st.deadline = 0;
      log(st, `👑 ${nameOf(w.id)} fez ${w.points} pontos e venceu! A pessoa mais horrível da mesa.`); ev(st, { type: 'gameover', pid: w.id });
    }
  }
  function nextRound(st) { st.winner = null; startRound(st); }

  // tempo esgotado: quem não respondeu joga cartas aleatórias; o Czar ausente escolhe ao acaso
  function timeout(st) {
    if (!st.deadline || Date.now() < st.deadline - 50 || st.result) return false;
    if (st.phase === 'play') {
      for (const p of answering(st)) if (!submitted(st, p.id)) act(st, p.id, { type: 'play', cards: shuffle([...p.hand]).slice(0, pickOf(st)) });
      if (st.phase === 'play') toJudge(st);
      return true;
    }
    if (st.phase === 'judge') { st.subs.forEach(s => (s.shown = true)); win(st, rnd(st.subs.length)); return true; }
    if (st.phase === 'reveal') { nextRound(st); return true; }
    return false;
  }

  // visão de cada jogador: só a própria mão; respostas anônimas e de costas até o Czar virar
  function viewFor(st, pid) {
    const v = JSON.parse(JSON.stringify(st));
    v.white = { count: st.white.length }; v.blackDeck = { count: st.blackDeck.length }; v.discard = { count: st.discard.length };
    for (const p of v.players) if (p.id !== pid) { p.handCount = p.hand.length; p.hand = []; }
    const reveal = st.phase === 'reveal' || st.phase === 'done';
    v.subs = st.subs.map((s, i) => ({
      i, n: s.cards.length, shown: !!s.shown || reveal,
      cards: s.shown || reveal ? s.cards : null,
      pid: reveal || s.pid === pid ? s.pid : null, mine: s.pid === pid, bet: reveal || s.pid === pid ? s.bet : undefined,
    }));
    v.played = st.subs.filter(s => !s.bet).map(s => s.pid); // quem já respondeu (não diz qual resposta é de quem)
    v.me = pid;
    return v;
  }

  // ---------- bots: respondem e julgam ao acaso (como o "Rando Cardrissian" da regra da casa) ----------
  function botAction(st, pid) {
    if (st.result) return null;
    if (st.phase === 'play' && pid !== czarId(st) && !submitted(st, pid)) {
      const p = pl(st, pid); return { type: 'play', cards: shuffle([...p.hand]).slice(0, pickOf(st)) };
    }
    if (st.phase === 'judge' && pid === czarId(st)) {
      const hidden = st.subs.findIndex(s => !s.shown);
      return hidden >= 0 ? { type: 'reveal', i: hidden } : { type: 'judge', i: rnd(st.subs.length) };
    }
    if (st.phase === 'reveal' && pid === czarId(st)) return { type: 'next' };
    return null;
  }
  const botDelay = a => (a.type === 'play' ? 1500 + rnd(2500) : a.type === 'reveal' ? 1600 : a.type === 'judge' ? 2200 : 5500);

  return { HAND, SWAP_MAX, newGame, act, viewFor, timeout, botAction, botDelay, compose, pickOf, setNameResolver: f => (nameOf = f) };
})();
