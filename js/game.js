// ===== Magnata: motor de regras (roda somente no anfitrião) =====
// Segue as regras clássicas do jogo de compra e venda de propriedades:
// leilão obrigatório, estoque de 32 casas / 12 hotéis, construção uniforme,
// hipoteca (+10% para quitar), cartas de saída livre negociáveis, falência ao banco ou a um jogador.
const Magnata = (() => {
  const rnd = n => 1 + Math.floor(Math.random() * n);
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const money = fmtMoney;
  const AUCTION_MS = 20000, AUCTION_BUMP_MS = 10000, JAIL_FINE = ECON.JAIL_FINE, GO_SALARY = ECON.GO;

  let nameOf = id => id; // substituído pela UI
  // linha do tempo de eventos visuais da última ação (a UI toca em sequência)
  let EV = null; const emit = e => { if (EV) EV.push(e); };
  function log(st, msg) { st.log.push({ t: Date.now(), msg }); if (st.log.length > 150) st.log.shift(); }

  function newGame(room) {
    const st = {
      gameId: 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      players: room.players.map(p => ({
        id: p.id, money: room.settings.startMoney, pos: 0, inJail: false, jailTurns: 0,
        jailCards: [], bankrupt: false, debtTo: null,
      })),
      props: {}, bank: { houses: 32, hotels: 12 }, upgrade: null,
      turn: 0, rolled: false, extra: false, doubles: 0, pending: null,
      auction: null, auctionQueue: [],
      round: 1, maxRounds: room.settings.maxRounds, seq: 0,
      turnMs: (room.settings.turnSec ?? 90) * 1000, deadline: 0, afk: null,
      lastRoll: null, lastCard: null, trade: null, log: [], result: null,
      decks: { fortuna: shuffle([...CARDS.fortuna.keys()]), evento: shuffle([...CARDS.evento.keys()]) },
    };
    TILES.forEach((t, i) => { if (OWNABLE(t)) st.props[i] = { owner: null, houses: 0, mortgaged: false }; });
    // quem tirar o maior valor nos dados começa (ordem decrescente)
    log(st, `🎲 A partida começou! ${room.players.length} jogadores. Cada um lança os dados para definir a ordem:`);
    const rolls = st.players.map(p => ({ p, v: rnd(6) + rnd(6), tie: Math.random() }));
    rolls.sort((a, b) => b.v - a.v || b.tie - a.tie);
    rolls.forEach(r => log(st, `   ${nameOf(r.p.id)} tirou ${r.v}`));
    st.players = rolls.map(r => r.p);
    log(st, `➡️ ${nameOf(st.players[0].id)} começa!`);
    st.fx = { id: ++st.seq, events: [{ k: 'turn', pid: st.players[0].id }] };
    if (st.turnMs) st.deadline = Date.now() + st.turnMs + 2500;
    return st;
  }

  const pl = (st, id) => st.players.find(p => p.id === id);
  const cur = st => st.players[st.turn];
  const alive = st => st.players.filter(p => !p.bankrupt);

  function groupTiles(g) { return TILES.map((t, i) => [t, i]).filter(([t]) => t.group === g).map(([, i]) => i); }
  function ownsGroup(st, pid, g) { return groupTiles(g).every(i => st.props[i].owner === pid); }
  function countType(st, pid, type) { return TILES.reduce((n, t, i) => n + (t.type === type && st.props[i]?.owner === pid ? 1 : 0), 0); }
  const groupHasBuildings = (st, g) => groupTiles(g).some(i => st.props[i].houses > 0);

  // upgrade do Ateliê: nível N multiplica o aluguel por N+1
  function upgradeMult(st, idx) {
    const u = st.upgrade;
    return u && u.tile === +idx && st.props[idx]?.owner === u.owner ? UPGRADE.mult(u.level) : 1;
  }
  const round500 = v => Math.round(v / 500) * 500;
  function rentOf(st, idx, diceSum) { return round500(baseRent(st, idx, diceSum) * upgradeMult(st, idx) * inflation(st)); }
  // reta final: aluguéis sobem a cada rodada desde que ela começou
  function inflation(st) { return st.late ? Math.min(ECON.LATE.max, 1 + ECON.LATE.rate * (st.round - st.late)) : 1; }
  function checkLate(st) {
    if (st.late || st.result) return;
    const al = alive(st).length;
    if ((st.players.length >= 3 && al <= 2) || st.round >= ECON.LATE.round) {
      st.late = st.round; emit({ k: 'late' });
      log(st, `📈 Reta final! ${al <= 2 && st.players.length >= 3 ? 'Só restam dois magnatas' : 'O mercado esquentou'}: acabam as ajudas a quem está atrás e os aluguéis sobem ${Math.round(ECON.LATE.rate * 100)}% a cada rodada.`);
    }
  }
  function baseRent(st, idx, diceSum) {
    const t = TILES[idx], pr = st.props[idx];
    if (!pr || !pr.owner || pr.mortgaged) return 0;
    if (t.type === 'street') {
      if (pr.houses > 0) return t.rent[pr.houses];
      return ownsGroup(st, pr.owner, t.group) ? t.rent[0] * 2 : t.rent[0];
    }
    if (t.type === 'station') return ECON.STATION * 2 ** (countType(st, pr.owner, 'station') - 1);
    if (t.type === 'utility') return (diceSum || 7) * (countType(st, pr.owner, 'utility') === 2 ? ECON.UTIL2 : ECON.UTIL1);
    return 0;
  }

  function netWorth(st, p) {
    let v = p.money;
    for (const [i, pr] of Object.entries(st.props)) {
      if (pr.owner !== p.id) continue;
      const t = TILES[i];
      v += pr.mortgaged ? t.price / 2 : t.price;
      if (t.type === 'street') v += pr.houses * GROUPS[t.group].house;
    }
    return v;
  }

  function pay(st, p, amt, toId) {
    p.money -= amt; if (amt) emit({ k: 'money', pid: p.id, amount: -amt });
    const to = toId ? pl(st, toId) : null;
    if (to) receive(to, amt);
    if (p.money < 0) { p.debtTo = toId || null; log(st, `⚠️ ${nameOf(p.id)} está devendo ${money(-p.money)}! Venda edifícios/hipoteque ou declare falência.`); }
  }
  function receive(p, amt) { p.money += amt; if (amt) emit({ k: 'money', pid: p.id, amount: amt }); if (p.money >= 0) p.debtTo = null; }

  // transfere uma propriedade a outro jogador; se hipotecada, o novo dono paga 10% de juros ao banco
  function loseUpgrade(st, i) {
    if (st.upgrade && st.upgrade.tile === +i) { log(st, `⭐ O upgrade de ${TILES[i].name} se perdeu com a troca de dono.`); st.upgrade = null; }
  }
  function transferProp(st, i, toId) {
    loseUpgrade(st, i);
    const pr = st.props[i]; pr.owner = toId; pr.paid = TILES[i].price;
    if (pr.mortgaged) {
      const fee = Math.ceil(TILES[i].price / 2 * 0.1);
      pay(st, pl(st, toId), fee, null);
      log(st, `🏦 ${nameOf(toId)} pagou ${money(fee)} (10%) para manter a hipoteca de ${TILES[i].name}.`);
    }
  }

  function sendToJail(st, p) {
    emit({ k: 'jump', pid: p.id, from: p.pos, to: JAIL_POS });
    p.pos = JAIL_POS; p.inJail = true; p.jailTurns = 0;
    st.extra = false; st.doubles = 0;
    log(st, `🚓 ${nameOf(p.id)} foi levado à Delegacia! (não recebe ${money(GO_SALARY)} da Partida)`);
  }

  // posição do jogador em patrimônio: 'last' (último), 'behind' (abaixo da média), 'ahead' (bem acima)
  function standing(st, p) {
    const al = alive(st); if (al.length < 2) return { pos: 'mid', me: 0, avg: 0 };
    const w = al.map(x => netWorth(st, x)), me = netWorth(st, p), avg = w.reduce((s, x) => s + x, 0) / w.length;
    const pos = me === Math.min(...w) && me < avg * .85 ? 'last' : me < avg * .9 ? 'behind' : me > avg * 1.15 ? 'ahead' : 'mid';
    return { pos, me, avg };
  }
  function passGo(st, p) {
    const s = standing(st, p);
    // recuperação: quem está em último recebe mais
    const salary = s.pos === 'last' && !st.late ? round500(GO_SALARY * ECON.CATCHUP_GO) : GO_SALARY;
    receive(p, salary);
    log(st, `💰 ${nameOf(p.id)} passou pela Partida e recebeu ${money(salary)}${salary > GO_SALARY ? ' (bônus de recuperação para o último colocado)' : ''}.`);
    // taxa de fortuna: quem está muito acima da média paga uma parte do excesso
    if (!st.late && s.avg && s.me > s.avg * ECON.WEALTH_TAX.above) {
      const tax = Math.min(ECON.WEALTH_TAX.max, Math.max(0, p.money), Math.round((s.me - s.avg) * ECON.WEALTH_TAX.rate / 5000) * 5000);
      if (tax > 0) { pay(st, p, tax, null); log(st, `💼 Taxa de fortuna: ${nameOf(p.id)} está muito à frente e pagou ${money(tax)} ao banco.`); }
    }
  }
  function moveBy(st, p, n, diceSum) {
    emit({ k: 'walk', pid: p.id, from: p.pos, steps: n });
    const np = p.pos + n;
    if (np >= 40) passGo(st, p);
    p.pos = np % 40;
    land(st, p, diceSum);
  }
  function moveTo(st, p, to, diceSum, opts) {
    emit({ k: 'walk', pid: p.id, from: p.pos, steps: (to - p.pos + 40) % 40 });
    if (to < p.pos || (to === 0 && p.pos !== 0)) passGo(st, p);
    p.pos = to;
    land(st, p, diceSum, opts);
  }

  function land(st, p, diceSum, opts = {}) {
    const t = TILES[p.pos];
    if (OWNABLE(t)) {
      const pr = st.props[p.pos];
      if (!pr.owner) { st.pending = { type: 'buy', tile: p.pos }; log(st, `📍 ${nameOf(p.id)} parou em ${t.name} (à venda por ${money(t.price)}).`); }
      else if (pr.owner !== p.id) {
        const owner = pl(st, pr.owner);
        if (pr.mortgaged || owner.bankrupt) { emit({ k: 'land', kind: 'mortgaged', pid: p.id, tile: p.pos, owner: pr.owner }); log(st, `📍 ${nameOf(p.id)} parou em ${t.name} (hipotecada, sem aluguel).`); }
        else {
          let r;
          if (t.type === 'utility') {
            // serviços: lança os dados de novo para calcular o aluguel
            const a = rnd(6), b = rnd(6);
            const mult = opts.utilityTimes10 ? ECON.UTIL2 : (countType(st, pr.owner, 'utility') === 2 ? ECON.UTIL2 : ECON.UTIL1);
            const um = upgradeMult(st, p.pos);
            r = round500((a + b) * mult * um);
            st.lastRoll = { id: ++st.seq, dice: [a, b], pid: p.id, utility: true };
            emit({ k: 'roll', pid: p.id, dice: [a, b], utility: true });
            log(st, `🎲 Dados para o serviço: ${a} + ${b} = ${a + b} × ${money(mult)}${um > 1 ? ' × ' + um + ' (upgrade)' : ''}.`);
          } else {
            r = rentOf(st, p.pos, diceSum) * (opts.doubleRent ? 2 : 1);
          }
          const um2 = upgradeMult(st, p.pos);
          emit({ k: 'land', kind: 'rent', pid: p.id, tile: p.pos, owner: pr.owner, amount: r, houses: pr.houses, mult: um2 });
          pay(st, p, r, pr.owner);
          log(st, `🏠 ${nameOf(p.id)} pagou ${money(r)} de aluguel a ${nameOf(pr.owner)} em ${t.name}${um2 > 1 ? ` (⭐ upgrade ×${String(um2).replace('.', ',')})` : ''}.`);
        }
      } else if (improveOptions(st, p, p.pos).length) {
        st.pending = { type: 'improve', tile: p.pos };
        log(st, `🏗️ ${nameOf(p.id)} parou na própria ${t.name} e pode construir.`);
      } else { emit({ k: 'land', kind: 'own', pid: p.id, tile: p.pos }); log(st, `📍 ${nameOf(p.id)} parou na própria propriedade ${t.name}.`); }
    } else if (t.type === 'tax') { emit({ k: 'land', kind: 'tax', pid: p.id, tile: p.pos, amount: t.amount }); pay(st, p, t.amount, null); log(st, `🧾 ${nameOf(p.id)} pagou ${money(t.amount)} de ${t.name}.`); }
    else if (t.type === 'fortuna' || t.type === 'evento') drawCard(st, p, t.type, diceSum);
    else if (t.type === 'gotojail') { emit({ k: 'land', kind: 'gotojail', pid: p.id, tile: p.pos }); sendToJail(st, p); }
    else if (t.type === 'upgrade') landUpgrade(st, p);
    else if (t.type === 'jail') { emit({ k: 'land', kind: 'visit', pid: p.id, tile: p.pos }); log(st, `👀 ${nameOf(p.id)} está só visitando a Delegacia.`); }
    else if (t.type === 'start') emit({ k: 'land', kind: 'start', pid: p.id, tile: p.pos });
  }

  // ===== Ateliê do Arquiteto: só existe UM upgrade na partida =====
  function landUpgrade(st, p) {
    const mine = Object.keys(st.props).filter(i => st.props[i].owner === p.id);
    const u = st.upgrade;
    if (!mine.length) { emit({ k: 'land', kind: 'noupgrade', pid: p.id, tile: p.pos }); log(st, `⭐ ${nameOf(p.id)} chegou ao Ateliê do Arquiteto, mas não tem propriedades para melhorar.`); return; }
    st.pending = { type: 'upgrade' };
    if (u && u.owner !== p.id) log(st, `⭐ ${nameOf(p.id)} chegou ao Ateliê do Arquiteto e vai ROUBAR o upgrade de ${nameOf(u.owner)}!`);
    else if (u) log(st, `⭐ ${nameOf(p.id)} voltou ao Ateliê! Pode acumular o upgrade em ${TILES[u.tile].name} ou mudá-lo de lugar.`);
    else log(st, `⭐ ${nameOf(p.id)} chegou ao Ateliê do Arquiteto! Escolha uma propriedade para o upgrade.`);
  }

  function drawCard(st, p, deck, diceSum) {
    const d = st.decks[deck];
    const c0 = CARDS[deck][d[0]], pos = standing(st, p).pos;
    const bad = c0.fx === 'jail' || c0.fx === 'repairs' || (c0.fx === 'money' && c0.amount < 0) || (c0.fx === 'each' && c0.amount < 0);
    const good = c0.fx === 'jailCard' || (c0.fx === 'money' && c0.amount > 0) || (c0.fx === 'each' && c0.amount > 0) || (c0.fx === 'moveTo' && c0.to === 0);
    if (!st.late && (((pos === 'last' || pos === 'behind') && bad) || (pos === 'ahead' && good))) { if (Math.random() < ECON.CARD_LUCK) d.push(d.shift()); }
    const ci = d.shift();
    const c = CARDS[deck][ci];
    if (c.fx === 'jailCard') p.jailCards.push(deck); // fica com o jogador até ser usada
    else d.push(ci); // volta para o fundo do baralho
    st.lastCard = { id: ++st.seq, deck, text: c.text, pid: p.id };
    emit({ k: 'card', pid: p.id, deck, text: c.text });
    log(st, `${deck === 'fortuna' ? '🍀' : '⚡'} ${nameOf(p.id)} tirou: “${c.text}”`);
    switch (c.fx) {
      case 'money': c.amount >= 0 ? receive(p, c.amount) : pay(st, p, -c.amount, null); break;
      case 'moveTo': moveTo(st, p, c.to, diceSum); break;
      case 'back': emit({ k: 'walk', pid: p.id, from: p.pos, steps: -c.n }); p.pos = (p.pos - c.n + 40) % 40; land(st, p, diceSum); break;
      case 'jail': sendToJail(st, p); break;
      case 'jailCard': break;
      case 'nearestStation': { let i = p.pos; do { i = (i + 1) % 40; } while (TILES[i].type !== 'station'); moveTo(st, p, i, diceSum, { doubleRent: true }); break; }
      case 'nearestUtility': { let i = p.pos; do { i = (i + 1) % 40; } while (TILES[i].type !== 'utility'); moveTo(st, p, i, diceSum, { utilityTimes10: true }); break; }
      case 'each':
        for (const o of alive(st)) if (o.id !== p.id) {
          if (c.amount > 0) pay(st, o, c.amount, p.id);
          else pay(st, p, -c.amount, o.id);
        }
        break;
      case 'repairs': {
        let h = 0, H = 0;
        for (const pr of Object.values(st.props)) if (pr.owner === p.id) { if (pr.houses === 5) H++; else h += pr.houses; }
        const cost = h * c.house + H * c.hotel;
        if (cost) pay(st, p, cost, null);
        log(st, `🔧 Reformas: ${money(cost)}.`);
        break;
      }
    }
  }

  // ===== leilões =====
  function startAuction(st, tile) {
    st.auction = { id: ++st.seq, tile, high: 0, bidder: null, passed: [], deadline: Date.now() + AUCTION_MS + FX.duration(EV || []) };
    emit({ k: 'auction', tile });
    log(st, `🔨 Leilão de ${TILES[tile].name}! Lance mínimo ${money(ECON.MIN_BID)}. Todos podem participar.`);
  }
  function nextAuction(st) {
    st.auction = null;
    while (st.auctionQueue.length) {
      const t = st.auctionQueue.shift();
      if (!st.props[t].owner) return startAuction(st, t);
    }
  }
  function closeAuction(st) {
    const a = st.auction; if (!a) return;
    const t = TILES[a.tile];
    if (a.bidder && pl(st, a.bidder) && !pl(st, a.bidder).bankrupt && pl(st, a.bidder).money >= a.high) {
      const b = pl(st, a.bidder); b.money -= a.high; st.props[a.tile].owner = b.id; st.props[a.tile].paid = a.high;
      emit({ k: 'money', pid: b.id, amount: -a.high }); emit({ k: 'sold', pid: b.id, tile: a.tile });
      log(st, `🔨 Vendido! ${nameOf(b.id)} arrematou ${t.name} por ${money(a.high)}.`);
    } else log(st, `🔨 Ninguém quis ${t.name}. A propriedade continua com o banco.`);
    nextAuction(st);
  }
  function checkAuction(st) {
    const a = st.auction; if (!a) return;
    const left = alive(st).filter(p => !a.passed.includes(p.id));
    if (left.length === 0 || (left.length === 1 && left[0].id === a.bidder)) closeAuction(st);
  }
  function auctionTimeout(st) {
    if (!(st.auction && Date.now() >= st.auction.deadline - 50)) return false;
    EV = []; closeAuction(st);
    // a vez de quem estava esperando o leilão recomeça a contar quando ele termina
    if (st.turnMs && !st.result && !st.auction) st.deadline = Date.now() + (st.afk === cur(st).id ? AUTO_STEP_MS : st.turnMs) + FX.duration(EV);
    st.fx = { id: ++st.seq, events: EV }; EV = null; return true;
  }

  function nextTurn(st) {
    if (st.result) return;
    let i = st.turn, wrapped = false;
    for (let k = 0; k < st.players.length; k++) {
      i = (i + 1) % st.players.length;
      if (i === 0) wrapped = true;
      if (!st.players[i].bankrupt) break;
    }
    if (wrapped) {
      st.round++;
      if (st.maxRounds && st.round > st.maxRounds) return finish(st, 'rounds');
      checkLate(st);
      if (st.late && st.round > st.late) log(st, `📈 Inflação: aluguéis agora ×${inflation(st).toFixed(1).replace('.', ',')}.`);
    }
    st.turn = i; st.rolled = false; st.extra = false; st.doubles = 0; st.pending = null;
    emit({ k: 'turn', pid: st.players[i].id });
    log(st, `➡️ Vez de ${nameOf(cur(st).id)}.`);
  }

  function finish(st, why) {
    const ranking = [...st.players].map(p => ({ id: p.id, worth: p.bankrupt ? 0 : netWorth(st, p), bankrupt: p.bankrupt }))
      .sort((a, b) => (a.bankrupt - b.bankrupt) || b.worth - a.worth);
    st.result = { winner: ranking[0].id, why, ranking };
    emit({ k: 'win', pid: ranking[0].id });
    st.auction = null; st.auctionQueue = [];
    log(st, `🏆 ${nameOf(ranking[0].id)} venceu a partida${why === 'rounds' ? ' (maior patrimônio ao fim das rodadas)' : ''}!`);
  }

  function bankrupt(st, p) {
    const cred = p.debtTo ? pl(st, p.debtTo) : null;
    const mine = Object.keys(st.props).map(Number).filter(i => st.props[i].owner === p.id);
    // edifícios voltam ao banco pela metade do preço
    let liquid = 0;
    for (const i of mine) {
      const pr = st.props[i];
      if (pr.houses) {
        const hv = GROUPS[TILES[i].group].house / 2;
        liquid += hv * pr.houses;
        if (pr.houses === 5) st.bank.hotels++; else st.bank.houses += pr.houses;
        pr.houses = 0;
      }
    }
    if (cred && !cred.bankrupt) {
      // o credor já recebeu o valor cheio em pay(); ajusta para o que o falido realmente tinha
      cred.money += p.money + liquid;
      cred.jailCards.push(...p.jailCards);
      for (const i of mine) transferProp(st, i, cred.id);
      log(st, `💀 ${nameOf(p.id)} faliu — dinheiro, propriedades e cartas vão para ${nameOf(cred.id)}.`);
    } else {
      for (const d of p.jailCards) { const ci = CARDS[d].findIndex(c => c.fx === 'jailCard'); st.decks[d].push(ci); }
      for (const i of mine) { loseUpgrade(st, i); st.props[i].owner = null; st.props[i].mortgaged = false; }
      st.auctionQueue.push(...mine);
      log(st, `💀 ${nameOf(p.id)} faliu perante o banco — suas propriedades vão a leilão.`);
    }
    emit({ k: 'bankrupt', pid: p.id });
    p.money = 0; p.bankrupt = true; p.jailCards = []; p.inJail = false; p.debtTo = null;
    if (st.trade && (st.trade.from === p.id || st.trade.to === p.id)) st.trade = null;
    if (st.auction) {
      if (st.auction.bidder === p.id) { st.auction.bidder = null; st.auction.high = 0; }
      checkAuction(st);
    }
    if (alive(st).length <= 1) return finish(st, 'bankrupt');
    checkLate(st);
    if (!st.auction && st.auctionQueue.length) nextAuction(st);
    if (cur(st).id === p.id) nextTurn(st);
  }

  // ===== construções =====
  // ===== níveis comprados ao parar na casa (Terreno → Hotel) =====
  // custo para ir do nível `from` ao `to` (cada nível custa o preço de uma casa; hotel = 5 níveis)
  function levelCost(tile, from, to) { return (to - from) * GROUPS[TILES[tile].group].house; }
  function bankHas(st, from, to) { return to === 5 ? st.bank.hotels >= 1 : st.bank.houses >= to - from; }
  function applyLevel(st, tile, from, to) {
    const pr = st.props[tile];
    if (to === 5) { st.bank.hotels--; st.bank.houses += from; } else st.bank.houses -= to - from;
    pr.houses = to;
  }
  // níveis de compra disponíveis numa rua sem dono: [{level, cost, ok, why}]
  function buyOptions(st, p, tile) {
    const t = TILES[tile];
    if (t.type !== 'street') return [{ level: 0, cost: t.price, ok: p.money >= t.price, why: p.money >= t.price ? '' : 'Dinheiro insuficiente' }];
    // como no Monopoly: construções só para quem fica com o grupo de cor completo
    const others = groupTiles(t.group).filter(i => i !== tile);
    const completes = others.every(i => st.props[i].owner === p.id), anyMort = others.some(i => st.props[i].mortgaged);
    const maxEven = ECON.EVEN_BUILD ? Math.min(5, Math.min(...others.map(i => st.props[i].houses)) + 1) : 5;
    return [0, 1, 2, 3, 4, 5].map(level => {
      const cost = t.price + levelCost(tile, 0, level);
      let why = '';
      if (level > 0 && !completes) why = 'Só com o grupo de cor completo';
      else if (level > 0 && anyMort) why = 'Há ruas hipotecadas no grupo';
      else if (level > maxEven) why = 'Construa de forma uniforme';
      else if (level > 0 && !bankHas(st, 0, level)) why = 'Banco sem estoque';
      else if (p.money < cost) why = 'Dinheiro insuficiente';
      return { level, cost, ok: !why, why };
    });
  }
  // níveis para melhorar a própria rua ao parar nela
  function improveOptions(st, p, tile) {
    const t = TILES[tile], pr = st.props[tile];
    if (t.type !== 'street' || pr.owner !== p.id || pr.mortgaged || pr.houses >= 5) return [];
    // como no Monopoly: precisa do grupo completo, sem hipotecas, e construção uniforme
    const g = groupTiles(t.group);
    if (!g.every(i => st.props[i].owner === p.id) || g.some(i => st.props[i].mortgaged)) return [];
    const others = g.filter(i => i !== tile);
    const maxEven = ECON.EVEN_BUILD ? Math.min(5, Math.min(...others.map(i => st.props[i].houses)) + 1) : 5;
    const opts = [];
    for (let level = pr.houses + 1; level <= 5; level++) {
      const cost = levelCost(tile, pr.houses, level);
      const why = level > maxEven ? 'Construa de forma uniforme' : !bankHas(st, pr.houses, level) ? 'Banco sem estoque' : p.money < cost ? 'Dinheiro insuficiente' : '';
      opts.push({ level, cost, ok: !why, why });
    }
    return opts.some(o => o.ok) ? opts : [];
  }

  // em dívida, a propriedade volta ao banco pelo que foi pago (terreno + construções; descontada a hipoteca já recebida)
  function sellBackValue(st, idx) {
    const t = TILES[idx], pr = st.props[idx];
    let v = (pr.paid ?? t.price) + (t.type === 'street' ? pr.houses * GROUPS[t.group].house / 2 : 0);
    if (pr.mortgaged) v -= t.price / 2;
    return Math.max(0, Math.round(v));
  }

  function canBuild(st, pid, idx) {
    const t = TILES[idx], pr = st.props[idx];
    if (t.type !== 'street' || pr.owner !== pid) return 'Não é sua rua.';
    if (!ownsGroup(st, pid, t.group)) return 'Você precisa ter todas as ruas da cor.';
    const g = groupTiles(t.group);
    if (g.some(i => st.props[i].mortgaged)) return 'Há ruas hipotecadas no grupo.';
    if (pr.houses >= 5) return 'Já tem hotel.';
    if (pr.houses > Math.min(...g.map(i => st.props[i].houses))) return 'Construa de forma uniforme no grupo.';
    if (pr.houses === 4 && st.bank.hotels < 1) return 'O banco não tem hotéis disponíveis.';
    if (pr.houses < 4 && st.bank.houses < 1) return 'O banco não tem casas disponíveis.';
    if (pl(st, pid).money < GROUPS[t.group].house) return 'Dinheiro insuficiente.';
    return null;
  }
  function canSell(st, pid, idx) {
    const t = TILES[idx], pr = st.props[idx];
    if (t.type !== 'street' || pr.owner !== pid || pr.houses === 0) return 'Nada para vender.';
    if (pr.houses < Math.max(...groupTiles(t.group).map(i => st.props[i].houses))) return 'Venda de forma uniforme no grupo.';
    return null;
  }
  function canMortgage(st, pid, idx) {
    const t = TILES[idx], pr = st.props[idx];
    if (!pr || pr.owner !== pid || pr.mortgaged) return 'Não pode hipotecar.';
    if (t.type === 'street' && groupHasBuildings(st, t.group)) return 'Venda os edifícios do grupo primeiro.';
    return null;
  }
  const unmortgageCost = idx => Math.ceil(TILES[idx].price / 2 * 1.1);

  function validTrade(st, tr) {
    const a = pl(st, tr.from), b = pl(st, tr.to);
    if (!a || !b || a.bankrupt || b.bankrupt || a.id === b.id) return 'Jogadores inválidos.';
    if (tr.giveMoney < 0 || tr.getMoney < 0 || tr.giveCards < 0 || tr.getCards < 0) return 'Valores inválidos.';
    if (tr.giveMoney > Math.max(0, a.money) || tr.getMoney > Math.max(0, b.money)) return 'Dinheiro insuficiente para a troca.';
    if (tr.giveCards > a.jailCards.length || tr.getCards > b.jailCards.length) return 'Cartas de saída livre insuficientes.';
    const ok = (ids, owner) => ids.every(i => {
      const pr = st.props[i]; if (!pr || pr.owner !== owner) return false;
      const t = TILES[i]; return t.type !== 'street' || !groupHasBuildings(st, t.group);
    });
    if (!ok(tr.giveProps, a.id) || !ok(tr.getProps, b.id)) return 'Propriedades inválidas (venda os edifícios do grupo antes de negociar).';
    if (!tr.giveMoney && !tr.getMoney && !tr.giveProps.length && !tr.getProps.length && !tr.giveCards && !tr.getCards) return 'Troca vazia.';
    return null;
  }

  // ===== ação principal =====
  function act(st, pid, a) {
    EV = [];
    const turnBefore = st.turn, hadAuction = !!st.auction, err = actInner(st, pid, a);
    if (!err) armTurn(st, pid, a, turnBefore, hadAuction && !st.auction);
    if (!err && EV.length) st.fx = { id: ++st.seq, events: EV };
    EV = null;
    return err;
  }

  // ===== tempo da vez: se o jogador da vez ficar parado, o jogo joga por ele =====
  // cada ação de quem está na vez reinicia o relógio; jogadas automáticas seguem em ritmo rápido
  function armTurn(st, pid, a, turnBefore, auctionEnded) {
    if (!st.turnMs || st.result) { st.deadline = 0; return; }
    const anim = typeof FX !== 'undefined' ? FX.duration(EV || []) : 0, now = Date.now();
    if (st.turn !== turnBefore) { st.deadline = now + st.turnMs + anim; st.afk = null; }
    else if (cur(st).id === pid) { st.deadline = now + (a.auto ? AUTO_STEP_MS : st.turnMs) + anim; if (!a.auto) st.afk = null; }
    else if (auctionEnded) st.deadline = now + (st.afk === cur(st).id ? AUTO_STEP_MS : st.turnMs) + anim;
  }
  const AUTO_STEP_MS = 1500;
  // jogada mínima e conservadora no lugar do ausente: rola, recusa compras (vai a leilão), encerra a vez
  function idleAction(st, pid) {
    const p = pl(st, pid);
    if (p.money < 0 || st.pending?.type === 'upgrade') return botAction(st, pid);
    if (st.pending?.type === 'buy') return { type: 'decline' };
    if (st.pending?.type === 'improve') return { type: 'skip' };
    if (!st.rolled || st.extra) return { type: 'roll' };
    return { type: 'end' };
  }
  function timeout(st) {
    if (!st.turnMs || !st.deadline || st.result || Date.now() < st.deadline - 50) return false;
    // leilão em andamento: a vez fica parada até ele acabar
    if (st.auction) { st.deadline = st.auction.deadline + (st.afk === cur(st).id ? AUTO_STEP_MS : st.turnMs); return true; }
    const p = cur(st);
    if (st.afk !== p.id) { st.afk = p.id; log(st, `⏰ ${nameOf(p.id)} ficou sem tempo — jogada automática.`); }
    let err = act(st, p.id, { ...idleAction(st, p.id), auto: true });
    if (err) err = act(st, p.id, { type: 'end', auto: true });
    if (err) st.deadline = Date.now() + 5000;
    return true;
  }
  function actInner(st, pid, a) {
    if (st.result) return 'Partida encerrada.';
    const p = pl(st, pid); if (!p || p.bankrupt) return 'Você não está jogando.';
    const isCur = cur(st).id === pid;
    const auctionBusy = () => st.auction ? 'Aguarde o fim do leilão.' : null;
    switch (a.type) {
      case 'roll': {
        if (!isCur) return 'Não é sua vez.';
        if (auctionBusy()) return auctionBusy();
        if (st.pending) return 'Resolva a ação pendente.';
        if (st.rolled && !st.extra) return 'Você já rolou.';
        if (p.money < 0) return 'Pague suas dívidas primeiro.';
        const d1 = rnd(6), d2 = rnd(6), sum = d1 + d2, dbl = d1 === d2;
        st.lastRoll = { id: ++st.seq, dice: [d1, d2], pid };
        emit({ k: 'roll', pid, dice: [d1, d2] });
        log(st, `🎲 ${nameOf(pid)} rolou ${d1} + ${d2} = ${sum}${dbl ? ' (dupla!)' : ''}.`);
        if (p.inJail) {
          st.rolled = true; st.extra = false;
          if (dbl) { p.inJail = false; p.jailTurns = 0; log(st, `🔓 Dupla! ${nameOf(pid)} saiu da Delegacia.`); moveBy(st, p, sum, sum); }
          else if (++p.jailTurns >= 3) { pay(st, p, JAIL_FINE, null); p.inJail = false; p.jailTurns = 0; log(st, `🔓 ${nameOf(pid)} pagou ${money(JAIL_FINE)} após 3 tentativas e usa este lançamento.`); moveBy(st, p, sum, sum); }
          else log(st, `🔒 ${nameOf(pid)} continua na Delegacia (tentativa ${p.jailTurns}/3).`);
          return null;
        }
        st.rolled = true;
        if (dbl) { if (++st.doubles >= 3) { log(st, '😱 Três duplas seguidas!'); sendToJail(st, p); return null; } st.extra = true; }
        else st.extra = false;
        moveBy(st, p, sum, sum);
        if (p.inJail) st.extra = false;
        return null;
      }
      case 'buy': {
        if (!isCur || st.pending?.type !== 'buy') return 'Nada para comprar.';
        const tile = st.pending.tile, t = TILES[tile], level = t.type === 'street' ? Math.max(0, Math.min(5, a.level | 0)) : 0;
        const opt = buyOptions(st, p, tile).find(o => o.level === level);
        if (!opt || !opt.ok) return opt?.why || 'Não é possível comprar.';
        p.money -= opt.cost; st.props[tile].owner = pid; st.props[tile].paid = t.price;
        if (level) applyLevel(st, tile, 0, level);
        emit({ k: 'money', pid, amount: -opt.cost }); emit({ k: 'buy', pid, tile, level });
        log(st, `🏷️ ${nameOf(pid)} comprou ${t.name}${level ? ' já com ' + TIERS[level].name : ''} por ${money(opt.cost)}.`);
        st.pending = null; return null;
      }
      case 'improve': {
        if (!isCur || st.pending?.type !== 'improve') return 'Nada para construir.';
        const tile = st.pending.tile, pr = st.props[tile];
        const opt = improveOptions(st, p, tile).find(o => o.level === (a.level | 0));
        if (!opt || !opt.ok) return opt?.why || 'Não é possível construir.';
        const from = pr.houses;
        p.money -= opt.cost; applyLevel(st, tile, from, opt.level);
        emit({ k: 'money', pid, amount: -opt.cost }); emit({ k: 'buy', pid, tile, level: opt.level, improve: true });
        log(st, `🏗️ ${nameOf(pid)} transformou ${TILES[tile].name} em ${TIERS[opt.level].name} por ${money(opt.cost)}.`);
        st.pending = null; return null;
      }
      case 'skip': {
        if (!isCur || st.pending?.type !== 'improve') return 'Nada pendente.';
        st.pending = null; return null;
      }
      case 'decline': {
        if (!isCur || st.pending?.type !== 'buy') return 'Nada pendente.';
        log(st, `🙅 ${nameOf(pid)} não comprou ${TILES[st.pending.tile].name}.`);
        const tile = st.pending.tile; st.pending = null; startAuction(st, tile); return null;
      }
      case 'bid': {
        const au = st.auction; if (!au) return 'Não há leilão.';
        if (au.passed.includes(pid)) return 'Você já desistiu deste leilão.';
        const amt = Math.floor(a.amount);
        const minBid = Math.max(ECON.MIN_BID, au.high + 1);
        if (!(amt >= minBid)) return `O lance precisa ser de pelo menos ${money(minBid)}.`;
        if (amt > p.money) return 'Você não tem esse dinheiro.';
        au.high = amt; au.bidder = pid; au.deadline = Math.max(au.deadline, Date.now() + AUCTION_BUMP_MS);
        log(st, `🙋 ${nameOf(pid)} deu lance de ${money(amt)} em ${TILES[au.tile].name}.`);
        checkAuction(st); return null;
      }
      case 'pass': {
        const au = st.auction; if (!au) return 'Não há leilão.';
        if (au.bidder === pid) return 'Você tem o maior lance.';
        if (!au.passed.includes(pid)) { au.passed.push(pid); log(st, `🤐 ${nameOf(pid)} desistiu do leilão.`); }
        checkAuction(st); return null;
      }
      case 'upgrade': {
        if (!isCur || st.pending?.type !== 'upgrade') return 'Não há upgrade para aplicar.';
        const tile = +a.tile, pr = st.props[tile];
        if (!Object.values(st.props).some(x => x.owner === pid)) { st.pending = null; return null; } // perdeu tudo antes de escolher
        if (!pr || pr.owner !== pid) return 'Escolha uma propriedade sua.';
        const prev = st.upgrade;
        let level = 1, stolenFrom = null;
        if (prev && prev.owner === pid && prev.tile === tile) level = Math.min(UPGRADE.MAX_LEVEL, prev.level + 1);
        else if (prev && prev.owner !== pid) stolenFrom = prev.owner;
        const comeback = stolenFrom && !st.late && standing(st, p).pos === 'last';
        if (comeback) level = 2; // recuperação: o último colocado rouba o upgrade já no nível 2
        st.upgrade = { owner: pid, tile, level };
        st.pending = null;
        emit({ k: 'upgrade', pid, tile, level, stolenFrom, fromTile: prev ? prev.tile : null });
        if (stolenFrom) log(st, `🦹 ${nameOf(pid)} roubou o upgrade de ${nameOf(stolenFrom)} e o colocou em ${TILES[tile].name} (aluguel ${UPGRADE.label(level)})${comeback ? ' — bônus de recuperação!' : ''}.`);
        else if (level > 1) log(st, `⭐ Upgrade acumulado! ${TILES[tile].name} agora é nível ${level} (aluguel ${UPGRADE.label(level)})${prev && prev.level === level ? ' — nível máximo' : ''}.`);
        else log(st, `⭐ ${nameOf(pid)} aplicou o upgrade em ${TILES[tile].name} (aluguel ${UPGRADE.label(1)}).`);
        return null;
      }
      case 'payJail': {
        if (!isCur || !p.inJail || st.rolled) return 'Não pode agora.';
        if (p.money < JAIL_FINE) return 'Dinheiro insuficiente.';
        p.money -= JAIL_FINE; emit({ k: 'money', pid, amount: -JAIL_FINE }); emit({ k: 'free', pid }); p.inJail = false; p.jailTurns = 0; log(st, `🔓 ${nameOf(pid)} pagou ${money(JAIL_FINE)} de fiança.`); return null;
      }
      case 'useJailCard': {
        if (!isCur || !p.inJail || st.rolled || !p.jailCards.length) return 'Não pode agora.';
        const d = p.jailCards.shift(); st.decks[d].push(CARDS[d].findIndex(c => c.fx === 'jailCard'));
        emit({ k: 'free', pid }); p.inJail = false; p.jailTurns = 0; log(st, `📜 ${nameOf(pid)} usou a carta de saída livre.`); return null;
      }
      case 'end': {
        if (!isCur) return 'Não é sua vez.';
        if (auctionBusy()) return auctionBusy();
        if (!st.rolled || st.extra) return 'Você precisa rolar os dados.';
        if (st.pending) return 'Resolva a ação pendente.';
        if (p.money < 0) return 'Você está devendo! Venda edifícios, hipoteque ou declare falência.';
        nextTurn(st); return null;
      }
      case 'build': {
        const e = canBuild(st, pid, a.tile); if (e) return e;
        const t = TILES[a.tile], pr = st.props[a.tile];
        p.money -= GROUPS[t.group].house; emit({ k: 'money', pid, amount: -GROUPS[t.group].house }); emit({ k: 'build', tile: a.tile });
        if (pr.houses === 4) { st.bank.hotels--; st.bank.houses += 4; } else st.bank.houses--;
        pr.houses++;
        log(st, `🏗️ ${nameOf(pid)} construiu ${pr.houses === 5 ? 'um hotel' : 'uma casa'} em ${t.name}.`); return null;
      }
      case 'sell': {
        const e = canSell(st, pid, a.tile); if (e) return e;
        const t = TILES[a.tile], pr = st.props[a.tile], half = GROUPS[t.group].house / 2;
        emit({ k: 'build', tile: a.tile, sell: true });
        if (pr.houses === 5) {
          // hotel vendido por metade e trocado por 4 casas (se o banco tiver)
          const k = Math.min(4, st.bank.houses);
          st.bank.hotels++; st.bank.houses -= k; pr.houses = k;
          receive(p, half * (1 + (4 - k)));
          log(st, `🔨 ${nameOf(pid)} vendeu o hotel de ${t.name}${k < 4 ? ` (banco só tinha ${k} casas para repor)` : ''}.`);
        } else {
          pr.houses--; st.bank.houses++; receive(p, half);
          log(st, `🔨 ${nameOf(pid)} vendeu uma casa em ${t.name}.`);
        }
        return null;
      }
      case 'mortgage': {
        const e = canMortgage(st, pid, a.tile); if (e) return e;
        st.props[a.tile].mortgaged = true; receive(p, TILES[a.tile].price / 2);
        log(st, `🏦 ${nameOf(pid)} hipotecou ${TILES[a.tile].name}.`); return null;
      }
      case 'unmortgage': {
        const pr = st.props[a.tile]; if (!pr || pr.owner !== pid || !pr.mortgaged) return 'Não pode.';
        const c = unmortgageCost(a.tile); if (p.money < c) return 'Dinheiro insuficiente.';
        p.money -= c; emit({ k: 'money', pid, amount: -c }); pr.mortgaged = false; log(st, `🏦 ${nameOf(pid)} pagou a hipoteca de ${TILES[a.tile].name} (+10%).`); return null;
      }
      case 'sellProp': {
        const tile = +a.tile, pr = st.props[tile], t = TILES[tile];
        if (!pr || pr.owner !== pid) return 'Essa propriedade não é sua.';
        if (p.money >= 0) return 'Só dá para vender ao banco quando você estiver devendo.';
        const refund = sellBackValue(st, tile);
        if (pr.houses === 5) st.bank.hotels++; else st.bank.houses += pr.houses;
        loseUpgrade(st, tile);
        pr.owner = null; pr.houses = 0; pr.mortgaged = false; delete pr.paid;
        receive(p, refund);
        emit({ k: 'soldback', pid, tile });
        log(st, `🏦 ${nameOf(pid)} vendeu ${t.name} ao banco por ${money(refund)} para pagar a dívida.`);
        // como na falência do Monopoly, o que volta ao banco vai a leilão
        st.auctionQueue.push(tile); if (!st.auction) nextAuction(st);
        return null;
      }
      case 'bankrupt': bankrupt(st, p); return null;
      case 'tradePropose': {
        if (st.trade) return 'Já existe uma negociação em andamento.';
        const tr = {
          id: ++st.seq, from: pid, to: a.to, giveMoney: a.giveMoney | 0, getMoney: a.getMoney | 0,
          giveProps: a.giveProps || [], getProps: a.getProps || [], giveCards: a.giveCards | 0, getCards: a.getCards | 0,
        };
        const e = validTrade(st, tr); if (e) return e;
        (st.proposed ||= {})[pid] = st.round;
        st.trade = tr; log(st, `🤝 ${nameOf(pid)} propôs uma troca a ${nameOf(a.to)}.`); return null;
      }
      case 'tradeAccept': {
        const tr = st.trade; if (!tr || tr.to !== pid) return 'Sem proposta.';
        const e = validTrade(st, tr); if (e) { st.trade = null; return e; }
        const A = pl(st, tr.from), B = p;
        A.money += tr.getMoney - tr.giveMoney; B.money += tr.giveMoney - tr.getMoney;
        if (tr.getMoney !== tr.giveMoney) { emit({ k: 'money', pid: A.id, amount: tr.getMoney - tr.giveMoney }); emit({ k: 'money', pid: B.id, amount: tr.giveMoney - tr.getMoney }); }
        emit({ k: 'deal' });
        B.jailCards.push(...A.jailCards.splice(0, tr.giveCards)); A.jailCards.push(...B.jailCards.splice(0, tr.getCards));
        st.trade = null;
        log(st, `✅ ${nameOf(B.id)} aceitou a troca com ${nameOf(A.id)}.`);
        tr.giveProps.forEach(i => transferProp(st, i, B.id)); tr.getProps.forEach(i => transferProp(st, i, A.id));
        if (A.money >= 0) A.debtTo = null; if (B.money >= 0) B.debtTo = null;
        return null;
      }
      case 'tradeDecline': {
        const tr = st.trade; if (!tr || (tr.to !== pid && tr.from !== pid)) return 'Sem proposta.';
        st.trade = null; log(st, `❌ Troca ${tr.from === pid ? 'cancelada' : 'recusada'}.`); return null;
      }
    }
    return 'Ação desconhecida.';
  }

  // ===== IA simples (bots e jogadores desconectados) =====
  function botAction(st, pid) {
    const p = pl(st, pid); if (!p || p.bankrupt || st.result) return null;
    const mine = Object.keys(st.props).map(Number).filter(i => st.props[i].owner === pid);
    if (p.money < 0) {
      if (mine.length) {
        const debt = -p.money, byVal = [...mine].sort((x, y) => sellBackValue(st, x) - sellBackValue(st, y));
        return { type: 'sellProp', tile: byVal.find(i => sellBackValue(st, i) >= debt) ?? byVal[byVal.length - 1] };
      }
      for (const i of mine) if (!canSell(st, pid, i)) return { type: 'sell', tile: i };
      for (const i of mine) if (!canMortgage(st, pid, i)) return { type: 'mortgage', tile: i };
      return { type: 'bankrupt' };
    }
    if (st.auction) {
      const au = st.auction;
      if (au.passed.includes(pid) || au.bidder === pid) return null;
      const t = TILES[au.tile];
      const completes = t.group && groupTiles(t.group).filter(i => i !== au.tile).every(i => st.props[i].owner === pid);
      const limit = Math.min(t.price * (completes ? 1.6 : 1.05), p.money - K(100));
      const next = Math.max(ECON.MIN_BID, au.high + (au.high < K(100) ? K(10) : K(20)));
      return next <= limit ? { type: 'bid', amount: next } : { type: 'pass' };
    }
    if (st.trade && st.trade.to === pid) {
      const val = ids => ids.reduce((s, i) => s + TILES[i].price, 0);
      const gain = val(st.trade.giveProps) + st.trade.giveMoney + st.trade.giveCards * ECON.CARD_VALUE;
      const loss = val(st.trade.getProps) + st.trade.getMoney + st.trade.getCards * ECON.CARD_VALUE;
      return { type: gain >= loss * 1.3 ? 'tradeAccept' : 'tradeDecline' };
    }
    if (cur(st).id !== pid) return null;
    if (st.pending?.type === 'buy') {
      const opts = buyOptions(st, p, st.pending.tile).filter(o => o.ok && p.money - o.cost >= (o.level ? K(450) : K(120)));
      return opts.length ? { type: 'buy', level: opts[opts.length - 1].level } : { type: 'decline' };
    }
    if (st.pending?.type === 'improve') {
      const opts = improveOptions(st, p, st.pending.tile).filter(o => o.ok && p.money - o.cost >= K(400));
      return opts.length ? { type: 'improve', level: opts[opts.length - 1].level } : { type: 'skip' };
    }
    if (st.pending?.type === 'upgrade') {
      const u = st.upgrade;
      if (u && u.owner === pid && st.props[u.tile].owner === pid && !st.props[u.tile].mortgaged) return { type: 'upgrade', tile: u.tile };
      const best = mine.filter(i => !st.props[i].mortgaged).sort((x, y) => baseRent(st, y, 7) - baseRent(st, x, 7))[0] ?? mine[0];
      return { type: 'upgrade', tile: best };
    }
    if (p.inJail && !st.rolled) {
      if (p.jailCards.length) return { type: 'useJailCard' };
      if (p.money > K(400)) return { type: 'payJail' };
    }
    if (!st.rolled || st.extra) return { type: 'roll' };
    for (const i of mine) if (!canBuild(st, pid, i) && p.money - GROUPS[TILES[i].group].house > K(250)) return { type: 'build', tile: i };
    for (const i of mine) if (st.props[i].mortgaged && p.money - unmortgageCost(i) > K(500)) return { type: 'unmortgage', tile: i };
    // tenta comprar a peça que falta para fechar um grupo de cor
    if (!st.trade && (st.proposed?.[pid] || -9) + 3 <= st.round) {
      for (const g of Object.keys(GROUPS)) {
        const gt = groupTiles(g); const missing = gt.filter(i => st.props[i].owner !== pid);
        if (missing.length !== 1 || groupHasBuildings(st, g)) continue;
        const i = missing[0], owner = st.props[i].owner; if (!owner) continue;
        const offer = niceMoney(TILES[i].price * 1.8);
        if (p.money - offer > K(200)) return { type: 'tradePropose', to: owner, giveMoney: offer, getMoney: 0, giveProps: [], getProps: [i] };
      }
    }
    return { type: 'end' };
  }

  return {
    newGame, act, botAction, timeout, inflation, idleAction, sellBackValue, standing, rentOf, upgradeMult, buyOptions, improveOptions, netWorth, canBuild, canSell, canMortgage, unmortgageCost, ownsGroup, groupTiles,
    auctionTimeout, setNameResolver: f => { nameOf = f; }, money,
  };
})();
