// Patrimônio: casas, grupos e cartas do tabuleiro.
(function (root) {
  const GROUPS = {
    terra: { name: 'Pará', c: '#9c5a33', l: '#efd9c3', d: '#5e3218' },
    ceu: { name: 'Ceará', c: '#2593a8', l: '#cfe9ea', d: '#0f5866' },
    ipe: { name: 'Pernambuco', c: '#8a4a9c', l: '#e7d6ea', d: '#4f2560' },
    laranja: { name: 'DF e Entorno', c: '#d9761c', l: '#f8e0c4', d: '#8a4509' },
    vermelho: { name: 'Bahia', c: '#b92c38', l: '#f3d1cc', d: '#6e121c' },
    amarelo: { name: 'São Paulo', c: '#dda416', l: '#fbedc2', d: '#8a6306' },
    mata: { name: 'Minas Gerais', c: '#217a55', l: '#d0e6d7', d: '#0e4a30' },
    anil: { name: 'Rio de Janeiro', c: '#1d3f86', l: '#d0daec', d: '#0d2150' },
    rail: { name: 'Aeroportos', c: '#2c3b4b', l: '#dde0e0', d: '#131c26' },
    util: { name: 'Usinas', c: '#3f6f7c', l: '#d6e6e6', d: '#1b4450' },
    neutro: { name: '', c: '#7a5a34', l: '#f0e3c9', d: '#3a2a16' },
  };
  const p = (g, name, place, art, price, rent, house) => ({ k: 'prop', g, name, place, art, price, rent, house });
  const r = (name, place, art) => ({ k: 'rail', g: 'rail', name, place, art, price: 130 });
  const u = (name, place, art) => ({ k: 'util', g: 'util', name, place, art, price: 100 });
  const destino = { k: 'destino', g: 'neutro', name: 'Sorte', art: 'destino' };
  const mutirao = { k: 'mutirao', g: 'neutro', name: 'Imprevisto', art: 'mutirao' };

  // aluguéis iguais aos do Magnata (js/data.js), já com a curva achatada no topo
  const SQ = [
    { k: 'go', name: 'Marco Zero', g: 'neutro' },
    p('terra', 'Santarém', 'Santarém, PA', 'alter', 40, [2, 9, 35, 61, 88, 115], 25),
    mutirao,
    p('terra', 'Belém', 'Belém, PA', 'veropeso', 40, [4, 17, 44, 100, 155, 185], 35),
    { k: 'tax', g: 'neutro', name: 'Imposto de Renda', place: 'Pague 15%', art: 'leao', pct: 15 },
    r('Aeroporto Sul', 'Salgado Filho, Porto Alegre, RS', 'aviao'),
    p('ceu', 'Aracati', 'Canoa Quebrada, CE', 'canoa', 70, [5, 25, 66, 155, 190, 225], 30),
    destino,
    p('ceu', 'Jijoca', 'Jericoacoara, CE', 'jeri', 70, [5, 25, 66, 155, 190, 225], 35),
    p('ceu', 'Fortaleza', 'Praia de Iracema, CE', 'iracema', 80, [7, 33, 73, 170, 215, 250], 40),
    { k: 'jail', name: 'Delegacia', g: 'neutro' },
    p('ipe', 'Petrolina', 'Rio São Francisco, PE', 'petrolina', 90, [9, 42, 110, 255, 310, 360], 60),
    u('Usina de Energia', 'Itaipu, Foz do Iguaçu, PR', 'itaipu'),
    p('ipe', 'Terezinha', 'Terezinha, PE', 'terezinha', 90, [9, 42, 110, 255, 310, 360], 65),
    p('ipe', 'Recife', 'Recife Antigo, PE', 'recife', 110, [10, 50, 130, 285, 335, 390], 80),
    r('Aeroporto Oeste', 'Marechal Rondon, Cuiabá, MT', 'aviao'),
    p('laranja', 'Águas Lindas', 'Barragem do Descoberto, GO', 'descoberto', 120, [12, 58, 145, 310, 365, 420], 75),
    { k: 'casino', g: 'neutro', name: 'Cassino', place: 'Aposte se quiser', art: 'cassino' },
    p('laranja', 'Taguatinga', 'Praça do Relógio, DF', 'taguatinga', 120, [12, 58, 145, 310, 365, 420], 80),
    p('laranja', 'Brasília', 'Esplanada, DF', 'esplanada', 130, [14, 67, 160, 340, 395, 455], 85),
    { k: 'free', name: 'Patrocinador', g: 'neutro' },
    p('vermelho', 'Ipiaú', 'Ipiaú, BA', 'saopedro', 150, [16, 75, 185, 395, 475, 555], 100),
    destino,
    p('vermelho', 'Vitória da Conquista', 'Cristo, BA', 'cristo', 150, [16, 75, 185, 395, 475, 555], 105),
    p('vermelho', 'Salvador', 'Pelourinho, BA', 'pelourinho', 160, [17, 83, 220, 425, 505, 585], 110),
    r('Aeroporto Norte', 'Val de Cans, Belém, PA', 'aviao'),
    p('amarelo', 'Santos', 'Porto e praia, SP', 'santos', 170, [19, 92, 240, 455, 535, 615], 115),
    p('amarelo', 'Campinas', 'Catedral, SP', 'campinas', 170, [19, 92, 240, 455, 535, 615], 120),
    u('Usina de Água', 'Sistema Cantareira, Mairiporã, SP', 'cantareira'),
    p('amarelo', 'São Paulo', 'Avenida Paulista, SP', 'paulista', 190, [21, 100, 265, 480, 560, 645], 130),
    { k: 'gotojail', name: 'Blitz!', g: 'neutro' },
    p('mata', 'Três Marias', 'Represa, MG', 'tresmarias', 200, [23, 110, 285, 510, 620, 725], 165),
    p('mata', 'Ouro Preto', 'Ouro Preto, MG', 'ouropreto', 200, [23, 110, 285, 510, 620, 725], 170),
    mutirao,
    p('mata', 'Belo Horizonte', 'Pampulha, MG', 'pampulha', 210, [24, 125, 330, 565, 675, 785], 180),
    r('Aeroporto Leste', 'Santos Dumont, Rio de Janeiro, RJ', 'aviao'),
    destino,
    p('anil', 'Paraty', 'Paraty, RJ', 'paraty', 230, [30, 145, 365, 625, 730, 840], 200),
    { k: 'tax', g: 'neutro', name: 'Taxa do Lula', place: 'Pague 27%', art: 'luxo', pct: 27 },
    p('anil', 'Rio de Janeiro', 'Copacabana, RJ', 'copacabana', 270, [43, 165, 440, 795, 910, 1050], 250),
  ];

  // Efeitos: goto, back, near, money, each, jail, free, repairs
  const CARDS = {
    destino: [
      { t: 'Uma van de turismo te leva até o Marco Zero. Receba R$ 130.', e: { goto: 0 } },
      { t: 'Subida da ladeira! Siga para Salvador. Se passar pelo Marco Zero, receba R$ 130.', e: { goto: 24 } },
      { t: 'O São João chamou. Siga para Petrolina. Se passar pelo Marco Zero, receba R$ 130.', e: { goto: 11 } },
      { t: 'A conta chegou. Vá à usina mais próxima. Se tiver dono, jogue os dados e pague 7 vezes o resultado.', e: { near: 'util' } },
      { t: 'Hora de embarcar. Vá ao aeroporto mais próximo. Se tiver dono, pague o dobro do aluguel.', e: { near: 'rail' } },
      { t: 'Perdeu a hora e correu. Vá ao aeroporto mais próximo. Se tiver dono, pague o dobro do aluguel.', e: { near: 'rail' } },
      { t: 'O fundo do banco rendeu dividendos. Receba R$ 35.', e: { money: 35 } },
      { t: 'Habeas corpus! Guarde esta carta e saia da Delegacia de graça.', e: { free: true } },
      { t: 'Esqueceu a carteira em casa. Volte 3 casas.', e: { back: 3 } },
      { t: 'Foi pego furando a fila do pão de queijo. Vá direto para a Delegacia.', e: { jail: true } },
      { t: 'Reforma geral nas suas posses. Pague R$ 15 por obra e R$ 65 por hotel.', e: { repairs: [15, 65] } },
      { t: 'Multa de trânsito na ladeira. Pague R$ 10.', e: { money: -10 } },
      { t: 'Passagem comprada de última hora. Siga para o Aeroporto Sul. Se passar pelo Marco Zero, receba R$ 130.', e: { goto: 5 } },
      { t: 'Réveillon na areia! Siga direto para o Rio de Janeiro.', e: { goto: 39 } },
      { t: 'Virou síndico do prédio e a conta sobrou para você. Pague R$ 35 a cada jogador.', e: { each: -35 } },
      { t: 'Seu bolão acertou a quina. Receba R$ 100.', e: { money: 100 } },
    ],
    mutirao: [
      { t: 'A vizinhança te leva em festa até o Marco Zero. Receba R$ 130.', e: { goto: 0 } },
      { t: 'O banco errou a seu favor. Receba R$ 130.', e: { money: 130 } },
      { t: 'Consulta no posto ficou cara. Pague R$ 35.', e: { money: -35 } },
      { t: 'Vendeu seu bolo de rolo na feira. Receba R$ 35.', e: { money: 35 } },
      { t: 'Um primo advogado resolveu tudo. Guarde esta carta e saia da Delegacia de graça.', e: { free: true } },
      { t: 'Confusão no boteco acabou mal. Vá direto para a Delegacia.', e: { jail: true } },
      { t: 'Caiu o décimo terceiro. Receba R$ 70.', e: { money: 70 } },
      { t: 'Restituição do imposto. Receba R$ 15.', e: { money: 15 } },
      { t: 'É seu aniversário! Cada jogador te dá R$ 5.', e: { each: 5 } },
      { t: 'O seguro de vida rendeu. Receba R$ 70.', e: { money: 70 } },
      { t: 'Conta do hospital. Pague R$ 70.', e: { money: -70 } },
      { t: 'Mensalidade da escola venceu. Pague R$ 35.', e: { money: -35 } },
      { t: 'Deu uma consultoria para o vizinho. Receba R$ 15.', e: { money: 15 } },
      { t: 'Reforma da rua. Pague R$ 25 por obra e R$ 75 por hotel.', e: { repairs: [25, 75] } },
      { t: 'Segundo lugar no concurso de samba do bairro. Receba R$ 5.', e: { money: 5 } },
      { t: 'A tia deixou uma herança. Receba R$ 70.', e: { money: 70 } },
    ],
  };
  // o peão é sempre o mesmo; muda só o chapéu
  const TOKENS = [
    { id: 'peao', name: 'Sem chapéu' }, { id: 'palha', name: 'Chapéu de palha' }, { id: 'bone', name: 'Boné' },
    { id: 'cangaco', name: 'Chapéu de cangaço' }, { id: 'cartola', name: 'Cartola' }, { id: 'sertanejo', name: 'Chapéu sertanejo' },
    { id: 'coroa', name: 'Coroa' }, { id: 'obra', name: 'Capacete de obra' }, { id: 'chef', name: 'Chapéu de chef' }, { id: 'boina', name: 'Boina' }, { id: 'festa', name: 'Chapéu de festa' }, { id: 'quepe', name: 'Quepe' },
  ];
  const COLORS = ['#d8432f', '#2377c9', '#e0a21b', '#2c9a68', '#9a4fb0', '#e8e2d2'];
  // as tabelas ficam em milhares; os textos mostram o valor por extenso
  const mil = t => t.replace(/R\$ (\d+)/g, (_, n) => 'R$ ' + (+n * 1000).toLocaleString('pt-BR'));
  SQ.forEach(q => { if (q.place) q.place = mil(q.place); });
  CARDS.destino.concat(CARDS.mutirao).forEach(c => { c.t = mil(c.t); });
  const NEWS = [
    { title: 'São Pedro em Ipiaú', t: 'Cidade lotada. Aluguel em dobro na Bahia.', e: { rent: { g: 'vermelho', x: 2 } } },
    { title: 'Carnaval em Salvador', t: 'Trio na rua. Aluguel em dobro na Bahia.', e: { rent: { g: 'vermelho', x: 2 } } },
    { title: 'Festa em Terezinha', t: 'O Agreste em peso. Aluguel em dobro em Pernambuco.', e: { rent: { g: 'ipe', x: 2 } } },
    { title: 'Represa cheia', t: 'Turista em Três Marias. Aluguel em dobro em Minas Gerais.', e: { rent: { g: 'mata', x: 2 } } },
    { title: 'Alta temporada', t: 'Praia cheia. Aluguel em dobro no Ceará.', e: { rent: { g: 'ceu', x: 2 } } },
    { title: 'Sessão no Congresso', t: 'Brasília lotada. Aluguel em dobro no DF e Entorno.', e: { rent: { g: 'laranja', x: 2 } } },
    { title: 'Feira lotada', t: 'Movimento recorde. Aluguel em dobro no Pará.', e: { rent: { g: 'terra', x: 2 } } },
    { title: 'Réveillon na areia', t: 'Fogos no mar. Aluguel em dobro no Rio de Janeiro.', e: { rent: { g: 'anil', x: 2 } } },
    { title: 'Festival de inverno', t: 'Serra cheia. Aluguel em dobro em Minas Gerais.', e: { rent: { g: 'mata', x: 2 } } },
    { title: 'Fórmula 1 na cidade', t: 'Hotéis lotados. Aluguel em dobro em São Paulo.', e: { rent: { g: 'amarelo', x: 2 } } },
    { title: 'Feriadão', t: 'Todo mundo viajando. Aeroportos em dobro.', e: { rent: { g: 'rail', x: 2 } } },
    { title: 'Greve geral', t: 'Nada decola. Aeroportos pela metade.', e: { rent: { g: 'rail', x: .5 } } },
    { title: 'Apagão', t: 'Conta suspensa. Usinas pela metade.', e: { rent: { g: 'util', x: .5 } } },
    { title: 'Seca brava', t: 'Sem visitante. Minas Gerais pela metade.', e: { rent: { g: 'mata', x: .5 } } },
    { title: 'Chuva sem fim', t: 'Praia vazia. Ceará pela metade.', e: { rent: { g: 'ceu', x: .5 } } },
    { title: 'Obra na avenida', t: 'Trânsito parado. São Paulo pela metade.', e: { rent: { g: 'amarelo', x: .5 } } },
    { title: 'Cimento subiu', t: 'Construir custa 25% a mais.', e: { build: 1.25 } },
    { title: 'Obra barata', t: 'Construir custa 25% a menos.', e: { build: .75 } },
    { title: 'Feirão de imóveis', t: 'Comprar lugar sem dono custa 20% a menos.', e: { buy: .8 } },
    { title: 'Especulação', t: 'Comprar lugar sem dono custa 25% a mais.', e: { buy: 1.25 } },
    { title: 'Anistia fiscal', t: 'Ninguém paga imposto nesta volta.', e: { tax: 0 } },
    { title: 'Leão faminto', t: 'Impostos em dobro nesta volta.', e: { tax: 2 } },
    { title: 'Décimo terceiro', t: 'Marco Zero paga 50% a mais.', e: { salary: 1.5 } },
    { title: 'Lula ganhou a eleição', t: 'A inflação disparou: terreno, obra, aluguel e imposto custam o dobro.', e: { buy: 2, build: 2, tax: 2, rentAll: 2 } },
    { title: 'Salário atrasado', t: 'Marco Zero paga metade.', e: { salary: .5 } },
  ];
  const ROULETTE_RED = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
  // só roleplay: o motivo da batida na Blitz, sorteado a cada vez
  const CRIMES = ['lavagem de dinheiro', 'receptação', 'assassinato', 'assédio', 'sonegação de imposto', 'estelionato', 'contrabando de queijo', 'formação de quadrilha', 'jogo do bicho', 'pirataria', 'desacato à autoridade', 'corrupção passiva', 'rachadinha', 'gato de luz', 'tráfico de influência', 'roubo de galinha', 'falsidade ideológica', 'peculato', 'venda de rifa falsa', 'fraude no bingo da igreja', 'dirigir sem cinto'];
  const D = { CRIMES, ROULETTE_RED, GROUPS, SQ, CARDS, TOKENS, COLORS, NEWS };
  if (typeof module !== 'undefined') module.exports = D; else root.PD = D;
})(typeof window !== 'undefined' ? window : globalThis);
