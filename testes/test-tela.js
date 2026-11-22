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
const pac2 = { midias: { a: { tipo: 'imagem', dono: 'tech' }, h: { tipo: 'video', duracao: 15, dono: 'hamb' }, c: { tipo: 'imagem' } },
  loop: [{ midia: 'a', segundos: 15 }, { cota: 'c1', opcoes: [{ midia: 'h', das: '18:00', ate: '23:00', cidades: ['campinas'] }, { midia: 'c', segundos: 15 }] }, { midia: 'c', segundos: 30 }] };
const grade = N.programacao(pac2, em('2026-11-20T12:00:00'), 'campinas');
ok(grade.map(f => f.das + '-' + f.ate).join() === '00:00-18:00,18:00-23:00,23:00-24:00', 'programação do dia em faixas: ' + grade.map(f => f.das + '-' + f.ate).join(' '));
const hambPico = grade[1].anuncios.find(a => a.dono === 'hamb');
ok(hambPico && Math.round(hambPico.vezesHora) === 60 && !grade[0].anuncios.some(a => a.dono === 'hamb'), 'hamburgueria só no pico, 60 vezes por hora (loop de 1 min)');
ok(N.programacao(pac2, em('2026-11-20T12:00:00'), 'sumare').length === 1, 'em outra cidade a cota não entra: o dia todo igual');

console.log('\nanúncio por região');
const pacR = { regioes: { centro: { nome: 'Centro de Campinas', lat: -22.9056, lon: -47.0608, km: 1.5 }, barao: { nome: 'Barão Geraldo', lat: -22.8236, lon: -47.0786, km: 2.5 } },
  midias: { d: { tipo: 'imagem' }, c1: { tipo: 'imagem', dono: 'lojac1' }, c2: { tipo: 'imagem', dono: 'lojac2' }, b1: { tipo: 'imagem', dono: 'pizzab' }, e: { tipo: 'imagem', dono: 'eletr' }, g: { tipo: 'imagem', dono: 'tech' } },
  loop: [{ midia: 'd', segundos: 10 }, { cota: 'reg', rodizio: true, opcoes: [{ midia: 'c1', segundos: 10, regioes: ['centro'] }, { midia: 'c2', segundos: 10, regioes: ['centro'] },
    { midia: 'b1', segundos: 10, regioes: ['barao'] }, { midia: 'e', segundos: 10, regioes: ['barao', 'centro'] }, { midia: 'g', segundos: 10 }] }] };
ok(JSON.stringify(N.regioesEm(pacR, { lat: -22.9050, lon: -47.0600 })) === '["centro"]' && JSON.stringify(N.regioesEm(pacR, { lat: -22.8240, lon: -47.0790 })) === '["barao"]', 'acha a região pelo GPS');
ok(N.regioesEm(pacR, { lat: -22.95, lon: -47.10 }).length === 0 && N.regioesEm(pacR, null).length === 0, 'fora das regiões, ou sem GPS: nenhuma');
const giroT = (() => { const n = {}; return c => { const k = n[c] || 0; n[c] = k + 1; return k; }; })();
const seqR = l => Array.from({ length: 6 }, () => N.escolher(pacR.loop[1], em('2026-11-20T12:00:00'), 'campinas', l, giroT).midia).join(',');
ok(seqR({ regioes: ['centro'] }) === 'c1,c2,e,c1,c2,e', 'no Centro: só os anunciantes do Centro (e quem atende as duas), revezando');
ok(seqR({ regioes: ['barao'] }) === 'b1,e,b1,e,b1,e', 'em Barão Geraldo: só os de Barão');
ok(seqR({ regioes: [] }) === 'g,g,g,g,g,g' && N.escolher(pacR.loop[1], em('2026-11-20T12:00:00'), 'campinas', undefined) .midia === 'g', 'fora das regiões ou sem GPS: o anúncio geral');
const gC = N.programacao(pacR, em('2026-11-20T12:00:00'), 'campinas', { regioes: ['centro'] })[0].anuncios;
ok(['lojac1', 'lojac2', 'eletr'].every(d => gC.some(a => a.dono === d)) && !gC.some(a => a.dono === 'pizzab' || a.dono === 'tech'), 'programação no Centro mostra só os do Centro');
const regioesUsadas = pac => (pac.loop || []).flatMap(e => e.cota ? e.opcoes : [e]).flatMap(o => o.regioes || []);


