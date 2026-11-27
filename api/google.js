// Google (busca): os números do Search Console no Insights do sistema (só sócio).
// A loja cria uma conta de serviço no Google Cloud (projeto do Firebase), guarda o JSON dela só na
// variável GSC_SERVICE_ACCOUNT da Vercel e adiciona o e-mail dessa conta no Search Console com a
// permissão Restrita (só leitura). Aqui a função pede ao Google um passe de 1 hora com essa chave e
// lê só os números de busca: cliques, impressões, CTR, posição, por dia, buscas e páginas.
//
// POST /api/google {idToken, dias}   dias: 7, 28 ou 90 (padrão 28)
//   → { ok, ligado: true, site, de, ate, dias, total, antes, porDia, buscas, paginas }
//   → { ok, ligado: false, falta: 'chave' | 'acesso', email?, passos }   quando ainda não está ligado
const crypto = require('crypto');
const N = require('../tela/nucleo.js');

const ESCOPO = 'https://www.googleapis.com/auth/webmasters.readonly';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API = 'https://searchconsole.googleapis.com/webmasters/v3'; // o mesmo serviço que se ativa no Google Cloud (Google Search Console API)
const DOMINIO = 'techcampinas.com.br';
const PROJETO = N.PROJETO;
const erro = (status, msg) => Object.assign(new Error(msg), { status });
const diaBR = (t = Date.now()) => new Date(t).toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' }).slice(0, 10);
const somaDias = (dia, n) => { const d = new Date(dia + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

const PASSOS = [
  `No Google Cloud (console.cloud.google.com), no projeto ${PROJETO} (o mesmo do Firebase), em APIs e serviços › Biblioteca, ative a "Google Search Console API".`,
  'Em IAM e administrador › Contas de serviço, crie uma conta (por exemplo "search-console"), sem nenhum papel. Abra a conta › Chaves › Adicionar chave › JSON: o Google baixa um arquivo.',
  'Na Vercel (projeto anunc-ia) › Settings › Environment Variables, crie GSC_SERVICE_ACCOUNT com o conteúdo inteiro desse arquivo (Sensitive, Production). Não mande esse arquivo para ninguém.',
  `No Search Console › Configurações › Usuários e permissões › Adicionar usuário: o e-mail da conta de serviço (termina em @${PROJETO}.iam.gserviceaccount.com), com a permissão Restrita.`,
  'Publique o site de novo (a Vercel só lê variável nova num deploy novo). Pronto: os números aparecem aqui.',
];

// ── QUEM PODE (só sócio) ──
async function exigirSocio(idToken) {
  if (!idToken || typeof idToken !== 'string' || idToken.length > 5000) throw erro(401, 'Entre no sistema de novo.');
  const r = await fetch(N.urlDoc('config', 'blog'), { headers: { Authorization: 'Bearer ' + idToken } });
  if (r.status === 401 || r.status === 403) throw erro(403, 'Só os sócios veem os números do Google.');
  if (!r.ok && r.status !== 404) throw erro(502, 'Não consegui falar com o banco agora. Tente de novo.');
}

// ── A CHAVE E O PASSE DO GOOGLE ──
function contaDeServico() {
  // tira espaço, quebra de linha e caractere invisível das pontas (o Bloco de Notas às vezes põe um no começo)
  const bruto = String(process.env.GSC_SERVICE_ACCOUNT || '').replace(/^[\s﻿​]+|[\s﻿​]+$/g, '');
  if (!bruto) return null;
  const tentar = t => { try { const j = JSON.parse(t); return typeof j === 'string' ? JSON.parse(j) : j; } catch (e) { return null; } };
  let j = tentar(bruto);
  // colado com sobra em volta (ex.: GSC_SERVICE_ACCOUNT={...} ou entre aspas): vale o que está entre a primeira { e a última }
  const ini = bruto.indexOf('{'), fim = bruto.lastIndexOf('}');
  if (!j && ini >= 0 && fim > ini) j = tentar(bruto.slice(ini, fim + 1));
  if (!j && /^[A-Za-z0-9+/=\s]+$/.test(bruto)) j = tentar(Buffer.from(bruto, 'base64').toString('utf8'));
  if (!j || typeof j !== 'object' || !j.client_email || !j.private_key) {
    // diz o que veio de errado sem mostrar nada do conteúdo
    const pistas = [`tem ${bruto.length.toLocaleString('pt-BR')} caracteres (o certo tem uns 2.300)`,
      bruto.startsWith('{') ? 'começa com {' : 'não começa com {',
      /"type"\s*:\s*"service_account"/.test(bruto) ? 'diz service_account' : 'não diz service_account',
      /client_email/.test(bruto) ? 'tem client_email' : 'não tem client_email',
      /BEGIN PRIVATE KEY/.test(bruto) ? 'tem a chave privada' : 'não tem a chave privada'];
    throw erro(500, `A chave do Google na Vercel (GSC_SERVICE_ACCOUNT) não é o JSON da conta de serviço (${pistas.join(', ')}). Apague a variável e crie de novo colando o arquivo inteiro, que começa com {"type": "service_account".`);
  }
  return { email: String(j.client_email), chave: String(j.private_key).replace(/\\n/g, '\n') };
}
const b64url = b => Buffer.from(b).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
let passe = null;
async function passeDoGoogle(conta, agora = Math.floor(Date.now() / 1000)) {
  if (passe && passe.email === conta.email && passe.ate > agora + 120) return passe.token;
  const corpo = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' })) + '.' +
    b64url(JSON.stringify({ iss: conta.email, scope: ESCOPO, aud: TOKEN_URL, iat: agora, exp: agora + 3600 }));
  let assinatura;
  try { assinatura = b64url(crypto.createSign('RSA-SHA256').update(corpo).sign(conta.chave)); }
  catch (e) { throw erro(500, 'A chave do Google na Vercel (GSC_SERVICE_ACCOUNT) está quebrada. Gere outra chave JSON e cole de novo.'); }
  const r = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: corpo + '.' + assinatura }).toString(), signal: AbortSignal.timeout(10000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw erro(502, 'O Google recusou a chave da conta de serviço. Confira o GSC_SERVICE_ACCOUNT na Vercel (pode ter sido apagada no Google Cloud).');
  passe = { email: conta.email, token: j.access_token, ate: agora + (Number(j.expires_in) || 3600) };
  return passe.token;
}

// ── O SEARCH CONSOLE ──
async function pedir(token, caminho, corpo) {
  const r = await fetch(API + caminho, { method: corpo ? 'POST' : 'GET', headers: Object.assign({ Authorization: 'Bearer ' + token }, corpo ? { 'Content-Type': 'application/json' } : {}),
    body: corpo ? JSON.stringify(corpo) : undefined, signal: AbortSignal.timeout(15000) });
  const j = await r.json().catch(() => ({}));
  if (r.status === 403) {
    if (/has not been used|is disabled|SERVICE_DISABLED|accessNotConfigured/i.test(JSON.stringify(j))) throw erro(503, 'A "Google Search Console API" ainda não está ativada no Google Cloud (passo 1).');
    throw erro(403, 'A conta de serviço ainda não tem acesso ao site no Search Console (passo 4).');
  }
  if (!r.ok) throw erro(502, 'O Google não respondeu agora. Tente de novo em instantes.');
  return j;
}
// O site da loja entre os que a conta de serviço enxerga: a propriedade de domínio, se houver; senão, a do endereço.
async function acharSite(token) {
  const j = await pedir(token, '/sites');
  const sites = (j.siteEntry || []).filter(s => s && s.siteUrl && s.permissionLevel !== 'siteUnverifiedUser').map(s => s.siteUrl);
  return sites.find(s => s === 'sc-domain:' + DOMINIO) || sites.find(s => new RegExp('^https?://(www\\.)?' + DOMINIO.replace(/\./g, '\\.') + '/?$').test(s)) || '';
}
const consulta = (token, site, corpo) => pedir(token, `/sites/${encodeURIComponent(site)}/searchAnalytics/query`, Object.assign({ dataState: 'all' }, corpo)).then(j => j.rows || []);
const numeros = l => {
  const x = l && l[0] ? l[0] : {};
  return { cliques: Number(x.clicks) || 0, impressoes: Number(x.impressions) || 0, ctr: Number(x.ctr) || 0, posicao: Number(x.position) || 0 };
};
// O nome que dá para ler: a página principal, a máquina (sem o código do fim) ou o artigo do blog.
function nomeDaPagina(url) {
  let p = '';
  try { p = new URL(url).pathname; } catch (e) { p = String(url || ''); }
  const texto = s => decodeURIComponent(s).replace(/-/g, ' ').trim();
  if (p === '/' || p === '/catalogo.html') return { tipo: 'loja', nome: 'Página principal (catálogo)' };
  let m;
  if ((m = p.match(/^\/maquina\/([^/]+)$/))) return { tipo: 'maquina', nome: texto(m[1].replace(/-[A-Za-z0-9]{1,64}$/, '')) };
  if ((m = p.match(/^\/blog\/([^/]+)$/))) return { tipo: 'blog', nome: texto(m[1]) };
  if (p === '/blog' || p === '/blog/') return { tipo: 'blog', nome: 'Blog (lista de artigos)' };
  return { tipo: 'outra', nome: p };
}

let memoria = {};
async function numerosDoGoogle(dias, hoje = diaBR()) {
  const conta = contaDeServico();
  if (!conta) return { ok: true, ligado: false, falta: 'chave', passos: PASSOS };
  const chave = dias + '|' + hoje;
  if (memoria[chave] && Date.now() - memoria[chave].t < 600000) return memoria[chave].d;
  const token = await passeDoGoogle(conta);
  const site = await acharSite(token);
  if (!site) return { ok: true, ligado: false, falta: 'acesso', email: conta.email, passos: PASSOS };
  // o Google fecha o dia com atraso: o período termina ontem e o de antes tem o mesmo tamanho
  const ate = somaDias(hoje, -1), de = somaDias(ate, -(dias - 1));
  const antesAte = somaDias(de, -1), antesDe = somaDias(antesAte, -(dias - 1));
  const [total, antes, porDia, buscas, paginas] = await Promise.all([
    consulta(token, site, { startDate: de, endDate: ate }),
    consulta(token, site, { startDate: antesDe, endDate: antesAte }),
    consulta(token, site, { startDate: de, endDate: ate, dimensions: ['date'], rowLimit: 100 }),
    consulta(token, site, { startDate: de, endDate: ate, dimensions: ['query'], rowLimit: 15 }),
    consulta(token, site, { startDate: de, endDate: ate, dimensions: ['page'], rowLimit: 15 }),
  ]);
  const linha = r => ({ cliques: Number(r.clicks) || 0, impressoes: Number(r.impressions) || 0, ctr: Number(r.ctr) || 0, posicao: Number(r.position) || 0 });
  const d = {
    ok: true, ligado: true, site, de, ate, dias, total: numeros(total), antes: numeros(antes),
    porDia: porDia.map(r => Object.assign({ dia: String((r.keys || [])[0] || '') }, linha(r))).filter(r => r.dia).sort((a, b) => a.dia.localeCompare(b.dia)),
    buscas: buscas.map(r => Object.assign({ texto: String((r.keys || [])[0] || '').slice(0, 120) }, linha(r))),
    paginas: paginas.map(r => Object.assign({ url: String((r.keys || [])[0] || '') }, nomeDaPagina((r.keys || [])[0]), linha(r))),
  };
  memoria = { [chave]: { t: Date.now(), d } };
  return d;
}

// ── ENTRADA ──
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
  try {
    if (req.method !== 'POST') return json(res, 405, { erro: 'Use POST.' });
    const corpo = await lerCorpo(req);
    await exigirSocio(corpo.idToken);
    const dias = [7, 28, 90].includes(Number(corpo.dias)) ? Number(corpo.dias) : 28;
    return json(res, 200, await numerosDoGoogle(dias));
  } catch (e) {
    if (!e.status) console.log('google erro', e.message);
    return json(res, e.status || 500, { erro: e.status ? e.message : 'Erro inesperado ao ler o Google.' });
  }
};
module.exports._teste = { contaDeServico, passeDoGoogle, acharSite, nomeDaPagina, numerosDoGoogle, PASSOS, somaDias,
  limpar: () => { passe = null; memoria = {}; } };
