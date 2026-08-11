'use strict';
// Testa o nó "Code" já GERADO — não o parser.
// O parser tem seus próprios testes (parser.test.js); aqui a pergunta é outra:
// a cola com o Telegram se comporta? Trava estranho, responde /ajuda, recusa
// mensagem sem valor, e monta o item do jeito que o nó do Firestore espera?
//
// Rode: node bot/workflow.test.js

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const DIR = __dirname;
const JSON_PATH = path.join(DIR, 'telegram-financas.json');

// Sempre testa o artefato fresco — se alguém mexeu no parser e esqueceu de
// gerar, o teste tem que rodar contra o código novo e não contra o antigo.
execFileSync(process.execPath, [path.join(DIR, 'build-workflow.js')], { stdio: 'pipe' });

const workflow = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
const noCode = workflow.nodes.find((n) => n.name === 'Interpretar gasto');
assert.ok(noCode, 'nó "Interpretar gasto" sumiu do workflow');
const CODIGO = noCode.parameters.jsCode;

const UID_FAKE = 'uid-de-teste-123';
const CHAT_FAKE = '555000111';

/**
 * Executa o nó como o n8n executaria.
 * @param {string} texto        mensagem recebida
 * @param {object} [cfg]
 * @param {string} [cfg.uid]    valor de USER_ID (null = deixa o placeholder)
 * @param {string} [cfg.trava]  valor de CHAT_ID_PERMITIDO
 * @param {string} [cfg.chatId] chat de quem mandou
 */
function rodar(texto, cfg) {
  const c = cfg || {};
  let src = CODIGO;
  if (c.uid !== null) {
    src = src.replace("const USER_ID = 'PREENCHA_SEU_FIREBASE_UID';",
      `const USER_ID = ${JSON.stringify(c.uid || UID_FAKE)};`);
  }
  if (c.trava !== undefined) {
    src = src.replace("const CHAT_ID_PERMITIDO = '';",
      `const CHAT_ID_PERMITIDO = ${JSON.stringify(c.trava)};`);
  }
  const $input = {
    first: () => ({
      json: { message: { text: texto, chat: { id: c.chatId || CHAT_FAKE } } },
    }),
  };
  // eslint-disable-next-line no-new-func
  return new Function('$input', src)($input);
}

let passou = 0;
const falhas = [];
function t(titulo, fn) {
  try { fn(); passou++; } catch (e) { falhas.push({ titulo, msg: e.message }); }
}

// ── Segurança: o bot é público até você travar o chat ───────────────────
t('chat não autorizado não recebe resposta nenhuma', () => {
  const out = rodar('almoço 32', { trava: CHAT_FAKE, chatId: '999999' });
  assert.deepStrictEqual(out, [], 'estranho recebeu resposta');
});

t('chat autorizado passa normalmente', () => {
  const out = rodar('almoço 32', { trava: CHAT_FAKE, chatId: CHAT_FAKE });
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].json.acao, 'gravar');
});

t('sem trava configurada, aceita (e o README avisa do risco)', () => {
  const out = rodar('almoço 32', { chatId: '424242' });
  assert.strictEqual(out[0].json.acao, 'gravar');
});

// ── Configuração pela metade não pode gravar lixo ───────────────────────
t('USER_ID não preenchido avisa em vez de gravar', () => {
  const out = rodar('almoço 32', { uid: null });
  assert.strictEqual(out[0].json.acao, 'responder');
  assert.match(out[0].json.resposta, /USER_ID/);
});

t('e aproveita pra te dar o chat id que você precisa copiar', () => {
  const out = rodar('oi', { uid: null, chatId: '778899' });
  assert.match(out[0].json.resposta, /778899/);
});

// ── Comandos ────────────────────────────────────────────────────────────
t('/ajuda, /start e /help respondem o guia', () => {
  ['/ajuda', '/start', '/help'].forEach((cmd) => {
    const out = rodar(cmd);
    assert.strictEqual(out[0].json.acao, 'responder', cmd);
    assert.match(out[0].json.resposta, /Como lançar um gasto/, cmd);
  });
});

t('/ajuda funciona antes mesmo de configurar o UID', () => {
  const out = rodar('/ajuda', { uid: null });
  assert.match(out[0].json.resposta, /Como lançar um gasto/);
});

