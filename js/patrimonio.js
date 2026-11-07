// Patrimônio na sala: liga o motor (índices, eventos) ao padrão da Mesa Viva (ids, anfitrião decide).
const Patrimonio = (() => {
  const E = typeof Engine !== 'undefined' ? Engine : require('./pat-engine.js');
  const PD_ = typeof PD !== 'undefined' ? PD : require('./pat-data.js');
  const HEX = /^#[0-9a-f]{6}$/i; // a cor vem do perfil de cada um e a tela do jogo a põe direto no HTML
  const RULE_LIST = [
    ['mortgage', 'Hipoteca com juros', 'A dívida sobe a cada volta. Em 6 voltas, o banco toma o lugar e leiloa.'],
    ['wealth', 'Taxa de fortuna', 'Com 3 ou mais na mesa, quem tem 50% acima da média paga até R$ 100.000 no Marco Zero.'],
    ['reajuste', 'Reajuste do aluguel', 'A cada 10 voltas, os aluguéis sobem 25%, até o dobro.'],
    ['pux', 'Puxadinho', 'Uma casinha sem ter o grupo: aluguel em dobro. Até 3 por jogador.'],
    ['sponsor', 'Patrocinador', 'Quem cai escolhe um lugar seu: aluguel +50%, e o dobro se cair de novo.'],
    ['casino', 'Cassino', 'Roleta, de R$ 5.000 a R$ 50.000, até tudo o que tiver na mão.'],
    ['blitz', 'Blitz com suborno', 'Pague R$ 35.000 ao guarda e role um dado: de 1 a 4 você passa; 5 ou 6, paga mais e vai preso.'],
    ['travel', 'Ponte aérea', 'Num aeroporto, pague R$ 35.000 para voar até o próximo. No seu, é de graça.'],
    ['passes', 'Passe livre', 'Nas trocas, vale pagar com aluguéis grátis nas suas propriedades.'],
    ['fiado', 'Fiado', 'Sem dinheiro para o aluguel? Negocie juros e prazo, com um lugar de garantia.'],
    ['news', 'Jornal', 'Uma manchete por volta muda o jogo, e a próxima já fica à vista.'],
    ['contracts', 'Contratos secretos', 'Cada um recebe 2 metas ocultas que pagam prêmio ao serem cumpridas.'],
  ];
  const LOG = 40, INTRO_MS = 5000;
  // quanto cada evento leva na tela: o anfitrião espera isso antes de um bot jogar ou o relógio correr
  const DUR = { turn: 900, dice: 2300, jail: 2500, free: 500, pay: 900, gain: 700, card: 3200, offerbuy: 500, bought: 1400, auction: 700, declined: 300, bid: 400, passbid: 150, sold: 1500, unsold: 600, build: 900, sellb: 300, mortgage: 350, offered: 300, trade: 800, tradeNo: 300, bankrupt: 2500, pux: 600, blitz: 2500, blitzOk: 800, casinoLand: 800, casinoSpin: 5000, casinoBet: 500, casinoResult: 2500, sponsorLand: 1000, sponsor: 2000, travel: 3000, passused: 900, creditAsk: 300, creditOk: 1100, creditNo: 400, lien: 1100, seized: 1100, reajuste: 1000, news: 2700, contract: 1200, note: 400 };
  const durOf = e => (e.t === 'move' ? 300 + Math.abs(e.steps) * 230 : DUR[e.t] || 0);
  const BOT_WAIT = { build: 420, lift: 420, mortgage: 420, sell: 420, offer: 700, roll: 750, buy: 1100, decline: 1000, end: 550, accept: 900, reject: 900, bail: 750, usecard: 750, bankrupt: 1000, pux: 420, repay: 500, sponsor: 1000, nosponsor: 500, bet: 1200, nobet: 500, jailgo: 900, jeitinho: 900, travel: 900, stay: 500, fiado: 800, creditYes: 900, creditNo: 900, creditCounter: 900 };
  // ausente ou sem tempo: a saída que não gasta nem arrisca nada
  const SAFE = { casino: 'nobet', sponsor: 'nosponsor', blitz: 'jailgo', travel: 'stay', buy: 'decline', roll: 'roll', post: 'end' };
  const LAST_RESORT = { casino: 'nobet', sponsor: 'nosponsor', blitz: 'jailgo', travel: 'stay', debt: 'bankrupt', auction: 'pass', buy: 'decline', roll: 'roll' };
  const idx = (st, id) => st.players.findIndex(p => p.id === id);

  // depois de qualquer mudança: publica os eventos e acerta os relógios
  function settle(st) {
    const now = Date.now(), fresh = st.ev.splice(0);
    st.busyUntil = Math.max(st.busyUntil || 0, now) + fresh.reduce((t, e) => t + durOf(e), 0);
    for (const e of fresh) st.log.push({ ...e, n: ++st.evN });
    if (st.log.length > LOG) st.log.splice(0, st.log.length - LOG);
    if (st.auction) st.auction.deadline = (st.auction.deadline ? now : st.busyUntil) + st.auction.ms;
    const who = st.phase === 'auction' || st.phase === 'over' ? null : E.actor(st), key = `${who}:${st.phase}:${st.turns}`;
    if (who === null || st.players[who].bot || !st.turnSec) st.deadline = 0;
    else if (key !== st.clockKey) st.deadline = st.busyUntil + st.turnSec * 1000;
    st.clockKey = key;
    if (st.phase === 'over' && !st.result) st.result = { winner: st.players[st.winner].id, ranking: st.players.map(p => ({ id: p.id, worth: E.worth(st, p.i) })).sort((a, b) => b.worth - a.worth) };
  }

  function newGame(room) {
    const hats = PD_.TOKENS.map(k => k.id), used = new Set();
    const pick = p => { const t = hats.includes(p.pathat) && !used.has(p.pathat) ? p.pathat : hats.find(h => !used.has(h) && !room.players.some(o => o.pathat === h)) || hats.find(h => !used.has(h)); used.add(t); return t; };
    const humansFirst = [...room.players].sort((a, b) => !!a.bot - !!b.bot), token = new Map(humansFirst.map(p => [p.id, pick(p)]));
    const st = E.newGame(room.players.map((p, i) => ({ name: p.name, char: p.char, bot: !!p.bot, token: token.get(p.id), color: HEX.test(p.color) ? p.color : PD_.COLORS[i] })), undefined, { ...E.RULES, ...room.settings.patRules });
    st.players.forEach((p, i) => { p.id = room.players[i].id; });
    Object.assign(st, { gameId: 'pat-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), log: [], evN: 0, turnSec: room.settings.turnSec ?? 90, busyUntil: Date.now() + INTRO_MS });
    settle(st);
    return st;
  }

  function act(st, pid, a) {
    const i = idx(st, pid);
    if (i < 0) return 'Você não está nesta partida';
    if (!a || typeof a.type !== 'string') return 'Jogada inválida';
    const A = st.auction, now = Date.now(), had = !!st.offer, before = JSON.stringify(st);
    if (A) A.ms = Math.max(1, A.deadline - now);
    let err;
    // o que vem da rede não pode derrubar nem deixar a partida pela metade
    try { err = E.act(st, i, a); } catch (e) { console.error('Patrimônio', a, e); Object.keys(st).forEach(k => delete st[k]); Object.assign(st, JSON.parse(before)); return 'Jogada inválida'; }
    if (err && !(had && !st.offer)) return err; // proposta que deixou de valer some mesmo com erro
    settle(st);
    return null;
  }

  function validOr(st, i, a) {
    if (!a) return null;
    const c = JSON.parse(JSON.stringify(st));
    if (!E.act(c, i, a)) return a;
    return { type: st.credit ? 'creditNo' : st.offer ? 'reject' : LAST_RESORT[st.phase] || 'end' };
  }
  function botAction(st, pid) {
    const i = idx(st, pid), A = st.auction;
    if (i < 0 || st.players[i].out || st.phase === 'over') return null;
    if (A && (!A.active.includes(i) || A.by === i)) return null;
    return validOr(st, i, E.botAction(st, i));
  }
  function afkAction(st, pid) {
    const i = idx(st, pid), A = st.auction;
    if (i < 0 || st.players[i].out || st.phase === 'over') return null;
    if (A) return A.active.includes(i) && A.by !== i ? { type: 'pass' } : null;
    if (E.actor(st) !== i) return null;
    if (st.credit) return { type: 'creditNo' };
    if (st.offer) return { type: 'reject' };
    return SAFE[st.phase] ? { type: SAFE[st.phase] } : botAction(st, pid);
  }
  const botDelay = (a, st) => Math.max(0, (st.busyUntil || 0) - Date.now()) + (st.auction ? 700 + Math.random() * 1500 : BOT_WAIT[a.type] ?? 300);
  const nextDeadline = st => st.auction?.deadline || st.deadline || 0;
  function timeout(st) {
    if (st.auction) { E.auctionTick(st, st.auction.ms + 1); settle(st); return true; }
    const who = E.actor(st); if (who === null) return false;
    const a = afkAction(st, st.players[who].id); if (!a) return false;
    if (E.act(st, who, a)) return false;
    settle(st);
    return true;
  }
  // contratos são secretos: cada um só recebe os seus
  const viewFor = (st, pid) => ({ ...st, players: st.players.map(p => (p.id === pid ? p : { ...p, contracts: [] })) });

  return { RULE_LIST, newGame, act, botAction, afkAction, botDelay, nextDeadline, timeout, viewFor };
})();
if (typeof module !== 'undefined') module.exports = Patrimonio;
