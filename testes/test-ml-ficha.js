// O que o sistema preenche sozinho quando o Mercado Livre pede (modelo, processador,
// tela, sistema): a ficha do cadastro, o que faltar e a descrição disser, a tela pelo
// número do modelo, o código do processador onde estiver escrito, e a resposta já dada
// a uma máquina igual. Erro aqui vira anúncio com dado errado, então cada regra tem caso.
// uso: node testes/test-ml-ficha.js
const {SRC,extrair}=require('./extrair');
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
  extrair('function cliNorm(s)') +
  'function esc(s){return(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}' +
  'let prods=[]; const anFichaRapida=p=>fichaDe(p);' +
  trecho('// ── FICHA PARA O MERCADO LIVRE ──', 'function mlTitulo(p){') +
  'return {mlFicha, mlTelaDoModelo, mlCpuCodigo, mlSO, mlRespostasIguais, mlCpuProvaveis, mlCasar, mlSugestao, poe:l=>{prods=l;}};';
const window={}, document={getElementById:()=>null};
const M=new Function('window','document',codigo)(window,document);

console.log('\ntela pelo número do modelo');
const telas=[
  ['Dell Latitude 3420','14'],['Dell 3420','14'],['Dell Latitude 5280','12.5'],['Dell Latitude E6440','14'],['Dell 6440','14'],
  ['Dell Latitude 7490','14'],['Dell Latitude 3510','15.6'],['Dell Vostro 3400','14'],['Dell Inspiron 15 3000','15.6'],
  ['Lenovo ThinkPad T480','14'],['Lenovo T14 Gen 2','14'],['Lenovo E14 vPro','14'],['Lenovo X270','12.5'],['Lenovo ThinkPad X390','13.3'],
  ['Lenovo ThinkPad T580','15.6'],['Lenovo ThinkPad A485','14'],['Lenovo IdeaPad Gaming 3i','15.6'],['Lenovo IdeaPad 3 15IIL05','15.6'],
  ['HP EliteBook 840 G5','14'],['HP ProBook 450 G7','15.6'],['HP EliteBook 1040 G4','14'],['HP EliteBook 830 G6','13.3'],['HP 840 G6','14'],
  ['Acer Aspire 5 A515-54','15.6'],['Asus VivoBook 15','15.6'],
  // sem como saber pelo nome: fica em branco (o Mercado Livre pergunta)
  ['Dell OptiPlex 3080',''],['Lenovo ThinkCentre M920q',''],['Lenovo IdeaPad 3',''],['Lenovo Ideapad 320',''],['Dell',''],['Dell mini i3 4th',''],
];
const errTela=telas.filter(([m,t])=>M.mlTelaDoModelo(m)!==t);
ok(!errTela.length, `${telas.length} modelos com a tela certa (ou em branco quando não dá)`+(errTela.length?': '+errTela.map(([m,t])=>`${m} → "${M.mlTelaDoModelo(m)}" (devia "${t}")`).join(' | '):''));

console.log('\ncódigo do processador e sistema');
const cods=[['Latitude 5490 i5-8350U','8350U'],['Core i7 1165G7 16GB','1165G7'],['i3 10ª geração',''],['i5 8GB',''],['Ryzen 5 5500U','5500U'],
  ['Ryzen 7 PRO 4750U','4750U'],['AMD PRO A12-9800B','A12-9800B'],['Celeron N4020','N4020'],['i5-10210U','10210U']];
const errCod=cods.filter(([t,c])=>M.mlCpuCodigo(t)!==c);
ok(!errCod.length, 'código do processador onde estiver escrito'+(errCod.length?': '+errCod.map(([t,c])=>`${t} → "${M.mlCpuCodigo(t)}"`).join(' | '):''));
ok(M.mlSO('Windows 10 + Office')==='Windows' && M.mlSO('vai com win11 pro')==='Windows' && M.mlSO('Ubuntu instalado')==='Linux' && M.mlSO('bateria boa')==='', 'sistema operacional pela descrição (e nada quando não fala)');

console.log('\na ficha que vai para o anúncio');
const p477={id:'a',nome:'Dell · i3 10ª · NVMe 256GB · 8GB DDR4 RAM',descricao:'Notebook Dell Latitude 3420 com Windows 11 Pro. Suporta até 32GB de RAM.',
  ficha:{marca:'Dell',modelo:'',cpu:'i3',ger:'10ª',ram:'8GB',ram_tipo:'DDR4',armaz:'NVMe 256GB',tela:''}};
