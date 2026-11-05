// ===== Dominó 2 — mesa 2D vista de cima, mão, painel e regras =====
const Domino2UI = (() => {
  let emoN = -1, sigN = 0, sumPlan = {}, sumRaf = 0, revealKey = -1, revealT0 = 0, pop = null;
  let ambOn = (() => { try { return localStorage.getItem('d2-amb') !== '0'; } catch { return true; } })();
  const SIGS = { forte: 'muito', sem: 'sem', carroca: 'carroça' };
  let built = null, seenEv = 0, sayN = 0, says = {}, sel = null, logTab = 'log', resultShown = null, timerIv = null, popN = -1, has3d = false, lastCan = [];
  const LIM = 6.5; // a fileira dobra quando passa daqui (unidades de meia pedra)
  const view = room => (Room.isHost ? Domino2.viewFor(room.state, Room.myId) : room.state);
  const act = a => Room.send({ t: 'act', a });
  const same = (t, u) => (t[0] === u[0] && t[1] === u[1]) || (t[0] === u[1] && t[1] === u[0]);
  const TEAM = ['#2f7de1', '#e0453a', '#2fa36b', '#c08a12'];

  // ---------- desenho de uma pedra (2×1, meio esquerdo = a, meio direito = b) ----------
  const PIP = { 0: [], 1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
    5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [0, -1], [1, -1], [-1, 1], [0, 1], [1, 1]] };
  const half = (v, cx) => PIP[v].map(([x, y]) => `<circle cx="${cx + x * .26}" cy="${y * .26}" r=".085"/>`).join('');
  const tileG = (a, b) => `<rect x="-.98" y="-.48" width="1.96" height=".96" rx=".14" class="d2-face"/><line x1="0" y1="-.36" x2="0" y2=".36" class="d2-mid"/><g class="d2-pips">${half(a, -.5)}${half(b, .5)}</g>`;
  const tileSVG = (t, cls = '') => `<svg class="d2-svg ${cls}" viewBox="-.55 -1.05 1.1 2.1"><g transform="rotate(90)">${tileG(t[0], t[1])}</g></svg>`;

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
    let el = $('#d2-table'); if (!el) { el = document.createElement('div'); el.id = 'd2-table'; $('#board-wrap').appendChild(el); }
    el.innerHTML = `<div class="d2-tbar"><i id="d2-timer"></i></div><div class="d2-opps"></div>
      <svg class="d2-board" preserveAspectRatio="xMidYMid meet"></svg><div class="d2-banner"></div>
      <div class="d2-me"><div class="d2-hint"></div><div class="d2-bar"></div><div class="d2-hand"></div></div>`;
    // mesa 3D (Domino2GL); sem WebGL fica a mesa 2D em SVG
    has3d = Domino2GL.supported() && Domino2GL.mount(el, { pick: t => pick(t, lastCan), play: (t, e, f) => play(t, e, f) });
    el.classList.toggle('is3d', has3d); Domino2GL.show(has3d);
    Domino2SFX.ambience(ambOn); if (has3d) Domino2GL.setAmbient(ambOn);
  }
  // contador de pontos na mão no fim da mão
  function sumTick() {
    const now = Date.now(); let more = false;
    $$('.d2-sum[data-seat]').forEach(el => {
      const plan = sumPlan[el.dataset.seat] || []; more ||= plan.some(x => x.at > now);
      const v = plan.reduce((s, x) => s + (x.at <= now ? x.v : 0), 0), b = el.querySelector('b');
      if (b.textContent !== String(v)) { b.textContent = v; el.classList.remove('up'); void el.offsetWidth; el.classList.add('up'); }
    });
    if (more) sumRaf = requestAnimationFrame(sumTick);
  }
  function flyEmoji(em) {
    const T = $('#d2-table'); if (!T) return;
    const tr = T.getBoundingClientRect(), at = s => { const r = $(`.d2-who[data-seat="${s}"]`, T)?.getBoundingClientRect(); return r && r.width ? [r.left - tr.left + r.width / 2, r.top - tr.top + r.height / 2] : [tr.width / 2, tr.height - 50]; };
    const a = at(em.from), b = em.to >= 0 && em.to !== em.from ? at(em.to) : [a[0], a[1] - 80], dx = b[0] - a[0], dy = b[1] - a[1];
    const el = document.createElement('div'); el.className = 'd2-emo'; el.textContent = em.e; el.style.left = a[0] + 'px'; el.style.top = a[1] + 'px'; T.appendChild(el);
    const tf = (x, y, s, r = 0) => `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) scale(${s}) rotate(${r}deg)`;
    el.animate([{ transform: tf(0, 0, .4), opacity: 0 }, { transform: tf(dx * .5, dy * .5 - 70, 1.5, -14), opacity: 1, offset: .4 }, { transform: tf(dx, dy, 2, 8), opacity: 1, offset: .75 }, { transform: tf(dx, dy - 24, 1.3), opacity: 0 }],
      { duration: 1700, easing: 'ease-out' }).onfinish = () => el.remove();
    SFX.click?.();
  }
  // toque num crachá: emojis para essa pessoa (no seu: para a mesa toda) e, no seu, o sinal secreto para o parceiro
  function openPop(seat, anchor, st, mySeat) {
    closePop(); const T = $('#d2-table'), tr = T.getBoundingClientRect(), r = anchor.getBoundingClientRect();
    const mine = seat === mySeat, canSig = mine && st.teams && st.phase === 'play' && !(st.signals || []).some(s => s.seat === mySeat);
    pop = document.createElement('div'); pop.className = 'd2-pop';
    pop.innerHTML = `<small>${mine ? 'Emoji para a mesa' : 'Emoji para ' + esc(anchor.title.split(' — ')[0])}</small>
      <div class="d2-emos">${Domino2.EMO.map(e => `<button data-e="${e}">${e}</button>`).join('')}</div>
      ${canSig ? `<small>🤫 Sinal para o parceiro (só ele vê, um por mão)</small>
      <div class="d2-kinds">${Object.entries(Domino2.SIG).map(([k, t], i) => `<button data-k="${k}" class="${i ? '' : 'on'}">${t}…</button>`).join('')}</div>
      <div class="d2-nums">${[0, 1, 2, 3, 4, 5, 6].map(x => `<button data-x="${x}">${x}</button>`).join('')}</div>` : ''}`;
    T.appendChild(pop);
    const left = Math.max(8, Math.min(tr.width - pop.offsetWidth - 8, r.left - tr.left + r.width / 2 - pop.offsetWidth / 2));
    const top = r.top - tr.top > tr.height / 2 ? r.top - tr.top - pop.offsetHeight - 8 : r.bottom - tr.top + 8;
    pop.style.left = left + 'px'; pop.style.top = top + 'px';
    pop.onclick = e => e.stopPropagation();
    $$('[data-e]', pop).forEach(b => (b.onclick = () => { act({ type: 'emote', e: b.dataset.e, to: mine ? -1 : seat }); closePop(); }));
    $$('[data-k]', pop).forEach(b => (b.onclick = () => { $$('[data-k]', pop).forEach(x => x.classList.toggle('on', x === b)); }));
    $$('[data-x]', pop).forEach(b => (b.onclick = () => { act({ type: 'signal', kind: $('[data-k].on', pop).dataset.k, x: +b.dataset.x }); closePop(); }));
    setTimeout(() => document.addEventListener('pointerdown', closePop, { once: true }), 0);
  }
  function closePop(e) { if (e && pop?.contains(e.target)) return document.addEventListener('pointerdown', closePop, { once: true }); pop?.remove(); pop = null; }

  function render(room) {
    if (!room.state) return;
    const st = view(room);
    UI.show('scr-game');
    if (built !== st.gameId) { build(); built = st.gameId; seenEv = sayN = st.ev.n; says = {}; popN = -1; resultShown = null; sel = null; emoN = -1; sigN = Math.max(0, ...(st.signals || []).map(s => s.n)); revealKey = st.phase !== 'play' ? st.hand : -1; }
    const rp = id => room.players.find(p => p.id === id) || { name: id, char: 'vitoria' };
    const n = st.players.length, mySeat = Math.max(0, st.players.findIndex(p => p.id === Room.myId)), me = st.players.find(p => p.id === Room.myId);
    const myTurn = me && st.phase === 'play' && st.players[st.turn].id === Room.myId;
    const can = myTurn ? Domino2.moves(st, me.hand) : [];
    if (sel && !can.some(m => same(m.t, sel))) sel = null;
    lastCan = can;
    const T = $('#d2-table');
    // ---- os outros em volta da mesa ----
    const pos = n === 2 ? ['', 'top'] : n === 3 ? ['', 'right', 'left'] : ['', 'right', 'top', 'left'];
    // balão rápido do que cada um acabou de fazer
    if (st.ev.n !== sayN) {
      sayN = st.ev.n; const e = st.ev;
      const txt = e.type === 'pass' ? '🚫 passou' : e.type === 'buy' ? 'comprou' : e.type === 'win' ? '🎉 bateu!' : e.type === 'play' && e.f > 1 && e.tile?.[0] === e.tile?.[1] ? '🎯 bucha na mesa!' : e.type === 'play' && e.f === 3 ? '💥 pancada!' : e.type === 'play' && e.f === 2 ? 'bateu na mesa' : '';
      if (txt && e.seat != null) says[e.seat] = { txt, u: Date.now() + 2200 };
    }
    // sinais da dupla: o parceiro lê o recado; os adversários só veem que houve cochicho
    for (const s of st.signals || []) if (s.n > sigN) { sigN = s.n; says[s.seat] = { txt: s.kind ? `🤫 ${Domino2.SIG[s.kind]} ${s.x}` : '🤫 cochichou', u: Date.now() + (s.kind ? 4500 : 2200) }; }
    const sigOf = s => { const g = (st.signals || []).find(x => x.seat === s); return g ? `<em class="d2-sig" title="Sinal da dupla">🤫${g.kind ? ` ${SIGS[g.kind]} ${g.x}` : ''}</em>` : ''; };
    // fim da mão: os pontos na mão de cada um sobem conforme as pedras viram (mesmo ritmo da mesa 3D)
    sumPlan = {};
    if (st.phase !== 'play') {
      if (revealKey !== st.hand) { revealKey = st.hand; revealT0 = Date.now(); }
      const R = Domino2GL.REVEAL, won = st.last && st.last.kind !== 'tranca'; let idx = 0;
      st.players.forEach((p, s) => { sumPlan[s] = p.hand.map(t => ({ at: me && s === mySeat ? 0 : revealT0 + R.base(won) + (idx++) * R.per + R.dur, v: t[0] + t[1] })); });
    }
    const badge = (p, s, cls) => {
      const r = rp(p.id), say = says[s]?.u > Date.now() ? `<div class="d2-say" data-u="${says[s].u}">${says[s].txt}</div>` : '';
      const role = s === mySeat && me ? 'você' : st.teams ? (Domino2.teamOf(st, s) === Domino2.teamOf(st, mySeat) ? 'parceiro' : 'adversário') : '';
      const meta = sumPlan[s]?.length ? `<i class="d2-tic"></i>${p.count} · <span class="d2-sum" data-seat="${s}">✋ <b>0</b> na mão</span>` : `<i class="d2-tic"></i>${p.count}${role ? ` · ${role}` : ''}`;
      return `<div class="d2-opp ${cls} ${st.turn === s && st.phase === 'play' ? 'turn' : ''}" style="--tc:${TEAM[Domino2.teamOf(st, s)]}">
        <div class="d2-who" data-seat="${s}" title="${esc(r.name)} — toque para mandar um emoji"><div class="d2-av">${UI.avatar(r, 34)}</div>
          <div class="d2-info"><b>${esc(r.name)}</b><span>${meta}${sigOf(s)}</span></div></div>${say}
        <div class="d2-row">${p.hand.length && s !== mySeat ? p.hand.map(t => tileSVG(t, 'mini')).join('') : s === mySeat && me ? '' : Array.from({ length: p.count }, () => '<i class="d2-back"></i>').join('')}</div></div>`;
    };
    $('.d2-opps', T).innerHTML = st.players.map((p, s) => (s === mySeat && me ? badge(p, s, 'mine') : badge(p, s, pos[(s - mySeat + n) % n] || 'top'))).join('');
    if (me) $$('.d2-who', T).forEach(b => (b.onclick = e => { e.stopPropagation(); openPop(+b.dataset.seat, b, st, mySeat); }));
    // botão à vista para os emojis (tocar no crachá também abre)
    let eb = $('.d2-emobtn', T); if (me && !eb) { eb = document.createElement('button'); eb.className = 'd2-cam d2-emobtn'; eb.textContent = '😀'; eb.title = 'Mandar emoji (e o sinal secreto pro parceiro)'; T.appendChild(eb); }
    if (eb) { eb.hidden = !me; eb.onclick = e => { e.stopPropagation(); openPop(mySeat, eb, st, mySeat); }; }
    cancelAnimationFrame(sumRaf); sumTick();
    // emoji que alguém mandou: voa de um crachá até o outro
    if (st.emote && st.emote.n !== emoN) { const first = emoN < 0; emoN = st.emote.n; if (!first && st.emote.from != null) flyEmoji(st.emote); }
    // ---- mesa ----
    const { out, endPt } = layout(st);
    let x0 = -8, x1 = 8, y0 = -5, y1 = 5;
    for (const t of out) { const v = Math.abs(t.ang % 180) === 90; x0 = Math.min(x0, t.x - (v ? 1 : 2)); x1 = Math.max(x1, t.x + (v ? 1 : 2)); y0 = Math.min(y0, t.y - (v ? 2 : 1)); y1 = Math.max(y1, t.y + (v ? 2 : 1)); }
    const B = $('.d2-board', T); B.setAttribute('viewBox', `${x0} ${y0} ${x1 - x0} ${y1 - y0}`);
    const fresh = st.ev.type === 'play' && st.ev.n !== popN; popN = st.ev.n;
    const placed = st.ev.type === 'play' ? st.ev.tile : null;
    const ends = sel && st.C ? can.filter(m => same(m.t, sel)).map(m => m.end) : [];
    B.innerHTML = out.map(t => `<g class="d2-tile ${fresh && placed && same([t.a, t.b], placed) ? 'pop' : ''}" transform="translate(${t.x} ${t.y}) rotate(${t.ang})"><g class="d2-in">${tileG(t.a, t.b)}</g></g>`).join('')
      + ends.map(e => `<g class="d2-end" data-end="${e}" transform="translate(${endPt[e].x} ${endPt[e].y})"><circle r=".75"/><text y=".28">＋</text></g>`).join('')
      + (st.C ? '' : `<text class="d2-empty" x="0" y=".3">${st.must ? `Começa a ${st.must[0]}-${st.must[1]}` : 'Mesa limpa'}</text>`);
    $$('.d2-end', B).forEach(g => (g.onclick = () => play(sel, g.dataset.end)));
    // ---- faixa de fim de mão ----
    const L = st.last, ban = $('.d2-banner', T);
    ban.style.transitionDelay = has3d && st.phase !== 'play' && L && L.kind !== 'tranca' ? Math.max(0, revealT0 + Domino2GL.REVEAL.base(true) - 400 - Date.now()) + 'ms' : '0ms'; // no 3D a faixa espera a batida final e o replay
    ban.classList.toggle('on', st.phase !== 'play' && !!L);
    if (L) ban.innerHTML = L.kind === 'tranca' ? `🔒 Mesa trancada${L.pts ? ` — ponto para ${esc(sideName(st, L.side, rp))}` : ' e empatada'}<small>Pontos na mão: ${L.sums.join(' × ')}</small>`
      : `🎉 ${esc(rp(st.players[L.seat].id).name)} bateu: <b>${Domino2.KIND[L.kind]}</b><small>+${L.pts} para ${esc(sideName(st, L.side, rp))}</small>`;
    // ---- minha mão ----
    $('.d2-hand', T).innerHTML = me ? me.hand.map((t, i) => { const ok = can.some(m => same(m.t, t)); return `<button class="d2-ht ${ok ? 'can' : myTurn ? 'no' : ''} ${sel && same(sel, t) ? 'sel' : ''}" data-i="${i}" ${ok ? '' : 'tabindex="-1"'}>${tileSVG(t)}</button>`; }).join('') : '';
    $$('.d2-ht.can', T).forEach(b => (b.onclick = () => pick(me.hand[+b.dataset.i], can)));
    if (has3d) Domino2GL.sync(st, { mySeat: me ? mySeat : -1, can, sel, myTurn });
    $('.d2-hint', T).textContent = !me ? '👀 Você está assistindo.' : st.phase !== 'play' ? (st.result ? '' : 'Próxima mão em instantes…')
      : !myTurn ? `Vez de ${rp(st.players[st.turn].id).name}…` : sel ? (has3d ? 'Toque na ponta que brilha onde quer encaixar.' : 'Toque no ＋ da ponta onde quer encaixar.')
      : can.length ? (has3d ? 'Sua vez: arraste a pedra até a ponta. Solte rápido (ou segure parado em cima) para bater!' : st.C ? 'Sua vez: toque numa pedra que encaixa.' : 'Sua vez: comece a mesa.') : st.pile.count ? 'Nenhuma pedra encaixa: compre do monte.' : 'Nenhuma pedra encaixa: passe a vez.';
    $('.d2-bar', T).innerHTML = myTurn && !can.length ? (st.pile.count ? `<button class="btn primary" id="d2-buy">Comprar (${st.pile.count})</button>` : '<button class="btn primary" id="d2-pass">Passar</button>') : '';
    $('#d2-buy', T) && ($('#d2-buy', T).onclick = () => act({ type: 'buy' }));
    $('#d2-pass', T) && ($('#d2-pass', T).onclick = () => act({ type: 'pass' }));
    T.classList.toggle('myturn', !!myTurn);
    sounds(st);
    renderSide(room, st, rp);
    clearInterval(timerIv); timerIv = setInterval(() => tick(view(Room.room || room)), 250); tick(st);
    if (st.result && resultShown !== st.gameId) { resultShown = st.gameId; UI.recordResult(st, room); setTimeout(() => showResult(room, st, rp), Domino2GL.REVEAL.base(true) + 3200); } // espera o replay e as pedras virarem
  }
  const sideName = (st, k, rp) => (st.teams ? `Dupla ${k + 1}` : rp(st.players[k].id).name);

  function pick(t, can) {
    const ms = can.filter(m => same(m.t, t));
    // uma ponta só (ou as duas pedem o mesmo número): joga direto
    if (ms.length === 1 || ms.every(m => m.end === ms[0].end)) return play(t, ms[0].end);
    const st = view(Room.room), [l, r] = Domino2.ends(st);
    if (l === r) return play(t, 'R');
    sel = sel && same(sel, t) ? null : t; SFX.click(); render(Room.room);
  }
  function play(t, end, f = 1) { if (!t) return; sel = null; act({ type: 'play', tile: t, end, f }); }

  function sounds(st) {
    if (st.ev.n === seenEv) return; seenEv = st.ev.n;
    const e = st.ev;
    if (e.type === 'play') { if (!has3d) SFX.flip(); } // no 3D o som sai quando a pedra assenta
    else if (e.type === 'buy') { if (!has3d) SFX.click(); }
    else if (e.type === 'win' || e.type === 'gameover') SFX.coinShower();
    else if (e.type === 'tranca') SFX.coinDown();
  }
  function tick(st) {
    const bar = $('#d2-timer'); if (!bar) return;
    bar.parentElement.classList.toggle('off', !st?.deadline || !!st?.result); if (!st?.deadline) return;
    const total = st.phase === 'play' ? Domino2.TURN_MS : Domino2.END_MS, left = Math.max(0, st.deadline - Room.now());
    const low = st.phase === 'play' && left < 8000; bar.style.width = Math.min(100, 100 * left / total) + '%'; bar.classList.toggle('low', low);
    // anel do tempo em volta do avatar de quem está na vez; balões vencidos somem
    $$('.d2-opp .d2-av').forEach(a => { const on = a.closest('.turn'); a.style.setProperty('--p', on ? Math.min(1, left / total) : 1); a.classList.toggle('low', !!on && low); });
    $$('.d2-say').forEach(e => { if (+e.dataset.u < Date.now()) e.remove(); });
  }

  // ---------- painel lateral ----------
  function renderSide(room, st, rp) {
    const S = $('#game-side');
    const keep = $('.chat-form input', S)?.value || '', focus = document.activeElement?.closest('#game-side .chat-form');
    const sides = st.score.map((v, k) => {
      const who = st.players.filter((_, s) => Domino2.teamOf(st, s) === k).map(p => esc(rp(p.id).name)).join(' + ');
      return `<div class="d2-score" style="--tc:${TEAM[k]}"><b>${v}</b><span>${st.teams ? `Dupla ${k + 1}<small>${who}</small>` : who}</span></div>`;
    }).join('');
    S.innerHTML = `
      <div class="card cj-status"><h3>🎲 Dominó 2</h3>
        <div class="bankline"><span>Mão ${st.hand}</span><span>🎯 ${st.goal} pontos</span>${st.teams ? '' : `<span>Monte: ${st.pile.count}</span>`}<a id="d2-rules">📖 Regras</a><a id="btn-mute">${SFX.isMuted() ? '🔇' : '🔊'} Som</a><a id="d2-amb" title="Barulho de bar, fumaça e a luminária balançando">${ambOn ? '🍺' : '🔕'} Ambiente</a></div>
        <div class="d2-scores">${sides}</div></div>
      <div class="card logcard">
        <div class="tabs">${[['log', 'Registro'], ['chat', 'Chat'], ['stats', '📊']].map(([k, t]) => `<button data-lt="${k}" class="${logTab === k ? 'on' : ''}"${k === 'stats' ? ' title="Estatísticas da partida"' : ''}>${t}</button>`).join('')}</div>
        ${logTab === 'log' ? `<div class="chat-box log">${st.log.map(l => `<div class="msg">${esc(l.msg)}</div>`).join('')}</div>`
        : logTab === 'stats' ? statsHTML(st, rp)
        : `<div class="chat-box">${UI.chatHTML(room)}</div><form class="chat-form"><input placeholder="Mensagem…" maxlength="300"><button class="btn">➤</button></form>`}
      </div>
      <button class="btn ghost" id="d2-leave">🚪 Sair da partida</button>`;
    if (logTab === 'chat') { const i = $('.chat-form input', S); i.value = keep; if (focus) i.focus(); }
    $$('.chat-box', S).forEach(b => (b.scrollTop = b.scrollHeight));
    UI.bindChat(S);
    $$('[data-lt]', S).forEach(b => (b.onclick = () => { logTab = b.dataset.lt; render(Room.room); }));
    $('#d2-rules', S).onclick = rulesModal;
    $('#btn-mute', S).onclick = () => { SFX.setMuted(!SFX.isMuted()); render(Room.room); };
    $('#d2-amb', S).onclick = () => { ambOn = !ambOn; try { localStorage.setItem('d2-amb', ambOn ? '1' : '0'); } catch {} Domino2SFX.unlock(); Domino2SFX.ambience(ambOn); if (has3d) Domino2GL.setAmbient(ambOn); render(Room.room); };
    $('#d2-leave', S).onclick = () => { if (UI.confirmLeave()) { reset(); UI.leaveToHub(); } };
  }
  // ---------- estatísticas ----------
  const STATS = [['batidas', '🎉', 'Batidas'], ['pancadas', '💥', 'Pancadas'], ['bateuMesa', '👊', 'Bateu na mesa'], ['carrocas', '🎲', 'Carroças jogadas'],
    ['laelo', '↔️', 'Lá e lô'], ['cruzadas', '✖️', 'Cruzadas'], ['compras', '🫴', 'Compras'], ['passes', '🚫', 'Passes']];
  function statsHTML(st, rp) {
    const cols = STATS.filter(([k]) => k !== 'compras' || !st.teams);
    return `<div class="chat-box d2-stats"><table><tr><th></th>${cols.map(([, i, t]) => `<th title="${t}">${i}</th>`).join('')}</tr>
      ${st.players.map((p, s) => `<tr style="--tc:${TEAM[Domino2.teamOf(st, s)]}"><td>${esc(rp(p.id).name)}</td>${cols.map(([k]) => `<td>${st.stats?.[s]?.[k] || 0}</td>`).join('')}</tr>`).join('')}</table>
      <p class="muted">${cols.map(([, i, t]) => `${i} ${t}`).join(' · ')}</p></div>`;
  }
  function awards(st, rp) { // destaques da partida para a tela final
    const best = (k, t) => { const v = st.stats.map(x => x[k]), m = Math.max(...v); if (!m) return ''; const who = st.players.filter((_, s) => v[s] === m).map(p => esc(rp(p.id).name)).join(' e '); return `<li>${t}: <b>${who}</b> (${m})</li>`; };
    return st.stats ? `<ul class="d2-awards">${best('batidas', '🎉 Mais batidas')}${best('pancadas', '💥 Rei da pancada')}${best('bateuMesa', '👊 Mão pesada')}${best('carrocas', '🎲 Carroceiro')}${best('laelo', '↔️ Lá e lô')}${best('cruzadas', '✖️ Cruzada')}</ul>` : '';
  }
  function rulesModal() {
    const m = UI.modal(`<h2>🎲 Regras do dominó</h2><ul class="rules">
      <li>28 pedras, 7 para cada um. Com 4 jogadores é em <b>duplas</b> (quem está na sua frente é seu parceiro) e não tem monte.</li>
      <li>Com 2 ou 3 jogadores, cada um joga por si e quem não tem pedra que encaixa <b>compra do monte</b>.</li>
      <li>Na primeira mão começa quem tem a maior carroça. Depois, quem bateu começa com qualquer pedra.</li>
      <li>Batidas: simples <b>1</b>, carroça <b>2</b>, lá e lô <b>3</b> (a última pedra cabia nas duas pontas), cruzada <b>4</b> (carroça que cabia nas duas).</li>
      <li>Mesa trancada: quem tem menos pontos na mão leva <b>1</b>. Empate, ninguém pontua.</li>
      <li>Em dupla, toque no seu crachá para dar um <b>sinal secreto</b> ao parceiro (um por mão): os adversários só veem que você cochichou. Toque no crachá de alguém para mandar um emoji.</li>
      <li>Ganha quem fizer <b>${Domino2.GOAL}</b> pontos. Cada vez tem 30 segundos.</li></ul>
      <button class="btn primary" id="d2-rules-ok">Entendi</button>`);
    $('#d2-rules-ok', m).onclick = UI.closeModal;
  }
  function showResult(room, st, rp) {
    const w = rp(st.result.winner);
    const m = UI.modal(`<div class="result">
      <div class="confetti">${Array.from({ length: 40 }, (_, k) => `<i style="--x:${Math.random() * 100}%;--d:${Math.random() * 2}s;--h:${k * 37 % 360}"></i>`).join('')}</div>
      ${UI.avatar(w, 150)}<h1>${esc(sideName(st, st.result.side, rp))} venceu o dominó!</h1>
      <ol class="final">${st.score.map((v, k) => [v, k]).sort((a, b) => b[0] - a[0]).map(([v, k]) => `<li><b>${esc(sideName(st, k, rp))}</b><span>${v} pts</span></li>`).join('')}</ol>
      ${awards(st, rp)}
      ${Room.isHost ? '<button class="btn primary big" id="back-lobby">Voltar para a sala</button>' : '<p class="muted">Aguardando o anfitrião voltar para a sala…</p>'}
      <button class="btn ghost" id="res-close">Ver a mesa</button></div>`, { wide: true });
    $('#back-lobby', m) && ($('#back-lobby', m).onclick = () => { UI.closeModal(); Room.send({ t: 'lobby' }); });
    $('#res-close', m).onclick = UI.closeModal;
  }
  function reset() { built = null; resultShown = null; sel = null; clearInterval(timerIv); closePop(); Domino2GL.show(false); Domino2SFX.ambience(false); }

  return { render, reset, layout };
})();
