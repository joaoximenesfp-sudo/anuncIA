# Tela nos carros

Tablet atrás do banco do motorista de aplicativo, rodando um loop de 10 min com
anúncios e conteúdo. São três peças:

| Peça | Endereço | O que faz |
|---|---|---|
| Player | `/tela/` | Baixa `pacote.json` e `midia/` quando tem internet, roda sem internet, troca o QR da arte pelo QR do carro e anota o que passou |
| Contador de QR | `/q/<anuncio>/<carro>` → `api/q.js` | Registra o scan (sem IP) e manda a pessoa para o destino do anúncio |
| Painel (gestor) | `/tela/painel.html` | Carros, pareamento, sumidos, eficiência, bônus do mês, jornada, mapa de bairros e relatório por anunciante. Só os sócios. `?demo` mostra com números inventados |
| Página do motorista | `/tela/motorista.html#<id>` | Só os números daquele motorista: horas rodando, km, scans, posição no ranking (sem nomes), a parte dele no bônus e avisos (cabo, sem sinal). `?demo` mostra um exemplo |

O tablet não faz login. Ele grava no Firestore pela API REST, levando a chave do
carro; o `firestore.rules` só aceita se a chave bater com `tela_carros/<carro>` e
o carro estiver ativo. Só os sócios leem.

## Ligar um tablet
1. Painel → **Novo carro** → mande o link para o motorista (botão do WhatsApp).
2. No tablet, abra o link no Chrome, no Wi-Fi. Abre a tela **Configurar a tela do carro**:
   atalho na tela inicial (opcional, só tira a barra do Chrome), travar com o PIN do
   tablet (Fixação de aplicativos), os botões da lateral (Controle de interação) e, se o
   motorista quiser, **Permitir localização** (bairros e km; veja abaixo).
   **Expandir tela** liga a tela cheia; **Pronto, começar** fecha e começa o loop.
3. O pacote baixa sozinho (barra verde) e depois roda sem internet.
4. Menu escondido do tablet: 5 toques rápidos no canto de cima, à esquerda, e o **PIN do
   menu** (4 números; o painel mostra em "Link do tablet" e ele muda quando troca a chave).
   5 PINs errados bloqueiam por 5 min, depois 10, 20… até 1 h; o menu fecha sozinho depois de
   2 min parado. Tablet ainda sem carro abre sem PIN (para dar para parear). Dali dá para
   reabrir a configuração.

Página da web não consegue fixar o app nem desligar o botão Liga/Desliga sozinha:
isso é do Android (Fixação de aplicativos e Controle de interação, da Samsung). O
player só impede que Voltar saia da tela e volta para a tela cheia no próximo toque.

Tablet perdido: no painel, **Trocar chave** (ou Desativar). O tablet antigo para de gravar na hora.

## App Android "Tela do carro" (pasta android/)
A página sozinha não consegue travar o tablet: o Android não deixa site fixar app,
bloquear Home ou reabrir sozinho. O app nativo abre o mesmo player e garante:
- **Voltar** não faz nada; **Home** e **Recentes** não saem (app fixado; só o PIN do tablet solta);
- se alguém tirar o app da frente sem o PIN, ele volta em até 3 s (precisa de "Exibir sobre outros apps");
- apertar o **Liga/Desliga** com o carregador ligado acende a tela de novo, com o app por cima do bloqueio;
- ao ligar o tablet, o app abre sozinho;
- **modo frota** (app dono do tablet, provisionado de fábrica): trava sem perguntar nada, sem barra
  de notificação nem menu do Liga/Desliga, e vira a tela inicial.

Sair do modo carro: segurar Voltar + Recentes e digitar o PIN, ou 5 toques no canto → "Sair do modo
carro" (pede o PIN do tablet). O link do painel (`/tela/#parear=…`) abre direto no app
(`/.well-known/assetlinks.json` liga o site ao app).

O GitHub Actions (`.github/workflows/app-tela.yml`) monta o APK, testa a trava num tablet virtual
Android 13 (`android/testar-no-emulador.sh`) e, se passar, publica em `tela/app/tela-do-carro.apk`.
A chave de assinatura (`android/tela.jks`) fica no repositório porque o app é instalado à mão só nos
tablets da rede; atualização precisa ser assinada com ela.

