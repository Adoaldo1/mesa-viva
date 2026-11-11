// ===== Interface =====
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const M = n => Magnata.money(n);

const UI = (() => {
  let me = null, hubTab = 'games', draft = null;
  let boardBuilt = null, lastTradeId = 0, resultShown = null, logTab = 'log', cashShown = {};

  // ---------- util ----------
  function show(id) { $$('.screen').forEach(s => s.classList.toggle('active', s.id === id)); }
  function toast(msg, kind = '') {
    // a mesma mensagem não se empilha: reaproveita a que já está na tela
    const same = [...$('#toasts').children].find(x => x.textContent === msg && !x.classList.contains('out'));
    const t = same || document.createElement('div');
    if (!same) { t.className = 'toast ' + kind; t.textContent = msg; $('#toasts').appendChild(t); }
    else { t.classList.remove('bump'); void t.offsetWidth; t.classList.add('bump'); }
    clearTimeout(t._a); clearTimeout(t._b);
    t._a = setTimeout(() => t.classList.add('out'), 3200); t._b = setTimeout(() => t.remove(), 3700);
  }
  function modal(html, { onClose, wide } = {}) {
    closeModal();
    const m = document.createElement('div'); m.className = 'modal-bg'; m.innerHTML = `<div class="modal ${wide ? 'wide' : ''}"><button class="x" aria-label="Fechar">✕</button>${html}</div>`;
    m.addEventListener('click', e => { if (e.target === m || e.target.classList.contains('x')) { closeModal(); onClose?.(); } });
    $('#modal-root').appendChild(m); return m.firstElementChild;
  }
  const closeModal = () => { $('#modal-root').innerHTML = ''; };

  function avatar(p, size = 56, extra = '') {
    const c = charById(p.char);
    return `<div class="avatar frame-${esc(p.frame || 'simple')} ${extra}" style="--c:${esc(p.color || c.color)};--s:${size}px">
      <img src="${c.img}" alt="${esc(c.name)}" onerror="this.style.visibility='hidden'"><span class="emb">${esc(p.emblem || '')}</span></div>`;
  }

  // ---------- autenticação ----------
  function renderAuth() {
    show('scr-auth');
    const f = $('#auth-form'); let mode = 'login';
    const sync = () => {
      $('#auth-title').textContent = mode === 'login' ? 'Entrar na mesa' : 'Criar perfil';
      $('#auth-submit').textContent = mode === 'login' ? 'Entrar' : 'Criar e entrar';
      $('#auth-switch').innerHTML = mode === 'login' ? 'Novo por aqui? <a href="#">Criar perfil</a>' : 'Já tem perfil? <a href="#">Entrar</a>';
      $('#auth-err').textContent = '';
    };
    sync();
    $('#auth-switch').onclick = e => { e.preventDefault(); mode = mode === 'login' ? 'register' : 'login'; sync(); };
    f.onsubmit = async e => {
      e.preventDefault();
      const u = $('#auth-user').value, pw = $('#auth-pass').value;
      try { me = mode === 'login' ? await Store.login(u, pw) : await Store.register(u, pw); f.reset(); enterHub(mode === 'register' ? 'profile' : 'games'); }
      catch (err) { $('#auth-err').textContent = err.message; }
    };
    $('#auth-import').onchange = async e => {
      const file = e.target.files[0]; if (!file) return;
      try { const u = Store.importProfile(await file.text()); toast(`Perfil “${u}” importado. Entre com sua senha.`, 'ok'); $('#auth-user').value = u; }
      catch (err) { toast(err.message, 'err'); }
      e.target.value = '';
    };
  }

  // ---------- hub ----------
  function enterHub(tab = hubTab) {
    hubTab = tab; show('scr-hub');
    $('#me-chip').innerHTML = `${avatar(me, 36)}<div><b>${esc(me.displayName)}</b><small>${esc(me.title)} · ${me.stats.wins} vitórias</small></div>`;
    $$('#hub-tabs button').forEach(b => { b.classList.toggle('on', b.dataset.tab === tab); b.onclick = () => enterHub(b.dataset.tab); });
    const body = $('#hub-body');
    if (tab === 'games') renderGames(body);
    if (tab === 'profile') renderProfileEditor(body);
    if (tab === 'ranking') renderRanking(body);
  }

  function renderGames(body) {
    const code = new URLSearchParams(location.search).get('sala') || '';
    body.innerHTML = `
      <div class="join-bar card">
        <div><h3>Entrar em uma sala</h3><p class="muted">Peça o código ao anfitrião.</p></div>
        <form id="join-form" class="join-col"><div class="row"><input id="join-code" maxlength="5" placeholder="CÓDIGO" value="${esc(code)}" autocomplete="off"><button class="btn primary">Entrar</button></div>
          <label class="chk compat" title="Pula a tentativa de conexão direta e usa o servidor de reserva desde o início. Útil em redes que nunca conseguem P2P."><input type="checkbox" id="join-relay" ${localStorage.getItem('mesaviva.relay') === '1' ? 'checked' : ''}> Rede restrita (modo compatível)</label>
          <a class="small" id="net-test">🩺 Testar minha conexão</a></form>
      </div>
      ${(() => { const sv = Room.savedGame(me); if (!sv) return '';
        const st = sv.room.state, n = sv.room.players.length, mins = Math.round((Date.now() - sv.t) / 60000);
        return `<div class="card resume-card"><div><h3>🏝️ Partida de Arquipélago em andamento</h3><p class="muted">Sala ${esc(sv.room.code)} · ${n} jogadores · rodada ${Math.max(1, st.round)} · salva há ${mins < 1 ? 'menos de 1 minuto' : mins + ' min'}. Seus amigos voltam pelo mesmo código (ou pelo novo, se ele estiver ocupado).</p></div>
          <div class="row"><button class="btn primary" id="resume-game">Retomar partida</button><button class="btn ghost" id="drop-save">Descartar</button></div></div>`; })()}
      <h2 class="sec">Biblioteca de jogos</h2>
      <div class="games">${GAME_LIBRARY.map(g => `
        <article class="game ${g.ready ? '' : 'soon'}">
          <div class="cover">${g.cover ? `<img src="${g.cover}" alt="" onerror="this.remove()">` : `<span class="ico">${g.icon}</span>`}${g.ready ? '' : '<span class="tag">Em breve</span>'}</div>
          <div class="gbody"><h3>${esc(g.name)}</h3><p>${esc(g.desc)}</p><div class="row between"><span class="muted">👥 ${g.players}</span>
          ${g.ready ? `<button class="btn primary" data-create="${g.id}">Criar sala</button>` : '<button class="btn" disabled>Em breve</button>'}</div></div>
        </article>`).join('')}
      </div>`;
    $('#net-test').onclick = netTestModal;
    $('#resume-game') && ($('#resume-game').onclick = () => {
      const sv = Room.savedGame(me); if (!sv) return renderGames(body);
      connecting('Retomando a partida…');
      Room.resume(me, sv, () => { closeModal(); enterRoom(); }, err => { closeModal(); toast(err, 'err'); });
    });
    $('#drop-save') && ($('#drop-save').onclick = () => { if (confirm('Descartar a partida salva? Não dá para desfazer.')) { Room.dropSave(); renderGames(body); } });
    $('#join-form').onsubmit = e => {
      e.preventDefault(); const c = $('#join-code').value.trim().toUpperCase();
      if (c.length !== 5) return toast('O código tem 5 caracteres.', 'err');
      connecting('Conectando à sala ' + c + '…');
      const forceRelay = $('#join-relay').checked;
      try { localStorage.setItem('mesaviva.relay', forceRelay ? '1' : '0'); } catch { }
      Net.on('mode', m => { if (m === 'relay') { const p = $('.modal .center p'); if (p) p.textContent = 'Rede restrita detectada: conectando pelo servidor de reserva…'; } });
      joinRoom(c, forceRelay);
    };
    $$('[data-create]').forEach(b => b.onclick = () => {
      connecting('Abrindo sala…');
      Room.create(me, b.dataset.create, () => { closeModal(); enterRoom(); }, err => { closeModal(); toast(err, 'err'); });
    });
  }
  const connecting = msg => modal(`<div class="center"><div class="spinner"></div><p>${esc(msg)}</p></div>`, { onClose: () => Room.leave() });
  // entrar numa sala; se a conexão cair depois, tenta voltar sozinho (até 3 vezes) em vez de mandar para o menu
  const LOST = 'Conexão com o anfitrião perdida.';
  let rejoin = null;
  const REJOIN_MAX = 6; // ~1 minuto tentando: dá tempo do anfitrião recarregar a página e retomar a partida
  function joinRoom(c, forceRelay, tries = 0, joined = false) {
    rejoin = { code: c, forceRelay, tries, joined };
    Room.join(c, me, () => {
      rejoin.tries = 0; rejoin.joined = true; closeModal(); enterRoom();
      if (tries) toast('Reconectado! 🎉', 'ok'); else if (Net.mode === 'relay') toast('Conectado pelo servidor de reserva (sua rede não permite conexão direta).', 'ok');
    }, err => {
      // já estava na sala (a conexão caiu no meio) ou ainda voltando: tenta de novo do zero, inclusive a conexão direta
      if (rejoin?.code === c && (tries || rejoin.joined) && rejoin.tries < REJOIN_MAX) return lost(LOST);
      closeModal(); toast(err, 'err'); if (tries || rejoin?.joined) { rejoin = null; boardBuilt = null; enterHub('games'); }
    }, lost, { forceRelay });
  }
  function lost(msg) {
    const r = rejoin; Room.leave(); boardBuilt = null;
    if (r && msg === LOST && r.tries < REJOIN_MAX) {
      modal(`<div class="center"><div class="spinner"></div><p>A conexão caiu — voltando para a sala ${esc(r.code)}… (${r.tries + 1}/${REJOIN_MAX})</p></div>`, { onClose: () => { rejoin = null; Room.leave(); enterHub('games'); } });
      return void setTimeout(() => { if (rejoin === r) joinRoom(r.code, r.forceRelay, r.tries + 1, r.joined); }, Math.min(15000, 1500 + r.tries * 2500));
    }
    rejoin = null; toast(msg, 'err'); closeModal(); enterHub('games');
  }

  function profilePreview(p) {
    const c = charById(p.char);
    return `<div class="preview" style="--c:${esc(p.color || c.color)}">${avatar(p, 180)}
      <h2>${esc(p.displayName)}</h2><div class="ptitle">${esc(p.title)}</div><div class="muted">${esc(c.name)} — ${esc(c.role)}</div>
      <blockquote>“${esc(p.catchphrase)}”</blockquote>
      <div class="stats"><div><b>${p.stats.wins}</b><span>vitórias</span></div><div><b>${p.stats.games}</b><span>partidas</span></div><div><b>${M(p.stats.best || 0)}</b><span>maior fortuna</span></div></div></div>`;
  }

  function renderProfileEditor(body) {
    draft = structuredClone(me);
    const draw = () => {
      body.innerHTML = `<div class="profile-grid">
        <div class="card">${profilePreview(draft)}</div>
        <div class="card editor">
          <h3>Personagem</h3>
          <div class="chars">${CHARACTERS.map(c => `<button class="charpick ${draft.char === c.id ? 'on' : ''}" data-char="${c.id}" title="${esc(c.name)}"><img src="${c.img}" alt="" onerror="this.style.visibility='hidden'"><span>${esc(c.name.split(' ')[0])}</span></button>`).join('')}</div>
          <label>Nome de exibição<input id="pe-name" maxlength="18" value="${esc(draft.displayName)}"></label>
          <h3>Cor</h3>
          <div class="swatches">${[null, ...PLAYER_COLORS].map(col => `<button class="sw ${draft.color === col ? 'on' : ''}" data-color="${col ?? ''}" style="--c:${col || charById(draft.char).color}" title="${col ? col : 'Cor do personagem'}">${col ? '' : '★'}</button>`).join('')}
            <input type="color" id="pe-custom" value="${esc(draft.color || charById(draft.char).color)}" title="Cor personalizada"></div>
          <h3>Emblema</h3>
          <div class="emblems">${EMBLEMS.map(e => `<button class="em ${draft.emblem === e ? 'on' : ''}" data-emb="${e}">${e}</button>`).join('')}</div>
          <div class="row2">
            <label>Título<select id="pe-title">${TITLES.map(t => `<option ${t === draft.title ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>
            <label>Moldura<select id="pe-frame">${FRAMES.map(f => `<option value="${f.id}" ${f.id === draft.frame ? 'selected' : ''}>${f.name}</option>`).join('')}</select></label>
          </div>
          <label>Frase de vitória<input id="pe-quote" maxlength="60" value="${esc(draft.catchphrase)}"></label>
          <div class="row between"><button class="btn" id="pe-export">Exportar perfil</button><button class="btn primary" id="pe-save">Salvar personagem</button></div>
        </div></div>`;
      $$('[data-char]', body).forEach(b => b.onclick = () => { draft.char = b.dataset.char; draw(); });
      $$('[data-color]', body).forEach(b => b.onclick = () => { draft.color = b.dataset.color || null; draw(); });
      $('#pe-custom').oninput = e => { draft.color = e.target.value; $('.preview', body).outerHTML = profilePreview(draft); };
      $$('[data-emb]', body).forEach(b => b.onclick = () => { draft.emblem = b.dataset.emb; draw(); });
      const live = () => { draft.displayName = $('#pe-name').value.trim() || me.username; draft.title = $('#pe-title').value; draft.frame = $('#pe-frame').value; draft.catchphrase = $('#pe-quote').value; $('.preview', body).outerHTML = profilePreview(draft); };
      ['#pe-name', '#pe-quote'].forEach(s => $(s).oninput = live);
      ['#pe-title', '#pe-frame'].forEach(s => $(s).onchange = live);
      $('#pe-save').onclick = () => { live(); me = draft; Store.saveProfile(me); draft = structuredClone(me); toast('Personagem salvo!', 'ok'); enterHub('profile'); };
      $('#pe-export').onclick = () => {
        const blob = new Blob([Store.exportProfile()], { type: 'application/json' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `mesaviva-${me.username}.json`; a.click();
      };
    };
    draw();
  }

  function renderRanking(body) {
    const list = Store.leaderboard();
    body.innerHTML = `<div class="card"><h2 class="sec" style="margin-top:0">🏆 Maiores vencedores</h2>
      <p class="muted">Jogadores que você já encontrou nas suas mesas. As estatísticas de cada um vêm do próprio perfil e são sincronizadas ao jogar juntos.</p>
      ${list.length ? `<table class="rank"><thead><tr><th>#</th><th>Jogador</th><th>Vitórias</th><th>Partidas</th><th>Aproveit.</th><th>Maior fortuna</th></tr></thead><tbody>
      ${list.map((p, i) => `<tr class="${p.username.toLowerCase() === me.username.toLowerCase() ? 'mine' : ''}"><td class="pos p${i + 1}">${i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}</td>
        <td><div class="who">${avatar(p, 40)}<div><b>${esc(p.displayName)}</b><small>${esc(p.title || '')}</small></div></div></td>
        <td><b>${p.wins}</b></td><td>${p.games}</td><td>${p.games ? Math.round(100 * p.wins / p.games) : 0}%</td><td>${M(p.best || 0)}</td></tr>`).join('')}
      </tbody></table>` : '<p class="empty">Ninguém no ranking ainda. Jogue uma partida!</p>'}</div>`;
  }

  // ---------- sala ----------
  function enterRoom() { boardBuilt = null; resultShown = null; Room.onChange.__bound || (Room.onChange(onRoom), Room.onChange.__bound = true); onRoom(Room.room); }

  function onRoom(room) {
    if (!room) return;
    if (room.game !== 'ludo' && room.game !== 'patrimonio' && room.game !== 'ultima') checkFlip(room);
    if (room.game !== 'patrimonio') PatUI.reset();
    if (room.game !== 'ultima') UltUI.reset();
    $('#scr-game').classList.toggle('ludo', room.game === 'ludo');
    $('#scr-game').classList.toggle('conjura', room.game === 'conjura');
    $('#scr-game').classList.toggle('cah', room.game === 'cah');
    $('#scr-game').classList.toggle('war', room.game === 'war');
    $('#scr-game').classList.toggle('domino2', room.game === 'domino2');
    $('#scr-game').classList.toggle('arq', room.game === 'arq');
    $('#scr-game').classList.toggle('patrimonio', room.game === 'patrimonio');
    $('#scr-game').classList.toggle('ultima', room.game === 'ultima');
    if (room.phase === 'lobby') { if ($('.modal .result')) closeModal(); queue = []; boardBuilt = null; resultShown = null; ConjuraUI.reset(); CahUI.reset(); WarUI.reset(); Domino2UI.reset(); ArqUI.reset(); PatUI.reset(); UltUI.reset(); renderRoom(room); }
    else if (room.game === 'ultima') { Board3D.show(false); ConjuraUI.reset(); CahUI.reset(); WarUI.reset(); Domino2UI.reset(); ArqUI.reset(); UltUI.render(room); }
    else if (room.game === 'patrimonio') { Board3D.show(false); ConjuraUI.reset(); CahUI.reset(); WarUI.reset(); Domino2UI.reset(); ArqUI.reset(); PatUI.render(room); }
    else if (room.game === 'arq') { Board3D.show(false); ConjuraUI.reset(); CahUI.reset(); WarUI.reset(); Domino2UI.reset(); ArqUI.render(room); }
    else if (room.game === 'domino2') { Board3D.show(false); ArqUI.reset(); ConjuraUI.reset(); CahUI.reset(); WarUI.reset(); Domino2UI.render(room); }
    else if (room.game === 'ludo') { Board3D.show(false); ConjuraUI.reset(); CahUI.reset(); WarUI.reset(); ArqUI.reset(); LudoUI.render(room); }
    else if (room.game === 'conjura') { Board3D.show(false); CahUI.reset(); WarUI.reset(); ArqUI.reset(); ConjuraUI.render(room); }
    else if (room.game === 'cah') { Board3D.show(false); ConjuraUI.reset(); WarUI.reset(); ArqUI.reset(); CahUI.render(room); }
    else if (room.game === 'war') { Board3D.show(false); ConjuraUI.reset(); CahUI.reset(); ArqUI.reset(); WarUI.render(room); }
    else enqueue(room);
    if (room.phase === 'game' && room.game !== 'ludo') watchers(room); else $('#watch-pill')?.remove();
  }

  // quem está assistindo (todos os jogos menos o Ludo, que tem o seu): selo com as fotos sobre a mesa
  const spectating = () => !!Room.room?.spectators?.some(s => s.id === Room.myId);
  const confirmLeave = () => spectating() || confirm(Room.isHost ? 'Você é o anfitrião: sair encerra a partida para todos. Sair?' : 'Sair da partida? Um bot jogará por você até você voltar.');
  function watchers(room) {
    const list = room.spectators || [], W = $('#board-wrap'); let el = $('#watch-pill', W);
    if (!list.length || !W) { el?.remove(); return; }
    if (!el) { el = document.createElement('div'); el.id = 'watch-pill'; W.appendChild(el); }
    const me = spectating();
    el.classList.toggle('me', me);
    el.innerHTML = `${me ? '<b>👀 Você está assistindo</b>' : `<b>👀 ${list.length}</b>`}${list.map(s => `<img src="${charById(s.char).img}" alt="" title="${esc(s.name)} está assistindo">`).join('')}${me ? '<small>entra na próxima partida quando houver vaga</small>' : ''}`;
  }

  function chatHTML(room) {
    return room.chat.map(c => c.from ? `<div class="msg"><b style="color:${esc(room.players.find(p => p.id === c.from)?.color || '#ccc')}">${esc(Room.nameOf(c.from))}:</b> ${esc(c.text)}</div>` : `<div class="msg sys">${esc(c.text)}</div>`).join('');
  }
  function bindChat(root) {
    const f = $('.chat-form', root); if (!f) return;
    f.onsubmit = e => { e.preventDefault(); const i = $('input', f); if (i.value.trim()) Room.send({ t: 'chat', text: i.value }); i.value = ''; };
    const box = $('.chat-box', root); if (box) box.scrollTop = box.scrollHeight;
  }

  let sentHat = null, sentScene = null;
  function renderRoom(room) {
    show('scr-room');
    const host = Room.isHost, mine = room.players.find(p => p.id === Room.myId);
    const allReady = room.players.length >= 2 && room.players.every(p => p.ready);
    const gName = GAME_LIBRARY.find(g => g.id === room.game)?.name || 'Magnata', maxP = room.game === 'ultima' ? 10 : room.game === 'patrimonio' ? 8 : room.game === 'arq' ? 6 : room.game === 'domino2' ? Domino2.maxSeats(room.settings.d9) : room.game === 'ludo' ? (room.settings.seats || 4) : room.game === 'conjura' ? 10 : room.game === 'cah' ? 12 : room.game === 'war' ? 6 : 8;
    const root = $('#scr-room');
    const freeSlot = i => `<button class="seat empty free" data-seat="${i}" style="--sc:${Ludo.SEATS[i].color}" ${mine ? '' : 'disabled'}><i class="seatchip"></i><b>${Ludo.SEATS[i].name}</b><small>${mine ? 'Vaga livre<br>clique para ficar com esta cor' : 'Vaga livre'}</small></button>`;
    const focused = document.activeElement?.closest('.chat-form') ? $('.chat-form input', root)?.value : null;
    root.innerHTML = `
      <header class="topbar"><button class="btn ghost" id="room-leave">← Sair</button>
        <div class="code"><span class="muted">Sala de ${esc(gName)}</span><b>${esc(room.code)}</b><button class="btn small" id="copy-code">Copiar convite</button></div><span></span></header>
      <div class="room-grid">
        <div class="card">
          <h3>Jogadores (${room.players.length}/${maxP})</h3>
          <div class="seats ${room.game === 'ludo' ? 'ludo' + maxP : ''}">${(room.game === 'ludo' ? [...Array(maxP).keys()].map(i => room.players.find(p => p.seat === i) ?? i) : room.players).map(p => typeof p === 'number' ? freeSlot(p) : `
            <div class="seat ${p.ready ? 'ready' : ''}" ${room.game === 'ludo' && p.seat != null ? `style="--sc:${Ludo.SEATS[p.seat].color}"` : room.game === 'war' && p.seat != null ? `style="--sc:${War.COLORS[p.seat].hex}"` : room.game === 'arq' && p.seat != null ? `style="--sc:${Arq.COLORS[p.seat].hex}"` : room.game === 'patrimonio' ? `style="--sc:${esc(p.color)}"` : ''}>${(room.game === 'ludo' || room.game === 'war' || room.game === 'arq' || room.game === 'patrimonio') && p.seat != null ? `<i class="seatchip" title="${room.game === 'patrimonio' ? 'Cor do perfil' : room.game === 'war' ? War.COLORS[p.seat].name : room.game === 'arq' ? Arq.COLORS[p.seat].name : Ludo.SEATS[p.seat].name}"></i>` : ''}${room.game === 'war' && generalById(p.general) ? `<img class="gen-face" src="${generalById(p.general).thumb}" alt="">` : avatar(p, 84)}<b>${esc(p.name)}${room.game === 'ludo' && p.hat && p.hat !== 'none' ? ' ' + LUDO_HATS.find(h => h.id === p.hat)?.icon : ''}</b><small>${room.game === 'ludo' && p.seat != null ? `<em class="seatname">${Ludo.SEATS[p.seat].name}</em>` : room.game === 'war' ? `<em class="seatname war-seatname">${p.seat != null ? 'Exército ' + War.COLORS[p.seat].name.toLowerCase() : ''}${generalById(p.general) ? ' · ' + esc(generalById(p.general).name) : ''}</em>` : esc(p.title)}</small>${p.relay ? '<span class="net-tag" title="Conectado pelo servidor de reserva">🛰️ reserva</span>' : ''}
              <span class="badge ${p.ready ? 'ok' : ''}">${p.id === room.hostId ? '👑 Anfitrião' : p.bot ? '🤖 Bot' : p.ready ? 'Pronto' : 'Aguardando'}</span>
              ${host && p.id !== room.hostId ? `<button class="kick" data-kick="${esc(p.id)}" title="Remover">✕</button>` : ''}</div>`).join('')}
            ${room.game === 'ludo' ? '' : Array.from({ length: Math.max(0, 2 - room.players.length) }, () => '<div class="seat empty">Aguardando jogador…</div>').join('')}
          </div>
          ${room.spectators?.length ? `<p class="muted small">${room.game === 'domino2' ? '⏳ Na fila' : '👀 Assistindo'}: ${room.spectators.map(s => esc(s.name)).join(', ')}</p>` : ''}
          ${room.game === 'ludo' ? `
          <h3>Chapéu das suas peças</h3>
          <div class="hats">${LUDO_HATS.map(h => `<button class="charpick hatpick ${(mine?.hat || 'none') === h.id ? 'on' : ''}" data-hat="${h.id}" title="${esc(h.name)}"><span>${h.icon}</span><small>${esc(h.name)}</small></button>`).join('')}</div>` : ''}
          ${room.game === 'magnata' ? `
          <h3>Seu peão (3D)</h3>
          <div class="hats">${MAGNATA_TOKENS.map(k => `<button class="charpick hatpick ${(mine?.token || 'classic') === k.id ? 'on' : ''}" data-token="${k.id}" title="${esc(k.name)}"><span>${k.icon}</span><small>${esc(k.name)}</small></button>`).join('')}</div>` : ''}
          ${room.game === 'patrimonio' ? PatUI.lobbyPicks(room, mine) : ''}
          ${room.game === 'arq' ? `
          <h3>Cor das suas peças</h3>
          <div class="hats">${Arq.COLORS.map((c, i) => { const by = room.players.find(p => p.seat === i); return `<button class="charpick hatpick war-color ${mine?.seat === i ? 'on' : ''}" data-seat="${i}" ${by && by !== mine ? 'disabled' : ''} style="--sc:${c.hex}" title="${esc(c.name)}${by && by !== mine ? ' (já escolhida)' : ''}"><span class="swatch"></span><small>${esc(c.name)}</small></button>`; }).join('')}</div>` : ''}
          ${room.game === 'war' ? `
          <h3>Cor do seu exército</h3>
          <div class="hats">${War.COLORS.map((c, i) => { const by = room.players.find(p => p.seat === i); return `<button class="charpick hatpick war-color ${mine?.seat === i ? 'on' : ''}" data-seat="${i}" ${by && by !== mine ? 'disabled' : ''} style="--sc:${c.hex}" title="${esc(c.name)}${by && by !== mine ? ' (já escolhida)' : ''}"><span class="swatch"></span><small>${esc(c.name)}</small></button>`; }).join('')}</div>
          <h3>Seu comandante</h3>
          <div class="chars small gens">${WAR_GENERALS.map(g => { const by = room.players.find(p => p.general === g.id && p !== mine); return `<button class="charpick ${mine?.general === g.id ? 'on' : ''}" data-general="${g.id}" ${by ? 'disabled' : ''} title="${esc(g.name)}${by ? ' (com ' + esc(by.name) + ')' : ''}"><img src="${g.thumb}" alt="" onerror="this.style.visibility='hidden'"><small>${esc(g.name)}</small></button>`; }).join('')}</div>` : ''}
          <h3>Seu personagem</h3>
          <div class="chars small">${CHARACTERS.map(c => `<button class="charpick ${mine?.char === c.id ? 'on' : ''}" data-char="${c.id}" title="${esc(c.name)}"><img src="${c.img}" alt="" onerror="this.style.visibility='hidden'"></button>`).join('')}</div>
        </div>
        <div class="card side">
          <h3>Regras da mesa</h3>
          ${room.game === 'ludo' ? `<label>Jogadores</label><div class="hats">${[[4, '✚', 'Até 4'], [6, '⬢', 'Até 6']].map(([v, ic, l]) => `<button class="charpick hatpick ${maxP === v ? 'on' : ''}" data-seats="${v}" ${host ? '' : 'disabled'} title="${v === 4 ? 'Tabuleiro clássico em cruz' : 'Tabuleiro hexagonal'}"><span>${ic}</span><small>${l}</small></button>`).join('')}</div>
          <label>Cenário</label><div class="hats">${LUDO_SCENES.map(c => `<button class="charpick hatpick ${(room.settings.scene || 'classic') === c.id ? 'on' : ''}" data-scene="${c.id}" ${host ? '' : 'disabled'} title="${esc(c.name)}"><span>${c.icon}</span><small>${esc(c.name)}</small></button>`).join('')}</div>` : ''}
          ${room.game === 'conjura' ? `<label>Personagens<select id="set-variant" ${host ? '' : 'disabled'}>${[['diplomata', 'Clássico: com Diplomata (padrão)'], ['confessor', 'Variante: Confessor no lugar do Diplomata'], ['completa', 'Corte completa: os 8 personagens']].map(([v, l]) => `<option value="${v}" ${(room.settings.variant || 'diplomata') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <label>Tempo para reagir<select id="set-respond" ${host ? '' : 'disabled'}>${[[10, '10 segundos'], [15, '15 segundos (padrão)'], [25, '25 segundos']].map(([v, l]) => `<option value="${v}" ${(room.settings.respondSec || 15) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>` : ''}
          ${room.game === 'cah' ? `<label>Pontos para vencer<select id="set-goal" ${host ? '' : 'disabled'}>${[5, 7, 10, 15].map(v => `<option value="${v}" ${(room.settings.goal || 7) === v ? 'selected' : ''}>${v} pontos</option>`).join('')}</select></label>
            <label>Tempo para responder<select id="set-answer" ${host ? '' : 'disabled'}>${[45, 60, 90, 120].map(v => `<option value="${v}" ${(room.settings.answerSec || 60) === v ? 'selected' : ''}>${v} s</option>`).join('')}</select></label>
            <label class="chk"><input type="checkbox" id="set-gamble" ${room.settings.gamble !== false ? 'checked' : ''} ${host ? '' : 'disabled'}> 🎲 Apostas (regra oficial)</label>
            <label class="chk"><input type="checkbox" id="set-swap" ${room.settings.swap !== false ? 'checked' : ''} ${host ? '' : 'disabled'}> 🔄 Trocar até 2 cartas por rodada com o monte</label>
            <label class="chk"><input type="checkbox" id="set-reboot" ${room.settings.reboot ? 'checked' : ''} ${host ? '' : 'disabled'}> ♻️ Reiniciar o Universo (regra da casa)</label>` : ''}
          ${room.game === 'magnata' ? `<label>Mesa</label><div class="hats">${MAGNATA_TABLES.map(c => `<button class="charpick hatpick ${(room.settings.table || 'wood') === c.id ? 'on' : ''}" data-mtable="${c.id}" ${host ? '' : 'disabled'} title="${esc(c.name)}"><span>${c.icon}</span><small>${esc(c.name)}</small></button>`).join('')}</div>` : ''}
          ${room.game === 'war' ? `<label>Tempo por ação<select id="set-turn" ${host ? '' : 'disabled'}>${[[60, '1 minuto'], [90, '1 min 30 s (padrão)'], [120, '2 minutos'], [180, '3 minutos'], [0, 'Sem limite']].map(([v, l]) => `<option value="${v}" ${(room.settings.turnSec ?? 90) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>` : ''}
          ${room.game === 'patrimonio' ? PatUI.lobbyRules(room, host) : ''}
          ${room.game === 'ultima' ? UltUI.lobbyRules(room, host) : ''}
          ${room.game === 'arq' ? `<label>Mapa<select id="set-arqmap" ${host ? '' : 'disabled'}>${[['random', 'Aleatório (só as regras de número)'], ['balanced', 'Equilibrado (recursos e números bem distribuídos)']].map(([v, l]) => `<option value="${v}" ${(room.settings.mapMode || 'random') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <label>Tempo por vez<select id="set-arqturn" ${host ? '' : 'disabled'}>${[[90, '1 min 30 s'], [120, '2 minutos (padrão)'], [180, '3 minutos'], [0, 'Sem limite']].map(([v, l]) => `<option value="${v}" ${(room.settings.arqTurnSec ?? 120) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <p class="muted small">${room.players.length >= 5 ? '🗺️ Ilha grande (30 hexágonos) para 5–6 jogadores: vence com 11 pontos.' : '🗺️ Ilha padrão (19 hexágonos) para 2–4 jogadores: vence com 10 pontos.'}</p>` : ''}
          ${room.game === 'domino2' ? (() => { const D2 = Domino2UI, ar = room.settings.arena || 'bar', ms = D2.mesaOf(ar, room.settings.mesa), w = D2.wins(); let pd = 'marfim'; try { pd = localStorage.getItem('d2-pedra') || pd; } catch {}
            return `<label class="chk"><input type="checkbox" id="set-d9" ${room.settings.d9 ? 'checked' : ''} ${host ? '' : 'disabled'}> 🁫 Dominó de 9: 55 pedras (até o 9-9), de 2 a 8 na mesa</label>
            <label class="chk"><input type="checkbox" id="set-rodizio" ${room.settings.rodizio !== false ? 'checked' : ''} ${host ? '' : 'disabled'}> 🔄 Rodízio: quem perde sai e dá a vez para quem está na fila (quem chega com a mesa cheia entra na fila)</label>
            <label class="chk"><input type="checkbox" id="set-gato" ${room.settings.gato ? 'checked' : ''} ${host ? '' : 'disabled'}> 🐱 Vale gato (modo extra: pode jogar pedra que não encaixa; quem pegar pede gato)</label>
            <label>Cenário</label><div class="hats">${D2.ARENAS.map(([k, i, t]) => `<button class="charpick hatpick ${ar === k ? 'on' : ''}" data-d2a="${k}" ${host ? '' : 'disabled'} title="${t}"><span>${i}</span><small>${t}</small></button>`).join('')}</div>
            ${ar === 'padrao' ? '' : `<label>Mesa</label><div class="hats">${D2.mesasOf(ar).map(([k, i, t]) => `<button class="charpick hatpick ${ms === k ? 'on' : ''}" data-d2m="${k}" ${host ? '' : 'disabled'} title="${t}"><span>${i}</span><small>${t}</small></button>`).join('')}</div>`}
            ${D2.DAY.includes(ar) ? `<label class="chk"><input type="checkbox" id="set-dia" ${room.settings.dia ? 'checked' : ''} ${host ? '' : 'disabled'}> ☀️ De dia (desmarcado: de noite)</label>` : ''}
            <label>Suas pedras (só na sua tela)<select id="set-pedra">${D2.PEDRAS.map(([k, t, n]) => `<option value="${k}" ${pd === k && w >= n ? 'selected' : ''} ${w >= n ? '' : 'disabled'}>${t}${w >= n ? '' : ` 🔒 ${n} vitória${n > 1 ? 's' : ''}`}</option>`).join('')}</select></label>
            <label class="chk"><input type="checkbox" id="set-leve" ${(() => { try { return localStorage.getItem('d2-leve') === '1'; } catch { return false; } })() ? 'checked' : ''}> 🪶 Modo leve neste aparelho (só a mesa de feltro, sem cenário)</label>`; })() : ''}
          ${['ludo', 'conjura', 'cah', 'war', 'domino2', 'arq', 'patrimonio', 'ultima'].includes(room.game) ? '' : `<label>Dinheiro inicial<select id="set-money" ${host ? '' : 'disabled'}>${ECON.START_OPTIONS.map(v => `<option value="${v}" ${room.settings.startMoney === v ? 'selected' : ''}>${M(v)}</option>`).join('')}</select></label>
          <label>Limite de rodadas<select id="set-rounds" ${host ? '' : 'disabled'}>${[[20, '20 rodadas (rápida)'], [30, '30 rodadas (padrão)'], [45, '45 rodadas (longa)'], [0, 'Sem limite (até a falência)']].map(([v, l]) => `<option value="${v}" ${room.settings.maxRounds === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <label>Tempo por vez<select id="set-turn" ${host ? '' : 'disabled'}>${[[60, '1 minuto'], [90, '1 min 30 s (padrão)'], [120, '2 minutos'], [180, '3 minutos'], [0, 'Sem limite']].map(([v, l]) => `<option value="${v}" ${(room.settings.turnSec ?? 90) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>`}
          ${host ? `<button class="btn" id="add-bot" ${room.players.length >= maxP ? 'disabled' : ''}>🤖 Adicionar bot</button>
            <button class="btn primary big" id="start" ${allReady ? '' : 'disabled'}>Iniciar partida</button>
            ${allReady ? '' : '<p class="muted small">Precisa de 2+ jogadores, todos prontos.</p>'}`
          : mine ? `<button class="btn ${mine.ready ? '' : 'primary'} big" id="ready">${mine.ready ? 'Cancelar pronto' : 'Estou pronto!'}</button>` : '<p class="muted">👀 Você está assistindo. Entra assim que abrir uma vaga.</p>'}
          <h3>Chat</h3>
          <div class="chat-box">${chatHTML(room)}</div>
          <form class="chat-form"><input placeholder="Mensagem…" maxlength="300"><button class="btn">Enviar</button></form>
        </div>
      </div>`;
    if (focused !== null) { const i = $('.chat-form input', root); i.value = focused; i.focus(); }
    bindChat(root);
    $('#room-leave').onclick = () => { if (confirm(host ? 'Fechar a sala para todos?' : 'Sair da sala?')) { Room.leave(); enterHub('games'); } };
    $('#copy-code').onclick = () => {
      const url = location.href.split('?')[0].split('#')[0] + '?sala=' + room.code;
      navigator.clipboard?.writeText(`Bora jogar ${gName} na Mesa Viva! Código: ${room.code}\n${url}`).then(() => toast('Convite copiado!', 'ok'), () => toast('Código: ' + room.code));
    };
    $$('[data-kick]', root).forEach(b => b.onclick = () => Room.send({ t: 'kick', id: b.dataset.kick }));
    $$('[data-pathat]', root).forEach(b => b.onclick = () => Room.send({ t: 'pathat', v: b.dataset.pathat }));
    $$('[data-seat]', root).forEach(b => b.onclick = () => Room.send({ t: 'seat', v: +b.dataset.seat }));
    $$('[data-hat]', root).forEach(b => b.onclick = () => { try { localStorage.setItem('ludo-hat', b.dataset.hat); } catch {} Room.send({ t: 'hat', v: b.dataset.hat }); });
    $$('[data-seats]', root).forEach(b => b.onclick = () => Room.send({ t: 'settings', settings: { seats: +b.dataset.seats } }));
    $$('[data-scene]', root).forEach(b => b.onclick = () => { try { localStorage.setItem('ludo-scene', b.dataset.scene); } catch {} Room.send({ t: 'settings', settings: { scene: b.dataset.scene } }); });
    if (room.game === 'ludo' && host && room.settings.scene == null && sentScene !== room.code) { sentScene = room.code; try { const c = localStorage.getItem('ludo-scene'); if (c) Room.send({ t: 'settings', settings: { scene: c } }); } catch {} }
    // lembra o último chapéu escolhido ao entrar numa sala nova
    if (room.game === 'ludo' && mine && mine.hat == null && sentHat !== room.code) { sentHat = room.code; try { const h = localStorage.getItem('ludo-hat'); if (h) Room.send({ t: 'hat', v: h }); } catch {} }
    $$('[data-token]', root).forEach(b => b.onclick = () => { try { localStorage.setItem('magnata-token', b.dataset.token); } catch {} Room.send({ t: 'token', v: b.dataset.token }); });
    $$('[data-mtable]', root).forEach(b => b.onclick = () => { try { localStorage.setItem('magnata-table', b.dataset.mtable); } catch {} Room.send({ t: 'settings', settings: { table: b.dataset.mtable } }); });
    if (room.game === 'magnata' && mine && mine.token == null && sentHat !== 't' + room.code) { sentHat = 't' + room.code; try { const k = localStorage.getItem('magnata-token'); if (k) Room.send({ t: 'token', v: k }); } catch {} }
    if (room.game === 'magnata' && host && room.settings.table == null && sentScene !== 'm' + room.code) { sentScene = 'm' + room.code; try { const k = localStorage.getItem('magnata-table'); if (k) Room.send({ t: 'settings', settings: { table: k } }); } catch {} }
    $$('[data-general]', root).forEach(b => b.onclick = () => { try { localStorage.setItem('war-general', b.dataset.general); } catch {} Room.send({ t: 'general', v: b.dataset.general }); });
    if (room.game === 'war' && mine && mine.general == null && sentHat !== 'g' + room.code) {
      const LIST = WAR_GENERALS, KEY = 'war-general';
      sentHat = 'g' + room.code; let g = null; try { g = localStorage.getItem(KEY); } catch {}
      if (!g || !LIST.some(x => x.id === g) || room.players.some(p => p !== mine && p.general === g)) g = LIST.find(x => !room.players.some(p => p.general === x.id))?.id;
      if (g) Room.send({ t: 'general', v: g });
    }
    $$('[data-char]', root).forEach(b => b.onclick = () => { me.char = b.dataset.char; Store.saveProfile(me); Room.send({ t: 'profile', profile: Store.publicProfile(me) }); });
    if (host) {
      if (room.game === 'cah') {
        $('#set-goal').onchange = e => Room.send({ t: 'settings', settings: { goal: +e.target.value } });
        $('#set-answer').onchange = e => Room.send({ t: 'settings', settings: { answerSec: +e.target.value } });
        $('#set-gamble').onchange = e => Room.send({ t: 'settings', settings: { gamble: e.target.checked } });
        $('#set-reboot').onchange = e => Room.send({ t: 'settings', settings: { reboot: e.target.checked } });
        $('#set-swap') && ($('#set-swap').onchange = e => Room.send({ t: 'settings', settings: { swap: e.target.checked } }));
      } else if (room.game === 'patrimonio') {
        PatUI.bindLobby(room, root);
      } else if (room.game === 'ultima') {
        UltUI.bindLobby(room, root);
      } else if (room.game === 'arq') {
        $('#set-arqmap').onchange = e => Room.send({ t: 'settings', settings: { mapMode: e.target.value } });
        $('#set-arqturn').onchange = e => Room.send({ t: 'settings', settings: { arqTurnSec: +e.target.value } });
      } else if (room.game === 'war') {
        $('#set-turn').onchange = e => Room.send({ t: 'settings', settings: { turnSec: +e.target.value } });
      } else if (room.game === 'conjura') {
        $('#set-variant').onchange = e => Room.send({ t: 'settings', settings: { variant: e.target.value } });
        $('#set-respond').onchange = e => Room.send({ t: 'settings', settings: { respondSec: +e.target.value } });
      } else if (room.game === 'domino2') {
        $('#set-gato').onchange = e => Room.send({ t: 'settings', settings: { gato: e.target.checked } });
        $('#set-d9').onchange = e => Room.send({ t: 'settings', settings: { d9: e.target.checked } });
        $('#set-rodizio').onchange = e => Room.send({ t: 'settings', settings: { rodizio: e.target.checked } });
        $$('[data-d2a]').forEach(b => (b.onclick = () => Room.send({ t: 'settings', settings: { arena: b.dataset.d2a } })));
        $$('[data-d2m]').forEach(b => (b.onclick = () => Room.send({ t: 'settings', settings: { mesa: b.dataset.d2m } })));
        if ($('#set-dia')) $('#set-dia').onchange = e => Room.send({ t: 'settings', settings: { dia: e.target.checked } });
        $('#set-pedra').onchange = e => { try { localStorage.setItem('d2-pedra', e.target.value); } catch {} Domino2GL.setSkin(e.target.value); };
        $('#set-leve').onchange = e => Domino2GL.setLeve(e.target.checked);
      } else if (room.game !== 'ludo') {
        $('#set-money').onchange = e => Room.send({ t: 'settings', settings: { startMoney: +e.target.value } });
        $('#set-rounds').onchange = e => Room.send({ t: 'settings', settings: { maxRounds: +e.target.value } });
        $('#set-turn') && ($('#set-turn').onchange = e => Room.send({ t: 'settings', settings: { turnSec: +e.target.value } }));
      }
      $('#add-bot').onclick = () => Room.send({ t: 'addBot' });
      $('#start').onclick = () => Room.send({ t: 'start' });
    } else if (mine) $('#ready').onclick = () => Room.send({ t: 'ready', v: !mine.ready });
  }

  // ---------- jogo ----------
  function gridPos(i) {
    if (i <= 10) return [11, 11 - i];
    if (i <= 20) return [11 - (i - 10), 1];
    if (i <= 30) return [1, 1 + (i - 20)];
    return [1 + (i - 30), 11];
  }
  const side = i => (i % 10 === 0 ? 'corner' : i < 10 ? 'bottom' : i < 20 ? 'left' : i < 30 ? 'top' : 'right');

  // ----- modo de visualização (só local: não afeta a partida nem os outros jogadores) -----
  let view3d = false, viewRot = 0;
  try { const v = JSON.parse(localStorage.getItem('mesaviva.view') || '{}'); view3d = !!v.v3d; viewRot = +v.rot || 0; } catch { }
  function setView(is3d, rot = 0, silent = false) {
    view3d = is3d; viewRot = is3d ? rot : 0;
    try { localStorage.setItem('mesaviva.view', JSON.stringify({ v3d: view3d, rot: viewRot })); } catch { }
    const b = $('#board'), wrap = $('#board-wrap'); if (!b) return;
    const gl = view3d && Board3D.supported();
    b.classList.toggle('board3d', view3d && !gl); wrap.classList.toggle('v3d', view3d && !gl); wrap.classList.toggle('webgl', gl);
    b.style.setProperty('--rz', viewRot + 'deg');
    placeTurnline();
    if (gl) {
      const code = Room.room?.code;
      Board3D.mount(wrap, { onTile: i => tileModal(i), onDice: () => $('#dice-tray').onclick() }).then(() => {
        // o 3D pode terminar de carregar depois que o jogador saiu do Magnata e abriu outro jogo:
        // só liga o tabuleiro se ainda estiver na mesma sala do Magnata
        const r = Room.room;
        if (!view3d || !r || r.code !== code || r.phase !== 'game' || ['ludo', 'conjura', 'cah', 'war', 'domino2', 'arq'].includes(r.game)) return;
        if (!Board3D.active) Board3D.setAzimuth(viewRot);
        Board3D.show(true); if (r.state) sync3d(r, r.state);
      });
    } else Board3D.show(false);
    $$('#view-ctl [data-view]').forEach(x => x.classList.toggle('on', (x.dataset.view === '3d') === view3d));
    Anim.setView(view3d && !gl);
    const st = Room.room?.state;
    if (st && !playing) Anim.restDice($('#dice-tray'), st.lastRoll?.dice?.length ? st.lastRoll.dice : [3, 4]);
    if (!silent) SFX.click();
  }

  // no 3D (WebGL) o tabuleiro 2D fica escondido: a linha de vez/rodada/tempo sobe para o topo da mesa
  function placeTurnline() {
    const tl = $('#turnline'), wrap = $('#board-wrap'), center = $('#center'); if (!tl || !wrap || !center) return;
    if (wrap.classList.contains('webgl')) { if (tl.parentNode !== wrap) wrap.appendChild(tl); }
    else if (tl.parentNode !== center) center.insertBefore(tl, $('.decks', center));
  }

  function sync3d(room, st) {
    const rp = id => room.players.find(p => p.id === id) || { name: id, char: 'vitoria' };
    Board3D.sync({
      table: room.settings.table || 'wood',
      tokens: st.players.map(p => { const r = rp(p.id); return { id: p.id, pos: p.pos, color: r.color, img: charById(r.char).img, kind: r.token || 'classic', name: r.name, cur: st.players[st.turn].id === p.id && !st.result, out: p.bankrupt }; }),
      props: Object.entries(st.props).map(([i, pr]) => ({ tile: +i, ownerColor: pr.owner ? rp(pr.owner).color : null, houses: TILES[i].type === 'street' ? pr.houses : 0, mortgaged: pr.mortgaged })),
      upgrade: st.upgrade ? { tile: st.upgrade.tile, level: st.upgrade.level } : null,
      dice: st.lastRoll?.dice?.length ? st.lastRoll.dice : [3, 4],
    });
  }

  function buildBoard(room) {
    const b = $('#board');
    b.innerHTML = TILES.map((t, i) => {
      const [r, c] = gridPos(i), sd = side(i);
      const band = t.type === 'street' ? `<div class="band" style="background:${GROUPS[t.group].color}"><div class="houses"></div></div>` : sd === 'corner' ? '' : '<div class="band plain"></div>';
      const img = t.img ? `<img class="timg" src="${t.img}" alt="" onerror="this.remove()">` : '';
      const price = t.price ? `<div class="price">${M(t.price)}</div>` : t.amount ? `<div class="price">${M(t.amount)}</div>` : '';
      return `<div class="tile ${sd} ${t.type} corner-${i}" id="t${i}" data-i="${i}" style="grid-row:${r};grid-column:${c}">
        <div class="ti">${band}<div class="tname">${esc(t.name)}</div>${img}${price}<div class="owner"></div></div></div>`;
    }).join('') + `<div class="center-area" id="center">
        <div class="center-art"><img src="${IMG.board_center}" alt="" onerror="this.remove()"></div>
        <div class="logo">MAGNATA</div>
        <div class="turnline" id="turnline"></div>
        <div class="decks"><div class="deck" id="deck-fortuna" style="background-image:url(${IMG.card_fortuna})"><span>Fortuna</span></div><div class="deck" id="deck-evento" style="background-image:url(${IMG.card_evento})"><span>Evento</span></div></div>
        <div class="dice-tray" id="dice-tray" title="Rolar dados"></div>
      </div>
      <div class="bld-layer" id="bld-layer"></div>
      <div class="token-layer" id="token-layer"></div>`;
    // sobreposição fora do tabuleiro: cartas, faixas e popups ficam sempre retos e legíveis (inclusive no 3D)
    const wrapEl = $('#board-wrap');
    $('#overlay')?.remove(); $('#view-ctl')?.remove(); $$('#board-wrap > .turnline').forEach(x => x.remove());
    wrapEl.insertAdjacentHTML('beforeend', `<div class="overlay" id="overlay"><div class="stage" id="stage"></div><div class="pop-layer" id="pop-layer"></div></div>
      <div class="view-ctl" id="view-ctl"><button data-view="2d">🗺️ 2D</button><button data-view="3d">🧊 3D</button><button data-rot="-90" class="rot" title="Girar câmera">⟲</button><button data-rot="90" class="rot" title="Girar câmera">⟳</button></div>`);
    $$('#view-ctl [data-view]').forEach(btn => btn.onclick = () => setView(btn.dataset.view === '3d', viewRot));
    $$('#view-ctl [data-rot]').forEach(btn => btn.onclick = () => { if (Board3D.active) { viewRot += +btn.dataset.rot; Board3D.rotate(+btn.dataset.rot); try { localStorage.setItem('mesaviva.view', JSON.stringify({ v3d: true, rot: viewRot })); } catch { } SFX.click(); } else setView(true, viewRot + +btn.dataset.rot); });
    $$('.tile', b).forEach(el => el.onclick = () => tileModal(+el.dataset.i));
    $('#dice-tray').onclick = () => {
      const st = Room.room?.state; if (!st || playing) return;
      if (st.players[st.turn].id === Room.myId && (!st.rolled || st.extra) && !st.pending && !st.auction) Room.send({ t: 'act', a: { type: 'roll' } });
    };
    popKey = null;
    Anim.setupTokens(b, $('#token-layer'), $('#bld-layer'));
    Board3D.reset();
    setView(view3d, viewRot, true);
    Anim.initDice($('#dice-tray'));
    const fit = () => {
      const wrap = $('#board-wrap'); const s = Math.max(320, Math.min(wrap.clientWidth, wrap.clientHeight));
      b.style.setProperty('--bw', s + 'px'); wrap.style.setProperty('--bw', s + 'px');
      requestAnimationFrame(() => { Anim.layoutAll(); const st = Room.room?.state; if (st && !playing) Anim.restDice($('#dice-tray'), st.lastRoll?.dice?.length ? st.lastRoll.dice : [3, 4]); });
    };
    new ResizeObserver(fit).observe($('#board-wrap')); fit();
  }

  // ----- fila de reprodução: cada ação do anfitrião vira uma sequência de animações, tocada em ordem -----
  let queue = [], playing = false, seenFx = 0;
  function enqueue(room) {
    queue.push(structuredClone(room));
    if (playing) refreshChat(room);
    pump();
  }
  async function pump() {
    if (playing) return; playing = true;
    try {
      while (queue.length) {
        const r = queue.shift(), st = r.state;
        if (!st) continue;
        if (r.phase !== 'game') { renderRoom(r); continue; }
        if (boardBuilt !== st.gameId) {
          // partida que acabou de começar: toca a abertura; ao reconectar no meio, não repete efeitos antigos
          const fresh = st.fx?.events?.some(e => e.k === 'intro') && !st.lastRoll;
          seenFx = fresh ? 0 : st.fx?.id || 0; renderGame(r); if (!fresh) continue;
        }
        if (st.fx && st.fx.id !== seenFx) {
          seenFx = st.fx.id;
          $('#game-side')?.classList.add('busy');
          // aba oculta: o navegador congela animações — pula direto para o estado final
          if (!document.hidden) try { await playFx(r, st.fx.events); } catch (e) { console.warn('fx', e); }
        }
        // estados intermediários sem animação podem ser pulados
        if (queue.length && !(queue[0].state?.fx && queue[0].state.fx.id !== seenFx)) continue;
        renderGame(r);
        $('#game-side')?.classList.remove('busy');
      }
    } finally { playing = false; }
  }
  function refreshChat(room) {
    const box = $('#game-side .chat-box:not(.log)'); if (!box) return;
    box.innerHTML = chatHTML(room); box.scrollTop = box.scrollHeight;
  }

  // abertura da partida: título, jogadores entrando um a um
  async function introScreen(stage, room) {
    const el = document.createElement('div'); el.className = 'intro-screen';
    el.innerHTML = `<div class="intro-logo">MAGNATA</div><div class="intro-sub">A partida vai começar!</div>
      <div class="intro-players">${room.players.map((p, i) => `<div class="intro-p" style="--c:${esc(p.color)};--i:${i}">${avatar(p, 64)}<b>${esc(p.name)}</b></div>`).join('')}</div>`;
    stage.appendChild(el); SFX.deal?.(); setTimeout(() => SFX.win?.(), 900);
    await new Promise(r => setTimeout(r, 2900)); el.classList.add('out');
    await new Promise(r => setTimeout(r, 380)); el.remove();
  }
  // falência: retrato racha e fica cinza, carimbo FALIU, dinheiro voando embora
  async function bankruptScreen(stage, p) {
    const el = document.createElement('div'); el.className = 'bk-screen';
    el.innerHTML = `<div class="bk-card" style="--c:${esc(p.color)}"><div class="bk-face">${avatar(p, 150)}<svg class="bk-crack" viewBox="0 0 100 100"><path d="M52 2 L46 30 L58 44 L40 62 L50 78 L44 98 M46 30 L28 36 M58 44 L80 40 M40 62 L20 70 M50 78 L70 86"/></svg></div>
      <b class="bk-name">${esc(p.name)}</b><div class="bk-stamp">FALIU!</div></div>
      ${Array.from({ length: 16 }, (_, k) => `<i class="bk-bill" style="--x:${(Math.random() * 120 - 60).toFixed(0)}vw;--r:${(Math.random() * 720 - 360).toFixed(0)}deg;--d:${(Math.random() * .5).toFixed(2)}s">💸</i>`).join('')}`;
    stage.appendChild(el);
    await new Promise(r => setTimeout(r, 2450)); el.classList.add('out');
    await new Promise(r => setTimeout(r, 320)); el.remove();
  }

  async function playFx(room, events) {
    const rp = id => room.players.find(p => p.id === id) || { name: id, char: 'vitoria' };
    const stage = $('#stage'), tray = $('#dice-tray');
    const g3 = Board3D.active;
    for (const e of events) {
      if (document.hidden) return;
      const t0 = performance.now();
      if (g3) Board3D.fx(e, { color: id => rp(id).color }); // efeito visual 3D de cada acontecimento
      switch (e.k) {
        case 'roll': await (g3 ? Board3D.rollDice(e.dice, { small: e.utility }) : Anim.rollDice(tray, e.dice, { small: e.utility })); break;
        case 'walk': await (g3 ? Board3D.walk(e.pid, e.from, e.steps) : Anim.walk(e.pid, e.from, e.steps)); break;
        case 'jump': await (g3 ? Board3D.jump(e.pid, e.to) : Anim.jump(e.pid, e.to)); break;
        case 'card': await Anim.showCard(stage, (g3 && Board3D.deckRect(e.deck)) || $('#deck-' + e.deck), e.deck, e.text, rp(e.pid).name, e.deck === 'fortuna' ? IMG.card_fortuna : IMG.card_evento); break;
        case 'money': (g3 ? Board3D : Anim).floatMoney(e.pid, e.amount); (e.amount > 0 ? SFX.coinUp : SFX.coinDown)(); break;
        case 'buy': case 'sold': {
          SFX[e.k === 'buy' ? 'buy' : 'gavel']();
          const o = $(`#t${e.tile} .owner`); if (o) o.style.background = rp(e.pid).color;
          (g3 ? Board3D : Anim).stamp(e.tile, e.k === 'buy' ? 'COMPRADO' : 'ARREMATADO', rp(e.pid).color);
          break;
        }
        case 'auction': SFX.auction(); Anim.banner(stage, '🔨 LEILÃO!', 'gold', 700); break;
        case 'turn': {
          const mine = e.pid === Room.myId;
          (mine ? SFX.turnMine : SFX.turnOther)();
          await Anim.banner(stage, `${avatar(rp(e.pid), 44)}<span>${mine ? 'SUA VEZ!' : 'Vez de ' + esc(rp(e.pid).name)}</span>`, mine ? 'mine' : '', 1000);
          break;
        }
        case 'build': SFX.build(); break;
        case 'bankrupt': SFX.bankrupt(); await bankruptScreen(stage, rp(e.pid)); break;
        case 'intro': {
          // o 3D pode ainda estar carregando: espera um pouco e faz a câmera descer quando ficar pronto
          if (!g3 && view3d) (async () => { for (let i = 0; i < 25 && !Board3D.active; i++) await new Promise(r => setTimeout(r, 100)); if (Board3D.active) Board3D.fx(e); })();
          await introScreen(stage, room); break;
        }
        case 'free': SFX.free(); break;
        case 'deal': SFX.deal(); break;
        case 'win': SFX.win(); break;
        case 'late': SFX.auction(); await Anim.banner(stage, '📈 <span>RETA FINAL! Aluguéis em alta</span>', 'dark', 2000); break;
        case 'seized': SFX.bankrupt(); (g3 ? Board3D : Anim).stamp(e.tile, 'PENHORADA', '#b3261e'); await Anim.banner(stage, `⚖️ <span>${esc(TILES[e.tile].name)} foi penhorada!</span>`, 'dark', 1500); break;
        case 'mortgage': SFX.coinDown?.(); (g3 ? Board3D : Anim).stamp(e.tile, 'HIPOTECADA', '#7a5a1e'); break;
        case 'soldback': SFX.coinUp(); (g3 ? Board3D : Anim).stamp(e.tile, 'VENDIDA AO BANCO', '#2f6db5'); break;
        case 'land': await landPopup(room, e); break;
        case 'upgrade': {
          const steal = !!e.stolenFrom;
          (steal ? SFX.steal : SFX.upgrade)();
          $$('.upg-badge').forEach(x => x.remove());
          (g3 ? Board3D : Anim).stamp(e.tile, steal ? 'ROUBADO!' : e.level > 1 ? `NÍVEL ${e.level}!` : 'UPGRADE!', '#8e4ec6');
          await Anim.banner(stage, steal ? `🦹 <span>${esc(rp(e.pid).name)} roubou o upgrade de ${esc(rp(e.stolenFrom).name)}!</span>` : `⭐ <span>${e.level > 1 ? 'Upgrade acumulado: ' + UPGRADE.label(e.level) : 'Upgrade em ' + esc(TILES[e.tile].name) + '!'}</span>`, 'upgrade', 1600);
          break;
        }
      }
      const left = FX.time(e) - (performance.now() - t0);
      if (left > 30 && !['roll', 'walk', 'jump', 'card', 'turn', 'bankrupt', 'upgrade', 'land'].includes(e.k)) await Anim.wait(left);
    }
  }


  // ===================== POPUPS sobre o tabuleiro =====================
  const groupColor = i => TILES[i].group ? GROUPS[TILES[i].group].color : '#6b4527';
  // ícone que representa a casa: nível de construção (ruas) ou a arte da casa especial
  const tileIcon = (i, level) => TILES[i].type === 'street' ? TIERS[level || 0].img : TILES[i].img;
  const rentAt = (i, level) => {
    const t = TILES[i];
    if (t.type === 'street') return t.rent[level];
    if (t.type === 'station') return ECON.STATION;
    return null;
  };
  function popHead(i, sub = '') {
    const t = TILES[i];
    return `<div class="pop-head" style="--g:${groupColor(i)}"><div class="pop-title">${esc(t.name)}</div>${sub ? `<div class="pop-sub">${sub}</div>` : ''}</div>`;
  }

  // ----- popup de decisão (persistente enquanto houver uma escolha pendente) -----
  let popKey = null, popMin = false;
  function renderDecision(room, st, rp) {
    const layer = $('#pop-layer'); if (!layer) return;
    const pend = st.result ? null : st.pending;
    const key = pend ? `${pend.type}:${pend.tile ?? ''}:${st.turn}:${st.round}:${st.lastRoll?.id}` : null;
    if (!key) { const old = $('.pop-decision', layer); if (old) closePop(old); popKey = null; return; }
    const cur = st.players[st.turn], mine = cur.id === Room.myId, who = rp(cur.id);
    const p = st.players[st.turn];
    let body = '', title = '';
    const waitTxt = mine ? '' : `<div class="pop-wait">${avatar(who, 26)} <span><b>${esc(who.name)}</b> está decidindo…</span></div>`;
    if (pend.type === 'buy' || pend.type === 'improve') {
      const i = pend.tile, t = TILES[i], pr = st.props[i];
      let opts = pend.type === 'buy' ? Magnata.buyOptions(st, p, i) : Magnata.improveOptions(st, p, i);
      // sem o grupo de cor completo não há construção: mostra só o terreno, com o aviso
      const noGroup = pend.type === 'buy' && t.type === 'street' && opts.slice(1).every(o => o.why === 'Só com o grupo de cor completo');
      if (noGroup) opts = opts.slice(0, 1);
      const g = t.group ? Magnata.groupTiles(t.group) : [], owned = g.filter(j => st.props[j].owner === p.id).length;
      title = popHead(i, pend.type === 'buy' ? (noGroup ? 'À venda!' : 'À venda! Esta compra completa o grupo — já dá para construir') : `Sua propriedade · hoje: ${TIERS[pr.houses].name}`);
      const hint = noGroup ? `<p class="pop-hint">🏗️ Construções (Casa → Hotel) ficam liberadas quando você tiver <b>todas as ${g.length} ruas desta cor</b> — você tem ${owned} de ${g.length}.</p>` : '';
      body = `${hint}<div class="tiers ${opts.length > 3 ? 'many' : opts.length === 1 ? 'one' : ''}">${opts.map(o => {
        const lvl = t.type === 'street' ? o.level : 0, r = rentAt(i, lvl);
        return `<button class="tier-card ${o.ok ? '' : 'off'}" data-level="${o.level}" ${o.ok && mine ? '' : 'disabled'} title="${esc(o.why || '')}">
          <img src="${tileIcon(i, lvl)}" alt=""><b>${t.type === 'street' ? TIERS[lvl].name : 'Comprar'}</b>
          <span class="tc-cost">${M(o.cost)}</span>${r != null ? `<small>aluguel ${M(r)}</small>` : '<small>aluguel pelos dados</small>'}
          ${o.why ? `<em>${esc(o.why)}</em>` : ''}</button>`;
      }).join('')}</div>
      <div class="pop-foot"><span>Saldo: <b>${M(p.money)}</b></span>
        ${mine ? (pend.type === 'buy' ? '<button class="btn" data-pop="decline">Não comprar (vai a leilão)</button>' : '<button class="btn" data-pop="skip">Agora não</button>') : ''}</div>`;
    } else if (pend.type === 'upgrade') {
      const u = st.upgrade, mineT = Object.keys(st.props).map(Number).filter(i => st.props[i].owner === cur.id);
      title = `<div class="pop-head upg"><img src="${IMG.tile_upgrade}" alt=""><div><div class="pop-title">Ateliê do Arquiteto</div><div class="pop-sub">${u && u.owner !== cur.id ? `🦹 Vai roubar o upgrade de <b>${esc(rp(u.owner).name)}</b>!` : u ? 'Acumule no mesmo imóvel ou mude o upgrade de lugar' : 'Escolha qual propriedade recebe o upgrade'}</div></div></div>`;
      body = `<div class="tiers many">${mineT.map(i => {
        const pr = st.props[i], stack = u && u.owner === cur.id && u.tile === i, lvl = stack ? Math.min(UPGRADE.MAX_LEVEL, u.level + 1) : 1, mult = UPGRADE.mult(lvl);
        const base = Magnata.rentOf(st, i, 7) / Magnata.upgradeMult(st, i);
        return `<button class="tier-card ${stack ? 'gold' : ''}" data-upg="${i}" ${mine ? '' : 'disabled'}>
          <img src="${tileIcon(i, pr.houses)}" alt=""><b>${esc(TILES[i].name)}</b><span class="tc-cost">${UPGRADE.label(lvl)}</span>
          <small>${pr.mortgaged ? 'hipotecada' : TILES[i].type === 'utility' ? 'serviço' : 'aluguel ' + M(Math.round(base * mult / 500) * 500)}</small>${stack ? `<em>${u.level >= UPGRADE.MAX_LEVEL ? 'máximo' : 'acumular!'}</em>` : ''}</button>`;
      }).join('')}</div>`;
    }
    let el = $('.pop-decision', layer);
    const fresh = !el || popKey !== key;
    if (fresh) {
      if (el) el.remove();
      el = document.createElement('div'); el.className = 'pop pop-decision in'; layer.appendChild(el);
      popMin = false; SFX.card();
    }
    popKey = key;
    el.classList.toggle('min', popMin);
    el.innerHTML = `<div class="pop-card">${title}${waitTxt}${body}<button class="pop-minbtn" title="Ver o tabuleiro">${popMin ? '▲ Mostrar decisão' : '▼ ver tabuleiro'}</button></div>`;
    $('.pop-minbtn', el).onclick = () => { popMin = !popMin; renderDecision(room, Room.room.state, rp); };
    $$('[data-level]', el).forEach(b => b.onclick = () => Room.send({ t: 'act', a: { type: pend.type === 'buy' ? 'buy' : 'improve', level: +b.dataset.level } }));
    $$('[data-upg]', el).forEach(b => b.onclick = () => Room.send({ t: 'act', a: { type: 'upgrade', tile: +b.dataset.upg } }));
    $$('[data-pop]', el).forEach(b => b.onclick = () => Room.send({ t: 'act', a: { type: b.dataset.pop } }));
  }
  function closePop(el) { el.classList.remove('in'); el.classList.add('out'); setTimeout(() => el.remove(), 260); }

  // ----- popup informativo (toca dentro da sequência de animação) -----
  async function landPopup(room, e) {
    const layer = $('#pop-layer'); if (!layer) return;
    const rp = id => room.players.find(p => p.id === id) || { name: id, char: 'vitoria' };
    const i = e.tile, t = TILES[i], who = rp(e.pid);
    let html = '', cls = '';
    switch (e.kind) {
      case 'rent': {
        const o = rp(e.owner), lvl = e.houses || 0;
        cls = 'bad';
        html = `${popHead(i, t.type === 'street' ? TIERS[lvl].name : t.type === 'station' ? 'Estação' : 'Serviço')}
          <div class="pop-big"><img class="pop-icon" src="${tileIcon(i, lvl)}" alt="">${e.mult > 1 ? `<span class="pop-mult">⭐×${String(e.mult).replace('.', ',')}</span>` : ''}</div>
          <div class="pop-flow">${avatar(who, 46)}<span class="arrow">➜</span>${avatar(o, 46)}</div>
          <div class="pop-amount neg">−${M(e.amount)}</div><div class="pop-line"><b>${esc(who.name)}</b> pagou aluguel a <b>${esc(o.name)}</b></div>`;
        break;
      }
      case 'tax': cls = 'bad'; html = `${popHead(i)}<div class="pop-big"><img class="pop-icon" src="${t.img}" alt=""></div><div class="pop-amount neg">−${M(e.amount)}</div><div class="pop-line"><b>${esc(who.name)}</b> pagou ao banco</div>`; break;
      case 'own': html = `${popHead(i, 'Sua propriedade')}<div class="pop-big"><img class="pop-icon" src="${tileIcon(i, room.state.props[i]?.houses)}" alt=""></div><div class="pop-line"><b>${esc(who.name)}</b> está em casa. Nada a pagar!</div>`; break;
      case 'mortgaged': html = `${popHead(i, 'Hipotecada')}<div class="pop-big"><img class="pop-icon gray" src="${tileIcon(i, room.state.props[i]?.houses)}" alt=""></div><div class="pop-line">Propriedade de <b>${esc(rp(e.owner).name)}</b> está hipotecada: sem aluguel.</div>`; break;
      case 'visit': html = `${popHead(i, 'Só visitando')}<div class="pop-big"><img class="pop-icon" src="${t.img}" alt=""></div><div class="pop-line"><b>${esc(who.name)}</b> dá um oi para os presos.</div>`; break;
      case 'gotojail': cls = 'bad'; html = `${popHead(i)}<div class="pop-big"><img class="pop-icon" src="${t.img}" alt=""></div><div class="pop-line big">🚓 <b>${esc(who.name)}</b> vai direto para a Delegacia!</div>`; break;
      case 'start': cls = 'good'; html = `${popHead(i)}<div class="pop-big"><img class="pop-icon" src="${t.img}" alt=""></div><div class="pop-line">Bem na Partida!</div>`; break;
      case 'noupgrade': html = `${popHead(i)}<div class="pop-big"><img class="pop-icon" src="${t.img}" alt=""></div><div class="pop-line"><b>${esc(who.name)}</b> não tem propriedades para melhorar.</div>`; break;
      default: return;
    }
    const el = document.createElement('div'); el.className = `pop pop-info in ${cls}`;
    el.innerHTML = `<div class="pop-card">${html}<em class="pop-skip">toque para continuar</em></div>`;
    layer.appendChild(el);
    (cls === 'bad' ? SFX.coinDown : SFX.card)();
    let skip; const clicked = new Promise(r => (skip = r)); el.onclick = () => skip();
    await Promise.race([Anim.wait(FX.time(e) - 300), clicked]);
    closePop(el); await Anim.wait(250);
  }


  // ===== relógios =====
  const fmtDur = ms => { const t = Math.floor(ms / 1000), h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, s = String(t % 60).padStart(2, '0'); return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`; };
  // duração da partida (pílula no canto do tabuleiro/mesa; para no fim do jogo)
  function matchClock(parent, st) {
    if (!parent || !st?.startAt) return;
    let c = parent.querySelector(':scope > .match-clock');
    if (!c) { c = document.createElement('div'); c.className = 'match-clock'; c.title = 'Duração da partida'; parent.appendChild(c); }
    c._st = st; const paint = () => { c.textContent = '⏱ ' + fmtDur(Math.max(0, (c._st.endAt || Room.now()) - c._st.startAt)); };
    paint(); clearInterval(c._iv); if (!st.endAt) c._iv = setInterval(() => c.isConnected ? paint() : clearInterval(c._iv), 1000);
  }
  // tempo da vez no Magnata: contagem regressiva; fica vermelho e pulsa nos últimos 15 s
  let turnIv = null, turnWarned = '';
  function turnClock(st, myTurn) {
    clearInterval(turnIv);
    const el = $('#turn-clock'); if (!el || !st.deadline || st.result) return;
    const key = st.turn + ':' + st.round;
    const paint = () => {
      if (!el.isConnected) return clearInterval(turnIv);
      const left = Math.max(0, st.deadline - Room.now()), s = Math.ceil(left / 1000);
      const auto = st.afk && st.afk === st.players[st.turn].id;
      el.textContent = st.auction ? '⏳ leilão' : auto ? '🤖 automático' : '⏳ ' + fmtDur(left + 999);
      el.classList.toggle('low', !st.auction && !auto && s <= 15);
      if (myTurn && !st.auction && s <= 15 && s > 0 && turnWarned !== key) { turnWarned = key; toast('⏳ Seu tempo está acabando! Faça sua jogada.', 'err'); }
    };
    paint(); turnIv = setInterval(paint, 250);
  }

  function renderGame(room) {
    const st = room.state; if (!st) return;
    show('scr-game');
    const first = boardBuilt !== st.gameId;
    if (first) { buildBoard(room); boardBuilt = st.gameId; lastTradeId = 0; cashShown = {}; }
    const rp = id => room.players.find(p => p.id === id) || { name: id, char: 'vitoria' };
    const myP = st.players.find(p => p.id === Room.myId);
    for (const m of MAGNATA_TABLES) $('#scr-game').classList.toggle('mt-' + m.id, (room.settings.table || 'wood') === m.id && room.game === 'magnata');
    const curP = st.players[st.turn], myTurn = curP.id === Room.myId && !st.result;

    // propriedades no tabuleiro
    for (const [i, pr] of Object.entries(st.props)) {
      const el = $('#t' + i); if (!el) continue;
      el.classList.toggle('mortgaged', pr.mortgaged);
      el.classList.toggle('owned', !!pr.owner);
      const o = $('.owner', el); o.style.background = pr.owner ? rp(pr.owner).color : 'transparent';
      o.title = pr.owner ? 'Dono: ' + rp(pr.owner).name : '';
      const h = $('.houses', el); if (h) h.innerHTML = pr.houses === 5 ? '<span class="hotel"></span>' : '<span class="house"></span>'.repeat(pr.houses);
      if (TILES[i].type === 'street') {
        let ic = $('.tier-ico', el);
        if (pr.houses > 0) { if (!ic) { ic = document.createElement('img'); ic.className = 'tier-ico'; ic.alt = ''; $('.tname', el).after(ic); } if (ic.dataset.l !== String(pr.houses)) { ic.src = TIERS[pr.houses].img; ic.dataset.l = pr.houses; ic.title = TIERS[pr.houses].name; } }
        else if (ic) ic.remove();
      }
    }
    $$('.upg-badge').forEach(x => x.remove());
    if (st.upgrade) $('#t' + st.upgrade.tile)?.insertAdjacentHTML('beforeend', `<div class="upg-badge" style="--c:${esc(rp(st.upgrade.owner).color)}" title="Upgrade de ${esc(rp(st.upgrade.owner).name)}">⭐${UPGRADE.label(st.upgrade.level)}</div>`);
    $$('.tile').forEach(el => el.classList.toggle('pending', (st.pending?.type === 'buy' && st.pending.tile === +el.dataset.i) || st.auction?.tile === +el.dataset.i));

    if (first) Anim.restDice($('#dice-tray'), st.lastRoll?.dice || [3, 4]);
    $('#dice-tray').classList.toggle('can-roll', myTurn && (!st.rolled || st.extra) && !st.pending && !st.auction && (myP?.money ?? 0) >= 0);

    $('#turnline').innerHTML = st.result ? '<span>Fim de jogo!</span>' : `${avatar(rp(curP.id), 30)} <span>${myTurn ? '<b>Sua vez!</b>' : 'Vez de <b>' + esc(rp(curP.id).name) + '</b>'}</span><small>Rodada ${st.round}${st.maxRounds ? '/' + st.maxRounds : ''}</small>${st.deadline ? '<small class="turn-clock" id="turn-clock" title="Tempo para jogar: se acabar, o jogo faz a jogada automática"></small>' : ''}`;
    turnClock(st, myTurn);
    matchClock($('#board-wrap'), st);

    if (Board3D.active) sync3d(room, st);
    Anim.syncBuildings(Object.entries(st.props).filter(([i, pr]) => TILES[i].type === 'street' && pr.owner && pr.houses > 0).map(([i, pr]) => ({ tile: +i, level: pr.houses })));
    Anim.syncTokens(st.players.map(p => {
      const r = rp(p.id);
      return { id: p.id, pos: p.pos, color: r.color, img: charById(r.char).img, name: r.name, cur: st.players[st.turn].id === p.id && !st.result, out: p.bankrupt };
    }));
    renderSidebar(room, st, myP, myTurn, rp);

    // negociação recebida
    if (st.trade && st.trade.to === Room.myId && st.trade.id !== lastTradeId) { lastTradeId = st.trade.id; SFX.deal(); tradeIncoming(room, st, rp); }
    if (!st.trade && lastTradeId && $('.modal.trade-in')) closeModal();
    renderDecision(room, st, rp);

    // resultado
    if (st.result && resultShown !== st.gameId) {
      resultShown = st.gameId;
      Store.recordGame(st.gameId, st.result, room.players, me);
      me = Store.profileOf(me.username) || me;
      setTimeout(() => showResult(room, st, rp), 600);
    }
  }

  function renderSidebar(room, st, myP, myTurn, rp) {
    const S = $('#game-side');
    const keepChat = $('.chat-form input', S)?.value || '';
    const hadFocus = document.activeElement?.closest('#game-side .chat-form');
    const acts = [];
    if (myP && !myP.bankrupt && !st.result) {
      if (myTurn && st.auction) acts.push('<div class="offer">🔨 Leilão em andamento — seu turno continua quando ele terminar.</div>');
      else if (myTurn) {
        if (st.pending) {
          acts.push(`<div class="offer">👆 Faça sua escolha no painel sobre o tabuleiro.</div><button class="btn small" id="pop-open">Mostrar decisão</button>`);
        } else if (false) {
          const u = st.upgrade, mineT = Object.keys(st.props).map(Number).filter(i => st.props[i].owner === Room.myId);
          acts.push(`<div class="offer upg"><b>⭐ Ateliê do Arquiteto!</b><br>${u && u.owner !== Room.myId ? `Você vai <b>roubar</b> o upgrade de ${esc(rp(u.owner).name)}. ` : ''}Escolha qual propriedade recebe o upgrade:</div>`);
          acts.push(`<div class="upg-list">${mineT.map(i => { const stack = u && u.owner === Room.myId && u.tile === i; return `<button class="btn small ${stack ? 'gold' : ''}" data-upg="${i}"><i style="background:${TILES[i].group ? GROUPS[TILES[i].group].color : '#999'}"></i>${esc(TILES[i].name)}<small>${stack ? 'acumular → ×' + (u.level + 2) : '×2'}</small></button>`; }).join('')}</div>`);
        } else if (st.pending?.type === 'buy') {
          const t = TILES[st.pending.tile];
          acts.push(`<div class="offer"><b>${esc(t.name)}</b> está à venda por <b>${M(t.price)}</b></div>`);
          acts.push(`<button class="btn primary" data-act="buy" ${myP.money < t.price ? 'disabled' : ''}>Comprar</button><button class="btn" data-act="decline">Não comprar (vai a leilão)</button>`);
        } else {
          if (myP.inJail && !st.rolled) {
            acts.push(`<button class="btn" data-act="payJail" ${myP.money < ECON.JAIL_FINE ? 'disabled' : ''}>Pagar fiança ${M(ECON.JAIL_FINE)}</button>`);
            if (myP.jailCards.length) acts.push(`<button class="btn" data-act="useJailCard">Usar carta (${myP.jailCards.length})</button>`);
          }
          if (!st.rolled || st.extra) acts.push(`<button class="btn primary big" data-act="roll" ${myP.money < 0 ? 'disabled' : ''}>🎲 ${st.extra ? 'Rolar de novo (dupla!)' : myP.inJail ? 'Tentar dupla' : 'Rolar dados'}</button>`);
          else acts.push(`<button class="btn primary big" data-act="end" ${myP.money < 0 ? 'disabled' : ''}>Encerrar turno ➜</button>`);
        }
      }
      if (myP.money < 0) acts.push(`<div class="offer warn">Você deve ${M(-myP.money)}. Venda propriedades ao banco (70% do terreno, construções pela metade), hipoteque (caro e com prazo), ou:</div><button class="btn gold" id="btn-sellback">🏦 Vender ao banco</button><button class="btn danger" data-act="bankrupt">Declarar falência</button>`);
      acts.push(`<div class="row"><button class="btn small" id="btn-trade" ${st.trade ? 'disabled' : ''}>🤝 Negociar</button><button class="btn small" id="btn-props">🏠 Minhas propriedades</button></div>`);
      acts.push(flipBtnHTML(room, st));
      if (st.trade && st.trade.to === Room.myId) acts.push(`<div class="offer">${esc(rp(st.trade.from).name)} te propôs uma troca. <button class="btn small primary" id="btn-see-trade">Ver proposta</button></div>`);
      if (st.trade && st.trade.from === Room.myId) acts.push(`<div class="offer">Aguardando ${esc(rp(st.trade.to).name)} responder à troca… <button class="btn small" data-act="tradeDecline">Cancelar</button></div>`);
    } else if (myP?.bankrupt) acts.push('<div class="offer">Você faliu 💀 — acompanhe a partida.</div>');

    // leilão
    let auHTML = '';
    const au = st.auction;
    const keepBid = $('#au-amount', S)?.value || '', auFocus = document.activeElement?.id === 'au-amount';
    if (au && !st.result) {
      const t = TILES[au.tile];
      const canBid = myP && !myP.bankrupt && !au.passed.includes(Room.myId);
      const min = Math.max(ECON.MIN_BID, au.high + 1);
      const inc = [K(10), K(50), K(150)].map(d => au.high ? au.high + d : Math.max(ECON.MIN_BID, d));
      auHTML = `<div class="card auction">
        <h3>🔨 Leilão: ${esc(t.name)}</h3>
        <div class="au-top"><div><div class="muted small">Lance atual</div><div class="au-high">${au.high ? M(au.high) : '—'}</div>
          <div class="small">${au.bidder ? 'de <b>' + esc(rp(au.bidder).name) + '</b>' : 'Nenhum lance ainda (mín. ' + M(ECON.MIN_BID) + ')'}</div></div>
          <div class="center"><div class="muted small">Tempo</div><div class="au-time" id="au-time">--</div></div></div>
        <div class="muted small">Preço de tabela ${M(t.price)}${au.passed.length ? ' · Desistiram: ' + au.passed.map(id => esc(rp(id).name)).join(', ') : ''}</div>
        ${canBid ? (au.bidder === Room.myId ? '<div class="offer" style="margin-top:8px">Você está ganhando! 🏆</div>' : `
          <div class="au-btns">${inc.map(v => `<button class="btn small" data-bid="${v}" ${v > myP.money ? 'disabled' : ''}>${M(v)}</button>`).join('')}</div>
          <div class="au-custom"><input type="number" id="au-amount" min="${min}" placeholder="Outro valor (mín. ${M(min)})"><button class="btn primary small" id="au-go">Dar lance</button></div>
          <button class="btn small" id="au-pass" style="width:100%">Desistir</button>`) : '<p class="muted small">Você não participa mais deste leilão.</p>'}
      </div>`;
    }

    S.innerHTML = `${auHTML}
      <div class="card players">${st.players.map((p, i) => {
        const r = rp(p.id); const cnt = Object.values(st.props).filter(x => x.owner === p.id);
        return `<div class="pl ${i === st.turn && !st.result ? 'cur' : ''} ${p.bankrupt ? 'out' : ''}">${avatar(r, 42)}
          <div class="pinfo"><b>${esc(r.name)}</b>${r.bot ? ' 🤖' : ''}${r.connected === false ? ' <span class="badge">offline</span>' : ''}
            <small>${p.bankrupt ? 'Falido' : p.inJail ? '🔒 Na delegacia' : esc(TILES[p.pos].name)} · ${cnt.length} 🏠</small>
            <div class="dots">${Object.entries(st.props).filter(([, x]) => x.owner === p.id).map(([ti]) => `<i style="background:${TILES[ti].group ? GROUPS[TILES[ti].group].color : '#bbb'}"></i>`).join('')}</div></div>
          <div class="cash ${p.money < 0 ? 'neg' : ''}"><span class="cv" data-pid="${esc(p.id)}">${M(cashShown[p.id] ?? p.money)}</span>${p.jailCards.length ? `<div class="small" title="Cartas de saída livre">📜×${p.jailCards.length}</div>` : ''}</div></div>`;
      }).join('')}
        <div class="bankline"><span>🏦 Banco:</span><span>🏠 ${st.bank.houses} casas</span><span>🏨 ${st.bank.hotels} hotéis</span>${st.late ? `<span class="late-line" title="Reta final: sem ajudas a quem está atrás e aluguéis subindo ${Math.round(ECON.LATE.rate * 100)}% por rodada">📈 Aluguéis ×${Magnata.inflation(st).toFixed(1).replace('.', ',')}</span>` : ''}${st.upgrade ? `<span class="upg-line">⭐ Upgrade: <b>${esc(rp(st.upgrade.owner).name)}</b> · ${esc(TILES[st.upgrade.tile].name)} ${UPGRADE.label(st.upgrade.level)}</span>` : '<span>⭐ Upgrade livre no Ateliê</span>'}<a id="btn-rules">📖 Regras</a><a id="btn-mute">${SFX.isMuted() ? '🔇 Som' : '🔊 Som'}</a></div></div>
      <div class="card actions">${acts.join('') || '<p class="muted">Aguarde sua vez…</p>'}</div>
      <div class="card logcard">
        <div class="tabs"><button data-lt="log" class="${logTab === 'log' ? 'on' : ''}">Registro</button><button data-lt="chat" class="${logTab === 'chat' ? 'on' : ''}">Chat</button></div>
        ${logTab === 'log' ? `<div class="chat-box log">${st.log.map(l => `<div class="msg">${esc(l.msg)}</div>`).join('')}</div>`
        : `<div class="chat-box">${chatHTML(room)}</div><form class="chat-form"><input placeholder="Mensagem…" maxlength="300"><button class="btn">➤</button></form>`}
      </div>
      <button class="btn ghost small" id="game-leave">Sair da partida</button>`;
    if (logTab === 'chat') { const i = $('.chat-form input', S); i.value = keepChat; if (hadFocus) i.focus(); }
    $$('.chat-box', S).forEach(b => b.scrollTop = b.scrollHeight);
    bindChat(S);
    $$('[data-lt]', S).forEach(b => b.onclick = () => { logTab = b.dataset.lt; renderSidebar(room, st, myP, myTurn, rp); });
    $$('[data-act]', S).forEach(b => b.onclick = () => {
      if (b.dataset.act !== 'bankrupt') { $$('[data-act]', S).forEach(x => (x.disabled = true)); setTimeout(() => $$('[data-act]', S).forEach(x => (x.disabled = false)), 4000); }
      if (b.dataset.act === 'bankrupt' && !confirm('Declarar falência? Você sai da partida.')) return;
      Room.send({ t: 'act', a: { type: b.dataset.act } });
    });
    if (au) {
      const bid = v => Room.send({ t: 'act', a: { type: 'bid', amount: v } });
      $$('[data-bid]', S).forEach(b => b.onclick = () => bid(+b.dataset.bid));
      const inp = $('#au-amount', S);
      if (inp) { inp.value = keepBid; if (auFocus) inp.focus(); inp.onkeydown = e => { if (e.key === 'Enter') bid(+inp.value); }; }
      $('#au-go', S) && ($('#au-go', S).onclick = () => bid(+inp.value));
      $('#au-pass', S) && ($('#au-pass', S).onclick = () => Room.send({ t: 'act', a: { type: 'pass' } }));
      tickAuction();
    }
    $('#pop-open', S) && ($('#pop-open', S).onclick = () => { popMin = false; renderDecision(room, Room.room.state, rp); });
    $('#btn-rules', S).onclick = rulesModal;
    $('#btn-mute', S).onclick = e => { SFX.setMuted(!SFX.isMuted()); e.target.textContent = SFX.isMuted() ? '🔇 Som' : '🔊 Som'; };
    $$('.cv', S).forEach(el => { const p = st.players.find(x => x.id === el.dataset.pid); if (!p) return; Anim.countTo(el, cashShown[p.id] ?? p.money, p.money); cashShown[p.id] = p.money; });
    $('#btn-trade') && ($('#btn-trade').onclick = () => tradeModal(room, st, rp));
    $('#btn-see-trade') && ($('#btn-see-trade').onclick = () => tradeIncoming(room, st, rp));
    $('#btn-sellback') && ($('#btn-sellback').onclick = () => sellBackModal(room, st));
    $('#btn-props') && ($('#btn-props').onclick = () => myPropsModal(room, st));
    bindFlip(S);
    $('#game-leave').onclick = () => { if (confirmLeave()) { $('#watch-pill')?.remove(); Room.leave(); boardBuilt = null; enterHub('games'); } };
  }

  function tickAuction() {
    const el = $('#au-time'); const au = Room.room?.state?.auction;
    if (!el || !au) return;
    const s = Math.max(0, Math.ceil((au.deadline - Room.now()) / 1000));
    el.textContent = s + 's'; el.classList.toggle('low', s <= 5);
  }
  setInterval(tickAuction, 250);

  function rulesModal() {
    modal(`<h2>📖 Regras do Magnata</h2><ul class="rules-list small">
      <li><b>Início:</b> cada jogador recebe o dinheiro inicial. Quem tirar mais nos dados começa.</li>
      <li><b>Turno:</b> role os dois dados e ande. Dupla = jogue de novo. Três duplas seguidas = Delegacia.</li>
      <li><b>Propriedade sem dono:</b> compre pelo preço ou ela vai a <b>leilão</b> (lance mínimo ${M(ECON.MIN_BID)}, todos participam, inclusive quem recusou).</li>
      <li><b>Aluguel:</b> grupo de cor completo sem casas cobra o dobro. Estações: ${[1, 2, 4, 8].map(n => M(ECON.STATION * n)).join(' / ')}. Serviços: lance os dados de novo — ${M(ECON.UTIL1)} por ponto (1 serviço) ou ${M(ECON.UTIL2)} por ponto (2 serviços).</li>
      <li><b>Construir (como no Monopoly):</b> só quem tem <b>o grupo de cor completo</b>, sem hipotecas, pode construir — e de forma uniforme (nenhuma rua pode passar mais de um nível na frente das outras do grupo). Os níveis são Casa, Sobrado, Mansão, Prédio e Hotel. Dá para construir pelo menu da propriedade a qualquer momento ou no painel que aparece ao parar na sua rua; se a compra de uma rua completar o grupo, você já pode comprá-la com a primeira construção. O banco tem só 32 casas e 12 hotéis.</li>
      <li><b>Vender edifícios:</b> pela metade do preço, de forma uniforme. Um hotel volta a ser 4 casas.</li>
      <li><b>Hipoteca (empréstimo caro):</b> venda os edifícios do grupo antes; recebe <b>metade do preço</b>. Para quitar, paga a dívida <b>+20%, e mais 10% a cada rodada</b> que passar (até o dobro). Hipotecada não cobra aluguel, <b>quebra o monopólio da cor</b> (o terreno não dobra e ninguém constrói no grupo) e conta só o que sobra depois da dívida no patrimônio. <b>Penhora:</b> se não quitar em ${ECON.MORTGAGE.seize} rodadas, o banco toma a propriedade (vai a leilão e você não recebe nada).</li>
      <li><b>Negociar:</b> troque propriedades (sem edifícios no grupo), dinheiro e cartas de saída livre a qualquer momento. Quem recebe uma propriedade hipotecada paga 10% de juros ao banco.</li>
      <li><b>Delegacia:</b> saia pagando ${M(ECON.JAIL_FINE)} antes de rolar, usando uma carta, ou tirando dupla (até 3 tentativas; na 3ª falha, paga a fiança e anda). Preso, você continua cobrando aluguel, construindo e negociando.</li>
      <li><b>Início:</b> todos começam com ${M(ECON.START)} (o anfitrião pode mudar). Passou ou parou na Partida, recebe ${M(ECON.GO)}.</li>
      <li><b>⭐ Ateliê do Arquiteto:</b> só existe <b>um upgrade</b> na partida. Quem parar no Ateliê aplica o upgrade numa propriedade sua: o aluguel dela sobe <b>50%</b>. Se outro jogador já tiver o upgrade, ele é <b>roubado</b> (volta ao +50%). Se o dono parar de novo e escolher o mesmo imóvel, ele <b>acumula</b>: ×2, ×2,5 e no máximo ×3. O upgrade se perde se a propriedade mudar de dono.</li>
      <li><b>🏦 Vender ao banco:</b> se estiver devendo, você pode devolver propriedades ao banco por 70% do que pagou pelo terreno (as construções valem metade; desconta a dívida da hipoteca, com os juros). A propriedade vai a leilão.</li>
      <li><b>⚖️ Equilíbrio:</b> quem está em último recebe +50% ao passar pela Partida; quem está muito à frente paga uma <b>taxa de fortuna</b> ao passar; as cartas tendem a ajudar quem está atrás; e o último colocado que rouba o upgrade do Ateliê já começa no nível 2.</li>
      <li><b>Falência:</b> sem como pagar, você sai. Se devia a um jogador, ele recebe tudo o que é seu. Se devia ao banco, suas propriedades vão a leilão.</li>
      <li><b>Falência:</b> quem não consegue pagar sai do jogo. O dinheiro que sobrou vai para quem ele devia, e as propriedades voltam ao banco, sem dono e sem edifícios, à venda de novo para quem cair nelas.</li>
      <li><b>Vitória:</b> o último jogador que não faliu (ou o maior patrimônio, se houver limite de rodadas).</li>
      <li><b>📈 Reta final:</b> quando sobram só 2 jogadores (em partidas de 3 ou mais) ou na rodada ${ECON.LATE.round}, acabam as ajudas a quem está atrás (bônus da Partida, sorte nas cartas, taxa de fortuna) e os aluguéis sobem ${Math.round(ECON.LATE.rate * 100)}% a cada rodada (até ×${ECON.LATE.max}), para a partida conseguir terminar.</li>
      <li><b>⏳ Tempo da vez:</b> cada jogada reinicia o relógio da vez (padrão 1 min 30 s, ajustável na sala). Se ele zerar, o jogo joga pelo ausente do jeito mais simples: rola os dados, não compra (a propriedade vai a leilão) e passa a vez.</li>
      <li><b>🤬 Virar a mesa:</b> qualquer jogador pode virar a mesa: o tabuleiro capota e as peças voam (só visual, tudo volta ao lugar). Depois, a mesa leva 1 minuto para poder ser virada de novo.</li></ul>`, { wide: true });
  }

  function propCard(st, i, rp) {
    const t = TILES[i], pr = st.props[i];
    const head = t.type === 'street' ? `<div class="pc-h" style="background:${GROUPS[t.group].color}">${esc(t.name)}</div>` : `<div class="pc-h plain">${t.img ? `<img src="${t.img}" alt="">` : ''}${esc(t.name)}</div>`;
    let body = '';
    if (t.type === 'street') {
      const labels = ['Aluguel', 'Com 1 casa', 'Com 2 casas', 'Com 3 casas', 'Com 4 casas', 'Com HOTEL'];
      body = `<table class="rent">${t.rent.map((r, k) => `<tr class="${pr.houses === k && pr.owner ? 'now' : ''}"><td>${labels[k]}</td><td>${M(r)}</td></tr>`).join('')}</table>
        <p class="muted small">Grupo completo sem casas: aluguel em dobro. Casa: ${M(GROUPS[t.group].house)} cada · Hotel: ${M(GROUPS[t.group].house)} (+4 casas).</p>`;
    } else if (t.type === 'station') body = `<table class="rent">${[1, 2, 3, 4].map(n => `<tr><td>${n} estação(ões)</td><td>${M(ECON.STATION * 2 ** (n - 1))}</td></tr>`).join('')}</table>`;
    else if (t.type === 'utility') body = `<p>Quem parar lança os dados de novo:<br>1 companhia: ${M(ECON.UTIL1)} por ponto dos dados.<br>2 companhias: ${M(ECON.UTIL2)} por ponto dos dados.</p>`;
    else body = `<p class="muted">${({ start: `Receba ${M(ECON.GO)} ao passar por aqui.`, jail: `Apenas visitando… ou preso! Saia com dupla, fiança de ${M(ECON.JAIL_FINE)} ou carta.`, upgrade: '⭐ Aplique o único upgrade da partida numa propriedade sua (aluguel +50%). Se alguém já o tiver, você o rouba. Repetir no mesmo imóvel acumula, até ×3.', gotojail: 'Vá direto para a Delegacia, sem passar pela Partida.', tax: `Pague ${M(t.amount || 0)} ao banco.`, fortuna: 'Tire uma carta de Fortuna.', evento: 'Tire uma carta de Evento.' })[t.type] || ''}</p>`;
    const u = st.upgrade && st.upgrade.tile === i ? st.upgrade : null;
    if (u) body = `<div class="offer" style="margin:8px 16px">⭐ <b>Upgrade nível ${u.level}</b> de ${esc(rp(u.owner).name)}: aluguel ${UPGRADE.label(u.level)}</div>` + body;
    const meta = OWNABLE(t) ? `<div class="pc-meta"><span>Preço ${M(t.price)}</span><span>Hipoteca ${M(t.price / 2)}</span></div>
      <div class="pc-owner">${pr.owner ? `Dono: <b>${esc(rp(pr.owner).name)}</b>${pr.mortgaged ? ' · <span class="badge">HIPOTECADA</span>' : ''}` : 'Sem dono'}</div>` : '';
    return `<div class="propcard">${head}${meta}${body}</div>`;
  }

  function tileModal(i) {
    const room = Room.room, st = room?.state; if (!st) return;
    const rp = id => room.players.find(p => p.id === id) || { name: id };
    const pr = st.props[i]; const mine = pr && pr.owner === Room.myId;
    const btns = [];
    if (mine && !st.result) {
      const t = TILES[i];
      if (t.type === 'street') {
        btns.push(`<button class="btn primary" data-a="build" ${Magnata.canBuild(st, Room.myId, i) ? 'disabled' : ''} title="${esc(Magnata.canBuild(st, Room.myId, i) || '')}">Construir (${M(GROUPS[t.group].house)})</button>`);
        btns.push(`<button class="btn" data-a="sell" ${Magnata.canSell(st, Room.myId, i) ? 'disabled' : ''}>Vender ${pr.houses === 5 ? 'hotel' : 'casa'} (+${M(GROUPS[t.group].house / 2)})</button>`);
        const why = Magnata.canBuild(st, Room.myId, i);
        if (why) btns.push(`<p class="muted small center">${esc(why)}</p>`);
      }
      const meP = st.players.find(x => x.id === Room.myId);
      if (meP && meP.money < 0) btns.unshift(`<button class="btn gold" data-a="sellProp">🏦 Vender ao banco (+${M(Magnata.sellBackValue(st, i))})</button>`);
      if (pr.mortgaged) btns.push(`<button class="btn" data-a="unmortgage">Quitar hipoteca (${M(Magnata.unmortgageCost(i, st))}) · penhora em ${Magnata.seizeIn(st, i)} rodada${Magnata.seizeIn(st, i) === 1 ? '' : 's'}</button>`);
      else btns.push(`<button class="btn" data-a="mortgage" ${Magnata.canMortgage(st, Room.myId, i) ? 'disabled' : ''} title="Quitar custa a dívida +20%, e mais 10% a cada rodada (até o dobro). Hipotecada não cobra aluguel e quebra o monopólio. Se não quitar em ${ECON.MORTGAGE.seize} rodadas, o banco toma.">Hipotecar (+${M(TILES[i].price / 2)}) ⚠️</button>`);
    }
    const m = modal(propCard(st, i, rp) + (btns.length ? `<div class="pc-actions">${btns.join('')}</div>` : ''));
    $$('[data-a]', m).forEach(b => b.onclick = () => { Room.send({ t: 'act', a: { type: b.dataset.a, tile: i } }); setTimeout(() => Room.room?.state && tileModal(i), 250); });
  }

  function sellBackModal(room, st) {
    const meP = st.players.find(p => p.id === Room.myId); if (!meP) return;
    const mine = Object.keys(st.props).map(Number).filter(i => st.props[i].owner === Room.myId).sort((a, b) => Magnata.sellBackValue(st, a) - Magnata.sellBackValue(st, b));
    const m = modal(`<h2>🏦 Vender ao banco</h2><p class="muted">Você deve <b>${M(-meP.money)}</b>. Cada propriedade volta ao banco por 70% do que você pagou pelo terreno (construções pela metade, menos a dívida de hipoteca) e vai a leilão.</p>
      ${mine.length ? `<div class="plist">${mine.map(i => { const t = TILES[i], pr = st.props[i]; return `<button class="pitem" data-sb="${i}"><i style="background:${t.group ? GROUPS[t.group].color : '#999'}"></i>${esc(t.name)}<small>${pr.houses ? TIERS[pr.houses].name + ' · ' : ''}${pr.mortgaged ? 'hipotecada · ' : ''}<b>+${M(Magnata.sellBackValue(st, i))}</b></small></button>`; }).join('')}</div>` : '<p class="empty">Você não tem propriedades para vender.</p>'}`);
    $$('[data-sb]', m).forEach(b => b.onclick = () => {
      Room.send({ t: 'act', a: { type: 'sellProp', tile: +b.dataset.sb } }); b.disabled = true;
      setTimeout(() => { const s2 = Room.room?.state, me2 = s2?.players.find(p => p.id === Room.myId); if (me2 && me2.money < 0) sellBackModal(Room.room, s2); else closeModal(); }, 700);
    });
  }

  function myPropsModal(room, st) {
    const mine = Object.keys(st.props).map(Number).filter(i => st.props[i].owner === Room.myId);
    const m = modal(`<h2>Minhas propriedades</h2>${mine.length ? `<div class="plist">${mine.map(i => {
      const t = TILES[i], pr = st.props[i];
      return `<button class="pitem ${pr.mortgaged ? 'mort' : ''}" data-i="${i}"><i style="background:${t.group ? GROUPS[t.group].color : '#999'}"></i>${esc(t.name)}<small>${pr.houses === 5 ? '🏨' : '🏠'.repeat(pr.houses)}${pr.mortgaged ? ` hipotecada · ⏳ penhora em ${Magnata.seizeIn(st, i)} · quitar ${M(Magnata.unmortgageCost(i, st))}` : ''}</small></button>`;
    }).join('')}</div>` : '<p class="empty">Você ainda não tem propriedades.</p>'}`);
    $$('[data-i]', m).forEach(b => b.onclick = () => tileModal(+b.dataset.i));
  }

  function tradeModal(room, st, rp) {
    const others = st.players.filter(p => !p.bankrupt && p.id !== Room.myId);
    if (!others.length) return;
    let target = others[0].id;
    const cards = id => st.players.find(p => p.id === id)?.jailCards.length || 0;
    const tradable = owner => Object.keys(st.props).map(Number).filter(i => st.props[i].owner === owner && (TILES[i].type !== 'street' || Magnata.groupTiles(TILES[i].group).every(j => st.props[j].houses === 0)));
    const list = (ids, name) => ids.length ? ids.map(i => `<label class="chk"><input type="checkbox" name="${name}" value="${i}"><i style="background:${TILES[i].group ? GROUPS[TILES[i].group].color : '#999'}"></i>${esc(TILES[i].name)}${st.props[i].mortgaged ? ' (hip.)' : ''}</label>`).join('') : '<p class="muted small">Nada negociável.</p>';
    const draw = () => {
      const m = modal(`<h2>🤝 Propor troca</h2>
        <label>Com quem?<select id="tr-to">${others.map(p => `<option value="${esc(p.id)}" ${p.id === target ? 'selected' : ''}>${esc(rp(p.id).name)} (${M(p.money)})</option>`).join('')}</select></label>
        <div class="trade-cols"><div><h3>Você oferece</h3>${list(tradable(Room.myId), 'give')}<label>Dinheiro<input type="number" id="tr-gm" min="0" value="0"></label>
          ${cards(Room.myId) ? `<label>Cartas de saída livre (tem ${cards(Room.myId)})<input type="number" id="tr-gc" min="0" max="${cards(Room.myId)}" value="0"></label>` : ''}</div>
        <div><h3>Você pede</h3>${list(tradable(target), 'get')}<label>Dinheiro<input type="number" id="tr-tm" min="0" value="0"></label>
          ${cards(target) ? `<label>Cartas de saída livre (tem ${cards(target)})<input type="number" id="tr-tc" min="0" max="${cards(target)}" value="0"></label>` : ''}</div></div>
        <p class="muted small">Propriedades de grupos com edifícios não podem ser negociadas. Quem recebe propriedade hipotecada paga 10% de juros ao banco.</p>
        <button class="btn primary" id="tr-send">Enviar proposta</button>`, { wide: true });
      $('#tr-to', m).onchange = e => { target = e.target.value; draw(); };
      $('#tr-send', m).onclick = () => {
        const vals = n => $$(`input[name=${n}]:checked`, m).map(x => +x.value);
        Room.send({ t: 'act', a: { type: 'tradePropose', to: target, giveProps: vals('give'), getProps: vals('get'), giveMoney: +$('#tr-gm', m).value || 0, getMoney: +$('#tr-tm', m).value || 0, giveCards: +($('#tr-gc', m)?.value || 0), getCards: +($('#tr-tc', m)?.value || 0) } });
        closeModal();
      };
    };
    draw();
  }

  function tradeIncoming(room, st, rp) {
    const tr = st.trade; const names = ids => ids.map(i => esc(TILES[i].name)).join(', ') || '—';
    const m = modal(`<h2>🤝 Proposta de ${esc(rp(tr.from).name)}</h2>
      <div class="trade-cols"><div><h3>Você recebe</h3><p>${names(tr.giveProps)}</p><p><b>${M(tr.giveMoney)}</b></p>${tr.giveCards ? `<p>📜 ${tr.giveCards} carta(s) de saída livre</p>` : ''}</div>
      <div><h3>Você entrega</h3><p>${names(tr.getProps)}</p><p><b>${M(tr.getMoney)}</b></p>${tr.getCards ? `<p>📜 ${tr.getCards} carta(s) de saída livre</p>` : ''}</div></div>
      ${tr.giveProps.some(i => st.props[i].mortgaged) ? '<p class="muted small">Inclui propriedade hipotecada: você pagará 10% de juros ao banco.</p>' : ''}
      <div class="row"><button class="btn primary" id="ta">Aceitar</button><button class="btn" id="td">Recusar</button></div>`, { onClose: () => Room.send({ t: 'act', a: { type: 'tradeDecline' } }) });
    m.classList.add('trade-in');
    $('#ta', m).onclick = () => { Room.send({ t: 'act', a: { type: 'tradeAccept' } }); closeModal(); };
    $('#td', m).onclick = () => { Room.send({ t: 'act', a: { type: 'tradeDecline' } }); closeModal(); };
  }

  function showResult(room, st, rp) {
    SFX.win();
    const w = rp(st.result.winner);
    const m = modal(`<div class="result">
      <div class="confetti">${Array.from({ length: 40 }, (_, k) => `<i style="--x:${Math.random() * 100}%;--d:${Math.random() * 2}s;--h:${k * 37 % 360}"></i>`).join('')}</div>
      ${avatar(w, 150)}<h1>${esc(w.name)} venceu!</h1><blockquote>“${esc(w.catchphrase || '')}”</blockquote>
      <ol class="final">${st.result.ranking.map(r => `<li>${avatar(rp(r.id), 32)}<b>${esc(rp(r.id).name)}</b><span>${r.bankrupt ? 'falido' : M(r.worth)}</span></li>`).join('')}</ol>
      ${Room.isHost ? '<button class="btn primary big" id="back-lobby">Voltar para a sala</button>' : '<p class="muted">Aguardando o anfitrião voltar para a sala…</p>'}
      <button class="btn ghost" id="res-close">Ver tabuleiro</button></div>`, { wide: true });
    $('#back-lobby', m) && ($('#back-lobby', m).onclick = () => { closeModal(); Room.send({ t: 'lobby' }); });
    $('#res-close', m).onclick = closeModal;
  }

  // ---------- inicialização ----------
  // ----- diagnóstico de rede -----
  async function netTestModal() {
    const m = modal(`<h2>🩺 Teste de conexão</h2><p class="muted small">Verifica quais caminhos de conexão a sua rede permite. Leva uns 20 segundos.</p><ul class="net-steps"><li class="muted">Testando…</li></ul><div class="net-verdict"></div>`);
    const draw = steps => {
      const ul = $('.net-steps', m); if (!ul) return;
      ul.innerHTML = steps.map(s => `<li>${s.ok ? '✅' : '❌'} ${esc(s.name)}${s.info ? `<small> — ${esc(s.info)}</small>` : ''}</li>`).join('') + '<li class="muted">Testando…</li>';
    };
    const steps = await Net.diagnose(draw);
    if (!$('.net-steps', m)) return;
    $('.net-steps', m).innerHTML = steps.map(s => `<li>${s.ok ? '✅' : '❌'} ${esc(s.name)}${s.info ? `<small> — ${esc(s.info)}</small>` : ''}</li>`).join('');
    const main = steps[0]?.ok && steps[1]?.ok, any = steps.some(s => s.ok && /Reserva/.test(s.name));
    const verdict = main ? '👍 Sua rede consegue jogar: se a conexão direta falhar, a reserva pela porta 443 assume sozinha.'
      : any ? '⚠️ A reserva principal está bloqueada, mas uma reserva extra funciona. Marque "Rede restrita" ao entrar.'
      : '⛔ Sua rede bloqueia todos os caminhos do jogo. Tente outra rede (ou o 4G).';
    const report = `Mesa Viva ${APP_VERSION}\n` + steps.map(s => `${s.ok ? 'OK ' : 'X  '} ${s.name}${s.info ? ' — ' + s.info : ''}`).join('\n');
    $('.net-verdict', m).innerHTML = `<p><b>${esc(verdict)}</b></p><button class="btn small" id="net-copy">Copiar resultado</button>`;
    $('#net-copy', m).onclick = () => navigator.clipboard?.writeText(report).then(() => toast('Resultado copiado! Mande para quem está te ajudando.', 'ok'));
  }

  // ----- aviso de versão nova (quem está com a página antiga aberta) -----
  function watchVersion() {
    if (!/^https?:/.test(location.protocol)) return;
    const check = async () => {
      try {
        const txt = await fetch('js/data.js?t=' + Date.now(), { cache: 'no-store' }).then(r => r.ok ? r.text() : '');
        const v = (txt.match(/APP_VERSION = '([^']+)'/) || [])[1];
        if (v && v !== APP_VERSION && !$('.update-bar')) {
          document.body.insertAdjacentHTML('beforeend', `<div class="update-bar">🔄 Saiu uma versão nova do jogo. <button class="btn small gold" onclick="location.reload()">Atualizar agora</button></div>`);
        }
      } catch { }
    };
    setTimeout(check, 15000); setInterval(check, 3 * 60 * 1000);
  }

  function init() {
    watchVersion();
    document.addEventListener('pointerdown', () => SFX.unlock(), { once: true });
    document.addEventListener('click', e => { if (e.target.closest('.btn:not(:disabled), .tabs button, .charpick, .em, .sw')) SFX.click(); });
    $('#logout').onclick = () => { Store.logout(); me = null; renderAuth(); };
    document.body.style.setProperty('--wood', `url(${IMG.bg_wood})`);
    $('#lobby-bg').style.backgroundImage = `url(${IMG.lobby_bg})`;
    me = Store.current();
    if (!window.Peer) toast('Não foi possível carregar a biblioteca P2P (PeerJS). Verifique sua internet.', 'err');
    me ? enterHub(new URLSearchParams(location.search).get('sala') ? 'games' : 'games') : renderAuth();
  }

  // ---------- virar a mesa (Magnata e Conjura) ----------
  let seenFlip = null;
  const flipLeft = room => Math.max(0, (room?.flip?.at || 0) + TABLE_FLIP.cooldown - Room.now());
  function flipBtnHTML(room, st) {
    if (spectating()) return ''; // quem assiste não vira a mesa
    const meP = st.players.find(p => p.id === Room.myId); if (!meP || st.result) return '';
    const left = flipLeft(room);
    return `<button class="btn danger flip-btn" id="btn-flip" ${left ? 'disabled' : ''} title="Virar a mesa: tudo capota e voa (só visual, volta ao lugar). Depois de virada, a mesa leva 1 minuto para poder virar de novo.">🤬 Virar a mesa${left ? ` (${Math.ceil(left / 1000)} s)` : ''}</button>`;
  }
  function bindFlip(root) { const b = $('#btn-flip', root); if (b) b.onclick = () => { b.disabled = true; Room.send({ t: 'flip' }); }; }
  // contagem regressiva no botão
  setInterval(() => { const b = $('#btn-flip'); if (!b || !Room.room) return; const left = flipLeft(Room.room); b.disabled = left > 0; b.textContent = '🤬 Virar a mesa' + (left ? ` (${Math.ceil(left / 1000)} s)` : ''); }, 1000);
  function checkFlip(room) {
    const f = room.flip, n = f?.n || 0;
    if (!seenFlip || seenFlip.code !== room.code) { seenFlip = { code: room.code, n }; return; } // ao entrar na sala, não repete uma virada antiga
    if (n === seenFlip.n) return; seenFlip.n = n;
    const who = room.players.find(p => p.id === f.pid);
    toast(`🤬 ${who ? who.name : 'Alguém'} virou a mesa!`);
    try { navigator.vibrate?.([120, 60, 200]); } catch { }
    if (room.game === 'conjura' && Conjura3D.active) return void Conjura3D.flip(f.pid);
    if (room.game !== 'conjura' && Board3D.active) return void Board3D.flip(f.pid);
    // 2D: o tabuleiro salta, capota e volta
    SFX.tableFlip?.();
    const el = room.game === 'conjura' ? $('#conj-table .ct-felt') : $('#board');
    el?.animate([{ transform: 'none' }, { transform: 'translateY(-30px) rotateX(35deg) rotate(-6deg)', offset: .12 }, { transform: 'translateY(-70px) rotateX(180deg) rotate(10deg)', offset: .35 }, { transform: 'rotateX(180deg) rotate(4deg)', offset: .7 }, { transform: 'none' }], { duration: 4200, easing: 'ease-in-out' });
  }

  // usados pelo Ludo (js/ludo.js)
  function recordResult(st, room) { Store.recordGame(st.gameId, st.result, room.players, me); me = Store.profileOf(me.username) || me; }
  const leaveToHub = () => { $('#watch-pill')?.remove(); Room.leave(); boardBuilt = null; ConjuraUI.reset(); CahUI.reset(); WarUI.reset(); Domino2UI.reset(); ArqUI.reset(); PatUI.reset(); UltUI.reset(); enterHub('games'); };
  return { init, toast, show, modal, closeModal, avatar, chatHTML, bindChat, recordResult, leaveToHub, flipBtnHTML, bindFlip, matchClock, confirmLeave, spectating };
})();

window.addEventListener('DOMContentLoaded', UI.init);
