// ===== Vida Adulta: motor de regras (roda somente no anfitrião) =====
// Segue o manual do jogo de tabuleiro de roleta: salário por profissão, Dia do Pagamento, seguros, ações e Bolsa,
// notas promissórias, Vingança, Casamento, filhos, Pedágio, Dia de Sorte, apostas na roleta, cartões de riqueza,
// Dia do Juízo (Milionário ou Magnata) e contagem final.
const Vida = (() => {
  const P = VIDA_PRICES, B = VIDA_BOARD, SP = B.spaces;
  const rnd = n => Math.floor(Math.random() * n);
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const spin = () => 1 + rnd(10);
  let nameOf = id => id;
  const money = n => (n < 0 ? '−' : '') + '$' + Math.abs(n).toLocaleString('pt-BR');
  const CARD = { lucros: 'Dividindo os Lucros', despesa: 'Dividindo a Despesa', isencao: 'Cartão de Isenção' };
  const WINDOW_MS = 12000;

  const pl = (st, id) => st.players.find(p => p.id === id);
  const cur = st => st.players[st.turn];
  const active = p => p.status === 'playing';
  function log(st, msg) { st.log.push({ t: Date.now(), msg }); if (st.log.length > 200) st.log.shift(); }
  function ev(st, e) { st.ev = { ...e, n: (st.ev?.n || 0) + 1 }; st.evs = [...(st.evs || []), st.ev].slice(-40); }

  // ---------- dinheiro ----------
  function gain(st, p, amt, why) { p.money += amt; if (amt) ev(st, { type: 'money', pid: p.id, amount: amt, why }); }
  // pagar: se faltar dinheiro, pega notas promissórias automaticamente (exceto aposta e Vingança, onde é proibido)
  function pay(st, p, amt, why) {
    if (amt <= 0) return;
    if (p.money < amt && !p.retired) {
      const n = Math.ceil((amt - p.money) / P.noteGet); p.notes += n; p.money += n * P.noteGet;
      log(st, `📝 ${nameOf(p.id)} pegou ${n} nota${n > 1 ? 's' : ''} promissória${n > 1 ? 's' : ''} (${money(n * P.noteGet)}) no banco.`);
      ev(st, { type: 'note', pid: p.id, count: n });
    }
    p.money -= amt; ev(st, { type: 'money', pid: p.id, amount: -amt, why });
  }
  function transfer(st, from, to, amt, why) { pay(st, from, amt, why); gain(st, to, amt, why); }

  // ---------- preparação ----------
  function newGame(room) {
    const s = room.settings;
    const st = {
      gameId: 'v' + Date.now().toString(36) + rnd(1e6).toString(36),
      players: room.players.map(p => ({
        id: p.id, money: P.startCash, pos: B.start, path: null, prof: null, salary: 0, married: false, kids: 0, notes: 0,
        ins: { car: false, house: false, life: false }, stock: false, house: false, cards: [], unlock: { life: false, stock: false },
        status: 'playing', retired: false, lucky: null, stockNum: null, firstTurn: true,
      })),
      deck: shuffle([...Array(8).fill('lucros'), ...Array(8).fill('despesa'), ...Array(8).fill('isencao')]),
      turn: 0, round: 1, phase: 'start', q: [], pending: null, bets: {}, lastSpin: null,
      tollCross: [], millionFirst: null, bolsaReady: false, bolsaUsed: false,
      turnMs: (s.turnSec ?? 90) * 1000, deadline: 0, afk: null,
      log: [], ev: { n: 0 }, evs: [], result: null, seq: 0,
    };
    // cada um começa com $10.000 e um cartão de riqueza; quem tirar o maior número na roleta começa
    st.players.forEach(p => p.cards.push(st.deck.pop()));
    const rolls = st.players.map(p => ({ p, v: spin(), t: Math.random() })).sort((a, b) => b.v - a.v || b.t - a.t);
    log(st, `🎡 Começou a Vida Adulta! Cada um recebeu ${money(P.startCash)} e um cartão de riqueza. Na roleta: ${rolls.map(r => `${nameOf(r.p.id)} ${r.v}`).join(', ')}.`);
    st.players = rolls.map(r => r.p);
    startTurn(st);
    return st;
  }

  // ---------- turno ----------
  function startTurn(st) {
    st.phase = 'start'; st.q = []; st.pending = null; st.bets = {}; st.bolsaReady = false; st.bolsaUsed = false;
    const p = cur(st);
    if (p.firstTurn) st.pending = { type: 'path', pid: p.id, deadline: 0 };
    arm(st, true);
    log(st, `➡️ Vez de ${nameOf(p.id)}.`);
    ev(st, { type: 'turn', pid: p.id });
  }
  function endTurn(st) {
    if (st.result) return;
    if (finished(st)) return;
    let i = st.turn;
    for (let k = 0; k < st.players.length; k++) { i = (i + 1) % st.players.length; if (i === 0) st.round++; if (active(st.players[i])) break; }
    st.turn = i; startTurn(st);
  }
  function arm(st, fresh, auto) { if (fresh) st.afk = null; st.deadline = st.turnMs ? Date.now() + (auto ? 900 : st.turnMs) : 0; }

  // ---------- fila de passos (cada passo pode abrir uma decisão e pausar a fila) ----------
  function run(st) {
    while (!st.pending && !st.result && st.q.length) step(st, st.q.shift());
    if (!st.pending && !st.result && !st.q.length && st.phase === 'move') {
      // fim da jogada: oferece a Bolsa se passou/parou numa casa roxa com ação
      const p = cur(st);
      if (st.bolsaReady && !st.bolsaUsed && p.stock && active(p)) { st.pending = { type: 'bolsa', pid: p.id }; return; }
      endTurn(st);
    }
  }
  function step(st, s) {
    const p = pl(st, s.pid);
    switch (s.t) {
      case 'walk': return walk(st, p, s.left, s.free);
      case 'land': return land(st, p);
      case 'back': return goBack(st, p, s.n);
      case 'fn': return s.fn(st);
    }
  }
  const occupied = (st, node, p) => SP[node].type !== 'millionaire' && SP[node].type !== 'start' && st.players.some(q => q !== p && q.status !== 'bankrupt' && q.pos === node);
  const MANDATORY = (p, s) => (s.type === 'wedding' && !p.married) || (s.type === 'apartment' && !p.house) || s.type === 'juizo' || s.type === 'millionaire';

  // anda para frente casa a casa; aplica o que vale "ao passar"; para nas casas obrigatórias
  function walk(st, p, left, free) {
    let path = [];
    while (left > 0) {
      const s = SP[p.pos];
      let nxt;
      if (s.next.length === 0) break;
      if (s.next.length > 1) {
        if (s.id === B.start) nxt = p.path === 'fac' ? s.next[1] : s.next[0];
        else if (p.forkPick != null) nxt = s.next[p.forkPick];
        else { // bifurcação no meio do caminho: o jogador escolhe
          st.q.unshift({ t: 'walk', pid: p.id, left, free });
          st.pending = { type: 'fork', pid: p.id, options: s.next.map(n => SP[n].seg) };
          if (path.length) ev(st, { type: 'walk', pid: p.id, path });
          return;
        }
      } else nxt = s.next[0];
      p.pos = nxt; path.push(nxt); left--;
      const ns = SP[nxt];
      if (MANDATORY(p, ns)) { left = 0; break; }
      if (left > 0) passBy(st, p, ns);
    }
    p.forkPick = null;
    // casa ocupada: vai para a próxima livre
    while (occupied(st, p.pos, p) && SP[p.pos].next.length) {
      const s = SP[p.pos]; const nx = s.next.length > 1 ? s.next[0] : s.next[0];
      if (MANDATORY(p, SP[p.pos])) break;
      p.pos = nx; path.push(nx);
    }
    if (path.length) ev(st, { type: 'walk', pid: p.id, path });
    tollCheck(st, p);
    st.q.unshift({ t: 'land', pid: p.id });
  }
  // efeitos de passar por uma casa
  function passBy(st, p, s) {
    if (s.type === 'pay') payday(st, p, s, false);
    else if (s.type === 'lifeins' && !p.unlock.life) { p.unlock.life = true; log(st, `🛡️ ${nameOf(p.id)} pode comprar Seguro de Vida a partir de agora.`); }
    else if (s.type === 'stockbuy' && !p.unlock.stock) { p.unlock.stock = true; log(st, `📈 ${nameOf(p.id)} pode comprar uma ação a partir de agora.`); }
    else if (s.type === 'bolsa') st.bolsaReady = true;
    else if (s.type === 'toll') tollCheck(st, p, true);
  }
  // pedágio: quem atravessar primeiro cobra $24.000 de cada um que passar depois
  const tollNode = SP.find(s => s.type === 'toll').id;
  const beyondToll = p => SP[p.pos].d >= SP[tollNode].d && p.status !== 'bankrupt';
  function tollOwner(st) { return st.tollCross.map(id => pl(st, id)).find(q => q && q.status !== 'bankrupt' && beyondToll(q)) || null; }
  function tollCheck(st, p, passing) {
    if (!(passing || SP[p.pos].d >= SP[tollNode].d) || st.tollCross.includes(p.id) || SP[p.pos].d < SP[tollNode].d) return;
    const owner = tollOwner(st);
    st.tollCross.push(p.id);
    if (!owner) { log(st, `🚧 ${nameOf(p.id)} foi o primeiro a atravessar o Pedágio: agora cobra ${money(P.toll)} de quem passar depois!`); ev(st, { type: 'tollOwner', pid: p.id }); }
    else if (owner.id !== p.id) { transfer(st, p, owner, P.toll, 'pedágio'); log(st, `🚧 ${nameOf(p.id)} pagou ${money(P.toll)} de pedágio a ${nameOf(owner.id)}.`); ev(st, { type: 'toll', pid: p.id, to: owner.id }); }
  }
  function payday(st, p, s, landed) {
    if (p.salary) { gain(st, p, p.salary, 'salário'); log(st, `💵 Dia do Pagamento: ${nameOf(p.id)} recebeu ${money(p.salary)} de salário.`); }
    if (s.interest && p.notes) { pay(st, p, p.notes * P.noteInterest, 'juros'); log(st, `🧾 ${nameOf(p.id)} pagou ${money(p.notes * P.noteInterest)} de juros das notas promissórias.`); }
    ev(st, { type: 'payday', pid: p.id, salary: p.salary, landed });
    return p.salary;
  }

  // ---------- parar na casa ----------
  function land(st, p) {
    const s = SP[p.pos];
    ev(st, { type: 'land', pid: p.id, node: s.id, kind: s.type });
    switch (s.type) {
      case 'pay': {
        const got = payday(st, p, s, true);
        // parou exatamente: ganha um cartão de riqueza
        if (st.deck.length) { const c = st.deck.pop(); p.cards.push(c); log(st, `🃏 ${nameOf(p.id)} ganhou um cartão de riqueza.`); ev(st, { type: 'card', pid: p.id }); }
        if (got >= 10000) profitWindow(st, p, got);
        return;
      }
      case 'event': {
        if (s.amt > 0) { gain(st, p, s.amt, s.text); log(st, `🎉 ${nameOf(p.id)}: ${s.text}`); if (s.amt >= 10000) profitWindow(st, p, s.amt); }
        else if (s.amt < 0) {
          const cost = -s.amt;
          if (s.ins && p.ins[s.ins]) { log(st, `🛡️ ${nameOf(p.id)}: ${s.text} — o seguro pagou tudo!`); ev(st, { type: 'insured', pid: p.id, ins: s.ins }); }
          else { log(st, `💸 ${nameOf(p.id)}: ${s.text}`); expense(st, p, cost, s.text); }
        } else log(st, `😐 ${nameOf(p.id)}: ${s.text}`);
        return;
      }
      case 'prof': {
        if (!p.prof) { const pr = VIDA_PROFS[s.prof]; p.prof = s.prof; p.salary = pr.salary; log(st, `🎓 ${nameOf(p.id)} virou ${pr.name}! Salário: ${money(pr.salary)}.`); ev(st, { type: 'prof', pid: p.id, prof: s.prof }); }
        return;
      }
      case 'lifeins': if (!p.unlock.life) { p.unlock.life = true; log(st, `🛡️ ${nameOf(p.id)}: ${s.text} Pode comprar Seguro de Vida.`); } return;
      case 'stockbuy': if (!p.unlock.stock) { p.unlock.stock = true; log(st, `📈 ${nameOf(p.id)}: ${s.text} Pode comprar uma ação.`); } return;
      case 'bolsa': st.bolsaReady = true; return;
      case 'kid': {
        p.kids += s.n; const each = s.n === 2 ? 2000 : 1000;
        log(st, `👶 ${nameOf(p.id)}: ${s.text} Recebe ${money(each)} de cada adversário.`);
        for (const q of st.players) if (q !== p && q.status !== 'bankrupt') transfer(st, q, p, each, 'presente do bebê');
        ev(st, { type: 'kid', pid: p.id, n: s.n });
        return;
      }
      case 'vinganca': {
        if (!st.players.some(q => q !== p && q.status === 'playing')) { log(st, `😈 ${nameOf(p.id)} caiu na Vingança, mas não sobrou ninguém no caminho para se vingar.`); return; }
        st.pending = { type: 'vinganca', pid: p.id }; return;
      }
      case 'wedding': return wedding(st, p);
      case 'apartment': {
        if (!p.house) { p.house = true; log(st, `🏢 ${nameOf(p.id)} comprou um apartamento por ${money(P.apartment)} (agora pode fazer Seguro de Casa).`); ev(st, { type: 'apartment', pid: p.id }); expense(st, p, P.apartment, 'apartamento'); }
        return;
      }
      case 'toll': return;
      case 'sorte': {
        gain(st, p, P.sorte, 'Dia de Sorte'); log(st, `🍀 Dia de Sorte! ${nameOf(p.id)} ganhou ${money(P.sorte)} em duas notas de $10.000.`);
        ev(st, { type: 'sorte', pid: p.id });
        st.pending = { type: 'sorte', pid: p.id };
        return;
      }
      case 'juizo': return judgment(st, p);
      case 'millionaire': return millionaire(st, p);
    }
  }

  // ---------- cartões de riqueza ----------
  // alguém vai receber $10.000 ou mais: quem tem "Dividindo os Lucros" pode pedir metade
  function profitWindow(st, p, amount) {
    const holders = st.players.filter(q => q !== p && q.status !== 'bankrupt' && q.cards.includes('lucros')).map(q => q.id);
    if (!holders.length) return;
    st.pending = { type: 'lucros', target: p.id, amount, waiting: holders, claims: [], deadline: Date.now() + WINDOW_MS };
  }
  // vai pagar mais de $10.000: quem paga pode usar "Dividindo a Despesa" para outro jogador pagar metade
  function expense(st, p, cost, why) {
    if (cost > 10000 && p.cards.includes('despesa') && st.players.some(q => q !== p && q.status !== 'bankrupt')) {
      st.q.unshift({ t: 'fn', fn: st2 => { const pend = st2._despesaResult; delete st2._despesaResult; const half = pend ? Math.floor(cost / 2) : 0; pay(st2, p, cost - half, why); } });
      st.pending = { type: 'despesa', pid: p.id, cost, why, deadline: Date.now() + WINDOW_MS };
      return;
    }
    pay(st, p, cost, why);
  }
  function useCard(st, p, c) { const i = p.cards.indexOf(c); if (i >= 0) { p.cards.splice(i, 1); st.deck.unshift(c); } }
  // o alvo pode responder com o Cartão de Isenção
  function isencaoThen(st, target, from, card, resolve) {
    if (target.cards.includes('isencao')) {
      st.pending = { type: 'isencao', pid: target.id, from: from.id, card, deadline: Date.now() + WINDOW_MS };
      st._isencaoResolve = resolve; return;
    }
    resolve(false);
  }

  // ---------- casamento, vingança, juízo, milionário ----------
  function wedding(st, p) {
    if (p.married) return;
    p.married = true;
    const g = spin(), each = g <= 3 ? 2000 : g <= 6 ? 1000 : 0;
    log(st, `💍 Dia do Casamento de ${nameOf(p.id)}! Presentes: roleta deu ${g}${each ? ` — ${money(each)} de cada jogador` : ' — ninguém deu nada (que convidados!)'}.`);
    ev(st, { type: 'wedding', pid: p.id, spin: g, each });
    if (each) for (const q of st.players) if (q !== p && q.status !== 'bankrupt') transfer(st, q, p, each, 'presente de casamento');
    const h = spin();
    log(st, `🏝️ Lua de mel: ${nameOf(p.id)} girou ${h} e avança ${h} casas.`);
    ev(st, { type: 'spin', pid: p.id, value: h, why: 'lua de mel' });
    st.q.unshift({ t: 'walk', pid: p.id, left: h });
  }
  function judgment(st, p) {
    p.retired = true;
    const kidsMoney = p.kids * P.kidJudgment, notesCost = p.notes * P.notePay;
    if (kidsMoney) gain(st, p, kidsMoney, 'filhos');
    if (notesCost) { p.money -= notesCost; ev(st, { type: 'money', pid: p.id, amount: -notesCost, why: 'notas' }); }
    log(st, `⚖️ Dia do Juízo de ${nameOf(p.id)}: ${p.kids} filho${p.kids === 1 ? '' : 's'} (+${money(kidsMoney)}), ${p.notes} nota${p.notes === 1 ? '' : 's'} paga${p.notes === 1 ? '' : 's'} (−${money(notesCost)}).`);
    p.notes = 0;
    ev(st, { type: 'juizo', pid: p.id });
    st.pending = { type: 'juizo', pid: p.id };
  }
  function millionaire(st, p) {
    p.status = 'millionaire'; p.retired = true;
    if (!st.millionFirst) {
      st.millionFirst = p.id; gain(st, p, P.millionBonus, 'bônus');
      p.lucky = spin();
      log(st, `💰 ${nameOf(p.id)} é o primeiro MILIONÁRIO: ganhou ${money(P.millionBonus)} e o número da sorte ${p.lucky} — quem tirar ${p.lucky} na roleta paga ${money(P.luckyPay)} a ele!`);
    } else log(st, `💰 ${nameOf(p.id)} chegou ao MILIONÁRIO.`);
    ev(st, { type: 'millionaire', pid: p.id, lucky: p.lucky });
  }
  function goBack(st, p, n) {
    const path = [];
    for (let k = 0; k < n && SP[p.pos].prev.length; k++) { const prevs = SP[p.pos].prev; p.pos = prevs.reduce((a, b) => (SP[b].d < SP[a].d ? b : a)); path.push(p.pos); }
    while (occupied(st, p.pos, p) && SP[p.pos].prev.length) { const prevs = SP[p.pos].prev; p.pos = prevs.reduce((a, b) => (SP[b].d < SP[a].d ? b : a)); path.push(p.pos); }
    // voltou para antes do pedágio: perde o direito de cobrar (fica com o próximo que atravessou)
    if (!beyondToll(p) && st.tollCross.includes(p.id)) st.tollCross = st.tollCross.filter(x => x !== p.id);
    ev(st, { type: 'back', pid: p.id, path });
  }
  function finished(st) {
    const left = st.players.filter(active);
    if (left.length) return false;
    const ranking = st.players.map(p => ({ id: p.id, worth: p.status === 'millionaire' ? p.money + (p.stock ? P.stockValue : 0) + (p.ins.life ? P.lifeValue : 0) : -1, status: p.status }))
      .sort((a, b) => b.worth - a.worth);
    const win = ranking.find(r => r.status === 'millionaire');
    st.result = { winner: win ? win.id : ranking[0].id, how: 'milionario', ranking };
    st.phase = 'done'; st.deadline = 0; st.pending = null;
    log(st, `🏆 Fim da Vida! ${nameOf(st.result.winner)} é o milionário mais rico e vence a Vida Adulta.`);
    ev(st, { type: 'win', pid: st.result.winner, how: 'milionario' });
    return true;
  }

  // ---------- ações ----------
  function act(st, pid, a) {
    const err = actInner(st, pid, a);
    if (!err) { const mine = cur(st)?.id === pid || st.pending?.pid === pid; run(st); if (!st.result && mine) arm(st, false, a.auto); if (!a.auto && cur(st)?.id === pid) st.afk = null; }
    return err;
  }
  function actInner(st, pid, a) {
    if (st.result) return 'A partida acabou.';
    const p = pl(st, pid); if (!p) return 'Você não está jogando.';
    const pend = st.pending, isCur = cur(st).id === pid;
    // apostas: qualquer adversário, antes do giro de quem está na vez
    if (a.type === 'bet') {
      if (isCur) return 'Você não pode apostar no seu próprio giro.';
      if (st.phase !== 'start' || pend) return 'Espere o próximo giro para apostar.';
      if (p.status === 'bankrupt') return 'Você está falido.';
      const nums = (a.nums || []).map(Number).filter(n => n >= 1 && n <= 10), amts = (a.amts || []).map(v => Math.floor(+v));
      if (!nums.length || nums.length > 2 || nums.length !== amts.length || new Set(nums).size !== nums.length) return 'Aposte em 1 ou 2 números da faixa.';
      const total = amts.reduce((x, y) => x + y, 0);
      if (amts.some(v => v <= 0) || total > P.betMax) return `Aposte até ${money(P.betMax)} no total.`;
      if (st.bets[pid]) return 'Você já apostou neste giro.';
      if (p.money < total) return 'Dinheiro insuficiente (não vale pegar emprestado para apostar).';
      p.money -= total; st.bets[pid] = nums.map((n, i) => ({ n, amt: amts[i] }));
      log(st, `🎲 ${nameOf(pid)} apostou ${nums.map((n, i) => `${money(amts[i])} no ${n}`).join(' e ')}.`); ev(st, { type: 'bet', pid });
      return null;
    }
    // janelas de cartões (respondem jogadores que não estão na vez)
    if (pend && pend.type === 'lucros' && pend.waiting.includes(pid)) {
      pend.waiting = pend.waiting.filter(x => x !== pid);
      if (a.type === 'claim') pend.claims.push(pid);
      if (!pend.waiting.length) resolveLucros(st);
      return null;
    }
    if (pend && pend.type === 'isencao' && pend.pid === pid) {
      const use = a.type === 'useIsencao'; st.pending = null;
      if (use) { useCard(st, p, 'isencao'); log(st, `🛡️ ${nameOf(pid)} mostrou o Cartão de Isenção!`); ev(st, { type: 'isencao', pid }); }
      const r = st._isencaoResolve; delete st._isencaoResolve; r?.(use);
      return null;
    }
    if (!isCur && !(pend && pend.pid === pid)) return 'Não é sua vez.';
    // decisões pendentes
    if (pend && pend.pid === pid) {
      switch (pend.type) {
        case 'path': {
          if (a.type !== 'path' || !['neg', 'fac'].includes(a.path)) return 'Escolha Negócios ou Faculdade.';
          p.path = a.path; p.firstTurn = false;
          if (a.path === 'neg') { p.prof = 'empreendedor'; p.salary = VIDA_PROFS.empreendedor.salary; }
          if (a.carIns && !p.ins.car) { pay(st, p, P.carIns, 'seguro de carro'); p.ins.car = true; }
          log(st, `${a.path === 'neg' ? '💼' : '🎓'} ${nameOf(pid)} escolheu ${a.path === 'neg' ? `os NEGÓCIOS (Empreendedor, ${money(VIDA_PROFS.empreendedor.salary)})` : 'a FACULDADE'}${a.carIns ? ' e fez seguro do carro' : ''}.`);
          ev(st, { type: 'path', pid, path: a.path });
          st.pending = null; return null;
        }
        case 'fork': {
          if (a.type !== 'fork' || ![0, 1].includes(a.i)) return 'Escolha um caminho.';
          p.forkPick = a.i; st.pending = null;
          log(st, `🛣️ ${nameOf(pid)} seguiu pela ${SP[SP[p.pos].next[a.i]].seg === 'louca' ? 'VIDA LOUCA' : 'VIDA TRANQUILA'}.`);
          return null;
        }
        case 'vinganca': {
          const t = pl(st, a.target);
          if (!t || t === p || t.status !== 'playing') return 'Escolha um jogador que ainda está no caminho (não vale quem já é Milionário).';
          if (a.type !== 'vinganca' || !['money', 'back'].includes(a.mode)) return 'Escolha receber $200.000 ou mandar voltar 10 casas.';
          st.pending = null;
          if (a.mode === 'money' && t.money >= P.vinganca) { t.money -= P.vinganca; p.money += P.vinganca; ev(st, { type: 'money', pid: t.id, amount: -P.vinganca }); ev(st, { type: 'money', pid, amount: P.vinganca }); log(st, `😈 VINGANÇA! ${nameOf(pid)} tomou ${money(P.vinganca)} de ${nameOf(t.id)}.`); ev(st, { type: 'vinganca', pid, target: t.id, mode: 'money' }); }
          else {
            log(st, `😈 VINGANÇA! ${nameOf(t.id)} ${a.mode === 'money' ? 'não tinha os $200.000 e ' : ''}volta 10 casas.`);
            ev(st, { type: 'vinganca', pid, target: t.id, mode: 'back' }); goBack(st, t, 10);
          }
          return null;
        }
        case 'sorte': {
          st.pending = null;
          if (a.type !== 'sorte' || !a.bet) { log(st, `🍀 ${nameOf(pid)} guardou os $20.000.`); return null; }
          const nums = (a.nums || []).map(Number).filter(n => n >= 1 && n <= 10);
          if (nums.length !== 2 || nums[0] === nums[1]) { st.pending = pend; return 'Escolha dois números diferentes (uma nota de $10.000 em cada).'; }
          const r = spin(); ev(st, { type: 'spin', pid, value: r, why: 'Dia de Sorte' });
          if (nums.includes(r)) { p.money += P.sorteWin - P.sorte; ev(st, { type: 'money', pid, amount: P.sorteWin - P.sorte }); log(st, `🍀 Deu ${r}! ${nameOf(pid)} ganhou ${money(P.sorteWin)} (e devolveu os $20.000 da aposta).`); ev(st, { type: 'jackpot', pid }); }
          else { p.money -= P.sorte; ev(st, { type: 'money', pid, amount: -P.sorte }); log(st, `🍀 Deu ${r}. ${nameOf(pid)} perdeu os $20.000 da aposta.`); }
          return null;
        }
        case 'bolsa': {
          st.pending = null; st.bolsaUsed = true;
          if (a.type !== 'bolsa' || !a.play) return null;
          const r = spin(); ev(st, { type: 'spin', pid, value: r, why: 'Bolsa' });
          if (r <= 3) { pay(st, p, P.bolsaLose, 'bolsa'); log(st, `📉 Bolsa em baixa (${r}): ${nameOf(pid)} pagou ${money(P.bolsaLose)}.`); }
          else if (r <= 6) log(st, `📊 Bolsa estável (${r}): ${nameOf(pid)} não ganhou nem perdeu.`);
          else { gain(st, p, P.bolsaWin, 'bolsa'); log(st, `📈 Bolsa em alta (${r})! ${nameOf(pid)} recebeu ${money(P.bolsaWin)}.`); }
          ev(st, { type: 'bolsa', pid, value: r });
          return null;
        }
        case 'juizo': {
          if (a.type !== 'juizo' || !['milionario', 'magnata'].includes(a.choice)) return 'Escolha Milionário ou Magnata.';
          st.pending = null;
          if (a.choice === 'milionario') {
            const r = spin(); ev(st, { type: 'spin', pid, value: r, why: 'rumo ao Milionário' });
            log(st, `🚗 ${nameOf(pid)} vai rumo ao MILIONÁRIO (girou ${r}).`);
            p.toMillion = true; st.q.unshift({ t: 'walk', pid, left: r });
            return null;
          }
          const n = +a.num; if (!(n >= 1 && n <= 10)) { st.pending = pend; return 'Escolha um número de 1 a 10.'; }
          const r = spin(); ev(st, { type: 'spin', pid, value: r, why: 'Magnata' });
          if (r === n) {
            p.status = 'magnata'; st.result = { winner: pid, how: 'magnata', num: n, ranking: [{ id: pid, worth: p.money, status: 'magnata' }, ...st.players.filter(q => q !== p).map(q => ({ id: q.id, worth: q.money, status: q.status }))] };
            st.phase = 'done'; st.deadline = 0;
            log(st, `🎩 ${nameOf(pid)} apostou TUDO no ${n} e a roleta deu ${r}: virou MAGNATA e venceu o jogo!`);
            ev(st, { type: 'win', pid, how: 'magnata' });
          } else {
            p.status = 'bankrupt'; p.money = 0;
            log(st, `💀 ${nameOf(pid)} apostou tudo no ${n}, mas deu ${r}. O banco levou até o carro: FALÊNCIA.`);
            ev(st, { type: 'bankrupt', pid });
          }
          return null;
        }
        case 'despesa': {
          const t = a.type === 'despesa' && a.target ? pl(st, a.target) : null;
          st.pending = null;
          if (!t || t === p || t.status === 'bankrupt') { st._despesaResult = false; return null; }
          useCard(st, p, 'despesa'); log(st, `🃏 ${nameOf(pid)} usou "Dividindo a Despesa" em ${nameOf(t.id)}.`); ev(st, { type: 'cardUse', pid, card: 'despesa', target: t.id });
          const half = Math.floor(pend.cost / 2);
          isencaoThen(st, t, p, 'despesa', blocked => { if (!blocked) { pay(st, t, half, 'dividindo a despesa'); st._despesaResult = true; } else st._despesaResult = false; });
          return null;
        }
      }
    }
    // começo da vez: compras, notas e girar
    if (!isCur) return 'Não é sua vez.';
    if (st.phase !== 'start' || pend) return 'Agora não.';
    switch (a.type) {
      case 'buy': {
        const k = a.what;
        if (k === 'car') { if (p.ins.car) return 'Você já tem seguro de carro.'; pay(st, p, P.carIns, 'seguro'); p.ins.car = true; }
        else if (k === 'house') { if (!p.house) return 'Primeiro compre um apartamento.'; if (p.ins.house) return 'Você já tem seguro de casa.'; pay(st, p, P.houseIns, 'seguro'); p.ins.house = true; }
        else if (k === 'life') { if (!p.unlock.life) return 'Passe pela casa do Seguro de Vida antes.'; if (p.ins.life) return 'Você já tem seguro de vida.'; pay(st, p, P.lifeIns, 'seguro'); p.ins.life = true; }
        else if (k === 'stock') { if (!p.unlock.stock) return 'Passe pela casa de compra de ações antes.'; if (p.stock) return 'Você só pode ter uma ação.'; pay(st, p, P.stock, 'ação'); p.stock = true; }
        else return 'Compra inválida.';
        log(st, `🛒 ${nameOf(pid)} comprou ${{ car: 'Seguro de Carro', house: 'Seguro de Casa', life: 'Seguro de Vida', stock: 'uma Ação' }[k]}.`);
        ev(st, { type: 'buy', pid, what: k });
        return null;
      }
      case 'note': { if (p.retired) return 'Aposentado não pega empréstimo.'; p.notes++; gain(st, p, P.noteGet, 'empréstimo'); log(st, `📝 ${nameOf(pid)} pegou uma nota promissória (+${money(P.noteGet)}).`); return null; }
      case 'repay': { if (!p.notes) return 'Você não tem notas.'; if (p.money < P.notePay) return 'Dinheiro insuficiente.'; p.notes--; p.money -= P.notePay; ev(st, { type: 'money', pid, amount: -P.notePay }); log(st, `✅ ${nameOf(pid)} quitou uma nota promissória (${money(P.notePay)}).`); return null; }
      case 'spin': {
        if (p.firstTurn) return 'Escolha o seu caminho primeiro.';
        const r = spin(); st.lastSpin = { id: ++st.seq, pid, value: r };
        ev(st, { type: 'spin', pid, value: r, why: 'andar' });
        log(st, `🎡 ${nameOf(pid)} girou a roleta: ${r}.`);
        // apostas dos adversários: paga 10 vezes
        for (const [bid, bets] of Object.entries(st.bets)) {
          const q = pl(st, bid); const hit = bets.find(b => b.n === r);
          if (hit) { gain(st, q, hit.amt * 10, 'aposta'); log(st, `🎯 ${nameOf(bid)} acertou o ${r} e ganhou ${money(hit.amt * 10)}!`); ev(st, { type: 'betWin', pid: bid, amount: hit.amt * 10 }); }
        }
        st.bets = {};
        // número da sorte do milionário
        for (const m of st.players) if (m.lucky === r && m.id !== pid && m.status === 'millionaire') { transfer(st, p, m, P.luckyPay, 'número da sorte'); log(st, `🍀 Deu ${r}, o número da sorte de ${nameOf(m.id)}: ${nameOf(pid)} paga ${money(P.luckyPay)}.`); }
        st.phase = 'move'; st.q = [{ t: 'walk', pid, left: r }];
        return null;
      }
    }
    return 'Ação desconhecida.';
  }
  function resolveLucros(st) {
    const pend = st.pending; st.pending = null;
    if (!pend.claims.length) return;
    const winner = pl(st, pend.claims[rnd(pend.claims.length)]), target = pl(st, pend.target), half = Math.floor(pend.amount / 2);
    useCard(st, winner, 'lucros');
    log(st, `🃏 ${nameOf(winner.id)} usou "Dividindo os Lucros" em ${nameOf(target.id)}.`); ev(st, { type: 'cardUse', pid: winner.id, card: 'lucros', target: target.id });
    isencaoThen(st, target, winner, 'lucros', blocked => { if (!blocked) { target.money -= half; winner.money += half; ev(st, { type: 'money', pid: target.id, amount: -half }); ev(st, { type: 'money', pid: winner.id, amount: half }); log(st, `💰 ${nameOf(target.id)} deu ${money(half)} (metade do lucro) a ${nameOf(winner.id)}.`); } });
  }

  // ---------- visão: cartões de riqueza são segredo ----------
  function viewFor(st, pid) {
    const v = JSON.parse(JSON.stringify({ ...st, _isencaoResolve: undefined }));
    v.deck = { count: st.deck.length };
    for (const p of v.players) { p.cardCount = p.cards.length; if (p.id !== pid && !st.result) p.cards = []; }
    v.me = pid; v.tollOwner = tollOwner(st)?.id || null;
    return v;
  }

  // ---------- bots e jogadores ausentes ----------
  const richest = (st, p) => st.players.filter(q => q !== p && q.status === 'playing').sort((a, b) => b.money - a.money)[0];
  function botAction(st, pid) {
    if (st.result) return null;
    const p = pl(st, pid), pend = st.pending;
    if (pend) {
      if (pend.type === 'lucros' && pend.waiting.includes(pid)) return { type: 'claim' };
      if (pend.type === 'isencao' && pend.pid === pid) return { type: 'useIsencao' };
      if (pend.pid !== pid) return null;
      switch (pend.type) {
        case 'path': return { type: 'path', path: Math.random() < .6 ? 'fac' : 'neg', carIns: Math.random() < .7 };
        case 'fork': return { type: 'fork', i: rnd(2) };
        case 'vinganca': { const t = richest(st, p); if (!t) return { type: 'vinganca', mode: 'back', target: null }; return { type: 'vinganca', mode: t.money >= P.vinganca ? 'money' : 'back', target: t.id }; }
        case 'sorte': { const a = 1 + rnd(10); let b = 1 + rnd(10); if (b === a) b = a % 10 + 1; return Math.random() < .5 ? { type: 'sorte', bet: true, nums: [a, b] } : { type: 'sorte', bet: false }; }
        case 'bolsa': return { type: 'bolsa', play: true };
        case 'juizo': return p.money < 150000 && Math.random() < .5 ? { type: 'juizo', choice: 'magnata', num: 1 + rnd(10) } : { type: 'juizo', choice: 'milionario' };
        case 'despesa': { const t = richest(st, p) || st.players.find(q => q !== p && q.status !== 'bankrupt'); return { type: 'despesa', target: t?.id || null }; }
      }
      return null;
    }
    if (cur(st).id !== pid || st.phase !== 'start') {
      // aposta de vez em quando no giro dos outros
      if (st.phase === 'start' && cur(st).id !== pid && !st.bets[pid] && p.status !== 'bankrupt' && p.money > 60000 && Math.random() < .25) return { type: 'bet', nums: [1 + rnd(10)], amts: [Math.min(P.betMax, 4000 + rnd(5) * 2000)] };
      return null;
    }
    if (!p.ins.car && p.money > 20000) return { type: 'buy', what: 'car' };
    if (p.house && !p.ins.house && p.money > 50000) return { type: 'buy', what: 'house' };
    if (p.unlock.life && !p.ins.life && p.money > 40000) return { type: 'buy', what: 'life' };
    if (p.unlock.stock && !p.stock && p.money > 110000) return { type: 'buy', what: 'stock' };
    if (p.notes && p.money > P.notePay + 60000) return { type: 'repay' };
    return { type: 'spin' };
  }
  const botDelay = a => (a.type === 'spin' ? 1300 : a.type === 'bet' || a.type === 'claim' ? 1600 : 900);
  // tempo esgotado: decide pelo ausente (gira, recusa extras; nas janelas de cartão, deixa passar)
  function timeout(st) {
    if (st.result) return false;
    const now = Date.now(), pend = st.pending;
    if (pend && pend.deadline && now >= pend.deadline - 50) {
      if (pend.type === 'lucros') { pend.waiting = []; resolveLucros(st); run(st); return true; }
      if (pend.type === 'isencao') { act(st, pend.pid, { type: 'skip', auto: true }); return true; }
      if (pend.type === 'despesa') { act(st, pend.pid, { type: 'despesa', target: null, auto: true }); return true; }
    }
    if (!st.turnMs || !st.deadline || now < st.deadline - 50) return false;
    const p = cur(st);
    if (st.afk !== p.id) { st.afk = p.id; log(st, `⏰ ${nameOf(p.id)} ficou sem tempo — jogada automática.`); }
    let a;
    if (pend && pend.pid === p.id) a = { ...botAction(st, p.id), auto: true };
    else if (pend) a = null;
    else a = { type: 'spin', auto: true };
    if (pend?.type === 'path') a = { type: 'path', path: 'neg', carIns: false, auto: true };
    if (a) { const err = act(st, pend && pend.pid !== p.id ? pend.pid : p.id, a); if (err) st.deadline = now + 3000; }
    else st.deadline = now + 3000;
    return true;
  }

  return { newGame, act, viewFor, botAction, botDelay, timeout, money, CARD, setNameResolver: f => (nameOf = f) };
})();
