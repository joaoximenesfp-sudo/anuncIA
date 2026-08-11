# Bot de finanças no Telegram

Lançar gasto mandando mensagem, em vez de abrir o site e preencher formulário.

```
você  ▸ almoço 32
bot   ▸ ✅ R$ 32,00 · Almoço
        🍽️ Alimentação · 💠 Pix
        📅 ago/2026
```

O gasto cai em `financas_var` no mesmo formato que o botão **+ Adicionar** da
aba Finanças grava (`addVar()`, index.html:5797) — então aparece no extrato, no
gráfico por categoria e no total do mês como qualquer outro lançamento.

---

## O que tem aqui

| Arquivo | Papel |
|---|---|
| `parser.js` | **Fonte da verdade.** Transforma texto solto em documento do Firestore. |
| `parser.test.js` | 29 testes do parser (valores, parcelas, categorias, fuso). |
| `build-workflow.js` | Gera o workflow embutindo o parser. |
| `telegram-financas.json` | **Gerado.** É o que você importa no n8n. Não edite. |
| `workflow.test.js` | 17 testes do nó Code já gerado (trava de chat, /ajuda, formato do item). |

```bash
node bot/parser.test.js      # ✓ 29 testes passaram
node bot/workflow.test.js    # ✓ 17 testes do workflow passaram  (regera o JSON antes)
```

Mexeu no parser? Rode `node bot/build-workflow.js` e reimporte o JSON no n8n.

---

## Instalação

### 1. Criar o bot no Telegram

No Telegram, fale com [@BotFather](https://t.me/BotFather) → `/newbot` → escolha
nome e username. Ele devolve um token tipo `8123456789:AAH...`.

Você já tem uma credencial **Telegram account** no n8n. Se o token for de outro
bot, crie uma nova credencial (tipo *Telegram API*) e reaponte o nó depois de
importar.

### 2. Dar acesso do n8n ao Firestore

O bot escreve como **conta de serviço**, não como você. Isso tem uma
consequência que vale entender: conta de serviço **ignora as regras do
`firestore.rules`**. A regra que garante `userId == request.auth.uid` não vai te
proteger aqui — se o `USER_ID` estiver errado, o gasto grava num limbo que o
site nunca lê, sem erro nenhum. Por isso o passo 4 importa.

No [Firebase Console](https://console.firebase.google.com/project/anuncia-70b88/settings/serviceaccounts/adminsdk)
→ Configurações do projeto → Contas de serviço → **Gerar nova chave privada**.
Baixa um JSON com `client_email` e `private_key`.

No n8n, credencial do tipo **Google Service Account API**:

- **Service Account Email** → o `client_email` do JSON
- **Private Key** → a `private_key` do JSON (inteira, com o `-----BEGIN...`)
- **Scopes** → `https://www.googleapis.com/auth/datastore`

Você já tem duas credenciais Google no n8n. Se alguma delas já aponta pro
projeto `anuncia-70b88` com esse scope, reaproveite.

### 3. Importar o workflow

n8n → **Import from File** → `bot/telegram-financas.json`.

Seis nós: recebe mensagem → interpreta → grava → confirma.

### 4. Descobrir seu UID do Firebase

O caminho mais curto: [Firebase Console → Authentication → Users](https://console.firebase.google.com/project/anuncia-70b88/authentication/users).
A coluna **Identificador do usuário** na linha do `joaoximenesfp@gmail.com` é o UID.

Confirme que é o certo: no Firestore, abra qualquer documento de `financas_var`
que você já lançou pelo site e veja se o campo `userId` bate. Se bater, é esse.

Abra o nó **Interpretar gasto** e preencha:

```js
const USER_ID = 'cole_o_uid_aqui';
```

### 5. Travar o bot no seu chat

**Não pule isto.** Bot do Telegram é público: qualquer pessoa que descubra o
username escreve nas suas finanças.

Ative o workflow, mande qualquer mensagem pro bot. Como o `USER_ID` ainda não
está configurado — ou já está, e aí é só olhar a execução no n8n — ele responde
com o seu chat id. Cole no mesmo nó:

```js
const CHAT_ID_PERMITIDO = '123456789';
```

A partir daí, mensagem de qualquer outro chat é descartada em silêncio: o bot
não responde nada, nem confirma que existe.

### 6. Ativar

Ligue o workflow e mande `almoço 32`.

---

## Como escrever

Não tem sintaxe. Escreve como você mandaria pra alguém.

| Você manda | Vira |
|---|---|
| `almoço 32` | Almoço · R$ 32,00 · Alimentação · Pix |
| `mercado 342,90 debito` | Mercado · R$ 342,90 · Alimentação · Débito |
| `tênis 459,90 10x` | Tênis · R$ 459,90 · Vestuário · Crédito Parcelado 10x |
| `gastei 25 no lanche` | Lanche · R$ 25,00 · Alimentação · Pix |
| `R$ 89 farmácia` | Farmácia · R$ 89,00 · Saúde · Pix |
| `aluguel 1.500` | Aluguel · R$ 1.500,00 · Casa · Pix |

**Pagamento** — `pix`, `debito`, `credito`, `dinheiro`, `carina`. Sem dizer nada,
vai Pix. Escreveu `3x`? Vira Crédito Parcelado sozinho.

**Categoria** — sai da palavra: `uber` → Transporte, `farmácia` → Saúde,
`aluguel` → Casa. O que não bater cai em **Outro** (não inventa categoria).
A lista de palavras está em `CATEGORIA_KEYWORDS` (`parser.js`) — adicionar as
suas é uma linha.

**Valor** — `120,50` e `120.50` são a mesma coisa; `1.500` é mil e quinhentos.
Se tiver mais de um número, vale o último.

**Não entendeu?** Ele responde explicando e **não grava nada**. Nunca inventa
valor pra tentar acertar.

`/ajuda` mostra tudo isso no chat.

---

## Limites conhecidos

**Não dá pra desfazer pelo bot.** Errou o valor, tem que abrir o site e excluir.
Por isso a confirmação repete tudo que foi gravado — é sua chance de conferir na
hora. Um `/desfazer` é a próxima coisa natural a fazer aqui: precisa guardar o id
do último documento no static data do workflow e ligar um nó de delete.

**Data não é gravada, só o mês.** `financas_var` guarda `mes` (`YYYY-MM`), não o
dia — é o modelo do app, não uma limitação do bot. Por isso "ontem" e "hoje" são
ignorados no texto. Na prática só faz diferença se você lançar no dia 1º um gasto
do último dia do mês anterior; nesse caso, lance pelo site.

**O mês usa o fuso de São Paulo, não UTC.** Sem isso, gasto feito depois das 21h
do dia 31 iria pro mês seguinte e sumiria da sua tela do mês. Tem teste pra isso.

**Só gastos variáveis.** Contas fixas (`financas_fixas`) e as carteiras C6/Mercado
Pago continuam pelo site — são fluxos com regra própria (vencimento, baixa,
saldo acumulado) que não cabem numa linha de texto.

**Verifique os nós ao importar.** O parser e a lógica do nó Code estão testados
localmente (46 testes), mas o servidor n8n caiu durante a construção e não deu
pra rodar o workflow de ponta a ponta lá dentro. Os nomes dos parâmetros dos nós
do Telegram e do Firestore vieram da documentação, não de uma execução real — se
algum campo aparecer vazio depois de importar, é só preencher na tela: coleção
`financas_var`, projeto `anuncia-70b88`, operação `create`.
