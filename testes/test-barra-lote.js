// A barra de seleção em lote: precisa deixar ver a lista por baixo e não pode
// crescer pra cima tapando a tabela quando ele marca muita máquina.
const {extrair,SRC}=require('./extrair');
let falhas=0;
const ok=(c,n)=>{ if(c) console.log('  ok  '+n); else {falhas++; console.log('  FALHOU  '+n);} };

console.log('\na variável de fundo existe');
ok(/--cd:#fff/.test(SRC),
   'var(--cd) está definida no :root — sem isso a barra fica SEM FUNDO e a '
   +'página aparece atravessada por baixo, que era o defeito que ele reportou');
const usosCd=(SRC.match(/var\(--cd\)/g)||[]).length;
ok(usosCd>0, usosCd+' lugares usam var(--cd) e todos dependiam dessa definição');

console.log('\na barra deixa ver a lista por baixo');
const css=SRC.slice(SRC.indexOf('.lote-bar{'), SRC.indexOf('.lote-topo{'));
ok(/background:rgba\(255,255,255,\.90\)/.test(css),'fundo translúcido, não chapado');
ok(/backdrop-filter:blur\(/.test(css),'com desfoque, pra continuar legível por cima da tabela');
ok(/-webkit-backdrop-filter/.test(css),'e o prefixo webkit, senão não pega no Safari/iPhone');
ok(/flex-direction:column/.test(css),'empilha em faixas em vez de espremer tudo numa linha');

console.log('\nduas faixas: o que está marcado, e o que dá pra fazer');
const html=SRC.slice(SRC.indexOf('<div class="lote-bar" id="loteBar">'),
                     SRC.indexOf('<!-- SELL MODAL -->'));
ok(/<div class="lote-topo">/.test(html),'faixa de cima com etiqueta e chips');
ok(/<div class="lote-acoes">/.test(html),'faixa de baixo com os botões');
const topo=html.slice(html.indexOf('lote-topo'), html.indexOf('lote-acoes'));
ok(/id="loteLbl"/.test(topo) && /id="loteChips"/.test(topo),
   'rótulo e chips na faixa de cima');
const acoes=html.slice(html.indexOf('lote-acoes'), html.indexOf('lote-obs'));
['loteTodosBt','loteLimparBt','loteAlvo','loteAplicarBt'].forEach(id=>
  ok(new RegExp('id="'+id+'"').test(acoes), id+' na faixa de ações'));
ok(/lvAbrir\(\)/.test(acoes),'e o botão de vender em lote junto');
ok(/class="lote-sep"/.test(acoes),
   'com um espaçador antes do verde — vender é ação diferente de mudar status '
   +'e não pode ficar colada nas outras');

console.log('\no texto de ajuda tem linha própria');
ok(html.indexOf('lote-obs') > html.indexOf('lote-acoes'),
   'vem depois das ações, não disputando largura com elas');
const cssObs=SRC.slice(SRC.indexOf('.lote-obs{'), SRC.indexOf('.lote-obs{')+200);
ok(/border-top/.test(cssObs),'separado por um fio, pra não virar parte dos botões');
ok(!/flex:1/.test(cssObs),'e sem flex:1, que era o que roubava o espaço dos botões');

console.log('\nmarcar muita máquina não come a tela');
const cssChips=SRC.slice(SRC.indexOf('.lote-chips{'), SRC.indexOf('.lote-chip{'));
ok(/max-height:58px/.test(cssChips),'as etiquetas têm teto de altura');
ok(/overflow-y:auto/.test(cssChips),'e rolam em vez de empurrar a barra pra cima');

console.log('\na folga do rodapé acompanha a altura real');
const fn=extrair('function loteBarra(mostrar){');
ok(/bar\.offsetHeight/.test(fn),
   'o padding do body sai da altura medida da barra, então a barra ficando mais '
   +'alta não esconde a última máquina da lista');

console.log('\n'+(falhas?falhas+' FALHA(S)':'tudo verde'));
process.exit(falhas?1:0);
