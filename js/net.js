// ===== Rede P2P (PeerJS / WebRTC). O anfitrião é autoritativo. =====
const Net = (() => {
  const PREFIX = 'mesaviva-v1-';
  let peer = null, hostConn = null, conns = new Map(); // peerId -> {conn, pid}
  let handlers = {};
  const genCode = () => Array.from({ length: 5 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');

  function destroy() { try { peer?.destroy(); } catch { } peer = null; hostConn = null; conns.clear(); }

  function host(onReady, onMsg, onLeave, tries = 0) {
    destroy();
    const code = genCode();
    peer = new Peer(PREFIX + code, { debug: 1 });
    peer.on('open', () => onReady(code));
    peer.on('connection', conn => {
      conn.on('open', () => conns.set(conn.peer, { conn, pid: null }));
      conn.on('data', d => onMsg(conn.peer, d));
      conn.on('close', () => { const c = conns.get(conn.peer); conns.delete(conn.peer); onLeave(c?.pid); });
      conn.on('error', () => { });
    });
    peer.on('error', e => {
      if (e.type === 'unavailable-id' && tries < 5) return host(onReady, onMsg, onLeave, tries + 1);
      handlers.error?.(friendly(e));
    });
    peer.on('disconnected', () => { try { peer.reconnect(); } catch { } });
  }

  function join(code, onOpen, onMsg, onClose) {
    destroy();
    peer = new Peer({ debug: 1 });
    peer.on('open', () => {
      hostConn = peer.connect(PREFIX + code.toUpperCase(), { reliable: true });
      hostConn.on('open', onOpen);
      hostConn.on('data', onMsg);
      hostConn.on('close', onClose);
    });
    peer.on('error', e => handlers.error?.(friendly(e)));
  }

  function friendly(e) {
    return ({
      'peer-unavailable': 'Sala não encontrada. Confira o código.',
      'network': 'Falha de rede ao conectar no servidor de sinalização.',
      'server-error': 'Servidor de sinalização indisponível. Tente de novo.',
      'browser-incompatible': 'Seu navegador não suporta WebRTC.',
    })[e.type] || ('Erro de conexão: ' + (e.type || e.message));
  }

  const toHost = msg => hostConn?.open && hostConn.send(msg);
  const toPeer = (peerId, msg) => { const c = conns.get(peerId); c?.conn.open && c.conn.send(msg); };
  const broadcast = msg => conns.forEach(c => c.pid && c.conn.open && c.conn.send(msg));
  const bindPeer = (peerId, pid) => { const c = conns.get(peerId); if (c) c.pid = pid; };
  const peerOf = pid => [...conns.entries()].find(([, c]) => c.pid === pid)?.[0];
  const kick = pid => { const k = peerOf(pid); if (k) { toPeer(k, { t: 'kicked' }); setTimeout(() => conns.get(k)?.conn.close(), 300); } };

  return { host, join, destroy, toHost, toPeer, broadcast, bindPeer, kick, on: (ev, f) => (handlers[ev] = f) };
})();
