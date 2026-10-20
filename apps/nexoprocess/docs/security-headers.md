# Cabeçalhos de segurança — NexoProcess

Fonte: [`public/_headers`](../public/_headers) (Cloudflare Pages), espelhado em [`vercel.json`](../vercel.json) para a Vercel, que não lê `_headers`. O teste `tests/api/vercel-headers.test.ts` falha se os dois divergirem. A política é verificada em CI contra o servidor real (`wrangler pages dev`). Diagnóstico e medições: [`fase-2-diagnostico.md`](fase-2-diagnostico.md).

```
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
```

## Por que cada diretiva

| Diretiva | Valor | Por quê | Evidência |
|---|---|---|---|
| `default-src` | `'self'` | Tudo vem da própria origem. O app não usa CDN, API nem script de terceiros. | `connect-src 'self'` sem violações nas 23 rotas |
| `script-src` | `'self'` | Sem `'unsafe-inline'` e sem `'unsafe-eval'`: todo script é arquivo. Por isso o tema é aplicado por `public/theme-init.js`, externo e não minificado (auditável), carregado antes do bundle para não haver flash. | `nexo:test:csp` falha se o HTML tiver `<script>` inline ou se o `theme-init.js` vier depois do bundle; nenhum `eval`/`new Function` no bundle |
| `style-src` | `'self' 'unsafe-inline'` | **Único motivo medido:** o SVG do mapa no relatório é inserido como HTML (`ReportPage.tsx`, decisão B da Fase 2) e traz atributos `style=` (325 na demonstração). React e bpmn-js aplicam estilo via CSSOM, o que a CSP permite: sem `'unsafe-inline'`, mapa, gráficos, assistente e exportações não geram nenhuma violação. Não há nonce no fluxo atual (site estático). | Varredura com `style-src 'self'`: violações só no relatório (§3 do diagnóstico) |
| `img-src` | `'self' data: blob:` | `data:`: CSS do bpmn-js (`content:url("data:image/svg+xml…")`). `blob:`: exportação PNG, em que o SVG vira `blob:`, depois `<img>` e por fim canvas (`bpmn/render.ts`). | Exportação PNG sem violação em `nexo:test:csp:rotas` |
| `font-src` | `'self'` | Fontes IBM Plex servidas como `.woff2` do próprio bundle. Saiu `data:`: nenhuma fonte embutida. | CSS do build só referencia `/assets/*.woff2` |
| `connect-src` | `'self'` | O app só chama a própria origem: o precache do service worker e, no build de venda, `/api/license` (mesma origem, sem domínio extra). | — |
| `worker-src` | `'self'` | O único worker é o service worker (`/sw.js`). **Sem `blob:`:** jszip e exceljs **não** criam workers; as menções a `importScripts` nos chunks `zip-*` e `xlsx-*` são polyfills de `setImmediate` que só testam se estão num worker. | Nenhum `new Worker` no bundle; ZIP e XLSX exportados sem violação |
| `manifest-src` | `'self'` | Manifesto do PWA (`/manifest.webmanifest`). | — |
| `object-src` | `'none'` | Bloqueia `<object>`/`<embed>` (plugins, PDF/Flash/Java embutidos). | — |
| `base-uri` | `'none'` | Não há `<base>`. Impede que HTML injetado mude a base de URLs relativas. | — |
| `frame-ancestors` | `'none'` | Ninguém embute o app (anti-clickjacking). `X-Frame-Options: DENY` cobre navegadores antigos. | — |
| `form-action` | `'self'` | Nenhum formulário envia dados para fora. | — |

**Demais cabeçalhos:**
- `nosniff` impede que o navegador adivinhe o tipo do arquivo.
- `X-Frame-Options: DENY` é redundante com `frame-ancestors`, mas protege navegadores antigos.
- `Referrer-Policy` é repetida em `<meta name="referrer">` para valer também no arquivo único, que não tem cabeçalhos.
- `Permissions-Policy` desliga câmera, microfone, geolocalização e pagamento, que o app não usa.

## Por que a CSP fica só no cabeçalho (sem `<meta>`)

- `frame-ancestors` não funciona em `<meta>`.
- Uma única fonte (`_headers`) evita divergência.
- Os E2E leem a política desse mesmo arquivo (`tests/e2e/helpers.ts`).

