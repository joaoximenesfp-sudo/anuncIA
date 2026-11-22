// Vídeo do celular para o Instagram, do jeito que saiu da câmera. Lê o MP4/MOV sem
// decodificar nada (só o índice, a caixa "moov"), confere as regras do Instagram e, se o
// índice estiver no fim do arquivo (o normal no iPhone e no Android), põe no começo, como
// o Instagram pede. Isso só muda a ordem das caixas e os endereços dentro do índice: nenhum
// bit da imagem ou do som muda (o teste confere quadro a quadro com o ffmpeg).
// Roda no navegador (window.VideoMp4) e no Node (require), que é como os testes conferem.
(function (raiz) {
  'use strict';

  // Regras do Instagram (Reels e story pela API da Meta)
  const REELS_MAX_BYTES = 300 * 1000 * 1000;
  const STORY_MAX_BYTES = 100 * 1000 * 1000;
  const REELS_MIN_S = 3, REELS_MAX_S = 15 * 60, STORY_MAX_S = 60;
  const LADO_MAX = 1920;          // até 1080p (1920 px no lado maior)
  const MBPS_MAX = 25.5;          // 25 Mbps de vídeo + o som
  const QPS_MIN = 23, QPS_MAX = 60;

  const CODEC_VIDEO = { avc1: 'H.264', avc3: 'H.264', hvc1: 'HEVC', hev1: 'HEVC' };
  const CODEC_AUDIO = { mp4a: 'AAC' };
  const NOME_CODEC = { ...CODEC_VIDEO, ...CODEC_AUDIO, av01: 'AV1', vp09: 'VP9', apch: 'ProRes', apcn: 'ProRes', apcs: 'ProRes', apco: 'ProRes',
    ap4h: 'ProRes', ap4x: 'ProRes', lpcm: 'PCM', sowt: 'PCM', twos: 'PCM', alac: 'ALAC', ac_3: 'AC-3', 'ac-3': 'AC-3', 'ec-3': 'E-AC-3', Opus: 'Opus' };
  // caixas que só guardam outras caixas (as que interessam para achar o índice)
  const CONTEINER = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl', 'edts', 'dinf', 'mvex']);

  const tipoDe = (b, p) => String.fromCharCode(b[p], b[p + 1], b[p + 2], b[p + 3]);
  async function bytes(arq, ini, fim) { return new Uint8Array(await arq.slice(ini, fim).arrayBuffer()); }

  // As caixas do primeiro nível do arquivo (só os cabeçalhos são lidos).
  async function caixasDoArquivo(arq) {
    const total = arq.size, lista = [];
    let pos = 0;
    while (pos + 8 <= total) {
      const h = await bytes(arq, pos, Math.min(pos + 16, total));
      const dv = new DataView(h.buffer, h.byteOffset, h.byteLength);
      const tipo = tipoDe(h, 4);
      let tam = dv.getUint32(0), cab = 8;
      if (tam === 1) { if (h.length < 16) break; tam = Number(dv.getBigUint64(8)); cab = 16; }
      else if (tam === 0) tam = total - pos;
      if (!/^[\x20-\x7e]{4}$/.test(tipo) || tam < cab || pos + tam > total) {
        if (lista.some(c => c.tipo === 'moov') && lista.some(c => c.tipo === 'mdat')) break; // sobra no fim
        throw new Error('o arquivo parece cortado ou não é um vídeo MP4/MOV');
      }
      lista.push({ tipo, ini: pos, tam, cab });
      pos += tam;
    }
    return { lista, fim: pos };
  }

  // As caixas dentro de [ini, fim) de um pedaço já lido.
  function filhos(b, dv, ini, fim) {
    const l = [];
    let p = ini;
    while (p + 8 <= fim) {
      let tam = dv.getUint32(p), cab = 8;
      const tipo = tipoDe(b, p + 4);
      if (tam === 1) { if (p + 16 > fim) break; tam = Number(dv.getBigUint64(p + 8)); cab = 16; }
      else if (tam === 0) tam = fim - p;
      if (tam < cab || p + tam > fim) break;
      l.push({ tipo, ini: p, tam, cab });
      p += tam;
    }
    return l;
  }

  // Lê o vídeo: tamanho, duração, resolução, quadros por segundo, codecs e onde está o índice.
  async function analisar(arq) {
    if (!arq || !(arq.size > 0)) throw new Error('arquivo vazio');
    const { lista, fim } = await caixasDoArquivo(arq);
    const moov = lista.find(c => c.tipo === 'moov'), mdat = lista.find(c => c.tipo === 'mdat');
    if (!moov || !mdat) throw new Error('não é um vídeo MP4/MOV que eu consiga ler');
    if (moov.tam > 80 * 1024 * 1024) throw new Error('o índice do vídeo é grande demais');
    const b = await bytes(arq, moov.ini, moov.ini + moov.tam);
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    const trilhas = [], offsets = [];
    let duracao = 0;
    const tempo = c => { // mvhd/mdhd: escala e duração (versão 0 ou 1)
      const p = c.ini + c.cab, v = b[p];
      return v === 1 ? { escala: dv.getUint32(p + 20), dur: Number(dv.getBigUint64(p + 24)) } : { escala: dv.getUint32(p + 12), dur: dv.getUint32(p + 16) };
    };
    const andar = (ini, fimC, t) => {
      for (const c of filhos(b, dv, ini, fimC)) {
        const p = c.ini + c.cab;
        if (c.tipo === 'mvhd') { const x = tempo(c); duracao = x.escala ? x.dur / x.escala : 0; }
        else if (c.tipo === 'trak') { const nova = { tipo: '', codec: '', largura: 0, altura: 0, escala: 0, dur: 0, amostras: 0, giro: 0 }; trilhas.push(nova); andar(p, c.ini + c.tam, nova); }
        else if (c.tipo === 'tkhd' && t) {
          const m = p + 4 + (b[p] === 1 ? 32 : 20) + 16; // a matriz: depois dos tempos e de camada/volume
          const a = dv.getInt32(m), bb = dv.getInt32(m + 4);
          t.giro = a === 0 && bb > 0 ? 90 : a === 0 && bb < 0 ? 270 : a < 0 ? 180 : 0;
        }
        else if (c.tipo === 'mdhd' && t) { const x = tempo(c); t.escala = x.escala; t.dur = x.dur; }
        // no MOV há um segundo hdlr dentro de minf (o da referência dos dados): vale o primeiro
        else if (c.tipo === 'hdlr' && t && !t.tipo) t.tipo = tipoDe(b, p + 8);
        else if (c.tipo === 'stsd' && t && dv.getUint32(p + 4) > 0) {
          const e = p + 8;
          t.codec = tipoDe(b, e + 4).trim();
          if (t.tipo === 'vide' && e + 36 <= c.ini + c.tam) { t.largura = dv.getUint16(e + 32); t.altura = dv.getUint16(e + 34); }
        }
        else if (c.tipo === 'stts' && t) { const n = dv.getUint32(p + 4); for (let i = 0; i < n && p + 16 + i * 8 <= c.ini + c.tam; i++) t.amostras += dv.getUint32(p + 8 + i * 8); }
        else if (c.tipo === 'stco' || c.tipo === 'co64') {
          const n = dv.getUint32(p + 4), passo = c.tipo === 'co64' ? 8 : 4;
          for (let i = 0; i < n && p + 8 + (i + 1) * passo <= c.ini + c.tam; i++) offsets.push({ pos: p + 8 + i * passo, bits: passo * 8 });
        }
        else if (CONTEINER.has(c.tipo)) andar(p, c.ini + c.tam, t);
      }
    };
    andar(moov.cab, b.length, null);
    const vid = trilhas.find(t => t.tipo === 'vide'), aud = trilhas.find(t => t.tipo === 'soun');
    if (vid && !duracao && vid.escala) duracao = vid.dur / vid.escala;
    const segV = vid && vid.escala ? vid.dur / vid.escala : 0;
    const deitado = vid && (vid.giro === 90 || vid.giro === 270);
    return {
      tamanho: arq.size, duracao,
      largura: vid ? (deitado ? vid.altura : vid.largura) : 0, altura: vid ? (deitado ? vid.largura : vid.altura) : 0,
      qps: vid && segV > 0 ? Math.round(vid.amostras / segV * 100) / 100 : 0,
      video: vid ? vid.codec : '', audio: aud ? aud.codec : '',
      mbps: duracao > 0 ? Math.round(arq.size * 8 / duracao / 1e4) / 100 : 0,
      indiceNoComeco: moov.ini < mdat.ini,
      _int: { lista, fim, moov, mdatIni: mdat.ini, b, offsets },
    };
  }

  // Põe o índice antes dos dados (o "faststart"), sem tocar no conteúdo. Devolve o próprio
  // arquivo quando ele já está assim.
  function indiceNoComeco(arq, info, tipo) {
    if (info.indiceNoComeco) return arq;
    const { lista, fim, moov, mdatIni, b, offsets } = info._int;
    const novo = b.slice(), dv = new DataView(novo.buffer);
    // o que está entre o começo dos dados e o índice antigo anda o tamanho do índice
    const anda = o => o + (o >= mdatIni ? moov.tam : 0) - (o >= moov.ini + moov.tam ? moov.tam : 0);
    for (const { pos, bits } of offsets) {
      if (bits === 32) {
        const n = anda(dv.getUint32(pos));
        if (n > 0xFFFFFFFF) throw new Error('vídeo grande demais para arrumar o índice');
        dv.setUint32(pos, n);
      } else dv.setBigUint64(pos, BigInt(anda(Number(dv.getBigUint64(pos)))));
    }
    const partes = [];
    for (const c of lista) {
      if (c === moov) continue;
      if (c.ini === mdatIni) partes.push(novo);
      partes.push(arq.slice(c.ini, c.ini + c.tam));
    }
    if (fim < arq.size) partes.push(arq.slice(fim));
    return new Blob(partes, { type: tipo || arq.type || 'video/mp4' });
  }

  const nomeCodec = c => NOME_CODEC[c] || (c ? c.toUpperCase() : '?');
  const mb = n => n < 1e6 ? Math.max(1, Math.round(n / 1e3)) + ' KB' : (n / 1e6 >= 100 ? Math.round(n / 1e6) : Math.round(n / 1e5) / 10).toLocaleString('pt-BR') + ' MB';
  const tempoTxt = s => { s = Math.round(s); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

  // O que o Instagram aceita. "bloqueio" não vai (ele recusa); "avisos" pode tentar.
  function conferir(info) {
    const bloqueio = [], avisos = [];
    const lado = Math.max(info.largura, info.altura);
    if (!info.video) bloqueio.push('Não achei a imagem neste arquivo (só som?).');
    else if (!CODEC_VIDEO[info.video]) bloqueio.push(`O Instagram só aceita vídeo em H.264 ou HEVC, e este está em ${nomeCodec(info.video)}. No celular, grave pela câmera normal (no iPhone: Ajustes › Câmera › Formatos).`);
    if (info.tamanho > REELS_MAX_BYTES) bloqueio.push(`O Instagram aceita até 300 MB, e este vídeo tem ${mb(info.tamanho)}. Corte o vídeo ou grave em 1080p.`);
    if (info.duracao && info.duracao < REELS_MIN_S) bloqueio.push('O vídeo precisa ter pelo menos 3 segundos.');
    if (info.duracao > REELS_MAX_S) bloqueio.push(`O Reels vai até 15 minutos, e este tem ${tempoTxt(info.duracao)}.`);
    if (lado > LADO_MAX) avisos.push(`Este vídeo é ${lado >= 3840 ? '4K' : 'maior que Full HD'} (${info.largura} × ${info.altura}). O Instagram mostra no máximo 1080p e, pela API, pode recusar acima disso. Para ir com a melhor qualidade que ele aceita, grave em 1080p (iPhone: Ajustes › Câmera › Gravar Vídeo › 1080p; Android: na câmera, ⚙ › Tamanho do vídeo › FHD).`);
    if (info.qps && (info.qps < QPS_MIN - 0.5 || info.qps > QPS_MAX + 0.5)) avisos.push(`Está a ${Math.round(info.qps)} quadros por segundo${info.qps > QPS_MAX ? ' (câmera lenta?)' : ''}; o Instagram aceita de 23 a 60.`);
    if (info.mbps > MBPS_MAX) avisos.push(`A taxa do vídeo é de ${info.mbps.toLocaleString('pt-BR')} Mbps, e o Instagram aceita até 25. Gravar em 1080p a 30 quadros resolve.`);
    if (info.audio && !CODEC_AUDIO[info.audio]) avisos.push(`O som está em ${nomeCodec(info.audio)}, e o Instagram pede AAC: ele pode recusar.`);
    if (lado && Math.min(info.largura, info.altura) < 1080 && !bloqueio.length) avisos.push(`Este vídeo está em ${info.largura} × ${info.altura}, abaixo de Full HD. Se o original é Full HD, o celular pode ter comprimido ao escolher: no iPhone, use "Salvar em Arquivos" e escolha por "Escolher Arquivo".`);
    const story = info.duracao <= STORY_MAX_S && info.tamanho <= STORY_MAX_BYTES;
    const motivoStory = story ? '' : info.duracao > STORY_MAX_S ? 'o story aceita até 60 segundos' : 'o story aceita até 100 MB';
    const resumo = [info.largura && info.altura ? `${info.largura} × ${info.altura}` : '', info.qps ? `${Math.round(info.qps)} qps` : '',
      info.duracao ? tempoTxt(info.duracao) : '', mb(info.tamanho),
      [info.video ? nomeCodec(info.video) : '', info.audio ? nomeCodec(info.audio) : 'sem som'].filter(Boolean).join(' + ')].filter(Boolean).join(' · ');
    return { bloqueio, avisos, story, motivoStory, resumo };
  }

  const API = { analisar, conferir, indiceNoComeco, caixasDoArquivo, REELS_MAX_BYTES, STORY_MAX_BYTES };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else raiz.VideoMp4 = API;
})(typeof self !== 'undefined' ? self : this);
