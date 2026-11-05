// ===== Supremacia — HUD sobre a mesa 3D, cartas, objetivo e regras =====
const WarUI = (() => {
  let occKey = '', built = null, seenEv = 0, sel = null, target = null, amount = 1, dice = 3, moveN = 1, cardSel = [], drawer = false, logTab = 'log', chatSeen = 0, resultShown = null, timerIv = null, lastTurnKey = '', has3d = false;
  const view = room => (Room.isHost ? War.viewFor(room.state, Room.myId) : room.state);
  const act = a => Room.send({ t: 'act', a });
  const colorOf = (st, pid) => War.COLORS.find(c => c.id === st.players.find(p => p.id === pid)?.color);
  const SHAPE = { circulo: '●', quadrado: '■', triangulo: '▲', curinga: '★' };
  const contName = c => WAR_MAP.continents[c].name;
  const rp = (room, id) => room.players.find(p => p.id === id) || { name: id, char: 'vitoria' };
  const face = (room, id, size = 34) => { const r = rp(room, id), g = generalById(r.general); return g ? `<img class="wgen" src="${g.thumb}" alt="" style="--s:${size}px">` : UI.avatar(r, size); };

  function build() {
    const wrapEl = $('#board-wrap');
    let el = $('#war-table'); if (!el) { el = document.createElement('div'); el.id = 'war-table'; wrapEl.appendChild(el); }
    el.innerHTML = `<div class="cah-tbar"><i id="war-timer"></i></div>
      <div class="war-top"><div class="war-seats"></div><div class="war-banner"></div></div>
      <div class="cah-tools war-tools"></div><div class="cah-drawer war-drawer"></div>
      <div class="war-bar"></div><div class="war-hint"></div><div class="war-tip"></div>`;
    has3d = War3D.supported() && War3D.mount(el, { click: id => click(id), hover: id => hover(id) });
    War3D.show(has3d);
    if (!has3d) el.insertAdjacentHTML('beforeend', '<div class="war-no3d">Este jogo precisa de 3D (WebGL). Ative a aceleração de hardware do navegador.</div>');
    $('#scr-game').classList.add('cah-full');
    setTimeout(() => War3D.overview?.(), 50);
  }

  // ---------- render ----------
  function render(room) {
    if (!room.state) return;
    const st = view(room);
    UI.show('scr-game'); $('#scr-game').classList.add('cah-full');
    if (built !== st.gameId) { build(); built = st.gameId; seenEv = st.ev.n; sel = target = null; cardSel = []; resultShown = null; lastTurnKey = ''; }
    const me = st.players.find(p => p.id === Room.myId), cur = st.players[st.turn], myTurn = cur.id === Room.myId && !st.result;
    // a cada nova vez/fase, limpa a seleção
    const turnKey = st.turn + ':' + st.round + ':' + st.phase;
    if (turnKey !== lastTurnKey) { lastTurnKey = turnKey; sel = target = null; amount = 1; cardSel = []; if (myTurn && st.phase === 'place') War3D.overview?.(); }
    if (sel && st.owner[sel] !== Room.myId) sel = target = null;
    if (target && !validTarget(st, sel, target)) target = null;
    // jogadores no topo
    $('#war-table .war-seats').innerHTML = st.players.map((p, i) => {
      const c = War.COLORS.find(x => x.id === p.color), n = War.owned(st, p.id).length, arm = War.owned(st, p.id).reduce((s, t) => s + st.armies[t], 0);
      return `<div class="war-seat ${i === st.turn && !st.result ? 'cur' : ''} ${p.out ? 'out' : ''} ${p.id === Room.myId ? 'me' : ''}" style="--pc:${c.hex}" title="${esc(rp(room, p.id).name)} · exército ${c.name.toLowerCase()}">
        ${face(room, p.id, 34)}<div><b>${esc(rp(room, p.id).name)}</b><small>${p.out ? '💀 destruído' : `🗺️ ${n} · 🪖 ${arm} · 🃏 ${p.cardCount ?? p.cards.length}`}</small></div></div>`;
    }).join('');
    banner(room, st, me, myTurn);
    if (has3d) War3D.sync(st, { sel, targets: targetsOf(st, sel), mode: st.phase === 'attack' ? 'attack' : 'move' });
    try { playEvents(room, st); } catch (err) { console.warn(err); }
    renderTools(room, st, me);
    renderBar(room, st, me, myTurn);
    UI.matchClock($('#board-wrap'), st);
    clearInterval(timerIv); timerIv = setInterval(() => tick(view(Room.room || room)), 250); tick(st);
    if (st.result && resultShown !== st.gameId) { resultShown = st.gameId; UI.recordResult(st, room); setTimeout(() => showResult(room, st), 2200); }
  }
  function tick(st) {
    const bar = $('#war-timer'); if (!bar) return;
    bar.parentElement.classList.toggle('off', !st?.deadline || !!st?.result); if (!st?.deadline) return;
    const left = Math.max(0, st.deadline - Room.now()), total = st.turnMs || 90000;
    bar.style.width = Math.min(100, 100 * left / total) + '%'; bar.classList.toggle('low', left < 15000);
    const s = $('#war-secs'); if (s) s.textContent = st.afk === st.players[st.turn].id ? '🤖 automático' : '⏳ ' + Math.ceil(left / 1000) + 's';
  }

  function banner(room, st, me, myTurn) {
    const cur = st.players[st.turn], c = War.COLORS.find(x => x.id === cur.color);
    let txt = '';
    if (st.result) txt = `🏆 <b>${esc(rp(room, st.result.winner).name)}</b> venceu!`;
    else if (!myTurn) txt = `${face(room, cur.id, 26)}<span>Vez de <b style="color:${c.hex}">${esc(rp(room, cur.id).name)}</b> · ${phaseName(st)}</span>`;
    else if (st.phase === 'place') {
      const cont = Object.entries(st.pool.cont).filter(([, v]) => v).map(([k, v]) => `${v} na ${contName(k)}`).join(', ');
      txt = me.cards.length >= 5 ? '<span>🃏 Você tem <b>5 cartas</b>: troque 3 antes de posicionar.</span>'
        : `<span>🪖 Posicione <b>${War.poolTotal(st.pool)}</b> exército${War.poolTotal(st.pool) > 1 ? 's' : ''}${cont ? ` <small>(${cont})</small>` : ''}${st.round === 1 ? ' <small>· 1ª rodada: sem ataques</small>' : ''}</span>`;
    } else if (st.occupy) txt = `<span>🏴 Conquistou <b>${esc(War.terrName[st.occupy.to])}</b>! Quantos exércitos entram?</span>`;
    else if (st.phase === 'attack') txt = '<span>⚔️ <b>Ataque</b>: escolha um território seu com 2+ exércitos e depois um vizinho inimigo.</span>';
    else txt = '<span>🚚 <b>Deslocamento</b>: mova exércitos entre territórios vizinhos seus (cada um se move uma vez).</span>';
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
    if (!id) { sel = target = null; return render(room); }
    if (!myTurn) { War3D.focus?.(id, 99); return; }
    if (st.phase === 'place') {
      if (st.owner[id] !== Room.myId) return UI.toast('Posicione exércitos só nos seus territórios.');
      const left = War.poolTotal(st.pool), n = amount === 'all' ? left : Math.min(amount, left);
      act({ type: 'place', t: id, n }); SFX.click?.(); return;
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
    const c = colorOf(st, st.owner[id]);
    tip.innerHTML = `<b>${esc(War.terrName[id])}</b> <small>${esc(contName(War.contOf[id]))}</small><br><i style="background:${c?.hex}"></i> ${esc(rp(Room.room, st.owner[id]).name)} · 🪖 ${st.armies[id]}`;
    const p = War3D.screenPos(id); if (p) { tip.style.left = p.x + 'px'; tip.style.top = p.y + 'px'; }
    tip.classList.add('on');
  }

  // ---------- barra de ações ----------
  function renderBar(room, st, me, myTurn) {
    const B = $('#war-table .war-bar'), H = $('#war-table .war-hint');
    let bar = '', hint = '';
    if (myTurn && me) {
      if (st.phase === 'place') {
        const left = War.poolTotal(st.pool);
        bar = `${me.cards.length >= 3 ? `<button class="chip ${me.cards.length >= 5 ? 'go' : ''}" data-open="cards">🃏 Trocar cartas <small>(+${War.tradeValue(st.trades)})</small></button>` : ''}
          <span class="chip ghost">Por clique:</span>${[1, 3, 5, 'all'].map(v => `<button class="chip ${amount === v ? 'on' : ''}" data-amt="${v}">${v === 'all' ? `Todos (${left})` : '+' + v}</button>`).join('')}`;
        hint = me.cards.length >= 5 ? 'Abra as cartas e troque 3 para receber mais exércitos.' : 'Clique nos seus territórios para posicionar os exércitos.';
      } else if (st.occupy) {
        const o = st.occupy, ok = o.from + o.to + o.max; if (occKey !== ok) { occKey = ok; moveN = o.max; } moveN = Math.min(Math.max(1, moveN), o.max);
        bar = o.max > 1 ? `<button class="chip" data-mv="-1">−</button><span class="chip ghost">${moveN} de ${o.max}</span><button class="chip" data-mv="1">+</button><button class="chip go" id="war-occupy">🏴 Ocupar ${esc(War.terrName[o.to])}</button>`
          : `<button class="chip go" id="war-occupy">🏴 Ocupar ${esc(War.terrName[o.to])} com 1</button>`;
        hint = 'Os exércitos que atacaram podem entrar no território conquistado (no máximo os que lutaram no último ataque).';
      } else if (st.phase === 'attack') {
        if (sel && target) {
          const max = Math.min(3, st.armies[sel] - 1); dice = Math.min(Math.max(1, dice), max);
          bar = `<span class="chip ghost">${esc(War.terrName[sel])} ⚔️ ${esc(War.terrName[target])}</span>${[1, 2, 3].filter(v => v <= max).map(v => `<button class="chip ${dice === v ? 'on' : ''}" data-dice="${v}">${'🎲'.repeat(v)}</button>`).join('')}<button class="chip go danger" id="war-attack">Atacar</button>`;
          hint = `Ataque com ${dice} contra ${Math.min(3, st.armies[target])} (empate é da defesa).`;
        } else hint = sel ? 'Agora escolha um vizinho inimigo (em vermelho).' : 'Escolha de onde parte o ataque.';
        bar += `<button class="chip" id="war-end-attack">Encerrar ataques ➜</button>`;
      } else if (st.phase === 'move') {
        if (sel && target) {
          const free = freeOf(st, sel); moveN = Math.min(Math.max(1, moveN), free);
          bar = `<span class="chip ghost">${esc(War.terrName[sel])} → ${esc(War.terrName[target])}</span><button class="chip" data-mv="-1">−</button><span class="chip ghost">${moveN} de ${free}</span><button class="chip" data-mv="1">+</button><button class="chip go" id="war-move">🚚 Deslocar</button>`;
        } else hint = sel ? 'Escolha um vizinho seu (em verde) para onde mover.' : 'Escolha de onde saem os exércitos — ou encerre a vez.';
        bar += `<button class="chip ${sel && target ? '' : 'go'}" id="war-end-turn">Encerrar vez ➜</button>`;
      }
    }
    B.innerHTML = bar; B.classList.toggle('empty', !bar.trim()); H.textContent = hint;
    // os avisos (toasts) ficam logo acima da barra de ações, qualquer que seja a altura dela
    requestAnimationFrame(() => {
      const top = !B.classList.contains('empty') ? B.getBoundingClientRect().top : H.textContent ? H.getBoundingClientRect().top : innerHeight - 10;
      if (top > 0) document.body.style.setProperty('--war-toast-b', Math.max(20, innerHeight - top + 10) + 'px');
    });
    $$('[data-amt]', B).forEach(b => (b.onclick = () => { amount = b.dataset.amt === 'all' ? 'all' : +b.dataset.amt; render(room); }));
    $$('[data-dice]', B).forEach(b => (b.onclick = () => { dice = +b.dataset.dice; render(room); }));
    $$('[data-mv]', B).forEach(b => (b.onclick = () => { moveN += +b.dataset.mv; render(room); }));
    $$('[data-open]', B).forEach(b => (b.onclick = () => cardsModal(room)));
    $('#war-attack', B) && ($('#war-attack', B).onclick = () => act({ type: 'attack', from: sel, to: target, n: dice }));
    $('#war-occupy', B) && ($('#war-occupy', B).onclick = () => { act({ type: 'occupy', n: moveN }); sel = target = null; });
    $('#war-end-attack', B) && ($('#war-end-attack', B).onclick = () => { act({ type: 'endAttack' }); sel = target = null; });
    $('#war-move', B) && ($('#war-move', B).onclick = () => { act({ type: 'move', from: sel, to: target, n: moveN }); sel = target = null; });
    $('#war-end-turn', B) && ($('#war-end-turn', B).onclick = () => { act({ type: 'endTurn' }); sel = target = null; });
  }

  // ---------- ferramentas e gaveta ----------
  function renderTools(room, st, me) {
    const T = $('#war-table'), unread = room.chat.length > chatSeen && !(drawer && logTab === 'chat');
    $('.war-tools', T).innerHTML = `${me ? `<button data-tool="obj" title="Seu objetivo secreto">🎯</button><button data-tool="cards" title="Suas cartas">🃏<sup>${me.cards.length}</sup></button>` : ''}
      <button data-tool="map" title="Ver o mapa inteiro">🗺️</button><button data-tool="rules" title="Regras">📖</button><button data-tool="mute" title="Som">${SFX.isMuted() ? '🔇' : '🔊'}</button>
      <button data-tool="chat" class="${drawer ? 'on' : ''} ${unread ? 'dot' : ''}" title="Conversa e registro">💬</button><button data-tool="leave" title="Sair da partida">🚪</button>`;
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
      else if (k === 'rules') rulesModal();
      else if (k === 'mute') { SFX.setMuted(!SFX.isMuted()); render(Room.room); }
      else if (k === 'chat') { drawer = !drawer; if (drawer && room.chat.length > chatSeen) logTab = 'chat'; render(Room.room); }
      else if (k === 'leave') { if (UI.confirmLeave()) { reset(); UI.leaveToHub(); } }
    }));
  }

  // ---------- cartas e objetivo ----------
  function cardHTML(id, on) {
    const c = War.CARDS[id];
    return `<button class="wcard ${c.shape} ${on ? 'on' : ''}" data-card="${id}"><span class="shape">${SHAPE[c.shape]}</span><b>${c.terr ? esc(War.terrName[c.terr]) : 'Curinga'}</b><small>${c.terr ? esc(contName(War.contOf[c.terr])) : 'vale qualquer figura'}</small></button>`;
  }
  function cardsModal(room) {
    const draw = () => {
      const st = view(Room.room), me = st.players.find(p => p.id === Room.myId); if (!me) return;
      cardSel = cardSel.filter(c => me.cards.includes(c));
      const canTrade = st.players[st.turn].id === Room.myId && st.phase === 'place', ok = cardSel.length === 3 && War.validSet(cardSel);
      const own = cardSel.filter(c => War.CARDS[c].terr && st.owner[War.CARDS[c].terr] === Room.myId).length;
      const m = UI.modal(`<h2>🃏 Suas cartas</h2>
        <p class="muted small">Troque 3 com figuras iguais ou 3 com figuras diferentes (o curinga vale qualquer uma). Próxima troca do jogo: <b>+${War.tradeValue(st.trades)}</b> exércitos, e +2 em cada território da carta que for seu. Com 5 cartas a troca é obrigatória.</p>
        <div class="wcards">${me.cards.length ? me.cards.map(id => cardHTML(id, cardSel.includes(id))).join('') : '<p class="muted">Você ainda não tem cartas: conquiste pelo menos um território na sua vez para ganhar uma.</p>'}</div>
        ${canTrade ? `<button class="btn primary big" id="war-trade" ${ok ? '' : 'disabled'}>Trocar ${cardSel.length}/3${ok ? ` · +${War.tradeValue(st.trades)}${own ? ` e +2 em ${own}` : ''}` : ''}</button>` : '<p class="muted small">Trocas só no começo da sua vez, antes de posicionar os exércitos.</p>'}`, { wide: true });
      $$('[data-card]', m).forEach(b => (b.onclick = () => { const id = +b.dataset.card; cardSel = cardSel.includes(id) ? cardSel.filter(x => x !== id) : cardSel.length < 3 ? [...cardSel, id] : cardSel; draw(); }));
      $('#war-trade', m) && ($('#war-trade', m).onclick = () => { act({ type: 'trade', cards: cardSel }); cardSel = []; UI.closeModal(); });
    };
    draw();
  }
  function objectiveModal(room) {
    const st = view(room), me = st.players.find(p => p.id === Room.myId); if (!me || me.obj == null) return;
    const o = War.objectiveOf(st, me), orig = War.OBJECTIVES[me.obj];
    UI.modal(`<div class="wobj"><span class="wobj-tag">🎯 OBJETIVO SECRETO</span><p>${esc(o.text)}</p>
      ${o.id !== orig.id ? `<small class="muted">Seu objetivo original era: “${esc(orig.text.split('.')[0])}.” — como não dá mais para cumpri-lo, agora vale conquistar 24 territórios.</small>` : ''}
      <small class="muted">Não mostre a ninguém! Você vence assim que cumprir este objetivo.</small></div>`);
  }

  // ---------- eventos ----------
  function playEvents(room, st) {
    const fresh = st.evs.filter(e => e.n > seenEv); seenEv = st.ev.n;
    for (const e of fresh) {
      if (has3d && ['battle', 'move', 'occupy', 'trade', 'eliminated'].includes(e.type)) War3D.play(e);
      if (e.type === 'turn' && e.pid === Room.myId) { SFX.turnMine?.(); UI.toast(e.round === 1 ? '🪖 Sua vez: posicione seus exércitos (na 1ª rodada não há ataques).' : '🪖 Sua vez!', 'ok'); }
      else if (e.type === 'turn') SFX.turnOther?.();
      else if (e.type === 'place') SFX.coinPing?.(e.count | 0);
      else if (e.type === 'trade') UI.toast(`🃏 ${esc(rp(room, e.pid).name)} trocou cartas: +${e.value} exércitos.`);
      else if (e.type === 'card' && e.pid === Room.myId) UI.toast('🃏 Você ganhou uma carta de território.', 'ok');
      else if (e.type === 'eliminated') UI.toast(`💀 ${esc(rp(room, e.pid).name)} foi destruído por ${esc(rp(room, e.by).name)}!`, e.pid === Room.myId ? 'err' : '');
      else if (e.type === 'win') SFX.win?.();
    }
  }

  // ---------- regras e resultado ----------
  function rulesModal() {
    const C = WAR_MAP.continents;
    UI.modal(`<h2>📖 Como jogar Supremacia</h2><ul class="rules-list small">
      <li><b>Objetivo:</b> cada jogador recebe um <b>objetivo secreto</b> (🎯). Vence quem cumprir o seu primeiro.</li>
      <li><b>Início:</b> os 42 territórios são sorteados entre os jogadores, com 1 exército em cada. Na <b>1ª rodada</b> cada um só posiciona exércitos; os ataques começam na 2ª.</li>
      <li><b>Sua vez, nesta ordem:</b> 1) recebe e posiciona exércitos; 2) ataca, se quiser; 3) desloca exércitos, se quiser; 4) recebe uma carta, se conquistou pelo menos um território.</li>
      <li><b>Exércitos recebidos:</b> seus territórios ÷ 2 (parte inteira, mínimo 3) + bônus de cada continente inteiro que você tiver (colocados obrigatoriamente nele): ${Object.values(C).map(c => `${c.name} ${c.bonus}`).join(', ')}.</li>
      <li><b>Troca de cartas:</b> 3 com figuras iguais ou 3 diferentes (●■▲, o ★ curinga vale qualquer uma). Valem 4, 6, 8, 10, 12, 15, 20, 25… exércitos, em sequência contando todas as trocas do jogo, + 2 em cada território das cartas que seja seu. Com 5 cartas a troca é obrigatória.</li>
      <li><b>Ataque:</b> só a vizinhos (fronteira ou linha pontilhada). Precisa de pelo menos 2 exércitos no território de origem — 1 sempre fica de ocupação. Atacante joga até 3 dados vermelhos, defensor até 3 amarelos (incluindo o de ocupação). Compara-se o maior com o maior, o segundo com o segundo…; <b>empate é da defesa</b>. Cada comparação perdida tira 1 exército.</li>
      <li><b>Conquista:</b> se o território ficar sem exércitos, é seu: entram no mínimo 1 e no máximo os que participaram do último ataque. Dá para seguir atacando a partir dele.</li>
      <li><b>Deslocamento:</b> ao fim dos ataques, mova exércitos entre territórios vizinhos seus. Cada exército se move uma vez por jogada e cada território mantém 1.</li>
      <li><b>Eliminação:</b> quem destrói um exército fica com as cartas dele (até 5). Se o seu objetivo era destruir uma cor que outro destruiu — ou a sua própria —, ele vira conquistar 24 territórios.</li>
      <li><b>Mapa:</b> arraste para mover, use a roda do mouse para zoom e clique duas vezes num território para aproximar.</li></ul>`, { wide: true });
  }
  function showResult(room, st) {
    const w = rp(room, st.result.winner), g = generalById(w.general);
    const m = UI.modal(`<div class="result war-result">
      <div class="confetti">${Array.from({ length: 40 }, (_, k) => `<i style="--x:${Math.random() * 100}%;--d:${Math.random() * 2}s;--h:${k * 37 % 360}"></i>`).join('')}</div>
      ${g ? `<img class="wgen big" src="${g.img}" alt="">` : UI.avatar(w, 150)}<h1>${esc(w.name)} conquistou a supremacia!</h1>
      <div class="wobj"><span class="wobj-tag">🎯 OBJETIVO CUMPRIDO</span><p>${esc(st.result.text)}</p></div>
      <ol class="final">${st.result.ranking.map(r => { const p = st.players.find(x => x.id === r.id); return `<li>${face(room, r.id, 32)}<b>${esc(rp(room, r.id).name)}</b><span>🗺️ ${r.worth} · 🪖 ${r.armies}</span><small class="muted">${p?.obj != null ? esc(War.OBJECTIVES[p.obj].text.split('.')[0]) : ''}</small></li>`; }).join('')}</ol>
      ${Room.isHost ? '<button class="btn primary big" id="back-lobby">Voltar para a sala</button>' : '<p class="muted">Aguardando o anfitrião voltar para a sala…</p>'}
      <button class="btn ghost" id="res-close">Ver o mapa</button></div>`, { wide: true });
    $('#back-lobby', m) && ($('#back-lobby', m).onclick = () => { UI.closeModal(); Room.send({ t: 'lobby' }); });
    $('#res-close', m).onclick = UI.closeModal;
  }
  function reset() { built = null; resultShown = null; drawer = false; clearInterval(timerIv); if (War3D.active) War3D.show(false); if ($('#scr-game')?.classList.contains('war')) $('#scr-game').classList.remove('cah-full'); }

  return { render, reset };
})();