console.log('\nregiões em faixa e regiões que repartem a cidade');
const pacS = { regioes: {
  centro: { nome: 'Centro', lat: -22.9056, lon: -47.0608, km: 1.5 },
  avenida: { nome: 'Avenida', km: 1, areas: [{ lat: -22.902, lon: -47.101, km: 1.2 }, { lat: -22.896, lon: -47.145 }] },
  leste: { nome: 'Leste', setor: 'cidade', km: 4, pontos: [[-22.9056, -47.0608], [-22.881, -46.965]] },
  oeste: { nome: 'Oeste', setor: 'cidade', km: 4, pontos: [[-22.90, -47.12], [-22.888, -47.165]] } } };
const emS = (la, lo) => N.regioesEm(pacS, { lat: la, lon: lo }).sort().join(',');
ok(emS(-22.9056, -47.0608) === 'centro,leste', 'no Centro: a área menor e a região grande ao mesmo tempo');
ok(emS(-22.90, -47.105) === 'avenida,oeste' && emS(-22.896, -47.152) === 'avenida,oeste', 'faixa: vale qualquer trecho dela');
ok(emS(-22.896, -47.157) === 'oeste', 'trecho sem raio usa o raio da região (1 km)');
ok(emS(-22.90, -47.085) === 'leste' && emS(-22.90, -47.03) === 'leste', 'entre as regiões grandes: fica na do ponto de referência mais perto');
ok(emS(-22.8219, -47.2669) === '', 'longe de todo ponto de referência (outra cidade): fora');
let duasS = 0;
for (let la = -22.95; la <= -22.85; la += 0.005) for (let lo = -47.2; lo <= -46.95; lo += 0.005) if (N.regioesEm(pacS, { lat: la, lon: lo }).filter(id => pacS.regioes[id].setor).length > 1) duasS++;
ok(duasS === 0, 'nunca cai em duas regiões grandes do mesmo jeito de repartir');
const pacSL = Object.assign({}, pacS, { midias: { o1: { tipo: 'imagem', dono: 'merc' }, w1: { tipo: 'imagem', dono: 'encan' }, g: { tipo: 'imagem', dono: 'tech' } },
  loop: [{ cota: 'reg', rodizio: true, opcoes: [{ midia: 'o1', segundos: 10, regioes: ['avenida'] }, { midia: 'w1', segundos: 10, regioes: ['oeste'] }, { midia: 'g', segundos: 10 }] }] });
const seqS = (la, lo) => Array.from({ length: 4 }, () => N.escolher(pacSL.loop[0], em('2026-11-20T12:00:00'), 'campinas', { regioes: N.regioesEm(pacSL, { lat: la, lon: lo }) }, giroT).midia).sort().join(',');
ok(seqS(-22.90, -47.105) === 'o1,o1,w1,w1', 'na avenida (que fica na Oeste): reveza o da avenida e o que atende a Oeste toda');
ok(seqS(-22.888, -47.18) === 'w1,w1,w1,w1', 'na Oeste, longe da avenida: só o da região');

console.log('\nonde os carros rodam, por região de anúncio');
{
  const cel = (la, lo) => N.geohash(la, lo, 6);
  const resumoR = { regioes: [
    { regiao: cel(-22.9056, -47.0608), segundos: 3600, exib: 20, porCarro: { C01: 3000, C02: 600 } }, // Centro (e Leste)
    { regiao: cel(-22.885, -47.20), segundos: 1800, exib: 9, porCarro: { C02: 1800 } },              // Oeste, longe da avenida
    { regiao: cel(-22.8219, -47.2669), segundos: 900, exib: 4, porCarro: { C03: 900 } },             // Sumaré: fora
  ] };
  const hr = N.horasPorRegiao(resumoR, pacS), Rg = id => hr.regioes.find(r => r.id === id);
  ok(hr.regioes.length === 4 && Rg('avenida').segundos === 0, 'todas as regiões aparecem, até as que ninguém passou');
  ok(Rg('centro').segundos === 3600 && Rg('leste').segundos === 3600 && Rg('oeste').segundos === 1800, 'a área do Centro conta no Centro e na Leste');
  ok(hr.total === 6300 && hr.fora === 900, 'total andando e o tempo fora das regiões');
  ok(Rg('centro').carros.C01 === 3000 && Rg('centro').carros.C02 === 600 && Rg('oeste').carros.C02 === 1800, 'quanto cada carro rodou em cada região');
  ok(hr.regioes[0].setor && hr.regioes[1].setor && !hr.regioes[3].setor && hr.regioes[0].id === 'leste', 'as regiões grandes primeiro, da mais rodada para a menos');
  const c2 = hr.carros.find(c => c.carro === 'C02'), c3 = hr.carros.find(c => c.carro === 'C03');
  ok(c2.segundos === 2400 && c2.regioes.leste === 600 && c2.regioes.oeste === 1800 && c3.fora === 900, 'por carro: onde cada motorista roda');
  ok(N.horasPorRegiao({ regioes: [] }, {}).regioes.length === 0 && N.horasPorRegiao(null, pacS).total === 0, 'sem dados ou sem regiões: vazio, sem quebrar');
}

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
ok(/^\d{4}$/.test(N.pinMenu('abcdef123456')) && N.pinMenu('abcdef123456') === N.pinMenu('abcdef123456'), 'PIN do menu: 4 números, sempre o mesmo para a mesma chave');
const pins = new Set(Array.from({ length: 200 }, () => N.pinMenu(N.novaChave())));
ok(pins.size > 180, `PIN muda com a chave (${pins.size} PINs diferentes em 200 chaves)`);

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
ok(r2.scansTodos === 6 && r2.scansValidos === 3 && r2.anuncios.find(a => a.anuncio === 'tech').scans === 5, 'para o anunciante conta todo scan único, inclusive de tablet sem carro');

