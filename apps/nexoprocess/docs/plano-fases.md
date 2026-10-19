# Plano por fases — release do NexoProcess

Base: [`baseline.md`](baseline.md). **Um PR por fase**, aberto só com os checks da fase verdes; fase grande vira PRs temáticos, nunca fases juntas.
Cada PR sai de uma branch `fase-N-…` a partir da branch padrão (`claude/plataforma-gestao-projetos-vni4py`) e volta para ela.

Checks antes de cada PR (saída anexada ao PR):
`npm run nexo:typecheck && npm run lint && npm run nexo:test && npm run nexo:build`, mais `npm run typecheck && npm run test:unit` da raiz (regressão do outro app).

## Decisões aprovadas (fechadas)

1. PR 1 = Fase 0. Um PR por fase.
2. Manifesto **sem** `orientation: "portrait-primary"` (hoje `"any"`; será omitido ou mantido como `"any"`).
3. **SRI omitido**, com justificativa e gatilhos de revisão em `docs/security-headers.md`.
4. **Prettier fora do CI**: `format` opt-in, `.editorconfig`, `.vscode/settings.json`; no máximo `prettier --check` em arquivos alterados. Nunca formatar o repositório inteiro.
5. **CSP só no cabeçalho HTTP**, com **teste em CI que falha o build** se o cabeçalho estiver ausente ou divergente. Sem esse teste, a Fase 2 não avança.
6. **`VITE_PUBLIC_ORIGIN`** com padrão `https://nexoprocess.pages.dev`; canonical, `og:url` e `og:image` absolutos; OG ligado desde já.

---

## Fase 0 — Linha de base · PR 1

`docs/baseline.md`, `docs/plano-fases.md`, dados em JSON. Sem código de produção.

## Fase 1 — Build e distribuição · PR 2

| Item | Plano |
|---|---|
| Single-file fora da produção | Já atendido (§1 do baseline). O script de prévia ganha o nome pedido (ver pergunta P2). |
| `manualChunks` | Grupos explícitos: `react` (react, scheduler), `react-dom`, `react-router`, `redux` (`@reduxjs/toolkit`, `react-redux`, `immer`, `reselect` — carregado só junto com os gráficos), `recharts` (+ d3, es-toolkit, decimal.js, victory-vendor), `bpmn` (bpmn-js e família), `exceljs`, `jszip`, `lucide` (ver P4). **Não haverá chunk `xlsx`**: a biblioteca não é usada. |
| `<script type="module" … crossorigin>` e `modulepreload` da entrada | Já emitidos pelo Vite; verificados no teste abaixo. |
| `React.lazy` + `Suspense` com fallback acessível | Já atendido nas rotas pedidas. Verificar que o fallback (`Spinner`) tem `role="status"` e `aria-live="polite"`; ajustar se faltar. |
| Verificação automatizada | Script `check-bundle` que lê `dist/index.html` e **falha** se `recharts`, `bpmn-js`, `exceljs` ou `jszip` estiverem nos arquivos iniciais, se o HTML passar de 5 KB ou se o inicial passar de **400 KB gzip** (meta de trabalho: ≤ 130 KB). Entra no CI. |

**Check:** HTML < 5 KB; inicial < 400 KB gzip; `check-bundle` verde; home com LCP < 2 s no perfil do `perf.mjs` (4G lento + CPU 4×) e Lighthouse antes/depois; E2E completo verde.

## Fase 2 — Segurança · PR 3

| Item | Plano |
|---|---|
| CSP no `_headers` | Política exata do prompt, mantendo também `worker-src 'self'` e `manifest-src 'self'` (necessárias ao service worker e ao manifesto; não afrouxam nada). Mudanças: `base-uri 'none'`, `font-src 'self'` (sai `data:`). |
| **Teste do cabeçalho em CI** | O `vite preview` passa a servir os cabeçalhos do próprio `public/_headers` (mesma fonte publicada). Script `check-headers` faz `curl -I` e **falha** se a CSP faltar ou divergir da política esperada (arquivo único de referência). Ver P1 para o deploy real. |
| Scripts inline | Já não há. `theme-init.js` continua externo e antes do bundle. |
| `<meta name="referrer">` e `<noscript>` com privacidade | Implementar. |
| Entrada maliciosa | **Decisão B (Fase 2):** o SVG do relatório continua inline (`dangerouslySetInnerHTML` justificado no código e coberto por teste), porque as tabelas do relatório não repetem os textos do diagrama e `<img>` os tiraria dos leitores de tela; `<img>` + tabela ficam para a Fase 7. E2E com CSV e XLSX contendo `<script>`, `<img onerror>`, `javascript:`, `=cmd|'/C calc'!A0`, aba e cabeçalho maliciosos, e `.xlsm` com macro: nada executa, nada é injetado no DOM, texto literal. |
| `docs/security-headers.md` | Cabeçalhos, motivo de CSP só no cabeçalho, verificação em CI, SRI omitido e quando revisitar (CDN, script de terceiros, polyfill externo). |

**Check:** `check-headers` verde no CI; console sem violação de CSP em todas as rotas; `<noscript>` visível com JS desligado; E2E de entrada maliciosa verde.

## Fase 3 — PWA · PR 4

