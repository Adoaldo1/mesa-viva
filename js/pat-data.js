// Patrimônio: casas, grupos e cartas do tabuleiro.
(function (root) {
  const GROUPS = {
    terra: { name: 'Mercados', c: '#9c5a33', l: '#efd9c3', d: '#5e3218' },
    ceu: { name: 'Litoral do Sol', c: '#2593a8', l: '#cfe9ea', d: '#0f5866' },
    ipe: { name: 'Casario', c: '#8a4a9c', l: '#e7d6ea', d: '#4f2560' },
    laranja: { name: 'Nossa Terra', c: '#d9761c', l: '#f8e0c4', d: '#8a4509' },
    vermelho: { name: 'Bahia', c: '#b92c38', l: '#f3d1cc', d: '#6e121c' },
    amarelo: { name: 'Capitais', c: '#dda416', l: '#fbedc2', d: '#8a6306' },
    mata: { name: 'Natureza', c: '#217a55', l: '#d0e6d7', d: '#0e4a30' },
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

  const SQ = [
    { k: 'go', name: 'Marco Zero', g: 'neutro' },
    p('terra', 'Mercado de Belém', 'Belém, PA', 'veropeso', 40, [1, 7, 20, 60, 105, 165], 30),
    mutirao,
    p('terra', 'Feira de Caruaru', 'Caruaru, PE', 'caruaru', 40, [3, 13, 40, 120, 210, 300], 30),
    { k: 'tax', g: 'neutro', name: 'Imposto de Renda', place: 'Pague 15%', art: 'leao', pct: 15 },
    r('Aeroporto Sul', 'Salgado Filho, Porto Alegre, RS', 'aviao'),
    p('ceu', 'Lençóis Maranhenses', 'Barreirinhas, MA', 'lencois', 70, [4, 20, 60, 180, 270, 370], 30),
    destino,
    p('ceu', 'Canoa Quebrada', 'Aracati, CE', 'canoa', 70, [4, 20, 60, 180, 270, 370], 30),
    p('ceu', 'Jericoacoara', 'Jijoca, CE', 'jeri', 80, [5, 27, 65, 200, 300, 400], 30),
    { k: 'jail', name: 'Delegacia', g: 'neutro' },
    p('ipe', 'Olinda', 'Olinda, PE', 'olinda', 90, [7, 35, 100, 300, 420, 500], 70),
    u('Usina de Energia', 'Itaipu, Foz do Iguaçu, PR', 'itaipu'),
    p('ipe', 'Paraty', 'Paraty, RJ', 'paraty', 90, [7, 35, 100, 300, 420, 500], 70),
    p('ipe', 'Pelourinho', 'Salvador, BA', 'pelourinho', 110, [8, 40, 120, 330, 470, 600], 70),
    r('Aeroporto Oeste', 'Marechal Rondon, Cuiabá, MT', 'aviao'),
    p('laranja', 'Terezinha', 'Terezinha, PE', 'terezinha', 120, [9, 45, 135, 370, 500, 630], 70),
    { k: 'casino', g: 'neutro', name: 'Cassino', place: 'Aposte se quiser', art: 'cassino' },
    p('laranja', 'Cachoeira do Sumidouro', 'Felício dos Santos, MG', 'sumidouro', 120, [9, 45, 135, 370, 500, 630], 70),
    p('laranja', 'Barragem do Descoberto', 'Águas Lindas, GO', 'descoberto', 130, [11, 55, 145, 400, 530, 670], 70),
    { k: 'free', name: 'Patrocinador', g: 'neutro' },
    p('vermelho', 'São Pedro de Ipiaú', 'Ipiaú, BA', 'saopedro', 150, [12, 60, 165, 470, 580, 700], 100),
    destino,
    p('vermelho', 'Santuário das Candeias', 'Candeias, BA', 'candeias', 150, [12, 60, 165, 470, 580, 700], 100),
    p('vermelho', 'Cristo', 'Vitória da Conquista, BA', 'cristo', 160, [13, 65, 200, 500, 620, 730], 100),
    r('Aeroporto Norte', 'Val de Cans, Belém, PA', 'aviao'),
    p('amarelo', 'Liberdade', 'São Paulo, SP', 'liberdade', 170, [15, 75, 220, 530, 650, 770], 100),
    p('amarelo', 'Avenida Paulista', 'São Paulo, SP', 'paulista', 170, [15, 75, 220, 530, 650, 770], 100),
    u('Usina de Água', 'Sistema Cantareira, Mairiporã, SP', 'cantareira'),
    p('amarelo', 'Brasília', 'Esplanada, DF', 'esplanada', 190, [16, 80, 240, 570, 680, 800], 100),
    { k: 'gotojail', name: 'Blitz!', g: 'neutro' },
    p('mata', 'Bonito', 'Bonito, MS', 'pantanal', 200, [17, 85, 260, 600, 730, 850], 130),
    p('mata', 'Cataratas do Iguaçu', 'Foz do Iguaçu, PR', 'iguacu', 200, [17, 85, 260, 600, 730, 850], 130),
    mutirao,
    p('mata', 'Fernando de Noronha', 'Noronha, PE', 'noronha', 210, [19, 100, 300, 670, 800, 930], 130),
    r('Aeroporto Leste', 'Santos Dumont, Rio de Janeiro, RJ', 'aviao'),
    destino,
    p('anil', 'Pão de Açúcar', 'Rio de Janeiro, RJ', 'pao', 230, [23, 115, 330, 730, 870, 1000], 130),
    { k: 'tax', g: 'neutro', name: 'Taxa do Lula', place: 'Pague 10%', art: 'luxo', pct: 10 },
    p('anil', 'Copacabana', 'Rio de Janeiro, RJ', 'copacabana', 270, [35, 135, 400, 930, 1130, 1330], 130),
  ];

  // Efeitos: goto, back, near, money, each, jail, free, repairs
  const CARDS = {
    destino: [
      { t: 'Uma van de turismo te leva até o Marco Zero. Receba R$ 130.', e: { goto: 0 } },
      { t: 'Subida da serra! Siga para o Cristo. Se passar pelo Marco Zero, receba R$ 130.', e: { goto: 24 } },
      { t: 'O Carnaval chamou. Siga para Olinda. Se passar pelo Marco Zero, receba R$ 130.', e: { goto: 11 } },
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
      { t: 'Réveillon na areia! Siga direto para Copacabana.', e: { goto: 39 } },
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
    { title: 'Romaria de Candeias', t: 'Fiéis de todo canto. Aluguel em dobro na Bahia.', e: { rent: { g: 'vermelho', x: 2 } } },
    { title: 'Festa em Terezinha', t: 'O Agreste em peso. Aluguel em dobro em Nossa Terra.', e: { rent: { g: 'laranja', x: 2 } } },
    { title: 'Sumidouro em cheia', t: 'Turista subindo a serra. Aluguel em dobro em Nossa Terra.', e: { rent: { g: 'laranja', x: 2 } } },
    { title: 'Alta temporada', t: 'Praia cheia. Aluguel em dobro no Litoral do Sol.', e: { rent: { g: 'ceu', x: 2 } } },
    { title: 'Carnaval chegou', t: 'Ladeira tomada. Aluguel em dobro no Casario.', e: { rent: { g: 'ipe', x: 2 } } },
    { title: 'Feira lotada', t: 'Movimento recorde. Aluguel em dobro nos Mercados.', e: { rent: { g: 'terra', x: 2 } } },
    { title: 'Réveillon na areia', t: 'Fogos no mar. Aluguel em dobro no Rio de Janeiro.', e: { rent: { g: 'anil', x: 2 } } },
    { title: 'Semana da natureza', t: 'Parques cheios. Aluguel em dobro na Natureza.', e: { rent: { g: 'mata', x: 2 } } },
    { title: 'Congresso em peso', t: 'Hotéis lotados. Aluguel em dobro nas Capitais.', e: { rent: { g: 'amarelo', x: 2 } } },
    { title: 'Feriadão', t: 'Todo mundo viajando. Aeroportos em dobro.', e: { rent: { g: 'rail', x: 2 } } },
    { title: 'Greve geral', t: 'Nada decola. Aeroportos pela metade.', e: { rent: { g: 'rail', x: .5 } } },
    { title: 'Apagão', t: 'Conta suspensa. Usinas pela metade.', e: { rent: { g: 'util', x: .5 } } },
    { title: 'Seca brava', t: 'Sem visitante. Natureza pela metade.', e: { rent: { g: 'mata', x: .5 } } },
    { title: 'Chuva sem fim', t: 'Praia vazia. Litoral do Sol pela metade.', e: { rent: { g: 'ceu', x: .5 } } },
    { title: 'Obra na avenida', t: 'Trânsito parado. Capitais pela metade.', e: { rent: { g: 'amarelo', x: .5 } } },
    { title: 'Cimento subiu', t: 'Construir custa 50% a mais.', e: { build: 1.5 } },
    { title: 'Obra barata', t: 'Construir custa metade.', e: { build: .5 } },
    { title: 'Feirão de imóveis', t: 'Comprar lugar sem dono custa 20% a menos.', e: { buy: .8 } },
    { title: 'Especulação', t: 'Comprar lugar sem dono custa 25% a mais.', e: { buy: 1.25 } },
    { title: 'Anistia fiscal', t: 'Ninguém paga imposto nesta volta.', e: { tax: 0 } },
    { title: 'Leão faminto', t: 'Impostos em dobro nesta volta.', e: { tax: 2 } },
    { title: 'Décimo terceiro', t: 'Marco Zero paga 50% a mais.', e: { salary: 1.5 } },
    { title: 'Salário atrasado', t: 'Marco Zero paga metade.', e: { salary: .5 } },
  ];
  const ROULETTE_RED = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
  // só roleplay: o motivo da batida na Blitz, sorteado a cada vez
  const CRIMES = ['lavagem de dinheiro', 'receptação', 'assassinato', 'assédio', 'sonegação de imposto', 'estelionato', 'contrabando de queijo', 'formação de quadrilha', 'jogo do bicho', 'pirataria', 'desacato à autoridade', 'corrupção passiva', 'rachadinha', 'gato de luz', 'tráfico de influência', 'roubo de galinha', 'falsidade ideológica', 'peculato', 'venda de rifa falsa', 'fraude no bingo da igreja', 'dirigir sem cinto'];
  const D = { CRIMES, ROULETTE_RED, GROUPS, SQ, CARDS, TOKENS, COLORS, NEWS };
  if (typeof module !== 'undefined') module.exports = D; else root.PD = D;
})(typeof window !== 'undefined' ? window : globalThis);
