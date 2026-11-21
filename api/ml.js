// /api/ml: liga o sistema à conta da loja no Mercado Livre pela API oficial
// (api.mercadolibre.com). Só sócio usa: toda chamada traz o idToken do Firebase de
// quem está logado, e quem decide se é sócio são as regras do Firestore (o servidor
// lê config/mercadolivre com esse token; quem não é sócio leva 403 de lá).
//
//   GET  /api/ml                            → { configurado } (a Vercel já tem o app do ML?)
//   POST { acao:'conectar', idToken }       → { url } da autorização do Mercado Livre
//   GET  ?code=…&state=…  (volta do login)  → troca o código pelos tokens e volta para o
//                                             sistema com eles CIFRADOS em /#ml=…
//   POST { acao:'foto', idToken, jpg }      → { id } da foto, já guardada no Mercado Livre
//   POST { acao:'publicar', idToken, item } → { ok, id, link, status } ou { ok:false, faltam }
//   POST { acao:'atualizar', idToken, id, preco?, status? } → muda preço ou situação
//   POST { acao:'itens', idToken, ids }     → situação, preço e link de até 20 anúncios
//   POST { acao:'novidades', idToken, desde } → pedidos desde a data e perguntas sem resposta
//   POST (aviso do Mercado Livre, sem acao) → 200: o sistema busca as novidades sozinho
//
// Os tokens nunca ficam legíveis fora daqui: o sistema guarda só a cifra (AES-256-GCM,
// chave tirada do ML_SECRET, que só existe na Vercel). O access token vale 6 horas; o
// refresh token, 6 meses e UMA vez só: cada renovação traz um par novo, gravado de volta
// em config/mercadolivre (e devolvido ao sistema, se o banco não aceitar na hora).
// Na Vercel: ML_APP_ID e ML_SECRET (do app criado em developers.mercadolivre.com.br,
// com a URI de redirect igual a VOLTA, abaixo).
const crypto = require('crypto');
const N = require('../tela/nucleo.js');

const API = 'https://api.mercadolibre.com';
const AUTORIZAR = 'https://auth.mercadolivre.com.br/authorization';
const VOLTA = `${N.SITE}/api/ml`; // igual à "URI de redirect" cadastrada no app do Mercado Livre
const CAT_PADRAO = 'MLB1652';     // Notebooks, se o Mercado Livre não sugerir outra
const DIA = 86400000;
const ID_ITEM = /^MLB\d{6,14}$/;

const erro = (status, msg, extra) => Object.assign(new Error(msg), { status }, extra || {});
const configurado = () => !!(process.env.ML_APP_ID && process.env.ML_SECRET);
const norm = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

// ── CIFRA DOS TOKENS ──
function chave() {
  if (!configurado()) throw erro(503, 'Falta configurar o app do Mercado Livre na Vercel (ML_APP_ID e ML_SECRET).');
  return crypto.createHash('sha256').update('anuncia/mercadolivre/' + process.env.ML_SECRET).digest();
}
function cifrar(obj) {
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', chave(), iv);
  const dados = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), dados]).toString('base64url');
}
function decifrar(txt) {
  const b = Buffer.from(String(txt || ''), 'base64url');
  if (b.length < 29) throw erro(409, 'O Mercado Livre da loja não está conectado.');
  try {
    const d = crypto.createDecipheriv('aes-256-gcm', chave(), b.subarray(0, 12));
    d.setAuthTag(b.subarray(12, 28));
    return JSON.parse(Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8'));
  } catch (e) {
    throw erro(409, 'A conexão com o Mercado Livre não vale mais (o segredo do app mudou). Conecte de novo.');
  }
}

// ── "STATE" DA AUTORIZAÇÃO: assinado, vale 15 minutos. O PKCE sai dele mesmo. ──
const assinar = txt => crypto.createHmac('sha256', chave()).update('estado|' + txt).digest('base64url').slice(0, 32);
function novoEstado(agora) {
  const corpo = Buffer.from(JSON.stringify({ t: agora, n: crypto.randomBytes(8).toString('hex') })).toString('base64url');
  return corpo + '.' + assinar(corpo);
}
function estadoValido(st, agora) {
  const [corpo, sig] = String(st || '').split('.');
  if (!corpo || !sig || sig.length !== 32) return false;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(assinar(corpo)))) return false;
  try {
    const { t } = JSON.parse(Buffer.from(corpo, 'base64url').toString('utf8'));
    return agora - t >= 0 && agora - t < 15 * 60000;
  } catch (e) { return false; }
}
// code_verifier do PKCE: tirado do state, não precisa guardar nada entre a ida e a volta
const verificador = st => crypto.createHmac('sha256', chave()).update('pkce|' + st).digest('base64url');
const desafio = v => crypto.createHash('sha256').update(v).digest('base64url');

// ── FIRESTORE COM O TOKEN DE QUEM ESTÁ LOGADO (as regras decidem) ──
async function lerConfig(idToken) {
  if (!idToken || typeof idToken !== 'string' || idToken.length > 5000) throw erro(401, 'Entre no sistema de novo.');
  const r = await fetch(N.urlDoc('config', 'mercadolivre'), { headers: { Authorization: 'Bearer ' + idToken } });
  if (r.status === 401 || r.status === 403) throw erro(403, 'Só os sócios usam o Mercado Livre da loja. Entre no sistema de novo.');
  if (r.status === 404) return null; // sócio, ainda sem conexão
  if (!r.ok) throw erro(502, 'Não consegui falar com o banco agora. Tente de novo.');
  return N.lerCampos((await r.json()).fields || {});
}
async function gravarConfig(idToken, dados) {
  const mascara = Object.keys(dados).map(k => 'updateMask.fieldPaths=' + encodeURIComponent(k)).join('&');
  try {
    const r = await fetch(N.urlDoc('config', 'mercadolivre') + '&' + mascara, {
      method: 'PATCH', headers: { Authorization: 'Bearer ' + idToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: N.campos(dados) }),
    });
    return r.ok;
  } catch (e) { return false; }
}

