// Mercado Livre da loja (api/ml.js): autorização com PKCE, cifra e renovação dos tokens
// (o refresh token é de uso único), foto, anúncio com os atributos da categoria e a
// validação antes de criar, preço/situação, pedidos e perguntas. O Mercado Livre e o
// Firestore são simulados: o teste vê exatamente o que o servidor pediria a eles.
// uso: node testes/test-ml.js
const path = require('path');
let falhas = 0;
const ok = (c, n) => { console.log((c ? '  ok  ' : '  FALHOU  ') + n); if (!c) falhas++; };

process.env.ML_APP_ID = '5550001112223334';
process.env.ML_SECRET = 'segredo-ml-de-teste';
const mlApi = require(path.join(__dirname, '..', 'api', 'ml.js'));
const N = require(path.join(__dirname, '..', 'tela', 'nucleo.js'));
const T = mlApi._teste;

// ── o Mercado Livre e o Firestore de mentira ──
const ATRIBUTOS = [
  { id: 'BRAND', name: 'Marca', value_type: 'list', tags: { required: true }, values: [{ id: '2005', name: 'Dell' }, { id: '2006', name: 'Lenovo' }] },
  { id: 'LINE', name: 'Linha', value_type: 'string', tags: {} },
  { id: 'MODEL', name: 'Modelo', value_type: 'string', tags: { required: true } },
  { id: 'PROCESSOR_BRAND', name: 'Marca do processador', value_type: 'list', tags: {}, values: [{ id: '1', name: 'Intel' }, { id: '2', name: 'AMD' }] },
  { id: 'PROCESSOR_LINE', name: 'Linha do processador', value_type: 'list', tags: {}, values: [{ id: '10', name: 'Core i5' }, { id: '11', name: 'Core i7' }] },
  { id: 'PROCESSOR_MODEL', name: 'Modelo do processador', value_type: 'string', tags: {} },
  { id: 'RAM_MEMORY', name: 'Memória RAM', value_type: 'number_unit', tags: { required: true }, allowed_units: [{ id: 'GB', name: 'GB' }, { id: 'MB', name: 'MB' }], default_unit: 'GB' },
  { id: 'SSD_DATA_STORAGE_CAPACITY', name: 'Capacidade de armazenamento do SSD', value_type: 'number_unit', tags: {}, allowed_units: [{ id: 'GB', name: 'GB' }, { id: 'TB', name: 'TB' }] },
  { id: 'DISPLAY_SIZE', name: 'Tamanho da tela', value_type: 'number_unit', tags: {}, allowed_units: [{ id: '"', name: '"' }] },
  { id: 'OS_NAME', name: 'Nome do sistema operacional', value_type: 'list', tags: { required: true }, values: [{ id: '7', name: 'Windows' }, { id: '8', name: 'Linux' }] },
  { id: 'GTIN', name: 'Código universal de produto', value_type: 'string', tags: { catalog_required: true } },
  { id: 'EMPTY_GTIN_REASON', name: 'Motivo de GTIN vazio', value_type: 'list', tags: {}, values: [{ id: '17055160', name: 'O produto é uma peça' }, { id: '17055161', name: 'O produto não tem código cadastrado' }] },
  { id: 'ITEM_CONDITION', name: 'Condição do item', value_type: 'list', tags: { read_only: true }, values: [{ id: '2230581', name: 'Usado' }] },
  { id: 'SELLER_PACKAGE_WEIGHT', name: 'Peso da embalagem', value_type: 'number_unit', tags: {}, allowed_units: [{ id: 'g', name: 'g' }, { id: 'kg', name: 'kg' }] },
];
// os que a categoria Notebooks tem de verdade (a RAM é "capacidade total do módulo")
const NOTEBOOKS = [
  { id: 'RAM_MEMORY_MODULE_TOTAL_CAPACITY', name: 'Capacidade total do módulo de memória RAM', value_type: 'number_unit', tags: {}, allowed_units: [{ id: 'GB', name: 'GB' }] },
  { id: 'ALPHANUMERIC_MODEL', name: 'Modelo alfanumérico', value_type: 'string', tags: {} },
  { id: 'M2_DATA_STORAGE_CAPACITY', name: 'Capacidade de armazenamento de dados M2', value_type: 'number_unit', tags: {}, allowed_units: [{ id: 'GB', name: 'GB' }] },
  { id: 'SSD_INTERFACE', name: 'Interface do SSD', value_type: 'string', tags: { hidden: true } },
  { id: 'DISPLAY_RESOLUTION', name: 'Resolução da tela', value_type: 'string', tags: {} },
  { id: 'DISPLAY_RESOLUTION_TYPE', name: 'Tipo de resolução da tela', value_type: 'string', tags: {}, values: [{ id: '1', name: 'Full HD' }, { id: '2', name: 'HD' }] },
  { id: 'OS_VERSION', name: 'Versão do sistema operacional', value_type: 'string', tags: {} },
  { id: 'OS_EDITION', name: 'Edição do sistema operacional', value_type: 'string', tags: {}, values: [{ id: '3', name: 'Home' }, { id: '4', name: 'Pro' }] },
  { id: 'INTEGRATED_GRAPHIC_CARD_MODEL', name: 'Modelo de placa gráfica integrada', value_type: 'string', tags: {} },
  { id: 'PRODUCT_TYPE', name: 'Tipo de produto', value_type: 'list', tags: {}, values: [{ id: '5', name: 'Notebook' }, { id: '6', name: '2 em 1' }] },
  { id: 'WITH_WEBCAM', name: 'Com webcam', value_type: 'boolean', tags: {}, values: [{ id: '242085', name: 'Sim' }, { id: '242084', name: 'Não' }] },
  { id: 'WITH_BACKLIGHT_KEYBOARD', name: 'Com teclado retroiluminado', value_type: 'boolean', tags: {}, values: [{ id: '242085', name: 'Sim' }, { id: '242084', name: 'Não' }] },
  { id: 'WITH_RETINA_DISPLAY', name: 'Com tela retina', value_type: 'boolean', tags: {}, values: [{ id: '242085', name: 'Sim' }, { id: '242084', name: 'Não' }] },
  { id: 'RAM_SLOTS_NUMBER', name: 'Quantidade de slots para a memória RAM', value_type: 'number', tags: {} },
  { id: 'SELLER_SKU', name: 'SKU', value_type: 'string', tags: { hidden: true } },
];
let pedidos = [], cfgDoc = null, gravarFalha = false, tokenSeq = 0, refreshRuim = false, validacoes = [], criados = [], criacoes = [], condicaoCriado = 'used', itemLa = null, putRecusas = [], pkceRuim = false, mlFora = false;
const resposta = (status, json) => ({ ok: status >= 200 && status < 300, status, json: async () => { if (json === undefined) throw new Error('sem corpo'); return json; } });
global.fetch = async (url, op = {}) => {
  const h = op.headers || {};
  const p = { url: String(url), metodo: op.method || 'GET', corpo: op.body, auth: h.Authorization || '' };
  pedidos.push(p);
  const u = new URL(p.url);
  if (u.host === 'firestore.googleapis.com') {
    if (!u.pathname.endsWith('/documents/config/mercadolivre')) return resposta(404, {});
    if (p.auth !== 'Bearer socio') return resposta(p.auth ? 403 : 401, { error: { status: 'PERMISSION_DENIED' } });
    if (p.metodo === 'PATCH') {
      if (gravarFalha) return resposta(500, {});
      cfgDoc = Object.assign({}, cfgDoc, N.lerCampos(JSON.parse(p.corpo).fields)); return resposta(200, {});
    }
    return cfgDoc ? resposta(200, { fields: N.campos(cfgDoc) }) : resposta(404, { error: { status: 'NOT_FOUND' } });
  }
  if (u.host !== 'api.mercadolibre.com') return resposta(404, {});
  if (mlFora) throw new Error('ECONNRESET');
  const tok = p.auth.replace(/^Bearer /, '');
  if (u.pathname === '/oauth/token') {
    const f = new URLSearchParams(String(p.corpo));
    if (f.get('client_secret') !== process.env.ML_SECRET) return resposta(401, { error: 'invalid_client' });
    if (f.get('grant_type') === 'authorization_code') {
      if (pkceRuim && f.get('code_verifier')) return resposta(400, { error: 'invalid_request', message: 'code_verifier is not allowed for this application' });
      if (f.get('code') !== 'TG-bom') return resposta(400, { error: 'invalid_grant', message: 'Error validating grant.' });
      return resposta(200, { access_token: 'APP_USR-acesso-' + (++tokenSeq), token_type: 'Bearer', expires_in: 21600, scope: 'offline_access read write', user_id: 777, refresh_token: 'TG-refresh-' + tokenSeq });
    }
    if (f.get('grant_type') === 'refresh_token') {
      if (refreshRuim) return resposta(400, { error: 'invalid_grant', message: 'Error validating grant. Your authorization code or refresh token may be expired or it was already used' });
      return resposta(200, { access_token: 'APP_USR-acesso-' + (++tokenSeq), token_type: 'Bearer', expires_in: 21600, user_id: 777, refresh_token: 'TG-refresh-' + tokenSeq });
    }
  }
  if (!/^APP_USR-acesso-\d+$/.test(tok)) return resposta(401, { message: 'invalid access token', error: 'not_found', status: 401 });
  if (u.pathname === '/users/me') return resposta(200, { id: 777, nickname: 'TECHCAMPINAS' });
  if (u.pathname === '/pictures/items/upload') return resposta(201, { id: 'PIC' + pedidos.length, max_size: '1200x900' });
  if (u.pathname === '/sites/MLB/domain_discovery/search') return resposta(200, [{ domain_id: 'MLB-NOTEBOOKS', domain_name: 'Notebooks', category_id: 'MLB1652', category_name: 'Notebooks' }]);
  if (u.pathname === '/categories/MLB1652/attributes') return resposta(200, ATRIBUTOS);
  if (u.pathname === '/items/validate') {
    const corpo = JSON.parse(p.corpo); const proxima = validacoes.shift();
    if (proxima) return resposta(400, { message: 'Validation error', error: 'validation_error', status: 400, cause: typeof proxima === 'function' ? proxima(corpo) : proxima });
    return resposta(204);
  }
  if (u.pathname === '/items' && p.metodo === 'POST') { const corpo = JSON.parse(p.corpo); const falha = criacoes.shift();
    if (falha) return resposta(400, { message: 'Validation error', error: 'validation_error', status: 400, cause: falha }); criados.push(corpo); return resposta(201, { id: 'MLB4000000' + criados.length, permalink: 'https://produto.mercadolivre.com.br/MLB-4000000' + criados.length + '-notebook', status: 'active', price: corpo.price, condition: condicaoCriado }); }
  if (/^\/items\/MLB\d+$/.test(u.pathname) && p.metodo === 'GET') return itemLa ? resposta(200, itemLa) : resposta(404, { message: 'item not found' });
  if (/^\/items\/MLB\d+$/.test(u.pathname) && p.metodo === 'PUT') {
    const corpo = JSON.parse(p.corpo);
    if (u.pathname.endsWith('MLB999999999')) return resposta(400, { message: 'Item with status closed can not be modified', error: 'item.status.invalid', status: 400, cause: [] });
    const recusa = corpo.attributes && putRecusas.shift();
    if (recusa) return resposta(400, { message: 'Validation error', error: 'validation_error', status: 400, cause: recusa });
    return resposta(200, { id: u.pathname.split('/').pop(), status: corpo.status || 'active', price: corpo.price || 2199, condition: corpo.condition || 'used', ...(corpo.shipping ? { shipping: corpo.shipping } : {}) });
  }
  if (/^\/items\/MLB\d+\/listing_type$/.test(u.pathname) && p.metodo === 'POST') {
    const corpo = JSON.parse(p.corpo); return resposta(200, { id: u.pathname.split('/')[2], listing_type_id: corpo.id });
  }
  if (u.pathname === '/items' && p.metodo === 'GET') {
    return resposta(200, u.searchParams.get('ids').split(',').map(id => id === 'MLB404040404'
      ? { code: 404, body: { message: 'not found' } }
      : { code: 200, body: { id, status: id.endsWith('2') ? 'paused' : 'active', sub_status: id.endsWith('2') ? ['out_of_stock'] : [], price: 2199, permalink: 'https://produto.mercadolivre.com.br/' + id, sold_quantity: id.endsWith('2') ? 1 : 0 } }));
  }
  if (u.pathname === '/orders/search') return resposta(200, { results: [
    { id: 2000001, status: 'paid', date_created: '2026-11-20T15:00:00.000-03:00', total_amount: 2199,
      order_items: [{ item: { id: 'MLB40000002', title: 'Notebook Dell Latitude 5490' }, quantity: 1, unit_price: 2199 }],
      buyer: { id: 99, nickname: 'COMPRADOR123', first_name: 'Fulano', last_name: 'de Tal', email: 'fulano@x.com' },
      shipping: { receiver_address: { address_line: 'Rua Secreta 1' } } },
  ], paging: { total: 1 } });
  if (u.pathname === '/questions/search') return resposta(200, { total: 3, questions: [] });
  return resposta(404, { message: 'not_found' });
};
function chamar({ method = 'GET', query = {}, body } = {}) {
  return new Promise(resolve => {
    const res = { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
      end(b) { resolve({ status: this.statusCode, headers: this.headers, body: b, json: () => JSON.parse(String(b)) }); } };
    mlApi({ method, query, body, headers: {} }, res);
  });
}
const post = body => chamar({ method: 'POST', body: Object.assign({ idToken: 'socio' }, body) });
const mlPedidos = () => pedidos.filter(p => p.url.includes('api.mercadolibre.com'));
const conectado = (x = Date.now() + 5 * 3600e3) => { cfgDoc = { cifra: T.cifrar({ a: 'APP_USR-acesso-0', r: 'TG-refresh-0', x, u: '777' }), usuario: 'TECHCAMPINAS' }; };
const JPG = Buffer.concat([Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]), Buffer.alloc(3000, 7)]).toString('base64');
const FICHA = { marca: 'Dell', linha: 'Latitude', modelo: 'Latitude 5490', numero: '5490', cpu_marca: 'Intel', cpu_linha: 'Core i5', cpu_modelo: '8350U', ram: '16 GB', ssd: '256 GB', tela: '14' };
const ITEM = { titulo: 'Notebook Dell Latitude 5490 i5 8ª 16GB SSD 256GB', preco: 2199, descricao: 'Bateria segura 4h.', fotos: ['PIC1', 'PIC2'], ficha: FICHA,
  tipo: 'gold_special', retirada: true, garantia_dias: 90, pacote: { alt: 10, larg: 30, comp: 40, peso: 2.5 }, sku: '12' };

