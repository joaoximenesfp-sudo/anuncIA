// Avaliações dos clientes (api/avaliacoes.js): convite por venda, o cliente avalia uma vez só,
// nada aparece no site sem um sócio aprovar, e o arquivo fica num caminho que ninguém adivinha.
// uso: node testes/test-avaliacoes.js
process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_LojaTeste_segredoDeTeste123';
const N = require('../tela/nucleo.js');
const api = require('../api/avaliacoes.js');
const T = api._teste;
let falhas = 0;
const ok = (c, n) => { console.log((c ? '  ok  ' : '  FALHOU  ') + n); if (!c) falhas++; };

// o Blob e o banco de mentira
let arquivo = null, gravacoes = 0;
T.usarGravador(async (caminho, conteudo, opc) => { arquivo = { caminho, conteudo, opc }; gravacoes++; return { url: 'x' }; });
global.fetch = async (url, opc = {}) => {
  url = String(url);
  if (url.startsWith(N.urlDoc('config', 'avaliacoes'))) {
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
const post = body => chamar({ method: 'POST', body });

(async () => {
  console.log('\nconvite (só sócio)');
  let r = await post({ acao: 'convidar', idToken: 'tok-estranho', produto: 'Dell Latitude 5490', cliente: 'Carlos' });
  ok(r.status === 403, 'quem não é sócio não gera convite');
  r = await post({ acao: 'convidar', idToken: 'tok-socio', produto_id: 'p1', produto: 'Dell Latitude 5490 · i5 8ª', cliente: 'Carlos Eduardo Souza' });
  ok(r.status === 200 && /^[a-f0-9]{24}$/.test(r.json.codigo) && r.json.link === 'https://techcampinas.com.br/avaliar#c=' + r.json.codigo, 'gera o link com um código de 24 letras: ' + r.json.link);
  const cod = r.json.codigo;
  r = await post({ acao: 'convidar', idToken: 'tok-socio', produto_id: 'p1', produto: 'Dell Latitude 5490', cliente: 'Carlos' });
  ok(r.json.codigo === cod && r.json.novo === false, 'a mesma venda reaproveita o link que ainda vale');
  ok(!arquivo.caminho.includes('segredoDeTeste') && /^avaliacoes\/[a-f0-9]{32}\.json$/.test(arquivo.caminho), 'o arquivo fica num caminho secreto, que não mostra a chave');
  ok(!/Souza/.test(arquivo.conteudo), 'do cliente, guarda só o primeiro nome');

  console.log('\na página de avaliar');
  r = await chamar({ query: { convite: cod } });
  ok(r.status === 200 && r.json.produto === 'Dell Latitude 5490 · i5 8ª' && r.json.cliente === 'Carlos', 'o convite abre com a máquina e o nome');
  r = await chamar({ query: { convite: 'f'.repeat(24) } });
  ok(r.status === 404, 'código que não existe: 404');

  console.log('\no cliente avalia');
  const base = { acao: 'enviar', convite: cod, nota: 5, texto: 'Notebook chegou perfeito, rápido e com garantia. Recomendo!', nome: 'Carlos E.', autorizo: true };
  r = await post({ ...base, nota: 0 }); ok(r.status === 400, 'nota fora de 1 a 5: recusa');
  r = await post({ ...base, nota: 4.5 }); ok(r.status === 400, 'meia estrela: recusa');
  r = await post({ ...base, texto: 'ok' }); ok(r.status === 400, 'texto curto demais: recusa');
  r = await post({ ...base, autorizo: false }); ok(r.status === 400 && /autoriza/.test(r.json.erro), 'sem autorizar a publicação: recusa');
  r = await post({ ...base, convite: 'abc' }); ok(r.status === 400, 'código quebrado: recusa');
  r = await post({ ...base, convite: 'e'.repeat(24) }); ok(r.status === 404, 'código que não existe: recusa');
  r = await post({ ...base, texto: 'Ótimo <script>alert(1)</script> atendimento, voltaria a comprar.' });
  ok(r.status === 200, 'avaliação válida entra');
  r = await post(base); ok(r.status === 409, 'o mesmo link não avalia duas vezes');
  r = await chamar({ query: { convite: cod } }); ok(r.status === 409 && r.json.usado === true, 'o link usado avisa que já foi usado');

  console.log('\nnada vai para o site sem aprovar');
  T.limparMemoria();
  r = await chamar();
  ok(r.status === 200 && r.json.total === 0 && r.json.avaliacoes.length === 0, 'pendente não aparece no site');
  ok(/s-maxage=60/.test(r.headers['cache-control']), 'a lista pública é guardada em cache por 1 minuto');
  r = await post({ acao: 'lista', idToken: 'tok-estranho' }); ok(r.status === 403, 'quem não é sócio não vê as pendentes');
  r = await post({ acao: 'lista', idToken: 'tok-socio' });
  ok(r.status === 200 && r.json.avaliacoes.length === 1 && r.json.avaliacoes[0].status === 'pendente', 'o sócio vê a pendente');
  ok(!/[<>]/.test(r.json.avaliacoes[0].texto), 'o texto vem sem < e >: nada de código na página');
  r = await post({ acao: 'publicar', idToken: 'tok-estranho', id: cod }); ok(r.status === 403, 'só sócio publica');
  r = await post({ acao: 'publicar', idToken: 'tok-socio', id: cod }); ok(r.status === 200 && r.json.avaliacao.status === 'publicada', 'o sócio aprova');
  T.limparMemoria();
  r = await chamar();
  ok(r.json.total === 1 && r.json.media === 5 && r.json.avaliacoes[0].nome === 'Carlos E.' && r.json.avaliacoes[0].produto === 'Dell Latitude 5490 · i5 8ª', 'aprovada aparece no site, com nota média e a máquina');
  ok(!('produto_id' in r.json.avaliacoes[0]) && !('convite' in r.json.avaliacoes[0]), 'o site não recebe dado interno');

  console.log('\nmédia e recusa');
  const c2 = (await post({ acao: 'convidar', idToken: 'tok-socio', produto_id: 'p2', produto: 'ThinkPad E14', cliente: 'Ana' })).json.codigo;
  await post({ acao: 'enviar', convite: c2, nota: 4, texto: 'Muito bom, só demorou um dia a mais para entregar.', nome: 'Ana', autorizo: true });
  await post({ acao: 'publicar', idToken: 'tok-socio', id: c2 });
  T.limparMemoria(); r = await chamar();
  ok(r.json.total === 2 && r.json.media === 4.5, 'média de 5 e 4: 4,5');
  await post({ acao: 'recusar', idToken: 'tok-socio', id: c2 });
  T.limparMemoria(); r = await chamar();
  ok(r.json.total === 1 && r.json.media === 5, 'tirou do site: some da lista e da média');

  console.log('\nconvite vencido');
  const c3 = (await post({ acao: 'convidar', idToken: 'tok-socio', produto_id: 'p3', produto: 'Latitude 3410', cliente: 'Bia' })).json.codigo;
  const d3 = JSON.parse(arquivo.conteudo); d3.convites[c3].criado_em = new Date(Date.now() - (T.VALIDADE_DIAS + 1) * 864e5).toISOString();
  arquivo.conteudo = JSON.stringify(d3); T.limparMemoria();
  r = await post({ acao: 'enviar', convite: c3, nota: 5, texto: 'Comprei faz tempo e está ótimo até hoje.', nome: 'Bia', autorizo: true });
  ok(r.status === 410, 'depois de ' + T.VALIDADE_DIAS + ' dias o link vence');

  console.log(falhas ? `\n${falhas} FALHA(S)` : '\ntudo verde');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error('ERRO', e); process.exit(2); });
