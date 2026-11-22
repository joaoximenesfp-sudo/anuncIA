// Vídeo para o Instagram (video.js): ler o MP4/MOV, conferir as regras e pôr o índice no
// começo sem perder nada. Os vídeos de teste são gerados com o ffmpeg (H.264, HEVC, MOV
// girado como o do iPhone, 4K, câmera lenta, som PCM...), e a cópia arrumada é comparada
// pacote a pacote com a original: se um bit da imagem ou do som mudasse, o teste falha.
// uso: node testes/test-video.js   (sem ffmpeg, pula a parte dos vídeos de verdade)
const path = require('path'), fs = require('fs'), os = require('os');
const { execFileSync } = require('child_process');
const V = require(path.join(__dirname, '..', 'video.js'));
let falhas = 0;
const ok = (c, n) => { console.log((c ? '  ok  ' : '  FALHOU  ') + n); if (!c) falhas++; };
const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'video-teste-'));
const temFfmpeg = (() => { try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); return true; } catch (e) { return false; } })();
const ff = args => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args], { stdio: ['ignore', 'ignore', 'pipe'] });
const blobDe = arq => fs.openAsBlob(arq, { type: /\.mov$/.test(arq) ? 'video/quicktime' : 'video/mp4' });
const salvar = async (blob, arq) => { fs.writeFileSync(arq, Buffer.from(await blob.arrayBuffer())); return arq; };
// os pacotes (dados comprimidos) de cada faixa, sem decodificar: iguais = nada mudou
const pacotes = arq => execFileSync('ffmpeg', ['-v', 'error', '-i', arq, '-map', '0', '-c', 'copy', '-f', 'framemd5', '-'], { encoding: 'utf8' })
  .split('\n').filter(l => l && !l.startsWith('#')).join('\n');
const indiceAntes = async arq => { const { lista } = await V.caixasDoArquivo(await blobDe(arq)); return lista.findIndex(c => c.tipo === 'moov') < lista.findIndex(c => c.tipo === 'mdat'); };

// MP4 mínimo montado à mão: índice no fim e endereços de 64 bits (co64), para o caso raro
function caixa(tipo, ...partes) {
  const corpo = Buffer.concat(partes.map(p => Buffer.isBuffer(p) ? p : Buffer.from(p)));
  const h = Buffer.alloc(8); h.writeUInt32BE(8 + corpo.length); h.write(tipo, 4, 'latin1');
  return Buffer.concat([h, corpo]);
}
const u32 = n => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };
const u64 = n => { const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(n)); return b; };

