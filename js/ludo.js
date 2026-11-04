// ===== Ludo: motor de regras (roda somente no anfitrião) + tela =====
// Regras: tirar 6 para sair da base; 6 joga de novo (três 6 seguidos perde a vez);
// capturar ou chegar ao centro também dá outra jogada; casas de saída e estrelas são seguras; 2+ peças da mesma cor juntas não são capturadas;
// precisa do número exato para entrar no centro. Vence quem levar as 4 peças primeiro.
const Ludo = (() => {
  const HOME = 56; // 0..50 pista (relativo à saída), 51..55 corredor, 56 = centro, -1 = base
  const SAFE = new Set([0, 8, 13, 21, 26, 34, 39, 47]); // posições absolutas na pista de 52
  const SEATS = [{ name: 'Vermelho', color: '#e5383b' }, { name: 'Verde', color: '#2fa35b' }, { name: 'Amarelo', color: '#f3b733' }, { name: 'Azul', color: '#2f6db5' }];
  const abs = (seat, r) => (r + 13 * seat) % 52;
  let nameOf = id => id;
  function log(st, msg) { st.log.push({ t: Date.now(), msg }); if (st.log.length > 150) st.log.shift(); }

  const INTRO_MS = 4300; // abertura: apresenta os jogadores e conta 3-2-1
  const TURN_MS = 15000; // tempo para rolar ou escolher a peça; depois disso joga sozinho
  // prazo da próxima ação = animação que ainda vai rodar nas telas + tempo da vez
  const arm = (st, anim) => { st.deadline = Date.now() + anim + TURN_MS; };
  function newGame(room) {
    const seats = room.players.length === 2 ? [0, 2] : [0, 1, 2, 3];
    const st = {
      kind: 'ludo', gameId: 'l' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      players: room.players.map((p, i) => ({ id: p.id, seat: seats[i], pieces: [-1, -1, -1, -1] })),
      turn: 0, dice: null, rolled: false, sixes: 0, ev: { n: 0 }, log: [], result: null, startAt: Date.now() + INTRO_MS,
    };
    st.deadline = st.startAt + TURN_MS;
    log(st, `🎲 A partida de Ludo começou! ${nameOf(st.players[0].id)} começa.`);
    return st;
  }

  const canMove = (pc, d) => pc === -1 ? d === 6 : pc !== HOME && pc + d <= HOME;
  const movable = (p, d) => [0, 1, 2, 3].filter(k => canMove(p.pieces[k], d));
  const target = (pc, d) => pc === -1 ? 0 : pc + d;
  // peças adversárias que seriam capturadas ao parar em `to`
  function victims(st, p, to) {
    if (to > 50 || SAFE.has(abs(p.seat, to))) return [];
    const a = abs(p.seat, to), out = [];
    // 2+ peças da mesma cor juntas formam um grupo protegido: quem chega só divide a casa
    for (const o of st.players) {
      if (o === p) continue;
      const here = [0, 1, 2, 3].filter(k => { const pc = o.pieces[k]; return pc >= 0 && pc <= 50 && abs(o.seat, pc) === a; });
      if (here.length === 1) out.push([o, here[0]]);
    }
    return out;
  }
  function nextTurn(st) { st.turn = (st.turn + 1) % st.players.length; st.rolled = false; st.sixes = 0; }

  function act(st, pid, a) {
    if (st.result) return 'A partida acabou.';
    const p = st.players[st.turn];
    if (p.id !== pid) return 'Não é sua vez.';
    if (st.startAt && Date.now() < st.startAt - 300) return 'Espere a contagem!';
    if (a?.auto) log(st, `⏰ ${nameOf(pid)} demorou — jogada automática.`);
    if (a?.type === 'roll') {
      if (st.rolled) return 'Você já rolou o dado.';
      const d = 1 + Math.floor(Math.random() * 6);
      st.dice = d; st.rolled = true; st.sixes = d === 6 ? st.sixes + 1 : 0;
      st.ev = { n: st.ev.n + 1, type: 'roll', seat: p.seat, combo: st.sixes };
      log(st, `🎲 ${nameOf(pid)} tirou ${d}`);
      if (st.sixes === 3) { log(st, '   Três 6 seguidos — perdeu a vez!'); nextTurn(st); }
      else if (!movable(p, d).length) {
        log(st, '   Nenhuma peça pode andar.');
        if (d === 6) st.rolled = false; else nextTurn(st);
      }
      arm(st, 1900);
      return null;
    }
    if (a?.type === 'move') {
      if (!st.rolled) return 'Role o dado primeiro.';
      const k = a.k;
      if (![0, 1, 2, 3].includes(k) || !canMove(p.pieces[k], st.dice)) return 'Essa peça não pode andar.';
      const from = p.pieces[k], to = target(from, st.dice), hit = victims(st, p, to);
      p.pieces[k] = to;
      let again = st.dice === 6;
      hit.forEach(([o, j]) => { o.pieces[j] = -1; });
      if (hit.length) { again = true; log(st, `💥 ${nameOf(pid)} capturou ${hit.map(([o]) => nameOf(o.id)).join(', ')}!`); }
      if (to === HOME) { again = true; log(st, `🏁 ${nameOf(pid)} levou uma peça ao centro (${p.pieces.filter(x => x === HOME).length}/4).`); }
      st.ev = { n: st.ev.n + 1, type: hit.length ? 'capture' : to === HOME ? 'home' : 'move' };
      if (p.pieces.every(x => x === HOME)) {
        const score = q => q.pieces.reduce((s, x) => s + x + 1, 0);
        // worth 0: o ranking da Mesa guarda o "melhor patrimônio" do Magnata; Ludo não mexe nisso
        const ranking = [...st.players].sort((x, y) => score(y) - score(x)).map(q => ({ id: q.id, home: q.pieces.filter(x => x === HOME).length, worth: 0 }));
        st.result = { winner: pid, ranking };
        log(st, `🏆 ${nameOf(pid)} venceu!`); st.deadline = null;
        return null;
      }
      if (again) st.rolled = false; else nextTurn(st);
      arm(st, Math.max(1, to - from) * 220 + (hit.length ? 2200 : 500));
      return null;
    }
    return 'Ação inválida.';
  }

  function botAction(st, pid) {
    if (st.result || st.players[st.turn].id !== pid) return null;
    if (!st.rolled) return { type: 'roll' };
    const p = st.players[st.turn], opts = movable(p, st.dice);
    if (!opts.length) return null;
    const score = k => {
      const from = p.pieces[k], to = target(from, st.dice);
      return victims(st, p, to).length * 100 + (to === HOME) * 80 + (from === -1) * 60 + (to > 50 || SAFE.has(abs(p.seat, to))) * 20 + to / 10;
    };
    return { type: 'move', k: opts.sort((a, b) => score(b) - score(a))[0] };
  }

  // espera do bot antes de agir: dado 3D (~1,5 s) antes de mover; peão andando antes de rolar de novo
  const botDelay = (a, st) => (a.type === 'move' ? 2000 : 1800) + Math.max(0, (st?.startAt || 0) - Date.now());

  const wouldCapture = (st, p, k) => victims(st, p, target(p.pieces[k], st.dice)).length > 0;
  return { newGame, act, botAction, botDelay, movable, wouldCapture, TURN_MS, SEATS, SAFE, HOME, setNameResolver: f => (nameOf = f) };
})();

