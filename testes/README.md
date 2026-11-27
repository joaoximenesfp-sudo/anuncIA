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
node testes/test-avaliacoes.js     # avaliações dos clientes: convite por venda, uma avaliação por link, só aparece depois de aprovada, arquivo em caminho secreto
node testes/test-etiqueta.js       # etiqueta com QR: números "101-110", próximo livre pulando os impressos, o que vai escrito e o endereço do QR
node testes/test-etiqueta-pdf.js   # etiquetas em PDF: quantas cabem na A4, uma por página no rolo, o PDF lido de volta e o botão da barra de seleção
node testes/test-search-console.js # Search Console: o arquivo de verificação do Google segue na raiz, sem redirecionamento
node testes/test-blog.js           # blog e página de cada máquina: notícias, artigo, sitemap, foto, ficha só com campos públicos e a lista do Google Shopping
node testes/test-google-busca.js   # Google (busca) no Insights: só sócio, passo a passo sem a chave, passe assinado pela conta de serviço, números do período e do anterior, buscas e páginas
node testes/test-endereco.js       # loja no endereço principal: o "/" do techcampinas.com.br mostra o catálogo, o do sistema segue o sistema e fica fora do Google
node testes/test-fechamento.js     # fechamento do mês: vendas, comparação, origem, quem vendeu, compras por sócio, estoque no fim do mês e o texto do WhatsApp
node testes/test-compra-usados.js  # "Compramos seu usado" no catálogo: a mensagem do WhatsApp, quando a seção aparece e as opções no sistema
node testes/test-maquina.js        # página da máquina (QR da etiqueta): só sócio grava, só campos públicos, um aparelho não desfaz o outro, o que aparece para quem escaneia
node testes/test-pecas-qr.js       # peças com etiqueta: número P1, P2… separado das máquinas, QR #p=, sem custo na etiqueta, sem etiqueta, cadastro pelo QR e a conferência do estoque
node testes/test-novidade.js       # novidade no catálogo: a data de quando entrou (ou chegou) fica entre as publicações, selo por 7 dias, na frente da lista e no topo
node testes/test-janelas.js        # janelas: toda parte do cabeçalho e do corpo tem estilo, o corpo rola por dentro (tabela pros vendedores e recibo) e o fundo fecha
```

Rode o `checar.js` sempre antes de subir. Tag desbalanceada ou chave de CSS
aberta derruba a página inteira em produção, e nenhum teste de função pega isso.

> Estes arquivos viviam fora do repositório e se perderam quando a máquina de
> trabalho foi reciclada. Por isso agora moram aqui.
