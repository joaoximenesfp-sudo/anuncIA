# Tela nos carros

Tablet atrás do banco do motorista de aplicativo, rodando um loop de 10 min com
anúncios e conteúdo. São três peças:

| Peça | Endereço | O que faz |
|---|---|---|
| Player | `/tela/` | Baixa `pacote.json` e `midia/` quando tem internet, roda sem internet, troca o QR da arte pelo QR do carro e anota o que passou |
| Contador de QR | `/q/<anuncio>/<carro>` → `api/q.js` | Registra o scan (sem IP) e manda a pessoa para o destino do anúncio |
| Painel | `/tela/painel.html` | Carros, pareamento, sumidos, eficiência, bônus do mês e relatório por anunciante. `?demo` mostra com números inventados |

O tablet não faz login. Ele grava no Firestore pela API REST, levando a chave do
carro; o `firestore.rules` só aceita se a chave bater com `tela_carros/<carro>` e
o carro estiver ativo. Só os sócios leem.

## Ligar um tablet
1. Painel → **Novo carro** → mande o link para o motorista (botão do WhatsApp).
2. No tablet, abra o link no Chrome, no Wi-Fi. Abre a tela **Configurar a tela do carro**:
   atalho na tela inicial (opcional, só tira a barra do Chrome), travar com o PIN do
   tablet (Fixação de aplicativos) e os botões da lateral (Controle de interação).
   **Expandir tela** liga a tela cheia; **Pronto, começar** fecha e começa o loop.
3. O pacote baixa sozinho (barra verde) e depois roda sem internet.
4. Menu escondido do tablet: 5 toques rápidos no canto de cima, à esquerda. Dali dá
   para reabrir a configuração.

Página da web não consegue fixar o app nem desligar o botão Liga/Desliga sozinha:
isso é do Android (Fixação de aplicativos e Controle de interação, da Samsung). O
player só impede que Voltar saia da tela e volta para a tela cheia no próximo toque.

Tablet perdido: no painel, **Trocar chave** (ou Desativar). O tablet antigo para de gravar na hora.

## Publicar as regras
Uma vez, e sempre que o `firestore.rules` mudar: Firebase console → Firestore →
Regras → colar o arquivo → Publicar. Sem isso os tablets tocam, mas não enviam nada.

## Mudar o pacote
Edite `pacote.json`, ponha os arquivos em `midia/` e troque a `versao`. Os tablets
pegam sozinhos na próxima vez que tiverem internet (conferem a cada 15 min) e só
baixam o que mudou. Depois rode `node testes/test-tela.js`: ele confere arquivos,
hashes, QRs e a duração do loop.

**Mídia**: `arquivo`, `tipo` (`imagem` ou `video`), `duracao` (vídeo), `bytes`,
`hash` (12 primeiros caracteres do sha256 do arquivo), `dono` (anunciante que
paga a exibição) e `qr`: lista de `{anuncio, x, y, lado}` em pixels da arte
1920×1080 (em vídeo, também `de`/`ate` em segundos). A arte do anunciante precisa
ter um quadrado branco onde o QR vai.

**Anunciante**: entrada em `anuncios` com `nome` e `destino` (WhatsApp, cardápio…).

**Cota por horário e cidade**: no `loop`, no lugar de uma mídia fixa:

```json
{ "cota": "pico-1", "opcoes": [
  { "midia": "hamburgueria", "das": "18:00", "ate": "23:00", "cidades": ["campinas"],
    "periodo": { "inicio": "2026-12-01", "fim": "2026-12-31" } },
  { "midia": "t02", "segundos": 14 }
] }
```

Toca a primeira opção que bater com horário, dia (`dias`: 0 = domingo) e cidade.
Faixa que vira a noite (`"21:00"` a `"02:00"`) conta como a noite do dia em que
começou. Se nenhuma opção bater, a cota é pulada.

## O que o painel mede
- **Horas de tela**: player tocando com a tela visível.
- **Horas rodando**: tela ligada com o carro em movimento, pela vibração do
  tablet (janelas de 10 s). As faixas ficam guardadas, então o limiar pode ser
  recalibrado depois da primeira semana sem mexer nos tablets.
- **Scans**: uma pessoa por anúncio, carro e dia; no máximo 6 por carro por hora.
- **Bônus**: pontos = horas rodando × peso + scans × peso; o valor do mês é
  dividido pelos pontos.

## Limites
Plano grátis do Firestore: 20 mil gravações e 50 mil leituras por dia. Com envio
de hora em hora e sinal de vida a cada 10 min, cabe uns 150 tablets ligados o dia
todo. Acima disso: plano Blaze (centavos por tablet) e um resumo diário no
servidor para o painel não ler lote por lote.
