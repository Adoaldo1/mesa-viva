// ===== Vida Adulta: tabuleiro (casas, ligações e traçado) =====
// Tipos: start, prof, pay (pay.interest = também cobra juros das notas), event (amt +/−; ins = seguro que protege),
// vinganca, lifeins (libera seguro de vida), stockbuy (libera ações), bolsa, kid (n = 1 ou 2), wedding, apartment, toll,
// sorte, juizo, millionaire. Cores das casas conforme o manual: pagamento verde, vingança amarelo claro, apólices azul,
// ações roxo, filhos rosa, profissões cinza.
const VIDA_PROFS = {
  empreendedor: { name: 'Empreendedor', salary: 12000, icon: '💼' },
  especialista: { name: 'Especialista em Redes Sociais', salary: 16000, icon: '🤳' },
  publicitario: { name: 'Publicitário', salary: 20000, icon: '📣' },
  chef: { name: 'Chef de Cozinha', salary: 22000, icon: '👨‍🍳' },
  engenheiro: { name: 'Engenheiro', salary: 26000, icon: '👷' },
  advogado: { name: 'Advogado', salary: 28000, icon: '⚖️' },
  medico: { name: 'Médico', salary: 32000, icon: '🩺' },
};
const VIDA_PRICES = { carIns: 1000, houseIns: 10000, lifeIns: 10000, stock: 50000, noteGet: 20000, notePay: 25000, noteInterest: 1000, apartment: 60000,
  vinganca: 200000, toll: 24000, kidJudgment: 48000, millionBonus: 240000, luckyPay: 24000, betMax: 24000, sorte: 20000, sorteWin: 300000, stockValue: 120000, lifeValue: 8000,
  bolsaLose: 60000, bolsaWin: 120000, startCash: 10000 };

