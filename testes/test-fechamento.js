// Fechamento do mês (index.html, aba Insights): vendas, comparação com o mês anterior,
// de onde veio o cliente, quem vendeu, compras por sócio, estoque no fim do mês e o que
// falta preencher. As contas usam as mesmas funções dos gráficos (getMesVenda, getLucro,
// getMesCompra, custoSplit), então o teste puxa as de verdade do index.html.
// uso: node testes/test-fechamento.js
const { extrair } = require('./extrair.js');
let falhas = 0;
const ok = (c, n) => { console.log((c ? '  ok  ' : '  FALHOU  ') + n); if (!c) falhas++; };

const nomes = ['fmt', 'esc', 'getMesVenda', 'getMesCompra', 'getLucro', 'diasGiro', 'idSeed', 'custoRealDe',
  'aporteExato', 'investidorDe', 'gasPaganteDe', 'pecasSplit', 'custoSplit', 'nomeDoMes',
  'fchMesDeslocado', 'fchFimDoMes', 'fchDados', 'fchVar', 'fchNomeCurto', 'fchPlural', 'fchLista', 'fchHTML', 'fchTexto'];
const F = new Function(['const pecas = [];', ...nomes.map(n => extrair('function ' + n + '(')),
  'return { ' + nomes.join(', ') + ' };'].join('\n'))();

const HOJE = '2026-11-23';
const vend = (id, o) => Object.assign({ id, status: 'Vendido', investidor: 'João', canal_compra: 'OLX' }, o);
const lista = [
  // novembro: 4 vendas
  vend('s1', { num: 1, nome: 'Dell Latitude 5490 i5 8GB', venda: 2000, custo: 1500, lucro: 500, plataforma: 'Instagram', vendedor: 'João', data_compra: '2026-10-20', data_venda: '2026-11-05' }),
  vend('s2', { num: 2, nome: 'Lenovo ThinkPad E14 i5', venda: 1800, custo: 1200, lucro: 600, plataforma: 'Site / Google', vendedor: 'Igor', data_compra: '2026-11-01', data_venda: '2026-11-10', canal_compra: 'Facebook' }),
  vend('s3', { num: 3, nome: 'Acer Aspire 5 i3', venda: 1500, custo: 1000, lucro: 500, plataforma: 'WhatsApp', vendedor: '', data_compra: '2026-09', data_venda: '2026-11-12' }),
  vend('s4', { num: 4, nome: 'Dell Latitude 3410 i5 16GB', venda: 2200, custo: 1700, lucro: 500, plataforma: 'Instagram', vendedor: 'Os dois', data_compra: '2026-11-03', data_venda: '2026-11-20', investidor: 'compartilhado' }),
  // outubro: 2 vendas
  vend('o1', { num: 5, nome: 'ThinkPad T480', venda: 3000, custo: 2000, lucro: 1000, plataforma: 'OLX', vendedor: 'João', data_compra: '2026-10-01', data_venda: '2026-10-15' }),
  vend('o2', { num: 6, nome: 'Latitude 5280', venda: 2000, custo: 1500, lucro: 500, plataforma: 'Marketplace', vendedor: 'Igor', data_compra: '2026-10-10', data_venda: '2026-10-28' }),
  // estoque
  { id: 'e1', num: 7, nome: 'HP ProBook 440 G5', status: 'Anunciado', custo: 1000, investidor: 'Igor', canal_compra: 'OLX', data_compra: '2026-11-15' },
  { id: 'e2', num: 8, nome: 'Dell OptiPlex Micro', status: 'Estoque', custo: 900, aporte_joao: 300, aporte_igor: 300, canal_compra: 'Marketplace', data_compra: '2026-11-18' },
  { id: 'e3', num: 9, nome: 'Samsung Book i5', status: 'Reservado', custo: 2000, investidor: 'Igor', data_compra: '2026-08-01' },
  { id: 'e4', num: 10, nome: 'Lenovo V14', status: 'Aguardando', custo: 800, investidor: 'Igor', data_compra: '2026-10-25' },
  { id: 'semdata', num: 11, nome: 'Sem data de compra', status: 'Estoque', custo: 700 },
];

