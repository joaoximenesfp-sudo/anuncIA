// Imagem de confirmação ("não sou um robô") das telas de login do sistema e do
// painel dos tablets.
//   GET  /api/captcha               → { ok, img (SVG em data URL), token }
//   POST { token, resposta }        → { ok } ou { ok:false, erro }
//
// Cada pedido gera uma imagem nova. As letras são desenhadas como traços tortos
// (caminhos, não texto), cada uma com tamanho, giro e posição próprios, e com
// linhas e pontos por cima: para ler, é preciso enxergar a imagem. A resposta
// não vai para a página: o token leva só a validade e uma assinatura (HMAC) da
// resposta, que só este servidor sabe conferir.
//
// A chave sai de CAPTCHA_SECRET (ou, sem ela, de ML_SECRET / IG_TOKEN, que já
// estão na Vercel), sempre passada por um HMAC próprio: não é a chave deles.
const crypto = require('crypto');

const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // sem I, L, O, 0 e 1: confundem
const TAM = 5, VALIDADE = 10 * 60 * 1000, L = 200, A = 64;

// Cada caractere em traços numa grade de 10 × 14 (x para a direita, y para baixo).
const GLIFOS = {
  A: [[[0, 14], [5, 0], [10, 14]], [[2.2, 9], [7.8, 9]]],
  B: [[[0, 0], [0, 14]], [[0, 0], [6, 0], [9, 2], [9, 5], [6, 7], [0, 7]], [[6, 7], [10, 9.5], [10, 12], [7, 14], [0, 14]]],
  C: [[[10, 2], [7, 0], [3, 0], [0, 3], [0, 11], [3, 14], [7, 14], [10, 12]]],
  D: [[[0, 0], [0, 14], [6, 14], [10, 10], [10, 4], [6, 0], [0, 0]]],
  E: [[[10, 0], [0, 0], [0, 14], [10, 14]], [[0, 7], [7, 7]]],
  F: [[[10, 0], [0, 0], [0, 14]], [[0, 7], [7, 7]]],
  G: [[[10, 2], [7, 0], [3, 0], [0, 3], [0, 11], [3, 14], [7, 14], [10, 11], [10, 8], [6, 8]]],
  H: [[[0, 0], [0, 14]], [[10, 0], [10, 14]], [[0, 7], [10, 7]]],
  J: [[[10, 0], [10, 11], [7, 14], [3, 14], [0, 11]]],
  K: [[[0, 0], [0, 14]], [[10, 0], [0, 8]], [[3, 6], [10, 14]]],
  M: [[[0, 14], [0, 0], [5, 8], [10, 0], [10, 14]]],
  N: [[[0, 14], [0, 0], [10, 14], [10, 0]]],
  P: [[[0, 14], [0, 0], [7, 0], [10, 2], [10, 5], [7, 7], [0, 7]]],
  Q: [[[3, 0], [0, 3], [0, 11], [3, 14], [7, 14], [10, 11], [10, 3], [7, 0], [3, 0]], [[6, 10], [10, 14]]],
  R: [[[0, 14], [0, 0], [7, 0], [10, 2], [10, 5], [7, 7], [0, 7]], [[5, 7], [10, 14]]],
  S: [[[10, 2], [7, 0], [3, 0], [0, 2], [0, 5], [3, 7], [7, 7], [10, 9], [10, 12], [7, 14], [3, 14], [0, 12]]],
  T: [[[0, 0], [10, 0]], [[5, 0], [5, 14]]],
  U: [[[0, 0], [0, 11], [3, 14], [7, 14], [10, 11], [10, 0]]],
  V: [[[0, 0], [5, 14], [10, 0]]],
  W: [[[0, 0], [2, 14], [5, 6], [8, 14], [10, 0]]],
  X: [[[0, 0], [10, 14]], [[10, 0], [0, 14]]],
  Y: [[[0, 0], [5, 7], [10, 0]], [[5, 7], [5, 14]]],
  Z: [[[0, 0], [10, 0], [0, 14], [10, 14]]],
  2: [[[0, 3], [3, 0], [7, 0], [10, 3], [10, 6], [0, 14], [10, 14]]],
  3: [[[0, 1.5], [3, 0], [7, 0], [10, 3], [7, 7], [4, 7]], [[7, 7], [10, 10], [10, 12], [7, 14], [3, 14], [0, 12.5]]],
  4: [[[8, 14], [8, 0], [0, 10], [10, 10]]],
  5: [[[10, 0], [1, 0], [0, 6], [6, 6], [10, 9], [10, 12], [7, 14], [3, 14], [0, 12]]],
  6: [[[9, 1], [6, 0], [3, 0], [0, 4], [0, 11], [3, 14], [7, 14], [10, 11], [10, 8.5], [7, 6.5], [3, 6.5], [0, 8.5]]],
  7: [[[0, 0], [10, 0], [4, 14]]],
  8: [[[5, 7], [2, 5], [2, 2], [4, 0], [6, 0], [8, 2], [8, 5], [5, 7], [1, 9], [0, 11.5], [2, 14], [8, 14], [10, 11.5], [9, 9], [5, 7]]],
  9: [[[10, 7], [7, 8], [3, 8], [0, 6], [0, 3], [3, 0], [7, 0], [10, 3], [10, 10], [7, 14], [3, 14], [1, 13]]],
};

function chave() {
  const base = process.env.CAPTCHA_SECRET || process.env.ML_SECRET || process.env.IG_TOKEN || '';
  if (!base) { const e = new Error('A imagem de confirmação está indisponível (falta a chave na Vercel).'); e.status = 503; throw e; }
  return crypto.createHmac('sha256', base).update('anuncia/captcha/v1').digest();
}
// o que a pessoa digitou: sem espaço nem acento, maiúscula
const normal = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const assinar = (corpo, resposta) => crypto.createHmac('sha256', chave()).update(corpo + '|' + normal(resposta)).digest('base64url');