// ── MERCADO LIVRE ──
async function ml(metodo, caminho, { token, corpo, form, query } = {}) {
  const url = new URL(/^https:/.test(caminho) ? caminho : API + caminho);
  for (const [k, v] of Object.entries(query || {})) if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  let body;
  if (form) body = form;
  else if (corpo !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(corpo); }
  let r;
  try { r = await fetch(url, { method: metodo, headers, body }); }
  catch (e) { throw erro(502, 'Não consegui falar com o Mercado Livre agora. Tente de novo.'); }
  let j = null;
  try { j = await r.json(); } catch (e) { /* 204 ou sem JSON */ }
  return { status: r.status, ok: r.ok, j: j || {} };
}
// Os erros mais comuns em português; o resto vai com a mensagem do próprio Mercado Livre.
function traduzir(r) {
  const j = r.j || {}, txt = [j.message, j.error, ...(Array.isArray(j.cause) ? j.cause.map(c => c && (c.message || c.code)) : [])].filter(Boolean).join(' · ');
  if (r.status === 401 || /invalid[_ ]token|invalid access token|expired/i.test(txt))
    return 'A conexão com o Mercado Livre venceu ou foi desfeita. Toque em Conectar Mercado Livre de novo.';
  if (r.status === 429) return 'O Mercado Livre pediu um tempo (muitas chamadas seguidas). Tente de novo daqui a 1 minuto.';
  if (r.status === 403) return 'O Mercado Livre não deixou' + (txt ? ': ' + txt : '') + '. Confira se a conta conectada é a da loja e se o app tem permissão de escrita.';
  return 'Mercado Livre: ' + (txt || 'erro ' + r.status);
}
async function trocarTokens(params) {
  const r = await fetch(API + '/oauth/token', {
    method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(Object.assign({ client_id: process.env.ML_APP_ID, client_secret: process.env.ML_SECRET }, params)).toString(),
  });
  let j = {};
  try { j = await r.json(); } catch (e) { /* sem JSON */ }
  if (!r.ok || !j.access_token) {
    const caiu = j.error === 'invalid_grant' || r.status === 400 || r.status === 401;
    throw erro(caiu ? 409 : 502, caiu
      ? 'A autorização do Mercado Livre não vale mais' + (j.message ? ` (${j.message})` : '') + '. Toque em Conectar Mercado Livre de novo.'
      : 'Mercado Livre: ' + (j.message || j.error || 'erro ' + r.status));
  }
  return j;
}
// Sessão de quem chamou: lê a conexão, renova o token se estiver no fim e grava o par novo.
async function sessao(corpo) {
  if (!configurado()) throw erro(503, 'Falta configurar o app do Mercado Livre na Vercel (ML_APP_ID e ML_SECRET).');
  const cfg = await lerConfig(corpo.idToken);
  if (!cfg || !cfg.cifra) throw erro(409, 'Conecte o Mercado Livre da loja primeiro (botão Conectar Mercado Livre).');
  const seg = decifrar(cfg.cifra), agora = Date.now();
  if ((seg.x || 0) - agora > 10 * 60000) return { token: seg.a, u: String(seg.u || ''), cifraNova: null };
  if (!seg.r) throw erro(409, 'A conexão com o Mercado Livre venceu (o app não tem acesso offline). Conecte de novo.');
  let novo;
  try { novo = await trocarTokens({ grant_type: 'refresh_token', refresh_token: seg.r }); }
  catch (e) {
    // o refresh token é de uso único: outro acesso pode ter acabado de renovar
    const cfg2 = await lerConfig(corpo.idToken).catch(() => null);
    if (cfg2 && cfg2.cifra && cfg2.cifra !== cfg.cifra) {
      const s2 = decifrar(cfg2.cifra);
      if ((s2.x || 0) - Date.now() > 60000) return { token: s2.a, u: String(s2.u || ''), cifraNova: null };
    }
    throw e;
  }
  const s2 = { a: novo.access_token, r: novo.refresh_token || seg.r, x: agora + (Number(novo.expires_in) || 21600) * 1000, u: String(novo.user_id || seg.u || '') };
  const cifra = cifrar(s2);
  let gravou = false;
  for (let i = 0; i < 3 && !gravou; i++) gravou = await gravarConfig(corpo.idToken, { cifra, renovadoEm: new Date(agora) });
  if (!gravou) console.log('ml: renovou mas não gravou; o sistema grava');
  return { token: s2.a, u: s2.u, cifraNova: gravou ? null : cifra };
}

