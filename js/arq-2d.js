// ===== Arquipélago — tabuleiro 2D ilustrado (SVG) =====
// Mapa pintado visto de cima, na mesma linguagem do diorama 3D: as mesmas texturas dos biomas, luz vindo do
// alto à esquerda (relevo nos hexágonos e sombras projetadas), praia e espuma em volta da ilha, mar com profundidade.
// Camadas: fixa (mar, terrenos, cenário, fichas, mercados — refeita só quando muda o mapa) e viva (peças, tempestade,
// destaques). A interface recebe os cliques por handlers.pick({kind: 'vertex'|'edge'|'hex', id}).
const ArqBoard2D = (() => {
  const K = 100; // unidades da grade → pixels do SVG
  const P = n => (+n * K).toFixed(1);
  let root = null, svg = null, mapKey = null, handlers = {}, last = null, hoverHex = null;
  const TERRAIN = {
    mata: { fill: '#3f8a46', dark: '#2a5f30', name: 'Mata', tex: 'grama', tint: '#7fbf6a' },
    barreiro: { fill: '#c46a3f', dark: '#8e4627', name: 'Barreiro', tex: 'argila', tint: '#f0b090' },
    algodoal: { fill: '#e9e1c4', dark: '#b7ab83', name: 'Algodoal', tex: 'terra', tint: '#e8c8a0' },
    pedreira: { fill: '#8f9198', dark: '#5f6168', name: 'Pedreira', tex: 'rocha', tint: '#a8acb8' },
    vulcao: { fill: '#4a3a34', dark: '#2c211d', name: 'Vulcão', tex: 'basalto', tint: '#a09090' },
    cardume: { fill: '#2b7f96', dark: '#1d5b6c', name: 'Cardume', tex: 'areia', tint: '#5fc8c8' },
  };
  const RES_ICON = { madeira: '🪵', argila: '🧱', algodao: '☁️', pedra: '🪨', peixe: '🐟', any: '⚓' };
  const TEXS = ['grama', 'terra', 'argila', 'rocha', 'areia', 'basalto'];

  // rand determinístico por hexágono (a ilustração não muda a cada redesenho)
  const rng = seed => { let s = (seed * 9301 + 49297) % 233280; return () => (s = (s * 9301 + 49297) % 233280) / 233280; };
  const hexPts = (x, y, r) => Array.from({ length: 6 }, (_, i) => { const a = Math.PI / 180 * (60 * i - 30); return `${P(x + r * Math.cos(a))},${P(y + r * Math.sin(a))}`; }).join(' ');
  const insideHex = (lx, ly, m) => [0, 60, 120, 180, 240, 300].every(d => lx * Math.cos(d * Math.PI / 180) + ly * Math.sin(d * Math.PI / 180) < .866 - m);
  const pick = (R, h, n, margin, avoid, fn) => { let k = 0, t = 0; while (k < n && t++ < n * 40) { const lx = (R() - .5) * 1.8, ly = (R() - .5) * 1.6; if (!insideHex(lx, ly, margin) || Math.hypot(lx, ly) < avoid) continue; fn(h.x + lx, h.y + ly, lx, ly); k++; } };

  // ---------- elementos ilustrados (vistos de cima, luz do alto à esquerda, sombra para baixo à direita) ----------
  const shadow = (x, y, rx, ry = rx * .7) => `<ellipse cx="${P(x + rx * .35)}" cy="${P(y + rx * .45)}" rx="${P(rx)}" ry="${P(ry)}" fill="#0b1a10" opacity=".32"/>`;
  function tree(x, y, s, R, pal = ['#24602c', '#2f7a3a', '#55a04a']) {
    const r = .12 * s, j = () => (R() - .5) * r * .5;
    return shadow(x, y, r * 1.05) + `<circle cx="${P(x)}" cy="${P(y)}" r="${P(r)}" fill="${pal[0]}"/>`
      + `<circle cx="${P(x - r * .2 + j() * .3)}" cy="${P(y - r * .22)}" r="${P(r * .78)}" fill="${pal[1]}"/>`
      + `<circle cx="${P(x - r * .38)}" cy="${P(y - r * .42)}" r="${P(r * .38)}" fill="${pal[2]}"/>`;
  }
  function palm(x, y, s, R) {
    let out = shadow(x, y, .1 * s, .06 * s), a0 = R() * 6.3;
    for (let k = 0; k < 7; k++) { const a = a0 + k * 6.283 / 7, L = .13 * s, cx = x + Math.cos(a) * L * .5, cy = y + Math.sin(a) * L * .5; out += `<ellipse cx="${P(cx)}" cy="${P(cy)}" rx="${P(L * .55)}" ry="${P(L * .16)}" transform="rotate(${(a * 180 / Math.PI).toFixed(0)} ${P(cx)} ${P(cy)})" fill="${k % 2 ? '#3f8f3a' : '#55a848'}" stroke="#2a6a2c" stroke-width="1.5"/>`; }
    return out + `<circle cx="${P(x)}" cy="${P(y)}" r="${P(.025 * s)}" fill="#6b4a2a"/>`;
  }
  function rock(x, y, s, R, light = '#a8acb4', dark = '#6c7078') {
    const n = 6, pts = []; for (let k = 0; k < n; k++) { const a = k * 6.283 / n + R() * .5, rr = .07 * s * (.75 + R() * .5); pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr * .8]); }
    const poly = pts.map(([a, b]) => `${P(a)},${P(b)}`).join(' '), top = pts.slice(2, 6).map(([a, b]) => `${P(a)},${P(b)}`).join(' ');
    return shadow(x, y, .07 * s) + `<polygon points="${poly}" fill="${dark}" stroke="#3a3c42" stroke-width="2" stroke-linejoin="round"/><polygon points="${top} ${P(x)},${P(y)}" fill="${light}"/>`;
  }
  function cottonBush(x, y, s, young) {
    const r = .035 * s;
    return `<circle cx="${P(x + r * .3)}" cy="${P(y + r * .4)}" r="${P(r)}" fill="#1a2a10" opacity=".25"/><circle cx="${P(x)}" cy="${P(y)}" r="${P(r)}" fill="${young ? '#8fbc4a' : '#5f8a3a'}"/>`
      + (young ? '' : `<circle cx="${P(x - r * .3)}" cy="${P(y - r * .3)}" r="${P(r * .42)}" fill="#fffdf4"/><circle cx="${P(x + r * .35)}" cy="${P(y - r * .1)}" r="${P(r * .36)}" fill="#f6f3e6"/><circle cx="${P(x)}" cy="${P(y + r * .35)}" r="${P(r * .32)}" fill="#ffffff"/>`);
  }
  function bricks(x, y, s) { let o = shadow(x, y, .06 * s, .04 * s); for (let k = 0; k < 3; k++) o += `<rect x="${P(x - .055 * s + k * .03 * s)}" y="${P(y - .03 * s - k * .012 * s)}" width="${P(.06 * s)}" height="${P(.03 * s)}" rx="2" fill="${k % 2 ? '#a3502c' : '#b85e34'}" stroke="#6b2f16" stroke-width="1.6"/>`; return o; }

  function decorate(t, h) {
    const R = rng(h.id * 13 + 5), x = h.x, y = h.y, avoid = t.num ? .36 : .05;
    let out = '';
    if (t.terrain === 'mata') {
      for (let k = 0; k < 22; k++) { const a = R() * 6.3, d = .12 + R() * .55, lx = Math.cos(a) * d, ly = Math.sin(a) * d * .9; if (!insideHex(lx, ly, .12) || Math.hypot(lx, ly) < avoid) continue; out += R() < .35 ? palm(x + lx, y + ly, 1.15 + R() * .45, R) : tree(x + lx, y + ly, 1.05 + R() * .6, R, R() < .3 ? ['#4f7a24', '#6f9e34', '#9cc04a'] : undefined); }
      pick(R, h, 10, .06, avoid, (px, py) => { out += `<circle cx="${P(px)}" cy="${P(py)}" r="${P(.012)}" fill="${['#ffffff', '#ffd84a', '#f08ad0'][Math.floor(R() * 3)]}"/>`; });
    } else if (t.terrain === 'algodoal') {
      // sulcos paralelos e fileiras de algodoeiros (uma a cada três, nova e sem capulhos)
      const ang = 28, rad = ang * Math.PI / 180, cs = Math.cos(rad), sn = Math.sin(rad);
      for (let row = -5; row <= 5; row++) for (let k = -9; k <= 9; k++) {
        const a = k * .085, b = row * .13, lx = a * cs - b * sn, ly = a * sn + b * cs;
        if (!insideHex(lx, ly, .12) || Math.hypot(lx, ly) < avoid - .04) continue;
        out += cottonBush(x + lx, y + ly, .9 + R() * .3, (row + 9) % 3 === 0);
      }
      out = `<g transform="rotate(${ang} ${P(x)} ${P(y)})">${Array.from({ length: 15 }, (_, i) => `<line x1="${P(x - 1)}" y1="${P(y - .91 + i * .13 + .065)}" x2="${P(x + 1)}" y2="${P(y - .91 + i * .13 + .065)}" stroke="#5a3a20" stroke-width="5" opacity=".35"/>`).join('')}</g>` + out;
    } else if (t.terrain === 'barreiro') {
      for (const [px, py, r] of [[-.33, .17, .17], [.24, -.3, .13]]) out += `<ellipse cx="${P(x + px)}" cy="${P(y + py)}" rx="${P(r)}" ry="${P(r * .78)}" fill="#7a4a2e"/><ellipse cx="${P(x + px - r * .2)}" cy="${P(y + py - r * .2)}" rx="${P(r * .45)}" ry="${P(r * .25)}" fill="#c8a080" opacity=".45"/>`;
      out += shadow(x + .3, y + .24, .1) + `<circle cx="${P(x + .3)}" cy="${P(y + .24)}" r="${P(.1)}" fill="#a8613a" stroke="#6b3418" stroke-width="2.5"/><circle cx="${P(x + .27)}" cy="${P(y + .21)}" r="${P(.055)}" fill="#c47a4a"/><path d="M${P(x + .25)} ${P(y + .33)} a${P(.04)} ${P(.03)} 0 0 1 ${P(.08)} 0" fill="#2a1810"/>`;
      for (const [px, py] of [[-.45, -.35], [-.3, -.4], [.45, -.02], [.05, .52]]) out += bricks(x + px, y + py, 1);
      pick(R, h, 5, .14, avoid, (px, py) => { out += `<ellipse cx="${P(px)}" cy="${P(py)}" rx="${P(.06)}" ry="${P(.035)}" fill="#c06a3e" stroke="#8a4424" stroke-width="1.5"/>`; });
    } else if (t.terrain === 'pedreira') {
      // curvas de nível do maciço (mais escuras no alto) e blocos cortados no pátio
      const cx = x + .08, cy = y - .14;
      for (const [r, f] of [[.5, '#7f838c'], [.37, '#8d919a'], [.25, '#9ca0a8'], [.13, '#b0b4ba']]) { const pts = Array.from({ length: 9 }, (_, k) => { const a = k * 6.283 / 9, rr = r * (.8 + R() * .35); return `${P(cx + Math.cos(a) * rr)},${P(cy + Math.sin(a) * rr * .85)}`; }).join(' '); out += `<polygon points="${pts}" fill="${f}" stroke="#4a4c52" stroke-width="2.5" stroke-linejoin="round" opacity=".92"/>`; }
      out += `<path d="M${P(cx - .3)} ${P(cy + .05)} q${P(.15)} ${P(-.06)} ${P(.3)} ${P(-.02)}" stroke="#c49a5a" stroke-width="5" fill="none" opacity=".6"/>`;
      pick(R, h, 7, .12, .55, (px, py) => { out += rock(px, py, .8 + R() * .6, R); });
      for (const [px, py] of [[-.42, .38], [-.3, .45], [-.36, .3]]) out += shadow(x + px, y + py, .05) + `<rect x="${P(x + px - .04)}" y="${P(y + py - .035)}" width="${P(.08)}" height="${P(.065)}" fill="#a29e98" stroke="#5a5852" stroke-width="2"/><rect x="${P(x + px - .04)}" y="${P(y + py - .035)}" width="${P(.08)}" height="${P(.02)}" fill="#c4c0b8"/>`;
    } else if (t.terrain === 'vulcao') {
      const g = `vul${h.id}`;
      out += `<defs><radialGradient id="${g}" cx="45%" cy="40%" r="60%"><stop offset="0" stop-color="#5a4038"/><stop offset=".55" stop-color="#3a2a26"/><stop offset="1" stop-color="#241a18"/></radialGradient></defs>`;
      out += `<ellipse cx="${P(x + .06)}" cy="${P(y + .1)}" rx="${P(.66)}" ry="${P(.6)}" fill="#0b0806" opacity=".35"/><circle cx="${P(x)}" cy="${P(y)}" r="${P(.62)}" fill="url(#${g})"/>`;
      for (const r of [.5, .38]) out += `<circle cx="${P(x)}" cy="${P(y)}" r="${P(r)}" fill="none" stroke="#1a1210" stroke-width="3" opacity=".35"/>`;
      for (const a of [.5, 2.6, 4.4]) { let d = `M${P(x + Math.cos(a) * .18)} ${P(y + Math.sin(a) * .18)}`; for (let k = 1; k <= 6; k++) { const rr = .18 + k * .07, aa = a + Math.sin(k * 1.3 + a * 3) * .08; d += ` L${P(x + Math.cos(aa) * rr)} ${P(y + Math.sin(aa) * rr)}`; } out += `<path d="${d}" stroke="#ff5a12" stroke-width="6" fill="none" stroke-linecap="round" filter="url(#arq-glow)"/>`; }
      out += `<circle cx="${P(x)}" cy="${P(y)}" r="${P(.17)}" fill="#1a1210"/><circle cx="${P(x)}" cy="${P(y)}" r="${P(.11)}" fill="#ff6a1a" filter="url(#arq-glow)"/><circle cx="${P(x - .03)}" cy="${P(y - .03)}" r="${P(.05)}" fill="#ffd24a"/>`;
      out += `<g class="arq-smoke">${[0, 1, 2].map(k => `<circle cx="${P(x + .05 + k * .06)}" cy="${P(y - .18 - k * .1)}" r="${P(.06 + k * .03)}" fill="#c8c4c0" opacity="${.35 - k * .08}"/>`).join('')}</g>`;
    } else if (t.terrain === 'cardume') {
      pick(R, h, 9, .1, avoid, (px, py) => { out += `<g opacity=".85"><circle cx="${P(px)}" cy="${P(py)}" r="${P(.03)}" fill="#ff8a6a"/><circle cx="${P(px + .025)}" cy="${P(py - .02)}" r="${P(.02)}" fill="#ffb04a"/></g>`; });
      pick(R, h, 5, .1, avoid, (px, py) => { const d = R() < .5 ? 1 : -1; out += `<path d="M${P(px - .07 * d)} ${P(py)} q${P(.07 * d)} ${P(-.05)} ${P(.14 * d)} 0 q${P(-.07 * d)} ${P(.05)} ${P(-.14 * d)} 0 Z M${P(px - .07 * d)} ${P(py)} l${P(-.05 * d)} ${P(-.035)} v${P(.07)} Z" fill="#ffd27a" opacity=".85"/>`; });
      pick(R, h, 6, .1, avoid, (px, py) => { out += `<path d="M${P(px)} ${P(py)} q${P(.02)} ${P(-.05)} 0 ${P(-.1)} q${P(-.02)} ${P(-.05)} 0 ${P(-.1)}" stroke="#2f7a4a" stroke-width="4" fill="none" stroke-linecap="round"/>`; });
    }
    return out;
  }

  function token(t, h) {
    const red = t.num === 6 || t.num === 8, pips = 6 - Math.abs(7 - t.num), y = h.y + (t.terrain === 'pedreira' ? .3 : t.terrain === 'vulcao' ? .36 : 0), x = h.x;
    return `<g class="tok" data-num="${t.num}" filter="url(#arq-tokshadow)"><circle cx="${P(x)}" cy="${P(y)}" r="${P(.29)}" fill="url(#arq-wood)" stroke="#4a2e14" stroke-width="3"/>
      <circle cx="${P(x)}" cy="${P(y)}" r="${P(.235)}" fill="url(#arq-cream)" stroke="#8a6238" stroke-width="2"/>
      <text x="${P(x)}" y="${P(y + .06)}" text-anchor="middle" font-size="${P(red ? .27 : .24)}" font-weight="700" font-family="Georgia, serif" fill="${red ? '#b8241a' : '#2a1e10'}">${t.num}</text>
      ${Array.from({ length: pips }, (_, i) => `<circle cx="${P(x + (i - (pips - 1) / 2) * .048)}" cy="${P(y + .155)}" r="${P(.017)}" fill="${red ? '#b8241a' : '#2a1e10'}"/>`).join('')}</g>`;
  }

  function market(m, g) {
    const E = g.edges[m.edge], A = g.vertices[E.a], B = g.vertices[E.b], S = g.hexes[m.sea];
    const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2, dx = S.x - mx, dy = S.y - my, L = Math.hypot(dx, dy), px = mx + dx / L * .5, py = my + dy / L * .5;
    const ratio = m.type === 'any' ? '3:1' : '2:1', ang = Math.atan2(dy, dx) * 180 / Math.PI;
    const planks = Array.from({ length: 5 }, (_, k) => { const t = .2 + k * .14; return `<rect x="${P(mx + dx / L * t - .05)}" y="${P(my + dy / L * t - .025)}" width="${P(.1)}" height="${P(.05)}" fill="${k % 2 ? '#9a7448' : '#a8804f'}" stroke="#5a3e26" stroke-width="1.5" transform="rotate(${(ang + 90).toFixed(0)} ${P(mx + dx / L * t)} ${P(my + dy / L * t)})"/>`; }).join('');
    return `<g class="mkt">${planks}<circle cx="${P(px + .02)}" cy="${P(py + .03)}" r="${P(.24)}" fill="#0b1a20" opacity=".3"/>
      <circle cx="${P(px)}" cy="${P(py)}" r="${P(.23)}" fill="url(#arq-cream)" stroke="#6b4a24" stroke-width="4"/>
      <text x="${P(px)}" y="${P(py - .02)}" text-anchor="middle" font-size="${P(.15)}">${RES_ICON[m.type]}</text>
      <text x="${P(px)}" y="${P(py + .15)}" text-anchor="middle" font-size="${P(.11)}" font-weight="800" fill="#3b2a14" font-family="system-ui, sans-serif">${ratio}</text></g>`;
  }

  function buildStatic(st) {
    const g = Arq.grid(st), xs = g.hexes.map(h => h.x), ys = g.hexes.map(h => h.y);
    const minX = Math.min(...xs) - 1.15, maxX = Math.max(...xs) + 1.15, minY = Math.min(...ys) - 1.2, maxY = Math.max(...ys) + 1.2;
    const tiles = st.map.tiles, land = g.hexes.filter(h => h.kind === 'land'), shoals = g.hexes.filter(h => tiles[h.id].terrain === 'cardume');
    const pat = n => `<pattern id="arq-p-${n}" patternUnits="userSpaceOnUse" width="150" height="150"><image href="assets/arq/tex_${n}.webp" width="150" height="150"/></pattern>`;
    root.innerHTML = `<svg class="arq-svg" viewBox="${P(minX)} ${P(minY)} ${P(maxX - minX)} ${P(maxY - minY)}" preserveAspectRatio="xMidYMid meet">
      <defs>
        ${TEXS.map(pat).join('')}
        <radialGradient id="arq-sea" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="${P(Math.max(maxX - minX, maxY - minY) * .9)}"><stop offset="0" stop-color="#1f6f88"/><stop offset=".55" stop-color="#155470"/><stop offset="1" stop-color="#0a2c3e"/></radialGradient>
        <radialGradient id="arq-relief" cx="32%" cy="28%" r="85%"><stop offset="0" stop-color="#fff" stop-opacity=".2"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".3"/></radialGradient>
        <linearGradient id="arq-bevel" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".45"/></linearGradient>
        <radialGradient id="arq-wood" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#b8844a"/><stop offset="1" stop-color="#6e4824"/></radialGradient>
        <radialGradient id="arq-cream" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#fdf6e2"/><stop offset="1" stop-color="#e2cf9e"/></radialGradient>
        <filter id="arq-ds" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="6" dy="9" stdDeviation="5" flood-color="#04141c" flood-opacity=".5"/></filter>
        <filter id="arq-tokshadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="2.5" dy="4" stdDeviation="2.5" flood-color="#000" flood-opacity=".45"/></filter>
        <filter id="arq-glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        <filter id="arq-soft"><feGaussianBlur stdDeviation="22"/></filter>
        <pattern id="arq-waves" width="80" height="40" patternUnits="userSpaceOnUse"><path d="M0 20 q20 -9 40 0 t40 0" stroke="rgba(190,230,240,.13)" stroke-width="2.2" fill="none"/></pattern>
        ${land.map(h => `<clipPath id="arq-clip-${h.id}"><polygon points="${hexPts(h.x, h.y, .985)}"/></clipPath>`).join('')}
      </defs>
      <rect x="${P(minX - 30)}" y="${P(minY - 30)}" width="${P(maxX - minX + 60)}" height="${P(maxY - minY + 60)}" fill="url(#arq-sea)"/>
      <rect class="arq-waves" x="${P(minX - 31)}" y="${P(minY - 30)}" width="${P(maxX - minX + 62)}" height="${P(maxY - minY + 60)}" fill="url(#arq-waves)"/>
      <!-- água rasa em volta da ilha e dos cardumes -->
      <g filter="url(#arq-soft)" opacity=".75">${land.map(h => `<polygon points="${hexPts(h.x, h.y, 1.45)}" fill="#3fb8b8"/>`).join('')}${shoals.map(h => `<polygon points="${hexPts(h.x, h.y, 1)}" fill="#46c4c0"/>`).join('')}</g>
      <!-- cardumes (bancos de areia rasos) -->
      <g class="arq-shoals">${shoals.map(h => `<g class="hex cardume" data-hex="${h.id}"><polygon points="${hexPts(h.x, h.y, .92)}" fill="url(#arq-p-areia)" opacity=".45"/><polygon points="${hexPts(h.x, h.y, .92)}" fill="#2fa8b0" opacity=".5"/>${decorate(tiles[h.id], h)}${tiles[h.id].num ? token(tiles[h.id], h) : ''}</g>`).join('')}</g>
      <!-- praia e espuma -->
      <g filter="url(#arq-ds)">${land.map(h => `<polygon points="${hexPts(h.x, h.y, 1.1)}" fill="url(#arq-p-areia)" stroke="url(#arq-p-areia)" stroke-width="22" stroke-linejoin="round"/>`).join('')}</g>
      <g class="arq-foam">${land.map(h => `<polygon points="${hexPts(h.x, h.y, 1.16)}" fill="none" stroke="#f4fbff" stroke-width="5" stroke-dasharray="14 10" stroke-linejoin="round" opacity=".55"/>`).join('')}</g>
      <g>${land.map(h => `<polygon points="${hexPts(h.x, h.y, 1.1)}" fill="url(#arq-p-areia)" stroke="url(#arq-p-areia)" stroke-width="18" stroke-linejoin="round"/>`).join('')}</g>
      <!-- terrenos: textura do bioma + matiz + cenário + relevo (luz do alto à esquerda) -->
      <g class="arq-tiles">${g.hexes.map(h => {
        const t = tiles[h.id]; if (t.terrain === 'mar') return `<polygon class="hex sea" data-hex="${h.id}" points="${hexPts(h.x, h.y, 1)}" fill="transparent"/>`;
        if (t.terrain === 'cardume') return '';
        const T = TERRAIN[t.terrain];
        return `<g class="hex ${t.terrain}" data-hex="${h.id}"><g clip-path="url(#arq-clip-${h.id})">
          <polygon points="${hexPts(h.x, h.y, 1)}" fill="url(#arq-p-${T.tex})"/>
          <polygon points="${hexPts(h.x, h.y, 1)}" fill="${T.tint}" style="mix-blend-mode:multiply" opacity=".55"/>
          ${decorate(t, h)}
          <polygon points="${hexPts(h.x, h.y, 1)}" fill="url(#arq-relief)" pointer-events="none"/></g>
          <polygon points="${hexPts(h.x, h.y, .955)}" fill="none" stroke="url(#arq-bevel)" stroke-width="7" pointer-events="none"/>
          <polygon points="${hexPts(h.x, h.y, .985)}" fill="none" stroke="#2a1e10" stroke-opacity=".35" stroke-width="3" pointer-events="none"/>
          ${t.num ? token(t, h) : ''}</g>`;
      }).join('')}</g>
      <g class="arq-mkts">${st.map.markets.map(m => market(m, g)).join('')}</g>
      <g class="arq-live"></g><g class="arq-hl"></g>
    </svg>`;
    svg = root.querySelector('svg');
    svg.addEventListener('click', onClick);
    svg.addEventListener('mousemove', onMove);
    svg.addEventListener('mouseleave', () => setHover(null));
  }

  // ---------- peças (vistas de cima, em 3/4) ----------
  const shade = (hex, k) => { const n = parseInt(hex.slice(1), 16), f = c => Math.max(0, Math.min(255, Math.round(c * k))); return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`; };
  function house(x, y, c, s = 1) {
    const w = .13 * s, h = .1 * s;
    return `<ellipse cx="${P(x + w * .35)}" cy="${P(y + h * 1.1)}" rx="${P(w * 1.15)}" ry="${P(h * .55)}" fill="#000" opacity=".35"/>
      <rect x="${P(x - w)}" y="${P(y - h * .2)}" width="${P(w * 2)}" height="${P(h * 1.1)}" fill="#f1e6cc" stroke="#1b140c" stroke-width="4" stroke-linejoin="round"/>
      <rect x="${P(x - w * .25)}" y="${P(y + h * .35)}" width="${P(w * .5)}" height="${P(h * .55)}" fill="#4a2e1a"/>
      <polygon points="${P(x - w * 1.18)},${P(y - h * .15)} ${P(x)},${P(y - h * 1.25)} ${P(x + w * 1.18)},${P(y - h * .15)}" fill="${c}" stroke="#1b140c" stroke-width="4" stroke-linejoin="round"/>
      <polygon points="${P(x)},${P(y - h * 1.25)} ${P(x + w * 1.18)},${P(y - h * .15)} ${P(x + w * .2)},${P(y - h * .15)}" fill="${shade(c, .78)}"/>`;
  }
  function city(x, y, c) {
    const w = .21, h = .13;
    return `<ellipse cx="${P(x + .06)}" cy="${P(y + h * 1.25)}" rx="${P(w * 1.35)}" ry="${P(h * .6)}" fill="#000" opacity=".35"/>
      <rect x="${P(x - w * 1.05)}" y="${P(y - h * .1)}" width="${P(w * 1.3)}" height="${P(h * 1.15)}" fill="#ece0c4" stroke="#1b140c" stroke-width="4"/>
      <polygon points="${P(x - w * 1.2)},${P(y - h * .05)} ${P(x - w * .4)},${P(y - h * .95)} ${P(x + w * .4)},${P(y - h * .05)}" fill="${c}" stroke="#1b140c" stroke-width="4" stroke-linejoin="round"/>
      <rect x="${P(x + w * .2)}" y="${P(y - h * 1.6)}" width="${P(w * .85)}" height="${P(h * 2.65)}" fill="#e2d4b4" stroke="#1b140c" stroke-width="4"/>
      <polygon points="${P(x + w * .1)},${P(y - h * 1.55)} ${P(x + w * .62)},${P(y - h * 2.45)} ${P(x + w * 1.15)},${P(y - h * 1.55)}" fill="${c}" stroke="#1b140c" stroke-width="4" stroke-linejoin="round"/>
      <rect x="${P(x + w * .45)}" y="${P(y - h * .9)}" width="${P(w * .35)}" height="${P(h * .45)}" fill="#3a5a7a"/>`;
  }
  function live(st, ui) {
    const g = Arq.grid(st), col = id => Arq.COLORS.find(c => c.id === st.players.find(p => p.id === id)?.color)?.hex || '#999';
    // trilhas: passarela de tábuas na cor do jogador (contorno escuro + tábuas marcadas)
    const roads = Object.entries(st.roads).map(([e, o]) => { const E = g.edges[e], A = g.vertices[E.a], B = g.vertices[E.b], k = .17;
      const ax = A.x + (B.x - A.x) * k, ay = A.y + (B.y - A.y) * k, bx = B.x + (A.x - B.x) * k, by = B.y + (A.y - B.y) * k, c = col(o);
      return `<g class="road ${ui.fresh?.has('e' + e) ? 'pop' : ''}"><line x1="${P(ax + .02)}" y1="${P(ay + .03)}" x2="${P(bx + .02)}" y2="${P(by + .03)}" stroke="#000" stroke-opacity=".35" stroke-width="20" stroke-linecap="round"/>
        <line x1="${P(ax)}" y1="${P(ay)}" x2="${P(bx)}" y2="${P(by)}" stroke="#1b140c" stroke-width="20" stroke-linecap="round"/><line x1="${P(ax)}" y1="${P(ay)}" x2="${P(bx)}" y2="${P(by)}" stroke="${c}" stroke-width="13" stroke-linecap="round"/>
        <line x1="${P(ax)}" y1="${P(ay)}" x2="${P(bx)}" y2="${P(by)}" stroke="${shade(c, .7)}" stroke-width="13" stroke-dasharray="2.5 8"/></g>`; }).join('');
    const blds = Object.entries(st.buildings).map(([v, b]) => { const V = g.vertices[v]; return `<g class="bld ${ui.fresh?.has('v' + v) ? 'pop' : ''}" style="transform-origin:${P(V.x)}px ${P(V.y)}px">${b.type === 'cidade' ? city(V.x, V.y, col(b.owner)) : house(V.x, V.y, col(b.owner), 1.8)}</g>`; }).join('');
    const S = g.hexes[st.storm];
    const storm = `<g class="storm" style="transform:translate(${P(S.x)}px,${P(S.y)}px)"><ellipse cx="${P(.1)}" cy="${P(.18)}" rx="${P(.42)}" ry="${P(.2)}" fill="#05101a" opacity=".45"/>
      <g opacity=".95"><circle cx="${P(-.14)}" cy="${P(-.08)}" r="${P(.16)}" fill="#5a6270"/><circle cx="${P(.06)}" cy="${P(-.18)}" r="${P(.2)}" fill="#6b7382"/><circle cx="${P(.22)}" cy="${P(-.06)}" r="${P(.15)}" fill="#59606e"/><rect x="${P(-.28)}" y="${P(-.08)}" width="${P(.62)}" height="${P(.12)}" rx="${P(.06)}" fill="#525a68"/>
      <path d="M${P(.02)} ${P(.04)} l${P(-.08)} ${P(.14)} h${P(.07)} l${P(-.05)} ${P(.13)}" stroke="#ffd34a" stroke-width="7" fill="none" stroke-linejoin="round"/>
      ${[-.18, -.06, .14].map(dx => `<line x1="${P(dx)}" y1="${P(.08)}" x2="${P(dx - .04)}" y2="${P(.2)}" stroke="#9ec4ff" stroke-width="3" opacity=".7"/>`).join('')}</g></g>`;
    svg.querySelector('.arq-live').innerHTML = roads + blds + storm;
  }

  // destaques: onde dá para clicar agora
  function highlights(st, ui) {
    const g = Arq.grid(st); let out = '';
    for (const e of ui.edges || []) { const E = g.edges[e], A = g.vertices[E.a], B = g.vertices[E.b]; out += `<line class="hl-edge" data-edge="${e}" x1="${P(A.x)}" y1="${P(A.y)}" x2="${P(B.x)}" y2="${P(B.y)}"/>`; }
    for (const v of ui.vertices || []) { const V = g.vertices[v]; out += `<circle class="hl-vertex ${ui.mode === 'cidade' ? 'city' : ''}" data-vertex="${v}" cx="${P(V.x)}" cy="${P(V.y)}" r="${P(.17)}"/>`; }
    for (const h of ui.hexes || []) { const H = g.hexes[h]; out += `<polygon class="hl-hex" data-hex="${h}" points="${hexPts(H.x, H.y, .9)}"/>`; }
    svg.querySelector('.arq-hl').innerHTML = out;
    svg.classList.toggle('picking', !!(ui.edges?.length || ui.vertices?.length || ui.hexes?.length));
  }

  function onClick(e) {
    const t = e.target.closest('[data-vertex],[data-edge],[data-hex]'); if (!t) return;
    if (t.dataset.vertex != null) handlers.pick?.({ kind: 'vertex', id: +t.dataset.vertex });
    else if (t.dataset.edge != null) handlers.pick?.({ kind: 'edge', id: +t.dataset.edge });
    else handlers.pick?.({ kind: 'hex', id: +t.dataset.hex });
  }
  function onMove(e) { const t = e.target.closest('.hex'); setHover(t ? +t.dataset.hex : null, e); }
  function setHover(id, e) { if (id === hoverHex) return; hoverHex = id; handlers.hover?.(id, e); }

  function mount(el, h) { root = el; handlers = h || {}; mapKey = null; }
  function update(st, ui = {}) {
    if (!root) return;
    const key = st.gameId; if (key !== mapKey) { buildStatic(st); mapKey = key; }
    live(st, ui); highlights(st, ui); last = st;
  }
  // posição na tela (px, relativa à janela) de um hexágono, interseção ou aresta — para animações e balões
  function screenPos(kind, id) {
    if (!svg || !last) return null;
    const g = Arq.grid(last); let x, y;
    if (kind === 'hex') ({ x, y } = g.hexes[id]);
    else if (kind === 'vertex') ({ x, y } = g.vertices[id]);
    else { const E = g.edges[id]; x = (g.vertices[E.a].x + g.vertices[E.b].x) / 2; y = (g.vertices[E.a].y + g.vertices[E.b].y) / 2; }
    const pt = svg.createSVGPoint(); pt.x = x * K; pt.y = y * K;
    const s = pt.matrixTransform(svg.getScreenCTM()); return { x: s.x, y: s.y };
  }
  // números sorteados pulam no tabuleiro
  function hitNumber(n) {
    if (!svg) return;
    svg.querySelectorAll('.tok').forEach(t => t.classList.toggle('hit', +t.dataset.num === n));
    setTimeout(() => svg?.querySelectorAll('.tok.hit').forEach(t => t.classList.toggle('hit', false)), 2200);
  }
  function reset() { root = null; svg = null; mapKey = null; last = null; }
  return { mount, update, screenPos, reset, hitNumber, TERRAIN, RES_ICON };
})();
