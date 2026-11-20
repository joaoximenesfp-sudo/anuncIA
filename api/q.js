// /q/:anuncio/:carro (o vercel.json manda para cá): conta o scan do QR que
// estava na tela daquele carro e leva a pessoa para o destino do anúncio.
// O destino sai do tela/pacote.json; anúncio desconhecido vai para o catálogo.
const crypto = require('crypto');
const N = require('../tela/nucleo.js');
const pacote = require('../tela/pacote.json');

const RESERVA = N.SITE + '/catalogo.html';

// Dia e hora de Campinas, não do servidor (que roda em UTC)
function agoraSP(d) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(d).map(x => [x.type, x.value]));
  return { dia: `${p.year}-${p.month}-${p.day}`, mes: `${p.year}-${p.month}`, hora: +p.hour };
}

module.exports = async (req, res) => {
  const q = req.query || {};
  const anuncio = String(q.anuncio || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40);
  const carro = String(q.carro || '').toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 16) || 'X';
  const a = pacote.anuncios[anuncio];
  const destino = a && /^https:\/\//.test(a.destino) ? a.destino : RESERVA;
  if (a) {
    const em = new Date();
    const { dia, mes, hora } = agoraSP(em);
    const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    const ua = String(req.headers['user-agent'] || '');
    // Não guarda IP nem aparelho: só um resumo que muda todo dia, para o mesmo
    // celular escaneando de novo não contar duas vezes.
    const h = crypto.createHash('sha256').update(`${ip}|${ua}|${dia}|tela`).digest('hex').slice(0, 16);
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2500);
    try {
      const r = await fetch(N.urlCriar('tela_scans', N.novoId()), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctrl.signal,
        body: JSON.stringify({ fields: N.campos({ anuncio, carro, em, dia, mes, hora, h }) }),
      });
      // aparece nos logs da Vercel: dá para conferir os scans da última hora sem abrir o painel
      console.log(`scan anuncio=${anuncio} carro=${carro} ${dia} ${hora}h firestore=${r.status}`);
    } catch (e) {
      // o registro não pode segurar a pessoa: segue para o destino
      console.log(`scan anuncio=${anuncio} carro=${carro} ${dia} ${hora}h firestore=falhou`);
    } finally {
      clearTimeout(t);
    }
  }
  res.statusCode = 302;
  res.setHeader('Location', destino);
  res.setHeader('Cache-Control', 'no-store');
  res.end();
};
