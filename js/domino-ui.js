// ===== Dominó — mesa 2D vista de cima, mão, painel e regras =====
const DominoUI = (() => {
  let built = null, seenEv = 0, sel = null, logTab = 'log', resultShown = null, timerIv = null, popN = -1;
  const LIM = 6.5; // a fileira dobra quando passa daqui (unidades de meia pedra)
  const view = room => (Room.isHost ? Domino.viewFor(room.state, Room.myId) : room.state);
  const act = a => Room.send({ t: 'act', a });
  const same = (t, u) => (t[0] === u[0] && t[1] === u[1]) || (t[0] === u[1] && t[1] === u[0]);
  const TEAM = ['#2f7de1', '#e0453a', '#2fa36b', '#c08a12'];

  // ---------- desenho de uma pedra (2×1, meio esquerdo = a, meio direito = b) ----------
  const PIP = { 0: [], 1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
    5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [0, -1], [1, -1], [-1, 1], [0, 1], [1, 1]] };
  const half = (v, cx) => PIP[v].map(([x, y]) => `<circle cx="${cx + x * .26}" cy="${y * .26}" r=".085"/>`).join('');
  const tileG = (a, b) => `<rect x="-.98" y="-.48" width="1.96" height=".96" rx=".14" class="dt-face"/><line x1="0" y1="-.36" x2="0" y2=".36" class="dt-mid"/><g class="dt-pips">${half(a, -.5)}${half(b, .5)}</g>`;
  const tileSVG = (t, cls = '') => `<svg class="dt-svg ${cls}" viewBox="-.55 -1.05 1.1 2.1"><g transform="rotate(90)">${tileG(t[0], t[1])}</g></svg>`;

  // ---------- serpentina: cada braço anda na horizontal, dobra para baixo (direita) ou para cima (esquerda) e volta ----------
  function layout(st) {
    const out = [], endPt = {};
    if (!st.C) return { out, endPt };
    const cd = st.C[0] === st.C[1];
    out.push({ x: 0, y: 0, ang: cd ? 90 : 0, a: st.C[0], b: st.C[1] });
    for (const [arm, s, key] of [[st.R, 1, 'R'], [st.L, -1, 'L']]) {
      let x = s * (cd ? .5 : 1), y = 0, dx = s, dy = 0, hs = s, leg = 0, prevD = cd;
      const turn = (nx, ny) => { x += -dx * .5 + nx * .5; y += -dy * .5 + ny * .5; dx = nx; dy = ny; };
      for (const [i, o] of arm) {
        const d = i === o, len = d ? 1 : 2;
        if (!prevD) {
          if (dy === 0 && Math.abs(x + dx * len) > LIM) { turn(0, s); leg = 0; }
          else if (dy !== 0 && leg >= 1) { hs = -hs; turn(hs, 0); }
        }
        out.push({ x: x + dx * len / 2, y: y + dy * len / 2, ang: Math.atan2(dy, dx) * 180 / Math.PI + (d ? 90 : 0), a: i, b: o, d });
        x += dx * len; y += dy * len; prevD = d; if (dy !== 0) leg++;
      }
      endPt[key] = { x: x + dx * .6, y: y + dy * .6 };
    }
    return { out, endPt };
  }

  function build() {
    let el = $('#dom-table'); if (!el) { el = document.createElement('div'); el.id = 'dom-table'; $('#board-wrap').appendChild(el); }
    el.innerHTML = `<div class="dt-tbar"><i id="dt-timer"></i></div><div class="dt-opps"></div>
      <svg class="dt-board" preserveAspectRatio="xMidYMid meet"></svg><div class="dt-banner"></div>
      <div class="dt-me"><div class="dt-hint"></div><div class="dt-bar"></div><div class="dt-hand"></div></div>`;
  }

  function render(room) {
    if (!room.state) return;
    const st = view(room);
    UI.show('scr-game');
    if (built !== st.gameId) { build(); built = st.gameId; seenEv = st.ev.n; popN = -1; resultShown = null; sel = null; }
    const rp = id => room.players.find(p => p.id === id) || { name: id, char: 'vitoria' };
    const n = st.players.length, mySeat = Math.max(0, st.players.findIndex(p => p.id === Room.myId)), me = st.players.find(p => p.id === Room.myId);
    const myTurn = me && st.phase === 'play' && st.players[st.turn].id === Room.myId;
    const can = myTurn ? Domino.moves(st, me.hand) : [];
    if (sel && !can.some(m => same(m.t, sel))) sel = null;
    const T = $('#dom-table');
    // ---- os outros em volta da mesa ----
    const pos = n === 2 ? ['', 'top'] : n === 3 ? ['', 'right', 'left'] : ['', 'right', 'top', 'left'];
    $('.dt-opps', T).innerHTML = st.players.map((p, s) => {
      if (s === mySeat && me) return '';
      const r = rp(p.id), rel = (s - mySeat + n) % n, open = p.hand.length > 0;
      return `<div class="dt-opp ${pos[rel] || 'top'} ${st.turn === s && st.phase === 'play' ? 'turn' : ''}" style="--tc:${TEAM[Domino.teamOf(st, s)]}">
        <div class="dt-who" title="${esc(r.name)}">${UI.avatar(r, 30)}<b>${esc(r.name)}</b><small>${p.count}</small></div>
        <div class="dt-row">${open ? p.hand.map(t => tileSVG(t, 'mini')).join('') : Array.from({ length: p.count }, () => '<i class="dt-back"></i>').join('')}</div></div>`;
    }).join('');
    // ---- mesa ----
    const { out, endPt } = layout(st);
    let x0 = -8, x1 = 8, y0 = -5, y1 = 5;
    for (const t of out) { const v = Math.abs(t.ang % 180) === 90; x0 = Math.min(x0, t.x - (v ? 1 : 2)); x1 = Math.max(x1, t.x + (v ? 1 : 2)); y0 = Math.min(y0, t.y - (v ? 2 : 1)); y1 = Math.max(y1, t.y + (v ? 2 : 1)); }
    const B = $('.dt-board', T); B.setAttribute('viewBox', `${x0} ${y0} ${x1 - x0} ${y1 - y0}`);
    const fresh = st.ev.type === 'play' && st.ev.n !== popN; popN = st.ev.n;
    const placed = st.ev.type === 'play' ? st.ev.tile : null;
    const ends = sel && st.C ? can.filter(m => same(m.t, sel)).map(m => m.end) : [];
    B.innerHTML = out.map(t => `<g class="dt-tile ${fresh && placed && same([t.a, t.b], placed) ? 'pop' : ''}" transform="translate(${t.x} ${t.y}) rotate(${t.ang})"><g class="dt-in">${tileG(t.a, t.b)}</g></g>`).join('')
      + ends.map(e => `<g class="dt-end" data-end="${e}" transform="translate(${endPt[e].x} ${endPt[e].y})"><circle r=".75"/><text y=".28">＋</text></g>`).join('')
      + (st.C ? '' : `<text class="dt-empty" x="0" y=".3">${st.must ? `Começa a ${st.must[0]}-${st.must[1]}` : 'Mesa limpa'}</text>`);
    $$('.dt-end', B).forEach(g => (g.onclick = () => play(sel, g.dataset.end)));
    // ---- faixa de fim de mão ----
    const L = st.last, ban = $('.dt-banner', T);
    ban.classList.toggle('on', st.phase !== 'play' && !!L);
    if (L) ban.innerHTML = L.kind === 'tranca' ? `🔒 Mesa trancada${L.pts ? ` — ponto para ${esc(sideName(st, L.side, rp))}` : ' e empatada'}<small>Pontos na mão: ${L.sums.join(' × ')}</small>`
      : `🎉 ${esc(rp(st.players[L.seat].id).name)} bateu: <b>${Domino.KIND[L.kind]}</b><small>+${L.pts} para ${esc(sideName(st, L.side, rp))}</small>`;
    // ---- minha mão ----
    $('.dt-hand', T).innerHTML = me ? me.hand.map((t, i) => { const ok = can.some(m => same(m.t, t)); return `<button class="dt-ht ${ok ? 'can' : myTurn ? 'no' : ''} ${sel && same(sel, t) ? 'sel' : ''}" data-i="${i}" ${ok ? '' : 'tabindex="-1"'}>${tileSVG(t)}</button>`; }).join('') : '';
    $$('.dt-ht.can', T).forEach(b => (b.onclick = () => pick(me.hand[+b.dataset.i], can)));
    $('.dt-hint', T).textContent = !me ? '👀 Você está assistindo.' : st.phase !== 'play' ? (st.result ? '' : 'Próxima mão em instantes…')
      : !myTurn ? `Vez de ${rp(st.players[st.turn].id).name}…` : sel ? 'Toque no ＋ da ponta onde quer encaixar.' : can.length ? (st.C ? 'Sua vez: toque numa pedra que encaixa.' : 'Sua vez: comece a mesa.') : st.pile.count ? 'Nenhuma pedra encaixa: compre do monte.' : 'Nenhuma pedra encaixa: passe a vez.';
    $('.dt-bar', T).innerHTML = myTurn && !can.length ? (st.pile.count ? `<button class="btn primary" id="dt-buy">Comprar (${st.pile.count})</button>` : '<button class="btn primary" id="dt-pass">Passar</button>') : '';
    $('#dt-buy', T) && ($('#dt-buy', T).onclick = () => act({ type: 'buy' }));
    $('#dt-pass', T) && ($('#dt-pass', T).onclick = () => act({ type: 'pass' }));
    T.classList.toggle('myturn', !!myTurn);
    sounds(st);
    renderSide(room, st, rp);
    clearInterval(timerIv); timerIv = setInterval(() => tick(view(Room.room || room)), 250); tick(st);
    if (st.result && resultShown !== st.gameId) { resultShown = st.gameId; UI.recordResult(st, room); setTimeout(() => showResult(room, st, rp), 1800); }
  }
  const sideName = (st, k, rp) => (st.teams ? `Dupla ${k + 1}` : rp(st.players[k].id).name);

  function pick(t, can) {
    const ms = can.filter(m => same(m.t, t));
    // uma ponta só (ou as duas pedem o mesmo número): joga direto
    if (ms.length === 1 || ms.every(m => m.end === ms[0].end)) return play(t, ms[0].end);
    const st = view(Room.room), [l, r] = Domino.ends(st);
    if (l === r) return play(t, 'R');
    sel = sel && same(sel, t) ? null : t; SFX.click(); render(Room.room);
  }
  function play(t, end) { if (!t) return; sel = null; act({ type: 'play', tile: t, end }); }

  function sounds(st) {
    if (st.ev.n === seenEv) return; seenEv = st.ev.n;
    const e = st.ev;
    if (e.type === 'play') SFX.flip();
    else if (e.type === 'buy') SFX.click();
    else if (e.type === 'win' || e.type === 'gameover') SFX.coinShower();
    else if (e.type === 'tranca') SFX.coinDown();
  }
  function tick(st) {
    const bar = $('#dt-timer'); if (!bar) return;
    bar.parentElement.classList.toggle('off', !st?.deadline || !!st?.result); if (!st?.deadline) return;
    const total = st.phase === 'play' ? Domino.TURN_MS : Domino.END_MS, left = Math.max(0, st.deadline - Room.now());
    bar.style.width = (100 * left / total) + '%'; bar.classList.toggle('low', st.phase === 'play' && left < 8000);
  }

  // ---------- painel lateral ----------
  function renderSide(room, st, rp) {
    const S = $('#game-side');
    const keep = $('.chat-form input', S)?.value || '', focus = document.activeElement?.closest('#game-side .chat-form');
    const sides = st.score.map((v, k) => {
      const who = st.players.filter((_, s) => Domino.teamOf(st, s) === k).map(p => esc(rp(p.id).name)).join(' + ');
      return `<div class="dt-score" style="--tc:${TEAM[k]}"><b>${v}</b><span>${st.teams ? `Dupla ${k + 1}<small>${who}</small>` : who}</span></div>`;
    }).join('');
    S.innerHTML = `
      <div class="card cj-status"><h3>🎲 Dominó</h3>
        <div class="bankline"><span>Mão ${st.hand}</span><span>🎯 ${st.goal} pontos</span>${st.teams ? '' : `<span>Monte: ${st.pile.count}</span>`}<a id="dt-rules">📖 Regras</a><a id="btn-mute">${SFX.isMuted() ? '🔇' : '🔊'} Som</a></div>
        <div class="dt-scores">${sides}</div></div>
      <div class="card logcard">
        <div class="tabs"><button data-lt="log" class="${logTab === 'log' ? 'on' : ''}">Registro</button><button data-lt="chat" class="${logTab === 'chat' ? 'on' : ''}">Chat</button></div>
        ${logTab === 'log' ? `<div class="chat-box log">${st.log.map(l => `<div class="msg">${esc(l.msg)}</div>`).join('')}</div>`
        : `<div class="chat-box">${UI.chatHTML(room)}</div><form class="chat-form"><input placeholder="Mensagem…" maxlength="300"><button class="btn">➤</button></form>`}
      </div>
      <button class="btn ghost" id="dt-leave">🚪 Sair da partida</button>`;
    if (logTab === 'chat') { const i = $('.chat-form input', S); i.value = keep; if (focus) i.focus(); }
    $$('.chat-box', S).forEach(b => (b.scrollTop = b.scrollHeight));
    UI.bindChat(S);
    $$('[data-lt]', S).forEach(b => (b.onclick = () => { logTab = b.dataset.lt; render(Room.room); }));
    $('#dt-rules', S).onclick = rulesModal;
    $('#btn-mute', S).onclick = () => { SFX.setMuted(!SFX.isMuted()); render(Room.room); };
    $('#dt-leave', S).onclick = () => { if (UI.confirmLeave()) { reset(); UI.leaveToHub(); } };
  }
  function rulesModal() {
    const m = UI.modal(`<h2>🎲 Regras do dominó</h2><ul class="rules">
      <li>28 pedras, 7 para cada um. Com 4 jogadores é em <b>duplas</b> (quem está na sua frente é seu parceiro) e não tem monte.</li>
      <li>Com 2 ou 3 jogadores, cada um joga por si e quem não tem pedra que encaixa <b>compra do monte</b>.</li>
      <li>Na primeira mão começa quem tem a maior carroça. Depois, quem bateu começa com qualquer pedra.</li>
      <li>Batidas: simples <b>1</b>, carroça <b>2</b>, lá e lô <b>3</b> (a última pedra cabia nas duas pontas), cruzada <b>4</b> (carroça que cabia nas duas).</li>
      <li>Mesa trancada: quem tem menos pontos na mão leva <b>1</b>. Empate, ninguém pontua.</li>
      <li>Ganha quem fizer <b>${Domino.GOAL}</b> pontos. Cada vez tem 30 segundos.</li></ul>
      <button class="btn primary" id="dt-rules-ok">Entendi</button>`);
    $('#dt-rules-ok', m).onclick = UI.closeModal;
  }
  function showResult(room, st, rp) {
    const w = rp(st.result.winner);
    const m = UI.modal(`<div class="result">
      <div class="confetti">${Array.from({ length: 40 }, (_, k) => `<i style="--x:${Math.random() * 100}%;--d:${Math.random() * 2}s;--h:${k * 37 % 360}"></i>`).join('')}</div>
      ${UI.avatar(w, 150)}<h1>${esc(sideName(st, st.result.side, rp))} venceu o dominó!</h1>
      <ol class="final">${st.score.map((v, k) => [v, k]).sort((a, b) => b[0] - a[0]).map(([v, k]) => `<li><b>${esc(sideName(st, k, rp))}</b><span>${v} pts</span></li>`).join('')}</ol>
      ${Room.isHost ? '<button class="btn primary big" id="back-lobby">Voltar para a sala</button>' : '<p class="muted">Aguardando o anfitrião voltar para a sala…</p>'}
      <button class="btn ghost" id="res-close">Ver a mesa</button></div>`, { wide: true });
    $('#back-lobby', m) && ($('#back-lobby', m).onclick = () => { UI.closeModal(); Room.send({ t: 'lobby' }); });
    $('#res-close', m).onclick = UI.closeModal;
  }
  function reset() { built = null; resultShown = null; sel = null; clearInterval(timerIv); }

  return { render, reset, layout };
})();
