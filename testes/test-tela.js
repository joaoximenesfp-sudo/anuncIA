// Rede de telas nos carros (pasta tela/): o que toca em cada horário e cidade,
// a contagem do que passou, o bônus dos motoristas, o pacote e o /q dos QRs.
// Roda no Node puro: node testes/test-tela.js
const fs = require('fs'), path = require('path');
const RAIZ = path.join(__dirname, '..');
const N = require('../tela/nucleo.js');
let falhas = 0;
const ok = (c, n) => { if (c) console.log('  ok  ' + n); else { falhas++; console.log('  FALHOU  ' + n); } };
const em = (s) => new Date(s); // horário local de quem roda o teste

console.log('\nhorário, dia e cidade');
const pico = { das: '18:00', ate: '23:00' };
ok(N.vale(pico, em('2026-11-20T19:30:00'), ''), '19h30 está no pico 18h–23h');
ok(!N.vale(pico, em('2026-11-20T23:00:00'), ''), '23h00 já saiu do pico');
ok(!N.vale(pico, em('2026-11-20T17:59:00'), ''), '17h59 ainda não é pico');
const balada = { das: '21:00', ate: '02:00', dias: [4, 5, 6] }; // quinta a sábado
ok(N.vale(balada, em('2026-11-20T22:00:00'), ''), 'balada: sexta 22h vale');
ok(N.vale(balada, em('2026-11-22T01:30:00'), ''), 'balada: domingo 1h30 ainda é a noite de sábado');
ok(!N.vale(balada, em('2026-11-23T01:30:00'), ''), 'balada: segunda 1h30 (noite de domingo) não vale');
ok(!N.vale(balada, em('2026-11-19T20:00:00'), ''), 'balada: quinta 20h ainda não começou');
ok(N.vale({ cidades: ['sumare'] }, em('2026-11-20T10:00:00'), 'sumare'), 'cidade certa vale');
ok(!N.vale({ cidades: ['sumare'] }, em('2026-11-20T10:00:00'), 'campinas'), 'outra cidade não vale');
const contrato = { periodo: { inicio: '2026-12-01', fim: '2026-12-31' } };
ok(!N.vale(contrato, em('2026-11-30T12:00:00'), ''), 'antes do contrato não toca');
ok(N.vale(contrato, em('2026-12-31T23:00:00'), ''), 'último dia do contrato ainda toca');

console.log('\ncotas no loop');
const pac = {
  midias: { a: { tipo: 'imagem' }, hamb: { tipo: 'video', duracao: 15 }, padaria: { tipo: 'imagem' }, casa: { tipo: 'imagem' } },
  loop: [
    { midia: 'a', segundos: 14 },
    { cota: 'c1', opcoes: [{ midia: 'hamb', das: '18:00', ate: '23:00', cidades: ['campinas'] }, { midia: 'padaria', segundos: 15, das: '06:00', ate: '11:00' }, { midia: 'casa', segundos: 15 }] },
    { cota: 'vazia', opcoes: [{ midia: 'hamb', das: '03:00', ate: '04:00' }] },
  ],
};
ok(N.escolher(pac.loop[1], em('2026-11-20T19:00:00'), 'campinas').midia === 'hamb', 'pico em Campinas: hamburgueria');
ok(N.escolher(pac.loop[1], em('2026-11-20T19:00:00'), 'sumare').midia === 'casa', 'pico em Sumaré: cai no anúncio da casa');
ok(N.escolher(pac.loop[1], em('2026-11-20T08:00:00'), 'campinas').midia === 'padaria', 'de manhã: padaria');
let p = N.proximo(pac, 0, em('2026-11-20T12:00:00'), 'campinas');
ok(p.pos === 1 && p.item.midia === 'casa', 'próximo depois da posição 0 é a cota');
p = N.proximo(pac, 1, em('2026-11-20T12:00:00'), 'campinas');
ok(p.pos === 0, 'cota vazia é pulada e o loop volta ao começo');
ok(N.duracaoLoop(pac, em('2026-11-20T19:00:00'), 'campinas') === 29, 'loop no pico dura 14 + 15 s');

