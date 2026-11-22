// /api/insta: liga o sistema ao Instagram da loja pela API oficial da Meta
// (Instagram API com login do Instagram, graph.instagram.com). Só sócio usa: toda
// chamada traz o idToken do Firebase de quem está logado, e quem decide se é sócio
// são as regras do Firestore (o servidor lê config/instagram com esse token; quem
// não é sócio leva 403 de lá).
//
//   GET  /api/insta                          → { configurado } (a Vercel já tem o app da Meta?)
//   POST { acao: 'conectar', idToken }       → { url } do login do Instagram
//   GET  ?code=…&state=…  (volta do login)   → troca o código por um token de 60 dias e volta
//                                              para o sistema com ele CIFRADO em /#insta=…
//   POST { acao: 'publicar', idToken, imagens, legenda, tipo } → { ok, id, link }
//   POST { acao: 'renovar', idToken }        → renova o token (a Meta deixa depois de 24 h)
//   GET  /insta/img/<id>.jpg                 → a arte temporária (catalogo_fotos/insta_<id>),
//                                              que a Meta baixa na hora de publicar
//
// VÍDEO (Reels e story), do jeito que saiu da câmera. As funções da Vercel recebem no
// máximo 4,5 MB, então o arquivo vai do navegador direto para o Vercel Blob (a loja
// "anuncia-videos", pasta insta-video/), com um token de envio que só este servidor assina
// e só para sócio; a Meta baixa de lá e o arquivo é apagado ao terminar.
//   POST { type: 'blob.generate-client-token', payload } → o token do envio (é o upload()
//        do @vercel/blob que chama; o idToken vai no clientPayload)
//   POST { acao: 'video_checar', idToken }    → antes de enviar: sócio, Instagram e Blob ligados?
//   POST { acao: 'video', idToken, url, legenda, reels, story, capa } → { ids } dos contêineres
//   POST { acao: 'video_status', idToken, ids }  → { situacao: { id: { status, erro } } }
//   POST { acao: 'video_publicar', idToken, id } → { ok, id, link }
//   POST { acao: 'video_apagar', idToken, url }  → apaga o arquivo do Blob
// Na Vercel: BLOB_READ_WRITE_TOKEN (criado ao ligar a loja de arquivos ao projeto).
//
// O token nunca fica legível fora daqui: o sistema guarda só a cifra (AES-256-GCM, com
// chave tirada do IG_APP_SECRET, que só existe na Vercel). Na Vercel: IG_APP_ID e
// IG_APP_SECRET (do produto Instagram no Meta for Developers) e, se um dia precisar,
// IG_VERSAO (versão da API, padrão abaixo).
//
// MODO TOKEN (o que vale para apps novos da Meta, com o "login unificado"): um token de
// usuário do sistema, gerado nas Configurações do portfólio empresarial, na variável
// IG_TOKEN da Vercel. Não vence, não precisa de login nem de cifra: com ele, o GET diz
// se o token funciona e de qual conta é, e o publicar usa graph.facebook.com na conta
// IG_USER_ID (padrão: a @tech.campinas, no portfólio da Tech Campinas).
const crypto = require('crypto');
const N = require('../tela/nucleo.js');

const VERSAO = () => process.env.IG_VERSAO || 'v23.0';
const GRAPH = 'https://graph.instagram.com';
const GRAPH_FB = 'https://graph.facebook.com';
const IG_ID_PADRAO = '17841430007598170'; // @tech.campinas (Configurações da Tech Campinas → Contas do Instagram)
const tokenFixo = () => String(process.env.IG_TOKEN || '').trim();
// token do login do Instagram começa com IG; o de usuário do sistema (Facebook), com EAA
const hostDe = t => /^IG/.test(t) ? GRAPH : GRAPH_FB;
const VOLTA = `${N.SITE}/api/insta`; // igual ao "OAuth redirect URI" cadastrado no app da Meta
const ESCOPOS = 'instagram_business_basic,instagram_business_content_publish';
const DIA = 86400000;
const ID_IMG = /^[a-f0-9]{32,64}$/;

const erro = (status, msg) => Object.assign(new Error(msg), { status });
const espera = ms => new Promise(r => setTimeout(r, ms));
const configurado = () => !!(process.env.IG_APP_ID && process.env.IG_APP_SECRET);