const VIDA_BOARD = (() => {
  const S = [];
  const add = (seg, o) => { const id = S.length; S.push({ id, seg, next: [], ...o }); return id; };
  const chain = (seg, list, from) => { let last = from; const ids = []; for (const o of list) { const id = add(seg, o); if (last != null) S[last].next.push(id); last = id; ids.push(id); } return ids; };
  const E = (amt, text, ins) => ({ type: 'event', amt, text, ...(ins ? { ins } : {}) });
  const PAY = (interest) => ({ type: 'pay', ...(interest ? { interest: true } : {}) });
  const start = add('start', { type: 'start', text: 'Saída: boa sorte, você vai precisar.' });
  // caminho dos NEGÓCIOS (curto)
  const neg = chain('neg', [
    E(-5000, 'Abriu um CNPJ às 3 da manhã depois de um vídeo de coach. Pague $5.000 em "mentoria".'),
    PAY(),
    E(10000, 'O primeiro cliente pagou em dia. Milagre! Receba $10.000.'),
    { type: 'vinganca' },
    E(-3000, 'O investidor-anjo era só um tio bêbado no churrasco. Pague $3.000 da cerveja.'),
    E(15000, 'Dançou no vídeo da empresa e viralizou. Receba $15.000 de publi.'),
    PAY(),
  ], start);
  // caminho da FACULDADE (longo, com as profissões)
  const fac = chain('fac', [
    E(-5000, 'Matrícula, material e xerox da apostila. Pague $5.000.'),
    { type: 'prof', prof: 'publicitario' },
    E(-2000, 'Calourada open bar. Você não lembra de nada, mas o Pix lembra. Pague $2.000.'),
    { type: 'prof', prof: 'chef' },
    E(0, 'Estágio não remunerado "pela experiência". Não ganha nada além de olheiras.'),
    { type: 'prof', prof: 'engenheiro' },
    { type: 'vinganca' },
    { type: 'prof', prof: 'advogado' },
    E(8000, 'Vendeu brigadeiro no campus e pagou o semestre. Receba $8.000.'),
    { type: 'prof', prof: 'medico' },
    E(5000, 'O TCC passou (ninguém leu). Receba $5.000 da bolsa de pesquisa.'),
    E(-10000, 'Formatura com DJ, fotógrafo e tia chorando no microfone. Pague $10.000.'),
  ], start);
  // estrada principal
  const main1 = chain('main', [
    PAY(),
    { type: 'lifeins', text: 'Um corretor de seguros te encurralou no aniversário da firma.' },
    E(-4000, 'Dividiu apê com três desconhecidos e um gato. Pague $4.000 de caução.'),
    { type: 'vinganca' },
    E(10000, 'Achou $10.000 no bolso da calça que foi para a máquina. Receba $10.000.'),
    PAY(),
    E(-15000, 'Bateu o carro dando ré no estacionamento do motel. Pague $15.000.', 'car'),
    { type: 'wedding' },
    E(-8000, 'A lua de mel foi incrível; a fatura do cartão, nem tanto. Pague $8.000.'),
    { type: 'kid', n: 1, text: 'Nasceu um bebê! Dormir agora é só uma lenda.' },
    PAY(true),
    E(-6000, 'A sogra veio passar "uns dias". Já são quatro meses. Pague $6.000 de mercado.'),
    { type: 'stockbuy', text: 'Um guru de investimentos do Instagram te adicionou no grupo VIP.' },
    E(12000, 'Ganhou a rifa da firma: uma air fryer e $12.000. Receba $12.000.'),
    { type: 'apartment' },
    E(-25000, 'O vizinho de cima esqueceu a banheira ligada. Pague $25.000.', 'house'),
    { type: 'kid', n: 1, text: 'Outro bebê. Vocês não têm TV em casa?' },
    PAY(),
    { type: 'bolsa' },
    { type: 'vinganca' },
    E(-10000, 'Gripe, virose e ressaca na mesma semana. Pague $10.000 de farmácia.', 'life'),
    { type: 'sorte' },
    { type: 'kid', n: 2, text: 'GÊMEOS! O ultrassom mentiu.' },
    PAY(),
    { type: 'toll' },
    E(-5000, 'Seu podcast sobre criptomoedas teve 3 ouvintes (sua mãe e dois bots). Pague $5.000.'),
    { type: 'bolsa' },
    E(-20000, 'Deixou o carro na rua e levaram até o volante. Pague $20.000.', 'car'),
  ], fac[fac.length - 1]);
  S[neg[neg.length - 1]].next.push(main1[0]);
  const fork2 = main1[main1.length - 1];
  // bifurcação: VIDA LOUCA (curta, arriscada) × VIDA TRANQUILA (longa)
  const louca = chain('louca', [
    E(-20000, 'Apostou no cavalo errado. Literalmente: o cavalo era seu. Pague $20.000.'),
    E(40000, 'Seu NFT de macaco valorizou um dia antes de virar pó. Vendeu a tempo: receba $40.000.'),
    { type: 'vinganca' },
    { type: 'bolsa' },
    E(-25000, 'Viagem a Las Vegas: o que acontece lá fica na fatura. Pague $25.000.'),
    PAY(true),
  ], fork2);
  const tranq = chain('tranq', [
    PAY(),
    { type: 'kid', n: 1, text: 'Mais um bebê. A essa altura é hobby.' },
    E(2000, 'A horta orgânica da varanda rendeu três tomates. Receba $2.000.'),
    E(-3000, 'Reunião de condomínio de quatro horas por causa de uma vaga. Pague $3.000 de taxa extra.'),
    { type: 'sorte' },
    { type: 'kid', n: 1, text: 'Bebê surpresa aos 40. Surpresa mesmo.' },
    E(20000, 'Promoção no trabalho! Receba $20.000 de bônus (e o dobro de reuniões).'),
    PAY(),
    E(-6000, 'O cachorro comeu o controle, o sofá e o tapete. Pague $6.000.'),
  ], fork2);
  const main2 = chain('main2', [
    PAY(),
    E(-40000, 'O churrasco de domingo pegou fogo na varanda. Pague $40.000.', 'house'),
    { type: 'kid', n: 1, text: 'Nasceu mais um. O carro já não fecha a porta.' },
    { type: 'bolsa' },
    { type: 'vinganca' },
    E(-30000, 'Crise dos 40: comprou uma moto que não sabe pilotar. Pague $30.000.'),
    PAY(true),
    E(50000, 'Ganhou o processo contra o banco. Receba $50.000.'),
    { type: 'sorte' },
    E(-15000, 'Implante capilar na Turquia, com direito a kebab. Pague $15.000.'),
    PAY(),
    E(-30000, 'Infartou rindo no stand-up de piadas de tiozão. Pague $30.000.', 'life'),
    { type: 'juizo' },
  ], louca[louca.length - 1]);
  S[tranq[tranq.length - 1]].next.push(main2[0]);
  const juizo = main2[main2.length - 1];
  const fim = chain('fim', [
    E(-10000, 'Festa de aposentadoria com pagode até o sol nascer. Pague $10.000.'),
    PAY(),
    E(80000, 'Herança de uma tia-avó que você nem lembrava que existia. Receba $80.000.'),
    { type: 'bolsa' },
    { type: 'millionaire' },
  ], juizo);
  // anteriores, distância mínima da saída (para voltar pelo lado mais curto) e passos até o fim
  S.forEach(s => (s.prev = []));
  S.forEach(s => s.next.forEach(n => S[n].prev.push(s.id)));
  const d = Array(S.length).fill(Infinity); d[start] = 0; const q = [start];
  while (q.length) { const u = q.shift(); for (const v of S[u].next) if (d[v] > d[u] + 1) { d[v] = d[u] + 1; q.push(v); } }
  S.forEach((s, i) => (s.d = d[i]));
  // traçado no tabuleiro (unidades do mundo 3D; tabuleiro de 20 × 13)
  const ROUTE = {
    neg: [[-8.6, 5.2], [-6.8, 5.6], [-4.8, 5.4], [-3.2, 5.0]],
    fac: [[-8.9, 3.6], [-8.9, 1.0], [-8.4, -1.4], [-6.6, -2.2], [-4.9, -1.1], [-4.4, 1.4], [-3.4, 3.6]],
    main: [[-2.0, 4.8], [0.0, 5.4], [2.2, 5.5], [4.4, 5.3], [6.4, 5.4], [8.4, 4.8], [8.9, 3.0], [8.2, 1.4], [6.2, 1.1], [4.2, 1.6], [2.2, 1.9], [0.6, 2.4]],
    louca: [[-0.6, 1.2], [-1.6, 0.0], [-1.2, -1.2], [0.2, -1.6]],
    tranq: [[0.0, 2.6], [-2.2, 2.2], [-3.2, 0.6], [-3.0, -1.8], [-1.6, -2.9], [0.4, -2.9]],
    main2: [[1.6, -1.8], [3.2, -1.2], [5.0, -0.9], [7.0, -0.6], [8.8, -1.6], [8.6, -3.6], [6.8, -4.6], [4.6, -4.8], [2.6, -4.6]],
    fim: [[1.0, -4.9], [-1.0, -5.3], [-3.2, -5.2], [-5.4, -4.8], [-7.6, -4.4]],
  };
  return { spaces: S, start, juizo, fork2, route: ROUTE, startPos: [-8.9, 5.2], segs: { neg, fac, main1, louca, tranq, main2, fim } };
})();