| Item | Plano |
|---|---|
| Manifesto | Já gerado. Confirmar `start_url`/`scope` equivalentes a `/app` e `/` (hoje relativos, para funcionar com `VITE_BASE`); sem `orientation` restritiva. |
| Ícones e `<head>` | Já existem: `icons/favicon.svg` (do `Logo`), `apple-touch-icon.png` 180×180, 192, 512, maskable. |
| "Installable" | O Lighthouse 12 removeu a categoria PWA. Verificação automatizada pelo protocolo do Chrome (`Page.getInstallabilityErrors` deve voltar vazio) num E2E. |
| Android e iOS | Teste em aparelho real **por você** (não há aparelho no ambiente). |

## Fase 4 — SEO e compartilhamento · PR 5

| Item | Plano |
|---|---|
| `VITE_PUBLIC_ORIGIN` | Padrão `https://nexoprocess.pages.dev`; injetado no HTML no build. |
| Canonical, OG, Twitter Card | Ligados desde já, com URLs absolutas. |
| `og.png` 1200×630 | Gerado localmente com a identidade atual. |
| Descrição | Fonte única em `brand.ts`, alinhada a "Do processo na planilha ao plano de melhoria." |
| `robots.txt` | Corrige D5; `Disallow: /app` para a área do app não competir com a landing. |
| Deploy em `pages.dev` e validação externa do OG | **Depende de você** (P5). |

## Fase 5 — Boot e higiene · PR 6

`#root` com `min-height: 100vh` (e `100dvh` onde houver suporte), `<html dir="ltr">`, `<meta name="color-scheme" content="dark light">`, `format-detection`, `.nvmrc` + `engines` (Node 22, como o CI), `.editorconfig`, `.vscode/settings.json`, `format` opt-in, `analyze`. Sem `preconnect` (não há domínio externo). Nomes de scripts: ver P2.

## Fase 6 — Qualidade e testes · PR 7

- Unitários já existentes mapeados aos nomes do prompt (`Nf`/`jf` → `compareScenarios`; `Pf` → `businessCases`; `Id`/`kd`/`Cd` → `readImportFile` e mapeamento). Completar o que faltar.
- Os 5 fluxos críticos já têm E2E; reunir num `fluxos-criticos.spec.ts` legível, sem duplicar os demais.
- **axe em 390 px e 1366 px**, **incluindo o diagrama**, nas 4 telas (home, mapa, diagnóstico, formulários): zero *serious*/*critical*. Hoje D2 e D3 reprovariam, então a Fase 6 vem acompanhada das correções da Fase 7 ou expõe as falhas.
- `docs/ci.md` com o pipeline.

## Fase 7 — UX/UI · PR 8

Corrigir D2, D3, D4; **relatório: tabela "Atividades por etapa" (nome, etapa, tipo, responsável, duração, Lean), SVG do mapa como `<img>` com `alt`, `style=` do SVG inline para classes e CSP com `style-src 'self'` (follow-up da decisão B da Fase 2)**; um `<h1>` por rota (teste); foco visível; tokens de contraste; estado offline; importação grande sem travar (medir antes de mover para Web Worker); estados de carregamento/vazio/erro com os componentes existentes. Testes em Safari iOS e Chrome Android: **por você**.

**Check:** Lighthouse móvel home — Desempenho ≥ 90, Acessibilidade ≥ 95, Boas práticas ≥ 95, SEO ≥ 90; mapa — Desempenho ≥ 80, Acessibilidade ≥ 95.

## Fase 8 — Docs e release · PR 9

`README.md` reescrito; `docs/architecture.md`, `docs/privacy.md`, `docs/security-headers.md`, `docs/release-checklist.md`, `CHANGELOG.md`; versão em fonte única (P3); checklist completo; **tag `vX.Y.Z` só com sua autorização**.

---

## Perguntas antes da Fase 1 (adaptações que tocam o que você especificou)

- **P1 — Teste da CSP "no deploy de preview":** ainda não existe deploy no Cloudflare (falta token). Proposta em duas camadas: (a) agora, no CI, `curl -I` contra o `vite preview` servindo o mesmo `_headers` — **bloqueia o PR**; (b) quando o Cloudflare estiver conectado, o mesmo script roda contra a URL `*.pages.dev` do deploy de preview. A camada (a) atende à condição da Fase 2 até o deploy existir?
- **P2 — Nomes de scripts:** `dev`, `build`, `test`, `lint`, `typecheck` da raiz **pertencem ao outro app** do repositório (Plataforma de Gestão de Projetos). Renomeá-los quebraria esse app e o CI. Proposta: manter o prefixo `nexo:` (`nexo:dev`, `nexo:build`, `nexo:build:single`, `nexo:preview`, `nexo:typecheck`, `nexo:test`, `nexo:e2e`, `nexo:analyze`, `nexo:format`). `lint` continua global.
- **P3 — Fonte única de versão:** o `package.json` da raiz tem a versão do outro app (0.1.0); a do NexoProcess está em `brand.ts` (0.4.0). Proposta: criar `apps/nexoprocess/package.json` mínimo (`private`, `type: module`, `version`) e fazer o `brand.ts` ler a versão dele.
- **P4 — Chunk `lucide`:** hoje cada tela carrega só os ícones que usa. Um chunk único de ícones carregaria todos na primeira visita. Proposta: fazer como pedido, **medir**, e se o inicial crescer, manter os ícones por tela e reportar com números antes de decidir.
- **P5 — Publicação:** o deploy em `nexoprocess.pages.dev` exige seu token do Cloudflare (ou a conexão do repositório pelo painel) e que o nome do projeto `nexoprocess` esteja livre na sua conta. Até lá, OG e canonical ficam corretos no HTML, mas a validação externa fica pendente.
