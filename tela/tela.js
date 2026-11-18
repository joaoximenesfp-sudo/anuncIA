// Player da rede de telas nos carros.
// Baixa o pacote quando tem internet (de preferência no Wi-Fi de casa), toca em
// loop sem internet, põe o QR do carro por cima do QR da arte e anota o que
// passou na tela: exibições, horas de tela e vibração (carro andando). O painel
// (painel.html) junta isso por carro e por anunciante.
(function () {
  'use strict';
  const N = window.TelaNucleo;
  const APP = '2026-11-18';
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
  const par = N.lerPareamento(location.hash);
  if (par) {
    estado.carro = par; gravar('tela.carro', par);
    history.replaceState(null, '', location.pathname + location.search);
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

  // ── TOCAR ──
  let geracao = 0;
  async function tocarProximo() {
    const g = ++geracao;
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

  function terminar(g, id, segundos) {
    if (g !== geracao) return;
    const t = estado.tocando;
    // só conta exibição que passou quase inteira
    if (t && t.id === id && segundos >= t.seg * 0.8) N.anotarExibicao(estado.ag, new Date(), id, t.seg);
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
  setInterval(() => {
    const agora = new Date();
    if (document.visibilityState === 'visible' && estado.tocando) {
      N.anotarTela(estado.ag, agora, N.JANELA_VIBRACAO);
      if (amostras.length >= 5) N.anotarVibracao(estado.ag, agora, N.desvio(amostras));
    }
    amostras.length = 0;
  }, N.JANELA_VIBRACAO * 1000);
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
      ['Versão do app', APP],
    ];
    const dl = $('menu-info');
    dl.textContent = '';
    for (const [k, v] of linhas) {
      const dt = document.createElement('dt'), dd = document.createElement('dd');
      dt.textContent = k; dd.textContent = v; dl.append(dt, dd);
    }
  }

  // 5 toques no canto de cima à esquerda abrem o menu
  let toques = [];
  $('canto').addEventListener('pointerdown', () => {
    const t = Date.now();
    toques = toques.filter(x => t - x < 3000); toques.push(t);
    if (toques.length >= 5) { toques = []; $('menu').classList.add('on'); atualizarMenu(); }
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
  const modoApp = () => matchMedia('(display-mode: fullscreen)').matches || matchMedia('(display-mode: standalone)').matches;
  function telaCheia() {
    const el = document.documentElement;
    if (document.fullscreenElement || !el.requestFullscreen) return;
    el.requestFullscreen({ navigationUI: 'hide' }).then(() => {
      try { screen.orientation.lock('landscape').catch(() => {}); } catch (e) { /* sem suporte */ }
    }).catch(() => {});
  }
  // No Chrome (sem atalho), se a tela cheia cair, o próximo toque volta com ela
  document.addEventListener('pointerdown', () => {
    if (!modoApp() && !$('config').classList.contains('on') && !$('menu').classList.contains('on')) telaCheia();
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
    const cheia = modoApp() || !!document.fullscreenElement;
    $('bt-cfg-cheia').classList.toggle('feito', cheia);
    $('bt-cfg-cheia').textContent = cheia ? 'Tela cheia ligada ✓' : 'Expandir tela';
  }
  $('bt-cfg-cheia').onclick = telaCheia;
  $('bt-cfg-app').onclick = async () => {
    if (!pedidoAtalho) return;
    pedidoAtalho.prompt();
    try { await pedidoAtalho.userChoice; } catch (e) { /* segue */ }
    pedidoAtalho = null; atualizarConfig();
  };
  $('bt-cfg-pronto').onclick = () => {
    gravar('tela.configurada', true);
    $('config').classList.remove('on');
    if (!modoApp()) telaCheia();
  };
  document.addEventListener('fullscreenchange', atualizarConfig);
  $('bt-config').onclick = () => { $('menu').classList.remove('on'); abrirConfig(); };
  if (par || !ler('tela.configurada', false)) abrirConfig();
  async function manterAcesa() {
    try { if ('wakeLock' in navigator && document.visibilityState === 'visible') await navigator.wakeLock.request('screen'); } catch (e) { /* segue */ }
  }

  // ── PARTIDA ──
  window.TelaAcoes = { sincronizar, enviar, avisar, tocarProximo }; // console / testes
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* segue */ }
  manterAcesa();
  mostrarEspera();
  if (estado.pacote) tocarProximo();
  sincronizar();
  setTimeout(() => { enviar(); avisar(); }, 5000);
  setInterval(sincronizar, 15 * MIN);
  setInterval(enviar, 60 * MIN); // de hora em hora: menos lotes, painel lê menos
  setInterval(avisar, 10 * MIN);
  addEventListener('online', () => { sincronizar(); enviar(); avisar(); });
  addEventListener('offline', mostrarEspera);
})();
