# Linha de base — NexoProcess (Fase 0)

Medido em 2026-10-19 sobre o commit `79014f4` (código de produção inalterado desde então).
Branch padrão do repositório: `claude/plataforma-gestao-projetos-vni4py` (não existe `main`).
Ambiente: Linux, Node 22.22.0, npm 10.9.4, Vite 8 (Rolldown), Chromium do Playwright.
Instalação limpa: `npm ci` (746 pacotes, 16 s). Build: `npm run nexo:build` (3,3 s).

Plano de execução por fase: [`plano-fases.md`](plano-fases.md).

## 1. Estado do `vite-plugin-singlefile`

- **Instalado e inativo no build de produção.** Só é ativado com `SINGLEFILE=true`, pelo script `npm run nexo:build:preview-file` (saída em `dist-single/`, usada na prévia e no app offline em zip).
- O build de produção (`npm run nexo:build`, saída em `dist/`) já é **multiarquivo com hash**: `dist/index.html` tem **1.730 bytes** e carrega `<script type="module" crossorigin src="/assets/index-[hash].js">` com `modulepreload` dos chunks iniciais.

## 2. Premissas do prompt × código real

| Premissa | Situação real | Fonte |
|---|---|---|
| Produção é um único `index.html` com bundle inline (2–4 MB) | Não. Ver §1. Inicial = 228,7 KB gzip. | `vite.config.ts`, `dist/` |
| App usa Redux Toolkit | Não usa. `@reduxjs/toolkit`, `react-redux`, `immer` e `reselect` são dependências internas do **Recharts 3**. O estado do app é React Context + IndexedDB. | `node_modules/recharts/package.json`; `grep` em `src` |
| App usa `xlsx` (SheetJS) | Não usa. Leitura e escrita de planilhas com `exceljs`. | `package.json`; `grep` em `src` |
| Componentes `Bs`, `Vs`, `Cs`, `_n`, `_c`, `Nf`, `jf`, `Pf`, `Id`, `kd`, `Cd`, `sc()`, `nc` | Nomes **minificados** do bundle da prévia. Equivalentes no código-fonte: `Spinner`, `Empty`, `Card`, `Connectivity`, `compareScenarios`, `businessCases`, `readImportFile`, `Logo`, `BRAND` etc. | `src/components/ui.tsx`, `src/domain/*`, `src/io/*`, `src/config/brand.ts` |
| Bloqueio de `javascript:` (`_n`) | Não existe nem é necessário hoje: nenhum `href` vem de dado do usuário; o único `href` dinâmico vem de constante de configuração. | `grep href= src` |
| Script de tema inline | Já é `public/theme-init.js` (448 bytes), carregado antes do bundle. | `index.html` |
| CSP | Já existe por cabeçalho em `public/_headers` (Cloudflare Pages), com `script-src 'self'`. Sem `<meta>` CSP. | `public/_headers` |
| PWA | Manifesto gerado pelo `vite-plugin-pwa`, ícones 180/192/512/maskable, service worker com atualização por aviso, `orientation: "any"`. | `src/config/manifest.ts`, `dist/sw.js` |

## 3. Tamanho do build atual

| Medida | Valor |
|---|---|
| `dist/index.html` | **1.730 bytes** |
| Carregamento inicial (JS + CSS referenciados no HTML) | **768,6 KB brutos / 228,7 KB gzip**, 7 arquivos |
| Todos os chunks JS + CSS | 2.334 KB brutos / 686,8 KB gzip |
| Precache do service worker | 65 arquivos, 2.470 KB |

Carregamento inicial (gzip nível 9):

| Arquivo | Bruto | Gzip | Conteúdo |
|---|---|---|---|
| `index-*.js` (entrada) | 312,2 KB | 98,7 KB | react-dom, react-router, código do app |
| **`charts-*.js`** | **389,7 KB** | **110,1 KB** | **Recharts inteiro + React (defeito, §4)** |
| `ui-*.js` | 21,5 KB | 7,9 KB | componentes de interface |
| `factory`, `tobe`, runtime | 9,9 KB | 4,2 KB | domínio da demonstração |
| `index-*.css` | 35,4 KB | 7,8 KB | |