## Página do motorista
O motorista não entra no painel. Cada um recebe um link só dele (painel → Carros → Link do
tablet → **Página do motorista** → Mandar no WhatsApp), que abre sem login e mostra só os
números do carro dele. Não aparece nada dos outros motoristas, dos anunciantes nem o total do
bônus: só a posição (ex.: 2º de 5) e a parte dele.
- O painel publica sozinho: toda vez que um sócio abre a aba Eficiência e bônus (e quando muda
  bônus ou pesos), grava o resumo de cada carro ativo em `tela_motorista/<id>`. O id sai da
  chave do carro (sha-256), então ninguém adivinha o link de outro.
- **Trocar chave** troca também o link do motorista (o antigo para de abrir). **Desativar** tira
  a página do ar.
- Precisa das regras novas do `firestore.rules` publicadas (bloco `tela_motorista`).

## Publicar as regras
Uma vez, e sempre que o `firestore.rules` mudar: Firebase console → Firestore →
Regras → colar o arquivo → Publicar. Sem isso os tablets tocam, mas não enviam nada.

## Mudar o pacote
Edite `pacote.json`, ponha os arquivos em `midia/` e troque a `versao`. Os tablets
pegam sozinhos na próxima vez que tiverem internet (conferem a cada 15 min) e só
baixam o que mudou. Depois rode `node testes/test-tela.js`: ele confere arquivos,
hashes, QRs e a duração do loop.

**Player novo** (mudou `tela.js`, `nucleo.js` ou `index.html`): troque o `APP` do `tela.js` e o
`app` do `pacote.json` para a mesma data. Os tablets veem a versão nova no próximo download e
recarregam sozinhos entre um anúncio e outro: no app (ou no atalho) na hora; no Chrome, quando o
carro desliga (recarregar sai da tela cheia; o próximo toque volta com ela). Uma vez por versão.
O `node testes/test-tela.js` confere que os dois batem.

**Mídia**: `arquivo`, `tipo` (`imagem` ou `video`), `duracao` (vídeo), `bytes`,
`hash` (12 primeiros caracteres do sha256 do arquivo), `dono` (anunciante que
paga a exibição) e `qr`: lista de `{anuncio, x, y, lado}` em pixels da arte
1920×1080 (em vídeo, também `de`/`ate` em segundos). A arte do anunciante precisa
ter um quadrado branco onde o QR vai.

**QR em todo slide**: o slide sem QR próprio (curiosidade, quiz, "Boa viagem") leva um QR
pequeno no canto (`x` 1603, `y` 843, `lado` 163) com `"segue": true`: o da última empresa que
passou antes dele no loop, até aparecer outra. Mexeu na ordem do loop? O `node testes/test-tela.js`
diz qual slide precisa trocar de QR.

**Anunciante**: entrada em `anuncios` com `nome` e `destino` (WhatsApp, cardápio…).

**Cota por horário e cidade**: no `loop`, no lugar de uma mídia fixa:

```json
{ "cota": "pico-1", "opcoes": [
  { "midia": "hamburgueria", "das": "18:00", "ate": "23:00", "cidades": ["campinas"],
    "periodo": { "inicio": "2026-12-01", "fim": "2026-12-31" } },
  { "midia": "t02", "segundos": 14 }
] }
```

Toca a primeira opção que bater com horário, dia (`dias`: 0 = domingo), cidade e região.

**Anúncio por região** (pelo GPS do tablet, funciona sem internet): as regiões ficam em
`regioes` no pacote, de três jeitos:

- **círculo**: `"centro": { "nome": "Centro de Campinas", "lat": …, "lon": …, "km": 1.5 }`;
- **faixa** (vários círculos, para uma avenida): `"johnboyd": { "nome": "John Boyd Dunlop",
  "areas": [{ "lat": …, "lon": …, "km": 1.2 }, …] }`;
- **setor** (regiões que repartem a cidade sem buraco): `"leste": { "nome": "Região Leste",
  "setor": "campinas", "km": 4, "pontos": [[lat, lon], …] }`. O carro fica na região do
  ponto de referência mais perto, desde que a menos de `km` dele (assim a cidade vizinha
  fica de fora). Para mexer numa divisa, acrescente ou mova pontos.

Campinas está dividida nas 5 regiões da prefeitura (Norte, Sul, Leste, Sudoeste e
Noroeste) e, por cima, nas áreas menores Centro, Barão Geraldo, Ouro Verde e John Boyd
Dunlop. Um carro pode estar em duas ao mesmo tempo (no Ouro Verde também está na
Sudoeste). As divisas são aproximadas: a aba **Bairros** do painel pinta as regiões com
o mesmo cálculo do tablet, para conferir.

