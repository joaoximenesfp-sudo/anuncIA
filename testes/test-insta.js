// Instagram da loja (api/insta.js): login da Meta, cifra do token, publicação e a arte
// temporária. A Meta e o Firestore são simulados: o teste vê exatamente o que o servidor
// pediria a eles, sem rede.
// uso: node testes/test-insta.js
const path = require('path');
let falhas = 0;
const ok = (c, n) => { console.log((c ? '  ok  ' : '  FALHOU  ') + n); if (!c) falhas++; };

process.env.IG_APP_ID = '1234567890';
process.env.IG_APP_SECRET = 'segredo-de-teste';
const insta = require(path.join(__dirname, '..', 'api', 'insta.js'));
const N = require(path.join(__dirname, '..', 'tela', 'nucleo.js'));
const { cifrar, decifrar, estadoValido, novoEstado } = insta._teste;

// ── fetch simulado ──
let pedidos = [], cfgDoc = null, imagens = {}, contador = 0, statusSeq = [], erroMeta = null, trocaPlana = false, tokenRuim = false;
let blobs = [], blobApagados = [], videoSt = {};
const resposta = (status, json) => ({ ok: status >= 200 && status < 300, status, json: async () => json });
const param = (p, k) => p.metodo === 'GET' ? new URL(p.url).searchParams.get(k) : new URLSearchParams(p.corpo).get(k);
global.fetch = async (url, op = {}) => {
  const p = { url: String(url), metodo: op.method || 'GET', corpo: op.body ? String(op.body) : '', auth: (op.headers || {}).Authorization || '', headers: op.headers || {} };
  pedidos.push(p);
  const u = new URL(p.url);
  // Firestore: config/instagram só para sócio
  if (u.pathname.endsWith('/documents/config/instagram')) {
    if (p.auth !== 'Bearer socio') return resposta(p.auth ? 403 : 401, { error: { status: 'PERMISSION_DENIED' } });
    if (p.metodo === 'PATCH') { cfgDoc = Object.assign({}, cfgDoc, N.lerCampos(JSON.parse(p.corpo).fields)); return resposta(200, {}); }
    return cfgDoc ? resposta(200, { fields: N.campos(cfgDoc) }) : resposta(404, { error: { status: 'NOT_FOUND' } });
  }
  const img = u.pathname.match(/\/documents\/catalogo_fotos\/insta_([a-f0-9]+)$/);
  if (img) return imagens[img[1]] ? resposta(200, { fields: imagens[img[1]] }) : resposta(404, {});
  // Meta
  if (p.url.startsWith('https://api.instagram.com/oauth/access_token')) {
    if (erroMeta) return resposta(400, { error_type: 'OAuthException', code: 400, error_message: erroMeta });
    const d = { access_token: 'curto', user_id: '111', permissions: 'instagram_business_basic,instagram_business_content_publish' };
    return resposta(200, trocaPlana ? d : { data: [d] });
  }
  // Vercel Blob (os vídeos)
  if (p.url.startsWith('https://vercel.com/api/blob')) {
    if (p.headers.authorization !== 'Bearer ' + process.env.BLOB_READ_WRITE_TOKEN) return resposta(403, { error: { code: 'forbidden', message: 'token' } });
    if (u.pathname === '/api/blob/delete' && p.metodo === 'POST') { blobApagados.push(...JSON.parse(p.corpo).urls); return resposta(200, {}); }
    if (u.pathname === '/api/blob' && p.metodo === 'GET') return resposta(200, { blobs: blobs.filter(b => b.pathname.startsWith(u.searchParams.get('prefix') || '')), hasMore: false });
  }
  if (u.host === 'graph.facebook.com') { // modo token (usuário do sistema)
    if (tokenRuim) return resposta(400, { error: { message: 'Invalid OAuth access token - Cannot parse access token', code: 190, type: 'OAuthException' } });
    if (p.metodo === 'POST' && /\/v23\.0\/\d+\/media$/.test(u.pathname) && /video_url/.test(p.corpo)) return resposta(200, { id: String(17900000000000 + (++contador)) });
    if (/^\/v23\.0\/179\d+$/.test(u.pathname) && u.searchParams.get('fields') === 'status_code,status')
      return resposta(200, videoSt[u.pathname.split('/').pop()] || { status_code: 'FINISHED', status: 'Finished: Media has been uploaded and it is ready to be published.' });
    if (/^\/v23\.0\/\d+$/.test(u.pathname) && u.searchParams.get('fields') === 'id,username') return resposta(200, { id: u.pathname.split('/').pop(), username: 'tech.campinas' });
    if (/\/v23\.0\/\d+\/media$/.test(u.pathname)) return resposta(200, { id: 'c' + (++contador) });
    if (/\/v23\.0\/\d+\/media_publish$/.test(u.pathname)) return resposta(200, { id: 'm' + contador });
    if (/\/v23\.0\/c\d+$/.test(u.pathname)) return resposta(200, { status_code: 'FINISHED' });
    if (/\/v23\.0\/m\d+$/.test(u.pathname)) return resposta(200, { permalink: 'https://www.instagram.com/p/FB123/' });
  }
  if (u.host === 'graph.instagram.com') {
    if (erroMeta && u.pathname !== '/access_token') return resposta(400, { error: { message: erroMeta.msg, code: erroMeta.code, type: 'OAuthException' } });
    if (u.pathname === '/access_token') return resposta(200, { access_token: 'longo', token_type: 'bearer', expires_in: 5184000 });
    if (u.pathname === '/refresh_access_token') return resposta(200, { access_token: 'renovado', token_type: 'bearer', expires_in: 5184000 });
    if (u.pathname === '/v23.0/me') return resposta(200, { user_id: '17841400000', username: 'tech.campinas', id: '999' });
    if (/\/v23\.0\/\d+\/media$/.test(u.pathname)) return resposta(200, { id: 'c' + (++contador) });
    if (/\/v23\.0\/\d+\/media_publish$/.test(u.pathname)) return resposta(200, { id: 'm' + contador });
    if (/\/v23\.0\/c\d+$/.test(u.pathname)) return resposta(200, { status_code: statusSeq.length ? statusSeq.shift() : 'FINISHED' });
    if (/\/v23\.0\/m\d+$/.test(u.pathname)) return resposta(200, { permalink: 'https://www.instagram.com/p/ABC123/' });
  }
  return resposta(404, {});
};
function chamar({ method = 'GET', query = {}, body } = {}) {
  return new Promise(resolve => {
    const res = { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
      end(b) { resolve({ status: this.statusCode, headers: this.headers, body: b, json: () => JSON.parse(String(b)) }); } };
    insta({ method, query, body, headers: {} }, res);
  });
}
const metaPedidos = () => pedidos.filter(p => p.url.includes('instagram.com'));
const ID1 = 'a'.repeat(32), ID2 = 'b'.repeat(32);

