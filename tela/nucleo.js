// Núcleo da rede de telas nos carros: as regras que o player (tela/index.html)
// e o painel (tela/painel.html) usam, sem nada de tela. Roda no navegador
// (window.TelaNucleo) e no Node (require), que é como os testes conferem.
(function (raiz) {
  'use strict';

  const PROJETO = 'anuncia-70b88';
  // Pública: é a mesma configuração web do index.html. Quem decide o que pode
  // gravar é o firestore.rules (o tablet só grava com a chave do carro).
  const CHAVE_API = 'AIzaSyDmC5BxL2_qf7YT9Yq9gUIhpRBn0RoRa2A';
  const SITE = 'https://anunc-ia.vercel.app';
  const BASE_FS = `https://firestore.googleapis.com/v1/projects/${PROJETO}/databases/(default)/documents`;

  // Vibração: desvio da aceleração (m/s²) numa janela de 10 s. Mesa ≈ 0,01;
  // carro andando costuma passar de 0,1. As faixas ficam guardadas por hora,
  // então dá para recalibrar o "em movimento" depois sem mexer nos tablets.
  const JANELA_VIBRACAO = 10;
  const FAIXAS_VIBRACAO = [0.05, 0.1, 0.2, 0.4];
  const FAIXA_MOVIMENTO = 2; // a partir de 0,1 m/s² conta como carro andando

  // Um passageiro conta uma vez por anúncio, carro e dia; e um carro não ganha
  // mais que isto de scans numa hora (corta quem escanear o próprio QR).
  const LIMITE_SCANS_HORA = 6;

  // Faixas de horário do relatório do anunciante
  const FAIXAS_HORARIO = [
    { id: 'manha', nome: 'Manhã (6h–11h)', das: 6, ate: 11 },
    { id: 'almoco', nome: 'Almoço (11h–14h)', das: 11, ate: 14 },
    { id: 'tarde', nome: 'Tarde (14h–18h)', das: 14, ate: 18 },
    { id: 'pico', nome: 'Noite / pico (18h–23h)', das: 18, ate: 23 },
    { id: 'madrugada', nome: 'Madrugada (23h–6h)', das: 23, ate: 6 },
  ];

  const dois = n => String(n).padStart(2, '0');
  function partesData(d) {
    const dia = `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`;
    return { dia, mes: dia.slice(0, 7), hora: d.getHours() };
  }
  function minutos(hhmm) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || '');
    return m ? (+m[1]) * 60 + (+m[2]) : null;
  }
  function faixaDaHora(h) {
    return FAIXAS_HORARIO.find(f => f.das < f.ate ? (h >= f.das && h < f.ate) : (h >= f.das || h < f.ate)).id;
  }
  function slug(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  }

  // ── O QUE TOCA AGORA ──
  // Uma opção vale neste momento? Filtros opcionais:
  //   cidades: ["campinas"]        dias: [0..6] (0 = domingo)
  //   das/ate: "18:00"/"23:00"     (pode virar a noite: "21:00"/"02:00")
  //   periodo: {inicio:"2026-12-01", fim:"2026-12-31"}  (contrato do anunciante)
  function vale(op, data, cidade) {
    if (!op) return false;
    if (op.cidades && op.cidades.length && !op.cidades.includes(cidade)) return false;
    const { dia } = partesData(data);
    if (op.periodo) {
      if (op.periodo.inicio && dia < op.periodo.inicio) return false;
      if (op.periodo.fim && dia > op.periodo.fim) return false;
    }
    let semana = data.getDay();
    const das = minutos(op.das), ate = minutos(op.ate);
    if (das != null && ate != null && das !== ate) {
      const agora = data.getHours() * 60 + data.getMinutes();
      if (das < ate) {
        if (agora < das || agora >= ate) return false;
      } else {
        if (agora >= ate && agora < das) return false;
        // depois da meia-noite ainda é a noite do dia em que a faixa começou
        if (agora < ate) semana = (semana + 6) % 7;
      }
    }
    if (op.dias && op.dias.length && !op.dias.includes(semana)) return false;
    return true;
  }

  // Entrada do loop: mídia fixa {midia, segundos} ou cota {cota, opcoes:[...]},
  // em que vale a primeira opção que bater com horário, dia e cidade.
  function escolher(entrada, data, cidade) {
    if (entrada.cota) return (entrada.opcoes || []).find(op => vale(op, data, cidade)) || null;
    return vale(entrada, data, cidade) ? entrada : null;
  }

  function segundosDe(item, pacote) {
    const m = pacote.midias[item.midia];
    if (!m) return 0;
    return m.tipo === 'video' ? (m.duracao || 0) : (item.segundos || m.segundos || 10);
  }

  // Próxima entrada depois da posição pos (pula cota vazia e mídia que não existe)
  function proximo(pacote, pos, data, cidade) {
    const n = pacote.loop.length;
    for (let k = 1; k <= n; k++) {
      const p = (((pos + k) % n) + n) % n;
      const it = escolher(pacote.loop[p], data, cidade);
      if (it && pacote.midias[it.midia]) return { pos: p, item: it };
    }
    return null;
  }

  function duracaoLoop(pacote, data, cidade) {
    return pacote.loop.reduce((s, e) => {
      const it = escolher(e, data, cidade);
      return s + (it && pacote.midias[it.midia] ? segundosDe(it, pacote) : 0);
    }, 0);
  }

  // ── O QUE PASSOU NA TELA ──
  // ag = { "2026-11-18": { "14": { t: s de tela, v: [janelas por faixa de vibração], e: { midia: [n, s] } } } }
  function hora(ag, data) {
    const { dia, hora: h } = partesData(data);
    const d = ag[dia] || (ag[dia] = {});
    return d[h] || (d[h] = { t: 0, v: [0, 0, 0, 0, 0], e: {} });
  }
  const um = x => Math.round(x * 10) / 10;
  function anotarExibicao(ag, data, midia, segundos) {
    const h = hora(ag, data);
    const e = h.e[midia] || (h.e[midia] = [0, 0]);
    e[0] += 1; e[1] = um(e[1] + segundos);
  }
  function anotarTela(ag, data, segundos) {
    const h = hora(ag, data); h.t = um(h.t + segundos);
  }
  function anotarVibracao(ag, data, desvioPadrao) {
    const h = hora(ag, data);
    let f = 0;
    while (f < FAIXAS_VIBRACAO.length && desvioPadrao >= FAIXAS_VIBRACAO[f]) f++;
    h.v[f] += 1;
  }
  function desvio(xs) {
    if (!xs.length) return 0;
    const m = xs.reduce((a, b) => a + b, 0) / xs.length;
    return Math.sqrt(xs.reduce((a, b) => a + (b - m) * (b - m), 0) / xs.length);
  }

  function novoId() {
    const b = new Uint8Array(12);
    (raiz.crypto || require('crypto').webcrypto).getRandomValues(b);
    return Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
  }
  function novaChave() { return novoId() + novoId().slice(0, 8); }

  // Um lote por dia, pronto para o Firestore. Leva junto de quem é cada mídia
  // (dono = anunciante que paga a exibição; qr = anúncios com QR na arte), para
  // o relatório continuar certo mesmo depois que o pacote mudar.
  function lotes(ag, base, pacote) {
    return Object.keys(ag).sort().map(dia => {
      const dono = {}, qr = {};
      for (const h of Object.values(ag[dia])) for (const id of Object.keys(h.e)) {
        const m = pacote && pacote.midias[id];
        if (m && m.dono) dono[id] = m.dono;
        if (m && m.qr && m.qr.length) qr[id] = [...new Set(m.qr.map(q => q.anuncio))];
      }
      return { id: novoId(), carro: base.carro, chave: base.chave, cidade: base.cidade || '', dia, mes: dia.slice(0, 7),
        pacote: base.pacote || '', app: base.app || '', horas: ag[dia], dono, qr, criado: new Date() };
    });
  }

  // ── FIRESTORE PELA API REST (o tablet não carrega o SDK) ──
  function valor(v) {
    if (v === null || v === undefined) return { nullValue: null };
    if (v instanceof Date) return { timestampValue: v.toISOString() };
    if (Array.isArray(v)) return { arrayValue: { values: v.map(valor) } };
    switch (typeof v) {
      case 'boolean': return { booleanValue: v };
      case 'number': return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
      case 'string': return { stringValue: v };
      case 'object': return { mapValue: { fields: campos(v) } };
    }
    return { stringValue: String(v) };
  }
  function campos(obj) {
    const f = {};
    for (const [k, v] of Object.entries(obj)) if (v !== undefined) f[k] = valor(v);
    return f;
  }
  const urlCriar = (colecao, id) => `${BASE_FS}/${colecao}?documentId=${encodeURIComponent(id)}&key=${CHAVE_API}`;
  const urlDoc = (colecao, id) => `${BASE_FS}/${colecao}/${encodeURIComponent(id)}?key=${CHAVE_API}`;

  // ── LINKS ──
  const linkQR = (anuncio, carro) => `${SITE}/q/${anuncio}/${carro || 'X'}`;
  const linkPareamento = (carro, chave, cidade) => `${SITE}/tela/#parear=${carro}.${chave}.${cidade || ''}`;
  function lerPareamento(hash) {
    const m = /parear=([A-Za-z0-9-]{1,16})\.([A-Za-z0-9]{8,64})(?:\.([a-z0-9-]{0,40}))?/.exec(hash || '');
    return m ? { carro: m[1].toUpperCase(), chave: m[2], cidade: m[3] || '' } : null;
  }

  // ── PAINEL: EFICIÊNCIA E BÔNUS ──
  function scansValidos(scans) {
    const vistos = new Set(), porHora = {}, ok = [];
    for (const s of scans.slice().sort((a, b) => a.em - b.em)) {
      const k = `${s.h}|${s.anuncio}|${s.carro}|${s.dia}`;
      if (vistos.has(k)) continue;
      vistos.add(k);
      const kh = `${s.carro}|${s.dia}|${s.hora}`;
      porHora[kh] = (porHora[kh] || 0) + 1;
      if (porHora[kh] > LIMITE_SCANS_HORA) continue;
      ok.push(s);
    }
    return ok;
  }

  // Junta o mês. Pontos do motorista = pesoHora × horas com o carro andando e a
  // tela ligada + pesoScan × scans. O bônus do mês é dividido pelos pontos.
  // Tablet sem sensor de movimento conta as horas de tela (e fica marcado).
  // cadastrados: códigos dos carros do painel. Scan de carro fora do cadastro
  // (tablet não pareado = X, ou código inventado no link) não entra em nada.
  function resumoMes({ lotes = [], scans = [], pesoHora = 1, pesoScan = 2, valorBonus = 0, faixaMovimento = FAIXA_MOVIMENTO, cadastrados = null }) {
    const dentro = id => !cadastrados || cadastrados.includes(id);
    const carros = {}, anuncios = {};
    const C = id => carros[id] || (carros[id] = { carro: id, cidade: '', dias: new Set(), tela: 0, mov: 0, janelas: 0, exib: 0, scans: 0 });
    const A = id => anuncios[id] || (anuncios[id] = { anuncio: id, exib: 0, segundos: 0, exibQR: 0, scans: 0,
      faixas: Object.fromEntries(FAIXAS_HORARIO.map(f => [f.id, 0])), cidades: {}, carros: new Set() });
    for (const l of lotes) {
      if (!dentro(l.carro)) continue;
      const c = C(l.carro);
      if (l.cidade) c.cidade = l.cidade;
      for (const [h, v] of Object.entries(l.horas || {})) {
        const tela = v.t || 0, vib = v.v || [];
        c.tela += tela;
        if (tela > 0) c.dias.add(l.dia);
        c.janelas += vib.reduce((a, b) => a + b, 0);
        c.mov += Math.min(tela, vib.slice(faixaMovimento).reduce((a, b) => a + b, 0) * JANELA_VIBRACAO);
        for (const [midia, ns] of Object.entries(v.e || {})) {
          const n = ns[0] || 0, s = ns[1] || 0;
          c.exib += n;
          const dono = l.dono && l.dono[midia];
          if (dono) {
            const a = A(dono);
            a.exib += n; a.segundos += s; a.faixas[faixaDaHora(+h)] += n;
            a.cidades[l.cidade || '?'] = (a.cidades[l.cidade || '?'] || 0) + n;
            a.carros.add(l.carro);
          }
          for (const q of (l.qr && l.qr[midia]) || []) A(q).exibQR += n;
        }
      }
    }
    const validos = scansValidos(scans.filter(s => dentro(s.carro)));
    for (const s of validos) { C(s.carro).scans += 1; A(s.anuncio).scans += 1; }

    const lista = Object.values(carros);
    let total = 0;
    for (const c of lista) {
      c.semSensor = c.tela > 0 && c.janelas === 0;
      c.horasTela = c.tela / 3600;
      c.horasMov = (c.semSensor ? c.tela : c.mov) / 3600;
      c.taxaScans = c.horasTela > 0 ? c.scans / c.horasTela * 10 : 0; // scans a cada 10 h de tela
      c.pontos = pesoHora * c.horasMov + pesoScan * c.scans;
      c.diasAtivos = c.dias.size;
      total += c.pontos;
    }
    // divide em centavos e joga o arredondamento no maior, para fechar o valor exato
    const cent = Math.round(valorBonus * 100);
    let soma = 0;
    for (const c of lista) { c.bonus = total > 0 ? Math.floor(cent * c.pontos / total) / 100 : 0; soma += Math.round(c.bonus * 100); }
    const maior = lista.slice().sort((a, b) => b.pontos - a.pontos)[0];
    if (maior && total > 0) maior.bonus = Math.round((maior.bonus * 100) + (cent - soma)) / 100;
    lista.sort((a, b) => b.pontos - a.pontos);
    return { carros: lista, anuncios: Object.values(anuncios).sort((a, b) => b.exib - a.exib), totalPontos: total, scansValidos: validos.length, scansBrutos: scans.length,
      foraDoCadastro: scans.filter(s => !dentro(s.carro)).length };
  }

  function diasSemSinal(visto, agora) {
    if (!visto) return Infinity;
    return Math.floor((agora - visto) / 86400000);
  }

  const API = {
    PROJETO, CHAVE_API, SITE, JANELA_VIBRACAO, FAIXAS_VIBRACAO, FAIXA_MOVIMENTO, FAIXAS_HORARIO, LIMITE_SCANS_HORA,
    partesData, faixaDaHora, slug, vale, escolher, segundosDe, proximo, duracaoLoop,
    anotarExibicao, anotarTela, anotarVibracao, desvio, lotes, novoId, novaChave,
    valor, campos, urlCriar, urlDoc, linkQR, linkPareamento, lerPareamento,
    scansValidos, resumoMes, diasSemSinal,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else raiz.TelaNucleo = API;
})(typeof self !== 'undefined' ? self : this);
