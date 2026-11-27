// Google (busca) no Insights (api/google.js): só sócio vê; sem a chave, mostra o passo a passo; com a
// chave, pede o passe ao Google assinando com a conta de serviço (o teste confere a assinatura), acha o
// site da loja e devolve cliques, impressões, CTR e posição do período e do anterior, por dia, as buscas
// e as páginas com nome legível. O Google e o Firestore são de mentira.
// uso: node testes/test-google-busca.js
const path = require('path'), crypto = require('crypto');
let falhas = 0;
const ok = (c, n) => { console.log((c ? '  ok  ' : '  FALHOU  ') + n); if (!c) falhas++; };

const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048, publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
const EMAIL = 'search-console@anuncia-70b88.iam.gserviceaccount.com';
delete process.env.GSC_SERVICE_ACCOUNT;
const google = require(path.join(__dirname, '..', 'api', 'google.js'));
const T = google._teste;

// ── o mundo de mentira ──
let sites = [], passes = 0, jwt = null, consultas = [], apiDesligada = false;
const resposta = (status, corpo) => ({ ok: status >= 200 && status < 300, status, json: async () => corpo });
global.fetch = async (url, op = {}) => {
  const u = new URL(String(url)); const h = op.headers || {};
  if (u.hostname === 'firestore.googleapis.com') return h.Authorization === 'Bearer socio' ? resposta(404, {}) : resposta(403, { error: { status: 'PERMISSION_DENIED' } });
  if (String(url) === 'https://oauth2.googleapis.com/token') {
    passes++;
    const p = new URLSearchParams(op.body);
    const [cab, corpo, ass] = p.get('assertion').split('.');
    const de64 = s => JSON.parse(Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
    jwt = { grant: p.get('grant_type'), cab: de64(cab), corpo: de64(corpo),
      valida: crypto.createVerify('RSA-SHA256').update(cab + '.' + corpo).verify(publicKey, Buffer.from(ass.replace(/-/g, '+').replace(/_/g, '/'), 'base64')) };
    return jwt.valida ? resposta(200, { access_token: 'passe-' + passes, expires_in: 3600 }) : resposta(400, { error: 'invalid_grant' });
  }
  if (u.hostname === 'searchconsole.googleapis.com' && u.pathname.startsWith('/webmasters/v3/')) {
    if (h.Authorization !== 'Bearer passe-' + passes) return resposta(401, {});
    if (apiDesligada) return resposta(403, { error: { message: 'Google Search Console API has not been used in project 123 before or it is disabled.', status: 'PERMISSION_DENIED' } });
    if (u.pathname === '/webmasters/v3/sites') return resposta(200, { siteEntry: sites });
    const m = u.pathname.match(/^\/webmasters\/v3\/sites\/([^/]+)\/searchAnalytics\/query$/);
    if (m) {
      const c = JSON.parse(op.body); consultas.push({ site: decodeURIComponent(m[1]), ...c });
      const dim = (c.dimensions || [])[0];
      if (!dim) return resposta(200, { rows: c.startDate < '2026-10-29' ? [{ clicks: 30, impressions: 900, ctr: 0.0333, position: 22.1 }] : [{ clicks: 42, impressions: 1200, ctr: 0.035, position: 18.4 }] });
      if (dim === 'date') return resposta(200, { rows: [{ keys: ['2026-11-25'], clicks: 5, impressions: 90, ctr: 0.055, position: 15 }, { keys: ['2026-11-24'], clicks: 3, impressions: 70, ctr: 0.043, position: 17 }] });
      if (dim === 'query') return resposta(200, { rows: [{ keys: ['thinkpad campinas'], clicks: 10, impressions: 80, ctr: 0.125, position: 4.2 }, { keys: ['notebook usado campinas'], clicks: 6, impressions: 300, ctr: 0.02, position: 11.7 }] });
      if (dim === 'page') return resposta(200, { rows: [
        { keys: ['https://techcampinas.com.br/maquina/lenovo-thinkpad-t14-gen-1-i7-10-0LsX6OctFnvM82iuTziJ'], clicks: 9, impressions: 150, ctr: 0.06, position: 6.1 },
        { keys: ['https://techcampinas.com.br/'], clicks: 20, impressions: 500, ctr: 0.04, position: 9.3 },
        { keys: ['https://techcampinas.com.br/blog/whatsapp-agora-deixa-agendar-mensagens-veja-como-usar'], clicks: 2, impressions: 400, ctr: 0.005, position: 14 }] });
    }
  }
  return resposta(404, {});
};
function chamar(req) {
  return new Promise(resolve => {
    const res = { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, end(b) { resolve({ status: this.statusCode, headers: this.headers, json: JSON.parse(String(b)) }); } };
    google(req, res);
  });
}
const post = body => chamar({ method: 'POST', body });

(async () => {
  console.log('quem pode');
  let r = await post({ idToken: 'outro', dias: 28 });
  ok(r.status === 403 && /Só os sócios/.test(r.json.erro), 'quem não é sócio não vê');
  r = await chamar({ method: 'GET', body: {} });
  ok(r.status === 405, 'só POST');

  console.log('\nainda não ligado');
  r = await post({ idToken: 'socio', dias: 28 });
  ok(r.status === 200 && r.json.ligado === false && r.json.falta === 'chave' && r.json.passos.length === 5 && /GSC_SERVICE_ACCOUNT/.test(r.json.passos.join(' ')) &&
    /anuncia-70b88/.test(r.json.passos.join(' ')) && /Restrita/.test(r.json.passos.join(' ')), 'sem a chave: o passo a passo (API, conta de serviço, variável na Vercel, usuário Restrito no Search Console)');
  process.env.GSC_SERVICE_ACCOUNT = '{"tipo":"errado"}';
  r = await post({ idToken: 'socio', dias: 28 });
  ok(r.status === 500 && /JSON da conta de serviço/.test(r.json.erro), 'chave que não é o JSON da conta de serviço: avisa o que colar');
  ok(/tem 17 caracteres/.test(r.json.erro) && /não tem client_email/.test(r.json.erro) && /não tem a chave privada/.test(r.json.erro) && !/errado/.test(r.json.erro),
    'e diz o que veio de errado (tamanho, começo, o que falta), sem mostrar nada do conteúdo');
  const contaOk = JSON.stringify({ type: 'service_account', client_email: EMAIL, private_key: privateKey.replace(/\n/g, '\\n') });
  for (const [colado, nome] of [['﻿' + contaOk + '\n\n', 'com caractere invisível no começo e linhas em branco'], ['GSC_SERVICE_ACCOUNT=' + contaOk, 'com o nome da variável na frente'],
    [JSON.stringify(contaOk), 'entre aspas (JSON dentro de texto)'], [Buffer.from(contaOk).toString('base64'), 'em base64'], [contaOk + '\n' + contaOk, 'duas vezes seguidas (vale a primeira)']]) {
    process.env.GSC_SERVICE_ACCOUNT = colado;
    let c = null; try { c = T.contaDeServico(); } catch (e) { c = null; }
    ok(c && c.email === EMAIL && c.chave.includes('\n-----END PRIVATE KEY-----') || (c && c.email === EMAIL && /BEGIN PRIVATE KEY/.test(c.chave)), 'a chave colada ' + nome + ' também vale');
  }

  // a chave como vem no arquivo do Google (com \n escrito dentro do texto)
  process.env.GSC_SERVICE_ACCOUNT = JSON.stringify({ type: 'service_account', client_email: EMAIL, private_key: privateKey.replace(/\n/g, '\\n') });
  T.limpar();
  sites = [{ siteUrl: 'https://outro-site.com.br/', permissionLevel: 'siteOwner' }];
  r = await post({ idToken: 'socio', dias: 28 });
  ok(r.status === 200 && r.json.ligado === false && r.json.falta === 'acesso' && r.json.email === EMAIL, 'chave certa, mas o site ainda não deu acesso: mostra o e-mail que falta adicionar');
  ok(jwt && jwt.valida && jwt.grant === 'urn:ietf:params:oauth:grant-type:jwt-bearer' && jwt.cab.alg === 'RS256' && jwt.corpo.iss === EMAIL &&
    jwt.corpo.scope === 'https://www.googleapis.com/auth/webmasters.readonly' && jwt.corpo.aud === 'https://oauth2.googleapis.com/token' && jwt.corpo.exp - jwt.corpo.iat === 3600,
    'o passe é pedido com a assinatura da conta de serviço, só para leitura do Search Console, por 1 hora');

  console.log('\nligado');
  T.limpar(); passes = 0;
  sites = [{ siteUrl: 'https://techcampinas.com.br/', permissionLevel: 'siteRestrictedUser' }, { siteUrl: 'sc-domain:techcampinas.com.br', permissionLevel: 'siteRestrictedUser' }, { siteUrl: 'https://outro-site.com.br/', permissionLevel: 'siteOwner' }];
  consultas = [];
  const d = await T.numerosDoGoogle(28, '2026-11-26');
  ok(d.ligado && d.site === 'sc-domain:techcampinas.com.br' && consultas.every(c => c.site === 'sc-domain:techcampinas.com.br'), 'acha o site da loja (a propriedade de domínio, quando existe)');
  const atual = consultas.find(c => !c.dimensions && c.startDate === '2026-10-29'), anterior = consultas.find(c => !c.dimensions && c.startDate === '2026-10-01');
  ok(d.de === '2026-10-29' && d.ate === '2026-11-25' && atual && atual.endDate === '2026-11-25' && anterior && anterior.endDate === '2026-10-28' && consultas.every(c => c.dataState === 'all'),
    'os últimos 28 dias até ontem, e os 28 de antes para comparar (com os dados mais recentes do Google)');
  ok(JSON.stringify(d.total) === '{"cliques":42,"impressoes":1200,"ctr":0.035,"posicao":18.4}' && JSON.stringify(d.antes) === '{"cliques":30,"impressoes":900,"ctr":0.0333,"posicao":22.1}',
    'cliques, impressões, CTR e posição média do período e do anterior');
  ok(d.porDia.map(x => x.dia).join() === '2026-11-24,2026-11-25' && d.porDia[1].cliques === 5, 'por dia, em ordem');
  ok(d.buscas[0].texto === 'thinkpad campinas' && d.buscas[0].posicao === 4.2 && d.buscas.length === 2, 'o que as pessoas buscaram');
  ok(d.paginas[0].tipo === 'maquina' && d.paginas[0].nome === 'lenovo thinkpad t14 gen 1 i7 10' && d.paginas[1].nome === 'Página principal (catálogo)' && d.paginas[2].tipo === 'blog' &&
    d.paginas[2].nome === 'whatsapp agora deixa agendar mensagens veja como usar', 'as páginas com nome legível (máquina sem o código, página principal e artigo)');
  const n = consultas.length;
  await T.numerosDoGoogle(28, '2026-11-26');
  ok(consultas.length === n && passes === 1, 'abrir de novo logo depois não pede tudo ao Google outra vez');

  T.limpar(); consultas = [];
  r = await post({ idToken: 'socio', dias: 365 });
  const c0 = consultas.find(c => !c.dimensions);
  ok(r.status === 200 && r.json.dias === 28 && c0 && (new Date(c0.endDate) - new Date(c0.startDate)) / 864e5 === 27, 'período fora da lista (7, 28, 90) vira 28 dias');
  T.limpar(); consultas = [];
  r = await post({ idToken: 'socio', dias: 7 });
  ok(r.json.dias === 7 && consultas.some(c => !c.dimensions && (new Date(c.endDate) - new Date(c.startDate)) / 864e5 === 6), '7 dias também');

  T.limpar(); apiDesligada = true;
  r = await post({ idToken: 'socio', dias: 28 });
  ok(r.status === 503 && /não está ativada/.test(r.json.erro), 'API desligada no Google Cloud: diz que falta o passo 1');
  apiDesligada = false;

  console.log(falhas ? `\n${falhas} FALHA(S)` : '\ntudo verde');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
