// ===== Dados estáticos: artes, personagens, tabuleiro, cartas =====
// versão do jogo: mude a cada publicação (avisa quem estiver com a página antiga aberta)
const APP_VERSION = '2026.11.11-23';
const IMG = {
  char_vitoria: 'assets/char_vitoria.webp',
  char_otavio: 'assets/char_otavio.webp',
  char_lia: 'assets/char_lia.webp',
  char_bento: 'assets/char_bento.webp',
  char_estrela: 'assets/char_estrela.webp',
  char_dante: 'assets/char_dante.webp',
  char_amara: 'assets/char_amara.webp',
  char_kai: 'assets/char_kai.webp',
  board_center: 'assets/board_center.webp',
  lobby_bg: 'assets/lobby_bg.webp',
  cover_magnata: 'assets/cover_magnata.webp',
  cover_ludo: 'assets/cover_ludo.webp',
  cover_conjura: 'assets/cover_conjura.webp',
  cover_cah: 'assets/cover_cah.webp', cover_war: 'assets/cover_war.webp', cover_domino: 'assets/cover_domino.webp', cover_arq: 'assets/cover_arq.webp?v=2', cover_patrimonio: 'assets/cover_patrimonio.webp', cover_ultima: 'assets/cover_ultima.webp',
  war_rei: 'assets/war/rei.webp', war_rei_t: 'assets/war/rei_t.webp', war_tesoureiro: 'assets/war/tesoureiro.webp', war_tesoureiro_t: 'assets/war/tesoureiro_t.webp', war_sicario: 'assets/war/sicario.webp', war_sicario_t: 'assets/war/sicario_t.webp', war_corsario: 'assets/war/corsario.webp', war_corsario_t: 'assets/war/corsario_t.webp',
  war_confessor: 'assets/war/confessor.webp', war_confessor_t: 'assets/war/confessor_t.webp', war_escriba: 'assets/war/escriba.webp', war_escriba_t: 'assets/war/escriba_t.webp', war_diplomata: 'assets/war/diplomata.webp', war_diplomata_t: 'assets/war/diplomata_t.webp', war_guarda: 'assets/war/guarda.webp', war_guarda_t: 'assets/war/guarda_t.webp',
  card_fortuna: 'assets/card_fortuna.webp',
  card_evento: 'assets/card_evento.webp',
  tile_start: 'assets/tile_start.webp',
  tile_jail: 'assets/tile_jail.webp',
  tile_park: 'assets/tile_park.webp',
  tile_upgrade: 'assets/tile_upgrade.webp',
  conj_tesoureiro: 'assets/conjura/tesoureiro.webp', conj_sicario: 'assets/conjura/sicario.webp', conj_corsario: 'assets/conjura/corsario.webp',
  conj_diplomata: 'assets/conjura/diplomata.webp', conj_guarda: 'assets/conjura/guarda.webp', conj_confessor: 'assets/conjura/confessor.webp',
  conj_rei: 'assets/conjura/rei.webp', conj_escriba: 'assets/conjura/escriba.webp', conj_verso: 'assets/conjura/verso.webp',
  tier_0: 'assets/tier_0.webp', tier_1: 'assets/tier_1.webp', tier_2: 'assets/tier_2.webp',
  tier_3: 'assets/tier_3.webp', tier_4: 'assets/tier_4.webp', tier_5: 'assets/tier_5.webp',
  tile_gotojail: 'assets/tile_gotojail.webp',
  tile_station: 'assets/tile_station.webp',
  tile_power: 'assets/tile_power.webp',
  tile_water: 'assets/tile_water.webp',
  tile_tax: 'assets/tile_tax.webp',
  tile_fortuna: 'assets/tile_fortuna.webp',
  tile_evento: 'assets/tile_evento.webp',
  bg_wood: 'assets/bg_wood.webp',
  cj_hall: 'assets/cj_hall.webp', cj_wood: 'assets/cj_wood.webp', cj_felt: 'assets/cj_felt.webp',
};

