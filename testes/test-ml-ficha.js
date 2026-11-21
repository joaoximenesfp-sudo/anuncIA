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
  trecho('const BAT_OPC=[', 'function hwCampos(pre){') +
  extrair('function slotsLivres(total,ocup)') +
  'let prods=[]; const anFichaRapida=p=>fichaDe(p);' +
  trecho('// ── FICHA PARA O MERCADO LIVRE ──', 'function mlTitulo(p){') +
  'return {mlFicha, mlTelaDoModelo, mlCpuCodigo, mlSO, mlRespostasIguais, mlCpuProvaveis, mlCasar, mlSugestao, mlCpusDaLoja, mlCpusComuns,' +
  ' mlRespostasDaLoja, mlPadrao, mlHwLinhas, mlChave, poe:l=>{prods=l;}};';
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

console.log('\no que a descrição e as abas da máquina dizem');
const d1=M.mlFicha({id:'h1',nome:'Dell Latitude 5490 i5-8350U 16GB SSD 256GB',descricao:'Tela Full HD, cor preta, bateria dura 5h. Suporta até 32GB de RAM. GeForce MX130 2GB.'});
ok(d1.gpu==='GeForce MX130' && d1.resolucao==='1920 x 1080' && d1.bateria_h==='5' && d1.ram_max==='32' && d1.cor==='Preto' && !d1.touch,
  'vídeo, resolução, bateria (horas), RAM máxima e cor saem da descrição: '+JSON.stringify({gpu:d1.gpu,res:d1.resolucao,bat:d1.bateria_h,max:d1.ram_max,cor:d1.cor}));
ok(M.mlFicha({id:'h2',nome:'HP 840 G6',descricao:'Tela com mancha preta no canto, não é touch.'}).cor==='' && !M.mlFicha({id:'h2',nome:'HP 840 G6',descricao:'não é touch'}).touch &&
  M.mlFicha({id:'h3',nome:'Dell 7400 2 em 1',descricao:'Tela touch'}).touch, '"mancha preta" não vira a cor; "não é touch" não vira touch');
const hw={slots_ram:2,slots_ram_ocup:1,slots_m2:1,slots_m2_ocup:0,tela_estado:'riscos',bateria_estado:'boa'};
ok(JSON.stringify(M.mlHwLinhas(hw))==='["Slots de memória RAM: 2 (1 livre)","Slots M.2: 1","Estado da tela: Riscos leves","Bateria: Boa"]' &&
  JSON.stringify(M.mlHwLinhas({bateria_pct:85}))==='["Bateria: 85%"]', 'slots, tela e bateria das abas vão para a descrição com o nome de cada coisa: '+JSON.stringify(M.mlHwLinhas(hw)));
const pad=(nome,p,f)=>M.mlPadrao({id:'X',nome},f||M.mlFicha(p),p);
const nb={id:'n1',nome:'Dell Latitude 5490 i5 8ª 8GB SSD 256GB',descricao:'',bateria_estado:'segura',tela_estado:'perfeita',slots_ram:2};
ok(JSON.stringify(pad('Com Wi-Fi',nb))==='{"v":"Sim","de":"padrao"}' && pad('Com Wi-Fi',{id:'n2',nome:'Dell OptiPlex 3080 i5 10ª'})===null &&
  pad('Com tela touch',nb).v==='Não' && pad('É gamer',nb).v==='Não' && pad('É gamer',{id:'n3',nome:'Acer Nitro 5 i5 RTX 3050'}).v==='Sim',
  'Wi-Fi sim (no de mesa, não chuta), touch e gamer não (gamer sim com RTX no nome)');
ok(pad('Saúde da bateria',nb).v==='Segurando carga' && pad('Estado da tela',nb).v==='Perfeita' && pad('Quantidade de slots de memória RAM',nb).v==='2' &&
  pad('Memória RAM máxima suportada',{id:'n4',nome:'x',descricao:'Suporta até 32GB'}).v==='32 GB', 'bateria, tela e slots vêm das abas da máquina; RAM máxima da descrição');
ok(pad('Modelo da placa de vídeo',nb).v==='Intel UHD Graphics' && pad('Modelo da placa de vídeo',{id:'n5',nome:'Dell Latitude 5420 i5 11ª'}).v==='Intel Iris Xe Graphics' &&
  pad('Modelo da placa de vídeo',{id:'n6',nome:'Lenovo E14 Ryzen 5 5500U'}).v==='AMD Radeon Graphics' && pad('Modelo da placa de vídeo',{id:'h1',nome:'x',descricao:'GeForce MX130'},d1).v==='GeForce MX130' &&
  pad('Marca da placa de vídeo',{id:'h1',nome:'x'},d1).v==='NVIDIA' && pad('Resolução da tela',{id:'h1',nome:'x'},d1).v==='1920 x 1080',
  'vídeo pela descrição ou o integrado da geração; marca do vídeo; resolução');
ok(M.mlCasar(['1366 px x 768 px','1920 px x 1080 px'],'1920 x 1080')==='1920 px x 1080 px', 'resolução casa com a opção do Mercado Livre pelos números');

