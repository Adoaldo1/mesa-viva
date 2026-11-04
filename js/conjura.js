// ===== Conjura — jogo de blefe e intriga na corte (motor de regras; roda só no anfitrião) =====
// Cada jogador tem 2 influências (cartas viradas) e moedas. Na sua vez, faz UMA ação. Ações de personagem
// podem ser blefe: qualquer um pode contestar; algumas podem ser bloqueadas (o bloqueio também pode ser blefe).
// Quem perde as 2 influências é exilado. Vence o último na corte.
const Conjura = (() => {
  const ROLES = {
    tesoureiro: { name: 'Tesoureiro', act: 'Cobrar impostos: +3 moedas', block: 'Bloqueia Ajuda Externa' },
    sicario: { name: 'Sicário', act: 'Assassinar: paga 3 e um rival perde 1 influência', block: '' },
    corsario: { name: 'Corsário', act: 'Extorquir: toma 2 moedas de um rival', block: 'Bloqueia extorsão' },
    diplomata: { name: 'Diplomata', act: 'Trocar: compra 2 cartas da Corte e devolve 2', block: 'Bloqueia extorsão' },
    guarda: { name: 'Guarda-Real', act: '—', block: 'Bloqueia assassinato (contra você)' },
    confessor: { name: 'Confessor', act: 'Trocar 1 carta, ou Investigar uma carta de um rival', block: 'Bloqueia extorsão' },
  };
  // ações: custo, personagem exigido, se tem alvo, quem pode bloquear e com quais personagens
  const ACTIONS = {
    income: { name: 'Renda', cost: 0, claim: null, target: false },
    aid: { name: 'Ajuda Externa', cost: 0, claim: null, target: false, block: { who: 'anyone', roles: ['tesoureiro'] } },
    coup: { name: 'Golpe', cost: 7, claim: null, target: true },
    tax: { name: 'Cobrar impostos', cost: 0, claim: 'tesoureiro', target: false },
    assassinate: { name: 'Assassinar', cost: 3, claim: 'sicario', target: true, block: { who: 'target', roles: ['guarda'] } },
    steal: { name: 'Extorquir', cost: 0, claim: 'corsario', target: true, block: { who: 'target', roles: ['corsario', 'diplomata'] } },
    exchange: { name: 'Trocar', cost: 0, claim: 'diplomata', target: false },
    exchange1: { name: 'Trocar (1 carta)', cost: 0, claim: 'confessor', target: false },
    investigate: { name: 'Investigar', cost: 0, claim: 'confessor', target: true },
  };
  const rnd = n => Math.floor(Math.random() * n);
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  let nameOf = id => id;
  const log = (st, msg) => { st.log.push({ t: Date.now(), msg }); if (st.log.length > 160) st.log.shift(); };
  const ev = (st, e) => { st.ev = { n: (st.ev?.n || 0) + 1, ...e }; st.evs.push(st.ev); if (st.evs.length > 30) st.evs.shift(); };
  const pl = (st, id) => st.players.find(p => p.id === id);
  const alive = st => st.players.filter(p => !p.out);
  const influence = p => p.cards.filter(c => !c.up).length;
  const roleSet = st => ['tesoureiro', 'sicario', 'corsario', st.variant === 'confessor' ? 'confessor' : 'diplomata', 'guarda'];
  const blockRoles = (st, a) => a === 'steal' ? ['corsario', st.variant === 'confessor' ? 'confessor' : 'diplomata'] : ACTIONS[a].block?.roles || [];

  // ---------- preparação ----------
  function newGame(room) {
    const ids = room.players.map(p => p.id), n = ids.length;
    const copies = n <= 6 ? 3 : n <= 8 ? 4 : 5; // 7–8 jogadores: 4 de cada; 9–10: 5 de cada
    const st = {
      gameId: 'c' + Date.now().toString(36) + rnd(1e6).toString(36),
      variant: room.settings.variant === 'confessor' ? 'confessor' : 'diplomata',
      respondMs: (room.settings.respondSec || 15) * 1000,
      players: [], deck: [], turn: 0, phase: 'action', P: null, lose: null, exch: null, inv: null,
      deadline: 0, log: [], ev: { n: 0 }, evs: [], result: null, seq: 0,
    };
    for (const r of roleSet(st)) for (let k = 0; k < copies; k++) st.deck.push(r);
    shuffle(st.deck);
    // quem venceu a última partida começa; senão, sorteio
    const order = [...ids]; const first = room.lastWinner && order.includes(room.lastWinner) ? order.indexOf(room.lastWinner) : rnd(n);
    st.players = order.map(id => ({ id, coins: n === 2 ? 1 : 2, cards: [{ role: st.deck.pop(), up: false }, { role: st.deck.pop(), up: false }], out: false }));
    st.turn = first;
    log(st, `🏰 A conjura começou! ${n} famílias na corte. ${nameOf(st.players[first].id)} começa.`);
    ev(st, { type: 'start' });
    return st;
  }

  // ---------- visão de cada jogador (esconde as cartas alheias) ----------
  function viewFor(st, pid) {
    const v = JSON.parse(JSON.stringify(st));
    v.deck = { count: st.deck.length };
    for (const p of v.players) if (p.id !== pid) p.cards = p.cards.map(c => (c.up ? c : { role: null, up: false }));
    if (v.exch && v.exch.pid !== pid) v.exch = { pid: v.exch.pid, count: v.exch.options.length };
    if (v.inv && v.inv.by !== pid && v.inv.target !== pid) v.inv = { by: v.inv.by, target: v.inv.target, stage: v.inv.stage };
    // eventos com informação secreta (carta tirada da Corte) só para o dono
    v.evs = v.evs.map(e => (e.secretFor && e.secretFor !== pid ? { ...e, newRole: null } : e));
    if (v.ev.secretFor && v.ev.secretFor !== pid) v.ev = { ...v.ev, newRole: null };
    v.me = pid;
    return v;
  }

  // ---------- perder influência ----------
  // quem perde escolhe qual carta revelar; com uma só, é automático. `next` diz o que fazer depois.
  function loseInfluence(st, pid, reason, next) {
    const p = pl(st, pid);
    if (!p || p.out) return proceed(st, next);
    const hidden = p.cards.map((c, i) => (c.up ? -1 : i)).filter(i => i >= 0);
    if (hidden.length === 1) { revealCard(st, p, hidden[0], reason); return proceed(st, next); }
    st.phase = 'lose'; st.lose = { pid, reason, next }; st.deadline = Date.now() + st.respondMs * 2;
  }
  function revealCard(st, p, idx, reason) {
    p.cards[idx].up = true;
    log(st, `💀 ${nameOf(p.id)} perdeu uma influência (${reason}) e revelou ${ROLES[p.cards[idx].role].name}.`);
    ev(st, { type: 'lose', pid: p.id, role: p.cards[idx].role, idx });
    if (!influence(p)) {
      p.out = true; p.coins = 0; (st.exileOrder ||= []).push(p.id);
      log(st, `🚪 ${nameOf(p.id)} foi exilado da corte!`);
      ev(st, { type: 'exiled', pid: p.id });
      const al = alive(st);
      if (al.length === 1) { st.result = { winner: al[0].id, ranking: rankAll(st, al[0].id) }; st.phase = 'done'; log(st, `👑 ${nameOf(al[0].id)} domina a corte e vence!`); ev(st, { type: 'win', pid: al[0].id }); }
    }
  }
  function rankAll(st, w) { return [w, ...[...st.exileOrder || []].reverse()].map(id => ({ id, worth: 0 })); }

  // ---------- desafio ----------
  // `claimant` diz ter `role`. Se tiver, mostra, devolve à Corte, embaralha e compra outra; quem contestou perde.
  function challenge(st, claimant, role, challenger, onTruth, onLie) {
    const c = pl(st, claimant), idx = c.cards.findIndex(x => !x.up && x.role === role);
    log(st, `⚔️ ${nameOf(challenger)} contestou ${nameOf(claimant)} (${ROLES[role].name}).`);
    if (idx >= 0) {
      st.deck.push(role); shuffle(st.deck); const newRole = st.deck.pop(); c.cards[idx] = { role: newRole, up: false };
      log(st, `✅ ${nameOf(claimant)} mostrou o ${ROLES[role].name}! Devolveu à Corte e comprou outra carta.`);
      ev(st, { type: 'challenge', claimant, challenger, role, truth: true, secretFor: claimant, newRole });
      loseInfluence(st, challenger, 'contestação perdida', onTruth);
    } else {
      log(st, `🤥 ${nameOf(claimant)} estava blefando!`);
      ev(st, { type: 'challenge', claimant, challenger, role, truth: false });
      loseInfluence(st, claimant, 'blefe descoberto', onLie);
    }
  }

  // ---------- fluxo da ação ----------
  function openWindow(st, stage) { st.P.stage = stage; st.P.passed = []; st.phase = 'respond'; st.deadline = Date.now() + st.respondMs; }
  function responders(st) {
    const P = st.P; if (!P) return [];
    const others = alive(st).filter(p => p.id !== (P.stage === 'blockClaim' ? P.block.by : P.actor)).map(p => p.id);
    const canChallenge = P.stage === 'claim' ? !!P.claim : P.stage === 'blockClaim';
    const canBlock = (P.stage === 'claim' || P.stage === 'blockOnly') && blockRoles(st, P.type).length;
    const blockers = !canBlock ? [] : ACTIONS[P.type].block.who === 'target' ? (P.target && !pl(st, P.target).out ? [P.target] : []) : others;
    const ids = new Set([...(canChallenge ? others : []), ...blockers]);
    return [...ids].filter(id => !P.passed.includes(id));
  }
  function options(st, pid) { // o que `pid` pode responder agora
    const P = st.P; if (st.phase !== 'respond' || !P || !responders(st).includes(pid)) return { challenge: false, block: [] };
    const canChallenge = (P.stage === 'claim' && !!P.claim && pid !== P.actor) || (P.stage === 'blockClaim' && pid !== P.block.by);
    const who = ACTIONS[P.type].block?.who;
    const canBlock = (P.stage === 'claim' || P.stage === 'blockOnly') && blockRoles(st, P.type).length && (who === 'anyone' ? pid !== P.actor : pid === P.target);
    return { challenge: canChallenge, block: canBlock ? blockRoles(st, P.type) : [] };
  }

  function proceed(st, next) {
    if (st.result) return;
    st.lose = null;
    const P = st.P;
    switch (next?.do) {
      case 'afterActionChallengeWon': // ator provou: a ação segue (ainda pode ser bloqueada)
        if (pl(st, P.actor).out) return endTurn(st);
        if (blockRoles(st, P.type).length && (ACTIONS[P.type].block.who === 'anyone' || (P.target && !pl(st, P.target).out))) return openWindow(st, 'blockOnly');
        return execute(st);
      case 'actionFailed': // ator blefou: ação falha e o custo volta
        if (st.blockedMemo) delete st.blockedMemo[P.actor];
        if (P.cost) { pl(st, P.actor).coins += P.cost; log(st, `↩️ ${nameOf(P.actor)} recebeu de volta ${P.cost} moedas.`); }
        return endTurn(st);
      case 'blocked':
        log(st, `🛡️ ${ACTIONS[P.type].name} de ${nameOf(P.actor)} foi bloqueada${P.cost ? ' (as moedas pagas não voltam)' : ''}.`);
        ev(st, { type: 'blocked', actor: P.actor });
        (st.blockedMemo ||= {})[P.actor] = { type: P.type, target: P.target, round: st.seq };
        return endTurn(st);
      case 'execute': return execute(st);
      case 'endTurn': default: return endTurn(st);
    }
  }

  function execute(st) {
    const P = st.P, a = pl(st, P.actor), t = P.target ? pl(st, P.target) : null;
    if (a.out) return endTurn(st);
    switch (P.type) {
      case 'income': a.coins += 1; log(st, `🪙 ${nameOf(a.id)} recebeu Renda (+1).`); ev(st, { type: 'coins', pid: a.id, n: 1 }); return endTurn(st);
      case 'aid': a.coins += 2; log(st, `🪙 ${nameOf(a.id)} recebeu Ajuda Externa (+2).`); ev(st, { type: 'coins', pid: a.id, n: 2 }); return endTurn(st);
      case 'tax': a.coins += 3; log(st, `💰 ${nameOf(a.id)} cobrou impostos (+3).`); ev(st, { type: 'coins', pid: a.id, n: 3 }); return endTurn(st);
      case 'steal': {
        if (!t || t.out) return endTurn(st);
        const n = Math.min(2, t.coins); t.coins -= n; a.coins += n;
        log(st, `🏴‍☠️ ${nameOf(a.id)} extorquiu ${n} moeda${n === 1 ? '' : 's'} de ${nameOf(t.id)}.`); ev(st, { type: 'steal', pid: a.id, from: t.id, n });
        return endTurn(st);
      }
      case 'assassinate':
        if (!t || t.out) return endTurn(st);
        log(st, `🗡️ O assassinato de ${nameOf(t.id)} foi bem-sucedido.`); ev(st, { type: 'assassinated', pid: t.id });
        return loseInfluence(st, t.id, 'assassinato', { do: 'endTurn' });
      case 'coup':
        if (!t || t.out) return endTurn(st);
        log(st, `💥 Golpe de ${nameOf(a.id)} contra ${nameOf(t.id)}!`); ev(st, { type: 'coup', pid: a.id, target: t.id });
        return loseInfluence(st, t.id, 'golpe', { do: 'endTurn' });
      case 'exchange': case 'exchange1': {
        const draw = P.type === 'exchange' ? 2 : 1;
        const hand = a.cards.filter(c => !c.up).map(c => c.role), drawn = st.deck.splice(-draw, draw);
        st.exch = { pid: a.id, options: [...hand, ...drawn], keep: hand.length };
        st.phase = 'exchange'; st.deadline = Date.now() + st.respondMs * 2;
        log(st, `🔁 ${nameOf(a.id)} está trocando cartas com a Corte.`); ev(st, { type: 'exchangeStart', pid: a.id });
        return;
      }
      case 'investigate':
        if (!t || t.out) return endTurn(st);
        st.inv = { by: a.id, target: t.id, stage: 'show' }; st.phase = 'investigate'; st.deadline = Date.now() + st.respondMs * 2;
        log(st, `🔍 ${nameOf(a.id)} investiga ${nameOf(t.id)}: ele escolhe uma carta para mostrar.`);
        return;
    }
    endTurn(st);
  }

  function endTurn(st) {
    if (st.result) return;
    st.P = null; st.lose = null; st.exch = null; st.inv = null; st.deadline = 0;
    let i = st.turn;
    for (let k = 0; k < st.players.length; k++) { i = (i + 1) % st.players.length; if (!st.players[i].out) break; }
    st.turn = i; st.phase = 'action';
    const p = st.players[i];
    if (p.coins >= 10) log(st, `⚠️ ${nameOf(p.id)} começa com ${p.coins} moedas: é obrigado a dar um Golpe.`);
    ev(st, { type: 'turn', pid: p.id });
  }

  // ---------- ações dos jogadores ----------
  function act(st, pid, a) {
    if (st.result) return 'A partida acabou.';
    const me = pl(st, pid); if (!me || me.out) return 'Você está fora da corte.';
    switch (a.type) {
      case 'action': {
        if (st.phase !== 'action' || st.players[st.turn].id !== pid) return 'Não é sua vez.';
        const def = ACTIONS[a.action]; if (!def) return 'Ação desconhecida.';
        if ((a.action === 'exchange') !== (st.variant === 'diplomata') && ['exchange'].includes(a.action)) return 'Essa ação não existe nesta partida.';
        if (['exchange1', 'investigate'].includes(a.action) && st.variant !== 'confessor') return 'Essa ação não existe nesta partida.';
        if (me.coins >= 10 && a.action !== 'coup') return 'Com 10 ou mais moedas, o Golpe é obrigatório.';
        if (me.coins < def.cost) return `Precisa de ${def.cost} moedas.`;
        let target = null;
        if (def.target) { const t = pl(st, a.target); if (!t || t.out || t.id === pid) return 'Escolha um rival na corte.'; target = t.id; }
        me.coins -= def.cost;
        st.P = { type: a.action, actor: pid, target, claim: def.claim, cost: def.cost, block: null, passed: [], stage: null, id: ++st.seq };
        const tgt = target ? ` contra ${nameOf(target)}` : '';
        log(st, def.claim ? `🎭 ${nameOf(pid)} diz ser ${ROLES[def.claim].name}: ${def.name}${tgt}.` : `▶️ ${nameOf(pid)}: ${def.name}${tgt}.`);
        ev(st, { type: 'declare', pid, action: a.action, target, claim: def.claim });
        if (a.action === 'income' || a.action === 'coup') return execute(st), null;
        openWindow(st, 'claim');
        return null;
      }
      case 'pass': {
        if (st.phase !== 'respond' || !responders(st).includes(pid)) return 'Nada para responder.';
        st.P.passed.push(pid);
        if (!responders(st).length) closeWindow(st);
        return null;
      }
      case 'challenge': {
        const o = options(st, pid); if (!o.challenge) return 'Você não pode contestar agora.';
        const P = st.P;
        if (P.stage === 'claim') challenge(st, P.actor, P.claim, pid, { do: 'afterActionChallengeWon' }, { do: 'actionFailed' });
        else challenge(st, P.block.by, P.block.claim, pid, { do: 'blocked' }, { do: 'execute' });
        return null;
      }
      case 'block': {
        const o = options(st, pid); if (!o.block.includes(a.role)) return 'Você não pode bloquear assim.';
        st.P.block = { by: pid, claim: a.role };
        log(st, `🛡️ ${nameOf(pid)} diz ser ${ROLES[a.role].name} e bloqueia ${ACTIONS[st.P.type].name} de ${nameOf(st.P.actor)}.`);
        ev(st, { type: 'block', pid, role: a.role, actor: st.P.actor });
        openWindow(st, 'blockClaim');
        return null;
      }
      case 'lose': {
        if (st.phase !== 'lose' || st.lose?.pid !== pid) return 'Não é hora de perder influência.';
        const c = me.cards[a.idx]; if (!c || c.up) return 'Escolha uma carta sua virada para baixo.';
        const { reason, next } = st.lose; revealCard(st, me, a.idx, reason);
        return proceed(st, next), null;
      }
      case 'keep': { // troca: quais cartas ficar
        if (st.phase !== 'exchange' || st.exch?.pid !== pid) return 'Não é hora de trocar.';
        const ks = [...new Set(a.idx || [])];
        if (ks.length !== st.exch.keep || ks.some(i => i < 0 || i >= st.exch.options.length)) return `Escolha ${st.exch.keep} carta(s) para ficar.`;
        finishExchange(st, ks); return null;
      }
      case 'show': { // investigado escolhe a carta que mostra
        if (st.phase !== 'investigate' || st.inv?.target !== pid || st.inv.stage !== 'show') return 'Nada para mostrar.';
        const c = me.cards[a.idx]; if (!c || c.up) return 'Escolha uma carta virada para baixo.';
        st.inv.idx = a.idx; st.inv.role = c.role; st.inv.stage = 'decide'; st.deadline = Date.now() + st.respondMs * 2;
        log(st, `👁️ ${nameOf(pid)} mostrou uma carta a ${nameOf(st.inv.by)}.`); return null;
      }
      case 'verdict': { // Confessor: devolve a carta ou obriga a trocar
        if (st.phase !== 'investigate' || st.inv?.by !== pid || st.inv.stage !== 'decide') return 'Nada para decidir.';
        if (a.swap) {
          const t = pl(st, st.inv.target); st.deck.push(t.cards[st.inv.idx].role); shuffle(st.deck); t.cards[st.inv.idx] = { role: st.deck.pop(), up: false };
          log(st, `🔁 ${nameOf(pid)} obrigou ${nameOf(t.id)} a trocar a carta mostrada.`);
        } else log(st, `🤝 ${nameOf(pid)} devolveu a carta a ${nameOf(st.inv.target)}.`);
        endTurn(st); return null;
      }
    }
    return 'Ação desconhecida.';
  }

  function finishExchange(st, keepIdx) {
    const a = pl(st, st.exch.pid), opts = st.exch.options;
    const kept = keepIdx.map(i => opts[i]), back = opts.filter((_, i) => !keepIdx.includes(i));
    let k = 0; for (const c of a.cards) if (!c.up) c.role = kept[k++];
    st.deck.push(...back); shuffle(st.deck);
    log(st, `🔁 ${nameOf(a.id)} terminou a troca e devolveu ${back.length} carta${back.length === 1 ? '' : 's'} à Corte.`);
    ev(st, { type: 'exchanged', pid: a.id });
    endTurn(st);
  }

  // quando ninguém mais quer reagir
  function closeWindow(st) {
    const P = st.P;
    if (P.stage === 'claim' || P.stage === 'blockOnly') return execute(st);
    if (P.stage === 'blockClaim') return proceed(st, { do: 'blocked' });
  }

  // tempo esgotado: quem não reagiu passou; em escolhas pessoais, o jogo escolhe por ele
  function timeout(st) {
    if (!st.deadline || Date.now() < st.deadline - 50 || st.result) return false;
    if (st.phase === 'respond') { st.P.passed.push(...responders(st)); closeWindow(st); return true; }
    if (st.phase === 'lose') { const p = pl(st, st.lose.pid); const i = worstCard(p); const { reason, next } = st.lose; revealCard(st, p, i, reason); proceed(st, next); return true; }
    if (st.phase === 'exchange') { finishExchange(st, bestKeep(st.exch.options, st.exch.keep)); return true; }
    if (st.phase === 'investigate') {
      if (st.inv.stage === 'show') { const t = pl(st, st.inv.target), i = worstCard(t); st.inv.idx = i; st.inv.role = t.cards[i].role; st.inv.stage = 'decide'; st.deadline = Date.now() + st.respondMs; return true; }
      endTurn(st); return true;
    }
    return false;
  }

  // ---------- bots ----------
  const VALUE = { tesoureiro: 5, sicario: 4, guarda: 3.5, corsario: 3, confessor: 2.5, diplomata: 2 };
  function worstCard(p) { const h = p.cards.map((c, i) => [c, i]).filter(([c]) => !c.up); h.sort((a, b) => (VALUE[a[0].role] || 0) - (VALUE[b[0].role] || 0)); return h[0][1]; }
  function bestKeep(opts, n) { return opts.map((r, i) => [r, i]).sort((a, b) => (VALUE[b[0]] || 0) - (VALUE[a[0]] || 0)).slice(0, n).map(x => x[1]); }
  // quantas cópias de um personagem o bot SABE que não podem estar com o outro
  function knownCopies(st, me, role) { return me.cards.filter(c => !c.up && c.role === role).length + st.players.reduce((s, p) => s + p.cards.filter(c => c.up && c.role === role).length, 0); }
  const copiesOf = st => st.players.length <= 6 ? 3 : st.players.length <= 8 ? 4 : 5;
  const has = (p, role) => p.cards.some(c => !c.up && c.role === role);

  function botAction(st, pid) {
    const me = pl(st, pid); if (!me || me.out || st.result) return null;
    if (st.phase === 'lose' && st.lose.pid === pid) return { type: 'lose', idx: worstCard(me) };
    if (st.phase === 'exchange' && st.exch?.pid === pid) return { type: 'keep', idx: bestKeep(st.exch.options, st.exch.keep) };
    if (st.phase === 'investigate') {
      if (st.inv.target === pid && st.inv.stage === 'show') return { type: 'show', idx: worstCard(me) };
      if (st.inv.by === pid && st.inv.stage === 'decide') return { type: 'verdict', swap: (VALUE[st.inv.role] || 0) >= 3.5 };
      return null;
    }
    if (st.phase === 'respond') {
      const o = options(st, pid); if (!o.challenge && !o.block.length) return null;
      const P = st.P;
      const claimed = P.stage === 'blockClaim' ? P.block.claim : P.claim, claimant = P.stage === 'blockClaim' ? P.block.by : P.actor;
      // contesta quando sabe que é mentira (todas as cópias estão à vista ou na própria mão)
      if (o.challenge && claimed && knownCopies(st, me, claimed) >= copiesOf(st)) return { type: 'challenge' };
      if (o.block.length) {
        const mine = o.block.find(r => has(me, r));
        if (mine) return { type: 'block', role: mine };
        if (P.type === 'assassinate' && P.target === pid) {
          if (influence(me) === 1) return Math.random() < .55 ? { type: 'block', role: 'guarda' } : (o.challenge ? { type: 'challenge' } : { type: 'pass' });
          if (Math.random() < .25) return { type: 'block', role: 'guarda' };
        }
        if (P.type === 'steal' && Math.random() < .18) return { type: 'block', role: o.block[rnd(o.block.length)] };
      }
      // às vezes desconfia (mais quando o alvo é ele, ou quando a ação é de quem tem muitas moedas)
      if (o.challenge) {
        const vsMe = P.target === pid || (P.stage === 'blockClaim' && P.actor === pid);
        const chance = (vsMe ? .14 : .05) + (claimant && pl(st, claimant).coins >= 6 ? .05 : 0);
        if (Math.random() < chance && influence(me) === 2) return { type: 'challenge' };
      }
      return { type: 'pass' };
    }
    if (st.phase !== 'action' || st.players[st.turn].id !== pid) return null;
    const rivals = alive(st).filter(p => p.id !== pid);
    const threat = [...rivals].sort((a, b) => influence(b) * 10 + b.coins - (influence(a) * 10 + a.coins))[0];
    if (me.coins >= 10 || (me.coins >= 7 && Math.random() < .8)) return { type: 'action', action: 'coup', target: threat.id };
    if (has(me, 'sicario') && me.coins >= 3 && !(st.blockedMemo?.[pid]?.type === 'assassinate' && st.blockedMemo[pid].target === threat.id)) return { type: 'action', action: 'assassinate', target: threat.id };
    if (has(me, 'tesoureiro')) return { type: 'action', action: 'tax' };
    // não repete a ação que acabou de ser bloqueada contra o mesmo alvo
    const memo = st.blockedMemo?.[pid], wasBlocked = (type, target) => memo && memo.type === type && (!target || memo.target === target);
    const rich = [...rivals].filter(p => !wasBlocked('steal', p.id)).sort((a, b) => b.coins - a.coins)[0];
    if (has(me, 'corsario') && rich && rich.coins >= 2) return { type: 'action', action: 'steal', target: rich.id };
    if (st.variant === 'diplomata' && has(me, 'diplomata') && Math.random() < .4) return { type: 'action', action: 'exchange' };
    if (st.variant === 'confessor' && has(me, 'confessor') && Math.random() < .4) return { type: 'action', action: 'exchange1' };
    const r = Math.random();
    if (r < .22) return { type: 'action', action: 'tax' }; // blefe
    if (r < .3 && me.coins >= 3) return { type: 'action', action: 'assassinate', target: threat.id }; // blefe
    return { type: 'action', action: r < .65 && !wasBlocked('aid') ? 'aid' : 'income' };
  }
  const botDelay = a => (a.type === 'pass' ? 350 + rnd(450) : a.type === 'action' ? 1400 : 1500);

  return { ROLES, ACTIONS, newGame, act, viewFor, timeout, botAction, botDelay, options, responders, influence, roleSet, blockRoles, setNameResolver: f => (nameOf = f) };
})();
