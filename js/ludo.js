// ===== Ludo: motor de regras (roda somente no anfitrião) + tela =====
// Regras: tirar 1 ou 6 para sair da base; 6 joga de novo (três 6 seguidos perde a vez);
// capturar ou chegar ao centro também dá outra jogada; casas de saída e estrelas são seguras; 2+ peças da mesma cor juntas não são capturadas;
// precisa do número exato para entrar no centro. Vence quem levar as 4 peças primeiro.
const Ludo = (() => {
  // n = 4 (cruz) ou 6 (hexágono). Pista de 13n casas; posição relativa à saída: 0..13n-2 pista, depois 5 casas de corredor,
  // 13n+4 = centro (56 no de 4), -1 = base
  const homeOf = (n = 4) => 13 * n + 4, lastOf = (n = 4) => 13 * n - 2;
  const isSafe = t => t % 13 === 0 || t % 13 === 8; // saídas e estrelas (posição absoluta)
  const SEATS = [{ name: 'Vermelho', color: '#e5383b' }, { name: 'Verde', color: '#2fa35b' }, { name: 'Amarelo', color: '#f3b733' }, { name: 'Azul', color: '#2f6db5' },
    { name: 'Laranja', color: '#f07a1a' }, { name: 'Roxo', color: '#8e4fd6' }];
  const abs = (seat, r, n = 4) => (r + 13 * seat) % (13 * n);
  let nameOf = id => id;
  function log(st, msg) { st.log.push({ t: Date.now(), msg }); if (st.log.length > 150) st.log.shift(); }

  const INTRO_MS = 4300; // abertura: apresenta os jogadores e conta 3-2-1
  const ROLL_MS = 5000, MOVE_MS = 10000; // tempo para rolar / escolher a peça; depois disso joga sozinho
  const DICE_MS = 1200; // dado rolando + número aparecendo nas telas
  // prazo da próxima ação = animação que ainda vai rodar nas telas + tempo da vez
  const arm = (st, anim) => { st.deadline = Date.now() + anim + (st.rolled ? MOVE_MS : ROLL_MS); };
  // [jogador, cor] na ordem da vez (sentido horário a partir do Vermelho)
  function seatPlayers(list, n = 4) {
    const taken = new Set(), out = [], all = [...Array(n).keys()];
    for (const p of list) if (all.includes(p.seat) && !taken.has(p.seat)) { taken.add(p.seat); out.push([p, p.seat]); }
    for (const p of list) {
      if (out.some(([q]) => q === p)) continue;
      const pref = list.length === 2 ? [...[...taken].map(s => (s + n / 2) % n), 0, n / 2, ...all] : all;
      const s = pref.find(x => !taken.has(x)); taken.add(s); out.push([p, s]);
    }
    return out.sort((a, b) => a[1] - b[1]);
  }
  function newGame(room) {
    const n = room.settings?.seats === 6 ? 6 : 4;
    const st = {
      kind: 'ludo', n, gameId: 'l' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      players: seatPlayers(room.players, n).map(([p, seat]) => ({ id: p.id, seat, pieces: [-1, -1, -1, -1] })),
      turn: 0, dice: null, rolled: false, sixes: 0, ev: { n: 0 }, log: [], result: null, startAt: Date.now() + INTRO_MS,
    };
    st.turn = Math.floor(Math.random() * st.players.length); // quem começa é sorteado
    st.deadline = st.startAt + ROLL_MS;
    log(st, `🎲 A partida de Ludo começou! ${nameOf(st.players[st.turn].id)} foi sorteado(a) para começar.`);
    return st;
  }

  const canMove = (pc, d, n = 4) => pc === -1 ? d === 6 || d === 1 : pc !== homeOf(n) && pc + d <= homeOf(n);
  const movable = (p, d, n = 4) => [0, 1, 2, 3].filter(k => canMove(p.pieces[k], d, n));
  const target = (pc, d) => pc === -1 ? 0 : pc + d;
  // peças adversárias que seriam capturadas ao parar em `to`
  function victims(st, p, to) {
    const n = st.n || 4;
    if (to > lastOf(n) || isSafe(abs(p.seat, to, n))) return [];
    const a = abs(p.seat, to, n), out = [];
    // 2+ peças da mesma cor juntas formam um grupo protegido: quem chega só divide a casa
    for (const o of st.players) {
      if (o === p) continue;
      const here = [0, 1, 2, 3].filter(k => { const pc = o.pieces[k]; return pc >= 0 && pc <= lastOf(n) && abs(o.seat, pc, n) === a; });
      if (here.length === 1) out.push([o, here[0]]);
    }
    return out;
  }
  function nextTurn(st) { st.turn = (st.turn + 1) % st.players.length; st.rolled = false; st.sixes = 0; st.tries = 0; }

  function act(st, pid, a) {
    if (st.result) return 'A partida acabou.';
    const p = st.players[st.turn], n = st.n || 4, HOME = homeOf(n);
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
      else if (!movable(p, d, n).length) {
        // todas as peças na base (ou já no centro): até 3 tentativas para tirar 1 ou 6
        const stuck = p.pieces.every(x => x === -1 || x === HOME);
        st.tries = stuck ? (st.tries || 0) + 1 : 0;
        if (d === 6) { log(st, '   Nenhuma peça pode andar.'); st.rolled = false; }
        else if (stuck && st.tries < 3) { log(st, `   Ainda na base — tenta de novo (${st.tries}/3).`); st.rolled = false; }
        else { log(st, '   Nenhuma peça pode andar.'); nextTurn(st); }
      }
      arm(st, DICE_MS);
      return null;
    }
    if (a?.type === 'move') {
      if (!st.rolled) return 'Role o dado primeiro.';
      const k = a.k;
      if (![0, 1, 2, 3].includes(k) || !canMove(p.pieces[k], st.dice, n)) return 'Essa peça não pode andar.';
      const from = p.pieces[k], to = target(from, st.dice), hit = victims(st, p, to);
      p.pieces[k] = to; st.tries = 0;
      let again = st.dice === 6;
      hit.forEach(([o, j]) => { o.pieces[j] = -1; });
      if (hit.length) { again = true; log(st, `💥 ${nameOf(pid)} capturou ${hit.map(([o]) => nameOf(o.id)).join(', ')}!`); }
      if (to === HOME) { again = true; log(st, `🏁 ${nameOf(pid)} levou uma peça ao centro (${p.pieces.filter(x => x === HOME).length}/4).`); }
      st.ev = { n: st.ev.n + 1, type: hit.length ? 'capture' : to === HOME ? 'home' : 'move' };
      if (p.pieces.every(x => x === HOME)) {
        const score = q => q.pieces.reduce((s, x) => s + x + 1, 0);
        // worth 0: o ranking da Mesa guarda o "melhor patrimônio" do Magnata; Ludo não mexe nisso
        const ranking = [...st.players].sort((x, y) => score(y) - score(x)).map(q => ({ id: q.id, home: q.pieces.filter(x => x === HOME).length, worth: 0 }));
        st.result = { winner: pid, ranking }; st.endAt = Date.now();
        log(st, `🏆 ${nameOf(pid)} venceu!`); st.deadline = null;
        return null;
      }
      if (again) st.rolled = false; else nextTurn(st);
      arm(st, Math.max(1, to - from) * 180 + (hit.length ? 2200 : 500));
      return null;
    }
    return 'Ação inválida.';
  }

  function botAction(st, pid) {
    if (st.result || st.players[st.turn].id !== pid) return null;
    if (!st.rolled) return { type: 'roll' };
    const p = st.players[st.turn], n = st.n || 4, opts = movable(p, st.dice, n);
    if (!opts.length) return null;
    const score = k => {
      const from = p.pieces[k], to = target(from, st.dice);
      return victims(st, p, to).length * 100 + (to === homeOf(n)) * 80 + (from === -1) * 60 + (to > lastOf(n) || isSafe(abs(p.seat, to, n))) * 20 + to / 10;
    };
    return { type: 'move', k: opts.sort((a, b) => score(b) - score(a))[0] };
  }

  // espera do bot antes de agir: dado 3D (~1 s) antes de mover; peão andando antes de rolar de novo
  const botDelay = (a, st) => (a.type === 'move' ? 1400 : 1200) + Math.max(0, (st?.startAt || 0) - Date.now());

  const wouldCapture = (st, p, k) => victims(st, p, target(p.pieces[k], st.dice)).length > 0;
  return { newGame, act, botAction, botDelay, movable, wouldCapture, ROLL_MS, MOVE_MS, DICE_MS, SEATS, isSafe, homeOf, setNameResolver: f => (nameOf = f) };
})();

