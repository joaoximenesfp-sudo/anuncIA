// O link do catálogo que vai pro cliente tem que abrir sem login. Na Vercel só
// o domínio de produção é público; deploy e branch pedem login da Vercel.
const {extrair}=require('./extrair');
let falhas=0;
const ok=(c,n)=>{ if(c) console.log('  ok  '+n); else {falhas++; console.log('  FALHOU  '+n);} };

const fn=extrair('function catUrl(){');
const url=(origin,pathname)=>{
  const u=new URL(origin);
  const location={origin, hostname:u.hostname, pathname};
  return new Function('location',"const CAT_ORIGEM_PUBLICA='https://anunc-ia.vercel.app';"+fn+';return catUrl();')(location);
};

console.log('\nlink do catálogo');
ok(url('https://anunc-ia.vercel.app','/')==='https://anunc-ia.vercel.app/catalogo.html',
   'no endereço público, continua o mesmo');
ok(url('https://anunc-ochkmk28m-joaoximenesfp-sudos-projects.vercel.app','/index.html')==='https://anunc-ia.vercel.app/catalogo.html',
   'aberto por um deploy, o link sai pelo público e não pelo deploy protegido');
ok(url('https://anunc-ia-git-main-joaoximenesfp-sudos-projects.vercel.app','/')==='https://anunc-ia.vercel.app/catalogo.html',
   'aberto pelo endereço da branch, idem');
ok(url('https://www.lojadojoao.com.br','/')==='https://www.lojadojoao.com.br/catalogo.html',
   'num domínio próprio, usa o próprio domínio');

console.log('\n'+(falhas?falhas+' FALHA(S)':'tudo verde'));
process.exit(falhas?1:0);