console.log('\ncarro ligado, toques, km e bairros');
ok(N.geohash(57.64911, 10.40744, 11) === 'u4pruydqqvj', 'geohash bate com o exemplo de referência');
const centro = N.geohash(-22.9056, -47.0608);
ok(centro.length === N.PRECISAO_REGIAO && centro === '6gyt9n', 'Centro de Campinas vira a área ' + centro);
const cx = N.caixaGeohash(centro), cc = N.centroGeohash(centro);
const altKm = (cx.n - cx.s) * 111.32, largKm = (cx.l - cx.o) * 111.32 * Math.cos(cx.s * Math.PI / 180);
ok(altKm > 0.5 && altKm < 0.7 && largKm > 1 && largKm < 1.2, `a área tem uns ${largKm.toFixed(2)} × ${altKm.toFixed(2)} km (nunca a rua)`);
ok(cc.lat > cx.s && cc.lat < cx.n && cc.lon > cx.o && cc.lon < cx.l && N.geohash(cc.lat, cc.lon) === centro, 'o meio da área volta para a mesma área');
ok(Math.abs(N.distanciaM({ lat: -22.9056, lon: -47.0608 }, { lat: -22.8946, lon: -47.0517 }) - 1534) < 30, 'distância Centro → Cambuí (~1,5 km)');
const ag2 = {}, t2 = em('2026-11-20T19:10:00');
N.anotarTela(ag2, t2, 600); N.anotarCarregando(ag2, t2, 500); N.anotarBateria(ag2, t2, 100); N.anotarToque(ag2, t2); N.anotarToque(ag2, t2);
N.anotarKm(ag2, t2, 4200.4); N.anotarExibicao(ag2, t2, 'hamb', 15); N.anotarExibicao(ag2, t2, 'hamb', 15); N.anotarExibicao(ag2, t2, 't01', 14); N.anotarExibicao(ag2, t2, 't01', 14);
N.anotarRegiao(ag2, t2, centro, 300, 2); N.anotarRegiao(ag2, t2, '6gyt9p', 100, 1); N.anotarRegiao(ag2, t2, centro, 10, 0);
const h2 = ag2['2026-11-20'][19];
ok(h2.c === 500 && h2.b === 100 && h2.k === 2 && h2.d === 4200, 'na tomada, na bateria, toques e metros na hora certa');
ok(JSON.stringify(h2.g) === JSON.stringify({ [centro]: [310, 2], '6gyt9p': [100, 1] }), 'segundos andando e exibições por área: ' + JSON.stringify(h2.g));
const velho = { t: 3600, v: [0, 0, 0, 0, 0], e: { hamb: [10, 150] } }; // tablet com a versão antiga: sem c, k, d, g
const r3 = N.resumoMes({ lotes: [
  { carro: 'C01', cidade: 'campinas', dia: '2026-11-20', mes: '2026-11', horas: ag2['2026-11-20'], dono: { hamb: 'hamb' }, qr: { t01: ['tech'] } },
  { carro: 'C02', cidade: 'campinas', dia: '2026-11-20', mes: '2026-11', horas: { 8: velho }, dono: { hamb: 'hamb' }, qr: {} },
] });
const D = id => r3.carros.find(c => c.carro === id);
ok(Math.abs(D('C01').km - 4.2) < 1e-9 && D('C01').bairros === 2 && D('C01').toques === 2, 'por carro: km, bairros e toques');
ok(Math.abs(D('C01').naBateria - 100 / 600) < 1e-9 && Math.abs(D('C01').horasLigado - 500 / 3600) < 1e-9, 'por carro: parte da tela na bateria e horas na tomada');
ok(Math.abs(D('C01').horasMov - 410 / 3600) < 1e-9, 'sem vibração, o GPS dá as horas rodando (410 s andando)');
ok(!D('C01').semSensor && D('C02').semSensor, 'com GPS não é "sem sensor"; tablet antigo sem nada continua marcado');
ok(D('C02').km === 0 && D('C02').bairros === 0 && D('C02').ligado === 0 && D('C02').naBateria === 0, 'versão antiga do tablet: os dados novos ficam zerados, sem quebrar');
ok(JSON.stringify(D('C01').turno) === '["pico"]' && JSON.stringify(D('C02').turno) === '["manha"]', 'turno = faixa em que o carro mais roda');
ok(r3.regioes.length === 2 && r3.regioes[0].regiao === centro && r3.regioes[0].segundos === 310 && r3.regioes[0].carros.size === 1, 'bairros do mês, do mais rodado para o menos');
ok(r3.regioes[0].porCarro.C01 === 310 && !r3.regioes[0].porCarro.C02, 'cada área guarda os segundos de cada carro');
const hb = r3.anuncios.find(a => a.anuncio === 'hamb');
// hora com 4 exibições, 3 delas com o carro andando (2 no Centro, 1 na outra área); a hamburgueria teve 2
ok(Math.abs(hb.bairros[0].exib - 1) < 1e-9 && hb.bairros[0].regiao === centro && Math.abs(hb.bairros[1].exib - 0.5) < 1e-9, 'bairros do anunciante: a parte dele, espalhada como as exibições');
ok(Math.abs(hb.km - 4.2) < 1e-9, 'km dos carros nas horas em que o anúncio passou (a hora sem GPS não soma)');

