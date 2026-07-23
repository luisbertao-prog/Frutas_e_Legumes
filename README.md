# Comparador de Legumes e Frutas - Cloudflare Pages

## Configuração correta no Cloudflare

Crie um projeto **Pages** ligado ao GitHub.

- Framework preset: None
- Build command: `npm run build`
- Build output directory: `public`
- Root directory: deixar vazio
- Deploy command: deixar vazio / apagar

O Cloudflare Pages deteta automaticamente a pasta `functions` e publica a rota:

`/api/search?q=tomate`

Não utilize `npm run deploy`, `wrangler deploy` nem `wrangler pages deploy` como comando de deploy no painel quando estiver a usar a integração Git do Pages.
