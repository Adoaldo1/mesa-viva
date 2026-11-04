// ===== Mesa Viva — retransmissor na Cloudflare (Worker + Durable Object) =====
// Cada código de sala vira uma "salinha" (Durable Object) que só repassa mensagens:
//   jogador → salinha → anfitrião   e   anfitrião → salinha → jogador.
// Não conhece regra de jogo. Usa a API de hibernação: sem mensagens, a salinha dorme e não gasta tempo.
import { DurableObject } from 'cloudflare:workers';

// só aceita conexões vindas do site (e do arquivo local / testes em localhost)
const ORIGINS = [/^https:\/\/guicalheira\.github\.io$/, /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/, /^null$/];
const MAX_MSG = 256 * 1024;   // tamanho máximo de uma mensagem
const MAX_SOCKETS = 24;       // conexões por sala

const cors = { 'access-control-allow-origin': '*' };

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === '/health') return new Response('ok', { headers: cors });
    const m = url.pathname.match(/^\/room\/([A-Z0-9]{4,8})$/);
    if (!m) return new Response('não encontrado', { status: 404, headers: cors });
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('esperava websocket', { status: 426 });
    const origin = req.headers.get('Origin') || 'null';
    if (!ORIGINS.some(r => r.test(origin))) return new Response('origem não permitida', { status: 403 });
    const role = url.searchParams.get('role'), id = url.searchParams.get('id') || '';
    if (!['host', 'peer'].includes(role) || !/^[\w-]{1,40}$/.test(id)) return new Response('parâmetros inválidos', { status: 400 });
    try { return await env.ROOMS.get(env.ROOMS.idFromName(m[1])).fetch(req); }
    catch (e) { console.log('erro na sala', e?.stack || e); return new Response('erro', { status: 500 }); }
  },
};

export class Room extends DurableObject {
  async fetch(req) {
    try { return this.open(req); } catch (e) { console.log('erro ao abrir', e?.stack || e); return new Response('erro', { status: 500 }); }
  }
  open(req) {
    const url = new URL(req.url), role = url.searchParams.get('role'), id = url.searchParams.get('id');
    if (this.ctx.getWebSockets().length >= MAX_SOCKETS) return new Response('sala cheia', { status: 429 });
    const [client, server] = Object.values(new WebSocketPair());
    // um anfitrião por sala; um socket por jogador (reconectar substitui o antigo)
    const old = this.ctx.getWebSockets(role === 'host' ? 'host' : 'p:' + id);
    this.ctx.acceptWebSocket(server, role === 'host' ? ['host'] : ['peer', 'p:' + id]);
    server.serializeAttachment({ role, id });
    for (const ws of old) { try { ws.close(role === 'host' ? 4000 : 4001, 'substituído'); } catch { } }
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(ws, data) {
    if (typeof data !== 'string' || data.length > MAX_MSG) return;
    let obj; try { obj = JSON.parse(data); } catch { return; }
    const me = ws.deserializeAttachment();
    if (me.role === 'peer') {
      // jogador → anfitrião, com a identificação de quem mandou
      for (const h of this.ctx.getWebSockets('host')) { try { h.send(JSON.stringify({ from: me.id, m: obj })); } catch { } }
    } else if (obj && typeof obj.to === 'string') {
      // anfitrião → um jogador
      const out = JSON.stringify(obj.m);
      for (const p of this.ctx.getWebSockets('p:' + obj.to)) { try { p.send(out); } catch { } }
    }
  }

  webSocketClose(ws, code, reason) { this.left(ws); try { ws.close(code === 1005 ? 1000 : code, reason); } catch { } }
  webSocketError(ws) { this.left(ws); }

  left(ws) {
    const me = ws.deserializeAttachment(); if (!me || me.role !== 'peer') return;
    // avisa o anfitrião, a não ser que o jogador já tenha reconectado por outro socket
    if (this.ctx.getWebSockets('p:' + me.id).some(s => s !== ws)) return;
    for (const h of this.ctx.getWebSockets('host')) { try { h.send(JSON.stringify({ from: me.id, m: { bye: 1 } })); } catch { } }
  }
}