## 4. Causa raiz do peso inicial

A regra `manualChunks` envia `recharts` e `d3-*` para o chunk `charts`. O Rolldown coloca nesse chunk as dependências compartilhadas que o Recharts usa, **incluindo o próprio `react`**, além de parte do `react-dom`, `clsx`, `use-sync-external-store` e `react-is`. Como toda página precisa de React, a entrada importa `charts` estaticamente. Resultado: **o Recharts carrega em todas as telas**, inclusive na landing, que não tem gráfico.

Confirmado por duas ferramentas independentes:
- `vite-bundle-visualizer`: `react` (16.175 bytes), `react-dom` (6.738), `use-sync-external-store` (5.313) e `clsx` (661) dentro de `charts`.
- `source-map-explorer`: `react/cjs/react.production.js` (7.788 bytes minificados) dentro de `charts`.
- Lighthouse: **93 KiB de JavaScript não usado só em `charts-*.js`**, na home e no mapa.

`bpmn-js`, `exceljs` e `jszip` **já estão fora** do carregamento inicial (não aparecem no HTML nem nos imports estáticos da entrada).

## 5. Dependências de produção por peso

Bytes **minificados** no bundle (`source-map-explorer`):

| Pacote | Bytes | Chunk | Quando carrega |
|---|---|---|---|
| `exceljs` | 921.221 | `exceljs` | Importar, Exportar XLSX, modelo XLSX (sob demanda) |
| código do app | 412.946 | vários | — |
| `recharts` + dependências (d3, es-toolkit, decimal.js, RTK, immer…) | ~390.000 | `charts` | **todas as telas (defeito)** |
| `react-dom` | 206.833 | entrada | todas |
| `jszip` | 95.837 | `jszip.min` | Exportar ZIP de mapas (sob demanda) |
| `bpmn-js`, `diagram-js`, `bpmn-moddle`, `moddle*`, `saxen`, `tiny-svg`, `didi` | ~186.000 | `bpmn` | Mapa, Relatório, Exportar (sob demanda) |
| `react-router` | 38.234 | entrada | todas |
| `lucide-react` | 20.393 | vários (por ícone) | — |
| `workbox-window` | 5.548 | próprio | registro do service worker |

Detalhes: [`baseline-bundle.json`](baseline-bundle.json) (source-map-explorer, por chunk) e [`baseline-visualizer.json`](baseline-visualizer.json) (vite-bundle-visualizer, por pacote, renderizado e gzip).

## 6. Rotas × bibliotecas pesadas

| Rota | Carregamento | Biblioteca pesada |
|---|---|---|
| `/` (landing) | na entrada | — (mas recebe o Recharts por causa do §4) |
| `/app` (meus projetos) | na entrada | — (idem) |
| `/app/novo` (assistente) | `lazy` | — |
| `/app/novo/formulario` | `lazy` | — |
| `/app/importar` | `lazy` | `exceljs` (import dinâmico em `io/parse.ts`); **não há `xlsx`** |
| `/app/ajuda` | `lazy` | — |
| `/app/p/:id/visao-geral`, `dados`, `validar`, `recomendacoes`, `tobe`, `plano`, `riscos`, `responsabilidades`, `automacao` | `lazy` por aba | — |
| `/app/p/:id/mapa` | `lazy` | `bpmn-js` (`bpmn/render.ts`) |
| `/app/p/:id/diagnostico`, `comparar`, `resultados`, `simulacao` | `lazy` | `recharts` (`components/charts.tsx`) |
| `/app/p/:id/exportar` | `lazy` | `jszip`, `exceljs`, `bpmn-js` (sob demanda) |
| `/app/p/:id/relatorio` | `lazy` | `bpmn-js` (SVG dos mapas) |

## 7. Desempenho medido

### Lighthouse 12.8.2, perfil móvel padrão (4G lento simulado, CPU 4×)

| Página | Desempenho | Acessibilidade | Boas práticas | SEO | LCP |
|---|---|---|---|---|---|
| `/` | **88** | 100 | 100 | 91 | 3,1 s |
| `/app` | 91 | **95** | 100 | 91 | 3,0 s |
| `/app/p/:id/mapa` | **78** | **92** | 100 | 91 | 3,7 s |