// ── CIFRA DO TOKEN ──
function chave() {
  if (!configurado()) throw erro(503, 'Falta configurar o app da Meta na Vercel (IG_APP_ID e IG_APP_SECRET).');
  return crypto.createHash('sha256').update('anuncia/instagram/' + process.env.IG_APP_SECRET).digest();
}
function cifrar(obj) {
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', chave(), iv);
  const dados = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), dados]).toString('base64url');
}
function decifrar(txt) {
  const b = Buffer.from(String(txt || ''), 'base64url');
  if (b.length < 29) throw erro(409, 'O Instagram da loja não está conectado.');
  try {
    const d = crypto.createDecipheriv('aes-256-gcm', chave(), b.subarray(0, 12));
    d.setAuthTag(b.subarray(12, 28));
    return JSON.parse(Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8'));
  } catch (e) {
    throw erro(409, 'A conexão com o Instagram não vale mais (o segredo do app mudou). Conecte de novo.');
  }
}

// ── "STATE" DO LOGIN: assinado, vale 15 minutos ──
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

// ── FIRESTORE COM O TOKEN DE QUEM ESTÁ LOGADO (as regras decidem) ──
async function lerConfig(idToken) {
  if (!idToken || typeof idToken !== 'string' || idToken.length > 5000) throw erro(401, 'Entre no sistema de novo.');
  const r = await fetch(N.urlDoc('config', 'instagram'), { headers: { Authorization: 'Bearer ' + idToken } });
  if (r.status === 401 || r.status === 403) throw erro(403, 'Só os sócios usam o Instagram da loja. Entre no sistema de novo.');
  if (r.status === 404) return null; // sócio, ainda sem conexão
  if (!r.ok) throw erro(502, 'Não consegui falar com o banco agora. Tente de novo.');
  return N.lerCampos((await r.json()).fields || {});
}
async function gravarConfig(idToken, dados) {
  const mascara = Object.keys(dados).map(k => 'updateMask.fieldPaths=' + encodeURIComponent(k)).join('&');
  const r = await fetch(N.urlDoc('config', 'instagram') + '&' + mascara, {
    method: 'PATCH', headers: { Authorization: 'Bearer ' + idToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: N.campos(dados) }),
  });
  return r.ok;
}

