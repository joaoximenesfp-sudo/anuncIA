'use strict';
// Testes do parser. Rode com: node bot/parser.test.js
//
// Sem framework de propósito — é uma dependência a menos pra manter num
// projeto que hoje não tem nenhuma.

const assert = require('assert');
const { parseGasto, paraNumero, mesAtual, CATEGORIAS, PAGAMENTOS } = require('./parser');

// Relógio fixo pra o teste não quebrar sozinho na virada do mês.
// 2026-08-11 14:00 em SP (17:00 UTC).
const AGORA = new Date('2026-08-11T17:00:00Z');

let passou = 0;
const falhas = [];

function t(titulo, fn) {
  try {
    fn();
    passou++;
  } catch (e) {
    falhas.push({ titulo, msg: e.message });
  }
}

// Açúcar: parseia e devolve o resumo, falhando alto se não deu certo.
function p(texto) {
  const r = parseGasto(texto, { agora: AGORA });
  assert.ok(r.ok, `esperava sucesso em "${texto}", veio erro "${r.erro}"`);
  return r.resumo;
}

// ── O caso que motivou tudo: mensagem de duas palavras ──────────────────
t('"almoço 32" → o básico', () => {
  const r = p('almoço 32');
  assert.strictEqual(r.nome, 'Almoço');
  assert.strictEqual(r.valor, 32);
  assert.strictEqual(r.categoria, 'Alimentação');
  assert.strictEqual(r.pagamento, 'Pix');
  assert.strictEqual(r.parcelas, 0);
});

t('acentuação do nome sobrevive ao parser', () => {
  assert.strictEqual(p('almoço 32').nome, 'Almoço');
  assert.strictEqual(p('farmácia 45').nome, 'Farmácia');
  assert.strictEqual(p('pão de queijo 12').nome, 'Pão queijo');
});

t('ordem invertida: valor antes do nome', () => {
  const r = p('32 almoço');
  assert.strictEqual(r.nome, 'Almoço');
  assert.strictEqual(r.valor, 32);
});

// ── Valor ───────────────────────────────────────────────────────────────
t('decimal com vírgula', () => {
  assert.strictEqual(p('mercado 120,50').valor, 120.5);
});

t('decimal com ponto', () => {
  assert.strictEqual(p('mercado 120.50').valor, 120.5);
});

t('milhar com ponto não vira decimal', () => {
  assert.strictEqual(p('aluguel 1.500').valor, 1500);
  assert.strictEqual(p('notebook 2.499,90').valor, 2499.9);
});

t('R$ colado ou solto não vaza pro nome', () => {
  assert.strictEqual(p('R$ 89 farmácia').valor, 89);
  assert.strictEqual(p('R$89 farmácia').nome, 'Farmácia');
  assert.strictEqual(p('farmácia R$ 89').nome, 'Farmácia');
});

t('paraNumero isolado', () => {
  assert.strictEqual(paraNumero('1.234,56'), 1234.56);
  assert.strictEqual(paraNumero('1234.56'), 1234.56);
  assert.strictEqual(paraNumero('1.500'), 1500);
  assert.strictEqual(paraNumero('32'), 32);
  assert.strictEqual(paraNumero('abc'), null);
});

// ── Parcelas ────────────────────────────────────────────────────────────
t('"3x" vira parcelas, não valor', () => {
  const r = p('netflix 55 3x');
  assert.strictEqual(r.valor, 55);
  assert.strictEqual(r.parcelas, 3);
  assert.strictEqual(r.nome, 'Netflix');
});

t('parcelar implica Crédito Parcelado sem você dizer', () => {
  assert.strictEqual(p('tênis 300 6x').pagamento, 'Crédito Parcelado');
  assert.strictEqual(p('tênis 300 credito 6x').pagamento, 'Crédito Parcelado');
});

t('parcela fora da faixa é ignorada', () => {
  const r = p('mercado 50 99x');
  assert.strictEqual(r.parcelas, 0);
  assert.strictEqual(r.valor, 50);
});

// ── Forma de pagamento ──────────────────────────────────────────────────
t('cada forma é reconhecida e some do nome', () => {
  assert.strictEqual(p('uber 18 debito').pagamento, 'Débito');
  assert.strictEqual(p('uber 18 débito').nome, 'Uber');
  assert.strictEqual(p('mercado 90 dinheiro').pagamento, 'Dinheiro');
  assert.strictEqual(p('mercado 90 pix').pagamento, 'Pix');
  assert.strictEqual(p('mercado 90 credito').pagamento, 'Crédito');
  assert.strictEqual(p('remédio 40 carina').pagamento, 'Cartão Carina');
  assert.strictEqual(p('remédio 40 carina').nome, 'Remédio');
});

t('"cartão de crédito" não vira só "cartão"', () => {
  const r = p('mercado 200 cartão de crédito');
  assert.strictEqual(r.pagamento, 'Crédito');
  assert.strictEqual(r.nome, 'Mercado');
});