console.log('\npágina do motorista');
(() => {
  const o = { a: 1, b: 1.5, c: 'x', d: new Date('2026-11-20T10:00:00Z'), e: [1, 'y'], f: { g: { h: [2, 3] } }, n: null, t: true };
  ok(JSON.stringify(N.lerCampos(N.campos(o))) === JSON.stringify(o), 'lê de volta o formato do Firestore (números, datas, listas, mapas)');
  const rm = N.resumoMes({ lotes: [lote('C01', 3600, 3600), lote('C02', 3600, 1800)], scans: [s('C01', 'a'), s('C01', 'b'), s('C02', 'c')], pesoHora: 1, pesoScan: 2, valorBonus: 100 });
  const m1 = N.resumoMotorista({ resumo: rm, carro: 'C01', lotes: [lote('C01', 3600, 3600), lote('C02', 3600, 1800)], scans: [s('C01', 'a'), s('C01', 'b'), s('C02', 'c')] });
  const m2 = N.resumoMotorista({ resumo: rm, carro: 'C02', lotes: [lote('C01', 3600, 3600), lote('C02', 3600, 1800)], scans: [s('C01', 'a'), s('C01', 'b'), s('C02', 'c')] });
  ok(m1.posicao === 1 && m2.posicao === 2 && m1.total === 2, 'posição no ranking, sem nomes');
  ok(Math.abs(m1.bonus + m2.bonus - 100) < 0.011 && m1.bonus > m2.bonus, 'a parte de cada um no bônus');
  ok(m1.horasMov === 1 && m1.scans === 2 && JSON.stringify(m1.porDia) === '{"2026-11-20":[1,0,2]}', 'dia a dia do motorista: horas rodando, km e scans');
  ok(!JSON.stringify(m1).includes('C02') && !('anuncios' in m1) && !('valorBonus' in m1), 'nada dos outros carros, dos anunciantes nem do total do bônus');
  ok(N.resumoMotorista({ resumo: rm, carro: 'C09' }) === null, 'carro sem dados no mês: nada');
})();

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
ok(regioesUsadas(pacote).every(r => pacote.regioes && pacote.regioes[r]), 'toda região usada no loop existe no pacote');
// QR pequeno em todo slide: o que não tem QR próprio leva ("segue") o da última empresa antes dele
const fixos = pacote.loop.filter(e => !e.cota);
const semQR = fixos.filter(e => !(pacote.midias[e.midia].qr || []).length).map(e => e.midia);
ok(!semQR.length, 'todo slide do loop tem QR' + (semQR.length ? ': falta em ' + semQR.join(', ') : ''));
const qrErrado = [];
fixos.forEach((e, i) => {
  const seg = (pacote.midias[e.midia].qr || []).filter(q => q.segue);
  if (!seg.length) return;
  let antes = null;
  for (let k = 1; k <= fixos.length && !antes; k++) {
    const qs = (pacote.midias[fixos[(i - k + fixos.length) % fixos.length].midia].qr || []).filter(q => !q.segue);
    if (qs.length) antes = qs.reduce((a, b) => ((b.ate || 0) > (a.ate || 0) ? b : a)).anuncio;
  }
  if (seg.some(q => q.anuncio !== antes)) qrErrado.push(e.midia + ' (devia ser ' + antes + ')');
});
ok(!qrErrado.length, 'o QR pequeno de cada slide é o da última empresa que passou antes dele' + (qrErrado.length ? ': ' + qrErrado.join(', ') : ''));
const pontoOk = (la, lo) => Math.abs(la) <= 90 && Math.abs(lo) <= 180 && !(la === 0 && lo === 0);
const regiaoOk = z => !!z.nome && (z.setor ? (z.pontos || []).length > 0 && z.pontos.every(q => pontoOk(q[0], q[1])) && (z.km || 4) > 0
  : z.areas ? z.areas.length > 0 && z.areas.every(a => pontoOk(a.lat, a.lon) && (a.km || z.km || 1) > 0)
  : pontoOk(z.lat, z.lon) && (z.km || 1) > 0);
