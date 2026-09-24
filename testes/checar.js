// Validação estrutural dos arquivos servidos: tag desbalanceada, chave de CSS
// aberta ou getElementById apontando pra id inexistente derrubam a página em
// produção, e nada disso aparece num teste de função.
const fs=require('fs'), path=require('path');
const RAIZ=path.join(__dirname,'..');
let falhas=0;
const ok=(c,n)=>{ if(c) console.log('  ok  '+n); else {falhas++; console.log('  FALHOU  '+n);} };

// Comentário citando "<select>" não é tag. Sem tirar os comentários, a contagem
// acusa desequilíbrio que não existe.
// Só comentário de linha inteira. Tirar "//" no meio da linha ou blocos
// /* */ destrói template string com HTML dentro, e a contagem de tags vai
// junto — foi assim que este checador acusou 17 divs a menos que existem.
const semComentarios = s => s.replace(/^[ \t]*\/\/[^\n]*$/gm,'');

function checar(arq){
  const bruto=fs.readFileSync(path.join(RAIZ,arq),'utf8');
  const s=semComentarios(bruto);
  console.log('\n'+arq);

  for(const tag of ['div','select','button','span','table']){
    const abre=(s.match(new RegExp('<'+tag+'[\\s>]','g'))||[]).length;
    const fecha=(s.match(new RegExp('</'+tag+'>','g'))||[]).length;
    ok(abre===fecha, `${tag}: ${abre} abre / ${fecha} fecha`);
  }

  const css=bruto.slice(bruto.indexOf('<style'), bruto.indexOf('</style>'));
  ok((css.match(/{/g)||[]).length===(css.match(/}/g)||[]).length, 'chaves do CSS');

  const i=bruto.indexOf('<script type="module">');
  if(i>=0){
    // new Function não aceita import; o que interessa aqui é o resto parsear.
    const js=bruto.slice(bruto.indexOf('>',i)+1, bruto.lastIndexOf('</script>'))
      .replace(/^\s*import[\s\S]*?from\s*['"][^'"]+['"]\s*;?/gm,'');
    try{ new Function(js); ok(true,'o modulo parseia'); }
    catch(e){ ok(false,'o modulo parseia — '+e.message); }
  }

  const ids=new Set([...bruto.matchAll(/\sid="([\w-]+)"/g)].map(m=>m[1]));
  const usados=new Set([...bruto.matchAll(/getElementById\(['"]([\w-]+)['"]\)/g)].map(m=>m[1]));
  const orfaos=[...usados].filter(x=>!ids.has(x));
  console.log('  ids orfaos: '+(orfaos.length?orfaos.join(', '):'nenhum'));
}

['index.html','catalogo.html'].forEach(checar);
console.log('\n'+(falhas?falhas+' FALHA(S)':'estrutura ok'));
process.exit(falhas?1:0);
