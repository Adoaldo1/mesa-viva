# Mesa Viva — tabletop entre amigos

Mesa de jogos de tabuleiro no navegador, multiplayer P2P (WebRTC), sem servidor próprio.
Jogos: **Magnata**, de compra e venda de propriedades — leilões, níveis de construção (Terreno → Hotel), o upgrade único do Ateliê do Arquiteto, trocas e bots. **Ludo**. **Conjura**, de blefe e intriga na corte, com as cartas ilustradas com os amigos.

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
| `js/conjura.js` | Conjura: jogo de blefe e intriga (2–10 jogadores) — regras, contestações, bloqueios, variante Confessor e bots. Cada jogador recebe só a própria visão (cartas alheias escondidas) |
| `js/conjura-ui.js` | Conjura: mesa, cartas, painéis de ação/reação, carta de ajuda |
| `tools/gen_cards.py` | gera as artes das cartas do Conjura a partir de fotos (FLUX.2 Klein 4B no ComfyUI); as fotos originais ficam em `tools/fotos/`, fora do Git |
| `js/net.js` | P2P via PeerJS/WebRTC; se a rede não permitir conexão direta, cai sozinho para a reserva pelo servidor do PeerJS (porta 443, mensagens fatiadas) e, se preciso, para servidores MQTT públicos (EMQX/HiveMQ). Inclui o diagnóstico "Testar minha conexão" |
| `js/room.js` | lobby: entrada, prontos, bots, chat, sincronização do estado |
| `js/store.js` | login local (PBKDF2), perfil, ranking, export/import |
| `js/ui.js` | todas as telas |

Para adicionar um novo jogo: crie um motor como `Magnata` (`newGame`, `act`, `botAction`), adicione ao `GAME_LIBRARY` com `ready: true` e uma função de render em `ui.js`.
