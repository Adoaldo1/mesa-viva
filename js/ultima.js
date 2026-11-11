// Última!: jogo de descarte do gênero do "uno", com nome, cartas e regras da casa nossos.
// Motor e ponte com a sala num arquivo só: o anfitrião decide e cada um recebe só a própria mão.
const Ultima = (() => {
  const COLORS = ['r', 'y', 'g', 'b'];
  // 108 cartas: por cor um 0, dois de cada 1–9, dois Pula, dois Volta, dois +2; mais 4 Coringas e 4 Coringas +4
  const CARDS = [];
  for (const c of COLORS) {
    CARDS.push({ c, v: '0' });
    for (const v of ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'skip', 'rev', 'd2']) CARDS.push({ c, v }, { c, v });
  }
  for (let k = 0; k < 4; k++) CARDS.push({ c: 'w', v: 'wild' }, { c: 'w', v: 'd4' });
  const isNum = id => /^\d$/.test(CARDS[id].v);
  const pts = id => (CARDS[id].c === 'w' ? 50 : isNum(id) ? +CARDS[id].v : 20);

  const RULE_LIST = [
    ['stack', 'Acumular +2 e +4', 'Levou +2? Devolva com outro +2 ou com um +4, e a conta vai para o próximo. +2 não vale em cima de +4.'],
    ['drawUntil', 'Comprar até servir', 'Sem carta que sirva, compra até sair uma, em vez de só uma.'],
  ];
  const RULES = { stack: true, drawUntil: false };
  const HAND = 7, LOG = 60, INTRO_MS = 8800, MIN_LEFT = 8000, BOT_CATCH = 0.6, BOT_CALL = 0.85;
  const PALETTE = ['#e8553f', '#2f8fd8', '#2fae66', '#f2b31b', '#9b5de5', '#f15bb5', '#00b8a9', '#ff8c42', '#6c757d', '#3d5a80'];
  const HEX = /^#[0-9a-f]{6}$/i; // a cor vem do perfil e a tela do jogo a põe direto no CSS
  // quanto cada evento leva na tela: o anfitrião espera isso antes de um bot jogar ou o relógio correr
  const DUR = { play: 560, draw: 240, skip: 620, rev: 720, call: 850, caught: 1200, keep: 220, shuffle: 1100, win: 2600, turn: 140 };
  const durOf = e => (e.t === 'draw' ? DUR.draw + 160 * e.cards.length : DUR[e.t] || 0);

  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const N = st => st.players.length;
  const step = (st, k = 1) => (((st.turn + st.dir * k) % N(st)) + N(st)) % N(st);
  const top = st => CARDS[st.pile[st.pile.length - 1]];
  // vale para o estado inteiro e para a visão de cada um (a tela usa para acender as cartas)
  function canPlay(st, id) {
    const c = CARDS[id];
    if (!c) return false;
    if (st.pending) return !!st.rules.stack && (c.v === 'd4' || (c.v === 'd2' && st.pendKind === 'd2'));
    return c.c === 'w' || c.c === st.color || c.v === top(st).v;
  }

  // ---------- regras ----------
  function refill(st) {
    const keep = st.pile.pop();
    if (st.pile.length) { st.deck = shuffle(st.pile); st.ev.push({ t: 'shuffle', count: st.deck.length }); }
    st.pile = [keep];
  }
  // compra n cartas (ou, com "until", até sair uma que sirva); sem monte nem descarte, compra o que der
  function take(st, i, n, why, until) {
    const got = [], p = st.players[i];
    for (let k = 0; until || k < n; k++) {
      if (!st.deck.length) refill(st);
      if (!st.deck.length) break;
      const id = st.deck.pop(); got.push(id);
      if (until && canPlay(st, id)) break;
    }
    p.hand.push(...got); if (st.stats) st.stats[i].drawn += got.length;
    if (p.hand.length > 1) p.said = false;
    if (st.exposed?.p === i) st.exposed = null;
    st.ev.push({ t: 'draw', p: i, cards: got, why });
    return got;
  }
  function nextTurn(st, k = 1) {
    st.turn = step(st, k); st.turnN++; st.phase = 'play'; st.drawn = null;
    st.ev.push({ t: 'turn', p: st.turn });
    // levou +2/+4 acumulado e não tem com o que devolver: compra na hora, sem esperar clique
    if (st.pending && !st.players[st.turn].hand.some(id => canPlay(st, id))) {
      const v = st.turn, n = st.pending; st.pending = 0; st.pendKind = null;
      take(st, v, n, 'stack'); st.ev.push({ t: 'skip', p: v });
      nextTurn(st);
    }
  }
  function win(st, i) {
    st.phase = 'over'; st.exposed = null; st.pending = 0; st.winner = i;
    st.ev.push({ t: 'win', p: i });
    const left = p => p.hand.reduce((s, id) => s + pts(id), 0);
    st.result = {
      winner: st.players[i].id, ms: Date.now() - st.startAt - INTRO_MS, turns: st.turnN,
      ranking: st.players.map(p => ({ id: p.id, pts: left(p), worth: 0 })).sort((a, b) => (a.id === st.players[i].id ? -1 : b.id === st.players[i].id ? 1 : a.pts - b.pts)),
    };
  }

  const ACTS = {
    play(st, i, a) {
      const p = st.players[i], id = a.card, c = CARDS[id];
      if (st.turn !== i) return 'Não é a sua vez';
      if (!p.hand.includes(id)) return 'Você não tem essa carta';
      if (st.phase === 'drawn' && id !== st.drawn) return 'Só dá para jogar a carta que você comprou';
      if (!canPlay(st, id)) return st.pending ? `Devolva com ${st.pendKind === 'd2' ? '+2 ou +4' : '+4'} ou compre ${st.pending}` : 'Essa carta não serve agora';
      if (c.c === 'w' && !COLORS.includes(a.color)) return 'Escolha uma cor';
      st.exposed = null;
      const wasSaid = p.said;
      if (a.call && p.hand.length === 2) p.said = true;
      p.hand.splice(p.hand.indexOf(id), 1); st.pile.push(id);
      st.color = c.c === 'w' ? a.color : c.c;
      st.ev.push({ t: 'play', p: i, card: id, color: st.color });
      const sx = st.stats?.[i]; if (sx) { sx.played++; if (c.v === 'd2' || c.v === 'd4') sx.plus++; if (c.c === 'w') sx.wild++; }
      if (!p.hand.length) return win(st, i);
      if (p.hand.length === 1) {
        if (!p.said) st.exposed = { p: i, bots: Math.random() < BOT_CATCH };
        else if (!wasSaid) st.ev.push({ t: 'call', p: i });
      }
      if (c.v === 'rev') { st.dir = -st.dir; st.ev.push({ t: 'rev', dir: st.dir }); }
      // com dois na mesa, o Volta vira Pula
      if (c.v === 'skip' || (c.v === 'rev' && N(st) === 2)) { st.ev.push({ t: 'skip', p: step(st) }); return nextTurn(st, 2); }
      if (c.v === 'd2' || c.v === 'd4') {
        const add = c.v === 'd2' ? 2 : 4;
        if (st.rules.stack) { st.pending += add; st.pendKind = c.v; return nextTurn(st); }
        const v = step(st); take(st, v, add, c.v); st.ev.push({ t: 'skip', p: v });
        return nextTurn(st, 2);
      }
      nextTurn(st);
    },
    draw(st, i) {
      if (st.turn !== i) return 'Não é a sua vez';
      if (st.phase === 'drawn') return 'Jogue a carta que comprou ou passe a vez';
      st.exposed = null;
      if (st.pending) { const n = st.pending; st.pending = 0; st.pendKind = null; take(st, i, n, 'stack'); return nextTurn(st); }
      const got = take(st, i, 1, 'turn', st.rules.drawUntil), last = got[got.length - 1];
      if (last !== undefined && canPlay(st, last)) { st.phase = 'drawn'; st.drawn = last; return; }
      nextTurn(st);
    },
    keep(st, i) {
      if (st.turn !== i || st.phase !== 'drawn') return 'Agora não';
      st.exposed = null;
      st.ev.push({ t: 'keep', p: i });
      nextTurn(st);
    },
    // "Última!": com duas cartas na sua vez (antes de jogar a penúltima) ou logo depois, antes de alguém pegar
    call(st, i) {
      const p = st.players[i];
      if (st.stats) st.stats[i].called++;
      if (st.exposed?.p === i) { st.exposed = null; p.said = true; st.ev.push({ t: 'call', p: i }); return; }
      if (p.said) { if (st.stats) st.stats[i].called--; return 'Você já avisou'; }
      if (p.hand.length !== 2 || st.turn !== i) { if (st.stats) st.stats[i].called--; return 'Só com duas cartas, na sua vez'; }
      p.said = true; st.ev.push({ t: 'call', p: i });
    },
    // "Pegou!": quem ficou com uma carta sem avisar compra 2
    catch(st, i) {
      const x = st.exposed;
      if (!x || x.p === i) return 'Não tem ninguém para pegar';
      st.exposed = null;
      st.ev.push({ t: 'caught', p: x.p, by: i }); if (st.stats) st.stats[i].caught++;
      take(st, x.p, 2, 'caught');
    },
  };

  // ---------- sala ----------
  // depois de qualquer mudança: publica os eventos e acerta o relógio da vez
  function settle(st) {
    const now = Date.now(), fresh = st.ev.splice(0);
    st.busyUntil = Math.max(st.busyUntil || 0, now) + fresh.reduce((t, e) => t + durOf(e), 0);
    for (const e of fresh) st.log.push({ ...e, n: ++st.evN });
    if (st.log.length > LOG) st.log.splice(0, st.log.length - LOG);
    if (st.phase === 'over' || st.players[st.turn].bot || !st.turnSec) st.deadline = 0;
    else if (st.clockKey !== st.turnN) { st.deadline = st.busyUntil + st.turnSec * 1000; st.clockKey = st.turnN; }
    else st.deadline = Math.max(st.deadline, st.busyUntil + MIN_LEFT); // comprou ou foi pego: ainda dá tempo de pensar
  }

  function newGame(room) {
    const deck = shuffle([...CARDS.keys()]);
    const players = room.players.map((p, i) => ({ id: p.id, name: p.name, char: p.char, bot: !!p.bot, color: HEX.test(p.color) ? p.color : PALETTE[i % PALETTE.length], hand: [], said: false }));
    for (let k = 0; k < HAND; k++) for (const p of players) p.hand.push(deck.pop());
    // a primeira carta da mesa é sempre um número
    let t = deck.length - 1; while (!isNum(deck[t])) t--;
    const first = deck.splice(t, 1)[0], last = players.findIndex(p => p.id === room.lastWinner);
    const now = Date.now(), st = {
      gameId: 'ul-' + now.toString(36) + Math.random().toString(36).slice(2, 6),
      rules: { ...RULES, ...room.settings?.ulRules }, turnSec: Number(room.settings?.ulTurn ?? 30) || 0,
      players, deck, pile: [first], color: CARDS[first].c, dir: 1,
      turn: last >= 0 ? last : Math.floor(Math.random() * players.length), turnN: 1,
      phase: 'play', pending: 0, pendKind: null, drawn: null, exposed: null, winner: null, result: null,
      stats: players.map(() => ({ played: 0, drawn: 0, plus: 0, wild: 0, called: 0, caught: 0 })),
      ev: [], log: [], evN: 0, startAt: now, busyUntil: now + INTRO_MS, deadline: 0, clockKey: null,
    };
    st.ev.push({ t: 'deal', top: first, first: st.turn });
    settle(st);
    return st;
  }

  function act(st, pid, a) {
    const i = st.players.findIndex(p => p.id === pid);
    if (i < 0) return 'Você não está nesta partida';
    if (!a || typeof a.type !== 'string' || !Object.hasOwn(ACTS, a.type)) return 'Jogada inválida';
    if (st.phase === 'over') return 'A partida acabou';
    const before = JSON.stringify(st);
    let err;
    // o que vem da rede não pode derrubar nem deixar a partida pela metade
    try { err = ACTS[a.type](st, i, a); } catch (e) { console.error('Última', a, e); err = 'Jogada inválida'; }
    if (err) { Object.keys(st).forEach(k => delete st[k]); Object.assign(st, JSON.parse(before)); return err; }
    settle(st);
    return null;
  }

  const bestColor = (hand, skip) => {
    const n = { r: 0, y: 0, g: 0, b: 0 };
    hand.forEach(id => { if (id !== skip && CARDS[id].c !== 'w') n[CARDS[id].c]++; });
    const max = Math.max(...Object.values(n));
    const top4 = COLORS.filter(c => n[c] === max);
    return top4[Math.floor(Math.random() * top4.length)];
  };
  function botAction(st, pid) {
    const i = st.players.findIndex(p => p.id === pid), x = st.exposed;
    if (i < 0 || st.phase === 'over') return null;
    if (x && x.p !== i && x.bots) return { type: 'catch' };
    if (st.turn !== i) return null;
    const p = st.players[i], ok = (st.phase === 'drawn' ? [st.drawn] : p.hand).filter(id => canPlay(st, id));
    if (!ok.length) return { type: st.phase === 'drawn' ? 'keep' : 'draw' };
    // ataca quem está para bater; senão descarta a cor que mais tem e guarda os coringas
    const danger = st.players[step(st)].hand.length <= 2, n = {};
    p.hand.forEach(id => { n[CARDS[id].c] = (n[CARDS[id].c] || 0) + 1; });
    const score = id => {
      const c = CARDS[id], attack = ['skip', 'rev', 'd2', 'd4'].includes(c.v);
      return (c.c === 'w' ? (c.v === 'd4' ? -12 : -8) + (p.hand.length <= 3 ? 10 : 0) : n[c.c] * 3) + (isNum(id) ? +c.v * 0.3 : 1) + (attack && danger ? 40 : 0) + Math.random();
    };
    const id = ok.reduce((b, k) => (score(k) > score(b) ? k : b));
    const a = { type: 'play', card: id };
    if (CARDS[id].c === 'w') a.color = bestColor(p.hand, id);
    if (p.hand.length === 2 && Math.random() < BOT_CALL) a.call = true;
    return a;
  }
  // ausente ou sem tempo: compra e passa (como nas mesas online)
  function afkAction(st, pid) {
    const i = st.players.findIndex(p => p.id === pid);
    if (i < 0 || st.phase === 'over' || st.turn !== i) return null;
    return { type: st.phase === 'drawn' ? 'keep' : 'draw' };
  }
  const BOT_WAIT = { play: [650, 700], draw: [600, 300], keep: [450, 200], call: [200, 200], catch: [900, 1300] };
  const botDelay = (a, st) => { const [b, r] = BOT_WAIT[a.type] || [500, 0]; return Math.max(0, (st.busyUntil || 0) - Date.now()) + b + Math.random() * r; };
  const nextDeadline = st => st.deadline || 0;
  function timeout(st) {
    if (st.phase === 'over') return false;
    const i = st.turn, id = st.players[i].id;
    if (act(st, id, afkAction(st, id))) return false;
    if (st.turn === i && st.phase === 'drawn') act(st, id, { type: 'keep' });
    return true;
  }
  // cada um vê a própria mão; dos outros, só quantas cartas têm (no fim, todas aparecem)
  function viewFor(st, pid) {
    if (st.view) return st;
    const me = st.players.findIndex(p => p.id === pid);
    return {
      ...st, view: true, ev: [], deck: [], deckN: st.deck.length,
      players: st.players.map((p, i) => ({ ...p, count: p.hand.length, hand: i === me || st.phase === 'over' ? p.hand : [] })),
      log: st.log.map(e => (e.t === 'draw' && e.p !== me ? { ...e, cards: e.cards.map(() => -1) } : e)),
      drawn: st.turn === me ? st.drawn : null,
      exposed: st.exposed && { p: st.exposed.p },
    };
  }

  return { COLORS, CARDS, RULES, RULE_LIST, canPlay, pts, newGame, act, botAction, afkAction, botDelay, nextDeadline, timeout, viewFor };
})();
if (typeof module !== 'undefined') module.exports = Ultima;
