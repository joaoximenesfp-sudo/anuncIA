'use strict';
// ══════════════════════════════════════════════════════════════════════
//  PARSER DE GASTOS — texto solto do Telegram → documento financas_var
// ══════════════════════════════════════════════════════════════════════
//
// Este arquivo é a FONTE DA VERDADE. O nó "Code" do workflow n8n é gerado
// a partir daqui por `build-workflow.js` — nunca edite o JSON na mão, senão
// os dois desencontram.
//
// Objetivo: você manda "almoço 32" e acabou. Nada de formulário, nada de
// escolher mês. Se der pra escrever no WhatsApp, dá pra lançar aqui.
//
// O documento gerado tem exatamente o mesmo formato que `addVar()` grava
// (index.html:5797), pra que o gasto apareça no site como qualquer outro:
//   { userId, nome, valor, categoria, pagamento, mes, parcelas, parcelaAtual, criadoEm }

// Valores que o app aceita nos selects (index.html:1536 e 1545).
// Escrever qualquer coisa fora desta lista faz o gasto sumir dos filtros.
const CATEGORIAS = ['Alimentação', 'Transporte', 'Lazer', 'Saúde', 'Vestuário', 'Casa', 'Outro'];
const PAGAMENTOS = ['Pix', 'Débito', 'Crédito', 'Crédito Parcelado', 'Cartão Carina', 'Dinheiro'];

// Na dúvida, Pix — é como a maioria das compras do dia a dia sai hoje.
const PAGAMENTO_PADRAO = 'Pix';

// Ordem importa: a primeira categoria que casar vence. Por isso "cerveja"
// mora em Lazer e não em Alimentação — bar é rolê, não é rancho.
const CATEGORIA_KEYWORDS = [
  ['Casa', ['aluguel', 'luz', 'energia', 'agua', 'internet', 'wifi', 'gas', 'condominio', 'iptu',
            'faxina', 'faxineira', 'limpeza', 'reforma', 'movel', 'moveis', 'sofa', 'geladeira',
            'fogao', 'colchao', 'panela', 'vassoura', 'detergente', 'sabao']],
  ['Saúde', ['farmacia', 'remedio', 'medico', 'dentista', 'consulta', 'exame', 'academia',
             'psicologo', 'terapia', 'vacina', 'oculos', 'lente', 'dermato', 'fisioterapia',
             'suplemento', 'whey']],
  ['Transporte', ['uber', 'gasolina', 'combustivel', 'alcool', 'etanol', 'diesel', 'onibus',
                  'metro', 'trem', 'estacionamento', 'pedagio', 'ipva', 'mecanico', 'pneu',
                  'oleo', 'lavagem', 'taxi', 'passagem', 'moto', 'bike', 'patinete',
                  'licenciamento', 'revisao']],
  ['Lazer', ['cinema', 'netflix', 'spotify', 'jogo', 'game', 'steam', 'viagem', 'festa', 'show',
             'bar', 'cerveja', 'balada', 'role', 'streaming', 'hbo', 'disney', 'prime', 'youtube',
             'livro', 'parque', 'ingresso', 'boliche', 'praia', 'hotel', 'airbnb']],
  ['Vestuário', ['roupa', 'camisa', 'camiseta', 'calca', 'bermuda', 'tenis', 'sapato', 'chinelo',
                 'blusa', 'moletom', 'jaqueta', 'meia', 'cueca', 'bone', 'relogio', 'mochila',
                 'shopping']],
  ['Alimentação', ['mercado', 'supermercado', 'almoco', 'janta', 'jantar', 'lanche', 'padaria',
                   'ifood', 'rappi', 'restaurante', 'cafe', 'pizza', 'hamburguer', 'burger',
                   'acougue', 'feira', 'hortifruti', 'marmita', 'sorvete', 'churrasco', 'pao',
                   'doce', 'chocolate', 'refrigerante', 'suco', 'coxinha', 'salgado', 'esfiha',
                   'sushi', 'japones', 'comida']],
];

