# Linha de base — NexoProcess (Fase 0)

Medido em 2026-10-19 no commit `79014f4`, branch `claude/plataforma-gestao-projetos-vni4py` (que é a branch padrão do repositório; não existe `main`).
Ambiente: Linux, Node 22.22.0, npm 10.9.4, Vite 8 (Rolldown), Chromium do Playwright. Instalação limpa com `npm ci` (746 pacotes, 16 s); build com `npm run nexo:build` (3,3 s).

## 1. Premissas do prompt × código real

| Premissa do prompt | Situação real | Fonte |
|---|---|---|
| Produção é um único `index.html` com bundle inline | **Não.** O build de produção já é multiarquivo e hasheado. O single-file existe só em `npm run nexo:build:preview-file` (prévia/demonstração offline). | `vite.config.ts` (`SINGLEFILE`), `dist/index.html` = 1,73 KB |
| App usa Redux Toolkit | **Não usa.** O `@reduxjs/toolkit`, `react-redux`, `immer` e `reselect` vêm como dependências internas do **Recharts 3**. O estado do app é React Context + IndexedDB. | `node_modules/recharts/package.json`, `grep` em `src` |
| App usa `xlsx` (SheetJS) | **Não usa.** Planilhas são lidas e escritas com `exceljs`. | `package.json`, `grep` em `src` |
| Componentes `Bs`, `Vs`, `_n`, `Nf`, `Pf`, `Id`, `kd`… | São nomes **minificados** do bundle da prévia. No código-fonte os equivalentes são `Spinner`, `Empty`, `compareScenarios`, `businessCases`, `readImportFile` etc. | `src/components/ui.tsx`, `src/domain/*`, `src/io/*` |
| Bloqueio de `javascript:` (`_n`) | Não existe nem é necessário hoje: nenhum `href` vem de dado do usuário. O único `href` dinâmico vem de uma constante de configuração. | `grep href= src` |
| Script de tema inline | Já é arquivo externo `public/theme-init.js` (448 bytes), carregado antes do bundle. | `index.html` |
| CSP inviável | Já existe CSP via cabeçalho em `public/_headers` (Cloudflare Pages), com `script-src 'self'`. Não há meta CSP. | `public/_headers` |
| Sem PWA | Já há manifesto (gerado pelo `vite-plugin-pwa`), ícones 180/192/512/maskable e service worker com atualização por aviso. | `src/config/manifest.ts`, `dist/sw.js` |

## 2. Tamanho do build atual

| Medida | Valor |
|---|---|
| `dist/index.html` | **1.730 bytes** |
| Carregamento inicial (JS + CSS referenciados no HTML) | **768,6 KB brutos / 228,7 KB gzip** em 7 arquivos |
| Todos os chunks JS + CSS | 2.334 KB brutos / 686,8 KB gzip |
| Service worker (precache) | 65 arquivos, 2.470 KB |

Carregamento inicial, arquivo por arquivo (gzip nível 9):

| Arquivo | Bruto | Gzip | Observação |
|---|---|---|---|
| `index-*.js` (entrada) | 312,2 KB | 98,7 KB | react-dom, react-router, código do app |
| **`charts-*.js`** | **389,7 KB** | **110,1 KB** | **Recharts inteiro na primeira visita (defeito)** |
| `ui-*.js` | 21,5 KB | 7,9 KB | componentes de interface |
| `factory-*.js`, `tobe-*.js`, runtime | 9,9 KB | 4,2 KB | domínio usado pela demonstração |
| `index-*.css` | 35,4 KB | 7,8 KB | |

## 3. Causa raiz do peso inicial

A regra `manualChunks` envia `recharts` e `d3-*` para o chunk `charts`. O Rolldown coloca nesse mesmo chunk as dependências compartilhadas que o Recharts usa, **incluindo o próprio `react`** (`react.production.js`, 7,8 KB), `clsx`, `use-sync-external-store` e `react-is`. Como toda página precisa de React, a entrada importa `charts` estaticamente. O resultado é que os 390 KB do Recharts carregam em todas as telas, inclusive na landing, que não tem gráfico.

Evidência: o Lighthouse aponta **93 KiB de JavaScript não usado só em `charts-*.js`** (de 110 KiB) na home.

`bpmn-js`, `exceljs` e `jszip` **já ficam fora** do carregamento inicial: não aparecem no HTML nem nos imports estáticos da entrada.

## 4. Dependências de produção por peso (bytes minificados no bundle)

