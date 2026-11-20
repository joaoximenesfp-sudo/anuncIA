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
    { id: 'manha', nome: 'Manhã (6h–11h)', curto: 'Manhã', das: 6, ate: 11 },
    { id: 'almoco', nome: 'Almoço (11h–14h)', curto: 'Almoço', das: 11, ate: 14 },
    { id: 'tarde', nome: 'Tarde (14h–18h)', curto: 'Tarde', das: 14, ate: 18 },
    { id: 'pico', nome: 'Noite / pico (18h–23h)', curto: 'Noite', das: 18, ate: 23 },
    { id: 'madrugada', nome: 'Madrugada (23h–6h)', curto: 'Madrugada', das: 23, ate: 6 },
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
  //   regioes: ["centro"]          (só com o carro dentro da região: ponto + raio, em pacote.regioes)
  function vale(op, data, cidade, local) {
    if (!op) return false;
    if (op.cidades && op.cidades.length && !op.cidades.includes(cidade)) return false;
    if (op.regioes && op.regioes.length) {
      const onde = (local && local.regioes) || [];
      if (!op.regioes.some(r => onde.includes(r))) return false;
    }
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
  // em que vale a primeira opção que bater com horário, dia, cidade e região.
  // Cota com "rodizio": true reveza entre as opções que valem agora, e se alguma for da região
  // em que o carro está, reveza só entre as da região (o anúncio geral fica para fora delas).
  function opcoesDaVez(entrada, data, cidade, local) {
    const validas = (entrada.opcoes || []).filter(op => vale(op, data, cidade, local));
    if (!validas.length || !entrada.rodizio) return validas.slice(0, 1);
    const regionais = validas.filter(op => op.regioes && op.regioes.length);
    return regionais.length ? regionais : validas;
  }
  function escolher(entrada, data, cidade, local, giro) {
    if (!entrada.cota) return vale(entrada, data, cidade, local) ? entrada : null;
    const lista = opcoesDaVez(entrada, data, cidade, local);
    if (!lista.length) return null;
    return lista.length === 1 ? lista[0] : lista[(giro ? giro(entrada.cota) : 0) % lista.length];
  }
  // Regiões em que o ponto está. Três jeitos de desenhar uma região em pacote.regioes:
  //   círculo: { nome, lat, lon, km }
  //   faixa:   { nome, areas: [{ lat, lon, km }, ...] }            (vários círculos, ex.: uma avenida)
  //   setor:   { nome, setor: "campinas", km, pontos: [[lat, lon], ...] }
  // As regiões de um mesmo setor repartem a cidade sem buraco: o carro fica na região do ponto
  // de referência mais perto (desde que a menos de km dele, para não pegar a cidade vizinha).
  function regioesEm(pacote, ponto) {
    if (!ponto || !pacote || !pacote.regioes) return [];
    const dentro = [], setores = {};
    for (const [id, z] of Object.entries(pacote.regioes)) {
      if (z.setor) {
        const g = setores[z.setor] || (setores[z.setor] = { d: Infinity, id: null, km: 0 });
        for (const [la, lo] of z.pontos || []) {
          const d = distanciaM(ponto, { lat: la, lon: lo });
          if (d < g.d) { g.d = d; g.id = id; g.km = z.km || 4; }
        }
        continue;
      }
      if ((z.areas || [z]).some(a => distanciaM(ponto, a) <= (a.km || z.km || 1) * 1000)) dentro.push(id);
    }
    for (const g of Object.values(setores)) if (g.id && g.d <= g.km * 1000) dentro.push(g.id);
    return dentro;
  }

  function segundosDe(item, pacote) {
    const m = pacote.midias[item.midia];
    if (!m) return 0;
    return m.tipo === 'video' ? (m.duracao || 0) : (item.segundos || m.segundos || 10);
  }

  // Próxima entrada depois da posição pos (pula cota vazia e mídia que não existe)
  function proximo(pacote, pos, data, cidade, local, giro) {
    const n = pacote.loop.length;
    for (let k = 1; k <= n; k++) {
      const p = (((pos + k) % n) + n) % n;
      const it = escolher(pacote.loop[p], data, cidade, local, giro);
      if (it && pacote.midias[it.midia]) return { pos: p, item: it };
    }
    return null;
  }

  function duracaoLoop(pacote, data, cidade, local) {
    return pacote.loop.reduce((s, e) => {
      const it = escolher(e, data, cidade, local);
      return s + (it && pacote.midias[it.midia] ? segundosDe(it, pacote) : 0);
    }, 0);
  }

  // Grade do dia: em que horários cada anunciante passa e quantas vezes por hora, numa cidade e
  // num dia (as cotas mudam com horário, dia da semana, cidade e contrato). É o mesmo cálculo que
  // o tablet faz pelo relógio dele: quem liga às 19h já pega a programação das 19h.
  const hhmm = m => `${dois(Math.floor(m / 60))}:${dois(m % 60)}`;
  function programacao(pacote, data, cidade, local) {
    const d0 = new Date(data);
    const cortes = new Set([0]);
    const marca = op => { for (const k of ['das', 'ate']) { const m = minutos(op && op[k]); if (m != null && m < 1440) cortes.add(m); } };
    for (const e of pacote.loop || []) e.cota ? (e.opcoes || []).forEach(marca) : marca(e);
    const lista = [...cortes].sort((a, b) => a - b), faixas = [];
    lista.forEach((das, i) => {
      const t = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate(), 0, das);
      const por = {};
      let dur = 0;
      for (const e of pacote.loop || []) {
        const itens = (e.cota ? opcoesDaVez(e, t, cidade, local) : (vale(e, t, cidade, local) ? [e] : [])).filter(it => pacote.midias[it.midia]);
        for (const it of itens) {
          const m = pacote.midias[it.midia], peso = 1 / itens.length, seg = segundosDe(it, pacote);
          const x = por[m.dono || ''] || (por[m.dono || ''] = { vezes: 0, segundos: 0 });
          x.vezes += peso; x.segundos += seg * peso; dur += seg * peso;
        }
      }
      const fator = dur > 0 ? 3600 / dur : 0;
      const anuncios = Object.entries(por).map(([dono, x]) => ({ dono, vezesHora: x.vezes * fator, segundosHora: x.segundos * fator }))
        .sort((a, b) => b.segundosHora - a.segundosHora);
      const ate = i + 1 < lista.length ? lista[i + 1] : 1440;
      const assinatura = JSON.stringify(anuncios.map(a => [a.dono, Math.round(a.vezesHora * 10)]));
      const ant = faixas[faixas.length - 1];
      if (ant && ant.assinatura === assinatura) ant.ate = ate;
      else faixas.push({ das, ate, duracaoLoop: dur, anuncios, assinatura });
    });
    return faixas.map(f => ({ das: hhmm(f.das), ate: hhmm(f.ate), duracaoLoop: f.duracaoLoop, anuncios: f.anuncios }));
  }

  // ── O QUE PASSOU NA TELA ──
  // ag = { "2026-11-18": { "14": { t: s de tela, v: [janelas por faixa de vibração], e: { midia: [n, s] },
  //        c: s na tomada (carro ligado), b: s de tela rodando na bateria (cabo solto?),
  //        k: toques, d: metros rodados com a tela ligada,
  //        g: { bairro (geohash): [s andando ali, exibições ali] } } } }
  // c, k, d e g só aparecem quando têm algo (tablet antigo não manda e o painel lê igual).
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
  // Carregando = tablet na tomada do carro, ou seja, carro ligado (o cabo fica no carro).
  function anotarCarregando(ag, data, segundos) {
    const h = hora(ag, data); h.c = um((h.c || 0) + segundos);
  }
  // Tela rodando fora da tomada: no carro isso é cabo solto ou carregador fraco
  function anotarBateria(ag, data, segundos) {
    const h = hora(ag, data); h.b = um((h.b || 0) + segundos);
  }
  // Passageiro tocou na tela (fora do canto escondido): mede interesse
  function anotarToque(ag, data) {
    const h = hora(ag, data); h.k = (h.k || 0) + 1;
  }
  function anotarKm(ag, data, metros) {
    const h = hora(ag, data); h.d = Math.round((h.d || 0) + metros);
  }
  // Região aproximada (geohash de 6 letras, uns 1,1 × 0,6 km): segundos rodando ali e exibições
  function anotarRegiao(ag, data, regiao, segundos, exibicoes) {
    const h = hora(ag, data);
    const g = h.g || (h.g = {});
    const r = g[regiao] || (g[regiao] = [0, 0]);
    r[0] = um(r[0] + (segundos || 0)); r[1] += exibicoes || 0;
  }

  // ── REGIÃO APROXIMADA ──
  // Só o bairro, nunca a rua: 6 letras de geohash (uma caixa de uns 1,1 × 0,6 km aqui na
  // região). E só com o carro andando (o player cuida disso), para não marcar onde o
  // motorista mora ou estaciona.
  const PRECISAO_REGIAO = 6;
  const VELOCIDADE_ANDANDO = 2.5; // m/s, uns 9 km/h
  const B32 = '0123456789bcdefghjkmnpqrstuvwxyz';
  function geohash(lat, lon, prec) {
    prec = prec || PRECISAO_REGIAO;
    const la = [-90, 90], lo = [-180, 180];
    let out = '', bit = 0, ch = 0, par = true;
    while (out.length < prec) {
      const r = par ? lo : la, v = par ? lon : lat, meio = (r[0] + r[1]) / 2;
      if (v >= meio) { ch = ch * 2 + 1; r[0] = meio; } else { ch = ch * 2; r[1] = meio; }
      par = !par;
      if (++bit === 5) { out += B32[ch]; bit = 0; ch = 0; }
    }
    return out;
  }
  // A caixa do bairro no mapa: sul, oeste, norte, leste
  function caixaGeohash(gh) {
    const la = [-90, 90], lo = [-180, 180];
    let par = true;
    for (const c of String(gh || '')) {
      const n = B32.indexOf(c);
      if (n < 0) break;
      for (let b = 4; b >= 0; b--) {
        const r = par ? lo : la, meio = (r[0] + r[1]) / 2;
        if ((n >> b) & 1) r[0] = meio; else r[1] = meio;
        par = !par;
      }
    }
    return { s: la[0], o: lo[0], n: la[1], l: lo[1] };
  }
  function centroGeohash(gh) {
    const c = caixaGeohash(gh);
    return { lat: (c.s + c.n) / 2, lon: (c.o + c.l) / 2 };
  }
  function distanciaM(a, b) {
    const R = 6371000, rad = Math.PI / 180;
    const dla = (b.lat - a.lat) * rad, dlo = (b.lon - a.lon) * rad;
    const x = Math.sin(dla / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dlo / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(x));
  }

  function desvio(xs) {
    if (!xs.length) return 0;
    const m = xs.reduce((a, b) => a + b, 0) / xs.length;
    return Math.sqrt(xs.reduce((a, b) => a + (b - m) * (b - m), 0) / xs.length);
  }

  // PIN do menu escondido do tablet: 4 números que saem da chave do carro (o painel mostra).
  // Quem não tem a chave não descobre o PIN, e ele muda junto quando o painel troca a chave.
  function pinMenu(chave) {
    let h = 0x811c9dc5;
    for (const ch of 'menu:' + String(chave || '')) { h ^= ch.charCodeAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
    return String(h % 10000).padStart(4, '0');
  }

  // Página do motorista: o resumo dele fica num documento com id secreto, que sai da chave do
  // carro (sha-256). Trocar a chave no painel troca também o link do motorista.
  async function tokenMotorista(chave) {
    const sutil = (raiz.crypto || require('crypto').webcrypto).subtle;
    const dados = new TextEncoder().encode('motorista:' + String(chave || ''));
    const h = new Uint8Array(await sutil.digest('SHA-256', dados));
    return Array.from(h.slice(0, 16), x => x.toString(16).padStart(2, '0')).join('');
  }
  const linkMotorista = token => `${SITE}/tela/motorista.html#${token}`;

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
  function lerValor(v) {
    if (!v || typeof v !== 'object') return null;
    if ('nullValue' in v) return null;
    if ('booleanValue' in v) return v.booleanValue;
    if ('integerValue' in v) return Number(v.integerValue);
    if ('doubleValue' in v) return Number(v.doubleValue);
    if ('stringValue' in v) return v.stringValue;
    if ('timestampValue' in v) return new Date(v.timestampValue);
    if ('arrayValue' in v) return (v.arrayValue.values || []).map(lerValor);
    if ('mapValue' in v) return lerCampos(v.mapValue.fields || {});
    return null;
  }
  function lerCampos(fields) {
    const o = {};
    for (const [k, v] of Object.entries(fields || {})) o[k] = lerValor(v);
    return o;
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
  // Andando, hora a hora: o que der mais entre o GPS e o sensor de vibração.
  // Tablet sem sensor nenhum conta as horas de tela (e fica marcado).
  // cadastrados: códigos dos carros do painel. Scan de carro fora do cadastro
  // (tablet não pareado = X, ou código inventado no link) não entra em nada.
  function resumoMes({ lotes = [], scans = [], pesoHora = 1, pesoScan = 2, valorBonus = 0, faixaMovimento = FAIXA_MOVIMENTO, cadastrados = null }) {
    const dentro = id => !cadastrados || cadastrados.includes(id);
    const carros = {}, anuncios = {};
    const zeroFaixas = () => Object.fromEntries(FAIXAS_HORARIO.map(f => [f.id, 0]));
    const C = id => carros[id] || (carros[id] = { carro: id, cidade: '', dias: new Set(), tela: 0, mov: 0, janelas: 0, exib: 0, scans: 0,
      ligado: 0, bateria: 0, toques: 0, metros: 0, gps: 0, regioes: new Set(), faixas: zeroFaixas() });
    const regioes = {};
    const R = id => regioes[id] || (regioes[id] = { regiao: id, segundos: 0, exib: 0, carros: new Set(), porCarro: {} });
    const A = id => anuncios[id] || (anuncios[id] = { anuncio: id, exib: 0, segundos: 0, exibQR: 0, scans: 0, metros: 0,
      faixas: zeroFaixas(), cidades: {}, carros: new Set(), regioes: {} });
    for (const l of lotes) {
      if (!dentro(l.carro)) continue;
      const c = C(l.carro);
      if (l.cidade) c.cidade = l.cidade;
      for (const [h, v] of Object.entries(l.horas || {})) {
        const tela = v.t || 0, vib = v.v || [], faixa = faixaDaHora(+h);
        c.tela += tela;
        c.faixas[faixa] += tela;
        if (tela > 0) c.dias.add(l.dia);
        c.janelas += vib.reduce((a, b) => a + b, 0);
        const g = Object.entries(v.g || {});
        const gps = Math.min(tela, g.reduce((a, [, sn]) => a + (sn[0] || 0), 0));
        c.mov += Math.max(gps, Math.min(tela, vib.slice(faixaMovimento).reduce((a, b) => a + b, 0) * JANELA_VIBRACAO));
        c.gps += gps;
        c.ligado += v.c || 0;
        c.bateria += Math.min(tela, v.b || 0);
        c.toques += v.k || 0;
        c.metros += v.d || 0;
        // exibições da hora que caíram em algum bairro (as outras foram com o carro parado)
        const exibHora = Object.values(v.e || {}).reduce((a, ns) => a + (ns[0] || 0), 0);
        const exibBairros = g.reduce((a, [, sn]) => a + (sn[1] || 0), 0);
        for (const [reg, sn] of g) {
          const r = R(reg); r.segundos += sn[0] || 0; r.exib += sn[1] || 0; r.carros.add(l.carro);
          r.porCarro[l.carro] = (r.porCarro[l.carro] || 0) + (sn[0] || 0);
          c.regioes.add(reg);
        }
        const donosDaHora = new Set();
        for (const [midia, ns] of Object.entries(v.e || {})) {
          const n = ns[0] || 0, s = ns[1] || 0;
          c.exib += n;
          const dono = l.dono && l.dono[midia];
          if (dono) {
            const a = A(dono);
            a.exib += n; a.segundos += s; a.faixas[faixa] += n;
            a.cidades[l.cidade || '?'] = (a.cidades[l.cidade || '?'] || 0) + n;
            a.carros.add(l.carro);
            if (n > 0) donosDaHora.add(dono);
            // bairros do anunciante: a parte dele das exibições da hora, espalhada como elas se espalharam
            if (n > 0 && exibHora > 0 && exibBairros > 0) {
              for (const [reg, sn] of g) a.regioes[reg] = (a.regioes[reg] || 0) + n * (sn[1] || 0) / exibHora;
            }
          }
          for (const q of (l.qr && l.qr[midia]) || []) A(q).exibQR += n;
        }
        // km que os carros rodaram nas horas em que o anúncio estava passando
        for (const d of donosDaHora) A(d).metros += v.d || 0;
      }
    }
    // Para o anunciante conta todo scan único (é gente de verdade apontando a câmera, inclusive em
    // tablet ainda sem carro). Para o motorista, só o carro cadastrado: é o que vale bônus.
    const todos = scansValidos(scans);
    let validos = 0, fora = 0;
    for (const s of todos) {
      A(s.anuncio).scans += 1;
      if (dentro(s.carro)) { C(s.carro).scans += 1; validos++; } else fora++;
    }

    const lista = Object.values(carros);
    let total = 0;
    for (const c of lista) {
      c.semSensor = c.tela > 0 && c.janelas === 0 && c.gps === 0;
      c.horasTela = c.tela / 3600;
      c.horasMov = (c.semSensor ? c.tela : c.mov) / 3600;
      c.taxaScans = c.horasTela > 0 ? c.scans / c.horasTela * 10 : 0; // scans a cada 10 h de tela
      c.pontos = pesoHora * c.horasMov + pesoScan * c.scans;
      c.diasAtivos = c.dias.size;
      c.horasLigado = c.ligado / 3600;
      c.horasGPS = c.gps / 3600;
      c.naBateria = c.tela > 0 ? c.bateria / c.tela : 0; // parte da tela que rodou fora da tomada
      c.km = c.metros / 1000;
      c.bairros = c.regioes.size;
      // faixas com pelo menos um quarto das horas de tela: é quando o motorista mais roda
      c.turno = c.tela > 0 ? FAIXAS_HORARIO.filter(f => c.faixas[f.id] >= c.tela * 0.25).map(f => f.id) : [];
      total += c.pontos;
    }
    // divide em centavos e joga o arredondamento no maior, para fechar o valor exato
    const cent = Math.round(valorBonus * 100);
    let soma = 0;
    for (const c of lista) { c.bonus = total > 0 ? Math.floor(cent * c.pontos / total) / 100 : 0; soma += Math.round(c.bonus * 100); }
    const maior = lista.slice().sort((a, b) => b.pontos - a.pontos)[0];
    if (maior && total > 0) maior.bonus = Math.round((maior.bonus * 100) + (cent - soma)) / 100;
    lista.sort((a, b) => b.pontos - a.pontos);
    for (const a of Object.values(anuncios)) {
      a.km = a.metros / 1000;
      a.bairros = Object.entries(a.regioes).map(([regiao, exib]) => ({ regiao, exib })).sort((x, y) => y.exib - x.exib);
    }
    return { carros: lista, anuncios: Object.values(anuncios).sort((a, b) => b.exib - a.exib), totalPontos: total, scansValidos: validos, scansTodos: todos.length, scansBrutos: scans.length,
      foraDoCadastro: fora, regioes: Object.values(regioes).sort((a, b) => b.segundos - a.segundos) };
  }

  // Onde os carros rodam, por região de anúncio: cada área de ~1 km do mês (resumo.regioes) entra
  // na(s) região(ões) do meio dela. Serve para ver, antes de vender um espaço regional, se tem
  // carro rodando lá e se a região depende de um motorista só. Todas as regiões do pacote
  // aparecem, mesmo as que ninguém passou. fora = tempo andando fora de todas elas.
  function horasPorRegiao(resumo, pacote) {
    const regs = (pacote && pacote.regioes) || {};
    const por = {}, porCarro = {};
    for (const [id, z] of Object.entries(regs)) por[id] = { id, nome: z.nome || id, setor: !!z.setor, segundos: 0, exib: 0, carros: {} };
    let total = 0, fora = 0;
    for (const r of (resumo && resumo.regioes) || []) {
      total += r.segundos || 0;
      for (const [c, s] of Object.entries(r.porCarro || {})) porCarro[c] = porCarro[c] || { carro: c, segundos: 0, regioes: {}, fora: 0 }, porCarro[c].segundos += s;
      const ids = regioesEm(pacote, centroGeohash(r.regiao)).filter(id => por[id]);
      if (!ids.length) {
        fora += r.segundos || 0;
        for (const [c, s] of Object.entries(r.porCarro || {})) porCarro[c].fora += s;
      }
      for (const id of ids) {
        const o = por[id];
        o.segundos += r.segundos || 0; o.exib += r.exib || 0;
        for (const [c, s] of Object.entries(r.porCarro || {})) {
          o.carros[c] = (o.carros[c] || 0) + s;
          porCarro[c].regioes[id] = (porCarro[c].regioes[id] || 0) + s;
        }
      }
    }
    // regiões grandes primeiro (as que repartem a cidade), depois as menores; cada grupo da mais rodada para a menos
    const regioes = Object.values(por).sort((a, b) => (b.setor - a.setor) || (b.segundos - a.segundos));
    return { regioes, carros: Object.values(porCarro).sort((a, b) => b.segundos - a.segundos), total, fora };
  }

  // Horas andando de uma hora do lote: o que der mais entre o GPS e a vibração (como no resumo)
  function movDaHora(v, faixaMovimento) {
    const tela = v.t || 0, vib = v.v || [];
    const gps = Math.min(tela, Object.values(v.g || {}).reduce((a, sn) => a + (sn[0] || 0), 0));
    return Math.max(gps, Math.min(tela, vib.slice(faixaMovimento).reduce((a, b) => a + b, 0) * JANELA_VIBRACAO));
  }

  // O que vai para a página do motorista: só os números dele, a posição no ranking (sem nomes)
  // e a parte dele no bônus. Nada dos outros carros nem dos anunciantes.
  function resumoMotorista({ resumo, carro, lotes = [], scans = [], pesoHora = 1, pesoScan = 2, faixaMovimento = FAIXA_MOVIMENTO }) {
    const c = resumo.carros.find(x => x.carro === carro);
    if (!c) return null;
    const ranking = resumo.carros.filter(x => x.pontos > 0).sort((a, b) => b.pontos - a.pontos);
    const dec = (x, n = 1) => Math.round(x * 10 ** n) / 10 ** n;
    const porDia = {};
    const D = dia => porDia[dia] || (porDia[dia] = [0, 0, 0]);
    for (const l of lotes) {
      if (l.carro !== carro) continue;
      for (const v of Object.values(l.horas || {})) {
        if (!(v.t > 0)) continue;
        const d = D(l.dia); d[0] += movDaHora(v, faixaMovimento) / 3600; d[1] += (v.d || 0) / 1000;
      }
    }
    for (const s of scansValidos(scans)) if (s.carro === carro) D(s.dia)[2] += 1;
    for (const d of Object.values(porDia)) { d[0] = dec(d[0]); d[1] = dec(d[1]); }
    return {
      dias: c.diasAtivos, horasTela: dec(c.horasTela), horasMov: dec(c.horasMov), horasGPS: dec(c.horasGPS), km: dec(c.km),
      scans: c.scans, toques: c.toques, naBateria: dec(c.naBateria, 3), bairros: c.bairros, turno: c.turno, exib: c.exib,
      semSensor: c.semSensor, pontos: dec(c.pontos), posicao: c.pontos > 0 ? ranking.indexOf(c) + 1 : 0, total: ranking.length,
      bonus: c.bonus || 0, pesoHora, pesoScan, porDia,
    };
  }

  function diasSemSinal(visto, agora) {
    if (!visto) return Infinity;
    return Math.floor((agora - visto) / 86400000);
  }

  const API = {
    PROJETO, CHAVE_API, SITE, JANELA_VIBRACAO, FAIXAS_VIBRACAO, FAIXA_MOVIMENTO, FAIXAS_HORARIO, LIMITE_SCANS_HORA,
    partesData, faixaDaHora, slug, vale, escolher, opcoesDaVez, regioesEm, segundosDe, proximo, duracaoLoop, programacao,
    anotarExibicao, anotarTela, anotarVibracao, anotarCarregando, anotarBateria, anotarToque, anotarKm, anotarRegiao, desvio, lotes, novoId, novaChave,
    PRECISAO_REGIAO, VELOCIDADE_ANDANDO, geohash, caixaGeohash, centroGeohash, distanciaM,
    valor, campos, lerValor, lerCampos, urlCriar, urlDoc, linkQR, linkPareamento, lerPareamento, pinMenu,
    tokenMotorista, linkMotorista, scansValidos, resumoMes, resumoMotorista, horasPorRegiao, movDaHora, diasSemSinal,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else raiz.TelaNucleo = API;
})(typeof self !== 'undefined' ? self : this);