const CHARACTERS = [
  { id: 'vitoria', name: 'Vitória Ferraz', role: 'A Executiva', img: IMG.char_vitoria, color: '#e5484d' },
  { id: 'otavio', name: 'Barão Otávio', role: 'O Cafeicultor', img: IMG.char_otavio, color: '#8a9a3b' },
  { id: 'lia', name: 'Lia Faísca', role: 'A Inventora', img: IMG.char_lia, color: '#12a594' },
  { id: 'bento', name: 'Capitão Bento', role: 'O Lobo do Mar', img: IMG.char_bento, color: '#3e63dd' },
  { id: 'estrela', name: 'Estrela Dias', role: 'A Diva', img: IMG.char_estrela, color: '#e93d82' },
  { id: 'dante', name: 'Dante Noir', role: 'O Detetive', img: IMG.char_dante, color: '#7c8a99' },
  { id: 'amara', name: 'Chef Amara', role: 'A Chef', img: IMG.char_amara, color: '#f76b15' },
  { id: 'kai', name: 'Kai Spray', role: 'O Artista', img: IMG.char_kai, color: '#8e4ec6' },
];
// comandantes do Supremacia (as fotos dos amigos, editadas por IA no tema da guerra)
const WAR_GENERALS = [
  { id: 'rei', name: 'O Marechal', img: IMG.war_rei, thumb: IMG.war_rei_t }, { id: 'tesoureiro', name: 'General do Deserto', img: IMG.war_tesoureiro, thumb: IMG.war_tesoureiro_t },
  { id: 'sicario', name: 'Comandante Sombra', img: IMG.war_sicario, thumb: IMG.war_sicario_t }, { id: 'corsario', name: 'O Almirante', img: IMG.war_corsario, thumb: IMG.war_corsario_t },
  { id: 'confessor', name: 'Coronel da Inteligência', img: IMG.war_confessor, thumb: IMG.war_confessor_t }, { id: 'escriba', name: 'O Estrategista', img: IMG.war_escriba, thumb: IMG.war_escriba_t },
  { id: 'diplomata', name: 'Ás dos Céus', img: IMG.war_diplomata, thumb: IMG.war_diplomata_t }, { id: 'guarda', name: 'General Blindado', img: IMG.war_guarda, thumb: IMG.war_guarda_t },
];
const generalById = id => WAR_GENERALS.find(g => g.id === id);
const charById = id => CHARACTERS.find(c => c.id === id) || CHARACTERS[0];

const PLAYER_COLORS = ['#e5484d', '#f76b15', '#ffc53d', '#46a758', '#12a594', '#3e63dd', '#8e4ec6', '#e93d82', '#7c8a99', '#ffffff'];
const EMBLEMS = ['💎', '🚀', '🦊', '🐙', '🌵', '⚡', '🍀', '👑', '🔥', '🎲', '🌙', '🦄', '🍕', '🎸', '🐉', '⭐'];
const TITLES = ['Novato', 'Investidor', 'Especulador', 'Corretor Astuto', 'Barão do Asfalto', 'Rei dos Aluguéis', 'Lenda da Mesa', 'Sortudo Profissional', 'Estrategista', 'Caçador de Hotéis'];
const FRAMES = [
  { id: 'simple', name: 'Simples' },
  { id: 'gold', name: 'Ouro' },
  { id: 'silver', name: 'Prata' },
  { id: 'neon', name: 'Neon' },
  { id: 'rainbow', name: 'Arco-íris' },
];

// ===== Catálogo de jogos da mesa =====
// chapéus das peças do Ludo (escolhidos na sala)
const LUDO_HATS = [
  { id: 'none', name: 'Sem chapéu', icon: '🚫' }, { id: 'top', name: 'Cartola', icon: '🎩' }, { id: 'crown', name: 'Coroa', icon: '👑' },
  { id: 'cap', name: 'Boné', icon: '🧢' }, { id: 'witch', name: 'Bruxa', icon: '🧙' }, { id: 'party', name: 'Festa', icon: '🥳' }, { id: 'cowboy', name: 'Caubói', icon: '🤠' },
];