const f=M.mlFicha(p477);
ok(f.modelo==='Latitude 3420' && f.linha==='Latitude' && f.numero==='3420', 'sem modelo no cadastro: lê "Latitude 3420" da descrição');
ok(f.tela==='14' && f.so==='Windows' && f.cpu_linha==='Core i3' && f.cpu_ger==='10' && f.cpu_modelo==='', 'tela 14" pelo modelo, Windows pela descrição, i3 de 10ª (sem código, não inventa)');
ok(f.ram==='8 GB' && f.ssd==='256 GB', 'RAM e disco ficam os do cadastro ("suporta até 32GB" na descrição não vira a RAM)');
const g=M.mlFicha({id:'b',nome:'Dell · i3 10ª · NVMe 256GB · 8GB RAM',descricao:'Dell 3420 revisado',ficha:{marca:'Dell',cpu:'i3',ger:'10ª',ram:'8GB',armaz:'NVMe 256GB'}});
ok(g.modelo==='3420' && g.tela==='14', '"Dell 3420" (sem a família) também serve: modelo 3420 e tela 14"');
const h=M.mlFicha({id:'c',nome:'Dell Latitude 5490 i5-8350U 16GB SSD 256GB 14"'});
ok(h.cpu_modelo==='8350U' && h.tela==='14' && h.numero==='5490', 'código no nome vai direto; tela escrita no nome vale');
ok(M.mlFicha({id:'d',nome:'Lenovo ThinkPad E14 Ryzen 5 16GB SSD 512GB'}).cpu_linha==='Ryzen 5', 'Ryzen continua com a linha certa');

console.log('\nlista de processadores e respostas de máquina igual');
const vals=['10110U','1005G1','10210U','8350U','1135G7','i5-10310U','i3-10110U'];
ok(JSON.stringify(M.mlCpuProvaveis({cpu_linha:'Core i3',cpu_ger:'10'},vals))==='["10110U","1005G1","10210U","i3-10110U"]',
  'i3 de 10ª: os de 10ª primeiro (o "i5-10310U" fica de fora porque diz outra linha)');
ok(JSON.stringify(M.mlCpuProvaveis({cpu_linha:'Ryzen 5',cpu_ger:'5'},['5500U','4500U','5600H']))==='["5500U","5600H"]', 'Ryzen 5 série 5000: os 5xxx');
ok(M.mlCpuProvaveis({cpu_linha:'Core i3',cpu_ger:''},vals).length===0, 'sem geração, não chuta');
ok(M.mlCasar(['i3-10110U','i5-10210U'],'10110U')==='i3-10110U' && M.mlCasar(['Windows','Linux'],'windows')==='Windows' && M.mlCasar(['Windows'],'')==='', 'casa o valor com a opção da lista');
const irma={id:'e',nome:'Dell · i3 10ª · NVMe 256GB · 8GB DDR4 RAM',ml_atributos:{PROCESSOR_MODEL:'10110U',MODEL:'Latitude 3410'}};
const outra={id:'f',nome:'Lenovo E14',ml_atributos:{PROCESSOR_MODEL:'1135G7'}};
M.poe([p477,irma,outra]);
ok(JSON.stringify(M.mlRespostasIguais(p477))==='{"PROCESSOR_MODEL":"10110U","MODEL":"Latitude 3410"}', 'respostas da máquina igual (mesmo nome) valem; a de outra máquina não');
const sCpu=M.mlSugestao(p477,{id:'PROCESSOR_MODEL',nome:'Modelo do processador'});
ok(sCpu.v==='10110U' && sCpu.de==='igual', 'processador: vem da máquina igual');
const sTela=M.mlSugestao(p477,{id:'DISPLAY_SIZE',nome:'Tamanho da tela'}), sSO=M.mlSugestao(p477,{id:'OPERATING_SYSTEM_NAME',nome:'Sistema operacional'});
ok(sTela.v==='14 "' && sTela.de==='cadastro' && sSO.v==='Windows' && sSO.de==='cadastro', 'tela e sistema: do cadastro (o sistema achado pelo nome do campo)');
p477.ml_atributos={PROCESSOR_MODEL:'1005G1'};
ok(M.mlSugestao(p477,{id:'PROCESSOR_MODEL',nome:'Modelo do processador'}).de==='sua', 'a resposta desta máquina manda sobre a da igual');

console.log('\n'+(falhas?falhas+' FALHA(S)':'tudo verde'));
process.exit(falhas?1:0);