## SRI (Subresource Integrity) — omitido de propósito

Todos os scripts e estilos são da própria origem, com hash no nome (`/assets/*-[hash].js`) e servidos pelo mesmo deploy que serve o HTML. O SRI protege contra um terceiro (CDN) que altere o arquivo; aqui não há terceiro.

**Revisitar** se entrar CDN, script ou estilo de terceiros, ou polyfill externo. Nesse caso: `integrity` + `crossorigin`, e a origem nova na diretiva correspondente.

## Como é testado

| Comando | O que faz | Onde roda |
|---|---|---|
| `npm run nexo:test:csp` | Sobe `wrangler pages dev dist` (porta 8788) e faz `fetch` de `/`, de uma rota profunda (`/app/p/teste/mapa`, fallback de SPA) e de `/theme-init.js`. Compara a CSP **diretiva a diretiva** com a política esperada (sem fonte a mais nem a menos, sem diretiva extra, sem `'unsafe-eval'`) e confere os outros 4 cabeçalhos. No HTML, confere: nenhum `<script>` inline, `theme-init.js` antes do bundle, `<meta name="referrer">` e `<noscript>`. Limite de 60 s; encerra o wrangler ao final. | CI, job `checks`, após o build |
| `npm run nexo:test:csp:rotas` | Mesmo servidor, com Chromium e **service worker ativo**. Percorre 23 rotas (todas as abas do projeto da demonstração, inclusive o relatório) e baixa 5 exportações (PNG, SVG, XLSX, CSV, BPMN). Falha em qualquer violação de CSP (evento `securitypolicyviolation` ou mensagem no console). Termina com um **controle positivo**: um script inline precisa ser bloqueado e reportado, senão o teste falha (provando que a CSP estava ativa). | CI, job `nexoprocess-e2e`, após os E2E |
| `tests/e2e/security.spec.ts` | 6 arquivos maliciosos, `.xlsm` com macro, `<noscript>` e ausência de flash de tema. | CI, E2E |

**Contra o deploy real** (quando existir `*.pages.dev`):

```bash
TEST_BASE_URL=https://<deploy>.pages.dev npm run nexo:test:csp
TEST_BASE_URL=https://<deploy>.pages.dev npm run nexo:test:csp:rotas
```

**Limite dos E2E:** eles injetam a CSP por `page.route` sobre o `vite preview`, que não aplica `_headers`. Navegações servidas pelo service worker não passam por `page.route`, e por isso a varredura com cabeçalho real é o `nexo:test:csp:rotas`.

**Telemetria do wrangler:** desligada nos testes (`WRANGLER_SEND_METRICS=false`). O estado local fica em `.wrangler/` (ignorado pelo git).

## Arquivo único (`nexo:build:single`) — sem CSP

O arquivo único (`dist-single/`, demonstração offline e prévia) **não tem CSP**: aberto como arquivo ou dentro de outro host, não recebe os cabeçalhos do `_headers`, e seus scripts são inline (incompatíveis com `script-src 'self'`). Isso é aceito: o arquivo único é demonstração, não produção. Continuam valendo o `<meta name="referrer">`, a ausência de chamadas externas e o processamento 100% local.

## Entrada maliciosa (auditoria da Fase 2)

- **Texto do usuário** é sempre renderizado pelo React, que escapa por padrão.
- **Único `dangerouslySetInnerHTML`:** SVG do relatório, gerado pelo bpmn-js. Os nomes entram como texto de `<tspan>` e saem escapados. Está justificado no código e coberto por teste.
- **Hyperlinks** de planilhas são descartados na importação (só o texto da célula é lido).
- **Fórmulas** não são importadas, só o valor em cache.
- **CSV exportado:** recebe apóstrofo antes de `= + - @`.
- **XLSX exportado:** grava valores, nunca fórmulas do usuário nem hyperlinks.
- **`.xlsm`:** é lido só pelos valores. O VBA é ignorado, e a importação avisa: "Macros do arquivo são ignoradas; só os valores das células são lidos".
- **Hrefs:** nenhum vem de dado do usuário (só constantes e `blob:` de arquivos gerados pelo próprio app).
- **Armazenamento:** `localStorage` guarda só o tema; nenhuma senha ou token é armazenado.
