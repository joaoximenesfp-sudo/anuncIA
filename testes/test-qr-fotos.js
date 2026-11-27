// A página que abre quando alguém escaneia o QR da etiqueta (index.html, sem estar logado): as fotos
// rolavam de lado com cada uma ocupando a largura toda, sem seta, contador ou dica, e parecia que a
// máquina só tinha uma foto. Agora a próxima aparece no canto, o contador mostra "1 / 8", há setas
// no computador e uma dica dizendo quantas são.
// uso: node testes/test-qr-fotos.js
const { extrair, SRC } = require('./extrair.js');
let falhas = 0;
const ok = (c, n) => { console.log((c ? '  ok  ' : '  FALHOU  ') + n); if (!c) falhas++; };
const css = SRC.slice(SRC.indexOf('<style>') + 7, SRC.indexOf('</style>'));

console.log('\no visual');
ok(/\.maq-fotos\.varias img\{width:86%\}/.test(css), 'com várias fotos, cada uma ocupa 86%: a próxima aparece no canto');
ok(/\.maq-fotos img\{[^}]*object-fit:contain/.test(css), 'a foto aparece inteira (sem cortar)');
ok(/\.maq-cont\{position:absolute/.test(css) && /\.maq-seta\{position:absolute/.test(css) && /@media \(hover:none\)\{\.maq-seta\{display:none\}\}/.test(css), 'contador sobre a foto; setas só onde há mouse');

console.log('\na página');
const h = new Function('CAT_ORIGEM_PUBLICA', 'esc', extrair('function maqPublicaHTML(') + 'return maqPublicaHTML;')('https://techcampinas.com.br', s => String(s || ''))(
  105, { id: 'x', estado: 'a_venda', ficha: { marca: 'Lenovo', modelo: 'T14' } }, { nome: 'Tech Campinas', whatsapp: '19999990000' }, '');
ok(/<div class="maq-gal" id="maqGal" hidden><div class="maq-fotos" id="maqFotos"><\/div>/.test(h) && /class="maq-seta ant"/.test(h) && /class="maq-seta prox"/.test(h) && /class="maq-cont"/.test(h) && /id="maqDica" hidden/.test(h),
  'a galeria tem fotos, setas, contador e a dica');
const fotos = extrair('async function maqPublicaFotos(');
ok(/box\.classList\.toggle\('varias', fotos\.length>1\)/.test(fotos) && /maqGaleria\(gal, box, fotos\.length, document\.getElementById\('maqDica'\)\)/.test(fotos), 'ao carregar as fotos, liga a galeria');

console.log('\no contador e as setas');
const G = new Function('window', 'matchMedia', extrair('function maqGaleria(') + 'return maqGaleria;');
const el = () => ({ hidden: false, disabled: false, textContent: '', onclick: null });
const montar = (n, mouse) => {
  const cont = el(), ant = el(), prox = el(), dica = el(); dica.hidden = true;
  const ouv = {}, rolou = [];
  const box = { scrollLeft: 0, clientWidth: 358, scrollWidth: n * 318, querySelector: () => ({ getBoundingClientRect: () => ({ width: 308 }) }),
    addEventListener: (t, f) => { ouv[t] = f; }, scrollBy: o => rolou.push(o.left) };
  const gal = { querySelector: s => ({ '.maq-cont': cont, '.maq-seta.ant': ant, '.maq-seta.prox': prox })[s] };
  const mm = () => ({ matches: mouse });
  G({ matchMedia: mm }, mm)(gal, box, n, dica);
  return { cont, ant, prox, dica, box, ouv, rolou };
};
let g = montar(8, false);
ok(g.cont.textContent === '1 / 8' && g.ant.disabled && !g.prox.disabled && !g.dica.hidden && g.dica.textContent === 'Arraste para o lado para ver as 8 fotos.', 'no começo: "1 / 8", só a seta de avançar, e a dica de arrastar');
g.box.scrollLeft = 318; g.ouv.scroll();
ok(g.cont.textContent === '2 / 8' && !g.ant.disabled, 'passou uma: "2 / 8"');
g.box.scrollLeft = g.box.scrollWidth - g.box.clientWidth; g.ouv.scroll();
ok(g.cont.textContent === '8 / 8' && g.prox.disabled, 'no fim: "8 / 8", mesmo sem a última encostar à esquerda');
g.prox.onclick(); g.ant.onclick();
ok(g.rolou[0] === 318 && g.rolou[1] === -318, 'as setas passam uma foto de cada vez');
ok(montar(3, true).dica.textContent === 'Use as setas para ver as 3 fotos.', 'no computador, a dica fala das setas');
g = montar(1, true);
ok(g.cont.hidden && g.ant.hidden && g.prox.hidden && g.dica.hidden, 'uma foto só: sem contador, setas ou dica');

console.log(falhas ? `\n${falhas} FALHA(S)` : '\ntudo verde');
process.exit(falhas ? 1 : 0);
