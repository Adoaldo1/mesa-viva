// ===== Arquipélago — interface da partida =====
// Mostra o tabuleiro (2D em SVG ou 3D), os jogadores, a sua mão e os comandos. Toda jogada vira uma intenção
// ({type, ...}) mandada ao anfitrião, que confere as regras no motor; a tela só desenha o estado que volta.
const ArqUI = (() => {
  let built = null, seenEv = 0, mode = null, drawer = false, logTab = 'log', chatSeen = 0, resultShown = null, timerIv = null;
  let fresh = new Set(), freshT = 0, sent = 0, lastTurnKey = '', modalKind = null, view3d = false, board = null;
  try { view3d = localStorage.getItem('arq-3d') === '1'; } catch { }
  const R = () => Arq.RES;
  const ICON = { madeira: '🪵', argila: '🧱', algodao: '☁️', pedra: '🪨', peixe: '🐟' };
  const RNAME = { madeira: 'Madeira', argila: 'Argila', algodao: 'Algodão', pedra: 'Pedra', peixe: 'Peixe' };
  const CARD_ICON = { explorador: '🧭', carpinteiros: '🪚', tesouro: '🗺️', mercado: '🕶️', reliquia: '🏺' };
  const BUILD = [
    { k: 'trilha', icon: '🛤️', name: 'Trilha' }, { k: 'vila', icon: '🏠', name: 'Vila', vp: 1 },
    { k: 'cidade', icon: '🏛️', name: 'Cidade', vp: 2 }, { k: 'carta', icon: '🃏', name: 'Carta de expedição' },
  ];
  const view = room => (Room.isHost ? Arq.viewFor(room.state, Room.myId) : room.state);
  const rp = (room, id) => room.players.find(p => p.id === id) || { name: id, char: 'vitoria' };
  const colorOf = (st, pid) => Arq.COLORS.find(c => c.id === st.players.find(p => p.id === pid)?.color)?.hex || '#999';
  const name = id => esc(rp(Room.room, id).name);
  const costHTML = c => Object.entries(c).map(([r, n]) => `<span class="cost">${ICON[r]}${n > 1 ? '×' + n : ''}</span>`).join('');
  const resHTML = c => Object.entries(c).filter(([, n]) => n > 0).map(([r, n]) => `${n} ${ICON[r]}`).join(' + ');
  const nonce = () => Date.now().toString(36) + (++sent);
  const act = a => { Room.send({ t: 'act', a: { ...a, nonce: nonce() } }); SFX.click?.(); };
  const Board = () => (view3d && typeof ArqBoard3D !== 'undefined' && ArqBoard3D.supported() ? ArqBoard3D : ArqBoard2D);

  // ---------- montagem ----------
  function build() {
    const wrapEl = $('#board-wrap');
    let el = $('#arq-table'); if (!el) { el = document.createElement('div'); el.id = 'arq-table'; wrapEl.appendChild(el); }
    el.innerHTML = `<div class="arq-board"></div>
      <div class="cah-tbar arq-tbar"><i id="arq-timer"></i></div>
      <div class="arq-top"><div class="arq-seats"></div><div class="arq-banner"></div></div>
      <div class="cah-tools arq-tools"></div><div class="cah-drawer arq-drawer"></div>
      <div class="arq-offer"></div>
      <div class="arq-dock"><div class="arq-hand"></div><div class="arq-cards"></div><div class="arq-actions"></div></div>
      <div class="arq-dice"></div><div class="arq-tip"></div><div class="arq-fly"></div>`;
    $('#scr-game').classList.add('cah-full');
    mountBoard();
  }
  function mountBoard() {
    const host = $('#arq-table .arq-board'); host.innerHTML = '';
    ArqBoard2D.reset(); if (typeof ArqBoard3D !== 'undefined') ArqBoard3D.show(false);
    board = Board();
    board.mount(host, { pick, hover });
    if (board !== ArqBoard2D) ArqBoard3D.show(true);
  }

  // ---------- desenho ----------
  function render(room) {
    if (!room.state) return;
    const st = view(room);
    UI.show('scr-game'); $('#scr-game').classList.add('cah-full');
    if (built !== st.gameId) { build(); built = st.gameId; seenEv = st.ev.n; mode = null; resultShown = null; lastTurnKey = ''; fresh = new Set(); modalKind = null; }
    const me = st.players.find(p => p.id === Room.myId), cur = st.players[st.turn], myTurn = !!me && cur.id === Room.myId && !st.result;
    const turnKey = st.turn + ':' + st.turnNo + ':' + st.phase;
    if (turnKey !== lastTurnKey) { lastTurnKey = turnKey; if (st.phase !== 'main') mode = null; }
    if (mode && !(myTurn && st.phase === 'main')) mode = null;
    try { playEvents(room, st); } catch (err) { console.warn(err); }
    if (Date.now() > freshT) fresh = new Set();
    board.update(st, { ...targets(st, me, myTurn), mode, fresh });
    seats(room, st);
    banner(room, st, me, myTurn);
    hand(st, me);
    cards(st, me, myTurn);
    actions(st, me, myTurn);
    offerPanel(room, st, me, myTurn);
    tools(room, st, me);
    pendingModals(room, st, me, myTurn);
    UI.matchClock($('#board-wrap'), st);
    clearInterval(timerIv); timerIv = setInterval(() => tick(Room.room ? view(Room.room) : st), 250); tick(st);
    if (st.result && resultShown !== st.gameId) { resultShown = st.gameId; UI.recordResult(st, room); setTimeout(() => showResult(room, st), 1800); }
  }
  function tick(st) {
    const bar = $('#arq-timer'); if (!bar || !st) return;
    bar.parentElement.classList.toggle('off', !st.deadline || !!st.result); if (!st.deadline) return;
    const left = Math.max(0, st.deadline - Room.now());
    bar.style.width = Math.min(100, 100 * left / (st.turnMs || 120000)) + '%'; bar.classList.toggle('low', left < 15000);
    const s = $('#arq-secs'); if (s) s.textContent = '⏳ ' + Math.ceil(left / 1000) + 's';
  }

  // onde dá para clicar no tabuleiro agora
  function targets(st, me, myTurn) {
    if (!me || !myTurn) return {};
    const pid = me.id;
    if (st.phase === 'setup') return st.setup.need === 'vila' ? { vertices: Arq.validVilaSpots(st, pid, true) } : { edges: Arq.validRoadSpots(st, pid, st.setup.lastVila) };
    if (st.phase === 'storm') return { hexes: Arq.grid(st).hexes.map(h => h.id).filter(h => h !== st.storm) };
    if (st.phase === 'roads') return { edges: Arq.validRoadSpots(st, pid) };
    if (st.phase === 'main' && mode === 'trilha') return { edges: Arq.validRoadSpots(st, pid) };
    if (st.phase === 'main' && mode === 'vila') return { vertices: Arq.validVilaSpots(st, pid) };
    if (st.phase === 'main' && mode === 'cidade') return { vertices: Arq.validCitySpots(st, pid) };
    return {};
  }
  function pick({ kind, id }) {
    const room = Room.room; if (!room?.state) return;
    const st = view(room), me = st.players.find(p => p.id === Room.myId); if (!me || st.players[st.turn].id !== me.id || st.result) return;
    if (st.phase === 'setup') {
      if (st.setup.need === 'vila' && kind === 'vertex') return act({ type: 'setupVila', v: id });
      if (st.setup.need === 'trilha' && kind === 'edge') return act({ type: 'setupTrilha', e: id });
      return;
    }
    if (st.phase === 'storm' && kind === 'hex') return act({ type: 'storm', tile: id });
    if (st.phase === 'roads' && kind === 'edge') return act({ type: 'build', what: 'trilha', at: id });
    if (st.phase === 'main' && mode) {
      if ((mode === 'trilha' && kind === 'edge') || (mode !== 'trilha' && kind === 'vertex')) { const m = mode; mode = null; act({ type: 'build', what: m, at: id }); }
    }
  }
  function hover(id, e) {
    const tip = $('#arq-table .arq-tip'); if (!tip) return;
    const st = Room.room?.state && view(Room.room);
    if (id == null || !st) { tip.classList.remove('on'); return; }
    const t = st.map.tiles[id]; if (!t || t.terrain === 'mar') { tip.classList.remove('on'); return; }
    const T = ArqBoard2D.TERRAIN[t.terrain], r = Arq.TERRAIN_RES[t.terrain];
    tip.innerHTML = `<b>${T.name}</b>${r ? ` · produz ${ICON[r]} ${RNAME[r]}` : ' · não produz'}${t.num ? ` no <b>${t.num}</b>` : ''}${id === st.storm ? '<br>🌪️ bloqueado pela tempestade' : ''}`;
    const p = board.screenPos('hex', id), box = $('#arq-table').getBoundingClientRect();
    if (p) { tip.style.left = (p.x - box.left) + 'px'; tip.style.top = (p.y - box.top) + 'px'; }
    tip.classList.add('on');
  }

  function seats(room, st) {
    $('#arq-table .arq-seats').innerHTML = st.players.map((p, i) => {
      const r = rp(room, p.id), cur = i === st.turn && !st.result, road = Arq.roadLength(st, p.id);
      const vp = p.vp + (p.hiddenVP || 0);
      return `<div class="arq-seat ${cur ? 'cur' : ''} ${p.id === Room.myId ? 'me' : ''}" data-pid="${esc(p.id)}" style="--pc:${colorOf(st, p.id)}" title="${esc(r.name)}${p.hiddenVP ? ` · ${p.hiddenVP} ponto(s) escondido(s) em relíquias` : ''}">
        <span class="ord">${i + 1}</span>${UI.avatar(r, 34)}<div class="info"><b>${esc(r.name)}</b>
        <small><span title="Recursos na mão">🂠 ${p.handCount}</span><span title="Cartas de expedição">🃏 ${p.cardCount}</span><span class="${st.longest.owner === p.id ? 'award' : ''}" title="Maior trilha contínua${st.longest.owner === p.id ? ' — Rota Mais Longa (+2)' : ''}">🛤️ ${road}</span><span class="${st.army.owner === p.id ? 'award' : ''}" title="Exploradores usados${st.army.owner === p.id ? ' — Maior Expedição (+2)' : ''}">🧭 ${p.played.explorador}</span></small></div>
        <span class="vp" title="Pontos de vitória">⭐${vp}${p.hiddenVP ? '<sup>*</sup>' : ''}</span></div>`;
    }).join('');
  }

  const PROMPT = {
    setupVila: '🏠 Escolha onde fundar sua vila (pontos brilhando).', setupTrilha: '🛤️ Agora ponha uma trilha saindo dessa vila.',
    roll: '🎲 Sua vez: role os dados (ou use uma carta antes).', main: '🔨 Construa, negocie ou passe a vez.',
    storm: '🌪️ Escolha para onde vai a tempestade (qualquer hexágono, menos onde ela está).', steal: '🦹 Escolha de quem roubar.',
    roads: '🪚 Carpinteiros: ponha as trilhas grátis.', discard: '🗑️ Esperando os descartes…',
  };
  function banner(room, st, me, myTurn) {
    const cur = st.players[st.turn];
    let txt;
    if (st.result) txt = `🏆 <b>${name(st.result.winner)}</b> venceu com ${st.result.ranking[0].vp} pontos!`;
    else if (st.discard?.[Room.myId]) txt = `🗑️ Você tem cartas demais: descarte <b>${st.discard[Room.myId]}</b>.`;
    else if (myTurn) {
      const k = st.phase === 'setup' ? (st.setup.need === 'vila' ? 'setupVila' : 'setupTrilha') : st.phase;
      txt = PROMPT[k] || '';
      if (st.phase === 'main' && mode) txt = { trilha: '🛤️ Clique numa aresta brilhando para a trilha.', vila: '🏠 Clique num ponto brilhando para a vila.', cidade: '🏛️ Clique numa vila sua para virar cidade.' }[mode] + ' <a class="lnk" data-cancel>cancelar</a>';
      if (st.phase === 'roads') txt += ` <b>${st.freeRoads}</b> restante${st.freeRoads > 1 ? 's' : ''}.`;
    } else {
      const ph = st.phase === 'setup' ? 'colonizando' : st.phase === 'roll' ? 'vai rolar os dados' : st.phase === 'discard' ? 'esperando descartes' : st.phase === 'storm' ? 'movendo a tempestade' : st.phase === 'steal' ? 'escolhendo de quem roubar' : st.phase === 'roads' ? 'pondo trilhas grátis' : 'construindo e negociando';
      txt = `<span class="dot" style="background:${colorOf(st, cur.id)}"></span>Vez de <b>${name(cur.id)}</b> · ${ph}`;
    }
    const dice = st.dice && !st.result ? `<span class="dd">🎲 ${st.dice[0]} + ${st.dice[1]} = <b>${st.dice[0] + st.dice[1]}</b></span>` : '';
    $('#arq-table .arq-banner').innerHTML = `<span>${txt}</span>${dice}<small class="muted">Rodada ${Math.max(1, st.round)} · meta ${st.goal} ⭐</small>${st.deadline && !st.result ? ' <small id="arq-secs" class="war-secs"></small>' : ''}`;
    const c = $('#arq-table [data-cancel]'); if (c) c.onclick = () => { mode = null; render(Room.room); };
  }

  function hand(st, me) {
    const H = $('#arq-table .arq-hand');
    if (!me) { H.innerHTML = '<div class="arq-spect">👀 Você está assistindo.</div>'; return; }
    H.innerHTML = R().map(r => `<div class="rcard ${me.hand[r] ? '' : 'zero'}" data-res="${r}" title="${RNAME[r]}"><span class="ic">${ICON[r]}</span><b>${me.hand[r]}</b><small>${RNAME[r]}</small></div>`).join('')
      + `<div class="rtotal" title="Total na mão (acima de ${Arq.DISCARD_OVER}, um 7 obriga a descartar metade)"><b class="${Arq.total(me.hand) > Arq.DISCARD_OVER ? 'warn' : ''}">${Arq.total(me.hand)}</b><small>cartas</small></div>`;
  }
  const playableCard = (st, me, myTurn, k) => myTurn && !st.cardPlayed && k !== 'reliquia' && ['roll', 'main'].includes(st.phase) && !(k === 'mercado' && st.phase !== 'main') && me.cards.some(c => c.k === k && c.t < st.turnNo);
  function cards(st, me, myTurn) {
    const C = $('#arq-table .arq-cards');
    if (!me) { C.innerHTML = ''; return; }
    const groups = {}; for (const c of me.cards) groups[c.k] = (groups[c.k] || 0) + 1;
    C.innerHTML = Object.keys(groups).length ? Object.entries(groups).map(([k, n]) => {
      const can = playableCard(st, me, myTurn, k), info = Arq.CARD_INFO[k];
      return `<button class="ecard ${k} ${can ? 'can' : ''}" data-card="${k}" ${can ? '' : 'disabled'} title="${esc(info.name)}: ${esc(info.text)}${k !== 'reliquia' && !can && me.cards.some(c => c.k === k && c.t >= st.turnNo) ? ' (comprada neste turno: use a partir do próximo)' : ''}"><span>${CARD_ICON[k]}</span><b>${esc(info.name)}</b>${n > 1 ? `<i>×${n}</i>` : ''}</button>`;
    }).join('') : '<span class="muted small">Sem cartas de expedição.</span>';
    $$('[data-card]', C).forEach(b => (b.onclick = () => {
      const k = b.dataset.card;
      if (k === 'tesouro') return treasureModal();
      act({ type: 'playCard', card: k });
    }));
  }

  function actions(st, me, myTurn) {
    const A = $('#arq-table .arq-actions');
    if (!me || st.result) { A.innerHTML = ''; return; }
    if (!myTurn || ['setup', 'discard', 'storm', 'steal'].includes(st.phase)) {
      A.innerHTML = `<div class="costs">${BUILD.map(b => `<span class="cref" title="${b.name}">${b.icon} ${costHTML(Arq.COST[b.k])}</span>`).join('')}</div>`;
      return;
    }
    if (st.phase === 'roll') { A.innerHTML = `<button class="arq-btn big go" id="arq-roll">🎲 Rolar dados</button>`; $('#arq-roll').onclick = () => act({ type: 'roll' }); return; }
    if (st.phase === 'roads') { A.innerHTML = `<button class="arq-btn" id="arq-skip">Pular as trilhas restantes</button>`; $('#arq-skip').onclick = () => act({ type: 'skipRoads' }); return; }
    // fase principal
    const pid = me.id, spots = { trilha: Arq.validRoadSpots(st, pid), vila: Arq.validVilaSpots(st, pid), cidade: Arq.validCitySpots(st, pid) };
    const why = b => {
      if (!Arq.has(me.hand, Arq.COST[b.k])) return 'Faltam recursos';
      if (b.k === 'carta') return st.deck.count ? '' : 'Acabaram as cartas';
      if (!me.pieces[b.k]) return 'Sem peças na reserva';
      if (!spots[b.k].length) return b.k === 'vila' ? 'Nenhum lugar válido (amplie suas trilhas)' : b.k === 'cidade' ? 'Você não tem vila' : 'Nenhum lugar válido';
      return '';
    };
    const ratios = Arq.marketRatios(st, pid);
    A.innerHTML = `<div class="builds">${BUILD.map(b => { const w = why(b); return `<button class="arq-btn build ${mode === b.k ? 'on' : ''}" data-build="${b.k}" ${w ? 'disabled' : ''} title="${w || (b.k === 'carta' ? 'Comprar uma carta de expedição' : 'Escolher onde construir')}${b.vp ? ` · +${b.vp} ponto${b.vp > 1 ? 's' : ''}` : ''}">
        <span class="bi">${b.icon}</span><span class="bn">${b.name}${b.k !== 'carta' ? ` <small>(${me.pieces[b.k]})</small>` : ''}</span><span class="bc">${costHTML(Arq.COST[b.k])}</span></button>`; }).join('')}</div>
      <div class="trade">
        <button class="arq-btn" id="arq-bank" title="Trocas com o banco: ${R().map(r => `${ICON[r]} ${st.blackMarket ? 1 : ratios[r]}:1`).join(' · ')}">🏦 Banco${st.blackMarket ? ` <small>(${st.blackMarket} a 1:1)</small>` : ''}</button>
        <button class="arq-btn" id="arq-propose" ${st.offer ? 'disabled' : ''}>🤝 Propor troca</button>
        <button class="arq-btn go" id="arq-end">Passar a vez ➜</button>
      </div>`;
    $$('[data-build]', A).forEach(b => (b.onclick = () => {
      const k = b.dataset.build;
      if (k === 'carta') return act({ type: 'buyCard' });
      mode = mode === k ? null : k; render(Room.room);
    }));
    $('#arq-bank').onclick = () => bankModal();
    $('#arq-propose').onclick = () => offerModal();
    $('#arq-end').onclick = () => { mode = null; act({ type: 'end' }); };
  }

  // ---------- propostas ----------
  function offerPanel(room, st, me, myTurn) {
    const O = $('#arq-table .arq-offer'), o = st.offer;
    if (!o || st.result) { O.innerHTML = ''; O.classList.remove('on'); return; }
    O.classList.add('on');
    if (me && o.from === me.id) {
      const others = st.players.filter(p => p.id !== me.id && (!o.to || o.to.includes(p.id)));
      O.innerHTML = `<b>🤝 Sua proposta</b><p>Você dá ${resHTML(o.give)} e pede ${resHTML(o.get)}</p>
        <div class="replies">${others.map(p => { const r = o.replies[p.id];
          if (r === 'accept') return `<button class="arq-btn go small" data-with="${esc(p.id)}">✅ Trocar com ${name(p.id)}</button>`;
          if (r === 'counter') { const c = o.counters[p.id]; return `<button class="arq-btn small" data-with="${esc(p.id)}" title="Contraproposta">🔁 ${name(p.id)}: você dá ${resHTML(c.give)} por ${resHTML(c.get)}</button>`; }
          return `<span class="rep ${r || 'wait'}">${name(p.id)}: ${r === 'decline' ? '❌ recusou' : '… pensando'}</span>`; }).join('')}</div>
        <button class="arq-btn small" id="arq-cancel-offer">Cancelar proposta</button>`;
      $$('[data-with]', O).forEach(b => (b.onclick = () => act({ type: 'confirm', with: b.dataset.with })));
      $('#arq-cancel-offer').onclick = () => act({ type: 'cancelOffer' });
      return;
    }
    const forMe = me && (!o.to || o.to.includes(me.id)), mine = forMe ? o.replies[me.id] : null;
    const canPay = me && Arq.has(me.hand, o.get);
    O.innerHTML = `<b>🤝 ${name(o.from)} propõe</b><p>dar ${resHTML(o.give)} em troca de ${resHTML(o.get)}${o.to ? ` <small>(para ${o.to.map(name).join(', ')})</small>` : ''}</p>
      ${forMe && !mine ? `<div class="replies"><button class="arq-btn go small" id="arq-acc" ${canPay ? '' : 'disabled'} title="${canPay ? '' : 'Você não tem o que foi pedido'}">Aceitar</button><button class="arq-btn small" id="arq-dec">Recusar</button><button class="arq-btn small" id="arq-ctr">Contraproposta</button></div>`
        : forMe ? `<small class="muted">Sua resposta: ${mine === 'accept' ? '✅ aceitei' : mine === 'counter' ? '🔁 contraproposta enviada' : '❌ recusei'} — esperando ${name(o.from)}.</small>` : '<small class="muted">Proposta para outros jogadores.</small>'}`;
    $('#arq-acc') && ($('#arq-acc').onclick = () => act({ type: 'reply', accept: true }));
    $('#arq-dec') && ($('#arq-dec').onclick = () => act({ type: 'reply', accept: false }));
    $('#arq-ctr') && ($('#arq-ctr').onclick = () => counterModal(o));
  }

  // seletor de quantidades por recurso
  function stepper(id, max, init = {}) {
    return `<div class="steps" id="${id}">${R().map(r => `<div class="step" data-r="${r}" data-max="${max[r] ?? 99}"><span>${ICON[r]}</span><button data-d="-1">−</button><b>${init[r] || 0}</b><button data-d="1">+</button></div>`).join('')}</div>`;
  }
  function bindSteppers(root, onChange) {
    $$('.step', root).forEach(s => $$('button', s).forEach(b => (b.onclick = () => {
      const v = $('b', s), n = Math.max(0, Math.min(+s.dataset.max, +v.textContent + +b.dataset.d)); v.textContent = n; onChange?.();
    })));
  }
  const readSteps = el => Object.fromEntries($$('.step', el).map(s => [s.dataset.r, +$('b', s).textContent]).filter(([, n]) => n > 0));

  function offerModal() {
    const st = view(Room.room), me = st.players.find(p => p.id === Room.myId); if (!me) return;
    const others = st.players.filter(p => p.id !== me.id);
    const m = UI.modal(`<h2>🤝 Propor troca</h2><p class="muted small">Escolha o que você dá e o que pede. Quem aceitar entra na lista, e você escolhe com quem fechar.</p>
      <h4>Você dá</h4>${stepper('arq-give', me.hand)}<h4>Você pede</h4>${stepper('arq-get', {})}
      <h4>Para quem</h4><div class="arq-to">${others.map(p => `<label class="chk"><input type="checkbox" value="${esc(p.id)}" checked> ${name(p.id)}</label>`).join('')}</div>
      <button class="btn primary big" id="arq-send-offer" disabled>Enviar proposta</button>`, { wide: true });
    const check = () => { const g = readSteps($('#arq-give', m)), w = readSteps($('#arq-get', m)); $('#arq-send-offer', m).disabled = !Object.keys(g).length || !Object.keys(w).length || Object.keys(g).some(r => w[r]); };
    bindSteppers(m, check);
    $('#arq-send-offer', m).onclick = () => {
      const to = $$('.arq-to input', m).filter(i => i.checked).map(i => i.value);
      act({ type: 'offer', give: readSteps($('#arq-give', m)), get: readSteps($('#arq-get', m)), to: to.length === others.length ? null : to }); UI.closeModal();
    };
  }
  function counterModal(o) {
    const st = view(Room.room), me = st.players.find(p => p.id === Room.myId); if (!me) return;
    // da minha perspectiva: eu dou o que ele pediu e recebo o que ele oferece
    const m = UI.modal(`<h2>🔁 Contraproposta para ${name(o.from)}</h2>
      <h4>Você dá</h4>${stepper('arq-cgive', me.hand, o.get)}<h4>Você recebe</h4>${stepper('arq-cget', {}, o.give)}
      <button class="btn primary big" id="arq-send-ctr">Enviar contraproposta</button>`, { wide: true });
    bindSteppers(m);
    $('#arq-send-ctr', m).onclick = () => { act({ type: 'counter', give: readSteps($('#arq-cget', m)), get: readSteps($('#arq-cgive', m)) }); UI.closeModal(); };
  }
  function bankModal() {
    const st = view(Room.room), me = st.players.find(p => p.id === Room.myId); if (!me) return;
    const ratios = Arq.marketRatios(st, me.id), ratio = r => (st.blackMarket ? 1 : ratios[r]);
    let give = R().find(r => me.hand[r] >= ratio(r)) || R()[0], get = R().find(r => r !== give);
    const m = UI.modal(`<h2>🏦 Trocar com o banco</h2><p class="muted small">${st.blackMarket ? `🕶️ Mercado Negro: ${st.blackMarket} troca(s) de 1 por 1.` : 'Banco 4:1. Com vila ou cidade num mercado: 3:1 (genérico) ou 2:1 (do recurso).'}</p>
      <h4>Você dá</h4><div class="pickrow" id="arq-bgive">${R().map(r => `<button class="rpick" data-r="${r}" ${me.hand[r] >= ratio(r) ? '' : 'disabled'}>${ICON[r]}<small>${ratio(r)}:1 · tem ${me.hand[r]}</small></button>`).join('')}</div>
      <h4>Você recebe</h4><div class="pickrow" id="arq-bget">${R().map(r => `<button class="rpick" data-r="${r}" ${st.bank[r] ? '' : 'disabled'}>${ICON[r]}<small>banco ${st.bank[r]}</small></button>`).join('')}</div>
      <button class="btn primary big" id="arq-do-bank"></button>`);
    const paint = () => {
      $$('#arq-bgive .rpick', m).forEach(b => b.classList.toggle('on', b.dataset.r === give));
      $$('#arq-bget .rpick', m).forEach(b => { b.classList.toggle('on', b.dataset.r === get); b.classList.toggle('same', b.dataset.r === give); });
      const ok = give !== get && me.hand[give] >= ratio(give) && st.bank[get] > 0;
      const btn = $('#arq-do-bank', m); btn.disabled = !ok; btn.innerHTML = ok ? `Dar ${ratio(give)} ${ICON[give]} e receber 1 ${ICON[get]}` : 'Escolha recursos diferentes';
    };
    $$('#arq-bgive .rpick', m).forEach(b => (b.onclick = () => { give = b.dataset.r; paint(); }));
    $$('#arq-bget .rpick', m).forEach(b => (b.onclick = () => { get = b.dataset.r; paint(); }));
    $('#arq-do-bank', m).onclick = () => { act({ type: 'bank', give, get, n: 1 }); UI.closeModal(); };
    paint();
  }
  function treasureModal() {
    const st = view(Room.room); const pick = [];
    const m = UI.modal(`<h2>🗺️ Mapa do Tesouro</h2><p class="muted small">Escolha 2 recursos (podem ser iguais).</p>
      <div class="pickrow">${R().map(r => `<button class="rpick" data-r="${r}" ${st.bank[r] ? '' : 'disabled'}>${ICON[r]}<small>${RNAME[r]}</small></button>`).join('')}</div>
      <p id="arq-tpick" class="big-pick"></p><button class="btn primary big" id="arq-do-t" disabled>Pegar</button>`);
    const paint = () => { $('#arq-tpick', m).innerHTML = pick.map(r => ICON[r]).join(' ') || '—'; $('#arq-do-t', m).disabled = pick.length !== 2; };
    $$('.rpick', m).forEach(b => (b.onclick = () => { if (pick.length >= 2) pick.shift(); pick.push(b.dataset.r); paint(); }));
    $('#arq-do-t', m).onclick = () => { act({ type: 'playCard', card: 'tesouro', res: pick }); UI.closeModal(); };
    paint();
  }

  // janelas obrigatórias (descarte e roubo): abrem sozinhas e reabrem se fechadas
  function pendingModals(room, st, me, myTurn) {
    const need = me && st.discard?.[me.id];
    if (need && modalKind !== 'discard') { modalKind = 'discard'; discardModal(need); }
    else if (!need && modalKind === 'discard') { modalKind = null; UI.closeModal(); }
    const steal = myTurn && st.phase === 'steal';
    if (steal && modalKind !== 'steal') { modalKind = 'steal'; stealModal(room, st); }
    else if (!steal && modalKind === 'steal') { modalKind = null; UI.closeModal(); }
  }
  function discardModal(n) {
    const st = view(Room.room), me = st.players.find(p => p.id === Room.myId);
    const m = UI.modal(`<h2>🗑️ Descarte ${n} carta${n > 1 ? 's' : ''}</h2><p class="muted small">Saiu 7 e você tem mais de ${Arq.DISCARD_OVER} cartas: devolva metade ao banco.</p>
      ${stepper('arq-disc', me.hand)}<button class="btn primary big" id="arq-do-disc" disabled>Descartar 0/${n}</button>`, { onClose: () => { modalKind = null; } });
    const check = () => { const c = readSteps($('#arq-disc', m)), t = Object.values(c).reduce((a, b) => a + b, 0), b = $('#arq-do-disc', m); b.disabled = t !== n; b.textContent = `Descartar ${t}/${n}`; };
    bindSteppers(m, check);
    $('#arq-do-disc', m).onclick = () => { act({ type: 'discard', res: readSteps($('#arq-disc', m)) }); };
  }
  function stealModal(room, st) {
    UI.modal(`<h2>🦹 Roubar de quem?</h2><p class="muted small">Um recurso aleatório da mão da pessoa escolhida.</p>
      <div class="arq-victims">${st.stealFrom.map(id => { const p = st.players.find(q => q.id === id); return `<button class="arq-btn" data-from="${esc(id)}" style="--pc:${colorOf(st, id)}">${UI.avatar(rp(room, id), 40)}<b>${name(id)}</b><small>🂠 ${p.handCount} cartas</small></button>`; }).join('')}</div>`, { onClose: () => { modalKind = null; } });
    $$('[data-from]').forEach(b => (b.onclick = () => act({ type: 'steal', from: b.dataset.from })));
  }

  // ---------- ferramentas ----------
  function tools(room, st, me) {
    const T = $('#arq-table'), unread = room.chat.length > chatSeen && !(drawer && logTab === 'chat');
    $('.arq-tools', T).innerHTML = `<button data-tool="view" title="${view3d ? 'Ver em 2D' : 'Ver em 3D'}">${view3d ? '🗺️' : '🧊'}</button>
      <button data-tool="rules" title="Regras">📖</button><button data-tool="mute" title="Som">${SFX.isMuted() ? '🔇' : '🔊'}</button>
      <button data-tool="chat" class="${drawer ? 'on' : ''} ${unread ? 'dot' : ''}" title="Registro e conversa">💬</button><button data-tool="leave" title="Sair da partida">🚪</button>`;
    const D = $('.arq-drawer', T); D.classList.toggle('open', drawer);
    if (drawer) {
      const keep = $('.chat-form input', D)?.value || '', focus = document.activeElement?.closest('.arq-drawer .chat-form');
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
      if (k === 'view') { view3d = !view3d; try { localStorage.setItem('arq-3d', view3d ? '1' : '0'); } catch { } mountBoard(); render(Room.room); }
      else if (k === 'rules') rulesModal();
      else if (k === 'mute') { SFX.setMuted(!SFX.isMuted()); render(Room.room); }
      else if (k === 'chat') { drawer = !drawer; if (drawer && room.chat.length > chatSeen) logTab = 'chat'; render(Room.room); }
      else if (k === 'leave') { if (UI.confirmLeave()) { reset(); UI.leaveToHub(); } }
    }));
  }

  // ---------- eventos e animações ----------
  function playEvents(room, st) {
    const evs = st.evs.filter(e => e.n > seenEv); seenEv = st.ev.n;
    if (evs.length > 12) return; // voltou de uma reconexão: não reencena tudo
    for (const e of evs) {
      if (e.type === 'roll') rollFx(st, e);
      else if (e.type === 'build') { fresh.add((e.what === 'trilha' ? 'e' : 'v') + e.at); freshT = Date.now() + 900; SFX.build?.(); if (e.gains && e.pid === Room.myId && Object.keys(e.gains).length) UI.toast(`🎁 Segunda vila: ${resHTML(e.gains)}`, 'ok'); }
      else if (e.type === 'storm') SFX.flip?.();
      else if (e.type === 'steal') { SFX.steal?.(); if (e.from === Room.myId) UI.toast(`🦹 ${name(e.pid)} roubou ${e.res ? ICON[e.res] + ' ' + RNAME[e.res] : '1 recurso'} de você.`, 'err'); else if (e.pid === Room.myId) UI.toast(`🦹 Você roubou ${ICON[e.res]} ${RNAME[e.res]} de ${name(e.from)}.`, 'ok'); }
      else if (e.type === 'card' && e.pid === Room.myId && e.k) { SFX.card?.(); UI.toast(`🃏 Você comprou: ${CARD_ICON[e.k]} ${Arq.CARD_INFO[e.k].name}${e.k === 'reliquia' ? ' (+1 ponto escondido)' : ''}.`, 'ok'); }
      else if (e.type === 'playCard') { SFX.card?.(); if (e.pid !== Room.myId) UI.toast(`${CARD_ICON[e.k]} ${name(e.pid)} usou ${Arq.CARD_INFO[e.k].name}.`); }
      else if (e.type === 'award') { SFX.win?.(); UI.toast(e.pid ? `${e.k === 'longest' ? '🛤️ Rota Mais Longa' : '🧭 Maior Expedição'}: ${name(e.pid)} (+2)` : '🛤️ A Rota Mais Longa ficou sem dono.', e.pid === Room.myId ? 'ok' : ''); }
      else if (e.type === 'turn' && e.pid === Room.myId) { SFX.turnMine?.(); UI.toast('🏝️ Sua vez!', 'ok'); }
      else if (e.type === 'turn') SFX.turnOther?.();
      else if (e.type === 'offer' && e.pid !== Room.myId) SFX.chat?.();
      else if (e.type === 'trade') { SFX.coinUp?.(); }
      else if (e.type === 'win') SFX.win?.();
    }
  }
  const DIE = n => `<div class="die f${n}">${Array.from({ length: n }, () => '<i></i>').join('')}</div>`;
  function rollFx(st, e) {
    const D = $('#arq-table .arq-dice'); if (!D) return;
    SFX.shake?.(); setTimeout(() => SFX.bounce?.(), 500);
    D.className = 'arq-dice on rolling';
    let k = 0; const spin = setInterval(() => { D.innerHTML = `${DIE(1 + Math.floor(Math.random() * 6))}${DIE(1 + Math.floor(Math.random() * 6))}`; if (++k > 7) clearInterval(spin); }, 80);
    setTimeout(() => {
      clearInterval(spin);
      D.className = 'arq-dice on done' + (e.sum === 7 ? ' seven' : '');
      D.innerHTML = `${DIE(e.dice[0])}${DIE(e.dice[1])}<b class="sum">${e.sum === 7 ? '🌪️ 7' : e.sum}</b>`;
      if (e.sum !== 7) flyGains(st, e);
      if (e.sum !== 7) board.hitNumber?.(e.sum);
    }, 720);
    setTimeout(() => { D.className = 'arq-dice'; }, 2600);
  }
  // recursos voando do hexágono que produziu até o jogador
  function flyGains(st, e) {
    const F = $('#arq-table .arq-fly'), box = $('#arq-table').getBoundingClientRect(), g = Arq.grid(st);
    let delay = 0;
    for (const [pid, gains] of Object.entries(e.gains || {})) {
      const target = pid === Room.myId ? null : $(`#arq-table .arq-seat[data-pid="${CSS.escape(pid)}"]`);
      for (const [r, n] of Object.entries(gains)) {
        const src = st.map.tiles.find(t => t.num === e.sum && t.id !== st.storm && Arq.TERRAIN_RES[t.terrain] === r && g.hexes[t.id].corners.some(v => v != null && st.buildings[v]?.owner === pid));
        const from = src && board.screenPos('hex', src.id); if (!from) continue;
        const to = (pid === Room.myId ? $(`#arq-table .rcard[data-res="${r}"]`) : target)?.getBoundingClientRect(); if (!to) continue;
        for (let i = 0; i < n; i++) {
          const s = document.createElement('span'); s.className = 'flyres'; s.textContent = ICON[r];
          s.style.left = (from.x - box.left) + 'px'; s.style.top = (from.y - box.top) + 'px'; F.appendChild(s);
          const dx = to.left + to.width / 2 - from.x, dy = to.top + to.height / 2 - from.y;
          setTimeout(() => { s.style.transform = `translate(${dx}px, ${dy}px) scale(.7)`; s.style.opacity = '.2'; }, 30 + delay);
          setTimeout(() => s.remove(), 1000 + delay);
          delay += 70;
        }
      }
    }
    if (delay) setTimeout(() => SFX.coinUp?.(), 300);
  }

  // ---------- regras e resultado ----------
  function rulesModal() {
    const C = Arq.COST;
    UI.modal(`<h2>📖 Como jogar Arquipélago</h2><ul class="rules-list small">
      <li><b>Objetivo:</b> chegar a 10 pontos na sua vez (11 na ilha grande, com 5–6 jogadores).</li>
      <li><b>Terrenos:</b> 🌲 Mata dá 🪵 madeira · 🟫 Barreiro dá 🧱 argila · Algodoal dá ☁️ algodão · ⛰️ Pedreira dá 🪨 pedra · os <b>cardumes</b> no mar dão 🐟 peixe para quem está na costa. O 🌋 vulcão não produz.</li>
      <li><b>Início:</b> cada um põe uma vila e uma trilha; depois, na ordem inversa, mais uma de cada. A segunda vila já rende 1 recurso de cada terreno vizinho.</li>
      <li><b>Sua vez:</b> role os dados — todo terreno com aquele número produz para as vilas (1) e cidades (2) encostadas. Depois construa e negocie quanto quiser e passe a vez.</li>
      <li><b>Custos:</b> 🛤️ trilha ${costHTML(C.trilha)} · 🏠 vila ${costHTML(C.vila)} (1 ponto) · 🏛️ cidade ${costHTML(C.cidade)} (2 pontos, sobre uma vila) · 🃏 carta ${costHTML(C.carta)}.</li>
      <li><b>Posição:</b> vila só a 2 arestas de qualquer construção e ligada a uma trilha sua; trilha ligada às suas peças, sem passar por construção de outro. Peças: 15 trilhas, 5 vilas, 4 cidades.</li>
      <li><b>🌪️ Sete:</b> quem tem mais de ${Arq.DISCARD_OVER} cartas descarta metade; quem rolou leva a tempestade para qualquer hexágono (ele para de produzir) e rouba 1 recurso de alguém encostado. No 1 contra 1, ninguém com 3 pontos ou menos é roubado.</li>
      <li><b>Comércio:</b> com os outros na sua vez (proposta, aceite, contraproposta) ou com o banco 4:1. Vila ou cidade num mercado da costa: 3:1 (genérico) ou 2:1 (daquele recurso).</li>
      <li><b>Cartas de expedição:</b> 🧭 Explorador (move a tempestade e rouba) · 🪚 Carpinteiros (2 trilhas grátis) · 🗺️ Mapa do Tesouro (2 recursos) · 🕶️ Mercado Negro (3 trocas 1:1) · 🏺 Relíquia (1 ponto escondido). Uma por turno, nunca no turno da compra.</li>
      <li><b>Conquistas (+2):</b> 🛤️ Rota Mais Longa — maior trilha contínua, com 5 ou mais (construção de outro corta a rota; para tomar, precisa ser maior). 🧭 Maior Expedição — quem usou mais exploradores, com 3 ou mais.</li></ul>`, { wide: true });
  }
  function showResult(room, st) {
    const w = rp(room, st.result.winner);
    const m = UI.modal(`<div class="result arq-result">
      <div class="confetti">${Array.from({ length: 40 }, (_, k) => `<i style="--x:${Math.random() * 100}%;--d:${Math.random() * 2}s;--h:${k * 37 % 360}"></i>`).join('')}</div>
      ${UI.avatar(w, 120)}<h1>${esc(w.name)} colonizou o arquipélago!</h1>
      <ol class="final">${st.result.ranking.map(r => `<li>${UI.avatar(rp(room, r.id), 32)}<b>${name(r.id)}</b><span>⭐ ${r.vp}</span>${r.relics ? `<small class="muted">🏺 ${r.relics} relíquia${r.relics > 1 ? 's' : ''}</small>` : ''}</li>`).join('')}</ol>
      ${Room.isHost ? '<button class="btn primary big" id="back-lobby">Voltar para a sala</button>' : '<p class="muted">Aguardando o anfitrião voltar para a sala…</p>'}
      <button class="btn ghost" id="res-close">Ver o mapa</button></div>`, { wide: true });
    $('#back-lobby', m) && ($('#back-lobby', m).onclick = () => { UI.closeModal(); Room.send({ t: 'lobby' }); });
    $('#res-close', m).onclick = UI.closeModal;
  }
  function reset() {
    built = null; resultShown = null; drawer = false; mode = null; modalKind = null; clearInterval(timerIv);
    ArqBoard2D.reset(); if (typeof ArqBoard3D !== 'undefined') ArqBoard3D.show(false);
    $('#arq-table')?.remove();
    if ($('#scr-game')?.classList.contains('arq')) $('#scr-game').classList.remove('cah-full');
  }
  return { render, reset };
})();