console.log('\no que a loja já teve (anunciadas, vendidas, em estoque)');
ok(JSON.stringify(M.mlCpusComuns({cpu_linha:'Core i5',cpu_ger:'8'},false))==='["8250U","8350U","8265U","8365U"]' &&
  JSON.stringify(M.mlCpusComuns({cpu_linha:'Core i5',cpu_ger:'8'},true))==='["8500T","8400T","8500"]' &&
  M.mlCpusComuns({cpu_linha:'Ryzen 5',cpu_ger:'5'},false).includes('5500U') && M.mlCpusComuns({cpu_linha:'Celeron',cpu_ger:''},false).includes('N4020') &&
  M.mlCpusComuns({cpu_linha:'Core i5',cpu_ger:''},false).length===0, 'os processadores comuns da linha e geração (de mesa: os T); sem geração, nenhum');
const l13={id:'g1',nome:'Dell Latitude 7490 · i5 8ª · SSD 256GB · 16GB RAM',status:'Anunciado'};
const loja=[l13,
  {id:'g2',nome:'Dell Latitude 7490 i5-8350U 8ª 8GB SSD 256GB',status:'Vendido'},
  {id:'g3',nome:'Dell Latitude 7490 i5-8250U 8GB',status:'Vendido'},
  {id:'g4',nome:'Dell Latitude 7490 i5-8350U 16GB',status:'Estoque'},
  {id:'g5',nome:'HP EliteBook 840 G5 i5-8365U 8GB',status:'Vendido'},
  {id:'g6',nome:'Dell Latitude 7490 i7-8650U 16GB',status:'Vendido'},
  {id:'g7',nome:'Dell Latitude 7480 i5 7ª',status:'Vendido',ml_atributos:{PROCESSOR_MODEL:'7300U'}}];
M.poe(loja);
const c13=M.mlCpusDaLoja(l13,M.mlFicha(l13));
ok(c13.sugestao==='8350U' && JSON.stringify(c13.todos)==='["8350U","8250U","8365U"]',
  'processador: o mais comum nas outras Latitude 7490 de i5 8ª; depois as outras de i5 8ª (o i7 e o de 7ª ficam de fora): '+JSON.stringify(c13));
const s13=M.mlSugestao(l13,{id:'PROCESSOR_MODEL',nome:'Modelo do processador'});
ok(s13.v==='8350U' && s13.de==='modelo', 'e vem preenchido, marcado "como nas outras do mesmo modelo"');
const semModelo={id:'g8',nome:'Dell · i5 8ª · SSD 256GB · 8GB RAM'};
ok(M.mlSugestao(semModelo,{id:'PROCESSOR_MODEL',nome:'Modelo do processador'}).v==='' && M.mlCpusDaLoja(semModelo,M.mlFicha(semModelo)).todos[0]==='8350U',
  'sem o modelo, não escolhe sozinho (só põe os da loja primeiro na lista)');
loja.push({id:'c1',nome:'Dell Latitude 7490 i5 8GB',ml_atributos:{COLOR:'Prata'}},{id:'c2',nome:'Dell Vostro 3400 i5',ml_atributos:{COLOR:'Preto'}},
  {id:'c3',nome:'Dell Inspiron 15 i3',ml_atributos:{COLOR:'Preto'}},{id:'c4',nome:'HP 250 G7',ml_atributos:{COLOR:'Cinza',MODEL:'250 G7'}},
  {id:'c5',nome:'Lenovo E14',ml_atributos:{COLOR:'Cinza'}},{id:'c6',nome:'Acer A515',ml_atributos:{COLOR:'Cinza'}});
const r13=M.mlRespostasDaLoja('COLOR',M.mlFicha(l13)), cor13=M.mlSugestao(l13,{id:'COLOR',nome:'Cor'});
ok(r13.sugestao==='Prata' && JSON.stringify(r13.todos)==='["Prata","Preto","Cinza"]' && cor13.v==='Prata' && cor13.de==='loja',
  'outros campos: a resposta das do mesmo modelo, depois da mesma marca, depois de qualquer uma: '+JSON.stringify(r13));
ok(M.mlSugestao(l13,{id:'MODEL',nome:'Modelo'}).de==='cadastro' && M.mlSugestao(semModelo,{id:'MODEL',nome:'Modelo'}).v==='' && M.mlSugestao(semModelo,{id:'X9',nome:'Número de série'}).v==='',
  'modelo e número de série nunca vêm de outra máquina');
const tw1={id:'t1',nome:'Dell · i3 10ª · 8GB RAM',descricao:'Dell Latitude 3420 revisado'}, tw2={id:'t2',nome:'Dell · i3 10ª · 8GB RAM',descricao:''};
M.poe([tw1,tw2]);
const twM=M.mlSugestao(tw2,{id:'MODEL',nome:'Modelo'}), twT=M.mlSugestao(tw2,{id:'DISPLAY_SIZE',nome:'Tamanho da tela'});
ok(twM.v==='Latitude 3420' && twM.de==='igual' && twT.v==='14 "' && twT.de==='igual', 'a unidade igual sem descrição: modelo (inteiro) e tela vêm da ficha da outra, para confirmar');
const gb1={id:'s1',nome:'Samsung Galaxy Book i5 11ª 8GB SSD 256GB'};
M.poe([gb1,{id:'s2',nome:'Samsung Galaxy Book i5 11ª 8GB SSD 256GB 15.6"'}]);
ok(M.mlFicha(gb1).tela==='15.6', 'modelo sem regra de tela: a tela das outras do mesmo modelo');

console.log('\n'+(falhas?falhas+' FALHA(S)':'tudo verde'));
process.exit(falhas?1:0);
