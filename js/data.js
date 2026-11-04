// ===== Dados estáticos: artes, personagens, tabuleiro, cartas =====
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
  card_fortuna: 'assets/card_fortuna.webp',
  card_evento: 'assets/card_evento.webp',
  tile_start: 'assets/tile_start.webp',
  tile_jail: 'assets/tile_jail.webp',
  tile_park: 'assets/tile_park.webp',
  tile_upgrade: 'assets/tile_upgrade.webp',
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
const LUDO_EMOTES = ['😂', '😭', '😡', '👏', '🔥', '😎', '🎉', '👍', '😱', '🤡', '💀', '❤️'];

const GAME_LIBRARY = [
  { id: 'magnata', name: 'Magnata', desc: 'Compre bairros, construa casas e hotéis e leve seus amigos à falência.', players: '2–8', cover: IMG.cover_magnata, ready: true },
  { id: 'ludo', name: 'Ludo', desc: 'Corrida de peões clássica: tire 1 ou 6 para sair, capture os rivais e leve as 4 peças ao centro.', players: '2–6', cover: IMG.cover_ludo, ready: true, icon: '🎯' },
  { id: 'damas', name: 'Damas', desc: 'Clássico de estratégia para dois.', players: '2', ready: false, icon: '⚫' },
  { id: 'corrida', name: 'Corrida de Peões', desc: 'Dados, sorte e muita trapaça amigável.', players: '2–4', ready: false, icon: '🏁' },
  { id: 'cartas', name: 'Mesa de Cartas', desc: 'Baralho livre para qualquer jogo de cartas.', players: '2–8', ready: false, icon: '🃏' },
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
  START: 1000000, GO: K(200), JAIL_FINE: K(50), MIN_BID: K(10), STATION: K(25),
  UTIL1: K(4), UTIL2: K(10), CARD_VALUE: K(50),
  START_OPTIONS: [750000, 1000000, 1500000, 2000000],
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

const S = (name, group, price, rent) => ({ type: 'street', name, group, price: K(price), rent: rent.map(K) });
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
      case 'bankrupt': return 1600;
      case 'free': return 600;
      case 'deal': return 700;
      case 'win': return 400;
      case 'upgrade': return 1800;
      case 'land': return 2300;
      default: return 0;
    }
  },
  duration: evs => evs.reduce((s, e) => s + FX.time(e), 0),
};