// ── META ──
// Os erros mais comuns, em português; o resto vai com a mensagem da própria Meta.
function traduzir(e) {
  const cod = Number(e.code), msg = String(e.error_user_msg || e.message || e.error_message || '');
  if (cod === 190 || /access token|session has expired|validating access token/i.test(msg))
    return 'A conexão com o Instagram venceu ou foi desfeita. Toque em Conectar Instagram de novo (ou gere um token novo, se usa o IG_TOKEN).';
  if ([4, 9, 17, 32, 613].includes(cod) || /request limit|rate limit|too many|publishing limit/i.test(msg))
    return 'O Instagram limitou as publicações por agora (são no máximo 100 por dia pela API). Tente mais tarde.';
  if (cod === 10 || cod === 200 || /permission/i.test(msg))
    return 'Falta permissão para publicar. Confira as permissões do Instagram no token (ou conecte de novo deixando marcada a opção de publicar).';
  if (/aspect ratio/i.test(msg)) return 'O Instagram não aceitou o formato da imagem.';
  if (/fetch|download|retriev/i.test(msg)) return /video/i.test(msg) ? 'O Instagram não conseguiu baixar o vídeo. Tente de novo.' : 'O Instagram não conseguiu baixar a imagem. Tente de novo.';
  return 'Instagram: ' + (msg || 'erro sem mensagem');
}
async function graph(metodo, caminho, params, token, host = GRAPH) {
  const url = new URL(/^https:/.test(caminho) ? caminho : `${host}/${VERSAO()}${caminho}`);
  const dados = new URLSearchParams(Object.assign({}, params, token ? { access_token: token } : {}));
  let r;
  if (metodo === 'GET') {
    for (const [k, v] of dados) url.searchParams.set(k, v);
    r = await fetch(url);
  } else {
    r = await fetch(url, { method: metodo, headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: dados.toString() });
  }
  let j = {};
  try { j = await r.json(); } catch (e) { /* resposta sem JSON */ }
  if (!r.ok || j.error || j.error_message) throw erro(502, traduzir(j.error || j));
  return j;
}
async function trocarCodigo(code) {
  const r = await fetch('https://api.instagram.com/oauth/access_token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: process.env.IG_APP_ID, client_secret: process.env.IG_APP_SECRET,
      grant_type: 'authorization_code', redirect_uri: VOLTA, code }).toString(),
  });
  let j = {};
  try { j = await r.json(); } catch (e) { /* sem JSON */ }
  const d = Array.isArray(j.data) ? (j.data[0] || {}) : j; // a Meta já mandou dos dois jeitos
  if (!r.ok || !d.access_token) throw erro(502, traduzir(j.error || j));
  return d;
}
async function esperarPronto(id, token, host) {
  for (let i = 0; i < 12; i++) {
    const s = (await graph('GET', `/${id}`, { fields: 'status_code' }, token, host)).status_code;
    if (!s || s === 'FINISHED' || s === 'PUBLISHED') return;
    if (s === 'ERROR' || s === 'EXPIRED') throw erro(502, `O Instagram não conseguiu preparar a imagem (${s}). Tente de novo.`);
    await espera(Math.min(1000 * (i + 1), 3000));
  }
  throw erro(504, 'O Instagram está demorando para preparar a imagem. Tente de novo daqui a pouco.');
}
// Renova o token quando a última renovação passou de 7 dias (ele vale 60). Se falhar,
// segue com o que tem: renovar é bônus, publicar é o que importa.
async function renovarSePreciso(idToken, seg, sempre) {
  const agora = Date.now(), idade = agora - (seg.r || 0);
  if (idade < DIA || (!sempre && idade < 7 * DIA)) return { seg, renovou: false };
  try {
    const novo = await graph('GET', `${GRAPH}/refresh_access_token`, { grant_type: 'ig_refresh_token' }, seg.t);
    const s2 = { t: novo.access_token || seg.t, u: seg.u, r: agora };
    const expira = new Date(agora + (Number(novo.expires_in) || 60 * 86400) * 1000);
    await gravarConfig(idToken, { cifra: cifrar(s2), renovadoEm: new Date(agora), expira });
    return { seg: s2, renovou: true, expira };
  } catch (e) {
    return { seg, renovou: false };
  }
}

// ── MODO TOKEN ──
let cacheToken = null; // { em, chave, ok, id, usuario, erro }
async function estadoToken() {
  const t = tokenFixo();
  if (!t) return null;
  const chaveCache = t.slice(-12) + '|' + (process.env.IG_USER_ID || '');
  if (cacheToken && cacheToken.chave === chaveCache && Date.now() - cacheToken.em < 60000) return cacheToken;
  const id = String(process.env.IG_USER_ID || IG_ID_PADRAO).trim();
  try {
    const eu = await graph('GET', `/${id}`, { fields: 'id,username' }, t, hostDe(t));
    cacheToken = { em: Date.now(), chave: chaveCache, ok: true, id: String(eu.id || id), usuario: eu.username || '' };
  } catch (e) {
    cacheToken = { em: Date.now(), chave: chaveCache, ok: false, id, usuario: '', erro: e.message };
  }
  return cacheToken;
}

