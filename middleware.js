// Loja no endereço principal: no techcampinas.com.br, o "/" mostra o catálogo sem trocar o
// endereço (o cliente e o Google ficam em techcampinas.com.br). No anunc-ia.vercel.app e nas
// prévias da Vercel, o "/" continua sendo o sistema (index.html).
// Roda na Vercel antes dos arquivos e só no "/" (o matcher), então não pesa no resto do site.
// O www.techcampinas.com.br já é mandado para o endereço sem www pela própria Vercel.
export const config = { matcher: ['/', '/teste-loja-temporario'] };

const LOJA = 'techcampinas.com.br';
const seguir = () => new Response(null, { headers: { 'x-middleware-next': '1' } });
const mostrar = url => new Response(null, { headers: { 'x-middleware-rewrite': String(url) } });

export default function middleware(request) {
  const url = new URL(request.url);
  const host = String(request.headers.get('host') || url.host).toLowerCase().split(':')[0];
  // TEMPORÁRIO: para conferir na prévia que a Vercel respeita o desvio (sai antes de ir ao ar)
  if (url.pathname === '/teste-loja-temporario') return mostrar(new URL('/catalogo.html' + url.search, url));
  if (host !== LOJA || url.pathname !== '/') return seguir();
  return mostrar(new URL('/catalogo.html' + url.search, url));
}