// cenário da partida (o anfitrião escolhe na sala); cada um tem versão de dia e de noite
const LUDO_SCENES = [{ id: 'classic', name: 'Clássico', icon: '🎲' }, { id: 'wood', name: 'Madeira', icon: '🪵' }, { id: 'felt', name: 'Feltro', icon: '🟩' }, { id: 'beach', name: 'Praia', icon: '🏖️' }, { id: 'space', name: 'Espaço', icon: '🌌' }];
// Magnata: formato do peão 3D (cada jogador) e mesa (o anfitrião escolhe)
const MAGNATA_TOKENS = [
  { id: 'classic', name: 'Peão', icon: '♟️' }, { id: 'car', name: 'Carro', icon: '🚗' }, { id: 'rocket', name: 'Foguete', icon: '🚀' },
  { id: 'crown', name: 'Coroa', icon: '👑' }, { id: 'piggy', name: 'Cofrinho', icon: '🐷' }, { id: 'diamond', name: 'Diamante', icon: '💎' },
];
const MAGNATA_TABLES = [{ id: 'wood', name: 'Madeira', icon: '🪵' }, { id: 'felt', name: 'Feltro', icon: '🟩' }, { id: 'marble', name: 'Mármore', icon: '🏛️' }, { id: 'night', name: 'Noite', icon: '🌃' }];
const LUDO_EMOTES = ['😂', '😭', '😡', '👏', '🔥', '😎', '🎉', '👍', '😱', '🤡', '💀', '❤️'];

const GAME_LIBRARY = [
  { id: 'magnata', name: 'Magnata', desc: 'Compre bairros, construa casas e hotéis e leve seus amigos à falência.', players: '2–8', cover: IMG.cover_magnata, ready: true },
  { id: 'conjura', name: 'Conjura', desc: 'Blefe e intriga na corte: diga que é quem quiser, conteste, bloqueie e exile as outras famílias.', players: '2–10', cover: IMG.cover_conjura, ready: true },
  { id: 'cah', name: 'Cartas Contra a Humanidade', desc: 'O jogo de cartas para pessoas horríveis: complete a frase da carta preta com a resposta mais absurda.', players: '3–12', cover: IMG.cover_cah, ready: true },
  { id: 'war', name: 'Supremacia', desc: 'Guerra de estratégia pelo mapa-múndi: cumpra seu objetivo secreto conquistando continentes ou destruindo um exército rival.', players: '2–6', cover: IMG.cover_war, ready: true },
  { id: 'patrimonio', name: 'Patrimônio', desc: 'Compre o Brasil, erga do puxadinho ao hotel e leve os amigos à falência, com leilão, cassino, jornal e fiado.', players: '2–8', cover: IMG.cover_patrimonio, ready: true },
  { id: 'ultima', name: 'Última!', desc: 'Descarte por cor ou símbolo, solte Pula, Volta, +2 e Coringa, e grite "Última!" antes que te peguem.', players: '2–10', cover: IMG.cover_ultima, ready: true },
  { id: 'arq', name: 'Arquipélago', desc: 'Colonize uma ilha tropical: produza madeira, argila, algodão, pedra e peixe, negocie com os amigos e erga vilas e cidades até 10 pontos.', players: '2–6', cover: IMG.cover_arq, ready: true },
  { id: 'domino2', name: 'Dominó', desc: 'Dominó brasileiro em duplas: encaixe as pedras, feche a mesa e bata de carroça, lá e lô ou cruzada.', players: '2–4', cover: IMG.cover_domino, ready: true },
  { id: 'ludo', name: 'Ludo', desc: 'Corrida de peões clássica: tire 1 ou 6 para sair, capture os rivais e leve as 4 peças ao centro.', players: '2–6', cover: IMG.cover_ludo, ready: true, icon: '🎯' },
];

