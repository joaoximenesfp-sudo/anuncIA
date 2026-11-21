# anuncIA
Site gerador de anúncios com IA

## Instagram da loja (publicar direto do sistema)

No topo do **Gerar anúncio**, o cartão **Anúncios do catálogo** mostra cada notebook
anunciado com preço já com o **post** (1080×1080) e o **story** (1080×1920) desenhados,
das fotos e da descrição do cadastro, no tema da data: dá para baixar, publicar um
(post + story) ou **Publicar as novas** de uma vez. O post sai em **carrossel**: a arte
primeiro e, depois, as fotos da máquina (até 9), cada uma inteira num quadro quadrado
com o nome e o preço (o Instagram corta o carrossel no formato da 1ª imagem).

O cartão separa **Para publicar** (só o que nunca foi; é o que o "Publicar as novas"
manda), **Já publicados** (não entram de novo) e **Vendidos que ainda estão no
Instagram** (com o link do post para arquivar e um "✓ Já tirei"). Em cada máquina, a
**análise de preço**: dias no estoque desde a entrada e, quando ela está parada além do
normal, acima do que as parecidas venderam no último ano ou é a mais antiga entre iguais
em estoque, uma sugestão de preço (nunca abaixo do custo + 10%) com o motivo e a margem
que sobra. "Usar no anúncio" põe o "de/por" na arte; o preço do cadastro não muda.
A **barra de procura** (gruda embaixo do menu ao rolar) filtra as três listas pelo
número, nome, ficha ou descrição: todas as palavras, em qualquer ordem, sem acento;
`#12` acha só a máquina 12. Abre o "Já publicados" quando acha algo lá e avisa quando
a máquina procurada existe mas está fora do catálogo (em estoque, reservada, chegando
ou sem preço). O "Buscar no que está anunciado" do editor segue a mesma regra. Para mudar foto, texto ou promoção
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

## Mercado Livre da loja (publicar e acompanhar)

Com o Mercado Livre ligado, o **📤 Publicar** de cada máquina (e o "Publicar as novas")
manda para os dois canais em que ela ainda não está: Instagram (post + story) e Mercado
Livre (o anúncio). Usa a API oficial (`api/ml.js`):

- **Anúncio**: título "Notebook + nome", preço do cadastro, as fotos da máquina, condição
  usado, garantia do vendedor, Mercado Envios (com retirada em Campinas, se ligada) e a
  descrição com a ficha, os slots, a bateria e o texto do cadastro, **sem contato de
  fora** (telefone, WhatsApp, @ e links saem: o Mercado Livre não aceita). Custo, lucro
  e fornecedor nunca entram. Tipo (Clássico ou Premium), garantia, retirada e as medidas
  da caixa ficam em "Como os anúncios saem", no quadro do Mercado Livre.
- **Categoria e atributos**: a categoria é a que o próprio Mercado Livre sugere pelo
  título; os atributos dela (marca, linha, modelo, processador, memória, SSD, tela,
  caixa...) saem da ficha. O anúncio passa pela validação do Mercado Livre antes de ser
  criado: se a categoria pedir algo que a ficha não sabe (o sistema operacional, por
  exemplo), o cartão da máquina pergunta, e a resposta fica guardada na máquina.
- **Acompanhar**: preço mudou aqui, muda lá; vendeu aqui, o anúncio encerra; reservada,
  chegando ou fora do catálogo, pausa (e volta quando ela volta). A cada 10 minutos com o
  sistema aberto (e ao abrir), confere a situação dos anúncios e os pedidos dos últimos
  30 dias: o que vendeu lá e ainda não foi registrado aparece na tela de Vendas e no
  quadro do Mercado Livre, com **Registrar a venda** (abre a venda de sempre, já com
  Mercado Livre e o valor). Também conta as perguntas sem resposta.
- No Mercado Livre nunca sai anúncio repetido: a máquina que já tem anúncio só ganha
  outro pelo botão dela, e só se o anterior tiver sido encerrado.

Configuração (uma vez só):

1. No [DevCenter](https://developers.mercadolivre.com.br/devcenter), com a conta **da
   loja**: **Criar uma aplicação** (no Brasil, uma por conta, com os dados validados).
2. **URI de redirect**: `https://anunc-ia.vercel.app/api/ml`. Permissões: leitura,
   escrita e acesso offline (`offline_access`, senão a conexão cai em 6 horas). Se pedir
   notificações: a mesma URL (o sistema responde e busca as novidades sozinho).
3. Na Vercel: `ML_APP_ID` (o App ID) e `ML_SECRET` (a Secret Key), e **Redeploy**. A
   Secret Key vai só lá: nunca no código, no chat ou em print.
4. No Gerar anúncio, **Conectar Mercado Livre** e autorizar com a conta da loja.

Os tokens ficam cifrados em `config/mercadolivre` (só o servidor, com o `ML_SECRET`,
abre). O access token vale 6 horas e o refresh token é de uso único: o servidor renova e
grava o par novo a cada vez (e as chamadas do sistema saem uma de cada vez, para duas
renovações não se atropelarem).

## Letra do sistema e do site

No iPhone e no Mac, a letra é a da Apple; nos outros aparelhos (Windows, Android), a
**Inter**, que fica em `fontes/` (licença OFL, junto). O peso máximo é 600 (seminegrito):
acima disso a letra fica pesada (no Windows, o 800 virava Segoe UI Black). O arquivo da fonte é
guardado pelo navegador por um ano (`vercel.json`): para trocar, use outro nome de arquivo.
