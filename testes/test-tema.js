// Datas comemorativas (tema.js): o dia certo de cada uma, a próxima vez que ela
// acontece e o rótulo do menu do Gerar anúncio.
// uso: node testes/test-tema.js
const path = require('path');
const T = require(path.join(__dirname, '..', 'tema.js'));
const { extrair } = require('./extrair.js');
let falhas = 0;
const ok = (c, n) => { console.log((c ? '  ok  ' : '  FALHOU  ') + n); if (!c) falhas++; };
const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const D = id => T.DATAS.find(t => t.id === id);

console.log('\ndatas móveis');
const bf = { 2026: '2026-11-27', 2027: '2027-11-26', 2028: '2028-11-24', 2029: '2029-11-23', 2030: '2030-11-29', 2035: '2035-11-23' };
ok(Object.entries(bf).every(([a, d]) => ymd(T._interno.blackFriday(+a)) === d), 'Black Friday = dia seguinte à 4ª quinta de novembro (2029 e 2035 inclusive)');
ok(ymd(T._interno.ultimo(2029, 11, 5)) === '2029-11-30', '(a "última sexta" erraria em 2029: 30/11)');
ok(ymd(T._interno.carnaval(2026)) === '2026-02-17' && ymd(T._interno.carnaval(2027)) === '2027-02-09' && ymd(T._interno.carnaval(2028)) === '2028-02-29', 'terça de Carnaval: 2026, 2027 e 2028 (bissexto)');
ok(ymd(D('maes').dia(2026)) === '2026-05-10' && ymd(D('maes').dia(2027)) === '2027-05-09', 'Dia das Mães: 2º domingo de maio');
ok(ymd(D('pais').dia(2026)) === '2026-08-09' && ymd(D('pais').dia(2027)) === '2027-08-08', 'Dia dos Pais: 2º domingo de agosto');
ok(ymd(D('natal').dia(2026)) === '2026-12-25' && ymd(D('cliente').dia(2026)) === '2026-09-15' && ymd(D('criancas').dia(2026)) === '2026-10-12', 'Natal, Dia do Cliente e Dia das Crianças');

console.log('\na próxima vez de cada data');
const hoje = new Date(2026, 10, 20); // 20/11/2026
const P = id => T.proxima(D(id), hoje);
ok(ymd(P('black-friday').dia) === '2026-11-27' && ymd(P('natal').dia) === '2026-12-25', 'Black Friday e Natal: ainda este ano');
ok(ymd(P('ano-novo').dia) === '2027-01-01' && ymd(P('ano-novo').ini) === '2026-12-26', 'Ano Novo: 1/1/2027, com as cores desde 26/12');
ok(ymd(P('carnaval').periodo[0]) === '2027-02-06' && ymd(P('carnaval').periodo[1]) === '2027-02-09', 'Carnaval já passou este ano: o de 2027 (sábado a terça)');
ok(ymd(P('maes').dia) === '2027-05-09' && ymd(P('pais').dia) === '2027-08-08', 'Mães e Pais: os de 2027');
const natal28 = T.proxima(D('natal'), new Date(2026, 11, 28)), novo28 = T.proxima(D('ano-novo'), new Date(2026, 11, 28));
ok(ymd(natal28.dia) === '2027-12-25' && ymd(novo28.dia) === '2027-01-01', 'em 28/12: Natal já foi (o próximo é 2027) e o Ano Novo está valendo');
ok(T.proxima(D('ano-novo'), hoje).frase === 'Feliz Ano Novo! Que 2027 comece com a máquina certa.', 'a frase do Ano Novo fala do ano que começa');
ok(T.temaDe(new Date(2026, 11, 28)).frase.includes('2027') && T.temaDe(new Date(2026, 10, 27)).id === 'black-friday', 'o tema do dia (faixa do catálogo) com a frase certa');
ok(T.DATAS.every(t => !!(t.dia || t.periodo)), 'toda data tem o dia ou o período');

console.log('\nrótulo do menu do Gerar anúncio (index.html)');
const rot = new Function('return ' + extrair('function anRotuloData(').replace('function anRotuloData(', 'function('))();
const ano = new Date().getFullYear();
const dt = (a, m, d) => new Date(a, m - 1, d);
ok(rot({ dia: dt(ano, 12, 25) }) === '25 de dez.', 'um dia: "25 de dez."');
ok(rot({ periodo: [dt(ano, 2, 6), dt(ano, 2, 9)] }) === '6 a 9 de fev.', 'período no mesmo mês: "6 a 9 de fev."');
ok(rot({ periodo: [dt(ano, 1, 5), dt(ano, 2, 28)] }) === '5 de jan. a 28 de fev.', 'período em dois meses');
ok(rot({ dia: dt(ano + 1, 1, 1) }) === `1 de jan. de ${ano + 1}`, 'ano que vem: com o ano');

console.log('\n' + (falhas ? falhas + ' FALHA(S)' : 'tudo verde'));
process.exit(falhas ? 1 : 0);