(async () => {
  console.log('\nconfiguração');
  let r = await chamar();
  ok(r.status === 200 && r.json().configurado === true, 'com IG_APP_ID e IG_APP_SECRET na Vercel: configurado');
  delete process.env.IG_APP_SECRET;
  r = await chamar();
  const r2 = await chamar({ method: 'POST', body: { acao: 'conectar', idToken: 'socio' } });
  ok(r.json().configurado === false && r2.status === 503 && /Vercel/.test(r2.json().erro), 'sem o segredo: avisa que falta configurar na Vercel');
  process.env.IG_APP_SECRET = 'segredo-de-teste';

  console.log('\nconectar (só sócio)');
  r = await chamar({ method: 'POST', body: { acao: 'conectar' } });
  ok(r.status === 401, 'sem login: 401');
  r = await chamar({ method: 'POST', body: { acao: 'conectar', idToken: 'intruso' } });
  ok(r.status === 403, 'quem não é sócio (as regras do Firestore negam): 403');
  r = await chamar({ method: 'POST', body: JSON.stringify({ acao: 'conectar', idToken: 'socio' }) });
  const login = new URL(r.json().url);
  ok(r.status === 200 && login.origin + login.pathname === 'https://www.instagram.com/oauth/authorize', 'sócio: recebe o endereço do login do Instagram');
  ok(login.searchParams.get('client_id') === '1234567890' && login.searchParams.get('redirect_uri') === 'https://anunc-ia.vercel.app/api/insta' &&
    login.searchParams.get('response_type') === 'code', 'com o id do app e a volta para o sistema');
  ok(login.searchParams.get('scope') === 'instagram_business_basic,instagram_business_content_publish', 'pede só ler a conta e publicar');
  ok(estadoValido(login.searchParams.get('state'), Date.now()), 'com um "state" assinado');
  ok(!estadoValido(login.searchParams.get('state'), Date.now() + 16 * 60000) && !estadoValido((st => st.slice(0, -1) + (st.slice(-1) === 'x' ? 'y' : 'x'))(novoEstado(Date.now())), Date.now()) &&
    !estadoValido('lixo', Date.now()), '"state" vencido (15 min), mexido ou inventado não vale');

  console.log('\nvolta do login');
  pedidos = [];
  r = await chamar({ query: { code: 'COD123#_', state: login.searchParams.get('state') } });
  const loc = new URL(r.headers.location), h = new URLSearchParams(loc.hash.slice(1));
  ok(r.status === 302 && loc.origin === 'https://anunc-ia.vercel.app' && loc.pathname === '/', 'volta para o sistema');
  ok(h.get('insta_user') === 'tech.campinas' && +h.get('insta_exp') > Date.now() + 59 * 86400000, 'com a conta e quando a conexão vence (60 dias)');
  const seg = decifrar(h.get('insta'));
  ok(seg.t === 'longo' && seg.u === '17841400000' && Math.abs(seg.r - Date.now()) < 5000, 'token de 60 dias e a conta, cifrados');
  ok(!r.headers.location.includes('longo') && !r.headers.location.includes('curto'), 'o token nunca aparece em claro no endereço');
  const troca = pedidos.find(p => p.url.startsWith('https://api.instagram.com/oauth/access_token'));
  ok(troca && param(troca, 'code') === 'COD123' && param(troca, 'client_secret') === 'segredo-de-teste' && param(troca, 'grant_type') === 'authorization_code' &&
    param(troca, 'redirect_uri') === 'https://anunc-ia.vercel.app/api/insta', 'troca o código (sem o "#_" do fim) com o segredo, no servidor');
  const longoP = pedidos.find(p => p.url.startsWith('https://graph.instagram.com/access_token'));
  ok(longoP && param(longoP, 'grant_type') === 'ig_exchange_token' && param(longoP, 'access_token') === 'curto', 'troca o token de 1 hora pelo de 60 dias');
  trocaPlana = true;
  r = await chamar({ query: { code: 'X', state: novoEstado(Date.now()) } });
  ok(new URLSearchParams(new URL(r.headers.location).hash.slice(1)).get('insta_user') === 'tech.campinas', 'aceita a resposta da Meta também sem o "data: [...]"');
  trocaPlana = false;
  r = await chamar({ query: { code: 'X', state: 'inventado.' + 'x'.repeat(32) } });
  ok(/insta_erro=/.test(r.headers.location) && !/insta=/.test(r.headers.location.replace('insta_erro=', '')), '"state" inválido: volta com erro, sem conectar');
  r = await chamar({ query: { error: 'access_denied', error_reason: 'user_denied', error_description: 'Permissions error', state: novoEstado(Date.now()) } });
  ok(/insta_erro=Permissions/.test(r.headers.location), 'cancelou no Instagram: volta com o motivo');
  erroMeta = 'Invalid authorization code';
  r = await chamar({ query: { code: 'velho', state: novoEstado(Date.now()) } });
  ok(/insta_erro=Instagram%3A%20Invalid%20authorization%20code/.test(r.headers.location), 'código recusado: volta com a mensagem da Meta');
  erroMeta = null;

  console.log('\npublicar');
  cfgDoc = null;
  r = await chamar({ method: 'POST', body: { acao: 'publicar', idToken: 'socio', tipo: 'feed', imagens: [ID1], legenda: 'oi' } });
  ok(r.status === 409 && /Conecte/.test(r.json().erro), 'sem conexão: pede para conectar');
  r = await chamar({ method: 'POST', body: { acao: 'publicar', idToken: 'intruso', tipo: 'feed', imagens: [ID1], legenda: 'oi' } });
  ok(r.status === 403, 'quem não é sócio não publica');
  cfgDoc = { cifra: cifrar({ t: 'longo', u: '17841400000', r: Date.now() - 2 * 86400000 }), usuario: 'tech.campinas' };
  for (const [tipo, imgs] of [['feed', [ID1, ID2]], ['feed', ['../x']], ['carrossel', [ID1]], ['story', []]]) {
    r = await chamar({ method: 'POST', body: { acao: 'publicar', idToken: 'socio', tipo, imagens: imgs, legenda: 'x' } });
    if (r.status !== 400) break;
  }
  ok(r.status === 400, 'imagens erradas (quantidade ou id): 400, sem chamar a Meta');
  pedidos = []; contador = 0;
  r = await chamar({ method: 'POST', body: { acao: 'publicar', idToken: 'socio', tipo: 'feed', imagens: [ID1], legenda: 'Notebook Dell\nR$ 1.899' } });
  const m = metaPedidos();
  ok(r.status === 200 && r.json().ok && r.json().link === 'https://www.instagram.com/p/ABC123/', 'post: publicado, com o link');
  ok(m[0].metodo === 'POST' && m[0].url === 'https://graph.instagram.com/v23.0/17841400000/media' && param(m[0], 'image_url') === `https://anunc-ia.vercel.app/insta/img/${ID1}.jpg` &&
    param(m[0], 'caption') === 'Notebook Dell\nR$ 1.899' && param(m[0], 'access_token') === 'longo', 'cria o container com a arte (endereço público) e a legenda');
  ok(m.some(p => p.url.includes('/media_publish') && param(p, 'creation_id') === 'c1'), 'e publica o container');
  ok(!m.some(p => p.url.includes('refresh_access_token')), 'token renovado há 2 dias: não renova de novo');
  pedidos = []; contador = 0;
  r = await chamar({ method: 'POST', body: { acao: 'publicar', idToken: 'socio', tipo: 'carrossel', imagens: [ID1, ID2], legenda: 'carrossel' } });
  const mc = metaPedidos().filter(p => p.metodo === 'POST' && p.url.endsWith('/media'));
  ok(r.status === 200 && mc.length === 3 && param(mc[0], 'is_carousel_item') === 'true' && param(mc[1], 'is_carousel_item') === 'true' && !param(mc[0], 'caption'),
    'carrossel: um container por imagem, sem legenda neles');
  ok(param(mc[2], 'media_type') === 'CAROUSEL' && param(mc[2], 'children') === 'c1,c2' && param(mc[2], 'caption') === 'carrossel', 'e o carrossel junta os dois, com a legenda');
  pedidos = []; contador = 0;
  r = await chamar({ method: 'POST', body: { acao: 'publicar', idToken: 'socio', tipo: 'story', imagens: [ID1], legenda: 'não vai' } });
  const ms = metaPedidos().find(p => p.url.endsWith('/media'));
  ok(r.status === 200 && param(ms, 'media_type') === 'STORIES' && !param(ms, 'caption'), 'story: tipo STORIES, sem legenda (o story não tem)');
  pedidos = []; contador = 0; statusSeq = ['IN_PROGRESS', 'FINISHED'];
  r = await chamar({ method: 'POST', body: { acao: 'publicar', idToken: 'socio', tipo: 'feed', imagens: [ID1], legenda: 'x' } });
  ok(r.status === 200 && metaPedidos().filter(p => /\/c1$/.test(new URL(p.url).pathname)).length === 2, 'imagem ainda processando: espera e publica');
  contador = 0; statusSeq = ['ERROR'];
  r = await chamar({ method: 'POST', body: { acao: 'publicar', idToken: 'socio', tipo: 'feed', imagens: [ID1], legenda: 'x' } });
  ok(r.status === 502 && /preparar a imagem/.test(r.json().erro), 'a Meta não processou a imagem: avisa, sem publicar');
  statusSeq = [];
  erroMeta = { msg: 'Error validating access token: Session has expired', code: 190 };
  r = await chamar({ method: 'POST', body: { acao: 'publicar', idToken: 'socio', tipo: 'feed', imagens: [ID1], legenda: 'x' } });
  ok(r.status === 502 && /Conectar Instagram de novo/.test(r.json().erro), 'token vencido: pede para conectar de novo, em português');
  erroMeta = { msg: 'Application request limit reached', code: 4 };
  r = await chamar({ method: 'POST', body: { acao: 'publicar', idToken: 'socio', tipo: 'feed', imagens: [ID1], legenda: 'x' } });
  ok(/limitou/.test(r.json().erro), 'limite da Meta: explica');
  erroMeta = null;

  console.log('\nrenovar o token (vale 60 dias)');
  cfgDoc = { cifra: cifrar({ t: 'longo', u: '17841400000', r: Date.now() - 8 * 86400000 }), usuario: 'tech.campinas' };
  pedidos = []; contador = 0;
  r = await chamar({ method: 'POST', body: { acao: 'publicar', idToken: 'socio', tipo: 'feed', imagens: [ID1], legenda: 'x' } });
  const pub = metaPedidos().find(p => p.url.endsWith('/media'));
  ok(r.status === 200 && metaPedidos().some(p => p.url.startsWith('https://graph.instagram.com/refresh_access_token')) && param(pub, 'access_token') === 'renovado',
    'renovado há mais de 7 dias: renova antes de publicar e publica com o novo');
  ok(decifrar(cfgDoc.cifra).t === 'renovado' && cfgDoc.expira instanceof Date && cfgDoc.expira.getTime() > Date.now() + 59 * 86400000,
    'e guarda o novo (cifrado) e a validade nova em config/instagram');
  cfgDoc = { cifra: cifrar({ t: 'longo', u: '17841400000', r: Date.now() - 2 * 86400000 }), usuario: 'tech.campinas' };
  r = await chamar({ method: 'POST', body: { acao: 'renovar', idToken: 'socio' } });
  ok(r.status === 200 && r.json().renovou && r.json().expira > Date.now() + 59 * 86400000, 'renovar pelo sistema: renova se tem mais de 1 dia');
  cfgDoc = { cifra: cifrar({ t: 'longo', u: '17841400000', r: Date.now() - 3600000 }), usuario: 'tech.campinas' };
  r = await chamar({ method: 'POST', body: { acao: 'renovar', idToken: 'socio' } });
  ok(r.status === 200 && !r.json().renovou, 'token de menos de 24 h: a Meta não renova, nem tenta');
  cfgDoc = { cifra: cifrar({ t: 'longo', u: '1', r: 0 }).slice(0, -4) + 'AAAA' };
  r = await chamar({ method: 'POST', body: { acao: 'publicar', idToken: 'socio', tipo: 'feed', imagens: [ID1], legenda: 'x' } });
  ok(r.status === 409 && /Conecte de novo/.test(r.json().erro), 'cifra mexida (ou segredo trocado): pede para conectar de novo');

  console.log('\nmodo token (usuário do sistema, o dos apps novos da Meta)');
  process.env.IG_TOKEN = 'EAAtokenDeTesteDoSistema'; insta._teste.limparCache(); cfgDoc = null; pedidos = [];
  r = await chamar();
  let est = r.json();
  ok(est.token && est.conectado && est.usuario === 'tech.campinas' && !r.body.includes('EAAtoken'), 'GET: token funcionando, de qual conta é (e nunca o token)');
  const lk = pedidos.find(p => p.url.startsWith('https://graph.facebook.com/'));
  ok(lk && new URL(lk.url).pathname === '/v23.0/17841430007598170', 'confere na conta da loja (@tech.campinas), pela API do Facebook');
  pedidos = []; contador = 0;
  r = await chamar({ method: 'POST', body: { acao: 'publicar', idToken: 'socio', tipo: 'feed', imagens: [ID1], legenda: 'pelo token' } });
  const mt = pedidos.filter(p => p.url.startsWith('https://graph.facebook.com/'));
  const cont = mt.find(p => p.metodo === 'POST' && p.url.endsWith('/media'));
  ok(r.status === 200 && r.json().link === 'https://www.instagram.com/p/FB123/' && r.json().usuario === 'tech.campinas', 'publica pelo token, sem config/instagram no banco');
  ok(cont && cont.url === 'https://graph.facebook.com/v23.0/17841430007598170/media' && param(cont, 'access_token') === 'EAAtokenDeTesteDoSistema' &&
    param(cont, 'caption') === 'pelo token' && !pedidos.some(p => p.url.includes('graph.instagram.com')), 'container e publicação em graph.facebook.com, na conta da loja');
  r = await chamar({ method: 'POST', body: { acao: 'publicar', idToken: 'intruso', tipo: 'feed', imagens: [ID1], legenda: 'x' } });
  ok(r.status === 403, 'com token também: quem não é sócio não publica');
  r = await chamar({ method: 'POST', body: { acao: 'conectar', idToken: 'socio' } });
  const rn = await chamar({ method: 'POST', body: { acao: 'renovar', idToken: 'socio' } });
  ok(r.status === 409 && /já está ligado/.test(r.json().erro) && rn.json().renovou === false, 'com token, não tem login nem renovação (não vence)');
  process.env.IG_USER_ID = '17841499999999999'; pedidos = [];
  await chamar();
  ok(pedidos.some(p => p.url.includes('/v23.0/17841499999999999?')), 'IG_USER_ID na Vercel troca a conta');
  delete process.env.IG_USER_ID;
  tokenRuim = true; insta._teste.limparCache();
  r = await chamar(); est = r.json();
  ok(est.token && !est.conectado && /venceu ou foi desfeita/.test(est.erro), 'token errado: o GET diz que não funcionou, e por quê');
  r = await chamar({ method: 'POST', body: { acao: 'publicar', idToken: 'socio', tipo: 'feed', imagens: [ID1], legenda: 'x' } });
  ok(r.status === 409 && /IG_TOKEN/.test(r.json().erro), 'e não tenta publicar');
  tokenRuim = false; delete process.env.IG_TOKEN; insta._teste.limparCache();
  r = await chamar();
  ok(r.json().token === false, 'sem IG_TOKEN: volta ao login do Instagram');

  console.log('\na arte temporária, para a Meta baixar');
  const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]);
  imagens[ID1] = { jpg: { bytesValue: jpg.toString('base64') }, em: { integerValue: String(Date.now() - 60000) }, insta: { booleanValue: true } };
  imagens[ID2] = { jpg: { bytesValue: jpg.toString('base64') }, em: { integerValue: String(Date.now() - 3 * 3600000) } };
  r = await chamar({ query: { img: ID1 + '.jpg' } });
  ok(r.status === 200 && r.headers['content-type'] === 'image/jpeg' && Buffer.compare(r.body, jpg) === 0, 'serve o JPEG guardado');
  r = await chamar({ query: { img: ID2 + '.jpg' } });
  ok(r.status === 404, 'arte de mais de 2 horas: some');
  r = await chamar({ query: { img: '../config' } });
  const r3 = await chamar({ query: { img: 'c'.repeat(32) } });
  ok(r.status === 404 && r3.status === 404, 'id estranho ou que não existe: 404');

  console.log('\nvídeo: Reels e story (o arquivo vai direto para o Vercel Blob)');
  const crypto = require('crypto');
  process.env.IG_TOKEN = 'EAAtokenDeTesteDoSistema'; insta._teste.limparCache(); cfgDoc = null;
  const RW = 'vercel_blob_rw_LojaTeste123_segredoDoBlobDeTeste';
  const envio = (pathname, idToken) => chamar({ method: 'POST', body: { type: 'blob.generate-client-token', payload: { pathname, clientPayload: idToken === undefined ? null : JSON.stringify({ idToken }), multipart: true } } });
  delete process.env.BLOB_READ_WRITE_TOKEN;
  r = await chamar({ method: 'POST', body: { acao: 'video_checar', idToken: 'socio' } });
  const semBlob = await envio('insta-video/maquina-12.mp4', 'socio');
  ok(r.status === 503 && /BLOB_READ_WRITE_TOKEN/.test(r.json().erro) && semBlob.status === 503, 'sem o armazenamento ligado na Vercel: avisa antes de mandar o vídeo');
  process.env.BLOB_READ_WRITE_TOKEN = RW;
  r = await chamar({ method: 'POST', body: { acao: 'video_checar', idToken: 'socio' } });
  ok(r.status === 200 && r.json().usuario === 'tech.campinas', 'tudo ligado: pode mandar');
  const semLogin = await envio('insta-video/maquina-12.mp4'), intruso = await envio('insta-video/maquina-12.mp4', 'intruso');
  ok(semLogin.status === 401 && intruso.status === 403, 'token de envio: sem login, 401; quem não é sócio, 403 (ninguém de fora sobe arquivo)');
  let ruins = 0;
  for (const nome of ['../x.mp4', 'outra/x.mp4', 'insta-video/x.exe', 'insta-video/a/b.mp4', 'insta-video/' + 'x'.repeat(120) + '.mp4']) if ((await envio(nome, 'socio')).status === 400) ruins++;
  ok(ruins === 5, 'só na pasta dos vídeos e só .mp4/.mov');
  blobs = [{ pathname: 'insta-video/velho.mp4', url: 'https://lojateste123.public.blob.vercel-storage.com/insta-video/velho.mp4', uploadedAt: new Date(Date.now() - 4 * 3600000).toISOString() },
    { pathname: 'insta-video/novo.mp4', url: 'https://lojateste123.public.blob.vercel-storage.com/insta-video/novo.mp4', uploadedAt: new Date(Date.now() - 600000).toISOString() }];
  blobApagados = [];
  r = await envio('insta-video/maquina-12-1795300000000.mov', 'socio');
  const ct = String(r.json().clientToken || '');
  const [, , , loja, cod] = ct.split('_'), [assin, dadosB64] = Buffer.from(cod || '', 'base64').toString().split('.');
  const dadosTk = JSON.parse(Buffer.from(dadosB64 || '', 'base64').toString() || '{}');
  ok(r.status === 200 && r.json().type === 'blob.generate-client-token' && ct.startsWith('vercel_blob_client_LojaTeste123_') && loja === 'LojaTeste123' &&
    assin === crypto.createHmac('sha256', RW).update(dadosB64).digest('hex'), 'sócio: recebe o token do envio, assinado com a chave da loja (o formato do @vercel/blob)');
  ok(dadosTk.pathname === 'insta-video/maquina-12-1795300000000.mov' && JSON.stringify(dadosTk.allowedContentTypes) === '["video/mp4","video/quicktime"]' &&
    dadosTk.maximumSizeInBytes === 300 * 1024 * 1024 && dadosTk.addRandomSuffix === true && Math.abs(dadosTk.validUntil - Date.now() - 3600000) < 5000 && !ct.includes('segredo'),
    'o token só vale para vídeo, até 300 MB, nesse nome, por 1 hora (e não leva a chave)');
  ok(JSON.stringify(blobApagados) === '["https://lojateste123.public.blob.vercel-storage.com/insta-video/velho.mp4"]', 'e apaga o que sobrou de envio antigo (mais de 3 horas)');
  const T = insta._teste, VURL = 'https://lojateste123.public.blob.vercel-storage.com/insta-video/maquina-12-1795300000000-AbC123xyz.mov';
  ok(T.urlDoVideo(VURL) === VURL && !T.urlDoVideo('https://outra.public.blob.vercel-storage.com/insta-video/x.mp4') && !T.urlDoVideo(VURL.replace('/insta-video/', '/outra/')) &&
    !T.urlDoVideo(VURL + '?x=1') && !T.urlDoVideo(VURL.replace('https:', 'http:')) && !T.urlDoVideo(VURL.replace('.public.', '.private.')) && !T.urlDoVideo('https://evil.com/insta-video/x.mp4'),
    'o vídeo que a Meta baixa só pode ser da nossa loja, na pasta dos vídeos');
  pedidos = []; contador = 0;
  r = await chamar({ method: 'POST', body: { acao: 'video', idToken: 'socio', url: VURL, legenda: 'Notebook Dell\nR$ 1.899', reels: true, story: true, capa: ID1 } });
  const cria = pedidos.filter(p => p.metodo === 'POST' && p.url.endsWith('/media'));
  ok(r.status === 200 && r.json().ids.reels === '17900000000001' && r.json().ids.story === '17900000000002', 'cria o Reels e o story');
  ok(cria[0].url === 'https://graph.facebook.com/v23.0/17841430007598170/media' && param(cria[0], 'media_type') === 'REELS' && param(cria[0], 'video_url') === VURL &&
    param(cria[0], 'caption') === 'Notebook Dell\nR$ 1.899' && param(cria[0], 'share_to_feed') === 'true' && param(cria[0], 'cover_url') === `https://anunc-ia.vercel.app/insta/img/${ID1}.jpg` &&
    param(cria[0], 'access_token') === 'EAAtokenDeTesteDoSistema', 'Reels: o vídeo da loja, a legenda, aparece no feed e a capa é a arte da máquina');
  ok(param(cria[1], 'media_type') === 'STORIES' && param(cria[1], 'video_url') === VURL && !param(cria[1], 'caption'), 'story: o mesmo vídeo, sem legenda');
  let errados = 0;
  for (const b of [{ url: 'https://evil.com/insta-video/x.mp4' }, { url: VURL, reels: false, story: false }]) if ((await chamar({ method: 'POST', body: { acao: 'video', idToken: 'socio', legenda: 'x', ...b } })).status === 400) errados++;
  r = await chamar({ method: 'POST', body: { acao: 'video', idToken: 'intruso', url: VURL, legenda: 'x' } });
  ok(errados === 2 && r.status === 403, 'vídeo de fora ou sem Reels nem story: 400; quem não é sócio: 403');
  videoSt = { 17900000000001: { status_code: 'IN_PROGRESS', status: 'In Progress' }, 17900000000002: { status_code: 'ERROR', status: 'Error: Media upload has failed with error code 2207026' } };
  r = await chamar({ method: 'POST', body: { acao: 'video_status', idToken: 'socio', ids: ['17900000000001', '17900000000002', '../x'] } });
  const sit = r.json().situacao || {};
  ok(r.status === 200 && sit['17900000000001'].status === 'IN_PROGRESS' && !sit['17900000000001'].erro && sit['17900000000002'].status === 'ERROR' &&
    /formato do vídeo: ele pede H\.264 ou HEVC/.test(sit['17900000000002'].erro) && Object.keys(sit).length === 2, 'acompanha o preparo; o erro da Meta (2207026) vira o motivo em português');
  ok(/expirou/.test(T.erroDoVideo('', 'EXPIRED')) && /baixar o vídeo/.test(T.erroDoVideo('Error: code 2207003', 'ERROR')) && /restrita/.test(T.erroDoVideo('error code 2207050', 'ERROR')) &&
    /preparar o vídeo: algo novo/.test(T.erroDoVideo('Error: algo novo', 'ERROR')), 'os outros erros comuns também (e o desconhecido vai com a mensagem da Meta)');
  pedidos = [];
  r = await chamar({ method: 'POST', body: { acao: 'video_publicar', idToken: 'socio', id: '17900000000001' } });
  const pubV = pedidos.find(p => p.url.endsWith('/media_publish'));
  ok(r.status === 200 && r.json().link === 'https://www.instagram.com/p/FB123/' && param(pubV, 'creation_id') === '17900000000001', 'publica quando fica pronto, com o link');
  r = await chamar({ method: 'POST', body: { acao: 'video_publicar', idToken: 'socio', id: 'c1' } });
  ok(r.status === 400, 'id que não é de contêiner: 400');
  blobApagados = []; pedidos = [];
  r = await chamar({ method: 'POST', body: { acao: 'video_apagar', idToken: 'socio', url: VURL } });
  const del = pedidos.find(p => p.url === 'https://vercel.com/api/blob/delete');
  ok(r.status === 200 && JSON.stringify(blobApagados) === JSON.stringify([VURL]) && del.headers['x-api-version'] === '13' && del.headers['x-vercel-blob-store-id'] === 'LojaTeste123',
    'no fim, apaga o vídeo do armazenamento');
  blobApagados = [];
  await chamar({ method: 'POST', body: { acao: 'video_apagar', idToken: 'socio', url: 'https://lojateste123.public.blob.vercel-storage.com/outra/coisa.png' } });
  r = await chamar({ method: 'POST', body: { acao: 'video_apagar', idToken: 'intruso', url: VURL } });
  ok(!blobApagados.length && r.status === 403, 'não apaga nada fora da pasta dos vídeos, nem a pedido de quem não é sócio');
  delete process.env.IG_TOKEN; delete process.env.BLOB_READ_WRITE_TOKEN; insta._teste.limparCache(); videoSt = {};

  console.log('\nvercel.json');
  const vj = require(path.join(__dirname, '..', 'vercel.json'));
  ok(vj.rewrites.some(x => x.source === '/insta/img/:arq' && x.destination === '/api/insta?img=:arq'), 'leva /insta/img/ para a função');
  ok(vj.functions['api/insta.js'].maxDuration >= 30, 'a função tem tempo para esperar a Meta');

  console.log('\nlegenda do post (index.html)');
  const { extrair } = require('./extrair.js');
  const fmt = v => 'R$ ' + Math.round(v || 0).toLocaleString('pt-BR');
  const fns = new Function('fmt', [extrair('function instaZap('), 'const instaTag=' + extrair('const instaTag=').slice('const instaTag='.length),
    extrair('function instaLegenda('), 'return { instaZap, instaTag, instaLegenda };'].join('\n'))(fmt);
  const maq = { id: 'p1', nome: 'Dell Latitude 5490 i5 8ª 16GB SSD 256GB', venda: 2199, custo: 1234, lucro: 965, fornecedor_nome: 'Fulano Peças', investidor: 'Beltrano' };
  const leg = fns.instaLegenda([maq], { selo: 'oferta da semana', frase: 'Notebooks revisados, com 90 dias de garantia.', desc: 'Bateria segura 4h, tela sem risco.',
    preco: () => ({ de: 2199, por: 1899, pct: 14 }), specs: () => ['🧠 2 slots RAM · 1 livre', '🔋 Bateria boa'], marca: () => 'Dell',
    cidade: 'Campinas · SP', zap: fns.instaZap('5519993956265'), loja: 'Tech Campinas' });
  ok(leg.startsWith('🔥 OFERTA DA SEMANA') && leg.includes('💻 Dell Latitude 5490 i5 8ª 16GB SSD 256GB') && leg.includes('🧠 2 slots RAM · 1 livre') &&
    leg.includes('Bateria segura 4h'), 'uma máquina: selo, nome, ficha e descrição');
  ok(leg.includes('💰 De R$ 2.199 por R$ 1.899 (-14%)'), 'promoção: de/por com o desconto');
  ok(leg.includes('✅ Revisado, com 90 dias de garantia') && (leg.match(/garantia/g) || []).length === 1, 'garantia uma vez só (a chamada padrão não repete)');
  ok(leg.includes('📍 Campinas · envio para todo o Brasil') && leg.includes('📲 Chama no WhatsApp: (19) 99395-6265'), 'cidade e WhatsApp da loja');
  ok(/#notebook #notebookusado #seminovo #campinas #dell #techcampinas$/.test(leg), 'hashtags: as fixas, a cidade, a marca e a loja');
  ok(!/1\.234|965|custo|lucro|Fulano|Beltrano/i.test(leg), 'nada de custo, lucro, fornecedor ou investidor');
  const leg2 = fns.instaLegenda([maq, { nome: 'Lenovo ThinkPad T480', venda: 2599.9, custo: 1500 }], { frase: 'Black Friday: até 20% off!', marca: p => /Lenovo/.test(p.nome) ? 'Lenovo' : 'Dell' });
  ok(leg2.startsWith('Black Friday: até 20% off!') && leg2.includes('💻 Dell Latitude 5490 i5 8ª 16GB SSD 256GB · R$ 2.199') &&
    leg2.includes('💻 Lenovo ThinkPad T480 · R$ 2.600') && leg2.includes('Todos revisados') && !/1\.500/.test(leg2), 'várias máquinas: uma linha cada, com o preço');
  ok(leg.length <= 2200 && (leg.match(/#/g) || []).length <= 30 && !/\n{3}/.test(leg), 'cabe no Instagram (2.200 letras, 30 hashtags) e sem buraco');
  ok(fns.instaZap('19993956265') === '(19) 99395-6265' && fns.instaZap('1932345678') === '(19) 3234-5678' && fns.instaZap('') === '', 'WhatsApp formatado');
  ok(fns.instaTag('São José') === 'saojose' && fns.instaTag('HP') === 'hp', 'hashtag sem acento nem espaço');

  console.log('\n' + (falhas ? falhas + ' FALHA(S)' : 'tudo verde'));
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
