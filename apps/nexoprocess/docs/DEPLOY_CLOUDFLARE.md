# Publicar no Cloudflare Pages

> Estado: **não publicado**. O repositório não tinha integração com o Cloudflare Pages; a configuração abaixo foi preparada e o build foi validado localmente, mas o deploy exige login na conta do titular.

## Integração com Git (recomendado)
1. Cloudflare Dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git** → selecione `felipegndelrio-pixel/code-del-rio`.
2. Configuração de build:

| Campo | Valor |
|---|---|
| Production branch | `main` (ou a branch escolhida) |
| Framework preset | None |
| Build command | `npm run nexo:build` |
| Build output directory | `apps/nexoprocess/dist` |
| Root directory | *(vazio — raiz do repositório)* |
| Variável de ambiente | `NODE_VERSION` = `22` |

3. Deploy. O Pages instala as dependências pelo `package-lock.json` da raiz.

**SPA:** sem `404.html` no build, o Pages serve `index.html` para rotas do app (comportamento padrão documentado em “Serving Pages”). Não há `_redirects`.

**Cabeçalhos:** `apps/nexoprocess/public/_headers` vai para o build (CSP, `X-Frame-Options`, cache imutável de `/assets/*`, `no-cache` em `sw.js` e `index.html`).

**Subcaminho:** para servir em `/algo/`, defina `VITE_BASE=/algo/` no build. Para hospedagem sem fallback de SPA, `VITE_ROUTER=hash`.

## Alternativa: deploy direto (Wrangler)
```bash
npm ci && npm run nexo:build
npx wrangler pages deploy apps/nexoprocess/dist --project-name nexoprocess
```
(Exige `wrangler login` do titular.)

## Verificação pós-deploy (manual)
1. Abrir a URL HTTPS → landing → “Ver demonstração fictícia”.
2. DevTools → Application → Manifest/Service Workers: instalável; Network: nenhuma chamada externa.
3. Instalar no Android (Chrome: “Instalar app”) e no iPhone (Safari: Compartilhar → “Adicionar à Tela de Início”).
4. Conferir os cabeçalhos com `curl -I https://SEU-DOMINIO/`.

## Netlify / GitHub Pages
O app existente na raiz continua com `netlify.toml` e `.github/workflows/pages.yml` intactos. O NexoProcess não altera esses fluxos.
