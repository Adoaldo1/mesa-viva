// ===== Arquipélago — motor de regras =====
// Roda só no anfitrião (é a autoridade): os jogadores mandam intenções ({type, ...}) e o motor confere vez, fase,
// recursos, peças e posição antes de aplicar. Não depende de interface nem de rede (os testes rodam em Node).
//
// Fases: setup (vila + trilha, ida e volta) → roll → [discard → storm → steal] → main → (próximo jogador)
//        cartas podem abrir: storm/steal (Explorador) e roads (Carpinteiros), voltando para a fase de onde saíram.
const Arq = (() => {
  const Grid = typeof ArqGrid !== 'undefined' ? ArqGrid : require('./arq-grid.js');
  const MapGen = typeof ArqMap !== 'undefined' ? ArqMap : require('./arq-map.js');
  const RES = MapGen.RES, TERRAIN_RES = MapGen.TERRAIN_RES;

  const COST = {
    trilha: { madeira: 1, argila: 1 },
    vila: { madeira: 1, argila: 1, algodao: 1, peixe: 1 },
    cidade: { pedra: 2, algodao: 2 },
    carta: { pedra: 1, peixe: 1, algodao: 1 },
  };
  const PIECES = { trilha: 15, vila: 5, cidade: 4 };
  const DECK = {
    std: { explorador: 14, carpinteiros: 2, tesouro: 2, mercado: 2, reliquia: 5 },
    big: { explorador: 20, carpinteiros: 3, tesouro: 3, mercado: 3, reliquia: 5 },
  };
  const BANK = { std: 19, big: 24 };
  const GOAL = { std: 10, big: 11 };
  const DISCARD_OVER = 9, LONGEST_MIN = 5, ARMY_MIN = 3, TWO_P_SHIELD = 3;
  const COLORS = [
    { id: 'vermelho', name: 'Vermelho', hex: '#d8442f' }, { id: 'azul', name: 'Azul', hex: '#2f6fd6' },
    { id: 'laranja', name: 'Laranja', hex: '#f08a24' }, { id: 'branco', name: 'Branco', hex: '#f1ece0' },
    { id: 'verde', name: 'Verde', hex: '#3d9a4f' }, { id: 'roxo', name: 'Roxo', hex: '#8a4fc4' },
  ];
  const CARD_INFO = {
    explorador: { name: 'Explorador', text: 'Mova a tempestade e roube 1 recurso de quem tiver construção ao lado. Conta para a Maior Expedição.' },
    carpinteiros: { name: 'Carpinteiros', text: 'Construa 2 trilhas de graça.' },
    tesouro: { name: 'Mapa do Tesouro', text: 'Pegue 2 recursos quaisquer do banco.' },
    mercado: { name: 'Mercado Negro', text: 'Até 3 trocas de 1 por 1 com o banco neste turno.' },
    reliquia: { name: 'Relíquia', text: '1 ponto de vitória (fica escondida até o fim).' },
  };

  let rnd = Math.random, nameOf = id => id;
  const setRng = f => { rnd = f || Math.random; };
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const d6 = () => 1 + Math.floor(rnd() * 6);
  const grid = st => Grid.build(st.map.size);
  const pl = (st, id) => st.players.find(p => p.id === id);
  const cur = st => st.players[st.turn];
  const total = h => RES.reduce((s, r) => s + (h[r] || 0), 0);
  const emptyHand = () => Object.fromEntries(RES.map(r => [r, 0]));
  const has = (h, cost) => Object.entries(cost).every(([r, n]) => (h[r] || 0) >= n);
  const take = (h, cost) => { for (const [r, n] of Object.entries(cost)) h[r] -= n; };
  const give = (h, cost) => { for (const [r, n] of Object.entries(cost)) h[r] = (h[r] || 0) + n; };
  const resList = c => Object.entries(c).filter(([, n]) => n > 0).map(([r, n]) => `${n} ${RES_NAME[r]}`).join(', ');
  const RES_NAME = { madeira: 'madeira', argila: 'argila', algodao: 'algodão', pedra: 'pedra', peixe: 'peixe' };

  function log(st, msg) { st.log.push({ t: Date.now(), msg }); if (st.log.length > 200) st.log.shift(); }
  function ev(st, e) { st.ev.n++; st.evs.push({ ...e, n: st.ev.n }); if (st.evs.length > 40) st.evs.shift(); }

  // ---------- nova partida ----------
  function newGame(room, opts = {}) {
    const n = room.players.length, size = opts.size || (n >= 5 ? 'big' : 'std');
    const map = opts.map || MapGen.generate(size, room.settings?.mapMode === 'balanced' ? 'balanced' : 'random', rnd);
    const used = new Set();
    const order = shuffle(room.players.map(p => p.id));
    const players = order.map(id => {
      const rp = room.players.find(p => p.id === id);
      let color = COLORS[rp.seat]?.id; if (!color || used.has(color)) color = COLORS.find(c => !used.has(c.id)).id; used.add(color);
      return { id, color, hand: emptyHand(), cards: [], played: { explorador: 0 }, pieces: { ...PIECES } };
    });
    const deckDef = DECK[size];
    const st = {
      gameId: 'a' + Date.now().toString(36) + Math.floor(rnd() * 1e6).toString(36), game: 'arq', v: 0,
      map, players, bank: Object.fromEntries(RES.map(r => [r, BANK[size]])),
      deck: shuffle(Object.entries(deckDef).flatMap(([k, c]) => Array(c).fill(k))),
      buildings: {}, roads: {}, storm: map.volcano, goal: GOAL[size],
      phase: 'setup', turn: 0, round: 0, turnNo: 0, dice: null, rolled: false, cardPlayed: false, blackMarket: 0, freeRoads: 0, resume: null,
      setup: { order: [...players.keys(), ...[...players.keys()].reverse()], i: 0, need: 'vila', lastVila: null },
      discard: null, stealFrom: null, offer: null, longest: { owner: null, len: 0 }, army: { owner: null, n: 0 },
      log: [], ev: { n: 0 }, evs: [], nonces: {}, result: null,
      turnMs: (room.settings?.arqTurnSec ?? (room.game === 'arq' ? 120 : room.settings?.turnSec ?? 120)) * 1000, deadline: 0, startAt: Date.now(),
    };
    st.turn = st.setup.order[0];
    log(st, `🏝️ A partida começou! ${n} capitães, mapa ${size === 'big' ? 'grande (5–6)' : 'padrão'} ${map.mode === 'balanced' ? 'equilibrado' : 'aleatório'}. Vence quem chegar a ${st.goal} pontos.`);
    log(st, `🧭 Ordem: ${players.map(p => nameOf(p.id)).join(' → ')}. Cada um põe uma vila e uma trilha, e depois mais uma de cada na ordem inversa.`);
    ev(st, { type: 'start' });
    arm(st);
    return st;
  }

  // ---------- consultas do tabuleiro ----------
  const buildingAt = (st, v) => st.buildings[v] || null;
  function vertexFreeForVila(st, v) {
    const g = grid(st); if (st.buildings[v]) return false;
    return g.vertices[v].adj.every(u => !st.buildings[u]); // regra da distância: nada nas interseções vizinhas
  }
  function canPlaceVila(st, pid, v, setup = false) {
    const g = grid(st); if (!g.vertices[v] || !vertexFreeForVila(st, v)) return false;
    if (setup) return true;
    return g.vertices[v].edges.some(e => st.roads[e] === pid);
  }
  function canPlaceRoad(st, pid, e, fromVila = null) {
    const g = grid(st), E = g.edges[e]; if (!E || st.roads[e] != null) return false;
    if (fromVila != null) return E.a === fromVila || E.b === fromVila; // colocação inicial: encostada na vila que acabou de pôr
    for (const v of [E.a, E.b]) {
      const b = st.buildings[v];
      if (b && b.owner === pid) return true;
      if (b && b.owner !== pid) continue; // construção de outro bloqueia a passagem por essa interseção
      if (g.vertices[v].edges.some(x => x !== e && st.roads[x] === pid)) return true;
    }
    return false;
  }
  const validVilaSpots = (st, pid, setup = false) => grid(st).vertices.filter(v => canPlaceVila(st, pid, v.id, setup)).map(v => v.id);
  const validRoadSpots = (st, pid, fromVila = null) => grid(st).edges.filter(e => canPlaceRoad(st, pid, e.id, fromVila)).map(e => e.id);
  const validCitySpots = (st, pid) => Object.entries(st.buildings).filter(([, b]) => b.owner === pid && b.type === 'vila').map(([v]) => +v);

  // hexágonos que produzem para uma interseção (terra com número e cardumes)
  const producingHexes = (st, v) => grid(st).vertices[v].hexes.filter(h => st.map.tiles[h].num);

  // ---------- pontuação ----------
  function publicVP(st, p) {
    let vp = 0;
    for (const b of Object.values(st.buildings)) if (b.owner === p.id) vp += b.type === 'cidade' ? 2 : 1;
    if (st.longest.owner === p.id) vp += 2;
    if (st.army.owner === p.id) vp += 2;
    return vp;
  }
  const hiddenVP = p => p.cards.filter(c => c.k === 'reliquia').length;
  const totalVP = (st, p) => publicVP(st, p) + hiddenVP(p);

  // ---------- rota mais longa ----------
  function roadLength(st, pid) {
    const g = grid(st), mine = Object.keys(st.roads).map(Number).filter(e => st.roads[e] === pid);
    if (!mine.length) return 0;
    const blocked = v => { const b = st.buildings[v]; return b && b.owner !== pid; };
    let best = 0;
    const dfs = (v, used) => {
      let m = used.size;
      if (used.size && blocked(v)) return m; // não atravessa a construção de outro jogador
      for (const e of g.vertices[v].edges) {
        if (used.has(e) || st.roads[e] !== pid) continue;
        used.add(e); const E = g.edges[e];
        m = Math.max(m, dfs(E.a === v ? E.b : E.a, used));
        used.delete(e);
      }
      return m;
    };
    const starts = new Set(mine.flatMap(e => [g.edges[e].a, g.edges[e].b]));
    for (const v of starts) best = Math.max(best, dfs(v, new Set()));
    return best;
  }
  function updateLongest(st) {
    const lens = Object.fromEntries(st.players.map(p => [p.id, roadLength(st, p.id)]));
    const holder = st.longest.owner, prev = holder;
    const max = Math.max(...Object.values(lens));
    if (holder && lens[holder] >= LONGEST_MIN && lens[holder] >= max) { st.longest.len = lens[holder]; return; }
    const top = Object.keys(lens).filter(id => lens[id] === max);
    if (max >= LONGEST_MIN && top.length === 1) st.longest = { owner: top[0], len: max };
    else st.longest = { owner: null, len: max >= LONGEST_MIN ? max : 0 }; // empate sem quem já tinha: ninguém fica
    if (st.longest.owner !== prev) {
      if (st.longest.owner) { log(st, `🛤️ ${nameOf(st.longest.owner)} tem a Rota Mais Longa (${st.longest.len} trilhas): +2 pontos.`); ev(st, { type: 'award', k: 'longest', pid: st.longest.owner, from: prev }); }
      else if (prev) { log(st, `🛤️ ${nameOf(prev)} perdeu a Rota Mais Longa e ninguém ficou com ela.`); ev(st, { type: 'award', k: 'longest', pid: null, from: prev }); }
    }
  }
  function updateArmy(st, p) {
    const n = p.played.explorador, h = st.army.owner;
    if (n >= ARMY_MIN && h !== p.id && n > (h ? pl(st, h).played.explorador : 0)) {
      st.army = { owner: p.id, n }; log(st, `🧭 ${nameOf(p.id)} tem a Maior Expedição (${n} exploradores): +2 pontos.`); ev(st, { type: 'award', k: 'army', pid: p.id, from: h });
    } else if (h === p.id) st.army.n = n;
  }

  function checkWin(st) {
    if (st.result || st.phase === 'setup') return;
    const p = cur(st);
    if (totalVP(st, p) >= st.goal) {
      st.phase = 'over';
      const ranking = [...st.players].map(q => ({ id: q.id, vp: totalVP(st, q), relics: hiddenVP(q) })).sort((a, b) => b.vp - a.vp);
      st.result = { winner: p.id, ranking };
      st.offer = null; st.deadline = 0;
      log(st, `🏆 ${nameOf(p.id)} chegou a ${totalVP(st, p)} pontos e venceu!${hiddenVP(p) ? ` (${hiddenVP(p)} relíquia${hiddenVP(p) > 1 ? 's' : ''} escondida${hiddenVP(p) > 1 ? 's' : ''})` : ''}`);
      ev(st, { type: 'win', pid: p.id });
    }
  }

  // ---------- produção ----------
  function produce(st, roll) {
    const g = grid(st), due = {}; // recurso → {pid: n}
    for (const t of st.map.tiles) {
      if (t.num !== roll || t.id === st.storm) continue;
      const r = TERRAIN_RES[t.terrain]; if (!r) continue;
      for (const v of g.hexes[t.id].corners) {
        const b = v != null && st.buildings[v]; if (!b) continue;
        due[r] = due[r] || {}; due[r][b.owner] = (due[r][b.owner] || 0) + (b.type === 'cidade' ? 2 : 1);
      }
    }
    const gains = {};
    for (const [r, who] of Object.entries(due)) {
      const need = Object.values(who).reduce((a, b) => a + b, 0), ids = Object.keys(who);
      if (need > st.bank[r]) {
        if (ids.length > 1) { log(st, `🏦 O banco não tem ${RES_NAME[r]} para todos: ninguém recebe ${RES_NAME[r]}.`); continue; }
        who[ids[0]] = st.bank[r]; // só uma pessoa: leva o que sobrou
      }
      for (const [id, n] of Object.entries(who)) { if (!n) continue; pl(st, id).hand[r] += n; st.bank[r] -= n; (gains[id] = gains[id] || {})[r] = n; }
    }
    return gains;
  }

  // ---------- turno ----------
  function arm(st) { st.deadline = st.turnMs && !st.result ? Date.now() + st.turnMs : 0; }
  function nextTurn(st) {
    st.offer = null; st.blackMarket = 0; st.cardPlayed = false; st.rolled = false; st.dice = null; st.freeRoads = 0; st.resume = null;
    st.turn = (st.turn + 1) % st.players.length; if (st.turn === 0) st.round++;
    st.turnNo++; st.phase = 'roll';
    log(st, `➡️ Vez de ${nameOf(cur(st).id)}.`); ev(st, { type: 'turn', pid: cur(st).id });
    arm(st);
  }
  function afterSetupStep(st) {
    const s = st.setup;
    s.i++;
    if (s.i >= s.order.length) {
      st.phase = 'roll'; st.turn = 0; st.round = 1; st.turnNo = 1; s.need = null;
      log(st, `🎲 Colonização concluída! ${nameOf(cur(st).id)} começa rolando os dados.`); ev(st, { type: 'turn', pid: cur(st).id });
    } else { st.turn = s.order[s.i]; s.need = 'vila'; s.lastVila = null; }
    arm(st);
  }

  function resumePhase(st) { st.phase = st.resume || 'main'; st.resume = null; }

  // abre a fase da tempestade; 'resume' é a fase para onde o jogo volta depois (dados ou ações livres)
  function startStorm(st, by, resume) { st.resume = resume; st.phase = 'storm'; st.stormBy = by; }

  function rollDice(st) {
    const p = cur(st), a = d6(), b = d6(), sum = a + b;
    st.dice = [a, b]; st.rolled = true;
    log(st, `🎲 ${nameOf(p.id)} rolou ${a} + ${b} = ${sum}.`);
    if (sum === 7) {
      const need = {};
      for (const q of st.players) { const t = total(q.hand); if (t > DISCARD_OVER) need[q.id] = Math.floor(t / 2); }
      ev(st, { type: 'roll', pid: p.id, dice: [a, b], sum, gains: {} });
      log(st, `🌪️ Sete! A tempestade vai se mover.${Object.keys(need).length ? ` Quem tem mais de ${DISCARD_OVER} cartas descarta metade: ${Object.entries(need).map(([id, n]) => `${nameOf(id)} (${n})`).join(', ')}.` : ''}`);
      if (Object.keys(need).length) { st.discard = need; st.phase = 'discard'; }
      else startStorm(st, 'roll', 'main');
      return;
    }
    const gains = produce(st, sum);
    ev(st, { type: 'roll', pid: p.id, dice: [a, b], sum, gains });
    const txt = Object.entries(gains).map(([id, g]) => `${nameOf(id)}: ${resList(g)}`).join(' · ');
    log(st, txt ? `📦 Produção — ${txt}.` : '📦 Ninguém produziu nada.');
    st.phase = 'main';
  }

  function stealCandidates(st) {
    const g = grid(st), me = cur(st).id, out = new Set();
    for (const v of g.hexes[st.storm].corners) {
      const b = v != null && st.buildings[v]; if (!b || b.owner === me) continue;
      const q = pl(st, b.owner);
      if (total(q.hand) === 0) continue;
      if (st.players.length === 2 && publicVP(st, q) <= TWO_P_SHIELD) continue; // proteção do 1 contra 1
      out.add(b.owner);
    }
    return [...out];
  }
  function stealFrom(st, victimId) {
    const p = cur(st), q = pl(st, victimId), pool = RES.flatMap(r => Array(q.hand[r]).fill(r));
    if (!pool.length) return;
    const r = pool[Math.floor(rnd() * pool.length)];
    q.hand[r]--; p.hand[r]++;
    log(st, `🦹 ${nameOf(p.id)} roubou 1 recurso de ${nameOf(q.id)}.`);
    ev(st, { type: 'steal', pid: p.id, from: q.id, res: r }); // a interface só mostra o recurso para os dois envolvidos
  }

  // ---------- comércio ----------
  function marketRatios(st, pid) {
    const out = Object.fromEntries(RES.map(r => [r, 4])), g = grid(st);
    for (const m of st.map.markets) {
      const E = g.edges[m.edge];
      if (![E.a, E.b].some(v => st.buildings[v]?.owner === pid)) continue;
      if (m.type === 'any') for (const r of RES) out[r] = Math.min(out[r], 3);
      else out[m.type] = Math.min(out[m.type], 2);
    }
    return out;
  }
  const cleanRes = o => { const c = {}; for (const r of RES) { const n = Math.floor(+(o?.[r]) || 0); if (n > 0) c[r] = n; } return c; };

  // ---------- ações ----------
  function act(st, pid, a) {
    const err = actInner(st, pid, a || {});
    if (!err) { st.v++; if (a?.nonce) st.nonces[pid] = a.nonce; }
    return err;
  }

  function actInner(st, pid, a) {
    if (st.result) return 'A partida acabou.';
    const p = pl(st, pid); if (!p) return 'Você não está nesta partida.';
    if (a.nonce && st.nonces[pid] === a.nonce) return 'Ação repetida.';
    const isCur = cur(st).id === pid;
    const g = grid(st);

    // respostas que valem fora da vez
    if (a.type === 'discard') {
      const need = st.discard?.[pid]; if (st.phase !== 'discard' || !need) return 'Você não precisa descartar.';
      const c = cleanRes(a.res), n = total(c);
      if (n !== need) return `Escolha exatamente ${need} carta${need > 1 ? 's' : ''} para descartar.`;
      if (!has(p.hand, c)) return 'Você não tem essas cartas.';
      take(p.hand, c); give(st.bank, c); delete st.discard[pid];
      log(st, `🗑️ ${nameOf(pid)} descartou ${n} carta${n > 1 ? 's' : ''}.`); ev(st, { type: 'discard', pid, n });
      if (!Object.keys(st.discard).length) { st.discard = null; startStorm(st, 'roll', 'main'); }
      return null;
    }
    if (a.type === 'reply' || a.type === 'counter') {
      const o = st.offer; if (!o || o.from === pid) return 'Não há proposta para responder.';
      if (o.to && !o.to.includes(pid)) return 'Essa proposta não é para você.';
      if (a.type === 'counter') {
        const giveC = cleanRes(a.give), getC = cleanRes(a.get); // do ponto de vista de quem propôs a original
        if (!total(giveC) || !total(getC)) return 'A contraproposta precisa ter algo dos dois lados.';
        if (!has(p.hand, getC)) return 'Você não tem o que está oferecendo.';
        o.counters[pid] = { give: giveC, get: getC }; o.replies[pid] = 'counter';
        log(st, `🔁 ${nameOf(pid)} fez uma contraproposta para ${nameOf(o.from)}.`); return null;
      }
      if (a.accept && !has(p.hand, o.get)) return 'Você não tem o que foi pedido.';
      o.replies[pid] = a.accept ? 'accept' : 'decline'; delete o.counters[pid];
      return null;
    }

    if (!isCur) return 'Não é a sua vez.';

    switch (a.type) {
      // ----- colocação inicial -----
      case 'setupVila': {
        if (st.phase !== 'setup' || st.setup.need !== 'vila') return 'Agora não é hora de pôr vila.';
        const v = +a.v; if (!canPlaceVila(st, pid, v, true)) return 'Não dá para pôr uma vila aí (precisa de 2 arestas de distância de outra construção).';
        st.buildings[v] = { owner: pid, type: 'vila' }; p.pieces.vila--;
        st.setup.need = 'trilha'; st.setup.lastVila = v;
        const second = st.setup.i >= st.players.length;
        if (second) {
          const got = {};
          for (const h of producingHexes(st, v)) { const r = TERRAIN_RES[st.map.tiles[h].terrain]; if (r && st.bank[r] > 0) { p.hand[r]++; st.bank[r]--; got[r] = (got[r] || 0) + 1; } }
          if (total(got)) log(st, `🎁 ${nameOf(pid)} recebeu ${resList(got)} da segunda vila.`);
          ev(st, { type: 'build', what: 'vila', at: v, pid, gains: got });
        } else ev(st, { type: 'build', what: 'vila', at: v, pid });
        return null;
      }
      case 'setupTrilha': {
        if (st.phase !== 'setup' || st.setup.need !== 'trilha') return 'Agora não é hora de pôr trilha.';
        const e = +a.e; if (!canPlaceRoad(st, pid, e, st.setup.lastVila)) return 'A trilha precisa sair da vila que você acabou de pôr.';
        st.roads[e] = pid; p.pieces.trilha--; ev(st, { type: 'build', what: 'trilha', at: e, pid });
        afterSetupStep(st);
        return null;
      }

      // ----- dados e tempestade -----
      case 'roll': {
        if (st.phase !== 'roll') return st.rolled ? 'Você já rolou os dados.' : 'Agora não dá para rolar.';
        rollDice(st); checkWin(st); return null;
      }
      case 'storm': {
        if (st.phase !== 'storm') return 'Agora não é hora de mover a tempestade.';
        const t = +a.tile; if (!g.hexes[t]) return 'Hexágono inválido.';
        if (t === st.storm) return 'A tempestade precisa sair de onde está.';
        st.storm = t; log(st, `🌪️ ${nameOf(pid)} levou a tempestade para ${tileName(st, t)}.`); ev(st, { type: 'storm', tile: t, pid });
        const c = stealCandidates(st);
        if (c.length === 1) { stealFrom(st, c[0]); resumePhase(st); }
        else if (c.length > 1) { st.phase = 'steal'; st.stealFrom = c; }
        else resumePhase(st);
        checkWin(st); return null;
      }
      case 'steal': {
        if (st.phase !== 'steal') return 'Agora não é hora de roubar.';
        if (!st.stealFrom.includes(a.from)) return 'Escolha alguém com construção ao lado da tempestade.';
        stealFrom(st, a.from); st.stealFrom = null; resumePhase(st); checkWin(st); return null;
      }

      // ----- construções -----
      case 'build': {
        const what = a.what;
        if (st.phase === 'roads') {
          if (what !== 'trilha') return 'Termine as trilhas dos Carpinteiros primeiro.';
          const e = +a.at; if (!canPlaceRoad(st, pid, e)) return 'A trilha precisa se ligar a uma construção ou trilha sua.';
          st.roads[e] = pid; p.pieces.trilha--; st.freeRoads--; ev(st, { type: 'build', what, at: e, pid, free: true });
          updateLongest(st);
          if (st.freeRoads <= 0 || !p.pieces.trilha || !validRoadSpots(st, pid).length) { st.freeRoads = 0; resumePhase(st); }
          checkWin(st); return null;
        }
        if (st.phase !== 'main') return st.phase === 'roll' ? 'Role os dados primeiro.' : 'Agora não dá para construir.';
        if (!COST[what] || what === 'carta') return 'Construção inválida.';
        if (!has(p.hand, COST[what])) return 'Recursos insuficientes.';
        if (what === 'trilha') {
          const e = +a.at; if (!p.pieces.trilha) return 'Você não tem mais trilhas.';
          if (!canPlaceRoad(st, pid, e)) return 'A trilha precisa se ligar a uma construção ou trilha sua (e não passa por construção de outro).';
          pay(st, p, COST.trilha); st.roads[e] = pid; p.pieces.trilha--;
          ev(st, { type: 'build', what, at: e, pid }); updateLongest(st);
        } else if (what === 'vila') {
          const v = +a.at; if (!p.pieces.vila) return 'Você não tem mais vilas (transforme uma em cidade).';
          if (!canPlaceVila(st, pid, v)) return 'A vila precisa estar ligada a uma trilha sua e a 2 arestas de distância de qualquer construção.';
          pay(st, p, COST.vila); st.buildings[v] = { owner: pid, type: 'vila' }; p.pieces.vila--;
          ev(st, { type: 'build', what, at: v, pid }); updateLongest(st); // uma vila nova pode cortar a rota de alguém
          log(st, `🏠 ${nameOf(pid)} fundou uma vila.`);
        } else if (what === 'cidade') {
          const v = +a.at; if (!p.pieces.cidade) return 'Você não tem mais cidades.';
          const b = st.buildings[v]; if (!b || b.owner !== pid || b.type !== 'vila') return 'Escolha uma vila sua para virar cidade.';
          pay(st, p, COST.cidade); b.type = 'cidade'; p.pieces.cidade--; p.pieces.vila++;
          ev(st, { type: 'build', what, at: v, pid }); log(st, `🏛️ ${nameOf(pid)} transformou uma vila em cidade.`);
        } else return 'Construção inválida.';
        checkWin(st); return null;
      }

      // ----- cartas de expedição -----
      case 'buyCard': {
        if (st.phase !== 'main') return 'Role os dados primeiro.';
        if (!st.deck.length) return 'Acabaram as cartas de expedição.';
        if (!has(p.hand, COST.carta)) return 'Recursos insuficientes.';
        pay(st, p, COST.carta);
        const k = st.deck.pop(); p.cards.push({ k, t: st.turnNo });
        log(st, `🃏 ${nameOf(pid)} comprou uma carta de expedição.`); ev(st, { type: 'card', pid, k });
        checkWin(st); return null; // relíquia conta na hora
      }
      case 'playCard': {
        if (!['roll', 'main'].includes(st.phase)) return 'Agora não dá para usar cartas.';
        if (st.cardPlayed) return 'Só uma carta por turno.';
        const k = a.card; if (!CARD_INFO[k] || k === 'reliquia') return 'Essa carta não se usa (a relíquia conta sozinha).';
        const i = p.cards.findIndex(c => c.k === k && c.t < st.turnNo);
        if (i < 0) return p.cards.some(c => c.k === k) ? 'Cartas compradas neste turno só podem ser usadas a partir do próximo.' : 'Você não tem essa carta.';
        if (k === 'tesouro') {
          const want = (Array.isArray(a.res) ? a.res : []).filter(r => RES.includes(r)).slice(0, 2);
          if (want.length !== 2) return 'Escolha 2 recursos.';
          const need = {}; want.forEach(r => { need[r] = (need[r] || 0) + 1; });
          if (!has(st.bank, need)) return 'O banco não tem esses recursos.';
          take(st.bank, need); give(p.hand, need);
          log(st, `🗺️ ${nameOf(pid)} usou o Mapa do Tesouro: ${resList(need)}.`);
        } else if (k === 'carpinteiros') {
          const n = Math.min(2, p.pieces.trilha);
          if (!n || !validRoadSpots(st, pid).length) return 'Você não tem onde pôr trilhas.';
          st.resume = st.phase; st.phase = 'roads'; st.freeRoads = n;
          log(st, `🪚 ${nameOf(pid)} chamou os Carpinteiros: ${n} trilha${n > 1 ? 's' : ''} de graça.`);
        } else if (k === 'mercado') {
          if (st.phase !== 'main') return 'Use o Mercado Negro depois de rolar os dados.';
          st.blackMarket = 3; log(st, `🕶️ ${nameOf(pid)} abriu o Mercado Negro: até 3 trocas de 1 por 1 com o banco.`);
        } else if (k === 'explorador') {
          p.played.explorador++; updateArmy(st, p);
          log(st, `🧭 ${nameOf(pid)} mandou um Explorador.`);
          startStorm(st, 'card', st.phase);
        }
        p.cards.splice(i, 1); st.cardPlayed = true;
        ev(st, { type: 'playCard', pid, k });
        checkWin(st); return null;
      }

      // ----- comércio -----
      case 'bank': {
        if (st.phase !== 'main') return 'Role os dados primeiro.';
        const from = a.give, to = a.get, n = Math.max(1, Math.floor(+a.n || 1));
        if (!RES.includes(from) || !RES.includes(to) || from === to) return 'Troca inválida.';
        const ratio = st.blackMarket > 0 ? 1 : marketRatios(st, pid)[from];
        if (st.blackMarket > 0 && n > st.blackMarket) return `O Mercado Negro só tem mais ${st.blackMarket} troca${st.blackMarket > 1 ? 's' : ''}.`;
        if (p.hand[from] < ratio * n) return `Precisa de ${ratio * n} ${RES_NAME[from]}.`;
        if (st.bank[to] < n) return `O banco não tem ${RES_NAME[to]} suficiente.`;
        p.hand[from] -= ratio * n; st.bank[from] += ratio * n; p.hand[to] += n; st.bank[to] -= n;
        if (st.blackMarket > 0) st.blackMarket -= n;
        log(st, `🏦 ${nameOf(pid)} trocou ${ratio * n} ${RES_NAME[from]} por ${n} ${RES_NAME[to]} com o banco.`); ev(st, { type: 'bank', pid });
        return null;
      }
      case 'offer': {
        if (st.phase !== 'main') return 'Role os dados primeiro.';
        const giveC = cleanRes(a.give), getC = cleanRes(a.get);
        if (!total(giveC) || !total(getC)) return 'A proposta precisa ter algo dos dois lados.';
        if (RES.some(r => giveC[r] && getC[r])) return 'Não dá para dar e pedir o mesmo recurso.';
        if (!has(p.hand, giveC)) return 'Você não tem o que está oferecendo.';
        const to = Array.isArray(a.to) && a.to.length ? a.to.filter(id => id !== pid && pl(st, id)) : null;
        st.offer = { id: (st.offer?.id || 0) + 1, from: pid, give: giveC, get: getC, to, replies: {}, counters: {} };
        log(st, `🤝 ${nameOf(pid)} propõe dar ${resList(giveC)} por ${resList(getC)}${to ? ` (para ${to.map(nameOf).join(', ')})` : ''}.`);
        ev(st, { type: 'offer', pid }); return null;
      }
      case 'confirm': {
        const o = st.offer; if (!o || st.phase !== 'main') return 'Não há proposta aberta.';
        const q = pl(st, a.with); if (!q || q.id === pid) return 'Escolha com quem trocar.';
        const deal = o.replies[q.id] === 'counter' ? o.counters[q.id] : o.replies[q.id] === 'accept' ? { give: o.give, get: o.get } : null;
        if (!deal) return `${nameOf(q.id)} não aceitou essa proposta.`;
        if (!has(p.hand, deal.give)) return 'Você não tem mais o que ofereceu.';
        if (!has(q.hand, deal.get)) { o.replies[q.id] = 'decline'; return `${nameOf(q.id)} não tem mais o que foi pedido.`; }
        take(p.hand, deal.give); give(q.hand, deal.give); take(q.hand, deal.get); give(p.hand, deal.get); // troca atômica
        log(st, `✅ ${nameOf(pid)} trocou ${resList(deal.give)} por ${resList(deal.get)} com ${nameOf(q.id)}.`);
        ev(st, { type: 'trade', a: pid, b: q.id }); st.offer = null;
        return null;
      }
      case 'cancelOffer': { if (!st.offer) return 'Não há proposta aberta.'; st.offer = null; return null; }
      case 'skipRoads': { if (st.phase !== 'roads') return 'Não há trilhas grátis pendentes.'; st.freeRoads = 0; resumePhase(st); return null; }

      case 'end': {
        if (st.phase === 'roads') { st.freeRoads = 0; resumePhase(st); if (st.phase !== 'main') return null; }
        if (st.phase !== 'main') return st.phase === 'roll' ? 'Role os dados antes de passar a vez.' : 'Termine a ação atual primeiro.';
        nextTurn(st); return null;
      }
    }
    return 'Ação desconhecida.';
  }
  function pay(st, p, cost) { take(p.hand, cost); give(st.bank, cost); }
  const TERRAIN_NAME = { mata: 'a mata', barreiro: 'o barreiro', algodoal: 'o algodoal', pedreira: 'a pedreira', vulcao: 'o vulcão', cardume: 'o cardume', mar: 'o mar' };
  const tileName = (st, t) => `${TERRAIN_NAME[st.map.tiles[t].terrain] || 'o mar'}${st.map.tiles[t].num ? ' ' + st.map.tiles[t].num : ''}`;

  // ---------- visão de cada jogador (esconde mãos e cartas dos outros) ----------
  function viewFor(st, pid) {
    const v = JSON.parse(JSON.stringify(st));
    v.deck = { count: st.deck.length }; v.nonces = {};
    for (const p of v.players) {
      p.handCount = total(p.hand); p.cardCount = p.cards.length; p.vp = publicVP(st, p);
      if (p.id === pid || st.result) { p.hiddenVP = hiddenVP(p); continue; }
      p.hand = null; p.cards = null;
    }
    // o recurso roubado só aparece para os dois envolvidos
    for (const e of v.evs) if (e.type === 'steal' && e.pid !== pid && e.from !== pid) delete e.res;
    for (const e of v.evs) if (e.type === 'card' && e.pid !== pid) delete e.k;
    v.me = pid;
    return v;
  }

  // ---------- tempo e jogadas automáticas ----------
  // jogada mínima no lugar de quem não age a tempo (ou está desconectado)
  function idleAction(st, pid) {
    if (st.discard?.[pid]) return { type: 'discard', res: autoDiscard(pl(st, pid).hand, st.discard[pid]) };
    if (st.offer && st.offer.from !== pid && !st.offer.replies[pid] && (!st.offer.to || st.offer.to.includes(pid))) return { type: 'reply', accept: false };
    if (cur(st).id !== pid) return null;
    return ArqBotRef().safeAction(st, pid);
  }
  function autoDiscard(hand, n) {
    const h = { ...hand }, out = {};
    for (let i = 0; i < n; i++) { const r = RES.reduce((b, x) => (h[x] > (h[b] || 0) ? x : b), RES[0]); h[r]--; out[r] = (out[r] || 0) + 1; }
    return out;
  }
  function timeout(st) {
    if (!st.deadline || st.result || Date.now() < st.deadline - 50) return false;
    // descartes pendentes e respostas a propostas
    for (const p of st.players) if (st.discard?.[p.id]) act(st, p.id, { type: 'discard', res: autoDiscard(p.hand, st.discard[p.id]) });
    const id = cur(st).id;
    log(st, `⏰ ${nameOf(id)} ficou sem tempo — jogada automática.`);
    let guard = 0;
    while (!st.result && cur(st).id === id && guard++ < 20) {
      const a = ArqBotRef().safeAction(st, id); if (!a) break;
      if (act(st, id, a)) { if (act(st, id, { type: 'end' })) break; }
      if (a.type === 'end') break;
    }
    arm(st);
    return true;
  }
  const ArqBotRef = () => (typeof ArqBot !== 'undefined' ? ArqBot : require('./arq-bot.js'));
  function botAction(st, pid) { return ArqBotRef().action(st, pid); }
  function afkAction(st, pid) { return idleAction(st, pid); }
  const botDelay = (a) => (a.type === 'roll' ? 900 : a.type === 'reply' || a.type === 'discard' ? 1100 : 750);

  return {
    RES, RES_NAME, COST, PIECES, DECK, GOAL, COLORS, CARD_INFO, DISCARD_OVER, LONGEST_MIN, ARMY_MIN, TERRAIN_RES,
    newGame, act, viewFor, botAction, afkAction, botDelay, timeout, setRng, setNameResolver: f => { nameOf = f; },
    // consultas usadas pela interface, pelos bots e pelos testes
    grid, total, has, publicVP, totalVP, hiddenVP, roadLength, marketRatios, validVilaSpots, validRoadSpots, validCitySpots, canPlaceVila, canPlaceRoad, stealCandidates, producingHexes, tileName,
  };
})();
if (typeof module !== 'undefined') module.exports = Arq;
