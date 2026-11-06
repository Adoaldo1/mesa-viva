// ===== Rede: P2P (PeerJS/WebRTC) com reservas automáticas =====
// O anfitrião é autoritativo. Cada jogador tenta, em ordem:
//   1. conexão direta (WebRTC);
//   2. retransmissor próprio na Cloudflare (WebSocket comum — passa por CGNAT, 4G e redes restritas);
//   3. reserva pelo próprio servidor de sinalização do PeerJS (porta 443);
//   4. reserva por servidores públicos de mensagens (MQTT sobre WebSocket seguro).
// O anfitrião escuta em todos os caminhos ao mesmo tempo, então todos jogam juntos na mesma sala.
const Net = (() => {
  const PREFIX = 'mesaviva-v1-', TOPIC = 'mesaviva/v1/';
  const P2P_TIMEOUT_CF = 4500, P2P_TIMEOUT = 9000, REPLY_TIMEOUT = 6500, HEARTBEAT = 5000, DEAD_AFTER = 20000;
  const ICE = [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] },
    { urls: 'stun:stun.cloudflare.com:3478' },
    { urls: ['turn:eu-0.turn.peerjs.com:3478', 'turn:us-0.turn.peerjs.com:3478'], username: 'peerjs', credential: 'peerjsp' },
  ];
  const BROKERS = ['wss://broker.emqx.io:8084/mqtt', 'wss://broker.hivemq.com:8884/mqtt'];
  // retransmissor na Cloudflare (relay/ no repositório). Para testar outro endereço: localStorage 'mesaviva.cf'
  const CF_RELAY = 'https://mesaviva-relay.guicalheira14.workers.dev';
  const cfBase = () => { let u = CF_RELAY; try { u = localStorage.getItem('mesaviva.cf') || u; } catch { } return u.replace(/\/$/, ''); };
  const cfWs = () => cfBase().replace(/^http/, 'ws');
  const cfOk = () => !!cfBase() && !!window.WebSocket;
  const peerOpts = () => ({ debug: 1, config: { iceServers: ICE } });
  const rid = () => Math.random().toString(36).slice(2, 10);

  let peer = null, hostConn = null, conns = new Map(); // id -> {send, close, pid, relay}
  let handlers = {}, mode = null, via = null, relays = [], timers = [];
  let relayClient = null, relayId = null, lastHostMsg = 0, roomCode = null, sigOff = null, cfSock = null, cfHostSock = null;

  const genCode = () => Array.from({ length: 5 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');
  const later = (fn, ms) => { const t = setTimeout(fn, ms); timers.push(t); return t; };
  const every = (fn, ms) => { const t = setInterval(fn, ms); timers.push(t); return t; };
  const mqttOk = () => !!window.mqtt;
  const mqttConnect = (url, extra = {}) => window.mqtt.connect(url, { clientId: 'mv_' + rid(), clean: true, connectTimeout: 7000, reconnectPeriod: 3000, keepalive: 30, ...extra });

  // ---------- reserva pelo servidor de sinalização do PeerJS ----------
  // O servidor só repassa mensagens com formato de "candidato ICE" e de até ~16 KB, então
  // cada mensagem do jogo vai fatiada nesse formato e é remontada do outro lado.
  const SIG_CHUNK = 7000, SIG_CONN = 'mvr_relay';
  function sigSend(p, dst, obj) {
    const sock = p?.socket; if (!sock) return;
    const s = JSON.stringify(obj), id = rid(), total = Math.max(1, Math.ceil(s.length / SIG_CHUNK));
    for (let k = 0; k < total; k++) {
      try {
        sock.send({ type: 'CANDIDATE', dst, payload: { candidate: { candidate: '', sdpMid: '0', sdpMLineIndex: 0 }, type: 'data', connectionId: SIG_CONN, mvr: { i: id, k, n: total, d: s.slice(k * SIG_CHUNK, (k + 1) * SIG_CHUNK) } } });
      } catch { }
    }
  }
  function sigListen(p, onObj) {
    const parts = new Map();
    const fn = m => {
      if (m?.type !== 'CANDIDATE' || !m.payload?.mvr) return;
      try { p._lostMessages?.delete?.(SIG_CONN); } catch { } // o PeerJS guardaria isso como "mensagem perdida"
      const { i, k, n, d } = m.payload.mvr, key = m.src + '|' + i;
      let e = parts.get(key); if (!e) { e = { got: 0, arr: new Array(n), t: Date.now() }; parts.set(key, e); }
      if (e.arr[k] === undefined) { e.arr[k] = d; e.got++; }
      if (e.got === n) { parts.delete(key); let obj; try { obj = JSON.parse(e.arr.join('')); } catch { return; } onObj(m.src, obj); }
      if (parts.size > 50) for (const [kk, v] of parts) if (Date.now() - v.t > 30000) parts.delete(kk);
    };
    p.socket.on('message', fn);
    return () => { try { p.socket.off('message', fn); } catch { } };
  }

  function destroy() {
    const rc = relayClient;
    if (mode === 'relay') { try { toHostRaw({ bye: 1 }, true); } catch { } }
    if (rc) setTimeout(() => { try { rc.end(true); } catch { } }, 3000);
    timers.forEach(t => { clearTimeout(t); clearInterval(t); }); timers = [];
    try { sigOff?.(); } catch { }
    const p = peer; setTimeout(() => { try { p?.destroy(); } catch { } }, mode === 'relay' && via === 'sig' ? 400 : 0);
    for (const c of relays) { try { c.end(true); } catch { } }
    const cs = cfSock, ch = cfHostSock; cfSock = null; cfHostSock = null;
    setTimeout(() => { for (const w of [cs, ch]) { try { w?.close(1000); } catch { } } }, cs ? 300 : 0);
    peer = null; hostConn = null; conns.clear(); relays = []; relayClient = null; relayId = null; mode = null; via = null; roomCode = null; sigOff = null;
  }

  // ---------------- anfitrião ----------------
  // entrada de um jogador por reserva (servidor de sinalização ou MQTT)
  function relayIn(id, m, send, onMsg, onLeave) {
    let e = conns.get(id);
    if (m.bye) { if (e) { conns.delete(id); onLeave(e.pid, id); } return; }
    if (!e || !e.relay) { e = { pid: e?.pid ?? null, relay: true, last: 0, send: null, close: () => conns.delete(id) }; conns.set(id, e); }
    e.send = send; e.last = Date.now();
    if (m.ping) return e.send({ pong: 1 });
    if (m.msg) onMsg(id, m.msg);
  }

  function host(onReady, onMsg, onLeave, tries = 0, want = null) {
    destroy();
    const code = (!tries && want) || genCode(); roomCode = code;
    let ready = false;
    const go = () => { if (ready) return; ready = true; startRelayHost(code, onMsg, onLeave); onReady(code); };
    if (!window.Peer) return go();
    peer = new Peer(PREFIX + code, peerOpts());
    const p = peer;
    p.on('open', () => {
      sigOff = sigListen(p, (src, m) => relayIn(src, m, msg => sigSend(p, src, msg), onMsg, onLeave));
      go();
    });
    p.on('connection', conn => {
      const e = { pid: null, relay: false, send: m => conn.open && conn.send(m), close: () => conn.close() };
      conn.on('open', () => { const old = conns.get(conn.peer); e.pid = old?.pid ?? null; conns.set(conn.peer, e); });
      conn.on('data', d => onMsg(conn.peer, d));
      conn.on('close', () => { if (conns.get(conn.peer) === e) { conns.delete(conn.peer); onLeave(e.pid, conn.peer); } });
      conn.on('error', () => { });
    });
    p.on('error', e => {
      if (e.type === 'unavailable-id' && tries < 5 && !ready) return host(onReady, onMsg, onLeave, tries + 1);
      if (!ready && ['network', 'server-error', 'socket-error', 'socket-closed'].includes(e.type)) return go();
      if (!ready) handlers.error?.(friendly(e));
    });
    p.on('disconnected', () => { try { p.reconnect(); } catch { } });
    later(() => { if (!ready) { try { p.destroy(); } catch { } peer = null; go(); } }, P2P_TIMEOUT);
  }

  // anfitrião no retransmissor da Cloudflare: fica conectado enquanto a sala existir (religa se cair)
  function cfHost(code, onMsg, onLeave) {
    if (!cfOk()) return;
    let tries = 0;
    const open = () => {
      if (roomCode !== code) return;
      let ws; try { ws = new WebSocket(cfWs() + '/room/' + code + '?role=host&id=h'); } catch { return; }
      cfHostSock = ws;
      ws.onopen = () => { tries = 0; };
      ws.onmessage = ev => {
        let x; try { x = JSON.parse(ev.data); } catch { return; }
        if (!x || typeof x.from !== 'string' || !x.m) return;
        relayIn('cf:' + x.from, x.m, msg => { if (ws.readyState === 1) ws.send(JSON.stringify({ to: x.from, m: msg })); }, onMsg, onLeave);
      };
      ws.onclose = ev => { if (cfHostSock !== ws || roomCode !== code || ev.code === 4000) return; later(open, Math.min(15000, 1000 * 2 ** tries++)); };
      ws.onerror = () => { };
    };
    open();
  }

  function startRelayHost(code, onMsg, onLeave) {
    cfHost(code, onMsg, onLeave);
    if (mqttOk()) for (const url of BROKERS) {
      let c; try { c = mqttConnect(url); } catch { continue; }
      c.on('connect', () => c.subscribe(TOPIC + code + '/up'));
      c.on('error', () => { });
      c.on('message', (_t, buf) => {
        let m; try { m = JSON.parse(buf.toString()); } catch { return; }
        if (!m.from) return;
        relayIn(m.from, m, msg => { try { c.publish(TOPIC + code + '/down/' + m.from, JSON.stringify(msg)); } catch { } }, onMsg, onLeave);
      });
      relays.push(c);
    }
    every(() => { for (const [id, e] of conns) if (e.relay && Date.now() - e.last > DEAD_AFTER) { conns.delete(id); onLeave(e.pid, id); } }, HEARTBEAT);
  }

  // ---------------- jogador ----------------
  // onOpen pode ser chamado mais de uma vez (ex.: a conexão direta caiu e reconectou pela reserva)
  // simulador de rede ruim (só para testes): Net.debug.drop = 0.3 descarta 30% das mensagens recebidas; delay atrasa/embaralha
  const debug = { drop: 0, delay: 0 };
  function join(code, onOpen, onMsgRaw, onClose, opts = {}) {
    const onMsg = m => {
      if (debug.drop && Math.random() < debug.drop) return;
      if (debug.delay && Math.random() < debug.delay) return setTimeout(() => onMsgRaw(m), 300 + Math.random() * 2000);
      onMsgRaw(m);
    };
    destroy();
    code = code.toUpperCase(); roomCode = code;
    const diag = { signal: false, hostOnSignal: null, sigTried: false, mqttConnected: false };
    let settled = false;
    const fallback = why => {
      if (settled) return; settled = true;
      try { hostConn?.close(); } catch { } hostConn = null;
      console.info('[rede] conexão direta indisponível (' + why + '), usando reserva');
      handlers.mode?.('relay');
      joinCf(code, onOpen, onMsg, onClose, diag, () => oldRelays(code, onOpen, onMsg, onClose, diag));
    };
    if (!window.Peer) return fallback('sem PeerJS');
    peer = new Peer(peerOpts());
    const p = peer;
    later(() => fallback('demorou demais'), opts.forceRelay ? 4000 : cfOk() ? P2P_TIMEOUT_CF : P2P_TIMEOUT);
    p.on('open', () => {
      diag.signal = true;
      if (opts.forceRelay) return fallback('modo compatível');
      hostConn = p.connect(PREFIX + code, { reliable: true });
      hostConn.on('open', () => { if (settled) return; settled = true; mode = 'p2p'; via = 'p2p'; handlers.mode?.('p2p'); onOpen(); });
      hostConn.on('data', onMsg);
      hostConn.on('close', () => {
        if (!settled) return fallback('conexão direta fechou');
        if (mode === 'p2p') { // caiu no meio da partida: continua pela reserva
          mode = null; hostConn = null;
          joinCf(code, onOpen, onMsg, onClose, diag, () => { if (p.open) joinSig(code, onOpen, onMsg, onClose, diag); else if (mqttOk()) joinMqtt(code, onOpen, onMsg, onClose, 0, diag); else onClose(); });
        }
      });
      hostConn.on('error', () => fallback('erro na conexão direta'));
    });
    p.on('error', e => {
      if (e.type === 'peer-unavailable') diag.hostOnSignal = false; // o anfitrião não está no servidor P2P (pode estar só na reserva MQTT)
      if (!settled) return fallback(e.type);
      if (mode === 'relay' && via === 'sig' && e.type === 'peer-unavailable') { sigOff?.(); sigOff = null; joinMqtt(code, onOpen, onMsg, onClose, 0, diag); }
    });
    // o servidor de sinalização derruba o websocket de vez em quando; sem religar, a reserva pela porta 443 morre de vez
    p.on('disconnected', () => { if (peer === p && !p.destroyed) { try { p.reconnect(); } catch { } } });
  }

  // reservas antigas (servidor do PeerJS e MQTT), usadas se o retransmissor da Cloudflare falhar
  function oldRelays(code, onOpen, onMsg, onClose, diag) {
    if (peer?.open && diag.hostOnSignal !== false) joinSig(code, onOpen, onMsg, onClose, diag);
    else joinMqtt(code, onOpen, onMsg, onClose, 0, diag);
  }

  // retransmissor na Cloudflare: WebSocket comum até a "salinha" da sala
  function joinCf(code, onOpen, onMsg, onClose, diag, next) {
    if (!cfOk()) return next();
    mode = 'relay'; via = 'cf'; relayId ||= 'r' + rid();
    let replied = false, opened = false, retries = 0, gaveUp = false;
    const giveUp = () => {
      if (gaveUp) return; gaveUp = true;
      const w = cfSock; cfSock = null; try { w?.close(1000); } catch { }
      if (via === 'cf') next();
    };
    const fail = later(() => { if (!replied) giveUp(); }, REPLY_TIMEOUT);
    const connect = () => {
      if (gaveUp || via !== 'cf') return;
      let ws; try { ws = new WebSocket(cfWs() + '/room/' + code + '?role=peer&id=' + relayId); } catch { return giveUp(); }
      cfSock = ws;
      ws.onopen = () => {
        diag.cfConnected = true;
        onOpen(); // envia o "olá" (de novo, se reconectou)
        if (!opened) { opened = true; const again = every(() => { if (replied || via !== 'cf' || cfSock !== ws) return clearInterval(again); onOpen(); }, 2000); }
      };
      ws.onmessage = ev => {
        if (cfSock !== ws) return;
        let m; try { m = JSON.parse(ev.data); } catch { return; }
        if (!replied) { replied = true; clearTimeout(fail); onRelayReply(onClose); }
        lastHostMsg = Date.now();
        if (!m.pong) onMsg(m);
      };
      ws.onclose = ev => {
        if (cfSock !== ws || via !== 'cf' || gaveUp) return;
        if (!replied) return giveUp();
        if (ev.code === 4001) return; // outra aba/conexão nossa assumiu
        if (retries++ < 8) later(connect, Math.min(5000, 600 * retries));
      };
      ws.onerror = () => { };
    };
    connect();
  }

  function onRelayReply(onClose) {
    lastHostMsg = Date.now();
    const iv = every(() => {
      if (mode !== 'relay') return clearInterval(iv);
      toHostRaw({ ping: 1 });
      if (Date.now() - lastHostMsg > DEAD_AFTER) { clearInterval(iv); mode = null; onClose(); }
    }, HEARTBEAT);
  }

  // reserva 1: servidor de sinalização do PeerJS (porta 443)
  function joinSig(code, onOpen, onMsg, onClose, diag) {
    mode = 'relay'; via = 'sig'; diag.sigTried = true;
    const p = peer, hostId = PREFIX + code;
    let replied = false;
    sigOff = sigListen(p, (src, m) => {
      if (src !== hostId || via !== 'sig') return;
      if (!replied) { replied = true; onRelayReply(onClose); }
      lastHostMsg = Date.now();
      if (m.pong) return;
      onMsg(m);
    });
    onOpen(); // envia o "olá" pela reserva
    // repete o "olá" enquanto não houver resposta (uma resposta perdida no caminho não é reenviada pelo anfitrião)
    const again = every(() => { if (replied || via !== 'sig' || peer !== p) return clearInterval(again); onOpen(); }, 2000);
    later(() => {
      if (replied || via !== 'sig') return;
      sigOff?.(); sigOff = null;
      joinMqtt(code, onOpen, onMsg, onClose, 0, diag); // o anfitrião não respondeu por aqui: tenta os servidores MQTT
    }, REPLY_TIMEOUT);
  }

  // reserva 2: servidores públicos MQTT (portas 8084/8884)
  function joinMqtt(code, onOpen, onMsg, onClose, i, diag) {
    if (!mqttOk() || i >= BROKERS.length) return handlers.error?.(failMessage(diag));
    mode = 'relay'; via = 'mqtt'; relayId ||= 'r' + rid();
    try { relayClient?.end(true); } catch { }
    const c = mqttConnect(BROKERS[i], { reconnectPeriod: 2000 });
    relayClient = c;
    let replied = false, opened = false;
    const next = () => { if (replied || relayClient !== c) return; try { c.end(true); } catch { } joinMqtt(code, onOpen, onMsg, onClose, i + 1, diag); };
    const fail = later(next, REPLY_TIMEOUT + 7000);
    c.on('connect', () => {
      diag.mqttConnected = true;
      c.subscribe(TOPIC + code + '/down/' + relayId, err => {
        if (err || opened) return; opened = true;
        onOpen(); later(next, REPLY_TIMEOUT);
        const again = every(() => { if (replied || relayClient !== c) return clearInterval(again); onOpen(); }, 2000);
      });
    });
    c.on('message', (_t, buf) => {
      if (relayClient !== c) return;
      let m; try { m = JSON.parse(buf.toString()); } catch { return; }
      if (!replied) { replied = true; clearTimeout(fail); onRelayReply(onClose); }
      lastHostMsg = Date.now();
      if (!m.pong) onMsg(m);
    });
    c.on('error', () => { if (!opened) { clearTimeout(fail); next(); } });
  }

  function failMessage(d) {
    if (d.hostOnSignal === false && (d.signal || d.mqttConnected))
      return 'Sala não encontrada. Confira o código — e peça ao anfitrião para recarregar a página do jogo (Ctrl+F5) e criar a sala de novo.';
    if (!d.signal && !d.mqttConnected && !d.cfConnected)
      return 'Sua rede bloqueou todas as formas de conexão do jogo. Tente outra rede (ou o 4G) e use "Testar minha conexão" para ver o que está bloqueado.';
    return 'O anfitrião não respondeu. Peça para ele recarregar a página do jogo (Ctrl+F5), criar a sala de novo e te passar o código novo.';
  }

  function friendly(e) {
    return ({
      'peer-unavailable': 'Sala não encontrada. Confira o código.',
      'network': 'Falha de rede ao conectar no servidor de sinalização.',
      'server-error': 'Servidor de sinalização indisponível. Tente de novo.',
      'browser-incompatible': 'Seu navegador não suporta WebRTC.',
    })[e.type] || ('Erro de conexão: ' + (e.type || e.message));
  }

  function toHostRaw(obj) {
    if (via === 'cf') { if (cfSock?.readyState === 1) { try { cfSock.send(JSON.stringify(obj)); } catch { } } return; }
    if (via === 'sig') return sigSend(peer, PREFIX + roomCode, obj);
    if (via === 'mqtt' && relayClient && relayId) { try { relayClient.publish(TOPIC + roomCode + '/up', JSON.stringify({ from: relayId, ...obj }), { qos: obj.bye ? 1 : 0 }); } catch { } }
  }
  function toHost(msg) {
    if (mode === 'p2p' && hostConn?.open) return hostConn.send(msg);
    if (mode === 'relay') toHostRaw({ msg });
  }
  const toPeer = (id, msg) => conns.get(id)?.send?.(msg);
  const broadcast = msg => conns.forEach(c => c.pid && c.send?.(msg));
  // mensagem diferente para cada jogador (jogos com informação escondida)
  const broadcastWith = make => conns.forEach(c => c.pid && c.send?.(make(c.pid)));
  const pidOf = id => conns.get(id)?.pid || null;
  const bindPeer = (id, pid) => { const c = conns.get(id); if (c) c.pid = pid; };
  const peerOf = pid => [...conns.entries()].find(([, c]) => c.pid === pid)?.[0];
  const kick = pid => { const k = peerOf(pid); if (k) { toPeer(k, { t: 'kicked' }); setTimeout(() => { const c = conns.get(k); conns.delete(k); c?.close(); }, 300); } };
  const isRelayPeer = id => !!conns.get(id)?.relay;

  // ---------- diagnóstico de rede ("Testar minha conexão") ----------
  async function diagnose(onStep) {
    const out = [];
    const step = (name, ok, info = '') => { out.push({ name, ok, info }); onStep?.(out); };
    const timeout = (p, ms) => Promise.race([p, new Promise(r => setTimeout(() => r('timeout'), ms))]);
    // 0) retransmissor da Cloudflare
    if (cfOk()) {
      const cf = await timeout(fetch(cfBase() + '/health', { cache: 'no-store' }).then(r => (r.ok ? 'ok' : 'HTTP ' + r.status)).catch(e => e?.message || 'erro'), 6000);
      step('Retransmissor do jogo (Cloudflare) — funciona até em 4G e CGNAT', cf === 'ok', cf === 'ok' ? '' : String(cf));
    }
    // 1) servidor P2P / reserva pela porta 443
    let tp = null;
    const sig = await timeout(new Promise(res => { try { tp = new Peer({ debug: 0 }); tp.on('open', () => res('ok')); tp.on('error', e => res(e.type)); } catch (e) { res('erro'); } }), 8000);
    step('Servidor do jogo (porta 443) — sala e reserva principal', sig === 'ok', sig === 'ok' ? '' : String(sig));
    // 2) reserva pela porta 443 (eco para si mesmo, fatiado)
    if (sig === 'ok') {
      const echo = await timeout(new Promise(res => { const off = sigListen(tp, (src, m) => { if (m.echo) { off(); res('ok'); } }); sigSend(tp, tp.id, { echo: 'x'.repeat(20000) }); }), 6000);
      step('Reserva pela porta 443 (mensagens grandes)', echo === 'ok', echo === 'ok' ? '' : String(echo));
    }
    try { tp?.destroy(); } catch { }
    // 3) STUN: descobre o IP público (necessário para conexão direta)
    const stun = await timeout(new Promise(res => {
      try {
        const pc = new RTCPeerConnection({ iceServers: ICE.slice(0, 2) }); const types = new Set();
        pc.createDataChannel('x'); pc.onicecandidate = e => { if (e.candidate) types.add((e.candidate.candidate.match(/typ (\w+)/) || [])[1]); else { pc.close(); res(types); } };
        pc.createOffer().then(o => pc.setLocalDescription(o)); setTimeout(() => { try { pc.close(); } catch { } res(types); }, 5000);
      } catch { res(new Set()); }
    }), 7000);
    const hasSrflx = stun instanceof Set && stun.has('srflx');
    step('Conexão direta (STUN / IP público)', hasSrflx, hasSrflx ? '' : 'sem IP público — conexão direta provavelmente vai falhar, mas a reserva resolve');
    // 4) servidores MQTT
    for (const url of BROKERS) {
      const r = await timeout(new Promise(res => { if (!mqttOk()) return res('biblioteca não carregou'); const c = mqttConnect(url, { reconnectPeriod: 0, connectTimeout: 6000 }); c.on('connect', () => { c.end(true); res('ok'); }); c.on('error', e => { c.end(true); res(e?.message || 'erro'); }); }), 8000);
      step('Reserva extra ' + url.replace('wss://', '').replace('/mqtt', ''), r === 'ok', r === 'ok' ? '' : String(r));
    }
    return out;
  }

  return { debug, host, join, destroy, toHost, toPeer, broadcast, broadcastWith, pidOf, bindPeer, kick, isRelayPeer, diagnose, on: (ev, f) => (handlers[ev] = f), get mode() { return mode; }, get via() { return via; } };
})();
