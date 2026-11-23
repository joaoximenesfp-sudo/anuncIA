// "Compramos seu usado" no catálogo (catalogo.html): o cliente conta o que tem e a conversa
// abre no WhatsApp já escrita, começando por "Vi no site". No sistema (index.html), a loja
// liga/desliga a seção e pode mandar as ofertas para outro WhatsApp.
// uso: node testes/test-compra-usados.js
const fs = require('fs'), path = require('path');
const { SRC: IDX } = require('./extrair.js');
const CAT = fs.readFileSync(path.join(__dirname, '..', 'catalogo.html'), 'utf8');
let falhas = 0;
const ok = (c, n) => { console.log((c ? '  ok  ' : '  FALHOU  ') + n); if (!c) falhas++; };
function extrairDe(src, assinatura) {
  const i = src.indexOf(assinatura);
  if (i < 0) throw new Error('não achei: ' + assinatura);
  let k = src.indexOf('{', i), d = 0;
  for (; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (d === 0) { k++; break; } } }
  return src.slice(i, k);
}
const vndMsg = new Function(extrairDe(CAT, 'function vndMsg(d){') + '\nreturn vndMsg;')();

console.log('\na mensagem do WhatsApp');
const cheia = vndMsg({ tipo: 'notebook', modelo: 'Dell Latitude 5490', config: 'i5 de 8ª geração, 8 GB', estado: 'bem', carreg: 'sim', local: 'Cambuí, Campinas' });
console.log(cheia.split('\n').map(l => '      ' + l).join('\n'));
ok(cheia === [
  'Olá! Vi no site que vocês compram usados. Tenho um notebook para vender.',
  '• Marca e modelo: Dell Latitude 5490',
  '• Processador e memória: i5 de 8ª geração, 8 GB',
  '• Estado: funcionando bem',
  '• Carregador ou fonte: tem',
  '• Bairro e cidade: Cambuí, Campinas',
  '',
  'Vou mandar as fotos aqui.'].join('\n'), 'com tudo preenchido, uma linha por resposta');
const vazia = vndMsg({ tipo: 'notebook' });
ok(vazia === 'Olá! Vi no site que vocês compram usados. Tenho um notebook para vender.\n\nVou mandar as fotos aqui.', 'sem resposta: só a abertura e o aviso das fotos, sem linha vazia de campo');
ok(/Tenho um desktop ou mini PC para vender/.test(vndMsg({ tipo: 'desktop' })) && /Tenho um equipamento para vender/.test(vndMsg({ tipo: 'outro' })), 'desktop/mini PC e outro');
ok(/• Estado: não liga/.test(vndMsg({ tipo: 'notebook', estado: 'nao_liga' })) && /• Estado: funciona, mas tem defeito/.test(vndMsg({ tipo: 'notebook', estado: 'defeito' })), 'estado: não liga e com defeito');
ok(/• Carregador ou fonte: não tem/.test(vndMsg({ tipo: 'notebook', carreg: 'nao' })), 'sem carregador');
const suja = vndMsg({ tipo: 'notebook', modelo: '  Dell\n\nLatitude\t5490  ', local: 'x'.repeat(200) });
ok(/• Marca e modelo: Dell Latitude 5490\n/.test(suja) && /• Bairro e cidade: x{80}\n/.test(suja), 'quebra de linha vira espaço e cada resposta tem no máximo 80 letras');
ok(/^Olá! Vi no site/.test(cheia), 'abre com "Vi no site": a loja sabe que a compra veio do site');

console.log('\no catálogo');
ok(/<section class="vnd" id="vender" hidden>/.test(CAT), 'a seção começa escondida (só aparece quando a loja compra e tem WhatsApp)');
const ativa = extrairDe(CAT, 'function vndAtiva(){');
ok(/REV_ID/.test(ativa) && /compra_off/.test(ativa) && /vndNum\(\)/.test(ativa), 'some no catálogo de revendedor, quando a loja desliga e sem WhatsApp');
ok(/cfg\.whatsapp_compra\|\|cfg\.whatsapp/.test(extrairDe(CAT, 'function vndNum(){')), 'usa o WhatsApp de compras e, sem ele, o da loja');
ok(!/Balão|consigna/i.test(CAT), 'texto e visual próprios da loja');

console.log('\no sistema');
ok(/id="catCompra"/.test(IDX) && /id="catWppCompra"/.test(IDX), 'configurações do catálogo: ligar a seção e o WhatsApp de compras');
ok(/whatsapp_compra:g\('catWppCompra'\)\.replace\(\/\\D\/g,''\)/.test(IDX) && /compra_off:!\(document\.getElementById\('catCompra'\)/.test(IDX), 'ao publicar o catálogo, grava as duas opções');
ok(/<option value="Site \/ Google">Site \/ Google \(Compramos seu usado\)<\/option>/.test(IDX), 'canal de compra "Site / Google" para medir o que veio do site');

console.log('\n' + (falhas ? falhas + ' FALHA(S)' : 'tudo verde'));
process.exit(falhas ? 1 : 0);
