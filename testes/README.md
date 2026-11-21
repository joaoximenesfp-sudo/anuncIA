# Testes

O app não sobe aqui (precisa do Firebase), então os testes leem o `index.html`,
extraem a função por casamento de chaves e rodam ela no Node com o DOM
simulado. É feio, mas pega bug de verdade sem precisar de navegador.

```
node testes/checar.js          # estrutura: tags, CSS, parse, ids órfãos
node testes/test-barra-lote.js
node testes/test-ficha.js      # leitura da ficha técnica a partir do nome
node testes/test-link-catalogo.js  # link do catálogo sai sempre pelo endereço público
node testes/test-gasto-rapido.js   # "45 gasolina" vira valor, nome, categoria e parcelas
node testes/test-tela.js           # tela nos carros: horário/cidade, contagem, bônus, pacote e o /q dos QRs
node testes/test-insta.js          # Instagram da loja: login da Meta, token cifrado, post/carrossel/story e a legenda
node testes/test-tema.js           # datas comemorativas: o dia certo, a próxima vez de cada uma e o menu do Gerar anúncio
node testes/test-desconto.js       # análise de preço: dias no estoque, parecidas vendidas e em estoque, sugestão e piso do custo
node testes/test-busca.js          # busca do Gerar anúncio: palavras em qualquer ordem, sem acento, "#12" pelo número
node testes/test-ml.js             # Mercado Livre: autorização (PKCE), tokens cifrados e renovados, foto, atributos, validação, preço/situação e pedidos
node testes/test-captcha.js        # imagem de confirmação do login: código sem letra que confunde, só desenho, resposta conferida no servidor, validade
node testes/test-ml-ficha.js       # o que vai preenchido para o Mercado Livre: descrição, tela pelo modelo, código do processador, máquina igual
```

Rode o `checar.js` sempre antes de subir. Tag desbalanceada ou chave de CSS
aberta derruba a página inteira em produção, e nenhum teste de função pega isso.

> Estes arquivos viviam fora do repositório e se perderam quando a máquina de
> trabalho foi reciclada. Por isso agora moram aqui.
