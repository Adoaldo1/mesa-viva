// ===== Supremacia — HUD sobre a mesa 3D, cartas, objetivo e regras =====
const WarUI = (() => {
  let occKey = '', built = null, seenEv = 0, sel = null, target = null, amount = 1, dice = 3, moveN = 1, cardSel = [], drawer = false, logTab = 'log', chatSeen = 0, resultShown = null, timerIv = null, lastTurnKey = '', has3d = false;
  const view = room => (Room.isHost ? War.viewFor(room.state, Room.myId) : room.state);
  let pendingAction = null, pendingTimer = null, presentedState = null, refreshCards = null;
  const blocked = () => !!pendingAction || War3D.busy;
  const stateKey = room => { const s = room.state; return [s.gameId, s.turn, s.round, s.phase, s.ev.n].join(':'); };
  function sendAction(a) {
    if (blocked()) return;
    const room = Room.room;
    pendingAction = stateKey(room);
    clearTimeout(pendingTimer);
    pendingTimer = setTimeout(() => {
      pendingAction = null;
      if (Room.room?.game === 'war' && Room.room.phase === 'game') render(Room.room);
    }, 8000);
    Room.send({ t: 'act', a });
    if (pendingAction) render(Room.room);
  }
  function confirmAction(a, title, detail) {
    if (blocked()) return;
    const key = stateKey(Room.room);
    const m = UI.modal(`<div class="war-confirm"><span class="war-eyebrow">CONFIRMAR ORDEM</span><h2 id="war-confirm-title">${esc(title)}</h2>
      <p id="war-confirm-detail">${esc(detail)}</p><div class="war-confirm-actions"><button class="btn" id="war-confirm-no">Não, voltar</button><button class="btn primary" id="war-confirm-yes">Sim, confirmar</button></div></div>`);
    m.setAttribute('role', 'alertdialog'); m.setAttribute('aria-modal', 'true');
    m.setAttribute('aria-labelledby', 'war-confirm-title'); m.setAttribute('aria-describedby', 'war-confirm-detail');
    const cancel = () => UI.closeModal();
    $('#war-confirm-no', m).onclick = cancel;
    $('#war-confirm-yes', m).onclick = () => {
      UI.closeModal();
      if (!Room.room?.state || key !== stateKey(Room.room) || blocked()) return UI.toast('A partida avançou. Confira o mapa e escolha sua ação novamente.');
      sendAction(a);
    };
    m.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); cancel(); } });
    $('#war-confirm-no', m).focus();
  }
  const ICONS = {
    target: '<path fill-rule="evenodd" d="M11 3a9 9 0 1 0 9 9h-3a6 6 0 1 1-6-6V3Zm0 6a3 3 0 1 0 3 3h-2l-1-1V9Z"/><path d="m21 1-5 1v3l-6 6 3 3 6-6h3l1-5-2 1V1Z"/>',
    cards: '<path d="M3 6h2v13h12v2H5a2 2 0 0 1-2-2V6Z"/><path fill-rule="evenodd" d="M9 2h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm5 4-3 4 3 4 3-4-3-4Z"/>',
    map: '<path d="m2 5 6-3v16l-6 3V5Zm8-3 5 3v16l-5-3V2Zm7 3 5-3v16l-5 3V5Z"/>',
    rules: '<path d="M2 3c4-1 7 0 9 2v16c-2-2-5-3-9-2V3Zm11 2c2-2 5-3 9-2v16c-4-1-7 0-9 2V5Z"/>',
    sound: '<path d="M2 8h4l7-5v18l-7-5H2V8Zm14-3a9 9 0 0 1 0 14v-3a6 6 0 0 0 0-8V5Zm0 5a3 3 0 0 1 0 4v-4Z"/>',
    muted: '<path d="M2 8h4l7-5v18l-7-5H2V8Zm15-1 3 3 3-3 2 2-3 3 3 3-2 2-3-3-3 3-2-2 3-3-3-3 2-2Z"/>',
    chat: '<path fill-rule="evenodd" d="M5 3h14a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H9l-6 4V6a3 3 0 0 1 2-3Zm2 5v2h11V8H7Zm0 5v2h8v-2H7Z"/>',
    leave: '<path d="M3 2h10v5h-3V5H6v14h4v-2h3v5H3V2Zm12 5 7 5-7 5v-3H9v-4h6V7Z"/>',
    troops: '<path d="M5 8a7 7 0 0 1 14 0h2v3H3V8h2Zm2 5h10v1a5 5 0 0 1-10 0v-1Zm-2 6h4l3 3 3-3h4l3 3v2H2v-2l3-3Z"/>',
    attack: '<path d="m2 1 6 2 14 15-4 4L3 8 2 1Zm2 13 3 3-5 5-2-2 4-6ZM22 1l-6 2-5 6 4 4 6-5 1-7Z"/>',
    flag: '<path d="M3 1h3v3c6-4 9 4 16 0v12c-7 4-10-4-16 0v7H3V1Z"/>',
    clock: '<path fill-rule="evenodd" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20ZM11 6h3v5l4 2-1 3-6-3V6Z"/>',
    trophy: '<path d="M7 2h10v3h5v3a6 6 0 0 1-6 6l-2 2v3h4v3H6v-3h4v-3l-2-2a6 6 0 0 1-6-6V5h5V2Zm0 6H5a3 3 0 0 0 2 3V8Zm10 0v3a3 3 0 0 0 2-3h-2Z"/>',
    report: '<path fill-rule="evenodd" d="M4 2h12l5 5v15H4V2Zm10 2v5h5l-5-5ZM7 11v2h10v-2H7Zm0 4v2h10v-2H7Zm0 4v1h6v-1H7Z"/>',
    dice: '<path fill-rule="evenodd" d="M6 2h12a4 4 0 0 1 4 4v12a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V6a4 4 0 0 1 4-4Zm2 4a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm8 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm-4 4a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm-4 4a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm8 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z"/>',
  };
  const icon = name => `<svg class="war-icon war-icon-${name}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${ICONS[name] || ICONS.target}</svg>`;
  const colorOf = (st, pid) => War.COLORS.find(c => c.id === st.players.find(p => p.id === pid)?.color);
  const SHAPE = { circulo: '●', quadrado: '■', triangulo: '▲', curinga: '★' };
  const contName = c => WAR_MAP.continents[c].name;
  const rp = (room, id) => room.players.find(p => p.id === id) || { name: id, char: 'vitoria' };
  const face = (room, id, size = 34) => { const r = rp(room, id), g = generalById(r.general); return g ? `<img class="wgen" src="${g.thumb}" alt="" style="--s:${size}px">` : UI.avatar({ ...r, emblem: '' }, size); };

  function build() {
    const wrapEl = $('#board-wrap');
    let el = $('#war-table'); if (!el) { el = document.createElement('div'); el.id = 'war-table'; wrapEl.appendChild(el); }
    el.innerHTML = `<div class="cah-tbar"><i id="war-timer"></i></div>
      <div class="war-top"><div class="war-seats"></div><div class="war-banner"></div><aside class="war-hand-mini" aria-label="Suas cartas" hidden></aside></div>
      <div class="cah-tools war-tools"></div><div class="cah-drawer war-drawer"></div>
      <div class="war-bar"></div><div class="war-hint"></div><div class="war-tip"></div>`;
    War3D.resetPresentation();
    has3d = War3D.supported() && War3D.mount(el, { click: id => click(id), hover: id => hover(id), event: e => notifyEvent(Room.room, e), settled: () => { if (Room.room?.game === 'war' && Room.room.phase === 'game') render(Room.room); } });
    War3D.show(has3d);
    if (!has3d) el.insertAdjacentHTML('beforeend', '<div class="war-no3d">Este jogo precisa de 3D (WebGL). Ative a aceleração de hardware do navegador.</div>');
    $('#scr-game').classList.add('cah-full');
    setTimeout(() => War3D.overview?.(), 50);
  }

  // ---------- render ----------
  function render(room) {
    if (!room.state) return;
    const st = view(room);
    if (pendingAction && pendingAction !== stateKey(room)) { pendingAction = null; clearTimeout(pendingTimer); }
    UI.show('scr-game'); $('#scr-game').classList.add('cah-full');
    if (built !== st.gameId) { build(); built = st.gameId; seenEv = st.ev.n; sel = target = null; cardSel = []; resultShown = null; lastTurnKey = ''; }
    const me = st.players.find(p => p.id === Room.myId), cur = st.players[st.turn], myTurn = cur.id === Room.myId && !st.result;
    // a cada nova vez/fase, limpa a seleção
    const turnKey = st.turn + ':' + st.round + ':' + st.phase;
    if (turnKey !== lastTurnKey) { lastTurnKey = turnKey; sel = target = null; amount = 1; cardSel = []; if (myTurn && st.phase === 'place') War3D.overview?.(); }
    if (sel && st.owner[sel] !== Room.myId) sel = target = null;
    if (target && !validTarget(st, sel, target)) target = null;
    // Reserva os eventos antes do sync e mantém os números anteriores durante os dados.
    try { playEvents(room, st); } catch (err) { console.warn(err); }
    if (!War3D.busy || presentedState?.gameId !== st.gameId) presentedState = JSON.parse(JSON.stringify(st));
    const hud = presentedState, hudMe = hud.players.find(p => p.id === Room.myId);
    // jogadores no topo
    $('#war-table .war-seats').innerHTML = hud.players.map((p, i) => {
      const c = War.COLORS.find(x => x.id === p.color), n = War.owned(hud, p.id).length, arm = War.owned(hud, p.id).reduce((s, t) => s + hud.armies[t], 0);
      return `<div class="war-seat ${i === hud.turn && !hud.result ? 'cur' : ''} ${p.out ? 'out' : ''} ${p.id === Room.myId ? 'me' : ''}" style="--pc:${c.hex}" title="${esc(rp(room, p.id).name)} · exército ${c.name.toLowerCase()}">
        ${face(room, p.id, 34)}<div><b>${esc(rp(room, p.id).name)}</b><small>${p.out ? `${icon('flag')} eliminado` : `${icon('map')} ${n} <span>·</span> ${icon('troops')} ${arm} <span>·</span> ${icon('cards')} ${p.cardCount ?? p.cards.length}`}</small></div></div>`;
    }).join('');
    banner(room, hud, hudMe, hud.players[hud.turn].id === Room.myId && !hud.result);
    renderHand(hudMe);
    if (has3d) War3D.sync(st, { sel, targets: targetsOf(st, sel), mode: st.phase === 'attack' ? 'attack' : 'move' });
    renderTools(room, hud, hudMe);
    renderBar(room, hud, hudMe, hud.players[hud.turn].id === Room.myId && !hud.result);
    refreshCards?.();
    UI.matchClock($('#board-wrap'), st);
    clearInterval(timerIv); timerIv = setInterval(() => tick(view(Room.room || room)), 250); tick(st);
    if (st.result && resultShown !== st.gameId) { resultShown = st.gameId; UI.recordResult(st, room); waitForResult(room, st); }
  }
  function tick(st) {
    const bar = $('#war-timer'); if (!bar) return;
    bar.parentElement.classList.toggle('off', !st?.deadline || !!st?.result); if (!st?.deadline) return;
    const left = Math.max(0, st.deadline - Room.now()), total = st.turnMs || 90000;
    bar.style.width = Math.min(100, 100 * left / total) + '%'; bar.classList.toggle('low', left < 15000);
    const s = $('#war-secs'); if (s) s.innerHTML = icon('clock') + (st.afk === st.players[st.turn].id ? 'automático' : Math.ceil(left / 1000) + 's');
  }

  function banner(room, st, me, myTurn) {
    const cur = st.players[st.turn], c = War.COLORS.find(x => x.id === cur.color);
    let txt = '';
    if (st.result) txt = `${icon('trophy')} <b>${esc(rp(room, st.result.winner).name)}</b> venceu!`;
    else if (!myTurn) txt = `${face(room, cur.id, 26)}<span>Vez de <b style="color:${c.hex}">${esc(rp(room, cur.id).name)}</b> · ${phaseName(st)}</span>`;
    else if (st.phase === 'place') {
      const cont = Object.entries(st.pool.cont).filter(([, v]) => v).map(([k, v]) => `${v} na ${contName(k)}`).join(', ');
      txt = me.cards.length >= 5 ? `<span>${icon('cards')} Você tem <b>5 cartas</b>: troque 3 ou 5 antes de posicionar.</span>`
        : `<span>${icon('troops')} Posicione <b>${War.poolTotal(st.pool)}</b> exército${War.poolTotal(st.pool) > 1 ? 's' : ''}${cont ? ` <small>(${cont})</small>` : ''}${st.round === 1 ? ' <small>· 1ª rodada: sem ataques</small>' : ''}</span>`;
    } else if (st.occupy) txt = `<span>${icon('flag')} Conquistou <b>${esc(War.terrName[st.occupy.to])}</b>! Quantos exércitos entram?</span>`;
    else if (st.phase === 'attack') txt = `<span>${icon('attack')} <b>Ataque</b>: escolha um território seu com 2+ exércitos e depois um vizinho inimigo.</span>`;
    else txt = `<span>${icon('troops')} <b>Deslocamento</b>: mova exércitos entre territórios vizinhos seus (cada um se move uma vez).</span>`;
    $('#war-table .war-banner').innerHTML = `${txt}${st.deadline && !st.result ? ' <small id="war-secs" class="war-secs"></small>' : ''}`;
  }
  const phaseName = st => st.phase === 'place' ? 'posicionando' : st.phase === 'attack' ? (st.occupy ? 'ocupando' : 'atacando') : st.phase === 'move' ? 'deslocando' : '';

  // ---------- seleção no mapa ----------
  function targetsOf(st, from) {
    if (!from || st.players[st.turn].id !== Room.myId) return [];
    if (st.phase === 'attack' && !st.occupy) return st.armies[from] >= 2 ? WAR_MAP.adj[from].filter(n => st.owner[n] !== Room.myId) : [];
    if (st.phase === 'move' || st.phase === 'attack') return WAR_MAP.adj[from].filter(n => st.owner[n] === Room.myId);
    return [];
  }
  const freeOf = (st, t) => st.armies[t] - 1 - (st.moved?.[t] || 0);
  function validTarget(st, from, to) { return !!from && targetsOf(st, from).includes(to); }
  function click(id) {
    const room = Room.room; if (!room?.state) return;
    const st = view(room), myTurn = st.players[st.turn].id === Room.myId && !st.result;
    if (blocked()) return;
    if (!id) { sel = target = null; return render(room); }
    if (!myTurn) { War3D.focus?.(id, 99); return; }
    if (st.phase === 'place') {
      if (st.owner[id] !== Room.myId) return UI.toast('Posicione exércitos só nos seus territórios.');
      if (st.players[st.turn].cards.length >= 5) return cardsModal(room);
      sel = id; target = null; amount = Math.min(Number(amount) || 1, placeAvailable(st, id));
      SFX.click?.(); return render(room);
    }
    if (st.occupy) return;
    if (st.phase === 'attack') {
      if (st.owner[id] === Room.myId) {
        if (sel && WAR_MAP.adj[sel].includes(id) && sel !== id && freeOf(st, sel) > 0 && st.armies[id] >= 1 && !targetsOf(st, sel).length) { sel = id; target = null; }
        else { sel = sel === id ? null : id; target = null; if (sel && st.armies[sel] < 2) UI.toast('Esse território só tem o exército de ocupação: precisa de 2+ para atacar.'); }
      } else if (sel && validTarget(st, sel, id)) { target = id; dice = Math.min(3, st.armies[sel] - 1); }
      else if (sel) UI.toast(`${War.terrName[id]} não faz fronteira com ${War.terrName[sel]}.`);
      return render(room);
    }
    if (st.phase === 'move') {
      if (st.owner[id] !== Room.myId) return;
      if (sel && validTarget(st, sel, id) && sel !== id) { target = id; moveN = Math.max(1, freeOf(st, sel)); }
      else { sel = sel === id ? null : id; target = null; if (sel && freeOf(st, sel) < 1) UI.toast('Nenhum exército pode sair daqui (um fica de ocupação e quem já se deslocou não se move de novo).'); }
      return render(room);
    }
  }
  function hover(id) {
    const tip = $('#war-table .war-tip'); if (!tip) return;
    const st = Room.room?.state && view(Room.room);
    if (!id || !st) { tip.classList.remove('on'); return; }
    const shown = War3D.dbg().terr[id]?.shown || { owner: st.owner[id], armies: st.armies[id] };
    const c = colorOf(st, shown.owner);
    tip.innerHTML = `<b>${esc(War.terrName[id])}</b> <small>${esc(contName(War.contOf[id]))}</small><br><i style="background:${c?.hex}"></i> ${esc(rp(Room.room, shown.owner).name)} · ${icon('troops')} ${shown.armies}`;
    const p = War3D.screenPos(id); if (p) { tip.style.left = p.x + 'px'; tip.style.top = p.y + 'px'; }
    tip.classList.add('on');
  }

  // ---------- seleção de territórios e ordens compactas ----------
  const placeAvailable = (st, id) => id ? st.pool.free + (st.pool.cont[War.contOf[id]] || 0) : War.poolTotal(st.pool);
  function territorySelect(st, selected, ids, id, label) {
    return `<label class="war-field"><span>${label}</span><select id="${id}"><option value="">Escolha no mapa ou aqui</option>${ids.map(t => `<option value="${t}" ${selected === t ? 'selected' : ''}>${esc(War.terrName[t])} · ${st.armies[t]} soldados</option>`).join('')}</select></label>`;
  }
  function troopSlider(n, max, kind = 'move') {
    const value = max ? Math.min(Math.max(1, n), max) : 1, fill = max > 1 ? (value - 1) / (max - 1) * 100 : 100;
    const label = kind === 'place' ? 'Quantidade de soldados para adicionar' : 'Quantidade de soldados para mover';
    return `<label class="war-field war-movement"><span>Soldados <output id="war-${kind}-count" for="war-${kind}-range">${max ? value : 0} / ${max}</output></span><input id="war-${kind}-range" type="range" min="1" max="${max || 1}" step="1" value="${value}" style="--fill:${fill}%" ${!max ? 'disabled' : ''} aria-label="${label}" aria-valuetext="${max ? value : 0} de ${max} soldados"></label>`;
  }
  function renderBar(room, st, me, myTurn) {
    const B = $('#war-table .war-bar'), H = $('#war-table .war-hint');
    const phase = st.phase === 'place' ? 0 : st.phase === 'attack' ? 1 : 2;
    const steps = ['Adicionar soldados', 'Atacar', 'Mover tropas'];
    let bar = '', hint = '', title = myTurn ? steps[phase] : `Vez de ${rp(room, st.players[st.turn].id).name}`;
    if (myTurn && me) {
      if (st.phase === 'place') {
        const available = placeAvailable(st, sel), n = Math.min(Math.max(1, Number(amount) || 1), available);
        amount = n;
        bar = territorySelect(st, sel, War.owned(st, Room.myId), 'war-source', '1. Território que recebe') + troopSlider(n, available, 'place');
        bar += `<button class="chip" id="war-all" ${available < 1 ? 'disabled' : ''}>Todos (${available})</button><button class="chip go" id="war-place" ${!sel || available < 1 || me.cards.length >= 5 ? 'disabled' : ''}>Adicionar ${n} soldado${n === 1 ? '' : 's'}</button>`;
        if (me.cards.length >= 3) bar += `<button class="chip" data-open="cards">Trocar cartas · +${War.tradeValue(st.trades)}</button>`;
        hint = me.cards.length >= 5 ? 'Troca obrigatória: troque 3 cartas ou 5 do mesmo símbolo antes de adicionar soldados.' : `${War.poolTotal(st.pool)} soldados na reserva. Escolha o território, a quantidade e clique em Adicionar.`;
      } else if (st.occupy) {
        const o = st.occupy, key = o.from + o.to + o.max;
        if (occKey !== key) { occKey = key; moveN = o.max; }
        moveN = Math.min(Math.max(1, moveN), o.max); title = 'Ocupar território conquistado';
        bar = `<span class="war-route"><b>${esc(War.terrName[o.from])}</b><span>→</span><b>${esc(War.terrName[o.to])}</b></span>${troopSlider(moveN, o.max)}<button class="chip go" id="war-occupy">Ocupar com ${moveN}</button>`;
        hint = 'Escolha quantos soldados entram. Um soldado sempre permanece na origem.';
      } else if (st.phase === 'attack') {
        const sources = War.owned(st, Room.myId).filter(t => st.armies[t] >= 2);
        bar = territorySelect(st, sel, sources, 'war-source', '1. De onde atacar');
        bar += territorySelect(st, target, targetsOf(st, sel), 'war-target', '2. Território inimigo');
        const max = sel ? Math.min(3, st.armies[sel] - 1) : 0;
        dice = Math.min(Math.max(1, dice), max || 1);
        bar += `<div class="war-field"><span>3. Dados de ataque</span><div class="war-dice-choice">${[1, 2, 3].map(v => `<button class="chip ${dice === v && max ? 'on' : ''}" data-dice="${v}" aria-label="${v} dado${v === 1 ? '' : 's'}" aria-pressed="${dice === v && !!max}" ${v > max ? 'disabled' : ''}>${v} <small>${icon('dice')}</small></button>`).join('')}</div></div>`;
        bar += `<button class="chip go danger" id="war-attack" ${!sel || !target || max < 1 ? 'disabled' : ''}>Rolar dados e atacar</button><button class="chip" id="war-end-attack">Encerrar ataques →</button>`;
        hint = target ? `${dice} dados de ataque contra ${Math.min(3, st.armies[target])} de defesa. O resultado dos dados aparece antes das perdas no mapa.` : sel ? 'Escolha um vizinho inimigo destacado em vermelho.' : 'Escolha um território seu com 2 ou mais soldados. Os vizinhos válidos serão destacados.';
      } else if (st.phase === 'move') {
        const sources = War.owned(st, Room.myId).filter(t => freeOf(st, t) > 0);
        bar = territorySelect(st, sel, sources, 'war-source', '1. De onde mover');
        bar += territorySelect(st, target, targetsOf(st, sel), 'war-target', '2. Vizinho que recebe');
        const free = sel ? Math.max(0, freeOf(st, sel)) : 0;
        moveN = Math.min(Math.max(1, moveN), free || 1);
        bar += troopSlider(moveN, free) + `<button class="chip go" id="war-move" ${!sel || !target || !free ? 'disabled' : ''}>Mover ${moveN} soldado${moveN === 1 ? '' : 's'}</button><button class="chip" id="war-end-turn">Encerrar vez →</button>`;
        hint = 'Mova para um vizinho seu. Cada soldado se move uma vez por turno; um permanece em cada território.';
      }
    } else hint = st.result ? 'Objetivo cumprido. A campanha terminou.' : 'Planeje sua próxima jogada enquanto aguarda.';
    const waiting = blocked();
    B.innerHTML = `<div class="war-command-head"><span class="war-eyebrow">${waiting ? 'ORDEM EM ANDAMENTO' : myTurn ? 'SUA VEZ' : 'MESA DE COMANDO'}</span><strong>${esc(title)}</strong></div>
      <ol class="war-phase-steps" aria-label="Etapas do turno">${steps.map((v, i) => `<li class="${phase === i ? 'current' : phase > i ? 'done' : ''}" ${phase === i ? 'aria-current="step"' : ''}><span>${i + 1}</span>${v}</li>`).join('')}</ol>
      <fieldset class="war-command-controls" ${waiting || !myTurn ? 'disabled' : ''}>${bar}</fieldset>`;
    B.classList.remove('empty'); B.setAttribute('aria-busy', String(waiting));
    H.textContent = waiting ? (War3D.busy ? (War3D.rolling ? 'Aguarde: dados → resultado → atualização do mapa.' : 'Executando sua ordem no mapa…') : 'Enviando sua ordem…') : hint;
    requestAnimationFrame(() => {
      const rect = B.getBoundingClientRect();
      document.body.style.setProperty('--war-toast-b', Math.max(20, innerHeight - rect.top + 10) + 'px');
    });
    const chooseSource = id => { sel = id || null; target = null; amount = 1; moveN = sel ? Math.max(1, freeOf(st, sel)) : 1; render(room); };
    $('#war-source', B)?.addEventListener('change', e => chooseSource(e.target.value));
    $('#war-target', B)?.addEventListener('change', e => { target = e.target.value || null; dice = sel ? Math.min(3, st.armies[sel] - 1) : 1; render(room); });
    $('#war-place-range, #war-move-range', B)?.addEventListener('input', e => {
      const placing = st.phase === 'place';
      const max = placing ? placeAvailable(st, sel) : st.occupy?.max || (sel ? Math.max(0, freeOf(st, sel)) : 0);
      if (!max) return;
      const n = Math.min(Math.max(1, Number(e.target.value)), max);
      if (placing) amount = n; else moveN = n;
      $(placing ? '#war-place-count' : '#war-move-count', B).value = `${n} / ${max}`;
      e.target.setAttribute('aria-valuetext', `${n} de ${max} soldados`);
      e.target.style.setProperty('--fill', (max > 1 ? (n - 1) / (max - 1) * 100 : 100) + '%');
      const button = $('#war-place, #war-move, #war-occupy', B);
      if (button) button.textContent = st.occupy ? `Ocupar com ${n}` : `${placing ? 'Adicionar' : 'Mover'} ${n} soldado${n === 1 ? '' : 's'}`;
    });
    $('#war-all', B)?.addEventListener('click', () => { amount = placeAvailable(st, sel); render(room); });
    $$('[data-dice]', B).forEach(b => b.onclick = () => { dice = Number(b.dataset.dice); render(room); });
    $$('[data-open]', B).forEach(b => b.onclick = () => cardsModal(room));
    $('#war-place', B)?.addEventListener('click', () => sendAction({ type: 'place', t: sel, n: amount }));
    $('#war-attack', B)?.addEventListener('click', () => sendAction({ type: 'attack', from: sel, to: target, n: dice }));
    $('#war-occupy', B)?.addEventListener('click', () => sendAction({ type: 'occupy', n: moveN }));
    $('#war-end-attack', B)?.addEventListener('click', () => confirmAction({ type: 'endAttack' }, 'Encerrar ataques, certeza?', 'Você passará para a etapa de mover tropas e não poderá atacar novamente neste turno.'));
    $('#war-move', B)?.addEventListener('click', () => sendAction({ type: 'move', from: sel, to: target, n: moveN }));
    $('#war-end-turn', B)?.addEventListener('click', () => confirmAction({ type: 'endTurn' }, 'Encerrar vez, certeza?', `Sua vez será concluída${st.conquered ? ' e você receberá uma carta pela conquista' : ''}. Deseja continuar?`));
  }

  // ---------- ferramentas e gaveta ----------
  function renderTools(room, st, me) {
    const T = $('#war-table'), unread = room.chat.length > chatSeen && !(drawer && logTab === 'chat');
    const tool = (key, name, label, extra = '') => `<button data-tool="${key}" title="${label}" aria-label="${label}" ${extra}>${icon(name)}${key === 'cards' ? `<sup>${me.cards.length}</sup>` : ''}</button>`;
    $('.war-tools', T).innerHTML = `${me ? tool('obj', 'target', 'Seu objetivo secreto') + tool('cards', 'cards', 'Suas cartas') : ''}
      ${tool('map', 'map', 'Ver o mapa inteiro')}${tool('rules', 'rules', 'Regras')}${tool('mute', SFX.isMuted() ? 'muted' : 'sound', SFX.isMuted() ? 'Ativar som' : 'Silenciar som')}
      ${tool('chat', 'chat', 'Conversa e registro', `class="${drawer ? 'on' : ''} ${unread ? 'dot' : ''}"`)}${st.result ? tool('report', 'report', 'Relatório da partida') : ''}${tool('leave', 'leave', 'Sair da partida')}`;
    const D = $('.war-drawer', T); D.classList.toggle('open', drawer);
    if (drawer) {
      const keep = $('.chat-form input', D)?.value || '', focus = document.activeElement?.closest('.war-drawer .chat-form');
      if (logTab === 'chat') chatSeen = room.chat.length;
      D.innerHTML = `<div class="tabs"><button data-lt="log" class="${logTab === 'log' ? 'on' : ''}">Registro</button><button data-lt="chat" class="${logTab === 'chat' ? 'on' : ''}">Chat</button><button class="x" data-tool="chat" title="Fechar">✕</button></div>
        ${logTab === 'log' ? `<div class="chat-box log">${st.log.map(l => `<div class="msg">${esc(l.msg)}</div>`).join('')}</div>`
        : `<div class="chat-box">${UI.chatHTML(room)}</div><form class="chat-form"><input placeholder="Mensagem…" maxlength="300"><button class="btn">➤</button></form>`}`;
      if (logTab === 'chat') { const i = $('.chat-form input', D); i.value = keep; if (focus) i.focus(); }
      $$('.chat-box', D).forEach(b => (b.scrollTop = b.scrollHeight));
      UI.bindChat(D);
      $$('[data-lt]', D).forEach(b => (b.onclick = () => { logTab = b.dataset.lt; render(Room.room); }));
    } else D.innerHTML = '';
    $$('[data-tool]', T).forEach(b => (b.onclick = () => {
      const k = b.dataset.tool;
      if (k === 'obj') objectiveModal(room);
      else if (k === 'cards') cardsModal(room);
      else if (k === 'map') War3D.overview?.();
      else if (k === 'report' && st.result) showResult(room, st);
      else if (k === 'rules') rulesModal();
      else if (k === 'mute') { SFX.setMuted(!SFX.isMuted()); render(Room.room); }
      else if (k === 'chat') { drawer = !drawer; if (drawer && room.chat.length > chatSeen) logTab = 'chat'; render(Room.room); }
      else if (k === 'leave') { if (UI.confirmLeave()) { reset(); UI.leaveToHub(); } }
    }));
  }

  // ---------- cartas e objetivo ----------
  const CONT_ACCENT = { na: '#cf9a44', sa: '#7cb66b', eu: '#6d9ddc', af: '#d78150', as: '#b0b95b', oc: '#b28acc' };
  const cardArtCache = new Map();
  function cardArt(c) {
    if (cardArtCache.has(c.id)) return cardArtCache.get(c.id);
    const t = WAR_MAP.territories.find(t => t.id === c.terr);
    let art;
    if (!t) art = '<svg viewBox="0 0 100 80" aria-hidden="true"><path d="M50 7 58 30 83 30 63 45 71 70 50 55 29 70 37 45 17 30 42 30Z"/></svg>';
    else {
      const pts = t.polys.flat(), xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
      const x = Math.min(...xs), y = Math.min(...ys), w = Math.max(...xs) - x, h = Math.max(...ys) - y;
      art = `<svg viewBox="${x - w * .08} ${y - h * .08} ${w * 1.16} ${h * 1.16}" aria-hidden="true">${t.polys.map(poly => `<polygon points="${poly.map(p => p.join(',')).join(' ')}"/>`).join('')}</svg>`;
    }
    cardArtCache.set(c.id, art); return art;
  }
  function cardHTML(id, on, compact = false) {
    const c = War.CARDS[id], cont = c.terr ? War.contOf[c.terr] : null;
    return `<button class="wcard ${c.shape} ${on ? 'on' : ''} ${compact ? 'compact' : ''}" data-card="${id}" style="--card-accent:${CONT_ACCENT[cont] || '#e1bd65'}" ${compact ? '' : `aria-pressed="${!!on}"`} aria-label="${compact ? 'Ver carta: ' : ''}${esc(c.terr ? War.terrName[c.terr] : 'Curinga')}, ${c.shape}">
      <span class="wcard-top"><span>SUPREMACIA</span><span class="shape">${SHAPE[c.shape]}</span></span>
      <span class="wcard-art">${cardArt(c)}<span class="wcard-compass">✦</span></span>
      <span class="wcard-caption"><small>${cont ? esc(contName(cont)) : 'TODOS OS CONTINENTES'}</small><b>${c.terr ? esc(War.terrName[c.terr]) : 'Curinga'}</b></span>
      <span class="wcard-foot"><span>${SHAPE[c.shape]} ${c.shape === 'curinga' ? 'Livre' : 'Território'}</span><span>${String(id + 1).padStart(2, '0')}</span></span><span class="wcard-check" aria-hidden="true">✓</span></button>`;
  }
  function renderHand(me) {
    const hand = $('#war-table .war-hand-mini');
    hand.hidden = !me?.cards.length;
    if (hand.hidden) { hand.innerHTML = ''; return; }
    hand.innerHTML = `<div class="war-mini-heading"><span class="war-eyebrow">SUAS CARTAS · ${me.cards.length}</span><button data-tool="cards" title="Abrir suas cartas">Ver cartas ↗</button></div><div class="war-mini-cards">${me.cards.map(id => cardHTML(id, false, true)).join('')}</div>`;
    $$('[data-card]', hand).forEach(b => b.onclick = () => cardsModal(Room.room));
  }
  function cardsModal(room) {
    if (!Room.room?.state || Room.room.game !== 'war') return;
    const initial = view(Room.room), gameId = initial.gameId;
    const m = UI.modal(`<div class="war-cards-modal"><span class="war-eyebrow">SEU ARSENAL ESTRATÉGICO</span><h2>Cartas de território</h2>
      <div class="war-trade-info"><b id="war-trade-base"></b><span>3 figuras iguais ou uma de cada · curinga vale qualquer figura</span><span class="war-trade-rule">3 do mesmo símbolo e continente: <strong>+50% de soldados.</strong> 5 do mesmo símbolo: <strong>dobro da troca normal.</strong></span></div>
      <div class="wcards"></div><div class="war-trade-bonus" hidden><b id="war-trade-bonus-title">Bônus da troca</b><span id="war-trade-bonus-detail"></span></div>
      <p class="war-trade-help">+2 soldados em cada território das cartas trocadas que já for seu. Curingas não ativam os bônus de +50% ou de cinco símbolos iguais.</p>
      <p class="war-trade-owned"></p>
      <div class="war-trade-footer"><span id="war-trade-selection" role="status" aria-live="polite"></span><button class="btn primary" id="war-trade" disabled>Selecione 3 ou 5 cartas</button></div>
      <p class="muted small war-trade-wait" hidden>Troque no começo da sua vez, antes de adicionar soldados. Aguarde a conclusão de qualquer batalha.</p></div>`, { wide: true, onClose: () => { refreshCards = null; } });
    m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true'); m.setAttribute('aria-label', 'Cartas de território');
    let handKey = null;
    const update = () => {
      if (!m.isConnected) { if (refreshCards === update) refreshCards = null; return; }
      const room = Room.room;
      if (!room?.state || room.game !== 'war' || room.state.gameId !== gameId) { refreshCards = null; UI.closeModal(); return; }
      const st = view(room), me = st.players.find(p => p.id === Room.myId); if (!me) return;
      cardSel = cardSel.filter(c => me.cards.includes(c));
      const key = me.cards.join(',');
      // Só uma alteração real na mão reconstrói as cartas; selecionar não recria a janela.
      if (handKey !== key) {
        handKey = key;
        $('.wcards', m).innerHTML = me.cards.length ? me.cards.map(id => cardHTML(id, cardSel.includes(id))).join('') : '<p class="muted">Conquiste pelo menos um território para ganhar uma carta no fim do turno.</p>';
      }
      const canTrade = !blocked() && !st.result && st.players[st.turn].id === Room.myId && st.phase === 'place';
      const ok = War.validSet(cardSel), reward = War.tradeReward(st.trades, cardSel);
      const five = ok && cardSel.length === 5;
      const own = cardSel.filter(c => War.CARDS[c].terr && st.owner[War.CARDS[c].terr] === Room.myId).length;
      $$('[data-card]', m).forEach(b => {
        const selected = cardSel.includes(Number(b.dataset.card));
        b.classList.toggle('on', selected); b.setAttribute('aria-pressed', String(selected)); b.disabled = !canTrade;
      });
      $('#war-trade-base', m).textContent = `Próxima troca: +${reward.base} soldados`;
      $('#war-trade-selection', m).textContent = `${cardSel.length} selecionadas${[3, 5].includes(cardSel.length) && !ok ? ' · combinação inválida' : !ok ? ' · escolha 3 ou 5' : ''}${me.cards.length >= 5 ? ' · troca obrigatória' : ''}`;
      const bonus = $('.war-trade-bonus', m); bonus.hidden = !reward.bonus;
      $('#war-trade-bonus-title', m).textContent = five ? '2× soldados · Cinco símbolos iguais' : '+50% · Bônus continental';
      $('#war-trade-bonus-detail', m).textContent = five ? `${reward.base} × 2 = ${reward.total} soldados` : reward.bonus ? `${contName(reward.continent)} · ${reward.base} + ${reward.bonus} = ${reward.total} soldados` : '';
      $('.war-trade-owned', m).textContent = own && ok ? `Mais ${own * 2} soldados diretamente em ${own} território${own === 1 ? '' : 's'} seu${own === 1 ? '' : 's'}.` : '';
      const button = $('#war-trade', m); button.disabled = !canTrade || !ok;
      button.textContent = ok ? `Trocar ${cardSel.length} por +${reward.total} soldados` : 'Selecione 3 ou 5 cartas';
      $('.war-trade-footer', m).hidden = !canTrade; $('.war-trade-wait', m).hidden = canTrade;
    };
    $('.wcards', m).addEventListener('click', e => {
      const button = e.target.closest('[data-card]'); if (!button || button.disabled) return;
      const id = Number(button.dataset.card);
      if (cardSel.includes(id)) cardSel = cardSel.filter(x => x !== id);
      else if (cardSel.length < 5) cardSel = [...cardSel, id];
      else UI.toast('Você já escolheu 5 cartas. Desmarque uma para trocar a seleção.');
      update();
    });
    $('#war-trade', m).addEventListener('click', () => {
      update(); if ($('#war-trade', m).disabled) return;
      const cards = cardSel.slice(); cardSel = []; refreshCards = null; UI.closeModal(); sendAction({ type: 'trade', cards });
    });
    refreshCards = update; update();
  }
  function objectiveModal(room) {
    const st = view(room), me = st.players.find(p => p.id === Room.myId); if (!me || me.obj == null) return;
    const o = War.objectiveOf(st, me), orig = War.OBJECTIVES[me.obj];
    UI.modal(`<div class="wobj"><span class="wobj-tag">${icon('target')} OBJETIVO SECRETO</span><p>${esc(o.text)}</p>
      ${o.id !== orig.id ? `<small class="muted">Seu objetivo original era: “${esc(orig.text.split('.')[0])}.” — como não dá mais para cumpri-lo, agora vale conquistar 24 territórios.</small>` : ''}
      <small class="muted">Não mostre a ninguém! Você vence assim que cumprir este objetivo.</small></div>`);
  }

  // ---------- eventos ----------
  function playEvents(room, st) {
    const fresh = st.evs.filter(e => e.n > seenEv); seenEv = st.ev.n;
    for (const e of fresh) {
      // Só uma movimentação confirmada pelo anfitrião encerra a seleção atual.
      if (e.type === 'move' && e.pid === Room.myId) { sel = target = null; moveN = 1; }
      if (has3d) War3D.play(e); else notifyEvent(room, e);
    }
  }
  function notifyEvent(room, e) {
    if (!room) return;
      if (e.type === 'turn' && e.pid === Room.myId) { SFX.turnMine?.(); UI.toast(e.round === 1 ? '🪖 Sua vez: posicione seus exércitos (na 1ª rodada não há ataques).' : '🪖 Sua vez!', 'ok'); }
      else if (e.type === 'turn') SFX.turnOther?.();
      else if (e.type === 'place') SFX.coinPing?.(e.count | 0);
      else if (e.type === 'trade') UI.toast(`🃏 ${esc(rp(room, e.pid).name)} trocou cartas: +${e.value} exércitos${e.fiveCardBonus ? ' (dobro por cinco símbolos iguais)' : e.continentalBonus ? ' (bônus continental +50%)' : ''}.`);
      else if (e.type === 'card' && e.pid === Room.myId) UI.toast('🃏 Você ganhou uma carta de território.', 'ok');
      else if (e.type === 'eliminated') UI.toast(`💀 ${esc(rp(room, e.pid).name)} foi destruído por ${esc(rp(room, e.by).name)}!`, e.pid === Room.myId ? 'err' : '');
      else if (e.type === 'win') SFX.win?.();
  }

  // ---------- regras e resultado ----------
  function rulesModal() {
    const C = WAR_MAP.continents;
    UI.modal(`<h2>${icon('rules')} Como jogar Supremacia</h2><ul class="rules-list small">
      <li><b>Objetivo:</b> cada jogador recebe um <b>objetivo secreto</b> (🎯). Vence quem cumprir o seu primeiro.</li>
      <li><b>Início:</b> os 42 territórios são sorteados entre os jogadores, com 1 exército em cada. Na <b>1ª rodada</b> cada um só posiciona exércitos; os ataques começam na 2ª.</li>
      <li><b>Sua vez, nesta ordem:</b> 1) recebe e posiciona exércitos; 2) ataca, se quiser; 3) desloca exércitos, se quiser; 4) recebe uma carta, se conquistou pelo menos um território.</li>
      <li><b>Exércitos recebidos:</b> seus territórios ÷ 2 (parte inteira, mínimo 3) + bônus de cada continente inteiro que você tiver (colocados obrigatoriamente nele): ${Object.values(C).map(c => `${c.name} ${c.bonus}`).join(', ')}.</li>
      <li><b>Troca de cartas:</b> 3 com figuras iguais ou 3 diferentes (●■▲, o ★ curinga vale qualquer uma). Valem 4, 6, 8, 10, 12, 15, 20, 25… exércitos, em sequência contando todas as trocas do jogo, + 2 em cada território das cartas que seja seu. Com 5 cartas a troca é obrigatória. Também é possível entregar 5 cartas com o mesmo símbolo (sem curingas) para receber o dobro do valor normal da troca, sem exigir o mesmo continente. Os bônus de 50% e de dobro não se acumulam.</li>
      <li><b>Bônus continental:</b> troque 3 cartas com o mesmo símbolo e do mesmo continente para receber 50% a mais sobre o valor normal da troca. Frações de soldado são arredondadas para baixo. Curingas não ativam esse bônus.</li>
      <li><b>Ataque:</b> só a vizinhos (fronteira ou linha pontilhada). Precisa de pelo menos 2 exércitos no território de origem — 1 sempre fica de ocupação. Atacante joga até 3 dados vermelhos, defensor até 3 azuis (incluindo o de ocupação). Compara-se o maior com o maior, o segundo com o segundo…; <b>empate é da defesa</b>. Cada comparação perdida tira 1 exército.</li>
      <li><b>Conquista:</b> se o território ficar sem exércitos, é seu: entram no mínimo 1 e no máximo os que participaram do último ataque. Dá para seguir atacando a partir dele.</li>
      <li><b>Deslocamento:</b> ao fim dos ataques, mova exércitos entre territórios vizinhos seus. Cada exército se move uma vez por jogada e cada território mantém 1.</li>
      <li><b>Eliminação:</b> quem destrói um exército fica com as cartas dele (até 5). Se o seu objetivo era destruir uma cor que outro destruiu — ou a sua própria —, ele vira conquistar 24 territórios.</li>
      <li><b>Mapa:</b> arraste para mover, use a roda do mouse para zoom e clique duas vezes num território para aproximar.</li></ul>`, { wide: true });
  }
  function waitForResult(room, st) {
    setTimeout(() => {
      if (built !== st.gameId || Room.room?.game !== 'war' || Room.room.phase !== 'game') return;
      if (War3D.busy) return waitForResult(room, st);
      showResult(room, st);
    }, 300);
  }
  function showResult(room, st) {
    const w = rp(room, st.result.winner), g = generalById(w.general);
    const m = UI.modal(`<div class="result war-result">
      <span class="war-eyebrow">CAMPANHA ENCERRADA</span>
      ${g ? `<img class="wgen big" src="${g.img}" alt="">` : UI.avatar({ ...w, emblem: '' }, 100)}<h1>${esc(w.name)} conquistou a supremacia!</h1>
      <div class="wobj"><span class="wobj-tag">${icon('target')} OBJETIVO CUMPRIDO</span><p>${esc(st.result.text)}</p></div>
      <section class="war-report" aria-label="Relatório da partida"><h2>${icon('report')} Relatório da partida</h2><p>Cada par de dados comparados conta como uma disputa. Empates contam como vitória da defesa.</p>
      ${st.statsPartial || st.players.some(p => !p.battleStats) ? '<p class="war-report-note">Nesta partida retomada, os contadores registram apenas os combates realizados com esta versão.</p>' : ''}
      <div class="war-report-scroll"><table><thead><tr><th scope="col">Comandante</th><th scope="col">Ataques feitos</th><th scope="col">Defesas</th><th scope="col">Dados vencidos</th><th scope="col">Dados perdidos</th><th scope="col">Conquistas</th></tr></thead><tbody>${st.result.ranking.map(r => {
        const p = st.players.find(p => p.id === r.id), stats = r.battleStats || p?.battleStats || {}, c = colorOf(st, r.id);
        return `<tr class="${r.id === st.result.winner ? 'winner' : ''}"><th scope="row"><span class="war-report-player" style="--pc:${c?.hex}">${face(room, r.id, 30)}<span>${esc(rp(room, r.id).name)}<small>${r.worth} territórios · ${r.armies} soldados</small></span>${r.id === st.result.winner ? icon('trophy') : ''}</span></th><td>${stats.attacks || 0}</td><td>${stats.defenses || 0}</td><td>${stats.diceWins || 0}</td><td>${stats.diceLosses || 0}</td><td>${stats.conquests || 0}</td></tr>`;
      }).join('')}</tbody></table></div></section>
      ${Room.isHost ? '<button class="btn primary big" id="back-lobby">Voltar para a sala</button>' : '<p class="muted">Aguardando o anfitrião voltar para a sala…</p>'}
      <button class="btn ghost" id="res-close">Ver o mapa</button></div>`, { wide: true });
    $('#back-lobby', m) && ($('#back-lobby', m).onclick = () => { UI.closeModal(); Room.send({ t: 'lobby' }); });
    $('#res-close', m).onclick = UI.closeModal;
  }
  function reset() { refreshCards = null; presentedState = null; pendingAction = null; clearTimeout(pendingTimer); War3D.resetPresentation(); built = null; resultShown = null; drawer = false; clearInterval(timerIv); if (War3D.active) War3D.show(false); if ($('#scr-game')?.classList.contains('war')) $('#scr-game').classList.remove('cah-full'); }

  return { render, reset };
})();
