// Patrimônio: o jogo roda numa moldura própria (CSS, teclado e 3D não encostam nos outros jogos).
// Aqui só a ponte com a sala e o que ele acrescenta ao lobby.
const PatUI = (() => {
  // endereços por extenso: é assim que o gerador do arquivo único acha as imagens
  const HAT_IMG = { peao: 'assets/pat_hat_peao.webp', palha: 'assets/pat_hat_palha.webp', bone: 'assets/pat_hat_bone.webp', cangaco: 'assets/pat_hat_cangaco.webp', cartola: 'assets/pat_hat_cartola.webp', sertanejo: 'assets/pat_hat_sertanejo.webp', coroa: 'assets/pat_hat_coroa.webp', obra: 'assets/pat_hat_obra.webp', chef: 'assets/pat_hat_chef.webp', boina: 'assets/pat_hat_boina.webp', festa: 'assets/pat_hat_festa.webp', quepe: 'assets/pat_hat_quepe.webp' };
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let frame = null, ready = false, recorded = null;
  const abs = u => new URL(u, location.href).href;
  // no arquivo único (dist) não há pasta ao lado: o jogo vem do site
  const src = () => `${document.querySelector('script[src*="js/room.js"]') ? '' : 'https://guicalheira.github.io/mesa-viva/'}prototipos/patrimonio/index.html?v=${APP_VERSION}`;

  function post(room) {
    if (!ready || !room?.state) return;
    frame.contentWindow.postMessage({
      t: 'room', me: Room.myId, host: Room.isHost, skew: Room.now() - Date.now(), flip: room.flip || null, cooldown: TABLE_FLIP.cooldown,
      state: Patrimonio.viewFor(room.state, Room.myId),
      faces: Object.fromEntries(room.players.map(p => [p.id, abs(charById(p.char).img)])),
      specs: (room.spectators || []).map(s => ({ id: s.id, name: s.name, color: /^#[0-9a-f]{6}$/i.test(s.color) ? s.color : '#7c8a99', face: abs(charById(s.char).img) })), specFx: room.specFx || null,
      chat: room.chat.slice(-60).map(c => ({ who: c.from ? Room.nameOf(c.from) : null, color: room.players.find(p => p.id === c.from)?.color, text: c.text })),
    }, '*');
  }
  function render(room) {
    UI.show('scr-game');
    if (!frame) { frame = document.createElement('iframe'); frame.id = 'pat-frame'; frame.title = 'Patrimônio'; frame.allow = 'autoplay'; frame.src = src(); $('#scr-game').append(frame); }
    const st = room.state;
    if (st?.result && recorded !== st.gameId) { recorded = st.gameId; UI.recordResult(st, room); }
    post(room);
  }
  function reset() { frame?.remove(); frame = null; ready = false; }
  const $ = s => document.querySelector(s);

  addEventListener('message', e => {
    if (!frame || e.source !== frame.contentWindow) return;
    const m = e.data || {};
    if (m.t === 'ready') { ready = true; frame.focus(); post(Room.room); }
    else if (m.t === 'act') Room.send({ t: 'act', a: m.a });
    else if (m.t === 'chat') Room.send({ t: 'chat', text: m.text });
    else if (m.t === 'flip') Room.send({ t: 'flip' });
    else if (m.t === 'specAct') Room.send({ t: 'specAct', k: m.k });
    else if (m.t === 'lobby' && Room.isHost) Room.send({ t: 'lobby' });
    else if (m.t === 'leave' && UI.confirmLeave()) UI.leaveToHub();
  });

  // ---------- lobby ----------
  // a sala é redesenhada a cada mudança: o menu de regras lembra se estava aberto
  let rulesOpen = false;
  document.addEventListener('toggle', e => { if (e.target.id === 'pat-rules') rulesOpen = e.target.open; }, true);
  const lobbyPicks = (room, mine) => !mine ? '' : `
    <h3>Seu chapéu</h3>
    <div class="hats">${PD.TOKENS.map(k => { const by = room.players.find(p => p.pathat === k.id); return `<button class="charpick hatpick ${mine.pathat === k.id ? 'on' : ''}" data-pathat="${k.id}" ${by && by !== mine ? 'disabled' : ''} title="${esc(k.name)}${by && by !== mine ? ' (já escolhido)' : ''}"><img src="${HAT_IMG[k.id]}" alt="" style="width:46px;object-fit:contain"><small>${esc(k.name)}</small></button>`; }).join('')}</div>`;
  function lobbyRules(room, host) {
    const rules = { ...Engine.RULES, ...room.settings.patRules }, off = host ? '' : 'disabled';
    return `<label>Limite de voltas<select id="pat-limit" ${off}>${[[0, 'Sem limite'], [20, '20 voltas (rápida)'], [30, '30 voltas'], [40, '40 voltas (longa)']].map(([v, l]) => `<option value="${v}" ${(rules.limit || 0) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label>Tempo por vez<select id="set-turn" ${off}>${[[60, '1 minuto'], [90, '1 min 30 s (padrão)'], [120, '2 minutos'], [180, '3 minutos'], [0, 'Sem limite']].map(([v, l]) => `<option value="${v}" ${(room.settings.turnSec ?? 90) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <div class="pat-rules-t">Regras da casa</div>
      <details id="pat-rules" class="pat-rules-box" ${rulesOpen ? 'open' : ''}><summary>${Patrimonio.RULE_LIST.filter(([k]) => rules[k]).length} de ${Patrimonio.RULE_LIST.length} ligadas</summary>
      <div class="pat-rules">${Patrimonio.RULE_LIST.map(([k, t, d]) => `<label class="chk" title="${esc(d)}"><input type="checkbox" data-patrule="${k}" ${rules[k] ? 'checked' : ''} ${off}> ${esc(t)}</label>`).join('')}</div></details>`;
  }
  function bindLobby(room, root) {
    const set = o => Room.send({ t: 'settings', settings: { patRules: { ...room.settings.patRules, ...o } } });
    $('#pat-limit').onchange = e => set({ limit: +e.target.value });
    $('#set-turn').onchange = e => Room.send({ t: 'settings', settings: { turnSec: +e.target.value } });
    root.querySelectorAll('[data-patrule]').forEach(c => { c.onchange = () => set({ [c.dataset.patrule]: c.checked }); });
  }
  return { render, reset, lobbyPicks, lobbyRules, bindLobby };
})();
