// Search Console: o Google confirma que o site é da loja lendo um arquivo na raiz.
// Se o arquivo sumir, mudar ou for redirecionado, o Google desfaz a verificação e
// os números de busca param de chegar. Este teste segura isso.
// uso: node testes/test-search-console.js
const fs = require('fs'), path = require('path');
const RAIZ = path.join(__dirname, '..');
const ARQ = 'google897f3ee59aff3773.html';
let falhas = 0;
const ok = (c, n) => { console.log((c ? '  ok  ' : '  FALHOU  ') + n); if (!c) falhas++; };

const caminho = path.join(RAIZ, ARQ);
const existe = fs.existsSync(caminho);
ok(existe, 'o arquivo de verificação está na raiz: ' + ARQ);
ok(existe && fs.readFileSync(caminho, 'utf8').trim() === 'google-site-verification: ' + ARQ, 'o conteúdo é o que o Google espera');

// o Google não segue redirecionamento na hora de ler o arquivo
const vj = JSON.parse(fs.readFileSync(path.join(RAIZ, 'vercel.json'), 'utf8'));
ok(!vj.cleanUrls && !vj.trailingSlash, 'a Vercel não troca o endereço dos .html');
const casa = src => new RegExp('^' + String(src).split('/')
  .map(p => p.startsWith(':') ? '[^/]+' : p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('/') + '$').test('/' + ARQ);
ok(!(vj.redirects || []).some(r => casa(r.source)), 'nenhum redirecionamento pega o arquivo');

const robots = fs.readFileSync(path.join(RAIZ, 'robots.txt'), 'utf8');
ok(/^Sitemap: https:\/\/techcampinas\.com\.br\/sitemap\.xml$/m.test(robots), 'o robots.txt aponta o sitemap do domínio');

console.log(falhas ? `\n${falhas} FALHA(S)` : '\ntudo verde');
process.exit(falhas ? 1 : 0);