(async () => {
  console.log('\nmontado à mão: índice no fim, endereços de 64 bits');
  const ftyp = caixa('ftyp', 'isom', u32(512), 'isommp41');
  const dados = Buffer.from('OLA-QUADRO-1|OLA-QUADRO-2');
  const mdat = caixa('mdat', dados);
  const ini1 = ftyp.length + 8, ini2 = ini1 + 13;
  const moov = caixa('moov', caixa('trak', caixa('mdia', caixa('minf', caixa('stbl', caixa('co64', u32(0), u32(2), u64(ini1), u64(ini2)))))));
  const feito = path.join(pasta, 'mao.mp4');
  fs.writeFileSync(feito, Buffer.concat([ftyp, mdat, moov]));
  const iM = await V.analisar(await blobDe(feito));
  const novoM = Buffer.from(await V.indiceNoComeco(await blobDe(feito), iM).arrayBuffer());
  const co = novoM.indexOf('co64'), o1 = Number(novoM.readBigUInt64BE(co + 12)), o2 = Number(novoM.readBigUInt64BE(co + 20));
  ok(!iM.indiceNoComeco && novoM.length === ftyp.length + mdat.length + moov.length && novoM.indexOf('moov') < novoM.indexOf('mdat') &&
    novoM.toString('latin1', o1, o1 + 12) === 'OLA-QUADRO-1' && novoM.toString('latin1', o2, o2 + 12) === 'OLA-QUADRO-2',
    'o índice vai para antes dos dados e os endereços (64 bits) continuam apontando para o mesmo quadro');
  fs.writeFileSync(path.join(pasta, 'lixo.mp4'), Buffer.from('isto não é um vídeo, é só um texto qualquer de teste'));
  let erro = '';
  try { await V.analisar(await blobDe(path.join(pasta, 'lixo.mp4'))); } catch (e) { erro = e.message; }
  ok(/MP4\/MOV/.test(erro), 'arquivo que não é vídeo: recusa com o motivo — ' + erro);
  fs.writeFileSync(path.join(pasta, 'cortado.mp4'), Buffer.concat([ftyp, mdat]).subarray(0, ftyp.length + 20));
  erro = '';
  try { await V.analisar(await blobDe(path.join(pasta, 'cortado.mp4'))); } catch (e) { erro = e.message; }
  ok(/cortado/.test(erro), 'arquivo cortado no meio: recusa — ' + erro);

  if (!temFfmpeg) { console.log('\n(sem ffmpeg: pulei os vídeos de verdade)'); return fim(); }

  console.log('\nvídeos de verdade (gerados com o ffmpeg)');
  const base = ['-f', 'lavfi', '-i', 'testsrc2=size=1080x1920:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '4',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-shortest'];
  const a = path.join(pasta, 'celular.mp4'); ff([...base, a]);
  const iA = await V.analisar(await blobDe(a)), cA = V.conferir(iA);
  ok(iA.largura === 1080 && iA.altura === 1920 && iA.qps === 30 && iA.video === 'avc1' && iA.audio === 'mp4a' && Math.abs(iA.duracao - 4) < 0.1 && !iA.indiceNoComeco,
    'lê o vídeo em pé, 30 qps, H.264 + AAC, 4 s, com o índice no fim (como sai do celular): ' + JSON.stringify({ l: iA.largura, a: iA.altura, q: iA.qps, d: iA.duracao, v: iA.video, s: iA.audio }));
  ok(!cA.bloqueio.length && !cA.avisos.length && cA.story && /1080 × 1920 · 30 qps · 0:04 · .* MB · H\.264 \+ AAC/.test(cA.resumo), 'dentro das regras: vai sem aviso, e cabe no story — ' + cA.resumo);
  const aOut = await salvar(V.indiceNoComeco(await blobDe(a), iA), path.join(pasta, 'celular-pronto.mp4'));
  ok(await indiceAntes(aOut) && !(await indiceAntes(a)), 'a cópia sai com o índice no começo');
  ok(pacotes(a) === pacotes(aOut) && fs.statSync(a).size === fs.statSync(aOut).size, 'imagem e som idênticos, pacote a pacote, e o mesmo tamanho (nada recomprimido)');
  const pronto = path.join(pasta, 'ja-pronto.mp4'); ff([...base, '-movflags', '+faststart', pronto]);
  const bPronto = await blobDe(pronto), iP = await V.analisar(bPronto);
  ok(iP.indiceNoComeco && V.indiceNoComeco(bPronto, iP) === bPronto, 'já com o índice no começo: vai o próprio arquivo');

  // MOV do iPhone: gravado deitado com a marca de girar 90° (e o índice no fim)
  const deitado = path.join(pasta, 'deitado.mp4');
  ff(['-f', 'lavfi', '-i', 'testsrc2=size=1920x1080:rate=30', '-f', 'lavfi', '-i', 'sine=sample_rate=48000', '-t', '3.5', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', deitado]);
  const mov = path.join(pasta, 'iphone.mov'); ff(['-display_rotation:v:0', '-90', '-i', deitado, '-c', 'copy', '-f', 'mov', mov]);
  const iM2 = await V.analisar(await blobDe(mov));
  const movOut = await salvar(V.indiceNoComeco(await blobDe(mov), iM2, 'video/quicktime'), path.join(pasta, 'iphone-pronto.mov'));
  ok(iM2.largura === 1080 && iM2.altura === 1920 && !iM2.indiceNoComeco && pacotes(mov) === pacotes(movOut) && await indiceAntes(movOut),
    'MOV gravado deitado com a marca de girar: conta como em pé (1080 × 1920), e a cópia fica idêntica com o índice no começo');

  const hevc = path.join(pasta, 'hevc.mp4');
  ff(['-f', 'lavfi', '-i', 'testsrc2=size=1080x1920:rate=30', '-t', '3', '-c:v', 'libx265', '-preset', 'ultrafast', '-x265-params', 'log-level=error', '-tag:v', 'hvc1', '-pix_fmt', 'yuv420p', hevc]);
  const iH = await V.analisar(await blobDe(hevc)), cH = V.conferir(iH);
  ok(iH.video === 'hvc1' && !iH.audio && !cH.bloqueio.length && /HEVC \+ sem som/.test(cH.resumo), 'HEVC (o padrão do iPhone) vale; sem som também — ' + cH.resumo);

  console.log('\no que o Instagram não aceita (ou pode recusar)');
  const k4 = path.join(pasta, '4k.mp4');
  ff(['-f', 'lavfi', '-i', 'color=c=gray:size=3840x2160:rate=30', '-t', '3', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '45', '-pix_fmt', 'yuv420p', k4]);
  const c4 = V.conferir(await V.analisar(await blobDe(k4)));
  ok(!c4.bloqueio.length && c4.avisos.length === 1 && /4K \(3840 × 2160\).*grave em 1080p/.test(c4.avisos[0]), '4K: avisa (pode tentar) e diz como gravar em 1080p');
  const lento = path.join(pasta, 'lento.mp4');
  ff(['-f', 'lavfi', '-i', 'color=c=gray:size=1080x1920:rate=120', '-t', '3', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', lento]);
  const cL = V.conferir(await V.analisar(await blobDe(lento)));
  ok(cL.avisos.some(x => /120 quadros por segundo \(câmera lenta\?\)/.test(x)), 'câmera lenta (120 qps): avisa');
  const curto = path.join(pasta, 'curto.mp4');
  ff(['-f', 'lavfi', '-i', 'color=c=gray:size=1080x1920:rate=30', '-t', '2', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', curto]);
  ok(V.conferir(await V.analisar(await blobDe(curto))).bloqueio.some(x => /pelo menos 3 segundos/.test(x)), 'menos de 3 segundos: não vai');
  const pcm = path.join(pasta, 'pcm.mov');
  ff(['-f', 'lavfi', '-i', 'color=c=gray:size=1080x1920:rate=30', '-f', 'lavfi', '-i', 'sine=sample_rate=48000', '-t', '3', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'pcm_s16le', '-shortest', '-f', 'mov', pcm]);
  ok(V.conferir(await V.analisar(await blobDe(pcm))).avisos.some(x => /som está em PCM.*AAC/.test(x)), 'som que não é AAC: avisa');
  const pequeno = path.join(pasta, '720.mp4');
  ff(['-f', 'lavfi', '-i', 'color=c=gray:size=720x1280:rate=30', '-t', '3', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', pequeno]);
  ok(V.conferir(await V.analisar(await blobDe(pequeno))).avisos.some(x => /720 × 1280, abaixo de Full HD.*Salvar em Arquivos/.test(x)), 'abaixo de Full HD: avisa que o celular pode ter comprimido ao escolher');
  const regras = V.conferir({ tamanho: 320e6, duracao: 95, largura: 1080, altura: 1920, qps: 30, video: 'avc1', audio: 'mp4a', mbps: 26.9 });
  ok(regras.bloqueio.some(x => /até 300 MB, e este vídeo tem 320 MB/.test(x)) && regras.avisos.some(x => /26,9 Mbps/.test(x)) && !regras.story && /60 segundos/.test(regras.motivoStory),
    'mais de 300 MB não vai; taxa acima de 25 Mbps avisa; mais de 60 s não cabe no story');
  ok(V.conferir({ tamanho: 5e6, duracao: 10, largura: 1080, altura: 1920, qps: 30, video: 'apch', audio: 'lpcm', mbps: 4 }).bloqueio.some(x => /H\.264 ou HEVC, e este está em ProRes/.test(x)),
    'ProRes (do iPhone Pro): não vai, e diz por quê');
  fim();
})().catch(e => { console.error(e); process.exit(1); });

function fim() {
  try { fs.rmSync(pasta, { recursive: true, force: true }); } catch (e) { /* tanto faz */ }
  console.log('\n' + (falhas ? falhas + ' FALHA(S)' : 'tudo verde'));
  process.exit(falhas ? 1 : 0);
}
