// Patrimônio: telas, fluxo da partida e ligação entre regras, cena e som.
(() => {
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const brl = Engine.brl, SQ = PD.SQ, G = PD.GROUPS;
  const SAVE = 'patrimonio-partida';
  let st = null, disp = [], busy = false, base = 1, deedOpen = null;
  const thumbs = {};
  const thumb = (token, color) => (thumbs[token + color] = thumbs[token + color] || Stage.thumbnail(token, color));
  const wait = ms => Stage.wait(ms);
  const plateOf = i => document.querySelector(`.plate[data-p="${i}"]`);
  const centerOf = el => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
  const faceHTML = (p, size) => `<span class="face" style="--c:${p.color};--s:${size}px"><img alt="" src="${faceOf(p)}"><i><img alt="" src="${thumb(p.token, p.color)}"></i></span>`;
  const nProps = i => { const n = Engine.ownedBy(st, i).length; return `${n} ${n === 1 ? 'propriedade' : 'propriedades'}`; };
  // cabeçalho com foto, peão, nome e situação: o mesmo em negociar, patrimônio e contratos
  const whoCard = (p, sub, cls = '') => `<div class="whoc ${cls}" style="--c:${p.color}">${faceHTML(p, 58)}<div><b>${esc(p.name)}</b><small>${sub}</small></div></div>`;
  const artCache = {}, artURL = s => artCache[s] || (artCache[s] = Art.sceneCanvas(SQ[s], 240).toDataURL('image/jpeg', .82));
  const placeStatus = s => { const q = SQ[s], pr = st.props[s]; return pr.m ? (st.rules?.mortgage ? `hipotecada: ${Engine.roundsToSeize(st, s)} voltas` : 'hipotecada') : pr.lien ? 'garantia de fiado' : pr.owner === null ? brl(q.price) : q.k === 'util' ? 'aluguel pelos dados' : 'aluguel ' + brl(Engine.rentOf(st, s)); };
  const pips = s => { const pr = st.props[s]; return SQ[s].k !== 'prop' ? '' : `<span class="pc-lv">${pr.x ? '<em>Puxadinho</em>' : pr.h ? `<em>${Engine.LEVELS[pr.h]}</em>` : ''}</span>`; };
  // carta pequena de um lugar: faixa da cor do grupo, desenho, nome e o que rende agora
  const pcard = (s, { sel, attrs = '', tag = 'button', off, price } = {}) => { const q = SQ[s], pr = st.props[s]; return `<${tag} class="pc ${sel ? 'sel' : ''} ${pr.m ? 'm' : ''}" data-s="${s}" style="--gc:${G[q.g].c}" ${attrs} ${off ? 'disabled title="Grupo com construção ou garantia de fiado não entra"' : ''}><span class="pc-art"><img alt="" src="${artURL(s)}"></span><b>${esc(q.name)}</b><small>${placeStatus(s)}</small>${price ? `<small class="pc-price">Tabela: <b>${brl(q.price)}</b></small>` : ''}${pips(s)}</${tag}>`; };
  const CAS_GAMES = [
    ['roleta', 'Roleta', 'até 30×', '<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="22" fill="#6a3419" stroke="#3a2614" stroke-width="2"/><circle cx="24" cy="24" r="17" fill="#17151a"/><g fill="#c8201f"><path d="M24 7a17 17 0 0 1 12 5L24 24z"/><path d="M41 24a17 17 0 0 1-5 12L24 24z"/><path d="M24 41a17 17 0 0 1-12-5l12-12z"/><path d="M7 24a17 17 0 0 1 5-12l12 12z"/></g><circle cx="24" cy="24" r="8" fill="#e0b44e" stroke="#3a2614" stroke-width="1.5"/><path d="M24 18v12M18 24h12" stroke="#7a5208" stroke-width="2"/><circle cx="35" cy="11" r="3" fill="#fff" stroke="#3a2614"/></svg>'],
    ['dados', 'Bacbo', 'paga 2×', '<svg viewBox="0 0 48 48"><rect x="4" y="16" width="24" height="24" rx="5" fill="#fffaf0" stroke="#3a2614" stroke-width="2" transform="rotate(-10 16 28)"/><g fill="#c8201f" transform="rotate(-10 16 28)"><circle cx="11" cy="23" r="2.4"/><circle cx="16" cy="28" r="2.4"/><circle cx="21" cy="33" r="2.4"/></g><rect x="22" y="6" width="22" height="22" rx="5" fill="#2f9e57" stroke="#3a2614" stroke-width="2" transform="rotate(12 33 17)"/><g fill="#fff" transform="rotate(12 33 17)"><circle cx="28" cy="12" r="2.2"/><circle cx="38" cy="12" r="2.2"/><circle cx="28" cy="22" r="2.2"/><circle cx="38" cy="22" r="2.2"/></g></svg>'],
    ['slot', 'Caça-níquel', 'até 10×', '<svg viewBox="0 0 48 48"><path d="M38 20V9" stroke="#3a2614" stroke-width="3"/><circle cx="38" cy="7" r="4" fill="#e02f24" stroke="#3a2614" stroke-width="1.5"/><rect x="3" y="10" width="33" height="34" rx="5" fill="#c8302a" stroke="#3a2614" stroke-width="2"/><rect x="7" y="19" width="25" height="14" rx="2" fill="#fffaf0" stroke="#3a2614" stroke-width="1.5"/><text x="19.5" y="30" text-anchor="middle" font-family="Lilita One,sans-serif" font-size="11" fill="#c8201f">777</text><rect x="9" y="36" width="21" height="4" rx="1" fill="#e0b44e"/><rect x="9" y="13" width="21" height="3" rx="1" fill="#ffd36b"/></svg>'],
  ];
  const groupsOrder = ['terra', 'ceu', 'ipe', 'laranja', 'vermelho', 'amarelo', 'mata', 'anil', 'rail', 'util'];

  // ---------- início ----------
  // os mesmos personagens dos outros jogos da Mesa Viva
  const CHARS = [['vitoria', 'Vitória'], ['otavio', 'Otávio'], ['lia', 'Lia'], ['bento', 'Bento'], ['estrela', 'Estrela'], ['dante', 'Dante'], ['amara', 'Amara'], ['kai', 'Kai']];
  const photo = id => `../../assets/char_${id}.webp`;
  const faceOf = p => photo(p.char || CHARS[p.i % CHARS.length][0]);
  const seats = CHARS.slice(0, 6).map(([char, name], i) => ({ char, name: i === 0 ? 'Jogador 1' : name, token: PD.TOKENS[i].id, color: PD.COLORS[i], kind: i === 0 ? 'p' : i < 4 ? 'b' : 'x' }));
  const RULE_LIST = [
    ['mortgage', 'Hipoteca com juros', 'A dívida sobe a cada volta. Em 6 voltas, o banco toma o lugar e leiloa.'],
    ['wealth', 'Taxa de fortuna', 'Com 3 ou mais na mesa, quem tem 50% acima da média paga até R$ 100.000 no Marco Zero.'],
    ['reajuste', 'Reajuste do aluguel', 'A cada 10 voltas, os aluguéis sobem 25%, até o dobro.'],
    ['pux', 'Puxadinho', 'Uma casinha sem ter o grupo: aluguel em dobro. Até 3 por jogador.'],
    ['sponsor', 'Patrocinador', 'Quem cai escolhe um lugar seu: aluguel +50%, e o dobro se cair de novo. Vale até outra pessoa cair lá e roubar. Sem lugar, ganha R$ 70.000.'],
    ['casino', 'Cassino', 'Quem cai pode apostar na roleta, no Bacbo (par ou ímpar nos dados) ou no caça-níquel, de R$ 5.000 a R$ 50.000, até tudo o que tiver na mão. Dá para passar.'],
    ['blitz', 'Blitz com suborno', 'A polícia acusa você de um crime qualquer. Pague R$ 35.000 ao guarda e role um dado: de 1 a 4 você passa; 5 ou 6, paga mais e vai preso.'],
    ['travel', 'Ponte aérea', 'Num aeroporto, pague R$ 35.000 para ir a outro. No seu, é de graça. Sem salário no caminho, e quem chega voando não compra o aeroporto.'],
    ['passes', 'Passe livre', 'Nas trocas, vale pagar com aluguéis grátis nas suas propriedades.'],
    ['fiado', 'Fiado', 'Sem dinheiro para o aluguel? Negocie juros e prazo, com um lugar de garantia.'],
    ['news', 'Jornal', 'Uma manchete por volta muda o jogo, e a próxima já fica à vista.'],
    ['contracts', 'Contratos secretos', 'Cada um recebe 2 metas ocultas que pagam prêmio ao serem cumpridas.'],
  ];
  const RULEKEY = 'pat-regras'; let rules = { ...Engine.RULES }; try { Object.assign(rules, JSON.parse(localStorage.getItem(RULEKEY) || '{}')); } catch (e) { /* padrão: todas ligadas */ }
  function rulesBox() {
    const save = () => { try { localStorage.setItem(RULEKEY, JSON.stringify(rules)); } catch (e) { /* vale só nesta visita */ } };
    const draw = () => sheet(`<button class="close" data-x>✕</button><h2>Regras da casa</h2><p class="sub">Ligue só o que a mesa quiser. Sem nenhuma, é o jogo clássico.</p><div class="rules">${RULE_LIST.map(([k, t, d]) => `<button class="rule" data-r="${k}" aria-pressed="${!!rules[k]}"><span><b>${t}</b><small>${d}</small></span><i></i></button>`).join('')}</div>
      <div class="rules-limit"><span>Limite de voltas</span><div class="seg">${[[0, 'Sem limite'], [20, '20'], [30, '30'], [40, '40']].map(([v, t]) => `<button data-l="${v}" class="${rules.limit === v ? 'on' : ''}">${t}</button>`).join('')}</div></div>
      <div class="row-end"><button class="btn" id="r-none">Desligar todas</button><button class="btn" id="r-all">Ligar todas</button><button class="btn pri" data-x>Pronto</button></div>`, box => {
      box.querySelectorAll('[data-r]').forEach(b => { b.onclick = () => { rules[b.dataset.r] = !rules[b.dataset.r]; save(); Sound.play('click'); draw(); }; });
      box.querySelectorAll('[data-l]').forEach(b => { b.onclick = () => { rules.limit = +b.dataset.l; save(); Sound.play('click'); draw(); }; });
      box.querySelector('#r-none').onclick = () => { RULE_LIST.forEach(([k]) => { rules[k] = false; }); save(); draw(); };
      box.querySelector('#r-all').onclick = () => { RULE_LIST.forEach(([k]) => { rules[k] = true; }); save(); draw(); };
      box.parentElement.addEventListener('click', e => { if (e.target === box.parentElement || e.target.closest('[data-x]')) renderSetup(); });
    });
    draw();
  }
  let seatSel = 0;
  function renderSetup() {
    const saved = (() => { try { return localStorage.getItem(SAVE); } catch (e) { return null; } })();
    Stage.setHud(false); $('#setup').hidden = false;
    const on = seats.filter(s => s.kind !== 'x').length; if (seats[seatSel].kind === 'x') seatSel = seats.findIndex(s => s.kind !== 'x');
    const me = seats[seatSel] || seats[0], root = $('#setup');
    root.innerHTML = `<header class="topbar"><a class="btn ghost" href="../../index.html">← Sair</a><div class="code"><span class="muted">Sala de Patrimônio</span><b>LOCAL</b></div><span></span></header>
      <div class="room-grid">
        <div class="card">
          <h3>Jogadores (${on}/${seats.length})</h3>
          <div class="seats">${seats.map((s, i) => s.kind === 'x'
            ? `<button class="seat empty" data-add="${i}">Vaga livre<small>clique para sentar alguém</small></button>`
            : `<div class="seat ${i === seatSel ? 'sel' : ''}" data-pick="${i}" style="--sc:${s.color}">${on > 2 ? `<button class="kick" data-out="${i}" title="Remover">✕</button>` : ''}<div class="avatar" style="--c:${s.color};--s:72px"><img alt="" src="${photo(s.char)}"><span class="emb"><img alt="" src="${thumb(s.token, s.color)}"></span></div><input data-name="${i}" value="${esc(s.name)}" maxlength="14" aria-label="Nome"><button class="badge ${s.kind === 'p' ? 'ok' : ''}" data-kind="${i}" title="Trocar entre pessoa e bot">${s.kind === 'p' ? 'Pessoa' : '🤖 Bot'}</button></div>`).join('')}</div>
          <h3>Peão de ${esc(me.name)}</h3>
          <div class="hats">${PD.TOKENS.map(k => { const by = seats.find(s => s !== me && s.kind !== 'x' && s.token === k.id); return `<button class="charpick hatpick ${me.token === k.id ? 'on' : ''}" data-tok="${k.id}" ${by ? 'disabled' : ''} title="${esc(k.name)}"><img alt="" src="${thumb(k.id, me.color)}"><small>${esc(k.name)}</small></button>`; }).join('')}</div>
          <h3>Personagem de ${esc(me.name)}</h3>
          <div class="chars small">${CHARS.map(([id, name]) => { const by = seats.find(s => s !== me && s.kind !== 'x' && s.char === id); return `<button class="charpick ${me.char === id ? 'on' : ''}" data-char="${id}" ${by ? 'disabled' : ''} title="${esc(name)}"><img alt="" src="${photo(id)}"></button>`; }).join('')}</div>
        </div>
        <div class="card side">
          <h3>Regras da mesa</h3>
          <label>Limite de voltas<select id="s-limit">${[[0, 'Sem limite'], [20, '20 voltas (rápida)'], [30, '30 voltas'], [40, '40 voltas (longa)']].map(([v, t]) => `<option value="${v}" ${rules.limit === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
          <label class="inline">Cor do miolo do tabuleiro<input type="color" id="s-color" value="${Stage.fieldColor()}"></label>
          <button class="btn" id="rules">Regras da casa: ${RULE_LIST.filter(([k]) => rules[k]).length} de ${RULE_LIST.length} ligadas</button>
          <button class="btn" id="add-bot" ${on >= seats.length ? 'disabled' : ''}>🤖 Adicionar bot</button>
          <button class="btn primary big" id="go" data-primary ${on < 2 ? 'disabled' : ''}>Iniciar partida</button>
          ${saved ? '<button class="btn go" id="cont">Continuar partida salva</button>' : ''}
          <p class="muted small">Todo mundo joga nesta tela, cada um na sua vez. Toque num jogador para escolher o peão e o personagem dele.</p>
        </div>
      </div>`;
    root.onclick = e => {
      const t = e.target.closest('button, .seat[data-pick]'); if (!t || t.disabled) return; if (e.target.matches('input')) { if (t.dataset.pick !== undefined && seatSel !== +t.dataset.pick) { seatSel = +t.dataset.pick; const cur = e.target.dataset.name; renderSetup(); root.querySelector(`[data-name="${cur}"]`)?.focus(); } return; }
      Sound.unlock(); Sound.play('click');
      if (t.dataset.out !== undefined) { seats[+t.dataset.out].kind = 'x'; renderSetup(); }
      else if (t.dataset.kind !== undefined) { const s = seats[+t.dataset.kind]; s.kind = s.kind === 'p' ? 'b' : 'p'; renderSetup(); }
      else if (t.dataset.add !== undefined) { seatIn(+t.dataset.add, 'p'); }
      else if (t.id === 'add-bot') { const i = seats.findIndex(s => s.kind === 'x'); if (i >= 0) seatIn(i, 'b'); }
      else if (t.dataset.tok) { if (seats.some(s => s !== me && s.kind !== 'x' && s.token === t.dataset.tok)) return toast('Outra pessoa já está com esse chapéu'); me.token = t.dataset.tok; renderSetup(); }
      else if (t.dataset.char) { const old = CHARS.find(c => c[0] === me.char)[1]; me.char = t.dataset.char; if (me.name === old) me.name = CHARS.find(c => c[0] === me.char)[1]; renderSetup(); }
      else if (t.dataset.pick !== undefined) { seatSel = +t.dataset.pick; renderSetup(); }
      else if (t.id === 'rules') rulesBox();
      else if (t.id === 'go') start();
      else if (t.id === 'cont') { try { resume(JSON.parse(localStorage.getItem(SAVE))); } catch (err) { toast('Não deu para abrir a partida salva'); } }
    };
    root.oninput = e => { if (e.target.id === 's-color') { $('#t-color').value = e.target.value; $('#t-color').dispatchEvent(new Event('input')); return; } if (e.target.dataset.name !== undefined) seats[+e.target.dataset.name].name = e.target.value; };
    root.onchange = e => { if (e.target.id === 's-limit') { rules.limit = +e.target.value; try { localStorage.setItem(RULEKEY, JSON.stringify(rules)); } catch (err) { /* vale só nesta visita */ } } if (e.target.dataset.name !== undefined) renderSetup(); };
  }
  // quem senta numa vaga pega o primeiro peão e personagem livres
  function seatIn(i, kind) {
    const s = seats[i], busyT = seats.filter(x => x.kind !== 'x').map(x => x.token), busyC = seats.filter(x => x.kind !== 'x').map(x => x.char);
    if (busyT.includes(s.token)) s.token = PD.TOKENS.find(k => !busyT.includes(k.id)).id;
    if (busyC.includes(s.char)) { const old = CHARS.find(c => c[0] === s.char)[1]; s.char = CHARS.find(c => !busyC.includes(c[0]))[0]; if (s.name === old) s.name = CHARS.find(c => c[0] === s.char)[1]; }
    s.kind = kind; seatSel = i; renderSetup();
  }
  function start() {
    const list = seats.filter(s => s.kind !== 'x');
    if (list.length < 2) return toast('Precisa de pelo menos 2 jogadores');
    // última garantia: nunca duas peças com o mesmo chapéu
    list.forEach((s, i) => { if (list.slice(0, i).some(o => o.token === s.token)) s.token = PD.TOKENS.find(k => !list.some(o => o.token === k.id)).id; });
    st = Engine.newGame(list.map(s => ({ name: s.name.trim() || 'Jogador', token: s.token, char: s.char, color: s.color, bot: s.kind === 'b' })), undefined, { ...rules });
    enter(); $('#hud').hidden = true; Stage.setHud(false);
    intro().then(pump);
  }
  // abertura: os participantes entram um a um enquanto a câmera se aproxima do tabuleiro. Um toque pula
  async function intro() {
    const el = document.createElement('div'); el.id = 'intro'; const MS = 4000;
    el.innerHTML = `<div class="in-logo">Patrimônio</div><div class="in-sub">A partida vai começar!</div><div class="in-players">${st.players.map((p, i) => `<div class="in-p" style="--c:${p.color};--i:${i}">${faceHTML(p, 76)}<b>${esc(p.name)}</b><small>${p.bot ? 'Bot' : 'Jogador'}</small></div>`).join('')}</div>`;
    document.body.append(el); Stage.setSpeed(1); Stage.introCam(MS); Sound.play('whoosh');
    st.players.forEach((p, i) => setTimeout(() => Sound.play('stamp'), 800 + i * 240));
    await new Promise(r => { const tm = setTimeout(r, MS - 300); el.onclick = () => { clearTimeout(tm); r(); }; });
    el.classList.add('out'); $('#hud').hidden = false; Stage.setHud(true); Sound.play('myTurn');
    await new Promise(r => setTimeout(r, 420)); el.remove();
  }
  function resume(saved) { st = saved; st.ev = []; st.passes = st.passes || []; st.loans = st.loans || []; st.players.forEach(p => { p.stats = p.stats || {}; p.contracts = p.contracts || []; }); enter(); for (const s of Engine.OWNABLE) { const pr = st.props[s]; if (pr.owner !== null) { Stage.setOwner(s, st.players[pr.owner].color); if (pr.h) Stage.setHouses(s, pr.h, false); if (pr.x) Stage.setPux(s, true, false); if (pr.m) Stage.setMortgaged(s, true); if (Engine.sponsored(st, s)) Stage.setSponsor(s, Engine.sponsored(st, s)); } } st.players.forEach(p => Stage.syncToken(p.i, p.pos, p.jail, p.out)); Stage.layoutTokens(true); Stage.setActive(st.turn); highlight(); Stage.overview(st.players[st.turn].pos); pump(); }
  function enter() {
    $('#setup').hidden = true; $('#setup').innerHTML = ''; $('#setup').onclick = null; $('#hud').hidden = false; Stage.cam.orbit = false; Stage.setHud(true); Sound.unlock();
    disp = st.players.map(p => p.cash);
    Stage.addPlayers(st.players); st.players.forEach(p => Stage.setFace(p.i, faceOf(p), p.color));
    renderPlates(); paintNews(); Stage.overview(0); Stage.resetView();
  }
  function saveNow() { try { if (st.phase === 'over') localStorage.removeItem(SAVE); else localStorage.setItem(SAVE, JSON.stringify({ ...st, ev: [] })); } catch (e) { /* sem espaço: segue sem salvar */ } }

  // ---------- placares ----------
  function renderPlates() {
    $('#plates').innerHTML = st.players.map(p => `<button class="plate" data-p="${p.i}" style="--c:${p.color}"><div class="tk"><img alt="" src="${faceOf(p)}"><i><img alt="" src="${thumb(p.token, p.color)}"></i></div><div class="who"><span>${esc(p.name)}</span>${p.bot ? '<em>bot</em>' : ''}<span class="tags"></span></div><div class="where"></div><div class="nprops"></div><div class="cash">${brl(disp[p.i])}</div><div class="strip">${groupsOrder.map(g => `<div style="--n:${Engine.GROUP_OF[g].length};--gc:${G[g].c}">${Engine.GROUP_OF[g].map(s => `<i data-s="${s}"></i>`).join('')}</div>`).join('')}</div></button>`).join('');
    refreshPlates();
  }
  const passesHeld = i => st.passes.filter(x => x.to === i).reduce((t, x) => t + x.n, 0);
  const newsPic = n => { const e = n.e, s = e.rent ? Engine.GROUP_OF[e.rent.g][0] : e.tax !== undefined ? 4 : e.build ? 2 : e.buy ? 1 : 5; return artURL(s); };
  function paintNews(fresh) {
    const el = $('#news'), scale = Engine.rentScale(st), lim = st.rules?.limit, n = st.news && PD.NEWS[st.news.cur], x = st.news && PD.NEWS[st.news.next];
    el.hidden = !st.rules || (!n && scale === 1 && !lim); if (el.hidden) return;
    el.innerHTML = `<div class="mast">Diário do Patrimônio</div><div class="meta"><span>Volta ${st.rounds + 1}${lim ? ' de ' + lim : ''}</span><span>${scale > 1 ? `Aluguéis +${Math.round((scale - 1) * 100)}%` : 'Edição de hoje'}</span></div>${n ? `<div class="story"><span class="pic"><img alt="" src="${newsPic(n)}"></span><div><b>${esc(n.title)}</b><span>${esc(n.t)}</span></div></div><em><i>Amanhã</i> <u>${esc(x.title)}.</u> ${esc(x.t)}</em>` : ''}`;
    if (fresh) { el.classList.remove('fresh'); void el.offsetWidth; el.classList.add('fresh'); }
  }
  // a manchete chega rodando no meio da mesa, fica um instante e voa para o seu lugar no painel
  async function showPaper(e) {
    const n = st.news && PD.NEWS[st.news.cur], el = document.createElement('div'); el.className = 'paper';
    el.innerHTML = `<div class="p-mast">Diário do Patrimônio</div><div class="p-meta"><span>Volta ${st.rounds + 1}</span><span>Edição extra</span><span>Preço: R$ 1,00</span></div><h2>${esc(e.title)}</h2><div class="p-story"><span class="pic"><img alt="" src="${newsPic(n)}"></span><div><p>${esc(e.text)}</p><div class="p-cols"><i></i><i></i></div></div></div>`;
    $('#stage').append(el); Sound.play('whoosh');
    await el.animate([{ transform: 'rotate(-540deg) scale(.1)', opacity: 0 }, { transform: 'rotate(8deg) scale(1.06)', opacity: 1, offset: .78 }, { transform: 'rotate(-2deg) scale(1)', opacity: 1 }], { duration: 460, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'forwards' }).finished;
    Sound.play('stamp');
    await new Promise(res => { const tm = setTimeout(res, 1500 / base); el.onclick = () => { clearTimeout(tm); res(); }; });
    const slot = $('#news'), r = el.getBoundingClientRect(), to = slot && slot.offsetWidth ? centerOf(slot) : { x: r.left + r.width / 2, y: -200 };
    Sound.play('flip');
    await el.animate([{ transform: 'rotate(-2deg) scale(1)', opacity: 1 }, { transform: `translate(${to.x - r.left - r.width / 2}px,${to.y - r.top - r.height / 2}px) rotate(4deg) scale(.3)`, opacity: .35 }], { duration: 300, easing: 'cubic-bezier(.5,0,.8,.5)', fill: 'forwards' }).finished;
    el.remove();
  }
  function refreshPlates() {
    st.players.forEach(p => {
      const el = plateOf(p.i); if (!el) return;
      el.classList.toggle('out', p.out);
      el.querySelector('.where').textContent = (p.out ? 'Falido' : p.jail ? 'Na Delegacia' : SQ[p.pos].name) + (st.sp && st.sp.who === p.i ? ` · patrocínio ${st.sp.lv === 2 ? '2×' : '+50%'}` : '');
      el.querySelector('.nprops').textContent = p.out ? 'Faliu' : nProps(p.i);
      el.querySelector('.tags').innerHTML = (p.jail ? '<b>preso</b>' : '') + (p.cards.length ? `<b title="Habeas corpus">HC${p.cards.length > 1 ? ' ×' + p.cards.length : ''}</b>` : '') + (Engine.loanOf(st, p.i) ? '<b>fiado</b>' : '') + (passesHeld(p.i) ? `<b title="Passes livres">PL ${passesHeld(p.i)}</b>` : '') + (p.out ? '<b>faliu</b>' : '');
      el.querySelectorAll('.strip i').forEach(i => { const pr = st.props[i.dataset.s]; i.className = pr.owner === p.i ? (pr.m ? 'mort' : 'own') : ''; });
    });
  }
  function highlight() { document.querySelectorAll('.plate').forEach(e => e.classList.toggle('on', +e.dataset.p === st.turn)); }
  const money = {};
  function setCash(i, v, animate = true) {
    const el = plateOf(i)?.querySelector('.cash'); if (!el) return;
    const from = disp[i]; disp[i] = v; if (from === v) return;
    if (!animate) { el.textContent = brl(v); return; }
    money[i] = (money[i] || 0) + 1; const id = money[i];
    const t0 = performance.now(), dur = 620; (function run(now) { if (money[i] !== id) return; const k = Math.min(1, (now - t0) / dur), e = 1 - (1 - k) ** 3; el.textContent = brl(from + (v - from) * e); if (k < 1) requestAnimationFrame(run); })(t0);
  }
  function floater(i, text, good) {
    const pl = plateOf(i); if (!pl) return; const m = Stage.tokens[i].m.position, pt = Stage.toScreen(m.x, m.y + 1.5, m.z), e = document.createElement('div'); e.className = 'float'; e.textContent = text; e.style.color = good ? '#12a150' : '#e0301e'; e.style.left = pt.x + 'px'; e.style.top = pt.y + 'px'; document.body.append(e);
    e.animate([{ transform: 'translate(-50%,6px) scale(.6)', opacity: 0 }, { transform: 'translate(-50%,-14px) scale(1.08)', opacity: 1, offset: .22 }, { transform: 'translate(-50%,-46px) scale(1)', opacity: 0 }], { duration: 1250, easing: 'ease-out' }).onfinish = () => e.remove();
    pl.classList.remove('hit', 'gain'); void pl.offsetWidth; pl.classList.add(good ? 'gain' : 'hit');
  }
  const worldOfPlate = i => { const p = plateOf(i); if (!p) return new THREE.Vector3(); const c = centerOf(p); return Stage.fromScreen(c.x, c.y); };
  const tokenPos = i => { const m = Stage.tokens[i].m.position; return new THREE.Vector3(m.x, m.y + .8, m.z); };
  const BANKP = () => new THREE.Vector3(0, .4, 0);
  function flyCoins(from, toFn, n) { Stage.coins(from, toFn, n, k => Sound.play('coin', k)); }
  const coinCount = a => Math.min(16, Math.max(4, Math.round(a / 20)));

  let bT = 0;
  function banner(html, color, ms = 1700) { const b = $('#banner'); b.innerHTML = html.replace(/^\p{Extended_Pictographic}\uFE0F?\s*/u, ''); b.style.setProperty('--bc', color || 'var(--brass)'); b.classList.add('on'); clearTimeout(bT); bT = setTimeout(() => b.classList.remove('on'), ms / (base)); }
  let tT = 0;
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(tT); tT = setTimeout(() => t.classList.remove('on'), 2300); Sound.play('deny'); }
  function logLine(m) { if (!m) return; const l = $('#log'), d = document.createElement('div'); d.textContent = m; l.prepend(d); while (l.childElementCount > 120) l.lastChild.remove(); }

  // ---------- cartas ----------
  function rentRows(s) {
    const q = SQ[s], pr = st ? st.props[s] : { h: 0 }, cur = i => (pr && pr.owner !== null && !pr.m && pr.h === i ? 'cur' : '');
    if (q.k === 'prop') {
      const mono = pr && pr.owner !== null && Engine.hasMonopoly(st, s);
      return `${st && Engine.sponsored(st, s) ? `<div class="sp-tag">Patrocinado: ${Engine.sponsored(st, s) === 2 ? 'aluguel em dobro' : 'aluguel +50%'}, até alguém roubar</div>` : ''}<table><tr class="${cur(0) && !mono && !pr.x ? 'cur' : ''}"><td>Terreno</td><td>${brl(q.rent[0])}</td></tr><tr class="${cur(0) && (mono || pr.x) ? 'cur' : ''}"><td>${st?.rules?.pux ? 'Puxadinho ou grupo' : 'Grupo fechado'}</td><td>${brl(q.rent[0] * 2)}</td></tr>${[1, 2, 3, 4].map(n => `<tr class="${cur(n)}"><td>${Engine.LEVELS[n]}</td><td>${brl(q.rent[n])}</td></tr>`).join('')}<tr class="${cur(5)}"><td>Hotel</td><td>${brl(q.rent[5])}</td></tr></table><div class="foot"><span>Cada obra: ${brl(q.house)}</span><span>Hipoteca: ${brl(q.price / 2)}</span></div>`;
    }
    if (q.k === 'rail') return `<table>${[1, 2, 3, 4].map(n => `<tr><td>${n === 1 ? '1 aeroporto' : n + ' aeroportos'}</td><td>${brl(17 * 2 ** (n - 1))}</td></tr>`).join('')}</table><div class="foot"><span>Hipoteca: ${brl(q.price / 2)}</span></div>`;
    return `<table><tr><td>1 usina</td><td>3 × dados</td></tr><tr><td>2 usinas</td><td>7 × dados</td></tr></table><div class="foot"><span>Hipoteca: ${brl(q.price / 2)}</span></div>`;
  }
  // a carta acompanha o ponteiro de leve e o brilho corre por cima: dá volume sem pesar
  function tilt(el) {
    el.addEventListener('pointermove', e => { if (e.pointerType !== 'mouse') return; const r = el.getBoundingClientRect(), a = (e.clientX - r.left) / r.width - .5, b = (e.clientY - r.top) / r.height - .5; el.style.setProperty('--ry', a * 7 + 'deg'); el.style.setProperty('--rx', -b * 5 + 'deg'); el.style.setProperty('--gx', (a + .5) * 100 + '%'); el.style.setProperty('--gy', (b + .5) * 100 + '%'); });
    el.addEventListener('pointerleave', () => { el.style.setProperty('--ry', '0deg'); el.style.setProperty('--rx', '0deg'); });
    return el;
  }
  function deedEl(s, extra = '') {
    const q = SQ[s], g = G[q.g], el = document.createElement('div'); el.className = 'deed'; el.style.setProperty('--g', g.c); el.style.setProperty('--band', `url(${Art.bandURL(g.c, g.d)})`);
    el.innerHTML = `<header><small>${q.price ? 'Título de posse' : 'Casa especial'}</small><h2>${esc(q.name)}</h2>${q.place ? `<em>${esc(q.place)}</em>` : ''}</header><div class="art"></div><div class="body">${q.price ? rentRows(s) : ''}${extra}</div><div class="acts"></div>`;
    if (q.art) el.querySelector('.art').append(Art.sceneCanvas(q, 660));
    return tilt(el);
  }
  // sai do ponto de origem girando, de onde a carta 3D parou: fica rápido para não quebrar o ritmo
  function animateIn(el, from, flipIn = true) {
    const r = el.getBoundingClientRect(), dx = from ? from.x - (r.left + r.width / 2) : 0, dy = from ? from.y - (r.top + r.height / 2) : innerHeight * .4;
    return el.animate([{ transform: `perspective(1000px) translate(${dx}px,${dy}px) ${flipIn ? 'rotateY(-90deg)' : 'rotateX(55deg)'} scale(.22)`, opacity: flipIn ? 1 : .3 }, { transform: 'perspective(1000px) translate(0,-8px) rotateY(5deg) scale(1.025)', opacity: 1, offset: .74 }, { transform: 'perspective(1000px) rotateY(0deg) scale(1)', opacity: 1 }], { duration: 380, easing: 'cubic-bezier(.2,.8,.25,1)' }).finished;
  }
  // a carta vai parar no espaço exato daquela casa na faixa do jogador
  async function cardToPlate(el, i, sq) {
    const pl = plateOf(i), slot = pl && pl.querySelector(`.strip i[data-s="${sq}"]`), c = centerOf(slot && slot.offsetWidth ? slot : pl), r = el.getBoundingClientRect(), dx = c.x - (r.left + r.width / 2), dy = c.y - (r.top + r.height / 2);
    await el.animate([{ transform: 'none', opacity: 1 }, { transform: `translate(${dx * .08}px,${dy * .08 - 22}px) rotateZ(-4deg) scale(.96)`, opacity: 1, offset: .22 }, { transform: `translate(${dx * .72}px,${dy * .72 - 26}px) rotateZ(9deg) scale(.26)`, opacity: 1, offset: .78 }, { transform: `translate(${dx}px,${dy}px) rotateZ(14deg) scale(.03)`, opacity: .9 }], { duration: 500, easing: 'cubic-bezier(.45,.05,.55,.95)', fill: 'forwards' }).finished; el.remove();
  }
  async function dropCard(el) { await el.animate([{ transform: 'none', opacity: 1 }, { transform: 'translateY(38vh) rotateX(40deg) scale(.5)', opacity: 0 }], { duration: 240, easing: 'ease-in', fill: 'forwards' }).finished; el.remove(); }
  // a carta lida volta para a pilha de onde saiu
  async function returnCard(el, deck) { const c = Stage.deckPoint(deck), r = el.getBoundingClientRect(); await el.animate([{ transform: 'perspective(1000px) none', opacity: 1 }, { transform: `perspective(1000px) translate(${c.x - r.left - r.width / 2}px,${c.y - r.top - r.height / 2}px) rotateY(88deg) scale(.2)`, opacity: 1 }], { duration: 270, easing: 'cubic-bezier(.5,0,.8,.6)', fill: 'forwards' }).finished; el.remove(); }
  let buyCard = null, buyMin = false;

  // ---------- o que cada evento faz na tela ----------
  const PLAY = {
    async turn(e) {
      if (!st.players[e.who].bot) closeDeed(); Stage.setActive(e.who); highlight(); Stage.overview(Stage.tokens[e.who].at); $('#chip').hidden = true;
      const p = st.players[e.who]; banner(`Vez de <b>${esc(p.name)}</b>`, p.color, 1200);
      Stage.setSpeed(base); Sound.play(p.bot ? 'turn' : 'myTurn'); await wait(p.bot ? 600 : 200);
    },
    async dice(e) {
      if (!st.players[e.who]?.bot) closeDeed(); Stage.recenter(); if (!e.extra) Stage.overview(Stage.tokens[e.who].at);
      await (e.one ? Stage.rollOne(e.a, v => Sound.play('dice', v)) : Stage.rollDice(e.a, e.b, v => Sound.play('dice', v)));
      const c = $('#chip'); c.hidden = false; c.style.animation = 'none'; void c.offsetWidth; c.style.animation = ''; const dupla = !e.one && e.a === e.b && !e.extra; c.classList.toggle('dupla', dupla); if (dupla) Sound.play('dupla'); c.innerHTML = e.one ? `Dado: ${e.a}` : `${e.a} + ${e.b} = ${e.a + e.b}${dupla ? '<em>DUPLA</em>' : ''}`;
      const sum = $('#sum'); sum.innerHTML = e.one ? `<b>${e.a}</b><small>no dado</small>` : `<b>${e.a + e.b}</b><small>${e.a} + ${e.b}${dupla ? ' · <em>DUPLA</em>' : ''}</small>`; sum.classList.add('on'); Sound.play('click'); await wait(900); sum.classList.remove('on'); await wait(120);
    },
    async move(e) {
      Stage.setActive(-1);
      await Stage.walk(e.who, e.from, e.steps, (at, k) => {
        Sound.play('hop', e.steps > 0 ? k : Math.abs(e.steps) - k);
        if (at === 0 && e.salary) { banner(`🧭 Marco Zero: <b>+${brl(e.salary)}</b>`, '#a4f7ab', 1500); Sound.play('cash'); flyCoins(tokenPos(e.who), () => worldOfPlate(e.who), 10); setCash(e.who, disp[e.who] + e.salary); floater(e.who, '+' + brl(e.salary), true); }
      });
      Sound.play('land'); Stage.pulseTile(e.to, st.players[e.who].color); Stage.dust(Stage.tokens[e.who].m.position.x, Stage.tokens[e.who].m.position.z, 7); Stage.setActive(st.turn); await wait(260);
    },
    async jail(e) {
      const p = st.players[e.who]; banner(`<b>${esc(p.name)}</b> foi para a Delegacia: ${esc(e.why)}`, '#c8342e', 1900); Sound.play('siren');
      Stage.blitzCar(false); await Stage.arrest(e.who, () => Sound.play('jail')); refreshPlates(); await wait(420);
    },
    async free(e) { Sound.play('free'); await Stage.release(); Stage.tokens[e.who].inJail = false; Stage.layoutTokens(false); refreshPlates(); await wait(160); },
    async pay(e) {
      const big = e.amt >= 200, from = tokenPos(e.from);
      Sound.play(big ? 'bigPay' : 'pay');
      if (e.to !== null) { banner(`💸 <b>${esc(st.players[e.from].name)}</b> paga <b>${brl(e.amt)}</b> a ${esc(st.players[e.to].name)}`, st.players[e.to].color, 1500); flyCoins(from, () => worldOfPlate(e.to), coinCount(e.amt)); setCash(e.to, disp[e.to] + e.amt); floater(e.to, '+' + brl(e.amt), true); } else { banner(`💸 <b>${esc(st.players[e.from].name)}</b> paga <b>${brl(e.amt)}</b> (${esc(e.why)})`, '#ff9e8a', 1400); flyCoins(from, BANKP, coinCount(e.amt)); }
      setCash(e.from, disp[e.from] - e.amt); floater(e.from, '−' + brl(e.amt), false); if (big) Stage.shake(.35); await wait(820);
    },
    async gain(e) { Sound.play('good'); flyCoins(BANKP(), () => worldOfPlate(e.who), coinCount(e.amt)); setCash(e.who, disp[e.who] + e.amt); floater(e.who, '+' + brl(e.amt), true); await wait(640); },
    async card(e) {
      Stage.overview(Stage.tokens[e.who].at); Stage.setSpeed(base);
      Sound.play('card'); const pt = await Stage.liftCard(e.deck);
      const isD = e.deck === 'destino', g = isD ? ['#2a62d6', '#173d94'] : ['#e4702f', '#a84a1b'], el = tilt(document.createElement('div')), p = st.players[e.who]; el.className = 'deed drawn'; el.style.setProperty('--g', g[0]); el.style.setProperty('--band', `url(${Art.bandURL(g[0], g[1])})`);
      el.innerHTML = `<header><small>Carta de</small><h2>${isD ? 'Sorte' : 'Imprevisto'}</h2></header><div class="inner"><p>${esc(e.text)}</p></div><div class="who">${esc(p.name)}</div><div class="acts"></div>`;
      const pic = document.createElement('canvas'); pic.width = pic.height = 236; const x = pic.getContext('2d'); x.scale(2.36, 2.36); x.fillStyle = '#fbf6e8'; x.fillRect(0, 0, 100, 100); Art.drawScene(x, e.deck, 'neutro'); el.querySelector('.inner').prepend(pic);
      $('#stage').append(el); await animateIn(el, pt);
      if (p.bot) await new Promise(r => setTimeout(r, 2100 / (base)));
      else await new Promise(r => { el.querySelector('.acts').innerHTML = '<button class="btn pri" data-primary>Combinado</button>'; el.querySelector('button').onclick = () => { Sound.play('click'); r(); }; });
      Sound.play('flip'); el.querySelector('.acts').innerHTML = ''; await returnCard(el, e.deck);
    },
    async offerbuy(e) {
      Sound.play('card'); const el = deedEl(e.sq); el.classList.add('buy'); buyCard = el; $('#stage').append(el);
      const pos = Stage.tilePos(e.sq); await animateIn(el, Stage.toScreen(pos.x, .5, pos.z), false);
    },
    async bought(e) {
      const p = st.players[e.who], fly = buyCard; buyCard = null; buyMin = false; Sound.play('stamp');
      // carimbo na cor de quem comprou, e a carta voa para o espaço daquela casa na faixa do jogador
      if (fly) { fly.classList.remove('min'); fly.querySelector('.acts').innerHTML = ''; const s = document.createElement('div'); s.className = 'bought-stamp'; s.style.setProperty('--c', p.color); s.innerHTML = `Comprado<small>${esc(p.name)}</small>`; fly.append(s); s.animate([{ transform: 'rotate(-14deg) scale(2.3)', opacity: 0 }, { transform: 'rotate(-14deg) scale(.94)', opacity: 1, offset: .75 }, { transform: 'rotate(-14deg) scale(1)', opacity: 1 }], { duration: 190, easing: 'ease-in', fill: 'forwards' }); await new Promise(r => setTimeout(r, 300 / base)); Sound.play('card'); await cardToPlate(fly, e.who, e.sq); }
      Sound.play('buy'); setCash(e.who, disp[e.who] - e.amt); floater(e.who, '−' + brl(e.amt), false); claim(e.who, e.sq); await wait(420);
    },
    async auction(e) {
      if (buyCard) { const f = buyCard; buyCard = null; buyMin = false; f.classList.remove('min'); await dropCard(f); }
      Sound.play('gavel'); aucBot = 900; renderAuction(); await wait(500);
    },
    async bid(e) { Sound.play('bid'); renderAuction(true, e); await wait(st.players[e.who].bot ? 360 : 80); },
    async passbid() { Sound.play('pass_'); renderAuction(); await wait(120); },
    async sold(e) {
      removeAuction(); Sound.play('sold'); const p = st.players[e.who]; banner(`🔨 <b>${esc(p.name)}</b> arrematou por <b>${brl(e.amt)}</b>`, p.color, 1800); setCash(e.who, disp[e.who] - e.amt); floater(e.who, '−' + brl(e.amt), false); flyCoins(tokenPos(e.who), BANKP, coinCount(e.amt)); await wait(760); claim(e.who, e.sq); await wait(420);
    },
    async unsold(e) { removeAuction(); Sound.play('no'); banner(`Ninguém quis ${esc(SQ[e.sq].name)}`, '#999', 1300); await wait(500); },
    async build(e) {
      await wait(st.players[e.who].bot ? 320 : 100);
      Stage.setPux(e.sq, false); Stage.setHouses(e.sq, e.h); Sound.play(e.h === 5 ? 'hotel' : 'build'); if (e.amt) { setCash(e.who, disp[e.who] - e.amt); floater(e.who, '−' + brl(e.amt), false); } else banner(esc(e.msg), st.players[e.who].color, 1600); await wait(560);
    },
    async sellb(e) { Stage.setHouses(e.sq, e.h, false); Sound.play('sell'); setCash(e.who, disp[e.who] + e.amt); floater(e.who, '+' + brl(e.amt), true); await wait(260); },
    async mortgage(e) { Stage.setMortgaged(e.sq, e.on); Sound.play('mortgage'); setCash(e.who, disp[e.who] + (e.on ? e.amt : -e.amt)); floater(e.who, (e.on ? '+' : '−') + brl(e.amt), e.on); refreshPlates(); await wait(280); },
    async offered(e) { Sound.play('card'); if (st.players[e.to].bot) banner(`🤝 ${esc(st.players[e.from].name)} fez uma proposta a ${esc(st.players[e.to].name)}`, '#e9c877', 1300); await wait(260); },
    async trade(e) { Sound.play('trade'); banner(`🤝 <b>${esc(st.players[e.a].name)}</b> e <b>${esc(st.players[e.b].name)}</b> fecharam negócio`, '#e9c877', 1800); for (const m of e.moved) { Stage.setOwner(m.sq, st.players[m.to].color); Stage.pulseTile(m.sq, st.players[m.to].color); } st.players.forEach(p => setCash(p.i, p.cash)); refreshPlates(); await wait(620); },
    async tradeNo(e) { Sound.play('no'); banner(`${esc(st.players[e.b].name)} recusou a proposta`, '#999', 1100); await wait(240); },
    async bankrupt(e) {
      const p = st.players[e.who]; closeDeed(); Stage.setActive(-1); Sound.play('bankrupt');
      const c = document.createElement('div'); c.className = 'sp-card broke'; c.innerHTML = `<small>${e.to !== null ? `${esc(st.players[e.to].name)} recebe ${brl(e.paid)}; o resto vai ao banco` : 'Tudo volta para o banco'}</small><b>${esc(p.name)}</b><em>Faliu</em>`; $('#stage').append(c);
      c.animate([{ transform: 'scale(2.2) rotate(-12deg)', opacity: 0 }, { transform: 'scale(.94) rotate(-4deg)', opacity: 1, offset: .7 }, { transform: 'rotate(-3deg)', opacity: 1 }], { duration: 300, easing: 'ease-in', fill: 'forwards' });
      const fall = Stage.dropOut(e.who, () => Sound.play('thud'));
      for (const s of e.props) Stage.pulseTile(s, '#c8342e');
      for (const s of e.props) { Stage.setHouses(s, 0, false); Stage.setPux(s, false); Stage.setOwner(s, null); Stage.setMortgaged(s, false); }
      setCash(e.who, 0); if (e.to !== null) setCash(e.to, st.players[e.to].cash); refreshPlates(); await fall; await wait(250);
      await c.animate([{ opacity: 1 }, { opacity: 0, transform: 'translateY(-16px) rotate(-3deg)' }], { duration: 240, fill: 'forwards' }).finished; c.remove(); Stage.setActive(st.turn);
    },
    async pux(e) {
      if (e.on && (st.players[e.who].bot || !deedOpen)) { await wait(st.players[e.who].bot ? 320 : 100); }
      Stage.setPux(e.sq, e.on); Sound.play(e.on ? 'build' : 'sell'); setCash(e.who, disp[e.who] + (e.on ? -e.amt : e.amt)); floater(e.who, (e.on ? '−' : '+') + brl(e.amt), !e.on); await wait(e.on ? 480 : 260);
    },
    async blitz(e) {
      const si = $('#siren'); banner(`🚨 <b>${esc(st.players[e.who].name)}</b> foi parado na Blitz`, '#c8342e', 2000); const fic = document.createElement('div'); fic.className = 'sp-card crime'; fic.innerHTML = `<small>Blitz: acusação</small><b>${esc(e.crime || 'Atitude suspeita')}</b><em>${esc(st.players[e.who].name)}, encosta aí</em>`; $('#stage').append(fic); fic.animate([{ transform: 'scale(1.8) rotate(-7deg)', opacity: 0 }, { transform: 'rotate(-2deg)', opacity: 1 }], { duration: 240, easing: 'ease-in', fill: 'forwards' }); setTimeout(() => fic.remove(), 2200 / base); Sound.play('blitz'); si.classList.add('on'); setTimeout(() => si.classList.remove('on'), 2200);
      await Stage.blitzCar(true); await wait(260);
    },
    async blitzOk(e) { banner(`😎 <b>${esc(st.players[e.who].name)}</b> passou na Blitz`, '#2f9e57', 1700); Sound.play('free'); Stage.blitzCar(false); await wait(700); },
    async casinoLand(e) {
      const p = st.players[e.who]; Stage.setActive(-1); Sound.play('sponsor');
      banner(e.can ? `🎲 <b>${esc(p.name)}</b> chegou ao Cassino` : `🎲 <b>${esc(p.name)}</b> está sem dinheiro para apostar`, '#1f8a4d', 1500); await wait(700); Stage.setActive(st.turn);
    },
    async casinoSpin(e) {
      Sound.play('roulette'); await Stage.spinRoulette(e.n);
      const sum = $('#sum'); sum.innerHTML = `<b>${e.n}</b><small>${e.color === 'green' ? 'zero' : e.color === 'red' ? 'vermelho' : 'preto'}</small>`; sum.classList.add('on'); Sound.play('click'); await wait(1000); sum.classList.remove('on'); await wait(120);
    },
    async casinoSlot(e) { Sound.play('slot'); await Stage.spinSlot(e.reels, () => Sound.play('slotStop')); await wait(300); },
    async casinoBet(e) { Stage.focusTable(e.game); if (e.game === 'dados') Sound.play('rattle'); await wait(420); },
    async casinoResult(e) {
      const p = st.players[e.who], win = e.won > 0, el = document.createElement('div'), G_ = CAS_GAMES.find(g => g[0] === e.game), pk = { red: 'vermelho', black: 'preto', par: 'par', impar: 'ímpar' }[e.pick] ?? e.pick;
      el.className = `cas-res ${win ? 'win' : 'lose'}`;
      el.innerHTML = `<div class="cr-rays"></div><header>${G_[3]}<span>${G_[1]}</span></header>${faceHTML(p, 76)}<b class="cr-who">${esc(p.name)}</b><h2>${win ? 'Ganhou!' : 'Perdeu!'}</h2><div class="cr-amt">${win ? '+' : '−'}${brl(win ? e.won : e.bet)}</div><div class="cr-det">${e.game === 'slot' ? '' : `Apostou em <b>${esc(pk)}</b> · `}Deu <b>${esc(e.shown)}</b>${win ? ` · Aposta de ${brl(e.bet)}` : ''}</div>`;
      $('#stage').append(el); el.animate([{ transform: 'scale(.3) rotate(-10deg)', opacity: 0 }, { transform: 'scale(1.08) rotate(2deg)', opacity: 1, offset: .65 }, { transform: 'none', opacity: 1 }], { duration: 380, easing: 'cubic-bezier(.2,.9,.3,1.2)' });
      if (win) { Sound.play('casinoWin', e.won); Stage.confetti(0, 2, 0, e.won >= 200 ? 90 : 46); Stage.shake(.14); } else { Sound.play('casinoLose'); el.animate([{ translate: '-50% -50%' }, { translate: 'calc(-50% - 7px) -50%' }, { translate: 'calc(-50% + 7px) -50%' }, { translate: '-50% -50%' }], { duration: 280, delay: 360 }); }
      await new Promise(r => { const tm = setTimeout(r, (p.bot ? 1700 : 2300) / base); el.onclick = () => { clearTimeout(tm); r(); }; });
      await el.animate([{ opacity: 1 }, { opacity: 0, transform: 'translateY(-16px) scale(.96)' }], { duration: 200, fill: 'forwards' }).finished; el.remove();
    },
    async casinoEnd() { Stage.focusTable(null); },
    async sponsorLand(e) {
      const p = st.players[e.who]; Sound.play('sponsor'); Stage.sponsorBurst(20); Stage.shake(.12);
      banner(!e.can ? `⭐ <b>${esc(p.name)}</b> não tem lugar para o patrocínio: leva ${brl(Engine.SPONSOR.cash)}` : e.from !== null ? `⭐ <b>${esc(p.name)}</b> vai roubar o patrocínio de ${esc(st.players[e.from].name)}` : `⭐ <b>${esc(p.name)}</b> ganhou um patrocinador`, '#c9921e', 2000);
      if (e.can) for (const s of Engine.ownedBy(st, e.who)) if (!st.props[s].m) Stage.pulseTile(s, '#ffc94f');
      await wait(900);
    },
    async sponsor(e) {
      closeSheet(); const c = document.createElement('div'), what = e.lv === 2 ? 'Aluguel em dobro' : 'Aluguel +50%'; c.className = 'sp-card'; c.innerHTML = `<small>${e.stolen !== null ? 'Patrocínio roubado' : 'Patrocinado'}</small><b>${esc(SQ[e.sq].name)}</b><em>${what}</em>`; $('#stage').append(c);
      c.animate([{ transform: 'scale(.6) rotate(-4deg)', opacity: 0 }, { transform: 'scale(1.05) rotate(1deg)', opacity: 1, offset: .65 }, { transform: 'none', opacity: 1 }], { duration: 320, easing: 'ease-out' });
      Sound.play('sponsor'); if (e.oldSq !== null) Stage.setSponsor(e.oldSq, 0);
      await Stage.sponsorFly(e.stolen !== null ? e.oldSq : 20, e.sq, e.lv); Sound.play('sponsorStamp'); refreshPlates(); await wait(520);
      await c.animate([{ opacity: 1 }, { opacity: 0, transform: 'translateY(-14px)' }], { duration: 200, fill: 'forwards' }).finished; c.remove();
    },
    async sponsorEnd(e) { Stage.setSponsor(e.sq, 0); },
    async travel(e) {
      banner(`✈️ <b>${esc(st.players[e.who].name)}</b> voou para ${esc(SQ[e.to].name)}`, '#e9c877', 1800); Stage.setActive(-1); Sound.play('plane');
      await Stage.flyPlane(e.who, e.to, st.players[e.who].color); Sound.play('land'); Stage.pulseTile(e.to, st.players[e.who].color); Stage.setActive(st.turn); await wait(260);
    },
    async passused(e) { const p = st.players[e.who]; banner(`🎟️ <b>${esc(p.name)}</b> usou um passe livre${e.left ? `: restam ${e.left}` : ''}`, p.color, 1800); Sound.play('good'); refreshPlates(); await wait(800); },
    async creditAsk(e) { if (st.players[e.who].bot && st.players[e.to].bot) banner(esc(e.msg), '#e9c877', 1300); Sound.play('card'); await wait(260); },
    async creditOk(e) { banner(`🤝 ${esc(e.msg)}`, '#e9c877', 2400); Sound.play('trade'); Stage.pulseTile(e.sq, st.players[e.to].color); refreshPlates(); await wait(1000); },
    async creditNo(e) { banner(esc(e.msg), '#999', 1300); Sound.play('no'); await wait(300); },
    async lien(e) { banner(esc(e.msg), '#c8342e', 2200); Stage.setOwner(e.sq, st.players[e.to].color); Stage.pulseTile(e.sq, st.players[e.to].color); Sound.play('bigPay'); refreshPlates(); await wait(1000); },
    async seized(e) { banner(`🏛️ ${esc(e.msg)}`, '#c8342e', 2200); Stage.setOwner(e.sq, null); Stage.setMortgaged(e.sq, false); Sound.play('gavel'); refreshPlates(); await wait(1000); },
    async reajuste(e) { paintNews(true); banner(`📈 ${esc(e.msg)}`, '#ff9e8a', 2200); Sound.play('card'); await wait(900); },
    async news(e) { await showPaper(e); paintNews(true); },
    async contract(e) { const p = st.players[e.who]; banner(`🏆 <b>${esc(p.name)}</b> cumpriu um contrato: ${esc(e.text)}`, p.color, 2600); Sound.play('good'); flyCoins(BANKP(), () => worldOfPlate(e.who), coinCount(e.amt)); setCash(e.who, disp[e.who] + e.amt); floater(e.who, '+' + brl(e.amt), true); await wait(1100); },
    async note(e) { banner(esc(e.msg), '#999', 1300); await wait(320); },
    async over(e) { finish(e.who); },
  };
  function claim(who, sq) {
    const p = st.players[who]; Stage.setOwner(sq, p.color); Stage.pulseTile(sq, p.color); refreshPlates(); const pl = plateOf(who), slot = pl && pl.querySelector(`.strip i[data-s="${sq}"]`); if (pl) { pl.classList.remove('got'); void pl.offsetWidth; pl.classList.add('got'); } if (slot) slot.classList.add('new');
    if (SQ[sq].k === 'prop' && Engine.hasMonopoly(st, sq)) { const g = G[SQ[sq].g], pos = Stage.tilePos(sq); banner(`🔥 <b>${esc(p.name)}</b> fechou ${esc(g.name)}! Aluguel em dobro`, g.c, 2300); Sound.play('group'); Stage.confetti(pos.x, 1, pos.z, 70); }
  }

  // ---------- leilão ----------
  function removeAuction() { $('#auction')?.remove(); }
  function renderAuction(pulse, ev) {
    const A = st.auction; const shown = ev ? { sq: A?.sq ?? ev.sq, high: ev.amt, by: ev.who } : A; if (!shown || shown.sq === undefined) return;
    let el = $('#auction'); if (!el) { el = document.createElement('div'); el.id = 'auction'; $('#hud').append(el); }
    const s = shown.sq, q = SQ[s], g = G[q.g], by = shown.by, has = by !== null && by !== undefined, cur = has ? by : null, leader = has ? st.players[by] : null;
    el.style.setProperty('--g', g.c); el.style.setProperty('--band', `url(${Art.bandURL(g.c, g.d)})`);
    // o campo de lance sobrevive à repintura se alguém estiver digitando
    const row = el.querySelector('#a-row');
    el.innerHTML = `<header><small>Leilão</small><h2>${esc(q.name)}</h2><em>${q.place ? esc(q.place) + ' · ' : ''}Tabela: ${brl(q.price)}</em></header>
      <div class="a-main"><div class="pic"></div><div class="a-now"><small>Maior lance</small><div class="high ${pulse ? 'pulse' : ''}"><b>${brl(shown.high)}</b></div><div class="lead">${leader ? `<img alt="" src="${faceOf(leader)}"><span>${esc(leader.name)} na frente</span>` : '<span>Ninguém deu lance ainda</span>'}</div></div></div>
      <div class="bidders">${st.players.filter(p => !p.out).map(p => { const inn = A ? A.active.includes(p.i) : true; return `<span class="${p.i === cur ? 'cur' : ''} ${inn ? '' : 'off'}" ${p.bot ? '' : `data-h="${p.i}"`} style="--c:${p.color}"><img alt="" src="${faceOf(p)}">${esc(p.name)}</span>`; }).join('')}</div><div class="a-time"><i></i><b></b></div><div id="a-row"></div>`;
    if (row) el.querySelector('#a-row').replaceWith(row);
    el.querySelector('.pic').append(Art.sceneCanvas(q, 300));
    // com mais de uma pessoa no mesmo aparelho, tocar no próprio nome passa os controles para ela
    el.querySelectorAll('.bidders [data-h]').forEach(c => { c.onclick = () => { aucHuman = +c.dataset.h; syncBid(); }; });
    paintTimer(); syncBid();
  }
  let aucHuman = null, aucBot = 0;
  function paintTimer() {
    const el = $('#auction .a-time'), A = st.auction; if (!el || !A) return;
    const ms = Math.max(0, A.ms ?? 0); el.classList.toggle('low', ms < 5000);
    el.firstChild.style.width = Math.min(100, ms / 200) + '%'; el.lastChild.textContent = Math.ceil(ms / 1000) + ' s';
  }
  // uma batida do relógio do leilão: desconta o tempo e deixa um bot por vez decidir
  async function auctionStep() {
    const t0 = performance.now(); await wait(120);
    const A = st.auction; if (!A || st.ev.length) return;
    const dt = Math.min(performance.now() - t0, 1000); // aba em segundo plano não queima o leilão de uma vez
    Engine.auctionTick(st, dt); if (!st.auction) return;
    paintTimer(); syncBid(); aucBot -= dt;
    if (aucBot > 0) return;
    aucBot = 700 + Math.random() * 1500;
    const bots = A.active.filter(i => st.players[i].bot && i !== A.by); if (!bots.length) return;
    const b = bots[Math.floor(Math.random() * bots.length)], err = Engine.act(st, b, Engine.botAction(st, b));
    if (err) { console.error('bot leilão', err); Engine.act(st, b, { type: 'pass' }); }
  }

  // ---------- decisão de quem joga aqui ----------
  // ícones de desenho: cor chapada e contorno escuro (o contorno vem do CSS), para ler em qualquer botão
  const ICONS = {
    dice: '<rect x="3" y="3" width="18" height="18" rx="4" fill="#fff8e7"/><g fill="#d8402f" stroke="none"><circle cx="8" cy="8" r="2"/><circle cx="16" cy="8" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="8" cy="16" r="2"/><circle cx="16" cy="16" r="2"/></g>',
    flag: '<path d="M6 21V3" stroke-width="3"/><path d="M6 4h13l-3 4 3 4H6z" fill="#e8483a"/>',
    swap: '<path d="M3 6h11V3l7 5-7 5v-3H3z" fill="#3fb56b"/><path d="M21 14H10v-3l-7 5 7 5v-3h11z" fill="#f2a33a"/>',
    case: '<path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><rect x="3" y="7" width="18" height="13" rx="2.5" fill="#b9743a"/><path d="M3 13h18"/><rect x="10" y="11" width="4" height="4" rx="1" fill="#f6c945"/>',
    doc: '<path d="M6 2.5h9l4 4.5v14.500H6z" fill="#fff8e7"/><path d="M15 2.500V7h4" fill="#cfe3f5"/><path d="M9 12h7M9 16.500h7" stroke="#4aa3df"/>',
    cart: '<path d="M2 3.500h3l1 3.500" /><path d="M6 7h15l-2.500 8.500H8.500z" fill="#4aa3df"/><circle cx="9.500" cy="19.500" r="2" fill="#f6c945"/><circle cx="17" cy="19.500" r="2" fill="#f6c945"/>',
    gavel: '<path d="M11 10l-7.500 7.500 3 3L14 13z" fill="#e2b06a"/><path d="M12 2.500l9.500 9.500-3.500 3.500L8.500 6z" fill="#b9743a"/><path d="M12 21.500h9" stroke-width="3"/>',
    x: '<circle cx="12" cy="12" r="9.500" fill="#e8483a"/><path d="M8 8l8 8M16 8l-8 8" stroke="#fff" stroke-width="3"/>',
    check: '<circle cx="12" cy="12" r="9.500" fill="#3fb56b"/><path d="M7 12.500l3.500 3.500L17 8.500" stroke="#fff" stroke-width="3"/>',
    coin: '<circle cx="12" cy="12" r="9.500" fill="#f6c945"/><circle cx="12" cy="12" r="6.500" fill="#ffe08a" stroke="#c9921e" stroke-width="1.200"/><path d="M14.500 10c-.4-.8-1.200-1.300-2.500-1.300-1.500 0-2.500.7-2.500 1.700s1 1.400 2.500 1.700 2.500.7 2.500 1.700-1 1.700-2.500 1.700c-1.300 0-2.100-.5-2.500-1.300M12 7v10" stroke-width="1.500"/>',
    house: '<path d="M5.500 10v10.500h13V10z" fill="#fff1cf"/><path d="M2.500 11.500L12 3l9.500 8.500z" fill="#e8483a"/><rect x="10" y="14" width="4" height="6.500" fill="#8a5a2b"/>',
    tag: '<path d="M3 11.500V3.500h8l10 10-8 8z" fill="#f6c945"/><circle cx="7.500" cy="7.500" r="1.700" fill="#fff"/>',
    bank: '<path d="M2.500 10L12 3l9.500 7z" fill="#4aa3df"/><path d="M5 10v8h3v-8zM10.500 10v8h3v-8zM16 10v8h3v-8z" fill="#fff8e7"/><rect x="2.500" y="18" width="19" height="3" fill="#dfe6ee"/>',
    warn: '<path d="M12 2.500l10 18.500H2z" fill="#f6c945"/><path d="M12 9.500v5.500M12 18h.01" stroke-width="2.800"/>',
    eye: '<path d="M1.500 12S5.500 5 12 5s10.500 7 10.500 7-4 7-10.500 7S1.500 12 1.500 12z" fill="#fff"/><circle cx="12" cy="12" r="3.800" fill="#4aa3df"/><circle cx="12" cy="12" r="1.300" fill="#2a1a0e" stroke="none"/>',
    card: '<rect x="4" y="2.500" width="16" height="19" rx="2.500" fill="#a667d9"/><rect x="7.500" y="6" width="9" height="12" rx="1.500" fill="#fff8e7"/><path d="M12 9.500v5M9.500 12h5" stroke="#a667d9"/>',
    plane: '<path d="M2 11.500L22 3l-6.500 18.500-4-7.500z" fill="#cfe3f5"/><path d="M22 3L11.500 14" stroke="#4aa3df"/>',
    pin: '<path d="M12 22s7.500-6.500 7.500-13a7.500 7.500 0 0 0-15 0c0 6.500 7.500 13 7.500 13z" fill="#e8483a"/><circle cx="12" cy="9" r="2.800" fill="#fff"/>',
    jail: '<rect x="3.500" y="3.500" width="17" height="17" rx="2" fill="#f2a33a"/><path d="M9 3.500v17M15 3.500v17M3.500 12h17" stroke="#55606e" stroke-width="2.600"/>',
  };
  const ic = n => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n]}</svg>`;
  const ICON_OF = [[/^(Lançar|Rolar|Jogar|Tentar dupla)/, 'dice'], [/^Encerrar/, 'flag'], [/^Negociar/, 'swap'], [/^(Patrimônio|Vender ou)/, 'case'], [/^Contratos/, 'doc'], [/^Comprar/, 'cart'], [/^(Ir a leilão|Dar lance)/, 'gavel'], [/^(Passar|Dispensar)/, 'x'], [/^(Pagar|Subornar|Pedir fiado|Apostar)/, 'coin'], [/^(Puxadinho|Construir|Erguer|Subir)/, 'house'], [/^Vender/, 'tag'], [/^Hipotecar/, 'bank'], [/^Declarar/, 'warn'], [/^Ver o tab/, 'eye'], [/^(Ver a carta|Usar habeas)/, 'card'], [/^Aeroporto/, 'plane'], [/^Ficar/, 'pin'], [/^Ir preso/, 'jail'], [/^Escolher/, 'pin']];
  function btn(label, on, cls = '', primary = false) { const b = document.createElement('button'), n = ICON_OF.find(([r]) => r.test(label))?.[1]; b.className = 'btn ' + cls; b.innerHTML = `${n ? ic(n) : ''}<span></span>`; b.lastChild.textContent = label; b.onclick = () => { Sound.play('click'); on(); }; if (primary) b.dataset.primary = '1'; return b; }
  function clearBar() { $('#bar').innerHTML = ''; $('#casino')?.remove(); const r = $('#a-row'); if (r) r.innerHTML = ''; }
  function act(who, a) {
    const err = Engine.act(st, who, a);
    if (err) { toast(err); return false; }
    if (st.phase === 'auction' && st.auction) { $('#bar').innerHTML = ''; syncBid(); pump(); return true; }
    clearBar();
    // enquanto os outros jogam, o patrimônio continua a um clique
    if (!st.players[who].bot && !st.players[who].out) $('#bar').append(btn('Patrimônio', () => portfolio(who)));
    pump(); return true;
  }
  // os controles de lance ficam sempre à vista; fora da sua vez, só desligados
  function bidRow(who) {
    const p = st.players[who], r = $('#a-row'), bid = v => act(who, { type: 'bid', amount: v });
    r.innerHTML = ''; r.dataset.k = st.auction.sq + ':' + who;
    // valor exato, em milhares, com atalhos ao lado
    const form = document.createElement('form'); form.className = 'a-exact'; form.innerHTML = `<label><span>R$</span><input type="number" inputmode="numeric" step="1" max="${p.cash}" aria-label="Valor do lance, em milhares"><span>.000</span></label>`;
    const inp = form.querySelector('input'), send = btn('Dar lance', () => { const v = Math.floor(+inp.value), min = st.auction.high + 1; if (!v || v < min) return toast(`O lance mínimo é ${brl(min)}`); if (v > p.cash) return toast('Sem dinheiro para esse lance'); bid(v); }, 'pri', true);
    form.onsubmit = ev => { ev.preventDefault(); send.click(); }; form.append(send); r.append(form);
    const row2 = document.createElement('div'); row2.className = 'a-quick';
    [10, 30, 70].forEach(d => { const b = btn('+' + brl(d).replace('R$ ', ''), () => bid(st.auction.high + d)); b.dataset.d = d; row2.append(b); });
    const pass = btn('Passar', () => act(who, { type: 'pass' }), 'red'); pass.dataset.pass = '1'; row2.append(pass);
    r.append(row2, hintEl('')); inp.value = Math.min(p.cash, st.auction.high + 10);
  }
  // os controles ficam sempre vivos; só mudam o mínimo e o que quem está na frente pode fazer
  function syncBid() {
    const A = st.auction, r = $('#a-row'); if (!A || !r) return;
    const humans = st.players.filter(p => !p.bot && !p.out); if (!humans.length) return;
    const on = humans.filter(p => A.active.includes(p.i)), p = on.find(q => q.i === aucHuman) ?? on[0];
    if (!p) { if (r.dataset.k !== 'fora') { r.dataset.k = 'fora'; r.innerHTML = ''; r.append(hintEl('Você saiu deste leilão')); } return; }
    if (r.dataset.k !== A.sq + ':' + p.i || !r.children.length) { bidRow(p.i); if (innerWidth > 820) r.querySelector('input').select(); }
    const lead = A.by === p.i, inp = r.querySelector('input');
    inp.min = A.high + 1; if (document.activeElement !== inp || +inp.value <= A.high) inp.value = Math.min(p.cash, A.high + 10);
    r.querySelectorAll('button').forEach(b => { b.disabled = lead || (b.dataset.d ? A.high + +b.dataset.d > p.cash : false); });
    inp.disabled = lead;
    const h = r.lastChild, txt = `${humans.length > 1 ? `<b>${esc(p.name)}</b> · ` : ''}${lead ? 'Você está na frente' : 'Você tem ' + brl(p.cash)}`; if (h.dataset.t !== txt) { h.dataset.t = txt; h.innerHTML = txt; }
  }
  function renderControls() {
    if (st && st.phase === 'auction') { if (!busy) pump(); return; }
    clearBar(); if (!st || st.phase === 'over') return;
    const who = Engine.actor(st), p = st.players[who], bar = $('#bar');
    if (p.bot) return;
    Stage.setSpeed(base);
    if (st.credit) return showCredit();
    if (st.offer) return showOffer();
    if (st.phase === 'buy') {
      if (!buyCard) { buyCard = deedEl(st.buy); buyCard.classList.add('buy'); $('#stage').append(buyCard); }
      const cost = Engine.buyPrice(st, st.buy), box = buyCard.querySelector('.acts'), q = SQ[st.buy], poor = p.cash < cost;
      const buy = () => { const b = btn('Comprar por ' + brl(cost), () => act(who, { type: 'buy' }), 'pri', true); b.disabled = poor; return b; }, skip = () => btn('Ir a leilão', () => act(who, { type: 'decline' }));
      box.innerHTML = ''; box.append(buy(), skip(), btn('Ver o tabuleiro', () => { buyMin = true; renderControls(); }, 'ghost')); buyCard.classList.toggle('min', buyMin);
      if (buyMin) bar.append(hintEl(`${esc(q.name)}: ${brl(cost)}`), buy(), skip(), btn('Ver a carta', () => { buyMin = false; renderControls(); }));
      else bar.append(hintEl(poor ? `${esc(p.name)} não tem como pagar: dá para hipotecar ou leiloar` : `${esc(p.name)} decide`));
      bar.append(btn('Patrimônio', () => portfolio(who)));
      return;
    }
    Stage.overview(Stage.tokens[st.turn].at);
    if (st.phase === 'debt') {
      const d = st.debts[0], b = btn(`Pagar ${brl(d.amt)}`, () => act(who, { type: 'pay' }), 'pri', true); if (p.cash < d.amt) b.disabled = true;
      bar.append(hintEl(`${esc(p.name)} deve ${brl(d.amt)} (${esc(d.why)})`), b, btn('Vender ou hipotecar', () => portfolio(who)), btn('Negociar', () => tradeBox(who)));
      if (st.rules?.fiado && !Engine.fiadoError(st, who, d)) bar.append(btn('Pedir fiado', () => fiadoBox(who)));
      bar.append(btn('Declarar falência', () => confirmBankrupt(who), 'red'));
      return;
    }
    if (st.phase === 'casino') {
      const top = Engine.maxBet(st, who), T = Engine.CASINO, box = document.createElement('div'); box.className = 'cas';
      let game = 'roleta', pick = 'red', amt = Math.min(25, top), go;
      const seg = (cls, items, on) => `<div class="s-seg ${cls}">${items.map(([v, t, off]) => `<button data-v="${v}" class="${on(v) ? 'on' : ''}" ${off ? 'disabled' : ''}>${t}</button>`).join('')}</div>`;
      // o valor muda sem repintar o painel, para o arrasto da barra não se perder
      const paintAmt = (typing) => {
        const r = box.querySelector('#cas-r'), v = box.querySelector('#cas-v'), num = typeof pick === 'number', m = game === 'roleta' ? (num ? T.number : T.color) : T.parity;
        r.value = amt; r.style.setProperty('--p', `${top > T.min ? (amt - T.min) / (top - T.min) * 100 : 100}%`); if (!typing) v.value = amt;
        box.querySelectorAll('.cas-q button').forEach(b => b.classList.toggle('on', +b.dataset.a === amt));
        box.querySelector('#cas-pay').innerHTML = game === 'slot' ? `<span>3 iguais: <b>${brl(amt * T.slot3)}</b></span><span>2 iguais: <b>${brl(Math.floor(amt * T.slot2))}</b></span>` : `<span>Paga ${m}×</span><span>Se ganhar: <b>${brl(amt * m)}</b></span>`;
        if (go) go.lastChild.textContent = `Apostar ${brl(amt)}`;
      };
      const draw = () => {
        const num = typeof pick === 'number', ro = game === 'roleta', k = num ? 'num' : pick;
        box.innerHTML = `<div class="cas-g">${CAS_GAMES.map(([id, t, sub, ico]) => `<button data-g="${id}" class="${id === game ? 'on' : ''}">${ico}<b>${t}</b><small>${sub}</small></button>`).join('')}</div>`
          + (ro ? seg('three', [['red', 'Vermelho'], ['black', 'Preto'], ['num', 'Número']], v => v === k).replace('s-seg', 's-seg p') : game === 'dados' ? seg('', [['par', 'Par'], ['impar', 'Ímpar']], v => v === k).replace('s-seg', 's-seg p') : '')
          + (num ? `<label class="pickn">Número (0 a 36) <input id="cas-n" type="number" min="0" max="36" value="${pick}"></label>` : '')
          + `<div class="cas-amt"><label class="cas-val"><span>Aposta</span><i>R$</i><input id="cas-v" type="number" min="${T.min}" max="${top}" step="1" inputmode="numeric" aria-label="Valor da aposta, em mil"><i>mil</i></label><input id="cas-r" type="range" min="${T.min}" max="${top}" step="1" aria-label="Valor da aposta"><div class="cas-q">${[...new Set([5, 10, 25, 50, top])].filter(v => v <= top).sort((a, b) => a - b).map(v => `<button data-a="${v}">${v === top ? 'Máx' : v}</button>`).join('')}</div></div><div class="pay" id="cas-pay"></div>`;
        box.querySelectorAll('[data-g]').forEach(b => { b.onclick = () => { game = b.dataset.g; pick = game === 'roleta' ? 'red' : game === 'dados' ? 'par' : null; Sound.play('click'); draw(); }; });
        box.querySelectorAll('.p button').forEach(b => { b.onclick = () => { pick = b.dataset.v === 'num' ? 17 : b.dataset.v; draw(); }; });
        box.querySelectorAll('.cas-q button').forEach(b => { b.onclick = () => { amt = +b.dataset.a; Sound.play('click'); paintAmt(); }; });
        box.querySelector('#cas-r').oninput = ev => { amt = +ev.target.value; paintAmt(); };
        const val = box.querySelector('#cas-v'), clamp = x => Math.max(T.min, Math.min(top, Math.floor(+x) || T.min));
        val.oninput = () => { amt = clamp(val.value); paintAmt(true); }; val.onchange = () => { amt = clamp(val.value); paintAmt(); };
        const n = box.querySelector('#cas-n'); if (n) n.onchange = () => { pick = Math.max(0, Math.min(36, Math.round(+n.value) || 0)); draw(); };
        paintAmt();
      };
      go = btn('Apostar', () => act(who, { type: 'bet', game, pick, amount: amt }), 'pri', true); draw();
      const pop = document.createElement('div'), foot = document.createElement('div'); pop.id = 'casino'; foot.className = 'cas-go';
      pop.innerHTML = `<header><small>Cassino</small><h2>Faça sua aposta</h2><em>Até ${brl(top)}, se quiser</em></header>`; foot.append(go, btn('Passar', () => act(who, { type: 'nobet' }))); pop.append(box, foot); $('#hud').append(pop); paintAmt();
      return;
    }
    if (st.phase === 'sponsor') {
      const pick = () => { const list = Engine.ownedBy(st, who).filter(s => !st.props[s].m); sheet(`<button class="close" data-x>✕</button><h2>${st.sp && st.sp.who !== who ? `Roube o patrocínio de ${esc(st.players[st.sp.who].name)}` : 'Escolha o lugar patrocinado'}</h2><p class="sub">${!st.sp ? 'Aluguel +50%' : st.sp.who === who ? 'Sobe para aluguel em dobro' : st.sp.lv === 2 ? 'Vem com aluguel em dobro' : 'Vem com aluguel +50%'}. Vale até outra pessoa cair no Patrocinador.</p><div class="chips">${list.map(s => chip(s, false)).join('')}</div>`, box => box.querySelectorAll('[data-s]').forEach(b => { b.onclick = () => { closeSheet(); act(who, { type: 'sponsor', sq: +b.dataset.s }); }; })); };
      bar.append(hintEl('O patrocinador quer investir em um lugar seu'), btn('Escolher o lugar', pick, 'pri', true), btn('Dispensar', () => act(who, { type: 'nosponsor' })));
      pick(); return;
    }
    if (st.phase === 'blitz') {
      const b = btn(`Subornar (${brl(Engine.JEITINHO)})`, () => act(who, { type: 'jeitinho' }), 'pri', p.cash >= Engine.JEITINHO); if (p.cash < Engine.JEITINHO) b.disabled = true;
      bar.append(hintEl(`Acusação: <b>${esc(st.crime || 'atitude suspeita')}</b>. Tente o suborno: um dado, de 1 a 4 o guarda aceita; 5 ou 6, paga mais ${brl(Engine.JEITINHO)} e vai preso`), b, btn('Ir preso', () => act(who, { type: 'jailgo' }), '', p.cash < Engine.JEITINHO));
      return;
    }
    if (st.phase === 'travel') {
      const free = st.props[p.pos].owner === who, cost = free ? 0 : Engine.TRAVEL;
      bar.append(hintEl(free ? 'Aeroporto seu: viagem de graça' : `Viajar custa ${brl(cost)}`));
      for (const s of Engine.GROUP_OF.rail) if (s !== p.pos) { const b = btn(SQ[s].name, () => act(who, { type: 'travel', to: s })); if (p.cash < cost) b.disabled = true; bar.append(b); }
      bar.append(btn('Ficar aqui', () => act(who, { type: 'stay' }), 'pri', true));
      return;
    }
    if (st.phase === 'roll') {
      if (p.jail) { bar.append(btn(`Tentar dupla (${p.tries + 1}ª de 3)`, () => act(who, { type: 'roll' }), 'pri', true)); const bail = btn(`Pagar fiança de ${brl(Engine.BAIL)}`, () => act(who, { type: 'bail' })); if (p.cash < 50) bail.disabled = true; bar.append(bail); if (p.cards.length) bar.append(btn('Usar habeas corpus', () => act(who, { type: 'usecard' }))); } else bar.append(btn(st.doubles ? 'Dupla! Lançar de novo' : 'Lançar os dados', () => act(who, { type: 'roll' }), 'pri', true));
    } else bar.append(btn('Encerrar a vez', () => act(who, { type: 'end' }), 'pri', true));
    bar.append(btn('Patrimônio', () => portfolio(who)), btn('Negociar', () => tradeBox(who)));
    if (st.rules?.contracts && p.contracts.length) bar.append(btn('Contratos', () => contractsBox(who)));
  }
  function hintEl(html) { const d = document.createElement('div'); d.className = 'hint'; d.innerHTML = html; return d; }
  function confirmBankrupt(who) { sheet(`<h2>Declarar falência?</h2><p class="sub">Você sai da partida. O banco liquida seus bens e paga quem você deve, até o valor da dívida; seus lugares ficam livres, ou vão a leilão se a dívida for com o banco. Antes disso, dá para vender obras, hipotecar ou negociar.</p><div class="row-end"><button class="btn" data-x>Voltar</button><button class="btn red" id="fali">Falir</button></div>`, box => { box.querySelector('#fali').onclick = () => { closeSheet(); act(who, { type: 'bankrupt' }); }; }); }

  // ---------- janelas ----------
  function sheet(html, after) { closeSheet(); const s = document.createElement('div'); s.className = 'sheet'; s.innerHTML = `<div class="box">${html}</div>`; s.onclick = e => { if (e.target === s || e.target.closest('[data-x]')) { Sound.play('click'); closeSheet(); } }; document.body.append(s); after && after(s.firstElementChild); minimizable(s); return s; }
  function closeSheet() { document.querySelector('.sheet')?.remove(); $('#sheet-back')?.remove(); }
  // toda tela pode sair da frente para olhar o tabuleiro, sem perder o que estava nela
  function minimizable(s) {
    const box = s.firstElementChild; if (box.querySelector('.final')) return;
    const m = document.createElement('button'); m.className = 'mini'; m.title = 'Ver o tabuleiro'; m.setAttribute('aria-label', 'Minimizar e ver o tabuleiro'); m.innerHTML = ic('eye'); box.prepend(m);
    m.onclick = () => {
      Sound.play('click'); s.style.display = 'none';
      const back = document.createElement('button'); back.id = 'sheet-back'; back.className = 'btn pri'; back.innerHTML = `${ic('card')}<span></span>`; back.lastChild.textContent = `Voltar: ${box.querySelector('h2')?.textContent || 'tela'}`;
      back.onclick = () => { Sound.play('click'); back.remove(); s.style.display = ''; }; document.body.append(back);
    };
  }
  function chip(s, sel, cls = '') { const q = SQ[s], pr = st.props[s]; return `<button class="chipb ${pr.m ? 'm' : ''} ${sel ? 'sel' : ''} ${cls}" data-s="${s}" style="--gc:${G[q.g].c}"><i></i><span>${esc(q.name)}<small>${pr.m ? (st.rules?.mortgage ? `hipotecada: ${Engine.roundsToSeize(st, s)} voltas` : 'hipotecada') : pr.lien ? 'garantia de fiado' : pr.x ? 'puxadinho' : pr.h ? Engine.LEVELS[pr.h].toLowerCase() : brl(q.price)}</small></span></button>`; }
  function portfolio(i) {
    const p = st.players[i], mine = Engine.ownedBy(st, i), stat = (t, v) => `<div class="st"><small>${t}</small><b>${v}</b></div>`;
    const body = groupsOrder.filter(g => mine.some(s => SQ[s].g === g)).map(g => {
      const list = Engine.GROUP_OF[g], n = list.filter(s => st.props[s].owner === i).length, full = n === list.length;
      return `<section class="gr" style="--gc:${G[g].c}"><header><i></i><b>${esc(G[g].name)}</b><span class="${full ? 'full' : ''}">${full ? 'Grupo completo' : `${n} de ${list.length}`}</span></header><div class="pc-grid">${list.map(s => { const o = st.props[s].owner; return o === i ? pcard(s) : `<div class="pc ghost"><span class="pc-art"><img alt="" src="${artURL(s)}"></span><b>${esc(SQ[s].name)}</b><small>${o === null ? 'Sem dono: ' + brl(SQ[s].price) : 'De ' + esc(st.players[o].name)}</small></div>`; }).join('')}</div></section>`;
    }).join('');
    sheet(`<button class="close" data-x>✕</button><h2>Patrimônio</h2><div class="pf-top">${whoCard(p, nProps(i))}<div class="sts">${stat('Dinheiro', brl(p.cash))}${stat('Vale cerca de', brl(Engine.worth(st, i)))}${p.cards.length ? stat('Habeas corpus', p.cards.length) : ''}</div></div>${body || '<p class="empty">Ainda sem nenhuma propriedade. Caia num lugar sem dono para comprar.</p>'}${extras(i)}<p class="sub bankl">O banco tem ${st.bank.houses} obras e ${st.bank.hotels} hotéis. Toque numa carta para construir, vender ou hipotecar.</p>`, box => { const pay_ = box.querySelector('#repay'); if (pay_) pay_.onclick = () => { closeSheet(); act(i, { type: 'repay' }); }; box.querySelectorAll('[data-s]').forEach(b => { b.onclick = () => { Sound.play('flip'); closeSheet(); openDeed(+b.dataset.s); }; }); }).firstElementChild.classList.add('wide');
  }
  function extras(i) {
    const nm = n => esc(st.players[n].name), l = Engine.loanOf(st, i), held = st.passes.filter(x => x.to === i), given = st.passes.filter(x => x.from === i), debts = st.loans.filter(x => x.to === i);
    const lines = [...held.map(x => `Pode pisar sem pagar ${x.n}× nas de ${nm(x.from)}`), ...given.map(x => `${nm(x.to)} pisa sem pagar ${x.n}× nas suas`), ...debts.map(x => `${nm(x.who)} deve ${brl(x.total)} de fiado, com ${esc(SQ[x.sq].name)} de garantia`)];
    const canRepay = l && !st.players[i].bot && st.players[i].cash >= l.total;
    if (l) lines.push(`Deve ${brl(l.total)} a ${nm(l.to)} em ${l.left} ${l.left === 1 ? 'vez' : 'vezes'}, com ${esc(SQ[l.sq].name)} de garantia ${canRepay ? '<button class="btn" id="repay">Pagar agora</button>' : ''}`);
    return lines.length ? `<div class="groupline">Combinados</div>${lines.map(t => `<p class="terms" style="margin:3px 0">${t}</p>`).join('')}` : '';
  }
  // na tela compartilhada, os contratos só abrem para quem está na vez
  function contractsBox(i) {
    const p = st.players[i];
    const cards = p.contracts.map(id => { const c = Engine.CONTRACTS[id], k = c.t.indexOf(':'); return `<article class="ct"><span class="ct-seal">★</span><div class="ct-txt"><small>Contrato secreto</small><b>${esc(c.t.slice(0, k))}</b><span>${esc(c.t.slice(k + 1).trim().replace(/^./, m => m.toUpperCase()))}</span></div><div class="ct-pr"><small>Prêmio</small><b>${brl(c.prize)}</b>${p.swap ? `<button class="btn" data-c="${id}">Trocar</button>` : ''}</div></article>`; }).join('');
    sheet(`<button class="close" data-x>✕</button><h2>Contratos</h2>${whoCard(p, `${p.dealt} de 4 recebidos nesta partida`)}<p class="sub ct-warn">Secretos: confira com a mesa olhando para o outro lado.${p.swap ? ' Você passou pelo Marco Zero e pode trocar um.' : ''}</p><div class="cts">${cards}</div>`, box => box.querySelectorAll('[data-c]').forEach(b => { b.onclick = () => { if (act(i, { type: 'swapc', id: +b.dataset.c })) contractsBox(i); }; }));
  }
  // conta do fiado em blocos: quanto deve, quanto custa e em quantas vezes
  const creditFlow = (amt, rate, turns) => { const extra = Math.ceil(amt * rate / 100); return `<div class="cf"><div><small>A conta</small><b>${brl(amt)}</b></div><i>+</i><div><small>Juros de ${rate}%</small><b>${brl(extra)}</b></div><i>=</i><div class="tot"><small>Paga em ${turns} ${turns === 1 ? 'vez' : 'vezes'}</small><b>${brl(amt + extra)}</b></div></div>`; };
  const rateSlider = (id, v) => `<input class="rng" id="${id}" type="range" min="0" max="50" step="1" value="${v}" style="--p:${v * 2}%" aria-label="Juros, em porcentagem">`;
  function fiadoBox(me) {
    const d = st.debts[0], C = st.players[d.to], ok = Engine.ownedBy(st, me).filter(s => !Engine.fiadoError(st, me, d, s)); let sq = ok[0], turns = 2, rate = 10;
    const draw = () => sheet(`<button class="close" data-x>✕</button><h2>Pedir fiado a ${esc(C.name)}</h2><p class="sub">Você deve ${brl(d.amt)} de ${esc(d.why)} e não tem como pagar agora. Só dá para pedir uma vez por conta.</p>
      <div id="fflow">${creditFlow(d.amt, rate, turns)}</div>
      <div class="c-set"><label><span>Juros que você oferece <b id="frv">${rate}%</b></span>${rateSlider('frate', rate)}</label><div><span>Prazo, em vezes suas</span><div class="seg">${[1, 2, 3].map(n => `<button data-t="${n}" class="${n === turns ? 'on' : ''}">${n}</button>`).join('')}</div></div></div>
      <div class="groupline">Garantia: se não pagar no prazo, vai para ${esc(C.name)}</div><div class="chips">${ok.map(s => chip(s, s === sq)).join('') || '<span class="sub">Nenhum lugar seu serve: precisa valer mais que a dívida, sem hipoteca nem construção.</span>'}</div>
      <p class="err" id="ferr"></p><div class="row-end"><button class="btn" data-x>Voltar</button><button class="btn pri" id="fsend" ${ok.length ? '' : 'disabled'}>${ic('coin')}Pedir fiado</button></div>`, box => {
      const r = box.querySelector('#frate');
      r.oninput = () => { rate = +r.value; r.style.setProperty('--p', rate * 2 + '%'); box.querySelector('#frv').textContent = rate + '%'; box.querySelector('#fflow').innerHTML = creditFlow(d.amt, rate, turns); };
      box.querySelectorAll('[data-s]').forEach(b => { b.onclick = () => { sq = +b.dataset.s; Sound.play('click'); draw(); }; });
      box.querySelectorAll('[data-t]').forEach(b => { b.onclick = () => { turns = +b.dataset.t; Sound.play('click'); draw(); }; });
      box.querySelector('#fsend').onclick = () => { const err = Engine.act(st, me, { type: 'fiado', sq, rate, turns }); if (err) { box.querySelector('#ferr').textContent = err; Sound.play('deny'); return; } closeSheet(); clearBar(); pump(); };
    });
    draw();
  }
  function showCredit() {
    const c = st.credit, A = st.players[c.who], B = st.players[c.to], asking = c.stage === 'ask', me = asking ? c.to : c.who, q = SQ[c.sq];
    sheet(`<h2>${asking ? `${esc(A.name)} pediu fiado` : `${esc(B.name)} mudou os juros`}</h2><p class="sub">${esc(st.players[me].name)} decide. ${asking ? `Em vez de pagar agora, ${esc(A.name)} paga mais depois.` : `Para aceitar o fiado, agora são ${c.rate}% de juros.`}</p>
      ${creditFlow(c.amt, c.rate, c.turns)}
      <div class="c-guar"><span class="pc-art"><img alt="" src="${artURL(c.sq)}"></span><div><small>Garantia</small><b>${esc(q.name)}</b><span>Se ${esc(A.name)} não pagar em ${c.turns} ${c.turns === 1 ? 'vez' : 'vezes'}, vai para ${esc(B.name)}</span></div></div>
      ${asking ? `<div class="c-set c-counter"><label><span>Quer outros juros? <b id="crv">${c.rate}%</b></span>${rateSlider('crate', c.rate)}</label><p id="cgain"></p></div>` : ''}
      <div class="row-end"><button class="btn" id="cno">${ic('x')}${asking ? 'Recusar' : 'Desistir'}</button>${asking ? `<button class="btn" id="ccnt" hidden>${ic('swap')}<span></span></button>` : ''}<button class="btn pri" id="cyes" data-primary>${ic('check')}Aceitar ${c.rate}%</button></div>`, box => {
      box.querySelector('#cyes').onclick = () => { closeSheet(); act(me, { type: 'creditYes' }); };
      box.querySelector('#cno').onclick = () => { closeSheet(); act(me, { type: 'creditNo' }); };
      const r = box.querySelector('#crate'); if (!r) return;
      const k = box.querySelector('#ccnt'), paint = () => { const v = +r.value, extra = Math.ceil(c.amt * v / 100); r.style.setProperty('--p', v * 2 + '%'); box.querySelector('#crv').textContent = v + '%'; box.querySelector('#cgain').innerHTML = `Com ${v}%, você recebe <b>${brl(c.amt + extra)}</b>: ${brl(extra)} a mais que a conta.`; k.hidden = v === c.rate; k.lastChild.textContent = `Propor ${v}%`; };
      r.oninput = paint; paint();
      k.onclick = () => { closeSheet(); act(me, { type: 'creditCounter', rate: +r.value }); };
    });
    document.querySelector('.sheet').onclick = null;
  }
  function closeDeed() { if (deedOpen) { deedOpen.el.remove(); deedOpen = null; } }
  function openDeed(s) {
    closeDeed(); const q = SQ[s], pr = st?.props[s], owner = pr && pr.owner !== null ? st.players[pr.owner] : null;
    const line = !q.price ? '' : owner ? `<p class="state">De ${esc(owner.name)}${pr.m ? ' · hipotecada' : ''}${pr.lien ? ' · garantia de fiado' : ''}</p>${pr.m && st.rules?.mortgage ? `<p class="state">Dívida de ${brl(Engine.liftCost(st, s))}: penhora em ${Engine.roundsToSeize(st, s)} voltas</p>` : !pr.m && q.k !== 'util' ? `<p class="state">Aluguel agora: ${brl(Engine.rentOf(st, s))}</p>` : ''}` : '<p class="state">Ainda sem dono</p>';
    const el = deedEl(s, line); el.classList.add('side'); $('#stage').append(el); deedOpen = { el, s }; animateIn(el, null);
    const acts = el.querySelector('.acts');
    if (owner && !owner.bot && st.phase !== 'auction' && !st.offer && !st.credit) {
      const do_ = a => { if (act(owner.i, a) && deedOpen?.s === s) openDeed(s); };
      if (q.k === 'prop') {
        const cost = Engine.buildCost(st, s), usePux = st.rules?.pux && !pr.h && !pr.x && !Engine.hasMonopoly(st, s);
        if (usePux) { const b = btn(`Puxadinho (${brl(cost)})`, () => do_({ type: 'pux', sq: s }), 'pri'), e = Engine.canPux(st, owner.i, s); if (e) { b.disabled = true; b.title = e; } acts.append(b); }
        else if (pr.h < 5 && !pr.x) { const bErr = Engine.canBuild(st, owner.i, s), b = btn(`${['Construir casa', 'Erguer sobrado', 'Erguer mansão', 'Erguer prédio', 'Erguer hotel'][pr.h]} (${brl(cost)})`, () => do_({ type: 'build', sq: s }), 'pri'); if (bErr) { b.disabled = true; b.title = bErr; } acts.append(b); }
        if (pr.h || pr.x) acts.append(btn(`Vender ${pr.x ? 'puxadinho' : Engine.LEVELS[pr.h].toLowerCase()} (+${brl(q.house / 2)})`, () => do_({ type: 'sell', sq: s })));
      }
      if (pr.m) { const b = btn(`Pagar hipoteca (${brl(Engine.liftCost(st, s))})`, () => do_({ type: 'lift', sq: s })); if (Engine.canLift(st, owner.i, s)) b.disabled = true; acts.append(b); } else { const b = btn(`Hipotecar (+${brl(q.price / 2)})`, () => do_({ type: 'mortgage', sq: s })); const e = Engine.canMortgage(st, owner.i, s); if (e) { b.disabled = true; b.title = e; } acts.append(b); }
    }
    acts.append(btn('Fechar', closeDeed, 'ghost'));
  }
  function tradeBox(me) {
    const others = st.players.filter(p => !p.out && p.i !== me); let to = others[0].i;
    const give = new Set(), want = new Set();
    const canPick = s => Engine.groupClear(st, s) && !st.props[s].lien;
    const column = (p, side, set, title) => { const list = Engine.ownedBy(st, p.i), k = side === 'g' ? 'g' : 'w'; return `<div class="tc">${whoCard(p, `${brl(p.cash)} · ${nProps(p.i)}`)}<h3>${title}</h3><div class="pc-grid small">${list.map(s => pcard(s, { sel: set.has(s), attrs: `data-side="${side}"`, off: !canPick(s), price: true })).join('') || '<p class="empty">Nenhuma propriedade</p>'}</div>
      <div class="tc-more"><label class="money-in"><span>R$</span><input id="${k}cash" type="number" min="0" max="${p.cash}" placeholder="0" inputmode="numeric"><span>mil</span></label>${st.rules?.passes ? `<label class="money-in" title="Aluguéis grátis nas propriedades de quem dá"><span>Passes livres</span><input id="${k}pass" type="number" min="0" max="${Engine.PASS_MAX}" placeholder="0" inputmode="numeric"></label>` : ''}${p.cards.length ? `<label class="money-in"><input id="${k}card" type="checkbox"> Habeas corpus</label>` : ''}</div></div>`; };
    const draw = () => {
      const A = st.players[me], B = st.players[to];
      sheet(`<button class="close" data-x>✕</button><h2>Negociar</h2><p class="sub">Com quem você quer negociar? Toque nas cartas e diga quanto entra de dinheiro.</p>
        <div class="t-who">${others.map(o => `<button data-to="${o.i}" style="--c:${o.color}" class="${o.i === to ? 'on' : ''}">${faceHTML(o, 34)}<span>${esc(o.name)}</span></button>`).join('')}</div>
        <div class="t-grid">${column(A, 'g', give, 'Você dá')}<div class="t-sw" aria-hidden="true">⇄</div>${column(B, 'w', want, 'Você recebe')}</div>
        <p class="t-bal" id="tbal"></p><p class="err" id="terr"></p><div class="row-end"><button class="btn" data-x>Cancelar</button><button class="btn pri" id="send">Fazer proposta</button></div>`, box => {
        // soma o preço de tabela de cada lugar com o dinheiro; passes e Habeas corpus não têm preço
        const side = (k, set) => { const cash = +box.querySelector(`#${k}cash`).value || 0, parts = [...[...set].map(s => `${esc(SQ[s].name)} ${brl(SQ[s].price)}`), ...(cash ? [`dinheiro ${brl(cash)}`] : [])]; return { total: [...set].reduce((t, s) => t + SQ[s].price, 0) + cash, txt: parts.join(' + ') || 'nada' }; };
        const bal = () => { const g = side('g', give), w = side('w', want); box.querySelector('#terr').textContent = ''; box.querySelector('#tbal').innerHTML = `<span>Você dá <b>${brl(g.total)}</b>: ${g.txt}</span><span>Você recebe <b>${brl(w.total)}</b>: ${w.txt}</span><small>Soma do preço de tabela e do dinheiro, só para comparar. Passes livres e Habeas corpus não entram.</small>`; };
        box.querySelectorAll('[data-to]').forEach(b => { b.onclick = () => { to = +b.dataset.to; want.clear(); Sound.play('click'); draw(); }; });
        box.querySelectorAll('[data-side]').forEach(b => { b.onclick = () => { const set = b.dataset.side === 'g' ? give : want, s = +b.dataset.s; set.has(s) ? set.delete(s) : set.add(s); b.classList.toggle('sel'); bal(); Sound.play('click'); }; });
        box.querySelectorAll('input[type=number]').forEach(n => { n.oninput = bal; }); bal();
        box.querySelector('#send').onclick = () => {
          const a = { type: 'offer', to, give: { cash: +box.querySelector('#gcash').value || 0, props: [...give], cards: box.querySelector('#gcard')?.checked ? 1 : 0, passes: +box.querySelector('#gpass')?.value || 0 }, want: { cash: +box.querySelector('#wcash').value || 0, props: [...want], cards: box.querySelector('#wcard')?.checked ? 1 : 0, passes: +box.querySelector('#wpass')?.value || 0 } };
          const err = Engine.act(st, me, a); if (err) { box.querySelector('#terr').textContent = err; Sound.play('deny'); return; }
          closeSheet(); clearBar(); pump();
        };
      }).firstElementChild.classList.add('wide');
    };
    draw();
  }
  function showOffer() {
    const o = st.offer, A = st.players[o.from], B = st.players[o.to];
    const list = side => { const extra = [side.cash ? brl(side.cash) : '', side.cards ? 'Habeas corpus' : '', side.passes ? `${side.passes} ${side.passes === 1 ? 'passe livre' : 'passes livres'}` : ''].filter(Boolean).map(t => `<div class="offerline">${t}</div>`).join(''), props = side.props.map(s => pcard(s, { tag: 'div', price: true })).join(''); return `${props ? `<div class="pc-grid small">${props}</div>` : ''}${extra}` || '<p class="empty">Nada</p>'; };
    sheet(`<h2>Proposta</h2><p class="sub">${esc(A.name)} quer negociar. ${esc(B.name)} decide.${o.give.props.some(s => st.props[s].m) ? ' Lugar hipotecado paga 10% de juros ao mudar de dono.' : ''}</p><div class="t-grid"><div class="tc">${whoCard(A, 'Faz a proposta')}<h3>${esc(B.name)} recebe</h3>${list(o.give)}</div><div class="t-sw" aria-hidden="true">⇄</div><div class="tc">${whoCard(B, 'Decide')}<h3>${esc(B.name)} dá</h3>${list(o.want)}</div></div><div class="row-end"><button class="btn" id="no">Recusar</button><button class="btn pri" id="yes" data-primary>Aceitar</button></div>`, box => {
      box.querySelector('#yes').onclick = () => { closeSheet(); act(o.to, { type: 'accept' }); };
      box.querySelector('#no').onclick = () => { closeSheet(); act(o.to, { type: 'reject' }); };
    }).firstElementChild.classList.add('wide');
    document.querySelector('.sheet').onclick = null;
  }
  function finish(w) {
    const p = st.players[w], order = st.players.slice().sort((a, b) => (a.out - b.out) || (a.out ? (b.outTurn ?? 0) - (a.outTurn ?? 0) : Engine.worth(st, b.i) - Engine.worth(st, a.i)));
    closeDeed(); removeAuction(); $('#chip').hidden = true; clearBar(); Sound.play('win'); Stage.cam.orbit = true; Stage.overview();
    let n = 0; const iv = setInterval(() => { Stage.confetti((Math.random() - .5) * 18, 2, (Math.random() - .5) * 18, 60); if (++n > 7) clearInterval(iv); }, 700);
    const T = q => q.t || {}, award = (title, k, f = brl) => { const top = st.players.slice().sort((a, b) => (T(b)[k] || 0) - (T(a)[k] || 0))[0], v = T(top)[k] || 0; return v > 0 ? `<li><small>${title}</small><b>${esc(top.name)}</b><span>${f(v)}</span></li>` : ''; };
    const sign = v => (v > 0 ? '+' : v < 0 ? '−' : '') + brl(Math.abs(v)), row = (l, v) => `<div><small>${l}</small><b>${v}</b></div>`;
    sheet(`<div class="final"><div class="f-hero"><div class="champ"><img alt="" src="${faceOf(p)}"></div><div><small>Dono do Brasil</small><div class="wordmark">${esc(p.name)}</div></div></div>
      <div class="f-sum">${row('Duração', fmtClock(st.ms || 0))}${row('Voltas', st.rounds + 1)}${row('Jogadas', st.turns)}</div>
      <ol class="f-rank">${order.map((q, i) => `<li style="--c:${q.color}"><header><b class="pos">${i + 1}º</b><img alt="" src="${faceOf(q)}"><strong>${esc(q.name)}</strong><span>${q.out ? `faliu na volta ${q.outRound ?? '?'}` : brl(Engine.worth(st, q.i))}</span></header>
        <div class="f-grid">${row('Maior fortuna', brl(Math.max(T(q).peak || 0, q.out ? 0 : Engine.worth(st, q.i))))}${row('Compras', T(q).bought || 0)}${row('Aluguel recebido', brl(T(q).rentIn || 0))}${row('Aluguel pago', brl(T(q).rentOut || 0))}${row('Obras', T(q).built || 0)}${row('Cassino', sign(T(q).casino || 0))}${row('Delegacia', (T(q).jail || 0) + '×')}</div></li>`).join('')}</ol>
      <ul class="f-awards">${award('Maior aluguel', 'maxRent')}${award('Mais obras', 'built', v => v + (v === 1 ? ' obra' : ' obras'))}${award('Sorte no cassino', 'casino', sign)}${award('Martelo de ouro', 'won', v => v + (v === 1 ? ' leilão' : ' leilões'))}${award('Freguês da Delegacia', 'jail', v => v + '×')}</ul>
      <div class="row-end" style="justify-content:center"><button class="btn pri" id="again" data-primary>Nova partida</button></div></div>`, box => { box.querySelector('#again').onclick = () => { saveNow(); location.reload(); }; });
    document.querySelector('.sheet').onclick = null; saveNow();
  }

  const fmtClock = ms => { const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, z = v => String(v).padStart(2, '0'); return `${h ? h + ':' : ''}${z(m)}:${z(s % 60)}`; };
  // só corre com a partida na tela; sai junto no save
  setInterval(() => { if (!st || st.phase === 'over' || $('#hud').hidden || $('#intro') || document.hidden) return; st.ms = (st.ms || 0) + 1000; $('#clock').textContent = fmtClock(st.ms); }, 1000);

  // ---------- laço principal ----------
  const BOT_WAIT = { build: 420, lift: 420, mortgage: 420, sell: 420, offer: 700, roll: 750, buy: 1100, decline: 1000, bid: 420, pass: 420, end: 550, pay: 450, accept: 900, reject: 900, bail: 750, usecard: 750, bankrupt: 1000, pux: 420, repay: 500, sponsor: 1000, nosponsor: 500, bet: 1200, nobet: 500, jailgo: 900, jeitinho: 900, travel: 900, stay: 500, fiado: 800, creditYes: 900, creditNo: 900, creditCounter: 900 };
  // virar a mesa: só festa, não mexe na partida. Um cooldown único vale para a mesa inteira.
  const FLIP_CD = 60000;
  let flipWanted = false, flipReady = 0, flipTimer = 0;
  async function runFlip() {
    flipWanted = false; document.body.classList.add('flipping'); closeDeed();
    await Stage.flipTable({ lift: () => Sound.play('tableLift'), launch: () => Sound.play('tableLaunch'), tiles: () => Sound.play('tableTiles'), slam: () => { Sound.play('tableSlam'); $('#gl').animate([{ filter: 'brightness(1.3)' }, { filter: 'none' }], { duration: 240, easing: 'ease-out' }); }, thud: v => Sound.play('tableThud', v), clink: v => Sound.play('dice', v), restore: () => Sound.play('tableRestore'), settle: () => Sound.play('tableSettle') });
    document.body.classList.remove('flipping');
  }
  function paintFlip() {
    const b = $('#flipbtn'), left = Math.ceil((flipReady - Date.now()) / 1000), wait_ = left > 0;
    b.disabled = wait_ || flipWanted || document.body.classList.contains('flipping') || !st || st.phase === 'over'; b.classList.toggle('cool', wait_); b.style.setProperty('--left', wait_ ? left / (FLIP_CD / 1000) : 0);
    b.querySelector('small').textContent = wait_ ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : '';
    if (!wait_) { clearInterval(flipTimer); flipTimer = 0; }
  }
  $('#flipbtn').onclick = async () => {
    if (!st || st.phase === 'over' || flipWanted || Date.now() < flipReady || document.body.classList.contains('flipping')) return;
    flipReady = Date.now() + FLIP_CD; flipTimer = flipTimer || setInterval(paintFlip, 250);
    const me = st.players[st.turn].bot ? st.players.find(p => !p.bot && !p.out) || st.players[st.turn] : st.players[st.turn];
    banner(`<b>${esc(me.name)}</b> zangou e virou a mesa! 😡`, '#ff9e8a', 2600);
    if (busy) { flipWanted = true; paintFlip(); return; }
    busy = true; clearBar(); flipWanted = true; paintFlip();
    await runFlip(); busy = false; pump();
  };
  async function pump() {
    if (busy) return; busy = true;
    try {
      for (;;) {
        const evs = Engine.drain(st);
        for (const e of evs) { if (flipWanted) await runFlip(); logLine(e.msg); const f = PLAY[e.t]; if (f) await f(e); }
        if (flipWanted) await runFlip();
        if (st.ev.length) continue;
        if (st.phase === 'auction') { await auctionStep(); continue; }
        st.players.forEach(p => setCash(p.i, p.cash)); refreshPlates(); saveNow();
        if (st.phase === 'over') return;
        const who = Engine.actor(st), p = st.players[who];
        if (!p.bot) return;
        const a = Engine.botAction(st, who); await wait(BOT_WAIT[a.type] ?? 300);
        if (flipWanted) await runFlip();
        const err = Engine.act(st, who, a);
        if (err) { console.error('bot', a, err); Engine.act(st, who, { type: st.credit ? 'creditNo' : st.phase === 'sponsor' ? 'nosponsor' : st.phase === 'casino' ? 'nobet' : st.phase === 'blitz' ? 'jailgo' : st.phase === 'travel' ? 'stay' : st.phase === 'debt' ? 'bankrupt' : st.phase === 'auction' ? 'pass' : st.phase === 'buy' ? 'decline' : st.phase === 'roll' ? 'roll' : 'end' }); }
      }
    } finally { busy = false; renderControls(); }
  }

  // ---------- atalhos e botões ----------
  addEventListener('keydown', e => {
    if (e.code !== 'Space' && e.code !== 'Enter') return; if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
    const b = [...document.querySelectorAll('[data-primary]')].reverse().find(x => !x.disabled && x.getClientRects().length); if (b) { e.preventDefault(); b.click(); }
  });
  $('#plates').addEventListener('click', e => { const p = e.target.closest('.plate'); if (p && st) { Sound.play('click'); portfolio(+p.dataset.p); } });
  const paintTools = () => { $('#t-sfx').classList.toggle('mute', !Sound.sfx); };
  $('#t-sfx').onclick = () => { Sound.unlock(); Sound.setSfx(!Sound.sfx); paintTools(); Sound.play('click'); };
  // cor do miolo do tabuleiro
  const MESAKEY = 'pat-mesa4'; let mesa = '#262626'; try { mesa = localStorage.getItem(MESAKEY) || mesa; } catch (e) { /* padrão */ }
  function setMesa(c) { mesa = c; Stage.setFieldColor(c); $('#t-color').value = c; $('#t-paint').style.setProperty('--mesa', c); try { localStorage.setItem(MESAKEY, c); } catch (e) { /* vale só nesta visita */ } }
  $('#t-color').oninput = e => setMesa(e.target.value);
  // painel à direita: aberto, ou só com fotos e dinheiro para sobrar tabuleiro
  const SIDEKEY = 'pat-painel', SIDE_OPEN = 370, SIDE_MIN = 248;
  function setSideMin(on) { document.body.classList.toggle('side-min', on); Stage.setPanel(on ? SIDE_MIN : SIDE_OPEN); $('#t-side').title = on ? 'Abrir o painel' : 'Minimizar o painel'; $('#t-side').setAttribute('aria-label', $('#t-side').title); try { localStorage.setItem(SIDEKEY, on ? '1' : '0'); } catch (e) { /* vale só nesta visita */ } }
  $('#t-side').onclick = () => { setSideMin(!document.body.classList.contains('side-min')); Sound.play('click'); };
  // visão de cima, sem perspectiva, para quem prefere jogar em 2D
  const FLATKEY = 'pat-2d'; let flatOn = false; try { flatOn = localStorage.getItem(FLATKEY) === '1'; } catch (e) { /* padrão: 3D */ }
  const paintFlat = () => { $('#v-2d').textContent = flatOn ? '3D' : '2D'; $('#v-2d').title = flatOn ? 'Voltar para o 3D' : 'Ver em 2D'; };
  $('#v-2d').onclick = () => { flatOn = !flatOn; Stage.setFlat(flatOn); paintFlat(); showSet(!$('#viewset').hidden); Sound.play('click'); try { localStorage.setItem(FLATKEY, flatOn ? '1' : '0'); } catch (e) { /* vale só nesta visita */ } };
  // ajustes da mesa: piso e câmera dinâmica
  const FLOORKEY = 'pat-piso'; let floorKind = 'feltro';
  try { floorKind = localStorage.getItem(FLOORKEY) || floorKind; } catch (e) { /* padrão */ }
  const keep = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* vale só nesta visita */ } };
  const paintFloor = () => document.querySelectorAll('[data-floor]').forEach(b => b.classList.toggle('on', b.dataset.floor === floorKind));
  document.querySelectorAll('[data-floor]').forEach(b => { b.onclick = () => { floorKind = b.dataset.floor; Stage.setFloor(floorKind); paintFloor(); keep(FLOORKEY, floorKind); Sound.play('click'); }; });
  // chave nova: a antiga guardava a câmera de antes desligada
  const DYNKEY = 'pat-camdin'; try { Stage.cam.dyn = localStorage.getItem(DYNKEY) !== '0'; } catch (e) { /* ligada */ }
  const paintDyn = () => document.querySelectorAll('[data-dyn]').forEach(b => b.classList.toggle('on', (b.dataset.dyn === '1') === Stage.cam.dyn));
  document.querySelectorAll('[data-dyn]').forEach(b => { b.onclick = () => { Stage.cam.dyn = b.dataset.dyn === '1'; paintDyn(); keep(DYNKEY, b.dataset.dyn); Sound.play('click'); }; });
  paintDyn();
  const showSet = on => { $('#viewset').hidden = !on; $('#v-set').setAttribute('aria-expanded', on); };
  $('#v-set').onclick = () => { showSet($('#viewset').hidden); Sound.play('click'); };
  $('#gl').addEventListener('pointerdown', () => showSet(false));
  $('#t-log').onclick = () => { $('#log').hidden = !$('#log').hidden; Sound.play('click'); };
  $('#t-view').onclick = () => { Stage.resetView(); if (st) Stage.overview(Stage.tokens[st.turn].at); Sound.play('click'); };
  // ladrilhos: juntos por padrão, separados para quem preferir
  let joined = true; try { joined = localStorage.getItem('pat-juntos2') !== '0'; } catch (e) { /* padrão */ }
  $('#v-join').onclick = () => { joined = !joined; Stage.setJoined(joined); keep('pat-juntos2', joined ? '1' : '0'); $('#v-join').classList.toggle('on', joined); Sound.play('click'); };
  // no celular a barra pode ocupar duas linhas: quem fica acima dela sobe junto
  new ResizeObserver(() => document.body.style.setProperty('--bar', $('#bar').offsetHeight + 'px')).observe($('#bar'));
  addEventListener('pointerdown', () => Sound.unlock(), { once: true });

  // ---------- abre ----------
  (async () => {
    paintTools();
    await Stage.init($('#gl'), v => { $('#barfill').style.width = (v * 100) + '%'; });
    if (joined) { Stage.setJoined(true); $('#v-join').classList.add('on'); } Stage.setFloor(floorKind); paintFloor(); setMesa(mesa); if (flatOn) Stage.setFlat(true); paintFlat(); try { if (localStorage.getItem(SIDEKEY) === '1') setSideMin(true); } catch (e) { /* padrão: aberto */ }
    Stage.bindPointer(s => { if (!st) return; Sound.play('flip'); openDeed(s); }, (s, x, y) => {
      const tip = $('#tip'); if (s === null || s === undefined || !st) { tip.hidden = true; return; }
      const q = SQ[s], pr = st.props[s], owner = pr && pr.owner !== null ? st.players[pr.owner] : null;
      tip.innerHTML = `<b>${esc(q.name)}</b>${q.place ? `<span>${esc(q.place)}</span>` : ''}${q.price ? `<em>${owner ? `de ${esc(owner.name)}` : brl(q.price)}</em>` : ''}${owner ? `<span>${pr.m ? 'Hipotecado' : q.k === 'util' ? 'Aluguel: pelos dados' : 'Aluguel: ' + brl(Engine.rentOf(st, s))}${pr.h ? ' · ' + Engine.LEVELS[pr.h].toLowerCase() : ''}</span>` : ''}`; tip.hidden = false; tip.style.left = Math.min(innerWidth - 230, x + 16) + 'px'; tip.style.top = Math.max(8, y - 12) + 'px';
    });
    Stage.cam.orbit = true; Stage.placeDice(5, 3);
    await Art.ready();
    renderSetup();
    $('#loader').classList.add('off'); setTimeout(() => $('#loader').remove(), 800);
    window.PAT = { get st() { return st; }, Engine, Stage, Sound, pump, act };
  })().catch(err => { console.error(err); $('#loadmsg').textContent = 'Não deu para abrir: ' + err.message; });
})();
