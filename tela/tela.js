// Player da rede de telas nos carros.
// Baixa o pacote quando tem internet (de preferência no Wi-Fi de casa), toca em
// loop sem internet, põe o QR do carro por cima do QR da arte e anota o que
// passou na tela: exibições, horas de tela, vibração (carro andando), tempo na
// tomada (carro ligado), toques na tela e, se o motorista deixar, o bairro
// aproximado e os km rodados. O painel (painel.html) junta isso por carro e por anunciante.
(function () {
  'use strict';
  const N = window.TelaNucleo;
  const APP = '2026-11-20.4';
  const CACHE_MIDIA = 'tela-midia';
  const FADE = 250;
  const MIN = 60000;
  const $ = id => document.getElementById(id);
  const ler = (k, padrao) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : padrao; } catch (e) { return padrao; } };
  const gravar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sem espaço: segue sem guardar */ } };
  const espera = ms => new Promise(r => setTimeout(r, ms));

  const estado = {
    carro: ler('tela.carro', null),   // {carro, chave, cidade}
    pacote: ler('tela.pacote', null), // pacote ativo: só vira ativo depois de tudo baixado
    ag: ler('tela.ag', {}),           // o que passou e ainda não virou lote
    fila: ler('tela.fila', []),       // lotes esperando internet
    sinc: ler('tela.sinc', {}),
    pos: -1, tocando: null, timer: 0, urls: new Map(), qrEls: [],
    baixando: false, enviando: false, ultimoEnvio: ler('tela.ultimoEnvio', 0), erroEnvio: null,
  };
  window.TelaEstado = estado; // para conferir pelo console / testes

  const quadro = $('quadro'), img = $('img'), vid = $('vid'), qrs = $('qrs');
  const carroCod = () => (estado.carro && estado.carro.carro) || 'X';
  const cidade = () => (estado.carro && estado.carro.cidade) || '';
  const versao = () => (estado.pacote && estado.pacote.versao) || '';
  const urlMidia = m => m.arquivo + '?v=' + m.hash;

  // ── PAREAMENTO: o painel gera .../tela/#parear=C07.chave.cidade ──
  // Dentro do app Android "Tela do carro" existe window.TelaAndroid (trava de verdade)
  const nativo = typeof window.TelaAndroid !== 'undefined';
  // Desde 30/09/2026 o Android no Brasil só instala app de desenvolvedor verificado no Google.
  // Enquanto o app não for verificado, o Chrome não oferece "Baixar o app" (só confundiria).
  const OFERECER_APP = false;
  const appEstado = () => { try { return JSON.parse(window.TelaAndroid.estado()); } catch (e) { return {}; } };
  const par = N.lerPareamento(location.hash) || N.lerPareamento(location.search);
  if (par) {
    estado.carro = par; gravar('tela.carro', par);
    history.replaceState(null, '', location.pathname);
  }

  // ── PACOTE: baixa tudo e só então troca ──
  async function sincronizar() {
    if (estado.baixando || !navigator.onLine) return;
    estado.baixando = true; mostrarEspera();
    try {
      const r = await fetch('pacote.json?t=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) throw new Error('pacote ' + r.status);
      const novo = await r.json();
      const cache = await caches.open(CACHE_MIDIA);
      const lista = Object.entries(novo.midias);
      let feitos = 0;
      for (const [id, m] of lista) {
        const url = urlMidia(m);
        if (!(await cache.match(url))) {
          const resp = await fetch(url, { cache: 'no-store' });
          if (!resp.ok) throw new Error(id + ' ' + resp.status);
          await cache.put(url, resp);
        }
        feitos++;
        estado.sinc = Object.assign({}, estado.sinc, { baixado: feitos, total: lista.length });
        mostrarEspera();
      }
      const mudou = JSON.stringify(estado.pacote) !== JSON.stringify(novo);
      estado.pacote = novo; gravar('tela.pacote', novo);
      if (novo.app && novo.app > APP) novaVersao = novo.app; // player novo no site: recarrega na hora certa
      // tira do aparelho o que saiu do pacote
      const usadas = new Set(lista.map(([, m]) => new URL(urlMidia(m), location.href).href));
      for (const req of await cache.keys()) if (!usadas.has(req.url)) await cache.delete(req);
      for (const [k, u] of estado.urls) if (!usadas.has(new URL(k, location.href).href)) { URL.revokeObjectURL(u); estado.urls.delete(k); }
      estado.sinc = { quando: Date.now(), versao: novo.versao, baixado: feitos, total: lista.length, erro: '' };
      if (mudou && !estado.tocando) tocarProximo();
    } catch (e) {
      estado.sinc = Object.assign({}, estado.sinc, { erro: String((e && e.message) || e), tentativa: Date.now() });
    } finally {
      estado.baixando = false; gravar('tela.sinc', estado.sinc); mostrarEspera(); atualizarMenu();
    }
  }

  async function urlDe(id) {
    const m = estado.pacote.midias[id], k = urlMidia(m);
    if (estado.urls.has(k)) return estado.urls.get(k);
    const r = await (await caches.open(CACHE_MIDIA)).match(k);
    if (!r) return null;
    const u = URL.createObjectURL(await r.blob());
    estado.urls.set(k, u);
    return u;
  }

  // ── ATUALIZAÇÃO SOZINHA ──
  // O pacote.json diz a versão do player ("app"). Se for mais nova que esta, recarrega entre um
  // anúncio e outro: no app (ou no atalho) na hora; no Chrome, quando o carro desliga, porque
  // recarregar sai da tela cheia (o próximo toque volta com ela). Uma vez por versão, no máximo.
  let novaVersao = '';
  function podeRecarregar() {
    if (!novaVersao || ler('tela.recarregou', '') === novaVersao) return false;
    return modoApp() || carregando() !== true;
  }

  // ── TOCAR ──
  let geracao = 0;
  async function tocarProximo() {
    if (podeRecarregar()) { gravar('tela.recarregou', novaVersao); guardar(); location.reload(); return; }
    const g = ++geracao;
    ultimoAvanco = Date.now();
    clearTimeout(estado.timer); vid.onended = null;
    if (!estado.pacote) { estado.tocando = null; mostrarEspera(); return; }
    const prox = N.proximo(estado.pacote, estado.pos, new Date(), cidade());
    if (!prox) { // nada programado agora: tenta de novo daqui a um minuto
      estado.tocando = null; quadro.classList.remove('aceso'); estado.timer = setTimeout(tocarProximo, MIN); return;
    }
    estado.pos = prox.pos;
    const id = prox.item.midia, m = estado.pacote.midias[id];
    let url = null;
    try { url = await urlDe(id); } catch (e) { url = null; }
    if (g !== geracao) return;
    if (!url) { estado.timer = setTimeout(tocarProximo, 300); sincronizar(); return; } // sumiu do aparelho: pula

    quadro.classList.remove('aceso');
    await espera(FADE);
    if (g !== geracao) return;
    mostrarEspera();
    const seg = N.segundosDe(prox.item, estado.pacote);
    estado.tocando = { id, inicio: Date.now(), seg };
    montarQRs(m);

    if (m.tipo === 'video') {
      img.style.display = 'none';
      vid.style.display = 'block';
      vid.onerror = () => terminar(g, id, 0); // vídeo com defeito: pula na hora
      vid.src = url;
      try { await vid.play(); }
      catch (e) { estado.timer = setTimeout(() => terminar(g, id, 0), 1000); return; }
      if (g !== geracao) return;
      quadro.classList.add('aceso');
      acompanharQRs(g);
      vid.onended = () => terminar(g, id, (Date.now() - estado.tocando.inicio) / 1000);
      estado.timer = setTimeout(() => terminar(g, id, seg), (seg + 5) * 1000); // se o vídeo travar
    } else {
      vid.onended = null; vid.pause(); vid.removeAttribute('src'); vid.load(); vid.style.display = 'none';
      img.src = url;
      try { await img.decode(); } catch (e) { /* mostra assim mesmo */ }
      if (g !== geracao) return;
      img.style.display = 'block';
      estado.qrEls.forEach(x => x.el.classList.add('on'));
      quadro.classList.add('aceso');
      estado.timer = setTimeout(() => terminar(g, id, seg), Math.max(1000, seg * 1000 - FADE));
    }
  }

  // ── VIGIA DO LOOP: a tela nunca fica parada ──
  // O loop já recomeça sozinho, sem fim. Isto cobre o que pode travar no meio do caminho: o
  // Android pausa o vídeo quando a tela apaga, o decodificador engasga, um item passa do tempo.
  let ultimoAvanco = Date.now();
  function vigiarLoop() {
    if (document.visibilityState !== 'visible' || !estado.pacote) return;
    const t = estado.tocando, agora = Date.now();
    if (t) {
      const m = estado.pacote.midias[t.id] || {};
      const passou = (agora - t.inicio) / 1000;
      if (passou > t.seg + 15) { tocarProximo(); return; } // passou muito do tempo: segue
      if (m.tipo === 'video' && vid.paused && !vid.ended && passou > 1) vid.play().catch(() => {}); // pausado à toa: continua
    } else if (agora - ultimoAvanco > 2 * MIN) tocarProximo(); // parado sem nada tocando: recomeça
  }
  setInterval(vigiarLoop, 5000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') setTimeout(vigiarLoop, 500); });

  function terminar(g, id, segundos) {
    if (g !== geracao) return;
    const t = estado.tocando;
    // só conta exibição que passou quase inteira
    if (t && t.id === id && segundos >= t.seg * 0.8) {
      const agora = new Date(), r = regiaoAgora();
      N.anotarExibicao(estado.ag, agora, id, t.seg);
      if (r) N.anotarRegiao(estado.ag, agora, r, 0, 1);
    }
    tocarProximo();
  }

  // ── QR DO CARRO por cima do QR da arte (o link leva o código do carro) ──
  function montarQRs(m) {
    qrs.textContent = '';
    estado.qrEls = [];
    for (const q of m.qr || []) {
      const el = document.createElement('div');
      el.className = 'qr';
      // px na arte de 1920×1080: cobre a borda do QR antigo (o contorno que o leitor acha fica
      // um pouco para dentro dos módulos); as caixas brancas das artes têm folga para isso
      const pad = Math.max(4, Math.round(q.lado * 0.04));
      el.style.left = ((q.x - pad) / 19.2) + '%';
      el.style.top = ((q.y - pad) / 10.8) + '%';
      el.style.width = ((q.lado + 2 * pad) / 19.2) + '%';
      el.style.height = ((q.lado + 2 * pad) / 10.8) + '%';
      const c = document.createElement('canvas');
      el.appendChild(c); qrs.appendChild(el);
      const x = { el, c, q, texto: N.linkQR(q.anuncio, carroCod()) };
      desenharQR(x);
      estado.qrEls.push(x);
    }
  }
  function desenharQR(x) {
    const qr = qrcode(0, 'M');
    qr.addData(x.texto); qr.make();
    const n = qr.getModuleCount(), total = n + 2; // 1 módulo de margem branca por dentro
    const r = x.el.getBoundingClientRect();
    const lado = Math.max(total * 2, Math.round(Math.min(r.width, r.height) * (window.devicePixelRatio || 1)));
    x.c.width = x.c.height = lado;
    const ctx = x.c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, lado, lado);
    const mod = Math.floor(lado / total), off = Math.floor((lado - mod * n) / 2);
    ctx.fillStyle = '#000';
    for (let y = 0; y < n; y++) for (let k = 0; k < n; k++) if (qr.isDark(y, k)) ctx.fillRect(off + k * mod, off + y * mod, mod, mod);
  }
  function acompanharQRs(g) {
    const passo = () => {
      if (g !== geracao) return;
      const t = vid.currentTime;
      for (const x of estado.qrEls) x.el.classList.toggle('on', t >= x.q.de && t <= x.q.ate);
      requestAnimationFrame(passo);
    };
    requestAnimationFrame(passo);
  }
  addEventListener('resize', () => estado.qrEls.forEach(desenharQR));

  // ── TELA LIGADA E CARRO ANDANDO ──
  const amostras = [];
  addEventListener('devicemotion', e => {
    const a = e.accelerationIncludingGravity;
    if (!a || a.x == null) return;
    amostras.push(Math.hypot(a.x, a.y, a.z));
    if (amostras.length > 3000) amostras.splice(0, 1000);
  });
  let ultimoTique = Date.now();
  setInterval(() => {
    const agora = new Date();
    // na tomada = carro ligado. Conta o tempo de verdade entre um tique e outro (com a tela
    // apagada o Android segura o relógio), mas nunca mais que um minuto e pouco de uma vez
    const passou = Math.min(70, Math.max(0, (agora - ultimoTique) / 1000));
    ultimoTique = +agora;
    const tomada = carregando();
    if (tomada) N.anotarCarregando(estado.ag, agora, passou);
    if (document.visibilityState === 'visible' && estado.tocando) {
      N.anotarTela(estado.ag, agora, N.JANELA_VIBRACAO);
      if (tomada === false) N.anotarBateria(estado.ag, agora, N.JANELA_VIBRACAO);
      if (amostras.length >= 5) N.anotarVibracao(estado.ag, agora, N.desvio(amostras));
      const r = regiaoAgora();
      if (r) N.anotarRegiao(estado.ag, agora, r, N.JANELA_VIBRACAO, 0);
    }
    amostras.length = 0;
  }, N.JANELA_VIBRACAO * 1000);

  // ── CARRO LIGADO: tablet na tomada (o cabo fica no carro) ──
  let bat = null;
  try {
    if (navigator.getBattery) navigator.getBattery().then(b => {
      bat = b; b.addEventListener('chargingchange', ajustarLocal); b.addEventListener('levelchange', ajustarLocal); ajustarLocal();
    }).catch(() => {});
  } catch (e) { /* sem a API: segue sem */ }
  function carregando() { // true / false, ou null se o tablet não conta
    if (nativo) { const a = appEstado(); if (typeof a.carregando === 'boolean') return a.carregando; }
    return bat ? !!bat.charging : null;
  }
  function nivelBateria() { // 0–100, ou null se o tablet não conta
    if (nativo) { const a = appEstado(); if (typeof a.nivel === 'number' && a.nivel >= 0) return a.nivel; }
    return bat && typeof bat.level === 'number' ? Math.round(bat.level * 100) : null;
  }
  // GPS: na tomada, ou fora dela com mais de 50% de bateria (abaixo disso desliga para poupar)
  const BATERIA_GPS = 50;
  function gpsPode() {
    if (carregando() !== false) return true;
    const n = nivelBateria();
    return n == null || n > BATERIA_GPS;
  }

  // ── TOQUES NA TELA: passageiro mexendo (o canto do menu e as telas de ajuste não contam) ──
  let ultimoToque = 0;
  document.addEventListener('pointerdown', e => {
    if (!estado.tocando || (e.target.closest && e.target.closest('#canto, #menu, #config, #pin'))) return;
    const t = Date.now();
    if (t - ultimoToque < 1500) return; // dedo que fica batendo conta uma vez
    ultimoToque = t;
    N.anotarToque(estado.ag, new Date(t));
  }, true);

  // ── BAIRRO E KM RODADOS (só se o motorista deixar, no "Configurar a tela") ──
  // Guarda só o bairro aproximado (geohash de 6 letras, uns 1,1 × 0,6 km), nunca a rua, e
  // só com o carro andando: parado mais de 3 min (em casa, no estacionamento) não marca nada.
  const loc = { watch: null, fix: null, ancora: null, andou: 0, precisao: 0, negada: false, erro: '', desde: 0 };
  const DICA_GPS = 'Dentro de casa o GPS demora. Leve o tablet para perto de uma janela por 1 a 2 minutos. Confira também em ' +
    'Configurações → Localização se ela está ligada, com "Precisão do local do Google" ligada (acha a posição pelo Wi-Fi, bem mais rápido).';
  const PRECISAO_BAIRRO = 300, PRECISAO_KM = 50; // metros: sinal pior que isso não vale
  function ligarLocal() {
    if (loc.watch != null || !navigator.geolocation) return;
    loc.negada = false; loc.erro = ''; loc.desde = Date.now();
    try {
      loc.watch = navigator.geolocation.watchPosition(novaPosicao, erroLocal, { enableHighAccuracy: true, maximumAge: 10000 });
    } catch (e) { loc.erro = 'sem GPS'; loc.watch = null; }
  }
  function desligarLocal() {
    if (loc.watch != null) { try { navigator.geolocation.clearWatch(loc.watch); } catch (e) { /* já parou */ } }
    loc.watch = null; loc.ancora = null; loc.desde = 0;
  }
  function erroLocal(e) {
    if (e && e.code === 1) { loc.negada = true; desligarLocal(); } // o tablet (ou o Chrome) negou
    else loc.erro = 'sem sinal de GPS';
  }
  function novaPosicao(p) {
    const c = p.coords, t = Date.now();
    loc.precisao = Math.round(c.accuracy || 0); loc.erro = '';
    if (!(c.accuracy <= PRECISAO_BAIRRO)) { loc.erro = 'sinal fraco'; return; }
    const ponto = { lat: c.latitude, lon: c.longitude, t };
    loc.fix = ponto;
    if (typeof c.speed === 'number' && c.speed >= N.VELOCIDADE_ANDANDO) loc.andou = t;
    if (c.accuracy > PRECISAO_KM) return;
    // km: soma só quando sai de perto do último ponto (o GPS "treme" uns metros parado)
    const a = loc.ancora;
    if (!a || t - a.t > 2 * MIN) { loc.ancora = ponto; return; } // começou agora ou ficou sem sinal
    const d = N.distanciaM(a, ponto);
    if (d < Math.max(30, 2 * c.accuracy)) return;
    if (d / ((t - a.t) / 1000) >= N.VELOCIDADE_ANDANDO) loc.andou = t;
    if (document.visibilityState === 'visible' && estado.tocando) N.anotarKm(estado.ag, new Date(t), d);
    loc.ancora = ponto;
  }
  function regiaoAgora() {
    const t = Date.now();
    if (!loc.fix || t - loc.fix.t > 2 * MIN || t - loc.andou > 3 * MIN) return null;
    return N.geohash(loc.fix.lat, loc.fix.lon);
  }
  // fora da tomada e com a bateria abaixo de 50% o GPS desliga; volta quando carrega
  function ajustarLocal() {
    const a = nativo ? appEstado() : null;
    const ligar = ler('tela.local', false) && gpsPode() && !(a && a.local === false);
    if (!ligar) { desligarLocal(); return; }
    if (loc.negada && !(a && a.local === true)) return; // negou: só tenta de novo se pedirem
    ligarLocal();
  }
  function pedirLocal() {
    gravar('tela.local', true);
    loc.negada = false; desligarLocal();
    if (nativo && appEstado().local === false) window.TelaAndroid.abrir('local'); // o Android pergunta
    ajustarLocal(); atualizarConfig();
  }
  setInterval(ajustarLocal, 30000);
  function textoLocal() {
    const a = nativo ? appEstado() : null;
    if (a && a.local === undefined) return 'precisa da versão nova do app';
    if (!ler('tela.local', false)) return 'desligada (não autorizada)';
    if (loc.negada || (a && a.local === false)) return 'negada no tablet';
    if (!gpsPode()) return `pausada (bateria abaixo de ${BATERIA_GPS}% fora da tomada)`;
    if (!loc.fix) return (loc.erro || 'procurando o GPS…') + (loc.desde && Date.now() - loc.desde > 20000 ? ' · perto da janela acha mais rápido' : '');
    const parado = Date.now() - loc.andou > 3 * MIN;
    return `ligada · ±${loc.precisao} m · ${parado ? 'parado (não marca)' : 'andando'}${loc.erro ? ' · ' + loc.erro : ''}`;
  }
  const guardar = () => gravar('tela.ag', estado.ag);
  setInterval(guardar, MIN);
  addEventListener('pagehide', guardar);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') guardar(); else manterAcesa(); });

  // ── ENVIO: lotes do que passou + sinal de vida do tablet ──
  async function enviar() {
    if (!estado.carro || !navigator.onLine || estado.enviando) return;
    estado.enviando = true;
    try {
      if (Object.keys(estado.ag).length) {
        estado.fila.push(...N.lotes(estado.ag, Object.assign({}, estado.carro, { pacote: versao(), app: APP }), estado.pacote));
        estado.ag = {}; guardar();
        if (estado.fila.length > 500) estado.fila.splice(0, estado.fila.length - 500);
        gravar('tela.fila', estado.fila);
      }
      while (estado.fila.length) {
        const lote = estado.fila[0];
        const dados = Object.assign({}, lote, { criado: new Date(lote.criado) });
        delete dados.id;
        const r = await fetch(N.urlCriar('tela_horas', lote.id), {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: N.campos(dados) }),
        });
        if (r.ok || r.status === 409) { // 409: já tinha chegado numa tentativa anterior
          estado.fila.shift(); gravar('tela.fila', estado.fila);
          estado.ultimoEnvio = Date.now(); gravar('tela.ultimoEnvio', estado.ultimoEnvio); estado.erroEnvio = null;
        } else {
          estado.erroEnvio = r.status === 403 ? 'carro não autorizado: confira o pareamento' : 'erro ' + r.status;
          break;
        }
      }
    } catch (e) {
      estado.erroEnvio = 'sem conexão';
    } finally {
      estado.enviando = false; atualizarMenu();
    }
  }

  async function avisar() {
    if (!estado.carro || !navigator.onLine) return;
    let bateria = -1, carregando = false;
    try { const b = await navigator.getBattery(); bateria = Math.round(b.level * 100); carregando = !!b.charging; } catch (e) { /* sem API */ }
    const doc = {
      carro: estado.carro.carro, chave: estado.carro.chave, cidade: cidade(), pacote: versao(),
      baixado: `${estado.sinc.baixado || 0}/${estado.sinc.total || 0}`, bateria, carregando, app: APP,
      visto: new Date(), tocando: estado.tocando ? estado.tocando.id : '', fila: estado.fila.length,
    };
    try {
      await fetch(N.urlDoc('tela_status', estado.carro.carro), {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: N.campos(doc) }),
      });
    } catch (e) { /* tenta no próximo */ }
  }

  // ── TELAS DE APOIO ──
  function mostrarEspera() {
    const on = !estado.pacote;
    $('espera').classList.toggle('on', on);
    if (!on) return;
    const s = estado.sinc || {};
    const pct = s.total ? Math.round(100 * (s.baixado || 0) / s.total) : 0;
    $('barra-i').style.width = pct + '%';
    if (estado.baixando) {
      $('espera-titulo').textContent = 'Baixando o pacote de vídeos';
      $('espera-texto').textContent = s.total ? `${s.baixado || 0} de ${s.total} arquivos. Deixe no Wi-Fi até terminar.` : 'Conferindo o que há de novo…';
    } else if (!navigator.onLine) {
      $('espera-titulo').textContent = 'Sem internet';
      $('espera-texto').textContent = 'Conecte o tablet no Wi-Fi uma vez para baixar o pacote. Depois ele roda sem internet.';
    } else if (s.erro) {
      $('espera-titulo').textContent = 'Não consegui baixar';
      $('espera-texto').textContent = 'Tento de novo sozinho em alguns minutos. (' + s.erro + ')';
    }
  }

  const hora = t => t ? new Date(t).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
  function atualizarMenu() {
    if (!$('menu').classList.contains('on')) return;
    const s = estado.sinc || {};
    const linhas = [
      ['Carro', estado.carro ? `${estado.carro.carro}${cidade() ? ' · ' + cidade() : ''}` : 'não pareado (as exibições não são enviadas)'],
      ['Pacote', versao() || 'nenhum ainda'],
      ['Arquivos', `${s.baixado || 0} de ${s.total || 0}${estado.baixando ? ' (baixando…)' : ''}`],
      ['Último download', hora(s.quando) + (s.erro ? ` · erro: ${s.erro}` : '')],
      ['Esperando envio', `${estado.fila.length} lote(s)` + (estado.erroEnvio ? ` · ${estado.erroEnvio}` : '')],
      ['Último envio', hora(estado.ultimoEnvio)],
      ['Internet', navigator.onLine ? 'conectado' : 'sem conexão'],
      ['Na tomada', (c => c == null ? 'o tablet não informa' : c ? 'sim (carro ligado)' : 'não')(carregando())],
      ['Localização', textoLocal()],
      ['Tela sempre acesa', nativo ? 'sim (o app segura)' : travaTela ? 'sim' : `não: ${erroTela || 'tentando…'} · ligue "Permanecer ativo" nas opções do desenvolvedor`],
      ['Trava', nativo ? (a => (a.fixado ? 'fixado' : 'solto') + (a.frota ? ' · modo frota' : '') + (a.modoCarro ? ' · modo carro ligado' : ''))(appEstado()) : 'no Chrome, sem o app'],
      ['Versão do app', APP + (nativo ? ' · Android ' + (appEstado().app || '') : '') + (novaVersao ? ` · nova ${novaVersao} (atualiza ${modoApp() ? 'já' : 'quando o carro desligar'})` : '')],
    ];
    const dl = $('menu-info');
    dl.textContent = '';
    for (const [k, v] of linhas) {
      const dt = document.createElement('dt'), dd = document.createElement('dd');
      dt.textContent = k; dd.textContent = v; dl.append(dt, dd);
    }
  }

  // 5 toques no canto de cima à esquerda pedem o PIN do menu (4 números que o painel mostra em
  // cada carro). Tablet sem carro abre direto, para dar para parear. 5 erros: bloqueia 5 min,
  // depois 10, 20… até 1 h. O menu fecha sozinho depois de 2 min parado.
  let toques = [];
  $('canto').addEventListener('pointerdown', () => {
    const t = Date.now();
    toques = toques.filter(x => t - x < 3000); toques.push(t);
    if (toques.length >= 5) { toques = []; pedirPin(); }
  });
  const PIN_ERROS = 5;
  const hhmm = t => new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const bloqueio = () => ler('tela.pinBloqueio', { ate: 0, vezes: 0, erros: 0 });
  let pinDigitado = '', fecharPinT = 0, fecharMenuT = 0;
  function abrirMenu() { $('menu').classList.add('on'); atualizarMenu(); fecharMenuDepois(); }
  function fecharMenuDepois() { clearTimeout(fecharMenuT); fecharMenuT = setTimeout(() => $('menu').classList.remove('on'), 2 * MIN); }
  $('menu').addEventListener('pointerdown', fecharMenuDepois);
  function pedirPin() {
    if (!estado.carro) { abrirMenu(); return; }
    const b = bloqueio();
    pinDigitado = ''; desenharPin();
    $('pin-msg').textContent = b.ate > Date.now() ? `Bloqueado por PIN errado. Tente às ${hhmm(b.ate)}.` : 'Digite o PIN do menu. Ele está no painel, no carro.';
    $('pin').classList.add('on');
    clearTimeout(fecharPinT); fecharPinT = setTimeout(fecharPin, 30000);
  }
  function fecharPin() { clearTimeout(fecharPinT); pinDigitado = ''; $('pin').classList.remove('on'); }
  function desenharPin() { $('pin-pontos').querySelectorAll('i').forEach((el, i) => el.classList.toggle('on', i < pinDigitado.length)); }
  $('pin-teclas').addEventListener('click', e => {
    const bt = e.target.closest('button[data-k]');
    if (!bt) return;
    const k = bt.dataset.k;
    clearTimeout(fecharPinT); fecharPinT = setTimeout(fecharPin, 30000);
    if (k === 'x') return fecharPin();
    const b = bloqueio();
    if (b.ate > Date.now()) return;
    if (k === '<') { pinDigitado = pinDigitado.slice(0, -1); return desenharPin(); }
    if (pinDigitado.length >= 4) return;
    pinDigitado += k; desenharPin();
    if (pinDigitado.length < 4) return;
    if (estado.carro && pinDigitado === N.pinMenu(estado.carro.chave)) {
      gravar('tela.pinBloqueio', { ate: 0, vezes: 0, erros: 0 });
      fecharPin(); abrirMenu();
      return;
    }
    b.erros += 1;
    if (b.erros >= PIN_ERROS) { b.vezes += 1; b.erros = 0; b.ate = Date.now() + Math.min(60, 5 * 2 ** (b.vezes - 1)) * MIN; }
    gravar('tela.pinBloqueio', b);
    pinDigitado = '';
    setTimeout(desenharPin, 250);
    $('pin-msg').textContent = b.ate > Date.now() ? `PIN errado. Bloqueado até ${hhmm(b.ate)}.` : `PIN errado. Restam ${PIN_ERROS - b.erros} tentativa(s).`;
  });
  $('bt-fechar').onclick = () => $('menu').classList.remove('on');
  $('bt-sinc').onclick = () => { sincronizar(); enviar(); avisar(); atualizarMenu(); };
  $('bt-cheia').onclick = () => { telaCheia(); $('menu').classList.remove('on'); };
  $('bt-parear').onclick = () => {
    const c = $('par-carro').value.trim().toUpperCase(), k = $('par-chave').value.trim(), cid = N.slug($('par-cidade').value);
    if (!/^[A-Z0-9-]{1,16}$/.test(c) || !/^[A-Za-z0-9]{8,64}$/.test(k)) { alert('Código ou chave inválidos.'); return; }
    estado.carro = { carro: c, chave: k, cidade: cid }; gravar('tela.carro', estado.carro);
    $('menu').classList.remove('on'); montarQRsDeNovo(); avisar();
  };
  function montarQRsDeNovo() {
    for (const x of estado.qrEls) { x.texto = N.linkQR(x.q.anuncio, carroCod()); desenharQR(x); }
  }

  // ── TELA CHEIA E TELA ACESA ──
  const modoApp = () => nativo || matchMedia('(display-mode: fullscreen)').matches || matchMedia('(display-mode: standalone)').matches;
  function telaCheia() {
    const el = document.documentElement;
    if (document.fullscreenElement || !el.requestFullscreen) return;
    el.requestFullscreen({ navigationUI: 'hide' }).then(() => {
      try { screen.orientation.lock('landscape').catch(() => {}); } catch (e) { /* sem suporte */ }
    }).catch(() => {});
  }
  // No Chrome (sem atalho), se a tela cheia cair, o próximo toque volta com ela
  document.addEventListener('pointerdown', () => {
    if (!modoApp() && !$('config').classList.contains('on') && !$('menu').classList.contains('on') && !$('pin').classList.contains('on')) telaCheia();
  });
  // Voltar não sai da tela. Com o app fixado, só Voltar + Recentes com o PIN solta.
  try { history.pushState({ tela: 1 }, ''); } catch (e) { /* segue */ }
  addEventListener('popstate', () => { try { history.pushState({ tela: 1 }, ''); } catch (e) { /* segue */ } });

  // ── CONFIGURAR A TELA: tela cheia e trava com o PIN do próprio tablet ──
  // (página da web não consegue fixar o app sozinha: o passo a passo fica na tela)
  let pedidoAtalho = null;
  addEventListener('beforeinstallprompt', e => { e.preventDefault(); pedidoAtalho = e; atualizarConfig(); });
  addEventListener('appinstalled', () => { pedidoAtalho = null; atualizarConfig(); });
  function abrirConfig() { $('config').classList.add('on'); atualizarConfig(); }
  function atualizarConfig() {
    if (!$('config').classList.contains('on')) return;
    $('config-carro').textContent = estado.carro
      ? `Carro ${estado.carro.carro}${cidade() ? ' · ' + cidade() : ''}`
      : 'Este tablet ainda não está ligado a um carro (abra o link do painel).';
    $('passo-app').hidden = !pedidoAtalho || modoApp();
    // no Chrome do Android: o app é que trava de verdade (fica escondido até o app ser verificado no Google)
    $('passo-baixar').hidden = !OFERECER_APP || nativo || !/Android/i.test(navigator.userAgent);
    $('bt-abrir-app').href = linkApp();
    // dentro do app: a lista muda para o que o app precisa
    document.querySelector('#config ol:not(#passos-nativo)').hidden = nativo;
    $('passos-nativo').hidden = !nativo;
    $('bt-cfg-cheia').hidden = nativo;
    $('bt-cfg-pronto').textContent = nativo ? 'Pronto, travar a tela' : 'Pronto, começar';
    if (nativo) {
      const a = appEstado();
      $('n-sobre').classList.toggle('feito', !!a.sobreposicao);
      $('n-bateria').classList.toggle('feito', !!a.bateria);
      $('n-pin').classList.toggle('feito', !!a.fixado);
      $('n-pin-aviso').hidden = a.pin !== false;
      $('n-local').hidden = a.local === undefined; // app antigo não tem GPS
    }
    ajustarLocal(); // na volta do aviso do Android, já liga o GPS
    // o botão diz o que está acontecendo (e o que fazer), não só "procurando"
    const pediu = ler('tela.local', false), app = nativo ? appEstado() : {};
    const negada = loc.negada || (pediu && app.local === false);
    const ligada = pediu && !!loc.fix && !negada;
    const semTomada = pediu && !ligada && !negada && !gpsPode();
    const demorando = pediu && !ligada && !negada && !semTomada && (!!loc.erro || (loc.desde && Date.now() - loc.desde > 20000));
    document.querySelectorAll('.passo-local').forEach(li => li.classList.toggle('feito', ligada));
    document.querySelectorAll('.bt-local').forEach(b => {
      b.textContent = ligada ? 'Localização ligada ✓' : negada ? 'Tentar de novo' : semTomada ? 'Ligue o carregador'
        : loc.erro ? 'Sem sinal de GPS' : pediu ? 'Procurando o GPS…' : 'Permitir localização';
      b.classList.toggle('feito', ligada);
    });
    document.querySelectorAll('.local-negada').forEach(x => { x.hidden = !negada; });
    document.querySelectorAll('.local-dica').forEach(x => {
      x.textContent = semTomada ? `Fora da tomada, o GPS só liga com mais de ${BATERIA_GPS}% de bateria (para não descarregar o tablet).` : demorando ? DICA_GPS : '';
      x.hidden = !x.textContent;
    });
    const cheia = modoApp() || !!document.fullscreenElement;
    $('bt-cfg-cheia').classList.toggle('feito', cheia);
    $('bt-cfg-cheia').textContent = cheia ? 'Tela cheia ligada ✓' : 'Expandir tela';
  }
  $('bt-cfg-cheia').onclick = telaCheia;
  document.querySelectorAll('.bt-local').forEach(b => { b.onclick = pedirLocal; });
  $('bt-cfg-app').onclick = async () => {
    if (!pedidoAtalho) return;
    pedidoAtalho.prompt();
    try { await pedidoAtalho.userChoice; } catch (e) { /* segue */ }
    pedidoAtalho = null; atualizarConfig();
  };
  $('bt-cfg-pronto').onclick = () => {
    gravar('tela.configurada', true);
    $('config').classList.remove('on');
    if (nativo) window.TelaAndroid.travar();
    else if (!modoApp()) telaCheia();
  };
  // botões da lista do app: abrem o ajuste do Android e a lista se atualiza sozinha na volta
  $('passos-nativo').addEventListener('click', e => {
    const b = e.target.closest('button[data-ajuste]');
    if (b && nativo) window.TelaAndroid.abrir(b.dataset.ajuste);
  });
  setInterval(atualizarConfig, 1500);
  // link que abre o app já pareado (se não tiver o app, baixa)
  function linkApp() {
    const c = estado.carro;
    const q = c ? `?parear=${c.carro}.${c.chave}.${c.cidade || ''}` : '';
    return `intent://anunc-ia.vercel.app/tela/${q}#Intent;scheme=https;package=br.com.anuncia.tela;` +
      `S.browser_fallback_url=${encodeURIComponent(new URL('app/tela-do-carro.apk', location.href).href)};end`;
  }
  $('bt-sair-carro').hidden = !nativo;
  $('bt-sair-carro').onclick = () => { $('menu').classList.remove('on'); if (nativo) window.TelaAndroid.sair(); };
  document.addEventListener('fullscreenchange', atualizarConfig);
  $('bt-config').onclick = () => { $('menu').classList.remove('on'); abrirConfig(); };
  if (par || !ler('tela.configurada', false)) abrirConfig();
  // Tela sempre acesa: pede ao navegador e, se ele soltar ou negar (economia de energia, por
  // exemplo), tenta de novo a cada 30 s e a cada toque. O menu mostra se está segurando.
  let travaTela = null, erroTela = '';
  async function manterAcesa() {
    if (!('wakeLock' in navigator)) { erroTela = 'este navegador não deixa'; return; }
    if (document.visibilityState !== 'visible' || (travaTela && !travaTela.released)) return;
    try {
      travaTela = await navigator.wakeLock.request('screen'); erroTela = '';
      travaTela.addEventListener('release', () => { travaTela = null; });
    } catch (e) {
      travaTela = null;
      erroTela = e && e.name === 'NotAllowedError' ? 'o Android não deixou (economia de energia ligada?)' : 'não deu agora';
    }
  }
  setInterval(manterAcesa, 30000);
  document.addEventListener('pointerdown', manterAcesa);

  // ── PARTIDA ──
  window.TelaAcoes = { sincronizar, enviar, avisar, tocarProximo, pedirLocal, regiaoAgora, local: loc }; // console / testes
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* segue */ }
  manterAcesa();
  mostrarEspera();
  if (estado.pacote) tocarProximo();
  sincronizar();
  ajustarLocal();
  setTimeout(() => { enviar(); avisar(); }, 5000);
  setInterval(sincronizar, 15 * MIN);
  setInterval(enviar, 60 * MIN); // de hora em hora: menos lotes, painel lê menos
  setInterval(avisar, 10 * MIN);
  addEventListener('online', () => { sincronizar(); enviar(); avisar(); });
  addEventListener('offline', mostrarEspera);
})();