console.log('\ncontagem do que passou');
const ag = {};
const t = em('2026-11-20T19:10:00');
N.anotarExibicao(ag, t, 'a', 14); N.anotarExibicao(ag, t, 'a', 14); N.anotarTela(ag, t, 10);
N.anotarVibracao(ag, t, 0.01); N.anotarVibracao(ag, t, 0.15); N.anotarVibracao(ag, t, 0.5);
const h = ag['2026-11-20'][19];
ok(h.e.a[0] === 2 && h.e.a[1] === 28, 'duas exibições, 28 s');
ok(JSON.stringify(h.v) === '[1,0,1,0,1]', 'vibração separada por faixa: ' + JSON.stringify(h.v));
ok(Math.abs(N.desvio([9.8, 9.8, 9.8]) - 0) < 1e-9 && N.desvio([9.6, 10]) > 0.19, 'desvio da aceleração');
const ls = N.lotes(ag, { carro: 'C01', chave: 'k'.repeat(12), cidade: 'campinas', pacote: 'v1', app: 'x' }, pac);
ok(ls.length === 1 && ls[0].mes === '2026-11' && /^[0-9a-f]{24}$/.test(ls[0].id), 'um lote por dia, com id aleatório');
const f = N.campos({ n: 3, x: 1.5, s: 'a', b: true, d: new Date('2026-11-20T00:00:00Z'), l: [1, 'b'], m: { k: [2, 3] } });
ok(f.n.integerValue === '3' && f.x.doubleValue === 1.5 && f.s.stringValue === 'a' && f.b.booleanValue === true, 'tipos simples no formato do Firestore');
ok(f.d.timestampValue === '2026-11-20T00:00:00.000Z' && f.l.arrayValue.values[1].stringValue === 'b' && f.m.mapValue.fields.k.arrayValue.values[0].integerValue === '2', 'data, lista e mapa');

console.log('\npareamento e links');
const par = N.lerPareamento('#parear=c07.abcdef123456.sumare');
ok(par && par.carro === 'C07' && par.chave === 'abcdef123456' && par.cidade === 'sumare', 'lê o link de pareamento');
ok(N.lerPareamento('#parear=C07.curta') === null, 'chave curta não pareia');
ok(N.linkPareamento('C07', 'abcdef123456', 'sumare') === 'https://anunc-ia.vercel.app/tela/#parear=C07.abcdef123456.sumare', 'monta o link');
ok(N.linkQR('tech', 'C07') === 'https://anunc-ia.vercel.app/q/tech/C07', 'link do QR leva anúncio e carro');
ok(N.slug('Hortolândia ') === 'hortolandia' && N.slug('Santa Bárbara d\'Oeste') === 'santa-barbara-d-oeste', 'cidade vira código sem acento');
ok(N.novaChave().length === 32, 'chave do carro com 32 caracteres');

console.log('\nscans e bônus');
const s = (carro, h, hora = 19, anuncio = 'tech') => ({ carro, h, hora, anuncio, dia: '2026-11-20', em: Date.parse('2026-11-20T19:00:00Z') });
const scans = [s('C01', 'p1'), s('C01', 'p1'), s('C01', 'p2'), s('C02', 'p3'), ...Array.from({ length: 9 }, (_, i) => s('C03', 'x' + i))];
ok(N.scansValidos(scans).filter(x => x.carro === 'C01').length === 2, 'mesmo celular no mesmo dia conta uma vez');
ok(N.scansValidos(scans).filter(x => x.carro === 'C03').length === N.LIMITE_SCANS_HORA, `no máximo ${N.LIMITE_SCANS_HORA} scans por carro por hora`);
const lote = (carro, tela, mov, extra = {}) => Object.assign({ carro, cidade: 'campinas', dia: '2026-11-20', mes: '2026-11',
  horas: { 19: { t: tela, v: [0, 0, mov / 10, 0, 0], e: { hamb: [10, 150], t01: [5, 70] } } }, dono: { hamb: 'hamb' }, qr: { t01: ['tech'] } }, extra);
