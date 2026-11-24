// Página da máquina (o QR da etiqueta): api/maquina.js guarda a ficha pública de cada máquina e
// o index.html monta o que aparece para quem escaneia sem estar logado. Custo, preço,
// fornecedor, cliente e anotação interna nunca chegam lá, e um aparelho com a lista velha não
// desfaz o que o outro sócio mudou.
// uso: node testes/test-maquina.js
process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_LojaTeste_segredoDeTeste123';
const N = require('../tela/nucleo.js');
const api = require('../api/maquina.js');
const { extrair } = require('./extrair.js');
const T = api._teste;
let falhas = 0;
const ok = (c, n) => { console.log((c ? '  ok  ' : '  FALHOU  ') + n); if (!c) falhas++; };

let arquivo = null;
T.usarGravador(async (caminho, conteudo) => { arquivo = { caminho, conteudo }; return { url: 'x' }; });
global.fetch = async (url, opc = {}) => {
  url = String(url);
  if (url.startsWith(N.urlDoc('config', 'maquinas'))) {
    const tok = ((opc.headers || {}).Authorization || '').replace('Bearer ', '');
    return { ok: false, status: tok === 'tok-socio' ? 404 : 403, json: async () => ({}) };
  }
  if (url.includes('.public.blob.vercel-storage.com/')) {
    if (!arquivo || !url.includes(arquivo.caminho)) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => JSON.parse(arquivo.conteudo) };
  }
  throw new Error('fetch inesperado: ' + url);
};
async function chamar({ method = 'GET', query = {}, body } = {}) {
  const res = { statusCode: 0, headers: {}, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, end(b) { this.body = b; } };
  await api({ method, query, body }, res);
  return { status: res.statusCode, headers: res.headers, json: JSON.parse(res.body || '{}') };
}
const sinc = (idToken, maquinas, remover) => chamar({ method: 'POST', body: { acao: 'sincronizar', idToken, maquinas, remover } });
const dell = { num: 12, id: 'p1', nome: 'Dell Latitude 5490', tipo: 'notebook', estado: 'a_venda',
  ficha: { marca: 'Dell', modelo: 'Latitude 5490', cpu: 'i5', ger: '8ª', ram: '16GB', armaz: 'SSD 256GB', tela: '14”', custo: 1234 },
  specs: ['🔋 Bateria boa', '🖥️ Tela perfeita'], recursos: ['Wi-Fi', 'Bluetooth', 'Webcam'], descricao: 'Revisada.\n\nTeclado retroiluminado.',
  // o que nunca pode sair do sistema, mesmo se alguém mandar
  custo: 1234, venda: 2199, preco: 2199, lucro: 965, fornecedor_nome: 'Fulano Peças', cliente_nome: 'Carlos', investidor: 'Igor', obs: 'falta bateria' };