| Pacote | Bytes | Chunk | Carregado em |
|---|---|---|---|
| `exceljs` | 921.221 | `exceljs` | Importar, Exportar XLSX, modelo XLSX (sob demanda) |
| código do app | 412.946 | vários | — |
| `recharts` (+ d3, es-toolkit, decimal.js, RTK, immer…) | ~390.000 | `charts` | **todas as telas (defeito)** |
| `react-dom` | 206.833 | entrada | todas |
| `jszip` | 95.837 | `jszip.min` | Exportar ZIP de mapas (sob demanda) |
| `bpmn-js` + `diagram-js` + `bpmn-moddle` + `moddle*` + `saxen` + `tiny-svg` + `didi` | ~186.000 | `bpmn` | Mapa, Relatório, Exportar (sob demanda) |
| `react-router` | 38.234 | entrada | todas |
| `lucide-react` | 20.393 | vários (por ícone) | — |
| `workbox-window` | 5.548 | próprio | registro do service worker |

Detalhe completo por chunk: [`baseline-bundle.json`](baseline-bundle.json).

## 5. Rotas e bibliotecas

| Rota | Carregamento | Bibliotecas pesadas |
|---|---|---|
| `/` (landing) | na entrada | — |
| `/app` (meus projetos) | na entrada | — |
| `/app/novo` (assistente) | `lazy` | — |
| `/app/novo/formulario` (formulário) | `lazy` | — |
| `/app/importar` | `lazy` | `exceljs` (import dinâmico em `io/parse.ts`) |
| `/app/ajuda` | `lazy` | — |
| `/app/p/:id/visao-geral`, `dados`, `validar`, `recomendacoes`, `tobe`, `plano`, `riscos`, `responsabilidades`, `automacao` | `lazy` por aba | — |
| `/app/p/:id/mapa` | `lazy` | `bpmn-js` (`bpmn/render.ts`) |
| `/app/p/:id/diagnostico`, `comparar`, `resultados`, `simulacao` | `lazy` | `recharts` (`components/charts.tsx`) |
| `/app/p/:id/exportar` | `lazy` | `jszip`, `exceljs`, `bpmn-js` (sob demanda) |
| `/app/p/:id/relatorio` | `lazy` | `bpmn-js` (SVG dos mapas) |

## 6. Lighthouse (perfil móvel padrão, 4G simulado, Lighthouse 12.8.2)

| Página | Desempenho | Acessibilidade | Boas práticas | SEO | LCP | Peso total |
|---|---|---|---|---|---|---|
| `/` | **88** | 100 | 100 | 91 | 3,1 s | 311 KiB |
| `/app` | 91 | **95** | 100 | 91 | 3,0 s | — |
| `/app/p/:id/mapa` | não medido | — | — | — | — | — |

O mapa precisa de um projeto salvo no IndexedDB, e o Lighthouse abre um perfil limpo. A medição do mapa entra no plano (perfil pré-carregado).

Itens reprovados no Lighthouse:
- `unused-javascript` (home): 149 KiB evitáveis, 93 KiB no chunk `charts`.
- `render-blocking-resources`: ~450 ms (CSS e `theme-init.js`; o script de tema é intencional para evitar flash).
- `robots-txt`: **29 erros**. Não existe `robots.txt` e o fallback de SPA devolve o `index.html`.
- `link-name` (`/app`, celular): **os links "Meus projetos" e "Ajuda" do cabeçalho ficam sem nome acessível** quando o texto é escondido no celular. Os testes axe rodam só em 1366 px e não pegaram isso.

## 7. Outros achados

- **Cabeçalhos no preview:** `vite preview` não aplica `public/_headers` (exclusivo do Cloudflare). `curl -I` no preview não mostra CSP. Os E2E injetam a CSP manualmente para testar.
- **`dangerouslySetInnerHTML`:** um uso, em `ReportPage.tsx`, com o SVG do mapa gerado pelo `bpmn-js`, que contém nomes de atividades digitados pelo usuário. Precisa de teste com nomes maliciosos.
- **HTML:** sem `canonical`, Open Graph, Twitter Card, `<meta name="color-scheme">`, `format-detection` e `dir`. O `<noscript>` existe, mas não fala de privacidade. A descrição não coincide com o título da landing.
- **`#root`:** `min-height: 100%` (não `100vh`/`100dvh`).
- **Projeto:** sem `.nvmrc`, `engines`, Prettier ou script de análise de bundle.
- **Testes existentes:** 102 unitários (métricas, comparação, casos, parser, normalização, CSV), 52 E2E em 7 perfis de largura, axe em 19 telas nos dois temas (só desktop).

## 8. Como reproduzir

```bash
npm ci
npm run nexo:build
npx vite build --config apps/nexoprocess/vite.config.ts --outDir /tmp/analise --sourcemap
npx source-map-explorer@2.5.3 "/tmp/analise/assets/*.js" --json --no-border-checks
npm run nexo:preview   # em outro terminal
CHROME_PATH=/caminho/do/chromium npx lighthouse@12.8.2 http://127.0.0.1:4180/ --only-categories=performance,accessibility,best-practices,seo
```
