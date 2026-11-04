// ===== Conjura — mesa, cartas e painéis =====
const ConjuraUI = (() => {
  const ART = r => IMG['conj_' + r];
  const R = Conjura.ROLES, A = Conjura.ACTIONS;
  let built = null, seenEv = 0, resultShown = null, logTab = 'log', picking = null, keepSel = [], timerIv = null;

  // ---------- carta ----------
  function cardHTML(role, { up = false, small = false, cls = '', data = '' } = {}) {
    if (!role) return `<div class="cj-card back ${small ? 'sm' : ''} ${cls}" ${data}><div class="cj-art" style="background-image:url(${ART('rei')})"></div><div class="cj-backname">CONJURA</div></div>`;
    const r = R[role];
    return `<div class="cj-card r-${role} ${up ? 'up' : ''} ${small ? 'sm' : ''} ${cls}" ${data}>
      <div class="cj-art" style="background-image:url(${ART(role)})"></div>
      <div class="cj-name">${esc(r.name)}</div>
      ${small ? '' : `<div class="cj-text">${r.act !== '—' ? `<p>⚡ ${esc(r.act)}</p>` : ''}${r.block ? `<p>🛡️ ${esc(r.block)}</p>` : ''}</div>`}
      ${up ? '<div class="cj-dead">REVELADA</div>' : ''}</div>`;
  }

  // ---------- mesa ----------
  function build() {
    const wrap = $('#board-wrap');
    let el = $('#conj-table');
    if (!el) { el = document.createElement('div'); el.id = 'conj-table'; wrap.appendChild(el); }
    el.innerHTML = '<div class="ct-felt"><div class="ct-center"></div><div class="ct-seats"></div></div><div class="ct-hand"></div>';
    el.onclick = e => {
      const seat = e.target.closest('.ct-seat.pickable'); if (seat && picking) { chooseTarget(seat.dataset.pid); return; }
      const mine = e.target.closest('.ct-hand .cj-card.pickable'); if (mine) clickMyCard(+mine.dataset.idx);
    };
  }

  function seatPos(i, n) { // eu embaixo; os outros em volta, no sentido horário
    const a = Math.PI / 2 + (i / n) * Math.PI * 2;
    return { x: 50 + Math.cos(a) * 41, y: 52 + Math.sin(a) * 33 };
  }

  function view(room) { // anfitrião tem o estado completo: usa a mesma visão que os outros recebem
    return Room.isHost ? Conjura.viewFor(room.state, Room.myId) : room.state;
  }

  function render(room) {
    if (!room.state) return;
    const st = view(room);
    UI.show('scr-game');
    if (built !== st.gameId) { build(); built = st.gameId; seenEv = st.ev.n; picking = null; keepSel = []; }
    const rp = id => room.players.find(p => p.id === id) || { name: id, char: 'vitoria' };
    const me = st.players.find(p => p.id === Room.myId);
    const n = st.players.length, myIdx = Math.max(0, st.players.findIndex(p => p.id === Room.myId));
    const cur = st.players[st.turn];

    // assentos
    $('#conj-table .ct-seats').innerHTML = st.players.map((p, k) => {
      const rel = (k - myIdx + n) % n, pos = seatPos(rel, n), r = rp(p.id);
      const isCur = p.id === cur.id && !st.result;
      const respond = st.phase === 'respond' && Conjura.responders(st).includes(p.id);
      const pickable = picking && !p.out && p.id !== Room.myId;
      return `<div class="ct-seat ${isCur ? 'cur' : ''} ${p.out ? 'out' : ''} ${respond ? 'thinking' : ''} ${pickable ? 'pickable' : ''} ${p.id === Room.myId ? 'me' : ''}" data-pid="${esc(p.id)}" style="left:${pos.x}%;top:${pos.y}%">
        <div class="ct-bubble" data-b="${esc(p.id)}"></div>
        ${UI.avatar(r, 52)}<b class="ct-name">${esc(r.name)}${r.bot ? ' 🤖' : ''}</b>
        <div class="ct-coins" title="Moedas">🪙 ${p.coins}</div>
        <div class="ct-cards">${p.cards.map(c => (c.up ? cardHTML(c.role, { up: true, small: true }) : cardHTML(null, { small: true }))).join('')}</div>
      </div>`;
    }).join('');

    // centro: Corte, último anúncio
    const last = [...st.log].reverse().find(l => /🎭|▶️|🛡️|⚔️|💥|🗡️/.test(l.msg));
    $('#conj-table .ct-center').innerHTML = `<div class="ct-deck">${cardHTML(null, { small: true })}<span>Corte · ${st.deck.count ?? st.deck.length}</span></div>
      <div class="ct-treasury">🪙<span>Tesouro</span></div>
      <div class="ct-say">${last ? esc(last.msg) : ''}</div>`;

    // minha mão
    $('#conj-table .ct-hand').innerHTML = me ? me.cards.map((c, i) => {
      const pickable = (st.phase === 'lose' && st.lose?.pid === Room.myId && !c.up) || (st.phase === 'investigate' && st.inv?.target === Room.myId && st.inv.stage === 'show' && !c.up);
      return cardHTML(c.role, { up: c.up, cls: pickable ? 'pickable' : '', data: `data-idx="${i}"` });
    }).join('') : '<p class="muted">Você está assistindo.</p>';

    playEvents(room, st, rp);
    renderSide(room, st, rp, me);
    tickTimer(st);
    clearInterval(timerIv); timerIv = setInterval(() => tickTimer(view(Room.room || room)), 250);

    if (st.result && resultShown !== st.gameId) { resultShown = st.gameId; UI.recordResult(st, room); setTimeout(() => showResult(room, st, rp), 1200); }
  }

  // ---------- eventos: balões, sons ----------
  function bubble(pid, html, cls = '') {
    const b = $(`#conj-table .ct-bubble[data-b="${CSS.escape(pid)}"]`); if (!b) return;
    b.innerHTML = html; b.className = 'ct-bubble on ' + cls; clearTimeout(b._t); b._t = setTimeout(() => b.classList.remove('on'), 2800);
  }
  function seatFx(pid, cls) { const s = $(`#conj-table .ct-seat[data-pid="${CSS.escape(pid)}"]`); if (!s) return; s.classList.remove(cls); void s.offsetWidth; s.classList.add(cls); }
  function playEvents(room, st, rp) {
    const fresh = st.evs.filter(e => e.n > seenEv); seenEv = st.ev.n;
    for (const e of fresh) {
      switch (e.type) {
        case 'declare': bubble(e.pid, e.claim ? `🎭 Sou <b>${esc(R[e.claim].name)}</b>!<br><small>${esc(A[e.action].name)}${e.target ? ' → ' + esc(rp(e.target).name) : ''}</small>` : `${esc(A[e.action].name)}${e.target ? ' → ' + esc(rp(e.target).name) : ''}`); SFX.card(); break;
        case 'block': bubble(e.pid, `🛡️ Bloqueio!<br><small>como ${esc(R[e.role].name)}</small>`, 'block'); SFX.gavel(); break;
        case 'challenge':
          bubble(e.challenger, '⚔️ Duvido!', 'challenge'); SFX.gavel();
          setTimeout(() => { bubble(e.claimant, e.truth ? `✅ Era verdade!<br><small>${esc(R[e.role].name)}</small>` : '🤥 Era blefe!', e.truth ? 'truth' : 'lie'); (e.truth ? SFX.deal : SFX.coinDown)(); }, 900);
          if (e.truth && e.claimant === Room.myId && e.newRole) setTimeout(() => UI.toast(`Sua carta voltou à Corte e você comprou: ${R[e.newRole].name}.`, 'ok'), 1400);
          break;
        case 'lose': seatFx(e.pid, 'hit'); SFX.flip(); break;
        case 'coins': SFX.coinUp(); seatFx(e.pid, 'gain'); break;
        case 'steal': SFX.coinUp(); seatFx(e.pid, 'gain'); seatFx(e.from, 'hit'); break;
        case 'coup': case 'assassinated': SFX.gavel(); seatFx(e.target || e.pid, 'hit'); break;
        case 'blocked': SFX.coinDown(); break;
        case 'exiled': SFX.bankrupt(); break;
        case 'turn': if (e.pid === Room.myId) SFX.turnMine(); break;
        case 'win': SFX.win(); break;
      }
    }
  }

  function tickTimer(st) {
    const bar = $('#cj-timer'); if (!bar || !st?.deadline) return;
    const total = st.phase === 'respond' ? st.respondMs : st.respondMs * 2;
    const left = Math.max(0, st.deadline - Room.now());
    bar.style.width = (100 * left / total) + '%'; bar.classList.toggle('low', left < 4000);
    const s = $('#cj-secs'); if (s) s.textContent = Math.ceil(left / 1000) + 's';
  }

  // ---------- painel lateral ----------
  const act = a => Room.send({ t: 'act', a });
  function chooseTarget(pid) { const p = picking; picking = null; act({ type: 'action', action: p, target: pid }); }
  function clickMyCard(idx) {
    const st = view(Room.room);
    if (st.phase === 'lose') act({ type: 'lose', idx });
    else if (st.phase === 'investigate') act({ type: 'show', idx });
  }

  function renderSide(room, st, rp, me) {
    const S = $('#game-side');
    const keepChat = $('.chat-form input', S)?.value || '', hadFocus = document.activeElement?.closest('#game-side .chat-form');
    const cur = st.players[st.turn], myTurn = me && !me.out && cur.id === Room.myId && st.phase === 'action' && !st.result;
    const timer = st.deadline ? '<div class="cj-tbar"><i id="cj-timer"></i></div><small class="muted" id="cj-secs"></small>' : '';
    let panel = '';
    const P = st.P;
    const desc = P ? `${esc(rp(P.actor).name)}${P.claim ? ` diz ser <b>${esc(R[P.claim].name)}</b>:` : ':'} <b>${esc(A[P.type].name)}</b>${P.target ? ` contra <b>${esc(rp(P.target).name)}</b>` : ''}` : '';

    if (st.result) panel = `<p><b>${esc(rp(st.result.winner).name)}</b> domina a corte! 👑</p>`;
    else if (!me || me.out) panel = `<p class="muted">${me ? 'Você foi exilado. ' : ''}Acompanhe a corte…</p>`;
    else if (myTurn) {
      const forced = me.coins >= 10, mine = new Set(me.cards.filter(c => !c.up).map(c => c.role));
      if (picking) {
        panel = `<div class="offer">Escolha o alvo de <b>${esc(A[picking].name)}</b> (clique num jogador na mesa ou aqui):</div>
          <div class="cj-targets">${st.players.filter(p => !p.out && p.id !== Room.myId).map(p => `<button class="btn small" data-tg="${esc(p.id)}">${esc(rp(p.id).name)} · 🪙${p.coins}</button>`).join('')}</div>
          <button class="btn ghost small" id="cj-cancel">Cancelar</button>`;
      } else {
        const list = ['income', 'aid', 'coup', 'tax', 'assassinate', 'steal', ...(st.variant === 'confessor' ? ['exchange1', 'investigate'] : ['exchange'])];
        panel = `<p class="cj-yt">🎲 Sua vez — escolha <b>uma</b> ação${forced ? '. <b>Com 10+ moedas, o Golpe é obrigatório.</b>' : ':'}</p><div class="cj-actions">${list.map(k => {
          const d = A[k], can = me.coins >= d.cost && (!forced || k === 'coup');
          const tag = d.claim ? `<span class="cj-claim ${mine.has(d.claim) ? 'true' : 'bluff'}">${esc(R[d.claim].name)}${mine.has(d.claim) ? '' : ' · blefe'}</span>` : '<span class="cj-claim gen">geral</span>';
          const hint = { income: '+1', aid: '+2', coup: '−7, rival perde 1', tax: '+3', assassinate: '−3, rival perde 1', steal: 'toma 2', exchange: 'troca 2', exchange1: 'troca 1', investigate: 'espia 1' }[k];
          return `<button class="btn small cj-act" data-ac="${k}" ${can ? '' : 'disabled'}><b>${esc(d.name)}</b><small>${hint}</small>${tag}</button>`;
        }).join('')}</div>`;
      }
    } else if (st.phase === 'respond') {
      const o = Conjura.options(st, Room.myId);
      const stageTxt = P.stage === 'blockClaim' ? `${esc(rp(P.block.by).name)} diz ser <b>${esc(R[P.block.claim].name)}</b> e <b>bloqueia</b>. Contestar o bloqueio?` : desc;
      if (o.challenge || o.block.length) {
        panel = `<div class="offer">${stageTxt}</div>${timer}<div class="cj-resp">
          ${o.challenge ? '<button class="btn primary" data-rs="challenge">⚔️ Contestar (duvido!)</button>' : ''}
          ${o.block.map(r => `<button class="btn gold" data-rs="block" data-role="${r}">🛡️ Bloquear como ${esc(R[r].name)}${me.cards.some(c => !c.up && c.role === r) ? '' : ' (blefe)'}</button>`).join('')}
          <button class="btn" data-rs="pass">Deixar passar</button></div>`;
      } else panel = `<div class="offer">${stageTxt}</div>${timer}<p class="muted small">Aguardando os outros reagirem…</p>`;
    } else if (st.phase === 'lose') {
      panel = st.lose.pid === Room.myId
        ? `<div class="offer warn">Você perdeu uma influência (${esc(st.lose.reason)}). <b>Clique na carta da sua mão</b> que vai revelar.</div>${timer}`
        : `<p class="muted">${esc(rp(st.lose.pid).name)} está escolhendo qual influência perder…</p>${timer}`;
    } else if (st.phase === 'exchange') {
      if (st.exch.pid === Room.myId) {
        panel = `<div class="offer">Troca com a Corte: escolha <b>${st.exch.keep}</b> carta${st.exch.keep > 1 ? 's' : ''} para ficar. As outras voltam embaralhadas.</div>${timer}
          <div class="cj-exch">${st.exch.options.map((r, i) => `<div class="cj-pick ${keepSel.includes(i) ? 'sel' : ''}" data-kp="${i}">${cardHTML(r, { small: true })}</div>`).join('')}</div>
          <button class="btn primary" id="cj-keep" ${keepSel.length === st.exch.keep ? '' : 'disabled'}>Ficar com estas</button>`;
      } else panel = `<p class="muted">${esc(rp(st.exch.pid).name)} está trocando cartas com a Corte…</p>${timer}`;
    } else if (st.phase === 'investigate') {
      const I = st.inv;
      if (I.target === Room.myId && I.stage === 'show') panel = `<div class="offer">${esc(rp(I.by).name)} está te investigando. <b>Clique numa carta da sua mão</b> para mostrar a ele.</div>${timer}`;
      else if (I.by === Room.myId && I.stage === 'decide') panel = `<div class="offer">${esc(rp(I.target).name)} te mostrou:</div><div class="cj-exch">${cardHTML(I.role, { small: true })}</div>${timer}
          <div class="cj-resp"><button class="btn" data-vd="0">🤝 Devolver</button><button class="btn primary" data-vd="1">🔁 Obrigar a trocar</button></div>`;
      else panel = `<p class="muted">${esc(rp(I.by).name)} investiga ${esc(rp(I.target).name)}…</p>${timer}`;
    } else panel = `<p class="muted">Vez de <b>${esc(rp(cur.id).name)}</b>…</p>`;

    S.innerHTML = `
      <div class="card cj-status"><h3>🏰 Conjura</h3>
        <div class="bankline"><span>🃏 Corte: ${st.deck.count ?? st.deck.length}</span><span>${st.variant === 'confessor' ? '⛪ com Confessor' : '📜 com Diplomata'}</span><a id="cj-help">📜 Ajuda</a><a id="cj-rules">📖 Regras</a><a id="btn-mute">${SFX.isMuted() ? '🔇' : '🔊'} Som</a></div></div>
      <div class="card actions cj-panel">${panel}</div>
      <div class="card logcard">
        <div class="tabs"><button data-lt="log" class="${logTab === 'log' ? 'on' : ''}">Registro</button><button data-lt="chat" class="${logTab === 'chat' ? 'on' : ''}">Chat</button></div>
        ${logTab === 'log' ? `<div class="chat-box log">${st.log.map(l => `<div class="msg">${esc(l.msg)}</div>`).join('')}</div>`
        : `<div class="chat-box">${UI.chatHTML(room)}</div><form class="chat-form"><input placeholder="Negocie, ameace, minta…" maxlength="300"><button class="btn">➤</button></form>`}
      </div>
      <button class="btn ghost small" id="game-leave">Sair da partida</button>`;
    if (logTab === 'chat') { const i = $('.chat-form input', S); i.value = keepChat; if (hadFocus) i.focus(); }
    $$('.chat-box', S).forEach(b => (b.scrollTop = b.scrollHeight));
    UI.bindChat(S);
    $$('[data-lt]', S).forEach(b => (b.onclick = () => { logTab = b.dataset.lt; renderSide(room, st, rp, me); }));
    $$('[data-ac]', S).forEach(b => (b.onclick = () => { const k = b.dataset.ac; if (A[k].target) { picking = k; render(Room.room); } else act({ type: 'action', action: k }); }));
    $$('[data-tg]', S).forEach(b => (b.onclick = () => chooseTarget(b.dataset.tg)));
    $('#cj-cancel', S) && ($('#cj-cancel', S).onclick = () => { picking = null; render(Room.room); });
    $$('[data-rs]', S).forEach(b => (b.onclick = () => { $$('[data-rs]', S).forEach(x => (x.disabled = true)); act(b.dataset.rs === 'block' ? { type: 'block', role: b.dataset.role } : { type: b.dataset.rs }); }));
    $$('[data-kp]', S).forEach(b => (b.onclick = () => { const i = +b.dataset.kp; keepSel = keepSel.includes(i) ? keepSel.filter(x => x !== i) : [...keepSel, i].slice(-st.exch.keep); renderSide(room, st, rp, me); }));
    $('#cj-keep', S) && ($('#cj-keep', S).onclick = () => { act({ type: 'keep', idx: keepSel }); keepSel = []; });
    $$('[data-vd]', S).forEach(b => (b.onclick = () => act({ type: 'verdict', swap: b.dataset.vd === '1' })));
    $('#cj-rules', S).onclick = rulesModal;
    $('#cj-help', S).onclick = () => helpModal(st);
    $('#btn-mute', S).onclick = e => { SFX.setMuted(!SFX.isMuted()); e.target.textContent = (SFX.isMuted() ? '🔇' : '🔊') + ' Som'; };
    $('#game-leave', S).onclick = () => { if (confirm(Room.isHost ? 'Você é o anfitrião: sair encerra a partida para todos. Sair?' : 'Sair da partida? Um bot jogará por você até você voltar.')) { built = null; clearInterval(timerIv); UI.leaveToHub(); } };
    if (st.phase !== 'exchange') keepSel = [];
  }

  // ---------- carta de ajuda (O Escriba) e regras ----------
  function helpModal(st) {
    const roles = Conjura.roleSet ? ['tesoureiro', 'sicario', 'corsario', st?.variant === 'confessor' ? 'confessor' : 'diplomata', 'guarda'] : [];
    UI.modal(`<div class="cj-help"><div class="cj-help-art" style="background-image:url(${ART('escriba')})"><span>O Escriba</span></div>
      <div><h2>📜 Resumo das ações</h2>
      <table class="cj-ref"><tr><th>Ação</th><th>Quem</th><th>Efeito</th><th>Bloqueio</th></tr>
        <tr><td>Renda</td><td>todos</td><td>+1 moeda</td><td>—</td></tr>
        <tr><td>Ajuda Externa</td><td>todos</td><td>+2 moedas</td><td>Tesoureiro</td></tr>
        <tr><td>Golpe</td><td>todos</td><td>paga 7; rival perde 1 influência</td><td>não pode</td></tr>
        <tr><td>Cobrar impostos</td><td>Tesoureiro</td><td>+3 moedas</td><td>—</td></tr>
        <tr><td>Assassinar</td><td>Sicário</td><td>paga 3; rival perde 1 influência</td><td>Guarda-Real (do alvo)</td></tr>
        <tr><td>Extorquir</td><td>Corsário</td><td>toma 2 moedas de um rival</td><td>Corsário ou ${st?.variant === 'confessor' ? 'Confessor' : 'Diplomata'} (do alvo)</td></tr>
        ${st?.variant === 'confessor' ? '<tr><td>Trocar (1)</td><td>Confessor</td><td>compra 1 da Corte, fica com o que quiser, devolve 1</td><td>—</td></tr><tr><td>Investigar</td><td>Confessor</td><td>o rival mostra 1 carta; você devolve ou obriga a trocar</td><td>—</td></tr>'
        : '<tr><td>Trocar</td><td>Diplomata</td><td>compra 2 da Corte, fica com as que quiser, devolve 2</td><td>—</td></tr>'}
      </table><div class="cj-roles">${roles.map(r => cardHTML(r, { small: false })).join('')}</div></div></div>`, { wide: true });
  }
  function rulesModal() {
    UI.modal(`<h2>📖 Regras do Conjura</h2><ul class="rules-list small">
      <li><b>Objetivo:</b> ser a última família na corte. Cada jogador começa com <b>2 cartas</b> viradas (suas influências) e <b>2 moedas</b> (com 2 jogadores, 1 moeda).</li>
      <li><b>Turno:</b> faça exatamente <b>uma</b> ação; não dá para passar. Começando a vez com <b>10+ moedas</b>, o Golpe é obrigatório.</li>
      <li><b>Personagens:</b> para usar uma ação de personagem basta <b>dizer</b> que tem a carta — pode ser verdade ou blefe.</li>
      <li><b>Contestar:</b> qualquer jogador pode duvidar de uma ação ou bloqueio de personagem. Se o contestado tiver a carta, ele a mostra, devolve à Corte, embaralha e compra outra — e <b>quem contestou perde uma influência</b>. Se não tiver, <b>ele</b> perde uma influência e a ação falha (moedas pagas voltam).</li>
      <li><b>Bloquear:</b> também é dizer que tem um personagem (e também pode ser contestado). Ação bloqueada falha, e o que foi pago <b>não volta</b>.</li>
      <li><b>Perder influência:</b> você escolhe qual das suas cartas revelar. Sem cartas viradas, você é exilado e suas moedas voltam ao Tesouro.</li>
      <li><b>Perigo duplo:</b> contra um assassinato, se você contestar e perder (ou blefar o Guarda-Real e for pego), perde duas influências no mesmo turno.</li>
      <li><b>Negociação:</b> pode prometer e ameaçar no chat, mas nada vale como acordo, e ninguém pode mostrar cartas nem dar moedas.</li>
      <li><b>Baralho da Corte:</b> 3 cópias de cada personagem (4 com 7–8 jogadores, 5 com 9–10). O vencedor da última partida começa a próxima.</li>
      <li><b>Variante Confessor:</b> o anfitrião pode trocar o Diplomata pelo Confessor (trocar 1 carta, ou investigar a carta de um rival; também bloqueia extorsão).</li>
      <li><b>Tempo:</b> as janelas de reação têm tempo limite; quem não responder deixa passar.</li></ul>`, { wide: true });
  }

  function showResult(room, st, rp) {
    const w = rp(st.result.winner);
    const m = UI.modal(`<div class="result">
      <div class="confetti">${Array.from({ length: 40 }, (_, k) => `<i style="--x:${Math.random() * 100}%;--d:${Math.random() * 2}s;--h:${k * 37 % 360}"></i>`).join('')}</div>
      ${UI.avatar(w, 150)}<h1>${esc(w.name)} domina a corte!</h1><blockquote>“${esc(w.catchphrase || '')}”</blockquote>
      <ol class="final">${st.result.ranking.map((r, i) => `<li>${UI.avatar(rp(r.id), 32)}<b>${esc(rp(r.id).name)}</b><span>${i === 0 ? '👑' : 'exilado'}</span></li>`).join('')}</ol>
      ${Room.isHost ? '<button class="btn primary big" id="back-lobby">Voltar para a sala</button>' : '<p class="muted">Aguardando o anfitrião voltar para a sala…</p>'}
      <button class="btn ghost" id="res-close">Ver a mesa</button></div>`, { wide: true });
    $('#back-lobby', m) && ($('#back-lobby', m).onclick = () => { UI.closeModal(); Room.send({ t: 'lobby' }); });
    $('#res-close', m).onclick = UI.closeModal;
  }

  return { render, cardHTML, reset: () => { built = null; resultShown = null; clearInterval(timerIv); } };
})();