// ── ATRIBUTOS: o que a ficha do sistema sabe dizer, no formato de cada categoria ──
// f vem do sistema já separado (marca, linha, número do modelo, processador...). Quanto
// mais características, melhor a "qualidade do anúncio" lá. O que não se sabe fica vazio
// (não vai): "Com X" só vai quando a ficha diz (f.tem.x verdadeiro ou falso).
// O modelo alfanumérico não sai da ficha: é o código regulatório (Dell P144G), não o
// número do modelo; ir "3420" ali é característica errada.
function daFicha(f) {
  f = f || {};
  const s = k => String(f[k] == null ? '' : f[k]).trim();
  const tem = f.tem && typeof f.tem === 'object' ? f.tem : {};
  const sn = k => tem[k] === true ? 'Sim' : tem[k] === false ? 'Não' : '';
  const disco = s('disco_tipo'), res = s('resolucao'), m2 = /nvme|m\.?2/i.test(disco);
  return {
    BRAND: s('marca'), LINE: s('linha'), MODEL: s('numero') && s('linha') ? s('numero') : s('modelo'),
    PROCESSOR_BRAND: s('cpu_marca'), PROCESSOR_LINE: s('cpu_linha'), PROCESSOR_MODEL: s('cpu_modelo'),
    // a RAM tem um id em cada categoria (em Notebooks, "capacidade total do módulo")
    RAM_MEMORY: s('ram'), RAM_MEMORY_MODULE_TOTAL_CAPACITY: s('ram'), RAM_MEMORY_TYPE: s('ram_tipo'),
    RAM_SLOTS_NUMBER: s('slots_ram'), MAX_SUPPORTED_RAM_MEMORY_CAPACITY: s('ram_max') ? s('ram_max') + ' GB' : '',
    SSD_DATA_STORAGE_CAPACITY: s('ssd'), HDD_DATA_STORAGE_CAPACITY: s('hd'), HARD_DRIVE_DATA_STORAGE_CAPACITY: s('hd'),
    M2_DATA_STORAGE_CAPACITY: m2 ? s('ssd') : '', SSD_INTERFACE: m2 ? 'PCIe' : /^ssd$/i.test(disco) ? 'SATA 3' : '',
    DISPLAY_SIZE: s('tela') ? s('tela') + ' "' : '',
    DISPLAY_RESOLUTION: /^\d{3,4} x \d{3,4}$/.test(res) ? res.replace(/(\d+) x (\d+)/, '$1 px x $2 px') : '',
    DISPLAY_RESOLUTION_TYPE: res === '1920 x 1080' ? 'Full HD' : res === '1366 x 768' ? 'HD' : '',
    OS_NAME: s('so'), OS_VERSION: s('so_versao'), OS_EDITION: s('so_edicao'),
    INTEGRATED_GRAPHIC_CARD_BRAND: s('video_marca'), INTEGRATED_GRAPHIC_CARD_LINE: s('video_linha'), INTEGRATED_GRAPHIC_CARD_MODEL: s('video_modelo'),
    DEDICATED_GRAPHIC_CARD_BRAND: s('dedicada_marca'), DEDICATED_GRAPHIC_CARD_LINE: s('dedicada_linha'), DEDICATED_GRAPHIC_CARD_MODEL: s('dedicada_modelo'),
    PRODUCT_TYPE: s('tipo_produto'),
    WITH_WI_FI: sn('wifi'), WITH_BLUETOOTH: sn('bluetooth'), WITH_WEBCAM: sn('webcam'), WITH_MICROPHONE: sn('microfone'),
    WITH_HEADPHONES_OUTPUT: sn('fone'), WITH_TOUCH_SCREEN: sn('touch'), WITH_FINGERPRINT_READER: sn('digital'),
    WITH_BACKLIGHT_KEYBOARD: sn('retroiluminado'), WITH_NUMERIC_PAD: sn('numerico'), WITH_MEMORY_CARD_READER: sn('sd'),
    WITH_RETINA_DISPLAY: s('marca') && !/apple/i.test(s('marca')) ? 'Não' : '',
    KEYBOARD_LANGUAGE: s('teclado'), COLOR: s('cor'), MAIN_COLOR: s('cor'),
    MAX_BATTERY_LIFE: s('bateria_h') ? s('bateria_h') + ' h' : '',
    SELLER_SKU: s('sku'),
    // homologação da Anatel (é por modelo; o sistema manda só os números)
    ANATEL_HOMOLOGATION_NUMBER: /^\d{8,14}$/.test(s('anatel')) ? s('anatel') : '',
    ITEM_CONDITION: 'Usado',
  };
}
// Quando o id do atributo é outro, o nome dele costuma ser o mesmo.
const PELO_NOME = [
  [/^marca$/, 'BRAND'], [/^linha$/, 'LINE'], [/^modelo$/, 'MODEL'], [/^modelo alfanumerico$/, 'ALPHANUMERIC_MODEL'],
  [/^marca do processador$/, 'PROCESSOR_BRAND'], [/^linha do processador$/, 'PROCESSOR_LINE'], [/^modelo do processador$/, 'PROCESSOR_MODEL'],
  [/^(capacidade (da |de )?)?memoria ram$/, 'RAM_MEMORY'], [/^tipo de memoria ram$/, 'RAM_MEMORY_TYPE'],
  [/^capacidade (de armazenamento )?(do |de )?ssd$/, 'SSD_DATA_STORAGE_CAPACITY'],
  [/^capacidade (de armazenamento )?(do |de )?(hd|disco rigido)$/, 'HDD_DATA_STORAGE_CAPACITY'],
  [/^tamanho da tela$/, 'DISPLAY_SIZE'], [/^condicao do item$/, 'ITEM_CONDITION'], [/^(nome do )?sistema operacional$/, 'OS_NAME'],
];
const PACOTE = { SELLER_PACKAGE_HEIGHT: ['alt', 'cm'], SELLER_PACKAGE_WIDTH: ['larg', 'cm'], SELLER_PACKAGE_LENGTH: ['comp', 'cm'], SELLER_PACKAGE_WEIGHT: ['peso', 'g'] };
const obrigatorio = a => !!(a.tags && a.tags.required);
const somenteLeitura = a => !!(a.tags && (a.tags.read_only || a.tags.fixed || a.tags.inferred));
function infoAtributo(a) {
  return { id: a.id, nome: a.name || a.id, tipo: a.value_type || 'string',
    unidades: (a.allowed_units || []).map(u => u.name || u.id).filter(Boolean).slice(0, 8),
    valores: (Array.isArray(a.values) ? a.values : []).slice(0, 500).map(v => ({ id: String(v.id), nome: v.name })),
    dica: String(a.hint || a.tooltip || '').slice(0, 200) };
}
// Um valor no formato que o atributo pede (lista, número com unidade, sim/não, texto).
function formatar(a, valor) {
  if (valor && typeof valor === 'object') {
    if (valor.value_id) return { id: a.id, value_id: String(valor.value_id), value_name: valor.value_name || undefined };
    valor = valor.value_name;
  }
  if (valor === undefined || valor === null || String(valor).trim() === '') return null;
  valor = String(valor).replace(/\s+/g, ' ').trim();
  const valores = Array.isArray(a.values) ? a.values : [];
  const tipo = a.value_type || 'string';
  if (tipo === 'boolean') {
    const sim = /^(s|sim|y|yes|true|1)$/i.test(valor);
    const v = valores.find(x => norm(x.name) === (sim ? 'sim' : 'nao'));
    return v ? { id: a.id, value_id: String(v.id), value_name: v.name } : { id: a.id, value_name: sim ? 'Sim' : 'Não' };
  }
  if (tipo === 'number_unit') {
    const m = valor.match(/^(\d+(?:[.,]\d+)?)\s*(.*)$/); if (!m) return null;
    const n = m[1].replace(',', '.'), u = m[2].trim();
    const unidades = (a.allowed_units || []).map(x => x.id || x.name).filter(Boolean);
    const und = unidades.find(x => norm(x) === norm(u))
      || (/^("|”|pol|polegadas?|in)$/i.test(u) ? unidades.find(x => /"|”|pol|^in/i.test(x)) : null)
      || (u ? null : a.default_unit) || unidades.find(x => norm(x) === norm(a.default_unit)) || u || a.default_unit || '';
    return { id: a.id, value_name: (n + ' ' + und).trim() };
  }
  if (tipo === 'number') { const m = valor.match(/\d+(?:[.,]\d+)?/); return m ? { id: a.id, value_name: m[0].replace(',', '.') } : null; }
  if (tipo === 'list' && valores.length) {
    // igual; senão o código no fim da opção ("10110U" é a opção "i3-10110U")
    const so = x => norm(x).replace(/[^a-z0-9]/g, ''), alvo = so(valor);
    const v = valores.find(x => norm(x.name) === norm(valor)) || (alvo.length >= 4 ? valores.find(x => so(x.name).endsWith(alvo)) : null);
    if (v) return { id: a.id, value_id: String(v.id), value_name: v.name };
  }
  // texto livre com sugestões: igual a uma delas, vai a dela (o Mercado Livre reconhece o valor)
  const igual = tipo === 'string' && valores.find(x => norm(x.name) === norm(valor));
  if (igual) return { id: a.id, value_id: String(igual.id), value_name: igual.name };
  return { id: a.id, value_name: valor.slice(0, 255) };
}
// Monta os atributos do anúncio com o que se sabe: o que ele preencheu à mão (manual)
// manda, depois a ficha; o que a categoria exige e ninguém sabe vai em "faltam".
function montarAtributos(lista, ficha, manual, op) {
  op = op || {}; manual = manual || {};
  const base = daFicha(ficha), atributos = [], faltam = [], doSistema = new Set();
  const ids = new Set((lista || []).map(a => a.id));
  for (const a of lista || []) {
    if (!a || !a.id || somenteLeitura(a)) continue;
    let valor = manual[a.id];
    if (valor === undefined || valor === '') {
      let chaveF = Object.prototype.hasOwnProperty.call(base, a.id) ? a.id : null;
      if (!chaveF) { const p = PELO_NOME.find(([re]) => re.test(norm(a.name))); chaveF = p ? p[1] : null; }
      if (chaveF) { valor = base[chaveF]; if (valor) doSistema.add(a.id); }
      if (PACOTE[a.id] && op.pacote) {
        const [k, und] = PACOTE[a.id], n = Number(op.pacote[k]);
        if (n > 0) { valor = (und === 'g' ? Math.round(n * 1000) : Math.round(n)) + ' ' + und; doSistema.add(a.id); }
      }
    }
    if (a.id === 'GTIN' && !manual.GTIN && ids.has('EMPTY_GTIN_REASON')) continue; // notebook usado: sem código de barras
    if (a.id === 'EMPTY_GTIN_REASON' && !manual.GTIN && !manual.EMPTY_GTIN_REASON) {
      const vs = Array.isArray(a.values) ? a.values : [];
      const v = vs.find(x => /nao (tem|possui)|sem codigo|nao (foi )?cadastrad/.test(norm(x.name))) || vs[0];
      if (v) { atributos.push({ id: a.id, value_id: String(v.id), value_name: v.name }); doSistema.add(a.id); }
      continue;
    }
    const f = formatar(a, valor);
    if (f) atributos.push(f);
    else if (obrigatorio(a)) faltam.push(infoAtributo(a));
  }
  return { atributos, faltam, doSistema };
}
// "The attributes [BRAND, MODEL] are required..." → ['BRAND','MODEL']
function idsDosErros(erros) {
  const ids = new Set();
  for (const e of erros || []) {
    const txt = String((e && e.message) || '') + ' ' + JSON.stringify((e && e.references) || '');
    for (const m of txt.matchAll(/\[([A-Z][A-Z0-9_]+(?:\s*,\s*[A-Z][A-Z0-9_]+)*)\]/g)) m[1].split(',').forEach(x => ids.add(x.trim()));
  }
  return [...ids];
}
// As causas que o Mercado Livre mandou (lista, ou uma só).
const causasDe = j => (Array.isArray(j && j.cause) ? j.cause : j && j.cause && typeof j.cause === 'object' ? [j.cause] : []).filter(c => c && typeof c === 'object');
// O que foi mandado, para o log: sem descrição e sem nada de cliente (só o anúncio).
const resumoItem = item => JSON.stringify({ cat: item.category_id, tipo: item.listing_type_id, titulo: item.title || item.family_name, preco: item.price,
  fotos: (item.pictures || []).length, frete: item.shipping, garantia: (item.sale_terms || []).map(t => t.id + '=' + t.value_name),
  atributos: (item.attributes || []).map(a => a.id + '=' + (a.value_name || a.value_id)) }).slice(0, 1500);