// ===== Economia: tudo escalado para começar com $1 milhão =====
// K(v) converte um valor da tabela clássica (base $1.500) para a escala de $1.000.000 e arredonda para um número "redondo".
const ECON_SCALE = 1000000 / 1500;
function niceMoney(v) {
  if (v <= 0) return 0;
  const step = v < 10000 ? 500 : v < 100000 ? 1000 : v < 1000000 ? 5000 : 50000;
  return Math.max(step, Math.round(v / step) * step);
}
const K = v => niceMoney(v * ECON_SCALE);
// formato compacto: $40 mil, $1,35 mi
function fmtMoney(n) {
  const neg = n < 0; n = Math.abs(Math.round(n));
  const f = (x, d) => x.toLocaleString('pt-BR', { maximumFractionDigits: d });
  const s = n >= 1e6 ? '$' + f(n / 1e6, 2) + ' mi' : n >= 1e3 ? '$' + f(n / 1e3, 1) + ' mil' : '$' + n;
  return (neg ? '−' : '') + s;
}
const ECON = {
  START: 750000, GO: K(200), JAIL_FINE: K(50), MIN_BID: K(10), STATION: K(25),
  UTIL1: K(4), UTIL2: K(10), CARD_VALUE: K(50),
  START_OPTIONS: [500000, 750000, 1000000, 1500000],
  // como no Monopoly: só constrói quem tem o grupo de cor completo, de forma uniforme
  EVEN_BUILD: true,
  // ---- equilíbrio da diversão ----
  CATCHUP_GO: 1.5,            // último colocado recebe +50% ao passar pela Partida
  CARD_LUCK: .5,              // chance de "pular" uma carta ruim (quem está atrás) ou boa (quem lidera)
  WEALTH_TAX: { above: 1.5, rate: .08, max: 0 }, // taxa de fortuna na Partida para quem tem 50%+ acima da média
  // ---- hipoteca punitiva ----
  // recebe metade do preço; para quitar paga a dívida com juros que crescem a cada rodada (+20% na hora, +10% por rodada,
  // até o dobro). Hipotecada não cobra aluguel e quebra o monopólio da cor; depois de `seize` rodadas o banco toma (penhora)
  MORTGAGE: { now: .2, perRound: .1, max: 2, seize: 6, warn: 2 },
  // venda ao banco (só em dívida): devolve só parte do que foi pago pelo terreno
  SELLBACK: .7,
  // ---- reta final: fecha a partida ----
  // começa quando só restam 2 jogadores (em partidas de 3+) ou na rodada `round`; a partir daí as ajudas a quem
  // está atrás e a taxa de fortuna desligam, e os aluguéis sobem `rate` por rodada (inflação), até `max`
  LATE: { round: 45, rate: .08, max: 4 },
};
ECON.WEALTH_TAX.max = K(150);
// upgrade do Ateliê: +50% de aluguel por nível, até o nível 4 (×3)
const UPGRADE = {
  MAX_LEVEL: 4,
  mult: lvl => (lvl > 0 ? 1 + .5 * Math.min(lvl, 4) : 1),
  label: lvl => '×' + String(1 + .5 * Math.min(lvl, 4)).replace('.', ','),
};

// ===== Magnata: tabuleiro =====
const GROUPS = {
  brown: { color: '#955436', house: K(50) },
  lightblue: { color: '#8fd3f4', house: K(50) },
  pink: { color: '#d94ea3', house: K(100) },
  orange: { color: '#f39229', house: K(100) },
  red: { color: '#e5383b', house: K(150) },
  yellow: { color: '#f7d63e', house: K(150) },
  green: { color: '#2fa35b', house: K(200) },
  darkblue: { color: '#2d55c8', house: K(200) },
};