const r = N.resumoMes({ lotes: [lote('C01', 3600, 3600), lote('C02', 3600, 1800), lote('C03', 3600, 0, { horas: { 19: { t: 3600, v: [0, 0, 0, 0, 0], e: {} } } })],
  scans: [s('C01', 'a'), s('C01', 'b'), s('C02', 'c', 19, 'hamb')], pesoHora: 1, pesoScan: 2, valorBonus: 100 });
const C = id => r.carros.find(c => c.carro === id);
ok(Math.abs(C('C01').horasMov - 1) < 1e-9 && Math.abs(C('C02').horasMov - 0.5) < 1e-9, 'horas rodando pela vibração');
ok(C('C03').semSensor && Math.abs(C('C03').horasMov - 1) < 1e-9, 'tablet sem sensor conta as horas de tela');
ok(C('C01').pontos === 5 && C('C02').pontos === 2.5 && C('C03').pontos === 1, 'pontos = horas + 2 × scans');
ok(Math.round(r.carros.reduce((a, c) => a + c.bonus, 0) * 100) === 10000, 'o bônus fecha o valor exato: ' + r.carros.map(c => c.bonus).join(' + '));
ok(Math.abs(C('C01').bonus - 58.83) < 0.011, 'C01 leva a parte dele: ' + C('C01').bonus);
const hamb = r.anuncios.find(a => a.anuncio === 'hamb');
ok(hamb.exib === 20 && hamb.faixas.pico === 20 && hamb.scans === 1 && hamb.carros.size === 2, 'relatório do anunciante: exibições no pico, scans e carros');
ok(r.anuncios.find(a => a.anuncio === 'tech').exibQR === 10, 'conta as vezes que o QR da Tech apareceu nas dicas');
const r2 = N.resumoMes({ lotes: [lote('C01', 3600, 3600), lote('C02', 3600, 1800), lote('C03', 3600, 0, { horas: { 19: { t: 3600, v: [0, 0, 0, 0, 0], e: {} } } })],
  scans: [s('C01', 'a'), s('C01', 'b'), s('C02', 'c', 19, 'hamb'), s('X', 'd'), s('ZZZ', 'e'), s('ZZZ', 'f')], pesoHora: 1, pesoScan: 2, valorBonus: 100,
  cadastrados: ['C01', 'C02', 'C03'] });
ok(!r2.carros.some(c => c.carro === 'X' || c.carro === 'ZZZ') && r2.foraDoCadastro === 3, 'scan de carro fora do cadastro (X, código inventado) não entra');
ok(r2.carros.find(c => c.carro === 'C01').bonus === C('C01').bonus, 'e não muda o bônus de quem é do cadastro');

