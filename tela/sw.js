// Service worker do player: guarda a "casca" do app para ele abrir sem internet.
// Pacote e vídeos não passam por aqui — o tela.js guarda eles no Cache Storage.
const CASCA = 'tela-casca-2026-11-18';
const ARQUIVOS = ['./', 'index.html', 'tela.js', 'nucleo.js', 'qrcode.js', 'app.webmanifest', 'icone-192.png', 'icone-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CASCA).then(c => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k.startsWith('tela-casca') && k !== CASCA).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
// Casca: tenta a rede (pega atualização), cai no que está guardado se não houver internet.
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  const base = new URL('./', self.registration.scope).pathname;
  const nome = u.pathname.startsWith(base) ? u.pathname.slice(base.length) : null;
  if (nome === null || !(nome === '' || ARQUIVOS.includes(nome))) return;
  e.respondWith((async () => {
    const cache = await caches.open(CASCA);
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 4000);
      const r = await fetch(e.request, { signal: ctrl.signal, cache: 'no-store' });
      clearTimeout(t);
      if (r.ok) cache.put(e.request, r.clone());
      return r;
    } catch (err) {
      return (await cache.match(e.request, { ignoreSearch: true })) || (await cache.match(nome === '' ? './' : nome)) || Response.error();
    }
  })());
});