// curva de aluguel um pouco achatada no topo (um hotel não decide a partida sozinho), mas cada nível construído
// SEMPRE rende bem mais que o anterior: no mínimo +15% e +80% do preço da casa por queda
// (a 1ª casa já rende 4–5× o terreno do grupo completo na tabela clássica)
const RENT_FLAT = [1.3, 1.25, 1.1, .85, .72, .62];
const RENT_STEP = { pct: 1.15, house: .8 };
const S = (name, group, price, rent) => {
  const r = rent.map((v, i) => v * RENT_FLAT[i]), house = GROUPS[group].house / ECON_SCALE;
  for (let i = 2; i < 6; i++) r[i] = Math.max(r[i], r[i - 1] * RENT_STEP.pct, r[i - 1] + house * RENT_STEP.house);
  return { type: 'street', name, group, price: K(price), rent: r.map(v => K(v)) };
};
const TILES = [
  { type: 'start', name: 'Partida', img: IMG.tile_start },
  S('Beco das Flores', 'brown', 60, [2, 10, 30, 90, 160, 250]),
  { type: 'evento', name: 'Evento', img: IMG.tile_evento },
  S('Rua do Sapo', 'brown', 60, [4, 20, 60, 180, 320, 450]),
  { type: 'tax', name: 'Imposto de Renda', amount: K(200), img: IMG.tile_tax },
  { type: 'station', name: 'Estação Norte', price: K(200), img: IMG.tile_station },
  S('Vila Lavanda', 'lightblue', 100, [6, 30, 90, 270, 400, 550]),
  { type: 'fortuna', name: 'Fortuna', img: IMG.tile_fortuna },
  S('Travessa Azul', 'lightblue', 100, [6, 30, 90, 270, 400, 550]),
  S('Largo do Farol', 'lightblue', 120, [8, 40, 100, 300, 450, 600]),
  { type: 'jail', name: 'Delegacia', img: IMG.tile_jail },
  S('Av. das Palmeiras', 'pink', 140, [10, 50, 150, 450, 625, 750]),
  { type: 'utility', name: 'Cia. de Energia', price: K(150), img: IMG.tile_power },
  S('Rua dos Artistas', 'pink', 140, [10, 50, 150, 450, 625, 750]),
  S('Praça do Circo', 'pink', 160, [12, 60, 180, 500, 700, 900]),
  { type: 'station', name: 'Estação Leste', price: K(200), img: IMG.tile_station },
  S('Rua do Porto', 'orange', 180, [14, 70, 200, 550, 750, 950]),
  { type: 'evento', name: 'Evento', img: IMG.tile_evento },
  S('Cais dos Pescadores', 'orange', 180, [14, 70, 200, 550, 750, 950]),
  S('Mercado Velho', 'orange', 200, [16, 80, 220, 600, 800, 1000]),
  { type: 'upgrade', name: 'Ateliê do Arquiteto', img: IMG.tile_upgrade },
  S('Av. Rubi', 'red', 220, [18, 90, 250, 700, 875, 1050]),
  { type: 'fortuna', name: 'Fortuna', img: IMG.tile_fortuna },
  S('Boulevard Carmim', 'red', 220, [18, 90, 250, 700, 875, 1050]),
  S('Alameda Vermelha', 'red', 240, [20, 100, 300, 750, 925, 1100]),
  { type: 'station', name: 'Estação Sul', price: K(200), img: IMG.tile_station },
  S('Rua do Sol', 'yellow', 260, [22, 110, 330, 800, 975, 1150]),
  S('Jardim Dourado', 'yellow', 260, [22, 110, 330, 800, 975, 1150]),
  { type: 'utility', name: 'Cia. de Águas', price: K(150), img: IMG.tile_water },
  S('Mirante Solar', 'yellow', 280, [24, 120, 360, 850, 1025, 1200]),
  { type: 'gotojail', name: 'Vá para a Delegacia', img: IMG.tile_gotojail },
  S('Parque Esmeralda', 'green', 300, [26, 130, 390, 900, 1100, 1275]),
  S('Colina Verde', 'green', 300, [26, 130, 390, 900, 1100, 1275]),
  { type: 'evento', name: 'Evento', img: IMG.tile_evento },
  S('Bosque Imperial', 'green', 320, [28, 150, 450, 1000, 1200, 1400]),
  { type: 'station', name: 'Estação Oeste', price: K(200), img: IMG.tile_station },
  { type: 'fortuna', name: 'Fortuna', img: IMG.tile_fortuna },
  S('Avenida Safira', 'darkblue', 350, [35, 175, 500, 1100, 1300, 1500]),
  { type: 'tax', name: 'Taxa de Luxo', amount: K(100), img: IMG.tile_tax },
  S('Ilha dos Magnatas', 'darkblue', 400, [50, 200, 600, 1400, 1700, 2000]),
];
// níveis de construção de uma rua (0 = só o terreno … 5 = hotel)
const TIERS = [
  { name: 'Terreno', img: IMG.tier_0 }, { name: 'Casa', img: IMG.tier_1 }, { name: 'Sobrado', img: IMG.tier_2 },
  { name: 'Mansão', img: IMG.tier_3 }, { name: 'Prédio', img: IMG.tier_4 }, { name: 'Hotel', img: IMG.tier_5 },
];
const JAIL_POS = 10;
const UPGRADE_POS = 20;
const OWNABLE = t => t.type === 'street' || t.type === 'station' || t.type === 'utility';

