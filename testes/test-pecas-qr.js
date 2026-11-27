// Peças com etiqueta e QR (index.html): número próprio (P1, P2…) separado do das máquinas, o
// que vai escrito na etiqueta (nunca custo, preço ou fornecedor), o QR com #p=, a etiqueta
// escaneada antes do login, "sem etiqueta", o número dado antes de imprimir, a etiqueta
// marcada como impressa e a conferência do estoque (o que já foi visto e o que falta).
// uso: node testes/test-pecas-qr.js
const { extrair, SRC } = require('./extrair.js');
let falhas = 0;
const ok = (c, n) => { console.log((c ? '  ok  ' : '  FALHOU  ') + n); if (!c) falhas++; };
const linha = re => { const m = SRC.match(re); if (!m) throw new Error('não achei ' + re); return m[0]; };
const trecho = (de, ate) => { const i = SRC.indexOf(de); if (i < 0) throw new Error('não achei ' + de); return SRC.slice(i, SRC.indexOf(ate, i)); };

// monta um mundo de mentira (banco, gravações e a tela) com as peças dadas
function novo(ini) {
  const corpo = [
    'let perfilAtual=perfil, pecas=ini.pecas, etqUltPeca=ini.ult||0, pecaConf=ini.conf||null, filtPecas="todos";',
    'const ETQ_MAX=200; const gravados=[]; const avisos=[];',
    linha(/const QR_ORIGEM='[^']+';/), linha(/const qrUrlPeca=n=>[^;]+;/),
    'const idLocal=id=>/^l\\d+$/.test(String(id));',
    'const db={}; const doc=(d,col,id)=>({col,id});',
    'const updateDoc=(ref,dados)=>ref.id==="falha"?Promise.reject(new Error("sem internet")):(gravados.push({...ref,...dados}),Promise.resolve());',
    'const setDoc=(ref,dados)=>(gravados.push({...ref,...dados}),Promise.resolve());',
    'const gravar=async pr=>{ try{ await pr; return true; }catch(e){ return false; } };',
    'const etqCarregar=async()=>0; const renderPecas=()=>{};',
    'const document={ getElementById:id=>id==="pcToast"?{set textContent(t){avisos.push(t);},set hidden(h){}}:null };',
    'const esc=s=>String(s);',
    extrair('function etqFaixas('),
    extrair('async function etqReservarPeca('),
    linha(/const NOME_SOCIO=[^;]+;/),
    extrair('function pecaPorNum('), extrair('function proxNumLivrePeca('), extrair('function pecaRotulo('),
    extrair('function etqDadosPeca('), extrair('function pecasSemEtq('), extrair('async function pecaFixarNumeros('),
    extrair('function pecaMarcarImpressas('), 'let pcToastT=0;', extrair('function pcToast('), extrair('function pecaVista('),
    linha(/const confAtiva=\(\)=>[^;]+;/), linha(/const pecaConferida=p=>[^;]+;/),
    extrair('function confContagem('), extrair('function confFaltam('),
    'return { etqDadosPeca, pecasSemEtq, pecaFixarNumeros, pecaMarcarImpressas, pecaVista, proxNumLivrePeca, confContagem, confFaltam, pecaConferida,',
    '  ult: () => etqUltPeca, gravados: () => gravados, avisos: () => avisos };'].join('\n');
  return new Function('perfil', 'ini', corpo)('igor', ini);
}