// ── Mensagem que não dá pra interpretar ─────────────────────────────────
t('gasto sem valor vira orientação, não lançamento', () => {
  const out = rodar('almoço');
  assert.strictEqual(out[0].json.acao, 'responder');
  assert.match(out[0].json.resposta, /valor/i);
});

t('mensagem vazia é ignorada em silêncio', () => {
  assert.deepStrictEqual(rodar(''), []);
  assert.deepStrictEqual(rodar('   '), []);
});

// ── O item que vai pro Firestore ────────────────────────────────────────
t('item carrega exatamente as colunas declaradas no nó do Firestore', () => {
  const noFs = workflow.nodes.find((n) => n.name === 'Gravar em financas_var');
  const colunas = noFs.parameters.columns.split(',');
  const item = rodar('mercado 342,90 debito')[0].json;
  colunas.forEach((c) => {
    assert.ok(Object.prototype.hasOwnProperty.call(item, c),
      `o nó grava a coluna "${c}" mas o item não tem esse campo`);
  });
});

t('valores chegam com o tipo certo', () => {
  const item = rodar('mercado 342,90 debito')[0].json;
  assert.strictEqual(item.userId, UID_FAKE);
  assert.strictEqual(item.nome, 'Mercado');
  assert.strictEqual(typeof item.valor, 'number');
  assert.strictEqual(item.valor, 342.9);
  assert.strictEqual(item.categoria, 'Alimentação');
  assert.strictEqual(item.pagamento, 'Débito');
  assert.match(item.mes, /^\d{4}-\d{2}$/);
  assert.strictEqual(typeof item.parcelas, 'number');
});

t('parcelado mostra o valor da parcela na confirmação', () => {
  const item = rodar('tênis 459,90 10x')[0].json;
  assert.strictEqual(item.parcelas, 10);
  assert.match(item.confirmacao, /10x de R\$ 45,99/);
});

t('confirmação traz valor, nome, categoria e mês', () => {
  const item = rodar('almoço 32')[0].json;
  assert.match(item.confirmacao, /R\$ 32,00/);
  assert.match(item.confirmacao, /Almoço/);
  assert.match(item.confirmacao, /Alimentação/);
  assert.match(item.confirmacao, /\w{3}\/\d{4}/);
});

// ── Coerência do workflow ───────────────────────────────────────────────
t('o Firestore grava na coleção e no projeto certos', () => {
  const noFs = workflow.nodes.find((n) => n.name === 'Gravar em financas_var');
  assert.strictEqual(noFs.parameters.collection, 'financas_var');
  assert.strictEqual(noFs.parameters.projectId, 'anuncia-70b88');
  assert.strictEqual(noFs.parameters.operation, 'create');
});

t('saída falsa do IF vai pro nó de resposta, não pro Firestore', () => {
  const saidas = workflow.connections['Entendeu o gasto?'].main;
  assert.strictEqual(saidas[0][0].node, 'Gravar em financas_var');
  assert.strictEqual(saidas[1][0].node, 'Responder ajuda ou erro');
});

t('todo nó citado nas conexões existe de fato', () => {
  const nomes = new Set(workflow.nodes.map((n) => n.name));
  Object.entries(workflow.connections).forEach(([origem, conf]) => {
    assert.ok(nomes.has(origem), `conexão parte de nó inexistente: ${origem}`);
    conf.main.flat().forEach((c) => {
      assert.ok(nomes.has(c.node), `conexão aponta pra nó inexistente: ${c.node}`);
    });
  });
});

t('nenhum segredo foi parar no JSON', () => {
  const bruto = fs.readFileSync(JSON_PATH, 'utf8');
  // Credencial no n8n é referência por id; token/chave de verdade, nunca.
  assert.ok(!/-----BEGIN|private_key|bot[0-9]{8,}:/i.test(bruto),
    'tem material sensível dentro do workflow');
});

// ── Relatório ───────────────────────────────────────────────────────────
if (falhas.length) {
  console.error(`\n✗ ${falhas.length} falha(s), ${passou} ok\n`);
  falhas.forEach((f) => console.error(`  ✗ ${f.titulo}\n    ${f.msg}\n`));
  process.exit(1);
}
console.log(`✓ ${passou} testes do workflow passaram`);