ok(Object.values(pacote.regioes || {}).every(regiaoOk), 'regiões com nome e desenho válido (círculo, faixa ou setor)');
if (pacote.regioes && pacote.regioes.sudoeste) {
  const emC = (la, lo) => N.regioesEm(pacote, { lat: la, lon: lo }).sort().join(',');
  ok(emC(-22.9056, -47.0608) === 'centro,leste' && emC(-22.8236, -47.0786) === 'barao,norte' && emC(-22.963, -47.13) === 'ouroverde,sudoeste' &&
    emC(-22.888, -47.165) === 'johnboyd,noroeste' && emC(-22.919, -47.056) === 'sul', 'Campinas: Centro na Leste, Barão na Norte, Ouro Verde na Sudoeste, John Boyd na Noroeste, Ponte Preta na Sul');
  ok([[-22.8219, -47.2669], [-22.9707, -46.9958], [-22.8585, -47.2199]].every(([la, lo]) => !emC(la, lo)), 'Sumaré, Valinhos e Hortolândia ficam fora');
  let semR = 0, duasR = 0; // miolo da cidade, de 500 em 500 m
  for (let la = -22.94; la <= -22.86; la += 0.005) for (let lo = -47.15; lo <= -47.01; lo += 0.005) {
    const n = N.regioesEm(pacote, { lat: la, lon: lo }).filter(id => pacote.regioes[id].setor).length;
    if (!n) semR++; if (n > 1) duasR++;
  }
  ok(!semR && !duasR, `no miolo de Campinas todo ponto cai em uma só das 5 regiões (${semR} sem região, ${duasR} em duas)`);
}
const APP = (/const APP = '([^']+)'/.exec(fs.readFileSync(path.join(RAIZ, 'tela/tela.js'), 'utf8')) || [])[1];
ok(pacote.app === APP, `"app" do pacote (${pacote.app}) = versão do player (${APP}): é o que faz os tablets se atualizarem sozinhos`);
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

  const t1 = await N.tokenMotorista('abcdef123456'), t2 = await N.tokenMotorista('abcdef123457');
  ok(/^[0-9a-f]{32}$/.test(t1) && t1 === await N.tokenMotorista('abcdef123456') && t1 !== t2, 'link do motorista: id secreto de 32 letras, muda com a chave');
  ok(N.linkMotorista(t1) === 'https://anunc-ia.vercel.app/tela/motorista.html#' + t1, 'endereço da página do motorista');

  const vj = JSON.parse(fs.readFileSync(path.join(RAIZ, 'vercel.json'), 'utf8'));
  ok(vj.rewrites.some(r => r.source === '/q/:anuncio/:carro' && r.destination.startsWith('/api/q')), 'vercel.json leva /q/ para a função');

  console.log('\n' + (falhas ? falhas + ' FALHA(S)' : 'tudo verde'));
  process.exit(falhas ? 1 : 0);
})();