// ── AÇÕES ──
async function conectar(corpo) {
  if (tokenFixo()) throw erro(409, 'O Instagram já está ligado pelo token da Vercel (IG_TOKEN): não precisa conectar.');
  if (!configurado()) throw erro(503, 'Falta configurar o app da Meta na Vercel (IG_APP_ID e IG_APP_SECRET).');
  await lerConfig(corpo.idToken); // só sócio
  const u = new URL('https://www.instagram.com/oauth/authorize');
  u.search = new URLSearchParams({ client_id: process.env.IG_APP_ID, redirect_uri: VOLTA, response_type: 'code',
    scope: ESCOPOS, state: novoEstado(Date.now()), force_reauth: 'true' }).toString();
  return { url: u.toString() };
}
async function voltaDoLogin(q, res) {
  const ir = hash => { res.statusCode = 302; res.setHeader('Location', `${N.SITE}/#${hash}`); res.setHeader('Cache-Control', 'no-store'); res.end(); };
  const falhou = msg => ir('insta_erro=' + encodeURIComponent(msg));
  if (q.error || !q.code) return falhou(String(q.error_description || q.error_reason || 'o login foi cancelado'));
  if (!configurado()) return falhou('falta configurar o app da Meta na Vercel');
  if (!estadoValido(q.state, Date.now())) return falhou('o login demorou demais ou não começou pelo sistema; tente de novo');
  try {
    const curto = await trocarCodigo(String(q.code).replace(/#_$/, ''));
    const longo = await graph('GET', `${GRAPH}/access_token`, { grant_type: 'ig_exchange_token', client_secret: process.env.IG_APP_SECRET }, curto.access_token);
    const eu = await graph('GET', '/me', { fields: 'user_id,username' }, longo.access_token);
    const agora = Date.now();
    const cifra = cifrar({ t: longo.access_token, u: String(eu.user_id || eu.id || curto.user_id || ''), r: agora });
    const expira = agora + (Number(longo.expires_in) || 60 * 86400) * 1000;
    console.log(`insta conectado @${eu.username || '?'}`);
    return ir(`insta=${cifra}&insta_user=${encodeURIComponent(eu.username || '')}&insta_exp=${expira}`);
  } catch (e) {
    return falhou(e.message);
  }
}
// A conta do Instagram e o token para publicar: o IG_TOKEN da Vercel ou a conexão cifrada.
// Só sócio passa (lerConfig).
async function contaDoInsta(corpo) {
  const cfg = await lerConfig(corpo.idToken); // só sócio, nos dois modos
  const est = await estadoToken();
  if (est && !est.ok) throw erro(409, 'O token do Instagram na Vercel (IG_TOKEN) não funcionou: ' + est.erro);
  if (!est && (!cfg || !cfg.cifra)) throw erro(409, 'Conecte o Instagram da loja primeiro (botão Conectar Instagram).');
  if (est) { const t = tokenFixo(); return { t, ig: est.id, host: hostDe(t), usuario: est.usuario, token: true }; }
  const { seg } = await renovarSePreciso(corpo.idToken, decifrar(cfg.cifra), false);
  return { t: seg.t, ig: seg.u || 'me', host: GRAPH, usuario: cfg.usuario || '', token: false };
}
async function publicar(corpo) {
  const tipo = ['feed', 'carrossel', 'story'].includes(corpo.tipo) ? corpo.tipo : 'feed';
  const imagens = (Array.isArray(corpo.imagens) ? corpo.imagens : []).map(String);
  const qtdOk = tipo === 'carrossel' ? imagens.length >= 2 && imagens.length <= 10 : imagens.length === 1;
  const conta = await contaDoInsta(corpo);
  if (!qtdOk || !imagens.every(id => ID_IMG.test(id))) throw erro(400, 'Imagens inválidas para publicar.');
  const legenda = String(corpo.legenda || '').slice(0, 2200);
  const { t, ig, host, usuario } = conta, est = conta.token;
  const g = (metodo, caminho, params) => graph(metodo, caminho, params, t, host);
  const url = id => `${N.SITE}/insta/img/${id}.jpg`;
  let criacao;
  if (tipo === 'story') {
    criacao = (await g('POST', `/${ig}/media`, { media_type: 'STORIES', image_url: url(imagens[0]) })).id;
  } else if (tipo === 'feed') {
    criacao = (await g('POST', `/${ig}/media`, { image_url: url(imagens[0]), caption: legenda })).id;
  } else {
    const filhos = [];
    for (const id of imagens) filhos.push((await g('POST', `/${ig}/media`, { image_url: url(id), is_carousel_item: 'true' })).id);
    for (const f of filhos) await esperarPronto(f, t, host);
    criacao = (await g('POST', `/${ig}/media`, { media_type: 'CAROUSEL', children: filhos.join(','), caption: legenda })).id;
  }
  await esperarPronto(criacao, t, host);
  const pub = await g('POST', `/${ig}/media_publish`, { creation_id: criacao });
  let link = '';
  try { link = (await g('GET', `/${pub.id}`, { fields: 'permalink' })).permalink || ''; } catch (e) { /* publicou mesmo assim */ }
  console.log(`insta publicou ${tipo} ${pub.id}${est ? ' (token)' : ''}`);
  return { ok: true, id: pub.id, link, usuario };
}
// ── VÍDEO ──
const BLOB_API = 'https://vercel.com/api/blob';
const BLOB_VERSAO = '13'; // a mesma do @vercel/blob 2.8.2, que o navegador usa para enviar
const VIDEO_MAX = 300 * 1024 * 1024;
const blobToken = () => String(process.env.BLOB_READ_WRITE_TOKEN || '').trim();
const blobLoja = () => blobToken().split('_')[3] || ''; // vercel_blob_rw_<loja>_<segredo>
const ID_CONT = /^\d{5,30}$/;
// Só o endereço da nossa loja, na pasta dos vídeos (a Meta baixa daqui; nada de fora).
function urlDoVideo(u) {
  let x;
  try { x = new URL(String(u || '')); } catch (e) { return ''; }
  const loja = blobLoja().toLowerCase();
  if (x.protocol !== 'https:' || !loja || x.hostname !== `${loja}.public.blob.vercel-storage.com`) return '';
  if (!/^\/insta-video\/[\w.-]{1,160}$/.test(x.pathname) || x.search || x.hash || x.username || x.port) return '';
  return x.toString();
}
async function blobApi(caminho, init) {
  const r = await fetch(BLOB_API + caminho, Object.assign({}, init, {
    headers: Object.assign({ authorization: 'Bearer ' + blobToken(), 'x-api-version': BLOB_VERSAO, 'x-vercel-blob-store-id': blobLoja() }, (init || {}).headers),
  }));
  let j = {};
  try { j = await r.json(); } catch (e) { /* sem JSON */ }
  if (!r.ok) throw erro(502, 'Armazenamento de vídeos: ' + ((j.error && j.error.message) || 'erro ' + r.status));
  return j;
}
async function apagarVideos(urls) {
  if (urls.length) await blobApi('/delete', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ urls }) });
}
// O que sobrou de envio que não terminou (a pessoa fechou a página): apaga depois de 3 horas.
async function limparVideosVelhos() {
  const j = await blobApi('?' + new URLSearchParams({ prefix: 'insta-video/', limit: '100' }), { method: 'GET' });
  const velhos = (j.blobs || []).filter(b => Date.now() - (Date.parse(b.uploadedAt || '') || 0) > 3 * 3600000).map(b => b.url).filter(Boolean);
  await apagarVideos(velhos);
  return velhos.length;
}
// O token do envio, no formato do @vercel/blob (generateClientTokenFromReadWriteToken da
// versão 2.8.2): só vídeo MP4/MOV, até 300 MB, nesta pasta, válido por uma hora.
async function tokenDoEnvio(corpo) {
  const p = corpo.payload || {};
  let cp = {};
  try { cp = JSON.parse(p.clientPayload || '{}') || {}; } catch (e) { /* sem payload */ }
  await lerConfig(cp.idToken); // só sócio
  const rw = blobToken();
  if (!rw || !blobLoja()) throw erro(503, 'Falta ligar o armazenamento de vídeos na Vercel (BLOB_READ_WRITE_TOKEN).');
  const pathname = String(p.pathname || '');
  if (!/^insta-video\/[\w.-]{1,100}\.(mp4|mov)$/i.test(pathname)) throw erro(400, 'Nome de vídeo inválido.');
  try { const n = await limparVideosVelhos(); if (n) console.log('insta vídeo: apaguei', n, 'envio(s) antigo(s)'); }
  catch (e) { console.log('insta vídeo: limpeza falhou', e.message); }
  const dados = Buffer.from(JSON.stringify({ pathname, allowedContentTypes: ['video/mp4', 'video/quicktime'], maximumSizeInBytes: VIDEO_MAX,
    addRandomSuffix: true, validUntil: Date.now() + 3600000 })).toString('base64');
  const assinatura = crypto.createHmac('sha256', rw).update(dados).digest('hex');
  return { type: 'blob.generate-client-token', clientToken: `vercel_blob_client_${blobLoja()}_${Buffer.from(assinatura + '.' + dados).toString('base64')}` };
}
// O erro que a Meta põe no contêiner ("... error code 2207026"), em português.
function erroDoVideo(status, codigo) {
  const s = String(status || ''), n = (s.match(/\b(2207\d{3})\b/) || [])[1] || '';
  if (codigo === 'EXPIRED' || n === '2207008' || n === '2207020') return 'O Instagram desistiu de esperar (o vídeo expirou). Envie de novo.';
  if (n === '2207026') return 'O Instagram não aceitou o formato do vídeo: ele pede H.264 ou HEVC, até 1080p, de 23 a 60 quadros por segundo e som AAC.';
  if (n === '2207003' || n === '2207052') return 'O Instagram não conseguiu baixar o vídeo. Tente de novo.';
  if (n === '2207004') return 'O vídeo é grande demais para o Instagram.';
  if (n === '2207042') return 'O Instagram limitou as publicações por hoje. Tente amanhã.';
  if (n === '2207050') return 'O Instagram diz que a conta está restrita ou precisa de uma verificação: abra o app do Instagram.';
  return 'O Instagram não conseguiu preparar o vídeo' + (s ? ': ' + s.replace(/^Error:\s*/i, '') : '.');
}
// Antes de mandar 100 MB: confere o que dá para conferir (o erro aparece com o motivo).
async function videoChecar(corpo) {
  const c = await contaDoInsta(corpo);
  if (!blobToken() || !blobLoja()) throw erro(503, 'Falta ligar o armazenamento de vídeos na Vercel (BLOB_READ_WRITE_TOKEN).');
  return { ok: true, usuario: c.usuario };
}
async function video(corpo) {
  const c = await contaDoInsta(corpo);
  const url = urlDoVideo(corpo.url);
  if (!url) throw erro(400, 'Vídeo inválido para publicar.');
  const reels = corpo.reels !== false, story = !!corpo.story;
  if (!reels && !story) throw erro(400, 'Escolha Reels ou story.');
  const legenda = String(corpo.legenda || '').slice(0, 2200);
  const capa = ID_IMG.test(String(corpo.capa || '')) ? `${N.SITE}/insta/img/${corpo.capa}.jpg` : '';
  const g = (metodo, caminho, params) => graph(metodo, caminho, params, c.t, c.host);
  const ids = {};
  if (reels) ids.reels = String((await g('POST', `/${c.ig}/media`, Object.assign({ media_type: 'REELS', video_url: url, caption: legenda, share_to_feed: 'true' }, capa ? { cover_url: capa } : {}))).id);
  if (story) ids.story = String((await g('POST', `/${c.ig}/media`, { media_type: 'STORIES', video_url: url })).id);
  console.log('insta vídeo: contêineres', JSON.stringify(ids), capa ? 'com capa' : 'sem capa');
  return { ok: true, ids };
}
async function videoStatus(corpo) {
  const c = await contaDoInsta(corpo);
  const ids = (Array.isArray(corpo.ids) ? corpo.ids : []).map(String).filter(id => ID_CONT.test(id)).slice(0, 2);
  if (!ids.length) throw erro(400, 'Nada para conferir.');
  const situacao = {};
  for (const id of ids) {
    const j = await graph('GET', `/${id}`, { fields: 'status_code,status' }, c.t, c.host);
    const st = String(j.status_code || '');
    situacao[id] = { status: st, erro: st === 'ERROR' || st === 'EXPIRED' ? erroDoVideo(j.status, st) : '' };
    if (situacao[id].erro) console.log('insta vídeo: erro no contêiner', id, st, String(j.status || '').slice(0, 300));
  }
  return { ok: true, situacao };
}
async function videoPublicar(corpo) {
  const c = await contaDoInsta(corpo);
  const id = String(corpo.id || '');
  if (!ID_CONT.test(id)) throw erro(400, 'Vídeo inválido para publicar.');
  const pub = await graph('POST', `/${c.ig}/media_publish`, { creation_id: id }, c.t, c.host);
  let link = '';
  try { link = (await graph('GET', `/${pub.id}`, { fields: 'permalink' }, c.t, c.host)).permalink || ''; } catch (e) { /* publicou mesmo assim */ }
  console.log(`insta publicou vídeo ${pub.id}${c.token ? ' (token)' : ''}`);
  return { ok: true, id: pub.id, link, usuario: c.usuario };
}
async function videoApagar(corpo) {
  await lerConfig(corpo.idToken); // só sócio
  const url = urlDoVideo(corpo.url);
  if (url) await apagarVideos([url]);
  return { ok: true };
}

