// Avaliações dos clientes, no site da loja.
// Só quem comprou avalia: o sócio gera um convite por venda (um link com um código que ninguém
// adivinha), o cliente dá a nota e escreve, e a avaliação só aparece no site depois que um sócio
// aprova. O arquivo fica no Vercel Blob num caminho que sai da chave do Blob (que só o servidor
// conhece): convites e avaliações ainda não aprovadas não ficam à vista de ninguém.
//
// GET  /api/avaliacoes                       as publicadas (nota média, total e a lista), para o site
// GET  /api/avaliacoes?convite=<código>      o convite ainda vale? (a página de avaliar)
// POST /api/avaliacoes {acao:'enviar', convite, nota, texto, nome, autorizo}   o cliente avalia
// POST /api/avaliacoes {acao, idToken}  só sócio: convidar | lista | publicar | recusar
const crypto = require('crypto');
const { put } = require('@vercel/blob');
const N = require('../tela/nucleo.js');

const SITE = 'https://techcampinas.com.br';
const VALIDADE_DIAS = 120;        // o convite vale por uns 4 meses depois da venda
const TEXTO_MIN = 10, TEXTO_MAX = 600, NOME_MAX = 40, PRODUTO_MAX = 80;
let guardar = put;                // os testes trocam por um de mentira
const erro = (status, msg) => Object.assign(new Error(msg), { status });

// ── ONDE FICA (Vercel Blob, num caminho secreto) ──
const blobToken = () => String(process.env.BLOB_READ_WRITE_TOKEN || '').trim();
const blobLoja = () => blobToken().split('_')[3] || ''; // vercel_blob_rw_<loja>_<segredo>
const caminho = () => 'avaliacoes/' + crypto.createHash('sha256').update('avaliacoes|' + blobToken()).digest('hex').slice(0, 32) + '.json';
const urlDados = () => `https://${blobLoja().toLowerCase()}.public.blob.vercel-storage.com/${caminho()}`;
const vazio = () => ({ convites: {}, avaliacoes: [], atualizado_em: '' });
let memoria = null;
function arrumar(d) {
  if (!d || typeof d !== 'object') return vazio();
  return { convites: d.convites && typeof d.convites === 'object' ? d.convites : {},
    avaliacoes: Array.isArray(d.avaliacoes) ? d.avaliacoes.filter(a => a && a.id) : [], atualizado_em: d.atualizado_em || '' };
}
async function ler(fresco) {
  if (!fresco && memoria && Date.now() - memoria.t < 30000) return memoria.d;
  if (!blobLoja()) return vazio();
  const r = await fetch(urlDados() + '?v=' + Date.now(), { cache: 'no-store' });
  if (r.status === 404) return vazio();
  if (!r.ok) throw erro(502, 'Não consegui ler as avaliações agora.');
  const d = arrumar(await r.json());
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

// ── O QUE VAI PARA O SITE ──
const limpo = (s, max) => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f<>]/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);
const primeiroNome = s => limpo(s, NOME_MAX).split(/\s+/)[0] || '';
function publicas(d) {
  const lista = d.avaliacoes.filter(a => a.status === 'publicada')
    .sort((a, b) => String(b.criada_em).localeCompare(String(a.criada_em)))
    .map(a => ({ id: a.id, nota: a.nota, texto: a.texto, nome: a.nome, produto: a.produto || '', data: String(a.criada_em || '').slice(0, 10) }));
  const media = lista.length ? Math.round(lista.reduce((s, a) => s + a.nota, 0) / lista.length * 10) / 10 : 0;
  return { ok: true, total: lista.length, media, avaliacoes: lista };
}
const conviteValido = c => c && !c.usado_em && Date.now() - Date.parse(c.criado_em || 0) < VALIDADE_DIAS * 864e5;

// ── O CLIENTE AVALIA ──
async function enviar(corpo) {
  const codigo = String(corpo.convite || '');
  if (!/^[a-f0-9]{24}$/.test(codigo)) throw erro(400, 'Este link de avaliação não está completo. Abra de novo o link que a loja mandou.');
  const nota = Number(corpo.nota), texto = limpo(corpo.texto, TEXTO_MAX), nome = limpo(corpo.nome, NOME_MAX);
  if (!Number.isInteger(nota) || nota < 1 || nota > 5) throw erro(400, 'Escolha de 1 a 5 estrelas.');
  if (texto.length < TEXTO_MIN) throw erro(400, 'Conte um pouco mais sobre a compra (pelo menos uma frase).');
  if (nome.length < 2) throw erro(400, 'Escreva o seu nome como quer que apareça.');
  if (corpo.autorizo !== true) throw erro(400, 'Para publicar no site, marque que você autoriza.');
  const d = await ler(true);
  const c = d.convites[codigo];
  if (!c) throw erro(404, 'Este link de avaliação não existe. Peça um novo para a loja.');
  if (c.usado_em || d.avaliacoes.some(a => a.id === codigo)) throw erro(409, 'Este link já foi usado. Obrigado pela avaliação!');
  if (!conviteValido(c)) throw erro(410, 'Este link de avaliação venceu. Peça um novo para a loja.');
  c.usado_em = new Date().toISOString();
  d.avaliacoes.unshift({ id: codigo, nota, texto, nome, produto: c.produto || '', produto_id: c.produto_id || '',
    criada_em: c.usado_em, status: 'pendente', decidida_em: '' });
  await gravar(d);
  console.log('avaliação recebida', nota, 'estrelas');
  return { ok: true };
}

