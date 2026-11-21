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
- **Preenche sozinho o que der**: o que faltar na ficha do cadastro sai da descrição
  (modelo, processador, tela e o sistema operacional: "com Windows 11"); a tela sai também
  do número do modelo (Latitude 3420 e ThinkPad T480 são 14", EliteBook 850 é 15,6") ou
  das outras máquinas do mesmo modelo; o código do processador (i3-10110U) vale escrito no
  nome ou na descrição. Resposta dada a uma máquina vale para as iguais (mesmo nome).
- **O que ainda perguntar vem preenchido: é só confirmar**. Cada campo vem com a resposta
  e de onde ela saiu, para conferir: a ficha ou a descrição ("do cadastro"); a unidade
  igual; as outras do mesmo modelo que a loja já teve, anunciadas, vendidas ou em estoque
  (o processador da Latitude 7490 vendida vale para a próxima Latitude 7490); o que quase
  todo notebook tem (Wi-Fi, Bluetooth e webcam sim; touch e gamer não, a não ser que o
  nome ou a descrição digam; o vídeo integrado da geração); e a resposta que a loja mais
  deu (a cor, por exemplo). Estado da tela, bateria e slots saem das abas da máquina (e
  vão para a descrição como "Bateria: Boa", "Estado da tela: Perfeita"). Com tudo
  preenchido, o botão é **✓ Confirmar e publicar**. Para trocar, cada campo é uma lista
  com **Outro (digitar)**; a do processador traz os da mesma linha e geração (os que a
  loja já teve e os mais comuns) e diz onde ver o código no Windows. Modelo, processador
  e tela nunca vêm de máquina de outro modelo, e digitar o modelo preenche a tela.
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

## Imagem de confirmação no login ("não sou um robô")

Entrar, Cadastrar e Esqueci minha senha (no sistema e no painel dos tablets) só seguem
depois de digitar os 5 caracteres de uma imagem gerada na hora pelo servidor
(`api/captcha.js`). As letras são desenhadas tortas, com linhas e pontos por cima (não há
texto dentro da imagem), e a resposta nunca vai para a página: o servidor confere o que
foi digitado. Cada imagem vale uma tentativa e 10 minutos; o ↻ gera outra.
A chave da assinatura sai de `CAPTCHA_SECRET` na Vercel (ou, sem ela, do `ML_SECRET`).

O limite: a imagem protege as telas do site. Quem souber chamar o login do Firebase
direto pula o site; contra isso valem as travas do próprio Firebase (bloqueio depois de
muitas tentativas, que já vem ligado) e, no console do Firebase → Authentication →
Settings: desligar o cadastro público (User actions → "Enable create (sign-up)"), já que
só os sócios usam, e manter a proteção contra enumeração de e-mail ligada.
