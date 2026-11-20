# anuncIA
Site gerador de anúncios com IA

## Instagram da loja (publicar direto do sistema)

No topo do **Gerar anúncio**, o cartão **Anúncios do catálogo** mostra cada notebook
anunciado com preço já com o **post** (1080×1080) e o **story** (1080×1920) desenhados,
das fotos e da descrição do cadastro, no tema da data: dá para baixar, publicar um
(post + story) ou **Publicar as novas** de uma vez. Para mudar foto, texto ou promoção
de uma máquina, o ✏️ (ou o 📸 da lista) abre o editor de baixo, que também publica
post, carrossel em 2 partes ou story.
Usa a API oficial da Meta (`api/insta.js`). A legenda só leva o que é público (nome,
ficha, descrição, preço, WhatsApp da loja): custo, lucro e fornecedor nunca entram.

Configuração (uma vez só):

1. A conta do Instagram precisa ser **profissional** (Comercial ou Criador de
   conteúdo): no app, Configurações → Tipo de conta e ferramentas.
2. Em developers.facebook.com → Meus apps → **Criar app**, com o caso de uso
   "Gerenciar mensagens e conteúdo no Instagram".
3. No app, em **Instagram → Configuração da API com login do Instagram**:
   - "Gerar tokens de acesso" → **Adicionar conta** → entrar com a conta da loja;
   - "Configurar o login comercial do Instagram" → **URI de redirecionamento do
     OAuth**: `https://anunc-ia.vercel.app/api/insta` (exatamente assim);
   - anotar o **ID do app do Instagram** e a **chave secreta do app do Instagram**.
   - Se o Instagram disser que a conta não tem permissão: Funções do app → Funções →
     **Testadores do Instagram** → adicionar a conta, e aceitar o convite no app do
     Instagram (Configurações → Apps e sites → Convites de testador).
   Não precisa publicar o app nem pedir revisão: para a conta adicionada ele já funciona.
4. Na Vercel (projeto anunc-ia) → Settings → Environment Variables: `IG_APP_ID` (o ID
   do app do Instagram) e `IG_APP_SECRET` (a chave secreta). Depois, **Redeploy**.
   A chave secreta vai só lá: nunca no código, no chat ou em print.
5. No sistema: Gerar anúncio → **Conectar Instagram** → entrar com a conta da loja e
   permitir.

A conexão vale 60 dias e renova sozinha quando alguém abre o Gerar anúncio (basta
usar pelo menos uma vez a cada 50 dias). O token fica cifrado em `config/instagram`:
só o servidor, com o `IG_APP_SECRET`, consegue abrir. A arte vai para
`catalogo_fotos/insta_<id>` só até a Meta baixar e é apagada logo depois (sem
`produto_id`, o catálogo público nem vê). Limite da Meta: 100 publicações por dia.
