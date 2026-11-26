// Loja no endereço principal: no techcampinas.com.br, o "/" mostra o catálogo sem trocar o
// endereço; no anunc-ia.vercel.app (e nas prévias), o "/" continua sendo o sistema. E o Google
// pode ler o "/" da loja, mas o sistema fica fora da busca pela etiqueta da própria página.
// uso: node testes/test-endereco.js
const fs = require('fs'), path = require('path'), vm = require('vm');
const RAIZ = path.join(__dirname, '..');
const ler = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
let falhas = 0;
const ok = (c, n) => { console.log((c ? '  ok  ' : '  FALHOU  ') + n); if (!c) falhas++; };

// o middleware é ESM (a Vercel empacota); aqui ele roda como função comum
const src = ler('middleware.js');
const mod = { exports: {} };
vm.runInNewContext(src.replace(/^export const config/m, 'const config').replace(/^export default function middleware/m, 'function middleware') +
  '\nmodule.exports = { config, middleware };', { module: mod, URL, Response, Headers });
const { config, middleware } = mod.exports;
const pedir = (url, host) => middleware(new Request(url, { headers: host ? { host } : {} }));
const desvio = r => r.headers.get('x-middleware-rewrite');
const segue = r => r.headers.get('x-middleware-next') === '1' && !desvio(r);

console.log('middleware');
ok(JSON.stringify(config.matcher) === '["/"]', 'só roda no "/" (o resto do site nem passa por ele)');
ok(desvio(pedir('https://techcampinas.com.br/', 'techcampinas.com.br')) === 'https://techcampinas.com.br/catalogo.html', 'techcampinas.com.br/: mostra o catálogo sem trocar o endereço');
ok(desvio(pedir('https://techcampinas.com.br/?q=thinkpad&r=abc', 'techcampinas.com.br')) === 'https://techcampinas.com.br/catalogo.html?q=thinkpad&r=abc', 'a busca e o link do revendedor seguem junto');
ok(desvio(pedir('https://techcampinas.com.br/', 'TechCampinas.com.br:443')) === 'https://techcampinas.com.br/catalogo.html', 'maiúscula e porta no endereço não atrapalham');
ok(segue(pedir('https://anunc-ia.vercel.app/', 'anunc-ia.vercel.app')), 'anunc-ia.vercel.app/: continua o sistema');
ok(segue(pedir('https://anunc-k46qt1594-joaoximenesfp-sudos-projects.vercel.app/', 'anunc-k46qt1594-joaoximenesfp-sudos-projects.vercel.app')), 'prévia da Vercel: continua o sistema');
ok(segue(pedir('https://techcampinas.com.br/blog', 'techcampinas.com.br')), 'outras páginas da loja não são desviadas');

console.log('\nconfiguração e páginas');
const vj = JSON.parse(ler('vercel.json'));
ok(!(vj.redirects || []).some(r => r.source === '/'), 'nenhum redirecionamento no "/" (ele passaria na frente do middleware)');
const robots = ler('robots.txt');
ok(!/^Disallow:\s*\/\$?\s*$/m.test(robots) && !/^Disallow:\s*\/index\.html/m.test(robots), 'o robots.txt deixa o Google ler o "/" da loja');
ok(/^Disallow: \/api\/$/m.test(robots) && /^Disallow: \/tela\/$/m.test(robots), 'as funções e a tela dos carros seguem fora');
ok(/<meta name="robots" content="noindex, nofollow">/.test(ler('index.html').slice(0, 2000)), 'o sistema pede para ficar fora da busca');
const cat = ler('catalogo.html');
ok(cat.includes('<link rel="canonical" href="https://techcampinas.com.br/">') && cat.includes('<meta property="og:url" content="https://techcampinas.com.br/">'), 'o endereço oficial do catálogo é a raiz');
ok(!/name="robots"[^>]*noindex/.test(cat), 'o catálogo pode aparecer na busca');

console.log(falhas ? `\n${falhas} FALHA(S)` : '\ntudo verde');
process.exit(falhas ? 1 : 0);
