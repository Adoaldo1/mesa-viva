// Última!: a tela do jogo. Recebe o estado da sala, toca os eventos em ordem (com animação e som) e manda as jogadas.
(() => {
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const C = Ultima.CARDS, HEX = { r: '#f2463c', y: '#ffbe1f', g: '#25b456', b: '#2f7ff0' };
  const DEMO = parent === window; // aberto direto (sem sala): partida de teste contra bots
  let send = m => parent.postMessage(m, '*');
  let st = null, ME = -1, seen = 0, queue = [], busy = false, needSnap = false, skew = 0, faces = {}, isHost = false;
  let sending = null, sendTimer = null, vm = null, ended = false;

  const gl0 = document.querySelector('#gl');
  const nowHost = () => Date.now() + skew;
  const nameOf = i => (i === ME ? 'Você' : st.players[i]?.name || '?');
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('on'), 2200); }
  const avatar = (i, big) => { const p = st.players[i], f = faces[p.id]; return f ? `<img src="${esc(f)}" alt="">` : `<b>${esc((p.name || '?').trim()[0]?.toUpperCase() || '?')}</b>`; };

  // ---------- cadeiras (crachás por cima da mesa) ----------
  const RING = 2 * Math.PI * 30;
  function badgeHTML(i) {
    const p = st.players[i];
    return `<div class="av"><svg viewBox="-34 -34 68 68"><circle class="bg" r="30"/><circle class="fg" r="30" pathLength="100"/></svg>${avatar(i)}</div><div class="tag"><span>${esc(i === ME ? 'Você' : p.name)}</span>${i === ME ? '' : '<b class="cnt"></b>'}</div>`;
  }
  function buildSeats() {
    const box = $('#seats'); box.innerHTML = '';
    st.players.forEach((p, i) => {
      if (i === ME) return;
      const d = document.createElement('div'); d.className = 'seat'; d.dataset.i = i; d.style.setProperty('--pc', p.color); d.innerHTML = badgeHTML(i); box.append(d);
    });
    const me = $('#me-badge');
    buildPlates();
    if (ME >= 0) { me.hidden = false; me.dataset.i = ME; me.style.setProperty('--pc', st.players[ME].color); me.innerHTML = badgeHTML(ME); } else me.hidden = true;
  }
  const CN = { r: 'coral', y: 'sol', g: 'folha', b: 'céu', w: '' }, VN = { skip: 'Pula', rev: 'Volta', d2: '+2', wild: 'Coringa', d4: '+4' };
  const cardTxt = (id, col) => { const c = C[id]; return `<i style="--c:${HEX[col || c.c] || '#888'}"></i>${VN[c.v] || c.v} ${c.c === 'w' ? (col ? '(' + CN[col] + ')' : '') : CN[c.c]}`; };
  function log(html) { const b = $('#log'); if (!b) return; const d = document.createElement('div'); d.innerHTML = html; b.append(d); while (b.children.length > 80) b.firstChild.remove(); b.scrollTop = 1e6; }
  const who = i => `<b>${esc(nameOf(i))}</b>`;
  function buildPlates() {
    $('#plates').innerHTML = st.players.map((p, i) => `<div class="plate" data-i="${i}" style="--pc:${p.color}"><div class="tk">${avatar(i)}</div><div class="who"><span>${esc(i === ME ? 'Você' : p.name)}</span>${p.bot ? '<em>BOT</em>' : ''}</div><div class="st"></div><b class="n"></b></div>`).join('');
  }
  function paintPlates() {
    st.players.forEach((p, i) => {
      const el = $(`.plate[data-i="${i}"]`); if (!el) return;
      el.classList.toggle('on', vm.turn === i); el.classList.toggle('off', p.connected === false);
      const n = el.querySelector('.n'), c = vm.counts[i]; if (n.textContent !== String(c)) { n.textContent = c; n.classList.add('bump'); setTimeout(() => n.classList.remove('bump'), 220); } n.classList.toggle('one', c === 1);
      const s2 = el.querySelector('.st'), txt = p.connected === false ? 'desconectado' : st.exposed?.p === i ? 'esqueceu de avisar!' : p.said && c === 1 ? 'disse Última!' : vm.turn === i ? 'jogando…' : c === 1 ? 'uma carta' : '';
      s2.textContent = txt; s2.classList.toggle('hot', c === 1);
    });
  }
  $('#t-side').onclick = $('#t-open').onclick = () => { document.body.classList.toggle('side-min'); Sound.play('click'); };
  $$('#ltabs button').forEach(b => (b.onclick = () => { const chat = b.dataset.lt === 'chat'; document.body.classList.toggle('lt-chat', chat); $$('#ltabs button').forEach(x => x.classList.toggle('on', x === b)); if (chat) { b.classList.remove('dot'); $('#chat .msgs').scrollTop = 1e6; } Sound.play('click'); }));
  $('#b-leave2').onclick = () => $('#b-leave').click();
  setInterval(() => { if (st?.startAt) { const s2 = Math.max(0, Math.floor((nowHost() - st.startAt) / 1000)); $('#clock').textContent = `${Math.floor(s2 / 60)}:${String(s2 % 60).padStart(2, '0')}`; } }, 1000);
  const seatEl = i => (i === ME ? $('#me-badge') : $(`#seats .seat[data-i="${i}"]`));
  function placeSeats() {
    st.players.forEach((p, i) => { if (i === ME) return; const el = seatEl(i), pt = Stage.fanPoint(i); if (el && pt) { el.style.left = pt.x + 'px'; el.style.top = pt.y + 'px'; el.style.setProperty('--av', pt.size + 'px'); } });
    const pp = Stage.pilePoint(), pe = $('#pending'); pe.style.left = pp.x + 'px'; pe.style.top = (pp.y - 70) + 'px';
    document.documentElement.style.setProperty('--act-b', `${Math.round(innerHeight - Stage.handTop() + 14)}px`);
  }
  addEventListener('resize', () => st && requestAnimationFrame(placeSeats));
  if (window.ResizeObserver) new ResizeObserver(() => st && requestAnimationFrame(placeSeats)).observe($('#gl')); // o painel abrindo e fechando muda a mesa sem mudar a janela

  // ---------- o que está na tela agora (anda junto com as animações) ----------
  const fromState = () => ({ counts: st.players.map(p => p.count ?? p.hand.length), turn: st.phase === 'over' ? -1 : st.turn, color: st.color, dir: st.dir });
  function paint() {
    if (!st || !vm) return;
    const idle = !busy, over = st.phase === 'over';
    st.players.forEach((p, i) => {
      const el = seatEl(i); if (!el) return;
      el.classList.toggle('turn', vm.turn === i); el.classList.toggle('off', p.connected === false);
      const cnt = el.querySelector('.cnt'); if (cnt) { const n = vm.counts[i]; if (cnt.textContent !== String(n)) { cnt.textContent = n; cnt.classList.add('bump'); setTimeout(() => cnt.classList.remove('bump'), 220); } cnt.classList.toggle('one', n === 1); }
    });
    // texto do topo
    const mine = !over && st.turn === ME && vm.turn === ME; // a vez já chegou na tela (não espera os efeitos acabarem)
    let txt;
    if (over) txt = st.winner === ME ? 'Você bateu!' : `${nameOf(st.winner)} bateu!`;
    else if (mine) txt = st.phase === 'drawn' ? 'Jogue a que comprou ou passe' : st.pending ? `Devolva ou compre ${st.pending}` : 'Sua vez!';
    else txt = vm.turn === ME ? 'Sua vez!' : vm.turn >= 0 ? `Vez de ${nameOf(vm.turn)}` : 'Embaralhando…';
    $('#st-text').textContent = txt; $('#status').classList.toggle('mine', mine);
    $('#st-dot').style.setProperty('--c', HEX[vm.color] || '#fff'); $('#st-dir').textContent = '↻'; $('#st-dir').classList.toggle('ccw', vm.dir < 0);
    // acúmulo de +2/+4
    const pe = $('#pending'); pe.hidden = !(idle && st.pending); if (pe.hidden) pe.dataset.n = ''; else if (pe.dataset.n !== String(st.pending)) { pe.dataset.n = st.pending; pe.innerHTML = `+${st.pending}<small>acumulado</small>`; pe.style.animation = 'none'; void pe.offsetWidth; pe.style.animation = ''; }
    // mão: o que dá para jogar acende
    const me = st.players[ME], playable = new Set(mine && me ? me.hand.filter(id => Ultima.canPlay(st, id)) : []);
    Stage.setHandState({ myTurn: mine, playable, drawn: mine && st.phase === 'drawn' ? st.drawn : null, sending });
    // botões
    const playing = ME >= 0 && !over;
    const bd = $('#b-draw'); bd.hidden = !(mine && st.phase === 'play'); bd.innerHTML = `<i class="fan"><i></i><i></i><i></i></i>Comprar${st.pending ? `<em>+${st.pending}</em>` : ''}`; bd.classList.toggle('hint', !bd.hidden && !playable.size); // nada serve: o botão chama
    $('#b-keep').hidden = !(mine && st.phase === 'drawn');
    const exposedMe = st.exposed?.p === ME, canCall = playing && me && !me.said && ((mine && me.hand.length === 2) || exposedMe);
    $('#b-call').hidden = !canCall; $('#b-call').classList.toggle('urgent', exposedMe);
    const x = st.exposed, canCatch = playing && x && x.p !== ME && idle;
    const bc = $('#b-catch'); bc.hidden = !canCatch;
    if (canCatch && bc.dataset.p !== String(x.p)) { bc.dataset.p = x.p; bc.style.setProperty('--pc', st.players[x.p].color); bc.innerHTML = `${avatar(x.p)} Pegou ${esc(st.players[x.p].name.split(' ')[0])}!`; }
    if (!canCatch) bc.dataset.p = '';
    paintPlates(); placeSeats();
  }

  // ---------- relógio da vez ----------
  let lastTick = -1;
  function clockLoop() {
    requestAnimationFrame(clockLoop);
    if (!st || !vm) return;
    const left = st.deadline ? st.deadline - nowHost() : 0, total = (st.turnSec || 30) * 1000;
    document.querySelectorAll('.seat').forEach(el => {
      const fg = el.querySelector('.fg'); if (!fg) return;
      const on = +el.dataset.i === vm.turn && !busy && st.deadline && st.phase !== 'over';
      const k = on ? Math.max(0, Math.min(1, left / total)) : 0;
      fg.style.strokeDashoffset = 100 - k * 100; fg.classList.toggle('late', on && left < 5000);
    });
    if (vm.turn === ME && !busy && st.deadline && st.phase !== 'over' && left > 0 && left < 5500) {
      const s = Math.ceil(left / 1000); if (s !== lastTick) { lastTick = s; Sound.play('tick', s <= 3); }
    } else lastTick = -1;
  }

  // ---------- efeitos de texto ----------
  const SKIP_SVG = '<svg viewBox="-12 -12 24 24"><circle r="9" fill="none" stroke="currentColor" stroke-width="4"/><path d="M-6 6L6-6" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></svg>';
  function pointOf(i) { if (i === ME) { return { x: gl0.clientWidth / 2, y: Math.min(innerHeight * 0.62, Stage.handTop() - 30) }; } return Stage.fanPoint(i) || { x: gl0.clientWidth / 2, y: innerHeight / 3 }; }
  function burst(html, pt, cls = '', bc = '') { // bc: cor do selo (sem ela, só o texto)
    const d = document.createElement('div'); d.className = 'burst ' + cls + (bc ? ' seal' : ''); d.innerHTML = bc ? `<i class="rays"></i><span>${html}</span>` : html;
    if (bc) d.style.setProperty('--bc', bc);
    d.style.left = Math.max(60, Math.min(gl0.clientWidth - 60, pt.x)) + 'px'; d.style.top = Math.max(60, pt.y) + 'px';
    $('#fx').append(d); setTimeout(() => d.remove(), cls.includes('win') ? 2700 : 1200);
  }
  function flash(c) { const d = document.createElement('i'); d.className = 'flash'; d.style.setProperty('--c', c); $('#fx').append(d); setTimeout(() => d.remove(), 900); }
  // sorteio de quem começa: um destaque pula de crachá em crachá, cada vez mais devagar, e para em quem começa
  async function raffle(first) {
    const n = st.players.length; if (n < 2 || first < 0) return;
    const box = document.createElement('div'); box.id = 'raffle'; box.innerHTML = '<b>Quem começa?</b><span>…</span>'; $('#fx').append(box);
    const name = box.querySelector('span'); let at = Math.floor(Math.random() * n), prev = null;
    const hops = n * 2 + 3 + (((first - at - (n * 2 + 3)) % n) + n) % n; // termina exatamente em quem começa
    for (let k = 0; k <= hops; k++, at = (at + 1) % n) {
      prev?.classList.remove('pick'); prev = seatEl(at); prev?.classList.add('pick');
      name.textContent = at === ME ? 'Você' : nameOf(at); Sound.play('tick', k > hops - 3);
      await Stage.wait(60 + 300 * Math.pow(k / hops, 2.6));
    }
    box.classList.add('done'); name.textContent = first === ME ? 'Você começa!' : `${nameOf(first)} começa!`; Sound.play('call');
    await Stage.wait(1100); prev?.classList.remove('pick'); box.classList.add('out'); setTimeout(() => box.remove(), 300);
  }
  function ripple(pt, c) { const d = document.createElement('i'); d.className = 'ripple'; d.style.left = pt.x + 'px'; d.style.top = pt.y + 'px'; d.style.setProperty('--c', c); $('#fx').append(d); setTimeout(() => d.remove(), 800); }
  function confetti(n = 90) {
    const cols = Object.values(HEX);
    for (let k = 0; k < n; k++) {
      const d = document.createElement('i'); d.className = 'confetti';
      d.style.left = Math.random() * 100 + 'vw'; d.style.background = cols[k % 4];
      d.style.setProperty('--dx', (Math.random() * 30 - 15) + 'vw'); d.style.setProperty('--rot', (Math.random() * 1440 - 720) + 'deg');
      d.style.animationDuration = 2.2 + Math.random() * 1.8 + 's'; d.style.animationDelay = Math.random() * 0.6 + 's';
      $('#fx').append(d); setTimeout(() => d.remove(), 5000);
    }
  }
  function shake(i) { const el = seatEl(i); if (!el) return; el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); }

  // ---------- eventos, um de cada vez ----------
  async function playEv(e) {
    const W = ms => Stage.wait(ms);
    switch (e.t) {
      case 'deal': log('Cartas distribuídas. Boa partida!'); await Stage.deal(st, ME, e.first); vm.counts = st.players.map(() => 7); vm.color = C[e.top].c; paint(); await raffle(e.first); log(`${who(e.first)} começa`); break;
      case 'play': {
        vm.counts[e.p]--; paint();
        const c = C[e.card];
        if (e.p === ME) { sending = null; clearTimeout(sendTimer); }
        log(`${who(e.p)} jogou ${cardTxt(e.card, e.color)}`);
        await Stage.play(e.p, e.card, e.color, vm.counts[e.p]);
        vm.color = e.color; paint();
        if (c.c === 'w') { Sound.play('wild', e.color); ripple(Stage.pilePoint(), HEX[e.color]); }
        if (c.v === 'd2' || c.v === 'd4') { Sound.play('plus', c.v === 'd4' ? 4 : 2); burst(`${c.v === 'd4' ? '+4' : '+2'}<small>compra!</small>`, Stage.pilePoint(), 'plus big', HEX[e.color]); await W(260); }
        break;
      }
      case 'draw': {
        const n = e.cards.length; if (!n) break;
        if (e.why === 'caught' || e.why === 'stack' || e.why === 'd2' || e.why === 'd4') burst(`+${n}`, pointOf(e.p), 'plus');
        vm.counts[e.p] += n; paint(); log(`${who(e.p)} comprou ${n} carta${n > 1 ? 's' : ''}`);
        await Stage.draw(e.p, e.cards);
        break;
      }
      case 'skip': log(`${who(e.p)} perdeu a vez`); Sound.play('skip'); burst(`${SKIP_SVG}Pula!`, pointOf(e.p), '', HEX[vm.color]); shake(e.p); await W(480); break;
      case 'rev': log('O sentido virou'); vm.dir = e.dir; Stage.setDir(e.dir, true); Sound.play('rev'); burst('⇄ Volta!', Stage.pilePoint(), '', HEX[vm.color]); paint(); await W(560); break;
      case 'call': log(`${who(e.p)} gritou <b>Última!</b>`); Sound.play('call'); burst('Última!', pointOf(e.p), 'call big', '#ffbe1f'); await W(650); break;
      case 'caught': log(`${who(e.by)} pegou ${who(e.p)} sem avisar`); Sound.play('caught'); burst('Pegou!', pointOf(e.by), 'caught big', '#f2463c'); shake(e.p); await W(600); break;
      case 'keep': log(`${who(e.p)} passou`); burst('passou', pointOf(e.p), 'sm'); await W(200); break;
      case 'shuffle': toast('Monte acabou: embaralhando o descarte'); await Stage.reshuffle(e.count); break;
      case 'turn': vm.turn = e.p; Stage.setTurn(e.p, st.players[e.p]?.color); if (e.p === ME && !queue.some(q => q.t === 'turn')) Sound.play('turn'); paint(); await W(90); break;
      case 'win': {
        log(`${who(e.p)} bateu!`); vm.turn = -1; Stage.setTurn(-1); paint();
        const mine = e.p === ME, pc = st.players[e.p].color;
        flash(pc); Sound.play('slam'); Sound.play('fanfare'); Sound.play('applause', mine ? 70 : 30); if (!mine) setTimeout(() => Sound.play('lose'), 1500);
        burst(`${mine ? 'Você' : esc(nameOf(e.p))}<small>bateu!</small>`, Stage.pilePoint(), 'call big win', pc);
        confetti(mine ? 150 : 60); await W(1100); Stage.reveal(st); Sound.play('fan'); await W(1700); showEnd(); break;
      }
    }
  }
  async function pump() {
    if (busy) return; busy = true;
    try {
      for (;;) {
        if (needSnap || document.hidden) { needSnap = false; queue = []; Stage.snap(st, ME); vm = fromState(); buildSeats(); if (st.phase === 'over') showEnd(); break; }
        const e = queue.shift(); if (!e) break;
        Stage.speed = queue.length > 8 ? 3 : queue.length > 4 ? 1.7 : 1;
        await playEv(e);
      }
      Stage.speed = 1; Stage.sync(st, ME); vm = fromState();
    } catch (err) { console.error('animação', err); Stage.snap(st, ME); vm = fromState(); }
    busy = false; paint();
    if (queue.length || needSnap) pump();
  }

  // ---------- jogadas ----------
  function act(a) { send({ t: 'act', a }); }
  function trySend(id, color) {
    Stage.dragHold(); sending = id; Sound.play('select'); paint();
    clearTimeout(sendTimer); sendTimer = setTimeout(() => { sending = null; if (!Stage.dragging) Stage.dragCancel('hand'); paint(); }, 2500); // a jogada não voltou (erro ou rede)
    act({ type: 'play', card: id, ...(color ? { color } : {}) });
  }
  let pickFor = null;
  function tryPlay(id) {
    if (sending !== null) return Stage.dragCancel('hand');
    const no = () => Stage.dragCancel('hand');
    if (st.phase === 'over' || st.turn !== ME || vm.turn !== ME) { no(); Stage.nudge(id); Sound.play('error'); return toast('Espere a sua vez'); }
    if (st.phase === 'drawn' && id !== st.drawn) { no(); Stage.nudge(id); Sound.play('error'); return toast('Só a carta que você comprou (ou passe a vez)'); }
    if (!Ultima.canPlay(st, id)) { no(); Stage.nudge(id); Sound.play('error'); return toast(st.pending ? `Devolva com ${st.pendKind === 'd2' ? '+2 ou +4' : '+4'}, ou compre ${st.pending}` : 'Essa não serve: mesma cor ou mesmo símbolo'); }
    if (C[id].c === 'w') { Stage.dragHold(); pickFor = id; $('#picker').hidden = false; Sound.play('click'); return; }
    trySend(id);
  }
  $('#picker').addEventListener('click', e => {
    const c = e.target.dataset?.c; $('#picker').hidden = true;
    if (c && pickFor !== null) { Sound.play('color', c); trySend(pickFor, c); } else { Sound.play('click'); Stage.dragCancel('hand'); }
    pickFor = null;
  });
  const canDraw = () => sending === null && st.phase === 'play' && st.turn === ME && vm.turn === ME;
  function tryDraw() {
    if (sending !== null || st.phase === 'over' || st.turn !== ME || vm.turn !== ME) return false;
    if (st.phase === 'drawn') { toast('Jogue a carta que comprou ou passe a vez'); return false; }
    Sound.play('click'); act({ type: 'draw' }); return true;
  }
  $('#b-draw').onclick = tryDraw;
  $('#b-keep').onclick = () => { Sound.play('click'); act({ type: 'keep' }); };
  $('#b-call').onclick = () => { act({ type: 'call' }); $('#b-call').hidden = true; };
  $('#b-catch').onclick = () => { act({ type: 'catch' }); $('#b-catch').hidden = true; };
  addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT') return;
    if (e.key === 'Escape' && !$('#picker').hidden) { $('#picker').hidden = true; pickFor = null; Stage.dragCancel('hand'); }
    if ((e.key === 'u' || e.key === 'U') && !$('#b-call').hidden) $('#b-call').click();
    if ((e.key === 'p' || e.key === 'P') && !$('#b-catch').hidden) $('#b-catch').click();
    if ((e.key === 'c' || e.key === 'C') && !$('#b-draw').hidden) tryDraw();
  });

  // mouse e toque: clicar joga; segurar e arrastar leva a carta ao descarte ou puxa uma do monte
  const gl = $('#gl'); let down = null;
  gl.addEventListener('pointerdown', e => {
    if (!st || ME < 0) return;
    if (down?.drag) Stage.dragCancel(); // o soltar anterior se perdeu (fora da janela, menu etc.): a carta volta para a mão
    down = { x: e.clientX, y: e.clientY, h: Stage.pick(e.clientX, e.clientY), drag: false };
    try { gl.setPointerCapture(e.pointerId); } catch {}
  });
  gl.addEventListener('pointermove', e => {
    if (down && e.pointerType === 'mouse' && !(e.buttons & 1)) { if (down.drag) Stage.dragCancel(); down = null; } // o botão já foi solto sem a gente saber
    if (down && !down.drag && down.h && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8 && sending === null && (down.h.card !== undefined || canDraw())) down.drag = Stage.dragStart(down.h);
    if (down?.drag) Stage.dragMove(e.clientX, e.clientY);
    gl.classList.toggle('point', Stage.hover(e.clientX, e.clientY, e.pointerType === 'touch'));
  });
  gl.addEventListener('pointerup', e => {
    const d = down; down = null; if (!d || !st) return;
    if (d.drag) {
      const where = Stage.dragEnd(e.clientX, e.clientY);
      if (d.h.card !== undefined) { if (where === 'table') tryPlay(d.h.card); else Stage.dragCancel('hand'); }
      else if (where === 'hand' && canDraw()) { Stage.dragHold(); tryDraw(); setTimeout(() => Stage.dragCancel('deck'), 2500); }
      else Stage.dragCancel('deck');
      return;
    }
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 14) return;
    if (d.h?.card !== undefined) tryPlay(d.h.card); else if (d.h?.deck) tryDraw();
  });
  gl.addEventListener('pointercancel', () => { if (down?.drag) Stage.dragCancel(); down = null; });
  gl.addEventListener('pointerleave', () => Stage.hover(-1, -1, false));

  // ---------- topo, conversa, fim ----------
  $('#status').onclick = () => { if (st?.phase === 'over' && ended) $('#end').hidden = false; };
  $('#b-leave').onclick = () => { Sound.play('click'); send({ t: 'leave' }); };
  $('#b-sound').onclick = () => { const on = Sound.toggle(); $('#b-sound').classList.toggle('off', !on); Sound.play('click'); };
  $('#b-sound').classList.toggle('off', !Sound.on);
  $('#b-chat').onclick = () => { const c = $('#chat'); c.hidden = !c.hidden; $('#b-chat').classList.remove('dot'); Sound.play('click'); if (!c.hidden) { c.querySelector('.msgs').scrollTop = 1e6; c.querySelector('input').focus(); } };
  $('#chat form').onsubmit = e => { e.preventDefault(); const i = e.target.querySelector('input'); if (i.value.trim()) send({ t: 'chat', text: i.value }); i.value = ''; };
  let chatN = null;
  function paintChat(list = []) {
    const n = list.length ? JSON.stringify(list[list.length - 1]) + list.length : '';
    if (n === chatN) return; const fresh = chatN !== null; chatN = n;
    const box = $('#chat .msgs'); box.innerHTML = list.map(c => `<div class="${c.who ? '' : 'sys'}">${c.who ? `<b style="color:${/^#[0-9a-f]{6}$/i.test(c.color || '') ? c.color : '#ffd34d'}">${esc(c.who)}:</b> ` : ''}${esc(c.text)}</div>`).join(''); box.scrollTop = 1e6;
    if (fresh && list[list.length - 1]?.who && !document.body.classList.contains('lt-chat')) $('#ltabs [data-lt=chat]').classList.add('dot');
    if (fresh && $('#chat').hidden && list[list.length - 1]?.who) { $('#b-chat').classList.add('dot'); Sound.play('chat'); }
  }
  function showEnd() {
    if (ended || !st.result) return; ended = true;
    const w = st.winner, rank = st.result.ranking, idx = id => st.players.findIndex(p => p.id === id);
    const sts = st.stats || [], R = st.result, dur = Math.max(0, Math.round((R.ms || 0) / 1000));
    const label = id => { const v = C[id].v; return /^\d$/.test(v) ? v : { skip: '⊘', rev: '⇄', d2: '+2', wild: '★', d4: '+4' }[v]; };
    const minis = p => { const h = p.hand || []; return h.slice(0, 9).map(id => `<b style="--c:${HEX[C[id].c] || '#1b1a22'}">${label(id)}</b>`).join('') + (h.length > 9 ? `<em>+${h.length - 9}</em>` : ''); };
    const nm = i => (i === ME ? 'Você' : esc(st.players[i].name.split(' ')[0]));
    // destaques: quem mais fez cada coisa (só aparece se alguém fez)
    const top = k => { let b = -1; sts.forEach((x, i) => { if (x[k] > 0 && (b < 0 || x[k] > sts[b][k])) b = i; }); return b; };
    const tiles = [['plus', '💥', 'Mais +2/+4', n => `${n} jogado${n > 1 ? 's' : ''}`], ['drawn', '🃏', 'Comprou mais', n => `${n} carta${n > 1 ? 's' : ''}`], ['caught', '🫵', 'Pegou mais', n => `${n} vez${n > 1 ? 'es' : ''}`], ['wild', '🌈', 'Mais coringas', n => `${n}`], ['called', '📣', 'Gritou Última!', n => `${n} vez${n > 1 ? 'es' : ''}`]]
      .map(([k, ic, t, f]) => { const i = top(k); return i < 0 ? '' : `<div class="tile" style="--pc:${st.players[i].color}"><span>${ic}</span><small>${t}</small><b>${nm(i)}</b><em>${f(sts[i][k])}</em></div>`; }).join('');
    $('#end .card').innerHTML = `
      <div class="crown" style="--pc:${st.players[w].color}"><i class="rays"></i>${avatar(w)}</div>
      <h2>${w === ME ? 'Você bateu!' : `${esc(st.players[w].name)} bateu!`}</h2>
      <p class="meta">${dur ? `⏱ ${Math.floor(dur / 60)}:${String(dur % 60).padStart(2, '0')}` : ''}${R.turns ? ` · ${R.turns} vezes` : ''}${sts[w] ? ` · ${sts[w].played} carta${sts[w].played === 1 ? '' : 's'} jogada${sts[w].played === 1 ? '' : 's'}` : ''}</p>
      <ol>${rank.map((r, k) => { const i = idx(r.id), p = st.players[i]; return `<li style="--pc:${p.color};animation-delay:${0.2 + k * 0.08}s"><i class="pos">${k ? k + 1 : '👑'}</i><div class="who"><span>${nm(i)}</span><div class="minis">${k ? minis(p) : '<small>mão vazia</small>'}</div></div><strong>${k ? `${r.pts}<small>pts</small>` : '🏆'}</strong></li>`; }).join('')}</ol>
      ${tiles ? `<div class="tiles">${tiles}</div>` : ''}
      <div class="btns">${isHost ? '<button id="e-lobby">Voltar à sala</button>' : '<p>Esperando o anfitrião voltar à sala…</p>'}<button class="alt" id="e-close">Ver a mesa</button></div>`;
    $('#end').hidden = false;
    $('#e-lobby')?.addEventListener('click', () => send({ t: 'lobby' }));
    $('#e-close').onclick = () => { $('#end').hidden = true; };
  }

  // ---------- estado vindo da sala ----------
  function onRoom(m) {
    const first = !st;
    st = m.state; skew = m.skew || 0; faces = m.faces || {}; isHost = !!m.host;
    const mine = st.players.findIndex(p => p.id === m.me), lastN = st.log.length ? st.log[st.log.length - 1].n : 0;
    paintChat(m.chat);
    if (first || mine !== ME) {
      ME = mine; Stage.setSeats(st.players.length, ME); buildSeats(); placeSeats();
      $('#loader').classList.add('out'); $('#hud').hidden = false;
      // partida começando agora: mostra a distribuição; senão, monta a mesa como está
      if (st.log.length === 1 && st.log[0].t === 'deal' && nowHost() - st.startAt < 4000) { queue = [...st.log]; vm = { counts: st.players.map(() => 0), turn: -1, color: st.color, dir: 1 }; }
      else needSnap = true;
      seen = lastN; return void pump();
    }
    if (st.log.length && st.log[0].n > seen + 1) needSnap = true; else queue.push(...st.log.filter(e => e.n > seen));
    seen = lastN;
    if (sending !== null && !st.players[ME]?.hand.includes(sending)) { /* a carta saiu: o evento cuida */ } else if (sending !== null && !queue.some(e => e.t === 'play' && e.p === ME)) { sending = null; clearTimeout(sendTimer); if (!Stage.dragging) Stage.dragCancel('hand'); } // não entrou: a carta que esperava volta para a mão
    if (!busy) paint();
    pump();
  }
  addEventListener('message', e => { if (e.source === parent && e.data?.t === 'room' && Stage.ok && !DEMO) onRoom(e.data); });

  // ---------- partida de teste (abrindo o arquivo direto) ----------
  function demo() {
    const n = Math.max(2, Math.min(10, +new URLSearchParams(location.search).get('demo') || 4));
    const names = ['Você', 'Lia', 'Caio', 'Bia', 'Duda', 'Téo', 'Nina', 'Rafa', 'Gabi', 'Juca'];
    const room = { settings: { ulTurn: 30 }, players: names.slice(0, n).map((name, i) => ({ id: i ? 'bot' + i : 'eu', name, bot: !!i })) };
    let S = Ultima.newGame(room), timer = null, clock = null;
    const push = () => onRoom({ t: 'room', me: 'eu', host: true, skew: 0, state: JSON.parse(JSON.stringify(Ultima.viewFor(S, 'eu'))), faces: {}, chat: [] });
    function schedule() {
      clearTimeout(timer); clearTimeout(clock); if (S.phase === 'over') return;
      if (S.deadline) clock = setTimeout(() => { if (Ultima.timeout(S)) { push(); schedule(); } }, Math.max(100, S.deadline - Date.now()));
      for (const id of [S.players[S.turn].id, ...S.players.map(p => p.id)]) {
        if (id === 'eu') continue;
        const a = Ultima.botAction(S, id); if (!a) continue;
        timer = setTimeout(() => { if (Ultima.act(S, id, a) === null) push(); schedule(); }, Ultima.botDelay(a, S));
        return;
      }
    }
    send = m => {
      if (m.t === 'act') { const err = Ultima.act(S, 'eu', m.a); if (err) toast(err); push(); schedule(); }
      else if (m.t === 'lobby' || m.t === 'leave') location.reload();
    };
    window.ulDemo = { get st() { return S; }, push, schedule }; // para testar à mão pelo console
    push(); schedule();
  }

  // a fonte precisa estar carregada antes de desenhar as cartas
  Promise.all([document.fonts.load('400 100px "Lilita One"').catch(() => {}), document.fonts.load('italic 800 100px Rubik').catch(() => {}), Art.load()]).then(() => Stage.init($('#gl'))).then(() => {
    // cor da mesa (como o piso do Patrimônio): fica salva neste aparelho
    const FK = 'ultima-feltro'; let fk = 'preto'; try { fk = localStorage.getItem(FK) || fk; } catch {}
    const paintFelts = () => $$('#felts button').forEach(b => b.classList.toggle('on', b.dataset.f === fk));
    $('#felts').innerHTML = '<span>Mesa</span>' + Object.entries(Stage.FELTS).map(([k, f]) => `<button data-f="${k}" title="${f.name}" aria-label="Mesa ${f.name}" style="--fc:${f.mid}"></button>`).join('');
    $$('#felts button').forEach(b => { b.onclick = () => { fk = b.dataset.f; Stage.setFelt(fk); paintFelts(); try { localStorage.setItem(FK, fk); } catch {} }; });
    Stage.setFelt(fk); paintFelts();
    if (DEMO) demo(); else send({ t: 'ready' });
    clockLoop();
  }).catch(err => { console.error('Última', err); toast('Não deu para abrir a mesa 3D neste aparelho'); });
})();
