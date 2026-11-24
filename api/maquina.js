// Página da máquina: o que aparece para quem escaneia o QR da etiqueta sem estar logado.
// O sistema (sócio logado) manda a ficha pública de cada máquina numerada, e a página lê
// daqui, sem login. Só entra o que o catálogo já mostra: modelo, configuração, estado,
// recursos e descrição. Custo, preço, fornecedor, cliente e anotação interna nunca chegam
// aqui: o servidor monta cada ficha só com os campos permitidos, venha o que vier.
// O arquivo fica no Vercel Blob num caminho que sai da chave do Blob (que só o servidor conhece).
//
// GET  /api/maquina?n=17                                              a ficha da #17
// POST /api/maquina {acao:'sincronizar', idToken, maquinas, remover}  só sócio: troca as que
//      vieram (pelo número) e tira as de `remover`; as outras ficam como estão, para um
//      aparelho com a lista velha não desfazer o que o outro sócio mudou.
const crypto = require('crypto');
const { put } = require('@vercel/blob');
const N = require('../tela/nucleo.js');

const MAX = 3000;
const ESTADOS = ['a_venda', 'reservada', 'chegando', 'em_preparo', 'vendida'];
const CAMPOS_FICHA = ['marca', 'modelo', 'cpu', 'ger', 'ram', 'ram_tipo', 'armaz', 'tela'];
let guardar = put;                // os testes trocam por um de mentira
const erro = (status, msg) => Object.assign(new Error(msg), { status });

// ── ONDE FICA (Vercel Blob, num caminho secreto) ──
const blobToken = () => String(process.env.BLOB_READ_WRITE_TOKEN || '').trim();
const blobLoja = () => blobToken().split('_')[3] || ''; // vercel_blob_rw_<loja>_<segredo>
const caminho = () => 'maquinas/' + crypto.createHash('sha256').update('maquinas|' + blobToken()).digest('hex').slice(0, 32) + '.json';
const urlDados = () => `https://${blobLoja().toLowerCase()}.public.blob.vercel-storage.com/${caminho()}`;
const vazio = () => ({ maquinas: {}, atualizado_em: '' });
let memoria = null;
async function ler(fresco) {
  if (!fresco && memoria && Date.now() - memoria.t < 30000) return memoria.d;
  if (!blobLoja()) return vazio();
  const r = await fetch(urlDados() + '?v=' + Date.now(), { cache: 'no-store' });
  if (r.status === 404) return vazio();
  if (!r.ok) throw erro(502, 'Não consegui ler as máquinas agora.');
  const j = await r.json();
  const d = { maquinas: j && j.maquinas && typeof j.maquinas === 'object' ? j.maquinas : {}, atualizado_em: (j && j.atualizado_em) || '' };
  memoria = { t: Date.now(), d };
  return d;
}
async function gravar(d) {
  if (!blobToken()) throw erro(503, 'Falta o armazenamento (Vercel Blob) no projeto.');
  d.atualizado_em = new Date().toISOString();
  await guardar(caminho(), JSON.stringify(d), { access: 'public', addRandomSuffix: false, allowOverwrite: true,
    contentType: 'application/json; charset=utf-8', cacheControlMaxAge: 0, token: blobToken() });
  memoria = { t: Date.now(), d };
  return d;
}

// ── A FICHA PÚBLICA: só os campos permitidos ──
const limpo = (s, max) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const texto = (s, max) => String(s == null ? '' : s).replace(/[\u0000-\u0009\u000b-\u001f\u007f<>]/g, ' ').replace(/[ \t]+/g, ' ')
  .replace(/\n{3,}/g, '\n\n').trim().slice(0, max);
