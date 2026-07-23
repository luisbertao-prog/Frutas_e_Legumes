# Comparador de Legumes e Frutas — Cloudflare Pages

## Publicação recomendada: GitHub + Cloudflare Pages

1. Crie um repositório no GitHub e envie todos os ficheiros deste projeto, mantendo as pastas `public` e `functions`.
2. No painel Cloudflare, abra **Workers & Pages**.
3. Selecione **Create application > Pages > Connect to Git**.
4. Escolha o repositório.
5. Em **Build settings** configure:
   - Framework preset: `None`
   - Build command: deixar vazio
   - Build output directory: `public`
6. Publique. O endereço ficará semelhante a `https://frutas-e-legumes.pages.dev`.
7. Teste a função em `https://SEU-SITE.pages.dev/api/search?q=tomate`.

## Publicação por computador com Wrangler

```bash
npm install
npx wrangler login
npm run deploy
```

Atenção: o carregamento por arrastar ficheiros no painel Cloudflare Pages publica apenas o site estático e não publica a pasta `functions`. Para a pesquisa online, use GitHub ou Wrangler.

## Limitação dos preços

Os hipermercados podem bloquear consultas automáticas, exigir localização, sessão ou carregar os preços por APIs privadas. Quando isso ocorrer, a aplicação apresenta um botão para abrir a pesquisa oficial da loja. Não há garantia de que todas as lojas devolvam preços em cada pesquisa.