async function renovar(corpo) {
  const cfg = await lerConfig(corpo.idToken);
  if (tokenFixo()) return { ok: true, renovou: false, expira: null }; // o token de usuário do sistema não vence
  if (!cfg || !cfg.cifra) throw erro(409, 'O Instagram da loja não está conectado.');
  const r = await renovarSePreciso(corpo.idToken, decifrar(cfg.cifra), true);
  return { ok: true, renovou: r.renovou, expira: r.expira ? r.expira.getTime() : null };
}
// A arte temporária, para a Meta baixar. Some depois de 2 horas (e o sistema apaga
// assim que publica); o id é aleatório, de 32 letras.
async function servirImagem(id, res) {
  const nada = () => { res.statusCode = 404; res.setHeader('Cache-Control', 'no-store'); res.end(); };
  if (!ID_IMG.test(id)) return nada();
  const r = await fetch(N.urlDoc('catalogo_fotos', 'insta_' + id));
  if (!r.ok) return nada();
  const f = (await r.json()).fields || {};
  const b64 = (f.jpg && (f.jpg.bytesValue || f.jpg.stringValue)) || '';
  const em = f.em ? Number(f.em.integerValue || f.em.doubleValue || 0) || Date.parse(f.em.timestampValue || '') || 0 : 0;
  if (!b64 || !em || Date.now() - em > 2 * 3600000) return nada();
  const buf = Buffer.from(b64, 'base64');
  res.statusCode = 200;
  res.setHeader('Content-Type', 'image/jpeg');
  res.setHeader('Content-Length', String(buf.length));
  res.setHeader('Cache-Control', 'public, max-age=600');
  res.end(buf);
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
  for await (const parte of req) { txt += parte; if (txt.length > 20000) break; }
  try { return JSON.parse(txt || '{}'); } catch (e) { return {}; }
}