Uma opção com `"regioes": ["centro"]` só vale com o carro dentro da região. Cota com
`"rodizio": true` reveza entre as opções que valem; se o carro estiver em alguma região,
reveza só entre as dela (empresa que atende várias regiões lista todas; no Ouro Verde
revezam as do Ouro Verde e as da Sudoeste), e fora delas (ou sem GPS) passa o anúncio
geral:

```json
{ "cota": "regional-1", "rodizio": true, "opcoes": [
  { "midia": "loja-centro", "segundos": 15, "regioes": ["centro"] },
  { "midia": "pizzaria-barao", "segundos": 15, "regioes": ["barao"] },
  { "midia": "encanador", "segundos": 15, "regioes": ["sudoeste", "noroeste"] },
  { "midia": "t05", "segundos": 14 }
] }
```

A aba **Programação** do painel mostra a grade do dia (o que passa em cada horário, quantas vezes por
hora e quanto da tela) e a página do motorista mostra "Na sua tela hoje". Não existe vídeo de
24 horas: cada tablet monta a grade pelo próprio relógio, então quem liga às 19h já pega a das 19h.
Faixa que vira a noite (`"21:00"` a `"02:00"`) conta como a noite do dia em que
começou. Se nenhuma opção bater, a cota é pulada.

## O que o painel mede
- **Horas de tela**: player tocando com a tela visível.
- **Horas rodando**: tela ligada com o carro em movimento, hora a hora o que der mais
  entre o GPS (se o motorista permitiu) e a vibração do tablet (janelas de 10 s). As
  faixas de vibração ficam guardadas, então o limiar pode ser recalibrado depois sem
  mexer nos tablets.
- **Scans**: uma pessoa por anúncio, carro e dia; no máximo 6 por carro por hora.
- **Bônus**: pontos = horas rodando × peso + scans × peso; o valor do mês é
  dividido pelos pontos.
- **Jornada** (aba Eficiência): turno (faixa de horário em que o carro mais roda),
  horas **na tomada** (tablet carregando = carro ligado), **tela na bateria** (acima de
  15% fica amarelo: cabo solto ou carregador fraco), horas andando pelo GPS, km,
  bairros e **toques** na tela (o canto do menu não conta; dedo batendo seguido conta 1).
- **Bairros** (aba própria): mapa com áreas de ~1,1 × 0,6 km (geohash de 6 letras) e
  a lista dos bairros com mais tela. Escolhendo um anunciante, mostra a estimativa das
  exibições dele por bairro (a parte dele de cada hora, espalhada pelos bairros daquela
  hora). O nome do bairro vem do OpenStreetMap (1 pedido por segundo, só o meio da
  área) e fica guardado no navegador.
- **Onde os motoristas rodam** (aba Bairros): horas andando em cada região de anúncio,
  quem mais roda em cada uma (com aviso quando só um carro passa lá) e quantas vezes um
  espaço regional passaria lá no mês; por motorista, as regiões onde mais roda. É o que
  diz se já dá para vender espaço regional numa região, ou se falta motorista lá.
- **Relatório do anunciante**: também leva os km que os carros rodaram nas horas em
  que o anúncio passava e os bairros onde mais passou.

## Localização (bairros e km)
Só liga quando o motorista toca em **Permitir localização** no Configurar a tela
(e no app, também no aviso do Android). Combine isso com ele no contrato (LGPD):
o que se guarda é o bairro aproximado e os km, para o relatório do anunciante.
- O tablet nunca manda coordenada: só a área de 1 km (geohash de 6 letras) e os
  metros rodados, somados por hora.
- Só marca com o carro andando (GPS acima de ~9 km/h nos últimos 3 min): parado em
  casa ou no estacionamento não aparece.
- Fora da tomada o GPS só fica ligado com mais de 50% de bateria; abaixo disso desliga
  para não descarregar o tablet, e volta quando carrega.
- Tablet sem GPS (só Wi-Fi) fica sem bairros e km; o resto continua igual.
- App Android: precisa da versão 1.1 (a 1.0 não tem GPS e esconde o passo).

## Limites
Plano grátis do Firestore: 20 mil gravações e 50 mil leituras por dia. Com envio
de hora em hora e sinal de vida a cada 10 min, cabe uns 150 tablets ligados o dia
todo. Acima disso: plano Blaze (centavos por tablet) e um resumo diário no
servidor para o painel não ler lote por lote.
