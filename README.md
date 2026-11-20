# anuncIA
Site gerador de anúncios com IA

## Instagram da loja (publicar direto do sistema)

No topo do **Gerar anúncio**, o cartão **Anúncios do catálogo** mostra cada notebook
anunciado com preço já com o **post** (1080×1080) e o **story** (1080×1920) desenhados,
das fotos e da descrição do cadastro, no tema da data: dá para baixar, publicar um
(post + story) ou **Publicar as novas** de uma vez. O post sai em **carrossel**: a arte
primeiro e, depois, as fotos da máquina (até 9), cada uma inteira num quadro quadrado
com o nome e o preço (o Instagram corta o carrossel no formato da 1ª imagem). Para mudar foto, texto ou promoção
de uma máquina, o ✏️ (ou o 📸 da lista) abre o editor de baixo, que também publica
post, carrossel em 2 partes ou story.
Usa a API oficial da Meta (`api/insta.js`). A legenda só leva o que é público (nome,
ficha, descrição, preço, WhatsApp da loja): custo, lucro e fornecedor nunca entram.

Configuração (uma vez só). Apps novos da Meta só têm o "login unificado", que usa um
**token de usuário do sistema** (não vence):

1. A conta do Instagram precisa ser **profissional** e estar no portfólio da empresa
   (business.facebook.com → Configurações → Contas do Instagram).
2. No app (developers.facebook.com → o app → Casos de uso → Personalizar, API do
   Instagram → Permissões e recursos): adicionar `instagram_basic` e
   `instagram_content_publish`.
3. Configurações da empresa → **Usuários do sistema** → Adicionar ("Publicador",
   Administrador) → **Atribuir ativos**: o app e a conta do Instagram, controle total.
4. **Gerar token**: o app, validade **Nunca**, com `instagram_basic` e
   `instagram_content_publish` (e as de `pages_` e `business_management`, se aparecerem).
5. Na Vercel (projeto anunc-ia) → Settings → Environment Variables: `IG_TOKEN` com o
   token. Depois, **Redeploy**. O token vai só lá: nunca no código, no chat ou em print.
   A conta é a @tech.campinas (17841430007598170); para outra, `IG_USER_ID`.

Com o token, o sistema mostra "Conectado" sozinho (sem botão de login) e publica por
graph.facebook.com. O `GET /api/insta` diz se o token funciona e de qual conta é.

Apps antigos que ainda têm o "login do Instagram" podem usar `IG_APP_ID` e
`IG_APP_SECRET` (o ID e a chave secreta do app do Instagram, com
`https://anunc-ia.vercel.app/api/insta` como URI de redirecionamento) e o botão
**Conectar Instagram**: essa conexão vale 60 dias e renova sozinha quando alguém abre o Gerar anúncio (basta
usar pelo menos uma vez a cada 50 dias). O token fica cifrado em `config/instagram`:
só o servidor, com o `IG_APP_SECRET`, consegue abrir. A arte vai para
`catalogo_fotos/insta_<id>` só até a Meta baixar e é apagada logo depois (sem
`produto_id`, o catálogo público nem vê). Limite da Meta: 100 publicações por dia.