function novo(agora, rnd = Math.random) {
  let cod = '';
  for (let i = 0; i < TAM; i++) cod += ALFABETO[crypto.randomInt(ALFABETO.length)];
  const corpo = Buffer.from(JSON.stringify({ e: agora + VALIDADE, n: crypto.randomBytes(6).toString('hex') })).toString('base64url');
  return { cod, token: corpo + '.' + assinar(corpo, cod), svg: desenhar(cod, rnd) };
}
// '' quando confere; senão, o motivo (para a tela)
function conferir(token, resposta, agora) {
  const [corpo, sig] = String(token || '').split('.');
  const velha = 'Essa imagem não vale mais. Digite os caracteres da imagem nova.';
  if (!corpo || !sig) return velha;
  let d;
  try { d = JSON.parse(Buffer.from(corpo, 'base64url').toString('utf8')); } catch (e) { return velha; }
  if (!d || typeof d.e !== 'number') return velha;
  if (!(d.e > agora)) return 'A imagem venceu (vale 10 minutos). Digite os caracteres da imagem nova.';
  const certo = Buffer.from(assinar(corpo, resposta)), veio = Buffer.from(sig);
  if (!normal(resposta) || certo.length !== veio.length || !crypto.timingSafeEqual(certo, veio))
    return 'Os caracteres não conferem. Digite os da imagem nova.';
  return '';
}

const f = n => n.toFixed(1);
function curva(r, cor, w, op) {
  const y = () => f(r(8, A - 8));
  return `<path d="M${f(r(-10, 20))} ${y()} C${f(r(40, 80))} ${y()} ${f(r(110, 160))} ${y()} ${f(r(L - 20, L + 10))} ${y()}" fill="none" stroke="${cor}" stroke-width="${f(w)}" stroke-linecap="round" opacity="${op}"/>`;
}
function desenhar(cod, rnd = Math.random) {
  const r = (a, b) => a + rnd() * (b - a);
  const cores = ['#0b1221', '#14532d', '#1e3a8a', '#581c87', '#7c2d12', '#134e4a', '#3f3f46'];
  const cor = () => cores[Math.floor(rnd() * cores.length)];
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${L}" height="${A}" viewBox="0 0 ${L} ${A}"><rect width="${L}" height="${A}" fill="#f4f6f9"/>`;
  // fundo com manchas claras e curvas finas
  for (let i = 0; i < 6; i++)
    s += `<ellipse cx="${f(r(0, L))}" cy="${f(r(0, A))}" rx="${f(r(18, 50))}" ry="${f(r(8, 26))}" fill="hsl(${Math.floor(r(0, 360))},70%,${Math.floor(r(84, 93))}%)" opacity=".8"/>`;
  for (let i = 0; i < 3; i++) s += curva(r, cor(), r(0.8, 1.2), 0.45);
  // as letras: cada uma com tamanho, giro, posição e cor próprios, e os pontos tremidos
  const passo = (L - 24) / cod.length;
  [...cod].forEach((ch, i) => {
    const esc = r(2.35, 2.8), ang = r(-18, 18) * Math.PI / 180, c = Math.cos(ang), sn = Math.sin(ang);
    const cx = 12 + passo * (i + 0.5) + r(-4, 4), cy = A / 2 + r(-5, 5);
    const pt = ([x, y]) => {
      const px = (x - 5 + r(-0.45, 0.45)) * esc, py = (y - 7 + r(-0.45, 0.45)) * esc;
      return f(cx + px * c - py * sn) + ' ' + f(cy + px * sn + py * c);
    };
    const d = GLIFOS[ch].map(linha => linha.map((p, k) => (k ? 'L' : 'M') + pt(p)).join('')).join('');
    s += `<path d="${d}" fill="none" stroke="${cor()}" stroke-width="${f(r(2.8, 3.6))}" stroke-linecap="round" stroke-linejoin="round"/>`;
  });
  // por cima: curvas que cruzam as letras e pontinhos
  s += curva(r, cor(), r(1, 1.4), 0.6);
  for (let i = 0; i < 40; i++)
    s += `<circle cx="${f(r(0, L))}" cy="${f(r(0, A))}" r="${f(r(0.6, 1.6))}" fill="${cor()}" opacity="${r(0.3, 0.8).toFixed(2)}"/>`;
  return s + '</svg>';
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
  for await (const parte of req) { txt += parte; if (txt.length > 10000) break; }
  try { return JSON.parse(txt || '{}'); } catch (e) { return {}; }
}

module.exports = async (req, res) => {
  try {
    if (req.method === 'GET') {
      const c = novo(Date.now());
      return json(res, 200, { ok: true, img: 'data:image/svg+xml;base64,' + Buffer.from(c.svg).toString('base64'), token: c.token });
    }
    if (req.method !== 'POST') return json(res, 405, { ok: false, erro: 'Use GET ou POST.' });
    const corpo = await lerCorpo(req);
    const erro = conferir(corpo.token, String(corpo.resposta || '').slice(0, 20), Date.now());
    return json(res, 200, erro ? { ok: false, erro } : { ok: true });
  } catch (e) {
    console.log('captcha erro', e.status || 500, e.message);
    return json(res, e.status || 500, { ok: false, erro: e.message || 'Erro inesperado.' });
  }
};
module.exports._teste = { novo, conferir, desenhar, normal, ALFABETO, GLIFOS, VALIDADE, TAM };