module.exports = async (req, res) => {
  const q = req.query || Object.fromEntries(new URL(req.url, 'http://x').searchParams);
  try {
    if (req.method === 'GET') {
      if (q.img) return await servirImagem(String(q.img).replace(/\.jpg$/i, ''), res);
      if (q.code || q.error || q.state) return await voltaDoLogin(q, res);
      // estado para o sistema: no modo token, se ele funciona e de qual conta é (nunca o token)
      const est = await estadoToken();
      return json(res, 200, { ok: true, configurado: configurado(), token: !!est, conectado: !!(est && est.ok),
        usuario: (est && est.usuario) || '', erro: (est && !est.ok && est.erro) || '' });
    }
    if (req.method !== 'POST') return json(res, 405, { erro: 'Use GET ou POST.' });
    const corpo = await lerCorpo(req);
    if (corpo.type === 'blob.generate-client-token') return json(res, 200, await tokenDoEnvio(corpo));
    if (corpo.acao === 'conectar') return json(res, 200, await conectar(corpo));
    if (corpo.acao === 'publicar') return json(res, 200, await publicar(corpo));
    if (corpo.acao === 'renovar') return json(res, 200, await renovar(corpo));
    if (corpo.acao === 'video_checar') return json(res, 200, await videoChecar(corpo));
    if (corpo.acao === 'video') return json(res, 200, await video(corpo));
    if (corpo.acao === 'video_status') return json(res, 200, await videoStatus(corpo));
    if (corpo.acao === 'video_publicar') return json(res, 200, await videoPublicar(corpo));
    if (corpo.acao === 'video_apagar') return json(res, 200, await videoApagar(corpo));
    return json(res, 400, { erro: 'Ação desconhecida.' });
  } catch (e) {
    console.log('insta erro', e.status || 500, e.message);
    return json(res, e.status || 500, { erro: e.message || 'Erro inesperado.' });
  }
};
module.exports._teste = { cifrar, decifrar, novoEstado, estadoValido, VOLTA, ESCOPOS, urlDoVideo, erroDoVideo, limparCache: () => { cacheToken = null; } };