// Cada forma de pagamento e como você provavelmente vai escrever ela às pressas.
const PAGAMENTO_KEYWORDS = [
  ['Cartão Carina', ['cartao da carina', 'cartao carina', 'carina']],
  ['Crédito', ['cartao de credito', 'credito', 'cred', 'cartao']],
  ['Débito', ['cartao de debito', 'debito', 'deb']],
  ['Dinheiro', ['dinheiro', 'especie', 'cash']],
  ['Pix', ['pix']],
];

// Palavras de ligação que não merecem virar nome de gasto.
// "hoje"/"ontem" entram aqui só pra limpar o nome — o dia é descartado de
// qualquer jeito, porque financas_var guarda mês (`mes`), não data. Ver README.
const RUIDO = new Set([
  'gastei', 'paguei', 'comprei', 'gasto', 'foi', 'de', 'do', 'da', 'no', 'na',
  'em', 'com', 'reais', 'real', 'pra', 'para', 'por', 'e', 'o', 'a', 'um', 'uma',
  'meu', 'minha', 'meus', 'minhas', 'hoje', 'ontem',
  'os', 'as', 'ao', 'aos', 'dos', 'das', 'nos', 'nas',
]);

// Baixa a caixa e tira acento, SEM mexer no comprimento: cada acento vira
// base + marca combinante e só a marca some, então todo caractere acentuado
// continua ocupando 1 posição. Assim o índice i do texto normalizado é o
// índice i do texto original — é isso que permite casar palavras sem acento
// e ainda montar o nome com a acentuação digitada ("almoço" continua
// "Almoço" no extrato, e não "Almoco").
function alinhado(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

function normalizar(s) {
  return alinhado(s).trim();
}

// Mês corrente em São Paulo. Usar UTC aqui jogaria toda compra feita depois
// das 21h do dia 31 para o mês seguinte — e o gasto sumiria da tela do mês.
function mesAtual(agora) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit',
  }).format(agora || new Date());
}

