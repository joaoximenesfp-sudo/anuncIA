// Análise de preço e tempo de estoque (index.html, cartão Anúncios do catálogo):
// dias desde a entrada, referência das parecidas vendidas no último ano e das
// que estão em estoque, sugestão de desconto e o piso do custo + 10%.
// uso: node testes/test-desconto.js
const { extrair } = require('./extrair.js');
let falhas = 0;
const ok = (c, n) => { console.log((c ? '  ok  ' : '  FALHOU  ') + n); if (!c) falhas++; };
const fmt = v => 'R$ ' + Math.round(v || 0).toLocaleString('pt-BR');
const F = new Function('fmt', [extrair('function anDiasDesde('), extrair('function anMediana('), extrair('function anAnalisePreco('),
  'return { anDiasDesde, anMediana, anAnalisePreco };'].join('\n'))(fmt);
const hoje = new Date('2026-11-20T15:00:00Z');
const dia = n => new Date(hoje.getTime() - n * 864e5).toISOString().slice(0, 10);
const ficha = p => p.ficha || {};
const op = { hoje, ficha, giro: p => p.data_compra && p.data_venda ? { dias: F.anDiasDesde(p.data_compra, new Date(p.data_venda + 'T12:00:00Z')) } : null };
const dell = { marca: 'Dell', modelo: 'Latitude 5490', cpu: 'i5', ger: '8ª', ram: '16GB' };
const vend = (id, venda, compra, venda_em, f = dell) => ({ id, status: 'Vendido', venda, custo: 1200, data_compra: dia(compra), data_venda: dia(venda_em), ficha: f });
const historico = [vend('s1', 1950, 40, 25), vend('s2', 2050, 30, 10), vend('s3', 2000, 60, 45), vend('s4', 2100, 400, 380)]; // s4: há mais de 1 ano

console.log('\ndias e medianas');
ok(F.anDiasDesde(dia(70), hoje) === 70 && F.anDiasDesde('', hoje) === null && F.anDiasDesde('2026-10', hoje) === 36, 'dias desde a entrada (mês sem dia: meio do mês)');
ok(F.anMediana([3, 1, 2]) === 2 && F.anMediana([1, 2, 3, 4]) === 2.5 && F.anMediana([]) === null, 'mediana');

console.log('\nsugestões');
const parada = { id: 'p1', status: 'Anunciado', venda: 2199, custo: 1500, data_compra: dia(70), ficha: dell };
let a = F.anAnalisePreco(parada, [parada, ...historico], op);
ok(a.dias === 70 && a.ref && a.ref.n === 3 && a.ref.tipo === 'modelo' && a.ref.preco === 2000 && a.ref.dias === 15, 'referência: 3 Dell Latitude 5490 i5 8ª vendidas no ano (a de 1 ano atrás fica fora), ~R$ 2.000 em ~15 dias');
ok(a.motivos.length === 2 && /parada há 70 dias/.test(a.motivos[0]) && /acima do que as parecidas venderam/.test(a.motivos[1]), 'motivos: parada além do normal e acima do que as parecidas venderam');
ok(a.sugerido === 2000 && a.pct === 9 && a.margem === 25, `sugestão: ${fmt(a.sugerido)} (−${a.pct}%), margem ${a.margem}%`);
const nova = { id: 'p2', status: 'Anunciado', venda: 2050, custo: 1500, data_compra: dia(5), ficha: dell };
a = F.anAnalisePreco(nova, [nova, ...historico], op);
ok(!a.sugerido && !a.motivos.length && a.ref && a.ref.preco === 2000, 'recém-chegada, no preço das parecidas: sem sugestão (preço ok)');
const cara = { id: 'p3', status: 'Anunciado', venda: 2199, custo: 1950, data_compra: dia(70), ficha: dell };
a = F.anAnalisePreco(cara, [cara, ...historico], op);
ok(a.sugerido === 2150 && a.noPiso, 'custo alto: a sugestão para no custo + 10% (R$ 2.150)');
const semEspaco = { id: 'p4', status: 'Anunciado', venda: 2199, custo: 2050, data_compra: dia(70), ficha: dell };
a = F.anAnalisePreco(semEspaco, [semEspaco, ...historico], op);
ok(a.semEspaco && !a.sugerido && a.motivos.length, 'já perto do custo: avisa que está parada, sem sugerir desconto');
const lenovo = { marca: 'Lenovo', modelo: 'ThinkPad T480', cpu: 'i5', ger: '8ª', ram: '16GB' };
const velha = { id: 'q1', status: 'Anunciado', venda: 2300, custo: 1500, data_compra: dia(25), ficha: lenovo };
const irma1 = { id: 'q2', status: 'Anunciado', venda: 2300, custo: 1500, data_compra: dia(10), ficha: lenovo };
const irma2 = { id: 'q3', status: 'Em estoque', venda: 0, custo: 1500, data_compra: dia(3), ficha: lenovo };
a = F.anAnalisePreco(velha, [velha, irma1, irma2], op);
ok(a.irmas === 2 && /3 parecidas em estoque e esta é a mais antiga/.test(a.motivos.join()) && a.sugerido === 2200, 'mais antiga entre 3 iguais em estoque: −3% (R$ 2.200)');
a = F.anAnalisePreco(irma1, [velha, irma1, irma2], op);
ok(!a.sugerido, 'a mais nova das iguais: sem sugestão');
const hpClasse = { marca: 'HP', modelo: 'ProBook 440', cpu: 'i5', ger: '8ª', ram: '16GB' };
const hp = { id: 'h1', status: 'Anunciado', venda: 2400, custo: 1500, data_compra: dia(10), ficha: hpClasse };
a = F.anAnalisePreco(hp, [hp, ...historico], op);
ok(a.ref && a.ref.tipo === 'classe' && a.ref.n === 3 && a.sugerido === 2000, 'sem vendas do mesmo modelo: compara com a mesma classe (i5 8ª 16GB) e vê que está acima');
const sem = { id: 'z', status: 'Anunciado', venda: 1500, data_compra: '', ficha: {} };
a = F.anAnalisePreco(sem, [sem, ...historico], op);
ok(a.dias === null && !a.ref && !a.sugerido, 'sem data de entrada nem ficha: não inventa nada');

console.log('\n' + (falhas ? falhas + ' FALHA(S)' : 'tudo verde'));
process.exit(falhas ? 1 : 0);
