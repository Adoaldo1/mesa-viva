# Mesa Viva — tabletop entre amigos

Mesa de jogos de tabuleiro no navegador, multiplayer P2P (WebRTC), sem servidor próprio.
Primeiro jogo: **Magnata**, de compra e venda de propriedades — leilões, níveis de construção (Terreno → Hotel), o upgrade único do Ateliê do Arquiteto, trocas e bots.

**Jogar:** https://guicalheira.github.io/mesa-viva/ — crie uma sala e mande o código de 5 letras para os amigos.

- `index.html` + `style.css` + `js/` — código-fonte (abra via servidor local: `python -m http.server 8765`)
- `dist/mesa-viva.html` — versão em **arquivo único** (artes embutidas). Mande para os amigos ou hospede (GitHub Pages, Netlify, etc.)
- `assets/` — artes geradas no ComfyUI (Stability Matrix) com **Z-Image Turbo**
- `tools/gen_art.py` — regenera as artes (`python tools/gen_art.py --force nome`), usando o Python do ComfyUI
- `tools/build.py` — gera o `dist/` depois de editar o código

## Arquitetura
| Arquivo | Papel |
|---|---|
| `js/data.js` | personagens, catálogo de jogos, tabuleiro e cartas do Magnata |
| `js/game.js` | motor de regras do Magnata + IA dos bots (roda só no anfitrião) |
| `js/fx.js` | sons sintetizados (WebAudio) e animações: dados 3D, peões, cartas, faixas, edifícios em pé no modo 3D |
| `js/board3d.js` | modo 3D em WebGL (Three.js): mesa, tabuleiro, peões, edifícios por nível, dados, cartas e marcadores modelados em código |
| `js/ludo.js` | Ludo: motor de regras, bots e tela 3D (CSS 3D, sem biblioteca) |
| `js/net.js` | P2P via PeerJS/WebRTC (código de sala de 5 letras) |
| `js/room.js` | lobby: entrada, prontos, bots, chat, sincronização do estado |
| `js/store.js` | login local (PBKDF2), perfil, ranking, export/import |
| `js/ui.js` | todas as telas |

Para adicionar um novo jogo: crie um motor como `Magnata` (`newGame`, `act`, `botAction`), adicione ao `GAME_LIBRARY` com `ready: true` e uma função de render em `ui.js`.
