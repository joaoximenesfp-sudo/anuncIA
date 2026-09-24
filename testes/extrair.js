// Puxa uma função de dentro do index.html por casamento de chaves, pra poder
// testar ela no Node sem subir o app (que precisa de Firebase).
const fs=require('fs'), path=require('path');
const SRC=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
function extrair(assinatura){
  const i=SRC.indexOf(assinatura);
  if(i<0) throw new Error('não achei: '+assinatura);
  let j=SRC.indexOf('{', i), d=0, k=j;
  for(; k<SRC.length; k++){
    const c=SRC[k];
    if(c==='{') d++;
    else if(c==='}'){ d--; if(d===0){ k++; break; } }
  }
  let fim=k;
  if(SRC[fim]===';') fim++;
  return SRC.slice(i, fim);
}
module.exports={extrair, SRC};
