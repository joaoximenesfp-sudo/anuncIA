// Gasto rápido: um campo só ("45 gasolina") tem que virar valor, nome,
// categoria e parcelas certos, senão o financeiro fica errado sem ninguém ver.
const {extrair,SRC}=require('./extrair');
let falhas=0;
const ok=(c,n)=>{ if(c) console.log('  ok  '+n); else {falhas++; console.log('  FALHOU  '+n);} };

const codigo=[
  extrair('const GR_PALAVRAS={'),
  extrair('function grSemAcento(s){'),
  extrair('function grCategoria(texto){'),
  extrair('function grLer(texto){'),
  'return {grLer, grCategoria};'
].join('\n');
const F=new Function(codigo)();

console.log('\nleitura do texto');
const casos=[
  ['45 gasolina',          {valor:45, nome:'Gasolina', parcelas:0}],
  ['gasolina 45,90',       {valor:45.9, nome:'Gasolina', parcelas:0}],
  ['R$ 1.200 aluguel',     {valor:1200, nome:'Aluguel', parcelas:0}],
  ['1.200,50 aluguel',     {valor:1200.5, nome:'Aluguel', parcelas:0}],
  ['tênis 600 3x',         {valor:600, nome:'Tênis', parcelas:3}],
  ['12.5 café',            {valor:12.5, nome:'Café', parcelas:0}],
  ['mercado 230',          {valor:230, nome:'Mercado', parcelas:0}],
  ['80',                   {valor:80, nome:'', parcelas:0}],
];
for(const [t,esp] of casos){
  const r=F.grLer(t);
  const errado=!r || Object.entries(esp).some(([k,v])=>r[k]!==v);
  ok(!errado, `"${t}" → ${r?`${r.valor} · "${r.nome}" · ${r.parcelas}x`:'nada'}`);
}
ok(F.grLer('gasolina')===null, 'sem valor não lança');
ok(F.grLer('')===null, 'vazio não lança');
ok(F.grLer('0 nada')===null, 'zero não lança');

console.log('\ncategoria pelas palavras');
[['Gasolina','Transporte'],['Uber pro centro','Transporte'],['Mercado','Alimentação'],['Açaí','Alimentação'],
 ['iFood','Alimentação'],['Farmácia','Saúde'],['Academia','Saúde'],['Aluguel','Casa'],['Conta de luz','Casa'],
 ['Tênis','Vestuário'],['Ingresso Hopi Hari','Lazer'],['Peça qualquer','Outro'],['','Outro']]
  .forEach(([t,c])=>ok(F.grCategoria(t)===c, `"${t}" → ${F.grCategoria(t)}`));

console.log('\nligações no app');
ok(/try\{ grMontar\(\); \}catch\(e\)\{\}/.test(SRC), 'o botão aparece depois do login');
ok(/origem:'rapido'/.test(SRC), 'o lançamento rápido é marcado, pra contar os do dia');
ok(/collection\(db,'financas_var'\),obj\); variaveis\.push/.test(SRC), 'grava no mesmo lugar dos gastos variáveis da aba Finanças');
ok(/\.gr-caixa\[hidden\]/.test(SRC), 'a caixa respeita o hidden, senão abriria sozinha');

console.log('\n'+(falhas?falhas+' FALHA(S)':'tudo verde'));
process.exit(falhas?1:0);
