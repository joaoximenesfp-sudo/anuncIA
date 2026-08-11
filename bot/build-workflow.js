'use strict';
// Gera `telegram-financas.json` (workflow n8n) embutindo o parser de parser.js.
//
// Rode: node bot/build-workflow.js
//
// O nó "Code" do n8n não consegue dar require em arquivo do repo, então o
// parser precisa viver dentro do JSON. Gerar em vez de copiar na mão é o que
// garante que o código testado e o código que roda em produção sejam o mesmo.

const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const SAIDA = path.join(DIR, 'telegram-financas.json');

// IDs das credenciais que já existem na sua conta n8n. Não são segredo —
// são só ponteiros; as chaves ficam guardadas no n8n. Se você recriar alguma
// credencial, troque aqui ou reaponte na tela depois de importar.
const CRED_TELEGRAM = { id: 'EHXulqZ0rbtdMJp1', name: 'Telegram account' };
const CRED_GOOGLE = { id: 'cnQky7PHBmau96KW', name: 'Google Service Account account' };

const PROJECT_ID = 'anuncia-70b88'; // index.html:2523
const COLECAO = 'financas_var';

// Campos gravados no Firestore, na ordem. Tem que bater com addVar() (index.html:5797).
const COLUNAS = 'userId,nome,valor,categoria,pagamento,mes,parcelas,parcelaAtual,criadoEm';

// ── Parser: pega o fonte e tira o que não roda dentro do nó Code ────────
function fonteDoParser() {
  const bruto = fs.readFileSync(path.join(DIR, 'parser.js'), 'utf8');
  const corte = bruto.indexOf('\nmodule.exports');
  if (corte === -1) throw new Error('parser.js: não achei o module.exports para cortar');
  return bruto
    .slice(0, corte)
    .replace(/^'use strict';\n/, '')
    .trim();
}

// ── Código do nó "Interpretar gasto" ────────────────────────────────────
function codigoDoNo() {
  return `// ╔══════════════════════════════════════════════════════════════════╗
// ║  GERADO POR bot/build-workflow.js — NÃO EDITE AQUI.              ║
// ║  Mexa em bot/parser.js, rode os testes e gere de novo.           ║
// ╚══════════════════════════════════════════════════════════════════╝

// ── CONFIGURE ESTAS DUAS LINHAS ANTES DE ATIVAR ────────────────────────
// UID do Firebase Auth. Sem ele o gasto grava num limbo que o site não lê.
// Como descobrir: veja o README (seção "Descobrir seu UID").
const USER_ID = 'PREENCHA_SEU_FIREBASE_UID';

// Seu chat id no Telegram. Enquanto estiver vazio o bot responde a QUALQUER
// pessoa que achar ele — e aí um estranho escreve na sua planilha.
const CHAT_ID_PERMITIDO = '';
// ───────────────────────────────────────────────────────────────────────

${fonteDoParser()}

// ── Cola com o Telegram ────────────────────────────────────────────────
const real = (v) => 'R$ ' + v.toLocaleString('pt-BR', {
  minimumFractionDigits: 2, maximumFractionDigits: 2,
});

const EMOJI_CAT = {
  'Alimentação': '🍽️', 'Transporte': '🚗', 'Lazer': '🎮', 'Saúde': '💊',
  'Vestuário': '👕', 'Casa': '🏠', 'Outro': '📦',
};
const EMOJI_PGTO = {
  'Pix': '💠', 'Débito': '💳', 'Crédito': '💳', 'Crédito Parcelado': '💳',
  'Cartão Carina': '🟣', 'Dinheiro': '💵',
};
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun',
  'jul', 'ago', 'set', 'out', 'nov', 'dez'];

const AJUDA = [
  '💸 *Como lançar um gasto*',
  '',
  'Escreve do jeito que vier na cabeça:',
  '• \`almoço 32\`',
  '• \`mercado 342,90 debito\`',
  '• \`tênis 459,90 10x\`',
  '• \`gastei 25 no lanche\`',
  '',
  '*Formas de pagamento:* pix, debito, credito, dinheiro, carina',
  '_Sem dizer nada, vai como Pix._',
  '',
  '*Parcelas:* escreva \`3x\`, \`10x\` — vira Crédito Parcelado sozinho.',
  '',
  'A categoria sai da própria palavra (uber → Transporte,',
  'farmácia → Saúde). O que não bater vai pra Outro.',
].join('\\n');

const msg = ($input.first().json || {}).message || {};
const texto = String(msg.text || '').trim();
const chatId = String((msg.chat || {}).id || '');

// Sem chat id travado o bot é público. Melhor não responder nada a estranho
// do que confirmar que existe algo aqui.
if (CHAT_ID_PERMITIDO && chatId !== String(CHAT_ID_PERMITIDO)) return [];
if (!texto) return [];

const responder = (t) => [{ json: { acao: 'responder', chatId, resposta: t } }];

if (/^\\/(start|ajuda|help)\\b/i.test(texto)) return responder(AJUDA);

if (USER_ID === 'PREENCHA_SEU_FIREBASE_UID') {
  return responder(
    '⚠️ Falta configurar o bot.\\n\\nAbra o nó *Interpretar gasto* no n8n e '
    + 'preencha \`USER_ID\` com seu UID do Firebase. O README explica como pegar.'
    + (chatId ? '\\n\\nAproveitando: seu chat id é \`' + chatId + '\`.' : '')
  );
}

const r = parseGasto(texto);

if (!r.ok) {
  const motivo = {
    sem_valor: 'Não achei o valor nessa mensagem.',
    sem_nome: 'Achei o valor, mas não o que foi o gasto.',
    vazio: 'Mensagem vazia.',
  }[r.erro] || 'Não consegui entender.';
  return responder(
    '🤔 ' + motivo + '\\n\\nTenta assim:\\n• \`almoço 32\`\\n• \`mercado 120,50 debito\`'
    + '\\n\\nManda /ajuda pra ver tudo.'
  );
}

const d = r.doc;
const [ano, mm] = d.mes.split('-');
const confirmacao = [
  '✅ *' + real(d.valor) + '* · ' + d.nome,
  (EMOJI_CAT[d.categoria] || '📦') + ' ' + d.categoria
    + ' · ' + (EMOJI_PGTO[d.pagamento] || '💳') + ' ' + d.pagamento
    + (d.parcelas > 0 ? ' ' + d.parcelas + 'x de ' + real(d.valor / d.parcelas) : ''),
  '📅 ' + MESES[parseInt(mm, 10) - 1] + '/' + ano,
].join('\\n');

// Campos do doc ficam no topo porque é assim que o nó do Firestore lê.
return [{
  json: {
    acao: 'gravar',
    chatId,
    confirmacao,
    userId: USER_ID,
    nome: d.nome,
    valor: d.valor,
    categoria: d.categoria,
    pagamento: d.pagamento,
    mes: d.mes,
    parcelas: d.parcelas,
    parcelaAtual: d.parcelaAtual,
    criadoEm: d.criadoEm,
  },
}];
`;
}