// "1.234,56" (brasileiro) e "1234.56" (digitado rápido) precisam virar o mesmo número.
function paraNumero(bruto) {
  let s = String(bruto).replace(/\s|r\$/gi, '');
  if (s.includes(',')) {
    // Vírgula presente ⇒ ela é o decimal e o ponto é separador de milhar.
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (/\.\d{3}$/.test(s)) {
    // "1.500" sem centavos é mil e quinhentos, não um e meio.
    s = s.replace(/\./g, '');
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

function capitalizar(s) {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Interpreta uma mensagem de gasto.
 *
 * @param {string} texto      O que você mandou. Ex: "almoço 32 credito 3x"
 * @param {object} [opcoes]
 * @param {Date}   [opcoes.agora]  Injetável para os testes não dependerem do relógio.
 * @returns {{ok: true, doc: object, resumo: object} | {ok: false, erro: string}}
 */
function parseGasto(texto, opcoes) {
  const opts = opcoes || {};
  const original = String(texto || '').trim();
  if (!original) return { ok: false, erro: 'vazio' };

  // `norm` é o texto de trabalho: cada pedaço já interpretado (parcelas,
  // pagamento, valor) é apagado dele. `manter` marca, posição a posição, o
  // que ainda pertence ao nome — e como os índices batem com `original`,
  // o nome sai acentuado no fim.
  let norm = alinhado(original);
  const manter = new Array(original.length).fill(true);
  const indicesBatem = norm.length === original.length;

  const consumir = (ini, fim) => {
    for (let i = ini; i < fim; i++) manter[i] = false;
    norm = norm.slice(0, ini) + ' '.repeat(fim - ini) + norm.slice(fim);
  };

  // ── 1. Parcelas ──────────────────────────────────────────────────────
  // Antes do valor, de propósito: em "netflix 55 3x" o "3" viraria o valor
  // se a gente varresse números primeiro.
  let parcelas = 0;
  const mParc = /(\d{1,2})\s*x(?![a-z0-9])/.exec(norm);
  if (mParc) {
    const n = parseInt(mParc[1], 10);
    if (n >= 2 && n <= 24) parcelas = n;
    consumir(mParc.index, mParc.index + mParc[0].length);
  }

  // ── 2. Forma de pagamento ────────────────────────────────────────────
  let pagamento = null;
  for (const [nome, chaves] of PAGAMENTO_KEYWORDS) {
    // Chaves já vêm da mais específica pra mais genérica dentro de cada
    // forma ("cartao de credito" antes de "cartao").
    for (const k of chaves) {
      const m = new RegExp(`(^|\\s)(${k})(?=\\s|$)`).exec(norm);
      if (m) {
        pagamento = nome;
        const ini = m.index + m[1].length;
        consumir(ini, ini + m[2].length);
        break;
      }
    }
    if (pagamento) break;
  }
  // Parcelou mas não disse como? Só existe uma forma de parcelar.
  if (parcelas > 0 && (!pagamento || pagamento === 'Crédito')) pagamento = 'Crédito Parcelado';
  if (!pagamento) pagamento = PAGAMENTO_PADRAO;

  // ── 3. Valor ─────────────────────────────────────────────────────────
  // Pega o ÚLTIMO número que sobrou: em "99 uber 18", 18 é a corrida.
  const reNum = /\d+(?:[.,]\d+)*/g;
  let mNum = null;
  let ultimo = null;
  while ((mNum = reNum.exec(norm)) !== null) ultimo = mNum;
  if (!ultimo) return { ok: false, erro: 'sem_valor' };
  const valor = paraNumero(ultimo[0]);
  if (valor === null || valor <= 0) return { ok: false, erro: 'sem_valor' };
  // Come também um "R$" colado antes do número, pra não sobrar no nome.
  const reCifrao = /r\$\s*$/.exec(norm.slice(0, ultimo.index));
  consumir(ultimo.index - (reCifrao ? reCifrao[0].length : 0), ultimo.index + ultimo[0].length);

  // ── 4. Nome ──────────────────────────────────────────────────────────
  const fonte = indicesBatem ? original : norm;
  const nome = fonte
    .split('')
    .map((ch, i) => (manter[i] ? ch : ' '))
    .join('')
    .split(/\s+/)
    .filter((p) => p && !RUIDO.has(normalizar(p)))
    .join(' ')
    .trim();
  if (!nome) return { ok: false, erro: 'sem_nome' };

  // ── 5. Categoria ─────────────────────────────────────────────────────
  // Casa contra o texto ORIGINAL inteiro: "uber" sai do nome quando você
  // escreve só "uber 18", mas a categoria ainda precisa enxergar a palavra.
  const alvo = normalizar(original);
  let categoria = 'Outro';
  for (const [cat, chaves] of CATEGORIA_KEYWORDS) {
    if (chaves.some((k) => new RegExp(`(^|\\s)${k}s?(?=\\s|$)`).test(alvo))) {
      categoria = cat;
      break;
    }
  }

  const nomeFinal = capitalizar(nome);
  const agora = opts.agora || new Date();

  return {
    ok: true,
    // Vai direto pro Firestore. O userId é preenchido pelo workflow.
    doc: {
      nome: nomeFinal,
      valor,
      categoria,
      pagamento,
      mes: mesAtual(agora),
      parcelas,
      parcelaAtual: parcelas > 0 ? 1 : 0,
      criadoEm: agora.toISOString(),
    },
    resumo: {
      nome: nomeFinal, valor, categoria, pagamento, parcelas, mes: mesAtual(agora),
    },
  };
}

module.exports = {
  parseGasto,
  normalizar,
  alinhado,
  paraNumero,
  mesAtual,
  CATEGORIAS,
  PAGAMENTOS,
  CATEGORIA_KEYWORDS,
  PAGAMENTO_KEYWORDS,
  PAGAMENTO_PADRAO,
  RUIDO,
};
