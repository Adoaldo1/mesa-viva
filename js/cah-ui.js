// ===== Cartas Contra a Humanidade — mesa, painel e regras =====
const CahUI = (() => {
  let built = null, round = 0, seenEv = 0, selected = [], bet = false, chosen = -1, logTab = 'log', resultShown = null, timerIv = null, has3d = false, drawer = false, chatSeen = 0, swapMode = false, swapSel = [];
  const view = room => (Room.isHost ? Cah.viewFor(room.state, Room.myId) : room.state);
  const czarOf = st => st.players[st.czar]?.id;
  const pickOf = st => CAH_BLACK[st.black]?.p || 1;
  const need = st => pickOf(st) * (bet ? 2 : 1);
  const blackHTML = (t, cls = '') => `<span class="cah-black ${cls}">${esc(t).replace(/_/g, '<u>&emsp;&emsp;&emsp;</u>')}</span>`;
  // texto da carta preta com as respostas encaixadas (negrito)
  function composed(black, whites) {
    const t = CAH_BLACK[black].t, strip = s => s.replace(/[.!]+$/, ''); let i = 0;
    if (t.includes('_')) return esc(t).replace(/_/g, () => { const w = whites[i++]; return w == null ? '<u>&emsp;&emsp;&emsp;</u>' : `<b>${esc(strip(CAH_WHITE[w]))}</b>`; });
    return esc(t) + ' ' + whites.map(w => `<b>${esc(CAH_WHITE[w])}</b>`).join(' ');
  }

  function build() {
    const wrapEl = $('#board-wrap');
    let el = $('#cah-table'); if (!el) { el = document.createElement('div'); el.id = 'cah-table'; wrapEl.appendChild(el); }
    el.innerHTML = `<div class="cah-tbar"><i id="cah-timer"></i></div><div class="cah-top"><div class="cah-seats"></div><div class="cah-caption"></div></div>
      <div class="cah-tools"></div><div class="cah-drawer"></div><div class="cah-bar"></div><div class="cah-hint"></div>`;
    has3d = Cah3D.supported() && Cah3D.mount(el, {
      toggle: (id, fromDrag) => toggle(id, fromDrag),
      subClick: i => subClick(i),
      judge: (i, fromDrag) => judge(i),
    });
    el.classList.toggle('flat', !has3d); Cah3D.show(has3d);
    // com 3D, a mesa ocupa a tela toda e o painel lateral some (HUD mínimo por cima da mesa)
    $('#scr-game').classList.toggle('cah-full', has3d);
  }

  function render(room) {
    if (!room.state) return;
    const st = view(room);
    UI.show('scr-game');
    if (built !== st.gameId) { build(); built = st.gameId; seenEv = st.ev.n; round = 0; resultShown = null; }
    if (round !== st.round) { round = st.round; selected = []; bet = false; chosen = -1; swapMode = false; swapSel = []; }
    const me = st.players.find(p => p.id === Room.myId);
    if (me) { selected = selected.filter(id => me.hand.includes(id)); swapSel = swapSel.filter(id => me.hand.includes(id)); }
    if (swapMode && !canSwap(st, me)) { swapMode = false; swapSel = []; }
    const rp = id => room.players.find(p => p.id === id) || { name: id, char: 'vitoria' };
    const czar = czarOf(st), iAmCzar = czar === Room.myId, played = new Set(st.played || []);
    // jogadores no topo da mesa
    $('#cah-table .cah-seats').innerHTML = st.players.map(p => {
      const r = rp(p.id), isCzar = p.id === czar, done = played.has(p.id);
      return `<div class="cah-seat ${isCzar ? 'czar' : ''} ${p.id === Room.myId ? 'me' : ''}" title="${esc(r.name)}${isCzar ? ' · Czar' : ''}">${UI.avatar(r, 30)}<b>${esc(r.name)}</b>
        <small>${isCzar ? '🎩' : st.phase === 'play' ? (done ? '✓' : '…') : ''}</small><span class="pts" title="Pontos">${p.points}</span></div>`;
    }).join('');
    // legenda: a carta preta, com a resposta em destaque
    let cap = '';
    if (st.phase === 'play') cap = me && !iAmCzar && selected.length ? composed(st.black, selected.slice(0, pickOf(st))) : blackHTML(CAH_BLACK[st.black].t);
    else if (st.phase === 'judge') { const s = st.subs[chosen] || [...st.subs].reverse().find(x => x.shown); cap = s?.cards ? composed(st.black, s.cards) : blackHTML(CAH_BLACK[st.black].t); }
    else if (st.last) cap = `${st.last.text ? composed(st.last.black, st.last.cards) : ''}<small>🏆 ${esc(rp(st.last.pid).name)} ganhou o ponto</small>`;
    $('#cah-table .cah-caption').innerHTML = cap;
    $('#cah-table .cah-hint').textContent = !has3d ? '' : swapMode ? `Clique em até ${Cah.SWAP_MAX} cartas para devolver ao monte.` : st.phase === 'play' ? (iAmCzar ? 'Você é o Czar: espere as respostas.' : played.has(Room.myId) ? 'Resposta enviada! Aguardando os outros…' : `Arraste ${pickOf(st) > 1 ? pickOf(st) + ' cartas' : 'uma carta'} da sua mão para a carta preta.`)
      : st.phase === 'judge' ? (iAmCzar ? (st.subs.some(x => !x.shown) ? 'Clique nas respostas para virar e leia em voz alta.' : 'Arraste a melhor resposta até a carta preta.') : 'O Czar está lendo as respostas…') : '';
    if (has3d) Cah3D.sync(st, swapMode ? [] : selected, chosen, swapMode ? swapSel : []);
    playEvents(st, rp);
    if (has3d) renderHud(room, st, rp, me); else renderSide(room, st, rp, me);
    clearInterval(timerIv); timerIv = setInterval(() => tick(view(Room.room || room)), 250); tick(st);
    if (st.result && resultShown !== st.gameId) { resultShown = st.gameId; UI.recordResult(st, room); setTimeout(() => showResult(room, st, rp), 1400); }
  }
  function tick(st) {
    const bar = $('#cah-timer'); if (!bar) return;
    bar.parentElement.classList.toggle('off', !st?.deadline || !!st?.result); if (!st?.deadline) return;
    const total = st.phase === 'play' ? st.answerMs + (pickOf(st) - 1) * 15000 : st.phase === 'judge' ? st.judgeMs : 7000;
    const left = Math.max(0, st.deadline - Room.now());
    bar.style.width = (100 * left / total) + '%'; bar.classList.toggle('low', left < 8000);
    const s = $('#cah-secs'); if (s) s.textContent = Math.ceil(left / 1000) + 's';
  }

  // ---------- ações ----------
  const act = a => Room.send({ t: 'act', a });
  const canSwap = (st, me) => !!(me && st.swap && st.phase === 'play' && !(st.played || []).includes(me.id) && me.swapRound !== st.round && !st.result);
  function toggle(id, fromDrag) {
    if (swapMode) { // modo troca: marca/desmarca as cartas que voltam para o monte
      if (swapSel.includes(id)) swapSel = swapSel.filter(x => x !== id);
      else if (swapSel.length < Cah.SWAP_MAX) { swapSel.push(id); SFX.click(); }
      else UI.toast(`No máximo ${Cah.SWAP_MAX} cartas por troca.`);
      return render(Room.room);
    }
    const st = view(Room.room); if (!st || st.phase !== 'play' || czarOf(st) === Room.myId || (st.played || []).includes(Room.myId)) { if (st?.phase === 'play' && czarOf(st) === Room.myId) UI.toast('Você é o Czar nesta rodada: só escolhe a melhor resposta.'); return; }
    if (selected.includes(id)) selected = selected.filter(x => x !== id);
    else if (selected.length < need(st)) { selected.push(id); SFX.click(); }
    else return UI.toast(`Você já escolheu ${need(st)} carta${need(st) > 1 ? 's' : ''}. Clique numa para desfazer.`);
    if (fromDrag && selected.length === need(st)) return submit();
    render(Room.room);
  }
  function submit() {
    const st = view(Room.room), p = pickOf(st); if (selected.length !== need(st)) return;
    act({ type: 'play', cards: selected.slice(0, p), extra: bet ? selected.slice(p) : [] }); SFX.card();
  }
  function subClick(i) {
    const st = view(Room.room); if (st.phase !== 'judge') return;
    if (czarOf(st) !== Room.myId) { chosen = i; return render(Room.room); }
    if (!st.subs[i]?.shown) { act({ type: 'reveal', i }); SFX.flip(); }
    chosen = i; render(Room.room);
  }
  function judge(i) {
    const st = view(Room.room); if (st.phase !== 'judge' || czarOf(st) !== Room.myId) return;
    if (st.subs.some(s => !s.shown)) return UI.toast('Vire todas as respostas antes de escolher.');
    act({ type: 'judge', i });
  }

  // ---------- HUD mínimo (modo 3D) ----------
  function renderHud(room, st, rp, me) {
    const T = $('#cah-table'); if (!T) return;
    const czar = czarOf(st), iAmCzar = czar === Room.myId, pk = pickOf(st), played = st.played || [];
    const unread = room.chat.length > chatSeen && !(drawer && logTab === 'chat');
    // canto: meta, regras, som, conversa e sair
    $('.cah-tools', T).innerHTML = `<span class="cah-goal" title="Pontos para vencer">🎯 ${st.goal}</span>
      <button data-tool="rules" title="Regras">📖</button><button data-tool="mute" title="Som">${SFX.isMuted() ? '🔇' : '🔊'}</button>
      <button data-tool="chat" class="${drawer ? 'on' : ''} ${unread ? 'dot' : ''}" title="Conversa e registro">💬</button><button data-tool="leave" title="Sair da partida">🚪</button>`;
    // gaveta de conversa/registro (fechada por padrão)
    const D = $('.cah-drawer', T); D.classList.toggle('open', drawer);
    if (drawer) {
      const keep = $('.chat-form input', D)?.value || '', focus = document.activeElement?.closest('.cah-drawer .chat-form');
      if (logTab === 'chat') chatSeen = room.chat.length;
      D.innerHTML = `<div class="tabs"><button data-lt="chat" class="${logTab === 'chat' ? 'on' : ''}">Chat</button><button data-lt="log" class="${logTab === 'log' ? 'on' : ''}">Registro</button><button class="x" data-tool="chat" title="Fechar">✕</button></div>
        ${logTab === 'log' ? `<div class="chat-box log">${st.log.map(l => `<div class="msg">${esc(l.msg)}</div>`).join('')}</div>`
        : `<div class="chat-box">${UI.chatHTML(room)}</div><form class="chat-form"><input placeholder="Mensagem…" maxlength="300"><button class="btn">➤</button></form>`}
        <p class="cah-credit">Cards Against Humanity · CC BY-NC-SA 2.0 · tradução de Marcelo</p>`;
      if (logTab === 'chat') { const i = $('.chat-form input', D); i.value = keep; if (focus) i.focus(); }
      $$('.chat-box', D).forEach(b => (b.scrollTop = b.scrollHeight));
      UI.bindChat(D);
      $$('[data-lt]', D).forEach(b => (b.onclick = () => { logTab = b.dataset.lt; render(Room.room); }));
    } else D.innerHTML = '';
    // barra de ação: só aparece quando há algo a fazer
    let bar = '';
    if (me && !st.result) {
      if (swapMode) bar = `<button class="chip" id="cah-swap-cancel">Cancelar</button><button class="chip go" id="cah-swap-ok" ${swapSel.length ? '' : 'disabled'}>🔄 Trocar ${swapSel.length}/${Cah.SWAP_MAX}</button>`;
      else if (st.phase === 'play' && !iAmCzar && !played.includes(Room.myId)) {
        bar = `${canSwap(st, me) ? '<button class="chip" id="cah-swap" title="Devolva até 2 cartas ao monte e compre outras (1 vez por rodada)">🔄 Trocar cartas</button>' : ''}${st.gamble && me.points >= 1 ? `<label class="chip ${bet ? 'on' : ''} ${me.points < 1 ? 'off' : ''}" title="${me.points < 1 ? 'Precisa de 1 ponto' : 'Aposte 1 ponto para jogar uma resposta extra'}"><input type="checkbox" id="cah-bet" ${bet ? 'checked' : ''} ${me.points < 1 ? 'disabled' : ''}>🎲 Apostar</label>` : ''}
          ${st.reboot && me.points >= 1 ? `<button class="chip" id="cah-reboot" ${me.points < 1 ? 'disabled' : ''} title="1 ponto → mão nova">♻️ Nova mão</button>` : ''}
          ${selected.length ? `<button class="chip go" id="cah-play" ${selected.length === need(st) ? '' : 'disabled'}>Jogar ${selected.length}/${need(st)}</button>` : ''}`;
      } else if (st.phase === 'judge' && iAmCzar && st.subs[chosen]?.shown && !st.subs.some(x => !x.shown)) bar = `<button class="chip go" data-judge="${chosen}">🏆 Escolher esta</button>`;
      else if (st.phase === 'reveal' && iAmCzar) bar = '<button class="chip go" id="cah-next">Próxima rodada ➜</button>';
      else if (st.phase === 'play' && iAmCzar && canSwap(st, me)) bar = '<button class="chip" id="cah-swap" title="Devolva até 2 cartas ao monte e compre outras (1 vez por rodada)">🔄 Trocar cartas</button>';
    }
    const B = $('.cah-bar', T); B.innerHTML = bar; B.classList.toggle('empty', !bar.trim());
    $$('[data-tool]', T).forEach(b => (b.onclick = () => {
      const k = b.dataset.tool;
      if (k === 'rules') rulesModal();
      else if (k === 'mute') { SFX.setMuted(!SFX.isMuted()); render(Room.room); }
      else if (k === 'chat') { drawer = !drawer; if (drawer && room.chat.length > chatSeen) logTab = 'chat'; render(Room.room); }
      else if (k === 'leave') leaveAsk();
    }));
    $('#cah-bet', T) && ($('#cah-bet', T).onchange = e => { bet = e.target.checked; if (!bet) selected = selected.slice(0, pk); render(Room.room); });
    $('#cah-play', T) && ($('#cah-play', T).onclick = submit);
    $('#cah-reboot', T) && ($('#cah-reboot', T).onclick = () => { if (confirm('Gastar 1 ponto para trocar a mão inteira?')) { selected = []; act({ type: 'reboot' }); } });
    $$('[data-judge]', T).forEach(b => (b.onclick = () => judge(+b.dataset.judge)));
    $('#cah-next', T) && ($('#cah-next', T).onclick = () => act({ type: 'next' }));
    bindSwap(T);
  }
  function bindSwap(R) {
    $('#cah-swap', R) && ($('#cah-swap', R).onclick = () => { swapMode = true; swapSel = []; selected = []; bet = false; render(Room.room); });
    $('#cah-swap-cancel', R) && ($('#cah-swap-cancel', R).onclick = () => { swapMode = false; swapSel = []; render(Room.room); });
    $('#cah-swap-ok', R) && ($('#cah-swap-ok', R).onclick = () => { if (!swapSel.length) return; act({ type: 'swap', cards: swapSel }); SFX.card(); swapMode = false; swapSel = []; });
  }
  function leaveAsk() { if (confirm(Room.isHost ? 'Você é o anfitrião: sair encerra a partida para todos. Sair?' : 'Sair da partida? Um bot jogará por você até você voltar.')) { reset(); UI.leaveToHub(); } }

  // ---------- painel lateral (sem 3D) ----------
  function renderSide(room, st, rp, me) {
    const S = $('#game-side');
    const keepChat = $('.chat-form input', S)?.value || '', hadFocus = document.activeElement?.closest('#game-side .chat-form');
    const czar = czarOf(st), iAmCzar = czar === Room.myId, pk = pickOf(st), played = st.played || [];
    const timer = '';
    let panel = '';
    if (st.result) panel = `<p><b>${esc(rp(st.result.winner).name)}</b> venceu! 👑</p>`;
    else if (!me) panel = '<p class="muted">Você está assistindo.</p>';
    else if (st.phase === 'play') {
      const answerers = st.players.length - 1;
      if (iAmCzar) panel = `<div class="offer">🎩 <b>Você é o Czar.</b> Espere todos responderem (${played.length}/${answerers}).</div>${timer}`;
      else if (played.includes(Room.myId)) panel = `<div class="offer">✅ Resposta enviada! Aguardando os outros (${played.length}/${answerers}).</div>${timer}`;
      else {
        panel = `<div class="offer">Escolha <b>${pk}</b> carta${pk > 1 ? 's' : ''}${pk > 1 ? ' <small>(na ordem em que vão ser lidas)</small>' : ''}${bet ? ` + <b>${pk}</b> da aposta` : ''}. Clique ou arraste até a carta preta.</div>${timer}
          <ol class="cah-picked">${selected.map((id, i) => `<li class="${i >= pk ? 'bet' : ''}"><span>${esc(CAH_WHITE[id])}</span><button class="x" data-unpick="${id}" title="Desfazer">✕</button></li>`).join('')}</ol>
          ${st.gamble ? `<label class="cah-opt"><input type="checkbox" id="cah-bet" ${bet ? 'checked' : ''} ${me.points < 1 ? 'disabled' : ''}> 🎲 Apostar 1 ponto e jogar uma resposta extra${me.points < 1 ? ' <small>(precisa de 1 ponto)</small>' : ''}</label>` : ''}
          ${swapMode ? `<div class="offer">🔄 Marque até ${Cah.SWAP_MAX} cartas para trocar.</div><button class="btn" id="cah-swap-cancel">Cancelar</button> <button class="btn primary" id="cah-swap-ok" ${swapSel.length ? '' : 'disabled'}>Trocar ${swapSel.length}/${Cah.SWAP_MAX}</button>` : canSwap(st, me) ? '<button class="btn small" id="cah-swap">🔄 Trocar até 2 cartas</button>' : ''}
          <button class="btn primary big" id="cah-play" ${selected.length === need(st) ? '' : 'disabled'}>🃏 Jogar ${selected.length}/${need(st)}</button>
          ${st.reboot ? `<button class="btn small" id="cah-reboot" ${me.points < 1 ? 'disabled' : ''}>♻️ Reiniciar o Universo (1 ponto → mão nova)</button>` : ''}`;
      }
    } else if (st.phase === 'judge') {
      const list = st.subs.map((s, i) => `<div class="cah-sub ${chosen === i ? 'on' : ''}" data-sub="${i}">${s.shown ? `<p>${composed(st.black, s.cards)}</p>` : '<p class="muted">🂠 Resposta virada</p>'}
        ${iAmCzar ? (s.shown ? `<button class="btn small gold" data-judge="${i}">🏆 Escolher</button>` : `<button class="btn small" data-reveal="${i}">Virar</button>`) : ''}</div>`).join('');
      panel = `<div class="offer">${iAmCzar ? '🎩 <b>Leia em voz alta</b> cada resposta e escolha a mais engraçada.' : `${esc(rp(czar).name)} está lendo as respostas…`}</div>${timer}<div class="cah-subs">${list}</div>`;
    } else if (st.phase === 'reveal' && st.last) {
      panel = `<div class="offer win">🏆 <b>${esc(rp(st.last.pid).name)}</b> ganhou a rodada!<br><span>${composed(st.last.black, st.last.cards)}</span></div>${timer}
        ${iAmCzar ? '<button class="btn primary" id="cah-next">Próxima rodada ➜</button>' : '<p class="muted small">A próxima rodada começa em instantes…</p>'}`;
    }
    // mão em lista (funciona também sem 3D)
    const handList = me && st.phase === 'play' && !iAmCzar && !played.includes(Room.myId) ? `<div class="card cah-hand"><h4>Sua mão (${me.hand.length})</h4><div class="cah-hand-list">${me.hand.map(id => `<button class="cah-wcard ${(swapMode ? swapSel : selected).includes(id) ? 'on' : ''} ${swapMode ? 'swap' : ''}" data-pick="${id}">${esc(CAH_WHITE[id])}</button>`).join('')}</div></div>` : '';
    S.innerHTML = `
      <div class="card cj-status"><h3>🃏 Cartas Contra a Humanidade</h3>
        <div class="bankline"><span>Rodada ${st.round}</span><span>🎯 ${st.goal} pontos para vencer</span><a id="cah-rules">📖 Regras</a><a id="btn-mute">${SFX.isMuted() ? '🔇' : '🔊'} Som</a></div>
        <div class="cah-score">${[...st.players].sort((a, b) => b.points - a.points).map(p => `<span class="${p.id === czar ? 'czar' : ''}">${p.id === czar ? '🎩 ' : ''}${esc(rp(p.id).name)} <b>${p.points}</b></span>`).join('')}</div></div>
      <div class="card actions cah-panel">${panel}</div>
      ${handList}
      <div class="card logcard">
        <div class="tabs"><button data-lt="log" class="${logTab === 'log' ? 'on' : ''}">Registro</button><button data-lt="chat" class="${logTab === 'chat' ? 'on' : ''}">Chat</button></div>
        ${logTab === 'log' ? `<div class="chat-box log">${st.log.map(l => `<div class="msg">${esc(l.msg)}</div>`).join('')}</div>`
        : `<div class="chat-box">${UI.chatHTML(room)}</div><form class="chat-form"><input placeholder="Mensagem…" maxlength="300"><button class="btn">➤</button></form>`}
      </div>
      <p class="muted small cah-credit">Cards Against Humanity · licença CC BY-NC-SA 2.0 · tradução de Marcelo</p>
      <button class="btn ghost small" id="game-leave">Sair da partida</button>`;
    if (logTab === 'chat') { const i = $('.chat-form input', S); i.value = keepChat; if (hadFocus) i.focus(); }
    $$('.chat-box', S).forEach(b => (b.scrollTop = b.scrollHeight));
    UI.bindChat(S);
    $$('[data-lt]', S).forEach(b => (b.onclick = () => { logTab = b.dataset.lt; renderSide(room, st, rp, me); }));
    $$('[data-pick]', S).forEach(b => (b.onclick = () => toggle(+b.dataset.pick)));
    $$('[data-unpick]', S).forEach(b => (b.onclick = () => toggle(+b.dataset.unpick)));
    $('#cah-bet', S) && ($('#cah-bet', S).onchange = e => { bet = e.target.checked; if (!bet) selected = selected.slice(0, pk); render(Room.room); });
    $('#cah-play', S) && ($('#cah-play', S).onclick = submit);
    bindSwap(S);
    $('#cah-reboot', S) && ($('#cah-reboot', S).onclick = () => { if (confirm('Gastar 1 ponto para trocar a mão inteira?')) { selected = []; act({ type: 'reboot' }); } });
    $$('[data-reveal]', S).forEach(b => (b.onclick = e => { e.stopPropagation(); subClick(+b.dataset.reveal); }));
    $$('[data-judge]', S).forEach(b => (b.onclick = e => { e.stopPropagation(); judge(+b.dataset.judge); }));
    $$('[data-sub]', S).forEach(b => (b.onclick = () => subClick(+b.dataset.sub)));
    $('#cah-next', S) && ($('#cah-next', S).onclick = () => act({ type: 'next' }));
    $('#cah-rules', S).onclick = rulesModal;
    $('#btn-mute', S).onclick = e => { SFX.setMuted(!SFX.isMuted()); e.target.textContent = (SFX.isMuted() ? '🔇' : '🔊') + ' Som'; };
    $('#game-leave', S).onclick = leaveAsk;
  }

  function playEvents(st, rp) {
    const fresh = st.evs.filter(e => e.n > seenEv); seenEv = st.ev.n;
    for (const e of fresh) {
      if (e.type === 'round') { SFX.deal(); if (e.czar === Room.myId) UI.toast('🎩 Você é o Czar nesta rodada!', 'ok'); }
      else if (e.type === 'played') SFX.card();
      else if (e.type === 'swap' && e.pid === Room.myId) { SFX.deal(); UI.toast(`🔄 ${e.count} carta${e.count > 1 ? 's' : ''} nova${e.count > 1 ? 's' : ''} na mão.`, 'ok'); }
      else if (e.type === 'judge') { SFX.gavel(); if (czarOf(st) === Room.myId) SFX.turnMine(); }
      else if (e.type === 'reveal') { SFX.flip(); chosen = e.i; }
      else if (e.type === 'win') { (e.pid === Room.myId ? SFX.win : SFX.coinUp)(); if (e.pid === Room.myId) UI.toast('🏆 Sua resposta ganhou a rodada!', 'ok'); }
    }
  }

  function rulesModal() {
    UI.modal(`<h2>📖 Como jogar</h2><ul class="rules-list small">
      <li>Cada jogador começa com <b>10 cartas brancas</b>.</li>
      <li>A cada rodada, um jogador é o <b>Czar</b>: ele vira uma <b>carta preta</b> (uma pergunta ou frase com lacunas).</li>
      <li>Os outros respondem em segredo com uma carta branca. Arraste a carta até a carta preta (ou clique nela e em "Jogar").</li>
      <li><b>PICK 2</b>: jogue duas cartas, na ordem em que devem ser lidas. <b>DRAW 2, PICK 3</b>: todos compram 2 cartas extras e jogam três.</li>
      <li>O Czar embaralha as respostas (ninguém sabe de quem é cada uma), <b>lê cada uma em voz alta</b> junto com a carta preta e escolhe a favorita.</li>
      <li>Quem jogou a resposta escolhida ganha a carta preta: <b>1 Ponto Incrível</b>. Depois o próximo jogador vira o Czar e todos completam a mão até 10.</li>
      <li><b>🎲 Apostas:</b> quem tem pontos pode apostar 1 ponto para jogar uma resposta extra. Se ganhar, fica com o ponto; se perder, o vencedor da rodada leva o ponto apostado.</li>
      <li><b>🔄 Trocar cartas</b> (regra da casa, ligada por padrão): uma vez por rodada, antes de jogar, devolva até 2 cartas da mão ao monte e compre outras 2. O Czar também pode trocar.</li>
      <li><b>♻️ Reiniciar o Universo</b> (regra da casa, se o anfitrião ligar): troque 1 ponto para descartar a mão inteira e comprar 10 cartas novas.</li>
      <li>Vence quem chegar primeiro aos pontos combinados. Os bots respondem e julgam ao acaso, como o "Rando Cardrissian" das regras da casa.</li></ul>
      <p class="muted small">Cards Against Humanity é distribuído sob a licença Creative Commons BY-NC-SA 2.0. Tradução para o português de Marcelo.</p>`, { wide: true });
  }
  function showResult(room, st, rp) {
    const w = rp(st.result.winner);
    const m = UI.modal(`<div class="result">
      <div class="confetti">${Array.from({ length: 40 }, (_, k) => `<i style="--x:${Math.random() * 100}%;--d:${Math.random() * 2}s;--h:${k * 37 % 360}"></i>`).join('')}</div>
      ${UI.avatar(w, 150)}<h1>${esc(w.name)} é a pessoa mais horrível da mesa!</h1>
      <ol class="final">${st.result.ranking.map(r => `<li>${UI.avatar(rp(r.id), 32)}<b>${esc(rp(r.id).name)}</b><span>⬛ ${r.worth}</span></li>`).join('')}</ol>
      ${Room.isHost ? '<button class="btn primary big" id="back-lobby">Voltar para a sala</button>' : '<p class="muted">Aguardando o anfitrião voltar para a sala…</p>'}
      <button class="btn ghost" id="res-close">Ver a mesa</button></div>`, { wide: true });
    $('#back-lobby', m) && ($('#back-lobby', m).onclick = () => { UI.closeModal(); Room.send({ t: 'lobby' }); });
    $('#res-close', m).onclick = UI.closeModal;
  }
  function reset() { built = null; resultShown = null; drawer = false; clearInterval(timerIv); Cah3D.show(false); $('#scr-game')?.classList.toggle('cah-full', false); }

  return { render, reset };
})();