// O que uma recusa diz. Com erro, os erros. Só com advertência: na validação, ela não
// impede (a validação devolve 400 mesmo assim, como no "User has not mode me1" de quem
// não usa o Mercado Envios 1), então quem decide é a criação; na criação que falhou, a
// advertência é o motivo. Sem nada: "vago" (quem decide também é a criação).
function lerRecusa(r, criacao) {
  const causas = causasDe(r.j), erros = causas.filter(c => c.type !== 'warning');
  const avisos = causas.filter(c => c.type === 'warning').map(c => c.message || c.code).filter(Boolean);
  if (erros.length) return { erros, avisos, vago: false };
  if (causas.length && criacao) return { erros: causas, avisos: [], vago: false };
  return { erros: [{ code: r.j.error || 'erro', message: [r.j.message || traduzir(r), ...avisos].join(' · ') }], avisos, vago: true };
}
async function validar(item, token) {
  const r = await ml('POST', '/items/validate', { token, corpo: item });
  if (r.ok) return { erros: [], avisos: [], vago: false };
  // fora do ar, sem permissão, conexão vencida: não é o anúncio, é a chamada
  if (r.status !== 400 && r.status !== 422) throw erro(502, traduzir(r));
  // a resposta inteira vai para o log: é por ela que se acha o motivo quando a mensagem é vaga
  console.log('ml validar', r.status, JSON.stringify(r.j).slice(0, 1500));
  return lerRecusa(r);
}
const txtErros = es => es.map(e => [e.code, e.message].filter(Boolean).join(': ')).join(' | ');
// Erro por erro: o atributo que faltou (não foi no anúncio) e o que foi e o Mercado Livre
// recusou. Mensagem de "obrigatório" cita os que faltam; os que foram, ali, são só contexto.
function lerErros(erros, item, porId) {
  const semValor = new Set(), recusou = new Set();
  for (const e of erros) {
    const pede = /missing|required|obrigat/i.test(String(e.code || '') + ' ' + String(e.message || ''));
    for (const id of idsDosErros([e])) {
      if (!porId.has(id)) continue;
      const foi = item.attributes.some(a => a.id === id);
      if (pede && !foi) semValor.add(id); else if (!pede && foi) recusou.add(id);
    }
  }
  return { semValor: [...semValor], recusou: [...recusou] };
}