// ── O SISTEMA (só sócio) ──
async function exigirSocio(idToken) {
  if (!idToken || typeof idToken !== 'string' || idToken.length > 5000) throw erro(401, 'Entre no sistema de novo.');
  const r = await fetch(N.urlDoc('config', 'avaliacoes'), { headers: { Authorization: 'Bearer ' + idToken } });
  if (r.status === 401 || r.status === 403) throw erro(403, 'Só os sócios mexem nas avaliações. Entre no sistema de novo.');
  if (!r.ok && r.status !== 404) throw erro(502, 'Não consegui falar com o banco agora. Tente de novo.');
}
const linkDe = codigo => `${SITE}/avaliar#c=${codigo}`;
async function acaoDoSistema(corpo) {
  await exigirSocio(corpo.idToken);
  const d = await ler(true);
  if (corpo.acao === 'convidar') {
    const produto_id = limpo(corpo.produto_id, 60), produto = limpo(corpo.produto, PRODUTO_MAX), cliente = primeiroNome(corpo.cliente);
    // a mesma venda não ganha dois links ao mesmo tempo: o que ainda vale é reaproveitado
    const ja = produto_id && Object.entries(d.convites).find(([, c]) => c.produto_id === produto_id && conviteValido(c));
    if (ja) return { ok: true, codigo: ja[0], link: linkDe(ja[0]), novo: false };
    const codigo = crypto.randomBytes(12).toString('hex');
    d.convites[codigo] = { produto_id, produto, cliente, criado_em: new Date().toISOString(), usado_em: '' };
    // convite velho e não usado sai do arquivo
    for (const [k, c] of Object.entries(d.convites)) if (!c.usado_em && Date.now() - Date.parse(c.criado_em || 0) > VALIDADE_DIAS * 864e5) delete d.convites[k];
    await gravar(d);
    return { ok: true, codigo, link: linkDe(codigo), novo: true };
  }
  if (corpo.acao === 'lista') {
    const abertos = Object.values(d.convites).filter(conviteValido).length;
    return { ok: true, avaliacoes: d.avaliacoes, convites_abertos: abertos, ...(({ media, total }) => ({ media, total }))(publicas(d)) };
  }
  if (corpo.acao === 'publicar' || corpo.acao === 'recusar') {
    const a = d.avaliacoes.find(x => x.id === String(corpo.id || ''));
    if (!a) throw erro(404, 'Essa avaliação não existe mais.');
    a.status = corpo.acao === 'publicar' ? 'publicada' : 'recusada';
    a.decidida_em = new Date().toISOString();
    await gravar(d);
    return { ok: true, avaliacao: a };
  }
  throw erro(400, 'Ação desconhecida.');
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
  for await (const parte of req) { txt += parte; if (txt.length > 20000) break; }
  try { return JSON.parse(txt || '{}'); } catch (e) { return {}; }
}
module.exports = async (req, res) => {
  const q = req.query || Object.fromEntries(new URL(req.url, 'http://x').searchParams);
  try {
    if (req.method === 'POST') {
      const corpo = await lerCorpo(req);
      if (corpo.acao === 'enviar') return enviarResp(res, 200, await enviar(corpo));
      return enviarResp(res, 200, await acaoDoSistema(corpo));
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return enviarResp(res, 405, { erro: 'Use GET ou POST.' });
    if (q.convite !== undefined) {
      const codigo = String(q.convite || '');
      const c = /^[a-f0-9]{24}$/.test(codigo) ? (await ler(true)).convites[codigo] : null;
      if (!c) return enviarResp(res, 404, { ok: false, erro: 'Este link de avaliação não existe. Peça um novo para a loja.' });
      if (c.usado_em) return enviarResp(res, 409, { ok: false, usado: true, erro: 'Este link já foi usado. Obrigado pela avaliação!' });
      if (!conviteValido(c)) return enviarResp(res, 410, { ok: false, erro: 'Este link de avaliação venceu. Peça um novo para a loja.' });
      return enviarResp(res, 200, { ok: true, produto: c.produto || '', cliente: c.cliente || '' });
    }
    return enviarResp(res, 200, publicas(await ler()), 'public, max-age=0, s-maxage=60, stale-while-revalidate=600');
  } catch (e) {
    console.log('avaliacoes erro', e.status || 500, e.message);
    return enviarResp(res, e.status || 500, { ok: false, erro: e.status ? e.message : 'Algo deu errado. Tente de novo.' });
  }
};
module.exports._teste = { usarGravador: f => { guardar = f; }, limparMemoria: () => { memoria = null; }, caminho, publicas, linkDe, VALIDADE_DIAS };