// ── Categoria ───────────────────────────────────────────────────────────
t('categorias por palavra-chave', () => {
  assert.strictEqual(p('uber 18').categoria, 'Transporte');
  assert.strictEqual(p('gasolina 200').categoria, 'Transporte');
  assert.strictEqual(p('cinema 40').categoria, 'Lazer');
  assert.strictEqual(p('farmácia 60').categoria, 'Saúde');
  assert.strictEqual(p('aluguel 1200').categoria, 'Casa');
  assert.strictEqual(p('camiseta 70').categoria, 'Vestuário');
  assert.strictEqual(p('ifood 45').categoria, 'Alimentação');
});

t('plural também casa', () => {
  assert.strictEqual(p('remédios 80').categoria, 'Saúde');
  assert.strictEqual(p('livros 90').categoria, 'Lazer');
});

t('desconhecido cai em Outro, sem inventar', () => {
  assert.strictEqual(p('presente do joão 150').categoria, 'Outro');
});

t('cerveja é Lazer, não Alimentação', () => {
  assert.strictEqual(p('cerveja 30').categoria, 'Lazer');
});

t('toda categoria devolvida existe no select do app', () => {
  const amostra = ['uber 18', 'mercado 90', 'cinema 40', 'aluguel 1200',
    'farmácia 60', 'camiseta 70', 'xyz 10'];
  amostra.forEach((s) => assert.ok(CATEGORIAS.includes(p(s).categoria), s));
});

t('todo pagamento devolvido existe no select do app', () => {
  const amostra = ['mercado 90', 'mercado 90 pix', 'mercado 90 debito',
    'mercado 90 credito', 'mercado 90 dinheiro', 'mercado 90 carina',
    'mercado 90 6x'];
  amostra.forEach((s) => assert.ok(PAGAMENTOS.includes(p(s).pagamento), s));
});

// ── Frase solta, do jeito que a gente escreve com pressa ────────────────
t('frase inteira vira lançamento limpo', () => {
  const r = p('gastei 50 no mercado');
  assert.strictEqual(r.nome, 'Mercado');
  assert.strictEqual(r.valor, 50);
  assert.strictEqual(r.categoria, 'Alimentação');
});

t('frase com pagamento e parcela junto', () => {
  const r = p('comprei um tênis por 459,90 no crédito 10x');
  assert.strictEqual(r.valor, 459.9);
  assert.strictEqual(r.parcelas, 10);
  assert.strictEqual(r.pagamento, 'Crédito Parcelado');
  assert.strictEqual(r.categoria, 'Vestuário');
  assert.strictEqual(r.nome, 'Tênis');
});

t('número no meio do nome: pega o último', () => {
  const r = p('99 uber 18');
  assert.strictEqual(r.valor, 18);
});

// ── Mês e fuso ──────────────────────────────────────────────────────────
t('mês sai no formato YYYY-MM que o app usa', () => {
  assert.match(p('mercado 50').mes, /^\d{4}-\d{2}$/);
  assert.strictEqual(p('mercado 50').mes, '2026-08');
});

t('virada do mês respeita São Paulo, não UTC', () => {
  // 31/08 às 22h em SP = 01/09 01:00 UTC. Tem que continuar sendo agosto.
  const viradaSP = new Date('2026-09-01T01:00:00Z');
  assert.strictEqual(mesAtual(viradaSP), '2026-08');
  const r = parseGasto('mercado 50', { agora: viradaSP });
  assert.strictEqual(r.doc.mes, '2026-08');
});

// ── Entradas ruins não podem virar lançamento errado ────────────────────
t('mensagem sem valor é recusada', () => {
  assert.deepStrictEqual(parseGasto('almoço', { agora: AGORA }),
    { ok: false, erro: 'sem_valor' });
});

t('mensagem sem nome é recusada', () => {
  assert.strictEqual(parseGasto('50', { agora: AGORA }).ok, false);
});

t('vazio e lixo são recusados', () => {
  assert.strictEqual(parseGasto('', { agora: AGORA }).ok, false);
  assert.strictEqual(parseGasto('   ', { agora: AGORA }).ok, false);
  assert.strictEqual(parseGasto(null, { agora: AGORA }).ok, false);
  assert.strictEqual(parseGasto('valor zero 0', { agora: AGORA }).ok, false);
});

// ── Formato do documento gravado ────────────────────────────────────────
t('doc tem exatamente os campos que o app espera', () => {
  const { doc } = parseGasto('mercado 120,50 credito 3x', { agora: AGORA });
  assert.deepStrictEqual(Object.keys(doc).sort(), [
    'categoria', 'criadoEm', 'mes', 'nome', 'pagamento',
    'parcelaAtual', 'parcelas', 'valor',
  ]);
  assert.strictEqual(doc.parcelaAtual, 1);
  assert.strictEqual(typeof doc.valor, 'number');
  assert.strictEqual(doc.criadoEm, AGORA.toISOString());
});

t('sem parcelamento, parcelaAtual fica 0 (igual ao app)', () => {
  const { doc } = parseGasto('mercado 50', { agora: AGORA });
  assert.strictEqual(doc.parcelas, 0);
  assert.strictEqual(doc.parcelaAtual, 0);
});

// ── Relatório ───────────────────────────────────────────────────────────
if (falhas.length) {
  console.error(`\n✗ ${falhas.length} falha(s), ${passou} ok\n`);
  falhas.forEach((f) => console.error(`  ✗ ${f.titulo}\n    ${f.msg}\n`));
  process.exit(1);
}
console.log(`✓ ${passou} testes passaram`);