(async () => {
  console.log('\nsó sócio grava');
  let r = await sinc('tok-estranho', [dell]);
  ok(r.status === 403 && !arquivo, 'quem não é sócio não grava nada');
  r = await sinc('', [dell]);
  ok(r.status === 401, 'sem login: entre de novo');

  console.log('\na ficha pública');
  r = await sinc('tok-socio', [dell, { num: 9, id: 'p3', nome: 'HP ProBook 440', estado: 'vendida' }]);
  ok(r.status === 200 && r.json.total === 2, 'sócio grava as fichas');
  ok(/^maquinas\/[a-f0-9]{32}\.json$/.test(arquivo.caminho) && !arquivo.caminho.includes('segredo'), 'o arquivo fica num caminho secreto');
  ok(!/1234|2199|965|Fulano|Carlos|Igor|falta bateria/.test(arquivo.conteudo), 'custo, preço, lucro, fornecedor, cliente, investidor e anotação não entram no arquivo');
  T.limparMemoria();
  r = await chamar({ query: { n: '12' } });
  const m = r.json.maquina;
  ok(r.status === 200 && m.nome === 'Dell Latitude 5490' && m.ficha.cpu === 'i5' && m.ficha.tela === '14”' && m.specs.length === 2 && m.recursos.length === 3, 'quem escaneia a #12 recebe a ficha');
  ok(Object.keys(m).sort().join(',') === 'cor,descricao,estado,ficha,id,nome,num,recursos,resolucao,sistema,specs,tipo,video', 'só os campos permitidos: ' + Object.keys(m).join(','));
  ok(!('custo' in m.ficha) && m.descricao === 'Revisada.\n\nTeclado retroiluminado.', 'nem dentro da ficha; a descrição mantém os parágrafos');
  ok(/s-maxage=60/.test(r.headers['cache-control']), 'a ficha fica em cache por 1 minuto');
  r = await chamar({ query: { n: '77' } });
  ok(r.status === 404 && r.json.ok === false, 'número sem ficha: 404');
  r = await chamar({ query: { n: 'abc' } });
  ok(r.status === 400, 'número inválido: 400');

  console.log('\nlimpeza');
  await sinc('tok-socio', [{ num: 5, id: 'x y', nome: 'Acer <script>alert(1)</script> Aspire', estado: 'hackeado', video: 'javascript:alert(1)', specs: ['a'.repeat(200)] }]);
  T.limparMemoria();
  const a = (await chamar({ query: { n: '5' } })).json.maquina;
  ok(!/[<>]/.test(a.nome) && a.estado === 'em_preparo' && a.video === '' && a.id === '' && a.specs[0].length === 70, 'sem < e >, estado e vídeo desconhecidos viram vazio, texto cortado');
  r = await sinc('tok-socio', [{ num: 0 }, { num: -3 }, { num: 1.5 }, { nome: 'sem número' }]);
  ok(r.json.atualizadas === 0, 'ficha sem número válido não entra');

  console.log('\ndois aparelhos');
  // o aparelho do outro sócio manda só a #12 com o estado novo e tira a #5
  r = await sinc('tok-socio', [{ ...dell, estado: 'vendida' }], [5]);
  T.limparMemoria();
  ok((await chamar({ query: { n: '12' } })).json.maquina.estado === 'vendida', 'a #12 mudou para vendida');
  ok((await chamar({ query: { n: '9' } })).status === 200, 'a #9, que ninguém mandou, continua lá');
  ok((await chamar({ query: { n: '5' } })).status === 404, 'a #5 saiu');

  console.log('\no que aparece para quem escaneou (index.html)');
  const esc = s => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const H = new Function('esc', "const CAT_ORIGEM_PUBLICA='https://techcampinas.com.br';\n" + extrair('function maqPublicaHTML(') + '\nreturn maqPublicaHTML;')(esc);
  const loja = { nome: 'Tech Campinas', whatsapp: '19993956265' };
  let h = H(12, { ...m, estado: 'a_venda' }, loja, '');
  ok(/Etiqueta #12/.test(h) && /Dell Latitude 5490/.test(h) && />À venda</.test(h), 'título com o número, o modelo e "À venda"');
  ok(/<dt>Processador<\/dt><dd>i5 8ª<\/dd>/.test(h) && /<dt>Memória<\/dt><dd>16GB<\/dd>/.test(h) && /<dt>Tela<\/dt><dd>14”<\/dd>/.test(h), 'a ficha em linhas: processador, memória, tela');
  ok(/https:\/\/wa\.me\/5519993956265\?text=Ol%C3%A1!%20Escaneei%20a%20etiqueta%20%2312%20\(Dell%20Latitude%205490\)/.test(h), 'WhatsApp da loja com a mensagem da etiqueta');
  ok(/catalogo\.html\?q=Dell%20Latitude%205490/.test(h) && /Sou da loja: entrar no sistema/.test(h), 'link para o catálogo e a entrada dos sócios');
  ok(!/R\$|custo|preço/i.test(h), 'nenhum preço ou custo na página');
  h = H(9, { num: 9, nome: 'HP', estado: 'vendida', ficha: {} }, loja, '');
  ok(/>Vendida</.test(h) && /garantia é de 90 dias/.test(h) && !/Ver no catálogo/.test(h), 'vendida: aviso da garantia e sem link do catálogo');
  h = H(77, null, loja, '');
  ok(/Máquina ainda sem ficha/.test(h) && /Etiqueta #77/.test(h) && /wa\.me/.test(h), 'etiqueta sem ficha: avisa e deixa o WhatsApp');
  h = H(12, { num: 12, nome: 'X', estado: 'a_venda', ficha: { marca: '<img src=x onerror=alert(1)>' }, descricao: '<b>oi</b>' }, loja, '');
  ok(!/<img src=x/.test(h) && !/<b>oi<\/b>/.test(h), 'tudo escapado');

  console.log('\na ficha que o sistema manda (index.html)');
  const F = new Function('stubs', [
    'const {recursosLinhas,hwResumo,tipoMaquina,ytId,fichaDe}=stubs;',
    extrair('function reservadoP('), extrair('function aguardandoP('), extrair('function maqEstado('), extrair('function maqNomePublico('), extrair('function maqFicha('),
    'return { maqFicha, maqNomePublico };'].join('\n'))({
    recursosLinhas: () => ({ recursos: ['Wi-Fi'], sistema: 'Windows 11', resolucao: 'Full HD', cor: 'Preto' }),
    hwResumo: () => ['🔋 Boa'], tipoMaquina: () => 'notebook', ytId: () => '', fichaDe: p => p.ficha || {} });
  const p = { id: 'p1', num: 12, nome: 'Dell Latitude 5490 (João) *', status: 'Anunciado', custo: 1234, venda: 2199, fornecedor_nome: 'Fulano', cliente_nome: 'Carlos', ficha: { marca: 'Dell' }, descricao: 'ok' };
  const fp = F.maqFicha(p);
  ok(fp.nome === 'Dell Latitude 5490' && fp.estado === 'a_venda' && fp.sistema === 'Windows 11', 'nome sem a marcação de quem investiu, estado "à venda"');
  ok(!/1234|2199|Fulano|Carlos/.test(JSON.stringify(fp)), 'o sistema nem manda custo, preço, fornecedor ou cliente');
  ok(F.maqFicha({ ...p, status: 'Reservado' }).estado === 'reservada' && F.maqFicha({ ...p, status: 'Vendido' }).estado === 'vendida'
    && F.maqFicha({ ...p, status: 'Aguardando' }).estado === 'chegando' && F.maqFicha({ ...p, status: 'Estoque' }).estado === 'em_preparo', 'os estados');

  console.log(falhas ? `\n${falhas} FALHA(S)` : '\ntudo verde');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error('ERRO', e); process.exit(2); });