O mapa foi medido com um perfil do Chromium já contendo a demonstração (`--disable-storage-reset`).

### Script próprio (`scripts/perf.mjs`): 390×844, CPU 4×, 1,6 Mbps / 150 ms, sem cache

| Página | FCP | LCP | CLS | Transferido |
|---|---|---|---|---|
| `/` | 1.976 ms | 1.976 ms | 0,015 | 306 KB |
| `/app` | 1.908 ms | 2.056 ms | 0,001 | 306 KB |
| `/app/novo` | 1.868 ms | 2.200 ms | 0 | 319 KB |
| visão geral do projeto | 1.664 ms | 1.948 ms | 0,003 | 358 KB |
| mapa | 1.660 ms | 2.004 ms | 0,02 | 434 KB |

Dados: [`desempenho-baseline.json`](desempenho-baseline.json). As duas medições divergem porque o Lighthouse usa simulação (Lantern) e o script mede a página real com limitação de rede e CPU.

## 8. Defeitos e achados

| # | Achado | Evidência | Fase do plano |
|---|---|---|---|
| D1 | **Recharts no carregamento inicial de todas as telas** | §4 | 1 |
| D2 | **Links "Meus projetos" e "Ajuda" sem nome acessível no celular** (o texto some e não há `aria-label`) | Lighthouse `link-name` em `/app` e no mapa | 7 |
| D3 | **Selos "gargalo"/"retrabalho" do mapa com contraste 2,66:1** (texto `#111` sobre âmbar escuro, 11 px) | Lighthouse `color-contrast` no mapa; o axe dos E2E exclui `.djs-container` | 7 |
| D4 | **Mapa no celular abre com o quadro vazio**: o diagrama fica centralizado num quadro de 574 px e só aparece rolando | captura a 390 px; diagrama em y = 796 com quadro a partir de y = 572 | 7 |
| D5 | **Sem `robots.txt`**: o fallback de SPA devolve HTML (29 erros) | Lighthouse `robots-txt` | 4 |
| D6 | `vite preview` não aplica `public/_headers` (exclusivo do Cloudflare): `curl -I` no preview não mostra CSP | `curl -I http://127.0.0.1:4180/` | 2 |
| D7 | `dangerouslySetInnerHTML` com o SVG do mapa no relatório (contém nomes digitados pelo usuário); sem teste com entrada maliciosa | `ReportPage.tsx:144` | 2 |
| D8 | Sem `canonical`, Open Graph, Twitter Card, `color-scheme` em meta, `format-detection`, `dir`; `<noscript>` sem menção à privacidade; descrição ≠ título da landing | `dist/index.html` | 2, 4, 5 |
| D9 | `#root` com `min-height: 100%` (não `100vh`) | `src/styles/index.css` | 5 |
| D10 | Sem `.nvmrc`, `engines`, Prettier, `.editorconfig` e script de análise de bundle | raiz do repositório | 5 |
| D11 | Testes axe só em 1366 px e excluindo o diagrama; por isso D2 e D3 passaram | `tests/e2e/a11y.spec.ts` | 6 |

**Já existente e verificado:** 102 testes unitários, 52 E2E em 7 larguras, axe em 19 telas nos dois temas (desktop), interceptação de rede externa em todos os E2E, CSP aplicada nos E2E por injeção.

## 9. Como reproduzir

```bash
npm ci
npm run nexo:build
npx -y vite-bundle-visualizer@1.2.1 -c apps/nexoprocess/vite.config.ts -t raw-data -o /tmp/stats.json
npx vite build --config apps/nexoprocess/vite.config.ts --outDir /tmp/analise --sourcemap
npx -y source-map-explorer@2.5.3 "/tmp/analise/assets/*.js" --json --no-border-checks
npm run nexo:preview          # outro terminal, porta 4180
node apps/nexoprocess/scripts/perf.mjs
CHROME_PATH=/caminho/chromium npx -y lighthouse@12.8.2 http://127.0.0.1:4180/ --only-categories=performance,accessibility,best-practices,seo
```