// ===== Ludo: tela =====
const LudoUI = (() => {
  // geometria do tabuleiro com n braços (4 = a cruz clássica 15×15, 6 = hexágono), em coordenadas contínuas (linha y, coluna x), centro em 7,5.
  // Cada braço tem 3 colunas × 6 casas saindo do miolo; braço a aponta para o ângulo 180° + a·360°/n (sentido horário na tela).
  // Pista: 13 casas por braço — desce pela coluna de "volta" do braço a, sobe pela de "ida" do braço a+1, passa pela ponta e começa a descer.
  const geoCache = {};
  function geo(n = 4) {
    if (geoCache[n]) return geoCache[n];
    const C = 7.5, R0 = n === 4 ? 1.5 : 1.5 * Math.sqrt(3), th = a => Math.PI + (a % n) * 2 * Math.PI / n;
    // casa i (0 = junto do miolo) na coluna j (-1 ida, 0 meio, 1 volta) do braço a: [y, x, ângulo do braço]
    const cell = (a, i, j) => { const t = th(a), d = R0 + i + .5; return [C + d * Math.sin(t) + j * Math.cos(t), C + d * Math.cos(t) - j * Math.sin(t), t]; };
    const TRACK = Array.from({ length: 13 * n }, (_, t) => { const a = Math.floor(t / 13), q = t % 13; return q <= 4 ? cell(a, 4 - q, 1) : q <= 10 ? cell(a + 1, q - 5, -1) : cell(a + 1, 5, q === 11 ? 0 : 1); });
    const LANE = Array.from({ length: n }, (_, s) => [4, 3, 2, 1, 0].map(i => cell(s, i, 0)));
    // base entre o próprio braço e o seguinte. No hexágono o vão entre dois braços é um triângulo equilátero de lado 6
    // (ponta no miolo, lado de fora na borda): a base ocupa esse triângulo; BASE = centro dele, bph = ângulo "para fora"
    const D = n === 4 ? 4.5 * Math.SQRT2 : 3 + 2 * Math.sqrt(3), g = n === 4 ? .95 : 1.85;
    const bph = s => th(s) + Math.PI / n;
    const BASE = Array.from({ length: n }, (_, s) => [C + D * Math.sin(bph(s)), C + D * Math.cos(bph(s))]);
    const GOAL = Array.from({ length: n }, (_, s) => [C + g * Math.sin(th(s)), C + g * Math.cos(th(s))]);
    const span = n === 4 ? [0, 15] : [C - 10.4, 20.8]; // área da tela 2D: origem e tamanho
    // peças na base: 2×2 na cruz; no triângulo, uma em cada ponta e uma no meio
    const slot = n === 4 ? (s, k) => [BASE[s][0] + ((k >> 1) * 2 - 1), BASE[s][1] + ((k & 1) * 2 - 1)]
      : (s, k) => { if (k === 3) return BASE[s].slice(); const f = bph(s) + Math.PI + k * 2 * Math.PI / 3; return [BASE[s][0] + 1.35 * Math.sin(f), BASE[s][1] + 1.35 * Math.cos(f)]; };
    // dentro do quintal (triângulo creme, raio interno 1,27) de alguma base?
    const inYard = (y, x) => BASE.some(([by, bx], s) => [0, 1, 2].every(k => { const f = bph(s) + k * 2 * Math.PI / 3; return (x - bx) * Math.cos(f) + (y - by) * Math.sin(f) < 1.32; }));
    return (geoCache[n] = { n, C, R0, th, bph, TRACK, LANE, BASE, GOAL, O: span[0], S: span[1], LAST: 13 * n - 2, HOME: 13 * n + 4, slot, inYard });
  }
  let G = geo(4);

  // posição (linha, coluna) contínua do centro da peça
  function spot(seat, pc, k) {
    if (pc === -1) return G.slot(seat, k);
    if (pc === G.HOME) return G.GOAL[seat];
    const c = pc <= G.LAST ? G.TRACK[(pc + 13 * seat) % (13 * G.n)] : G.LANE[seat][pc - G.LAST - 1];
    return [c[0], c[1]];
  }

  // caminho casa a casa de `from` até `to` (lista de pontos, incluindo a origem)
  function path(seat, from, to, k) {
    if (to === -1 || from === -1) return [spot(seat, from, k), spot(seat, to, k)];
    return Array.from({ length: to - from + 1 }, (_, i) => spot(seat, from + i, k));
  }

  const STEP = 180; // ms por casa (o motor usa o mesmo valor no prazo)
  let gl = false, built = null, seenEmote = 0, seenEv = 0, wasMyTurn = false, logTab = 'log', resultShown = null, tilt = 48, spin = 0;
  const cam = () => { const b = $('#ludo-board'); b.style.setProperty('--tilt', tilt + 'deg'); b.style.setProperty('--spin', spin + 'deg'); };

  // abertura: fundo próprio animado, título, cartões voando dos lados, VS, contagem 3-2-1 e "VAI!" abrindo como um círculo
  function intro(st, rp) {
    const left = (st.startAt || 0) - Room.now(); if (left < 1200) return;
    const el = document.createElement('div'); el.className = 'ludo-intro';
    const gap = st.players.length > 4 ? .14 : .22; // com 6 os cards entram mais rápido, para terminar antes do 3-2-1
    const cards = st.players.map((p, i) => {
      const pl = rp(p.id), hat = LUDO_HATS.find(h => h.id === pl.hat), from = i % 2 ? 1 : -1;
      return `<div class="li-card" style="--c:${Ludo.SEATS[p.seat].color};--rot:${from * 18}deg;animation-delay:${.3 + i * gap}s">
        <div class="li-av"><img src="${charById(pl.char).img}" alt="">${hat && hat.id !== 'none' ? `<span class="li-hat">${hat.icon}</span>` : ''}</div>
        <b>${esc(pl.name)}</b><small>${Ludo.SEATS[p.seat].name}</small></div>`;
    });
    el.innerHTML = `<div class="li-rays"></div><h1 class="li-title"><i class="li-crown">👑</i>${[...'LUDO'].map((ch, i) => `<span class="lt" style="--c:${Ludo.SEATS[i].color};--i:${i}"><b>${ch}</b><b>${ch}</b></span>`).join('')}${[[-8, 20, 0], [104, 8, .5], [18, 92, 1], [92, 84, 1.4], [50, -18, .8], [-14, 70, 1.8]].map(([x, y, d]) => `<i class="li-spark" style="left:${x}%;top:${y}%;animation-delay:${d}s">✦</i>`).join('')}</h1>
      <div class="li-cards ${cards.length > 4 ? 'many' : ''}">${cards.join(`<span class="li-vs">VS</span>`)}</div><div class="li-count"></div>`;
    $('#scr-game').appendChild(el);
    if (gl) Ludo3D.hold(left);
    // cada card faz um "vupt + tum" ao pousar (tom subindo de um card para o outro)
    // o card pousa em 60% da animação de .7 s (.42 s depois do atraso dele)
    st.players.forEach((_, i) => gl ? Ludo3D.cardIn(i, .3 + i * gap + .4) : setTimeout(SFX.click, (.3 + i * gap + .4) * 1000));
    const box = $('.li-count', el), go = Math.max(1300, left - 2500);
    ['3', '2', '1', 'VAI!'].forEach((t, i) => setTimeout(() => {
      box.querySelector('.lc:not(.leave)')?.classList.add('leave'); setTimeout(() => box.querySelector('.lc.leave')?.remove(), 260);
      const n = document.createElement('div'); n.className = 'lc' + (i === 3 ? ' go' : '');
      n.style.setProperty('--c', i === 3 ? '#ffd23f' : Ludo.SEATS[st.players[i % st.players.length].seat].color);
      const tx = t;
      n.innerHTML = `<i class="lc-rays"></i><i class="lc-ring"></i><span class="lc-o">${tx}</span><span class="lc-f">${tx}</span>`;
      box.appendChild(n); el.classList.add('counting');
      if (gl) Ludo3D.cue(3 - i); else SFX.click();
    }, go + i * 650));
    setTimeout(() => el.classList.add('out'), go + 2350);
    setTimeout(() => el.remove(), go + 2900);
  }

  let lastDie = 6;
  function build(st) {
    let el = $('#ludo-board');
    if (!el) { el = document.createElement('div'); el.id = 'ludo-board'; $('#board-wrap').appendChild(el); }
    G = geo(st.n || 4);
    const S = Ludo.SEATS, g = ([y, x]) => [Math.round(y - .5), Math.round(x - .5)];
    const cell = ([r, c], cls = '', style = '', html = '') => `<div class="lc ${cls}" style="grid-row:${r + 1};grid-column:${c + 1};${style}">${html}</div>`;
    const trackCell = (c, i, put) => { const startOf = i % 13 === 0 ? i / 13 : -1; return put(c, Ludo.isSafe(i) ? 'safe' : '', startOf >= 0 ? `background:${S[startOf].color}` : '', Ludo.isSafe(i) && startOf < 0 ? '★' : ''); };
    if (G.n === 4) el.innerHTML = '<div class="l3d">' + G.BASE.map(([y, x], s) => `<div class="lbase" style="grid-row:${Math.round(y - 2)}/span 6;grid-column:${Math.round(x - 2)}/span 6;--c:${S[s].color}"><div></div></div>`).join('')
      + G.TRACK.map((c, i) => trackCell(g(c), i, cell)).join('')
      + G.LANE.map((l, s) => l.map(c => cell(g(c), '', `background:${S[s].color}`)).join('')).join('')
      + `<div class="lgoal" style="--c0:${S[0].color};--c1:${S[1].color};--c2:${S[2].color};--c3:${S[3].color}"></div>
        <i class="lside s-t"></i><i class="lside s-r"></i><i class="lside s-b"></i><i class="lside s-l"></i><div id="ludo-pieces"></div></div>`;
    else {
      // hexágono (só sem WebGL): casas soltas, posicionadas e giradas uma a uma
      const P = v => ((v - G.O) / G.S * 100).toFixed(3) + '%', sz = v => (v / G.S * 100).toFixed(3) + '%';
      const hx = ([y, x, t], cls = '', style = '', html = '') => `<div class="lc hx ${cls}" style="top:${P(y)};left:${P(x)};width:${sz(1)};height:${sz(1)};rotate:${t}rad;${style}">${html}</div>`;
      el.innerHTML = '<div class="l3d lhex">' + G.BASE.map(([y, x], s) => `<div class="lbase hx tri" style="top:${P(y)};left:${P(x)};width:${sz(6.93)};height:${sz(6.93)};rotate:${G.bph(s) + Math.PI / 2}rad;--c:${S[s].color}"><div></div></div>`).join('')
        + G.TRACK.map((c, i) => trackCell(c, i, hx)).join('')
        + G.LANE.map((l, s) => l.map(c => hx(c, '', `background:${S[s].color}`)).join('')).join('')
        + `<div class="lgoal hx" style="top:${P(G.C)};left:${P(G.C)};width:${sz(6)};height:${sz(6)};background:conic-gradient(from 240deg, ${[5, 0, 1, 2, 3, 4].map(s => `${S[s].color} ${(s + 1) % 6 * 60}deg ${((s + 1) % 6 + 1) * 60}deg`).join(', ')})"></div><div id="ludo-pieces"></div></div>`;
    }
    $('#ludo-pieces').onclick = e => {
      const b = e.target.closest('.lpiece.can'); if (b) Room.send({ t: 'act', a: { type: 'move', k: +b.dataset.k } });
    };
    // câmera: começa com a sua base virada para você; arrastar gira/inclina, duplo clique volta
    const mine = st.players.find(p => p.id === Room.myId);
    const home = () => { tilt = 48; spin = !mine ? 0 : G.n === 4 ? (3 - mine.seat) * 90 : -(90 + 60 * mine.seat); cam(); };
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
        flatRoll: v => { const t = $('#game-side .ldice'); lastDie = v; return t ? Anim.rollDice(t, [v, v], { ms: 900 }) : Promise.resolve(); },
      });
      Ludo3D.reset(mine?.seat, G.n);
    }
  }

  function render(room) {
    const st = room.state; if (!st) return;
    UI.show('scr-game'); G = geo(st.n || 4);
    const isNew = built !== st.gameId; if (isNew) { build(st); built = st.gameId; seenEv = st.ev.n; }
    const rp = id => room.players.find(p => p.id === id) || { name: id, char: 'vitoria' };
    if (isNew) { intro(st, rp); seenEmote = room.emote?.n || 0; if (gl) Ludo3D.setScene(room.settings?.scene); }
    // reação rápida de alguém: emoji sobe da base da cor dele
    if (room.emote && room.emote.n !== seenEmote) {
      seenEmote = room.emote.n; const who = st.players.find(p => p.id === room.emote.pid);
      if (who && gl) Ludo3D.emote(who.seat, room.emote.e); else if (who) UI.toast(`${rp(who.id).name}: ${room.emote.e}`);
    }
    const cur = st.players[st.turn], myTurn = cur.id === Room.myId && !st.result;
    const canPick = myTurn && st.rolled ? Ludo.movable(cur, st.dice, st.n || 4) : [];
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
      el.style.cssText = `--c:${Ludo.SEATS[p.seat].color};top:${(y - G.O) / G.S * 100}%;left:${(x - G.O) / G.S * 100}%;scale:${scale}`;
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
      const kf = pts.map(([y, x]) => ({ top: (y - G.O) / G.S * 100 + '%', left: (x - G.O) / G.S * 100 + '%' }));
      kf[n] = { top: el.style.top, left: el.style.left };
      el.getAnimations().forEach(a => a.cancel());
      el.animate(kf, opt);
      $('.lhop', el).animate(Array.from({ length: 2 * n + 1 }, (_, i) => ({ transform: `translateZ(${i % 2 ? (back ? 9 : 3) : 0}cqw)` })), { ...opt, easing: 'ease-in-out' });
      if (!back && !gl) for (let i = 1; i <= n; i++) setTimeout(SFX.step, i * STEP - 30); // no 3D o som de passo é do ludo3d.js
    }
    if (fresh && st.ev.type === 'capture' && !gl) setTimeout(SFX.jail, walkMs); // no 3D a captura tem som próprio
    if (fresh && st.ev.type === 'home') setTimeout(SFX.coinUp, walkMs);

    const side = renderSide(room, st, rp, myTurn, canPick, fresh);
    // dado rolando (~1,9 s) ou peça andando/capturando: o cartão da vez e o painel do lado esperam terminar, juntos
    hud(st, rp, myTurn, !fresh ? 0 : st.ev.type === 'roll' ? Ludo.DICE_MS : walkMs + (st.ev.type === 'capture' ? 1500 : 200), side);
    watchers(room); clock(st);

    if (st.result && resultShown !== st.gameId) {
      resultShown = st.gameId; UI.recordResult(st, room);
      if (gl) setTimeout(() => Ludo3D.podium(st.result.ranking.slice(0, 3).map(r => { const p = st.players.find(q => q.id === r.id), pl = rp(r.id); return { seat: p.seat, hat: pl.hat, img: charById(pl.char).img }; })), 700 + walkMs);
      setTimeout(() => showResult(room, st, rp), (gl ? 6000 : 600) + walkMs);
    }
  }

  // em cima à direita: foto de quem joga + barra do tempo; embaixo à direita: botão de reações
  function hud(st, rp, myTurn, wait = 0, side) {
    const W = $('#board-wrap');
    let h = $('#ludo-hud', W);
    if (!h) { h = document.createElement('div'); h.id = 'ludo-hud'; W.appendChild(h); }
    // cada estado entra na fila e aparece quando a animação dele termina, na ordem (bots jogando seguido não "travam" o cartão);
    // uma atualização sem animação (ex.: reação) nunca passa na frente de uma que ainda está esperando
    const now = Date.now(), at = Math.max(now + (h._k ? wait : 0), h._last || 0); h._last = at;
    // no anfitrião o estado é o mesmo objeto, alterado a cada jogada: guarda uma cópia do que o cartão precisa agora
    const snap = { turn: st.turn, cur: { ...st.players[st.turn] }, deadline: st.deadline, rolled: st.rolled, result: !!st.result };
    if (at > now) setTimeout(() => { drawHud(h, snap, rp, myTurn); side?.(); }, at - now); else { drawHud(h, snap, rp, myTurn); side?.(); }
    emoBtn(W, st);
  }
  function drawHud(h, st, rp, myTurn) {
    const cur = st.cur, rem = st.deadline && !st.result ? st.deadline - Room.now() : 0, key = st.result ? 'end' : st.deadline + ':' + st.turn;
    if (h._k !== key) {
      const sameTurn = h._turn === st.turn + ':' + cur.id; h._k = key; h._turn = st.turn + ':' + cur.id; const pl = rp(cur.id);
      clearTimeout(h._hurry); clearInterval(h._tick);
      // ícone do que falta fazer: 🎲 rolar / ♟️ mover; a barra fica cheia enquanto a animação roda e esvazia nos últimos 15 s
      const what = st.rolled ? ['♟️', 'Mover peça'] : ['🎲', 'Rolar dado'], full = st.rolled ? Ludo.MOVE_MS : Ludo.ROLL_MS;
      h.innerHTML = rem > 0 ? `<div class="lhud ${myTurn ? 'mine' : ''} ${sameTurn ? 'same' : ''}" style="--c:${Ludo.SEATS[cur.seat].color}">
        <div class="lhud-av"><img src="${charById(pl.char).img}" alt=""><span class="lhud-ico" title="${what[1]}">${what[0]}</span></div>
        <div class="lhud-body"><b>${myTurn ? 'Sua vez!' : esc(pl.name)}</b><small>${what[1]}</small>
          <div class="ltimer"><i style="--tl:${full}ms;animation-delay:${Math.round(rem - full)}ms"></i></div></div></div>` : '';
      // últimos 3 s: pisca; na sua vez, um tique bem leve por segundo
      if (rem > 0) h._hurry = setTimeout(() => {
        h.firstChild?.classList.add('hurry');
        if (myTurn && gl) { const beat = () => { const r = st.deadline - Room.now(); if (r <= 0 || h._k !== key) return clearInterval(h._tick); Ludo3D.tick(r < 2500); }; beat(); h._tick = setInterval(beat, 1000); }
      }, Math.max(0, rem - 3000));
    }
  }
  // duração da partida (conta a partir do fim da abertura; para no fim do jogo)
  const fmtDur = ms => { const t = Math.floor(ms / 1000), h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, s = String(t % 60).padStart(2, '0'); return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`; };
  const elapsed = st => Math.max(0, (st.endAt || Room.now()) - st.startAt);
  function clock(st) {
    const W = $('#board-wrap'); let c = $('#ludo-clock', W);
    if (!c) { c = document.createElement('div'); c.id = 'ludo-clock'; c.title = 'Duração da partida'; W.appendChild(c); }
    c._st = st; const paint = () => { c.textContent = '⏱ ' + fmtDur(elapsed(c._st)); };
    paint(); clearInterval(c._iv); if (!st.endAt) c._iv = setInterval(() => c.isConnected ? paint() : clearInterval(c._iv), 1000);
  }
  // quem está assistindo: bonequinhos no cenário (3D) + selo com as fotos em cima do tabuleiro
  function watchers(room) {
    const list = room.spectators || [], W = $('#board-wrap'), meWatching = list.some(s => s.id === Room.myId);
    if (gl) Ludo3D.spectators(list.map(s => ({ id: s.id, hat: s.hat, img: charById(s.char).img })));
    let el = $('#ludo-watch', W);
    if (!list.length) { el?.remove(); return; }
    if (!el) { el = document.createElement('div'); el.id = 'ludo-watch'; W.appendChild(el); }
    el.innerHTML = `${meWatching ? '<b>Você está assistindo</b>' : `<b>👀 ${list.length}</b>`}${list.map(s => `<img src="${charById(s.char).img}" alt="" title="${esc(s.name)} está assistindo">`).join('')}`;
  }
  function emoBtn(W, st) {
    let e = $('#ludo-emo', W);
    const amIn = st.players.some(p => p.id === Room.myId) && !st.result;
    if (!amIn) { e?.remove(); return; }
    if (!e) {
      e = document.createElement('div'); e.id = 'ludo-emo';
      e.innerHTML = `<div class="emo-pop">${LUDO_EMOTES.map((x, i) => `<button data-emo="${x}" style="--i:${i}">${x}</button>`).join('')}</div><button class="emo-btn" title="Reações">😀</button>`;
      W.appendChild(e);
      $('.emo-btn', e).onclick = () => e.classList.toggle('open');
      // a janelinha fica aberta: dá para mandar vários seguidos
      $$('[data-emo]', e).forEach(b => b.onclick = () => { Room.send({ t: 'emote', e: b.dataset.emo }); b.animate([{ transform: 'scale(1.5)' }, { transform: 'scale(1)' }], 220); });
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
    if (fresh && st.ev.type === 'roll') {
      if (gl) Ludo3D.rollDice(st.dice, Ludo.SEATS[st.ev.seat].color, st.ev.combo);
      else { Anim.rollDice(tray, [st.dice, st.dice], { ms: 900 }); if (st.ev.combo === 3) setTimeout(() => UI.toast('Três 6 seguidos — perdeu a vez!', 'err'), 1200); }
    }
    if (st.dice) lastDie = st.dice;
    S.classList.toggle('ludo-flat', gl && Ludo3D.isFlat());
    // no anfitrião o estado é alterado no lugar: o painel desenha uma cópia de agora, mais tarde
    return drawSide.bind(null, room, structuredClone(st), rp, myTurn, canPick);
  }
  function drawSide(room, st, rp, myTurn, canPick) {
    const S = $('#game-side'), tray = $('.ldice', S), B = $('#ludo-side', S); if (!B) return;
    tray.classList.toggle('can-roll', myTurn && !st.rolled);
    if (gl) { Ludo3D.setHint(myTurn && !st.rolled && !st.result); Ludo3D.setTurn(st.result ? null : st.players[st.turn].seat); }
    const keepChat = $('.chat-form input', B)?.value || '', hadFocus = document.activeElement?.closest('#game-side .chat-form');
    const act = st.result ? '<p class="muted">Fim de jogo!</p>'
      : !myTurn ? `<p class="muted">Vez de <b>${esc(rp(st.players[st.turn].id).name)}</b>…</p>`
      : !st.rolled ? `<button class="btn primary big" id="ludo-roll">🎲 Rolar dado${st.sixes ? ' de novo!' : st.tries ? ` (tentativa ${st.tries + 1}/3)` : ''}</button>`
      : `<div class="offer">Você tirou <b>${st.dice}</b>. Clique numa peça pulando${canPick.length > 1 ? ` (${canPick.length} opções)` : ''}.</div>`;

    B.innerHTML = `
      <div class="card players">${st.players.map((p, i) => {
        const r = rp(p.id);
        return `<div class="pl ${i === st.turn && !st.result ? 'cur' : ''}">${UI.avatar(r, 42)}
          <div class="pinfo"><b>${esc(r.name)}</b>${r.bot ? ' 🤖' : ''}${r.connected === false ? ' <span class="badge">offline</span>' : ''}
            <small><i class="lchip" style="background:${Ludo.SEATS[p.seat].color}"></i>${Ludo.SEATS[p.seat].name}</small></div>
          <div class="cash">🏁 ${p.pieces.filter(x => x === Ludo.homeOf(st.n)).length}/4</div></div>`;
      }).join('')}
        <div class="bankline"><a id="ludo-rules">📖 Regras</a><a id="btn-mute">${SFX.isMuted() ? '🔇 Som' : '🔊 Som'}</a></div></div>
      <div class="card actions">${act}</div>
      <div class="card logcard">
        <div class="tabs"><button data-lt="log" class="${logTab === 'log' ? 'on' : ''}">Registro</button><button data-lt="chat" class="${logTab === 'chat' ? 'on' : ''}">Chat</button></div>
        ${logTab === 'log' ? `<div class="chat-box log">${st.log.map(l => `<div class="msg">${esc(l.msg)}</div>`).join('')}</div>`
        : `<div class="chat-box">${UI.chatHTML(room)}</div><form class="chat-form"><input placeholder="Mensagem…" maxlength="300"><button class="btn">➤</button></form>`}
      </div>
      <button class="btn ghost small" id="game-leave">Sair da partida</button>`;
    if (logTab === 'chat') { const i = $('.chat-form input', B); i.value = keepChat; if (hadFocus) i.focus(); }
    $$('.chat-box', B).forEach(b => b.scrollTop = b.scrollHeight);
    UI.bindChat(B);
    $$('[data-lt]', S).forEach(b => b.onclick = () => { logTab = b.dataset.lt; drawSide(room, st, rp, myTurn, canPick); });
    $('#ludo-roll', S) && ($('#ludo-roll', S).onclick = () => Room.send({ t: 'act', a: { type: 'roll' } }));
    $('#ludo-rules', S).onclick = () => UI.modal(`<h2>📖 Regras do Ludo</h2><ul class="rules-list small">
      <li>Cada jogador tem 4 peças na base. Tire <b>1 ou 6</b> para colocar uma peça na saída.</li>
      <li>Quem começa é sorteado. Com todas as peças na base, você tem até <b>3 tentativas</b> para tirar 1 ou 6.</li>
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
      <p class="muted">⏱ Partida de ${fmtDur(elapsed(st))}</p>
      <ol class="final">${st.result.ranking.map(r => `<li>${UI.avatar(rp(r.id), 32)}<b>${esc(rp(r.id).name)}</b><span>🏁 ${r.home}/4</span></li>`).join('')}</ol>
      ${Room.isHost ? '<button class="btn primary big" id="back-lobby">Voltar para a sala</button>' : '<p class="muted">Aguardando o anfitrião voltar para a sala…</p>'}
      <button class="btn ghost" id="res-close">Ver tabuleiro</button></div>`, { wide: true });
    $('#back-lobby', m) && ($('#back-lobby', m).onclick = () => { UI.closeModal(); Room.send({ t: 'lobby' }); });
    $('#res-close', m).onclick = UI.closeModal;
  }

  return { render, geo, reset: () => { built = null; resultShown = null; } };
})();