const $m = v => fmtMoney(K(v));
const CARDS = {
  fortuna: [
    { text: `Avance até a Partida e receba ${$m(200)}.`, fx: 'moveTo', to: 0 },
    { text: 'Avance até a Ilha dos Magnatas.', fx: 'moveTo', to: 39 },
    { text: `Avance até a Av. Rubi. Se passar pela Partida, receba ${$m(200)}.`, fx: 'moveTo', to: 21 },
    { text: 'Pegue o trem! Avance até a estação mais próxima. Se tiver dono, pague o dobro do aluguel.', fx: 'nearestStation' },
    { text: 'Avance até a estação mais próxima. Se tiver dono, pague o dobro do aluguel.', fx: 'nearestStation' },
    { text: `Avance até a companhia mais próxima. Se tiver dono, lance os dados e pague ${fmtMoney(K(10))} por ponto.`, fx: 'nearestUtility' },
    { text: `Faça uma viagem até a Estação Norte. Se passar pela Partida, receba ${$m(200)}.`, fx: 'moveTo', to: 5 },
    { text: `Avance até a Av. das Palmeiras. Se passar pela Partida, receba ${$m(200)}.`, fx: 'moveTo', to: 11 },
    { text: 'Esqueceu a carteira. Volte 3 casas.', fx: 'back', n: 3 },
    { text: 'Flagrado furando fila. Vá direto para a Delegacia.', fx: 'jail' },
    { text: 'Advogado amigo: saia livre da Delegacia (guarde esta carta).', fx: 'jailCard' },
    { text: `O banco paga dividendos de ${$m(50)}.`, fx: 'money', amount: K(50) },
    { text: `Multa por excesso de velocidade: pague ${$m(15)}.`, fx: 'money', amount: -K(15) },
    { text: `Reformas gerais: pague ${$m(25)} por casa e ${$m(100)} por hotel.`, fx: 'repairs', house: K(25), hotel: K(100) },
    { text: `Eleito síndico do prédio: pague ${$m(50)} a cada jogador.`, fx: 'each', amount: -K(50) },
    { text: `Seu investimento em startups rendeu ${$m(150)}!`, fx: 'money', amount: K(150) },
  ],
  evento: [
    { text: `Avance até a Partida e receba ${$m(200)}.`, fx: 'moveTo', to: 0 },
    { text: `Erro do banco a seu favor: receba ${$m(200)}.`, fx: 'money', amount: K(200) },
    { text: `Consulta médica: pague ${$m(50)}.`, fx: 'money', amount: -K(50) },
    { text: `Venda de ações: receba ${$m(50)}.`, fx: 'money', amount: K(50) },
    { text: 'Indulto! Saia livre da Delegacia (guarde esta carta).', fx: 'jailCard' },
    { text: 'Denúncia anônima. Vá direto para a Delegacia.', fx: 'jail' },
    { text: `É seu aniversário! Receba ${$m(10)} de cada jogador.`, fx: 'each', amount: K(10) },
    { text: `Restituição do imposto: receba ${$m(20)}.`, fx: 'money', amount: K(20) },
    { text: `Seguro de vida rendeu: receba ${$m(100)}.`, fx: 'money', amount: K(100) },
    { text: `Conta do hospital: pague ${$m(100)}.`, fx: 'money', amount: -K(100) },
    { text: `Mensalidade do curso de culinária: pague ${$m(50)}.`, fx: 'money', amount: -K(50) },
    { text: `Reparos na rua: pague ${$m(40)} por casa e ${$m(115)} por hotel.`, fx: 'repairs', house: K(40), hotel: K(115) },
    { text: `Fundo de férias rendeu: receba ${$m(100)}.`, fx: 'money', amount: K(100) },
    { text: `Taxa de consultoria: receba ${$m(25)}.`, fx: 'money', amount: K(25) },
    { text: `Segundo lugar no concurso de culinária: receba ${$m(10)}.`, fx: 'money', amount: K(10) },
    { text: `Você recebeu uma herança: receba ${$m(100)}.`, fx: 'money', amount: K(100) },
  ],
};

// ===== Tempos das animações (ms) — o anfitrião espera por eles antes da próxima jogada de bot =====
// Virar a mesa (Magnata e Conjura): só visual. Qualquer jogador pode virar, mas depois que alguém vira
// a mesa leva um tempo para 'se recuperar' antes de poder ser virada de novo.
const TABLE_FLIP = { cooldown: 60000 };

const FX = {
  STEP: 290,
  time(e) {
    switch (e.k) {
      case 'roll': return e.utility ? 1700 : 2000;
      case 'walk': return Math.abs(e.steps) * FX.STEP + 350;
      case 'jump': return 1000;
      case 'card': return 3200;
      case 'money': return 450;
      case 'buy': return 900;
      case 'sold': return 1100;
      case 'auction': return 700;
      case 'turn': return 1100;
      case 'build': return 450;
      case 'bankrupt': return 2800;
      case 'intro': return 3300;
      case 'free': return 600;
      case 'deal': return 700;
      case 'win': return 400;
      case 'late': return 2200;
      case 'soldback': return 900;
      case 'seized': return 1700;
      case 'mortgage': return 500;
      case 'upgrade': return 1800;
      case 'land': return 2300;
      default: return 0;
    }
  },
  duration: evs => evs.reduce((s, e) => s + FX.time(e), 0),
};
