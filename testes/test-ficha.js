// Ficha técnica: o cadastro grava marca, modelo, processador, geração, RAM,
// armazenamento e tela em campos próprios, e máquina antiga sem ficha tem ela
// lida do nome. A leitura do nome é o que alimenta busca e, depois, o anúncio
// no Mercado Livre, então erro aqui vira anúncio errado.
const {SRC}=require('./extrair');
let falhas=0;
const ok=(c,n)=>{ if(c) console.log('  ok  '+n); else {falhas++; console.log('  FALHOU  '+n);} };

const trecho=(ini,fim)=>{
  const i=SRC.indexOf(ini), j=SRC.indexOf(fim,i);
  if(i<0||j<0) throw new Error('não achei o trecho: '+ini);
  return SRC.slice(i,j);
};
const codigo =
  trecho('const SPEC_CPU=', 'let nomeManual') +
  trecho('// ── FICHA TÉCNICA ──', '// ── PEÇAS NO CADASTRO DE PRODUTO ──') +
  trecho('const BC={', '// Texto onde toda busca de produto procura.') +
  'function esc(s){return(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}' +
  'return {fichaDoNome, fichaDe, fichaTexto, SPEC_TELA, escAttr};';
const window={}, document={getElementById:()=>null};
const F=new Function('window','document',codigo)(window,document);

const casos=[
  ['Dell Latitude 5490 · i5 8ª · NVMe 256GB · 8GB DDR4 RAM',
   {marca:'Dell',modelo:'Latitude 5490',cpu:'i5',ger:'8ª',ram:'8GB',ram_tipo:'DDR4',armaz:'NVMe 256GB',tela:''}],
  ['Lenovo ThinkPad T480 · i5 8ª · SSD 240GB · 16GB RAM · 14”',
   {marca:'Lenovo',modelo:'ThinkPad T480',cpu:'i5',ger:'8ª',ram:'16GB',armaz:'SSD 240GB',tela:'14”'}],
  ['ThinkPad T14 i5-10310U 16gb ssd 256',
   {marca:'Lenovo',modelo:'ThinkPad T14',cpu:'i5',ger:'10ª',ram:'16GB',armaz:'SSD 256GB'}],
  ['Dell Latitude i5 10ª SSD 256 8gb',
   {marca:'Dell',modelo:'Latitude',cpu:'i5',ger:'10ª',ram:'8GB',armaz:'SSD 256GB'}],
  ['Latitude 7440 i5-1345U 16GB 512GB NVMe 14"',
   {marca:'Dell',modelo:'Latitude 7440',cpu:'i5',ger:'13ª',ram:'16GB',armaz:'NVMe 512GB',tela:'14”'}],
  ['Lenovo ThinkPad E14 i5-1135G7 8GB DDR4 SSD 256GB',
   {modelo:'ThinkPad E14',ger:'11ª',ram:'8GB',ram_tipo:'DDR4',armaz:'SSD 256GB'}],
  ['Acer Aspire 5 Ryzen 5 5500U 8GB SSD 512GB 15.6 pol',
   {marca:'Acer',cpu:'Ryzen 5',ger:'5000',ram:'8GB',armaz:'SSD 512GB',tela:'15.6”'}],
  ['HP EliteBook 840 G5 i7 8ª 16GB DDR4 SSD 512GB',
   {marca:'HP',modelo:'EliteBook 840 G5',cpu:'i7',ger:'8ª',ram:'16GB',ram_tipo:'DDR4',armaz:'SSD 512GB'}],
  ['Notebook Positivo Motion Celeron 4GB HD 500GB',
   {marca:'Positivo',cpu:'Celeron',ram:'4GB',armaz:'HD 500GB'}],
  ['Dell Inspiron i3 7ª 4GB HD 1TB tela HD 15.6"',
   {cpu:'i3',ger:'7ª',ram:'4GB',armaz:'HD 1TB',tela:'15.6”'}],
  ['Lenovo IdeaPad i5 11ª 8GB 256GB SSD',
   {cpu:'i5',ger:'11ª',ram:'8GB',armaz:'SSD 256GB'}],
  ['Dell Latitude E7440 i5 4ª 8GB SSD 240GB',
   {modelo:'Latitude E7440',ger:'4ª',ram:'8GB',armaz:'SSD 240GB'}],
  ['Dell Latitude 3420 i5-1135G7 8gb 256gb nvme',
   {modelo:'Latitude 3420',ger:'11ª',ram:'8GB',armaz:'NVMe 256GB'}],
  ['i7 10750H 16GB 1TB SSD', {cpu:'i7',ger:'10ª',ram:'16GB',armaz:'SSD 1TB'}],
];
console.log('\nleitura do nome');
for(const [nome,esp] of casos){
  const f=F.fichaDoNome(nome);
  const erradas=Object.entries(esp).filter(([k,v])=>f[k]!==v);
  ok(!erradas.length, nome + (erradas.length
    ? '  →  '+erradas.map(([k,v])=>`${k}: veio "${f[k]}", esperado "${v}"`).join('; ') : ''));
}

