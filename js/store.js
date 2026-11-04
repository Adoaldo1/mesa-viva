// ===== Autenticação simples + perfis + ranking (localStorage) =====
const Store = (() => {
  const K_USERS = 'mesaviva.users', K_SESSION = 'mesaviva.session', K_BOARD = 'mesaviva.leaderboard', K_RECORDED = 'mesaviva.recordedGames';
  const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { console.warn('storage', e); } };

  const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  async function hashPw(pw, salt) {
    if (crypto?.subtle) {
      const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']);
      const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: new TextEncoder().encode(salt), iterations: 120000, hash: 'SHA-256' }, key, 256);
      return hex(bits);
    }
    // fallback (contexto inseguro): hash FNV iterado — suficiente para um perfil local
    let h = 2166136261; const s = salt + pw;
    for (let r = 0; r < 5000; r++) for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i) + r; h = Math.imul(h, 16777619) >>> 0; }
    return 'f' + h.toString(16);
  }

  const normalize = u => u.trim().toLowerCase();
  const defaultProfile = username => ({
    username, displayName: username, char: CHARACTERS[Math.floor(Math.random() * CHARACTERS.length)].id,
    color: null, emblem: '🎲', title: TITLES[0], frame: 'simple', catchphrase: 'Foi tudo estratégia!',
    stats: { wins: 0, games: 0, best: 0 }, createdAt: Date.now(),
  });

  async function register(username, password) {
    const u = normalize(username);
    if (!/^[a-z0-9_.-]{3,16}$/.test(u)) throw new Error('Usuário: 3–16 caracteres (letras, números, _ . -).');
    if (password.length < 4) throw new Error('Senha precisa de pelo menos 4 caracteres.');
    const users = read(K_USERS, {});
    if (users[u]) throw new Error('Esse usuário já existe neste dispositivo.');
    const salt = Math.random().toString(36).slice(2) + Date.now().toString(36);
    users[u] = { salt, hash: await hashPw(password, salt), profile: defaultProfile(username.trim()) };
    write(K_USERS, users); write(K_SESSION, u);
    return users[u].profile;
  }
  async function login(username, password) {
    const u = normalize(username); const users = read(K_USERS, {});
    const rec = users[u];
    if (!rec || rec.hash !== await hashPw(password, rec.salt)) throw new Error('Usuário ou senha incorretos.');
    write(K_SESSION, u); return rec.profile;
  }
  const logout = () => localStorage.removeItem(K_SESSION);
  const profileOf = username => read(K_USERS, {})[normalize(username)]?.profile || null;
  function current() { const u = read(K_SESSION, null); const users = read(K_USERS, {}); return u && users[u] ? users[u].profile : null; }
  function saveProfile(profile) {
    const users = read(K_USERS, {}); const u = normalize(profile.username);
    if (!users[u]) return; users[u].profile = profile; write(K_USERS, users);
    mergeLeaderboard([publicProfile(profile)]);
  }
  const publicProfile = p => ({ username: p.username, displayName: p.displayName, char: p.char, color: p.color, emblem: p.emblem, title: p.title, frame: p.frame, catchphrase: p.catchphrase, stats: p.stats });

  // exportar / importar perfil (levar para outro dispositivo)
  function exportProfile() { const u = read(K_SESSION, null); const users = read(K_USERS, {}); return u ? JSON.stringify({ mesaviva: 1, user: u, rec: users[u] }) : null; }
  function importProfile(text) {
    const d = JSON.parse(text); if (!d.mesaviva || !d.rec?.hash) throw new Error('Arquivo inválido.');
    const users = read(K_USERS, {}); users[d.user] = d.rec; write(K_USERS, users); return d.user;
  }

  // ranking: todos os jogadores já encontrados (stats autoritativas de cada perfil, mescladas pelo maior valor)
  function mergeLeaderboard(list) {
    const b = read(K_BOARD, {});
    for (const p of list) {
      if (!p?.username || p.bot) continue;
      const k = normalize(p.username), o = b[k];
      const s = p.stats || { wins: 0, games: 0, best: 0 };
      b[k] = {
        username: p.username, displayName: p.displayName, char: p.char, color: p.color, emblem: p.emblem, title: p.title, frame: p.frame,
        wins: Math.max(s.wins, o?.wins || 0), games: Math.max(s.games, o?.games || 0), best: Math.max(s.best || 0, o?.best || 0), lastSeen: Date.now(),
      };
    }
    write(K_BOARD, b);
  }
  const leaderboard = () => Object.values(read(K_BOARD, {})).sort((a, b) => b.wins - a.wins || (b.wins / (b.games || 1)) - (a.wins / (a.games || 1)) || b.best - a.best);

  // registrar resultado (uma vez por partida)
  function recordGame(gameId, result, roomPlayers, me) {
    const done = read(K_RECORDED, []);
    const meKey = me ? gameId + ':' + normalize(me.username) : null;
    const boardDone = done.includes(gameId), meDone = !meKey || done.includes(meKey);
    if (boardDone && meDone) return false;
    if (!boardDone) done.push(gameId); if (!meDone) done.push(meKey);
    write(K_RECORDED, done.slice(-400));
    const b = read(K_BOARD, {});
    if (!boardDone) for (const rp of roomPlayers) {
      if (rp.bot) continue;
      const k = normalize(rp.id); const e = b[k] || { username: rp.id, displayName: rp.name, char: rp.char, wins: 0, games: 0, best: 0 };
      const r = result.ranking.find(x => x.id === rp.id);
      e.games++; if (result.winner === rp.id) e.wins++; e.best = Math.max(e.best || 0, r?.worth || 0);
      Object.assign(e, { displayName: rp.name, char: rp.char, color: rp.color, emblem: rp.emblem, title: rp.title, frame: rp.frame, lastSeen: Date.now() });
      b[k] = e;
    }
    write(K_BOARD, b);
    if (me && !meDone) {
      const r = result.ranking.find(x => x.id === me.username);
      if (r) { me.stats.games++; if (result.winner === me.username) me.stats.wins++; me.stats.best = Math.max(me.stats.best || 0, r.worth); saveProfile(me); }
    }
    return true;
  }

  return { register, login, logout, current, profileOf, saveProfile, publicProfile, exportProfile, importProfile, mergeLeaderboard, leaderboard, recordGame };
})();