// ── AÇÕES ──
async function conectar(corpo) {
  if (!configurado()) throw erro(503, 'Falta configurar o app do Mercado Livre na Vercel (ML_APP_ID e ML_SECRET).');
  await lerConfig(corpo.idToken); // só sócio
  const st = novoEstado(Date.now());
  const u = new URL(AUTORIZAR);
  u.search = new URLSearchParams({ response_type: 'code', client_id: process.env.ML_APP_ID, redirect_uri: VOLTA, state: st,
    code_challenge: desafio(verificador(st)), code_challenge_method: 'S256' }).toString();
  return { url: u.toString() };
}
async function voltaDoLogin(q, res) {
  const ir = hash => { res.statusCode = 302; res.setHeader('Location', `${N.SITE}/#${hash}`); res.setHeader('Cache-Control', 'no-store'); res.end(); };
  const falhou = msg => ir('ml_erro=' + encodeURIComponent(msg));
  if (q.error || !q.code) return falhou(String(q.error_description || q.error || 'a autorização foi cancelada'));
  if (!configurado()) return falhou('falta configurar o app do Mercado Livre na Vercel');
  if (!estadoValido(q.state, Date.now())) return falhou('a autorização demorou demais ou não começou pelo sistema; tente de novo');
  try {
    const params = { grant_type: 'authorization_code', code: String(q.code), redirect_uri: VOLTA };
    let t;
    try { t = await trocarTokens(Object.assign({ code_verifier: verificador(String(q.state)) }, params)); }
    catch (e) {
      // app criado sem PKCE que não aceite o verificador: tenta sem ele
      if (!/verifier|pkce|challenge/i.test(e.message)) throw e;
      t = await trocarTokens(params);
    }
    const eu = await ml('GET', '/users/me', { token: t.access_token });
    const agora = Date.now(), u = String(t.user_id || eu.j.id || '');
    const cifra = cifrar({ a: t.access_token, r: t.refresh_token || '', x: agora + (Number(t.expires_in) || 21600) * 1000, u });
    console.log(`ml conectado ${eu.j.nickname || u}${t.refresh_token ? '' : ' (sem offline_access)'}`);
    return ir(`ml=${cifra}&ml_user=${encodeURIComponent(eu.j.nickname || '')}&ml_id=${encodeURIComponent(u)}&ml_offline=${t.refresh_token ? 1 : 0}`);
  } catch (e) {
    return falhou(e.message);
  }
}
async function foto(corpo) {
  const s = await sessao(corpo);
  const b64 = String(corpo.jpg || '');
  if (!b64 || b64.length > 6e6) throw erro(400, 'Foto inválida (grande demais ou vazia).');
  const buf = Buffer.from(b64, 'base64');
  if (buf.length < 1000 || buf[0] !== 0xFF || buf[1] !== 0xD8) throw erro(400, 'A foto precisa ser JPEG.');
  const fd = new FormData();
  fd.append('file', new Blob([buf], { type: 'image/jpeg' }), 'foto.jpg');
  const r = await ml('POST', '/pictures/items/upload', { token: s.token, form: fd });
  if (!r.ok || !r.j.id) throw erro(502, traduzir(r));
  return { ok: true, id: String(r.j.id), cifraNova: s.cifraNova };
}
function limparTitulo(t) {
  let s = String(t || '').replace(/[^\p{L}\p{N}\s.,+\-\/"()ªº°]/gu, ' ').replace(/\s+/g, ' ').trim();
  if (s.length > 60) { s = s.slice(0, 60); const k = s.lastIndexOf(' '); if (k > 40) s = s.slice(0, k); s = s.trim(); }
  return s;
}
async function publicar(corpo) {
  const s = await sessao(corpo);
  const it = corpo.item || {};
  const titulo = limparTitulo(it.titulo);
  const preco = Math.round(Number(it.preco));
  const fotos = (Array.isArray(it.fotos) ? it.fotos : []).map(String).filter(id => /^[\w-]{4,100}$/.test(id)).slice(0, 12);
  if (titulo.length < 10) throw erro(400, 'O título do anúncio ficou curto demais.');
  if (!(preco >= 10 && preco <= 1e6)) throw erro(400, 'Preço inválido para o Mercado Livre.');
  if (!fotos.length) throw erro(400, 'O Mercado Livre exige pelo menos uma foto da máquina.');
  const tipo = it.tipo === 'gold_pro' ? 'gold_pro' : 'gold_special';
  const garantia = Math.max(0, Math.min(365, Math.round(Number(it.garantia_dias == null ? 90 : it.garantia_dias)) || 0));
  // 1) categoria: a que o próprio Mercado Livre sugere para o título
  let cat = /^MLB\d+$/.test(String(it.categoria || '')) ? String(it.categoria) : '', catNome = '';
  if (!cat) {
    const d = await ml('GET', '/sites/MLB/domain_discovery/search', { token: s.token, query: { limit: 1, q: titulo } });
    const top = Array.isArray(d.j) ? d.j[0] : null;
    if (top && /^MLB\d+$/.test(String(top.category_id || ''))) { cat = top.category_id; catNome = top.category_name || ''; }
  }
  if (!cat) cat = CAT_PADRAO;
  // 2) o que a categoria pede
  const ra = await ml('GET', `/categories/${cat}/attributes`, { token: s.token });
  if (!ra.ok || !Array.isArray(ra.j)) throw erro(502, traduzir(ra));
  const lista = ra.j, porId = new Map(lista.map(a => [a.id, a]));
  const manual = it.atributos && typeof it.atributos === 'object' ? it.atributos : {};
  const m = montarAtributos(lista, { ...(it.ficha || {}), sku: it.sku ? String(it.sku).slice(0, 60) : '' }, manual, { pacote: it.pacote });
  console.log('ml atributos sem valor em', cat, lista.filter(a => a && a.id && !somenteLeitura(a) && !m.atributos.some(x => x.id === a.id))
    .map(a => a.id + (obrigatorio(a) ? '*' : '') + ':' + (a.name || '') + ':' + (a.value_type || '')).join(', ').slice(0, 1800));
  if (m.faltam.length) return { ok: false, faltam: m.faltam, categoria: { id: cat, nome: catNome }, cifraNova: s.cifraNova };
  // 3) o anúncio, validado antes de criar: o Mercado Livre diz o que falta sem publicar nada
  const item = {
    title: titulo, category_id: cat, price: preco, currency_id: 'BRL', available_quantity: 1, buying_mode: 'buy_it_now',
    condition: 'used', listing_type_id: tipo, pictures: fotos.map(id => ({ id })), attributes: m.atributos,
    sale_terms: garantia ? [{ id: 'WARRANTY_TYPE', value_name: 'Garantia do vendedor' }, { id: 'WARRANTY_TIME', value_name: garantia + ' dias' }]
                         : [{ id: 'WARRANTY_TYPE', value_name: 'Sem garantia' }],
    shipping: { mode: 'me2', local_pick_up: it.retirada !== false, free_shipping: it.frete_gratis === true },
    description: { plain_text: String(it.descricao || '').slice(0, 5000) },
  };
  if (it.sku) item.seller_custom_field = String(it.sku).slice(0, 60);
  const avisos = [];
  const motivo = es => es.map(e => e.message || e.code).filter(Boolean).join(' · ');
  // cria: { r } quando saiu; senão a recusa lida, que segue o mesmo caminho da validação
  const criar = async () => {
    const r = await ml('POST', '/items', { token: s.token, corpo: item });
    if (r.ok && r.j.id) return { r };
    console.log('ml publicar: POST /items', r.status, JSON.stringify(r.j).slice(0, 1500), '|', resumoItem(item));
    if (r.status !== 400 && r.status !== 422) throw erro(502, traduzir(r));
    return { v: lerRecusa(r, true) };
  };
  let v = await validar(item, s.token), feito = null;
  for (let volta = 0; volta < 5 && !feito; volta++) {
    if (!v.erros.length || v.vago) {
      // validou; ou a validação recusou sem erro (só advertência, ou nada): cria (ou sai, ou a criação diz o que é)
      if (v.vago) console.log('ml publicar: a validação não trouxe erro em', cat, '; criando |', resumoItem(item));
      else avisos.push(...v.avisos);
      const c = await criar();
      if (c.r) { feito = c.r; break; }
      v = c.v;
      if (v.vago) break;
    }
    const txt = txtErros(v.erros);
    let mudou = false;
    // categorias de "produto de usuário" pedem family_name no lugar do título
    if (/family_name/i.test(txt) && item.title) { item.family_name = item.title; delete item.title; mudou = true; }
    // frete grátis obrigatório (o Mercado Livre cobra parte do frete do vendedor)
    if (/free_shipping|frete gr[aá]tis/i.test(txt) && !item.shipping.free_shipping) {
      item.shipping.free_shipping = true; mudou = true;
      avisos.push('Frete grátis é obrigatório para este anúncio: o Mercado Livre desconta parte do frete na venda.');
    }
    const { semValor, recusou } = lerErros(v.erros, item, porId);
    // atributo que o sistema preencheu sozinho e o Mercado Livre recusou: sai, se não for obrigatório
    const tirar = recusou.filter(id => m.doSistema.has(id) && (manual[id] === undefined || manual[id] === '') && !obrigatorio(porId.get(id) || {}));
    if (tirar.length) { item.attributes = item.attributes.filter(a => !tirar.includes(a.id)); mudou = true; }
    // o que falta, e a resposta que o Mercado Livre não aceitou: pergunta para ele (com o motivo)
    const perguntar = [...semValor, ...recusou.filter(id => !tirar.includes(id))];
    if (perguntar.length) {
      console.log('ml publicar: pergunta', perguntar.join(','), 'em', cat, '|', txt.slice(0, 600));
      return { ok: false, faltam: perguntar.map(id => infoAtributo(porId.get(id))), categoria: { id: cat, nome: catNome },
        motivo: recusou.length > tirar.length ? motivo(v.erros).slice(0, 500) : '', cifraNova: s.cifraNova };
    }
    if (!mudou) break;
    v = await validar(item, s.token);
  }
  if (!feito && !v.erros.length) { const c = await criar(); if (c.r) feito = c.r; else v = c.v; }
  if (!feito) {
    console.log('ml publicar: recusado em', cat, txtErros(v.erros).slice(0, 900), '|', resumoItem(item));
    throw erro(422, 'O Mercado Livre recusou o anúncio: ' + motivo(v.erros)
      + (v.vago ? ' (o Mercado Livre não disse o motivo; confira a conta: endereço, Mercado Envios e limite de anúncios)' : ''));
  }
  const r = feito;
  console.log(`ml publicou ${r.j.id} (${cat}, ${tipo}) ${r.j.status || ''} condição=${r.j.condition || '?'} sub=${JSON.stringify(r.j.sub_status || [])}`,
    'título:', r.j.title || '', '| avisos:', JSON.stringify(r.j.warnings || []).slice(0, 600));
  // a loja só vende usado: se o Mercado Livre puser como novo, corrige na hora
  if (r.j.condition && r.j.condition !== 'used') {
    const c = await usado(r.j.id, s.token, porId);
    if (!c) avisos.push('O Mercado Livre pôs o anúncio como Novo e não deixou mudar: troque para Usado no próprio Mercado Livre.');
  }
  return { ok: true, id: r.j.id, link: r.j.permalink || '', status: r.j.status || 'active', preco: r.j.price || preco, tipo,
    frete_gratis: !!((r.j.shipping && r.j.shipping.free_shipping) || item.shipping.free_shipping),
    categoria: { id: cat, nome: catNome }, avisos, cifraNova: s.cifraNova };
}
async function atualizar(corpo) {
  const s = await sessao(corpo);
  const id = String(corpo.id || '');
  if (!ID_ITEM.test(id)) throw erro(400, 'Anúncio do Mercado Livre inválido.');
  const mud = {};
  if (corpo.preco !== undefined && corpo.preco !== null) {
    const p = Math.round(Number(corpo.preco)); if (!(p >= 10 && p <= 1e6)) throw erro(400, 'Preço inválido.');
    mud.price = p;
  }
  if (corpo.status) {
    if (!['active', 'paused', 'closed'].includes(corpo.status)) throw erro(400, 'Situação inválida.');
    mud.status = corpo.status;
  }
  if (corpo.tipo !== undefined && !['gold_special', 'gold_pro'].includes(corpo.tipo)) throw erro(400, 'Tipo de anúncio inválido.');
  const frete = typeof corpo.frete_gratis === 'boolean';
  if (!Object.keys(mud).length && !corpo.tipo && !frete) throw erro(400, 'Nada para mudar.');
  const out = { ok: true, cifraNova: s.cifraNova };
  // tipo (Clássico/Premium): rota própria do Mercado Livre
  if (corpo.tipo) {
    const t = await ml('POST', `/items/${id}/listing_type`, { token: s.token, corpo: { id: corpo.tipo } });
    console.log('ml tipo', id, corpo.tipo, t.status, t.ok ? '' : JSON.stringify(t.j).slice(0, 400));
    if (!t.ok) throw erro(502, traduzir(t));
    out.tipo = t.j.listing_type_id || corpo.tipo;
  }
  // frete grátis: no envio (mantém o Mercado Envios e a retirada como estão nas opções)
  if (frete) {
    const f = await ml('PUT', `/items/${id}`, { token: s.token, corpo: { shipping: { mode: 'me2', free_shipping: corpo.frete_gratis, local_pick_up: corpo.retirada !== false } } });
    console.log('ml frete', id, corpo.frete_gratis, f.status, f.ok ? '' : JSON.stringify(f.j).slice(0, 400));
    if (!f.ok) throw erro(502, traduzir(f));
    out.frete_gratis = f.j.shipping ? !!f.j.shipping.free_shipping : corpo.frete_gratis;
  }
  if (!Object.keys(mud).length) return out;
  const r = await ml('PUT', `/items/${id}`, { token: s.token, corpo: mud });
  if (!r.ok) {
    // já encerrado lá (vendido ou fechado à mão): para o sistema, é o que importa saber
    if ((r.status === 400 || r.status === 409) && /closed|finaliz|encerrad/i.test(JSON.stringify(r.j))) return { ok: true, status: 'closed', jaEstava: true, cifraNova: s.cifraNova };
    console.log('ml atualizar', id, r.status, JSON.stringify(r.j).slice(0, 400));
    throw erro(502, traduzir(r));
  }
  return { ok: true, status: r.j.status || mud.status || '', preco: r.j.price !== undefined ? r.j.price : mud.price, cifraNova: s.cifraNova };
}
async function itens(corpo) {
  const s = await sessao(corpo);
  const ids = [...new Set((Array.isArray(corpo.ids) ? corpo.ids : []).map(String).filter(id => ID_ITEM.test(id)))].slice(0, 20);
  if (!ids.length) return { ok: true, itens: [], cifraNova: s.cifraNova };
  const r = await ml('GET', '/items', { token: s.token, query: { ids: ids.join(','), attributes: 'id,status,sub_status,price,permalink,sold_quantity,condition' } });
  if (!r.ok) throw erro(502, traduzir(r));
  const lista = (Array.isArray(r.j) ? r.j : []).filter(x => x && x.code === 200 && x.body).map(x => ({
    id: x.body.id, status: x.body.status || '', sub: x.body.sub_status || [], preco: x.body.price, link: x.body.permalink || '', vendidos: x.body.sold_quantity || 0,
    condicao: x.body.condition || '' }));
  return { ok: true, itens: lista, cifraNova: s.cifraNova };
}
// Põe o anúncio como usado: pelo campo da condição; se não der, pelo atributo "Condição do item".
async function usado(id, token, porId) {
  const r = await ml('PUT', `/items/${id}`, { token, corpo: { condition: 'used' } });
  console.log('ml condição -> usado', id, r.status, r.ok ? (r.j.condition || '') : JSON.stringify(r.j).slice(0, 500));
  if (r.ok && (!r.j.condition || r.j.condition === 'used')) return true;
  const a = porId && porId.get('ITEM_CONDITION'), f = a ? formatar(a, 'Usado') : { id: 'ITEM_CONDITION', value_name: 'Usado' };
  const r2 = await ml('PUT', `/items/${id}`, { token, corpo: { attributes: [f] } });
  console.log('ml condição (atributo) -> usado', id, r2.status, r2.ok ? (r2.j.condition || '') : JSON.stringify(r2.j).slice(0, 500));
  return r2.ok && (!r2.j.condition || r2.j.condition === 'used');
}
// O anúncio que já está lá ganha as características que a ficha sabe e ele ainda não tem
// (as que ele tem não mudam), e a condição volta para usado se o Mercado Livre trocou.
async function completar(corpo) {
  const s = await sessao(corpo);
  const id = String(corpo.id || '');
  if (!ID_ITEM.test(id)) throw erro(400, 'Anúncio do Mercado Livre inválido.');
  const g = await ml('GET', `/items/${id}`, { token: s.token });
  if (!g.ok || !g.j.id) throw erro(502, traduzir(g));
  const cat = String(g.j.category_id || '');
  const ra = await ml('GET', `/categories/${cat}/attributes`, { token: s.token });
  if (!ra.ok || !Array.isArray(ra.j)) throw erro(502, traduzir(ra));
  const lista = ra.j, porId = new Map(lista.map(a => [a.id, a]));
  const manual = corpo.atributos && typeof corpo.atributos === 'object' ? corpo.atributos : {};
  const m = montarAtributos(lista, { ...(corpo.ficha || {}), sku: corpo.sku ? String(corpo.sku).slice(0, 60) : '' }, manual, { pacote: corpo.pacote });
  const ja = new Set((g.j.attributes || []).filter(a => a && (a.value_id || a.value_name)).map(a => a.id));
  // os da embalagem e o motivo sem código de barras não mudam depois de publicado
  let novos = m.atributos.filter(a => !ja.has(a.id) && !/^SELLER_PACKAGE_|^EMPTY_GTIN_REASON$|^ITEM_CONDITION$/.test(a.id));
  const antes = g.j.condition || '';
  console.log('ml completar', id, cat, 'condição=' + antes, 'tem', ja.size, 'novos:', novos.map(a => a.id).join(','));
  const recusados = [];
  for (let volta = 0; novos.length && volta < 4; volta++) {
    const r = await ml('PUT', `/items/${id}`, { token: s.token, corpo: { attributes: novos } });
    if (r.ok) break;
    console.log('ml completar: recusou', id, r.status, JSON.stringify(r.j).slice(0, 900));
    if (r.status !== 400 && r.status !== 422) throw erro(502, traduzir(r));
    // tira os que o Mercado Livre apontou; sem apontar nenhum, para (não insiste às cegas)
    const fora = idsDosErros(causasDe(r.j).length ? causasDe(r.j) : [{ message: r.j.message || '' }]).filter(x => novos.some(a => a.id === x));
    if (!fora.length) { recusados.push(...novos.map(a => a.id)); novos = []; break; }
    recusados.push(...fora); novos = novos.filter(a => !fora.includes(a.id));
  }
  const condicao = antes && antes !== 'used' && !(g.j.sold_quantity > 0) ? ((await usado(id, s.token, porId)) ? 'used' : antes) : antes;
  return { ok: true, adicionados: novos.map(a => a.id), recusados, condicao, cifraNova: s.cifraNova };
}
async function novidades(corpo) {
  const s = await sessao(corpo);
  let desde = new Date(corpo.desde || Date.now() - 30 * DIA);
  if (isNaN(desde) || Date.now() - desde > 90 * DIA) desde = new Date(Date.now() - 30 * DIA);
  const r = await ml('GET', '/orders/search', { token: s.token, query: { seller: s.u, 'order.date_created.from': desde.toISOString().replace('Z', '-00:00'), sort: 'date_desc', limit: 50 } });
  if (!r.ok) throw erro(502, traduzir(r));
  // só o que o sistema precisa para avisar da venda (nada de endereço ou documento do comprador)
  const pedidos = (Array.isArray(r.j.results) ? r.j.results : []).flatMap(o => (o.order_items || []).map(oi => ({
    pedido: String(o.id), status: o.status || '', em: o.date_created || '', item: (oi.item && oi.item.id) || '', titulo: (oi.item && oi.item.title) || '',
    qtd: oi.quantity || 1, valor: oi.unit_price || 0, comprador: (o.buyer && o.buyer.nickname) || '' })));
  let perguntas = null;
  try {
    const q = await ml('GET', '/questions/search', { token: s.token, query: { seller_id: s.u, status: 'UNANSWERED', api_version: 4, limit: 1 } });
    if (q.ok) perguntas = Number(q.j.total) || 0;
  } catch (e) { /* perguntas são bônus */ }
  return { ok: true, pedidos, perguntas, cifraNova: s.cifraNova };
}

function json(res, status, obj) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(obj));
}
async function lerCorpo(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch (e) { return {}; } }
  let txt = '';
  for await (const parte of req) { txt += parte; if (txt.length > 6.5e6) break; } // uma foto por vez
  try { return JSON.parse(txt || '{}'); } catch (e) { return {}; }
}