console.log('\no que não pode virar spec');
let f=F.fichaDoNome('Dell Latitude i5 10ª SSD 256 8gb');
ok(f.modelo==='Latitude', 'processador não vira número de modelo ("Latitude i5")');
f=F.fichaDoNome('Notebook tela HD 15.6" i5 8GB');
ok(f.armaz==='', 'o "HD" da tela não vira disco de 15GB');
f=F.fichaDoNome('Dell Latitude 16GB i5');
ok(f.modelo==='Latitude', 'memória não vira número de modelo ("Latitude 16GB")');
f=F.fichaDoNome('Lenovo i5 8GB SSD 256GB');
ok(f.ram==='8GB', 'o 256 do SSD não é lido como RAM');
f=F.fichaDoNome('');
ok(Object.values(f).every(v=>v===''), 'nome vazio dá ficha vazia, sem erro');

console.log('\nficha gravada manda');
const gravada={nome:'Dell Latitude 5490 i5 8ª 8GB', ficha:{marca:'Dell',modelo:'Latitude 5490',cpu:'i7',ger:'8ª',ram:'16GB',ram_tipo:'',armaz:'',tela:''}};
ok(F.fichaDe(gravada).cpu==='i7' && F.fichaDe(gravada).ram==='16GB',
   'quem conferiu e salvou a ficha vence o que o nome diz');
ok(F.fichaDe({nome:'Dell Latitude 5490 i5 8ª 8GB'}).cpu==='i5', 'sem ficha gravada, vale a lida do nome');
ok(/16GB/.test(F.fichaTexto(gravada)), 'a ficha entra no texto da busca');

console.log('\npolegada sem aspa reta');
ok(F.SPEC_TELA.every(t=>!t.includes('"')),
   'as telas usam ” — nome vai parar dentro de value="..." e a aspa reta fecharia o atributo');
ok(F.escAttr('14"')==='14&quot;', 'valor com aspa é escapado nas opções da ficha');

console.log('\nligações no app');
ok(/nome,ficha:fichaDoCadastro\(nome\),/.test(SRC), 'o cadastro grava a ficha junto com a máquina');
ok(/\{ficha:fichaCampos\('e'\)\}/.test(SRC), 'a edição grava a ficha conferida');
ok(/fichaPreencher\('e', fichaDe\(p\)\)/.test(SRC), 'a edição abre com a ficha (gravada ou lida do nome)');
ok(/\[p\.nome,fichaTexto\(p\),/.test(SRC), 'a busca procura também na ficha');
ok(/id="chipsTela"/.test(SRC) && /pickSpec\('tela'/.test(SRC), 'o cadastro tem os botões de tela');

console.log('\n'+(falhas?falhas+' FALHA(S)':'tudo verde'));
process.exit(falhas?1:0);
