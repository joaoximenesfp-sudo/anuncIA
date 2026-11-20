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
// O token nunca fica legível fora daqui: o sistema guarda só a cifra (AES-256-GCM, com
// chave tirada do IG_APP_SECRET, que só existe na Vercel). Na Vercel: IG_APP_ID e
// IG_APP_SECRET (do produto Instagram no Meta for Developers) e, se um dia precisar,
// IG_VERSAO (versão da API, padrão abaixo).
const crypto = require('crypto');
const N = require('../tela/nucleo.js');

const VERSAO = () => process.env.IG_VERSAO || 'v23.0';
const GRAPH = 'https://graph.instagram.com';
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
    return 'A conexão com o Instagram venceu ou foi desfeita. Toque em Conectar Instagram de novo.';
  if ([4, 9, 17, 32, 613].includes(cod) || /request limit|rate limit|too many|publishing limit/i.test(msg))
    return 'O Instagram limitou as publicações por agora (são no máximo 100 por dia pela API). Tente mais tarde.';
  if (cod === 10 || cod === 200 || /permission/i.test(msg))
    return 'Falta permissão para publicar. Conecte de novo e deixe marcada a opção de publicar conteúdo.';
  if (/aspect ratio/i.test(msg)) return 'O Instagram não aceitou o formato da imagem.';
  if (/fetch|download|retriev/i.test(msg)) return 'O Instagram não conseguiu baixar a imagem. Tente de novo.';
  return 'Instagram: ' + (msg || 'erro sem mensagem');
}
async function graph(metodo, caminho, params, token) {
  const url = new URL(/^https:/.test(caminho) ? caminho : `${GRAPH}/${VERSAO()}${caminho}`);
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
async function esperarPronto(id, token) {
  for (let i = 0; i < 12; i++) {
    const s = (await graph('GET', `/${id}`, { fields: 'status_code' }, token)).status_code;
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

// ── AÇÕES ──
async function conectar(corpo) {
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
async function publicar(corpo) {
  const cfg = await lerConfig(corpo.idToken);
  if (!cfg || !cfg.cifra) throw erro(409, 'Conecte o Instagram da loja primeiro (botão Conectar Instagram).');
  const tipo = ['feed', 'carrossel', 'story'].includes(corpo.tipo) ? corpo.tipo : 'feed';
  const imagens = (Array.isArray(corpo.imagens) ? corpo.imagens : []).map(String);
  const qtdOk = tipo === 'carrossel' ? imagens.length >= 2 && imagens.length <= 10 : imagens.length === 1;
  if (!qtdOk || !imagens.every(id => ID_IMG.test(id))) throw erro(400, 'Imagens inválidas para publicar.');
  const legenda = String(corpo.legenda || '').slice(0, 2200);
  const { seg } = await renovarSePreciso(corpo.idToken, decifrar(cfg.cifra), false);
  const ig = seg.u || 'me', url = id => `${N.SITE}/insta/img/${id}.jpg`;
  let criacao;
  if (tipo === 'story') {
    criacao = (await graph('POST', `/${ig}/media`, { media_type: 'STORIES', image_url: url(imagens[0]) }, seg.t)).id;
  } else if (tipo === 'feed') {
    criacao = (await graph('POST', `/${ig}/media`, { image_url: url(imagens[0]), caption: legenda }, seg.t)).id;
  } else {
    const filhos = [];
    for (const id of imagens) filhos.push((await graph('POST', `/${ig}/media`, { image_url: url(id), is_carousel_item: 'true' }, seg.t)).id);
    for (const f of filhos) await esperarPronto(f, seg.t);
    criacao = (await graph('POST', `/${ig}/media`, { media_type: 'CAROUSEL', children: filhos.join(','), caption: legenda }, seg.t)).id;
  }
  await esperarPronto(criacao, seg.t);
  const pub = await graph('POST', `/${ig}/media_publish`, { creation_id: criacao }, seg.t);
  let link = '';
  try { link = (await graph('GET', `/${pub.id}`, { fields: 'permalink' }, seg.t)).permalink || ''; } catch (e) { /* publicou mesmo assim */ }
  console.log(`insta publicou ${tipo} ${pub.id}`);
  return { ok: true, id: pub.id, link, usuario: cfg.usuario || '' };
}
async function renovar(corpo) {
  const cfg = await lerConfig(corpo.idToken);
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
      return json(res, 200, { ok: true, configurado: configurado() });
    }
    if (req.method !== 'POST') return json(res, 405, { erro: 'Use GET ou POST.' });
    const corpo = await lerCorpo(req);
    if (corpo.acao === 'conectar') return json(res, 200, await conectar(corpo));
    if (corpo.acao === 'publicar') return json(res, 200, await publicar(corpo));
    if (corpo.acao === 'renovar') return json(res, 200, await renovar(corpo));
    return json(res, 400, { erro: 'Ação desconhecida.' });
  } catch (e) {
    console.log('insta erro', e.status || 500, e.message);
    return json(res, e.status || 500, { erro: e.message || 'Erro inesperado.' });
  }
};
module.exports._teste = { cifrar, decifrar, novoEstado, estadoValido, VOLTA, ESCOPOS };
