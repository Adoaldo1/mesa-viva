// ===== Rede: P2P (PeerJS/WebRTC) com reserva automática por servidor (MQTT sobre WebSocket seguro) =====
// O anfitrião é autoritativo. Cada jogador tenta primeiro a conexão direta; se a rede dele não permitir
// (NAT restritivo, CGNAT, UDP bloqueado…), as mensagens passam a ir por um servidor público de mensagens.
// O anfitrião escuta nos dois caminhos ao mesmo tempo, então todos jogam juntos na mesma sala.
const Net = (() => {
  const PREFIX = 'mesaviva-v1-', TOPIC = 'mesaviva/v1/';
  const P2P_TIMEOUT = 9000, RELAY_REPLY_TIMEOUT = 7000, HEARTBEAT = 5000, DEAD_AFTER = 20000;
  const ICE = [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] },
    { urls: 'stun:stun.cloudflare.com:3478' },
    { urls: ['turn:eu-0.turn.peerjs.com:3478', 'turn:us-0.turn.peerjs.com:3478'], username: 'peerjs', credential: 'peerjsp' },
  ];
  const BROKERS = ['wss://broker.emqx.io:8084/mqtt', 'wss://broker.hivemq.com:8884/mqtt'];
  const peerOpts = () => ({ debug: 1, config: { iceServers: ICE } });
  const rid = () => Math.random().toString(36).slice(2, 10);

  let peer = null, hostConn = null, conns = new Map(); // id -> {send, close, pid, relay}
  let handlers = {}, mode = null, relays = [], timers = [];
  let relayClient = null, relayId = null, lastHostMsg = 0, roomCode = null;

  const genCode = () => Array.from({ length: 5 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');
  const later = (fn, ms) => { const t = setTimeout(fn, ms); timers.push(t); return t; };
  const every = (fn, ms) => { const t = setInterval(fn, ms); timers.push(t); return t; };
  const mqttOk = () => !!window.mqtt;
  function mqttConnect(url, extra = {}) {
    return window.mqtt.connect(url, { clientId: 'mv_' + rid(), clean: true, connectTimeout: 7000, reconnectPeriod: 3000, keepalive: 30, ...extra });
  }

  function destroy() {
    // avisa o anfitrião que saiu; só fecha a conexão depois que o aviso foi enviado
    const rc = relayClient;
    if (mode === 'relay' && rc && relayId && roomCode) {
      try { rc.publish(TOPIC + roomCode + '/up', JSON.stringify({ from: relayId, bye: 1 }), { qos: 1 }, () => { try { rc.end(false); } catch { } }); } catch { try { rc.end(true); } catch { } }
      setTimeout(() => { try { rc.end(true); } catch { } }, 3000);
    } else { try { rc?.end(true); } catch { } }
    timers.forEach(t => { clearTimeout(t); clearInterval(t); }); timers = [];
    try { peer?.destroy(); } catch { }
    for (const c of relays) { try { c.end(true); } catch { } }
    peer = null; hostConn = null; conns.clear(); relays = []; relayClient = null; relayId = null; mode = null; roomCode = null;
  }

  // ---------------- anfitrião ----------------
  function host(onReady, onMsg, onLeave, tries = 0) {
    destroy();
    const code = genCode(); roomCode = code;
    let ready = false;
    const go = () => { if (ready) return; ready = true; startRelayHost(code, onMsg, onLeave); onReady(code); };
    if (!window.Peer) return go(); // sem PeerJS: sala só pelo servidor de reserva
    peer = new Peer(PREFIX + code, peerOpts());
    peer.on('open', go);
    peer.on('connection', conn => {
      const e = { pid: null, relay: false, send: m => conn.open && conn.send(m), close: () => conn.close() };
      conn.on('open', () => conns.set(conn.peer, e));
      conn.on('data', d => onMsg(conn.peer, d));
      conn.on('close', () => { if (conns.get(conn.peer) === e) { conns.delete(conn.peer); onLeave(e.pid); } });
      conn.on('error', () => { });
    });
    peer.on('error', e => {
      if (e.type === 'unavailable-id' && tries < 5 && !ready) return host(onReady, onMsg, onLeave, tries + 1);
      // a rede do anfitrião não alcança o servidor P2P: segue só com o servidor de reserva
      if (!ready && ['network', 'server-error', 'socket-error', 'socket-closed'].includes(e.type)) return go();
      if (!ready) handlers.error?.(friendly(e));
    });
    peer.on('disconnected', () => { try { peer.reconnect(); } catch { } });
    later(() => { if (!ready) { try { peer?.destroy(); } catch { } peer = null; go(); } }, P2P_TIMEOUT); // servidor P2P lento/inacessível
  }

  function startRelayHost(code, onMsg, onLeave) {
    if (!mqttOk()) return;
    for (const url of BROKERS) {
      let c; try { c = mqttConnect(url); } catch { continue; }
      c.on('connect', () => c.subscribe(TOPIC + code + '/up'));
      c.on('error', () => { });
      c.on('message', (_t, buf) => {
        let m; try { m = JSON.parse(buf.toString()); } catch { return; }
        const id = m.from; if (!id) return;
        let e = conns.get(id);
        if (m.bye) { if (e) { conns.delete(id); onLeave(e.pid); } return; }
        if (!e) {
          e = { pid: null, relay: true, client: c, last: 0, send: msg => { try { e.client.publish(TOPIC + code + '/down/' + id, JSON.stringify(msg)); } catch { } }, close: () => conns.delete(id) };
          conns.set(id, e);
        }
        e.client = c; e.last = Date.now(); // responde pelo mesmo servidor que o jogador está usando
        if (m.ping) return e.send({ pong: 1 });
        if (m.msg) onMsg(id, m.msg);
      });
      relays.push(c);
    }
    every(() => { for (const [id, e] of conns) if (e.relay && Date.now() - e.last > DEAD_AFTER) { conns.delete(id); onLeave(e.pid); } }, HEARTBEAT);
  }

  // ---------------- jogador ----------------
  // onOpen pode ser chamado mais de uma vez (ex.: a conexão direta caiu e reconectou pela reserva)
  function join(code, onOpen, onMsg, onClose, opts = {}) {
    destroy();
    code = code.toUpperCase(); roomCode = code;
    let settled = false;
    const viaRelay = (why) => {
      if (settled) return; settled = true;
      try { peer?.destroy(); } catch { } peer = null; hostConn = null;
      console.info('[rede] usando servidor de reserva:', why);
      joinRelay(code, onOpen, onMsg, onClose, 0);
    };
    if (opts.forceRelay || !window.Peer) return viaRelay(opts.forceRelay ? 'modo compatível' : 'sem PeerJS');
    peer = new Peer(peerOpts());
    later(() => viaRelay('conexão direta demorou demais'), P2P_TIMEOUT);
    peer.on('open', () => {
      hostConn = peer.connect(PREFIX + code, { reliable: true });
      hostConn.on('open', () => { if (settled) return; settled = true; mode = 'p2p'; handlers.mode?.(mode); onOpen(); });
      hostConn.on('data', onMsg);
      hostConn.on('close', () => {
        if (!settled) return viaRelay('conexão direta fechou');
        if (mode === 'p2p') { // caiu no meio do jogo: tenta continuar pela reserva antes de desistir
          mode = null; hostConn = null;
          if (mqttOk()) joinRelay(code, onOpen, onMsg, onClose, 0); else onClose();
        }
      });
      hostConn.on('error', () => viaRelay('erro na conexão direta'));
    });
    peer.on('error', e => { if (!settled) viaRelay(e.type); });
  }

  function joinRelay(code, onOpen, onMsg, onClose, i) {
    if (!mqttOk()) return handlers.error?.('Não foi possível conectar à sala (rede bloqueada e servidor de reserva indisponível).');
    if (i >= BROKERS.length) return handlers.error?.('Sala não encontrada, ou sua rede bloqueou todas as formas de conexão.');
    mode = 'relay'; relayId ||= 'r' + rid();
    try { relayClient?.end(true); } catch { }
    const c = mqttConnect(BROKERS[i], { reconnectPeriod: 2000 });
    relayClient = c;
    let gotReply = false, opened = false;
    const next = () => { if (gotReply || relayClient !== c) return; try { c.end(true); } catch { } joinRelay(code, onOpen, onMsg, onClose, i + 1); };
    const fail = later(next, RELAY_REPLY_TIMEOUT + 7000);
    c.on('connect', () => {
      c.subscribe(TOPIC + code + '/down/' + relayId, err => {
        if (err || opened) return; opened = true;
        lastHostMsg = Date.now(); handlers.mode?.('relay'); onOpen();
        later(next, RELAY_REPLY_TIMEOUT); // o anfitrião não respondeu por este servidor: tenta o próximo
      });
    });
    c.on('message', (_t, buf) => {
      if (relayClient !== c) return;
      let m; try { m = JSON.parse(buf.toString()); } catch { return; }
      if (!gotReply) { gotReply = true; clearTimeout(fail); startClientHeartbeat(c, code, onClose); }
      lastHostMsg = Date.now();
      if (!m.pong) onMsg(m);
    });
    c.on('error', () => { if (!opened) { clearTimeout(fail); next(); } });
  }

  function startClientHeartbeat(c, code, onClose) {
    const iv = every(() => {
      if (relayClient !== c) return clearInterval(iv);
      try { c.publish(TOPIC + code + '/up', JSON.stringify({ from: relayId, ping: 1 })); } catch { }
      if (Date.now() - lastHostMsg > DEAD_AFTER) { clearInterval(iv); onClose(); }
    }, HEARTBEAT);
  }

  function friendly(e) {
    return ({
      'peer-unavailable': 'Sala não encontrada. Confira o código.',
      'network': 'Falha de rede ao conectar no servidor de sinalização.',
      'server-error': 'Servidor de sinalização indisponível. Tente de novo.',
      'browser-incompatible': 'Seu navegador não suporta WebRTC.',
    })[e.type] || ('Erro de conexão: ' + (e.type || e.message));
  }

  function toHost(msg) {
    if (mode === 'p2p' && hostConn?.open) return hostConn.send(msg);
    if (mode === 'relay' && relayClient && relayId) { try { relayClient.publish(TOPIC + roomCode + '/up', JSON.stringify({ from: relayId, msg })); } catch { } }
  }
  const toPeer = (id, msg) => conns.get(id)?.send(msg);
  const broadcast = msg => conns.forEach(c => c.pid && c.send(msg));
  const bindPeer = (id, pid) => { const c = conns.get(id); if (c) c.pid = pid; };
  const peerOf = pid => [...conns.entries()].find(([, c]) => c.pid === pid)?.[0];
  const kick = pid => { const k = peerOf(pid); if (k) { toPeer(k, { t: 'kicked' }); setTimeout(() => { const c = conns.get(k); conns.delete(k); c?.close(); }, 300); } };
  const isRelayPeer = id => !!conns.get(id)?.relay;

  return { host, join, destroy, toHost, toPeer, broadcast, bindPeer, kick, isRelayPeer, on: (ev, f) => (handlers[ev] = f), get mode() { return mode; } };
})();
