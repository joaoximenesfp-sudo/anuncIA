# Testes

O app não sobe aqui (precisa do Firebase), então os testes leem o `index.html`,
extraem a função por casamento de chaves e rodam ela no Node com o DOM
simulado. É feio, mas pega bug de verdade sem precisar de navegador.

```
node testes/checar.js          # estrutura: tags, CSS, parse, ids órfãos
node testes/test-barra-lote.js
```

Rode o `checar.js` sempre antes de subir. Tag desbalanceada ou chave de CSS
aberta derruba a página inteira em produção, e nenhum teste de função pega isso.

> Estes arquivos viviam fora do repositório e se perderam quando a máquina de
> trabalho foi reciclada. Por isso agora moram aqui.