(async () => {
  console.log('\no que vai escrito na etiqueta da peça');
  const pecas = [
    { id: 'a', num: 3, nome: 'Dell Dell Pino grosso 130W (RGB) · E3 pinos', tipo: 'Carregador', custo: 45, venda: 120, fornecedor_nome: 'Fulano Peças', status: 'Estoque', obs: 'nota interna' },
    { id: 'b', num: 4, nome: 'Plug de tomada E3 (3 pinos)', tipo: 'Plug/Tomada', quantidade: 7, status: 'Estoque' },
    { id: 'c', nome: 'Tela 14 Full HD 30 pinos', tipo: 'Tela', status: 'Estoque', criadoEm: '2026-11-02' },
    { id: 'd', nome: 'SSD 240GB', tipo: 'HD/SSD', status: 'Estoque', criadoEm: '2026-11-01' },
    { id: 'e', nome: 'Bateria T480', tipo: 'Bateria', status: 'Vendido' },
    { id: 'l1700000000000', nome: 'Teclado sem internet', tipo: 'Teclado', status: 'Estoque' },
  ];
  let E = novo({ pecas, ult: 10 });
  const d = E.etqDadosPeca(3);
  ok(d.rotulo === 'P3' && d.qr === 'https://anunc-ia.vercel.app/#p=3' && d.nome === 'Dell Pino grosso 130W (RGB) · E3 pinos' && d.specs[0] === 'Carregador',
    'P3, o QR da peça (#p=3), o nome sem a marca repetida e o tipo');
  ok(!/45|120|Fulano|nota interna/.test(JSON.stringify(d)), 'custo, preço, fornecedor e anotação nunca vão na etiqueta');
  ok(E.etqDadosPeca(4).specs[0] === 'Plug/Tomada · 7 unidades', 'saquinho com várias: a quantidade aparece');
  const vazia = E.etqDadosPeca(9);
  ok(vazia.rotulo === 'P9' && !vazia.nome && vazia.qr.endsWith('#p=9'), 'etiqueta nova (sem peça ainda): só o número e o QR');
  ok(!/#n=/.test(vazia.qr), 'o QR da peça não abre máquina (#n= é das máquinas)');

  console.log('\nnúmero próprio, separado das máquinas');
  ok(E.proxNumLivrePeca() === 11, 'o próximo pula as etiquetas já impressas (reservadas até P10)');
  ok(novo({ pecas: [{ id: 'x', num: 15 }], ult: 2 }).proxNumLivrePeca() === 16, 'e pula os números que as peças já têm');

  console.log('\nsem etiqueta e o número dado antes de imprimir');
  ok(E.pecasSemEtq().map(p => p.id).join() === 'a,b,c,d', 'em estoque e sem etiqueta impressa (vendida e a que não subiu para o banco ficam de fora)');
  const feitas = await E.pecaFixarNumeros(E.pecasSemEtq());
  ok(JSON.stringify(feitas) === '[11,12]' && pecas[3].num === 11 && pecas[2].num === 12, 'só as sem número ganham, na ordem do cadastro, depois do último reservado: ' + feitas);
  ok(E.ult() === 12 && E.gravados().some(g => g.col === 'config' && g.id === 'etiquetas' && g.ult_peca === 12 && g.userId === 'shared_ijx'),
    'os números ficam reservados no banco (ult_peca), separados dos das máquinas');
  ok(!E.gravados().some(g => g.etq_em), 'ganhar número não é ter etiqueta impressa');
  const falha = novo({ pecas: [{ id: 'falha', nome: 'X', status: 'Estoque' }], ult: 0 });
  ok((await falha.pecaFixarNumeros(falha.pecasSemEtq())).length === 0, 'sem internet: não inventa número');

  console.log('\netiqueta impressa');
  E.pecaMarcarImpressas([3, 11, 99]);
  ok(pecas[0].etq_em && pecas[3].etq_em && E.gravados().filter(g => g.etq_em).map(g => g.id).sort().join() === 'a,d', 'as peças com esses números passam a ter etiqueta (número sem peça não quebra)');
  ok(E.pecasSemEtq().map(p => p.id).join() === 'b,c', 'e saem do "sem etiqueta"');

  console.log('\nconferência do estoque');
  const ha = min => new Date(Date.now() - min * 60000).toISOString();
  const inicio = ha(60);   // começou há uma hora
  const est = [
    { id: 'p1', num: 1, nome: 'Tela', status: 'Estoque', visto_em: ha(30) },
    { id: 'p2', num: 2, nome: 'SSD', status: 'Estoque', visto_em: ha(7 * 24 * 60) },
    { id: 'p3', num: 3, nome: 'RAM', status: 'Estoque' },
    { id: 'p4', num: 4, nome: 'Bateria', status: 'Vendido' },
  ];
  E = novo({ pecas: est, conf: { inicio, fim: '' } });
  ok(JSON.stringify(E.confContagem()) === '{"total":3,"vistas":1,"faltam":2}', 'só o estoque conta; vista antes do começo não vale');
  ok(E.confFaltam().map(p => p.id).join() === 'p2,p3', 'o que falta conferir');
  E.pecaVista(est[2]);
  ok(est[2].visto_por === 'Igor' && E.pecaConferida(est[2]) && E.gravados().some(g => g.id === 'p3' && g.visto_em && g.visto_por === 'Igor'),
    'escanear (ou o ✓) grava quando e quem viu');
  ok(/^✓ P3 vista agora · 2 de 3 conferidas$/.test(E.avisos().pop()), 'e avisa como está a conferência');
  const enc = novo({ pecas: est, conf: { inicio, fim: ha(1) } });
  ok(enc.confContagem() === null && enc.confFaltam().length === 0 && !enc.pecaConferida(est[0]), 'conferência encerrada: nada fica "faltando"');
  const sem = novo({ pecas: est, conf: null });
  sem.pecaVista(est[1]);
  ok(/^✓ P2 vista agora$/.test(sem.avisos().pop()), 'sem conferência, escanear ainda grava que a peça foi vista');

  console.log('\no quadro da conferência na aba Peças');
  const quadro = (pecasQ, conf, ult) => {
    const els = { pecasConfBox: { innerHTML: '' }, pfFaltam: { hidden: true } };
    const f = new Function('pecas', 'pecaConf', 'etqUltPeca', 'document', [
      'const idLocal=id=>/^l\\d+$/.test(String(id)); const esc=s=>String(s).replace(/</g,"&lt;");',
      extrair('function etqFaixas('), extrair('function pecaQuando('), extrair('function pecasSemEtq('),
      linha(/const confAtiva=\(\)=>[^;]+;/), linha(/const pecaConferida=p=>[^;]+;/), extrair('function confContagem('),
      extrair('function renderPecasConf('), 'renderPecasConf();'].join('\n'));
    f(pecasQ, conf, ult, { getElementById: id => els[id] || null });
    return els;
  };
  let q = quadro([{ id: 'a', num: 1, status: 'Estoque', etq_em: 'x' }, { id: 'b', num: 4, status: 'Estoque' }, { id: 'c', status: 'Estoque' }], null, 6);
  let h = q.pecasConfBox.innerHTML;
  ok(/Começar conferência/.test(h) && /2 peças em estoque ainda sem etiqueta/.test(h) && q.pfFaltam.hidden, 'sem conferência: o botão de começar e quantas ainda estão sem etiqueta');
  ok(/4 etiquetas impressas ainda sem peça: P2-P3, P5-P6/.test(h), 'as etiquetas impressas que ainda não estão em nenhuma peça (P2-P3, P5-P6)');
  const est2 = [
    { id: 'q1', num: 1, status: 'Estoque', visto_em: ha(30) }, { id: 'q2', num: 2, status: 'Estoque', visto_em: ha(10) },
    { id: 'q3', num: 3, status: 'Estoque', visto_em: ha(7 * 24 * 60) }, { id: 'q4', num: 4, status: 'Usado' }];
  q = quadro(est2, { inicio, fim: '', por: 'João' }, 4);
  h = q.pecasConfBox.innerHTML;
  ok(/Conferência em andamento/.test(h) && /<b>2 de 3<\/b> peças em estoque conferidas · faltam <b>1<\/b>/.test(h) && /width:67%/.test(h) && /\(João\)/.test(h) && !q.pfFaltam.hidden,
    'em andamento: a barra, quantas foram vistas, quantas faltam e quem começou');
  ok(/Ver as que faltam/.test(h) && /Encerrar/.test(h) && /etqAbrir\(null,\\?'peca\\?'\)/.test(h), 'e os botões: ver as que faltam, etiquetas e encerrar');
  q = quadro(est2, { inicio, fim: ha(1), vistas: 3, total: 3 }, 4);
  ok(/Última conferência: .* · 3 de 3 conferidas/.test(q.pecasConfBox.innerHTML), 'depois de encerrar: o resumo da última');

  console.log('\na etiqueta escaneada (#p=12)');
  const qr = new Function('location', 'history', 'sessionStorage', 'document', [
    'let qrPend=0, qrPendPeca=0;', extrair('function qrLerHash('), 'return () => ({ n: qrLerHash(), qrPend, qrPendPeca });'].join('\n'));
  const guardado = {}, aviso = { hidden: true, textContent: '' };
  const ler = hash => qr({ hash, pathname: '/', search: '' }, { replaceState() {} }, { setItem: (k, v) => { guardado[k] = v; } },
    { getElementById: () => aviso })();
  let r = ler('#p=12');
  ok(r.n === 0 && r.qrPendPeca === 12 && r.qrPend === 0 && guardado.qrPeca === '12', 'peça: guarda o número para depois do login e não abre página pública de máquina');
  ok(!aviso.hidden && /P12: entre para abrir esta peça/.test(aviso.textContent), 'e pede para entrar');
  r = ler('#n=101');
  ok(r.n === 101 && r.qrPend === 101, 'a etiqueta de máquina continua igual');
  const volta = extrair('async function qrVoltaDoLogin(');
  ok(/await pecasProntas;[\s\S]*qrPecaAbrir\(np\)/.test(volta) && /sessionStorage\.removeItem\('qrPeca'\)/.test(volta), 'depois do login, espera as peças e abre a da etiqueta');
  const abrir = extrair('window.qrPecaAbrir=n=>{');
  ok(/if\(!pecasOk\)/.test(abrir) && /pecaVista\(p\); openPecaEdit\(p\.id\)/.test(abrir) && /qrPecaCadAbrir\(n\)/.test(abrir),
    'abre a peça (e marca como vista) ou o cadastro; sem a lista do banco, não abre cadastro (evita peça repetida)');
  ok(/if\(pecasOk && !pecas\.some\(p=>p\.tipo==='Carregador'\)\)/.test(extrair('async function loadPecas(')), 'sem internet, as fontes da planilha não entram repetidas');

  console.log('\ncadastro pela etiqueta');
  const add = extrair('window.addPeca=async()=>{');
  ok(/pecaPorNum\(numEtq\)/.test(add) && /num:numEtq,etq_em:agoraEtq,visto_em:agoraEtq/.test(add) && /etqReservarPeca\(numEtq\)/.test(add),
    'entra com o número da etiqueta, já impressa e vista; número de outra peça é recusado');
  const cad = extrair('function qrPecaCadAbrir(');
  ok(/getElementById\('pecasAddCard'\)/.test(cad) && /qrCadMover\(card\)/.test(cad) && /Essa peça já está no sistema, sem etiqueta\?/.test(cad), 'o formulário da aba vai para a caixa, com a escolha da peça já cadastrada');
  const ligar = extrair('window.qrPecaLigar=async n=>{');
  ok(/num:n,etq_em:agora/.test(ligar) && /já é da peça/.test(ligar), 'escolher a peça já cadastrada passa a etiqueta para ela (e não rouba de outra)');
  const fechar = extrair('window.qrCadFechar=()=>{');
  ok(/c\.pai\.insertBefore\(c\.card/.test(fechar) && /#qrbLigar/.test(fechar), 'fechar devolve o formulário para o mesmo lugar e tira a escolha');

  console.log('\na tela de etiquetas no modo peça');
  ok(/etqLerNums\(peca\?inp\.value\.replace\(\/p\(\?=\\s\*\\d\)\/gi,''\):inp\.value\)/.test(SRC), '"P1-P10" vale o mesmo que "1-10"');
  const nomeArq = new Function(extrair('function etqFaixas(') + extrair('function etqNomeArq(') + 'return etqNomeArq;')();
  ok(nomeArq([1, 2, 3, 7], 'pdf', 'peca') === 'etiquetas-pecas-P1-P3_P7.pdf' && nomeArq([12, 13, 15], 'pdf') === 'etiquetas-12-13_15.pdf', 'o PDF das peças tem nome próprio (o das máquinas segue igual)');
  const reservar = extrair('async function etqReservar(');
  ok(/if\(modo==='peca'\)\{\s*pecaMarcarImpressas\(nums\);/.test(reservar), 'imprimir, PDF ou imagens no modo peça marca as etiquetas como impressas');
  ok((SRC.match(/etqReservar\(e\.nums,e\.modo\)/g) || []).length === 5, 'os 3 botões (imagens, imprimir, PDF) reservam na numeração certa');
  const desenhar = extrair('function etqDesenhar(');
  ok(/q\.addData\(d\.qr\|\|qrUrl\(d\.num\)\)/.test(desenhar) && /const numTxt=d\.rotulo\|\|\('#'\+d\.num\)/.test(desenhar), 'o desenho usa o QR e o número da peça');

  console.log(falhas ? `\n${falhas} FALHA(S)` : '\ntudo verde');
  process.exit(falhas ? 1 : 0);
})();
