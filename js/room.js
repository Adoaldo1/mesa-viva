// ===== Sala (lobby) — lógica do anfitrião e do cliente =====
const Room = (() => {
  let room = null, isHost = false, myId = null, botTimer = null, auctionTimer = null, turnTimer = null, listeners = [], leaving = false, skew = 0, lastFxId = 0, fxEnd = 0;
  const onChange = f => listeners.push(f);
  const emit = () => listeners.forEach(f => f(room));

  const fromProfile = p => ({
    id: p.username, name: p.displayName || p.username, char: p.char, color: p.color || charById(p.char).color,
    emblem: p.emblem, title: p.title, frame: p.frame, catchphrase: p.catchphrase, stats: p.stats,
    ready: false, bot: false, connected: true,
  });
  const nameOf = id => room?.players.find(p => p.id === id)?.name || id;
  Magnata.setNameResolver(nameOf); Ludo.setNameResolver(nameOf);
  const engine = () => room.game === 'ludo' ? Ludo : Magnata;
  const maxPlayers = () => room.game === 'ludo' ? 4 : 8;

  // ----- anfitrião -----
  function create(me, game, onReady, onError) {
    isHost = true; myId = me.username;
    Net.on('error', onError);
    Net.host(code => {
      room = { code, hostId: myId, game, settings: { startMoney: ECON.START, maxRounds: 0 }, players: [{ ...fromProfile(me), ready: true }], chat: [], phase: 'lobby', state: null };
      sysChat(`Sala ${code} criada. Compartilhe o código com seus amigos!`);
      onReady(code); commit();
    }, (peerId, msg) => handle(peerId, msg), pid => {
      const p = room?.players.find(x => x.id === pid);
      if (!p) return;
      if (room.phase === 'lobby') room.players = room.players.filter(x => x.id !== pid);
      else p.connected = false;
      sysChat(`${p.name} saiu da sala.`); commit();
    });
  }

  function sysChat(text) { room.chat.push({ from: null, text, t: Date.now() }); if (room.chat.length > 80) room.chat.shift(); }

  function commit() {
    Net.broadcast({ t: 'room', room, now: Date.now() });
    emit();
    scheduleBots();
  }

  function reply(peerId, msg) { if (peerId === null) UI.toast(msg.msg, 'err'); else Net.toPeer(peerId, msg); }

  // peerId === null => mensagem do próprio anfitrião
  function handle(peerId, msg) {
    if (!room) return;
    const pid = peerId === null ? myId : room.players.find(p => p._peer === peerId)?.id;
    if (msg.t === 'hello') {
      const prof = msg.profile; if (!prof?.username) return;
      const existing = room.players.find(p => p.id === prof.username);
      if (existing && existing.connected && !existing.bot) return Net.toPeer(peerId, { t: 'error', msg: 'Já existe um jogador com esse usuário na sala.', fatal: true });
      if (!existing && room.phase !== 'lobby') return Net.toPeer(peerId, { t: 'error', msg: 'A partida já começou.', fatal: true });
      if (!existing && room.players.length >= maxPlayers()) return Net.toPeer(peerId, { t: 'error', msg: `Sala cheia (máx. ${maxPlayers()}).`, fatal: true });
      if (existing) { Object.assign(existing, { connected: true, _peer: peerId }); sysChat(`${existing.name} reconectou.`); }
      else { room.players.push({ ...fromProfile(prof), _peer: peerId }); sysChat(`${prof.displayName} entrou na sala.`); }
      Net.bindPeer(peerId, prof.username);
      Net.toPeer(peerId, { t: 'welcome', id: prof.username });
      Store.mergeLeaderboard([prof]);
      return commit();
    }
    if (!pid) return;
    const me = room.players.find(p => p.id === pid);
    const hostOnly = pid === room.hostId;
    switch (msg.t) {
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
      case 'hat': if (room.phase === 'lobby') { me.hat = LUDO_HATS.some(h => h.id === msg.v) ? msg.v : 'none'; commit(); } return;
      case 'dice': if (room.phase === 'lobby') { me.dice = LUDO_DICE.some(d => d.id === msg.v) ? msg.v : 'white'; commit(); } return;
      case 'emote': {
        // reação rápida: vai para todos sem mexer nos timers dos bots; no máximo 1 a cada 1,2 s por jogador
        if (room.phase !== 'game' || !LUDO_EMOTES.includes(msg.e) || Date.now() - (me._emoAt || 0) < 1200) return;
        me._emoAt = Date.now(); room.emote = { n: (room.emote?.n || 0) + 1, pid, e: msg.e };
        Net.broadcast({ t: 'room', room, now: Date.now() }); return emit();
      }
      case 'settings': if (hostOnly && room.phase === 'lobby') { Object.assign(room.settings, msg.settings); commit(); } return;
      case 'addBot': {
        if (!hostOnly || room.phase !== 'lobby' || room.players.length >= maxPlayers()) return;
        const used = new Set(room.players.map(p => p.char));
        const c = CHARACTERS.find(c => !used.has(c.id)) || CHARACTERS[Math.floor(Math.random() * 8)];
        const n = room.players.filter(p => p.bot).length + 1;
        room.players.push({ id: 'bot-' + Math.random().toString(36).slice(2, 7), name: `${c.name.split(' ')[0]} (bot)`, char: c.id, color: c.color, emblem: '🤖', title: 'Robô Investidor', frame: 'silver', catchphrase: 'Bip bop, falência pra vocês.', stats: { wins: 0, games: 0, best: 0 }, ready: true, bot: true, connected: true, hat: LUDO_HATS[1 + Math.floor(Math.random() * (LUDO_HATS.length - 1))].id, dice: LUDO_DICE[Math.floor(Math.random() * LUDO_DICE.length)].id });
        return commit();
      }
      case 'kick': {
        if (!hostOnly || msg.id === room.hostId || room.phase !== 'lobby') return;
        const k = room.players.find(p => p.id === msg.id); if (!k) return;
        if (!k.bot) Net.kick(k.id);
        room.players = room.players.filter(p => p.id !== msg.id); sysChat(`${k.name} foi removido.`); return commit();
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
        if (err) return reply(peerId, { t: 'error', msg: err });
        return commit();
      }
      case 'lobby': {
        if (!hostOnly) return;
        room.phase = 'lobby'; room.state = null;
        room.players = room.players.filter(p => p.connected || p.bot);
        room.players.forEach(p => p.ready = p.bot || p.id === room.hostId);
        sysChat('De volta à sala.'); return commit();
      }
    }
  }

  function scheduleBots() {
    clearTimeout(botTimer); clearTimeout(auctionTimer); clearTimeout(turnTimer);
    if (!isHost || room?.phase !== 'game' || !room.state || room.state.result) return;
    const st = room.state;
    // tempo da vez (Ludo): acabou o prazo, o anfitrião joga no lugar (rola ou move a melhor peça)
    if (st.deadline) {
      const dl = st.deadline;
      turnTimer = setTimeout(() => {
        if (room?.state !== st || st.deadline !== dl || st.result) return;
        const id = st.players[st.turn].id, a = engine().botAction(st, id);
        if (a && engine().act(st, id, { ...a, auto: true }) === null) commit();
      }, Math.max(0, dl - Date.now()));
    }
    // espera a animação da última ação terminar nas telas antes de um bot agir
    if (st.fx && st.fx.id !== lastFxId) { lastFxId = st.fx.id; fxEnd = Date.now() + FX.duration(st.fx.events); }
    if (st.auction) {
      const auId = st.auction.id;
      auctionTimer = setTimeout(() => { if (room?.state?.auction?.id === auId && Magnata.auctionTimeout(room.state)) commit(); else scheduleBots(); }, Math.max(100, st.auction.deadline - Date.now()));
    }
    const auto = id => { const p = room.players.find(x => x.id === id); return p && (p.bot || !p.connected); };
    const order = [st.players[st.turn].id, ...st.players.map(p => p.id)];
    for (const id of order) {
      if (!auto(id)) continue;
      const a = engine().botAction(st, id);
      if (a) {
        botTimer = setTimeout(() => {
          if (engine().act(room.state, id, a) === null) commit(); else { if (a.type !== 'end') { engine().act(room.state, id, { type: 'end' }); } commit(); }
        }, Math.max(0, fxEnd - Date.now()) + (engine().botDelay?.(a, st) ?? (a.type === 'roll' ? 900 : a.type === 'bid' || a.type === 'pass' ? 1200 : 700)));
        return;
      }
    }
  }

  // ----- cliente -----
  function join(code, me, onJoined, onError, onLost) {
    isHost = false; myId = me.username;
    Net.on('error', onError);
    let joined = false;
    Net.join(code, () => Net.toHost({ t: 'hello', profile: Store.publicProfile(me) }), msg => {
      if (msg.t === 'welcome') { joined = true; onJoined(); }
      else if (msg.t === 'room') { room = msg.room; if (msg.now) skew = msg.now - Date.now(); Store.mergeLeaderboard(room.players.filter(p => !p.bot).map(p => ({ username: p.id, displayName: p.name, ...p }))); emit(); }
      else if (msg.t === 'error') { if (msg.fatal) { onError(msg.msg); leave(); } else UI.toast(msg.msg, 'err'); }
      else if (msg.t === 'kicked') { onLost('Você foi removido da sala.'); room = null; }
    }, () => { if (!leaving && (room || joined)) onLost('Conexão com o anfitrião perdida.'); room = null; });
    leaving = false;
  }

  function send(msg) { if (isHost) handle(null, msg); else Net.toHost(msg); }
  function leave() { leaving = true; clearTimeout(botTimer); clearTimeout(auctionTimer); clearTimeout(turnTimer); Net.destroy(); room = null; isHost = false; }

  return { create, join, send, leave, onChange, get room() { return room; }, get isHost() { return isHost; }, get myId() { return myId; }, nameOf, now: () => Date.now() + (isHost ? 0 : skew) };
})();
