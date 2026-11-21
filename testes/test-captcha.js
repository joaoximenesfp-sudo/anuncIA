// Imagem de confirmação do login (api/captcha.js): o código só tem caracteres que não
// confundem, a imagem é desenhada (sem o texto dentro do SVG), a resposta certa passa
// (maiúscula, minúscula, com espaço), a errada não, e token vencido, adulterado ou
// assinado por outra chave também não. Testa também o servidor de ponta a ponta.
// uso: node testes/test-captcha.js
const path = require('path');
let falhas = 0;
const ok = (c, n) => { console.log((c ? '  ok  ' : '  FALHOU  ') + n); if (!c) falhas++; };

process.env.CAPTCHA_SECRET = 'segredo-captcha-de-teste';
const arq = path.join(__dirname, '..', 'api', 'captcha.js');
const api = require(arq);
const T = api._teste;

console.log('\no código e o desenho');
ok(!/[ILO01]/.test(T.ALFABETO) && T.ALFABETO.length === 31, 'alfabeto sem I, L, O, 0 e 1 (os que confundem): ' + T.ALFABETO);
ok([...T.ALFABETO].every(c => T.GLIFOS[c]), 'todo caractere do alfabeto tem desenho');
ok(Object.values(T.GLIFOS).every(g => g.every(l => l.length >= 2 && l.every(([x, y]) => x >= 0 && x <= 10 && y >= 0 && y <= 14))), 'os desenhos cabem na grade de 10 × 14');
const agora = Date.parse('2026-11-21T12:00:00Z');
const lote = Array.from({ length: 300 }, () => T.novo(agora));
ok(lote.every(c => c.cod.length === T.TAM && [...c.cod].every(ch => T.ALFABETO.includes(ch))), 'código de 5 caracteres, todos do alfabeto');
ok(new Set(lote.map(c => c.cod)).size > 290 && new Set(lote.map(c => c.token)).size === 300, 'cada imagem é nova (código e token não se repetem)');
ok(lote.every(c => c.svg.startsWith('<svg') && !/<text|<script|foreignObject|href|on\w+=/i.test(c.svg)), 'a imagem é só desenho: sem texto, script, link ou evento dentro do SVG');
ok(lote.every(c => !c.svg.includes(c.cod) && !c.token.includes(c.cod)), 'o código não aparece escrito nem na imagem nem no token');
ok(lote.every(c => (c.svg.match(/<path d="M/g) || []).length === 3 + 5 + 1), 'cada letra é um caminho próprio (3 curvas de fundo + 5 letras + 1 curva por cima)');
const d1 = T.desenhar('ABCDE'), d2 = T.desenhar('ABCDE');
ok(d1 !== d2, 'o mesmo código sai com desenho diferente a cada vez (giro, tamanho e tremor sorteados)');

console.log('\nconferir');
const c = lote[0];
ok(T.conferir(c.token, c.cod, agora + 1000) === '', 'a resposta certa passa');
ok(T.conferir(c.token, c.cod.toLowerCase(), agora + 1000) === '' && T.conferir(c.token, ' ' + c.cod.split('').join(' ') + ' ', agora + 1000) === '', 'minúscula e com espaços também passa');
const errado = c.cod.slice(0, 4) + (c.cod[4] === 'A' ? 'B' : 'A');
ok(/não conferem/.test(T.conferir(c.token, errado, agora + 1000)), 'um caractere errado não passa');
ok(/não conferem/.test(T.conferir(c.token, '', agora + 1000)), 'em branco não passa');
ok(/venceu/.test(T.conferir(c.token, c.cod, agora + T.VALIDADE + 1)), 'depois de 10 minutos, venceu');
const [corpo, sig] = c.token.split('.');
const corpo2 = Buffer.from(JSON.stringify({ e: agora + 99 * T.VALIDADE, n: 'x' })).toString('base64url');
ok(/não conferem/.test(T.conferir(corpo2 + '.' + sig, c.cod, agora + 1000)), 'trocar a validade no token não passa (a assinatura não bate)');
ok(/não vale mais/.test(T.conferir('lixo', c.cod, agora)) && /não vale mais/.test(T.conferir('', c.cod, agora)) && /não vale mais/.test(T.conferir('@@@.abc', c.cod, agora)), 'token quebrado ou vazio não passa');
ok(/não conferem/.test(T.conferir(corpo + '.' + sig.slice(0, -2) + 'xx', c.cod, agora + 1000)), 'assinatura mexida não passa');
process.env.CAPTCHA_SECRET = 'outra-chave';
ok(/não conferem/.test(T.conferir(c.token, c.cod, agora + 1000)), 'token assinado com outra chave não passa');
process.env.CAPTCHA_SECRET = 'segredo-captcha-de-teste';

console.log('\nsem chave na Vercel');
const salvo = { C: process.env.CAPTCHA_SECRET, M: process.env.ML_SECRET, I: process.env.IG_TOKEN };
delete process.env.CAPTCHA_SECRET; delete process.env.ML_SECRET; delete process.env.IG_TOKEN;
let semChave = null; try { T.novo(agora); } catch (e) { semChave = e; }
ok(semChave && semChave.status === 503 && /indisponível/.test(semChave.message), 'sem nenhuma chave: avisa (503), em vez de gerar imagem que qualquer um confere');
process.env.ML_SECRET = 'segredo-ml';
const cMl = T.novo(agora);
ok(T.conferir(cMl.token, cMl.cod, agora) === '', 'sem CAPTCHA_SECRET, usa uma chave tirada do ML_SECRET');
Object.assign(process.env, { CAPTCHA_SECRET: salvo.C }); if (salvo.M === undefined) delete process.env.ML_SECRET; if (salvo.I !== undefined) process.env.IG_TOKEN = salvo.I;

console.log('\no servidor de ponta a ponta');
const chamar = (method, body) => new Promise(res => {
  const r = { statusCode: 0, cab: {}, setHeader(k, v) { this.cab[k.toLowerCase()] = v; }, end(t) { res({ status: this.statusCode, cab: this.cab, j: JSON.parse(t) }); } };
  api({ method, body, url: '/api/captcha', headers: {} }, r);
});
(async () => {
  const g = await chamar('GET');
  ok(g.status === 200 && g.j.ok && /^data:image\/svg\+xml;base64,/.test(g.j.img) && g.j.token && !('cod' in g.j) && g.cab['cache-control'] === 'no-store',
    'GET: devolve a imagem e o token (sem a resposta), sem cache');
  const svg = Buffer.from(g.j.img.split(',')[1], 'base64').toString('utf8');
  ok(svg.startsWith('<svg') && !/<text/.test(svg), 'a imagem que vai para a página é o desenho');
  const r1 = await chamar('POST', { token: g.j.token, resposta: 'ZZZZZ' });
  ok(r1.status === 200 && r1.j.ok === false && /não conferem/.test(r1.j.erro), 'POST com a resposta errada: ok:false e o motivo');
  const r2 = await chamar('POST', { token: g.j.token, resposta: 'x'.repeat(5000) });
  ok(r2.j.ok === false, 'resposta enorme não passa (é cortada antes)');
  const r3 = await chamar('PUT', {});
  ok(r3.status === 405, 'outro método: 405');
  console.log('\n' + (falhas ? falhas + ' FALHA(S)' : 'tudo verde'));
  process.exit(falhas ? 1 : 0);
})();
