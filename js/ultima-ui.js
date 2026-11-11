// Última!: o jogo roda numa moldura própria (3D, sons e teclado não encostam nos outros jogos).
// Aqui só a ponte com a sala e as opções do lobby.
const UltUI = (() => {
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = s => document.querySelector(s);
  let frame = null, ready = false, recorded = null;
  const abs = u => new URL(u, location.href).href;
  // no arquivo único (dist) não há pasta ao lado: o jogo vem do site
  const src = () => `${document.querySelector('script[src*="js/room.js"]') ? '' : 'https://guicalheira.github.io/mesa-viva/'}prototipos/ultima/index.html?v=${APP_VERSION}`;

  function post(room) {
    if (!ready || !room?.state) return;
    frame.contentWindow.postMessage({
      t: 'room', me: Room.myId, host: Room.isHost, skew: Room.now() - Date.now(),
      state: Ultima.viewFor(room.state, Room.myId),
      faces: Object.fromEntries(room.players.map(p => [p.id, abs(charById(p.char).img)])),
      chat: room.chat.slice(-60).map(c => ({ who: c.from ? Room.nameOf(c.from) : null, color: room.players.find(p => p.id === c.from)?.color, text: c.text })),
    }, '*');
  }
  function render(room) {
    UI.show('scr-game');
    if (!frame) { frame = document.createElement('iframe'); frame.id = 'ult-frame'; frame.title = 'Última!'; frame.allow = 'autoplay'; frame.src = src(); $('#scr-game').append(frame); }
    const st = room.state;
    if (st?.result && recorded !== st.gameId) { recorded = st.gameId; UI.recordResult(st, room); }
    post(room);
  }
  function reset() { frame?.remove(); frame = null; ready = false; }

  addEventListener('message', e => {
    if (!frame || e.source !== frame.contentWindow) return;
    const m = e.data || {};
    if (m.t === 'ready') { ready = true; frame.focus(); post(Room.room); }
    else if (m.t === 'act') Room.send({ t: 'act', a: m.a });
    else if (m.t === 'chat') Room.send({ t: 'chat', text: m.text });
    else if (m.t === 'lobby' && Room.isHost) Room.send({ t: 'lobby' });
    else if (m.t === 'leave' && UI.confirmLeave()) UI.leaveToHub();
  });

  // ---------- lobby ----------
  function lobbyRules(room, host) {
    const rules = { ...Ultima.RULES, ...room.settings.ulRules }, off = host ? '' : 'disabled';
    return `<label>Tempo por vez<select id="ul-turn" ${off}>${[[15, '15 segundos'], [20, '20 segundos'], [30, '30 segundos (padrão)'], [45, '45 segundos'], [0, 'Sem limite']].map(([v, l]) => `<option value="${v}" ${(room.settings.ulTurn ?? 30) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      ${Ultima.RULE_LIST.map(([k, t, d]) => `<label class="chk" title="${esc(d)}"><input type="checkbox" data-ulrule="${k}" ${rules[k] ? 'checked' : ''} ${off}> ${esc(t)}</label>`).join('')}`;
  }
  function bindLobby(room, root) {
    $('#ul-turn').onchange = e => Room.send({ t: 'settings', settings: { ulTurn: +e.target.value } });
    root.querySelectorAll('[data-ulrule]').forEach(c => { c.onchange = () => Room.send({ t: 'settings', settings: { ulRules: { ...room.settings.ulRules, [c.dataset.ulrule]: c.checked } } }); });
  }
  return { render, reset, lobbyRules, bindLobby };
})();