module.exports = async (req, res) => {
  const q = req.query || Object.fromEntries(new URL(req.url, 'http://x').searchParams);
  try {
    if (req.method === 'GET') {
      if (q.code || q.error || q.state) return await voltaDoLogin(q, res);
      return json(res, 200, { ok: true, configurado: configurado(), volta: VOLTA });
    }
    if (req.method !== 'POST') return json(res, 405, { erro: 'Use GET ou POST.' });
    const corpo = await lerCorpo(req);
    // aviso do próprio Mercado Livre (pedido, pergunta, anúncio): o sistema busca as novidades quando abre
    if (!corpo.acao && (corpo.topic || corpo.resource)) return json(res, 200, { ok: true });
    if (corpo.acao === 'conectar') return json(res, 200, await conectar(corpo));
    if (corpo.acao === 'foto') return json(res, 200, await foto(corpo));
    if (corpo.acao === 'publicar') return json(res, 200, await publicar(corpo));
    if (corpo.acao === 'atualizar') return json(res, 200, await atualizar(corpo));
    if (corpo.acao === 'itens') return json(res, 200, await itens(corpo));
    if (corpo.acao === 'completar') return json(res, 200, await completar(corpo));
    if (corpo.acao === 'novidades') return json(res, 200, await novidades(corpo));
    return json(res, 400, { erro: 'Ação desconhecida.' });
  } catch (e) {
    console.log('ml erro', e.status || 500, e.message);
    return json(res, e.status || 500, { erro: e.message || 'Erro inesperado.' });
  }
};
module.exports._teste = { cifrar, decifrar, novoEstado, estadoValido, verificador, desafio, montarAtributos, formatar, idsDosErros, limparTitulo, daFicha, infoAtributo, VOLTA };
