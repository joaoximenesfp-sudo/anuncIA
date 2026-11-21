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
- **Qualidade do anúncio**: vão todas as características que a ficha, a descrição e as
  abas sabem (na categoria Notebooks a RAM é a "capacidade total do módulo"): processador,
  RAM e slots, SSD (NVMe vai como M.2/PCIe), tela e resolução, Windows (versão e edição),
  vídeo integrado (pela geração do processador; com o código, o modelo exato) e dedicado
  (pela descrição), Wi-Fi, Bluetooth, webcam, microfone e saída de fone (notebook tem, a
  não ser que a descrição diga que não), leitor digital e teclado retroiluminado (só se a
  descrição disser), teclado ABNT, tipo de produto e o SKU (número da máquina). O que não
  se sabe fica de fora; o modelo alfanumérico também (é o código regulatório, não o número).
  A condição é sempre **usado**: se o Mercado Livre puser como novo, o sistema corrige. O
  anúncio que saiu com menos características é completado sozinho quando o sistema confere
  os anúncios (o que ele já tem não muda).
- **Automático depois de publicar**: mudou a máquina (descrição, abas, Anatel, vídeo,
  respostas) ou outra do mesmo modelo trouxe um dado novo, o anúncio recebe o que falta e
  o que mudou sozinho, segundos depois (marca, linha e modelo, que dizem qual é o produto,
  só entram se faltarem). A **nota de qualidade** de cada anúncio e o que o Mercado Livre
  ainda pede aparecem no cartão da máquina (o sistema busca uma vez por hora). A **homologação da Anatel** (na etiqueta embaixo do notebook) tem campo
  nas abas da máquina: basta numa máquina do modelo, as iguais usam a mesma. **Premium**
  (parcelado sem juros) e **frete grátis** ficam em "Como os anúncios saem": valem para os
  próximos, e ao salvar o sistema oferece pôr também nos que já estão lá.
- **Quando o Mercado Livre recusa**, o motivo fica no cartão da máquina até ela ir (para
  tentar de novo: Publicar → Mercado Livre; as respostas ficam guardadas). Resposta que
  ele não aceitou volta como pergunta, com o motivo. Se a validação recusar sem dizer
  por quê, o sistema tenta criar o anúncio direto: ou ele sai, ou o Mercado Livre diz o
  motivo. A resposta inteira do Mercado Livre vai para o log da função na Vercel.
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

## Recursos da máquina (catálogo, Instagram e Mercado Livre)

No cadastro e no Editar (quadro "Revisão da máquina e o que vai no anúncio"), a parte
**📢 Vai no anúncio** tem:

- **Recursos**: Wi-Fi, Bluetooth, webcam, microfone, saída de fone, HDMI, USB-C, teclado
  retroiluminado, ABNT2 e numérico, leitor digital, tela touch e leitor de cartão SD.
  Notebook novo no cadastro já vem com o básico marcado (Wi-Fi, Bluetooth, webcam,
  microfone e fone). Desmarcar o básico é "não tem"; extra não marcado é "não se sabe"
  (não vai "não" para o Mercado Livre: contradizer o que ele sabe do modelo derruba a
  qualidade). Máquina antiga, sem marcação, mostra no Editar o que o sistema deduz da
  descrição (e o básico de notebook), e é isso que vai até alguém corrigir.
- **Vídeo**: o link do YouTube (pode ser "não listado"; vale link curto, normal ou de
  shorts). No catálogo vira um player na página da máquina (e o cartão avisa "▶ vídeo");
  no Mercado Livre vai como o vídeo do anúncio. O Instagram precisa do arquivo do vídeo:
  por link do YouTube não dá.
- **Sistema** (Windows 11 Pro, Linux, sem sistema...) e **resolução da tela** (HD, Full HD...).
- **Código do processador** (8350U): a lista sugere os da linha e geração escolhidas; é o
  que o Mercado Livre sempre pede.
- **Homologação Anatel**: uma vez por modelo. No quadro do Mercado Livre, "Homologação
  Anatel por modelo" lista cada modelo uma vez: digitou, todas as máquinas daquele modelo
  recebem, e as que já estão no Mercado Livre são atualizadas em seguida.

Onde aparece: no **catálogo** ("O que ela tem" e Sistema/Resolução na ficha, e a busca acha
por recurso), na **legenda do Instagram** (🪟 sistema e tela; ✨ recursos) e no **Mercado
Livre** (as características e a descrição). A homologação vai só para o Mercado Livre.

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