console.log('\npacote publicado (tela/pacote.json)');
const pacote = JSON.parse(fs.readFileSync(path.join(RAIZ, 'tela/pacote.json'), 'utf8'));
const crypto = require('crypto');
let arqOk = true, hashOk = true;
for (const [id, m] of Object.entries(pacote.midias)) {
  const arq = path.join(RAIZ, 'tela', m.arquivo);
  if (!fs.existsSync(arq)) { arqOk = false; console.log('     falta ' + m.arquivo); continue; }
  if (crypto.createHash('sha256').update(fs.readFileSync(arq)).digest('hex').slice(0, 12) !== m.hash) { hashOk = false; console.log('     hash velho em ' + id); }
}
ok(arqOk, 'todo arquivo do pacote existe');
ok(hashOk, 'hash confere (o tablet só baixa de novo o que mudou)');
const usadas = pacote.loop.flatMap(e => e.cota ? e.opcoes.map(o => o.midia) : [e.midia]);
ok(usadas.every(id => pacote.midias[id]), 'o loop só usa mídia que existe');
const qrs = Object.values(pacote.midias).flatMap(m => m.qr || []);
ok(qrs.every(q => pacote.anuncios[q.anuncio]), 'todo QR aponta para um anúncio com destino');
ok(Object.values(pacote.anuncios).every(a => /^https:\/\//.test(a.destino)), 'destinos em https');
const dur = N.duracaoLoop(pacote, em('2026-11-20T12:00:00'), 'campinas');
ok(Math.abs(dur - 600) < 2, `loop de 10 min (${dur.toFixed(1)} s)`);

console.log('\n/q/:anuncio/:carro (api/q.js)');
(async () => {
  const pedidos = [];
  global.fetch = async (url, op) => { pedidos.push({ url, corpo: JSON.parse(op.body) }); return { ok: true, status: 200 }; };
  const q = require('../api/q.js');
  const chamar = async (query, headers = {}) => {
    const res = { headers: {}, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, end() { this.fim = true; } };
    await q({ query, headers: Object.assign({ 'x-forwarded-for': '200.1.2.3, 10.0.0.1', 'user-agent': 'Android' }, headers) }, res);
    return res;
  };
  let res = await chamar({ anuncio: 'tech', carro: 'c07' });
  ok(res.statusCode === 302 && res.headers.location === pacote.anuncios.tech.destino, 'manda para o WhatsApp da Tech');
  ok(res.headers['cache-control'] === 'no-store', 'sem cache (cada scan passa por aqui)');
  const fs1 = pedidos[0] && pedidos[0].corpo.fields;
  ok(pedidos[0] && pedidos[0].url.includes('/documents/tela_scans?documentId='), 'registra em tela_scans');
  ok(fs1 && fs1.carro.stringValue === 'C07' && fs1.anuncio.stringValue === 'tech', 'com carro e anúncio');
  ok(fs1 && /^[0-9a-f]{16}$/.test(fs1.h.stringValue) && !JSON.stringify(fs1).includes('200.1.2.3'), 'guarda só o resumo, nunca o IP');
  ok(fs1 && /^\d{4}-\d{2}-\d{2}$/.test(fs1.dia.stringValue) && +fs1.hora.integerValue >= 0, 'dia e hora de Campinas');
  await chamar({ anuncio: 'tech', carro: 'c07' });
  ok(pedidos[1] && pedidos[1].corpo.fields.h.stringValue === fs1.h.stringValue, 'mesmo celular no mesmo dia: mesmo resumo');
  res = await chamar({ anuncio: 'nao-existe', carro: 'C01' });
  ok(res.headers.location === 'https://anunc-ia.vercel.app/catalogo.html' && pedidos.length === 2, 'anúncio desconhecido: vai pro catálogo, sem registrar');
  res = await chamar({ anuncio: 'GIO', carro: '../x' });
  ok(res.headers.location === pacote.anuncios.gio.destino && pedidos[2].corpo.fields.carro.stringValue === 'X', 'limpa o carro que vem no endereço');
  res = await chamar({ anuncio: 'gio<script>', carro: 'C01' });
  ok(res.headers.location === 'https://anunc-ia.vercel.app/catalogo.html' && pedidos.length === 3, 'anúncio com lixo não vira outro anúncio');
  global.fetch = async () => { throw new Error('fora do ar'); };
  res = await chamar({ anuncio: 'gio', carro: 'C01' });
  ok(res.statusCode === 302 && res.headers.location === pacote.anuncios.gio.destino, 'Firestore fora do ar: a pessoa chega no WhatsApp mesmo assim');

  const vj = JSON.parse(fs.readFileSync(path.join(RAIZ, 'vercel.json'), 'utf8'));
  ok(vj.rewrites.some(r => r.source === '/q/:anuncio/:carro' && r.destination.startsWith('/api/q')), 'vercel.json leva /q/ para a função');

  console.log('\n' + (falhas ? falhas + ' FALHA(S)' : 'tudo verde'));
  process.exit(falhas ? 1 : 0);
})();
