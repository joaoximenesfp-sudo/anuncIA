// Etiquetas em PDF (index.html): a grade da folha A4 (quantas cabem, sempre dentro da margem),
// uma por página no rolo, o PDF montado sem biblioteca (cabeçalho, tabela xref, páginas,
// imagens de 1 bit compactadas), a página de imprimir com as mesmas posições e o botão
// "🏷️ Etiquetas" da barra de seleção da lista.
// uso: node testes/test-etiqueta-pdf.js
const zlib = require('zlib'), fs = require('fs'), os = require('os'), path = require('path');
const { execFileSync } = require('child_process');
const { extrair, SRC } = require('./extrair.js');
let falhas = 0;
const ok = (c, n) => { console.log((c ? '  ok  ' : '  FALHOU  ') + n); if (!c) falhas++; };
const linha = re => { const m = SRC.match(re); if (!m) throw new Error('não achei ' + re); return m[0]; };
const E = new Function([
  linha(/const ETQ_TAM=\{[^}]+\};/), linha(/const MM_PT=[^;]+;/),
  extrair('function etqFaixas('), extrair('function etqGrade('), extrair('function etqPosicoes('), extrair('function etqBits('),
  extrair('async function pdfComprimir('), extrair('function pdfMontar('), extrair('function etqPaginas('),
  extrair('function etqNomeArq('), extrair('function etqHtmlImpressao('),
  'return { ETQ_TAM, etqGrade, etqPosicoes, etqBits, pdfComprimir, pdfMontar, etqPaginas, etqNomeArq, etqHtmlImpressao };'].join('\n'))();

// lê o PDF de volta: confere a tabela xref e devolve os objetos
function lerPdf(u8) {
  const txt = Buffer.from(u8).toString('latin1');
  const sx = txt.match(/startxref\n(\d+)\n%%EOF\n$/);
  if (!sx) throw new Error('sem startxref no fim');
  const xref = +sx[1];
  const tab = txt.slice(xref).match(/^xref\n0 (\d+)\n([\s\S]*?)trailer\n<< \/Size (\d+) \/Root 1 0 R >>/);
  if (!tab) throw new Error('xref não está onde o startxref diz');
  const ents = tab[2].match(/.{20}/gs) || [];
  const objs = {};
  let xrefCerta = ents.length === +tab[1] && +tab[3] === +tab[1] && ents[0] === '0000000000 65535 f \n';
  for (let k = 1; k < ents.length; k++) {
    const off = +ents[k].slice(0, 10);
    if (!txt.startsWith(k + ' 0 obj\n', off)) { xrefCerta = false; continue; }
    const fim = txt.indexOf('\nendobj\n', off);
    const corpo = txt.slice(off + (k + ' 0 obj\n').length, fim);
    const s = corpo.indexOf('\nstream\n');
    objs[k] = s < 0 ? { dic: corpo } : { dic: corpo.slice(0, s), stream: Buffer.from(corpo.slice(s + 8, corpo.lastIndexOf('\nendstream')), 'latin1') };
  }
  return { txt, objs, xrefCerta };
}
// uma etiqueta de mentira, já em 1 bit: um xadrez que muda com o número
function bitsDe(i, W, H) {
  const rgba = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const v = ((x >> 3) + (y >> 3) + i) % 2 ? 255 : 0; const o = (y * W + x) * 4; rgba[o] = rgba[o + 1] = rgba[o + 2] = v; rgba[o + 3] = 255; }
  return E.etqBits(rgba, W, H);
}