console.log('\nmeses');
ok(F.fchMesDeslocado('2026-01', -1) === '2025-12' && F.fchMesDeslocado('2026-12', 1) === '2027-01', 'volta e avança o mês virando o ano');
ok(F.fchFimDoMes('2026-11') === '2026-11-30' && F.fchFimDoMes('2026-02') === '2026-02-28' && F.fchFimDoMes('2028-02') === '2028-02-29', 'último dia do mês, com ano bissexto');

console.log('\nnovembro (mês correndo)');
const d = F.fchDados('2026-11', lista, HOJE);
const a = d.atual;
ok(a.qtd === 4 && a.fat === 7500 && a.luc === 2100 && a.ticket === 1875 && Math.round(a.margem * 100) === 28, 'vendas: 4, faturamento R$ 7.500, lucro R$ 2.100, ticket R$ 1.875, margem 28%');
ok(a.giro === 14, 'giro médio só com data exata (16, 9 e 17 dias; a de mês sem dia fica fora): ' + a.giro);
ok(d.ant.qtd === 2 && d.ant.fat === 5000 && d.ant.giro === 16, 'outubro para comparar: 2 vendas, R$ 5.000, giro 16 dias');
ok(d.origens.map(x => x.nome + ':' + x.qtd).join(',') === 'Instagram:2,Site / Google:1,Não informada:1', 'origens: Instagram 2, Site / Google 1 e o "WhatsApp" antigo vai para "Não informada", por último');
ok(d.vendedores.map(x => x.nome + ':' + x.qtd).join(',') === 'João:1,Igor:1,Os dois:1,Não informado:1', 'quem vendeu, na ordem João, Igor, Os dois, Não informado');
const c = d.compras;
ok(c.qtd === 4 && c.total === 4800, 'compras do mês: 4 máquinas, R$ 4.800 (vendidas ou não)');
ok(Math.round(c.joao) === 2350 && Math.round(c.igor) === 2150 && Math.round(c.caixa) === 300, 'quem bancou: João R$ 2.350, Igor R$ 2.150, e R$ 300 do caixa (aporte exato menor que o custo)');
ok(c.canais.map(x => x.nome + ':' + x.qtd).join(',') === 'OLX:2,Facebook:1,Marketplace:1', 'canais de compra: OLX 2, Facebook 1, Marketplace 1');
const e = d.estoque;
ok(d.corrente && e.qtd === 4 && e.capital === 4700, 'estoque hoje: 4 máquinas, R$ 4.700 (a sem data de compra fica fora)');
ok(e.top[0].num === 9 && e.top[0].dias === 114 && e.mais60 === 1 && e.media === Math.round((114 + 8 + 5 + 29) / 4), 'mais antiga: #9 com 114 dias; 1 acima de 60 dias; média ' + e.media);
ok(d.faltando.origem.length === 1 && d.faltando.vendedor.length === 1 && /Acer/.test(d.faltando.origem[0]), 'falta preencher: 1 venda sem origem e 1 sem quem vendeu');

console.log('\ncomparação com o mês anterior');
const v = F.fchVar(a.fat, d.ant.fat, 'pct');
ok(v.v === 50 && v.bom && v.txt === '50%', 'faturamento +50%');
const m = F.fchVar(a.margem, d.ant.margem, 'pp');
ok(m.v === -2 && !m.bom && m.txt === '2 p.p.', 'margem −2 pontos');
const g = F.fchVar(14, 16, 'dias');
ok(g.v === -2 && g.bom && g.txt === '2 dias', 'giro 2 dias mais rápido conta como bom');
ok(F.fchVar(10, 0, 'pct') === null && F.fchVar(null, 5, 'dias') === null, 'sem base para comparar: não inventa porcentagem');

