# vendor/

Código de terceiros que o sistema carrega direto no navegador, sem `npm install`.

## vercel-blob-upload.js

A função `upload()` do [`@vercel/blob`](https://github.com/vercel/storage) **2.8.2**
(`@vercel/blob/client`), empacotada para o navegador. O Publicar do Instagram usa para
mandar o vídeo do celular direto para o Vercel Blob (as funções da Vercel recebem no máximo
4,5 MB por pedido), em partes, com novas tentativas e o progresso. Só carrega quando alguém
publica um vídeo.

O servidor (`api/insta.js`) assina o token do envio no mesmo formato da 2.8.2
(`generateClientTokenFromReadWriteToken`): ao trocar de versão aqui, confira que o formato
do token e o `x-api-version` (13) continuam os mesmos.

Para refazer:

```sh
mkdir /tmp/blob && cd /tmp/blob && npm init -y
npm install --ignore-scripts @vercel/blob@2.8.2 esbuild@0.25.5
echo "export { upload } from '@vercel/blob/client';" > entrada.mjs
npx esbuild entrada.mjs --bundle --format=esm --platform=browser --target=es2020 \
  --minify --legal-comments=eof --outfile=vercel-blob-upload.js
```

(e pôr de volta o cabeçalho de comentários do arquivo atual).

Pacotes dentro e licenças (cópias em `licencas/`): `@vercel/blob` 2.8.2 e `@vercel/oidc`
3.8.10 (Apache-2.0); `jose` 5.10.0, `async-retry` 1.3.3, `retry` 0.13.1, `throttleit` 2.1.0,
`is-buffer` 2.0.5 e `is-node-process` 1.2.0 (MIT).