// ── Montagem do workflow ────────────────────────────────────────────────
const nos = [
  {
    parameters: { updates: ['message'], additionalFields: {} },
    id: 'a1000000-0000-4000-8000-000000000001',
    name: 'Mensagem no Telegram',
    type: 'n8n-nodes-base.telegramTrigger',
    typeVersion: 1.1,
    position: [-220, 300],
    webhookId: 'b2000000-0000-4000-8000-000000000001',
    credentials: { telegramApi: CRED_TELEGRAM },
  },
  {
    parameters: { mode: 'runOnceForAllItems', jsCode: codigoDoNo() },
    id: 'a1000000-0000-4000-8000-000000000002',
    name: 'Interpretar gasto',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [0, 300],
  },
  {
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
        conditions: [{
          id: 'c1000000-0000-4000-8000-000000000001',
          leftValue: '={{ $json.acao }}',
          rightValue: 'gravar',
          operator: { type: 'string', operation: 'equals' },
        }],
        combinator: 'and',
      },
      options: {},
    },
    id: 'a1000000-0000-4000-8000-000000000003',
    name: 'Entendeu o gasto?',
    type: 'n8n-nodes-base.if',
    typeVersion: 2.2,
    position: [220, 300],
  },
  {
    parameters: {
      operation: 'create',
      projectId: PROJECT_ID,
      database: '(default)',
      collection: COLECAO,
      columns: COLUNAS,
      options: {},
    },
    id: 'a1000000-0000-4000-8000-000000000004',
    name: 'Gravar em financas_var',
    type: 'n8n-nodes-base.googleFirebaseCloudFirestore',
    typeVersion: 1.1,
    position: [460, 200],
    credentials: { googleApi: CRED_GOOGLE },
  },
  {
    parameters: {
      chatId: "={{ $('Interpretar gasto').first().json.chatId }}",
      text: "={{ $('Interpretar gasto').first().json.confirmacao }}",
      additionalFields: { parse_mode: 'Markdown', appendAttribution: false },
    },
    id: 'a1000000-0000-4000-8000-000000000005',
    name: 'Confirmar no chat',
    type: 'n8n-nodes-base.telegram',
    typeVersion: 1.2,
    position: [700, 200],
    credentials: { telegramApi: CRED_TELEGRAM },
  },
  {
    parameters: {
      chatId: '={{ $json.chatId }}',
      text: '={{ $json.resposta }}',
      additionalFields: { parse_mode: 'Markdown', appendAttribution: false },
    },
    id: 'a1000000-0000-4000-8000-000000000006',
    name: 'Responder ajuda ou erro',
    type: 'n8n-nodes-base.telegram',
    typeVersion: 1.2,
    position: [460, 420],
    credentials: { telegramApi: CRED_TELEGRAM },
  },
];

const conexoes = {
  'Mensagem no Telegram': {
    main: [[{ node: 'Interpretar gasto', type: 'main', index: 0 }]],
  },
  'Interpretar gasto': {
    main: [[{ node: 'Entendeu o gasto?', type: 'main', index: 0 }]],
  },
  // Saída 0 = verdadeiro (grava), saída 1 = falso (responde).
  'Entendeu o gasto?': {
    main: [
      [{ node: 'Gravar em financas_var', type: 'main', index: 0 }],
      [{ node: 'Responder ajuda ou erro', type: 'main', index: 0 }],
    ],
  },
  'Gravar em financas_var': {
    main: [[{ node: 'Confirmar no chat', type: 'main', index: 0 }]],
  },
};

const workflow = {
  name: 'Finanças por Telegram — anuncIA',
  nodes: nos,
  connections: conexoes,
  settings: { executionOrder: 'v1' },
};

fs.writeFileSync(SAIDA, `${JSON.stringify(workflow, null, 2)}\n`);
console.log(`✓ ${path.relative(process.cwd(), SAIDA)} gerado (${nos.length} nós)`);