console.log('\noutubro (mês fechado)');
const o = F.fchDados('2026-10', lista, HOJE);
ok(!o.corrente && o.ref === '2026-10-31', 'mês fechado usa o último dia do mês');
ok(o.estoque.qtd === 4 && o.estoque.capital === 5300, 'estoque no fim de outubro: as vendidas em novembro ainda estavam lá; as compradas em novembro não (4 máquinas, R$ 5.300)');
ok(o.estoque.top[0].num === 9 && o.estoque.top[0].dias === 91, 'a mais antiga no fim de outubro tinha 91 dias');
ok(o.atual.qtd === 2 && o.compras.qtd === 4, 'outubro: 2 vendas e 4 compras');

console.log('\nmês vazio');
const vazio = F.fchDados('2025-01', lista, HOJE);
ok(vazio.atual.qtd === 0 && vazio.compras.qtd === 0 && vazio.estoque.qtd === 0, 'janeiro de 2025: nada');
ok(/Nada registrado/.test(F.fchHTML(vazio)), 'a tela avisa que não há nada no mês');

console.log('\na tela');
const h = F.fchHTML(d);
ok(/Novembro de 2026/.test(h) && /Mês em andamento/.test(h), 'título com o mês e aviso de mês em andamento');
ok(/▲ 50% vs outubro/.test(h) && /class="d dn">▼ 2 p\.p\. vs outubro/.test(h) && /class="d up">▼ 2 dias vs outubro/.test(h), 'setas: faturamento subiu, margem caiu (vermelho), giro mais rápido (verde)');
ok(/fch-lin cinza"><div class="n">Não informada/.test(h), '"Não informada" aparece apagada');
ok(/João bancou/.test(h) && /Caixa da loja/.test(h) && /Comprou em: OLX 2/.test(h), 'compras com quem bancou e onde comprou');
ok(/Estoque hoje/.test(h) && /#9 Samsung Book i5 \(114 dias\)/.test(h), 'estoque de hoje com as mais antigas');
ok(/Para o fechamento ficar completo/.test(h) && /sem quem vendeu/.test(h), 'aviso do que falta preencher');
ok(!/undefined|NaN/.test(h), 'nada de undefined ou NaN na tela');
const inj = F.fchDados('2026-11', lista.concat([vend('z', { nome: '<img src=x onerror=alert(1)>', venda: 100, custo: 50, plataforma: '<b>x</b>', data_compra: '2026-11-01', data_venda: '2026-11-02' })]), HOJE);
ok(!/<img src=x/.test(F.fchHTML(inj)) && !/<b>x<\/b>/.test(F.fchHTML(inj)), 'nome e origem entram escapados (sem código na tela)');

console.log('\no texto do WhatsApp');
const t = F.fchTexto(d);
console.log(t.split('\n').map(l => '      ' + l).join('\n'));
ok(/^📅 Fechamento de Novembro de 2026 \(parcial\)/.test(t), 'título com "(parcial)" no mês correndo');
ok(/Vendas: 4 máquinas · R\$ 7\.500 \(▲ 50% vs outubro\)/.test(t), 'vendas com a variação');
ok(/Lucro: R\$ 2\.100 · margem 28%/.test(t) && /giro médio: 14 dias/.test(t), 'lucro, margem e giro');
ok(/De onde vieram: Instagram 2 · Site \/ Google 1 · Não informada 1/.test(t) && /Quem vendeu: João 1 · Igor 1 · Os dois 1 · Não informado 1/.test(t), 'origens e quem vendeu');
ok(/Compras: 4 máquinas · R\$ 4\.800 \(João R\$ 2\.350 · Igor R\$ 2\.150 · caixa da loja R\$ 300\)/.test(t), 'compras por sócio');
ok(/Estoque hoje: 4 máquinas · R\$ 4\.700 · paradas em média há 39 dias/.test(t) && /Mais antigas: #9 Samsung Book i5 \(114 dias\)/.test(t), 'estoque e as mais antigas');
ok(/Falta preencher: 1 venda sem origem · 1 venda sem quem vendeu/.test(t), 'o que falta preencher');
ok(!/undefined|NaN/.test(t), 'nada de undefined ou NaN no texto');

console.log('\n' + (falhas ? falhas + ' FALHA(S)' : 'tudo verde'));
process.exit(falhas ? 1 : 0);
