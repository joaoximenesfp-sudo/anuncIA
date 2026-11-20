// Busca do Gerar anúncio (index.html): a barra do catálogo e o "Buscar no que
// está anunciado" do editor. Todas as palavras, em qualquer ordem, sem acento
// nem maiúscula, no número, no nome, na ficha e na descrição; "#12" só pelo número.
// uso: node testes/test-busca.js
const { extrair } = require('./extrair.js');
let falhas = 0;
const ok = (c, n) => { console.log((c ? '  ok  ' : '  FALHOU  ') + n); if (!c) falhas++; };
const F = new Function('anFichaRapida', ['const anBuscaCache=new Map();', extrair('function cliNorm('), extrair('function anBuscaAlvo('),
  extrair('function anBuscaTermos('), extrair('function anBuscaCasa('), 'return { anBuscaTermos, anBuscaCasa };'].join('\n'))(p => p.ficha || {});
const casa = (p, q) => F.anBuscaCasa(p, F.anBuscaTermos(q));
const dell = { id: 'a', num: 12, nome: 'Dell Latitude 5490 i5 8ª 16GB SSD 256GB', descricao: 'Bateria segura 4h, tela sem risco.',
  ficha: { marca: 'Dell', modelo: 'Latitude 5490', cpu: 'i5', ger: '8ª', ram: '16GB' } };
const len = { id: 'b', num: 120, nome: 'Lenovo ThinkPad E14', descricao: 'Teclado retroiluminado.', ficha: { marca: 'Lenovo', cpu: 'Ryzen 5' } };
const mac = { id: 'c', num: 7, nome: 'MacBook Air M1 Câmera HD' };

console.log('\npalavras');
ok(casa(dell, 'latitude DELL') && casa(dell, '  dell   5490 ') && !casa(len, 'latitude dell'), 'todas as palavras, em qualquer ordem, sem ligar para maiúscula nem espaço sobrando');
ok(!casa(dell, 'dell ryzen'), 'uma palavra que não aparece já tira');
ok(casa(len, 'RYZÊN') && casa(mac, 'camera') && casa(mac, 'câmera'), 'sem ligar para acento, no que ele digita e no cadastro');
ok(casa(len, 'retroiluminado') && casa(dell, 'bateria'), 'acha pela descrição');
ok(casa(len, 'lenovo ryzen 5'), 'acha pela ficha (o Ryzen não está no nome)');
ok(casa(dell, '') && casa(dell, '   '), 'busca vazia: tudo');

console.log('\nnúmero');
ok(casa(dell, '#12') && !casa(len, '#12') && casa(len, '#120'), '"#12" é só a máquina 12 (não a 120)');
ok(casa(dell, '12') && casa(len, '12'), '"12" sem # acha no número e no texto (a #120 também)');
ok(casa(mac, '#7') && !casa({ id: 'd', nome: 'sem número' }, '#7'), 'máquina sem número não casa com "#7"');
ok(!F.anBuscaCasa(undefined, ['dell']), 'máquina que não existe mais: não casa, sem erro');

console.log('\ncadastro mudou');
const outra = { ...dell, nome: 'Dell Vostro 3500', ficha: { marca: 'Dell', modelo: 'Vostro 3500' } };
ok(casa(outra, 'vostro') && !casa(outra, 'latitude') && casa(dell, 'latitude'), 'mudou o nome ou a ficha: a busca segue o cadastro novo (sem guardar o texto antigo)');

console.log('\n' + (falhas ? falhas + ' FALHA(S)' : 'tudo verde'));
process.exit(falhas ? 1 : 0);
