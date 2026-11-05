// ===== Vida Adulta — HUD sobre o tabuleiro 3D, decisões, apostas, carteira e regras =====
const VidaUI = (() => {
  let built = null, seenEv = 0, drawer = false, logTab = 'log', chatSeen = 0, resultShown = null, timerIv = null, has3d = false, betNums = [], betAmt = 4000, sorteNums = [], magNum = null, carIns = true, wallet = false;
  const P = VIDA_PRICES, SP = VIDA_BOARD.spaces, M = n => Vida.money(n);
  const view = room => (Room.isHost ? Vida.viewFor(room.state, Room.myId) : room.state);
  const act = a => Room.send({ t: 'act', a });
  const rp = (room, id) => room.players.find(p => p.id === id) || { name: id, char: 'vitoria' };
  const charOf = (room, id) => { const r = rp(room, id); return vidaCharById(r.general) || null; };
  const face = (room, id, size = 34) => { const c = charOf(room, id); return c ? `<img class="wgen" src="${c.thumb}" alt="" style="--s:${size}px">` : UI.avatar(rp(room, id), size); };
  const WHEEL = ['#e5484d', '#f76b15', '#ffc53d', '#46a758', '#12a594', '#3e63dd', '#8e4ec6', '#e93d82', '#2b2b30', '#f2efe6'];

  function build() {
    const wrapEl = $('#board-wrap');
    let el = $('#vida-table'); if (!el) { el = document.createElement('div'); el.id = 'vida-table'; wrapEl.appendChild(el); }
    el.innerHTML = `<div class="cah-tbar"><i id="vida-timer"></i></div>
      <div class="war-top vida-top"><div class="war-seats"></div><div class="war-banner"></div></div>
      <div class="cah-tools war-tools"></div><div class="cah-drawer war-drawer"></div>
      <div class="vida-panel"></div><div class="war-bar vida-bar"></div><div class="war-hint"></div><div class="war-tip"></div><div class="vida-spin"></div>`;
    has3d = Vida3D.supported() && Vida3D.mount(el, {
      info: id => { const r = rp(Room.room, id), c = vidaCharById(r.general); return { color: r.color, img: c ? c.thumb : charById(r.char).img }; },
      hover: (node, e) => tip(node, e),
      spinStart: e => spinBadge(e, false), spinEnd: e => spinBadge(e, true),
    });
    Vida3D.show(has3d);
    if (!has3d) el.insertAdjacentHTML('beforeend', '<div class="war-no3d">Este jogo precisa de 3D (WebGL). Ative a aceleração de hardware do navegador.</div>');
    $('#scr-game').classList.add('cah-full');
  }

  function render(room) {
    if (!room.state) return;
    const st = view(room);
    UI.show('scr-game'); $('#scr-game').classList.add('cah-full');
    if (built !== st.gameId) { build(); built = st.gameId; seenEv = 0; resultShown = null; Vida3D.reset?.(); }
    const me = st.players.find(p => p.id === Room.myId), cur = st.players[st.turn], myTurn = cur.id === Room.myId && !st.result;
    $('#vida-table .war-seats').innerHTML = st.players.map((p, i) => {
      const r = rp(room, p.id), prof = p.prof ? VIDA_PROFS[p.prof] : null;
      const st8 = p.status === 'bankrupt' ? '💀 falido' : p.status === 'millionaire' ? '💰 milionário' : p.status === 'magnata' ? '🎩 MAGNATA' : `${prof ? prof.icon : '🎒'} ${prof ? M(p.salary) : 'estudante'}`;
      return `<div class="war-seat ${i === st.turn && !st.result ? 'cur' : ''} ${p.status === 'bankrupt' ? 'out' : ''} ${p.id === Room.myId ? 'me' : ''}" style="--pc:${esc(r.color)}" title="${esc(r.name)}">
        ${face(room, p.id, 34)}<div><b>${esc(r.name)}</b><small>${M(p.money)} · ${st8}${p.married ? ' · 💍' : ''}${p.kids ? ` · 👶${p.kids}` : ''}${p.notes ? ` · 📝${p.notes}` : ''}</small></div></div>`;
    }).join('');
    banner(room, st, me, myTurn);
    if (has3d) try { Vida3D.sync(st); } catch (err) { console.warn('vida3d', err); }
    try { playEvents(room, st); } catch (err) { console.warn(err); }
    renderTools(room, st, me);
    renderPanel(room, st, me, myTurn);
    renderBar(room, st, me, myTurn);
    UI.matchClock($('#board-wrap'), st);
    clearInterval(timerIv); timerIv = setInterval(() => tick(view(Room.room || room)), 250); tick(st);
    if (st.result && resultShown !== st.gameId) { resultShown = st.gameId; UI.recordResult(st, room); setTimeout(() => showResult(room, st), 2600); }
  }
  function tick(st) {
    const bar = $('#vida-timer'); if (!bar) return;
    const dl = st?.pending?.deadline || st?.deadline;
    bar.parentElement.classList.toggle('off', !dl || !!st?.result); if (!dl) return;
    const left = Math.max(0, dl - Room.now()), total = st.pending?.deadline ? 12000 : st.turnMs || 90000;
    bar.style.width = Math.min(100, 100 * left / total) + '%'; bar.classList.toggle('low', left < 10000);
  }
  function banner(room, st, me, myTurn) {
    const cur = st.players[st.turn];
    let txt;
    if (st.result) txt = st.result.how === 'magnata' ? `🎩 <b>${esc(rp(room, st.result.winner).name)}</b> virou MAGNATA e venceu!` : `🏆 <b>${esc(rp(room, st.result.winner).name)}</b> é o milionário mais rico!`;
    else if (myTurn && !st.pending && st.phase === 'start') txt = '<span>🎡 <b>Sua vez!</b> Compre seguros/ações se quiser e gire a roleta.</span>';
    else if (myTurn) txt = '<span>⏳ <b>Sua vez</b> — resolvendo a jogada…</span>';
    else txt = `${face(room, cur.id, 26)}<span>Vez de <b>${esc(rp(room, cur.id).name)}</b>${st.phase === 'start' && me && me.status !== 'bankrupt' ? ' · aposte na roleta!' : ''}</span>`;
    $('#vida-table .war-banner').innerHTML = txt;
  }
  function spinBadge(e, done) {
    const el = $('#vida-table .vida-spin'); if (!el) return;
    if (!done) { el.className = 'vida-spin on'; el.innerHTML = `<span>🎡</span>`; return; }
    el.className = 'vida-spin on done'; el.style.setProperty('--wc', WHEEL[e.value - 1]); el.innerHTML = `<b>${e.value}</b><small>${esc(e.why || '')}</small>`;
    clearTimeout(el._t); el._t = setTimeout(() => (el.className = 'vida-spin'), 1500);
  }
  function tip(node, e) {
    const t = $('#vida-table .war-tip'); if (!t) return;
    if (node == null) { t.classList.remove('on'); return; }
    const s = SP[node]; const txt = { pay: s.interest ? 'Dia do Pagamento: recebe o salário ao passar ou parar — e paga $1.000 de juros por nota promissória.' : 'Dia do Pagamento: recebe o salário ao passar ou parar. Parando exatamente, ganha um cartão de riqueza.',
      vinganca: 'Vingança: receba $200.000 de um jogador ou mande-o voltar 10 casas.', lifeins: s.text + ' Libera o Seguro de Vida.', stockbuy: s.text + ' Libera a compra de uma ação ($50.000).',
      bolsa: 'Bolsa: com ação, ao passar ou parar aqui você pode jogar na Bolsa na mesma rodada.', kid: s.text + (s.n === 2 ? ' Gêmeos: $2.000 de cada adversário.' : ' Recebe $1.000 de cada adversário.'),
      prof: `Profissão: ${VIDA_PROFS[s.prof].name} — salário ${M(VIDA_PROFS[s.prof].salary)}.`, start: 'Saída: escolha Negócios (curto) ou Faculdade (longo, profissões melhores).',
      wedding: 'Dia do seu Casamento (parada obrigatória): presentes na roleta e lua de mel.', apartment: `Comprou um Apartamento (parada obrigatória): ${M(P.apartment)}.`,
      toll: `Pedágio: o primeiro a atravessar cobra ${M(P.toll)} de cada um que passar depois.`, sorte: 'Dia de Sorte: ganhe $20.000 — guarde ou aposte em dois números (acertando, $300.000).',
      juizo: 'Dia do Juízo (parada obrigatória): $48.000 por filho, quita as notas e escolhe Milionário ou Magnata.', millionaire: 'Milionário: o primeiro a chegar ganha $240.000 e um número da sorte.',
      event: s.text + (s.ins ? ` (o Seguro de ${{ car: 'Carro', house: 'Casa', life: 'Vida' }[s.ins]} paga tudo)` : '') }[s.type];
    t.innerHTML = esc(txt || ''); const p = Vida3D.screenPos(node); if (p) { t.style.left = p.x + 'px'; t.style.top = p.y + 'px'; } t.classList.add('on');
  }

  // ---------- decisões ----------
  function renderPanel(room, st, me, myTurn) {
    const el = $('#vida-table .vida-panel'), pend = st.pending; let h = '';
    const others = st.players.filter(p => p.id !== Room.myId && p.status === 'playing');
    if (pend && me) {
      if (pend.type === 'path' && pend.pid === Room.myId) h = `<h3>🛣️ Primeira jogada: escolha seu caminho</h3>
        <div class="vida-choices"><button class="vida-choice" data-path="neg"><b>💼 NEGÓCIOS</b><small>Caminho curto. Vira Empreendedor na hora: salário ${M(VIDA_PROFS.empreendedor.salary)}.</small></button>
        <button class="vida-choice" data-path="fac"><b>🎓 FACULDADE</b><small>Mais longo, mas com as melhores profissões (até ${M(VIDA_PROFS.medico.salary)}). Sem parar numa profissão: Especialista em Redes Sociais (${M(VIDA_PROFS.especialista.salary)}).</small></button></div>
        <label class="chk vida-chk"><input type="checkbox" id="vida-carins" ${carIns ? 'checked' : ''}> 🚗 Fazer seguro do carro (${M(P.carIns)})</label>`;
      else if (pend.type === 'fork' && pend.pid === Room.myId) h = `<h3>🛣️ Bifurcação!</h3><div class="vida-choices">${pend.options.map((o, i) => `<button class="vida-choice" data-fork="${i}"><b>${o === 'louca' ? '🎰 VIDA LOUCA' : '🌻 VIDA TRANQUILA'}</b><small>${o === 'louca' ? 'Curta e arriscada: ganha muito ou perde muito.' : 'Mais longa e calma: filhos, promoções e horta.'}</small></button>`).join('')}</div>`;
      else if (pend.type === 'vinganca' && pend.pid === Room.myId) h = `<h3>😈 VINGANÇA!</h3><p>Escolha um jogador e o que fazer:</p><div class="vida-targets">${others.map(p => `<div class="vida-target">${face(room, p.id, 30)}<b>${esc(rp(room, p.id).name)}</b><small>${M(p.money)}</small>
        <button class="chip" data-vg="money" data-t="${esc(p.id)}">💰 Tomar ${M(P.vinganca)}</button><button class="chip" data-vg="back" data-t="${esc(p.id)}">⏪ Voltar 10 casas</button></div>`).join('')}</div>
        <p class="muted small">Se ele não tiver ${M(P.vinganca)}, volta 10 casas.</p>`;
      else if (pend.type === 'sorte' && pend.pid === Room.myId) h = `<h3>🍀 Dia de Sorte: ${M(P.sorte)} na mão!</h3><p>Guarde o dinheiro ou aposte uma nota de $10.000 em cada um de dois números. Acertando, ganha ${M(P.sorteWin)}.</p>
        ${numStrip(sorteNums, 'sn')}<div class="vida-row"><button class="chip" id="vida-keep">💼 Guardar</button><button class="chip go" id="vida-sorte" ${sorteNums.length === 2 ? '' : 'disabled'}>🎡 Apostar e girar</button></div>`;
      else if (pend.type === 'bolsa' && pend.pid === Room.myId) h = `<h3>📊 Jogar na Bolsa?</h3><p>Gire: 1–3 paga ${M(P.bolsaLose)} · 4–6 nada · 7–10 recebe ${M(P.bolsaWin)}. A ação continua sua.</p><div class="vida-row"><button class="chip" data-bolsa="0">Agora não</button><button class="chip go" data-bolsa="1">🎡 Jogar</button></div>`;
      else if (pend.type === 'juizo' && pend.pid === Room.myId) h = `<h3>⚖️ Dia do Juízo</h3><p>Você tem <b>${M(me.money)}</b>. Vai ser <b>MILIONÁRIO</b> (segue até o fim e conta o dinheiro) ou arrisca tudo para ser <b>MAGNATA</b> (acerta o número e vence na hora; erra e vai à falência)?</p>
        <div class="vida-choices"><button class="vida-choice" data-juizo="milionario"><b>💰 MILIONÁRIO</b><small>Gira e anda rumo à mansão.</small></button>
        <div class="vida-choice mag"><b>🎩 MAGNATA</b><small>Escolha seu número e aposte tudo, até o carro:</small>${numStrip(magNum ? [magNum] : [], 'mg')}<button class="chip danger go" id="vida-mag" ${magNum ? '' : 'disabled'}>Apostar tudo no ${magNum || '?'}</button></div></div>`;
      else if (pend.type === 'despesa' && pend.pid === Room.myId) h = `<h3>🃏 Usar "Dividindo a Despesa"?</h3><p>Você vai pagar ${M(pend.cost)}. Escolha quem paga metade:</p><div class="vida-row">${st.players.filter(p => p.id !== Room.myId && p.status !== 'bankrupt').map(p => `<button class="chip" data-dsp="${esc(p.id)}">${face(room, p.id, 20)} ${esc(rp(room, p.id).name)}</button>`).join('')}<button class="chip" data-dsp="">Não usar</button></div>`;
      else if (pend.type === 'lucros' && pend.waiting?.includes(Room.myId)) h = `<h3>🃏 ${esc(rp(room, pend.target).name)} vai receber ${M(pend.amount)}!</h3><p>Usar "Dividindo os Lucros" e ficar com metade (${M(Math.floor(pend.amount / 2))})?</p><div class="vida-row"><button class="chip" data-luc="0">Não</button><button class="chip go" data-luc="1">🃏 Usar</button></div>`;
      else if (pend.type === 'isencao' && pend.pid === Room.myId) h = `<h3>🛡️ ${esc(rp(room, pend.from).name)} usou um cartão contra você!</h3><p>Mostrar o Cartão de Isenção e não pagar nada?</p><div class="vida-row"><button class="chip" data-isen="0">Deixar</button><button class="chip go" data-isen="1">🛡️ Usar Isenção</button></div>`;
    }
    el.innerHTML = h; el.classList.toggle('on', !!h);
    $$('[data-path]', el).forEach(b => (b.onclick = () => act({ type: 'path', path: b.dataset.path, carIns: $('#vida-carins')?.checked })));
    $('#vida-carins', el) && ($('#vida-carins', el).onchange = e => (carIns = e.target.checked));
    $$('[data-fork]', el).forEach(b => (b.onclick = () => act({ type: 'fork', i: +b.dataset.fork })));
    $$('[data-vg]', el).forEach(b => (b.onclick = () => act({ type: 'vinganca', mode: b.dataset.vg, target: b.dataset.t })));
    $$('[data-sn]', el).forEach(b => (b.onclick = () => { const n = +b.dataset.sn; sorteNums = sorteNums.includes(n) ? sorteNums.filter(x => x !== n) : [...sorteNums, n].slice(-2); render(Room.room); }));
    $('#vida-keep', el) && ($('#vida-keep', el).onclick = () => { act({ type: 'sorte', bet: false }); sorteNums = []; });
    $('#vida-sorte', el) && ($('#vida-sorte', el).onclick = () => { act({ type: 'sorte', bet: true, nums: sorteNums }); sorteNums = []; });
    $$('[data-bolsa]', el).forEach(b => (b.onclick = () => act({ type: 'bolsa', play: b.dataset.bolsa === '1' })));
    $$('[data-juizo]', el).forEach(b => (b.onclick = () => act({ type: 'juizo', choice: b.dataset.juizo })));
    $$('[data-mg]', el).forEach(b => (b.onclick = () => { magNum = +b.dataset.mg; render(Room.room); }));
    $('#vida-mag', el) && ($('#vida-mag', el).onclick = () => { if (confirm(`Apostar TUDO no ${magNum}? Errando, você vai à falência.`)) act({ type: 'juizo', choice: 'magnata', num: magNum }); });
    $$('[data-dsp]', el).forEach(b => (b.onclick = () => act({ type: 'despesa', target: b.dataset.dsp || null })));
    $$('[data-luc]', el).forEach(b => (b.onclick = () => act({ type: b.dataset.luc === '1' ? 'claim' : 'pass' })));
    $$('[data-isen]', el).forEach(b => (b.onclick = () => act({ type: b.dataset.isen === '1' ? 'useIsencao' : 'skip' })));
  }
  const numStrip = (sel, key) => `<div class="vida-nums">${Array.from({ length: 10 }, (_, i) => `<button class="vida-num ${sel.includes(i + 1) ? 'on' : ''}" data-${key}="${i + 1}" style="--wc:${WHEEL[i]};${i === 9 || i === 2 ? 'color:#1b1b1b;text-shadow:none' : ''}">${i + 1}</button>`).join('')}</div>`;

  // ---------- barra de baixo: começo da vez (compras e girar) ou apostas no giro dos outros ----------
  function renderBar(room, st, me, myTurn) {
    const B = $('#vida-table .vida-bar'), H = $('#vida-table .war-hint'); let bar = '', hint = '';
    if (me && !st.result && !st.pending && st.phase === 'start') {
      if (myTurn && !me.firstTurn) {
        const opts = [];
        if (!me.ins.car) opts.push(`<button class="chip" data-buy="car">🚗 Seguro de carro ${M(P.carIns)}</button>`);
        if (me.house && !me.ins.house) opts.push(`<button class="chip" data-buy="house">🏠 Seguro de casa ${M(P.houseIns)}</button>`);
        if (me.unlock.life && !me.ins.life) opts.push(`<button class="chip" data-buy="life">❤️ Seguro de vida ${M(P.lifeIns)}</button>`);
        if (me.unlock.stock && !me.stock) opts.push(`<button class="chip" data-buy="stock">📈 Ação ${M(P.stock)}</button>`);
        if (!me.retired) opts.push(`<button class="chip" id="vida-note">📝 Pegar ${M(P.noteGet)}</button>`);
        if (me.notes && me.money >= P.notePay) opts.push(`<button class="chip" id="vida-repay">✅ Quitar nota ${M(P.notePay)}</button>`);
        bar = opts.join('') + '<button class="chip go big" id="vida-spinbtn">🎡 GIRAR A ROLETA</button>';
        hint = 'Compras e empréstimos só no começo da sua vez.';
      } else if (!myTurn && me.status !== 'bankrupt') {
        const placed = st.bets?.[Room.myId];
        if (placed) bar = `<span class="chip ghost">🎲 Sua aposta: ${placed.map(b => `${M(b.amt)} no ${b.n}`).join(' + ')}</span>`;
        else {
          bar = `<span class="chip ghost">🎲 Apostar:</span>${numStrip(betNums, 'bn')}${[2000, 5000, 10000, 24000].map(v => `<button class="chip ${betAmt === v ? 'on' : ''}" data-ba="${v}">${M(v)}</button>`).join('')}<button class="chip go" id="vida-bet" ${betNums.length ? '' : 'disabled'}>Apostar</button>`;
          hint = `Acertou o número do giro de ${esc(rp(room, st.players[st.turn].id).name)}? Recebe 10× a aposta. ${betNums.length === 2 ? 'Com dois números, o valor é dividido.' : ''}`;
        }
      }
    }
    B.innerHTML = bar; B.classList.toggle('empty', !bar.trim()); H.textContent = hint;
    $$('[data-buy]', B).forEach(b => (b.onclick = () => act({ type: 'buy', what: b.dataset.buy })));
    $('#vida-note', B) && ($('#vida-note', B).onclick = () => act({ type: 'note' }));
    $('#vida-repay', B) && ($('#vida-repay', B).onclick = () => act({ type: 'repay' }));
    $('#vida-spinbtn', B) && ($('#vida-spinbtn', B).onclick = () => { act({ type: 'spin' }); SFX.click?.(); });
    $$('[data-bn]', B).forEach(b => (b.onclick = () => { const n = +b.dataset.bn; betNums = betNums.includes(n) ? betNums.filter(x => x !== n) : [...betNums, n].slice(-2); render(Room.room); }));
    $$('[data-ba]', B).forEach(b => (b.onclick = () => { betAmt = +b.dataset.ba; render(Room.room); }));
    $('#vida-bet', B) && ($('#vida-bet', B).onclick = () => { const amts = betNums.length === 2 ? [Math.floor(betAmt / 2), betAmt - Math.floor(betAmt / 2)] : [betAmt]; act({ type: 'bet', nums: betNums, amts }); betNums = []; });
  }

  // ---------- ferramentas, carteira e gaveta ----------
  function renderTools(room, st, me) {
    const T = $('#vida-table'), unread = room.chat.length > chatSeen && !(drawer && logTab === 'chat');
    $('.war-tools', T).innerHTML = `${me ? `<button data-tool="wallet" class="${wallet ? 'on' : ''}" title="Sua carteira">💼</button>` : ''}<button data-tool="rules" title="Regras">📖</button><button data-tool="mute" title="Som">${SFX.isMuted() ? '🔇' : '🔊'}</button>
      <button data-tool="chat" class="${drawer ? 'on' : ''} ${unread ? 'dot' : ''}" title="Conversa e registro">💬</button><button data-tool="leave" title="Sair da partida">🚪</button>`;
    const D = $('.war-drawer', T); D.classList.toggle('open', drawer || wallet);
    if (wallet && me) {
      const prof = me.prof ? VIDA_PROFS[me.prof] : null;
      D.innerHTML = `<div class="tabs"><b>💼 Sua carteira</b><button class="x" data-tool="wallet">✕</button></div>
        <div class="vida-wallet"><p><b>${M(me.money)}</b> em dinheiro</p><p>${prof ? `${prof.icon} ${prof.name} · salário ${M(me.salary)}` : '🎒 Ainda estudando'}</p>
        <p>${me.married ? '💍 Casado(a)' : '💔 Solteiro(a)'} · 👶 ${me.kids} filho${me.kids === 1 ? '' : 's'} · ${me.house ? '🏢 Apartamento' : '🏚️ Sem casa'}</p>
        <p>🛡️ Seguros: ${['car', 'house', 'life'].filter(k => me.ins[k]).map(k => ({ car: '🚗 carro', house: '🏠 casa', life: '❤️ vida' })[k]).join(', ') || 'nenhum'}</p>
        <p>📈 Ação: ${me.stock ? 'sim (vale ' + M(P.stockValue) + ' no fim)' : 'não'} · 📝 Notas: ${me.notes} (${M(me.notes * P.notePay)} para quitar)</p>
        <h4>🃏 Cartões de riqueza</h4>${me.cards.length ? me.cards.map(c => `<div class="vida-card ${c}"><b>${Vida.CARD[c]}</b><small>${{ lucros: 'Use quando outro jogador parar numa casa onde recebe $10.000 ou mais: ele te dá metade.', despesa: 'Use quando você parar numa casa onde paga mais de $10.000: outro jogador paga metade.', isencao: 'Mostre quando usarem um cartão contra você: não paga nada.' }[c]}</small></div>`).join('') : '<p class="muted small">Pare exatamente num Dia do Pagamento para ganhar um.</p>'}
        ${me.lucky ? `<p>🍀 Número da sorte: <b>${me.lucky}</b></p>` : ''}</div>`;
    } else if (drawer) {
      const keep = $('.chat-form input', D)?.value || '', focus = document.activeElement?.closest('.war-drawer .chat-form');
      if (logTab === 'chat') chatSeen = room.chat.length;
      D.innerHTML = `<div class="tabs"><button data-lt="log" class="${logTab === 'log' ? 'on' : ''}">Registro</button><button data-lt="chat" class="${logTab === 'chat' ? 'on' : ''}">Chat</button><button class="x" data-tool="chat" title="Fechar">✕</button></div>
        ${logTab === 'log' ? `<div class="chat-box log">${st.log.map(l => `<div class="msg">${esc(l.msg)}</div>`).join('')}</div>` : `<div class="chat-box">${UI.chatHTML(room)}</div><form class="chat-form"><input placeholder="Mensagem…" maxlength="300"><button class="btn">➤</button></form>`}`;
      if (logTab === 'chat') { const i = $('.chat-form input', D); i.value = keep; if (focus) i.focus(); }
      $$('.chat-box', D).forEach(b => (b.scrollTop = b.scrollHeight)); UI.bindChat(D);
      $$('[data-lt]', D).forEach(b => (b.onclick = () => { logTab = b.dataset.lt; render(Room.room); }));
    } else D.innerHTML = '';
    $$('[data-tool]', T).forEach(b => (b.onclick = () => {
      const k = b.dataset.tool;
      if (k === 'wallet') { wallet = !wallet; drawer = false; render(Room.room); }
      else if (k === 'rules') rulesModal();
      else if (k === 'mute') { SFX.setMuted(!SFX.isMuted()); render(Room.room); }
      else if (k === 'chat') { drawer = !drawer; wallet = false; if (drawer && room.chat.length > chatSeen) logTab = 'chat'; render(Room.room); }
      else if (k === 'leave') { if (UI.confirmLeave()) { reset(); UI.leaveToHub(); } }
    }));
  }

  // ---------- eventos ----------
  function playEvents(room, st) {
    const fresh = st.evs.filter(e => e.n > seenEv); seenEv = st.ev.n;
    for (const e of fresh) {
      if (has3d) Vida3D.play(e);
      const name = e.pid ? esc(rp(room, e.pid).name) : '';
      if (e.type === 'turn' && e.pid === Room.myId) { SFX.turnMine?.(); UI.toast('🎡 Sua vez!', 'ok'); }
      else if (e.type === 'betWin') UI.toast(`🎯 ${name} acertou a aposta: +${M(e.amount)}!`, e.pid === Room.myId ? 'ok' : '');
      else if (e.type === 'vinganca') UI.toast(`😈 Vingança de ${name} em ${esc(rp(room, e.target).name)}!`, e.target === Room.myId ? 'err' : '');
      else if (e.type === 'card' && e.pid === Room.myId) UI.toast('🃏 Você ganhou um cartão de riqueza (veja na 💼 carteira).', 'ok');
      else if (e.type === 'millionaire') UI.toast(`💰 ${name} chegou ao MILIONÁRIO!`);
      else if (e.type === 'bankrupt') UI.toast(`💀 ${name} foi à falência!`, e.pid === Room.myId ? 'err' : '');
    }
  }

  function rulesModal() {
    UI.modal(`<h2>📖 Como jogar Vida Adulta</h2><ul class="rules-list small">
      <li><b>Começo:</b> cada um recebe ${M(P.startCash)} e um cartão de riqueza. Quem tirar o maior número na roleta começa.</li>
      <li><b>Sua vez:</b> gire a roleta (1 a 10) e ande. Pare obrigatoriamente no Casamento, no Apartamento e no Dia do Juízo. Casa ocupada? Vá para a próxima livre.</li>
      <li><b>Primeira jogada:</b> NEGÓCIOS (Empreendedor, ${M(VIDA_PROFS.empreendedor.salary)}) ou FACULDADE (profissões melhores; sem parar numa, vira Especialista em Redes Sociais, ${M(VIDA_PROFS.especialista.salary)}).</li>
      <li><b>Dia do Pagamento</b> (verde): recebe o salário ao passar ou parar; parando exatamente, ganha um cartão de riqueza. Alguns cobram $1.000 de juros por nota promissória.</li>
      <li><b>Seguros e ação</b> (só no começo da vez): carro ${M(P.carIns)}; casa ${M(P.houseIns)} (depois do apartamento); vida ${M(P.lifeIns)} (depois da casa azul); ação ${M(P.stock)} (depois da casa roxa de compra). Um de cada.</li>
      <li><b>Notas promissórias:</b> pegue ${M(P.noteGet)} quando quiser e devolva ${M(P.notePay)} até se aposentar. Não vale para apostar nem para pagar Vingança.</li>
      <li><b>Bolsa</b> (roxo): com ação, ao passar ou parar, pode girar: 1–3 paga ${M(P.bolsaLose)}, 4–6 nada, 7–10 recebe ${M(P.bolsaWin)}.</li>
      <li><b>Vingança</b> (amarelo): receba ${M(P.vinganca)} de alguém (se ele não tiver, volta 10 casas) ou mande-o voltar 10 casas. Não vale em quem já é Milionário. Voltando, pega o lado mais curto e não cumpre as casas.</li>
      <li><b>Filhos</b> (rosa): $1.000 de cada adversário ($2.000 se gêmeos). <b>Casamento:</b> presentes na roleta (1–3: $2.000 de cada; 4–6: $1.000; 7–10: nada) e lua de mel (gira e anda).</li>
      <li><b>Pedágio:</b> o primeiro a atravessar cobra ${M(P.toll)} de cada um que passar depois.</li>
      <li><b>Apostas:</b> no giro dos outros, aposte até ${M(P.betMax)} em um número (ou divida em dois). Acertou, recebe 10×.</li>
      <li><b>Dia de Sorte:</b> ganhe ${M(P.sorte)}; guarde ou aposte uma nota em cada um de dois números: acertando, ${M(P.sorteWin)} (e devolve os $20.000).</li>
      <li><b>Cartões de riqueza:</b> Dividindo os Lucros, Dividindo a Despesa e Isenção (veja na carteira).</li>
      <li><b>Dia do Juízo:</b> ${M(P.kidJudgment)} por filho e quita as notas (${M(P.notePay)} cada). Depois: MILIONÁRIO (segue até a mansão) ou MAGNATA (aposta tudo num número: acertou, vence na hora; errou, falência).</li>
      <li><b>Milionário:</b> o primeiro ganha ${M(P.millionBonus)} e um número da sorte — quem tirar esse número paga ${M(P.luckyPay)} a ele. No fim, ação vale ${M(P.stockValue)} e seguro de vida ${M(P.lifeValue)}; o milionário mais rico vence.</li></ul>`, { wide: true });
  }
  function showResult(room, st) {
    const w = rp(room, st.result.winner), c = vidaCharById(w.general);
    const m = UI.modal(`<div class="result war-result">
      <div class="confetti">${Array.from({ length: 40 }, (_, k) => `<i style="--x:${Math.random() * 100}%;--d:${Math.random() * 2}s;--h:${k * 37 % 360}"></i>`).join('')}</div>
      ${c ? `<img class="wgen big" src="${c.img}" alt="">` : UI.avatar(w, 150)}<h1>${esc(w.name)} ${st.result.how === 'magnata' ? 'virou MAGNATA!' : 'venceu a Vida Adulta!'}</h1>
      <ol class="final">${st.result.ranking.map(r => `<li>${face(room, r.id, 32)}<b>${esc(rp(room, r.id).name)}</b><span>${r.status === 'bankrupt' ? '💀 falido' : r.status === 'magnata' ? '🎩 magnata' : M(r.worth)}</span></li>`).join('')}</ol>
      ${Room.isHost ? '<button class="btn primary big" id="back-lobby">Voltar para a sala</button>' : '<p class="muted">Aguardando o anfitrião voltar para a sala…</p>'}
      <button class="btn ghost" id="res-close">Ver o tabuleiro</button></div>`, { wide: true });
    $('#back-lobby', m) && ($('#back-lobby', m).onclick = () => { UI.closeModal(); Room.send({ t: 'lobby' }); });
    $('#res-close', m).onclick = UI.closeModal;
  }
  function reset() { built = null; resultShown = null; drawer = false; wallet = false; clearInterval(timerIv); if (Vida3D.active) Vida3D.show(false); if ($('#scr-game')?.classList.contains('vida')) $('#scr-game').classList.remove('cah-full'); }
  return { render, reset };
})();
