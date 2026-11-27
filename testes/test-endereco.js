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

console.log('\npara subir no Google (catálogo)');
ok(/<title>[^<]*Notebooks seminovos em Campinas[^<]*<\/title>/.test(cat) && /<meta name="description" content="[^"]*Campinas[^"]*90 dias de garantia/.test(cat), 'título e descrição falam de notebook seminovo em Campinas, com garantia');
const onde = (cat.match(/<div class="onde" id="onde">([\s\S]*?)<\/div>/) || [])[1] || '';
const CID = ['Campinas', 'Hortolândia', 'Sumaré', 'Valinhos', 'Vinhedo', 'Indaiatuba', 'Jaguariúna', 'Nova Odessa', 'Sorocaba'];
ok(/<h2>Notebooks seminovos em Campinas e região<\/h2>/.test(onde) && CID.every(c => onde.includes(c)) && onde.includes('90 dias de garantia'), 'texto fixo com as cidades atendidas (o Google lê mesmo sem o catálogo carregar)');
ok(/if\(REV_ID\)\{ const o=document\.getElementById\('onde'\); if\(o\) o\.hidden=true; \}/.test(cat), 'no catálogo de revendedor, o texto da loja some');
ok(cat.includes('${REV_ID?`<div class="cd-nm">${esc(p.titulo)}</div>`:`<a class="cd-nm" href="/maquina/${esc(slugMaq(i))}" onclick="event.preventDefault()">${esc(p.titulo)}</a>`}'),
  'o nome de cada máquina é link para a página dela (o toque segue abrindo a ficha; no revendedor, sem link)');
// a loja para o Google, rodando a função do catálogo com um mundo de mentira
const trecho = cat.slice(cat.indexOf("const CIDADES=["), cat.indexOf('function waLink(msg){'));
const rodar = (revId, cfg, itens) => {
  const head = []; const doc = { getElementById: id => head.find(x => x.id === id) || null, createElement: () => ({}), head: { appendChild: x => head.push(x) } };
  const f = new Function('REV_ID', 'cfg', 'itens', 'document', 'waNum', trecho + '; return [lojaParaOGoogle(), lojaParaOGoogle()];');
  return [...f(revId, cfg, itens, doc, () => String(cfg.whatsapp || '').replace(/\D/g, '')), head];
};
const [ld, de_novo, head] = rodar('', { nome: 'Tech Campinas', whatsapp: '(19) 99999-0000', instagram: '@techcampinas' }, [{ preco: 2800 }, { preco: 1100 }, { preco: 3700 }, { preco: 0 }]);
ok(ld && ld['@type'] === 'ComputerStore' && ld.areaServed.length === 9 && ld.areaServed[0].name === 'Campinas' && ld.address.addressLocality === 'Campinas' && ld.telephone === '+5519999990000' &&
  ld.priceRange === 'R$ 1.100 a R$ 3.700' && ld.sameAs[0] === 'https://instagram.com/techcampinas' && ld.url === 'https://techcampinas.com.br/', 'a loja para o Google: computador, cidades atendidas, WhatsApp, faixa de preço e Instagram');
ok(de_novo === null && head.length === 1 && head[0].type === 'application/ld+json' && JSON.parse(head[0].textContent).name === 'Tech Campinas', 'entra uma vez só na página');
ok(rodar('rev1', { nome: 'Revendedor' }, [{ preco: 1000 }])[0] === null, 'no catálogo de revendedor não entra');

console.log(falhas ? `\n${falhas} FALHA(S)` : '\ntudo verde');
process.exit(falhas ? 1 : 0);