// ===== Ludo: tela =====
const LudoUI = (() => {
  // pista de 52 casas no grid 15×15, a partir da saída do Vermelho, sentido horário
  const seg = (r, c, dr, dc, n) => Array.from({ length: n }, (_, i) => [r + dr * i, c + dc * i]);
  const TRACK = [...seg(6, 1, 0, 1, 5), ...seg(5, 6, -1, 0, 6), [0, 7], ...seg(0, 8, 1, 0, 6), ...seg(6, 9, 0, 1, 6), [7, 14],
    ...seg(8, 14, 0, -1, 6), ...seg(9, 8, 1, 0, 6), [14, 7], ...seg(14, 6, -1, 0, 6), ...seg(8, 5, 0, -1, 6), [7, 0], [6, 0]];
  console.assert(TRACK.length === 52, 'Ludo: pista deveria ter 52 casas');
  const LANE = [seg(7, 1, 0, 1, 5), seg(1, 7, 1, 0, 5), seg(7, 13, 0, -1, 5), seg(13, 7, -1, 0, 5)];
  const BASE = [[0, 0], [0, 9], [9, 9], [9, 0]];
  const GOAL = [[7.5, 6.55], [6.55, 7.5], [7.5, 8.45], [8.45, 7.5]]; // centro (coordenadas contínuas)

  // posição (linha, coluna) contínua do centro da peça
  function spot(seat, pc, k) {
    if (pc === -1) { const [r, c] = BASE[seat]; return [r + 2 + 2 * (k >> 1), c + 2 + 2 * (k & 1)]; }
    if (pc === Ludo.HOME) return GOAL[seat];
    const [r, c] = pc <= 50 ? TRACK[(pc + 13 * seat) % 52] : LANE[seat][pc - 51];
    return [r + .5, c + .5];
  }

  // caminho casa a casa de `from` até `to` (lista de pontos, incluindo a origem)
  function path(seat, from, to, k) {
    if (to === -1 || from === -1) return [spot(seat, from, k), spot(seat, to, k)];
    return Array.from({ length: to - from + 1 }, (_, i) => spot(seat, from + i, k));
  }

  const STEP = 220; // ms por casa
  let gl = false, built = null, seenEmote = 0, seenEv = 0, wasMyTurn = false, logTab = 'log', resultShown = null, tilt = 48, spin = 0;
  const cam = () => { const b = $('#ludo-board'); b.style.setProperty('--tilt', tilt + 'deg'); b.style.setProperty('--spin', spin + 'deg'); };

  // abertura: fundo próprio animado, título, cartões voando dos lados, VS, contagem 3-2-1 e "JÁ!" abrindo como um círculo
  function intro(st, rp) {
    const left = (st.startAt || 0) - Room.now(); if (left < 1200) return;
    const el = document.createElement('div'); el.className = 'ludo-intro';
    const cards = st.players.map((p, i) => {
      const pl = rp(p.id), hat = LUDO_HATS.find(h => h.id === pl.hat), from = i % 2 ? 1 : -1;
      return `<div class="li-card" style="--c:${Ludo.SEATS[p.seat].color};--rot:${from * 18}deg;animation-delay:${.3 + i * .22}s">
        <div class="li-av"><img src="${charById(pl.char).img}" alt="">${hat && hat.id !== 'none' ? `<span class="li-hat">${hat.icon}</span>` : ''}</div>
        <b>${esc(pl.name)}</b><small>${Ludo.SEATS[p.seat].name}</small></div>`;
    });
    el.innerHTML = `<div class="li-rays"></div><h1 class="li-title">LUDO</h1>
      <div class="li-cards">${cards.join(`<span class="li-vs">VS</span>`)}</div><div class="li-count"><span></span></div>`;
    $('#scr-game').appendChild(el);
    if (gl) Ludo3D.hold(left);
    const n = $('.li-count span', el), go = Math.max(1300, left - 2500);
    ['3', '2', '1', 'JÁ!'].forEach((t, i) => setTimeout(() => {
      n.textContent = t; n.parentNode.style.setProperty('--c', Ludo.SEATS[st.players[i % st.players.length].seat].color);
      n.parentNode.classList.remove('pop'); void n.offsetWidth; n.parentNode.classList.add('pop', ...(i === 3 ? ['go'] : []));
      if (gl) Ludo3D.cue(3 - i); else SFX.click();
    }, go + i * 650));
    setTimeout(() => el.classList.add('out'), go + 2350);
    setTimeout(() => el.remove(), go + 2900);
  }

  let lastDie = 6;
  function build(st) {
    let el = $('#ludo-board');
    if (!el) { el = document.createElement('div'); el.id = 'ludo-board'; $('#board-wrap').appendChild(el); }
    const cell = (r, c, cls = '', style = '', html = '') => `<div class="lc ${cls}" style="grid-row:${r + 1};grid-column:${c + 1};${style}">${html}</div>`;
    const S = Ludo.SEATS;
    el.innerHTML = '<div class="l3d">' + BASE.map(([r, c], s) => `<div class="lbase" style="grid-row:${r + 1}/span 6;grid-column:${c + 1}/span 6;--c:${S[s].color}"><div></div></div>`).join('')
      + TRACK.map(([r, c], i) => {
        const startOf = i % 13 === 0 ? i / 13 : -1;
        return cell(r, c, Ludo.SAFE.has(i) ? 'safe' : '', startOf >= 0 ? `background:${S[startOf].color}` : '', Ludo.SAFE.has(i) && startOf < 0 ? '★' : '');
      }).join('')
      + LANE.map((l, s) => l.map(([r, c]) => cell(r, c, '', `background:${S[s].color}`)).join('')).join('')
      + `<div class="lgoal" style="--c0:${S[0].color};--c1:${S[1].color};--c2:${S[2].color};--c3:${S[3].color}"></div>
        <i class="lside s-t"></i><i class="lside s-r"></i><i class="lside s-b"></i><i class="lside s-l"></i><div id="ludo-pieces"></div></div>`;
    $('#ludo-pieces').onclick = e => {
      const b = e.target.closest('.lpiece.can'); if (b) Room.send({ t: 'act', a: { type: 'move', k: +b.dataset.k } });
    };
    // câmera: começa com a sua base virada para você; arrastar gira/inclina, duplo clique volta
    const mine = st.players.find(p => p.id === Room.myId);
    const home = () => { tilt = 48; spin = mine ? (3 - mine.seat) * 90 : 0; cam(); };
    home();
    el.ondblclick = home;
    el.onpointerdown = e => {
      if (e.target.closest('.lpiece.can')) return;
      const x0 = e.clientX, y0 = e.clientY, s0 = spin, t0 = tilt;
      el.onpointermove = m => { spin = s0 + (m.clientX - x0) * .4; tilt = Math.max(0, Math.min(70, t0 - (m.clientY - y0) * .25)); cam(); };
      el.onpointerup = el.onpointerleave = () => (el.onpointermove = null);
    };
    // 3D de verdade (Three.js) quando há WebGL; o tabuleiro CSS acima fica de reserva
    gl = Ludo3D.supported();
    $('#board-wrap').classList.toggle('ludo-gl-on', gl);
    if (gl) {
      Ludo3D.mount($('#board-wrap'), {
        onPiece: k => Room.send({ t: 'act', a: { type: 'move', k } }),
        onDice: () => Room.send({ t: 'act', a: { type: 'roll' } }),
        // visão 2D: o dado vira a bandeja 2D do painel (a mesma do modo sem WebGL)
        onFlat: on => { const S = $('#game-side'); S.classList.toggle('ludo-flat', on); const t = $('.ldice', S); if (on && t) requestAnimationFrame(() => Anim.restDice(t, [lastDie, lastDie])); },
        flatRoll: v => { const t = $('#game-side .ldice'); lastDie = v; return t ? Anim.rollDice(t, [v, v]) : Promise.resolve(); },
      });
      Ludo3D.reset(mine?.seat);
    }
  }

  function render(room) {
    const st = room.state; if (!st) return;
    UI.show('scr-game');
    const isNew = built !== st.gameId; if (isNew) { build(st); built = st.gameId; seenEv = st.ev.n; }
    const rp = id => room.players.find(p => p.id === id) || { name: id, char: 'vitoria' };
    if (isNew) { intro(st, rp); seenEmote = room.emote?.n || 0; if (gl) Ludo3D.setScene(room.settings?.scene); }
    // reação rápida de alguém: emoji sobe da base da cor dele
    if (room.emote && room.emote.n !== seenEmote) {
      seenEmote = room.emote.n; const who = st.players.find(p => p.id === room.emote.pid);
      if (who && gl) Ludo3D.emote(who.seat, room.emote.e); else if (who) UI.toast(`${rp(who.id).name}: ${room.emote.e}`);
    }
    const cur = st.players[st.turn], myTurn = cur.id === Room.myId && !st.result;
    const canPick = myTurn && st.rolled ? Ludo.movable(cur, st.dice) : [];
    const fresh = st.ev.n !== seenEv; seenEv = st.ev.n;
    if (myTurn && !wasMyTurn) SFX.turnMine();
    wasMyTurn = myTurn;

    // peças: o mesmo elemento entre renders; quando a posição muda, anda casa por casa pulando
    const layer = $('#ludo-pieces'), stack = {}, want = new Set(), moves = [], pieces = [], total = {};
    const keyOf = (p, pc, k) => pc === -1 ? p.seat + ':' + k : spot(p.seat, pc, k).join(',');
    for (const p of st.players) p.pieces.forEach((pc, k) => { const key = keyOf(p, pc, k); total[key] = (total[key] || 0) + 1; });
    const SLOT = [[-.21, -.21], [-.21, .21], [.21, -.21], [.21, .21]];
    for (const p of st.players) p.pieces.forEach((pc, k) => {
      const id = `lp-${p.seat}-${k}`; want.add(id);
      let el = document.getElementById(id);
      if (!el) {
        el = document.createElement('button'); el.id = id; el.className = 'lpiece'; el.dataset.k = k; el._pc = pc;
        el.innerHTML = `<i class="lshadow"></i><span class="lhop"><span class="lpawn"><img src="${charById(rp(p.id).char).img}" alt="" onerror="this.remove()"></span></span>`;
        layer.appendChild(el);
      }
      if (el._pc !== pc && !document.hidden) moves.push({ el, pts: path(p.seat, el._pc, pc, k), back: pc === -1 });
      el._pc = pc;
      const key = keyOf(p, pc, k), n = stack[key] = (stack[key] || 0) + 1, many = total[key] > 1, [oy, ox] = many ? SLOT[(n - 1) % 4] : [0, 0];
      const [y, x] = spot(p.seat, pc, k).map((v, i) => v + (i ? ox : oy)), scale = many ? .6 : 1;
      el.style.cssText = `--c:${Ludo.SEATS[p.seat].color};top:${(y / 15) * 100}%;left:${(x / 15) * 100}%;scale:${scale}`;
      el.title = `${rp(p.id).name} — peça ${k + 1}`;
      el.classList.toggle('can', p === cur && canPick.includes(k));
      const can = p === cur && canPick.includes(k);
      pieces.push({ id, seat: p.seat, hat: rp(p.id).hat, img: charById(rp(p.id).char).img, k, y, x, scale, can, cap: can && Ludo.wouldCapture(st, p, k), route: can ? path(p.seat, pc, pc === -1 ? 0 : pc + st.dice, k) : null });
    });
    $$('.lpiece', layer).forEach(el => want.has(el.id) || el.remove());
    // peça capturada volta para a base depois que a atacante termina de andar
    const walkMs = Math.max(0, ...moves.filter(m => !m.back).map(m => (m.pts.length - 1) * STEP));
    if (gl) { Ludo3D.show(true); Ludo3D.sync(pieces, moves.map(m => ({ id: m.el.id, pts: m.pts, back: m.back }))); }
    for (const { el, pts, back } of moves) {
      const n = pts.length - 1, dur = back ? 600 : n * STEP, delay = back ? walkMs : 0, opt = { duration: dur, delay, fill: 'backwards' };
      const kf = pts.map(([y, x]) => ({ top: (y / 15) * 100 + '%', left: (x / 15) * 100 + '%' }));
      kf[n] = { top: el.style.top, left: el.style.left };
      el.getAnimations().forEach(a => a.cancel());
      el.animate(kf, opt);
      $('.lhop', el).animate(Array.from({ length: 2 * n + 1 }, (_, i) => ({ transform: `translateZ(${i % 2 ? (back ? 9 : 3) : 0}cqw)` })), { ...opt, easing: 'ease-in-out' });
      if (!back && !gl) for (let i = 1; i <= n; i++) setTimeout(SFX.step, i * STEP - 30); // no 3D o som de passo é do ludo3d.js
    }
    if (fresh && st.ev.type === 'capture' && !gl) setTimeout(SFX.jail, walkMs); // no 3D a captura tem som próprio
    if (fresh && st.ev.type === 'home') setTimeout(SFX.coinUp, walkMs);

    renderSide(room, st, rp, myTurn, canPick, fresh);

    if (st.result && resultShown !== st.gameId) {
      resultShown = st.gameId; UI.recordResult(st, room);
      if (gl) setTimeout(() => Ludo3D.podium(st.result.ranking.slice(0, 3).map(r => { const p = st.players.find(q => q.id === r.id), pl = rp(r.id); return { seat: p.seat, hat: pl.hat, img: charById(pl.char).img }; })), 700 + walkMs);
      setTimeout(() => showResult(room, st, rp), (gl ? 6000 : 600) + walkMs);
    }
  }

  function renderSide(room, st, rp, myTurn, canPick, fresh) {
    const S = $('#game-side');
    // o dado 3D fica fora da parte redesenhada, para a animação não ser interrompida
    if (!$('#ludo-side', S)) {
      S.innerHTML = '<div class="card ldie-card"><div class="dice-tray ldice" title="Rolar dado"></div></div><div id="ludo-side"></div>';
      Anim.restDice($('.ldice', S), [6, 6]);
      $('.ldice', S).onclick = () => $('.ldice.can-roll') && Room.send({ t: 'act', a: { type: 'roll' } });
    }
    const tray = $('.ldice', S), B = $('#ludo-side', S);
    S.classList.toggle('ludo-gl-on', gl);
    const dieOf = seat => { const p = st.players.find(q => q.seat === seat); return LUDO_DICE.find(d => d.id === (p && rp(p.id).dice)) || LUDO_DICE[0]; };
    if (fresh && st.ev.type === 'roll') {
      if (gl) Ludo3D.rollDice(st.dice, Ludo.SEATS[st.ev.seat].color, st.ev.combo, dieOf(st.ev.seat));
      else { Anim.rollDice(tray, [st.dice, st.dice]); if (st.ev.combo === 3) setTimeout(() => UI.toast('Três 6 seguidos — perdeu a vez!', 'err'), 1200); }
    }
    tray.classList.toggle('can-roll', myTurn && !st.rolled);
    if (st.dice) lastDie = st.dice;
    S.classList.toggle('ludo-flat', gl && Ludo3D.isFlat());
    if (gl) { Ludo3D.setHint(myTurn && !st.rolled && !st.result); Ludo3D.setTurn(st.result ? null : st.players[st.turn].seat, dieOf(st.players[st.turn].seat)); }
    const keepChat = $('.chat-form input', B)?.value || '', hadFocus = document.activeElement?.closest('#game-side .chat-form');
    const act = st.result ? '<p class="muted">Fim de jogo!</p>'
      : !myTurn ? `<p class="muted">Vez de <b>${esc(rp(st.players[st.turn].id).name)}</b>…</p>`
      : !st.rolled ? `<button class="btn primary big" id="ludo-roll">🎲 Rolar dado${st.sixes ? ' de novo!' : ''}</button>`
      : `<div class="offer">Você tirou <b>${st.dice}</b>. Clique numa peça pulando${canPick.length > 1 ? ` (${canPick.length} opções)` : ''}.</div>`;
    // barra do tempo da vez: fica cheia enquanto a animação roda e esvazia nos últimos 15 s (verde → amarelo → vermelho)
    const rem = st.deadline && !st.result ? st.deadline - Room.now() : 0;
    const timer = rem > 0 ? `<div class="ltimer ${myTurn ? 'mine' : ''}"><i style="animation-delay:${Math.round(rem - Ludo.TURN_MS)}ms"></i></div>` : '';
    const amIn = st.players.some(p => p.id === Room.myId);
    const emotes = amIn ? `<div class="lemotes">${LUDO_EMOTES.map(e => `<button data-emo="${e}">${e}</button>`).join('')}</div>` : '';
    B.innerHTML = `
      <div class="card players">${st.players.map((p, i) => {
        const r = rp(p.id);
        return `<div class="pl ${i === st.turn && !st.result ? 'cur' : ''}">${UI.avatar(r, 42)}
          <div class="pinfo"><b>${esc(r.name)}</b>${r.bot ? ' 🤖' : ''}${r.connected === false ? ' <span class="badge">offline</span>' : ''}
            <small><i class="lchip" style="background:${Ludo.SEATS[p.seat].color}"></i>${Ludo.SEATS[p.seat].name}</small></div>
          <div class="cash">🏁 ${p.pieces.filter(x => x === Ludo.HOME).length}/4</div></div>`;
      }).join('')}
        <div class="bankline"><a id="ludo-rules">📖 Regras</a><a id="btn-mute">${SFX.isMuted() ? '🔇 Som' : '🔊 Som'}</a></div></div>
      <div class="card actions">${timer}${act}${emotes}</div>
      <div class="card logcard">
        <div class="tabs"><button data-lt="log" class="${logTab === 'log' ? 'on' : ''}">Registro</button><button data-lt="chat" class="${logTab === 'chat' ? 'on' : ''}">Chat</button></div>
        ${logTab === 'log' ? `<div class="chat-box log">${st.log.map(l => `<div class="msg">${esc(l.msg)}</div>`).join('')}</div>`
        : `<div class="chat-box">${UI.chatHTML(room)}</div><form class="chat-form"><input placeholder="Mensagem…" maxlength="300"><button class="btn">➤</button></form>`}
      </div>
      <button class="btn ghost small" id="game-leave">Sair da partida</button>`;
    if (logTab === 'chat') { const i = $('.chat-form input', B); i.value = keepChat; if (hadFocus) i.focus(); }
    $$('.chat-box', B).forEach(b => b.scrollTop = b.scrollHeight);
    UI.bindChat(B);
    $$('[data-lt]', S).forEach(b => b.onclick = () => { logTab = b.dataset.lt; renderSide(room, st, rp, myTurn, canPick, false); });
    $$('[data-emo]', S).forEach(b => b.onclick = () => Room.send({ t: 'emote', e: b.dataset.emo }));
    $('#ludo-roll', S) && ($('#ludo-roll', S).onclick = () => Room.send({ t: 'act', a: { type: 'roll' } }));
    $('#ludo-rules', S).onclick = () => UI.modal(`<h2>📖 Regras do Ludo</h2><ul class="rules-list small">
      <li>Cada jogador tem 4 peças na base. Tire <b>6</b> para colocar uma peça na saída.</li>
      <li>Tirou 6? Joga de novo. Três 6 seguidos: perde a vez.</li>
      <li>Parou numa casa com peça adversária: ela volta para a base e você joga de novo.</li>
      <li>Casas de saída e com ★ são seguras: ninguém é capturado nelas.</li>
      <li>Duas ou mais peças da mesma cor na mesma casa ficam protegidas: quem chega só divide a casa.</li>
      <li>Depois de dar a volta, a peça entra no corredor da sua cor. Precisa do número exato para chegar ao centro (e ganha outra jogada).</li>
      <li>Vence quem levar as 4 peças ao centro primeiro.</li></ul>`);
    $('#btn-mute', S).onclick = e => { SFX.setMuted(!SFX.isMuted()); e.target.textContent = SFX.isMuted() ? '🔇 Som' : '🔊 Som'; };
    $('#game-leave', S).onclick = () => { if (confirm(Room.isHost ? 'Você é o anfitrião: sair encerra a partida para todos. Sair?' : 'Sair da partida? Um bot jogará por você até você voltar.')) { built = null; UI.leaveToHub(); } };
  }

  function showResult(room, st, rp) {
    SFX.win();
    const w = rp(st.result.winner);
    const m = UI.modal(`<div class="result">
      <div class="confetti">${Array.from({ length: 40 }, (_, k) => `<i style="--x:${Math.random() * 100}%;--d:${Math.random() * 2}s;--h:${k * 37 % 360}"></i>`).join('')}</div>
      ${UI.avatar(w, 150)}<h1>${esc(w.name)} venceu!</h1><blockquote>“${esc(w.catchphrase || '')}”</blockquote>
      <ol class="final">${st.result.ranking.map(r => `<li>${UI.avatar(rp(r.id), 32)}<b>${esc(rp(r.id).name)}</b><span>🏁 ${r.home}/4</span></li>`).join('')}</ol>
      ${Room.isHost ? '<button class="btn primary big" id="back-lobby">Voltar para a sala</button>' : '<p class="muted">Aguardando o anfitrião voltar para a sala…</p>'}
      <button class="btn ghost" id="res-close">Ver tabuleiro</button></div>`, { wide: true });
    $('#back-lobby', m) && ($('#back-lobby', m).onclick = () => { UI.closeModal(); Room.send({ t: 'lobby' }); });
    $('#res-close', m).onclick = UI.closeModal;
  }

  return { render, TRACK, LANE, BASE, reset: () => { built = null; resultShown = null; } };
})();
