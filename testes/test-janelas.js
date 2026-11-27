// Janelas (modais) do index.html: toda classe usada no cabeçalho e no corpo de uma janela precisa
// ter estilo. A tabela pros vendedores e o recibo usavam .mh/.mt/.mx/.mb sem regra nenhuma: o ✕ caía
// embaixo do título e o corpo não rolava, então o fim da janela ficava cortado e não dava para chegar
// nos botões (Publicar catálogo, Ver a página...).
// uso: node testes/test-janelas.js
const { SRC } = require('./extrair.js');
let falhas = 0;
const ok = (c, n) => { console.log((c ? '  ok  ' : '  FALHOU  ') + n); if (!c) falhas++; };
const css = SRC.slice(SRC.indexOf('<style>') + 7, SRC.indexOf('</style>'));
const regra = cls => new RegExp('(^|[}\\s,])\\.' + cls + '\\{([^}]*)\\}', 'm').exec(css);

console.log('\ncada parte da janela tem estilo');
for (const cls of ['mh', 'mt', 'mx', 'mb', 'mch', 'mct', 'mcl', 'mcb']) {
  const usada = new RegExp('class="' + cls + '"').test(SRC);
  if (usada) ok(!!regra(cls), '.' + cls + ' é usada e tem estilo');
}
const mb = (regra('mb') || [])[2] || '', mh = (regra('mh') || [])[2] || '';
ok(/overflow-y:auto/.test(mb) && /min-height:0/.test(mb) && /flex:1 1 auto/.test(mb), 'o corpo (.mb) rola por dentro da janela');
ok(/overscroll-behavior:contain/.test(mb) && /overscroll-behavior:contain/.test((regra('mcb') ? css.match(/\.mcb\{overscroll-behavior:contain\}/) || [''] : [''])[0]),
  'rolar até o fim da janela não arrasta a página de trás');
ok(/display:flex/.test(mh) && /justify-content:space-between/.test(mh), 'o ✕ fica na mesma linha do título, à direita');
ok(/\.moo\{touch-action:none\}/.test(css), 'tocar no fundo escuro não rola a página');

console.log('\na tabela pros vendedores e o recibo');
for (const [id, fechar] of [['TVO', 'fecharTabelaVend'], ['RCO', 'fecharRecibo']]) {
  const i = SRC.indexOf('<div class="mo h" id="' + id + '">');
  const bloco = SRC.slice(i, i + 400);
  ok(i > 0 && new RegExp('<div class="moo" onclick="' + fechar + '\\(\\)"></div>').test(bloco), id + ': tem o fundo escuro, e tocar nele fecha a janela');
}

console.log(falhas ? `\n${falhas} FALHA(S)` : '\ntudo verde');
process.exit(falhas ? 1 : 0);
