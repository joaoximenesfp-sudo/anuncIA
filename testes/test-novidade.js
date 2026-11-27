// Novidade no catálogo: o sistema grava novo_em quando a máquina entra no catálogo (ou estava
// "chegando" e chegou) e guarda essa data nas próximas publicações; o catálogo mostra o selo
// "Novidade" por 7 dias, põe essas máquinas na frente e conta no topo.
// uso: node testes/test-novidade.js
const fs = require('fs'), path = require('path');
const { extrair, SRC } = require('./extrair.js');
let falhas = 0;
const ok = (c, n) => { console.log((c ? '  ok  ' : '  FALHOU  ') + n); if (!c) falhas++; };
const linha = (src, re) => { const m = src.match(re); if (!m) throw new Error('não achei ' + re); return m[0]; };
const CAT = fs.readFileSync(path.join(__dirname, '..', 'catalogo.html'), 'utf8');

const S = new Function([linha(SRC, /const CAT_NOVO_DIAS=\d+;/), extrair('function catNovoEm('), extrair('function catEhNovo('),
  'return { catNovoEm, catEhNovo, DIAS: CAT_NOVO_DIAS };'].join('\n'))();
const agora = '2026-11-27T15:00:00.000Z', compra = { data_compra: '2026-11-03' };

console.log('\na data da novidade (sistema, ao publicar)');
ok(S.catNovoEm(undefined, 'disponivel', compra, agora) === agora, 'entrou agora no catálogo: novidade a partir de agora');
ok(S.catNovoEm({ estado: 'chegando', novo_em: '' }, 'disponivel', compra, agora) === agora, 'estava "chegando" e chegou: novidade a partir de agora');
ok(S.catNovoEm({ estado: 'disponivel', novo_em: '2026-11-25T10:00:00.000Z' }, 'disponivel', compra, agora) === '2026-11-25T10:00:00.000Z', 'publicar de novo não renova a novidade (a data fica)');
ok(S.catNovoEm({ estado: 'disponivel', novo_em: '', publicado_em: '2026-11-26T10:00:00.000Z' }, 'disponivel', compra, agora) === '2026-11-03T12:00:00.000Z',
  'a que já estava no ar antes desta data existir usa a data da compra (não vira novidade de uma vez)');
ok(S.catNovoEm({ estado: 'disponivel', novo_em: '', publicado_em: '2026-11-01T10:00:00.000Z' }, 'disponivel', {}, agora) === '2026-11-01T10:00:00.000Z', 'sem data de compra: a da publicação antiga');
ok(S.catNovoEm({ legado: true }, 'disponivel', compra, agora) === '2026-11-03T12:00:00.000Z' && S.catNovoEm({ legado: true }, 'disponivel', {}, agora) === '',
  'sem saber o que havia antes (leitura falhou): a data da compra, nunca "agora"');
ok(S.catNovoEm(undefined, 'chegando', compra, agora) === '' && S.catNovoEm({ estado: 'reservado', novo_em: 'x' }, 'reservado', compra, agora) === 'x', 'chegando ou reservada não é novidade (guarda a data se já tinha)');

console.log('\no que é novidade');
const t = Date.parse(agora), dia = 864e5;
ok(S.DIAS === 7 && S.catEhNovo({ estado: 'disponivel', novo_em: new Date(t - 6 * dia).toISOString() }, t) && !S.catEhNovo({ estado: 'disponivel', novo_em: new Date(t - 8 * dia).toISOString() }, t),
  'por 7 dias');
ok(!S.catEhNovo({ estado: 'chegando', novo_em: agora }, t) && !S.catEhNovo({ estado: 'disponivel', novo_em: '' }, t) && !S.catEhNovo({ estado: 'disponivel', novo_em: 'lixo' }, t), 'só disponível com data válida');
const pub = extrair('window.publicarCatalogo=async()=>{');
ok(/getDocs\(collection\(db,'catalogo'\)\)[\s\S]*antes\.set\(d\.id,\{novo_em:x\.novo_em\|\|'', estado:x\.estado\|\|''/.test(pub) && /doc0\.novo_em=catNovoEm\(antes\.size\?antes\.get\(p\.id\):\{legado:true\}, doc0\.estado, p, agoraCat\);/.test(pub),
  'ao publicar, lê o que já estava no ar e grava a data em cada máquina');
ok(/if\(catEhNovo\(doc0\)\) nNovas\+\+;/.test(pub) && /com o selo <b>Novidade<\/b> no catálogo/.test(pub), 'e o resultado diz quantas ficaram com o selo');

console.log('\no catálogo');
const C = new Function([linha(CAT, /const NOVO_DIAS=\d+;/), CAT.slice(CAT.indexOf('function ehNovo(i){'), CAT.indexOf('\n}\n', CAT.indexOf('function ehNovo(i){')) + 2), 'return ehNovo;'].join('\n'))();
const ha = d => new Date(Date.now() - d * dia).toISOString();
ok(C({ estado: 'disponivel', novo_em: ha(1) }) && !C({ estado: 'disponivel', novo_em: ha(9) }) && !C({ estado: 'chegando', novo_em: ha(1) }) && !C({ estado: 'reservado', novo_em: ha(1) }) && !C({ estado: 'disponivel' }),
  'o catálogo usa a mesma regra (7 dias, só disponível)');
ok(CAT.includes("g.itens.some(ehNovo)?'<span class=\"bd bd-nv\">Novidade</span>':''") && /\.bd-nv\{background:var\(--g1\)/.test(CAT), 'selo "Novidade" no cartão, em verde');
ok(/const na=ehNovo\(a\)\?0:1, nb=ehNovo\(b\)\?0:1;\s*if\(na!==nb\) return na-nb;/.test(CAT) && CAT.indexOf('if(oa!==ob) return oa-ob;') < CAT.indexOf('const na=ehNovo(a)'),
  'entre as disponíveis, as novidades vêm na frente (chegando e reservada continuam depois)');
ok(/\$\{nNovo\} novidade\$\{nNovo!==1\?'s':''\} esta semana\./.test(CAT), 'o topo conta as novidades da semana');
ok(/\$\{g\.itens\.some\(ehNovo\)\?'Novidade':'Destaque'\}/.test(CAT), 'na vitrine do topo, a novidade aparece como "Novidade"');

console.log(falhas ? `\n${falhas} FALHA(S)` : '\ntudo verde');
process.exit(falhas ? 1 : 0);
