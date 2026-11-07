// Patrimônio: regras completas e bots. Sem tela: recebe ações, muda o estado e gera eventos para a animação.
(function (root) {
  const D = typeof module !== 'undefined' ? require('./pat-data.js') : root.PD;
  const { SQ, CARDS, NEWS } = D;
  const OWNABLE = SQ.map((s, i) => (s.price ? i : -1)).filter(i => i >= 0);
  const GROUP_OF = {};
  OWNABLE.forEach(i => { (GROUP_OF[SQ[i].g] = GROUP_OF[SQ[i].g] || []).push(i); });
  const JAIL = 10, SALARY = 130, BAIL = 35;
  // Regras da casa. Sem elas (partida antiga ou testes) o jogo segue o clássico.
  const RULES = { mortgage: true, wealth: true, reajuste: true, pux: true, sponsor: true, casino: true, blitz: true, travel: true, passes: true, fiado: true, news: true, contracts: true, limit: 0 };
  const on = (st, k) => !!(st.rules && st.rules[k]);
  const MORT = { now: .2, perRound: .1, max: 2, seize: 6, warn: 4 }, WEALTH = { above: 1.5, rate: .08, max: 100 };
  const JEITINHO = 35, TRAVEL = 35, PUX_MAX = 3, PASS_MAX = 3, PASS_MIN = 20;
  const CONTRACTS = [
    { id: 'frota', t: 'Frota: ter 2 aeroportos', prize: 70, ok: (st, i) => GROUP_OF.rail.filter(s => st.props[s].owner === i).length >= 2 },
    { id: 'terra', t: 'Candango: ter 2 casas do DF e Entorno', prize: 70, ok: (st, i) => GROUP_OF.laranja.filter(s => st.props[s].owner === i).length >= 2 },
    { id: 'bahia', t: 'Baiano de coração: ter 2 casas da Bahia', prize: 80, ok: (st, i) => GROUP_OF.vermelho.filter(s => st.props[s].owner === i).length >= 2 },
    { id: 'barao', t: 'Barão: completar um grupo', prize: 130, ok: (st, i) => ownedBy(st, i).some(s => SQ[s].k === 'prop' && hasMonopoly(st, s)) },
    { id: 'espalhado', t: 'Espalhado: ter construção em 3 grupos', prize: 100, ok: (st, i) => new Set(ownedBy(st, i).filter(s => st.props[s].h || st.props[s].x).map(s => SQ[s].g)).size >= 3 },
    { id: 'pousada', t: 'Hoteleiro: erguer um hotel', prize: 130, ok: (st, i) => ownedBy(st, i).some(s => st.props[s].h === 5) },
    { id: 'leque', t: 'Leque de negócios: ter lugares em 4 grupos', prize: 70, ok: (st, i) => new Set(ownedBy(st, i).map(s => SQ[s].g)).size >= 4 },
    { id: 'caixa', t: 'Caixa forte: ter R$ 1.000.000 em dinheiro', prize: 70, ok: (st, i) => st.players[i].cash >= 1000 && st.rounds > 0 },
    { id: 'agiota', t: 'Agiota: receber um fiado com juros', prize: 70, ok: (st, i) => st.players[i].stats.agiota },
    { id: 'malandro', t: 'Malandro: subornar o guarda da Blitz', prize: 55, ok: (st, i) => st.players[i].stats.jeitinho },
    { id: 'passe', t: 'Boa lábia: usar um passe livre', prize: 55, ok: (st, i) => st.players[i].stats.passe },
    { id: 'martelo', t: 'Latifundiário: ter 6 propriedades', prize: 55, ok: (st, i) => ownedBy(st, i).length >= 6 },
  ];

  function rand(st) { // serializável: a partida salva continua do mesmo ponto
    st.seed = (st.seed + 0x6D2B79F5) | 0;
    let t = st.seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  const die = st => 1 + Math.floor(rand(st) * 6);
  function shuffled(st, n) { const a = [...Array(n).keys()]; for (let i = n - 1; i > 0; i--) { const j = Math.floor(rand(st) * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  const emit = (st, t, o = {}) => st.ev.push({ t, ...o });
  const name = (st, i) => st.players[i].name;
  const alive = st => st.players.filter(p => !p.out);
  const brl = n => (n < 0 ? '−' : '') + 'R$ ' + (Math.abs(Math.round(n)) * 1000).toLocaleString('pt-BR');

  function newGame(players, seed = Date.now() | 0, rules = null) {
    const st = {
      seed, ev: [], turn: 0, phase: 'roll', doubles: 0, again: false, dice: [0, 0], debts: [], after: null, buy: null,
      auction: null, queue: [], offer: null, rounds: 0, winner: null, bank: { houses: 32, hotels: 12 }, mem: {}, turns: 0,
      props: {}, decks: {}, sp: null, rules, passes: [], loans: [], credit: null, sponsor: false, blitz: false, travel: false, fresh: false, news: null,
      players: players.map((p, i) => ({ i, name: p.name, token: p.token, char: p.char, color: p.color, bot: !!p.bot, cash: 750, pos: 0, jail: false, tries: 0, cards: [], out: false, contracts: [], dealt: 0, swap: false, stats: {} })),
    };
    OWNABLE.forEach(i => { st.props[i] = { owner: null, h: 0, m: false }; });
    st.decks.destino = shuffled(st, CARDS.destino.length);
    st.decks.mutirao = shuffled(st, CARDS.mutirao.length);
    if (on(st, 'news')) { st.decks.news = shuffled(st, NEWS.length); drawNews(st); }
    if (on(st, 'contracts')) { st.decks.contracts = shuffled(st, CONTRACTS.length); st.players.forEach(p => { dealContract(st, p); dealContract(st, p); }); }
    emit(st, 'turn', { who: 0, msg: `${name(st, 0)} começa` });
    return st;
  }

  // ----- consultas -----
  const ownedBy = (st, i) => OWNABLE.filter(s => st.props[s].owner === i);
  const hasMonopoly = (st, s) => { const o = st.props[s].owner; return o !== null && GROUP_OF[SQ[s].g].every(x => st.props[x].owner === o); };
  const groupClear = (st, s) => GROUP_OF[SQ[s].g].every(x => st.props[x].h === 0);
  const nextRail = pos => GROUP_OF.rail.find(s => s > pos) ?? GROUP_OF.rail[0];
  const mortgageValue = s => SQ[s].price / 2;
  // com a hipoteca punitiva a dívida começa 20% acima e sobe 10% por volta, até o dobro; o prazo acaba em penhora
  const liftCost = (st, s) => { const base = mortgageValue(s), pr = st.props[s]; return on(st, 'mortgage') && pr.m ? Math.ceil(base * Math.min(MORT.max, 1 + MORT.now + MORT.perRound * (st.rounds - (pr.mAt ?? st.rounds)))) : Math.ceil(base * 11 / 10); };
  const roundsToSeize = (st, s) => (on(st, 'mortgage') && st.props[s].m ? MORT.seize - (st.rounds - (st.props[s].mAt ?? st.rounds)) : null);
  const newsNow = st => (st.news ? NEWS[st.news.cur].e : {});
  const rentScale = st => (on(st, 'reajuste') ? Math.min(2, 1 + .25 * Math.floor(st.rounds / 10)) : 1);
  const buildCost = (st, s) => Math.ceil(SQ[s].house * (newsNow(st).build || 1));
  const buyPrice = (st, s) => Math.ceil(SQ[s].price * (newsNow(st).buy || 1));
  const salary = st => Math.round(SALARY * (newsNow(st).salary || 1));
  // imposto é parte do que a pessoa tem na mão: pesa para quem está rico e nunca quebra ninguém
  const taxOf = (st, q, p) => Math.min(p.cash, Math.ceil(p.cash * q.pct / 100 * (newsNow(st).tax ?? 1)));
  const loanOf = (st, i) => st.loans.find(l => l.who === i) || null;
  const passesOf = (st, owner, holder) => st.passes.find(p => p.from === owner && p.to === holder)?.n || 0;
  const tradable = (st, s) => groupClear(st, s) && !st.props[s].x && !st.props[s].lien;
  const puxCount = (st, i) => ownedBy(st, i).filter(s => st.props[s].x).length;
  const fee = s => Math.ceil(mortgageValue(s) / 10);
  // patrocínio: um só na mesa. Vale até outra pessoa cair na casa e roubá-lo; quem cai de novo sobe de +50% para o dobro
  // cassino: casa opcional, com teto para uma aposta não decidir a partida. A banca fica com uma pequena vantagem
  const CASINO = { min: 5, cap: 50, color: 2, number: 30, red: D.ROULETTE_RED };
  // teto igual para todos: quem tem pouco pode arriscar tudo, quem tem muito não ganha vantagem por isso
  const maxBet = (st, i) => Math.min(CASINO.cap, st.players[i].cash);
  const AUCTION_MS = 20000, AUCTION_BUMP_MS = 10000;
  const LEVELS = ['Terreno', 'Casa', 'Sobrado', 'Mansão', 'Prédio', 'Hotel'], LEVEL_ART = ['', 'uma casa', 'um sobrado', 'uma mansão', 'um prédio', 'um hotel'];
  // números da partida para a tela final; saves antigos começam a contar de onde estão
  const tally = (p, k, v = 1) => { const t = p.t || (p.t = {}); t[k] = (t[k] || 0) + v; return t; };
  const SPONSOR = { boost: [1, 1.5, 2], cash: 70 };
  const sponsored = (st, s) => (st.sp && st.sp.sq === s && st.props[s].owner === st.sp.who ? st.sp.lv : 0);
  const sponsorLevel = (st, i) => (!st.sp ? 1 : st.sp.who === i ? Math.min(2, st.sp.lv + 1) : st.sp.lv);
  function rentOf(st, s, ctx = {}) {
    const { rent: n, rentAll } = newsNow(st);
    return Math.round(rawRent(st, s, ctx) * rentScale(st) * (rentAll || (n && n.g === SQ[s].g ? n.x : 1)) * SPONSOR.boost[ctx.lv ?? sponsored(st, s)]);
  }
  function rawRent(st, s, ctx) {
    const q = SQ[s], pr = st.props[s];
    if (pr.owner === null || pr.m) return 0;
    if (q.k === 'prop') return pr.h > 0 ? q.rent[pr.h] : q.rent[0] * ((hasMonopoly(st, s) && !(on(st, 'mortgage') && GROUP_OF[q.g].some(x => st.props[x].m))) || pr.x ? 2 : 1);
    const n = GROUP_OF[q.g].filter(x => st.props[x].owner === pr.owner).length;
    if (q.k === 'rail') return 17 * 2 ** (n - 1) * (ctx.railMult || 1);
    return (ctx.utilMult || (n === 2 ? 7 : 3)) * (ctx.total || st.dice[0] + st.dice[1]);
  }
  function canBuild(st, i, s) {
    const q = SQ[s], pr = st.props[s];
    if (!pr || q.k !== 'prop') return 'Só dá para construir em lugares';
    if (pr.owner !== i) return 'Esse lugar não é seu';
    if (!hasMonopoly(st, s)) return 'Precisa ter o grupo inteiro';
    const g = GROUP_OF[q.g];
    if (g.some(x => st.props[x].m)) return 'Há lugar hipotecado no grupo';
    if (pr.lien) return 'Está de garantia num fiado';
    if (pr.h >= 5) return 'Já tem hotel';
    if (pr.h > Math.min(...g.map(x => st.props[x].h))) return 'Construa por igual no grupo';
    if (st.players[i].cash < buildCost(st, s)) return 'Sem dinheiro';
    if (pr.h === 4 ? st.bank.hotels < 1 : st.bank.houses < 1) return pr.h === 4 ? 'O banco está sem hotéis' : 'O banco está sem material de obra';
    return null;
  }
  function canPux(st, i, s) {
    const q = SQ[s], pr = st.props[s];
    if (!on(st, 'pux')) return 'Puxadinho desligado nesta partida';
    if (!pr || q.k !== 'prop') return 'Só dá para construir em lugares';
    if (pr.owner !== i) return 'Esse lugar não é seu';
    if (pr.x) return 'Já tem puxadinho';
    if (pr.h || hasMonopoly(st, s)) return 'Com o grupo completo, construa casa';
    if (pr.m) return 'Está hipotecado';
    if (pr.lien) return 'Está de garantia num fiado';
    if (puxCount(st, i) >= PUX_MAX) return `Limite de ${PUX_MAX} puxadinhos`;
    if (st.players[i].cash < buildCost(st, s)) return 'Sem dinheiro';
    return null;
  }
  function canSell(st, i, s) {
    const pr = st.props[s];
    if (!pr || pr.owner !== i) return 'Esse lugar não é seu';
    if (pr.x) return null;
    if (pr.h === 0) return 'Não há construção';
    if (pr.h < Math.max(...GROUP_OF[SQ[s].g].map(x => st.props[x].h))) return 'Venda por igual no grupo';
    return null;
  }
  function canMortgage(st, i, s) {
    const pr = st.props[s];
    if (!pr || pr.owner !== i) return 'Esse lugar não é seu';
    if (pr.m) return 'Já está hipotecado';
    if (pr.lien) return 'Está de garantia num fiado';
    if (pr.x) return 'Venda o puxadinho antes';
    if (!groupClear(st, s)) return 'Venda as construções do grupo antes';
    return null;
  }
  function canLift(st, i, s) {
    const pr = st.props[s];
    if (!pr || pr.owner !== i) return 'Esse lugar não é seu';
    if (!pr.m) return 'Não está hipotecado';
    if (st.players[i].cash < liftCost(st, s)) return 'Sem dinheiro';
    return null;
  }
  function worth(st, i) {
    const p = st.players[i]; let v = p.cash;
    for (const s of ownedBy(st, i)) { const pr = st.props[s], q = SQ[s]; v += pr.m ? 0 : mortgageValue(s); if (pr.h) v += (q.house / 2) * pr.h; if (pr.x) v += q.house / 2; }
    return v;
  }
  // Quem precisa decidir agora. Negociação pendente vem primeiro.
  function actor(st) {
    if (st.phase === 'over') return null;
    if (st.credit) return st.credit.stage === 'ask' ? st.credit.to : st.credit.who;
    if (st.offer) return st.offer.to;
    if (st.phase === 'debt') return st.debts[0].who;
    if (st.phase === 'auction') return st.auction.active[st.auction.cur];
    return st.turn;
  }

  // ----- dinheiro -----
  function pay(st, from, to, amt, why) {
    if (amt <= 0) return;
    const p = st.players[from];
    // como no Magnata: desconta na hora, mesmo que fique negativo; quem recebe já recebe tudo
    p.cash -= amt; if (to !== null) st.players[to].cash += amt;
    emit(st, 'pay', { from, to, amt, why, msg: `${p.name} paga ${brl(amt)}${to !== null ? ' a ' + name(st, to) : ''} (${why})` });
    if (p.cash >= 0) return;
    const d = st.debts.find(x => x.who === from);
    // shortcut: contas somadas guardam um só credor; basta enquanto duas dívidas seguidas forem raras
    if (d) { d.amt += amt; d.to = d.to ?? to; d.why = why; } else st.debts.push({ who: from, to, amt, why });
  }
  function gain(st, i, amt, why) { st.players[i].cash += amt; emit(st, 'gain', { who: i, amt, why, msg: `${name(st, i)} recebe ${brl(amt)} (${why})` }); }

  // ----- movimento -----
  function walk(st, p, n, ctx) {
    const from = p.pos, raw = from + n, to = (raw + 40) % 40, passed = n > 0 && raw >= 40;
    p.pos = to;
    const earn = passed ? salary(st) : 0;
    if (passed) { p.cash += earn; p.swap = true; }
    emit(st, 'move', { who: p.i, from, to, steps: n, salary: earn, msg: passed ? `${p.name} passa pelo Marco Zero e recebe ${brl(earn)}` : undefined });
    if (passed) wealthTax(st, p);
    land(st, p, ctx);
  }
  // só com 3 ou mais na mesa: em dupla, a taxa só alongaria a partida
  function wealthTax(st, p) {
    if (!on(st, 'wealth')) return;
    const live = alive(st); if (live.length < 3) return;
    const avg = live.reduce((t, o) => t + worth(st, o.i), 0) / live.length, me = worth(st, p.i);
    if (me <= avg * WEALTH.above) return;
    const tax = Math.min(WEALTH.max, p.cash, Math.round((me - avg) * WEALTH.rate));
    if (tax > 0) pay(st, p.i, null, tax, 'taxa de fortuna');
  }
  const walkTo = (st, p, to, ctx) => walk(st, p, ((to - p.pos + 40) % 40) || 40, ctx);
  function sendToJail(st, p, why) {
    tally(p, 'jail'); const from = p.pos; p.pos = JAIL; p.jail = true; p.tries = 0; st.again = false; st.doubles = 0;
    emit(st, 'jail', { who: p.i, from, why, msg: `${p.name} vai para a Delegacia (${why})` });
  }
  function land(st, p, ctx = {}) {
    const q = SQ[p.pos], s = p.pos;
    if (q.k === 'rail' && on(st, 'travel') && !ctx.noTravel) st.travel = true;
    if (q.price) {
      const pr = st.props[s];
      if (pr.owner === null) { if (ctx.noBuy) { emit(st, 'note', { msg: `${q.name} está livre, mas quem chega voando não compra` }); return; } st.buy = s; emit(st, 'offerbuy', { who: p.i, sq: s }); return; }
      if (pr.owner === p.i) return;
      if (pr.m) { emit(st, 'note', { msg: `${q.name} está hipotecado: sem aluguel` }); return; }
      const pass = st.passes.find(x => x.from === pr.owner && x.to === p.i && x.n > 0);
      if (pass) { pass.n--; p.stats.passe = true; st.passes = st.passes.filter(x => x.n > 0); emit(st, 'passused', { who: p.i, owner: pr.owner, sq: s, left: pass.n, msg: `${p.name} usou um passe livre em ${q.name}` }); } else { if (q.k === 'util') { const a = die(st), b = die(st); emit(st, 'dice', { a, b, who: p.i, extra: true, why: `${p.name} caiu na usina e joga os dados para saber a conta` }); ctx.total = a + b; } const rent = rentOf(st, s, ctx), o = st.players[pr.owner]; tally(p, 'rentOut', rent); const t = tally(o, 'rentIn', rent); t.maxRent = Math.max(t.maxRent || 0, rent); pay(st, p.i, pr.owner, rent, `aluguel de ${q.name}`); }
    } else if (q.k === 'tax') pay(st, p.i, null, taxOf(st, q, p), q.name);
    else if (q.k === 'free' && on(st, 'sponsor')) {
      const can = ownedBy(st, p.i).some(x => !st.props[x].m);
      emit(st, 'sponsorLand', { who: p.i, can, from: st.sp && st.sp.who !== p.i ? st.sp.who : null, msg: `${p.name} chegou ao Patrocinador` });
      if (can) st.sponsor = true; else gain(st, p.i, SPONSOR.cash, 'patrocínio');
    }
    else if (q.k === 'casino' && on(st, 'casino')) {
      const can = maxBet(st, p.i) >= CASINO.min;
      emit(st, 'casinoLand', { who: p.i, can, msg: `${p.name} chegou ao Cassino` });
      if (can) st.casino = true;
    }
    else if (q.k === 'destino' || q.k === 'mutirao') draw(st, p, q.k);
    else if (q.k === 'gotojail') { if (on(st, 'blitz')) { st.blitz = true; st.crime = D.CRIMES[Math.floor(rand(st) * D.CRIMES.length)]; emit(st, 'blitz', { who: p.i, crime: st.crime, msg: `${p.name} foi parado na Blitz por ${st.crime}` }); } else sendToJail(st, p, 'caiu na blitz'); }
  }
  function draw(st, p, deck) {
    const id = st.decks[deck].shift(), card = CARDS[deck][id], e = card.e;
    if (e.free) p.cards.push({ deck, id }); else st.decks[deck].push(id);
    emit(st, 'card', { who: p.i, deck, text: card.t, msg: `${p.name} tirou ${deck === 'destino' ? 'Sorte' : 'Imprevisto'}: ${card.t}` });
    if (e.goto !== undefined) walkTo(st, p, e.goto);
    else if (e.back) { const from = p.pos; p.pos = (p.pos - e.back + 40) % 40; emit(st, 'move', { who: p.i, from, to: p.pos, steps: -e.back, salary: 0 }); land(st, p); }
    else if (e.near) { let s = p.pos; do { s = (s + 1) % 40; } while (SQ[s].k !== e.near); walkTo(st, p, s, e.near === 'rail' ? { railMult: 2 } : { utilMult: 7 }); }
    else if (e.money > 0) gain(st, p.i, e.money, deck === 'destino' ? 'Sorte' : 'Imprevisto');
    else if (e.money < 0) pay(st, p.i, null, -e.money, deck === 'destino' ? 'Sorte' : 'Imprevisto');
    else if (e.each > 0) { for (const o of alive(st)) if (o !== p) pay(st, o.i, p.i, e.each, 'presente'); }
    else if (e.each < 0) { for (const o of alive(st)) if (o !== p) pay(st, p.i, o.i, -e.each, 'conta do prédio'); }
    else if (e.jail) sendToJail(st, p, deck === 'destino' ? 'Sorte' : 'Imprevisto');
    else if (e.repairs) {
      let t = 0; for (const s of ownedBy(st, p.i)) { const h = st.props[s].h; t += h === 5 ? e.repairs[1] : (h + (st.props[s].x ? 1 : 0)) * e.repairs[0]; }
      pay(st, p.i, null, t, 'reforma');
    }
  }

  // ----- andamento da vez -----
  function settle(st) {
    if (st.phase === 'over') return;
    // dívida é saldo negativo: acaba sozinha ao voltar para zero, e nasce também se um credor precisar devolver
    st.debts = st.debts.filter(d => st.players[d.who].cash < 0 && !st.players[d.who].out);
    for (const q of st.players) if (q.cash < 0 && !q.out && !st.debts.some(d => d.who === q.i)) st.debts.push({ who: q.i, to: null, amt: -q.cash, why: 'saldo negativo' });
    if (st.debts.length) { st.phase = 'debt'; return; }
    if (st.queue.length && !st.auction) { startAuction(st, st.queue.shift()); return; }
    if (st.after) { const a = st.after; st.after = null; walk(st, st.players[st.turn], a.n); settle(st); return; }
    if (st.buy !== null) { st.phase = 'buy'; return; }
    const cur = st.players[st.turn];
    if (cur.out) { nextTurn(st); return; }
    if (st.sponsor) { st.phase = 'sponsor'; return; }
    if (st.casino) { st.phase = 'casino'; return; }
    if (st.blitz) { st.phase = 'blitz'; return; }
    if (st.travel) { if (!cur.jail) { st.phase = 'travel'; return; } st.travel = false; }
    if (st.fresh) { st.fresh = false; st.phase = 'roll'; return; }
    st.phase = st.again && !cur.jail ? 'roll' : 'post';
  }
  function nextTurn(st) {
    let n = st.turn, wrapped = false;
    do { n = (n + 1) % st.players.length; if (n === 0) { st.rounds++; wrapped = true; } } while (st.players[n].out);
    for (const q of alive(st)) { const t = tally(q, 'peak', 0); t.peak = Math.max(t.peak, worth(st, q.i)); }
    st.turn = n; st.doubles = 0; st.again = false; st.phase = 'roll'; st.turns++; st.fresh = false; st.sponsor = false; st.casino = false; st.blitz = false; st.travel = false;
    // o lugar mudou de dono: o patrocínio acaba
    if (st.sp && !sponsored(st, st.sp.sq)) { const sq = st.sp.sq; st.sp = null; emit(st, 'sponsorEnd', { sq, msg: `${SQ[sq].name} perdeu o patrocínio` }); }
    if (wrapped) { newRound(st); if (st.phase === 'over') return; }
    emit(st, 'turn', { who: n, msg: `Vez de ${name(st, n)}` });
    collectLoan(st, n);
    if (st.debts.length || st.queue.length) { st.fresh = true; settle(st); }
  }
  function newRound(st) {
    const lim = st.rules?.limit || 0;
    if (lim && st.rounds >= lim) { const best = alive(st).sort((a, b) => worth(st, b.i) - worth(st, a.i))[0]; st.phase = 'over'; st.winner = best.i; st.queue = []; emit(st, 'over', { who: best.i, msg: `Fim das ${lim} voltas: ${best.name} tem o maior patrimônio` }); return; }
    if (on(st, 'reajuste') && st.rounds % 10 === 0 && st.rounds <= 40) emit(st, 'reajuste', { pct: Math.round((rentScale(st) - 1) * 100), msg: `Reajuste: aluguéis ${Math.round((rentScale(st) - 1) * 100)}% acima da tabela` });
    if (on(st, 'news')) drawNews(st);
    if (on(st, 'mortgage')) for (const s of OWNABLE) {
      const pr = st.props[s]; if (!pr.m) continue;
      const left = roundsToSeize(st, s);
      if (left <= 0) { const who = pr.owner; pr.owner = null; pr.m = false; pr.mAt = undefined; st.queue.push(s); emit(st, 'seized', { who, sq: s, msg: `O banco penhorou ${SQ[s].name} de ${name(st, who)}` }); } else if (left === MORT.seize - MORT.warn) emit(st, 'note', { msg: `${name(st, pr.owner)}: ${SQ[s].name} será penhorada em ${left} voltas` });
    }
  }
  function drawNews(st) {
    const deck = st.decks.news;
    if (st.news === null) st.news = { cur: deck.shift(), next: deck.shift() };
    else { deck.push(st.news.cur); st.news = { cur: st.news.next, next: deck.shift() }; }
    const n = NEWS[st.news.cur]; emit(st, 'news', { title: n.title, text: n.t, msg: `Jornal: ${n.title}. ${n.t}` });
  }
  function dealContract(st, p) {
    if (p.dealt >= 4 || !st.decks.contracts.length) return;
    p.contracts.push(st.decks.contracts.shift()); p.dealt++;
  }
  function checkContracts(st) {
    if (!on(st, 'contracts') || st.phase === 'over') return;
    for (const p of alive(st)) for (const id of [...p.contracts]) {
      const c = CONTRACTS[id]; if (!c.ok(st, p.i)) continue;
      p.contracts = p.contracts.filter(x => x !== id); p.cash += c.prize; dealContract(st, p);
      emit(st, 'contract', { who: p.i, text: c.t, amt: c.prize, msg: `${p.name} cumpriu um contrato: ${c.t} (+${brl(c.prize)})` });
    }
  }
  // um puxadinho que vê o grupo fechado vira casa de verdade, se o banco tiver
  function syncPux(st, s) {
    if (!hasMonopoly(st, s)) return;
    for (const x of GROUP_OF[SQ[s].g]) { const pr = st.props[x]; if (pr.x && st.bank.houses > 0) { pr.x = false; pr.h = 1; st.bank.houses--; emit(st, 'build', { who: pr.owner, sq: x, h: 1, amt: 0, msg: `O puxadinho de ${SQ[x].name} virou casa` }); } }
  }
  function endLoan(st, l) { st.props[l.sq].lien = false; st.loans = st.loans.filter(x => x !== l); st.players[l.to].stats.agiota = st.players[l.to].stats.agiota || l.total > l.amt; }
  function collectLoan(st, n) {
    const l = loanOf(st, n); if (!l) return;
    if (--l.left > 0) return;
    const p = st.players[n], q = SQ[l.sq];
    if (p.cash >= l.total) { endLoan(st, l); pay(st, n, l.to, l.total, 'fiado'); return; }
    endLoan(st, l); st.props[l.sq].owner = l.to;
    emit(st, 'lien', { who: n, to: l.to, sq: l.sq, msg: `${p.name} não pagou o fiado: ${q.name} vai para ${name(st, l.to)}` });
    syncPux(st, l.sq);
    const rest = l.total - q.price; if (rest > 0) pay(st, n, l.to, rest, 'resto do fiado');
  }
  function startAuction(st, s) {
    let order = []; const N = st.players.length;
    for (let k = 1; k <= N; k++) { const p = st.players[(st.turn + k) % N]; if (!p.out && p.cash > 0) order.push(p.i); }
    st.buy = null; st.phase = 'auction';
    st.auction = { sq: s, high: 0, by: null, active: order, cur: 0, ms: AUCTION_MS };
    emit(st, 'auction', { sq: s, msg: `Leilão de ${SQ[s].name}` });
    checkAuction(st);
  }
  function checkAuction(st) {
    const a = st.auction;
    a.active = a.active.filter(i => a.by === i || st.players[i].cash > a.high); // quem não pode cobrir sai sozinho
    if (a.cur >= a.active.length) a.cur = 0;
    if (a.active.length > 1 && a.active[a.cur] === a.by) a.cur = (a.cur + 1) % a.active.length;
    if (a.active.length === 0 || (a.active.length === 1 && a.by === a.active[0])) closeAuction(st);
  }
  function closeAuction(st) {
    const a = st.auction;
    if (a.by !== null) {
      const w = st.players[a.by]; w.cash -= a.high; st.props[a.sq].owner = a.by; w.stats.martelo = true; tally(w, 'won'); tally(w, 'bought'); tally(w, 'spent', a.high);
      emit(st, 'sold', { who: a.by, sq: a.sq, amt: a.high, msg: `${w.name} arrematou ${SQ[a.sq].name} por ${brl(a.high)}` }); syncPux(st, a.sq);
    } else emit(st, 'unsold', { sq: a.sq, msg: `Ninguém deu lance em ${SQ[a.sq].name}` });
    st.auction = null; st.phase = 'post'; settle(st);
  }
  // lance a qualquer hora, como no Magnata; só quem está na frente não pode passar nem cobrir a si mesmo
  function auctionAct(st, i, a) {
    const A = st.auction, p = st.players[i], at = A.active.indexOf(i);
    if (at < 0) return 'Você saiu deste leilão';
    if (A.by === i) return 'Você tem o maior lance';
    if (a.type === 'pass') { A.active.splice(at, 1); if (at < A.cur) A.cur--; emit(st, 'passbid', { who: i }); checkAuction(st); return null; }
    const v = clean(a.amount);
    if (v <= A.high) return 'O lance precisa ser maior';
    if (v > p.cash) return 'Sem dinheiro para esse lance';
    A.high = v; A.by = i; A.cur = at + 1; A.ms = Math.max(A.ms ?? AUCTION_MS, AUCTION_BUMP_MS);
    emit(st, 'bid', { who: i, amt: v, msg: `${p.name} deu ${brl(v)}` });
    checkAuction(st); return null;
  }
  function auctionTick(st, dt) {
    const A = st.auction; if (!A) return;
    A.ms = (A.ms ?? AUCTION_MS) - dt;
    if (A.ms <= 0) { closeAuction(st); checkContracts(st); }
  }
  function bankrupt(st, i, to, owed) {
    const p = st.players[i], short = Math.max(0, -p.cash);
    st.credit = null; st.passes = st.passes.filter(x => x.from !== i && x.to !== i);
    for (const l of st.loans.filter(x => x.who === i)) { st.props[l.sq].lien = false; if (!st.players[l.to].out) { st.props[l.sq].owner = l.to; emit(st, 'lien', { who: i, to: l.to, sq: l.sq, msg: `${SQ[l.sq].name} era garantia e vai para ${name(st, l.to)}` }); } }
    for (const l of st.loans.filter(x => x.to === i)) st.props[l.sq].lien = false;
    st.loans = st.loans.filter(x => x.who !== i && x.to !== i);
    const mine = ownedBy(st, i);
    // o banco liquida tudo e cobre o negativo até onde der; o que faltar sai do credor, que já tinha recebido. Lugares ficam livres; falência para o banco vai a leilão
    const assets = worth(st, i) + short, back = to === null ? 0 : Math.min(owed, Math.max(0, short - assets)), paid = to === null ? 0 : owed - back;
    for (const s of mine) {
      const pr = st.props[s];
      pr.x = false;
      if (pr.h === 5) st.bank.hotels++; else if (pr.h) st.bank.houses += pr.h;
      pr.h = 0;
    }
    if (back) st.players[to].cash -= back;
    for (const s of mine) { st.props[s].owner = null; st.props[s].m = false; st.props[s].mAt = undefined; }
    for (const s of mine) syncPux(st, s);
    if (to === null) st.queue.push(...mine);
    for (const c of p.cards) st.decks[c.deck].push(c.id);
    p.cash = 0; p.cards = []; p.out = true; p.jail = false; p.outTurn = st.turns; p.outRound = st.rounds + 1;
    st.debts = st.debts.filter(d => d.who !== i).map(d => (d.to === i ? { ...d, to: null } : d));
    if (st.offer && (st.offer.from === i || st.offer.to === i)) st.offer = null;
    if (st.turn === i) { st.after = null; st.sponsor = false; st.casino = false; st.blitz = false; st.travel = false; }
    if (st.turn === i) st.buy = null;
    emit(st, 'bankrupt', { who: i, to, paid, props: mine, msg: `${p.name} faliu${to !== null ? `: ${name(st, to)} recebe ${brl(paid)} e o resto vai para o banco` : ''}` });
    const left = alive(st);
    if (left.length === 1) { st.phase = 'over'; st.winner = left[0].i; st.queue = []; st.auction = null; emit(st, 'over', { who: left[0].i, msg: `${left[0].name} venceu!` }); }
  }

  // ----- negociação -----
  const clean = v => { const n = Math.floor(Number(v)); return Number.isFinite(n) && n > 0 ? n : 0; };
  // passe livre é venda: nunca sai de graça nem volta em troca, senão dois jogadores zeram o aluguel entre si
  function passRule(st, owner, holder, gives, gets) {
    const n = gives.passes || 0; if (!n) return null;
    if (gets.passes) return 'Passe livre não pode ser trocado por passe livre';
    if (passesOf(st, holder, owner)) return `${name(st, owner)} tem passe de ${name(st, holder)}: use os que tem antes de vender os seus`;
    if (passesOf(st, owner, holder) + n > PASS_MAX) return `Cada jogador pode ter só ${PASS_MAX} passes livres de outro`;
    if (!gets.props.length && gets.cash < n * PASS_MIN) return `Cada passe livre sai por no mínimo ${brl(PASS_MIN)}, ou por uma propriedade`;
    return null;
  }
  function checkOffer(st, o) {
    const check = (i, side) => {
      const p = st.players[i];
      if (side.cash > Math.max(0, p.cash)) return `${p.name} não tem esse dinheiro`; // no vermelho dá para negociar, só não dá para oferecer dinheiro
      for (const s of side.props) { if (st.props[s]?.owner !== i) return `${SQ[s].name} não é de ${p.name}`; if (!groupClear(st, s)) return `Venda as construções do grupo de ${SQ[s].name}`; if (st.props[s].lien) return `${SQ[s].name} está de garantia num fiado`; }
      if (side.cards > p.cards.length) return `${p.name} não tem essa carta`;
      return null;
    };
    const err = check(o.from, o.give) || check(o.to, o.want) || passRule(st, o.from, o.to, o.give, o.want) || passRule(st, o.to, o.from, o.want, o.give);
    if (err) return err;
    const feeFor = side => side.props.reduce((t, s) => t + (st.props[s].m ? fee(s) : 0), 0);
    if (feeFor(o.give) && st.players[o.to].cash - o.want.cash + o.give.cash < feeFor(o.give)) return `${name(st, o.to)} não pagaria os juros da hipoteca`;
    if (feeFor(o.want) && st.players[o.from].cash - o.give.cash + o.want.cash < feeFor(o.want)) return `${name(st, o.from)} não pagaria os juros da hipoteca`;
    return null;
  }
  function applyOffer(st, o) {
    const A = st.players[o.from], B = st.players[o.to];
    A.cash += o.want.cash - o.give.cash; B.cash += o.give.cash - o.want.cash;
    const moved = [];
    const hand = (from, to, side) => {
      for (const s of side.props) { const pr = st.props[s]; pr.owner = to.i; moved.push({ sq: s, to: to.i }); if (pr.m) { to.cash -= fee(s); pr.mAt = st.rounds; } } // o prazo da penhora recomeça para o novo dono
      for (let k = 0; k < side.cards; k++) to.cards.push(from.cards.pop());
      if (side.passes) { const cur = st.passes.find(x => x.from === from.i && x.to === to.i); if (cur) cur.n += side.passes; else st.passes.push({ from: from.i, to: to.i, n: side.passes }); }
    };
    hand(A, B, o.give); hand(B, A, o.want);
    for (const m of moved) syncPux(st, m.sq);
    emit(st, 'trade', { a: o.from, b: o.to, moved, msg: `${A.name} e ${B.name} fecharam negócio` });
  }

  // ----- ações -----
  function act(st, i, a) { const err = act0(st, i, a); if (!err && st.phase === 'debt' && !st.credit) settle(st); if (!err) checkContracts(st); return err; }
  function act0(st, i, a) {
    if (st.phase === 'over') return 'A partida acabou';
    const p = st.players[i];
    if (!p || p.out) return 'Jogador fora da partida';
    if (st.credit) {
      const c = st.credit;
      if (actor(st) !== i) return 'Há um fiado aguardando resposta';
      if (a.type === 'creditYes') {
        const total = c.amt + Math.ceil(c.amt * c.rate / 100);
        st.credit = null; st.debts.shift(); st.props[c.sq].lien = true; pay(st, c.to, c.who, c.amt, 'fiado');
        st.loans.push({ who: c.who, to: c.to, amt: c.amt, total, left: c.turns, sq: c.sq });
        emit(st, 'creditOk', { who: c.who, to: c.to, sq: c.sq, msg: `${name(st, c.to)} vendeu fiado a ${name(st, c.who)}: ${brl(total)} em ${c.turns} ${c.turns === 1 ? 'vez' : 'vezes'}, com ${SQ[c.sq].name} de garantia` });
        settle(st); return null;
      }
      if (a.type === 'creditNo') { st.credit = null; emit(st, 'creditNo', { who: c.who, to: c.to, msg: `${name(st, i)} recusou o fiado` }); return null; }
      if (a.type === 'creditCounter') {
        if (c.stage !== 'ask') return 'Só dá para contrapropor uma vez';
        const r = Math.floor(Number(a.rate)); if (!(r >= 0 && r <= 50)) return 'Juros de 0 a 50%';
        c.rate = r; c.stage = 'answer'; emit(st, 'creditAsk', { who: c.who, to: c.to, msg: `${name(st, i)} pediu ${r}% de juros` }); return null;
      }
      return 'Responda o fiado primeiro';
    }
    if (a.type === 'accept' || a.type === 'reject') {
      if (!st.offer || st.offer.to !== i) return 'Nenhuma proposta para você';
      const o = st.offer; st.offer = null;
      if (a.type === 'accept') { const err = checkOffer(st, o); if (err) { emit(st, 'note', { msg: err }); return err; } applyOffer(st, o); } else emit(st, 'tradeNo', { a: o.from, b: o.to, msg: `${name(st, o.to)} recusou a proposta de ${name(st, o.from)}` });
      return null;
    }
    if (st.offer) return 'Há uma proposta aguardando resposta';
    switch (a.type) {
      case 'build': case 'sell': case 'mortgage': case 'lift': case 'offer': case 'pux': case 'repay': case 'swapc':
        if (st.phase === 'auction') return 'Espere o leilão acabar';
        return manage(st, i, a);
    }
    if (st.phase === 'auction' && (a.type === 'bid' || a.type === 'pass')) return auctionAct(st, i, a);
    if (actor(st) !== i) return 'Não é a sua vez';
    switch (a.type) {
      case 'roll': {
        if (st.phase !== 'roll') return 'Agora não dá para lançar';
        const d1 = die(st), d2 = die(st), dbl = d1 === d2, n = d1 + d2;
        st.dice = [d1, d2]; st.again = false;
        emit(st, 'dice', { a: d1, b: d2, who: i, msg: `${p.name} tirou ${d1} + ${d2}${dbl ? ' (dupla)' : ''}` });
        if (p.jail) {
          if (dbl) { p.jail = false; p.tries = 0; emit(st, 'free', { who: i, msg: `${p.name} tirou dupla e saiu da Delegacia` }); walk(st, p, n); } else {
            p.tries++;
            if (p.tries >= 3) { p.jail = false; p.tries = 0; emit(st, 'free', { who: i, msg: `${p.name} cumpriu a pena: paga a fiança e sai` }); st.after = { n }; pay(st, i, null, BAIL, 'fiança'); }
          }
        } else if (dbl) {
          st.doubles++;
          if (st.doubles >= 3) sendToJail(st, p, 'três duplas seguidas'); else { st.again = true; walk(st, p, n); }
        } else walk(st, p, n);
        settle(st); return null;
      }
      case 'bail':
        if (st.phase !== 'roll' || !p.jail) return 'Agora não';
        if (p.cash < BAIL) return 'Sem dinheiro';
        p.cash -= BAIL; p.jail = false; p.tries = 0;
        emit(st, 'pay', { from: i, to: null, amt: BAIL, why: 'fiança', msg: `${p.name} pagou a fiança` }); emit(st, 'free', { who: i }); return null;
      case 'usecard': {
        if (st.phase !== 'roll' || !p.jail) return 'Agora não';
        const c = p.cards.pop(); if (!c) return 'Você não tem a carta';
        st.decks[c.deck].push(c.id); p.jail = false; p.tries = 0;
        emit(st, 'free', { who: i, msg: `${p.name} usou o habeas corpus` }); return null;
      }
      case 'buy': {
        if (st.phase !== 'buy') return 'Agora não';
        const s = st.buy, q = SQ[s], cost = buyPrice(st, s);
        if (p.cash < cost) return 'Sem dinheiro';
        p.cash -= cost; st.props[s].owner = i; st.buy = null; tally(p, 'bought'); tally(p, 'spent', cost);
        emit(st, 'bought', { who: i, sq: s, amt: cost, msg: `${p.name} comprou ${q.name} por ${brl(cost)}` }); syncPux(st, s);
        settle(st); return null;
      }
      case 'decline':
        if (st.phase !== 'buy') return 'Agora não';
        emit(st, 'declined', { who: i, sq: st.buy, msg: `${p.name} recusou ${SQ[st.buy].name}` });
        st.buy = null; settle(st); return null; // recusar não leiloa: o lugar segue à venda para quem cair nele
      case 'bankrupt': {
        if (st.phase !== 'debt') return 'Só quando há uma dívida';
        const d = st.debts[0];
        bankrupt(st, i, d.to, d.amt); if (st.phase !== 'over') settle(st); return null;
      }
      case 'jailgo':
        if (st.phase !== 'blitz') return 'Agora não';
        st.blitz = false; sendToJail(st, p, st.crime || 'caiu na blitz'); settle(st); return null;
      case 'jeitinho': {
        if (st.phase !== 'blitz') return 'Agora não';
        if (p.cash < JEITINHO) return 'Sem dinheiro';
        st.blitz = false; p.cash -= JEITINHO; emit(st, 'pay', { from: i, to: null, amt: JEITINHO, why: 'suborno', msg: `${p.name} tentou subornar o guarda` });
        const a1 = die(st); emit(st, 'dice', { a: a1, one: true, who: i, extra: true });
        if (a1 <= 4) { p.stats.jeitinho = true; emit(st, 'blitzOk', { who: i, msg: `${p.name} passou na Blitz` }); } else { pay(st, i, null, JEITINHO, 'multa da blitz'); sendToJail(st, p, `${st.crime || 'blitz'}, e ainda tentou subornar`); }
        settle(st); return null;
      }
      case 'sponsor': {
        if (st.phase !== 'sponsor') return 'Agora não';
        const s = Number(a.sq), pr = st.props[s]; if (!pr || pr.owner !== i || pr.m) return 'Escolha um lugar seu, sem hipoteca';
        const old = st.sp, mine = old && old.who === i, lv = sponsorLevel(st, i);
        st.sp = { who: i, sq: s, lv }; st.sponsor = false;
        const what = lv === 2 ? 'aluguel em dobro' : 'aluguel +50%';
        emit(st, 'sponsor', { who: i, sq: s, lv, oldSq: old ? old.sq : null, stolen: old && !mine ? old.who : null, msg: old && !mine ? `${p.name} roubou o patrocínio de ${name(st, old.who)} para ${SQ[s].name}: ${what}` : `${p.name} tem patrocínio em ${SQ[s].name}: ${what}` });
        settle(st); return null;
      }
      case 'bet': {
        if (st.phase !== 'casino') return 'Agora não';
        const v = Math.floor(Number(a.amount)), top = maxBet(st, i), pk = a.pick;
        if (!(v >= CASINO.min && v <= top)) return `Aposte de ${brl(CASINO.min)} a ${brl(top)}`;
        if (a.game !== 'roleta' || !(pk === 'red' || pk === 'black' || (Number.isInteger(pk) && pk >= 0 && pk <= 36))) return 'Aposta inválida';
        st.casino = false; pay(st, i, null, v, 'aposta'); emit(st, 'casinoBet', { who: i, game: a.game });
        const n = Math.floor(rand(st) * 37), color = n === 0 ? 'green' : CASINO.red.includes(n) ? 'red' : 'black';
        const mult = pk === color ? CASINO.color : pk === n ? CASINO.number : 0, shown = `${n}${n ? `, ${color === 'red' ? 'vermelho' : 'preto'}` : ', zero'}`;
        emit(st, 'casinoSpin', { who: i, num: n, color }); // `n` é reservado: a sala numera os eventos com ele
        const won = Math.floor(mult * v); tally(p, 'casino', won - v);
        emit(st, 'casinoResult', { who: i, won, bet: v, shown, game: a.game, pick: pk, msg: `${p.name} ${won ? 'ganhou ' + brl(won) : 'perdeu ' + brl(v)} no Cassino (deu ${shown})` });
        if (won) gain(st, i, won, 'cassino');
        emit(st, 'casinoEnd'); settle(st); return null;
      }
      case 'nobet':
        if (st.phase !== 'casino') return 'Agora não';
        st.casino = false; emit(st, 'casinoEnd'); settle(st); return null;
      case 'nosponsor':
        if (st.phase !== 'sponsor') return 'Agora não';
        st.sponsor = false; settle(st); return null;
      case 'travel': {
        if (st.phase !== 'travel') return 'Agora não';
        if (Number(a.to) !== nextRail(p.pos)) return 'Só dá para voar até o próximo aeroporto';
        const to = nextRail(p.pos);
        const own = st.props[p.pos].owner === i, cost = own ? 0 : TRAVEL;
        if (p.cash < cost) return 'Sem dinheiro';
        st.travel = false; if (cost) { p.cash -= cost; emit(st, 'pay', { from: i, to: null, amt: cost, why: 'passagem', msg: `${p.name} comprou uma passagem` }); }
        const from = p.pos; p.pos = to; emit(st, 'travel', { who: i, from, to, msg: `${p.name} viajou para ${SQ[to].name}` });
        land(st, p, { noTravel: true, noBuy: true }); settle(st); return null;
      }
      case 'stay':
        if (st.phase !== 'travel') return 'Agora não';
        st.travel = false; settle(st); return null;
      case 'fiado': {
        if (st.phase !== 'debt' || !on(st, 'fiado')) return 'Agora não';
        const d = st.debts[0], err = fiadoError(st, i, d, a.sq); if (err) return err;
        const rate = Math.floor(Number(a.rate)), turns = Math.floor(Number(a.turns));
        if (!(rate >= 0 && rate <= 50)) return 'Juros de 0 a 50%';
        if (!(turns >= 1 && turns <= 3)) return 'Prazo de 1 a 3 vezes';
        d.asked = true; st.credit = { who: i, to: d.to, amt: -p.cash, rate, turns, sq: a.sq, stage: 'ask' };
        emit(st, 'creditAsk', { who: i, to: d.to, msg: `${p.name} pediu fiado a ${name(st, d.to)}` }); return null;
      }
      case 'end':
        if (st.phase !== 'post') return 'Agora não';
        nextTurn(st); return null;
    }
    return 'Ação desconhecida';
  }
  function fiadoError(st, i, d, s) {
    if (!d || d.to === null) return 'Fiado só vale para dívida com outro jogador';
    if (d.who !== i) return 'A dívida não é sua';
    if (d.asked) return 'Você já pediu fiado para esta conta';
    if (loanOf(st, i)) return 'Você já tem um fiado aberto';
    // o fiado cobre só o que falta: o resto da conta já foi pago
    const short = -st.players[i].cash, C = st.players[d.to];
    if (short <= 0) return 'Seu saldo já está em dia';
    if (C.out || C.cash < short) return `${C.name} não tem dinheiro para vender fiado`;
    if (s === undefined) return null;
    const pr = st.props[s];
    if (!pr || pr.owner !== i) return 'A garantia precisa ser sua';
    if (!tradable(st, s) || pr.m) return 'Esse lugar não serve de garantia';
    if (SQ[s].price < short) return 'A garantia precisa valer mais que a dívida';
    return null;
  }
  function manage(st, i, a) {
    const p = st.players[i], s = a.sq, q = SQ[s];
    if (a.type === 'pux') {
      const err = canPux(st, i, s); if (err) return err;
      const cost = buildCost(st, s); p.cash -= cost; st.props[s].x = true;
      emit(st, 'pux', { who: i, sq: s, on: true, amt: cost, msg: `${p.name} levantou um puxadinho em ${q.name}` });
    } else if (a.type === 'repay') {
      const l = loanOf(st, i); if (!l) return 'Você não tem fiado aberto';
      if (p.cash < l.total) return 'Sem dinheiro';
      endLoan(st, l); pay(st, i, l.to, l.total, 'fiado');
    } else if (a.type === 'swapc') {
      if (!on(st, 'contracts') || !p.swap) return 'Só depois de passar pelo Marco Zero';
      const k = p.contracts.indexOf(Number(a.id)); if (k < 0 || !st.decks.contracts.length) return 'Contrato inválido';
      st.decks.contracts.push(p.contracts[k]); p.contracts[k] = st.decks.contracts.shift(); p.swap = false;
      emit(st, 'note', { msg: `${p.name} trocou um contrato` });
    } else if (a.type === 'build') {
      const err = canBuild(st, i, s); if (err) return err;
      const pr = st.props[s], cost = buildCost(st, s); p.cash -= cost; tally(p, 'built');
      if (pr.h === 4) { st.bank.hotels--; st.bank.houses += 4; pr.h = 5; } else { st.bank.houses--; pr.h++; }
      emit(st, 'build', { who: i, sq: s, h: pr.h, amt: cost, msg: `${p.name} construiu ${LEVEL_ART[pr.h]} em ${q.name}` });
    } else if (a.type === 'sell') {
      const err = canSell(st, i, s); if (err) return err;
      const pr = st.props[s], half = q.house / 2;
      if (pr.x) { pr.x = false; p.cash += half; emit(st, 'pux', { who: i, sq: s, on: false, amt: half, msg: `${p.name} vendeu o puxadinho de ${q.name}` }); } else if (pr.h === 5) {
        const back = Math.min(4, st.bank.houses); // sem casas no banco, o hotel desce até o que houver
        st.bank.hotels++; st.bank.houses -= back; p.cash += half * (5 - back); pr.h = back;
        emit(st, 'sellb', { who: i, sq: s, h: pr.h, amt: half * (5 - back), msg: `${p.name} vendeu o hotel de ${q.name}` });
      } else {
        st.bank.houses++; pr.h--; p.cash += half;
        emit(st, 'sellb', { who: i, sq: s, h: pr.h, amt: half, msg: `${p.name} vendeu ${LEVEL_ART[pr.h + 1]} de ${q.name}` });
      }
    } else if (a.type === 'mortgage') {
      const err = canMortgage(st, i, s); if (err) return err;
      st.props[s].m = true; st.props[s].mAt = st.rounds; p.cash += mortgageValue(s);
      emit(st, 'mortgage', { who: i, sq: s, on: true, amt: mortgageValue(s), msg: `${p.name} hipotecou ${q.name}` });
    } else if (a.type === 'lift') {
      const err = canLift(st, i, s); if (err) return err;
      const cost = liftCost(st, s); st.props[s].m = false; st.props[s].mAt = undefined; p.cash -= cost;
      emit(st, 'mortgage', { who: i, sq: s, on: false, amt: cost, msg: `${p.name} pagou a hipoteca de ${q.name}` });
    } else if (a.type === 'offer') {
      const side = v => ({ cash: clean(v?.cash), props: Array.isArray(v?.props) ? [...new Set(v.props.map(Number))] : [], cards: clean(v?.cards), passes: on(st, 'passes') ? Math.min(PASS_MAX, clean(v?.passes)) : 0 });
      if (!st.players[a.to] || st.players[a.to].out || a.to === i) return 'Escolha outro jogador';
      const o = { from: i, to: a.to, give: side(a.give), want: side(a.want) };
      if (!o.give.cash && !o.want.cash && !o.give.props.length && !o.want.props.length && !o.give.cards && !o.want.cards && !o.give.passes && !o.want.passes) return 'A proposta está vazia';
      const err = checkOffer(st, o); if (err) return err;
      st.offer = o;
      emit(st, 'offered', { from: i, to: a.to, msg: `${p.name} fez uma proposta a ${name(st, a.to)}` });
    }
    return null;
  }

  // ----- bots -----
  function valueOf(st, viewer, s, gaining) { // quanto um lugar vale para quem está decidindo
    const q = SQ[s], g = GROUP_OF[q.g], mine = g.filter(x => st.props[x].owner === viewer && x !== s).length;
    let v = st.props[s]?.m ? q.price * 0.55 : q.price;
    if (gaining && mine === g.length - 1) v += q.price * 2.2 + (q.house || 0) * 3;
    else if (gaining && mine > 0) v += q.price * 0.4;
    if (!gaining && mine === g.length - 1) v += q.price * 2.2; // perderia um grupo fechado
    return v;
  }
  function botBuyLimit(st, i, s) {
    const q = SQ[s], g = GROUP_OF[q.g], mine = g.filter(x => st.props[x].owner === i).length;
    let limit = q.price * (0.9 + st.rounds * 0.004);
    if (mine) limit *= mine === g.length - 1 ? 2 : 1.35;
    for (const o of st.players) if (o.i !== i && !o.out && g.filter(x => st.props[x].owner === o.i).length === g.length - 1) limit *= 1.5; // não deixa o outro fechar
    return Math.min(st.players[i].cash - 25, Math.floor(limit));
  }
  function botRaise(st, i) {
    const mine = ownedBy(st, i);
    const pux = mine.find(s => st.props[s].x); if (pux !== undefined) return { type: 'sell', sq: pux };
    const free = mine.filter(s => !st.props[s].m && !st.props[s].lien && groupClear(st, s)).sort((a, b) => (hasMonopoly(st, a) - hasMonopoly(st, b)) || SQ[a].price - SQ[b].price);
    if (free.length) return { type: 'mortgage', sq: free[0] };
    const built = mine.filter(s => !canSell(st, i, s)).sort((a, b) => SQ[a].house - SQ[b].house);
    if (built.length) return { type: 'sell', sq: built[0] };
    return null;
  }
  function botManage(st, i) {
    const p = st.players[i], reserve = 80 + st.rounds;
    if (on(st, 'mortgage')) { const due = ownedBy(st, i).find(s => st.props[s].m && roundsToSeize(st, s) <= 2 && !canLift(st, i, s)); if (due !== undefined) return { type: 'lift', sq: due }; }
    if (p.cash > reserve + 100) {
      const m = ownedBy(st, i).filter(s => st.props[s].m && !canLift(st, i, s)).sort((a, b) => hasMonopoly(st, b) - hasMonopoly(st, a));
      if (m.length && p.cash - liftCost(st, m[0]) > reserve) return { type: 'lift', sq: m[0] };
    }
    const l = loanOf(st, i); if (l && p.cash - l.total > reserve) return { type: 'repay' };
    const b = ownedBy(st, i).filter(s => !canBuild(st, i, s) && p.cash - buildCost(st, s) > reserve).sort((x, y) => (SQ[y].rent?.[3] || 0) - (SQ[x].rent?.[3] || 0));
    if (b.length) return { type: 'build', sq: b[0] };
    const px = ownedBy(st, i).filter(s => !canPux(st, i, s) && p.cash - buildCost(st, s) > reserve + 130).sort((x, y) => SQ[y].rent[0] - SQ[x].rent[0]);
    if (px.length) return { type: 'pux', sq: px[0] };
    return null;
  }
  function botPropose(st, i) {
    const p = st.players[i], mem = st.mem[i] = st.mem[i] || {};
    for (const g of Object.values(GROUP_OF)) {
      if (SQ[g[0]].k === 'util') continue;
      const mine = g.filter(s => st.props[s].owner === i);
      const others = g.filter(s => st.props[s].owner !== i && st.props[s].owner !== null);
      if (!mine.length || !others.length || mine.length + others.length < g.length) continue;
      if (SQ[g[0]].k === 'prop' && (others.length !== 1)) continue;
      for (const want of others) {
        const owner = st.props[want].owner;
        if (!groupClear(st, want) || !groupClear(st, mine[0])) continue;
        const key = 'w' + want;
        if (mem[key] !== undefined && st.rounds - mem[key] < 6) continue;
        mem[key] = st.rounds;
        const q = SQ[want], mult = Math.min(3.2, 1.5 + st.rounds * 0.03), cash = Math.floor(q.price * mult / 10) * 10;
        // troca: dou um lugar que feche o grupo dele em troca do que fecha o meu
        const swap = ownedBy(st, i).find(s => { const gg = GROUP_OF[SQ[s].g]; return s !== want && SQ[s].k === 'prop' && SQ[s].g !== q.g && groupClear(st, s) && gg.length > 1 && gg.filter(x => x !== s).every(x => st.props[x].owner === owner); });
        const offer = swap !== undefined
          ? { type: 'offer', to: owner, give: { cash: 0, props: [swap] }, want: { cash: 0, props: [want] } }
          : p.cash - cash >= 80 ? { type: 'offer', to: owner, give: { cash, props: [] }, want: { cash: 0, props: [want] } }
            : on(st, 'passes') ? { type: 'offer', to: owner, give: { cash: 0, props: [], passes: 3 }, want: { cash: 0, props: [want] } } : null;
        if (offer && !checkOffer(st, { from: i, to: owner, give: { cards: 0, ...offer.give }, want: { cards: 0, ...offer.want } })) return offer;
      }
    }
    return null;
  }
  // o que cada passe custa a quem dá: uma fração do aluguel médio das propriedades dele
  function passValue(st, owner) {
    const mine = ownedBy(st, owner); if (!mine.length) return 5;
    return Math.max(15, Math.round(mine.reduce((t, s) => t + rawRent(st, s, { total: 7 }), 0) / mine.length * .6));
  }
  function botAction(st, i) {
    const p = st.players[i];
    if (st.credit) {
      if (actor(st) !== i) return null;
      const c = st.credit;
      if (c.stage === 'ask') return c.rate >= 12 ? { type: 'creditYes' } : p.cash > 130 ? { type: 'creditCounter', rate: 15 } : { type: 'creditNo' };
      return { type: c.rate <= 30 ? 'creditYes' : 'creditNo' };
    }
    if (st.offer) {
      if (st.offer.to !== i) return null;
      const o = st.offer; let net = o.give.cash - o.want.cash + (o.give.cards - o.want.cards) * 35 + (o.give.passes || 0) * passValue(st, o.from) - (o.want.passes || 0) * passValue(st, i);
      const ps = st.players[i].cash;
      for (const s of o.give.props) net += valueOf(st, i, s, true);
      for (const s of o.want.props) { net -= valueOf(st, i, s, false); if (GROUP_OF[SQ[s].g].every(x => x === s || st.props[x].owner === o.from)) net -= SQ[s].price * 1.1; }
      const after = ps + o.give.cash - o.want.cash;
      return { type: net > 0 && after >= 0 && !checkOffer(st, o) ? 'accept' : 'reject' };
    }
    if (st.phase !== 'auction' && actor(st) !== i) return null; // no leilão qualquer um decide a qualquer hora
    if (st.phase === 'debt') {
      const d = st.debts[0];
      if (on(st, 'fiado') && !fiadoError(st, i, d)) {
        const g = ownedBy(st, i).filter(s => !fiadoError(st, i, d, s)).sort((a, b) => SQ[a].price - SQ[b].price)[0];
        if (g !== undefined) return { type: 'fiado', sq: g, rate: 15, turns: 3 };
      }
      return botRaise(st, i) || { type: 'bankrupt' };
    }
    if (st.phase === 'auction') {
      const A = st.auction, lim = botBuyLimit(st, i, A.sq), next = A.high + (A.high < 70 ? 5 : 15);
      return next <= lim && next <= p.cash ? { type: 'bid', amount: next } : { type: 'pass' };
    }
    if (st.phase === 'buy') {
      const cost = buyPrice(st, st.buy), early = st.rounds < 12;
      if (p.cash >= cost && (p.cash - cost >= (early ? 40 : 100) || botBuyLimit(st, i, st.buy) >= cost)) return { type: 'buy' };
      return { type: 'decline' };
    }
    if (st.phase === 'casino') { const g = 'roleta'; return p.cash >= 500 && st.turns % 3 === 0 ? { type: 'bet', game: g, pick: 'red', amount: Math.min(maxBet(st, i), 25) } : { type: 'nobet' }; }
    if (st.phase === 'sponsor') { const own = ownedBy(st, i).filter(s => !st.props[s].m).sort((a, b) => (rentOf(st, b) || 0) - (rentOf(st, a) || 0)); return own.length ? { type: 'sponsor', sq: own[0] } : { type: 'nosponsor' }; }
    if (st.phase === 'blitz') {
      const open = OWNABLE.filter(s => st.props[s].owner === null).length;
      return { type: p.cash >= JEITINHO * 3 && open > 4 ? 'jeitinho' : 'jailgo' };
    }
    if (st.phase === 'travel') return { type: 'stay' };
    const m = botManage(st, i);
    if (st.phase === 'roll') {
      if (m) return m;
      const pr = botPropose(st, i); if (pr) return pr;
      if (p.jail) {
        const open = OWNABLE.filter(s => st.props[s].owner === null).length;
        if (p.cards.length && open > 4) return { type: 'usecard' };
        if (p.cash >= BAIL + 70 && open > 6) return { type: 'bail' };
      }
      return { type: 'roll' };
    }
    if (m) return m;
    return { type: 'end' };
  }
  const drain = st => st.ev.splice(0);

  const E = { LEVELS, nextRail, auctionTick, CASINO, maxBet, SPONSOR, sponsored, sponsorLevel, newGame, act, actor, botAction, drain, rentOf, canBuild, canSell, canMortgage, canLift, canPux, ownedBy, hasMonopoly, worth, mortgageValue, liftCost, roundsToSeize, buildCost, buyPrice, fee, groupClear, tradable, loanOf, passesOf, fiadoError, rentScale, GROUP_OF, OWNABLE, PASS_MIN, startAuction, checkOffer, JAIL, BAIL, SALARY, RULES, CONTRACTS, JEITINHO, TRAVEL, PUX_MAX, PASS_MAX, MORT, brl };
  if (typeof module !== 'undefined') module.exports = E; else root.Engine = E;
})(typeof window !== 'undefined' ? window : globalThis);