(async () => {
  console.log('\nquantas cabem na folha A4 (margem de 5 mm, coladas)');
  const esperado = { '50x30': [4, 9], '40x30': [5, 9], '40x25': [5, 11], '60x40': [3, 7], '30x20': [6, 14], '58x30': [3, 9], '80x40': [2, 7] };
  let dentro = true;
  for (const [tam, [c, l]] of Object.entries(esperado)) {
    const g = E.etqGrade(tam);
    if (g.cols !== c || g.lins !== l || g.porFolha !== c * l) ok(false, tam + ': ' + g.cols + '×' + g.lins);
    const pos = E.etqPosicoes(g.porFolha, tam, 'a4');
    for (const p of pos) if (p.x < 5 - 1e-9 || p.y < 5 - 1e-9 || p.x + g.w > 205 + 1e-9 || p.y + g.h > 292 + 1e-9 || p.pag !== 0) dentro = false;
  }
  ok(true, '50×30: 36 por folha · 40×30: 45 · 40×25: 55 · 60×40: 21 · 30×20: 84 · bobina 58: 27 · bobina 80: 14');
  ok(dentro, 'todas as etiquetas dentro da margem, sem passar da folha');
  const p = E.etqPosicoes(40, '50x30', 'a4');
  ok(p[0].x === 5 && p[0].y === 13.5 && p[1].x === 55 && p[4].x === 5 && p[4].y === 43.5, 'a grade fica no meio da folha e as etiquetas, coladas: ' + JSON.stringify(p.slice(0, 2)));
  ok(p.filter(q => q.pag === 0).length === 36 && p.filter(q => q.pag === 1).length === 4 && p[36].x === 5 && p[36].y === 13.5, '40 etiquetas: 36 na primeira folha e 4 na segunda, começando do topo');
  ok(E.etqPosicoes(3, '50x30', 'rolo').map(q => q.pag).join() === '0,1,2', 'no rolo, uma por página');

  console.log('\n1 bit por ponto');
  const rgba = new Uint8ClampedArray(10 * 2 * 4);
  for (let x = 0; x < 10; x++) { const v = x % 2 ? 0 : 255; for (const y of [0, 1]) { const o = (y * 10 + x) * 4; rgba[o] = rgba[o + 1] = rgba[o + 2] = y ? 255 - v : v; rgba[o + 3] = 255; } }
  const b = E.etqBits(rgba, 10, 2);
  ok(b.length === 4 && b[0] === 0xAA && b[1] === 0x80 && b[2] === 0x55 && b[3] === 0x40, 'branco = 1, preto = 0, cada linha completa até o byte: ' + [...b].map(v => v.toString(16)).join(' '));

  console.log('\no PDF na folha A4');
  const W = 400, H = 240, N = 40;
  const crus = Array.from({ length: N }, (_, i) => bitsDe(i, W, H));
  const imagens = [];
  for (const bits of crus) { const z = await E.pdfComprimir(bits); imagens.push({ w: W, h: H, dados: z || bits, flate: !!z }); }
  ok(imagens.every(im => im.flate) && imagens[0].dados.length < crus[0].length / 5, 'compactado (' + crus[0].length + ' → ' + imagens[0].dados.length + ' bytes por etiqueta)');
  const pdf = E.pdfMontar(E.etqPaginas(N, '50x30', 'a4'), imagens);
  const L = lerPdf(pdf);
  ok(/^%PDF-1\.6\n%\xE2\xE3\xCF\xD3\n/.test(L.txt), 'cabeçalho de PDF, com a linha que avisa que tem binário');
  ok(L.xrefCerta, 'a tabela xref aponta para o começo de cada objeto');
  ok(/\/Type \/Catalog \/Pages 2 0 R \/ViewerPreferences << \/PrintScaling \/None >>/.test(L.objs[1].dic), 'pede para imprimir em tamanho real (sem "ajustar à página")');
  const pags = Object.values(L.objs).filter(o => /\/Type \/Page /.test(o.dic));
  ok(/\/Count 2 /.test(L.objs[2].dic) && pags.length === 2, 'duas páginas');
  ok(pags.every(pg => /\/MediaBox \[0 0 595\.28 841\.89\]/.test(pg.dic)), 'cada página do tamanho A4 (595,28 × 841,89 pt)');
  const conteudo = k => L.objs[+pags[k].dic.match(/\/Contents (\d+) 0 R/)[1]].stream.toString('latin1');
  const c1 = conteudo(0), c2 = conteudo(1);
  ok((c1.match(/ Do Q/g) || []).length === 36 && (c2.match(/ Do Q/g) || []).length === 4, '36 etiquetas na primeira página, 4 na segunda');
  ok((c1.match(/ re\n/g) || []).length === 36 && /^q 0\.7 G 0\.3 w$/m.test(c1) && /\nS Q\n$/.test(c1), 'linha de corte cinza fininha em volta de cada uma');
  // 5 mm da esquerda e 13,5 mm do topo: no PDF a conta é de baixo, 297 − 13,5 − 30 = 253,5 mm = 718,58 pt
  ok(/^q 141\.73 0 0 85\.04 14\.17 718\.58 cm \/I0 Do Q$/m.test(c1), 'a primeira no canto de cima, no tamanho exato (50 × 30 mm = 141,73 × 85,04 pt)');
  const ims = Object.values(L.objs).filter(o => /\/Subtype \/Image/.test(o.dic));
  ok(ims.length === N && ims.every(o => /\/Width 400 \/Height 240 \/ColorSpace \/DeviceGray \/BitsPerComponent 1 \/Filter \/FlateDecode/.test(o.dic)), '40 imagens de 400 × 240 pontos (8 por mm), 1 bit, compactadas');
  ok(ims.every((o, i) => +o.dic.match(/\/Length (\d+)/)[1] === o.stream.length && zlib.inflateSync(o.stream).equals(Buffer.from(crus[i]))), 'cada imagem volta igualzinha ao descompactar');
  ok(/\/I0 3 0 R/.test(pags[0].dic) && /\/I39 42 0 R/.test(pags[1].dic) && !/\/I0 /.test(pags[1].dic), 'cada página só chama as imagens dela');

  console.log('\nno rolo e sem compactação');
  const salvo = global.CompressionStream; global.CompressionStream = undefined;
  ok(await E.pdfComprimir(crus[0]) === null, 'navegador sem CompressionStream: vai sem compactar');
  global.CompressionStream = salvo;
  const rolo = lerPdf(E.pdfMontar(E.etqPaginas(3, '50x30', 'rolo'), crus.slice(0, 3).map(d => ({ w: W, h: H, dados: d, flate: false }))));
  const pr = Object.values(rolo.objs).filter(o => /\/Type \/Page /.test(o.dic));
  ok(rolo.xrefCerta && pr.length === 3 && pr.every(pg => /\/MediaBox \[0 0 141\.73 85\.04\]/.test(pg.dic)), 'três páginas do tamanho da etiqueta');
  ok(Object.values(rolo.objs).filter(o => /\/Subtype \/Image/.test(o.dic)).every(o => !/Filter/.test(o.dic) && o.stream.length === crus[0].length), 'imagens sem /Filter, com os bytes crus');
  const cr = rolo.objs[+pr[0].dic.match(/\/Contents (\d+) 0 R/)[1]].stream.toString('latin1');
  ok(cr === 'q 141.73 0 0 85.04 0 0 cm /I0 Do Q\n', 'a etiqueta ocupa a página inteira, sem linha de corte: ' + JSON.stringify(cr));

  // se o poppler estiver instalado, ele abre o PDF sem reclamar de nada
  let poppler = true; try { execFileSync('pdfinfo', ['-v'], { stdio: 'ignore' }); } catch (e) { poppler = false; }
  if (poppler) {
    const arq = path.join(os.tmpdir(), 'etq-teste-' + process.pid + '.pdf');
    fs.writeFileSync(arq, pdf);
    const r = require('child_process').spawnSync('pdfinfo', [arq], { encoding: 'utf8' });
    ok(r.status === 0 && /Pages:\s+2/.test(r.stdout) && /Page size:\s+595\.28 x 841\.89 pts \(A4\)/.test(r.stdout) && !r.stderr.trim(), 'pdfinfo: 2 páginas A4, sem erro' + (r.stderr.trim() ? ' — ' + r.stderr.trim() : ''));
    const png = require('child_process').spawnSync('pdftoppm', ['-r', '30', '-f', '1', '-l', '1', '-png', arq, arq], { encoding: 'utf8' });
    ok(png.status === 0 && !png.stderr.trim(), 'pdftoppm desenha a página sem erro' + (png.stderr.trim() ? ' — ' + png.stderr.trim() : ''));
    try { fs.unlinkSync(arq); fs.readdirSync(os.tmpdir()).filter(f => f.startsWith('etq-teste-' + process.pid)).forEach(f => fs.unlinkSync(path.join(os.tmpdir(), f))); } catch (e) {}
  } else console.log('  (sem pdfinfo aqui: pulei a conferência pelo poppler)');

  console.log('\nnome do arquivo');
  ok(E.etqNomeArq([12, 13, 15], 'pdf') === 'etiquetas-12-13_15.pdf', 'as faixas no nome: ' + E.etqNomeArq([12, 13, 15], 'pdf'));
  ok(E.etqNomeArq(Array.from({ length: 30 }, (_, i) => i * 2 + 1), 'pdf') === 'etiquetas-30-maquinas.pdf', 'muitas soltas: só a quantidade');

  console.log('\na página de imprimir');
  const urls = Array.from({ length: 40 }, (_, i) => 'data:image/png;base64,X' + i);
  const ha = E.etqHtmlImpressao(urls, '50x30', 'a4');
  ok(/@page\{size:A4;margin:0\}/.test(ha) && (ha.match(/<div class="fl">/g) || []).length === 2 && (ha.match(/<img /g) || []).length === 40, 'A4: duas folhas com as 40');
  ok(/<img src="data:image\/png;base64,X0" style="left:5mm;top:13\.5mm">/.test(ha) && /<img src="data:image\/png;base64,X1" style="left:55mm;top:13\.5mm">/.test(ha), 'as mesmas posições do PDF');
  ok(/\.fl img\{position:absolute;width:50mm;height:30mm;image-rendering:pixelated;outline:\.1mm solid #b3b3b3\}/.test(ha), 'no tamanho exato, com a linha de corte');
  const hr = E.etqHtmlImpressao(urls.slice(0, 3), '40x25', 'rolo');
  ok(/@page\{size:40mm 25mm;margin:0\}/.test(hr) && (hr.match(/<img /g) || []).length === 3 && !/class="fl"/.test(hr), 'rolo: uma por página, do tamanho da etiqueta');

  console.log('\no botão "🏷️ Etiquetas" da barra de seleção');
  const chamadas = { abrir: [], aviso: [], alertas: [] };
  const B = new Function('stubs', [
    'let {loteLista,numProv,ETQ_MAX,etqFixarNumeros,etqAbrir,etqAvisoNumeros,alert,document}=stubs;',
    extrair('function etqFaixas('), 'const loteEtiquetas=' + extrair('window.loteEtiquetas=').replace(/^window\.loteEtiquetas=/, ''),
    'return { rodar: async l => { loteLista = l; await loteEtiquetas(); } };'].join('\n'));
  const numProv = new Set(['p3', 'l1']);
  const bt = { disabled: false, textContent: '🏷️ Etiquetas' };
  const T = B({ loteLista: [], numProv, ETQ_MAX: 200,
    etqFixarNumeros: async l => { const f = []; for (const p of l) if (p.id === 'p3') { p.num = 20; numProv.delete('p3'); f.push(20); } return f; },
    etqAbrir: async s => { chamadas.abrir.push(s); }, etqAvisoNumeros: (f, t) => chamadas.aviso.push([f, t]),
    alert: m => chamadas.alertas.push(m), document: { getElementById: id => id === 'loteEtqBt' ? bt : null } });
  await T.rodar([{ id: 'p1', num: 12, status: 'Anunciado' }, { id: 'p2', num: 9, status: 'Vendido' }, { id: 'p3', num: 4, status: 'Estoque' }, { id: 'l1', num: 5, status: 'Estoque' }, { id: 'p5', num: 13, status: 'Reservado' }]);
  ok(chamadas.abrir[0] === '12-13, 20', 'abre as etiquetas das marcadas, sem a vendida: ' + chamadas.abrir[0]);
  ok(chamadas.aviso[0][0].join() === '20' && /1 máquina ficou de fora: ainda não subiu para o banco/.test(chamadas.aviso[0][1]), 'a antiga ganhou número (#20) e avisa a que ainda não subiu');
  ok(bt.disabled === false && bt.textContent === '🏷️ Etiquetas', 'o botão volta ao normal');
  await T.rodar(Array.from({ length: 205 }, (_, i) => ({ id: 'q' + i, num: 1000 + i, status: 'Estoque' })));
  ok(chamadas.abrir[1] === '1000-1199' && /5 ficaram para a próxima \(#1200 em diante\)/.test(chamadas.aviso[1][1]), 'mais de 200: as 200 primeiras e o aviso do resto');
  await T.rodar([{ id: 'p2', num: 9, status: 'Vendido' }]);
  ok(chamadas.alertas.length === 1 && chamadas.abrir.length === 2, 'só vendida: avisa e não abre nada');
  ok(/id="loteEtqBt"[^>]*onclick="loteEtiquetas\(\)"/.test(SRC) && SRC.indexOf('id="loteEtqBt"') > SRC.indexOf('id="loteBar"'), 'o botão está na barra de seleção');
  ok(/id="etqPdfBt" onclick="etqPdfBaixar\(\)"/.test(SRC) && /data-folha="a4"/.test(SRC) && /data-folha="rolo"/.test(SRC), 'na tela das etiquetas: "Baixar PDF" e a escolha rolo / folha A4');

  console.log(falhas ? `\n${falhas} FALHA(S)` : '\ntudo verde');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error('ERRO', e); process.exit(2); });
