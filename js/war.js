// ===== Supremacia: motor de regras (roda somente no anfitrião) =====
// Jogo de estratégia e conquista de territórios com as regras clássicas: objetivos secretos, recebimento de
// exércitos (territórios ÷ 2, mínimo 3, + bônus de continente, + troca de cartas), ataques com até 3 dados contra
// até 3 dados (empate é da defesa), conquista, deslocamentos e carta de território por jogada com conquista.
const War = (() => {
  const rnd = n => Math.floor(Math.random() * n);
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  let nameOf = id => id;
  const emptyBattleStats = () => ({ attacks: 0, defenses: 0, diceWins: 0, diceLosses: 0, conquests: 0 });

  // ---------- dados fixos ----------
  const M = WAR_MAP, TERR = M.territories.map(t => t.id), TI = Object.fromEntries(TERR.map((t, i) => [t, i]));
  const ADJ = M.adj, CONT = M.continents, CONTS = Object.keys(CONT);
  const contOf = Object.fromEntries(M.territories.map(t => [t.id, t.cont]));
  const terrName = Object.fromEntries(M.territories.map(t => [t.id, t.name]));
  const inCont = Object.fromEntries(CONTS.map(c => [c, TERR.filter(t => contOf[t] === c)]));
  // as 6 cores de exército
  const COLORS = [
    { id: 'branco', name: 'Branco', hex: '#faf6e9' }, { id: 'vermelho', name: 'Vermelho', hex: '#e43b32' },
    { id: 'preto', name: 'Preto', hex: '#30323c' }, { id: 'azul', name: 'Azul', hex: '#287df0' },
    { id: 'amarelo', name: 'Amarelo', hex: '#ffd039' }, { id: 'verde', name: 'Verde', hex: '#37ad50' },
  ];
  // cartas: uma por território (figura: círculo, quadrado ou triângulo, 14 de cada) + 2 curingas
  const SHAPES = ['circulo', 'quadrado', 'triangulo'];
  const CARDS = [...TERR.map((t, i) => ({ id: i, terr: t, shape: SHAPES[i % 3] })), { id: 42, terr: null, shape: 'curinga' }, { id: 43, terr: null, shape: 'curinga' }];
  // TABELA II: exércitos por troca (sequência de todas as trocas do jogo)
  const tradeValue = n => (n < 5 ? 4 + 2 * n : 15 + 5 * (n - 5));
  // os 14 objetivos
  const OBJECTIVES = [
    { id: 0, kind: 'conts', conts: ['eu', 'oc'], plus: 1, text: 'Conquistar na totalidade a EUROPA, a OCEANIA e mais um terceiro continente à sua escolha.' },
    { id: 1, kind: 'conts', conts: ['as', 'sa'], text: 'Conquistar na totalidade a ÁSIA e a AMÉRICA DO SUL.' },
    { id: 2, kind: 'conts', conts: ['eu', 'sa'], plus: 1, text: 'Conquistar na totalidade a EUROPA, a AMÉRICA DO SUL e mais um terceiro continente à sua escolha.' },
    { id: 3, kind: 'terr', n: 18, min: 2, text: 'Conquistar 18 TERRITÓRIOS e ocupar cada um deles com pelo menos dois exércitos.' },
    { id: 4, kind: 'conts', conts: ['as', 'af'], text: 'Conquistar na totalidade a ÁSIA e a ÁFRICA.' },
    { id: 5, kind: 'conts', conts: ['na', 'af'], text: 'Conquistar na totalidade a AMÉRICA DO NORTE e a ÁFRICA.' },
    { id: 6, kind: 'terr', n: 24, min: 1, text: 'Conquistar 24 TERRITÓRIOS à sua escolha.' },
    { id: 7, kind: 'conts', conts: ['na', 'oc'], text: 'Conquistar na totalidade a AMÉRICA DO NORTE e a OCEANIA.' },
    ...['azul', 'amarelo', 'vermelho', 'preto', 'branco', 'verde'].map((c, k) => ({ id: 8 + k, kind: 'destroy', color: c,
      text: `Destruir totalmente os exércitos ${COLORS.find(x => x.id === c).name.toUpperCase()}S. Se eles já foram destruídos por outro jogador, ou se você é o próprio exército ${COLORS.find(x => x.id === c).name.toLowerCase()}, o seu objetivo passa a ser conquistar 24 territórios.` })),
  ];
  const FALLBACK = 6; // "conquistar 24 territórios"

  // ---------- utilidades ----------
  const pl = (st, id) => st.players.find(p => p.id === id);
  const cur = st => st.players[st.turn];
  const owned = (st, pid) => TERR.filter(t => st.owner[t] === pid);
  const ownsCont = (st, pid, c) => inCont[c].every(t => st.owner[t] === pid);
  const alive = st => st.players.filter(p => !p.out);
  const enemyNeighbors = (st, t) => ADJ[t].filter(n => st.owner[n] !== st.owner[t]);
  function log(st, msg) { st.log.push({ t: Date.now(), msg }); if (st.log.length > 160) st.log.shift(); }
  function ev(st, e) {
    // Cada animação leva seu próprio resultado público. A tela nunca precisa aplicar
    // o estado de uma batalha futura ao terminar uma rolagem anterior.
    const ids = ['battle', 'move', 'occupy'].includes(e.type) ? [e.from, e.to] : [];
    const after = Object.fromEntries(ids.map(id => [id, {
      owner: e.type === 'battle' && e.conquered && id === e.to ? e.att : st.owner[id], armies: st.armies[id],
    }]));
    st.ev = { ...e, ...(ids.length ? { after } : {}), at: Date.now(), n: (st.ev?.n || 0) + 1 };
    st.evs = [...(st.evs || []), st.ev].slice(-40);
  }
  const colorName = c => COLORS.find(x => x.id === c)?.name || c;

  // objetivo efetivo (o de destruir vira 24 territórios quando não dá mais para cumprir)
  function objectiveOf(st, p) {
    const o = OBJECTIVES[p.obj];
    if (o.kind !== 'destroy') return o;
    const target = st.players.find(q => q.color === o.color);
    if (!target || target.id === p.id || (target.out && target.outBy !== p.id)) return { ...OBJECTIVES[FALLBACK], from: o.id };
    return o;
  }
  function achieved(st, p) {
    const o = objectiveOf(st, p);
    if (o.kind === 'destroy') { const t = st.players.find(q => q.color === o.color); return !!(t && t.out && t.outBy === p.id); }
    if (o.kind === 'terr') return owned(st, p.id).filter(t => st.armies[t] >= o.min).length >= o.n;
    if (!o.conts.every(c => ownsCont(st, p.id, c))) return false;
    return !o.plus || CONTS.some(c => !o.conts.includes(c) && ownsCont(st, p.id, c));
  }

  // ---------- preparação ----------
  function newGame(room) {
    const s = room.settings;
    // cada jogador com a cor escolhida no lobby (seat = índice da cor); quem não escolheu fica com uma livre
    const used = new Set(room.players.map(p => p.seat).filter(v => v != null));
    const players = room.players.map(p => {
      let c = p.seat; if (c == null || c < 0 || c > 5) { c = [0, 1, 2, 3, 4, 5].find(i => !used.has(i)); used.add(c); }
      return { id: p.id, color: COLORS[c].id, cards: [], out: false, obj: null, battleStats: emptyBattleStats() };
    });
    const st = {
      gameId: 'w' + Date.now().toString(36) + rnd(1e6).toString(36),
      players: shuffle(players), owner: {}, armies: {}, deck: [], used: [], trades: 0,
      turn: 0, round: 1, phase: 'place', pool: null, conquered: false, occupy: null, moved: {},
      turnMs: (s.turnSec ?? 120) * 1000, deadline: 0, afk: null,
      log: [], ev: { n: 0 }, evs: [], result: null, seq: 0, lastBattle: null,
    };
    // objetivos: tira os de destruir cores que não estão na partida
    const colorsIn = new Set(st.players.map(p => p.color));
    const objs = shuffle(OBJECTIVES.filter(o => o.kind !== 'destroy' || colorsIn.has(o.color)).map(o => o.id));
    st.players.forEach(p => { p.obj = objs.pop(); });
    // sorteio dos territórios: cartas sem curingas, distribuídas em sentido horário
    const deal = shuffle(TERR.slice()); let k = 0;
    deal.forEach(t => { st.owner[t] = st.players[k].id; st.armies[t] = 1; k = (k + 1) % st.players.length; });
    st.turn = k % st.players.length; // começa quem vem depois de quem recebeu a última carta
    st.deck = shuffle(CARDS.map(c => c.id));
    log(st, `🌍 A guerra começou! ${st.players.length} exércitos, ${TERR.length} territórios sorteados. Cada um recebeu um objetivo secreto.`);
    startTurn(st);
    return st;
  }

  // ---------- turno ----------
  function startTurn(st) {
    const p = cur(st);
    st.phase = 'place'; st.conquered = false; st.occupy = null; st.moved = {}; st.lastBattle = null;
    const n = owned(st, p.id).length;
    const pool = { free: Math.max(3, Math.floor(n / 2)), cont: {} };
    for (const c of CONTS) if (ownsCont(st, p.id, c)) pool.cont[c] = CONT[c].bonus;
    st.pool = pool;
    arm(st, true);
    const extra = Object.entries(pool.cont).map(([c, v]) => `+${v} da ${CONT[c].name}`).join(', ');
    log(st, `➡️ Vez de ${nameOf(p.id)} (${colorName(p.color)}): recebe ${pool.free} exércitos${extra ? ' ' + extra : ''}${p.cards.length >= 5 ? ' — precisa trocar cartas' : ''}.`);
    ev(st, { type: 'turn', pid: p.id, round: st.round });
  }
  const poolTotal = pool => pool ? pool.free + Object.values(pool.cont).reduce((a, b) => a + b, 0) : 0;
  function nextTurn(st) {
    const p = cur(st);
    // carta de território: uma por jogada, se conquistou pelo menos um território
    if (st.conquered) {
      const c = drawCard(st); if (c != null) { p.cards.push(c); ev(st, { type: 'card', pid: p.id }); log(st, `🃏 ${nameOf(p.id)} conquistou território e recebeu uma carta.`); }
    }
    let i = st.turn;
    do { i = (i + 1) % st.players.length; if (i === 0) st.round++; } while (st.players[i].out);
    st.turn = i; startTurn(st);
  }
  function drawCard(st) {
    if (!st.deck.length) { st.deck = shuffle(st.used); st.used = []; if (st.deck.length) log(st, '🔁 O monte de cartas acabou: as cartas trocadas foram embaralhadas de novo.'); }
    return st.deck.length ? st.deck.pop() : null;
  }
  // relógio da vez: cada ação de quem joga reinicia; quando zera, o jogo joga por ele
  function arm(st, fresh, auto) {
    if (!st.turnMs || st.result) { st.deadline = 0; return; }
    if (fresh) st.afk = null;
    st.deadline = Date.now() + (auto ? 900 : st.turnMs);
  }

  // ---------- troca de cartas ----------
  function validSet(cards) {
    if (![3, 5].includes(cards.length) || new Set(cards).size !== cards.length || !cards.every(id => CARDS[id])) return false;
    const sh = cards.map(id => CARDS[id].shape);
    if (cards.length === 5) return sh[0] !== 'curinga' && sh.every(s => s === sh[0]);
    const j = sh.filter(s => s === 'curinga').length, rest = sh.filter(s => s !== 'curinga');
    if (j >= 2) return true;
    const uniq = new Set(rest).size;
    return uniq === 1 || uniq === rest.length; // iguais ou todas diferentes (o curinga completa)
  }
  function tradeReward(trades, cards = []) {
    const base = tradeValue(trades), selected = cards.map(id => CARDS[id]);
    const first = selected[0];
    const sameContinent = selected.length === 3 && new Set(cards).size === 3 && first?.terr
      && selected.every(c => c?.terr && c.shape === first.shape && contOf[c.terr] === contOf[first.terr]);
    const continent = sameContinent ? contOf[first.terr] : null;
    const bonus = cards.length === 5 && validSet(cards) ? base : continent ? Math.floor(base / 2) : 0;
    return { base, bonus, total: base + bonus, continent };
  }
  function bestSet(p, st) {
    const c = p.cards; let best = null, bestScore = -Infinity;
    function choose(size, start = 0, picked = []) {
      if (picked.length === size) {
        if (!validSet(picked)) return;
        const score = tradeReward(st.trades, picked).bonus + picked.filter(id => CARDS[id].terr && st.owner[CARDS[id].terr] === p.id).length * 2 - picked.filter(id => CARDS[id].shape === 'curinga').length;
        if (score > bestScore) { best = picked; bestScore = score; }
        return;
      }
      for (let i = start; i <= c.length - (size - picked.length); i++) choose(size, i + 1, [...picked, c[i]]);
    }
    choose(3); choose(5);
    return best;
  }

  // ---------- batalha ----------
  const roll = n => Array.from({ length: n }, () => 1 + rnd(6)).sort((a, b) => b - a);
  function battle(st, from, to, n) {
    const att = st.owner[from], def = st.owner[to];
    const nd = Math.min(3, st.armies[to]);
    const a = roll(n), d = roll(nd); let lossA = 0, lossD = 0;
    for (let i = 0; i < Math.min(a.length, d.length); i++) { if (a[i] > d[i]) lossD++; else lossA++; }
    const ap = pl(st, att), dp = pl(st, def);
    if (!ap.battleStats || !dp.battleStats) st.statsPartial = true;
    const ats = ap.battleStats ||= emptyBattleStats(), dfs = dp.battleStats ||= emptyBattleStats();
    ats.attacks++; dfs.defenses++;
    ats.diceWins += lossD; ats.diceLosses += lossA;
    dfs.diceWins += lossA; dfs.diceLosses += lossD;
    st.armies[from] -= lossA; st.armies[to] -= lossD;
    const conquered = st.armies[to] === 0;
    st.lastBattle = { id: ++st.seq, from, to, a, d, lossA, lossD, conquered, att, def };
    ev(st, { type: 'battle', ...st.lastBattle });
    log(st, `⚔️ ${terrName[from]} → ${terrName[to]}: ataque [${a.join(' ')}] × defesa [${d.join(' ')}] — ataque perde ${lossA}, defesa perde ${lossD}.`);
    if (conquered) {
      ats.conquests++;
      st.owner[to] = att; st.conquered = true;
      st.occupy = { from, to, max: Math.min(n - lossA, st.armies[from] - 1) };
      st.occupy.max = Math.max(1, st.occupy.max);
      log(st, `🏴 ${nameOf(att)} conquistou ${terrName[to]}!`);
      ev(st, { type: 'conquer', pid: att, from, to, def });
      const dp = pl(st, def);
      if (!owned(st, def).length) eliminate(st, dp, pl(st, att));
    }
  }
  function eliminate(st, dead, killer) {
    dead.out = true; dead.outBy = killer.id;
    log(st, `💀 Os exércitos ${colorName(dead.color).toLowerCase()}s de ${nameOf(dead.id)} foram destruídos por ${nameOf(killer.id)}!`);
    ev(st, { type: 'eliminated', pid: dead.id, by: killer.id });
    // quem destrói recebe as cartas do eliminado (se passar de 5, sorteia até completar 5)
    if (!achieved(st, killer)) {
      const got = shuffle(dead.cards.splice(0));
      const room = Math.max(0, 5 - killer.cards.length);
      killer.cards.push(...got.slice(0, room)); st.used.push(...got.slice(room));
      if (got.length) log(st, `🃏 ${nameOf(killer.id)} ficou com ${Math.min(room, got.length)} carta${Math.min(room, got.length) === 1 ? '' : 's'} de ${nameOf(dead.id)}.`);
    }
  }
  function checkWin(st) {
    if (st.result) return true;
    const order = [cur(st), ...st.players.filter(p => p !== cur(st))].filter(p => !p.out);
    for (const p of order) if (achieved(st, p)) {
      const o = objectiveOf(st, p);
      st.result = { winner: p.id, obj: o.id, text: o.text, ranking: rankAll(st, p.id) };
      st.phase = 'done'; st.deadline = 0; st.endAt = Date.now();
      log(st, `🏆 ${nameOf(p.id)} cumpriu o objetivo e venceu: "${o.text}"`);
      ev(st, { type: 'win', pid: p.id, obj: o.id });
      return true;
    }
    if (alive(st).length === 1) { // segurança: sobrou um só
      const p = alive(st)[0]; st.result = { winner: p.id, obj: p.obj, text: 'Último exército de pé.', ranking: rankAll(st, p.id) }; st.phase = 'done'; st.deadline = 0; return true;
    }
    return false;
  }
  function rankAll(st, winner) {
    return [...st.players].map(p => ({ id: p.id, worth: owned(st, p.id).length, armies: owned(st, p.id).reduce((s, t) => s + st.armies[t], 0), battleStats: { ...(p.battleStats || emptyBattleStats()) } }))
      .sort((a, b) => (b.id === winner) - (a.id === winner) || b.worth - a.worth || b.armies - a.armies);
  }

  // ---------- ações ----------
  function act(st, pid, a) {
    const err = actInner(st, pid, a);
    if (!err && !st.result) { checkWin(st); if (!st.result && cur(st).id === pid) arm(st, false, a.auto); }
    if (!err && !a.auto && cur(st)?.id === pid) st.afk = null;
    return err;
  }
  function actInner(st, pid, a) {
    if (st.result) return 'A partida acabou.';
    const p = pl(st, pid); if (!p || p.out) return 'Você não está jogando.';
    if (cur(st).id !== pid) return 'Não é sua vez.';
    switch (a.type) {
      case 'trade': {
        if (st.phase !== 'place') return 'Só dá para trocar cartas no começo da vez, antes de colocar os exércitos.';
        const cards = (a.cards || []).map(Number);
        if (![3, 5].includes(cards.length) || new Set(cards).size !== cards.length || !cards.every(c => p.cards.includes(c))) return 'Escolha 3 ou 5 cartas suas.';
        if (!validSet(cards)) return 'Troque 3 figuras iguais ou diferentes, ou 5 cartas com o mesmo símbolo (sem curingas).';
        const reward = tradeReward(st.trades, cards), v = reward.total; st.trades++;
        p.cards = p.cards.filter(c => !cards.includes(c)); st.used.push(...cards);
        st.pool.free += v;
        const bonus = [];
        for (const c of cards) { const t = CARDS[c].terr; if (t && st.owner[t] === pid) { st.armies[t] += 2; bonus.push(t); } }
        const fiveCardBonus = cards.length === 5 ? reward.bonus : 0;
        log(st, `🃏 ${nameOf(pid)} fez a ${st.trades}ª troca do jogo: +${v} exércitos${fiveCardBonus ? ` (${reward.base} × 2 por cinco símbolos iguais)` : reward.bonus ? ` (${reward.base} + ${reward.bonus} de bônus continental de 50%)` : ''}${bonus.length ? ` e +2 em ${bonus.map(t => terrName[t]).join(', ')}` : ''}.`);
        ev(st, { type: 'trade', pid, value: v, baseValue: reward.base, continentalBonus: reward.continent ? reward.bonus : 0, fiveCardBonus, continent: reward.continent, bonus, cards });
        return null;
      }
      case 'place': {
        if (st.phase !== 'place') return 'Não é hora de colocar exércitos.';
        if (p.cards.length >= 5) return 'Você tem 5 cartas: faça uma troca de 3 ou 5 antes de colocar exércitos.';
        const t = a.t, n = Math.max(1, a.n | 0);
        if (st.owner[t] !== pid) return 'Coloque exércitos só nos seus territórios.';
        const c = contOf[t], fromCont = Math.min(n, st.pool.cont[c] || 0), fromFree = n - fromCont;
        if (fromFree > st.pool.free) return st.pool.free === 0 && poolTotal(st.pool) ? `Os exércitos que sobraram são do bônus de continente: coloque-os em ${Object.keys(st.pool.cont).filter(k => st.pool.cont[k]).map(k => CONT[k].name).join(', ')}.` : 'Você não tem tantos exércitos para colocar.';
        if (fromCont) { st.pool.cont[c] -= fromCont; if (!st.pool.cont[c]) delete st.pool.cont[c]; }
        st.pool.free -= fromFree; st.armies[t] += n;
        ev(st, { type: 'place', pid, t, count: n });
        if (!poolTotal(st.pool)) {
          // primeira rodada: só distribui; depois, vai para os ataques
          if (st.round === 1) { log(st, `🪖 ${nameOf(pid)} posicionou seus exércitos.`); nextTurn(st); }
          else st.phase = 'attack';
        }
        return null;
      }
      case 'attack': {
        if (st.phase !== 'attack') return st.phase === 'place' ? 'Coloque todos os exércitos antes de atacar.' : 'Não é hora de atacar.';
        if (st.occupy) return 'Primeiro mova os exércitos para o território conquistado.';
        const { from, to } = a, n = a.n | 0;
        if (st.owner[from] !== pid) return 'Ataque a partir de um território seu.';
        if (!ADJ[from]?.includes(to)) return 'Só dá para atacar territórios vizinhos.';
        if (st.owner[to] === pid) return 'Esse território já é seu.';
        if (st.armies[from] < 2) return 'São necessários pelo menos 2 exércitos no território de onde parte o ataque.';
        if (n < 1 || n > 3 || n > st.armies[from] - 1) return `Ataque com 1 a ${Math.min(3, st.armies[from] - 1)} exércitos.`;
        battle(st, from, to, n);
        return null;
      }
      case 'occupy': {
        const o = st.occupy; if (!o) return 'Nada para ocupar.';
        const n = Math.max(1, Math.min(o.max, a.n | 0 || o.max));
        st.armies[o.from] -= n; st.armies[o.to] += n; st.occupy = null;
        ev(st, { type: 'occupy', pid, from: o.from, to: o.to, count: n });
        return null;
      }
      case 'endAttack': {
        if (st.phase !== 'attack') return 'Não é hora disso.';
        if (st.occupy) return 'Primeiro mova os exércitos para o território conquistado.';
        st.phase = 'move'; return null;
      }
      case 'move': {
        if (st.phase === 'attack' && !st.occupy) st.phase = 'move';
        if (st.phase !== 'move') return 'Os deslocamentos são feitos depois dos ataques.';
        const { from, to } = a, n = Math.max(1, a.n | 0);
        if (st.owner[from] !== pid || st.owner[to] !== pid) return 'Desloque entre territórios seus.';
        if (!ADJ[from].includes(to)) return 'Só para territórios vizinhos.';
        const free = st.armies[from] - 1 - (st.moved[from] || 0);
        if (n > free) return free > 0 ? `Daqui só podem sair ${free} exército${free > 1 ? 's' : ''} (um fica de ocupação e quem já se deslocou não se move de novo).` : 'Nenhum exército pode sair daqui (um fica de ocupação e quem já se deslocou não se move de novo).';
        st.armies[from] -= n; st.armies[to] += n; st.moved[to] = (st.moved[to] || 0) + n;
        ev(st, { type: 'move', pid, from, to, count: n });
        return null;
      }
      case 'endTurn': {
        if (st.phase === 'place') return 'Coloque todos os seus exércitos primeiro.';
        if (st.occupy) return 'Primeiro mova os exércitos para o território conquistado.';
        nextTurn(st); return null;
      }
    }
    return 'Ação desconhecida.';
  }

  // ---------- visão de cada jogador: objetivo e cartas só do dono ----------
  function viewFor(st, pid) {
    const v = JSON.parse(JSON.stringify(st));
    v.deck = { count: st.deck.length }; v.used = { count: st.used.length };
    for (const p of v.players) {
      p.cardCount = p.cards.length;
      if (p.id !== pid && !st.result) { p.cards = []; p.obj = null; }
    }
    v.me = pid;
    return v;
  }

  // ---------- bots (e jogadores ausentes) ----------
  // continente-alvo: o do objetivo que estiver mais perto; senão o de melhor proporção
  function targetConts(st, p) {
    const o = objectiveOf(st, p), ratio = c => inCont[c].filter(t => st.owner[t] === p.id).length / inCont[c].length;
    if (o.kind === 'conts') {
      const list = [...o.conts]; if (o.plus) list.push(CONTS.filter(c => !o.conts.includes(c)).sort((a, b) => ratio(b) - ratio(a))[0]);
      return list.sort((a, b) => ratio(b) - ratio(a));
    }
    return CONTS.slice().sort((a, b) => ratio(b) - ratio(a) || CONT[a].bonus - CONT[b].bonus);
  }
  function scoreFront(st, p, t, goals) {
    const en = enemyNeighbors(st, t); if (!en.length) return -1;
    const o = objectiveOf(st, p), target = o.kind === 'destroy' ? st.players.find(q => q.color === o.color)?.id : null;
    let s = 0;
    for (const n of en) {
      const g = goals.indexOf(contOf[n]); s += g === 0 ? 4 : g === 1 ? 2.5 : g >= 0 ? 1.5 : .6;
      if (target && st.owner[n] === target) s += 3;
      s += Math.max(0, 3 - st.armies[n]) * .4;
    }
    if (goals.includes(contOf[t])) s += 1.5;
    return s - st.armies[t] * .05;
  }
  function botAction(st, pid) {
    if (st.result || cur(st).id !== pid) return null;
    const p = pl(st, pid), mine = owned(st, pid), goals = targetConts(st, p);
    if (st.occupy) return { type: 'occupy', n: st.occupy.max };
    if (st.phase === 'place') {
      const set = bestSet(p, st);
      if (set && (p.cards.length >= 5 || p.cards.length >= 3)) return { type: 'trade', cards: set };
      const contLeft = Object.keys(st.pool.cont).find(c => st.pool.cont[c]);
      const cand = contLeft ? mine.filter(t => contOf[t] === contLeft) : mine;
      let best = cand[0], bs = -Infinity;
      for (const t of cand) { const s = scoreFront(st, p, t, goals); if (s > bs) { bs = s; best = t; } }
      const n = contLeft && !st.pool.free ? st.pool.cont[contLeft] : contLeft ? st.pool.cont[contLeft] : Math.min(st.pool.free, Math.max(1, Math.ceil(st.pool.free / 2)));
      return { type: 'place', t: best, n };
    }
    if (st.phase === 'attack') {
      const o = objectiveOf(st, p), target = o.kind === 'destroy' ? st.players.find(q => q.color === o.color)?.id : null;
      let best = null, bs = 0;
      for (const f of mine) {
        if (st.armies[f] < 3) continue;
        for (const t of ADJ[f]) {
          if (st.owner[t] === pid) continue;
          const a = st.armies[f] - 1, d = st.armies[t];
          if (a < d + 1 && !(a >= 3 && d <= 2)) continue;
          let s = a / d + (goals.indexOf(contOf[t]) === 0 ? 1.5 : goals.includes(contOf[t]) ? .7 : 0) + (target && st.owner[t] === target ? 2 : 0);
          if (inCont[contOf[t]].every(x => x === t || st.owner[x] === pid)) s += 2; // fecha um continente
          if (s > bs) { bs = s; best = { type: 'attack', from: f, to: t, n: Math.min(3, a) }; }
        }
      }
      return best || { type: 'endAttack' };
    }
    if (st.phase === 'move') {
      // leva exércitos do interior para a fronteira mais próxima (um deslocamento por território)
      const dist = {}; const q = [];
      for (const t of mine) if (enemyNeighbors(st, t).length) { dist[t] = 0; q.push(t); }
      while (q.length) { const t = q.shift(); for (const n of ADJ[t]) if (st.owner[n] === pid && dist[n] == null) { dist[n] = dist[t] + 1; q.push(n); } }
      for (const f of mine) {
        const free = st.armies[f] - 1 - (st.moved[f] || 0);
        if (free < 1 || !dist[f]) continue;
        const to = ADJ[f].filter(n => st.owner[n] === pid && dist[n] != null && dist[n] < dist[f])[0];
        if (to) return { type: 'move', from: f, to, n: free };
      }
      return { type: 'endTurn' };
    }
    return null;
  }
  function botDelay(a, st) {
    const base = a.type === 'place' ? 450 : a.type === 'attack' ? 1500 : a.type === 'trade' ? 900 : 700;
    const visual = st?.evs?.slice().reverse().find(e => ['battle', 'move', 'occupy'].includes(e.type));
    return Math.max(base, (visual?.at || 0) + (visual?.type === 'battle' ? 4000 : 1000) - Date.now());
  }
  // tempo esgotado: o jogo joga o mínimo pelo ausente (coloca os exércitos, não ataca, passa a vez)
  function idleAction(st, pid) {
    if (st.occupy) return { type: 'occupy', n: st.occupy.max };
    if (st.phase === 'place') return botAction(st, pid);
    if (st.phase === 'attack') return { type: 'endAttack' };
    return { type: 'endTurn' };
  }
  function timeout(st) {
    if (!st.turnMs || !st.deadline || st.result || Date.now() < st.deadline - 50) return false;
    const p = cur(st);
    if (st.afk !== p.id) { st.afk = p.id; log(st, `⏰ ${nameOf(p.id)} ficou sem tempo — jogada automática.`); }
    const err = act(st, p.id, { ...idleAction(st, p.id), auto: true });
    if (err) st.deadline = Date.now() + 3000;
    return true;
  }

  return {
    COLORS, CARDS, OBJECTIVES, SHAPES, newGame, act, viewFor, botAction, botDelay, timeout, objectiveOf, achieved, tradeValue, tradeReward, validSet,
    owned, ownsCont, contOf, terrName, inCont, poolTotal, setNameResolver: f => (nameOf = f),
  };
})();