const lista = (a, max, tam) => (Array.isArray(a) ? a : []).map(x => limpo(x, tam)).filter(Boolean).slice(0, max);
const numero = v => { const n = Number(v); return Number.isInteger(n) && n >= 1 && n <= 999999 ? n : 0; };
function fichaPublica(m) {
  const num = numero(m && m.num);
  if (!num) return null;
  const f = m.ficha && typeof m.ficha === 'object' ? m.ficha : {};
  const ficha = {};
  for (const k of CAMPOS_FICHA) { const v = limpo(f[k], 40); if (v) ficha[k] = v; }
  return {
    num,
    id: /^[A-Za-z0-9_-]{1,40}$/.test(String(m.id || '')) ? String(m.id) : '',
    nome: limpo(m.nome, 120),
    tipo: limpo(m.tipo, 20),
    estado: ESTADOS.includes(m.estado) ? m.estado : 'em_preparo',
    ficha,
    specs: lista(m.specs, 14, 70),
    recursos: lista(m.recursos, 14, 40),
    sistema: limpo(m.sistema, 40),
    resolucao: limpo(m.resolucao, 40),
    cor: limpo(m.cor, 30),
    descricao: texto(m.descricao, 600),
    video: /^[A-Za-z0-9_-]{6,20}$/.test(String(m.video || '')) ? String(m.video) : '',
  };
}

// ── O SISTEMA (só sócio) ──
async function exigirSocio(idToken) {
  if (!idToken || typeof idToken !== 'string' || idToken.length > 5000) throw erro(401, 'Entre no sistema de novo.');
  const r = await fetch(N.urlDoc('config', 'maquinas'), { headers: { Authorization: 'Bearer ' + idToken } });
  if (r.status === 401 || r.status === 403) throw erro(403, 'Só os sócios publicam a ficha das máquinas.');
  if (!r.ok && r.status !== 404) throw erro(502, 'Não consegui falar com o banco agora. Tente de novo.');
}
async function sincronizar(corpo) {
  await exigirSocio(corpo.idToken);
  const vindas = Array.isArray(corpo.maquinas) ? corpo.maquinas : [];
  const remover = Array.isArray(corpo.remover) ? corpo.remover.map(numero).filter(Boolean) : [];
  if (vindas.length > MAX || remover.length > MAX) throw erro(413, 'Máquinas demais de uma vez.');
  const d = await ler(true);
  for (const n of remover) delete d.maquinas[n];
  let novas = 0;
  for (const m of vindas) { const f = fichaPublica(m); if (f) { d.maquinas[f.num] = f; novas++; } }
  if (Object.keys(d.maquinas).length > MAX) throw erro(413, 'Máquinas demais.');
  await gravar(d);
  return { ok: true, atualizadas: novas, removidas: remover.length, total: Object.keys(d.maquinas).length };
}

// ── HTTP ──
function enviarResp(res, status, obj, cache) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', cache || 'no-store');
  res.end(JSON.stringify(obj));
}
async function lerCorpo(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch (e) { return {}; } }
  let txt = '';
  for await (const parte of req) { txt += parte; if (txt.length > 4e6) break; }
  try { return JSON.parse(txt || '{}'); } catch (e) { return {}; }
}
module.exports = async (req, res) => {
  const q = req.query || Object.fromEntries(new URL(req.url, 'http://x').searchParams);
  try {
    if (req.method === 'POST') {
      const corpo = await lerCorpo(req);
      if (corpo.acao === 'sincronizar') return enviarResp(res, 200, await sincronizar(corpo));
      throw erro(400, 'Ação desconhecida.');
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return enviarResp(res, 405, { erro: 'Use GET ou POST.' });
    const n = numero(q.n);
    if (!n) return enviarResp(res, 400, { ok: false, erro: 'Número de etiqueta inválido.' });
    const m = (await ler()).maquinas[n];
    if (!m) return enviarResp(res, 404, { ok: false, num: n, erro: 'Esta máquina ainda não tem ficha publicada.' }, 'public, max-age=0, s-maxage=30');
    return enviarResp(res, 200, { ok: true, maquina: m }, 'public, max-age=0, s-maxage=60, stale-while-revalidate=300');
  } catch (e) {
    console.log('maquina erro', e.status || 500, e.message);
    return enviarResp(res, e.status || 500, { ok: false, erro: e.status ? e.message : 'Algo deu errado. Tente de novo.' });
  }
};
module.exports._teste = { usarGravador: f => { guardar = f; }, limparMemoria: () => { memoria = null; }, caminho, fichaPublica, ESTADOS };
