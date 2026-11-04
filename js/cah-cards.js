// ===== Cartas Contra a Humanidade — cartas do jogo original (tradução para o português de Marcelo) =====
// Cards Against Humanity é distribuído sob a licença Creative Commons BY-NC-SA 2.0 (uso livre, sem fins comerciais, com crédito).
// Cartas pretas: t = texto ("_" marca cada lacuna), p = quantas cartas brancas jogar (PICK). As de PICK 3 também têm DRAW 2.
const CAH_WHITE = [
"Uma maldição cigana.",
"Um momento de silêncio.",
"Um festival da linguiça.",
"Um policial honesto sem nada a perder.",
"Escassez de comida.",
"Bactéria carnívora.",
"Erva para aumentar a libido.",
"Não dar a mínima para o Terceiro Mundo.",
"Sexting.",
"Transmutação corpórea.",
"Atrizes pornô.",
"Estuprar e saquear.",
"72 virgens.",
"Fuzilamento.",
"Um paradoxo de viagem no tempo.",
"Autêntica cozinha mexicana.",
"Cintilante.",
"Consultores.",
"Dívida monstruosa.",
"Problemas com o pai na infância.",
"Cotas raciais.",
"Deixar o lustre cair sobre seus inimigos enquanto a outra ponta da corda te lança pra cima.",
"O ex-presidente George W. Bush.",
"Nudez frontal.",
"Injeções hormonais.",
"Pôr um ovo.",
"Assistir Cartoon Network pelado(a).",
"Fingir que se importa.",
"Pagar mico em público.",
"Compartilhar agulhas.",
"Meleca de nariz.",
"A inevitável morte térmica do universo.",
"O milagre do parto.",
"O apocalise.",
"Passar o rodo.",
"O privilégio de ser branco.",
"Deveres da esposa.",
"Uma viagem para Pelotas.",
"Desodorante AXE.",
"O sangue de Cristo.",
"Horríveis acidentes causados por depilação a laser.",
"BATMAN!!!",
"Agricultura.",
"Um mongolóide vigoroso.",
"Seleção natural.",
"Aborto clandestino.",
"Comer todos os doces que deveriam ser vendidos na campanha de caridade.",
"Os braços da Michelle Obama.",
"O jogo World of Warcraft.",
"Cobiçar a mulher do próximo.",
"Obesidade.",
"Um clipe homo-erótico sobre voleibol.",
"Tétano.",
"Exibição para fins de acasalamento.",
"Torção testicular.",
"Buffet de camarão livre por R$ 4,99.",
"Feijoada.",
"Kanye West.",
"Queijo quente.",
"Ataques de velociraptor.",
"Tirar a camisa.",
"Esmegma.",
"Alcoholismo.",
"Um cara de meia idade andando de patins.",
"Os raios de sentimentos bons dos Ursinhos Carinhosos.",
"Empanturrar-se e purgar-se.",
"Pirulitos gigantes.",
"Auto-repugnância.",
"Crianças na coleira.",
"Preliminares meia-boca.",
"A Bíblia Sagrada.",
"Pornô calabouço-alemão.",
"Estar em chamas.",
"Gravidez na adolescência.",
"Gandhi.",
"Deixar uma mensagem de voz esquisita.",
"Uppercuts.",
"Funcionários do serviço de atendimento ao cliente.",
"Uma ereção que dura mais que quatro horas.",
"Minha genitália.",
"Pegar mulher na clínica de aborto.",
"Ciência.",
"Sexo oral não recíproco.",
"Aves que não voam.",
"Uma boa cheirada.",
"Afogamento simulado.",
"Café da manhã balanceado.",
"Faculdades historicamente mais frequentadas por negros.",
"Literalmente roubar doce de criança.",
"A fundação Make-A-Wish®.",
"Um arranhão no traseiro mantido em segredo.",
"Notas passivo-agressivas no trabalho.",
"O time de ginástica chinês.",
"Depender do SUS.",
"Mijar um pouco.",
"Capitão Nascimento levando bronca da sogra.",
"Polução noturna.",
"Os judeus.",
"Minhas curvas.",
"Coisas poderosas.",
"Piscar para idosos.",
"Repórteres de programa humorístico.",
"Uma carícia suave na parte interna da coxa.",
"Tensão sexual.",
"O fruto proibido.",
"Esqueleto.",
"Churrasco na lage.",
"Ser rico.",
"Doce, doce vingança.",
"Republicanos.",
"Um antílope flatulento.",
"Natalie Portman.",
"Acariciar alguém sem permissão.",
"Pilotos Kamikaze.",
"Sean Connery.",
"A agenda homossexual.",
"O Mexicano que trabalha duro.",
"Um falcão emcapuzado.",
"Coroinhas.",
"O cara da previsão do tempo.",
"Ficar tão nervoso a ponto de ter uma ereção.",
"Amostras grátis.",
"Um grande estardalhaço por nada.",
"Fazer a coisa certa.",
"O jeitinho brasileiro.",
"Lactação.",
"Paz mundial.",
"RoboCop.",
"Senvergonhice.",
"Justin Bieber.",
"Oompa-Loompas.",
"Cantar à tirolesa inapropriadamente.",
"Puberdade.",
"Fantasmas.",
"Implantes de silicone assimétricos.",
"Axé Music.",
"Masturbação feminina.",
"Dinheiro na cueca.",
"Sacolé.",
"Brutalidade policial.",
"Flanelinhas.",
"Pré-adolescentes.",
"Escalpeamento.",
"Deixar escapar uma risadinha à menção de Tutsis e Hutus.",
"Twittar.",
"Darth Vader.",
"Uma masturbação triste.",
"Justamente o que você esperaria.",
"Esperar um arroto e acabar vomitando no chão.",
"Gardenal.",
"Células tronco.",
"Vestir-se de modo a exibir a lateral dos seios com elegância.",
"Sexo entre pandas.",
"Lobotomia.",
"Tom Cruise.",
"Herpes bucal.",
"Cachalotes.",
"Moradores de rua.",
"Dar uns amassos.",
"Incesto.",
"Ejaculação precoce.",
"Um mímico tendo um AVC.",
"Hulk Hogan.",
"Deus.",
"Coçar sob as dobras da pele.",
"Urofilia.",
"Emoções.",
"Lamber coisas para estabelecer que são propriedade sua.",
"Cerveja quente.",
"A placenta.",
"Combustão humana espontânea.",
"Amizade colorida.",
"Pintar com os dedos.",
"Cheiro de pessoa velha.",
"Morrer de disenteria.",
"Meus demonios interiores.",
"Pistola d'água cheia de urina de gato.",
"Aaron Burr.",
"Chamego.",
"A crônica.",
"Rinha de galo.",
"Fogo amigo.",
"Ronald Reagan.",
"Uma festa de aniversário decepcionante.",
"Uma negra atrevida.",
"Atleta de olimpíada de matemática.",
"Um cavalo minúsculo.",
"William Shatner.",
"Cavalgar rumo ao pôr do sol.",
"Uma reviravolta num roteiro de M. Night Shyamalan.",
"Judeu de cabelo afro.",
"Destruição Mútua Assegurada (MAD).",
"Pedófilos.",
"Fungos.",
"Roubar sepultura.",
"Comer o último bisão conhecido.",
"Catapultas.",
"Os pobres.",
"O Doce Veneno do Escorpião.",
"Funk Proibidão.",
"A Força.",
"Limpar a bunda dela.",
"Design Inteligente.",
"Lingua solta.",
"AIDS.",
"Imagens de seios.",
"O Übermensch.",
"Sarah Palin.",
"Legião dos Super-Heróis Brasileiros.",
"Ficar completamente dopado.",
"Cientologia.",
"Inveja do pênis.",
"Rezar pra curar homossexualismo.",
"Flertar.",
"Dois anões cagando num balde.",
"A Ku Klux Klan.",
"Genghis Khan.",
"Metanfetamina.",
"Servidão.",
"Perigo relacionado à pessoas estranhas.",
"Um brinquedo Bop ItTM.",
"A carreira de ator do Shaquille O'Neal.",
"Exibir-se.",
"Milícias.",
"Sobrecompensação.",
"Cena de \"bukkake\" em baixa resolução.",
"Uma vida de tristeza.",
"Racismo.",
"Arremesso de anão.",
"Felicidade ingênua.",
"Um macaco fumando cigarro.",
"Inundação.",
"O testículo ausente em Lance Armstrong.",
"Ânsia de vômito.",
"Terroristas.",
"Britney Spears aos 55.",
"Atitude.",
"Subitamente cantar e dançar uma canção em público.",
"Lepra.",
"Buracos gloriosos.",
"Mamilos protuberantes.",
"O coração de uma criança.",
"Filhotes de cachorro.",
"Acordar semi-nú num estacionamento a céu aberto.",
"Dental dams.",
"A vagina da Toni Morrison.",
"Períneo.",
"Escuta ativa.",
"Limpeza étnica.",
"Comer, rezar, amar.",
"A mão invisível.",
"Esperando até o casamento.",
"Estupidez incomensurável.",
"EuphoriaTM, por Calvin Klein.",
"Repassar o presente.",
"Auto-canibalismo.",
"Disfunção erétil.",
"Minha coleção de brinquedos sexuais eletrônicos.",
"O papa.",
"Brancos.",
"Pornografia envolvendo tentáculos.",
"Gel de cabelo em excesso.",
"Seppuku.",
"Dançar no gelo com parceiro do mesmo sexo.",
"Trapacear na olimpíada para-olímpica.",
"Carisma.",
"Keanu Reeves.",
"Sean Penn.",
"Nickelback.",
"Uma inspeção.",
"Distribuir camisinhas em porta de igreja.",
"Menstruação. Crianças com cancer anal.",
"Uma surpresa desagradavel.",
"O sul.",
"Violação dos mais básicos de nossos direitos humanos.",
"PEDE PRA SAIR!",
"Estupro.",
"Ser fabuloso.",
"Necrofilia.",
"Centauros.",
"Os cientistas desocupados da Austrália.",
"Negros.",
"Cavalheirismo.",
"Quentinha.",
"Vadias.",
"Retardados.",
"Órfãos.",
"MechaHitIer.",
"Evacuação dolorosa.",
"Outro maltido filme sobre vampiros.",
"Mola maluca.",
"O verdadeiro significado do Natal.",
"Estrogênio.",
"Indigestão de torresmo.",
"Aquele negócio que eletrocuta o abdomen.",
"Cálculo renal.",
"Clareamento anal.",
"Michael Jackson.",
"Melhoramentos cibernéticos.",
"Caras que não telefonam.",
"Lençois infectados com varíola.",
"Masturbação.",
"Conotações classistas.",
"Emitir flatos vaginais.",
"Esconder uma ereção.",
"Lingerie comestível.",
"Viagra®.",
"Sopa muito quente.",
"Maomé (Louvado Seja Seu Nome).",
"Sexo surpresa!",
"X-Tudão.",
"Beber sozinho.",
"Mão furada.",
"Múltiplas facadas.",
"Sujar-se.",
"Abuso infantil.",
"Cordão anal com nódulos e alça de segurança.",
"Vítimas civís.",
"Coito interrompido.",
"Robert Downey, Jr.",
"Carne de cavalo.",
"Um chapéu super transado.",
"Kim Jong-il.",
"Um pelo pubiano.",
"Fraternidades judias.",
"Cotas raciais.",
"Fazer aquilo na bunda.",
"Alimentar Rosie O'Donnell.",
"Ensinar um robô a amar.",
"Ser foda.",
"Um moinho de vento cheio de cadáveres.",
"Toddynho.",
"Vestir roupa íntima ao avesso pra economizar uma lavada.",
"Um raio da morte.",
"Teto de vidro.",
"Um congelador cheio de órgãos.",
"O Sonho Americano.",
"Barriga de chopp.",
"Quando você peida e sai mais do que devia.",
"Pegar de volta o que foi dado.",
"Bebês mortos.",
"Prepúcio.",
"Solos de saxofone.",
"Italianos.",
"Um feto.",
"Disparar uma espingarda para o alto enquanto trepa com uma cabra que está aos berros.",
"Dick Cheney.",
"Amputados.",
"Eugenia.",
"O status de minha relação.",
"Christopher Walken.",
"Abelhas?",
"Erotismo baseado em Harry Potter.",
"Faculdade.",
"Ficar bêbado ao bochechar anti-séptico bucal.",
"Nazistas.",
"200 gramas de doce heroina preta Mexicana.",
"Stephen Hawking dizendo coisas obscenas.",
"Pais mortos.",
"Permanência do objeto.",
"Polegares opositores.",
"Questões racistas em vestibular.",
"Falar abobrinha.",
"Motosserras.",
"Nicolas Cage.",
"Concursos de beleza para crianças.",
"Explosões.",
"Cheirar cola.",
"Repressão.",
"Boa Noite, Cinderela.",
"Minha vagina.",
"Biquíne fio-dental.",
"Chacina.",
"Dar-se 110%.",
"Sua Alteza Real, Rainha Elizabeth II.",
"O Caminho de Santiago.",
"Ser marginalizado.",
"Goblins.",
"Esperança.",
"O reverendo Dr. Martin Luther King, Jr.",
"Um micro-pênis.",
"Minha alma.",
"Uma desolação.",
"Vikings.",
"Gostosas.",
"Sedução.",
"Complexo de Édipo.",
"Gansos.",
"Aquecimento global.",
"Música New Age.",
"Hot Pockets®.",
"Fazer beicinho.",
"Homicídio em direção veicular.",
"Sufrágio feminino.",
"Um preservativo defeituoso.",
"Sessão da Tarde.",
"Crianças africanas.",
"O massacre no Virginia Tech.",
"Barack Obama.",
"Asiáticos que não são bons em matemática.",
"Homens japoneses idosos.",
"Troca de gentilezas.",
"Heteronormatividade.",
"Separar o Mar Vermelho.",
"Arnold Schwarzenegger.",
"Sexo oral na direção.",
"Barriga tanquinho.",
"Pão na chapa.",
"Um leão de zoológico deprimido.",
"Um saco de feijões mágicos.",
"Más decisões ao longo da vida.",
"Minha vida sexual.",
"Auschwitz.",
"Uma tartaruga-mordedora mordiscando a ponta do seu pênis.",
"Uma detonação termonuclear.",
"O clitóris.",
"O Big Bang.",
"Minas terréstres.",
"Amigos que comem todo o lanche.",
"Cabras comendo latas.",
"A Dança da Fada Açucarada.",
"Masturbar-se em uma poça de lagrimas de crianças.",
"Carne humana.",
"Tempo pra mim.",
"Túneis clandestinos.",
"Piadas inoportunas sobre o holocausto.",
"Um mar de problemas.",
"Histórias de lenhador.",
"A voz do Morgan Freeman.",
"Mulheres em comerciais de yogurte.",
"Aumento peniano natural.",
"Ser um feiticeiro filho-da-puta.",
"Piercings genitais.",
"Travestís que não parecem.",
"Brigas de travesseiro sensuais.",
"Boias.",
"Vovó.",
"Fricção.",
"Estraga-festa.",
"Peidar e se mandar.",
"Ser chato com crianças.",
"Colocar armadilhas em casa pra pegar assaltantes.",
"Trepar.",
"Morrer.",
"Furacão Katrina.",
"Gays.",
"A loucura do homem.",
"Homens.",
"Os amish.",
"Ovos de pterodáctilo.",
"Dinâmica de grupo.",
"Um tumor cerebral.",
"Cards Against Humanity.",
"Ter medo de sí próprio.",
"Lady Gaga.",
"O entregador de leite.",
"Dizer o que pensa."
];
const CAH_BLACK = [
{
"t": "Resolução da ANAC agora proíbe _ em aeronaves.",
"p": 1
},
{
"t": "É uma pena que as crianças hoje em dia estejam todas envolvidas em _.",
"p": 1
},
{
"t": "Em 1000 anos, quando o dinheiro de papel for apenas uma lembrança distante, _ será a nossa moeda.",
"p": 1
},
{
"t": "CBF proíbe _ por proporcionar vantagem desleal aos jogadores.",
"p": 1
},
{
"t": "Qual é o prazer proibido do Batman?",
"p": 1
},
{
"t": "Vem aí o novo livro de J. K. Rowling: Harry Potter e a Câmara de _.",
"p": 1
},
{
"t": "Desculpe, professora, mas é que eu não pude terminar o dever de casa por causa de _.",
"p": 1
},
{
"t": "O que eu trouxe do Paraguai?",
"p": 1
},
{
"t": "_? Tem uma app pra isso.",
"p": 1
},
{
"t": "_. Aposto que um só não te satisfaz!",
"p": 1
},
{
"t": "Qual é meu anti-droga?",
"p": 1
},
{
"t": "Enquanto os Estados Unidos e a União Soviética competiam na corrida espacial, o governo brasileiro investia pesado em _.",
"p": 1
},
{
"t": "No novo filme da Disney, Hanna Montana enfrenta _ pela primeira vez.",
"p": 1
},
{
"t": "Qual é meu poder secreto?",
"p": 1
},
{
"t": "Qual é a dieta do momento?",
"p": 1
},
{
"t": "O que o Vin Diesel teve no jantar?",
"p": 1
},
{
"t": "Quando o faraó permaneceu imóvel, Moisés invocou dos céus a praga dos _.",
"p": 1
},
{
"t": "Como estou mantendo minha atual relação amorosa?",
"p": 1
},
{
"t": "Qual é o cúmulo da porquice?",
"p": 1
},
{
"t": "Dizem que em Bangu 3 se troca dez maços de cigarro por _.",
"p": 1
},
{
"t": "Depois do terremoto, o Sean Penn levou _ ao Haití.",
"p": 1
},
{
"t": "No próximo natal o Papai Noel vai dar _ pra criança que não se comportar.",
"p": 1
},
{
"t": "A vida dos índios americanos mudou para sempre quando o homem branco lhes apresentou _.",
"p": 1
},
{
"t": "O que o Ministério da Educação está usando para inspirar os estudantes do interior a serem bem sucedidos?",
"p": 2
},
{
"t": "Talvez ela tenha nascido assim. Talvez seja _.",
"p": 1
},
{
"t": "Em seus momentos finais, Michael Jackson pensou em _.",
"p": 1
},
{
"t": "Homem branco gosta de _.",
"p": 1
},
{
"t": "Por que estou todo doído?",
"p": 1
},
{
"t": "Um jantar romântico à luz de velas seria incompleto sem _.",
"p": 1
},
{
"t": "O que eu levaria ao passado pra convencer as pessoas de que sou um mágico poderoso?",
"p": 1
},
{
"t": "Em breve, numa livraria perto de você, _.",
"p": 1
},
{
"t": "A excursão escolar foi um fiasco devido a _.",
"p": 1
},
{
"t": "Qual é o melhor amigo de uma garota?",
"p": 1
},
{
"t": "Doutor Drauzio, estou tendo problemas com _ e gostaria de ouvir seu conselho.",
"p": 1
},
{
"t": "Quando eu for presidente, criarei o Departamento de _.",
"p": 1
},
{
"t": "O que os meus pais estão escondendo de mim?",
"p": 1
},
{
"t": "O que é nunca falha em deixar uma festa mais animada?",
"p": 1
},
{
"t": "O que é que fica melhor quando envelhece?",
"p": 1
},
{
"t": "_: bom até a última gota.",
"p": 1
},
{
"t": "Estou com 99 problemas, mas _ não é um deles.",
"p": 1
},
{
"t": "_. É uma armadilha!",
"p": 1
},
{
"t": "Novo reality-show da MTV apresenta oito celebridades desgastadas morando com _.",
"p": 1
},
{
"t": "O que é que vovó acharia perturbante, mas estranhamente charmoso?",
"p": 1
},
{
"t": "O que é mais EMO?",
"p": 1
},
{
"t": "Durante o sexo, gosto de pensar em _.",
"p": 1
},
{
"t": "O que causou o fim da minha última relação?",
"p": 1
},
{
"t": "Que som é esse?",
"p": 1
},
{
"t": "_. É assim que eu espero morrer.",
"p": 1
},
{
"t": "Por que minha pele está pegajosa?",
"p": 1
},
{
"t": "Qual é o próximo brinde do McLanche Feliz?",
"p": 1
},
{
"t": "O que é que tem à vontade no Céu?",
"p": 1
},
{
"t": "Não sei com que armas se lutará a terceira guerra mundial, mas a quarta será com _.",
"p": 1
},
{
"t": "O que é tiro-e-queda par se conseguir sexo?",
"p": 1
},
{
"t": "_: testado pelas crianças, aprovado pelas mães.",
"p": 1
},
{
"t": "Por que não consigo dormir à noite?",
"p": 1
},
{
"t": "Que cheiro é esse?",
"p": 1
},
{
"t": "O que ajuda o Obama a relaxar depois do trabalho?",
"p": 1
},
{
"t": "Assim expira o mundo / Assim expira o mundo / Não com uma explosão, mas com _.",
"p": 1
},
{
"t": "Chega à Broadway nesta temporada o musical _.",
"p": 1
},
{
"t": "Antropólogos recentemente descobriram uma tribo primitiva que cultua _.",
"p": 1
},
{
"t": "Mas, antes de matá-lo, Sr. Bond, preciso te mostrar _.",
"p": 1
},
{
"t": "Estudo mostra que ratos de laboratório atravessam labirintos 50% mais rápido depois de serem expostos à _.",
"p": 1
},
{
"t": "Qual é o próxima dupla super-herói e ajudante?",
"p": 1
},
{
"t": "A seguir, na ESPN2: Campeonato Mundial de _.",
"p": 1
},
{
"t": "Quando eu for bilionário, mandarei fazer uma estátua de 15 metros de altura pra celebrar _.",
"p": 1
},
{
"t": "Buscando aumentar sua audiência, o Museu de História Natural abriu uma exposição interativa sobre _.",
"p": 1
},
{
"t": "Guerra! Pra que serve?",
"p": 1
},
{
"t": "O que me causa gases incontroláveis?",
"p": 1
},
{
"t": "Idosos têm cheiro de quê?",
"p": 1
},
{
"t": "O que vou deixar de fazer na quaresma?",
"p": 1
},
{
"t": "A medicina alternativa agora está explorando os poderes curativos de _.",
"p": 1
},
{
"t": "O que os Estados Unidos jogaram, de avião, às crianças do Afeganistão?",
"p": 1
},
{
"t": "O que o Dick Cheney prefere?",
"p": 1
},
{
"t": "Historiadores encontram dezenas de cadernos de Picasso com esboços de _.",
"p": 1
},
{
"t": "O que você espera não achar em seu prato de comida chinesa?",
"p": 1
},
{
"t": "Bebo pra esquecer _.",
"p": 1
},
{
"t": "_. Tô dentro!",
"p": 1
},
{
"t": "_. As mina pira, véi.",
"p": 1
},
{
"t": "_. Véi, na boa...",
"p": 1
},
{
"t": "E o prêmio _ vai para _.",
"p": 2
},
{
"t": "E para meu próximo número, tirarei _ de _.",
"p": 2
},
{
"t": "Passo 1: _. Passo 2: _. Passo 3: Lucrar.",
"p": 2
},
{
"t": "Quando eu estava viajando no LCD, _ se transformou em _.",
"p": 2
},
{
"t": "_ é uma ladeira escorregadia que leva direto para _.",
"p": 2
},
{
"t": "Em um mundo devastado por _, nosso único consolo é _.",
"p": 2
},
{
"t": "No próximo Tropa de Elite, Capitão Nascimento descobre que milicianos estavam usando _ para _.",
"p": 2
},
{
"t": "Nunca de fato entendi _, até encontrar _.",
"p": 2
},
{
"t": "Dizem as más linguas que o prato predileto do Vladimir Putin é _ recheado com _.",
"p": 2
},
{
"t": "Globo Filmes apresenta _, a história de _.",
"p": 2
},
{
"t": "Sim, eu matei _. Como? _.",
"p": 2
},
{
"t": "_ + _ = _.",
"p": 3
},
{
"t": "Faça um poema de três versos.",
"p": 3
}
];