(async () => {
  console.log('\nconfiguração');
  let r = await chamar();
  ok(r.status === 200 && r.json().configurado === true && r.json().volta === 'https://anunc-ia.vercel.app/api/ml', 'com ML_APP_ID e ML_SECRET na Vercel: configurado (e diz a URI de redirect)');
  delete process.env.ML_SECRET;
  const r1 = await chamar(), r2 = await post({ acao: 'conectar' });
  ok(r1.json().configurado === false && r2.status === 503 && /ML_APP_ID e ML_SECRET/.test(r2.json().erro), 'sem o segredo: avisa o que falta na Vercel');
  process.env.ML_SECRET = 'segredo-ml-de-teste';
  r = await chamar({ method: 'POST', body: { topic: 'orders_v2', resource: '/orders/2000001', user_id: 777 } });
  ok(r.status === 200, 'aviso do próprio Mercado Livre (sem ação): 200, sem fazer nada');

  console.log('\nconectar (só sócio, com PKCE)');
  r = await chamar({ method: 'POST', body: { acao: 'conectar' } });
  const r3 = await chamar({ method: 'POST', body: { acao: 'conectar', idToken: 'intruso' } });
  ok(r.status === 401 && r3.status === 403 && /sócios/.test(r3.json().erro), 'sem login: 401; quem não é sócio: 403');
  r = await post({ acao: 'conectar' });
  const ida = new URL(r.json().url), st = ida.searchParams.get('state');
  ok(ida.origin + ida.pathname === 'https://auth.mercadolivre.com.br/authorization' && ida.searchParams.get('client_id') === '5550001112223334' &&
    ida.searchParams.get('redirect_uri') === T.VOLTA && ida.searchParams.get('response_type') === 'code', 'manda para a autorização do Mercado Livre com o app e a volta certa');
  ok(T.estadoValido(st, Date.now()) && ida.searchParams.get('code_challenge') === T.desafio(T.verificador(st)) && ida.searchParams.get('code_challenge_method') === 'S256',
    'state assinado e o desafio PKCE tirado dele');

  console.log('\nvolta da autorização');
  const volta = async q => { const x = await chamar({ query: q }); return { status: x.status, hash: new URLSearchParams(String(x.headers.location || '').split('#')[1] || '') }; };
  let v = await volta({ code: 'TG-bom', state: 'falso.' + 'x'.repeat(32) });
  ok(v.status === 302 && /não começou pelo sistema/.test(v.hash.get('ml_erro')), 'state falso: volta com erro, sem trocar o código');
  v = await volta({ error: 'access_denied', error_description: 'O usuário não autorizou', state: st });
  ok(/não autorizou/.test(v.hash.get('ml_erro')), 'ele recusou: volta com o motivo');
  pedidos = [];
  v = await volta({ code: 'TG-bom', state: st });
  const troca = pedidos.find(p => p.url.endsWith('/oauth/token')), tf = new URLSearchParams(String(troca && troca.corpo));
  ok(tf.get('grant_type') === 'authorization_code' && tf.get('redirect_uri') === T.VOLTA && tf.get('code_verifier') === T.verificador(st), 'troca o código com o verificador PKCE');
  const seg = T.decifrar(v.hash.get('ml'));
  ok(v.status === 302 && v.hash.get('ml_user') === 'TECHCAMPINAS' && v.hash.get('ml_id') === '777' && v.hash.get('ml_offline') === '1' &&
    /^APP_USR-acesso-/.test(seg.a) && /^TG-refresh-/.test(seg.r) && seg.x > Date.now() + 5 * 3600e3, 'volta para o sistema com os tokens cifrados, a conta e o acesso offline');
  ok(!String(pedidos.map(p => p.url).join(' ')).includes(seg.a) && !v.hash.toString().includes(seg.a), 'o token não aparece em endereço nenhum');
  pkceRuim = true;
  v = await volta({ code: 'TG-bom', state: T.novoEstado(Date.now()) });
  ok(!!v.hash.get('ml') && pedidos.filter(p => p.url.endsWith('/oauth/token')).length >= 3, 'app sem PKCE que recusa o verificador: tenta de novo sem ele');
  pkceRuim = false;
  v = await volta({ code: 'TG-velho', state: T.novoEstado(Date.now()) });
  ok(/Conectar Mercado Livre de novo/.test(v.hash.get('ml_erro')), 'código vencido: avisa para conectar de novo');

  console.log('\nrenovação (refresh token de uso único)');
  cfgDoc = null;
  r = await post({ acao: 'itens', ids: ['MLB4000000001'] });
  ok(r.status === 409 && /Conecte o Mercado Livre/.test(r.json().erro), 'sem conexão: pede para conectar');
  conectado(Date.now() + 5 * 60000); // vence em 5 minutos
  const cifraVelha = cfgDoc.cifra; pedidos = [];
  r = await post({ acao: 'itens', ids: ['MLB4000000001'] });
  const ren = pedidos.find(p => p.url.endsWith('/oauth/token')), novo = T.decifrar(cfgDoc.cifra);
  ok(r.status === 200 && ren && new URLSearchParams(String(ren.corpo)).get('refresh_token') === 'TG-refresh-0' && cfgDoc.cifra !== cifraVelha &&
    novo.r !== 'TG-refresh-0' && novo.x > Date.now() + 5 * 3600e3, 'no fim da validade: renova e grava o par novo (o refresh antigo não vale mais)');
  ok(pedidos.filter(p => p.url.includes('/items?')).every(p => p.auth === 'Bearer ' + novo.a) && !r.json().cifraNova, 'já usa o token novo, e o banco guardou (nada para o sistema gravar)');
  pedidos = []; await post({ acao: 'itens', ids: ['MLB4000000001'] });
  ok(!pedidos.some(p => p.url.endsWith('/oauth/token')), 'token ainda bom: não renova à toa');
  conectado(Date.now() + 60000); gravarFalha = true;
  r = await post({ acao: 'itens', ids: ['MLB4000000001'] });
  ok(r.status === 200 && r.json().cifraNova && T.decifrar(r.json().cifraNova).r !== 'TG-refresh-0', 'banco não aceitou a gravação: devolve a cifra nova para o sistema gravar');
  gravarFalha = false;
  conectado(Date.now() + 60000); refreshRuim = true;
  r = await post({ acao: 'itens', ids: ['MLB4000000001'] });
  ok(r.status === 409 && /Conectar Mercado Livre de novo/.test(r.json().erro), 'refresh recusado: avisa para conectar de novo');
  conectado(Date.now() + 60000);
  const cfgDe = cfgDoc; let leituras = 0;
  const fetchOrig = global.fetch;
  global.fetch = async (url, op) => { // outro acesso renova no meio do caminho
    if (String(url).includes('/documents/config/mercadolivre') && (!op || !op.method || op.method === 'GET') && ++leituras === 2)
      cfgDoc = { ...cfgDe, cifra: T.cifrar({ a: 'APP_USR-acesso-50', r: 'TG-refresh-50', x: Date.now() + 6 * 3600e3, u: '777' }) };
    return fetchOrig(url, op);
  };
  pedidos = []; r = await post({ acao: 'itens', ids: ['MLB4000000001'] });
  global.fetch = fetchOrig; refreshRuim = false;
  ok(r.status === 200 && pedidos.some(p => p.auth === 'Bearer APP_USR-acesso-50'), 'outro acesso acabou de renovar: usa o token que ele gravou, sem derrubar a conexão');

  console.log('\nfoto');
  conectado();
  r = await post({ acao: 'foto', jpg: Buffer.from('não é jpeg').toString('base64') });
  ok(r.status === 400 && /JPEG/.test(r.json().erro), 'só JPEG');
  pedidos = []; r = await post({ acao: 'foto', jpg: JPG });
  const up = pedidos.find(p => p.url.endsWith('/pictures/items/upload'));
  ok(r.status === 200 && /^PIC\d+$/.test(r.json().id) && up && up.corpo instanceof FormData && up.corpo.get('file') && up.corpo.get('file').size === Buffer.from(JPG, 'base64').length,
    'sobe a foto (multipart) e devolve o id do Mercado Livre');

  console.log('\nanúncio: atributos da categoria');
  const m = T.montarAtributos(ATRIBUTOS, FICHA, {}, { pacote: ITEM.pacote });
  const A = id => m.atributos.find(a => a.id === id);
  ok(A('BRAND').value_id === '2005' && A('LINE').value_name === 'Latitude' && A('MODEL').value_name === '5490' && A('PROCESSOR_BRAND').value_id === '1' &&
    A('PROCESSOR_LINE').value_id === '10' && A('PROCESSOR_MODEL').value_name === '8350U', 'marca, linha, modelo e processador saem da ficha (lista pelo id do valor)');
  ok(A('RAM_MEMORY').value_name === '16 GB' && A('SSD_DATA_STORAGE_CAPACITY').value_name === '256 GB' && A('DISPLAY_SIZE').value_name === '14 "' &&
    A('SELLER_PACKAGE_WEIGHT').value_name === '2500 g', 'números com a unidade da categoria (16 GB, 256 GB, 14 ", 2500 g)');
  ok(!A('GTIN') && A('EMPTY_GTIN_REASON').value_id === '17055161' && !A('ITEM_CONDITION'), 'sem código de barras: o motivo "não tem código cadastrado"; atributo só de leitura fica de fora');
  ok(m.faltam.length === 1 && m.faltam[0].id === 'OS_NAME' && m.faltam[0].valores.length === 2, 'o obrigatório que a ficha não sabe (sistema operacional) vai em "faltam", com as opções');
  const m2 = T.montarAtributos(ATRIBUTOS, FICHA, { OS_NAME: 'windows', MODEL: 'Latitude 5490 (2018)' }, {});
  ok(!m2.faltam.length && m2.atributos.find(a => a.id === 'OS_NAME').value_id === '7' && m2.atributos.find(a => a.id === 'MODEL').value_name === 'Latitude 5490 (2018)', 'o que ele preenche à mão manda (e acha a opção sem ligar para maiúscula)');
  ok(T.formatar({ id: 'X', value_type: 'boolean', values: [{ id: '242085', name: 'Sim' }, { id: '242084', name: 'Não' }] }, 'sim').value_id === '242085' &&
    T.formatar({ id: 'Y', value_type: 'number', }, 'cerca de 3,5 kg').value_name === '3.5', 'sim/não e número');
  ok(T.limparTitulo('💻 Notebook Dell Latitude 5490 i5 8ª Geração 16GB SSD 256GB Tela 14 Polegadas Revisado') === 'Notebook Dell Latitude 5490 i5 8ª Geração 16GB SSD 256GB',
    'título: sem emoji e com no máximo 60 letras, cortado entre palavras');

  console.log('\npublicar');
  conectado(); pedidos = []; criados = []; validacoes = [];
  r = await post({ acao: 'publicar', item: ITEM });
  ok(r.status === 200 && r.json().ok === false && r.json().faltam[0].id === 'OS_NAME' && r.json().categoria.id === 'MLB1652' && !criados.length,
    'falta o sistema operacional: devolve a pergunta, sem criar nada');
  validacoes = [[{ code: 'body.required_fields', message: 'The body does not contains some or none of the following properties [family_name]', type: 'error' }]];
  pedidos = [];
  r = await post({ acao: 'publicar', item: { ...ITEM, atributos: { OS_NAME: 'Windows' } } });
  const c = criados[0] || {};
  ok(r.status === 200 && r.json().ok && r.json().id === 'MLB40000001' && /mercadolivre\.com\.br/.test(r.json().link) && r.json().status === 'active', 'publica e devolve o id, o link e a situação');
  ok(pedidos.filter(p => p.url.includes('/items/validate')).length === 2 && c.family_name === ITEM.titulo && !c.title, 'categoria de "produto de usuário": refaz com family_name no lugar do título');
  ok(c.category_id === 'MLB1652' && c.price === 2199 && c.currency_id === 'BRL' && c.available_quantity === 1 && c.condition === 'used' && c.listing_type_id === 'gold_special' &&
    c.pictures.map(x => x.id).join() === 'PIC1,PIC2' && c.seller_custom_field === '12', 'usado, clássico, 1 unidade, as fotos e o número da máquina');
  ok(c.sale_terms.find(t => t.id === 'WARRANTY_TIME').value_name === '90 dias' && c.shipping.mode === 'me2' && c.shipping.local_pick_up === true &&
    c.description.plain_text === 'Bateria segura 4h.', 'garantia de 90 dias, Mercado Envios com retirada e a descrição');
  validacoes = [
    [{ code: 'item.attribute.invalid', message: 'Attribute [PROCESSOR_MODEL] has an invalid value', type: 'error' }],
    [{ code: 'shipping.free_shipping.mandatory', message: 'free_shipping is mandatory for this item', type: 'error' }, { code: 'item.title.length', message: 'Título curto', type: 'warning' }],
  ];
  criados = [];
  r = await post({ acao: 'publicar', item: { ...ITEM, tipo: 'gold_pro', atributos: { OS_NAME: 'Windows' } } });
  ok(r.json().ok && !criados[0].attributes.some(a => a.id === 'PROCESSOR_MODEL') && criados[0].listing_type_id === 'gold_pro', 'atributo opcional que o ML recusou: sai e publica (Premium)');
  ok(criados[0].shipping.free_shipping === true && r.json().avisos.some(a => /Frete grátis é obrigatório/.test(a)), 'frete grátis obrigatório: liga e avisa');
  validacoes = [[{ code: 'item.attributes.missing_required', message: 'The attributes [KEYBOARD_LANGUAGE] are required for category MLB1652', type: 'error' }]];
  ATRIBUTOS.push({ id: 'KEYBOARD_LANGUAGE', name: 'Idioma do teclado', value_type: 'list', tags: { conditional_required: true }, values: [{ id: '5', name: 'Português' }] });
  criados = [];
  r = await post({ acao: 'publicar', item: { ...ITEM, atributos: { OS_NAME: 'Windows' } } });
  ok(r.json().ok === false && r.json().faltam.map(f => f.id).join() === 'KEYBOARD_LANGUAGE' && !criados.length, 'o ML pede mais um na validação: vira pergunta, sem criar nada');
  validacoes = [[{ code: 'item.price.invalid', message: 'O preço não é válido para esta categoria', type: 'error' }]];
  r = await post({ acao: 'publicar', item: { ...ITEM, atributos: { OS_NAME: 'Windows', KEYBOARD_LANGUAGE: 'Português' } } });
  ok(r.status === 422 && /recusou o anúncio: O preço não é válido/.test(r.json().erro), 'erro que não dá para resolver sozinho: mostra a mensagem do ML');
  console.log('\no Mercado Livre recusa sem dizer por quê');
  const KL = { OS_NAME: 'Windows', KEYBOARD_LANGUAGE: 'Português' };
  validacoes = [[]]; criados = []; pedidos = [];
  r = await post({ acao: 'publicar', item: { ...ITEM, atributos: KL } });
  ok(r.json().ok && criados.length === 1 && pedidos.filter(p => p.url.includes('/items/validate')).length === 1,
    'a validação recusou sem causa: tenta criar direto, e o anúncio sai');
  validacoes = [[]]; criacoes = [[{ code: 'item.listing_type_id.invalid', message: 'Você atingiu o limite de anúncios deste tipo', type: 'error' }]]; criados = [];
  r = await post({ acao: 'publicar', item: { ...ITEM, atributos: KL } });
  ok(r.status === 422 && /recusou o anúncio: Você atingiu o limite de anúncios deste tipo$/.test(r.json().erro) && !criados.length,
    'criar também recusou: mostra o motivo que veio na criação — ' + r.json().erro);
  validacoes = [[]]; criacoes = [[]];
  r = await post({ acao: 'publicar', item: { ...ITEM, atributos: KL } });
  ok(r.status === 422 && /Validation error/.test(r.json().erro) && /confira a conta/.test(r.json().erro), 'nem a criação disse o motivo: diz o que conferir na conta');
  validacoes = [[], []]; criacoes = [[{ code: 'shipping.free_shipping.mandatory', message: 'free_shipping is mandatory for this item', type: 'error' }]]; criados = []; pedidos = [];
  r = await post({ acao: 'publicar', item: { ...ITEM, atributos: KL } });
  ok(r.json().ok && criados.length === 1 && criados[0].shipping.free_shipping === true && r.json().avisos.some(a => /Frete grátis é obrigatório/.test(a)) &&
    pedidos.filter(p => p.url.endsWith('/items') && p.metodo === 'POST').length === 2, 'a criação disse o motivo (frete grátis obrigatório): corrige sozinho e cria');
  validacoes = []; criacoes = [[{ code: 'body.required_fields', message: 'The body does not contains some or none of the following properties [family_name]', type: 'error' }]]; criados = [];
  r = await post({ acao: 'publicar', item: { ...ITEM, atributos: KL } });
  ok(r.json().ok && criados.length === 1 && criados[0].family_name === ITEM.titulo && !criados[0].title, 'validou, mas a criação pediu family_name: refaz e cria');
  // o que aconteceu de verdade com o #480: pede family_name; depois só a advertência do me1
  const ME1 = { department: 'shipping', cause_id: 4053, type: 'warning', code: 'shipping.lost_me1_by_user', references: ['user.shipping_preferences.modes'], message: 'User has not mode me1' };
  validacoes = [[{ code: 'body.required_fields', message: 'The body does not contains some or none of the following properties [family_name]', type: 'error' }], [ME1]];
  criados = []; criacoes = [];
  r = await post({ acao: 'publicar', item: { ...ITEM, atributos: KL } });
  ok(r.json().ok && criados.length === 1 && criados[0].family_name === ITEM.titulo && !criados[0].title && criados[0].shipping.mode === 'me2' && !(r.json().avisos || []).some(a => /me1/.test(a)),
    'validação com só advertência ("User has not mode me1"): não impede, cria (o caso do #480)');
  validacoes = [[ME1]]; criacoes = [[ME1]]; criados = [];
  r = await post({ acao: 'publicar', item: { ...ITEM, atributos: KL } });
  ok(r.status === 422 && /recusou o anúncio: User has not mode me1$/.test(r.json().erro) && !criados.length, 'a criação falhou só com advertência: aí ela é o motivo');
  criacoes = [];
  ok(T.formatar({ id: 'MODEL', value_type: 'string' }, 'E14  vPRO ').value_name === 'E14 vPRO', 'texto sem espaço dobrado ("E14  vPRO")');
  validacoes = [[{ code: 'item.attribute.invalid', message: 'Attribute [OS_NAME] has an invalid value', type: 'error' }]];
  r = await post({ acao: 'publicar', item: { ...ITEM, atributos: KL } });
  ok(r.json().ok === false && r.json().faltam.map(f => f.id).join() === 'OS_NAME' && /invalid value/.test(r.json().motivo) && !criados.length,
    'a resposta dele que o ML não aceitou: pergunta de novo, com o motivo');
  validacoes = [[{ code: 'item.attributes.missing_required', message: 'The attributes [OS_NAME, KEYBOARD_LANGUAGE] are required', type: 'error' }]];
  r = await post({ acao: 'publicar', item: { ...ITEM, atributos: { KEYBOARD_LANGUAGE: 'Português' } } });
  ok(r.json().ok === false && r.json().faltam.map(f => f.id).join() === 'OS_NAME' && !r.json().motivo, '"obrigatório" cita os que já foram: pergunta só o que faltou');
  validacoes = []; criacoes = [];

  console.log('\nas características da categoria Notebooks (a qualidade do anúncio)');
  const FICHA2 = { ...FICHA, ram: '16 GB', disco_tipo: 'NVMe', resolucao: '1920 x 1080', so: 'Windows', so_versao: '11', so_edicao: 'Pro', video_marca: 'Intel', video_linha: 'Iris Xe',
    video_modelo: 'Iris Xe Graphics', tipo_produto: 'Notebook', slots_ram: '2', tem: { wifi: true, webcam: false, retroiluminado: undefined } };
  const d2 = T.daFicha({ ...FICHA2, sku: '481' });
  ok(d2.RAM_MEMORY_MODULE_TOTAL_CAPACITY === '16 GB' && d2.M2_DATA_STORAGE_CAPACITY === '256 GB' && d2.SSD_INTERFACE === 'PCIe' && d2.DISPLAY_RESOLUTION === '1920 px x 1080 px' &&
    d2.DISPLAY_RESOLUTION_TYPE === 'Full HD' && d2.OS_VERSION === '11' && d2.WITH_WI_FI === 'Sim' && d2.WITH_WEBCAM === 'Não' && d2.WITH_BACKLIGHT_KEYBOARD === '' &&
    d2.WITH_RETINA_DISPLAY === 'Não' && d2.SELLER_SKU === '481' && !d2.ALPHANUMERIC_MODEL, 'a ficha vira as características: RAM no id da categoria, NVMe, resolução, Windows 11, Wi-Fi sim, webcam não (o que não se sabe fica de fora)');
  ATRIBUTOS.push(...NOTEBOOKS);
  const m3 = T.montarAtributos(ATRIBUTOS, { ...FICHA2, sku: '481' }, { OS_NAME: 'Windows', KEYBOARD_LANGUAGE: 'Português' }, {});
  const B = id => m3.atributos.find(a => a.id === id) || {};
  ok(B('RAM_MEMORY_MODULE_TOTAL_CAPACITY').value_name === '16 GB' && B('OS_EDITION').value_id === '4' && B('PRODUCT_TYPE').value_id === '5' && B('WITH_WEBCAM').value_id === '242084' &&
    B('RAM_SLOTS_NUMBER').value_name === '2' && B('SELLER_SKU').value_name === '481' && !m3.atributos.some(a => a.id === 'ALPHANUMERIC_MODEL' || a.id === 'WITH_BACKLIGHT_KEYBOARD'),
    'no anúncio: RAM, edição, tipo, webcam "Não" (pelo id), slots e SKU; sem modelo alfanumérico chutado nem o que não se sabe');

  console.log('\na condição: a loja só vende usado');
  validacoes = []; criacoes = []; criados = []; pedidos = []; condicaoCriado = 'new';
  r = await post({ acao: 'publicar', item: { ...ITEM, frete_gratis: true, atributos: KL } });
  const put1 = pedidos.find(p => p.metodo === 'PUT' && /\/items\/MLB4000000\d+$/.test(p.url));
  ok(r.json().ok && criados[0].condition === 'used' && put1 && JSON.parse(put1.corpo).condition === 'used' && !(r.json().avisos || []).some(a => /Novo/.test(a)),
    'o Mercado Livre criou como novo: põe como usado na hora');
  ok(criados[0].shipping.free_shipping === true, 'frete grátis ligado nas opções: o anúncio sai com frete grátis');
  condicaoCriado = 'used';

  console.log('\ncompletar o anúncio que já está lá');
  itemLa = { id: 'MLB8033815524', category_id: 'MLB1652', condition: 'new', sold_quantity: 0, attributes: [{ id: 'BRAND', value_id: '2005', value_name: 'Dell' }, { id: 'MODEL', value_name: '3420' }] };
  pedidos = []; putRecusas = [[{ type: 'error', code: 'item.attribute.invalid', message: 'Attribute [DISPLAY_RESOLUTION] is not valid' }]];
  r = await post({ acao: 'completar', id: 'MLB8033815524', ficha: FICHA2, atributos: { OS_NAME: 'Windows' }, sku: '481', pacote: ITEM.pacote });
  const puts = pedidos.filter(p => p.metodo === 'PUT' && p.url.endsWith('/items/MLB8033815524')).map(p => JSON.parse(p.corpo));
  const ultimoAttr = [...puts].reverse().find(c => c.attributes) || { attributes: [] }, ids2 = ultimoAttr.attributes.map(a => a.id);
  ok(r.status === 200 && r.json().ok && ids2.includes('RAM_MEMORY_MODULE_TOTAL_CAPACITY') && ids2.includes('WITH_WEBCAM') && ids2.includes('OS_NAME') && !ids2.includes('BRAND') && !ids2.includes('MODEL') &&
    !ids2.some(i => /^SELLER_PACKAGE_|^EMPTY_GTIN/.test(i)), 'manda só o que falta lá (a marca e o modelo que já estão não mudam): ' + ids2.join(','));
  ok(!ids2.includes('DISPLAY_RESOLUTION') && r.json().recusados.includes('DISPLAY_RESOLUTION') && r.json().adicionados.includes('RAM_MEMORY_MODULE_TOTAL_CAPACITY'),
    'o que o Mercado Livre recusou sai, e o resto vai');
  ok(puts.some(c => c.condition === 'used') && r.json().condicao === 'used', 'e a condição volta para usado');
  itemLa = { ...itemLa, condition: 'new', sold_quantity: 1 }; pedidos = [];
  r = await post({ acao: 'completar', id: 'MLB8033815524', ficha: FICHA2 });
  ok(!pedidos.some(p => p.metodo === 'PUT' && /"condition"/.test(p.corpo || '')) && r.json().condicao === 'new', 'com venda, a condição não muda (o Mercado Livre não deixa)');
  itemLa = null;
  ok(T.daFicha({ anatel: '054282003153' }).ANATEL_HOMOLOGATION_NUMBER === '054282003153' && T.daFicha({ anatel: '12' }).ANATEL_HOMOLOGATION_NUMBER === '',
    'a homologação da Anatel vai no anúncio (só número de homologação de verdade)');

  console.log('\nPremium e frete grátis no anúncio que já está lá');
  pedidos = [];
  r = await post({ acao: 'atualizar', id: 'MLB8033815524', tipo: 'gold_pro', frete_gratis: true, retirada: true });
  const lt = pedidos.find(p => p.url.endsWith('/items/MLB8033815524/listing_type')), fr = pedidos.find(p => p.metodo === 'PUT' && p.url.endsWith('/items/MLB8033815524'));
  ok(r.status === 200 && r.json().tipo === 'gold_pro' && r.json().frete_gratis === true && lt && JSON.parse(lt.corpo).id === 'gold_pro' &&
    fr && JSON.stringify(JSON.parse(fr.corpo).shipping) === '{"mode":"me2","free_shipping":true,"local_pick_up":true}', 'passa para Premium (rota do tipo) e liga o frete grátis (mantém a retirada)');
  r = await post({ acao: 'atualizar', id: 'MLB8033815524', tipo: 'diamante' });
  ok(r.status === 400, 'tipo que não existe: 400');
  r = await post({ acao: 'publicar', item: { ...ITEM, fotos: [] } });
  const r4 = await post({ acao: 'publicar', item: { ...ITEM, preco: 0 } });
  ok(r.status === 400 && /pelo menos uma foto/.test(r.json().erro) && r4.status === 400, 'sem foto ou sem preço: nem tenta');

  console.log('\npreço e situação');
  r = await post({ acao: 'atualizar', id: 'abc', preco: 2000 });
  ok(r.status === 400, 'anúncio inválido: 400');
  pedidos = []; r = await post({ acao: 'atualizar', id: 'MLB4000000001', preco: 1999.6 });
  const put = pedidos.find(p => p.metodo === 'PUT');
  ok(r.json().ok && put && JSON.parse(put.corpo).price === 2000 && r.json().preco === 2000, 'muda o preço (inteiro)');
  pedidos = []; r = await post({ acao: 'atualizar', id: 'MLB4000000001', status: 'closed' });
  ok(r.json().status === 'closed' && JSON.parse(pedidos.find(p => p.metodo === 'PUT').corpo).status === 'closed', 'vendida no sistema: encerra o anúncio');
  r = await post({ acao: 'atualizar', id: 'MLB999999999', status: 'closed' });
  ok(r.json().ok && r.json().jaEstava, 'já estava encerrado no ML: tudo certo');
  r = await post({ acao: 'atualizar', id: 'MLB4000000001', status: 'apagar' });
  ok(r.status === 400, 'situação que não existe: 400');

  console.log('\nsituação dos anúncios, pedidos e perguntas');
  r = await post({ acao: 'itens', ids: ['MLB40000001', 'MLB40000002', 'MLB404040404', 'lixo'] });
  const its = r.json().itens;
  ok(its.length === 2 && its[1].status === 'paused' && its[1].vendidos === 1 && its[1].sub[0] === 'out_of_stock' && /MLB40000001$/.test(its[0].link), 'lê situação, vendidos e link (o que não existe fica de fora)');
  pedidos = []; r = await post({ acao: 'novidades', desde: '2026-11-01T00:00:00.000Z' });
  const busca = new URL(pedidos.find(p => p.url.includes('/orders/search')).url);
  const pd = r.json().pedidos[0];
  ok(busca.searchParams.get('seller') === '777' && busca.searchParams.get('order.date_created.from') === '2026-11-01T00:00:00.000-00:00', 'busca os pedidos da conta desde a data');
  ok(pd.item === 'MLB40000002' && pd.status === 'paid' && pd.valor === 2199 && pd.comprador === 'COMPRADOR123' && r.json().perguntas === 3, 'pedido pago com o anúncio, o valor e o apelido; e 3 perguntas sem resposta');
  ok(!/Fulano|fulano@|Rua Secreta/.test(JSON.stringify(r.json())), 'nada de nome, e-mail ou endereço do comprador');
  mlFora = true;
  r = await post({ acao: 'novidades' });
  ok(r.status === 502 && /Não consegui falar com o Mercado Livre/.test(r.json().erro), 'Mercado Livre fora do ar: avisa');
  mlFora = false;
  r = await post({ acao: 'xyz' });
  ok(r.status === 400, 'ação desconhecida: 400');

  console.log('\no que a categoria pede, preenchido pela ficha');
  const cpuLista = { id: 'PROCESSOR_MODEL', name: 'Modelo do processador', value_type: 'list', tags: { required: true },
    values: [{ id: '91', name: 'i3-10110U' }, { id: '92', name: 'i5-10210U' }, { id: '93', name: '1005G1' }] };
  const fx = T.formatar(cpuLista, '10110U');
  ok(fx && fx.value_id === '91' && fx.value_name === 'i3-10110U', 'código "10110U" casa com a opção "i3-10110U" (vai o id da lista)');
  ok(T.formatar(cpuLista, '1005G1').value_id === '93' && !T.formatar(cpuLista, '10U').value_id, 'igual também casa; pedaço curto ("10U") não chuta opção');
  ok(T.daFicha({ so: 'Windows' }).OS_NAME === 'Windows' && T.daFicha({}).OS_NAME === '', 'sistema operacional sai da ficha (lido da descrição)');
  const soLista = { id: 'OPERATING_SYSTEM_NAME', name: 'Sistema operacional', value_type: 'list', tags: { required: true }, values: [{ id: '7', name: 'Windows' }, { id: '8', name: 'Linux' }] };
  const telaAt = { id: 'DISPLAY_SIZE', name: 'Tamanho da tela', value_type: 'number_unit', tags: { required: true }, allowed_units: [{ id: '"', name: '"' }], default_unit: '"' };
  const mx = T.montarAtributos([cpuLista, soLista, telaAt], { cpu_modelo: '10110U', so: 'Windows', tela: '14' }, {}, {});
  ok(!mx.faltam.length && mx.atributos.find(x => x.id === 'OPERATING_SYSTEM_NAME').value_id === '7' && mx.atributos.find(x => x.id === 'PROCESSOR_MODEL').value_id === '91' &&
    mx.atributos.find(x => x.id === 'DISPLAY_SIZE').value_name === '14 "', 'com processador, sistema e tela na ficha, a categoria não pergunta nada');
  const longa = { id: 'PROCESSOR_MODEL', name: 'Modelo do processador', value_type: 'list', tags: { required: true },
    values: Array.from({ length: 320 }, (_, i) => ({ id: String(i), name: (1000 + i) + 'U' })) };
  ok(T.infoAtributo(longa).valores.length === 320, 'a lista inteira vai para a tela (antes cortava em 120 e a opção certa podia ficar de fora)');

  console.log('\n' + (falhas ? falhas + ' FALHA(S)' : 'tudo verde'));
  process.exit(falhas ? 1 : 0);
})();
