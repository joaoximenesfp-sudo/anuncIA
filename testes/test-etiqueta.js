// Etiqueta com QR (index.html): os números digitados ("101-110, 115"), o resumo
// em faixas, o próximo número livre pulando os já impressos, o que vai escrito
// na etiqueta (nunca custo, preço ou fornecedor) e o endereço do QR.
// uso: node testes/test-etiqueta.js
const { extrair, SRC } = require('./extrair.js');
let falhas = 0;
const ok = (c, n) => { console.log((c ? '  ok  ' : '  FALHOU  ') + n); if (!c) falhas++; };
const linha = re => { const m = SRC.match(re); if (!m) throw new Error('não achei ' + re); return m[0]; };
const F = new Function('prods', 'fichaDe', [
  linha(/const QR_ORIGEM='[^']+';/), 'const ETQ_MAX=200; let etqUlt=0;', linha(/const qrUrl=n=>[^;]+;/),
  extrair('function proxNumLivre('), extrair('function etqLerNums('), extrair('function etqFaixas('), extrair('function etqDados('),
  'return { proxNumLivre, etqLerNums, etqFaixas, etqDados, qrUrl, reservar: n => { etqUlt = n; } };'].join('\n'));
const prods = [
  { id: 'a', num: 12, nome: 'Dell Latitude 5490 i5 8ª 16GB SSD 256GB', custo: 1234, venda: 2199, fornecedor_nome: 'Fulano Peças',
    ficha: { marca: 'Dell', modelo: 'Latitude 5490', cpu: 'i5', ger: '8ª', ram: '16GB', armaz: 'SSD 256GB' } },
  { id: 'b', num: 9, nome: 'HP ProBook 440 G5 · seminovo', ficha: null },
];
const fichaDe = p => p.ficha || {};
const E = F(prods, fichaDe);

console.log('\nnúmeros digitados');
const L = s => E.etqLerNums(s).join(',');
ok(L('101-105') === '101,102,103,104,105', 'faixa');
ok(L('101 - 103, 110') === '101,102,103,110' && L('101 a 103') === '101,102,103' && L('101 até 102') === '101,102', 'com espaço, "a" e "até"');
ok(L('#7, #9') === '7,9' && L('105-103') === '103,104,105', '"#7" e faixa ao contrário');
ok(L('5, 5, 4-6') === '5,4,6', 'sem repetir');
ok(L('') === '' && L('abc') === '' && L('0') === '', 'nada que preste: vazio');
ok(E.etqLerNums('1-100000').length === 200, 'no máximo 200 por vez');

console.log('\nresumo em faixas');
ok(E.etqFaixas([3, 7, 8, 9, 12]) === '3, 7-9, 12' && E.etqFaixas([2, 1, 1]) === '1-2' && E.etqFaixas([]) === '', 'junta os seguidos');

console.log('\npróximo número livre');
ok(E.proxNumLivre() === 13, 'sem etiqueta impressa: o maior + 1 (13)');
E.reservar(30);
ok(E.proxNumLivre() === 31, 'com etiquetas impressas até a 30: pula para a 31');

console.log('\no que vai escrito');
const d = E.etqDados(12);
ok(d.num === 12 && d.nome === 'Dell Latitude 5490' && d.spec === 'i5 8ª · 16GB · SSD 256GB', 'máquina que existe: modelo e configuração — ' + JSON.stringify(d));
ok(!/1234|2199|Fulano/.test(JSON.stringify(d)), 'sem custo, preço nem fornecedor');
ok(E.etqDados(9).nome === 'HP ProBook 440 G5', 'sem ficha: o nome até o "·"');
ok(JSON.stringify(E.etqDados(50)) === '{"num":50}', 'número novo: só o número');

console.log('\no QR');
ok(E.qrUrl(15) === 'https://anunc-ia.vercel.app/#n=15', 'endereço fixo do sistema, com o número');
ok(E.qrUrl(15).length <= 42, 'curto (cabe no QR versão 3, que fica grande na etiqueta)');

console.log(falhas ? `\n${falhas} FALHA(S)` : '\ntudo verde');
process.exit(falhas ? 1 : 0);
