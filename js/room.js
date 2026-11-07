// ===== Sala (lobby) — lógica do anfitrião e do cliente =====
const Room = (() => {
  let room = null, isHost = false, myId = null, botTimer = null, auctionTimer = null, turnTimer = null, listeners = [], syncTimer = null, deadlineTimer = null, leaving = false, skew = 0, lastFxId = 0, fxEnd = 0;
  const onChange = f => listeners.push(f);
  const emit = () => listeners.forEach(f => f(room));

  const fromProfile = p => ({
    id: p.username, name: p.displayName || p.username, char: p.char, color: p.color || charById(p.char).color,
    emblem: p.emblem, title: p.title, frame: p.frame, catchphrase: p.catchphrase, stats: p.stats,
    ready: false, bot: false, connected: true,
  });
  const nameOf = id => (room?.players.find(p => p.id === id) || room?.spectators?.find(p => p.id === id))?.name || id;
  Magnata.setNameResolver(nameOf); Ludo.setNameResolver(nameOf); Conjura.setNameResolver(nameOf); Cah.setNameResolver(nameOf); War.setNameResolver(nameOf); Domino2.setNameResolver(nameOf); Arq.setNameResolver(nameOf);
  const engine = () => room.game === 'patrimonio' ? Patrimonio : room.game === 'arq' ? Arq : room.game === 'domino2' ? Domino2 : room.game === 'ludo' ? Ludo : room.game === 'conjura' ? Conjura : room.game === 'cah' ? Cah : room.game === 'war' ? War : Magnata;
  const maxPlayers = () => room.game === 'patrimonio' || room.game === 'arq' ? 6 : room.game === 'domino2' ? Domino2.maxSeats(room.settings.d9) : room.game === 'ludo' ? (room.settings.seats || 4) : room.game === 'conjura' ? 10 : room.game === 'cah' ? 12 : room.game === 'war' ? 6 : 8;
  // jogos com cartas escondidas: cada jogador recebe só a própria visão do estado
  const roomFor = pid => (room.state && engine().viewFor ? { ...room, state: engine().viewFor(room.state, pid) } : room);
  // Ludo: cada um entra na primeira cor livre (pode trocar no lobby se houver vaga)
  const freeSeat = () => room.game === 'ludo' || room.game === 'war' || room.game === 'arq' || room.game === 'patrimonio' ? [...Array(maxPlayers()).keys()].find(s => !room.players.some(p => p.seat === s)) : undefined;
  // quem estava assistindo entra quando abre vaga no lobby
  function promote() {
    while (room.phase === 'lobby' && room.spectators?.length && room.players.length < maxPlayers()) {
      const s = room.spectators.shift(); delete s.spectator;
      room.players.push({ ...s, ready: false, seat: freeSeat() }); sysChat(`${s.name} entrou na partida.`);
    }
  }

  // Dominó, rodízio de bar: quem perde sai e dá o lugar (o mesmo lugar, para as duplas não mudarem) para quem está na fila
  function rotate(st) {
    const side = s => Domino2.teamOf(st, s);
    const losers = st.players.map((q, s) => ({ p: room.players.find(x => x.id === q.id), s })).filter(o => o.p && side(o.s) !== st.result.side && o.p.id !== room.hostId) // shortcut: o anfitrião nunca sai (a sala roda na máquina dele)
      .sort((a, b) => (!!b.p.bot - !!a.p.bot) || (st.score[side(a.s)] - st.score[side(b.s)])); // bot sai primeiro, depois quem fez menos pontos
    for (const { p } of losers.slice(0, room.spectators.length)) {
      const i = room.players.indexOf(p), s = room.spectators.shift(); delete s.spectator;
      room.players[i] = { ...s, ready: false, seat: p.seat };
      if (!p.bot && p.connected) { const q = { ...p, spectator: true }; delete q.ready; delete q.seat; room.spectators.push(q); }
      sysChat(`🔄 Quem perde sai: ${p.name} dá a vez para ${s.name}.`);
    }
  }

  // ----- anfitrião -----
  function create(me, game, onReady, onError) {
    isHost = true; myId = me.username;
    Net.on('error', onError);
    Net.host(code => {
      room = { code, hostId: myId, game, settings: { startMoney: ECON.START, maxRounds: 30, variant: 'diplomata', respondSec: 15, turnSec: 90, goal: 7, answerSec: 60, gamble: true, reboot: false, swap: true }, players: [{ ...fromProfile(me), ready: true, ...(game === 'ludo' || game === 'war' || game === 'arq' || game === 'patrimonio' ? { seat: 0 } : {}) }], chat: [], phase: 'lobby', state: null };
      sysChat(`Sala ${code} criada. Compartilhe o código com seus amigos!`);
      onReady(code); commit();
    }, (peerId, msg) => handle(peerId, msg), (pid, peerId) => {
      // conexão velha expirando depois que a pessoa já voltou por outro caminho: não derruba a nova
      const cur = room?.players.find(x => x.id === pid) || room?.spectators?.find(x => x.id === pid);
      if (cur && peerId && cur._peer && cur._peer !== peerId) return;
      const sp = room?.spectators?.find(x => x.id === pid);
      if (sp) { room.spectators = room.spectators.filter(x => x !== sp); sysChat(`${sp.name} parou de assistir.`); return commit(); }
      const p = room?.players.find(x => x.id === pid);
      if (!p) return;
      if (room.phase === 'lobby') { room.players = room.players.filter(x => x.id !== pid); }
      else p.connected = false;
      sysChat(`${p.name} saiu da sala.`); promote(); commit();
    });
  }

  function sysChat(text) { room.chat.push({ from: null, text, t: Date.now() }); if (room.chat.length > 80) room.chat.shift(); }

  function commit() {
    if (room.state && !room.state.startAt) room.state.startAt = Date.now(); // relógio da partida
    if (room.state?.result && !room.state.endAt) room.state.endAt = Date.now();
    room.rev = (room.rev || 0) + 1; // versão do estado: o jogador ignora estados mais velhos e pede o atual se ficar para trás
    const now = Date.now();
    if (engine().viewFor && room.state) Net.broadcastWith(pid => ({ t: 'room', room: roomFor(pid), now }));
    else Net.broadcast({ t: 'room', room, now });
    emit();
    saveGame();
    scheduleBots();
  }

  // ----- partida salva no anfitrião (Arquipélago): se a aba fechar ou cair, dá para retomar -----
  const SAVE_KEY = 'mesaviva.save.arq';
  function saveGame() {
    if (!isHost || !room || room.game !== 'arq') return;
    try {
      if (room.phase !== 'game' || !room.state || room.state.result) { localStorage.removeItem(SAVE_KEY); return; }
      const strip = p => { const q = { ...p }; delete q._peer; delete q._emo; delete q._punch; return q; };
      localStorage.setItem(SAVE_KEY, JSON.stringify({ t: Date.now(), room: { ...room, players: room.players.map(strip), spectators: [] } }));
    } catch (e) { console.warn('save', e); }
  }
  function savedGame(me) {
    try { const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); if (!s || s.room.hostId !== me.username || Date.now() - s.t > 48 * 3600e3) return null; return s; } catch { return null; }
  }
  const dropSave = () => { try { localStorage.removeItem(SAVE_KEY); } catch { } };
  // recria a sala com o mesmo estado; os outros jogadores voltam pelo próprio usuário (mesmo código, se estiver livre)
  function resume(me, save, onReady, onError) {
    isHost = true; myId = me.username;
    Net.on('error', onError);
    const want = save.room.code;
    Net.host(code => {
      room = save.room; room.code = code; room.hostId = myId; room.spectators = [];
      room.players.forEach(p => { p.connected = !!p.bot || p.id === myId; delete p._peer; });
      // carência: ninguém é jogado pelo automático enquanto os amigos reconectam, e o relógio da vez recomeça
      room.graceUntil = Date.now() + 90000;
      if (room.state.turnMs) room.state.deadline = room.graceUntil + room.state.turnMs;
      sysChat(`Partida retomada${code === want ? '' : ` com o código novo ${code}`}. Esperando os jogadores voltarem…`);
      onReady(code); commit();
      setTimeout(() => { if (room) scheduleBots(); }, 90500);
    }, (peerId, msg) => handle(peerId, msg), (pid, peerId) => {
      const cur = room?.players.find(x => x.id === pid);
      if (cur && peerId && cur._peer && cur._peer !== peerId) return;
      const p = room?.players.find(x => x.id === pid); if (!p) return;
      p.connected = false; sysChat(`${p.name} saiu da sala.`); commit();
    }, 0, want);
  }

  function reply(peerId, msg) { if (peerId === null) UI.toast(msg.msg, 'err'); else Net.toPeer(peerId, msg); }
  const sendState = peerId => { if (peerId !== null && room) Net.toPeer(peerId, { t: 'room', room: roomFor(Net.pidOf(peerId)), now: Date.now() }); };

  // peerId === null => mensagem do próprio anfitrião
  function handle(peerId, msg) {
    if (!room) return;
    const pid = peerId === null ? myId : (room.players.find(p => p._peer === peerId) || room.spectators?.find(p => p._peer === peerId))?.id;
    if (msg.t === 'hello') {
      const prof = msg.profile; if (!prof?.username) return;
      const existing = room.players.find(p => p.id === prof.username);
      const sameSession = existing && msg.key && existing._key === msg.key;
      if ((existing && existing.connected && !existing.bot && !sameSession) || room.spectators?.some(s => s.id === prof.username && s._key !== msg.key)) return Net.toPeer(peerId, { t: 'error', msg: 'Já existe um jogador com esse usuário na sala.', fatal: true });
      const relay = Net.isRelayPeer(peerId);
      // partida em andamento ou sala cheia — entra para assistir (vira jogador quando abrir vaga no lobby)
      if (!existing && (room.phase !== 'lobby' || room.players.length >= maxPlayers())) {
        room.spectators = (room.spectators || []).filter(s => s.id !== prof.username);
        room.spectators.push({ ...fromProfile(prof), _peer: peerId, _key: msg.key, relay, spectator: true });
        sysChat(`👀 ${prof.displayName || prof.username} está assistindo.`);
        Net.bindPeer(peerId, prof.username); Net.toPeer(peerId, { t: 'welcome', id: prof.username, v: APP_VERSION });
        return commit();
      }
      if (!existing && room.phase !== 'lobby') return Net.toPeer(peerId, { t: 'error', msg: 'A partida já começou.', fatal: true });
      if (!existing && room.players.length >= maxPlayers()) return Net.toPeer(peerId, { t: 'error', msg: `Sala cheia (máx. ${maxPlayers()}).`, fatal: true });
      if (existing) { const was = existing.connected; Object.assign(existing, { connected: true, _peer: peerId, _key: msg.key, relay }); if (!was || !sameSession) sysChat(`${existing.name} reconectou${relay ? ' (via servidor de reserva)' : ''}.`); }
      else { room.players.push({ ...fromProfile(prof), _peer: peerId, _key: msg.key, relay, seat: freeSeat() }); sysChat(`${prof.displayName} entrou na sala${relay ? ' (via servidor de reserva)' : ''}.`); }
      Net.bindPeer(peerId, prof.username);
      Net.toPeer(peerId, { t: 'welcome', id: prof.username, v: APP_VERSION });
      Store.mergeLeaderboard([prof]);
      return commit();
    }
    // conexão que o anfitrião deu como perdida (ex.: 20 s sem notícia pela reserva) mas que voltou a falar:
    // pede um novo "olá" para religar o jogador, senão ele vê o jogo e o bot joga por ele para sempre
    const ghost = room.players.find(p => p.id === pid && p.connected === false && !p.bot);
    if (!pid || ghost) return void Net.toPeer(peerId, { t: 'rehello' });
    const me = room.players.find(p => p.id === pid) || room.spectators?.find(p => p.id === pid);
    if (me.spectator && msg.t !== 'chat' && msg.t !== 'sync' && !(room.game === 'patrimonio' && msg.t === 'specAct')) return; // quem assiste só conversa (e pede o estado atual)
    const hostOnly = pid === room.hostId;
    switch (msg.t) {
      case 'sync': if (msg.rev !== room.rev) sendState(peerId); return; // jogador desatualizado: reenvia o estado completo
      case 'chat': {
        const text = String(msg.text || '').slice(0, 300).trim(); if (!text) return;
        room.chat.push({ from: pid, text, t: Date.now() }); if (room.chat.length > 80) room.chat.shift(); return commit();
      }
      case 'ready': if (room.phase === 'lobby') { me.ready = !!msg.v; commit(); } return;
      case 'profile': {
        if (room.phase !== 'lobby') return;
        const p = msg.profile; Object.assign(me, { name: p.displayName, char: p.char, color: p.color || charById(p.char).color, emblem: p.emblem, title: p.title, frame: p.frame, catchphrase: p.catchphrase, stats: p.stats });
        return commit();
      }
      case 'token': if (room.phase === 'lobby') { me.token = MAGNATA_TOKENS.some(k => k.id === msg.v) ? msg.v : 'classic'; commit(); } return;
      case 'hat': if (room.phase === 'lobby') { me.hat = LUDO_HATS.some(h => h.id === msg.v) ? msg.v : 'none'; commit(); } return;
      case 'general': if (room.phase === 'lobby' && room.game === 'war') { me.general = WAR_GENERALS.some(g => g.id === msg.v) ? msg.v : null; commit(); } return;
      case 'seat': {
        if (room.phase !== 'lobby' || (room.game !== 'ludo' && room.game !== 'war' && room.game !== 'arq' && room.game !== 'patrimonio')) return;
        const v = +msg.v;
        if (Number.isInteger(v) && v >= 0 && v < maxPlayers() && !room.players.some(p => p !== me && p.seat === v)) me.seat = v;
        else return reply(peerId, { t: 'error', msg: 'Essa cor já foi escolhida.' });
        return commit();
      }
      case 'pathat': {
        if (room.phase !== 'lobby' || room.game !== 'patrimonio' || !PD.TOKENS.some(k => k.id === msg.v)) return;
        if (room.players.some(p => p !== me && p.pathat === msg.v)) return reply(peerId, { t: 'error', msg: 'Outra pessoa já está com esse chapéu.' });
        me.pathat = msg.v; return commit();
      }
      case 'emote': {
        // reação rápida: vai para todos sem mexer nos timers dos bots; no máximo 6 a cada 3 s por jogador
        const now = Date.now(); me._emo = (me._emo || []).filter(t => now - t < 3000);
        if (room.phase !== 'game' || !LUDO_EMOTES.includes(msg.e) || me._emo.length >= 6) return;
        me._emo.push(now); room.emote = { n: (room.emote?.n || 0) + 1, pid, e: msg.e }; room.rev = (room.rev || 0) + 1;
        Net.broadcast({ t: 'room', room, now: Date.now() }); return emit();
      }
      case 'punch': {
        // soco na mesa (Ludo): ganha 1 a cada peça perdida; só visual, vai para todos como a reação
        const st = room.state, now = Date.now();
        if (room.phase !== 'game' || room.game !== 'ludo' || !st || st.result || !(st.punches?.[pid] > 0) || now - (me._punch || 0) < 1200) return;
        // soco carregado: segurar o botão gasta até 3 de uma vez (mais forte)
        const pw = Math.max(1, Math.min(3, st.punches[pid], msg.n | 0 || 1));
        me._punch = now; st.punches[pid] -= pw; room.punch = { n: (room.punch?.n || 0) + 1, pid, p: pw }; room.rev = (room.rev || 0) + 1;
        Net.broadcast({ t: 'room', room, now: Date.now() }); return emit();
      }
      case 'specAct': { // Patrimônio: o peão de quem assiste pula, gira ou comemora; só visual
        const now = Date.now();
        if (room.game !== 'patrimonio' || room.phase !== 'game' || !me.spectator || !['pular', 'girar', 'festa'].includes(msg.k) || now - (me.actAt || 0) < 900) return;
        me.actAt = now; room.specFx = { n: (room.specFx?.n || 0) + 1, pid, k: msg.k }; room.rev = (room.rev || 0) + 1;
        Net.broadcastWith(id => ({ t: 'room', room: roomFor(id), now }));
        return emit();
      }
      case 'flip': {
        // virar a mesa (Magnata e Conjura): só visual; depois de virada, a mesa leva um tempo para se recuperar
        const st = room.state, now = Date.now();
        if (room.phase !== 'game' || !['magnata', 'conjura', 'patrimonio'].includes(room.game) || !st || st.result) return;
        if (!st.players.some(p => p.id === pid)) return; // só quem está jogando
        const left = (room.flip?.at || 0) + TABLE_FLIP.cooldown - now;
        if (left > 0) return reply(peerId, { t: 'error', msg: `A mesa ainda está se recuperando: espere ${Math.ceil(left / 1000)} s.` });
        room.flip = { n: (room.flip?.n || 0) + 1, pid, at: now }; room.rev = (room.rev || 0) + 1;
        // vai para todos sem mexer nos timers dos bots (no Conjura, cada um recebe só a sua visão)
        if (engine().viewFor) Net.broadcastWith(id => ({ t: 'room', room: roomFor(id), now }));
        else Net.broadcast({ t: 'room', room, now });
        return emit();
      }
      case 'settings': {
        if (!hostOnly || room.phase !== 'lobby') return;
        const s = msg.settings || {};
        // Ludo: 4 (cruz) ou 6 (hexágono) lugares; não dá para diminuir com mais gente na sala que lugares
        if ('seats' in s) {
          if (room.game !== 'ludo' || ![4, 6].includes(s.seats)) return;
          if (s.seats < room.players.length) return reply(peerId, { t: 'error', msg: `Tem ${room.players.length} jogadores na sala — remova alguém para jogar com ${s.seats}.` });
        }
        if ('d9' in s && !s.d9 && room.game === 'domino2' && room.players.length > 4) return reply(peerId, { t: 'error', msg: `Tem ${room.players.length} jogadores na sala: o dominó de 6 vai até 4. Remova alguém antes.` });
        Object.assign(room.settings, s);
        if ('d9' in s) promote(); // abriu lugar: quem estava na fila entra
        if ('seats' in s) { room.players.forEach(p => { if (p.seat >= s.seats) delete p.seat; }); room.players.forEach(p => { if (p.seat == null) p.seat = freeSeat(); }); promote(); }
        return commit();
      }
      case 'addBot': {
        if (!hostOnly || room.phase !== 'lobby' || room.players.length >= maxPlayers()) return;
        const used = new Set(room.players.map(p => p.char));
        const c = CHARACTERS.find(c => !used.has(c.id)) || CHARACTERS[Math.floor(Math.random() * 8)];
        const n = room.players.filter(p => p.bot).length + 1;
        room.players.push({ id: 'bot-' + Math.random().toString(36).slice(2, 7), name: `${c.name.split(' ')[0]} (bot)`, char: c.id, color: c.color, emblem: '🤖', title: 'Robô Investidor', frame: 'silver', catchphrase: 'Bip bop, falência pra vocês.', stats: { wins: 0, games: 0, best: 0 }, ready: true, bot: true, connected: true, hat: LUDO_HATS[1 + Math.floor(Math.random() * (LUDO_HATS.length - 1))].id, seat: freeSeat(), token: MAGNATA_TOKENS[Math.floor(Math.random() * MAGNATA_TOKENS.length)].id, general: room.game === 'war' ? (WAR_GENERALS.find(g => !room.players.some(p => p.general === g.id)) || WAR_GENERALS[0]).id : undefined });
        return commit();
      }
      case 'kick': {
        if (!hostOnly || msg.id === room.hostId || room.phase !== 'lobby') return;
        const k = room.players.find(p => p.id === msg.id); if (!k) return;
        if (!k.bot) Net.kick(k.id);
        room.players = room.players.filter(p => p.id !== msg.id); sysChat(`${k.name} foi removido.`); promote(); return commit();
      }
      case 'start': {
        if (!hostOnly || room.phase !== 'lobby') return;
        if (room.players.length < 2) return reply(peerId, { t: 'error', msg: 'Precisa de pelo menos 2 jogadores (adicione um bot!).' });
        if (room.players.some(p => !p.ready)) return reply(peerId, { t: 'error', msg: 'Nem todos estão prontos.' });
        room.state = engine().newGame(room); room.phase = 'game';
        sysChat(`A partida de ${GAME_LIBRARY.find(g => g.id === room.game)?.name} começou!`); return commit();
      }
      case 'act': {
        if (room.phase !== 'game' || !room.state) return;
        const err = engine().act(room.state, pid, msg.a);
        if (err) { reply(peerId, { t: 'error', msg: err }); return sendState(peerId); }
        return commit();
      }
      case 'lobby': {
        if (!hostOnly) return;
        if (room.state?.result?.winner) room.lastWinner = room.state.result.winner; // quem venceu começa a próxima
        if (room.game === 'domino2' && room.settings.rodizio !== false && room.state?.result && room.spectators?.length) rotate(room.state);
        room.phase = 'lobby'; room.state = null;
        room.players = room.players.filter(p => p.connected || p.bot);
        room.players.forEach(p => p.ready = p.bot || p.id === room.hostId);
        if (room.game === 'ludo' || room.game === 'war' || room.game === 'arq' || room.game === 'patrimonio') room.players.forEach(p => { if (p.seat == null || room.players.some(q => q !== p && q.seat === p.seat)) { delete p.seat; p.seat = freeSeat(); } });
        promote();
        sysChat('De volta à sala.'); return commit();
      }
    }
  }

  function scheduleBots() {
    clearTimeout(botTimer); clearTimeout(auctionTimer); clearTimeout(turnTimer);
    if (!isHost || room?.phase !== 'game' || !room.state || room.state.result) return;
    const st = room.state;
    // tempo da vez (Ludo): acabou o prazo, o anfitrião joga no lugar (rola ou move a melhor peça)
    if (st.deadline && !engine().timeout) {
      const dl = st.deadline;
      turnTimer = setTimeout(() => {
        if (room?.state !== st || st.deadline !== dl || st.result) return;
        const id = st.players[st.turn].id, a = engine().botAction(st, id);
        if (a && engine().act(st, id, { ...a, auto: true }) === null) commit();
      }, Math.max(0, dl - Date.now()));
    }
    // espera a animação da última ação terminar nas telas antes de um bot agir
    if (st.fx && st.fx.id !== lastFxId) { lastFxId = st.fx.id; fxEnd = Date.now() + FX.duration(st.fx.events); }
    if (st.auction && room.game !== 'patrimonio') { // o Patrimônio tem o relógio próprio, em nextDeadline
      const auId = st.auction.id;
      auctionTimer = setTimeout(() => { if (room?.state?.auction?.id === auId && Magnata.auctionTimeout(room.state)) commit(); else scheduleBots(); }, Math.max(100, st.auction.deadline - Date.now()));
    }
    clearTimeout(deadlineTimer);
    // prazo: a vez do jogador ou, se o jogo tiver, uma janela mais curta (janelas de resposta com prazo próprio)
    const nd = s2 => (engine().nextDeadline ? engine().nextDeadline(s2) : s2.deadline);
    if (engine().timeout && nd(st)) {
      const dl = nd(st);
      deadlineTimer = setTimeout(() => { if (room?.state && nd(room.state) === dl && engine().timeout(room.state)) commit(); }, Math.max(100, dl - Date.now()));
    }
    const auto = id => { const p = room.players.find(x => x.id === id); return p && (p.bot || (!p.connected && !(room.graceUntil > Date.now()))); };
    const order = [st.players[st.turn].id, ...st.players.map(p => p.id)];
    for (const id of order) {
      if (!auto(id)) continue;
      // humano ausente/desconectado joga no modo seguro (se o jogo tiver); bots jogam como bots
      const isBot = room.players.find(x => x.id === id)?.bot;
      const a = !isBot && engine().afkAction ? engine().afkAction(st, id) : engine().botAction(st, id);
      if (a) {
        botTimer = setTimeout(() => {
          if (engine().act(room.state, id, a) === null) commit(); else { if (a.type !== 'end') { engine().act(room.state, id, { type: 'end' }); } commit(); }
        }, Math.max(0, fxEnd - Date.now()) + (engine().botDelay?.(a, st) ?? (a.type === 'roll' ? 900 : a.type === 'bid' || a.type === 'pass' ? 1200 : 700)));
        return;
      }
    }
  }

  // ----- cliente -----
  function join(code, me, onJoined, onError, onLost, opts = {}) {
    isHost = false; myId = me.username;
    Net.on('error', onError);
    let joined = false, lastHello = 0;
    // chave desta sessão (permite retomar o lugar): a mesma para esta aba e esta sala, inclusive depois de F5 ou reconexão
    let key; const kk = 'mesaviva.key.' + code.toUpperCase();
    try { key = sessionStorage.getItem(kk); } catch { }
    if (!key) { key = Math.random().toString(36).slice(2) + Date.now().toString(36); try { sessionStorage.setItem(kk, key); } catch { } }
    const hello = () => { lastHello = Date.now(); Net.toHost({ t: 'hello', profile: Store.publicProfile(me), key, v: APP_VERSION }); };
    Net.join(code, hello, msg => {
      if (msg.t === 'rehello') { if (Date.now() - lastHello > 2000) hello(); return; }
      if (msg.t === 'welcome') {
        if (!joined) { joined = true; onJoined(); }
        if (msg.v !== APP_VERSION) UI.toast('Você e o anfitrião estão com versões diferentes do jogo. Peçam para os dois recarregarem a página (Ctrl+F5).', 'err');
      }
      else if (msg.t === 'room') {
        // estados podem chegar fora de ordem pelos caminhos de reserva: nunca volta para um estado mais velho
        if (room && msg.room?.rev && room.rev && msg.room.rev < room.rev) return;
        room = msg.room; if (msg.now) skew = msg.now - Date.now(); Store.mergeLeaderboard(room.players.filter(p => !p.bot).map(p => ({ username: p.id, displayName: p.name, ...p }))); emit();
        // o anfitrião só manda a sala para quem ele aceitou: se o "bem-vindo" se perdeu no caminho, isto já basta
        if (!joined) { joined = true; onJoined(); }
      }
      else if (msg.t === 'error') { if (msg.fatal) { onError(msg.msg); leave(); } else { UI.toast(msg.msg, 'err'); Net.toHost({ t: 'sync', rev: room?.rev || 0 }); } }
      else if (msg.t === 'kicked') { onLost('Você foi removido da sala.'); room = null; }
    }, () => { if (!leaving && (room || joined)) onLost('Conexão com o anfitrião perdida.'); room = null; }, opts);
    leaving = false;
    // confere a cada 3s se está com o estado mais recente (recupera atualizações perdidas no caminho)
    clearInterval(syncTimer);
    syncTimer = setInterval(() => { if (joined && !isHost) Net.toHost({ t: 'sync', rev: room?.rev || 0 }); }, 3000);
  }

  function send(msg) { if (isHost) handle(null, msg); else Net.toHost(msg); }
  function leave() { leaving = true; clearInterval(syncTimer); clearTimeout(botTimer); clearTimeout(auctionTimer); clearTimeout(turnTimer); Net.destroy(); room = null; isHost = false; }

  return { create, resume, savedGame, dropSave, join, send, leave, onChange, get room() { return room; }, get isHost() { return isHost; }, get myId() { return myId; }, nameOf, now: () => Date.now() + (isHost ? 0 : skew) };
})();
